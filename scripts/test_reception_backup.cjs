// Standalone file-import boundary regression. Synthetic preview work only.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const base=process.env.MODULE_TEST_URL||'http://127.0.0.1:8765/';
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))throw Error('Localhost only');
(async()=>{
  const engine=await import(pathToFileURL(path.resolve('site/apps/reception/js/engine.js')));
  const state=await engine.newShiftPrepared('preview','practice',{period:'2026-2027',calendarYear:2026,seed:'standalone-lazy-backup',id:'synthetic-standalone-import',templateId:'court-typo-not-merits'});
  state.cases[state.caseIds[0]].knowledge.lawNumber='Сохранённый исходный ввод';state.revision=3;state.screen='work';
  const key='rudn.reception.v16:preview:2026-2027:practice';
  const backup={format:'rudn-reception-local-backup-1',entries:[{key,value:JSON.stringify(state)}]};
  for(const name of (process.env.DURABLE_TEST_BROWSERS||'chromium,webkit').split(',')){
    const browser=await ({chromium,webkit}[name]).launch({headless:true});
    try{
      for(const mode of ['available','offline','unknown']){
        const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await context.route('**/*',route=>{
          const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();
          if(url.pathname.endsWith('/backup-qa.html'))return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated backup test</title><main>Backup boundary</main>'});
          if(mode==='offline'&&/\/content\/cases\//.test(url.pathname))return route.abort();
          return route.continue();
        });
        try{
          await page.goto(base+'backup-qa.html');
          const result=await page.evaluate(async({backup,key,mode})=>{
            const check=(condition,message)=>{if(!condition)throw Error(message);};
            const library=await import('/apps/reception/js/content-library.js'),api=await import('/apps/reception/js/standalone.js');
            check(library.loadedContentIds().length===0,'Case was not previously loaded');
            localStorage.setItem('other-profile-progress','untouched');localStorage.setItem('rudn.profile.v1','{"studentKey":"synthetic-other"}');
            const previous=JSON.stringify({...localStorage});
            if(mode==='unknown'){const raw=JSON.parse(backup.entries[0].value);raw.assignment.manifest[0].templateId='unknown-saved-template';backup.entries[0].value=JSON.stringify(raw);}
            let prepared,error;
            try{prepared=await api.prepareLocalBackup(JSON.stringify(backup),{timeoutMs:200});}catch(value){error=value;}
            check(JSON.stringify({...localStorage})===previous,'Preparation/failure never writes or deletes local work');
            if(mode==='available'){
              check(!error,'Valid unloaded saved case rejected: '+error?.message);
              check(library.loadedContentIds().join(',')==='court-typo-not-merits','Only exact assigned template loaded');
              check(prepared.entries[0].value===backup.entries[0].value,'Saved JSON unchanged by prehydration');
              const count=api.restoreLocalBackup(prepared);check(count===1,'One exact backup entry restored');
              check(localStorage.getItem(key)===backup.entries[0].value,'Exact original draft restored');
            }else{
              check(error&&error.code===(mode==='unknown'?'content/unknown-template':'content/unavailable'),'Expected explicit unavailable/unknown error');
              check(!localStorage.getItem(key),'Failure never substitutes or creates a new draft');
              check(library.loadedContentIds().length===0,'Failure never installs a different case');
            }
            check(localStorage.getItem('other-profile-progress')==='untouched','Other progress preserved');
            check(localStorage.getItem('rudn.profile.v1')==='{"studentKey":"synthetic-other"}','Other profile preserved');
            return {mode,prepared:!!prepared,error:error?.code||null};
          },{backup:structuredClone(backup),key,mode});
          assert.deepEqual(errors,[]);console.log(name+': '+JSON.stringify(result));
        }finally{await context.close();}
      }
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
