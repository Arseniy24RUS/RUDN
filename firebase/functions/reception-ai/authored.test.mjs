import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCase,actorCase,evaluateDecision,validateDecision} from './schema.mjs';
import {createReceptionService} from './service.mjs';
import {createMemoryStore} from './store.mjs';
import {selectShiftCases} from './selection.mjs';
import {referenceNumber,referenceUnit} from './legal-reference.mjs';
import {CONTENT_MANIFEST} from '../../../site/apps/reception/content/manifest.js';

const T=text=>({ru:text,en:'EN '+text,zh:'中文 '+text});
const O=(id,label=id)=>({id,label:T(label)});
function fixture(id='case-1'){
  return {id,familyId:id,datePackId:'a',version:'reception-ai-bank-2026-11-11.3',public:{title:T('Дело'),role:{title:T('Роль'),text:T('Пределы роли')},citizen:{name:T('Заявитель'),description:T('Описание'),portrait:'assets/gfx1/avatars/C03.webp'},opening:T('Помогите'),date:'2026-11-11',procedures:[O('p1'),O('p2')],routes:[O('r1'),O('r2')],actions:[O('a1'),O('a2'),O('a3'),O('bad')],sources:[{id:'law',title:T('Закон'),url:'https://example.invalid/law'}],deadlinePrompt:T('Дата'),
    assessment:{fact:{prompt:T('Факт'),options:[O('f-good'),O('f-bad')]},knowledge:{prompt:T('Норма'),options:[O('apply'),O('wrong')],numberLabel:T('Номер'),dateLabel:T('Дата'),unitLabel:T('Статья')},trap:{prompt:T('Предложение'),options:[O('respect'),O('reject')]},calendar:{events:[{id:'registered',label:T('Регистрация'),date:'2026-11-11'},{id:'received',label:T('Поступление'),date:'2026-11-10'}],rules:[O('30'),O('7')],starts:[O('exclude_anchor'),O('include_anchor')],lastDays:[O('no_shift'),O('next_working')]},research:{prompt:T('Источник'),extractedLabel:T('Извлечение'),findingOptions:[O('found'),O('other')],records:[{id:'record',title:T('Материал'),url:'',fragments:[{id:'fragment',label:T('Фрагмент'),text:T('Руководитель МФЦ')},{id:'wrong-fragment',label:T('Иной фрагмент'),text:T('Не относится')}]}]}}},
    actor:{persona:T('Посетитель'),goal:T('Ответ'),knowledgeLimits:T('Личные факты'),style:T('Кратко'),background:T('Контекст')},
    facts:[{id:'q1',text:T('Ответ'),prompt:T('Вопрос'),initial:false,knowledge:'direct',documentIds:['d1']}],
    documents:['d1','d2','d3'].map(id=>({id,title:T(id),type:T('Документ'),text:T('Содержание'),initial:false,factIds:id==='d1'?['q1']:[]})),
    rubric:{procedureIds:['p1'],routeIds:['r1','r2'],requiredActionIds:['a1','a2','a3'],forbiddenActionIds:['bad'],criticalActionIds:['bad'],requiredFactIds:['q1'],evidenceGroups:[['d1','d2']],legal:{number:'59',articles:['8']},deadline:'2026-12-11',explanation:T('Разбор'),authored:{factIds:['f-good'],evidenceSets:[['d1','d2']],evidencePaired:true,order:[['a1','a2']],rightsAction:'a1',criticalRules:[{id:'bad',kind:'selected'},{id:'a1',kind:'missing',knownQuestion:'q1'}],decisionPlans:[{id:'plan1',routes:['r1'],requiredActions:['a1','a2'],order:[['a1','a2']]},{id:'plan2',routes:['r2'],requiredActions:['a1','a3'],order:[['a1','a3']]}],knowledge:{number:'59',actDate:'2006-05-02',articles:['8'],correct:'apply'},calendar:{anchor:'registered',rule:'30',start:'exclude_anchor',acceptedShifts:['no_shift']},research:{bindings:[{recordId:'record',fragmentId:'fragment'}],accepted:['руководитель МФЦ'],aliases:['head of the MFC','多功能中心负责人'],normalize:'role',finding:'found'},trap:'respect'}},
    followup:{intro:T('Новое обстоятельство'),options:[O('confirm'),O('close')],correct:'confirm',explanation:T('Контрольный разбор'),success:T('Подтверждено'),failure:T('Проверьте действия')}
  };
}
const good=()=>({procedureId:'p1',routeId:'r1',actionIds:['a1','a2'],law:{number:'59-ФЗ',article:'8'},deadline:'2026-12-11',basisDocumentIds:['d1','d2'],reasoning:'Обоснование',assessment:{factId:'f-good',applicationId:'apply',trapId:'respect',actDate:'2006-05-02',calendar:{anchor:'registered',rule:'30',start:'exclude_anchor',shift:'no_shift'},research:{recordId:'record',fragmentId:'fragment',extracted:'Руководитель МФЦ',finding:'found'}}});
const fullState=()=>({knownFactIds:['q1'],openedDocumentIds:['d1','d2','d3'],followupChoiceId:'confirm'});
const provider={name:'mock',async generate({actorCase:c}){return{reply:'Материалы переданы.',revealedFactIds:c.facts.map(f=>f.id),releasedDocumentIds:c.documents.map(d=>d.id),usage:{inputTokens:0,outputTokens:0}};}};
const error=code=>e=>e.code===code;

test('full-bank schema validates variants, references, plans and public/private separation',()=>{
  const c=fixture();assert.equal(validateCase(c).id,c.id);
  const worksheet={...c.documents[0],id:'dates',initial:true,factIds:[]};
  const actor=actorCase({...c,documents:[...c.documents,worksheet]},'en');
  assert.equal(actor.documents.some(document=>document.id==='dates'),false);
  assert.equal(actor.date,undefined);for(const key of ['assessment','provenance','rubric','dateVariants','followup'])assert.equal(actor[key],undefined);
  assert.equal(actor.facts[0].prompt,'EN Вопрос');
  const alternate=fixture();alternate.datePackId='b';c.dateVariants=[alternate];assert.equal(validateCase(c).dateVariants.length,1);
  for(const change of [x=>x.rubric.authored.research.bindings[0].fragmentId='unknown',x=>x.rubric.authored.order.push(['a2','a1']),x=>x.public.assessment.fact.correct=['f-good'],x=>x.dateVariants[0].datePackId='a',x=>x.dateVariants[0].dateVariants=[fixture()]]){
    const bad=structuredClone(c);change(bad);assert.throws(()=>validateCase(bad),error('invalid_case'));
  }
});

test('authored scoring preserves exact evidence, route-specific plans, ordering and follow-up points',()=>{
  const c=validateCase(fixture()),state=fullState();assert.equal(evaluateDecision(c,state,good()).score,100);
  const alternate=good();alternate.routeId='r2';alternate.actionIds=['a1','a3'];assert.equal(evaluateDecision(c,state,alternate).score,100);
  const allDocs=good();allDocs.basisDocumentIds.push('d3');
  const extraEvidence=evaluateDecision(c,state,allDocs);
  assert.equal(extraEvidence.score,95);
  assert.equal(extraEvidence.evidenceIssue,'selection');
  assert.equal(evaluateDecision(c,{...state,openedDocumentIds:[]},good()).evidenceIssue,'unopened');
  const wrongOrder=good();wrongOrder.actionIds.reverse();assert.equal(evaluateDecision(c,state,wrongOrder).score,98);
  const wrongFact=good();wrongFact.assessment.factId='f-bad';
  const unrelatedEvidence=evaluateDecision(c,state,wrongFact);
  assert.equal(unrelatedEvidence.score,85);
  assert.equal(unrelatedEvidence.evidenceIssue,'fact');
  c.rubric.authored.evidencePaired=false;assert.equal(evaluateDecision(c,state,wrongFact).score,90);
  assert.equal(evaluateDecision(c,{...state,followupChoiceId:'close'},good()).score,96);
  const omitted=good();omitted.actionIds=['a2'];assert.ok(evaluateDecision(c,state,omitted).criticalIds.includes('a1'));
  assert.deepEqual(evaluateDecision(c,{...state,knownFactIds:[]},omitted).criticalIds,[]);
  assert.equal(evaluateDecision(c,{...state,knownFactIds:[]},good()).score,100,'No extra question-click gate');
});

test('authored legal references retain instrument types and translated evidence aliases',()=>{
  const c=fixture(),state=fullState();c.rubric.authored.knowledge={number:'1441',actDate:'2020-09-15',articles:['99.2'],correct:'apply',actType:'resolution',unitKind:'clause'};
  for(const [number,article,extracted]of [['Постановление Правительства РФ №1441','пункт 99.2','руководитель МФЦ'],['Government resolution No. 1441','Clause 99.2','head of the MFC'],['政府第1441号决议','第99.2项','多功能中心负责人']]){
    const decision=good();decision.law={number,article};decision.assessment.actDate='2020-09-15';decision.assessment.research.extracted=extracted;
    assert.equal(evaluateDecision(c,state,decision).score,100);
  }
  assert.equal(referenceNumber('1441-ФЗ',c.rubric.authored.knowledge),'');assert.equal(referenceUnit('статья 99.2',c.rubric.authored.knowledge),'');
  const malformed=good();malformed.assessment.research.fragmentId='missing';assert.throws(()=>validateDecision(malformed,c,state.openedDocumentIds),error('invalid_decision'));
  const unbound=good();unbound.assessment.research.fragmentId='wrong-fragment';assert.equal(evaluateDecision(fixture(),state,unbound).score,88);
});

test('authored unanswered fields are accepted and score zero; malformed answers and legacy blanks stay invalid',async()=>{
  const c=validateCase(fixture()),blank={procedureId:'',routeId:'',actionIds:[],law:{number:'',article:''},deadline:'',basisDocumentIds:[],reasoning:'',
    assessment:{factId:'',applicationId:'',trapId:'',actDate:'',calendar:{anchor:'',rule:'',start:'',shift:''},research:{recordId:'',fragmentId:'',extracted:'',finding:''}}};
  assert.deepEqual(validateDecision(blank,c,[]),blank);
  const ungraded={knownFactIds:[],openedDocumentIds:[],followupChoiceId:'close'};
  assert.equal(evaluateDecision(c,ungraded,blank).score,0);
  assert.ok(evaluateDecision(c,ungraded,blank).criteria.every(row=>row.earned===0));
  for(const change of [d=>d.routeId='unknown',d=>d.assessment.factId=null,d=>d.assessment.actDate='2026-02-30',d=>d.deadline=20261111,d=>d.assessment.calendar.rule='unknown',d=>d.assessment.research.recordId='unknown',d=>d.assessment.research.fragmentId='fragment',d=>d.assessment.research.extracted=null,d=>delete d.assessment]){
    const bad=structuredClone(blank);change(bad);assert.throws(()=>validateDecision(bad,c,[]));
  }
  const legacy=structuredClone(c);delete legacy.public.assessment;delete legacy.rubric.authored;delete legacy.followup;
  const legacyBlank=structuredClone(blank);delete legacyBlank.assessment;assert.throws(()=>validateDecision(legacyBlank,legacy,[]),error('invalid_decision'));
  const service=createReceptionService({store:createMemoryStore(),cases:[c],provider}),identity={uid:'partial-qa',studentKey:'partial-qa'},call=async body=>(await service.handle(body,identity)).view;
  let view=await call({op:'start',mode:'training',locale:'ru',requestId:'start'});
  view=await call({op:'decide',sessionId:view.id,decision:blank,requestId:'blank'});assert.equal(view.status,'followup');assert.equal(view.feedback,null);
  view=await call({op:'followup',sessionId:view.id,choiceId:'close',requestId:'follow'});assert.equal(view.feedback.score,0);assert.equal(view.status,'review');
  view=await call({op:'next',sessionId:view.id,requestId:'next'});assert.equal(view.result.points,0);
});

test('catalogs over32 select8 distinct families and reach every scenario/date pack',()=>{
  const cases=Array.from({length:178},(_,i)=>{const c=fixture('case-'+i);c.familyId='family-'+(i%43);const b=structuredClone(c);b.datePackId='b';c.dateVariants=[b];return c;});
  const reached=new Set();
  for(let i=0;i<1000;i++){
    const picked=selectShiftCases(cases,'selection-'+i);assert.equal(picked.length,8);assert.equal(new Set(picked.map(c=>c.familyId)).size,8);
    for(const c of picked){assert.equal(c.dateVariants,undefined);reached.add(c.id+'/'+c.datePackId);}
  }
  assert.equal(reached.size,356);
  assert.deepEqual(selectShiftCases(cases,'same-seed'),selectShiftCases([...cases].reverse(),'same-seed'));
});

test('the full-bank independent shift restores difficulty, required families and all three calendar term classes',()=>{
  const cases=CONTENT_MANIFEST.templates.map(({id,familyId})=>({id,familyId,datePackId:'a'})), assignments=new Set();
  const levels=new Map(CONTENT_MANIFEST.templates.map(c=>[c.id,c.level]));
  const calendarTerms=new Map(CONTENT_MANIFEST.templates.map(c=>[c.id,c.calendar.unit==='workingDays'?'workingDays':`${c.calendar.unit}:${c.calendar.duration}`]));
  for(let i=0;i<24;i++){
    const selected=selectShiftCases(cases,'balanced-'+i,{balanced:true}),families=selected.map(c=>c.familyId);
    assert.deepEqual(selected.map(c=>levels.get(c.id)),[1,1,2,2,2,2,3,3]);
    assert.equal(new Set(families).size,8);assert.ok(families.includes('budget'));assert.ok(families.includes('mfc-complaint'));
    const terms=new Set(selected.map(c=>calendarTerms.get(c.id)));
    for(const term of ['calendarDays:7','calendarDays:30','workingDays'])assert.ok(terms.has(term),`${term} missing for seed ${i}`);
    assert.deepEqual(selected,selectShiftCases([...cases].reverse(),'balanced-'+i,{balanced:true}));
    assignments.add(selected.map(c=>c.id).join(','));
  }
  assert.ok(assignments.size>1);
  const custom=Array.from({length:8},(_,i)=>({id:'custom-'+i,familyId:'custom-'+i}));
  assert.deepEqual(selectShiftCases(custom,'legacy',{balanced:true}),selectShiftCases(custom,'legacy'));
});

test('immutable catalog loading coalesces concurrent requests and retries a rejected load',async()=>{
  const cases=Array.from({length:40},(_,i)=>fixture('catalog-'+i));let loads=0,release;
  const service=createReceptionService({store:createMemoryStore(),provider,cases:async()=>{loads++;return new Promise(resolve=>{release=()=>resolve(cases);});}});
  const identity={uid:'catalog-reader',studentKey:'12345'},request={op:'catalog',locale:'ru'};
  const pending=Array.from({length:8},()=>service.handle(request,identity));
  assert.equal(loads,1);release();const results=await Promise.all(pending);assert.ok(results.every(r=>r.cases.length===40));
  await service.handle(request,identity);assert.equal(loads,1);
  let retries=0;const recovering=createReceptionService({store:createMemoryStore(),provider,cases:async()=>{if(++retries===1)throw Error('temporary fixture failure');return cases;}});
  await assert.rejects(recovering.handle(request,identity),/temporary fixture/);
  assert.equal((await recovering.handle(request,identity)).cases.length,40);assert.equal(retries,2);
});

test('follow-up is a frozen idempotent stage and cannot reveal early grading',async()=>{
  const c=fixture(),store=createMemoryStore(),service=createReceptionService({store,cases:[c],provider});
  const identity={uid:'u',studentKey:'12345'},call=async body=>(await service.handle(body,identity)).view;
  let v=await call({op:'start',mode:'training',locale:'ru',requestId:'s'});
  v=await call({op:'message',sessionId:v.id,requestId:'m',text:'Документы',expectedRevision:v.revision});
  for(const id of ['d1','d2'])v=await call({op:'document',sessionId:v.id,documentId:id,requestId:id});
  v=await call({op:'decide',sessionId:v.id,decision:good(),requestId:'decision'});assert.equal(v.status,'followup');assert.equal(v.feedback,null);assert.deepEqual(Object.keys(v.followup).sort(),['intro','options']);
  await assert.rejects(call({op:'next',sessionId:v.id,requestId:'too-soon'}),error('not_reviewed'));
  await assert.rejects(call({op:'document',sessionId:v.id,documentId:'d3',requestId:'late-document'}),error('document_unavailable'));
  await assert.rejects(call({op:'decide',sessionId:v.id,decision:good(),requestId:'rewrite'}),error('not_active'));
  const body={op:'followup',sessionId:v.id,choiceId:'confirm',requestId:'follow'};
  v=await call(body);assert.equal(v.status,'review');assert.equal(v.feedback.score,100);assert.equal(v.followupChoiceId,'confirm');assert.deepEqual(await call(body),v);
  assert.equal((await store.get('sessions/'+v.id)).results.length,1);
  v=await call({op:'next',sessionId:v.id,requestId:'next'});assert.equal(v.result.points,5);
});

test('one authored critical error caps the entire independent shift at60',async()=>{
  const cases=Array.from({length:40},(_,i)=>fixture('case-'+i)),store=createMemoryStore(),service=createReceptionService({store,cases,provider});
  const identity={uid:'u',studentKey:'12345'},call=async body=>(await service.handle(body,identity)).view;
  let v=await call({op:'start',mode:'independent',locale:'en',requestId:'start'});
  assert.equal(v.caseCount,8);
  for(let i=0;i<8;i++){
    v=await call({op:'message',sessionId:v.id,requestId:'m'+i,text:'Materials',expectedRevision:v.revision});
    for(const id of ['d1','d2'])v=await call({op:'document',sessionId:v.id,documentId:id,requestId:i+id});
    const decision=good();if(i===0)decision.actionIds.push('bad');
    v=await call({op:'decide',sessionId:v.id,decision,requestId:'d'+i});assert.equal(v.feedback,null);
    v=await call({op:'followup',sessionId:v.id,choiceId:'confirm',requestId:'f'+i});assert.equal(v.feedback,null);
    v=await call({op:'next',sessionId:v.id,requestId:'n'+i});
  }
  assert.equal(v.result.total,60);assert.equal(v.result.cap,60);assert.equal(v.result.points,3);assert.ok(v.result.cases[0].score>60);
});
