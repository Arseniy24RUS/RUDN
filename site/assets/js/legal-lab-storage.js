import {durableStore} from './durable-store.js';

const copy = value => value == null ? value : structuredClone(value);
const safe = value => String(value).replace(/[^A-Za-z0-9_-]/g, '-');
function hash(value) {
  let n = 2166136261;
  for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return (n >>> 0).toString(36);
}
export function legalLabIdentity(owner, period, contentVersion) {
  const key = `${safe(period)}-${safe(contentVersion)}-${hash(owner)}`;
  // One durable draft owns both the workspace and its terminal receipt.
  // The platform can therefore retain or supersede the whole branch atomically.
  return {workspaceId:`legal-assessment-${key}`, attemptId:`legal-assessment-${key}`};
}
export function legalLabAttemptForCourse(attempt) {
  const date=new Date(attempt.finishedAt ?? attempt.startedAt);
  if(!Number.isFinite(date.getTime()))throw new TypeError('Legal Lab attempt requires a stable completion time');
  return {...attempt,createdAt:date.toISOString()};
}
const fault = code => Object.assign(new Error(code), {code, name:code === 'storage/conflict' ? 'DraftConflict' : 'Error'});
// RTDB drops empty objects/arrays. Preserve the module document losslessly.
export function legalLabState(value) {
  if (!value) return null;
  const state=typeof value.legalLab === 'string' ? JSON.parse(value.legalLab) : copy(value);
  if (state.schema !== 1 || !state.contentVersion || !state.id) throw fault('legal-lab/invalid-checkpoint');
  return state;
}

const practiceFields=['answers','scanFields','reader','index','view','elapsedMs','liveRoom','practiceCompletion','scanAnswerHistory'];
function practiceState(value,contentVersion){
  if(!value?.legalLabPractice)return null;
  let state;
  try{state=JSON.parse(value.legalLabPractice);}catch{throw fault('legal-lab/invalid-practice-checkpoint');}
  if(state?.schema!==1||state.contentVersion!==contentVersion||!state.fields||typeof state.fields!=='object')throw fault('legal-lab/invalid-practice-checkpoint');
  return state;
}

/** The course durable store owns cloud drafts; the module's IDB is a device mirror. */
export function createLegalLabPersistence({backend, owner, period, contentVersion,
  store=durableStore, onConflict=()=>{}, getOwner=()=>owner}={}) {
  const canonicalOwner = owner === 'guest' ? 'guest:legal-lab' : owner;
  const ids = legalLabIdentity(canonicalOwner, period, contentVersion);
  const scope = {owner:canonicalOwner, activitySlug:'seminar-4', mode:'legal-lab-workspace', attemptId:ids.workspaceId};
  const practiceScope={...scope,mode:'legal-lab-practice',attemptId:ids.workspaceId+'-practice'};
  const generation = backend.generation;
  const student = canonicalOwner.startsWith('student:');
  let draft=null, practice=null, acceptedTerminalIntentId=null, disposed=false, tail=Promise.resolve(), paused=false;
  const active = () => !disposed && getOwner() === owner && generation === backend.generation &&
    (!student || 'student:'+backend.getProfile()?.studentKey === canonicalOwner);
  const assertActive = () => { if (!active()) throw fault('auth/profile-changed'); };
  const serial = action => { const result=tail.then(action); tail=result.catch(()=>{}); return result; };
  const conflictsFor=async row=>row?(await store.listConflicts({owner:canonicalOwner,draftId:row.id})).filter(c=>!c.resolvedAt):[];
  const unresolved=async()=>[...await conflictsFor(draft),...await conflictsFor(practice)];
  async function checkConflicts() {
    const conflicts = await unresolved();
    if (conflicts.length) { paused=true; onConflict(conflicts); throw fault('storage/conflict'); }
  }
  function restoredState(){
    const state=legalLabState(draft?.state);
    if(!state)return null;
    const extension=practiceState(practice?.state,contentVersion);
    if(extension){
      for(const field of practiceFields)if(Object.hasOwn(extension.fields,field))state[field]=copy(extension.fields[field]);
      if(draft.phase==='completed'&&state.assessment&&extension.terminalIntentId===draft.lastIntentId&&
        ['host-accepted','pending','not-submitted'].includes(extension.delivery))state.assessment.delivery=extension.delivery;
    }
    return state;
  }
  async function loadScope(target){
    let row=await backend.loadDraft(target);
    assertActive();
    if(student&&backend.user&&globalThis.navigator?.onLine!==false&&backend.durableSync){
      try{await backend.durableSync().restore(target,{timeoutMs:4000});}
      catch(error){if(!active())throw error;}
      row=await store.loadDraft(target);
      assertActive();
    }
    return row;
  }
  async function load() {
    draft=await loadScope(scope);
    practice=await loadScope(practiceScope);
    const extension=practiceState(practice?.state,contentVersion);
    acceptedTerminalIntentId=draft?.phase==='completed'&&extension?.terminalIntentId===draft.lastIntentId&&extension.delivery==='host-accepted'?draft.lastIntentId:null;
    try{await checkConflicts();}catch(error){if(error.code!=='storage/conflict')throw error;}
    return restoredState();
  }
  async function checkpointPractice(state){
    const fields=Object.fromEntries(practiceFields.filter(field=>Object.hasOwn(state,field)).map(field=>[field,copy(state[field])]));
    // Only a successful host save for this exact terminal intent can mark the
    // receipt accepted. Conflict resolution changes that intent and removes the
    // superseded queue, so an obsolete marker must never suppress resubmission.
    const accepted=acceptedTerminalIntentId===draft.lastIntentId;
    const requested=state.assessment?.delivery;
    const delivery=requested==='host-accepted'&&!accepted?'pending':requested;
    const value={schema:1,contentVersion,fields,terminalIntentId:draft.lastIntentId,
      ...(['host-accepted','pending','not-submitted'].includes(delivery)?{delivery}:{})};
    practice=await backend.checkpoint({...practiceScope,contentVersion,state:{legalLabPractice:JSON.stringify(value)},baseRevision:practice?.revision||0},{queue:student});
    return practice;
  }
  function checkpoint({state,contentVersion:version}) {
    return serial(async () => {
      assertActive();
      if (version !== contentVersion) throw fault('legal-lab/content-version-changed');
      if (paused) throw fault('storage/conflict');
      await checkConflicts();
      let saved;
      try {
        if(draft?.phase==='completed')saved=await checkpointPractice(state);
        else{
          draft=await backend.checkpoint({...scope,contentVersion,state:{legalLab:JSON.stringify(state)},baseRevision:draft?.revision||0},{queue:student});
          saved=draft;
          // Another local tab may have completed the primary before this write.
          if(draft.phase==='completed'||practice)saved=await checkpointPractice(state);
        }
      } catch (error) {
        if (error.code === 'storage/conflict') { paused=true; onConflict(await unresolved()); throw fault('storage/conflict'); }
        throw error;
      }
      assertActive();
      return saved;
    });
  }
  function saveAttempt(attempt) {
    return serial(async()=>{
      assertActive();
      if(attempt.id!==ids.attemptId||attempt.type!=='legal-lab'||attempt.activitySlug!==scope.activitySlug)throw fault('legal-lab/attempt-identity-mismatch');
      if(paused)throw fault('storage/conflict');
      await checkConflicts();
      // backend.saveAttempt completes this same draft, preserving its encoded
      // module state and adding the immutable result receipt in one transaction.
      const result=await backend.saveAttempt({...attempt,draftMode:scope.mode});
      draft=await store.loadDraft(scope);
      assertActive();
      acceptedTerminalIntentId=draft?.phase==='completed'?draft.lastIntentId:null;
      return result;
    });
  }
  function resolve(choice) {
    return serial(async()=>{
      assertActive();
      if(!['local','cloud'].includes(choice)||!student||!backend.user)throw fault('storage/invalid-resolution');
      draft=await store.loadDraft(scope);
      practice=await store.loadDraft(practiceScope);
      const primaryConflicts=await conflictsFor(draft),practiceConflicts=await conflictsFor(practice);
      const primary=primaryConflicts.length>0;
      if(!primary&&!practiceConflicts.length)throw fault('storage/no-conflict');
      const target=primary?scope:practiceScope,local=primary?draft:practice;
      const id=globalThis.crypto.randomUUID();
      const path='checkpoints/'+canonicalOwner.slice(8)+'/seminar-4/'+target.attemptId;
      const {value:remote}=await backend.restTransport().transaction(path,head=>{
        assertActive();
        if(!head?.current||head.current.contentVersion!==contentVersion||head.current.mode!==target.mode||head.current.attemptId!==target.attemptId)throw fault('database/checkpoint-invalid');
        const selected=copy(choice==='local'?local:head.current);
        if(!selected)throw fault('storage/no-local-version');
        if(primary){
          const cloudState=legalLabState(head.current.state),localState=legalLabState(local?.state);
          if(choice==='local'&&cloudState?.assessment?.result&&JSON.stringify(localState?.assessment?.answer)!==JSON.stringify(cloudState.assessment.answer))throw fault('legal-lab/result-already-final');
        }
        const revision=head.revision+1;
        const next={...head,revision,updatedAt:Date.now(),ownerUid:backend.user.uid,
          current:{...selected,remoteRevision:revision,lastIntentId:id,ownerUid:backend.user.uid,
            deviceId:'resolution-'+id,localRevision:selected.localRevision||selected.revision},
          conflictHistory:{...head.conflictHistory,[id]:{selected:choice,at:Date.now(),branches:{local:copy(local),cloud:copy(head.current),alternatives:head.conflicts||{}}}}};
        delete next.conflicts;
        return next;
      });
      assertActive();
      const resolved=await store.resolveRemoteConflict({...remote.current,remoteRevision:remote.revision});
      if(primary){draft=resolved;acceptedTerminalIntentId=null;}else{
        practice=resolved;const extension=practiceState(practice.state,contentVersion);
        acceptedTerminalIntentId=draft?.phase==='completed'&&extension?.terminalIntentId===draft.lastIntentId&&extension.delivery==='host-accepted'?draft.lastIntentId:null;
      }
      const conflicts=await unresolved();paused=conflicts.length>0;if(paused)onConflict(conflicts);
      return restoredState();
    });
  }
  const stop=store.subscribe?.(detail=>{
    if(detail.owner!==canonicalOwner||(!draft&&!practice)||disposed||paused)return;
    void unresolved().then(conflicts=>{if(conflicts.length&&active()){paused=true;onConflict(conflicts);}}).catch(()=>{});
  });
  return {load,checkpoint,saveAttempt,resolve,attemptId:ids.attemptId,get conflicted(){return paused;},
    flush:()=>tail,destroy(){disposed=true;stop?.();}};
}
