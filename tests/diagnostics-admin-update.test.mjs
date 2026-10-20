import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mountDiagnosticsAdmin} from '../site/assets/js/diagnostics-ui.js';
import {updateSnapshotStore,holdUpdateInput} from '../site/assets/js/platform-update-state.js';
import {bootstrapUpdateCoordinator} from '../site/assets/js/platform-update-coordinator.js';
import {captureCheckpointContracts,acceptsCheckpointContracts} from '../site/assets/js/platform-update-contracts.js';

// Minimal DOM for the actual public mount/adapter. Browser integration below
// runs the real document/main/coordinator; this fixture never replaces the adapter.
class Element extends EventTarget {
 constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.nodeType=1;this.ownerDocument=doc;this.children=[];this.dataset={};this.attrs={};this.value='';this.scrollTop=0;this.scrollLeft=0;this.open=false;this.inert=false;this.selectionStart=0;this.selectionEnd=0}
 get isConnected(){return this===this.ownerDocument.body||this===this.ownerDocument.head||!!this.parentNode?.isConnected}
 setAttribute(key,value){this.attrs[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(value);if(['id','name','type'].includes(key))this[key]=String(value)}
 getAttribute(key){if(key.startsWith('data-'))return this.dataset[key.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]??null;return this.attrs[key]??null}
 get className(){return this.attrs.class||''}set className(value){this.attrs.class=value}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node)}}
 prepend(node){node.remove();node.parentNode=this;this.children.unshift(node)}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null}
 contains(node){return node===this||this.children.some(child=>child.contains(node))}
 matches(selector){if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));if(selector.startsWith('#'))return this.id===selector.slice(1);const a=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);return a?this.getAttribute(a[1])!==null&&(a[2]===undefined||this.getAttribute(a[1])===a[2]):this.tagName===selector.toUpperCase()}
 querySelectorAll(selector){const out=[];for(const child of this.children){if(child.matches(selector))out.push(child);out.push(...child.querySelectorAll(selector))}return out}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 get elements(){return Object.fromEntries(this.querySelectorAll('input').map(node=>[node.name,node]))}
 set textContent(value){this.children.forEach(x=>x.parentNode=null);this.children=[];this._text=String(value)}
 get textContent(){return (this._text||'')+this.children.map(x=>x.textContent).join('')}
 set innerHTML(html){
  this.textContent='';const stack=[this],pattern=/<(\/?)([a-z][a-z0-9-]*)([^>]*)>|([^<]+)/gi;let match;
  while((match=pattern.exec(html))){if(match[4]){stack.at(-1)._text=(stack.at(-1)._text||'')+match[4];continue}const [,closing,tag,attrs]=match;if(closing){if(stack.length>1)stack.pop();continue}
   const child=new Element(tag,this.ownerDocument);for(const a of attrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g))child.setAttribute(a[1],a[2]??'');stack.at(-1).append(child);if(!['input','br','link','img','meta'].includes(tag))stack.push(child);
  }
 }
 focus(){for(let node=this;node;node=node.parentNode)if(node.inert)return;this.ownerDocument.activeElement=this}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end}
 click(){return this.onclick?.({currentTarget:this,target:this,preventDefault(){}})}
 showModal(){this.open=true}
 close(){this.open=false;this.dispatchEvent(new Event('close'))}
}
const storage=new Map();
class DocumentEvents extends EventTarget {
 // Node's EventTarget does not match boolean capture on removal; normalize the
 // DOM overload so this fixture exercises browser listener disposal semantics.
 removeEventListener(type,callback,options){return super.removeEventListener(type,callback,typeof options==='boolean'?{capture:options}:options)}
}
function installDOM(){
 const old=Object.fromEntries(['document','window','localStorage','FormData','location'].map(key=>[key,globalThis[key]]));
 const win=new EventTarget(),doc=new DocumentEvents();win.scrollX=0;win.scrollY=0;win.scrollTo=({left,top})=>{win.scrollX=left;win.scrollY=top};doc.defaultView=win;doc.visibilityState='visible';
 doc.head=new Element('head',doc);doc.body=new Element('body',doc);doc.createElement=tag=>new Element(tag,doc);doc.getElementById=id=>doc.head.querySelector('#'+id)||doc.body.querySelector('#'+id);doc.activeElement=doc.body;
 const app=new Element('main',doc);doc.body.append(app);
 Object.assign(globalThis,{document:doc,window:win,location:{href:'http://localhost/'},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},FormData:class{constructor(form){this.values=Object.entries(form.elements).map(([k,v])=>[k,v.value])}[Symbol.iterator](){return this.values[Symbol.iterator]()}}});
 return {app,doc,win,restore(){for(const [key,value]of Object.entries(old))if(value===undefined)delete globalThis[key];else globalThis[key]=value}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<5;i++)await tick()}
function fixture(){
 const dom=installDOM(),calls=[],person={studentKey:'123456789',fullName:'PRIVATE_FETCHED_NAME',group:'PRIVATE_FETCHED_GROUP'};
 let missing=false,hold=null,jobDone=false;
 const backend={user:{uid:'teacher-A'},isAdmin:()=>!!backend.user,diagnosticsRequest:async(action,payload,options)=>{
  calls.push({action,payload,signal:options.signal});if(hold&&hold.action===action)await hold.promise;
  if(action==='searchStudents')return {items:missing?[]:[person],nextCursor:payload.cursor?null:'students-next'};
  if(action==='listSessions'||action==='migrateLegacy')return {items:missing?[]:[{sessionId:payload.cursor?'session-2':'session-1',reportCode:'TEST',installationId:'installation-1',environment:{model:'PRIVATE_DEVICE'}}],nextCursor:payload.cursor?null:'sessions-next'};
  if(action==='readEvents')return {items:[{event:'PRIVATE_EVENT',module:'maps'}],nextCursor:payload.cursor?null:'events-next'};
  if(action==='createExport')return {downloadURL:'http://localhost/export-private-token'};
  if(action==='previewDelete')return {confirmationToken:'PRIVATE_DELETE_TOKEN',counts:{}};
  if(action==='delete')return {jobId:'PRIVATE_JOB'};
  if(action==='status')return payload.jobId?{job:{done:jobDone}}:{counts:{events:1}};
  throw Error('unexpected test action');
 }};
 const handles=[];
 return {...dom,backend,calls,setMissing(value){missing=value},setJobDone(value){jobDone=value},
  hold(action){let release;const promise=new Promise(r=>release=r);hold={action,promise};return ()=>{hold=null;release()}},
  async mount(options={}){const handle=await mountDiagnosticsAdmin(dom.app,{backend,...options});handles.push(handle);return handle},
  root:()=>dom.app.querySelector('.diagnostics-page'),
  close(){handles.forEach(h=>h?.destroy());dom.restore()},
 };
}
const submit=form=>form.onsubmit({currentTarget:form,preventDefault(){}});
function trustedInput(doc,target){
 const event=new Event('keydown',{cancelable:true});
 // Unit-only trusted-input model; no browser or production dispatch.
 Object.defineProperties(event,{isTrusted:{value:true},target:{value:target}});
 doc.dispatchEvent(event);return event.defaultPrevented;
}
async function saved(handle){const ready=await handle.prepareForUpdate({targetRelease:'test-B'});assert.equal(ready.status,'ready');return {ready,state:(await updateSnapshotStore().get(ready.resumeToken)).state}}

test('same prepared admin handle restores focus and becomes interactive after cancellation',async()=>{
 const f=fixture();try{
  const handle=await f.mount(),root=f.root(),field=root.querySelector('[data-filters]').elements.module;
  field.value='legal-lab';field.focus();field.setSelectionRange(1,4);
  const {ready}=await saved(handle);f.doc.activeElement=f.doc.body;
  assert.equal(trustedInput(f.doc,field),true,'Preparation gate remains active');
  assert.equal((await handle.resumeAfterUpdate(ready)).status,'restored');
  assert.equal(trustedInput(f.doc,field),true,'Finishing restore must not release the preparation gate');
  await handle.cancelPreparation({discard:false});
  assert.deepEqual({inert:root.inert,focused:f.doc.activeElement===field,start:field.selectionStart,end:field.selectionEnd,blocked:trustedInput(f.doc,field)},{inert:false,focused:true,start:1,end:4,blocked:false});
 }finally{f.close()}
});

test('fresh admin restore holds native input through the final view frame and releases it afterwards',async t=>{
 const f=fixture();let releaseFrame;try{
  const source=await f.mount(),field=f.root().querySelector('[data-filters]').elements.module;field.focus();
  const {ready}=await saved(source);source.commitPreparation();source.destroy();
  const fresh=await f.mount(),restoredField=f.root().querySelector('[data-filters]').elements.module;
  // Freeze only the held view frame, so the 100 ms fallback cannot end it before the input assertions.
  t.mock.timers.enable({apis:['setTimeout']});
  f.win.requestAnimationFrame=callback=>{releaseFrame=callback};
  const restoring=fresh.resumeAfterUpdate(ready);await settle();assert.equal(typeof releaseFrame,'function');
  const during={inert:f.root().inert,blocked:trustedInput(f.doc,restoredField)};
  releaseFrame();assert.equal((await restoring).status,'restored');
  assert.deepEqual({during,after:trustedInput(f.doc,restoredField),focused:f.doc.activeElement===restoredField},{during:{inert:false,blocked:true},after:false,focused:true});
 }finally{releaseFrame?.();f.close()}
});

test('independent scoped input holds release idempotently without releasing each other',()=>{
 const f=fixture();try{
  const field=f.doc.createElement('input');f.app.append(field);
  const first=holdUpdateInput(f.app),second=holdUpdateInput(f.app);
  assert.equal(trustedInput(f.doc,field),true);first();first();assert.equal(trustedInput(f.doc,field),true);
  second();second();assert.equal(trustedInput(f.doc,field),false);
 }finally{f.close()}
});

test('abort frees an ignored read; its late result cannot overwrite new fields or release a newer restore hold',async t=>{
 const f=fixture();let finishOld,releaseFrame;try{
  const source=await f.mount();f.root().querySelector('[data-session]').click();await settle();
  const {ready}=await saved(source);source.commitPreparation();source.destroy();const handle=await f.mount();
  const request=f.backend.diagnosticsRequest;let held=false;
  f.backend.diagnosticsRequest=(action,...args)=>{
   if(action==='listSessions'&&!held){held=true;return new Promise(resolve=>{finishOld=()=>resolve({items:[{sessionId:'OLD-LATE',reportCode:'OLD-LATE'}]})})}
   return request(action,...args);
  };
  const controller=new AbortController(),old=handle.resumeAfterUpdate({...ready,signal:controller.signal});await settle();
  const field=f.root().querySelector('[data-filters]').elements.module;assert.equal(trustedInput(f.doc,field),true);
  controller.abort();let watchdog;
  try{assert.equal((await Promise.race([old,new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(Error('Abort did not settle ignored read')),200)})])).status,'defer')}finally{clearTimeout(watchdog)}
  assert.equal(f.root().inert,false);assert.equal(trustedInput(f.doc,field),false);field.value='latest after cancellation';
  await settle();assert.equal(field.value,'latest after cancellation');
  // The abort watchdog above remains real; freeze only the newer view frame.
  t.mock.timers.enable({apis:['setTimeout']});
  f.win.requestAnimationFrame=callback=>{releaseFrame=callback};
  const newer=handle.resumeAfterUpdate(ready);await settle();assert.equal(typeof releaseFrame,'function');
  finishOld();await settle();
  assert.equal(trustedInput(f.doc,field),true,'Old completion cannot release the newer hold');assert.doesNotMatch(f.root().textContent,/OLD-LATE/);
  releaseFrame();assert.equal((await newer).status,'restored');assert.equal(trustedInput(f.doc,field),false);
  field.value='latest after new restore';await settle();assert.equal(field.value,'latest after new restore');
  const current=await saved(handle);assert.equal(current.state.sessionId,'session-1');assert.equal(current.state.filters.draft.module,'latest after new restore');
 }finally{finishOld?.();releaseFrame?.();f.close()}
});

test('public admin adapter preserves last unblurred fields separately from applied queries and excludes fetched rows',async()=>{
 const f=fixture();try{
  const handle=await f.mount(),root=f.root(),search=root.querySelector('[data-student-search]'),filters=root.querySelector('[data-filters]');
  search.elements.query.value='Applied surname';search.elements.group.value='Applied group';submit(search);await settle();
  root.querySelector('[data-student]').click();await settle();
  filters.elements.module.value='maps';submit(filters);await settle();
  root.querySelector('[data-device]').click();await settle();root.querySelector('[data-session]').click();await settle();
  search.elements.query.value='Draft not submitted';filters.elements.module.value='legal-lab';filters.elements.to.value='2026-10-21T16:35';filters.elements.module.focus();filters.elements.module.setSelectionRange(2,6);
  f.win.scrollY=120;const {ready,state}=await saved(handle);
  assert.equal(handle.module,'diagnostics');assert.equal(state.kind,'diagnostics');assert.equal(state.search.applied.query,'Applied surname');assert.equal(state.search.draft.query,'Draft not submitted');
  assert.equal(state.filters.applied.module,'maps');assert.equal(state.filters.applied.installationId,'installation-1');assert.equal(state.filters.draft.module,'legal-lab');assert.equal(state.filters.draft.to,'2026-10-21T16:35');
  assert.equal(state.studentKey,'123456789');assert.equal(state.sessionId,'session-1');assert.equal(state.view.focus.name,'module');assert.equal(state.view.focus.start,2);
  assert.doesNotMatch(JSON.stringify(state),/PRIVATE_|downloadURL|confirmationToken|jobId/);
  handle.commitPreparation();handle.destroy();const fresh=await f.mount();f.calls.length=0;
  assert.deepEqual(await fresh.resumeAfterUpdate(ready),{status:'restored'});
  assert.ok(f.calls.every(call=>['searchStudents','listSessions','readEvents'].includes(call.action)));
  assert.equal(f.calls.find(call=>call.action==='listSessions').payload.filters.module,'maps');
  assert.equal(f.root().querySelector('[data-filters]').elements.module.value,'legal-lab');
  assert.equal(f.doc.activeElement.name,'module');assert.equal(f.doc.activeElement.selectionStart,2);assert.equal(f.win.scrollY,120);
 }finally{f.close()}
});

test('cursor trails and selected session/event page round-trip using reads, not stored rows',async()=>{
 const f=fixture();try{
  const handle=await f.mount();f.root().querySelector('[data-sessions]').querySelector('[data-next]').click();await settle();
  f.root().querySelector('[data-session]').click();await settle();f.root().querySelector('[data-events]').querySelector('[data-next]').click();await settle();
  const {ready,state}=await saved(handle);assert.equal(state.sessionId,'session-2');assert.deepEqual(state.pages.sessions.trail,[null,'sessions-next']);assert.equal(state.pages.events.cursor,'events-next');
  handle.commitPreparation();handle.destroy();const fresh=await f.mount();f.calls.length=0;
  assert.equal((await fresh.resumeAfterUpdate(ready)).status,'restored');
  assert.equal(f.calls.find(x=>x.action==='listSessions').payload.cursor,'sessions-next');assert.equal(f.calls.find(x=>x.action==='readEvents').payload.cursor,'events-next');
  assert.ok(f.root().querySelector('[data-sessions]').querySelector('[data-prev]'));assert.ok(f.root().querySelector('[data-events]').querySelector('[data-prev]'));
 }finally{f.close()}
});

test('pending read defers, finally wakes update, and latest field remains checkpointable after failure',async()=>{
 const f=fixture();try{
  const handle=await f.mount();let wakes=0;f.win.addEventListener('rudn:update-state-changed',()=>wakes++);
  const release=f.hold('listSessions');f.root().querySelector('[data-refresh]').click();await tick();
  assert.equal((await handle.prepareForUpdate()).status,'defer');release();await settle();assert.ok(wakes>0);
  f.backend.diagnosticsRequest=async()=>{throw Error('synthetic read failed')};f.root().querySelector('[data-refresh]').click();await settle();
  const {state}=await saved(handle);assert.equal(state.kind,'diagnostics');
 }finally{f.close()}
});

test('partially entered native date defers instead of checkpointing its empty serialized value',async()=>{
 const f=fixture();try{
  const handle=await f.mount(),field=f.root().querySelector('[data-filters]').elements.from;field.value='';field.validity={badInput:true};
  assert.equal((await handle.prepareForUpdate()).status,'defer');field.validity.badInput=false;
  assert.equal((await handle.prepareForUpdate()).status,'ready');
 }finally{f.close()}
});

test('same teacher owner is required before and during restoration; late reads cannot publish old state',async()=>{
 const f=fixture();try{
  const handle=await f.mount(),{ready}=await saved(handle);handle.commitPreparation();handle.destroy();const fresh=await f.mount();
  f.backend.user={uid:'teacher-B'};f.calls.length=0;assert.equal((await fresh.resumeAfterUpdate(ready)).code,'resume-owner-mismatch');assert.equal(f.calls.length,0);
  f.backend.user={uid:'teacher-A'};const release=f.hold('listSessions'),pending=fresh.resumeAfterUpdate(ready);await tick();
  f.backend.user={uid:'teacher-B'};release();assert.equal((await pending).status,'defer');
  assert.equal(f.root().querySelector('[data-filters]').elements.module.value,'');
 }finally{f.close()}
});

test('deleted selected session reports partial and never silently selects a different row',async()=>{
 const f=fixture();try{
  const handle=await f.mount();f.root().querySelector('[data-session]').click();await settle();const {ready}=await saved(handle);handle.commitPreparation();handle.destroy();const fresh=await f.mount();
  f.setMissing(true);f.calls.length=0;assert.deepEqual(await fresh.resumeAfterUpdate(ready),{status:'partial',code:'diagnostics-session-missing'});
  assert.equal(f.calls.some(x=>x.action==='readEvents'),false);assert.equal(f.root().querySelector('[data-export]'),null);
 }finally{f.close()}
});

test('export handoff and delete confirmation/job block preparation but are never replayed',async()=>{
 const f=fixture();try{
  const handle=await f.mount();f.root().querySelector('[data-session]').click();await settle();
  const release=f.hold('createExport');f.root().querySelector('[data-export]').click();await tick();assert.equal((await handle.prepareForUpdate()).status,'defer');release();await settle();
  f.root().querySelector('[data-delete]').click();await settle();assert.equal((await handle.prepareForUpdate()).status,'defer');
  f.doc.body.querySelector('[data-cancel]').click();await settle();assert.equal((await handle.prepareForUpdate()).status,'ready');await handle.cancelPreparation();
  f.root().querySelector('[data-delete]').click();await settle();f.doc.body.querySelector('[data-confirm]').click();await settle();
  assert.equal((await handle.prepareForUpdate()).status,'defer');f.setJobDone(true);f.root().querySelector('[data-delete-progress]').querySelector('button').click();await settle();
  const {state}=await saved(handle);assert.doesNotMatch(JSON.stringify(state),/PRIVATE_JOB|PRIVATE_DELETE_TOKEN|export-private-token/);
 }finally{f.close()}
});

test('archive restores through listArchive/readEvents only and missing teacher cannot mount an adapter',async()=>{
 const f=fixture();try{
  const handle=await f.mount();f.root().querySelector('[data-archive]').click();await settle();f.root().querySelector('[data-session]').click();await settle();
  const {ready,state}=await saved(handle);assert.equal(state.archive,true);handle.commitPreparation();handle.destroy();const fresh=await f.mount();f.calls.length=0;
  assert.equal((await fresh.resumeAfterUpdate(ready)).status,'restored');assert.deepEqual(f.calls.map(x=>x.action),['migrateLegacy','readEvents']);assert.equal(f.calls[0].payload.kind,'listArchive');
  fresh.destroy();f.backend.user=null;assert.equal(await f.mount(),undefined);
 }finally{f.close()}
});

test('admin snapshots require their own release contract before any checkpoint or navigation',async()=>{
 const current=JSON.parse(await readFile(new URL('../site/data/platform-contracts.json',import.meta.url),'utf8')),old=structuredClone(current);delete old.modules['diagnostics'];
 assert.equal(current.modules['diagnostics'],1);let prepared=0,navigated=0;
 const coordinator=bootstrapUpdateCoordinator({autoStart:false,window:null,document:null,module:'diagnostics',getOwner:()=> 'teacher:A',getRoute:()=> '#diagnostics',
  getAdapters:()=>[{module:'diagnostics',prepareForUpdate:()=>{prepared++;return {status:'ready'}},resumeAfterUpdate:async()=>({status:'restored'})}],
  release:{getReleaseContext:()=>({buildId:'A',contracts:current}),checkRelease:async()=>({buildId:'D'}),prepareRelease:async()=>({ready:true,buildId:'D',context:{contracts:old}}),activatePreparedRelease:()=>navigated++},
  store:{},storage:null,persistentStorage:{getItem:()=>null}
 });try{assert.deepEqual(await coordinator.check(),{status:'defer',code:'incompatible-contract'});assert.equal(prepared,0);assert.equal(navigated,0)}finally{coordinator.destroy()}
});

test('a generic old shell cannot acknowledge a diagnostics-admin snapshot during rollback',async()=>{
 let restored=0;const marker={token:'envelope',owner:'teacher:A',sourceBuild:'E',targetBuild:'D',phase:'rollback'},envelope={schema:1,owner:'teacher:A',route:'#diagnostics',adapters:[{module:'diagnostics',resumeToken:'saved'}]};
 const coordinator=bootstrapUpdateCoordinator({autoStart:false,window:null,document:null,getOwner:()=> 'teacher:A',getRoute:()=> '#diagnostics',
  getAdapters:()=>[{module:'platform',resumeAfterUpdate:async()=>{restored++;return {status:'restored'}}}],
  release:{getReleaseContext:()=>({buildId:'D'})},store:{get:async()=>envelope},storage:{getItem:()=>JSON.stringify(marker)},persistentStorage:null
 });try{assert.deepEqual(await coordinator.restorePending(),{status:'defer',code:'module-not-ready'});assert.equal(restored,0)}finally{coordinator.destroy()}
});

for(const compatible of [false,true])test('diagnostics rollback '+(compatible?'accepts a compatible previous release':'blocks a previous release without the UI contract and retains checkpoint'),async()=>{
 const contracts=JSON.parse(await readFile(new URL('../site/data/platform-contracts.json',import.meta.url),'utf8')),previousContracts=structuredClone(contracts);
 if(!compatible)delete previousContracts.modules.diagnostics;
 const values=new Map(),snapshots=new Map();let navigated=0,prepared=0;
 const marker={token:'envelope',owner:'teacher:A',sourceBuild:'D',targetBuild:'E',phase:'switching',previous:{buildId:'D'}};
 values.set('rudn.update.pending.v1',JSON.stringify(marker));
 snapshots.set('envelope',{schema:1,owner:'teacher:A',route:'#diagnostics',checkpointContracts:captureCheckpointContracts(contracts,[{module:'diagnostics'}]),previous:marker.previous,adapters:[{module:'diagnostics',resumeToken:'saved'}]});snapshots.set('saved',{kind:'diagnostics',draft:'last field'});
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const adapter={module:'diagnostics',resumeAfterUpdate:async()=>({status:'blocked',code:'synthetic-restore-failed'}),cancelPreparation:async()=>{}};
 const coordinator=bootstrapUpdateCoordinator({autoStart:false,window:null,document:null,getOwner:()=> 'teacher:A',getRoute:()=> '#diagnostics',getAdapters:()=>[adapter],module:'diagnostics',
  release:{getReleaseContext:()=>({buildId:'E',contracts}),prepareRelease:async()=>{prepared++;return {ready:true,context:{contracts:previousContracts}}},rollbackRelease:()=>navigated++},
  store:{get:async key=>snapshots.get(key),remove:async key=>snapshots.delete(key)},storage,persistentStorage:storage
 });try{
  assert.deepEqual(await coordinator.restorePending(),compatible?{status:'rollback'}:{status:'blocked',code:'update/rollback-incompatible-contract'});
  assert.equal(navigated,compatible?1:0);assert.equal(prepared,1);assert.equal(snapshots.size,2);assert.equal(JSON.parse(values.get('rudn.update.pending.v1')).phase,compatible?'rollback':'blocked');
 }finally{coordinator.destroy()}
});

test('checkpoint contract metadata contains only canonical versions and respects all existing module aliases',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../site/data/platform-contracts.json',import.meta.url),'utf8'));
 for(const [module,key]of [['platform','platform'],['quiz:lecture-1','quiz'],['form:reflection','form'],['classroom','quiz'],['quiz-board','quiz'],['puzzle','maps'],['legal-lab','legal-lab'],['career','career'],['reception','reception'],['settlements','settlements'],['governor','governor'],['diagnostics','diagnostics']]){
  const required=captureCheckpointContracts(manifest,[{module,owner:'PRIVATE',resumeToken:'PRIVATE',state:{draft:'PRIVATE'}}]);
  assert.deepEqual(required,{schema:1,updateEnvelope:1,adapterSnapshot:1,durableStore:1,modules:{[key]:1}});assert.equal(acceptsCheckpointContracts(required,manifest),true);
 }
 for(const records of [null,[],[{}],[{module:''}],[{module:'missing'}],[{module:'bad/path'}]])assert.equal(captureCheckpointContracts(manifest,records),null);
 for(const required of [null,{}, {...manifest,modules:{}},{...manifest,updateEnvelope:0},{...manifest,modules:{diagnostics:1.5}},{...manifest,extra:'PRIVATE'}])assert.equal(acceptsCheckpointContracts(required,manifest),false);
});

const bootstrapSource=await readFile(new URL('../site/assets/js/release-bootstrap.js',import.meta.url),'utf8');
const bootFailedSource=bootstrapSource.slice(bootstrapSource.indexOf('async function bootFailed('),bootstrapSource.indexOf('\nconst ownURL='));
for(const outcome of ['compatible','missing-checkpoint-metadata','missing-previous-metadata','wrong-version','wrong-module','missing-token'])test('actual early bootstrap rollback: '+outcome,async()=>{
 const manifest=JSON.parse(await readFile(new URL('../site/data/platform-contracts.json',import.meta.url),'utf8')),previous=structuredClone(manifest);
 const pending={token:'retained-token',sourceBuild:'A',targetBuild:'B',phase:'switching',previous:{buildId:'A'},checkpointContracts:captureCheckpointContracts(manifest,[{module:'diagnostics'}])};
 if(outcome==='missing-checkpoint-metadata')delete pending.checkpointContracts;
 if(outcome==='missing-token')delete pending.token;
 if(outcome==='wrong-version')previous.modules.diagnostics=2;
 if(outcome==='wrong-module')delete previous.modules.diagnostics;
 let navigated=0,shown=0,prepared=0;const writes=[];
 const context=vm.createContext({bootSettled:false,stopBootWatchdog(){context.bootSettled=true},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},
  dispatchEvent:()=>true,pendingTransition:()=>pending,document:{documentElement:{dataset:{releaseBuild:'B'}}},showBootFailure:()=>shown++,recordFailedRelease:()=>{},
  AbortController,setTimeout,clearTimeout,validateTarget:()=>{},writeTransition:value=>writes.push(structuredClone(value)),acceptsCheckpointContracts,
  prepareRelease:async()=>{prepared++;return {ready:true,buildId:'A',context:outcome==='missing-previous-metadata'?{}:{contracts:previous}}},
  activatePreparedRelease:()=>navigated++,failure:code=>Object.assign(Error(code),{code}),mark:()=>{}
 });
 vm.runInContext(bootFailedSource+'\nthis.invoke=bootFailed;',context);await context.invoke('synthetic-import-failed');
 assert.equal(prepared,1);assert.equal(pending.token,outcome==='missing-token'?undefined:'retained-token');assert.equal(pending.rollbackAttempted,true);
 assert.equal(pending.phase,outcome==='compatible'?'rollback':'blocked');assert.equal(navigated,outcome==='compatible'?1:0);assert.equal(shown,outcome==='compatible'?0:1);
 if(outcome!=='compatible')assert.equal(pending.code,'update/rollback-incompatible-contract');
 await context.invoke('synthetic-late-error');assert.equal(prepared,1);assert.ok(writes.length>=2);
});
