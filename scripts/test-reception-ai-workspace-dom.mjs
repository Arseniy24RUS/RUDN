#!/usr/bin/env node
/** Functional integration with the real frontend, server and full private bank.
 * jsdom does not render layout, play video or emulate a physical phone keyboard.
 * All service calls use a local mock; no network, paid model or real grades.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
if(args.includes('--help')){
  console.log('node scripts/test-reception-ai-workspace-dom.mjs --cases /private-data/cases [--jsdom /path/jsdom/lib/api.js] [--out /reports]\nFunctional DOM only; no browser layout, paid model, Firebase or real grades.');process.exit(0);
}
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'..'),site=path.join(repo,'site');
const out=path.resolve(arg('--out',path.join(os.tmpdir(),'rudn-reception-workspace-dom')));
const modulePath=arg('--jsdom',process.env.RECEPTION_JSDOM_MODULE);
const {JSDOM,VirtualConsole}=await import(modulePath?pathToFileURL(path.resolve(modulePath)):'jsdom');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
const dom=new JSDOM('<!doctype html><html lang="ru"><head></head><body><main id="receptionAI"></main><nav class="mobile-nav">Курс Журнал</nav></body></html>',{url:'http://127.0.0.1:8793/__qa/reception.html',pretendToBeVisual:true,virtualConsole:vc});
for(const key of ['window','document','location','localStorage','CustomEvent','Event','MouseEvent','KeyboardEvent','HTMLElement','HTMLDialogElement','AbortController','AbortSignal','Node','NodeFilter','DOMParser','DOMException','MutationObserver'])globalThis[key]=dom.window[key];
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.innerHeight=844;globalThis.visualViewport=undefined;globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.matchMedia=dom.window.matchMedia=query=>({matches:query.includes('max-width'),addEventListener(){},removeEventListener(){}});
globalThis.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,match=>'\\'+match)};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
dom.window.HTMLMediaElement.prototype.canPlayType=function(){return 'probably';};
dom.window.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
dom.window.HTMLMediaElement.prototype.pause=function(){};
dom.window.HTMLMediaElement.prototype.load=function(){};
// A stylesheet load event is transport-only. No CSS/layout success is inferred.
const originalAppend=document.head.append.bind(document.head);
document.head.append=(...nodes)=>{originalAppend(...nodes);for(const node of nodes)if(node.tagName==='LINK')queueMicrotask(()=>node.dispatchEvent(new Event('load')));};

let modelCalls=0,loseNextReply=false,loseNextFollowup=false,failProvider=false,holdProvider=false,releaseProvider;
let holdResponseOperation='',releaseResponse;
const provider={name:'mock',async generate({actorCase}){
  modelCalls++;
  if(holdProvider){holdProvider=false;await new Promise(resolve=>{releaseProvider=resolve;});}
  if(failProvider){failProvider=false;throw Error('Simulated provider outage');}
  return {reply:'Вот документы по моему обращению. <img src=x onerror="alert(1)">',revealedFactIds:[],releasedDocumentIds:actorCase.documents.map(d=>d.id),usage:{inputTokens:0,outputTokens:0}};
}};
const fixture=await createReceptionFixture({casesDirectory:arg('--cases',process.env.RECEPTION_AI_CASES_DIR),provider}),calls=[];
let lastView=null,lastAPIError=null,handle,stage='mount',exited=false;
const fetchAPI=async(_url,options)=>{
  const body=JSON.parse(options.body);calls.push(structuredClone(body));
  try{
    const response=await fixture.service.handle(body,fixture.identity);
    if(body.op===holdResponseOperation){holdResponseOperation='';await new Promise(resolve=>{releaseResponse=resolve;});}
    if(response.view)lastView=response.view;
    if(body.op==='message'&&loseNextReply){loseNextReply=false;throw new TypeError('Simulated lost response');}
    if(body.op==='followup'&&loseNextFollowup){loseNextFollowup=false;throw new TypeError('Simulated lost follow-up response');}
    return {ok:true,status:200,json:async()=>response};
  }catch(error){if(error instanceof TypeError)throw error;lastAPIError={code:error.code,message:error.message};return {ok:false,status:error.status||500,json:async()=>({ok:false,error:{code:error.code||'qa-error'}})};}
};
const fetched=[];
globalThis.fetch=async(input,options={})=>{
  if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
  const url=new URL(input,location.href);
  let filename=url.protocol==='file:'?fileURLToPath(url):path.join(site,url.pathname);
  filename=path.resolve(filename);
  if(!filename.startsWith(site+path.sep))throw Error('QA blocked external fetch: '+url.origin);
  fetched.push(filename.slice(site.length+1));
  try{const bytes=await readFile(filename);return new Response(bytes,{status:200,headers:{'content-type':filename.endsWith('.gz')?'application/gzip':'application/json'}});}
  catch(error){return new Response('',{status:404});}
};
const root=document.getElementById('receptionAI');
const {mountReceptionAI}=await import(pathToFileURL(path.join(site,'apps/reception/ai/app.js')));
const config={endpoint:'/api/reception',demo:true};
const options={locale:'ru',studentKey:fixture.identity.studentKey,fetch:fetchAPI,context:'course',period:'2026-2027',assessmentAllowed:true,onExit:()=>{exited=true;}};
const report={suite:'reception-repair-dom',status:'running',caseCount:fixture.caseCount,dataKind:fixture.dataKind,checks:[],errors,
  limitations:['Functional DOM only: no browser layout, video decoding, actual mobile keyboard or platform Firebase route.','All API calls use a local mock provider; no paid model or real gradebook.']};
const passed=(name,extra={})=>report.checks.push({name,status:'passed',...extra});
const node=selector=>{const found=document.querySelector(selector);assert.ok(found,`Missing ${selector}; ${lastAPIError?.code||''}`);return found;};
async function settle(){await handle?.flush?.();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(root.getAttribute('aria-busy'),'false');}
async function click(selector){node(selector).click();await settle();}
function input(selector,value){const element=node(selector);element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));}
function choose(selector){const element=node(selector);element.checked=true;element.dispatchEvent(new Event('change',{bubbles:true}));}
async function select(selector,value){const element=node(selector);element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));await settle();}
async function go(page){await click(`.rxa-mobile-nav [data-action="page"][data-page="${page}"]`);assert.equal(root.dataset.page,page);assert.equal(root.dataset.mobilePane,page==='chat'?'chat':'desk');}
async function chat(value){if(root.dataset.page!=='chat')await go('chat');input('[data-message-draft]',value);node('[data-chat-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();}
async function until(condition,label,timeout=7000){const start=Date.now();while(Date.now()-start<timeout){if(condition())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Timed out: '+label+'; '+(document.querySelector('[data-source-reader-status]')?.textContent||''));}
try{
  handle=await mountReceptionAI(root,options,config);await settle();
  assert.equal(root.dataset.page,'reception');
  assert.ok(root.classList.contains('rxa-cabinet'),'The approved cabinet surface is mounted');
  assert.ok([...document.head.querySelectorAll('link[rel="stylesheet"]')].some(link=>new URL(link.href).pathname.endsWith('/ai/cabinet.css')),'The cabinet presentation is loaded');
  assert.equal(node('[name="mode"][value="training"]').checked,true);
  assert.equal(node('[name="mode"][value="independent"]').disabled,false);
  const all=[...node('[name="trainingCaseId"]').options].filter(option=>option.value);
  assert.equal(all.length,fixture.caseCount);
  await select('[name="trainingLevel"]','3');
  const advanced=[...node('[name="trainingCaseId"]').options].filter(option=>option.value);
  assert.ok(advanced.length>0&&advanced.length<fixture.caseCount);
  await select('[name="trainingLevel"]','');
  await select('[name="trainingCaseId"]','complaint-routing');
  passed('Lobby exposes training, independent shift, the whole case bank and difficulty filter',{cases:fixture.caseCount,advancedCases:advanced.length});
  stage='start-and-navigation';
  await click('[data-action="start"]');
  assert.equal(lastView.case.id,'complaint-routing');assert.equal(lastView.mode,'training');
  stage='reader-closes-on-delayed-new-case';
  node('[data-details="exercise-picker"] > summary').click();
  await select('[name="trainingCaseId"]','budget');
  holdResponseOperation='start';node('[data-action="start"]').click();
  await until(()=>Boolean(releaseResponse),'held new-case response');
  assert.equal(root.getAttribute('aria-busy'),'true');assert.equal(root.dataset.caseId,'complaint-routing');
  node('.rxa-mobile-nav [data-page="documents"]').click();node('[data-action="tab"][data-tab="sources"]').click();node('a[data-source-reader]').click();
  await until(()=>document.querySelector('.rx-source-embedded [data-unit]'),'old-case source opens while starting another case');
  const readerBeforeNewCase=node('.rx-source-embedded');readerBeforeNewCase.querySelector('[data-unit]').click();
  const oldCitationButton=node('[data-source-reference-use]');assert.equal(oldCitationButton.disabled,false);
  assert.equal(root.dataset.sourceReaderOpen,'true');
  releaseResponse();releaseResponse=null;await settle();
  assert.equal(lastView.case.id,'budget');assert.equal(root.dataset.page,'reception');assert.equal(root.dataset.caseId,'budget');
  assert.equal(root.dataset.sourceReaderOpen,undefined,'A new case removes the prior source scroll-lock flag');
  assert.equal(document.querySelector('.rx-source-embedded'),null);assert.equal(readerBeforeNewCase.isConnected,false);
  oldCitationButton.click();assert.equal(root.dataset.page,'reception','The obsolete reader cannot transfer a citation into the new case');
  await go('decision');assert.equal(node('[data-decision="law.number"]').value,'');assert.equal(root.querySelector('[data-reference-id]'),null);
  await go('documents');await click('[data-action="tab"][data-tab="sources"]');
  assert.ok([...root.querySelectorAll('a[data-source-reader]')].some(link=>lastView.case.sources.some(source=>source.url===link.href)),'The new case has its own accessible source list');
  node('a[data-source-reader]').click();await until(()=>document.querySelector('.rx-source-embedded [data-unit]'),'new-case source opens');
  assert.notEqual(node('.rx-source-embedded'),readerBeforeNewCase);await click('[data-source-reader-close]');
  assert.equal(root.dataset.sourceReaderOpen,undefined);assert.ok(root.querySelector('.rxa-documents-library'));
  passed('A delayed start closes the old-case reader, clears its scroll flag and prevents stale citations while new sources remain accessible');
  // Restore the chosen exercise before continuing its complete workflow.
  await go('reception');node('[data-details="exercise-picker"] > summary').click();
  await select('[name="trainingCaseId"]','complaint-routing');await click('[data-action="start"]');
  stage='start-and-navigation';
  const sessionId=lastView.id;
  assert.equal(root.dataset.page,'reception');assert.equal(node('[data-chat-unread]').textContent,'1');
  assert.deepEqual([...root.querySelectorAll('.rxa-mobile-nav [data-action="page"]')].map(button=>button.dataset.page),['reception','chat','documents','calendar','decision']);
  assert.ok(root.querySelector('[data-rxa-actor]'));assert.ok(root.querySelector('video[data-rxa-motion]'));
  await go('chat');assert.equal(root.querySelector('[data-chat-unread]'),null);
  input('[data-message-draft]','Покажите, пожалуйста, документы по обращению.');
  node('[data-chat-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(lastView.messages.length,3);assert.ok(lastView.documents.length);
  const messageIds=lastView.messages.map(message=>message.id);
  input('[data-message-draft]','Уточню обстоятельства после чтения закона.');
  await go('documents');await click('.rxa-document-list [data-action="document"]');
  assert.ok(node('.rxa-document-body').textContent.trim().length>20);assert.ok(lastView.openedDocumentIds.length);
  passed('Reception starts with unread 1; chat works; document opening is recorded');
  stage='calendar-draft';
  await go('decision');input('[data-decision="reasoning"]','Факты сопоставлены с материалами. Проверяю норму и срок.');
  assert.equal(root.querySelector('[data-calendar-workbench], [data-decision="deadline"]'),null,'Date editing belongs to its own Calendar page');
  await click('[data-deadline-summary] [data-action="page"][data-page="calendar"]');assert.equal(root.dataset.page,'calendar');
  await click('[data-calendar-action="anchor-event"]');await click('[data-calendar-action="step-day"]');
  const selectedDate=node('[data-calendar-action="choose-date"][aria-pressed="true"]').dataset.date;
  await click('[data-calendar-action="use-date"]');assert.equal(node('[data-decision="deadline"]').value,selectedDate);
  await go('chat');assert.equal(node('[data-message-draft]').value,'Уточню обстоятельства после чтения закона.');
  assert.deepEqual([...root.querySelectorAll('.rxa-message[data-message-id]')].map(el=>el.dataset.messageId),messageIds);
  await go('decision');assert.equal(node('[data-decision="reasoning"]').value,'Факты сопоставлены с материалами. Проверяю норму и срок.');
  assert.equal(node('[data-deadline-summary] time').dateTime,selectedDate);
  await go('calendar');assert.equal(node('[data-decision="deadline"]').value,selectedDate);
  assert.equal(node('[data-calendar-action="choose-date"][aria-pressed="true"]').dataset.date,selectedDate);
  passed('Five pages retain the chat draft, transcript, decision and selected calendar date',{selectedDate});
  stage='reader-to-legal-basis';
  await go('documents');await click('[data-action="tab"][data-tab="sources"]');
  const source=node('a[data-source-reader]');assert.equal(source.target,'');
  assert.equal([...source.parentElement.querySelectorAll('a')].filter(link=>link.href===source.href).length,1);
  source.click();
  await until(()=>document.querySelector('.rx-source-dialog [data-unit]'),'source paragraphs');
  assert.equal(root.dataset.page,'documents');
  assert.ok(root.querySelector('[data-source-reader-host] .rx-source-embedded'),'The source opens inside the Documents page');
  assert.ok(root.querySelector('.rxa-mobile-nav [data-page="chat"]'),'Workspace navigation remains outside the reading surface');
  assert.equal(document.querySelector('.rx-source-dialog')?.tagName,'SECTION','Embedded reading must not open a modal over the entire workplace');
  const unit=document.querySelector('.rx-source-dialog [data-unit]');unit.click();
  await until(()=>document.querySelector('[data-source-reference-use]')?.disabled===false,'reference use becomes enabled');
  document.querySelector('[data-source-reference-use]').click();
  await until(()=>!document.querySelector('.rx-source-dialog'),'source closes after selection');await settle();
  assert.equal(root.dataset.page,'decision');
  assert.ok(node('[data-decision="law.number"]').value);
  assert.ok(root.querySelector('[data-reference-id]')||root.textContent.includes('Выбранное правовое основание'));
  const lawNumber=node('[data-decision="law.number"]').value;
  passed('Actual internal reader paragraph selection populates the legal basis',{lawNumber,readerFiles:fetched.length});
  stage='exit-cross-context-resume';
  await go('calendar');
  await click('header [data-action="exit"]');assert.equal(exited,true);
  await handle();
  assert.equal(document.body.classList.contains('reception-immersive'),false);
  handle=await mountReceptionAI(root,{...options,context:'free'},config);await settle();
  assert.equal(document.body.classList.contains('reception-immersive'),true);
  assert.equal(lastView.id,sessionId);
  assert.equal(root.dataset.page,'calendar','Re-entry restores the separate Calendar page');
  assert.equal(root.dataset.mobilePane,'desk','Legacy phone pane styling must not hide the restored calendar');
  assert.equal(node('[data-decision="deadline"]').value,selectedDate);
  assert.equal(node('[data-calendar-action="choose-date"][aria-pressed="true"]').dataset.date,selectedDate);
  await go('decision');assert.equal(node('[data-deadline-summary] time').dateTime,selectedDate);
  assert.equal(node('[data-decision="law.number"]').value,lawNumber);
  assert.equal(node('[data-decision="reasoning"]').value,'Факты сопоставлены с материалами. Проверяю норму и срок.');
  await go('chat');assert.equal(node('[data-message-draft]').value,'Уточню обстоятельства после чтения закона.');
  passed('Exit and re-entry through another platform context preserve the same shift and all drafts');
  stage='languages';
  for(const locale of ['en','zh','ru']){
    const settings=node('[data-details="cabinet-settings"]');if(!settings.open)settings.querySelector('summary').click();
    assert.equal(settings.open,true);await select('[data-language]',locale);assert.equal(root.lang,locale);
    await go('calendar');assert.equal(node('[data-decision="deadline"]').value,selectedDate);
    await go('decision');assert.equal(node('[data-deadline-summary] time').dateTime,selectedDate);
  }
  passed('Header settings switch RU/EN/ZH while preserving the decision and deadline');
  stage='pending-message-and-unread';
  await go('chat');holdProvider=true;input('[data-message-draft]','Уточните, пожалуйста, ещё одно обстоятельство.');
  node('[data-chat-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>Boolean(releaseProvider),'held mock message');
  assert.ok(root.querySelector('[data-pending-message]'));assert.ok(root.querySelector('[data-typing]'));
  assert.ok(root.querySelector('[data-pending-message] [data-delivery-state="pending"]'));
  node('.rxa-mobile-nav [data-page="documents"]').click();assert.equal(root.dataset.page,'documents');
  node('[data-action="tab"][data-tab="sources"]').click();node('a[data-source-reader]').click();
  await until(()=>document.querySelector('.rx-source-embedded [data-unit]'),'reader opens during held reply');
  const readerDuringReply=node('.rx-source-embedded');readerDuringReply.querySelector('[data-unit]').click();
  assert.equal(node('[data-source-reference-use]').disabled,false);
  const selectedDuringReply=node('[data-source-reference-preview]').textContent;
  releaseProvider();releaseProvider=null;await settle();
  assert.equal(node('[data-chat-unread]').textContent,'1');
  assert.equal(node('[data-source-reader-host] .rx-source-embedded'),readerDuringReply,'The same reader controller survives the asynchronous app rerender');
  assert.equal(node('[data-source-reference-preview]').textContent,selectedDuringReply);
  assert.equal(node('[data-source-reference-use]').disabled,false);
  await go('chat');assert.equal(root.querySelector('[data-chat-unread]'),null);
  assert.equal(root.querySelector('.rx-source-embedded'),null,'Changing workspace closes the embedded reader');
  assert.equal(root.querySelector('[data-pending-message], [data-typing]'),null);
  assert.ok(node('.rxa-messages').textContent.includes('<img src=x'));
  assert.equal(root.querySelector('.rxa-messages img[src="x"]'),null);
  assert.ok(root.querySelector('[data-delivery-state="sent"]'));assert.ok(root.querySelector('.rxa-message time[datetime]'));
  passed('An embedded document and selected passage survive a late chat reply; switching away closes the reader');
  passed('Pending/sent message, typing, safe text and unread notification when the reply arrives on another page');
  stage='retry-and-provider-failure';
  const beforeCalls=modelCalls;loseNextReply=true;await chat('Повторите, пожалуйста.');
  assert.ok(root.querySelector('[data-action="retry"]'));assert.equal(node('[data-message-draft]').value,'Повторите, пожалуйста.');
  await click('[data-action="retry"]');
  const messageRequests=()=>calls.filter(call=>call.op==='message');
  assert.equal(modelCalls,beforeCalls+1);assert.equal(messageRequests().at(-1).requestId,messageRequests().at(-2).requestId);
  assert.equal(node('[data-message-draft]').value,'');
  failProvider=true;await chat('Проверьте, пожалуйста, ещё раз.');assert.ok(root.querySelector('[data-action="refresh"]'));
  const failedId=messageRequests().at(-1).requestId;await click('[data-action="refresh"]');await chat('Проверьте, пожалуйста, ещё раз.');
  assert.notEqual(messageRequests().at(-1).requestId,failedId);assert.equal(node('[data-message-draft]').value,'');
  passed('Lost reply retries idempotently; definitive provider failure preserves text and allows a new send after resume');
  stage='authored-decision-and-followup';
  const template=fixture.cases.find(c=>c.id===lastView.case.id);
  const currentCase=[template,...(template.dateVariants||[])].find(c=>c.public.date===lastView.case.date)||template;
  await go('documents');await click('[data-tab="documents"]');
  for(const doc of lastView.documents)await click(`.rxa-document-list [data-action="document"][data-id="${doc.id}"]`);
  await go('decision');
  choose(`[data-decision="procedureId"][value="${currentCase.rubric.procedureIds[0]}"]`);
  choose(`[data-decision="routeId"][value="${currentCase.rubric.routeIds[0]}"]`);
  const authored=currentCase.rubric.authored;
  const plan=authored?.decisionPlans.find(p=>p.routes.includes(currentCase.rubric.routeIds[0]));
  const required=plan?.requiredActions||currentCase.rubric.requiredActionIds;
  for(const id of required)choose(`[data-decision="actionIds"][value="${id}"]`);
  for(const id of authored?authored.evidenceSets[0]:currentCase.rubric.evidenceGroups.map(ids=>ids[0]))choose(`[data-decision="basisDocumentIds"][value="${id}"]`);
  input('[data-decision="law.number"]',currentCase.rubric.legal.number);
  input('[data-decision="law.article"]',currentCase.rubric.legal.articles[0]);
  await go('calendar');input('[data-decision="deadline"]',currentCase.rubric.deadline);await go('decision');
  if(authored){
    assert.equal(root.querySelectorAll('.rxa-assessment-block').length,6);
    assert.equal(root.querySelector('[data-details="assessment-calendar"]'),null);
    const order=plan?.order||authored.order,remaining=new Set(required),sorted=[];
    while(remaining.size){const free=[...remaining].filter(id=>!order.some(([before,after])=>after===id&&remaining.has(before)));assert.ok(free.length,'Authored action order is acyclic');for(const id of free){sorted.push(id);remaining.delete(id);}}
    const first=required[0];if(required.length>1){await click(`[data-action="move-action"][data-id="${first}"][data-direction="down"]`);assert.equal(node('.rxa-action-order li:nth-child(2) button').dataset.id,first);}
    for(const id of [...sorted].reverse())while(root.querySelector('.rxa-action-order li:first-child button')?.dataset.id!==id)await click(`[data-action="move-action"][data-id="${id}"][data-direction="up"]`);
    assert.deepEqual([...root.querySelectorAll('.rxa-action-order li')].map(li=>li.querySelector('button').dataset.id),sorted);
    choose(`[data-decision="assessment.factId"][value="${authored.factIds[0]}"]`);
    choose(`[data-decision="assessment.applicationId"][value="${authored.knowledge.correct}"]`);
    choose(`[data-decision="assessment.trapId"][value="${authored.trap}"]`);
    input('[data-decision="assessment.actDate"]',authored.knowledge.actDate);
    await go('calendar');
    assert.equal(root.querySelectorAll('[data-details="assessment-calendar"]').length,1);
    for(const [key,value]of Object.entries({anchor:authored.calendar.anchor,rule:authored.calendar.rule,start:authored.calendar.start,shift:authored.calendar.acceptedShifts[0]}))choose(`[data-decision="assessment.calendar.${key}"][value="${value}"]`);
    const calendarDraft=JSON.stringify([...root.querySelectorAll('[data-decision]:checked')].map(n=>[n.dataset.decision,n.value]));
    const binding=authored.research.bindings[0];
    await go('documents');await click('[data-tab="sources"]');assert.ok(root.querySelector('.rxa-source-fragment'));
    await click(`[data-action="research-fragment"][data-record="${binding.recordId}"][data-fragment="${binding.fragmentId}"]`);
    assert.equal(node('[data-decision="assessment.research.recordId"]').value,binding.recordId);
    assert.equal(node('[data-decision="assessment.research.fragmentId"]').value,binding.fragmentId);
    input('[data-decision="assessment.research.extracted"]',authored.research.accepted[0]);
    choose(`[data-decision="assessment.research.finding"][value="${authored.research.finding}"]`);
    const beforeDraft=JSON.stringify([...root.querySelectorAll('[data-decision]:checked')].map(n=>[n.dataset.decision,n.value]));
    await handle();handle=await mountReceptionAI(root,options,config);await go('decision');
    assert.equal(JSON.stringify([...root.querySelectorAll('[data-decision]:checked')].map(n=>[n.dataset.decision,n.value])),beforeDraft);
    assert.equal(node('[data-decision="assessment.research.extracted"]').value,authored.research.accepted[0]);
    assert.deepEqual([...root.querySelectorAll('.rxa-action-order li')].map(li=>li.querySelector('button').dataset.id),sorted);
    assert.equal(root.querySelector('[data-followup-form]'),null);
    await go('calendar');
    assert.equal(JSON.stringify([...root.querySelectorAll('[data-decision]:checked')].map(n=>[n.dataset.decision,n.value])),calendarDraft);
    assert.equal(node('[data-decision="deadline"]').value,currentCase.rubric.deadline);
    await go('decision');
    passed('All authored decision fields, source fragments and action order survive remount');
  }
  node('[data-decision-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();
  stage='reader-closes-on-delayed-decision';
  holdResponseOperation='decide';node('[data-action="confirm-decision"]').click();
  await until(()=>Boolean(releaseResponse),'held decision response');
  assert.equal(root.getAttribute('aria-busy'),'true');
  node('.rxa-mobile-nav [data-page="documents"]').click();node('[data-action="tab"][data-tab="sources"]').click();node('a[data-source-reader]').click();
  await until(()=>document.querySelector('.rx-source-embedded [data-unit]'),'source opens while the decision is pending');
  const readerBeforeDecision=node('.rx-source-embedded');assert.equal(root.dataset.sourceReaderOpen,'true');
  releaseResponse();releaseResponse=null;await settle();
  assert.equal(root.dataset.page,'decision');assert.equal(root.dataset.sourceReaderOpen,undefined,'Decision completion clears the source scroll-lock flag');
  assert.equal(document.querySelector('.rx-source-embedded'),null);assert.equal(readerBeforeDecision.isConnected,false);
  await go('documents');await click('[data-action="tab"][data-tab="documents"]');
  assert.ok(root.querySelector('.rxa-document-list [data-action="document"]'),'Case materials remain reachable after the delayed decision');
  await go('decision');assert.ok(root.querySelector(currentCase.followup?'[data-followup-form]':'.rxa-criteria'),'Decision completion exposes the actual next step');
  passed('A delayed decision closes a source opened during submission, clears its scroll flag and preserves navigation to materials and the next step');
  stage='authored-decision-and-followup';
  assert.equal(lastView.decision.deadline,currentCase.rubric.deadline,'The final request contains the deadline edited on the separate Calendar page');
  if(authored)assert.deepEqual(lastView.decision.assessment.calendar,{anchor:authored.calendar.anchor,rule:authored.calendar.rule,start:authored.calendar.start,shift:authored.calendar.acceptedShifts[0]});
  if(currentCase.followup){
    assert.equal(lastView.status,'followup');assert.equal(lastView.feedback,null);assert.equal(root.querySelector('.rxa-criteria'),null);
    await go('calendar');assert.equal(node('[data-decision="deadline"]').disabled,true);await go('decision');
    assert.equal(root.querySelector('[data-decision-form], [data-chat-form], [data-action="next"]'),null);
    choose(`[data-followup-choice][value="${currentCase.followup.correct}"]`);
    await handle();handle=await mountReceptionAI(root,options,config);await go('decision');
    assert.equal(node('[data-followup-choice]:checked').value,currentCase.followup.correct);
    const callsBeforeFollowup=modelCalls;loseNextFollowup=true;
    node('[data-followup-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();
    await click('[data-action="retry"]');
    const requests=calls.filter(call=>call.op==='followup');assert.equal(requests.at(-1).requestId,requests.at(-2).requestId);
    assert.equal(modelCalls,callsBeforeFollowup);assert.equal(lastView.followupChoiceId,currentCase.followup.correct);
    passed('Follow-up is withheld until decision, restores its selection and retries without regrading or provider calls');
  }
  assert.equal(lastView.status,'review');assert.ok(root.querySelector('.rxa-criteria'));
  await go('calendar');assert.equal(node('[data-decision="deadline"]').disabled,true);await go('decision');
  await go('chat');assert.equal(root.querySelector('[data-chat-form]'),null);await go('decision');
  await click('[data-action="next"]');assert.equal(lastView.status,'complete');assert.equal(lastView.result.journalStatus,'local');
  passed('Explicit confirmation, server feedback, finished-case lock and local-only receipt');
  stage='completed-work-record-and-related-training';
  const completedView=structuredClone(lastView),requestsBeforeReading=calls.length;
  for(const page of ['reception','decision']){
    await go(page);const record=node('[data-work-record]');
    assert.ok(record.textContent.includes(completedView.decision.deadline));
    assert.ok(record.textContent.includes(completedView.messages.find(message=>message.role==='user').text));
    if(currentCase.provenance)assert.ok(completedView.learningReview,'Authored training releases its learning review after completion');
    if(completedView.learningReview)assert.ok(node('[data-learning-contrast]').textContent.includes(completedView.learningReview.difference));
  }
  await go('chat');assert.equal(root.querySelector('[data-chat-form], [data-message-draft]'),null);
  assert.deepEqual([...root.querySelectorAll('.rxa-message[data-message-id]')].map(element=>element.dataset.messageId),completedView.messages.map(message=>message.id));
  await go('documents');await click('[data-tab="documents"]');
  await click(`.rxa-document-list [data-action="document"][data-id="${completedView.openedDocumentIds[0]}"]`);
  assert.ok(node('.rxa-document-body').textContent.trim().length>20);
  assert.equal(lastView.status,'complete');assert.equal(lastView.id,completedView.id);
  await go('calendar');
  assert.equal(node('[data-decision="deadline"]').value,completedView.decision.deadline);
  assert.equal(node('[data-decision="deadline"]').disabled,true);
  assert.ok(root.querySelector('[data-calendar-workbench]'));
  assert.equal([...root.querySelectorAll('[data-decision]')].every(field=>field.disabled),true);
  const fixedDate=node('[data-calendar-action="choose-date"][aria-pressed="true"]').dataset.date;
  await click('[data-calendar-action="step-day"]');
  assert.equal(node('[data-calendar-action="choose-date"][aria-pressed="true"]').dataset.date,fixedDate);
  assert.equal(calls.length,requestsBeforeReading,'Reading the completed transcript, calendar and already opened documents does not mutate the service');
  await go('decision');
  const related=root.querySelector('[data-action="related-training"]'),relatedCaseId=related?.dataset.caseId||null;
  if(completedView.learningReview?.related?.length)assert.ok(related,'Related authored cases remain available in the supplied catalog');
  if(related){
    const startsBefore=calls.filter(call=>call.op==='start').length;
    await click('[data-action="related-training"]');
    assert.equal(root.dataset.page,'reception');assert.equal(node('[name="trainingCaseId"]').value,relatedCaseId);
    assert.equal(node('[name="mode"][value="training"]').checked,true);
    assert.equal(calls.filter(call=>call.op==='start').length,startsBefore,'Choosing a related exercise requires an explicit later start');
  }
  passed('Completed work record and contrast remain visible; chat/documents/calendar stay read-only; a related case is selected without starting it',{learningReview:!!completedView.learningReview,relatedCaseId});
  if(fixture.cases.every(c=>c.public.assessment)){
    stage='partial-decision';
    if(root.querySelector('[data-action="new-session"]'))await click('[data-action="new-session"]');
    await click('[data-action="start"]');await go('decision');
    choose('[data-decision="procedureId"]');
    assert.equal(node('[data-decision="law.number"]').value,'');
    assert.equal(root.querySelector('[data-deadline-summary] time'),null);
    await go('calendar');assert.equal(node('[data-decision="deadline"]').value,'');await go('decision');
    assert.equal(root.querySelector('[data-decision="assessment.factId"]:checked'),null);
    node('[data-decision-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();
    await click('[data-action="confirm-decision"]');assert.equal(lastView.status,'followup');
    assert.equal(lastView.decision.routeId,'');assert.equal(lastView.decision.law.number,'');assert.equal(lastView.decision.deadline,'');
    choose('[data-followup-choice]');node('[data-followup-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.equal(lastView.status,'review');assert.ok(lastView.feedback.score<100);assert.equal(lastView.feedback.evidenceIssue,'selection');
    await click('[data-action="next"]');assert.equal(lastView.status,'complete');
    passed('Unanswered authored fields remain blank and receive the server assessment after confirmation');
  }
  stage='native-independent-entry';
  await handle();localStorage.clear();let legacyDraftReads=0,tokensRequested=0;
  const backend={user:{uid:fixture.identity.uid},getProfile:()=>({studentKey:fixture.identity.studentKey}),isAdmin:()=>false,
    async getReceptionIdToken(){tokensRequested++;return 'fixture-token';},async loadDraft(){legacyDraftReads++;throw Error('No legacy draft read');}};
  const nativeFetch=async(url,request)=>{assert.equal(request.headers.Authorization,'Bearer fixture-token');return fetchAPI(url,request);};
  const {mountReception}=await import(pathToFileURL(path.join(site,'apps/reception/ai/entry.js')));
  handle=await mountReception(root,{backend,locale:'ru',context:'course',assessmentAllowed:true,fetch:nativeFetch},{endpoint:'/api/reception',enabled:true});await settle();
  choose('[name="mode"][value="independent"]');await settle();await click('[data-action="start"]');
  assert.equal(lastView.mode,'independent');assert.equal(lastView.caseCount,8);assert.equal(lastView.status,'active');
  assert.equal(legacyDraftReads,0);assert.ok(tokensRequested>=3);
  passed('Native authenticated entry starts the selected eight-case independent shift without touching the legacy engine');
  stage='identity-boundary';
  await handle();
  const secondIdentity={uid:'different-learner',studentKey:'different-learner'};
  const secondFetch=async(_url,request)=>{const response=await fixture.service.handle(JSON.parse(request.body),secondIdentity);return {ok:true,status:200,json:async()=>response};};
  handle=await mountReceptionAI(root,{...options,studentKey:secondIdentity.studentKey,fetch:secondFetch},config);await settle();
  assert.equal(root.querySelector('[data-action="continue"]'),null);assert.equal(root.querySelector('[data-message-draft]'),null);
  passed('A different student never receives the saved shift');
  assert.deepEqual(errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure={stage,message:error.message,stack:error.stack};}
finally{releaseProvider?.();releaseResponse?.();await handle?.();dom.window.close();await mkdir(out,{recursive:true});await writeFile(path.join(out,'dom-report.json'),JSON.stringify({...report,apiOperations:calls.map(call=>call.op),providerCalls:modelCalls},null,2));}
console.log(JSON.stringify({status:report.status,checks:report.checks.length,failure:report.failure,report:path.join(out,'dom-report.json')}));
if(report.status!=='passed')process.exitCode=1;
