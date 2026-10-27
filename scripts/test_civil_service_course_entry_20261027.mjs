// Full production index/main/course UI with an isolated backend and real durable IDB.
// No production service is contacted; answer keys are read only for synthetic QA.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const serving=process.argv.includes('--serve');
const pw=require(process.env.PLAYWRIGHT_PATH||'C:/Users/arsen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const site=fileURLToPath(new URL('../site/',import.meta.url));
const run=fileURLToPath(new URL('../evidence/runs/20261027-civil-service-course-entry/'+new Date().toISOString().replaceAll(':','-')+'/',import.meta.url));
await mkdir(run,{recursive:true});
const bankBytes=await readFile(path.join(site,'data/civil-service/mintrud-v4-reviewed.json'));
const bank=JSON.parse(bankBytes),byId=new Map(bank.questions.map(q=>[q.id,q]));
const course=JSON.parse(await readFile(path.join(site,'data/course.json'),'utf8'));
const career=course.topics.find(topic=>topic.seminar.module==='career');
assert.equal(career.number,5);assert.equal(career.seminar.slug,'seminar-6');
const slug=career.seminar.slug,mode='civil-service-knowledge-v1';
const sources=['index.html','assets/js/main.js','assets/js/civil-service-course.mjs','assets/js/civil-service-test.mjs','assets/js/civil-service-model.mjs','assets/js/durable-store.js','assets/css/civil-service-test.css','data/course.json','data/civil-service/mintrud-v4-reviewed.json','apps/career/entry.mjs','apps/career/runtime.bundle.mjs','apps/career/module.css'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async file=>[file,createHash('sha256').update(await readFile(path.join(site,file))).digest('hex')])));
const report={status:'not-run',startedAt:new Date().toISOString(),method:'Actual index.html, main.js, course.json, native Career and Civil-Service mounts, real reviewed bank snapshot and IndexedDB. Test-only backend module replaces authentication and journal transport. All off-origin requests blocked.',browserFallback:'Playwright MCP navigation failed: Chromium chrome missing at C:/Users/arsen/AppData/Local/Google/Chrome/Application/chrome.exe. Bundled Playwright and installed Chromium used; local fallback explicitly permitted.',bank:{contentVersion:bank.contentVersion,sourceCount:bank.questions.length,activeCount:bank.questions.filter(q=>q.review.status==='verified').length,sha256:createHash('sha256').update(bankBytes).digest('hex')},hashesBefore:await hashes(),cases:[],screenshots:[],errors:[],externalRequests:[]};
const backendSource=`import {durableStore as store} from '/assets/js/durable-store.js';
const read=(key,fallback)=>JSON.parse(localStorage.getItem('qa-entry.'+key)||JSON.stringify(fallback));
const write=(key,value)=>localStorage.setItem('qa-entry.'+key,JSON.stringify(value));
const role=()=>read('role','${serving?'student':'guest'}');
export const groupOptions=()=>['ГГУбд-01-26'];
export const backend={authReady:true,generation:1,mode:'local',connected:false,serverTimeOffset:0,
get user(){return {uid:'isolated-course-entry',displayName:'Local QA preview',email:'qa@example.test'}},
getProfile:()=>role()==='student'?{studentKey:'civil-entry-student',fullName:'Local QA preview',group:'ГГУбд-01-26',ticket:'1234567890'}:null,
isAdmin:()=>role()==='teacher',init:async()=>{},onStatus:()=>()=>{},status:()=>({connected:false}),globalNow:()=>Date.parse('2026-10-27T09:00:00Z'),
getAccessOverrides:()=>Object.fromEntries(Array.from({length:8},(_,i)=>['topic-'+(i+1),'open'])),
localGrades:()=>read('grades',{}),getGrades:async()=>backend.localGrades(),localAttempts:()=>read('attempts',[]),getAttempts:async()=>backend.localAttempts(),
loadDraft:scope=>store.loadDraft(scope),checkpoint:(scope,options)=>store.checkpoint(scope,options),
automaticRoomKey:group=>'fixture-'+group,submitAutomaticQuizResponse:async()=>{},
saveAttempt:async value=>{if(role()!=='student')throw Error('Non-student journal submission');
if(value.studentKey!==backend.getProfile().studentKey)throw Error('Wrong journal owner');
write('saveCalls',read('saveCalls',0)+1);const attempts=backend.localAttempts(),old=attempts.find(a=>a.id===value.id);
if(old&&JSON.stringify(old)!==JSON.stringify(value))throw Error('Immutable journal record overwritten');
if(!old){attempts.push(value);write('attempts',attempts)}
if(value.recordGrade!==false){const grades=backend.localGrades(),prior=grades[value.activitySlug];if(!prior||value.points>prior.points)grades[value.activitySlug]={points:value.points};write('grades',grades)}
window.dispatchEvent(new CustomEvent('rudn:gradechange'));return {...value,saveStatus:{durable:true,state:'saved'}};}};`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{
  const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'");
  if(name==='/assets/js/backend.js'){res.setHeader('Content-Type','text/javascript');return res.end(backendSource)}
  if(name==='/data/civil-service/mintrud-v4-reviewed.json'){res.setHeader('Content-Type','application/json');return res.end(bankBytes)}
  const file=path.resolve(site,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(site.endsWith(path.sep)?site:site+path.sep))throw Error('Outside site');
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  const content=await readFile(file);
  res.end(serving&&path.basename(file)==='index.html'?content.toString('utf8').replace('<title>','<title>Локальный QA preview · '):content);
}catch{res.statusCode=404;res.end('Missing local test resource')}});
await new Promise(resolve=>server.listen(serving?Number(process.env.CIVIL_ENTRY_PORT||8791):0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;report.base=base;
if(serving){console.log(`Local QA preview (synthetic student, local journal, production blocked): ${base}/#activity/${slug}`);console.log(`Bank ${bank.contentVersion}, verified ${report.bank.activeCount}/700, sha256 ${report.bank.sha256}`);await new Promise(()=>{});}
const scopeFor=role=>({owner:role==='student'?'student:civil-entry-student':role==='teacher'?'teacher:isolated-course-entry':'guest:civil-service',activitySlug:slug,mode});
let browser,lastPage,activeContext;
const pass=(name,data={})=>{report.cases.push({name,status:'pass',...data});console.log('PASS '+name)};
const shot=async(page,name)=>{const file=path.join(run,name+'.png');await page.screenshot({path:file,fullPage:false});report.screenshots.push(file)};
const ready=page=>page.locator('#app[aria-busy="false"]').waitFor();
async function openKnowledge(page){const details=page.locator('#careerKnowledge');if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();await page.locator('#civilServiceMount[aria-busy="false"] .civil-service-test').waitFor();}
async function draft(page,role='student') {return page.evaluate(async scope=>{const {durableStore}=await import('/assets/js/durable-store.js');await durableStore.flush();return durableStore.loadDraft(scope)},scopeFor(role));}
async function settled(page){await page.waitForFunction(()=>{const b=document.querySelector('.civil-service-test [data-action="finish"],.civil-service-test [data-action="new"]');return b&&!b.disabled});}
async function stats(page){return page.evaluate(()=>({calls:JSON.parse(localStorage.getItem('qa-entry.saveCalls')||'0'),attempts:JSON.parse(localStorage.getItem('qa-entry.attempts')||'[]'),grades:JSON.parse(localStorage.getItem('qa-entry.grades')||'{}')}));}
async function geometry(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal page overflow');assert.equal(await page.locator('vite-error-overlay,[data-nextjs-dialog],webpack-dev-server-client-overlay').count(),0);}
async function mount(role,locale,viewport){
  const context=await browser.newContext({viewport,hasTouch:viewport.width<500,serviceWorkers:'block'});activeContext=context;
  await context.tracing.start({screenshots:true,snapshots:true,sources:false});
  await context.addInitScript(({role,locale})=>{localStorage.setItem('qa-entry.role',JSON.stringify(role));if(!localStorage.getItem('rudn.locale'))localStorage.setItem('rudn.locale',locale);},{role,locale});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base){report.externalRequests.push({role,url:url.origin+url.pathname});return route.abort()}return route.continue()});
  const page=await context.newPage();lastPage=page;page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  await page.goto(base+'/#dashboard');await ready(page);await page.locator('.topic-card').first().waitFor();
  const link=page.locator(`.activity-mini a[href="#activity/${slug}"]`);
  const title=await link.locator('xpath=ancestor::div[contains(@class,"activity-mini")]').locator('strong').first().innerText();
  assert.equal(title,locale==='ru'?career.seminar.title:career.seminar['title_'+locale]);
  await link.scrollIntoViewIfNeeded();await shot(page,`${role}-${locale}-${viewport.width}-dashboard`);
  await link.click();await page.locator('#careerMount[data-career-ready="true"]').waitFor();await openKnowledge(page);await geometry(page);
  assert(new URL(page.url()).hash.startsWith('#activity/seminar-6'));
  assert.equal(await page.locator('#civilForm,#careerKnowledge input[type="file"],#careerKnowledge input[type="number"]').count(),0,'No screenshot/manual-grade form');
  assert.equal(await page.locator('.civil-service-test h2').innerText(),{ru:'Знания о государственной службе',en:'Public-service knowledge',zh:'公务知识测试'}[locale]);
  await page.locator('.civil-service-test').scrollIntoViewIfNeeded();await shot(page,`${role}-${locale}-${viewport.width}-intro`);
  pass(`${role}/${locale}/${viewport.width}: dashboard Seminar 5 → actual seminar-6 → native career + knowledge mount`,{title});
  return {page,context,errors};
}
async function answer(page,role='student'){
  await settled(page);const record=await draft(page,role),attempt=record.state.civilServiceAttempt,q=byId.get(attempt.questionIds[attempt.currentIndex]);
  assert(q&&q.review.status==='verified');for(const key of q.correctOptionIds)await page.locator(`.civil-service-test input[data-option="${key}"]`).check();await settled(page);return q;
}
async function finish(page,skipped){await settled(page);await page.locator('.civil-service-test [data-action="finish"]').first().click();if(skipped){await page.locator('.cst-confirm[open]').waitFor();await page.locator('[data-action="confirm-finish"]').click()}await page.locator('.cst-result-hero').waitFor();await settled(page);}
async function closeCase(context,errors,name){assert.deepEqual(errors,[],'No browser errors');await context.tracing.stop({path:path.join(run,name+'.zip')});await context.close();activeContext=null;}
try{
  browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/arsen/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
  {
    const {page,context,errors}=await mount('student','ru',{width:390,height:844});
    await page.locator('[data-action="start"]').click();await answer(page);await page.locator('[data-action="next"]').click();await answer(page);
    const before=(await draft(page)).state.civilServiceAttempt;
    for(const locale of ['en','zh','ru']){
      await page.locator(`.language-option[data-lang="${locale}"]`).click();await page.waitForFunction(locale=>document.querySelector('.civil-service-test')?.lang===(locale==='zh'?'zh-Hans':locale),locale);await settled(page);
      const after=(await draft(page)).state.civilServiceAttempt;assert.equal(after.id,before.id);assert.equal(after.currentIndex,1);assert.deepEqual(after.answers,before.answers);assert.deepEqual(after.questionIds,before.questionIds);
      const q=byId.get(after.questionIds[1]);assert.deepEqual(await page.locator('.civil-service-test input:checked').evaluateAll(nodes=>nodes.map(n=>n.dataset.option)),q.correctOptionIds);
      await geometry(page);await page.locator('.cst-question-card').scrollIntoViewIfNeeded();await shot(page,`student-${locale}-390-active-same-attempt`);
    }
    pass('Real shell locale RU→EN→ZH→RU preserves attempt, shuffled paper, current question and selections');
    await page.reload();await page.locator('#careerMount[data-career-ready="true"]').waitFor();await openKnowledge(page);await settled(page);
    assert.equal((await draft(page)).state.civilServiceAttempt.id,before.id);assert.equal((await draft(page)).state.civilServiceAttempt.currentIndex,1);
    for(let i=2;i<40;i++){await page.locator('[data-action="next"]').click();await answer(page)}
    await finish(page,false);const stored=await draft(page),saved=await stats(page);
    assert.equal(stored.state.civilServiceAttempt.id,before.id);assert.equal(stored.state.resultAttempt.points,5);assert.equal(stored.state.resultAttempt.civilService.attempt.result.correct,40);
    assert.equal(stored.state.resultAttempt.activitySlug,slug);assert.equal(saved.grades[slug].points,5);assert.equal(saved.grades['seminar-5'],undefined);assert.equal(saved.calls,1);assert.equal(saved.attempts.length,1);
    await page.locator('.cst-result-hero').scrollIntoViewIfNeeded();await shot(page,'student-ru-390-result-40-of-40');
    await page.reload();await page.locator('#careerMount[data-career-ready="true"]').waitFor();await openKnowledge(page);await page.locator('.cst-result-hero').waitFor();await settled(page);
    assert.equal((await stats(page)).calls,1);assert.equal((await stats(page)).attempts.length,1);assert.equal((await draft(page)).state.civilServiceAttempt.id,before.id);assert.equal(await page.locator('[data-action="submit-result"]:visible').count(),0);
    await page.locator('.career-course-page .page-actions a[href="#dashboard"]').click();await page.locator('.topic-card').first().waitFor();
    const card=page.locator(`.activity-mini:has(a[href="#activity/${slug}"])`);assert.match(await card.locator('.grade').innerText(),/5\s*\/\s*5/);await card.scrollIntoViewIfNeeded();await shot(page,'student-ru-390-dashboard-grade');
    const durableAttempts=await page.evaluate(async()=>{const {durableStore}=await import('/assets/js/durable-store.js');return durableStore.listAttempts({owner:'student:civil-entry-student'});});
    assert.equal(durableAttempts.filter(item=>item.type==='civil-service-knowledge').length,1,'Exactly one durable completed knowledge paper');
    assert.equal(durableAttempts.find(item=>item.id===before.id).points,5);
    pass('Actual 40/40 paper → automatic 5/5 on seminar-6 → reload same immutable result, single backend submission → dashboard grade',{attemptId:before.id,scope:scopeFor('student'),questionIds:before.questionIds,points:5,correct:40,backendCalls:saved.calls,durableCompletedCount:1});
    await closeCase(context,errors,'student-full-paper');
  }
  {
    const {page,context,errors}=await mount('student','en',{width:1440,height:1000});await page.locator('[data-action="start"]').click();
    for(let i=0;i<3;i++){await answer(page);await page.locator('[data-action="next"]').click()}
    await finish(page,true);const saved=await stats(page),stored=await draft(page);assert.equal(saved.grades[slug].points,0.38);assert.equal(stored.state.civilServiceAttempt.result.correct,3);assert.equal(saved.calls,1);
    await geometry(page);await page.locator('.cst-result-hero').scrollIntoViewIfNeeded();await shot(page,'student-en-1440-result-3-of-40');
    pass('English desktop actual 3/40 with skipped-answer confirmation → automatic 0.38/5 under seminar-6',{attemptId:stored.state.civilServiceAttempt.id,scope:scopeFor('student'),points:0.38,correct:3,backendCalls:saved.calls});await closeCase(context,errors,'student-en-partial');
  }
  {
    const {page,context,errors}=await mount('teacher','zh',{width:390,height:844});await page.locator('[data-action="start"]').click();await answer(page,'teacher');await finish(page,true);
    const saved=await stats(page),stored=await draft(page,'teacher');assert.equal(saved.calls,0);assert.deepEqual(saved.grades,{});assert.equal(saved.attempts.length,0);assert.equal(stored.state.resultAttempt.recordGrade,false);assert.equal(stored.state.resultAttempt.points,0.13);
    await geometry(page);await page.locator('.cst-result-hero').scrollIntoViewIfNeeded();await shot(page,'teacher-zh-390-result-no-grade');
    pass('Chinese teacher preview can finish real paper while journal callback remains unused and recordGrade=false',{attemptId:stored.state.civilServiceAttempt.id,scope:scopeFor('teacher'),points:0.13,backendCalls:saved.calls,recordGrade:stored.state.resultAttempt.recordGrade});await closeCase(context,errors,'teacher-zh');
  }
  {
    const {page,context,errors}=await mount('guest','en',{width:1440,height:1000});await page.locator('[data-action="start"]').click();await finish(page,true);
    const saved=await stats(page),stored=await draft(page,'guest');assert.equal(saved.calls,0);assert.deepEqual(saved.grades,{});assert.equal(stored.state.resultAttempt.recordGrade,false);
    await page.goto(base+'/#games/career');await page.locator('#careerMount[data-career-ready="true"]').waitFor();assert.equal(await page.locator('#careerKnowledge,.civil-service-test,#civilForm').count(),0);
    pass('Guest course preview completes locally without journal; free Career catalog has no knowledge assessment/form',{attemptId:stored.state.civilServiceAttempt.id,scope:scopeFor('guest'),backendCalls:saved.calls,recordGrade:stored.state.resultAttempt.recordGrade});await closeCase(context,errors,'guest-en');
  }
  assert.deepEqual(report.externalRequests,[],'No requests to production or third-party services');report.status='pass';
}catch(error){report.status='fail';report.errors.push(error.stack||String(error));console.error(error);if(lastPage&&!lastPage.isClosed()){await shot(lastPage,'failure').catch(()=>{});report.failurePage={url:lastPage.url(),text:await lastPage.locator('body').innerText().catch(()=>''),console:await lastPage.evaluate(()=>window.__entryQaErrors||[]).catch(()=>[])};}process.exitCode=1;
}finally{
  if(activeContext)await activeContext.tracing.stop({path:path.join(run,'failure-trace.zip')}).catch(()=>{});
  await browser?.close();await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();report.hashesAfter=await hashes();report.changedDuringRun=sources.filter(file=>report.hashesBefore[file]!==report.hashesAfter[file]);
  await writeFile(path.join(run,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.length,report:path.join(run,'report.json'),changedDuringRun:report.changedDuringRun}));
}
