import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTROL_WORKFLOW_VERSION,createControlWorkflow,applyControlAction,publicControlWorkflow,controlWorkflowSources,
  controlReviewContext,validateControlSubmission,normalizeControlWorkflow,controlWorkflowReviewSize} from './control-workflow.mjs';

const T=(ru,en=ru,zh=ru)=>({ru,en,zh});
const caseId='several-repair-and-complaint',sha='a'.repeat(64);
const ID={event:'workflow-case-event',promise:'workflow-case-promise',mismatch:'workflow-case-mismatch',repair:'workflow-repair-result',complaint:'workflow-complaint-result',receipt:'workflow-complaint-receipt',new:'workflow-new-result'};
const caseData={id:caseId,version:'workflow-fixture-v1',datePackId:'a',provenance:{sourceSHA256:sha},
  followup:{intro:T('Ремонт обещан. Самостоятельного результата рассмотрения жалобы пока нет.','Repair has been promised. There is no separate complaint decision yet.','已承诺维修，尚无单独投诉处理结果。')},
  documents:[{id:'promise',title:T('Обещание'),text:T('Работы обещаны. Акта выполнения нет.')},{id:'other',title:T('Другая дорожка'),text:T('Документ относится к другому объекту.')}]};
function fixture({newIssue=false,initialResolved=false}={}){
  const makeIssue=(id,material,extra={})=>({id,title:T(id==='repair'?'Дорожка':id==='complaint'?'Прежний ответ':'Новый объект',id, id),resultType:'specified-scope',scope:T('Подтверждение только предмета '+id),
    initialStatus:'open',initialMaterialIds:[ID.event],evidenceMaterialIds:[material],deliveryRequired:true,allowReferral:false,responseMaterialId:material,
    closureText:T('PRIVATE CLOSURE '+id),continuationText:T('PRIVATE CONTINUATION '+id),acceptedRecipientSets:[[id==='repair'?'road-owner':'independent-review']],newIssue:null,...extra});
  const issues=[makeIssue('repair',ID.repair),makeIssue('complaint',ID.complaint,{allowReferral:true,referralMaterialId:ID.receipt})];
  if(initialResolved){issues[0].initialStatus='resolved';issues[0].initialMaterialIds.push(ID.repair);}
  if(newIssue)issues[1].newIssue=makeIssue('new-object',ID.new);
  const allIssues=newIssue?['repair','complaint','new-object']:['repair','complaint'];
  const material=(id,issueIds,verification,kind='execution-record',extra={})=>({id,issueIds,title:T('Материал '+id,'Material '+id,'材料 '+id),text:T('Авторский материал '+id),kind,verification,
    provenance:{kind:'authored-control-extension',sourceCaseId:caseId},...extra});
  const materials=[
    material(ID.event,allIssues,'context','author-event',{text:T('UNFROZEN PLACEHOLDER'),provenance:{kind:'original-case',sourceCaseId:caseId,sourcePointer:'template.followup.intro'}}),
    material(ID.promise,['repair'],'insufficient','case-document',{text:T('UNFROZEN PROMISE'),sourceDocumentIds:['promise'],provenance:{kind:'original-case',sourceCaseId:caseId}}),
    material(ID.mismatch,['repair'],'mismatch','case-document',{sourceDocumentIds:['other'],provenance:{kind:'original-case',sourceCaseId:caseId}}),
    material(ID.repair,['repair'],'confirmation'),material(ID.complaint,['complaint'],'confirmation'),material(ID.receipt,['complaint'],'delivery','delivery-receipt'),
  ];
  if(newIssue)materials.push(material(ID.new,['new-object'],'confirmation'));
  const profile={control:{workflow:{version:CONTROL_WORKFLOW_VERSION,provenance:{kind:'authored-control-extension',sourceCaseId:caseId,sourceSHA256:sha,version:1},issues,materials,
    initialMaterialIds:[ID.event,ID.promise,ID.mismatch]}}};
  const decision={workbook:{routing:{recipientIds:['road-owner','independent-review']}},correspondence:{orders:[
    {id:'plan-1',issue:'repair',kind:'execution',recipientIds:['road-owner'],instruction:'Проверить подтверждение ремонта.',dueDate:'2026-12-20',expectedResult:'Акт',citationIds:[]},
    {id:'plan-2',issue:'Без установленного предмета',kind:'review',recipientIds:[],instruction:'Уточнить предмет.',dueDate:'',expectedResult:'',citationIds:[]},
  ]}};
  const initialFeedback={workbook:{routing:{correct:false,expectedRecipients:[{id:'road-owner'},{id:'independent-review'}]}}};
  return {profile,decision,initialFeedback,caseData:structuredClone(caseData),workflow:createControlWorkflow({caseData,profile,decision,initialFeedback,timestamp:1000})};
}
function command(kind,issueId='repair',evidence=[ID.event],overrides={}){
  return {issueId,kind,reason:'Основание записано студентом.',instruction:'Предоставьте относимое подтверждение по указанному предмету.',recipientIds:[issueId==='repair'?'road-owner':'independent-review'],
    dueDate:'2026-12-20',expectedResult:'Проверяемый документ по данному предмету.',evidenceSourceIds:evidence,...overrides};
}
function apply(s,action,options={}){return applyControlAction(s,null,action,{caseData,timestamp:2000+s.revision,requestId:'request-'+s.revision,expectedRevision:s.revision,...options});}
const err=code=>e=>e.code===code;
const issue=(s,id='repair')=>s.issues.find(row=>row.id===id);
const result=s=>s.journal.at(-1).outcome;
function finishRepair(s){
  s=apply(s,command('request_evidence'));
  s=apply(s,command('verify','repair',[ID.repair]));
  s=apply(s,command('notify','repair',[ID.repair]));
  return apply(s,command('close','repair',[ID.repair]));
}

test('creation freezes authoritative sources, plans remain plans, and unreleased keys stay private',()=>{
  const f=fixture(),view=publicControlWorkflow(f.workflow,null,'en');
  assert.equal(view.materials.find(m=>m.id===ID.event).text,caseData.followup.intro.en);
  assert.equal(view.materials.find(m=>m.id===ID.promise).text,caseData.documents[0].text.en);
  assert.equal(view.plannedOrders[0].issueId,'repair');assert.equal(view.plannedOrders[1].issueId,null);
  assert.ok(view.issues.every(row=>row.status==='open'&&!row.notified&&!row.verifiedEvidenceIds.length));
  assert.equal(f.workflow.initialRouting.correct,false);
  assert.equal(view.materials.some(m=>m.id===ID.repair),false);
  const serialized=JSON.stringify(view);
  for(const hidden of ['PRIVATE CLOSURE','PRIVATE CONTINUATION','verification','acceptedRecipientSets','definitionHash','previousHash'])assert.equal(serialized.includes(hidden),false,hidden);
  f.profile.control.workflow.materials.find(m=>m.id===ID.repair).text='CHANGED AFTER CREATION';
  const changed=apply(f.workflow,command('request_evidence'));
  assert.equal(changed.materials.find(m=>m.id===ID.repair).text.ru,'Авторский материал '+ID.repair);
});

test('a genuine directed request releases only authored issue results and preserves submitted prose',()=>{
  const {workflow}=fixture();const before=structuredClone(workflow),action=command('request_evidence');
  const next=apply(workflow,action);
  assert.deepEqual(workflow,before,'Pure transition must not mutate previous journal/state');
  assert.equal(result(next),'request_received');assert.equal(next.journal.at(-1).accepted,true);
  assert.equal(issue(next).status,'awaiting');assert.deepEqual(issue(next).verifiedEvidenceIds,[]);
  assert.ok(next.materials.some(m=>m.id===ID.repair));assert.equal(next.materials.some(m=>m.id===ID.complaint),false);
  const request=next.materials.find(m=>m.provenance.kind==='student-action');
  assert.ok(request.text.ru.includes(action.instruction));assert.equal(request.verification,'context');
  assert.equal(issue(next,'complaint').status,'open');
});

test('missing structure, unrelated evidence and wrong or unknown recipients cannot manufacture confirmation',()=>{
  const {workflow}=fixture();
  for(const [action,expected] of [
    [command('request_evidence','repair',[ID.event],{instruction:''}),'request_incomplete'],
    [command('request_evidence','repair',[ID.event],{dueDate:''}),'request_incomplete'],
    [command('request_evidence','repair',[ID.event],{recipientIds:['independent-review']}),'recipient_unconfirmed'],
  ]){
    const next=apply(workflow,action);assert.equal(result(next),expected);assert.equal(next.journal.at(-1).accepted,false);
    assert.equal(next.materials.some(m=>m.id===ID.repair),false);assert.equal(issue(next).status,'open');
  }
  assert.throws(()=>apply(workflow,command('request_evidence','repair',[ID.event],{recipientIds:['invented-authority']})),err('invalid_recipient'));
  const callbackRejected=apply(workflow,command('request_evidence'),{recipientCheck:()=>({valid:false})});
  assert.equal(result(callbackRejected),'recipient_unconfirmed');
  const promiseNotApproval=apply(workflow,command('request_evidence'),{recipientCheck:()=>Promise.resolve({valid:true})});
  assert.equal(result(promiseNotApproval),'recipient_unconfirmed');
});

test('promise, mismatched object and dispatch record never open the scope-completion gate',()=>{
  let {workflow}=fixture();
  for(const materialId of [ID.promise,ID.mismatch]){
    const checked=apply(workflow,command('verify','repair',[materialId]));
    assert.equal(result(checked),'evidence_insufficient');assert.equal(checked.journal.at(-1).accepted,true,'A correct negative comparison is still an executed professional action');
    assert.deepEqual(issue(checked).verifiedEvidenceIds,[]);
    const closed=apply(checked,command('close','repair',[materialId]));
    assert.equal(result(closed),'closure_evidence_required');assert.notEqual(issue(closed).status,'closed');
  }
  workflow=apply(workflow,command('notify','repair',[ID.promise]));
  const simulatedDispatch=workflow.materials.find(m=>m.provenance.kind==='student-action').id;
  workflow=apply(workflow,command('verify','repair',[simulatedDispatch]));
  assert.equal(result(workflow),'evidence_insufficient');
});

test('verification and notification are separate, and a previous notification cannot cover a newly verified result',()=>{
  let {workflow}=fixture();
  workflow=apply(workflow,command('request_evidence'));
  workflow=apply(workflow,command('notify','repair',[ID.repair]));assert.equal(issue(workflow).notified,true);
  workflow=apply(workflow,command('verify','repair',[ID.repair]));assert.equal(issue(workflow).notified,false);
  workflow=apply(workflow,command('close','repair',[ID.repair]));assert.equal(result(workflow),'closure_notice_required');
  workflow=apply(workflow,command('notify','repair',[ID.repair]));
  workflow=apply(workflow,command('close','repair',[ID.repair]));
  assert.equal(result(workflow),'closed');assert.equal(issue(workflow).substantiveStatus,'resolved');
  assert.equal(issue(workflow,'complaint').substantiveStatus,'pending');assert.equal(workflow.status,'active');
});

test('a confirmation for one issue cannot resolve another; explicit new issues remain independent',()=>{
  let {workflow}=fixture({newIssue:true});
  assert.equal(workflow.issues.length,3);
  workflow=finishRepair(workflow);
  workflow=apply(workflow,command('verify','complaint',[ID.repair]));
  assert.equal(result(workflow),'evidence_unrelated');assert.deepEqual(issue(workflow,'complaint').verifiedEvidenceIds,[]);
  assert.equal(issue(workflow,'new-object').status,'open');assert.equal(issue(workflow,'new-object').materialIds.includes(ID.event),true);
  const report=validateControlSubmission(workflow,null,{text:'Ремонт подтверждён, другие вопросы открыты.',statuses:[
    {issueId:'repair',status:'resolved',evidenceSourceIds:[ID.repair]},
    {issueId:'complaint',status:'pending',evidenceSourceIds:[ID.event]},
    {issueId:'new-object',status:'pending',evidenceSourceIds:[ID.event]},
  ]});
  assert.equal(report.valid,true);
});

test('referral needs the authored recipient acknowledgement and does not become substantive completion',()=>{
  let {workflow}=fixture();
  workflow=apply(workflow,command('refer','complaint',[ID.event]));assert.equal(result(workflow),'receipt_required');
  workflow=apply(workflow,command('request_evidence','complaint'));
  assert.ok(workflow.materials.some(m=>m.id===ID.receipt));
  workflow=apply(workflow,command('verify','complaint',[ID.receipt]));assert.equal(result(workflow),'evidence_insufficient');
  workflow=apply(workflow,command('refer','complaint',[ID.receipt]));assert.equal(result(workflow),'referred');
  assert.equal(issue(workflow,'complaint').substantiveStatus,'referred');
  workflow=apply(workflow,command('close','complaint',[ID.receipt]));assert.equal(result(workflow),'reopen_required');
  const report=validateControlSubmission(workflow,null,{text:'Жалоба передана, исполнение не установлено.',statuses:[
    {issueId:'repair',status:'pending',evidenceSourceIds:[ID.event]},
    {issueId:'complaint',status:'referred',evidenceSourceIds:[ID.receipt]},
  ]});assert.equal(report.valid,true);
});

test('request retries are idempotent, conflicting IDs and stale revisions cannot append or mutate history',()=>{
  const {workflow}=fixture(),action=command('request_evidence'),options={caseData,timestamp:2001,requestId:'stable-request',expectedRevision:workflow.revision};
  const next=applyControlAction(workflow,null,action,options);
  const repeated=applyControlAction(next,null,action,{...options,timestamp:3000});
  assert.deepEqual(repeated,next);
  assert.throws(()=>applyControlAction(next,null,{...action,instruction:'Другой текст.'},options),err('request_conflict'));
  assert.throws(()=>applyControlAction(next,null,action,{...options,requestId:'new-id'}),err('revision_conflict'));
  assert.deepEqual(workflow.journal,next.journal.slice(0,workflow.journal.length));
});

test('reopening preserves the audit chain but requires a new verification and notification before closure',()=>{
  let {workflow}=fixture();workflow=finishRepair(workflow);
  const before=structuredClone(workflow.journal);
  workflow=apply(workflow,command('reopen','repair',[ID.repair],{reason:'Проверить предел ранее зафиксированного результата.'}));
  assert.equal(issue(workflow).status,'reopened');assert.equal(issue(workflow).notified,false);assert.deepEqual(issue(workflow).verifiedEvidenceIds,[]);
  assert.deepEqual(workflow.journal.slice(0,before.length),before);
  workflow=apply(workflow,command('close','repair',[ID.repair]));assert.equal(result(workflow),'closure_evidence_required');
  assert.ok(workflow.materials.some(m=>m.id===ID.repair),'Old evidence is preserved as historical material');
});

test('final status mismatches return editable findings, while a grounded pending disposition is legitimate',()=>{
  const {workflow}=fixture();
  const valid=validateControlSubmission(workflow,null,{text:'По двум предметам ожидаем подтверждения.',statuses:[
    {issueId:'repair',status:'pending',evidenceSourceIds:[ID.event]},
    {issueId:'complaint',status:'pending',evidenceSourceIds:[ID.event]},
  ]});assert.equal(valid.valid,true);
  const invalid=validateControlSubmission(workflow,null,{text:'Всё выполнено.',statuses:[{issueId:'repair',status:'resolved',evidenceSourceIds:[ID.promise]}]});
  assert.equal(invalid.valid,false);assert.ok(invalid.findings.some(row=>row.code==='closure_not_verified'));assert.ok(invalid.findings.some(row=>row.code==='status_missing'));
  assert.equal(workflow.revision,1);assert.equal(own(invalid,'score'),false);
});
function own(value,key){return Object.hasOwn(value,key);}

test('known original completion is not attributed to student execution and still needs reviewed closure',()=>{
  const {workflow}=fixture({initialResolved:true});
  assert.equal(issue(workflow).substantiveStatus,'resolved');assert.equal(issue(workflow).status,'open');assert.deepEqual(issue(workflow).verifiedEvidenceIds,[]);
  const closed=apply(workflow,command('close','repair',[ID.repair]));assert.equal(result(closed),'closure_evidence_required');
});

test('restoration tolerates omitted empty collections and rejects tampered journal, material or frozen key',()=>{
  const f=fixture();
  f.profile.control.workflow.materials[0].optionalEmptyMetadata={nested:[],nullable:null};
  const workflow=createControlWorkflow({...f,timestamp:1000});
  function omitEmpty(value){
    if(Array.isArray(value))return value.length?value.map(omitEmpty):null;
    if(value&&typeof value==='object'){
      const entries=Object.entries(value).map(([k,v])=>[k,omitEmpty(v)]).filter(([,v])=>v!==null);
      return entries.length?Object.fromEntries(entries):null;
    }
    return value;
  }
  const restored=normalizeControlWorkflow(JSON.parse(JSON.stringify(omitEmpty(workflow))));
  assert.deepEqual(publicControlWorkflow(restored),publicControlWorkflow(workflow));
  const after=apply(restored,command('request_evidence'));
  const roundtrip=JSON.parse(JSON.stringify(omitEmpty(after)));
  assert.deepEqual(publicControlWorkflow(roundtrip),publicControlWorkflow(after));
  for(const change of [
    s=>s.journal[0].message.ru='Подменённая история',
    s=>s.materials[0].text.ru='Подменённый факт',
    s=>s.definition.issues[0].evidenceMaterialIds=[ID.promise],
    s=>s.issues[0].status='closed',
  ]){const changed=structuredClone(workflow);change(changed);assert.throws(()=>publicControlWorkflow(changed),err('invalid_control_state'));}
});

test('public evidence uses stable document IDs; compact review never repeats submitted action prose or source text',()=>{
  let {workflow}=fixture();const action=command('request_evidence','repair',[ID.event],{instruction:'UNIQUE STUDENT INSTRUCTION 47'});
  workflow=apply(workflow,action);
  const sources=controlWorkflowSources(workflow,null,'en'),view=publicControlWorkflow(workflow,null,'en'),review=controlReviewContext(workflow,null,'en');
  assert.ok(sources.every(source=>source.kind==='document'&&source.id.startsWith('workflow-')&&typeof source.text==='string'));
  assert.equal(view.journal.at(-1).instruction,action.instruction);
  assert.equal(JSON.stringify(review).includes(action.instruction),false);
  assert.ok(review.materials.every(source=>source.sourceId==='document:'+source.id&&!own(source,'text')));
  assert.ok(review.journal.every(event=>!own(event,'instruction')&&!own(event,'reason')&&!own(event,'expectedResult')));
  assert.deepEqual(review.issues.find(row=>row.id==='repair').allowedStatuses,['pending']);
});

test('malformed or forged input cannot inject materials, facts, statuses, recipients, dates or event time',()=>{
  const {workflow}=fixture();
  for(const modify of [
    a=>{a.status='closed';},a=>{a.materials=[];},a=>{a.at=0;},a=>{a.evidenceSourceIds=[ID.repair];},
    a=>{a.dueDate='2026-02-30';},a=>{a.instruction='x'.repeat(4001);},a=>{a.recipientIds=['not-a-real-authority'];},
  ]){const action=command('request_evidence');modify(action);assert.throws(()=>apply(workflow,action));}
  const f=fixture();f.profile.control.workflow.provenance.sourceSHA256='b'.repeat(64);
  assert.throws(()=>createControlWorkflow({...f,timestamp:1000}),err('invalid_control_workflow'));
  assert.throws(()=>publicControlWorkflow({...workflow,version:'legacy'}),err('invalid_control_state'));
});

test('aggregate UTF-8/JSON prose and full review budgets stop before mutation and preserve a finalizable history',()=>{
  let {workflow}=fixture();
  const verbose=command('keep_open','repair',[ID.event],{reason:'界'.repeat(1500),instruction:'界'.repeat(3000),expectedResult:'界'.repeat(1500)});
  workflow=apply(workflow,verbose);
  const before=structuredClone(workflow),size=controlWorkflowReviewSize(workflow);
  assert.ok(size.newProseBytes<=24000);assert.ok(size.reviewContributionBytes<=64000);
  assert.throws(()=>apply(workflow,verbose),err('control_context_limit'));
  assert.deepEqual(workflow,before,'Rejected work must not consume a receipt or append a partial event');
  const report=validateControlSubmission(workflow,null,{text:'界'.repeat(6000),statuses:[
    {issueId:'repair',status:'pending',evidenceSourceIds:[ID.event]},
    {issueId:'complaint',status:'pending',evidenceSourceIds:[ID.event]},
  ]});assert.equal(report.valid,true);
  const {workflow:empty}=fixture();
  const escaped=command('keep_open','repair',[ID.event],{reason:'\u0001'.repeat(2000),instruction:'\u0001'.repeat(4000),expectedResult:'\u0001'.repeat(2000)});
  assert.throws(()=>apply(empty,escaped),err('control_context_limit'),'Count JSON escaping, not just JavaScript character length');
});

test('review-only student records reference the complete journal while public records retain their text',()=>{
  let {workflow}=fixture();const text='UNABRIDGED REQUEST TEXT';workflow=apply(workflow,command('request_evidence','repair',[ID.event],{instruction:text}));
  const publicSources=controlWorkflowSources(workflow,null,'ru'),reviewSources=controlWorkflowSources(workflow,null,'ru',{review:true});
  const student=workflow.materials.find(m=>m.provenance.kind==='student-action');
  assert.ok(publicSources.find(m=>m.id===student.id).text.includes(text));
  assert.equal(reviewSources.find(m=>m.id===student.id).text.includes(text),false);
  assert.ok(reviewSources.find(m=>m.id===student.id).text.includes(student.eventId));
  for(const source of workflow.materials.filter(m=>m.provenance.kind!=='student-action'))assert.equal(
    reviewSources.find(m=>m.id===source.id).text,publicSources.find(m=>m.id===source.id).text,'Never shorten decisive authored evidence');
});

test('closure notification must concern the same verified result cited for completion',()=>{
  const f=fixture({initialResolved:true}),definition=f.profile.control.workflow,second='workflow-repair-second';
  definition.issues[0].responseMaterialId=second;definition.issues[0].evidenceMaterialIds.push(second);
  definition.materials.push({...structuredClone(definition.materials.find(m=>m.id===ID.repair)),id:second});
  let s=createControlWorkflow({...f,timestamp:1000});
  s=apply(s,command('verify','repair',[ID.repair]));
  s=apply(s,command('request_evidence'));
  s=apply(s,command('verify','repair',[second]));
  s=apply(s,command('notify','repair',[ID.repair]));
  s=apply(s,command('close','repair',[second]));
  assert.equal(result(s),'closure_notice_required');
  s=apply(s,command('notify','repair',[second]));s=apply(s,command('close','repair',[second]));
  assert.equal(result(s),'closed');
});

test('a receipt cannot be reassigned to a different otherwise competent recipient',()=>{
  const f=fixture();f.profile.control.workflow.issues[1].acceptedRecipientSets.push(['duty-service']);
  let s=createControlWorkflow({...f,timestamp:1000});s=apply(s,command('request_evidence','complaint'));
  s=apply(s,command('refer','complaint',[ID.receipt],{recipientIds:['duty-service']}));
  assert.equal(result(s),'receipt_recipient_mismatch');assert.notEqual(issue(s,'complaint').status,'referred');
  s=apply(s,command('refer','complaint',[ID.receipt]));assert.equal(result(s),'referred');
  const current=controlReviewContext(s,null,'ru').issues.find(row=>row.id==='complaint');
  assert.deepEqual(current.acceptedRecipientSets,[['independent-review'],['duty-service']]);
  assert.ok(current.recipientNames.every(set=>set.every(name=>name.length)));
  assert.equal(JSON.stringify(publicControlWorkflow(s)).includes('acceptedRecipientSets'),false);
});
