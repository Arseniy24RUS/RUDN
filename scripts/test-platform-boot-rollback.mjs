// Synthetic mobile form: failed current releases must not launch retired code.
// The historical filename remains for existing CI callers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse} from 'acorn';
import {buildRelease} from './build-platform-release.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.env.QA_OUT||path.join(repo,'.qa/current-release-boot'));
const source=path.join(out,'source'),baseline=path.join(out,'baseline'),sourceRef=process.env.SOURCE_REF||null;
const sourceHashes={};
async function sourceBytes(name){
  if(!sourceRef)return fs.readFile(path.join(repo,'site',name));
  const r=spawnSync('git',['-c','safe.directory='+repo.replaceAll('\\','/'),'show',sourceRef+':site/'+name],{cwd:repo,encoding:null});
  if(r.status!==0)throw Error('Missing source: '+name);return r.stdout;
}
async function put(root,name,bytes){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}
const pendingFiles=['service-worker.js','assets/js/release-bootstrap.js','assets/js/release-resources.js','assets/js/release-recovery.js','assets/js/diagnostics-bootstrap.js','assets/js/platform-update-state.js','assets/js/platform-update-coordinator.js','assets/js/platform-update-contracts.js','assets/js/platform-update-failures.js','data/platform-contracts.json'];
while(pendingFiles.length){
  const name=pendingFiles.shift();if(sourceHashes[name])continue;const bytes=await sourceBytes(name);sourceHashes[name]=crypto.createHash('sha256').update(bytes).digest('hex');
  for(const root of [source,baseline])await put(root,name,bytes);
  if(/\.m?js$/.test(name)){const ast=parse(bytes.toString(),{ecmaVersion:'latest',sourceType:'module'});for(const node of ast.body)if(/^(?:ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration)$/.test(node.type)&&node.source?.value?.startsWith('.'))pendingFiles.push(path.posix.normalize(path.posix.join(path.posix.dirname(name),node.source.value.split(/[?#]/)[0])));}
}
const html='<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Current release recovery QA</title></head><body><main id="app"></main><script type="module" src="assets/js/main.js"></script></body></html>';
for(const root of [source,baseline])await put(root,'index.html',html);
const main=`import {bootstrapUpdateCoordinator} from './platform-update-coordinator.js';
import {createUpdateAdapter,updateSnapshotStore} from './platform-update-state.js';
import {getReleaseContext} from './release-bootstrap.js';
const root=document.getElementById('app');root.innerHTML='<h1>Вопрос 4</h1><label>Ответ<textarea id="answer" rows="5"></textarea></label>';
const input=root.querySelector('textarea'),store=updateSnapshotStore(),attempt=crypto.randomUUID();
let revision=0;input.addEventListener('input',()=>revision++);
window.qa={build:getReleaseContext().buildId,attempt,question:4,ready:false};
const adapter=createUpdateAdapter({module:'form',root,getIdentity:()=>({owner:'synthetic-local-owner',attemptId:attempt}),getRevision:()=>revision,
 checkpoint:async()=>{const receipt=await store.put({token:'qa-draft',attempt,question:4,value:input.value});return {...receipt,revision,checkpointRef:{token:'qa-draft'}}},
 capture:()=>({value:input.value,question:4}),restore:async()=>({status:'blocked',code:'retired-synthetic-attempt'})});
window.coordinator=bootstrapUpdateCoordinator({getAdapters:()=>[adapter],getOwner:()=> 'synthetic-local-owner',module:'form',autoStart:false});
qa.restored=await coordinator.restorePending();qa.ready=true;`;
for(const root of [source,baseline])await put(root,'assets/js/main.js',main);
const a=await buildRelease({site:source,baseline,out:path.join(out,'a')});
await put(source,'assets/js/main.js',"throw new Error('synthetic-entry-import-failure');");const broken=await buildRelease({site:source,baseline:a.out,out:path.join(out,'broken')});
await put(source,'assets/js/main.js','await new Promise(()=>{});');const hung=await buildRelease({site:source,baseline:a.out,out:path.join(out,'hung')});
await put(source,'assets/js/main.js',main+'\n// Healthy current release.\n');const healthy=await buildRelease({site:source,baseline:broken.out,out:path.join(out,'healthy')});
for(const item of [broken,hung,healthy]){assert.equal(item.previous,null);await assert.rejects(fs.access(path.join(item.out,`_releases/${a.buildId}`)),{code:'ENOENT'});}
let live=a.out;const requests=[];
const server=http.createServer(async(req,res)=>{let name;try{
  const url=new URL(req.url,'http://local');name=decodeURIComponent(url.pathname).replace(/^\/RUDN\//,'')||'index.html';if(name.includes('..'))throw Error('path');
  const bytes=await fs.readFile(path.join(live,name));res.writeHead(200,{'content-type':/\.m?js$/.test(name)?'text/javascript':name.endsWith('.html')?'text/html;charset=utf-8':'application/json','cache-control':'no-store'});res.end(bytes);requests.push({path:url.pathname,status:200});
}catch{requests.push({path:req.url,status:404});const documentRequest=req.headers['sec-fetch-dest']==='document'||name?.endsWith('.html');res.writeHead(404,{'content-type':documentRequest?'text/html':'text/plain'});res.end(documentRequest?await fs.readFile(path.join(live,'404.html')):'missing');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const pw=await import(pathToFileURL(process.env.PLAYWRIGHT_PATH||process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/arsen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const report={classification:'synthetic mobile form; real immutable bootstrap/coordinator/IndexedDB; no Firebase',retention:'current-only',sourceRef,sourceHashes,status:'fail',results:[]};
const completed={attempt:'finished-before-update',score:100,completedAt:'2026-11-12T12:00:00Z'};
async function completedDatabase(value){return new Promise((resolve,reject)=>{const open=indexedDB.open('fixture-completed-results',1);open.onupgradeneeded=()=>open.result.createObjectStore('results');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('results',value?'readwrite':'readonly'),request=value?tx.objectStore('results').put(value,'completed'):tx.objectStore('results').get('completed');let result;request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)};};});}
let browser,lastPage;
try{for(const engine of (process.env.RELEASE_BROWSERS||'chromium,firefox,webkit').split(',')){
  browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  for(const scenario of (process.env.BOOT_SCENARIOS||'import-failure,session-lost,watchdog').split(',')){
    assert.ok(['import-failure','session-lost','watchdog'].includes(scenario),'Unknown current-only boot scenario');
    live=a.out;const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage();lastPage=page;page.setDefaultTimeout(10000);
    const bad=scenario==='watchdog'?hung:broken,moves=[];page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())moves.push(r.url());});
    await context.addInitScript(({badBuild,scenario})=>{if(location.pathname.includes(badBuild)&&scenario==='session-lost')sessionStorage.clear();const original=setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===45000?1500:ms,...args);},{badBuild:bad.buildId,scenario});
    await page.goto(origin+a.target.entryURL+'?language=ru#activity/quiz');await page.waitForFunction(()=>window.qa?.ready);
    await page.locator('textarea').fill('Незавершённый ответ Z');const oldAttempt=await page.evaluate(()=>qa.attempt);
    await page.evaluate(value=>localStorage.setItem('fixture-completed-result',JSON.stringify(value)),completed);await page.evaluate(completedDatabase,completed);
    live=bad.out;const retiredRequestStart=requests.length;await page.evaluate(()=>{void coordinator.check('test')});
    await page.getByRole('status').filter({hasText:'Не удалось загрузить приложение'}).waitFor();assert.equal(new URL(page.url()).pathname,new URL(origin+bad.target.entryURL).pathname);
    const count=moves.length;await page.waitForTimeout(300);assert.equal(moves.length,count);assert.equal(moves.filter(url=>url.includes(bad.buildId)).length,1);
    assert.ok(!requests.slice(retiredRequestStart).some(r=>r.path.includes('/_releases/'+a.buildId+'/')),'Failure must not request a retired runtime');
    await page.reload();await page.getByRole('status').filter({hasText:'Не удалось загрузить приложение'}).waitFor();await page.waitForTimeout(300);assert.equal(moves.length,count+1,'Manual retry must not cause a navigation loop');
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-completed-result'))),completed);assert.deepEqual(await page.evaluate(completedDatabase),completed);
    live=healthy.out;await page.goto(origin+'/RUDN/?language=ru#activity/quiz');await page.waitForFunction(id=>window.qa?.ready&&qa.build===id,healthy.buildId);
    assert.notEqual(await page.evaluate(()=>qa.attempt),oldAttempt);assert.equal(await page.locator('textarea').inputValue(),'');assert.deepEqual(await page.evaluate(completedDatabase),completed);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-completed-result'))),completed);
    await page.screenshot({path:path.join(out,engine+'-'+scenario+'.png')});report.results.push({engine,scenario,status:'pass',retiredRuntimeRequests:0,completedLocalAndIndexedDBPreserved:true,newAttemptUsesCurrent:true,noNavigationLoop:true});console.log(JSON.stringify(report.results.at(-1)));await context.close();
  }
  await browser.close();browser=null;
}for(const [name,expected]of Object.entries(sourceHashes))assert.equal(crypto.createHash('sha256').update(await sourceBytes(name)).digest('hex'),expected,'Source changed during verification: '+name);report.sourceStable=true;report.status='pass';
}catch(error){report.failure={message:error.message,stack:error.stack};process.exitCode=1;if(lastPage&&!lastPage.isClosed()){report.state=await lastPage.evaluate(()=>({href:location.href,qa:window.qa,pending:sessionStorage.getItem('rudn.update.pending.v1')})).catch(()=>null);await lastPage.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}}
finally{await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,results:report.results,failure:report.failure,state:report.state,out}));}
