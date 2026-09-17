import {backend} from './backend.js?v=1.3.8';
import {readState,writeState} from './session.js?v=1.3.8';
import {durableStore} from './durable-store.js';
import {registerRecoveryProvider} from './notifications.js?v=1.3.8';

export function attemptOwner(){
  if(backend.isAdmin())return `teacher:${backend.user.uid}`;
  return backend.getProfile()?.studentKey?`student:${backend.getProfile().studentKey}`:'guest';
}
const key=session=>`draft.v1:${session.owner}:${session.activitySlug}:${session.buildOptions?.mode||'default'}`;
const prepared=new Map(),inMemory=new Map();
const scopeKey=(owner,slug,mode='default')=>`${owner}:${slug}:${mode}`;
registerRecoveryProvider(()=>({quizDrafts:[...inMemory.values()].filter(d=>d.owner===attemptOwner())}));
export async function prepareQuizDraft(activitySlug,{mode='default'}={}){
  const owner=attemptOwner();if(owner==='guest')return;
  const scope={owner,activitySlug,mode};
  const draft=await (backend.loadDraft?backend.loadDraft(scope):durableStore.loadDraft(scope));
  if(owner===attemptOwner())prepared.set(scopeKey(owner,activitySlug,mode),draft?.state||null);
}
let warnedAt=0;
export function persistQuiz(session){
  if(session.owner==='guest')return Promise.resolve(true);
  const {questions,finishPromise,...saved}=session;
  const snapshot=structuredClone({...saved,questionIds:questions.map(q=>q.id)});
  const scope={owner:session.owner,activitySlug:session.activitySlug,mode:session.buildOptions?.mode||'default',attemptId:session.id};
  inMemory.set(scopeKey(scope.owner,scope.activitySlug,scope.mode),snapshot);
  prepared.set(scopeKey(scope.owner,scope.activitySlug,scope.mode),snapshot);
  // Preserve the old copy for backwards compatibility; IDB is the acknowledgment.
  try{writeState(key(session),snapshot)}catch{}
  const pending=(backend.checkpoint?backend.checkpoint({...scope,contentVersion:'quiz-key-v2',state:snapshot}):durableStore.checkpoint({...scope,contentVersion:'quiz-key-v2',state:snapshot},{queue:scope.owner.startsWith('student:')}));
  return pending.then(record=>{
    if(record?.saveStatus?.durable===false)throw Object.assign(new Error('Local save failed'),{code:'storage/local-save-failed'});
    return true;
  }).catch(error=>{if(Date.now()-warnedAt>5000){warnedAt=Date.now();window.dispatchEvent(new CustomEvent('rudn:toast',{detail:{message:error,type:'error',critical:true}}))}return false});
}
export function restoreQuiz(session,{fresh=false,persist=true}={}){
  session.owner=attemptOwner();session.phase='answering';
  if(!persist)return session;
  const cacheKey=scopeKey(session.owner,session.activitySlug,session.buildOptions?.mode||'default');
  const draft=fresh?null:(prepared.get(cacheKey)||readState(key(session),null));
  if(draft?.owner===session.owner&&draft.activitySlug===session.activitySlug&&Array.isArray(draft.questionIds)){
    const byId=new Map((window.RUDN_DATA?.questions||session.questions).map(q=>[q.id,q]));
    const questions=draft.questionIds.map(id=>byId.get(id));
    if(questions.length&&questions.every(Boolean)){
      const restored={...session,...draft,questions,buildOptions:{...session.buildOptions,...draft.buildOptions},title:session.title};
      restored.index=Math.max(0,Math.min(questions.length-1,Number(restored.index)||0));
      // A locally acknowledged completed attempt must never become unfinished again.
      if(restored.phase==='submitting')restored.phase=backend.localAttempts().some(a=>a.id===restored.id&&`student:${a.studentKey}`===restored.owner)?'completed':'answering';
      return restored;
    }
  }
  persistQuiz(session);return session;
}
