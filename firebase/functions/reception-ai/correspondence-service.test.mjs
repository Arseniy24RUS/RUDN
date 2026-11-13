import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createReceptionService} from './service.mjs';
import {createMemoryStore} from './store.mjs';
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
