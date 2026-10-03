import {settlementsPoints,validateSettlementsResult} from './settlements-leaderboard.js';
import {COPY,normalizeLocale} from '../../apps/settlements/copy.mjs';

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
