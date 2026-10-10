/** Read-only geographic audit of the supplied polygons and canonical source rows.
 * No population/coordinate edits, no claims that an outside source record is false. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {World} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {FEDERAL_CITIES,appendFederalCities,combineFederalBoundary} from '../site/apps/settlements/runtime/assets/js/settlements/v24/federal-cities.mjs';
import {pointInBoundary} from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';

const root=new URL('../',import.meta.url),runtime=new URL('site/apps/settlements/runtime/',root),data=new URL('data/settlements/v1/',runtime);
const argument=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const verifyRuntime=process.argv.includes('--verify-runtime');
const scopeModule=verifyRuntime?await import('../site/apps/settlements/runtime/assets/js/settlements/v24/region-playability.mjs'):null;
const output=new URL(argument('--output')||`artifacts/boundaries-20261010/${verifyRuntime?'audit-runtime':'audit'}.json`,root);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),radians=Math.PI/180,earthKm=6371.0088;
const files={},readJSON=async relative=>{const bytes=await readFile(new URL(relative,runtime));files[relative]=sha(bytes);return JSON.parse(bytes);};
const polygons=geometry=>{
  if(geometry.type==='FeatureCollection')return geometry.features.flatMap(polygons);
  if(geometry.type==='Feature')return polygons(geometry.geometry);
  if(geometry.type==='GeometryCollection')return geometry.geometries.flatMap(polygons);
  if(geometry.type==='Polygon')return [geometry.coordinates];
  if(geometry.type==='MultiPolygon')return geometry.coordinates;
  throw new Error(`Unsupported polygon geometry: ${geometry.type}`);
};
// Independently precompile rings and use winding-number inclusion. Unwrap each
// ring continuously before translating the queried longitude to its branch.
function compileRing(raw){
  const points=[];
  for(const [longitude,latitude] of raw){let x=longitude;if(points.length){const previous=points.at(-1)[0];while(x-previous>180)x-=360;while(x-previous< -180)x+=360;}points.push([x,latitude]);}
  return {points,center:points.reduce((sum,p)=>sum+p[0],0)/points.length,minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))};
}
function inRing(ring,latitude,longitude){
  if(latitude<ring.minY-1e-9||latitude>ring.maxY+1e-9)return false;
  let x=longitude;while(x-ring.center>180)x-=360;while(x-ring.center< -180)x+=360;
  let winding=0;
  for(let i=0;i<ring.points.length;i++){
    const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],cross=(b[0]-a[0])*(latitude-a[1])-(x-a[0])*(b[1]-a[1]);
    if(Math.abs(cross)<1e-9&&x>=Math.min(a[0],b[0])-1e-9&&x<=Math.max(a[0],b[0])+1e-9&&latitude>=Math.min(a[1],b[1])-1e-9&&latitude<=Math.max(a[1],b[1])+1e-9)return true;
    if(a[1]<=latitude&&b[1]>latitude&&cross>0)winding++;
    if(a[1]>latitude&&b[1]<=latitude&&cross<0)winding--;
  }
  return winding!==0;
}
const inCompiled=(compiled,row)=>compiled.some(rings=>inRing(rings[0],row.lat,row.lon)&&!rings.slice(1).some(ring=>inRing(ring,row.lat,row.lon)));
const vector=([lon,lat])=>[Math.cos(lat*radians)*Math.cos(lon*radians),Math.cos(lat*radians)*Math.sin(lon*radians),Math.sin(lat*radians)];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const angle=(a,b)=>Math.atan2(Math.hypot(...cross(a,b)),dot(a,b));
function distanceToBoundaryKm(boundaryPolygons,row){
  const p=vector([row.lon,row.lat]);let nearest=Infinity;
  for(const polygon of boundaryPolygons)for(const ring of polygon)for(let i=0;i<ring.length;i++){
    const a=vector(ring[i]),b=vector(ring[(i+1)%ring.length]);nearest=Math.min(nearest,angle(p,a),angle(p,b));
    const normal=cross(a,b),norm=Math.hypot(...normal);if(norm<1e-14)continue;
    const n=normal.map(v=>v/norm),projection=p.map((v,j)=>v-dot(p,n)*n[j]),length=Math.hypot(...projection);if(length<1e-14)continue;
    const q=projection.map(v=>v/length),arc=angle(a,b);
    for(const sign of [1,-1]){const candidate=q.map(v=>v*sign);if(Math.abs(angle(a,candidate)+angle(candidate,b)-arc)<1e-8)nearest=Math.min(nearest,angle(p,candidate));}
  }
  return Math.round(nearest*earthKm*1e6)/1e6;
}
const valid=row=>Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&Math.abs(row.lat)<=90&&Math.abs(row.lon)<=180;
const countBy=values=>values.reduce((totals,value)=>({...totals,[value]:(totals[value]||0)+1}),{});
const identityPaths=['assets/js/settlements/v2/engine.mjs','assets/js/settlements/v24/engine.mjs','assets/js/settlements/v24/federal-cities.mjs','assets/js/settlements/v24/game.mjs'];
if(verifyRuntime)identityPaths.push('assets/js/settlements/v24/region-playability.mjs');
const sourceAtStart=Object.fromEntries(await Promise.all(identityPaths.map(async path=>[path,sha(await readFile(new URL(path,runtime)))])));
const startedAt=new Date().toISOString(),runId=randomUUID(),manifest=await readJSON('data/settlements/v1/manifest.json'),records=[];
for(const metadata of manifest.regions){
  const pack=await readJSON(`data/settlements/v1/${metadata.path}`),network=await readJSON(`data/settlements/v1/transport/${metadata.id}.json`);
  const world=appendFederalCities(new World(pack,network)),base=await readJSON(`data/settlements/v1/boundaries/${metadata.id}.geojson`);
  const city=FEDERAL_CITIES[metadata.id],cityBoundary=city?await readJSON(`assets/geodata/federal-cities/${city.boundaryFile}`):null;
  const boundary=combineFederalBoundary(base,cityBoundary),rawPolygons=polygons(boundary),compiled=rawPolygons.map(polygon=>polygon.map(compileRing));
  const all=world.rows.filter(valid),inhabited=all.filter(row=>row.population>0),outsideAll=all.filter(row=>!inCompiled(compiled,row));
  const outside=outsideAll.filter(row=>row.population>0),runtimeMismatch=[];
  for(const row of all){const independent=inCompiled(compiled,row),actual=pointInBoundary(boundary,row.lat,row.lon);if(independent!==actual)runtimeMismatch.push({id:row.id,independent,actual});}
  const examples=outside.map(row=>({id:row.id,name:row.name,municipality:row.municipality,lat:row.lat,lon:row.lon,population:row.population,quality:row.quality,distanceToBoundaryKm:distanceToBoundaryKm(rawPolygons,row)}));
  let runtimeScope=null;
  if(verifyRuntime){
    const snapshot=()=>JSON.stringify({rows:world.rows,valid:world.valid,ids:[...world.ids],walk:world.walk,drive:world.drive,region:world.region});
    const before=snapshot(),scenario={kind:'free',boundary,metadata:{audit:true}},inputScenario=JSON.stringify(scenario);
    const scoped=scopeModule.withPlayableRegionScope(world,scenario),playable=scopeModule.playableRows(world,scoped),inside=all.filter(row=>inCompiled(compiled,row));
    const expectedIds=inside.map(row=>row.id),expectedTargets=inside.filter(row=>Number.isFinite(row.population)&&row.population>0).map(row=>row.id).sort();
    assert.deepEqual(scoped.playableSettlementIds,expectedIds,`${metadata.id}: scope must exactly match independent full-geometry inclusion`);
    assert.deepEqual(playable.map(row=>row.id),expectedIds,`${metadata.id}: visible rows must include all inside zero/unknown/positive rows`);
    assert.deepEqual(scoped.targetIds,expectedTargets,`${metadata.id}: completion targets must be exactly all inside positive finite populations`);
    for(const row of world.rows){const expected=valid(row)&&inCompiled(compiled,row);assert.equal(scopeModule.isPlayableSettlement(scoped,row.id),expected,`${metadata.id}: ${row.id} membership`);}
    assert.equal(scoped.metadata.excludedSettlementCount,world.rows.length-inside.length);
    assert.equal(scoped.metadata.audit,true,'Existing scenario metadata must survive');
    assert.equal(JSON.stringify(scenario),inputScenario,'Input scenario must not be mutated');
    const intro={kind:'intro',boundary,metadata:{audit:true}};
    assert.equal(scopeModule.withPlayableRegionScope(world,intro),intro,'Tutorial scenario must remain unchanged');
    assert.equal(scopeModule.playableRows(world,intro),world.valid,'Tutorial rows must remain the original valid source rows');
    assert.equal(snapshot(),before,`${metadata.id}: canonical rows, coordinates, population, indices and graph changed`);
    runtimeScope={status:'pass',playableRows:playable.length,targetRows:scoped.targetIds.length,excludedRows:world.rows.length-playable.length,excludedPositiveRows:inhabited.length-scoped.targetIds.length,remainingOutsideRows:playable.filter(row=>!inCompiled(compiled,row)).length,canonicalWorldBeforeSha256:sha(before),canonicalWorldAfterSha256:sha(snapshot()),tutorialUnchanged:true};
  }
  records.push({region:metadata.id,title:world.region.name,totalRows:world.rows.length,validRows:all.length,positiveRows:inhabited.length,outsideRows:outsideAll.length,outsidePositiveRows:outside.length,sourcePositionCounts:countBy(all.map(row=>row.quality?.position||'missing')),outsidePositionCounts:countBy(outsideAll.map(row=>row.quality?.position||'missing')),federalCity:city?.id||null,federalRows:city?.rows.length||0,polygons:rawPolygons.length,holes:rawPolygons.reduce((s,p)=>s+p.length-1,0),runtimeMismatch,runtimeScope,outside:examples,outsideAllIds:outsideAll.map(row=>row.id)});
  console.log(JSON.stringify({region:metadata.id,positive:inhabited.length,outsidePositive:outside.length,outsideAll:outsideAll.length,runtimeMismatch:runtimeMismatch.length}));
}
const sourceAtEnd=Object.fromEntries(await Promise.all(identityPaths.map(async path=>[path,sha(await readFile(new URL(path,runtime)))])));
const sourceStable=JSON.stringify(sourceAtStart)===JSON.stringify(sourceAtEnd),mismatches=records.flatMap(record=>record.runtimeMismatch.map(m=>({region:record.region,...m})));
const report={status:mismatches.length||!sourceStable?'fail':'pass',runId,startedAt,finishedAt:new Date().toISOString(),sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceStable,sourceAtStart,sourceAtEnd,scriptSha256:sha(await readFile(new URL(import.meta.url))),sourceFileHashes:files,
  method:'Canonical World plus all federal-city rows; full supplied subject/city Polygon/MultiPolygon exterior and hole rings. Independent winding-number inclusion compared with runtime ray crossing on every valid source row. Dateline rings unwrapped continuously. Distances use nearest minor great-circle segment on a sphere (R=6371.0088 km); source GeoJSON coordinates and historic populations are unchanged.',
  scope:'Outside means outside the supplied game geometry; it does not prove administrative assignment or historical source population is incorrect. No student data, full engine replay or human playtime is part of this audit.',
  runtimeVerification:verifyRuntime?{status:'pass',regions:records.length,playableRows:records.reduce((s,r)=>s+r.runtimeScope.playableRows,0),targetRows:records.reduce((s,r)=>s+r.runtimeScope.targetRows,0),remainingOutsideRows:records.reduce((s,r)=>s+r.runtimeScope.remainingOutsideRows,0),canonicalWorldsPreserved:records.every(r=>r.runtimeScope.canonicalWorldBeforeSha256===r.runtimeScope.canonicalWorldAfterSha256),tutorialWorldsPreserved:records.every(r=>r.runtimeScope.tutorialUnchanged)}:{status:'not-run'},
  regions:records.length,totalRows:records.reduce((s,r)=>s+r.totalRows,0),totalPositiveRows:records.reduce((s,r)=>s+r.positiveRows,0),outsideRows:records.reduce((s,r)=>s+r.outsideRows,0),outsidePositiveRows:records.reduce((s,r)=>s+r.outsidePositiveRows,0),affectedRegions:records.filter(r=>r.outsideRows).length,affectedPositiveRegions:records.filter(r=>r.outsidePositiveRows).length,runtimeMismatches:mismatches,records};
await mkdir(new URL('.',output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report).filter(([k])=>!['records','sourceFileHashes','sourceAtStart','sourceAtEnd'].includes(k)))));
assert.equal(records.length,82);assert.equal(mismatches.length,0,'Independent polygon inclusion differs from runtime');
assert.equal(sourceStable,true,'Runtime sources changed during audit; repeat against a stable candidate');
