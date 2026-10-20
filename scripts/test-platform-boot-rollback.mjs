// Synthetic local UI, real immutable releases, bootstrap/coordinator and IndexedDB.
// Browser plugin/skill is unavailable; bundled Playwright is the approved fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildRelease} from './build-platform-release.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.env.QA_OUT||path.join(repo,'../evidence/runs/20261018-platform-observability/release/boot-rollback'));
const source=path.join(out,'source'),baseline=path.join(out,'baseline'),sourceRef=process.env.SOURCE_REF||null;
const files=['service-worker.js','assets/js/release-bootstrap.js','assets/js/release-resources.js','assets/js/release-recovery.js','assets/js/diagnostics-bootstrap.js','assets/js/platform-update-state.js','assets/js/platform-update-coordinator.js','assets/js/platform-update-contracts.js','assets/js/platform-update-failures.js','data/platform-contracts.json'];
const sourceHashes={};
async function sourceBytes(name){
  if(!sourceRef)return fs.readFile(path.join(repo,'site',name));
  const r=spawnSync('git',['-c','safe.directory='+repo.replaceAll('\\','/'),'show',sourceRef+':site/'+name],{cwd:repo,encoding:null});
  if(r.status!==0)throw Error('Missing source: '+name);return r.stdout;
}
async function put(root,name,bytes){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}
for(const name of files){let bytes;try{bytes=await sourceBytes(name);}catch(error){if(name.endsWith('platform-update-failures.js')&&sourceRef)continue;throw error;}
  sourceHashes[name]=crypto.createHash('sha256').update(bytes).digest('hex');for(const root of [source,baseline])await put(root,name,bytes);
}
const html='<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rollback recovery QA</title></head><body><main id="app"></main><script type="module" src="assets/js/main.js"></script></body></html>';
for(const root of [source,baseline])await put(root,'index.html',html);
const main=`import {bootstrapUpdateCoordinator} from './platform-update-coordinator.js';
import {createUpdateAdapter,updateSnapshotStore,captureUpdateView,restoreUpdateView} from './platform-update-state.js';
import {getReleaseContext} from './release-bootstrap.js';
if(localStorage.getItem('qa-hang-rollback')==='yes'&&JSON.parse(sessionStorage.getItem('rudn.update.pending.v1')||'null')?.phase==='rollback')await new Promise(()=>{});
const root=document.getElementById('app');root.innerHTML='<h1>Вопрос 4</h1><label>Ответ<textarea id="answer" rows="5"></textarea></label>';
const input=root.querySelector('textarea'),store=updateSnapshotStore();
const attempt=localStorage.getItem('qa-attempt')||crypto.randomUUID();localStorage.setItem('qa-attempt',attempt);
let revision=0;input.addEventListener('input',()=>revision++);
window.qa={build:getReleaseContext().buildId,attempt,question:4,ready:false};
const adapter=createUpdateAdapter({module:'form',root,getIdentity:()=>({owner:'synthetic-local-owner',attemptId:attempt}),getRevision:()=>revision,
 checkpoint:async()=>{const receipt=await store.put({token:'qa-draft',attempt,question:4,value:input.value});return {...receipt,revision,checkpointRef:{token:'qa-draft'}}},
 capture:()=>({value:input.value,question:4,view:captureUpdateView(root)}),
 restore:async({state,identity})=>{if(identity.attemptId!==attempt)return {status:'blocked',code:'wrong-attempt'};input.value=state.value;qa.question=state.question;await restoreUpdateView(root,state.view);return {status:'restored'}}});
window.coordinator=bootstrapUpdateCoordinator({getAdapters:()=>[adapter],getOwner:()=> 'synthetic-local-owner',module:'form',autoStart:false});
qa.restored=await coordinator.restorePending();qa.ready=true;
window.readDraft=()=>store.get('qa-draft');`;
for(const root of [source,baseline])await put(root,'assets/js/main.js',main);
const a=await buildRelease({site:source,baseline,out:path.join(out,'a')});
await put(source,'assets/js/main.js',"throw new Error('synthetic-entry-import-failure');");
const broken=await buildRelease({site:source,baseline:a.out,out:path.join(out,'broken')});
await put(source,'assets/js/main.js','await new Promise(()=>{});');
const hung=await buildRelease({site:source,baseline:a.out,out:path.join(out,'hung')});
await put(source,'assets/js/main.js',main+'\n// Healthy subsequent release.\n');
const healthy=await buildRelease({site:source,baseline:broken.out,out:path.join(out,'healthy')});
let live=a.out,previousFailure='';
const requests=[];
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');const name=decodeURIComponent(url.pathname).replace(/^\/RUDN\//,'')||'index.html';
 if(name.includes('..'))throw Error('path');if(previousFailure&&name.startsWith('_releases/'+a.buildId+'/')){if(previousFailure==='hang'){const entry={path:url.pathname,status:'pending',cancelled:false};requests.push(entry);res.on('close',()=>{entry.cancelled=true;});return;}requests.push({path:url.pathname,status:503});res.writeHead(503);res.end();return;}
 const bytes=await fs.readFile(path.join(live,name));res.writeHead(200,{'content-type':/\.m?js$/.test(name)?'text/javascript':name.endsWith('.html')?'text/html;charset=utf-8':'application/json','cache-control':'no-store'});res.end(bytes);requests.push({path:url.pathname,status:200});
 }catch{res.writeHead(404);res.end();}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const pw=await import(pathToFileURL(process.env.PLAYWRIGHT_PATH||process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/arsen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const report={classification:'synthetic form; real immutable bootstrap/coordinator/adapter/IndexedDB; no Firebase',browserPlugin:'not available',sourceRef,sourceHashes,status:'fail',results:[]};
let browser,lastPage;
try{for(const engine of (process.env.RELEASE_BROWSERS||'chromium,firefox,webkit').split(',')){
 browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 for(const scenario of (process.env.BOOT_SCENARIOS||'import-failure,session-lost,watchdog,previous-unavailable,watchdog-previous-unavailable,previous-fetch-hung,rollback-entry-hung').split(',')){
  live=a.out;previousFailure='';const requestStart=requests.length,context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage();lastPage=page;
  page.setDefaultTimeout(10000);const moves=[],errors=[];page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())moves.push(r.url());});page.on('pageerror',error=>errors.push(error.message));
  const bad=scenario.startsWith('watchdog')?hung:broken,unavailable=scenario.endsWith('previous-unavailable'),blockedScenario=unavailable||['previous-fetch-hung','rollback-entry-hung'].includes(scenario);
  await context.addInitScript(({badBuild,scenario})=>{if(location.pathname.includes(badBuild)&&scenario==='session-lost')sessionStorage.clear();if(scenario.startsWith('watchdog')||['previous-fetch-hung','rollback-entry-hung'].includes(scenario)){const original=window.setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===45000?2000:ms===5000&&scenario==='previous-fetch-hung'&&location.pathname.includes(badBuild)?500:ms,...args);}}, {badBuild:bad.buildId,scenario});
  await page.goto(origin+a.target.entryURL+'?language=ru#activity/quiz');await page.waitForFunction(()=>window.qa?.ready);
  await page.locator('textarea').pressSequentially('Незавершённый ответ Z');assert.equal(await page.locator('textarea').evaluate(el=>el===document.activeElement),true);
  const before=await page.evaluate(()=>({attempt:qa.attempt,question:qa.question,hash:location.hash}));
  if(scenario==='rollback-entry-hung')await page.evaluate(()=>localStorage.setItem('qa-hang-rollback','yes'));
  live=bad.out;page.on('request',request=>{if(request.isNavigationRequest()&&request.url().includes(bad.buildId))previousFailure=unavailable?'unavailable':scenario==='previous-fetch-hung'?'hang':'';});
  await page.evaluate(()=>{void coordinator.check('test')});
  if(blockedScenario){
   const blockedBuild=scenario==='rollback-entry-hung'?a:bad;
   await page.waitForFunction(build=>{const marker=JSON.parse(localStorage.getItem('rudn.update.pending.v1:'+new URL(location.href).searchParams.get('rudnResume'))||'null');return location.pathname.includes(build)&&marker?.phase==='blocked'&&marker.targetBuild===build;},blockedBuild.buildId);
   if(scenario==='previous-fetch-hung'){for(let i=0;i<40&&!requests.slice(requestStart).some(r=>r.status==='pending'&&r.cancelled);i++)await new Promise(resolve=>setTimeout(resolve,50));assert.ok(requests.slice(requestStart).some(r=>r.status==='pending'&&r.cancelled),'Previous-release fetch must be aborted by the bounded fallback');}
   const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('rudn.update.pending.v1')));assert.equal(saved.failedBuild,bad.buildId);assert.equal(saved.targetBuild,blockedBuild.buildId);assert.equal(saved.rollbackAttempted,true);
   await page.getByRole('status').filter({hasText:'Сохранённая работа остаётся на устройстве'}).waitFor();
   const start=moves.length;await page.reload();await page.getByRole('status').filter({hasText:'Сохранённая работа остаётся на устройстве'}).waitFor();await page.waitForTimeout(400);assert.equal(moves.length,start+1);assert.equal(new URL(page.url()).pathname,new URL(origin+blockedBuild.target.entryURL).pathname);
   const after=await page.evaluate(async()=>{const u=location.pathname.replace(/index.html$/,'assets/js/platform-update-state.js');return (await import(u)).updateSnapshotStore().get('qa-draft')});assert.equal(after.value,'Незавершённый ответ Z');assert.equal(after.attempt,before.attempt);
  }else{
   await page.waitForFunction(build=>window.qa?.ready&&qa.build===build&&qa.restored.status==='restored',a.buildId,{timeout:8000});
   const after=await page.evaluate(async()=>({attempt:qa.attempt,question:qa.question,hash:location.hash,focus:document.activeElement?.id,pending:sessionStorage.getItem('rudn.update.pending.v1'),resume:new URL(location.href).searchParams.get('rudnResume'),draft:await readDraft()}));
   assert.equal(after.attempt,before.attempt);assert.equal(after.question,before.question);assert.equal(after.hash,before.hash);assert.equal(after.focus,'answer');assert.equal(after.pending,null);assert.equal(after.resume,null);assert.equal(after.draft.value,'Незавершённый ответ Z');assert.equal(await page.locator('textarea').inputValue(),'Незавершённый ответ Z');
   assert.equal(moves.filter(url=>url.includes(bad.buildId)).length,1);assert.equal(moves.length,3);
   const repeated=await page.evaluate(async()=>[await coordinator.check('interval'),await coordinator.check('pageshow')]);assert.ok(repeated.every(result=>result.status==='defer'));await page.waitForTimeout(300);assert.equal(moves.length,3,'The same failed build must not trigger another navigation');
   if(scenario==='import-failure'){live=healthy.out;await page.evaluate(()=>{void coordinator.check('test-next-build')});await page.waitForFunction(build=>window.qa?.ready&&qa.build===build&&qa.restored.status==='restored',healthy.buildId);assert.equal(await page.locator('textarea').inputValue(),'Незавершённый ответ Z');assert.equal(await page.evaluate(()=>qa.attempt),before.attempt);}
  }
  await page.screenshot({path:path.join(out,engine+'-'+scenario+'.png')});assert.deepEqual(errors,[]);report.results.push({engine,scenario,status:'pass',navigations:moves.length,sameAttempt:true,latestUnblurredInput:true,noRepeatFailedBuild:true});console.log(JSON.stringify(report.results.at(-1)));await context.close();
 }
 await browser.close();browser=null;
}for(const [name,expected] of Object.entries(sourceHashes))assert.equal(crypto.createHash('sha256').update(await sourceBytes(name)).digest('hex'),expected,'Source changed during verification: '+name);report.sourceStable=true;report.status='pass';
}catch(error){report.failure={message:error.message,stack:error.stack};process.exitCode=1;if(lastPage&&!lastPage.isClosed()){report.state=await lastPage.evaluate(()=>({href:location.href,qa:window.qa,pending:sessionStorage.getItem('rudn.update.pending.v1')})).catch(()=>null);await lastPage.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}}
finally{await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,results:report.results,failure:report.failure,state:report.state,out}));}
