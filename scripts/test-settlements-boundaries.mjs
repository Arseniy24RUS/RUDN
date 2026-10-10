/** Regional-goal regressions. Canonical source rows and historical replay remain intact. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {World} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {SOCIAL_RULES_VERSION,SERVICES,createState,apply,preview,evaluate,exportSave,restore,undo,pointInBoundary}
  from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
import {withPlayableRegionScope,isPlayableSettlement,playableRows}
  from '../site/apps/settlements/runtime/assets/js/settlements/v24/region-playability.mjs';
import {createSyntheticDistanceTransportPolicy,loadDistanceTransportPolicy}
  from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {createRegionalScenario,createIntroScenario} from '../site/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';
import {loadSocialPlan} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {INITIAL_TOWER_POLICY_VERSION,spacedInitialTowerSeeds} from '../site/apps/settlements/runtime/assets/js/settlements/v24/initial-tower-spacing.mjs';
import {sourceWorldFor} from '../site/apps/settlements/runtime/assets/js/settlements/v24/federal-cities.mjs';
import {classifyCompletion,pointsForResult} from '../site/apps/settlements/runtime/assets/js/settlements/v24/platform-rules.mjs';
import {resultMetrics} from '../site/apps/settlements/entry.mjs';
import {settlementsPoints} from '../site/assets/js/settlements-leaderboard.js';

const base=new URL('../site/apps/settlements/runtime/data/settlements/v1/',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rect=(west,south,east,north)=>[[west,south],[east,south],[east,north],[west,north],[west,south]];
const polygon=(...rings)=>({type:'Polygon',coordinates:rings});
const boundary=polygon(rect(36.9,54.9,37.1,55.1));
const fingerprint=`sha256:${'0'.repeat(64)}`;
let previousPromise;
function publishedEngine(){
  if(!previousPromise){
    const location=new URL('../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs',import.meta.url);
    const source=execFileSync('git',['show','c1458c828b25d5aa3c3d15809ba7834859cf7906:site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs'],
      {cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true});
    assert.equal(createHash('sha256').update(source).digest('hex'),'f1559363f5ce7aac8db19036f43e35f9656cadad904a99d2171c58ddaa7b62a3');
    const resolved=source.replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>`from '${new URL(path,location).href}'`);
    previousPromise=import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
  }
  return previousPromise;
}
async function regionalWorld(id){
  const world=new World(await json(`regions/${id}.json`),JSON.parse(gunzipSync(await readFile(new URL(`transport/${id}.json.gz`,base)))));
  await loadDistanceTransportPolicy(world);
  return {world,boundary:await json(`boundaries/${id}.geojson`)};
}
function syntheticParty(){
  const settlements=[{id:'a',lat:55,lon:37,population:100},{id:'b',lat:55,lon:37.02,population:200},
    {id:'outside',lat:55,lon:40,population:35},{id:'empty',lat:55,lon:37.04,population:0},
    {id:'unknown',lat:55,lon:37.06,population:null}].map(row=>({...row,name:row.id}));
  const world=new World({region:{id:'synthetic-boundary'},settlements},
    {status:'teaching',networkVersion:'synthetic-v1',nodes:settlements.map(row=>[row.id]),edges:[[0,1,5,1],[1,0,5,1]]});
  const scenario={id:'synthetic-boundary-v5-hard',version:5,rulesVersion:SOCIAL_RULES_VERSION,regionId:world.region.id,
    kind:'free',difficulty:'hard',initialBudget:1000,boundary,targetIds:['a','b','outside'],
    transportPolicy:createSyntheticDistanceTransportPolicy(world,{roadRequired:{'a|b':false},distanceMeters:{'a|b':1000}}),
    telecomPlanVersion:'telecom-plan-v2',telecomPlanFingerprint:fingerprint,telecomInitialPopulationThreshold:8000,
    telecomInitialSeedIds:[],initialTowers:[],socialPolicyVersion:'social-policy-v1',socialPolicyFingerprint:fingerprint,
    initialTowerPolicyVersion:INITIAL_TOWER_POLICY_VERSION,initialTowerPolicyFingerprint:spacedInitialTowerSeeds(world,[]).fingerprint,
    initialFacilities:['a','b','outside'].flatMap(id=>['medical','school','culture'].map(type=>({id:`${id}-${type}`,type,settlementId:id,capacityUnits:100000}))),
    initialRoutes:[],groups:[{id:'all',service:'telecom',ids:['a','b','outside']}]};
  return {world,scenario,scoped:withPlayableRegionScope(world,scenario)};
}

test('scope uses full polygon with holes and all multipolygon islands, including valid zero/unknown population points',()=>{
  const geometry={type:'MultiPolygon',coordinates:[[rect(0,0,10,10),rect(4,4,6,6)],[rect(20,20,22,22)]]};
  const rows=[['inside',1,1,100],['empty',2,2,0],['unknown',3,3,null],['hole',5,5,100],['island',21,21,5],
    ['outside',11,11,100],['edge',0,3,100],['nan',NaN,1,100],['null',null,1,100],['latitude',91,1,100],['longitude',1,181,100]]
    .map(([id,lat,lon,population])=>({id,lat,lon,population}));
  const world={rows,valid:rows.filter(row=>Number.isFinite(row.lat)&&Number.isFinite(row.lon))};
  const scenario={kind:'free',boundary:{type:'FeatureCollection',features:[{type:'Feature',geometry}]},targetIds:rows.map(row=>row.id)};
  const before=structuredClone(scenario),scope=withPlayableRegionScope(world,scenario);
  assert.deepEqual(scope.playableSettlementIds,['inside','empty','unknown','island','edge']);
  assert.deepEqual(scope.targetIds,['edge','inside','island']);
  assert.deepEqual(playableRows(world,scope).map(row=>row.id),scope.playableSettlementIds);
  for(const row of rows)assert.equal(isPlayableSettlement(scope,row.id),scope.playableSettlementIds.includes(row.id));
  assert.equal(isPlayableSettlement(scope,'missing'),false);
  assert.equal(scope.metadata.excludedSettlementCount,6);
  assert.deepEqual(scenario,before);assert.equal(playableRows(world,scope)[0],rows[0]);
  // Deserialized scenario scopes rebuild their membership cache correctly.
  assert.equal(isPlayableSettlement(structuredClone(scope),'hole'),false);
  assert.deepEqual(playableRows(world,structuredClone(scope)),playableRows(world,scope));
});

test('dateline polygon and hole keep their narrow geographic meaning on both hemispheres',()=>{
  const shape=polygon(rect(170,60,-170,70),rect(178,63,-178,67));
  for(const [lat,lon,inside] of [[61,179,true],[61,-179,true],[65,175,true],[65,-175,true],
    [65,179,false],[65,-179,false],[65,0,false],[71,179,false],[60,170,true]]){
    assert.equal(pointInBoundary(shape,lat,lon),inside,`${lat},${lon}`);
  }
  const world={rows:[{id:'east',lat:61,lon:179,population:1},{id:'west',lat:61,lon:-179,population:1},
    {id:'hole',lat:65,lon:179,population:1},{id:'opposite',lat:65,lon:0,population:1}]};
  assert.deepEqual(withPlayableRegionScope(world,{kind:'free',boundary:shape}).targetIds,['east','west']);
});

test('missing boundary explicitly keeps every valid coordinate while invalid coordinates are excluded',()=>{
  const world={rows:[{id:'north',lat:90,lon:180,population:1},{id:'south',lat:-90,lon:-180,population:0},
    {id:'unknown',lat:0,lon:0,population:null},{id:'bad',lat:Infinity,lon:1,population:1},{id:'null',lat:null,lon:1,population:1}]};
  const scoped=withPlayableRegionScope(world,{kind:'free',boundary:null});
  assert.deepEqual(scoped.playableSettlementIds,['north','south','unknown']);assert.deepEqual(scoped.targetIds,['north']);
});

test('scope leaves canonical world rows, source identity, directed graph and plan identities untouched',()=>{
  const {world,scenario}=syntheticParty(),before=digest({rows:world.rows,walk:world.walk,drive:world.drive,scenario});
  const source=sourceWorldFor(world),scoped=withPlayableRegionScope(world,scenario);
  assert.equal(sourceWorldFor(world),source);assert.equal(world.row('outside').population,35);
  assert.equal(digest({rows:world.rows,walk:world.walk,drive:world.drive,scenario}),before);
  for(const key of ['transportPolicy','telecomPlanFingerprint','socialPolicyFingerprint','initialTowerPolicyFingerprint','initialFacilities','initialTowers'])
    assert.equal(scoped[key],scenario[key],key);
});

test('an old party blocked only by an outside settlement reaches all four 100% goals and correct platform points',async()=>{
  const previous=await publishedEngine(),{world,scenario,scoped}=syntheticParty();
  const old=previous.apply(world,scenario,previous.createState(world,scenario),{type:'tower',lat:55,lon:37});
  const save=previous.exportSave(old),state=restore(world,scoped,save),legacy=previous.evaluate(world,scenario,old),now=evaluate(world,scoped,state);
  assert.equal(legacy.complete,false);assert.deepEqual(legacy.services.telecom.missingIds,['outside']);
  assert.equal(classifyCompletion(world,scenario,old,legacy).status,'playing');
  assert.equal(now.complete,true);assert.equal(classifyCompletion(world,scoped,state,now).status,'complete');
  for(const service of SERVICES){assert.equal(now.services[service].covered,2);assert.equal(now.services[service].total,2);
    assert.equal(now.services[service].population,300);assert.equal(now.services[service].people,300);assert.deepEqual(now.services[service].missingIds,[]);}
  assert.equal(now.groups[0].complete,true);assert.deepEqual(now.groups[0].ids,['a','b']);
  const result=resultMetrics(now,exportSave(state),'complete',60000);
  assert.equal(result.coverageNp,100);assert.equal(result.coveragePopulation,100);
  for(const [difficulty,points] of [['easy',3],['normal',4],['hard',5]]){
    assert.equal(pointsForResult(difficulty,now),points);assert.equal(settlementsPoints(difficulty,result.coverageNp,true,'assessment'),points);
    assert.equal(settlementsPoints(difficulty,result.coverageNp,true,'free'),0);
  }
  assert.deepEqual(state,old);assert.equal(JSON.stringify(exportSave(state)),JSON.stringify(save));
  assert.deepEqual(now.byId,legacy.byId);assert.deepEqual(now.facilityUsage,legacy.facilityUsage);
  assert.ok(state.assignments.medical.outside,'Historical outside allocations are preserved for replay identity');
  assert.deepEqual(undo(world,scoped,state),previous.createState(world,scenario));
});

test('outside-only tower preview has no regional gains, while old actions and every undo retain exact bytes',async()=>{
  const previous=await publishedEngine(),{world,scenario,scoped}=syntheticParty();
  let old=previous.createState(world,scenario);const history=[old];
  const actions=[{type:'tower',lat:55,lon:37},{type:'tower',lat:55,lon:40},{type:'connect',stopIds:['a','b']}];
  for(const action of actions){
    const before=restore(world,scoped,previous.exportSave(old));
    if(action.lon===40){const legacy=previous.preview(world,scenario,old,action),current=preview(world,scoped,before,action);
      assert.equal(current.ok,true,current.error);assert.deepEqual(legacy.delta.telecom.newlyFullIds,['outside']);
      assert.deepEqual(current.delta.telecom,{newlyFullIds:[],improvedIds:[],people:0});
    }
    old=previous.apply(world,scenario,old,action);history.push(old);
    const save=previous.exportSave(old),restored=restore(world,scoped,save);
    assert.deepEqual(restored,old);assert.equal(JSON.stringify(exportSave(restored)),JSON.stringify(save));
    assert.deepEqual(apply(world,scoped,before,action),old);
  }
  for(let i=history.length-1;i>0;i--)assert.deepEqual(undo(world,scoped,history[i]),history[i-1]);
});

test('real HMAO at all three difficulties excludes Sosnina without changing initial state, fingerprints or replay',async()=>{
  const previous=await publishedEngine(),id='khanty_mansiyskiy_avtonomnyy_okrug_yugra';
  const {world,boundary}=await regionalWorld(id),outlier=world.row(`${id}:5801`),source=sourceWorldFor(world);
  assert.equal(outlier.name,'Соснина');assert.equal(outlier.population,35);assert.equal(pointInBoundary(boundary,outlier.lat,outlier.lon),false);
  const canonical=digest({rows:world.rows,walk:world.walk,drive:world.drive});
  for(const difficulty of ['easy','normal','hard']){
    await loadSocialPlan(world,{difficulty});
    const scenario=createRegionalScenario(world,boundary,{mode:'free',version:5,difficulty}),scoped=withPlayableRegionScope(world,scenario);
    assert.equal(isPlayableSettlement(scoped,outlier.id),false);assert.equal(scoped.targetIds.includes(outlier.id),false);
    for(const key of ['id','version','difficulty','transportPolicy','telecomPlanFingerprint','socialPolicyFingerprint','initialTowerPolicyFingerprint'])
      assert.equal(scoped[key],scenario[key],key);
    const old=previous.createState(world,scenario),initial=createState(world,scoped);
    assert.deepEqual(initial,old);assert.equal(previous.exportSave(old).rulesVersion,'settlements-3.4.2');
    const row=playableRows(world,scoped).find(row=>row.population>0),action={type:'tower',lat:row.lat,lon:row.lon};
    const moved=previous.apply(world,scenario,old,action),save=previous.exportSave(moved),restored=restore(world,scoped,save);
    assert.deepEqual(restored,moved);assert.equal(JSON.stringify(exportSave(restored)),JSON.stringify(save));
    assert.deepEqual(undo(world,scoped,restored),old);
    for(const service of SERVICES){const coverage=evaluate(world,scoped,restored).services[service];
      assert.equal(coverage.total,scoped.targetIds.length);assert.equal(coverage.missingIds.includes(outlier.id),false);}
  }
  assert.equal(sourceWorldFor(world),source);assert.equal(digest({rows:world.rows,walk:world.walk,drive:world.drive}),canonical);
});

test('actual seven-settlement tutorial keeps scenario identity and its published six-action replay',async()=>{
  const previous=await publishedEngine(),{world,boundary}=await regionalWorld('chelyabinskaya_oblast');
  const scenario=createIntroScenario(world,boundary,{version:5}),scoped=withPlayableRegionScope(world,scenario);
  assert.equal(scoped,scenario);assert.equal(scoped.targetIds.length,7);
  let state=createState(world,scoped),old=previous.createState(world,scenario);
  for(const action of scenario.referenceActions){state=apply(world,scoped,state,action);old=previous.apply(world,scenario,old,action);assert.deepEqual(state,old);}
  assert.equal(state.tutorialStep,6);assert.equal(JSON.stringify(exportSave(state)),JSON.stringify(previous.exportSave(old)));
  assert.deepEqual(restore(world,scoped,exportSave(state)),state);
});
