// Real module mounts and IndexedDB, isolated loopback backend. No Firebase calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),pw=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=new URL('../site/',import.meta.url);
const backendSource=`import {durableStore as store} from '/assets/js/durable-store.js';
const profile=()=>JSON.parse(localStorage.getItem('qa.profile')||'null');
export const groupOptions=()=>['ГГУбд-01-26'];
export const backend={authReady:true,user:{uid:'isolated-only'},mode:'local',connected:false,serverTimeOffset:0,
getProfile:profile,isAdmin:()=>false,init:async()=>{},onStatus:()=>()=>{},status:()=>({}),globalNow:()=>Date.parse('2026-09-17T12:00:00Z'),
getAccessOverrides:()=>({'topic-7':{state:localStorage.getItem('qa.closed')==='yes'?'closed':'open'}}),
localGrades:()=>JSON.parse(localStorage.getItem('qa.grades')||'{}'),localAttempts:()=>JSON.parse(localStorage.getItem('qa.attempts')||'[]'),
loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,o),
saveAttempt:async attempt=>{try{if(!profile())throw Error('Guest called signed-in saveAttempt');
if(window.qaHoldSave)await new Promise(resolve=>{window.qaReleaseSave=()=>{window.qaHoldSave=false;resolve();};});
const p=profile(),scope={owner:'student:'+p.studentKey,activitySlug:attempt.activitySlug,mode:attempt.draftMode,attemptId:attempt.id};
if(attempt.activitySlug.endsWith('-freeplay')&&attempt.recordGrade!==false)throw Error('Free result attempted to grade');
const previous=await store.loadDraft(scope);const saved=await store.complete({...scope,state:previous?.state||{},attempt});
window.qaSaveReceipt=saved?.saveStatus;
const attempts=backend.localAttempts();if(!attempts.some(a=>a.id===attempt.id))attempts.push(attempt);
// Match the real backend: a full legacy localStorage mirror cannot reject a
// result already committed to IndexedDB. Keep diagnostic evidence in memory.
try{localStorage.setItem('qa.attempts',JSON.stringify(attempts));}catch(error){window.qaMirrorError=String(error);}
window.qaCompletedAttempts=[...(window.qaCompletedAttempts||[]),attempt.id];
return {...attempt,saveStatus:saved?.saveStatus};}catch(error){window.qaSaveError=String(error.stack||error);throw error;}}};`;
const types={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/qa.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="module"></div>');return;}
  if(path==='/assets/js/backend.js'){res.setHeader('Content-Type','text/javascript');res.end(backendSource);return;}
  const url=new URL('.'+path,root);if(!fileURLToPath(url).startsWith(fileURLToPath(root)))throw Error('path');
  const bytes=await readFile(url);res.setHeader('Content-Type',types[path.slice(path.lastIndexOf('.'))]||'application/octet-stream');res.end(bytes);
 }catch{res.statusCode=404;res.end('Missing test resource');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,profile={studentKey:'free-context-a',fullName:'Isolated QA',group:'ГГУбд-01-26'};
const flush=page=>page.evaluate(async()=>{await window.handle?.flush?.();await (await import('/assets/js/durable-store.js')).durableStore.flush();});
const load=(page,scope)=>page.evaluate(async scope=>(await import('/assets/js/durable-store.js')).durableStore.loadDraft(scope),scope);
const governorPersistence=async(page,owner)=>page.evaluate(async owner=>{
 const store=(await import('/assets/js/durable-store.js')).durableStore;
 const attempts=await store.listAttempts({owner});
 const draft=await store.loadDraft({owner,activitySlug:'governor-freeplay',mode:'campaign'});
 const run=JSON.parse(GovernorGame.Platform.storage.getItem('platform-run')||'{}');
 const mirrors=Object.keys(localStorage).filter(key=>key.startsWith('rudn.durable.mirror.v1:')).map(key=>{const value=JSON.parse(localStorage.getItem(key));return {owner:value.draft?.owner,attemptId:value.attempt?.attemptId,draftId:value.draft?.attemptId,fallback:value.fallback};});
 return {attemptIds:attempts.map(attempt=>attempt.id),draftId:draft?.attemptId,phase:draft?.phase,saveStatus:draft?.saveStatus,
  runId:run.submissionId,submitted:run.submitted,receipt:window.qaSaveReceipt,mirrorError:window.qaMirrorError,
  mirrorAttempts:mirrors.filter(value=>value.owner===owner),storageBytes:Object.keys(localStorage).reduce((sum,key)=>sum+2*(key.length+(localStorage.getItem(key)||'').length),0)};
},owner);
async function mount(page,module,context,guest=false){
 await page.evaluate(async({module,context,guest,profile})=>{
  await window.handle?.flush?.();if(window.handle?.destroy)await window.handle.destroy();else window.handle?.();
  if(guest)localStorage.removeItem('qa.profile');else localStorage.setItem('qa.profile',JSON.stringify(profile));
  const root=document.querySelector('#module');root.replaceChildren();
  if(module==='reception'){
   const {backend}=await import('/assets/js/backend.js');const {mountReception}=await import('/apps/reception/js/app.js');const {BUNDLED_CALENDARS}=await import('/assets/js/calendar-bundled.js');
   window.handle=await mountReception(root,{backend,context,editorTools:false,assessmentAllowed:true,period:'2026-2027',locale:'ru',calendarLoader:async()=>({year:2026,snapshot:BUNDLED_CALENDARS,stale:false,origins:[],unavailableYears:[],loadedAt:'2026-09-17T00:00:00Z'})});
  }else{
   window.handle=await (await import('/apps/career/entry.mjs')).mountCareer(root,{owner:guest?'guest:career':'student:'+profile.studentKey,context,lang:'ru',initialRoute:'test'});
  }
 },{module,context,guest,profile});
 if(module==='reception')await page.locator('.rx-global-status').waitFor();else await page.locator('#module[data-career-ready=true]').waitFor();
}
try{
 for(const engine of (process.env.DURABLE_TEST_BROWSERS||'chromium,webkit').split(',')){
  const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  try{
   for(const module of ['reception','career'].filter(name=>!process.env.FREE_MODULES||process.env.FREE_MODULES.split(',').includes(name))){
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await page.goto(base+'/qa.html');await mount(page,module,'course');
    const courseScope={owner:'student:'+profile.studentKey,activitySlug:module==='reception'?'seminar-5':'career-workspace',mode:module==='reception'?'2026-2027:practice':'diagnostic'};
    const freeScope={...courseScope,activitySlug:module+'-freeplay',mode:module==='reception'?'2026-2027:practice':'workspace'};
    const answer=async value=>{await page.locator(module==='reception'?'[data-action="start"]':`#answer-options [data-answer="${value}"]`).first().click();await flush(page);};
    await answer(2);const original=await load(page,courseScope);assert(original?.state);
    await mount(page,module,'free');if(module==='reception')assert.equal(await page.locator('[data-mode]').count(),0,'Free Reception has no assessment selector');
    await answer(4);const free=await load(page,freeScope);assert(free?.state);assert.notEqual(free.id,original.id);
    assert.deepEqual((await load(page,courseScope)).state,original.state,'Free actions leave course state intact');
    await mount(page,module,'course');assert.deepEqual((await load(page,courseScope)).state,original.state);
    await page.reload();await mount(page,module,'free');assert.deepEqual((await load(page,freeScope)).state,free.state,'Free reload restores exact saved state');
    await mount(page,module,'free',true);await answer(3);const guest=await load(page,{...freeScope,owner:'guest:'+module});assert(guest?.state);
    assert.deepEqual((await load(page,freeScope)).state,free.state,'Guest play does not change student free state');
    assert.deepEqual((await load(page,courseScope)).state,original.state);
    if(module==='career'){
     // Complete the actual diagnostic UI as a guest; this exercises the local
     // result handler as well as the independently saved 16-view workspace.
     const completeCareer=async()=>{
      await page.evaluate(()=>window.handle.navigate('test'));
      for(let question=0;question<27;question++){
       await page.locator('#answer-options [data-answer="3"]').click();
       await page.locator('#question-next').click();
      }
      for(let sector=0;sector<4;sector++)await page.locator('.priority-toggle').nth(sector).click();
      for(let sector=4;sector<6;sector++)await page.locator('.low-toggle').nth(sector).click();
      await page.locator('#sectors-next').click();
      const conditions=await page.locator('.condition-option[data-value="3"]').count();assert(conditions>0);
      for(let condition=0;condition<conditions;condition++)await page.locator('.condition-option[data-value="3"]').nth(condition).click();
      await page.locator('#calculate-button').click();await flush(page);
     };
     await completeCareer();
     const attempts=await page.evaluate(async()=>(await import('/assets/js/durable-store.js')).durableStore.listAttempts({owner:'guest:career'}));
     assert.equal(attempts.length,1);assert.equal(attempts[0].activitySlug,'career-freeplay');assert.equal(attempts[0].recordGrade,false);
     await page.reload();await mount(page,module,'free',true);
     for(const route of ['home','test','sectors','conditions','results','directory','compare','seminar','methodology','structure','scenarios','opportunities','workshop','lab','public-service','vacancies'])await page.evaluate(route=>window.handle.navigate(route),route);
     await flush(page);
     assert.equal((await page.evaluate(async()=>(await import('/assets/js/durable-store.js')).durableStore.listAttempts({owner:'guest:career'}))).length,1);
     await mount(page,module,'free');await completeCareer();
     const signedAttempts=await page.evaluate(async owner=>(await import('/assets/js/durable-store.js')).durableStore.listAttempts({owner}),freeScope.owner);
     assert.equal(signedAttempts.length,1);assert.equal(signedAttempts[0].activitySlug,'career-freeplay');assert.equal(signedAttempts[0].recordGrade,false);
     assert((await page.evaluate(()=>window.qaCompletedAttempts||[])).includes(signedAttempts[0].id),'Signed-in result reaches the shared Backend instance');
    }else{
     // Free play has its own replay archive as well as its own active draft.
     await page.locator('[data-action="home"]').first().click();
     await page.locator('[data-action="open-bank"]').click();
     await page.locator('[data-action="random-practice"]').click();
     await page.locator('.rx-confirm-dialog button[value="accept"]').click();
     // Calendar/content preparation is outside the edit queue. Wait for the
     // committed replacement, not merely the confirmation click or old flush.
     await page.waitForFunction(id=>{
      const value=localStorage.getItem('rudn.reception.free:rudn.reception.v16:preview:2026-2027:practice');
      return value&&JSON.parse(value).id!==id;
     },guest.state.id);await flush(page);
     const replay=await load(page,{...freeScope,owner:'guest:reception'});
     assert.notEqual(replay.state.id,guest.state.id,'Replay creates a new free attempt');
     assert(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('rudn.reception.free:rudn.reception.archive.'))),'Free replay archives only in the free namespace');
     await page.evaluate(profile=>{localStorage.setItem('qa.profile',JSON.stringify(profile));window.dispatchEvent(new CustomEvent('rudn:identitychange'));},profile);
     await page.locator('.rx-blocker').waitFor();
     assert.deepEqual((await load(page,freeScope)).state,free.state,'Identity event cannot move guest answers into student state');
    }
    assert.deepEqual((await load(page,courseScope)).state,original.state);
    assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${engine} ${module}: course/free/guest scopes, real input, reload, old drafts retained`);
   }
   for(const guest of (!process.env.FREE_MODULES||process.env.FREE_MODULES.split(',').includes('governor')?(process.env.FREE_GOVERNOR_IDENTITY==='student'?[false]:process.env.FREE_GOVERNOR_IDENTITY==='guest'?[true]:[true,false]):[])){
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await context.addInitScript(({guest,profile})=>{if(localStorage.getItem('qa.closed')===null)localStorage.setItem('qa.closed','yes');if(!guest)localStorage.setItem('qa.profile',JSON.stringify(profile));localStorage.setItem('qa.grades',JSON.stringify({'seminar-7':{points:4}}));localStorage.setItem('rudn.governor.v1:student%3Afree-context-a:sentinel','course-unchanged');},{guest,profile});
    await page.goto(base+'/apps/governor/index.html?context=free');
    if(!guest){
     // Student free play follows the course gate; guests remain unrestricted.
     await page.waitForFunction(()=>/Раздел 7 закрыт преподавателем|Section 7 is closed by the instructor/.test(document.querySelector('#platform-loading-text')?.textContent||''));
     assert.equal(await page.locator('#app').isVisible(),false,'Closed course topic blocks student free play');
     await page.evaluate(()=>{localStorage.setItem('qa.closed','no');window.dispatchEvent(new Event('rudn:accesschange'));});
    }
    await page.locator('html[data-app-ready=true]').waitFor();
    assert.equal(await page.locator('#app').evaluate(el=>el.hidden||el.inert),false,guest?'Guests can play with a closed course topic':'Students can play after the course topic opens');
    if(!await page.locator('#campaign-options').getAttribute('open'))await page.locator('#campaign-options > summary').click();
    await page.locator('#campaign-mode').selectOption('guided');await page.locator('#scenario-select').selectOption('balanced');await page.locator('#session-seed').fill('FREE-CONTEXT');await page.locator('#start-form button[type=submit]').click();
    await page.locator('#game-shell:not(.hidden)').waitFor();
    if(!guest)await page.evaluate(()=>{window.qaHoldSave=true;});
    const chapter=async()=>{const entry=page.locator('[data-enter-chapter]:visible');if(await entry.count())await entry.click();};
    for(let turn=1;turn<=20;turn++){
     await chapter();await page.locator('#action-cards .defer-action').click();await page.locator('#confirm-action').click();await page.locator('#resolution-dialog[open]').waitFor();await page.locator('#continue-turn').click();
    }
    await page.locator('#end-dialog[open]').waitFor();
    const owner=guest?'guest:governor':'student:'+profile.studentKey;
    let pendingReplayId=null;
    if(!guest){
     await page.waitForFunction(()=>typeof window.qaReleaseSave==='function');
     await page.locator('#play-again').click();await page.locator('#start-form').waitFor();
     await page.locator('#start-form button[type=submit]').click();await page.locator('#game-shell:not(.hidden)').waitFor();
     pendingReplayId=await page.evaluate(()=>JSON.parse(GovernorGame.Platform.storage.getItem('platform-run')).submissionId);
     await page.evaluate(()=>window.qaReleaseSave());
    }
    await page.waitForFunction(pendingReplay=>pendingReplay?window.qaCompletedAttempts?.length===1:JSON.parse(GovernorGame.Platform.storage.getItem('platform-run')||'{}').submitted===true,Boolean(pendingReplayId),{timeout:60000}).catch(async error=>{console.error(await page.evaluate(()=>({status:document.querySelector('#platform-status').textContent,run:GovernorGame.Platform.storage.getItem('platform-run'),attempts:localStorage.getItem('qa.attempts'),error:window.qaSaveError,mirrorError:window.qaMirrorError})));throw error;});
    if(pendingReplayId)assert.notEqual(await page.evaluate(()=>JSON.parse(GovernorGame.Platform.storage.getItem('platform-run')).submitted),true,'An old delayed receipt cannot mark the replay submitted');
    const attempt=await page.evaluate(async owner=>{const store=(await import('/assets/js/durable-store.js')).durableStore;const rows=await store.listAttempts({owner});return rows[0];},owner);
    assert.equal(attempt.activitySlug,'governor-freeplay');assert.equal(attempt.recordGrade,false);assert.equal(attempt.governor.decisions,20);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa.grades'))),{'seminar-7':{points:4}});
    assert.equal(await page.evaluate(()=>localStorage.getItem('rudn.governor.v1:student%3Afree-context-a:sentinel')),'course-unchanged');
    const beforeReload=await governorPersistence(page,owner);
    if(!guest)assert.equal(beforeReload.receipt?.durable,true,'Signed-in completion must acknowledge durable storage before reload');
    if(process.env.GOVERNOR_PERSISTENCE_DIAGNOSTICS)console.log(JSON.stringify({engine,guest,beforeReload}));
    await page.reload();await page.locator('html[data-app-ready=true]').waitFor();
    const afterReload=await governorPersistence(page,owner);
    if(afterReload.attemptIds.length!==1||process.env.GOVERNOR_PERSISTENCE_DIAGNOSTICS)console.log(JSON.stringify({engine,guest,beforeReload,afterReload}));
    assert.equal(afterReload.attemptIds.length,1,'Completed restore retains exactly one completed attempt');
    assert.deepEqual(afterReload.attemptIds,beforeReload.attemptIds,'Restore retains the original immutable completion ID');
    if(!pendingReplayId){
     await page.locator('#continue-campaign').click();await page.locator('#end-dialog[open]').waitFor();
     await page.locator('#play-again').click();await page.locator('#start-form').waitFor();
     await page.locator('#start-form button[type=submit]').click();await page.locator('#game-shell:not(.hidden)').waitFor();
    }
    const replayRun=await page.evaluate(()=>JSON.parse(GovernorGame.Platform.storage.getItem('platform-run')));
    assert.notEqual(replayRun.submissionId,attempt.id,'Replay owns a fresh attempt ID');
    assert.equal(replayRun.submitted,undefined);
    if(pendingReplayId)assert.equal(replayRun.submissionId,pendingReplayId,'New campaign survives reload after the old receipt');
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa.grades'))),{'seminar-7':{points:4}});
    await page.evaluate(({guest,profile})=>{if(guest)localStorage.setItem('qa.profile',JSON.stringify(profile));else localStorage.removeItem('qa.profile');window.dispatchEvent(new CustomEvent('rudn:identitychange'));},{guest,profile});
    assert.equal(await page.locator('#app').evaluate(el=>el.hidden&&el.inert),true,'Identity change freezes the previous owner campaign');
    assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${engine} governor ${guest?'guest closed-gate entry':'student locked-then-open entry'}: all20 UI decisions, ungraded completion, idempotent restore`);
   }
  }finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
