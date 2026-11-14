#!/usr/bin/env node
/** Actual app + actual service + authored execution profile, in a DOM runtime.
 * The reviewer is deliberately scripted. This is not a browser geometry test,
 * a production Firebase test, or evidence of live model assessment quality. */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createExecutionQA,executionQAIdentity} from './reception-execution-qa.mjs';
import {createReceptionStorage} from '../site/apps/reception/ai/session-storage.js';
import {RECEPTION_AUTHORITIES} from '../site/apps/reception/ai/authority-directory.js';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const out=path.resolve(arg('--out',path.join(os.tmpdir(),'reception-execution-dom')));
const rootDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(rootDir,'site');
const jsdomPath=arg('--jsdom',process.env.RECEPTION_JSDOM_MODULE);
const {JSDOM,VirtualConsole}=await import(jsdomPath?pathToFileURL(path.resolve(jsdomPath)).href:'jsdom');
const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
const dom=new JSDOM('<!doctype html><html lang="ru"><head></head><body><main id="receptionAI"></main></body></html>',{
  url:'http://127.0.0.1:8795/__qa/reception.html',pretendToBeVisual:true,virtualConsole,
});
for(const key of ['window','document','location','localStorage','CustomEvent','Event','MouseEvent','KeyboardEvent','HTMLElement','HTMLDialogElement','AbortController','AbortSignal','Node','NodeFilter','DOMParser','DOMException','MutationObserver'])globalThis[key]=dom.window[key];
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.innerHeight=844;
globalThis.matchMedia=dom.window.matchMedia=query=>({matches:query.includes('max-width'),addEventListener(){},removeEventListener(){}});
globalThis.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,char=>'\\'+char)};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.scrollTo=function(){};
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
dom.window.HTMLMediaElement.prototype.canPlayType=function(){return 'probably';};dom.window.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
dom.window.HTMLMediaElement.prototype.pause=function(){};dom.window.HTMLMediaElement.prototype.load=function(){};
const append=document.head.append.bind(document.head);document.head.append=(...nodes)=>{
  append(...nodes);for(const node of nodes)if(node.tagName==='LINK'){
    Object.defineProperty(node,'sheet',{get:()=>({cssRules:[]})});queueMicrotask(()=>node.dispatchEvent(new Event('load')));
  }
};
globalThis.fetch=async input=>{
  const url=new URL(input,location.href),file=path.resolve(url.protocol==='file:'?fileURLToPath(url):path.join(site,url.pathname));
  if(!file.startsWith(site+path.sep))throw Error('External resource blocked in local DOM fixture');
  try{return new Response(await readFile(file),{status:200});}catch{return new Response('',{status:404});}
};

const qa=await createExecutionQA({context:'seminar'});
let lastView=await qa.decide(await qa.open(await qa.start()));
assert.equal(lastView.status,'followup');assert.equal(lastView.controlWorkflow.version,'execution-v1');
const initialFeedback=structuredClone((await qa.store.get('sessions/'+lastView.id)).caseStates[0].correspondenceInitialFeedback);
const savedLetter=structuredClone(lastView.decision.correspondence),initialWorkflow=structuredClone(lastView.controlWorkflow);
const issueId='previous-response',repairId='repair';
const eventId=initialWorkflow.materials.find(material=>material.issueIds.includes(issueId)).id;
const repairProofId=initialWorkflow.materials.find(material=>material.issueIds.length===1&&material.issueIds[0]===repairId).id;
// The fixture chooses the intended route; the actual directory picker still has
// to expose it and transmit the user's selection to the service.
const recipientId=qa.profile.control.workflow.issues.find(issue=>issue.id===issueId).acceptedRecipientSets[0][0];
const authority=RECEPTION_AUTHORITIES.find(row=>row.id===recipientId);assert.ok(authority);
const endpoint='/api/reception',owner=executionQAIdentity.studentKey;
const drafts=createReceptionStorage({store:localStorage,owner,endpoint,legacyKey:'execution-dom-seed',version:'reception-ai-ui-v1'});
assert.equal(drafts.save({version:'reception-ai-ui-v1',owner,sessionId:lastView.id,status:lastView.status,caseId:qa.c.id,
  page:'decision',tab:'decision',locale:'ru',decisionDraft:lastView.decision,controlWorkspaceUI:{issueId}}),true);

const calls=[];let lastError,handle,dropReplyTo='';
const fetchAPI=async(_url,options)=>{
  const body=JSON.parse(options.body);calls.push(structuredClone(body));let response;
  try{response=await qa.service.handle(body,executionQAIdentity);if(response.view)lastView=response.view;}
  catch(error){lastError=error.code;return {ok:false,status:error.status||500,json:async()=>({ok:false,error:{code:error.code||'qa-error'}})};}
  if(dropReplyTo===body.op){dropReplyTo='';throw Error('Simulated connection loss after commit');}
  return {ok:true,status:200,json:async()=>response};
};
const root=document.getElementById('receptionAI'),{mountReceptionAI}=await import('../site/apps/reception/ai/app.js');
const options={locale:'ru',studentKey:owner,fetch:fetchAPI,context:'course',period:'execution-qa',showLanguageSelector:true};
const config={endpoint,demo:true,gameplayContext:'seminar',workbookVersion:2,decisionVersion:'correspondence-v1',controlVersion:'execution-v1'};
const report={suite:'execution-functional-dom',context:'seminar',caseId:qa.c.id,status:'running',checks:[],errors,
  reviewer:'Explicit scripted reviewer; no live model call',
  limitations:['DOM integration only; no rendered layout, physical device or browser engine verification.',
    'One authored acceptance case with two independent issues; not production Firebase or all-case validation.']};
const passed=name=>report.checks.push({name,status:'passed'});
const normalized=value=>String(value).replace(/\s+/g,' ').trim();
const node=selector=>{const element=root.querySelector(selector);assert.ok(element,`Missing ${selector}; last service error: ${lastError||''}`);return element;};
const issue=id=>lastView.controlWorkflow.issues.find(row=>row.id===id);
const latest=()=>lastView.controlWorkflow.journal.at(-1);
async function settle(){await handle?.flush?.();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(root.getAttribute('aria-busy'),'false');}
async function click(selector){const element=node(selector);assert.notEqual(element.disabled,true,`Disabled ${selector}`);element.click();await settle();}
function input(selector,value){const element=node(selector);assert.equal(element.disabled,false);element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));}
async function select(selector,value){const element=node(selector);element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));await settle();}
async function check(selector,checked=true){const element=node(selector);assert.equal(element.disabled,false);element.checked=checked;element.dispatchEvent(new Event('change',{bubbles:true}));await settle();}
async function submit(selector){node(selector).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle();}
async function remount(){await handle?.();handle=await mountReceptionAI(root,options,config);await settle();}
async function chooseIssue(id){await click(`[data-control-action="select-issue"][data-issue-id="${id}"]`);}
async function chooseAction(kind,id){await chooseIssue(id);await click(`[data-control-action="select-kind"][data-issue-id="${id}"][data-kind="${kind}"]`);}
async function setEvidence(sourceIds){
  const available=[...root.querySelectorAll('[data-control-field="evidenceSourceIds"]')].map(element=>element.dataset.sourceId);
  for(const id of sourceIds)assert.ok(available.includes(id),'Only a released material can be selected');
  for(const id of available){const selector=`[data-control-field="evidenceSourceIds"][data-source-id="${id}"]`;
    if(node(selector).checked!==sourceIds.includes(id))await check(selector,sourceIds.includes(id));}
}
async function fillAction({reason,instruction,expectedResult,dueDate,evidenceSourceIds}={}){
  for(const [field,value]of Object.entries({reason,instruction,expectedResult,dueDate}))if(value!==undefined)input(`[data-control-field="${field}"]`,value);
  if(evidenceSourceIds)await setEvidence(evidenceSourceIds);
}
async function execute(){await click('[data-control-action="execute"]');}
let stage='mount';
try{
  await mkdir(out,{recursive:true});handle=await mountReceptionAI(root,options,config);await settle();
  assert.equal(lastView.context,'seminar');assert.equal(root.dataset.page,'decision');
  assert.equal(root.querySelectorAll('[data-control-workspace]').length,1);assert.equal(root.querySelectorAll('form form').length,0);
  assert.equal(root.querySelector('[data-followup-choice]'),null);assert.equal(root.querySelector('[data-response-control-field]'),null);
  assert.equal(issue(repairId).substantiveStatus,'resolved');assert.equal(issue(repairId).status,'open');assert.deepEqual(issue(repairId).verifiedEvidenceIds,[]);
  assert.ok(node('.rxe-planned').textContent.includes('Провести независимую проверку'));
  passed('The real seminar session resumes in the new workspace with separate outcomes, stages and original assignments');

  stage='draft-and-recipient';
  const request={reason:'Результат ремонта не разрешает жалобу на достоверность прежнего ответа И-7. Требуется самостоятельный материал проверки.',
    instruction:'Представить мотивированный результат независимого рассмотрения доводов жалобы, отдельно от сведений о ремонте дорожки.',
    expectedResult:'Заключение по каждому доводу жалобы с указанием проверенных материалов.',dueDate:'2026-11-19',evidenceSourceIds:[eventId]};
  await chooseAction('request_evidence',issueId);
  // A native change can run after focus has already moved. Replacing the form
  // here detaches the next field before its subsequent input reaches the root.
  const fieldNames=['reason','instruction','expectedResult','dueDate'];
  const fieldNodes=fieldNames.map(field=>node(`[data-control-field="${field}"]`));
  for(let index=0;index<fieldNodes.length;index++){
    const element=fieldNodes[index],next=fieldNodes[(index+1)%fieldNodes.length];
    element.focus();element.value=request[fieldNames[index]];
    element.dispatchEvent(new Event('input',{bubbles:true}));
    next.focus();element.dispatchEvent(new Event('change',{bubbles:true}));
    assert.equal(document.activeElement,next,'Blur/change must retain the newly focused field');
    for(let i=0;i<fieldNodes.length;i++){
      assert.equal(node(`[data-control-field="${fieldNames[i]}"]`),fieldNodes[i],'Text/date changes must preserve field nodes');
      assert.equal(fieldNodes[i].isConnected,true);
    }
  }
  await setEvidence(request.evidenceSourceIds);
  passed('Native blur/change preserves text/date field nodes and next-field focus');
  await click('[data-control-action="choose-recipient"]');await select('[data-routing-territory]','');
  input('[data-routing-search]',authority.name);await settle();await check(`[data-routing-recipient][value="${recipientId}"]`);
  await click('[data-action="control-recipient-done"]');assert.ok(node('.rxe-recipient-chips').textContent.includes(authority.name));
  for(const field of fieldNames)assert.equal(node(`[data-control-field="${field}"]`).value,request[field],`Recipient navigation preserves ${field}`);
  await chooseIssue(repairId);assert.ok(node('.rxe-draft-notice'));assert.equal(node('[data-kind="verify"]').disabled,true);
  await click(`.rxe-draft-notice [data-control-action="select-issue"][data-issue-id="${issueId}"]`);
  assert.equal(node('[data-control-field="instruction"]').value,request.instruction);
  passed('The authority directory supplies the action recipient; inspecting another issue preserves its unfinished draft');
  await remount();assert.equal(node('[data-control-field="reason"]').value,request.reason);
  assert.equal(node('[data-control-field="expectedResult"]').value,request.expectedResult);
  assert.equal(node(`[data-control-field="evidenceSourceIds"][data-source-id="${eventId}"]`).checked,true);
  assert.ok(node('.rxe-recipient-chips').textContent.includes(authority.name));
  passed('Unmount and resume retain the action prose, selected evidence, deadline and recipient');

  stage='working-locales';
  for(const locale of ['en','zh','ru']){
    await select('[data-language]',locale);assert.equal(root.lang,locale);
    assert.equal(node('[data-control-field="reason"]').value,request.reason);
    assert.equal(node('[data-control-field="expectedResult"]').value,request.expectedResult);
    assert.ok(node('[data-control-action="execute"]').textContent.trim());
    assert.equal(root.querySelectorAll('form form').length,0);
    await writeFile(path.join(out,`work-${locale}.html`),dom.serialize());
  }
  passed('RU, EN and ZH render the actual workspace and preserve the student-authored action');

  stage='request-lost-response';
  const beforeRequest=lastView.controlWorkflow.journal.length;dropReplyTo='control-action';await execute();
  assert.equal(latest().accepted,true);assert.equal(latest().kind,'request_evidence');
  assert.equal(latest().outcome,'request_received');assert.equal(issue(issueId).status,'awaiting');
  assert.deepEqual(issue(issueId).verifiedEvidenceIds,[]);assert.equal(node('[data-control-field="reason"]').disabled,true);
  const requestCall=calls.filter(call=>call.op==='control-action').at(-1),requestReceipt=lastView.controlActionReceipt;
  assert.deepEqual(requestCall.action.recipientIds,[recipientId]);assert.equal(requestCall.action.expectedResult,request.expectedResult);
  assert.ok(node('[data-action="retry"]'));
  await click('[data-action="retry"]');assert.equal(calls.at(-1).op,'resume');
  assert.equal(calls.filter(call=>call.op==='control-action').length,1);
  assert.equal(lastView.controlWorkflow.journal.length,beforeRequest+1);assert.equal(lastView.controlActionReceipt.requestId,requestReceipt.requestId);
  assert.equal(root.querySelector('[data-control-composer]'),null);
  passed('A lost request response reconciles the committed receipt before retry, releases materials once and clears the accepted draft');

  stage='received-material';
  const incoming=lastView.controlWorkflow.materials.find(material=>material.kind==='execution-record'&&material.issueIds.includes(issueId));
  assert.ok(incoming);assert.equal(initialWorkflow.materials.some(material=>material.id===incoming.id),false);
  await click(`.rxe-materials [data-control-action="open-material"][data-material-id="${incoming.id}"]`);
  assert.equal(normalized(node(`[data-control-material="${incoming.id}"] .rxe-material-text`).textContent),normalized(incoming.text));
  assert.equal(document.activeElement,node(`[data-control-material="${incoming.id}"] h3`));
  assert.equal(issue(issueId).substantiveStatus,'pending');assert.deepEqual(issue(issueId).verifiedEvidenceIds,[]);
  assert.equal(root.innerHTML.includes('verification'),false);
  passed('The incoming authored document opens in full with focus; receipt alone neither verifies nor closes the issue');

  stage='premature-close';
  const closureReason='Проверить достаточность полученного заключения для завершения самостоятельного вопроса жалобы.';
  await chooseAction('close',issueId);await fillAction({reason:closureReason,evidenceSourceIds:[incoming.id]});await execute();
  assert.equal(latest().accepted,false);assert.equal(latest().outcome,'closure_evidence_required');
  assert.equal(issue(issueId).status,'awaiting');assert.equal(node('[data-control-field="reason"]').value,closureReason);
  assert.ok(node(`[data-control-event="${latest().id}"].rxe-journal-returned`).textContent.trim());
  assert.equal(qa.reviewer.reviewCalls,1);
  passed('Premature closure produces a reasoned work-log refusal, retains the draft and does not fabricate an assessment');

  stage='continue-complaint';
  await chooseAction('keep_open',issueId);await fillAction({reason:'Заключение получено, но его доводы ещё не сопоставлены с первоначальной жалобой.',
    instruction:'Продолжить независимое сопоставление каждого довода с заключением и подготовить сообщение заявительнице.',
    dueDate:'2026-11-20',expectedResult:'Результат дополнительного сопоставления с основаниями для окончательного вывода.',evidenceSourceIds:[incoming.id]});
  await execute();assert.equal(latest().accepted,true);assert.equal(latest().outcome,'kept_open');
  assert.equal(issue(issueId).status,'open');assert.equal(issue(issueId).substantiveStatus,'pending');
  passed('A reasoned continuation records a concrete next action while leaving the complaint pending');

  stage='verify-repair';
  await chooseAction('verify',repairId);await fillAction({reason:'Проверяется восстановление дорожки в пределах отдельного предмета обращения.',
    instruction:'В поступившем сообщении прямо подтверждён ремонт дорожки; этот факт не устанавливает результат рассмотрения жалобы на прежний ответ.',
    evidenceSourceIds:[repairProofId]});await execute();
  assert.equal(latest().accepted,true);assert.equal(latest().outcome,'evidence_verified');assert.equal(issue(repairId).status,'ready');
  assert.deepEqual(issue(repairId).verifiedEvidenceIds,[repairProofId]);assert.equal(issue(issueId).status,'open');
  passed('Verification records the relevant proof for the repair without completing the independent complaint');

  stage='notify';
  await chooseAction('notify',repairId);assert.ok(node('[data-control-field="expectedResult"]'));
  assert.equal(root.querySelector('[data-control-field="dueDate"]'),null);
  await fillAction({reason:'Заявительнице необходимо сообщить установленный результат по вопросу восстановления дорожки.',
    instruction:'Восстановление дорожки подтверждено поступившим материалом. Рассмотрение жалобы на прежний ответ продолжается самостоятельно.',
    evidenceSourceIds:[repairProofId]});
  await execute();assert.equal(latest().accepted,false);assert.equal(latest().outcome,'notice_incomplete');
  assert.equal(issue(repairId).notified,false);assert.ok(node('[data-control-field="instruction"]').value.includes('продолжается'));
  input('[data-control-field="expectedResult"]','Фиксация учебного уведомления о подтверждённом ремонте и продолжающемся рассмотрении жалобы.');
  dropReplyTo='control-action';await execute();
  assert.equal(latest().accepted,true);assert.equal(latest().outcome,'notice_recorded');assert.equal(issue(repairId).notified,true);
  const noticeCall=calls.filter(call=>call.op==='control-action'&&call.action.kind==='notify').at(-1);
  assert.ok(noticeCall.action.expectedResult);assert.equal(noticeCall.action.dueDate,'');
  const noticeMaterial=lastView.controlWorkflow.materials.find(material=>latest().materialIds.includes(material.id));
  assert.ok(noticeMaterial);assert.ok(noticeMaterial.provenanceLabel);
  passed('Notification requires the visible expected-result field, preserves an incomplete draft, and records a simulated notice without inventing a deadline');

  stage='reload-after-committed-action';
  const noticeEvents=lastView.controlWorkflow.journal.filter(event=>event.outcome==='notice_recorded').length;
  await remount();assert.equal(calls.at(-1).op,'resume');
  assert.equal(calls.filter(call=>call.op==='control-action'&&call.action.kind==='notify').length,2);
  assert.equal(lastView.controlWorkflow.journal.filter(event=>event.outcome==='notice_recorded').length,noticeEvents);
  assert.equal(root.querySelector('[data-control-composer]'),null,'A committed action draft must clear on resume after a lost response');
  passed('Reload after a lost action response reconciles the saved receipt and does not leave an already accepted notice ready for a second submission');

  stage='close-repair';
  await chooseAction('close',repairId);await fillAction({reason:'Дорожка восстановлена, относимый материал проверен, учебное уведомление о результате зафиксировано. Закрывается только вопрос ремонта.',
    evidenceSourceIds:[repairProofId]});await execute();
  assert.equal(latest().accepted,true);assert.equal(latest().outcome,'closed');
  assert.equal(issue(repairId).status,'closed');assert.equal(issue(repairId).substantiveStatus,'resolved');
  assert.equal(issue(issueId).status,'open');assert.equal(issue(issueId).substantiveStatus,'pending');
  assert.ok(node('[data-control-action="select-kind"][data-kind="reopen"]'));
  passed('Closing the verified and notified repair leaves the complaint open and exposes the separate reopening action');

  stage='memorandum';
  await click('[data-control-action="prepare-memorandum"]');
  assert.equal(root.querySelectorAll('[data-control-submit]').length,1);assert.equal(root.querySelectorAll('form form').length,0);
  await select(`[data-response-status-field="status"][data-issue-id="${repairId}"]`,'resolved');
  await select(`[data-response-status-field="status"][data-issue-id="${issueId}"]`,'pending');
  await check(`[data-response-status-evidence="${repairProofId}"][data-issue-id="${repairId}"]`);
  await check(`[data-response-status-evidence="${incoming.id}"][data-issue-id="${issueId}"]`);
  const memorandum='Восстановление дорожки подтверждено поступившим материалом, проверено отдельно и отражено в учебном уведомлении. Работа по этому предмету завершена. По жалобе на прежний ответ получено независимое заключение, однако его доводы ещё необходимо сопоставить с первоначальной жалобой. Этот предмет остаётся открытым; в журнале зафиксировано дальнейшее действие. Ремонт не заменяет рассмотрение жалобы.';
  input('[data-response-control-field="text"]',memorandum);
  await remount();assert.equal(node('[data-response-control-field="text"]').value,memorandum);
  assert.equal(node(`[data-response-status-field="status"][data-issue-id="${repairId}"]`).value,'resolved');
  assert.equal(node(`[data-response-status-field="status"][data-issue-id="${issueId}"]`).value,'pending');
  assert.equal(node(`[data-response-status-evidence="${incoming.id}"][data-issue-id="${issueId}"]`).checked,true);
  passed('The final memorandum saves the independent closed and continuing dispositions, evidence and authored explanation across resume');

  stage='submit-and-readonly';
  const beforeReviewCalls=qa.reviewer.reviewCalls;dropReplyTo='followup';await submit('[data-followup-form]');
  assert.equal(lastView.status,'review');assert.equal(root.dataset.sessionStatus,'followup');
  await click('[data-action="retry"]');assert.equal(calls.at(-1).op,'resume');assert.equal(root.dataset.sessionStatus,'review');
  assert.equal(calls.filter(call=>call.op==='followup').length,1);assert.equal(qa.reviewer.reviewCalls,beforeReviewCalls+1);
  assert.equal(lastView.feedback.correspondence.initialScore,initialFeedback.score);assert.deepEqual(lastView.decision.correspondence,savedLetter);
  const record=node('[data-control-record]');assert.equal(record.querySelectorAll('input,select,textarea,button,form').length,0);
  assert.ok(record.textContent.includes(memorandum));assert.equal(record.querySelectorAll('[data-control-event]').length,lastView.controlWorkflow.journal.length);
  assert.equal(lastView.control.statuses.find(row=>row.issueId===repairId).status,'resolved');
  assert.equal(lastView.control.statuses.find(row=>row.issueId===issueId).status,'pending');
  passed('A lost final response is reconciled once; the readonly record retains all work and preserves the initial letter and grade');

  stage='result-locales';const savedControl=structuredClone(lastView.control);
  await click('[data-action="next"]');assert.equal(lastView.status,'complete');
  assert.equal(lastView.result.cases[0].controlWorkflow.version,'execution-v1');
  assert.deepEqual(lastView.result.cases[0].control,savedControl);
  for(const locale of ['en','zh','ru']){
    await select('[data-language]',locale);assert.equal(root.lang,locale);
    const finalRecord=node('[data-control-record]');assert.ok(finalRecord.textContent.includes(memorandum));
    assert.equal(finalRecord.querySelectorAll('input,select,textarea,button,form').length,0);
    assert.equal(finalRecord.querySelectorAll('[data-control-event]').length,lastView.result.cases[0].controlWorkflow.journal.length);
    await writeFile(path.join(out,`result-${locale}.html`),dom.serialize());
  }
  passed('The completed result keeps the control history and authored conclusion as a readonly record in RU, EN and ZH');
  assert.deepEqual(errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failedStage=stage;report.failure=String(error);report.stack=error.stack;process.exitCode=1;}
finally{
  await handle?.();report.apiOperations=calls.map(call=>call.op);report.reviewCalls=qa.reviewer.reviewCalls;
  report.actionOutcomes=(lastView.controlWorkflow||lastView.result?.cases?.[0]?.controlWorkflow)?.journal.map(({kind,accepted,outcome})=>({kind,accepted,outcome}));
  await mkdir(out,{recursive:true});await writeFile(path.join(out,'dom-report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(path.join(out,'last-dom.html'),dom.serialize());dom.window.close();console.log(JSON.stringify(report,null,2));
}
