import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateDecision,validateCase} from './schema.mjs';
import {
  DECISION_VERSION,CORRESPONDENCE_WEIGHTS,validateCorrespondence,publicCorrespondenceSources,
  resolveCorrespondenceCitations,buildCorrespondenceReview,validateCorrespondenceReview,scoreCorrespondenceReview,
  combineCorrespondenceFeedback,validateCorrespondenceControl,
} from './correspondence.mjs';
import {createOpenAIProvider,estimateReviewReservation,reviewCostMicros} from './provider.mjs';
import {createScriptedCorrespondenceReviewer} from '../../../scripts/reception-correspondence-test-reviewer.mjs';

const T=text=>({ru:text,en:text,zh:text});
const c={id:'fixture',version:'fixture-v1',public:{date:'2026-11-12',opening:T('Дорожку не восстановили.'),role:{text:T('Подготовьте проект.')},actions:[]},
  facts:[{id:'q1',text:T('Работы не выполнены.'),initial:true,knowledge:'direct',documentIds:['d1']}],
  documents:[{id:'d1',title:T('Материалы проверки'),text:T('Работы не выполнены. Причины не установлены.'),initial:true,factIds:['q1']},
    {id:'d2',title:T('Закрытый материал'),text:T('Недоступные сведения.'),initial:false,factIds:[]}],
  rubric:{deadline:'2026-12-12',explanation:T('Разделите ремонт и жалобу.'),requiredActionIds:[],forbiddenActionIds:[],criticalActionIds:[]},
  followup:{intro:T('Ремонт завершён. Жалоба не рассмотрена.'),explanation:T('Сохраните рассмотрение жалобы.')},
};
const state={openedDocumentIds:['d1'],knownFactIds:['q1'],messages:[
  {id:'m1',role:'assistant',text:'Прошу проверить и прежний ответ.'},
  {id:'u1',role:'user',text:'Все виновны.'},
]};
const profile={issues:[{id:'repair',title:'Ремонт'},{id:'complaint',title:'Жалоба'}],acceptedKinds:['reply'],
  criticalRules:[{id:'self-review',description:'Запрещено поручать окончательное рассмотрение жалобы обжалуемому лицу.'}],
  control:{criticalRules:[{id:'false-closure',description:'Жалоба не закрывается только из-за ремонта.'}]}};
const draft=()=>({version:1,kind:'reply',subject:'О рассмотрении обращения',
  sections:{facts:'Работы не выполнены. Причины не установлены.',legalBasis:'Жалобу проверяет уполномоченное лицо.',
    resolution:'Проверить два вопроса раздельно.',nextSteps:'О результате проверки сообщим.'},
  citations:[{id:'proof1',kind:'document',section:'facts',sourceId:'d1',quote:'Работы не выполнены.'}],orders:[]});
const decision=()=>({deadline:'2026-12-12',correspondence:draft()});
const operational={criteria:[{id:'route',earned:15,max:15},{id:'calendar',earned:15,max:15}]};
function reviewFor(context,levels=Object.fromEntries(context.criteria.map(row=>[row.id,4]))) {
  // Explicit fixture observations; this helper is not production grading.
  return {version:1,phase:context.phase,criteria:context.criteria.map(row=>{
    const section=context.phase==='initial'?row.id:row.id==='status'?'statuses':'control';
    const quote=context.sections[section],level=Math.min(levels[row.id],row.maxLevel);
    return {id:row.id,level,reason:'Проверка заданного тестового результата.',findings:[
      ...(level>0?[{type:'supported',section,quote,sourceIds:[row.eligibleEvidenceIds[0]||'case-author-explanation'],explanation:'Тестовое соответствие.'}]:[]),
      ...(level<4?[{type:'missing',section,quote:'',sourceIds:['case-author-explanation'],explanation:'В тестовом результате отмечен пропуск.'}]:[]),
    ]};
  }),criticalErrors:[],summary:'Явно заданный тестовый разбор.'};
}
async function contextFor(value=draft()){
  const validated=validateCorrespondence(value,c,state),evidence=await resolveCorrespondenceCitations(c,state,validated,'ru');
  return buildCorrespondenceReview(c,state,{deadline:'2026-12-12',correspondence:validated},'ru',{profile,resolvedCitations:evidence,operational});
}
const err=code=>error=>error.code===code;

test('new decision accepts empty legacy quiz fields without manufacturing an answer',()=>{
  const result=validateDecision(decision(),c,state.openedDocumentIds,{decisionVersion:DECISION_VERSION,state});
  assert.equal(result.correspondence.sections.facts,draft().sections.facts);
  assert.equal(result.assessment,undefined);
  assert.deepEqual(result.actionIds,[]);
  assert.throws(()=>validateDecision(decision(),c,state.openedDocumentIds),err('invalid_request'));
});

test('document and dialogue citations must occur in available authoritative sources',()=>{
  for(const modify of [
    value=>value.citations[0].quote='Работы выполнены.',
    value=>value.citations[0].sourceId='d2',
    value=>{value.citations[0].kind='dialogue';value.citations[0].sourceId='u1';value.citations[0].quote='Все виновны.';},
  ]){const value=draft();modify(value);assert.throws(()=>validateCorrespondence(value,c,state),err('invalid_citation'));}
  const dialogue=draft();dialogue.citations.push({id:'proof2',section:'facts',kind:'dialogue',sourceId:'m1',quote:'Прошу проверить и прежний ответ.'});
  assert.equal(validateCorrespondence(dialogue,c,state).citations.length,2);
  assert.equal(publicCorrespondenceSources(c,state).some(source=>source.id==='d2'),false);
  assert.equal(publicCorrespondenceSources(c,state).some(source=>source.id==='u1'),false);
});

test('a saved Russian quotation stays valid after an English locale change, but the source must remain opened',async()=>{
  const translated=structuredClone(c);
  translated.documents[0].title.en='Inspection materials';
  translated.documents[0].text.en='The work has not been completed. The reasons have not been established.';
  const validated=validateCorrespondence(draft(),translated,state,'en');
  const [source]=await resolveCorrespondenceCitations(translated,state,validated,'en');
  assert.equal(source.language,'ru');
  assert.equal(source.text,translated.documents[0].text.ru);
  assert.equal(source.title,translated.documents[0].title.ru);
  assert.equal(publicCorrespondenceSources(translated,state,'en')[0].text,translated.documents[0].text.en);
  assert.throws(()=>validateCorrespondence(draft(),translated,{...state,openedDocumentIds:[]},'en'),err('invalid_citation'));
  const changed=draft();changed.citations[0].quote='Поддельный текст на любом языке.';
  assert.throws(()=>validateCorrespondence(changed,translated,state,'en'),err('invalid_citation'));
});

test('legal citations require canonical resolution, never a client-supplied URL',async()=>{
  const value=draft();value.citations=[{id:'law1',section:'legalBasis',kind:'legal',sourceId:'law',unitIds:['part-1'],quote:'Проверка обязательна.'}];
  const validated=validateCorrespondence(value,c,state);
  await assert.rejects(resolveCorrespondenceCitations(c,state,validated,'ru'),err('citation_source_unavailable'));
  await assert.rejects(resolveCorrespondenceCitations(c,state,validated,'ru',{resolveLegalCitation:async()=>({sourceId:'law',text:'Проверка не требуется.'})}),err('invalid_citation'));
  const sources=await resolveCorrespondenceCitations(c,state,validated,'ru',{resolveLegalCitation:async()=>({
    sourceId:'law',title:'Проверенный тестовый источник',url:'https://example.invalid/canonical',locator:'Пункт 1',text:'Проверка обязательна.',contentSha256:'a'.repeat(64),version:'fixture',
  })});
  assert.equal(sources[0].url,'https://example.invalid/canonical');
});

test('forged reviewer quotations, unknown sources and unsupported full marks are rejected',async()=>{
  const context=await contextFor();
  for(const modify of [
    review=>review.criteria[0].findings[0].quote='Студент этого не писал.',
    review=>review.criteria[0].findings[0].sourceIds=['imaginary'],
    review=>review.criteria[0].findings=[],
    review=>review.criteria.push(review.criteria[0]),
    review=>review.criteria[0].level=5,
  ]){const review=reviewFor(context);modify(review);assert.throws(()=>validateCorrespondenceReview(review,context),err('review_invalid'));}
});

test('fixed rubric grades verified substantive criteria, not prose length or keyword counts',async()=>{
  const short=await contextFor(),longDraft=draft();
  longDraft.sections.facts+=' '+('Учебный дополнительный текст. '.repeat(60));
  const long=await contextFor(longDraft);
  const levels={facts:2,legalBasis:1,resolution:3,nextSteps:2};
  const a=scoreCorrespondenceReview(reviewFor(short,levels),short),b=scoreCorrespondenceReview(reviewFor(long,levels),long);
  assert.equal(a.score,65);assert.equal(b.score,65);
  assert.equal(scoreCorrespondenceReview(reviewFor(short),short).score,90,'No statutory citation means legal application cannot get full credit');
  assert.equal(CORRESPONDENCE_WEIGHTS.initial.legalBasis,20);
});

test('answer-key sources cannot replace the student’s evidence for high marks',async()=>{
  const context=await contextFor(),without=draft();without.citations=[];
  const empty=await contextFor(without);
  assert.ok(empty.criteria.every(row=>row.maxLevel===2));
  const ungrounded=reviewFor(empty);ungrounded.criteria[0].level=4;
  assert.throws(()=>validateCorrespondenceReview(ungrounded,empty),err('review_invalid'));
  const keyInsteadOfEvidence=reviewFor(context);
  keyInsteadOfEvidence.criteria[0].findings[0].sourceIds=['case-author-explanation'];
  assert.throws(()=>validateCorrespondenceReview(keyInsteadOfEvidence,context),err('review_invalid'));
});

test('critical mistakes are grounded and capped only within their own phase',async()=>{
  const context=await contextFor(),review=reviewFor(context);
  review.criticalErrors=[{ruleId:'self-review',finding:{type:'missing',section:'resolution',quote:'',
    sourceIds:['critical-rule:self-review'],explanation:'Явный тестовый критический пропуск.'}}];
  const initial=scoreCorrespondenceReview(review,context);
  assert.equal(initial.score,60);
  assert.throws(()=>validateCorrespondenceReview({...review,criticalErrors:[{...review.criticalErrors[0],ruleId:'invented-rule'}]},context),err('review_invalid'));
  const control={text:'Ремонт завершён, жалобу оставляем на контроле.',statuses:[
    {issueId:'repair',status:'resolved',evidenceSourceIds:['followup']},
    {issueId:'complaint',status:'pending',evidenceSourceIds:['followup']},
  ]};
  const nextState={...state,decision:decision(),correspondenceInitialFeedback:initial};
  const checked=validateCorrespondenceControl(control,c,nextState,profile);
  const ctx=buildCorrespondenceReview(c,nextState,decision(),'ru',{profile,phase:'control',control:checked});
  const assessed=scoreCorrespondenceReview(reviewFor(ctx),ctx),combined=combineCorrespondenceFeedback(initial,assessed);
  assert.equal(assessed.score,100);
  assert.equal(combined.correspondence.initialScore,60);
  assert.equal(combined.score,68);
  assert.equal(initial.score,60);
  assert.equal(combined.authored,false,'Legacy whole-shift cap must not be applied');
});

test('conditional critical rules require an observed trigger and the matching kind of actual error',async()=>{
  const hidden=structuredClone(c);hidden.facts[0].initial=false;
  const conditional={...profile,criticalRules:[{id:'alert',kind:'missing',knownQuestion:'q1',requiresObservedEvidence:true,
    description:'Передать сведения об установленной опасности.',
    condition:'Only when the named triggering fact was available and the required action was actually omitted.'}]};
  const empty={...state,knownFactIds:[],openedDocumentIds:[]};
  const unseen=buildCorrespondenceReview(hidden,empty,decision(),'ru',{profile:conditional,operational});
  assert.equal(unseen.criticalRules[0].applicable,false);
  const attempted=reviewFor(unseen);attempted.criticalErrors=[{ruleId:'alert',finding:{type:'missing',section:'resolution',quote:'',
    sourceIds:['critical-rule:alert'],explanation:'Нельзя наказывать за неизвестный триггер.'}}];
  assert.throws(()=>validateCorrespondenceReview(attempted,unseen),err('review_invalid'));
  const observed=buildCorrespondenceReview(hidden,{...empty,openedDocumentIds:['d1']},decision(),'ru',{profile:conditional,operational});
  assert.equal(observed.criticalRules[0].applicable,true);
  assert.equal(observed.sources.find(source=>source.id==='fact:q1').available,true);
  const valid=reviewFor(observed);valid.criticalErrors=attempted.criticalErrors;
  assert.equal(validateCorrespondenceReview(valid,observed).criticalErrors.length,1);
  const unsupported={...conditional,criticalRules:[{...conditional.criticalRules[0],condition:'An unsupported new condition.'}]};
  assert.equal(buildCorrespondenceReview(hidden,state,decision(),'ru',{profile:unsupported}).criticalRules[0].applicable,false);
  const selected={...conditional,criticalRules:[{id:'forbidden',kind:'selected',description:'Запрещённое распоряжение.'}]};
  const selectedContext=buildCorrespondenceReview(hidden,state,decision(),'ru',{profile:selected,operational});
  const inventedOmission=reviewFor(selectedContext);inventedOmission.criticalErrors=[{ruleId:'forbidden',finding:{type:'missing',section:'resolution',quote:'',
    sourceIds:['critical-rule:forbidden'],explanation:'Выбор запрещённого действия нельзя вывести из пропуска.'}}];
  assert.throws(()=>validateCorrespondenceReview(inventedOmission,selectedContext),err('review_invalid'));
});

test('review can identify actual order values and knows the bounds of image evidence',async()=>{
  const value=draft();value.orders=[{id:'order1',issue:'Ремонт',kind:'request',recipientIds:['mvd'],
    instruction:'Запросить подтверждение.',dueDate:'2026-11-30',expectedResult:'Акт проверки.',citationIds:['proof1']}];
  const photo=structuredClone(c);photo.documents[0].image='/fixture/image.jpg';
  const checked=validateCorrespondence(value,photo,state),sources=await resolveCorrespondenceCitations(photo,state,checked,'ru');
  const context=buildCorrespondenceReview(photo,state,{correspondence:checked},'ru',{profile:{...profile,
    constraints:['Проект не означает исполнение.'],routing:{policy:'fixture'},response:{representsDraftOnly:true}},resolvedCitations:sources,operational});
  assert.ok(context.sections.orders.includes('Адресат: Министерство внутренних дел Российской Федерации'));
  assert.ok(context.sections.orders.includes('Срок: 2026-11-30'));
  assert.equal(context.sources.find(source=>source.id==='document:d1').imageProvidedToReviewer,false);
  assert.deepEqual(context.sources.find(source=>source.id==='document:d1').factIds,['q1']);
  assert.equal(context.profile.response.representsDraftOnly,true);
  const review=reviewFor(context);review.criteria.find(row=>row.id==='resolution').level=3;
  review.criteria.find(row=>row.id==='resolution').findings.push({type:'incorrect',section:'orders',quote:'Министерство внутренних дел Российской Федерации',
    sourceIds:['case-author-explanation'],explanation:'Тест позволяет указать выбранное значение поручения.'});
  assert.equal(validateCorrespondenceReview(review,context).criteria.length,4);
});

test('frozen case dates outrank stale profile examples',async()=>{
  const context=await contextFor();
  assert.equal(context.frozenCase.deadline,'2026-12-12');
  assert.equal(context.frozenCase.date,'2026-11-12');
  assert.deepEqual(context.frozenCase.facts,[{id:'q1',text:'Работы не выполнены.',uncertain:false,knowledge:'direct',documentIds:['d1']}]);
});

test('production provider requires both substantive review and verification; no mock fallback',async()=>{
  const context=await contextFor(),review=reviewFor(context),requests=[];
  const reply=parsed=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(parsed)}]}],usage:{input_tokens:10,output_tokens:10}})});
  const provider=createOpenAIProvider({apiKey:'test-only',fetchImpl:async(_url,options)=>{
    requests.push(JSON.parse(options.body));
    return reply(requests.length===1?review:{valid:false});
  }});
  await assert.rejects(provider.reviewDecision({context}),err('review_invalid'));
  assert.equal(requests.length,2);
  assert.equal(requests[0].text.format.schema.properties.phase.enum[0],'initial');
  assert.deepEqual(requests.map(({model,reasoning,store,max_output_tokens})=>({model,reasoning,store,max_output_tokens})),[
    {model:'gpt-6.1-sol',reasoning:{effort:'medium'},store:false,max_output_tokens:4096},
    {model:'gpt-6.1-sol',reasoning:{effort:'medium'},store:false,max_output_tokens:3072},
  ]);
  assert.deepEqual(requests[1].text.format.schema,requests[0].text.format.schema);
  assert.throws(()=>createScriptedCorrespondenceReviewer(),/Explicit/);
  const scripted=createScriptedCorrespondenceReviewer({reviews:[review]});
  assert.equal((await scripted.reviewDecision({context})).verified,true);
  await assert.rejects(scripted.reviewDecision({context}),/No scripted/);
});

test('Sol review records the models returned by both API calls and measures cached input',async()=>{
  const context=await contextFor(),review=reviewFor(context),corrected=structuredClone(review);
  corrected.criteria[0].level=3;
  corrected.criteria[0].findings.push({type:'missing',section:'facts',quote:'',sourceIds:['case-author-explanation'],explanation:'Требуется пояснение.'});
  corrected.summary='Проверенная оценка с уточнением критерия.';
  let count=0;
  const provider=createOpenAIProvider({apiKey:'test-only',fetchImpl:async()=>{
    const primary=++count===1;
    return {ok:true,json:async()=>({status:'completed',model:primary?'gpt-6.1-sol':'gpt-6.1-sol-test-snapshot',
      output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(primary?review:corrected)}]}],
      usage:{input_tokens:2000,input_tokens_details:{cached_tokens:1000},output_tokens:primary?350:50}})};
  }});
  const result=await provider.reviewDecision({context});
  assert.deepEqual(result.reviewModels,{assessment:'gpt-6.1-sol',verification:'gpt-6.1-sol-test-snapshot'});
  assert.deepEqual(result.review,corrected);
  assert.deepEqual(result.usage,{inputTokens:4000,cachedInputTokens:2000,outputTokens:400});
  assert.equal(reviewCostMicros(4000,400,2000),9200);
  const reservation=estimateReviewReservation({context});
  assert.equal(reservation.outputTokens,7168);
  assert.equal(reservation.micros,reviewCostMicros(reservation.inputTokens,reservation.outputTokens));
});
