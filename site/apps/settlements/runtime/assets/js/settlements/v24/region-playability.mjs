/** Runtime goals and visible points; canonical rows, graph and replay stay intact. */
import {pointInBoundary} from './engine.mjs';

const indices=new WeakMap(), rowsByScenario=new WeakMap();
const valid=row=>Number.isFinite(row?.lat)&&Number.isFinite(row?.lon)&&Math.abs(row.lat)<=90&&Math.abs(row.lon)<=180;
const positive=row=>Number.isFinite(row.population)&&row.population>0;

export function withPlayableRegionScope(world,scenario){
  if(scenario.kind==='intro')return scenario;
  const rows=world.rows.filter(row=>valid(row)&&pointInBoundary(scenario.boundary,row.lat,row.lon));
  const result={...scenario,playableSettlementIds:Object.freeze(rows.map(row=>row.id)),
    targetIds:rows.filter(positive).map(row=>row.id).sort(),
    metadata:{...scenario.metadata,completionScope:'valid-points-in-party-polygon',
      excludedSettlementCount:world.rows.length-rows.length}};
  indices.set(result,new Set(result.playableSettlementIds));rowsByScenario.set(result,rows);
  return result;
}

export function isPlayableSettlement(scenario,id){
  if(!Array.isArray(scenario?.playableSettlementIds))return true;
  let ids=indices.get(scenario);if(!ids){ids=new Set(scenario.playableSettlementIds);indices.set(scenario,ids);}
  return ids.has(id);
}

export function playableRows(world,scenario){
  if(!Array.isArray(scenario?.playableSettlementIds))return world.valid||world.rows;
  let rows=rowsByScenario.get(scenario);
  if(!rows){rows=world.rows.filter(row=>isPlayableSettlement(scenario,row.id));rowsByScenario.set(scenario,rows);}
  return rows;
}
