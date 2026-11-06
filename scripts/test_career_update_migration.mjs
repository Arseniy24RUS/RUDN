/** An older course update must restore its existing checkpoint while displaying
 * the personality and employer-preference stages before resuming career answers.
 * Real career runtime, coordinator and local
 * stores; only the backend and release transport use isolated synthetic data. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {MODEL_VERSION,QUESTIONNAIRE_VERSION,REGISTRY_VERSION} from '../site/apps/career/assets/versions.mjs';
import {PERSONALITY_ITEMS,PERSONALITY_METHOD} from '../site/apps/career/assets/personality-model.mjs';
import {completionStatus} from '../site/apps/career/assets/scoring.mjs';

const require=createRequire(import.meta.url),args=process.argv.slice(2);
const argument=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),site=path.join(root,'site');
const engine=argument('--browser','chromium');
assert.ok(['chromium','firefox','webkit'].includes(engine),'Supported browser engine');
const launchTimeout=Number(argument('--launch-timeout','180000'));
assert.ok(Number.isFinite(launchTimeout)&&launchTimeout>0,'A finite positive browser launch timeout is required');
const output=path.resolve(argument('--output',path.join(root,'../career-migration-qa',engine)));
assert.ok(output!==root&&!output.startsWith(root+path.sep),'Keep browser evidence outside the repository');
const questions=JSON.parse(await readFile(path.join(site,'apps/career/data/questions.json'),'utf8'));
const conditions=JSON.parse(await readFile(path.join(site,'apps/career/data/conditions.json'),'utf8'));
const owner='student:career-migration-qa';
const prior={schema:4,modelVersion:MODEL_VERSION,questionnaireVersion:QUESTIONNAIRE_VERSION,registryVersion:REGISTRY_VERSION,
  answers:{[questions[0].id]:2,[questions[1].id]:5},questionIndex:2,prioritySectors:['EDU','SOC'],lowPrioritySectors:[],
  conditions:{FIELD:3},focusAreas:{},compareIds:[],lastRoute:'test',completedAt:null,resultRecordId:null,updatedAt:'2026-11-01T12:00:00.000Z'};

// Explicit migration fixture, seeded BEFORE mount. This is synthetic storage-
// boundary QA, not a UI-created save or a blind playtest. The single-draft shape
// is the schema-1 format in published bbc731814813486541108a3abacfafd1f0cfa4a8.
const legacyManualDraft={employer:'mintrud',title:'Учебный черновик: специалист «Труд & занятость»',
  url:'https://example.invalid/legacy-announcement?org=mintrud&record=qa-20261106',
  education:'Высшее образование — бакалавриат или специалитет.\nНаправление: «Экономика» либо «Юриспруденция».',
  experience:'Стаж государственной службы не менее 2 лет\nили стаж работы по специальности не менее 4 лет.',
  knowledge:'Знание законодательства о государственной гражданской службе.\nРабота с текстами: «условие A» & «условие B».',
  skills:'Подготовка аналитических записок.\nНавыки межведомственного взаимодействия; уровень C1.',open:true};
const legacyManualJourney={schemaVersion:1,regionIds:['ru-77'],desiredIds:['mintrud','minfin','mineconom'],confirmed:true,
  assessments:{},customVacancies:[],selectedVacancyId:null,view:'profile',resultRecordId:null,comparisonId:null,manualDraft:legacyManualDraft};
const manualPrior={...prior,answers:Object.fromEntries(questions.map(question=>[question.id,3])),questionIndex:questions.length-1,
  prioritySectors:['EDU','SOC','FIN','ECO'],lowPrioritySectors:['SEC','EMR'],conditions:Object.fromEntries(conditions.map(condition=>[condition.id,3])),lastRoute:'conditions'};
assert.equal(completionStatus({...manualPrior,questions}).complete,true,'Legacy manual fixture must satisfy the published conditions-route guards');
const completedPersonality={schema:1,method:PERSONALITY_METHOD.id,version:PERSONALITY_METHOD.version,
  answers:Object.fromEntries(PERSONALITY_ITEMS.map(item=>[item.id,3])),page:11,completedAt:'2026-11-01T12:00:00.000Z'};

const backendSource=`import {durableStore} from '/assets/js/durable-store.js';
export const groupOptions=()=>[];
export const backend={generation:1,authReady:true,user:null,mode:'local',connected:false,serverTimeOffset:0,
getProfile:()=>({studentKey:'career-migration-qa'}),isAdmin:()=>false,init:async()=>{},onStatus:()=>()=>{},status:()=>({}),
globalNow:()=>Date.now(),getAccessOverrides:()=>({}),localGrades:()=>({}),localAttempts:()=>[],getAttempts:async()=>[],
loadDraft:scope=>durableStore.loadDraft(scope),checkpoint:(input,options)=>{window.qa.checkpoints.push(structuredClone(input));return durableStore.checkpoint(input,{...options,queue:false});},
saveAttempt:async attempt=>{window.qa.submissions++;window.qa.attempts.push(structuredClone(attempt));if(window.qa.manualFixture)return structuredClone(attempt);throw Error('Partial-draft migration QA forbids submissions');}};`;

const harness=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Career update migration · isolated QA</title>
<style>body{margin:0;font:16px system-ui}#module{max-width:1100px;margin:auto;padding:16px}#qa-error{white-space:pre-wrap;color:#900}</style></head><body><pre id="qa-error" hidden></pre><main id="module"></main>
<script type="module">
import {mountCareer} from '/apps/career/entry.mjs';
import {durableStore} from '/assets/js/durable-store.js';
import {updateSnapshotStore} from '/assets/js/platform-update-state.js';
import {bootstrapUpdateCoordinator,UPDATE_PENDING_KEY} from '/assets/js/platform-update-coordinator.js';
import {captureCheckpointContracts} from '/assets/js/platform-update-contracts.js';
const query=new URLSearchParams(location.search),manualFixture=query.get('fixture')==='legacy-manual';
const owner=${JSON.stringify(owner)},prior=manualFixture?${JSON.stringify(manualPrior)}:${JSON.stringify(prior)},scope={owner,activitySlug:'career-workspace',mode:'diagnostic',attemptId:'workspace-v1'};
const oldRoute=query.get('route')||'test';
const outerRoute='#activity/seminar-6/'+oldRoute,sourceBuild='11111111111111111111111111111111',targetBuild='22222222222222222222222222222222';
const store=updateSnapshotStore(),token=crypto.randomUUID(),adapterToken=crypto.randomUUID();
window.qa={submissions:0,attempts:[],manualFixture,checkpoints:[],routeChanges:[],rollbackCalls:0,restoredSignals:0,bootConfirmed:0,outerRoute,oldRoute,token,adapterToken};
window.addEventListener('rudn:update-restored',()=>qa.restoredSignals++);
try{
  const contracts=await fetch('/data/platform-contracts.json').then(response=>response.json());
  const oldValues={'answers-v8.1':JSON.stringify(prior)};
  if(manualFixture){
    oldValues['career-journey-v1']=JSON.stringify(${JSON.stringify(legacyManualJourney)});
    const privateKey='rudn-personality:'+encodeURIComponent(new URL('/',location.href).href)+':course:'+encodeURIComponent(owner)+':v1';
    localStorage.setItem(privateKey,JSON.stringify(${JSON.stringify(completedPersonality)}));
  }
  const draft=await durableStore.checkpoint({...scope,contentVersion:'career-workspace-v1',state:{values:oldValues,route:oldRoute}},{queue:false});
  const checkpointRef={attemptId:'workspace-v1',revision:draft.revision};
  await store.put({schema:1,token:adapterToken,module:'career',identity:{owner,attemptId:'workspace-v1'},revision:draft.revision,checkpointRef,targetBuild,createdAt:Date.now(),state:{
    context:'course',route:oldRoute,view:{schema:1,window:{x:0,y:0},scroll:[],details:[],focus:null},
    runtime:{schema:1,model:${JSON.stringify(MODEL_VERSION)},fields:[],route:oldRoute,questionIndex:prior.questionIndex,filters:{},authority:null,authorityTab:'overview',seminarAuthority:null,groupMode:'uploaded',groupRecords:[],groupRejected:0}}});
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
const report={engine,status:'fail',checks:[],errors:[],externalRequests:[],screenshots:[],startedAt:new Date().toISOString(),
  environment:{node:process.version,platform:process.platform,architecture:process.arch,browserTool:'Playwright',browserFallback:'Browser plugin not available',base,viewport:{width:390,height:844},launchTimeoutMs:launchTimeout},
  runtimeSha256:createHash('sha256').update(await readFile(path.join(site,'apps/career/runtime.bundle.mjs'))).digest('hex'),
  testSha256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
  legacyFixture:{sourceCommit:'bbc731814813486541108a3abacfafd1f0cfa4a8',type:'Synthetic storage-boundary fixture seeded before mount; not UI-only or blind playtest',owner,employerId:legacyManualDraft.employer,journeySha256:createHash('sha256').update(JSON.stringify(legacyManualJourney)).digest('hex')}};
let browser,lastPage,manualContext;
try{
  browser=await pw[engine].launch({headless:true,timeout:launchTimeout,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  report.environment.browserVersion=browser.version();
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
    for(let offset=0;offset<120;offset+=10){
      await page.locator(`input[data-personality-item="ipip-${String(offset+1).padStart(3,'0')}"]`).first().waitFor();
      const ids=await page.locator('#personality-root input[data-personality-item]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.personalityItem))]);
      assert.equal(ids.length,10,'Each restored personality page still contains ten items');
      for(const id of ids)if(!await page.locator(`input[data-personality-item="${id}"]:checked`).count())await page.locator(`input[data-personality-item="${id}"][value="3"]`).check();
      await page.locator('#personality-next').click();
    }
    await page.locator('#view-personality-results:not([hidden])').waitFor();
    await page.locator('#personality-continue').click();
    await page.locator('#view-preferences:not([hidden])').waitFor();
    const next=page.locator('#journey-preferences-next');await next.waitFor();
    assert.equal(await page.locator('#view-test').isVisible(),false,'An old draft cannot bypass the new preference stage');
    assert.equal(await page.locator('#journey-desired-choices [data-remove-wish]').count(),0,'Migration does not invent preferred employers');
    assert.equal(await next.isDisabled(),true);
    for(let priority=0;priority<3;priority++){
      await page.locator('[data-add-wish][aria-pressed="false"]:not([disabled])').first().click();
      assert.equal(await page.locator('#journey-desired-choices [data-remove-wish]').count(),priority+1);
      assert.equal(await next.isDisabled(),priority<2);
    }
    const desiredIds=await page.locator('#journey-desired-choices [data-remove-wish]').evaluateAll(nodes=>nodes.map(node=>node.dataset.removeWish));
    assert.equal(new Set(desiredIds).size,3);
    await next.click();await page.locator('#view-test:not([hidden])').waitFor();
    assert.equal(await page.locator('#question-text').innerText(),questions[2].text,'The original question index resumes after both new stages');
    const continued=await page.evaluate(async owner=>{
      await handle.flush();
      const saved=await (await import('/assets/js/durable-store.js')).durableStore.loadDraft({owner,activitySlug:'career-workspace',mode:'diagnostic',attemptId:'workspace-v1'});
      return {saved,checkpoints:qa.checkpoints,submissions:qa.submissions};
    },owner);
    const resumed=JSON.parse(continued.saved.state.values['answers-v8.1']);
    for(const key of ['modelVersion','questionnaireVersion','registryVersion','answers','questionIndex','prioritySectors','lowPrioritySectors','conditions','focusAreas','completedAt','resultRecordId'])assert.deepEqual(resumed[key],prior[key],'New stages preserve the existing career '+key);
    const journey=JSON.parse(continued.saved.state.values['career-journey-v1']);
    assert.deepEqual(journey.desiredIds,desiredIds,'The explicit ordered choices are saved in the same owner workspace');
    assert.equal(journey.confirmed,true);
    assert.equal(/ipip-\d{3}/.test(JSON.stringify(continued.checkpoints)),false,'Private personality responses never enter migrated career checkpoints');
    for(const checkpoint of continued.checkpoints)assert.equal(Object.keys(checkpoint.state?.values||{}).some(key=>/personality|ipip/i.test(key)),false,'The separate personality inventory is absent from synced values');
    assert.equal(continued.submissions,0);
    report.checks.push({route,status:'pass',check:'Old career checkpoint restores, both new stages remain mandatory, ordered choices save, career answers resume, no rollback or private-response sync'});
    console.log('PASS '+engine+' legacy course '+route+': restored, personality and preferences completed through UI, answers retained, no rollback or private-response sync');
    await context.close();
  }

  // The legacy-only journey fixture is a separate browser context. The two
  // empty-journey migration cases above retain their original assertions.
  manualContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await manualContext.tracing.start({screenshots:true,snapshots:true,sources:true});
  const page=await manualContext.newPage();lastPage=page;page.setDefaultTimeout(20000);
  page.on('pageerror',error=>report.errors.push(error.message));
  await manualContext.route('**/*',request=>{if(new URL(request.request().url()).origin===base)return request.continue();report.externalRequests.push(request.request().url());return request.abort();});
  await page.goto(base+'/__career-migration?route=conditions&fixture=legacy-manual');
  await page.waitForFunction(()=>document.documentElement.dataset.qaReady==='true'||document.documentElement.dataset.qaFailed==='true');
  assert.equal(await page.title(),'Career update migration · isolated QA');
  assert.equal(new URL(page.url()).pathname,'/__career-migration');
  assert.equal(await page.locator('#qa-error').isVisible(),false,await page.locator('#qa-error').textContent());
  const migrated=await page.evaluate(()=>qa);
  report.manualRestore={result:migrated.restoreResult,outerRoute:migrated.outerRoute,afterMountHash:migrated.afterMountHash,finalHash:new URL(page.url()).hash,routeChanges:migrated.routeChanges,rollbackCalls:migrated.rollbackCalls};
  assert.equal(migrated.restoreResult.status,'restored',JSON.stringify(migrated.restoreResult));
  assert.equal(migrated.submissions,0,'Restoring a legacy manual draft alone does not submit a career result');
  assert.equal(migrated.bootConfirmed,1);assert.equal(migrated.restoredSignals,1);assert.equal(migrated.rollbackCalls,0);
  assert.equal(migrated.pending,null);assert.equal(migrated.persistentPending,null);assert.equal(migrated.envelope,null);assert.equal(migrated.adapterSnapshot,null);
  assert.equal(new URL(page.url()).searchParams.has('rudnResume'),false);
  const originalSaved=JSON.parse(migrated.saved.state.values['answers-v8.1']);
  for(const key of ['answers','questionIndex','prioritySectors','lowPrioritySectors','conditions','focusAreas','completedAt','resultRecordId'])assert.deepEqual(originalSaved[key],manualPrior[key],'Manual-draft migration retains career '+key);
  const privateBefore=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('rudn-personality:'))));
  assert.equal(Object.keys(privateBefore).length,1,'The synthetic completed personality fixture is in its separate owner store');
  await page.locator('#view-conditions:not([hidden])').waitFor();
  await page.locator('#calculate-button').click();
  await page.locator('#seminar-show-authorities').click();
  await page.locator('[data-recommendation-group="preferred"]').waitFor();
  const sourceFields=['title','url','education','experience','knowledge','skills'];
  const ownerForm=page.locator('[data-role-panel="preferred-mintrud"] form[data-manual-vacancy="mintrud"]');
  async function assertExactManualForms(label){
    await ownerForm.waitFor({state:'visible'});
    assert.equal(await page.locator('[data-role-panel="preferred-mintrud"]').evaluate(node=>node.open),true,label+': old open draft opens its employer panel');
    assert.equal(await ownerForm.locator('[name="employer"]').inputValue(),legacyManualDraft.employer,label+': fixed canonical employer');
    for(const field of sourceFields)assert.equal(await ownerForm.locator(`[name="${field}"]`).inputValue(),legacyManualDraft[field],label+': exact '+field);
    const forms=await page.locator('form[data-manual-vacancy]').evaluateAll(nodes=>nodes.map(form=>({employer:form.dataset.manualVacancy,fields:Object.fromEntries(['title','url','education','experience','knowledge','skills'].map(name=>[name,form.elements[name].value]))})));
    assert.ok(forms.some(form=>form.employer!=='mintrud'),label+': other employer forms exist to check isolation');
    for(const form of forms)for(const field of sourceFields)assert.equal(form.fields[field],form.employer==='mintrud'?legacyManualDraft[field]:'',label+': '+form.employer+' '+field+' does not inherit another employer’s text');
    await page.evaluate(()=>handle.flush());
    const saved=await page.evaluate(async owner=>(await (await import('/assets/js/durable-store.js')).durableStore.loadDraft({owner,activitySlug:'career-workspace',mode:'diagnostic',attemptId:'workspace-v1'})).state.values,owner);
    const journey=JSON.parse(saved['career-journey-v1']);
    assert.equal(journey.schemaVersion,1,label+': schema 1 is retained');
    assert.deepEqual(journey.desiredIds,legacyManualJourney.desiredIds,label+': preferred employer order is retained');
    assert.equal(journey.confirmed,true);
    assert.deepEqual(Object.keys(journey.manualDrafts),['mintrud'],label+': legacy draft imports under only its canonical employer');
    for(const key of ['employer',...sourceFields,'open']){
      assert.equal(journey.manualDrafts.mintrud[key],legacyManualDraft[key],label+': keyed draft retains '+key);
      assert.equal(journey.manualDraft[key],legacyManualDraft[key],label+': legacy representation retains '+key);
    }
    report.checks.push({check:label,status:'pass',employerId:'mintrud',checkedFields:sourceFields,otherEmployerForms:forms.filter(form=>form.employer!=='mintrud').length});
  }
  await assertExactManualForms('Legacy schema-1 manual draft renders unchanged in the correct rich employer card');
  await mkdir(output,{recursive:true});
  const screenshot=path.join(output,'legacy-manual-draft-ru.png');
  await ownerForm.screenshot({path:screenshot});report.screenshots.push(screenshot);
  for(const lang of ['en','zh-Hans','ru']){
    await page.evaluate(language=>handle.setLocale(language),lang);
    await assertExactManualForms('Legacy manual draft retains exact source wording after language '+lang);
  }
  await page.evaluate(async owner=>{
    await handle.flush();await handle.destroy();
    const {mountCareer}=await import('/apps/career/entry.mjs');
    window.handle=await mountCareer(document.querySelector('#module'),{owner,context:'course',lang:'ru',initialRoute:'results',onRouteChange:route=>qa.routeChanges.push(route)});
  },owner);
  await page.locator('[data-recommendation-group="preferred"]').waitFor();
  await assertExactManualForms('Legacy manual draft and keyed import survive real destroy/remount');
  const privateAfter=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('rudn-personality:'))));
  assert.deepEqual(privateAfter,privateBefore,'Manual migration and remount do not alter private personality answers');
  const final=await page.evaluate(()=>qa);
  // Unlike the two partial-draft cases, this scenario deliberately calculates a
  // complete career result and then remounts it. Both use the local result stub.
  assert.equal(final.submissions,2,'Calculation and remount each save the same career result to the isolated backend stub');
  assert.equal(final.attempts.length,2);assert.equal(final.attempts[0].id,final.attempts[1].id,'Remount retains the career result identity');
  for(const attempt of final.attempts){assert.equal(attempt.studentKey,'career-migration-qa');assert.equal(attempt.activitySlug,'career-diagnostic');assert.equal(attempt.recordGrade,false);}
  assert.equal(/ipip-\d{3}|career-journey-v1|manualDraft/.test(JSON.stringify(final.attempts)),false,'Result transport contains neither private inventory nor manual vacancy drafts');
  report.manualResultTransport={type:'Synthetic local stub; no production submission',calls:final.submissions,sameRecordId:final.attempts[0].id===final.attempts[1].id};
  assert.equal(final.rollbackCalls,0);
  assert.equal(/ipip-\d{3}/.test(JSON.stringify(final.checkpoints)),false,'Private responses never enter manual migration checkpoints');
  for(const checkpoint of final.checkpoints)assert.equal(Object.keys(checkpoint.state?.values||{}).some(key=>/personality|ipip/i.test(key)),false,'Manual migration keeps inventory entries out of synced values');
  assert.equal(await page.locator('vite-error-overlay,nextjs-portal').count(),0);
  console.log('PASS '+engine+' legacy manualDraft: exact source wording, canonical employer import, language and remount retention, no cross-employer leakage or private-response sync');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.status='pass';
}catch(error){report.failure=error.stack||String(error);console.error(report.failure);process.exitCode=1;
  if(lastPage&&!lastPage.isClosed()){await mkdir(output,{recursive:true});await lastPage.screenshot({path:path.join(output,'failure.png'),fullPage:false}).catch(()=>{});}
}finally{
  report.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(manualContext)await manualContext.tracing.stop({path:path.join(output,'manual-migration-trace.zip')}).catch(()=>{});
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
