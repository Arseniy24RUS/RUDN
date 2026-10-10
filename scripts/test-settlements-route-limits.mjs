/** Local route limits, with synthetic distances and a real published replay reader. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {World,haversine} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {MAX_ROUTE_STOPS,MAX_ROUTE_DISTANCE_KM,ROUTE_POLICY_VERSION,RULES_VERSION,FIXED_TRANSPORT_RULES_VERSION,
  SOCIAL_RULES_VERSION,SERIALIZED_ACTIONS_RULES_VERSION,INITIAL_NETWORK_SAVE_RULES_VERSION,ROUTE_LIMIT_SAVE_RULES_VERSION,createState,preview,apply,evaluate,exportSave,restore,undo}
  from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
import {createSyntheticTransportPolicy} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v1.mjs';
import {createSyntheticDistanceTransportPolicy} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {INITIAL_TOWER_POLICY_VERSION,spacedInitialTowerSeeds} from '../site/apps/settlements/runtime/assets/js/settlements/v24/initial-tower-spacing.mjs';

const fingerprint=`sha256:${'0'.repeat(64)}`;
const stops=stopIds=>({type:'connect',stopIds});
const pointPair=(from,to)=>({type:'connect',from,to});
const marked=action=>({...action,routePolicyVersion:ROUTE_POLICY_VERSION});
const markedSave=save=>({...structuredClone(save),rulesVersion:ROUTE_LIMIT_SAVE_RULES_VERSION,
  engineRulesVersion:save.engineRulesVersion??save.rulesVersion,actions:save.actions.map(marked)});
let publishedPromise;
function publishedEngine(){
  if(!publishedPromise){
    const location=new URL('../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs',import.meta.url);
    const source=execFileSync('git',['show','0d2a786d1a71ce52bf6902fff658f9b24836c555:site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs'],
      {cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true});
    assert.equal(createHash('sha256').update(source).digest('hex'),'f44687a27d9526f9652b49172f8d818cc2afa8f63f2174adace6c8729f794b5a');
    const resolved=source.replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>`from '${new URL(path,location).href}'`);
    publishedPromise=import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
  }
  return publishedPromise;
}
function fixture({ids=['a','b','c','d','e','f','g'],links=null,bidirectional=true,initialRoutes=[],rows={},version=5,budget=10000,spaced=false}={}){
  links??=ids.slice(1).map((id,i)=>[ids[i],id,1000,false]);
  const settlements=ids.map((id,i)=>({id,name:id,lat:55,lon:37+i*.01,population:100,...rows[id]}));
  const edges=[],roadRequired={},distanceMeters={};
  for(const [from,to,meters,required=false] of links){
    edges.push([ids.indexOf(from),ids.indexOf(to),5,1]);
    if(bidirectional)edges.push([ids.indexOf(to),ids.indexOf(from),5,1]);
    const key=[from,to].sort().join('|');roadRequired[key]=required;distanceMeters[key]=meters;
  }
  const world=new World({region:{id:'synthetic-local-route'},settlements},
    {status:'teaching',networkVersion:'synthetic-v1',nodes:ids.map(id=>[id]),edges});
  const rulesVersion=version===1?RULES_VERSION:version===2?FIXED_TRANSPORT_RULES_VERSION:SOCIAL_RULES_VERSION;
  const scenario={id:`synthetic-local-route-v${version}-normal`,version,rulesVersion,regionId:world.region.id,kind:'free',difficulty:'normal',
    initialBudget:budget,targetIds:ids,transportPolicy:version===2?createSyntheticTransportPolicy(world,roadRequired):
      createSyntheticDistanceTransportPolicy(world,{roadRequired,distanceMeters}),
    telecomPlanVersion:'telecom-plan-v2',telecomPlanFingerprint:fingerprint,socialPolicyVersion:'social-policy-v1',
    socialPolicyFingerprint:fingerprint,telecomInitialPopulationThreshold:8000,initialTowers:[],initialFacilities:[],initialRoutes,
    ...(spaced?{telecomInitialSeedIds:[],initialTowerPolicyVersion:INITIAL_TOWER_POLICY_VERSION,initialTowerPolicyFingerprint:spacedInitialTowerSeeds(world,[]).fingerprint}:{})};
  return {world,scenario,state:createState(world,scenario)};
}
function rejectsWithoutMutation({world,scenario,state},action,error){
  const before=structuredClone(state),raw=structuredClone(action),p=preview(world,scenario,state,action);
  assert.equal(p.ok,false);assert.match(p.error,error);assert.throws(()=>apply(world,scenario,state,action),error);
  assert.deepEqual(state,before);assert.deepEqual(action,raw);
}
function roundTrip({world,scenario},state){
  const save=exportSave(state),serialized=JSON.stringify(save),restored=restore(world,scenario,JSON.parse(serialized));
  assert.deepEqual(restored,state);assert.equal(JSON.stringify(exportSave(restored)),serialized);
}

test('five nearby stops form one purchase; six stops fail before resolving an absent leg',()=>{
  assert.equal(MAX_ROUTE_STOPS,5);assert.equal(MAX_ROUTE_DISTANCE_KM,100);
  const fx=fixture(),{world,scenario,state}=fx,action=stops(['a','b','c','d','e']),before=structuredClone(state);
  const p=preview(world,scenario,state,action);assert.equal(p.ok,true,p.error);assert.equal(p.cost,.8);
  assert.equal(p.action.routePolicyVersion,ROUTE_POLICY_VERSION);assert.deepEqual(p.path,action.stopIds);
  const next=apply(world,scenario,state,action);assert.equal(next.revision,1);assert.equal(next.actions.length,1);
  assert.deepEqual(next,p.nextState);assert.equal(next.budget,9999.2);assert.deepEqual(state,before);roundTrip(fx,next);
  assert.deepEqual(undo(world,scenario,next),state);
  rejectsWithoutMutation(fx,stops(['a','b','c','d','e','missing']),/не более 5 поселений/);
  rejectsWithoutMutation(fx,{type:'connect',selectedIds:['a','b','c','d','e','f']},/не более 5 поселений/);
});

test('100000 metres is inclusive, while 100001 rejects atomically with the total trip length',()=>{
  for(const meters of [100000,100001]){
    const fx=fixture({ids:['a','b','c'],links:[['a','b',60000],['b','c',meters-60000]]});
    for(const action of [stops(['a','b','c']),pointPair('a','c'),stops(['a','c'])]){
      if(meters===100001){rejectsWithoutMutation(fx,action,/Длина маршрута — 101 км\. Максимум — 100 км/);continue;}
      const p=preview(fx.world,fx.scenario,fx.state,action);assert.equal(p.ok,true,p.error);
      assert.equal(p.transportCost.distanceKm,100);assert.equal(p.cost,20);roundTrip(fx,p.nextState);
    }
  }
});

test('a direct source edge over 100 km remains purchasable, but a long path through intermediate nodes does not',()=>{
  const direct=fixture({ids:['a','b'],links:[['a','b',250000]]});
  for(const action of [pointPair('a','b'),stops(['a','b'])]){
    const p=preview(direct.world,direct.scenario,direct.state,action);assert.equal(p.ok,true,p.error);
    assert.deepEqual(p.path,['a','b']);assert.equal(p.cost,50);assert.equal(p.transportCost.distanceKm,250);roundTrip(direct,p.nextState);
  }
  const via=fixture({ids:['a','b','c'],links:[['a','b',125000],['b','c',125000]]});
  rejectsWithoutMutation(via,pointPair('a','c'),/Максимум — 100 км/);
  rejectsWithoutMutation(via,stops(['a','c']),/Максимум — 100 км/);
  rejectsWithoutMutation(via,stops(['a','b','c']),/Максимум — 100 км/);
  const first=apply(via.world,via.scenario,via.state,pointPair('a','b'));
  const second=apply(via.world,via.scenario,first,pointPair('b','c'));
  assert.equal(second.actions.length,2);assert.equal(second.spent,50);roundTrip(via,second);
});

test('already active and repeatedly traversed sections still consume the route distance allowance',()=>{
  const active=fixture({ids:['a','b','c'],links:[['a','b',60000],['b','c',50000]],initialRoutes:[{from:'a',to:'b',path:['a','b']}]});
  rejectsWithoutMutation(active,stops(['a','b','c']),/Длина маршрута — 110 км/);
  const allowed=preview(active.world,active.scenario,active.state,stops(['b','c']));assert.equal(allowed.ok,true);assert.equal(allowed.cost,10);
  const repeated=fixture({ids:['a','b','c','d'],links:[['a','b',25000],['b','c',25000],['c','d',25000]]});
  rejectsWithoutMutation(repeated,stops(['a','c','b','d']),/Длина маршрута — 125 км/);
  assert.equal(preview(repeated.world,repeated.scenario,repeated.state,stops(['a','b','c','d'])).ok,true);
});

test('an over-limit cheap detour falls back only to a real directed source edge with its full price',()=>{
  for(const directMeters of [50000,150000]){
    const fx=fixture({ids:['a','b','c','d'],links:[['a','b',60000],['b','c',60000],['c','d',1000],['a','d',directMeters]],
      initialRoutes:[{from:'a',to:'c',path:['a','b','c']}]});
    for(const action of [pointPair('a','d'),stops(['a','d'])]){
      const p=preview(fx.world,fx.scenario,fx.state,action);assert.equal(p.ok,true,p.error);
      assert.deepEqual(p.path,['a','d']);assert.deepEqual(p.freshPath,[['a','d']]);assert.deepEqual(p.edgeKeys,['a|d']);
      assert.deepEqual(p.freshEdgeKeys,['a|d']);assert.equal(p.joinId,'d');assert.equal(p.requestedTo,'d');
      assert.equal(p.cost,directMeters/1000*.2);assert.equal(p.transportCost.distanceKm,directMeters/1000);
      const next=apply(fx.world,fx.scenario,fx.state,action);assert.deepEqual(next,p.nextState);roundTrip(fx,next);
      assert.deepEqual(undo(fx.world,fx.scenario,next),fx.state);
    }
  }
  const reverseOnly=fixture({ids:['a','b','c','d'],links:[['a','b',60000],['b','c',60000],['c','d',1000],['d','a',50000]],
    bidirectional:false,initialRoutes:[{from:'a',to:'c',path:['a','b','c']}]});
  rejectsWithoutMutation(reverseOnly,pointPair('a','d'),/Максимум — 100 км/);
});

test('joining an existing network enforces the actual new path limit, while a single remote edge remains legal',()=>{
  const fx=fixture({ids:['a','b','c','d'],links:[['a','b',60000],['b','c',150000],['c','d',1000]],
    initialRoutes:[{from:'c',to:'d',path:['c','d']}]});
  rejectsWithoutMutation(fx,{type:'connect-network',from:'a',targetEdge:['c','d']},/Длина маршрута — 210 км/);
  const p=preview(fx.world,fx.scenario,fx.state,{type:'connect-network',from:'b',targetEdge:['c','d']});
  assert.equal(p.ok,true,p.error);assert.deepEqual(p.path,['b','c']);assert.equal(p.action.routePolicyVersion,ROUTE_POLICY_VERSION);
  assert.equal(p.cost,30);roundTrip(fx,p.nextState);
});

test('limits never manufacture missing directed routes or charge a partially valid batch',()=>{
  const fx=fixture({ids:['a','b','c'],links:[['a','b',1000],['b','c',1000]],bidirectional:false});
  rejectsWithoutMutation(fx,stops(['a','c','b']),/Связь отсутствует/);
  rejectsWithoutMutation(fx,pointPair('c','a'),/Связь отсутствует/);
  const p=preview(fx.world,fx.scenario,fx.state,stops(['a','b','c']));assert.equal(p.ok,true,p.error);
  assert.equal(p.cost,.4);roundTrip(fx,p.nextState);
  const poor=fixture({budget:.3,ids:['a','b','c']});rejectsWithoutMutation(poor,stops(['a','b','c']),/Не хватает бюджета/);
});

test('legacy fixed-price rules use actual source coordinates for distance and retain the direct-edge exception',()=>{
  for(const version of [1,2]){
    // Declared transport metres are deliberately short: legacy rules must use
    // source haversine length rather than a newer policy or screen geometry.
    const fx=fixture({ids:['a','b','c'],version,rows:{a:{lat:0,lon:0},b:{lat:0,lon:.5},c:{lat:0,lon:1}}});
    assert(haversine(fx.world.row('a'),fx.world.row('c'))>100);
    rejectsWithoutMutation(fx,stops(['a','b','c']),/Максимум — 100 км/);
    rejectsWithoutMutation(fx,pointPair('a','c'),/Максимум — 100 км/);
    const direct=fixture({ids:['a','b'],version,rows:{a:{lat:0,lon:0},b:{lat:0,lon:2}}});
    const p=preview(direct.world,direct.scenario,direct.state,pointPair('a','b'));assert.equal(p.ok,true,p.error);
    assert.equal(p.cost,version===1?8:2);roundTrip(direct,p.nextState);
  }
});

test('unmarked oversized published saves restore and export exactly, then accept a bounded move and undo it',async()=>{
  const previous=await publishedEngine();
  const fx=fixture({links:[['a','b',40000],['b','c',40000],['c','d',40000],['d','e',40000],['e','f',40000],['f','g',1000]]});
  for(const historicalAction of [stops(['a','b','c','d','e','f']),stops(['a','c','f']),pointPair('a','f')]){
    const initial=previous.createState(fx.world,fx.scenario),historical=previous.apply(fx.world,fx.scenario,initial,historicalAction);
    const save=previous.exportSave(historical),serialized=JSON.stringify(save),restored=restore(fx.world,fx.scenario,save);
    assert.deepEqual(restored,historical);assert.equal(JSON.stringify(exportSave(restored)),serialized);
    assert.deepEqual(evaluate(fx.world,fx.scenario,restored),previous.evaluate(fx.world,fx.scenario,historical));
    assert.deepEqual(undo(fx.world,fx.scenario,restored),initial);
    rejectsWithoutMutation(fx,historicalAction,/не более 5 поселений|Максимум — 100 км/);
    const markedReplay=markedSave(save);
    assert.throws(()=>restore(fx.world,fx.scenario,markedReplay),/не более 5 поселений|Максимум — 100 км/);
    const next=apply(fx.world,fx.scenario,restored,pointPair('f','g'));
    assert.equal(next.revision,historical.revision+1);assert.equal(next.actions.length,historical.actions.length+1);
    assert.deepEqual(next.actions.slice(0,-1),historical.actions);assert.equal(next.actions.at(-1).routePolicyVersion,ROUTE_POLICY_VERSION);
    assert.equal(next.spent,historical.spent+.2);assert.deepEqual(undo(fx.world,fx.scenario,next),historical);roundTrip(fx,next);
  }
});

test('old network joins replay unchanged, but explicit or implicit current markers cannot bypass validation',async()=>{
  const previous=await publishedEngine(),fx=fixture({ids:['a','b','c','d'],links:[['a','b',60000],['b','c',60000],['c','d',1000]],
    initialRoutes:[{from:'c',to:'d',path:['c','d']}]});
  const action={type:'connect-network',from:'a',targetEdge:['c','d']},historical=previous.apply(fx.world,fx.scenario,fx.state,action);
  assert.deepEqual(restore(fx.world,fx.scenario,previous.exportSave(historical)),historical);
  for(const current of [action,marked(action),{...action,routePolicyVersion:undefined}])rejectsWithoutMutation(fx,current,/Максимум — 100 км/);
  const forged=markedSave(previous.exportSave(historical));
  assert.throws(()=>restore(fx.world,fx.scenario,forged),/Максимум — 100 км/);
  for(const unknown of ['legacy','local-route-v2',null])rejectsWithoutMutation(fx,{...action,routePolicyVersion:unknown},/Неизвестные условия/);
});

test('every new route stores its marker through serialized checkpoint payloads without changing internal rules or source identity',()=>{
  for(const action of [stops(['a','b','c']),pointPair('a','c'),{type:'connect',selectedIds:['a','b','c']},
    {type:'connect-network',from:'a',targetEdge:['c','d']}]){
    const fx=fixture({ids:['a','b','c','d'],initialRoutes:[{from:'c',to:'d',path:['c','d']}]}),before=structuredClone(action);
    const next=apply(fx.world,fx.scenario,fx.state,action),save=exportSave(next);
    assert.equal(next.rulesVersion,SOCIAL_RULES_VERSION);assert.equal(next.dataVersion,fx.state.dataVersion);
    assert.equal(save.rulesVersion,ROUTE_LIMIT_SAVE_RULES_VERSION);assert.equal(save.engineRulesVersion,SOCIAL_RULES_VERSION);
    assert.equal(save.actions[0].routePolicyVersion,ROUTE_POLICY_VERSION);assert.deepEqual(action,before);
    const checkpoint=JSON.parse(JSON.stringify({revision:87,engineSave:save,ui:{layer:'medical'}}));
    assert.equal(checkpoint.revision,87);assert.deepEqual(restore(fx.world,fx.scenario,checkpoint.engineSave),next);
    roundTrip(fx,next);
    const unknown=structuredClone(save);unknown.actions[0].routePolicyVersion='unrecognized';
    assert.throws(()=>restore(fx.world,fx.scenario,unknown),/Неизвестные условия/);
  }
  const fx=fixture();rejectsWithoutMutation(fx,{type:'tower',lat:55,lon:37,routePolicyVersion:ROUTE_POLICY_VERSION},/Неизвестные условия/);
});

test('the new save envelope preserves initial networks and makes the actual previous reader reject changed routing',async()=>{
  const previous=await publishedEngine();
  assert.equal(ROUTE_LIMIT_SAVE_RULES_VERSION,'settlements-3.4.3');
  for(const spaced of [false,true]){
    const fx=fixture({spaced,ids:['a','b','c','d'],links:[['a','b',60000],['b','c',60000],['c','d',1000],['a','d',50000]],
      initialRoutes:[{from:'a',to:'c',path:['a','b','c']}]});
    const oldInitialSave=previous.exportSave(previous.createState(fx.world,fx.scenario));
    assert.deepEqual(exportSave(fx.state),oldInitialSave);
    const next=apply(fx.world,fx.scenario,fx.state,pointPair('a','d')),save=exportSave(next);
    assert.deepEqual(next.routes.at(-1).path,['a','d']);assert.equal(next.spent,10);
    assert.equal(save.rulesVersion,ROUTE_LIMIT_SAVE_RULES_VERSION);assert.equal(save.engineRulesVersion,SOCIAL_RULES_VERSION);
    assert.equal(save.initialTowerPolicyVersion,fx.scenario.initialTowerPolicyVersion);
    assert.equal(save.initialTowerPolicyFingerprint,fx.scenario.initialTowerPolicyFingerprint);
    assert.throws(()=>previous.restore(fx.world,fx.scenario,save));roundTrip(fx,next);
    assert.deepEqual(exportSave(undo(fx.world,fx.scenario,next)),oldInitialSave);
    for(const wire of [SERIALIZED_ACTIONS_RULES_VERSION,INITIAL_NETWORK_SAVE_RULES_VERSION]){
      const downgraded={...save,rulesVersion:wire};
      assert.throws(()=>restore(fx.world,fx.scenario,downgraded),/Некорректная версия правил транспортного маршрута/);
    }
    for(const mutate of [value=>delete value.engineRulesVersion,value=>value.engineRulesVersion='unknown',
      value=>value.actions[0].routePolicyVersion='unknown',value=>delete value.actions[0].routePolicyVersion,
      value=>value.scenarioVersion=1,value=>value.dataVersion='source-v1-0000000000000000',
      ...(spaced?[value=>delete value.initialTowerPolicyFingerprint,value=>value.initialTowerPolicyFingerprint=`sha256:${'1'.repeat(64)}`]:[])]){
      const invalid=structuredClone(save);mutate(invalid);const before=structuredClone(invalid);
      assert.throws(()=>restore(fx.world,fx.scenario,invalid));assert.deepEqual(invalid,before);
    }
  }
});

test('release evidence identifies the exact engine and focused test bytes',async()=>{
  const hashes={};
  for(const path of ['../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs','./test-settlements-route-limits.mjs'])
    hashes[path]=createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex');
  console.log(JSON.stringify({status:'pass',synthetic:true,routePolicyVersion:ROUTE_POLICY_VERSION,hashes}));
});
