import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {canResumeGameDraft,markGameDraft,canResumeStoredGameDraft,isGameUpdateAdapter} from '../site/assets/js/game-release-policy.js';
const source=await fs.readFile(new URL('../site/apps/governor/src/save-system.js',import.meta.url),'utf8');
function fixture(){
  const records=new Map(),storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
  const engine={VERSION:'fixture',validateState:state=>state?.version==='fixture',restoreState:state=>state?.version==='fixture'?structuredClone(state):null};
  const sandbox=vm.createContext({TextEncoder,Uint8Array,Uint32Array,DataView,crypto:webcrypto,GovernorGame:{Engine:engine,Integrity:{safeTree(){}}}});vm.runInContext(source,sandbox);
  const Saves=sandbox.GovernorGame.Saves;let context={retention:'current-only',buildId:'a'.repeat(32)};
  Saves.setReleasePolicy({canResume:(draft,options)=>canResumeGameDraft(draft,{...options,context}),mark:draft=>markGameDraft(draft,context)});
  return {Saves,storage,records,switchBuild:id=>context={...context,buildId:id.repeat(32)}};
}
const state=(extra={})=>({version:'fixture',sessionId:'unfinished-a',completed:false,budgetReview:{status:'active'},...extra});

test('Governor compatible unfinished autosave and backup resume across a platform build change without rewriting on inspection',()=>{
  const f=fixture(),store=new f.Saves.Store(f.storage);store.write(state());const original=f.storage.getItem(f.Saves.Key);
  assert.equal(JSON.parse(original).releaseBuildId,'a'.repeat(32));assert.equal(store.inspect().status,'ok');
  f.storage.setItem(f.Saves.Backup,original);f.storage.setItem('rudn-governor-stage8-state',original);f.storage.setItem('submission:finished','unchanged-result');
  f.switchBuild('b');assert.equal(store.inspect().status,'ok');assert.equal(store.backup().state.sessionId,'unfinished-a');assert.equal(store.legacy().state.sessionId,'unfinished-a');assert.equal(f.storage.getItem(f.Saves.Key),original);
  store.write(state({sessionId:'new-current-attempt'}));assert.equal(store.inspect().state.sessionId,'new-current-attempt');assert.equal(JSON.parse(f.storage.getItem(f.Saves.Key)).releaseBuildId,'b'.repeat(32));assert.equal(f.storage.getItem('submission:finished'),'unchanged-result');
});

test('Governor finished and financial-handover local results survive even without a build tag',()=>{
  for(const value of [state({completed:true}),state({budgetReview:{status:'supervised'}})]){
    const f=fixture(),raw=JSON.stringify({format:'rudn-autosave',revision:1,state:value});f.storage.setItem(f.Saves.Key,raw);const store=new f.Saves.Store(f.storage);
    assert.equal(store.inspect().status,'ok');f.switchBuild('b');assert.equal(store.inspect().status,'ok');assert.equal(f.storage.getItem(f.Saves.Key),raw);
  }
});

test('Governor portable exports record their source build but compatible campaigns remain importable after an update',async()=>{
  const f=fixture(),unfinished=await f.Saves.pack(state()),completed=await f.Saves.pack(state({completed:true}));
  assert.equal(JSON.parse(unfinished).releaseBuildId,'a'.repeat(32));assert.equal((await f.Saves.unpack(unfinished)).completed,false);
  f.switchBuild('b');assert.equal((await f.Saves.unpack(unfinished)).sessionId,'unfinished-a');assert.equal((await f.Saves.unpack(unfinished)).sessionId,'unfinished-a');assert.equal((await f.Saves.unpack(completed)).completed,true);
  const current=await f.Saves.pack(state({sessionId:'new-b'}));assert.equal((await f.Saves.unpack(current)).sessionId,'new-b');
});

test('Governor compatibility exception is scoped to its campaign and validated model',()=>{
  const context={retention:'current-only',buildId:'b'.repeat(32)},old={releaseBuildId:'a'.repeat(32)};
  assert.equal(canResumeGameDraft(old,{context}),false);
  assert.equal(canResumeGameDraft(old,{context,module:'governor'}),false);
  assert.equal(canResumeGameDraft(old,{context,module:'governor',compatible:true}),true);
  assert.equal(canResumeGameDraft(old,{context,module:'maps',compatible:true}),false);
  globalThis.__RUDN_RELEASE__=context;
  try{
    for(const activitySlug of ['seminar-7','governor-freeplay'])assert.equal(canResumeStoredGameDraft({...old,activitySlug,mode:'campaign',state:{campaign:{}}}),true);
    assert.equal(canResumeStoredGameDraft({...old,activitySlug:'seminar-2',mode:'seminar',state:{}}),false);
    assert.equal(isGameUpdateAdapter('governor'),false);assert.equal(isGameUpdateAdapter('maps'),true);
  }finally{delete globalThis.__RUDN_RELEASE__;}
});

test('Governor rejects unsupported portable schemas and models without treating a build change as incompatibility',async()=>{
  const f=fixture(),box=JSON.parse(await f.Saves.pack(state()));f.switchBuild('b');
  await assert.rejects(f.Saves.unpack(JSON.stringify({...box,schema:2})),e=>e.code==='incompatible-schema');
  await assert.rejects(f.Saves.unpack(JSON.stringify({...box,model:'future'})),e=>e.code==='incompatible-model');
  const invalid=JSON.stringify({...state(),version:'future'});
  await assert.rejects(f.Saves.unpack(JSON.stringify({...box,payload:invalid,checksum:await f.Saves.hash(invalid)})),e=>e.code==='incompatible-model');
});

test('Governor preserves exact unsupported and corrupt autosaves before replacement and clear',()=>{
  for(const raw of ['{broken',JSON.stringify({format:'rudn-autosave',schema:2,revision:3,state:state()}),JSON.stringify({format:'rudn-autosave',revision:3,state:{version:'future'}})]){
    const f=fixture();f.storage.setItem(f.Saves.Key,raw);f.storage.setItem(f.Saves.Backup,'{old-broken');
    const store=new f.Saves.Store(f.storage),status=store.inspect().status;
    assert.ok(['corrupt','incompatible'].includes(status));assert.equal(f.storage.getItem(f.Saves.Key),raw);
    store.write(state());assert.equal(store.inspect().status,'ok');
    assert.equal(store.recovery().filter(e=>e.raw===raw).length,1);
    store.clear();assert.equal(store.inspect().status,'empty');
    assert.equal(store.backup().status,'ok');assert.ok(store.recovery().some(e=>e.raw==='{old-broken'));
    assert.ok(store.recovery().some(e=>e.raw===raw));
  }
});

test('Governor refuses destructive replacement when the recovery copy cannot be stored',()=>{
  const f=fixture(),raw='{unreadable';f.storage.setItem(f.Saves.Key,raw);
  const storage={...f.storage,setItem(key,value){if(key===f.Saves.Recovery)throw new Error('quota');f.storage.setItem(key,value);}};
  const store=new f.Saves.Store(storage);store.inspect();
  assert.throws(()=>store.write(state()),/quota/);assert.equal(f.storage.getItem(f.Saves.Key),raw);
  assert.throws(()=>store.clear(),/quota/);assert.equal(f.storage.getItem(f.Saves.Key),raw);
});

test('Governor locale logos follow the manifest from an exact entry without runtime asset copies',async()=>{
  const shellSource=await fs.readFile(new URL('../site/apps/governor/src/i18n-shell.js',import.meta.url),'utf8');
  const images=[{},{},{}],doc={baseURI:'https://example.test/RUDN/_releases/'+ 'a'.repeat(32)+'/apps/governor/index.html',querySelector:()=>null,querySelectorAll:selector=>selector.startsWith('.platform-brand')?images:[]};
  const sandbox=vm.createContext({URL,GovernorGame:{I18n:{normalize:lang=>lang}},__RUDN_RELEASE__:{resources:{'assets/img/rudn-logo.png':{url:'/RUDN/assets/img/rudn-logo.png'},'assets/img/rudn-logo-en.png':{url:'/RUDN/_objects/international-logo.png'}}}});
  vm.runInContext(shellSource,sandbox);
  for(const [locale,expected] of [['ru','https://example.test/RUDN/assets/img/rudn-logo.png'],['en','https://example.test/RUDN/_objects/international-logo.png'],['zh','https://example.test/RUDN/_objects/international-logo.png']]){
    sandbox.GovernorGame.I18n.shell(doc,locale);assert.ok(images.every(image=>image.src===expected));
  }
  delete sandbox.__RUDN_RELEASE__;doc.baseURI='https://example.test/RUDN/apps/governor/index.html';sandbox.GovernorGame.I18n.shell(doc,'ru');assert.ok(images.every(image=>image.src==='https://example.test/RUDN/assets/img/rudn-logo.png'));
});
