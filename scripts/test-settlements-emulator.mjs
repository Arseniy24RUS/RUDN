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

for(const choice of ['local','cloud'])test(`Firebase emulator retains tutorial branches until explicit ${choice} choice and preserves completed gate`,async()=>{
  const user=await login(),studentKey=String(Date.now()),transport=makeTransport(user);
  await transport.put(`profiles/${studentKey}`,{studentKey,ticket:studentKey,email:`${studentKey}@rudn.ru`,fullName:'Synthetic Tutorial Conflict',group:'ГГУбд-01-26',ownerUid:user.uid,ownerUids:{[user.uid]:true}});
  let offline=false;
  const connected={get:async(...args)=>{if(offline)throw Object.assign(new Error('Synthetic offline'),{code:'network/offline'});return transport.get(...args)},transaction:async(...args)=>{if(offline)throw Object.assign(new Error('Synthetic offline'),{code:'network/offline'});return transport.transaction(...args)}};
  const a=harness(connected,{studentKey,uid:user.uid,device:'tutorial-emulator-local'}),b=harness(connected,{studentKey,uid:user.uid,device:'tutorial-emulator-cloud'});
  const path=`checkpoints/${studentKey}/settlements-tutorial/tutorial-v1`;
  try{
    await a.adapter.acquireWriter();await a.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}});await a.adapter.flush();
    await b.adapter.acquireWriter();assert.deepEqual((await b.adapter.loadTutorial()).engineSave.actions,[]);
    offline=true;
    await a.adapter.saveTutorial({completed:false,step:2,engineSave:{actions:['local']}});await a.adapter.flush();
    await b.adapter.saveTutorial({completed:true,step:6,engineSave:{actions:['cloud']}});await b.adapter.flush();
    offline=false;await b.adapter.flush();await a.adapter.flush();
    const conflicted=(await transport.get(path)).value;
    assert.equal(Object.keys(conflicted.conflicts).length,1);assert.equal(conflicted.current.state.completed,true);
    assert.deepEqual(JSON.parse(conflicted.current.state.engineSave).actions,['cloud']);
    assert.deepEqual(JSON.parse(Object.values(conflicted.conflicts)[0].state.engineSave).actions,['local']);
    assert.equal(a.adapter.canWrite(),false);assert.equal(a.conflicts.at(-1).scope,'tutorial');
    assert.deepEqual((await a.adapter.loadTutorial()).engineSave.actions,['local'],'restoring an ACKed conflict retains the local replay');
    await assert.rejects(a.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}}),{code:'storage/conflict'});
    assert.equal(await a.adapter.resolveConflict(choice),null);
    const chosen=await a.adapter.loadTutorial();assert.equal(chosen.completed,true);assert.deepEqual(chosen.engineSave.actions,[choice]);
    assert.equal(chosen.step,choice==='local'?2:6);assert.equal(a.adapter.canWrite(),true);
    const resolved=(await transport.get(path)).value;assert.equal(resolved.revision,conflicted.revision+1);assert.equal(resolved.conflicts,undefined);
    const history=Object.values(resolved.conflictHistory);assert.equal(history.length,1);
    assert.deepEqual(JSON.parse(history[0].branches.local.state.engineSave).actions,['local']);
    assert.deepEqual(JSON.parse(history[0].branches.cloud.state.engineSave).actions,['cloud']);
    assert.equal((await transport.get(`attempts/${studentKey}`)).value,null);assert.equal((await transport.get(`grades/${studentKey}`)).value,null);
    await a.adapter.saveTutorial({completed:false,step:0,engineSave:{actions:[]}});await a.adapter.flush();
    const undone=(await transport.get(path)).value;assert.equal(undone.current.state.completed,true);assert.equal(undone.current.state.step,0);assert.deepEqual(JSON.parse(undone.current.state.engineSave).actions,[]);
  }finally{await a.close();await b.close()}
});
