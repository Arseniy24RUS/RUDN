/** Initial infrastructure only. Source positions and player towers are untouched. */
import {haversine} from '../v2/engine.mjs';
import {transportContentHash} from './transport-policy-v1.mjs';

export const INITIAL_TOWER_POLICY_VERSION = 'spaced-18km-v1';
export const INITIAL_TOWER_MIN_DISTANCE_KM = 18;
const cache = new WeakMap();
const compare = (a,b) => a<b?-1:a>b?1:0;
const valid = row => row && Number.isFinite(row.population) && row.population>0 &&
  Number.isFinite(row.lat) && Number.isFinite(row.lon) && Math.abs(row.lat)<=90 && Math.abs(row.lon)<=180;
const cellWidth = 2*Math.sin(INITIAL_TOWER_MIN_DISTANCE_KM/(2*6371.0088))*(1+1e-12);
const cell = row => {
  const lat=row.lat*Math.PI/180,lon=row.lon*Math.PI/180,cos=Math.cos(lat);
  return [cos*Math.cos(lon),cos*Math.sin(lon),Math.sin(lat)].map(value=>Math.floor(value/cellWidth));
};

/** Population-first maximal separated subset, deterministic at poles/dateline too. */
export function spacedInitialTowerSeeds(world, originalSeedIds, radiusKm=10) {
  if (!Array.isArray(world?.rows) || !Array.isArray(originalSeedIds) || radiusKm!==10)
    throw new Error('Некорректные условия исходной сети связи');
  const key=JSON.stringify(originalSeedIds.slice().sort(compare));
  let byKey=cache.get(world);
  if (byKey?.has(key)) return byKey.get(key);
  const byId=new Map(world.rows.map(row=>[row.id,row]));
  if (byId.size!==world.rows.length || new Set(originalSeedIds).size!==originalSeedIds.length)
    throw new Error('Некорректные условия исходной сети связи');
  const candidates=originalSeedIds.map(id=>byId.get(id));
  if (candidates.some(row=>!valid(row))) throw new Error('Некорректные условия исходной сети связи');
  candidates.sort((a,b)=>b.population-a.population||compare(a.id,b.id));
  const cells=new Map(),kept=[];
  for (const row of candidates) {
    const [x,y,z]=cell(row);
    let near=false;
    for (let dx=-1;dx<=1&&!near;dx++) for (let dy=-1;dy<=1&&!near;dy++) for (let dz=-1;dz<=1&&!near;dz++) {
      near=(cells.get(`${x+dx},${y+dy},${z+dz}`)||[])
        .some(other=>haversine(row,other)<INITIAL_TOWER_MIN_DISTANCE_KM-1e-9);
    }
    if (near) continue;
    kept.push(row.id);
    const name=`${x},${y},${z}`;
    if (!cells.has(name)) cells.set(name,[]);
    cells.get(name).push(row);
  }
  const seedIds=Object.freeze(kept.sort(compare));
  const fingerprint=`sha256:${transportContentHash(JSON.stringify({
    version:INITIAL_TOWER_POLICY_VERSION,minimumDistanceKm:INITIAL_TOWER_MIN_DISTANCE_KM,
    radiusKm,regionId:world.region?.id||'',originalSeedIds:JSON.parse(key),seedIds,
  }))}`;
  const result=Object.freeze({seedIds,fingerprint,originalCount:originalSeedIds.length,retainedCount:seedIds.length});
  if (!byKey) {byKey=new Map();cache.set(world,byKey);}
  byKey.set(key,result);
  return result;
}
