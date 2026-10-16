// Synthetic regression over the real durable store, course adapter and sync bridge.
// The exported scenarios also run against the official Auth/RTDB emulators.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {parseDossierAnswer,SCAN_METADATA_MODE} from '../site/apps/legal-lab/lib/core.mjs';
import {createDurableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync,commitStudentAttempt} from '../site/assets/js/checkpoint-sync.js';
import {createLegalLabPersistence,legalLabIdentity,legalLabState,legalLabAttemptForCourse} from '../site/assets/js/legal-lab-storage.js';

export async function runLegalLabSyncRegression({transport,user,studentKey,setOffline,setLoseAttemptAck,ackLossPending,environment}){
  const owner='student:'+studentKey,devices=[],events=[];
  const options={studentKey,uid:user.uid,activityMax:{'seminar-4':5}};
  function device(name,version){
    const map=new Map(),storage={get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
    const store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null,databaseName:'legal-sync-'+name});
    let backend,beforeTransaction=null;
    const syncTransport={get:(...args)=>transport.get(...args),async transaction(...args){if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;hook();}return transport.transaction(...args)}};
    const sync=createCheckpointSync({store,transport:syncTransport,deviceId:'legal-'+name,getIdentity:()=>({owner:'student:'+backend.profile.studentKey,studentKey:backend.profile.studentKey,uid:backend.user.uid,generation:backend.generation}),commitAttempt:(attempt,{signal,active})=>commitStudentAttempt(transport,attempt,{...options,signal,active})});
    // This narrow host boundary mirrors Backend.saveAttempt's durable commit:
    // the actual store.complete preserves the module JSON in the same draft.
    backend={generation:0,user,profile:{studentKey},getProfile(){return this.profile},loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,o),durableSync:()=>sync,restTransport:()=>transport,
      async saveAttempt(attempt){
        assert.equal(attempt.draftMode,'legal-lab-workspace');
        const record={...attempt,studentKey:this.profile.studentKey,ownerUid:this.user.uid};
        const scope={owner,activitySlug:record.activitySlug,attemptId:record.id,mode:record.draftMode};
        const previous=await store.loadDraft(scope);
        const saved=await store.complete({...scope,contentVersion:previous.contentVersion,state:{...previous.state,phase:'completed',resultAttempt:record},attempt:record});
        return {...record,saveStatus:saved.saveStatus};
      }};
    const persistence=createLegalLabPersistence({backend,store,owner,period:'2026-2027',contentVersion:version});
    const result={store,sync,backend,persistence,version,setBeforeTransaction:hook=>beforeTransaction=hook,async retry(){for(const op of await store.listPending({owner,includeDeferred:true}))await store.retry(op.id,{revision:op.revision});return sync.flush()},async close(){persistence.destroy();sync.stop();store.close()}};
    devices.push(result);return result;
  }
  function base(d){return {schema:1,id:'work-'+d.version,contentVersion:d.version,answers:{},reader:{},index:0,elapsedMs:0,view:'assessment',assessment:{caseId:'A03',attemptId:d.persistence.attemptId,contentVersion:d.version,phase:'answering',startedAt:Date.now()-1000,answer:{metadata:{},classifications:{},documentIds:[],selections:[]}}};}
  function finish(state,points,hotspot){
    const value=structuredClone(state);value.answers.S01={hotspot,submitted:false};
    Object.assign(value.assessment,{phase:'completed',finishedAt:Date.now(),delivery:'pending',documentVersions:[{id:'synthetic-act',sha256:'a'.repeat(64),revisionLabel:'Synthetic fixture'}],result:{points,maxPoints:5,criteria:[{id:'metadata',points:Math.min(1,points),max:1},{id:'classification',points:Math.min(1,Math.max(0,points-1)),max:1},{id:'document',points:Math.min(1,Math.max(0,points-2)),max:1},{id:'evidence',points:Math.max(0,points-3),max:2}]}});
    value.assessment.answer.metadata={issuer:hotspot};return value;
  }
  function attemptOf(state){const a=state.assessment;return legalLabAttemptForCourse({id:a.attemptId,type:'legal-lab',studentKey,activitySlug:'seminar-4',draftMode:'legal-lab-assessment',title:'Synthetic Legal Lab',points:a.result.points,maxPoints:5,recordGrade:true,startedAt:a.startedAt,finishedAt:a.finishedAt,durationMs:a.finishedAt-a.startedAt,contentVersion:a.contentVersion,caseId:a.caseId,legalLab:{answer:a.answer,answerJson:JSON.stringify(a.answer),criteria:a.result.criteria,documentVersions:a.documentVersions}});}
  const get=async path=>(await transport.get(path)).value;
  const checkpointPath=d=>'checkpoints/'+studentKey+'/seminar-4/'+legalLabIdentity(owner,'2026-2027',d.version).workspaceId;
  const queue=d=>d.store.listPending({owner,includeDeferred:true});
  async function terminal(d,state){await d.persistence.checkpoint({state,contentVersion:d.version});const attempt=attemptOf(state);assert.equal(attempt.createdAt,new Date(state.assessment.finishedAt).toISOString());await d.persistence.saveAttempt(attempt);return attempt;}
  async function conflictPair(version){
    const a=device(version+'-A',version);assert.equal(await a.persistence.load(),null);
    const initial=base(a);await a.persistence.checkpoint({state:initial,contentVersion:version});await a.sync.flush();
    const b=device(version+'-B',version);assert.deepEqual(await b.persistence.load(),initial,'Second device restores exact dossier and empty answer containers');
    assert.equal(a.persistence.attemptId,b.persistence.attemptId);
    assert.equal(legalLabIdentity(owner,'2026-2027',version).workspaceId,a.persistence.attemptId,'Workspace and assessment share the same durable draft');
    const cloud=structuredClone(initial);cloud.answers.S01={hotspot:'issuer',submitted:false};
    await a.persistence.checkpoint({state:cloud,contentVersion:version});await a.sync.flush();
    return {a,b,initial,cloud};
  }
  async function assertBlocked(d){
    const cloud=await get(checkpointPath(d));assert.ok(Object.keys(cloud.conflicts||{}).length,'Stale completion must retain a real cloud conflict');
    assert.equal(await get('attempts/'+studentKey+'/'+d.persistence.attemptId),null,'Unresolved completion must not create an attempt');
    assert.equal((await get('grades/'+studentKey+'/seminar-4')).points,4,'Unresolved completion must not change the grade');
    assert.ok((await queue(d)).some(op=>op.type==='attempt'),'Pending result remains recoverable until explicit choice');
    await assert.rejects(d.persistence.checkpoint({state:legalLabState(cloud.current.state),contentVersion:d.version}),{name:'DraftConflict'});
  }
  async function assertResolutionEvidence(d,selected){
    const head=await get(checkpointPath(d));assert.equal(Object.keys(head.conflicts||{}).length,0);
    const history=Object.values(head.conflictHistory||{});assert.ok(history.some(item=>item.selected===selected&&item.branches.local&&item.branches.cloud),'Both branches remain in cloud evidence');
    assert.equal((await queue(d)).length,0,'Explicit choice removes the stale delivery queue');
    const conflicts=await d.store.listConflicts({owner});assert.ok(conflicts.some(item=>item.reason==='unacknowledged-attempt-superseded'&&item.attempt?.payload?.type==='legal-lab'&&item.resolvedAt),'Superseded receipt is retained as resolved evidence');
  }
  try{
    await commitStudentAttempt(transport,{id:'old-quiz',type:'quiz',studentKey,activitySlug:'seminar-4',points:4,recordGrade:true,createdAt:new Date().toISOString()},options);
    const cloudPair=await conflictPair('legal-cloud-choice');
    setOffline(true);const stale=finish(cloudPair.initial,5,'date');await terminal(cloudPair.b,stale);assert.ok((await cloudPair.b.sync.flush()).deferred>=1);setOffline(false);
    await cloudPair.b.retry();await assertBlocked(cloudPair.b);
    assert.deepEqual(await cloudPair.b.persistence.resolve('cloud'),cloudPair.cloud);await assertResolutionEvidence(cloudPair.b,'cloud');
    const restored=device('cloud-restored',cloudPair.b.version);assert.deepEqual(await restored.persistence.load(),cloudPair.cloud);
    const chosen=finish(cloudPair.cloud,3,'issuer');setOffline(true);await terminal(cloudPair.b,chosen);assert.ok((await cloudPair.b.sync.flush()).deferred>=1);setOffline(false);
    setLoseAttemptAck(true);await cloudPair.b.retry();assert.equal(ackLossPending(),false,'An actual attempt commit preceded acknowledgement loss');assert.ok((await queue(cloudPair.b)).some(op=>op.type==='attempt'));
    await cloudPair.b.retry();assert.equal((await queue(cloudPair.b)).length,0);
    assert.equal(Object.keys(await get('attempts/'+studentKey)).length,2,'Old quiz plus exactly one selected dossier after acknowledgement retry');
    assert.equal((await get('grades/'+studentKey+'/seminar-4')).points,4,'A lower 3-point dossier preserves the old 4-point quiz');
    events.push('cloud choice discards stale queue and completes selected branch','offline and lost-ack retry creates exactly one new attempt','old 4-point quiz preserved after a 3-point dossier');
    const localPair=await conflictPair('legal-local-choice');setOffline(true);const local=finish(localPair.initial,5,'number');await terminal(localPair.b,local);
    const cancelledMarker=structuredClone(local);cancelledMarker.assessment.delivery='host-accepted';await localPair.b.persistence.checkpoint({state:cancelledMarker,contentVersion:localPair.b.version});await localPair.b.sync.flush();setOffline(false);await localPair.b.retry();await assertBlocked(localPair.b);
    const markerHead=await get(checkpointPath(localPair.b)+'-practice');assert.equal(JSON.parse(markerHead.current.state.legalLabPractice).delivery,'host-accepted');
    assert.deepEqual(await localPair.b.persistence.resolve('local'),local);await assertResolutionEvidence(localPair.b,'local');
    const cancelledRestore=device('cancelled-marker-restored',localPair.b.version);assert.deepEqual(await cancelledRestore.persistence.load(),local,'Primary resolution invalidates the obsolete accepted marker');
    await localPair.b.persistence.checkpoint({state:cancelledMarker,contentVersion:localPair.b.version});await localPair.b.sync.flush();assert.equal(await get('attempts/'+studentKey+'/'+localPair.b.persistence.attemptId),null,'A stale accepted marker cannot resurrect the cancelled attempt');
    assert.equal(JSON.parse((await get(checkpointPath(localPair.b)+'-practice')).current.state.legalLabPractice).delivery,'pending');
    await localPair.b.persistence.saveAttempt(attemptOf(local));await localPair.b.retry();assert.equal((await queue(localPair.b)).length,0);
    assert.equal((await get('attempts/'+studentKey+'/'+localPair.b.persistence.attemptId)).points,5,'Selected local terminal branch can requeue and deliver its own receipt');
    assert.equal((await get('grades/'+studentKey+'/seminar-4')).points,5);
    assert.equal(Object.keys(await get('attempts/'+studentKey)).length,3);
    assert.equal((await get('attempts/'+studentKey+'/old-quiz')).points,4,'Historical quiz remains immutable');
    events.push('local choice retains both branches and can resume completion','higher 5-point result updates best grade without removing the old quiz');
    const zero=device('zero-score','legal-zero-score');await zero.persistence.load();const zeroState=finish(base(zero),0,'issuer');zeroState.assessment.answer={metadata:{},classifications:{},documentIds:[],selections:[]};await terminal(zero,zeroState);await zero.sync.flush();assert.equal((await queue(zero)).length,0);
    const zeroReceipt=await get('attempts/'+studentKey+'/'+zero.persistence.attemptId);assert.equal(zeroReceipt.points,0);assert.deepEqual(parseDossierAnswer(zeroReceipt.legalLab),zeroState.assessment.answer,'Actual report decoder restores all empty answer structures from RTDB');assert.equal((await get('grades/'+studentKey+'/seminar-4')).points,5);
    events.push('zero-point dossier keeps lossless answerJson and decodes after RTDB serialization');
    const practiceOwner=localPair.b,primaryBefore=await get(checkpointPath(practiceOwner)),attemptsBefore=await get('attempts/'+studentKey),gradeBefore=await get('grades/'+studentKey+'/seminar-4');
    const practiced=structuredClone(local);practiced.assessment.delivery='host-accepted';practiced.answers.S02={hotspot:'issuer',submitted:true};practiced.reader={docId:'synthetic-act',section:'section-2',query:'service',selected:[]};practiced.index=1;practiced.view='learn';practiced.elapsedMs=34000;practiced.liveRoom=null;
    await practiceOwner.persistence.checkpoint({state:practiced,contentVersion:practiceOwner.version});await practiceOwner.sync.flush();
    assert.deepEqual(await get(checkpointPath(practiceOwner)),primaryBefore,'Post-assessment practice never mutates the terminal primary checkpoint');
    const practiceRestore=device('practice-restored',practiceOwner.version);assert.deepEqual(await practiceRestore.persistence.load(),practiced,'Fresh device restores S02, reader, elapsed time, view and accepted delivery exactly');
    const cloudPractice=structuredClone(practiced);cloudPractice.answers.S02={hotspot:'date',submitted:true};cloudPractice.reader.section='section-9';
    const rejectedAssessment=structuredClone(cloudPractice);rejectedAssessment.assessment.result.points=99;rejectedAssessment.assessment.answer={selections:['forged']};
    await practiceOwner.persistence.checkpoint({state:rejectedAssessment,contentVersion:practiceOwner.version});await practiceOwner.sync.flush();
    const stalePractice=structuredClone(practiced);stalePractice.answers.S02={hotspot:'number',submitted:true};stalePractice.reader.section='section-local';
    await practiceRestore.persistence.checkpoint({state:stalePractice,contentVersion:practiceRestore.version});await practiceRestore.sync.flush();
    const practicePath=checkpointPath(practiceOwner)+'-practice';assert.ok(Object.keys((await get(practicePath)).conflicts||{}).length,'Two devices retain a practice conflict');assert.equal(practiceRestore.persistence.conflicted,true);
    assert.deepEqual(await practiceRestore.persistence.resolve('cloud'),cloudPractice,'Cloud choice resolves the practice scope while the immutable assessment remains canonical');
    assert.ok(Object.values((await get(practicePath)).conflictHistory||{}).some(item=>item.selected==='cloud'&&item.branches.local&&item.branches.cloud));assert.equal((await queue(practiceRestore)).length,0);
    const practiceC=device('practice-C',practiceOwner.version),practiceD=device('practice-D',practiceOwner.version);assert.deepEqual(await practiceC.persistence.load(),cloudPractice);assert.deepEqual(await practiceD.persistence.load(),cloudPractice);
    const practiceCState=structuredClone(cloudPractice);practiceCState.answers.S03={type:'Указ',submitted:true};await practiceC.persistence.checkpoint({state:practiceCState,contentVersion:practiceC.version});await practiceC.sync.flush();
    const practiceDState=structuredClone(cloudPractice);practiceDState.answers.S03={type:'Приказ',submitted:true};practiceDState.reader.query='local choice';await practiceD.persistence.checkpoint({state:practiceDState,contentVersion:practiceD.version});await practiceD.sync.flush();
    assert.deepEqual(await practiceD.persistence.resolve('local'),practiceDState,'Local choice keeps only classroom progress and the canonical assessment');
    const practiceHistory=Object.values((await get(practicePath)).conflictHistory||{});assert.ok(practiceHistory.some(item=>item.selected==='local'&&item.branches.local&&item.branches.cloud));assert.equal((await queue(practiceD)).length,0);
    const finalRestore=device('practice-final',practiceOwner.version);assert.deepEqual(await finalRestore.persistence.load(),practiceDState);
    assert.deepEqual(await get(checkpointPath(practiceOwner)),primaryBefore);assert.deepEqual(await get('attempts/'+studentKey),attemptsBefore,'Practice never creates or changes attempts');assert.deepEqual(await get('grades/'+studentKey+'/seminar-4'),gradeBefore,'Practice never changes the grade');
    events.push('post-assessment S02, reader and accepted delivery survive exact fresh-device restore','primary conflict resolution invalidates obsolete accepted marker without recreating an attempt','practice conflicts support cloud and local choices, retain both branches and cannot modify the primary result or grades');
    const changed=device('changed-profile','legal-identity');await changed.persistence.load();const initial=base(changed);await changed.persistence.checkpoint({state:initial,contentVersion:changed.version});
    changed.backend.profile={studentKey:studentKey+'-other'};await assert.rejects(changed.persistence.checkpoint({state:initial,contentVersion:changed.version}),{code:'auth/profile-changed'});await assert.rejects(changed.persistence.saveAttempt(attemptOf(finish(initial,5,'issuer'))),{code:'auth/profile-changed'});
    changed.backend.profile={studentKey};changed.backend.user={uid:user.uid+'-changed'};changed.backend.generation++;await assert.rejects(changed.persistence.checkpoint({state:initial,contentVersion:changed.version}),{code:'auth/profile-changed'});
    const uidSwitch=device('uid-switch','legal-uid-switch');await uidSwitch.persistence.load();const uidState=base(uidSwitch);await uidSwitch.persistence.checkpoint({state:uidState,contentVersion:uidSwitch.version});
    uidSwitch.setBeforeTransaction(()=>{uidSwitch.backend.user={uid:user.uid+'-changed'};uidSwitch.backend.generation++;});
    const noDelivery=await uidSwitch.sync.flush();assert.equal(noDelivery.saved,0,'UID change during synchronization aborts the old identity write');assert.equal(await get(checkpointPath(uidSwitch)),null);
    events.push('profile and UID/generation changes reject stale writes');
    // Serialization fixture only: the fixed two-point terminal rubric below is
    // synthetic and does not claim that these choices earn this score.
    const fullVersion='legal-all-requisites-v1',fullA=device('all-requisites-A',fullVersion);
    const oldQuizBeforeFull=await get('attempts/'+studentKey+'/old-quiz'),bestBeforeFull=await get('grades/'+studentKey+'/seminar-4'),receiptsBeforeFull=await get('attempts/'+studentKey);
    assert.equal(await fullA.persistence.load(),null);
    const sixMetadata={issuer:'issuer',type:'type',title:'number',date:'date',number:'number',signature:'signature'};
    const fullInitial=base(fullA);fullInitial.answers.S01={metadataMode:SCAN_METADATA_MODE,metadata:structuredClone(sixMetadata),submitted:true};fullInitial.scanFields={S01:4};
    fullInitial.assessment.answer={metadataMode:SCAN_METADATA_MODE,metadata:structuredClone(sixMetadata),classifications:{'synthetic-scan':'Приказ'},documentIds:['synthetic-act'],selections:['synthetic-act-unit-1']};fullInitial.assessment.scanFieldIndex=3;
    await fullA.persistence.checkpoint({state:fullInitial,contentVersion:fullVersion});await fullA.sync.flush();
    const fullB=device('all-requisites-B',fullVersion),fullOnB=await fullB.persistence.load();
    assert.deepEqual(fullOnB,fullInitial,'A second device restores the versioned full metadata maps and both field indices exactly');
    assert.equal(fullOnB.assessment.answer.metadataMode,SCAN_METADATA_MODE);assert.deepEqual(fullOnB.assessment.answer.metadata,sixMetadata);
    assert.equal(fullOnB.answers.S01.metadataMode,SCAN_METADATA_MODE);assert.deepEqual(fullOnB.answers.S01.metadata,sixMetadata);
    assert.deepEqual(fullOnB.scanFields,{S01:4});assert.equal(fullOnB.assessment.scanFieldIndex,3);
    const fullOffline=structuredClone(fullOnB);fullOffline.assessment.answer.metadata.title='title';fullOffline.assessment.answer.metadata.signature='number';fullOffline.answers.S01.metadata.number='date';fullOffline.scanFields.S01=5;fullOffline.assessment.scanFieldIndex=5;
    setOffline(true);await fullB.persistence.checkpoint({state:fullOffline,contentVersion:fullVersion});assert.ok((await fullB.sync.flush()).deferred>=1,'A full-map offline edit remains pending');
    assert.deepEqual(await fullB.persistence.load(),fullOffline,'Offline reload retains every versioned choice and navigation index locally');setOffline(false);await fullB.retry();assert.equal((await queue(fullB)).length,0);
    assert.deepEqual(await fullA.persistence.load(),fullOffline,'The other device restores the exact offline edit after reconnect');
    assert.deepEqual(legalLabState((await get(checkpointPath(fullB))).current.state),fullOffline,'The synced primary JSON retains full metadata, mistakes and indices');
    const fullTerminal=finish(fullOffline,2,'issuer');
    // finish() is intentionally kept as the old single-field fixture helper.
    // Restore the complete new answer explicitly before using the real adapter.
    fullTerminal.answers=structuredClone(fullOffline.answers);fullTerminal.assessment.answer=structuredClone(fullOffline.assessment.answer);
    fullTerminal.scanFields=structuredClone(fullOffline.scanFields);fullTerminal.assessment.scanFieldIndex=fullOffline.assessment.scanFieldIndex;
    const fullAttempt=await terminal(fullB,fullTerminal);assert.deepEqual(fullAttempt.legalLab.answer,fullOffline.assessment.answer);assert.deepEqual(JSON.parse(fullAttempt.legalLab.answerJson),fullOffline.assessment.answer);
    setLoseAttemptAck(true);await fullB.retry();assert.equal(ackLossPending(),false,'A full-map receipt is committed before the injected acknowledgement loss');assert.ok((await queue(fullB)).some(op=>op.type==='attempt'));
    const fullReceipt=await get('attempts/'+studentKey+'/'+fullB.persistence.attemptId);
    assert.equal(fullReceipt.legalLab.answer.metadataMode,SCAN_METADATA_MODE);assert.deepEqual(fullReceipt.legalLab.answer.metadata,fullOffline.assessment.answer.metadata);assert.equal(Object.keys(fullReceipt.legalLab.answer.metadata).length,6);
    assert.deepEqual(JSON.parse(fullReceipt.legalLab.answerJson),fullOffline.assessment.answer,'Committed answerJson retains the marker and all six metadata fields');
    assert.deepEqual(parseDossierAnswer(fullReceipt.legalLab),fullOffline.assessment.answer,'The actual report decoder restores the complete versioned answer');
    await fullB.retry();assert.equal((await queue(fullB)).length,0);assert.deepEqual(await get('attempts/'+studentKey+'/'+fullB.persistence.attemptId),fullReceipt,'Lost-ack retry cannot change the existing full-map receipt');
    assert.equal(Object.keys(await get('attempts/'+studentKey)).length,Object.keys(receiptsBeforeFull).length+1,'Full-map completion creates exactly one additional attempt');
    assert.deepEqual(await get('attempts/'+studentKey+'/old-quiz'),oldQuizBeforeFull);assert.deepEqual(await get('grades/'+studentKey+'/seminar-4'),bestBeforeFull,'The synthetic lower result preserves the previous best grade');
    const fullCompletedRestore=device('all-requisites-terminal-restore',fullVersion);assert.deepEqual(await fullCompletedRestore.persistence.load(),fullTerminal,'A fresh device restores the full terminal workspace including learning metadata and field indices');
    const fullPrimaryBeforePractice=await get(checkpointPath(fullB)),fullReceiptsBeforePractice=await get('attempts/'+studentKey),fullGradeBeforePractice=await get('grades/'+studentKey+'/seminar-4');
    const fullPractice=structuredClone(fullTerminal);fullPractice.assessment.delivery='host-accepted';fullPractice.view='learn';fullPractice.answers.S01.metadata.signature='title';fullPractice.answers.S01.submitted=false;fullPractice.scanFields.S01=1;
    await fullB.persistence.checkpoint({state:fullPractice,contentVersion:fullVersion});await fullB.sync.flush();
    const fullPracticeRestore=device('all-requisites-practice-restore',fullVersion);assert.deepEqual(await fullPracticeRestore.persistence.load(),fullPractice,'Post-terminal practice restores the learning marker, complete map and changed scanFields index exactly');
    assert.deepEqual(await get(checkpointPath(fullB)),fullPrimaryBeforePractice,'Full-map practice cannot mutate the terminal primary');assert.deepEqual(await get('attempts/'+studentKey),fullReceiptsBeforePractice,'Full-map practice cannot create or alter attempts');assert.deepEqual(await get('grades/'+studentKey+'/seminar-4'),fullGradeBeforePractice,'Full-map practice cannot change the best grade');assert.deepEqual(await get('attempts/'+studentKey+'/old-quiz'),oldQuizBeforeFull,'Full-map practice preserves the original quiz');
    events.push('versioned six-requisite metadata, learning choices and field indices survive two-device restore and offline synchronization','full-map answer and answerJson survive terminal commit and idempotent lost-ack retry','post-terminal full-map practice restores exactly without changing the old quiz, terminal attempt or best grade');
    return {status:'pass',environment,scenarios:['two-device exact dossier restore','stale offline finish cannot deliver attempt or grade before conflict resolution',...events],limitations:['Device persistence uses the real durable localStorage fallback backed by separate in-memory maps; this is not browser IndexedDB coverage.','Offline and acknowledgement loss are deliberately injected transport failures.']};
  }finally{setOffline(false);for(const d of devices)await d.close();}
}

export function syntheticTransport(){
  const records={};let offline=false,loseAck=false;
  const normal=value=>{if(value==null)return null;if(typeof value!=='object')return value;if(Array.isArray(value))return value.length?value.map(normal):null;const entries=Object.entries(value).map(([k,v])=>[k,normal(v)]).filter(([,v])=>v!==null);return entries.length?Object.fromEntries(entries):null;};
  const get=path=>{let value=records;for(const part of path.split('/'))value=value?.[part];return value==null?null:structuredClone(value)};
  const transport={async get(path){if(offline)throw new TypeError('Synthetic offline');return {value:get(path)}},async transaction(path,update){if(offline)throw new TypeError('Synthetic offline');const next=update(get(path));if(next!==undefined){const parts=path.split('/'),last=parts.pop();let parent=records;for(const part of parts)parent=parent[part]??={};parent[last]=normal(next);if(loseAck&&path.startsWith('attempts/')){loseAck=false;throw new TypeError('Synthetic acknowledgement loss after commit')}}return {value:get(path)}}};
  return {transport,setOffline:value=>offline=value,setLoseAttemptAck:value=>loseAck=value,ackLossPending:()=>loseAck};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const result=await runLegalLabSyncRegression({...syntheticTransport(),user:{uid:'synthetic-owner'},studentKey:'synthetic-conflict',environment:'synthetic unit transport over actual durable/sync/adapter modules'});
  console.log(JSON.stringify(result,null,2));
}
