import {backend} from './backend.js?v=1.2.0';
import {readState,writeState} from './session.js?v=1.2.0';

export function attemptOwner(){
  if(backend.isAdmin())return `teacher:${backend.user.uid}`;
  return backend.getProfile()?.studentKey?`student:${backend.getProfile().studentKey}`:'guest';
}
const key=session=>`draft.v1:${session.owner}:${session.activitySlug}:${session.buildOptions?.mode||'default'}`;
let warnedAt=0;
export function persistQuiz(session){
  if(session.owner==='guest')return;
  const {questions,finishPromise,...saved}=session;
  try{writeState(key(session),{...saved,questionIds:questions.map(q=>q.id)});return true}
  catch(error){if(Date.now()-warnedAt>5000){warnedAt=Date.now();window.dispatchEvent(new CustomEvent('rudn:toast',{detail:{message:error,type:'error'}}))}return false}
}
export function restoreQuiz(session,{fresh=false,persist=true}={}){
  session.owner=attemptOwner();session.phase='answering';
  if(!persist)return session;
  const draft=fresh?null:readState(key(session),null);
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
