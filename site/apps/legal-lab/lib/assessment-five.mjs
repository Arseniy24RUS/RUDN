/** Five familiar tasks, one point each. Source identities stay Russian/canonical. */
import {gradeTask, hash32, randomIndex, round, SCAN_METADATA_MODE} from './core.mjs';

export const FIVE_MODE='five-task-v1';
const record=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const fields=value=>record(value)&&Object.entries(value).every(([key,item])=>id(key)&&id(item));
const selections=value=>Array.isArray(value)&&value.length<=500&&value.every(id);

export function isFiveAssessment(value){return value?.format===FIVE_MODE||value?.assessmentMode===FIVE_MODE;}

/** Decode only scoring fields; UI cursor/feedback flags never become evidence. */
export function parseFiveAssessmentAnswer(raw){
  if(!record(raw)||raw.assessmentMode!==FIVE_MODE||!record(raw.tasks)||Object.keys(raw.tasks).length>5)throw new TypeError('Invalid five-task answer');
  const tasks={};
  for(const [taskId,value] of Object.entries(raw.tasks)){
    if(!id(taskId)||!record(value))throw new TypeError('Invalid five-task response');
    const answer={};
    if(Object.hasOwn(value,'metadataMode')){
      if(value.metadataMode!==SCAN_METADATA_MODE)throw new TypeError('Invalid scan metadata mode');
      answer.metadataMode=SCAN_METADATA_MODE;
    }
    if(Object.hasOwn(value,'metadata')){if(!fields(value.metadata))throw new TypeError('Invalid scan fields');answer.metadata={...value.metadata};}
    for(const key of ['scanId','type','docId'])if(Object.hasOwn(value,key)){if(!id(value[key]))throw new TypeError('Invalid task identity');answer[key]=value[key];}
    if(Object.hasOwn(value,'selections')){if(!selections(value.selections))throw new TypeError('Invalid task selections');answer.selections=[...value.selections];}
    tasks[taskId]=answer;
  }
  return {assessmentMode:FIVE_MODE,tasks};
}

function checkedTasks(item){
  if(item?.format!==FIVE_MODE||!Array.isArray(item.tasks)||item.tasks.length!==5||new Set(item.tasks.map(t=>t.id)).size!==5)throw new TypeError('Invalid five-task assessment');
  const kinds=item.tasks.map(task=>task.kind);
  if(kinds.filter(kind=>kind==='scan').length!==1||kinds.filter(kind=>kind==='type').length!==1||kinds.filter(kind=>kind==='text').length!==3||item.tasks.some(task=>!id(task.id)))throw new TypeError('Invalid five-task assessment');
  return item.tasks;
}

export function scoreFiveAssessment(item, raw={}, scans=[], docs=[]){
  const tasks=checkedTasks(item),answer=parseFiveAssessmentAnswer(raw);
  if(Object.keys(answer.tasks).some(taskId=>!tasks.some(task=>task.id===taskId)))throw new TypeError('Unknown assessment task');
  const criteria=tasks.map(task=>{
    const choice=answer.tasks[task.id]||{};
    let detail;
    if(task.kind==='scan'){
      // This format always assesses every requisite; legacy single-click answers
      // must not accidentally receive a whole point.
      if(choice.metadataMode!==SCAN_METADATA_MODE||(choice.scanId&&choice.scanId!==task.scanId))detail={fraction:0,exact:false};
      else detail=gradeTask(task,choice,[],scans);
    }else if(task.kind==='type'){
      detail=choice.scanId&&choice.scanId!==task.scanId?{fraction:0,exact:false}:gradeTask(task,choice,[],scans);
    }else{
      const source=docs.find(doc=>doc.id===task.docId);
      // A different document (or an unloaded source) cannot supply valid aliases.
      detail=source?gradeTask(task,choice,[source],scans):{fraction:0,exact:false,missingDocument:true};
    }
    return {id:task.id,label:task.prompt||({scan:'Реквизиты на скане',type:'Вид документа',text:'Поиск нормы'})[task.kind],max:1,points:round(detail.fraction),detail};
  });
  return {points:Math.min(5,round(criteria.reduce((sum,criterion)=>sum+criterion.points,0))),maxPoints:5,criteria};
}

/** Completing the quiz means submitting every task, irrespective of correctness. */
export function quizComplete(bank,state){
  const tasks=Array.isArray(bank)?bank:bank?.classroom,answers=state?.answers||{};
  return Array.isArray(tasks)&&tasks.length>0&&new Set(tasks.map(task=>task.id)).size===tasks.length&&tasks.every(task=>answers[task.id]?.submitted===true);
}

/** Walk the whole bank before repeating, and never immediately repeat a variant. */
export function chooseFiveVariant(variants,previousIds=[],pick=randomIndex,initialSeed){
  if(!Array.isArray(variants)||!variants.length||variants.some(item=>item?.format!==FIVE_MODE||!id(item.id))||new Set(variants.map(item=>item.id)).size!==variants.length)throw new TypeError('Invalid assessment variants');
  if(!Array.isArray(previousIds)||previousIds.some(value=>!id(value)))throw new TypeError('Invalid variant history');
  const valid=new Set(variants.map(item=>item.id)),used=new Set();
  for(const previous of previousIds){
    if(!valid.has(previous))continue;
    if(used.size===variants.length)used.clear();
    used.add(previous);
  }
  let pool=variants.filter(item=>!used.has(item.id));
  if(!pool.length)pool=variants.filter(item=>item.id!==previousIds.at(-1));
  if(!pool.length)pool=variants;
  // A profile's first work is stable even before a draft reaches a second device.
  // Restarts still draw randomly from the unused pool.
  const initial=typeof initialSeed==='string'&&initialSeed.length>0&&!previousIds.some(previous=>valid.has(previous));
  const index=initial?parseInt(hash32(initialSeed),36)%pool.length:pick(pool.length);
  if(!Number.isInteger(index)||index<0||index>=pool.length)throw new RangeError('Invalid variant choice');
  return pool[index];
}
