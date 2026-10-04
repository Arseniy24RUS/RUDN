/** Read-only source-plan diagnostic; not a human playtest or full engine solver. */
import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {World} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {loadDistanceTransportPolicy} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {loadSocialPlan} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {appendFederalCities,FEDERAL_CITIES,combineFederalBoundary} from '../site/apps/settlements/runtime/assets/js/settlements/v24/federal-cities.mjs';
import {networkRoute,activeNetworkEdges,canonicalNetworkEdge as keyOf} from '../site/apps/settlements/runtime/assets/js/settlements/v24/network-routing.mjs';
import {CATALOG,createState,apply,evaluate,exportSave,restore,undo} from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
import {createRegionalScenario} from '../site/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url),runtime=new URL('site/apps/settlements/runtime/',root),data=new URL('data/settlements/v1/',runtime);
const output=new URL('artifacts/settlements-road-routes/',root),runId=randomUUID();
const argument=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const alternatives=process.argv.includes('--alternatives'),verify=process.argv.includes('--verify'),region=argument('--region'),difficultyFilter=argument('--difficulty');
const stem=verify?`verified-road-alternatives-${region||'all'}-${difficultyFilter||'all'}`:alternatives?'regional-road-alternatives':'regional-audit';
const read=async url=>JSON.parse(await readFile(url,'utf8')),round=n=>Math.round(n*10)/10;
const manifest=await read(new URL('manifest.json',data));
await mkdir(output,{recursive:true});await writeFile(new URL(`${stem}.jsonl`,output),'');
function sourceAccess(world,policy) {
  const incoming=world.rows.map(()=>[]);
  for (let from=0;from<world.rows.length;from++) for (const [to] of world.drive[from]) incoming[to].push(from);
  function approaches(id) {
    const target=world.ids.get(id),seen=new Set([target]),queue=[target],roads=[];
    for (let i=0;i<queue.length;i++) for (const from of incoming[queue[i]]) {
      const a=world.rows[from],b=world.rows[queue[i]],key=keyOf(a.id,b.id),metres=policy.distanceMeters[key];
      if (metres>0) roads.push({from:a.id,to:b.id,key});
      if (metres===0&&a.lat===b.lat&&a.lon===b.lon&&!seen.has(from)) {seen.add(from);queue.push(from);}
    }
    return roads;
  }
  const cache=new Map();
  const get=id=>{if(!cache.has(id))cache.set(id,approaches(id));return cache.get(id);};
  return {approaches:get,hasRoad:(id,active)=>get(id).some(({key})=>policy.roadRequired[key]===false||active.has(key))};
}
function legalAlternative(world,policy,plan,access) {
  const routes=structuredClone(plan.initialRoutes),actions=[],facilities=structuredClone(plan.initialFacilities),ids=new Map(facilities.map(f=>[f.id,f.id]));
  let active=activeNetworkEdges(routes),cost=0,addedRoads=0,replacedClinics=0,skippedRoutes=0,conflicts=0;
  const append=(action,price)=>{actions.push(action);cost=round(cost+price);};
  const addRoute=(action,route)=>{append(action,route.cost);routes.push(route);active=activeNetworkEdges(routes);};
  for (const [i,raw] of plan.referenceActions.entries()) {
    const action=structuredClone(raw);
    if (action.type==='connect'||action.type==='connect-network') {
      const route=networkRoute(world,policy,routes,action);
      if (!route) throw new Error('Alternative lost a source route');
      if (!route.freshEdgeKeys.length) {skippedRoutes++;continue;}
      addRoute(action,route);continue;
    }
    if (action.type==='build') {
      if (action.service==='outreach'&&!access.hasRoad(action.settlementId,active)) {
        // A real incoming source section proves a route exists. Compare its
        // complete shortest directed route price with the +23 local clinic.
        let best=null;
        for (const road of access.approaches(action.settlementId)) {
          const directPrice=(Math.floor((policy.distanceMeters[road.key]+250)/500)+(policy.roadRequired[road.key]?Math.floor((6*policy.distanceMeters[road.key]+250)/500):0))/10;
          if(directPrice>=23)continue;
          const route=networkRoute(world,policy,routes,{type:'connect',from:road.from,to:action.settlementId},{exactTarget:true});
          if (route&&route.freshEdgeKeys.length&&route.cost<23&&(!best||route.cost<best.cost)) best=route;
        }
        if (best) {addRoute({type:'connect',stopIds:[best.from,action.settlementId]},best);addedRoads++;}
        else {action.service='medical';replacedClinics++;}
      }
      const duplicate=facilities.find(f=>f.type===action.service&&f.settlementId===action.settlementId);
      if(duplicate){conflicts++;ids.set(`facility:${i+1}`,duplicate.id);continue;}
      append(action,CATALOG[action.service].cost);
      let id=`facility:${actions.length}`;while(facilities.some(f=>f.id===id))id+=':new';
      facilities.push({id,type:action.service,settlementId:action.settlementId});ids.set(`facility:${i+1}`,id);
    } else if (action.type==='tower') append(action,.2);
    else if (action.type==='upgrade') {
      action.facilityId=ids.get(action.facilityId)||action.facilityId;
      const facility=facilities.find(f=>f.id===action.facilityId);if(!facility)throw new Error('Alternative lost an upgrade target');
      append(action,CATALOG[facility.type].upgradeCost);
    } else throw new Error('Unknown reference action');
  }
  return {cost,withinBudget:cost<=plan.initialBudget,addedRoads,replacedClinics,skippedRoutes,conflicts,actionCount:actions.length,actions};
}
const records=[];
for (const metadata of manifest.regions.filter(row=>!region||row.id===region)) {
  const world=appendFederalCities(new World(await read(new URL(metadata.path,data)),JSON.parse(gunzipSync(await readFile(new URL(`transport/${metadata.id}.json.gz`,data))))));
  const policy=await loadDistanceTransportPolicy(world),access=sourceAccess(world,policy);
  for (const difficulty of ['easy','normal','hard'].filter(value=>!difficultyFilter||value===difficultyFilter)) {
    const plan=await loadSocialPlan(world,{difficulty}),routes=structuredClone(plan.initialRoutes),invalid=[];
    let active=activeNetworkEdges(routes),doctorCount=0;
    for (const [i,action] of plan.referenceActions.entries()) {
      if (action.type==='connect'||action.type==='connect-network') {
        const route=networkRoute(world,policy,routes,action);if(!route)throw new Error(`Missing original reference route: ${metadata.id}/${difficulty}/${i}`);
        routes.push(route);active=activeNetworkEdges(routes);
      }
      if (action.type==='build'&&action.service==='outreach') {
        doctorCount++;if(!access.hasRoad(action.settlementId,active))invalid.push({turn:i+1,settlementId:action.settlementId});
      }
    }
    const resolvedByLaterRoad=invalid.filter(item=>access.hasRoad(item.settlementId,active)).length;
    const withoutPositiveIncoming=invalid.filter(item=>!access.approaches(item.settlementId).length).length;
    const reserve=round(plan.initialBudget-plan.metadata.expectedReferenceCost),clinicExtra=invalid.length*23;
    // A conservative alternative only replaces each blocked local doctor by a
    // local clinic (+23). It retains all authored roads and other purchases.
    // Both provide at least that doctor's 500 local seats; a clinic adds reach.
    // This is an affordability proof, not a re-authored plan or full simulation.
    const alternative=alternatives?legalAlternative(world,policy,plan,access):null;
    if(verify&&alternative){
      const base=await read(new URL(`boundaries/${metadata.id}.geojson`,data));
      const city=FEDERAL_CITIES[metadata.id]?await read(new URL(`assets/geodata/federal-cities/${FEDERAL_CITIES[metadata.id].boundaryFile}`,runtime)):null;
      const scenario=createRegionalScenario(world,combineFederalBoundary(base,city),{mode:'free',version:5,difficulty});
      let state=createState(world,scenario),previous=null;
      for(const action of alternative.actions){previous=state;state=apply(world,scenario,state,action);}
      assert.equal(state.spent,alternative.cost);assert.equal(evaluate(world,scenario,state).complete,true);
      assert.deepEqual(restore(world,scenario,exportSave(state)),state);
      if(previous)assert.deepEqual(undo(world,scenario,state),previous);
      alternative.engineVerified={status:'pass',complete:true,actions:state.actions.length,budget:state.budget,spent:state.spent,replay:'pass',undo:'pass'};
      console.log(JSON.stringify({event:'engine-verified',region:metadata.id,difficulty,...alternative.engineVerified}));
    }
    if(alternative){await mkdir(new URL('alternatives/',output),{recursive:true});await writeFile(new URL(`alternatives/${metadata.id}-${difficulty}.json`,output),JSON.stringify({region:metadata.id,difficulty,initialBudget:plan.initialBudget,...alternative})+'\n');}
    const record={region:metadata.id,difficulty,referenceActions:plan.referenceActions.length,doctorCount,invalidDoctorActions:invalid.length,
      resolvedByLaterRoad,withoutPositiveIncoming,initialBudget:plan.initialBudget,referenceCost:plan.metadata.expectedReferenceCost,reserve,
      clinicExtra,clinicAlternativeCost:round(plan.metadata.expectedReferenceCost+clinicExtra),clinicAlternativeAffordable:clinicExtra<=reserve,
      caps:plan.metadata.productiveActionCaps,...(alternative?{alternative:Object.fromEntries(Object.entries(alternative).filter(([key])=>key!=='actions'))}:{}),invalid};
    records.push(record);await appendFile(new URL(`${stem}.jsonl`,output),JSON.stringify({...record,runId})+'\n');
  }
  console.log(JSON.stringify({region:metadata.id,profiles:records.length,invalidDoctors:records.slice(-3).map(r=>r.invalidDoctorActions)}));
}
const hashes={};for(const name of ['engine.mjs','network-routing.mjs'])hashes[name]=createHash('sha256').update(await readFile(new URL(`assets/js/settlements/v24/${name}`,runtime))).digest('hex');
const report={status:'pass',runId,synthetic:true,kind:'source-graph road legality and conservative alternative affordability; not full engine simulation',hashes,
  profiles:records.length,regions:new Set(records.map(r=>r.region)).size,doctorActions:records.reduce((sum,r)=>sum+r.doctorCount,0),invalidDoctorActions:records.reduce((sum,r)=>sum+r.invalidDoctorActions,0),
  resolvedByLaterRoad:records.reduce((sum,r)=>sum+r.resolvedByLaterRoad,0),withoutPositiveIncoming:records.reduce((sum,r)=>sum+r.withoutPositiveIncoming,0),
  affectedProfiles:records.filter(r=>r.invalidDoctorActions).length,clinicAlternativeUnaffordable:records.filter(r=>!r.clinicAlternativeAffordable).map(({invalid,...r})=>r),
  ...(alternatives?{alternativeUnaffordable:records.filter(r=>!r.alternative.withinBudget||r.alternative.conflicts).map(({invalid,...r})=>r)}:{}),
  largestInvalid:records.toSorted((a,b)=>b.invalidDoctorActions-a.invalidDoctorActions).slice(0,10).map(({invalid,...r})=>r)};
await writeFile(new URL(`${stem}.json`,output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,clinicAlternativeUnaffordable:report.clinicAlternativeUnaffordable.length}));
