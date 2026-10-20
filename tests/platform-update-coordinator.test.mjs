import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {bootstrapUpdateCoordinator,UPDATE_PENDING_KEY} from '../site/assets/js/platform-update-coordinator.js';
const CONTRACTS={schema:1,updateEnvelope:1,adapterSnapshot:1,durableStore:1,modules:{test:1}};
for(const invalid of ['missing-adapters','empty-adapters','missing-module','missing-token','missing-metadata'])test('boot failure keeps malformed checkpoint in recovery: '+invalid,async()=>{
  const win=new EventTarget(),h=harness({window:win});await h.coordinator.check();h.coordinator.destroy();h.setBuild('b');
  const marker=JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY)),envelope=h.snapshots.get(marker.token);
  if(invalid==='missing-adapters')delete envelope.adapters;
  if(invalid==='empty-adapters')envelope.adapters=[];
  if(invalid==='missing-module')delete envelope.adapters[0].module;
  if(invalid==='missing-token')delete envelope.adapters[0].resumeToken;
  if(invalid==='missing-metadata')delete envelope.checkpointContracts;
  const current=h.restart();
  try{
    const event=new Event('rudn:release-boot-failed',{cancelable:true});win.dispatchEvent(event);
    await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(event.defaultPrevented,true);assert.equal(h.counts().rolledBack,0);assert.equal(h.counts().restored,0);
    const saved=JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY));assert.equal(saved.phase,'blocked');assert.equal(saved.code,'update/rollback-incompatible-contract');
    assert.equal(saved.token,marker.token);assert.equal(h.snapshots.has(marker.token),true);
  }finally{current.destroy()}
});
function harness(overrides={}){
  const A='a'.repeat(32),B='b'.repeat(32);
  let owner='student:a',route='#activity/x',build=A,list=[],activated=0,rolledBack=0,prepared=0,restored=0;
  const snapshots=new Map(),markers=new Map();
  const storage={getItem:k=>markers.get(k)||null,setItem:(k,v)=>markers.set(k,v),removeItem:k=>markers.delete(k)};
  const store={put:async value=>{snapshots.set(value.token,structuredClone(value));return {durable:true}},get:async key=>snapshots.get(key),remove:async key=>snapshots.delete(key)};
  const release={getReleaseContext:()=>({buildId:build,contracts:CONTRACTS}),checkRelease:async()=>({buildId:B,previous:{buildId:A}}),prepareRelease:async target=>{prepared++;return {ready:true,buildId:target.buildId,context:{contracts:CONTRACTS}}},activatePreparedRelease:()=>{activated++},rollbackRelease:()=>{rolledBack++},markReleaseRestored:()=>restored++};
  const restart=()=>bootstrapUpdateCoordinator({getAdapters:()=>list,getOwner:()=>owner,getRoute:()=>route,module:'test',release,store,storage,persistentStorage:storage,document:null,window:null,autoStart:false,...overrides});
  const coordinator=restart();
  const adapter={module:'test',prepareForUpdate:async()=>({status:'ready',resumeToken:'adapter-state'}),resumeAfterUpdate:async()=>({status:'restored'}),cancelPreparation:async()=>{}};
  list=[adapter];
  return {coordinator,restart,release,storage,store,snapshots,adapter,setOwner:x=>owner=x,setRoute:x=>route=x,setBuild:x=>build=x.length===1?x.repeat(32):x,setAdapters:x=>list=x,counts:()=>({activated,rolledBack,prepared,restored})};
}

test('a failed target cannot loop after successful rollback in fresh document coordinators',async()=>{
  const h=harness();await h.coordinator.check();h.coordinator.destroy();
  h.setBuild('b');h.adapter.resumeAfterUpdate=async()=>({status:'blocked',code:'failed'});
  const broken=h.restart();assert.equal((await broken.restorePending()).status,'rollback');broken.destroy();
  h.setBuild('a');h.adapter.resumeAfterUpdate=async()=>({status:'restored'});
  const previous=h.restart();assert.equal((await previous.restorePending()).status,'restored');previous.destroy();
  assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),null);
  const reopened=h.restart();assert.deepEqual(await reopened.check('interval'),{status:'defer',code:'failed-release'});
  assert.equal(h.counts().activated,1);assert.equal(h.counts().rolledBack,1);
  h.release.checkRelease=async()=>({buildId:'c'.repeat(32),previous:{buildId:'a'.repeat(32)}});
  assert.equal((await reopened.check('online')).status,'switching');assert.equal(h.counts().activated,2);reopened.destroy();
});

test('rollback keeps recovery snapshots if its failure fence cannot be saved',async()=>{
  const h=harness();await h.coordinator.check();h.coordinator.destroy();h.setBuild('b');
  h.adapter.resumeAfterUpdate=async()=>({status:'blocked',code:'failed'});
  const broken=h.restart();assert.equal((await broken.restorePending()).status,'rollback');broken.destroy();
  h.setBuild('a');h.adapter.resumeAfterUpdate=async()=>({status:'restored'});
  const restored=h.restart(),write=h.storage.setItem;
  h.storage.setItem=(key,value)=>{if(key==='rudn.update.failed-releases.v1')throw Error('quota');write(key,value)};
  assert.deepEqual(await restored.restorePending(),{status:'blocked',code:'update/failure-fence-unavailable'});
  assert.equal(JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY)).phase,'blocked');assert.equal(h.snapshots.size,1);restored.destroy();
});

test('a hung rollback fetch reaches bounded recovery without losing snapshots',async()=>{
  const h=harness();await h.coordinator.check();h.setBuild('b');let signal;
  h.adapter.resumeAfterUpdate=async()=>({status:'blocked',code:'failed'});
  h.release.prepareRelease=(_target,options)=>{signal=options.signal;return new Promise(()=>{})};
  const start=Date.now();assert.deepEqual(await h.coordinator.restorePending(),{status:'blocked',code:'update/rollback-timeout'});
  assert.ok(Date.now()-start<6500);assert.equal(signal.aborted,true);assert.equal(h.snapshots.size,1);
  assert.equal(JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY)).phase,'blocked');assert.equal(h.counts().rolledBack,0);h.coordinator.destroy();
});

test('boot failure and adapter failure share one pending fallback and one navigation',async()=>{
  const win=new EventTarget(),h=harness({window:win});await h.coordinator.check();h.coordinator.destroy();h.setBuild('b');const broken=h.restart();
  h.adapter.resumeAfterUpdate=async()=>({status:'blocked',code:'failed'});let resolve,calls=0;
  h.release.prepareRelease=()=>{calls++;return new Promise(done=>resolve=done)};
  const restoring=broken.restorePending();await new Promise(done=>setImmediate(done));
  const boot=new Event('rudn:release-boot-failed',{cancelable:true});win.dispatchEvent(boot);await new Promise(done=>setImmediate(done));
  assert.equal(boot.defaultPrevented,true);assert.equal(calls,1);resolve({ready:true,context:{contracts:CONTRACTS}});
  assert.equal((await restoring).status,'rollback');await new Promise(done=>setImmediate(done));assert.equal(h.counts().rolledBack,1);
  const late=new Event('rudn:release-boot-failed',{cancelable:true});win.dispatchEvent(late);await new Promise(done=>setImmediate(done));
  assert.equal(late.defaultPrevented,false);assert.equal(JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY)).phase,'rollback');assert.equal(h.counts().rolledBack,1);broken.destroy();
});

for(const outcome of ['rollback','restored'])test('late boot read cannot reopen '+outcome+' recovery',async()=>{
  const win=new EventTarget(),h=harness({window:win});await h.coordinator.check();h.coordinator.destroy();h.setBuild('b');const current=h.restart();
  let finishAdapter,finishBootRead,reads=0;const get=h.store.get;
  h.store.get=async key=>{if(++reads===2)await new Promise(resolve=>finishBootRead=resolve);return get(key)};
  h.adapter.resumeAfterUpdate=()=>new Promise(resolve=>finishAdapter=resolve);
  const restoring=current.restorePending();await new Promise(resolve=>setImmediate(resolve));
  win.dispatchEvent(new Event('rudn:release-boot-failed',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof finishBootRead,'function');finishAdapter(outcome==='rollback'?{status:'blocked',code:'failed'}:{status:'restored'});
  assert.equal((await restoring).status,outcome);await new Promise(resolve=>setImmediate(resolve));
  const before=h.counts(),marker=h.storage.getItem(UPDATE_PENDING_KEY);
  finishBootRead();await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.counts(),before);assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),marker);current.destroy();
});

for(const change of ['route','identity'])test('late boot read stays cancelled after '+change+' change',async()=>{
  const win=new EventTarget(),h=harness({window:win});await h.coordinator.check();h.coordinator.destroy();h.setBuild('b');const current=h.restart();
  let finishRead;const get=h.store.get;h.store.get=async key=>{await new Promise(resolve=>finishRead=resolve);return get(key)};
  win.dispatchEvent(new Event('rudn:release-boot-failed',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
  if(change==='route'){h.setRoute('#dashboard');win.dispatchEvent(new Event('hashchange'))}
  else{h.setOwner('student:b');win.dispatchEvent(new Event('rudn:identitychange'));h.setOwner('student:a');win.dispatchEvent(new Event('rudn:identitychange'))}
  const before=h.counts(),marker=h.storage.getItem(UPDATE_PENDING_KEY);finishRead();await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.counts(),before);assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),marker);current.destroy();
});
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

for(const module of ['quiz:lecture-1','diagnostics'])for(const kind of ['missing-module','different-version','missing-manifest'])
test('rollback contract fence: '+module+' / '+kind,async()=>{
 const h=harness(),key=module.split(':')[0],contracts={...CONTRACTS,modules:{...CONTRACTS.modules,[key]:1}};
 const context=h.release.getReleaseContext;h.release.getReleaseContext=()=>({...context(),contracts});
 h.adapter.module=module;h.release.prepareRelease=async target=>({ready:true,buildId:target.buildId,context:{contracts}});
 try{
  assert.equal((await h.coordinator.check()).status,'switching');h.setBuild('b');
  h.adapter.resumeAfterUpdate=async()=>({status:'blocked',code:'test-restore-failure'});
  const previous=structuredClone(contracts);if(kind==='missing-module')delete previous.modules[key];else previous.modules[key]=2;
  h.release.prepareRelease=async()=>kind==='missing-manifest'?{ready:true}:{ready:true,context:{contracts:previous}};
  assert.deepEqual(await h.coordinator.restorePending(),{status:'blocked',code:'update/rollback-incompatible-contract'});
  assert.equal(h.counts().rolledBack,0);assert.equal(h.snapshots.size,1);assert.equal(JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY)).phase,'blocked');
 }finally{h.coordinator.destroy()}
});

// Exercise the actual shell readiness boundary together with the real
// coordinator. Only network/storage/navigation and the slow child mount are
// synthetic; main's adapter selection and both ready notifications are intact.
const mainSource=await readFile(new URL('../site/assets/js/main.js',import.meta.url),'utf8');
const learningSource=await readFile(new URL('../site/assets/js/platform-learning-updates.js',import.meta.url),'utf8');
const exposeSource=learningSource.slice(learningSource.indexOf('function exposeModuleUpdateAdapter('),learningSource.indexOf('export function bindQuizUpdate'));
const readySource=mainSource.slice(mainSource.indexOf('function updateAdapters('),mainSource.indexOf('\nfunction scheduleAccessRefresh('));
function shellReadiness(getHandle,module,window){
  const context=vm.createContext({Event,Promise,window,backend:{authReady:true},renderRunning:false,dataReady:true,currentCleanup:null,formCleanups:[],shellUpdate:{module:'platform'},route:()=>({name:'activity'}),updateCoordinator:null});
  vm.runInContext(exposeSource+'\n'+readySource+'\nthis.expose=exposeModuleUpdateAdapter;',context);
  context.currentCleanup=context.expose(()=>{},getHandle,module);
  return context;
}
const lazyModules=['legal-lab','career','reception','settlements','maps','classroom','quiz:lecture-1'];
for(const module of lazyModules)test('actual shell waits for lazy '+module+' mount before restoring B, without rollback',async()=>{
  const win=new EventTarget();let handle,resumeCalls=0,finishMount;
  const mounted={module,prepareForUpdate:async()=>({status:'ready',resumeToken:'adapter-state'}),resumeAfterUpdate:async()=>{resumeCalls++;return {status:'restored'}},cancelPreparation:async()=>{}};
  handle=mounted;const shell=shellReadiness(()=>handle,module,win);
  const h=harness({getAdapters:()=>shell.updateAdapters(),module:()=>module,window:win});
  const contracts={...CONTRACTS,modules:{...CONTRACTS.modules,'legal-lab':1,career:1,reception:1,settlements:1,maps:1,quiz:1}};
  const getContext=h.release.getReleaseContext,prepare=h.release.prepareRelease;
  h.release.getReleaseContext=()=>({...getContext(),contracts});h.release.prepareRelease=async target=>({...await prepare(target),context:{contracts}});
  let current=h.coordinator;
  try{
    assert.equal((await current.check()).status,'switching');current.destroy();h.setBuild('b');
    handle=null;shell.currentCleanup=shell.expose(()=>{},()=>handle,module);
    const mount=new Promise(resolve=>{finishMount=()=>{handle=mounted;resolve()}});
    current=h.restart();shell.updateCoordinator=current;
    // main.render() reaches its outer ready notification while renderSeminar4
    // (and the other lazy wrappers) still awaits its child handle.
    shell.moduleReady();
    const early=await current.restorePending();
    assert.deepEqual(early,{status:'defer',code:'module-not-ready'});
    assert.equal(resumeCalls,0);assert.equal(h.counts().rolledBack,0);assert.equal(h.counts().restored,0);
    assert.equal(JSON.parse(h.storage.getItem(UPDATE_PENDING_KEY)).phase,'switching');assert.equal(h.snapshots.size,1);
    finishMount();await mount;shell.moduleReady();
    assert.equal((await current.restorePending()).status,'restored');
    assert.equal(resumeCalls,1);assert.equal(h.counts().activated,1);assert.equal(h.counts().rolledBack,0);assert.equal(h.counts().restored,1);
    assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),null);assert.equal(h.snapshots.size,0);
  }finally{current.destroy()}
});

test('actual shell readiness rejects partial handles and follows a nested lazy handle',()=>{
  let handle=null;const shell=shellReadiness(()=>handle,'classroom',new EventTarget());
  assert.equal(shell.currentCleanup.isUpdateReady,false);assert.equal(shell.updateAdapters().length,0);
  handle={module:'classroom',prepareForUpdate:async()=>({status:'ready'})};
  assert.equal(shell.currentCleanup.isUpdateReady,false);assert.equal(shell.updateAdapters().length,0);
  handle.resumeAfterUpdate=async()=>({status:'restored'});assert.equal(shell.currentCleanup.isUpdateReady,true);assert.equal(shell.updateAdapters().length,1);
  handle.isUpdateReady=false;assert.equal(shell.updateAdapters().length,0);
  handle.isUpdateReady=true;assert.equal(shell.updateAdapters().length,1);
  handle=null;assert.equal(shell.updateAdapters().length,0,'A retired/replaced child cannot expose the old ready flag');
});

test('actual shell mount-ready wake survives a coalesced older restorePending call',async()=>{
  const win=new EventTarget();let handle,releaseRoute,resumeCalls=0;
  const mounted={module:'legal-lab',prepareForUpdate:async()=>({status:'ready',resumeToken:'adapter-state'}),resumeAfterUpdate:async()=>{resumeCalls++;return {status:'restored'}},cancelPreparation:async()=>{}};
  handle=mounted;const shell=shellReadiness(()=>handle,'legal-lab',win);
  const h=harness({getAdapters:()=>shell.updateAdapters(),module:'legal-lab',window:win,restoreRoute:()=>new Promise(resolve=>{releaseRoute=resolve})});
  const contracts={...CONTRACTS,modules:{...CONTRACTS.modules,'legal-lab':1}},getContext=h.release.getReleaseContext,prepare=h.release.prepareRelease;
  h.release.getReleaseContext=()=>({...getContext(),contracts});h.release.prepareRelease=async target=>({...await prepare(target),context:{contracts}});
  let current=h.coordinator,timer;
  try{
    await current.check();current.destroy();h.setBuild('b');handle=null;
    shell.currentCleanup=shell.expose(()=>{},()=>handle,'legal-lab');current=h.restart();shell.updateCoordinator=current;
    shell.moduleReady();const early=current.restorePending();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(typeof releaseRoute,'function','The older restore is paused after seeing no mounted adapters');
    const acknowledged=new Promise((resolve,reject)=>{win.addEventListener('rudn:update-restored',resolve,{once:true});timer=setTimeout(()=>reject(Error('No module-ready event retry')),2000)});
    handle=mounted;shell.moduleReady();assert.equal(current.restorePending(),early,'Direct restore coalesces with the older promise');
    releaseRoute();assert.equal((await early).code,'module-not-ready');
    await acknowledged;await new Promise(resolve=>setImmediate(resolve));
    assert.equal(resumeCalls,1);assert.equal(h.counts().restored,1);assert.equal(h.counts().rolledBack,0);assert.equal(h.counts().activated,1);
    assert.equal(h.storage.getItem(UPDATE_PENDING_KEY),null);assert.equal(h.snapshots.size,0);
  }finally{clearTimeout(timer);current.destroy()}
});
