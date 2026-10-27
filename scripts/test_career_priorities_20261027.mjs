/** Isolated native career UI regression. Real component, IndexedDB and trusted
 * browser input; no production backend, fixture mutation or synthetic state edits. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {QUESTIONNAIRE_VERSION,REGISTRY_VERSION,MODEL_VERSION} from '../site/apps/career/assets/versions.mjs';

const require=createRequire(import.meta.url),args=new Set(process.argv.slice(2));
const site=path.resolve(fileURLToPath(new URL('../site/',import.meta.url)));
const evidence=path.resolve(process.env.CAREER_QA_OUTPUT||fileURLToPath(new URL('../../evidence/runs/20261027-career-priorities-v2/',import.meta.url)));
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),runDir=path.join(evidence,(args.has('--snapshot')?'final-snapshot-':args.has('--baseline')?'baseline-':'candidate-')+stamp);
const backendSource=`import {durableStore as store} from '/assets/js/durable-store.js';
export const groupOptions=()=>[];
export const backend={authReady:true,user:null,mode:'local',connected:false,serverTimeOffset:0,
getProfile:()=>null,isAdmin:()=>false,init:async()=>{},onStatus:()=>()=>{},status:()=>({}),globalNow:()=>Date.now(),
getAccessOverrides:()=>({}),localGrades:()=>({}),localAttempts:()=>[],
loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,{...o,queue:false}),
saveAttempt:async()=>{throw Error('QA forbids production submissions')}};`;
const harness=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Career stage 2 · isolated native QA</title>
<style>body{margin:0;background:#f4f7fb;font-family:system-ui,sans-serif}#qa-controls{display:flex;gap:8px;flex-wrap:wrap;padding:8px;background:#fff;border-bottom:1px solid #ccd8e5}#qa-controls button{font:inherit;padding:6px 10px}#module{max-width:1140px;margin:12px auto;padding:0 12px;box-sizing:border-box;width:100%}#qa-error{color:#a00;white-space:pre-wrap}</style>
<nav id="qa-controls" aria-label="Isolated QA host"><button data-qa-route="test">Stage 1</button><button data-qa-route="sectors">Stage 2</button><button data-qa-route="conditions">Stage 3</button><button data-qa-lang="ru">RU</button><button data-qa-lang="en">EN</button><button data-qa-lang="zh-Hans">中文</button></nav><pre id="qa-error" hidden></pre><div id="module"></div>
<script type="module">import {mountCareer} from '/apps/career/entry.mjs';
try{const query=new URLSearchParams(location.search);window.handle=await mountCareer(document.querySelector('#module'),{owner:'guest:career',context:'course',lang:query.get('lang')||'ru',initialRoute:query.get('route')||'sectors'});document.documentElement.dataset.qaReady='true';
for(const button of document.querySelectorAll('[data-qa-route]'))button.addEventListener('click',()=>window.handle.navigate(button.dataset.qaRoute));
for(const button of document.querySelectorAll('[data-qa-lang]'))button.addEventListener('click',()=>window.handle.setLocale(button.dataset.qaLang));
window.qaInput=[];const surface=document.querySelector('#module').shadowRoot;for(const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','touchcancel','keydown'])surface.addEventListener(type,event=>{if(event.target.closest?.('.sector-order-row'))window.qaInput.push({type,pointerType:event.pointerType||null,key:event.key||null,trusted:event.isTrusted,x:event.clientX??event.touches?.[0]?.clientX,y:event.clientY??event.touches?.[0]?.clientY,target:event.target.tagName});},{capture:true});
}catch(error){document.querySelector('#qa-error').hidden=false;document.querySelector('#qa-error').textContent=error.stack;console.error(error);}</script>`;
const types={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 res.setHeader('Cache-Control','no-store');
 if(pathname==='/qa-career.html'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
  return res.end(harness);
 }
 if(pathname==='/assets/js/backend.js'){res.setHeader('Content-Type','text/javascript');return res.end(backendSource);}
 if(pathname==='/favicon.ico'){res.statusCode=204;return res.end();}
 const target=path.resolve(site,'.'+decodeURIComponent(pathname));
 if(!target.startsWith(site+path.sep))throw Error('outside site');
 const bytes=await readFile(target);res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.end(bytes);
 }catch{res.statusCode=404;res.end('Missing local QA resource');}});
await new Promise(resolve=>server.listen(Number(process.env.CAREER_QA_PORT||8792),'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
console.log(`Career QA URL: ${base}/qa-career.html?lang=ru&route=sectors`);
if(args.has('--serve'))await new Promise(()=>{});

const pw=require(process.env.PLAYWRIGHT_PATH||'playwright');
await mkdir(runDir,{recursive:true});
const report={startedAt:new Date().toISOString(),status:'not-run',agent:'/root/career_priority_qa',url:base+'/qa-career.html',environment:{platform:process.platform,node:process.version},command:'node scripts/test_career_priorities_20261027.mjs '+process.argv.slice(2).join(' '),browserPath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||pw.chromium.executablePath(),browserAvailability:'CUA attempted first: getState browsers=[]; createBrowserTab(iab, localhost8786) returned Browser is not available: iab. Browser plugin not available; bundled regular Playwright authorized by AGENTS for ordinary localhost.',method:'Real mountCareer entry, source runtime/style/data, local IndexedDB; isolated backend only. Trusted mouse and CDP touch input. No production network or state/handler invocation.',cases:[],screenshots:[],errors:[],hashes:{}};
for(const relative of ['apps/career/runtime.bundle.mjs','apps/career/module.css','apps/career/surface.html','apps/career/entry.mjs','apps/career/assets/app.js','apps/career/assets/release.css','apps/career/locales/en.json','apps/career/locales/zh-Hans.json']){
 try{report.hashes[relative]=createHash('sha256').update(await readFile(path.join(site,relative))).digest('hex');}catch{}
}
let browser,lastPage,traceContext;
const saveReport=()=>writeFile(path.join(runDir,'report.json'),JSON.stringify(report,null,2));
const check=(name,details={})=>{report.cases.push({name,status:'pass',...details});console.log('PASS '+name);};
const recordScreenshot=async(page,name)=>{const target=path.join(runDir,name+'.png');await page.screenshot({path:target,fullPage:false});report.screenshots.push(target);};
const flush=page=>page.evaluate(async()=>{await window.handle.flush();await (await import('/assets/js/durable-store.js')).durableStore.flush();});
const state=async page=>{await flush(page);return page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('rudn-career:')&&key.endsWith('answers-v8.1'));return key?JSON.parse(localStorage.getItem(key)):null;});};
const row=(page,key,id)=>page.locator(`[data-order-list="${key}"] .sector-order-row[data-sector-id="${id}"]`);
const order=(page,key)=>page.locator(`[data-order-list="${key}"] .sector-order-row`).evaluateAll(elements=>elements.map(el=>el.dataset.sectorId));
const choose=async(page,id,low=false)=>page.locator(`.sector-card[data-sector="${id}"] .${low?'low':'priority'}-toggle`).click();
async function mountCase(viewport,language='ru',storageState){
 const context=await browser.newContext({viewport,hasTouch:true,serviceWorkers:'block',locale:language==='zh-Hans'?'zh-CN':language,...(storageState?{storageState}:{})});
 const page=await context.newPage(),errors=[];lastPage=page;
 page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.stack||error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(base+`/qa-career.html?lang=${language}&route=sectors`);
 try{await page.locator('html[data-qa-ready="true"]').waitFor();}catch(error){report.errors.push(...errors);await recordScreenshot(page,'mount-failure');throw error;}
 await page.locator('#view-sectors:not([hidden]) .sector-card').first().waitFor();
 assert.equal(await page.title(),'Career stage 2 · isolated native QA');
 return {context,page,errors};
}
async function drag(page,key,id,targetId,type='mouse'){
 const handle=row(page,key,id).locator('.sector-order-title');
 await handle.scrollIntoViewIfNeeded();
 // Place source near the middle, allowing either adjacent move on short screens.
 await handle.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
 const a=await handle.boundingBox(),b=await row(page,key,targetId).boundingBox();
 assert(a&&b,'Drag source and target exist');
 const x=a.x+Math.min(a.width/2,80),y=a.y+a.height/2,targetY=b.y+b.height/2+(b.y<a.y?-6:6);
 if(type==='touch'){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1,radiusX:2,radiusY:2}]});
  await page.waitForTimeout(500); // Product gesture is a stationary 400ms hold.
  assert.equal(await row(page,key,id).evaluate(el=>el.classList.contains('is-dragging')),true,'Long press activates whole-row sorting');
  for(let i=1;i<=16;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(targetY-y)*i/16,id:1,radiusX:2,radiusY:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,targetY,{steps:16});await page.mouse.up();
 }
 await flush(page);
}
async function quickSwipe(page,key='prioritySectors',id='FIN'){
 const source=row(page,key,id).locator('.sector-order-title');await source.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
 const before=await order(page,key),box=await source.boundingBox(),scroll=await page.evaluate(()=>scrollY),cdp=await page.context().newCDPSession(page);
 const x=box.x+Math.min(box.width/2,80),y=box.y+box.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-150*i/8,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 await page.waitForFunction(previous=>scrollY>previous+20,scroll);
 assert.deepEqual(await order(page,key),before,'A quick swipe must not reorder');
 assert.equal(await page.locator('.sector-order-row.is-dragging').count(),0,'Swipe leaves no drag session');
 return {beforeY:scroll,afterY:await page.evaluate(()=>scrollY)};
}
async function excludedTouchControl(page,locator){
 await locator.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));const box=await locator.boundingBox(),cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
 await page.waitForTimeout(500);assert.equal(await page.locator('.sector-order-row.is-dragging').count(),0,'Holding an interactive child must not drag');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await cdp.detach();
}
async function selectSix(page){for(const id of ['EDU','FIN','HEA','SOC'])await choose(page,id);for(const id of ['SEC','EMR'])await choose(page,id,true);}

try{
 browser=await pw.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 report.browserVersion=browser.version();
 if(args.has('--baseline')||args.has('--snapshot')){
  const {page,context,errors}=await mountCase({width:390,height:844});
  await recordScreenshot(page,(args.has('--snapshot')?'final':'before')+'-empty-390');await selectSix(page);
  await page.locator('#sector-order').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  await recordScreenshot(page,(args.has('--snapshot')?'final':'before')+'-selected-390');
  report.baselineState=await state(page);report.errors=errors;assert.deepEqual(errors,[]);check(args.has('--snapshot')?'Final native stage2 screenshot after unrelated scoped credit CSS correction':'Original native stage2 baseline captured');await context.close();
 }else{
  // Functional case uses a tall mobile viewport and genuine touch input.
  const {page,context,errors}=await mountCase({width:390,height:844});
  traceContext=context;await context.tracing.start({screenshots:true,snapshots:true,sources:false});
  await page.locator('[data-qa-route="test"]').click();await page.locator('#answer-options [data-answer="4"]').click();
  await page.locator('[data-qa-route="conditions"]').click();await page.locator('.condition-option[data-value="3"]').first().click();
  const original=await state(page);await page.locator('[data-qa-route="sectors"]').click();
  await selectSix(page);assert.equal(await page.locator('#sectors-next').isEnabled(),true);
  assert.deepEqual(await order(page,'prioritySectors'),['EDU','FIN','HEA','SOC']);
  assert.deepEqual(await order(page,'lowPrioritySectors'),['SEC','EMR']);
  assert.equal(await page.locator('#sector-order [data-direction]').count(),0);
  assert.equal(await page.locator('.sector-drag-handle').count(),0);
  assert.equal(await page.locator('#sectors-reset').count(),1);
  check('Four priorities and two low interests selected; one reset and no arrow buttons or separate drag handle');
  const edu=row(page,'prioritySectors','EDU'),fin=row(page,'prioritySectors','FIN');
  await edu.locator('select[data-topic-group="EDU"]').selectOption('science');
  await fin.locator('select[data-topic-group="FIN"]').selectOption('tax');
  assert.equal(await page.locator('#topic-questions select,#topic-questions [data-topic-group]').count(),0);
  assert.deepEqual((await state(page)).focusAreas,{EDU:'science',FIN:'tax'});
  check('Optional clarifications are inside their selected cards and persist');
  const swipe=await quickSwipe(page);check('Short touch swipe scrolls the native page without sorting',swipe);
  const beforeControls=await state(page);
  await excludedTouchControl(page,row(page,'prioritySectors','EDU').locator('select'));
  await excludedTouchControl(page,row(page,'prioritySectors','EDU').locator('label'));
  await excludedTouchControl(page,row(page,'prioritySectors','EDU').locator('.sector-remove'));
  assert.deepEqual((await state(page)).prioritySectors,beforeControls.prioritySectors);
  assert.deepEqual((await state(page)).focusAreas,beforeControls.focusAreas);
  check('Touch holding select, label and delete never begins sorting or changes selection');
  await drag(page,'prioritySectors','FIN','EDU','touch');
  assert.deepEqual(await order(page,'prioritySectors'),['FIN','EDU','HEA','SOC']);
  assert.deepEqual((await state(page)).prioritySectors,['FIN','EDU','HEA','SOC']);
  check('Trusted touch drag reorders priority cards and saves order');
  await drag(page,'prioritySectors','EDU','FIN','mouse');
  assert.deepEqual(await order(page,'prioritySectors'),['EDU','FIN','HEA','SOC']);
  await drag(page,'lowPrioritySectors','EMR','SEC','touch');
  assert.deepEqual(await order(page,'lowPrioritySectors'),['EMR','SEC']);
  check('Mouse reorder and touch reorder of low-interest cards');
  let handle=row(page,'prioritySectors','EDU');
  await handle.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');
  assert.deepEqual(await order(page,'prioritySectors'),['EDU','FIN','HEA','SOC']);
  handle=row(page,'prioritySectors','EDU');
  await handle.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.deepEqual(await order(page,'prioritySectors'),['FIN','EDU','HEA','SOC']);
  check('Keyboard grab/move/commit and Escape cancel');
  handle=row(page,'prioritySectors','FIN');await handle.focus();
  await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
  assert.equal(await handle.evaluate(el=>el.classList.contains('is-dragging')),true,'Held Space does not commit');await page.keyboard.press('Escape');
  await handle.focus();await page.keyboard.press('Enter');await page.keyboard.press('End');await page.keyboard.press('Tab');
  assert.deepEqual(await order(page,'prioritySectors'),['FIN','EDU','HEA','SOC'],'Tab cancels a keyboard preview');
  handle=row(page,'prioritySectors','EDU');await handle.focus();await page.keyboard.press('Enter');await page.keyboard.press('Home');await page.keyboard.press('Enter');
  assert.deepEqual(await order(page,'prioritySectors'),['EDU','FIN','HEA','SOC']);
  handle=row(page,'prioritySectors','EDU');await handle.focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.deepEqual(await order(page,'prioritySectors'),['FIN','EDU','HEA','SOC']);
  check('Whole-row Home/Enter commits and Tab cancels keyboard preview');
  const beforeCancel=await order(page,'prioritySectors');
  handle=row(page,'prioritySectors','FIN').locator('.sector-order-title');
  await handle.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  let box=await handle.boundingBox();let cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
  await page.waitForTimeout(500);assert.equal(await row(page,'prioritySectors','FIN').evaluate(el=>el.classList.contains('is-dragging')),true);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2+60,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await cdp.detach();
  assert.deepEqual(await order(page,'prioritySectors'),beforeCancel);assert.equal(await page.locator('.sector-order-row.is-dragging').count(),0);
  check('Held Space and native touch cancellation leave a consistent committed order');
  handle=row(page,'prioritySectors','SOC').locator('.sector-order-title');await handle.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  box=await handle.boundingBox();cdp=await context.newCDPSession(page);
  const edgeX=box.x+box.width/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:edgeX,y:box.y+box.height/2,id:1}]});
  await page.waitForTimeout(500);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:edgeX,y:24,id:1}]});
  await page.waitForFunction(()=>document.querySelector('#module').shadowRoot.querySelector('[data-order-list="prioritySectors"] .sector-order-row').getBoundingClientRect().top>=-5);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  assert.deepEqual(await order(page,'prioritySectors'),['SOC','FIN','EDU','HEA']);check('Edge auto-scroll permits touch drag from last to first across a tall mobile list');
  report.input=await page.evaluate(()=>window.qaInput);
  assert(report.input.some(event=>event.trusted&&event.type==='pointerdown'&&event.pointerType==='touch'),'Browser received trusted touch input');
  assert(report.input.some(event=>event.trusted&&event.type==='touchmove'),'Browser received native touch movement');
  assert(report.input.some(event=>event.trusted&&event.type==='pointerdown'&&event.pointerType==='mouse'),'Browser received trusted mouse input');
  const saved=await state(page);await page.reload();await page.locator('html[data-qa-ready="true"]').waitFor();
  assert.deepEqual(await order(page,'prioritySectors'),saved.prioritySectors);assert.deepEqual(await order(page,'lowPrioritySectors'),saved.lowPrioritySectors);
  assert.deepEqual((await state(page)).focusAreas,saved.focusAreas);check('Reload restores exact two-list order and clarifications');
  await row(page,'prioritySectors','EDU').locator('.sector-remove').click();
  let current=await state(page);assert(!current.prioritySectors.includes('EDU'));assert(!('EDU' in current.focusAreas));assert.equal(await page.locator('#sectors-next').isEnabled(),false);
  assert.equal(await page.evaluate(()=>document.querySelector('#module').shadowRoot.activeElement?.classList.contains('sector-remove')),true,'Delete moves focus to a remaining delete control');
  await row(page,'lowPrioritySectors','EMR').locator('.sector-remove').click();assert.deepEqual((await state(page)).lowPrioritySectors,['SEC']);
  check('Per-card removal works in both lists and removes orphan clarification');
  await choose(page,'FIN',true);current=await state(page);assert(!current.prioritySectors.includes('FIN'));assert(current.lowPrioritySectors.includes('FIN'));assert(!('FIN' in current.focusAreas));
  await choose(page,'SEC');current=await state(page);assert(current.prioritySectors.includes('SEC'));assert(!current.lowPrioritySectors.includes('SEC'));
  check('Move priority to low-interest and vice versa with disjoint lists and cleaned focus');
  await page.locator('#sectors-reset').click();current=await state(page);
  assert.deepEqual(current.prioritySectors,[]);assert.deepEqual(current.lowPrioritySectors,[]);assert.deepEqual(current.focusAreas,{});
  assert.deepEqual(current.answers,original.answers);assert.deepEqual(current.conditions,original.conditions);
  assert.equal(await page.locator('#sectors-next').isEnabled(),false);
  check('Single stage2 reset clears choices only, preserves stage1 answers and stage3 conditions');
  await page.reload();await page.locator('html[data-qa-ready="true"]').waitFor();current=await state(page);assert.deepEqual(current.prioritySectors,[]);assert.deepEqual(current.answers,original.answers);check('Reset persists after reload');
  const newStorageKey=await page.evaluate(()=>Object.keys(localStorage).find(key=>key.startsWith('rudn-career:')&&key.endsWith('answers-v8.1')));
  report.errors.push(...errors);assert.deepEqual(errors,[]);await context.tracing.stop({path:path.join(runDir,'functional-trace.zip')});traceContext=null;await context.close();
  {
   // Explicit legacy-storage fixture only: full questionnaire uses real current IDs,
   // while answers and result identity are synthetic. Product migration executes on mount.
   const questions=JSON.parse(await readFile(path.join(site,'apps/career/data/questions.json'),'utf8'));
   const legacy={schema:4,modelVersion:'8.0.0',questionnaireVersion:QUESTIONNAIRE_VERSION,registryVersion:REGISTRY_VERSION,answers:Object.fromEntries(questions.map((question,index)=>[question.id,index%5+1])),questionIndex:7,prioritySectors:['FIN','EDU','SOC','HEA'],lowPrioritySectors:['EMR','SEC'],focusAreas:{EDU:'science',FIN:'tax'},conditions:{FIELD:2,SCHEDULE:4,FORMAL:3,SECURITY:5},compareIds:[],lastRoute:'sectors',completedAt:'2026-10-27T10:00:00Z',resultRecordId:'qa-previous-result-123'};
   const oldStorageKey=newStorageKey.replace(/answers-v8\.1$/,'answers-v8'),oldBytes=JSON.stringify(legacy);
   const {page,context,errors}=await mountCase({width:390,height:844},'ru',{cookies:[],origins:[{origin:base,localStorage:[{name:oldStorageKey,value:oldBytes}]}]});
   const migrated=await state(page);assert.equal(migrated.modelVersion,MODEL_VERSION);assert.equal(migrated.completedAt,null);assert.equal(migrated.resultRecordId,null);
   for(const key of ['answers','prioritySectors','lowPrioritySectors','focusAreas','conditions','questionIndex'])assert.deepEqual(migrated[key],legacy[key],`Legacy ${key} retained`);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),oldStorageKey),oldBytes,'Old storage is preserved byte for byte');
   assert.deepEqual(await order(page,'prioritySectors'),legacy.prioritySectors);
   assert.deepEqual(await order(page,'lowPrioritySectors'),legacy.lowPrioritySectors);
   await page.locator('#sector-order').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await recordScreenshot(page,'legacy-migrated-390');
   await page.reload();await page.locator('html[data-qa-ready="true"]').waitFor();assert.deepEqual((await state(page)).answers,legacy.answers);assert.equal(await page.evaluate(key=>localStorage.getItem(key),oldStorageKey),oldBytes);
   assert.deepEqual(errors,[]);check('Legacy schema4 model8.0 inputs migrate to answers-v8.1, old bytes remain, completed result identity clears, reload preserves all inputs',{oldStorageKey,newStorageKey,questionnaireVersion:QUESTIONNAIRE_VERSION,registryVersion:REGISTRY_VERSION,modelVersion:MODEL_VERSION});await context.close();
  }
  if(!args.has('--functional-only'))for(const language of ['ru','en','zh-Hans'])for(const viewport of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1365,height:900}]){
   const {page,context,errors}=await mountCase(viewport,language);await selectSix(page);
   await row(page,'prioritySectors','EDU').locator('select').selectOption('science');
   const swipe=await quickSwipe(page);
   await drag(page,'prioritySectors','FIN','EDU','touch');
   assert.deepEqual(await order(page,'prioritySectors'),['FIN','EDU','HEA','SOC']);
   await drag(page,'prioritySectors','EDU','FIN','mouse');
   assert.deepEqual(await order(page,'prioritySectors'),['EDU','FIN','HEA','SOC']);
   await page.locator('#view-sectors').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
   await recordScreenshot(page,`${language}-${viewport.width}x${viewport.height}-heading`);
   await page.locator('#sector-order').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
   await recordScreenshot(page,`${language}-${viewport.width}x${viewport.height}-selected`);
   const geometry=await page.evaluate(()=>{const surface=document.querySelector('#module').shadowRoot;const border=el=>({id:el.dataset.sectorId||el.dataset.sector,topWidth:getComputedStyle(el).borderTopWidth,bottomWidth:getComputedStyle(el).borderBottomWidth,color:getComputedStyle(el).borderBottomColor,background:getComputedStyle(el).backgroundColor,priority:el.classList.contains('priority'),low:el.classList.contains('low')});return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,offscreen:[...surface.querySelectorAll('#view-sectors button,#sector-order select')].filter(el=>el.getClientRects().length).filter(el=>{const r=el.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5;}).map(el=>({text:el.textContent,rect:el.getBoundingClientRect().toJSON()})),indices:[...surface.querySelectorAll('.sector-order-title .order-index')].map(el=>({text:el.textContent,height:el.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(el).lineHeight)})),ranked:[...surface.querySelectorAll('.sector-order-row')].map(border),catalog:[...surface.querySelectorAll('.sector-card')].map(border),topics:[...surface.querySelectorAll('.sector-card-topics:not([hidden])')].map(el=>({label:el.querySelector('label').textContent,labelRect:el.querySelector('label').getBoundingClientRect().toJSON(),selectRect:el.querySelector('select').getBoundingClientRect().toJSON()})),buttons:[...surface.querySelectorAll('.sector-card .priority-toggle,.sector-card .low-toggle')].map(el=>el.textContent.trim()),text:surface.querySelector('#view-sectors').innerText};});
   assert(geometry.documentWidth<=viewport.width+1,'No document horizontal overflow');assert.deepEqual(geometry.offscreen,[],'No horizontally clipped controls');
   assert(geometry.indices.every(item=>item.height<=item.lineHeight+1),'Rank numeral and punctuation remain on one line');
   if(language!=='ru')assert(!/[А-Яа-яЁё]/.test(geometry.text),'Stage2 content completely localized');
   assert(!/v8|верси[яи]\s*8|version\s*8|版本\s*8/i.test(geometry.text),'Stage2 does not expose old version labels');
   assert.equal(await page.locator('.sector-drag-handle').count(),0);
   assert(geometry.ranked.every(item=>parseFloat(item.topWidth)===0&&parseFloat(item.bottomWidth)<=1),'Ranked rows retain light dividers only');
   assert.equal(new Set(geometry.ranked.map(item=>item.color)).size,1,'Ranked row dividers use one neutral color');
   assert.equal(new Set(geometry.ranked.map(item=>item.background)).size,1,'Ranked backgrounds remain neutral');
   const positive=geometry.catalog.filter(item=>item.priority),negative=geometry.catalog.filter(item=>item.low),neutral=geometry.catalog.filter(item=>!item.priority&&!item.low);
   assert.equal(positive.length,4);assert.equal(negative.length,2);
   assert([...positive,...negative].every(item=>parseFloat(item.topWidth)>=3),'Selected catalog cards have expressive borders');
   assert.notEqual(positive[0].color,negative[0].color,'Catalog likes and dislikes have distinct border colors');
   assert(neutral.every(item=>item.color!==positive[0].color&&item.color!==negative[0].color),'Unselected catalog cards are not colored as choices');
   for(const topic of geometry.topics){assert(topic.labelRect.right<=topic.selectRect.left+1,'Refinement label and select are inline');assert(Math.abs(topic.labelRect.y+topic.labelRect.height/2-topic.selectRect.y-topic.selectRect.height/2)<2,'Refinement controls share one row');}
   const labels={ru:['Нравится','Не нравится'],en:['Like','Dislike'],'zh-Hans':['喜欢','不喜欢']}[language];
   assert(geometry.buttons.every((label,index)=>label===labels[index%2]),'Like/dislike are short and localized');
   await page.locator('.sector-card[data-sector="EDU"]').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
   await recordScreenshot(page,`${language}-${viewport.width}x${viewport.height}-catalog`);
   await page.locator('.sector-card[data-sector="SEC"]').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
   await recordScreenshot(page,`${language}-${viewport.width}x${viewport.height}-catalog-negative`);
   await page.locator('#sectors-next').scrollIntoViewIfNeeded();await page.locator('#sectors-next').click();await page.locator('#view-conditions:not([hidden])').waitFor();
   assert.deepEqual(errors,[]);check(`Responsive ${language} ${viewport.width}x${viewport.height}`,{geometry:{documentWidth:geometry.documentWidth,ranked:geometry.ranked,catalog:geometry.catalog,topics:geometry.topics},nativeSwipe:swipe,touchLongPressReorder:true,mouseWholeRowReorder:true,consoleErrors:errors.length});await context.close();
  }
 }
 report.finalHashes={};for(const relative of Object.keys(report.hashes)){report.finalHashes[relative]=createHash('sha256').update(await readFile(path.join(site,relative))).digest('hex');}
 assert.deepEqual(report.finalHashes,report.hashes,'All recorded source bytes remained stable during the run');
 report.testSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');report.status='pass';
}catch(error){report.status='fail';report.errors.push(error.stack||String(error));console.error(error);process.exitCode=1;
 try{if(lastPage&&!lastPage.isClosed()){await recordScreenshot(lastPage,'failure');report.failureState=await state(lastPage);report.input=await lastPage.evaluate(()=>window.qaInput);}}catch{}
 try{if(traceContext)await traceContext.tracing.stop({path:path.join(runDir,'functional-trace.zip')});}catch{}
}
finally{report.finishedAt=new Date().toISOString();await saveReport();await browser?.close();await new Promise(resolve=>server.close(resolve));console.log(`Report: ${path.join(runDir,'report.json')}`);}
