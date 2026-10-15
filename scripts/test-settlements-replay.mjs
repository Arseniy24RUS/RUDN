/** Actual reference replay, copied assertions from the production-kit frozen runner.
 * No generator, balance edits, browser emulation or student data. Node >=20.
 */
import fs from 'node:fs/promises';
import {createReadStream,writeFileSync} from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {World,haversine} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {SERVICES,CATALOG,MAX_TOWER_BATCH,MAX_ROUTE_STOPS,ROUTE_POLICY_VERSION,OUTREACH_POLICY_VERSION,towerSpec,createState,preview,apply,evaluate,exportSave,restore,undo} from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
import {loadDistanceTransportPolicy,distanceTransportPolicyFor} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {loadSocialPlan} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {SOCIAL_PLAN_INDEX} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans-regions/index.mjs';
import {appendFederalCities,FEDERAL_CITIES,combineFederalBoundary} from '../site/apps/settlements/runtime/assets/js/settlements/v24/federal-cities.mjs';
import {createRegionalScenario} from '../site/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';
import {metrics} from '../site/apps/settlements/runtime/assets/js/settlements/v24/platform-rules.mjs';
import {INITIAL_TOWER_POLICY_VERSION} from '../site/apps/settlements/runtime/assets/js/settlements/v24/initial-tower-spacing.mjs';
import {networkRoute,activeNetworkEdges,canonicalNetworkEdge} from '../site/apps/settlements/runtime/assets/js/settlements/v24/network-routing.mjs';
import {socialAccessLimits} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-policy.mjs';

export const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const DIFFICULTIES=Object.freeze(['easy','normal','hard']);
const SITE=path.join(REPO,'site'),RUNTIME=path.join(SITE,'apps/settlements/runtime');
const SOURCE_MANIFEST=path.join(SITE,'apps/settlements/source-manifest.json');
const sha=value=>createHash('sha256').update(value).digest('hex');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const slash=value=>value.split(path.sep).join('/');
const read=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const execute=promisify(execFile);
const git=async(...args)=>(await execute('git',args,{cwd:REPO,encoding:'utf8',windowsHide:true})).stdout.trim();
export function contained(base,relative){
  assert(typeof relative==='string'&&relative&&!relative.includes('\\')&&!path.posix.isAbsolute(relative)&&!relative.split('/').includes('..'),'Unsafe artifact/source path');
  const target=path.resolve(base,relative);assert(target.startsWith(path.resolve(base)+path.sep),'Path escaped its root');return target;
}
export async function hashFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function loadReplayCatalog(){
  const source=await read(SOURCE_MANIFEST);
  assert.equal(source.moduleVersion,'1.0');assert(Array.isArray(source.files));
  assert.equal(new Set(source.files.map(f=>f.path)).size,source.files.length,'Duplicate source-manifest path');
  assert.equal(sha(JSON.stringify(source.files)),source.sourceHash,'Invalid source-manifest digest');
  const allowed=new Map(source.files.map(entry=>{contained(RUNTIME,entry.path);return [entry.path,entry];}));
  function runtimeFile(relative){assert(allowed.has(relative),`Not listed in source-manifest: ${relative}`);return contained(RUNTIME,relative);}
  const manifest=await read(runtimeFile('data/settlements/v1/manifest.json'));
  assert.equal(manifest.regions.length,82);assert.equal(new Set(manifest.regions.map(r=>r.id)).size,82);
  return {source,allowed,manifest,runtimeFile};
}
export async function captureCandidateIdentity(catalog){
  const files=[];
  async function visit(dir){for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>compare(a.name,b.name))){
    const file=path.join(dir,entry.name);assert(!entry.isSymbolicLink(),`Symlink is outside this evidence contract: ${file}`);
    if(entry.isDirectory())await visit(file);else if(entry.isFile()){const info=await fs.stat(file);files.push({path:slash(path.relative(SITE,file)),bytes:info.size,sha256:await hashFile(file)});}
  }}
  await visit(SITE);files.sort((a,b)=>compare(a.path,b.path));const byPath=new Map(files.map(f=>[f.path,f]));
  const actual=catalog.source.files.map(entry=>{const found=byPath.get(`apps/settlements/runtime/${entry.path}`);assert(found,`Runtime file missing: ${entry.path}`);assert.equal(found.bytes,entry.bytes,`Runtime size differs: ${entry.path}`);assert.equal(found.sha256,entry.sha256,`Runtime hash differs: ${entry.path}`);return {path:entry.path,bytes:found.bytes,sha256:found.sha256};});
  for(const entry of catalog.source.protectedFiles){assert.equal(byPath.get(`apps/settlements/runtime/${entry.path}`)?.sha256,entry.sha256,`Protected data differs: ${entry.path}`);}
  const sourceHash=sha(JSON.stringify(actual));assert.equal(sourceHash,catalog.source.sourceHash);
  const scriptHashes={};for(const name of ['test-settlements-replay.mjs','summarize-settlements-replay.mjs'])scriptHashes[`scripts/${name}`]=await hashFile(path.join(REPO,'scripts',name));
  return {git:{commit:await git('rev-parse','HEAD'),siteTree:await git('rev-parse','HEAD:site'),trackedDirty:Boolean(await git('status','--porcelain','--untracked-files=no'))},
    siteHash:sha(JSON.stringify(files)),siteHashAlgorithm:'sha256(JSON.stringify(sorted [{path relative to site,bytes,sha256}]))',siteFiles:files.length,siteBytes:files.reduce((n,f)=>n+f.bytes,0),
    sourceHash,sourceManifestHash:byPath.get('apps/settlements/source-manifest.json').sha256,engineHash:byPath.get('apps/settlements/runtime/assets/js/settlements/v24/engine.mjs').sha256,
    scriptHashes,runtimeFiles:actual.length,protectedFiles:catalog.source.protectedFiles.length};
}
const write=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');};
const emit=value=>console.log(JSON.stringify({...value,at:new Date().toISOString()}));
const core=['v2/engine.mjs',...['engine','scenarios','social-policy','social-plans','social-plan-fetch','social-network','network-routing','telecom-policy','telecom-plans','transport-policy-v1','transport-policy-v1.generated','transport-policy-v2','transport-policy-v2.generated','transport-policy-fetch','federal-cities','federal-transport','platform-rules','initial-tower-spacing'].map(name=>`v24/${name}.mjs`)].map(p=>`assets/js/settlements/${p}`);
core.push('assets/js/settlements/v24/social-plans-regions/index.mjs');
async function sourceHashes(catalog,paths){const result={};for(const p of paths)result[p]=await hashFile(catalog.runtimeFile(p));return result;}

// This is a price control for frozen authored intents, never current-play acceptance.
export function auditAuthoredReferenceCost(world,plan,{CATALOG,towerSpec,networkRoute,distanceTransportPolicyFor}){
 const money=value=>Math.round(value*10)/10,policy=distanceTransportPolicyFor(world),routes=structuredClone(plan.initialRoutes),facilities=new Map(plan.initialFacilities.map(f=>[f.id,{...f,level:1}])),entries=[];let total=0;
 for(const [index,action] of plan.referenceActions.entries()){
  let cost;
  if(action.type==='tower')cost=towerSpec('settlements-3.4.0').cost;
  else if(action.type==='tower-batch')cost=money(towerSpec('settlements-3.4.0').cost*action.positions.length);
  else if(action.type==='build'){assert(CATALOG[action.service]);cost=CATALOG[action.service].cost;let id='facility:'+(index+1);while(facilities.has(id))id+=':new';facilities.set(id,{id,type:action.service,settlementId:action.settlementId,level:1});}
  else if(action.type==='upgrade'){const facility=facilities.get(action.facilityId);assert(facility,'Authored upgrade must identify a source or authored facility');assert.equal(facility.level,1);cost=CATALOG[facility.type].upgradeCost;facility.level=2;}
  else if(action.type==='connect'){const route=networkRoute(world,policy,routes,action);assert(route,'Authored connection must follow the supplied source network');assert(route.freshEdgeKeys.length>0,'Authored connection must purchase a source section');cost=route.cost;routes.push({from:action.from,to:route.joinId||action.to,path:[...route.path]});}
  else assert.fail('Unsupported authored price action: '+action.type);
  assert(Number.isFinite(cost)&&cost>=0);cost=money(cost);total=money(total+cost);entries.push({index,type:action.type,cost});
 }
 assert.equal(total,plan.metadata.expectedReferenceCost,'Frozen authored price control differs from its declared reference cost');
 return {scope:'Authored-intent price control only; no current-play acceptance',cost:total,expected:plan.metadata.expectedReferenceCost,entries};
}


/** Execute current legal actions for the frozen authored intents; never a policy fallback. */
export function replayCurrentReference(world,scenario,plan,initialState,{onAction=()=>{}}={}){
  const money=value=>Math.round(value*10)/10;
  assert.equal(initialState.actions.length,0);assert.equal(initialState.spent,0);
  const priceAudit=auditAuthoredReferenceCost(world,plan,{CATALOG,towerSpec,networkRoute,distanceTransportPolicyFor});
  let state=initialState,evaluation=evaluate(world,scenario,state),previous=null;
  const facilityMap=new Map(),descriptors=new Map(),authoredBuildIds=new Map(),incoming=world.rows.map(()=>[]),entries=[];
  for(const descriptor of plan.initialFacilities){
    const actual=initialState.facilities.find(item=>item.id===descriptor.id);
    assert(actual,'Initial facility must exist before mapping');assert.equal(actual.type,descriptor.type);assert.equal(actual.settlementId,descriptor.settlementId);
    descriptors.set(descriptor.id,{service:descriptor.type,settlementId:descriptor.settlementId,source:'initial-facility'});
    facilityMap.set(descriptor.id,{actualId:actual.id,source:'initial-facility'});
  }
  for(const [index,descriptor] of plan.referenceActions.entries())if(descriptor.type==='build'){
    let id='facility:'+(index+1);while(descriptors.has(id))id+=':new';
    descriptors.set(id,{...descriptor,source:'authored-build',authoredIndex:index});authoredBuildIds.set(index,id);
  }
  for(let from=0;from<world.rows.length;from++)for(const [to] of world.drive[from])incoming[to].push(from);
  const gains=(before,after)=>Object.fromEntries(SERVICES.map(service=>[service,after.services[service].servedUnits-before.services[service].servedUnits]));
  const nondecreasing=(before,after)=>{const values=gains(before,after);for(const value of Object.values(values))assert(value>=0,'Current action must not reduce service access');return values;};
  const totalGain=(before,after)=>Object.values(nondecreasing(before,after)).reduce((sum,value)=>sum+value,0);
  const compare=(a,b)=>a<b?-1:a>b?1:0;
  let activeEntry=null;
  function checkedQuote(input,action,result){
    let quotedCost;
    if(action.type==='build')quotedCost=CATALOG[action.service].cost;
    else if(action.type==='upgrade'){
      const facility=input.facilities.find(item=>item.id===action.facilityId);assert(facility);quotedCost=CATALOG[facility.type].upgradeCost;
    }else if(action.type==='tower')quotedCost=towerSpec(input).cost;
    else if(action.type==='tower-batch')quotedCost=money(towerSpec(input).cost*action.positions.length);
    else{
      assert(['connect','connect-network'].includes(action.type));
      const active=activeNetworkEdges(input.routes),fresh=[...new Set(result.path.slice(1).map((id,index)=>canonicalNetworkEdge(result.path[index],id)).filter(key=>!active.has(key)))];
      assert(fresh.length>0);assert.deepEqual([...result.freshEdgeKeys].sort(compare),[...fresh].sort(compare));
      let tenths=0;
      for(const key of fresh){
        const meters=scenario.transportPolicy.distanceMeters[key],required=scenario.transportPolicy.roadRequired[key];
        assert(Number.isSafeInteger(meters)&&meters>=0);assert.equal(typeof required,'boolean');
        tenths+=Math.floor((meters+250)/500)+(required?Math.floor((6*meters+250)/500):0);
      }
      quotedCost=tenths/10;
    }
    assert.equal(result.cost,quotedCost,'Actual preview price must match the independent current source quote');
    assert.equal(result.nextState.spent,money(input.spent+quotedCost));
    assert.equal(result.nextState.budget,money(input.budget-quotedCost));assert(result.nextState.budget>=0);
    return quotedCost;
  }
  function activePathProof(input,action,failed){
    assert.equal(failed.ok,false);assert.equal(failed.error,'Все участки этого пути уже работают');
    assert(world.ids.has(action.from)&&world.ids.has(action.to)&&action.from!==action.to);
    const stops=action.stopIds||[action.from,action.to],active=activeNetworkEdges(input.routes),path=[];
    assert.equal(stops[0],action.from);assert.equal(stops.at(-1),action.to);
    for(let part=1;part<stops.length;part++){
      const from=stops[part-1],to=stops[part];assert(world.ids.has(from)&&world.ids.has(to)&&from!==to);
      const route=networkRoute(world,scenario.transportPolicy,input.routes,{type:'connect',from,to},{exactTarget:true});
      assert(route&&route.path.length>=2,'Already-active intent needs a full directed path');
      assert.equal(route.path[0],from);assert.equal(route.path.at(-1),to);assert.equal(route.freshEdgeKeys.length,0);
      for(let leg=1;leg<route.path.length;leg++){
        assert(world.drive[world.ids.get(route.path[leg-1])].some(([next])=>world.rows[next].id===route.path[leg]));
        assert(active.has(canonicalNetworkEdge(route.path[leg-1],route.path[leg])));
      }
      path.push(...route.path.slice(path.length?1:0));
    }
    return {previewOk:false,previewError:failed.error,requestedFrom:action.from,requestedTo:action.to,requestedStops:stops,path,activeSourceEdges:[...new Set(path.slice(1).map((id,index)=>canonicalNetworkEdge(path[index],id)))]};
  }
  function perform(action,reason,{prerequisite=false}={}){
    const result=preview(world,scenario,state,action);assert.equal(result.ok,true,result.error);
    const quotedCost=checkedQuote(state,action,result);
    const gainUnits=totalGain(evaluation,result.evaluation);
    assert(gainUnits>0||prerequisite&&['connect','connect-network'].includes(action.type),'Only a verified route prerequisite may have zero immediate service gain');
    previous=state;state=apply(world,scenario,state,action);assert.deepEqual(state,result.nextState);
    assert(state.budget>=0);assert.equal(state.initialTowerPolicyVersion,INITIAL_TOWER_POLICY_VERSION);
    const canonical=state.actions.at(-1);
    if(['connect','connect-network'].includes(canonical.type)){
      assert.equal(canonical.routePolicyVersion,ROUTE_POLICY_VERSION);
      assert(new Set(result.path).size<=MAX_ROUTE_STOPS,'Every real route must obey the current stop limit');
      const beforeEdges=activeNetworkEdges(previous.routes),afterEdges=activeNetworkEdges(state.routes);assert(result.freshEdgeKeys?.length>0);
      for(const key of result.freshEdgeKeys){assert(!beforeEdges.has(key)&&afterEdges.has(key));assert(Number.isSafeInteger(scenario.transportPolicy.distanceMeters[key]));}
      for(let leg=1;leg<result.path.length;leg++)assert(world.drive[world.ids.get(result.path[leg-1])].some(([to])=>world.rows[to].id===result.path[leg]),'Route prerequisite must follow a directed source edge');
    }
    if(canonical.type==='build'&&canonical.service==='outreach')assert.equal(canonical.outreachPolicyVersion,OUTREACH_POLICY_VERSION);
    evaluation=result.evaluation;
    activeEntry.executed.push({action:canonical,reason,cost:quotedCost,gainUnits,prerequisite:prerequisite&&gainUnits===0,...(result.freshEdgeKeys?{freshSourceEdges:result.freshEdgeKeys}:{})});
    onAction({state,previous,evaluation,result,phase:reason,authoredIndex:activeEntry.index,gainUnits,prerequisite:prerequisite&&gainUnits===0});
    return result;
  }
  function finish(reason,proof){
    activeEntry.reason=reason;if(proof)activeEntry.proof=proof;
    activeEntry.actualCost=money(activeEntry.executed.reduce((sum,receipt)=>sum+receipt.cost,0));
    assert.equal(money(state.spent-activeEntry.startSpent),activeEntry.actualCost,'Executed source quotes must equal spent delta');
    assert.equal(money(activeEntry.startBudget-state.budget),activeEntry.actualCost,'Executed source quotes must equal budget delta');
    activeEntry.delta=money(activeEntry.actualCost-activeEntry.authoredCost);
    entries.push(activeEntry);
  }
  function stage(actions,prefix=null){
    if(prefix)assert.equal(prefix.ok,true);
    let cursor=prefix?.state??state,check=prefix?.evaluation??evaluation,cost=prefix?.cost??0;
    const accepted=prefix?[...prefix.actions]:[];
    for(const action of actions){
      const result=preview(world,scenario,cursor,action);if(!result.ok)return {ok:false,error:result.error};
      cost=money(cost+checkedQuote(cursor,action,result));
      nondecreasing(check,result.evaluation);accepted.push(action);cursor=result.nextState;check=result.evaluation;
    }
    assert.equal(money(cursor.spent-state.spent),cost);assert.equal(money(state.budget-cursor.budget),cost);
    return {ok:true,actions:accepted,state:cursor,evaluation:check,cost,gainUnits:totalGain(evaluation,check)};
  }
  function performGroup(candidate,reason){
    assert(candidate.ok&&candidate.gainUnits>0,'Only a verified positive-gain group may include prerequisites');
    const before=evaluation;
    for(const action of candidate.actions)perform(action,reason,{prerequisite:true});
    assert.deepEqual(state,candidate.state);assert(totalGain(before,evaluation)>0);
  }
  for(const [index,authored] of plan.referenceActions.entries()){
    activeEntry={index,authoredAction:authored,authoredCost:priceAudit.entries[index].cost,startSpent:state.spent,startBudget:state.budget,executed:[]};
    let action={...authored};
    if(authored.type==='build')assert(!facilityMap.has(authoredBuildIds.get(index)),'An authored build cannot already have a mapping');
    if(action.type==='upgrade'){
      const descriptor=descriptors.get(authored.facilityId);assert(descriptor,'Authored upgrade must identify its own source descriptor');
      const mapped=facilityMap.get(authored.facilityId);let facility;
      if(mapped){
        facility=state.facilities.find(item=>item.id===mapped.actualId);assert(facility,'Mapped actual facility is missing');
        activeEntry.facilityResolution={authoredFacilityId:authored.facilityId,descriptor,mapping:mapped};
      }else{
        assert.equal(descriptor.source,'authored-build','An initial mapping must never disappear');
        const skipped=entries[descriptor.authoredIndex];assert(skipped&&skipped.executed.every(receipt=>receipt.action.type!=='build'),'Absent mapping must refer to an unbuilt authored object');
        const build=plan.referenceActions[descriptor.authoredIndex],rebuilt=preview(world,scenario,state,build);
        assert(rebuilt.ok,'Cannot reconstruct an absorbed authored build: '+rebuilt.error);checkedQuote(state,build,rebuilt);
        nondecreasing(evaluation,rebuilt.evaluation);
        const rebuiltId=rebuilt.nextState.facilities.at(-1).id,upgrade={...action,facilityId:rebuiltId};
        const upgraded=preview(world,scenario,rebuilt.nextState,upgrade);assert(upgraded.ok,upgraded.error);checkedQuote(rebuilt.nextState,upgrade,upgraded);
        const combined=totalGain(evaluation,upgraded.evaluation);
        activeEntry.facilityResolution={authoredFacilityId:authored.facilityId,descriptor,source:'deferred-own-authored-build',absorbedBuildIndex:descriptor.authoredIndex,absorbedBuildReason:skipped.reason,previewBuildCost:rebuilt.cost,previewUpgradeCost:upgraded.cost,combinedGainUnits:combined};
        if(combined===0){finish('actual-preview-rebuilt-object-and-upgrade-zero-gain',{previewOk:true,gainUnits:0});continue;}
        // A social build must be useful itself; only source route edges may be zero-gain prerequisites.
        perform(build,'deferred-authored-build');facility=state.facilities.at(-1);
        const mapping={actualId:facility.id,source:'deferred-own-authored-build',authoredIndex:descriptor.authoredIndex,executedAt:index};
        facilityMap.set(authored.facilityId,mapping);activeEntry.facilityResolution.mapping=mapping;
      }
      assert.equal(facility.settlementId,descriptor.settlementId);
      assert(facility.type===descriptor.service||descriptor.service==='outreach'&&facility.type==='medical');
      action.facilityId=facility.id;
    }
    const original=preview(world,scenario,state,action);
    if(original.ok){
      if(totalGain(evaluation,original.evaluation)===0){finish(activeEntry.executed.length?'deferred-build-satisfies-upgrade-intent':'actual-preview-zero-marginal-gain',{previewOk:true,gainUnits:0});continue;}
      perform(action,'authored-current-action');
      if(authored.type==='build')facilityMap.set(authoredBuildIds.get(index),{actualId:state.facilities.at(-1).id,source:'authored-current-build',authoredIndex:index});
      finish('authored-current-action');continue;
    }
    if(action.type==='connect'){
      const sourceRoute=networkRoute(world,scenario.transportPolicy,state.routes,action);
      assert(sourceRoute,'An authored route must retain a real source-network path');
      if(sourceRoute.freshEdgeKeys.length===0){finish('unavailable-connectivity-intent-already-met',activePathProof(state,action,original));continue;}
      if(new Set(sourceRoute.path).size>MAX_ROUTE_STOPS){
        let cursor=state,check=evaluation,cost=0;const actions=[],absorbedLegs=[];
        for(let part=1;part<sourceRoute.path.length;part++){
          const from=sourceRoute.path[part-1],to=sourceRoute.path[part],key=canonicalNetworkEdge(from,to);
          if(activeNetworkEdges(cursor.routes).has(key))continue;
          const leg={type:'connect',from,to,stopIds:[from,to]},result=preview(world,scenario,cursor,leg);
          if(!result.ok){
            absorbedLegs.push(activePathProof(cursor,leg,result));continue;
          }
          cost=money(cost+checkedQuote(cursor,leg,result));
          nondecreasing(check,result.evaluation);actions.push(leg);cursor=result.nextState;check=result.evaluation;
        }
        assert.equal(money(cursor.spent-state.spent),cost);assert.equal(money(state.budget-cursor.budget),cost);
        const candidate={ok:true,actions,state:cursor,evaluation:check,cost,gainUnits:totalGain(evaluation,check)};
        if(candidate.gainUnits===0){finish('actual-preview-split-route-zero-gain',{sourcePath:sourceRoute.path,absorbedLegs,previewOk:true,gainUnits:0});continue;}
        performGroup(candidate,'current-source-edge-route-split');
        finish('current-source-edge-route-split',{sourcePath:sourceRoute.path,maximumStops:MAX_ROUTE_STOPS,absorbedLegs,groupGainUnits:candidate.gainUnits,quotedCost:candidate.cost});continue;
      }
    }
    assert(action.type==='build'&&action.service==='outreach'&&original.error==='К этому поселению нет дороги. Сначала постройте транспортное соединение.',
      JSON.stringify({index,action,error:original.error}));
    const local=evaluation.byId[action.settlementId].medical;
    if(local.full){
      const limits=socialAccessLimits(world,'outreach');assert.deepEqual(limits,{time:0,walk:0});
      assert(world.walk.every(edges=>edges.every(([,minutes])=>minutes>0))&&world.drive.every(edges=>edges.every(([,minutes])=>minutes>0)));
      assert(local.demand>0);assert.equal(local.full,true);assert.equal(local.served,local.demand);
      finish('unavailable-local-outreach-intent-already-met',{previewOk:false,previewError:original.error,settlementId:action.settlementId,full:local.full,served:local.served,demand:local.demand,accessLimits:limits,positiveSourceTravelTimes:true});continue;
    }
    const candidates=[],medical={type:'build',service:'medical',settlementId:action.settlementId};
    const clinic=stage([medical]);
    if(clinic.ok&&clinic.gainUnits>0&&clinic.evaluation.byId[action.settlementId].medical.full)candidates.push({...clinic,kind:'medical'});
    const target=world.ids.get(action.settlementId),zeroClosure=new Set([target]),queue=[target],seenEdges=new Set();
    for(let cursor=0;cursor<queue.length;cursor++)for(const from of incoming[queue[cursor]]){
      const a=world.rows[from],b=world.rows[queue[cursor]],key=canonicalNetworkEdge(a.id,b.id);
      if(scenario.transportPolicy.distanceMeters[key]===0&&a.lat===b.lat&&a.lon===b.lon&&!zeroClosure.has(from)){zeroClosure.add(from);queue.push(from);}
    }
    for(const to of zeroClosure)for(const from of incoming[to]){
      const a=world.rows[from],b=world.rows[to],key=canonicalNetworkEdge(a.id,b.id);
      if(zeroClosure.has(from)||seenEdges.has(key)||scenario.transportPolicy.distanceMeters[key]<=0)continue;seenEdges.add(key);
      const road={type:'connect',from:a.id,to:b.id,stopIds:[a.id,b.id]},roadOnly=stage([road]);
      if(!roadOnly.ok)continue;
      if(roadOnly.gainUnits>0&&roadOnly.evaluation.byId[action.settlementId].medical.full)candidates.push({...roadOnly,kind:'road-alone'});
      else{
        const pair=stage([action],roadOnly);
        if(pair.ok&&pair.gainUnits>0&&pair.evaluation.byId[action.settlementId].medical.full)candidates.push({...pair,kind:'road-outreach'});
      }
    }
    candidates.sort((a,b)=>a.cost-b.cost||b.gainUnits-a.gainUnits||compare(JSON.stringify(a.actions),JSON.stringify(b.actions)));
    assert(candidates.length,'No affordable current action sequence satisfies the authored outreach intent');
    const chosen=candidates[0];
    performGroup(chosen,'outreach-policy-'+chosen.kind);
    if(chosen.actions.some(item=>item.type==='build')){const created=state.facilities.at(-1);assert.equal(created.settlementId,action.settlementId);facilityMap.set(authoredBuildIds.get(index),{actualId:created.id,source:'outreach-policy-'+chosen.kind,authoredIndex:index});}
    assert(evaluation.byId[action.settlementId].medical.full);
    finish('outreach-policy-'+chosen.kind,{settlementId:action.settlementId,selectedCost:chosen.cost,considered:candidates.map(item=>({kind:item.kind,cost:item.cost,gainUnits:item.gainUnits}))});
  }
  const costDelta=money(entries.reduce((sum,entry)=>sum+entry.delta,0));
  assert.equal(entries.length,plan.referenceActions.length);
  assert.equal(state.spent,money(priceAudit.cost+costDelta));
  return {state,evaluation,previous,priceAudit,adaptation:{scope:'Actual current-policy actions; authored prices are a separate control',perActionContract:'Social and telecom actions have positive immediate service gain; a zero-gain route is accepted only as a verified new source-edge prerequisite inside a positive-gain intent group',entries,costDelta,actualCost:state.spent}};
}

export async function regionRun(id,catalog,output,jobRunId){
  const dir=path.join(output,'regions',id),metadata=catalog.manifest.regions.find(r=>r.id===id);
  const packPath=`data/settlements/v1/${metadata.path}`,networkPath=`data/settlements/v1/transport/${id}.json.gz`,boundaryPath=`data/settlements/v1/boundaries/${id}.geojson`;
  const sourcePaths=[...core,packPath,networkPath,boundaryPath,...DIFFICULTIES.map(d=>`assets/js/settlements/v24/social-plans-regions/${id}-${d}.mjs`),`assets/js/settlements/v24/transport-policy-v2-regions/${id}.mjs`,...(FEDERAL_CITIES[id]?[`assets/geodata/federal-cities/${FEDERAL_CITIES[id].boundaryFile}`]:[])];
  const before=await sourceHashes(catalog,sourcePaths),runId=randomUUID(),start=performance.now();
  await write(path.join(dir,'started.json'),{runId,jobRunId,pid:process.pid,startedAt:new Date().toISOString(),sourceHashes:before,synthetic:true,humanDurationMeasured:false});
  const pack=await read(catalog.runtimeFile(packPath)),network=JSON.parse(zlib.gunzipSync(await fs.readFile(catalog.runtimeFile(networkPath))));
  const world=appendFederalCities(new World(pack,network));await loadDistanceTransportPolicy(world);
  const base=await read(catalog.runtimeFile(boundaryPath)),city=FEDERAL_CITIES[id]?await read(catalog.runtimeFile(`assets/geodata/federal-cities/${FEDERAL_CITIES[id].boundaryFile}`)):null,boundary=combineFederalBoundary(base,city),records=[];
  for(const difficulty of DIFFICULTIES){
    const started=performance.now(),plan=await loadSocialPlan(world,{difficulty});
    assert.equal(plan.fingerprint,SOCIAL_PLAN_INDEX[`${id}/${difficulty}`]);
    const scenario=createRegionalScenario(world,boundary,{mode:'free',version:5,difficulty});
    assert.equal(scenario.initialTowerPolicyVersion,INITIAL_TOWER_POLICY_VERSION,'Replay must use the current initial network');
    assert.equal(INITIAL_TOWER_POLICY_VERSION,'spaced-18km-v1');
    let state=createState(world,scenario,{owner:'synthetic:platform-reference'}),evaluation=evaluate(world,scenario,state),previous=null,first90=metrics(evaluation).eligibleForPoints?0:null;
    const initialMetrics=metrics(evaluation),trace=[];
    emit({event:'profile-start',region:id,difficulty,actions:plan.referenceActions.length,initialSettlementsPercent:initialMetrics.settlementsPercent});
    const executeAction=(action,phase)=>{
      const result=preview(world,scenario,state,action);assert.equal(result.ok,true,result.error);
      previous=state;state=apply(world,scenario,state,action);assert.deepEqual(state,result.nextState);
      const beforeEvaluation=evaluation;evaluation=result.evaluation;
      let gain=0;for(const service of SERVICES){assert(evaluation.services[service].servedUnits>=beforeEvaluation.services[service].servedUnits);gain+=evaluation.services[service].servedUnits-beforeEvaluation.services[service].servedUnits;}
      assert(gain>0,'Reference action must increase access');assert(state.budget>=0);
      const coverage=metrics(evaluation);if(first90===null&&coverage.eligibleForPoints)first90=state.actions.length;
      trace.push({turn:state.actions.length,phase,action,cost:result.cost,budget:state.budget,gainUnits:gain,settlementsRatio:coverage.settlementsRatio,populationRatio:coverage.populationRatio});
      if(state.actions.length%100===0)emit({event:'progress',region:id,difficulty,actions:state.actions.length,total:plan.referenceActions.length,rssBytes:process.memoryUsage().rss});
      return {cost:result.cost,gainUnits:gain};
    };
    const currentReference=replayCurrentReference(world,scenario,plan,state,{onAction:step=>{
      state=step.state;previous=step.previous;evaluation=step.evaluation;
      const coverage=metrics(evaluation);if(first90===null&&coverage.eligibleForPoints)first90=state.actions.length;
      trace.push({turn:state.actions.length,phase:step.phase,authoredIndex:step.authoredIndex,action:state.actions.at(-1),cost:step.result.cost,budget:state.budget,gainUnits:step.gainUnits,prerequisite:step.prerequisite,settlementsRatio:coverage.settlementsRatio,populationRatio:coverage.populationRatio});
      if(state.actions.length%100===0)emit({event:'progress',region:id,difficulty,actions:state.actions.length,authoredActions:plan.referenceActions.length,rssBytes:process.memoryUsage().rss});
    }});
    state=currentReference.state;evaluation=currentReference.evaluation;previous=currentReference.previous;
    assert.equal(currentReference.priceAudit.cost,plan.metadata.expectedReferenceCost);
    // The authored plans predate spaced-18km-v1. The actual current scenario keeps
    // fewer initial towers; fill only its remaining telecom gaps with ordinary
    // player actions at source seed coordinates. Never change the scenario,
    // imported plan, source geometry, prices or final completion assertions.
    const retained=new Set(scenario.initialTowers.map(tower=>tower.settlementId)),missing=new Set(evaluation.services.telecom.missingIds);
    const supplement={policyVersion:scenario.initialTowerPolicyVersion,originalSeedCount:plan.telecom.initialSeedIds.length,retainedSeedCount:retained.size,
      missingBefore:missing.size,missingAfter:null,seedIds:[],batches:[],cost:0,gainUnits:0};
    const positions=[];
    for(const seedId of plan.telecom.initialSeedIds){
      if(retained.has(seedId))continue;
      const row=world.row(seedId);assert(row,'A supplementary tower must use a source seed');
      const hits=[...missing].filter(id=>haversine(row,world.row(id))<=towerSpec(state).radiusKm+1e-9);
      if(!hits.length)continue;
      for(const id of hits)missing.delete(id);
      positions.push({lat:row.lat,lon:row.lon});supplement.seedIds.push(seedId);
    }
    assert.equal(missing.size,0,'Current telecom gaps must be reachable from the omitted source seeds');
    for(let offset=0;offset<positions.length;offset+=MAX_TOWER_BATCH){
      const points=positions.slice(offset,offset+MAX_TOWER_BATCH);
      const action=points.length===1?{type:'tower',...points[0]}:{type:'tower-batch',positions:points},result=executeAction(action,'initial-network-supplement');
      assert.equal(result.cost,Math.round(points.length*towerSpec(state).cost*10)/10,'Use the current price for every supplementary tower');
      supplement.batches.push({action,seedIds:supplement.seedIds.slice(offset,offset+MAX_TOWER_BATCH),...result});
      supplement.cost=Math.round((supplement.cost+result.cost)*10)/10;supplement.gainUnits+=result.gainUnits;
    }
    supplement.missingAfter=evaluation.services.telecom.missingIds.length;
    assert.equal(evaluation.complete,true);for(const id of SERVICES){assert.equal(evaluation.services[id].covered,evaluation.services[id].total);assert.equal(evaluation.services[id].servedUnits,evaluation.services[id].demandUnits);}
    assert.equal(state.spent,Math.round((currentReference.priceAudit.cost+currentReference.adaptation.costDelta+supplement.cost)*10)/10);assert(state.budget>=0);
    const save=exportSave(state),restored=restore(world,scenario,JSON.parse(JSON.stringify(save)));assert.deepEqual(restored,state);
    if(previous){const undone=undo(world,scenario,state);assert.deepEqual(undone,previous);assert.deepEqual(apply(world,scenario,undone,state.actions.at(-1)),state);}
    const record={status:'pass',runId,jobRunId,region:id,difficulty,synthetic:true,privilegedReference:true,independentTrials:0,deterministicReferenceRuns:1,humanFunMeasured:false,humanDurationMeasured:false,
      planFingerprint:plan.fingerprint,scenarioId:scenario.id,rulesVersion:state.rulesVersion,dataVersion:state.dataVersion,initialBudget:scenario.initialBudget,initialMetrics,first90Turn:first90,
      authoredReferenceActions:plan.referenceActions.length,authoredReferenceCost:plan.metadata.expectedReferenceCost,authoredPriceControl:currentReference.priceAudit,currentReferenceAdaptation:currentReference.adaptation,initialNetworkSupplement:supplement,
      moves:state.actions.length,spent:state.spent,budget:state.budget,metrics:metrics(evaluation),complete:evaluation.complete,previewApply:'pass',restore:'pass',undoReapply:'pass',seconds:(performance.now()-started)/1000,
      rssBytes:process.memoryUsage().rss,maxRssKB:process.resourceUsage().maxRSS,save};
    await write(path.join(dir,`${difficulty}.json`),record);await fs.writeFile(path.join(dir,`${difficulty}-trace.json.gz`),zlib.gzipSync(JSON.stringify(trace)));
    records.push({...record,save:undefined});emit({event:'profile-complete',region:id,difficulty,status:record.status,moves:record.moves,seconds:record.seconds,budget:record.budget,maxRssKB:record.maxRssKB});
    globalThis.gc?.();
  }
  const after=await sourceHashes(catalog,sourcePaths);assert.deepEqual(after,before,'Frozen product inputs changed during replay');
  const report={status:'pass',runId,jobRunId,region:id,records,seconds:(performance.now()-start)/1000,sourceHashesBefore:before,sourceHashesAfter:after,sourceUnchanged:true};
  await write(path.join(dir,'report.json'),report);return report;
}

async function main(){
  const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback,catalog=await loadReplayCatalog();
  if(args.includes('--list-regions')){console.log(JSON.stringify(catalog.manifest.regions.map(r=>r.id).sort(compare)));return;}
  assert(args.includes('--regions')!==args.includes('--region'),'Use --regions CSV or --region ID');
  const ids=option('--regions',option('--region','')).split(',').map(x=>x.trim());assert(ids.length&&ids.every(Boolean),'Empty region list');assert.equal(new Set(ids).size,ids.length,'Duplicate requested region');
  for(const id of ids)assert(catalog.manifest.regions.some(r=>r.id===id),`Unknown region: ${id}`);ids.sort(compare);
  const runId=randomUUID(),output=path.resolve(REPO,option('--out',`artifacts/settlements-replay/${runId}`));
  assert(output.startsWith(REPO+path.sep)&&!output.startsWith(SITE+path.sep),'Output must be inside repository and outside site');
  await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'run.lock'),runId,{flag:'wx'});
  process.once('exit',code=>writeFileSync(path.join(output,'exit.json'),JSON.stringify({runId,exitCode:code,finishedAt:new Date().toISOString()})+'\n'));
  const startedAt=new Date().toISOString(),start=performance.now(),reports=[];let identityBefore=null,identityAfter=null;
  const context={runId,startedAt,command:[process.execPath,...process.execArgv,...process.argv.slice(1)],node:process.version,platform:process.platform,arch:process.arch,pid:process.pid,requestedRegions:ids,
    ci:{githubActions:process.env.GITHUB_ACTIONS==='true',runId:process.env.GITHUB_RUN_ID||null,runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,job:process.env.GITHUB_JOB||null,workflow:process.env.GITHUB_WORKFLOW||null,triggerSha:process.env.GITHUB_SHA||null},
    synthetic:true,privilegedReference:true,independentTrials:0,humanFunMeasured:false,humanDurationMeasured:false};
  try{
    identityBefore=await captureCandidateIdentity(catalog);await write(path.join(output,'started.json'),{...context,identityBefore,status:'in-progress'});
    for(const id of ids){reports.push(await regionRun(id,catalog,output,runId));await write(path.join(output,'progress.json'),{runId,status:'in-progress',completedRegions:reports.length,completedProfiles:reports.length*3,targetRegions:ids.length});}
    identityAfter=await captureCandidateIdentity(await loadReplayCatalog());assert.deepEqual(identityAfter,identityBefore,'Candidate changed during replay');
    const artifactHashes={};for(const id of ids)for(const name of ['report.json',...DIFFICULTIES.flatMap(d=>[`${d}.json`,`${d}-trace.json.gz`])]){const p=`regions/${id}/${name}`;artifactHashes[p]=await hashFile(contained(output,p));}
    const records=reports.flatMap(r=>r.records);assert.equal(records.length,ids.length*3);assert.equal(new Set(records.map(r=>`${r.region}/${r.difficulty}`)).size,records.length);
    await write(path.join(output,'replay-report.json'),{...context,status:'pass',finishedAt:new Date().toISOString(),seconds:(performance.now()-start)/1000,regions:reports.length,actualReplayProfiles:records.length,identityBefore,identityAfter,sourceUnchanged:true,records,artifactHashes,
      metricSemantics:{settlementsRatio:'Equal mean of covered/total across four services; exact 90% threshold',populationRatio:'Equal mean of servedUnits/demandUnits; capacity-demand ratio, equal to unrounded population coverage under current proportional needs'},plannedExitCode:0});
    emit({event:'finished',status:'pass',regions:reports.length,actualReplayProfiles:records.length});
  }catch(error){await write(path.join(output,'replay-report.json'),{...context,status:'fail',finishedAt:new Date().toISOString(),identityBefore,identityAfter,sourceUnchanged:false,records:reports.flatMap(r=>r.records),error:error.stack,plannedExitCode:1});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{emit({event:'failed',error:error.stack});process.exitCode=1;});
