import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createReceptionService} from './service.mjs';
import {createMemoryStore} from './store.mjs';
import {resolveReceptionIdentity} from './firebase.mjs';
import {validateCase} from './schema.mjs';
import {DECISION_VERSION} from './correspondence.mjs';
import {ROUTING_RECIPIENTS} from './routing-cases.mjs';
import {createSyntheticReceptionCases} from '../../../scripts/reception-ai-qa-cases.mjs';
import {createScriptedCorrespondenceReviewer} from '../../../scripts/reception-correspondence-test-reviewer.mjs';

// This service fixture uses the actual authored story and evidence but is NOT
// represented as a download of the private production catalogue.
const T=text=>({ru:text,en:text,zh:text});
const identity={uid:'correspondence-test',studentKey:'12345678'};
const err=code=>error=>error.code===code;
async function fixture(){
  const source=JSON.parse(await readFile(new URL('../../../site/apps/reception/content/cases/several-repair-and-complaint.json',import.meta.url),'utf8')).template;
  const c=createSyntheticReceptionCases()[2];c.id=source.id;c.familyId='several-issues';
  c.public.title=T(source.title);c.public.opening=T(source.opening);c.public.role={title:T(source.role.title),text:T(source.role.text)};
  c.public.citizen.name=T(source.citizen.name);
  c.public.date='2026-11-12';
  const dates={observed:'09.11.2026',sent:'10.11.2026',received:'11.11.2026',registered:'12.11.2026'};
  c.facts=source.questions.map(q=>({id:q.id,text:T(q.fact),initial:true,knowledge:'direct',
    documentIds:source.documents.filter(doc=>doc.text===q.fact).map(doc=>doc.id)}));
  c.documents=source.documents.map(doc=>({id:doc.id,title:T(doc.title),type:T(doc.type),
    text:T(doc.text.replace(/\{\{(\w+)\}\}/g,(_all,key)=>dates[key]||key)),initial:true,
    factIds:source.questions.filter(q=>q.fact===doc.text).map(q=>q.id)}));
  c.public.actions=source.actions.map(action=>({id:action.id,label:T(action.title)}));
  c.rubric.requiredActionIds=source.actions.filter(action=>action.good).map(action=>action.id);
  c.rubric.forbiddenActionIds=source.actions.filter(action=>!action.good).map(action=>action.id);
  c.rubric.criticalActionIds=['b1'];c.rubric.requiredFactIds=source.questions.filter(q=>q.essential).map(q=>q.id);
  c.rubric.evidenceGroups=[['d1','d2']];c.rubric.explanation=T(source.factTask.explain);
  c.rubric.legal={number:'59',articles:['8']};c.rubric.deadline='2026-11-19';
  const r=c.rubric.authored;
  r.evidenceSets=[['d1','d2']];r.order=source.order;r.rightsAction=source.rightsAction;
  r.criticalRules=source.criticalRules.map(({id,kind,knownQuestion})=>({id,kind,...(knownQuestion?{knownQuestion}:{})}));
  r.decisionPlans=[{id:'two-issues',routes:c.rubric.routeIds,requiredActions:c.rubric.requiredActionIds,order:source.order}];
  r.calendar={anchor:'registered',rule:'calendar7',start:'exclude_anchor',acceptedShifts:['no_shift']};
  c.public.assessment.calendar.events=[
    {id:'sent',label:T('Отправлено'),date:'2026-11-10'},
    {id:'received',label:T('Поступило'),date:'2026-11-11'},
    {id:'registered',label:T('Зарегистрировано'),date:'2026-11-12'},
  ];
  c.followup={intro:T(source.followup.intro),options:source.followup.options.map(o=>({id:o.id,label:T(o.text)})),
    correct:source.followup.correct,explanation:T(source.followup.explain),success:T(source.followup.success),failure:T(source.followup.failure)};
  return validateCase(c);
}
const profile={
  issues:[{id:'repair',title:'Восстановление дорожки'},{id:'complaint',title:'Проверка прежнего ответа'}],
  acceptedKinds:['reply','internal'],criticalRules:[{id:'b1',description:'Не передавать окончательное рассмотрение И-7.'}],
  control:{expectedStatuses:[{issueId:'repair',allowedStatuses:['resolved']},{issueId:'complaint',allowedStatuses:['pending']}],
    criticalRules:[{id:'close-complaint',description:'Ремонт не завершает проверку прежнего ответа.'}]},
};
const profiles={private:()=>structuredClone(profile),public:c=>({version:1,caseId:c.id,kind:'reply',title:'Проект по делу',
  issues:profile.issues.map(({id,title})=>({id,title})),sections:{facts:'Обстоятельства',legalBasis:'Правовые основания',resolution:'Решение',nextSteps:'Контроль'}})};
const letter=()=>({version:1,kind:'reply',subject:'О восстановлении дорожки и проверке прежнего ответа',
  sections:{
    facts:'В письме поставлены два вопроса: восстановление дорожки и достоверность ответа И-7. Материалы показывают отсутствие ремонта на указанную дату. Причины и ответственность пока не установлены.',
    legalBasis:'Окончательное рассмотрение жалобы нельзя поручать И-7, чьи действия обжалуются. Получение его пояснений допустимо.',
    resolution:'Рассмотреть просьбу о ремонте и жалобу раздельно. Запросить документы о выполненных работах и пояснения И-7 для независимой проверки.',
    nextSteps:'Сохранить отдельный контроль по двум вопросам. О результатах проверки сообщить заявительнице. Выполнение ремонта проверить по подтверждающим материалам.',
  },citations:[],orders:[]});
function explicitReview(context,{initialLevel=4,controlLevel=4}={}){
  return {version:1,phase:context.phase,criteria:context.criteria.map(row=>{
    const level=Math.min(context.phase==='initial'?initialLevel:controlLevel,row.maxLevel);
    const section=context.phase==='initial'?row.id:row.id==='status'?'statuses':'control';
    return {id:row.id,level,reason:'Заданный результат локальной проверки.',findings:[
      ...(level?[{type:'supported',section,quote:context.sections[section],sourceIds:[row.eligibleEvidenceIds[0]||'case-author-explanation'],explanation:'Содержательное соответствие в сценарии теста.'}]:[]),
      ...(level<4?[{type:'missing',section,quote:'',sourceIds:['case-author-explanation'],explanation:'Заданный тестом содержательный пропуск.'}]:[]),
    ]};
  }),criticalErrors:[],summary:'Локальная проверка контракта. Не оценка реальной моделью.'};
}
async function harness(reviews,options={}){
  const c=await fixture(),store=options.store||createMemoryStore();
  const reviewer=createScriptedCorrespondenceReviewer({reviews,assertContext:options.assertContext});
  const provider={...reviewer,name:'mock',generate:async()=>{throw Error('This fixture has no model dialogue');}};
  const service=createReceptionService({store,cases:[c],provider,correspondenceProfiles:profiles,...options});
  const start=async()=> (await service.handle({op:'start',mode:'training',locale:'ru',requestId:'start',decisionVersion:DECISION_VERSION,workbookVersion:2},identity)).view;
  const open=async view=> {
    let current=view;
    for(const documentId of ['d1','d2','d0'])current=(await service.handle({op:'document',sessionId:view.id,documentId,requestId:'open-'+documentId},identity)).view;
    return current;
  };
  const decision={deadline:c.rubric.deadline,workbook:{referralDeadline:'',registrationTimely:true,routing:{recipientIds:ROUTING_RECIPIENTS[c.id][0]}},correspondence:letter()};
  decision.correspondence.citations=[
    {id:'letter',kind:'document',section:'facts',sourceId:'d1',quote:c.documents.find(doc=>doc.id==='d1').text.ru},
    {id:'record',kind:'document',section:'facts',sourceId:'d2',quote:c.documents.find(doc=>doc.id==='d2').text.ru},
  ];
  return {c,store,reviewer,service,start,open,decision};
}
const control={text:'Дорожка восстановлена, этот результат зафиксирован. Самостоятельного решения по жалобе нет. Жалобу оставляем на контроле и запрашиваем результат независимого рассмотрения.',
  statuses:[{issueId:'repair',status:'resolved',evidenceSourceIds:['followup']},{issueId:'complaint',status:'pending',evidenceSourceIds:['followup']}]};
async function addPinnedLegalCitation(decision){
  const index=JSON.parse(await readFile(new URL('./correspondence-corpus/index.json',import.meta.url),'utf8'));
  const source=index.documents.find(row=>row.id==='reception-law59999');
  const law=JSON.parse(gunzipSync(await readFile(new URL('./correspondence-corpus/'+source.file,import.meta.url))));
  const unit=law.units.find(row=>row.text.includes('Запрещается направлять жалобу'));
  assert.ok(unit);
  decision.correspondence.citations.push({id:'law',section:'legalBasis',kind:'legal',sourceId:law.id,unitIds:[unit.id],quote:unit.text});
}

test('complete real-story workflow: citations, pinned law, initial decision, free control and immutable export',async()=>{
  const contexts=[],h=await harness([context=>explicitReview(context),context=>explicitReview(context,{controlLevel:2})],{assertContext:context=>contexts.push(context)});
  let view=await h.open(await h.start());
  assert.equal(view.decisionVersion,DECISION_VERSION);assert.equal(view.case.assessment,undefined);
  assert.equal(view.followup,null);assert.equal(view.feedback,null);
  assert.equal(view.correspondenceSources.some(row=>row.id==='d2'),true);
  await addPinnedLegalCitation(h.decision);
  const request={op:'decide',sessionId:view.id,requestId:'decision',decision:h.decision};
  view=(await h.service.handle(request,identity)).view;
  assert.equal(view.status,'followup');assert.equal(view.followup.control,true);assert.equal(view.followup.options,undefined);
  assert.equal(view.decision.correspondence.citations.length,3);
  assert.equal(contexts[0].frozenCase.deadline,'2026-11-19');
  assert.equal(contexts[0].newInformation,null);
  assert.ok(contexts[0].resolvedCitations.find(row=>row.id==='law').contentSha256);
  const committed=(await h.store.get('sessions/'+view.id)).correspondenceInitialFeedback;
  assert.equal(committed,undefined,'Scores belong to their case state');
  const initial=(await h.store.get('sessions/'+view.id)).caseStates[0].correspondenceInitialFeedback;
  assert.equal(initial.score,100);
  await h.service.handle(request,identity);assert.equal(h.reviewer.reviewCalls,1,'A duplicate must not incur a new review');
  view=(await h.service.handle({op:'followup',sessionId:view.id,requestId:'control',control},identity)).view;
  assert.equal(view.status,'review');assert.equal(view.feedback.correspondence.initialScore,100);
  assert.equal(view.feedback.correspondence.controlScore,50);assert.equal(view.feedback.score,90);
  assert.equal(contexts[1].initialScore,100);
  assert.equal((await h.store.get('sessions/'+view.id)).caseStates[0].correspondenceInitialFeedback.score,100);
  view=(await h.service.handle({op:'next',sessionId:view.id,requestId:'finish'},identity)).view;
  assert.equal(view.result.points,4.5);
  const row=view.result.cases[0];
  assert.equal(row.caseInfo.citizen.name,'Мария Викторовна');
  assert.equal(row.caseInfo.id,h.c.id);assert.equal(row.caseInfo.assessment,undefined);
  assert.equal(row.correspondenceProfile.issues.length,2);
  assert.equal(row.correspondenceSources.some(source=>source.id==='followup'),true);
});

test('new correspondence preserves the current seminar allocation, sequential referral calendar and one-point completion',async()=>{
  const contexts=[],h=await harness([context=>explicitReview(context),context=>explicitReview(context)],{
    requireGameplay:true,assertContext:context=>contexts.push(context),
  });
  let view=(await h.service.handle({op:'start',mode:'independent',context:'seminar',locale:'ru',requestId:'seminar-start',
    decisionVersion:DECISION_VERSION,workbookVersion:2},identity)).view;
  assert.equal(view.context,'seminar');assert.equal(view.caseCount,1);
  assert.equal(view.case.procedureRequired,false);
  assert.ok(view.case.normativeActs.length);
  assert.ok(view.documents.every(document=>document.chatAttachment===false));
  assert.equal(view.case.workbook.events.some(event=>event.id==='recipientRegistered'),false);
  assert.deepEqual(view.case.workbook.targets.map(({id,anchorId})=>[id,anchorId]),[['referral','registered'],['deadline','referral']]);
  view=await h.open(view);
  h.decision.deadline='2026-12-19';h.decision.workbook.referralDeadline='2026-11-19';
  assert.equal(h.decision.workbook.legalCitation,undefined,'The new letter does not demand the old single-citation field');
  await addPinnedLegalCitation(h.decision);
  view=(await h.service.handle({op:'decide',sessionId:view.id,requestId:'seminar-letter',decision:h.decision},identity)).view;
  assert.equal(contexts[0].frozenCase.deadline,'2026-12-19');
  assert.equal(contexts[0].frozenCase.authoredDeadline,'2026-11-19');
  assert.equal(contexts[0].frozenCase.calendarEvents.some(event=>event.id==='recipientRegistered'),false);
  assert.equal(contexts[0].frozenCase.calendarTargets.find(target=>target.id==='deadline').anchorId,'referral');
  assert.equal(contexts[0].operational.workbook.calendar.expected.referral,'2026-11-19');
  view=(await h.service.handle({op:'followup',sessionId:view.id,requestId:'seminar-control',control},identity)).view;
  assert.equal(view.feedback,null,'Independent seminar feedback stays private until completion');
  assert.equal(contexts[1].frozenCase.deadline,'2026-12-19');
  const finish={op:'next',sessionId:view.id,requestId:'seminar-finish'};
  view=(await h.service.handle(finish,identity)).view;
  assert.equal(view.result.total,100);assert.equal(view.result.points,1);
  assert.equal(view.result.seminarPoints,1);assert.equal(view.result.remainingCases,0);
  assert.equal(view.result.cases[0].caseInfo.workbook.events.some(event=>event.id==='recipientRegistered'),false);
  assert.equal(view.result.cases[0].caseInfo.workbook.targets.find(target=>target.id==='deadline').anchorId,'referral');
  assert.equal((await h.service.handle(finish,identity)).view.result.seminarPoints,1);
  await assert.rejects(h.service.handle({op:'start',mode:'independent',context:'seminar',locale:'ru',requestId:'seminar-again',
    decisionVersion:DECISION_VERSION,workbookVersion:2},identity),err('case_bank_exhausted'));
});

test('review outage preserves the draft and exact request can retry without a zero or duplicate result',async()=>{
  const h=await harness([()=>{throw Error('Simulated outage');},context=>explicitReview(context)]);
  const view=await h.open(await h.start());
  const request={op:'decide',sessionId:view.id,requestId:'retry-me',decision:h.decision};
  await assert.rejects(h.service.handle(request,identity),err('review_unavailable'));
  let stored=await h.store.get('sessions/'+view.id);
  assert.equal(stored.status,'active');assert.equal(stored.caseStates[0].decision,null);
  assert.equal(stored.results.length,0);assert.equal(stored.caseStates[0].correspondenceDraft.correspondence.subject,h.decision.correspondence.subject);
  const resumed=(await h.service.handle({op:'resume',sessionId:view.id},identity)).view;
  assert.equal(resumed.reviewPending.status,'retry');assert.equal(resumed.draftDecision.correspondence.subject,h.decision.correspondence.subject);
  const changed=structuredClone(request);changed.decision.correspondence.subject+=' Changed';
  await assert.rejects(h.service.handle(changed,identity),err('request_conflict'));
  assert.equal((await h.service.handle(request,identity)).view.status,'followup');
  await h.service.handle(request,identity);assert.equal(h.reviewer.reviewCalls,2);
  stored=await h.store.get('sessions/'+view.id);
  assert.equal(stored.requests['retry-me'].attempt,2);
  assert.equal(stored.caseStates[0].reviewPending,null);
});

test('one in-flight decision owns the lease; a parallel duplicate does not call the reviewer twice',async()=>{
  let release,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const h=await harness([async context=>{started();await new Promise(resolve=>{release=resolve;});return explicitReview(context);}]);
  const view=await h.open(await h.start()),request={op:'decide',sessionId:view.id,requestId:'parallel',decision:h.decision};
  const first=h.service.handle(request,identity);await ready;
  await assert.rejects(h.service.handle(request,identity),err('busy'));
  release();await first;await h.service.handle(request,identity);
  assert.equal(h.reviewer.reviewCalls,1);
});

test('forged evidence and legacy downgrade cannot create a grade',async()=>{
  const h=await harness([context=>explicitReview(context)]),view=await h.open(await h.start());
  const altered=structuredClone(h.decision);altered.correspondence.citations[0].quote='Несуществующая цитата';
  await assert.rejects(h.service.handle({op:'decide',sessionId:view.id,requestId:'forged',decision:altered},identity),err('invalid_citation'));
  const old={procedureId:'qa-procedure',routeId:'qa-office',actionIds:[],law:{number:'59',article:'8'},deadline:'2026-11-19',basisDocumentIds:[],reasoning:'',workbook:h.decision.workbook};
  await assert.rejects(h.service.handle({op:'decide',sessionId:view.id,requestId:'downgrade',decision:old},identity),err('invalid_correspondence'));
  assert.equal(h.reviewer.reviewCalls,0);
  assert.equal((await h.store.get('sessions/'+view.id)).results.length,0);
});


const guestIdentity = {uid:'anonymous-reception-browser',guest:true};
const guestStart = (service, requestId, actor=guestIdentity) => service.handle({
  op:'start',context:'free',mode:'training',locale:'ru',workbookVersion:2,decisionVersion:DECISION_VERSION,requestId,
},actor);

test('the verified anonymous identity only resolves free-play guests and their own session',async()=>{
  const store=createMemoryStore(),uid=guestIdentity.uid;
  const env={store,db:{ref:()=>{throw Error('Guest auth never resolves a student profile')}}};
  const token={uid,firebase:{sign_in_provider:'anonymous'}};
  const free={op:'catalog',context:'free'};
  assert.deepEqual(await resolveReceptionIdentity(free,token,env),guestIdentity);
  await assert.rejects(resolveReceptionIdentity({...free,context:'seminar'},token,env),err('profile_required'));
  await assert.rejects(resolveReceptionIdentity(free,{uid,firebase:{sign_in_provider:'password'}},env),err('profile_required'));
  const sessionId='a'.repeat(40);
  const request={op:'resume',sessionId};
  const record={owner:`guest:${uid}`,guest:true,context:'free',mode:'training'};
  await store.transaction('sessions/'+sessionId,()=>record);
  assert.deepEqual(await resolveReceptionIdentity(request,token,env),guestIdentity);
  await assert.rejects(resolveReceptionIdentity(request,{...token,uid:'some-other-browser'},env),err('forbidden'));
  await assert.rejects(resolveReceptionIdentity(request,{...token,firebase:{sign_in_provider:'password'}},env),err('forbidden'));
  await assert.rejects(resolveReceptionIdentity({...request,studentKey:identity.studentKey},token,env),err('forbidden'));
  await store.transaction('sessions/'+sessionId,()=>({...record,context:'seminar'}));
  await assert.rejects(resolveReceptionIdentity(request,token,env),err('forbidden'));
});

test('guest play journals neither review stage nor completed score, stays separate from the signed-in profile',async()=>{
  const h=await harness([explicitReview,explicitReview]);
  let journalWrites=0;
  const provider={name:'openai', reviewDecision:async({context})=>({review:explicitReview(context),verified:true,usage:{inputTokens:100,outputTokens:20}}),
    generate:async()=>({reply:'Документы у вас.',revealedFactIds:[],releasedDocumentIds:[],usage:{inputTokens:100,outputTokens:20}})};
  const service=createReceptionService({store:h.store,cases:[h.c],provider,correspondenceProfiles:profiles,requireGameplay:true,
    saveResult:()=>{journalWrites++;}});
  const handle=(body,actor=guestIdentity)=>service.handle(body,actor);
  const {cases}=await handle({op:'catalog',context:'free',locale:'zh',workbookVersion:2,decisionVersion:DECISION_VERSION});
  assert.equal(cases[0].id,h.c.id);
  for(const request of [{op:'start',context:'seminar',mode:'training'},{op:'start',context:'free',mode:'independent'},
    {op:'recover',context:'seminar',mode:'training'},{op:'catalog',context:'free',studentKey:identity.studentKey}]) {
    await assert.rejects(handle(request),err('forbidden'));
  }
  let {view}=await guestStart(service,'guest-start');
  const sessionId=view.id;
  assert.deepEqual((await handle({op:'recover',context:'free',mode:'training'})).view,view);
  assert.equal((await handle({op:'recover',context:'free',mode:'training'},identity)).view,null);
  for(const actor of [identity,{...guestIdentity,guest:false,studentKey:identity.studentKey},{...guestIdentity,uid:'another-anonymous-browser'}]){
    await assert.rejects(handle({op:'resume',sessionId},actor),err('forbidden'));
  }
  await assert.rejects(handle({op:'resume',context:'seminar',sessionId}),err('outdated_session'));
  view=(await handle({op:'message',sessionId,requestId:'guest-message',expectedRevision:view.revision,text:'Что произошло?'})).view;
  assert.equal(view.messages.at(-1).role,'assistant');
  for(const documentId of ['d1','d2'])view=(await handle({op:'document',sessionId,documentId,requestId:'guest-open-'+documentId})).view;
  const initial={op:'decide',sessionId,requestId:'guest-init',decision:h.decision};
  view=(await handle(initial)).view;
  assert.equal(view.status,'followup');
  assert.equal((await handle(initial)).view.status,'followup');
  view=(await handle({op:'followup',sessionId,requestId:'guest-control',control})).view;
  assert.equal(view.status,'review');
  const finish={op:'next',sessionId,requestId:'guest-complete'};
  view=(await handle(finish)).view;
  assert.equal(view.status,'complete');
  assert.equal(view.result.journalStatus,'local');
  assert.equal(view.result.seminarPoints,undefined);
  assert.deepEqual((await handle(finish)).view.result,view.result);
  assert.equal(journalWrites,0);
  assert.equal(await h.store.get('seminarProgress'),null);
  const ledger=await h.store.get('budget'),receipts=Object.values(ledger.reservations);
  assert.equal(receipts.length,3);
  assert.ok(receipts.every(receipt=>receipt.guest && receipt.settled));
  assert.equal(receipts.filter(receipt=>receipt.review).length,2);
  const total=receipts.reduce((sum,receipt)=>sum+receipt.chargedMicros,0);
  assert.equal(Object.values(ledger.days)[0].guestMicros,total);
  assert.equal(Object.values(ledger.months)[0].guestMicros,total);
});

test('guest starts enforce both concurrent daily caps and preserve idempotency at the cap',async()=>{
  let now=Date.UTC(2026,10,14,12);
  const h=await harness([explicitReview],{clock:()=>now});
  const starts=Array.from({length:5},(_,i)=>guestStart(h.service,'same-browser-'+i));
  const first=await Promise.allSettled(starts);
  assert.equal(first.filter(row=>row.status==='fulfilled').length,3);
  assert.ok(first.filter(row=>row.status==='rejected').every(row=>row.reason.code==='guest_daily_limit'));
  const index=first.findIndex(row=>row.status==='fulfilled');
  assert.equal((await guestStart(h.service,'same-browser-'+index)).view.id,first[index].value.view.id);
  const shared=await Promise.allSettled(Array.from({length:16},(_,i)=>guestStart(h.service,'shared',{uid:'unique-browser-'+i,guest:true})));
  assert.equal(shared.filter(row=>row.status==='fulfilled').length,9);
  assert.ok(shared.filter(row=>row.status==='rejected').every(row=>row.reason.code==='guest_daily_limit'));
  assert.equal((await h.start()).mode,'training','The shared cap does not block a student');
  now+=86400000;
  assert.equal((await guestStart(h.service,'new-day')).view.status,'active');
});

test('the guest model allowance limits concurrent chat independently and releases unused request keys',async()=>{
  const h=await harness([explicitReview]);
  let entered=0, release, notify;
  const active=new Promise(resolve=>notify=resolve);
  const held=new Promise(resolve=>release=resolve);
  const provider={name:'openai',reviewDecision:async()=>{},generate:async()=>{
    if(++entered===2)notify();
    await held;
    return {reply:'Документы у вас.',revealedFactIds:[],releasedDocumentIds:[],usage:{inputTokens:100,outputTokens:20}};
  }};
  const service=createReceptionService({store:h.store,cases:[h.c],provider,correspondenceProfiles:profiles});
  const actor=i=>({uid:'browser-'+i,guest:true});
  const views=(await Promise.all([0,1,2].map(i=>guestStart(service,'start',actor(i))))).map(row=>row.view);
  const body=i=>({op:'message',sessionId:views[i].id,requestId:'message',expectedRevision:views[i].revision,text:'Что произошло?'});
  const first=[0,1].map(i=>service.handle(body(i),actor(i)));
  try{
    await active;
    const during=(await service.handle({op:'resume',sessionId:views[0].id},actor(0))).view;
    assert.equal(during.operationInProgress,true);
    await assert.rejects(service.handle(body(2),actor(2)),err('guest_busy'));
    assert.equal(entered,2);
  }finally{release();await Promise.all(first);}
  const third=(await service.handle(body(2),actor(2))).view;
  assert.equal(third.messages.at(-1).role,'assistant');
  assert.equal(third.operationInProgress,false);
});

test('guest expense caps preserve a validated decision draft before an uncharged review',async()=>{
  for(const [config,code] of [[{guestDailyBudgetMicros:10_000},'guest_daily_limit'],[{guestMonthlyBudgetMicros:10_000},'guest_monthly_limit']]){
    const h=await harness([explicitReview],{config});
    const {view}=await guestStart(h.service,'limited');
    const sessionId=view.id;
    for(const documentId of ['d1','d2'])await h.service.handle({op:'document',sessionId,documentId,requestId:'open-'+documentId},guestIdentity);
    const decision={op:'decide',sessionId,requestId:'quota-review',decision:h.decision};
    await assert.rejects(h.service.handle(decision,guestIdentity),err(code));
    const resumed=(await h.service.handle({op:'resume',sessionId},guestIdentity)).view;
    assert.equal(resumed.draftDecision.correspondence.subject,h.decision.correspondence.subject);
    assert.equal(resumed.operationInProgress,false);
    assert.equal(resumed.reviewPending.code,code);
    assert.equal(h.reviewer.reviewCalls,0);
    assert.equal(await h.store.get('budget'),null);
  }
});
