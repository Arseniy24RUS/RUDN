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
import {World} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {SERVICES,createState,preview,apply,evaluate,exportSave,restore,undo} from '../site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
import {loadDistanceTransportPolicy} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {loadSocialPlan} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {SOCIAL_PLAN_INDEX} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans-regions/index.mjs';
import {appendFederalCities,FEDERAL_CITIES,combineFederalBoundary} from '../site/apps/settlements/runtime/assets/js/settlements/v24/federal-cities.mjs';
import {createRegionalScenario} from '../site/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';
import {metrics} from '../site/apps/settlements/runtime/assets/js/settlements/v24/platform-rules.mjs';

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
const core=['v2/engine.mjs',...['engine','scenarios','social-policy','social-plans','social-plan-fetch','social-network','network-routing','telecom-policy','telecom-plans','transport-policy-v1','transport-policy-v1.generated','transport-policy-v2','transport-policy-v2.generated','transport-policy-fetch','federal-cities','federal-transport','platform-rules'].map(name=>`v24/${name}.mjs`)].map(p=>`assets/js/settlements/${p}`);
core.push('assets/js/settlements/v24/social-plans-regions/index.mjs');
async function sourceHashes(catalog,paths){const result={};for(const p of paths)result[p]=await hashFile(catalog.runtimeFile(p));return result;}

async function regionRun(id,catalog,output,jobRunId){
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
    let state=createState(world,scenario,{owner:'synthetic:platform-reference'}),evaluation=evaluate(world,scenario,state),previous=null,first90=metrics(evaluation).eligibleForPoints?0:null;
    const initialMetrics=metrics(evaluation),trace=[];
    emit({event:'profile-start',region:id,difficulty,actions:plan.referenceActions.length,initialSettlementsPercent:initialMetrics.settlementsPercent});
    for(const action of plan.referenceActions){
      const result=preview(world,scenario,state,action);assert.equal(result.ok,true,result.error);
      previous=state;state=apply(world,scenario,state,action);assert.deepEqual(state,result.nextState);
      const beforeEvaluation=evaluation;evaluation=result.evaluation;
      let gain=0;for(const service of SERVICES){assert(evaluation.services[service].servedUnits>=beforeEvaluation.services[service].servedUnits);gain+=evaluation.services[service].servedUnits-beforeEvaluation.services[service].servedUnits;}
      assert(gain>0,'Reference action must increase access');assert(state.budget>=0);
      const coverage=metrics(evaluation);if(first90===null&&coverage.eligibleForPoints)first90=state.actions.length;
      trace.push({turn:state.actions.length,action,cost:result.cost,budget:state.budget,settlementsRatio:coverage.settlementsRatio,populationRatio:coverage.populationRatio});
      if(state.actions.length%100===0)emit({event:'progress',region:id,difficulty,actions:state.actions.length,total:plan.referenceActions.length,rssBytes:process.memoryUsage().rss});
    }
    assert.equal(evaluation.complete,true);for(const id of SERVICES){assert.equal(evaluation.services[id].covered,evaluation.services[id].total);assert.equal(evaluation.services[id].servedUnits,evaluation.services[id].demandUnits);}
    assert.equal(state.spent,plan.metadata.expectedReferenceCost);assert(state.budget>=0);
    const save=exportSave(state),restored=restore(world,scenario,JSON.parse(JSON.stringify(save)));assert.deepEqual(restored,state);
    if(previous){const undone=undo(world,scenario,state);assert.deepEqual(undone,previous);assert.deepEqual(apply(world,scenario,undone,state.actions.at(-1)),state);}
    const record={status:'pass',runId,jobRunId,region:id,difficulty,synthetic:true,privilegedReference:true,independentTrials:0,deterministicReferenceRuns:1,humanFunMeasured:false,humanDurationMeasured:false,
      planFingerprint:plan.fingerprint,scenarioId:scenario.id,rulesVersion:state.rulesVersion,dataVersion:state.dataVersion,initialBudget:scenario.initialBudget,initialMetrics,first90Turn:first90,
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
