/** Read-only, deterministic geometry/policy certificate. Not a gameplay solver or human timing test. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {haversine} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {FEDERAL_CITIES,combineFederalBoundary} from '../site/apps/settlements/runtime/assets/js/settlements/v24/federal-cities.mjs';
import {SOCIAL_PLAN_INDEX} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans-regions/index.mjs';
import {INITIAL_TOWER_POLICY_VERSION,INITIAL_TOWER_MIN_DISTANCE_KM,spacedInitialTowerSeeds} from '../site/apps/settlements/runtime/assets/js/settlements/v24/initial-tower-spacing.mjs';
import {pointInBoundary} from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';

const root=new URL('../',import.meta.url),runtime=new URL('site/apps/settlements/runtime/',root);
const data=new URL('data/settlements/v1/',runtime),plans=new URL('assets/js/settlements/v24/social-plans-regions/',runtime);
const output=new URL('artifacts/tower-spacing/',root),read=async p=>JSON.parse(await readFile(p,'utf8'));
const argument=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const requireRoadWitness=process.argv.includes('--require-road-witness');
const spacing=Number(argument('--spacing')||18),radius=10,towerCost=.2,runId=randomUUID(),startedAt=new Date().toISOString();
assert.ok(Number.isFinite(spacing)&&spacing>0);
assert.equal(spacing,INITIAL_TOWER_MIN_DISTANCE_KM,'This run must audit the actual runtime spacing');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>createHash('sha256').update(v).digest('hex');
const fingerprint=({fingerprint,...v})=>'sha256:'+sha(JSON.stringify(canonical(v)));
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const valid=row=>Number.isFinite(row.population)&&row.population>0&&Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&Math.abs(row.lat)<=90&&Math.abs(row.lon)<=180;
const round=n=>Math.round(n*1e6)/1e6;
const money=n=>Math.round(n*10)/10;
const Earth=6371.0088;
function cellIndex(range){
  const size=2*Earth*Math.sin((range+1e-8)/(2*Earth)),cells=new Map();
  const key=row=>{const lat=row.lat*Math.PI/180,lon=row.lon*Math.PI/180;return [Earth*Math.cos(lat)*Math.cos(lon),Earth*Math.cos(lat)*Math.sin(lon),Earth*Math.sin(lat)].map(x=>Math.floor(x/size));};
  return {
    insert(row){const k=key(row).join(',');if(!cells.has(k))cells.set(k,[]);cells.get(k).push(row);},
    nearby(row){const k=key(row),found=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const other of cells.get(`${k[0]+x},${k[1]+y},${k[2]+z}`)||[])if(haversine(row,other)<=range+1e-9)found.push(other);return found;}
  };
}
function choose(candidates){
  const retained=[],removed=[];
  for(const row of candidates.toSorted((a,b)=>b.population-a.population||cmp(a.id,b.id))){
    // Independent O(n*k) exhaustive reference, with no runtime grid/cache.
    if(retained.some(other=>haversine(row,other)<spacing-1e-9))removed.push(row);else retained.push(row);
  }
  return {retained,removed};
}
function pairStats(rows){
  let minimum=null,closePairs=0,overlapPairs=0;
  for(let i=0;i<rows.length;i++)for(let j=0;j<i;j++){
    const d=haversine(rows[i],rows[j]);minimum=minimum===null?d:Math.min(minimum,d);
    if(d<spacing-1e-9)closePairs++;
    if(d<2*radius-1e-9)overlapPairs++;
  }
  return {minimumKm:minimum===null?null:round(minimum),pairsBelowSpacing:closePairs,overlapPairs};
}
function coverage(index,towers){const covered=new Map();for(const row of towers)for(const other of index.nearby(row))covered.set(other.id,other.population);return {settlements:covered.size,population:[...covered.values()].reduce((a,b)=>a+b,0),ids:new Set(covered.keys())};}
const records=[],manifest=await read(new URL('manifest.json',data)),fileHashes={};
const policyFile=new URL('assets/js/settlements/v24/initial-tower-spacing.mjs',runtime),policyShaAtStart=sha(await readFile(policyFile));
const engineFile=new URL('assets/js/settlements/v24/engine.mjs',runtime),engineShaAtStart=sha(await readFile(engineFile));
await mkdir(new URL('certificates/',output),{recursive:true});
for(const metadata of manifest.regions){
  const packBytes=await readFile(new URL(metadata.path,data));
  const pack=JSON.parse(packBytes),rows=[...pack.settlements,...(FEDERAL_CITIES[metadata.id]?.rows||[])].filter(valid);
  const ranked=rows.toSorted((a,b)=>b.population-a.population||cmp(a.id,b.id)),byId=new Map(rows.map(row=>[row.id,row])),index=cellIndex(radius);
  const boundaryBytes=await readFile(new URL(`boundaries/${metadata.id}.geojson`,data));
  const cityBytes=FEDERAL_CITIES[metadata.id]?await readFile(new URL(`assets/geodata/federal-cities/${FEDERAL_CITIES[metadata.id].boundaryFile}`,runtime)):null;
  const boundary=combineFederalBoundary(JSON.parse(boundaryBytes),cityBytes?JSON.parse(cityBytes):null),insideCache=new Map();
  const inside=row=>{if(!insideCache.has(row.id))insideCache.set(row.id,pointInBoundary(boundary,row.lat,row.lon));return insideCache.get(row.id);};
  rows.forEach(row=>index.insert(row));let previous=null;
  for(const difficulty of ['hard','normal','easy']){
    const planFile=new URL(`${metadata.id}-${difficulty}.json.gz`,plans),planBytes=await readFile(planFile),plan=JSON.parse(gunzipSync(planBytes));
    assert.equal(plan.fingerprint,SOCIAL_PLAN_INDEX[`${metadata.id}/${difficulty}`]);assert.equal(fingerprint(plan),plan.fingerprint);assert.equal(fingerprint(plan.telecom),plan.telecom.fingerprint);
    assert.equal(plan.telecom.radiusKm,radius);
    const ids=plan.telecom.initialSeedIds,candidates=ids.map(id=>byId.get(id));
    assert.ok(candidates.every(Boolean));assert.deepEqual(ids,ranked.slice(0,ids.length).map(row=>row.id));
    assert.ok(candidates.every(row=>row.population>=plan.telecom.initialPopulationThreshold));
    const reference=choose(candidates),actual=spacedInitialTowerSeeds({region:pack.region,rows},ids,radius);
    assert.deepEqual(actual.seedIds,reference.retained.map(row=>row.id).sort(cmp),'Runtime grid must match exhaustive reference');
    const repeat=spacedInitialTowerSeeds({region:pack.region,rows:rows.toReversed()},ids.toReversed(),radius);
    assert.deepEqual(actual,repeat,'Input-order repeat on a fresh world must be identical, not an independent trial');
    const retained=actual.seedIds.map(id=>byId.get(id)),removed=reference.removed;
    const outsideRestoration=removed.filter(row=>!inside(row));
    // The actual 3.4 reducer accepts exact positive source coordinates even
    // when the generalized polygon excludes them. canonicalAction does not
    // round lat/lon. Thus these original seed actions use that explicit rule.
    const unplaceable=outsideRestoration.filter(row=>!rows.some(source=>valid(source)&&source.lat===row.lat&&source.lon===row.lon));
    assert.equal(unplaceable.length,0,'Source-point exception must admit every restoration tower');
    if(previous)assert.ok(previous.every(id=>retained.some(row=>row.id===id)),'Difficulty prefixes must produce nested retained sets');
    previous=retained.map(row=>row.id);
    const oldPairs=pairStats(candidates),newPairs=pairStats(retained);assert.equal(newPairs.pairsBelowSpacing,0);
    const before=coverage(index,candidates),after=coverage(index,retained),centres=plan.referenceActions.filter(action=>action.type==='tower');
    const restored=coverage(index,[...retained,...removed]);assert.equal(restored.settlements,before.settlements);assert.equal(restored.population,before.population);
    const referenceUnion=coverage(index,[...retained,...removed,...centres]);assert.equal(referenceUnion.settlements,rows.length,'Restored original seed union plus source reference towers must cover all positive source settlements');
    const addedCost=money(removed.length*towerCost),reserve=money(plan.initialBudget-plan.metadata.expectedReferenceCost),afterReference=money(reserve-addedCost);
    let roadCertificate=null;
    try{
      const roadBytes=await readFile(new URL(`artifacts/settlements-road-routes/alternatives/${metadata.id}-${difficulty}.json`,root));
      const road=JSON.parse(roadBytes),remaining=money(plan.initialBudget-road.cost-addedCost);
      roadCertificate={artifactSha256:sha(roadBytes),cost:road.cost,addedTowerCost:addedCost,remaining,withinBudget:remaining>=0,actions:road.actionCount+removed.length,priorFullEngineVerified:road.engineVerified?.status==='pass'};
      assert.equal(road.region,metadata.id);assert.equal(road.difficulty,difficulty);assert.equal(road.initialBudget,plan.initialBudget);
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const record={region:metadata.id,difficulty,positiveSettlements:rows.length,sourceTowers:candidates.length,retainedTowers:retained.length,removedTowers:removed.length,oldPairs,newPairs,
      before:{settlements:before.settlements,population:before.population},after:{settlements:after.settlements,population:after.population},lostSettlements:before.settlements-after.settlements,lostPopulation:before.population-after.population,
      sourceBudget:plan.initialBudget,sourceReferenceCost:plan.metadata.expectedReferenceCost,reserve,addedCost,addedCostToReserve:reserve?addedCost/reserve:null,remainingAfterReference:afterReference,referenceAffordable:afterReference>=0,
      sourceReferenceActions:plan.referenceActions.length,witnessActions:plan.referenceActions.length+removed.length,referenceTelecomCoverageComplete:true,roadCertificate,planFingerprint:plan.fingerprint,
      sourcePackSha256:sha(packBytes),sourcePlanGzipSha256:sha(planBytes),runtimePolicyFingerprint:actual.fingerprint,
      restorationPlacement:{insideBoundary:removed.length-outsideRestoration.length,outsideBoundarySourceException:outsideRestoration.length,outsideSourceIds:outsideRestoration.map(row=>row.id),unplaceable:unplaceable.length,
        basis:'Actual pointInBoundary on combined supplied subject/federal polygons; geographic 3.4 reducer explicitly permits exact valid positive source coordinates outside the polygon.',boundarySha256:sha(boundaryBytes),federalBoundarySha256:cityBytes?sha(cityBytes):null}};
    records.push(record);
    // Tower actions have no positive-gain requirement, may use exact inhabited
    // source coordinates, cost .2 each. Prepended restoration preserves the old
    // geographic union; any later facility:N upgrade IDs must be offset/remapped.
    await writeFile(new URL(`certificates/${metadata.id}-${difficulty}.json`,output),JSON.stringify({...record,retainedIds:retained.map(row=>row.id),restorationTowerActions:removed.map(({lat,lon})=>({type:'tower',lat,lon}))})+'\n');
  }
  console.log(JSON.stringify({region:metadata.id,profiles:records.length,counts:records.slice(-3).map(r=>[r.difficulty,r.sourceTowers,r.retainedTowers])}));
}
assert.equal(sha(await readFile(policyFile)),policyShaAtStart,'Runtime policy changed while audit was running');
assert.equal(sha(await readFile(engineFile)),engineShaAtStart,'Engine changed while audit was running');
for(const file of ['scripts/audit-settlements-tower-spacing.mjs','site/apps/settlements/runtime/assets/js/settlements/v24/initial-tower-spacing.mjs','site/apps/settlements/runtime/assets/js/settlements/v24/telecom-policy.mjs','site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs','site/apps/settlements/runtime/assets/js/settlements/v24/social-plans-regions/index.mjs'])fileHashes[file]=sha(await readFile(new URL(file,root)));
const sum=(arr,key)=>arr.reduce((s,r)=>s+r[key],0),median=values=>{const sorted=values.toSorted((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
const report={status:'pass',runId,startedAt,finishedAt:new Date().toISOString(),sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),fileHashes,
  method:'Actual runtime population-descending / ID-ascending greedy selection from validated authored seed prefixes, compared with an independent exhaustive reference; every pair independently checked by haversine. Input reversal on fresh worlds repeats are reproducibility checks, not independent trials.',runtimePolicyVersion:INITIAL_TOWER_POLICY_VERSION,
  kind:'All-region geometry and reference-restoration cost certificate. No full engine simulation, no new student observations, no claim of human difficulty or duration.',
  spacingKm:spacing,radiusKm:radius,maxPairOverlapFraction:spacing>=2*radius?0:(2*radius**2*Math.acos(spacing/(2*radius))-.5*spacing*Math.sqrt(4*radius**2-spacing**2))/(Math.PI*radius**2),
  profiles:records.length,regions:manifest.regions.length,totalSourceTowers:sum(records,'sourceTowers'),totalRetainedTowers:sum(records,'retainedTowers'),totalRemovedTowers:sum(records,'removedTowers'),
  minimumRetainedSpacingKm:Math.min(...records.map(r=>r.newPairs.minimumKm).filter(v=>v!==null)),spacingViolations:records.filter(r=>r.newPairs.pairsBelowSpacing),
  referenceUnaffordable:records.filter(r=>!r.referenceAffordable),roadWitnessMissing:records.filter(r=>!r.roadCertificate),roadWitnessUnaffordable:records.filter(r=>r.roadCertificate&&!r.roadCertificate.withinBudget),
  roadWitnessRequired:requireRoadWitness,roadWitnessStatus:records.some(r=>!r.roadCertificate)?'not-run':records.some(r=>!r.roadCertificate.withinBudget)?'fail':'pass',
  restorationPlacement:{insideBoundary:records.reduce((s,r)=>s+r.restorationPlacement.insideBoundary,0),outsideBoundarySourceException:records.reduce((s,r)=>s+r.restorationPlacement.outsideBoundarySourceException,0),outsideUniqueSourceIds:new Set(records.flatMap(r=>r.restorationPlacement.outsideSourceIds)).size,affectedProfiles:records.filter(r=>r.restorationPlacement.outsideBoundarySourceException).length,unplaceable:records.reduce((s,r)=>s+r.restorationPlacement.unplaceable,0)},
  maximumExtraReserveFraction:Math.max(...records.map(r=>r.addedCostToReserve||0)),maximumWitnessActions:Math.max(...records.map(r=>r.witnessActions)),
  byDifficulty:['easy','normal','hard'].map(difficulty=>{const a=records.filter(r=>r.difficulty===difficulty);return {difficulty,profiles:a.length,sourceTowers:sum(a,'sourceTowers'),retainedTowers:sum(a,'retainedTowers'),medianSource:median(a.map(r=>r.sourceTowers)),medianRetained:median(a.map(r=>r.retainedTowers)),medianLostSettlementPercentagePoints:median(a.map(r=>100*r.lostSettlements/r.positiveSettlements)),minimumReferenceRemaining:Math.min(...a.map(r=>r.remainingAfterReference)),minimumRoadWitnessRemaining:Math.min(...a.filter(r=>r.roadCertificate).map(r=>r.roadCertificate.remaining))};}),
  highlights:records.filter(r=>['respublika_bashkortostan','altayskiy_kray'].includes(r.region)),records};
report.status=report.referenceUnaffordable.length||report.roadWitnessUnaffordable.length||requireRoadWitness&&report.roadWitnessMissing.length?'fail':'pass';
// Missing local witness files do not certify road legality. CI first generates
// them with audit-settlements-road-routes.mjs --alternatives, then requires all.
await writeFile(new URL(`audit-${spacing}km.json`,output),JSON.stringify(report,null,2)+'\n');
assert.equal(report.referenceUnaffordable.length,0,'Tower restoration plus the authored reference exceeds a scenario budget');
assert.equal(report.roadWitnessUnaffordable.length,0,'Tower restoration plus a road witness exceeds a scenario budget');
if(requireRoadWitness)assert.equal(report.roadWitnessMissing.length,0,'Required road witness artifacts are missing; generate them with audit-settlements-road-routes.mjs --alternatives');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report).filter(([k])=>!['records','highlights','fileHashes'].includes(k)))));
