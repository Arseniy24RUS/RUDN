import {storageKey} from './storage.mjs';
/** Teaching work is separate from preferences: no import from the scoring engine. */
export const NOTEBOOK_KEY=storageKey('workbook-v2');
export const NOTEBOOK_SCHEMA='rudn-career-workbook';
export const NOTEBOOK_FILE_LIMIT=1_500_000;
export const TEXT_LIMIT=1200;
export const textFields=['why','question','next'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(o,list)=>plain(o)&&Object.keys(o).length===list.length&&list.every(k=>Object.hasOwn(o,k));
export function blankWorkbook(){return {schema:NOTEBOOK_SCHEMA,schemaVersion:1,selected:null,notes:{},responses:{},duration:90};}
export function blankNote(){return {why:'',question:'',next:'',known:'unknown'};}
export function validateWorkbook(value,authorities,cases){
 if(!keys(value,['schema','schemaVersion','selected','notes','responses','duration'])||value.schema!==NOTEBOOK_SCHEMA||value.schemaVersion!==1)return false;
 const ids=new Set(authorities.map(a=>a.id)),byCase=new Map(cases.map(c=>[c.id,c]));
 if(value.selected!==null&&(!ids.has(value.selected)||!Object.hasOwn(value.notes||{},value.selected)))return false;
 if(![45,90].includes(value.duration)||!plain(value.notes)||!plain(value.responses)||Object.keys(value.notes).length>ids.size||Object.keys(value.responses).length>byCase.size)return false;
 for(const[id,n]of Object.entries(value.notes))if(!ids.has(id)||!keys(n,[...textFields,'known'])||!['yes','no','unknown'].includes(n.known)||textFields.some(k=>typeof n[k]!=='string'||n[k].length>TEXT_LIMIT||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(n[k])))return false;
 for(const[id,response]of Object.entries(value.responses))if(!byCase.has(id)||!byCase.get(id).choices.some(c=>c.id===response))return false;
 return true;
}
export function importWorkbook(text,authorities,cases){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>NOTEBOOK_FILE_LIMIT)throw Error('file-size');
 const value=JSON.parse(text);if(!validateWorkbook(value,authorities,cases))throw Error('schema');return value;
}
export function noteProgress(note=blankNote()) {return textFields.filter(k=>note[k]?.trim()).length;}
export function lessonPlan(duration=90){
 const minutes=duration===45?[3,12,8,10,9,3]:[5,18,15,20,25,7];
 const steps=[['intro','Вводная: интересы не равны способностям','Introduction: interests are not abilities'],['test','Тест и первые рекомендации','The test and initial recommendations'],['explore','Разбор рекомендации и сравнение вариантов','Explain the recommendation and compare variants'],['case','Профессиональная проба и разбор решения','Try a professional task and discuss the response'],['discussion','Обсуждение в парах и лист карьерного выбора','Pair discussion and career-choice worksheet'],['finish','Следующий шаг и завершение','Next step and closing']];
 let offset=0;return steps.map(([id,ru,en],i)=>{const row={id,title:{ru,en},minutes:minutes[i],start:offset,end:offset+minutes[i]};offset+=minutes[i];return row;});
}
