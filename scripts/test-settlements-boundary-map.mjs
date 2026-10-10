/** Settlement filtering must not delete historical route geometry or player towers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {GameMap, createCommitSignal} from '../site/apps/settlements/runtime/assets/js/settlements/v24/map.mjs';
import {RouteDisplay} from '../site/apps/settlements/runtime/assets/js/settlements/v24/route-display.mjs';

const rows = Object.freeze([
  Object.freeze({id:'a',name:'A',lat:60,lon:70,population:100}),
  Object.freeze({id:'outside',name:'Excluded',lat:58,lon:71,population:100}),
  Object.freeze({id:'b',name:'B',lat:60,lon:72,population:100}),
]);
const world = Object.freeze({region:{id:'fixture'},rows,valid:rows});
const scenario = Object.freeze({version:5,kind:'region',targetIds:['a','b'],playableSettlementIds:Object.freeze(['a','b'])});
const tower = id => ({id:`initial-tower:${id}`,settlementId:id,lat:rows.find(row=>row.id===id).lat,lon:rows.find(row=>row.id===id).lon,radiusKm:10});
const state = {rulesVersion:'settlements-3.4.0',revision:0,actions:[],facilities:[],routes:[{id:'legacy-route',from:'a',to:'b',path:['a','outside','b']}],towers:[tower('a'),tower('outside'),{id:'player-outside',lat:58,lon:71,radiusKm:10}]};

function mapHarness(){
  const map=Object.create(GameMap.prototype);
  Object.assign(map,{world:null,state:null,sceneRevision:0,effects:[],camera:{moving:false,fit(){}},routeDisplay:new RouteDisplay(),basemapLayer:{index:null,setData(){}},obstacles:()=>[],invalidate(){},fitFocus(ids){this.fittedIds=ids;}});
  return map;
}

test('regional scope filters taps and framing, while keeping original anchors for transport geometry',()=>{
  const map=mapHarness();
  map.update({world,scenario,state,activeLayer:'telecom'});
  assert.deepEqual([...map.points.keys()],['a','b']);
  assert.deepEqual([...map.sourcePoints.keys()],['a','outside','b']);
  assert.deepEqual(map.index.records.map(point=>point.row.id),['a','b']);
  assert.equal(map.resolve('outside'),undefined);
  assert.deepEqual(map.fittedIds,['a','b']);
  assert.equal(map.world,world);
  assert.equal(map.state,state);
  assert.equal(map.sourcePoints.get('outside').row,rows[1]);
});

test('historical route preserves the excluded intermediate bend, edge IDs and full distance',()=>{
  const map=mapHarness();
  map.update({world,scenario,state,activeLayer:'telecom'});
  const geometry=map.routes[0].geometry;
  assert.deepEqual(geometry.points.map(point=>[point.x,point.y]),['a','outside','b'].map(id=>{const point=map.sourcePoints.get(id);return [point.x,point.y];}));
  assert.deepEqual(map.networkEdges.map(edge=>edge.key),['a|outside','b|outside']);
  assert.deepEqual(map.networkEdges.flatMap(edge=>edge.geometry.edges.map(item=>[item.from,item.to])),[['a','outside'],['b','outside']]);
  assert(map.routeSummary(['a','outside','b']).distanceKm>map.routeSummary(['a','b']).distanceKm*2);
  assert.deepEqual(state.routes[0].path,['a','outside','b']);
});

test('excluded passive icons disappear, but legacy coverage geometry and player towers remain',()=>{
  const map=mapHarness();
  map.update({world,scenario,state,activeLayer:'telecom'});
  assert.deepEqual(map.towerGeometry.map(item=>item.id),state.towers.map(item=>item.id));
  assert.deepEqual(map.towerSymbolGeometry.map(item=>item.id),['initial-tower:a','player-outside']);
  assert.deepEqual([...map.localTowers.keys()],['a']);
  assert.equal(map.towerCache.entries.size,3);
  assert.equal(state.towers.length,3);
});

test('scenarios without a scope keep the original UI; changing scope on the same world refreshes indices',()=>{
  const map=mapHarness(),legacyScenario={version:5,kind:'region'};
  map.update({world,scenario:legacyScenario,state,activeLayer:'telecom'});
  assert.equal(map.points.size,3);
  assert.equal(map.towerSymbolGeometry,map.towerGeometry);
  map.update({world,scenario,state,activeLayer:'telecom'});
  assert.equal(map.points.size,2);
  assert.equal(map.sourcePoints.size,3);
  assert.deepEqual(map.fittedIds,['a','b']);
  assert.equal(map.towerSymbolGeometry.length,2);
});

test('route animation uses all route anchors while recipients remain playable',()=>{
  const map=mapHarness();map.setWorld(world,scenario);
  const action={type:'connect',from:'a',to:'b'},previousState={revision:0,actions:[]};
  const signal=createCommitSignal({previousState,previousPreview:{ok:true,baseRevision:0,action,path:['a','outside','b'],delta:{telecom:{newlyFullIds:['outside','b']}}},state:{revision:1,actions:[action]},points:map.points,routePoints:map.sourcePoints,layer:'telecom',now:0});
  assert.deepEqual(signal.ids,['b']);
  assert.equal(signal.paths[0].points[1],map.sourcePoints.get('outside'));
  assert.equal(signal.paths[0].points.length,3);
});

test('destroy releases playable and historical anchor maps',()=>{
  const map=mapHarness();map.update({world,scenario,state,activeLayer:'telecom'});
  Object.assign(map,{observer:{disconnect(){}},element:{removeAttribute(){}},canvas:{remove(){}},fxCanvas:{remove(){}},originalTabindex:null});
  map.camera.destroy=()=>{};map.basemapLayer.destroy=()=>{};
  const previousCancel=globalThis.cancelAnimationFrame,previousDocument=globalThis.document;
  globalThis.cancelAnimationFrame=()=>{};globalThis.document={removeEventListener(){}};
  try{map.destroy();}finally{globalThis.cancelAnimationFrame=previousCancel;globalThis.document=previousDocument;}
  assert.equal(map.points.size,0);assert.equal(map.sourcePoints.size,0);assert.equal(map.towerGeometry.length,0);assert.equal(map.towerSymbolGeometry.length,0);assert.equal(map.world,null);
});
