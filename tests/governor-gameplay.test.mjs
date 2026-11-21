import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCampaign,compactReport} from '../site/apps/governor/platform-contract.js';

import {G,E,A,F,fresh,json,valid,advance,defer,firstPlan,campaign} from './helpers/governor-gameplay.mjs';
import {COURSE_PLANS} from './helpers/governor-course-plans.mjs';

// These are behavioural regression tests, not a claim that scripted agents
// establish human enjoyment or an optimal strategy.
test('the agenda remains selectable after year five and exposes all authored content by year sixteen',()=>{
  const state=fresh(),before=JSON.stringify(state);
  const offered=A.available(state);
  assert.equal(offered.length,20);assert.equal(A.pending(state).length,5);
  assert.ok(offered.find(t=>t.id==='rural-healthcare').urgency>offered.find(t=>t.id==='flood-preparedness').urgency);
  assert.ok(offered.find(t=>t.id==='school-neighbourhood').urgency>offered.find(t=>t.id==='flood-preparedness').urgency);
  assert.ok(offered.every(t=>Number.isFinite(t.urgency)&&t.reason.ru&&t.reason.en&&t.reason.zh));
  assert.equal(JSON.stringify(state),before,'reading priorities must not charge money or change a draw');
  for(let year=1;year<=5;year++)defer(state);
  assert.ok(A.needsChoice(state));assert.ok(A.pending(state).length>=10);
  E.chooseAgenda(state,'digital-procurement');
  assert.equal(E.getCurrentMission(state).id,'digital-procurement');
  assert.equal(E.getChapter(state),2);
  defer(state);
  while(state.turnIndex<15)defer(state);
  assert.equal(A.pending(state).length,20,'waiting must not silently delete half the content');
  E.chooseAgenda(state,'rural-healthcare');
  assert.equal(E.getChapter(state),4,'an old unresolved issue does not rewind the campaign clock');
  while(!state.completed)defer(state);
  assert.equal(A.report(state).order.length,20);
  assert.ok(E.getStoryThreads(state).every(chapter=>chapter.completed===5));
});

test('deferring preserves a question, but a committed mission cannot duplicate bonuses, projects or agreements',()=>{
  const state=fresh();defer(state,'rural-healthcare');
  assert.ok(A.pending(state).some(t=>t.id==='rural-healthcare'));
  E.chooseAgenda(state,'rural-healthcare');const p=firstPlan(state,'mobile-units');assert.ok(p);
  E.commitAction(state,p.action.id,p.plan.id,p.placement?.id,[]);valid(state,'adopt');advance(state);
  const before=JSON.stringify(state);
  assert.throws(()=>E.chooseAgenda(state,'rural-healthcare'),/already initiated/);
  assert.equal(JSON.stringify(state),before);
  assert.equal(state.finance.portfolio.length,1);
  while(state.turnIndex<5)defer(state);
  assert.ok(A.pending(state).some(t=>t.id==='health-delivery'),'return to the policy area through its next authored step');
});

test('calendar crises apply once even when another question is selected or an old crisis is revisited',()=>{
  const state=fresh();while(state.turnIndex<10)defer(state);
  assert.equal(state.currentEntry.missionId,'flu-wave');
  const missingEvent=json(state);delete missingEvent.entryApplied['flu-wave'];assert.equal(E.validateState(missingEvent),false);
  const ledger=JSON.stringify(state.finance.currentLedger),stats=JSON.stringify(state.stats);
  for(const id of ['rural-healthcare',A.OPERATIONS.id,'flu-wave','school-neighbourhood'])E.chooseAgenda(state,id);
  assert.equal(JSON.stringify(state.finance.currentLedger),ledger);
  assert.equal(JSON.stringify(state.stats),stats);
  defer(state);
  assert.equal(state.history[10].missionId,'school-neighbourhood');
  assert.equal(state.history[10].entry.missionId,'flu-wave','choosing another topic does not cancel the epidemic');
  assert.equal(state.currentEntry.missionId,'youth-outflow');
  const after=JSON.stringify(state.finance.currentLedger);
  E.chooseAgenda(state,'flu-wave');
  assert.equal(JSON.stringify(state.finance.currentLedger),after,'late opening must not cause another epidemic');
  while(!state.completed)defer(state);
  assert.deepEqual(Object.keys(state.entryApplied).sort(),['cyberattack','flu-wave','major-flood','youth-outflow']);
  for(const id of Object.keys(state.entryApplied)){
    assert.equal(state.storyLog.filter(row=>row.type==='crisis-entry'&&row.missionId===id).length,1);
    assert.equal(state.history.filter(row=>row.entry?.missionId===id).length,1);
  }
});

test('new, guided and first-term legacy saves retain their route and validated round trips',()=>{
  for(const campaignMode of ['agenda','guided'])for(const legacy of [false,true]){
    let state=fresh({campaignMode});if(legacy)state.agenda.version=A.LEGACY_VERSION;
    while(state.history.length<7){
      if(A.needsChoice(state))E.chooseAgenda(state,A.OPERATIONS.id);
      const m=E.getCurrentMission(state);E.commitAction(state,m.actions.find(a=>a.deferred).id,'treasury');advance(state);
    }
    const restored=E.restoreState(E.serialiseState(state));assert.ok(restored);
    assert.equal(restored.agenda.version,state.agenda.version);
    assert.equal(restored.turnIndex,7);valid(restored,'restored');
    assert.equal(A.needsChoice(restored),campaignMode==='agenda'&&!legacy);
    if(legacy)assert.equal(assessCampaign(restored,G).version,'governor-assignment-v1');
    else assert.equal(assessCampaign(restored,G).version,'governor-outcomes-v2');
  }
});

test('mandate reviews run once after years 5, 10, 15 and 20, survive saves and keep administrative effects bounded',()=>{
  const state=fresh({strategyId:'services'});assert.ok(state.campaignStrategy);
  const capacity=state.campaignStrategy.baseCapacity;
  while(!state.completed){defer(state);assert.ok(Math.abs(state.finance.adminCapacity-capacity)<=1);}
  assert.deepEqual(json(state.campaignStrategy.reviews.map(r=>r.year)),[5,10,15,20]);
  const before=JSON.stringify(state);assert.equal(G.CampaignStrategy.review(state,20),null);assert.equal(JSON.stringify(state),before);
  assert.ok(E.restoreState(JSON.stringify(state)));
  assert.deepEqual(json(E.buildReport(state,'ru').campaignStrategy),json(state.campaignStrategy));
  const bad=json(state);bad.campaignStrategy.reviews.push(bad.campaignStrategy.reviews[0]);assert.equal(E.validateState(bad),false);
});

test('four scenarios and three seeds do not award near-perfect results for five launches followed by fifteen waits',()=>{
  for(const scenario of G.DATA.scenarios)for(let seed=1;seed<=3;seed++){
    const id=`REGRESSION-${seed}`,passive=campaign(scenario.id,id,'defer'),five=campaign(scenario.id,id,'five');
    const a=assessCampaign(passive,G),b=assessCampaign(five,G);
    assert.equal(a.criteria.find(c=>c.id==='territories').rawPoints,0,'demographic access gains alone earn no service points');
    assert.ok(a.points<2,`${scenario.id}: inactive ${a.points}`);
    assert.ok(b.points<4,`${scenario.id}: five-then-wait ${b.points}`);
    assert.ok(b.points>a.points,'actually delivered services must improve the result');
    assert.ok(five.history.filter(r=>!r.deferred).length<=5);
    for(const state of [passive,five]){
      const before=JSON.stringify(state),score=assessCampaign(state,G);
      assert.deepEqual(assessCampaign(state,G),score);assert.equal(JSON.stringify(state),before);
      assert.equal(Math.round(score.criteria.reduce((sum,c)=>sum+c.points,0)*100),Math.round(score.points*100));
      assert.equal(compactReport(state,G).assessment.points,score.points);
    }
  }
});

test('ongoing service and renewal planning is rewarded without requiring twenty new projects, in strict and teaching modes',()=>{
  for(const budgetMode of ['automatic','decisions'])for(const scenario of G.DATA.scenarios)for(let seed=1;seed<=3;seed++){
    const id=`PLANNING-${seed}`,planned=campaign(scenario.id,id,'planned',budgetMode),passive=campaign(scenario.id,id,'defer',budgetMode);
    const score=assessCampaign(planned,G),reference=assessCampaign(passive,G);
    assert.ok(score.points>reference.points,`${budgetMode}/${scenario.id}/${id}: planned ${score.points}, inactive ${reference.points}`);
    assert.ok(planned.history.filter(r=>!r.deferred).length<20);
    assert.ok(score.points<=5);assert.ok(score.criteria.every(c=>c.points>=0&&c.points<=c.maxPoints));
    if(G.BudgetReview.stopped(planned))assert.ok(score.points<=2.5);
  }
});


test('each declared course has a feasible secured milestone in all four scenarios under strict budgets',()=>{
  for(const scenario of G.DATA.scenarios)for(const course of G.CampaignStrategy.COURSES){
    const state=campaign(scenario.id,'RUDN-2026',COURSE_PLANS[course.id],'decisions',course.id);
    assert.ok(state.completed,`${scenario.id}/${course.id} must complete the term`);
    assert.ok(state.campaignStrategy.reviews.some(r=>r.status==='secured'),`${scenario.id}/${course.id} has no achievable mandate milestone`);
    const compact=compactReport(state,G);
    assert.equal(compact.applicationVersion,'1.1.0');
    assert.equal(compact.campaignStrategy.courseId,course.id);
    assert.equal(compact.campaignStrategy.reviews.length,4);
    assert.ok(compact.campaignStrategy.reviews.every(r=>r.goals.length===2&&r.goals.every(g=>Number.isFinite(g.value)&&Number.isFinite(g.target))));
    assert.equal(Object.hasOwn(compact.campaignStrategy,'baseline'),false);
    assert.ok(E.restoreState(JSON.stringify(state)));
  }
});
