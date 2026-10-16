import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createDurableStore,durableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync} from '../site/assets/js/checkpoint-sync.js';
import {createLegalLabPersistence} from '../site/assets/js/legal-lab-storage.js';

// Fresh synthetic storage/transport only. These tests never access the network,
// browser profiles, credentials, production drafts, attempts or grades.
const owner='student:synthetic-recurrence',studentKey='synthetic-recurrence',uid='synthetic-uid',version='synthetic-v1';
const copy=value=>structuredClone(value);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const memoryStorage=()=>{const values=new Map();return{get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};};
function memoryCloud(){
  const records=new Map();
  return {
    async get(path){assert.ok(path.startsWith('checkpoints/'));return{value:copy(records.get(path)??null)};},
    async transaction(path,update){assert.ok(path.startsWith('checkpoints/'));const next=update(copy(records.get(path)??null));if(next!==undefined)records.set(path,copy(next));return{value:copy(records.get(path)??null)};}
  };
}
function fixture(){
  const cloud=memoryCloud(),devices=[];
  function device(name,storage=memoryStorage()){
    const store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null,databaseName:name});let sendGate=null,readGate=null;
    const sync=createCheckpointSync({store,deviceId:name,getIdentity:()=>({owner,studentKey,uid,generation:1}),transport:{
      async get(...args){const result=await cloud.get(...args);if(readGate){const gate=readGate;readGate=null;gate.entered.resolve();await gate.release.promise;}return result;},
      async transaction(...args){if(sendGate){const gate=sendGate;sendGate=null;gate.entered.resolve();await gate.release.promise;}return cloud.transaction(...args);}
    }});
    const backend={generation:1,user:{uid},getProfile:()=>({studentKey}),loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,o),durableSync:()=>sync,restTransport:()=>cloud};
    const persistence=createLegalLabPersistence({backend,store,owner,period:'synthetic-period',contentVersion:version});
    const scope={owner,activitySlug:'seminar-4',mode:'legal-lab-workspace',attemptId:persistence.attemptId};
    const d={store,storage,sync,persistence,scope,path:`checkpoints/${studentKey}/seminar-4/${scope.attemptId}`,
      delaySend(){return sendGate={entered:deferred(),release:deferred()};},delayRead(){return readGate={entered:deferred(),release:deferred()};},
      close(){persistence.destroy();sync.stop();store.close();}};
    devices.push(d);return d;
  }
  return{cloud,device,close(){for(const d of devices)d.close();}};
}
const start=()=>({schema:1,id:'synthetic-work',contentVersion:version,answers:{},scanFields:{},reader:{},index:0,view:'learn',elapsedMs:0,assessment:null});
const save=(device,state)=>device.persistence.checkpoint({state,contentVersion:version});
const pending=device=>device.store.listPending({owner,includeDeferred:true});
const unresolved=async device=>(await device.store.listConflicts({owner})).filter(c=>!c.resolvedAt);
async function branchPair(f){
  const a=f.device('device-a');await a.persistence.load();const initial=start();await save(a,initial);await a.sync.flush();
  const b=f.device('device-b');assert.deepEqual(await b.persistence.load(),initial);
  const cloud=copy(initial);cloud.answers.Q01={selections:['public-cloud-unit']};await save(a,cloud);await a.sync.flush();
  const local=copy(initial);local.answers.Q01={selections:['public-local-unit']};return{a,b,initial,cloud,local};
}
after(()=>durableStore.close());

test('cloud resolution survives reload and subsequent autosaves',async()=>{
  const f=fixture();try{
    const p=await branchPair(f);await save(p.b,p.local);await p.b.sync.flush();await p.b.persistence.resolve('cloud');p.a.close();p.b.close();
    const reload=f.device('device-b',p.b.storage);let state=await reload.persistence.load();assert.deepEqual(state,p.cloud);
    for(let i=1;i<=4;i++){state={...state,elapsedMs:15000*i};await save(reload,state);await reload.sync.flush();assert.equal((await unresolved(reload)).length,0);}
    const head=(await f.cloud.get(reload.path)).value;assert.equal(Object.keys(head.conflictHistory).length,1);assert.equal(Object.keys(head.conflicts||{}).length,0);
  }finally{f.close();}
});
test('an in-flight archived intent cannot recreate a conflict or acknowledge a newer edit',async()=>{
  const f=fixture();try{
    const p=await branchPair(f);await save(p.b,p.local);const oldOperation=(await pending(p.b))[0],gate=p.b.delaySend(),running=p.b.sync.flush();await gate.entered.promise;
    await p.b.sync.restore(p.b.scope);await p.b.persistence.resolve('cloud');const resolved=(await f.cloud.get(p.b.path)).value;
    assert.equal((await pending(p.b)).length,0);assert.ok(Object.values(resolved.conflictHistory).some(h=>h.branches.local.lastIntentId===oldOperation.payload.lastIntentId));p.a.close();
    const fresh=copy(p.cloud);fresh.answers.Q02={selections:['new-after-choice']};await save(p.b,fresh);const newer=(await pending(p.b))[0];assert.ok(newer.revision>oldOperation.revision);
    gate.release.resolve();await running;const after=(await f.cloud.get(p.b.path)).value;
    assert.deepEqual(after,resolved,'Superseded retry cannot mutate cloud state or history');assert.equal((await unresolved(p.b)).length,0);assert.equal((await pending(p.b))[0].revision,newer.revision,'Old ack cannot remove new outbox revision');
    assert.equal((await p.b.store.loadDraft(p.b.scope)).remoteRevision,resolved.revision,'Discarded intent must not advance the new draft base');
    await p.b.sync.flush();assert.equal((await pending(p.b)).length,0);assert.equal((await unresolved(p.b)).length,0);assert.deepEqual(JSON.parse((await f.cloud.get(p.b.path)).value.current.state.legalLab).answers,fresh.answers);
  }finally{f.close();}
});
test('a resolved conflict keeps its canonical mirror after late duplicate delivery and reload',async()=>{
  const f=fixture();try{
    const p=await branchPair(f);await save(p.b,p.local);await p.b.sync.flush();const old=(await unresolved(p.b))[0];await p.b.persistence.resolve('cloud');
    const canonical=(await p.b.store.listConflicts({owner})).find(c=>c.id===old.id);assert.ok(canonical.resolvedAt);
    assert.deepEqual(await p.b.store.recordRemoteConflict(old),canonical);
    assert.deepEqual(JSON.parse(p.b.storage.getItem('rudn.durable.mirror.v1:conflict:'+old.id)).conflict,canonical);
    p.a.close();p.b.close();const reload=f.device('device-b',p.b.storage);assert.deepEqual(await reload.persistence.load(),p.cloud);assert.equal(reload.persistence.conflicted,false);assert.equal((await unresolved(reload)).length,0);
    assert.equal(Object.keys((await f.cloud.get(reload.path)).value.conflictHistory).length,1);
  }finally{f.close();}
});
test('a delayed pre-resolution GET cannot import an unseen old conflict after resolution',async()=>{
  const f=fixture();try{
    const p=await branchPair(f),c=f.device('device-c');await c.persistence.load();await save(p.b,p.local);await p.b.sync.flush();
    const extra=copy(p.cloud);extra.answers.Q02={selections:['third-device-edit']};await save(c,extra);await c.sync.flush();
    const oldHead=(await f.cloud.get(p.b.path)).value;assert.equal(Object.keys(oldHead.conflicts).length,2);
    assert.ok(!(await p.b.store.listConflicts({owner})).some(r=>r.remoteRevision===oldHead.revision),'Later cloud revision has not yet been observed locally');
    const gate=p.b.delayRead(),restore=p.b.sync.restore(p.b.scope);await gate.entered.promise;await p.b.persistence.resolve('cloud');const selected=(await f.cloud.get(p.b.path)).value;
    gate.release.resolve();await restore;assert.equal((await unresolved(p.b)).length,0);assert.equal(p.b.persistence.conflicted,false);assert.deepEqual((await f.cloud.get(p.b.path)).value,selected);
    assert.equal(Object.keys(Object.values(selected.conflictHistory)[0].branches.alternatives).length,2,'Both rejected alternatives stay in resolution history');
  }finally{f.close();}
});
test('a genuinely new stale-device intent still conflicts and preserves both branches',async()=>{
  const f=fixture();try{
    const p=await branchPair(f),c=f.device('device-c');await c.persistence.load();await save(p.b,p.local);await p.b.sync.flush();await p.b.persistence.resolve('cloud');const selected=(await f.cloud.get(p.b.path)).value;
    const different=copy(p.cloud);different.answers.Q03={selections:['new-stale-device-answer']};await save(c,different);await c.sync.flush();const head=(await f.cloud.get(p.b.path)).value;
    assert.equal(Object.keys(head.conflicts).length,1);assert.deepEqual(head.current,selected.current);assert.deepEqual(head.conflictHistory,selected.conflictHistory);assert.deepEqual(JSON.parse(Object.values(head.conflicts)[0].state.legalLab).answers,different.answers);
  }finally{f.close();}
});
