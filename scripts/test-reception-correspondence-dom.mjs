#!/usr/bin/env node
/** Real frontend + real service integration without a browser process.
 * DOM state is checked; layout, physical devices and live AI quality are not inferred. */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createMemoryStore} from '../firebase/functions/reception-ai/store.mjs';
import {ReceptionError} from '../firebase/functions/reception-ai/schema.mjs';
import {createCorrespondenceQACase,correspondenceQAProfiles,explicitQAReview} from './reception-correspondence-qa-cases.mjs';
import {createScriptedCorrespondenceReviewer} from './reception-correspondence-test-reviewer.mjs';
import {ROUTING_RECIPIENTS} from '../firebase/functions/reception-ai/routing-cases.mjs';
import {correspondencePrintHTML} from '../site/apps/reception/ai/response-editor.js';
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const gameplayContext=arg('--context','');
if(gameplayContext&&!['seminar'].includes(gameplayContext))throw Error('Use --context seminar or omit --context for the legacy-compatible fixture.');
const seminar=gameplayContext==='seminar';
const out=path.resolve(arg('--out',path.join(os.tmpdir(),'reception-correspondence-dom')));
const rootDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(rootDir,'site');
const jsdomPath=arg('--jsdom',process.env.RECEPTION_JSDOM_MODULE);
const {JSDOM,VirtualConsole}=await import(jsdomPath?pathToFileURL(path.resolve(jsdomPath)).href:'jsdom');
const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
const dom=new JSDOM('<!doctype html><html lang="ru"><head></head><body><main id="receptionAI"></main></body></html>',{url:'http://127.0.0.1:8795/__qa/reception.html',pretendToBeVisual:true,virtualConsole});
for(const key of ['window','document','location','localStorage','CustomEvent','Event','MouseEvent','KeyboardEvent','HTMLElement','HTMLDialogElement','AbortController','AbortSignal','Node','NodeFilter','DOMParser','DOMException','MutationObserver'])globalThis[key]=dom.window[key];
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.innerHeight=844;
globalThis.matchMedia=dom.window.matchMedia=query=>({matches:query.includes('max-width'),addEventListener(){},removeEventListener(){}});
globalThis.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,char=>'\\'+char)};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.scrollTo=function(){};
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
dom.window.HTMLMediaElement.prototype.canPlayType=function(){return 'probably';};dom.window.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
dom.window.HTMLMediaElement.prototype.pause=function(){};dom.window.HTMLMediaElement.prototype.load=function(){};
const append=document.head.append.bind(document.head);document.head.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='LINK'){Object.defineProperty(node,'sheet',{get:()=>({cssRules:[]})});queueMicrotask(()=>node.dispatchEvent(new Event('load')));};};
globalThis.fetch=async input=>{const url=new URL(input,location.href),file=path.resolve(url.protocol==='file:'?fileURLToPath(url):path.join(site,url.pathname));
  if(!file.startsWith(site+path.sep))throw Error('External resource blocked in local DOM fixture');
  try{return new Response(await readFile(file),{status:200});}catch{return new Response('',{status:404});}};
const c=await createCorrespondenceQACase(),store=createMemoryStore(),identity={uid:'qa-correspondence',studentKey:'12345678'};
const reviewer=createScriptedCorrespondenceReviewer({reviews:[()=>{throw new ReceptionError('review_unavailable',503);},context=>explicitQAReview(context,{initialLevel:3}),context=>explicitQAReview(context,{controlLevel:3})]});
const provider={...reviewer,name:'mock',generate:async()=>({reply:'Представленные документы относятся к двум вопросам обращения.',revealedFactIds:[],releasedDocumentIds:[],usage:{inputTokens:0,outputTokens:0}})};
const service=createReceptionService({store,cases:[c],provider,correspondenceProfiles:correspondenceQAProfiles,requireGameplay:seminar});
const calls=[];let lastView,lastError,handle,dropReplyTo='',awaitActor=null;
const fetchAPI=async(_url,options)=>{const body=JSON.parse(options.body);calls.push(structuredClone(body));
  if(body.op==='message'&&awaitActor)await awaitActor;
  let response;
  try{response=await service.handle(body,identity);if(response.view)lastView=response.view;}
  catch(error){lastError=error.code;return {ok:false,status:error.status||500,json:async()=>({ok:false,error:{code:error.code||'qa-error'}})};}
  if(dropReplyTo===body.op){dropReplyTo='';throw Error('Simulated connection loss after commit');}
  return {ok:true,status:200,json:async()=>response};
};
const root=document.getElementById('receptionAI'),{mountReceptionAI}=await import('../site/apps/reception/ai/app.js');
const options={locale:'ru',studentKey:identity.studentKey,fetch:fetchAPI,context:gameplayContext||'course',period:'qa',showLanguageSelector:true};
const config={endpoint:'/api/reception',demo:true,workbookVersion:2,decisionVersion:'correspondence-v1',...(gameplayContext?{gameplayContext}:{})};
const report={suite:'correspondence-functional-dom',context:gameplayContext||null,status:'running',checks:[],errors,limitations:['DOM integration only; no rendered layout, physical device or live model assessment.']};
const passed=name=>report.checks.push({name,status:'passed'});
const node=selector=>{const element=root.querySelector(selector);assert.ok(element,`Missing ${selector}; error ${lastError||''}`);return element;};
async function settle(){await handle?.flush?.();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(root.getAttribute('aria-busy'),'false');}
async function click(selector){node(selector).click();await settle();}
function input(selector,value){const element=node(selector);element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));}
async function select(selector,value){const element=node(selector);element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));await settle();}
function check(selector){const element=node(selector);element.checked=true;element.dispatchEvent(new Event('change',{bubbles:true}));}
async function submit(selector){node(selector).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();}
async function go(page){await click(`#rxaPage-${page}`);assert.equal(root.dataset.page,page);}
async function until(condition,label){const begin=Date.now();while(Date.now()-begin<7000){if(condition())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Timed out: '+label);}
let stage='mount';
try{
  await mkdir(out,{recursive:true});handle=await mountReceptionAI(root,options,config);await settle();
  if(seminar)assert.equal(root.querySelector('[name="trainingCaseId"]'),null,'Seminar setup lets the server assign the case');
  else{assert.equal(node('[name="trainingCaseId"]').options.length,2);await select('[name="trainingCaseId"]',c.id);}
  await click('[data-action="start"]');
  assert.equal(lastView.decisionVersion,'correspondence-v1');assert.equal(lastView.case.assessment,undefined);passed('New session selects the letter contract and removes the old answer menu');
  if(seminar){
    assert.equal(lastView.context,'seminar');
    const started=calls.find(call=>call.op==='start');assert.equal(started.context,'seminar');assert.equal(started.caseId,undefined);
    assert.deepEqual(lastView.documents.map(doc=>doc.id).sort(),c.documents.map(doc=>doc.id).sort());
    assert.ok(lastView.case.normativeActs.some(act=>act.id==='reception-law59999'));assert.equal(lastView.case.sources,undefined);
    passed('Seminar context reaches the real service, assigns the case and exposes the native statutory source collection');
  }
  stage='sources';
  await go('chat');
  let releaseActor;
  awaitActor=new Promise(resolve=>{releaseActor=resolve;});
  input('[data-message-draft]','Подскажите, пожалуйста, когда вы впервые сообщили о проблеме?');
  node('[data-chat-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(node('[data-message-draft]').value,'');
  node('#rxaPage-documents').click();
  node('[data-action="document"][data-id="d1"]').click();
  assert.ok(node('.rxa-document-body').textContent.trim());
  assert.equal(node('[data-response-action="use-source"][data-source-key="document:d1"]').disabled,true);
  assert.equal(calls.filter(call=>call.op==='document').length,0);
  releaseActor();await settle();
  assert.equal(root.dataset.page,'documents');
  assert.equal(node('[data-response-action="use-source"][data-source-key="document:d1"]').disabled,false);
  assert.equal(calls.filter(call=>call.op==='document').length,1);
  passed('The composer clears immediately and an opened material can be read while the reply is pending, then recorded and used');
  for(const id of ['d1','d2']){await go('documents');if(root.querySelector('[data-action="documents-list"]'))await click('[data-action="documents-list"]');await click(`[data-action="document"][data-id="${id}"]`);await click(`[data-response-action="use-source"][data-source-key="document:${id}"]`);}
  assert.equal(root.querySelectorAll('[data-response-section="facts"] .rxc-citation').length,2);passed('Opened documents attach to the facts section without authored answer choices');
  await go('chat');await click(`[data-response-action="use-source"][data-source-key="dialogue:opening-${c.id}"]`);
  assert.equal(root.querySelectorAll('[data-response-section="facts"] .rxc-citation').length,3);passed('An actual assistant message can be used as an attributed source');
  await go('documents');if(root.querySelector('[data-action="documents-list"]'))await click('[data-action="documents-list"]');
  await click(seminar?'button[data-normative-doc="reception-law59999"]':'a[data-source-reader][href*="LAW_59999/"]');
  await until(()=>root.querySelector('.ll-paper [data-unit]'),'reader opens');
  const paragraph=[...root.querySelectorAll('.ll-paper [data-unit]')].find(element=>element.textContent.includes('Запрещается направлять жалобу'));
  assert.ok(paragraph,'Actual statutory paragraph exists');paragraph.click();await settle();await click('[data-source-reference-use]');
  assert.equal(root.dataset.page,'decision');assert.equal(root.querySelectorAll('[data-response-section="legalBasis"] .rxc-citation').length,1);passed('A selection in the existing full-text legal reader enters the submitted citation contract');
  stage='write';
  const prose={facts:'В обращении поставлены два самостоятельных вопроса: восстановление дорожки и проверка достоверности ответа И-7. Материалы подтверждают отсутствие ремонта на указанную дату. Причины и ответственность требуют проверки.',
    legalBasis:'Жалобу нельзя направлять для окончательного рассмотрения исполнителю, действия которого обжалуются. Это следует из части 6 статьи 8 Федерального закона № 59-ФЗ. Пояснения исполнителя могут быть запрошены как материал независимой проверки.',
    resolution:'Просьбу о восстановлении дорожки и жалобу следует рассмотреть раздельно. Необходимо запросить документы о выполненных работах и пояснения И-7; жалобу разрешает независимый компетентный адресат.',
    nextSteps:'Заявительнице необходимо сообщить результаты рассмотрения каждого вопроса. Выполнение ремонта следует проверить по подтверждающим материалам, сохранив отдельный контроль по жалобе.'};
  input('[data-response-field="subject"]','О восстановлении дорожки и проверке прежнего ответа');for(const [key,value]of Object.entries(prose))input(`[data-response-field="sections.${key}"]`,value);
  await click('[data-response-action="add-order"]');input('[data-response-order-field="issue"]','Проверка прежнего ответа');input('[data-response-order-field="instruction"]','Запросить материалы и подготовить независимое заключение по доводам жалобы.');input('[data-response-order-field="dueDate"]','2026-11-19');input('[data-response-order-field="expectedResult"]','Мотивированное заключение с подтверждающими материалами.');
  await select('[data-response-order-field="kind"]','review');await click('[data-response-action="choose-recipient"]');await select('[data-routing-territory]','');
  const recipient=ROUTING_RECIPIENTS[c.id][0][0];
  const authority=(await import('../site/apps/reception/ai/authority-directory.js')).RECEPTION_AUTHORITIES.find(row=>row.id===recipient);input('[data-routing-search]',authority.name);await settle();check(`[data-routing-recipient][value="${recipient}"]`);await settle();await click('[data-response-action="recipient-done"]');
  await click('[data-response-action="preview"]');assert.ok(node('.rxc-letter-body').textContent.includes(prose.resolution));assert.ok(node('.rxc-letter-order').textContent.includes(authority.name));
  passed('An assignment has its own recipient, deadline and evidence of completion; preview contains the student text');
  await handle();handle=await mountReceptionAI(root,options,config);await settle();await go('decision');assert.ok(node('.rxc-letter-body').textContent.includes(prose.facts));assert.ok(node('.rxc-letter-order').textContent.includes('Мотивированное заключение'));passed('Unmount and resume preserve prose, sources, assignments and preview');
  stage='review-failure';await submit('[data-decision-form]');await click('[data-action="confirm-decision"]');
  assert.equal(lastError,'review_unavailable');assert.equal(lastView.status,'active');assert.ok(node('[data-action="retry"]'));const first=calls.find(call=>call.op==='decide');
  const failed=await store.get('sessions/'+lastView.id);assert.equal(failed.caseStates[0].correspondenceInitialFeedback,undefined);assert.ok(failed.caseStates[0].correspondenceDraft);passed('An unavailable reviewer keeps the work and records no fabricated grade');
  await handle();handle=await mountReceptionAI(root,options,config);await settle();await click('[data-action="retry"]');
  assert.equal(lastView.status,'followup');assert.equal(calls.filter(call=>call.op==='decide').at(-1).requestId,first.requestId);assert.equal(root.querySelectorAll('[data-followup-choice]').length,0);
  const initial=(await store.get('sessions/'+lastView.id)).caseStates[0].correspondenceInitialFeedback;passed('Retry after resume uses the retained idempotency key and opens the free control stage');
  assert.equal(document.activeElement.hasAttribute('data-stage-heading'),true);
  const savedLetter=structuredClone(lastView.decision.correspondence);
  await writeFile(path.join(out,'example-letter.html'),correspondencePrintHTML({draft:savedLetter,caseInfo:lastView.case,profile:lastView.case.correspondence,sources:lastView.correspondenceSources,recipients:[{id:recipient,label:authority.name}],locale:'ru'}));
  stage='control';input('[data-response-control-field="text"]','Дорожка восстановлена; этот результат фиксируется отдельно. Итогового решения по жалобе нет. Жалобу необходимо оставить на контроле и запросить самостоятельное заключение.');
  await select('[data-response-status-field][data-issue-id="repair"]','resolved');await select('[data-response-status-field][data-issue-id="complaint"]','pending');
  check('[data-response-status-evidence="followup"][data-issue-id="repair"]');check('[data-response-status-evidence="followup"][data-issue-id="complaint"]');
  dropReplyTo='followup';
  await submit('[data-followup-form]');
  assert.equal(root.dataset.sessionStatus,'followup');assert.equal(lastView.status,'review');
  assert.ok(node('[data-followup-form] [role="alert"]'));
  const reviewCalls=reviewer.reviewCalls;
  await click('[data-action="retry"]');
  assert.equal(calls.at(-1).op,'resume');assert.equal(calls.filter(call=>call.op==='followup').length,1);
  assert.equal(reviewer.reviewCalls,reviewCalls);assert.equal(root.dataset.sessionStatus,'review');
  assert.equal(document.activeElement.hasAttribute('data-stage-heading'),true);
  passed('A lost control response is reconciled before retry and the reviewer is called once');
  assert.equal(lastView.status,'review');assert.equal(lastView.feedback.correspondence.initialScore,initial.score);
  assert.equal(lastView.feedback.correspondence.control.phase,'control');assert.deepEqual(lastView.decision.correspondence,savedLetter);passed('The control assessment preserves the initial letter and initial score');
  dropReplyTo='next';
  await click('[data-action="next"]');
  assert.equal(lastView.status,'complete');assert.equal(root.dataset.sessionStatus,'review');
  await click('[data-action="retry"]');assert.equal(calls.at(-1).op,'resume');
  assert.equal(calls.filter(call=>call.op==='next').length,1);
  assert.equal(document.activeElement.hasAttribute('data-stage-heading'),true);
  passed('A lost finish response restores final result without repeating the finishing action');
  assert.equal(lastView.status,'complete');assert.ok(lastView.result.cases[0].caseInfo.citizen.name);assert.equal(root.querySelectorAll('[data-response-result="0"] [data-response-action="download"]').length,1);passed('The completed case retains its own document, citizen and export controls');
  stage='locales';for(const locale of ['en','zh','ru']){await select('[data-language]',locale);assert.equal(root.lang,locale);assert.ok(node('.rxc-letter-body').textContent.includes(prose.facts));}passed('Locale changes preserve the authored document and assessment');
  if(!seminar){
  stage='legacy-resume';
  await handle();handle=await mountReceptionAI(root,options,{...config,decisionVersion:'legacy'});await settle();
  await click('[data-action="new-session"]');await click('[data-action="start"]');await go('decision');
  assert.equal(lastView.decisionVersion,undefined);assert.equal(root.querySelector('[data-correspondence-editor]'),null);
  input('[data-decision="reasoning"]','Сохранённый черновик прежнего формата.');
  const legacyId=lastView.id;
  await handle();handle=await mountReceptionAI(root,options,config);await settle();await go('decision');
  assert.equal(lastView.id,legacyId);assert.equal(lastView.decisionVersion,undefined);
  assert.equal(node('[data-decision="reasoning"]').value,'Сохранённый черновик прежнего формата.');
  assert.equal(calls.filter(call=>call.op==='resume').at(-1).decisionVersion,undefined);
  passed('Existing sessions resume under the original assessment contract after the new client is enabled');
  }
  assert.deepEqual(errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failedStage=stage;report.failure=String(error);process.exitCode=1;}
finally{await handle?.();report.apiOperations=calls.map(call=>call.op);report.reviewCalls=reviewer.reviewCalls;await mkdir(out,{recursive:true});await writeFile(path.join(out,'dom-report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(out,'last-dom.html'),dom.serialize());dom.window.close();console.log(JSON.stringify(report,null,2));}
