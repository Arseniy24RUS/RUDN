#!/usr/bin/env node
/** Functional DOM integration, not a browser rendering or model-quality test.
 * node scripts/test-reception-ai-dom.mjs --cases /path/private-data/cases --jsdom /path/node_modules/jsdom/lib/api.js
 * No Firebase or OpenAI requests are made. jsdom is an optional QA dependency.
 */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createMemoryStore} from '../firebase/functions/reception-ai/store.mjs';
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const dir=arg('--cases'),modulePath=arg('--jsdom')||process.env.RECEPTION_JSDOM_MODULE;
if(!dir||!modulePath)throw Error('Provide --cases /path/private-data/cases and --jsdom /path/node_modules/jsdom/lib/api.js');
const {JSDOM}=await import(pathToFileURL(path.resolve(modulePath)));
const cases=await Promise.all((await readdir(dir)).filter(f=>f.endsWith('.json')).map(f=>readFile(path.join(dir,f),'utf8').then(JSON.parse)));
const dom=new JSDOM('<!doctype html><html lang="ru"><head></head><body><main id="app"></main></body></html>',{url:'http://127.0.0.1:8787/apps/reception/ai-demo.html',pretendToBeVisual:true});
for(const key of ['window','document','location','localStorage','CustomEvent','Event','MouseEvent','KeyboardEvent','HTMLElement','AbortController','AbortSignal'])globalThis[key]=dom.window[key];
globalThis.matchMedia=dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
// jsdom has no decoder. These stubs exercise element lifecycle, not playback.
dom.window.HTMLMediaElement.prototype.canPlayType=function(){return 'probably';};
dom.window.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
dom.window.HTMLMediaElement.prototype.pause=function(){};
dom.window.HTMLMediaElement.prototype.load=function(){};
const root=document.getElementById('app'),identity={uid:'dom-qa',studentKey:'dom-qa'},store=createMemoryStore();
let modelCalls=0,lastView,lastAPIError,loseNextReply=false,loseNextFollowup=false,failProvider=false,lastMessageRequests=[],followupRequests=[],holdProvider=false,releaseProvider;
const provider={name:'mock',async generate({actorCase}){
  modelCalls++;
  if(holdProvider){holdProvider=false;await new Promise(resolve=>{releaseProvider=resolve;});}
  if(failProvider){failProvider=false;throw Error('Simulated provider outage');}
  return {reply:'Вот документы по моему обращению. <img src=x onerror="alert(1)">',revealedFactIds:[],releasedDocumentIds:actorCase.documents.map(d=>d.id),usage:{inputTokens:0,outputTokens:0}};
}};
const service=createReceptionService({store,cases,provider});
const fetcher=async(_url,options)=>{
  const body=JSON.parse(options.body);if(body.op==='message')lastMessageRequests.push(body);if(body.op==='followup')followupRequests.push(body);
  try{
    const result=await service.handle(body,identity);lastView=result.view;
    if(body.op==='message'&&loseNextReply){loseNextReply=false;throw new TypeError('Simulated lost response');}
    if(body.op==='followup'&&loseNextFollowup){loseNextFollowup=false;throw new TypeError('Simulated lost follow-up response');}
    return {ok:true,status:200,json:async()=>result};
  }catch(error){
    lastAPIError={code:error.code,message:error.message};
    if(error instanceof TypeError)throw error;
    return {ok:false,status:error.status||503,json:async()=>({ok:false,error:{code:error.code||'unavailable'}})};
  }
};
const {mountReceptionAI}=await import('../site/apps/reception/ai/app.js');
const config={endpoint:'/api/reception',demo:true};
const mountOptions={locale:'ru',studentKey:identity.studentKey,fetch:fetcher,context:'free',assessmentAllowed:false};
let handle=await mountReceptionAI(root,mountOptions,config);
async function settle(){await handle.flush();assert.equal(root.getAttribute('aria-busy'),'false');}
async function click(selector){const node=root.querySelector(selector);assert.ok(node,selector);node.click();await settle();}
function input(selector,value){const node=root.querySelector(selector);assert.ok(node,selector);node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));}
function choose(selector){const node=root.querySelector(selector);assert.ok(node,selector);node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));}
function select(selector,value){const node=root.querySelector(selector);assert.ok(node,selector);node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));}
async function chat(value){input('[data-message-draft]',value);root.querySelector('[data-chat-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();}
const technicalCopy=/\b(?:GPT(?:[-‑\s]?6)?|OpenAI|mock|LLM|AI|API)\b|искусственн\w*\s+интеллект|демонстрационн\w*\s+(?:ответ|режим|провайдер)|\bИИ\b|人工智能/iu;
function immersiveCopy(){assert.doesNotMatch(root.textContent,technicalCopy);assert.equal(root.querySelector('[data-mode], [data-action="legacy"], [data-rxa-entry]'),null);assert.equal(root.querySelector('.rxa-demo'),null);}
const completed=[];
try{
  immersiveCopy();await click('[data-action="start"]');assert.ok(root.querySelector('[data-chat-form]'),JSON.stringify({lastAPIError,text:root.textContent.slice(0,600)}));assert.equal(lastView.status,'active');assert.equal(lastView.mode,'training');immersiveCopy();
  const openingId=lastView.messages[0].id,actorVideo=root.querySelector('video[data-rxa-motion]');assert.ok(actorVideo,'Animated citizen element');
  holdProvider=true;input('[data-message-draft]','Покажите, пожалуйста, документы.');
  root.querySelector('[data-chat-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  for(let i=0;i<50&&!releaseProvider;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(releaseProvider,'Provider request is awaiting a response');
  assert.ok(root.querySelector('[data-pending-message]'));assert.ok(root.querySelector('[data-typing]'));
  assert.ok(root.querySelector('[data-pending-message] [data-delivery-state="pending"]'));
  assert.equal(root.querySelector('[data-pending-message] [data-delivery-state="sent"]'),null);
  assert.equal(root.querySelector('video[data-rxa-motion]'),actorVideo,'Conversation rerender retains the same video node');
  releaseProvider();await settle();assert.equal(root.querySelectorAll('.rxa-message[data-message-id]').length,3);
  assert.equal(root.querySelector('[data-pending-message]'),null);assert.equal(root.querySelector('[data-typing]'),null);
  assert.equal(root.querySelector(`[data-message-id="${openingId}"]`).classList.contains('rxa-message-enter'),false);
  assert.ok(root.querySelectorAll('.rxa-message-enter[data-message-id]').length>0,'New server messages animate');
  assert.ok(root.querySelector('[data-delivery-state="sent"]'));assert.ok(root.querySelector('.rxa-message time[datetime]'));
  assert.ok(root.querySelector('.rxa-messages').textContent.includes('<img src=x'));assert.equal(root.querySelector('.rxa-messages img[src="x"]'),null);
  assert.ok(lastView.documents.length>0);completed.push('messenger pending/sent states, typing, timestamps, new-message animation, stable animated portrait and escaped content');
  await click('.rxa-document-list [data-action="document"]');assert.ok(root.querySelector('.rxa-document-body'));assert.equal(lastView.openedDocumentIds.length,1);
  assert.equal(root.querySelector('.rxa-message-enter[data-message-id]'),null,'Opening a document does not replay conversation animations');
  await click('[data-tab="sources"]');assert.ok(root.querySelector('.rxa-source a[href^="https:"]'));
  await click('[data-tab="decision"]');input('[data-decision="reasoning"]','Черновик после изучения материалов.');
  input('[data-message-draft]','Уточню дату после чтения закона.');
  const procedure=root.querySelector('[data-decision="procedureId"]').value;choose('[data-decision="procedureId"]');
  const transcript=Array.from(root.querySelectorAll('.rxa-message[data-message-id]')).map(node=>[node.dataset.messageId,node.textContent]);
  for(const panel of ['documents','sources','decision']){
    await click(`.rxa-mobile-nav [data-action="workspace"][data-panel="${panel}"]`);
    assert.equal(root.dataset.mobilePane,'desk');assert.equal(root.querySelector(`#rxaTab-${panel}`).getAttribute('aria-selected'),'true');
    assert.equal(root.querySelector(`.rxa-mobile-nav [data-panel="${panel}"]`).getAttribute('aria-current'),'page');
    assert.deepEqual(Array.from(root.querySelectorAll('.rxa-message[data-message-id]')).map(node=>[node.dataset.messageId,node.textContent]),transcript);
    assert.equal(root.querySelector('[data-message-draft]').value,'Уточню дату после чтения закона.');
    assert.equal(root.querySelector('.rxa-message-enter[data-message-id]'),null);
  }
  assert.equal(root.querySelector('[data-decision="reasoning"]').value,'Черновик после изучения материалов.');
  await click('.rxa-mobile-nav [data-action="chat"]');assert.equal(root.dataset.mobilePane,'chat');
  assert.equal(document.activeElement,root.querySelector('[data-message-draft]'));
  await click('.rxa-mobile-nav [data-action="workspace"][data-panel="decision"]');assert.equal(root.dataset.mobilePane,'desk');
  assert.equal(root.querySelector('[data-decision="reasoning"]').value,'Черновик после изучения материалов.');
  completed.push('phone pane navigation preserves message draft, decision draft and transcript without replaying messages');
  const sessionId=lastView.id;await handle();
  handle=await mountReceptionAI(root,mountOptions,config);
  assert.equal(lastView.id,sessionId);assert.equal(root.querySelector('[data-decision="reasoning"]').value,'Черновик после изучения материалов.');
  assert.equal(root.querySelector('[data-message-draft]').value,'Уточню дату после чтения закона.');
  assert.equal(root.querySelector('[data-decision="procedureId"]:checked').value,procedure);
  assert.equal(root.dataset.mobilePane,'desk','The selected phone pane is restored with the session');
  assert.equal(root.querySelectorAll('.rxa-message[data-message-id]').length,3);assert.equal(root.querySelector('.rxa-message-enter[data-message-id]'),null);completed.push('document open, source link, draft and transcript restore without replaying animations');
  for(const locale of ['en','zh','ru']){await handle.refreshLocale(locale);await settle();assert.equal(root.lang,locale);assert.equal(root.querySelector('[data-decision="reasoning"]').value,'Черновик после изучения материалов.');assert.ok(root.querySelector('[data-chat-form]'));immersiveCopy();assert.equal(root.querySelector('.rxa-message-enter[data-message-id]'),null);}
  completed.push('RU/EN/ZH immersion, no implementation labels or mode selector, preserved draft');
  const beforeCalls=modelCalls;loseNextReply=true;await chat('Повторите, пожалуйста.');
  assert.ok(root.querySelector('[data-action="retry"]'));assert.equal(root.querySelector('[data-message-draft]').value,'Повторите, пожалуйста.');
  await click('[data-action="retry"]');assert.equal(modelCalls,beforeCalls+1);assert.equal(lastMessageRequests.at(-1).requestId,lastMessageRequests.at(-2).requestId);assert.equal(root.querySelector('[data-message-draft]').value,'');
  completed.push('lost response retries the same request without another provider call');
  failProvider=true;await chat('Проверьте, пожалуйста, ещё раз.');assert.ok(root.querySelector('[data-action="refresh"]'));
  const failedId=lastMessageRequests.at(-1).requestId;await click('[data-action="refresh"]');await chat('Проверьте, пожалуйста, ещё раз.');
  assert.notEqual(lastMessageRequests.at(-1).requestId,failedId);assert.equal(root.querySelector('[data-message-draft]').value,'');completed.push('definitive provider failure preserves text and allows explicit new send after resume');
  const template=cases.find(c=>c.id===lastView.case.id);
  const currentCase=[template,...(template.dateVariants||[])].find(c=>c.public.date===lastView.case.date)||template;
  await click('[data-tab="documents"]');for(const doc of lastView.documents)await click(`.rxa-document-list [data-action="document"][data-id="${doc.id}"]`);
  await click('[data-tab="decision"]');
  choose(`[data-decision="procedureId"][value="${currentCase.rubric.procedureIds[0]}"]`);choose(`[data-decision="routeId"][value="${currentCase.rubric.routeIds[0]}"]`);
  const authored=currentCase.rubric.authored;
  const plan=authored?.decisionPlans.find(p=>p.routes.includes(currentCase.rubric.routeIds[0]));
  const required=plan?.requiredActions||currentCase.rubric.requiredActionIds;
  for(const id of required)choose(`[data-decision="actionIds"][value="${id}"]`);
  for(const id of authored?authored.evidenceSets[0]:currentCase.rubric.evidenceGroups.map(ids=>ids[0]))choose(`[data-decision="basisDocumentIds"][value="${id}"]`);
  input('[data-decision="law.number"]',currentCase.rubric.legal.number);input('[data-decision="law.article"]',currentCase.rubric.legal.articles[0]);input('[data-decision="deadline"]',currentCase.rubric.deadline);
  if(authored){
    assert.equal(root.querySelectorAll('.rxa-assessment-block').length,7);
    const order=plan?.order||authored.order,remaining=new Set(required),sorted=[];
    while(remaining.size){const free=[...remaining].filter(id=>!order.some(([before,after])=>after===id&&remaining.has(before)));assert.ok(free.length,'Authored action order is acyclic');for(const id of free){sorted.push(id);remaining.delete(id);}}
    const first=required[0];if(required.length>1){await click(`[data-action="move-action"][data-id="${first}"][data-direction="down"]`);assert.equal(root.querySelector('.rxa-action-order li:nth-child(2) button').dataset.id,first);}
    for(const id of [...sorted].reverse())while(root.querySelector('.rxa-action-order li:first-child button')?.dataset.id!==id)await click(`[data-action="move-action"][data-id="${id}"][data-direction="up"]`);
    assert.deepEqual([...root.querySelectorAll('.rxa-action-order li')].map(li=>li.querySelector('button').dataset.id),sorted);
    choose(`[data-decision="assessment.factId"][value="${authored.factIds[0]}"]`);
    choose(`[data-decision="assessment.applicationId"][value="${authored.knowledge.correct}"]`);
    choose(`[data-decision="assessment.trapId"][value="${authored.trap}"]`);
    input('[data-decision="assessment.actDate"]',authored.knowledge.actDate);
    for(const [key,value]of Object.entries({anchor:authored.calendar.anchor,rule:authored.calendar.rule,start:authored.calendar.start,shift:authored.calendar.acceptedShifts[0]}))choose(`[data-decision="assessment.calendar.${key}"][value="${value}"]`);
    const binding=authored.research.bindings[0];
    await click('[data-tab="sources"]');
    assert.ok(root.querySelector('.rxa-source-fragment'),'Source excerpts are readable');
    await click(`[data-action="research-fragment"][data-record="${binding.recordId}"][data-fragment="${binding.fragmentId}"]`);
    assert.equal(root.querySelector('[data-decision="assessment.research.recordId"]').value,binding.recordId);
    assert.equal(root.querySelector('[data-decision="assessment.research.fragmentId"]').value,binding.fragmentId);
    assert.ok(root.querySelector('.rxa-selected-fragment').textContent.trim());
    input('[data-decision="assessment.research.extracted"]',authored.research.accepted[0]);
    choose(`[data-decision="assessment.research.finding"][value="${authored.research.finding}"]`);
    const beforeDraft=JSON.stringify([...root.querySelectorAll('[data-decision]:checked')].map(n=>[n.dataset.decision,n.value]));
    await handle();handle=await mountReceptionAI(root,mountOptions,config);
    assert.equal(JSON.stringify([...root.querySelectorAll('[data-decision]:checked')].map(n=>[n.dataset.decision,n.value])),beforeDraft);
    assert.equal(root.querySelector('[data-decision="assessment.research.extracted"]').value,authored.research.accepted[0]);
    assert.deepEqual([...root.querySelectorAll('.rxa-action-order li')].map(li=>li.querySelector('button').dataset.id),sorted);
    assert.equal(root.querySelector('[data-followup-form]'),null,'Follow-up is not disclosed before initial decision');
    completed.push('full-bank assessment: source fragments, all authored decision fields, ordered actions and nested draft restore');
  }
  root.querySelector('[data-decision-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.ok(root.querySelector('[data-action="confirm-decision"]'));await click('[data-action="confirm-decision"]');
  if(currentCase.followup){
    assert.equal(lastView.status,'followup');assert.equal(lastView.feedback,null);assert.equal(root.querySelector('.rxa-criteria'),null);
    assert.equal(root.querySelector('[data-chat-form]'),null);assert.equal(root.querySelector('[data-decision-form]'),null);assert.equal(root.querySelector('[data-action="next"]'),null);
    choose(`[data-followup-choice][value="${currentCase.followup.correct}"]`);
    await handle();handle=await mountReceptionAI(root,mountOptions,config);
    assert.equal(lastView.status,'followup');assert.equal(root.querySelector('[data-followup-choice]:checked').value,currentCase.followup.correct);
    const callsBeforeFollowup=modelCalls;loseNextFollowup=true;
    root.querySelector('[data-followup-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.ok(root.querySelector('[data-action="retry"]'));await click('[data-action="retry"]');
    assert.equal(followupRequests.at(-1).requestId,followupRequests.at(-2).requestId);assert.equal(modelCalls,callsBeforeFollowup);
    assert.equal(lastView.followupChoiceId,currentCase.followup.correct);
    completed.push('follow-up starts after the main decision, freezes chat and decision, restores selection and retries idempotently before feedback');
  }
  assert.equal(lastView.status,'review');assert.ok(root.querySelector('.rxa-criteria'));assert.equal(root.querySelector('[data-chat-form]'),null);
  await click('[data-action="next"]');assert.equal(lastView.status,'complete');assert.equal(lastView.result.journalStatus,'local');assert.ok(root.querySelector('.rxa-complete'));
  immersiveCopy();
  completed.push('decision confirmation, server feedback, immutable finished case, local receipt');
  if(cases.every(c=>c.public.assessment)){
    await click('[data-action="new-session"]');await click('[data-action="start"]');await click('[data-tab="decision"]');
    choose('[data-decision="procedureId"]');
    assert.equal(root.querySelector('[data-decision="law.number"]').value,'');
    assert.equal(root.querySelector('[data-decision="deadline"]').value,'');
    assert.equal(root.querySelector('[data-decision="assessment.factId"]:checked'),null);
    root.querySelector('[data-decision-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.ok(root.querySelector('[data-action="confirm-decision"]'),'A partial authored decision can reach final confirmation');
    await click('[data-action="confirm-decision"]');
    assert.equal(lastView.status,'followup');assert.equal(lastView.decision.routeId,'');assert.equal(lastView.decision.law.number,'');assert.equal(lastView.decision.deadline,'');assert.equal(lastView.decision.assessment.factId,'');
    choose('[data-followup-choice]');root.querySelector('[data-followup-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.equal(lastView.status,'review');assert.ok(lastView.feedback.score<100);
    assert.equal(lastView.feedback.evidenceIssue,'selection');
    assert.match(root.textContent,/Баллы за документы сняты/);
    await click('[data-action="next"]');assert.equal(lastView.status,'complete');
    completed.push('partial full-bank decisions preserve unanswered fields and reach server grading after explicit confirmation');
  }
  await handle();
  let legacyDraftReads=0,tokensRequested=0;
  const backend={user:{uid:identity.uid},getProfile:()=>({studentKey:identity.studentKey}),isAdmin:()=>false,
    async getReceptionIdToken(){tokensRequested++;return 'fixture-token';},
    async loadDraft(){legacyDraftReads++;throw Error('Native messenger must not read legacy drafts');}};
  const nativeFetch=async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer fixture-token');return fetcher(url,options);};
  const {mountReception}=await import('../site/apps/reception/ai/entry.js');
  const {RECEPTION_AI_CONFIG}=await import('../site/apps/reception/ai/config.js');
  handle=await mountReception(root,{backend,locale:'ru',context:'course',assessmentAllowed:true,fetch:nativeFetch},{...RECEPTION_AI_CONFIG,enabled:true});
  immersiveCopy();await click('[data-action="start"]');
  assert.equal(lastView.mode,'independent');assert.equal(lastView.caseCount,8);assert.equal(lastView.status,'active');
  assert.equal(legacyDraftReads,0);assert.equal(tokensRequested,1);immersiveCopy();
  completed.push('native course entry opens an eight-case independent shift directly, with no feature or legacy chooser');
  console.log(JSON.stringify({status:'PASS',checks:completed,providerCalls:modelCalls,note:'DOM integration only. CSS layout, native browser behavior and live model quality are not evaluated.'},null,2));
}finally{releaseProvider?.();await handle();dom.window.close();}
