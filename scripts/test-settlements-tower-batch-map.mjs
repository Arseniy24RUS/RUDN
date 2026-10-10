import test from 'node:test';
import assert from 'node:assert/strict';
import {GameMap, TowerGeometryCache, towerPreviewActions, createCommitSignal} from '../site/apps/settlements/runtime/assets/js/settlements/v24/map.mjs';
import {RouteDisplay} from '../site/apps/settlements/runtime/assets/js/settlements/v24/route-display.mjs';
import {project} from '../site/apps/settlements/runtime/assets/js/settlements/v24/projection.mjs';

const rows = [
  {id:'a',lat:60,lon:70,population:100},
  {id:'b',lat:60,lon:71,population:200},
  {id:'c',lat:60,lon:72,population:300},
];
const world={region:{id:'batch-map-fixture'},rows,valid:rows};
const scenario={version:5,kind:'region',playableSettlementIds:['a','b','c']};
const state={rulesVersion:'settlements-3.4.0',revision:0,actions:[],towers:[],facilities:[],routes:[]};
const positions=rows.map(({lat,lon})=>({lat,lon}));
const action={type:'tower-batch',positions};
const preview={ok:true,baseRevision:0,action,delta:{telecom:{newlyFullIds:['a','b','b','c']}},coverageIds:['a','b','c']};

function mapHarness(){
  const map=Object.create(GameMap.prototype);
  Object.assign(map,{world:null,state:null,sceneRevision:0,effects:[],camera:{moving:false,fit(){}},routeDisplay:new RouteDisplay(),basemapLayer:{index:null,setData(){}},obstacles:()=>[],invalidate(){},fitFocus(){}});
  return map;
}

test('draft cache keeps all numbered towers and releases removed/cleared positions without mutating state',()=>{
  const before=JSON.stringify(state),map=mapHarness();
  map.update({world,scenario,state,preview,activeLayer:'telecom',activeTool:'tower'});
  assert.equal(map.previewTowers.length,3);
  assert.deepEqual(map.previewTowers.map(tower=>tower.number),[1,2,3]);
  assert.deepEqual(map.previewTowers.map(({lat,lon})=>({lat,lon})),positions);
  assert.equal(map.towerGeometry.length,0);
  assert.equal(map.towerCache.evidence().previewCount,3);
  assert.deepEqual([...map.coverageIds],['a','b','c']);
  map.update({world,scenario,state,preview:{...preview,action:{type:'tower',...positions[0]}},activeLayer:'telecom',activeTool:'tower'});
  assert.equal(map.previewTowers.length,1);
  assert.equal(map.previewTowers[0].number,null);
  map.update({world,scenario,state,preview:null,activeLayer:'telecom',activeTool:'tower'});
  assert.equal(map.previewTowers.length,0);
  assert.equal(map.towerCache.evidence().previewCount,0);
  assert.equal(JSON.stringify(state),before);
});

test('cache changes numbering when single preview becomes a batch and releases drafts on region change',()=>{
  const cache=new TowerGeometryCache();
  cache.sync(world,[],false,towerPreviewActions(state,{action:{type:'tower',...positions[0]}}));
  assert.equal(cache.preview.number,null);
  cache.sync(world,[],false,towerPreviewActions(state,preview));
  assert.deepEqual(cache.previews.map(tower=>tower.number),[1,2,3]);
  assert.equal(cache.preparedCount,3,'unchanged first coordinate reuses native geometry');
  cache.sync({},[],false,null);
  assert.equal(cache.previews.length,0);
  assert.equal(cache.preview,null);
});

test('unaffordable batch keeps all ghost locations but marks every outline invalid',()=>{
  const map=mapHarness();map.update({world,scenario,state,preview:{ok:false,action,error:'Not enough budget'},activeLayer:'telecom',activeTool:'tower'});
  assert.equal(map.previewTowers.length,3);
  assert(map.previewTowers.every(tower=>tower.valid===false));
  assert.equal(map.previewIds.size,0);
  assert.equal(map.state,state);
});

test('all preview circles share one translucent fill and retain individual outlines',()=>{
  const map=mapHarness();map.update({world,scenario,state,preview,activeLayer:'telecom',activeTool:'tower'});
  const left=Math.min(...map.previewTowers.map(tower=>tower.bounds.left))-10,top=Math.min(...map.previewTowers.map(tower=>tower.bounds.top))-10;
  map.camera={ox:left,oy:top,scale:1,width:Math.max(...map.previewTowers.map(tower=>tower.bounds.right))-left+10,height:Math.max(...map.previewTowers.map(tower=>tower.bounds.bottom))-top+10,worldToScreen:point=>({x:point.x-left,y:point.y-top})};
  let fills=0,outlines=0;
  const context={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(rule){assert.equal(rule,'nonzero');fills++;}};
  map.paintZone=(_context,_ring,isPreview,valid,_tower,fill)=>{assert.equal(isPreview,true);assert.equal(valid,true);assert.equal(fill,false);outlines++;};
  map.paintPreviewCoverage(context);
  assert.equal(fills,1);assert.equal(outlines,3);
});

test('one batch commit animates every source and routes each unique recipient from its nearest tower',()=>{
  const points=new Map(rows.map(row=>[row.id,project(row)]));
  const signal=createCommitSignal({previousState:state,previousPreview:preview,state:{...state,revision:1,actions:[structuredClone(action)]},points,layer:'telecom',now:10});
  assert.equal(signal.kind,'radio');
  assert.equal(signal.origins.length,3);
  assert.deepEqual(signal.ids,['a','b','c']);
  assert.equal(signal.paths.length,3);
  for(const [index,path] of signal.paths.entries())assert.deepEqual(path.points[0],project(positions[index]));
  const changed={...action,positions:[positions[0],positions[2]]};
  assert.equal(createCommitSignal({previousState:state,previousPreview:preview,state:{...state,revision:1,actions:[changed]},points,layer:'telecom',now:10}),null,'a different paid batch must never use a stale preview');
  assert.equal(createCommitSignal({previousState:state,previousPreview:preview,state:{...state,revision:1,actions:[action]},points,layer:'telecom',now:10,reduced:true}),null);
});
