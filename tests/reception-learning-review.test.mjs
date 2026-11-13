import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {LEARNING_REVIEW_DATA} from '../firebase/functions/reception-ai/learning-review-data.mjs';
import {learningReviewFor} from '../firebase/functions/reception-ai/learning-review.mjs';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createMemoryStore} from '../firebase/functions/reception-ai/store.mjs';
import {learningReviewView,workRecordView} from '../site/apps/reception/ai/learning-review.js';

const dossier=(id='budget')=>{
  const row=LEARNING_REVIEW_DATA[id];
  return {id,provenance:{sourceCaseId:id,sourceContentVersion:row.sourceContentVersion,sourceSHA256:row.sourceSHA256,calendarYear:2026,dateValues:{}},public:{title:row.title,assessment:{calendar:{events:[]}}},documents:[]};
};
test('the registry preserves all 175 authored contrasts and 120 conclusions exactly',async()=>{
  const directory=new URL('../site/apps/reception/content/cases/',import.meta.url),names=(await readdir(directory)).filter(name=>name.endsWith('.json')).sort();
  assert.equal(names.length,178);assert.equal(Object.keys(LEARNING_REVIEW_DATA).length,178);
  let contrasts=0,conclusions=0;
  const templates=[];
  for(const name of names){
    const raw=await readFile(new URL(name,directory),'utf8'),c=JSON.parse(raw).template,row=LEARNING_REVIEW_DATA[c.id];templates.push(c);
    assert.ok(row);assert.equal(row.sourceSHA256,createHash('sha256').update(raw).digest('hex'));
    assert.equal(row.sourceContentVersion,c.contentVersion);assert.equal(row.title.ru,c.title);assert.equal(row.curriculumId,c.curriculumId||null);
    if(!c.contrast){assert.equal(row.contrast,undefined);continue;}
    contrasts++;assert.equal(row.contrast.difference.ru,c.contrast.difference);
    assert.equal(row.contrast.decision?.ru,c.contrast.decision);
    if(c.contrast.decision)conclusions++;
    for(const locale of ['ru','en','zh']){
      assert.ok(row.title[locale]);assert.ok(row.contrast.difference[locale]);
      if(c.contrast.decision)assert.ok(row.contrast.decision[locale]);
    }
    assert.equal('notCosmetic' in row.contrast,false,'Editorial notes are not student feedback');
  }
  assert.equal(contrasts,175);assert.equal(conclusions,120);
  for(const c of templates.filter(c=>c.contrast)){
    const review=learningReviewFor({mode:'training',status:'review',caseData:dossier(c.id)});
    assert.deepEqual(review.related.map(row=>row.id).sort(),templates.filter(other=>other.id!==c.id&&other.curriculumId===c.curriculumId).map(row=>row.id).sort());
    assert.ok(review.related.every(row=>Object.keys(row).sort().join(',')==='id,title'),'Related cases expose titles, not their answers');
  }
});

test('contrast is unavailable before the follow-up and in every independent state',()=>{
  for(const mode of ['training','independent'])for(const status of ['active','followup','review','complete']){
    const review=learningReviewFor({mode,status,caseData:dossier()});
    assert.equal(Boolean(review),mode==='training'&&['review','complete'].includes(status),`${mode}/${status}`);
  }
  const poison=new Proxy({}, {get(){throw Error('Must not inspect an active dossier');}});
  assert.equal(learningReviewFor({mode:'training',status:'active',caseData:poison}),null);
});

test('unknown, unversioned or changed dossiers do not receive a stale authored explanation',()=>{
  const valid=dossier();
  for(const bad of [{id:'unknown'},{id:'budget'}, {...valid,provenance:{...valid.provenance,sourceSHA256:'0'.repeat(64)}},{...valid,provenance:{...valid.provenance,sourceContentVersion:'changed'}},{...valid,provenance:{...valid.provenance,sourceCaseId:'budget-link'}}])assert.equal(learningReviewFor({mode:'training',status:'complete',caseData:bad}),null);
  for(const id of ['authority-contact','river-observation','river-old-photo'])assert.equal(learningReviewFor({mode:'training',status:'review',caseData:dossier(id)}),null);
});

test('the only dated contrast is resolved from the selected date variant, never the base pack',()=>{
  const first=dossier('flight-agent-receipt');first.provenance.dateValues={carrierISO:'2026-04-23'};first.public.assessment.calendar.events=[{id:'carrier',date:'2026-04-23'}];
  const second=structuredClone(first);second.provenance.dateValues.carrierISO='2026-06-04';second.public.assessment.calendar.events[0].date='2026-06-04';
  for(const locale of ['ru','en','zh']){
    const a=learningReviewFor({mode:'training',status:'review',caseData:first,locale}),b=learningReviewFor({mode:'training',status:'review',caseData:second,locale});
    assert.ok(a.decision.includes('23.04.2026'));assert.ok(b.decision.includes('04.06.2026'));assert.ok(!b.decision.includes('23.04.2026'));assert.ok(!b.decision.includes('{{'));
  }
  const absent=dossier('flight-agent-receipt');assert.equal(learningReviewFor({mode:'training',status:'review',caseData:absent}).decision,'');
  second.public.assessment.calendar.events[0].date='2026-04-23';assert.equal(learningReviewFor({mode:'training',status:'review',caseData:second}).decision,'','Conflicting date provenance omits the date-specific conclusion');
});

test('the actual resume API releases contrast only after a complete training case',async()=>{
  const store=createMemoryStore(),provider={name:'mock',async generate(){throw Error('No model call needed');}},service=createReceptionService({store,cases:[],provider});
  const identity={uid:'review-test',studentKey:'review-test'};
  const answer={procedureId:'p',routeId:'r',actionIds:[],law:{number:'59-ФЗ',article:'8'},deadline:'2026-05-04',basisDocumentIds:[],reasoning:'Запись студента'};
  for(const mode of ['training','independent'])for(const status of ['active','followup','review','complete']){
    const caseData=dossier(),id=`${mode}-${status}`,session={id,owner:'student:review-test',mode,status,locale:'ru',revision:4,caseIndex:0,startedAt:1,updatedAt:2,caseData:[caseData],requests:{},results:status==='complete'?[{score:80}]:[],result:status==='complete'?{points:4,total:80,attemptId:'done'}:null,caseStates:[{messages:[],knownFactIds:[],releasedDocumentIds:[],openedDocumentIds:[],decision:status==='active'?null:answer,feedback:null,followupChoiceId:status==='review'||status==='complete'?'confirmed':null}]};
    await store.transaction('sessions/'+id,()=>session);
    const {view}=await service.handle({op:'resume',sessionId:id},identity),allowed=mode==='training'&&['review','complete'].includes(status);
    assert.equal(Boolean(view.learningReview),allowed,`${mode}/${status}`);
    const serialized=JSON.stringify(view);assert.equal(serialized.includes(LEARNING_REVIEW_DATA.budget.contrast.difference.ru),allowed);
    assert.equal(serialized.includes(LEARNING_REVIEW_DATA['budget-link'].contrast.difference.ru),false,'A sibling’s explanation stays server-side');
    assert.doesNotMatch(serialized,/sourceSHA256|sourceContentVersion|dateValues|notCosmetic/);
  }
});

test('the review renderer repeats the gate and offers only available completed-training cases',()=>{
  const review=learningReviewFor({mode:'training',status:'review',caseData:dossier()}),base={mode:'training',status:'review',case:{id:'budget'},learningReview:review};
  assert.equal(learningReviewView({view:{...base,status:'active'}}),'');assert.equal(learningReviewView({view:{...base,mode:'independent'}}),'');
  assert.match(learningReviewView({view:base}),/Что изменило решение/);assert.doesNotMatch(learningReviewView({view:base}),/data-action="related-training"/);
  const catalog=[{id:review.related[0].id,title:review.related[0].title}],html=learningReviewView({view:{...base,status:'complete'},catalog});
  assert.equal((html.match(/data-action="related-training"/g)||[]).length,1);assert.ok(html.includes(`data-case-id="${catalog[0].id}"`));
  for(const locale of ['en','zh'])assert.ok(learningReviewView({view:{...base,status:'complete'},catalog,locale}).length>0);
  const malicious={...base,learningReview:{...review,difference:'<img src=x onerror=alert(1)>'}};assert.doesNotMatch(learningReviewView({view:malicious}),/<img/);
});

test('the work record contains only the student choices and opened materials, in their action order',()=>{
  const view={status:'review',messages:[{role:'user',text:'Уточните дату <script>'},{role:'assistant',text:'Ответ персонажа'}],case:{procedures:[{id:'p',label:'Общий порядок'}],routes:[{id:'r',label:'Муниципальный орган'}],actions:[{id:'second',label:'Второе действие'},{id:'first',label:'Первое действие'}]},decision:{procedureId:'p',routeId:'r',actionIds:['first','second'],law:{number:'59-ФЗ',article:'8'},deadline:'2026-05-04',reasoning:'Моё обоснование'},documents:[{id:'shown',title:'Изученная квитанция'},{id:'hidden',title:'Неоткрытое письмо'}],openedDocumentIds:['shown']};
  assert.equal(workRecordView({view:{...view,status:'active'}}),'');
  const html=workRecordView({view});assert.match(html,/data-work-record/);assert.match(html,/Моё обоснование/);assert.match(html,/Изученная квитанция/);assert.doesNotMatch(html,/Неоткрытое письмо|Ответ персонажа|<script>/);assert.ok(html.indexOf('Первое действие')<html.indexOf('Второе действие'));
  for(const locale of ['ru','en','zh'])assert.ok(workRecordView({view,locale}).includes('59-ФЗ'));
});


test('workbook records retain the selected recipient and both deadlines without using an answer key',()=>{
  const view={status:'review',case:{routes:[]},decision:{routeId:'',actionIds:[],law:{},deadline:'2026-12-11',workbook:{referralDeadline:'2026-11-18',registrationTimely:false,routing:{recipientIds:['rkn']}}}};
  const html=workRecordView({view});
  assert.match(html,/Федеральная служба по надзору в сфере связи/);assert.match(html,/2026-12-11/);assert.match(html,/2026-11-18/);
  assert.doesNotMatch(html,/Правильный ответ|Нужно исправить/);
});
