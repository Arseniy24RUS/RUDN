/** Platform result policy. It does not alter engine prices, actions or replay. */
import {SERVICES,SOCIAL_RULES_VERSION,evaluate,preview,towerSpec} from './engine.mjs';
import {activeNetworkEdges,canonicalNetworkEdge,networkRoute} from './network-routing.mjs';

export const POINTS_BY_DIFFICULTY=Object.freeze({easy:3,normal:4,hard:5});
export function metrics(evaluation){
  if(!evaluation?.services)throw new Error('Coverage evaluation is required');
  const services=Object.fromEntries(SERVICES.map(id=>{
    const value=evaluation.services[id];
    if(!value||![value.covered,value.total,value.servedUnits,value.demandUnits].every(Number.isFinite)||value.total<0||value.covered<0||value.covered>value.total||value.demandUnits<0||value.servedUnits<0||value.servedUnits>value.demandUnits)throw new Error('Invalid coverage evaluation');
    const settlementsRatio=value.total?value.covered/value.total:1,populationRatio=value.demandUnits?value.servedUnits/value.demandUnits:1;
    return [id,{covered:value.covered,total:value.total,servedUnits:value.servedUnits,demandUnits:value.demandUnits,
      settlementsRatio,populationRatio,settlementsPercent:settlementsRatio*100,populationPercent:populationRatio*100}];
  }));
  const settlementsRatio=SERVICES.reduce((sum,id)=>sum+services[id].settlementsRatio,0)/SERVICES.length,
    populationRatio=SERVICES.reduce((sum,id)=>sum+services[id].populationRatio,0)/SERVICES.length;
  // The engine has the same denominator for all services. Use integer counts
  // for the award boundary, so a displayed rounded 90% cannot earn points.
  const totals=SERVICES.map(id=>services[id].total),covered=SERVICES.reduce((sum,id)=>sum+services[id].covered,0);
  const eligibleForPoints=totals.every(n=>n===totals[0])?covered*10>=totals[0]*SERVICES.length*9:settlementsRatio>=.9;
  return {services,settlementsRatio,populationRatio,settlementsPercent:settlementsRatio*100,populationPercent:populationRatio*100,eligibleForPoints};
}
export function coverageMetrics(world,scenario,state,evaluation=evaluate(world,scenario,state)){return metrics(evaluation);}
/** Call only when a platform attempt is being finalized. */
export function pointsForResult(difficulty,evaluation){
  if(!Object.hasOwn(POINTS_BY_DIFFICULTY,difficulty))throw new Error('Unknown difficulty');
  return metrics(evaluation).eligibleForPoints?POINTS_BY_DIFFICULTY[difficulty]:0;
}
function checkParty(scenario,state){
  if(state?.rulesVersion!==SOCIAL_RULES_VERSION||scenario?.kind==='intro')throw new Error('Platform completion requires a current regional party');
  if(!Number.isFinite(state.budget)||state.budget<0||Math.abs(state.budget*10-Math.round(state.budget*10))>1e-7)throw new Error('Invalid party budget');
}
function* freshDirectedEdges(world,scenario,state,wantedTenths){
  const active=activeNetworkEdges(state.routes),policy=scenario.transportPolicy;
  for(let from=0;from<world.rows.length;from++)for(const [to] of world.drive[from]){
    const a=world.rows[from].id,b=world.rows[to].id,key=canonicalNetworkEdge(a,b);
    if(active.has(key))continue;
    const metres=policy.distanceMeters[key],required=policy.roadRequired[key];
    if(!Number.isSafeInteger(metres)||metres<0||typeof required!=='boolean')throw new Error('Invalid transport policy');
    const tenths=Math.floor((metres+250)/500)+(required?Math.floor((6*metres+250)/500):0);
    if(tenths===wantedTenths)yield {type:'connect',from:a,to:b};
  }
}
function findConnection(world,scenario,state,tenths){
  for(const action of freshDirectedEdges(world,scenario,state,tenths)){
    const route=networkRoute(world,scenario.transportPolicy,state.routes,action);
    if(!route?.freshEdgeKeys.length||Math.round(route.cost*10)!==tenths)continue;
    const result=preview(world,scenario,state,action);
    if(result.ok&&Math.round(result.cost*10)===tenths)return action;
  }
  return null;
}
export function hasAffordablePaidAction(world,scenario,state){
  checkParty(scenario,state);
  const tenths=Math.round(state.budget*10),towerTenths=Math.round(towerSpec(state).cost*10);
  if(tenths>=towerTenths){
    // Current rules allow another tower at every positive canonical source
    // coordinate, even if it adds no access. This is a money check, not a solver.
    const source=world.rows.find(row=>Number.isFinite(row.population)&&row.population>0&&Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&Math.abs(row.lat)<=90&&Math.abs(row.lon)<=180);
    if(!source)throw new Error('The regional party has no valid populated source point');
    return true;
  }
  return tenths===1&&Boolean(findConnection(world,scenario,state,1));
}
export function findLegalFreeConnection(world,scenario,state){checkParty(scenario,state);return findConnection(world,scenario,state,0);}
export function classifyCompletion(world,scenario,state,evaluation=evaluate(world,scenario,state)){
  checkParty(scenario,state);
  const coverage=metrics(evaluation);
  if(SERVICES.every(id=>coverage.services[id].covered===coverage.services[id].total))return {status:'complete',canFinish:true,reason:'complete',hasFreeConnection:false,metrics:coverage};
  if(hasAffordablePaidAction(world,scenario,state))return {status:'playing',canFinish:false,reason:null,hasFreeConnection:false,metrics:coverage};
  const hasFreeConnection=Boolean(findLegalFreeConnection(world,scenario,state));
  // Exhaustion offers a finish button. Free connections remain optional; only
  // the host finalizes the attempt after the player chooses to finish.
  return {status:hasFreeConnection?'free_connections_only':'budget_exhausted',canFinish:true,reason:'budget_exhausted',hasFreeConnection,metrics:coverage};
}
