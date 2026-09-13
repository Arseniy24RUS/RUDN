// Browser integration against demo-rudn ONLY. No production Firebase requests allowed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const base='http://127.0.0.1:8765/',root='rudn-platform/v1',key=process.env.QA_STUDENT||'9909132001';
const out=process.env.QA_OUT||path.join(require('node:os').tmpdir(),'rudn-reliability-e2e');fs.mkdirSync(out,{recursive:true});
const bank=JSON.parse(fs.readFileSync('site/data/questions.json','utf8'));
const config=fs.readFileSync('site/assets/js/config.js','utf8').replace(/export const CONFIG\s*=\s*\{/,'export const CONFIG = {emulators:{auth:"http://127.0.0.1:9099",host:"127.0.0.1",databasePort:9000},');
const version='1.3.4';
async function db(p,method='GET',body){const r=await fetch(`http://127.0.0.1:9000/${p}.json?ns=demo-rudn-default-rtdb`,{method,headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();assert(r.ok,JSON.stringify(value));return value}
async function poll(fn,message){for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,250))}throw Error(message)}
async function backend(page,method,...args){return page.evaluate(async({method,args,version})=>(await import(`/assets/js/backend.js?v=${version}`)).backend[method](...args),{method,args,version})}
async function ready(page){await backend(page,'init');await page.locator('#app[aria-busy="false"]').waitFor()}
async function draft(page,slug='seminar-1-classroom',mode='default'){return page.evaluate(async({key,slug,mode})=>(await import('/assets/js/durable-store.js')).durableStore.loadDraft({owner:'student:'+key,activitySlug:slug,mode}),{key,slug,mode})}
async function shot(page,name){await page.screenshot({path:path.join(out,name+'.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Horizontal overflow: '+name)}
(async()=>{
  await db(`${root}/profiles/${key}`,'PUT',{studentKey:key,ticket:key,email:key+'@rudn.ru',fullName:'Синтетический Студент Надёжность',group:'ГГУбд-02-26',createdAt:'2026-09-13T10:00:00Z',ownerUid:'qa-preserved-owner',ownerUids:{'qa-preserved-owner':true}});
  const browser=await (process.env.QA_ENGINE==='webkit'?webkit:chromium).launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',locale:'ru-RU'});let offline=false;const errors=[];
  await context.route('**/assets/js/config.js*',r=>r.fulfill({contentType:'application/javascript',body:config}));
  await context.route('http://127.0.0.1:9000/**',r=>offline?r.abort():r.continue());
  await context.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app|firebaseapp\.com)\//,r=>{errors.push('Production request blocked');return r.abort()});
  await context.routeWebSocket(/ws:\/\/127\.0\.0\.1:9000/,socket=>{if(offline)socket.close();else socket.connectToServer()});
  const page=await context.newPage();let expectedDisconnects=0;
  page.on('pageerror',e=>{if(/127\.0\.0\.1:9000\/\.lp\?disconn=t/.test(e.message)){expectedDisconnects++;return}errors.push(e.message)});
  try{
    await page.goto(base+'#dashboard');await ready(page);await page.locator('#profileButton').click();await page.locator('#authIdentifier').fill(key);await page.locator('#authStudentDetails').waitFor();await page.locator('#authSubmit').click();await page.locator('#authDialog').waitFor({state:'hidden'});
    await page.locator('a[href="#activity/seminar-1-classroom"]').click();await page.locator('#quizNext').waitFor();
    const initial=await draft(page);assert(initial?.attemptId);
    for(let index=0;index<50;index++){
      const current=await draft(page);assert.equal(current.state.index,index);
      const q=bank.find(q=>q.id===current.state.questionIds[index]);assert(q);
      await page.locator(`[data-matrix="${q.classification_correct}"]`).click();
      await page.locator('#quizNext').click();
      if(index<49)await poll(async()=> (await draft(page))?.state.index===index+1,'Next did not save index');
      if(index===10){
        const before=await draft(page);
        for(const lang of ['en','zh','ru']){await page.locator(`[data-lang="${lang}"]`).click();const after=await draft(page);for(const field of ['id','questionIds','answers','index','startedAt'])assert.deepEqual(after.state[field],before.state[field],`Language reset ${field}`)}
        await shot(page,'quiz-11-mobile');offline=true;
        await page.evaluate(async version=>{const {backend}=await import(`/assets/js/backend.js?v=${version}`);backend.db.goOffline(backend.database)},version);
        await page.reload();await ready(page);await page.locator('#quizNext').waitFor();
        assert.deepEqual((await draft(page)).state.answers,before.state.answers,'Reload lost answers');
        assert.equal((await draft(page)).state.startedAt,before.state.startedAt,'Timer restarted');
      }
      if(index===27)await shot(page,'quiz-offline-middle-mobile');
    }
    await page.locator('.result-score').waitFor();assert.equal(await page.locator('.result-score').innerText(),'50/50');
    assert.equal((await draft(page)).phase,'completed');await shot(page,'quiz-offline-result-mobile');
    await page.reload();await ready(page);await page.locator('.result-score').waitFor();assert.equal(await page.locator('.result-score').innerText(),'50/50');
    await page.locator('#quizExit').click();await page.waitForURL('**/#dashboard');await ready(page);
    assert((await page.locator('.activity-trio').first().innerText()).includes('50/50'));
    offline=false;await page.evaluate(async version=>{const {backend}=await import(`/assets/js/backend.js?v=${version}`);backend.db.goOnline(backend.database)},version);await backend(page,'syncLocalToCloud');
    await poll(async()=>Object.values(await db(`${root}/attempts/${key}`)||{}).some(a=>a.id===initial.attemptId&&a.points===50),'Quiz not delivered');
    assert.equal((await db(`${root}/grades/${key}`))?.['seminar-1-classroom'],undefined);
    assert((await db(`${root}/profiles/${key}`)).ownerUids['qa-preserved-owner'],'Previous owner removed');
    await page.locator('a[href="#activity/seminar-1-assessment"]').click();await page.locator('#quizNext').waitFor();
    for(let i=0;i<5;i++){
      const current=await draft(page,'seminar-1','assessment'),q=bank.find(q=>q.id===current.state.questionIds[current.state.index]);
      await page.locator(`[data-matrix="${q.classification_correct}"]`).click();await page.locator('#quizNext').click();
      if(i<4)await poll(async()=> (await draft(page,'seminar-1','assessment'))?.state.index===i+1,'Assessment next');
    }
    await page.locator('.result-score').waitFor();assert.equal(await page.locator('.result-score').innerText(),'5/5');assert.equal(await page.locator('.review-list').count(),0);
    for(const lang of ['en','zh','ru']){await page.locator(`[data-lang="${lang}"]`).click();assert.equal(await page.locator('.review-list').count(),0)}
    await backend(page,'syncLocalToCloud');await poll(async()=> (await db(`${root}/grades/${key}/seminar-1`))?.points===5,'Assessment grade not delivered');
    await page.locator('#quizExit').click();await page.waitForURL('**/#dashboard');await ready(page);await page.locator('.activity-trio').first().waitFor();await shot(page,'course-two-results-mobile');
    await page.goto(base+'#gradebook');await ready(page);assert(!(await page.locator('#app').innerText()).includes('50/50'));await shot(page,'student-gradebook-mobile');
    const ids=Object.keys(await db(`${root}/attempts/${key}`));await backend(page,'syncLocalToCloud');assert.deepEqual(Object.keys(await db(`${root}/attempts/${key}`)),ids,'Duplicate attempts');
    await page.setViewportSize({width:412,height:915});await shot(page,'student-gradebook-412');
    await page.setViewportSize({width:1440,height:1000});await shot(page,'student-gradebook-desktop');
    assert.deepEqual(errors,[]);console.log('PASS: 50-question quiz, offline reload/continue, language persistence, stable timer, completion, assessment, best grades, no quiz grade, preserved owners, idempotent upload, responsive UI.',{expectedEmulatorDisconnects:expectedDisconnects});
  }catch(error){await page.screenshot({path:path.join(out,'failure.png')});console.log('Failure route:',page.url());throw error}
  finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
