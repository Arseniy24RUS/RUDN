import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {G as shared} from './helpers/governor-gameplay.mjs';

const root=new URL('../site/apps/governor/',import.meta.url);
const map=JSON.parse(await readFile(new URL('data/v3-school-map.json',root)));
const modules=['v3-event-bank','v3-event-copy','v4-major-events','v3-events','v4-catalog','v4-campaign','v3-rules','v3-runtime'];
const sources=await Promise.all(modules.map(name=>readFile(new URL('src/'+name+'.js',root),'utf8')));
async function session(context='course',saved=null,alreadyGraded=[]) {
  const reports=[...alreadyGraded];
  let current=structuredClone(saved),controls;
  const game={DATA:shared.DATA,Population:shared.Population,
    I18n:{local:x=>x?.ru??x,normalize:x=>x},resolveAsset:x=>x,
    V3UI:{mount:(_,controller)=>{controls=controller;return {render(){}};}},
    V3Store:{read:async()=>current,put:async(scope,expected,next)=>{
      assert.equal(expected?.recordRevision,current?.recordRevision);
      current={...structuredClone(next),recordRevision:(current?.recordRevision??0)+1};
      return current;
    }}};
  const ctx=vm.createContext({GovernorGame:game,structuredClone,crypto:webcrypto,TextEncoder,
    fetch:async()=>({ok:true,json:async()=>structuredClone(map)}),navigator:{onLine:true},
    addEventListener(){},removeEventListener(){}});
  sources.forEach((src,i)=>vm.runInContext(src,ctx,{filename:modules[i]}));
  const bridge={context,edition:'v4',language:'ru',preview:false,canWrite:()=>true,
    owner:context==='course'?'student:fixture':'guest',backend:{checkpoint:async()=>({}),
      localAttempts:()=>reports,saveAttempt:async report=>{reports.push(report);}}};
  const runtime=await game.V3Runtime.mount({},bridge);
  await controls.start();
  if(!saved) await controls.saveUI({welcomeStep:4,tutorialStep:11});
  return {game,controls,runtime,reports,record:()=>structuredClone(current)};
}
async function sign(s) {
  await s.controls.patchDraft({eventChoice:'base',taxRate:100});
  assert.ok(s.controls.getQuote().ok);
  return s.controls.commitYear({revision:s.controls.getState().revision,signature:s.controls.getQuote().signature});
}
function insolvency(record) {
  record.state.finance={...record.state.finance,cash:0,reserve:0,debtLimit:0,
    base:{taxes:0,nonTax:0,grant:0,mandatory:200000}};
  return record;
}

test('course crisis can replay the five-year plan on the same draw, with one grade only after all 20 years',async()=>{
  const first=await session();
  for(let i=0;i<10;i++) await sign(first);
  const expected=first.record();
  await sign(first);
  const stuck=insolvency(first.record());
  const s=await session('course',stuck), ctl=s.controls;
  assert.equal(ctl.handoverStatus().retryYear,2036);
  assert.equal(ctl.handoverStatus().available,false);
  await assert.rejects(ctl.handover({revision:11}),/full-term-required/);
  await assert.rejects(ctl.replanCourse({revision:10,year:2036}),/replan-unavailable/);
  assert.equal(s.reports.length,0);
  await ctl.replanCourse({revision:11,year:2036});
  const replay=s.record();
  assert.equal(replay.state.attemptId,stuck.state.attemptId);
  assert.equal(replay.createdAt,stuck.createdAt);
  assert.equal(replay.drawKey,stuck.drawKey);
  assert.deepEqual(replay.state.history,expected.state.history);
  assert.deepEqual(replay.state.finance,expected.state.finance);
  assert.deepEqual(replay.draws,expected.draws);
  assert.deepEqual(replay.effects,expected.effects);
  assert.deepEqual(replay.referenceEffects,expected.referenceEffects);
  assert.deepEqual(replay.coursePlans,expected.coursePlans);
  const recurrence=await session('course',insolvency({...stuck,courseRetries:replay.courseRetries}));
  assert.equal(recurrence.controls.handoverStatus().retryYear,2031);
  for(let year=2036;year<=2045;year++){
    assert.equal(ctl.getState().year,year);
    assert.equal(s.reports.length,0);
    await sign(s);
  }
  await s.runtime.flush();
  await ctl.retry();
  assert.equal(s.reports.length,1);
  assert.equal(s.reports[0].governor.decisions,20);
});

test('practice still allows handover; historic graded reports survive and unsubmitted stops resume',async()=>{
  const training=await session('free');
  const s=await session('free',insolvency(training.record()));
  assert.equal(s.controls.handoverStatus().available,true);
  await s.controls.handover({revision:0});
  assert.ok(s.controls.getState().handover);
  assert.equal(s.record().submission.recordGrade,false);
  assert.equal(s.game.V3Runtime.submission(s.record(),true).recordGrade,false);
  assert.equal(s.reports.length,0);

  const legacy=s.record();
  legacy.owner='student:fixture';legacy.context='course';
  legacy.submission.recordGrade=true;
  const resumed=await session('course',legacy);
  assert.equal(resumed.controls.getState().completed,false);
  assert.equal(resumed.controls.handoverStatus().retryYear,2026);
  await resumed.controls.replanCourse({revision:resumed.controls.getState().revision,year:2026});
  assert.equal(resumed.controls.getState().year,2026);
  assert.equal(resumed.reports.length,0);
  const submitted=await session('course',{...legacy,localResult:true},[legacy.submission]);
  assert.equal(submitted.controls.getState().completed,true);
  assert.equal(submitted.reports.length,1);
});

test('pre-update budget plans allow a fresh start with the original events',async()=>{
  const s=await session();
  for(let i=0;i<6;i++) await sign(s);
  const old=insolvency(s.record());delete old.coursePlans;
  const restored=await session('course',old);
  assert.equal(restored.controls.handoverStatus().retryYear,2026);
  await restored.controls.replanCourse({revision:6,year:2026});
  assert.equal(restored.controls.getState().event.eventId,old.draws[0].eventId);
  assert.equal(restored.reports.length,0);
});
