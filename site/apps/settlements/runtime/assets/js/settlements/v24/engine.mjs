/** Versioned replay. Census data and the source graph are never edited. */
import {haversine} from '../v2/engine.mjs';
import {validateTransportPolicy} from './transport-policy-v1.mjs';
import {validateDistanceTransportPolicy} from './transport-policy-v2.mjs';
import {TELECOM_RULES_VERSION,towerSpec,initialTowersFor} from './telecom-policy.mjs';
export {TELECOM_RULES_VERSION,towerSpec} from './telecom-policy.mjs';
import {SOCIAL_RULES_VERSION,socialFacilityCapacity,socialUpgradeCapacity,socialAccessLimits,isPopulationSocialScenario} from './social-policy.mjs';
export {SOCIAL_RULES_VERSION} from './social-policy.mjs';
import {networkRoute,validateInitialNetworkRoute} from './network-routing.mjs';
import {INITIAL_TOWER_POLICY_VERSION} from './initial-tower-spacing.mjs';

// Keep legacy replay, including the short-lived fixed transport prototype.
export const RULES_VERSION = 'settlements-3.0.0';
export const FIXED_TRANSPORT_RULES_VERSION = 'settlements-3.1.0';
export const NEW_RULES_VERSION = 'settlements-3.2.0';
export const OUTREACH_POLICY_VERSION = 'road-access-v1';
// Wire-only envelope: old readers must reject new action fields instead of
// silently dropping them. Scenario policies and internal rules stay unchanged.
export const SERIALIZED_ACTIONS_RULES_VERSION = 'settlements-3.4.1';
// A changed initial network needs its identity even before the first action.
// Readers predating this envelope must reject it instead of replaying old seeds.
export const INITIAL_NETWORK_SAVE_RULES_VERSION = 'settlements-3.4.2';
export const MAX_TOWER_BATCH = 100;
const engineRulesVersions=Object.freeze([RULES_VERSION,FIXED_TRANSPORT_RULES_VERSION,NEW_RULES_VERSION,TELECOM_RULES_VERSION,SOCIAL_RULES_VERSION]);
export const TRANSPORT_PRICES = Object.freeze({transport:2,construction:6});
export const DISTANCE_TRANSPORT_PRICES = Object.freeze({transportPerKm:.2,constructionPerKm:1.2});
export const SERVICES = Object.freeze(['telecom', 'medical', 'school', 'culture']);
export const CATALOG = Object.freeze(Object.fromEntries(Object.entries({
  tower: {name:'Вышка связи', cost:12, radiusKm:5.5},
  medical: {name:'Клиника', cost:32, capacity:2000, upgradeCost:16.6, walk:35, time:60, art:'O-01-ready'},
  school: {name:'Школа', cost:48, capacity:260, upgradeCost:25, walk:30, time:55, art:'O-03-ready'},
  culture: {name:'Общественный центр', cost:22, capacity:1800, upgradeCost:11.4, walk:35, time:60, art:'O-05-ready'},
  outreach: {name:'Выездной врач', cost:9, capacity:500, upgradeCost:4.7, walk:0, time:0, art:'O-10'},
  connect: {name:'Соединить', cost:8},
}).map(([key,value]) => [key,Object.freeze({...value,...(value.capacity ? {capacityUnits:value.capacity*100} : {})})])));

const clone = value => structuredClone(value);
const money = value => Math.round(value*10)/10;
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const facilityTypes = ['medical','school','culture','outreach'];
const serviceOf = type => type === 'outreach' ? 'medical' : type;
const positive = row => Number.isFinite(row.population) && row.population > 0;
const demand = (row,service) => positive(row) ? Math.round(row.population*(service==='school'?16:100)) : 0;
const edgeKey = (a,b) => cmp(a,b) < 0 ? `${a}|${b}` : `${b}|${a}`;
const activeEdges = routes => new Set(routes.flatMap(r => r.path.slice(1).map((id,i) => edgeKey(r.path[i],id))));
const steps = scenario => scenario.kind==='intro' ? (scenario.tutorial?.steps || []) : [];
export const totalTutorialSteps = value => value?.rulesVersion===SOCIAL_RULES_VERSION ? 6 : 5;
const sourceVersions = new WeakMap();
const towerSourceIndices = new WeakMap();
const usesGeographicTelecom = version => version===TELECOM_RULES_VERSION || version===SOCIAL_RULES_VERSION;
const usesDistanceTransport = version => version===NEW_RULES_VERSION || usesGeographicTelecom(version);
const socialAccessCaches = new WeakMap();
const incomingRoadIndices = new WeakMap();

class AccessHeap {
  constructor(){this.items=[];}
  push(item){let i=this.items.length;this.items.push(item);while(i){const parent=(i-1)>>1;if(this.items[parent][0]<=item[0])break;this.items[i]=this.items[parent];i=parent;}this.items[i]=item;}
  pop(){const first=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(i*2+1<this.items.length){let child=i*2+1;if(child+1<this.items.length&&this.items[child+1][0]<this.items[child][0])child++;if(this.items[child][0]>=last[0])break;this.items[i]=this.items[child];i=child;}this.items[i]=last;}return first;}
}

// The same directed time/walking labels as World.access, allocated only for
// reached nodes. A local institution does not allocate a region × walking grid.
export function sparseSocialAccess(start,adjacency,totalLimit,walkLimit) {
  const labels=new Map(),distance=new Map(),heap=new AccessHeap();
  const at=index=>{if(!labels.has(index))labels.set(index,new Float64Array(walkLimit+1).fill(Infinity));return labels.get(index);};
  at(start)[0]=0;distance.set(start,0);heap.push([0,start,0]);
  while(heap.items.length){
    const [d,i,w]=heap.pop();if(d!==at(i)[w])continue;
    for(const [j,t,mode] of adjacency[i]){
      const nextWalk=w+(mode===1?0:Math.ceil(t)),nextTime=d+t;
      if(nextWalk>walkLimit||nextTime>totalLimit)continue;
      const values=at(j);if(nextTime>=values[nextWalk])continue;
      let dominated=false;for(let k=0;k<=nextWalk;k++)if(values[k]<=nextTime){dominated=true;break;}if(dominated)continue;
      values[nextWalk]=nextTime;if(nextTime<(distance.get(j)??Infinity))distance.set(j,nextTime);heap.push([nextTime,j,nextWalk]);
    }
  }
  const indices=Uint32Array.from([...distance.keys()].sort((a,b)=>a-b)),values=Float64Array.from(indices,index=>distance.get(index));
  return {indices,values,byteLength:indices.byteLength+values.byteLength};
}

function canonicalSource(value) {
  if (Array.isArray(value)) return value.map(canonicalSource);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort(cmp)
    .filter(key=>value[key]!==undefined).map(key=>[key,canonicalSource(value[key])]));
  return value;
}

function dataVersion(world) {
  // World source rows/graph are immutable by contract. Cache only their version,
  // never mutable gameplay state or UI metadata. This is a change fingerprint,
  // not a signature or an authentication claim.
  if (sourceVersions.has(world)) return sourceVersions.get(world);
  const rows=world.rows.map(({index,...source})=>source).sort((a,b)=>cmp(a.id,b.id));
  const edges=[];
  for (const [mode,adjacency] of [[0,world.walk],[1,world.drive]]) for (let from=0;from<adjacency.length;from++)
    for (const [to,minutes] of adjacency[from]) edges.push([world.rows[from].id,world.rows[to].id,minutes,mode]);
  edges.sort((a,b)=>cmp(a[0],b[0])||cmp(a[1],b[1])||a[2]-b[2]||a[3]-b[3]);
  const text=JSON.stringify(canonicalSource({region:world.region,networkVersion:world.networkVersion,networkStatus:world.networkStatus,rows,edges}));
  let first=2166136261,second=0x9e3779b9;
  for (let i=0;i<text.length;i++) {
    const code=text.charCodeAt(i);
    first=Math.imul(first^code,16777619);
    second=Math.imul(second^code,0x5bd1e995);
  }
  const version=`source-v1-${(first>>>0).toString(16).padStart(8,'0')}${(second>>>0).toString(16).padStart(8,'0')}`;
  sourceVersions.set(world,version);
  return version;
}

function scenarioRules(scenario) {
  if (scenario?.version===1 && (!scenario.rulesVersion || scenario.rulesVersion===RULES_VERSION)) return RULES_VERSION;
  if (scenario?.version===2 && scenario.rulesVersion===FIXED_TRANSPORT_RULES_VERSION) return FIXED_TRANSPORT_RULES_VERSION;
  if (scenario?.version===3 && scenario.rulesVersion===NEW_RULES_VERSION) return NEW_RULES_VERSION;
  if (scenario?.version===4 && scenario.rulesVersion===TELECOM_RULES_VERSION) return TELECOM_RULES_VERSION;
  if (scenario?.version===5 && scenario.rulesVersion===SOCIAL_RULES_VERSION) return SOCIAL_RULES_VERSION;
  throw new Error('Неизвестная версия сценария или правил');
}
const scenarioPolicy=(world,scenario)=>usesDistanceTransport(scenarioRules(scenario)) ?
  validateDistanceTransportPolicy(world,scenario.transportPolicy) : validateTransportPolicy(world,scenario.transportPolicy);

function checkTelecomPlanIdentity(value) {
  const version=value?.rulesVersion===SOCIAL_RULES_VERSION?'telecom-plan-v2':'telecom-plan-v1';
  if (value?.telecomPlanVersion!==version || !/^sha256:[0-9a-f]{64}$/.test(value?.telecomPlanFingerprint||''))
    throw new Error('Неизвестная версия плана связи');
}
function checkSocialPolicyIdentity(value) {
  if (value?.socialPolicyVersion!=='social-policy-v1' || !/^sha256:[0-9a-f]{64}$/.test(value?.socialPolicyFingerprint||''))
    throw new Error('Неизвестная версия социальной политики');
}
const hasInitialTowerPolicy=value=>value!=null && (Object.hasOwn(value,'initialTowerPolicyVersion') || Object.hasOwn(value,'initialTowerPolicyFingerprint'));
function checkInitialTowerPolicyIdentity(value) {
  if (!hasInitialTowerPolicy(value)) return false;
  if (value.rulesVersion!==SOCIAL_RULES_VERSION ||
      (value.version??value.scenarioVersion)!==5 || value.kind==='intro' ||
      (value.id??value.scenarioId)==='intro-chelyabinsk-7-v5' ||
      value.initialTowerPolicyVersion!==INITIAL_TOWER_POLICY_VERSION ||
      !/^sha256:[0-9a-f]{64}$/.test(value.initialTowerPolicyFingerprint||''))
    throw new Error('Неизвестная версия исходной сети связи');
  return true;
}
function checkDifficulty(value) {
  const id=value?.id||value?.scenarioId||'',intro=id==='intro-chelyabinsk-7-v5'&&value?.difficulty==='normal';
  if (!['easy','normal','hard'].includes(value?.difficulty) || !intro&&!id.endsWith(`-v5-${value.difficulty}`))
    throw new Error('Некорректная сложность сценария');
}
function checkSocialScenario(scenario) {
  checkSocialPolicyIdentity(scenario);checkDifficulty(scenario);
  if (!Number.isSafeInteger(scenario.telecomInitialPopulationThreshold) || scenario.telecomInitialPopulationThreshold<1 ||
      scenario.kind==='intro'&&(scenario.difficulty!=='normal'||scenario.telecomInitialPopulationThreshold!==8000))
    throw new Error('Некорректные исходные условия сценария');
}

function checkScenario(world,scenario) {
  if (!scenario || !['intro','campaign','free'].includes(scenario.kind) || typeof scenario.id!=='string' ||
      ![1,2,3,4,5].includes(scenario.version) || scenario.regionId!==world.region.id || !Number.isFinite(scenario.initialBudget) || scenario.initialBudget<0)
    throw new Error('Некорректный сценарий или регион');
  if (scenarioRules(scenario)!==RULES_VERSION) scenarioPolicy(world,scenario);
  if (usesGeographicTelecom(scenarioRules(scenario))) checkTelecomPlanIdentity(scenario);
  if (scenarioRules(scenario)===SOCIAL_RULES_VERSION) checkSocialScenario(scenario);
  checkInitialTowerPolicyIdentity(scenario);
  if (!Array.isArray(scenario.targetIds) || scenario.targetIds.some(id=>!world.ids.has(id))) throw new Error('Неизвестные поселения сценария');
  if (scenario.kind==='intro' && steps(scenario).length!==3) throw new Error('Вводный сценарий должен содержать три шага');
}

function checkState(world,scenario,state) {
  if (!state || state.rulesVersion!==scenarioRules(scenario)) throw new Error('Неизвестная версия правил');
  if (state.regionId!==world.region.id || state.scenarioId!==scenario.id || state.scenarioVersion!==scenario.version)
    throw new Error('Сохранение относится к другому сценарию или региону');
  if (state.dataVersion!==dataVersion(world)) throw new Error('Версия исходных данных сохранения не совпадает с загруженным регионом');
  const scenarioTowerPolicy=checkInitialTowerPolicyIdentity(scenario),stateTowerPolicy=checkInitialTowerPolicyIdentity(state);
  if (scenarioTowerPolicy!==stateTowerPolicy || state.initialTowerPolicyVersion!==scenario.initialTowerPolicyVersion ||
      state.initialTowerPolicyFingerprint!==scenario.initialTowerPolicyFingerprint)
    throw new Error('Исходная сеть связи не соответствует сохранённой партии');
  if (state.rulesVersion!==RULES_VERSION) {
    const policy=scenarioPolicy(world,scenario);
    if (state.transportPolicyVersion!==policy.version || state.transportPolicyFingerprint!==policy.fingerprint)
      throw new Error('Версия транспортных условий сохранения не совпадает со сценарием');
  }
  if (usesGeographicTelecom(state.rulesVersion)) {
    checkTelecomPlanIdentity(scenario);
    if (state.telecomPlanVersion!==scenario.telecomPlanVersion || state.telecomPlanFingerprint!==scenario.telecomPlanFingerprint)
      throw new Error('Версия плана связи сохранения не совпадает со сценарием');
  }
  if (state.rulesVersion===SOCIAL_RULES_VERSION) {
    checkSocialScenario(scenario);checkDifficulty(state);
    if (state.difficulty!==scenario.difficulty) throw new Error('Сложность сохранения не совпадает со сценарием');
    if (state.socialPolicyVersion!==scenario.socialPolicyVersion || state.socialPolicyFingerprint!==scenario.socialPolicyFingerprint)
      throw new Error('Версия социальной политики сохранения не совпадает со сценарием');
  }
}

function baselineUnits(scenario,row,service) {
  // Older action logs retain their authored invisible telecom baseline. Under
  // 3.3, only actual initial or player-built tower circles provide service.
  if (service==='telecom' && usesGeographicTelecom(scenario.rulesVersion) || service!=='telecom' && isPopulationSocialScenario(scenario)) return 0;
  const value = scenario.baseline?.[service]?.[row.id];
  return service==='telecom' ? (value===true ? demand(row,service) : 0) :
    (Number.isSafeInteger(value) && value>0 ? Math.min(demand(row,service),value) : 0);
}

// Source edges are directed. Buying a physical section activates only directions
// that actually exist in the supplied teaching graph, never an invented reverse.
function accessGraph(world,routes,active=activeEdges(routes)) {
  const reverse = world.rows.map(()=>[]);
  for (let a=0;a<world.rows.length;a++) {
    for (const [b,time] of world.walk[a]) reverse[b].push([a,time,0]);
    for (const [b,time] of world.drive[a]) if (active.has(edgeKey(world.rows[a].id,world.rows[b].id))) reverse[b].push([a,time,1]);
  }
  return reverse;
}

function socialAccessContext(world,routes) {
  const active=activeEdges(routes),key=[...active].sort(cmp).join('\n');
  let contexts=socialAccessCaches.get(world);
  if (!contexts) {contexts=new Map();socialAccessCaches.set(world,contexts);}
  if (contexts.has(key)) {const context=contexts.get(key);contexts.delete(key);contexts.set(key,context);return context;}
  const context={adjacency:accessGraph(world,routes,active),distances:new Map(),bytes:0};
  contexts.set(key,context);
  while (contexts.size>2) contexts.delete(contexts.keys().next().value);
  return context;
}

function facilityAccess(world,context,type,index,limits) {
  const key=JSON.stringify([type,index,limits.time===Infinity?'unlimited':limits.time,limits.walk]);
  if (context.distances.has(key)) {
    const distances=context.distances.get(key);context.distances.delete(key);context.distances.set(key,distances);return distances;
  }
  const distances=sparseSocialAccess(index,context.adjacency,limits.time,limits.walk),maxBytes=16*1024*1024;
  // Account conservatively for the retained key/object/typed-array wrappers as
  // well as data. Many tiny local institutions fit without a small entry cap.
  const retainedBytes=distances.byteLength+256+key.length*2;
  // At most two topologies, 16 MiB of distance entries each. Capacity and actual
  // allocations remain state-derived; undo and previews select real edge sets.
  if (retainedBytes<=maxBytes) {
    while (context.distances.size && context.bytes+retainedBytes>maxBytes) {
      const oldest=context.distances.keys().next().value;context.bytes-=context.distances.get(oldest).retainedBytes;context.distances.delete(oldest);
    }
    distances.retainedBytes=retainedBytes;context.distances.set(key,distances);context.bytes+=retainedBytes;
  }
  return distances;
}

function newFacilityCapacity(world,scenario,type,settlementId) {
  const capacity=isPopulationSocialScenario(scenario)?socialFacilityCapacity(world,type,settlementId):CATALOG[type].capacityUnits;
  if (!Number.isSafeInteger(capacity) || capacity<0) throw new Error('Некорректная мощность объекта');
  return capacity;
}

function coveredByTower(row,towers) {
  return Number.isFinite(row.lat) && Number.isFinite(row.lon) && towers.some(t=>haversine(t,row)<=t.radiusKm+1e-9);
}

const validCoordinate = point => Number.isFinite(point?.lat) && Number.isFinite(point?.lon) && Math.abs(point.lat)<=90 && Math.abs(point.lon)<=180;
const unitSphere = point => {
  const lat=point.lat*Math.PI/180,lon=point.lon*Math.PI/180,cos=Math.cos(lat);
  return [cos*Math.cos(lon),cos*Math.sin(lon),Math.sin(lat)];
};
// A geodesic radius becomes a chord on the unit sphere. A point within one
// cell-width can only occupy the same or an adjacent cell in each axis. The
// small margin protects the inclusive haversine boundary from float rounding.
const towerCellWidth=radius=>2*Math.sin((radius+1e-9)/(2*6371.0088))*(1+1e-12);
const towerCell = (point,width) => unitSphere(point).map(value=>Math.floor(value/width));

function towerSourceIndex(world,radius) {
  let radii=towerSourceIndices.get(world);
  if(!radii){radii=new Map();towerSourceIndices.set(world,radii);}
  if (radii.has(radius)) return radii.get(radius);
  const index=new Map(),width=towerCellWidth(radius);
  for (let i=0;i<world.rows.length;i++) {
    const row=world.rows[i];
    if (!positive(row) || !validCoordinate(row)) continue;
    const key=towerCell(row,width).join(',');
    if (!index.has(key)) index.set(key,[]);
    index.get(key).push(i);
  }
  // Only immutable source geometry is cached. Every evaluation derives fresh
  // coverage from its own towers, including previews, undo and imported replay.
  radii.set(radius,index);
  return index;
}

function towerCoverage(world,towers,radius) {
  const covered=new Uint8Array(world.rows.length),index=towerSourceIndex(world,radius),width=towerCellWidth(radius);
  for (const tower of towers) {
    if (!validCoordinate(tower)) continue;
    const [x,y,z]=towerCell(tower,width);
    for (let dx=-1;dx<=1;dx++) for (let dy=-1;dy<=1;dy++) for (let dz=-1;dz<=1;dz++) {
      const nearby=index.get(`${x+dx},${y+dy},${z+dz}`);
      if (!nearby) continue;
      for (const i of nearby) if (!covered[i] && haversine(tower,world.rows[i])<=radius+1e-9) covered[i]=1;
    }
  }
  return covered;
}

function initialTowers(world,scenario) {
  if (!usesGeographicTelecom(scenarioRules(scenario))) return [];
  const canonical=initialTowersFor(world,scenario),supplied=scenario.initialTowers;
  if (!Array.isArray(supplied) || supplied.length!==canonical.length) throw new Error('Некорректные исходные вышки');
  const byId=new Map(supplied.map(t=>[t?.id,t]));
  if (byId.size!==canonical.length || canonical.some(expected=>{
    const tower=byId.get(expected.id);
    return !tower || !validCoordinate(tower) || ['settlementId','lat','lon','radiusKm'].some(key=>tower[key]!==expected[key]);
  })) throw new Error('Исходные вышки не соответствуют поселениям сценария');
  return clone(canonical);
}

function summarize(world,scenario,state) {
  // Keep historical allocations and replay intact. Out-of-polygon source rows
  // are no longer regional goals or denominators after the geometry correction.
  const scope = scenario.kind==='intro' ? new Set(scenario.targetIds) :
    Array.isArray(scenario.playableSettlementIds)?new Set(scenario.playableSettlementIds):null;
  const byId = Object.fromEntries(world.rows.map(r=>[r.id,{}]));
  const assignments = Object.fromEntries(SERVICES.map(s=>[s,{}]));
  const services = {}, facilityUsage = {};
  const context=state.rulesVersion===SOCIAL_RULES_VERSION?socialAccessContext(world,state.routes):null;
  const adjacency = context?.adjacency || accessGraph(world,state.routes);
  const geographicTelecom=usesGeographicTelecom(state.rulesVersion) ? towerCoverage(world,state.towers,towerSpec(state).radiusKm) : null;
  for (const service of SERVICES) {
    const needs = world.rows.map(row=>demand(row,service));
    const served = world.rows.map(row=>baselineUnits(scenario,row,service));
    const reachable = new Uint8Array(world.rows.length);
    const facilities = state.facilities.filter(f=>serviceOf(f.type)===service);
    const offers=[];
    for (const facility of facilities) {
      const spec=CATALOG[facility.type], index=world.ids.get(facility.settlementId);
      const limits=isPopulationSocialScenario(scenario)?socialAccessLimits(world,facility.type):spec;
      if (!(Number.isFinite(limits.time)||limits.time===Infinity) || limits.time<0 || !Number.isSafeInteger(limits.walk) || limits.walk<0)
        throw new Error('Некорректные условия доступности объекта');
      facilityUsage[facility.id]={used:0,capacity:facility.capacityUnits,service};
      // Search the reversed graph: a resident must reach an institution.
      const entries=context?facilityAccess(world,context,facility.type,index,limits):null;
      const distances=entries?null:world.access(index,adjacency,spec.time,spec.walk);
      for (let k=0;k<(entries?entries.indices.length:world.rows.length);k++) {
        const i=entries?entries.indices[k]:k,distance=entries?entries.values[k]:distances[i];
        if (!needs[i] || !Number.isFinite(distance)) continue;
        reachable[i]=1;
        const id=world.rows[i].id;
        const previous=state.assignments?.[service]?.[id]?.[facility.id] || 0;
        if (previous) {
          const take=Math.min(previous,needs[i]-served[i],facility.capacityUnits-facilityUsage[facility.id].used);
          if (take>0) {
            served[i]+=take; facilityUsage[facility.id].used+=take;
            (assignments[service][id] ||= {})[facility.id]=take;
          }
        }
        if (needs[i]>served[i]) offers.push([distance,i,facility.id]);
      }
    }
    // Preserve every valid allocation before assigning any newly available seat.
    if (context) {
      // Later institutions may have preserved all remaining demand since an
      // offer was collected. Such an offer would take exactly zero seats;
      // discard it before sorting without changing any positive allocation.
      let retained=0;
      for (const offer of offers) if (needs[offer[1]]>served[offer[1]]) offers[retained++]=offer;
      offers.length=retained;
    }
    offers.sort((a,b)=>a[0]-b[0] || cmp(world.rows[a[1]].id,world.rows[b[1]].id) || cmp(a[2],b[2]));
    for (const [,index,id] of offers) {
      const usage=facilityUsage[id], take=Math.min(needs[index]-served[index],usage.capacity-usage.used);
      if (take<=0) continue;
      served[index]+=take; usage.used+=take;
      const assigned=(assignments[service][world.rows[index].id] ||= {});
      assigned[id]=(assigned[id]||0)+take;
    }
    let covered=0,total=0,people=0,population=0,servedUnits=0,demandUnits=0;
    const missingIds=[];
    for (let i=0;i<world.rows.length;i++) {
      const row=world.rows[i], need=needs[i];
      if (service==='telecom' && need && (geographicTelecom ? geographicTelecom[i] : coveredByTower(row,state.towers))) served[i]=need;
      const full=need>0 && served[i]===need, missing=need-served[i];
      const reason=!Number.isFinite(row.population)?'unknown':!need?'empty':full?'served':service==='telecom'?
        (state.towers.length?'no-path':'no-object'):!facilities.length?'no-object':reachable[i]?'capacity':'no-path';
      byId[row.id][service]={demand:need,served:served[i],full,reason,missing};
      if (!need || scope && !scope.has(row.id)) continue;
      total++; population+=row.population; demandUnits+=need; servedUnits+=served[i];
      people+=row.population*served[i]/need;
      if (full) covered++; else missingIds.push(row.id);
    }
    services[service]={covered,total,people:Math.round(people),missingIds,population,servedUnits,demandUnits};
  }
  const groups=(scenario.groups||[]).map(group=>{
    const ids=group.ids.filter(id=>(!scope||scope.has(id))&&byId[id]?.[group.service]?.demand>0);
    const remaining=ids.filter(id=>!byId[id][group.service].full);
    return {...clone(group),ids,complete:remaining.length===0,remaining};
  });
  const allComplete=SERVICES.every(service=>services[service].missingIds.length===0);
  const tutorialStep=scenario.kind==='intro' ? (state.actions.length<3?state.actions.length:allComplete?totalTutorialSteps(scenario):
    services.telecom.missingIds.length?3:scenario.rulesVersion===SOCIAL_RULES_VERSION&&
      !services.medical.missingIds.length&&!services.school.missingIds.length?5:4) : 0;
  const total=SERVICES.reduce((sum,service)=>sum+services[service].total,0);
  const covered=SERVICES.reduce((sum,service)=>sum+services[service].covered,0);
  return {assignments,evaluation:{byId,services,groups,complete:scenario.kind!=='intro' && allComplete,
    progress:total?covered/total:1,tutorialStep,facilityUsage}};
}

export function createState(world,scenario,{owner='guest:settlements-v24'}={}) {
  checkScenario(world,scenario);
  const rulesVersion=scenarioRules(scenario);
  if (typeof owner!=='string' || !owner || owner.length>200) throw new Error('Некорректный владелец сохранения');
  const ids=new Set();
  const facilities=(scenario.initialFacilities||[]).map(f=>{
    if (!facilityTypes.includes(f.type) || !world.ids.has(f.settlementId) || typeof f.id!=='string' || ids.has(f.id))
      throw new Error('Некорректный исходный объект');
    ids.add(f.id);
    const capacityUnits=f.capacityUnits ?? (isPopulationSocialScenario(scenario)?NaN:CATALOG[f.type].capacityUnits);
    if (!Number.isSafeInteger(capacityUnits) || capacityUnits<0) throw new Error('Некорректная исходная мощность');
    return {id:f.id,type:f.type,settlementId:f.settlementId,level:1,capacityUnits};
  });
  const routes=(scenario.initialRoutes||[]).map(r=>{
    if (rulesVersion===SOCIAL_RULES_VERSION) {
      if (r.path!==undefined) return validateInitialNetworkRoute(world,r);
      const route=networkRoute(world,scenarioPolicy(world,scenario),[],{type:'connect',from:r.from,to:r.to});
      if (!route) throw new Error('Исходный маршрут отсутствует в учебной сети');
      return {from:route.from,to:route.to,path:[...route.path]};
    }
    const route=world.route(r.from,r.to);
    if (!route) throw new Error('Исходный маршрут отсутствует в учебной сети');
    return {from:route.from,to:route.to,path:[...route.path]};
  });
  const state={rulesVersion,dataVersion:dataVersion(world),scenarioId:scenario.id,scenarioVersion:scenario.version,regionId:world.region.id,
    owner,revision:0,budget:money(scenario.initialBudget),spent:0,actions:[],facilities,routes,towers:initialTowers(world,scenario),assignments:{},tutorialStep:0};
  if (rulesVersion!==RULES_VERSION) {
    state.transportPolicyVersion=scenario.transportPolicy.version;
    state.transportPolicyFingerprint=scenario.transportPolicy.fingerprint;
  }
  if (usesGeographicTelecom(rulesVersion)) {
    state.telecomPlanVersion=scenario.telecomPlanVersion;
    state.telecomPlanFingerprint=scenario.telecomPlanFingerprint;
  }
  if (rulesVersion===SOCIAL_RULES_VERSION) {
    state.difficulty=scenario.difficulty;
    state.socialPolicyVersion=scenario.socialPolicyVersion;
    state.socialPolicyFingerprint=scenario.socialPolicyFingerprint;
  }
  if (hasInitialTowerPolicy(scenario)) {
    state.initialTowerPolicyVersion=scenario.initialTowerPolicyVersion;
    state.initialTowerPolicyFingerprint=scenario.initialTowerPolicyFingerprint;
  }
  const result=summarize(world,scenario,state);
  state.assignments=result.assignments; state.tutorialStep=result.evaluation.tutorialStep;
  return state;
}

export function evaluate(world,scenario,state) {
  checkState(world,scenario,state);
  return summarize(world,scenario,state).evaluation;
}

function canonicalAction(action) {
  if (!action || typeof action!=='object') throw new Error('Выберите действие');
  if (action.type==='tower') {
    if (!Number.isFinite(action.lat) || !Number.isFinite(action.lon) || Math.abs(action.lat)>90 || Math.abs(action.lon)>180)
      throw new Error('Выберите допустимые координаты вышки');
    return {type:'tower',lat:action.lat,lon:action.lon};
  }
  if (action.type==='tower-batch') {
    if (!Array.isArray(action.positions) || action.positions.length<2 || action.positions.length>MAX_TOWER_BATCH)
      throw new Error(`Выберите от 2 до ${MAX_TOWER_BATCH} мест для вышек`);
    const positions=[],seen=new Set();
    for (const point of action.positions) {
      if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat)>90 || Math.abs(point.lon)>180)
        throw new Error('Выберите допустимые координаты вышки');
      const key=`${point.lat}:${point.lon}`;
      if (seen.has(key)) throw new Error('Места для вышек не должны повторяться');
      seen.add(key);positions.push({lat:point.lat,lon:point.lon});
    }
    return {type:'tower-batch',positions};
  }
  if (action.type==='build') {
    if (!facilityTypes.includes(action.service) || typeof action.settlementId!=='string') throw new Error('Выберите объект и поселение');
    if (action.outreachPolicyVersion!==undefined && (action.service!=='outreach' || action.outreachPolicyVersion!==OUTREACH_POLICY_VERSION))
      throw new Error('Неизвестные условия выездной помощи');
    return {type:'build',service:action.service,settlementId:action.settlementId,
      ...(action.outreachPolicyVersion!==undefined?{outreachPolicyVersion:action.outreachPolicyVersion}:{})};
  }
  if (action.type==='connect') {
    if (action.stopIds!==undefined || action.selectedIds!==undefined) {
      const stopIds=action.stopIds??action.selectedIds;
      if (!Array.isArray(stopIds) || stopIds.length<2 || stopIds.some(id=>typeof id!=='string')) throw new Error('Выберите не менее двух поселений маршрута');
      if (new Set(stopIds).size!==stopIds.length) throw new Error('Остановки маршрута не должны повторяться');
      if (action.selectedIds!==undefined && JSON.stringify(action.selectedIds)!==JSON.stringify(stopIds) ||
          action.from!==undefined && action.from!==stopIds[0] || action.to!==undefined && action.to!==stopIds.at(-1))
        throw new Error('Остановки не совпадают с концами маршрута');
      return {type:'connect',from:stopIds[0],to:stopIds.at(-1),stopIds:[...stopIds]};
    }
    if (typeof action.from!=='string' || typeof action.to!=='string') throw new Error('Выберите два поселения');
    return {type:'connect',from:action.from,to:action.to};
  }
  if (action.type==='connect-network') {
    if (typeof action.from!=='string' || !Array.isArray(action.targetEdge) || action.targetEdge.length!==2 ||
        action.targetEdge.some(id=>typeof id!=='string') || action.targetEdge[0]===action.targetEdge[1]) throw new Error('Выберите действующий участок сети');
    return {type:'connect-network',from:action.from,targetEdge:[...action.targetEdge].sort(cmp)};
  }
  if (action.type==='upgrade') {
    if (typeof action.facilityId!=='string') throw new Error('Выберите объект для расширения');
    return {type:'upgrade',facilityId:action.facilityId};
  }
  throw new Error('Неизвестное действие');
}

function tutorialAllows(scenario,state,action) {
  if (scenario.kind!=='intro' || state.actions.length>=3) return;
  const expected=steps(scenario)[state.actions.length]?.action;
  const same=expected && expected.type===action.type && (action.type==='tower' ?
    Math.abs(expected.lat-action.lat)<=1e-6 && Math.abs(expected.lon-action.lon)<=1e-6 :
    action.type==='build' ? expected.service===action.service && expected.settlementId===action.settlementId :
    action.type==='connect' ? expected.from===action.from && expected.to===action.to && (!action.stopIds || action.stopIds.length===2) : expected.facilityId===action.facilityId);
  if (!same) throw new Error('Сначала выполните текущий шаг вводного задания');
}

function ringContains(ring,lat,lon) {
  // Unwrap consecutive vertices (rather than each point relative to a query)
  // so polygons crossing ±180° retain their actual narrow span.
  const points=[];
  for (const point of ring) {
    let x=point[0];
    if (points.length) {const prev=points.at(-1)[0];while(x-prev>180)x-=360;while(x-prev< -180)x+=360;}
    points.push([x,point[1]]);
  }
  if (!points.length) return false;
  const center=points.reduce((sum,p)=>sum+p[0],0)/points.length;
  let x=lon;while(x-center>180)x-=360;while(x-center< -180)x+=360;
  let inside=false;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i],[xj,yj]=points[j];
    const cross=(x-xi)*(yj-yi)-(lat-yi)*(xj-xi);
    if (Math.abs(cross)<1e-9 && x>=Math.min(xi,xj)-1e-9 && x<=Math.max(xi,xj)+1e-9 && lat>=Math.min(yi,yj)-1e-9 && lat<=Math.max(yi,yj)+1e-9) return true;
    if ((yi>lat)!==(yj>lat) && x<(xj-xi)*(lat-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

export function pointInBoundary(boundary,lat,lon) {
  if (!boundary) return true; // No water mask or fabricated terrain fallback.
  if (boundary.type==='FeatureCollection') return boundary.features.some(f=>pointInBoundary(f,lat,lon));
  if (boundary.type==='Feature') return pointInBoundary(boundary.geometry,lat,lon);
  if (boundary.type==='GeometryCollection') return boundary.geometries.some(g=>pointInBoundary(g,lat,lon));
  const polygons=boundary.type==='Polygon'?[boundary.coordinates]:boundary.type==='MultiPolygon'?boundary.coordinates:null;
  if (!polygons) throw new Error('Недоступна геометрия границы региона');
  return polygons.some(p=>ringContains(p[0],lat,lon) && !p.slice(1).some(r=>ringContains(r,lat,lon)));
}

// A source driving edge is a usable road only when it already exists in the
// authored policy or has been constructed by a previous confirmed action.
// Zero-length source links alone never manufacture a road. Co-located source
// records may share a real incoming road through their directed zero links.
function hasOutreachRoad(world,scenario,state,settlementId) {
  const policy=state.rulesVersion===RULES_VERSION?null:scenarioPolicy(world,scenario),active=activeEdges(state.routes);
  let incoming=incomingRoadIndices.get(world);
  if (!incoming) {
    incoming=world.rows.map(()=>[]);
    for (let from=0;from<world.rows.length;from++) for (const [to] of world.drive[from]) incoming[to].push(from);
    incomingRoadIndices.set(world,incoming);
  }
  const target=world.ids.get(settlementId),seen=new Set([target]),queue=[target];
  for (let i=0;i<queue.length;i++) {
    const to=queue[i],b=world.rows[to];
    for (const from of incoming[to]) {
      const a=world.rows[from],key=edgeKey(a.id,b.id),metres=policy?.distanceMeters?.[key]??haversine(a,b)*1000;
      if (metres>0 && (!policy || policy.roadRequired[key]===false || active.has(key))) return true;
      if (metres===0 && validCoordinate(a) && a.lat===b.lat && a.lon===b.lon && !seen.has(from)) {seen.add(from);queue.push(from);}
    }
  }
  return false;
}

function routeThroughStops(world,scenario,input,action) {
  if (action.stopIds.some(id=>!world.ids.has(id))) throw new Error('Поселение отсутствует в регионе');
  const policy=input.rulesVersion===SOCIAL_RULES_VERSION?scenarioPolicy(world,scenario):null;
  const routes=[...input.routes],legs=[],path=[action.stopIds[0]];
  for (let i=1;i<action.stopIds.length;i++) {
    const from=action.stopIds[i-1],to=action.stopIds[i];
    const leg=policy?networkRoute(world,policy,routes,{type:'connect',from,to},{exactTarget:true}):world.route(from,to);
    if (!leg) throw new Error(`Связь отсутствует в учебной транспортной сети: ${world.row(from).name||from} → ${world.row(to).name||to}`);
    const route={from,to,path:[...leg.path]};legs.push(route);routes.push(route);path.push(...leg.path.slice(1));
  }
  const active=activeEdges(input.routes),edgeKeys=path.slice(1).map((id,i)=>edgeKey(path[i],id));
  const freshEdgeKeys=[...new Set(edgeKeys.filter(key=>!active.has(key)))],freshPath=[];
  // Draw each newly bought physical section once, even if the ordered route
  // revisits it. The full path and legs still retain every selected stop.
  let run=null;
  for (let i=0;i<edgeKeys.length;i++) {
    if (active.has(edgeKeys[i])) {run=null;continue;}
    active.add(edgeKeys[i]);
    if (!run) {run=[path[i]];freshPath.push(run);}run.push(path[i+1]);
  }
  return {path,legs,stopIds:[...action.stopIds],edgeKeys,freshEdgeKeys,freshPath,joinId:action.to,requestedTo:action.to};
}

function reducer(world,scenario,input,rawAction,{replay=false}={}) {
  checkState(world,scenario,input);
  const action=canonicalAction(rawAction);
  if (action.type==='connect-network' && input.rulesVersion!==SOCIAL_RULES_VERSION) throw new Error('Действие недоступно в этой версии правил');
  tutorialAllows(scenario,input,action);
  let cost,path,transportCost,network;
  const towerPositions=action.type==='tower'?[action]:action.type==='tower-batch'?action.positions:null;
  if (towerPositions) {
    // Validate the complete purchase before cloning or changing any state.
    // The exact-source-coordinate exception and prices match single towers;
    // historical replay must keep its original placement semantics.
    for (const position of towerPositions) {
      const sourcePoint=usesGeographicTelecom(input.rulesVersion) && world.rows.some(row=>positive(row) && validCoordinate(row) && row.lat===position.lat && row.lon===position.lon);
      if (!pointInBoundary(scenario.boundary,position.lat,position.lon) && !sourcePoint) throw new Error('Разместите вышку внутри границы региона');
    }
    cost=money(towerSpec(input).cost*towerPositions.length);
  } else if (action.type==='build') {
    if (!world.ids.has(action.settlementId)) throw new Error('Поселение отсутствует в регионе');
    if (input.facilities.some(f=>f.type===action.service && f.settlementId===action.settlementId)) throw new Error('Объект уже есть. Его можно расширить.');
    if (action.service==='outreach' && (!replay || action.outreachPolicyVersion!==undefined)) {
      action.outreachPolicyVersion=OUTREACH_POLICY_VERSION;
      if (!hasOutreachRoad(world,scenario,input,action.settlementId)) throw new Error('К этому поселению нет дороги. Сначала постройте транспортное соединение.');
    }
    cost=CATALOG[action.service].cost;
  } else if (action.type==='connect' || action.type==='connect-network') {
    if (action.stopIds) network=routeThroughStops(world,scenario,input,action);
    else if (input.rulesVersion===SOCIAL_RULES_VERSION) network=networkRoute(world,scenarioPolicy(world,scenario),input.routes,action);
    const route=network || (input.rulesVersion===SOCIAL_RULES_VERSION?null:world.route(action.from,action.to));
    if (!route) throw new Error(action.from===action.to?'Выберите второе поселение':'Связь отсутствует в учебной транспортной сети');
    path=[...route.path];
    const active=activeEdges(input.routes), fresh=new Set(path.slice(1).map((id,i)=>edgeKey(path[i],id)).filter(key=>!active.has(key)));
    if (!fresh.size) throw new Error('Все участки этого пути уже работают');
    if (input.rulesVersion!==RULES_VERSION) {
      const policy=scenarioPolicy(world,scenario),byDistance=usesDistanceTransport(input.rulesVersion);
      let roadRequiredEdges=0,transportTenths=0,constructionTenths=0,freshMeters=0,constructionMeters=0;
      for (const key of fresh) {
        if (typeof policy.roadRequired[key]!=='boolean') throw new Error('Для участка не заданы транспортные условия');
        const required=policy.roadRequired[key];
        if (required) roadRequiredEdges++;
        if (byDistance) {
          const meters=policy.distanceMeters[key];
          if (!Number.isSafeInteger(meters)||meters<0) throw new Error('Для участка не задано расстояние');
          // Price each canonical section once in integer tenths. Grouping the
          // same sections into separate connect actions cannot change the price.
          transportTenths+=Math.floor((meters+250)/500);
          constructionTenths+=required?Math.floor((6*meters+250)/500):0;
          freshMeters+=meters;if(required)constructionMeters+=meters;
        }
      }
      const transport=byDistance?transportTenths/10:fresh.size*TRANSPORT_PRICES.transport,
        construction=byDistance?constructionTenths/10:roadRequiredEdges*TRANSPORT_PRICES.construction;
      cost=money(transport+construction);
      transportCost={freshEdges:fresh.size,roadRequiredEdges,transport,construction,total:cost,
        policyVersion:policy.version,policyFingerprint:policy.fingerprint};
      if (byDistance) {
        const routeMeters=path.slice(1).reduce((sum,id,i)=>sum+policy.distanceMeters[edgeKey(path[i],id)],0);
        Object.assign(transportCost,{distanceKm:routeMeters/1000,freshDistanceKm:freshMeters/1000,
          constructionDistanceKm:constructionMeters/1000,...DISTANCE_TRANSPORT_PRICES});
      }
    } else cost=fresh.size*CATALOG.connect.cost;
  } else {
    const facility=input.facilities.find(f=>f.id===action.facilityId);
    if (!facility) throw new Error('Сначала выберите существующий объект');
    if (facility.level>=2) throw new Error('Объект уже расширен');
    cost=CATALOG[facility.type].upgradeCost;
  }
  if (cost>input.budget+1e-8) throw new Error(`Не хватает бюджета: нужно ${cost} млн ₽`);
  const state=clone(input);
  state.revision++; state.budget=money(state.budget-cost); state.spent=money(state.spent+cost);
  state.actions.push(action);
  if (towerPositions) {
    for (const [index,position] of towerPositions.entries()) {
      let id=action.type==='tower'?`tower:${state.revision}`:`tower:${state.revision}:${index}`;
      while (state.towers.some(t=>t.id===id)) id+=':new';
      state.towers.push({id,lat:position.lat,lon:position.lon,radiusKm:towerSpec(input).radiusKm});
    }
  }
  if (action.type==='build') {
    let id=`facility:${state.revision}`;
    while (state.facilities.some(f=>f.id===id)) id+=':new';
    state.facilities.push({id,type:action.service,settlementId:action.settlementId,level:1,capacityUnits:newFacilityCapacity(world,scenario,action.service,action.settlementId)});
  }
  if (action.type==='connect' || action.type==='connect-network') state.routes.push({from:action.from,to:network?.joinId || action.to,path,
    ...(action.stopIds?{stopIds:[...action.stopIds]}:{})});
  if (action.type==='upgrade') {
    const f=state.facilities.find(f=>f.id===action.facilityId);
    const extra=isPopulationSocialScenario(scenario)?socialUpgradeCapacity(world,f.type,f.settlementId):Math.round(CATALOG[f.type].capacityUnits*.8);
    if (!Number.isSafeInteger(extra) || extra<0) throw new Error('Некорректная мощность расширения');
    f.level=2; f.capacityUnits+=extra;
    if (!Number.isSafeInteger(f.capacityUnits)) throw new Error('Некорректная мощность расширения');
  }
  const result=summarize(world,scenario,state);
  state.assignments=result.assignments; state.tutorialStep=result.evaluation.tutorialStep;
  const coverage=towerPositions && usesGeographicTelecom(input.rulesVersion) ? towerCoverage(world,towerPositions,towerSpec(input).radiusKm) : null;
  return {action,cost,nextState:state,evaluation:result.evaluation,...(path?{path}:{}),
    ...(transportCost?{transportCost}:{}),
    ...(network?{freshPath:network.freshPath,edgeKeys:network.edgeKeys,freshEdgeKeys:network.freshEdgeKeys,joinId:network.joinId,
      requestedTo:network.requestedTo,...(network.targetEdge?{targetEdge:network.targetEdge}:{}),
      ...(network.legs?{legs:network.legs,stopIds:network.stopIds}:{})}:{}),
    ...(towerPositions?{coverageIds:world.rows.filter((r,i)=>positive(r)&&(coverage?coverage[i]:towerPositions.some(position=>haversine(position,r)<=towerSpec(input).radiusKm+1e-9))).map(r=>r.id)}:{})};
}

export function preview(world,scenario,state,action) {
  try {
    const result=reducer(world,scenario,state,action), before=evaluate(world,scenario,state),delta={};
    const scope=scenario.kind==='intro'?new Set(scenario.targetIds):
      Array.isArray(scenario.playableSettlementIds)?new Set(scenario.playableSettlementIds):null;
    for (const service of SERVICES) {
      const newlyFullIds=[],improvedIds=[];let people=0;
      for (const row of world.rows) {
        if (scope && !scope.has(row.id)) continue;
        const a=before.byId[row.id][service],b=result.evaluation.byId[row.id][service];
        if (b.served>a.served) {
          improvedIds.push(row.id); people+=(b.served-a.served)/b.demand*row.population;
          if (!a.full && b.full) newlyFullIds.push(row.id);
        }
      }
      delta[service]={newlyFullIds,improvedIds,people:Math.round(people)};
    }
    return {ok:true,baseRevision:state.revision,...result,delta};
  } catch (error) {
    let attempted=null;
    try {attempted=clone(action);} catch { /* An invalid non-JSON action is still a normal preview error. */ }
    return {ok:false,error:error.message,baseRevision:state?.revision,action:attempted};
  }
}

export function apply(world,scenario,state,action) {return reducer(world,scenario,state,action).nextState;}

export function exportSave(state) {
  const version=engineRulesVersions.indexOf(state?.rulesVersion)+1;
  if (!version) throw new Error('Неизвестная версия правил');
  if (state.scenarioVersion!==version) throw new Error('Неизвестная версия сценария');
  if (state.rulesVersion!==RULES_VERSION && (state.transportPolicyVersion!==(version>=3?'transport-policy-v2':'transport-policy-v1') ||
      !/^sha256:[0-9a-f]{64}$/.test(state.transportPolicyFingerprint||''))) throw new Error('Неизвестные транспортные условия');
  if (usesGeographicTelecom(state.rulesVersion)) checkTelecomPlanIdentity(state);
  if (state.rulesVersion===SOCIAL_RULES_VERSION) {checkSocialPolicyIdentity(state);checkDifficulty(state);}
  const initialNetwork=checkInitialTowerPolicyIdentity(state);
  if (typeof state.dataVersion!=='string' || !/^source-v1-[0-9a-f]{16}$/.test(state.dataVersion)) throw new Error('Неизвестная версия исходных данных');
  if (!Number.isInteger(state.tutorialStep) || state.tutorialStep<0 || state.tutorialStep>totalTutorialSteps(state)) throw new Error('Некорректный шаг обучения');
  const extendedActions=state.actions.some(action=>action.type==='tower-batch' || action.stopIds!==undefined || action.outreachPolicyVersion!==undefined);
  // Only the action log is authoritative. No imported balance or allocations.
  return clone({rulesVersion:initialNetwork?INITIAL_NETWORK_SAVE_RULES_VERSION:extendedActions?SERIALIZED_ACTIONS_RULES_VERSION:state.rulesVersion,
    ...(initialNetwork||extendedActions?{engineRulesVersion:state.rulesVersion}:{}),
    ...(initialNetwork?{initialTowerPolicyVersion:state.initialTowerPolicyVersion,
      initialTowerPolicyFingerprint:state.initialTowerPolicyFingerprint}:{}),
    dataVersion:state.dataVersion,scenarioId:state.scenarioId,scenarioVersion:state.scenarioVersion,
    regionId:state.regionId,owner:state.owner,actions:state.actions,tutorialStep:state.tutorialStep,
    ...(state.rulesVersion!==RULES_VERSION?{transportPolicyVersion:state.transportPolicyVersion,
      transportPolicyFingerprint:state.transportPolicyFingerprint}:{}),
    ...(usesGeographicTelecom(state.rulesVersion)?{telecomPlanVersion:state.telecomPlanVersion,
      telecomPlanFingerprint:state.telecomPlanFingerprint}:{}),
    ...(state.rulesVersion===SOCIAL_RULES_VERSION?{difficulty:state.difficulty,socialPolicyVersion:state.socialPolicyVersion,
      socialPolicyFingerprint:state.socialPolicyFingerprint}:{})});
}

export function restore(world,scenario,save) {
  if (save?.rulesVersion===INITIAL_NETWORK_SAVE_RULES_VERSION) {
    if (save.engineRulesVersion!==SOCIAL_RULES_VERSION || save.scenarioVersion!==5 || !hasInitialTowerPolicy(save))
      throw new Error('Неизвестная версия исходной сети связи');
    save={...save,rulesVersion:save.engineRulesVersion};
    delete save.engineRulesVersion;
    checkInitialTowerPolicyIdentity(save);
  } else if (hasInitialTowerPolicy(save)) {
    throw new Error('Некорректные условия исходной сети связи');
  } else if (save?.rulesVersion===SERIALIZED_ACTIONS_RULES_VERSION) {
    const version=engineRulesVersions.indexOf(save.engineRulesVersion)+1;
    if (!version || save.scenarioVersion!==version) throw new Error('Неизвестная версия правил журнала действий');
    // Normalize only a local copy, then run every ordinary source/policy/owner
    // check and replay. The wrapper never substitutes a scenario or its prices.
    save={...save,rulesVersion:save.engineRulesVersion};
    delete save.engineRulesVersion;
  } else if (save?.engineRulesVersion!==undefined) throw new Error('Некорректная версия правил журнала действий');
  checkState(world,scenario,save);
  if (typeof save.owner!=='string' || !save.owner || save.owner.length>200) throw new Error('Некорректный владелец сохранения');
  if (!Array.isArray(save.actions) || save.actions.length>10000) throw new Error('Некорректный или слишком большой журнал действий');
  if (!Number.isInteger(save.tutorialStep) || save.tutorialStep<0 || save.tutorialStep>totalTutorialSteps(scenario)) throw new Error('Некорректный шаг обучения в сохранении');
  let state=createState(world,scenario,{owner:save.owner});
  // Unmarked outreach actions predate road validation. Replay them exactly;
  // public preview/apply always use the current rule for subsequent actions.
  for (const action of save.actions) state=reducer(world,scenario,state,action,{replay:true}).nextState;
  if (state.tutorialStep!==save.tutorialStep) throw new Error('Шаг обучения сохранения не соответствует журналу действий');
  return state;
}

export function undo(world,scenario,state) {
  checkState(world,scenario,state);
  if (!state.actions.length) return clone(state);
  // The shorter log has its own derived tutorial metadata. Do not feed the old
  // step into the public importer, which deliberately rejects mismatches.
  let previous=createState(world,scenario,{owner:state.owner});
  for (const action of state.actions.slice(0,-1)) previous=reducer(world,scenario,previous,action,{replay:true}).nextState;
  return previous;
}

export function tutorialInstruction(world,scenario,state) {
  checkState(world,scenario,state);
  if (scenario.kind!=='intro') return {step:0,title:scenario.title,hint:'Дополните условную сеть региона до полного обслуживания.',tool:null,locked:false,complete:false};
  if (state.actions.length<3) {
    const instruction=clone(steps(scenario)[state.actions.length]);
    delete instruction.action; delete instruction.toleranceKm;
    return {...instruction,step:state.actions.length,locked:true,complete:false};
  }
  const evaluation=evaluate(world,scenario,state),complete=evaluation.tutorialStep===totalTutorialSteps(scenario);
  if (scenario.rulesVersion===SOCIAL_RULES_VERSION) return {step:evaluation.tutorialStep,
    title:complete?'Все четыре направления — 100%':'Теперь самостоятельно',
    hint:complete?'Связь, медицина, образование и досуг доступны всем семи поселениям. Учебное задание выполнено.':
      'Доведите связь, медицину, образование и досуг до 100%. Найдите оставшийся дефицит и сравните результат до подтверждения.',
    tool:complete?null:evaluation.tutorialStep===3?'tower':evaluation.tutorialStep===4?'connect':'culture',locked:false,complete};
  return {step:evaluation.tutorialStep,title:complete?'Вводное задание выполнено':'Теперь самостоятельно',
    hint:complete?'Вы достроили учебный фрагмент. Полный регион доступен отдельно.':'Найдите оставшиеся поселения без связи и медицинского обслуживания.',
    tool:complete?null:evaluation.tutorialStep===3?'tower':'connect',locked:false,complete};
}
