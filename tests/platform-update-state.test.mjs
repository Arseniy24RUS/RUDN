import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdateAdapter,createUpdateSnapshotStore} from '../site/assets/js/platform-update-state.js';

function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}}
function setup(overrides={}){
  const storage=memoryStorage(),store=createUpdateSnapshotStore({indexedDB:null,storage});
  let identity={owner:'student:A',attemptId:'attempt-1'},revision=1,paused=false,restored=null,writes=0;
  const adapter=createUpdateAdapter({module:'test',store,getIdentity:()=>identity,getRevision:()=>revision,pause:value=>{paused=value},capture:()=>({screen:'question',index:3}),checkpoint:async()=>{writes++;return {durable:true,revision:8,checkpointRef:'draft-8'}},restore:async value=>{restored=value;return {status:'restored'}},...overrides});
  return {adapter,store,get paused(){return paused},get writes(){return writes},get restored(){return restored},setIdentity:value=>{identity=value},mutate:()=>revision++};
}
test('ready requires explicit checkpoint, persistent UI snapshot and retains input pause',async()=>{
  const s=setup();const result=await s.adapter.prepareForUpdate({targetRelease:{buildId:'b'}});
  assert.equal(result.status,'ready');assert.equal(s.paused,true);assert.equal(s.writes,1);
  const saved=await s.store.get(result.resumeToken);assert.equal(saved.identity.owner,'student:A');assert.equal(saved.revision,8);assert.deepEqual(saved.state,{screen:'question',index:3});
  assert.deepEqual(await s.adapter.prepareForUpdate({targetRelease:{buildId:'b'}}),result);assert.equal(s.writes,1);
  assert.equal((await s.adapter.resumeAfterUpdate({resumeToken:result.resumeToken})).status,'restored');assert.equal(s.restored.checkpointRef,'draft-8');
  await s.adapter.cancelPreparation();assert.equal(s.paused,false);s.adapter.destroy();
});
test('old flush result cannot certify durability',async()=>{
  const s=setup({checkpoint:async()=>undefined});assert.deepEqual(await s.adapter.prepareForUpdate({targetRelease:'b'}),{status:'blocked',code:'not-durable'});assert.equal(s.paused,false);s.adapter.destroy();
});
test('latest revision is required even when an older checkpoint completes',async()=>{
  let release;const waiting=new Promise(resolve=>release=resolve);const s=setup({checkpoint:async()=>{await waiting;return {durable:true,revision:1}}});
  const pending=s.adapter.prepareForUpdate({targetRelease:'b'});await new Promise(resolve=>setImmediate(resolve));s.mutate();release();
  assert.deepEqual(await pending,{status:'defer',code:'revision-changed'});assert.equal(s.paused,false);s.adapter.destroy();
});
test('owner change while checkpoint runs blocks reload and preserves ownership',async()=>{
  let release;const waiting=new Promise(resolve=>release=resolve);const s=setup({checkpoint:async()=>{await waiting;return {durable:true}}});
  const pending=s.adapter.prepareForUpdate({targetRelease:'b'});await new Promise(resolve=>setImmediate(resolve));s.setIdentity({owner:'student:B',attemptId:'attempt-1'});release();
  assert.deepEqual(await pending,{status:'blocked',code:'owner-changed'});assert.equal(s.paused,false);s.adapter.destroy();
});
test('identity mismatch cannot restore another student or attempt',async()=>{
  const s=setup();const result=await s.adapter.prepareForUpdate({targetRelease:'b'});await s.adapter.cancelPreparation();s.setIdentity({owner:'student:A',attemptId:'attempt-2'});
  assert.equal((await s.adapter.resumeAfterUpdate(result)).status,'blocked');assert.equal(s.restored,null);s.adapter.destroy();
});
test('busy interaction defers without invoking save or pause',async()=>{
  const s=setup({isBusy:()=>true});assert.deepEqual(await s.adapter.prepareForUpdate({targetRelease:'b'}),{status:'defer',code:'interaction-active'});assert.equal(s.writes,0);assert.equal(s.paused,false);s.adapter.destroy();
});
test('timeout releases the old page and late completion cannot return ready',async()=>{
  let release;const waiting=new Promise(resolve=>release=resolve);const s=setup({checkpoint:async()=>{await waiting;return {durable:true}}});
  assert.equal((await s.adapter.prepareForUpdate({targetRelease:'b',deadlineAt:Date.now()+15})).status,'defer');assert.equal(s.paused,false);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(s.adapter.updatePrepared,false);s.adapter.destroy();
});
test('abort after ready releases preparation; next build gets a new snapshot',async()=>{
  const s=setup(),controller=new AbortController();const first=await s.adapter.prepareForUpdate({targetRelease:'b',signal:controller.signal});controller.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(s.paused,false);
  const second=await s.adapter.prepareForUpdate({targetRelease:'c'});assert.equal(second.status,'ready');assert.notEqual(second.resumeToken,first.resumeToken);assert.equal(s.writes,2);s.adapter.destroy();
});
test('oversize state is rejected without truncation or a ready receipt',async()=>{
  const s=setup({capture:()=>({draft:'x'.repeat(262145)})});const result=await s.adapter.prepareForUpdate({targetRelease:'b'});assert.equal(result.code,'snapshot-oversize');assert.equal(result.status,'blocked');assert.equal(s.paused,false);s.adapter.destroy();
});
test('unavailable durable storage blocks update',async()=>{
  const store=createUpdateSnapshotStore({indexedDB:null,storage:null});const s=setup({store});assert.equal((await s.adapter.prepareForUpdate({targetRelease:'b'})).status,'blocked');assert.equal(s.paused,false);s.adapter.destroy();
});
test('cancel discards only uncommitted snapshots; reload teardown retains committed state',async()=>{
  const a=setup();const first=await a.adapter.prepareForUpdate({targetRelease:'b'});await a.adapter.cancelPreparation();assert.equal(await a.store.get(first.resumeToken),null);a.adapter.destroy();
  const b=setup();const second=await b.adapter.prepareForUpdate({targetRelease:'b'});b.adapter.commitPreparation();b.adapter.destroy();assert.ok(await b.store.get(second.resumeToken));
});
test('a delayed storage read cannot restore into a destroyed module',async()=>{
  const s=setup();const result=await s.adapter.prepareForUpdate({targetRelease:'b'});let release;const original=s.store.get;
  s.store.get=async key=>{await new Promise(resolve=>release=resolve);return original(key)};
  const pending=s.adapter.resumeAfterUpdate(result);s.adapter.destroy();release();assert.equal((await pending).status,'defer');assert.equal(s.restored,null);
});

test('an IndexedDB open that never completes falls back to a verified local snapshot',async()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const store=createUpdateSnapshotStore({indexedDB:{open:()=>({})},storage,timeoutMs:10});
  const record={token:'hung-db-test',state:{position:42}};assert.equal((await store.put(record)).durable,true);assert.deepEqual(await store.get(record.token),record);
  await store.remove(record.token);assert.equal(values.size,0);
});

test('an asynchronous pause finishing after the deadline cannot freeze the old page',async()=>{
  let finishPause,paused=false;
  const s=setup({pause:async value=>{if(value)await new Promise(resolve=>finishPause=resolve);paused=value}});
  const result=await s.adapter.prepareForUpdate({targetRelease:'b',deadlineAt:Date.now()+15});assert.equal(result.status,'defer');assert.equal(paused,false);
  finishPause();await new Promise(resolve=>setImmediate(resolve));assert.equal(paused,false);s.adapter.destroy();
});
