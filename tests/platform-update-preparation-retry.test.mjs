import test from 'node:test';
import assert from 'node:assert/strict';
import {bootstrapUpdateCoordinator,UPDATE_PENDING_KEY} from '../site/assets/js/platform-update-coordinator.js';

const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32);
const CONTRACTS={schema:1,updateEnvelope:1,adapterSnapshot:1,durableStore:1,modules:{test:1,other:1}};
const target=buildId=>({buildId,manifestSha256:'1'.repeat(64),manifestURL:`/_releases/${buildId}/manifest.json`,entryURL:`/_releases/${buildId}/index.html`,previous:{buildId:A}});
const failure=code=>Object.assign(new Error(code),{code});
const settled=()=>new Promise(resolve=>setImmediate(resolve));
async function advance(t,ms){t.mock.timers.tick(ms);await settled()}

// Use the actual coordinator with simulated platform boundaries. Only the clock,
// resource API, storage and DOM event sources are controlled by these tests.
function harness(t,{autoStart=false}={}){
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:0});
  let owner='synthetic:a',route='#activity/test',module='test',descriptor=target(B),input='initial',gate=null;
  let prepare=async()=>{throw failure('release/integrity')};
  const counts={pointer:0,prepared:0,checkpoint:0,cancel:0,activated:0,diagnostic:0};
  const snapshots=new Map(),markers=new Map(),signals=[],preparedTargets=[];
  const win=new EventTarget(),doc=new EventTarget();
  win.navigator={onLine:true};doc.visibilityState='visible';doc.documentElement={lang:'ru'};
  const storage={getItem:key=>markers.get(key)||null,setItem:(key,value)=>markers.set(key,value),removeItem:key=>markers.delete(key)};
  const store={put:async value=>{snapshots.set(value.token,structuredClone(value));return {durable:true}},get:async key=>snapshots.get(key),remove:async key=>snapshots.delete(key)};
  const adapter={
    module:'test',
    prepareForUpdate:async()=>{counts.checkpoint++;return gate?{status:'defer',code:gate}:{status:'ready',resumeToken:`saved-${input}`}},
    resumeAfterUpdate:async()=>({status:'restored'}),
    cancelPreparation:async()=>{counts.cancel++}
  };
  let list=[adapter];
  const release={
    getReleaseContext:()=>({buildId:A,contracts:CONTRACTS}),
    checkRelease:async()=>{counts.pointer++;return structuredClone(descriptor)},
    prepareRelease:async (value,options)=>{counts.prepared++;signals.push(options.signal);preparedTargets.push(value);return prepare(value,options)},
    activatePreparedRelease:()=>{counts.activated++}
  };
  const ready=value=>({ready:true,buildId:value.buildId,context:{contracts:CONTRACTS}});
  const create=()=>bootstrapUpdateCoordinator({getAdapters:()=>list,getOwner:()=>owner,getRoute:()=>route,module:()=>module,release,store,storage,persistentStorage:storage,window:win,document:doc,autoStart,diagnostics:{record:()=>counts.diagnostic++}});
  const coordinator=create();
  t.after(()=>coordinator.destroy());
  return {
    coordinator,create,counts,release,store,storage,snapshots,adapter,win,doc,signals,preparedTargets,ready,
    setPrepare:value=>prepare=value,recover:()=>prepare=async value=>ready(value),
    setTarget:value=>descriptor=value,setOwner:value=>owner=value,setRoute:value=>route=value,
    setModule:value=>{module=value;adapter.module=value},setAdapters:value=>list=value,
    setInput:value=>input=value,setGate:value=>gate=value,
    emit:(type,surface=win)=>surface.dispatchEvent(new Event(type))
  };
}

for(const code of ['release/integrity','release/resource-unavailable'])test(`${code}: unrelated UI wakes never re-prepare the same failed resources`,async t=>{
  const h=harness(t);h.setPrepare(async()=>{throw failure(code)});
  assert.equal((await h.coordinator.check()).code,code);
  const initial={...h.counts};
  for(let cycle=0;cycle<3;cycle++){
    for(const event of ['input','pointerup','change','compositionend']){
      const beforePointer=h.counts.pointer;
      h.emit(event,h.doc);await advance(t,800);
      assert.equal(h.counts.pointer,beforePointer,'Ordinary input is not a release polling source');
    }
    h.emit('rudn:update-state-changed');await advance(t,800);
    h.coordinator.notifyStateChanged();await advance(t,800);
  }
  assert.equal(h.counts.prepared,1,'Typing, gestures and generic state notifications do not repair release bytes');
  assert.equal(h.counts.checkpoint,0);assert.equal(h.counts.activated,0);assert.equal(h.snapshots.size,0);
  assert.equal(h.counts.cancel,initial.cancel);assert.equal(h.counts.diagnostic,initial.diagnostic);
});

for(const change of ['new-build','manifest-hash','manifest-url','entry-url'])test(`a changed release descriptor escapes the preparation fence: ${change}`,async t=>{
  const h=harness(t);await h.coordinator.check();
  const next=target(B);
  if(change==='new-build')Object.assign(next,target(C));
  if(change==='manifest-hash')next.manifestSha256='2'.repeat(64);
  if(change==='manifest-url')next.manifestURL+='?revision=2';
  if(change==='entry-url')next.entryURL=`/_releases/${B}/another.html`;
  h.setTarget(next);h.recover();
  assert.equal((await h.coordinator.check('interval')).status,'switching');
  assert.equal(h.counts.prepared,2);assert.equal(h.preparedTargets[1].manifestSha256,next.manifestSha256);
  assert.equal(h.counts.activated,1);
});

test('unchanged target recovers on the existing five-minute interval without user input',async t=>{
  const h=harness(t,{autoStart:true});await settled();
  assert.equal(h.counts.prepared,1);
  h.recover();await advance(t,299999);
  assert.equal(h.counts.prepared,1);assert.equal(h.counts.activated,0);
  await advance(t,1);
  assert.equal(h.counts.prepared,2);assert.equal(h.counts.activated,1);
});

test('a slow failed response does not move the existing five-minute retry cadence',async t=>{
  const h=harness(t,{autoStart:true});let rejectPrepare;
  h.setPrepare(()=>new Promise((_resolve,reject)=>{rejectPrepare=reject}));await settled();
  await advance(t,1000);rejectPrepare(failure('release/resource-unavailable'));await settled();
  h.recover();await advance(t,299000);
  assert.equal(h.counts.prepared,2);assert.equal(h.counts.activated,1);
});

test('a repeatedly failing target gets at most one heavy retry per five minutes',async t=>{
  const h=harness(t,{autoStart:true});await settled();
  for(let period=1;period<=2;period++){
    await advance(t,300000);
    assert.equal(h.counts.prepared,period+1);
    h.emit('rudn:update-state-changed');h.emit('input',h.doc);await advance(t,800);
    assert.equal(h.counts.prepared,period+1);
  }
  assert.equal(h.counts.activated,0);assert.equal(h.counts.checkpoint,0);
});

test('an observed offline-to-online recovery can immediately retry the same target',async t=>{
  const h=harness(t);h.setPrepare(async()=>{throw failure('release/resource-unavailable')});await h.coordinator.check();
  h.win.navigator.onLine=false;h.emit('offline');await advance(t,800);
  assert.equal(h.counts.prepared,1);
  h.recover();h.win.navigator.onLine=true;h.emit('online');await advance(t,800);
  assert.equal(h.counts.prepared,2);assert.equal(h.counts.activated,1);
});

test('repeated online events without an observed recovery do not bypass the resource fence',async t=>{
  const h=harness(t);await h.coordinator.check();
  for(let n=0;n<3;n++){h.emit('online');await advance(t,800)}
  assert.equal(h.counts.prepared,1);assert.equal(h.counts.activated,0);
});

for(const event of ['rudn:module-ready','pageshow','visibilitychange','online'])test(`${event} still checks the pointer and discovers a newer target`,async t=>{
  const h=harness(t);await h.coordinator.check();const before=h.counts.pointer;
  h.setTarget(target(C));h.recover();h.emit(event,event==='visibilitychange'?h.doc:h.win);await advance(t,800);
  assert.equal(h.counts.pointer,before+1);assert.equal(h.counts.prepared,2);assert.equal(h.counts.activated,1);
});

for(const event of ['rudn:module-ready','pageshow','visibilitychange'])test(`${event} checks the pointer without retrying unchanged bad bytes`,async t=>{
  const h=harness(t);await h.coordinator.check();const before=h.counts.pointer;
  h.emit(event,event==='visibilitychange'?h.doc:h.win);await advance(t,800);
  assert.equal(h.counts.pointer,before+1);assert.equal(h.counts.prepared,1);
});

for(const gate of ['composing','file-pending','unsaved-input'])test(`${gate}: a real checkpoint change retries promptly and captures the latest input`,async t=>{
  const h=harness(t);h.recover();h.setGate(gate);
  assert.equal((await h.coordinator.check()).code,gate);
  await h.coordinator.check();assert.equal(h.counts.prepared,1);assert.ok(h.counts.cancel>0);
  h.setInput('latest');h.setGate(null);h.emit(gate==='composing'?'compositionend':'input',h.doc);
  await advance(t,799);assert.equal(h.counts.activated,0);
  await advance(t,1);assert.equal(h.counts.activated,1);assert.equal(h.counts.checkpoint,2);
  const marker=JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY));
  assert.equal(h.snapshots.get(marker.token).adapters[0].resumeToken,'saved-latest');
});

for(const change of ['owner','route','owner-roundtrip','route-roundtrip','adapter'])test(`a late failure from an obsolete ${change} context cannot block the new context`,async t=>{
  const h=harness(t);let rejectOld;
  h.setPrepare(()=>new Promise((_resolve,reject)=>{rejectOld=reject}));
  const old=h.coordinator.check();await settled();assert.equal(typeof rejectOld,'function');
  if(change.startsWith('owner')){
    h.setOwner('synthetic:b');h.emit('rudn:identitychange');
    if(change.endsWith('roundtrip')){h.setOwner('synthetic:a');h.emit('rudn:identitychange')}
  }else if(change.startsWith('route')){
    h.setRoute('#activity/next');h.emit('hashchange');
    if(change.endsWith('roundtrip')){h.setRoute('#activity/test');h.emit('hashchange')}
  }else{
    h.setAdapters([{...h.adapter}]);h.emit('rudn:module-ready');
  }
  rejectOld(failure('release/resource-unavailable'));await old;h.recover();
  assert.equal((await h.coordinator.check()).status,'switching');
  assert.equal(h.counts.prepared,2);assert.equal(h.counts.activated,1);
});

test('a different module resource pack can prepare after the previous pack failed',async t=>{
  const h=harness(t);await h.coordinator.check();h.setModule('other');h.recover();
  assert.equal((await h.coordinator.check()).status,'switching');assert.equal(h.counts.prepared,2);
});

test('concurrent checks remain single-flight during resource preparation',async t=>{
  const h=harness(t);let finish;h.setPrepare(value=>new Promise(resolve=>{finish=()=>resolve(h.ready(value))}));
  const first=h.coordinator.check();await settled();
  const second=h.coordinator.check('interval');h.emit('rudn:update-state-changed');await advance(t,800);
  assert.equal(first,second);assert.equal(h.counts.prepared,1);
  finish();assert.equal((await first).status,'switching');assert.equal(h.counts.activated,1);
});

test('destroy aborts obsolete preparation and a fresh coordinator can prepare normally',async t=>{
  const h=harness(t);let rejectOld;h.setPrepare(()=>new Promise((_resolve,reject)=>{rejectOld=reject}));
  const old=h.coordinator.check();await settled();h.coordinator.destroy();
  assert.equal(h.signals[0].aborted,true);rejectOld(failure('release/resource-unavailable'));await old;
  h.recover();const next=h.create();
  try{assert.equal((await next.check()).status,'switching');assert.equal(h.counts.activated,1)}finally{next.destroy()}
});

test('the checkpoint deadline still cancels, thaws and rejects a late durable write',async t=>{
  const h=harness(t);h.recover();let finishWrite;const put=h.store.put;
  h.store.put=async value=>{await new Promise(resolve=>{finishWrite=resolve});return put(value)};
  const running=h.coordinator.check();await settled();assert.equal(typeof finishWrite,'function');
  await advance(t,5000);assert.equal((await running).code,'update/deadline');
  assert.equal(h.signals[0].aborted,true);assert.ok(h.counts.cancel>0);assert.equal(h.counts.activated,0);
  finishWrite();await settled();assert.equal(h.snapshots.size,0);assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),null);
});
