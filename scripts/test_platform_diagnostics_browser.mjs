// Preserve the deployment/CI entry point while replacing the retired manual report form.
if(!process.argv.includes('--cold-legal-only')&&!process.argv.includes('--admin-update-only'))await import('./diagnostics-v2-browser.mjs');

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
const {captureCheckpointContracts}=await import(base+'assets/js/platform-update-contracts.js');
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
  envelope.checkpointContracts=captureCheckpointContracts(${JSON.stringify(contracts)},envelope.adapters);
  const stored=await updateSnapshotStore().put(envelope);if(!stored.durable)throw Error('Envelope not durable');
  const marker={token,owner,sourceBuild:'${buildA}',targetBuild:'${buildB}',phase:'switching',attempts:1,startedAt:Date.now(),route:'${route}',previous,checkpointContracts:envelope.checkpointContracts};
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
try{for(const engine of (process.argv.includes('--admin-update-only')?[]:(process.env.DIAGNOSTICS_BROWSERS||'chromium,firefox,webkit').split(','))){
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
finally{releaseHold();await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});if(!process.argv.includes('--admin-update-only')){await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,kind:'cold-hosted-legal-main',results:report.results.map(({engine,status,failure})=>({engine,status,failure})),output}));}}

if(!process.exitCode&&!process.argv.includes('--cold-legal-only'))await verifyAdminUpdates();

async function verifyAdminUpdates(){
 const adminOutput=resolve(process.env.DIAGNOSTICS_OUTPUT||'test-results/diagnostics-v2','admin-main-update');
 const adminRoute='#diagnostics/123456789',adminOwner='teacher:synthetic-teacher';
 const adminHtml=html.replace('src="fixture-entry.mjs"','src="admin-entry.mjs"');
 // Real main on both documents. Only identity/read-data and release URL aliases
  // are synthetic. A's coordinator is stopped after mount readiness, before UI
  // setup and the manually owned transition; its real child adapter stays live.
  // B's coordinator is unchanged.
 // No site copies, Firebase, production or claim of full automatic A dispatch.
 const adminEntry=`
 const build=location.pathname.split('/')[2],base=location.origin+'/_releases/'+build+'/';
 const {backend}=await import(base+'assets/js/backend.js?v=1.3.10');
 const {setReleaseContext}=await import(base+'assets/js/release-resources.js');
 const {updateSnapshotStore}=await import(base+'assets/js/platform-update-state.js');
 const {captureCheckpointContracts}=await import(base+'assets/js/platform-update-contracts.js');
 window.qa={kind:'admin',build,events:[],calls:[],restored:0};
 backend.profile=null;backend.user={uid:'synthetic-teacher',email:'synthetic-teacher@invalid.example'};backend.isAdmin=()=>true;backend.authReady=true;backend.connected=false;
 backend.init=async()=>{backend.emitStatus();return backend.status()};backend.ensureDiagnosticIdentity=async()=>null;backend.syncLocalToCloud=async()=>{};
 backend.durableSync=()=>({restore:async()=>null,flush:async()=>({status:'synthetic-offline'})});
 backend.diagnosticsRequest=async(action,payload={},options={})=>{
  qa.calls.push({action,payload});
  if(action==='openSession')return {sessionId:payload.clientSessionId,subjectKey:'teacher_synthetic',generation:0};
  if(action==='append')return {batchId:payload.batchId,receivedAt:Date.now(),duplicate:false};
  const response=await fetch(base+'admin-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload}),signal:options.signal});
  if(!response.ok)throw Error('Synthetic read boundary failure');return response.json();
 };
 setReleaseContext({buildId:build,siteRoot:location.origin+'/',runtimeRoot:base,resources:{},contracts:${JSON.stringify(contracts)}});
 document.documentElement.dataset.releaseBuild=build;
 addEventListener('rudn:module-ready',()=>qa.events.push('module-ready'));
 addEventListener('rudn:update-restored',()=>{qa.restored++;qa.events.push('restored')});
 window.qaPrepare=async()=>{
  const adapter=window.qaAdminAdapter(),receipt=await adapter.prepareForUpdate({targetRelease:{buildId:'${buildB}'}});
  if(receipt.status!=='ready')return receipt;
  adapter.commitPreparation();const token=crypto.randomUUID(),previous={buildId:'${buildA}',entryURL:'/_releases/${buildA}/admin.html',manifestURL:'/_releases/${buildA}/manifest.json',manifestSha256:'0'.repeat(64)};
  const envelope={schema:1,token,owner:'${adminOwner}',sourceBuild:'${buildA}',targetBuild:'${buildB}',route:'${adminRoute}',language:'ru',adapters:[{module:'diagnostics',resumeToken:receipt.resumeToken,checkpointRef:receipt.checkpointRef}],previous,createdAt:Date.now()};
  envelope.checkpointContracts=captureCheckpointContracts(${JSON.stringify(contracts)},envelope.adapters);
  const stored=await updateSnapshotStore().put(envelope);if(!stored.durable)throw Error('Envelope not durable');
  const marker={token,owner:'${adminOwner}',sourceBuild:'${buildA}',targetBuild:'${buildB}',phase:'switching',attempts:1,startedAt:Date.now(),route:'${adminRoute}',previous,checkpointContracts:envelope.checkpointContracts};
  sessionStorage.setItem('rudn.update.pending.v1',JSON.stringify(marker));localStorage.setItem('rudn.update.pending.v1:'+token,JSON.stringify(marker));
  const saved=await updateSnapshotStore().get(receipt.resumeToken);return {...receipt,token,state:saved.state};
 };
 await import(base+'assets/js/main.js?v=1.3.10');
 `;
  const adminReport={status:'fail',kind:'actual-main-admin-update',synthetic:true,A_coordinator_stop_boundary:'after-source-mount-before-setup',A_synthetic_transition_owner:true,notCovered:['automatic A coordinator dispatch','production auth/API','service worker/integrity','physical phones'],results:[]};
 const sourceFiles=['assets/js/main.js','assets/js/diagnostics-ui.js','assets/js/platform-learning-updates.js','assets/js/platform-update-state.js','assets/js/platform-update-coordinator.js'];
 const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(resolve(site,file))).digest('hex')])));
 adminReport.sourceHashesBefore=await sourceHashes();
 let releaseAdminHold,holdAdmin,heldAdmin=false,adminBrowser,adminHeldReady,resolveAdminHeld;
 const calls=[];
 const adminServer=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return}
  if(url.pathname==='/release.json'){res.setHeader('Content-Type',mime['.json']);res.end(JSON.stringify({schema:1,current:{buildId:buildB,entryURL:'/_releases/'+buildB+'/admin.html',manifestURL:'/_releases/'+buildB+'/manifest.json',manifestSha256:'0'.repeat(64)}}));return}
  const match=url.pathname.match(/^\/_releases\/([ab]{32})\/(.+)$/);if(!match)throw Error('outside fixture');const [,build,logical]=match;
  if(logical==='admin.html'){res.setHeader('Content-Type',mime['.html']);res.end(adminHtml);return}
  if(logical==='admin-entry.mjs'){res.setHeader('Content-Type',mime['.mjs']);res.end(adminEntry);return}
  if(logical==='admin-api'){
   let raw='';for await(const chunk of req)raw+=chunk;const {action,payload}=JSON.parse(raw);calls.push({build,action,payload});
   if(build===buildB&&action==='listSessions'&&!heldAdmin){heldAdmin=true;resolveAdminHeld();await holdAdmin}
   const row={sessionId:payload.cursor?'synthetic-session-2':'synthetic-session-1',reportCode:'SYNTHETIC',installationId:'synthetic-installation',environment:{browser:'synthetic'},build:'fixture-build',openedAt:1800000000000};
   let value;
   if(action==='searchStudents')value={items:[{studentKey:'123456789',fullName:'Synthetic fixture student',group:'Synthetic group'}],nextCursor:null};
   else if(action==='listSessions')value={items:[row],nextCursor:payload.cursor?null:'sessions-next'};
   else if(action==='readEvents')value={items:[{event:'fixture-event',module:'maps',code:'ok'}],nextCursor:payload.cursor?null:'events-next'};
   else throw Error('Unexpected mutating/admin request');
   res.setHeader('Content-Type',mime['.json']);res.end(JSON.stringify(value));return;
  }
  const file=resolve(site,logical);if(!file.startsWith(site+sep))throw Error('outside fixture');
  let bytes=await readFile(file);if(logical==='assets/js/main.js')bytes=Buffer.from(bytes.toString('utf8')+`
if(window.qa?.kind==="admin"){
 window.qaAdminAdapter=()=>updateAdapters()[0];
 window.qaStopSourceUpdates=async()=>{
  if(qa.build!==${JSON.stringify(buildA)})throw Error('Source-only fixture lifecycle');
  updateCoordinator.destroy();
  // Drain an already running check; a disposed idle coordinator returns defer.
  // This cannot start another update or dispose the child adapter.
  await updateCoordinator.check('fixture-disposed');
 };
}
`);
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(bytes);
 }catch{res.writeHead(500);res.end()}});await new Promise(resolve=>adminServer.listen(0,'127.0.0.1',resolve));const baseURL='http://127.0.0.1:'+adminServer.address().port;
 try{for(const engine of (process.env.DIAGNOSTICS_BROWSERS||'chromium,firefox,webkit').split(',')){
  heldAdmin=false;holdAdmin=new Promise(resolve=>releaseAdminHold=resolve);adminHeldReady=new Promise(resolve=>resolveAdminHeld=resolve);calls.length=0;
   const item={engine,status:'fail',sourceCoordinatorStopped:false,errors:[],navigations:[],blockedExternal:[]};adminReport.results.push(item);
  adminBrowser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});item.version=adminBrowser.version();
  const context=await adminBrowser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await context.newPage();p.setDefaultTimeout(30000);
  p.on('pageerror',error=>item.errors.push(error.message));let measure=false;
  p.on('request',request=>{if(measure&&request.isNavigationRequest()&&request.frame()===p.mainFrame())item.navigations.push(new URL(request.url()).pathname)});
  await context.route('**/*',request=>{if(new URL(request.request().url()).origin===baseURL)return request.continue();item.blockedExternal.push(new URL(request.request().url()).origin);return request.abort()});
  try{
   await p.goto(baseURL+'/_releases/'+buildA+'/admin.html'+adminRoute);
   await p.waitForFunction(()=>document.querySelector('#app')?.getAttribute('aria-busy')==='false'&&window.qaAdminAdapter?.()?.isUpdateReady===true);
    await p.evaluate(()=>qaStopSourceUpdates());item.sourceCoordinatorStopped=true;
   await p.locator('[data-student-search] [name=query]').fill('Applied search');await p.locator('[data-student-search] [name=group]').fill('Applied group');await p.locator('[data-student-search] [type=submit]').click();
    await p.locator('[data-student]').waitFor();
    item.preStudentClick=await p.evaluate(()=>({busy:document.querySelector('#app')?.getAttribute('aria-busy'),inert:!!document.querySelector('[data-student]')?.closest('[inert]'),status:!!document.querySelector('[data-status]')?.textContent,marker:!!sessionStorage.getItem('rudn.update.pending.v1')}));
    await p.locator('[data-student]').click();await p.waitForFunction(()=>!document.querySelector('[data-status]')?.textContent);
   await p.locator('[data-filters] [name=module]').fill('maps');await p.locator('[data-filters] [type=submit]').click();await p.waitForFunction(()=>!document.querySelector('[data-status]')?.textContent);
   await p.locator('[data-device]').click();await p.locator('[data-device-reset]').waitFor();
   await p.locator('[data-sessions] [data-next]').click();await p.locator('[data-sessions] [data-prev]').waitFor();await p.locator('[data-session]').click();await p.locator('[data-export]').waitFor();
   await p.locator('[data-events] [data-next]').click();await p.locator('[data-events] [data-prev]').waitFor();
   await p.locator('[data-events] summary').first().click();
   await p.locator('[data-student-search] [name=query]').fill('Last unsubmitted surname');
   await p.locator('[data-filters] [name=from]').fill('2026-10-20T09:15');
   const draft=p.locator('[data-filters] [name=module]');await draft.fill('legal-lab');await draft.press('ArrowLeft');
   const before=await p.evaluate(()=>({focus:document.activeElement.name,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,scrollY}));
   item.beforeView=before;
   const prepared=await p.evaluate(()=>qaPrepare());assert.equal(prepared.status,'ready');assert.equal(prepared.state.sessionId,'synthetic-session-2');
   item.checkpointView=prepared.state.view;
   assert.equal(prepared.state.search.draft.query,'Last unsubmitted surname');assert.equal(prepared.state.search.applied.query,'Applied search');assert.equal(prepared.state.filters.applied.module,'maps');assert.equal(prepared.state.filters.draft.module,'legal-lab');assert.equal(prepared.state.filters.draft.from,'2026-10-20T09:15');
   assert.equal(prepared.state.filters.applied.installationId,'synthetic-installation');assert.equal(prepared.state.pages.events.cursor,'events-next');
   assert.doesNotMatch(JSON.stringify(prepared.state),/Synthetic fixture student|fixture-event|confirmationToken|downloadURL/);
   measure=true;await p.goto(baseURL+'/_releases/'+buildB+'/admin.html?rudnResume='+prepared.token+adminRoute,{waitUntil:'domcontentloaded'});
   await p.waitForFunction(()=>window.qa?.calls.some(x=>x.action==='listSessions'));
   // A recorded browser call precedes its HTTP arrival, especially in Firefox.
   // Observe the actual existing server hold before testing the early state.
   let holdDeadline;try{await Promise.race([adminHeldReady,new Promise((_,reject)=>{holdDeadline=setTimeout(()=>reject(Error('Admin fixture hold not reached')),30000)})])}finally{clearTimeout(holdDeadline)}
   assert.equal(heldAdmin,true);
   await p.waitForTimeout(1200);
   const early=await p.evaluate(()=>({marker:JSON.parse(sessionStorage.getItem('rudn.update.pending.v1')),ready:qaAdminAdapter()?.isUpdateReady===true,restored:qa.restored}));
   assert.equal(early.marker.phase,'switching');assert.equal(early.ready,false);assert.equal(early.restored,0);
   releaseAdminHold();
   await p.waitForFunction(()=>window.qa?.restored===1&&!sessionStorage.getItem('rudn.update.pending.v1'));
   const after=await p.evaluate(()=>({hash:location.hash,focus:document.activeElement.name,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,scrollY,
    query:document.querySelector('[data-student-search] [name=query]').value,module:document.querySelector('[data-filters] [name=module]').value,from:document.querySelector('[data-filters] [name=from]').value,
    details:document.querySelector('[data-events] details').open,calls:qa.calls.filter(x=>!['openSession','append'].includes(x.action)),restored:qa.restored,
    marker:sessionStorage.getItem('rudn.update.pending.v1'),failed:localStorage.getItem('rudn.update.failed-releases.v1')}));
   item.afterView={focus:after.focus,start:after.start,end:after.end,scrollY:after.scrollY};
   assert.equal(after.hash,adminRoute);assert.equal(after.query,'Last unsubmitted surname');assert.equal(after.module,'legal-lab');assert.equal(after.from,'2026-10-20T09:15');assert.equal(after.details,true);
   for(const key of ['focus','start','end'])assert.equal(after[key],before[key],key);assert.ok(Math.abs(after.scrollY-before.scrollY)<=1);
   assert.ok(after.calls.some(x=>x.action==='listSessions'&&x.payload.cursor==='sessions-next'&&x.payload.filters.module==='maps'&&x.payload.filters.installationId==='synthetic-installation'));
   assert.ok(after.calls.some(x=>x.action==='readEvents'&&x.payload.sessionId==='synthetic-session-2'&&x.payload.cursor==='events-next'));
   assert.ok(after.calls.every(x=>['searchStudents','listSessions','readEvents'].includes(x.action)));assert.equal(after.marker,null);assert.equal(after.failed,null);assert.equal(item.navigations.length,1);assert.deepEqual(item.errors,[]);assert.deepEqual(item.blockedExternal,[]);
   item.status='pass';item.earlyDeferred=true;item.sameSelection=true;item.lastUnblurredDraft=true;item.appliedFiltersSeparate=true;item.sameCursor=true;item.focusAndScroll=true;item.readOnlyRestore=true;item.oneNavigation=true;
   await mkdir(adminOutput,{recursive:true});await p.screenshot({path:resolve(adminOutput,engine+'-restored.png')});
  }catch(error){item.failure={message:error.message,stack:error.stack};item.dom=await p.evaluate(()=>({hash:location.hash,busy:document.querySelector('#app')?.getAttribute('aria-busy'),calls:window.qa?.calls,events:window.qa?.events,marker:sessionStorage.getItem('rudn.update.pending.v1')})).catch(()=>({unavailable:true}));await mkdir(adminOutput,{recursive:true});await p.screenshot({path:resolve(adminOutput,engine+'-failure.png')}).catch(()=>{});throw error}
  finally{releaseAdminHold();await context.close();await adminBrowser.close();adminBrowser=null}
 }adminReport.status='pass'}catch(error){adminReport.failure={message:error.message,stack:error.stack};process.exitCode=1}
 finally{releaseAdminHold?.();await adminBrowser?.close();await new Promise(resolve=>{adminServer.close(resolve);adminServer.closeAllConnections()});adminReport.sourceHashesAfter=await sourceHashes();adminReport.sourceStable=JSON.stringify(adminReport.sourceHashesAfter)===JSON.stringify(adminReport.sourceHashesBefore);if(!adminReport.sourceStable){adminReport.status='fail';process.exitCode=1}await mkdir(adminOutput,{recursive:true});await writeFile(resolve(adminOutput,'report.json'),JSON.stringify(adminReport,null,2));console.log(JSON.stringify({kind:adminReport.kind,status:adminReport.status,results:adminReport.results.map(({engine,status,failure})=>({engine,status,failure})),output:adminOutput}))}
}
