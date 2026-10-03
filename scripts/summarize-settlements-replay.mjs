/** Fail-closed aggregation of actual CI replay artifacts. Does not replay or generate plans. */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {REPO,DIFFICULTIES,contained,hashFile,loadReplayCatalog,captureCandidateIdentity} from './test-settlements-replay.mjs';
import {SOCIAL_PLAN_INDEX} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plans-regions/index.mjs';
const args=process.argv.slice(2),option=key=>args.includes(key)?args[args.indexOf(key)+1]:null;
assert(option('--input')&&option('--out'),'Use --input artifacts/downloaded --out artifacts/summary.json');
const input=path.resolve(REPO,option('--input')),output=path.resolve(REPO,option('--out'));
assert(output.startsWith(REPO+path.sep)&&!output.startsWith(path.join(REPO,'site')+path.sep),'Summary must be inside repository and outside site');
const read=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const errors=[],records=[],jobs=[],seen=new Set(),reportPaths=[];let identity=null;
async function visit(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){assert(!entry.isSymbolicLink(),'Artifact symlink not permitted');const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else if(entry.name==='replay-report.json')reportPaths.push(file);}}
try{
  const catalog=await loadReplayCatalog();identity=await captureCandidateIdentity(catalog);const expectedIds=catalog.manifest.regions.map(r=>r.id).sort();
  await visit(input);assert(reportPaths.length,'No replay-report.json artifacts found');
  for(const reportPath of reportPaths.sort()){
    const dir=path.dirname(reportPath);try{
      const report=await read(reportPath),exit=await read(path.join(dir,'exit.json'));
      assert.equal(report.status,'pass');assert.equal(report.sourceUnchanged,true);assert.equal(report.plannedExitCode,0);assert.equal(exit.exitCode,0);assert.equal(exit.runId,report.runId);
      assert.deepEqual(report.identityBefore,identity,'Artifact is not from current git/site/source/engine/scripts');assert.deepEqual(report.identityAfter,identity,'Candidate changed during artifact run');
      assert.equal(report.synthetic,true);assert.equal(report.independentTrials,0);assert.equal(report.humanDurationMeasured,false);assert.equal(report.humanFunMeasured,false);
      assert(Array.isArray(report.requestedRegions)&&report.requestedRegions.length);assert.equal(new Set(report.requestedRegions).size,report.requestedRegions.length);
      assert.equal(report.regions,report.requestedRegions.length);assert.equal(report.actualReplayProfiles,report.requestedRegions.length*3);assert.equal(report.records.length,report.actualReplayProfiles);
      for(const [relative,expected]of Object.entries(report.artifactHashes)){assert.equal(await hashFile(contained(dir,relative)),expected,`Artifact checksum differs: ${relative}`);}
      for(const region of report.requestedRegions){
        assert(expectedIds.includes(region),`Unexpected region ${region}`);
        const rr=await read(contained(dir,`regions/${region}/report.json`));assert.equal(rr.status,'pass');assert.equal(rr.region,region);assert.equal(rr.jobRunId,report.runId);assert.equal(rr.sourceUnchanged,true);assert.deepEqual(rr.sourceHashesBefore,rr.sourceHashesAfter);
        assert.equal(rr.records.length,3);for(const [relative,expected]of Object.entries(rr.sourceHashesBefore))assert.equal(expected,catalog.allowed.get(relative)?.sha256,`Regional source hash differs: ${relative}`);
        for(const name of ['report.json',...DIFFICULTIES.flatMap(d=>[`${d}.json`,`${d}-trace.json.gz`])])assert(report.artifactHashes[`regions/${region}/${name}`],`Required artifact hash absent: ${region}/${name}`);
        for(const difficulty of DIFFICULTIES){
          const key=`${region}/${difficulty}`;assert(!seen.has(key),`Duplicate profile ${key}`);
          const matching=report.records.filter(r=>r.region===region&&r.difficulty===difficulty);assert.equal(matching.length,1,`Missing/duplicate ${key}`);const record=matching[0];
          assert.equal(record.status,'pass');assert.equal(record.complete,true);for(const gate of ['previewApply','restore','undoReapply'])assert.equal(record[gate],'pass',`${key}: ${gate}`);
          assert.equal(record.planFingerprint,SOCIAL_PLAN_INDEX[key]);assert.equal(record.jobRunId,report.runId);assert.equal(record.runId,rr.runId);assert.equal(record.independentTrials,0);
          assert(Number.isInteger(record.moves)&&record.moves>=0);assert([record.budget,record.spent,record.initialBudget].every(Number.isFinite));assert(record.budget>=0);assert(record.spent>=0);assert.equal(Math.round((record.initialBudget-record.spent)*10)/10,record.budget);
          for(const service of ['telecom','medical','school','culture']){const metric=record.metrics.services[service];assert.equal(metric.covered,metric.total);assert.equal(metric.servedUnits,metric.demandUnits);}
          const full=await read(contained(dir,`regions/${region}/${difficulty}.json`)),{save,...summary}=full;
          assert.deepEqual(summary,record);assert.deepEqual(rr.records.find(r=>r.difficulty===difficulty),record);assert.equal(save.owner,'synthetic:platform-reference');assert.equal(save.actions.length,record.moves);
          const trace=JSON.parse(zlib.gunzipSync(await fs.readFile(contained(dir,`regions/${region}/${difficulty}-trace.json.gz`))));assert.equal(trace.length,record.moves);
          for(const [i,step]of trace.entries()){assert.equal(step.turn,i+1);assert.deepEqual(step.action,save.actions[i]);assert(step.budget>=0);}
          assert.equal(Math.round(trace.reduce((sum,step)=>sum+step.cost,0)*10)/10,record.spent);if(trace.length)assert.equal(trace.at(-1).budget,record.budget);
          seen.add(key);records.push({...record,reportPath:path.relative(REPO,reportPath).split(path.sep).join('/')});
        }
      }
      jobs.push({runId:report.runId,regions:report.requestedRegions,actualReplayProfiles:report.actualReplayProfiles,exitCode:exit.exitCode,reportSha256:await hashFile(reportPath)});
    }catch(error){errors.push({report:path.relative(REPO,reportPath).split(path.sep).join('/'),error:error.message});}
  }
  for(const region of expectedIds)for(const difficulty of DIFFICULTIES)if(!seen.has(`${region}/${difficulty}`))errors.push({missing:`${region}/${difficulty}`});
  assert.equal(seen.size,246,`Only ${seen.size}/246 unique validated profiles`);assert.equal(new Set(records.map(r=>r.region)).size,82);
}catch(error){errors.push({error:error.message});}
const summary={status:errors.length?'fail':'pass',finishedAt:new Date().toISOString(),identity,regions:new Set(records.map(r=>r.region)).size,actualReplayProfiles:seen.size,expectedRegions:82,expectedProfiles:246,jobs,records,errors,
  synthetic:true,privilegedReference:true,independentTrials:0,humanFunMeasured:false,humanDurationMeasured:false};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({status:summary.status,regions:summary.regions,actualReplayProfiles:summary.actualReplayProfiles,reports:reportPaths.length,errors:errors.length}));process.exitCode=errors.length?1:0;
