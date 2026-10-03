import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync,commitStudentAttempt} from '../site/assets/js/checkpoint-sync.js';
import {createSettlementsPersistence} from '../site/assets/js/settlements-storage.js';
import {commitSettlementsLeaderboard} from '../site/assets/js/settlements-leaderboard.js';
import {mountSettlementsCourseReceipt} from '../site/assets/js/settlements-course-status.js';

// Real persistence/outbox/commit code, isolated memory transport. No network or
// production identities. Kept separate from test-settlements-storage so importing
// its fixture does not register that unrelated test suite.
const memoryStorage=()=>{const values=new Map();return {get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}};
function memoryCloud(){
  let root={},offline=false;const writes=[];
  const get=path=>path.split('/').reduce((value,key)=>value?.[key],root)??null;
  const requireOnline=()=>{if(offline)throw Object.assign(new Error('synthetic offline'),{code:'network/offline'})};
  return {writes,setOffline:value=>offline=value,root:()=>structuredClone(root),
    get:async path=>{requireOnline();return {value:structuredClone(get(path))}},
    transaction:async(path,update)=>{requireOnline();const next=update(structuredClone(get(path)));if(next!==undefined){const parts=path.split('/'),leaf=parts.pop();let target=root;for(const part of parts)target=target[part]||={};target[leaf]=structuredClone(next);writes.push(path);}return {value:structuredClone(get(path))}}};
}
function harness(cloud,{device='receipt-device',studentKey='synthetic-recovery',storage=memoryStorage()}={}){
  const owner=`student:${studentKey}`,uid='synthetic-uid',profile={studentKey,fullName:'Synthetic Receipt Test',group:'TEST'};
  const store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null});
  const backend={generation:1,user:{uid},getProfile:()=>profile,isAdmin:()=>false,restTransport:()=>cloud};
  const sync=createCheckpointSync({store,transport:cloud,deviceId:device,getIdentity:()=>({owner,studentKey,uid,generation:backend.generation}),commitAttempt:async(attempt,{signal,active})=>{
    const saved=await commitStudentAttempt(cloud,attempt,{studentKey,uid,activityMax:{'seminar-3':5},signal,active});
    if(attempt.leaderboard)await commitSettlementsLeaderboard(cloud,saved,{signal,active});return saved;
  }});
  backend.durableSync=()=>sync;const adapters=[];
  const create=(options={})=>{const adapter=createSettlementsPersistence({...options,backend,owner,mode:'assessment',store,writerOptions:{locks:null,storage}});adapters.push(adapter);return adapter};
  return {owner,studentKey,backend,store,sync,create,storage,async close(){for(const adapter of adapters)await adapter.destroy();sync.stop();store.close()}};
}
const party=()=>({attemptId:'synthetic-attempt',regionId:'chelyabinsk',difficulty:'hard',engineSave:{actions:[],engineVersion:'3'},elapsedMs:0,status:'active'});
const result=()=>({terminal:true,reason:'complete',coverageNp:100,coveragePopulation:100,turns:3,spentMillionRub:57});
async function seedOfflineCompletion(h,cloud){
  const game=h.create();assert.equal(await game.acquireWriter(),true);await game.saveSession(party());assert.equal(await game.confirmOnline(),true);
  cloud.setOffline(true);
  const completed=await game.completeSession({...party(),engineSave:{actions:['one','two','three'],ui:{terminalReason:'complete'}},elapsedMs:1200},result());
  assert.equal(completed.status,'completion-pending');assert.equal((await h.store.listAttempts({owner:h.owner})).length,0);
  await game.destroy();return completed;
}
function watcher(h,{factory,settled=()=>{}}={}){
  const target=new EventTarget(),listeners=new Set(),timers=new Map();let nextTimer=0;
  const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);
  target.addEventListener=(name,fn,...args)=>{listeners.add(fn);return add(name,fn,...args)};
  target.removeEventListener=(name,fn,...args)=>{listeners.delete(fn);return remove(name,fn,...args)};
  const handle=mountSettlementsCourseReceipt({backend:h.backend,owner:h.owner,store:h.store,onSettled:settled,
    persistenceFactory:factory||((options)=>h.create(options)),eventTarget:target,
    setIntervalFn:(fn,ms)=>{assert.equal(ms,15000);const id=++nextTimer;timers.set(id,fn);return id},clearIntervalFn:id=>timers.delete(id)});
  return {handle,listeners,timers,online:()=>target.dispatchEvent(new Event('online')),tick:()=>{for(const fn of [...timers.values()])fn()}};
}
function assertDelivered(h,cloud){
  const root=cloud.root(),attempt=root.attempts?.[h.studentKey]?.['synthetic-attempt'];
  assert.equal(attempt?.type,'settlements');assert.equal(attempt?.points,5);assert.equal(attempt?.recordGrade,true);
  assert.equal(root.grades?.[h.studentKey]?.['seminar-3']?.points,5);
  assert.equal(root.settlementsLeaderboard?.assessment?.hard?.['synthetic-attempt']?.coverageNp,100);
  assert.equal(Object.keys(root.attempts[h.studentKey]).length,1);
  assert.equal(Object.keys(root.settlementsLeaderboard.assessment.hard).length,1);
  return {attempt,grade:root.grades[h.studentKey]['seminar-3'],ranking:root.settlementsLeaderboard.assessment.hard['synthetic-attempt']};
}
function assertNoCredit(h,cloud){const root=cloud.root();assert.equal(root.attempts?.[h.studentKey],undefined);assert.equal(root.grades?.[h.studentKey],undefined);assert.equal(root.settlementsLeaderboard,undefined)}
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
async function waitForEvent(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('watcher event did not settle within 2 seconds')),2000)})])}finally{clearTimeout(timer)}}

test('leaving offline completion: dashboard watcher creates immutable attempt, grade and ranking once',async()=>{
  const cloud=memoryCloud(),h=harness(cloud);let receipt,settled=0;
  try{
    await seedOfflineCompletion(h,cloud);assertNoCredit(h,cloud);cloud.setOffline(false);
    receipt=watcher(h,{settled:()=>settled++});await receipt.handle.ready;
    const original=assertDelivered(h,cloud);assert.equal((await h.store.listAttempts({owner:h.owner})).length,1);assert.equal(settled,1);
    await Promise.all([receipt.handle.retry(),receipt.handle.retry()]);receipt.online();receipt.tick();await receipt.handle.retry();
    assert.deepEqual(assertDelivered(h,cloud),original);assert.equal((await h.store.listAttempts({owner:h.owner})).length,1);assert.equal(settled,1);
    assert.equal(cloud.writes.filter(path=>path===`attempts/${h.studentKey}/synthetic-attempt`).length,1);
    await receipt.handle.destroy();assert.equal(receipt.listeners.size,0);assert.equal(receipt.timers.size,0);
    const writes=cloud.writes.length;receipt.online();receipt.tick();await receipt.handle.retry();assert.equal(cloud.writes.length,writes);
  }finally{await receipt?.handle.destroy();await h.close()}
});

test('watcher preserves offline pending result and online event retries without opening the game',async()=>{
  const cloud=memoryCloud(),h=harness(cloud),delivered=deferred();let receipt,settled=0;
  try{
    await seedOfflineCompletion(h,cloud);receipt=watcher(h,{settled:()=>{settled++;delivered.resolve()}});await receipt.handle.ready;
    assertNoCredit(h,cloud);assert.equal(settled,0);
    cloud.setOffline(false);receipt.online();await waitForEvent(delivered.promise);assertDelivered(h,cloud);assert.equal(settled,1);
  }finally{await receipt?.handle.destroy();await h.close()}
});

test('15 second retry timer alone delivers pending result when no online event arrives',async()=>{
  const cloud=memoryCloud(),h=harness(cloud),delivered=deferred();let receipt;
  try{
    await seedOfflineCompletion(h,cloud);receipt=watcher(h,{settled:()=>delivered.resolve()});await receipt.handle.ready;
    assertNoCredit(h,cloud);assert.equal(receipt.timers.size,1);
    cloud.setOffline(false);receipt.tick();await waitForEvent(delivered.promise);assertDelivered(h,cloud);
  }finally{await receipt?.handle.destroy();await h.close()}
});

test('conflicting completed local branch does not create a grade or immutable result',async()=>{
  const cloud=memoryCloud(),a=harness(cloud),b=harness(cloud,{device:'other-device'});let receipt;
  try{
    const game=a.create(),other=b.create();await game.acquireWriter();await game.saveSession(party());await game.confirmOnline();
    await other.acquireWriter();await other.loadSession();cloud.setOffline(true);
    await game.completeSession({...party(),elapsedMs:1200,engineSave:{actions:['completed-local'],ui:{terminalReason:'complete'}}},result());
    await other.saveSession({...party(),elapsedMs:100,engineSave:{actions:['different-cloud']}});await other.flush();await game.destroy();
    cloud.setOffline(false);await other.flush();await other.destroy();
    receipt=watcher(a,{settled:()=>assert.fail('conflicted branch must not settle')});await receipt.handle.ready;await receipt.handle.retry();
    assertNoCredit(a,cloud);assert.equal((await a.store.listAttempts({owner:a.owner})).length,0);
    assert.ok((await a.store.listConflicts({owner:a.owner})).some(conflict=>!conflict.resolvedAt),'both branches remain available for explicit choice');
  }finally{await receipt?.handle.destroy();await a.close();await b.close()}
});

test('losing writer between acquisition and flush cannot finalize an assessment',async()=>{
  const cloud=memoryCloud(),h=harness(cloud);let receipt,acquisitions=0;
  try{
    await seedOfflineCompletion(h,cloud);cloud.setOffline(false);
    receipt=watcher(h,{settled:()=>assert.fail('lost writer must not settle'),factory:options=>{
      const adapter=h.create(options);return {...adapter,acquireWriter:async()=>{const acquired=await adapter.acquireWriter();acquisitions++;await adapter.destroy();return acquired}};
    }});
    await receipt.handle.ready;await receipt.handle.retry();assert.ok(acquisitions>0);assertNoCredit(h,cloud);
    assert.equal((await h.store.listAttempts({owner:h.owner})).length,0);
  }finally{await receipt?.handle.destroy();await h.close()}
});

test('terminal active replay without validated result never receives credit from dashboard watcher',async()=>{
  const cloud=memoryCloud(),h=harness(cloud);let receipt;
  try{
    const game=h.create();await game.acquireWriter();await game.saveSession({...party(),engineSave:{actions:['unverified'],ui:{terminalReason:'complete'}}});await game.flush();await game.destroy();
    receipt=watcher(h,{settled:()=>assert.fail('unverified active replay must not settle')});await receipt.handle.ready;await receipt.handle.retry();
    assertNoCredit(h,cloud);assert.equal((await h.store.listAttempts({owner:h.owner})).length,0);
  }finally{await receipt?.handle.destroy();await h.close()}
});
