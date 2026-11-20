// Exercise the new practice flow against each frozen case, using the public
// service operations and the same JSON boundaries as a Firebase session.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createMemoryStore} from '../firebase/functions/reception-ai/store.mjs';
import {hash} from '../firebase/functions/reception-ai/schema.mjs';
import {SEMINAR_EXAMPLE} from '../firebase/functions/reception-ai/seminar-journey.mjs';

const bank=process.argv[2];
if(!bank)throw Error('Supply the local frozen case directory');
const limit=Number(process.argv[3]||Infinity);
const identity={uid:'offline-practice',studentKey:'99990001'};
const ownerPath='seminarProgress/'+hash('student:'+identity.studentKey);
const counts={examples:0,mentoredCases:0,scoredStarts:0},failures=[];
const options={context:'seminar',workbookVersion:2,decisionVersion:'correspondence-v1',controlVersion:'execution-v1'};
const provider={name:'offline',ready:true,reviewDecision:()=>assert.fail('Practice must not consume a review'),
  generate:()=>assert.fail('This audit only follows guided operations')};

async function checkCase(c,locale,stage){
  const store=createMemoryStore();
  const service=createReceptionService({store,cases:[c],provider,requireGameplay:true,canStartAssessment:async()=>true,
    saveResult:()=>assert.fail('Practice must not write grades')});
  const handle=async body=>(await service.handle(body,identity)).view;
  if(stage==='mentor')await store.transaction(ownerPath,()=>({journey:{example:{completed:true}}}));
  let view=await handle({...options,op:'start',mode:'training',journeyStage:stage,locale,requestId:'practice'});
  assert.equal(view.case.id,c.id);
  const sessionId=view.id;
  let turns=0;
  while(view.status!=='review'){
    assert.ok(++turns<30);
    const guide=view.guidance,step=guide.steps[guide.stepIndex];
    const chooseModel=stage==='mentor'&&['draft','control-request','control-evidence','control-status','control-memo'].includes(step.id);
    const makeBody=id=>({op:'tutorial-step',sessionId,expectedRevision:view.revision,
      requestId:'step-'+view.revision,stepId:step.id,...(chooseModel?{useExample:true}:{choiceId:id})});
    const first=step.correctChoiceId||step.choices[0].id;
    view=await handle(makeBody(first));
    if(view.guidance?.finding){
      assert.ok(view.guidance.finding.correctChoiceId);
      view=await handle(makeBody(view.guidance.finding.correctChoiceId));
    }
  }
  view=await handle({op:'next',sessionId,requestId:'finish'});
  assert.equal(view.status,'complete');
  assert.ok((await store.get(ownerPath)).journey[stage].completed);
  if(stage==='example'){counts.examples++;return;}
  counts.mentoredCases++;
  // Separate fixture: a scored candidate with the same dossier, previously
  // unseen by this learner. Never reuse an assigned tutorial case for points.
  const scoredStore=createMemoryStore();
  await scoredStore.transaction(ownerPath,()=>({journey:{example:{completed:true},mentor:{completed:true}}}));
  const scored=createReceptionService({store:scoredStore,cases:[c],provider,requireGameplay:true,canStartAssessment:async()=>true});
  const {view:exam}=await scored.handle({...options,op:'start',mode:'independent',journeyStage:'independent',locale,requestId:'scored'},identity);
  assert.equal(exam.case.id,c.id);
  assert.ok(!exam.guidance&&!exam.mentorMessages);
  counts.scoredStarts++;
}

const files=(await readdir(bank)).filter(name=>name.endsWith('.json')).sort().slice(0,limit);
for(const name of files){
 const c=JSON.parse(await readFile(resolve(bank,name),'utf8'));
 for(const variant of [c,...(c.dateVariants||[])]){
  const frozen={...variant};delete frozen.dateVariants;
  const example=c.id===SEMINAR_EXAMPLE.caseId;
  if(example&&frozen.datePackId!==SEMINAR_EXAMPLE.datePackId)continue;
  for(const locale of ['ru','en','zh']){
   try{await checkCase(frozen,locale,example?'example':'mentor');}
   catch(e){failures.push({case:c.id,variant:frozen.datePackId,locale,error:e.code||e.message});}
  }
 }
}
console.log(JSON.stringify({counts,failures}));
if(failures.length)process.exitCode=1;
