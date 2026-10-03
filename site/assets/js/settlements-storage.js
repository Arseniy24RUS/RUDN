import {durableStore} from './durable-store.js';
import {createPuzzleWriter} from './puzzle-storage.js';
import {makeSettlementsLeaderboard,selectSettlementsLeaders,settlementsPoints,validateSettlementsResult} from './settlements-leaderboard.js';

const copy=value=>structuredClone(value);
const failure=code=>Object.assign(new Error(code),{code});
const id=()=>crypto.randomUUID();
const validId=value=>/^[A-Za-z0-9_-]{1,150}$/.test(String(value));
const decodeState=value=>{
  if(!value)return null;
  const state=copy(value);
  if(typeof state.engineSave==='string'){
    try{state.engineSave=JSON.parse(state.engineSave)}catch{throw failure('settlements/corrupt-save')}
  }
  return state;
};
const cloudCopy=value=>{
  const draft=copy(value);
  if(draft.state?.engineSave && typeof draft.state.engineSave==='object')draft.state.engineSave=JSON.stringify(draft.state.engineSave);
  delete draft.saveStatus;
  return draft;
};

/**
 * Profile-scoped, device-first native settlements persistence.
 * Sessions: {attemptId,regionId,difficulty:'easy'|'normal'|'hard',engineSave,ui?,
 * elapsedMs,status:'active'|'abandoned'|'completion-pending'|'completed'}.
 * Result: {terminal:true,coverageNp,coveragePopulation,turns,spentMillionRub,reason}.
 * loadSession always reconciles cloud, including when a local draft exists.
 * saveSession atomically checkpoints before it returns; confirmOnline is the
 * mandatory first-assessment barrier. Revisions are independent of engine undo.
 * completeSession remains completion-pending until all three remote writes ACK.
 * onStatus({state,tutorialState,session,writable}), onConflict({scope,local,cloud,conflicts}).
 * Conflicts in either scope freeze both. resolveConflict(choice, expectedScope?)
 * captures its scope before queueing and returns the session, including after a
 * tutorial choice; reload the tutorial separately.
 */
export function createSettlementsPersistence({backend,owner,mode='assessment',onStatus=()=>{},onConflict=()=>{},onWriterChange=()=>{},onBeforeRelease=async()=>{},store=durableStore,writerOptions={}}){
  if(!['assessment','free'].includes(mode)||!owner)throw new TypeError('A mode and canonical owner are required');
  const activitySlug=mode==='assessment'?'seminar-3':'settlements-freeplay';
  const scope={owner,activitySlug,mode:`settlements-${mode}`};
  const tutorialScope={owner,activitySlug:'settlements-tutorial',mode:'tutorial'};
  const student=owner.startsWith('student:');
  let disposed=false,current=null,draft=null,tutorial=null,conflicted=false,conflictScope=null,running=null,tail=Promise.resolve();
  let tutorialCompleted=false;
  const conflictsByScope={session:[],tutorial:[]};
  const generation=backend?.generation;
  const isActive=()=>!disposed && (!student || (`student:${backend?.getProfile?.()?.studentKey}`===owner && (generation===undefined || backend.generation===generation)));
  const assertActive=()=>{if(!isActive())throw failure('auth/profile-changed')};
  const cloudAvailable=()=>student&&backend?.user&&!backend.isAdmin?.()&&globalThis.navigator?.onLine!==false;
  const serial=action=>{const result=tail.then(action);tail=result.catch(()=>{});return result};
  const view=value=>{
    if(!value)return null;
    const state=decodeState(value.state);
    if(state.status==='completed' && student && value.saveStatus?.state!=='saved')state.status='completion-pending';
    return state;
  };
  function emit(state=draft?.saveStatus?.state || (student?'pending':'device-only')){
    onStatus({state:conflicted?'conflict':state,
      tutorialState:conflicted?'conflict':tutorial?.saveStatus?.state || (student?'pending':'device-only'),
      session:current?copy(current):null,writable:canWrite()});
  }
  async function detectConflicts(){
    tutorial=await store.loadDraft(tutorialScope);
    const all=await store.listConflicts({owner});
    assertActive();
    conflictsByScope.session=all.filter(item=>item.draftId===draft?.id&&!item.resolvedAt);
    conflictsByScope.tutorial=all.filter(item=>item.draftId===tutorial?.id&&!item.resolvedAt);
    tutorialCompleted=Boolean(tutorialCompleted || tutorial?.state.completed || all.some(item=>
      item.draftId===tutorial?.id && (item.current?.state?.completed || item.incoming?.state?.completed)));
    conflicted=Boolean(conflictsByScope.session.length||conflictsByScope.tutorial.length);
    conflictScope=conflictsByScope.session.length?'session':conflictsByScope.tutorial.length?'tutorial':null;
    if(conflicted){
      const value=conflictScope==='session'?draft:tutorial,conflicts=conflictsByScope[conflictScope];
      onConflict({scope:conflictScope,local:decodeState(value.state),cloud:decodeState(conflicts.at(-1).incoming.state),conflicts});
    }
    return conflicted;
  }
  async function loadScope(which,attemptId){
    assertActive();
    // Checking a remote revision is necessary even when the device has a draft.
    if(cloudAvailable()){
      try{await backend.durableSync().restore({...which,...(attemptId?{attemptId}:{})},{timeoutMs:5000})}
      catch(error){if(error.code==='auth/profile-changed')throw error;onStatus({state:'device-only',error:error.code||'network/unavailable'})}
    }
    assertActive();return store.loadDraft({...which,...(attemptId?{attemptId}:{})});
  }
  async function loadSession({attemptId}={}){
    const value=await loadScope(scope,attemptId);
    draft=value;current=view(value);await detectConflicts();emit();return current?copy(current):null;
  }
  function canWrite(){return isActive()&&!conflicted&&Boolean(writer?.canWrite())}
  const writer=createPuzzleWriter({scope:`settlements:${owner}`,...writerOptions,
    isActive,readState:async()=>{const session=await loadSession();await loadTutorial();return session},beforeRelease:async()=>{await onBeforeRelease();await tail;await store.flushLocal()},
    onChange:detail=>{onWriterChange(detail);emit()}});
  const requireWriter=()=>{assertActive();if(!canWrite())throw failure(conflicted?'storage/conflict':'storage/readonly')};
  function normalizeSession(value){
    if(!value||!validId(value.attemptId)||!validId(value.regionId)||!['easy','normal','hard'].includes(value.difficulty)||
      (!value.engineSave&&!(['active','abandoned'].includes(value.status)&&value.elapsedMs===0))||
      !['active','abandoned','completion-pending','completed'].includes(value.status)||!Number.isFinite(value.elapsedMs)||value.elapsedMs<0)throw failure('settlements/invalid-session');
    const result=copy(value);
    result.mode=mode;
    return result;
  }
  async function save(value){
    await detectConflicts();
    requireWriter();
    const next=normalizeSession(value);
    const latest=await store.loadDraft(scope);
    if(latest && latest.attemptId!==next.attemptId){
      if(latest.state.status==='completion-pending' || (student && latest.state.status==='completed' && latest.saveStatus?.state!=='saved'))throw failure('settlements/completion-pending');
      if(latest.state.status==='active')throw failure('settlements/active-attempt');
    }
    const previous=await store.loadDraft({...scope,attemptId:next.attemptId});
    if(previous && (previous.state.regionId!==next.regionId||previous.state.difficulty!==next.difficulty))throw failure('settlements/attempt-identity-changed');
    if(previous && ['completed','abandoned'].includes(previous.state.status)){
      draft=previous;current=view(previous);emit();return copy(current);
    }
    draft=await store.checkpoint({...scope,attemptId:next.attemptId,state:next,baseRevision:previous?.revision,contentVersion:'settlements-1'}, {queue:student});
    assertActive();current=view(draft);emit();return copy(current);
  }
  function saveSession(value){return serial(()=>save(value)).then(result=>{void flush().catch(()=>{});return result})}
  async function cloudAck(){
    if(!cloudAvailable()||!draft||conflicted)return false;
    await backend.durableSync().flush();assertActive();
    draft=await store.loadDraft({...scope,attemptId:draft.attemptId});
    current=view(draft);await detectConflicts();
    if(conflicted||draft.acknowledgedRevision<draft.revision)return false;
    // The acknowledgement can be old if a second device wrote after it.
    const {value:remote}=await backend.restTransport().get(`checkpoints/${owner.slice(8)}/${activitySlug}/${draft.attemptId}`,{timeoutMs:5000});
    assertActive();
    if(!remote || Object.keys(remote.conflicts||{}).length || remote.current.lastIntentId!==draft.lastIntentId){
      await loadSession({attemptId:draft.attemptId});return false;
    }
    return true;
  }
  const confirmOnline=()=>serial(async()=>{try{const result=await cloudAck();emit();return result}catch(error){if(error.code==='auth/profile-changed')throw error;emit('device-only');return false}});

  async function finalize(){
    if(!current || !['completion-pending','completed'].includes(current.status)||conflicted||!canWrite())return;
    const result=validateSettlementsResult(current.result);
    if(student && !await cloudAck())return;
    // Completed state stays replayable but cannot be edited by the engine.
    const session={...current,status:'completed',points:settlementsPoints(current.difficulty,result.coverageNp,true,mode)};
    const profile=student?backend.getProfile():null;
    const leaderboard=student?await makeSettlementsLeaderboard(session,result,profile,mode):null;
    assertActive();
    const attempt={id:session.attemptId,studentKey:profile?.studentKey||null,type:'settlements',activitySlug,
      mode,draftMode:scope.mode,recordGrade:student&&mode==='assessment',points:session.points,
      regionId:session.regionId,difficulty:session.difficulty,elapsedMs:session.elapsedMs,
      result,completedAt:session.completedAt,createdAt:new Date(session.completedAt).toISOString(),
      ...(leaderboard?{leaderboard}:{})};
    draft=await store.complete({...scope,attemptId:session.attemptId,state:session,attempt,baseRevision:draft.revision,contentVersion:'settlements-1'},{queue:student});
    current=view(draft);emit();
    if(student&&cloudAvailable()){
      await backend.durableSync().flush();
      assertActive();draft=await store.loadDraft({...scope,attemptId:session.attemptId});current=view(draft);await detectConflicts();
    }
    emit();
  }
  async function completeSession(value,result){
    validateSettlementsResult(result);
    await serial(()=>save({...value,result:copy(result),completedAt:value.completedAt||Date.now(),status:'completion-pending'}));
    await flush();return current?copy(current):null;
  }
  function flush(){
    if(running)return running;
    running=serial(async()=>{
      assertActive();await store.flushLocal();
      if(cloudAvailable()){
        for(const op of await store.listPending({owner,includeDeferred:true,limit:1000})){
          if(op.activitySlug===activitySlug || op.activitySlug===tutorialScope.activitySlug)await store.retry(op.id,{revision:op.revision});
        }
        await backend.durableSync().flush();
      }
      if(draft){draft=await store.loadDraft({...scope,attemptId:draft.attemptId});current=view(draft)}
      await detectConflicts();
      await finalize();emit();return {session:current?copy(current):null,status:draft?.saveStatus};
    }).finally(()=>running=null);
    return running;
  }
  async function loadTutorial(){
    tutorial=await loadScope(tutorialScope);
    await detectConflicts();emit();
    return tutorial?{...decodeState(tutorial.state),completed:tutorialCompleted}:null;
  }
  function saveTutorial(state){return serial(async()=>{
    await detectConflicts();
    requireWriter();
    const previous=await store.loadDraft(tutorialScope);
    const next={...copy(state),completed:Boolean(state.completed||tutorialCompleted||previous?.state.completed)};
    tutorial=await store.checkpoint({...tutorialScope,attemptId:previous?.attemptId||'tutorial-v1',state:next,baseRevision:previous?.revision,contentVersion:'settlements-1'},{queue:student});
    assertActive();tutorialCompleted=next.completed;return copy(tutorial.state);
  }).then(result=>{void flush().catch(()=>{});return result})}

  function resolveConflict(choice,expectedScope){
    const selectedScope=expectedScope===undefined?conflictScope:expectedScope;
    return serial(async()=>{
    assertActive();if(!['local','cloud'].includes(choice))throw new TypeError('Choose local or cloud');
    if(!writer.canWrite())throw failure('storage/readonly');
    // Resolve exactly the scope presented to the user, even if another scope
    // also has a conflict. Its event is emitted after this selection commits.
    if(!selectedScope)throw failure('storage/no-conflict');
    if(!['session','tutorial'].includes(selectedScope))throw new TypeError('Choose session or tutorial scope');
    if(!conflictsByScope[selectedScope].length)throw failure('storage/no-conflict');
    const value=selectedScope==='tutorial'?tutorial:draft;
    const selectedDraftScope=selectedScope==='tutorial'?tutorialScope:scope;
    if(!cloudAvailable()||!value)throw failure('network/offline');
    const local=await store.loadDraft({...selectedDraftScope,attemptId:value.attemptId});
    const path=`checkpoints/${owner.slice(8)}/${selectedDraftScope.activitySlug}/${local.attemptId}`;
    const resolutionId=id();
    const {value:remote}=await backend.restTransport().transaction(path,head=>{
      assertActive();if(!head)throw failure('database/checkpoint-invalid');
      const selected=cloudCopy(choice==='local'?local:head.current);
      if(selectedScope==='tutorial')selected.state.completed=Boolean(tutorialCompleted ||
        [local,head.current,...Object.values(head.conflicts||{})].some(branch=>branch.state?.completed));
      if(selectedScope==='session' && ['completed','abandoned'].includes(head.current.state.status) && choice==='local' && local.lastIntentId!==head.current.lastIntentId)throw failure('settlements/result-already-final');
      const revision=head.revision+1;
      const next={...head,revision,updatedAt:Date.now(),ownerUid:backend.user.uid,
        current:{...selected,remoteRevision:revision,lastIntentId:resolutionId,ownerUid:backend.user.uid,
          deviceId:`resolution-${resolutionId}`,localRevision:selected.localRevision||selected.revision},
        conflictHistory:{...head.conflictHistory,[resolutionId]:{selected:choice,at:Date.now(),branches:{local:cloudCopy(local),cloud:cloudCopy(head.current),alternatives:head.conflicts||{}}}}};
      delete next.conflicts;return next;
    });
    assertActive();const resolved=await store.resolveRemoteConflict({...remote.current,remoteRevision:remote.revision});
    if(selectedScope==='tutorial'){tutorial=resolved;tutorialCompleted=Boolean(resolved.state.completed)}
    else{draft=resolved;current=view(draft)}
    await detectConflicts();emit();return current?copy(current):null;
  })}
  async function readLeaderboard(options={}){
    const selectedMode=options.mode||mode,difficulty=options.difficulty||'normal';
    if(!['assessment','free'].includes(selectedMode)||!['easy','normal','hard'].includes(difficulty))throw new TypeError('Invalid leaderboard selection');
    const {value}=await backend.restTransport().get(`settlementsLeaderboard/${selectedMode}/${difficulty}`,{timeoutMs:8000});
    return selectSettlementsLeaders(Object.entries(value||{}).map(([id,row])=>({...row,id})),{mode:selectedMode,difficulty});
  }
  const online=()=>{if(isActive())void flush().catch(()=>{})};
  const visibility=()=>{if(globalThis.document?.visibilityState==='hidden')void writer.release().catch(()=>emit('unsafe'));else if(isActive())void writer.acquire().then(online).catch(()=>{})};
  globalThis.addEventListener?.('online',online);
  globalThis.document?.addEventListener('visibilitychange',visibility);
  const retry=setInterval(online,15000);
  return {loadSession,saveSession,confirmOnline,completeSession,loadTutorial,saveTutorial,flush,readLeaderboard,
    canWrite,acquireWriter:async()=>{await writer.acquire();return canWrite()},resolveConflict,
    async destroy(){
      if(disposed)return;
      clearInterval(retry);globalThis.removeEventListener?.('online',online);globalThis.document?.removeEventListener('visibilitychange',visibility);
      await tail;await store.flushLocal();await writer.close();disposed=true;
    }};
}
