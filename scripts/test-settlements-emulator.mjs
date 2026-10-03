// Local demo emulators only: firebase emulators:exec --project demo-rudn
// --config firebase.puzzle.json --only auth,database "node --test scripts/test-settlements-emulator.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseRestTransport} from '../site/assets/js/firebase-rest.js';
import {harness} from './test-settlements-storage.mjs';

const db='http://127.0.0.1:9000',namespace='demo-rudn-default-rtdb';
async function login(){
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-rudn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
  assert.equal(response.status,200);const result=await response.json();return {uid:result.localId,getIdToken:async()=>result.idToken};
}
const makeTransport=(user,fetchImpl=fetch)=>createFirebaseRestTransport({databaseURL:db,namespace,rootPath:'rudn-platform/v1',getUser:()=>user,fetchImpl});
test('Firebase emulator authorizes owned final head, best grade and private-bound public row; rejects forged rows and cross-profile writes',async()=>{
  const user=await login(),outsider=await login(),studentKey=String(Date.now()),foreign=makeTransport(outsider);
  let loseNextLeaderboardAck=true;
  const transport=makeTransport(user,async(url,options)=>{
    assert.equal(new URL(url).hostname,'127.0.0.1');
    const response=await fetch(url,options);
    if(loseNextLeaderboardAck && options.method==='PUT' && new URL(url).pathname.includes('/settlementsLeaderboard/')){
      assert.equal(response.status,200,'server wrote public result before simulated disconnection');loseNextLeaderboardAck=false;
      throw new TypeError('Synthetic lost acknowledgement');
    }
    return response;
  });
  await transport.put(`profiles/${studentKey}`,{studentKey,ticket:studentKey,email:`${studentKey}@rudn.ru`,fullName:'Synthetic Student',group:'ГГУбд-01-26',ownerUid:user.uid,ownerUids:{[user.uid]:true}});
  const h=harness(transport,{studentKey,uid:user.uid});
  const session={attemptId:`settlement-${studentKey}`,regionId:'chelyabinsk',difficulty:'normal',engineSave:{actions:['build']},elapsedMs:42000,status:'active'};
  const result={terminal:true,coverageNp:90,coveragePopulation:98.5,turns:1,spentMillionRub:10,reason:'budget_exhausted'};
  try{
    await h.adapter.acquireWriter();await h.adapter.saveSession({...session,engineSave:null,elapsedMs:0});assert.equal(await h.adapter.confirmOnline(),true);
    await h.adapter.saveSession({...session,engineSave:{actions:[]}});assert.equal(await h.adapter.confirmOnline(),true);
    const otherDevice=harness(transport,{studentKey,uid:user.uid,device:'fresh-emulator-device'});
    try{await otherDevice.adapter.acquireWriter();assert.deepEqual((await otherDevice.adapter.loadSession()).engineSave.actions,[],'RTDB preserves exact empty replay across devices')}finally{await otherDevice.close()}
    await h.adapter.saveSession(session);assert.equal(await h.adapter.confirmOnline(),true);
    // The immutable result carries the finish-time name/group snapshot. A later
    // profile edit from another device must not strand its queued delivery.
    const updatedProfile=(await transport.get(`profiles/${studentKey}`)).value;
    await transport.put(`profiles/${studentKey}`,{...updatedProfile,fullName:'Synthetic Updated Name',group:'ГГУбд-02-26'});
    await h.adapter.completeSession(session,result);await h.adapter.flush();
    const completed=await h.adapter.loadSession();
    const pending=await h.store.listPending({owner:h.owner,includeDeferred:true});
    assert.equal(completed.status,'completed',JSON.stringify(pending.map(op=>({type:op.type,error:op.lastError}))));
    assert.equal((await transport.get(`grades/${studentKey}/seminar-3`)).value.points,4);
    const row=(await transport.get(`settlementsLeaderboard/assessment/normal/${session.attemptId}`)).value;
    assert.equal(loseNextLeaderboardAck,false,'lost acknowledgement was exercised');
    assert.equal(Object.keys((await transport.get(`attempts/${studentKey}`)).value).length,1,'uncertain retry did not duplicate the immutable attempt');
    assert.equal(row.coverageNp,90);assert.equal(row.spentMillionRub,10);
    for(const field of ['studentKey','uid','ownerUid','ticket','email'])assert.equal(field in row,false);
    await assert.rejects(foreign.get(`settlementsOwners/${session.attemptId}`),{code:'database/permission-denied'});
    await assert.rejects(foreign.put(`settlementsLeaderboard/assessment/normal/forged-${studentKey}`,{...row,id:`forged-${studentKey}`}),{code:'database/permission-denied'});
    await assert.rejects(transport.put(`settlementsLeaderboard/assessment/normal/${session.attemptId}`,{...row,spentMillionRub:0}),{code:'database/permission-denied'});
    await assert.rejects(transport.put(`attempts/${studentKey}/bad-${studentKey}`,{id:`bad-${studentKey}`,studentKey,ownerUid:user.uid,createdAt:new Date().toISOString(),activitySlug:'seminar-3',type:'settlements',mode:'assessment',difficulty:'easy',regionId:'chelyabinsk',points:5,recordGrade:true,result}),{code:'database/permission-denied'});
    const finalPath=`checkpoints/${studentKey}/seminar-3/${session.attemptId}`;
    const envelope=(await transport.get(finalPath)).value;
    await assert.rejects(transport.put(finalPath,{...envelope,revision:envelope.revision+1,current:{...envelope.current,state:{...envelope.current.state,status:'active'}}}),{code:'database/permission-denied'});
    await assert.rejects(foreign.put(finalPath,envelope),{code:'database/permission-denied'});
    await assert.rejects(transport.put(`grades/${studentKey}/seminar-3`,{points:5,max:5,sourceAttemptId:session.attemptId,ownerUid:user.uid}),{code:'database/permission-denied'});
    const forgedId=`mismatched-${studentKey}`;
    const forgedCheckpoint={...envelope,attemptId:forgedId,current:{...envelope.current,attemptId:forgedId,state:{...envelope.current.state,attemptId:forgedId}}};
    await transport.put(`checkpoints/${studentKey}/seminar-3/${forgedId}`,forgedCheckpoint);
    const original=(await transport.get(`attempts/${studentKey}/${session.attemptId}`)).value;
    await assert.rejects(transport.put(`attempts/${studentKey}/${forgedId}`,{...original,id:forgedId,leaderboard:{...row,id:forgedId,spentMillionRub:0}}),{code:'database/permission-denied'},'leaderboard metrics must equal immutable result and final checkpoint');
  }finally{await h.close()}
});
