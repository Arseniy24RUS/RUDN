import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createDurableStore,durableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync,commitStudentAttempt} from '../site/assets/js/checkpoint-sync.js';
import {createLegalLabPersistence} from '../site/assets/js/legal-lab-storage.js';
import {syntheticTransport} from '../scripts/test_legal_lab_conflict.mjs';

// Real persistence and sync modules; isolated maps replace devices/network only.
// All people, answers and credentials below are synthetic, never production.
const owner='student:five-synthetic',studentKey='five-synthetic',uid='synthetic-uid',version='five-test-v1',period='synthetic-period';
const copy=value=>structuredClone(value);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const memoryStorage=()=>{const data=new Map();return {get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
const retryId=(base,n)=>base+'-r-'+`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const assessment=(base,n)=>({attemptId:retryId(base,n),format:'five-task-v1',contentVersion:version,caseId:'F'+n,phase:'answering',startedAt:1000+n,
  answer:{assessmentMode:'five-task-v1',tasks:{}},documentVersions:{synthetic:'pinned'},delivery:'not-submitted'});
const workspace=base=>({schema:1,id:'synthetic-workspace',contentVersion:version,answers:{Q1:{submitted:true}},reader:{},quizCompletion:{contentVersion:version,finishedAt:999},view:'assessment',assessment:assessment(base,1),assessmentHistory:[]});
const finished=(state,points=4)=>{const next=copy(state);Object.assign(next.assessment,{phase:'completed',finishedAt:2000,result:{points,maxPoints:5,criteria:[{id:'synthetic',points,max:5}]},delivery:'pending'});return next;};
const attemptOf=state=>{const a=state.assessment;return{id:a.attemptId,type:'legal-lab',activitySlug:'seminar-4',recordGrade:true,contentVersion:version,caseId:a.caseId,
  points:a.result.points,maxPoints:5,startedAt:a.startedAt,finishedAt:a.finishedAt,createdAt:new Date(a.finishedAt).toISOString(),
  legalLab:{answer:copy(a.answer),answerJson:JSON.stringify(a.answer),criteria:copy(a.result.criteria),documentVersions:copy(a.documentVersions)}};};
function fixture(){
  const network=syntheticTransport(),devices=[];
  function device(name,storage=memoryStorage()){
    const store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null,databaseName:name});
    const backend={generation:1,user:{uid},getProfile(){return this.profile;},profile:{studentKey},loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,o),restTransport:()=>network.transport};
    const sync=createCheckpointSync({store,deviceId:name,getIdentity:()=>({owner,studentKey,uid:backend.user.uid,generation:backend.generation}),transport:network.transport,
      commitAttempt:(attempt,options)=>commitStudentAttempt(network.transport,attempt,{studentKey,uid,activityMax:{'seminar-4':5},...options})});backend.durableSync=()=>sync;
    backend.saveAttempt=async attempt=>{
      const scope={owner,activitySlug:'seminar-4',mode:attempt.draftMode,attemptId:attempt.id},previous=await store.loadDraft(scope);
      await store.complete({...scope,contentVersion:version,state:{...previous?.state,phase:'completed',resultAttempt:copy(attempt)},attempt:copy(attempt)});return attempt;
    };
    const persistence=createLegalLabPersistence({backend,store,owner,period,contentVersion:version});
    const d={store,storage,sync,backend,persistence,base:persistence.attemptId,
      scope:{owner,activitySlug:'seminar-4',mode:'legal-lab-workspace',attemptId:persistence.attemptId},
      checkpoint:state=>persistence.checkpoint({state,contentVersion:version}),
      async retry(){for(const op of await store.listPending({owner,includeDeferred:true,limit:1000}))await store.retry(op.id,{revision:op.revision});return sync.flush();},
      close(){persistence.destroy();sync.stop();store.close();}};devices.push(d);return d;
  }
  return{...network,device,async get(path){return(await network.transport.get(path)).value;},close(){for(const d of devices)d.close();}};
}
after(()=>durableStore.close());

test('five-task receipt completes a distinct scope; workspace and prior grades survive duplicate/offline delivery',async()=>{
  const f=fixture();try{
    await commitStudentAttempt(f.transport,{id:'old-quiz',studentKey,activitySlug:'seminar-4',points:5,maxPoints:5,type:'quiz',createdAt:new Date(1).toISOString()},{studentKey,uid,activityMax:{'seminar-4':5}});
    const d=f.device('five-one');await d.persistence.load();const state=finished(workspace(d.base));await d.checkpoint(state);
    f.setOffline(true);await d.persistence.saveAttempt(attemptOf(state));assert.ok((await d.sync.flush()).deferred>0);
    assert.equal((await d.store.loadDraft(d.scope)).phase,'answering');assert.equal((await d.store.listAttempts({owner})).length,1);
    f.setOffline(false);f.setLoseAttemptAck(true);await d.retry();assert.equal(f.ackLossPending(),false);assert.ok((await d.store.listPending({owner,includeDeferred:true})).some(op=>op.type==='attempt'));
    await d.retry();await d.persistence.saveAttempt(attemptOf(state));await d.retry();
    assert.equal(Object.keys(await f.get('attempts/'+studentKey)).length,2);assert.equal((await f.get('grades/'+studentKey+'/seminar-4')).points,5);
    state.assessment.delivery='host-accepted';await d.checkpoint(state);await d.retry();
    const restored=f.device('five-two');assert.deepEqual(await restored.persistence.load(),state);
    const terminal=await restored.store.loadDraft({...d.scope,mode:'legal-lab-assessment',attemptId:state.assessment.attemptId});assert.equal(terminal.phase,'completed');assert.equal(terminal.state.legalLabParent.mode,'legal-lab-workspace');
  }finally{f.close();}
});

test('new retries and history restore through a sidecar without changing a completed legacy primary',async()=>{
  const f=fixture();try{
    const d=f.device('legacy-retries');await d.persistence.load();const legacy=workspace(d.base);
    legacy.assessment={attemptId:d.base,contentVersion:version,caseId:'A11',phase:'completed',startedAt:100,finishedAt:200,answer:{metadata:{issuer:'issuer'},classifications:{},documentIds:[],selections:[]},documentVersions:{},result:{points:5,maxPoints:5,criteria:[]},delivery:'pending'};
    await d.checkpoint(legacy);await d.persistence.saveAttempt(attemptOf(legacy));await d.retry();const original=await f.get('checkpoints/'+studentKey+'/seminar-4/'+d.base);
    legacy.assessment.delivery='host-accepted';await d.checkpoint(legacy);await d.retry();
    const next=copy(legacy);next.assessmentHistory.push(copy(legacy.assessment));next.assessment=assessment(d.base,2);await d.checkpoint(next);await d.retry();
    const other=f.device('legacy-retries-other');assert.deepEqual(await other.persistence.load(),next);
    const done=finished(next,2);await other.checkpoint(done);await other.persistence.saveAttempt(attemptOf(done));done.assessment.delivery='host-accepted';await other.checkpoint(done);await other.retry();
    assert.deepEqual(await f.get('checkpoints/'+studentKey+'/seminar-4/'+d.base),original);
    const again=copy(done);again.assessmentHistory.push(copy(done.assessment));again.assessment=assessment(d.base,3);await other.checkpoint(again);await other.retry();
    const fresh=f.device('legacy-fresh');assert.deepEqual(await fresh.persistence.load(),again);assert.equal((await f.get('grades/'+studentKey+'/seminar-4')).points,5);assert.equal(Object.keys(await f.get('attempts/'+studentKey)).length,2);
  }finally{f.close();}
});

test('retry identity, exact current answer/result, profile and immutable history are enforced',async()=>{
  const f=fixture();try{
    const d=f.device('guards');await d.persistence.load();const state=finished(workspace(d.base));await d.checkpoint(state);
    for(const mutation of [a=>a.id=d.base+'-r-not-a-uuid',a=>a.id=retryId('foreign-owner',1),a=>a.id=retryId(d.base,2),a=>a.caseId='F-other',a=>a.points=99,a=>a.legalLab.answer.tasks={forged:{}},a=>a.legalLab.answerJson='{}',a=>a.legalLab.documentVersions={foreign:'x'}]){
      const attempt=attemptOf(state);mutation(attempt);await assert.rejects(d.persistence.saveAttempt(attempt));
    }
    await assert.rejects(d.persistence.saveAttempt({...attemptOf(state),id:d.base}),{code:'legal-lab/attempt-identity-mismatch'});
    assert.equal((await d.store.listAttempts({owner})).length,0);await d.persistence.saveAttempt(attemptOf(state));
    const changed=copy(state);changed.assessment.answer.tasks.forged={};await assert.rejects(d.checkpoint(changed),{code:'legal-lab/result-already-final'});
    const next=copy(state);next.assessmentHistory.push(copy(state.assessment));next.assessment=assessment(d.base,2);next.assessment.delivery='host-accepted';await d.checkpoint(next);
    const loaded=await d.persistence.load();assert.equal(loaded.assessment.delivery,'pending','An old receipt cannot accept a new attempt');
    const dropped=copy(loaded);dropped.assessmentHistory=[];await assert.rejects(d.checkpoint(dropped),{code:'legal-lab/assessment-history-changed'});
    const rewritten=copy(loaded);rewritten.assessmentHistory[0].result.points=0;await assert.rejects(d.checkpoint(rewritten),{code:'legal-lab/assessment-history-changed'});
    d.backend.profile={studentKey:'other'};await assert.rejects(d.checkpoint(loaded),{code:'auth/profile-changed'});await assert.rejects(d.persistence.saveAttempt(attemptOf(state)),{code:'auth/profile-changed'});
  }finally{f.close();}
});

test('a stale offline terminal cannot bypass its workspace conflict or a cloud resolution',async()=>{
  const f=fixture();try{
    const a=f.device('conflict-a');await a.persistence.load();const initial=workspace(a.base);await a.checkpoint(initial);await a.retry();
    const b=f.device('conflict-b');assert.deepEqual(await b.persistence.load(),initial);
    const cloud=copy(initial);cloud.assessment.answer.tasks.Q={docId:'act',selections:['cloud']};await a.checkpoint(cloud);await a.retry();
    const stale=finished(initial,5);stale.assessment.answer.tasks.Q={docId:'act',selections:['stale']};f.setOffline(true);await b.checkpoint(stale);await b.persistence.saveAttempt(attemptOf(stale));await b.sync.flush();f.setOffline(false);
    await b.retry();assert.equal(await f.get('attempts/'+studentKey),null);assert.equal(await f.get('grades/'+studentKey),null);assert.equal(b.persistence.conflicted,true);
    assert.deepEqual(await b.persistence.resolve('cloud'),cloud);await b.retry();assert.equal(await f.get('attempts/'+studentKey),null);
    const next=copy(cloud);next.assessmentHistory.push(copy(cloud.assessment));next.assessment=assessment(b.base,2);const done=finished(next,3);await b.checkpoint(done);await b.persistence.saveAttempt(attemptOf(done));await b.retry();await b.retry();
    const attempts=await f.get('attempts/'+studentKey);assert.deepEqual(Object.keys(attempts),[done.assessment.attemptId]);assert.equal((await f.get('grades/'+studentKey+'/seminar-4')).points,3);assert.equal(attempts[stale.assessment.attemptId],undefined);
  }finally{f.close();}
});

test('a locally accepted receipt remains deliverable from history after a new variant starts',async()=>{
  const f=fixture();try{
    const d=f.device('history-delivery');await d.persistence.load();const old=finished(workspace(d.base),4);await d.checkpoint(old);await d.persistence.saveAttempt(attemptOf(old));old.assessment.delivery='host-accepted';await d.checkpoint(old);
    const next=copy(old);next.assessmentHistory.push(copy(old.assessment));next.assessment=assessment(d.base,2);await d.checkpoint(next);await d.retry();await d.retry();
    assert.equal((await f.get('attempts/'+studentKey+'/'+old.assessment.attemptId)).points,4);assert.equal((await d.store.listPending({owner,includeDeferred:true})).length,0);
  }finally{f.close();}
});

test('a sidecar conflict blocks its separate terminal receipt until the entire selected branch is resolved',async()=>{
  const f=fixture();try{
    const a=f.device('sidecar-a');await a.persistence.load();const legacy=workspace(a.base);
    legacy.assessment={attemptId:a.base,contentVersion:version,caseId:'A1',phase:'completed',startedAt:100,finishedAt:200,answer:{metadata:{}},documentVersions:{},result:{points:4,maxPoints:5,criteria:[]},delivery:'pending'};
    await a.checkpoint(legacy);await a.persistence.saveAttempt(attemptOf(legacy));await a.retry();
    const initial=copy(legacy);initial.assessmentHistory.push(copy(legacy.assessment));initial.assessment=assessment(a.base,2);await a.checkpoint(initial);await a.retry();
    const b=f.device('sidecar-b');assert.deepEqual(await b.persistence.load(),initial);
    const cloud=copy(initial);cloud.assessment.answer.tasks.Q={docId:'act',selections:['cloud']};await a.checkpoint(cloud);await a.retry();
    const stale=finished(initial,5);stale.assessment.answer.tasks.Q={docId:'act',selections:['stale']};f.setOffline(true);await b.checkpoint(stale);await b.persistence.saveAttempt(attemptOf(stale));await b.sync.flush();f.setOffline(false);await b.retry();
    assert.equal(b.persistence.conflicted,true);assert.equal(Object.keys(await f.get('attempts/'+studentKey)).length,1);
    assert.deepEqual(await b.persistence.resolve('cloud'),cloud);await b.retry();assert.equal(Object.keys(await f.get('attempts/'+studentKey)).length,1);assert.equal((await f.get('grades/'+studentKey+'/seminar-4')).points,4);
  }finally{f.close();}
});

test('identity changes during terminal checkpoint reject the pending host save',async()=>{
  const f=fixture();try{
    const d=f.device('generation-race');await d.persistence.load();const state=finished(workspace(d.base));await d.checkpoint(state);
    const entered=deferred(),release=deferred(),checkpoint=d.backend.checkpoint;
    d.backend.checkpoint=async(...args)=>{const result=await checkpoint(...args);entered.resolve();await release.promise;return result;};
    const saving=d.persistence.saveAttempt(attemptOf(state));await entered.promise;d.backend.generation++;release.resolve();await assert.rejects(saving,{code:'auth/profile-changed'});
    assert.equal((await d.store.listAttempts({owner})).length,0);
  }finally{f.close();}
});

test('local conflict choice can retain a completed prior variant in history and continue a new one',async()=>{
  const f=fixture();try{
    const a=f.device('history-conflict-a');await a.persistence.load();const done=finished(workspace(a.base));await a.checkpoint(done);await a.persistence.saveAttempt(attemptOf(done));done.assessment.delivery='host-accepted';await a.checkpoint(done);await a.retry();
    const b=f.device('history-conflict-b');assert.deepEqual(await b.persistence.load(),done);
    const cloud=copy(done);cloud.answers.Q2={submitted:true};await a.checkpoint(cloud);await a.retry();
    const next=copy(done);next.assessmentHistory.push(copy(done.assessment));next.assessment=assessment(b.base,2);await b.checkpoint(next);await b.retry();assert.equal(b.persistence.conflicted,true);
    assert.deepEqual(await b.persistence.resolve('local'),next);await b.retry();assert.equal(Object.keys(await f.get('attempts/'+studentKey)).length,1);
  }finally{f.close();}
});
