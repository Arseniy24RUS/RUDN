// Actual native assessment UI and persistence, isolated cloud transport fixture.
// Browser plugin not available. Fault injection never writes production grades.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const site=fileURLToPath(new URL('../site/',import.meta.url)),out=process.env.QA_OUT||'artifacts/settlements-network';
await mkdir(out,{recursive:true});
const base='https://arseniy24rus.github.io/RUDN/',gateway='https://europe-west1-rudn-gmu-learning-platform.cloudfunctions.net/networkGateway/settlements/runtime/';
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Settlements assessment network QA</title><style>body{margin:0}#settlementsMount[data-presentation=game]{position:fixed;inset:0}</style><main id="settlementsMount"></main><script type="module">
import {mountSettlements} from './apps/settlements/entry.mjs';
import {createSettlementsPresentation} from './assets/js/settlements-presentation.js';
import {durableStore as store} from './assets/js/durable-store.js';
import {createCheckpointSync} from './assets/js/checkpoint-sync.js';
const identity={owner:'student:network-fixture',studentKey:'network-fixture',uid:'network-fixture',generation:1};
const root=()=>JSON.parse(localStorage.getItem('qa.cloud')||'{}');
const transport={get:async name=>{window.qaServerReads++;return {value:name.split('/').reduce((v,k)=>v?.[k],root())??null}},transaction:async(name,update)=>{const data=root(),parts=name.split('/');let node=data;for(const part of parts.slice(0,-1))node=node[part]??={};const key=parts.at(-1),value=update(structuredClone(node[key]??null));if(value!==undefined)node[key]=value;localStorage.setItem('qa.cloud',JSON.stringify(data));return {value:structuredClone(node[key])}}};
window.qaServerReads=0;
const sync=createCheckpointSync({store,transport,getIdentity:()=>identity,commitAttempt:()=>{throw Error('Network QA must not submit a grade')}});
const backend={generation:1,user:{uid:identity.uid},getProfile:()=>({studentKey:identity.studentKey}),isAdmin:()=>false,restTransport:()=>transport,durableSync:()=>sync};
const mount=document.querySelector('#settlementsMount'),presentation=createSettlementsPresentation(mount);
window.host=await mountSettlements(mount,{backend,owner:identity.owner,mode:'assessment',onViewChange:view=>presentation.setView(view)});
window.qaSnapshot=()=>store.loadDraft({owner:identity.owner,activitySlug:'seminar-3',mode:'settlements-assessment'});
</script>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.geojson':'application/json','.svg':'image/svg+xml','.webp':'image/webp'};
const browser=await chromium.launch({headless:true,args:['--no-proxy-server']});
const report={kind:'native UI/persistence with isolated cloud and network faults; no production student writes',cases:[]};
try{for(const width of [1440,390])for(const fault of ['healthy-false-offline','blocked-geography','blocked-game-module']){
 if(process.env.SETTLEMENTS_LIVE_RESERVE&&(width!==390||fault==='healthy-false-offline'))continue;
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},serviceWorkers:'block'}),page=await context.newPage();
 const row={width,fault,blocked:0,reserve:0,pageErrors:[]};report.cases.push(row);
 page.on('pageerror',error=>row.pageErrors.push(error.message));
 if(process.env.SETTLEMENTS_LIVE_RESERVE)page.on('request',request=>{if(request.url().startsWith(gateway))row.reserve++;});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});crypto.getRandomValues=array=>{array.fill(0);return array};});
 await context.route(base+'**',async route=>{
  const url=new URL(route.request().url()),relative=url.pathname.slice('/RUDN/'.length);
  if(!relative||relative==='network-qa.html'){await route.fulfill({contentType:'text/html',body:html});return;}
  if(fault==='blocked-geography'&&/\/runtime\/(?:data\/|assets\/geodata\/|assets\/js\/settlements\/v24\/(?:social-plans-regions|transport-policy-v2-regions)\/(?!index\.mjs))/.test(url.pathname)||fault==='blocked-game-module'&&url.pathname.endsWith('/v24/game.mjs')){row.blocked++;await route.abort('failed');return;}
  try{await route.fulfill({contentType:mime[path.extname(relative)]||'application/octet-stream',body:await readFile(path.join(site,relative))});}catch{await route.fulfill({status:404,body:'missing fixture'});}
 });
 if(!process.env.SETTLEMENTS_LIVE_RESERVE)await context.route(gateway+'**',async route=>{
  row.reserve++;const relative=new URL(route.request().url()).pathname.split('/settlements/runtime/')[1];
  try{await route.fulfill({headers:{'Access-Control-Allow-Origin':new URL(base).origin},contentType:mime[path.extname(relative)]||'application/octet-stream',body:await readFile(path.join(site,'apps/settlements/runtime',relative))});}catch{await route.fulfill({status:404,body:'missing reserve fixture'});}
 });
 try{
  await page.goto(base+'network-qa.html');assert.equal(await page.title(),'Settlements assessment network QA');
  await page.locator('[data-action="training-continue"]').click({timeout:45000});
  const act=async name=>page.locator(`[data-act="${name}"]`).click();
  const choose=async tool=>{if(!await page.locator(`[data-tool="${tool}"]`).count())await act('tools');await page.locator(`[data-tool="${tool}"]`).click();};
  const find=async name=>{await act('search');await page.locator('#settlement-search').fill(name);await page.locator('[data-search-result]').filter({has:page.getByText(name,{exact:true})}).first().click();};
  await act('guide-position');await act('confirm');
  await choose('medical');await find('Большая Казакбаева');await act('confirm');
  await choose('connect');await find('Большая Казакбаева');await find('Мансурова');await act('confirm');
  await choose('tower');await act('focus');await page.locator('.puzzle-map').focus();await page.keyboard.press('Enter');await act('confirm');
  await choose('connect');await find('Султанаева');await find('Большая Казакбаева');await act('confirm');
  await choose('culture');await find('Большая Тюлякова');await act('confirm');
  await page.locator('[data-action="training-continue"]').click();
  await page.locator('[data-select="difficulty"]').selectOption('easy');await page.locator('[data-action="start"]').click();
  await page.locator('.puzzle-map canvas').first().waitFor({timeout:45000});await page.locator('.puzzle-loading').waitFor({state:'hidden'});
  row.assessmentOpened=true;row.onlineHint=await page.evaluate(()=>navigator.onLine);row.serverReads=await page.evaluate(()=>window.qaServerReads);assert.equal(row.onlineHint,false);assert.ok(row.serverReads>0);
  await act('zoom-in');await page.screenshot({path:path.join(out,`${width}-${fault}.png`)});
  const first=await page.evaluate(()=>window.qaSnapshot());assert.ok(first.state.engineSave);row.region=first.state.regionId;
  await page.reload();await page.locator('[data-action="resume"]').click({timeout:45000});await page.locator('.puzzle-map canvas').first().waitFor({timeout:45000});
  const restored=await page.evaluate(()=>window.qaSnapshot());assert.equal(restored.attemptId,first.attemptId);assert.equal(restored.state.regionId,first.state.regionId);row.restored=true;
  assert.equal(row.pageErrors.length,0);if(fault!=='healthy-false-offline'){assert.ok(row.blocked>0);assert.ok(row.reserve>0);}else assert.equal(row.reserve,0);
  console.log('PASS',JSON.stringify(row));
 }catch(error){row.failure=error.stack;await page.screenshot({path:path.join(out,`${width}-${fault}-error.png`)});throw error;}
 finally{await context.close();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
}}
finally{await browser.close();}
