// Real IndexedDB plus isolated fallback mirrors. No application, Firebase or production writes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
const require=createRequire(import.meta.url),pw=require(process.env.PLAYWRIGHT_PATH||'playwright');
const source=await readFile(new URL('../site/assets/js/durable-store.js',import.meta.url));
const identitySource=await readFile(new URL('../site/assets/js/student-identity.js',import.meta.url));
const server=createServer((req,res)=>{const module=req.url==='/store.js'?source:req.url==='/student-identity.js'?identitySource:null;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',module?'text/javascript':'text/html');res.end(module||'<!doctype html><title>Isolated completion recovery</title>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const report=[];
try{
 for(const engine of (process.env.DURABLE_TEST_BROWSERS||'chromium').split(',')){
  const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  try{
   const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   const cases=await page.evaluate(async()=>{
    const {createDurableStore}=await import('/store.js');
    const check=(value,message)=>{if(!value)throw Error(message);};
    const equal=(actual,expected,message)=>check(JSON.stringify(actual)===JSON.stringify(expected),message);
    const results=[];
    for(const scenario of ['missing-attempt','newer-completed-checkpoint','conflicting-result','already-acknowledged','foreign-owner','foreign-attempt','mismatched-delivery','device-only','stale-checkpoint']){
     const values=new Map(),storage={get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
     const databaseName='completion-recovery-'+scenario;
     const make=options=>createDurableStore({databaseName,localStorage:storage,locks:null,broadcast:false,...options});
     const scope={owner:'student:recovery',activitySlug:'governor-freeplay',mode:'campaign',attemptId:'finished-'+scenario};
     const payload={id:scope.attemptId,studentKey:'recovery',activitySlug:scope.activitySlug,recordGrade:false,points:5,governor:{decisions:20}};
     const idb=make();
     const checkpoint=await idb.checkpoint({...scope,phase:'completed',state:{completed:true,checkpoint:'original'}});
     check(checkpoint.saveStatus.storage==='indexedDB','Fixture must really commit the terminal checkpoint to IDB');
     idb.close();
     const fallback=make({indexedDB:null});
     const saved=await fallback.complete({...scope,state:{completed:true,result:'fallback'},attempt:payload},{queue:scenario!=='device-only'});
     check(saved.saveStatus.durable&&saved.saveStatus.storage==='localStorage','Fixture must durably mirror completion outside IDB');
     fallback.close();
     let authoritative={...checkpoint};delete authoritative.saveStatus;
     if(scenario==='newer-completed-checkpoint'){
      authoritative={...authoritative,revision:99,updatedAt:Date.now()+1000,state:{completed:true,checkpoint:'newer-authoritative'}};
      await new Promise((resolve,reject)=>{const open=indexedDB.open(databaseName);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(authoritative);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
     }
     if(['conflicting-result','already-acknowledged'].includes(scenario)){
      const current=make({localStorage:null});
      const actual=await current.complete({...scope,state:{completed:true,result:'authoritative'},attempt:{...payload,points:scenario==='conflicting-result'?3:5}});
      authoritative={...actual};delete authoritative.saveStatus;
      if(scenario==='already-acknowledged')for(const op of await current.listPending({owner:scope.owner,includeDeferred:true}))await current.ack(op.id,op.revision);
      const updated=await current.loadDraft(scope);authoritative={...updated};delete authoritative.saveStatus;
      current.close();
     }
     const mirrorKey=[...values.keys()].find(key=>key.startsWith('rudn.durable.mirror.v1:'));
     if(scenario==='foreign-owner'){const envelope=JSON.parse(values.get(mirrorKey));envelope.attempt.owner='student:someone-else';values.set(mirrorKey,JSON.stringify(envelope));}
     if(scenario==='foreign-attempt'){const envelope=JSON.parse(values.get(mirrorKey));envelope.attempt.payload.id='another-attempt';values.set(mirrorKey,JSON.stringify(envelope));}
     if(scenario==='mismatched-delivery'){const envelope=JSON.parse(values.get(mirrorKey));envelope.operations.find(op=>op.type==='attempt').payload.points=1;values.set(mirrorKey,JSON.stringify(envelope));}
     if(scenario==='stale-checkpoint'){const envelope=JSON.parse(values.get(mirrorKey));delete envelope.attempt;envelope.draft.phase='answering';envelope.operations=envelope.operations.filter(op=>op.type!=='attempt');values.set(mirrorKey,JSON.stringify(envelope));}
     const beforeRecovery=make({localStorage:null});const originalCheckpoint=(await beforeRecovery.listPending({owner:scope.owner,includeDeferred:true})).filter(op=>op.type==='checkpoint');beforeRecovery.close();
     const restored=make();const attempts=await restored.listAttempts({owner:scope.owner});
     const draft=await restored.loadDraft(scope),withoutStatus={...draft};delete withoutStatus.saveStatus;
     equal(withoutStatus,authoritative,'Recovery must not replace completed checkpoint or its best revision: '+scenario);
     const pending=(await restored.listPending({owner:scope.owner,includeDeferred:true})).filter(op=>op.type==='attempt');
     equal((await restored.listPending({owner:scope.owner,includeDeferred:true})).filter(op=>op.type==='checkpoint'),originalCheckpoint,'Recovery must not replace the current checkpoint delivery');
     const conflicts=await restored.listConflicts({owner:scope.owner});
     if(['foreign-owner','foreign-attempt','mismatched-delivery','stale-checkpoint'].includes(scenario)){
      equal(attempts,[],'Invalid/stale mirror cannot create an attempt: '+scenario);equal(pending,[],'Invalid/stale mirror cannot enqueue an attempt');
      if(scenario!=='stale-checkpoint')check(conflicts.some(c=>c.reason==='fallback-attempt-invalid'),'Invalid binding must retain conflict evidence');
     }else{
      equal(attempts,[{...payload,points:scenario==='conflicting-result'?3:5}],'Completed recovery must retain exactly the immutable result: '+scenario);
      if(['already-acknowledged','device-only'].includes(scenario))equal(pending,[],'An acknowledged/device-only result must not be enqueued from an old mirror');
      else{equal(pending.length,1,'Exactly one attempt delivery');equal(pending[0].payload,attempts[0],'Delivery must match the retained immutable result');}
      if(scenario==='conflicting-result')check(conflicts.some(c=>c.reason==='fallback-attempt-mismatch'&&c.current.payload.points===3&&c.incoming.payload.points===5),'Keep both conflicting payloads as evidence');
     }
     const before=await restored.listAttempts({owner:scope.owner});restored.close();
     const twice=make();equal(await twice.listAttempts({owner:scope.owner}),before,'Repeated recovery is idempotent');twice.close();
     results.push({scenario,passed:true});
    }
    return results;
   });
   assert.deepEqual(errors,[]);report.push({engine,cases,passed:true});console.log(`${engine}: ${cases.length}/${cases.length} completed-fallback recovery cases passed`);
  }catch(error){report.push({engine,passed:false,error:String(error)});throw error;}finally{await browser.close();}
 }
}finally{
 await new Promise(resolve=>server.close(resolve));
 if(process.env.QA_OUT){await mkdir(process.env.QA_OUT,{recursive:true});await writeFile(join(process.env.QA_OUT,'completion-recovery.json'),JSON.stringify(report,null,2));}
}
console.log(JSON.stringify({passed:true,report},null,2));
