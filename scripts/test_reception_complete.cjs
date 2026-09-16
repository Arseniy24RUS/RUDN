// Positive UI-only completion of one assigned eight-case Reception shift.
// Oracle reads canonical case keys but never writes state or replaces grading.
// Isolated backend + real IndexedDB; all non-local network requests are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const configVersion = fs.readFileSync(path.join(__dirname, '../site/assets/js/config.js'), 'utf8').match(/\bversion\s*:\s*['"]([^'"]+)['"]/);
assert(configVersion, 'Cannot determine current CONFIG.version for the browser fixture');
const backendModule = '/assets/js/backend.js?v=' + encodeURIComponent(configVersion[1].replace(/-pages$/, ''));
const base = process.env.MODULE_TEST_URL || 'http://127.0.0.1:8765/';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Reception QA requires an isolated localhost server');
const locale=process.env.RECEPTION_LOCALE||'ru';
assert(['ru','en','zh'].includes(locale));
const output = process.env.QA_OUT || path.join(require('node:os').tmpdir(), 'rudn-reception-positive');
fs.mkdirSync(output, {recursive:true});
const owner = 'student:9909134008';
const scope = {owner, activitySlug:'seminar-5', mode:'2026-2027:assessment'};
const fakeBackend = `import {durableStore as store} from '/assets/js/durable-store.js';
const profile={studentKey:'9909134008',ticket:'9909134008',fullName:'Синтетический Полный Приём',group:'ГГУбд-02-26'};
export const backend={profile,user:{uid:'reception-positive-only'},authReady:true,serverTimeOffset:0,
isAdmin:()=>false,getProfile:()=>profile,loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,o),
saveAttempt:async record=>{const draftScope={owner:'student:'+profile.studentKey,activitySlug:record.activitySlug,mode:record.draftMode,attemptId:record.id};
const previous=await store.loadDraft(draftScope);await store.complete({...draftScope,state:previous.state,attempt:record});return record;}};`;
const fixture = '<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reception positive UI QA</title><body style="margin:0"><div id="module"></div></body></html>';
const attr = value => JSON.stringify(String(value));
async function mount(page) {
  await page.evaluate(async ({locale,backendModule}) => {
    window.qaLocale=locale;window.localeMissing=[];
    const {backend}=await import(backendModule);
    const {mountReception}=await import('/apps/reception/js/app.js');
    const {BUNDLED_CALENDARS}=await import('/assets/js/calendar-bundled.js');
    window.moduleHandle=await mountReception(document.querySelector('#module'),{backend,period:'2026-2027',assessmentAllowed:true,
      locale,getLocale:()=>window.qaLocale,onMissingTranslation:text=>window.localeMissing.push({locale:window.qaLocale,text}),
      calendarLoader:async()=>({year:2026,snapshot:BUNDLED_CALENDARS,stale:false,origins:[],unavailableYears:[],loadedAt:new Date().toISOString()})});
  },{locale,backendModule});
  await page.waitForFunction(()=>window.moduleHandle.getLocale()===window.qaLocale&&document.querySelector('.rx-global-status')&&!document.querySelector('.boot.rx-locale-status'));
}
async function flush(page) {await page.evaluate(async()=>{await window.moduleHandle.flush();await (await import('/assets/js/durable-store.js')).durableStore.flush();});}
async function draft(page) {return page.evaluate(async scope=>(await import('/assets/js/durable-store.js')).durableStore.loadDraft(scope),scope);}
async function act(page, action, extra='') {await page.locator(`[data-action=${attr(action)}]${extra}`).first().click();await flush(page);}
async function tab(page, id) {await act(page,'tab',`[data-tab=${attr(id)}]`);}
async function choose(page, field, value) {
  const control=page.locator(`input[type=radio][data-field=${attr(field)}][value=${attr(value)}]`);
  await control.check();await flush(page);assert.equal(await control.isChecked(),true,`Selected ${field}`);
}
async function fill(page, field, value, slowly=false) {
  const control=page.locator(`input[type=text][data-field=${attr(field)}]`);
  if(slowly){await control.fill('');await control.pressSequentially(String(value),{delay:25});}
  else await control.fill(String(value));
  await flush(page);assert.equal(await control.inputValue(),String(value));
}
async function oracle(page) {
  return page.evaluate(async scope=>{
    const state=(await (await import('/assets/js/durable-store.js')).durableStore.loadDraft(scope)).state;
    const engine=await import('/apps/reception/js/engine.js');
    const c=engine.caseById(state.caseIds[state.active],state);
    const task=(await import('/apps/reception/js/evidence.js')).evidenceTask(c);
    const translator=await (await import('/apps/reception/localization/runtime.js')).loadReceptionTranslator(window.qaLocale,{templateIds:state.assignment.manifest.map(row=>row.templateId),contentVersion:state.contentVersion});
    let extracted=translator.translate(task.extracted.accepted[0]);
    if(window.qaLocale!=='ru'&&['part','article'].includes(task.extracted.normalize)){
      const number=(await import('/apps/reception/js/evidence.js')).normalizeEvidence(task.extracted.accepted[0],task.extracted.normalize);
      extracted=window.qaLocale==='zh'?'第'+number+(task.extracted.normalize==='part'?'款':'条'):(task.extracted.normalize==='part'?'Part ':'Article ')+number;
    }
    const plan=(await import('/apps/reception/js/documents.js')).requiredActionPlan(c,c.correctRoutes[0]);
    const left=new Set(plan.requiredActions),actions=[];
    while(left.size){const next=[...left].find(id=>!plan.order.some(([before,after])=>after===id&&left.has(before)));if(!next)throw Error('Cyclic canonical action plan');actions.push(next);left.delete(next);}
    return {id:c.id,templateId:c.templateId,questions:c.questions.map(q=>q.id),documents:c.documents.map(d=>d.id),
      fact:c.factTask.correct[0],grounds:c.factTask.evidenceSets?.[0]||null,ground:c.factTask.evidence?.[0]||c.documents[0].id,
      law:c.knowledge.number,actDate:c.knowledge.actDate.split('-').reverse().join('.'),article:c.knowledge.articles[0],application:c.knowledge.correct,
      evidence:{...task.bindings[0],extracted,finding:task.correctFinding},
      calendar:{anchor:c.calendar.anchor,rule:c.calendar.correctRule,start:c.calendar.startPolicy,shift:c.calendar.lastDayPolicy,date:engine.deadlineFor(c).finalDate},
      procedure:c.correctProcedure[0],route:c.correctRoutes[0],actions,trap:c.trap.correct,followup:c.followup.correct};
  },scope);
}
async function health(page, errors) {
  assert.deepEqual(errors,[], 'No JavaScript or console errors');
  assert.deepEqual(await page.evaluate(()=>window.localeMissing),[],'No untranslated authored UI or case text');
  assert.equal(await page.locator('.rx-blocker,[data-nextjs-dialog],vite-error-overlay,webpack-dev-server-client-overlay').count(),0);
  const status=await page.locator('.rx-global-status').innerText();
  assert.doesNotMatch(status,/не удалось|ошибка|приостановлена|другой вкладке/i,'No inline action/storage errors');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal page overflow');
}
async function screenshot(page,name){await page.screenshot({path:path.join(output,locale+'-'+name+'.png'),fullPage:false});}
async function switchLanguages(page){
 const before=await draft(page);
 const field=page.locator('[data-field="evidence.extracted"]');await field.focus();
 await field.evaluate(el=>el.setSelectionRange(0,Math.min(2,el.value.length)));
 const selection=await field.evaluate(el=>[el.selectionStart,el.selectionEnd]);
 for(const language of ['ru','en','zh',locale]){
  await page.evaluate(language=>{window.qaLocale=language;window.moduleHandle.refreshLocale(language);},language);
  await page.waitForFunction(language=>window.moduleHandle.getLocale()===language&&document.querySelector('#module').lang===(language==='zh'?'zh-Hans':language),language);
  await flush(page);
  assert.deepEqual((await draft(page)).state,before.state,'Locale changes preserve all answers, revision, assignment, timer and stage');
  assert.equal(await field.evaluate(el=>document.activeElement===el),true,`Language change to ${language} preserves field focus`);
  assert.deepEqual(await field.evaluate(el=>[el.selectionStart,el.selectionEnd]),selection,'Language change preserves text selection');
 }
}
(async()=>{
  for(const name of (process.env.DURABLE_TEST_BROWSERS||'chromium,webkit').split(',')){
    const browser=await ({chromium,webkit}[name]).launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',serviceWorkers:'block'});
    const errors=[], requests=[], results=[];
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());requests.push(url.href);
      if(url.origin!==new URL(base).origin)return route.abort();
      if(url.pathname.endsWith('/assets/js/backend.js'))return route.fulfill({contentType:'application/javascript',body:fakeBackend});
      if(url.pathname.endsWith('/reception-positive-qa.html'))return route.fulfill({contentType:'text/html',body:fixture});
      return route.continue();
    });
    try{
      await page.goto(base+'reception-positive-qa.html');await mount(page);
      assert.equal(await page.title(),'Reception positive UI QA');
      await page.locator('[data-mode="assessment"]').check();await flush(page);
      await act(page,'start');const initial=await draft(page);assert.equal(initial.state.caseIds.length,8);
      console.log(`ASSIGNMENT ${name} ${locale}: ${JSON.stringify({seed:initial.state.seed,templateIds:initial.state.assignment.manifest.map(row=>row.templateId)})}`);
      await screenshot(page,name+'-begin');
      for(let index=0;index<8;index++){
        const key=await oracle(page);assert.equal(key.id,initial.state.caseIds[index]);
        for(const id of key.questions)await act(page,'ask',`[data-id=${attr(id)}]`);
        await tab(page,'docs');
        for(const id of key.documents)await act(page,'document',`[data-id=${attr(id)}]`);
        for(const id of key.documents.slice(0,2))await act(page,'compare-document',`[data-id=${attr(id)}]`);
        await choose(page,'fact',key.fact);
        if(key.grounds){for(const id of key.grounds){await page.locator(`[data-doc-evidence=${attr(id)}]`).check();await flush(page);}}
        else await choose(page,'factEvidence',key.ground);
        await tab(page,'research');
        await fill(page,'knowledge.lawNumber',key.law,true);
        await fill(page,'knowledge.actDate',key.actDate);
        await fill(page,'knowledge.article',key.article);
        await fill(page,'knowledge.url','https://example.test/qa-reference');
        await choose(page,'knowledge.application',key.application);
        await act(page,'research-page','[data-page="evidence"]');
        await act(page,'evidence-open',`[data-id=${attr(key.evidence.recordId)}]`);
        await act(page,'evidence-fragment',`[data-id=${attr(key.evidence.recordId)}][data-fragment=${attr(key.evidence.fragmentId)}]`);
        await fill(page,'evidence.extracted',key.evidence.extracted,index===3);
        await choose(page,'evidence.finding',key.evidence.finding);
        if(index===3){
          await switchLanguages(page);
          await screenshot(page,name+'-middle-evidence');
          const before=await draft(page);await page.reload();await mount(page);await flush(page);const after=await draft(page);
          assert.equal(after.attemptId,before.attemptId);assert.equal(after.state.startedAt,before.state.startedAt);
          assert.deepEqual(after.state.assignment,before.state.assignment);assert.deepEqual(after.state.cases,before.state.cases);
          assert.equal(await page.locator('[data-field="evidence.extracted"]').inputValue(),key.evidence.extracted);
          await screenshot(page,name+'-restored');
        }
        await tab(page,'calendar');
        await page.locator('[data-calendar-year]').selectOption(key.calendar.date.slice(0,4));await flush(page);
        await page.locator('[data-calendar-month]').selectOption(key.calendar.date.slice(5,7));await flush(page);
        await act(page,'date',`[data-date=${attr(key.calendar.date)}]`);
        for(const field of ['anchor','rule','start','shift'])await choose(page,'calendar.'+field,key.calendar[field]);
        await tab(page,'plan');
        await choose(page,'procedure',key.procedure);await choose(page,'route',key.route);
        for(const id of key.actions)await act(page,'add-action',`[data-id=${attr(id)}]`);
        // Exercise actual ordering controls and removal without leaving an altered plan.
        if(index===0&&key.actions.length>1){
          const id=key.actions[1];await act(page,'move-action',`[data-id=${attr(id)}][data-delta="-1"]`);
          await act(page,'move-action',`[data-id=${attr(id)}][data-delta="1"]`);
          const last=key.actions.at(-1);await act(page,'remove-action',`[data-id=${attr(last)}]`);await act(page,'add-action',`[data-id=${attr(last)}]`);
        }
        await choose(page,'trap',key.trap);await act(page,'reply');assert(await page.locator('.rx-reply').innerText());
        const completedInput=await draft(page);assert.deepEqual(completedInput.state.cases[key.id].actions,key.actions);
        const missing=await page.evaluate(async ({scope,id})=>{const d=await (await import('/assets/js/durable-store.js')).durableStore.loadDraft(scope);return (await import('/apps/reception/js/engine.js')).missingFields(d.state.cases[id]);},{scope,id:key.id});
        assert.deepEqual(missing,[],`All required fields entered for ${key.id}`);
        await health(page,errors);if(index===3)await screenshot(page,name+'-middle-plan');
        await act(page,'commit');await page.locator('.rx-confirm-dialog [value="accept"]').click();await flush(page);
        await page.locator('.rx-followup').waitFor();await choose(page,'followup',key.followup);await act(page,'followup');
        const evaluated=await page.evaluate(async ({scope,id})=>{const s=(await (await import('/assets/js/durable-store.js')).durableStore.loadDraft(scope)).state,e=await import('/apps/reception/js/engine.js');return e.evaluateCase(e.caseById(id,s),s.cases[id]);},{scope,id:key.id});
        assert.equal(evaluated.total,100,JSON.stringify({case:key.id,evaluated}));assert.deepEqual(evaluated.critical,[]);results.push({id:key.id,total:evaluated.total});
        assert.equal(await page.locator('[data-feedback="training"]').count(),0);
        await health(page,errors);if(index===3)await screenshot(page,name+'-middle-followup');
        await act(page,index===7?'finish':'next');
        console.log(`PASS ${name} case ${index+1}/8: ${key.templateId}, 100/100, all fields + continuation via DOM`);
      }
      await page.locator('.rx-summary h1').waitFor();
      await page.waitForFunction(async scope=>{const d=await (await import('/assets/js/durable-store.js')).durableStore.loadDraft(scope);return d?.state.completed&&d.state.submitted;},scope);
      await flush(page);const done=await draft(page);
      assert.equal(done.phase,'completed');assert.equal(done.attemptId,initial.attemptId);
      assert.equal(await page.locator('.rx-final-score strong').innerText(),'5');
      assert.equal(await page.locator('[data-feedback="training"]').count(),0);
      const attempts=await page.evaluate(async owner=>(await import('/assets/js/durable-store.js')).durableStore.listAttempts({owner}),owner);
      assert.equal(attempts.length,1);assert.equal(attempts[0].points,5);assert.equal(attempts[0].maxPoints,5);
      assert.equal(attempts[0].summary.results.length,8);assert(attempts[0].summary.results.every(r=>r.total===100));
      await health(page,errors);await screenshot(page,name+'-result');
      // A completed page reload must not create a second attempt or a new assignment.
      await page.reload();await mount(page);await flush(page);
      assert.equal((await draft(page)).attemptId,initial.attemptId);
      assert.equal(await page.locator('.rx-final-score strong').innerText(),'5');
      assert.equal((await page.evaluate(async owner=>(await import('/assets/js/durable-store.js')).durableStore.listAttempts({owner}),owner)).length,1);
      assert.equal(requests.some(url=>new URL(url).origin!==new URL(base).origin),false);
      await health(page,errors);
      const missing=await page.evaluate(()=>window.localeMissing);
      fs.writeFileSync(path.join(output,locale+'-'+name+'-result.json'),JSON.stringify({browser:name,locale,viewport:'390x844',attemptId:initial.attemptId,caseIds:initial.state.caseIds,results,score:5,errors,missingTranslations:missing,productionAccess:false},null,2));
      assert.deepEqual(missing,[],'No untranslated authored UI or case text');
      console.log(`PASS ${name}: complete eight-case positive shift 5/5, reload preserved answers, one immutable attempt`);
    }catch(error){
      await screenshot(page,name+'-failure');
      const failed=await draft(page).catch(()=>null);
      fs.writeFileSync(path.join(output,locale+'-'+name+'-failure.json'),JSON.stringify({browser:name,locale,seed:failed?.state?.seed,
        templateIds:failed?.state?.assignment?.manifest?.map(row=>row.templateId),active:failed?.state?.active,
        missingTranslations:await page.evaluate(()=>window.localeMissing||[]),errors,productionAccess:false},null,2));
      console.error('Visible status:',await page.locator('.rx-global-status').textContent().catch(()=>''));throw error;
    }
    finally{await context.close();await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
