// Run only against the local demo Firebase Auth + Realtime Database emulators.
import assert from 'node:assert/strict';
import {createFirebaseRestTransport} from '../site/assets/js/firebase-rest.js';
import {createDurableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync,commitStudentAttempt} from '../site/assets/js/checkpoint-sync.js';
import {commitPuzzleLeaderboard} from '../site/assets/js/puzzle-storage.js';
const namespace='demo-rudn-default-rtdb';
const databaseURL='http://127.0.0.1:9000';
const authURL='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-rudn';
const response=await fetch(authURL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
assert.equal(response.status,200,'anonymous login to local auth emulator');
const login=await response.json(),user={uid:login.localId,getIdToken:async()=>login.idToken};
const studentKey=String(Date.now()),owner=`student:${studentKey}`;
let offline=false,loseNextResultAck=false;
const fetchImpl=async(url,options)=>{
  assert.equal(new URL(url).hostname,'127.0.0.1','test must never access production');
  if(offline)throw new TypeError('Simulated disconnection');
  const response=await fetch(url,options);
  if(loseNextResultAck&&options.method==='PUT'&&new URL(url).pathname.startsWith('/results/')){
    assert.equal(response.status,200,'server accepted result before disconnect');loseNextResultAck=false;
    throw new TypeError('Acknowledgment lost after commit');
  }
  return response;
};
const options={databaseURL,namespace,getUser:()=>user,fetchImpl};
const transport=createFirebaseRestTransport({...options,rootPath:'rudn-platform/v1'});
const leaderboardTransport=createFirebaseRestTransport({...options,rootPath:'results'});
await transport.put(`profiles/${studentKey}`,{studentKey,ticket:studentKey,email:`${studentKey}@rudn.ru`,fullName:'Emulator Puzzle Test',group:'ГГУбд-01-26',ownerUid:user.uid,ownerUids:{[user.uid]:true}});
const storageMap=new Map(),storage={get length(){return storageMap.size},key:i=>[...storageMap.keys()][i]??null,getItem:key=>storageMap.get(key)??null,setItem:(key,value)=>storageMap.set(key,String(value)),removeItem:key=>storageMap.delete(key)};
const store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null,databaseName:'puzzle-emulator-test'});
const scope={owner,activitySlug:'seminar-2',mode:'seminar',attemptId:`puzzle-${studentKey}`};
const record={id:scope.attemptId,studentKey,type:'map-puzzle',activitySlug:'seminar-2',draftMode:'seminar',recordGrade:true,points:5,createdAt:new Date().toISOString(),leaderboard:{fio:'Emulator Puzzle Test',group:'ГГУбд-01-26',difficulty:'hard',time_ms:6000,placed:89,total:89,timestamp:Date.now(),user_agent:'isolated emulator'}};
const saved=store.complete({...scope,state:{finished:true,placed:89,finishedResult:{points:5,durationMs:6000}},attempt:record});
assert.ok([...storageMap.keys()].some(key=>key.startsWith('rudn.durable.journal.v1:')),'completion has synchronous recovery journal before any await');
await saved;
const sync=createCheckpointSync({store,transport,deviceId:'isolated-puzzle-device',getIdentity:()=>({owner,studentKey,uid:user.uid,generation:0}),commitAttempt:async(attempt,{signal,active})=>{
  const result=await commitStudentAttempt(transport,attempt,{studentKey,uid:user.uid,activityMax:{'seminar-2':5},signal,active});
  await commitPuzzleLeaderboard(leaderboardTransport,attempt.id,attempt.leaderboard,{signal,active});return result;
}});
offline=true;
const unavailable=await sync.flush();assert.ok(unavailable.deferred>=1,'offline work remains queued');
assert.equal((await store.loadDraft(scope)).state.placed,89,'offline final screen remains saved');
offline=false;
for(const operation of await store.listPending({owner,includeDeferred:true}))await store.retry(operation.id,{revision:operation.revision});
loseNextResultAck=true;
const lost=await sync.flush();assert.ok(lost.deferred>=1,'lost result acknowledgment retains retry');
for(const operation of await store.listPending({owner,includeDeferred:true}))await store.retry(operation.id,{revision:operation.revision});
await sync.flush();assert.equal((await store.listPending({owner,includeDeferred:true})).length,0,'reconnect acknowledges one matching immutable result');
await commitPuzzleLeaderboard(leaderboardTransport,record.id,record.leaderboard);
assert.deepEqual((await leaderboardTransport.get(record.id)).value,record.leaderboard,'one public result with the stable attempt ID');
await assert.rejects(()=>leaderboardTransport.put(record.id,record.leaderboard),error=>error.code==='database/permission-denied','real append-only rules reject overwrite');
await commitStudentAttempt(transport,{...record,id:`${record.id}-lower`,points:3,leaderboard:undefined},{studentKey,uid:user.uid,activityMax:{'seminar-2':5}});
assert.equal((await transport.get(`grades/${studentKey}/seminar-2`)).value.points,5,'lower later grade cannot replace the best grade');
assert.equal(Object.keys((await transport.get(`attempts/${studentKey}`)).value).length,2,'retry did not duplicate the original attempt');
sync.stop();store.close();
console.log(JSON.stringify({passed:true,project:'demo-rudn',scenarios:['anonymous auth and owned student profile','synchronous completion recovery journal','offline final state with durable outbox','reconnection and real rule-authorized grade','lost response after leaderboard commit','stable attempt IDs and append-only result rules','one result and no duplicate attempts','best grade does not decrease']},null,2));
