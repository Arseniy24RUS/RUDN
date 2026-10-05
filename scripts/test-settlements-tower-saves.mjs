/** Save regressions for spaced initial networks. Synthetic data, no cloud writes. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {World} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {SOCIAL_RULES_VERSION,SERIALIZED_ACTIONS_RULES_VERSION,INITIAL_NETWORK_SAVE_RULES_VERSION,
  createState,apply,preview,evaluate,exportSave,restore,undo} from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
import {createSyntheticDistanceTransportPolicy} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {initialTowersFor} from '../site/apps/settlements/runtime/assets/js/settlements/v24/telecom-policy.mjs';
import {INITIAL_TOWER_POLICY_VERSION,spacedInitialTowerSeeds} from '../site/apps/settlements/runtime/assets/js/settlements/v24/initial-tower-spacing.mjs';

const fingerprint=`sha256:${'0'.repeat(64)}`;
let oldReaderPromise;
function oldReader() {
  if (!oldReaderPromise) {
    // A real published parser, verified before import. No network fetch or mock.
    const source=execFileSync('git',['show','19b9c06:site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs'],
      {cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true});
    assert.equal(createHash('sha256').update(source).digest('hex'),'f3fbc07f1426933186287cb6d41d547bdf9ae4c03fbae2c8d4d7a0bfdb843335');
    const location=new URL('../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs',import.meta.url);
    const rewritten=source.replace(/from '(\.\.?\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,location).href}'`);
    oldReaderPromise=import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
  }
  return oldReaderPromise;
}

function fixture({spaced=true,empty=false,difficulty='normal'}={}) {
  const ids=['a','b','c','d','e'],longitudes=[37,37.01,37.4,37.41,37.8];
  const settlements=ids.map((id,i)=>({id,name:id,lat:55,lon:longitudes[i],population:100}));
  const edges=[],roadRequired={},distanceMeters={};
  for (let i=1;i<ids.length;i++) {
    edges.push([i-1,i,5,1],[i,i-1,5,1]);
    const key=`${ids[i-1]}|${ids[i]}`;roadRequired[key]=false;distanceMeters[key]=1000;
  }
  const world=new World({region:{id:'synthetic-initial-towers'},settlements},
    {status:'teaching',networkVersion:'synthetic-v1',nodes:ids.map(id=>[id]),edges});
  const scenario={id:`synthetic-initial-towers-v5-${difficulty}`,version:5,rulesVersion:SOCIAL_RULES_VERSION,
    regionId:world.region.id,kind:'free',difficulty,initialBudget:100,targetIds:ids,
    transportPolicy:createSyntheticDistanceTransportPolicy(world,{roadRequired,distanceMeters}),
    telecomPlanVersion:'telecom-plan-v2',telecomPlanFingerprint:fingerprint,
    socialPolicyVersion:'social-policy-v1',socialPolicyFingerprint:fingerprint,
    telecomInitialPopulationThreshold:empty?8000:100,telecomInitialSeedIds:empty?[]:ids,
    initialFacilities:[{id:'clinic',type:'medical',settlementId:'a',capacityUnits:200000}],initialRoutes:[]};
  if (spaced) {
    scenario.initialTowerPolicyVersion=INITIAL_TOWER_POLICY_VERSION;
    scenario.initialTowerPolicyFingerprint=spacedInitialTowerSeeds(world,scenario.telecomInitialSeedIds).fingerprint;
  }
  scenario.initialTowers=initialTowersFor(world,scenario);
  return {world,scenario,state:createState(world,scenario)};
}
const clone=value=>structuredClone(value);
const route={type:'connect',stopIds:['a','c','b','d','e']};
const doctor={type:'build',service:'outreach',settlementId:'b'};
const tower={type:'tower',lat:55,lon:37.01};
function exactRoundTrip(world,scenario,state) {
  const save=exportSave(state),before=clone(save),restored=restore(world,scenario,save);
  assert.deepEqual(restored,state);assert.deepEqual(save,before);
  assert.equal(JSON.stringify(exportSave(restored)),JSON.stringify(save));
  assert.deepEqual(evaluate(world,scenario,restored),evaluate(world,scenario,state));
  return save;
}

test('zero-action spaced networks carry a rejecting envelope, including an empty initial network',async()=>{
  const previous=await oldReader();
  for (const empty of [false,true]) for (const difficulty of ['easy','normal','hard']) {
    const {world,scenario,state}=fixture({empty,difficulty}),save=exactRoundTrip(world,scenario,state);
    assert.equal(state.rulesVersion,SOCIAL_RULES_VERSION);assert.equal(state.actions.length,0);
    assert.equal(state.towers.length,empty?0:3);
    assert.equal(save.rulesVersion,INITIAL_NETWORK_SAVE_RULES_VERSION);
    assert.equal(save.engineRulesVersion,SOCIAL_RULES_VERSION);assert.equal(save.scenarioVersion,5);
    assert.equal(save.initialTowerPolicyVersion,INITIAL_TOWER_POLICY_VERSION);
    assert.equal(save.initialTowerPolicyFingerprint,scenario.initialTowerPolicyFingerprint);
    assert.throws(()=>previous.restore(world,scenario,save),/версия правил/);
  }
});

test('new actions preserve initial network identity through replay and every undo to zero',async()=>{
  const previous=await oldReader(),{world,scenario,state}=fixture(),states=[state];
  for (const action of [tower,route,doctor]) {
    const next=apply(world,scenario,states.at(-1),action),save=exactRoundTrip(world,scenario,next);
    assert.equal(save.rulesVersion,INITIAL_NETWORK_SAVE_RULES_VERSION);
    assert.equal(next.initialTowerPolicyFingerprint,state.initialTowerPolicyFingerprint);
    assert.throws(()=>previous.restore(world,scenario,save),/версия правил/);
    states.push(next);
  }
  assert.equal(states.at(-1).spent,10); // Tower .2 + four transport edges .8 + doctor 9.
  for (let i=states.length-1;i>0;i--) {
    const undone=undo(world,scenario,states[i]);assert.deepEqual(undone,states[i-1]);
    assert.equal(exactRoundTrip(world,scenario,undone).rulesVersion,INITIAL_NETWORK_SAVE_RULES_VERSION);
  }
});

test('spacing never removes player towers, including a source point beside an initial tower',()=>{
  const {world,scenario,state}=fixture(),next=apply(world,scenario,state,tower);
  assert.equal(preview(world,scenario,state,tower).ok,true);
  assert.equal(next.towers.length,state.towers.length+1);assert.equal(next.spent,.2);
  assert.deepEqual(next.towers.at(-1),{id:'tower:1',lat:55,lon:37.01,radiusKm:10});
  exactRoundTrip(world,scenario,next);assert.deepEqual(undo(world,scenario,next),state);
});

test('old bare and action-envelope journals retain exact states, exports, budgets and coverage',async()=>{
  const previous=await oldReader(),{world,scenario,state}=fixture({spaced:false});
  assert.equal(state.towers.length,5);assert.equal(Object.hasOwn(state,'initialTowerPolicyVersion'),false);
  assert.deepEqual(state,previous.createState(world,scenario));
  let oldState=previous.createState(world,scenario);
  for (const action of [null,tower,route,doctor]) {
    if (action) oldState=previous.apply(world,scenario,oldState,action);
    const oldSave=previous.exportSave(oldState),restored=restore(world,scenario,oldSave);
    assert.deepEqual(restored,oldState);assert.deepEqual(evaluate(world,scenario,restored),previous.evaluate(world,scenario,oldState));
    assert.equal(JSON.stringify(exportSave(restored)),JSON.stringify(oldSave));
    assert.deepEqual(previous.restore(world,scenario,exportSave(restored)),oldState);
    assert.equal(oldSave.rulesVersion,action===route||action===doctor?SERIALIZED_ACTIONS_RULES_VERSION:SOCIAL_RULES_VERSION);
    assert.equal(Object.hasOwn(oldSave,'initialTowerPolicyVersion'),false);
    assert.deepEqual(undo(world,scenario,restored),previous.undo(world,scenario,oldState));
  }
});

test('new and old scenarios cannot substitute their different initial networks during restore or play',()=>{
  const fresh=fixture(),old=fixture({spaced:false}),newSave=exportSave(fresh.state),oldSave=exportSave(old.state);
  assert.throws(()=>restore(old.world,old.scenario,newSave),/связи/);
  assert.throws(()=>restore(fresh.world,fresh.scenario,oldSave),/связи/);
  assert.throws(()=>evaluate(fresh.world,fresh.scenario,old.state),/связи/);
  assert.throws(()=>apply(old.world,old.scenario,fresh.state,tower),/связи/);
  const other=clone(fresh.scenario);other.initialTowerPolicyFingerprint=`sha256:${'1'.repeat(64)}`;
  assert.throws(()=>restore(fresh.world,other,newSave),/связи/);
  assert.deepEqual(exportSave(fresh.state),newSave);assert.deepEqual(exportSave(old.state),oldSave);
});

test('normalization rejects partial, unknown, downgraded or conflicting identities without changing input',()=>{
  const {world,scenario,state}=fixture(),save=exportSave(apply(world,scenario,state,route));
  for (const mutate of [
    value=>delete value.initialTowerPolicyVersion,
    value=>delete value.initialTowerPolicyFingerprint,
    value=>{delete value.initialTowerPolicyVersion;delete value.initialTowerPolicyFingerprint;},
    value=>value.initialTowerPolicyVersion='unknown-policy',
    value=>value.initialTowerPolicyFingerprint='sha256:wrong',
    value=>value.initialTowerPolicyFingerprint=`sha256:${'1'.repeat(64)}`,
    value=>delete value.engineRulesVersion,
    value=>value.engineRulesVersion='settlements-3.3.0',
    value=>value.engineRulesVersion=INITIAL_NETWORK_SAVE_RULES_VERSION,
    value=>value.scenarioVersion=4,
    value=>value.rulesVersion=SERIALIZED_ACTIONS_RULES_VERSION,
    value=>{value.rulesVersion=SOCIAL_RULES_VERSION;delete value.engineRulesVersion;},
    value=>value.dataVersion='source-v1-0000000000000000',
    value=>value.owner='',
    value=>value.telecomPlanFingerprint=`sha256:${'1'.repeat(64)}`,
    value=>value.socialPolicyFingerprint=`sha256:${'1'.repeat(64)}`,
  ]) {
    const invalid=clone(save);mutate(invalid);const before=clone(invalid);
    assert.throws(()=>restore(world,scenario,invalid));assert.deepEqual(invalid,before);
  }
});

test('create, export and state validation reject incomplete policies and identities on the tutorial',()=>{
  const {world,scenario,state}=fixture();
  for (const mutate of [
    value=>delete value.initialTowerPolicyVersion,
    value=>delete value.initialTowerPolicyFingerprint,
    value=>value.initialTowerPolicyVersion='unknown-policy',
    value=>value.initialTowerPolicyFingerprint=undefined,
    value=>value.initialTowerPolicyFingerprint='sha256:wrong',
  ]) {
    const brokenScenario={...scenario};mutate(brokenScenario);
    assert.throws(()=>createState(world,brokenScenario),/связи/);
    const brokenState=clone(state);mutate(brokenState);
    assert.throws(()=>exportSave(brokenState),/связи/);
    assert.throws(()=>evaluate(world,scenario,brokenState),/связи/);
    assert.throws(()=>undo(world,scenario,brokenState),/связи/);
  }
  const intro={...scenario,id:'intro-chelyabinsk-7-v5',kind:'intro',telecomInitialPopulationThreshold:8000};
  assert.throws(()=>createState(world,intro),/связи/);
  assert.throws(()=>exportSave({...state,scenarioId:intro.id}),/связи/);
});

test('save regression evidence identifies the current tested engine and policies',async()=>{
  const hashes={};
  for (const relative of ['../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs',
    '../site/apps/settlements/runtime/assets/js/settlements/v24/initial-tower-spacing.mjs',
    '../site/apps/settlements/runtime/assets/js/settlements/v24/telecom-policy.mjs','./test-settlements-tower-saves.mjs'])
    hashes[relative]=createHash('sha256').update(await readFile(new URL(relative,import.meta.url))).digest('hex');
  console.log(JSON.stringify({status:'recorded',synthetic:true,hashes}));
});
