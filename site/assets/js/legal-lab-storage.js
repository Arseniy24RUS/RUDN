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
const FIVE_MODE='five-task-v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const fixedAssessment=value=>value&&Object.fromEntries(['attemptId','contentVersion','caseId','phase','startedAt','finishedAt','answer','result','documentVersions','format'].filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
// RTDB drops empty objects/arrays. Preserve the module document losslessly.
export function legalLabState(value) {
  if (!value) return null;
  const state=typeof value.legalLab === 'string' ? JSON.parse(value.legalLab) : copy(value);
  if (state.schema !== 1 || !state.contentVersion || !state.id) throw fault('legal-lab/invalid-checkpoint');
  return state;
}

const practiceFields=['answers','scanFields','reader','index','view','elapsedMs','liveRoom','practiceCompletion','quizCompletion','scanAnswerHistory'];
function practiceState(value,contentVersion){
  if(!value?.legalLabPractice)return null;
  let state;
  try{state=JSON.parse(value.legalLabPractice);}catch{throw fault('legal-lab/invalid-practice-checkpoint');}
  if(state?.schema!==1||state.contentVersion!==contentVersion||!state.fields||typeof state.fields!=='object')throw fault('legal-lab/invalid-practice-checkpoint');
  return state;
}
function completedHistoryIsPreserved(cloud,local){
  const rows=value=>[value?.assessment,...(Array.isArray(value?.assessmentHistory)?value.assessmentHistory:[])].filter(Boolean);
  const candidates=rows(local);
  return rows(cloud).filter(item=>item.format===FIVE_MODE&&item.phase==='completed').every(item=>
    candidates.some(candidate=>candidate.attemptId===item.attemptId&&same(fixedAssessment(candidate),fixedAssessment(item))));
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
  let draft=null, practice=null, terminal=null, acceptedTerminalIntentId=null, acceptedRetryIntentId=null, disposed=false, tail=Promise.resolve(), paused=false;
  const retryId=id=>typeof id==='string'&&id.startsWith(ids.attemptId+'-r-')&&uuid.test(id.slice(ids.attemptId.length+3));
  const retryScope=id=>({...scope,mode:'legal-lab-assessment',attemptId:id});
  const retryAssessment=value=>Boolean(value&&retryId(value.attemptId)&&value.contentVersion===contentVersion&&value.format===FIVE_MODE&&value.answer?.assessmentMode===FIVE_MODE);
  function checkedRetry(value){if(!retryAssessment(value))throw fault('legal-lab/attempt-identity-mismatch');return value;}
  const active = () => !disposed && getOwner() === owner && generation === backend.generation &&
    (!student || 'student:'+backend.getProfile()?.studentKey === canonicalOwner);
  const assertActive = () => { if (!active()) throw fault('auth/profile-changed'); };
  const serial = action => { const result=tail.then(action); tail=result.catch(()=>{}); return result; };
  const conflictsFor=async row=>row?(await store.listConflicts({owner:canonicalOwner,draftId:row.id})).filter(c=>!c.resolvedAt):[];
  const unresolved=async()=>[...await conflictsFor(draft),...await conflictsFor(practice),...await conflictsFor(terminal)];
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
      // The completed legacy workspace remains immutable. Only the explicit new
      // format may own the assessment extension; a legacy answer cannot replace it.
      if(extension.fields.assessment){
        checkedRetry(extension.fields.assessment);
        state.assessment=copy(extension.fields.assessment);
      }
      if(Object.hasOwn(extension.fields,'assessmentHistory'))state.assessmentHistory=copy(extension.fields.assessmentHistory);
      if(draft.phase==='completed'&&state.assessment&&extension.terminalIntentId===draft.lastIntentId&&
        !retryAssessment(state.assessment)&&['host-accepted','pending','not-submitted'].includes(extension.delivery))state.assessment.delivery=extension.delivery;
    }
    if(retryAssessment(state.assessment)&&state.assessment.delivery==='host-accepted'&&
      (terminal?.attemptId!==state.assessment.attemptId||acceptedRetryIntentId!==terminal?.lastIntentId))state.assessment.delivery='pending';
    return state;
  }
  function terminalMatches(row,assessment){
    if(row?.mode!=='legal-lab-assessment'||row.attemptId!==assessment?.attemptId||row.phase!=='completed')return false;
    const saved=legalLabState(row.state);
    return same(fixedAssessment(saved?.assessment),fixedAssessment(assessment))&&saved?.assessment?.phase==='completed';
  }
  async function loadTerminal(state,{remote=false}={}){
    const assessment=state?.assessment;
    if(!retryAssessment(assessment)){terminal=null;acceptedRetryIntentId=null;return;}
    terminal=remote?await loadScope(retryScope(assessment.attemptId)):await store.loadDraft(retryScope(assessment.attemptId));
    assertActive();
    if(!terminalMatches(terminal,assessment)||acceptedRetryIntentId!==terminal?.lastIntentId)acceptedRetryIntentId=null;
    // A durable terminal receipt proves the host save even if the browser closed
    // before its final workspace autosave. It does not claim cloud delivery.
    if(terminalMatches(terminal,assessment)&&!((await conflictsFor(terminal)).length))acceptedRetryIntentId=terminal.lastIntentId;
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
    await loadTerminal(restoredState(),{remote:true});
    try{await checkConflicts();}catch(error){if(error.code!=='storage/conflict')throw error;}
    return restoredState();
  }
  async function checkpointPractice(state){
    const fields=Object.fromEntries(practiceFields.filter(field=>Object.hasOwn(state,field)).map(field=>[field,copy(state[field])]));
    if(retryAssessment(state.assessment))fields.assessment=copy(state.assessment);
    if(Object.hasOwn(state,'assessmentHistory'))fields.assessmentHistory=copy(state.assessmentHistory);
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
  function checkpointState(input){
    const state=legalLabState(input),previous=restoredState(),next=state.assessment;
    if(state.contentVersion!==contentVersion)throw fault('legal-lab/content-version-changed');
    if(next&&(next.format!==undefined||next.answer?.assessmentMode!==undefined||retryId(next.attemptId)))checkedRetry(next);
    if(Object.hasOwn(state,'assessmentHistory')){
      if(!Array.isArray(state.assessmentHistory)||state.assessmentHistory.length>1000)throw fault('legal-lab/invalid-assessment-history');
      const seen=new Set();
      for(const item of state.assessmentHistory){
        if(!item||typeof item!=='object'||!item.attemptId||seen.has(item.attemptId)||item.attemptId===next?.attemptId)throw fault('legal-lab/invalid-assessment-history');
        if(item.attemptId!==ids.attemptId)checkedRetry(item);
        seen.add(item.attemptId);
      }
      for(const item of previous?.assessmentHistory||[]){
        const retained=state.assessmentHistory.find(other=>other.attemptId===item.attemptId);
        if(!retained||!same(fixedAssessment(item),fixedAssessment(retained)))throw fault('legal-lab/assessment-history-changed');
      }
    }else if(previous?.assessmentHistory?.length)throw fault('legal-lab/assessment-history-changed');
    const before=previous?.assessment;
    if(retryAssessment(next)&&before?.attemptId&&before.attemptId!==next.attemptId){
      const retained=state.assessmentHistory?.find(item=>item.attemptId===before.attemptId);
      if(!retained||!same(fixedAssessment(before),fixedAssessment(retained)))throw fault('legal-lab/assessment-history-changed');
    }
    if(retryAssessment(before)&&before.attemptId===next?.attemptId&&before.phase==='completed'&&!same(fixedAssessment(before),fixedAssessment(next)))throw fault('legal-lab/result-already-final');
    if(retryAssessment(next)&&next.delivery==='host-accepted'&&(terminal?.attemptId!==next.attemptId||acceptedRetryIntentId!==terminal?.lastIntentId))next.delivery='pending';
    return state;
  }
  function checkpoint({state,contentVersion:version}) {
    return serial(async () => {
      assertActive();
      if (version !== contentVersion) throw fault('legal-lab/content-version-changed');
      if (paused) throw fault('storage/conflict');
      await checkConflicts();
      state=checkpointState(state);
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
      if(terminal?.attemptId!==state.assessment?.attemptId){terminal=null;acceptedRetryIntentId=null;}
      return saved;
    });
  }
  function saveAttempt(attempt) {
    return serial(async()=>{
      assertActive();
      if((attempt.id!==ids.attemptId&&!retryId(attempt.id))||attempt.type!=='legal-lab'||attempt.activitySlug!==scope.activitySlug)throw fault('legal-lab/attempt-identity-mismatch');
      if(paused)throw fault('storage/conflict');
      draft=await store.loadDraft(scope);practice=await store.loadDraft(practiceScope);assertActive();
      await checkConflicts();
      if(retryId(attempt.id)){
        const state=restoredState(),assessment=checkedRetry(state?.assessment);
        if(assessment.attemptId!==attempt.id||assessment.phase!=='completed'||attempt.contentVersion!==contentVersion||
          assessment.caseId!==attempt.caseId||assessment.startedAt!==attempt.startedAt||assessment.finishedAt!==attempt.finishedAt||
          !Number.isFinite(attempt.points)||attempt.points<0||attempt.points>5||attempt.maxPoints!==5||
          assessment.result?.points!==attempt.points||assessment.result?.maxPoints!==attempt.maxPoints||
          !same(assessment.result.criteria,attempt.legalLab?.criteria)||!same(assessment.answer,attempt.legalLab?.answer)||
          !same(assessment.documentVersions,attempt.legalLab?.documentVersions))throw fault('legal-lab/attempt-state-mismatch');
        try{if(!same(JSON.parse(attempt.legalLab.answerJson),assessment.answer))throw new Error();}catch{throw fault('legal-lab/attempt-state-mismatch');}
        const target=retryScope(attempt.id),parent=draft.phase==='completed'?practiceScope:scope;
        terminal=await store.loadDraft(target);assertActive();
        if(terminal?.phase==='completed'&&!terminalMatches(terminal,assessment))throw fault('legal-lab/result-already-final');
        if(terminal?.phase!=='completed')terminal=await backend.checkpoint({...target,contentVersion,baseRevision:terminal?.revision||0,
          state:{legalLab:JSON.stringify({schema:1,id:state.id,contentVersion,assessment:copy(assessment)}),
            legalLabParent:{workspaceId:ids.workspaceId,mode:parent.mode,attemptId:parent.attemptId}}},{queue:student});
        assertActive();await checkConflicts();
        const result=await backend.saveAttempt({...attempt,draftMode:target.mode});
        terminal=await store.loadDraft(target);assertActive();
        if(!terminalMatches(terminal,assessment))throw fault('legal-lab/attempt-state-mismatch');
        acceptedRetryIntentId=terminal.lastIntentId;
        return result;
      }
      const selectedAssessment=restoredState()?.assessment;
      if(selectedAssessment?.attemptId&&selectedAssessment.attemptId!==attempt.id)throw fault('legal-lab/attempt-identity-mismatch');
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
      await loadTerminal(restoredState());
      const primaryConflicts=await conflictsFor(draft),practiceConflicts=await conflictsFor(practice),terminalConflicts=await conflictsFor(terminal);
      const primary=primaryConflicts.length>0;
      const retry=!primary&&!practiceConflicts.length&&terminalConflicts.length>0;
      if(!primary&&!practiceConflicts.length&&!retry)throw fault('storage/no-conflict');
      const target=primary?scope:retry?retryScope(terminal.attemptId):practiceScope,local=primary?draft:retry?terminal:practice;
      const id=globalThis.crypto.randomUUID();
      const path='checkpoints/'+canonicalOwner.slice(8)+'/seminar-4/'+target.attemptId;
      const {value:remote}=await backend.restTransport().transaction(path,head=>{
        assertActive();
        if(!head?.current||head.current.contentVersion!==contentVersion||head.current.mode!==target.mode||head.current.attemptId!==target.attemptId)throw fault('database/checkpoint-invalid');
        const selected=copy(choice==='local'?local:head.current);
        if(!selected)throw fault('storage/no-local-version');
        if(primary||retry){
          const cloudState=legalLabState(head.current.state),localState=legalLabState(local?.state);
          if(choice==='local'&&(!completedHistoryIsPreserved(cloudState,localState)||
            (cloudState?.assessment?.format!==FIVE_MODE&&cloudState?.assessment?.result&&JSON.stringify(localState?.assessment?.answer)!==JSON.stringify(cloudState.assessment.answer))))throw fault('legal-lab/result-already-final');
        }else if(choice==='local'){
          const cloudState=practiceState(head.current.state,contentVersion)?.fields,localState=practiceState(local?.state,contentVersion)?.fields;
          if(!completedHistoryIsPreserved(cloudState,localState))throw fault('legal-lab/result-already-final');
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
      if(primary){draft=resolved;acceptedTerminalIntentId=null;}else if(retry){terminal=resolved;acceptedRetryIntentId=null;}else{
        practice=resolved;const extension=practiceState(practice.state,contentVersion);
        acceptedTerminalIntentId=draft?.phase==='completed'&&extension?.terminalIntentId===draft.lastIntentId&&extension.delivery==='host-accepted'?draft.lastIntentId:null;
      }
      await loadTerminal(restoredState());
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
