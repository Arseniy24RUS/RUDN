import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceptionService} from './service.mjs';
import {createMemoryStore} from './store.mjs';
import {hash} from './schema.mjs';
import {MFC_SEMINAR_VERSION} from './mfc-seminar.mjs';
import {LEGACY_SEMINAR_STORY_VERSION,SEMINAR_STORY_VERSION,SEMINAR_STORY_PROGRESS_KEY} from './seminar-stories.mjs';
import {createSyntheticReceptionCases} from '../../../scripts/reception-ai-qa-cases.mjs';
import {executionQAProfiles} from '../../../scripts/reception-execution-qa.mjs';

const learner={uid:'story-dialogue-qa',studentKey:'12345'};
const stage={context:'seminar',mode:'training',journeyStage:'example',workbookVersion:2,
  decisionVersion:'correspondence-v1',controlVersion:'execution-v1',coreStepsVersion:MFC_SEMINAR_VERSION};
const storyStage={...stage,seminarStoryVersion:SEMINAR_STORY_VERSION};
const knownSourceHash='a'.repeat(64);
const messages=(view,body)=>({sessionId:view.id,expectedRevision:view.revision,...body});
const reception=(view,requestId)=>messages(view,{op:'tutorial-step',stepId:'reception',choiceId:'role',requestId});

function fixture(providerOptions={}){
  const cases=createSyntheticReceptionCases();
  const source=cases.find(c=>c.id==='complaint-routing');
  const ads=cases.find(c=>c.id==='ads-consent');
  ads.documents.push({...ads.documents[0],id:'d0',factIds:[]});
  source.datePackId='a';
  source.provenance={sourceCaseId:source.id,sourceContentVersion:source.version,sourceSHA256:knownSourceHash,calendarYear:2026,dateValues:{}};
  source.rubric.authored.knowledge={...source.rubric.authored.knowledge,number:'59',actDate:'2006-05-02',articles:['8']};
  for(const id of ['complaint','competence','resolution'])source.documents.push({...source.documents[0],id,factIds:[]});
  const direct=source.facts.find(fact=>fact.knowledge==='direct');
  for(const id of ['person','subject','materials'])source.facts.push({...direct,id});
  const store=createMemoryStore();
  const provider={name:'mock',generate(){assert.fail('The suggested question should never call the live actor');},
    reviewDecision(){assert.fail('The review cannot start without a learner submission');},...providerOptions};
  const build=(options={})=>createReceptionService({store,provider,cases:[source,ads],correspondenceProfiles:executionQAProfiles,requireGameplay:true,...options});
  const use=body=>build().handle(body,learner);
  const start=(contract,requestId)=>use({...contract,op:'start',requestId,locale:'ru'});
  return {use,start,store,source,build};
}

test('the version handshake starts a separate tutorial and preserves the prior dossier, attempts and grade',async()=>{
  const {source,use,start,store}=fixture();
  const previous=(await start(stage,'old')).view;
  const ledger='seminarProgress/'+hash('student:'+learner.studentKey);
  await store.transaction(ledger,current=>({...current,bestPoints:4,
    journey:{example:{completed:true},mentor:{completed:true}}}));
  assert.equal(previous.seminarStoryVersion,undefined);
  assert.equal(previous.case.opening,source.public.opening.ru);
  const oldMessages=previous.messages;
  await assert.rejects(start({...stage,seminarStoryVersion:'unknown'},'bad'),{code:'invalid_story_version'});
  await assert.rejects(start({...storyStage,context:'free',journeyStage:undefined,coreStepsVersion:undefined},'free-bad'),
    {code:'invalid_story_version'});
  const ready=await use({...storyStage,op:'recover'});
  assert.equal(ready.view,null);
  assert.equal(ready.seminarProgress.exampleCompleted,false);
  assert.equal(ready.seminarProgress.seminarPoints,4);
  assert.ok(ready.legacySessions.some(row=>row.id===previous.id));
  await assert.rejects(start({...storyStage,journeyStage:'mentor'},'locked'),{code:'journey_stage_locked'});
  const current=(await start(storyStage,'new')).view;
  assert.equal(current.seminarStoryVersion,SEMINAR_STORY_VERSION);
  assert.notEqual(current.id,previous.id);
  const saved=await store.get('sessions/'+current.id);
  assert.deepEqual(saved.caseData[0].provenance,source.provenance);
  assert.equal(saved.caseData[0].datePackId,source.datePackId);
  assert.equal(saved.storyDossierSHA256,hash(saved.caseData[0]));
  assert.notEqual(saved.storyDossierSHA256,source.provenance.sourceSHA256);
  assert.deepEqual((await use({...stage,op:'recover'})).view.messages,oldMessages);
  assert.equal((await use({...storyStage,op:'recover'})).view.id,current.id);
  assert.equal((await use({op:'resume',sessionId:previous.id,context:'seminar'})).view.id,previous.id);
  const free=(await use({op:'start',context:'free',mode:'training',workbookVersion:2,caseId:source.id,requestId:'free'})).view;
  assert.equal(free.case.opening,source.public.opening.ru);
  assert.equal(free.seminarStoryVersion,undefined);
  assert.equal(free.guidance,undefined);
});

test('the prepared question is an actual, idempotent chat message while the provider is offline',async()=>{
  const {use,start}=fixture({ready:false});
  let view=(await start(storyStage,'example')).view;
  assert.equal(view.messages.length,1);
  await assert.rejects(use(reception(view,'skip')),{code:'tutorial_question_required'});
  const question=view.guidance.question;
  assert.equal(question.completed,false);
  assert.equal(question.reply,undefined);
  const suggested=messages(view,{op:'message',requestId:'suggested',suggestionId:question.id,text:question.prompt});
  await assert.rejects(use({...suggested,text:'Изменённый вопрос'}),{code:'invalid_request'});
  view=(await use(suggested)).view;
  assert.equal(view.guidance.question.completed,true);
  assert.equal(view.messages.length,3);
  assert.equal(view.messages[1].text,question.prompt);
  assert.match(view.messages[2].text,/17 и 18/);
  assert.ok(view.documents.some(row=>row.id===view.guidance.routeDocumentId));
  assert.deepEqual((await use(suggested)).view.messages,view.messages);
  const resumed=(await use({op:'resume',sessionId:view.id,context:'seminar'})).view;
  assert.deepEqual(resumed.messages,view.messages);
  assert.equal(resumed.guidance.question.completed,true);
  view=(await use(reception(resumed,'asked'))).view;
  assert.equal(view.guidance.steps[view.guidance.stepIndex].id,'materials');
  assert.equal(view.messages.length,3);
});

test('only a grounded response to an editable question completes the chat requirement',async()=>{
  const inputs=[];
  const {use,start}=fixture({async generate(input){
    inputs.push(input);
    assert.match(input.actorCase.opening,/Сосновый сквер/);
    assert.ok(input.actorCase.documents.some(row=>row.id==='lighting-signed-reply'));
    if(inputs.length===1)return {reply:'Здравствуйте.',revealedFactIds:[],releasedDocumentIds:[]};
    return {reply:'Я писал про опоры у остановки, а в ответе описан соседний сквер.',
      revealedFactIds:['subject'],releasedDocumentIds:[]};
  }});
  let view=(await start(storyStage,'example')).view;
  view=(await use(messages(view,{op:'message',requestId:'greeting',text:'Здравствуйте.'}))).view;
  assert.equal(view.guidance.question.completed,false);
  await assert.rejects(use(reception(view,'still-locked')),{code:'tutorial_question_required'});
  const text='Что было в вашем первом обращении?';
  view=(await use(messages(view,{op:'message',requestId:'editable',text}))).view;
  assert.equal(inputs[1].text,text);
  assert.equal(view.messages.at(-2).text,text);
  assert.equal(view.guidance.question.completed,true);
  assert.equal((await use(reception(view,'asked'))).view.guidance.stepIndex,1);
});

test('new independent work opens the projected dossier with no tutorial question or route hint',async()=>{
  const {use,start,store}=fixture();
  const ledger='seminarProgress/'+hash('student:'+learner.studentKey);
  await store.transaction(ledger,()=>({[SEMINAR_STORY_PROGRESS_KEY]:{example:{completed:true},mentor:{completed:true}}}));
  const view=(await start({...storyStage,journeyStage:'independent',mode:'independent'},'independent')).view;
  assert.equal(view.case.id,'ads-consent');
  assert.match(view.case.opening,/скидками/);
  assert.equal(view.guidance,undefined);
  assert.equal(view.mentorMessages,undefined);
  assert.equal(view.case.seminarStory,undefined);
  assert.equal(view.case.workbook.routingPolicy.context,undefined);
  assert.equal(view.case.workbook.routingPolicy.boundary,undefined);
  assert.equal(view.coreSteps.stepId,'materials');
  await assert.rejects(use(messages(view,{op:'message',requestId:'invalid-suggestion',suggestionId:'example-question',text:'Вопрос'})),
    {code:'tutorial_step_required'});
});

test('the production contract archives legacy work and gates assessment on current example and mentor receipts',async()=>{
  const {start,store,build}=fixture();
  const ledger='seminarProgress/'+hash('student:'+learner.studentKey);
  await store.transaction(ledger,()=>({bestPoints:4,mfcJourney:{example:{completed:true},mentor:{completed:true}}}));
  const legacyBody={...stage,mode:'independent',journeyStage:'independent'};
  const {view:legacy}=await start(legacyBody,'existing-attempt');
  const legacyPath='sessions/'+legacy.id;
  const historicalStory={...await store.get(legacyPath),seminarStoryVersion:LEGACY_SEMINAR_STORY_VERSION};
  await store.transaction(legacyPath,()=>historicalStory);
  await store.transaction(ledger,progress=>({...progress,storyJourney:{example:{completed:true},mentor:{completed:true},
    independent:{sessionId:legacy.id,completed:false}}}));
  const previousGrade={points:4,sourceAttemptId:'old-completed-attempt'};
  const journal='rudn-platform/v1/grades/'+learner.studentKey+'/seminar-5';
  await store.transaction(journal,()=>previousGrade);
  const ownerKey=hash('student:'+learner.studentKey), contextlessId='a'.repeat(40), contextlessPracticeId='b'.repeat(40);
  const {context,seminarStoryVersion,journeyStage,coreStepsVersion,...oldShift}=historicalStory;
  const oldCompleted={...oldShift,id:contextlessId,status:'complete',results:[{score:80,criteria:[]}],
    result:{points:4,total:80,attemptId:previousGrade.sourceAttemptId},journalSaved:true};
  const oldPractice={...oldShift,id:contextlessPracticeId,mode:'training'};
  await store.transaction('sessions/'+contextlessId,()=>oldCompleted);
  await store.transaction('sessions/'+contextlessPracticeId,()=>oldPractice);
  // A pre-index scored session only exists in the original start ledger.
  await store.transaction('sessionIndex/'+ownerKey+'/legacyMigrated',()=>null);
  await store.transaction('starts/2026-11-13/'+ownerKey,()=>({ids:{[contextlessId]:true,[contextlessPracticeId]:true}}));
  const otherDevice={...learner,uid:'second-device-same-student'};
  const production=identity=>body=>build({requireCurrentSeminarTraining:true,guidedSeminarCore:true}).handle(body,identity);
  const call=production(learner), again=production(otherDevice);
  const scored={...storyStage,mode:'independent',journeyStage:'independent'};
  const mentor={...storyStage,journeyStage:'mentor'};
  const startBody=(contract,requestId)=>({...contract,op:'start',requestId,locale:'ru'});
  const historical=await again({op:'resume',sessionId:legacy.id,context:'seminar'});
  assert.equal(historical.view.historical,true);
  assert.equal(historical.view.seminarStoryVersion,LEGACY_SEMINAR_STORY_VERSION);
  const oldScore=(await again({op:'resume',sessionId:contextlessId,context:'seminar'})).view;
  assert.equal(oldScore.historical,true);
  assert.equal(oldScore.result.points,4);
  assert.equal((await again({op:'resume',sessionId:contextlessPracticeId,context:'seminar'})).view.historical,true);
  await assert.rejects(call({op:'next',sessionId:contextlessPracticeId,requestId:'old-contextless'}),{code:'outdated_session'});
  const free=(await call(startBody({context:'free',mode:'training',workbookVersion:2,caseId:'complaint-routing'},'free-practice'))).view;
  assert.equal(free.context,'free');
  assert.equal(free.historical,undefined);
  for(const op of ['locale','message','core-step','document','decide','followup','next']){
    await assert.rejects(call({op,sessionId:legacy.id,...(op==='locale'?{locale:'en'}:{requestId:'old-'+op}),
      ...(op==='message'?{text:'Можно продолжить?',expectedRevision:legacy.revision}:{}),
      ...(op==='core-step'?{stepId:'materials'}:{})}),{code:'outdated_session'});
  }
  await assert.rejects(call(startBody(legacyBody,'existing-attempt')),{code:'seminar_training_update_required'});
  await assert.rejects(call(startBody({...legacyBody,seminarStoryVersion:LEGACY_SEMINAR_STORY_VERSION},'same-version')),
    {code:'seminar_training_update_required'});
  await assert.rejects(call(startBody({mode:'independent'},'no-context')),{code:'seminar_training_update_required'});
  for(const contract of [legacyBody,scored,{mode:'independent'}]){
    const recovered=await again({...contract,op:'recover'});
    assert.equal(recovered.view,null);
    assert.equal(recovered.seminarProgress.exampleCompleted,false);
    assert.equal(recovered.seminarProgress.mentorCompleted,false);
    assert.equal(recovered.seminarProgress.seminarPoints,4);
    assert.ok(recovered.legacySessions.some(row=>row.id===legacy.id));
    assert.ok(recovered.legacySessions.some(row=>row.id===contextlessId&&row.completed));
    assert.ok(recovered.legacySessions.some(row=>row.id===contextlessPracticeId&&row.journeyStage==='example'));
  }
  await assert.rejects(call(startBody(scored,'existing-attempt')),{code:'journey_stage_locked'});
  await assert.rejects(call(startBody(mentor,'mentor-before-example')),{code:'journey_stage_locked'});

  // The teaching sequence has its own tests. Exercise the real `next` operation
  // and finalization transaction from the persisted review boundary here.
  const reviewed=async view=>store.transaction('sessions/'+view.id,s=>({...s,status:'review',results:[{explanation:'fixture',criteria:[]}]}));
  const finish=async view=>again({op:'next',sessionId:view.id,requestId:'finish'});
  const {view:example}=await call(startBody(storyStage,'current-example'));
  assert.equal((await again({...storyStage,op:'recover'})).view.id,example.id);
  await assert.rejects(call(startBody(scored,'existing-attempt')),{code:'journey_stage_locked'});
  await reviewed(example);
  assert.equal((await finish(example)).seminarProgress.exampleCompleted,true);
  assert.equal((await finish(example)).seminarProgress.mentorCompleted,false);
  const [practice,duplicate]=await Promise.all([call(startBody(mentor,'first-practice')),again(startBody(mentor,'other-device-practice'))]);
  assert.equal(practice.view.id,duplicate.view.id);
  await assert.rejects(call(startBody(scored,'existing-attempt')),{code:'journey_stage_locked'});
  await reviewed(practice.view);
  assert.equal((await finish(practice.view)).seminarProgress.mentorCompleted,true);
  const assessment=await call(startBody(scored,'existing-attempt'));
  assert.notEqual(assessment.view.id,legacy.id);
  assert.equal((await again({...scored,op:'recover'})).view.id,assessment.view.id);
  assert.equal((await again(startBody(scored,'existing-attempt'))).view.id,assessment.view.id);
  const more=await call(startBody(mentor,'more-practice'));
  assert.notEqual(more.view.id,practice.view.id);
  assert.equal(more.seminarProgress.mentorCompleted,true);
  assert.deepEqual(await store.get(legacyPath),historicalStory);
  assert.deepEqual(await store.get('sessions/'+contextlessId),oldCompleted);
  assert.deepEqual(await store.get('sessions/'+contextlessPracticeId),oldPractice);
  assert.deepEqual(await store.get(journal),previousGrade);
});
