import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceptionService} from './service.mjs';
import {createMemoryStore} from './store.mjs';
import {hash, ReceptionError} from './schema.mjs';
import {createOpenAIProvider,estimateMentorWorkReservation} from './provider.mjs';
import {MFC_SEMINAR_VERSION} from './mfc-seminar.mjs';
import {SEMINAR_STORY_VERSION, SEMINAR_STORY_PROGRESS_KEY} from './seminar-stories.mjs';
import {createSyntheticReceptionCases} from '../../../scripts/reception-ai-qa-cases.mjs';
import {executionQAProfiles} from '../../../scripts/reception-execution-qa.mjs';
import {explicitQAReview} from '../../../scripts/reception-correspondence-qa-cases.mjs';
import {createFirebaseResultWriter} from './firebase.mjs';
import {SEMINAR_REPLY_GRADING_VERSION} from './seminar-journey.mjs';

async function fixture(answerMentor, {locale='ru',ready=true,acceptedKinds,reviewMentorWork,reviewDecision,stage='mentor',writeJournal=false}={}) {
  const identity={uid:'mentor-question-fixture',studentKey:'99990001'};
  const ads=createSyntheticReceptionCases().find(c=>c.id==='ads-consent');
  ads.rubric.authored.knowledge={...ads.rubric.authored.knowledge,number:'38',actDate:'2006-03-13',articles:['18']};
  ads.documents.push({...ads.documents[0],id:'d0',factIds:[]});
  const store=createMemoryStore();
  await store.transaction('seminarProgress/'+hash('student:'+identity.studentKey),()=>({
    [SEMINAR_STORY_PROGRESS_KEY]:{example:{completed:true},...(stage==='independent'?{mentor:{completed:true}}:{})}
  }));
  const profiles=acceptedKinds?{...executionQAProfiles,private(c,language){
    return {...executionQAProfiles.private(c,language),acceptedKinds};
  }}:executionQAProfiles;
  const saveResult=writeJournal?createFirebaseResultWriter({ref:path=>({
    async transaction(update){
      const result=await store.transaction(path,update);
      return {snapshot:{val:()=>result.value}};
    }
  })}):undefined;
  const service=createReceptionService({store,cases:[ads],correspondenceProfiles:profiles,requireGameplay:true,saveResult,
    guidedSeminarCore:true,provider:{name:'mentor-test',ready,answerMentor,reviewMentorWork,reviewDecision,
      generate(){assert.fail('A mentor question must not call the visitor.');}}});
  const {view}=await service.handle({op:'start',context:'seminar',mode:stage==='mentor'?'training':'independent',journeyStage:stage,
    workbookVersion:2,decisionVersion:'correspondence-v1',controlVersion:'execution-v1',coreStepsVersion:MFC_SEMINAR_VERSION,
    seminarStoryVersion:SEMINAR_STORY_VERSION,locale,requestId:'start-mentor'},identity);
  const send=(view,body)=>service.handle({...body,sessionId:view.id,
    ...(body.op==='document'?{}:{expectedRevision:view.revision})},identity);
  const ask=(view,text,requestId)=>send(view,{op:'mentor-question',text,requestId});
  return {view,send,ask,store,handle:body=>service.handle(body,identity)};
}

test('current mentor drafts default to the accepted reply or internal form without a selector',async()=>{
  for(const [acceptedKinds,expected] of [[['special','reply'],'reply'],[['internal'],'internal']]){
    let input;
    const {view,send}=await fixture(undefined,{acceptedKinds,async reviewMentorWork(value){
      input=value;
      return {ready:true,feedback:'Проект принят.',usage:{inputTokens:5,outputTokens:5}};
    }});
    assert.equal(view.case.correspondence.fixedKind,expected);
    assert.equal(view.case.correspondence.kind,expected);
    if(expected==='internal')assert.match(view.case.correspondence.task,/служебный документ/);
    let step=0,current=view;
    const perform=async body=>{current=(await send(current,{requestId:'work-step-'+(++step),...body})).view;};
    await perform({op:'tutorial-step',stepId:'reception',choiceId:'role'});
    const decision=current.guidance.decision;
    assert.equal(decision.correspondence.kind,expected);
    for(const citation of decision.correspondence.citations.filter(row=>row.kind==='document'))
      await perform({op:'document',documentId:citation.sourceId});
    await perform({op:'tutorial-step',stepId:'materials',citations:decision.correspondence.citations.filter(row=>row.kind==='legal')});
    await perform({op:'tutorial-step',stepId:'calendar',calendar:{deadline:decision.deadline,referralDeadline:decision.workbook.referralDeadline,
      registrationTimely:decision.workbook.registrationTimely}});
    await perform({op:'tutorial-step',stepId:'route',routing:decision.workbook.routing});
    delete decision.correspondence.kind;
    await perform({op:'tutorial-step',stepId:'draft',decision});
    assert.equal(input.guide.fixedKind,expected);
    assert.equal(input.work.decision.correspondence.kind,expected);
    assert.equal(current.decision.correspondence.kind,expected);
    assert.equal(current.status,'complete');
    assert.equal(current.seminarProgress.mentorCompleted,true);
    assert.equal(current.controlWorkflow,undefined);
  }
});

test('current assessment normalizes a persisted legacy form and gives the reviewer only substantive criteria',async()=>{
  const mentor=await fixture(undefined);
  const {view:{guidance:{decision}}}=await mentor.send(mentor.view,{op:'tutorial-step',stepId:'reception',
    choiceId:'role',requestId:'finish-reception'});
  const acceptedKinds=['special','reply'];
  let reviewed, calls=0;
  const assessed=await fixture(undefined,{acceptedKinds,stage:'independent',writeJournal:true,reviewDecision({context}){
    calls++;
    reviewed=context;
    return {review:explicitQAReview(context),verified:true,usage:{inputTokens:10,outputTokens:10}};
  }});
  let current=assessed.view, step=0;
  const perform=async body=>{current=(await assessed.send(current,{requestId:'assess-step-'+(++step),...body})).view;};
  for(const citation of decision.correspondence.citations.filter(row=>row.kind==='document'))
    await perform({op:'document',documentId:citation.sourceId});
  await perform({op:'core-step',stepId:'materials',citations:decision.correspondence.citations.filter(row=>row.kind==='legal')});
  await perform({op:'core-step',stepId:'calendar',calendar:{deadline:decision.deadline,referralDeadline:decision.workbook.referralDeadline,
    registrationTimely:decision.workbook.registrationTimely}});
  await perform({op:'core-step',stepId:'route',routing:decision.workbook.routing});
  decision.correspondence.kind='special';
  decision.correspondence.orders=[{stale:'from the earlier form'}];
  const finalInput={op:'decide',decision,requestId:'confirm-once'};
  const draft=current;
  current=(await assessed.send(draft,finalInput)).view;
  assert.equal(current.decision.correspondence.kind,'reply');
  assert.deepEqual(current.decision.correspondence.orders,[]);
  assert.equal(current.status,'complete');
  assert.equal(current.result.gradingVersion,SEMINAR_REPLY_GRADING_VERSION);
  assert.equal(current.result.points,5);
  assert.equal(current.result.journalStatus,'saved');
  assert.equal(current.controlWorkflow,undefined);
  assert.equal(current.followup,null);
  assert.equal(reviewed.mfcReception.fixedKind,'reply');
  assert.equal(reviewed.mfcReception.initialOnly,true);
  assert.equal(reviewed.sections.orders,undefined);
  assert.equal(reviewed.execution,undefined);
  assert.equal(reviewed.profile.acceptedKinds,undefined);
  assert.equal(reviewed.profile.response.kind,undefined);
  assert.equal(reviewed.sections.kind,undefined);
  assert.equal(reviewed.sections.resolution,decision.correspondence.sections.resolution);
  assert.deepEqual((await assessed.send(draft,finalInput)).view.result,current.result);
  assert.equal(calls,1);
  const receipt=await assessed.store.get('rudn-platform/v1/attempts/99990001/'+current.result.attemptId);
  assert.equal(receipt.summary.gradingVersion,SEMINAR_REPLY_GRADING_VERSION);
  assert.equal(receipt.points,5);
});

test('pending v2 controls finish using saved initial feedback and leave completed receipts intact',async()=>{
  for(const status of ['followup','review']){
    const {view,store,handle}=await fixture(undefined,{stage:'independent',writeJournal:true,
      reviewDecision:()=>assert.fail('Resuming previously reviewed work must not call a model.')});
    const sessionPath='sessions/'+view.id;
    const initial={score:84.5,criteria:[],explanation:'Первичная проверка',correspondence:{phase:'initial',rawScore:84.5,cap:null}};
    await store.transaction(sessionPath,s=>{
      s.status=status;
      s.caseStates[0].decision={correspondence:{kind:'reply',orders:[{id:'preserved-previous-order'}]}};
      s.caseStates[0].correspondenceInitialFeedback=initial;
      if(status==='followup')s.lease={id:'outdated-control-review',until:Date.now()+60_000};
      if(status==='review')s.results=[{score:69,criteria:[],explanation:'Старый промежуточный расчёт'}];
      return s;
    });
    const open=()=>handle({op:'resume',sessionId:view.id,context:'seminar'});
    const [first,second]=await Promise.all([open(),open()]);
    for(const {view:completed} of [first,second]){
      assert.equal(completed.status,'complete');
      assert.equal(completed.result.total,84.5);
      assert.equal(completed.result.points,4);
      assert.equal(completed.controlWorkflow,undefined);
      assert.deepEqual(completed.decision.correspondence.orders,[]);
    }
    const receipt=first.view.result.attemptId;
    const rows=await store.get('rudn-platform/v1/attempts/99990001');
    assert.deepEqual(Object.keys(rows),[receipt]);
    assert.equal(rows[receipt].summary.gradingVersion,SEMINAR_REPLY_GRADING_VERSION);
    const preserved=await store.get(sessionPath);
    assert.equal(preserved.lease,null);
    assert.equal(preserved.caseStates[0].decision.correspondence.orders[0].id,'preserved-previous-order');
    assert.equal((await open()).view.result.attemptId,receipt);
    assert.deepEqual(await store.get(sessionPath),preserved);
    assert.equal(await store.get('budget'),null);
  }
});

test('a free mentor question uses the workspace titles and computed dates and a follow-up receives the actual preceding turn',async()=>{
  const calls=[];
  const {view,send,ask}=await fixture(async input=>{
    calls.push(input);
    return {reply:'Ответ наставника',usage:{inputTokens:10,outputTokens:5}};
  });
  const question='Я могу открыть письмо о согласии?';
  let current=(await ask(view,question,'free-question')).view;
  assert.deepEqual(current.messages,view.messages);
  const lesson=calls[0].guide;
  assert.equal(lesson.evidence.stage,'reception');
  assert.equal(lesson.evidence.workspace.reception,'Приёмная');
  assert.equal(lesson.evidence.workspace.records,'Материалы дела');
  assert.equal(lesson.evidence.workspace.sources,'Источники');
  assert.equal(lesson.evidence.workspace.draft,'Ответ по существу');
  assert.deepEqual(lesson.evidence.documents.map(row=>row.title),view.documents.map(row=>row.title));
  assert.ok(lesson.evidence.documents.every(row=>!row.opened));
  assert.equal(lesson.evidence.calendar.registration.received,view.case.workbook.events[0].date);
  assert.equal(lesson.evidence.calendar.registration.registered,view.case.workbook.events[1].date);
  assert.equal(lesson.evidence.calendar.deadlines[0].anchorDate,view.case.workbook.events[1].date);
  assert.equal(lesson.evidence.calendar.deadlines[1].anchorDate,lesson.evidence.calendar.deadlines[0].date);
  assert.deepEqual(lesson.evidence.recipients[0].length,2);
  assert.ok(lesson.evidence.legalSources.find(source=>source.articles.includes('18')).exactPassage);
  assert.equal(lesson.evidence.followupNotice,undefined);
  assert.equal(calls[0].text,question);

  current=(await send(current,{op:'tutorial-step',stepId:'reception',choiceId:'role',requestId:'finish-reception'})).view;
  current=(await ask(current,'Что именно процитировать из него?','free-followup')).view;
  assert.equal(calls[1].guide.evidence.stage,'materials');
  assert.deepEqual(calls[1].history,[{role:'user',text:question},{role:'assistant',text:'Ответ наставника'}]);
  assert.equal(current.mentorMessages.length,4);
});

test('mentor chat receives the selected workspace tab without changing the step or visitor conversation',async()=>{
  let practiceGuide;
  const {view,send}=await fixture(async({guide})=>{
    practiceGuide=guide;
    return {reply:'Откройте календарь.',usage:{inputTokens:10,outputTokens:4}};
  });
  const body={op:'mentor-question',requestId:'calendar-tab',text:'Что здесь выбрать?'};
  await assert.rejects(send(view,{...body,workspacePage:'unrecognized'}),error=>error.code==='invalid_request');
  const {view:next}=await send(view,{...body,workspacePage:'calendar'});
  assert.equal(practiceGuide.workspacePage,'calendar');
  assert.notEqual(practiceGuide.currentStep,'calendar');
  assert.deepEqual(next.messages,view.messages);
  assert.deepEqual(next.mentorMessages.map(({text})=>text),[body.text,'Откройте календарь.']);
});

test('provider outages answer explicit workspace lookups and surface failures for unresolved questions',async()=>{
  const {view,ask}=await fixture(async()=>{throw new ReceptionError('provider_unavailable',503);});
  const lookedUp=(await ask(view,'Какие документы я могу открыть?','show-documents')).view;
  assert.ok(view.documents.every(row=>lookedUp.mentorMessages.at(-1).text.includes(row.title)));
  const dates=(await ask(lookedUp,'Сроки передачи и рассмотрения?','show-deadline')).view;
  assert.match(dates.mentorMessages.at(-1).text,/Крайний срок передачи из МФЦ/);
  assert.match(dates.mentorMessages.at(-1).text,/Крайний срок рассмотрения у адресата/);
  const sources=(await ask(dates,'Какие правовые источники открыть?','show-legal')).view;
  assert.match(sources.mentorMessages.at(-1).text,/38-ФЗ \(ст\. 18\)/);
  await assert.rejects(ask(sources,'Какие документы я могу открыть? Как доказать, кто передал номер?','compound'),
    {code:'provider_unavailable'});
  await assert.rejects(ask(sources,'А он вместе с другими уже ответил?','ambiguous-followup'),
    {code:'provider_unavailable'});
});

test('mentor draft review uses the same output allowance as its reservation',async()=>{
  let payload;
  const provider=createOpenAIProvider({apiKey:'explicit-test-key',fetchImpl:async (_url,request)=>{
    payload=JSON.parse(request.body);
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[
      {type:'output_text',text:JSON.stringify({ready:true,feedback:'Правовое основание связано с документом.'})}
    ]}]}));
  }});
  const input={guide:{},work:{},phase:'draft',locale:'ru'};
  assert.equal((await provider.reviewMentorWork(input)).ready,true);
  assert.equal(payload.max_output_tokens,estimateMentorWorkReservation(input).outputTokens);
  assert.ok(payload.max_output_tokens>650);
});

test('a missing provider gives a localized workspace lookup without a model call',async()=>{
  const {view,ask}=await fixture(()=>assert.fail('The unconfigured provider must not run.'),{locale:'zh',ready:false});
  const next=(await ask(view,'请列出我可以打开的文件。','show-documents')).view;
  assert.match(next.mentorMessages.at(-1).text,/可以打开的文件/);
  assert.ok(view.documents.every(row=>next.mentorMessages.at(-1).text.includes(row.title)));
  await assert.rejects(ask(next,'请用四句话起草一封正式回复。','draft'),{code:'not_configured'});
});
