import {FirebaseRestError} from './firebase-rest.js';

const fault=code=>new FirebaseRestError(code);
const copy=value=>structuredClone(value);
const key=value=>{
  const result=String(value||'');
  if(!result||/[.#$\[\]/\x00-\x1f\x7f]/.test(result))throw fault('database/invalid-path');
  return result;
};
const sameIdentity=(a,b)=>Boolean(a&&b&&a.owner===b.owner&&a.uid===b.uid&&a.generation===b.generation);

function defaultDeviceId(){
  try{
    const saved=localStorage.getItem('rudn.sync-device.v1');
    if(saved&&/^[a-zA-Z0-9_-]{8,100}$/.test(saved))return saved;
    const created=crypto.randomUUID();
    localStorage.setItem('rudn.sync-device.v1',created);
    return created;
  }catch{return globalThis.crypto?.randomUUID?.()||`device-${Date.now()}-${Math.random().toString(36).slice(2)}`}
}

function cloudDraft(operation,identity,deviceId){
  const draft=operation.payload;
  if(operation.owner!==identity.owner||draft.owner!==identity.owner||draft.studentKey!==identity.studentKey){
    throw fault('auth/profile-changed');
  }
  const value=copy(draft);
  delete value.saveStatus;
  delete value.queue;
  return {...value,deviceId,ownerUid:identity.uid,localRevision:operation.revision};
}

/** Pure reconciliation: no answers or game states are ever merged field by field. */
export function mergeCheckpoint(current,incoming,{ownerUid,now=Date.now()}={}){
  const envelope={
    schemaVersion:1,studentKey:incoming.studentKey,activitySlug:incoming.activitySlug,
    mode:incoming.mode,attemptId:incoming.attemptId,ownerUid,updatedAt:now
  };
  if(!current){
    return {next:{...envelope,revision:1,current:{...incoming,remoteRevision:1}},conflict:false,remoteRevision:1};
  }
  if(current.studentKey!==incoming.studentKey||current.activitySlug!==incoming.activitySlug||
    current.mode!==incoming.mode||current.attemptId!==incoming.attemptId){
    throw fault('database/checkpoint-identity-mismatch');
  }
  const head=current.current;
  if(!head)throw fault('database/checkpoint-invalid');
  if(head.lastIntentId===incoming.lastIntentId||
    (head.deviceId===incoming.deviceId&&head.localRevision>=incoming.localRevision)){
    return {next:undefined,conflict:false,remoteRevision:current.revision};
  }
  const previousConflict=current.conflicts?.[incoming.lastIntentId];
  if(previousConflict){
    return {next:undefined,conflict:true,remoteRevision:current.revision,remote:head};
  }
  const revision=current.revision+1;
  const sameBranch=head.deviceId===incoming.deviceId&&incoming.localRevision>head.localRevision;
  const followsRemote=incoming.remoteRevision===current.revision;
  if(sameBranch||followsRemote){
    return {next:{...current,...envelope,revision,current:{...incoming,remoteRevision:revision}},conflict:false,remoteRevision:revision};
  }
  // A second device edited from an older base. Retain the cloud head and the
  // incoming complete state, with a stable key making uncertain retries safe.
  return {
    next:{...current,...envelope,revision,conflicts:{...current.conflicts,[key(incoming.lastIntentId)]:incoming}},
    conflict:true,remoteRevision:revision,remote:head
  };
}

/**
 * Durable-store bridge. Dependencies are injected to keep module import inert:
 * it never signs in, starts Firebase, or changes the active backend profile.
 */
export function createCheckpointSync({
  store,transport,getIdentity,commitAttempt,uploadAttachment=null,
  onConflict=()=>{},onStatus=()=>{},deviceId=defaultDeviceId(),now=()=>Date.now()
}){
  let running=null;
  let stopped=true;
  let unsubscribe=()=>{};
  let timer=null;
  let abortController=null;

  const identity=()=>{
    const value=getIdentity();
    if(!value?.uid||!value.studentKey||value.owner!==`student:${value.studentKey}`)return null;
    return value;
  };
  const active=session=>sameIdentity(session,identity());
  const assertActive=session=>{if(!active(session))throw fault('auth/profile-changed')};
  const checkpointPath=draft=>`checkpoints/${key(draft.studentKey)}/${key(draft.activitySlug)}/${key(draft.attemptId)}`;

  async function syncCheckpoint(operation,session,signal,attachments=[]){
    const incoming={...cloudDraft(operation,session,deviceId),...(attachments.length?{remoteAttachments:attachments}:{})};
    let merged;
    const result=await transport.transaction(checkpointPath(incoming),current=>{
      assertActive(session);
      merged=mergeCheckpoint(current,incoming,{ownerUid:session.uid,now:now()});
      return merged.next;
    },{signal});
    assertActive(session);
    if(merged.conflict){
      const conflict={owner:session.owner,draftId:operation.draftId,current:operation.payload,
        incoming:result.value.current,remoteRevision:result.value.revision,reason:'remote-conflict'};
      if(typeof store.recordRemoteConflict!=='function')throw fault('storage/conflict-handler-unavailable');
      await store.recordRemoteConflict(conflict);
      assertActive(session);
      onConflict(conflict);
      // Do not advance this branch's base: a later local edit must not silently
      // overwrite the other device's head before the user resolves the conflict.
      await store.ack(operation.id,operation.revision);
    }else{
      await store.ack(operation.id,operation.revision,{remoteRevision:result.value.revision});
    }
    return merged.conflict?'conflict':'saved';
  }

  async function syncLiveAnswer(operation,session,signal){
    const answer=operation.payload.state;
    if(answer.participantUid!==session.uid)throw fault('database/live-owner-changed');
    if(answer.answer===undefined||!Number.isFinite(Number(answer.clientSubmittedAt))){
      throw fault('database/operation-invalid');
    }
    const path=`live/autoRooms/${key(answer.roomKey)}/responses/${key(answer.questionId)}/${key(answer.participantUid)}`;
    const record={...answer,clientRevision:operation.revision,submittedAt:{'.sv':'timestamp'}};
    delete record.roomKey;
    await transport.transaction(path,current=>{
      assertActive(session);
      if(current&&(Number(current.clientSubmittedAt)>Number(answer.clientSubmittedAt)||
        (Number(current.clientSubmittedAt)===Number(answer.clientSubmittedAt)&&Number(current.clientRevision||0)>=operation.revision)))return undefined;
      return record;
    },{signal});
    assertActive(session);
    await store.ack(operation.id,operation.revision,{remoteRevision:operation.revision});
  }

  async function attachmentsFor(operation,session,signal){
    const attachments=[];
    for(const id of operation.attachmentIds||[]){
      const record=await store.getAttachment(id);
      assertActive(session);
      if((!record?.blob&&!record?.remoteUrl)||record.owner!==session.owner||record.attemptId!==operation.attemptId){
        throw fault('storage/attachment-missing');
      }
      // Upload callback must derive a stable Storage path from record.id.
      let uploaded;
      if(record.remoteUrl)uploaded={url:record.remoteUrl,path:record.remotePath,name:record.name,type:record.type,size:record.size};
      else {
        if(!uploadAttachment)throw fault('storage/upload-unavailable');
        uploaded=await uploadAttachment(record,{operation,signal,active:()=>active(session)});
        assertActive(session);
        if(!uploaded?.url)throw fault('storage/upload-unconfirmed');
        await store.markAttachmentUploaded(id,{...uploaded,owner:record.owner,attemptId:record.attemptId});
      }
      assertActive(session);
      if(!uploaded)throw fault('storage/upload-unconfirmed');
      attachments.push({id,...uploaded});
    }
    return attachments;
  }

  function schedule(delay=1000){
    if(stopped)return;
    clearTimeout(timer);
    timer=setTimeout(()=>flush().catch(()=>{}),delay);
  }

  function flush(){
    if(running)return running;
    const session=identity();
    if(!session)return Promise.resolve({saved:0,deferred:0,quarantined:0});
    abortController=new AbortController();
    const signal=abortController.signal;
    const work=(async()=>{
      const stats={saved:0,deferred:0,quarantined:0};
      const operations=await store.listPending({owner:session.owner,limit:100,now:now()});
      for(const operation of operations){
        if(!active(session)||signal.aborted)break;
        try{
          if(operation.type==='checkpoint'){
            if(operation.mode==='live-answer'&&operation.activitySlug==='seminar-1-classroom-live'){
              await syncLiveAnswer(operation,session,signal);
            }else{
              const attachments=await attachmentsFor(operation,session,signal);
              await syncCheckpoint(operation,session,signal,attachments);
            }
          }else if(operation.type==='attempt'){
            if(typeof commitAttempt!=='function')throw fault('database/attempt-writer-unavailable');
            const attachments=await attachmentsFor(operation,session,signal);
            assertActive(session);
            // The callback resolves only after immutable attempt AND best-grade
            // reconciliation. A crash between those steps leaves this op pending.
            await commitAttempt(copy(operation.payload),{operation,attachments,signal,active:()=>active(session)});
            assertActive(session);
            await store.ack(operation.id,operation.revision);
          }else throw fault('database/operation-invalid');
          stats.saved++;
        }catch(error){
          if(!active(session)||error.code==='auth/profile-changed'||signal.aborted)break;
          const permanent=/^(database\/(invalid-|checkpoint-|operation-invalid|request-rejected|live-owner-changed)|storage\/attachment-missing)/.test(error.code||'');
          if(permanent){
            await store.quarantine(operation.id,error,{revision:operation.revision});
            stats.quarantined++;
          }else{
            await store.defer(operation.id,error,{revision:operation.revision});
            stats.deferred++;
          }
          // One bad record does not prevent other activities from being saved.
        }
      }
      if(active(session)){
        stats.remaining=(await store.listPending({owner:session.owner,includeDeferred:true,limit:1000})).length;
        onStatus(stats);
      }
      return stats;
    })();
    running=work.finally(async()=>{
      running=null;
      abortController=null;
      if(!stopped){
        const current=identity();
        const waiting=current?await store.listPending({owner:current.owner,limit:1,now:now()}):[];
        schedule(!active(session)?0:waiting.length?100:15000);
      }
    });
    return running;
  }

  async function restore(scope,{timeoutMs=3000}={}){
    const session=identity();
    if(!session||scope.owner!==session.owner)return null;
    const path=`checkpoints/${key(session.studentKey)}/${key(scope.activitySlug)}`+
      (scope.attemptId?`/${key(scope.attemptId)}`:'');
    const {value}=await transport.get(path,{timeoutMs});
    assertActive(session);
    const envelopes=(scope.attemptId?[value]:Object.values(value||{}))
      .filter(item=>item?.studentKey===session.studentKey&&item.activitySlug===scope.activitySlug&&item.mode===(scope.mode||'default'))
      .sort((a,b)=>Number(b.updatedAt)-Number(a.updatedAt));
    const latest=envelopes[0];
    if(!latest)return null;
    if(typeof store.importRemoteDraft!=='function')throw fault('storage/restore-handler-unavailable');
    const restored=await store.importRemoteDraft({...latest.current,remoteRevision:latest.revision});
    assertActive(session);
    for(const incoming of Object.values(latest.conflicts||{})){
      await store.recordRemoteConflict({owner:session.owner,draftId:latest.current.id,
        current:restored||latest.current,incoming,remoteRevision:latest.revision,reason:'remote-conflict'});
      assertActive(session);
    }
    return restored;
  }

  const wake=()=>schedule(0);
  const visible=()=>{if(globalThis.document?.visibilityState==='visible')wake()};
  return {
    flush,restore,wake,
    start(){
      if(!stopped)return;
      stopped=false;
      unsubscribe=store.subscribe(detail=>{
        if(detail.owner===identity()?.owner&&detail.saveStatus?.state==='pending')schedule();
      });
      globalThis.addEventListener?.('online',wake);
      globalThis.document?.addEventListener('visibilitychange',visible);
      schedule(0);
    },
    stop(){
      stopped=true;
      clearTimeout(timer);
      unsubscribe();
      abortController?.abort(fault('network/aborted'));
      globalThis.removeEventListener?.('online',wake);
      globalThis.document?.removeEventListener('visibilitychange',visible);
    }
  };
}

/** REST equivalent of the existing immutable-attempt -> best-grade sequence. */
export async function commitStudentAttempt(transport,attempt,{
  studentKey,uid,activityMax={},active=()=>true,signal,attachments=[]
}){
  const ensureActive=()=>{if(!active())throw fault('auth/profile-changed')};
  ensureActive();
  if(attempt.studentKey&&attempt.studentKey!==studentKey)throw fault('auth/profile-changed');
  if(!attempt.id||!attempt.activitySlug)throw fault('database/operation-invalid');
  const urls=new Map(attachments.map(file=>[file.id,file.url]));
  const replaceFiles=value=>{
    if(typeof value==='string'&&/^(pending-attachment:|rudn-attachment:)/.test(value)){
      const id=value.replace(/^(pending-attachment:|rudn-attachment:)/,'');
      if(!urls.get(id))throw fault('storage/attachment-missing');
      return urls.get(id);
    }
    if(Array.isArray(value))return value.map(replaceFiles);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,replaceFiles(item)]));
    return value;
  };
  const record={...replaceFiles(copy(attempt)),studentKey,ownerUid:uid,
    createdAt:attempt.createdAt||new Date().toISOString(),
    ...(attachments.length?{attachments}: {})};
  const attemptPath=`attempts/${key(studentKey)}/${key(record.id)}`;
  const saved=await transport.transaction(attemptPath,current=>{
    ensureActive();
    if(current){
      if(current.studentKey!==studentKey||current.id!==record.id||current.activitySlug!==record.activitySlug){
        throw fault('database/checkpoint-identity-mismatch');
      }
      return undefined;
    }
    return record;
  },{signal});
  ensureActive();
  const authoritative=saved.value;
  const points=Number(authoritative.points);
  if(authoritative.recordGrade!==false&&authoritative.activitySlug!=='seminar-1-classroom'&&Number.isFinite(points)){
    const max=activityMax[authoritative.activitySlug]??5;
    if(points<0||points>max)throw fault('database/invalid-grade');
    await transport.transaction(`grades/${key(studentKey)}/${key(authoritative.activitySlug)}`,current=>{
      ensureActive();
      if(current&&Number(current.points)>=points)return undefined;
      return {points,max,updatedAt:new Date().toISOString(),sourceAttemptId:authoritative.id,ownerUid:uid};
    },{signal});
    ensureActive();
  }
  return authoritative;
}
