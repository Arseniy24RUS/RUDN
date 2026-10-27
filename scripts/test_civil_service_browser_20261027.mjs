/** Native quiz UI QA. Synthetic fixture content is served only by this local
 * test server; production JS/CSS and the real durable IndexedDB store are used. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),args=new Set(process.argv.slice(2)),site=path.resolve(fileURLToPath(new URL('../site/',import.meta.url)));
const output=path.resolve(process.env.CIVIL_QA_OUTPUT||fileURLToPath(new URL('../../evidence/runs/20261027-civil-service-qa/',import.meta.url)));
const run=path.join(output,'browser-'+new Date().toISOString().replace(/[:.]/g,'-'));
const sectionIds=['russian','constitution','civil-service','anti-corruption','ict'];
function fixture(version=1){return {
 schemaVersion:1,contentVersion:`TEST-ONLY-synthetic-v${version}`,reviewedAt:'2026-10-27',
 source:{url:'https://example.invalid/test-only',title:{ru:'Синтетические вопросы только для QA',en:'Synthetic QA questions only',zh:'仅供测试的模拟题目'},version:'TEST-ONLY'},
 sections:sectionIds.map((id,index)=>({id,label:{ru:`Тестовая тема ${index+1}`,en:`Synthetic topic ${index+1}`,zh:`测试主题 ${index+1}`}})),
 questions:sectionIds.flatMap(sectionId=>Array.from({length:12},(_,index)=>({
  id:`test-only:${sectionId}:${index}`,sectionId,number:index+1,
  stem:{ru:`Тестовый вопрос ${index+1}. Выберите указанные в тестовых данных варианты: это синтетический материал для проверки интерфейса, а не учебное содержание.`,en:`Synthetic question ${index+1}. Select the options identified in the test data. This is synthetic interface testing content, not learning material.`,zh:`测试题目 ${index+1}。请选择测试数据中指定的选项。这是用于检验界面的模拟内容，不是教学材料。`},
  options:['a','b','c','d'].map(id=>({id,text:{ru:`Тестовый вариант ${id.toUpperCase()} с достаточно длинной подписью для проверки мобильного переноса строк.`,en:`Synthetic option ${id.toUpperCase()} with a sufficiently long label to verify wrapping on a narrow mobile screen.`,zh:`测试选项 ${id.toUpperCase()}，附有较长的文字，用来检查在窄屏手机上是否能够正常换行。`}})),
  correctOptionIds:index%3===0?['a','c']:['b'],review:{status:'verified',kind:'synthetic-test-only'}
 })))
};}
const actualBankText=args.has('--actual')?await readFile(path.join(site,'data/civil-service/mintrud-v4-reviewed.json'),'utf8'):null;
const fixtureBank=fixture(),byId=new Map(fixtureBank.questions.map(q=>[q.id,q]));
const courseBackend=`import {durableStore as store} from '/assets/js/durable-store.js';
const owner=()=>localStorage.getItem('qa-course-owner')||'guest';
const reorderKeys=value=>Array.isArray(value)?value.map(reorderKeys):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorderKeys(v)])):value;
export const groupOptions=()=>[];
export const backend={authReady:true,mode:'local',connected:false,serverTimeOffset:0,
get user(){return {uid:owner().split(':').slice(1).join(':')||'guest'}},
getProfile:()=>owner().startsWith('student:')?{studentKey:owner().slice(8),fullName:'Synthetic QA',group:'TEST'}:null,
isAdmin:()=>owner().startsWith('teacher:'),init:async()=>{},onStatus:()=>()=>{},status:()=>({}),globalNow:()=>Date.now(),getAccessOverrides:()=>({}),localGrades:()=>JSON.parse(localStorage.getItem('qa-course-grades')||'{}'),localAttempts:()=>JSON.parse(localStorage.getItem('qa-course-attempts')||'[]'),
loadDraft:async scope=>{const value=await store.loadDraft(scope);return localStorage.getItem('qa-reorder-keys')?reorderKeys(value):value},checkpoint:async(scope,options)=>{if(window.qa?.failSave)throw Error('Synthetic save failure');return store.checkpoint(scope,options)},
saveAttempt:async record=>{if(window.qa?.failComplete)throw Error('Synthetic remote failure');if(owner()!=='student:'+record.studentKey)throw Error('Wrong owner submitted');window.qa.completions++;const records=backend.localAttempts(),old=records.find(item=>item.id===record.id);if(old&&JSON.stringify(old)!==JSON.stringify(record))throw Error('Immutable attempt overwritten');if(!old){records.push(structuredClone(record));localStorage.setItem('qa-course-attempts',JSON.stringify(records))}const key=record.studentKey+':'+record.activitySlug,grades=backend.localGrades();if(record.recordGrade!==false)grades[key]=Math.max(grades[key]||0,record.points);localStorage.setItem('qa-course-grades',JSON.stringify(grades));window.qa.submissions.push(structuredClone(record));return {...record,saveStatus:{durable:true,state:'saved'}}}};`;
const courseHarness=`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Civil-service course adapter · isolated QA</title><link rel="stylesheet" href="/assets/css/civil-service-test.css"><style>body{margin:0;background:#f5f8fb;font-family:system-ui,sans-serif}#controls{padding:8px;display:flex;gap:8px;flex-wrap:wrap}#quiz{max-width:1144px;margin:20px auto;padding:0 12px}#qa-error{white-space:pre-wrap;color:#a00}</style><nav id="controls"><button data-owner="student:alpha">Student A</button><button data-owner="student:beta">Student B</button><button data-owner="teacher:qa">Teacher</button><button data-owner="guest">Guest</button></nav><pre id="qa-error" hidden></pre><main id="quiz"></main>
<script type="module">import {mountCivilServiceCourse} from '/assets/js/civil-service-course.mjs';const p=new URLSearchParams(location.search);if(p.has('owner'))localStorage.setItem('qa-course-owner',p.get('owner'));const owner=localStorage.getItem('qa-course-owner')||'guest';window.qa={completions:0,submissions:[],failSave:false,failComplete:false};window.qaScope={owner:owner==='guest'?'guest:civil-service':owner,activitySlug:p.get('slug')||'seminar-5',mode:'civil-service-knowledge-v1'};
for(const button of document.querySelectorAll('[data-owner]'))button.onclick=()=>{localStorage.setItem('qa-course-owner',button.dataset.owner);dispatchEvent(new CustomEvent('rudn:identitychange'));};
try{const bank=await(await fetch(p.get('bank')||('/qa-fixture.json?v='+(p.get('v')||1)))).json();window.qa.bank=bank;window.handle=await mountCivilServiceCourse(document.querySelector('#quiz'),{owner,activitySlug:p.get('slug')||'seminar-5',locale:p.get('lang')||'ru',bank});document.documentElement.dataset.qaReady='true';}catch(error){document.querySelector('#qa-error').hidden=false;document.querySelector('#qa-error').textContent=error.stack;console.error(error);}</script>`;
const harness=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Civil-service quiz · isolated native QA</title><link rel="stylesheet" href="/assets/css/civil-service-test.css"><style>body{margin:0;background:#f5f8fb;font-family:system-ui,sans-serif}#controls{display:flex;gap:8px;flex-wrap:wrap;padding:8px;background:#fff}#controls button{font:inherit;padding:6px}#quiz{max-width:1144px;width:100%;box-sizing:border-box;margin:18px auto;padding:0 12px}#qa-error{white-space:pre-wrap;color:#a00}</style>
<nav id="controls" aria-label="QA host"><button data-locale="ru">RU</button><button data-locale="en">EN</button><button data-locale="zh">中文</button><button id="fail-save">Toggle save failure</button><button id="fail-complete">Toggle submission failure</button></nav><p id="qa-error" hidden></p><main id="quiz"></main>
<script type="module">import {mountCivilServiceTest} from '/assets/js/civil-service-test.mjs';import {durableStore as store} from '/assets/js/durable-store.js';
const params=new URLSearchParams(location.search),scope={owner:'guest:civil-qa',activitySlug:'civil-qa-workspace',mode:'quiz',attemptId:'workspace-v1'};
window.qa={failSave:false,failComplete:false,checkpoints:0,completions:0,submissions:[],bank:null};window.qaScope=scope;
document.querySelector('#fail-save').onclick=()=>window.qa.failSave=!window.qa.failSave;document.querySelector('#fail-complete').onclick=()=>window.qa.failComplete=!window.qa.failComplete;
try{const bank=await (await fetch(params.get('bank')||('/qa-fixture.json?v='+(params.get('v')||1)))).json();window.qa.bank=bank;
const historicalBank=params.has('historical')?await (await fetch('/qa-fixture.json?v=1')).json():null;
const stored=await store.loadDraft(scope);window.qaInitialStored=stored?.state?.attempt||null;let initialAttempt=stored?.state?.attempt||null;if(!initialAttempt&&params.has('seed')){const {createAttempt}=await import('/assets/js/civil-service-model.mjs');initialAttempt=createAttempt(bank,{seed:Number(params.get('seed')),id:'qa-known-valid-seed-'+params.get('seed'),startedAt:Date.now()});}
window.handle=await mountCivilServiceTest(document.querySelector('#quiz'),{bank,historicalBank,locale:params.get('lang')||'ru',readOnly:params.has('readonly'),initialAttempt,
onCheckpoint:async attempt=>{window.qa.checkpoints++;if(window.qa.failSave)throw Error('Synthetic local-save failure');const saved=await store.checkpoint({...scope,contentVersion:bank.contentVersion,state:{attempt}},{queue:false});if(!saved?.saveStatus?.durable)throw Error('QA checkpoint not durable');window.qa.lastCheckpoint=structuredClone(attempt);},
onComplete:async({attempt,result})=>{window.qa.completions++;if(window.qa.failComplete)throw Error('Synthetic remote-submission failure');const receipt={id:attempt.id,activitySlug:'civil-qa-result',type:'synthetic-quiz',createdAt:new Date().toISOString(),points:result.points,recordGrade:false};await store.complete({owner:'guest:civil-qa',activitySlug:'civil-qa-result',mode:'result',attemptId:attempt.id,state:{attempt},attempt:receipt},{queue:false});window.qa.submissions.push({id:attempt.id,result:structuredClone(result)});}});
for(const button of document.querySelectorAll('[data-locale]'))button.onclick=()=>window.handle.setLocale(button.dataset.locale);
document.documentElement.dataset.qaReady='true';
}catch(error){document.querySelector('#qa-error').hidden=false;document.querySelector('#qa-error').textContent=error.stack;console.error(error);}</script>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/qa-civil.html'||url.pathname==='/qa-course.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'");return res.end(url.pathname==='/qa-course.html'?courseHarness:harness);}
 if(url.pathname==='/assets/js/backend.js'){res.setHeader('Content-Type','text/javascript');return res.end(courseBackend);}
 if(url.pathname==='/qa-actual-bank.json'&&actualBankText){res.setHeader('Content-Type','application/json');return res.end(actualBankText);}
 if(url.pathname==='/qa-fixture.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(fixture(Number(url.searchParams.get('v')||1))));}
 if(url.pathname==='/favicon.ico'){res.statusCode=204;return res.end();}
 const target=path.resolve(site,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(site+path.sep))throw Error('outside site');
 res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(await readFile(target));
 }catch{res.statusCode=404;res.end('Missing local QA file');}});
await new Promise(resolve=>server.listen(Number(process.env.CIVIL_QA_PORT||8788),'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;console.log('Civil service QA: '+base+'/qa-civil.html');
if(args.has('--serve'))await new Promise(()=>{});
await mkdir(run,{recursive:true});
const pw=require(process.env.PLAYWRIGHT_PATH||'playwright');
const report={status:'not-run',agent:'/root/career_priority_qa',startedAt:new Date().toISOString(),base,fixture:'TEST-ONLY synthetic 60-question bank unless a case explicitly names a production bank.',method:'Actual native UI and durable IndexedDB; local callbacks emulate network failures, no production backend requests.',cases:[],errors:[],screenshots:[],hashes:{}};
for(const relative of ['assets/js/civil-service-model.mjs','assets/js/civil-service-test.mjs','assets/js/civil-service-course.mjs','assets/css/civil-service-test.css'])report.hashes[relative]=createHash('sha256').update(await readFile(path.join(site,relative))).digest('hex');
let browser,lastPage,traceContext;
const pass=(name,details={})=>{report.cases.push({name,status:'pass',...details});console.log('PASS '+name);};
const screenshot=async(page,name)=>{const file=path.join(run,name+'.png');await page.screenshot({path:file,fullPage:false});report.screenshots.push(file);};
const attempt=page=>page.evaluate(()=>window.handle.flush());
const persisted=page=>page.evaluate(async()=>{const {durableStore}=await import('/assets/js/durable-store.js');await durableStore.flush();return (await durableStore.loadDraft(window.qaScope))?.state?.attempt;});
const click=async(page,action)=>page.locator(`[data-action="${action}"]`).first().click();
async function mount({viewport={width:390,height:844},lang='ru',query='',context=null,course=false}={}){
 context||=await browser.newContext({viewport,hasTouch:true,serviceWorkers:'block',acceptDownloads:true});
 const page=await context.newPage(),errors=[];lastPage=page;page.setDefaultTimeout(12000);
 page.on('pageerror',error=>errors.push(error.stack||String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(base+`/${course?'qa-course':'qa-civil'}.html?lang=${lang}${query}`);
 try{await page.locator('html[data-qa-ready=true]').waitFor();}catch(error){report.errors.push(...errors);throw error;}
 assert.equal(await page.title(),course?'Civil-service course adapter · isolated QA':'Civil-service quiz · isolated native QA');assert(await page.locator('.civil-service-test').isVisible());
 return {page,context,errors};
}
async function answerCorrect(page){const current=await attempt(page);const q=byId.get(current.questionIds[current.currentIndex])||await page.evaluate(id=>window.qa.bank.questions.find(q=>q.id===id),current.questionIds[current.currentIndex]);for(const id of q.correctOptionIds)await page.locator(`input[data-option="${id}"]`).check();return q;}
async function openMap(page){const details=page.locator('.cst-overview');if(!await details.getAttribute('open'))await details.locator('summary').click();}
async function finishSkipped(page){await click(page,'finish');await page.locator('dialog[open]').waitFor();await click(page,'confirm-finish');await page.locator('.cst-result-hero').waitFor();}
const courseDraft=page=>page.evaluate(async()=>{await window.handle.flush();const {durableStore}=await import('/assets/js/durable-store.js');return durableStore.loadDraft(window.qaScope);});
async function courseAnswer(page){const current=(await courseDraft(page)).state.civilServiceAttempt;const q=byId.get(current.questionIds[current.currentIndex])||await page.evaluate(id=>window.qa.bank.questions.find(q=>q.id===id),current.questionIds[current.currentIndex]);for(const id of q.correctOptionIds)await page.locator(`input[data-option="${id}"]`).check();}
async function courseCases(){
 {
  const {page,context,errors}=await mount({course:true,query:'&owner=student:alpha'});await click(page,'start');await courseAnswer(page);await courseDraft(page);
  await page.evaluate(()=>window.qa.failComplete=true);await finishSkipped(page);await page.locator('[data-complete-warning]:not([hidden])').waitFor();
  const retained=(await courseDraft(page)).state.resultAttempt;assert(retained);assert.equal(await page.locator('[data-action="new"]').isDisabled(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('qa-course-attempts')),null);
  await page.evaluate(()=>window.qa.failComplete=false);await page.locator('[data-action="submit-result"]:visible').first().click();await page.waitForFunction(()=>!document.querySelector('[data-action="new"]').disabled);
  const after=(await courseDraft(page)).state.resultAttempt;assert.deepEqual(after,retained);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-course-attempts')).length),1);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-course-attempts'))[0].id),retained.id);assert.deepEqual(errors,[]);pass('Actual adapter retries a failed grade submission with exactly the retained immutable attempt ID, timestamp, answers and points');await context.close();
 }
 {
  const {page,context,errors}=await mount({course:true,query:'&owner=student:alpha'});traceContext=context;await context.tracing.start({screenshots:true,snapshots:true,sources:false});
  await click(page,'start');for(let i=0;i<3;i++){await courseAnswer(page);await click(page,'next');}await courseDraft(page);await finishSkipped(page);await courseDraft(page);
  let stored=await courseDraft(page);assert.equal(stored.state.resultAttempt.points,0.38);assert.equal(stored.state.resultAttempt.recordGrade,true);assert.equal(stored.state.resultAttempt.studentKey,'alpha');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-course-grades'))['alpha:seminar-5']),0.38);assert.equal(await page.locator('[data-action="new"]').isEnabled(),true);pass('Actual course adapter automatically records student 3/40 = 0.38 with durable immutable result');
  const old=stored.state.resultAttempt,id=old.id;await page.reload();await page.locator('html[data-qa-ready=true]').waitFor();
  assert.equal(await page.locator('[data-action="new"]').isEnabled(),true,'Completed restore acknowledges the already stored result');assert.equal(await page.locator('[data-action="submit-result"]:visible').count(),0,'Completed restore must not request duplicate submission');
  assert.equal((await courseDraft(page)).state.resultAttempt.id,id);assert.equal(await page.evaluate(()=>window.qa.completions),0);pass('Actual course adapter completed reload retains acknowledged state without duplicate submit');
  await click(page,'new');for(let i=0;i<40;i++){await courseAnswer(page);if(i<39)await click(page,'next');}await courseDraft(page);await click(page,'finish');await page.locator('.cst-result-hero').waitFor();await courseDraft(page);
  stored=await courseDraft(page);assert.equal(stored.state.resultAttempt.points,5);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-course-grades'))['alpha:seminar-5']),5);
  const attempts=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-course-attempts')));assert.equal(attempts.length,2);assert.deepEqual(attempts.find(a=>a.id===id),old);await screenshot(page,'course-student-5points');pass('Actual adapter records 5/5 best grade and retains the earlier immutable attempt');
  assert.deepEqual(errors,[]);await context.tracing.stop({path:path.join(run,'course-adapter-trace.zip')});traceContext=null;await context.close();
 }
 for(const owner of ['guest','teacher:qa']){
  const {page,context,errors}=await mount({course:true,query:'&owner='+encodeURIComponent(owner)});await click(page,'start');await courseAnswer(page);await courseDraft(page);await finishSkipped(page);await courseDraft(page);
  const stored=await courseDraft(page);assert.equal(stored.state.resultAttempt.recordGrade,false);assert.equal('studentKey' in stored.state.resultAttempt,false);assert.equal(await page.evaluate(()=>localStorage.getItem('qa-course-grades')),null);assert.equal(await page.evaluate(()=>window.qa.completions),0);pass(`Actual adapter ${owner} completes locally without a gradebook write`);assert.deepEqual(errors,[]);await context.close();
 }
 {
  const {page,context,errors}=await mount({course:true,query:'&owner=student:alpha'});await click(page,'start');await courseAnswer(page);const before=await courseDraft(page);
  await page.locator('[data-owner="student:beta"]').click();await click(page,'next');await page.locator('[data-save-warning]:not([hidden])').waitFor();
  const state=await page.evaluate(async()=>{const {durableStore}=await import('/assets/js/durable-store.js');return {a:await durableStore.loadDraft({...window.qaScope,owner:'student:alpha'}),b:await durableStore.loadDraft({...window.qaScope,owner:'student:beta'}),submits:window.qa.completions};});
  assert.deepEqual(state.a.state,before.state);assert.equal(state.b,null);assert.equal(state.submits,0);pass('Identity switch blocks old component writes to either student draft or gradebook');assert.deepEqual(errors,[]);await context.close();
 }
 {
  const one=await mount({course:true,query:'&owner=student:alpha'});await click(one.page,'start');await courseAnswer(one.page);const original=await courseDraft(one.page);
  const two=await mount({course:true,query:'&owner=student:alpha',context:one.context});await click(one.page,'next');await courseAnswer(one.page);const newer=await courseDraft(one.page);
  await click(two.page,'next');await two.page.locator('[data-save-warning]:not([hidden])').waitFor();
  const retained=await one.page.evaluate(async()=>{const {durableStore}=await import('/assets/js/durable-store.js');return durableStore.loadDraft(window.qaScope);});
  assert.deepEqual(retained.state,newer.state);assert.equal(retained.attemptId,original.attemptId);pass('Two-tab stale revision cannot overwrite the newer checkpoint');assert.deepEqual(one.errors,[]);assert.deepEqual(two.errors,[]);await one.context.close();
 }
 {
  const {page,context,errors}=await mount({course:true,query:'&owner=student:alpha'});await click(page,'start');await courseAnswer(page);const original=await courseDraft(page);
  await page.goto(base+'/qa-course.html?v=2&owner=student:alpha');await page.locator('html[data-qa-ready=true]').waitFor();assert.deepEqual((await courseDraft(page)).state.civilServiceAttempt,original.state.civilServiceAttempt);
  await finishSkipped(page);await courseDraft(page);await click(page,'new');const next=await courseDraft(page);assert.equal(next.state.civilServiceAttempt.contentVersion,'TEST-ONLY-synthetic-v2');assert.notEqual(next.attemptId,original.attemptId);pass('Actual adapter restores stored old-bank paper and uses current bank for a new attempt');assert.deepEqual(errors,[]);await context.close();
 }
}

async function actualCases(){
 const smoke=args.has('--actual-smoke');
 const bank=JSON.parse(actualBankText),active=bank.questions.filter(q=>q.review.status==='verified');
 report.bank={contentVersion:bank.contentVersion,total:bank.questions.length,active:active.length,sha256:createHash('sha256').update(actualBankText).digest('hex')};
 assert.equal(bank.questions.length,700);for(const id of sectionIds)assert(active.filter(q=>q.sectionId===id).length>=8);
 const course=JSON.parse(await readFile(path.join(site,'data/course.json'),'utf8')),topic=course.topics.find(t=>t.seminar.module==='career');
 assert.equal(topic.number,5);assert.equal(topic.seminar.slug,'seminar-6');
 let imageDimensions={};
 if(smoke){
  const candidates=active.flatMap(q=>['ru','en','zh'].map(lang=>({q,lang,stemLength:q.stem[lang].length,optionLength:Math.max(...q.options.map(o=>o.text[lang].length))})));
  const longestStem=[...candidates].sort((a,b)=>b.stemLength-a.stemLength)[0],longestOption=[...candidates].sort((a,b)=>b.optionLength-a.optionLength)[0];
  const {createAttempt}=await import('../site/assets/js/civil-service-model.mjs');
  for(const [kind,chosen] of [['stem',longestStem],['option',longestOption]]){
   let seed=0,paper;for(;seed<100000;seed++){paper=createAttempt(bank,{seed,id:'qa-longest-seed-search',startedAt:0});if(paper.questionIds.includes(chosen.q.id))break;}assert(seed<100000);
   const {page,context,errors}=await mount({lang:chosen.lang,viewport:{width:320,height:568},query:`&bank=/qa-actual-bank.json&seed=${seed}`});
   const started=await attempt(page);assert.deepEqual(started.questionIds,paper.questionIds);await openMap(page);await page.locator(`[data-question-index="${started.questionIds.indexOf(chosen.q.id)}"]`).click();
   await page.locator('.cst-question-card').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,`actual-longest-${kind}-320x568`);
   const box=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...document.querySelectorAll('.cst-option,.cst-question-card h3')].filter(el=>el.getBoundingClientRect().right>innerWidth+1||el.getBoundingClientRect().left<0).length}));assert.equal(box.overflow,false);assert.equal(box.clipped,0);
   await page.locator('input[data-option]').last().check();await page.locator('.cst-options').evaluate(el=>el.scrollIntoView({block:'end',behavior:'instant'}));await screenshot(page,`actual-longest-${kind}-320x568-options`);assert.deepEqual(errors,[]);
   pass(`Longest active ${kind} ${chosen.q.id} ${chosen.lang} at 320×568: valid seeded native attempt, complete wrapped content and answer input`,{seed,stemLength:chosen.stemLength,optionLength:chosen.optionLength});await context.close();
  }
 }
 for(const lang of (smoke?['ru']:['ru','en','zh'])){
  const {page,context,errors}=await mount({lang,course:true,query:'&owner=student:alpha&slug=seminar-6&bank=/qa-actual-bank.json'});
  if(lang==='ru'){
   traceContext=context;await context.tracing.start({screenshots:true,snapshots:true,sources:false});
   imageDimensions=await page.evaluate(async()=>{const output={};for(const q of window.qa.bank.questions.filter(q=>q.media)){const im=new Image();im.src=new URL(q.media.src,location.href);await im.decode();output[q.id]={width:im.naturalWidth,height:im.naturalHeight};}return output;});
   assert.equal(Object.keys(imageDimensions).length,96);pass('Actual source bank: all 96 original PNGs load and decode from localhost',{imageCount:96});
  }
  await click(page,'start');const first=(await courseDraft(page)).state.civilServiceAttempt;
  const counts=Object.fromEntries(sectionIds.map(id=>[id,first.questionIds.filter(qid=>bank.questions.find(q=>q.id===qid).sectionId===id).length]));assert.deepEqual(Object.values(counts),[8,8,8,8,8]);assert.equal(new Set(first.questionIds).size,40);
  for(let i=0;i<40;i++){await courseAnswer(page);if(i<39)await click(page,'next');}
  await courseDraft(page);await click(page,'finish');await page.locator('.cst-result-hero').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-action="new"]')&&!document.querySelector('[data-action="new"]').disabled);
  const final=await courseDraft(page);assert.equal(final.state.resultAttempt.points,5);assert.equal(final.state.resultAttempt.activitySlug,topic.seminar.slug);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-course-grades'))['alpha:seminar-6']),5);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-course-grades'))['alpha:seminar-5']),undefined);
  await screenshot(page,`actual-${lang}-5points`);
  await page.evaluate(()=>localStorage.setItem('qa-reorder-keys','1'));await page.reload();await page.locator('html[data-qa-ready=true]').waitFor();
  assert.equal(await page.locator('.cst-result-hero').count(),1);assert.equal(await page.locator('[data-action="new"]').isEnabled(),true);assert.equal(await page.locator('[data-action="submit-result"]:visible').count(),0);
  assert.deepEqual((await courseDraft(page)).state,final.state);assert.equal(await page.evaluate(()=>window.qa.completions),0);
  const mediaIndex=first.questionIds.findIndex(id=>bank.questions.find(q=>q.id===id).media);
  if(mediaIndex>=0){const detail=page.locator('.cst-result-question').nth(mediaIndex);await detail.locator('summary').click();await detail.locator('[data-action="zoom-image"]').click();await page.locator('.cst-image-dialog[open]').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.dataset.action==='zoom-image');assert(await detail.getAttribute('open')!==null);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'zoom-image');}
  assert.deepEqual(errors,[]);pass(`Actual bank ${lang}: forty real UI answers score 5, visible Seminar 5 maps to preserved slug seminar-6, reordered-object restore is idempotent`);
  if(traceContext){await context.tracing.stop({path:path.join(run,'actual-bank-trace.zip')});traceContext=null;}await context.close();
 }
 for(const lang of ['ru','en','zh'])for(const viewport of (smoke?[{width:390,height:844}]:[{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1365,height:900}])){
  const {page,context,errors}=await mount({lang,viewport,query:'&bank=/qa-actual-bank.json'});await click(page,'start');const paper=await attempt(page);
  const candidates=paper.questionIds.map((id,index)=>({id,index,size:imageDimensions[id]?.width||0})).filter(q=>q.size).sort((a,b)=>b.size-a.size);assert(candidates.length,'A sampled paper must contain graphics for this visual check');
  const chosen=candidates[0];await openMap(page);await page.locator(`[data-question-index="${chosen.index}"]`).click();await page.locator('[data-question-image]').evaluate(im=>im.decode());
  await page.locator('.cst-question-card').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,`actual-${lang}-${viewport.width}x${viewport.height}-question`);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await click(page,'zoom-image');await page.locator('.cst-image-dialog[open]').waitFor();await page.locator('[data-zoom-image]').evaluate(im=>im.decode());
  const normal=await page.locator('[data-zoom-image]').evaluate(im=>({natural:im.naturalWidth,width:im.getBoundingClientRect().width}));assert(Math.abs(normal.natural-normal.width)<1);
  for(let i=0;i<4;i++)await click(page,'zoom-in');assert.equal(await page.locator('[data-image-scale]').innerText(),'300%');assert(await page.locator('[data-action="zoom-in"]').isDisabled());
  const expanded=await page.locator('[data-zoom-image]').evaluate(im=>({natural:im.naturalWidth,width:im.getBoundingClientRect().width}));assert(Math.abs(expanded.width-expanded.natural*3)<1);
  const dialog=await page.locator('.cst-image-dialog').boundingBox();assert(dialog.x>=-1&&dialog.y>=-1&&dialog.x+dialog.width<=viewport.width+1&&dialog.y+dialog.height<=viewport.height+1,'Zoom dialog fits viewport');
  const pan=page.locator('.cst-image-scroll'),bounds=await pan.boundingBox();
  if(await pan.evaluate(el=>el.scrollWidth>el.clientWidth)){
   const session=await context.newCDPSession(page),y=bounds.y+Math.min(bounds.height/2,100),start=bounds.x+bounds.width*.8,end=bounds.x+bounds.width*.2;
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
   for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/6,y}]});
   await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>document.querySelector('.cst-image-scroll').scrollLeft>0);await session.detach();
  }
  await screenshot(page,`actual-${lang}-${viewport.width}x${viewport.height}-zoom`);await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.dataset.action==='zoom-image');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'zoom-image');assert.deepEqual((await attempt(page)).answers,{});
  assert.deepEqual(errors,[]);pass(`Actual bank graphic ${chosen.id} ${lang} ${viewport.width}x${viewport.height}: 100–300% zoom, trusted touch pan, Escape focus restoration`,{horizontalOverflow:false});await context.close();
 }
}

try{
 browser=await pw.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});report.browserVersion=browser.version();
 if(args.has('--actual')){await actualCases();}else if(args.has('--adapter')){await courseCases();}else{
 {
  const {page,context,errors}=await mount();traceContext=context;await context.tracing.start({screenshots:true,snapshots:true,sources:false});
  await screenshot(page,'ru-mobile-intro');await click(page,'start');let first=await attempt(page);
  assert.equal(first.questionIds.length,40);assert.equal(new Set(first.questionIds).size,40);assert.equal(first.phase,'active');pass('Start creates a real forty-question paper and durable checkpoint');
  await answerCorrect(page);assert.equal(Object.keys((await persisted(page)).answers).length,1);await click(page,'clear');assert.equal((await attempt(page)).answers[first.questionIds[0]].length,0);await answerCorrect(page);
  await click(page,'next');await answerCorrect(page);await click(page,'previous');assert.equal((await attempt(page)).currentIndex,0);
  await openMap(page);await page.locator('[data-question-index="2"]').click();await answerCorrect(page);await screenshot(page,'ru-mobile-question');
  let saved=await attempt(page);await page.reload();await page.locator('html[data-qa-ready=true]').waitFor();assert.deepEqual(await attempt(page),saved);pass('Answer, clear, back/next/map navigation and reload preserve the exact paper and choices');
  for(const lang of ['en','zh','ru']){await page.locator(`[data-locale="${lang}"]`).click();assert.deepEqual(await attempt(page),saved);}
  pass('RU/EN/ZH switching retains attempt ID, question order and all answers');
  await page.locator('#fail-save').click();await click(page,'next');await page.locator('[data-save-warning]:not([hidden])').waitFor();
  assert.equal(await page.locator('[data-action="finish"]').first().isEnabled(),false);assert.equal((await persisted(page)).currentIndex,2);
  await page.locator('#fail-save').click();await click(page,'retry-save');await page.locator('[data-save-warning]').waitFor({state:'hidden'});assert.equal((await persisted(page)).currentIndex,3);pass('Failed checkpoint blocks finalization, warns visibly and retries the same in-memory answer state');
  await click(page,'finish');await page.locator('dialog[open]').waitFor();await click(page,'cancel-finish');assert.equal((await attempt(page)).phase,'active');
  await page.locator('#fail-complete').click();await finishSkipped(page);await page.locator('[data-complete-warning]:not([hidden])').waitFor();
  let completed=await attempt(page);assert.equal(completed.phase,'completed');assert.equal(completed.result.correct,3);assert.equal(completed.result.points,0.38);assert.equal(await page.locator('[data-action="new"]').isEnabled(),false);
  const completedId=completed.id;assert.equal(await page.locator('input[data-option]').count(),0);await screenshot(page,'ru-mobile-submit-failed');
  await page.locator('#fail-complete').click();await click(page,'submit-result');await page.waitForFunction(()=>window.qa.submissions.length===1);await attempt(page);
  assert.equal((await attempt(page)).id,completedId);assert.equal((await attempt(page)).result.points,0.38);assert.equal(await page.locator('[data-action="new"]').isEnabled(),true);pass('Skipped-answer confirmation and submission retry preserve one immutable result and exact 3/40 = 0.38 points');
  await page.reload();await page.locator('html[data-qa-ready=true]').waitFor();assert.equal((await attempt(page)).id,completedId);assert.equal(await page.evaluate(()=>window.qa.completions),0);assert.equal(await page.locator('.cst-result-question').count(),40);pass('Acknowledged result reload is idempotent and shows forty answer reviews without re-submission');
  await click(page,'new');const next=await attempt(page);assert.notEqual(next.id,first.id);assert.notDeepEqual(next.questionIds,first.questionIds);assert.deepEqual(next.answers,{});pass('New attempt gets a new random paper and empty answers after the result is durable');
  const beforeReadOnly=await persisted(page);await page.goto(base+'/qa-civil.html?readonly&lang=en');await page.locator('html[data-qa-ready=true]').waitFor();assert.equal(await page.locator('input[data-option]:enabled').count(),0);assert.deepEqual(await persisted(page),beforeReadOnly);pass('Read-only mount cannot edit the saved active attempt');
  assert.deepEqual(errors,[]);await context.tracing.stop({path:path.join(run,'functional-trace.zip')});traceContext=null;await context.close();
 }
 {
  const {page,context,errors}=await mount({viewport:{width:1365,height:900},lang:'en'});await click(page,'start');
  for(let i=0;i<40;i++){await answerCorrect(page);if(i<39)await click(page,'next');}
  await attempt(page);await click(page,'finish');await page.locator('.cst-result-hero').waitFor();const complete=await attempt(page);
  assert.equal(complete.result.correct,40);assert.equal(complete.result.points,5);assert.equal(await page.evaluate(()=>window.qa.submissions.length),1);await screenshot(page,'en-desktop-all-correct');
  assert.deepEqual(errors,[]);pass('Forty actual UI answers grade automatically to 5/5 and submit once');await context.close();
 }
 {
  const {page,context,errors}=await mount();await click(page,'start');await answerCorrect(page);const stored=await persisted(page),serialized=JSON.stringify(stored);
  await page.goto(base+'/qa-civil.html?v=2');await page.locator('html[data-qa-ready=true]').waitFor();await page.locator('.cst-recovery').waitFor();assert.equal(await page.locator('[data-action="start"]').count(),0);assert.equal(await page.evaluate(()=>window.qa.checkpoints),0);assert.equal(JSON.stringify(await persisted(page)),serialized);
  const downloadPromise=page.waitForEvent('download');await click(page,'export');const download=await downloadPromise;const exportPath=path.join(run,'stale-attempt-export.json');await download.saveAs(exportPath);assert.deepEqual(JSON.parse(await readFile(exportPath,'utf8')),stored);
  await click(page,'retry-restore');assert.equal(JSON.stringify(await persisted(page)),serialized);await screenshot(page,'ru-stale-version-recovery');pass('Incompatible saved bank is not overwritten; original answers remain exportable');
  await page.goto(base+'/qa-civil.html?v=2&historical');await page.locator('html[data-qa-ready=true]').waitFor();assert.deepEqual(await attempt(page),stored);await finishSkipped(page);await attempt(page);await click(page,'new');assert.equal((await attempt(page)).contentVersion,'TEST-ONLY-synthetic-v2');pass('Historical bank restores old attempt while a new attempt uses the current bank');
  assert.deepEqual(errors,[]);await context.close();
 }
 for(const lang of ['ru','en','zh'])for(const viewport of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1365,height:900}]){
  const {page,context,errors}=await mount({viewport,lang});await screenshot(page,`${lang}-${viewport.width}x${viewport.height}-intro`);await click(page,'start');await answerCorrect(page);
  await page.locator('.cst-question-card').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,`${lang}-${viewport.width}x${viewport.height}-question`);
  const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('.civil-service-test button,.cst-option')].filter(el=>el.getClientRects().length).filter(el=>{const b=el.getBoundingClientRect();return b.left<-.5||b.right>innerWidth+.5;}).map(el=>el.textContent),text:document.querySelector('.civil-service-test').innerText}));
  assert(geometry.scrollWidth<=viewport.width+1);assert.deepEqual(geometry.clipped,[]);if(lang!=='ru')assert(!/[А-Яа-яЁё]/.test(geometry.text));assert.deepEqual(errors,[]);pass(`Quiz layout ${lang} ${viewport.width}x${viewport.height}`,{horizontalOverflow:false,consoleErrors:0});await context.close();
 }
 }
 report.status='pass';
}catch(error){report.status='fail';report.errors.push(error.stack||String(error));console.error(error);process.exitCode=1;try{if(lastPage&&!lastPage.isClosed()){await screenshot(lastPage,'failure');report.failureDOM=await lastPage.locator('body').innerText();report.failureQA=await lastPage.evaluate(()=>window.qa);}}catch{}try{if(traceContext)await traceContext.tracing.stop({path:path.join(run,'functional-trace.zip')});}catch{}}
finally{report.finishedAt=new Date().toISOString();await writeFile(path.join(run,'report.json'),JSON.stringify(report,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));console.log('Report: '+path.join(run,'report.json'));}
