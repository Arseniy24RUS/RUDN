import test from 'node:test';
import assert from 'node:assert/strict';
import {addCalendarDays, workbookEvents, supportsBasicWorkbook, supportsWorkbook, publicWorkbook, validateWorkbookDecision, evaluateWorkbook} from './workbook.mjs';
import {calculateWorkbookDeadline,workingCalendarDay,WORKBOOK_CALENDAR} from './workbook-calendar.mjs';
import {BUNDLED_CALENDARS} from '../../../site/assets/js/calendar-bundled.js';
import {createReceptionService} from './service.mjs';
import {createMemoryStore} from './store.mjs';
import {validateCase, evaluateDecision, hash} from './schema.mjs';
import {ROUTING_RECIPIENTS} from './routing-cases.mjs';
import {publicRoutingWorkflow} from './routing-workflow.mjs';
import {createSyntheticReceptionCases} from '../../../scripts/reception-ai-qa-cases.mjs';
import {canonicalDecision} from '../../../scripts/reception-ai-qa-helpers.mjs';

// The stories and answer contracts are synthetic; no production dossier or
// private-bank filesystem path is needed to run this suite locally or in CI.
const identity = {uid:'workbook-test', studentKey:'12345678'};
const errorCode = code => error => error.code === code;
function cases() {
  return createSyntheticReceptionCases().map(c => {
    for (const document of c.documents) document.initial = true;
    return validateCase(c);
  });
}
function withDates(c, {sent='2026-11-09', received='2026-11-10', registered='2026-11-11'} = {}) {
  const result = structuredClone(c), dates = {sent,received,registered};
  result.public.assessment.calendar.events = result.public.assessment.calendar.events
    .filter(event => dates[event.id] !== null).map(event => ({...event,date:dates[event.id] || event.date}));
  return result;
}
function decisionFor(c, {referral='2026-11-18', deadline='2026-12-11', registrationTimely=true, recipients=ROUTING_RECIPIENTS[c.id][0]} = {}) {
  return {...canonicalDecision(c), routeId:'', deadline,
    workbook:{referralDeadline:referral,registrationTimely,routing:{recipientIds:[...recipients]}}};
}
function harness({store=createMemoryStore(), catalogue=cases(), providerName='mock', saveResult=null} = {}) {
  const actorInputs = [];
  const service = createReceptionService({store,cases:catalogue,saveResult,clock:()=>Date.parse('2026-11-13T10:00:00Z'),
    provider:{name:providerName,generate:async input => {
      actorInputs.push(input);
      return {reply:'Всё, что я принёс, уже у вас.',revealedFactIds:[],releasedDocumentIds:[],usage:{inputTokens:40,outputTokens:15}};
    }}});
  const handle = async body => (await service.handle(body,identity)).view;
  return {store,service,handle,actorInputs,catalogue,
    start:(more={})=>handle({op:'start',mode:'training',locale:'ru',workbookVersion:1,requestId:'start-workbook',...more})};
}
async function openEvidence(h, view) {
  for (const document of view.documents) {
    view = await h.handle({op:'document',sessionId:view.id,documentId:document.id,requestId:`open-${view.caseIndex}-${document.id}`});
  }
  return view;
}
async function submit(h, view, decision, prefix='submit') {
  view = await h.handle({op:'decide',sessionId:view.id,decision,requestId:`${prefix}-decision`});
  if (view.status === 'followup') {
    const c = h.catalogue.find(row=>row.id === view.case.id);
    view = await h.handle({op:'followup',sessionId:view.id,choiceId:c.followup.correct,requestId:`${prefix}-followup`});
  }
  return view;
}
function noAnswers(view) {
  assert.equal(view.feedback,null);
  assert.equal(view.result,null);
  assert.equal(view.learningReview,null);
  assert.doesNotMatch(JSON.stringify(view), /"(?:rubric|expected|expectedRecipients|correct|wrongDates|criteria|earned|explanation|followupCorrect|actionPlanId)"/);
}

test('calendar-day arithmetic crosses months, leap years and weekends without shifting the last day', () => {
  for (const [date,days,expected] of [
    ['2026-01-30',3,'2026-02-02'],
    [' 30.01.2026 ',3,'2026-02-02'],
    ['2026-11-13',3,'2026-11-16'],
    ['2026-11-11',3,'2026-11-14'], // Saturday stays Saturday.
    ['2026-11-14',7,'2026-11-21'],
    ['2026-01-28',7,'2026-02-04'],
    ['2026-12-28',7,'2027-01-04'],
    ['2026-01-31',30,'2026-03-02'],
    ['2028-01-31',30,'2028-03-01'],
    ['2028-02-27',3,'2028-03-01'],
    ['2028-02-22',7,'2028-02-29'],
    ['2028-02-29',30,'2028-03-30'],
    ['2026-03-20',30,'2026-04-19'], // Calendar days are independent of DST.
    ['2026-12-15',30,'2027-01-14'],
  ]) assert.equal(addCalendarDays(date,days),expected,`${date} + ${days}`);
  for (const [date,days] of [['2026-02-29',3],['2026-04-31',7],['2026-13-01',30],['',7],[null,7],['2026-01-01',1.5],['2026-01-01',NaN],['2026-01-01','3']]) {
    assert.throws(()=>addCalendarDays(date,days),TypeError);
  }
});

test('public workbook has only factual events, two empty answer slots and public correspondence', () => {
  const c=cases()[0], before=structuredClone(c), workbook=publicWorkbook(c);
  assert.deepEqual(Object.keys(workbook).sort(),['events','origin','recipientLimit','registrationCheck','site','targets','version']);
  assert.equal(workbook.version,1);
  assert.equal(workbook.registrationCheck,true);
  assert.deepEqual(workbook.events.map(({id,date,kind})=>({id,date,kind})),[
    {id:'sent',date:'2026-11-09',kind:'sent'},
    {id:'received',date:'2026-11-10',kind:'received'},
    {id:'registered',date:'2026-11-11',kind:'registered'},
  ]);
  assert.deepEqual(workbook.targets.map(target=>Object.keys(target).sort()),[['id','label'],['id','label']]);
  assert.deepEqual(workbook.targets.map(target=>target.id),['referral','deadline']);
  assert.deepEqual(workbook.origin,publicRoutingWorkflow(c.id).origin);
  assert.deepEqual(workbook.site,publicRoutingWorkflow(c.id).site);
  assert.doesNotMatch(JSON.stringify(workbook),/2026-11-18|2026-12-11|rubric|expected|correct|registrationTimely|recipientIds|qa-30|qa-office/);
  assert.deepEqual(c,before,'Publishing the exercise must not rewrite an archived dossier');
});

test('eligibility requires real sent, received and registered dates in every date pack', () => {
  const c=cases()[0];
  assert.equal(supportsBasicWorkbook(c),true);
  for(const rule of ['working1','working3','working5','working7','working10','working15','calendar10','months3']){
    const advanced=structuredClone(c);advanced.rubric.authored.calendar.rule=rule;
    assert.equal(supportsBasicWorkbook(advanced),false,'Special deadlines are outside the basic workbook: '+rule);
  }
  for(const anchor of ['carrier','statement']){const advanced=structuredClone(c);advanced.rubric.authored.calendar.anchor=anchor;assert.equal(supportsBasicWorkbook(advanced),false);}
  for (const id of ['sent','received','registered']) {
    const incomplete=withDates(c,{[id]:null});
    assert.equal(supportsBasicWorkbook(incomplete),false);
    assert.equal(publicWorkbook(incomplete),null);
  }
  const invalid=withDates(c,{registered:'2026-02-29'});
  assert.equal(supportsBasicWorkbook(invalid),false);
  assert.equal(workbookEvents(invalid).length,2);
  assert.equal(supportsBasicWorkbook({...c,id:'unmapped-synthetic-case'}),false);
  assert.equal(supportsBasicWorkbook({...c,dateVariants:[withDates(c,{registered:'2028-02-29'})]}),true);
  assert.equal(supportsBasicWorkbook({...c,dateVariants:[withDates(c,{registered:null})]}),false,
    'A random date-pack selection must never create an unsolvable exercise');
});

test('decision validation rejects forged answer fields and malformed dates, booleans or recipients', () => {
  const valid=decisionFor(cases()[0]).workbook;
  assert.deepEqual(validateWorkbookDecision(valid),valid);
  assert.equal(validateWorkbookDecision({...valid,referralDeadline:' 18.11.2026 '}).referralDeadline,'2026-11-18');
  const empty={referralDeadline:'',registrationTimely:false,routing:{recipientIds:[]}};
  assert.deepEqual(validateWorkbookDecision(empty),empty,'A student may submit a blank date or no recipient and receive no credit');
  for (const value of [
    {...valid,referralDeadline:'2026-02-29'}, {...valid,referralDeadline:18},
    {...valid,registrationTimely:'true'}, {...valid,registrationTimely:null},
    {...valid,routing:{recipientIds:['invented-office']}},
    {...valid,routing:{recipientIds:[valid.routing.recipientIds[0],valid.routing.recipientIds[0]]}},
    {...valid,routing:{recipientIds:[],correct:true}},
    {...valid,expected:{deadline:'2026-12-11'}}, null, [], {},
  ]) assert.throws(()=>validateWorkbookDecision(value),error=>['invalid_decision','invalid_request'].includes(error.code));
  const copy=validateWorkbookDecision(valid); copy.routing.recipientIds.push('fas');
  assert.equal(valid.routing.recipientIds.length,1,'Validation does not retain a caller-owned recipients array');
});

test('calendar credit is independently 8 + 8 + 4 and wrongDates excludes a registration-only error', () => {
  const c=cases()[0], base={score:80,cap:null,criteria:[{id:'other',earned:60,max:80},{id:'calendar',earned:20,max:20}]};
  for (let bits=0;bits<8;bits++) {
    const decision=decisionFor(c,{referral:bits&1?'2026-11-18':'2026-11-19',deadline:bits&2?'2026-12-11':'2026-12-12',registrationTimely:Boolean(bits&4)});
    const feedback=evaluateWorkbook(c,decision,base), earned=(bits&1?8:0)+(bits&2?8:0)+(bits&4?4:0);
    assert.equal(feedback.criteria.find(row=>row.id==='calendar').earned,earned);
    assert.equal(feedback.score,60+earned);
    assert.deepEqual(feedback.workbook.calendar.expected,{referral:'2026-11-18',deadline:'2026-12-11',registrationTimely:true});
    assert.deepEqual(feedback.workbook.calendar.correct,{referral:Boolean(bits&1),deadline:Boolean(bits&2),registrationTimely:Boolean(bits&4)});
    assert.equal(feedback.workbook.calendar.wrongDates,(bits&3)!==3);
  }
  assert.deepEqual(base,{score:80,cap:null,criteria:[{id:'other',earned:60,max:80},{id:'calendar',earned:20,max:20}]});
  assert.equal(evaluateWorkbook(c,decisionFor(c),{...base,cap:40}).score,40,'Regrading the workbook cannot erase an existing score cap');
});

test('v1 removes exact obsolete calculation instructions in all languages without rewriting legal merits or legacy feedback', () => {
  const c=cases()[0], merits={ru:'Сопоставить документы. Специальный срок в правовом источнике — 5 рабочих дней.',en:'Compare the documents. The legal source provides a special period of five working days.',zh:'核对材料。法律依据规定的特别期限为五个工作日。'};
  const footer={
    ru:'Для этого упражнения закреплён профиль исчисления: со следующего дня после исходного события, перенос окончания вперёд, федеральная пятидневная неделя. Не переносите его автоматически на иные процедуры.',
    en:'This exercise uses a fixed calculation profile: start on the day after the initial event, roll the deadline forward, and use the federal five-day week. Do not automatically apply it to other procedures.',
    zh:'本练习采用固定计算规则：从起始事件次日起算，必要时向后顺延截止日，并使用联邦五天工作周。不要自动套用于其他程序。',
  };
  const legacy={criteria:[{id:'calendar',earned:20,max:20}],explanation:Object.fromEntries(Object.entries(merits).map(([locale,text])=>[locale,text+'\n\n'+footer[locale]]))};
  const saved=structuredClone(legacy),result=evaluateWorkbook(c,decisionFor(c),legacy);
  assert.deepEqual(result.explanation,merits);
  assert.deepEqual(legacy,saved,'Only the new feedback copy is transformed');
  assert.deepEqual(evaluateWorkbook(c,decisionFor(c),{...legacy,explanation:merits}).explanation,merits,
    'This is an exact instruction allowlist, not a regex that removes legal deadlines');
  const suffix={
    ru:'Профиль счёта этого упражнения: со следующего дня после события; нерабочее окончание переносится вперёд; федеральная пятидневная неделя.',
    en:'This exercise counts from the day after the event, moves a non-working final day forward, and uses the federal five-day working week.',
    zh:'本练习从事件次日开始计算，截止日为非工作日时向后顺延，采用联邦每周五天工作制。',
  };
  const embedded=Object.fromEntries(Object.entries(merits).map(([locale,text])=>[locale,text+' '+suffix[locale]]));
  assert.deepEqual(evaluateWorkbook(c,decisionFor(c),{...legacy,explanation:embedded}).explanation,merits,
    'A calculation suffix must not remove the substantive paragraph it was appended to');
});

test('registration uses the three-calendar-day boundary and both alternative deadlines use the same registration', () => {
  const original=cases()[0], feedback={criteria:[{id:'calendar',earned:0,max:20}]};
  for (const [registered,timely] of [['2026-11-12',false],['2026-11-13',true],['2026-11-16',true],['2026-11-17',false]]) {
    const c=withDates(original,{sent:'2026-11-12',received:'2026-11-13',registered});
    const result=evaluateWorkbook(c,decisionFor(c),feedback);
    assert.equal(result.workbook.calendar.expected.registrationTimely,timely,registered);
  }
  const c=withDates(original,{sent:'2028-02-25',received:'2028-02-26',registered:'2028-02-29'});
  const result=evaluateWorkbook(c,decisionFor(c,{referral:'2028-03-07',deadline:'2028-03-30'}),feedback);
  assert.deepEqual(result.workbook.calendar.expected,{referral:'2028-03-07',deadline:'2028-03-30',registrationTimely:true});
  assert.equal(result.score,20,'The response date is registration + 30, not referral + 30');
  assert.throws(()=>evaluateWorkbook(withDates(original,{registered:null}),decisionFor(original),feedback),errorCode('invalid_case'));
});

test('new API catalog excludes incomplete cases while the legacy catalog remains available', async () => {
  const [complete,other,variantParent]=cases();
  const incomplete=withDates(other,{registered:null});
  incomplete.rubric.authored.calendar.anchor='received';
  const badVariant=withDates(variantParent,{registered:null});
  badVariant.rubric.authored.calendar.anchor='received';
  const h=harness({catalogue:[complete,incomplete,{...variantParent,dateVariants:[{...badVariant,datePackId:'alternate'}]}]});
  const current=await h.service.handle({op:'catalog',locale:'ru',workbookVersion:1},identity);
  assert.deepEqual(current.cases.map(row=>row.id),[complete.id]);
  assert.deepEqual(Object.keys(current.cases[0]).sort(),['estimatedMinutes','familyId','id','level','title']);
  assert.doesNotMatch(JSON.stringify(current),/rubric|deadline|registered|expected|recipientIds/);
  assert.equal((await h.service.handle({op:'catalog',locale:'ru'},identity)).cases.length,3);
  await assert.rejects(h.start({caseId:incomplete.id}),errorCode('invalid_case'));
  assert.equal(await h.store.get('starts'),null,'An ineligible case must not consume the daily start quota');
  for (const workbookVersion of [0,3,'1',null]) {
    await assert.rejects(h.service.handle({op:'catalog',workbookVersion},identity),errorCode('invalid_workbook'));
    await assert.rejects(h.start({workbookVersion,requestId:`bad-${String(workbookVersion)}`}),errorCode('invalid_workbook'));
  }
});

test('v1 starts are idempotent, persist their version and recover after service restart', async () => {
  const h=harness(), c=h.catalogue[0], view=await h.start({caseId:c.id});
  noAnswers(view);
  assert.equal(view.case.workbook.version,1);
  assert.deepEqual(await h.start({caseId:c.id}),view);
  await assert.rejects(h.start({caseId:c.id,workbookVersion:undefined}),errorCode('request_conflict'));
  const saved=await h.store.get(`sessions/${view.id}`);
  assert.equal(saved.workbookVersion,1);
  assert.equal((await h.store.get(`sessionIndex/${hash('student:'+identity.studentKey)}/entries/${view.id}`)).workbookVersion,1);
  const changedCatalogue=h.catalogue.map(row=>withDates(row,{registered:'2026-12-01'}));
  const restarted=harness({store:h.store,catalogue:changedCatalogue});
  assert.deepEqual(await restarted.handle({op:'recover',mode:'training',workbookVersion:1}),view);
  assert.deepEqual(await restarted.handle({op:'resume',sessionId:view.id,workbookVersion:1}),view);
  assert.deepEqual((await h.store.get(`sessions/${view.id}`)).caseData,saved.caseData,'Published case changes cannot rewrite an existing snapshot');
  assert.equal(restarted.actorInputs.length,0);
});

test('the actor receives correspondence facts but no workbook answer keys or expected recipients', async () => {
  const h=harness(); let view=await h.start({caseId:h.catalogue[0].id});
  view=await h.handle({op:'message',sessionId:view.id,text:'Куда вам направить ответ?',requestId:'ask-address',expectedRevision:view.revision});
  assert.equal(h.actorInputs.length,1);
  const actor=h.actorInputs[0].actorCase;
  assert.deepEqual(actor.correspondenceAddress,view.case.workbook.origin);
  assert.doesNotMatch(JSON.stringify(actor),/"(?:rubric|assessment|workbook|expected|expectedRecipients|recipientIds|registrationTimely|referralDeadline)"/);
  noAnswers(view);
});

test('v1 rejects a missing or forged worksheet atomically without losing a resumable game', async () => {
  const h=harness(); let view=await openEvidence(h,await h.start({caseId:h.catalogue[0].id}));
  const c=h.catalogue[0], correct=decisionFor(c), before=await h.store.get(`sessions/${view.id}`);
  const missing=structuredClone(correct); delete missing.workbook;
  for (const [index,decision] of [missing,{...correct,workbook:{...correct.workbook,score:100}},
    {...correct,workbook:{...correct.workbook,referralDeadline:'2026-02-29'}}].entries()) {
    await assert.rejects(h.handle({op:'decide',sessionId:view.id,decision,requestId:`invalid-${index}`}),error=>['invalid_decision','invalid_request'].includes(error.code));
    assert.deepEqual(await h.store.get(`sessions/${view.id}`),before);
  }
  assert.deepEqual(await h.handle({op:'resume',sessionId:view.id,workbookVersion:1}),view);
});

test('training feedback records wrong dates, correct answers and exact calendar credit only after follow-up', async () => {
  const h=harness(); let view=await openEvidence(h,await h.start({caseId:h.catalogue[0].id}));
  const decision=decisionFor(h.catalogue[0],{referral:'2026-11-19'});
  const body={op:'decide',sessionId:view.id,decision,requestId:'choose-dates'};
  view=await h.handle(body);
  assert.equal(view.status,'followup'); noAnswers(view);
  assert.deepEqual(view.decision.workbook,decision.workbook);
  assert.deepEqual(await h.handle(body),view,'Retrying a decision must not advance or double-grade it');
  await assert.rejects(h.handle({...body,decision:decisionFor(h.catalogue[0])}),errorCode('request_conflict'));
  const followup={op:'followup',sessionId:view.id,choiceId:h.catalogue[0].followup.correct,requestId:'finish-followup'};
  view=await h.handle(followup);
  assert.equal(view.status,'review');
  assert.equal(view.feedback.score,92);
  assert.equal(view.feedback.criteria.find(row=>row.id==='calendar').earned,12);
  assert.deepEqual(view.feedback.workbook.calendar,{
    expected:{referral:'2026-11-18',deadline:'2026-12-11',registrationTimely:true},
    selected:{referral:'2026-11-19',deadline:'2026-12-11',registrationTimely:true},
    correct:{referral:false,deadline:true,registrationTimely:true},wrongDates:true,
  });
  assert.deepEqual(await h.handle(followup),view);
  const saved=await h.store.get(`sessions/${view.id}`);
  assert.equal(saved.results.length,1);
  assert.deepEqual(saved.caseStates[0].decision.workbook,decision.workbook);
  const restarted=harness({store:h.store});
  assert.deepEqual(await restarted.handle({op:'recover',mode:'training',workbookVersion:1}),view);
  view=await restarted.handle({op:'next',sessionId:view.id,requestId:'complete'});
  assert.equal(view.status,'complete');
  assert.equal(view.result.cases[0].feedback.workbook.calendar.wrongDates,true);
  assert.deepEqual(view.result.cases[0].decision.workbook,decision.workbook);
});

test('an unanswered worksheet survives omitted empty-array fields and can still finish after recovery', async () => {
  const h=harness(),c=h.catalogue[0];
  let view=await h.start({caseId:c.id});
  const decision={...decisionFor(c,{referral:'',deadline:'',registrationTimely:false,recipients:[]}),actionIds:[],basisDocumentIds:[]};
  view=await h.handle({op:'decide',sessionId:view.id,requestId:'blank-decision',decision});
  noAnswers(view);
  // Realtime Database's older unwrapped objects omit empty arrays. Recovery
  // must restore the canonical decision shape before grading or returning it.
  await h.store.transaction(`sessions/${view.id}`,saved=>{
    delete saved.caseStates[0].decision.actionIds;
    delete saved.caseStates[0].decision.basisDocumentIds;
    delete saved.caseStates[0].decision.workbook.routing.recipientIds;
    return saved;
  });
  const restarted=harness({store:h.store});
  view=await restarted.handle({op:'recover',mode:'training',workbookVersion:1});
  assert.deepEqual(view.decision,decision);
  view=await restarted.handle({op:'followup',sessionId:view.id,choiceId:c.followup.correct,requestId:'blank-followup'});
  assert.equal(view.feedback.criteria.find(row=>row.id==='calendar').earned,0);
  assert.equal(view.feedback.workbook.calendar.wrongDates,true);
  view=await restarted.handle({op:'next',sessionId:view.id,requestId:'blank-complete'});
  assert.equal(view.status,'complete');
  assert.deepEqual(view.result.cases[0].decision.workbook.routing.recipientIds,[]);
});

test('independent mode withholds all live grading until the eight-case result and persists workbook decisions in the journal', async () => {
  const writes=[],h=harness({providerName:'test-provider',saveResult:async value=>writes.push(value)});
  let view=await h.start({mode:'independent'});
  assert.equal(view.caseCount,8);
  const chosen=[];
  for (let index=0;index<8;index++) {
    assert.equal(view.caseIndex,index); noAnswers(view);
    view=await openEvidence(h,view);
    const c=h.catalogue.find(row=>row.id===view.case.id);
    const decision=decisionFor(c,{referral:'2026-11-20',deadline:'2026-12-14'});
    chosen.push({caseId:c.id,decision});
    view=await h.handle({op:'decide',sessionId:view.id,decision,requestId:`decision-${index}`});
    assert.equal(view.status,'followup'); noAnswers(view);
    view=await h.handle({op:'followup',sessionId:view.id,choiceId:c.followup.correct,requestId:`followup-${index}`});
    assert.equal(view.status,'review'); noAnswers(view);
    noAnswers(await h.handle({op:'resume',sessionId:view.id,workbookVersion:1}));
    assert.equal(writes.length,0,'Intermediate scores must not be submitted to the journal');
    view=await h.handle({op:'next',sessionId:view.id,requestId:`next-${index}`});
  }
  assert.equal(view.status,'complete');
  assert.equal(view.feedback,null);
  assert.equal(view.result.cases.length,8);
  assert.equal(view.result.total,84);
  assert.equal(view.result.journalStatus,'saved');
  for (const [index,result] of view.result.cases.entries()) {
    assert.equal(result.caseId,chosen[index].caseId);
    assert.equal(result.feedback.criteria.find(row=>row.id==='calendar').earned,4);
    assert.equal(result.feedback.workbook.calendar.expected.deadline,'2026-12-11');
    assert.equal(result.feedback.workbook.calendar.wrongDates,true);
    assert.deepEqual(result.decision.workbook,chosen[index].decision.workbook);
  }
  assert.equal(writes.length,1);
  assert.deepEqual(writes[0].decisions.map(d=>d.workbook),chosen.map(row=>row.decision.workbook));
  assert.deepEqual(await h.handle({op:'resume',sessionId:view.id,workbookVersion:1}),view);
  assert.equal(writes.length,1,'Resuming a completed attempt does not submit a second journal result');
});

test('legacy snapshots keep their original grading and completed results remain readable from the v1 client', async () => {
  const h=harness(), c=h.catalogue[0];
  let old=await h.start({caseId:c.id,requestId:'legacy-start',workbookVersion:undefined});
  assert.equal(Object.hasOwn(old.case,'workbook'),false);
  assert.equal((await h.store.get(`sessions/${old.id}`)).workbookVersion,undefined);
  await assert.rejects(h.handle({op:'resume',sessionId:old.id,workbookVersion:1}),errorCode('outdated_session'));
  assert.equal(await h.handle({op:'recover',mode:'training',workbookVersion:1}),null);
  old=await openEvidence(h,old);
  const decision=canonicalDecision(c);
  old=await submit(h,old,decision,'legacy');
  assert.equal(old.feedback.score,100);
  assert.equal(old.feedback.workbook,undefined);
  const saved=await h.store.get(`sessions/${old.id}`);
  assert.deepEqual(saved.results[0],evaluateDecision(saved.caseData[0],saved.caseStates[0],decision));
  old=await h.handle({op:'next',sessionId:old.id,requestId:'legacy-complete'});
  const completed=await h.store.get(`sessions/${old.id}`);
  assert.deepEqual(await h.handle({op:'resume',sessionId:old.id,workbookVersion:1}),old);
  assert.deepEqual(await h.store.get(`sessions/${old.id}`),completed,'Reading a legacy result must not migrate its private score or decision');
  const current=await h.start({requestId:'current-start',caseId:c.id});
  assert.equal((await h.handle({op:'recover',mode:'training',workbookVersion:1})).id,current.id);
});

function calendarCase(id,ruleId,anchorId,deadline,{registered=true}={}){
  const c=cases()[0],T=text=>({ru:text,en:text,zh:text});
  c.id=id;c.datePackId='synthetic-calendar';
  c.public.assessment.calendar.events=[{id:'sent',label:T('Sent'),date:'2026-04-29'},{id:'received',label:T('Received'),date:'2026-04-30'}];
  if(registered)c.public.assessment.calendar.events.push({id:'registered',label:T('Registered'),date:'2026-04-30'});
  if(!c.public.assessment.calendar.events.some(event=>event.id===anchorId))c.public.assessment.calendar.events.push({id:anchorId,label:T('The legally relevant event'),date:'2026-04-30'});
  c.public.assessment.calendar.rules=[{id:ruleId,label:T('Applicable statutory period')}];
  c.public.assessment.calendar.starts=[{id:'exclude_anchor',label:T('Following day')}];
  c.public.assessment.calendar.lastDays=[{id:'next_working_day',label:T('Next working day')}];
  c.rubric.authored.calendar={anchor:anchorId,rule:ruleId,start:'exclude_anchor',acceptedShifts:['next_working_day']};
  c.rubric.deadline=deadline;
  return validateCase(c);
}

test('v2 calendar uses the frozen public holiday calendar, working days and corresponding-month dates',()=>{
  assert.equal(WORKBOOK_CALENDAR.id,BUNDLED_CALENDARS.id);
  for(const [year,data]of Object.entries(WORKBOOK_CALENDAR.years))assert.equal(data.days,BUNDLED_CALENDARS.years[year].days,year);
  for(const [anchorDate,ruleId,expected]of [
    ['2026-04-30','calendar3','2026-05-04'],
    ['2026-04-30','calendar7','2026-05-07'],
    ['2026-04-30','calendar30','2026-06-01'],
    ['2026-04-30','working5','2026-05-08'],
    ['2026-04-30','working7','2026-05-13'],
    ['2026-04-30','working15','2026-05-25'],
    ['2026-05-08','working1','2026-05-12'],
    ['2026-01-31','months3','2026-04-30'],
    ['2026-11-30','months3','2027-03-01'],
  ])assert.equal(calculateWorkbookDeadline({anchorDate,ruleId}),expected,`${anchorDate}: ${ruleId}`);
  assert.equal(calculateWorkbookDeadline({anchorDate:'2026-04-30',ruleId:'calendar30',shift:'no_shift'}),'2026-05-30');
  assert.equal(workingCalendarDay('2026-05-11'),false,'The transferred holiday must not count as a working Monday');
  assert.equal(workingCalendarDay('2026-05-08'),true,'A shortened working day still counts');
  assert.throws(()=>workingCalendarDay('2028-01-01'),RangeError,'Do not silently invent a future production calendar');
});

test('v2 ordinary appeals include the complete three statutory excerpts and direct article links',()=>{
  const article8='https://www.consultant.ru/document/cons_doc_LAW_59999/0c7123ee40ad90f89afa6fa544a87ffe76c084c0/';
  const expected={
    registration59:{label:'59-ФЗ, ст. 8, ч. 2',url:article8,
      quote:'Письменное обращение подлежит обязательной регистрации в течение трех дней с момента поступления в государственный орган, орган местного самоуправления или должностному лицу.'},
    referral59:{label:'59-ФЗ, ст. 8, ч. 3',url:article8,
      quote:'Письменное обращение, содержащее вопросы, решение которых не входит в компетенцию данных государственного органа, органа местного самоуправления или должностного лица, направляется в течение семи дней со дня регистрации в соответствующий орган или соответствующему должностному лицу, в компетенцию которых входит решение поставленных в обращении вопросов, с уведомлением гражданина, направившего обращение, о переадресации обращения, за исключением случая, указанного в части 4 статьи 11 настоящего Федерального закона.'},
    review59:{label:'59-ФЗ, ст. 12, ч. 1',url:'https://www.consultant.ru/document/cons_doc_LAW_59999/23fb391f3632e3f68a11e40c5a7711f3513cc674/',
      quote:'Письменное обращение, поступившее в государственный орган, орган местного самоуправления или должностному лицу в соответствии с их компетенцией, рассматривается в течение 30 дней со дня регистрации письменного обращения, за исключением случая, указанного в части 1.1 настоящей статьи.'},
  };
  for(const [rule,anchor,deadline] of [
    ['calendar3','received','2026-05-04'],['calendar7','registered','2026-05-07'],['calendar30','registered','2026-06-01'],
  ]){
    const c=calendarCase('river-observation',rule,anchor,deadline),{norms}=publicWorkbook(c,2);
    assert.deepEqual(norms.map(row=>row.id).sort(),Object.keys(expected).sort());
    for(const row of norms){
      const {label,url,quote}=expected[row.id];
      assert.equal(row.url,url);
      for(const locale of ['ru','en','zh']){
        assert.equal(row.label[locale],label);
        assert.equal(row.text[locale],`«${quote}»`);
      }
    }
  }
});

test('v2 gives each special procedure its actual event, period, statutory excerpt and one date to select',()=>{
  for(const [id,rule,anchor,deadline,norm,registrationCheck,special]of [
    ['anonymous-danger','calendar3','received','2026-05-04','registration59',false,false],
    ['unreadable-body','calendar7','registered','2026-05-07','unreadable59',true,true],
    ['court-cancel','calendar7','registered','2026-05-07','courtReturn59',true,true],
    ['mfc-refusal','working5','registered','2026-05-08','mfc5',false,true],
    ['mfc-delay','working15','registered','2026-05-25','mfc15',false,true],
    ['insurance-collective','working7','bank','2026-05-13','insuranceCollective',false,true],
    ['bailiff-copy-decision','working1','decided','2026-05-04','bailiffCopy',false,true],
    ['privacy-own-record','working10','received','2026-05-18','personalData',false,true],
    ['tax-calendar-months','months3','declaration','2026-07-30','taxReview',false,true],
    ['budget','calendar30','registered','2026-06-01','information30',true,true],
  ]){
    const c=calendarCase(id,rule,anchor,deadline,{registered:id!=='anonymous-danger'}),before=structuredClone(c),w=publicWorkbook(c,2);
    assert.equal(supportsWorkbook(c,2),true);
    assert.equal(w.version,2);assert.equal(w.special,special);assert.equal(w.registrationCheck,registrationCheck);
    assert.deepEqual(w.targets.map(t=>t.id),['deadline']);
    assert.equal(w.targets[0].anchorId,anchor);assert.equal(w.targets[0].ruleId,rule);
    assert.equal(w.norms[0].id,norm);assert.ok(w.norms[0].text.ru.startsWith('«'));assert.match(w.norms[0].url,/^https:\/\//);
    for(const language of ['ru','en','zh'])assert.ok(w.instructions[language]&&w.norms.every(n=>n.text[language]));
    assert.doesNotMatch(JSON.stringify(w),/"(?:expected|correct|answer|rubric|recipientIds|score)"/);
    assert.equal(JSON.stringify(w).includes(deadline),false,'The calculated answer is not in public guidance');
    assert.deepEqual(c,before,'Guidance does not mutate or reclassify an archived dossier');
  }
});

test('v2 preserves canonical authored deadlines and grades only applicable date targets',()=>{
  const base={criteria:[{id:'calendar',earned:0,max:20}],explanation:{ru:'Содержательный разбор и исходное правило счёта.',en:'Original case reasoning.',zh:'原案分析。'}};
  const c=calendarCase('mfc-refusal','working5','registered','2026-05-08'),d=decisionFor(c,{deadline:'2026-05-08',referral:'1900-01-01',registrationTimely:false});
  const f=evaluateWorkbook(c,d,base,2);
  assert.equal(f.score,20,'An inapplicable referral or registration choice cannot cost points');
  assert.deepEqual(Object.keys(f.workbook.calendar.expected),['deadline']);
  assert.deepEqual(f.explanation,base.explanation,'V2 retains the authored special-procedure explanation');
  assert.equal(f.workbook.calendar.registrationCheck,false);assert.equal(f.workbook.calendar.liabilityApplicable,false);
  assert.equal(evaluateWorkbook(c,{...d,deadline:'2026-05-11'},base,2).score,0);
  const notice=calendarCase('court-cancel','calendar7','registered','2026-05-07');
  const noticeDecision=decisionFor(notice,{deadline:'2026-05-07',registrationTimely:false});
  assert.equal(evaluateWorkbook(notice,noticeDecision,base,2).score,16);
  assert.equal(evaluateWorkbook(notice,{...noticeDecision,workbook:{...noticeDecision.workbook,registrationTimely:true}},base,2).score,20);
  const unregistered=calendarCase('repeat-no-new','calendar3','received','2026-05-04',{registered:false});
  assert.equal(evaluateWorkbook(unregistered,decisionFor(unregistered,{deadline:'2026-05-04',registrationTimely:false}),base,2).score,20);
});

test('v2 basic alternative deadlines use the canonical final-day adjustment while v1 remains unchanged',()=>{
  const c=calendarCase('river-observation','calendar30','registered','2026-06-01'),base={criteria:[{id:'calendar',earned:0,max:20}]};
  c.public.assessment.calendar.events.find(e=>e.id==='registered').date='2026-05-04';
  c.rubric.deadline='2026-06-03';
  const d=decisionFor(c,{referral:'2026-05-12',deadline:'2026-06-03',registrationTimely:true});
  const current=evaluateWorkbook(c,d,base,2),old=evaluateWorkbook(c,d,base,1);
  assert.equal(current.score,20);assert.equal(current.workbook.calendar.expected.registrationTimely,true);
  assert.equal(current.workbook.calendar.expected.referral,'2026-05-12','The Monday May 11 transfer holiday shifts the referral deadline');
  assert.equal(old.workbook.calendar.expected.registrationTimely,false,'V1 retains its earlier unshifted three-day convention');
  assert.equal(old.workbook.calendar.expected.referral,'2026-05-11');
  assert.deepEqual(publicWorkbook(c,2).targets.map(t=>t.id),['referral','deadline']);
});

test('v2 API restores cases without registration and records a fully informed single-date solution',async()=>{
  const c=calendarCase('anonymous-danger','calendar3','received','2026-05-04',{registered:false}),h=harness({catalogue:[c]});
  assert.equal((await h.service.handle({op:'catalog',workbookVersion:1},identity)).cases.length,0);
  assert.equal((await h.service.handle({op:'catalog',workbookVersion:2},identity)).cases.length,1);
  let view=await openEvidence(h,await h.start({caseId:c.id,workbookVersion:2}));
  noAnswers(view);assert.equal(view.case.workbook.registrationCheck,false);assert.equal(view.case.workbook.norms[0].id,'registration59');
  const decision=decisionFor(c,{deadline:'2026-05-04',referral:'',registrationTimely:false});
  decision.actionIds.reverse();decision.law={number:'',article:''};
  decision.assessment.applicationId='';decision.assessment.actDate='';decision.assessment.calendar={anchor:'',rule:'',start:'',shift:''};
  view=await submit(h,view,decision,'v2-single');
  assert.equal(view.feedback.score,100,'Hidden old quizzes and click order must not reduce a correct v2 solution');
  assert.deepEqual(Object.keys(view.feedback.workbook.calendar.expected),['deadline']);
  const restarted=harness({store:h.store,catalogue:[c]});
  assert.deepEqual(await restarted.handle({op:'recover',mode:'training',workbookVersion:2}),view);
  view=await restarted.handle({op:'next',sessionId:view.id,requestId:'v2-complete'});
  assert.equal(view.status,'complete');assert.equal(view.result.total,100);
  assert.deepEqual(view.result.cases[0].decision.workbook,decision.workbook);
});


test('the school road case grades referral and the recipient’s substantive reply from separate registrations',()=>{
  const c=calendarCase('hatch','calendar7','registered','2026-05-07');
  const options={gameplay:true}, w=publicWorkbook(c,2,options);
  assert.deepEqual(w.targets.map(({id,anchorId})=>[id,anchorId]),[
    ['referral','registered'],['deadline','recipientRegistered'],
  ]);
  assert.equal(w.events.find(event=>event.id==='recipientRegistered').date,'2026-05-02');
  const d=decisionFor(c,{referral:'2026-05-07',deadline:'2026-06-01',registrationTimely:true});
  const score=evaluateWorkbook(c,d,{criteria:[{id:'calendar',earned:0,max:20}]},2,options);
  assert.equal(score.score,20);
  assert.deepEqual(score.workbook.calendar.correct,{referral:true,deadline:true,registrationTimely:true});
});
