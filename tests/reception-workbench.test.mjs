import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BUNDLED_CALENDARS} from '../site/assets/js/calendar-bundled.js';
import {normalizeCalendarWorkbenchState,reduceCalendarWorkbench,calendarWorkbenchView,createCalendarWorkbench,sourceLinkView,referenceView} from '../site/apps/reception/ai/workbench.js';
import {createSourceReference,referenceDecisionPatch,safeSourceURL} from '../site/apps/reception/js/source-reference.js';
import {sourceDocumentForURL} from '../site/apps/reception/js/source-reader.js';

const selected=date=>reduceCalendarWorkbench({activeTarget:'deadline'}, {type:'select',date});
const law={id:'reception-law59999',title:'Федеральный закон от 02.05.2006 N 59-ФЗ',number:'2 мая 2006 года N 59-ФЗ',sourceUrl:'https://www.consultant.ru/document/cons_doc_LAW_59999/'};
const unit={id:'law59999-u89',label:'Статья 12. Сроки рассмотрения письменного обращения',text:'Письменное обращение рассматривается в течение 30 дней со дня регистрации.'};

test('a blank calendar chooses no dates and keeps the registration judgment unanswered',()=>{
  const state=normalizeCalendarWorkbenchState({}, {date:'2026-11-12',events:[{id:'received',date:'2026-10-08'}]});
  assert.equal(state.month,'2026-10');assert.deepEqual(state.selectedDates,{referral:'',deadline:''});assert.equal(state.registrationTimely,null);
  const html=calendarWorkbenchView({state});assert.match(html,/data-calendar-action="use-date" disabled/);
  assert.doesNotMatch(html,/data-calendar-input="anchor"|anchor-event|step-day|step-working|step-month|Исходная дата|Дата дела|Инструменты расчёта/);
});

test('two manually chosen dates remain independent; clearing or changing one does not change the other',()=>{
  let state=reduceCalendarWorkbench({}, {type:'select',date:'2026-05-07'});
  state=reduceCalendarWorkbench(state,{type:'target',target:'deadline'});state=reduceCalendarWorkbench(state,{type:'select',date:'2026-05-30'});
  assert.deepEqual(state.selectedDates,{referral:'2026-05-07',deadline:'2026-05-30'});assert.equal(state.selectedDate,'2026-05-30');
  const cleared=reduceCalendarWorkbench(state,{type:'clear'});assert.deepEqual(cleared.selectedDates,{referral:'2026-05-07',deadline:''});
  const clearedOther=reduceCalendarWorkbench(state,{type:'clear',target:'referral'});
  assert.deepEqual(clearedOther.selectedDates,{referral:'',deadline:'2026-05-30'});
  assert.equal(clearedOther.activeTarget,'deadline');
  assert.deepEqual(reduceCalendarWorkbench(state,{type:'step',unit:'day'}),state,'Removed automatic calculator operations do nothing');
});

test('registration is the student’s judgment and never inferred from the event dates',()=>{
  const options={events:[{id:'received',date:'2026-04-01'},{id:'registered',date:'2026-04-20'}]};
  const state=normalizeCalendarWorkbenchState({},options);assert.equal(state.registrationTimely,null);
  const checked=reduceCalendarWorkbench(state,{type:'registration',value:true});assert.equal(checked.registrationTimely,true);
  assert.equal(reduceCalendarWorkbench(checked,{type:'registration',value:false}).registrationTimely,false);
  assert.equal(normalizeCalendarWorkbenchState(checked,options).registrationTimely,true);
});

test('old manually picked deadline migrates while anchors and calculator counts are discarded',()=>{
  const state=normalizeCalendarWorkbenchState({anchorDate:'2026-04-30',selectedDate:'2026-05-04',marks:['2026-05-04'],includeAnchor:true});
  assert.deepEqual(state.selectedDates,{referral:'',deadline:'2026-05-04'});assert.equal('anchorDate' in state,false);assert.equal('marks' in state,false);
  assert.throws(()=>reduceCalendarWorkbench(state,{type:'select',date:'2026-02-30'}),/unavailable/);
  assert.deepEqual(normalizeCalendarWorkbenchState({selectedDates:{deadline:'garbage',referral:'2026-02-30'}}).selectedDates,{referral:'',deadline:''});
});

test('coloured sent received and registered events coexist on the same day without selecting an answer',()=>{
  const events=['sent','received','registered'].map(id=>({id,label:id,date:'2026-04-30'}));
  const html=calendarWorkbenchView({events});for(const type of ['sent','received','registered'])assert.ok(html.includes('class="event-'+type+'"'));
  assert.match(html,/30 апреля 2026[^>]+sent, received, registered/);assert.doesNotMatch(html,/aria-pressed="true" aria-label=/);
  assert.match(html,/<strong>трех<\/strong> дней/);assert.match(html,/<strong>семи<\/strong> дней/);assert.match(html,/<strong>30<\/strong> дней/);
});

test('all three languages retain calendar dates, holiday markers and a complete keyboard grid',()=>{
  for(const locale of ['ru','en','zh']){
    const html=calendarWorkbenchView({locale,state:{month:'2026-04'}});
    assert.match(html,/shortened[^>]+data-calendar-action="choose-date" data-date="2026-04-30"/);
    assert.match(html,/data-calendar-details="norms"/);assert.equal((html.match(/data-calendar-action="choose-date"/g)||[]).length%7,0);
    assert.doesNotMatch(html,/step-day|anchor-event/);
  }
});

test('month edges include adjacent supported dates and never expose unavailable years',()=>{
  const dates=html=>[...html.matchAll(/data-calendar-action="choose-date" data-date="([\d-]+)"/g)].map(match=>match[1]);
  const november=calendarWorkbenchView({state:{month:'2026-11'}}),cells=dates(november);
  assert.equal(new Set(cells).size,cells.length);assert.match(november,/outside-month[^>]+data-date="2026-12-01"/);
  const years=Object.keys(BUNDLED_CALENDARS.years).sort();
  for(const month of [years[0]+'-01',years.at(-1)+'-12']){const html=calendarWorkbenchView({state:{month}}),supported=dates(html);assert.ok(supported.every(date=>BUNDLED_CALENDARS.years[date.slice(0,4)]));assert.equal((supported.length+(html.match(/class="rxw-calendar-empty"/g)||[]).length)%7,0);}
});

test('selected passage carries a stable citation with the original act metadata',()=>{
  const ref=createSourceReference(law,{units:[unit],text:'30 дней со дня регистрации'});
  assert.equal(ref.number,'59-ФЗ');assert.equal(ref.date,'2006-05-02');assert.equal(ref.article,'12');
  assert.equal(ref.documentNumber,law.number);assert.deepEqual(ref.unitIds,[unit.id]);assert.equal(ref.text,'30 дней со дня регистрации');
  assert.equal(ref.url,law.sourceUrl);assert.equal(ref.truncated,false);
  assert.equal(ref.id,createSourceReference(law,{units:[unit],text:ref.text}).id);
  assert.deepEqual(referenceDecisionPatch(ref),{law:{number:'59-ФЗ',article:'12'},actDate:'2006-05-02'});
  assert.equal('reasoning' in referenceDecisionPatch(ref),false,'a source quotation must not replace the student’s reasoning');
});

test('an ambiguous multi-article selection is quoted without inventing a single article answer',()=>{
  const ref=createSourceReference(law,{units:[unit,{id:'next',label:'Статья 13. Личный прием граждан',text:'Личный прием граждан проводится руководителями.'}]});
  assert.equal(ref.article,'');assert.match(ref.locator,/Статья 12.*Статья 13/);
  assert.equal('article' in referenceDecisionPatch(ref).law,false);
  assert.equal(createSourceReference(law,{units:[],text:'no legal unit'}),null);
  assert.equal(createSourceReference(law,{units:[unit],text:'   '}),null);
});

test('act dates never use the document revision date and large passages are explicitly marked',()=>{
  const ref=createSourceReference({...law,number:'Приказ Росархива от 22.05.2019 № 71',title:'Правила делопроизводства',revisionLabel:'Редакция от 09.07.2026'},{units:[{...unit,text:'а'.repeat(12001)}]});
  assert.equal(ref.number,'71');assert.equal(ref.date,'2019-05-22');assert.equal(ref.text.length,12000);assert.equal(ref.truncated,true);
  assert.match(referenceView(ref),/12 000/);
});

test('source links offer one action, keep internal documents in the platform and escape untrusted labels',()=>{
  const internal=sourceLinkView({url:law.sourceUrl,label:'<button>Read</button>'});
  assert.match(internal,/data-source-reader/);assert.doesNotMatch(internal,/target="_blank"/);assert.match(internal,/&lt;button&gt;Read/);
  const external=sourceLinkView({url:'https://example.org/document'});
  assert.match(external,/target="_blank" rel="noopener noreferrer"/);assert.doesNotMatch(external,/data-source-reader/);
  for(const url of ['javascript:alert(1)','data:text/html,wrong','https://secret@example.org/doc'])assert.equal(safeSourceURL(url),'');
  assert.doesNotMatch(sourceLinkView({url:'javascript:alert(1)'}),/<a/);
  const reference=createSourceReference(law,{units:[{...unit,text:'<img src=x onerror=alert(1)>'}]});
  assert.doesNotMatch(referenceView(reference),/<img/);assert.match(referenceView(reference),/&lt;img/);
});

test('every canonical source in the existing embedded corpus resolves back to that document',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../site/apps/reception/content/legal-documents/catalog.json',import.meta.url),'utf8'));
  for(const document of catalog.documents)assert.equal(sourceDocumentForURL(document.sourceUrl),document.id,document.title);
});

function hostFixture(){
  const listeners=new Map(),document={activeElement:null};
  const makeSlot=()=>({innerHTML:'',status:{textContent:''},contains(target){return target.slot===this;},querySelector(selector){return selector==='[data-calendar-status]'?this.status:null;}});
  const root={ownerDocument:document,slot:makeSlot(),matches:()=>false,querySelector(){return this.slot;},addEventListener(type,handler){listeners.set(type,handler);},removeEventListener(type,handler){if(listeners.get(type)===handler)listeners.delete(type);},fire(type,dataset,extra={}){const target={dataset,slot:this.slot,disabled:false,closest(){return this;},...extra};listeners.get(type)?.({target,preventDefault(){},...extra});},replace(){this.slot=makeSlot();}};
  return root;
}

test('delegated calendar survives panel replacement and transfers only the explicitly chosen target',()=>{
  const root=hostFixture(),changes=[],used=[];
  const calendar=createCalendarWorkbench(root,{date:'2026-04-30',onChange:state=>changes.push(state),onUseDate:(date,meta)=>used.push({date,...meta})});
  root.fire('click',{calendarAction:'event-month',date:'2026-04-30'});assert.deepEqual(calendar.getState().selectedDates,{referral:'',deadline:''});
  root.fire('click',{calendarAction:'choose-date',date:'2026-05-07'});assert.deepEqual(used,[]);
  root.replace();calendar.update({locale:'en'});assert.match(root.slot.innerHTML,/Deadline calendar/);
  root.fire('click',{calendarAction:'use-date'});assert.deepEqual(used,[{date:'2026-05-07',target:'referral'}]);
  root.fire('click',{calendarAction:'target',target:'deadline'});root.fire('click',{calendarAction:'choose-date',date:'2026-05-30'});root.fire('click',{calendarAction:'use-date'});
  assert.deepEqual(used[1],{date:'2026-05-30',target:'deadline'});
  root.fire('click',{calendarAction:'clear',target:'referral'});
  assert.deepEqual(calendar.getState().selectedDates,{referral:'',deadline:'2026-05-30'});
  assert.equal(calendar.getState().activeTarget,'deadline');
  const snapshot=calendar.getState();snapshot.selectedDates.deadline='2026-06-01';assert.equal(calendar.getState().selectedDates.deadline,'2026-05-30');
  calendar.destroy();root.fire('click',{calendarAction:'choose-date',date:'2026-06-02'});assert.equal(calendar.getState().selectedDate,'2026-05-30');
});

test('locked decisions, aborts and invalid dates cannot change saved choices',()=>{
  const root=hostFixture(),signal=new AbortController(),calendar=createCalendarWorkbench(root,{state:selected('2026-04-30'),signal:signal.signal});
  calendar.update({disabled:true});root.fire('click',{calendarAction:'choose-date',date:'2026-05-01'});root.fire('change',{calendarInput:'registration-timely'},{checked:true});assert.equal(calendar.getState().selectedDate,'2026-04-30');assert.equal(calendar.getState().registrationTimely,null);
  calendar.update({disabled:false});root.fire('click',{calendarAction:'choose-date',date:'2026-02-30'});assert.equal(calendar.getState().selectedDate,'2026-04-30');assert.match(root.slot.status.textContent,/вне загруженного/);
  signal.abort();root.fire('click',{calendarAction:'choose-date',date:'2026-05-01'});assert.equal(calendar.getState().selectedDate,'2026-04-30');
});


test('calendar legal help contains the requested complete provisions with highlighted periods',()=>{
  const html=calendarWorkbenchView({locale:'ru'});
  assert.match(html,/Федеральный закон от 02.05.2006 № 59-ФЗ/);
  assert.match(html,/обязательной регистрации в течение/);
  assert.match(html,/<strong>трех<\/strong> дней/);
  assert.match(html,/<strong>семи<\/strong> дней со дня регистрации/);
  assert.match(html,/<strong>30<\/strong> дней со дня регистрации письменного обращения/);
  assert.match(html,/Статья 8, часть 2/);
  assert.doesNotMatch(html,/Статья <strong>|часть <strong>/);
});

test('calendar keeps one instruction and adds an accessible clear control to each chosen date',()=>{
  const html=calendarWorkbenchView({state:{selectedDates:{referral:'2026-04-10',deadline:'2026-04-30'}},task:{autoCommit:true}});
  const beforeHelp=html.split('<details class="rxw-calendar-details"')[0];
  assert.match(beforeHelp,/<p class="rxw-calendar-instruction">Выберите даты в календаре<\/p>/);
  assert.doesNotMatch(beforeHelp,/Выберите срок|Моя оценка регистрации|Считайте|Инструменты расчёта/);
  assert.match(beforeHelp,/data-calendar-action="clear" data-target="referral" aria-label="Очистить дату — .* — 10\.04\.2026"/);
  assert.match(beforeHelp,/data-calendar-action="clear" data-target="deadline" aria-label="Очистить дату — .* — 30\.04\.2026"/);
  assert.doesNotMatch(beforeHelp,/data-calendar-action="use-date"/);
});

test('special workbooks show their own event, target and statutory quotation without authored instructions',()=>{
  const task={version:2,special:true,autoCommit:true,registrationCheck:false,
    targets:[{id:'deadline',label:'Рассмотреть жалобу до'}],
    events:[{id:'officialReceived',kind:'event',label:'Получено приставом',date:'2026-04-30'}],
    instructions:'Считайте 10 рабочих дней со следующего дня.',
    norms:[{label:'Федеральный закон № 229-ФЗ',text:'Статья 126, часть 1. В течение десяти рабочих дней.'}]};
  const html=calendarWorkbenchView({task,normsOpen:true}),[beforeHelp,help]=html.split('<details class="rxw-calendar-details"');
  assert.match(beforeHelp,/class="event-other">Получено приставом<\/span>/);
  assert.match(beforeHelp,/data-calendar-action="target" data-target="deadline"/);
  assert.doesNotMatch(beforeHelp,/data-calendar-action="target" data-target="referral"|registration-timely|Считайте/);
  assert.match(help,/rxw-calendar-norms-badge/);
  assert.doesNotMatch(help,/Считайте|rxw-calendar-counting-help/);
  assert.match(help,/Статья 126, часть 1\. В течение <strong>десяти<\/strong> рабочих дней/);
  assert.doesNotMatch(help,/Статья 8|Федеральный закон от 02\.05\.2006/);
});


test('calendar statutory citations retain their exact article URL and open the original source',()=>{
  const url='https://www.consultant.ru/document/cons_doc_LAW_59999/0c7123ee40ad90f89afa6fa544a87ffe76c084c0/';
  const html=calendarWorkbenchView({task:{norms:[{label:'59-ФЗ, ст. 8, ч. 2',text:'Письменное обращение подлежит обязательной регистрации в течение трех дней с момента поступления.',url}],instructions:'Не показывать авторскую инструкцию.'}});
  assert.ok(html.includes(`href="${url}" target="_blank" rel="noopener noreferrer"`));
  assert.doesNotMatch(html,/data-source-reader|Не показывать авторскую инструкцию|rxw-calendar-counting-help/);
});
