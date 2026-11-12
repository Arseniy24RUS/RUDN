import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceptionStorage} from '../site/apps/reception/ai/session-storage.js';

const VERSION='reception-ai-ui-v1';
function memory(){const entries=new Map();return {get length(){return entries.size;},key:index=>[...entries.keys()][index]??null,getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key),entries};}
const adapter=(store,owner='student-one',context='course',endpoint='/api/reception')=>createReceptionStorage({store,owner,endpoint,version:VERSION,legacyKey:`legacy:${owner}:${context}:${endpoint}`});
const draft=(overrides={})=>({version:VERSION,owner:'student-one',sessionId:'shift-one',caseId:'same-case',caseTitle:'Учебное дело',mode:'training',status:'active',draftMessage:'Уточню дату.',decisionDraft:{law:{number:'59-ФЗ',article:'12'},deadline:'2026-05-15',reasoning:'Черновик решения'},calendarState:{anchorDate:'2026-04-15',selectedDate:'2026-05-15',marks:['2026-05-15']},selectedReferences:[{id:'law59-article12',text:'Выбранная норма'}],readMessageIds:['opening'],...overrides});

test('one student resumes the same workspace draft through course and free routes',()=>{
  const store=memory(),course=adapter(store),free=adapter(store,'student-one','free');
  assert.equal(course.save(draft()),true);
  const recovered=free.readInitial();assert.equal(recovered.sessionId,'shift-one');
  assert.deepEqual(recovered.decisionDraft,draft().decisionDraft);assert.deepEqual(recovered.calendarState,draft().calendarState);
  assert.deepEqual(recovered.selectedReferences,draft().selectedReferences);assert.deepEqual(recovered.readMessageIds,['opening']);
  assert.equal(free.save({...recovered,draftMessage:'Новый уточняющий вопрос.'}),true);
  assert.equal(course.readInitial().draftMessage,'Новый уточняющий вопрос.');
});

test('owner and backend endpoint isolate saved shifts and recent-session cards',()=>{
  const store=memory();adapter(store).save(draft());
  for(const other of [adapter(store,'student-two'),adapter(store,'student-one','course','/api/other-reception')]){
    assert.equal(other.readInitial(),null);assert.equal(other.readSession('shift-one'),null);assert.deepEqual(other.recent(),[]);
  }
  const forged=draft({owner:'student-two'});assert.equal(adapter(store).save(forged),false);
});

test('a legacy draft is read intact and gains route-independent recovery on its next save',()=>{
  const store=memory(),old=draft({pending:{op:'message',requestId:'message-one',text:'Уточню дату.'},pendingAt:123});
  store.setItem('legacy:student-one:course:/api/reception',JSON.stringify(old));
  const course=adapter(store);assert.deepEqual(course.readInitial(),old);assert.equal(course.save(course.readInitial()),true);
  assert.deepEqual(adapter(store,'student-one','free').readInitial().pending,old.pending);
  assert.equal(course.readSession('shift-one').pending.requestId,'message-one');
});

test('first upgrade finds the latest matching v3 draft from another route and period',()=>{
  const store=memory(),endpoint=encodeURIComponent('/api/reception');
  store.setItem(`rudn.reception.ai.v1:student-one:course:2025-2026:${endpoint}`,JSON.stringify(draft({sessionId:'older-shift',savedAt:10})));
  store.setItem(`rudn.reception.ai.v1:student-one:course:2026-2027:${endpoint}`,JSON.stringify(draft({sessionId:'latest-shift',savedAt:20})));
  store.setItem(`rudn.reception.ai.v1:student-two:course:2026-2027:${endpoint}`,JSON.stringify(draft({owner:'student-two',sessionId:'other-owner',savedAt:50})));
  store.setItem('rudn.reception.ai.v1:student-one:course:2026-2027:%2Fapi%2Fother',JSON.stringify(draft({sessionId:'other-backend',savedAt:80})));
  assert.equal(adapter(store,'student-one','free').readInitial().sessionId,'latest-shift');
});

test('a new attempt of the same case keeps each session draft separate',()=>{
  const store=memory(),storage=adapter(store);storage.save(draft());
  storage.save(draft({sessionId:'shift-two',draftMessage:'Начинаю заново.',decisionDraft:{law:{number:'',article:''},deadline:'',reasoning:''}}));
  assert.equal(storage.readInitial().sessionId,'shift-two');
  assert.equal(storage.readSession('shift-one').draftMessage,'Уточню дату.');
  assert.equal(storage.readSession('shift-one').decisionDraft.law.article,'12');
  assert.equal(storage.readSession('shift-two').decisionDraft.law.article,'');
  assert.deepEqual(storage.recent().map(item=>item.id),['shift-two','shift-one']);
});

test('a pending new start can be retried without attaching its operation to the old saved session',()=>{
  const store=memory(),storage=adapter(store);storage.save(draft());
  const pending={op:'start',requestId:'start-two',mode:'training',caseId:'another-case'};
  storage.save(draft({pending,pendingAt:456}));
  assert.deepEqual(storage.readInitial().pending,pending);assert.equal(storage.readInitial().pendingAt,456);
  const old=storage.readSession('shift-one');assert.equal(old.pending,null);assert.equal(old.pendingAt,null);
  assert.equal(old.draftMessage,'Уточню дату.');assert.equal(old.decisionDraft.law.article,'12');
});

test('clearing the current pointer preserves session drafts; corrupt or incompatible data is not restored',()=>{
  const store=memory(),storage=adapter(store);storage.save(draft());
  assert.equal(storage.clearCurrent(),true);assert.equal(storage.readInitial(),null);
  assert.equal(storage.readSession('shift-one').sessionId,'shift-one');assert.equal(storage.recent().length,1);
  store.setItem('legacy:student-one:course:/api/reception','{broken');assert.equal(storage.readInitial(),null);
  store.setItem('legacy:student-one:course:/api/reception',JSON.stringify(draft({version:'incompatible'})));assert.equal(storage.readInitial(),null);
  const denied=createReceptionStorage({store:{getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');},removeItem(){throw Error('Blocked');}},owner:'student-one',version:VERSION,legacyKey:'legacy'});
  assert.equal(denied.readInitial(),null);assert.equal(denied.save(draft()),false);assert.equal(denied.clearCurrent(),false);
});
