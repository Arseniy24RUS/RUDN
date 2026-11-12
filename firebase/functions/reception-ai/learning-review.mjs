import {LEARNING_REVIEW_DATA} from './learning-review-data.mjs';

const language=value=>value==='en'||value==='zh'?value:'ru';
const text=(value,locale)=>typeof value==='string'?value:value?.[language(locale)]||value?.ru||'';
function dateOnly(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:'';
}
function resolvedText(value,caseData,locale){
  let unresolved=false;
  const result=text(value,locale).replace(/\{\{([a-z][a-z0-9]*)\}\}/gi,(_match,key)=>{
    const name=key.replace(/ISO$/,''),events=caseData.public?.assessment?.calendar?.events||[];
    const eventDate=dateOnly(events.find(event=>event.id===name)?.date),packDate=dateOnly(caseData.provenance?.dateValues?.[name+'ISO']);
    const date=eventDate||packDate;
    if(!date||eventDate&&packDate&&eventDate!==packDate){unresolved=true;return '';}
    return /ISO$/.test(key)?date:date.split('-').reverse().join('.');
  });
  return unresolved||/\{\{|\}\}/.test(result)?'':result;
}

/** Never called a grading key. It is authored feedback after the whole training case. */
export function learningReviewFor({mode,status,caseData,locale='ru'}={}){
  if(mode!=='training'||!['review','complete'].includes(status))return null;
  if(!caseData?.id||!Object.hasOwn(LEARNING_REVIEW_DATA,caseData.id))return null;
  const row=LEARNING_REVIEW_DATA[caseData.id],origin=caseData.provenance;
  // A reused ID or a changed authoring file must not receive another case's explanation.
  if(!row.contrast||origin?.sourceCaseId!==caseData.id||origin.sourceContentVersion!==row.sourceContentVersion||origin.sourceSHA256!==row.sourceSHA256)return null;
  const difference=resolvedText(row.contrast.difference,caseData,locale);
  if(!difference)return null;
  const related=row.curriculumId?Object.entries(LEARNING_REVIEW_DATA).filter(([id,other])=>id!==caseData.id&&other.curriculumId===row.curriculumId).map(([id,other])=>({id,title:text(other.title,locale)})):[];
  return {caseId:caseData.id,curriculumId:row.curriculumId,difference,decision:resolvedText(row.contrast.decision,caseData,locale),related};
}
