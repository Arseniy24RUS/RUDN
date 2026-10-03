import assert from 'node:assert/strict';
import test from 'node:test';
import {settlementsCourseStatus as status,settlementsCourseMessage as message,readSettlementsCourseDrafts as readDrafts} from '../site/assets/js/settlements-course-status.js';

const owner='student:synthetic-course-status';
const result=(coverageNp=100)=>({terminal:true,reason:'complete',coverageNp,coveragePopulation:100,turns:12,spentMillionRub:3});
const party=(state={},extra={})=>({owner,activitySlug:'seminar-3',mode:'settlements-assessment',saveStatus:{state:'pending'},state:{status:'completion-pending',difficulty:'hard',result:result(),...state},...extra});
const tutorial=(extra={})=>({owner,activitySlug:'settlements-tutorial',mode:'tutorial',state:{completed:true},...extra});

test('owned assessed pending result respects difficulty and exact 90% threshold',()=>{
  for(const [difficulty,points] of [['hard',5],['normal',4],['easy',3]])for(const coverage of [90,100]){
    assert.deepEqual(status(party({difficulty,result:result(coverage)}),null,null,owner),{kind:'pending',points});
  }
  for(const coverage of [0,89.99,89.999999999])assert.deepEqual(status(party({result:result(coverage)}),null,null,owner),{kind:'pending',points:0});
});

test('completed checkpoint still awaits a grade receipt',()=>{
  assert.deepEqual(status(party({status:'completed'}, {saveStatus:{state:'saved'}}),null,null,owner),{kind:'pending',points:5});
});

test('tutorial never supplies credit; free and foreign parties are excluded',()=>{
  assert.deepEqual(status(null,tutorial(),null,owner),{kind:'tutorial'});
  assert.equal(status(party({}, {activitySlug:'settlements-freeplay',mode:'settlements-free'}),null,null,owner),null);
  assert.equal(status(party({}, {mode:'settlements-free'}),null,null,owner),null);
  assert.equal(status(party({}, {owner:'student:foreign'}),null,null,owner),null);
  assert.equal(status(null,tutorial({owner:'student:foreign'}),null,owner),null);
  for(const identity of ['guest:settlements','teacher:synthetic',undefined])assert.equal(status(party(),tutorial(),null,identity),null);
});

test('conflict is distinct from pending credit',()=>{
  assert.deepEqual(status(party({}, {saveStatus:{state:'conflict'}}),tutorial(),null,owner),{kind:'conflict'});
});

test('active party has no provisional credit; terminal replay requests recovery',()=>{
  assert.deepEqual(status(party({status:'active',engineSave:{actions:[]}}),null,null,owner),{kind:'active'});
  for(const reason of ['complete','budget_exhausted'])for(const stringify of [false,true]){
    const save={actions:[{type:'synthetic'}],ui:{terminalReason:reason}};
    assert.deepEqual(status(party({status:'active',engineSave:stringify?JSON.stringify(save):save}),null,null,owner),{kind:'recover'});
  }
  assert.deepEqual(status(party({status:'active',engineSave:'invalid json'}),null,null,owner),{kind:'recover'});
  assert.deepEqual(status(party({result:{...result(),terminal:false}}),null,null,owner),{kind:'recover'});
});

test('confirmed best grade never downgrades or gains a false pending label',()=>{
  for(const points of [3,4,5])for(const difficulty of ['easy','normal','hard']){
    const expected={easy:3,normal:4,hard:5}[difficulty],grade={points,max:5};
    const before=structuredClone(grade);
    assert.deepEqual(status(party({difficulty}),null,grade,owner),points>=expected?null:{kind:'pending',points:expected});
    assert.deepEqual(grade,before);
  }
  assert.equal(status(party({status:'active'}),tutorial(),{points:5},owner),null);
  assert.equal(status(null,tutorial(),{points:0},owner),null);
  assert.equal(status(party({result:result(89.99)}),null,{points:0},owner),null);
});

test('all receipt states are localized in RU EN ZH with no spurious credit',()=>{
  const messages={};
  for(const locale of ['ru','en','zh']){
    messages[locale]={};
    for(const kind of ['pending','conflict','recover','active','tutorial']){
      const value=message({kind,points:5},locale);messages[locale][kind]=value;
      assert.ok(value.length>5,`${locale}:${kind}`);assert.ok(!value.includes('undefined'));
      assert.equal(value.startsWith('5/5 · '),kind==='pending');
      if(locale==='ru')assert.match(value,/[А-Яа-яЁё]/);
      if(locale==='en')assert.match(value,/[A-Za-z]/);
      if(locale==='zh')assert.match(value,/[\u3400-\u9FFF]/);
    }
    assert.equal(message(null,locale),'');assert.equal(message({kind:'unknown'},locale),'');
  }
  for(const kind of Object.keys(messages.ru))assert.equal(new Set(Object.values(messages).map(value=>value[kind])).size,3,kind);
});

test('draft reads use only the owned assessed and tutorial scopes',async()=>{
  const calls=[],store={loadDraft:async scope=>{calls.push(scope);return scope}};
  const reads=await readDrafts(store,owner);
  assert.deepEqual(calls,[{owner,activitySlug:'seminar-3',mode:'settlements-assessment'},{owner,activitySlug:'settlements-tutorial',mode:'tutorial'}]);
  assert.deepEqual(reads,calls);
  for(const identity of ['guest:settlements','teacher:synthetic',null])assert.deepEqual(await readDrafts(store,identity),[null,null]);
  assert.equal(calls.length,2);
});
