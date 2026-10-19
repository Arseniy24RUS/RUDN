import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnosticsService,ROOT} from '../firebase/functions/diagnostics-service.mjs';
import {environment,event,packet,nameTokens,ERROR_CLASSES} from '../firebase/functions/diagnostics-schema.mjs';
import {compareFirebaseKeys} from './diagnostics-v2-cli-adapter.mjs';

// Deterministic adapter exercises business transactions; separate emulator suite
// exercises actual Auth, restricted Admin writer and deployed-function routing.
export function memoryDatabase(){
 let state={};const clone=value=>value==null?null:structuredClone(value);
 const get=path=>path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],state)??null;
 function set(path,value){const keys=path.split('/').filter(Boolean);if(!keys.length){state=value||{};return;}let p=state;for(const k of keys.slice(0,-1))p=p[k]??={};if(value==null)delete p[keys.at(-1)];else p[keys.at(-1)]=clone(value);}
 function ref(path,query={}){return {get:async()=>{let v=clone(get(path));if(query.ordered&&v){v=Object.fromEntries(Object.entries(v).sort(([a],[b])=>compareFirebaseKeys(a,b)).filter(([k])=>(!query.after||compareFirebaseKeys(k,query.after)>0)&&(!query.start||compareFirebaseKeys(k,query.start)>=0)&&(!query.end||compareFirebaseKeys(k,query.end)<=0)).slice(0,query.limit??Infinity));if(!Object.keys(v).length)v=null;}return {val:()=>v,forEach:fn=>{for(const [key,item] of Object.entries(v||{}).sort(([a],[b])=>compareFirebaseKeys(a,b)))if(fn({key,val:()=>clone(item)})===true)break;}};},set:async value=>set(path,value),remove:async()=>set(path,null),update:async values=>{for(const [k,v] of Object.entries(values))set(path+'/'+k,v);},transaction:async fn=>{const value=fn(clone(get(path)));if(value!==undefined)set(path,value);return {committed:value!==undefined,snapshot:{val:()=>clone(get(path))}};},orderByKey:()=>ref(path,{...query,ordered:true}),startAfter:after=>ref(path,{...query,after}),startAt:start=>ref(path,{...query,start}),endAt:end=>ref(path,{...query,end}),limitToFirst:limit=>ref(path,{...query,limit})};}
 return {ref,dump:()=>clone(state)};
}
const admin={uid:'teacher-test',email:'omnistat@yandex.ru'},student={uid:'student-test'},peer={uid:'peer-test'};
const env={browser:'safari',browserVersion:null,os:'ios',osVersion:null,osSource:'ua-may-be-frozen',model:null,width:390,height:844};
const opening=(id='session-client-0001',studentKey='123456789')=>({action:'openSession',clientSessionId:id,installationId:'installation-0001',studentKey,build:'build-20261018',environment:env});
const evt=(at=1000,module='seminar-4',code='ok')=>({event:'document-search',module,locale:'ru',at,code,success:code==='ok',durationMs:10});
async function setup(){const db=memoryDatabase();let stamp=1800000000000;await db.ref('rudn-platform/v1/profiles/123456789').set({studentKey:'123456789',fullName:'Петров Иван',group:'ГГУбд-01-26',ownerUids:{'student-test':true}});await db.ref('rudn-platform/v1/profiles/123456790').set({studentKey:'123456790',fullName:'Иванова Анна',group:'ГГУбд-02-26',ownerUids:{'student-test':true}});return {db,service:createDiagnosticsService({db,now:()=>stamp}),tick:(amount=30001)=>stamp+=amount};}
test('schema rejects PII/query/answer/raw errors and preserves unknown environment',()=>{
 assert.equal(environment(env).osVersion,null);assert.equal(environment(env).model,null);
 for(const patch of [{query:'constitution'},{answer:'secret'},{message:'private name'},{stack:[{file:'https://private/a.js',line:1,column:1}]},{stack:[{file:'/assets/../private.js',line:1,column:1}]}])assert.throws(()=>event({...evt(),...patch}));
 assert.throws(()=>environment({...env,userAgent:'raw UA'}));assert.throws(()=>environment({...env,model:'iPhone 15',modelSource:'guessed'}));
 assert.equal(event({...evt(),stack:[{file:'/assets/js/main.js',line:5,column:2}]}).stack[0].line,5);
 assert.throws(()=>packet({sessionId:'session-client-0001',batchId:'batch-client-00001',events:Array.from({length:13},()=>evt())}));
 assert.deepEqual(nameTokens('Ёлкин  Антон-Ильич'),['елкин','антон','ильич']);
});
test('optional error class preserves historical events and accepts only standard sanitized categories',()=>{
 assert.equal(Object.hasOwn(event(evt()),'errorClass'),false,'Historical events remain unchanged when the new field is absent');
 for(const errorClass of ERROR_CLASSES)assert.equal(event({...evt(),event:'runtime-error',errorClass}).errorClass,errorClass);
 for(const errorClass of ['PrivateStudentName','TypeError: private message','AbortError','',null,42,{name:'TypeError'}])assert.throws(()=>event({...evt(),errorClass}),error=>error.code==='invalid');
});
test('authoritative profile binding, same UID profile switches, anonymous separation and foreign rejection',async()=>{
 const {service}=await setup();const a=await service.handle(opening(),student);assert.equal(a.studentKey,'123456789');
 await assert.rejects(service.handle(opening(),peer),e=>e.code==='forbidden');
 await assert.rejects(service.handle({...opening(),studentKey:'123456790'},student),e=>e.code==='conflict');
 const b=await service.handle(opening('session-client-0002','123456790'),student);assert.notEqual(a.subjectKey,b.subjectKey);
 const anon=await service.handle(opening('session-client-0003',undefined),student); // default helper still profile; explicit delete below
 const request=opening('session-client-0004');delete request.studentKey;const before=await service.handle(request,student);assert.match(before.subjectKey,/^anonymous_/);assert.notEqual(before.subjectKey,a.subjectKey);
 const teacherSession=await service.handle(opening('session-client-0005'),admin);assert.match(teacherSession.subjectKey,/^teacher_/);
 await assert.rejects(service.handle({action:'searchStudents'},student),e=>e.code==='forbidden');
});
test('idempotence, rate cap, unbounded accepted history and global filtered pagination',async()=>{
 const {service,tick,db}=await setup(),s=await service.handle(opening(),student),value={action:'append',sessionId:s.sessionId,batchId:'batch-client-00001',events:[evt()]};
 const first=await service.handle(value,student),retry=await service.handle(value,student);assert.equal(retry.duplicate,true);assert.equal(first.receivedAt,retry.receivedAt);
 await assert.rejects(service.handle({...value,events:[evt(2000)]},student),e=>e.code==='batch-conflict');
 await assert.rejects(service.handle({...value,batchId:'batch-client-00002'},student),e=>e.code==='rate-limit');
 for(let i=2;i<=40;i++){tick();await service.handle({...value,batchId:'batch-client-'+String(i).padStart(5,'0'),events:[evt(i,'seminar-'+(i%7),i%2?'type':'ok')]},student);}
 tick(600*86400000);const stats=await service.handle({action:'status',scope:'session',sessionId:s.sessionId},admin);assert.equal(stats.counts.batches,40);assert.equal(stats.counts.events,40);
 const filtered=await service.handle({action:'listSessions',filters:{module:'seminar-6',code:'type',browser:'safari'}},admin);assert.equal(filtered.items.length,1);
 let cursor=null,events=[];do{const page=await service.handle({action:'readEvents',sessionId:s.sessionId,limit:7,cursor},admin);events.push(...page.items);cursor=page.nextCursor;}while(cursor);assert.equal(events.length,40);assert.equal(new Set(events.map(e=>e.eventId)).size,40);
 const names=await service.handle({action:'searchStudents',query:'петр'},admin);assert.equal(names.items[0].studentKey,'123456789');
 assert.ok((await db.ref(ROOT+'/batches/'+s.sessionId).get()).val());
});
test('manual delete fences old subject generation, repeat confirmation, new history survives',async()=>{
 const {service,tick,db}=await setup(),s=await service.handle(opening(),student);await service.handle({action:'append',sessionId:s.sessionId,batchId:'batch-client-00001',events:[evt()]},student);
 const preview=await service.handle({action:'previewDelete',scope:'student',studentKey:'123456789'},admin);const result=await service.handle({action:'delete',confirmationToken:preview.confirmationToken},admin);assert.equal(result.job.state,'complete');
 await assert.rejects(service.handle({action:'append',sessionId:s.sessionId,batchId:'batch-client-00002',events:[evt()]},student),e=>['not-found','deleted'].includes(e.code));
 await assert.rejects(service.handle(opening(),student),e=>e.code==='deleted');
 const again=await service.handle({action:'delete',confirmationToken:preview.confirmationToken},admin);assert.equal(again.job.jobId,result.job.jobId);
 tick();const next=await service.handle(opening('session-client-0002'),student);assert.equal(next.generation,1);assert.equal((await service.handle({action:'listSessions',studentKey:'123456789'},admin)).items.length,1);
 assert.equal((await db.ref(ROOT+'/batches/'+s.sessionId).get()).val(),null);
});
test('backfill never needs grades; renamed/merged profiles remove obsolete name keys',async()=>{
 const {service,db}=await setup();const backfill=await service.handle({action:'migrateLegacy',kind:'profiles'},admin);assert.equal(backfill.copied,2);
 await service.syncProfile('123456789',{studentKey:'123456789',fullName:'Сидоров Иван',group:'ГГУбд-01-26'});
 assert.equal((await service.handle({action:'searchStudents',query:'петр'},admin)).items.length,0);assert.equal((await service.handle({action:'searchStudents',query:'сид'},admin)).items.length,1);
 await service.syncProfile('123456789',{mergedInto:'123456790'});assert.equal((await service.handle({action:'searchStudents',query:'сид'},admin)).items.length,0);
 assert.equal((await db.ref('rudn-platform/v1/grades').get()).val(),null);
});
test('bounded global stats, slash-code filter, chronological event pages and all-delete preserve next generation',async()=>{
 const {service,tick}=await setup();let first;
 for(let i=0;i<24;i++){tick(61000);const s=await service.handle(opening('client-list-'+String(i).padStart(8,'0')),student);first??=s;await service.handle({action:'append',sessionId:s.sessionId,batchId:'batch-list-'+String(i).padStart(8,'0'),events:[{...evt(i),event:'update-state',code:'update/owner-changed'}]},student);}
 let cursor=null,total={};do{const result=await service.handle({action:'status',scope:'all',cursor},admin);for(const [k,v] of Object.entries(result.counts))total[k]=(total[k]||0)+v;cursor=result.nextCursor;}while(cursor);assert.equal(total.sessions,24);assert.equal(total.events,24);assert.ok(total.bytes>100);
 assert.equal((await service.handle({action:'listSessions',filters:{code:'update/owner-changed'},limit:20},admin)).items.length,20);
 const preview=await service.handle({action:'previewDelete',scope:'all'},admin);assert.equal(preview.partial,true);let job=await service.handle({action:'delete',confirmationToken:preview.confirmationToken},admin);assert.equal(job.job.state,'running');tick(61000);const fresh=await service.handle(opening('client-after-delete-0001'),student);
 while(job.job.state!=='complete')job=await service.handle({action:'status',jobId:job.job.jobId},admin);
 const remaining=await service.handle({action:'listSessions'},admin);assert.deepEqual(remaining.items.map(s=>s.sessionId),[fresh.sessionId]);
});
test('legacy archive is bounded, sanitized, idempotent and explicitly unbound; dry run makes no changes',async()=>{
 const {service,db}=await setup();await db.ref('rudn-platform/v1/diagnostics/old-uid/s0/b0').set({schema:1,batchId:'legacy-batch-0001',build:'old-build',environment:env,createdAt:1,writtenAt:2,reportCode:'ABCDEFGHIJKL',events:{e0:evt()},selfReport:{model:'old-user-entry'}});
 const preview=await service.handle({action:'migrateLegacy',kind:'archive',dryRun:true},admin);assert.equal(preview.copied,1);assert.equal((await db.ref(ROOT+'/legacyArchive').get()).val(),null);
 await service.handle({action:'migrateLegacy',kind:'archive'},admin);await service.handle({action:'migrateLegacy',kind:'archive'},admin);const list=await service.handle({action:'migrateLegacy',kind:'listArchive'},admin);assert.equal(list.items.length,1);assert.equal(list.items[0].kind,'legacy-unbound');
 const exported=await service.handle({action:'exportSession',sessionId:list.items[0].sessionId},admin);assert.equal(exported.items.length,1);assert.equal(JSON.stringify(exported).includes('old-user-entry'),false);
 const allBefore=await service.handle({action:'previewDelete',scope:'all'},admin);assert.equal(allBefore.counts.sessions,1);assert.equal(allBefore.counts.events,1);assert.equal(allBefore.partial,false);
 const selected=await service.handle({action:'previewDelete',scope:'session',sessionId:list.items[0].sessionId},admin);await service.handle({action:'delete',confirmationToken:selected.confirmationToken},admin);await service.handle({action:'migrateLegacy',kind:'archive'},admin);assert.equal((await service.handle({action:'migrateLegacy',kind:'listArchive'},admin)).items.length,0,'manual legacy deletion survives repeat migration');
 const p=await service.handle({action:'previewDelete',scope:'all'},admin);let j=await service.handle({action:'delete',confirmationToken:p.confirmationToken},admin);while(j.job.state!=='complete')j=await service.handle({action:'status',jobId:j.job.jobId},admin);assert.equal((await db.ref('rudn-platform/v1/diagnostics/old-uid').get()).val(),null);assert.equal((await service.handle({action:'migrateLegacy',kind:'listArchive'},admin)).items.length,0);
});
test('native export grant is single-use, bounded pending grants, streamed history and deletion invalidation',async()=>{
 const {service,tick}=await setup(),s=await service.handle(opening(),student);for(let i=0;i<15;i++){tick();await service.handle({action:'append',sessionId:s.sessionId,batchId:'batch-export-'+String(i).padStart(5,'0'),events:Array.from({length:12},(_,j)=>evt(i*12+j))},student);}
 await assert.rejects(service.handle({action:'createExport',sessionId:s.sessionId},student),e=>e.code==='forbidden');const created=await service.handle({action:'createExport',sessionId:s.sessionId},admin),grant=await service.consumeExport(created.downloadToken);await assert.rejects(service.consumeExport(created.downloadToken),e=>e.code==='expired');let count=0,last;for await(const row of service.exportLines(grant)){if(row.kind==='event')count++;last=row;}assert.equal(count,180);assert.equal(last.complete,true);
 const expired=await service.handle({action:'createExport',sessionId:s.sessionId},admin);tick(120001);await assert.rejects(service.consumeExport(expired.downloadToken),e=>e.code==='expired');
 const removed=await service.handle({action:'createExport',sessionId:s.sessionId},admin),p=await service.handle({action:'previewDelete',scope:'session',sessionId:s.sessionId},admin);assert.equal(p.counts.sessions,1);assert.equal(p.counts.events,180);await service.handle({action:'delete',confirmationToken:p.confirmationToken},admin);await assert.rejects(service.consumeExport(removed.downloadToken),e=>['not-found','deleted'].includes(e.code));assert.equal((await service.handle({action:'status',scope:'session',sessionId:s.sessionId},admin)).counts.sessions,0);
});
test('out-of-order profile callbacks cannot undo a newer rename or resurrect a removed directory entry',async()=>{
 const {service}=await setup();const profile={studentKey:'123456789',fullName:'Новое Имя',group:'ГГУбд-01-26'};await service.syncProfile('123456789',profile,3000);await service.syncProfile('123456789',{...profile,fullName:'Старое Имя'},2000);assert.equal((await service.handle({action:'searchStudents',query:'новое'},admin)).items.length,1);assert.equal((await service.handle({action:'searchStudents',query:'старое'},admin)).items.length,0);
 await service.syncProfile('123456789',null,4000);await service.syncProfile('123456789',profile,3000);assert.equal((await service.handle({action:'searchStudents',query:'новое'},admin)).items.length,0);
});

test('all-history statistics page through v2 then unbound legacy archive without counting tombstones',async()=>{
 const {service,db}=await setup(),s=await service.handle(opening(),student);await service.handle({action:'append',sessionId:s.sessionId,batchId:'batch-stats-000001',events:[evt()]},student);
 for(let i=0;i<24;i++)await db.ref(ROOT+'/legacyArchive/'+String(i).padStart(40,'0')).set(i===5?{deleted:true,deletedAt:1}:{archivedAt:1,batch:{events:[evt(i)],createdAt:1}});
 let cursor=null,pages=0,total={sessions:0,batches:0,events:0};do{const result=await service.handle({action:'status',scope:'all',cursor},admin);for(const field of Object.keys(total))total[field]+=result.counts[field];pages++;cursor=result.nextCursor;}while(cursor);
 assert.deepEqual(total,{sessions:24,batches:24,events:24});assert.equal(pages,3,'legacy payload reads remain bounded to ten archive entries per page');
 const preview=await service.handle({action:'previewDelete',scope:'all'},admin);assert.equal(preview.partial,true);assert.ok(preview.nextCursor);
});

test('session time filters use inclusive server openedAt bounds, scoped cursors and global indexes',async()=>{
 const {service,tick}=await setup(),sessions=[];for(let i=0;i<4;i++){tick(61000);sessions.push(await service.handle(opening('time-window-client-'+i),student));}
 const from=sessions[1].openedAt,to=sessions[2].openedAt;
 const first=await service.handle({action:'listSessions',filters:{from,to,browser:'safari'},limit:1},admin);assert.deepEqual(first.items.map(s=>s.sessionId),[sessions[1].sessionId]);assert.ok(first.nextCursor);
 const second=await service.handle({action:'listSessions',filters:{from,to,browser:'safari'},limit:1,cursor:first.nextCursor},admin);assert.deepEqual(second.items.map(s=>s.sessionId),[sessions[2].sessionId]);assert.equal(second.nextCursor,null);
 const scoped=await service.handle({action:'listSessions',studentKey:'123456789',filters:{from,to}},admin);assert.deepEqual(scoped.items.map(s=>s.sessionId),sessions.slice(1,3).map(s=>s.sessionId));
 await assert.rejects(service.handle({action:'listSessions',filters:{from:from+1,to,browser:'safari'},cursor:first.nextCursor},admin),e=>e.code==='invalid-cursor');
 for(const filters of [{from:to+1,to},{from:-1},{from:Infinity},{to:1.1},{from:'1800000000000'}])await assert.rejects(service.handle({action:'listSessions',filters},admin),e=>e.code==='invalid');
});
