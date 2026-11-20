import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceptionService} from './service.mjs';
import {createFirebaseResultWriter} from './firebase.mjs';
import {createMemoryStore} from './store.mjs';
import {hash} from './schema.mjs';
import {exactCaseScore, seminarPointsAt, tutorialGuide, validatedTutorialMemo, SEMINAR_GRADING_VERSION} from './seminar-journey.mjs';
import {resolveLegalCitation} from './correspondence-legal-sources.mjs';
import {createSyntheticReceptionCases} from '../../../scripts/reception-ai-qa-cases.mjs';
import {executionQAProfiles} from '../../../scripts/reception-execution-qa.mjs';
import {explicitQAReview} from '../../../scripts/reception-correspondence-qa-cases.mjs';
import {MFC_SEMINAR_VERSION} from './mfc-seminar.mjs';
import {calculateWorkbookDeadline} from './workbook-calendar.mjs';
import {buildCorrespondenceReviewInstructions} from './provider.mjs';

const learner={uid:'journey-test-12345',studentKey:'12345'};
const other={uid:'journey-test-22222',studentKey:'22222'};
const options={context:'seminar',workbookVersion:2,decisionVersion:'correspondence-v1',controlVersion:'execution-v1'};
const startBody=(stage,requestId='start-'+stage)=>({...options,op:'start',
  mode:stage==='independent'?'independent':'training',journeyStage:stage,locale:'ru',requestId});
const err=code=>error=>error.code===code;
const ledger='seminarProgress/'+hash('student:'+learner.studentKey);
const journal='rudn-platform/v1/grades/'+learner.studentKey+'/seminar-5';
const attemptPath=id=>'rudn-platform/v1/attempts/'+learner.studentKey+'/'+id;

function fixture({store=createMemoryStore(),caseIds,reviews=[],guidedSeminarCore=false,reviewDecision,extraCases=[]}={}) {
  const cases=[...createSyntheticReceptionCases(),...extraCases].filter(c=>!caseIds||caseIds.includes(c.id));
  const example=cases.find(c=>c.id==='complaint-routing');
  example.datePackId='a';
  example.rubric.authored.knowledge={...example.rubric.authored.knowledge,number:'59',actDate:'2006-05-02',articles:['8']};
  const adverts=cases.find(c=>c.id==='ads-consent');
  if(adverts)adverts.rubric.authored.knowledge={...adverts.rubric.authored.knowledge,number:'38',actDate:'2006-03-13',articles:['18']};
  const calls=[],reviewCalls=[];
  const provider={
    name:'scripted-journey',
    generate(){throw Error('The automated walkthrough must not need the actor');},
    reviewDecision:reviewDecision||(()=>{throw Error('A tutorial must not call the reviewer');}),
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
  const create=()=>createReceptionService({store,cases,provider,correspondenceProfiles:executionQAProfiles,requireGameplay:true,guidedSeminarCore,
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
    return tutorialGuide(c,executionQAProfiles.private(c),'ru',{execution:true,core:Boolean(view.coreStepsVersion),coreStepsVersion:view.coreStepsVersion});
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

const coreCalendar = decision => ({deadline:decision.deadline,referralDeadline:decision.workbook.referralDeadline,
  registrationTimely:decision.workbook.registrationTimely});
const coreCitations = decision => decision.correspondence.citations.filter(row=>row.kind==='legal');
const coreSend = (h,view,stepId,data,requestId='core-'+view.revision) => h.send(view,{
  op:view.journeyStage==='independent'?'core-step':'tutorial-step',stepId,requestId,...data
});
const mfcStart=(h,stage,requestId)=>h.handle({...startBody(stage,requestId),coreStepsVersion:MFC_SEMINAR_VERSION},learner);
const mfcRecover=(h,stage)=>h.handle({...options,op:'recover',journeyStage:stage,mode:stage==='independent'?'independent':'training',
  coreStepsVersion:MFC_SEMINAR_VERSION},learner);

test('MFC sample uses separate deadlines, a real recipient and a substantive draft while preserving a legacy attempt',async()=>{
  const h=fixture({guidedSeminarCore:true});
  const legacy=(await h.start('example','before-mfc')).view;
  assert.equal(legacy.coreStepsVersion,'guided-core-v1');
  const legacySnapshot=await h.store.get('sessions/'+legacy.id);
  let {view}=await mfcStart(h,'example','mfc-sample');
  assert.notEqual(view.id,legacy.id);
  assert.equal(view.coreStepsVersion,MFC_SEMINAR_VERSION);
  assert.match(view.case.role.title,/МФЦ/);
  assert.equal(view.case.role.authorityContext.title,legacy.case.role.title);
  assert.equal(view.messages[0].text,legacy.messages[0].text);
  assert.equal(view.case.workbook.routingPolicy.allowInternal,false);
  assert.deepEqual(view.case.workbook.targets.map(row=>[row.id,row.anchorId]),[['referral','intakeRegistered'],['deadline','recipientRegistered']]);
  const dates=Object.fromEntries(view.case.workbook.events.map(row=>[row.id,row.date]));
  assert.notEqual(dates.intakeRegistered,dates.recipientRegistered);
  const recovered=await mfcRecover(h,'example');
  assert.equal(recovered.view.id,view.id);
  assert.deepEqual(recovered.legacySessions,[{id:legacy.id,journeyStage:'example'}]);
  assert.equal((await h.recover('example')).view.id,legacy.id);
  const resumed=await h.handle({context:options.context,workbookVersion:options.workbookVersion,decisionVersion:options.decisionVersion,
    op:'resume',sessionId:legacy.id},learner);
  assert.equal(resumed.view.coreStepsVersion,'guided-core-v1');
  assert.deepEqual(await h.store.get('sessions/'+legacy.id),legacySnapshot);

  view=(await h.answer(view,'reception','role')).view;
  const {decision}=view.guidance;
  for(const target of view.case.workbook.targets){
    const expected=calculateWorkbookDeadline({anchorDate:dates[target.anchorId],ruleId:target.ruleId,...target.counting});
    assert.equal(target.id==='referral'?decision.workbook.referralDeadline:decision.deadline,expected);
  }
  assert.equal(decision.workbook.routing.disposition,'forward');
  assert.ok(decision.workbook.routing.recipientIds.length);
  assert.notDeepEqual(decision.workbook.routing.recipientIds,['independent-review']);
  assert.match(decision.correspondence.sections.resolution,/сопостав|документ/);
  assert.match(decision.correspondence.sections.nextSteps,/МФЦ/);
  view=(await coreSend(h,view,'materials',{citations:coreCitations(decision)})).view;
  await assert.rejects(coreSend(h,view,'calendar',{calendar:{...coreCalendar(decision),referralDeadline:''}}),err('core_calendar_required'));
  view=(await coreSend(h,view,'calendar',{calendar:coreCalendar(decision)})).view;
  await assert.rejects(coreSend(h,view,'route',{routing:{disposition:'internal',recipientIds:[]}}),error=>['core_route_required','invalid_decision'].includes(error.code));
  view=(await coreSend(h,view,'route',{routing:decision.workbook.routing})).view;
  for(const documentId of view.guidance.steps.find(step=>step.id==='materials').documentIds)
    view=(await h.handle({op:'document',sessionId:view.id,requestId:'mfc-open-'+documentId,documentId},learner)).view;
  view=(await coreSend(h,view,'draft',{decision})).view;
  assert.equal(view.status,'followup');
  assert.equal((await h.store.get('sessions/'+view.id)).caseStates[0].controlWorkflow.initialRouting.correct,true);
});

test('several issues use one MFC reply and a referral-only draft cannot pass with full points on other criteria',async()=>{
  const sample=createSyntheticReceptionCases().find(c=>c.id==='ads-consent');
  sample.id='several-issues';
  let received,controlContext;
  const h=fixture({guidedSeminarCore:true,caseIds:['complaint-routing','several-issues'],extraCases:[sample],reviewDecision:async({context})=>{
    const review=explicitQAReview(context);
    if(context.phase==='initial'){
      received=context;
      const resolution=review.criteria.find(row=>row.id==='resolution');
      resolution.level=0;
      resolution.findings=[{type:'missing',section:'resolution',quote:'',sourceIds:['case-author-explanation'],
        explanation:'Нет вывода по вопросам транспорта и обработки данных.'}];
    }else controlContext=context;
    return {review,verified:true,usage:{inputTokens:0,outputTokens:0}};
  }});
  await h.store.transaction(ledger,()=>({bestPoints:4,guidedJourney:{example:{completed:true},mentor:{completed:true}}}));
  let {view}=await mfcStart(h,'independent','mfc-assessment');
  assert.equal(view.seminarProgress.seminarPoints,4);
  assert.equal(view.guidance,undefined);
  const guide=await h.guide(view), decision=structuredClone(guide.decision);
  assert.equal(guide.sharedReply,true);
  assert.equal(decision.workbook.routing.recipientIds.length,2);
  assert.deepEqual(decision.correspondence.orders,[]);
  assert.match(decision.correspondence.sections.resolution,/транспортного обращения.+персональные данные/);
  const citations=coreCitations(decision);
  for(const evidence of decision.correspondence.citations.filter(row=>row.kind==='document'))
    view=(await h.handle({op:'document',sessionId:view.id,requestId:'mfc-open-'+evidence.sourceId,documentId:evidence.sourceId},learner)).view;
  decision.correspondence.orders=[];
  view=(await coreSend(h,view,'materials',{citations})).view;
  view=(await coreSend(h,view,'calendar',{calendar:coreCalendar(decision)})).view;
  view=(await coreSend(h,view,'route',{routing:decision.workbook.routing})).view;
  const blank=structuredClone(decision);
  blank.correspondence.sections.resolution='';
  await assert.rejects(h.send(view,{op:'decide',requestId:'blank-resolution',decision:blank}),err('invalid_correspondence'));
  assert.equal(received,undefined);
  decision.correspondence.sections.resolution='Направим материалы по компетенции.';
  view=(await h.send(view,{op:'decide',requestId:'mfc-draft',decision})).view;
  assert.equal(view.status,'followup');
  assert.equal(view.controlWorkflow.sharedReply,true);
  assert.match(received.role,/МФЦ/);
  assert.equal(received.mfcReception.sharedReply,true);
  assert.equal(received.profile.criteria.resolution.expectedActionIds.includes('scope'),false);
  assert.equal(received.acceptablePlans.some(plan=>plan.actions.some(action=>['scope','protect','route'].includes(action.id))),false);
  assert.match(buildCorrespondenceReviewInstructions(received),/never require or award points for allocating individual questions/);
  assert.equal(received.mfcReception.authorityContext.title,view.case.role.authorityContext.title);
  assert.equal(received.sections.resolution,decision.correspondence.sections.resolution);
  assert.equal(received.operational.workbook.routing.correct,true);
  assert.deepEqual(received.operational.workbook.calendar.correct,{referral:true,deadline:true,registrationTimely:true});
  const saved=await h.store.get('sessions/'+view.id);
  const score=saved.caseStates[0].correspondenceInitialFeedback;
  assert.equal(score.criteria.find(row=>row.id==='resolution').earned,0);
  assert.equal(score.correspondence.rawScore,80);
  assert.equal(score.score,60);
  assert.match(score.correspondence.capExplanation.ru,/решение по существу/);
  assert.equal((await mfcRecover(h,'independent')).view.id,view.id);

  const specs=saved.caseStates[0].controlWorkflow.definition.issues;
  const action=(kind,issueId,params)=>h.send(view,{op:'control-action',requestId:'mfc-control-'+view.revision,
    action:{kind,issueId,reason:'Проверить подтверждение результата именно по указанному вопросу.',...params}});
  for(const spec of specs){
    const issue=view.controlWorkflow.issues.find(row=>row.id===spec.id);
    assert.equal(issue.availableActions.find(row=>row.kind==='request_evidence').requiresRecipients,false);
    assert.equal(issue.availableActions.some(row=>row.kind==='notify'),false);
    view=(await action('request_evidence',issue.id,{recipientIds:[],dueDate:decision.deadline,
      instruction:'Представить мотивированное заключение по проверке.',expectedResult:'Подтверждение результата проверки.',
      evidenceSourceIds:[issue.materialIds[0]]})).view;
    assert.equal(view.controlWorkflow.journal.at(-1).outcome,'request_received');
    const evidenceSourceIds=[spec.responseMaterialId];
    view=(await action('verify',issue.id,{evidenceSourceIds})).view;
    view=(await action('close',issue.id,{evidenceSourceIds})).view;
    assert.equal(view.controlWorkflow.journal.at(-1).outcome,'closed');
  }
  assert.equal(view.controlWorkflow.journal.some(row=>row.kind==='notify'),false);
  const current=await h.store.get('sessions/'+view.id);
  const control=validatedTutorialMemo(current.caseStates[0].controlWorkflow,executionQAProfiles.private(current.caseData[0]),guide,'ru');
  view=(await h.send(view,{op:'followup',requestId:'mfc-final-control',control})).view;
  assert.equal(view.status,'review');
  assert.ok(controlContext.execution.issues.every(issue=>!Object.hasOwn(issue,'acceptedRecipientSets')));
  view=(await h.finish(view)).view;
  assert.equal(view.result.cases[0].feedback.correspondence.controlScore,100);
  assert.equal(view.result.total,68);
  assert.equal(view.result.points,0);
  assert.equal(view.seminarProgress.seminarPoints,4);
});

test('new example requires the selected legal provision, real dates and a considered internal route',async()=>{
  const h=fixture({guidedSeminarCore:true});
  let {view}=await h.start('example');
  assert.equal(view.coreStepsVersion,'guided-core-v1');
  assert.equal(view.guidance.steps[0].id,'reception');
  assert.equal(view.guidance.steps[1].id,'materials');
  assert.equal(view.guidance.steps.find(row=>row.id==='route').panel,'route');
  await assert.rejects(coreSend(h,view,'route',{routing:{disposition:'internal',recipientIds:[]}}),err('tutorial_step_locked'));
  view=(await h.answer(view,'reception','role')).view;
  const decision=view.guidance.decision;
  const citations=coreCitations(decision);
  assert.equal(citations.length,view.case.normativeActs.length);
  await assert.rejects(coreSend(h,view,'materials',{choiceId:'sources'}),err('invalid_core_step'));
  await assert.rejects(coreSend(h,view,'materials',{useExample:true}),err('invalid_core_step'));
  await assert.rejects(coreSend(h,view,'materials',{citations:[]}),err('core_citation_required'));
  await assert.rejects(coreSend(h,view,'materials',{citations:citations.map(row=>({...row,quote:'Цитата отсутствует в источнике.'}))}),err('invalid_citation'));
  const sourceRequest='sources-stably-recorded';
  const beforeMaterials=view;
  view=(await coreSend(h,view,'materials',{citations},sourceRequest)).view;
  assert.equal(view.coreSteps.stepId,'calendar');
  assert.deepEqual(view.coreSteps.values.citations,citations);
  assert.equal(view.coreSteps.receipt.requestId,sourceRequest);
  assert.equal((await coreSend(h,beforeMaterials,'materials',{citations},sourceRequest)).view.revision,view.revision);
  assert.equal((await h.recover('example')).view.coreSteps.stepId,'calendar');
  await assert.rejects(coreSend(h,view,'calendar',{calendar:{...coreCalendar(decision),deadline:''}}),err('core_calendar_required'));
  view=(await coreSend(h,view,'calendar',{calendar:{...coreCalendar(decision),deadline:'2026-11-11'}})).view;
  assert.equal(view.coreSteps.stepId,'calendar');
  assert.equal(view.guidance.finding.stepId,'calendar');
  view=(await coreSend(h,view,'calendar',{calendar:coreCalendar(decision)})).view;
  view=(await coreSend(h,view,'route',{routing:{recipientIds:['independent-review'],disposition:'forward'}})).view;
  assert.equal(view.coreSteps.stepId,'route');
  assert.equal(view.guidance.finding.stepId,'route');
  view=(await coreSend(h,view,'route',{routing:decision.workbook.routing})).view;
  assert.equal(view.coreSteps.stepId,'draft');
  assert.deepEqual(view.coreSteps.completed,['materials','calendar','route']);
  for(const documentId of view.guidance.steps.find(row=>row.id==='materials').documentIds)
    view=(await h.handle({op:'document',sessionId:view.id,requestId:'open-'+documentId,documentId},learner)).view;
  await assert.rejects(coreSend(h,view,'draft',{useExample:true}),err('invalid_request'));
  const incomplete={...decision,correspondence:{...decision.correspondence,
    citations:decision.correspondence.citations.filter(row=>row.kind==='document'),orders:[]}};
  view=(await coreSend(h,view,'draft',{decision:incomplete})).view;
  assert.equal(view.coreSteps.stepId,'draft');
  assert.equal(view.guidance.finding.stepId,'draft');
  view=(await coreSend(h,view,'draft',{decision})).view;
  assert.equal(view.status,'followup');
  assert.equal(view.decision.correspondence.subject,decision.correspondence.subject);
  assert.equal(h.reviewCalls.length,0);
  const guide=await h.guide(view);
  const choose=stepId=>h.answer(view,stepId,guide.steps.find(row=>row.id===stepId).choices.find(row=>row.correct).id);
  const action=(kind,issueId,params)=>h.send(view,{op:'control-action',requestId:'real-'+view.revision,
    action:{kind,issueId,reason:'Проверить документ по жалобе',...params}});
  view=(await choose('control')).view;
  view=(await coreSend(h,view,'control-request',{confirmOwn:true})).view;
  assert.equal(view.coreSteps.stepId,'control-request');
  const saved=await h.store.get('sessions/'+view.id), spec=saved.caseStates[0].controlWorkflow.definition.issues[0];
  const issue=view.controlWorkflow.issues.find(row=>row.id===spec.id);
  view=(await action('request_evidence',issue.id,{recipientIds:spec.acceptedRecipientSets[0],dueDate:decision.deadline,
    instruction:'Представить заключение по жалобе.',expectedResult:'Подтверждение самостоятельного рассмотрения.',
    evidenceSourceIds:[issue.materialIds[0]]})).view;
  assert.equal(view.controlWorkflow.journal.at(-1).outcome,'request_received');
  view=(await coreSend(h,view,'control-request',{confirmOwn:true})).view;
  const evidenceSourceIds=[spec.responseMaterialId];
  view=(await action('verify',issue.id,{evidenceSourceIds})).view;
  view=(await coreSend(h,view,'control-evidence',{confirmOwn:true})).view;
  if(spec.deliveryRequired)view=(await action('notify',issue.id,{evidenceSourceIds,instruction:'Сообщить результат.',
    expectedResult:'Подтверждение доставки ответа.'})).view;
  view=(await action('close',issue.id,{evidenceSourceIds})).view;
  view=(await coreSend(h,view,'control-status',{confirmOwn:true})).view;
  const current=await h.store.get('sessions/'+view.id);
  const control=validatedTutorialMemo(current.caseStates[0].controlWorkflow,executionQAProfiles.private(current.caseData[0]),guide,'ru');
  view=(await coreSend(h,view,'control-memo',{control})).view;
  view=(await choose('review')).view;
  assert.equal(view.status,'review');
  view=(await h.finish(view)).view;
  assert.equal(view.status,'complete');
  assert.equal(view.result.points,undefined);
  assert.equal(view.seminarProgress.exampleCompleted,true);
});

test('new assessment accepts valid choices for scoring, enforces the confirmed inputs and resumes legacy work by ID',async()=>{
  const old=fixture(), h=fixture({store:old.store,guidedSeminarCore:true});
  await old.store.transaction(ledger,()=>({points:4,journey:{example:{completed:true},mentor:{completed:true}}}));
  const legacy=(await old.start('independent','old-assessed')).view;
  const oldSnapshot=await old.store.get('sessions/'+legacy.id);
  const previous=await h.recover('independent');
  assert.equal(previous.view,null);
  assert.equal(previous.legacySessionId,legacy.id);
  let {view}=await h.start('independent','new-assessed');
  assert.notEqual(view.id,legacy.id);
  assert.equal(view.seminarProgress.seminarPoints,4);
  assert.equal(view.guidance,undefined);
  assert.equal(view.mentorMessages,undefined);
  assert.equal(view.coreSteps.stepId,'materials');
  const {decision}=await h.guide(view);
  const submit=(output,requestId='final-'+view.revision)=>h.send(view,{op:'decide',decision:output,requestId});
  const validShape={...decision,correspondence:{...decision.correspondence,citations:coreCitations(decision),orders:[]}};
  await assert.rejects(submit(validShape),err('core_steps_required'));
  await assert.rejects(coreSend(h,view,'calendar',{calendar:coreCalendar(decision)}),err('core_step_locked'));
  view=(await coreSend(h,view,'materials',{citations:coreCitations(decision)})).view;
  const different='2026-11-12';
  view=(await coreSend(h,view,'calendar',{calendar:{...coreCalendar(decision),deadline:different}})).view;
  assert.equal(view.coreSteps.values.calendar.deadline,different);
  const routing={recipientIds:['rkn-at-site'],disposition:'forward'};
  view=(await coreSend(h,view,'route',{routing})).view;
  assert.equal(view.coreSteps.stepId,'draft');
  assert.equal(view.feedback,null);
  await assert.rejects(submit(validShape),err('core_calendar_required'));
  await assert.rejects(submit({...validShape,deadline:different,workbook:{...validShape.workbook,routing},
    correspondence:{...validShape.correspondence,citations:[]}}),err('core_citation_required'));
  view=(await coreSend(h,view,'calendar',{calendar:coreCalendar(decision)})).view;
  assert.equal(view.coreSteps.stepId,'draft');
  assert.equal(view.coreSteps.values.calendar.deadline,decision.deadline);
  const recovered=await h.recover('independent');
  assert.deepEqual(recovered.view.coreSteps,view.coreSteps);
  assert.equal(recovered.legacySessionId,legacy.id);
  const resumed=await h.handle({op:'resume',sessionId:legacy.id},learner);
  assert.equal(resumed.view.coreStepsVersion,undefined);
  assert.deepEqual(await old.store.get('sessions/'+legacy.id),oldSnapshot);
});

test('repeating mentor practice preserves availability, historical score and idempotent starts',async()=>{
  const h=fixture({guidedSeminarCore:true,caseIds:['complaint-routing','ads-consent']});
  const legacyPoints={points:4,sourceAttemptId:'historical-attempt'};
  await h.store.transaction(ledger,()=>({points:4,journey:{example:{completed:true},mentor:{completed:true}}}));
  await h.store.transaction(journal,()=>legacyPoints);
  const reviewed=async view=>h.store.transaction('sessions/'+view.id,s=>({...s,status:'review',results:[{explanation:'fixture',criteria:[]}]}));
  const remaining=(await h.recover('independent')).seminarProgress.remainingCases;
  const [first,duplicate]=await Promise.all([h.start('mentor','mentor-a'),h.start('mentor','mentor-b')]);
  assert.equal(first.view.id,duplicate.view.id);
  assert.equal(first.seminarProgress.mentorCompleted,true);
  assert.equal(first.seminarProgress.mentorActive,true);
  assert.equal(first.seminarProgress.remainingCases,remaining);
  await reviewed(first.view);
  assert.equal((await h.finish(first.view)).view.status,'complete');
  const graded=(await h.start('independent','graded-a')).view;
  assert.equal(graded.case.id,'ads-consent');
  assert.equal(graded.seminarProgress.remainingCases,0);
  const second=await h.start('mentor','mentor-c');
  assert.notEqual(second.view.id,first.view.id);
  assert.equal(second.view.case.id,'ads-consent');
  assert.equal(second.seminarProgress.independentActive,true);
  assert.equal(second.seminarProgress.remainingCases,0);
  assert.equal((await h.start('mentor','mentor-a')).view.id,first.view.id);
  assert.deepEqual(await h.store.get(journal),legacyPoints);
  assert.equal((await h.store.get(ledger)).points,4);
  assert.equal(Object.keys((await h.store.get(ledger)).attempts).length,1);
  const example=(await h.start('example','example-a')).view;
  await reviewed(example);
  await h.finish(example);
  const repeat=(await h.start('example','example-b')).view;
  assert.notEqual(repeat.id,example.id);
  assert.equal(repeat.status,'active');
  assert.equal(repeat.seminarProgress.exampleCompleted,true);
});
