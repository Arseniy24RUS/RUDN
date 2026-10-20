/** Informed synthetic localhost adapter regression. Real app UI + local IDB;
 * the backend is isolated and never contacts Firebase or a production profile. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=resolve(root,'site');
const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const engine=arg('--browser','chromium'),output=resolve(arg('--output',resolve(root,'../evidence/runs/20261018-platform-observability/adapters/'+engine)));
assert.ok(['chromium','firefox','webkit'].includes(engine));
const fixture=`<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Platform update adapters — synthetic QA</title><style>body{margin:0;font:16px system-ui}#module{min-height:100vh}#runtime{height:720px;width:100%}</style><main id="module"></main><script type="module">
import {backend} from '/assets/js/backend.js?v=1.3.10';
import {updateSnapshotStore} from '/assets/js/platform-update-state.js';
window.qa={events:[],kind:new URLSearchParams(location.search).get('module'),owner:'guest:updates',token:null};
const diagnostics={record:(event,fields)=>qa.events.push({event,fields}),error:(_error,fields)=>qa.events.push({event:fields.event,fields}),span:operation=>{const started=performance.now();return fields=>qa.events.push({event:'operation',fields:{operation,...fields,durationMs:performance.now()-started}})}};
window.mount=async()=>{
 const node=document.querySelector('#module');node.replaceChildren();let handle;
 if(qa.kind==='legal-lab'){
  const {mountLegalLab}=await import('/apps/legal-lab/entry.mjs');
  if(!qa.legalSeed){const {freshState}=await import('/apps/legal-lab/lib/storage.mjs');const [catalog,bank]=await Promise.all(['catalog','bank'].map(id=>fetch('/apps/legal-lab/data/'+id+'.json').then(r=>r.json())));qa.legalSeed=freshState(catalog.contentVersion);qa.legalSeed.index=bank.classroom.findIndex(t=>t.kind==='text');qa.legalSeed.view='learn';}
  handle=await mountLegalLab(node,{owner:qa.owner,period:'test',demo:true,locale:'ru',initialState:qa.mounted?undefined:qa.legalSeed,diagnostics});
 }else if(qa.kind==='career'){
  const {mountCareer}=await import('/apps/career/entry.mjs');handle=await mountCareer(node,{owner:'guest',lang:'ru',initialRoute:'test',diagnostics});
 }else if(qa.kind==='reception'){
  const {mountReception}=await import('/apps/reception/js/app.js'),{BUNDLED_CALENDARS}=await import('/assets/js/calendar-bundled.js');
  handle=await mountReception(node,{period:'2026-2027',assessmentAllowed:false,locale:'ru',diagnostics,calendarLoader:async()=>({year:2026,snapshot:BUNDLED_CALENDARS,stale:false,origins:[],unavailableYears:[],loadedAt:new Date().toISOString()})});
 }else if(qa.kind==='settlements'){
  const {mountSettlements}=await import('/apps/settlements/entry.mjs');qa.settlementsBackend??={...backend,getProfile:()=>qa.settlementsProfile||null};handle=await mountSettlements(node,{backend:qa.settlementsBackend,owner:'guest:updates',mode:'free',locale:'ru',diagnostics});
 }
 qa.mounted=true;window.handle=handle;return true;
};
window.prepare=async()=>{const result=await handle.prepareForUpdate({targetRelease:{buildId:'synthetic-next'},deadlineAt:Date.now()+5000});qa.receipt=result;if(result.resumeToken)qa.saved=await updateSnapshotStore().get(result.resumeToken);return result;};
window.roundtrip=async()=>{const token=qa.receipt.resumeToken;handle.commitPreparation?.();if(typeof handle==='function')await handle();else await handle.destroy();await mount();return handle.resumeAfterUpdate({resumeToken:token});};
await mount();window.ready=true;
</script>`;
const backend=`import {durableStore} from '/assets/js/durable-store.js';
export const backend={generation:1,authReady:true,user:null,serverTimeOffset:0,isAdmin:()=>false,getProfile:()=>null,onStatus:()=>()=>{},init:async()=>{},globalNow:()=>Date.now(),getAccessOverrides:()=>({}),localAttempts:()=>[],databaseAvailable:()=>false,ensureDiagnosticIdentity:async()=>null,loadDraft:scope=>durableStore.loadDraft(scope),checkpoint:(input,options)=>{if(window.failSave)return Promise.reject(Error('synthetic save failure'));return durableStore.checkpoint(input,{...options,queue:false});},saveAttempt:async()=>{window.syntheticSubmissions=(window.syntheticSubmissions||0)+1;throw Error('Unexpected submission');},restTransport:()=>({get:async()=>({value:null})})};`;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};
function tracedRuntime(text,path){if(!args.includes('--trace-runtime'))return text;const markers=path.endsWith('/v24/game.mjs')?['if(!manifest){const source=', 'const [{pack,network},sourceBoundary,roads,cityBoundary]=', 'const boundary=combineFederalBoundary', 'const {stored,version,difficulty:nextDifficulty}=', 'if(version>=3)await loadDistanceTransportPolicy', 'if(version===4)await loadTelecomPlan', 'const nextScenario=withPlayableRegionScope', 'let nextState=createState', 'const initialEvaluation=evaluate', 'const nextEvaluation=stored', 'map=new GameMap', "loading=false;$('.puzzle-loading').hidden=true;render();", 'map.camera.setViewport', "if(mode!=='intro'&&(!stored||updatedScenario))", 'if(imported||restart||!stored||updatedScenario', 'return {destroy']:path.endsWith('/v24/map.mjs')?["this.ctx = this.canvas.getContext('2d');", 'this.towerCache = new TowerGeometryCache', 'this.camera = new Camera2D', 'this.observer = new ResizeObserver']:path.endsWith('/transport-policy-v2.mjs')?['const record=url.protocol', 'if(!Array.isArray(record)', 'const [fingerprint,worldHash,keysHash,count', 'if(definition.worldHash', 'const roadBytes=bytes', 'for(const [i,key]', 'if(fingerprintFor', 'const policy=frozenPolicy']:path.endsWith('/transport-policy-fetch.mjs')?['const match=text.match', 'const record=JSON.parse']:[];for(const [i,needle] of markers.entries())if(text.includes(needle))text=text.replace(needle,`console.debug('QA_RUNTIME_PHASE:${path.split('/').pop()}:${i}');${needle}`);return text;}
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local');if(url.pathname==='/__qa'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(fixture);return;}if(url.pathname==='/assets/js/backend.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(backend);return;}const path=resolve(site,'.'+url.pathname);if(!path.startsWith(site+sep)||(await stat(path)).isDirectory())throw Error('missing');res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});if(url.pathname==='/apps/governor/platform-bridge.js'){res.end(await readFile(path,'utf8')+'\nwindow.qaGovernor={get adapter(){return updateAdapter},get runtime(){return runtime}};');return;}if(args.includes('--trace-runtime')&&/\/v24\/(game|map|transport-policy-v2|transport-policy-fetch)\.mjs$/.test(url.pathname)){res.end(tracedRuntime(await readFile(path,'utf8'),url.pathname));return;}res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const report={kind:'informed synthetic public adapter roundtrip',engine,status:'fail',checks:[],errors:[],browserPath:'Reproducible localhost integration through bundled Playwright with isolated synthetic backend'};
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href:'playwright');let browser,lastPage;
try{
 browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});report.version=browser.version();
 for(const module of (arg('--module','')==='settlements-preview'?[]:arg('--module','')?[arg('--module','')]:['legal-lab','career','reception','settlements'])){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();lastPage=page;page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push({module,message:e.message}));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/__qa?module='+module);await page.waitForFunction(()=>window.ready);
  assert.equal(await page.title(),'Platform update adapters — synthetic QA');
  if(module==='legal-lab'){
   await page.locator('.ll-paper [data-unit]').first().waitFor();await page.locator('.ll-paper [data-unit]').first().click();await page.evaluate(()=>handle.flush());
   await page.locator('[data-action="toggle-reader-search"]').click();await page.locator('[data-input="reader-query"]').fill('власть');
  }else if(module==='career'){
   await page.locator('#answer-options [data-answer]').first().click();await page.locator('#question-next').click();
  }else if(module==='reception'){
   await page.locator('[data-action="start"]').click();await page.locator('[data-action="tab"][data-tab="research"]').click();await page.locator('input[type=radio][data-field="knowledge.application"]').first().check();await page.locator('[data-field="knowledge.lawNumber"]').fill('synthetic last unblurred input');
  }else{
   await page.locator('[data-select="rank-difficulty"]').selectOption('hard');
  }
  let prepared;for(let i=0;i<15;i++){prepared=await page.evaluate(()=>prepare());if(prepared.status!=='defer')break;await page.waitForTimeout(100);}
  assert.equal(prepared.status,'ready',module+': '+JSON.stringify(prepared));
  const snapshot=await page.evaluate(()=>qa.saved);assert.equal(snapshot.module,module);assert.ok(snapshot.checkpointRef);
  const restored=await page.evaluate(()=>roundtrip());assert.equal(restored.status,'restored',module+': '+JSON.stringify(restored));
  if(module==='legal-lab'){assert.ok(snapshot.state.reader?.docId,'Text restore must exercise a real reader position');assert.equal(await page.locator('.ll-paper [data-unit][aria-pressed="true"]').count(),1);assert.equal(await page.locator('[data-input="reader-query"]').inputValue(),'власть');assert.equal((await page.evaluate(()=>handle.getDiagnostics())).reader.docId,snapshot.state.reader.docId);}
  if(module==='career'){assert.equal(await page.locator('[data-question-index="1"]').getAttribute('aria-current'),'step');}
  if(module==='reception'){assert.equal(await page.locator('[data-field="knowledge.lawNumber"]').inputValue(),'synthetic last unblurred input');assert.equal(await page.locator('input[type=radio][data-field="knowledge.application"]').first().isChecked(),true);}
  if(module==='settlements'){assert.equal(await page.locator('[data-select="rank-difficulty"]').inputValue(),'hard');}
  assert.equal(await page.evaluate(()=>window.syntheticSubmissions||0),0);const diagnosticEvents=await page.evaluate(()=>qa.events);assert.ok(diagnosticEvents.some(e=>e.event==='operation'&&e.fields.operation==='module-load'&&e.fields.success===true),module+' actual load telemetry');if(module!=='settlements')assert.ok(diagnosticEvents.some(e=>e.event==='checkpoint'&&e.fields.success===true),module+' durable checkpoint telemetry');assert.equal(JSON.stringify(diagnosticEvents).includes('synthetic last unblurred input'),false);
  await mkdir(output,{recursive:true});await page.screenshot({path:resolve(output,module+'-restored.png')});report.checks.push({module,status:'pass',check:'durable local checkpoint + same place + no result submission'});
  if(module==='career'){
   await page.evaluate(()=>window.failSave=true);const refused=await page.evaluate(()=>prepare());assert.equal(refused.status,'blocked');await page.locator('#question-back').click();assert.equal(await page.locator('[data-question-index="0"]').getAttribute('aria-current'),'step');report.checks.push({module,status:'pass',check:'failed checkpoint blocks update and releases the input gate'});
  }
  if(module==='settlements'){
   const changed=await page.evaluate(async()=>{qa.settlementsProfile={studentKey:'synthetic-other-owner'};return prepare();});
   assert.equal(changed.status,'defer','An injected host profile change must prevent saving the previous owner');
   await page.locator('[data-select="rank-difficulty"]').selectOption('easy');
   await page.evaluate(()=>{qa.settlementsProfile=null;});
   const guestAgain=await page.evaluate(()=>prepare());assert.equal(guestAgain.status,'ready','The original guest identity remains resumable');
   await page.evaluate(()=>handle.cancelPreparation({discard:true}));
   report.checks.push({module,status:'pass',check:'injected host identity blocks a switched profile and preserves the guest fallback'});
  }
  await context.close();
 }
 if(!arg('--module','')||arg('--module','')==='legal-lab'){
  const bank=JSON.parse(await readFile(resolve(site,'apps/legal-lab/data/bank.json'),'utf8'));
  for(const kind of ['scan','type']){
   const index=bank.classroom.findIndex(task=>task.kind===kind),check={module:'legal-lab',kind,status:'fail',check:'reader-free checkpoint restores the same task, choice and attempt without submission'};
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();lastPage=page;page.setDefaultTimeout(20000);
   page.on('pageerror',error=>report.errors.push({module:'legal-lab',kind,message:error.message}));
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
   try{
    assert.ok(index>=0);await page.goto('http://127.0.0.1:'+server.address().port+'/__qa?module=legal-lab');await page.waitForFunction(()=>window.ready);
    // Begin with the real text reader, then leave it through the visible task
    // picker. The image task must retire that reader before capture and restore.
    await page.locator('.ll-paper [data-unit]').first().waitFor();await page.locator('[data-input="task-picker"]').selectOption(String(index));
    if(kind==='scan'){
     await page.locator('[data-action="scan-field"]').first().click();await page.locator('[data-action="hotspot"]').first().focus();await page.keyboard.press('Enter');
     await page.locator('.ll-assigned-frame').first().waitFor();
    }else{
     await page.locator('[data-action="type-choice"]').first().click();await page.locator('[data-action="type-choice"][aria-pressed="true"]').waitFor();
    }
    await page.evaluate(()=>handle.flush());
    const selection=kind==='scan'?'.ll-assigned-frame': '[data-action="type-choice"][aria-pressed="true"]';
    const chosen=await page.locator(selection).first().evaluate(el=>({field:el.dataset.assignedField??null,region:el.dataset.selectedRegion??null,type:el.dataset.value??null}));
    assert.equal((await page.evaluate(()=>handle.getDiagnostics())).reader,null,'The image task has no text reader');
    let prepared;for(let i=0;i<15;i++){prepared=await page.evaluate(()=>prepare());if(prepared.status!=='defer')break;await page.waitForTimeout(100);}
    assert.equal(prepared.status,'ready',JSON.stringify(prepared));const before=await page.evaluate(()=>qa.saved);
    assert.equal(before.state.reader,null);check.capturedReader=null;assert.ok(before.identity.attemptId);assert.equal(before.checkpointRef.id,before.identity.attemptId);
    const restored=await page.evaluate(()=>roundtrip());check.restoreResult=restored;assert.equal(restored.status,'restored',JSON.stringify(restored));
    assert.equal(await page.locator('[data-input="task-picker"]').inputValue(),String(index));assert.equal((await page.evaluate(()=>handle.getDiagnostics())).reader,null);
    assert.deepEqual(await page.locator(selection).first().evaluate(el=>({field:el.dataset.assignedField??null,region:el.dataset.selectedRegion??null,type:el.dataset.value??null})),chosen);
    const again=await page.evaluate(()=>prepare());assert.equal(again.status,'ready');const after=await page.evaluate(()=>qa.saved);
    assert.deepEqual(after.identity,before.identity);assert.equal(after.checkpointRef.id,before.checkpointRef.id);assert.equal(after.state.reader,null);
    assert.equal(await page.evaluate(()=>window.syntheticSubmissions||0),0);await page.evaluate(()=>handle.cancelPreparation({discard:true}));
    await mkdir(output,{recursive:true});await page.screenshot({path:resolve(output,'legal-lab-'+kind+'-restored.png')});check.status='pass';
   }catch(error){check.failure={message:error.message,stack:error.stack};await mkdir(output,{recursive:true});await page.screenshot({path:resolve(output,'legal-lab-'+kind+'-failure.png'),timeout:5000}).catch(()=>{});}
   finally{report.checks.push(check);await context.close();}
  }
  assert.equal(report.checks.filter(check=>check.status==='fail').length,0,'Reader-free Legal Lab restores must pass');
 }
 if(!arg('--module','')||arg('--module','')==='settlements-preview'){
  // The host test above verifies its durable contract. This separate public
  // engine mount checks a tentative map action without confirming a move.
  const context=await browser.newContext({viewport:{width:1100,height:800}}),page=await context.newPage();lastPage=page;page.on('pageerror',e=>report.errors.push({module:'settlements-preview',message:e.message}));page.on('crash',()=>{report.crash={module:'settlements-preview',stage:report.stage};});page.on('console',msg=>{if(msg.text().startsWith('QA_RUNTIME_PHASE:')){(report.runtimePhases??=[]).push(msg.text());console.log(msg.text());}});
  report.stage='settlements-preview-fixture';await page.goto('http://127.0.0.1:'+server.address().port+'/__qa?module=runtime');await page.waitForFunction(()=>window.ready);
  report.stage='settlements-preview-mount';await page.evaluate(async()=>{const {mountSettlementsGame}=await import('/apps/settlements/runtime/assets/js/settlements/v24/game.mjs');document.querySelector('#module').innerHTML='<link rel="stylesheet" href="/apps/settlements/runtime/assets/css/settlements-v24.css"><div id="runtime"></div>';window.runtimeMount=async save=>window.runtimeHandle=await mountSettlementsGame(document.querySelector('#runtime'),{mode:'intro',regionId:'chelyabinskaya_oblast',initialSave:save,onCheckpoint:async()=>{},onComplete:async()=>{throw Error('Unexpected completion')}});await runtimeMount();});
  report.stage='settlements-preview-click';report.previewGeometry=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},canvases:[...document.querySelectorAll('canvas')].map(el=>({width:el.width,height:el.height,clientWidth:el.clientWidth,clientHeight:el.clientHeight}))}));
  const point=await page.evaluate(()=>runtimeHandle.mapPoint(runtimeHandle.inspect().tutorial.coordinate));await page.locator('.puzzle-map').click({position:point});
  const preview=await page.evaluate(()=>{const current=runtimeHandle.inspect();return {capture:runtimeHandle.captureForUpdate(),save:runtimeHandle.exportSave(),preview:current.preview,actions:current.state.actions.length};});assert.ok(preview.preview?.ok);assert.equal(preview.actions,0);
  report.stage='settlements-preview-restore';const restoredPreview=await page.evaluate(async saved=>{runtimeHandle.destroy();await runtimeMount(saved.save);const restored=runtimeHandle.restoreForUpdate(saved.capture);return {restored,inspect:runtimeHandle.inspect(),capture:runtimeHandle.captureForUpdate()};},preview);
  assert.equal(restoredPreview.restored,true);assert.equal(restoredPreview.inspect.state.actions.length,0);assert.deepEqual(restoredPreview.inspect.preview.action,preview.preview.action);assert.deepEqual(restoredPreview.capture.selectedPosition,preview.capture.selectedPosition);assert.ok(Math.abs(restoredPreview.capture.camera.zoom-preview.capture.camera.zoom)<1e-6);report.stage='settlements-preview-screenshot';await page.screenshot({path:resolve(output,'settlements-preview-restored.png')});report.checks.push({module:'settlements-preview',status:'pass',check:'unconfirmed placement + preview + camera restored with zero committed actions'});await context.close();

  if(!arg('--module','')){report.stage='governor';const gov=await browser.newContext({viewport:{width:1100,height:850}}),governor=await gov.newPage();lastPage=governor;governor.setDefaultTimeout(25000);governor.on('pageerror',e=>report.errors.push({module:'governor',message:e.message}));await governor.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const url='http://127.0.0.1:'+server.address().port+'/apps/governor/index.html?context=free';await governor.goto(url);await governor.waitForFunction(()=>window.qaGovernor?.adapter);
  await governor.locator('#campaign-options > summary').click();await governor.locator('#session-seed').fill('SYNTHETIC-UPDATE');let govPrepared=await governor.evaluate(()=>qaGovernor.adapter.prepareForUpdate({targetRelease:'synthetic-next'}));assert.equal(govPrepared.status,'ready');await governor.evaluate(()=>qaGovernor.adapter.commitPreparation());await governor.reload();await governor.waitForFunction(()=>window.qaGovernor?.adapter);assert.equal((await governor.evaluate(token=>qaGovernor.adapter.resumeAfterUpdate({resumeToken:token}),govPrepared.resumeToken)).status,'restored');assert.equal(await governor.locator('#session-seed').inputValue(),'SYNTHETIC-UPDATE');
  await governor.locator('#campaign-mode').selectOption('guided');await governor.locator('#start-form button[type="submit"]').click();await governor.waitForFunction(()=>qaGovernor.runtime.state()?.history?.length===0);
  // Introductory panels are an ordinary transient update gate.
  await governor.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await governor.locator('.nav-button[data-view="map"]').click();
  const campaign=await governor.evaluate(()=>qaGovernor.runtime.checkpointForUpdate());govPrepared=await governor.evaluate(()=>qaGovernor.adapter.prepareForUpdate({targetRelease:'synthetic-next'}));assert.equal(govPrepared.status,'ready');await governor.evaluate(()=>qaGovernor.adapter.commitPreparation());await governor.reload();await governor.waitForFunction(()=>window.qaGovernor?.adapter);assert.equal((await governor.evaluate(token=>qaGovernor.adapter.resumeAfterUpdate({resumeToken:token}),govPrepared.resumeToken)).status,'restored');
  const after=await governor.evaluate(()=>qaGovernor.runtime.checkpointForUpdate());assert.equal(after.storiesRunId,campaign.storiesRunId);assert.equal(after.history.length,campaign.history.length);assert.equal(after.activeView,'map');assert.equal(await governor.evaluate(()=>window.syntheticSubmissions||0),0);await governor.screenshot({path:resolve(output,'governor-restored.png')});report.checks.push({module:'governor',status:'pass',check:'standalone launch fields and active campaign view restored without a new run or submission'});await gov.close();}
 }
 if(!arg('--module','')){const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();lastPage=page;page.on('pageerror',e=>report.errors.push({module:'reception-demo',message:e.message}));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/apps/reception/demo.html');await page.locator('[data-action="start"]').waitFor();await page.screenshot({path:resolve(output,'reception-demo.png')});report.checks.push({module:'reception-demo',status:'pass',check:'deployed standalone entry mounts the maintained modular app'});await context.close();}
 assert.deepEqual(report.errors,[]);report.status='pass';
}catch(error){report.failure={message:error.message,stack:error.stack,stage:report.stage};process.exitCode=1;await mkdir(output,{recursive:true});if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:resolve(output,'failure.png'),timeout:5000}).catch(captureError=>{report.failureScreenshot={message:captureError.message};});await lastPage.content().then(html=>writeFile(resolve(output,'failure.html'),html)).catch(()=>{});}}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
