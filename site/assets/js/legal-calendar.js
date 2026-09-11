/** Date-only arithmetic with an explicit, immutable calendar snapshot. */
import {BUNDLED_CALENDARS} from './calendar-bundled.js';
import {calendarDayFromSnapshot} from './calendar-model.js';
export const CALENDAR_VERSION='calendar-engine-3';
export const CALENDAR_SOURCES=Object.values(BUNDLED_CALENDARS.years).flatMap(y=>y.sources.map(x=>({...x,year:y.year,title:x.provider})));
const DAY_MS=86400000;
export function parseDateOnly(input) {
  if(typeof input!=='string')return null;
  let s=input.trim();
  if(/^\d{2}\.\d{2}\.\d{4}$/.test(s))s=s.split('.').reverse().join('-');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const [y,m,d]=s.split('-').map(Number);
  if(y<1900||y>9999||m<1||m>12||d<1||d>31)return null;
  const t=Date.UTC(y,m-1,d),date=new Date(t);
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?s:null;
}
export function formatDateOnly(input){const s=parseDateOnly(input);return s?s.split('-').reverse().join('.'):'';}
export function addDays(input,n){const s=parseDateOnly(input);if(!s||!Number.isInteger(n))throw Error('Некорректная дата или шаг.');const t=new Date(s+'T00:00:00.000Z').getTime();return new Date(t+n*DAY_MS).toISOString().slice(0,10);}
/** Add whole calendar months using the ORIGINAL day, never cascading February clipping. */
export function addCalendarMonths(input,months){
 const anchor=parseDateOnly(input);
 if(!anchor||!Number.isInteger(months)||Math.abs(months)>1200)throw Error('Некорректная дата или число месяцев.');
 const [year,month,day]=anchor.split('-').map(Number);
 const target=new Date(Date.UTC(year,month-1+months,1));
 const y=target.getUTCFullYear(),m=target.getUTCMonth()+1;
 if(y<1900||y>9999)throw Error('Дата вне допустимого диапазона.');
 const last=new Date(Date.UTC(y,m,0)).getUTCDate();
 return `${y}-${String(m).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
}
export function durationLabel(duration,unit){
 if(unit==='calendarMonths'){const last=duration%10,teen=duration%100>=11&&duration%100<=14;return `${duration} ${!teen&&last===1?'календарный месяц':!teen&&last>=2&&last<=4?'календарных месяца':'календарных месяцев'}`;}
 return `${duration} ${unit==='calendarDays'?'календарных':'рабочих'} дней`;
}
export function dayInfo(input,snapshot=BUNDLED_CALENDARS){
 const date=parseDateOnly(input);if(!date)throw Error('Несуществующая календарная дата.');
 return calendarDayFromSnapshot(date,snapshot);
}
export function calculateDeadline({anchorDate,duration,unit,startPolicy,lastDayPolicy},snapshot=BUNDLED_CALENDARS){
 const anchor=parseDateOnly(anchorDate);
 if(!anchor||!Number.isInteger(duration)||duration<1||duration>(unit==='calendarMonths'?24:366))throw Error('Нужны дата и целая продолжительность: 1–366 дней или 1–24 месяца.');
 if(!['calendarDays','workingDays','calendarMonths'].includes(unit)||!['exclude_anchor','include_anchor'].includes(startPolicy)||!['next_working_day','no_shift'].includes(lastDayPolicy))throw Error('Правило срока должно быть задано явно.');
 dayInfo(anchor,snapshot);
 if(unit==='calendarMonths'){
  // The supported month profile follows a corresponding-date rule with a next-day start.
  // Other inclusive-month conventions must be authored explicitly, not silently inferred.
  if(startPolicy!=='exclude_anchor')throw Error('Месячный профиль с включением исходного дня не определён.');
  const monthSteps=[];
  for(let index=1;index<=duration;index++){
   const date=addCalendarMonths(anchor,index);dayInfo(date,snapshot);
   monthSteps.push({index,date,clipped:date.slice(8)!==anchor.slice(8)});
  }
  const rawDate=monthSteps.at(-1).date,shifted=[];let finalDate=rawDate;
  while(lastDayPolicy==='next_working_day'&&!dayInfo(finalDate,snapshot).working){shifted.push(dayInfo(finalDate,snapshot));finalDate=addDays(finalDate,1);dayInfo(finalDate,snapshot);}
  return {anchorDate:anchor,rawDate,finalDate,monthSteps,counted:[],shifted,calendarVersion:CALENDAR_VERSION,calendarSnapshotId:snapshot.id};
 }
 let date=startPolicy==='exclude_anchor'?addDays(anchor,1):anchor,count=0;const counted=[];
 for(let guard=0;guard<800;guard++){
  const info=dayInfo(date,snapshot),included=unit==='calendarDays'||info.working;
  if(included)count++;
  counted.push({...info,included,index:included?count:null});
  if(count===duration)break;
  date=addDays(date,1);
 }
 if(count!==duration)throw Error('Превышен предел расчёта.');
 const rawDate=date,shifted=[];
 while(lastDayPolicy==='next_working_day'&&!dayInfo(date,snapshot).working){shifted.push(dayInfo(date,snapshot));date=addDays(date,1);dayInfo(date,snapshot);}
 return {anchorDate:anchor,rawDate,finalDate:date,counted,shifted,calendarVersion:CALENDAR_VERSION,calendarSnapshotId:snapshot.id};
}
export function monthDays(month,snapshot=BUNDLED_CALENDARS){
 if(!/^\d{4}-\d{2}$/.test(month)||!parseDateOnly(month+'-01'))throw Error('Некорректный месяц.');
 dayInfo(month+'-01',snapshot);const first=month+'-01',days=[];
 for(let d=first;d.startsWith(month);d=addDays(d,1))days.push(dayInfo(d,snapshot));
 return {month,offset:(days[0].weekday+6)%7,days};
}
export function moveMonth(month,amount,snapshot=BUNDLED_CALENDARS){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+amount,1));const result=d.toISOString().slice(0,7);dayInfo(result+'-01',snapshot);return result;}
