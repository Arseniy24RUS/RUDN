/** Read-only release preflight. Reads rules source only, never student data. */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const args=Object.fromEntries(process.argv.slice(2).map((value,index,all)=>value.startsWith('--')?[value.slice(2),all[index+1]]:null).filter(Boolean));
if(!args.live)throw new Error('Usage: node scripts/compare-settlements-rules.mjs --live <rules-only JSON> [--baseline <git-ref>] [--report <JSON path>]');
const baselineRef=args.baseline||'HEAD';
const parse=text=>JSON.parse(text.replace(/^\uFEFF/,''));
const baseline=parse(execFileSync('git',['show',`${baselineRef}:firebase/database.rules.json`],{encoding:'utf8'}));
const candidate=parse(fs.readFileSync(new URL('../firebase/database.rules.json',import.meta.url),'utf8'));
const live=parse(fs.readFileSync(args.live,'utf8'));
if(!live.rules||typeof live.rules!== 'object')throw new Error('Expected Firebase rules source; do not supply a database export.');
const allowed=[
  ['rules','rudn-platform','v1','attempts','$studentKey','$attemptId','.validate'],
  ['rules','rudn-platform','v1','checkpoints','$studentKey','$activitySlug','$attemptId','current','.validate'],
  ['rules','rudn-platform','v1','settlementsOwners'],
  ['rules','rudn-platform','v1','settlementsLeaderboard'],
];
const pathKey=path=>JSON.stringify(path);
const get=(value,path)=>path.reduce((current,name)=>current?.[name],value);
const strip=value=>{
  const copy=structuredClone(value);
  for(const path of allowed){const parent=get(copy,path.slice(0,-1));if(parent)delete parent[path.at(-1)]}
  return copy;
};
const differences=(a,b,path=[])=>{
  if(isDeepStrictEqual(a,b))return [];
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(name=>differences(a[name],b[name],[...path,name]));
  return [path];
};
const sourceHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unexpectedRepositoryChanges=differences(strip(baseline),strip(candidate));
const unrelatedLiveDifferences=differences(strip(candidate),strip(live));
const conflictingLiveChanges=allowed.filter(path=>!isDeepStrictEqual(get(live,path),get(baseline,path))&&!isDeepStrictEqual(get(live,path),get(candidate,path)));
const ready=!unexpectedRepositoryChanges.length&&!unrelatedLiveDifferences.length&&!conflictingLiveChanges.length;
const report={status:ready?'pass':'blocked',readOnly:true,productionDataRead:false,productionWritten:false,
  baselineRef:execFileSync('git',['rev-parse',baselineRef],{encoding:'utf8'}).trim(),
  baselineSha256:sourceHash(baseline),liveSha256:sourceHash(live),candidateSha256:sourceHash(candidate),
  allowedChangedPaths:allowed.map(pathKey),unexpectedRepositoryChanges:unexpectedRepositoryChanges.map(pathKey),
  unrelatedLiveDifferences:unrelatedLiveDifferences.map(pathKey),conflictingLiveChanges:conflictingLiveChanges.map(pathKey),
  note:ready?'Only the reviewed settlements rules differ. Deployment remains a separate explicitly gated step.':'Do not deploy the repository rules file. Reconcile listed rule differences and repeat emulator checks first.'};
if(args.report)fs.writeFileSync(args.report,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exitCode=ready?0:2;
