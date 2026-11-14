import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecutionQA,executionQAIdentity,executionQAAction} from '../../../scripts/reception-execution-qa.mjs';
import {ReceptionError} from './schema.mjs';
import {explicitQAReview} from '../../../scripts/reception-correspondence-qa-cases.mjs';

const err=code=>error=>error.code===code;
const begin=async h=>h.decide(await h.open(await h.start()));
const issue=(view,id)=>view.controlWorkflow.issues.find(row=>row.id===id);
const original=(view,id)=>issue(view,id).materialIds[0];
const state=async(h,view)=>(await h.store.get('sessions/'+view.id)).caseStates[0];
const submit=async(h,view,control,requestId='final-'+view.revision)=>(await h.service.handle({op:'followup',sessionId:view.id,requestId,expectedRevision:view.revision,control},executionQAIdentity)).view;

test('execution service separates receipt, verification, notification and scoped closure; final AI sees the actual work',async()=>{
  const contexts=[],h=await createExecutionQA({assertContext:ctx=>contexts.push(ctx)});
  let view=await begin(h);
  assert.equal(view.controlVersion,'execution-v1');assert.equal(view.status,'followup');
  const [repair,complaint]=h.profile.control.workflow.issues;
  assert.equal(view.controlWorkflow.plannedOrders[0].issueId,complaint.id);
  const initial=(await state(h,view)).correspondenceInitialFeedback;
  assert.equal(JSON.stringify(view).includes('acceptedRecipientSets'),false);
  view=await h.apply(view,executionQAAction(h.profile,'request_evidence',complaint.id,[original(view,complaint.id)]));
  assert.equal(view.controlWorkflow.journal.at(-1).outcome,'request_received');
  assert.ok(view.correspondenceSources.some(row=>row.id===complaint.responseMaterialId));
  assert.equal(issue(view,complaint.id).status,'awaiting');
  view=await h.apply(view,executionQAAction(h.profile,'close',complaint.id,[complaint.responseMaterialId]));
  assert.equal(view.controlWorkflow.journal.at(-1).accepted,false);
  view=await h.apply(view,executionQAAction(h.profile,'verify',complaint.id,[complaint.responseMaterialId]));
  assert.equal(issue(view,complaint.id).status,'ready');
  view=await h.apply(view,executionQAAction(h.profile,'notify',complaint.id,[complaint.responseMaterialId]));
  assert.equal(issue(view,complaint.id).notified,true);
  view=await h.apply(view,executionQAAction(h.profile,'close',complaint.id,[complaint.responseMaterialId]));
  assert.equal(issue(view,complaint.id).status,'closed');
  assert.notEqual(issue(view,repair.id).status,'closed','The other matter was not silently completed');
  view=await h.apply(view,executionQAAction(h.profile,'keep_open',repair.id,[original(view,repair.id)]));
  const control={text:'По жалобе получен и проверен самостоятельный результат; заявительница уведомлена. По дорожке сохраняется контроль до завершения отдельной проверки. Ремонт и оценка прежнего ответа не подменяют друг друга.',
    statuses:[{issueId:complaint.id,status:'resolved',evidenceSourceIds:[complaint.responseMaterialId]},
      {issueId:repair.id,status:'pending',evidenceSourceIds:[original(view,repair.id)]}]};
  view=await submit(h,view,control);
  assert.equal(view.status,'review');assert.deepEqual((await state(h,view)).correspondenceInitialFeedback,initial);
  assert.equal(contexts.length,2);const review=contexts[1];
  assert.equal(review.execution.version,'execution-v1');
  assert.equal(review.profile.control.expectedStatuses,undefined,'Old static answer is not passed as the current execution key');
  assert.equal(review.profile.control.workflow,undefined,'Future profile materials are not copied into review');
  assert.ok(review.sections.execution.includes('Сопоставить представленный материал'));
  assert.equal(review.execution.issues.find(row=>row.id===complaint.id).allowedStatuses[0],'resolved');
  const before=view.controlWorkflow;
  view=(await h.service.handle({op:'next',sessionId:view.id,requestId:'finish'},executionQAIdentity)).view;
  assert.equal(view.status,'complete');assert.deepEqual(view.result.cases[0].controlWorkflow,before);
  assert.deepEqual(view.result.cases[0].control,control);
});

test('an unsupported final closure is editable, uncharged and cannot manufacture a zero or invoke AI',async()=>{
  const contexts=[],h=await createExecutionQA({assertContext:ctx=>contexts.push(ctx)});
  let view=await begin(h);
  const control={text:'Исполнение всех вопросов подтверждено.',statuses:view.controlWorkflow.issues.map(row=>({issueId:row.id,status:'resolved',evidenceSourceIds:[row.materialIds[0]]}))};
  view=await submit(h,view,control,'unsupported-final');
  assert.equal(view.status,'followup');assert.equal(view.feedback,null);assert.equal(view.control,null);
  assert.deepEqual(view.draftControl,control);assert.equal(view.controlValidation.valid,false);
  assert.ok(view.controlValidation.findings.some(row=>row.code==='closure_not_verified'));
  assert.equal(view.controlValidation.expectedStatuses,undefined);assert.equal(contexts.length,1);
  const saved=await h.store.get('sessions/'+view.id);assert.equal(saved.results.length,0);assert.equal(saved.lease,null);
  const fixed={text:'Материалы ещё не дают основания завершить проверку; запрашиваем подтверждения и сохраняем раздельный контроль.',
    statuses:view.controlWorkflow.issues.map(row=>({issueId:row.id,status:'pending',evidenceSourceIds:[row.materialIds[0]]}))};
  view=await submit(h,view,fixed);
  assert.equal(view.status,'review');assert.equal(contexts.length,2);
});

test('control action API is idempotent, revision-safe, owner-bound and resumes the same frozen history',async()=>{
  const h=await createExecutionQA();let view=await begin(h);
  const target=h.profile.control.workflow.issues[1];
  const body={op:'control-action',sessionId:view.id,requestId:'stable-action',expectedRevision:view.revision,
    action:executionQAAction(h.profile,'request_evidence',target.id,[original(view,target.id)])};
  view=(await h.service.handle(body,executionQAIdentity)).view;
  const repeated=(await h.service.handle(body,executionQAIdentity)).view;
  assert.equal(repeated.revision,view.revision);assert.deepEqual(repeated.controlWorkflow,view.controlWorkflow);
  await assert.rejects(h.service.handle({...body,action:{...body.action,reason:'Иное основание'}},executionQAIdentity),err('request_conflict'));
  await assert.rejects(h.service.handle({...body,requestId:'stale'},executionQAIdentity),err('revision_conflict'));
  await assert.rejects(h.service.handle({...body,requestId:'other-owner'},{uid:'other',studentKey:'87654321'}),err('forbidden'));
  const recovered=(await h.service.handle({op:'recover',mode:'training',decisionVersion:'correspondence-v1'},executionQAIdentity)).view;
  assert.equal(recovered.id,view.id);assert.deepEqual(recovered.controlWorkflow,view.controlWorkflow);
  const resumed=(await h.service.handle({op:'resume',sessionId:view.id},executionQAIdentity)).view;
  assert.deepEqual(resumed.controlActionReceipt,view.controlActionReceipt);
  await assert.rejects(h.service.handle({...body,requestId:'forged-material',expectedRevision:view.revision,
    action:{...body.action,materials:[{verification:'confirmation'}]}},executionQAIdentity),err('invalid_control_action'));
});

test('existing correspondence sessions retain static control and cannot be silently upgraded by a new action',async()=>{
  const h=await createExecutionQA();let view=await h.start({controlVersion:null});view=await h.decide(await h.open(view));
  assert.equal(view.controlVersion,undefined);assert.equal(view.controlWorkflow,undefined);
  await assert.rejects(h.service.handle({op:'control-action',sessionId:view.id,requestId:'upgrade',expectedRevision:view.revision,
    action:{}},executionQAIdentity),err('invalid_control_version'));
  const resumed=(await h.service.handle({op:'resume',sessionId:view.id},executionQAIdentity)).view;
  assert.equal(resumed.controlWorkflow,undefined);assert.equal(resumed.followup.control,true);
});

test('review outage preserves both final draft and execution journal for a safe retry',async()=>{
  const h=await createExecutionQA({reviews:[ctx=>explicitQAReview(ctx),()=>{throw new ReceptionError('review_unavailable',503);},ctx=>explicitQAReview(ctx)]});
  let view=await begin(h);
  const control={text:'Оставить вопросы на контроле, запросить относимые подтверждения и оценить их по каждому предмету.',
    statuses:view.controlWorkflow.issues.map(row=>({issueId:row.id,status:'pending',evidenceSourceIds:[row.materialIds[0]]}))};
  const body={op:'followup',sessionId:view.id,requestId:'retry-review',expectedRevision:view.revision,control};
  await assert.rejects(h.service.handle(body,executionQAIdentity),err('review_unavailable'));
  const resumed=(await h.service.handle({op:'resume',sessionId:view.id},executionQAIdentity)).view;
  assert.deepEqual(resumed.draftControl,control);assert.deepEqual(resumed.controlWorkflow,view.controlWorkflow);
  assert.equal(resumed.status,'followup');assert.equal(resumed.control,null);
  view=(await h.service.handle(body,executionQAIdentity)).view;assert.equal(view.status,'review');
});

test('a capacity rejection is atomic and preserves enough room to assess a maximum-length final memorandum',async()=>{
  const boundedReview=context=>{
    const review=explicitQAReview(context);
    for(const criterion of review.criteria)for(const finding of criterion.findings)finding.quote=finding.quote.slice(0,300);
    return review;
  };
  const contexts=[],h=await createExecutionQA({reviews:[boundedReview,boundedReview],assertContext:context=>contexts.push(context)});
  let view=await begin(h),accepted=0,rejected=false;
  const target=view.controlWorkflow.issues[0];
  for(let index=0;index<8;index++){
    const before=await h.store.get('sessions/'+view.id);
    try{
      view=await h.apply(view,executionQAAction(h.profile,'keep_open',target.id,[original(view,target.id)],{
        reason:'界'.repeat(1500),instruction:'界'.repeat(2000),expectedResult:'界'.repeat(1000),
      }),'capacity-'+index);accepted++;
    }catch(error){
      assert.equal(error.code,'control_context_limit');
      assert.deepEqual(await h.store.get('sessions/'+view.id),before,'A rejected action must not alter the saved history');
      rejected=true;break;
    }
  }
  assert.ok(accepted>0&&rejected);
  const control={text:'\u0001'.repeat(6000),statuses:view.controlWorkflow.issues.map(row=>({issueId:row.id,status:'pending',evidenceSourceIds:[row.materialIds[0]]}))};
  view=await submit(h,view,control);assert.equal(view.status,'review');
  assert.ok(Buffer.byteLength(JSON.stringify(contexts.at(-1)),'utf8')<=240000);
  assert.equal(contexts.at(-1).sections.control.length,6000);
});
