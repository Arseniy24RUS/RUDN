import assert from 'node:assert/strict';
import test from 'node:test';
import {hash} from './schema.mjs';
import {createReceptionService} from './service.mjs';
import {SEMINAR_STORY_PROGRESS_KEY} from './seminar-stories.mjs';
import {createMemoryStore} from './store.mjs';

const learner={uid:'history-learner',studentKey:'12345'};
const owner='student:'+learner.studentKey;
const ownerKey=hash(owner);
const indexPath='sessionIndex/'+ownerKey+'/entries';
const progressPath='seminarProgress/'+ownerKey;
const request={op:'history',context:'seminar'};
const sessionId=number=>number.toString(16).padStart(40,'0');

function record(number,changes={}){
  return {
    id:sessionId(number),owner,context:'seminar',mode:'independent',journeyStage:'independent',
    status:'complete',startedAt:1000+number,updatedAt:5000+number,
    caseData:[{public:{title:{ru:'Вариант '+number,en:'Variant '+number}}}],
    result:{attemptId:'receipt-'+number,completedAt:2000+number,points:0,total:53},
    ...changes
  };
}

function fixture(){
  const store=createMemoryStore();
  const reads=[];
  const service=createReceptionService({
    store:{
      get(path){reads.push(path);return store.get(path);},
      transaction(){assert.fail('Listing history cannot write to the database');}
    },
    provider:{name:'mock',generate(){assert.fail('Listing history cannot call the model');}},
    cases:[],
    saveResult(){assert.fail('Listing history cannot write a grade');}
  });
  async function save(session,{index=true,indexStatus=session.status}={}){
    await store.transaction('sessions/'+session.id,()=>session);
    if(index)await store.transaction(indexPath+'/'+session.id,()=>({
      id:session.id,context:session.context,mode:session.mode,status:indexStatus,startedAt:session.startedAt
    }));
  }
  return {store,reads,save,
    history:(fields={},identity=learner)=>service.handle({...request,...fields},identity),
    frozen:(id,fields={},identity=learner)=>service.handle({op:'resume',sessionId:id,history:true,...fields},identity)
  };
}

test('completed Reception history reads the owner’s index and stage heads without touching the active case',async()=>{
  const {store,save,history,reads}=fixture();
  const old=record(1);
  const active=record(8,{status:'active',result:null});
  const mentor=record(3,{mode:'training',journeyStage:'mentor',
    result:{attemptId:'mentor',completedAt:2300,practiceAssessment:true,total:91}});
  const fallback=record(4,{journeyStage:undefined,context:undefined,mode:'independent',
    result:{attemptId:'legacy',points:4,total:82}});
  const free=record(5,{context:'free'});
  const legacyTraining=record(6,{context:undefined,mode:'training'});
  const otherOwner=record(7,{owner:'student:54321'});
  const lostReceipt=record(9,{mode:'training',journeyStage:'example',
    result:{attemptId:'example',completedAt:2900}});
  for(const session of [old,active,fallback,free,legacyTraining,otherOwner])await save(session);
  await save(mentor,{index:false});
  await save(lostReceipt,{indexStatus:'active'});
  await store.transaction(progressPath,()=>({
    [SEMINAR_STORY_PROGRESS_KEY]:{
      independent:{sessionId:active.id,completed:false},
      mentor:{sessionId:mentor.id,completed:true},
      example:{sessionId:lostReceipt.id,completed:false}
    },
    attempts:{[old.id]:{completed:true}}
  }));
  const response=await history({locale:'en'},{...learner,uid:'same-learner-another-device'});
  assert.equal(response.ok,true);
  assert.equal(response.nextCursor,null);
  assert.deepEqual(Object.fromEntries(response.attempts.map(({id,...fields})=>[id,fields])),{
    [old.id]:{title:'Variant 1',journeyStage:'independent',completedAt:2001,points:0,maxPoints:5,score:53},
    [mentor.id]:{title:'Variant 3',journeyStage:'mentor',completedAt:2300,score:91},
    [fallback.id]:{title:'Variant 4',journeyStage:'independent',completedAt:5004,points:4,maxPoints:5,score:82},
    [lostReceipt.id]:{title:'Variant 9',journeyStage:'example',completedAt:2900}
  });
  assert.equal(reads.filter(path=>path==='sessions/'+old.id).length,1);
  assert(!reads.includes('sessions/'+free.id));
  assert(!reads.includes('sessions/'+legacyTraining.id));
  assert.equal((await store.get('sessions/'+active.id)).status,'active');
});

test('Reception history paginates with a stable cursor and bounded per-page session reads',async()=>{
  const {save,history,reads}=fixture();
  for(let number=1;number<=24;number++)await save(record(number,{startedAt:1000}));
  const first=await history();
  assert.equal(first.attempts.length,12);
  assert.equal(first.attempts[0].id,sessionId(24));
  assert.equal(typeof first.nextCursor,'string');
  assert.equal(reads.filter(path=>path.startsWith('sessions/')).length,12);
  // A result added ahead of the page boundary leaves all older results reachable.
  await save(record(25));
  const second=await history({cursor:first.nextCursor});
  assert.equal(second.attempts.length,12);
  assert.equal(second.attempts[0].id,sessionId(12));
  assert.equal(second.attempts.at(-1).id,sessionId(1));
  assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.attempts,...second.attempts].map(row=>row.id)).size,24);
  assert.equal(reads.filter(path=>path.startsWith('sessions/')).length,24);
});

test('Reception history denies foreign scope and invalid cursors before reading',async()=>{
  const {history,reads}=fixture();
  await assert.rejects(history({studentKey:'54321'}),{code:'forbidden'});
  await assert.rejects(history({context:'free'}),{code:'invalid_context'});
  await assert.rejects(history({cursor:'not-a-position'}),{code:'invalid_cursor'});
  await assert.rejects(history({cursor:42}),{code:'invalid_cursor'});
  await assert.rejects(history({}, {uid:'tester',guest:true}),{code:'forbidden'});
  assert.deepEqual(reads,[]);
});


test('frozen archive rejects active or free sessions and cannot cross owners',async()=>{
  const {save,frozen,reads}=fixture();
  const active=record(1,{status:'active',result:null});
  const free=record(2,{context:'free'});
  const foreign=record(3,{owner:'student:54321'});
  for(const item of [active,free,foreign])await save(item);
  await assert.rejects(frozen(active.id),{code:'not_found'});
  await assert.rejects(frozen(free.id),{code:'not_found'});
  await assert.rejects(frozen(foreign.id),{code:'forbidden'});
  await assert.rejects(frozen(active.id,{context:'free'}),{code:'invalid_context'});
  await assert.rejects(frozen(active.id,{history:'true'}),{code:'invalid_request'});
  await assert.rejects(frozen(active.id,{}, {uid:'visitor',guest:true}),{code:'forbidden'});
  assert.deepEqual(reads,[active,free,foreign].map(item=>'sessions/'+item.id));
});
