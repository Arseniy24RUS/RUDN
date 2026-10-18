// Operator-only adapter. Uses the pinned CLI's normal account selection and
// authenticated HTTP client; no credential file parsing or token export.
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {readFile} from 'node:fs/promises';
const ROOT='rudn-platform/v1',DIAG=ROOT+'/diagnosticsV2';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const clone=value=>value==null?null:structuredClone(value);
// Match RTDB orderByKey: signed 32-bit integer-looking keys precede strings.
// Source contract: @firebase/database nameCompare / tryParseInt.
export function compareFirebaseKeys(a,b){const integer=value=>/^-?(0*)\d{1,10}$/.test(value)&&Number(value)>=-2147483648&&Number(value)<=2147483647?Number(value):null,x=integer(a),y=integer(b);return a===b?0:x!==null?y!==null?x-y||a.length-b.length:-1:y!==null?1:a<b?-1:1;}
const snapshot=value=>({val:()=>clone(value),forEach:callback=>{for(const [key,item] of Object.entries(value||{}).sort(([a],[b])=>compareFirebaseKeys(a,b)))if(callback({key,val:()=>clone(item)})===true)return true;return false;}});
const mutable=path=>new RegExp('^'+DIAG+'/(?:directory/[0-9]{5,20}|nameIndex/[a-f0-9]+![0-9]{5,20}|groupIndex/[a-f0-9]{40}/[0-9]{5,20}|legacyArchive/[a-f0-9]{40})$').test(path);
const collection=path=>path===ROOT+'/profiles'?20:path===ROOT+'/diagnostics'?4:0;
const readable=path=>Boolean(collection(path))||path===DIAG+'/control/deleteLock'||mutable(path);

export function createCliMaintenanceDatabase({request,readOnly=true,maxAttempts=8}={}){
 if(typeof request!=='function')fail('cli-adapter-unavailable');
 async function send(method,path,options={}){
  if(!readable(path)||method!=='GET'&&(!mutable(path)||readOnly))fail(method==='GET'?'cli-path-refused':'cli-write-refused');
  let result;try{result=await request({method,path:'/'+path+'.json',timeout:30000,retries:0,redirect:'error',resolveOnHTTPError:true,skipLog:{body:true,resBody:true,queryParams:true},...options});}catch{fail('cli-request-failed')}
  if(![200,204,412].includes(result.status))fail('cli-http-'+(Number.isInteger(result.status)?result.status:0));
  return result;
 }
 function ref(path,query={}){
  if(typeof path!=='string'||path.length>1024||!readable(path))fail('cli-path-refused');
  return {
   orderByKey:()=>ref(path,{...query,ordered:true}),
   startAfter:after=>ref(path,{...query,after}),
   startAt:start=>ref(path,{...query,start}),
   endAt:end=>ref(path,{...query,end}),
   limitToFirst:limit=>ref(path,{...query,limit}),
   async get(){
    const cap=collection(path),params={};
    if(cap){
     if(!query.ordered||!Number.isInteger(query.limit)||query.limit<1||query.limit>cap+1)fail('cli-unbounded-read-refused');
     for(const key of ['after','start','end'])if(query[key]!==undefined&&(typeof query[key]!=='string'||query[key].length>200))fail('cli-query-refused');
     params.orderBy=JSON.stringify('$key');params.limitToFirst=query.limit+(query.after?1:0);
     // REST has inclusive startAt. Read one extra key, remove the inclusive
     // cursor, then apply the requested limit; never skip the next row.
     if(query.after||query.start)params.startAt=JSON.stringify(query.after||query.start);
     if(query.end)params.endAt=JSON.stringify(query.end);
    }else if(Object.keys(query).length)fail('cli-query-refused');
    const response=await send('GET',path,{queryParams:params});let value=response.body;
    if(cap&&value){const rows=Object.entries(value).sort(([a],[b])=>compareFirebaseKeys(a,b)).filter(([key])=>!query.after||compareFirebaseKeys(key,query.after)>0).slice(0,query.limit);value=rows.length?Object.fromEntries(rows):null;}
    return snapshot(value);
   },
   async transaction(update){
    if(readOnly||!mutable(path)||Object.keys(query).length)fail('cli-write-refused');
    for(let attempt=0;attempt<maxAttempts;attempt++){
     const current=await send('GET',path,{headers:{'X-Firebase-ETag':'true'}}),etag=current.response?.headers?.get?.('etag');
     if(typeof etag!=='string'||!etag||etag==='*')fail('cli-etag-unavailable');
     const value=update(clone(current.body));if(value===undefined)return {committed:false,snapshot:snapshot(current.body)};
     if(JSON.stringify(value)===JSON.stringify(current.body))return {committed:true,snapshot:snapshot(current.body)};
     const saved=await send('PUT',path,{headers:{'If-Match':etag},body:value});
     if(saved.status===412)continue;
     return {committed:true,snapshot:snapshot(value)};
    }
    fail('cli-transaction-contention');
   }
  };
 }
 return {ref};
}

export async function openFirebaseCliMaintenance({cliPath,project,readOnly=true}={}){
 if(project!=='rudn-gmu-learning-platform'||!cliPath)fail('explicit-project-required');
 const cliRoot=resolve(dirname(cliPath),'../..'),metadata=JSON.parse(await readFile(join(cliRoot,'package.json'),'utf8'));
 if(metadata.name!=='firebase-tools'||metadata.version!=='15.30.1')fail('cli-version-refused');
 const require=createRequire(join(cliRoot,'package.json'));
 // This is a dedicated operator process. Suppress library debug/transport logs
 // before authentication; only the maintenance script emits aggregate counts.
 const {logger}=require('./lib/logger.js');logger.silent=true;
 const {Command}=require('./lib/command.js'),{requireAuth}=require('./lib/requireAuth.js'),{Client}=require('./lib/apiv2.js');
 const command=new Command('diagnostics:maintenance').before(requireAuth).action(async()=>{
  const client=new Client({urlPrefix:'https://rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app',auth:true});
  return createCliMaintenanceDatabase({request:options=>client.request(options),readOnly});
 });
 return command.runner()({project,nonInteractive:true,json:true});
}
