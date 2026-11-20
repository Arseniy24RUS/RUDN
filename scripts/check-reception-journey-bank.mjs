// Offline acceptance of the actual seminar service with frozen dossiers and scripted reviews.
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createMemoryStore} from '../firebase/functions/reception-ai/store.mjs';
import {hash} from '../firebase/functions/reception-ai/schema.mjs';
import {privateCorrespondenceProfile} from '../firebase/functions/reception-ai/correspondence-profiles.mjs';
import {SEMINAR_EXAMPLE, tutorialGuide, tutorialExecutionAction, validatedTutorialMemo} from '../firebase/functions/reception-ai/seminar-journey.mjs';
import {explicitQAReview} from './reception-correspondence-qa-cases.mjs';
import {createScriptedCorrespondenceReviewer} from './reception-correspondence-test-reviewer.mjs';

const bank = process.argv[2];
if (!bank) throw Error('Supply a frozen case directory');
const limit = Number(process.argv[3] || Infinity);
const identity = {uid:'offline-practice', studentKey:'99990001'};
const progressPath = 'seminarProgress/'+hash('student:'+identity.studentKey);
const options = {context:'seminar', workbookVersion:2, decisionVersion:'correspondence-v1', controlVersion:'execution-v1'};
const counts = {examples:0, mentoredCases:0, scoredCases:0, citations:0, internalRoutes:0, forwardingRoutes:0};
const failures = [];
const controlSteps = ['control-request', 'control-evidence', 'control-status'];

async function checkCase(c, locale, stage) {
  const store = createMemoryStore();
  const scored = stage === 'independent';
  if (stage !== 'example') {
    await store.transaction(progressPath, () => ({journey:{
      example:{completed:true}, ...(scored ? {mentor:{completed:true}} : {})
    }}));
  }
  let writes = 0;
  const provider = {...createScriptedCorrespondenceReviewer({reviews:[explicitQAReview, explicitQAReview]}),
    name:'offline-scripted', ready:true, async reviewMentorWork(){return {ready:true,feedback:'Fixture review',usage:{inputTokens:0,outputTokens:0}};},
    async generate(){assert.fail('No freeform generation is needed for this audit');}};
  const service = createReceptionService({store, cases:[c], provider, guidedSeminarCore:true,
    requireGameplay:true, canStartAssessment:async()=>true, saveResult:async()=>{writes++;}});
  const handle = async body => {
    try { return (await service.handle(body,identity)).view; }
    catch(error){error.operation=[body.op,body.stepId].filter(Boolean).join('/');throw error;}
  };
  let view = await handle({...options, op:'start', mode:scored?'independent':'training',
    journeyStage:stage, locale, requestId:'start'});
  assert.equal(view.case.id,c.id);
  assert.equal(view.coreStepsVersion,'guided-core-v1');
  if(scored) assert.ok(!view.guidance && !view.mentorMessages);
  const profile = privateCorrespondenceProfile(c,locale);
  const guide = tutorialGuide(c,profile,locale,{execution:true,core:true});
  const {decision} = guide;
  const citations = decision.correspondence.citations.filter(row=>row.kind==='legal');
  assert.ok(citations.length);
  assert.deepEqual(citations.map(row=>row.sourceId).sort(),view.case.normativeActs.map(row=>row.id).sort());
  const sessionId = view.id;
  const send = async (op,body={})=>{
    view=await handle({op, sessionId, ...(['next','document'].includes(op)?{}:{expectedRevision:view.revision}),
      requestId:op+'-'+view.revision, ...body});
  };
  const step = async (id,body)=>send(scored?'core-step':'tutorial-step',{stepId:id,...body});
  const workflow = async ()=> (await store.get('sessions/'+sessionId)).caseStates[0].controlWorkflow;
  for(const doc of decision.correspondence.citations.filter(row=>row.kind==='document')){
    if(!view.openedDocumentIds.includes(doc.sourceId))await send('document',{documentId:doc.sourceId});
  }
  if(!scored) await step('reception',{choiceId:'role'});
  await step('materials',{citations});
  assert.deepEqual(view.coreSteps.completed,['materials']);
  await step('calendar',{calendar:{deadline:decision.deadline,referralDeadline:decision.workbook.referralDeadline,
    registrationTimely:decision.workbook.registrationTimely}});
  await step('route',{routing:decision.workbook.routing});
  assert.deepEqual(view.coreSteps.completed,['materials','calendar','route']);
  counts.citations+=citations.length;
  if(decision.workbook.routing.disposition==='internal') counts.internalRoutes++;
  else {assert.ok(decision.workbook.routing.recipientIds.length);counts.forwardingRoutes++;}
  if(scored)await send('decide',{decision});
  else await step('draft',{decision});
  const confirmGuidedChoice = async id => {
    const current=view.guidance?.steps[view.guidance.stepIndex];
    if(current?.id!==id)return;
    const correct=guide.steps.find(item=>item.id===id).choices.find(choice=>choice.correct);
    await step(id,{choiceId:correct.id});
  };
  if(view.status==='followup'){
    if(!scored)await confirmGuidedChoice('control');
    for(const id of controlSteps){
      const initial = await workflow();
      const sample = tutorialExecutionAction(initial,id,guide,{caseData:c,locale,timestamp:Date.now()});
      for(const event of sample.journal.slice(initial.journal.length)){
        const {issueId,kind,reason,instruction,recipientIds,dueDate,expectedResult,evidenceSourceIds}=event;
        await send('control-action',{action:{issueId,kind,reason,instruction,recipientIds,dueDate,expectedResult,evidenceSourceIds}});
      }
      if(!scored)await step(id,{confirmOwn:true});
    }
    const memo=validatedTutorialMemo(await workflow(),profile,guide,locale);
    if(scored)await send('followup',{control:memo});
    else await step('control-memo',{control:memo});
  }
  if(!scored && view.guidance?.steps[view.guidance.stepIndex]?.id==='review') await step('review',{choiceId:'verified'});
  assert.equal(view.status,'review');
  await send('next');
  assert.equal(view.status,'complete');
  assert.equal(writes,scored?1:0);
  if(scored) counts.scoredCases++;
  else {
    assert.ok((await store.get(progressPath)).guidedJourney[stage].completed);
    if(stage==='example') counts.examples++;
    else counts.mentoredCases++;
  }
}

const files=(await readdir(bank)).filter(name=>name.endsWith('.json')).sort().slice(0,limit);
for(const file of files){
  const c=JSON.parse(await readFile(resolve(bank,file),'utf8'));
  for(const variant of [c,...(c.dateVariants||[])]){
    const frozen={...variant}; delete frozen.dateVariants;
    const example=c.id===SEMINAR_EXAMPLE.caseId;
    if(example&&frozen.datePackId!==SEMINAR_EXAMPLE.datePackId)continue;
    for(const stage of example?['example']:['mentor','independent']){
      for(const locale of ['ru','en','zh']){
        try{await checkCase(frozen,locale,stage);}
        catch(error){failures.push({case:c.id,variant:frozen.datePackId,stage,locale,
          operation:error.operation,error:error.code||error.message,location:error.stack?.match(/check-reception-journey-bank.mjs:(\d+)/)?.[1]});}
      }
    }
  }
}
console.log(JSON.stringify({counts,failures}));
if(failures.length)process.exitCode=1;
