// Actual Reception mount: delayed language return, tab changes and HTTP503.
// Synthetic IndexedDB-only profile; every non-local network request is blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const base=process.env.MODULE_TEST_URL||'http://127.0.0.1:8765/';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Locale race QA requires an isolated localhost server');
const output=path.join(process.env.QA_OUT||require('node:os').tmpdir(),'reception-locale-race');
fs.mkdirSync(output,{recursive:true});
const scope={owner:'student:9909134991',activitySlug:'seminar-5',mode:'2026-2027:practice'};
const fakeBackend=`import {durableStore as store} from '/assets/js/durable-store.js';
const profile={studentKey:'9909134991',fullName:'Synthetic Locale Audit',group:'ГГУбд-02-26'};
export const backend={user:{uid:'local-audit-only'},isAdmin:()=>false,getProfile:()=>profile,serverTimeOffset:0,
loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,{...o,queue:false}),saveAttempt:()=>{throw Error('This audit never completes work');}};`;
const fixture='<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reception locale race audit</title><body style="margin:0"><div id="module"></div></body></html>';
async function flush(page){await page.evaluate(()=>window.handle.flush());}
async function saved(page){return page.evaluate(async s=>(await import('/assets/js/durable-store.js')).durableStore.loadDraft(s),scope);}
async function language(page,value){await page.evaluate(value=>{window.qaLocale=value;window.handle.refreshLocale(value);},value);}
async function focusState(page){return page.evaluate(()=>{const input=document.querySelector('[data-field="knowledge.lawNumber"]');return {value:input?.value,focused:document.activeElement===input,start:input?.selectionStart,end:input?.selectionEnd,lang:window.handle.getLocale(),rootLang:document.querySelector('#module').lang};});}
async function openResearch(page){await page.locator('[data-action="start"]').first().click();await flush(page);await page.locator('[data-action="tab"][data-tab="research"]').click();await flush(page);}
async function mount(page){await page.evaluate(async()=>{
window.qaLocale='ru';window.missing=[];
const {backend}=await import('/assets/js/backend.js?v=qa');
const {mountReception}=await import('/apps/reception/js/app.js');
const {BUNDLED_CALENDARS}=await import('/assets/js/calendar-bundled.js');
window.handle=await mountReception(document.querySelector('#module'),{backend,period:'2026-2027',locale:'ru',getLocale:()=>window.qaLocale,onMissingTranslation:text=>window.missing.push(text),calendarLoader:async()=>({year:2026,snapshot:BUNDLED_CALENDARS,stale:false,origins:[],unavailableYears:[],loadedAt:new Date().toISOString()})});
});await page.waitForFunction(()=>window.handle?.getLocale()==='ru'&&document.querySelector('.rx-global-status'));}
(async()=>{
 const all=[];
 for(const engine of (process.env.DURABLE_TEST_BROWSERS||'chromium,webkit').split(',')){
  const browser=await ({chromium,webkit}[engine]).launch({headless:true});
  try{
   for(const scenario of ['rapid-return','tab-and-input','failed-input']){
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    const page=await context.newPage();page.setDefaultTimeout(20000);
    const errors=[],requests=[];let release,seenResolve;
    const gate=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>seenResolve=resolve);
    let held=false;
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
     const url=new URL(route.request().url());requests.push(url.href);
     if(url.origin!==new URL(base).origin)return route.abort();
     if(url.pathname.endsWith('/assets/js/backend.js'))return route.fulfill({contentType:'text/javascript',body:fakeBackend});
     if(url.pathname.endsWith('/reception-locale-race.html'))return route.fulfill({contentType:'text/html',body:fixture});
     if(url.pathname.endsWith('/localization/compiled/en.manifest.json')&&!held){held=true;seenResolve();await gate;if(scenario==='failed-input')return route.fulfill({status:503,contentType:'text/plain',body:'Synthetic unavailable'});}
     try{return await route.continue();}catch(error){if(!/already handled|Target.*closed/i.test(error.message))throw error;}
    });
    try{
     await page.goto(base+'reception-locale-race.html');await mount(page);
     assert.equal(await page.title(),'Reception locale race audit');
     await openResearch(page);
     const field=page.locator('[data-field="knowledge.lawNumber"]');
     await field.fill('Alpha 12345');await flush(page);
     await field.evaluate(el=>{el.focus();el.setSelectionRange(2,7);});
     const initial=await saved(page);await language(page,'en');await seen;
     if(scenario==='rapid-return'){
      await language(page,'ru');await page.waitForTimeout(100);release();
      await page.waitForTimeout(1200);await flush(page);
      const state=await focusState(page);
      assert.equal(state.lang,'ru');assert.equal(state.rootLang,'ru');
      assert.equal(state.focused,true);assert.deepEqual([state.start,state.end],[2,7]);
      const after=(await saved(page)).state;
      for(const key of ['id','assignment','startedAt','caseIds','cases','active','screen'])assert.deepEqual(after[key],initial.state[key]);
      all.push({engine,scenario,status:'PASS',...state});
     }else{
      await page.locator('[data-action="tab"][data-tab="docs"]').click();await flush(page);
      assert.equal(await page.locator('.rx-nav [data-tab="docs"]').getAttribute('aria-current'),'page');
      await page.locator('.rx-nav [data-action="tab"][data-tab="research"]').click();await flush(page);
      await field.fill('Beta 67890');await flush(page);
      await field.evaluate(el=>{el.focus();el.setSelectionRange(1,6);});
      release();
      if(scenario==='failed-input')await page.waitForFunction(()=>document.querySelector('.rx-locale-status'));
      else await page.waitForFunction(()=>window.handle.getLocale()==='en');
      await page.waitForTimeout(100);await flush(page);
      const state=await focusState(page),after=await saved(page),activeId=after.state.caseIds[after.state.active];
      assert.equal(after.state.cases[activeId].knowledge.lawNumber,'Beta 67890');
      assert.equal(after.state.id,initial.state.id);assert.deepEqual(after.state.assignment,initial.state.assignment);assert.equal(after.state.startedAt,initial.state.startedAt);
      assert.equal(state.value,'Beta 67890');
      const focusOK=state.focused&&state.start===1&&state.end===6;
      assert.equal(focusOK,true,'Successful and failed translation loads preserve focus and selection');
      if(scenario==='failed-input'){
       assert.equal(await page.locator('[data-action="retry-locale"]').count(),1,'Retry remains after failed translation');
       await field.fill('After failure 24680');await flush(page);
       assert.equal(await page.locator('[data-action="retry-locale"]').count(),1,'Saving further input must not erase Retry');
       assert.match(await page.locator('.rx-locale-status').innerText(),/unavailable|Retry/);
      }
      all.push({engine,scenario,status:focusOK?'PASS':'FAIL_FOCUS',...state,answersRetained:true,retryButtons:await page.locator('[data-action="retry-locale"]').count(),localeStatus:await page.evaluate(()=>document.querySelector('.rx-locale-status')?.textContent||null)});
     }
     assert.deepEqual(errors,[]);assert.equal(requests.some(url=>new URL(url).origin!==new URL(base).origin),false);
     assert.equal(await page.locator('.rx-blocker,[data-nextjs-dialog],vite-error-overlay').count(),0);
     await page.screenshot({path:path.join(output,engine+'-'+scenario+'.png'),fullPage:false});
     console.log(JSON.stringify(all.at(-1)));
    }finally{release();await context.close();}
   }
  }finally{await browser.close();}
 }
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(all,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
