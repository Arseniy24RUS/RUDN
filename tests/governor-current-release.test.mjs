import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {canResumeGameDraft,markGameDraft} from '../site/assets/js/game-release-policy.js';
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

test('Governor current autosave resumes, retired unfinished autosave and backup stay untouched but do not resume',()=>{
  const f=fixture(),store=new f.Saves.Store(f.storage);store.write(state());const original=f.storage.getItem(f.Saves.Key);
  assert.equal(JSON.parse(original).releaseBuildId,'a'.repeat(32));assert.equal(store.inspect().status,'ok');
  f.storage.setItem(f.Saves.Backup,original);f.storage.setItem('rudn-governor-stage8-state',original);f.storage.setItem('submission:finished','unchanged-result');
  f.switchBuild('b');assert.equal(store.inspect().retired,true);assert.equal(store.backup().state,null);assert.equal(store.legacy().state,null);assert.equal(f.storage.getItem(f.Saves.Key),original);
  store.write(state({sessionId:'new-current-attempt'}));assert.equal(store.inspect().state.sessionId,'new-current-attempt');assert.equal(JSON.parse(f.storage.getItem(f.Saves.Key)).releaseBuildId,'b'.repeat(32));assert.equal(f.storage.getItem('submission:finished'),'unchanged-result');
});

test('Governor finished and financial-handover local results survive even without a build tag',()=>{
  for(const value of [state({completed:true}),state({budgetReview:{status:'supervised'}})]){
    const f=fixture(),raw=JSON.stringify({format:'rudn-autosave',revision:1,state:value});f.storage.setItem(f.Saves.Key,raw);const store=new f.Saves.Store(f.storage);
    assert.equal(store.inspect().status,'ok');f.switchBuild('b');assert.equal(store.inspect().status,'ok');assert.equal(f.storage.getItem(f.Saves.Key),raw);
  }
});

test('Governor portable exports carry the build; completed reports remain importable after retirement',async()=>{
  const f=fixture(),unfinished=await f.Saves.pack(state()),completed=await f.Saves.pack(state({completed:true}));
  assert.equal(JSON.parse(unfinished).releaseBuildId,'a'.repeat(32));assert.equal((await f.Saves.unpack(unfinished)).completed,false);
  f.switchBuild('b');await assert.rejects(f.Saves.unpack(unfinished),error=>error.code==='retired-build');assert.equal((await f.Saves.unpack(completed)).completed,true);
  const current=await f.Saves.pack(state({sessionId:'new-b'}));assert.equal((await f.Saves.unpack(current)).sessionId,'new-b');
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
