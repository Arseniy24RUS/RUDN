#!/usr/bin/env node
/** Real-browser acceptance scenario. Local mock fixture only; no paid model or grades.
 * node browser-scenario.mjs --executable /usr/bin/chromium
 * Needs an environment that permits ordinary browser processes and sockets.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
if(process.argv.includes('--help')){
  console.log(`node scripts/test-reception-ai-workspace-browser.mjs --cases /private-data/cases
  [--playwright-module /path/playwright/index.mjs] [--executable /path/chromium]
  [--browser chromium|webkit] [--headed] [--out /reports]
Alternatively --url http://127.0.0.1:8793 points to reception-ai-workspace-qa.mjs.
The test starts its own loopback mock fixture when --url is omitted. No paid model,
Firebase or production grades. Screenshots are produced only by an actual run.`);process.exit(0);
}
const out=path.resolve(arg('--out',path.join(os.tmpdir(),'rudn-reception-workspace-browser')));
const modulePath=arg('--playwright-module',arg('--playwright',process.env.RECEPTION_PLAYWRIGHT_MODULE));
const moduleSpecifier=modulePath?pathToFileURL(path.resolve(modulePath)).href:'playwright';
const engine=arg('--browser','chromium');if(!['chromium','webkit'].includes(engine))throw Error('Use chromium or webkit.');
const external=arg('--url');
if(external){const url=new URL(external);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password||url.search||url.hash)throw Error('QA --url must be an unauthenticated HTTP loopback fixture.');}
const fixture=external?null:await createReceptionFixture({casesDirectory:arg('--cases',process.env.RECEPTION_AI_CASES_DIR)});
const report={suite:'reception-mobile-repair',status:'running',provider:'mock',actualBrowser:false,caseCount:fixture?.caseCount||null,dataKind:fixture?.dataKind||null,browser:engine,
  checks:[],screenshots:[],errors:[],notes:[
    'Application, CSS, reader and assets are the real checkout. Shell mounting is an isolated fixture, not production Firebase routing.',
    'Mock replies test transport and UI lifecycle only. No claim is made about model roleplay or legal answer quality.',
    'Viewport resizing does not replace testing a physical phone keyboard or iOS WebM alpha decoding.'
  ]};
await mkdir(out,{recursive:true});
let browser,stage='fixture-start',page;
const check=(name,detail={})=>report.checks.push({name,status:'passed',...detail});
async function idle(){await page.waitForFunction(()=>document.querySelector('#receptionAI')?.getAttribute('aria-busy')==='false');}
async function click(selector){await page.locator(selector).click();await idle();}
async function screenshot(name){await page.screenshot({path:path.join(out,name),fullPage:true,animations:'disabled'});report.screenshots.push(name);}
async function navigate(name){await click(`.rxa-mobile-nav [data-action="page"][data-page="${name}"]`);assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),name);}
async function apiResponse(op,action){
  const waiting=page.waitForResponse(r=>r.url().endsWith('/api/reception')&&r.request().method()==='POST'&&r.request().postDataJSON()?.op===op);
  const [response]=await Promise.all([waiting,action()]);const payload=await response.json();
  assert.equal(payload.ok,true,`${op}: ${JSON.stringify(payload.error)}`);await idle();return payload.view;
}
async function noOverflow(label){
  const geometry=await page.evaluate(()=>{const content=document.querySelector('.rxa-page-content');return {width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,content:content?{width:content.clientWidth,scrollWidth:content.scrollWidth}:null};});
  assert.ok(geometry.document<=geometry.width+1&&geometry.body<=geometry.width+1,`${label}: ${JSON.stringify(geometry)}`);
  if(geometry.content)assert.ok(geometry.content.scrollWidth<=geometry.content.width+1,`${label}: page content overflow ${JSON.stringify(geometry)}`);
  check(`No horizontal overflow: ${label}`,geometry);
}
async function shellHidden(){assert.equal(await page.locator('nav.mobile-nav').isVisible(),false);}
async function scrollWorkspace(){
  const moved=await page.locator('.rxa-page-content').evaluate(content=>{
    content.scrollTop=content.scrollHeight;
    return content.scrollTop;
  });
  assert.ok(moved>0,'The workspace was actually scrolled before starting the case');
}
async function assertCaseAtTop(label){
  const geometry=await page.locator('.rxa-page-content').evaluate(content=>{
    const actor=content.querySelector('[data-rxa-actor]');
    const rect=actor?.getBoundingClientRect(), viewport=content.getBoundingClientRect();
    return {scrollTop:content.scrollTop,actorVisible:!!rect&&rect.top>=viewport.top-1&&rect.bottom<=viewport.bottom+1};
  });
  assert.deepEqual(geometry,{scrollTop:0,actorVisible:true},label);
  assert.equal(await page.locator('.rxa-foyer [data-chat-unread], .rxa-foyer [data-action="chat"]').count(),0);
  assert.equal((await page.locator('.rxa-mobile-nav [data-chat-unread]').textContent()).trim(),'1');
  check(label,geometry);
}
const dateText=date=>date.split('-').reverse().join('.');
function dateAfter(date,days){
  const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
function calendarTarget(target){return page.locator(`[data-calendar-action="target"][data-target="${target}"]`);}
async function chooseDate(target,date){
  await calendarTarget(target).click();
  await page.locator('[data-calendar-input="year"]').selectOption(date.slice(0,4));
  await page.locator('[data-calendar-input="month"]').selectOption(date.slice(5,7));
  await page.locator(`[data-calendar-action="choose-date"][data-date="${date}"]`).click();
  assert.ok((await calendarTarget(target).textContent()).includes(dateText(date)));
}
async function savedDates(referral,deadline){
  assert.ok((await calendarTarget('referral').textContent()).includes(dateText(referral)));
  assert.ok((await calendarTarget('deadline').textContent()).includes(dateText(deadline)));
  assert.equal(await page.locator('[data-calendar-input="registration-timely"]').isChecked(),true);
}
async function decisionDates(referral,deadline){
  const summary=await page.locator('[data-deadline-summary]').textContent();
  assert.ok(summary.includes(dateText(referral))&&summary.includes(dateText(deadline)));
}
async function phoneComposerVisible(label){
  const geometry=await page.evaluate(()=>{
    const field=document.querySelector('[data-message-draft]'),send=document.querySelector('[data-chat-form] button[type="submit"]'),nav=document.querySelector('.rxa-mobile-nav');
    const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const bounds=send.getBoundingClientRect(),hit=document.elementFromPoint(bounds.left+bounds.width/2,bounds.top+bounds.height/2);
    return {viewport:{width:innerWidth,height:innerHeight},field:rect(field),send:rect(send),nav:rect(nav),uncovered:hit===send||send.contains(hit)};
  });
  for(const key of ['field','send']){const bounds=geometry[key];assert.ok(bounds.width>=43.5&&bounds.height>=43.5&&bounds.top>=0&&bounds.bottom<=geometry.nav.top+1&&bounds.left>=0&&bounds.right<=geometry.viewport.width+1,`${label}: clipped ${key}: ${JSON.stringify(geometry)}`);}
  assert.equal(geometry.uncovered,true,`${label}: Send is covered`);check(`Composer above navigation: ${label}`,geometry);
}

try{
  if(fixture)await new Promise((resolve,reject)=>{fixture.server.once('error',reject);fixture.server.listen(0,'127.0.0.1',resolve);});
  const origin=external?new URL(external).origin:`http://127.0.0.1:${fixture.server.address().port}`;
  const health=await fetch(origin+'/__qa/health').then(async response=>response.ok?response.json():null);
  if(health?.provider!=='mock'||health?.fixture!==true)throw Error('Use scripts/reception-ai-workspace-qa.mjs as the --url server, or omit --url and provide --cases.');
  report.caseCount=health.caseCount;
  report.dataKind=health.dataKind;
  stage='browser-launch';
  const playwright=await import(moduleSpecifier);
  const executable=arg('--executable',undefined);
  browser=await playwright[engine].launch({headless:!process.argv.includes('--headed'),...(executable?{executablePath:executable}:{})});
  report.actualBrowser=true;
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',serviceWorkers:'block'});
  await context.addInitScript(()=>{
    if(location.origin==='null')return;
    const buildId=sessionStorage.getItem('qa.reception.release')||'a'.repeat(32);
    globalThis.__RUDN_RELEASE__={buildId,retention:'current-only',siteRoot:location.origin+'/',runtimeRoot:location.origin+'/',resources:{}};
  });
  page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort('blockedbyclient');});
  stage='lobby-and-bank';
  await page.goto(origin+'/__qa/reception.html',{waitUntil:'networkidle'});await idle();
  assert.equal(await page.locator('input[name="mode"][value="training"]').count(),1);
  assert.equal(await page.locator('input[name="mode"][value="independent"]').count(),1);
  const bank=page.locator('select[name="trainingCaseId"]'),level=page.locator('select[name="trainingLevel"]');
  assert.equal(await bank.count(),1);assert.equal(await level.count(),1);
  const allCases=await bank.locator('option').evaluateAll(nodes=>nodes.filter(n=>n.value).map(n=>n.value));
  assert.equal(allCases.length,report.caseCount);
  await level.selectOption('3');await idle();
  const choices=await bank.locator('option').evaluateAll(nodes=>nodes.filter(n=>n.value).map(n=>n.value));
  assert.ok(choices.length>0&&choices.length<allCases.length);
  await level.selectOption('');await idle();
  const selectedCase=allCases.includes('complaint-routing')?'complaint-routing':allCases[0];
  await bank.selectOption(selectedCase);await idle();await shellHidden();
  await screenshot('01-phone-lobby.png');check('Training/independent controls and the supplied catalog with a difficulty filter',{allCases:allCases.length,advancedCases:choices.length,dataKind:report.dataKind});
  await scrollWorkspace();
  let view=await apiResponse('start',()=>page.locator('[data-action="start"]').click());
  assert.equal(view.provider,'mock');assert.equal(view.mode,'training');
  assert.equal(view.case.id,selectedCase);const sessionId=view.id;
  stage='reception-and-unread';
  assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),'reception');
  await assertCaseAtTop('New training starts at the top, with one unread badge in bottom navigation');
  const events=Object.fromEntries(view.case.workbook.events.map(event=>[event.id,event.date]));
  const renderedDates=await page.locator('.rxa-case-timeline time').evaluateAll(nodes=>nodes.map(node=>node.dateTime));
  assert.deepEqual(renderedDates,[events.sent,events.received,events.registered]);
  assert.equal(await page.locator('.rxa-brand strong').innerText(),'Обращения граждан');
  assert.doesNotMatch(await page.locator('.rxa-foyer').innerText(),/Адрес для ответа/);
  if(view.case.workbook.site)assert.match(await page.locator('.rxa-routing-origin').innerText(),/Место события/);
  assert.deepEqual(await page.locator('.rxa-mobile-nav [data-action="page"]').evaluateAll(buttons=>buttons.map(button=>button.dataset.page)),['reception','chat','documents','calendar','decision']);
  await page.locator('[data-rxa-actor]').waitFor({state:'visible'});
  await page.waitForFunction(()=>{const image=document.querySelector('.rxa-citizen-poster');return image?.complete&&image.naturalWidth>0;});
  const video=page.locator('video[data-rxa-motion]');
  let videoStatus='poster fallback';
  if(await video.count()){
    try{await page.waitForFunction(()=>{const v=document.querySelector('video[data-rxa-motion]');return v&&!v.paused&&v.currentTime>0&&v.videoWidth>0;},null,{timeout:8000});videoStatus='decoded video playing';}
    catch{videoStatus='video exists; playback not confirmed';}
  }
  if(await page.locator('[data-rxa-motion-image]').count()){
    await page.waitForFunction(()=>{const img=document.querySelector('[data-rxa-motion-image]');return img?.complete&&img.naturalWidth>0;});
    videoStatus='animated WebP resource loaded';
  }
  check('Reception actor and initial unread badge',{videoStatus,animationClaim:videoStatus==='decoded video playing'});
  await screenshot('02-phone-reception.png');await noOverflow('reception 390');
  await screenshot('02b-phone-case-context.png');
  stage='chat-and-navigation';
  await navigate('chat');assert.equal(await page.locator('[data-chat-unread]').count(),0);
  assert.equal(await page.locator('.rxa-messages [data-action="document"][data-id="registration"]').count(),0,'Internal receipt card must stay out of the conversation');
  await page.locator('[data-message-draft]').fill('Покажите, пожалуйста, документы по вашему обращению.');
  view=await apiResponse('message',()=>page.locator('[data-chat-form] button[type="submit"]').click());
  assert.ok(view.documents.length);const messageCount=view.messages.length;
  await page.locator('[data-message-draft]').fill('Уточню обстоятельства после чтения документа.');
  assert.equal(await page.locator('.rxa-compose-materials,[data-chat-form] input[type="file"]').count(),0);
  await screenshot('03-phone-chat.png');
  await navigate('documents');
  const openDocument=page.locator('[data-action="document"]').first();
  if(await openDocument.count()){await openDocument.click();await idle();assert.ok((await page.locator('.rxa-document-body').textContent()).trim());}
  await screenshot('04-phone-documents.png');
  stage='reader-citation';
  await click('[data-action="documents-list"]');
  assert.equal(await page.locator('[data-action="tab"]').count(),0);
  assert.equal(await page.locator('.rxa-document-group>h2').count(),2);
  await page.locator('.rxa-source-record').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));
  const law59=page.locator('a[data-source-reader][href*="LAW_59999/"]').first();
  const source=await law59.count()?law59:page.locator('a[data-source-reader]').first();
  if(await source.count()){
    await source.click();await page.locator('[data-source-reader-host] .rx-source-embedded [data-unit]').first().waitFor({state:'visible'});
    assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),'documents');
    assert.equal(await page.locator('.rxa-mobile-nav').isVisible(),true);
    stage='desktop-source-reader';
    await page.setViewportSize({width:1280,height:900});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForFunction(()=>innerWidth===1280&&document.querySelector('.rx-source-embedded .ll-paper')?.clientHeight>0);
    const readerGeometry=await page.evaluate(async()=>{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const root=document.querySelector('#receptionAI'),paper=document.querySelector('.rx-source-embedded .ll-paper');
      const bounds=paper.getBoundingClientRect();
      paper.scrollTop=0;paper.scrollTop=Math.min(80,paper.scrollHeight-paper.clientHeight);
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const scrolled=paper.scrollTop;paper.scrollTop=0;
      const navigation=[...document.querySelectorAll('.rxa-mobile-nav [data-page]')].map(button=>{
        const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
        return {page:button.dataset.page,disabled:button.disabled,left:r.left,right:r.right,top:r.top,bottom:r.bottom,uncovered:hit===button||button.contains(hit)};
      });
      return {viewport:{width:innerWidth,height:innerHeight},rootHeight:root.clientHeight,paper:{height:paper.clientHeight,scrollHeight:paper.scrollHeight,top:bounds.top,bottom:bounds.bottom,overflowY:getComputedStyle(paper).overflowY,scrolled},navigation};
    });
    assert.ok(readerGeometry.paper.height>120&&readerGeometry.paper.height<readerGeometry.viewport.height,`Desktop reader has a bounded usable text surface: ${JSON.stringify(readerGeometry)}`);
    assert.ok(readerGeometry.paper.top>=0&&readerGeometry.paper.bottom<=readerGeometry.viewport.height+1,`Desktop text surface stays inside the viewport: ${JSON.stringify(readerGeometry)}`);
    assert.ok(readerGeometry.paper.scrollHeight>readerGeometry.paper.height+1&&readerGeometry.paper.scrolled>0&&['auto','scroll'].includes(readerGeometry.paper.overflowY),`Desktop text surface actually scrolls: ${JSON.stringify(readerGeometry)}`);
    assert.equal(readerGeometry.navigation.length,5);
    assert.ok(readerGeometry.navigation.every(button=>!button.disabled&&button.uncovered&&button.left>=0&&button.right<=1281&&button.top>=0&&button.bottom<=901),`Desktop reader keeps all five navigation targets reachable: ${JSON.stringify(readerGeometry)}`);
    await screenshot('05b-desktop-source-reader.png');
    check('Desktop 1280×900 source reader has bounded scrolling text and accessible navigation',readerGeometry);
    await page.setViewportSize({width:390,height:844});stage='mobile-source-search';
    const reader=page.locator('.rx-source-embedded'), search=reader.locator('[data-input="reader-query"]');
    await search.fill('Срок');
    await reader.locator('[data-search-form="reader"] button[type="submit"]').click();
    const hit=reader.locator('[data-action="jump-unit"]').first();
    await hit.waitFor();
    const searchGeometry=await reader.evaluate(root=>{
      const bar=root.querySelector('.rx-source-dialog-bar').getBoundingClientRect(),surface=root.getBoundingClientRect();
      const results=root.querySelector('.ll-search-results'),list=results.getBoundingClientRect();
      const button=results.querySelector('[data-action="jump-unit"]'),bounds=button.getBoundingClientRect();
      const x=bounds.left+bounds.width/2,y=Math.max(bounds.top,list.top)+Math.min(bounds.height,list.height)/2;
      const target=document.elementFromPoint(x,y);
      return {toolbarBottom:bar.bottom,resultsTop:list.top,resultsBottom:list.bottom,readerBottom:surface.bottom,
        mode:root.dataset.searchResultsOpen,paperVisibility:getComputedStyle(root.querySelector('.ll-reader-surface')).visibility,
        hitReachable:target===button||button.contains(target)};
    });
    assert.equal(searchGeometry.mode,'true');
    assert.equal(searchGeometry.paperVisibility,'hidden');
    assert.ok(searchGeometry.toolbarBottom<=searchGeometry.resultsTop+1&&searchGeometry.resultsBottom<=searchGeometry.readerBottom+1&&searchGeometry.hitReachable,
      `Dedicated result list must stay inside the reader with reachable results: ${JSON.stringify(searchGeometry)}`);
    await screenshot('05c-phone-source-search.png');
    const unit=await hit.getAttribute('data-id');
    await hit.click();
    const match=reader.locator(`[data-unit="${unit}"].ll-search-target`);
    await match.waitFor();
    await page.waitForFunction(()=>document.activeElement?.matches('.ll-search-target'));
    assert.equal(await reader.locator('.ll-search-results').isVisible(),false);
    assert.equal(await search.inputValue(),'Срок');
    assert.ok(await reader.locator('.ll-paper').evaluate(node=>node.scrollTop>0));
    await screenshot('05d-phone-source-search-result.png');
    check('Phone search and result navigation leave the toolbar and law text usable',searchGeometry);
    stage='reader-citation';
    await match.click();
    await page.locator('[data-source-reference-tray]').waitFor({state:'visible'});
    await screenshot('05-phone-source-reference.png');
    await page.locator('[data-source-reference-use]').click();
    assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),'documents');
    assert.equal(await page.locator('[data-details="source-notes"]').count(),1);
    check('Source passage saved in Documents without filling a duplicate legal quiz');
  }else{throw Error('Documents page has no supported in-platform source link');}
  stage='calendar-and-draft';
  await navigate('decision');
  assert.equal(await page.locator('[data-decision="law.number"], [data-decision="law.article"], [data-decision="assessment.actDate"], [data-decision="assessment.applicationId"], [data-action-order]').count(),0);
  await page.locator('[data-decision="reasoning"]').fill('Факты сопоставлены с документами. Проверяю правовое основание и срок.');
  const reasoning=await page.locator('[data-decision="reasoning"]').inputValue();
  assert.equal(await page.locator('[data-calendar-workbench], [data-decision="deadline"]').count(),0);
  await click('[data-deadline-summary] [data-action="page"][data-page="calendar"]');
  assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),'calendar');
  await page.locator('[data-calendar-workbench]').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-calendar-action="anchor-event"], [data-calendar-action^="step-"], [data-calendar-action="use-date"], [data-calendar-details="tools"], [data-decision="deadline"]').count(),0);
  assert.equal(await page.locator('[data-calendar-action="target"]').count(),2);
  for(const id of ['sent','received','registered']){
    assert.equal(await page.locator(`[data-calendar-action="choose-date"][data-date="${events[id]}"] .rxw-event-dots .event-${id}`).count(),1);
  }
  const referral=dateAfter(events.registered,7),deadline=dateAfter(events.registered,30);
  await chooseDate('referral',referral);
  await chooseDate('deadline',deadline);
  await page.locator('[data-calendar-input="registration-timely"]').check();
  await savedDates(referral,deadline);
  await page.locator('.rxa-page-content').evaluate(content=>{content.scrollTop=0;});
  await screenshot('06-phone-calendar.png');
  const norms=page.locator('[data-calendar-details="norms"]');
  await norms.locator('summary').click();
  assert.equal(await norms.evaluate(details=>details.open),true);
  const legalQuotes=await norms.innerText();
  for(const norm of view.case.workbook.norms)assert.ok(legalQuotes.includes(typeof norm.label==='string'?norm.label:norm.label.ru),'Applicable legal reference is shown');
  await screenshot('06b-phone-calendar-norms.png');
  await navigate('chat');assert.equal(await page.locator('[data-message-draft]').inputValue(),'Уточню обстоятельства после чтения документа.');
  assert.equal(await page.locator('.rxa-message[data-message-id]').count(),messageCount);
  await navigate('decision');assert.equal(await page.locator('[data-decision="reasoning"]').inputValue(),reasoning);
  await decisionDates(referral,deadline);
  await screenshot('07-phone-decision.png');
  const route=page.locator('[data-details="assessment-routing"]');
  await route.locator('summary').click();
  assert.equal(await route.locator('[data-routing-territory]').inputValue(),'ru-77');
  await route.locator('[data-routing-search]').fill('Роскомнадзор');
  assert.ok(await route.locator('[data-routing-recipient]').count()>0);
  const recipient=route.locator('[data-routing-recipient]').first(), recipientId=await recipient.getAttribute('value');
  await recipient.check();
  await route.locator('.rxa-routing-filters').evaluate(filters=>filters.scrollIntoView({block:'start'}));
  const authorityGeometry=await route.locator(`[data-routing-recipient][value="${recipientId}"]`).evaluate(input=>{
    const row=input.closest('label'), text=row.querySelector('span');
    const outer=row.getBoundingClientRect(), name=text.getBoundingClientRect(), control=input.getBoundingClientRect();
    return {rowHeight:outer.height,listHeight:input.closest('.rxa-routing-options').clientHeight,checkboxWidth:control.width,nameWidth:name.width,
      withinRow:control.right<=name.left&&name.right<=outer.right+1,name:text.innerText};
  });
  assert.ok(authorityGeometry.rowHeight<=authorityGeometry.listHeight+1&&authorityGeometry.checkboxWidth<=44&&
    authorityGeometry.nameWidth>=100&&authorityGeometry.withinRow&&authorityGeometry.name.includes('Роскомнадзор'),
    `The authority checkbox or label overflows its row: ${JSON.stringify(authorityGeometry)}`);
  await screenshot('07b-phone-authority-picker.png');
  await navigate('calendar');await savedDates(referral,deadline);
  check('Five pages retain chat, selected authority, registration check and two manually chosen dates');
  stage='exit-and-return';
  await page.locator('header [data-action="exit"]').click();await page.locator('#qaReenter').waitFor({state:'visible'});
  assert.equal(await page.locator('nav.mobile-nav').isVisible(),true);
  await page.locator('#qaReenter').click();await idle();
  assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),'calendar');
  await savedDates(referral,deadline);
  await navigate('decision');assert.equal(await page.locator('[data-decision="reasoning"]').inputValue(),reasoning);
  await decisionDates(referral,deadline);
  if(!await route.evaluate(details=>details.open))await route.locator('summary').click();
  assert.equal(await route.locator(`[data-routing-recipient][value="${recipientId}"]`).isChecked(),true);
  const saved=await page.evaluate(()=>Object.values(localStorage).map(value=>{try{return JSON.parse(value);}catch{return null;}}).filter(Boolean));
  assert.ok(saved.some(item=>item.sessionId===sessionId));await shellHidden();
  check('Exit restores platform navigation; return restores same shift and drafts');
  stage='phone-sizes';
  for(const [width,height] of [[320,740],[360,780],[390,844]]){
    await page.setViewportSize({width,height});
    const tabs=await page.locator('.rxa-mobile-nav [data-action="page"]').evaluateAll(buttons=>buttons.map(button=>{
      const rect=button.getBoundingClientRect(),label=button.lastElementChild;
      return {page:button.dataset.page,width:rect.width,height:rect.height,left:rect.left,right:rect.right,labelWidth:label.clientWidth,labelScroll:label.scrollWidth,icon:!!button.querySelector('.rxa-icon')};
    }));
    assert.equal(tabs.length,5);
    assert.ok(tabs.every(tab=>tab.width>=43.5&&tab.height>=43.5&&tab.left>=0&&tab.right<=width+1&&tab.labelScroll<=tab.labelWidth+1&&tab.icon),`Five accessible destinations at ${width}: ${JSON.stringify(tabs)}`);
    check(`Five navigation targets fit at ${width}`,{tabs});
    for(const name of ['reception','chat','documents','calendar','decision']){await navigate(name);await noOverflow(`${name} ${width}`);await shellHidden();if(name==='chat')await phoneComposerVisible(String(width));}
  }
  await page.setViewportSize({width:390,height:460});await navigate('chat');await page.locator('[data-message-draft]').focus();
  await noOverflow('short viewport 390×460');await phoneComposerVisible('short viewport 390×460');await screenshot('08-short-viewport-chat.png');
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});await navigate('reception');
  assert.equal(await page.locator('video[data-rxa-motion]').evaluateAll(videos=>videos.every(v=>v.paused)),true);
  check('Reduced motion pauses decorative video');
  stage='video-startup-recovery';
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(()=>{
    const original=HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType=function(type){return String(type).includes('vp9')?'probably':original.call(this,type);};
    HTMLVideoElement.prototype.requestVideoFrameCallback=()=>1;
    HTMLVideoElement.prototype.cancelVideoFrameCallback=()=>{};
  });
  await page.reload({waitUntil:'networkidle'});await idle();await navigate('reception');
  const recoveryImage=page.locator('[data-rxa-motion-ready] [data-rxa-motion-image]');
  await recoveryImage.waitFor({state:'visible'});
  const firstRecoveryFrame=await recoveryImage.screenshot({animations:'allow'});
  await page.waitForTimeout(420);
  assert.ok(!firstRecoveryFrame.equals(await recoveryImage.screenshot({animations:'allow'})),'Recovery must show visibly changing animation frames');
  check('A decoder without a rendered first frame recovers to visibly moving original WebP');
  stage='animated-webp-fallback';
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(()=>{
    const original=HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType=function(type){return String(type).includes('webm')?'':original.call(this,type);};
  });
  await page.reload({waitUntil:'networkidle'});await idle();await navigate('reception');
  await page.waitForFunction(()=>{const img=document.querySelector('[data-rxa-motion-image]');return img?.complete&&img.naturalWidth>0&&img.closest('[data-rxa-motion-ready]');});
  assert.equal(await page.locator('video[data-rxa-motion][src]').count(),0);
  const fallback=await page.evaluate(async()=>{
    const image=document.querySelector('[data-rxa-motion-image]'),buffer=await fetch(image.src).then(r=>r.arrayBuffer()),bytes=new Uint8Array(buffer),data=new DataView(buffer);
    const text=(at,size)=>String.fromCharCode(...bytes.slice(at,at+size));let frames=0,loop=null,duration=0;
    for(let at=12;at+8<=bytes.length;){const type=text(at,4),size=data.getUint32(at+4,true);if(at+8+size>bytes.length)break;if(type==='ANMF'&&size>=16){frames++;duration+=bytes[at+20]+256*bytes[at+21]+65536*bytes[at+22];}if(type==='ANIM'&&size>=6)loop=data.getUint16(at+12,true);at+=8+size+(size%2);}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');context.drawImage(image,0,0,1,1,0,0,1,1);
    return {header:text(0,4),format:text(8,4),frames,loop,duration,width:image.naturalWidth,bytes:bytes.length,cornerAlpha:context.getImageData(0,0,1,1).data[3]};
  });
  assert.equal(fallback.header,'RIFF');assert.equal(fallback.format,'WEBP');assert.equal(fallback.frames,120);assert.equal(fallback.width,320);assert.equal(fallback.loop,0);
  assert.ok(fallback.duration>=9500&&fallback.duration<=10500,'The fallback preserves the original loop duration');
  assert.ok(fallback.cornerAlpha<32,'The decoded WebP preserves the transparent background');
  const fallbackImage=page.locator('[data-rxa-motion-image]'),firstFallbackFrame=await fallbackImage.screenshot({animations:'allow'});
  await page.waitForTimeout(420);assert.ok(!firstFallbackFrame.equals(await fallbackImage.screenshot({animations:'allow'})),'Fallback animation frames must visibly change');
  check('Unsupported VP9 displays the transparent original animation',{...fallback,framePlaybackObserved:true});
  await screenshot('09-phone-webp-fallback.png');
  await navigate('chat');assert.equal(await page.locator('[data-rxa-motion-image][src]').count(),0);
  await navigate('reception');await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!document.querySelector('[data-rxa-motion-image][src]'));
  check('Leaving reception and reduced motion release the image animation');
  stage='retired-unfinished-session';
  await page.evaluate(()=>sessionStorage.setItem('qa.reception.release','b'.repeat(32)));
  await page.reload({waitUntil:'networkidle'});await idle();
  await page.locator('[data-action="start"]').waitFor();
  assert.equal(await page.locator('.rxa-mobile-nav [data-page="chat"]').isDisabled(),true);
  assert.equal(await page.locator('[data-action="resume-session"]').count(),0);
  assert.ok((await page.locator('#receptionAI').innerText()).includes('результаты завершённых смен сохранены'));
  const fresh=await apiResponse('start',()=>page.locator('[data-action="start"]').click());
  assert.notEqual(fresh.id,sessionId);assert.equal(fresh.buildId,'b'.repeat(32));
  check('A new release retires the old unfinished local and server session and starts a fresh game');
  await screenshot('10-phone-current-release.png');
  stage='independent-case-start-and-next';
  const setup=page.locator('[data-details="exercise-picker"]');
  await setup.locator('summary').click();
  await setup.locator('[name="mode"][value="independent"]').check();
  await scrollWorkspace();
  const independent=await apiResponse('start',()=>setup.locator('[data-action="start"]').click());
  assert.equal(independent.mode,'independent');
  assert.equal(independent.caseCount,8);
  await assertCaseAtTop('Independent shift starts at the top after scrolling through setup');
  const sessionIdForNext=independent.id;
  async function prepareIndependentReview(body){
    const response=await page.request.post(origin+'/api/reception',{data:{sessionId:sessionIdForNext,requestId:randomUUID(),...body}});
    const result=await response.json();
    assert.ok(result.ok,JSON.stringify(result.error));
    return result.view;
  }
  // Prepare a reviewed case without relying on the random exercise's grading
  // answer key. The next-case transition itself is triggered through the UI.
  let reviewed=await prepareIndependentReview({op:'decide',decision:{
    procedureId:independent.case.procedures[0].id,routeId:independent.case.routes[0].id,actionIds:[],
    law:{number:'',article:''},deadline:dateAfter(independent.case.workbook.events[2].date,30),basisDocumentIds:[],reasoning:'',
    workbook:{referralDeadline:'',registrationTimely:false,routing:{recipientIds:[]}},
    assessment:{factId:'',applicationId:'',trapId:'',actDate:'',calendar:{anchor:'',rule:'',start:'',shift:''},research:{recordId:'',fragmentId:'',extracted:'',finding:''}}
  }});
  if(reviewed.status==='followup')reviewed=await prepareIndependentReview({op:'followup',choiceId:reviewed.followup.options[0].id});
  assert.equal(reviewed.status,'review');
  await page.reload({waitUntil:'networkidle'});await idle();
  await navigate('reception');await scrollWorkspace();await navigate('decision');
  const next=await apiResponse('next',()=>page.locator('[data-action="next"]').click());
  assert.equal(next.id,sessionIdForNext);
  assert.equal(next.caseIndex,1);
  assert.notEqual(next.case.id,independent.case.id);
  await assertCaseAtTop('Next independent case opens at the top without the previous reception scroll');
  await screenshot('11-phone-next-case.png');
  stage='case-illustrations';
  await page.evaluate(()=>sessionStorage.setItem('qa.reception.release','c'.repeat(32)));
  await page.goto(origin+'/__qa/reception.html?context=free',{waitUntil:'networkidle'});await idle();
  await bank.selectOption('river-observation');await idle();
  const illustratedCase=await apiResponse('start',()=>page.locator('[data-action="start"]').click());
  const initialDocuments=illustratedCase.documents.map(document=>document.id);
  assert.deepEqual(illustratedCase.openedDocumentIds,[]);
  assert.ok(illustratedCase.documents.some(document=>document.id==='observation'));
  assert.deepEqual(illustratedCase.case.workbook.targets.map(({id,anchorId,ruleId})=>({id,anchorId,ruleId})),[
    {id:'referral',anchorId:'registered',ruleId:'calendar7'},
    {id:'deadline',anchorId:'referral',ruleId:'calendar30'},
  ]);
  await navigate('calendar');
  await calendarTarget('referral').waitFor({state:'visible'});
  await calendarTarget('deadline').waitFor({state:'visible'});
  assert.ok(!illustratedCase.case.workbook.events.some(event=>event.id==='recipientRegistered'));
  assert.match(await page.locator('.rxw-calendar-instruction').innerText(),/7 дней от первоначальной регистрации.*30 дней от рассчитанного срока переадресации/);
  check('Appeal calendar shows seven-day referral and thirty-day response from the referral deadline');
  await navigate('documents');
  assert.deepEqual(await page.locator('.rxa-document-list [data-action="document"]').evaluateAll(buttons=>buttons.map(button=>button.dataset.id)),initialDocuments);
  await navigate('chat');
  assert.equal(await page.locator('.rxa-messages [data-action="document"]').count(),0);
  await page.locator('[data-message-draft]').fill('Покажите материалы обращения.');
  const afterMessage=await apiResponse('message',()=>page.locator('[data-chat-form] button[type="submit"]').click());
  assert.deepEqual(afterMessage.documents.map(document=>document.id),initialDocuments);
  assert.equal(await page.locator('.rxa-messages [data-action="document"]').count(),0);
  const thumbnail=page.locator('.rxa-messages [data-action="illustration-open"][data-id="E24__1"]');
  const viewer=page.locator('.rxa-illustration-dialog');
  for(const [width,height] of [[390,844],[1280,900]]){
    await page.setViewportSize({width,height});
    const thumb=thumbnail.locator('img');
    assert.equal(await thumb.evaluate(async image=>{await image.decode();return image.naturalWidth;}),420);
    const thumbBounds=await thumb.boundingBox();
    await thumbnail.click();
    const fullImage=viewer.locator('img');
    const fullWidth=await fullImage.evaluate(async image=>{await image.decode();return image.naturalWidth;});
    assert.equal(fullWidth,832);
    const bounds=await fullImage.boundingBox();
    assert.ok(bounds.width>thumbBounds.width&&bounds.x>=0&&bounds.x+bounds.width<=width+1);
    assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height+1);
    await screenshot(`12-illustration-${width}.png`);
    await page.keyboard.press('Escape');
    await viewer.waitFor({state:'detached'});
    assert.equal(await thumbnail.evaluate(button=>document.activeElement===button),true);
  }
  await navigate('documents');
  const photoRecord=page.locator('.rxa-document-list [data-action="document"][data-id="observation"]');
  const openedPhoto=await apiResponse('document',()=>photoRecord.click());
  assert.deepEqual(openedPhoto.openedDocumentIds,['observation'],'Opening a chat image does not register its document as read');
  check('An existing case illustration opens at full size without revealing or marking a case document read');
  stage='seminar-and-optimistic-chat';
  await page.evaluate(()=>sessionStorage.setItem('qa.reception.release','d'.repeat(32)));
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/__qa/reception.html?context=seminar',{waitUntil:'networkidle'});await idle();
  assert.equal(await page.locator('[name="trainingCaseId"],[name="trainingLevel"],[name="caseSearch"]').count(),0);
  assert.equal(await page.locator('[name="mode"][value="training"]').count(),1);
  assert.equal(await page.locator('[name="mode"][value="independent"]').count(),1);
  const seminar=await apiResponse('start',()=>page.locator('[data-action="start"]').click());
  assert.equal(seminar.context,'seminar');assert.equal(seminar.caseCount,1);
  await navigate('chat');
  let releaseMessage;
  const heldMessage=new Promise(resolve=>{releaseMessage=resolve;});
  const blockMessage=async route=>{
    if(route.request().postDataJSON()?.op==='message')await heldMessage;
    await route.continue();
  };
  await page.route('**/api/reception',blockMessage);
  const draft=page.locator('[data-message-draft]'), message='Уточните, пожалуйста, обстоятельства обращения.';
  await draft.fill(message);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/reception')&&r.request().postDataJSON()?.op==='message');
  try{
    await page.locator('[data-chat-form] button[type="submit"]').click();
    assert.equal(await draft.inputValue(),'');
    assert.equal(await page.locator('[data-pending-message].user .rxa-bubble p').innerText(),message);
    assert.equal(await page.locator('.rxa-message.assistant').count(),1);
  }finally{releaseMessage();}
  const sent=await (await response).json();assert.equal(sent.ok,true);
  await idle();await page.unroute('**/api/reception',blockMessage);
  assert.equal(await page.locator('.rxa-message.user').count(),1);
  assert.equal(await page.locator('[data-pending-message]').count(),0);
  check('Seminar selects one case without filters and shows the cleared composer and outgoing message immediately');
  if(seminar.case.workbook.targets.some(target=>target.id==='referral')){
    await navigate('calendar');
    await calendarTarget('referral').waitFor({state:'visible'});
    await calendarTarget('deadline').waitFor({state:'visible'});
    check('Seminar appeal calendar shows both deadlines');
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure={stage,message:error.message};if(page)try{await screenshot('failure.png');}catch{}}
finally{
  await browser?.close();if(fixture)await new Promise(resolve=>fixture.server.listening?fixture.server.close(resolve):resolve());
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({status:report.status,stage,checks:report.checks.length,report:path.join(out,'report.json'),failure:report.failure}));
if(report.status!=='passed')process.exitCode=1;
