// Actual platform shell/quiz UI; data writes remain in an isolated local backend.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),pw=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=new URL('../site/',import.meta.url);
const profile={studentKey:'games-platform-fixture',fullName:'Platform QA',group:'ГГУбд-01-26',ticket:'1234567890'};
const backendSource=`import {durableStore as store} from '/assets/js/durable-store.js';
export const groupOptions=()=>['ГГУбд-01-26'];
const read=(key,fallback)=>JSON.parse(localStorage.getItem('qa.'+key)||JSON.stringify(fallback));
export const backend={authReady:true,user:{uid:'isolated-only'},mode:'local',connected:false,serverTimeOffset:0,
getProfile:()=>read('profile',null),isAdmin:()=>false,init:async()=>{},onStatus:()=>()=>{},status:()=>({}),globalNow:()=>Date.parse('2026-09-17T12:00:00Z'),
getAccessOverrides:()=>read('access',{}),localGrades:()=>read('grades',{}),getGrades:async()=>backend.localGrades(),
localAttempts:()=>read('attempts',[]),getAttempts:async()=>backend.localAttempts(),loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,o),
automaticRoomKey:group=>'fixture-'+group,submitAutomaticQuizResponse:async()=>{},
saveAttempt:async value=>{const profile=backend.getProfile();if(!profile)throw Error('Guest attempted course submission');
const attempt={...value,studentKey:profile.studentKey},scope={owner:'student:'+profile.studentKey,activitySlug:attempt.activitySlug,mode:attempt.draftMode||'default',attemptId:attempt.id};
const previous=await store.loadDraft(scope);await store.complete({...scope,state:{...previous?.state,phase:'completed',resultAttempt:attempt},attempt},{queue:false});
const attempts=backend.localAttempts();if(!attempts.some(a=>a.id===attempt.id))attempts.push(attempt);localStorage.setItem('qa.attempts',JSON.stringify(attempts));
if(attempt.recordGrade!==false){const grades=backend.localGrades(),prior=grades[attempt.activitySlug];if(!prior||attempt.points>prior.points)grades[attempt.activitySlug]={points:attempt.points};localStorage.setItem('qa.grades',JSON.stringify(grades));}
window.dispatchEvent(new CustomEvent('rudn:gradechange'));return attempt;}};`;
const types={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/assets/js/backend.js'){res.setHeader('Content-Type','text/javascript');res.end(backendSource);return;}
 const url=new URL('.'+(path==='/'?'/index.html':path),root);if(!fileURLToPath(url).startsWith(fileURLToPath(root)))throw Error('path');
 const bytes=await readFile(url);res.setHeader('Content-Type',types[url.pathname.slice(url.pathname.lastIndexOf('.'))]||'application/octet-stream');res.end(bytes);
}catch{res.statusCode=404;res.end('Missing test resource');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const ready=page=>page.locator('#app[aria-busy="false"]').waitFor();
const route=async(page,hash)=>{await page.evaluate(hash=>{location.hash=hash;},hash);await page.waitForFunction(hash=>location.hash==='#'+hash,hash);await ready(page);};
async function lateModuleDoesNotReplaceCatalog(browser){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
 let release,notifyHeld;const gate=new Promise(resolve=>{release=resolve;}),held=new Promise(resolve=>{notifyHeld=resolve;});
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await context.route('**/*',request=>new URL(request.request().url()).origin===base?request.continue():request.abort());
 await context.route('**/apps/career/entry.mjs*',async request=>{notifyHeld();await gate;await request.continue();});
 try{
  await page.goto(base+'/#games');await page.locator('[data-game=career] a').click();
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Career import was not requested')),30000);held.then(()=>{clearTimeout(timer);resolve();});});
  await page.goBack();await page.locator('[data-game]').first().waitFor();
  const lateResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/apps/career/entry.mjs');
  release();await lateResponse;await page.waitForLoadState('networkidle');
  assert.equal(new URL(page.url()).hash,'#games');assert.equal(await page.locator('[data-game]').count(),4);
  assert.equal(await page.locator('#careerMount').count(),0,'Late module cannot replace the catalog after Back');
  assert.equal(requests.some(url=>url.includes('/apps/career/surface.html')),false,'Cancelled route never mounts the late module');
  assert.deepEqual(errors,[]);
 }finally{release();await context.close();}
}
async function passQuiz(page,slug,mode='default',wrong=false){
 await page.locator('#quizNext').waitFor();
 const questions=await page.evaluate(async({slug,mode})=>{
  const store=(await import('/assets/js/durable-store.js')).durableStore;await store.flush();
  const draft=await store.loadDraft({owner:'student:games-platform-fixture',activitySlug:slug,mode});
  return draft.state.questionIds.map(id=>window.RUDN_DATA.questions.find(question=>question.id===id));
 },{slug,mode});
 for(const [index,q]of questions.entries()){
  if(q.type==='matrix_single'){
   const good=q.classification_correct||[q.matrix.correct.row,q.matrix.correct.column].join('|');
   const selector=wrong?`[data-matrix]:not([data-matrix="${good}"])`:`[data-matrix="${good}"]`;
   await page.locator(selector).first().click();
  }else if(q.type==='shortanswer')await page.locator('.short-answer').fill(wrong?'intentionally incorrect':q.answers.find(answer=>Number(answer.fraction)>0).text);
  else{
   const answers=q.answers.filter(answer=>wrong?Number(answer.fraction)<=0:Number(answer.fraction)>0);
   for(const answer of q.single?answers.slice(0,1):answers)await page.locator(`input[name=answer][value="${answer.id}"]`).check();
  }
  await page.locator('#quizNext').click();
  if(index<questions.length-1)await page.waitForFunction(next=>document.querySelector('.quiz-progress>span')?.textContent.includes(next),`${index+2}/${questions.length}`);
 }
 await page.locator('.result-score').waitFor();return page.locator('.result-score').innerText();
}
try{for(const engine of(process.env.DURABLE_TEST_BROWSERS||'chromium,webkit').split(',')){
 const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 try{
  if(process.env.GAMES_PLATFORM_FOCUS==='race'){
   await lateModuleDoesNotReplaceCatalog(browser);console.log(`PASS ${engine}: held Career import→Back→late response preserves the catalog`);continue;
  }
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],modules=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/\/apps\/(?:career|reception|governor)\//.test(request.url()))modules.push(request.url());});
  await context.route('**/*',request=>new URL(request.request().url()).origin===base?request.continue():request.abort());
  await page.goto(base+'/#games');await ready(page);
  assert.deepEqual(await page.locator('[data-game]').evaluateAll(nodes=>nodes.map(node=>node.dataset.game)),['maps','governor','reception','career']);
  assert.deepEqual(modules,[],'Catalog does not load heavyweight modules before selection');
  for(const locale of ['en','zh','ru']){
   await page.locator(`[data-lang="${locale}"]`).first().click();await ready(page);
   assert.equal(await page.locator('[data-game] a').count(),4);assert.equal(await page.locator('[data-game=career] a').getAttribute('href'),'#games/career');
  }
  await page.locator('[data-game=career] a').click();await page.locator('#careerMount[data-career-ready=true]').waitFor();
  assert.equal(await page.locator('#civilForm,#careerKnowledge').count(),0,'Guest free Career omits course grade form');
  await page.goBack();await page.locator('[data-game]').first().waitFor();
  await page.goForward();await page.locator('#careerMount[data-career-ready=true]').waitFor();
  await page.locator('#app .page-actions a[href="#games"]').click();await page.locator('[data-game]').first().waitFor();
  // A real course profile and open fixture schedule, using the actual access.js.
  await page.evaluate(profile=>{localStorage.setItem('qa.profile',JSON.stringify(profile));localStorage.setItem('qa.access',JSON.stringify(Object.fromEntries(Array.from({length:8},(_,i)=>['topic-'+(i+1),'open']).concat(Array.from({length:7},(_,i)=>['lecture-'+(i+1)+'-test','open'])))));},profile);
  await page.goto(base+'/#dashboard');await ready(page);
  assert.equal(await page.locator('[data-lecture-test]').count(),7);assert.equal(await page.locator('[data-lecture-test="lecture-8"]').count(),0);
  assert.equal(await page.locator('a[href="#activity/lecture-8"]').count(),1,'Lecture 8 retains its Open link');
  for(let i=1;i<=7;i++)assert.equal(await page.locator(`[data-lecture-test="lecture-${i}"]`).getAttribute('href'),`#activity/lecture-${i}/test`);
  if(process.env.GAMES_PLATFORM_FOCUS!=='gates'){
  await page.locator('[data-lecture-test="lecture-1"]').click();assert.equal(await passQuiz(page,'lecture-1'),'5/5');
  await page.locator('#quizExit').click();await page.locator('.topic-card').first().waitFor();
  assert.equal(await page.locator('.topic-card').first().locator('.achievement-star').count(),1);assert.equal(await page.locator('.topic-card').first().getAttribute('class').then(value=>value.includes('topic-perfect')),false);
  // The other two badges use the same real quiz rendering/scoring path.
  await page.locator('a[href="#activity/seminar-1-assessment"]').click();assert.equal(await passQuiz(page,'seminar-1','assessment'),'5/5');
  await page.locator('#quizExit').click();await page.locator('a[href="#activity/seminar-1-classroom"]').click();assert.equal(await passQuiz(page,'seminar-1-classroom'),'50/50');
  await page.locator('#quizExit').click();await page.locator('.topic-card.topic-perfect').first().waitFor();
  assert.equal(await page.locator('.topic-card').first().locator('.achievement-star').count(),3);
  await page.waitForFunction(()=>{const style=getComputedStyle(document.querySelector('.topic-card'));return style.borderTopColor==='rgb(233, 184, 24)'&&style.borderTopWidth==='2px';});
  // A genuine lower retake cannot remove the maximum lecture achievement.
  await page.locator('[data-lecture-test="lecture-1"]').click();await page.locator('#quizRetry').click();assert.equal(await passQuiz(page,'lecture-1','default',true),'0/5');
  await page.locator('#quizExit').click();await page.locator('.topic-card.topic-perfect').first().waitFor();
  assert.equal(await page.locator('.topic-card').first().locator('.achievement-star').count(),3);
  }
  // Direct URL access honors both the test override and the containing topic.
  for(let lecture=1;lecture<=7;lecture++)for(const key of [`lecture-${lecture}-test`,`topic-${lecture}`]){
   await page.evaluate(key=>{const access=JSON.parse(localStorage.getItem('qa.access'));access[key]='closed';localStorage.setItem('qa.access',JSON.stringify(access));window.dispatchEvent(new CustomEvent('rudn:accesschange'));},key);
   await page.goto(base+`/#activity/lecture-${lecture}/test`);await ready(page);assert.equal(await page.locator('#quizMount').count(),0);
   await page.goto(base+'/#dashboard');await ready(page);assert.equal(await page.locator(`[data-lecture-test="lecture-${lecture}"]`).isDisabled(),true);
   await page.evaluate(key=>{const access=JSON.parse(localStorage.getItem('qa.access'));access[key]='open';localStorage.setItem('qa.access',JSON.stringify(access));},key);
  }
  assert.deepEqual(errors,[]);await context.close();await lateModuleDoesNotReplaceCatalog(browser);
  console.log(`PASS ${engine}: guest catalog/lazy modules/locales/history, ${process.env.GAMES_PLATFORM_FOCUS==='gates'?'targeted access checks':'actual5/5+5/5+50/50→three stars/gold, lower retake'}, all7 direct test/topic gates, late module after Back`);
 }finally{await browser.close();}
}}finally{await new Promise(resolve=>server.close(resolve));}
