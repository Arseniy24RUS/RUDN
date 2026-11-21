import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createDurableStore} from '../site/assets/js/durable-store.js';
import {canResumeGameDraft,markGameDraft} from '../site/assets/js/game-release-policy.js';
import {scopedStorage,createRunMetadata} from '../site/apps/governor/platform-contract.js';

globalThis.crypto ||= webcrypto;
const [saveSource,bridge,i18n,catalog]=await Promise.all(['src/save-system.js','platform-bridge.js','src/i18n.js','locales/zh-Hans.js'].map(name=>fs.readFile(new URL('../site/apps/governor/'+name,import.meta.url),'utf8')));
const owner='student:governor-restore-synthetic',scope={owner,activitySlug:'seminar-7',mode:'campaign'};
const state={version:'fixture',completed:false,sessionId:'same-campaign',storiesRunId:'same-run',history:[1,2,3]},run={submissionId:'same-attempt',campaignToken:state.storiesRunId};
const A='a'.repeat(32),B='b'.repeat(32);
const build=buildId=>globalThis.__RUDN_RELEASE__={buildId,retention:'current-only'};
function fixture(){
  const records=new Map(),localStorage={get length(){return records.size},key:i=>[...records.keys()][i]??null,
    getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,String(v)),removeItem:k=>records.delete(k)};
  const durable=createDurableStore({indexedDB:null,localStorage,broadcast:false,locks:null}),scoped=scopedStorage(localStorage,owner);
  const engine={VERSION:'fixture',validateState:value=>value?.version==='fixture',restoreState:value=>value?.version==='fixture'?structuredClone(value):null};
  async function open(){
    const nodes=new Map(),$=selector=>{if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);};
    const diagnostics={destroy(){},span(){return()=>{};},record(){},error(){}};
    const sandbox=vm.createContext({TextEncoder,Uint8Array,Uint32Array,DataView,crypto:webcrypto,structuredClone,performance,URL,
      GovernorGame:{Engine:engine,Integrity:{safeTree(){}}},localStorage,scopedStorage,createRunMetadata,canResumeGameDraft,markGameDraft,
      $,diagnostics,diagnosticService:{forModule:()=>diagnostics},resourceURL:()=>new URL('https://example.test/app.js'),
      backend:{authReady:true,isAdmin:()=>false,getProfile:()=>({fullName:'Synthetic',group:'G'}),loadDraft:s=>durable.loadDraft(s),checkpoint:(s,o)=>durable.checkpoint(s,o)},
      document:{createElement:()=>({}),body:{append(script){script.onload();}}},CustomEvent:class{},sessionStorage:{getItem:()=>null},location:{href:'https://example.test/apps/governor/index.html'}});
    sandbox.window=sandbox;sandbox.dispatchEvent=()=>{};vm.runInContext(i18n,sandbox);vm.runInContext(catalog,sandbox);vm.runInContext(saveSource,sandbox);
    vm.runInContext(`const G=GovernorGame;G.Saves.setReleasePolicy({canResume:canResumeGameDraft,mark:markGameDraft});
      const context='course',free=false,activitySlug='seminar-7',language='ru';
      let owner=null,active=false,storage=null,run=null,runtime=null,started=false,latestSaveStatus=null,reflectionFailure='';
      const storageValues=new Map(),pendingCheckpoints=new Set();
      const currentOwner=()=>${JSON.stringify(owner)},canAccess=()=>true,sameOwner=()=>active&&currentOwner()===owner;
      const tr=ru=>ru,refresh=()=>{},message=()=>{},block=()=>{},terminal=s=>s?.completed===true;
      function stored(key,fallback=null){try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}}
      ${bridge.slice(bridge.indexOf('function checkpointCampaign('),bridge.indexOf('function syncText('))}
      ${bridge.slice(bridge.indexOf('async function tryStart('),bridge.indexOf('function installUpdateAdapter(')).replaceAll('import.meta.url',JSON.stringify('https://example.test/apps/governor/platform-bridge.js'))}
      globalThis.openCampaign=async()=>{await tryStart();await Promise.allSettled([...pendingCheckpoints]);return new G.Saves.Store(storage);};`,sandbox);
    return sandbox.openCampaign();
  }
  return {durable,scoped,open,close(){durable.close();delete globalThis.__RUDN_RELEASE__;}};
}

test('Governor first and subsequent opens continue the same old-build campaign from the durable store',async()=>{
  const f=fixture();try{
    build(A);await f.durable.checkpoint({...scope,attemptId:run.submissionId,state:{campaign:state,run,storage:{}}},{queue:false});
    build(B);
    for(let i=0;i<2;i++){
      const store=await f.open(),saved=store.inspect();assert.equal(saved.status,'ok');assert.equal(saved.state.sessionId,state.sessionId);assert.equal(saved.state.history.length,3);
      assert.equal((await f.durable.loadDraft(scope)).state.campaign.sessionId,state.sessionId);
    }
  }finally{f.close();}
});

test('Governor upgrades a valid legacy local envelope only after validation',async()=>{
  const f=fixture();try{
    build(A);f.scoped.setItem('rudn-governor-stage9-state',JSON.stringify(markGameDraft({format:'rudn-autosave',revision:1,state})));
    f.scoped.setItem('platform-run',JSON.stringify(run));build(B);
    const store=await f.open();assert.equal(store.inspect().status,'ok');
    const checkpoint=await f.durable.loadDraft(scope);assert.equal(checkpoint.releaseBuildId,B);assert.equal(checkpoint.state.governorSaveSchema,1);assert.equal(checkpoint.state.campaign.sessionId,state.sessionId);
  }finally{f.close();}
});

test('Governor does not re-stamp or checkpoint a future local schema on repeated opens',async()=>{
  const f=fixture();try{
    const raw=JSON.stringify({format:'rudn-autosave',schema:2,revision:1,state,releaseBuildId:A});
    f.scoped.setItem('rudn-governor-stage9-state',raw);f.scoped.setItem('platform-run',JSON.stringify(run));build(B);
    for(let i=0;i<2;i++){const store=await f.open();assert.equal(store.inspect().status,'incompatible');assert.equal(store.raw(),raw);assert.equal(await f.durable.loadDraft(scope),null);}
  }finally{f.close();}
});

test('Governor preserves an incompatible cloud-only snapshot and exposes an incompatible save, not an empty account',async()=>{
  const f=fixture();try{
    build(A);await f.durable.checkpoint({...scope,attemptId:run.submissionId,state:{governorSaveSchema:2,campaign:state,run,storage:{}}},{queue:false});build(B);
    const before=await f.durable.loadDraft(scope),store=await f.open();
    assert.equal(store.inspect().status,'incompatible');assert.equal(store.inspect().reason,'incompatible-schema');
    assert.ok(store.recovery().some(entry=>entry.key==='platform-campaign'&&JSON.parse(entry.raw).state.governorSaveSchema===2));
    assert.deepEqual((await f.durable.loadDraft(scope)).state,before.state);
  }finally{f.close();}
});

test('Governor archives a corrupt local campaign before choosing a valid cloud checkpoint',async()=>{
  const f=fixture();try{
    build(A);f.scoped.setItem('rudn-governor-stage9-state','{broken-local');
    await f.durable.checkpoint({...scope,attemptId:run.submissionId,state:{governorSaveSchema:1,campaign:state,run,storage:{}}},{queue:false});build(B);
    const store=await f.open();assert.equal(store.inspect().status,'ok');assert.ok(store.recovery().some(entry=>entry.raw==='{broken-local'));
  }finally{f.close();}
});

test('Governor retains a newer local reflection sidecar when a final decision checkpoint is older than the text edit',async()=>{
  const f=fixture();try{
    build(A);f.scoped.setItem('rudn-governor-stage9-state',JSON.stringify(markGameDraft({format:'rudn-autosave',revision:1,savedAt:'1970-01-01T00:00:00Z',state})));
    const localRun={...run,updatedAt:200,reflection:'Новый вывод после итогов',pendingReflection:{id:'pending-addon'}};
    f.scoped.setItem('platform-run',JSON.stringify(localRun));
    await f.durable.checkpoint({...scope,attemptId:run.submissionId,state:{governorSaveSchema:1,campaign:state,run:{...run,updatedAt:100,reflection:'Старый вывод'},storage:{}}},{queue:false});build(B);
    const store=await f.open();assert.equal(store.inspect().status,'ok');assert.deepEqual(JSON.parse(store.raw('platform-run')),localRun);
  }finally{f.close();}
});


test('import rejects a forged mandate or administrative bonus against the reviewed year',async()=>{
  const {E,fresh,defer,json}=await import('./helpers/governor-gameplay.mjs');
  const original=fresh({strategyId:'services'});
  while(original.history.length<5)defer(original);
  assert.equal(original.campaignStrategy.reviews[0].status,'conditional');
  const mutations=[
    state=>state.campaignStrategy.reviews[0].status='secured',
    state=>state.campaignStrategy.reviews[0].goals.forEach(goal=>goal.met=true),
    state=>state.campaignStrategy.reviews[0].goals[0].value=1,
    state=>state.campaignStrategy.reviews[0].goals[0].progress=1,
    state=>state.campaignStrategy.reviews[0].support=100,
    state=>state.campaignStrategy.reviews[0].progress=1,
    state=>state.campaignStrategy.reviews.splice(0,1),
    state=>{
      const review=state.campaignStrategy.reviews[0];
      review.status='secured';review.capacityDelta=1;
      state.finance.adminCapacity=state.campaignStrategy.baseCapacity+1;
    }
  ];
  for(const mutate of mutations){
    const modified=json(original);mutate(modified);
    assert.equal(E.validateState(modified),false);
    assert.equal(E.restoreState(modified),null);
  }
  assert.ok(E.restoreState(original));
});

test('mandate saves restore before and after each review in both budget modes',async()=>{
  const {E,A,fresh,settle,advance}=await import('./helpers/governor-gameplay.mjs');
  for(const budgetMode of ['automatic','decisions']){
    const state=fresh({strategyId:'services',budgetMode});
    while(!state.completed){
      E.chooseAgenda(state,A.OPERATIONS.id);
      E.commitAction(state,A.OPERATIONS.actions[0].id,'treasury');settle(state);
      const before=E.restoreState(E.serialiseState(state));
      assert.ok(before,`${budgetMode} before closing year ${state.history.length}`);
      assert.equal(before.campaignStrategy.reviews.length,Math.floor((state.history.length-1)/5));
      advance(state);
      const after=E.restoreState(E.serialiseState(state));
      assert.ok(after,`${budgetMode} after closing year ${state.history.length}`);
      assert.equal(after.campaignStrategy.reviews.length,Math.floor(state.history.length/5));
    }
  }
});
