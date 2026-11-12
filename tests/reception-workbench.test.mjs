import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BUNDLED_CALENDARS} from '../site/assets/js/calendar-bundled.js';
import {normalizeCalendarWorkbenchState,reduceCalendarWorkbench,calendarInterval,calendarWorkbenchView,createCalendarWorkbench,sourceLinkView,referenceView} from '../site/apps/reception/ai/workbench.js';
import {createSourceReference,referenceDecisionPatch,safeSourceURL} from '../site/apps/reception/js/source-reference.js';
import {sourceDocumentForURL} from '../site/apps/reception/js/source-reader.js';

const anchor=date=>reduceCalendarWorkbench({}, {type:'anchor',date});
const law={id:'reception-law59999',title:'Федеральный закон от 02.05.2006 N 59-ФЗ',number:'2 мая 2006 года N 59-ФЗ',sourceUrl:'https://www.consultant.ru/document/cons_doc_LAW_59999/'};
const unit={id:'law59999-u89',label:'Статья 12. Сроки рассмотрения письменного обращения',text:'Письменное обращение рассматривается в течение 30 дней со дня регистрации.'};

test('opening the calendar does not choose a legal anchor or a deadline for the student',()=>{
  const state=normalizeCalendarWorkbenchState({}, {date:'2026-11-12',events:[{id:'received',date:'2026-10-08'}]});
  assert.equal(state.month,'2026-11');assert.equal(state.anchorDate,'');assert.equal(state.selectedDate,'');
  assert.deepEqual(state.marks,[]);assert.equal(calendarInterval(state),null);
  const html=calendarWorkbenchView({state,date:'2026-11-12'});
  assert.match(html,/data-calendar-action="use-date" disabled/);
});

test('choosing an event starts a new manual count without marking or including the anchor',()=>{
  const earlier={...anchor('2026-04-20'),marks:['2026-04-21'],monthOrigin:'2026-04-20'};
  const state=reduceCalendarWorkbench(earlier,{type:'anchor',date:'2026-04-30'});
  assert.equal(state.selectedDate,'2026-04-30');assert.equal(state.anchorDate,'2026-04-30');
  assert.equal(state.monthOrigin,'');assert.deepEqual(state.marks,[]);
  assert.deepEqual(calendarInterval(state),{calendar:0,working:0,direction:1});
  assert.deepEqual(calendarInterval({...state,includeAnchor:true}),{calendar:1,working:1,direction:1});
});

test('day and working-day steps use the published holiday and transfer calendar',()=>{
  const state=anchor('2026-04-30');
  assert.equal(reduceCalendarWorkbench(state,{type:'step',unit:'day'}).selectedDate,'2026-05-01');
  const working=reduceCalendarWorkbench(state,{type:'step',unit:'working'});
  assert.equal(working.selectedDate,'2026-05-04');assert.deepEqual(working.marks,['2026-05-04']);
  assert.equal(reduceCalendarWorkbench(anchor('2025-10-31'),{type:'step',unit:'working'}).selectedDate,'2025-11-01','transferred working Saturday must be counted');
  assert.equal(reduceCalendarWorkbench(anchor('2025-12-30'),{type:'step',unit:'working'}).selectedDate,'2026-01-12','New Year break must not be guessed from weekdays');
});

test('repeated manual month steps keep the original day after February clipping',()=>{
  const february=reduceCalendarWorkbench(anchor('2026-01-31'),{type:'step',unit:'month'});
  const march=reduceCalendarWorkbench(february,{type:'step',unit:'month'});
  assert.equal(february.selectedDate,'2026-02-28');assert.equal(march.selectedDate,'2026-03-31');
  const newSelection=reduceCalendarWorkbench(march,{type:'select',date:'2026-03-15'});
  assert.equal(reduceCalendarWorkbench(newSelection,{type:'step',unit:'month'}).selectedDate,'2026-04-15');
});

test('counting is explicit, reversible and independent of the selected legal rule',()=>{
  const selected=reduceCalendarWorkbench(anchor('2026-04-30'),{type:'select',date:'2026-05-04'});
  assert.deepEqual(selected.marks,[]);assert.deepEqual(calendarInterval(selected),{calendar:4,working:1,direction:1});
  const marked=reduceCalendarWorkbench(selected,{type:'mark'});
  assert.deepEqual(marked.marks,['2026-05-04']);assert.deepEqual(reduceCalendarWorkbench(marked,{type:'mark'}).marks,[]);
  assert.deepEqual(reduceCalendarWorkbench(marked,{type:'clear'}).marks,[]);
  const moved=reduceCalendarWorkbench(marked,{type:'month',month:'2026-06'});
  assert.equal(moved.selectedDate,'2026-05-04');assert.deepEqual(moved.marks,marked.marks);
});

test('unavailable years fail visibly instead of manufacturing production-calendar days',()=>{
  const lastYear=Math.max(...Object.keys(BUNDLED_CALENDARS.years).map(Number));
  const last=anchor(`${lastYear}-12-31`);
  assert.throws(()=>reduceCalendarWorkbench(last,{type:'step',unit:'day'}),/unavailable/);
  assert.throws(()=>reduceCalendarWorkbench(last,{type:'anchor',date:`${lastYear+1}-01-01`}),/unavailable/);
  assert.equal(last.selectedDate,`${lastYear}-12-31`);
  const restored=normalizeCalendarWorkbenchState({anchorDate:'2026-02-30',selectedDate:'garbage',marks:['2026-04-30','2026-04-30','garbage']},{date:'2026-11-12'});
  assert.equal(restored.anchorDate,'');assert.equal(restored.selectedDate,'');assert.deepEqual(restored.marks,['2026-04-30']);
});

test('calendar presents shortened days, rest days and backward intervals in every UI language',()=>{
  for(const locale of ['ru','en','zh']){
    const state=reduceCalendarWorkbench(anchor('2026-04-30'),{type:'select',date:'2026-04-27'});
    const html=calendarWorkbenchView({state,locale,events:[{id:'event',date:'2026-04-30',label:{ru:'Получено',en:'Received',zh:'收到'}}]});
    assert.ok(html.includes('data-calendar-input="anchor"'));assert.match(html,/shortened[^>]+data-date="2026-04-30"/);
    assert.match(html,/class="rxw-calendar-day rest/);assert.ok(!html.includes('undefined'));
    assert.equal(calendarInterval(state).direction,-1);
  }
});

test('month grid completes adjacent weeks without exposing unsupported production-calendar years',()=>{
  const dates=html=>[...html.matchAll(/data-calendar-action="choose-date" data-date="([\d-]+)"/g)].map(match=>match[1]);
  const november=calendarWorkbenchView({state:{month:'2026-11'},date:'2026-11-12'}),cells=dates(november);
  assert.equal(cells.length,42);assert.equal(cells[0],'2026-10-26');assert.equal(cells.at(-1),'2026-12-06');
  assert.equal(new Set(cells).size,cells.length);assert.match(november,/outside-month[^>]+data-date="2026-12-01"/);
  assert.match(november,/case-date[^>]+data-date="2026-11-12"/);
  const years=Object.keys(BUNDLED_CALENDARS.years).sort();
  for(const month of [years[0]+'-01',years.at(-1)+'-12']){
    const html=calendarWorkbenchView({state:{month}}),supported=dates(html);
    assert.ok(supported.every(date=>BUNDLED_CALENDARS.years[date.slice(0,4)]));
    assert.equal((supported.length+(html.match(/class="rxw-calendar-empty"/g)||[]).length)%7,0);
  }
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

test('delegated calendar survives app panel replacement; only the explicit use action transfers a date',()=>{
  const root=hostFixture(),changes=[],used=[];
  const calendar=createCalendarWorkbench(root,{date:'2026-04-30',onChange:state=>changes.push(state),onUseDate:date=>used.push(date)});
  root.fire('click',{calendarAction:'anchor-event',date:'2026-04-30'});
  root.fire('click',{calendarAction:'step-working'});
  assert.equal(calendar.getState().selectedDate,'2026-05-04');assert.equal(changes.length,2);assert.deepEqual(used,[]);
  root.replace();calendar.update({locale:'en'});assert.match(root.slot.innerHTML,/Deadline calendar/);
  root.fire('click',{calendarAction:'use-date'});assert.deepEqual(used,['2026-05-04']);
  const snapshot=calendar.getState();snapshot.marks.push('2026-05-05');assert.deepEqual(calendar.getState().marks,['2026-05-04']);
  calendar.destroy();root.fire('click',{calendarAction:'step-day'});assert.equal(calendar.getState().selectedDate,'2026-05-04');
});

test('locked decisions, aborts and unavailable date edits cannot silently change a saved count',()=>{
  const root=hostFixture(),signal=new AbortController(),calendar=createCalendarWorkbench(root,{state:anchor('2026-04-30'),signal:signal.signal});
  calendar.update({disabled:true});root.fire('click',{calendarAction:'step-day'});assert.equal(calendar.getState().selectedDate,'2026-04-30');
  calendar.update({disabled:false});root.fire('change',{calendarInput:'anchor'},{value:'2026-02-30'});
  assert.equal(calendar.getState().anchorDate,'2026-04-30');assert.match(root.slot.status.textContent,/вне загруженного/);
  signal.abort();root.fire('click',{calendarAction:'step-day'});assert.equal(calendar.getState().selectedDate,'2026-04-30');
});
