import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {G, E, fresh, firstPlan, advance, json} from './helpers/governor-gameplay.mjs';

const scope = {GovernorGame: {...G}};
scope.window = scope;
vm.createContext(scope);
for (const name of ['asset-metadata', 'illustrated-assets', 'world-model']) {
  const code = await readFile(new URL('../site/apps/governor/src/' + name + '.js', import.meta.url), 'utf8');
  vm.runInContext(code, scope, {filename:name});
}
const {WorldModel: world, IllustratedAssets: art} = scope.GovernorGame;

test('approval uses the actual placement before and after saving the year', () => {
  const state = fresh();
  while (state.turnIndex < 5) {
    E.chooseAgenda(state, G.Agenda.OPERATIONS.id);
    E.commitAction(state, E.getCurrentMission(state).actions[0].id, 'treasury');
    advance(state);
  }
  E.chooseAgenda(state, 'industrial-transition');
  const plan = firstPlan(state, 'supplier-clusters', [], 'small-town-belt');
  const {record} = E.commitAction(state, 'supplier-clusters', plan.plan.id, plan.placement.id);
  assert.equal(record.districtId, 'industrial');
  assert.equal(world.moments(state)[0].districtId, 'river');
  const result = E.advanceTurn(state);
  const live = json(world.moments(state, {events:result.lifecycle.events}));
  assert.deepEqual(json(world.moments(json(state))), live);
  assert.ok(live.every(e => e.districtId === 'river'));
  assert.equal(world.districtMetric(state, 'river', record.project.id).metric, 'employment');
});

test('shows each real lifecycle event including ongoing projects and avoids replaying a suspended year', () => {
  const makeProject = (id,districtId,target) => ({id,title:{en:id},districtId,people:{targets:{[target]:1}}});
  const portfolio = [makeProject('school','capital','suburb'),makeProject('clinic','north','north'),makeProject('jobs','industrial','river')];
  const events = ['activated','completed','operating'].map((type,i) => ({type,projectId:portfolio[i].id}));
  const state = {population:{baseYear:2026},finance:{portfolio,lastLifecycleEvents:events},turnIndex:3,
    history:[{turn:3,deferred:true,missionId:'agenda-operations',districtId:'capital'}]};
  const before = JSON.stringify(state);
  assert.deepEqual(json(world.moments(state).map(e => [e.type,e.districtId])),
    [['activated','suburb'],['completed','north'],['deferred',null],['operating','river']]);
  assert.equal(JSON.stringify(state), before);
  // Commit succeeded but budget review suspended advance; lastLifecycleEvents
  // still belongs to the previous year. Never depict this year's draft as open.
  state.awaitingContinue=true;
  assert.deepEqual(json(world.moments(state).map(e=>e.type)), ['deferred']);
  state.awaitingContinue=false;
  state.completed=true;
  assert.deepEqual(json(world.moments(state).map(e=>e.type)), ['deferred']);
});

test('school phases share a registered sprite pair and the displayed trend uses measured school access', () => {
  const school={id:'campus',actionId:'school-campus',districtId:'suburb',status:'delivery',people:{outputs:{school:7000,schoolStaff:7000}}};
  const state={finance:{portfolio:[school]},history:[{population:{after:{municipalities:{suburb:{schoolAccess:.69}}}}}],
    population:{derived:{municipalities:{suburb:{schoolAccess:.84}}}}};
  assert.deepEqual(json(world.districtMetric(state,'suburb','campus','activated')),
    {metric:'schoolAccess',before:.69,current:.84});
  assert.equal(art.image(school).id,'school-site');
  assert.equal(art.image({...school,status:'active'}).id,'school');
  assert.equal(art.image(school).approximatePair,false);
  assert.equal(art.image({actionId:'school-bus',status:'delivery'}).site,false);
});
