/** A pre-personality course update must restore its existing checkpoint while
 * displaying the new first stage. Real career runtime, coordinator and local
 * stores; only the backend and release transport use isolated synthetic data. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {MODEL_VERSION,QUESTIONNAIRE_VERSION,REGISTRY_VERSION} from '../site/apps/career/assets/versions.mjs';

const require=createRequire(import.meta.url),args=process.argv.slice(2);
const argument=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),site=path.join(root,'site');
const engine=argument('--browser','chromium');
assert.ok(['chromium','firefox','webkit'].includes(engine),'Supported browser engine');
const output=path.resolve(argument('--output',path.join(root,'../career-migration-qa',engine)));
assert.ok(output!==root&&!output.startsWith(root+path.sep),'Keep browser evidence outside the repository');
const questions=JSON.parse(await readFile(path.join(site,'apps/career/data/questions.json'),'utf8'));
const owner='student:career-migration-qa';
const prior={schema:4,modelVersion:MODEL_VERSION,questionnaireVersion:QUESTIONNAIRE_VERSION,registryVersion:REGISTRY_VERSION,
  answers:{[questions[0].id]:2,[questions[1].id]:5},questionIndex:2,prioritySectors:['EDU','SOC'],lowPrioritySectors:[],
  conditions:{FIELD:3},focusAreas:{},compareIds:[],lastRoute:'test',completedAt:null,resultRecordId:null,updatedAt:'2026-11-01T12:00:00.000Z'};

const backendSource=`import {durableStore} from '/assets/js/durable-store.js';
export const groupOptions=()=>[];
export const backend={generation:1,authReady:true,user:null,mode:'local',connected:false,serverTimeOffset:0,
getProfile:()=>({studentKey:'career-migration-qa'}),isAdmin:()=>false,init:async()=>{},onStatus:()=>()=>{},status:()=>({}),
globalNow:()=>Date.now(),getAccessOverrides:()=>({}),localGrades:()=>({}),localAttempts:()=>[],getAttempts:async()=>[],
loadDraft:scope=>durableStore.loadDraft(scope),checkpoint:(input,options)=>durableStore.checkpoint(input,{...options,queue:false}),
saveAttempt:async()=>{window.qa.submissions++;throw Error('Migration QA forbids submissions');}};`;

const harness=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Career update migration · isolated QA</title>
<style>body{margin:0;font:16px system-ui}#module{max-width:1100px;margin:auto;padding:16px}#qa-error{white-space:pre-wrap;color:#900}</style></head><body><pre id="qa-error" hidden></pre><main id="module"></main>
<script type="module">
import {mountCareer} from '/apps/career/entry.mjs';
import {durableStore} from '/assets/js/durable-store.js';
import {updateSnapshotStore} from '/assets/js/platform-update-state.js';
import {bootstrapUpdateCoordinator,UPDATE_PENDING_KEY} from '/assets/js/platform-update-coordinator.js';
import {captureCheckpointContracts} from '/assets/js/platform-update-contracts.js';
const owner=${JSON.stringify(owner)},prior=${JSON.stringify(prior)},scope={owner,activitySlug:'career-workspace',mode:'diagnostic',attemptId:'workspace-v1'};
const oldRoute=new URLSearchParams(location.search).get('route')||'test';
const outerRoute='#activity/seminar-6/'+oldRoute,sourceBuild='11111111111111111111111111111111',targetBuild='22222222222222222222222222222222';
const store=updateSnapshotStore(),token=crypto.randomUUID(),adapterToken=crypto.randomUUID();
window.qa={submissions:0,routeChanges:[],rollbackCalls:0,restoredSignals:0,bootConfirmed:0,outerRoute,oldRoute,token,adapterToken};
window.addEventListener('rudn:update-restored',()=>qa.restoredSignals++);
try{
  const contracts=await fetch('/data/platform-contracts.json').then(response=>response.json());
  const draft=await durableStore.checkpoint({...scope,contentVersion:'career-workspace-v1',state:{values:{'answers-v8.1':JSON.stringify(prior)},route:oldRoute}},{queue:false});
  const checkpointRef={attemptId:'workspace-v1',revision:draft.revision};
  await store.put({schema:1,token:adapterToken,module:'career',identity:{owner,attemptId:'workspace-v1'},revision:draft.revision,checkpointRef,targetBuild,createdAt:Date.now(),state:{
    context:'course',route:oldRoute,view:{schema:1,window:{x:0,y:0},scroll:[],details:[],focus:null},
    runtime:{schema:1,model:${JSON.stringify(MODEL_VERSION)},fields:[],route:oldRoute,questionIndex:2,filters:{},authority:null,authorityTab:'overview',seminarAuthority:null,groupMode:'uploaded',groupRecords:[],groupRejected:0}}});
  const adapters=[{module:'career',resumeToken:adapterToken,checkpointRef}],checkpointContracts=captureCheckpointContracts(contracts,adapters);
  const previous={buildId:sourceBuild,manifestURL:'/_releases/'+sourceBuild+'/manifest.json',manifestSha256:'a'.repeat(64),entryURL:'/_releases/'+sourceBuild+'/index.html'};
  await store.put({schema:1,token,owner,sourceBuild,targetBuild,route:outerRoute,language:'ru',adapters,checkpointContracts,previous,createdAt:Date.now()});
  const marker={token,owner,sourceBuild,targetBuild,phase:'switching',attempts:1,startedAt:Date.now(),route:outerRoute,checkpointContracts,previous};
  sessionStorage.setItem(UPDATE_PENDING_KEY,JSON.stringify(marker));localStorage.setItem(UPDATE_PENDING_KEY+':'+token,JSON.stringify(marker));
  const url=new URL(location.href);url.searchParams.set('rudnResume',token);url.hash=outerRoute;history.replaceState(null,'',url);
  const release={getReleaseContext:()=>({buildId:targetBuild,contracts}),markReleaseRestored:()=>qa.bootConfirmed++,
    checkRelease:async()=>({buildId:targetBuild}),prepareRelease:async()=>({ready:true,context:{contracts}}),
    rollbackRelease:()=>qa.rollbackCalls++,activatePreparedRelease:()=>{throw Error('Unexpected new update');}};
  window.coordinator=bootstrapUpdateCoordinator({autoStart:false,getOwner:()=>owner,getAdapters:()=>window.handle?[window.handle]:[],release,
    restoreRoute:async hash=>{if(location.hash!==hash)location.hash=hash;}});
  window.addEventListener('hashchange',()=>window.handle?.navigate(location.hash.split('/')[2]||'home'));
  window.handle=await mountCareer(document.querySelector('#module'),{owner,context:'course',lang:'ru',initialRoute:oldRoute,
    onRouteChange:(route,{replace=false}={})=>{qa.routeChanges.push(route);history[replace?'replaceState':'pushState'](null,'','#activity/seminar-6/'+route);}});
  qa.afterMountHash=location.hash;
  qa.restoreResult=await coordinator.restorePending();
  await handle.flush();
  qa.saved=await durableStore.loadDraft(scope);
  qa.pending=sessionStorage.getItem(UPDATE_PENDING_KEY);
  qa.persistentPending=localStorage.getItem(UPDATE_PENDING_KEY+':'+token);
  qa.envelope=await store.get(token);qa.adapterSnapshot=await store.get(adapterToken);
  document.documentElement.dataset.qaReady='true';
}catch(error){document.querySelector('#qa-error').hidden=false;document.querySelector('#qa-error').textContent=error.stack;console.error(error);document.documentElement.dataset.qaFailed='true';}
</script></body></html>`;

const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;res.setHeader('Cache-Control','no-store');
    if(pathname==='/__career-migration'){res.setHeader('Content-Type',mime['.html']);return res.end(harness);}
    if(pathname==='/assets/js/backend.js'){res.setHeader('Content-Type',mime['.js']);return res.end(backendSource);}
    if(pathname==='/favicon.ico'){res.statusCode=204;return res.end();}
    const file=path.resolve(site,'.'+decodeURIComponent(pathname));if(!file.startsWith(site+path.sep))throw Error('Outside test site');
    const bytes=await readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
  }catch{res.statusCode=404;res.end('Missing isolated QA resource');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,playwrightPath=process.env.PLAYWRIGHT_MODULE_PATH||process.env.PLAYWRIGHT_PATH;
const pw=playwrightPath?await import(pathToFileURL(path.resolve(playwrightPath)).href):require('playwright');
const report={engine,status:'fail',checks:[],errors:[],externalRequests:[],startedAt:new Date().toISOString()};
let browser,lastPage;
try{
  browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  for(const route of ['home','test']){
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();lastPage=page;
    page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push(error.message));
    await context.route('**/*',request=>{if(new URL(request.request().url()).origin===base)return request.continue();report.externalRequests.push(request.request().url());return request.abort();});
    await page.goto(base+'/__career-migration?route='+route);
    await page.waitForFunction(()=>document.documentElement.dataset.qaReady==='true'||document.documentElement.dataset.qaFailed==='true');
    assert.equal(await page.locator('#qa-error').isVisible(),false,await page.locator('#qa-error').textContent());
    const result=await page.evaluate(()=>qa);
    assert.equal(result.afterMountHash,result.outerRoute,'Initial first-stage gating must preserve the host restoration route');
    assert.equal(result.restoreResult.status,'restored',JSON.stringify(result.restoreResult));
    assert.equal(result.bootConfirmed,1,'The existing boot watchdog is explicitly satisfied');
    assert.equal(result.restoredSignals,1);assert.equal(result.rollbackCalls,0);assert.deepEqual(result.routeChanges,[]);
    assert.equal(result.pending,null);assert.equal(result.persistentPending,null);assert.equal(result.envelope,null);assert.equal(result.adapterSnapshot,null);
    assert.equal(new URL(page.url()).searchParams.has('rudnResume'),false,'Completed restoration removes its resume URL marker');
    assert.equal(new URL(page.url()).hash,result.outerRoute);
    assert.equal(await page.locator('#view-personality:not([hidden])').count(),1,'The new personality stage remains mandatory');
    assert.equal(await page.locator('#view-test').isVisible(),false);assert.equal(await page.locator('#personality-root input:checked').count(),0);
    const restored=JSON.parse(result.saved.state.values['answers-v8.1']);
    for(const key of ['modelVersion','questionnaireVersion','registryVersion','answers','questionIndex','prioritySectors','lowPrioritySectors','conditions','focusAreas','completedAt','resultRecordId'])assert.deepEqual(restored[key],prior[key],'Existing career '+key+' is retained');
    assert.equal(result.submissions,0);
    await page.locator('input[data-personality-item="ipip-001"][value="4"]').check();
    assert.equal(await page.locator('input[data-personality-item="ipip-001"][value="4"]').isChecked(),true,'The restored first stage accepts normal student input');
    report.checks.push({route,status:'pass',check:'Old career checkpoint restores, new first stage stays mandatory, pending update clears without rollback'});
    console.log('PASS '+engine+' legacy course '+route+': restored, answers retained, no rollback');
    await context.close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.status='pass';
}catch(error){report.failure=error.stack||String(error);console.error(report.failure);process.exitCode=1;
  if(lastPage&&!lastPage.isClosed()){await mkdir(output,{recursive:true});await lastPage.screenshot({path:path.join(output,'failure.png'),fullPage:false}).catch(()=>{});}
}finally{
  report.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
