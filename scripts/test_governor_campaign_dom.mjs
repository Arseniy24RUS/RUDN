/** DOM-only integration QA. Canvas painting, native layout, actual image/network loading,
 * service-worker behaviour and authenticated platform submission are NOT simulated here.
 * Requires jsdom 26.1.0 outside production dependencies:
 *   npm install --prefix /tmp/governor-dom-qa --no-save --package-lock=false jsdom@26.1.0
 *   GOVERNOR_JSDOM_MODULE=/tmp/governor-dom-qa/node_modules/jsdom/lib/api.js \
 *     node scripts/test_governor_campaign_dom.mjs [optional-results.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {JSDOM,VirtualConsole}=await import(process.env.GOVERNOR_JSDOM_MODULE
  ? pathToFileURL(path.resolve(process.env.GOVERNOR_JSDOM_MODULE)).href : 'jsdom');
const repo=fileURLToPath(new URL('..',import.meta.url));
const dir=path.join(repo,'site/apps/governor');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
async function boot(language='ru'){
const logs=[];
const virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',e=>logs.push({type:'dom',message:e.message,stack:e.stack}));
virtualConsole.on('error',(...args)=>logs.push({type:'error',message:args.map(x=>x?.stack||String(x)).join(' ')}));
const dom=new JSDOM(html,{url:'https://governor-qa.invalid/apps/governor/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
const w=dom.window;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
w.confirm=()=>true;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
w.CSS={escape:s=>String(s).replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c)};
w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
Object.defineProperty(w,'crypto',{value:webcrypto});
w.localStorage.setItem('rudn-governor-stage9-prefs',JSON.stringify({language,soundEnabled:false}));
for(const match of html.matchAll(/<script src="([^"]+)"/g))w.eval(fs.readFileSync(path.join(dir,match[1]),'utf8')+'\n//# sourceURL='+match[1]);
if(language==='zh')w.eval(fs.readFileSync(path.join(dir,'locales/zh-Hans.js'),'utf8'));
const G=w.GovernorGame;
G.WorldUI.mountMoment=()=>{};G.WorldUI.mount=()=>{};G.WorldUI.refreshVisible=()=>{};G.WorldUI.disposeWithin=()=>{};
G.resolveAsset=p=>new URL(p,w.location.href).href;
w.document.querySelector('#app').hidden=false;w.document.querySelector('#app').inert=false;
w.eval(fs.readFileSync(path.join(dir,'src/app.js'),'utf8')+'\n//# sourceURL=src/app.js');
const tick=()=>new Promise(r=>setTimeout(r,10));
const $=s=>w.document.querySelector(s);
async function click(s){const e=$(s);assert.ok(e,'Missing '+s);assert.ok(!e.disabled,'Disabled '+s);e.click();await tick();}
function closePresentations(){for(const d of w.document.querySelectorAll('dialog[open]'))if(!['resolution-dialog','negotiation-dialog','budget-review-dialog','tab-conflict'].includes(d.id))d.close();}
function state(){return new G.Saves.Store(w.localStorage).inspect().state;}
await tick();
return {dom,w,G,$,click,state,logs,closePresentations};
}
async function fullCampaign(){
const {dom,w,G,$,click,state,logs,closePresentations}=await boot();
assert.equal(w.document.documentElement.dataset.appReady,'true',JSON.stringify(logs));
assert.equal($('#budget-review-mode').checked,true);
assert.equal($('#campaign-strategy').options.length,4);
$('#player-name').value='Проверка новой кампании';$('#scenario-select').value='balanced';
await click('#start-form button[type="submit"]');closePresentations();
assert.ok(state(),'Saved initial state');
assert.equal(state().agenda.version,'2.0.0');
assert.equal(state().campaignStrategy.id,'services');
assert.equal(G.BudgetReview.active(state()),true);
assert.ok($('#secondary-stage').textContent.includes('Что важнее'));
assert.ok($('.campaign-coach').textContent.includes('Начните с проблемы'));
assert.ok($('.campaign-mandate').textContent.includes('Услуги рядом'));
await click('[data-agenda-topic="rural-healthcare"]');
assert.equal($('#mission-panel').dataset.missionId,'rural-healthcare');
assert.ok($('.campaign-coach').textContent.includes('Сравните способы'));

await click('#campaign-course-shortcut');
assert.ok($('#campaign-course-dialog').open);
assert.ok($('#campaign-course-dialog').textContent.includes('Медицина в наименее'));
await click('[data-course-close]');
await click('[data-action="train-staff"]');
assert.ok($('.campaign-coach').textContent.includes('Проверьте цену'));
await click('.change-decision');
assert.ok($('.campaign-coach').textContent.includes('Сравните способы'));
await click('[data-action="train-staff"]');
await click('#confirm-action');
assert.ok($('#negotiation-dialog').open);
assert.ok(!$('#negotiation-dialog').textContent.includes('три ФАПа'));
await click('[data-sign-agreement]');
assert.equal($('#resolution-dialog').open,false);
assert.equal(state().history.length,1);
assert.equal(state().turnIndex,1);
await click('[data-last-year]');
assert.ok($('#resolution-dialog').open);
assert.equal($('#resolution-content > .campaign-result')?.tagName,'SECTION','Optional annual feedback is readable');
await click('#continue-turn');
assert.equal(state().turnIndex,1,'Closing the year in review does not spend another turn');
const completed=[];
for(let year=2;year<=20;year++){
  const before=state();
  assert.equal(before.turnIndex,year-1,JSON.stringify(logs));
  assert.ok(G.Engine.validateState(before),'Valid before '+year);
  let topic='agenda-operations';
  const preferred={2:'school-neighbourhood',3:'digital-services',4:'flood-preparedness',5:'youth-employment'}[year];
  if(preferred&&G.Agenda.pending(before).some(t=>t.id===preferred))topic=preferred;
  // Select the visible control, allowing its disclosure to open if needed.
  const topicButton=$(`[data-agenda-topic="${topic}"]`);assert.ok(topicButton,'Topic exists '+topic);
  topicButton.closest('details')?.setAttribute('open','');
  await click(`[data-agenda-topic="${topic}"]`);
  let actionId='defer-agenda-operations';
  if(topic!== 'agenda-operations'){
    const current=state(),mission=G.Engine.getCurrentMission(current);
    const candidates=mission.actions.map(a=>G.Engine.previewAction(current,a.id)).filter(p=>p?.affordable);
    const chosen=candidates.find(p=>!p.action.deferred)||candidates.find(p=>p.action.deferred);
    assert.ok(chosen,'An available choice in year '+year);
    actionId=chosen.action.id;
    await click(`[data-action="${actionId}"]`);
    await click('#confirm-action');
    if($('#negotiation-dialog')?.open)await click('[data-sign-agreement]');
  }
  for(let attempt=0;attempt<6&&G.BudgetReview.pending(state());attempt++){
    const choice=$('#budget-review-dialog [data-budget-choice]:not([disabled])');assert.ok(choice,'Budget recovery option');
    await click(`#budget-review-dialog [data-budget-choice="${choice.dataset.budgetChoice}"]`);
    await click('#budget-review-dialog [data-budget-confirm]');
  }
  assert.equal(state().history.length,year,JSON.stringify(logs));
  assert.equal($('#resolution-dialog').open,false);
  assert.ok(G.Engine.validateState(state()),'Valid year '+year);
  if([5,10,15].includes(year)){
    assert.ok($('#campaign-course-dialog')?.open,'Course review '+year);
    assert.ok($('#campaign-course-dialog .review-verdict'));
    await click('[data-course-close]');
  }
  completed.push({year,topic,action:actionId,chapter:$('#chapter-number').textContent});
}
const end=state();assert.equal(end.completed,true);assert.equal(end.campaignStrategy.reviews.length,4);
assert.ok(G.Engine.validateState(end));assert.ok($('#end-summary .campaign-report'));
const exportText=await G.Saves.pack(end),restored=await G.Saves.unpack(exportText);
assert.equal(restored.history.length,20);assert.deepEqual(JSON.parse(JSON.stringify(restored.campaignStrategy)),JSON.parse(JSON.stringify(end.campaignStrategy)));
assert.deepEqual(logs,[]);
const result={status:'passed',language:'ru',mode:'agenda',years:completed,course:end.campaignStrategy.id,
  reviews:end.campaignStrategy.reviews.map(r=>({year:r.year,status:r.status})),saveRoundtrip:true,errors:logs};
dom.window.close();
return result;
}
async function smoke(language,mode){
  const {dom,w,G,$,click,state,logs,closePresentations}=await boot(language);
  assert.equal(w.document.documentElement.lang,language);
  $('#campaign-mode').value=mode;$('#campaign-mode').dispatchEvent(new w.Event('change'));
  $('#campaign-strategy').value='generations';$('#campaign-strategy').dispatchEvent(new w.Event('change'));
  $('#player-name').value='Campaign QA';
  await click('#start-form button[type="submit"]');closePresentations();
  assert.equal(state().campaignStrategy.id,'generations');
  assert.ok(G.Engine.validateState(state()));
  assert.ok($('.campaign-coach'),'Contextual coach '+language+'/'+mode);
  assert.equal($('.side-nav [data-view="journal"]').hidden,true);
  await click('#campaign-all-sections');
  assert.equal($('.side-nav [data-view="journal"]').hidden,false);
  if(mode==='agenda'){
    await click('[data-agenda-topic="rural-healthcare"]');
  }
  assert.equal($('#campaign-course-shortcut').hidden,false);
  await click('#campaign-course-shortcut');
  const text=$('#campaign-course-dialog').textContent;
  assert.ok(text.includes({ru:'Северных поселениях',en:'northern villages',zh:'北部村镇'}[language]),'Localized and precise care target '+language);
  if(language!=='ru')assert.ok(!/[А-Яа-яЁё]/.test(text),'No Russian text in localized course overview');
  await click('[data-course-close]');
  await click('[data-coach-skip]');assert.equal($('.campaign-coach'),null);
  await click('#campaign-coach-toggle');assert.ok($('.campaign-coach'),'Coaching can be reopened');
  await click('[data-coach-skip]');await click('#mobile-menu-button');
  assert.ok($('#section-menu').open);await click('[data-reopen-coaching]');
  assert.equal($('#section-menu').open,false);assert.ok($('.campaign-coach'),'Mobile menu reopens coaching');
  const mission=G.Engine.getCurrentMission(state());
  const action=mission.actions.find(a=>!a.deferred&&G.Engine.previewAction(state(),a.id).affordable);
  assert.ok(action);await click(`[data-action="${action.id}"]`);await click('#confirm-action');
  if($('#negotiation-dialog')?.open)await click('[data-sign-agreement]');
  assert.equal(state().history.length,1);assert.ok(G.Engine.validateState(state()));
  assert.equal(state().turnIndex,1);assert.equal($('#resolution-dialog').open,false);
  assert.deepEqual(logs,[]);
  const result={language,mode,course:'generations',firstDecision:true,courseDialog:true,reopenCoaching:true,errors:logs};
  dom.window.close();return result;
}
const result={status:'passed',scope:'DOM handlers and rendered text only; no canvas/native layout/authenticated backend',
  fullCampaign:await fullCampaign(),smokes:[]};
for(const language of ['ru','en','zh'])for(const mode of ['agenda','guided'])result.smokes.push(await smoke(language,mode));
if(process.argv[2])fs.writeFileSync(path.resolve(process.argv[2]),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
