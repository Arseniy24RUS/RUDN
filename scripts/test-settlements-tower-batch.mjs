/** Atomic tower purchases: real replay compatibility and synthetic edge cases. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {World} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {SOCIAL_RULES_VERSION,RULES_VERSION,MAX_TOWER_BATCH,createState,apply,preview,evaluate,exportSave,restore,undo,towerSpec}
  from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
import {withPlayableRegionScope,playableRows} from '../site/apps/settlements/runtime/assets/js/settlements/v24/region-playability.mjs';
import {createSyntheticDistanceTransportPolicy,loadDistanceTransportPolicy}
  from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {createRegionalScenario,createIntroScenario} from '../site/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';
import {loadSocialPlan} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {INITIAL_TOWER_POLICY_VERSION,spacedInitialTowerSeeds} from '../site/apps/settlements/runtime/assets/js/settlements/v24/initial-tower-spacing.mjs';

const data=new URL('../site/apps/settlements/runtime/data/settlements/v1/',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,data),'utf8'));
const fingerprint=`sha256:${'0'.repeat(64)}`;
const batch=positions=>({type:'tower-batch',positions});
const position=row=>({lat:row.lat,lon:row.lon});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let previousPromise;
function publishedEngine(){
  if(!previousPromise){
    const location=new URL('../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs',import.meta.url);
    const source=execFileSync('git',['show','64589fada29591814d88da7b67cde327ae3fc1d0:site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs'],
      {cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true});
    assert.equal(createHash('sha256').update(source).digest('hex'),'1b02f1e2651958f845b7f3c968fcd5f048cf368ffbc55119294f74952747d0b4');
    const resolved=source.replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>`from '${new URL(path,location).href}'`);
    previousPromise=import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
  }
  return previousPromise;
}
async function regionalWorld(id){
  const world=new World(await json(`regions/${id}.json`),JSON.parse(gunzipSync(await readFile(new URL(`transport/${id}.json.gz`,data)))));
  await loadDistanceTransportPolicy(world);
  return {world,boundary:await json(`boundaries/${id}.geojson`)};
}
function synthetic({budget=100,legacy=false,spaced=true}={}){
  const settlements=[['a',37,100],['b',37.05,200],['c',37.16,300],['far',38,400],['empty',37.08,0]]
    .map(([id,lon,population])=>({id,name:id,lat:55,lon,population}));
  const world=new World({region:{id:'synthetic-tower-batch'},settlements},
    {status:'teaching',networkVersion:'synthetic-v1',nodes:settlements.map(row=>[row.id]),edges:[]});
  const scenario={id:legacy?'tower-batch-v1':'tower-batch-v5-hard',version:legacy?1:5,
    rulesVersion:legacy?RULES_VERSION:SOCIAL_RULES_VERSION,regionId:world.region.id,kind:'free',difficulty:'hard',
    initialBudget:budget,boundary:{type:'Polygon',coordinates:[[[36,54],[39,54],[39,56],[36,56],[36,54]]]},
    targetIds:settlements.filter(row=>row.population>0).map(row=>row.id),initialFacilities:[],initialRoutes:[],groups:[],
    ...(!legacy?{transportPolicy:createSyntheticDistanceTransportPolicy(world,{roadRequired:{},distanceMeters:{}}),
      telecomPlanVersion:'telecom-plan-v2',telecomPlanFingerprint:fingerprint,telecomInitialPopulationThreshold:8000,
      telecomInitialSeedIds:[],initialTowers:[],socialPolicyVersion:'social-policy-v1',socialPolicyFingerprint:fingerprint,
      ...(spaced?{initialTowerPolicyVersion:INITIAL_TOWER_POLICY_VERSION,
        initialTowerPolicyFingerprint:spacedInitialTowerSeeds(world,[]).fingerprint}:{})}:{})};
  return {world,scenario:withPlayableRegionScope(world,scenario)};
}

test('overlapping towers preview a unique coverage union; one purchase, one move, exact price and undo',()=>{
  const {world,scenario}=synthetic(),initial=createState(world,scenario),before=structuredClone(initial);
  const action=batch([position(world.row('a')),position(world.row('b'))]),q=preview(world,scenario,initial,action);
  assert.equal(q.ok,true);assert.equal(q.cost,.4);assert.equal(q.baseRevision,0);
  assert.deepEqual(q.coverageIds,['a','b','c']);assert.deepEqual(q.delta.telecom.newlyFullIds,['a','b','c']);
  assert.deepEqual(q.delta.telecom.improvedIds,['a','b','c']);assert.equal(q.delta.telecom.people,600);
  const next=apply(world,scenario,initial,action);
  assert.deepEqual(next,q.nextState);assert.deepEqual(initial,before);
  assert.equal(next.revision,1);assert.equal(next.actions.length,1);assert.equal(next.spent,.4);assert.equal(next.budget,99.6);
  assert.deepEqual(next.towers.map(tower=>tower.id),['tower:1:0','tower:1:1']);
  assert.deepEqual(next.towers.map(position),action.positions);
  assert.equal(evaluate(world,scenario,next).services.telecom.covered,3);
  assert.deepEqual(restore(world,scenario,exportSave(next)),next);assert.deepEqual(undo(world,scenario,next),initial);
  // Caller-owned preview inputs and exported snapshots cannot mutate state.
  action.positions[0].lat=0;
  const save=exportSave(next);save.actions[0].positions[0].lon=0;
  assert.deepEqual(next.actions[0].positions,[position(world.row('a')),position(world.row('b'))]);
});

test('a batch has the same costs, allocations and coverage as purchasing its towers separately',()=>{
  for(const legacy of [false,true]){
    const {world,scenario}=synthetic({legacy}),initial=createState(world,scenario);
    const positions=['a','b','far'].map(id=>position(world.row(id)));
    const together=apply(world,scenario,initial,batch(positions));
    const apart=positions.reduce((state,point)=>apply(world,scenario,state,{type:'tower',...point}),initial);
    assert.equal(together.spent,legacy?36:.6);
    assert.equal(together.budget,apart.budget);assert.equal(together.spent,apart.spent);
    assert.deepEqual(together.assignments,apart.assignments);
    assert.deepEqual(evaluate(world,scenario,together),evaluate(world,scenario,apart));
    assert.equal(together.actions.length,1);assert.equal(apart.actions.length,3);
  }
});

test('invalid count, duplicate, nonfinite, out-of-range and outside-polygon positions reject the entire batch',()=>{
  const {world,scenario}=synthetic(),initial=createState(world,scenario),before=structuredClone(initial);
  const a=position(world.row('a')),b=position(world.row('b'));
  const cases=[batch([]),batch([a]),batch(null),batch(Array.from({length:MAX_TOWER_BATCH+1},(_,i)=>({lat:55,lon:37+i/1000}))),
    batch([a,{...a}]),batch([a,null]),batch([a,undefined]),batch([a,{lat:NaN,lon:37}]),batch([a,{lat:55,lon:Infinity}]),
    batch([a,{lat:'55',lon:37}]),batch([a,{lat:91,lon:37}]),batch([a,{lat:55,lon:181}]),batch([a,{lat:55,lon:45}]),
    batch([a,b,...new Array(1)])];
  for(const action of cases){
    const result=preview(world,scenario,initial,action);
    assert.equal(result.ok,false,JSON.stringify(action));assert.throws(()=>apply(world,scenario,initial,action));
    assert.deepEqual(initial,before);assert.equal(initial.actions.length,0);assert.equal(initial.towers.length,0);
  }
});

test('budget is validated for the whole batch; exact funds and 100 positions use rounded money',()=>{
  const insufficient=synthetic({budget:.3}),a=position(insufficient.world.row('a')),b=position(insufficient.world.row('b'));
  const initial=createState(insufficient.world,insufficient.scenario),before=structuredClone(initial);
  const rejected=preview(insufficient.world,insufficient.scenario,initial,batch([a,b]));
  assert.equal(rejected.ok,false);assert.match(rejected.error,/Не хватает бюджета/);assert.deepEqual(initial,before);
  const exact=synthetic({budget:.6}),exactInitial=createState(exact.world,exact.scenario);
  const three=apply(exact.world,exact.scenario,exactInitial,batch(['a','b','far'].map(id=>position(exact.world.row(id)))));
  assert.equal(three.spent,.6);assert.equal(three.budget,0);
  const hundred=synthetic({budget:20}),hundredInitial=createState(hundred.world,hundred.scenario);
  assert.equal(MAX_TOWER_BATCH,100);
  const result=apply(hundred.world,hundred.scenario,hundredInitial,
    batch(Array.from({length:MAX_TOWER_BATCH},(_,i)=>({lat:55,lon:37+i/1000}))));
  assert.equal(result.spent,20);assert.equal(result.budget,0);assert.equal(result.actions.length,1);
  assert.equal(result.towers.length,100);assert.equal(new Set(result.towers.map(tower=>tower.id)).size,100);
  assert.deepEqual(restore(hundred.world,hundred.scenario,exportSave(result)),result);
});

test('geographic placement exception is identical to single tower, and preview improvements respect playable scope',()=>{
  const {world,scenario}=synthetic();
  // A synthetic narrow polygon excludes b while keeping it a canonical source row.
  const narrow={...scenario,boundary:{type:'Polygon',coordinates:[[[36.99,54.99],[37.01,54.99],[37.01,55.01],[36.99,55.01],[36.99,54.99]]]}};
  const scoped=withPlayableRegionScope(world,narrow),initial=createState(world,scoped);
  const positions=['a','b'].map(id=>position(world.row(id))),q=preview(world,scoped,initial,batch(positions));
  assert.equal(q.ok,true);assert.deepEqual(q.delta.telecom.newlyFullIds,['a']);assert.equal(q.delta.telecom.people,100);
  assert.deepEqual(q.coverageIds,['a','b','c']);
  const apart=positions.reduce((state,point)=>apply(world,scoped,state,{type:'tower',...point}),initial);
  assert.deepEqual(q.nextState.assignments,apart.assignments);
  assert.equal(evaluate(world,scoped,q.nextState).services.telecom.covered,1);
});

test('existing unspaced and legacy parties use their existing envelope; old readers reject a batch instead of misreplaying it',async()=>{
  const old=await publishedEngine();
  for(const options of [{spaced:false},{legacy:true}]){
    const {world,scenario}=synthetic(options),initial=createState(world,scenario);
    const oldInitial=old.createState(world,scenario);assert.deepEqual(initial,oldInitial);
    assert.equal(JSON.stringify(exportSave(initial)),JSON.stringify(old.exportSave(oldInitial)));
    const moved=apply(world,scenario,initial,batch(['a','b'].map(id=>position(world.row(id))))),save=exportSave(moved);
    assert.equal(save.rulesVersion,'settlements-3.4.1');assert.equal(save.engineRulesVersion,initial.rulesVersion);
    assert.throws(()=>old.restore(world,scenario,save),/Неизвестное действие/);
    assert.deepEqual(restore(world,scenario,save),moved);assert.deepEqual(undo(world,scenario,moved),initial);
  }
});

test('KhMAO on every difficulty: published save bytes stay exact; batch has one revision and 3.4.2 round-trip',async()=>{
  const old=await publishedEngine(),{world,boundary}=await regionalWorld('khanty_mansiyskiy_avtonomnyy_okrug_yugra');
  const sourceDigest=digest({rows:world.rows,walk:world.walk,drive:world.drive});
  for(const difficulty of ['easy','normal','hard']){
    await loadSocialPlan(world,{difficulty});
    const scenario=withPlayableRegionScope(world,createRegionalScenario(world,boundary,{mode:'free',version:5,difficulty}));
    const initial=createState(world,scenario),oldInitial=old.createState(world,scenario);
    assert.deepEqual(initial,oldInitial);
    const positions=playableRows(world,scenario).filter(row=>row.population>0).slice(0,3).map(position);
    const single={type:'tower',...positions[0]},oldMoved=old.apply(world,scenario,oldInitial,single);
    const saved=old.exportSave(oldMoved),restored=restore(world,scenario,saved);
    assert.deepEqual(restored,oldMoved);assert.equal(JSON.stringify(exportSave(restored)),JSON.stringify(saved));
    const moved=apply(world,scenario,restored,batch(positions)),q=preview(world,scenario,restored,batch(positions));
    assert.equal(q.ok,true);assert.equal(q.cost,.6);assert.equal(moved.revision,oldMoved.revision+1);
    assert.equal(moved.actions.length,oldMoved.actions.length+1);
    assert.equal(moved.spent,Math.round((oldMoved.spent+.6)*10)/10);
    assert.equal(moved.budget,Math.round((oldMoved.budget-.6)*10)/10);
    assert.deepEqual(moved.towers.slice(-3).map(tower=>tower.id),['tower:2:0','tower:2:1','tower:2:2']);
    const save=exportSave(moved);assert.equal(save.rulesVersion,'settlements-3.4.2');
    assert.equal(save.initialTowerPolicyFingerprint,saved.initialTowerPolicyFingerprint);
    assert.throws(()=>old.restore(world,scenario,save),/Неизвестное действие/);
    assert.deepEqual(restore(world,scenario,save),moved);assert.deepEqual(undo(world,scenario,moved),oldMoved);
    assert.equal(evaluate(world,scenario,moved).services.telecom.total,191);
    assert.equal(q.delta.telecom.newlyFullIds.includes(`${world.region.id}:5801`),false);
  }
  assert.equal(digest({rows:world.rows,walk:world.walk,drive:world.drive}),sourceDigest);
});

test('tutorial keeps its three mandatory actions and permits batches only after those steps',async()=>{
  const {world,boundary}=await regionalWorld('chelyabinskaya_oblast'),scenario=createIntroScenario(world,boundary,{version:5});
  const initial=createState(world,scenario),positions=scenario.targetIds.slice(0,2).map(id=>position(world.row(id))),action=batch(positions);
  let state=initial;
  for(const step of scenario.tutorial.steps){
    assert.equal(preview(world,scenario,state,action).ok,false);
    assert.throws(()=>apply(world,scenario,state,action),/текущий шаг/);
    state=apply(world,scenario,state,step.action);
  }
  assert.equal(state.actions.length,3);
  const before=structuredClone(state),q=preview(world,scenario,state,action);assert.equal(q.ok,true);
  const next=apply(world,scenario,state,action);assert.equal(next.actions.length,4);
  assert.deepEqual(undo(world,scenario,next),before);assert.deepEqual(restore(world,scenario,exportSave(next)),next);
});
