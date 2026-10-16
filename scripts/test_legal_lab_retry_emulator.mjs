// Actual Auth/RTDB emulators, repository rules and durable/sync/adapter code.
// Devices use separate in-memory localStorage; this is not browser/phone evidence.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDurableStore,durableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync,commitStudentAttempt} from '../site/assets/js/checkpoint-sync.js';
import {createLegalLabPersistence,legalLabAttemptForCourse} from '../site/assets/js/legal-lab-storage.js';
import {createFirebaseRestTransport} from '../site/assets/js/firebase-rest.js';
import {scoreDossier,scanQuestionsFor,SCAN_METADATA_MODE} from '../site/apps/legal-lab/lib/core.mjs';
const data=new URL('../site/apps/legal-lab/data/',import.meta.url),read=async file=>JSON.parse(await readFile(new URL(file,data),'utf8'));
const [catalog,pack,scans]=await Promise.all(['catalog.json','assessment-variants.json','scans.json'].map(read));
const docs=await Promise.all(catalog.documents.map(d=>read(d.file))),copy=structuredClone;
const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-rudn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
assert.equal(auth.status,200);const login=await auth.json(),user={uid:login.localId,getIdToken:async()=>login.idToken};
const studentKey=String(Date.now()),owner='student:'+studentKey,version=catalog.contentVersion,devices=[],events=[];
let offline=false,loseAck=false;
const transport=createFirebaseRestTransport({databaseURL:'http://127.0.0.1:9000',namespace:'demo-rudn-default-rtdb',rootPath:'rudn-platform/v1',getUser:()=>user,fetchImpl:async(url,options)=>{
 assert.equal(new URL(url).hostname,'127.0.0.1');if(offline)throw TypeError('Synthetic offline connection');const response=await fetch(url,options);
 if(loseAck&&options.method==='PUT'&&new URL(url).pathname.includes('/attempts/')){assert.equal(response.status,200);loseAck=false;throw TypeError('Synthetic acknowledgement loss after an actual commit');}return response;
}});
await transport.put('profiles/'+studentKey,{studentKey,ticket:studentKey,email:studentKey+'@rudn.ru',fullName:'Synthetic Five Task Emulator',group:'ГГУбд-01-26',ownerUid:user.uid,ownerUids:{[user.uid]:true}});
const get=async path=>(await transport.get(path)).value;
function device(name,period){
 const map=new Map(),storage={get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
 const store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null,databaseName:name});
 const backend={generation:1,user,profile:{studentKey},getProfile(){return this.profile},loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,o),restTransport:()=>transport};
 const sync=createCheckpointSync({store,transport,deviceId:name,getIdentity:()=>({owner,studentKey,uid:user.uid,generation:backend.generation}),commitAttempt:(a,o)=>commitStudentAttempt(transport,a,{studentKey,uid:user.uid,activityMax:{'seminar-4':5},...o})});backend.durableSync=()=>sync;
 backend.saveAttempt=async a=>{const record={...a,studentKey,ownerUid:user.uid},scope={owner,activitySlug:'seminar-4',mode:a.draftMode,attemptId:a.id},previous=await store.loadDraft(scope);assert.ok(previous);await store.complete({...scope,contentVersion:version,state:{...previous.state,phase:'completed',resultAttempt:record},attempt:record});return record;};
 const persistence=createLegalLabPersistence({backend,store,owner,period,contentVersion:version});
 const d={store,sync,persistence,base:persistence.attemptId,scope:{owner,activitySlug:'seminar-4',mode:'legal-lab-workspace',attemptId:persistence.attemptId},checkpoint:state=>persistence.checkpoint({state,contentVersion:version}),async retry(){for(const op of await store.listPending({owner,includeDeferred:true,limit:1000}))await store.retry(op.id,{revision:op.revision});return sync.flush();}};devices.push(d);return d;
}
function newState(d,n){
 const v=pack.variants[n],set=pack.questionSets.find(s=>s.docId===v.questionSet),type=scans.find(s=>s.id===v.typeScanId);
 const item={id:v.id,format:'five-task-v1',tasks:[{id:v.id+'-S',kind:'scan',scanId:v.scanId},{id:v.id+'-T',kind:'type',scanId:type.id,answer:type.actType},...set.tasks.map((t,i)=>({...t,id:v.id+'-Q'+(i+1)}))]};
 const tasks=Object.fromEntries(item.tasks.map(t=>[t.id,t.kind==='scan'?{submitted:true,metadataMode:SCAN_METADATA_MODE,metadata:Object.fromEntries(scanQuestionsFor(scans.find(s=>s.id===t.scanId)).map(q=>[q.field,q.field]))}:t.kind==='type'?{submitted:true,type:t.answer}:{submitted:true,docId:t.docId,selections:t.answerSets[0]}]));
 const result=scoreDossier(item,{assessmentMode:'five-task-v1',tasks},scans,docs);assert.equal(result.points,5);
 const now=Date.now();return{schema:1,id:'synthetic-five-workspace-'+n,contentVersion:version,answers:{},reader:{},quizCompletion:{contentVersion:version,finishedAt:now-2000},view:'assessment',assessmentHistory:[],assessment:{format:'five-task-v1',attemptId:d.base+'-r-'+crypto.randomUUID(),contentVersion:version,caseId:item.id,startedAt:now-1000,finishedAt:now,phase:'completed',delivery:'pending',answer:{assessmentMode:'five-task-v1',tasks},result,documentVersions:docs.filter(d=>d.id===set.docId).map(d=>({id:d.id,sha256:d.sha256,revisionLabel:d.revisionLabel}))}};
}
const attemptOf=state=>{const a=state.assessment;return legalLabAttemptForCourse({id:a.attemptId,type:'legal-lab',activitySlug:'seminar-4',recordGrade:true,contentVersion:version,caseId:a.caseId,points:a.result.points,maxPoints:5,startedAt:a.startedAt,finishedAt:a.finishedAt,legalLab:{answer:a.answer,answerJson:JSON.stringify(a.answer),criteria:a.result.criteria,documentVersions:a.documentVersions}});};
try{
 await commitStudentAttempt(transport,{id:'synthetic-old-quiz',activitySlug:'seminar-4',type:'quiz',points:5,maxPoints:5,recordGrade:true,createdAt:new Date().toISOString()},{studentKey,uid:user.uid,activityMax:{'seminar-4':5}});
 const a=device('five-real-A','emulator-five-active');await a.persistence.load();const state=newState(a,0);await a.checkpoint(state);offline=true;await a.persistence.saveAttempt(attemptOf(state));assert.ok((await a.sync.flush()).deferred>0);offline=false;loseAck=true;await a.retry();assert.equal(loseAck,false);await a.retry();await a.persistence.saveAttempt(attemptOf(state));await a.retry();assert.equal(Object.keys(await get('attempts/'+studentKey)).length,2);assert.equal((await get('grades/'+studentKey+'/seminar-4')).points,5);state.assessment.delivery='host-accepted';await a.checkpoint(state);await a.retry();
 const b=device('five-real-B','emulator-five-active');assert.deepEqual(await b.persistence.load(),state);const next=newState(b,1);next.id=state.id;next.assessmentHistory=[copy(state.assessment)];await b.checkpoint(next);await b.persistence.saveAttempt(attemptOf(next));await b.retry();next.assessment.delivery='host-accepted';await b.checkpoint(next);await b.retry();const c=device('five-real-C','emulator-five-active');assert.deepEqual(await c.persistence.load(),next);assert.equal(Object.keys(await get('attempts/'+studentKey)).length,3);events.push('actual five-task score; offline and lost-ack retry deduplicated; another device restores exact new variant and history');
 const legacy=device('five-real-legacy','emulator-five-legacy');await legacy.persistence.load();const old=newState(legacy,2);old.assessment.attemptId=legacy.base;delete old.assessment.format;old.assessment.answer={metadata:{},classifications:{},documentIds:[],selections:[]};old.assessment.caseId='A11';await legacy.checkpoint(old);await legacy.persistence.saveAttempt(attemptOf(old));await legacy.retry();old.assessment.delivery='host-accepted';await legacy.checkpoint(old);await legacy.retry();const original=await get('checkpoints/'+studentKey+'/seminar-4/'+legacy.base);
 const again=newState(legacy,3);again.id=old.id;again.assessmentHistory=[copy(old.assessment)];await legacy.checkpoint(again);await legacy.persistence.saveAttempt(attemptOf(again));await legacy.retry();again.assessment.delivery='host-accepted';await legacy.checkpoint(again);await legacy.retry();assert.deepEqual(await get('checkpoints/'+studentKey+'/seminar-4/'+legacy.base),original);const fresh=device('five-real-legacy-fresh','emulator-five-legacy');assert.deepEqual(await fresh.persistence.load(),again);assert.equal((await get('grades/'+studentKey+'/seminar-4')).points,5);assert.equal(Object.keys(await get('attempts/'+studentKey)).length,5);events.push('completed legacy primary remains byte-identical; sidecar restores a new independent terminal and the prior result');
 console.log(JSON.stringify({status:'pass',events,attemptsIncludingOldQuiz:5,sourceQuestions:pack.questionSets.length*3,environment:'official localhost Auth/RTDB emulators; repository rules; actual durable/sync/LegalLab adapter; synthetic devices'},null,2));
}finally{for(const d of devices){d.persistence.destroy();d.sync.stop();d.store.close();}durableStore.close();}
