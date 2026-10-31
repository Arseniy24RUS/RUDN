import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTION_IDS,PAPER_SIZE,PER_SECTION,validateBank,availableQuestions,createAttempt,
  validateAttempt,getAttemptQuestions,setAnswer as setTimedAnswer,gradeAttempt,finishAttempt,
  TEST_DURATION_MS,attemptDeadline,remainingAttemptTime,isAttemptExpired
} from '../site/assets/js/civil-service-model.mjs';

// TEST-ONLY synthetic pool. These are deliberately not real civil-service
// questions and must never be copied into the published educational bank.
const languages=value=>({ru:`Тестовый ${value}`,en:`Synthetic ${value}`,zh:`测试 ${value}`});
function fixture(perSection=20){return {
 schemaVersion:1,contentVersion:'synthetic-test-only-v1',origin:'TEST-ONLY — not official educational content',
 questions:SECTION_IDS.flatMap(sectionId=>Array.from({length:perSection},(_,index)=>({
  id:`test-only:${sectionId}:${String(index).padStart(2,'0')}`,sectionId,
  stem:languages(`question ${index}`),options:['a','b','c','d'].map(id=>({id,text:languages(`option ${id}`)})),
  correctOptionIds:index%3===0?['a','c']:['b'],review:{status:'verified',kind:'synthetic-test-only'}
 })))
};}
const options={id:'test-only-attempt-001',seed:123456,startedAt:1700000000000};
// A deterministic answer clock keeps replay/grading tests independent of wall time.
const setAnswer=(bank,attempt,id,answer)=>setTimedAnswer(bank,attempt,id,answer,{now:options.startedAt+1000});
const attemptFor=(bank=fixture(),overrides={})=>createAttempt(bank,{...options,...overrides});
const throwsCode=(fn,code)=>assert.throws(fn,error=>error.code===`civil-service/${code}`);
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
function answerCorrectly(bank,attempt,count=PAPER_SIZE){
 for(const question of getAttemptQuestions(bank,attempt).slice(0,count))attempt=setAnswer(bank,attempt,question.id,question.correctOptionIds);
 return attempt;
}

test('fixed seed replays the same 40 question IDs without mutating bank or options',()=>{
 const bank=frozen(fixture()),before=JSON.stringify(bank),input=frozen({...options});
 const first=createAttempt(bank,input),second=createAttempt(bank,input);
 assert.deepEqual(first,second);assert.equal(JSON.stringify(bank),before);
 assert.deepEqual(input,options);assert.equal(first.questionIds.length,40);assert.equal(new Set(first.questionIds).size,40);
 const reversed={...bank,questions:[...bank.questions].reverse()};
 assert.deepEqual(createAttempt(reversed,input).questionIds,first.questionIds,'Source array ordering must not alter a versioned seeded paper');
});

test('different seeds sample a real pool: eight from each of five sections, no repeats, varied papers',()=>{
 const bank=fixture(),ids=new Map(bank.questions.map(q=>[q.id,q.sectionId])),papers=new Set(),selected=new Set();
 for(let seed=0;seed<32;seed++){
  const attempt=attemptFor(bank,{seed});assert.equal(validateAttempt(bank,attempt),true);
  const counts=Object.fromEntries(SECTION_IDS.map(section=>[section,0]));
  for(const id of attempt.questionIds){counts[ids.get(id)]++;selected.add(id);}
  assert.deepEqual(Object.values(counts),[8,8,8,8,8]);assert.equal(new Set(attempt.questionIds).size,PAPER_SIZE);
  papers.add(attempt.questionIds.join('|'));
 }
 assert.equal(papers.size,32);assert.equal(selected.size,bank.questions.length);
});

test('unreviewed questions cannot enter the sampled pool or an imported paper',()=>{
 const bank=fixture();for(const q of bank.questions.filter((_,i)=>i%20>=12))q.review.status='pending';
 assert.equal(availableQuestions(bank).length,60);
 const attempt=attemptFor(bank),unreviewed=bank.questions.find(q=>q.review.status==='pending');
 assert(attempt.questionIds.every(id=>bank.questions.find(q=>q.id===id).review.status==='verified'));
 const altered=structuredClone(attempt),replace=altered.questionIds.findIndex(id=>bank.questions.find(q=>q.id===id).sectionId===unreviewed.sectionId);
 altered.questionIds[replace]=unreviewed.id;throwsCode(()=>validateAttempt(bank,altered),'invalid-attempt');
});

test('any incomplete section refuses a paper instead of silently reducing size',()=>{
 for(const sectionId of SECTION_IDS){
  const bank=fixture(PER_SECTION);bank.questions.find(q=>q.sectionId===sectionId).review.status='pending';
  throwsCode(()=>createAttempt(bank,options),'pool-incomplete');
 }
});

test('reviewed bank requires complete RU/EN/ZH text and a nonempty valid official key',()=>{
 assert.equal(validateBank(fixture()),true);
 for(const modify of [q=>q.stem.en='',q=>delete q.options[0].text.zh,q=>q.correctOptionIds=[]]){
  const bank=fixture();modify(bank.questions[0]);throwsCode(()=>validateBank(bank),'translation-incomplete');
 }
 for(const modify of [q=>q.correctOptionIds=['absent'],q=>q.correctOptionIds=['a','a'],q=>q.options[1].id='a']){
  const bank=fixture();modify(bank.questions[0]);throwsCode(()=>validateBank(bank),'invalid-bank');
 }
 const duplicate=fixture();duplicate.questions.push(structuredClone(duplicate.questions[0]));throwsCode(()=>validateBank(duplicate),'invalid-bank');
});

test('multiple-answer questions receive credit only for the exact set, independent of order',()=>{
 const bank=fixture(),attempt=attemptFor(bank),question=getAttemptQuestions(bank,attempt).find(q=>q.correctOptionIds.length>1);
 for(const [answers,expected] of [[['a','c'],1],[['c','a'],1],[['a'],0],[['c'],0],[['a','c','b'],0],[['b','d'],0],[[],0]]){
  const updated=setAnswer(bank,attempt,question.id,answers),result=gradeAttempt(bank,updated);
  assert.equal(result.correct,expected,JSON.stringify(answers));
 }
});

test('invalid question IDs, duplicate choices, unknown choices and multi-select on single-answer questions are rejected',()=>{
 const bank=fixture(),attempt=attemptFor(bank),question=getAttemptQuestions(bank,attempt).find(q=>q.correctOptionIds.length===1);
 for(const answer of [['a','b'],['b','b'],['missing'],null,{},'b',1])throwsCode(()=>setAnswer(bank,attempt,question.id,answer),'invalid-answer');
 throwsCode(()=>setAnswer(bank,attempt,'not-in-paper',['b']),'invalid-answer');
 const unselected=bank.questions.find(q=>!attempt.questionIds.includes(q.id));throwsCode(()=>setAnswer(bank,attempt,unselected.id,['b']),'invalid-answer');
 assert.deepEqual(attempt.answers,{});
});

test('all-correct result is exactly 5 points; partial score is 5 × correct / 40 rounded to two decimals',()=>{
 const bank=fixture();
 for(const correct of [0,1,2,7,17,20,31,39,40]){
  const answered=answerCorrectly(bank,attemptFor(bank),correct),result=gradeAttempt(bank,answered);
  assert.equal(result.correct,correct);assert.equal(result.total,40);assert.equal(result.maxPoints,5);
  assert.equal(result.percent,Math.round(10000*correct/40)/100);
  assert.equal(result.points,Math.round(500*correct/40)/100);
  assert.equal(result.questionResults.length,40);
 }
 assert.equal(gradeAttempt(bank,answerCorrectly(bank,attemptFor(bank),17)).points,2.13);
 assert.equal(gradeAttempt(bank,answerCorrectly(bank,attemptFor(bank))).points,5);
});

test('answer editing, scoring and finishing are pure; caller answer arrays are copied',()=>{
 const bank=frozen(fixture()),attempt=frozen(attemptFor(bank)),before=JSON.stringify(attempt),question=getAttemptQuestions(bank,attempt)[0],selected=[...question.correctOptionIds];
 const updated=setAnswer(bank,attempt,question.id,selected);selected.length=0;
 assert.deepEqual(updated.answers[question.id],question.correctOptionIds);assert.equal(JSON.stringify(attempt),before);
 const updatedBefore=JSON.stringify(updated);gradeAttempt(bank,frozen(updated));finishAttempt(bank,updated,{finishedAt:options.startedAt+3000});
 assert.equal(JSON.stringify(updated),updatedBefore);
});

test('completed attempt rejects edits and re-finalization is idempotent with its original timestamp and result',()=>{
 const bank=fixture(),active=answerCorrectly(bank,attemptFor(bank),17),activeBefore=JSON.stringify(active);
 const completed=finishAttempt(bank,active,{finishedAt:options.startedAt+4000}),snapshot=JSON.stringify(completed);
 assert.equal(completed.phase,'completed');assert.equal(completed.result.points,2.13);assert.equal(JSON.stringify(active),activeBefore);
 const repeated=finishAttempt(bank,frozen(completed),{finishedAt:options.startedAt+999999});
 assert.deepEqual(repeated,completed);assert.notEqual(repeated,completed);assert.equal(JSON.stringify(completed),snapshot);
 throwsCode(()=>setAnswer(bank,completed,completed.questionIds[0],[]),'already-completed');
 repeated.result.questionResults[0].selectedOptionIds.push('not-shared');assert.equal(JSON.stringify(completed),snapshot);
});

test('tampered final result is rejected instead of silently rewriting saved marks',()=>{
 const bank=fixture(),completed=finishAttempt(bank,answerCorrectly(bank,attemptFor(bank),10),{finishedAt:options.startedAt+4000});
 for(const modify of [x=>x.result.points=5,x=>x.result.correct=40,x=>x.result.questionResults[0].correct=!x.result.questionResults[0].correct]){
  const stored=structuredClone(completed);modify(stored);const before=JSON.stringify(stored);
  throwsCode(()=>finishAttempt(bank,stored),'result-mismatch');assert.equal(JSON.stringify(stored),before);
 }
});

test('completed RTDB roundtrip accepts recursively reordered object keys while preserving arrays and rejecting altered values',()=>{
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
 const bank=fixture(),completed=finishAttempt(bank,answerCorrectly(bank,attemptFor(bank),17),{finishedAt:options.startedAt+4000});
 const restored=JSON.parse(JSON.stringify(reorder(completed))),before=JSON.stringify(restored);
 assert.notEqual(JSON.stringify(restored),JSON.stringify(completed));assert.deepEqual(restored.questionIds,completed.questionIds);
 assert.deepEqual(restored.result.questionResults,completed.result.questionResults);
 assert.equal(validateAttempt(bank,restored),true);assert.deepEqual(finishAttempt(bank,restored),completed);
 assert.equal(JSON.stringify(restored),before,'Restoration must not rewrite the caller storage snapshot');
 const altered=structuredClone(restored);altered.result.questionResults[0].correct=!altered.result.questionResults[0].correct;
 throwsCode(()=>finishAttempt(bank,altered),'result-mismatch');
 const reorderedArray=structuredClone(restored);reorderedArray.result.questionResults.reverse();
 throwsCode(()=>finishAttempt(bank,reorderedArray),'result-mismatch');
});

test('stale bank version refuses saved attempt and preserves original serialized storage',()=>{
 const originalBank=fixture(),attempt=answerCorrectly(originalBank,attemptFor(originalBank),7),stored=JSON.stringify(attempt);
 const nextBank={...originalBank,contentVersion:'synthetic-test-only-v2'},restored=JSON.parse(stored);
 for(const action of [()=>validateAttempt(nextBank,restored),()=>getAttemptQuestions(nextBank,restored),()=>gradeAttempt(nextBank,restored),()=>setAnswer(nextBank,restored,restored.questionIds[0],[]),()=>finishAttempt(nextBank,restored)])throwsCode(action,'version-mismatch');
 assert.equal(JSON.stringify(restored),stored);assert.equal(validateAttempt(originalBank,restored),true);
});

test('invalid seed, duplicate paper IDs, section imbalance and impossible completion times are rejected',()=>{
 const bank=fixture();for(const seed of [-1,0x100000000,0.2,NaN,'123'])throwsCode(()=>attemptFor(bank,{seed}),'invalid-seed');
 const duplicate=attemptFor(bank);duplicate.questionIds[1]=duplicate.questionIds[0];throwsCode(()=>validateAttempt(bank,duplicate),'invalid-attempt');
 const active=attemptFor(bank);for(const finishedAt of [NaN,Infinity,options.startedAt-1])throwsCode(()=>finishAttempt(bank,active,{finishedAt}),'invalid-attempt');
 const imbalance=attemptFor(bank),byId=new Map(bank.questions.map(q=>[q.id,q]));
 const replace=imbalance.questionIds.findIndex(id=>byId.get(id).sectionId==='russian');
 imbalance.questionIds[replace]=bank.questions.find(q=>q.sectionId==='ict'&&!imbalance.questionIds.includes(q.id)).id;
 throwsCode(()=>validateAttempt(bank,imbalance),'invalid-attempt');
});

test('untimed papers keep answers after serialization and accept answers days after starting',()=>{
 const bank=fixture(),attempt=attemptFor(bank),later=options.startedAt+7*24*60*60*1000;
 assert.equal(TEST_DURATION_MS,Infinity);assert.equal(attempt.deadlineAt,undefined);
 const restored=JSON.parse(JSON.stringify(attempt)),question=getAttemptQuestions(bank,restored)[0];
 assert.equal(attemptDeadline(restored),Infinity);
 assert.equal(remainingAttemptTime(restored,later),Infinity);
 assert.equal(isAttemptExpired(restored,later),false);
 const answered=setTimedAnswer(bank,restored,question.id,question.correctOptionIds,{now:later});
 assert.equal(answered.phase,'active');assert.equal(gradeAttempt(bank,answered).correct,1);
 assert.deepEqual(answered.questionIds,attempt.questionIds);assert.deepEqual(restored.answers,{});
 const completed=finishAttempt(bank,answered,{finishedAt:later+1000});
 assert.equal(completed.finishedAt,later+1000);assert.equal(completed.completionReason,'submitted');
 assert.equal(completed.deadlineAt,undefined);assert.equal(completed.result.correct,1);
});

test('untimed restoration ignores an old active deadline and preserves its paper and saved answers',()=>{
 const bank=fixture(),deadline=options.startedAt+60*60*1000;
 const active={...answerCorrectly(bank,attemptFor(bank),3),deadlineAt:deadline},stored=JSON.stringify(active);
 const restored=JSON.parse(stored),later=deadline+24*60*60*1000;
 assert.equal(validateAttempt(bank,restored),true);assert.equal(isAttemptExpired(restored,later),false);
 const question=getAttemptQuestions(bank,restored)[3];
 const updated=setTimedAnswer(bank,restored,question.id,question.correctOptionIds,{now:later});
 assert.equal(updated.phase,'active');assert.equal(updated.id,active.id);assert.deepEqual(updated.questionIds,active.questionIds);
 for(const [id,answer] of Object.entries(active.answers))assert.deepEqual(updated.answers[id],answer);
 const completed=finishAttempt(bank,updated,{finishedAt:later+1000});
 assert.equal(completed.completionReason,'submitted');assert.equal(completed.finishedAt,later+1000);
 assert.equal(completed.result.correct,4);assert.equal(completed.result.points,0.5);
 assert.equal(JSON.stringify(active),stored);
 assert.deepEqual(finishAttempt(bank,completed,{finishedAt:later+99_000}),completed);
 throwsCode(()=>setTimedAnswer(bank,completed,completed.questionIds[0],[],{now:later+2000}),'already-completed');
});

test('historical time-limit and legacy completed results remain unchanged',()=>{
 const bank=fixture(),active=answerCorrectly(bank,attemptFor(bank),3),deadline=options.startedAt+60*60*1000;
 const historical={...active,deadlineAt:deadline,phase:'completed',finishedAt:deadline,completionReason:'time-limit',result:gradeAttempt(bank,active)};
 const snapshot=JSON.stringify(historical);
 assert.equal(validateAttempt(bank,historical),true);
 assert.deepEqual(finishAttempt(bank,historical,{finishedAt:deadline+24*60*60*1000}),historical);
 assert.equal(JSON.stringify(historical),snapshot);assert.equal(historical.result.correct,3);
 const legacy={...active,phase:'completed',finishedAt:deadline+60_000,result:gradeAttempt(bank,active)};
 const before=JSON.stringify(legacy);assert.equal(validateAttempt(bank,legacy),true);
 assert.deepEqual(finishAttempt(bank,legacy),legacy);assert.equal(JSON.stringify(legacy),before);
 assert.equal(legacy.deadlineAt,undefined);assert.equal(legacy.completionReason,undefined);
});
