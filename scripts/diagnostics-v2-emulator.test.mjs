import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../firebase/functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getDatabase}=require('firebase-admin/database');
import {ROOT,createDiagnosticsService} from '../firebase/functions/diagnostics-service.mjs';
const host='http://127.0.0.1:9000',ns='demo-rudn-default-rtdb',url='http://127.0.0.1:5001/demo-rudn/europe-west1/diagnosticsApi';
async function login(teacher=false){const body=teacher?{email:'omnistat@yandex.ru',password:'emulator-test-only',returnSecureToken:true}:{returnSecureToken:true};let response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-rudn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(teacher&&response.status!==200)response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-rudn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);const result=await response.json();return {uid:result.localId,token:result.idToken};}
async function raw(path,{method='GET',value,token='owner'}={}){const response=await fetch(host+'/'+path+'.json?ns='+ns+(token==='owner'?'':'&auth='+encodeURIComponent(token)),{method,headers:{...(token==='owner'?{Authorization:'Bearer owner'}:{}),'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(value)})});return {status:response.status,value:await response.json()};}
async function call(auth,input,status=200){const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+auth.token,'content-type':'application/json',Origin:'http://127.0.0.1:8765'},body:JSON.stringify(input)}),value=await response.json();assert.equal(response.status,status,JSON.stringify({action:input.action,status:response.status,error:value.error}));return value;}
const env={browser:'safari',browserVersion:null,os:'ios',osVersion:null,osSource:'ua-may-be-frozen',model:null,width:390,height:844};
const opening=(id,studentKey)=>({action:'openSession',clientSessionId:id,installationId:'installation-test-00001',studentKey,build:'emulator-build',environment:env});
const event={event:'document-jump',module:'seminar-4',locale:'ru',at:1800000000000,code:'ok',success:true,found:true,visible:true,durationMs:42};
test('real Functions/Auth/RTDB: identity, immutable packets, rules fences, teacher search, no grade/profile snapshot',async()=>{
 const student=await login(),peer=await login(),teacher=await login(true),ticket='123456789';
 await raw('rudn-platform/v1/profiles/'+ticket,{method:'PUT',value:{studentKey:ticket,ticket,email:ticket+'@rudn.ru',fullName:'Синтетический Тест',group:'ГГУбд-01-26',ownerUid:student.uid,ownerUids:{[student.uid]:true}}});
 const session=await call(student,opening('client-session-0001',ticket));assert.equal(session.studentKey,ticket);
 await call(peer,opening('client-session-0002',ticket),403);
 const anon=await call(student,opening('client-session-0003'));assert.match(anon.subjectKey,/^anonymous_/);
 const packet={action:'append',sessionId:session.sessionId,batchId:'batch-id-0000000001',events:[event]};
 const first=await call(student,packet),retry=await call(student,packet);assert.equal(retry.duplicate,true);assert.equal(retry.receivedAt,first.receivedAt);
 await call(student,{...packet,events:[{...event,code:'failed'}]},409);await call(student,{...packet,batchId:'batch-id-0000000002'},429);
 await call(student,{...packet,events:[{...event,query:'not-to-store'}]},400);await call(student,{action:'searchStudents',query:'Синтетический'},403);
 assert.equal((await raw(ROOT,{token:student.token})).status,401);assert.equal((await raw(ROOT,{token:teacher.token})).status,401);
 assert.equal((await raw(ROOT+'/sessions/fake-session-00001',{method:'PUT',token:student.token,value:{uid:student.uid}})).status,401);
 assert.equal((await raw('rudn-platform/v1/diagnosticSessions/'+student.uid+'/s0',{method:'PUT',token:student.token,value:{sessionId:'a'.repeat(32),updatedAt:Date.now(),expiresAt:Date.now()+600000}})).status,401);
 const retiredPath='rudn-platform/v1/diagnostics/'+student.uid+'/s0/b0';await raw(retiredPath,{method:'PUT',value:{expiresAt:Date.now()-1000}});assert.equal((await raw(retiredPath,{method:'DELETE',token:teacher.token})).status,401);
 const names=await call(teacher,{action:'searchStudents',query:'синтет',group:'ГГУбд-01-26'});assert.equal(names.items[0].studentKey,ticket);
 await raw('rudn-platform/v1/profiles/777777777',{method:'PUT',value:{studentKey:'777777777',fullName:'Эмулятор Индекс',group:'ГГУбд-03-26',ownerUids:{[student.uid]:true}}});
 let indexed=false;for(let retry=0;retry<20;retry++){if((await call(teacher,{action:'searchStudents',query:'эмулятор'})).items.length){indexed=true;break;}await new Promise(resolve=>setTimeout(resolve,300));}assert.equal(indexed,true,'profile event updates name index before student opens a diagnostic session');
 const listed=await call(teacher,{action:'listSessions',studentKey:ticket,filters:{module:'seminar-4',browser:'safari',code:'ok'}});assert.equal(listed.items.length,1);
 const events=await call(teacher,{action:'readEvents',sessionId:session.sessionId});assert.equal(events.items[0].found,true);
 const download=await call(teacher,{action:'createExport',sessionId:session.sessionId}),file=await fetch(download.downloadURL);assert.equal(file.status,200);assert.match(file.headers.get('content-disposition'),/^attachment;/);const lines=(await file.text()).trim().split('\n').map(JSON.parse);assert.equal(lines[0].kind,'session');assert.equal(lines.at(-1).complete,true);assert.equal((await fetch(download.downloadURL)).status,410);
 const preview=await call(teacher,{action:'previewDelete',scope:'session',sessionId:session.sessionId});let deletion=await call(teacher,{action:'delete',confirmationToken:preview.confirmationToken});while(deletion.job.state!=='complete')deletion=await call(teacher,{action:'status',jobId:deletion.job.jobId});
 await call(student,opening('client-session-0001',ticket),409);await call(student,packet,404);assert.equal((await raw(ROOT+'/batches/'+session.sessionId)).value,null);
 // Direct restricted Admin writer must also fail, proving the delete/append race
 // cannot be bypassed by an operation that read the session before its deletion.
 const writer=initializeApp({projectId:'demo-rudn',databaseURL:'https://demo-rudn-default-rtdb.firebaseio.com',databaseAuthVariableOverride:{uid:'diagnostics-service',token:{diagnosticsService:true}}},'diag-test-writer');
 const writerDb=getDatabase(writer);await assert.rejects(writerDb.ref(ROOT+'/batches/'+session.sessionId+'/late-batch-00000001').set({sessionId:session.sessionId}));
 console.log(JSON.stringify({status:'pass',environment:'Functions/Auth/RTDB emulators',checks:['teacher-only API','no direct client read/write','profile ownership','anonymous isolation','idempotent retry','batch conflict','30s rate cap','unknown-field rejection','name and global filters','manual-delete tombstone','late restricted writer denied']}));
 await writer.delete();
});
test('emulator unknown-ack recovery repairs batch index; generation fences preserve fresh sessions',async()=>{
 const adminApp=initializeApp({projectId:'demo-rudn',databaseURL:'https://demo-rudn-default-rtdb.firebaseio.com'},'diag-test-admin'),writerApp=initializeApp({projectId:'demo-rudn',databaseURL:'https://demo-rudn-default-rtdb.firebaseio.com',databaseAuthVariableOverride:{uid:'diagnostics-service',token:{diagnosticsService:true}}},'diag-test-writer2'),db=getDatabase(adminApp),ingestDb=getDatabase(writerApp);let stamp=Date.now(),service=createDiagnosticsService({db,ingestDb,now:()=>stamp});
 const user=await login(),auth={uid:user.uid},admin={uid:'synthetic-teacher',email:'omnistat@yandex.ru'},ticket='987654321';await db.ref('rudn-platform/v1/profiles/'+ticket).set({studentKey:ticket,fullName:'Тест Пагинация',group:'ГГУбд-02-26',ownerUids:{[user.uid]:true}});
 const session=await service.handle(opening('client-service-0001',ticket),auth),p={action:'append',sessionId:session.sessionId,batchId:'batch-service-0001',events:[event]};await service.handle(p,auth);await db.ref(ROOT+'/batchIndex/'+session.sessionId).remove();await service.handle(p,auth);assert.equal(Object.keys((await db.ref(ROOT+'/batchIndex/'+session.sessionId).get()).val()).length,1);
 const preview=await service.handle({action:'previewDelete',scope:'student',studentKey:ticket},admin);let result=await service.handle({action:'delete',confirmationToken:preview.confirmationToken},admin);while(result.job.state!=='complete')result=await service.handle({action:'status',jobId:result.job.jobId},admin);
 stamp+=30001;const fresh=await service.handle(opening('client-service-0002',ticket),auth);assert.equal(fresh.generation,1);await service.handle({action:'append',sessionId:fresh.sessionId,batchId:'batch-service-0002',events:[event]},auth);
 assert.equal((await service.handle({action:'listSessions',studentKey:ticket},admin)).items.length,1);
 await adminApp.delete();await writerApp.delete();
});
