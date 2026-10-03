import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync,commitStudentAttempt} from '../site/assets/js/checkpoint-sync.js';
import {createSettlementsPersistence} from '../site/assets/js/settlements-storage.js';
import {commitSettlementsLeaderboard,selectSettlementsLeaders,settlementsPoints} from '../site/assets/js/settlements-leaderboard.js';
import {rekeyStudentAttempt} from '../site/assets/js/student-identity.js';
import {planRosterUpdate,applyPatch,ticketHash} from './roster-migration.mjs';

export const memoryStorage=()=>{const values=new Map();return {get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}};
export function memoryCloud(){
  let root={},offline=false;
  const get=path=>path.split('/').reduce((value,key)=>value?.[key],root)??null;
  const set=(path,value)=>{const parts=path.split('/'),leaf=parts.pop();let p=root;for(const part of parts)p=p[part]||={};p[leaf]=structuredClone(value)};
  return {setOffline:value=>offline=value,root:()=>structuredClone(root),get:async path=>{if(offline)throw Object.assign(new Error('offline'),{code:'network/offline'});return {value:structuredClone(get(path))}},transaction:async(path,update)=>{if(offline)throw Object.assign(new Error('offline'),{code:'network/offline'});const next=update(structuredClone(get(path)));if(next!==undefined)set(path,next);return {value:structuredClone(get(path))}}};
}
export function harness(cloud,{device='device-one',studentKey='123456789',uid='user-one',mode='assessment',storage=memoryStorage()}={}){
  const owner=`student:${studentKey}`,profile={studentKey,fullName:'Synthetic Student',group:'ГГУбд-01-26'};
  const store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null});
  const backend={generation:1,user:{uid},getProfile:()=>profile,isAdmin:()=>false,restTransport:()=>cloud};
  const sync=createCheckpointSync({store,transport:cloud,deviceId:device,getIdentity:()=>({owner,studentKey,uid,generation:backend.generation}),commitAttempt:async(attempt,{signal,active})=>{
    const saved=await commitStudentAttempt(cloud,attempt,{studentKey,uid,activityMax:{'seminar-3':5},signal,active});
    if(attempt.leaderboard)await commitSettlementsLeaderboard(cloud,saved,{signal,active});return saved;
  }});
  backend.durableSync=()=>sync;
  const conflicts=[],status=[];
  const adapter=createSettlementsPersistence({backend,owner,mode,store,onConflict:value=>conflicts.push(value),onStatus:value=>status.push(value),writerOptions:{locks:null,storage}});
  return {store,backend,sync,adapter,conflicts,status,owner,async close(){await adapter.destroy();sync.stop();store.close()}};
}
const session=(attemptId='attempt-one')=>({attemptId,regionId:'chelyabinsk',difficulty:'hard',engineSave:{actions:[],engineVersion:'3'},elapsedMs:0,status:'active'});
const result=(coverageNp=100)=>({terminal:true,coverageNp,coveragePopulation:99.9,turns:3,spentMillionRub:57,reason:coverageNp===100?'complete':'budget_exhausted'});

test('exact score threshold and leaderboard order',()=>{
  assert.equal(settlementsPoints('hard',89.9999),0);assert.equal(settlementsPoints('hard',90),5);
  assert.equal(settlementsPoints('normal',90),4);assert.equal(settlementsPoints('easy',90),3);
  assert.equal(settlementsPoints('hard',100,false),0);assert.equal(settlementsPoints('hard',100,true,'free'),0);
  const base={mode:'assessment',difficulty:'hard',coverageNp:90,coveragePopulation:90,turns:3,elapsedMs:100,completedAt:1};
  const rows=[{...base,id:'a',participantId:'one',spentMillionRub:5},{...base,id:'b',participantId:'one',spentMillionRub:3},{...base,id:'c',participantId:'two',spentMillionRub:2},{...base,id:'d',participantId:'three',spentMillionRub:1,coverageNp:89.99}];
  assert.deepEqual(selectSettlementsLeaders(rows,{difficulty:'hard'}).map(row=>row.id),['c','b']);
});

test('each turn and undo have increasing revisions; exact attempt lookup',async()=>{
  const h=harness(memoryCloud());try{
    assert.equal(await h.adapter.acquireWriter(),true);assert.equal(h.adapter.canWrite(),true);
    await h.adapter.saveSession({...session(),engineSave:null});assert.equal(await h.adapter.confirmOnline(),true);
    await h.adapter.saveSession(session());assert.equal(await h.adapter.confirmOnline(),true);
    const first=await h.store.loadDraft({owner:h.owner,activitySlug:'seminar-3',mode:'settlements-assessment'});
    await h.adapter.saveSession({...session(),engineSave:{actions:['build']},elapsedMs:500});await h.adapter.flush();
    await h.adapter.saveSession({...session(),engineSave:{actions:[]},elapsedMs:600});await h.adapter.flush();
    const undone=await h.store.loadDraft({owner:h.owner,activitySlug:'seminar-3',mode:'settlements-assessment'});
    assert.ok(undone.revision>first.revision);assert.deepEqual(undone.state.engineSave.actions,[]);
    await h.adapter.saveSession({...session(),engineSave:{actions:[]},elapsedMs:600,status:'abandoned'});await h.adapter.flush();
    await h.adapter.saveSession(session('attempt-two'));await h.adapter.flush();
    assert.equal((await h.store.loadDraft({owner:h.owner,activitySlug:'seminar-3',mode:'settlements-assessment',attemptId:'attempt-one'})).state.elapsedMs,600);
  }finally{await h.close()}
});

test('offline terminal state does not create immutable result; reconnect delivers once and retains best grade',async()=>{
  const cloud=memoryCloud(),h=harness(cloud);try{
    await h.adapter.acquireWriter();await h.adapter.saveSession(session());await h.adapter.confirmOnline();
    cloud.setOffline(true);
    const pending=await h.adapter.completeSession({...session(),elapsedMs:1000},result(90));
    assert.equal(pending.status,'completion-pending');assert.equal((await h.store.listAttempts({owner:h.owner})).length,0);
    await assert.rejects(h.adapter.saveSession(session('attempt-two')),{code:'settlements/completion-pending'},'starting another attempt cannot strand the pending result');
    cloud.setOffline(false);
    for(const op of await h.store.listPending({owner:h.owner,includeDeferred:true}))await h.store.retry(op.id,{revision:op.revision});
    await h.adapter.flush();await h.adapter.flush();
    assert.equal((await h.adapter.loadSession()).status,'completed');
    const all=cloud.root();assert.equal(all.grades['123456789']['seminar-3'].points,5);
    assert.equal(Object.keys(all.attempts['123456789']).length,1);
    assert.equal(Object.keys(all.settlementsLeaderboard.assessment.hard).length,1);
    assert.equal((await h.store.listPending({owner:h.owner,includeDeferred:true})).length,0);
    assert.equal('studentKey' in all.settlementsLeaderboard.assessment.hard['attempt-one'],false);
  }finally{await h.close()}
});

test('restoration reads cloud despite local cache; conflict preserves both branches until explicit resolution',async()=>{
  const cloud=memoryCloud(),a=harness(cloud),b=harness(cloud,{device:'device-two'});try{
    await a.adapter.acquireWriter();await a.adapter.saveSession(session());await a.adapter.confirmOnline();
    await b.adapter.acquireWriter();assert.equal((await b.adapter.loadSession()).attemptId,'attempt-one');
    cloud.setOffline(true);
    await a.adapter.saveSession({...session(),engineSave:{actions:['local-a']}});await a.adapter.flush();
    await b.adapter.saveSession({...session(),engineSave:{actions:['local-b']}});await b.adapter.flush();
    cloud.setOffline(false);
    for(const op of await b.store.listPending({owner:b.owner,includeDeferred:true}))await b.store.retry(op.id,{revision:op.revision});
    await b.adapter.flush();
    await a.adapter.loadSession();assert.equal(a.adapter.canWrite(),false);assert.ok(a.conflicts.length);
    assert.deepEqual(a.conflicts.at(-1).local.engineSave.actions,['local-a']);assert.deepEqual(a.conflicts.at(-1).cloud.engineSave.actions,['local-b']);
    await a.adapter.resolveConflict('cloud');assert.equal(a.adapter.canWrite(),true);
    assert.deepEqual((await a.adapter.loadSession()).engineSave.actions,['local-b']);
    const history=await a.store.listConflicts({owner:a.owner});assert.ok(history.every(value=>value.resolvedAt));
  }finally{await a.close();await b.close()}
});

test('tutorial completion stays monotonic; free results never create grade; profile switch freezes writer',async()=>{
  const cloud=memoryCloud(),h=harness(cloud,{mode:'free'});try{
    await h.adapter.acquireWriter();await h.adapter.saveTutorial({completed:true,step:6,engineSave:{actions:['tutorial']}});
    await h.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}});
    assert.equal((await h.adapter.loadTutorial()).completed,true);
    await h.adapter.saveSession(session());await h.adapter.confirmOnline();await h.adapter.completeSession({...session(),elapsedMs:999},result());await h.adapter.flush();
    assert.equal(cloud.root().grades,undefined);assert.equal(cloud.root().attempts['123456789']['attempt-one'].recordGrade,false);
    h.backend.generation++;assert.equal(h.adapter.canWrite(),false);await assert.rejects(h.adapter.saveSession(session('other')),{code:'auth/profile-changed'});
  }finally{await h.close()}
});

test('canonical profile migration preserves opaque public result key and unifies participant identity',()=>{
  const source='123456789',canonical='987654321',publicId='opaque-attempt-abc';
  const record={id:publicId,studentKey:source,type:'settlements',ownerUid:'source-uid',activitySlug:'seminar-3',points:5,leaderboard:{id:publicId,participantId:'old-opaque',mode:'assessment',difficulty:'hard'}};
  const moved=rekeyStudentAttempt(record,source,canonical);
  assert.equal(moved.leaderboard.id,publicId);assert.equal(moved.leaderboardAttemptId,publicId);
  const root={profiles:{[source]:{studentKey:source,fullName:'Synthetic old',group:'ГГУбд-01-26',ownerUid:'source-uid'},[canonical]:{studentKey:canonical,fullName:'Synthetic canonical',group:'ГГУбд-01-26',ownerUid:'canonical-uid'}},attempts:{[source]:{[publicId]:record}},settlementsOwners:{[publicId]:{studentKey:source,attemptId:publicId,ownerUid:'source-uid',participantId:'old-opaque'}},settlementsLeaderboard:{assessment:{hard:{[publicId]:record.leaderboard}}}};
  const options={official:[{ticket:canonical,name:'Synthetic canonical',group:'ГГУбд-01-26'}],merges:{[canonical]:[source]},cohortSuffix:'-26',timestamp:'2026-10-03T00:00:00Z'};
  const plan=planRosterUpdate(root,options),after=applyPatch(root,plan.patch);
  assert.equal(after.settlementsOwners[publicId].studentKey,canonical);
  assert.equal(after.settlementsOwners[publicId].attemptId,`merged-${source}-${publicId}`);
  assert.equal(after.settlementsLeaderboard.assessment.hard[publicId].participantId,ticketHash('rudn-settlements-v1:'+canonical));
  assert.deepEqual(after.attempts[source][publicId],record,'original historical evidence remains intact');
  assert.equal(planRosterUpdate(after,options).counts.paths,0,'repeat migration is idempotent');
});

test('resolving a race after local completion archives the unacknowledged attempt and delivers the selected branch',async()=>{
  const cloud=memoryCloud(),a=harness(cloud),b=harness(cloud,{device:'racing-device'});
  const scope={owner:a.owner,activitySlug:'seminar-3',mode:'settlements-assessment',attemptId:'attempt-one'};
  try{
    await a.adapter.acquireWriter();await a.adapter.saveSession(session());await a.adapter.confirmOnline();
    await b.adapter.acquireWriter();
    // Window after the first device's cloud-head check but before final delivery.
    await a.store.complete({...scope,state:{...session(),status:'completed',result:result(),completedAt:100},attempt:{id:'attempt-one',type:'settlements',points:5,activitySlug:'seminar-3'}});
    await b.adapter.saveSession({...session(),engineSave:{actions:['cloud-branch']},elapsedMs:1000});await b.adapter.flush();
    await a.adapter.loadSession();assert.equal(a.adapter.canWrite(),false);
    const selected=await a.adapter.resolveConflict('cloud');assert.equal(selected.status,'active');
    assert.equal((await a.store.listAttempts({owner:a.owner})).length,0,'obsolete attempt cannot occupy the selected branch result slot');
    assert.ok((await a.store.listConflicts({owner:a.owner})).some(conflict=>conflict.reason==='unacknowledged-attempt-superseded'&&conflict.attempt.payload.points===5));
    await a.adapter.completeSession(selected,{...result(90),spentMillionRub:73});await a.adapter.flush();
    assert.equal(cloud.root().attempts['123456789']['attempt-one'].result.spentMillionRub,73);
    assert.equal(cloud.root().settlementsLeaderboard.assessment.hard['attempt-one'].spentMillionRub,73);
  }finally{await a.close();await b.close()}
});

test('assessment and free play share one profile writer and cannot concurrently change tutorial',async()=>{
  const cloud=memoryCloud(),storage=memoryStorage(),assessment=harness(cloud,{storage}),free=harness(cloud,{storage,mode:'free'});
  try{
    assert.equal(await assessment.adapter.acquireWriter(),true);
    assert.equal(await free.adapter.acquireWriter(),false,'same profile in another mode is read-only');
    await assessment.adapter.saveTutorial({completed:true,step:6,engineSave:{actions:[]}});
    await assessment.adapter.flush();
    await assessment.close();
    assert.equal(await free.adapter.acquireWriter(),true);
    assert.equal((await free.adapter.loadTutorial()).completed,true);
  }finally{await assessment.close();await free.close()}
});
