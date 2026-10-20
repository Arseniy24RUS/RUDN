// Preserve the deployment/CI entry point while replacing the retired manual report form.
if(!process.argv.includes('--cold-legal-only'))await import('./diagnostics-v2-browser.mjs');

// Real cold main.js routing/coordinator and the public course adapter. Only the
// localhost identity/cloud boundary and A/B URL aliases are synthetic; this is
// not a service-worker, release-integrity, production-auth or physical-phone test.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=resolve(repo,'site');
const output=resolve(process.env.DIAGNOSTICS_OUTPUT||'test-results/diagnostics-v2','cold-legal-main');
const buildA='a'.repeat(32),buildB='b'.repeat(32),route='#activity/seminar-4';
const contracts=JSON.parse(await readFile(resolve(site,'data/platform-contracts.json'),'utf8'));
const index=await readFile(resolve(site,'index.html'),'utf8');
const html=index.replace(/<script\b[^>]*\bsrc="assets\/js\/(?:diagnostics-bootstrap|release-bootstrap)\.js"[^>]*><\/script>/g,'').replace('</body>','<script type="module" src="fixture-entry.mjs"></script></body>');
assert.ok(!html.includes('data-platform-bootstrap'),'The synthetic entry must not also start immutable bootRelease');
const fixture=`
const build=location.pathname.split('/')[2],base=location.origin+'/_releases/'+build+'/',owner='student:123456789';
const {backend}=await import(base+'assets/js/backend.js?v=1.3.10');
const {durableStore}=await import(base+'assets/js/durable-store.js');
const {setReleaseContext}=await import(base+'assets/js/release-resources.js');
const {updateSnapshotStore}=await import(base+'assets/js/platform-update-state.js');
const {academicContext}=await import(base+'assets/js/access.js?v=1.3.10');
window.qa={build,owner,events:[],submissions:0};
backend.profile={studentKey:'123456789',fullName:'Synthetic cold restore',group:'ГГУбд-01-26'};
backend.user=null;backend.authReady=true;backend.connected=false;
backend.init=async()=>{backend.emitStatus();return backend.status()};
backend.ensureStudentCloud=async()=>{};backend.ensureDiagnosticIdentity=async()=>null;backend.syncLocalToCloud=async()=>{};
backend.durableSync=()=>({restore:async()=>null,flush:async()=>({status:'synthetic-offline'})});
backend.getAccessOverrides=()=>({'topic-4':'open'});
backend.saveAttempt=async()=>{qa.submissions++;throw Error('Unexpected automatic submission')};
setReleaseContext({buildId:build,siteRoot:location.origin+'/',runtimeRoot:base,resources:{},contracts:${JSON.stringify(contracts)}});
document.documentElement.dataset.releaseBuild=build;
addEventListener('rudn:module-ready',()=>qa.events.push({event:'module-ready',legalBusy:document.querySelector('#legalLabMount')?.getAttribute('aria-busy')==='true',at:performance.now()}));
addEventListener('rudn:update-restored',event=>qa.events.push({event:'restored',buildId:event.detail?.buildId,at:performance.now()}));
window.qaRead=async()=>{
 await durableStore.flush();const scope={owner,activitySlug:'seminar-4',mode:'legal-lab-workspace'},draft=await durableStore.loadDraft(scope);
 if(!draft?.state?.legalLab)return null;const state=JSON.parse(draft.state.legalLab);
 const practice=await durableStore.loadDraft({...scope,mode:'legal-lab-practice',attemptId:draft.attemptId+'-practice'});
 if(practice?.state?.legalLabPractice)Object.assign(state,JSON.parse(practice.state.legalLabPractice).fields);
 return {attemptId:state.id,workspaceAttemptId:draft.attemptId,contentVersion:state.contentVersion,index:state.index,view:state.view,answers:state.answers,attemptCount:(await durableStore.listAttempts({owner})).length,pendingResults:(await durableStore.listPending({owner,limit:100,includeDeferred:true})).filter(item=>item.type==='attempt').length};
};
window.qaDiagnostics=()=>Object.keys(sessionStorage).filter(key=>key.startsWith('rudn.diagnostics.queue.v2.')).flatMap(key=>{try{return JSON.parse(sessionStorage.getItem(key)).buckets.flatMap(bucket=>[...bucket.queue,...(bucket.pending?.events||[])])}catch{return []}}).slice(-128).map(({event,module,code,operation,stage,success,errorClass})=>({event,module,code,operation,stage,success,errorClass}));
if(build==='${buildA}'){
 document.querySelector('#app').innerHTML='<div id="legalLabMount" aria-busy="true"></div>';
 const {mountLegalLabInCourse}=await import(base+'apps/legal-lab/platform.mjs?v=1.0.0'),year=academicContext(backend.globalNow());
 qa.handle=await mountLegalLabInCourse(document.querySelector('#legalLabMount'),{backend,rootPath:'rudn-platform/v1',owner,getOwner:()=>owner,period:year.startYear+'-'+year.endYear,locale:'ru',assessmentAllowed:()=>true,initialView:'learn'});
 document.querySelector('#legalLabMount').setAttribute('aria-busy','false');qa.ready=true;
 window.qaPrepare=async()=>{
  const receipt=await qa.handle.prepareForUpdate({targetRelease:{buildId:'${buildB}'},deadlineAt:Date.now()+5000});
  if(receipt.status!=='ready')return receipt;
  qa.handle.commitPreparation();const token=crypto.randomUUID(),previous={buildId:'${buildA}',entryURL:'/_releases/${buildA}/index.html',manifestURL:'/_releases/${buildA}/manifest.json',manifestSha256:'0'.repeat(64)};
  const envelope={schema:1,token,owner,sourceBuild:'${buildA}',targetBuild:'${buildB}',route:'${route}',language:'ru',adapters:[{module:'legal-lab',resumeToken:receipt.resumeToken,checkpointRef:receipt.checkpointRef}],previous,createdAt:Date.now()};
  const stored=await updateSnapshotStore().put(envelope);if(!stored.durable)throw Error('Envelope not durable');
  const marker={token,owner,sourceBuild:'${buildA}',targetBuild:'${buildB}',phase:'switching',attempts:1,startedAt:Date.now(),route:'${route}',previous};
  sessionStorage.setItem('rudn.update.pending.v1',JSON.stringify(marker));localStorage.setItem('rudn.update.pending.v1:'+token,JSON.stringify(marker));
  await qa.handle.destroy();return {...receipt,token};
 };
}else await import(base+'assets/js/main.js?v=1.3.10');
`;
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
let releaseHold,held=false,hold=new Promise(resolve=>releaseHold=resolve),heldResolve,heldReady;const requests=[];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');requests.push({path:url.pathname});
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return}
 if(url.pathname==='/release.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({schema:1,current:{buildId:buildB,entryURL:'/_releases/'+buildB+'/index.html',manifestURL:'/_releases/'+buildB+'/manifest.json',manifestSha256:'0'.repeat(64)}}));return}
 const match=url.pathname.match(/^\/_releases\/([ab]{32})\/(.+)$/);if(!match)throw Error('outside fixture');
 const [,build,logical]=match;
 if(logical==='index.html'){res.setHeader('Content-Type',mime['.html']);res.end(html);return}
 if(logical==='fixture-entry.mjs'){res.setHeader('Content-Type',mime['.mjs']);res.end(fixture);return}
 if(build===buildB&&logical==='apps/legal-lab/entry.mjs'){held=true;heldResolve();await hold;}
 const file=resolve(site,logical);if(!file.startsWith(site+sep))throw Error('outside fixture');
 res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const report={status:'fail',kind:'actual main/coordinator/cold hosted Legal restore with local synthetic identity/cloud and URL aliases',notCovered:['production authentication','service worker','immutable manifest integrity','physical phones'],results:[]};
report.sourceHashes=Object.fromEntries(await Promise.all(['assets/js/main.js','assets/js/platform-learning-updates.js','assets/js/platform-update-coordinator.js','assets/js/platform-update-state.js','apps/legal-lab/entry.mjs'].map(async file=>[file,createHash('sha256').update(await readFile(resolve(site,file))).digest('hex')])));
let browser,page;
try{for(const engine of (process.env.DIAGNOSTICS_BROWSERS||'chromium,firefox,webkit').split(',')){
 held=false;hold=new Promise(resolve=>releaseHold=resolve);heldReady=new Promise(resolve=>heldResolve=resolve);requests.length=0;
 const item={engine,status:'fail',errors:[],navigations:[],blockedExternal:[]};report.results.push(item);
 browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});item.version=browser.version();
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>item.errors.push(error.message));let measure=false;
 page.on('request',request=>{if(measure&&request.isNavigationRequest()&&request.frame()===page.mainFrame())item.navigations.push(new URL(request.url()).pathname)});
 await context.route('**/*',request=>{if(new URL(request.request().url()).origin===origin)return request.continue();item.blockedExternal.push(new URL(request.request().url()).origin);return request.abort()});
 try{
  await page.goto(origin+'/_releases/'+buildA+'/index.html'+route);await page.waitForFunction(()=>window.qa?.ready);
  const previousContext=await page.locator('.ll-scan-assignment-work[data-scan-mode="learning"] [data-scan-context]').getAttribute('data-scan-context');assert.ok(previousContext);
  await page.locator('[data-input="task-picker"]').selectOption('1');
  // selectOption changes the index before the async checkpoint/render replaces
  // the old scan. Read IDs and click only the newly painted question, once.
  await page.waitForFunction(previous=>{const context=document.querySelector('.ll-scan-assignment-work[data-scan-mode="learning"] [data-scan-context]')?.dataset.scanContext;return context&&context!==previous&&document.querySelector('[data-input="task-picker"]')?.value==='1'},previousContext);
  const work=page.locator('.ll-scan-assignment-work[data-scan-mode="learning"]');await work.waitFor();
  const fieldButton=work.locator('[data-action="scan-field"]').first();await fieldButton.click();
  const field=await fieldButton.getAttribute('data-scan-field'),regionButton=work.locator('[data-action="hotspot"][aria-pressed="false"]').first(),region=await regionButton.getAttribute('data-id');
  const task=(await work.locator('[data-scan-context]').getAttribute('data-scan-context')).split(':')[1];
  item.selection={previousContext,task,field,region};
  await regionButton.click();
  await page.waitForFunction(({field,region})=>Boolean(document.querySelector('[data-scan-field="'+CSS.escape(field)+'"][aria-pressed="true"]')&&document.querySelector('[data-assigned-field="'+CSS.escape(field)+'"][data-selected-region="'+CSS.escape(region)+'"]')),{field,region});
  await page.evaluate(()=>qa.handle.flush());
  const before=await page.evaluate(()=>qaRead());assert.equal(before.index,1);assert.equal(before.view,'learn');assert.equal(before.answers[task]?.metadata?.[field],region,'The painted question and durable selected answer must refer to the same task');assert.notEqual(before.answers[task].submitted,true);
  const prepared=await page.evaluate(()=>qaPrepare());assert.equal(prepared.status,'ready');assert.ok(prepared.resumeToken);assert.ok(prepared.token);
  item.prepared=await page.evaluate(async token=>{const saved=await (await import(new URL('assets/js/platform-update-state.js',location.href).href)).updateSnapshotStore().get(token);return {durable:Boolean(saved),module:saved?.module,readerAbsent:saved?.state?.reader===null,currentView:saved?.state?.currentView}},prepared.resumeToken);
  assert.equal(item.prepared.durable,true);assert.equal(item.prepared.readerAbsent,true);assert.equal(item.prepared.currentView,'learn');
  measure=true;await page.goto(origin+'/_releases/'+buildB+'/index.html?rudnResume='+prepared.token+route,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.qa?.events.some(event=>event.event==='module-ready'&&event.legalBusy));
  let heldTimeout;try{await Promise.race([heldReady,new Promise((_,reject)=>{heldTimeout=setTimeout(()=>reject(Error('Cold Legal entry request was not issued')),10000)})]);}finally{clearTimeout(heldTimeout)}
  assert.equal(held,true,'The actual outer ready event precedes completion of the held cold Legal entry request');
  // Allow the real 800ms coordinator wake to run while the real child is absent.
  await page.waitForTimeout(1200);
  const early=await page.evaluate(async token=>({marker:JSON.parse(sessionStorage.getItem('rudn.update.pending.v1')),snapshot:Boolean(await (await import(new URL('assets/js/platform-update-state.js',location.href).href)).updateSnapshotStore().get(token)),busy:document.querySelector('#legalLabMount')?.getAttribute('aria-busy'),events:qa.events}),prepared.resumeToken);
  item.early=early;
  assert.equal(early.marker?.phase,'switching');assert.equal(early.marker?.targetBuild,buildB);assert.equal(early.snapshot,true);assert.equal(early.busy,'true');assert.equal(early.events.some(event=>event.event==='restored'),false);assert.equal(item.navigations.length,1);
  releaseHold();await page.waitForFunction(()=>document.querySelector('#legalLabMount')?.getAttribute('aria-busy')==='false'&&!sessionStorage.getItem('rudn.update.pending.v1')&&window.qa?.events.some(event=>event.event==='restored'));
  const after=await page.evaluate(()=>qaRead());for(const key of ['attemptId','workspaceAttemptId','contentVersion','index','view','answers','attemptCount','pendingResults'])assert.deepEqual(after[key],before[key],key);
  assert.equal(after.pendingResults,0);assert.equal(after.attemptCount,0);assert.equal(after.answers[task].metadata[field],region);
  await page.waitForFunction(({field,region})=>Boolean(document.querySelector('[data-scan-field="'+CSS.escape(field)+'"][aria-pressed="true"]')&&document.querySelector('[data-assigned-field="'+CSS.escape(field)+'"][data-selected-region="'+CSS.escape(region)+'"]')),{field,region});
  const final=await page.evaluate(token=>({hash:location.hash,submissions:qa.submissions,restored:qa.events.filter(event=>event.event==='restored'),pending:localStorage.getItem('rudn.update.pending.v1:'+token),failed:localStorage.getItem('rudn.update.failed-releases.v1')}),prepared.token);
  assert.equal(final.hash,route);assert.equal(final.submissions,0);assert.equal(final.pending,null);assert.equal(final.failed,null);assert.equal(final.restored.length,1);assert.equal(final.restored[0].buildId,buildB);assert.equal(item.navigations.length,1);assert.deepEqual(item.errors,[]);assert.deepEqual(item.blockedExternal,[]);
  item.diagnostics=await page.evaluate(()=>qaDiagnostics());assert.equal(item.diagnostics.some(event=>event.event==='update-state'&&event.stage==='restore'&&event.success===false),false,'No caught restoration failure is hidden behind a later successful retry');
  item.status='pass';item.early=early;item.sameAttempt=true;item.sameQuestion=true;item.sameLastChoice=true;item.sameDurableAnswers=true;item.noAutomaticResult=true;item.noRollback=true;item.extraDocumentNavigations=0;
  await mkdir(output,{recursive:true});await page.screenshot({path:resolve(output,engine+'-restored.png')});
 }catch(error){item.failure={message:error.message,stack:error.stack};item.dom=await page.evaluate(()=>({hash:location.hash,build:window.qa?.build,events:window.qa?.events,marker:sessionStorage.getItem('rudn.update.pending.v1'),legalBusy:document.querySelector('#legalLabMount')?.getAttribute('aria-busy'),diagnostics:window.qaDiagnostics?.()})).catch(()=>({unavailable:true}));await mkdir(output,{recursive:true});await page.screenshot({path:resolve(output,engine+'-failure.png')}).catch(()=>{});throw error}
 finally{releaseHold();await context.close();await browser.close();browser=null;}
}report.status='pass';}
catch(error){report.failure={message:error.message,stack:error.stack};process.exitCode=1;}
finally{releaseHold();await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,kind:'cold-hosted-legal-main',results:report.results.map(({engine,status,failure})=>({engine,status,failure})),output}));}
