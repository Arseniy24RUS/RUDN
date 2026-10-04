/** Synthetic engine regression cases. No source-data changes or network calls. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {World} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {SOCIAL_RULES_VERSION,OUTREACH_POLICY_VERSION,SERIALIZED_ACTIONS_RULES_VERSION,createState,preview,apply,evaluate,exportSave,restore,undo} from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
import {createSyntheticDistanceTransportPolicy,loadDistanceTransportPolicy} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {initialTowersFor} from '../site/apps/settlements/runtime/assets/js/settlements/v24/telecom-policy.mjs';
import {loadSocialPlan} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {createRegionalScenario,createIntroScenario} from '../site/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';

const fingerprint=`sha256:${'0'.repeat(64)}`;
let frozenReaderPromise;
function frozenReader() {
  if (!frozenReaderPromise) {
    // Use the actual published Git blob, never an imitation of the old parser.
    // CI must check out its history; the test does not fetch from the network.
    const source=execFileSync('git',['show','faf861b:site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs'],
      {cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true});
    assert.equal(createHash('sha256').update(source).digest('hex'),'115d5038bf821c683ebb40802968a6a665478cfb28055408962363937ff6855d');
    const location=new URL('../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs',import.meta.url);
    const moduleSource=source.replace(/from '(\.\.?\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,location).href}'`);
    frozenReaderPromise=import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  }
  return frozenReaderPromise;
}
function fixture({ids=['a','b','c','d','e'],links=[['a','b',1000,false],['b','c',1500,true],['c','d',2000,false],['d','e',2500,true]],walking=[],bidirectional=true,budget=100,initial=true,rows={}}={}) {
  const settlements=ids.map((id,index)=>({id,name:id,lat:55,lon:37+index*.01,population:100,...rows[id]}));
  const edges=walking.map(([from,to,minutes])=>[ids.indexOf(from),ids.indexOf(to),minutes,0]),roadRequired={},distanceMeters={};
  for (const [a,b,metres,required] of links) {
    edges.push([ids.indexOf(a),ids.indexOf(b),5,1]);
    if (bidirectional) edges.push([ids.indexOf(b),ids.indexOf(a),5,1]);
    const key=[a,b].sort().join('|');roadRequired[key]=required;distanceMeters[key]=metres;
  }
  const world=new World({region:{id:'synthetic-road-routes'},settlements},{status:'teaching',networkVersion:'synthetic-v1',nodes:ids.map(id=>[id]),edges});
  const scenario={id:'synthetic-road-routes-v5-normal',version:5,rulesVersion:SOCIAL_RULES_VERSION,regionId:world.region.id,kind:'free',difficulty:'normal',initialBudget:budget,targetIds:ids,
    transportPolicy:createSyntheticDistanceTransportPolicy(world,{roadRequired,distanceMeters}),telecomPlanVersion:'telecom-plan-v2',telecomPlanFingerprint:fingerprint,
    socialPolicyVersion:'social-policy-v1',socialPolicyFingerprint:fingerprint,telecomInitialPopulationThreshold:8000,initialTowers:[],
    initialFacilities:initial?[{id:'clinic',type:'medical',settlementId:'a',capacityUnits:200000}]:[],initialRoutes:initial?[{from:'a',to:'b',path:['a','b']}]:[]};
  return {world,scenario,state:createState(world,scenario)};
}
const doctor=settlementId=>({type:'build',service:'outreach',settlementId});
const stops=stopIds=>({type:'connect',stopIds});
const roundTrip=(world,scenario,state)=>assert.deepEqual(restore(world,scenario,JSON.parse(JSON.stringify(exportSave(state)))),state);

test('doctor rejects an absent road, walking links and unbuilt road-required edges atomically',()=>{
  const {world,scenario,state}=fixture({initial:false,links:[['a','b',1000,true]],walking:[['a','c',5]]});
  // A walking edge is not evidence of a road, even if it reaches the target.
  const before=structuredClone(state);
  for (const id of ['b','c','e']) {
    const p=preview(world,scenario,state,doctor(id));assert.equal(p.ok,false);assert.match(p.error,/К этому поселению нет дороги/);
    assert.throws(()=>apply(world,scenario,state,doctor(id)),/нет дороги/);
  }
  assert.deepEqual(state,before);
});

test('doctor accepts an authored road without requiring public transport or a clinic',()=>{
  const {world,scenario,state}=fixture({initial:false,links:[['a','b',1000,false]]});
  const p=preview(world,scenario,state,doctor('b'));assert.equal(p.ok,true,p.error);
  assert.equal(p.cost,9);assert.equal(p.action.outreachPolicyVersion,OUTREACH_POLICY_VERSION);
  const after=apply(world,scenario,state,doctor('b'));assert.deepEqual(after,p.nextState);
  assert.equal(after.facilities.length,1);assert.equal(evaluate(world,scenario,after).byId.b.medical.full,true);
  assert.deepEqual(undo(world,scenario,after),state);roundTrip(world,scenario,after);
});

test('doctor accepts a previously constructed road and rejects it again after road undo',()=>{
  const {world,scenario,state}=fixture({initial:false,links:[['a','b',1000,true]]});
  const road=apply(world,scenario,state,stops(['a','b']));
  const after=apply(world,scenario,road,doctor('b'));assert.equal(after.spent,10.4);
  roundTrip(world,scenario,after);assert.deepEqual(undo(world,scenario,after),road);
  assert.equal(preview(world,scenario,undo(world,scenario,road),doctor('b')).ok,false);
});

test('doctor respects directed road arrival and ignores a zero-distance link by itself',()=>{
  const directed=fixture({ids:['a','b'],initial:false,bidirectional:false,links:[['a','b',1000,false]]});
  assert.equal(preview(directed.world,directed.scenario,directed.state,doctor('a')).ok,false);
  assert.equal(preview(directed.world,directed.scenario,directed.state,doctor('b')).ok,true);
  const same={a:{lat:55,lon:37},b:{lat:55,lon:37}};
  const zero=fixture({ids:['a','b'],initial:false,rows:same,links:[['a','b',0,false]]});
  assert.equal(preview(zero.world,zero.scenario,zero.state,doctor('b')).ok,false);
  const colocated=fixture({ids:['a','b','c'],initial:false,rows:same,links:[['a','b',0,false],['c','a',1000,false]]});
  assert.equal(preview(colocated.world,colocated.scenario,colocated.state,doctor('b')).ok,true);
});

test('old completed saves with a roadless doctor retain budget, actions, coverage and exact export',()=>{
  const {world,scenario}=fixture({ids:['a'],initial:false,links:[]});
  scenario.telecomInitialPopulationThreshold=1;scenario.initialTowers=initialTowersFor(world,scenario);
  scenario.initialFacilities=['school','culture'].map(type=>({id:type,type,settlementId:'a',capacityUnits:200000}));
  const before=createState(world,scenario),save=exportSave(before);save.actions=[doctor('a')];
  const restored=restore(world,scenario,save);
  assert.equal(restored.budget,91);assert.equal(restored.spent,9);assert.equal(restored.revision,1);
  assert.deepEqual(restored.actions,[doctor('a')]);assert.deepEqual(exportSave(restored),save);
  assert.equal(evaluate(world,scenario,restored).complete,true);roundTrip(world,scenario,restored);
  assert.deepEqual(undo(world,scenario,restored),before);
  const continued=apply(world,scenario,restored,{type:'upgrade',facilityId:'facility:1'});
  assert.deepEqual(undo(world,scenario,continued),restored);roundTrip(world,scenario,continued);
  const forgedNew=structuredClone(save);forgedNew.actions[0].outreachPolicyVersion=OUTREACH_POLICY_VERSION;
  assert.throws(()=>restore(world,scenario,forgedNew),/нет дороги/);
});

test('an active old save can continue but cannot add a new roadless doctor or bypass its marker',()=>{
  const {world,scenario,state}=fixture({ids:['a','b'],initial:false,links:[]});
  const save=exportSave(state);save.actions=[doctor('a')];const old=restore(world,scenario,save);
  assert.equal(preview(world,scenario,old,doctor('b')).ok,false);
  assert.throws(()=>apply(world,scenario,old,{...doctor('b'),outreachPolicyVersion:'legacy'}),/Неизвестные условия/);
  assert.deepEqual(exportSave(restore(world,scenario,save)),save);
});

test('five stops visit every selected point, pay each new edge once and provide full service access',()=>{
  const {world,scenario,state}=fixture(),action=stops(['a','b','c','d','e']),frozen=structuredClone(state);
  const p=preview(world,scenario,state,action);assert.equal(p.ok,true,p.error);assert.deepEqual(state,frozen);
  assert.deepEqual(p.path,['a','b','c','d','e']);assert.deepEqual(p.stopIds,action.stopIds);
  assert.deepEqual(p.legs.map(leg=>[leg.from,leg.to]),[['a','b'],['b','c'],['c','d'],['d','e']]);
  assert.equal(p.cost,6);assert.equal(p.transportCost.transport,1.2);assert.equal(p.transportCost.construction,4.8);
  assert.equal(p.transportCost.distanceKm,7);assert.equal(p.transportCost.freshDistanceKm,6);assert.equal(p.transportCost.constructionDistanceKm,4);
  assert.equal(p.transportCost.freshEdges,3);assert.equal(p.transportCost.roadRequiredEdges,2);
  assert.deepEqual(p.freshPath,[['b','c','d','e']]);assert.equal(p.delta.medical.newlyFullIds.length,3);
  const after=apply(world,scenario,state,action);assert.deepEqual(after,p.nextState);
  assert.equal(after.revision,1);assert.equal(after.actions.length,1);assert.equal(after.routes.length,state.routes.length+1);
  assert.equal(after.budget,94);assert.equal(evaluate(world,scenario,after).services.medical.covered,5);
  assert.deepEqual(undo(world,scenario,after),state);roundTrip(world,scenario,after);
  assert.equal(preview(world,scenario,after,action).ok,false);
});

test('overlapping legs charge shared physical edges only once while retaining the ordered path',()=>{
  const {world,scenario,state}=fixture(),p=preview(world,scenario,state,stops(['a','c','b','d','e']));
  assert.equal(p.ok,true,p.error);assert.equal(p.cost,6);assert.equal(p.transportCost.freshEdges,3);
  assert.deepEqual(p.path,['a','b','c','b','c','d','e']);assert.equal(p.transportCost.distanceKm,10);
  assert.deepEqual(p.freshPath,[['b','c'],['c','d','e']]);
  roundTrip(world,scenario,p.nextState);
});

test('a failed final leg or insufficient total budget leaves the entire route unapplied',()=>{
  for (const options of [{links:[['a','b',1000,false],['b','c',1500,true],['c','d',2000,false]]},{budget:5.9}]) {
    const {world,scenario,state}=fixture(options),before=structuredClone(state),action=stops(['a','b','c','d','e']);
    const p=preview(world,scenario,state,action);assert.equal(p.ok,false);assert.match(p.error,/Связь отсутствует|Не хватает бюджета/);
    assert.throws(()=>apply(world,scenario,state,action));assert.deepEqual(state,before);
  }
});

test('invalid, repeated and conflicting stops are rejected, including distant nonconsecutive duplicates',()=>{
  const {world,scenario,state}=fixture();
  for (const action of [stops([]),stops(['a']),stops(['a','a']),stops(['a','b','c','a']),stops(['a','missing']),stops(['a',42]),
    {type:'connect',stopIds:'ab'},{...stops(['a','b']),from:'c'},{...stops(['a','b']),selectedIds:['a','c']}]) {
    assert.equal(preview(world,scenario,state,action).ok,false,JSON.stringify(action));
  }
  assert.deepEqual(preview(world,scenario,state,{type:'connect',selectedIds:['a','c','d','e']}).action,
    {type:'connect',from:'a',to:'e',stopIds:['a','c','d','e']});
});

test('multi-stop paths never invent a reverse direction or a direct shortcut',()=>{
  const {world,scenario,state}=fixture({bidirectional:false});
  assert.equal(preview(world,scenario,state,stops(['e','d','c','b','a'])).ok,false);
  const p=preview(world,scenario,state,stops(['a','c','e']));assert.equal(p.ok,true,p.error);
  assert.deepEqual(p.path,['a','b','c','d','e']);
  for (const leg of p.legs) for (let i=1;i<leg.path.length;i++) {
    assert(world.drive[world.ids.get(leg.path[i-1])].some(([to])=>to===world.ids.get(leg.path[i])));
  }
});

test('ordinary two-point connect retains its original network-join behavior and replay',()=>{
  const {world,scenario,state}=fixture();
  const p=preview(world,scenario,state,{type:'connect',from:'c',to:'a'});assert.equal(p.ok,true,p.error);
  assert.deepEqual(p.path,['c','b']);assert.equal(p.joinId,'b');assert.equal(p.requestedTo,'a');assert.equal(p.cost,2.1);
  assert.deepEqual(p.action,{type:'connect',from:'c',to:'a'});roundTrip(world,scenario,p.nextState);
});

test('new route and doctor saves fail closed in the real published reader and round-trip exactly in the new reader',async()=>{
  const legacy=await frozenReader(),{world,scenario,state}=fixture();
  for (const action of [stops(['a','c','b','d','e']),doctor('b')]) {
    const next=apply(world,scenario,state,action),save=exportSave(next),copy=structuredClone(save);
    assert.equal(next.rulesVersion,SOCIAL_RULES_VERSION);assert.equal(save.rulesVersion,SERIALIZED_ACTIONS_RULES_VERSION);
    assert.equal(save.engineRulesVersion,SOCIAL_RULES_VERSION);assert.equal(save.scenarioVersion,5);
    assert.throws(()=>legacy.restore(world,scenario,save),/Неизвестная версия правил/);
    const restored=restore(world,scenario,save);assert.deepEqual(restored,next);assert.deepEqual(save,copy);
    assert.equal(JSON.stringify(exportSave(restored)),JSON.stringify(save));
    assert.deepEqual(undo(world,scenario,restored),state);
    assert.equal(exportSave(undo(world,scenario,restored)).rulesVersion,SOCIAL_RULES_VERSION);
  }
  const oldState=legacy.apply(world,scenario,legacy.createState(world,scenario),{type:'connect',from:'c',to:'a'});
  const oldSave=legacy.exportSave(oldState),restored=restore(world,scenario,oldSave);
  assert.deepEqual(restored,oldState);assert.equal(JSON.stringify(exportSave(restored)),JSON.stringify(oldSave));
  assert.deepEqual(legacy.restore(world,scenario,exportSave(restored)),oldState);
});

test('wire wrapper retains the internal rules and prices when a pre-3.4 party adds a new action',async()=>{
  const legacy=await frozenReader(),{world,scenario}=fixture();
  for (const [version,rulesVersion] of [[1,'settlements-3.0.0'],[3,'settlements-3.2.0']]) {
    const older={...scenario,id:`synthetic-v${version}`,version,rulesVersion},state=createState(world,older);
    for (const action of [stops(['a','c','d','e']),doctor('b')]) {
      const next=apply(world,older,state,action),save=exportSave(next);
      assert.equal(save.rulesVersion,SERIALIZED_ACTIONS_RULES_VERSION);assert.equal(save.engineRulesVersion,rulesVersion);
      assert.equal(save.scenarioVersion,version);assert.equal(next.rulesVersion,rulesVersion);
      assert.throws(()=>legacy.restore(world,older,save),/Неизвестная версия правил/);
      const restored=restore(world,older,save);assert.deepEqual(restored,next);assert.deepEqual(exportSave(restored),save);
    }
  }
});

test('wire normalization cannot bypass version, source, policy, owner or outreach marker validation',()=>{
  const {world,scenario,state}=fixture(),save=exportSave(apply(world,scenario,state,doctor('b')));
  for (const mutate of [
    value=>delete value.engineRulesVersion,
    value=>value.engineRulesVersion='settlements-unknown',
    value=>value.engineRulesVersion=SERIALIZED_ACTIONS_RULES_VERSION,
    value=>value.scenarioVersion=3,
    value=>value.engineRulesVersion='settlements-3.2.0',
    value=>value.dataVersion='source-v1-0000000000000000',
    value=>value.transportPolicyFingerprint=`sha256:${'1'.repeat(64)}`,
    value=>value.socialPolicyFingerprint=`sha256:${'1'.repeat(64)}`,
    value=>value.owner='',
    value=>value.actions[0].outreachPolicyVersion='unknown-policy',
  ]) {
    const invalid=structuredClone(save);mutate(invalid);const copy=structuredClone(invalid);
    assert.throws(()=>restore(world,scenario,invalid));assert.deepEqual(invalid,copy);
  }
  const conflicting=exportSave(state);conflicting.engineRulesVersion=SOCIAL_RULES_VERSION;
  assert.throws(()=>restore(world,scenario,conflicting),/Некорректная версия правил журнала/);
});

test('real published easy/normal/hard completed and active saves exactly match the frozen old engine',async()=>{
  // Captured from the unmodified faf861b engine, SHA-256
  // 115d5038bf821c683ebb40802968a6a665478cfb28055408962363937ff6855d.
  // These digest whole states, including assignments, budgets, routes and logs.
  const expected={
    easy:{actions:40,full:'8e954701cbbe6a08d78e0c867115ed72a7ca5b3a220eccc983387f0819e70d4b',prefix:'a6b63d1e36e17b85f48e927630f0182e302e5b55886d16785fd526ca0cf3eeef'},
    normal:{actions:133,full:'eab29671b5db9061069efa0bf5d05d44ca58e9701f60ba7c276b7a1632828cdb',prefix:'a07350a789a7b6c68f745f7db460d4e21ea03e8e3cd48cb1652c7a138cb15a17'},
    hard:{actions:133,full:'43a6f55f54e75368a46b2b889c6e9d5b4ac436436e39a0a0679fbb4e12963cf5',prefix:'6f0c6976bf749d72710afaab76d68551fb3eff0cdde8e6921f17db4f1ab56db2'},
  };
  const base=new URL('../site/apps/settlements/runtime/data/settlements/v1/',import.meta.url),id='nenetskiy_avtonomnyy_okrug';
  const json=async relative=>JSON.parse(await readFile(new URL(relative,base),'utf8'));
  const world=new World(await json(`regions/${id}.json`),JSON.parse(gunzipSync(await readFile(new URL(`transport/${id}.json.gz`,base)))));
  await loadDistanceTransportPolicy(world);const boundary=await json(`boundaries/${id}.geojson`);
  const digest=state=>createHash('sha256').update(JSON.stringify(state)).digest('hex');
  for (const [difficulty,hashes] of Object.entries(expected)) {
    const plan=await loadSocialPlan(world,{difficulty}),scenario=createRegionalScenario(world,boundary,{mode:'free',version:5,difficulty});
    assert.equal(plan.referenceActions.length,hashes.actions);
    const initial=createState(world,scenario),save=exportSave(initial);save.actions=structuredClone(plan.referenceActions);
    const restored=restore(world,scenario,save);assert.equal(digest(restored),hashes.full);
    assert.equal(evaluate(world,scenario,restored).complete,true);roundTrip(world,scenario,restored);
    save.actions=save.actions.slice(0,Math.floor(hashes.actions/2));
    const prefix=restore(world,scenario,save);assert.equal(digest(prefix),hashes.prefix);roundTrip(world,scenario,prefix);
    const last=restored.actions.at(-1);assert.deepEqual(apply(world,scenario,undo(world,scenario,restored),last),restored);
  }
});

test('published six-step tutorial retains its two-point locked route, budget and exact replay',async()=>{
  const base=new URL('../site/apps/settlements/runtime/data/settlements/v1/',import.meta.url),id='chelyabinskaya_oblast';
  const json=async relative=>JSON.parse(await readFile(new URL(relative,base),'utf8'));
  const world=new World(await json(`regions/${id}.json`),JSON.parse(gunzipSync(await readFile(new URL(`transport/${id}.json.gz`,base)))));
  await loadDistanceTransportPolicy(world);const scenario=createIntroScenario(world,await json(`boundaries/${id}.geojson`),{version:5});
  let state=createState(world,scenario),previous;
  for (const [i,action] of scenario.referenceActions.entries()) {
    if(i===2){
      assert.equal(action.type,'connect');
      const other=scenario.targetIds.find(value=>value!==action.from&&value!==action.to);
      assert.equal(preview(world,scenario,state,stops([action.from,other,action.to])).ok,false);
    }
    const p=preview(world,scenario,state,action);assert.equal(p.ok,true,p.error);
    previous=state;state=apply(world,scenario,state,action);assert.deepEqual(state,p.nextState);
  }
  assert.equal(state.tutorialStep,6);assert.equal(state.spent,scenario.metadata.expectedReferenceCost);
  assert.deepEqual(undo(world,scenario,state),previous);roundTrip(world,scenario,state);
});

test('engine evidence identifies the files actually tested',async()=>{
  const hashes={};
  for (const relative of ['../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs','../site/apps/settlements/runtime/assets/js/settlements/v24/network-routing.mjs','./test-settlements-road-routes.mjs'])
    hashes[relative]=createHash('sha256').update(await readFile(new URL(relative,import.meta.url))).digest('hex');
  console.log(JSON.stringify({status:'pass',synthetic:true,hashes}));
});
