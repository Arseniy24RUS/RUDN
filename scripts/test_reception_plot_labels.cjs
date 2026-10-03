// Deterministic real-UI witness: choose trees-other-site from the practice bank,
// enter every answer through controls, inspect the rendered draft, finish 100/100.
// Uses the same isolated local-backend pattern as test_reception_complete.cjs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const site=path.resolve(__dirname,'../site');
const output=process.env.QA_OUT||path.join(require('node:os').tmpdir(),'rudn-reception-plot-labels');
fs.mkdirSync(output,{recursive:true});
const owner='student:9909134019',scope={owner,activitySlug:'seminar-5',mode:'2026-2027:practice'};
const fixture='<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reception plot labels QA</title><body style="margin:0"><main id="module"></main></body></html>';
const backendSource=`import {durableStore as store} from '/assets/js/durable-store.js';
const profile={studentKey:'9909134019',ticket:'9909134019',fullName:'Synthetic Plot Label QA',group:'QA'};
export const backend={profile,user:{uid:'plot-label-local-only'},authReady:true,serverTimeOffset:0,isAdmin:()=>false,getProfile:()=>profile,
loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,o)};`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  response.setHeader('Cache-Control','no-store');
  if(pathname==='/plot-label-qa.html'){response.setHeader('Content-Type','text/html');response.end(fixture);return;}
  if(pathname==='/assets/js/backend.js'){response.setHeader('Content-Type','text/javascript');response.end(backendSource);return;}
  const file=path.resolve(site,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(site+path.sep)){response.writeHead(403);response.end();return;}
  fs.readFile(file,(error,data)=>{if(error){response.writeHead(404);response.end();return;}response.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');response.end(data);});
});
const attr=value=>JSON.stringify(String(value));
async function flush(page){await page.evaluate(async()=>{await window.moduleHandle.flush();await(await import('/assets/js/durable-store.js')).durableStore.flush();});}
async function act(page,action,extra=''){await page.locator(`[data-action=${attr(action)}]${extra}`).first().click();await flush(page);}
async function tab(page,id){await act(page,'tab',`[data-tab=${attr(id)}]`);}
async function choose(page,field,value){const control=page.locator(`input[type=radio][data-field=${attr(field)}][value=${attr(value)}]`);await control.check();await flush(page);assert.equal(await control.isChecked(),true);}
async function fill(page,field,value){await page.locator(`input[type=text][data-field=${attr(field)}]`).fill(String(value));await flush(page);}
async function health(page,errors){
  assert.deepEqual(errors,[],'No runtime/console errors');assert.deepEqual(await page.evaluate(()=>window.localeMissing),[],'No Cyrillic leak or missing translation');
  assert.equal(await page.locator('.rx-blocker,[data-nextjs-dialog],vite-error-overlay,webpack-dev-server-client-overlay').count(),0);
  assert.doesNotMatch(await page.locator('.rx-global-status').innerText(),/не удалось|ошибка|приостановлена|другой вкладке/i);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/`,results=[];
  try{
    for(const name of (process.env.DURABLE_TEST_BROWSERS||'chromium,webkit').split(','))for(const locale of ['en','zh']){
      const browser=await({chromium,webkit}[name]).launch({headless:true});
      const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      page.setDefaultTimeout(15000);
      await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
      try{
        await page.goto(base+'plot-label-qa.html');assert.equal(await page.title(),'Reception plot labels QA');
        await page.evaluate(async locale=>{
          window.localeMissing=[];
          const {backend}=await import('/assets/js/backend.js'),{mountReception}=await import('/apps/reception/js/app.js'),{BUNDLED_CALENDARS}=await import('/assets/js/calendar-bundled.js');
          window.moduleHandle=await mountReception(document.querySelector('#module'),{backend,period:'2026-2027',assessmentAllowed:true,locale,getLocale:()=>locale,
            onMissingTranslation:text=>window.localeMissing.push(text),calendarLoader:async()=>({year:2026,snapshot:BUNDLED_CALENDARS,stale:false,origins:[],unavailableYears:[],loadedAt:new Date().toISOString()})});
        },locale);
        await page.waitForFunction(locale=>window.moduleHandle.getLocale()===locale&&document.querySelector('.rx-global-status')&&!document.querySelector('.boot.rx-locale-status'),locale);
        await page.locator('[data-mode="practice"]').check();await flush(page);await act(page,'open-bank');
        await page.locator('[data-bank-search]').fill(locale==='en'?'neighbouring plot':'邻近地块');await act(page,'search-bank');
        // Restart loads a fresh case asynchronously; wait for its rendered game
        // bar before requesting a flush of the mounted module's current state.
        await page.locator('[data-action="choose-case"][data-template="trees-other-site"]').click();
        await page.locator('.rx-gamebar strong').filter({hasText:locale==='en'?'neighbouring plot':'邻近地块'}).waitFor();
        await page.waitForFunction(async scope=>{const state=(await(await import('/assets/js/durable-store.js')).durableStore.loadDraft(scope))?.state;return state?.assignment.manifest.length===1&&state.assignment.manifest[0].templateId==='trees-other-site'&&state.screen==='work';},scope);
        await flush(page);
        const key=await page.evaluate(async({scope,locale})=>{
          const state=(await(await import('/assets/js/durable-store.js')).durableStore.loadDraft(scope)).state;
          const engine=await import('/apps/reception/js/engine.js'),c=engine.caseById(state.caseIds[state.active],state),task=(await import('/apps/reception/js/evidence.js')).evidenceTask(c);
          const translator=await(await import('/apps/reception/localization/runtime.js')).loadReceptionTranslator(locale,{templateIds:['trees-other-site'],contentVersion:state.contentVersion});
          const plan=(await import('/apps/reception/js/documents.js')).requiredActionPlan(c,c.correctRoutes[0]),left=new Set(plan.requiredActions),actions=[];
          while(left.size){const id=[...left].find(id=>!plan.order.some(([before,after])=>after===id&&left.has(before)));if(!id)throw Error('Cyclic plan');actions.push(id);left.delete(id);}
          return{id:c.id,templateId:c.templateId,questions:c.questions.map(row=>row.id),documents:c.documents.map(row=>row.id),fact:c.factTask.correct[0],ground:c.factTask.evidence[0],
            law:c.knowledge.number,actDate:c.knowledge.actDate.split('-').reverse().join('.'),article:c.knowledge.articles[0],application:c.knowledge.correct,
            evidence:{...task.bindings[0],extracted:translator.translate(task.extracted.accepted[0]),finding:task.correctFinding},
            calendar:{anchor:c.calendar.anchor,rule:c.calendar.correctRule,start:c.calendar.startPolicy,shift:c.calendar.lastDayPolicy,date:engine.deadlineFor(c).finalDate},
            procedure:c.correctProcedure[0],route:c.correctRoutes[0],actions,trap:c.trap.correct,followup:c.followup.correct};
        },{scope,locale});
        assert.equal(key.templateId,'trees-other-site');assert.equal(key.evidence.extracted,'B');
        for(const id of key.questions)await act(page,'ask',`[data-id=${attr(id)}]`);
        await tab(page,'docs');for(const id of key.documents)await act(page,'document',`[data-id=${attr(id)}]`);
        await choose(page,'fact',key.fact);await choose(page,'factEvidence',key.ground);
        await tab(page,'research');for(const [field,value]of Object.entries({lawNumber:key.law,actDate:key.actDate,article:key.article,url:'https://example.test/qa-reference'}))await fill(page,'knowledge.'+field,value);
        await choose(page,'knowledge.application',key.application);await act(page,'research-page','[data-page="evidence"]');
        await act(page,'evidence-open',`[data-id=${attr(key.evidence.recordId)}]`);await act(page,'evidence-fragment',`[data-id=${attr(key.evidence.recordId)}][data-fragment=${attr(key.evidence.fragmentId)}]`);
        await fill(page,'evidence.extracted',key.evidence.extracted);await choose(page,'evidence.finding',key.evidence.finding);
        await tab(page,'calendar');await page.locator('[data-calendar-year]').selectOption(key.calendar.date.slice(0,4));await flush(page);await page.locator('[data-calendar-month]').selectOption(key.calendar.date.slice(5,7));await flush(page);
        await act(page,'date',`[data-date=${attr(key.calendar.date)}]`);for(const field of ['anchor','rule','start','shift'])await choose(page,'calendar.'+field,key.calendar[field]);
        await tab(page,'plan');await choose(page,'procedure',key.procedure);await choose(page,'route',key.route);for(const id of key.actions)await act(page,'add-action',`[data-id=${attr(id)}]`);await choose(page,'trap',key.trap);
        await act(page,'reply');const reply=await page.locator('.rx-reply').innerText();assert.doesNotMatch(reply,/[А-Яа-яЁё]/);
        if(locale==='en'){
          assert(reply.includes('Selected route: Clarify the boundaries and the document for plot A, and forward the materials to the competent vegetation protection authority.'));
          assert(reply.includes('Check that the response concerns plot A specifically.'));
        }else{assert(reply.includes('所选路径： 核实地块A的边界和文件'));assert(reply.includes('核查回复是否确实针对地块A'));}
        await health(page,errors);await page.locator('.rx-reply').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${name}-${locale}-reply.png`),fullPage:false});
        await act(page,'commit');
        await page.locator('.rx-followup').waitFor();await choose(page,'followup',key.followup);await act(page,'followup');
        const evaluation=await page.evaluate(async({scope,id})=>{const state=(await(await import('/assets/js/durable-store.js')).durableStore.loadDraft(scope)).state,engine=await import('/apps/reception/js/engine.js');return engine.evaluateCase(engine.caseById(id,state),state.cases[id]);},{scope,id:key.id});
        assert.equal(evaluation.total,100);assert.deepEqual(evaluation.critical,[]);await health(page,errors);
        await page.screenshot({path:path.join(output,`${name}-${locale}-score.png`),fullPage:false});
        results.push({browser:name,locale,url:page.url(),viewport:'390x844',caseId:key.id,score:evaluation.total,reply,errors,missingTranslations:await page.evaluate(()=>window.localeMissing),productionAccess:false});
        console.log(`PASS ${name}/${locale}: deterministic trees-other-site, Latin A/B, clean dynamic draft, UI B evidence, 100/100`);
      }catch(error){await page.screenshot({path:path.join(output,`${name}-${locale}-failure.png`),fullPage:false});throw error;}
      finally{await context.close();await browser.close();}
    }
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({status:'pass',method:'Deterministic local Playwright regression harness; informed automated UI test with read-only canonical answer oracle',flow:'practice bank -> trees-other-site -> all answer controls -> localized reply -> commit and follow-up -> 100/100',results},null,2)+'\n');
  }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
