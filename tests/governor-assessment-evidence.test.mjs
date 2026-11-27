import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {assessCampaign, compactReport, northernCareComparison} from '../site/apps/governor/platform-contract.js';
import {G, E, fresh, advance, defer} from './helpers/governor-gameplay.mjs';

function playSingleMeasure(actionId, options = {}) {
  const state = fresh({campaignMode: 'guided', seed: 'RUDN-2026', ...options});
  while (!state.completed) {
    const mission = E.getCurrentMission(state);
    const action = mission.actions.find(item => item.id === actionId) || mission.actions.find(item => item.deferred);
    E.commitAction(state, action.id, 'treasury');
    E.advanceTurn(state);
  }
  return state;
}

function criterion(state, id) {
  return assessCampaign(state, G).criteria.find(item => item.id === id);
}

for (const [actionId, duration] of [['second-shift', 2], ['offline-centres', 1]]) {
  test(`fully paid ${duration}-year contract earns full delivery credit: ${actionId}`, () => {
    const state = playSingleMeasure(actionId);
    const project = state.finance.portfolio[0];
    assert.equal(project.actionId, actionId);
    assert.equal(project.paidTurns.length, duration);
    assert.equal(project.implementationFactor, 1);
    assert.equal(criterion(state, 'delivery').points, 0.75);
    project.paidTurns.pop();
    assert.equal(criterion(state, 'delivery').rawPoints, (duration - 1) / duration);
  });
}

test('early fulfilment of a year-21 commitment cannot penalise six fulfilled promises', () => {
  const state = playSingleMeasure('offline-centres');
  const kept = Array.from({length: 6}, () => ({status: 'kept', dueTurn: 19, revisions: []}));
  for (const revisions of [[], [{oldDueTurn: 20, newDueTurn: 21}]]) {
    const next = {status: 'pending', dueTurn: 21, revisions};
    state.governance.promises = [...kept, next];
    const before = assessCampaign(state, G);
    next.status = 'kept';
    const after = assessCampaign(state, G);
    assert.equal(after.points, before.points);
    assert.equal(after.criteria.find(c => c.id === 'promises').points, 0.5);
    assert.deepEqual(after.criteria, before.criteria);
  }
  state.governance.promises = [{status:'kept',dueTurn:20,revisions:[]},
    {status:'kept',dueTurn:20,revisions:[{oldDueTurn:19,newDueTurn:20}]},
    {status:'broken',dueTurn:19,revisions:[]}, {status:'pending',dueTurn:20,revisions:[]}];
  assert.equal(criterion(state,'promises').rawPoints, 1.75 / 4);
});

test('restoration earns credit for its own operating years, after the service reopens', () => {
  const state = fresh({seed: 'RUDN-2026'});
  E.chooseAgenda(state, 'school-neighbourhood');
  E.commitAction(state, 'school-bus', 'treasury');
  advance(state);
  const id = state.finance.portfolio[0].id;
  while (!state.completed && !E.restorationQuote(state, id).available) defer(state);
  const original = Math.min(1,state.finance.portfolio[0].implementationFactor);
  assert.equal(criterion(state, 'delivery').rawPoints, original);
  E.restoreProgramme(state, id);
  const receipt = state.history.at(-1).restoration;
  assert.ok(receipt);
  assert.equal(state.finance.portfolio.length, 1);
  assert.equal(criterion(state, 'delivery').rawPoints, original/2, 'original contract paid, restored contract awaiting reopening');
  const record = compactReport(state,G).decisionRegister.at(-1);
  assert.equal(record.cost,receipt.fee);
  assert.match(record.action,/Восстанов/);
  advance(state);
  // The next year's opening ledger already exists, but no decision for that
  // year has yet been recorded. Interim scoring stops at the confirmed year.
  assert.equal(criterion(state, 'delivery').rawPoints, original/2);
  defer(state);
  assert.equal(criterion(state, 'delivery').rawPoints, (original+1)/2);
  while(!state.completed) defer(state);
  const project = state.finance.portfolio[0];
  project.paidTurns = project.paidTurns.filter(turn => turn !== receipt.reopenTurn);
  assert.ok(Math.abs(criterion(state, 'delivery').rawPoints - (original + 2/3)/2) < 1e-9);
});

const learningSource = await readFile(new URL('../site/apps/governor/src/learning.js', import.meta.url),'utf8');
const languages = {ru:'Как менялась помощь на севере',en:'How care changed in the north',zh:'北部照护如何变化'};
function learningHtml(state, locale){
  const game = {...G, northernCareComparison: candidate => northernCareComparison(candidate,G),
    I18n:{intlLocale: l => l, choose: (l,a,b) => (l === 'en' ? b : a)()}};
  vm.runInNewContext(learningSource,{GovernorGame:game});
  return game.Learning.northernCareHtml(state,locale);
}

test('northern care compares the same observable demand, coverage and index on both routes', () => {
  for (const scenarioId of ['balanced','demographic']) {
    const passive = playSingleMeasure(null,{scenarioId, strategyId:'generations'});
    const active = playSingleMeasure('mobile-units',{scenarioId, strategyId:'generations'});
    const pure = JSON.stringify(active);
    const baseline = northernCareComparison(passive,G);
    const comparison = northernCareComparison(active,G);
    assert.deepEqual(comparison.map(row => row.year), [2030,2035,2040,2045]);
    assert.ok(baseline.every(row=>JSON.stringify(row.actual)===JSON.stringify(row.reference)));
    for (const [i, row] of comparison.entries()) {
      const north = active.history[5*(i+1)-1].population.after.municipalities.north;
      assert.equal(row.actual.demand,north.health);
      assert.equal(row.actual.covered,north.health*north.healthAccess);
      assert.equal(row.actual.care,0.8*north.healthAccess+0.2*north.elderCare);
      assert.equal(row.actual.care.toFixed(4),active.campaignStrategy.reviews[i].goals.find(g=>g.key==='care').value.toFixed(4));
      assert.deepEqual(row.reference,baseline[i].actual);
    }
    assert.ok(comparison.some(row=>row.actual.access!==row.reference.access));
    for(const [locale,heading] of Object.entries(languages)){
      const html=learningHtml(active,locale);
      assert.ok(html.includes(heading));
      assert.equal((html.match(/scope="row"/g)||[]).length,8);
      assert.ok(!html.includes('NaN') && !html.includes('undefined'));
    }
    assert.equal(JSON.stringify(active),pure);
    delete active.history[4].population.after.municipalities.north.health;
    assert.deepEqual(northernCareComparison(active,G),[]);
    assert.equal(learningHtml(active,'ru'),'');
  }
  assert.deepEqual(northernCareComparison(fresh(),G),[]);
});
