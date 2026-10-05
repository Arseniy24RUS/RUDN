import test from 'node:test';
import assert from 'node:assert/strict';
import {haversine} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {INITIAL_TOWER_POLICY_VERSION,spacedInitialTowerSeeds} from '../site/apps/settlements/runtime/assets/js/settlements/v24/initial-tower-spacing.mjs';
import {initialTowersFor} from '../site/apps/settlements/runtime/assets/js/settlements/v24/telecom-policy.mjs';
const row=(id,km,population=10)=>({id,lat:0,lon:km/6371.0088*180/Math.PI,population});
const world=rows=>({region:{id:'synthetic-spacing'},rows,row:id=>rows.find(r=>r.id===id)});
const verify=(w,ids)=>{for(let a=0;a<ids.length;a++)for(let b=0;b<a;b++)assert(haversine(w.row(ids[a]),w.row(ids[b]))>=18-1e-9);};

test('population-first separation keeps largest centre and removes close duplicate positions',()=>{
  const w=world([row('small',0,10),row('large',1,100),row('far',19,20),row('farther',40,30)]);
  const result=spacedInitialTowerSeeds(w,w.rows.map(r=>r.id));
  assert.deepEqual(result.seedIds,['far','farther','large']);verify(w,result.seedIds);
  assert.equal(result.originalCount,4);assert.equal(result.retainedCount,3);
});

test('permuted source input on a new world produces identical layout and fingerprint',()=>{
  const rows=[row('b',0,100),row('a',0,100),row('c',18,80),row('d',35,50)];
  const first=spacedInitialTowerSeeds(world(rows),rows.map(r=>r.id));
  const second=spacedInitialTowerSeeds(world(rows.slice().reverse()),rows.map(r=>r.id).reverse());
  assert.deepEqual(first,second);assert.deepEqual(first.seedIds,['a','c']);
  assert.match(first.fingerprint,/^sha256:[0-9a-f]{64}$/);
});

test('spherical index separates dateline and polar neighbours using exact engine distance',()=>{
  for(const rows of [
    [{id:'east',lat:65,lon:179.99,population:100},{id:'west',lat:65,lon:-179.99,population:50},{id:'remote',lat:65,lon:178,population:10}],
    [{id:'pole-a',lat:89.99,lon:0,population:100},{id:'pole-b',lat:89.99,lon:180,population:50},{id:'remote',lat:89,lon:90,population:10}],
  ]){const w=world(rows),result=spacedInitialTowerSeeds(w,rows.map(r=>r.id));assert.equal(result.retainedCount,2);verify(w,result.seedIds);}
});

test('initial policy does not mutate source coordinates, input seed arrays or caller-owned results',()=>{
  const rows=Object.freeze([Object.freeze(row('a',0,100)),Object.freeze(row('b',1,20))]),ids=Object.freeze(['b','a']),w=world(rows),before=JSON.stringify(w.rows);
  const result=spacedInitialTowerSeeds(w,ids);assert.equal(JSON.stringify(w.rows),before);assert.deepEqual(ids,['b','a']);
  assert(Object.isFrozen(result));assert(Object.isFrozen(result.seedIds));assert.throws(()=>result.seedIds.push('new'));
});

test('invalid source seed identities and radii fail without a partial network',()=>{
  const w=world([row('a',0),row('empty',100,0)]);
  for(const ids of [['a','a'],['missing'],['empty']])assert.throws(()=>spacedInitialTowerSeeds(w,ids));
  assert.throws(()=>spacedInitialTowerSeeds(w,['a'],5.5));
  const empty=spacedInitialTowerSeeds(w,[]);assert.deepEqual(empty.seedIds,[]);assert.equal(empty.retainedCount,0);
});

test('new policy enforces authored prefix and fingerprint; absence keeps the exact legacy network',()=>{
  const rows=[row('a',0,100),row('b',1,80),row('c',30,40)],w=world(rows);
  const legacy={rulesVersion:'settlements-3.4.0',telecomInitialPopulationThreshold:1,telecomInitialSeedIds:['a','b','c']};
  assert.deepEqual(initialTowersFor(w,legacy).map(t=>t.settlementId),['a','b','c']);
  const layout=spacedInitialTowerSeeds(w,legacy.telecomInitialSeedIds),newScenario={...legacy,initialTowerPolicyVersion:INITIAL_TOWER_POLICY_VERSION,initialTowerPolicyFingerprint:layout.fingerprint};
  assert.deepEqual(initialTowersFor(w,newScenario).map(t=>t.settlementId),['a','c']);
  assert.throws(()=>initialTowersFor(w,{...newScenario,initialTowerPolicyFingerprint:'sha256:'+'0'.repeat(64)}));
  assert.throws(()=>initialTowersFor(w,{...newScenario,telecomInitialSeedIds:['b','c']}));
  assert.throws(()=>initialTowersFor(w,{...newScenario,initialTowerPolicyVersion:'unknown'}));
  assert.deepEqual(initialTowersFor(w,legacy).map(t=>t.settlementId),['a','b','c']);
});
