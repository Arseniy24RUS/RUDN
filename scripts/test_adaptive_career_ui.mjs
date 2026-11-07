/** Focused browser regression for seminar 5; real component and real local index.
 * Browser plugin not available in the authoring session; regular Playwright used.
 * The local backend below forbids production access. All owners/answers are synthetic.
 * Set PLAYWRIGHT_MODULE_PATH and, if necessary, PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 * Output is kept outside the repository: --output /absolute/path.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {completedCareerRecord} from '../site/assets/js/career-course.js';
import {MIN_ANSWERS,MAX_ANSWERS,FUNCTIONAL_MODEL_VERSION} from '../site/apps/career/assets/adaptive-model.mjs';

const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const engine=option('--browser','chromium');
assert.ok(['chromium','firefox','webkit'].includes(engine));
const repo=fileURLToPath(new URL('../',import.meta.url)),site=path.join(repo,'site');
const output=path.resolve(option('--output',path.join(repo,'../adaptive-browser-qa')));
assert.ok(!output.startsWith(repo),'QA evidence must stay outside source');
await mkdir(output,{recursive:true});
const taxonomy=JSON.parse(await readFile(path.join(site,'apps/career/data/adaptive-taxonomy.json'),'utf8'));
const indexManifestBytes=await readFile(path.join(site,'apps/career/data/adaptive-index/manifest.json'));
const indexManifest=JSON.parse(indexManifestBytes);
const questionMap=new Map(taxonomy.facets.flatMap(f=>f.questions.map(q=>[q.id,{...q,facetId:f.id}])));
const require=createRequire(import.meta.url);
const pw=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href):require('playwright');

const backendSource=`import {durableStore} from '/assets/js/durable-store.js';
export const groupOptions=()=>[];
export const backend={generation:1,authReady:true,user:null,mode:'local',connected:false,serverTimeOffset:0,
getProfile:()=>window.qa?.owner?.startsWith('student:')?{studentKey:window.qa.owner.slice(8)}:null,
isAdmin:()=>false,init:async()=>{},onStatus:()=>()=>{},status:()=>({}),globalNow:()=>Date.now(),
getAccessOverrides:()=>({}),localGrades:()=>({}),localAttempts:()=>[],getAttempts:async()=>[],
loadDraft:scope=>durableStore.loadDraft(scope),checkpoint:(input,options)=>durableStore.checkpoint(input,{...options,queue:false}),
saveAttempt:async attempt=>{window.qa.attempts.push(structuredClone(attempt));return attempt;}};`;
const harness=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seminar 5 · functional career QA</title><style>body{margin:0;background:#f4f7fb;font:16px system-ui}#module{box-sizing:border-box;max-width:1080px;padding:0 20px;margin:20px auto}#qa-error{color:#900;white-space:pre-wrap}</style></head><body><pre id="qa-error" hidden></pre><main id="module"></main><script type="module">
import {mountCareer} from '/apps/career/entry.mjs';
import {PERSONALITY_METHOD,PERSONALITY_ITEMS} from '/apps/career/assets/personality-model.mjs';
import {updateSnapshotStore} from '/assets/js/platform-update-state.js';
const query=new URLSearchParams(location.search);
window.qa={owner:query.get('owner')||'student:functional-qa',lang:query.get('lang')||'ru',context:'course',route:query.get('route')||'home',results:[],attempts:[],knowledgeCalls:0};
const personalityKey='rudn-personality:'+encodeURIComponent(location.origin+'/')+':course:'+encodeURIComponent(qa.owner)+':v1';
if(query.get('seed')==='1'&&!localStorage.getItem(personalityKey))localStorage.setItem(personalityKey,JSON.stringify({schema:1,method:PERSONALITY_METHOD.id,version:PERSONALITY_METHOD.version,answers:Object.fromEntries(PERSONALITY_ITEMS.map(item=>[item.id,3])),page:11,completedAt:'2026-11-07T00:00:00.000Z'}));
window.readFunctional=()=>{const key=Object.keys(localStorage).find(key=>key.includes(encodeURIComponent(qa.owner))&&key.endsWith('functional-career-v1'));return key?JSON.parse(localStorage.getItem(key)):null;};
window.privatePersonality=()=>localStorage.getItem(personalityKey);
window.mount=async(options={})=>{if(window.handle)await handle.destroy();document.documentElement.removeAttribute('data-qa-ready');qa.route=options.route||qa.route;qa.lang=options.lang||qa.lang;qa.context=options.context||qa.context;window.handle=await mountCareer(document.querySelector('#module'),{owner:qa.owner,context:qa.context,lang:qa.lang,initialRoute:qa.route,onResult:r=>qa.results.push(structuredClone(r)),onOpenKnowledge:()=>{qa.knowledgeCalls++;},onRouteChange:route=>{qa.route=route;const url=new URL(location.href);url.searchParams.set('route',route);history.replaceState(null,'',url);}});document.documentElement.dataset.qaReady='true';};
window.captureUpdate=async()=>{const prepared=await handle.prepareForUpdate({targetRelease:{buildId:'synthetic-functional-next'},deadlineAt:Date.now()+10000});return {prepared,snapshot:prepared.resumeToken?await updateSnapshotStore().get(prepared.resumeToken):null};};
window.restoreUpdate=async token=>{handle.commitPreparation();await mount();return handle.resumeAfterUpdate({resumeToken:token});};
try{await mount();}catch(error){const e=document.querySelector('#qa-error');e.hidden=false;e.textContent=error.stack;console.error(error);}
</script></body></html>`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.gz':'application/gzip'};
const missing=[];
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;res.setHeader('Cache-Control','no-store');
    if(pathname==='/__adaptive-qa'){res.setHeader('Content-Type',mime['.html']);return res.end(harness);}
    if(pathname==='/assets/js/backend.js'){res.setHeader('Content-Type',mime['.js']);return res.end(backendSource);}
    if(pathname==='/favicon.ico'){res.statusCode=204;return res.end();}
    const target=path.resolve(site,'.'+decodeURIComponent(pathname));if(!target.startsWith(site+path.sep))throw Error('Outside site');
    const bytes=await readFile(target);res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.setHeader('Content-Length',bytes.length);res.end(bytes);
  }catch{missing.push(req.url);res.statusCode=404;res.end('Missing QA resource');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const report={status:'running',browser:engine+' / Playwright',browserPlugin:'not available',scope:'Only seminar 5; real local component/index; isolated backend',checks:[],errors:[],externalRequests:[],screenshots:[],scenarios:[],startedAt:new Date().toISOString(),baseCommit:'0014bb612b8df95cce6e5c039dd21c001baab0aa'};
report.indexVersion=indexManifest.version;
report.manifestSHA256=createHash('sha256').update(indexManifestBytes).digest('hex');
const pass=(name,extra={})=>{report.checks.push({name,status:'pass',...extra});console.log('PASS '+name);};
let browser,lastPage;
const ready=page=>page.locator('html[data-qa-ready="true"]').waitFor({timeout:30000});
const visible=page=>page.locator('#module .view:not([hidden])');
async function shot(page,name){await page.screenshot({path:path.join(output,name+'.png'),fullPage:false});report.screenshots.push(name+'.png');}
async function createPage({owner,lang='ru',seed=true,regionIds=[],role='specialist',failPool=false}){
  const page=await browser.newPage({viewport:{width:1280,height:1000}});lastPage=page;
  const requests=[];let failed=false;
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('503'))report.errors.push(msg.text());});
  page.on('request',req=>requests.push(req.url()));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base){report.externalRequests.push(url.href);return route.abort();}
    if(failPool&&!failed&&url.pathname.includes('/adaptive-index/')&&url.pathname.endsWith('.json.gz')&&!url.pathname.includes('/details/')){failed=true;return route.fulfill({status:503,body:'Synthetic transient failure'});}
    return route.continue();
  });
  await page.goto(base+'/__adaptive-qa?owner='+encodeURIComponent(owner)+'&lang='+lang+(seed?'&seed=1':''));await ready(page);
  assert.equal(await page.title(),'Seminar 5 · functional career QA');assert.equal(await page.locator('#qa-error:not([hidden])').count(),0);
  if(!seed){
    await page.locator('#personality-root form').waitFor();
    for(let i=0;i<12;i++){
      const ids=await page.locator('#personality-root [data-personality-item]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.dataset.personalityItem))]);assert.equal(ids.length,10);
      for(const id of ids)await page.locator(`[data-personality-item="${id}"][value="3"]`).check();
      await page.locator('#personality-next').click();
    }
    await page.locator('#personality-continue').waitFor();
    assert.equal(await page.evaluate(()=>qa.results.length),0);
    pass('All 120 personality answers still complete through their own UI; no career record is created');
  }
  const privateBefore=await page.evaluate(()=>privatePersonality());
  await page.locator('#personality-continue').click();await page.locator('#adaptive-location-next').waitFor();
  assert.equal(requests.some(u=>u.includes('/adaptive-index/')&&u.endsWith('.gz')),false,'No vacancy pool loads before the setup answers');
  if(regionIds.length){
    await page.locator('input[name="adaptive-location-mode"][value="selected"]').check();
    for(const id of regionIds)await page.locator(`[data-adaptive-region="${id}"]`).check();
  }
  await page.locator('#adaptive-location-next').click();await page.locator('#adaptive-responsibility-next').waitFor();
  assert.equal(await page.locator('#adaptive-responsibility-next').isDisabled(),true,'Do not silently select a role');
  await page.locator(`[data-adaptive-responsibility="${role}"]`).check();await page.locator('#adaptive-responsibility-next').click();
  if(failPool){await page.locator('#adaptive-retry-pool').waitFor();await page.locator('#adaptive-retry-pool').click();pass('A failed index request is retryable without pretending there are no matches');}
  await page.locator('#adaptive-question').waitFor({timeout:30000});
  return {page,requests,privateBefore,owner,lang,regionIds,role};
}
async function answerCurrent(item,value){
  const{page}=item;const id=await page.locator('#adaptive-question').getAttribute('data-question-id');
  assert.ok(questionMap.has(id));
  await page.locator(`[data-adaptive-answer="${value}"]`).click();await page.locator('#adaptive-next').click();
  await page.waitForFunction(previous=>{const r=document.querySelector('#module').shadowRoot;return r.querySelector('#view-results:not([hidden])')||r.querySelector('#adaptive-question')?.dataset.questionId!==previous;},id);
  return id;
}
async function verifyVisibleSourceEvidence(item,record){
  const {page}=item;
  await page.waitForFunction(()=>{const cards=[...document.querySelector('#module').shadowRoot.querySelectorAll('[data-adaptive-vacancy]')];return cards.length>0&&cards.every(card=>card.querySelector('[data-adaptive-evidence]'));});
  const cards=await page.locator('[data-adaptive-vacancy]').evaluateAll(nodes=>nodes.map(node=>({
    id:node.dataset.adaptiveVacancy,
    evidence:[...node.querySelectorAll('[data-adaptive-evidence]')].map(e=>({featureId:e.dataset.adaptiveEvidence,category:e.dataset.evidenceCategory,text:e.textContent}))
  })));
  const answers=new Map((await page.evaluate(()=>readFunctional().answers)).map(answer=>[answer.questionId,answer.value]));
  const broad=new Map(taxonomy.facets.map(facet=>[facet.id,facet.questions.find((q,index)=>q.broad===true||index===0).id]));
  const details=new Map();
  for(const url of new Set(item.requests.filter(value=>new URL(value).pathname.includes('/adaptive-index/details/')&&new URL(value).pathname.endsWith('.json.gz')))){
    const file=path.join(site,new URL(url).pathname.replace(/^\//,''));
    const payload=JSON.parse(gunzipSync(await readFile(file)));
    assert.equal(payload.schemaVersion,2);
    for(const detail of payload.rows)details.set(detail.id,detail);
  }
  const compact=value=>value.replace(/\s+/g,' ').trim();
  for(const card of cards){
    assert.ok(card.evidence.length>=1&&card.evidence.length<=2,'One or two source fragments per result');
    const detail=details.get(card.id);assert.ok(detail,'Visible evidence belongs to a loaded vacancy');
    const recommendation=record.ranking.find(row=>row.vacancyId===card.id);assert.ok(recommendation);
    assert.equal(detail.sourceURL,recommendation.sourceURL);
    for(const item of card.evidence){
      assert.ok(['duties','skills','knowledge'].includes(item.category));
      const questionId=questionMap.has(item.featureId)?item.featureId:broad.get(item.featureId);
      assert.ok(answers.get(questionId)>=4,'A displayed function must correspond to an expressed positive interest');
      const text=compact(item.text).replace(/…$/,'');
      assert.ok(detail.evidence.some(source=>source.featureId===item.featureId&&source.category===item.category&&compact(source.sourceText).startsWith(text)&&typeof source.sourcePointer==='string'),'Displayed text must be an exact source excerpt for the same functional feature');
    }
  }
  pass('Every result explains positive functional matches with at most two exact source excerpts: '+item.owner,{vacancies:cards.length,fragments:cards.reduce((sum,card)=>sum+card.evidence.length,0)});
}
async function finish(item,likes,{neutral=false,partialCheck=false}={}){
  const{page}=item;const start=Date.now();let answered=0;const trace=[];
  while(await page.locator('#view-test:not([hidden]) #adaptive-question').count()){
    const id=await page.locator('#adaptive-question').getAttribute('data-question-id');const q=questionMap.get(id);
    const expected=q.text[item.lang];assert.equal(await page.locator('#adaptive-question').innerText(),expected);
    if(partialCheck&&answered===5){
      await page.locator('[data-adaptive-answer="4"]').click();const draft=await page.evaluate(()=>readFunctional());
      await page.reload();await ready(page);await page.locator('#adaptive-question').waitFor();
      assert.deepEqual(await page.evaluate(()=>readFunctional().answers),draft.answers);assert.equal(await page.locator('[data-adaptive-answer="4"]').getAttribute('aria-checked'),'true');
      assert.equal(await page.locator('#adaptive-question').getAttribute('data-question-id'),id);
      pass('A reload restores the current adaptive question and the selected, unsubmitted answer');
    }
    trace.push(await answerCurrent(item,neutral?3:likes.includes(q.facetId)?5:2));answered++;
    assert.ok(answered<=MAX_ANSWERS,'No endless questionnaire');
    if(partialCheck&&answered===8){
      const old=await page.evaluate(()=>readFunctional().answers);
      await page.locator('#adaptive-back').click();
      assert.equal(await page.evaluate(()=>readFunctional().answers.length),old.length-1);
      assert.equal(await page.locator('#adaptive-question').getAttribute('data-question-id'),old.at(-1).questionId);
      await answerCurrent(item,old.at(-1).value);
      pass('Back restores the previous answer and discards the obsolete adaptive continuation');
    }
    if(partialCheck&&answered===12){
      const before=await page.evaluate(()=>readFunctional());const current=await page.locator('#adaptive-question').getAttribute('data-question-id');
      const captured=await page.evaluate(()=>captureUpdate());assert.equal(captured.prepared.status,'ready',JSON.stringify(captured.prepared));
      assert.ok(captured.prepared.resumeToken);
      const restored=await page.evaluate(token=>restoreUpdate(token),captured.prepared.resumeToken);assert.equal(restored.status,'restored');
      await page.locator('#adaptive-question').waitFor();assert.equal(await page.locator('#adaptive-question').getAttribute('data-question-id'),current);
      assert.deepEqual(await page.evaluate(()=>readFunctional().answers),before.answers);
      pass('The platform update checkpoint restores the same adaptive path without exposing personality answers');
    }
  }
  await page.locator('#adaptive-open-knowledge').waitFor();
  await page.waitForFunction(()=>qa.results.length>0);
  const record=await page.evaluate(()=>qa.results.at(-1));assert.ok(completedCareerRecord(record));
  assert.ok(record.answerCount>=MIN_ANSWERS&&record.answerCount<=MAX_ANSWERS);assert.equal(new Set(trace).size,trace.length);
  assert.equal(record.modelVersion,FUNCTIONAL_MODEL_VERSION);assert.equal(record.featureBasis,'published-source-content');
  assert.equal(record.registryVersion,indexManifest.version,'The browser result must use the exact tested source snapshot');
  assert.ok(record.ranking.every(row=>!['title','department'].includes(row.evidenceLevel)));
  assert.equal(await page.evaluate(()=>privatePersonality()),item.privateBefore,'Career flow must not mutate personality answers');
  if(item.regionIds.length)assert.ok(record.ranking.every(row=>item.regionIds.includes(row.regionId)));
  if(item.role!=='all')assert.ok(record.ranking.every(row=>row.responsibilityLevel===item.role));
  assert.equal(JSON.stringify(record).includes('personality'),false);assert.equal(JSON.stringify(record).includes('ipip-'),false);
  if(neutral){assert.equal(record.resultStatus,'no-preference');assert.equal(record.ranking.length,0);assert.equal(await page.locator('[data-adaptive-vacancy]').count(),0);}
  else assert.ok(record.ranking.length>0,'A specific expressed profile should have real results in this scenario');
  assert.equal(item.requests.some(url=>url.includes('/vacancies/bank/')),false,'Do not download the half-million vacancy bank at runtime');
  assert.equal(item.requests.some(url=>url.includes('/adaptive-index/all.json.gz')),false,'The browser uses bounded national parts, never the full audit payload');
  if(item.regionIds.length)assert.equal(item.requests.some(url=>url.includes('/adaptive-index/national/')),false,'A regional search must not silently load the national pool');
  else assert.ok(item.requests.some(url=>url.includes('/adaptive-index/national/')),'Unrestricted search covers the national candidate parts');
  if(!neutral)await verifyVisibleSourceEvidence(item,record);
  await page.locator('#adaptive-open-knowledge').click();await page.waitForFunction(()=>qa.knowledgeCalls===1);
  const scenario={owner:item.owner,lang:item.lang,regions:item.regionIds,responsibility:item.role,answers:record.answerCount,elapsedMs:Date.now()-start,resultStatus:record.resultStatus,ranking:record.ranking,trace};report.scenarios.push(scenario);
  pass('Complete functional flow: '+item.owner,{answers:record.answerCount,roles:record.ranking.length,lang:item.lang});
  return record;
}
async function layout(page,width,name){
  await page.setViewportSize({width,height:width<500?844:1000});await page.evaluate(()=>scrollTo(0,0));
  const sizes=await page.evaluate(()=>({view:innerWidth,content:document.documentElement.scrollWidth}));assert.ok(sizes.content<=sizes.view+1,JSON.stringify(sizes));
  assert.equal(await page.locator('#qa-error:not([hidden])').count(),0);assert.ok((await visible(page).innerText()).trim().length>20);
  await shot(page,name);pass('Rendered layout '+name,{width});
}
try{
  const executablePath=engine==='chromium'?process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE:null;
  if(executablePath)await chmod(executablePath,0o700);
  browser=await pw[engine].launch({headless:true,...(executablePath?{executablePath}:{}),...(engine==='chromium'?{args:['--disable-dev-shm-usage','--disable-gpu']}:{}),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  const main=await createPage({owner:'student:functional-digital',seed:false,failPool:true});
  await main.page.evaluate(()=>{
    const key=Object.keys(localStorage).find(key=>key.includes(encodeURIComponent(qa.owner))&&key.endsWith('functional-career-v1'));
    const saved=JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key,JSON.stringify({...saved,modelVersion:'functional-1.0.0',questionnaireVersion:'1.0.0',indexVersion:'functional-1.0.0-legacy',
      answers:[{questionId:'policy_analysis_1',value:5}],pending:{questionId:'policy_analysis_2',value:4}}));
  });
  await main.page.reload();await ready(main.page);await main.page.locator('#adaptive-question').waitFor({timeout:30000});
  assert.equal(await main.page.locator('#adaptive-question').getAttribute('data-question-id'),'policy_analysis_1');
  assert.equal(await main.page.locator('[data-adaptive-answer][aria-checked="true"]').count(),0,'Old pending values must not enter the new question bank');
  // Migration stays dirty until the first explicit save or platform checkpoint.
  await main.page.locator('[data-adaptive-answer="3"]').click();
  const migrated=await main.page.evaluate(()=>readFunctional());
  assert.equal(migrated.modelVersion,FUNCTIONAL_MODEL_VERSION);assert.deepEqual(migrated.answers,[]);assert.deepEqual(migrated.pending,{questionId:'policy_analysis_1',value:3});
  assert.deepEqual(migrated.regionIds,[]);assert.equal(migrated.responsibilityPreference,'specialist');assert.equal(migrated.setupComplete,true);
  pass('A recognised v1 draft keeps explicit setup choices and starts the changed question bank without reusing old answers');
  await layout(main.page,1280,'question-desktop');await layout(main.page,390,'question-mobile');await main.page.setViewportSize({width:1280,height:1000});
  const mainResult=await finish(main,['digital_systems','information_security'],{partialCheck:true});
  await layout(main.page,1280,'result-desktop');await layout(main.page,390,'result-mobile');
  const oldId=mainResult.recordId;await main.page.locator('#adaptive-edit').click();assert.equal(await main.page.evaluate(()=>readFunctional().completedAt),null);
  const q=questionMap.get(await main.page.locator('#adaptive-question').getAttribute('data-question-id'));await answerCurrent(main,['digital_systems','information_security'].includes(q.facetId)?5:2);
  await main.page.locator('#adaptive-open-knowledge').waitFor();assert.notEqual(await main.page.evaluate(()=>readFunctional().resultRecordId),oldId);
  pass('Editing a completed result invalidates and replaces its completion identifier');
  const courseBefore=await main.page.evaluate(()=>readFunctional());
  await main.page.evaluate(()=>mount({context:'free',route:'test'}));await main.page.locator('#question-text').waitFor();
  assert.ok((await main.page.locator('#question-counter').innerText()).includes('27'));await main.page.locator('[data-answer="4"]').click();await main.page.locator('#question-next').click();
  await main.page.evaluate(()=>mount({context:'course',route:'results'}));await main.page.locator('#adaptive-open-knowledge').waitFor();
  assert.deepEqual(await main.page.evaluate(()=>readFunctional().answers),courseBefore.answers);
  assert.equal(await main.page.evaluate(()=>readFunctional().resultRecordId),courseBefore.resultRecordId);
  pass('Course functional answers and the separate free career workspace remain isolated');
  const mordovia=await createPage({owner:'student:functional-mordovia',regionIds:['ru-13']});await finish(mordovia,['budget_planning','accounting','tax_revenue']);
  assert.ok(mordovia.requests.some(u=>u.includes('/regions/ru-13.json.gz')));assert.equal(mordovia.requests.some(u=>u.includes('/adaptive-index/all.json.gz')),false);
  pass('Mordovia loads its own index shard and keeps every recommendation within the selected region');
  const english=await createPage({owner:'student:functional-english',lang:'en',regionIds:['ru-77','ru-78']});await finish(english,['human_resources']);await layout(english.page,390,'english-result-mobile');
  const chinese=await createPage({owner:'student:functional-chinese',lang:'zh-Hans',regionIds:['ru-13'],role:'all'});await layout(chinese.page,390,'chinese-question-mobile');await finish(chinese,[],{neutral:true});
  pass('Three interface languages, independent owners, mixed regions and an all-neutral profile');
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert.equal(report.externalRequests.length,0,JSON.stringify(report.externalRequests));assert.equal(missing.length,0,JSON.stringify(missing));
  report.status='pass';
}catch(error){report.status='fail';report.failure=error.stack;console.error(error.stack);if(lastPage)await shot(lastPage,'failure').catch(()=>{});process.exitCode=1;}
finally{
  report.finishedAt=new Date().toISOString();report.runtimeSHA256=createHash('sha256').update(await readFile(path.join(site,'apps/career/runtime.bundle.mjs'))).digest('hex');
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();server.close();
}
