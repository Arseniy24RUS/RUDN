/** Independent informed synthetic regression of the public Legal Lab mount.
 * Real browser input, canonical documents, isolated host; no Firebase or grades.
 * Browser plugin not available. Bundled Playwright is the permitted fallback.
 * This is not a physical iPhone, thermal measurement, or human usability test. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=resolve(arg('--root',resolve(dirname(fileURLToPath(import.meta.url)),'..'))),site=resolve(root,'site');
const output=resolve(arg('--output',resolve(root,'../evidence/runs/20261018-reader-performance/current')));
const browserName=arg('--browser','chromium'),suite=arg('--suite','all'),locales=arg('--locales','ru,en,zh').split(','),docsArg=arg('--docs','');
const sizes={small:{width:320,height:568},mobile:{width:390,height:844},largeMobile:{width:430,height:932},landscape:{width:844,height:390},tablet:{width:768,height:1024},desktop:{width:1366,height:900}};
const sizeName=arg('--viewport','mobile'),viewport=sizes[sizeName],input=arg('--input',sizeName==='desktop'?'mouse':'touch');
const soakMinutes=Number(arg('--duration-minutes','20'));
const enforceTiming=!args.includes('--functional');
assert.ok(viewport,'Unknown viewport');assert.ok(['smoke','deep','presence','offline','soak','all'].includes(suite));assert.ok(soakMinutes>=0&&soakMinutes<=120);
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href:'playwright');
const {searchUnits}=await import(pathToFileURL(resolve(site,'apps/legal-lab/lib/core.mjs')).href);
const json=async name=>JSON.parse(await readFile(resolve(site,'apps/legal-lab/data',name),'utf8'));
const [catalog,bank,pack]=await Promise.all(['catalog.json','bank.json','assessment-variants.json'].map(json));
const mainDocuments=catalog.documents.filter(d=>d.main&&bank.classroom.some(t=>t.kind==='text'&&t.docId===d.id));
const documents=docsArg?docsArg.split(',').map(id=>{const d=mainDocuments.find(d=>d.id===id);assert.ok(d,`Unknown main document ${id}`);return d;}):mainDocuments;
const originals=new Map(),views=new Map();
async function documentView(id,locale){
  if(views.has(id+'/'+locale))return views.get(id+'/'+locale);
  const meta=catalog.documents.find(d=>d.id===id),doc=originals.get(id)||await json(meta.file);originals.set(id,doc);
  const tr=locale==='ru'?null:await json(`translations/${locale}/${id}.json`);
  const view=tr?{...doc,units:doc.units.map(u=>({...u,...tr.units[u.id]}))}:doc;views.set(id+'/'+locale,view);return view;
}
const fixtures={};for(const meta of mainDocuments){
  const index=bank.classroom.findIndex(t=>t.kind==='text'&&t.docId===meta.id),variant=pack.variants.find(v=>v.questionSet===meta.id);
  fixtures[meta.id]={index,variant:variant?.id};
}
let shell=(await readFile(resolve(site,'index.html'),'utf8')).split('  <dialog class="modal" id="authDialog">')[0];
shell=shell.replace('<head>','<head><base href="/">').replace(/<title>[^<]*<\/title>/,'<title>Legal Lab isolated reader performance QA</title>').replace(/<main class="main"[\s\S]*?<\/main>/,'<main class="main" id="app"><section class="page legal-lab-course-page"><div id="legalLabMount"><div id="module"></div></div></section></main>');
const harness=shell+`<script type="module">
import{mountLegalLab}from'/apps/legal-lab/entry.mjs';
import{aggregatePeers}from'/apps/legal-lab/lib/live.mjs';
const q=new URLSearchParams(location.search),doc=q.get('doc'),locale=q.get('locale')||'ru',mode=q.get('mode')||'quiz',fixture=${JSON.stringify(fixtures)}[doc],owner='synthetic-reader-qa-'+crypto.randomUUID();
const assessment=mode==='assessment'?{format:'five-task-v1',caseId:fixture.variant,attemptId:owner,startedAt:1,contentVersion:${JSON.stringify(catalog.contentVersion)},preview:true,stage:2,phase:'active',answer:{assessmentMode:'five-task-v1',tasks:{}},result:null,delivery:'not-submitted'}:null;
const state={schema:1,contentVersion:${JSON.stringify(catalog.contentVersion)},id:owner,startedAt:1,answers:{},index:fixture.index,reader:{},elapsedMs:0,view:assessment?'assessment':'learn',assessment,quizCompletion:{contentVersion:${JSON.stringify(catalog.contentVersion)}}};
window.__qaCheckpoint=structuredClone(state);window.__qaSaves=0;window.__qaEvents=[];window.__qaDiagnostics=[];
window.__qaLive={taskId:null,listeners:new Set(),rows:{},watchTask(id){this.taskId=id;this.emit();},subscribe(fn){this.listeners.add(fn);this.emit();return()=>this.listeners.delete(fn);},async choose(){return true;},close(){this.listeners.clear();},emit(){const snapshot={taskId:this.taskId,connected:true,aggregates:aggregatePeers(this.rows)};for(const listener of this.listeners)listener(snapshot);},peers(ids){const now=Date.now();this.rows=Object.fromEntries(Array.from({length:30},(_,i)=>['synthetic-peer-'+i,{updatedAt:now,expiresAt:now+45000,answer:{docId:doc,selections:[ids[i%ids.length]]}}]));this.emit();}};
document.addEventListener('submit',e=>{if(e.target.matches('[data-search-form="reader"]'))window.__qaEvents.push({kind:'search',at:performance.now(),trusted:e.isTrusted});},true);
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)window.__qaEvents.push({kind:b.dataset.action,id:b.dataset.id,at:performance.now(),trusted:e.isTrusted});},true);
for(const kind of ['input','change'])document.addEventListener(kind,e=>{if(e.target.matches('[data-input="reader-query"]'))window.__qaEvents.push({kind,at:performance.now(),trusted:e.isTrusted,connected:e.target.isConnected,queryLength:e.target.value.length});},true);
performance.mark('qa-mount-start');
window.__qaHandle=await mountLegalLab(document.querySelector('#module'),{owner,period:'qa',locale,initialView:state.view,initialState:state,backend:{isAdmin:()=>false,getProfile:()=>({studentKey:'synthetic',group:'QA'}),saveAttempt:async()=>{throw Error('Grade write prohibited in QA')}},getOwner:()=>owner,checkpoint:async value=>{window.__qaCheckpoint=structuredClone(value.state);window.__qaSaves++;},assessmentAllowed:()=>true,liveFactory:async()=>window.__qaLive,diagnostics:{record:(event,fields)=>window.__qaDiagnostics.push({event,fields,at:performance.now()})}});
await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);performance.mark('qa-mount-end');performance.measure('qa-mount','qa-mount-start','qa-mount-end');window.__qaReady=true;
</script></body></html>`;
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
let serverOffline=false,serverDroppedConnections=0;
const server=createServer(async(req,res)=>{if(serverOffline){serverDroppedConnections++;req.socket.destroy();return;}try{
  const url=new URL(req.url,'http://localhost');if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(url.pathname==='/__qa/reader'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(harness);return;}
  let f=resolve(site,'.'+decodeURIComponent(url.pathname));if(f!==site&&!f.startsWith(site+sep))throw Error('not found');if((await stat(f)).isDirectory())f=resolve(f,'index.html');if(!(await stat(f)).isFile())throw Error('not found');
  res.writeHead(200,{'content-type':mime[extname(f)]||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(f));
}catch{res.writeHead(404);res.end();}});
await mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,report={schema:1,kind:'informed synthetic isolated public-mount performance and regression',startedAt:new Date().toISOString(),root,browserName,viewport,input,suite,locales,enforceTiming,source:{},command:process.argv,environment:{fallback:'Browser plugin not available; ordinary bundled Playwright authorized',firebase:false,physicalDevice:false,thermalMeasurement:false,timing:'Browser performance clock at trusted submit/click; first satisfied DOM/geometry predicate before screenshots; no fixed wait subtracted',timingAcceptance:enforceTiming?'enforced':'not enforced: explicitly requested functional run, no performance acceptance claim'},records:[]};
const sourceFiles=['entry.mjs','lib/reader-view.mjs','lib/reader-controller.mjs','lib/reader-data.mjs','lib/reader-codec.mjs','lib/reader-search-worker.mjs','lib/reader-registry.mjs','lib/corpus.mjs','lib/live.mjs','lib/core.mjs','style.css','data/reader/catalog.json'].map(name=>'apps/legal-lab/'+name).concat(['index.html','service-worker.js','assets/css/site.css']);
for(const name of sourceFiles)report.source[name]=createHash('sha256').update(await readFile(resolve(site,name))).digest('hex');
const save=()=>writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
function closeFailure(record,error){record.status='fail';record.cleanupError=error.stack||String(error);record.error??=record.cleanupError;}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)];
let browser;
async function activate(locator){if(input==='touch')await locator.tap();else if(input==='keyboard'){await locator.focus();await locator.press('Enter');}else await locator.click();}
async function manualScroll(page,amount){
  const box=await page.locator('.ll-paper').boundingBox();assert.ok(box);
  if(browserName==='webkit'&&input==='touch'){
    // Playwright mobile WebKit has no mouse-wheel primitive. Exercise actual
    // keyboard scrolling/cancellation, and disclose this separate input path.
    const id=await page.evaluate(()=>{const paper=document.querySelector('.ll-paper'),p=paper.getBoundingClientRect();return [...paper.querySelectorAll('[data-unit]')].find(el=>{const b=el.getBoundingClientRect();return b.bottom>p.top+5&&b.top<p.bottom-5;})?.dataset.unit;});assert.ok(id);await page.locator(`[data-unit="${id}"]`).focus();for(let i=0;i<Math.min(6,Math.max(1,Math.ceil(amount/box.height)));i++)await page.keyboard.press('PageDown');return 'trusted PageDown (mobile WebKit does not expose wheel)';
  }
  await page.mouse.move(box.x+box.width/2,Math.min(viewport.height-5,Math.max(box.y+5,box.y+box.height/2)));await page.mouse.wheel(0,amount);return 'trusted wheel';
}
async function diagnosticSnapshot(page){return page.evaluate(()=>{const paper=document.querySelector('.ll-paper'),box=paper?.getBoundingClientRect(),units=[...(paper?.querySelectorAll('.ll-paragraph')||[])],anchor=units.find(el=>{const b=el.getBoundingClientRect();return b.bottom>Math.max(0,box.top)+1&&b.top<Math.min(innerHeight,box.bottom)-1;});return{nodes:document.querySelectorAll('*').length,mountedUnits:units.length,readerWindow:units.map(el=>el.dataset.unit),readerAnchor:anchor?{id:anchor.dataset.unit,offset:anchor.getBoundingClientRect().top-box.top}:null,paperScrollTop:paper?.scrollTop,workers:window.__qaWorkers.live,peakWorkers:window.__qaWorkers.peak,stats:window.__qaHandle?.getDiagnostics?.()||null,saves:window.__qaSaves,windowY:scrollY,documentHeight:document.documentElement.scrollHeight};});}
function bounded(snapshot){
  assert.ok(snapshot.mountedUnits>0&&snapshot.mountedUnits<=192,`Mounted paragraphs ${snapshot.mountedUnits}, allowed 1..192`);
  assert.ok(snapshot.workers<=1&&snapshot.peakWorkers<=1,`Worker bound exceeded ${snapshot.workers}/${snapshot.peakWorkers}`);
  assert.ok(snapshot.stats?.corpus,'Public getDiagnostics().corpus is required for independent cache verification');
  const c=snapshot.stats.corpus;assert.ok(c.blocks<=12&&c.blockBytes<=2097152,`Block cache exceeded: ${JSON.stringify(c)}`);
  assert.ok(c.readerDocuments<=1&&c.searchIndexes<=1,'Reader document/search index cache exceeded');
  if(Number.isFinite(c.activeBlockLoads))assert.ok(c.activeBlockLoads<=3,'At most three block loads may run concurrently');
}
async function openCase(meta,locale,mode='quiz'){
  const record={docId:meta.id,locale,mode,viewport,status:'fail',checks:[],cycles:[],consoleErrors:[],pageErrors:[],requests:[]};report.records.push(record);
  const context=await browser.newContext({viewport,hasTouch:input==='touch',...(browserName!=='firefox'?{isMobile:input==='touch'}:{})}),page=await context.newPage();page.setDefaultTimeout(15000);
  await page.addInitScript(()=>{const Native=window.Worker;window.__qaWorkers={live:0,peak:0};window.Worker=class extends Native{constructor(...args){super(...args);this.__qaLive=true;window.__qaWorkers.live++;window.__qaWorkers.peak=Math.max(window.__qaWorkers.peak,window.__qaWorkers.live);}terminate(){if(this.__qaLive){this.__qaLive=false;window.__qaWorkers.live--;}return super.terminate();}};});
  page.on('pageerror',e=>record.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')record.consoleErrors.push(m.text());});page.on('request',req=>record.requests.push(new URL(req.url()).pathname));
  try{await page.goto(`${base}/__qa/reader?doc=${meta.id}&locale=${locale}&mode=${mode}`);await page.waitForFunction(()=>window.__qaReady);await page.locator('.ll-paper .ll-paragraph').first().waitFor();
  assert.equal(await page.title(),'Legal Lab isolated reader performance QA');assert.ok((await page.locator('.ll-main').innerText()).trim());
  record.mountMs=await page.evaluate(()=>performance.getEntriesByName('qa-mount')[0].duration);record.initial=await diagnosticSnapshot(page);bounded(record.initial);if(enforceTiming)assert.ok(record.mountMs<=3000,`First useful reader ${record.mountMs.toFixed(1)} ms exceeds 3000 ms`);
  assert.equal(await page.locator('.ll-paper [data-document-text][lang="'+locale+'"]').count()>0,true,'Document rendered in requested locale');
  return {record,context,page};}catch(error){record.initialFailureScreenshot=resolve(output,`${meta.id}-${locale}-${mode}-mount-error.png`);await page.screenshot({path:record.initialFailureScreenshot,fullPage:false}).catch(()=>{});await context.close();throw error;}
}
async function search(page,query,expected){
  const toggle=page.locator('[data-action="toggle-reader-search"]');if(await toggle.getAttribute('aria-expanded')!=='true')await activate(toggle);
  const field=page.locator('[data-input="reader-query"]');await field.fill(query);
  // Arm inside the browser BEFORE input; Playwright's return/transport latency
  // must not be charged to the application as it was in the exploratory probe.
  await page.evaluate(ids=>{const before=window.__qaEvents.length,started=performance.now();window.__qaSearchResult=null;function frame(){const event=window.__qaEvents.slice(before).find(e=>e.kind==='search'),got=[...document.querySelectorAll('[data-reader-search-panel] [data-action="jump-unit"]')].map(e=>e.dataset.id);if(event&&!window.__qaHandle.getDiagnostics().reader?.searchPending&&got.length===ids.length&&got.every((id,i)=>id===ids[i])){window.__qaSearchResult={ms:performance.now()-event.at,trusted:event.trusted,count:got.length,application:window.__qaDiagnostics.findLast(x=>x.event==='document-search'&&x.at>=event.at)?.fields||null};return;}if(performance.now()-started<15000)requestAnimationFrame(frame);}requestAnimationFrame(frame);},expected.slice(0,20).map(u=>u.id));
  await field.press('Enter');await page.waitForFunction(()=>window.__qaSearchResult);const result=await page.evaluate(()=>window.__qaSearchResult);assert.equal(result.trusted,true);return result;
}
async function pageToHit(page,target,expected){
  const position=expected.findIndex(u=>u.id===target.id);assert.ok(position>=0);const n=Math.floor(position/20);
  for(let p=1;p<=n;p++){await activate(page.locator(`[data-action="search-page"][data-page="${p}"]`));await page.waitForFunction(({ids})=>{const got=[...document.querySelectorAll('[data-reader-search-panel] [data-action="jump-unit"]')].map(e=>e.dataset.id);return got.length===ids.length&&got.every((id,i)=>id===ids[i]);},{ids:expected.slice(p*20,p*20+20).map(u=>u.id)});}
  return {position,page:n+1,pages:Math.ceil(expected.length/20)};
}
async function jump(page,target,{resize=false}={}){
  const hit=page.locator(`[data-action="jump-unit"][data-id="${target.id}"]`);
  if(resize)await page.setViewportSize({width:viewport.width,height:Math.max(280,viewport.height-230)});
  await page.evaluate(id=>{const before=window.__qaEvents.length,started=performance.now();window.__qaJumpResult=null;function check(){
    const event=window.__qaEvents.slice(before).find(e=>e.kind==='jump-unit'&&e.id===id);if(!event)return false;
    const el=document.querySelector(`[data-unit="${CSS.escape(id)}"]`),paper=el?.closest('.ll-paper'),reader=el?.closest('.ll-reader'),panel=reader?.querySelector('[data-reader-search-panel]');if(!el||!paper||panel&&!panel.hidden)return false;
    const b=el.getBoundingClientRect(),p=paper.getBoundingClientRect(),dock=reader.querySelector('.ll-reader-dock')?.getBoundingClientRect(),top=Math.max(0,p.top,dock?.bottom||0),bottom=Math.min(innerHeight,p.bottom),left=Math.max(0,p.left),right=Math.min(innerWidth,p.right),visible=b.bottom>top+2&&b.top<bottom-2&&b.right>left&&b.left<right;
    if(!visible||!el.classList.contains('ll-search-target'))return false;
    return{ms:performance.now()-event.at,trusted:event.trusted,top:b.top,bottom:b.bottom,height:b.height,paperTop:p.top,paperBottom:p.bottom,dockBottom:dock?.bottom,viewport:innerHeight,visible,highlight:true,centerHit:el.contains(document.elementFromPoint(Math.max(left+1,Math.min(right-1,b.left+b.width/2)),Math.max(top+1,Math.min(bottom-1,b.top+b.height/2))))};
  }function frame(){const result=check();if(result){window.__qaJumpResult=result;return;}if(performance.now()-started<15000)requestAnimationFrame(frame);}requestAnimationFrame(frame);},target.id);
  await activate(hit);if(resize)await page.setViewportSize(viewport);await page.waitForFunction(()=>window.__qaJumpResult);const result=await page.evaluate(()=>window.__qaJumpResult);assert.equal(result.trusted,true);assert.ok(result.centerHit,'Jumped paragraph must be exposed to real pointer input');await page.waitForFunction(()=>!window.__qaHandle.getDiagnostics().reader?.jumpPending);return result;
}
function targetNear(view,fraction){
  const point=Math.floor(fraction*(view.units.length-1));for(const u of [...view.units.slice(point),...view.units.slice(0,point).reverse()]){if(u.text.trim().length<90)continue;const query=u.text.trim().slice(0,80),hits=searchUnits(view,query);if(hits.length&&hits.length<=60)return{target:u,query,hits};}throw Error('No useful target fixture');
}
async function searchJump(page,view,fraction,{resize=false}={}){
  const fixture=targetNear(view,fraction),result={target:fixture.target.id,section:fixture.target.sectionId};result.search=await search(page,fixture.query,fixture.hits);result.pagination=await pageToHit(page,fixture.target,fixture.hits);result.jump=await jump(page,fixture.target,{resize});result.metrics=await diagnosticSnapshot(page);bounded(result.metrics);return result;
}
async function closeCase({record,context,page}){
  try{record.final=await diagnosticSnapshot(page);record.finalUI=await page.evaluate(()=>({events:window.__qaEvents.slice(-15),diagnostics:window.__qaDiagnostics.slice(-15),searchBusy:document.querySelector('.ll-search-results')?.getAttribute('aria-busy'),searchResultIds:[...document.querySelectorAll('[data-reader-search-panel] [data-action="jump-unit"]')].map(el=>el.dataset.id)}));bounded(record.final);assert.deepEqual(record.pageErrors,[]);assert.deepEqual(record.consoleErrors,[]);record.screenshot=resolve(output,`${record.docId}-${record.locale}-${record.mode}-${report.records.indexOf(record)}.png`);await page.screenshot({path:record.screenshot,fullPage:false});await page.evaluate(()=>window.__qaHandle.destroy());await page.waitForFunction(()=>window.__qaWorkers.live===0);record.workersAfterDestroy=await page.evaluate(()=>window.__qaWorkers.live);}finally{await context.close();await save();}
}
async function smoke(meta,locale){let c;try{c=await openCase(meta,locale);const view=await documentView(meta.id,locale);c.record.cycles.push(await searchJump(c.page,view,.83));c.record.status='pass';}catch(error){if(c)c.record.error=error.stack||String(error);else report.records.at(-1).error=error.stack||String(error);}finally{if(c)await closeCase(c).catch(error=>{closeFailure(c.record,error);});await save();console.log('SMOKE',meta.id,locale,report.records.at(-1).status);}}
async function paginationFixture(view){
  // The former probe mistakenly waited for an off-page hit among 39 results.
  // Select a real canonical word, then inspect and navigate actual pagination.
  const words=new Map();for(const unit of view.units){for(const word of new Set((unit.text.toLowerCase().match(/[а-яё]{5,}/gu)||[])))words.set(word,(words.get(word)||0)+1);}
  for(const [word,count]of [...words].filter(([,count])=>count>=21&&count<=45).sort((a,b)=>Math.abs(a[1]-39)-Math.abs(b[1]-39))){const hits=searchUnits(view,word);if(hits.length===39)return{query:word,hits};}
  throw Error('Expected a real 39-result query in canonical KoAP');
}
async function cancelNavigation(page,view){
  const f=targetNear(view,.55);await search(page,f.query,f.hits);await pageToHit(page,f.target,f.hits);
  const held=[];let release;const gate=new Promise(r=>{release=r;});
  const handler=async route=>{held.push(route.request().url());await gate;await route.continue().catch(error=>{if(!/already handled|Target page.*closed|Target closed/u.test(error.message))throw error;});};await page.route('**/blocks/*.json',handler);
  try{
    await activate(page.locator(`[data-action="jump-unit"][data-id="${f.target.id}"]`));
    const started=Date.now();while(!held.length&&Date.now()-started<2000)await new Promise(r=>setTimeout(r,20));assert.ok(held.length,'Cancellation fixture must delay an uncached destination block');
    await page.locator('[data-reader-search-panel]').waitFor({state:'hidden'});const scrollInput=await manualScroll(page,180);
    release();await page.waitForFunction(()=>window.__qaHandle.getDiagnostics().corpus.pendingBlocks===0);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const result=await page.evaluate(id=>({targetHighlighted:Boolean(document.querySelector(`[data-unit="${CSS.escape(id)}"].ll-search-target`)),cancelled:window.__qaDiagnostics.some(d=>d.event==='document-jump'&&d.fields?.code==='cancelled')}),f.target.id);assert.equal(result.targetHighlighted,false,'User scroll cancels pending automatic target highlight/jump');assert.equal(result.cancelled,true,'Cancelled navigation recorded through public diagnostic contract');return{...result,delayedRequests:held.length,scrollInput};
  }finally{release();await page.unroute('**/blocks/*.json',handler);}
}
async function deep(meta,locale,mode='quiz'){let c;try{
  c=await openCase(meta,locale,mode);const {record,page}=c,view=await documentView(meta.id,locale);
  for(const fraction of [...Array(2)].flatMap(()=>[.9,.1,.8,.2,.7,.05,.95,.3,.6,.4])){const cycle=await searchJump(page,view,fraction,{resize:record.cycles.length===3});const f=targetNear(view,fraction);cycle.scrollInput=await manualScroll(page,Math.max(1500,cycle.jump.height+viewport.height));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));cycle.warmSearch=await search(page,f.query,f.hits);await pageToHit(page,f.target,f.hits);cycle.warmJump=await jump(page,f.target);record.cycles.push(cycle);await save();console.log('CYCLE',meta.id,locale,mode,record.cycles.length,Math.round(cycle.warmSearch.ms),Math.round(cycle.warmJump.ms));}
  if(meta.id==='koap'&&locale==='ru'){
    const f=await paginationFixture(view);record.pagination39={count:f.hits.length,search:await search(page,f.query,f.hits)};record.pagination39.page=await pageToHit(page,f.hits[38],f.hits);record.pagination39.jump=await jump(page,f.hits[38]);assert.equal(record.pagination39.page.page,2);record.checks.push('39 actual search results, second-page last target visible');
    record.cancelNavigation=await cancelNavigation(page,view);
  }
  const currentId=record.cycles.at(-1).target;if(mode==='quiz'){
    await page.evaluate(()=>{window.__qaPaper=document.querySelector('.ll-paper');});
    const nextQuestion=page.locator('[data-reader-question][aria-pressed="false"]').first();if(await nextQuestion.count()){await activate(nextQuestion);assert.equal(await page.evaluate(()=>document.querySelector('.ll-paper')===window.__qaPaper),true,'Same-document question must preserve reader DOM');record.checks.push('same-document question preserves paper');}
  }
  // Selection uses genuine input, with a locator check; no dispatchEvent shortcuts.
  const select=page.locator(`[data-action="select-unit"][data-unit="${currentId}"]`);if(await select.count()){await activate(select);assert.equal(await select.getAttribute('aria-pressed'),'true');record.checks.push('paragraph selectable after repeated search jumps');}
  record.searchP95=percentile(record.cycles.map(c=>c.warmSearch.ms),.95);record.jumpP95=percentile(record.cycles.map(c=>c.warmJump.ms),.95);if(enforceTiming){assert.ok(record.searchP95<=300,`Warm search p95 ${record.searchP95.toFixed(1)} ms exceeds 300`);assert.ok(record.jumpP95<=500,`Jump to loaded fragment p95 ${record.jumpP95.toFixed(1)} ms exceeds 500`);}
  record.status='pass';
}catch(error){if(c)c.record.error=error.stack||String(error);else report.records.at(-1).error=error.stack||String(error);}finally{if(c)await closeCase(c).catch(error=>{closeFailure(c.record,error);});await save();console.log('DEEP',meta.id,locale,mode,report.records.at(-1).status);}}
async function presence(){let c;try{
  c=await openCase(catalog.documents.find(d=>d.id==='constitution'),'ru');const {record,page}=c;record.kind='30 synthetic participants, unchanged aggregate, real 60 seconds';
  await page.evaluate(()=>{window.__qaPeerIds=[...document.querySelectorAll('.ll-paper .ll-paragraph')].slice(0,3).map(el=>el.dataset.unit);window.__qaLive.peers(window.__qaPeerIds);});
  await page.waitForFunction(()=>document.querySelectorAll('.ll-paper [data-presence-count]').length===3);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>{window.__qaPresenceMutations=0;window.__qaPresenceObserver=new MutationObserver(rows=>{window.__qaPresenceMutations+=rows.length;});window.__qaPresenceObserver.observe(document.querySelector('.ll-paper'),{subtree:true,attributes:true,childList:true,characterData:true});window.__qaPresenceObserver.observe(document.querySelector('[data-presence-status]'),{subtree:true,attributes:true,childList:true,characterData:true});window.__qaPresenceStarted=performance.now();window.__qaPresenceBeats=0;window.__qaPresenceTimer=setInterval(()=>{window.__qaPresenceBeats++;window.__qaLive.peers(window.__qaPeerIds);},15000);});
  await page.waitForFunction(()=>window.__qaPresenceBeats>=4,{},{timeout:65000,polling:250});
  record.presence=await page.evaluate(()=>{clearInterval(window.__qaPresenceTimer);window.__qaPresenceObserver.disconnect();return{elapsedMs:performance.now()-window.__qaPresenceStarted,heartbeats:window.__qaPresenceBeats,mutations:window.__qaPresenceMutations,badges:[...document.querySelectorAll('.ll-paper [data-presence-count]')].map(el=>el.textContent),respondents:window.__qaLive.rows?Object.keys(window.__qaLive.rows).length:0};});assert.ok(record.presence.elapsedMs>=60000);assert.equal(record.presence.respondents,30);assert.equal(record.presence.mutations,0,'Identical aggregates must not change paragraph or status DOM');record.status='pass';
}catch(error){if(c)c.record.error=error.stack||String(error);else report.records.at(-1).error=error.stack||String(error);}finally{if(c)await closeCase(c).catch(error=>{closeFailure(c.record,error);});await save();console.log('PRESENCE',report.records.at(-1).status);}}
async function offline(){let c;try{
  const meta=catalog.documents.find(d=>d.id==='koap');c=await openCase(meta,'ru');const {record,page,context}=c;record.kind='actual existing service worker, offline cache and uncached destination';
  // Windows WebKit's setOffline prevents even a minimal cached SW navigation
  // from loading (independently reproduced). Disconnect this real HTTP server
  // instead: SW/CacheStorage and application fetches remain entirely real.
  record.offlineMode=browserName==='webkit'?'server TCP disconnect: Windows WebKit context.setOffline breaks even a minimal cached SW navigation':'Playwright browser context offline';
  record.stage='register-service-worker';await save();await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js');await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker did not activate in 30 seconds')),30000))]);});await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  // A controlled online reload caches the real imports, metadata and blocks.
  await page.reload();await page.waitForFunction(()=>window.__qaReady);const view=await documentView(meta.id,'ru');record.online=await searchJump(page,view,.8);
  record.cachedPaths=await page.evaluate(async()=>{const out=[];for(const key of await caches.keys())for(const request of await(await caches.open(key)).keys()){const path=new URL(request.url).pathname;if(path.includes('/data/reader/koap/'))out.push(path);}return out;});assert.ok(record.cachedPaths.some(p=>p.endsWith('/search.json')),'The document search index was actually cached');assert.ok(record.cachedPaths.some(p=>p.includes('/blocks/')),'Real document blocks were cached');
  if(browserName==='webkit')serverOffline=true;else await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.__qaReady);record.offlineCached=await searchJump(page,view,.8);record.checks.push('Offline reload and cached target search/jump use real service-worker data');
  const f=targetNear(view,.35);await search(page,f.query,f.hits);await pageToHit(page,f.target,f.hits);const before=await diagnosticSnapshot(page),errorsBefore=record.consoleErrors.length,pageErrorsBefore=record.pageErrors.length,requestsBefore=record.requests.length;
  await activate(page.locator(`[data-action="jump-unit"][data-id="${f.target.id}"]`));await page.locator('.ll-alert.ll-danger').waitFor();await page.waitForFunction(()=>!window.__qaHandle.getDiagnostics().reader?.jumpPending&&window.__qaHandle.getDiagnostics().corpus.pendingBlocks===0);
  const first=await diagnosticSnapshot(page);await page.waitForTimeout(1000);const after=await diagnosticSnapshot(page);await page.waitForTimeout(500);const settled=await diagnosticSnapshot(page);record.offlineUncached={before,first,after,settled,newRequests:record.requests.length-requestsBefore,serverDroppedConnections,expectedNetworkErrors:record.consoleErrors.splice(errorsBefore),expectedNetworkPageErrors:record.pageErrors.splice(pageErrorsBefore)};
  assert.ok(!await page.locator(`[data-unit="${f.target.id}"].ll-search-target`).count(),'An uncached target must not be presented as loaded');assert.deepEqual(settled.readerWindow,after.readerWindow,'Failed offline navigation must settle without repeating window renders');assert.ok(before.readerAnchor&&after.readerAnchor,'The previous text remains visible after the offline failure');assert.equal(after.readerAnchor.id,before.readerAnchor.id,'Failed offline navigation preserves the visible reading anchor');assert.ok(Math.abs(after.readerAnchor.offset-before.readerAnchor.offset)<=2,'Failed offline navigation preserves the anchor position');assert.ok(record.requests.length-requestsBefore<=8,'A single unavailable block window has bounded request attempts');assert.equal(settled.stats.corpus.pendingBlocks,0);bounded(first);bounded(after);bounded(settled);
  assert.ok(record.offlineUncached.expectedNetworkErrors.every(s=>/ERR_INTERNET_DISCONNECTED|Failed to load resource|Failed to fetch|NetworkError|503|offline|network/i.test(s)),'Only expected offline network errors are classified');assert.ok(record.offlineUncached.expectedNetworkPageErrors.every(s=>browserName==='webkit'&&s==='Response served by service worker is an error'),'Only WebKit duplicate SW network errors during the intentionally disconnected step are classified');if(browserName==='webkit')assert.ok(serverDroppedConnections>=3,'Offline WebKit must encounter actual failed network connections');
  serverOffline=false;await context.setOffline(false);record.recovered=await searchJump(page,view,.35);record.status='pass';
}catch(error){if(c)c.record.error=error.stack||String(error);else report.records.at(-1).error=error.stack||String(error);}finally{serverOffline=false;if(c){await c.context.setOffline(false);await closeCase(c).catch(error=>{closeFailure(c.record,error);});}await save();console.log('OFFLINE',report.records.at(-1).status);}}
async function soak(){let c;try{
  const first=catalog.documents.find(d=>d.id==='koap');c=await openCase(first,locales[0]);const {record,page}=c;record.kind='actual wall-clock soak, sequential documents and locales in one mount';record.requestedMinutes=soakMinutes;const started=Date.now();let i=0;const order=[first,...documents.filter(d=>d.id!==first.id)];
  while(Date.now()-started<soakMinutes*60000){
    const meta=order[Math.floor(i/3)%order.length],locale=locales[i%locales.length];if((await page.locator('#module').getAttribute('lang'))?.split('-')[0]!==locale)await page.evaluate(locale=>window.__qaHandle.setLocale(locale),locale);
    if(await page.locator('[data-reader-doc]').getAttribute('data-reader-doc')!==meta.id){const index=fixtures[meta.id].index,picker=page.locator('[data-input="task-picker"]');if(await picker.isVisible())await picker.selectOption(String(index));else await activate(page.locator('[data-action="go-task"][data-doc-group="'+meta.id+'"]'));await page.locator('[data-reader-doc="'+meta.id+'"] .ll-paragraph').first().waitFor();}
    const view=await documentView(meta.id,locale);record.cycles.push({docId:meta.id,locale,...await searchJump(page,view,[.92,.08,.81,.19,.7,.3][i%6])});i++;
    if(i%5===0){await save();console.log('SOAK',Math.round((Date.now()-started)/1000),'seconds',i,'cycles',record.cycles.at(-1).metrics.mountedUnits);}
    // Real idle between actions. The wall clock is never mocked or advanced.
    await page.waitForTimeout(5000);
  }
  record.elapsedMs=Date.now()-started;record.visitedDocumentLocales=[...new Set(record.cycles.map(c=>c.docId+'/'+c.locale))];record.expectedDocumentLocales=order.length*locales.length;assert.ok(record.elapsedMs>=soakMinutes*60000);if(soakMinutes>=20)assert.equal(record.visitedDocumentLocales.length,record.expectedDocumentLocales,'20-minute soak must exercise every document/locale in the same mount');record.status='pass';
}catch(error){if(c)c.record.error=error.stack||String(error);else report.records.at(-1).error=error.stack||String(error);}finally{if(c)await closeCase(c).catch(error=>{closeFailure(c.record,error);});await save();console.log('SOAK',report.records.at(-1).status);}}
try{
  browser=await pw[browserName].launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});report.browserVersion=browser.version();
  if(suite==='smoke'||suite==='all')for(const meta of documents)for(const locale of locales)await smoke(meta,locale);
  if(suite==='deep'||suite==='all')for(const meta of documents.filter(d=>['constitution','koap','44fz'].includes(d.id)||/44/.test(d.id)))for(const locale of locales){await deep(meta,locale);if(meta.id==='constitution')await deep(meta,locale,'assessment');}
  if(suite==='soak')await soak();
  if(suite==='presence')await presence();
  if(suite==='offline')await offline();
}catch(error){report.error=error.stack||String(error);}finally{
  await browser?.close();await new Promise(r=>server.close(r));report.sourceAfter={};for(const name of sourceFiles)report.sourceAfter[name]=createHash('sha256').update(await readFile(resolve(site,name))).digest('hex');report.sourceStable=JSON.stringify(report.source)===JSON.stringify(report.sourceAfter);if(!report.sourceStable)report.sourceChanges=sourceFiles.filter(name=>report.source[name]!==report.sourceAfter[name]);report.finishedAt=new Date().toISOString();report.passed=report.records.filter(r=>r.status==='pass').length;report.failed=report.records.filter(r=>r.status!=='pass').length;report.status=!report.error&&!report.failed&&report.sourceStable&&report.records.length?'pass':'fail';await save();console.log('REPORT',report.status,report.passed,report.failed,resolve(output,'report.json'));if(report.status!=='pass')process.exitCode=1;
}
