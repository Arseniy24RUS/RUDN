// UI persistence regression harness. Backend is replaced with device-only test state;
// every external request is blocked. This script never reads/writes production Firebase.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const base=process.env.MODULE_TEST_URL||'http://127.0.0.1:8765/';
const out=process.env.QA_OUT||path.join(require('node:os').tmpdir(),'rudn-module-drafts');fs.mkdirSync(out,{recursive:true});
const fake=`import {durableStore as d} from '/assets/js/durable-store.js?v=1.3.3';
const profile={studentKey:'9909133001',ticket:'9909133001',fullName:'Синтетический Тест Модулей',group:'ГГУбд-02-26'};
export const groupOptions=()=>['ГГУбд-01-26','ГГУбд-02-26','ГГУбд-03-26','ГГУбд-04-26','ГГУбд-05-26','ГГУбд-06-26'];
export const backend={profile,authReady:true,user:{uid:'module-test-uid'},serverTimeOffset:0,isAdmin:()=>false,getProfile:()=>profile,init:async()=>backend,
 globalNow:()=>Date.now(),getAccessOverrides:()=>Object.fromEntries(Array.from({length:8},(_,i)=>['topic-'+(i+1),'open'])),onStatus:()=>()=>{},
 getGrades:async()=>({}),getPuzzleLeaderboard:async()=>[],savePuzzleLeaderboardResult:async()=>{},loadDraft:s=>d.loadDraft(s),checkpoint:(s,o)=>d.checkpoint(s,o),
 localAttempts:()=>Object.keys(localStorage).filter(k=>k.startsWith('rudn.attempt.v2:')).map(k=>JSON.parse(localStorage[k])),
 saveAttempt:async r=>{r={...r,id:r.id||crypto.randomUUID(),studentKey:profile.studentKey};const s={owner:'student:'+profile.studentKey,activitySlug:r.activitySlug,mode:r.draftMode||r.mode||'default',attemptId:r.id};const old=await d.loadDraft(s);await d.complete({...s,state:old?.state||{},attempt:r});localStorage.setItem('rudn.attempt.v2:'+profile.studentKey+':'+r.id,JSON.stringify(r));return r;},
};`;
const owner='student:9909133001';
async function draft(page,activitySlug,mode){return page.evaluate(async s=>(await import('/assets/js/durable-store.js?v=1.3.3')).durableStore.loadDraft(s),{owner,activitySlug,mode})}
async function flush(page){await page.evaluate(async()=>{await window.moduleHandle?.flush?.();await (await import('/assets/js/durable-store.js?v=1.3.3')).durableStore.flush()})}
async function poll(fn,label){for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,125))}throw Error(label)}
async function fixture(page){await page.goto(base+'module-draft-test.html')}
async function shot(page,name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:false})}
async function mountReception(page){await page.evaluate(async()=>{const {backend}=await import('/assets/js/backend.js?v=1.3.3'),{mountReception}=await import('/apps/reception/js/app.js'),{BUNDLED_CALENDARS}=await import('/assets/js/calendar-bundled.js');window.moduleHandle=await mountReception(document.querySelector('#module'),{backend,period:'2026-2027',calendarLoader:async()=>({year:2026,snapshot:BUNDLED_CALENDARS,stale:false,origins:[],unavailableYears:[],loadedAt:new Date().toISOString()}),assessmentAllowed:true})})}
async function mountCareer(page){await page.evaluate(async()=>{const {mountCareer}=await import('/apps/career/entry.mjs');window.moduleHandle=await mountCareer(document.querySelector('#module'),{owner:'student:9909133001',lang:'ru'})})}
const requested=(process.env.MODULES||'reception,career,puzzle,governor').split(',');
(async()=>{
 for(const name of (process.env.DURABLE_TEST_BROWSERS||'chromium,webkit').split(',')){
  const browser=await ({chromium,webkit}[name]).launch({headless:true});
  try{
   for(const module of requested){
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',serviceWorkers:'block'});const errors=[];
    await context.route('**/assets/js/backend.js*',r=>r.fulfill({contentType:'application/javascript',body:fake}));
    await context.route('**/module-draft-test.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated module persistence test</title><body style="margin:0"><div id="module"></div></body></html>'}));
    await context.route(/^https:\/\//,r=>r.abort());
    await context.addInitScript(()=>localStorage.setItem('rudn.locale','ru'));
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    try{
     if(module==='career'){
      await fixture(page);await mountCareer(page);await page.locator('#start-test-button').click();
      for(let i=0;i<27;i++){
       await page.locator('#answer-options [data-answer="3"]').click();await page.locator('#question-next').click();
       if(i===10){await flush(page);const before=await draft(page,'career-workspace','diagnostic');for(const lang of ['en','zh','ru'])await page.evaluate(lang=>moduleHandle.setLocale(lang),lang);await flush(page);const after=await draft(page,'career-workspace','diagnostic');assert.deepEqual(after.state.values,before.state.values);await shot(page,name+'-career-middle');await page.evaluate(()=>moduleHandle.destroy());await fixture(page);await mountCareer(page);assert.equal(JSON.parse((await draft(page,'career-workspace','diagnostic')).state.values['answers-v8']).questionIndex,11);}
      }
      for(let i=0;i<4;i++)await page.locator('.sector-card .priority-toggle').nth(i).click();
      for(let i=4;i<6;i++)await page.locator('.sector-card .low-toggle').nth(i).click();
      await page.locator('#sectors-next').click();const conditions=await page.locator('.condition-option[data-value="3"]').count();
      for(let i=0;i<conditions;i++)await page.locator('.condition-option[data-value="3"]').nth(i).click();
      await page.locator('#calculate-button').click();await flush(page);
      const attempts=await page.evaluate(async()=> (await import('/assets/js/durable-store.js?v=1.3.3')).durableStore.listAttempts({owner:'student:9909133001'}));
      assert.equal(attempts.length,1);assert.equal(attempts[0].recordGrade,false);assert.equal(attempts[0].activitySlug,'career-diagnostic');
      await shot(page,name+'-career-result');
     }
     if(module==='reception'){
      await fixture(page);await mountReception(page);await page.locator('[data-mode="assessment"]').check();await page.locator('[data-action="start"]').click();
      await page.locator('[data-action="tab"][data-tab="research"]').click();
      const input=page.locator('input[type="text"][data-field]').first(),field=await input.getAttribute('data-field');await input.pressSequentially('Последний символ сохранён',{delay:20});
      // Dispose immediately, without an arbitrary delay: the pending input must drain.
      await page.evaluate(()=>moduleHandle());
      const before=await draft(page,'seminar-5','2026-2027:assessment');assert.equal(field.split('.').reduce((value,key)=>value[key],before.state.cases[before.state.caseIds[0]]),'Последний символ сохранён');
      await fixture(page);await mountReception(page);const after=await draft(page,'seminar-5','2026-2027:assessment');assert.deepEqual(after.state.caseIds,before.state.caseIds);assert.equal(after.state.seed,before.state.seed);
      for(let i=0;i<after.state.caseIds.length;i++){
       await page.locator('[data-action="tab"][data-tab="plan"]').click();await page.locator('[data-action="skip"]').click();await page.locator('.rx-confirm-dialog [value="accept"]').click();
       await page.locator('[data-action="skip-followup"]').click();
       await page.locator(`[data-action="${i<after.state.caseIds.length-1?'next':'finish'}"]`).click();
      }
      await poll(async()=> (await draft(page,'seminar-5','2026-2027:assessment'))?.phase==='completed','Reception not completed');await flush(page);
      const done=await draft(page,'seminar-5','2026-2027:assessment');assert.equal(done.state.completed,true);assert.equal(done.attemptId,before.attemptId);
      assert.equal(await page.locator('[data-feedback="training"]').count(),0);await shot(page,name+'-reception-result');
     }
     if(module==='puzzle'){
      await page.goto(base+'apps/puzzle.html?context=free');await page.locator('#puzzleStart').click();
      await poll(async()=>Boolean(await draft(page,'maps-freeplay','free')),'Puzzle not started');
      const canvas=page.locator('#puzzleCanvas');await canvas.focus();await canvas.press('Enter');await canvas.press('ArrowRight');await canvas.press('h');await canvas.press('ArrowDown');await flush(page);
      await page.waitForTimeout(1100);await canvas.press('ArrowRight');await flush(page);
      const before=await draft(page,'maps-freeplay','free');assert.equal(before.state.hints,1);assert.equal(before.state.pieces[before.state.current].inTray,false);
      assert(before.state.view.centre.every(Number.isFinite),'Finite projected map centre');
      await canvas.scrollIntoViewIfNeeded();await shot(page,name+'-puzzle-before-reload');await page.reload();await poll(async()=> (await page.locator('#puzzleStart').innerText()).includes('другую'),'Puzzle did not restore');await flush(page);
      const after=await draft(page,'maps-freeplay','free');assert.equal(after.attemptId,before.attemptId);assert.deepEqual(after.state.order,before.state.order);assert.equal(after.state.hints,1);assert(after.state.elapsedMs>=before.state.elapsedMs);
      await page.setViewportSize({width:412,height:915});await page.reload();await poll(async()=> (await page.locator('#puzzleStart').innerText()).includes('другую'),'Puzzle orientation restore');
      assert.equal((await draft(page,'maps-freeplay','free')).attemptId,before.attemptId);await canvas.scrollIntoViewIfNeeded();await shot(page,name+'-puzzle-restored-412');
      // Seed only this isolated test draft at the final piece to verify the completion boundary.
      await fixture(page);
      await page.evaluate(async owner=>{const d=(await import('/assets/js/durable-store.js?v=1.3.3')).durableStore,s={owner,activitySlug:'maps-freeplay',mode:'free'},old=await d.loadDraft(s),state=structuredClone(old.state);state.cursor=88;state.current=state.order[88];state.placed=88;state.pieces=state.pieces.map(p=>({...p,locked:p.index!==state.current,inTray:p.index===state.current,point:null,dx:0,dy:0}));await d.checkpoint({...s,attemptId:old.attemptId,state});},owner);
      await page.goto(base+'apps/puzzle.html?context=free');await poll(async()=> (await page.locator('#puzzleStart').innerText()).includes('другую'),'Final piece restore');
      await canvas.focus();await canvas.press('Enter');await canvas.press('Enter');await page.locator('#puzzleResultDialog[open]').waitFor();await flush(page);
      const attempts=await page.evaluate(async owner=>(await import('/assets/js/durable-store.js?v=1.3.3')).durableStore.listAttempts({owner}),owner);assert.equal(attempts.length,1);assert.equal(attempts[0].recordGrade,false);assert.equal(attempts[0].placed,89);assert(attempts[0].durationMs>=1000);await shot(page,name+'-puzzle-result');
     }
     if(module==='governor'){
      await page.goto(base+'apps/governor/index.html');await page.locator('#platform-loading').waitFor({state:'hidden'});
      await page.locator('#campaign-options > summary').click();await page.locator('#campaign-mode').selectOption('guided');await page.locator('#scenario-select').selectOption('balanced');await page.locator('#session-seed').fill('DURABLE-QA');await page.locator('#start-form [type="submit"]').click();
      for(let i=1;i<=20;i++){
       const chapter=page.locator('[data-enter-chapter]:visible');if(await chapter.count())await chapter.click();
       await page.locator('#action-cards .defer-action').click();await page.locator('#confirm-action').click();await page.locator('#resolution-dialog[open]').waitFor();
       await page.locator('#continue-turn').click();await flush(page);
       if(i===2){const before=await draft(page,'seminar-7','campaign');assert.equal(before.state.campaign.history.length,2);await shot(page,name+'-governor-middle');await page.reload();await page.locator('#platform-loading').waitFor({state:'hidden'});await page.locator('#continue-campaign').click();const after=await draft(page,'seminar-7','campaign');assert.equal(after.attemptId,before.attemptId);assert.equal(after.state.campaign.history.length,2);assert.equal(after.state.run.submissionId,before.state.run.submissionId);}
      }
      await page.locator('#end-dialog[open]').waitFor();await poll(async()=> (await draft(page,'seminar-7','campaign'))?.phase==='completed','Governor completion not persisted');await flush(page);
      const done=await draft(page,'seminar-7','campaign');assert.equal(done.state.campaign.history.length,20);await shot(page,name+'-governor-result');
     }
     assert.deepEqual(errors,[],module+' page errors');console.log(`PASS ${name} ${module}: persistent state, reload and completion invariants`);
    }catch(error){await shot(page,name+'-'+module+'-failure');console.log('Failure route:',page.url(),'errors:',errors);throw error}
    finally{await context.close()}
   }
  }finally{await browser.close()}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
