import test from 'node:test';
import assert from 'node:assert/strict';
import {createCliMaintenanceDatabase,compareFirebaseKeys} from './diagnostics-v2-cli-adapter.mjs';
import {createDiagnosticsService,ROOT} from '../firebase/functions/diagnostics-service.mjs';
const admin={uid:'synthetic-operator',email:'omnistat@yandex.ru'};
function httpFixture(initial={}){
 let state=structuredClone(initial),revision=0,race=null;const requests=[];
 const get=path=>path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],state)??null;
 const set=(path,value)=>{const keys=path.split('/').filter(Boolean);let p=state;for(const key of keys.slice(0,-1))p=p[key]??={};p[keys.at(-1)]=structuredClone(value);revision++;};
 const request=async options=>{requests.push(structuredClone(options));const path=options.path.slice(1,-5);
  if(options.method==='PUT'&&race){const update=race;race=null;update({set,path});}
  if(options.method==='PUT'&&options.headers['If-Match']!==String(revision))return {status:412,body:get(path)};
  if(options.method==='PUT'){set(path,options.body);return {status:200,body:get(path)}}
  let body=structuredClone(get(path));const q=options.queryParams;
  if(q?.orderBy&&body){const start=q.startAt?JSON.parse(q.startAt):null,end=q.endAt?JSON.parse(q.endAt):null;body=Object.fromEntries(Object.entries(body).sort(([a],[b])=>compareFirebaseKeys(a,b)).filter(([key])=>(start===null||compareFirebaseKeys(key,start)>=0)&&(end===null||compareFirebaseKeys(key,end)<=0)).slice(0,q.limitToFirst));if(!Object.keys(body).length)body=null;}
  return {status:200,body,response:{headers:new Headers({etag:String(revision)})}};
 };
 return {request,requests,set,get,setRace:fn=>race=fn};
}
test('CLI dry-run uses bounded inclusive REST pages without lost/duplicated profiles',async()=>{
 const h=httpFixture();for(let i=0;i<45;i++){const id=String(123450000+i);h.set('rudn-platform/v1/profiles/'+id,{studentKey:id,fullName:'Synthetic '+i,group:'TEST'})}
 const service=createDiagnosticsService({db:createCliMaintenanceDatabase({request:h.request,readOnly:true})});let cursor=null,count=0,pages=0;
 do{const result=await service.handle({action:'migrateLegacy',kind:'profiles',dryRun:true,limit:20,cursor},admin);count+=result.scanned;cursor=result.nextCursor;pages++;}while(cursor);
 assert.equal(count,45);assert.equal(pages,3);assert.ok(h.requests.every(r=>r.method==='GET'&&r.queryParams.limitToFirst<=22));
 assert.equal(h.get(ROOT+'/directory'),null);assert.ok(h.requests.every(r=>r.skipLog.body&&r.skipLog.resBody&&r.skipLog.queryParams));
});
test('CLI CAS preserves newer profile index and deletion tombstone after concurrent writes',async()=>{
 const h=httpFixture(),db=createCliMaintenanceDatabase({request:h.request,readOnly:false}),path=ROOT+'/directory/123456789';h.set(path,{sourceUpdatedAt:10,fullName:'Initial'});
 h.setRace(({set})=>set(path,{sourceUpdatedAt:30,fullName:'Newer'}));const result=await db.ref(path).transaction(old=>old?.sourceUpdatedAt>20?undefined:{sourceUpdatedAt:20,fullName:'Stale'});
 assert.equal(result.committed,false);assert.equal(h.get(path).fullName,'Newer');
 const archive=ROOT+'/legacyArchive/'+'a'.repeat(40);h.setRace(({set})=>set(archive,{deleted:true}));const archived=await db.ref(archive).transaction(old=>old?.deleted?undefined:old||{batch:'synthetic'});
 assert.equal(archived.committed,false);assert.equal(h.get(archive).deleted,true);assert.equal(h.requests.filter(r=>r.method==='PUT').length,2);
});
test('real migration algorithm uses CLI CAS for profile directory and idempotent legacy archive',async()=>{
 const h=httpFixture();h.set('rudn-platform/v1/profiles/123456789',{studentKey:'123456789',fullName:'Synthetic Student',group:'TEST',updatedAt:20});
 h.set('rudn-platform/v1/diagnostics/synthetic-uid/s0/b0',{schema:1,batchId:'synthetic-batch-0001',build:'synthetic',environment:{},events:{e0:{event:'route',module:'platform',at:1,locale:'ru',code:'ok'}},createdAt:1,writtenAt:1,reportCode:'ABCDEF123456'});
 const service=createDiagnosticsService({db:createCliMaintenanceDatabase({request:h.request,readOnly:false})});await service.handle({action:'migrateLegacy',kind:'profiles'},admin);assert.equal(h.get(ROOT+'/directory/123456789').fullName,'Synthetic Student');
 await service.handle({action:'migrateLegacy',kind:'archive'},admin);const before=h.requests.filter(r=>r.method==='PUT').length;await service.handle({action:'migrateLegacy',kind:'archive'},admin);assert.equal(h.requests.filter(r=>r.method==='PUT').length,before);assert.equal(Object.keys(h.get(ROOT+'/legacyArchive')).length,1);
});
test('CLI adapter refuses unrelated paths, unbounded reads, readonly writes and missing ETag',async()=>{
 const h=httpFixture(),db=createCliMaintenanceDatabase({request:h.request});assert.throws(()=>db.ref('rudn-platform/v1/grades'));await assert.rejects(db.ref('rudn-platform/v1/profiles').get(),e=>e.code==='cli-unbounded-read-refused');await assert.rejects(db.ref(ROOT+'/directory/123456789').transaction(()=>({})),e=>e.code==='cli-write-refused');
 const noTag=createCliMaintenanceDatabase({readOnly:false,request:async()=>({status:200,body:null,response:{headers:new Headers()}})});await assert.rejects(noTag.ref(ROOT+'/legacyArchive/'+'b'.repeat(40)).transaction(()=>({})),e=>e.code==='cli-etag-unavailable');
 const broken=createCliMaintenanceDatabase({request:async()=>{throw Error('raw-token-and-name-must-not-propagate')}});await assert.rejects(broken.ref(ROOT+'/control/deleteLock').get(),e=>e.code==='cli-request-failed'&&!e.message.includes('token'));
});

test('mixed-length integer profile keys retain RTDB order across one-item pages',async()=>{
 const keys=['99999','100000','2147483647','000100000','2147483648','99999999999999999999'];assert.deepEqual([...keys].sort(compareFirebaseKeys),['99999','100000','000100000','2147483647','2147483648','99999999999999999999']);
 const h=httpFixture();for(const studentKey of keys)h.set('rudn-platform/v1/profiles/'+studentKey,{studentKey,fullName:'Synthetic',group:'TEST'});
 const db=createCliMaintenanceDatabase({request:h.request}),service=createDiagnosticsService({db});let cursor=null,scanned=0,pages=0;
 do{const page=await service.handle({action:'migrateLegacy',kind:'profiles',dryRun:true,limit:1,cursor},admin);scanned+=page.scanned;pages++;cursor=page.nextCursor;}while(cursor);
 assert.equal(scanned,keys.length);assert.equal(pages,keys.length);
});
