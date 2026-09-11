import {parseDateOnly,addDays,dayInfo,calculateDeadline} from '../../../assets/js/legal-calendar.js';
import {calendarYearLength} from '../../../assets/js/calendar-model.js';
export const CASE_DATE_POLICY='current-year-relative-v1';
/** Only authored scenario variables change years. Statute dates and provenance are untouched. */
export function rebaseDatePack(pack,year){
 calendarYearLength(year);const receipt=parseDateOnly(pack.receivedISO);if(!receipt)throw Error('В наборе нет даты поступления.');
 const baseYear=Number(receipt.slice(0,4)),delta=year-baseYear,result={...pack,caseYear:year};
 for(const [key,value] of Object.entries(pack)){
  if(!key.endsWith('ISO'))continue;const d=parseDateOnly(value);if(!d)throw Error('Повреждена дата сюжета: '+key);
  const [y,m,day]=d.split('-').map(Number),targetYear=y+delta,last=new Date(Date.UTC(targetYear,m,0)).getUTCDate();
  result[key]=`${targetYear}-${String(m).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
 }
 if(result.sentISO>result.receivedISO||result.registeredISO<result.receivedISO)throw Error('Нарушена последовательность поступления и регистрации.');
 return result;
}
/** Registration on a workday is an editorial constraint, not a new legal deadline rule.
 * Keep authored spacing; when necessary shift contemporary events together at most 14 days.
 * Preserve old observation age and month-end anchors (tax example) without replacing statute dates.
 */
export function realizeDatePack(template,pack,year,snapshot){
 const base=rebaseDatePack(pack,year),receipt=base.receivedISO;
 const offsets=[0,...Array.from({length:14},(_,i)=>i+1).flatMap(n=>[-n,n])];
 const hasRegistryEvent=template.calendar.events.some(e=>e.id==='registered');
 for(const offset of offsets){
  const candidate={...base};
  for(const key of Object.keys(candidate))if(key.endsWith('ISO')){
   // A declaration on the last day is central to a month-based exercise.
   if(key==='declarationISO')continue;
   if(key==='observedISO'&&Math.abs(Date.parse(pack.observedISO)-Date.parse(pack.receivedISO))>60*86400000)continue;
   candidate[key]=addDays(base[key],offset);
  }
  if(Number(candidate.receivedISO.slice(0,4))!==year)continue;
  if(hasRegistryEvent&&!dayInfo(candidate.registeredISO,snapshot).working)continue;
  if(candidate.sentISO>candidate.receivedISO||candidate.registeredISO<candidate.receivedISO)continue;
  return {...candidate,dateOffset:offset,datePolicy:CASE_DATE_POLICY};
 }
 throw Error(`Не удалось согласовать даты поступления для ${template.id} в ${year} году.`);
}
export function caseDeadlineWithSnapshot(c,snapshot){const k=c.calendar;return calculateDeadline({anchorDate:k.events.find(e=>e.id===k.anchor)?.date,duration:k.duration,unit:k.unit,startPolicy:k.startPolicy,lastDayPolicy:k.lastDayPolicy},snapshot);}
