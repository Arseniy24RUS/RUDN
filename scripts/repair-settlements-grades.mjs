/** Aggregate-only diagnostic; default is read-only. No profiles, names, IDs or tokens are logged.
 * Uses an existing firebase-tools login through its normal command/auth hooks.
 * --apply is deliberately restricted to valid, already-committed immutable attempts.
 * Checkpoint-only completions are counted for review, never invented as attempts here.
 * Usage (dry-run): node scripts/repair-settlements-grades.mjs --firebase-cli <existing-cli.js>
 * One-time freeplay scope additionally requires both:
 *   --include-existing-freeplay --completed-before 1791025351000
 * A reviewed write run additionally requires --apply --expect-plan <dry-run digest>.
 * No production writes have been executed while preparing this helper.
 */
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateSettlementsResult,settlementsPoints} from '../site/assets/js/settlements-leaderboard.js';
const PROJECT='rudn-gmu-learning-platform',INSTANCE=PROJECT+'-default-rtdb',ROOT='rudn-platform/v1',ACTIVITY='seminar-3';
const FREE_ACTIVITY='settlements-freeplay';
// Fixed when the one-time retrospective freeplay repair was authorized.
export const AUTHORIZED_FREEPLAY_CUTOFF=1791025351000; // 2026-10-03T11:02:31.000Z
const safeError=code=>Object.assign(new Error(code),{safeCode:code});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const terminal=value=>{try{validateSettlementsResult(value);return true;}catch{return false;}};
const report=value=>process.stdout.write(JSON.stringify(value)+'\n');
const safeFailureDetails=error=>{
  const chain=[];for(let item=error;item&&chain.length<5;item=item.original||item.cause)chain.push(item);
  const message=chain.map(item=>String(item.message||'')).join(' ');
  return {reason:/parse JSON/i.test(message)?'non-json-response':/authenticate|authentication|login|credential|invalid_grant/i.test(message)?'authentication':/permission|forbidden/i.test(message)?'permission':/timed? ?out|network|fetch|ENOTFOUND|ECONN/i.test(message)?'network':'request',
    // FirebaseError.status defaults to 500 even without an HTTP response.
    firebaseErrorStatus:chain.map(item=>item.status).find(Number.isInteger)||null,
    endpointClass:/oauth2\.googleapis\.com|accounts\.google\.com|oauth2\.google\.com/.test(message)?'google-oauth':/firebasedatabase\.app|firebaseio\.com/.test(message)?'realtime-database':'not-present',
    providerError:/invalid_grant/.test(message)?'invalid_grant':/invalid_client/.test(message)?'invalid_client':/refresh/i.test(message)?'refresh-failed':null};
};

export function validatedAttempt(value,studentKey,attemptId,policy={}){
  const assessment=value?.activitySlug===ACTIVITY&&value.mode==='assessment'&&value.recordGrade===true;
  const free=value?.activitySlug===FREE_ACTIVITY&&value.mode==='free'&&value.recordGrade===false;
  if(value?.type!=='settlements'||(!assessment&&!free))return null;
  if(free&&(!policy.includeExistingFreeplay||!Number.isFinite(policy.completedBefore)||value.completedAt>policy.completedBefore))return null;
  if(value.id!==attemptId||value.studentKey!==studentKey||typeof value.ownerUid!=='string'||!value.ownerUid||!terminal(value.result))return null;
  if(!['easy','normal','hard'].includes(value.difficulty)||typeof value.regionId!=='string'||!value.regionId)return null;
  const points=settlementsPoints(value.difficulty,value.result.coverageNp,true,'assessment');
  if(value.points!==(free?0:points)||!Number.isFinite(value.completedAt)||value.completedAt<0||!Number.isFinite(value.elapsedMs)||value.elapsedMs<0)return null;
  return {studentKey,attemptId,ownerUid:value.ownerUid,points,difficulty:value.difficulty,sourceMode:value.mode,completedAt:value.completedAt};
}
export function chooseBetterGrade(current,candidate,now=Date.now()){
  if(current!==null&&current!==undefined){
    if(typeof current!=='object'||!Number.isFinite(current.points)||current.points<0||current.points>5)throw safeError('grade/invalid-current');
    if(current.points>=candidate.points)return undefined;
  }
  return {points:candidate.points,max:5,updatedAt:new Date(now).toISOString(),sourceAttemptId:candidate.attemptId,ownerUid:candidate.ownerUid};
}
export function validatedCheckpoint(current,studentKey,attemptId,activity,policy={}){
  const free=activity===FREE_ACTIVITY,mode=free?'free':'assessment',state=current?.state;
  if(activity!==ACTIVITY&&!free)return null;
  if(!current||current.studentKey!==studentKey||current.attemptId!==attemptId||current.activitySlug!==activity||current.mode!==`settlements-${mode}`||!terminal(state?.result))return null;
  if(!['completed','completion-pending'].includes(state.status))return null;
  if(free&&(!policy.includeExistingFreeplay||!Number.isFinite(policy.completedBefore)||!Number.isFinite(state.completedAt)||state.completedAt<0||state.completedAt>policy.completedBefore))return null;
  return {sourceMode:mode,status:state.status,points:settlementsPoints(state.difficulty,state.result.coverageNp,true,'assessment')};
}
export async function boundedForEach(items,limit,visit){
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(cursor<items.length){const index=cursor++;await visit(items[index],index);}
  }));
}
const compareCandidate=(a,b)=>a.studentKey<b.studentKey?-1:a.studentKey>b.studentKey?1:a.attemptId<b.attemptId?-1:a.attemptId>b.attemptId?1:0;
async function cliTransport(cliPath,stats,policy){
  if(!cliPath)throw safeError('cli/path-required');
  // Only package code is loaded. No credential file is opened or emitted by this helper.
  const packageRoot=path.resolve(path.dirname(cliPath),'../..'),require=createRequire(path.join(packageRoot,'package.json'));
  let command,Client,stage='load-cli';const options={project:PROJECT,instance:INSTANCE,nonInteractive:true};
  const authDiagnostic={oauthResponseStatus:null,oauthProviderError:null,oauthTransportFailure:null};
  try{
    const {logger}=require('./lib/logger.js');logger.silent=true;
    command=require('./lib/commands/database-get.js').command;Client=require('./lib/apiv2.js').Client;
    // Observe only status/allowlisted OAuth error codes from the normal CLI call.
    // The request, response and credentials are neither replaced nor emitted.
    const originalRequest=Client.prototype.request;
    Client.prototype.request=async function(request){
      const oauth=/\/token$/.test(String(request.path||''))&&/google/.test(String(this.opts?.urlPrefix||''));
      const observe=response=>{if(!oauth)return;authDiagnostic.oauthResponseStatus=Number.isInteger(response?.status)?response.status:null;const code=response?.body?.error;authDiagnostic.oauthProviderError=['invalid_grant','invalid_client','invalid_scope','unauthorized_client','access_denied','temporarily_unavailable'].includes(code)?code:code?'other':null;};
      try{const response=await originalRequest.call(this,request);observe(response);return response;}catch(error){if(oauth){observe({status:error?.context?.response?.statusCode,body:error?.context?.body});authDiagnostic.oauthTransportFailure=safeFailureDetails(error);}throw error;}
    };
    stage='prepare';await command.prepare(options);
    // Exact instance URL is already part of the deployed app. Avoid a failing
    // management-metadata lookup; the authenticated RTDB request still enforces access.
    stage='requireAuth';await require('./lib/requireAuth.js').requireAuth(options,true);
    if(!options.user)throw safeError('firebase/no-existing-cli-account');
  }catch(error){
    const message=String(error?.message||'');
    const reason=/authenticate|authentication|login|credential/i.test(message)?'authentication':/permission|forbidden/i.test(message)?'permission':/timed? ?out|network|fetch|ENOTFOUND|ECONN/i.test(message)?'network':error?.code==='MODULE_NOT_FOUND'?'module-unavailable':'setup';
    throw Object.assign(safeError('firebase/existing-login-unavailable'),{safeDetails:{stage,reason,firebaseErrorStatus:Number.isInteger(error?.status)?error.status:null,activeCliAccount:Boolean(options.user),...authDiagnostic}});
  }
  const endpoint=new URL('https://'+INSTANCE+'.europe-west1.firebasedatabase.app/');
  if(endpoint.protocol!=='https:'||!endpoint.hostname.startsWith(INSTANCE+'.'))throw safeError('firebase/unexpected-instance');
  const client=new Client({urlPrefix:endpoint.origin,auth:true});
  async function request(method,relative,{queryParams,headers,body}={}){
    if(!/^(checkpoints|attempts|grades)(\/|$)/.test(relative))throw safeError('scope/path-not-allowed');
    const urlPath='/'+ROOT+'/'+relative.split('/').map(encodeURIComponent).join('/')+'.json';stats.requests++;
    // "xml" is CLI's raw-text response mode; inspect HTTP status before parsing
    // JSON so a gateway's HTML error cannot obscure the status or leak its body.
    let response;try{response=await client.request({method,path:urlPath,queryParams,headers,body,responseType:'xml',resolveOnHTTPError:true,retries:1,timeout:30000});}catch(error){throw Object.assign(safeError('firebase/network-or-auth-error'),{safeDetails:{...safeFailureDetails(error),...authDiagnostic}});}
    if(response.status>=400&&response.status!==412)throw safeError('firebase/http-'+response.status);
    let value;try{value=JSON.parse(response.body);}catch{throw safeError('firebase/non-json-response');}
    return {value,etag:response.response.headers.get('etag'),status:response.status};
  }
  return {
    get:(p,options={})=>request('GET',p,options),
    async bestGrade(candidate){
      const gradePath=`grades/${candidate.studentKey}/${ACTIVITY}`;
      for(let retry=0;retry<5;retry++){
        const authoritative=(await request('GET',`attempts/${candidate.studentKey}/${candidate.attemptId}`)).value;
        const checked=validatedAttempt(authoritative,candidate.studentKey,candidate.attemptId,policy);
        if(!checked||digest(checked)!==digest(candidate))throw safeError('attempt/changed-before-repair');
        const current=await request('GET',gradePath,{headers:{'X-Firebase-ETag':'true'}}),next=chooseBetterGrade(current.value,candidate);
        if(next===undefined)return {changed:false};if(!current.etag)throw safeError('grade/etag-unavailable');
        const saved=await request('PUT',gradePath,{headers:{'If-Match':current.etag,'Content-Type':'application/json'},body:next});
        if(saved.status===412){stats.transactionRetries++;continue;}
        if(saved.status!==200)throw safeError('grade/write-not-confirmed');return {changed:true};
      }
      throw safeError('grade/contention');
    }
  };
}
async function selfTest(){
  const c={studentKey:'synthetic-student',attemptId:'synthetic-attempt',ownerUid:'synthetic-uid',points:4,difficulty:'normal',sourceMode:'assessment',completedAt:1};
  assert.equal(chooseBetterGrade({points:5},c),undefined);assert.equal(chooseBetterGrade({points:4},c),undefined);assert.equal(chooseBetterGrade({points:3},c,0).points,4);assert.equal(chooseBetterGrade(null,c,0).sourceAttemptId,c.attemptId);
  assert.throws(()=>chooseBetterGrade({points:'5'},c));assert.throws(()=>chooseBetterGrade({points:6},c));
  const attempt={id:c.attemptId,studentKey:c.studentKey,ownerUid:c.ownerUid,type:'settlements',activitySlug:ACTIVITY,mode:'assessment',recordGrade:true,difficulty:'normal',regionId:'synthetic-region',points:4,completedAt:1,elapsedMs:1,result:{terminal:true,reason:'complete',coverageNp:90,coveragePopulation:99,turns:1,spentMillionRub:1}};
  assert.deepEqual(validatedAttempt(attempt,c.studentKey,c.attemptId),c);
  assert.equal(validatedAttempt({...attempt,result:{...attempt.result,coverageNp:89.9999}},c.studentKey,c.attemptId),null);
  assert.equal(validatedAttempt({...attempt,mode:'free'},c.studentKey,c.attemptId),null);
  assert.equal(validatedAttempt(attempt,'synthetic-other',c.attemptId),null);
  const free={...attempt,activitySlug:FREE_ACTIVITY,mode:'free',recordGrade:false,points:0},policy={includeExistingFreeplay:true,completedBefore:2};
  assert.equal(validatedAttempt(free,c.studentKey,c.attemptId),null);
  assert.equal(validatedAttempt(free,c.studentKey,c.attemptId,policy).points,4);
  assert.equal(validatedAttempt({...free,completedAt:3},c.studentKey,c.attemptId,policy),null);
  assert.equal(validatedAttempt({...free,points:4},c.studentKey,c.attemptId,policy),null);
  assert.equal(validatedAttempt({...free,result:{...free.result,coverageNp:89.9999}},c.studentKey,c.attemptId,policy).points,0);
  assert.equal(free.points,0);assert.equal(free.recordGrade,false);
  const checkpoint={studentKey:c.studentKey,attemptId:c.attemptId,activitySlug:FREE_ACTIVITY,mode:'settlements-free',state:{status:'completed',completedAt:2,difficulty:'normal',result:free.result}};
  assert.deepEqual(validatedCheckpoint(checkpoint,c.studentKey,c.attemptId,FREE_ACTIVITY,policy),{sourceMode:'free',status:'completed',points:4});
  assert.equal(validatedCheckpoint(checkpoint,c.studentKey,c.attemptId,FREE_ACTIVITY),null);
  assert.equal(validatedCheckpoint({...checkpoint,state:{...checkpoint.state,completedAt:3}},c.studentKey,c.attemptId,FREE_ACTIVITY,policy),null);
  assert.equal(validatedCheckpoint({...checkpoint,state:{...checkpoint.state,completedAt:undefined}},c.studentKey,c.attemptId,FREE_ACTIVITY,policy),null);
  assert.equal(validatedCheckpoint({...checkpoint,state:{...checkpoint.state,status:'playing'}},c.studentKey,c.attemptId,FREE_ACTIVITY,policy),null);
  assert.equal(validatedCheckpoint({...checkpoint,state:{...checkpoint.state,status:'completion-pending'}},c.studentKey,c.attemptId,FREE_ACTIVITY,policy).status,'completion-pending');
  assert.equal(validatedCheckpoint(checkpoint,'synthetic-other',c.attemptId,FREE_ACTIVITY,policy),null);
  let active=0,maxActive=0;const seen=[],items=Array.from({length:19},(_,i)=>i);
  await boundedForEach(items,6,async index=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,index%3));seen.push(index);active--;});
  assert.equal(maxActive,6);assert.deepEqual(seen.sort((a,b)=>a-b),items);assert.equal(active,0);
  const unordered=[{studentKey:'b',attemptId:'a'},{studentKey:'a',attemptId:'b'},{studentKey:'a',attemptId:'a'}];
  assert.equal(digest([...unordered].sort(compareCandidate)),digest([...unordered].reverse().sort(compareCandidate)));
  report({status:'pass',scope:'synthetic policy, checkpoint cutoff and bounded deterministic scan tests',assertions:28,networkRequests:0,writes:0});
}
async function main(){
  const args=process.argv.slice(2),option=(key,fallback=null)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
  if(args.includes('--self-test'))return selfTest();
  const policy={includeExistingFreeplay:args.includes('--include-existing-freeplay'),completedBefore:Number(option('--completed-before'))};
  if(policy.includeExistingFreeplay&&(!Number.isFinite(policy.completedBefore)||policy.completedBefore<=0||policy.completedBefore>AUTHORIZED_FREEPLAY_CUTOFF))throw safeError('repair/explicit-authorized-freeplay-cutoff-required');
  if(!policy.includeExistingFreeplay&&args.includes('--completed-before'))throw safeError('repair/freeplay-flag-required');
  const apply=args.includes('--apply'),stats={project:PROJECT,mode:apply?'apply':'dry-run',writes:0,requests:0,transactionRetries:0,studentsScanned:0,scanConcurrency:6,
    freeplayIncluded:policy.includeExistingFreeplay,completedBefore:policy.includeExistingFreeplay?policy.completedBefore:null,completedAssessmentAttempts:0,completedFreeplayAttempts:0,eligibleAssessmentAttempts:0,eligibleFreeplayAttempts:0,excludedFutureFreeplayAttempts:0,
    completedAttempts:0,eligibleAttempts:0,invalidSettlementAttempts:0,completedCheckpoints:0,pendingTerminalCheckpoints:0,eligibleCheckpoints:0,checkpointOnlyEligible:0,conflictedCheckpoints:0,
    completedFreeplayCheckpoints:0,pendingFreeplayTerminalCheckpoints:0,eligibleFreeplayCheckpoints:0,checkpointOnlyFreeplayEligible:0,conflictedFreeplayCheckpoints:0,excludedFutureFreeplayCheckpoints:0,invalidFreeplayCheckpoints:0,checkpointOnlyFreeplayGradeMissingStudents:0,
    gradeMissingStudents:0,gradeBelowBestStudents:0,gradeInvalidStudents:0,repairableStudents:0,checkpointOnlyGradeMissingStudents:0,queryFallbacks:0,errors:{}};
  const transport=await cliTransport(option('--firebase-cli'),stats,policy);
  const checkpointKeys=Object.keys(object((await transport.get('checkpoints',{queryParams:{shallow:'true'}})).value));
  const attemptKeys=Object.keys(object((await transport.get('attempts',{queryParams:{shallow:'true'}})).value));
  const students=[...new Set([...checkpointKeys,...attemptKeys])].sort();stats.studentsWithCheckpoints=checkpointKeys.length;stats.studentsWithAttempts=attemptKeys.length;stats.studentsTotal=students.length;
  if(args.includes('--probe')){report({...stats,status:'pass',access:'authorized',studentKeysEmitted:false});return;}
  const candidates=[];
  await boundedForEach(students,stats.scanConcurrency,async studentKey=>{
    try{
      let attempts={};const activities=policy.includeExistingFreeplay?[ACTIVITY,FREE_ACTIVITY]:[ACTIVITY];
      try{for(const activity of activities)Object.assign(attempts,object((await transport.get(`attempts/${studentKey}`,{queryParams:{orderBy:JSON.stringify('activitySlug'),equalTo:JSON.stringify(activity)}})).value));}
      catch(error){
        if(error.safeCode!=='firebase/http-400')throw error;stats.queryFallbacks++;attempts={};
        const ids=Object.keys(object((await transport.get(`attempts/${studentKey}`,{queryParams:{shallow:'true'}})).value));
        for(const id of ids)if(activities.includes((await transport.get(`attempts/${studentKey}/${id}/activitySlug`)).value))attempts[id]=(await transport.get(`attempts/${studentKey}/${id}`)).value;
      }
      let best=null;const eligibleIds=new Set();
      for(const [attemptId,value]of Object.entries(attempts).sort(([a],[b])=>a.localeCompare(b))){
        if(value?.type!=='settlements')continue;
        if(value.mode==='free'&&Number.isFinite(value.completedAt)&&value.completedAt>policy.completedBefore){stats.excludedFutureFreeplayAttempts++;continue;}
        const candidate=validatedAttempt(value,studentKey,attemptId,policy);
        if(!candidate){stats.invalidSettlementAttempts++;continue;}stats.completedAttempts++;
        stats[candidate.sourceMode==='free'?'completedFreeplayAttempts':'completedAssessmentAttempts']++;
        if(candidate.points>0){stats.eligibleAttempts++;stats[candidate.sourceMode==='free'?'eligibleFreeplayAttempts':'eligibleAssessmentAttempts']++;eligibleIds.add(`${candidate.sourceMode}:${attemptId}`);if(!best||candidate.points>best.points||(candidate.points===best.points&&best.sourceMode==='free'&&candidate.sourceMode==='assessment'))best=candidate;}
      }
      let checkpointOnlyEligible=false,checkpointOnlyFreeplayEligible=false;
      for(const activity of activities){
        const freeCheckpoint=activity===FREE_ACTIVITY;
        const checkpointIds=Object.keys(object((await transport.get(`checkpoints/${studentKey}/${activity}`,{queryParams:{shallow:'true'}})).value));
        for(const attemptId of checkpointIds){
          const prefix=`checkpoints/${studentKey}/${activity}/${attemptId}`;
          const conflicts=object((await transport.get(prefix+'/conflicts',{queryParams:{shallow:'true'}})).value);
          if(Object.keys(conflicts).length){stats.conflictedCheckpoints++;if(freeCheckpoint)stats.conflictedFreeplayCheckpoints++;continue;}
          const current=(await transport.get(prefix+'/current')).value,state=current?.state;
          if(freeCheckpoint&&terminal(state?.result)&&Number.isFinite(state.completedAt)&&state.completedAt>policy.completedBefore){stats.excludedFutureFreeplayCheckpoints++;continue;}
          const checked=validatedCheckpoint(current,studentKey,attemptId,activity,policy);
          if(!checked){if(freeCheckpoint&&terminal(state?.result)&&['completed','completion-pending'].includes(state.status))stats.invalidFreeplayCheckpoints++;continue;}
          if(checked.status==='completed'){stats.completedCheckpoints++;if(freeCheckpoint)stats.completedFreeplayCheckpoints++;}
          else{stats.pendingTerminalCheckpoints++;if(freeCheckpoint)stats.pendingFreeplayTerminalCheckpoints++;}
          if(checked.points>0){stats.eligibleCheckpoints++;if(freeCheckpoint)stats.eligibleFreeplayCheckpoints++;if(!eligibleIds.has(`${checked.sourceMode}:${attemptId}`)){stats.checkpointOnlyEligible++;checkpointOnlyEligible=true;if(freeCheckpoint){stats.checkpointOnlyFreeplayEligible++;checkpointOnlyFreeplayEligible=true;}}}
        }
      }
      if(best||checkpointOnlyEligible){
        const grade=(await transport.get(`grades/${studentKey}/${ACTIVITY}`)).value;
        if(checkpointOnlyEligible&&grade==null)stats.checkpointOnlyGradeMissingStudents++;
        if(checkpointOnlyFreeplayEligible&&grade==null)stats.checkpointOnlyFreeplayGradeMissingStudents++;
        if(best){
          if(grade==null){stats.gradeMissingStudents++;candidates.push(best);}
          else if(!Number.isFinite(grade.points)||grade.points<0||grade.points>5)stats.gradeInvalidStudents++;
          else if(grade.points<best.points){stats.gradeBelowBestStudents++;candidates.push(best);}
        }
      }
    }catch(error){const code=error.safeCode||'diagnostic/unclassified-error';stats.errors[code]=(stats.errors[code]||0)+1;}
    stats.studentsScanned++;if(stats.studentsScanned%10===0)report({event:'aggregate-progress',studentsScanned:stats.studentsScanned,studentsTotal:stats.studentsTotal,requests:stats.requests});
  });
  candidates.sort(compareCandidate);
  stats.repairableStudents=candidates.length;stats.repairableFromFreeplay=candidates.filter(value=>value.sourceMode==='free').length;stats.planDigest=digest({policy,candidates});
  if(apply){
    if(Object.keys(stats.errors).length)throw safeError('repair/incomplete-diagnosis');
    if(option('--expect-plan')!==stats.planDigest)throw safeError('repair/plan-digest-required-or-changed');
    for(const candidate of candidates){try{if((await transport.bestGrade(candidate)).changed)stats.writes++;}catch(error){const code=error.safeCode||'repair/unclassified-error';stats.errors[code]=(stats.errors[code]||0)+1;}}
  }
  report({...stats,status:Object.keys(stats.errors).length?'partial':'pass',privacy:'Aggregate only; no student IDs, names, profile data or credentials emitted',checkpointOnlyRepair:'not-performed: requires an authoritative immutable attempt; counts supplied for separate review'});
  if(Object.keys(stats.errors).length)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{report({status:'blocked',error:error.safeCode||'diagnostic/unclassified-error',...(error.safeDetails?{details:error.safeDetails}:{}),writes:0,rawErrorSuppressed:true});process.exitCode=1;});
