import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReceptionService} from './service.mjs';
import {createMemoryStore} from './store.mjs';
import {hash} from './schema.mjs';
import {MFC_SEMINAR_VERSION} from './mfc-seminar.mjs';
import {requiredSeminarExamples} from './normative-acts.mjs';
import {LEGACY_SEMINAR_STORY_VERSION,SEMINAR_STORY_VERSION,SEMINAR_STORY_PROGRESS_KEY} from './seminar-stories.mjs';
import {createSyntheticReceptionCases} from '../../../scripts/reception-ai-qa-cases.mjs';
import {executionQAProfiles} from '../../../scripts/reception-execution-qa.mjs';
import {explicitQAReview} from '../../../scripts/reception-correspondence-qa-cases.mjs';

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

test('the worked example offers a ready draft with the exact saved provision and requires explicit confirmation in all three languages',async()=>{
  const provisions=JSON.parse(readFileSync(new URL('./normative-provisions.json',import.meta.url)));
  const partSeven=provisions['reception-law59999']['8'].find(([id])=>id==='law59999-u53');
  for(const [locale,article,identity] of [['ru',/часть 7 статьи 8/i,/Сосновый сквер/],
    ['en',/Article 8\(7\)/,/Sosnovy Skver/],['zh',/第8条第7款/,/松树小广场/]]){
    const {use}=fixture({ready:false});
    let view=(await use({...storyStage,op:'start',requestId:'worked-example',locale})).view;
    assert.equal(view.guidance.prefilledDecision,undefined);
    let sequence=0;
    const send=async body=>{
      view=(await use({sessionId:view.id,requestId:'example-'+(++sequence),
        ...(body.op==='document'?{}:{expectedRevision:view.revision}),...body})).view;
    };
    const step=(stepId,input)=>send({op:'tutorial-step',stepId,...input});
    await send({op:'message',text:view.guidance.question.prompt,suggestionId:view.guidance.question.id});
    await step('reception',{choiceId:'role'});
    const model=view.guidance.decision;
    for(const row of model.correspondence.citations.filter(row=>row.kind==='document'))
      await send({op:'document',documentId:row.sourceId});
    const selected={id:'selected-by-learner',kind:'legal',section:'legalBasis',sourceId:'reception-law59999',
      unitIds:[partSeven[0]],quote:partSeven[1]};
    await step('materials',{citations:[selected]});
    await step('calendar',{calendar:{deadline:model.deadline,referralDeadline:model.workbook.referralDeadline,
      registrationTimely:model.workbook.registrationTimely}});
    assert.equal(view.guidance.prefilledDecision,undefined);
    await step('route',{routing:model.workbook.routing});
    assert.equal(view.guidance.steps[view.guidance.stepIndex].id,'draft');
    assert.equal(view.status,'active');
    assert.equal(view.decision,null);
    assert.equal(view.draftDecision,null);
    const draft=view.guidance.prefilledDecision;
    assert.match(draft.correspondence.subject,identity);
    assert.equal(draft.correspondence.kind,'reply');
    assert.equal(Object.values(draft.correspondence.sections).filter(text=>text.trim()).length,4);
    assert.match(draft.correspondence.sections.legalBasis,article);
    assert.deepEqual(draft.correspondence.citations.filter(row=>row.kind==='legal'),[selected]);
    assert.ok(draft.correspondence.citations.some(row=>row.sourceId==='lighting-signed-reply'));
    assert.deepEqual(draft.workbook.routing,view.coreSteps.values.routing);
    assert.equal(draft.deadline,view.coreSteps.values.calendar.deadline);
    assert.deepEqual((await use({op:'resume',sessionId:view.id,context:'seminar'})).view.guidance.prefilledDecision,draft);

    if(locale==='en'){
      const edited=structuredClone(draft);
      edited.correspondence.subject='My edited subject';
      edited.correspondence.sections.resolution='';
      await step('draft',{decision:edited});
      assert.equal(view.guidance.steps[view.guidance.stepIndex].id,'draft');
      assert.equal(view.guidance.prefilledDecision,undefined);
      const resumed=(await use({op:'resume',sessionId:view.id,context:'seminar'})).view;
      assert.equal(resumed.draftDecision.correspondence.subject,'My edited subject');
    }
    await step('draft',{decision:draft});
    assert.equal(view.status,'complete',view.guidance.finding?.explanation);
    assert.deepEqual(view.decision.correspondence,draft.correspondence);
    assert.equal(view.initialOnly,true);
    assert.equal(view.seminarProgress.exampleCompleted,true);
    assert.equal(view.guidance.prefilledDecision,undefined);
  }
});

test('the complaint accepts Articles 8(6) and 10 separately or together, and lets the learner replace a confirmed selection',async()=>{
  const sourceId='reception-law59999';
  const provisions=JSON.parse(readFileSync(new URL('./normative-provisions.json',import.meta.url)))[sourceId];
  const citation=(article,id)=>{
    const [,quote]=provisions[article].find(([unitId])=>unitId===id);
    return {id:'core-legal-'+id,kind:'legal',section:'legalBasis',sourceId,unitIds:[id],quote};
  };
  const partSix=citation('8','law59999-u52');
  const articleTen=citation('10','law59999-u60');
  const registration=citation('8','law59999-u47');
  for(const [selected,edited] of [
    [[partSix],false],[[articleTen],false],[[partSix,articleTen],false],[[articleTen,partSix],true]
  ]){
    const {use,start}=fixture({ready:false});
    let view=(await start(storyStage,'choose-norms')).view;
    let sequence=0;
    const request=body=>({sessionId:view.id,requestId:'norms-'+(++sequence),
      ...(body.op==='document'?{}:{expectedRevision:view.revision}),...body});
    const send=async body=>{
      view=(await use(request(body))).view;
    };
    const step=(stepId,input)=>send({op:'tutorial-step',stepId,...input});
    await send({op:'message',text:view.guidance.question.prompt,suggestionId:view.guidance.question.id});
    await step('reception',{choiceId:'role'});
    const model=view.guidance.decision;
    for(const row of model.correspondence.citations.filter(row=>row.kind==='document'))
      await send({op:'document',documentId:row.sourceId});
    await step('materials',{citations:selected});
    assert.equal(view.coreSteps.stepId,'calendar');
    assert.deepEqual(view.coreSteps.values.citations,selected);
    await step('calendar',{calendar:{deadline:model.deadline,referralDeadline:model.workbook.referralDeadline,
      registrationTimely:model.workbook.registrationTimely}});
    await step('route',{routing:model.workbook.routing});
    assert.equal(view.coreSteps.stepId,'draft');
    assert.deepEqual(view.guidance.prefilledDecision.correspondence.citations.filter(row=>row.kind==='legal'),selected);

    if(edited){
      const stale=view.guidance.prefilledDecision;
      await step('materials',{citations:[articleTen,registration]});
      assert.equal(view.guidance.finding.stepId,'materials');
      assert.equal(view.coreSteps.stepId,'draft');
      assert.deepEqual(view.coreSteps.values.citations,selected);
      const replace=request({op:'tutorial-step',stepId:'materials',citations:[partSix]});
      view=(await use(replace)).view;
      assert.equal(view.coreSteps.stepId,'draft');
      assert.equal(view.guidance.finding,undefined);
      assert.deepEqual(view.coreSteps.receipt,{requestId:replace.requestId,stepId:'materials'});
      assert.deepEqual((await use(replace)).view,view);
      assert.deepEqual(view.coreSteps.values.citations,[partSix]);
      await step('draft',{decision:stale});
      assert.equal(view.status,'active');
      assert.equal(view.guidance.finding.stepId,'draft');
      assert.deepEqual(view.guidance.prefilledDecision.correspondence.citations.filter(row=>row.kind==='legal'),[partSix]);
    }
    const draft=view.guidance.prefilledDecision;
    if(edited){
      draft.correspondence.subject='Мой заголовок ответа по жалобе';
      draft.correspondence.citations.push({...articleTen,id:'optional-grounds'});
    }
    await step('draft',{decision:draft});
    assert.equal(view.status,'complete',view.guidance?.finding?.explanation);
    assert.equal(view.seminarProgress.exampleCompleted,true);
    assert.deepEqual(view.decision.correspondence,draft.correspondence);
  }
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

test('current mentor practice accepts an incomplete answer and saves only a verified training score',async()=>{
  let reviewCalls=0,journalWrites=0,announce,release;
  const started=new Promise(resolve=>{announce=resolve;});
  const {store,build}=fixture({name:'scripted-practice',
    reviewMentorWork(){assert.fail('Final practice uses the scored reviewer only');},
    async reviewDecision({context}){
      assert.equal(context.mfcReception.initialOnly,true);
      assert.equal(context.sections.resolution,'');
      reviewCalls++;
      if(reviewCalls===1){
        return new Promise(resolve=>{release=resolve;announce();});
      }
      const review=explicitQAReview(context,{initialLevel:0});
      review.criteria.find(row=>row.id==='resolution').findings[0].explanation=
        'Укажите, как орган проверит наличие согласия на рекламную рассылку и что сделает при его отсутствии.';
      return {verified:true,review,usage:{inputTokens:12,outputTokens:10}};
    }
  });
  const handle=build({requireCurrentSeminarTraining:true,saveResult:async()=>{journalWrites++;}}).handle;
  const use=body=>handle(body,learner);
  const ledger='seminarProgress/'+hash('student:'+learner.studentKey);
  await store.transaction(ledger,()=>({bestPoints:4,[SEMINAR_STORY_PROGRESS_KEY]:{example:{completed:true}}}));
  let view=(await use({...storyStage,journeyStage:'mentor',op:'start',requestId:'score-practice',locale:'ru'})).view;
  const indexEntry='sessionIndex/'+hash('student:'+learner.studentKey)+'/entries/'+view.id;
  assert.equal(await store.get(indexEntry),null);
  let sequence=0;
  const step=(stepId,input)=>use(messages(view,{op:'tutorial-step',stepId,requestId:'practice-'+(++sequence),...input}));
  await assert.rejects(step('draft',{decision:{}}),{code:'tutorial_step_locked'});
  view=(await step('reception',{choiceId:'role'})).view;
  const model=structuredClone(view.guidance.decision);
  const originalCitations=requiredSeminarExamples((await store.get('sessions/'+view.id)).caseData[0]);
  view=(await step('materials',{citations:originalCitations})).view;
  view=(await step('calendar',{calendar:{deadline:model.deadline,referralDeadline:model.workbook.referralDeadline,
    registrationTimely:model.workbook.registrationTimely}})).view;
  view=(await step('route',{routing:model.workbook.routing})).view;
  assert.equal(view.guidance.steps[view.guidance.stepIndex].id,'draft');
  const citations=originalCitations.map(row=>({...row,id:'replacement-'+row.id}));
  view=(await step('materials',{citations})).view;
  assert.equal(view.coreSteps.stepId,'draft');
  assert.equal(view.coreSteps.receipt.stepId,'materials');
  assert.deepEqual(view.coreSteps.values.citations,citations);
  const decision={...model,correspondence:{...model.correspondence,subject:'',citations,orders:[],
    sections:{facts:'Заявитель сообщил о рассылке.',legalBasis:'',resolution:'',nextSteps:''}}};
  await assert.rejects(step('draft',{decision:{...decision,correspondence:{...decision.correspondence,citations:originalCitations}}}),
    {code:'core_citation_required'});
  const body=messages(view,{op:'tutorial-step',stepId:'draft',requestId:'submit-practice',decision});
  const empty=structuredClone(decision);
  empty.correspondence.sections.facts=' ';
  await assert.rejects(use({...body,requestId:'empty-practice',decision:empty}),{code:'invalid_correspondence'});
  await assert.rejects(use({...body,requestId:'wrong-revision',expectedRevision:view.revision-1}),{code:'revision_conflict'});
  const first=assert.rejects(use(body),{code:'review_unconfirmed'});
  await Promise.race([started,first.then(()=>assert.fail('The reviewer was not called'))]);
  await assert.rejects(use(body),{code:'busy'});
  assert.equal(reviewCalls,1);
  release({verified:false,usage:{inputTokens:12,outputTokens:10}});
  await first;
  const resume=async()=>(await use({op:'resume',sessionId:view.id,context:'seminar'})).view;
  const failed=await resume();
  assert.equal(failed.status,'active');
  assert.equal(failed.result,null);
  assert.equal(failed.reviewPending.phase,'mentor-draft');
  assert.equal(failed.reviewPending.status,'retry');
  assert.deepEqual(failed.draftDecision.correspondence,decision.correspondence);
  const completed=(await use(body)).view;
  assert.equal(completed.status,'complete');
  assert.equal(completed.result.practiceAssessment,true);
  assert.equal(completed.result.total,30);
  assert.equal(completed.result.points,undefined);
  assert.equal(completed.result.maxPoints,undefined);
  assert.equal(completed.result.gradingVersion,undefined);
  assert.equal(completed.result.journalStatus,'local');
  assert.equal(completed.seminarProgress.mentorCompleted,true);
  assert.equal(completed.seminarProgress.seminarPoints,undefined);
  assert.equal((await store.get(ledger)).bestPoints,4);
  assert.equal(completed.draftDecision,null);
  assert.deepEqual(completed.decision.correspondence,decision.correspondence);
  assert.match(completed.result.cases[0].feedback.correspondence.criteria.find(row=>row.id==='resolution').findings[0].explanation,/наличие согласия/);
  assert.equal((await store.get(indexEntry)).status,'complete');
  const readOnly=build({requireCurrentSeminarTraining:true,
    store:{get:store.get,transaction(){assert.fail('A frozen archive cannot write to the database');}},
    saveResult(){assert.fail('A frozen archive cannot send a result to the journal');}
  }).handle;
  const packet=await readOnly({op:'resume',sessionId:view.id,history:true,context:'seminar',buildId:'f'.repeat(32)},learner);
  assert.equal(packet.view.id,view.id);
  assert.deepEqual(packet.view.result.cases,completed.result.cases);
  assert.equal(packet.view.result.total,30);
  assert.deepEqual((await resume()).result,completed.result);
  assert.deepEqual((await use(body)).view.result,completed.result);
  assert.equal(reviewCalls,2);
  assert.equal(journalWrites,0);
  assert.equal(Object.values((await store.get('budget')).reservations).length,2);
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
  const unscoredPractice=await finish(practice.view);
  assert.equal(unscoredPractice.seminarProgress.mentorCompleted,true);
  assert.equal(unscoredPractice.view.result.practiceAssessment,undefined);
  assert.equal(unscoredPractice.view.result.total,undefined);
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
