// Additive, evidence-based correction for previously completed classroom quizzes.
export const SEMINAR1_Q48_ID='241e62c4-635b-518b-9ed0-cc18c426ae2e';
export const SEMINAR1_Q48_REVISION='seminar1-q48-2026-09-06';
const canonical=value=>({'municipal|legislative':'municipal|representative','municipal|executive':'municipal|administration','municipal|judicial':'municipal|other'}[value]||value);

export function needsSeminar1Q48Review(attempt){
  return attempt?.activitySlug==='seminar-1-classroom'&&attempt.recordGrade===false
    &&attempt.answers?.[SEMINAR1_Q48_ID]==='regional|executive'
    &&!attempt.gradingAdjustments?.[SEMINAR1_Q48_REVISION];
}

export function reconcileSeminar1Q48(attempt,questions){
  if(!needsSeminar1Q48Review(attempt))return attempt;
  const ids=attempt.questionIds;
  if(!Array.isArray(ids)||ids.length!==50||new Set(ids).size!==50||attempt.maxPoints!==50)return attempt;
  const bank=new Map(questions.map(q=>[q.id,q]));
  const accepted48=bank.get(SEMINAR1_Q48_ID)?.classification_accepted||[];
  if(!accepted48.includes('regional|legislative')||!accepted48.includes('regional|executive'))return attempt;
  if(!ids.includes(SEMINAR1_Q48_ID))return attempt;
  let previousScore=0;
  for(const id of ids){
    const q=bank.get(id);
    if(!q||q.category!=='Семинар 1. Ветви и уровни власти'||q.type!=='matrix_single')return attempt;
    const keys=id===SEMINAR1_Q48_ID?['regional|legislative']:
      (q.classification_accepted?.length?q.classification_accepted:[q.classification_correct]);
    previousScore+=Number(keys.map(canonical).includes(canonical(attempt.answers?.[id])));
  }
  // Unknown/manual scores and already-corrected attempts must not receive a second point.
  if(attempt.points!==previousScore||Math.abs(attempt.ratio-previousScore/50)>1e-8||!Number.isFinite(attempt.ratio))return attempt;
  return {
    ...attempt,points:previousScore+1,ratio:(previousScore+1)/50,
    gradingAdjustments:{...attempt.gradingAdjustments,[SEMINAR1_Q48_REVISION]:{
      questionId:SEMINAR1_Q48_ID,previousPoints:attempt.points,previousRatio:attempt.ratio,pointsAdded:1,
      reason:'Instructor accepts regional legislative and executive classifications for question 48.'
    }}
  };
}
