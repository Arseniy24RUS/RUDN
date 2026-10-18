// Auth + RTDB emulator only. No production URLs, profiles or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseRestTransport} from '../site/assets/js/firebase-rest.js';
import {detectEnvironment,sanitizeDiagnosticEvent} from '../site/assets/js/diagnostics.js';
import {claimDiagnosticSession,writeDiagnosticBatch,confirmDiagnosticBatch} from '../site/assets/js/diagnostics-transport.js';
const base='http://127.0.0.1:9000',root='rudn-platform/v1',ns='demo-rudn-default-rtdb';
async function login(teacher=false){const call=async(method,body)=>{const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:'+method+'?key=demo-rudn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}};const credentials=teacher?{email:'omnistat@yandex.ru',password:'diagnostic-emulator-only',returnSecureToken:true}:{returnSecureToken:true};let r=await call('signUp',credentials);if(teacher&&r.status!==200)r=await call('signInWithPassword',credentials);assert.equal(r.status,200);return {uid:r.data.localId,getIdToken:async()=>r.data.idToken};}
const transport=user=>createFirebaseRestTransport({databaseURL:base,namespace:ns,rootPath:root,getUser:()=>user});
const denied=promise=>assert.rejects(promise,e=>e.code==='database/permission-denied');
async function seed(path,value){const r=await fetch(base+'/'+root+'/'+path+'.json?ns='+ns,{method:'PUT',headers:{Authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify(value)});assert.equal(r.status,200)}
function payload(session='a'.repeat(32)){const stamp=Date.now();return {schema:1,batchId:crypto.randomUUID().replaceAll('-',''),writtenAt:{'.sv':'timestamp'},sessionId:session,reportCode:session.slice(0,12).toUpperCase(),build:'diagnostic-test',createdAt:stamp,expiresAt:stamp+2592000000,environment:detectEnvironment({navigator:{userAgent:'test'},innerWidth:390,innerHeight:844}),selfReport:{model:'iPhone 15',os:'18.7'},events:{e0:sanitizeDiagnosticEvent('document-jump',{docId:'koap',success:true,found:true,visible:true,code:'ok',durationMs:123},{module:'seminar-4',locale:'ru',at:stamp})}}}
test('bounded diagnostics, privacy schema, session claims, rate and expiry rules',async()=>{
 const user=await login(),peer=await login(),teacher=await login(true),own=transport(user),other=transport(peer),admin=transport(teacher),path=`diagnostics/${user.uid}/s0/b0`,claimPath=`diagnosticSessions/${user.uid}/s0`,session='a'.repeat(32),value=payload(session),stamp=Date.now();
 await denied(own.put(path,value));
 await own.put(claimPath,{sessionId:session,updatedAt:stamp,expiresAt:stamp+600000});
 await denied(other.put(claimPath,{sessionId:'b'.repeat(32),updatedAt:stamp,expiresAt:stamp+600000}));
 await denied(own.put(claimPath,{sessionId:'b'.repeat(32),updatedAt:stamp,expiresAt:stamp+600000}));
 await denied(own.put(claimPath.replace('s0','s4'),{sessionId:session,updatedAt:stamp,expiresAt:stamp+600000}));
 // Two same-UID tabs race for an empty fixed slot: only one CAS claim wins.
 const claimRace=`diagnosticSessions/${user.uid}/s1`;
 const claims=await Promise.all(['b','c'].map(char=>own.transaction(claimRace,current=>current?undefined:{sessionId:char.repeat(32),updatedAt:stamp,expiresAt:stamp+600000})));
 assert.equal(claims.filter(x=>x.committed).length,1);
 await own.put(path,value);const stored=(await own.get(path)).value;assert.equal(typeof stored.writtenAt,'number');
 await denied(other.get(path));await denied(other.put(path,payload()));await denied(own.get('diagnostics'));assert.ok((await admin.get('diagnostics')).value[user.uid]);
 await denied(own.put(path,payload()));
 for(const mutation of [v=>v.query='secret',v=>v.environment.userAgent='raw',v=>v.events.e0.answer='secret',v=>v.events.e0.message='secret',v=>v.events.e12={...v.events.e0},v=>v.selfReport.model='x'.repeat(61),v=>v.events.e0.durationMs=3600001,v=>v.createdAt=Date.now()+600000]){const invalid=payload();mutation(invalid);await denied(own.put(path.replace('b0','b1'),invalid));}
 await denied(own.put(path.replace('b0','b8'),payload()));await denied(own.put(path.replace('s0','s4'),payload()));await denied(own.put(path.replace(user.uid,peer.uid),payload()));
 const expired=payload();expired.createdAt=Date.now()-2592000001;expired.expiresAt=expired.createdAt+2592000000;await denied(own.put(path.replace('b0','b2'),expired));
 await denied(admin.put(path,null));await seed(path,{...stored,createdAt:Date.now()-2592001000,expiresAt:Date.now()-1000});await admin.put(path,null);assert.equal((await own.get(path)).value,null);
 await seed(claimPath,{sessionId:session,updatedAt:Date.now()-700000,expiresAt:Date.now()-100000});await denied(own.put(path,payload()));await own.put(claimPath,{sessionId:'d'.repeat(32),updatedAt:Date.now(),expiresAt:Date.now()+600000});await denied(own.put(path,payload(session)));await own.put(path,payload('d'.repeat(32)));
 // Re-read after a deliberately discarded acknowledgement finds the same id.
 const ack=(await own.get(path)).value;const replay=await own.transaction(path,current=>{assert.equal(current.batchId,ack.batchId);return undefined});assert.equal(replay.committed,false);assert.equal(replay.value.expiresAt,ack.expiresAt);
 // Exercise the actual transport adapter, including concurrent fixed-slot claims.
 const isolated=await login(),isolatedTransport=transport(isolated),sessions=['e','f','1','2','3'].map(x=>x.repeat(32));
 const slots=await Promise.all(sessions.map(sessionId=>claimDiagnosticSession({transport:isolatedTransport,uid:isolated.uid,sessionId,preferredSlot:0,now:Date.now})));
 assert.equal(slots.filter(x=>x===null).length,1);assert.equal(new Set(slots.filter(x=>x!==null)).size,4);
 const firstIndex=slots.findIndex(x=>x!==null),firstSession=sessions[firstIndex],firstSlot='s'+slots[firstIndex],batchValue=payload(firstSession);delete batchValue.writtenAt;
 let loseAck=true;const flaky=createFirebaseRestTransport({databaseURL:base,namespace:ns,rootPath:root,getUser:()=>isolated,fetchImpl:async(url,options)=>{const response=await fetch(url,options);if(loseAck&&options.method==='PUT'&&new URL(url).pathname.includes('/diagnostics/')){loseAck=false;assert.equal(response.status,200);throw Error('Synthetic lost acknowledgement')}return response}});
 const writeOptions={uid:isolated.uid,slot:firstSlot,batch:'b0',value:batchValue};await assert.rejects(writeDiagnosticBatch({...writeOptions,transport:flaky}));
 const committed=(await isolatedTransport.get(`diagnostics/${isolated.uid}/${firstSlot}/b0`)).value;
 assert.equal(await writeDiagnosticBatch({...writeOptions,transport:isolatedTransport}),true);assert.equal(await confirmDiagnosticBatch({...writeOptions,transport:isolatedTransport}),true);
 assert.equal((await isolatedTransport.get(`diagnostics/${isolated.uid}/${firstSlot}/b0`)).value.writtenAt,committed.writtenAt,'replay did not write or extend retention');
 await assert.rejects(writeDiagnosticBatch({...writeOptions,transport:isolatedTransport,value:{...batchValue,build:'changed'}}),e=>e.code==='diagnostics/batch-conflict');
 for(let i=0;i<22;i++)await seed('diagnostics/diag-page-owner'+String(i).padStart(2,'0')+'/s0/b0',{...payload(),writtenAt:Date.now()});
 const limited=(await admin.get('diagnostics',{query:{orderBy:'$key',limitToFirst:2,startAt:'diag-page-owner00'}})).value;
 assert.deepEqual(Object.keys(limited).sort(),['diag-page-owner00','diag-page-owner01']);
 await denied(own.get('diagnostics',{query:{orderBy:'$key',limitToFirst:1,startAt:user.uid}}));
 console.log(JSON.stringify({status:'pass',environment:'Auth/RTDB emulators',checks:['owner-only writes','teacher-only global read','no foreign read','four fixed claims','eight fixed batches','12 events','unknown fields rejected','size limits','rate limit','expired cleanup','live claim cannot be stolen','concurrent same-UID CAS claim','old session denied after reclamation','lost acknowledgement read recovery']}));
});
