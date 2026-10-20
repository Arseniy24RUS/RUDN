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
  let page;
  try{
   page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   const cases=await page.evaluate(async()=>{
    const {createDurableStore}=await import('/store.js');
    const check=(value,message)=>{if(!value)throw Error(message);};
    const equal=(actual,expected,message)=>check(JSON.stringify(actual)===JSON.stringify(expected),message);
    const results=[];
    for(const scenario of ['missing-attempt','newer-completed-checkpoint','conflicting-result','already-acknowledged','foreign-owner','foreign-attempt','mismatched-delivery','device-only','stale-checkpoint']){
     // Observe the real requests without warming, retrying or replacing native results.
     // Only the failed scenario is exported; no record values or payloads are captured.
     const started=performance.now(),trace={scenario,stage:'initial-checkpoint',completedScenarios:results.map(item=>item.scenario),events:[],dropped:0};
     globalThis.__completionRecoveryTrace=trace;
     const safeName=value=>typeof value==='string'&&/^[A-Za-z0-9_./:-]{1,100}$/.test(value)?value:null;
     const safeStatus=status=>Object.fromEntries(['state','storage','diagnostic','durable','revision','pending','quarantined','missingAttachment','fileUnavailableOffline'].flatMap(key=>{
      const value=status?.[key];return typeof value==='boolean'||Number.isFinite(value)||typeof value==='string'&&safeName(value)?[[key,value]]:[];
     }));
     const note=(event,fields={})=>{try{if(trace.events.length===128){trace.events.shift();trace.dropped++;}trace.events.push({event,atMs:Math.round((performance.now()-started)*100)/100,...fields});}catch{/* Observation cannot affect persistence. */}};
     const thrownName=error=>{try{return safeName(error?.name);}catch{return null;}};
     const errorName=target=>{try{return safeName(target?.error?.name);}catch{return null;}};
     const listen=(target,event,callback)=>{try{target.addEventListener(event,()=>{try{callback();}catch{note('observer-unavailable',{operation:event});}});}catch{note('observer-unavailable',{operation:event});}};
     let requestSequence=0,transactionSequence=0;
     const watchedTransactions=new WeakSet(),watchedDatabases=new WeakSet();
     const observeTransaction=tx=>{
      if(!tx||watchedTransactions.has(tx))return;watchedTransactions.add(tx);
      const transaction=++transactionSequence,mode=safeName(tx.mode),tables=Array.from(tx.objectStoreNames).map(safeName).filter(Boolean);
      note('transaction-created',{transaction,mode,tables});
      for(const event of ['complete','abort','error'])listen(tx,event,()=>note('transaction-'+event,{transaction,errorName:errorName(tx)}));
     };
     const observeDatabase=db=>{
      if(watchedDatabases.has(db))return;watchedDatabases.add(db);
      for(const method of ['transaction','close']){
       try{const original=db[method];Object.defineProperty(db,method,{configurable:true,writable:true,value:function(...args){
        let result;try{result=Reflect.apply(original,this,args);}catch(error){note(method+'-threw',{errorName:thrownName(error)});throw error;}
        try{if(method==='transaction')observeTransaction(result);else note('database-close');}catch{note('observer-unavailable',{operation:method});}
        return result;
       }});}catch{note('observer-unavailable',{operation:method});}
      }
      listen(db,'versionchange',()=>note('database-versionchange'));listen(db,'close',()=>note('database-closed'));
     };
     const observedIndexedDB={open(...args){
      const request=++requestSequence;note('open-requested',{request});
      let result;try{result=Reflect.apply(indexedDB.open,indexedDB,args);}catch(error){note('open-threw',{request,errorName:thrownName(error)});throw error;}
      for(const event of ['upgradeneeded','blocked','success','error'])listen(result,event,()=>{
       note('open-'+event,{request,errorName:event==='error'?errorName(result):null});
       if(event==='upgradeneeded')observeTransaction(result.transaction);
       if(event==='success')observeDatabase(result.result);
      });
      return result;
     }};
     const onWarning=event=>{try{note('storage-warning',{saveStatus:safeStatus(event.detail?.status)});}catch{note('observer-unavailable',{operation:'storage-warning'});}};
     try{addEventListener('rudn:storage-warning',onWarning);}catch{note('observer-unavailable',{operation:'storage-warning'});}
     const values=new Map(),storage={get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
     const databaseName='completion-recovery-'+scenario;
     const make=options=>createDurableStore({databaseName,localStorage:storage,locks:null,broadcast:false,indexedDB:observedIndexedDB,...options});
     const scope={owner:'student:recovery',activitySlug:'governor-freeplay',mode:'campaign',attemptId:'finished-'+scenario};
     const payload={id:scope.attemptId,studentKey:'recovery',activitySlug:scope.activitySlug,recordGrade:false,points:5,governor:{decisions:20}};
     const idb=make();
     const checkpoint=await idb.checkpoint({...scope,phase:'completed',state:{completed:true,checkpoint:'original'}});
     try{trace.saveStatus=safeStatus(checkpoint.saveStatus);trace.checkpointDurationMs=Math.round((performance.now()-started)*100)/100;note('checkpoint-returned',{saveStatus:trace.saveStatus});}catch{note('observer-unavailable',{operation:'checkpoint-status'});}
     check(checkpoint.saveStatus.storage==='indexedDB','Fixture must really commit the terminal checkpoint to IDB');
     idb.close();
     trace.stage='fallback-completion';
     const fallback=make({indexedDB:null});
     const saved=await fallback.complete({...scope,state:{completed:true,result:'fallback'},attempt:payload},{queue:scenario!=='device-only'});
     check(saved.saveStatus.durable&&saved.saveStatus.storage==='localStorage','Fixture must durably mirror completion outside IDB');
     fallback.close();
     trace.stage='authoritative-state';
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
     trace.stage='recovery';
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
     try{removeEventListener('rudn:storage-warning',onWarning);}catch{note('observer-unavailable',{operation:'storage-warning-remove'});}trace.stage='passed';
     results.push({scenario,passed:true});
    }
    return results;
   });
   assert.deepEqual(errors,[]);report.push({engine,cases,passed:true});console.log(`${engine}: ${cases.length}/${cases.length} completed-fallback recovery cases passed`);
  }catch(error){
   // Failure collection must neither replace the original exception nor hang teardown.
   let diagnostic={capture:'unavailable'},timer;
   try{if(page)diagnostic=await Promise.race([page.evaluate(()=>globalThis.__completionRecoveryTrace??{capture:'not-started'}),new Promise(resolve=>{timer=setTimeout(()=>resolve({capture:'deadline'}),2000);})]);}catch{/* Preserve the original failure. */}finally{clearTimeout(timer);}
   const failure={engine,passed:false,error:String(error),diagnostic};report.push(failure);console.error(JSON.stringify({completionRecoveryFailure:failure}));throw error;
  }finally{await browser.close();}
 }
}finally{
 await new Promise(resolve=>server.close(resolve));
 if(process.env.QA_OUT){await mkdir(process.env.QA_OUT,{recursive:true});await writeFile(join(process.env.QA_OUT,'completion-recovery.json'),JSON.stringify(report,null,2));}
}
console.log(JSON.stringify({passed:true,report},null,2));
