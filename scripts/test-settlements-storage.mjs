import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync,commitStudentAttempt,mergeCheckpoint} from '../site/assets/js/checkpoint-sync.js';
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

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
for(const which of ['tutorial','assessment','free'])test(`${which}: a queued newer checkpoint cannot inherit an older online ACK`,async()=>{
  const cloud=memoryCloud(),h=harness(cloud,{mode:which==='free'?'free':'assessment'});
  const field=which==='tutorial'?'tutorialState':'state';
  const save=actions=>which==='tutorial'?h.adapter.saveTutorial({completed:false,step:actions.length,engineSave:{actions}}):h.adapter.saveSession({...session(),engineSave:{actions}});
  const networkEntered=deferred(),networkRelease=deferred(),localEntered=deferred(),localRelease=deferred();
  let queued;
  try{
    await h.adapter.acquireWriter();await save([]);await h.adapter.flush();
    assert.equal(h.status.at(-1)[field],'saved');
    const transaction=cloud.transaction;
    cloud.transaction=async(...args)=>{cloud.transaction=transaction;networkEntered.resolve();await networkRelease.promise;return transaction(...args)};
    await save(['first']);await networkEntered.promise;
    const checkpoint=h.store.checkpoint;
    h.store.checkpoint=async(...args)=>{h.store.checkpoint=checkpoint;localEntered.resolve();await localRelease.promise;return checkpoint(...args)};
    const statusStart=h.status.length;
    queued=save(['first','second']);
    // The invocation is observable immediately, before it can enter the serial
    // queue occupied by the previous revision's network request.
    assert.equal(h.status.at(-1)[field],'pending','new save announces pending synchronously');
    networkRelease.resolve();await localEntered.promise;
    assert.equal(h.status.at(-1)[field],'pending','old ACK does not acknowledge queued local work');
    assert.ok(h.status.slice(statusStart).every(event=>event[field]!=='saved'),'no transient saved emission before the latest local checkpoint');
    localRelease.resolve();await queued;await h.adapter.flush();
    assert.equal(h.status.at(-1)[field],'saved');
    const fresh=harness(cloud,{device:'fresh-status-device',mode:which==='free'?'free':'assessment'});
    try{await fresh.adapter.acquireWriter();const restored=which==='tutorial'?await fresh.adapter.loadTutorial():await fresh.adapter.loadSession();assert.deepEqual(restored.engineSave.actions,['first','second']);}
    finally{await fresh.close()}
  }finally{networkRelease.resolve();localRelease.resolve();await queued?.catch(()=>{});await h.close()}
});

test('pending counters stay scoped; local failure stays unsafe until retry and offline snapshots remain writable',async()=>{
  const cloud=memoryCloud(),h=harness(cloud),entered=deferred(),release=deferred();let saving;
  try{
    await h.adapter.acquireWriter();await h.adapter.saveSession(session());await h.adapter.flush();
    await h.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}});await h.adapter.flush();
    const checkpoint=h.store.checkpoint;
    h.store.checkpoint=async()=>{entered.resolve();await release.promise;throw Object.assign(new Error('local write failed'),{code:'storage/unavailable'})};
    saving=h.adapter.saveTutorial({completed:false,step:1,engineSave:{actions:['failed']}});
    assert.equal(h.status.at(-1).tutorialState,'pending');assert.equal(h.status.at(-1).state,'saved','independent session ACK remains valid');
    await entered.promise;release.resolve();await assert.rejects(saving,{code:'storage/unavailable'});
    assert.equal(h.status.at(-1).tutorialState,'unsafe','a rejected latest local write cannot expose the previous ACK');
    await h.adapter.flush();assert.equal(h.status.at(-1).tutorialState,'unsafe');
    h.store.checkpoint=checkpoint;cloud.setOffline(true);
    await h.adapter.saveTutorial({completed:false,step:1,engineSave:{actions:['retry-offline']}});await h.adapter.flush();
    assert.equal(h.status.at(-1).tutorialState,'pending');assert.equal(h.adapter.canWrite(),true);
    const local=await h.store.loadDraft({owner:h.owner,activitySlug:'settlements-tutorial',mode:'tutorial'});
    assert.deepEqual(local.state.engineSave.actions,['retry-offline']);assert.equal(local.saveStatus.durable,true);
    cloud.setOffline(false);await h.adapter.flush();assert.equal(h.status.at(-1).tutorialState,'saved');
  }finally{release.resolve();await saving?.catch(()=>{});await h.close()}
});

test('exact score threshold and leaderboard order',()=>{
  assert.equal(settlementsPoints('hard',89.9999),0);assert.equal(settlementsPoints('hard',90),5);
  assert.equal(settlementsPoints('normal',90),4);assert.equal(settlementsPoints('easy',90),3);
  assert.equal(settlementsPoints('hard',100,false),0);assert.equal(settlementsPoints('hard',100,true,'free'),0);
  const base={mode:'assessment',difficulty:'hard',coverageNp:90,coveragePopulation:90,turns:3,elapsedMs:100,completedAt:1};
  const rows=[{...base,id:'a',participantId:'one',spentMillionRub:5},{...base,id:'b',participantId:'one',spentMillionRub:3},{...base,id:'c',participantId:'two',spentMillionRub:2},{...base,id:'d',participantId:'three',spentMillionRub:1,coverageNp:89.99}];
  assert.deepEqual(selectSettlementsLeaders(rows,{difficulty:'hard'}).map(row=>row.id),['c','b']);
});

test('assessment probes the actual server despite a false mobile offline hint',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});
  const cloud=memoryCloud(),h=harness(cloud);
  try{
    await h.adapter.acquireWriter();await h.adapter.saveSession({...session(),engineSave:null});
    assert.equal(await h.adapter.confirmOnline(),true);
    cloud.setOffline(true);
    await h.adapter.saveSession({...session(),engineSave:{actions:['pending']}});
    assert.equal(await h.adapter.confirmOnline(),false,'a real server failure still blocks a new assessment');
  }finally{await h.adapter.destroy();if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
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

test('stale tutorial reconciliation retains both complete replays without advancing its remote base',()=>{
  const identity={owner:'student:123456789',studentKey:'123456789',activitySlug:'settlements-tutorial',mode:'tutorial',attemptId:'tutorial-v1'};
  const branch=(deviceId,lastIntentId,localRevision,remoteRevision,state)=>({...identity,deviceId,lastIntentId,localRevision,remoteRevision,state});
  const base=mergeCheckpoint(null,branch('device-a','base',1,null,{completed:false,step:0,engineSave:{actions:[]}}),{ownerUid:'user'}).next;
  const advanced=mergeCheckpoint(base,branch('device-a','cloud',2,1,{completed:false,step:2,engineSave:{actions:['base','cloud']}}),{ownerUid:'user'}).next;
  const stale=branch('device-b','local',2,1,{completed:true,step:6,engineSave:{actions:['base','local']}});
  const merged=mergeCheckpoint(advanced,stale,{ownerUid:'user'});
  assert.equal(merged.conflict,true);assert.equal(merged.next.revision,3);
  assert.deepEqual(merged.next.current.state.engineSave.actions,['base','cloud']);assert.equal(merged.next.current.state.step,2);
  assert.deepEqual(merged.next.conflicts.local.state.engineSave.actions,['base','local']);assert.equal(merged.next.conflicts.local.remoteRevision,1);
  assert.equal(merged.next.current.state.completed,true,'the completion gate is monotonic without replacing the cloud replay');
  assert.equal(mergeCheckpoint(merged.next,stale,{ownerUid:'user'}).next,undefined,'uncertain retry is idempotent');
});

for(const choice of ['local','cloud'])for(const completedBranch of ['local','cloud']){
  test(`tutorial ${choice} selection retains whole replay, OR completion from ${completedBranch}, and the party return contract`,async()=>{
    const cloud=memoryCloud(),a=harness(cloud),b=harness(cloud,{device:'tutorial-device-b'});
    const tutorialScope={owner:a.owner,activitySlug:'settlements-tutorial',mode:'tutorial'};
    try{
      await a.adapter.acquireWriter();await a.adapter.saveSession(session());await a.adapter.confirmOnline();
      await a.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}});await a.adapter.flush();
      assert.equal(a.status.at(-1).tutorialState,'saved','tutorial reports its own cloud acknowledgement');
      await b.adapter.acquireWriter();await b.adapter.loadTutorial();
      cloud.setOffline(true);
      await a.adapter.saveTutorial({completed:completedBranch==='local',step:2,engineSave:{actions:['local-tutorial']}});await a.adapter.flush();
      await b.adapter.saveTutorial({completed:completedBranch==='cloud',step:5,engineSave:{actions:['cloud-tutorial']}});await b.adapter.flush();
      cloud.setOffline(false);await b.adapter.flush();await a.adapter.flush();
      assert.equal(a.conflicts.at(-1).scope,'tutorial');assert.equal(a.adapter.canWrite(),false);
      assert.deepEqual(a.conflicts.at(-1).local.engineSave.actions,['local-tutorial']);
      assert.deepEqual(a.conflicts.at(-1).cloud.engineSave.actions,['cloud-tutorial']);
      await a.adapter.loadSession();assert.equal(a.adapter.canWrite(),false,'loading a party cannot clear a tutorial conflict');
      const reopened=await a.adapter.loadTutorial();
      assert.deepEqual(reopened.engineSave.actions,['local-tutorial'],'ACK of a conflict cannot authorize later automatic replacement');
      assert.equal(reopened.completed,true);
      await assert.rejects(a.adapter.saveSession(session()),{code:'storage/conflict'});
      await assert.rejects(a.adapter.completeSession(session(),result()),{code:'storage/conflict'});
      await assert.rejects(a.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}}),{code:'storage/conflict'});
      assert.equal(cloud.root().attempts,undefined,'a tutorial conflict blocks immutable party completion');
      const before=await a.store.loadDraft(tutorialScope);
      const restoredSession=await a.adapter.resolveConflict(choice);
      assert.equal(restoredSession.attemptId,'attempt-one','tutorial resolution never returns a tutorial in place of the party');
      const selected=await a.adapter.loadTutorial();
      assert.deepEqual(selected.engineSave.actions,[`${choice}-tutorial`]);assert.equal(selected.step,choice==='local'?2:5);
      assert.equal(selected.completed,true);assert.equal(a.adapter.canWrite(),true);
      const after=await a.store.loadDraft(tutorialScope);assert.ok(after.revision>before.revision);
      const remote=cloud.root().checkpoints['123456789']['settlements-tutorial']['tutorial-v1'];
      assert.equal(remote.conflicts,undefined);assert.equal(remote.current.state.completed,true);
      const history=Object.values(remote.conflictHistory);assert.equal(history.length,1);
      const obsolete={...history[0].branches.cloud,lastIntentId:'obsolete-cloud-edit',localRevision:999,remoteRevision:2};
      assert.equal(mergeCheckpoint(remote,obsolete,{ownerUid:'user-one'}).conflict,true,'the original cloud device cannot bypass a resolution through sameBranch');
      assert.deepEqual(JSON.parse(history[0].branches.local.state.engineSave).actions,['local-tutorial']);
      assert.deepEqual(JSON.parse(history[0].branches.cloud.state.engineSave).actions,['cloud-tutorial']);
      assert.ok((await a.store.listConflicts({owner:a.owner})).every(item=>item.resolvedAt));
      await a.adapter.saveTutorial({...selected,completed:false,step:0,engineSave:{actions:[]}});await a.adapter.flush();
      const undone=await a.adapter.loadTutorial();assert.equal(undone.completed,true);assert.equal(undone.step,0);assert.deepEqual(undone.engineSave.actions,[]);
    }finally{await a.close();await b.close()}
  });
}

test('pending local tutorial is preserved when restoration first discovers cloud completion, including after reopen',async()=>{
  const cloud=memoryCloud(),storage=memoryStorage(),a=harness(cloud,{storage}),b=harness(cloud,{device:'tutorial-cloud'});let reopened;
  try{
    await a.adapter.acquireWriter();await a.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}});await a.adapter.flush();
    assert.equal(a.status.at(-1).tutorialState,'saved','tutorial ACK does not depend on a party draft');
    await b.adapter.acquireWriter();
    cloud.setOffline(true);await a.adapter.saveTutorial({completed:false,step:2,engineSave:{actions:['pending-local']}});await a.adapter.flush();
    cloud.setOffline(false);await b.adapter.saveTutorial({completed:true,step:6,engineSave:{actions:['completed-cloud']}});await b.adapter.flush();
    const tutorial=await a.adapter.loadTutorial();assert.equal(tutorial.completed,true);assert.deepEqual(tutorial.engineSave.actions,['pending-local']);
    assert.equal(a.conflicts.at(-1).scope,'tutorial');assert.equal(a.adapter.canWrite(),false);
    assert.equal(a.status.at(-1).tutorialState,'conflict');
    const pending=await a.store.listPending({owner:a.owner,includeDeferred:true});assert.equal(pending.length,1);assert.deepEqual(pending[0].payload.state.engineSave.actions,['pending-local']);
    await a.close();reopened=harness(cloud,{storage});
    assert.equal(await reopened.adapter.acquireWriter(),false,'the reacquired writer stays frozen by the retained tutorial conflict');
    assert.equal(reopened.conflicts.at(-1).scope,'tutorial');
    assert.equal(await reopened.adapter.resolveConflict('local'),null,'no party is invented by tutorial resolution');
    const resolved=await reopened.adapter.loadTutorial();assert.equal(resolved.completed,true);assert.deepEqual(resolved.engineSave.actions,['pending-local']);
    assert.equal(reopened.adapter.canWrite(),true);
  }finally{await a.close();await b.close();await reopened?.close()}
});

test('resolving a party conflict keeps writes frozen until the independent tutorial choice',async()=>{
  const cloud=memoryCloud(),a=harness(cloud),b=harness(cloud,{device:'both-device'});
  try{
    await a.adapter.acquireWriter();await a.adapter.saveSession(session());await a.adapter.confirmOnline();
    await a.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}});await a.adapter.flush();await b.adapter.acquireWriter();
    cloud.setOffline(true);
    await a.adapter.saveSession({...session(),engineSave:{actions:['party-local']}});await a.adapter.flush();
    await a.adapter.saveTutorial({completed:false,step:1,engineSave:{actions:['tutorial-local']}});await a.adapter.flush();
    await b.adapter.saveSession({...session(),engineSave:{actions:['party-cloud']}});await b.adapter.flush();
    await b.adapter.saveTutorial({completed:true,step:6,engineSave:{actions:['tutorial-cloud']}});await b.adapter.flush();
    cloud.setOffline(false);await b.adapter.flush();await a.adapter.loadSession();await a.adapter.loadTutorial();
    assert.equal(a.conflicts.at(-1).scope,'session');
    assert.deepEqual((await a.adapter.resolveConflict('cloud')).engineSave.actions,['party-cloud']);
    assert.equal(a.conflicts.at(-1).scope,'tutorial');assert.equal(a.adapter.canWrite(),false);
    await assert.rejects(a.adapter.completeSession(session(),result()),{code:'storage/conflict'});
    assert.deepEqual((await a.adapter.resolveConflict('local')).engineSave.actions,['party-cloud']);
    assert.deepEqual((await a.adapter.loadTutorial()).engineSave.actions,['tutorial-local']);assert.equal(a.adapter.canWrite(),true);
  }finally{await a.close();await b.close()}
});

for(const explicitScope of [false,true])test(`tutorial choice retains ${explicitScope?'explicit host':'call-time default'} scope across a queued restore race`,async()=>{
  const cloud=memoryCloud(),a=harness(cloud),b=harness(cloud,{device:'scope-race-device'});
  let unblock;
  try{
    await a.adapter.acquireWriter();await a.adapter.saveSession(session());await a.adapter.confirmOnline();
    await a.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}});await a.adapter.flush();await b.adapter.acquireWriter();
    cloud.setOffline(true);
    await a.adapter.saveSession({...session(),engineSave:{actions:['party-local']}});await a.adapter.flush();
    await a.adapter.saveTutorial({completed:false,step:1,engineSave:{actions:['tutorial-local']}});await a.adapter.flush();
    await b.adapter.saveSession({...session(),engineSave:{actions:['party-cloud']}});await b.adapter.flush();
    await b.adapter.saveTutorial({completed:true,step:6,engineSave:{actions:['tutorial-cloud']}});await b.adapter.flush();
    cloud.setOffline(false);await b.adapter.flush();await a.adapter.loadTutorial();
    const presentedScope=a.conflicts.at(-1).scope;assert.equal(presentedScope,'tutorial');
    let entered;
    const started=new Promise(resolve=>entered=resolve),barrier=new Promise(resolve=>unblock=resolve);
    const originalFlushLocal=a.store.flushLocal;
    a.store.flushLocal=async()=>{a.store.flushLocal=originalFlushLocal;entered();await barrier;return originalFlushLocal()};
    const ongoing=a.adapter.flush();await started;
    let clicked;
    if(explicitScope){
      // Host captured the shown scope before awaiting its scene release.
      await a.adapter.loadSession();
      clicked=a.adapter.resolveConflict('local',presentedScope);
    }else{
      clicked=a.adapter.resolveConflict('local');
      await a.adapter.loadSession();
    }
    assert.equal(a.conflicts.at(-1).scope,'session','an independent restore changes the current conflict while the choice waits');
    unblock();await ongoing;
    assert.deepEqual((await clicked).engineSave.actions,['party-local'],'the return contract still exposes the unselected party');
    const records=cloud.root().checkpoints['123456789'];
    assert.equal(records['seminar-3']['attempt-one'].conflictHistory,undefined,'tutorial click never resolves the party');
    const history=Object.values(records['settlements-tutorial']['tutorial-v1'].conflictHistory);
    assert.equal(history.length,1);assert.equal(history[0].selected,'local');
    await assert.rejects(a.adapter.resolveConflict('local',presentedScope),{code:'storage/no-conflict'},'a late repeated click cannot resolve the already selected scope again');
    assert.equal(Object.keys(cloud.root().checkpoints['123456789']['settlements-tutorial']['tutorial-v1'].conflictHistory).length,1);
    assert.deepEqual((await a.adapter.loadTutorial()).engineSave.actions,['tutorial-local']);
    assert.equal(a.conflicts.at(-1).scope,'session');assert.equal(a.adapter.canWrite(),false);
    await a.adapter.resolveConflict('cloud','session');assert.equal(a.adapter.canWrite(),true);
  }finally{unblock?.();await a.close();await b.close()}
});
