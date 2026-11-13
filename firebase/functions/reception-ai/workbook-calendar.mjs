import {parseDateOnly} from './authored.mjs';
import {WORKBOOK_CALENDAR} from './workbook-calendar-data.mjs';

export {WORKBOOK_CALENDAR};
export const CALENDAR_RULES=Object.freeze(Object.fromEntries([
 ['calendar3',3,'calendar-days'],['calendar7',7,'calendar-days'],['calendar10',10,'calendar-days'],['calendar30',30,'calendar-days'],
 ['working1',1,'working-days'],['working3',3,'working-days'],['working5',5,'working-days'],['working7',7,'working-days'],['working10',10,'working-days'],['working15',15,'working-days'],
 ['months3',3,'months'],
].map(([id,amount,unit])=>[id,Object.freeze({amount,unit})])));
const iso=date=>date.toISOString().slice(0,10);
function dayAfter(date){const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);return iso(next);}
export function workingCalendarDay(value,snapshot=WORKBOOK_CALENDAR){
 const date=parseDateOnly(value);if(!date)throw new TypeError('Invalid calendar date');
 const year=date.slice(0,4),days=snapshot.years[year]?.days;
 const index=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(year+'-01-01T00:00:00Z'))/86400000);
 if(!days||!/^[012]$/.test(days[index]||''))throw new RangeError('Date outside frozen calendar');
 return days[index]!=='1';
}
/** The authored profile is explicit; no implicit weekend or anchor convention. */
export function calculateWorkbookDeadline({anchorDate,ruleId,start='exclude_anchor',shift='next_working_day'},snapshot=WORKBOOK_CALENDAR){
 const anchor=parseDateOnly(anchorDate),rule=CALENDAR_RULES[ruleId];
 if(!anchor||!rule||!['exclude_anchor','include_anchor'].includes(start)||!['no_shift','next_working_day'].includes(shift))throw new TypeError('Invalid calendar rule');
 workingCalendarDay(anchor,snapshot);
 let date=anchor;
 if(rule.unit==='months'){
  if(start!=='exclude_anchor')throw new TypeError('Inclusive month rule is not authored');
  const [year,month,day]=anchor.split('-').map(Number),target=new Date(Date.UTC(year,month-1+rule.amount,1));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(day,last));date=iso(target);workingCalendarDay(date,snapshot);
 }else{
  date=start==='exclude_anchor'?dayAfter(anchor):anchor;
  for(let count=0,guard=0;guard<800;guard++,date=dayAfter(date)){
   const working=workingCalendarDay(date,snapshot);
   if(rule.unit==='calendar-days'||working)count++;
   if(count===rule.amount)break;
   if(guard===799)throw new RangeError('Calendar calculation limit');
  }
 }
 while(shift==='next_working_day'&&!workingCalendarDay(date,snapshot))date=dayAfter(date);
 return date;
}
