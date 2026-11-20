import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceptionService} from './service.mjs';
import {createFirebaseResultWriter} from './firebase.mjs';
import {createMemoryStore} from './store.mjs';
import {hash} from './schema.mjs';
import {exactCaseScore, seminarPointsAt, tutorialGuide, SEMINAR_GRADING_VERSION} from './seminar-journey.mjs';
import {resolveLegalCitation} from './correspondence-legal-sources.mjs';
import {createSyntheticReceptionCases} from '../../../scripts/reception-ai-qa-cases.mjs';
import {executionQAProfiles} from '../../../scripts/reception-execution-qa.mjs';

const learner={uid:'journey-test-12345',studentKey:'12345'};
const other={uid:'journey-test-22222',studentKey:'22222'};
const options={context:'seminar',workbookVersion:2,decisionVersion:'correspondence-v1',controlVersion:'execution-v1'};
const startBody=(stage,requestId='start-'+stage)=>({...options,op:'start',
  mode:stage==='independent'?'independent':'training',journeyStage:stage,locale:'ru',requestId});
const err=code=>error=>error.code===code;
const ledger='seminarProgress/'+hash('student:'+learner.studentKey);
const journal='rudn-platform/v1/grades/'+learner.studentKey+'/seminar-5';
const attemptPath=id=>'rudn-platform/v1/attempts/'+learner.studentKey+'/'+id;

function fixture({store=createMemoryStore(),caseIds,reviews=[]}={}) {
  const cases=createSyntheticReceptionCases().filter(c=>!caseIds||caseIds.includes(c.id));
  const example=cases.find(c=>c.id==='complaint-routing');
  example.datePackId='a';
  example.rubric.authored.knowledge={...example.rubric.authored.knowledge,number:'59',actDate:'2006-05-02',articles:['8']};
  const adverts=cases.find(c=>c.id==='ads-consent');
  if(adverts)adverts.rubric.authored.knowledge={...adverts.rubric.authored.knowledge,number:'38',actDate:'2006-03-13',articles:['18']};
  const calls=[],reviewCalls=[];
  const provider={
    name:'scripted-journey',
    generate(){throw Error('The automated walkthrough must not need the actor');},
    reviewDecision(){throw Error('A tutorial must not call the reviewer');},
    async answerMentor(input){calls.push(input);return {reply:'Уточните компетенцию по материалам дела.',usage:{inputTokens:10,outputTokens:5}};},
    async reviewMentorWork(input){
      reviewCalls.push(input);
      const planned=reviews[reviewCalls.length-1];
      return {...(typeof planned==='function'?await planned(input):planned||{ready:true,feedback:'Связь с материалами установлена.'}),
        usage:{inputTokens:10,outputTokens:5}};
    }
  };
  const db={ref:path=>({async transaction(update){
    const result=await store.transaction(path,update);
    return {snapshot:{val:()=>result.value}};
  }})};
  const create=()=>createReceptionService({store,cases,provider,correspondenceProfiles:executionQAProfiles,requireGameplay:true,
    saveResult:createFirebaseResultWriter(db),clock:()=>Date.UTC(2026,10,20)});
  const handle=create().handle;
  const start=(stage,requestId,identity=learner)=>handle(startBody(stage,requestId),identity);
  const send=(view,body,identity=learner)=>handle({sessionId:view.id,expectedRevision:view.revision,...body},identity);
  const finish=view=>handle({op:'next',sessionId:view.id,requestId:'finish'},learner);
  const answer=(view,stepId,choiceId,requestId='step-'+view.revision)=>send(view,{op:'tutorial-step',stepId,choiceId,requestId});
  const recover=(stage,identity=learner)=>{
    const {requestId,locale,...body}=startBody(stage);
    return create().handle({...body,op:'recover',buildId:'b'.repeat(32)},identity);
  };
  async function guide(view){
    const c=(await store.get('sessions/'+view.id)).caseData[0];
    return tutorialGuide(c,executionQAProfiles.private(c),'ru',{execution:true});
  }
  return {store,handle,start,send,recover,finish,answer,guide,calls,reviewCalls};
}

async function walkthrough(h,view,{before}={}) {
  const guide=await h.guide(view);
  const journals=[];
  for(const step of guide.steps.slice(view.guidance.stepIndex)){
    if(step.id===before)break;
    const correct=step.choices.find(choice=>choice.correct);
    assert.ok(correct,step.id);
    const useExample=view.journeyStage==='mentor'&&['draft','control-memo','control-request','control-evidence','control-status'].includes(step.id);
    view=(useExample?await h.send(view,{op:'tutorial-step',requestId:'step-'+view.revision,stepId:step.id,useExample:true})
      :await h.answer(view,step.id,correct.id)).view;
    journals.push(view.controlWorkflow?.journal.at(-1)?.outcome);
  }
  return {view,journals};
}

test('the three stages enforce their order, show separate guidance and restore the exact unfinished session',async()=>{
  const h=fixture();
  await assert.rejects(h.start('mentor'),err('journey_stage_locked'));
  await assert.rejects(h.start('independent'),err('journey_stage_locked'));
  await assert.rejects(h.handle({...startBody('independent'),journeyStage:undefined},learner),err('journey_stage_required'));
  await assert.rejects(h.handle({...startBody('independent'),controlVersion:undefined},learner),err('invalid_control_version'));
  const ready=await h.recover('example');
  assert.equal(ready.view,null);
  assert.deepEqual(ready.seminarProgress,{exampleCompleted:false,mentorCompleted:false,seminarPoints:0,remainingCases:7});

  const [first,repeated]=await Promise.all([h.start('example'),h.start('example','other-tab')]);
  const second=(await h.start('example','second-learner',other)).view;
  let view=first.view;
  assert.equal(view.id,repeated.view.id);
  assert.equal(view.case.id,'complaint-routing');
  assert.deepEqual(view.case,second.case);
  assert.deepEqual(view.guidance,second.guidance);
  assert.equal(view.guidance.steps[0].correctChoiceId,'role');
  await assert.rejects(h.finish(view),err('not_reviewed'));
  await assert.rejects(h.answer(view,'review','verified'),err('tutorial_step_locked'));
  await assert.rejects(h.send(view,{op:'decide',requestId:'forged-draft',decision:{}}),err('tutorial_step_required'));
  await assert.rejects(h.send(view,{op:'mentor-question',requestId:'forged-mentor',text:'Ответ'}),err('mentor_unavailable'));
  await assert.rejects(h.send(view,{op:'tutorial-step',requestId:'other-user',stepId:'reception',choiceId:'role'},other),err('forbidden'));

  const exampleResult=await walkthrough(h,view);
  view=exampleResult.view;
  assert.equal(view.status,'review');
  const law=view.decision.correspondence.citations.find(citation=>citation.kind==='legal');
  assert.deepEqual(law.unitIds,['law59999-u52']);
  assert.ok((await resolveLegalCitation(law)).text.includes(law.quote));
  assert.deepEqual(view.decision.correspondence.orders[0].recipientIds,['independent-review']);
  assert.equal(view.decision.correspondence.orders[0].dueDate,view.decision.deadline);
  assert.ok(view.control.statuses.every(row=>row.evidenceSourceIds.length));
  assert.ok(exampleResult.journals.includes('request_received'));
  assert.ok(exampleResult.journals.includes('evidence_verified'));
  assert.ok(exampleResult.journals.includes('closed'));
  view=(await h.finish(view)).view;
  assert.equal(view.result.points,undefined);
  assert.equal(view.result.journalStatus,'local');
  assert.equal(view.seminarProgress.exampleCompleted,true);
  assert.equal((await h.recover('example')).view,null);
  assert.equal((await h.start('example','repeat-example')).view.id,view.id);
  assert.equal(await h.store.get(journal),null);

  const mentor=(await h.start('mentor')).view;
  assert.notEqual(mentor.case.id,view.case.id);
  assert.equal(mentor.guidance.steps[0].correctChoiceId,undefined);
  const wrong=(await h.answer(mentor,'reception','assume')).view;
  assert.equal(wrong.guidance.stepIndex,0);
  assert.equal(wrong.guidance.finding.correctChoiceId,'role');
  assert.equal(wrong.result,null);
  await assert.rejects(h.start('independent'),err('journey_stage_locked'));
  await assert.rejects(h.answer(mentor,'reception','role','stale'),err('revision_conflict'));
  const question={op:'mentor-question',requestId:'ask-1',text:'Как выбрать исполнителя?'};
  const coached=(await h.send(wrong,question)).view;
  assert.deepEqual(coached.messages,mentor.messages);
  assert.equal(coached.mentorMessages.length,2);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].guide.caseTitle,mentor.case.title);
  assert.equal(h.calls[0].guide.control,undefined);
  await h.send(wrong,question);
  assert.equal(h.calls.length,1);
  const restored=(await h.recover('mentor')).view;
  assert.deepEqual(restored,coached);
  const completedMentor=(await h.finish((await walkthrough(h,restored)).view)).view;
  assert.equal(completedMentor.result.points,undefined);
  assert.equal(completedMentor.seminarProgress.mentorCompleted,true);
  assert.equal(await h.store.get(journal),null);

  const independent=(await h.start('independent')).view;
  assert.ok(![view.case.id,mentor.case.id].includes(independent.case.id));
  assert.equal(independent.guidance,undefined);
  assert.equal(independent.mentorMessages,undefined);
  assert.equal((await h.start('independent','reroll')).view.id,independent.id);
  assert.equal((await h.recover('independent')).view.id,independent.id);
  await assert.rejects(h.answer(independent,'reception','role'),err('tutorial_unavailable'));
  await assert.rejects(h.send(independent,{op:'mentor-question',requestId:'ask-2',text:'Реши это дело'}),err('mentor_unavailable'));
  assert.equal(h.calls.length,1);
});

test('the fixed walkthrough saves an addressed reply and keeps the assignment and calendar separate',async()=>{
  const copies=[
    {locale:'ru',dateLocale:'ru-RU',greeting:name=>`Уважаемый ${name}!`,subject:'О рассмотрении жалобы на действия начальника отдела',
      complaint:/доводы вашего предыдущего обращения/,independent:/руководитель департамента рассмотрит вашу жалобу самостоятельно/i,
      unresolved:/вывод о бездействии начальника отдела не сделан/,written:/письменный ответ по адресу для переписки/,
      checklist:/предлагается направить|подготовить мотивированный ответ|регистрация своевременна/i},
    {locale:'en',dateLocale:'en-GB',greeting:name=>`Dear ${name},`,subject:'Review of your complaint about the division head',
      complaint:/points you raised in your earlier appeal/,independent:/director will review your complaint independently/,
      unresolved:/finding on the alleged inaction has yet to be made/,written:/written reply.*correspondence address/,
      checklist:/submit the file|prepare a reasoned reply|registration was timely/i},
    {locale:'zh',dateLocale:'zh-CN',greeting:name=>`尊敬的${name}：`,subject:'关于审查您对处长的投诉',
      complaint:/您此前的来信/,independent:/部门负责人将独立审查您的投诉/,unresolved:/是否存在不作为尚无结论/,
      written:/通信地址寄送书面答复/,checklist:/建议将案件材料|逐项拟定有理由的答复|登记及时/}
  ];
  for(const copy of copies){
    const h=fixture();
    const started=await h.handle({...startBody('example'),locale:copy.locale},learner);
    const {view}=await walkthrough(h,started.view);
    const {correspondence:letter,deadline}=view.decision;
    assert.equal(letter.kind,'reply');
    assert.equal(letter.subject,copy.subject);
    assert.notEqual(letter.subject,view.case.title);
    assert.ok(letter.sections.facts.startsWith(copy.greeting(view.case.citizen.name)));
    assert.match(letter.sections.facts,copy.complaint);
    assert.match(letter.sections.legalBasis,copy.independent);
    assert.match(letter.sections.resolution,copy.unresolved);
    assert.match(letter.sections.nextSteps,copy.written);
    const date=new Intl.DateTimeFormat(copy.dateLocale,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})
      .format(new Date(deadline+'T00:00:00Z'));
    assert.ok(letter.sections.nextSteps.includes(date));
    assert.doesNotMatch(Object.values(letter.sections).join(' '),copy.checklist);
    assert.equal(letter.orders[0].kind,'review');
    assert.equal(letter.orders[0].dueDate,deadline);
    assert.equal(view.guidance.decision.workbook.routing.recipientIds[0],'independent-review');
    assert.deepEqual((await h.finish(view)).view.result.cases[0].decision.correspondence,letter);
  }
});

test('with a mentor the learner can correct and retain an original draft and conclusion',async()=>{
  const h=fixture({caseIds:['complaint-routing','ads-consent'],reviews:[
    {ready:false,feedback:'Свяжите цитату с конкретным установленным фактом.'},
    ()=>{throw Error('fixture provider unavailable');},
    {ready:true,feedback:'Теперь вывод привязан к источнику.'},
    {ready:true,feedback:'Вы различили статус каждого вопроса.'}
  ]});
  await h.finish((await walkthrough(h,(await h.start('example')).view)).view);
  let {view}=await h.start('mentor');
  ({view}=await walkthrough(h,view,{before:'draft'}));
  const draft=structuredClone(view.guidance.decision);
  const submit=(stepId,fields)=>h.send(view,{op:'tutorial-step',stepId,requestId:'product-'+view.revision,...fields});
  const activeIndex=view.guidance.stepIndex;
  assert.ok(draft.correspondence.citations.some(citation=>citation.kind==='legal'));
  draft.correspondence.subject='Мой проект об уведомлении заявителя';
  draft.correspondence.sections.facts='Мой вывод подтверждается приложенной к данному делу записью.';
  const wrong={...draft,workbook:{...draft.workbook,routing:{recipientIds:[]}}};
  await assert.rejects(submit('draft',{useExample:true,decision:draft}),err('invalid_request'));
  view=(await submit('draft',{decision:wrong})).view;
  assert.equal(view.guidance.stepIndex,activeIndex);
  assert.equal(view.guidance.finding.stepId,'draft');
  assert.match(view.guidance.finding.explanation,/компетенцию/);
  assert.equal(view.decision,null);
  assert.equal((await h.recover('mentor')).view.draftDecision.correspondence.subject,draft.correspondence.subject);
  assert.equal(h.reviewCalls.length,0,'A wrong route is returned without model work');
  const ownDraftRequest={op:'tutorial-step',stepId:'draft',requestId:'checked-draft',decision:draft};
  const beforeFeedback=view;
  view=(await h.send(view,ownDraftRequest)).view;
  assert.equal(view.guidance.stepIndex,activeIndex);
  assert.match(view.guidance.finding.explanation,/конкретным установленным фактом/);
  assert.equal(view.draftDecision.correspondence.subject,draft.correspondence.subject);
  await h.send(beforeFeedback,ownDraftRequest);
  assert.equal(h.reviewCalls.length,1);
  draft.correspondence.sections.facts='Регистрационная запись устанавливает, когда было учтено обращение; её дата применяется в календаре.';
  const corrected={op:'tutorial-step',stepId:'draft',requestId:'corrected-draft',decision:draft};
  await assert.rejects(h.send(view,corrected),err('review_unavailable'));
  const recovered=(await h.recover('mentor')).view;
  assert.equal(recovered.revision,view.revision);
  assert.match(recovered.draftDecision.correspondence.sections.facts,/Регистрационная запись/);
  assert.equal(recovered.reviewPending.status,'retry');
  assert.equal(recovered.guidance.stepIndex,activeIndex);
  view=(await h.send(recovered,corrected)).view;
  assert.equal(view.status,'followup');
  assert.deepEqual(view.decision.correspondence,draft.correspondence);
  assert.equal(view.guidance.finding,undefined);
  assert.deepEqual(view.guidance.workFeedback,{stepId:'draft',text:'Теперь вывод привязан к источнику.'});
  assert.equal(h.reviewCalls.length,3);
  assert.equal(h.reviewCalls.at(-1).phase,'draft');
  assert.equal(h.reviewCalls[0].guide.currentExecution,undefined);

  ({view}=await walkthrough(h,view,{before:'control-request'}));
  const workflow=()=>h.store.get('sessions/'+view.id).then(saved=>saved.caseStates[0].controlWorkflow);
  const specs=(await workflow()).definition.issues;
  const spec=specs[0], scope=spec.id;
  const confirmation=(target=spec)=>view.controlWorkflow.materials.find(row=>target.evidenceMaterialIds.includes(row.id));
  const apply=(kind,attributes={})=>h.send(view,{op:'control-action',requestId:'own-'+view.revision,action:{
    kind,issueId:scope,reason:'Собственное объяснение ученика',...attributes
  }});
  const originalInstruction='Представьте сведения, подтверждающие выполнение именно этого требования.';
  assert.deepEqual(view.guidance.allowedControlActions,['request_evidence']);
  const stage=view.guidance.stepIndex;
  view=(await submit('control-request',{confirmOwn:true})).view;
  assert.equal(view.guidance.stepIndex,stage);
  assert.match(view.guidance.finding.explanation,/запрос/);
  await assert.rejects(apply('verify'),err('tutorial_step_required'));
  view=(await apply('request_evidence')).view;
  assert.equal(view.controlWorkflow.journal.at(-1).outcome,'request_incomplete');
  assert.ok(view.guidance.finding.explanation);
  const request={instruction:originalInstruction,recipientIds:spec.acceptedRecipientSets[0],dueDate:draft.deadline,
    expectedResult:'Проверяемые материалы о результате',evidenceSourceIds:[view.controlWorkflow.materials[0].id]};
  view=(await apply('request_evidence',request)).view;
  const original=view.controlWorkflow.journal.at(-1);
  assert.equal(original.outcome,'request_received');
  assert.equal(original.instruction,originalInstruction);
  assert.equal(view.guidance.stepIndex,stage);
  await assert.rejects(h.send(view,{op:'mentor-question',requestId:'other-issue',issueId:'another-dossier',text:'Что делать?'}),err('invalid_control_issue'));
  view=(await h.send(view,{op:'mentor-question',requestId:'ask-current-evidence',issueId:scope,text:'Какой документ теперь доступен?'})).view;
  assert.equal(h.calls.at(-1).guide.currentStep,'control-request');
  assert.equal(h.calls.at(-1).guide.selectedIssueId,scope);
  assert.equal(h.calls.at(-1).guide.currentExecution.latestAction.issueId,scope);
  assert.ok(h.calls.at(-1).guide.currentExecution.materials.some(row=>row.id===confirmation().id));
  assert.equal(h.calls.at(-1).guide.currentPracticeDraft.subject,draft.correspondence.subject);
  view=(await submit('control-request',{confirmOwn:true})).view;
  assert.equal(view.guidance.stepIndex,stage,'The second issue still needs a request');
  view=(await submit('control-request',{useExample:true})).view;
  assert.equal(view.controlWorkflow.journal.filter(row=>row.issueId===scope&&row.outcome==='request_received').length,1);
  assert.deepEqual(view.guidance.allowedControlActions,['verify']);
  for(const issue of specs){
    view=(await apply('verify',{issueId:issue.id,evidenceSourceIds:[confirmation(issue).id]})).view;
    assert.equal(view.controlWorkflow.journal.at(-1).outcome,'evidence_verified');
  }
  const reviewedJournal=view.controlWorkflow.journal;
  view=(await submit('control-evidence',{useExample:true})).view;
  assert.deepEqual(view.controlWorkflow.journal,reviewedJournal,'Applying a sample must preserve accepted original actions');
  assert.ok(view.guidance.allowedControlActions.includes('close'));
  for(const issue of specs){
    const evidence={issueId:issue.id,evidenceSourceIds:[confirmation(issue).id]};
    if(issue.deliveryRequired){
      view=(await apply('notify',{...evidence,instruction:'Сообщить заявителю конкретный итог.',expectedResult:'Ответ доставлен.'})).view;
      assert.equal(view.controlWorkflow.journal.at(-1).outcome,'notice_recorded');
    }
    view=(await apply('close',evidence)).view;
    assert.equal(view.controlWorkflow.journal.at(-1).outcome,'closed');
  }
  view=(await submit('control-status',{confirmOwn:true})).view;
  assert.equal(view.guidance.steps[view.guidance.stepIndex].id,'control-memo');
  assert.deepEqual(view.controlWorkflow.journal.find(row=>row.id===original.id),original);
  const memo=structuredClone(view.guidance.control);
  memo.text='В моём заключении указаны результаты и приложены проверенные документы по каждому вопросу.';
  const bad={...memo,statuses:[]};
  const controlIndex=view.guidance.stepIndex;
  view=(await submit('control-memo',{control:bad})).view;
  assert.equal(view.guidance.stepIndex,controlIndex);
  assert.match(view.guidance.finding.explanation,/статус/);
  assert.equal(view.draftControl.text,memo.text);
  view=(await submit('control-memo',{control:memo})).view;
  assert.deepEqual(view.control,memo);
  assert.equal(h.reviewCalls.at(-1).phase,'control');
  assert.equal(view.guidance.workFeedback.text,'Вы различили статус каждого вопроса.');
  const finished=(await h.finish((await walkthrough(h,view)).view)).view;
  assert.equal(finished.result.points,undefined);
  assert.deepEqual(finished.result.cases[0].decision.correspondence,draft.correspondence);
  assert.equal(await h.store.get(journal),null);
});

test('recovery repairs an interrupted staged assignment without choosing another dossier',async()=>{
  const store=createMemoryStore();
  let interrupted=false;
  const damaged={...store,transaction(path,update){
    if(path.startsWith('sessions/')&&!interrupted){interrupted=true;throw Error('interrupted session write');}
    return store.transaction(path,update);
  }};
  const h=fixture({store:damaged});
  await assert.rejects(h.start('example'),/interrupted session write/);
  const pending=(await store.get(ledger)).journey.example;
  const resumed=await h.recover('example');
  assert.equal(resumed.view.id,pending.sessionId);
  assert.equal(resumed.view.case.id,'complaint-routing');
  assert.equal(Object.keys((await store.get(ledger)).attempts).length,1);
});

test('new independent receipts use exact thresholds and monotonic grade and preserve historical progress',async()=>{
  const h=fixture();
  await h.store.transaction(ledger,()=>({points:4,journey:{example:{completed:true},mentor:{completed:true}}}));
  await h.store.transaction(journal,()=>({points:4,sourceAttemptId:'historical-4'}));
  const attempts=[];
  for(const [raw,rounded,expected] of [[69.99,70,0],[70,70,3],[79.99,80,3],[80,80,4],[89.99,90,4],[90,90,5]]){
    const {view}=await h.start('independent','threshold-'+String(raw).replace('.', '-'));
    // Seed a completed assessment review to isolate the exact engine-to-journal boundary.
    await h.store.transaction('sessions/'+view.id,s=>({...s,status:'review',results:[{
      score:rounded,correspondence:{phase:'complete',initial:{rawScore:raw},control:{rawScore:raw}},criteria:[],explanation:'fixture'
    }]}));
    const result=(await h.finish(view)).view.result;
    assert.equal(result.total,raw);
    assert.equal(result.points,expected);
    assert.equal(result.seminarPoints,Math.max(4,expected));
    assert.equal(result.journalStatus,'saved');
    const receipt=await h.store.get(attemptPath(result.attemptId));
    assert.equal(receipt.points,expected);
    assert.equal(receipt.summary.gradingVersion,SEMINAR_GRADING_VERSION);
    assert.equal(receipt.summary.casePoints,undefined);
    attempts.push({view,receipt});
  }
  const final=await h.store.get(journal);
  assert.equal(final.points,5);
  assert.equal(final.sourceAttemptId,attempts.at(-1).receipt.id);
  for(const {view,receipt} of attempts){
    assert.equal((await h.finish(view)).view.result.seminarPoints,5);
    assert.deepEqual(await h.store.get(attemptPath(receipt.id)),receipt);
  }
  assert.deepEqual(await h.store.get(journal),final);
  assert.equal((await h.store.get(ledger)).points,4);
  assert.equal(exactCaseScore({score:80,correspondence:{phase:'initial',rawScore:95,cap:60}}),60);
  for(const [s,points] of [[0,0],[100,5],[70,3],[80,4],[90,5]])assert.equal(seminarPointsAt(s),points);
});
