import test from 'node:test';
import assert from 'node:assert/strict';
import {bootstrapUpdateCoordinator,UPDATE_PENDING_KEY} from '../site/assets/js/platform-update-coordinator.js';
const CONTRACTS={updateEnvelope:1,adapterSnapshot:1,durableStore:1,modules:{test:1}};
function harness(overrides={}){
  let owner='student:a',route='#activity/x',build='a',list=[],activated=0,rolledBack=0,prepared=0,restored=0;
  const snapshots=new Map(),markers=new Map();
  const storage={getItem:k=>markers.get(k)||null,setItem:(k,v)=>markers.set(k,v),removeItem:k=>markers.delete(k)};
  const store={put:async value=>{snapshots.set(value.token,structuredClone(value));return {durable:true}},get:async key=>snapshots.get(key),remove:async key=>snapshots.delete(key)};
  const release={getReleaseContext:()=>({buildId:build,contracts:CONTRACTS}),checkRelease:async()=>({buildId:'b',previous:{buildId:'a'}}),prepareRelease:async target=>{prepared++;return {ready:true,buildId:target.buildId,context:{contracts:CONTRACTS}}},activatePreparedRelease:()=>{activated++},rollbackRelease:()=>{rolledBack++},markReleaseRestored:()=>restored++};
  const coordinator=bootstrapUpdateCoordinator({getAdapters:()=>list,getOwner:()=>owner,getRoute:()=>route,module:'test',release,store,storage,document:null,window:null,autoStart:false,...overrides});
  const adapter={module:'test',prepareForUpdate:async()=>({status:'ready',resumeToken:'adapter-state'}),resumeAfterUpdate:async()=>({status:'restored'}),cancelPreparation:async()=>{}};
  list=[adapter];
  return {coordinator,release,storage,store,snapshots,adapter,setOwner:x=>owner=x,setRoute:x=>route=x,setBuild:x=>build=x,setAdapters:x=>list=x,counts:()=>({activated,rolledBack,prepared,restored})};
}
test('one verified switch, durable envelope, same owner/route and restored module acknowledgment',async()=>{
  const h=harness();assert.equal((await h.coordinator.check()).status,'switching');assert.equal(h.counts().activated,1);
  const marker=JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY));assert.equal(h.snapshots.get(marker.token).owner,'student:a');
  h.setBuild('b');assert.equal((await h.coordinator.restorePending()).status,'restored');assert.equal(h.counts().restored,1);assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),null);h.coordinator.destroy();
});
test('unsupported flush-only module cannot reload',async()=>{
  const h=harness();h.setAdapters([{flush:async()=>{}}]);assert.equal((await h.coordinator.check()).code,'adapter-not-ready');assert.equal(h.counts().activated,0);h.coordinator.destroy();
});
test('defer thaws every adapter and retries only after state changes',async()=>{
  const h=harness();let cancelled=0;h.adapter.prepareForUpdate=async()=>({status:'defer',code:'conflict'});h.adapter.cancelPreparation=async()=>cancelled++;
  await h.coordinator.check();const before=h.counts().prepared;await h.coordinator.check();assert.equal(h.counts().prepared,before);assert.ok(cancelled>0);h.coordinator.destroy();
});
test('profile switch while preparing cannot associate recovery with next profile',async()=>{
  const h=harness();h.adapter.prepareForUpdate=async()=>{h.setOwner('student:b');return {status:'ready',resumeToken:'adapter-state'}};
  assert.equal((await h.coordinator.check()).status,'defer');assert.equal(h.counts().activated,0);assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),null);h.coordinator.destroy();
});
test('failed persistent marker prevents reload',async()=>{
  const h=harness();h.storage.setItem=()=>{throw new Error('quota')};assert.equal((await h.coordinator.check()).status,'defer');assert.equal(h.counts().activated,0);h.coordinator.destroy();
});
test('restore does not enter another student context',async()=>{
  const h=harness();await h.coordinator.check();h.setBuild('b');h.setOwner('student:b');assert.equal((await h.coordinator.restorePending()).code,'owner-not-ready');assert.equal(h.counts().restored,0);h.coordinator.destroy();
});
test('failed mount restores previous immutable release once then blocks',async()=>{
  const h=harness();await h.coordinator.check();h.setBuild('b');h.adapter.resumeAfterUpdate=async()=>({status:'blocked',code:'incompatible'});
  assert.equal((await h.coordinator.restorePending()).status,'rollback');assert.equal(h.counts().rolledBack,1);
  h.setBuild('a');assert.equal((await h.coordinator.restorePending()).status,'blocked');assert.equal(h.counts().rolledBack,1);h.coordinator.destroy();
});
test('corrupt staged release cannot pause or switch learning state',async()=>{
  const h=harness();let captured=0;h.adapter.prepareForUpdate=async()=>{captured++;return {status:'ready',resumeToken:'a'}};h.release.prepareRelease=async()=>{throw Object.assign(new Error(),{code:'release/integrity'})};
  assert.equal((await h.coordinator.check()).code,'release/integrity');assert.equal(captured,0);assert.equal(h.counts().activated,0);h.coordinator.destroy();
});
test('navigation during awaited restore cannot acknowledge or delete recovery',async()=>{
  const h=harness();await h.coordinator.check();h.setBuild('b');let resolve;
  h.adapter.resumeAfterUpdate=()=>new Promise(done=>resolve=done);
  const pending=h.coordinator.restorePending();await new Promise(done=>setImmediate(done));h.setRoute('#dashboard');resolve({status:'restored'});
  assert.equal((await pending).status,'defer');assert.equal(h.counts().restored,0);assert.ok(h.storage.getItem(UPDATE_PENDING_KEY));assert.equal(h.snapshots.size,1);h.coordinator.destroy();
});
test('destroy during recovery read never enters the retired adapter',async()=>{
  const h=harness();await h.coordinator.check();h.setBuild('b');let resolve,entered=0;const original=h.store.get;
  h.store.get=async key=>{await new Promise(done=>resolve=done);return original(key)};h.adapter.resumeAfterUpdate=async()=>{entered++;return {status:'restored'}};
  const pending=h.coordinator.restorePending();h.coordinator.destroy();resolve();assert.equal((await pending).status,'defer');assert.equal(entered,0);assert.ok(h.storage.getItem(UPDATE_PENDING_KEY));
});

test('process restart recovers marker from the local pointer without assigning another owner',async()=>{
  const values=new Map(),persistentStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const win={location:{href:'https://example.test/_releases/b/index.html#activity/x'},history:{replaceState(_state,_title,url){win.location.href=url}}};
  const h=harness({persistentStorage,window:win});await h.coordinator.check();
  const marker=JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY));h.storage.removeItem(UPDATE_PENDING_KEY);
  win.location.href='https://example.test/_releases/b/index.html?rudnResume='+marker.token+'#activity/x';h.setBuild('b');
  assert.equal((await h.coordinator.restorePending()).status,'restored');assert.equal(h.counts().restored,1);
  assert.equal(values.has(UPDATE_PENDING_KEY+':'+marker.token),false);assert.equal(new URL(win.location.href).searchParams.has('rudnResume'),false);h.coordinator.destroy();
});

test('deadline thaws a hung recovery write and discards its late completion',async()=>{
  const h=harness();let releaseWrite,cancelled=0;h.adapter.cancelPreparation=async()=>{cancelled++};
  const original=h.store.put;h.store.put=async value=>{await new Promise(resolve=>releaseWrite=resolve);return original(value)};
  const started=Date.now();const result=await h.coordinator.check();
  assert.equal(result.status,'defer');assert.equal(result.code,'update/deadline');assert.ok(Date.now()-started<6500);assert.ok(cancelled>0);assert.equal(h.counts().activated,0);
  releaseWrite();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.snapshots.size,0);assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),null);h.coordinator.destroy();
});

test('process close before navigation restores source A and clears the interrupted switch',async()=>{
  const h=harness();await h.coordinator.check();h.coordinator.destroy();
  const restarted=bootstrapUpdateCoordinator({getAdapters:()=>[h.adapter],getOwner:()=> 'student:a',getRoute:()=> '#activity/x',module:'test',release:h.release,store:h.store,storage:h.storage,document:null,window:null,autoStart:false});
  assert.equal((await restarted.restorePending()).status,'restored');assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),null);assert.equal(h.counts().restored,1);restarted.destroy();
});

test('a blocked marker cannot cover another profile with its recovery screen',async()=>{
  const h=harness();await h.coordinator.check();h.setBuild('b');
  const marker=JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY));h.storage.setItem(UPDATE_PENDING_KEY,JSON.stringify({...marker,phase:'blocked',code:'failed'}));h.setOwner('student:b');
  assert.deepEqual(await h.coordinator.restorePending(),{status:'defer',code:'owner-not-ready'});h.coordinator.destroy();
});

test('late rollback rejection after destroy cannot write a blocked recovery marker',async()=>{
  const h=harness();await h.coordinator.check();h.setBuild('b');let reject;
  h.adapter.resumeAfterUpdate=async()=>({status:'blocked',code:'failed'});
  h.release.prepareRelease=()=>new Promise((_resolve,fail)=>reject=fail);
  const pending=h.coordinator.restorePending();await new Promise(resolve=>setImmediate(resolve));h.coordinator.destroy();reject(new Error('network'));
  assert.deepEqual(await pending,{status:'defer',code:'context-changed'});assert.equal(JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY)).phase,'restoring');
});

test('incompatible save contracts defer before pausing or checkpointing the activity',async()=>{
  const h=harness();let checkpoints=0;h.adapter.prepareForUpdate=async()=>{checkpoints++;return {status:'ready',resumeToken:'test'}};
  h.release.prepareRelease=async target=>({ready:true,buildId:target.buildId,context:{contracts:{...CONTRACTS,adapterSnapshot:2}}});
  assert.equal((await h.coordinator.check()).code,'incompatible-contract');assert.equal(checkpoints,0);assert.equal(h.counts().activated,0);h.coordinator.destroy();
});
