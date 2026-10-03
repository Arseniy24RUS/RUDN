import {settlementsPoints,validateSettlementsResult} from './settlements-leaderboard.js';
import {COPY,normalizeLocale} from '../../apps/settlements/copy.mjs';
import {durableStore} from './durable-store.js';

/** Display receipt only. Pending results never change the gradebook or totals. */
export function settlementsCourseStatus(draft,tutorial,grade,owner){
  if(!owner?.startsWith('student:'))return null;
  const party=draft?.owner===owner&&draft.activitySlug==='seminar-3'&&draft.mode==='settlements-assessment'?draft:null;
  const learning=tutorial?.owner===owner&&tutorial.activitySlug==='settlements-tutorial'&&tutorial.mode==='tutorial'?tutorial:null;
  if(party?.saveStatus?.state==='conflict')return {kind:'conflict'};
  const state=party?.state;
  if(state&&['completion-pending','completed'].includes(state.status)){
    try{
      validateSettlementsResult(state.result);
      const points=settlementsPoints(state.difficulty,state.result.coverageNp,true,'assessment');
      if(grade&&Number(grade.points)>=points)return null;
      return {kind:'pending',points};
    }catch{return {kind:'recover'};}
  }
  if(grade)return null;
  if(state?.status==='active'){
    let save=state.engineSave;
    try{if(typeof save==='string')save=JSON.parse(save);}catch{return {kind:'recover'};}
    return {kind:save?.ui?.terminalReason?'recover':'active'};
  }
  return learning?.state?.completed?{kind:'tutorial'}:null;
}

export async function readSettlementsCourseDrafts(store,owner){
  if(!owner?.startsWith('student:'))return [null,null];
  return Promise.all([
    store.loadDraft({owner,activitySlug:'seminar-3',mode:'settlements-assessment'}),
    store.loadDraft({owner,activitySlug:'settlements-tutorial',mode:'tutorial'})
  ]);
}

export function settlementsCourseMessage(status,locale='ru'){
  const copy=COPY[normalizeLocale(locale)];
  const label=copy[{pending:'gradePending',conflict:'gradeConflict',recover:'gradeResume',active:'gradeActive',tutorial:'gradeTutorial'}[status?.kind]];
  return label?`${status.kind==='pending'?`${status.points}/5 · `:''}${label}`:'';
}

/** Finish an already terminal assessed receipt after its map has been closed. */
export function mountSettlementsCourseReceipt({backend,owner,knownGrade,store=durableStore,onSettled=()=>{},
  persistenceFactory=async options=>(await import('./settlements-storage.js')).createSettlementsPersistence(options),
  eventTarget=globalThis,setIntervalFn=setInterval,clearIntervalFn=clearInterval}={}){
  const generation=backend?.generation;
  let disposed=false,running=null,timer=null,waiting=true,lastReceipt=null;
  const active=()=>!disposed&&owner?.startsWith('student:')&&!backend?.isAdmin?.()&&
    `student:${backend?.getProfile?.()?.studentKey}`===owner&&backend?.generation===generation;
  const needsReceipt=session=>session?.status==='completion-pending'||session?.status==='completed'&&
    session.attemptId!==lastReceipt&&(!knownGrade||Number(knownGrade.points)<
      settlementsPoints(session.difficulty,session.result?.coverageNp,true,'assessment'));
  const clearTimer=()=>{if(timer!==null){clearIntervalFn(timer);timer=null}};
  async function work(){
    let persistence=null,receipt=null;
    try{
      if(!active())return;
      if(globalThis.navigator?.onLine===false||!backend.user){waiting=true;return;}
      persistence=await persistenceFactory({backend,owner,mode:'assessment',store});
      if(!active())return;
      const before=await persistence.loadSession();
      if(!active())return;
      waiting=needsReceipt(before);
      if(!waiting)return;
      validateSettlementsResult(before.result);
      await persistence.acquireWriter();
      if(!active()||!persistence.canWrite())return;
      // Another tab/device may have advanced the party before we got the lock.
      const current=await persistence.loadSession();
      if(!active()||!persistence.canWrite())return;
      if(!needsReceipt(current)){waiting=false;return;}
      validateSettlementsResult(current.result);
      const saved=await persistence.flush();
      if(!active())return;
      waiting=saved.session?.status==='completion-pending'||saved.status?.state!=='saved';
      if(saved.session?.status==='completed'&&saved.status?.state==='saved')receipt=saved.session.attemptId;
    }catch{
      // Keep the durable queue and both conflicting branches. Never infer a grade.
      waiting=true;
    }finally{
      if(persistence)await persistence.destroy().catch(()=>{});
      if(active()&&waiting&&timer===null)timer=setIntervalFn(retry,15000);
      if(!active()||!waiting)clearTimer();
    }
    return receipt;
  }
  function retry(){
    if(!active()){clearTimer();return Promise.resolve();}
    if(!running)running=work().then(receipt=>{
      if(receipt&&active()&&lastReceipt!==receipt){
        lastReceipt=receipt;
        // Main's render waits for cleanup; do not await that render from this job.
        queueMicrotask(()=>{if(active())void onSettled();});
      }
    }).finally(()=>{running=null});
    return running;
  }
  eventTarget.addEventListener?.('online',retry);
  const ready=Promise.resolve().then(retry);
  return {ready,retry,async destroy(){disposed=true;clearTimer();eventTarget.removeEventListener?.('online',retry);await running;}};
}
