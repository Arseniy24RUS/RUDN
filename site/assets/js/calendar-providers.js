import {calendarDateOK,calendarYearLength,calendarIndex,calendarISO,sealCalendarYear} from './calendar-model.js';
export function calendarProviderURLs(year){calendarYearLength(year);return {
 xmlcalendar:`https://raw.githubusercontent.com/xmlcalendar/data/master/ru/${year}/calendar.xml`,
 isdayoff:`https://raw.githubusercontent.com/isdayoff/calendars/main/db/${year}/ru${year}.json`
};}
function calendarWeekdays(year){return Array.from({length:calendarYearLength(year)},(_,i)=>[0,6].includes(new Date(calendarISO(year,i)+'T00:00:00Z').getUTCDay())?'1':'0');}
function calendarMD(value,year){const md=String(value).replace('.','-');if(!/^\d{2}-\d{2}$/.test(md)||!calendarDateOK(`${year}-${md}`))throw Error('Неверная дата источника.');return md;}
/** Strict parser for the documented xmlcalendar vocabulary. No DTD, entities, code or DOM injection. */
export function parseXmlCalendar(text,year){
 if(typeof text!=='string'||text.length>150000||/<!DOCTYPE|<!ENTITY|&(?!amp;|quot;|apos;|lt;|gt;)/i.test(text))throw Error('Неподдерживаемый XML календаря.');
 const clean=text.replace(/<\?xml[^>]*\?>/,'').replace(/<!--[\s\S]*?-->/g,'').trim();
 const attrs=s=>{const a={};let stripped=s.replace(/([a-z]+)\s*=\s*"([^"<>]*)"/g,(_,k,v)=>{if(Object.hasOwn(a,k))throw Error('Повтор атрибута XML.');a[k]=v.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');return '';});if(stripped.trim())throw Error('Неподдерживаемый атрибут XML.');return a;};
 const doc=clean.match(/^<calendar\s+([^>]+)>\s*<holidays>([\s\S]*?)<\/holidays>\s*<days>([\s\S]*?)<\/days>\s*<\/calendar>$/);
 if(!doc)throw Error('Не распознан полный XML-календарь.');const head=attrs(doc[1]);
 if(head.year!==String(year)||(head.country&&head.country!=='ru')||head.lang!=='ru')throw Error('Другой год, страна или язык календаря.');
 const titles={},holidays={},transfers={},days=calendarWeekdays(year),seen=new Set();
 const read=(body,tag,fn)=>{const re=new RegExp('<'+tag+'\\s+([^>]*?)\\s*\\/>','g');const rest=body.replace(re,(_,s)=>{fn(attrs(s));return '';});if(rest.trim())throw Error('Неизвестные элементы XML.');};
 read(doc[2],'holiday',a=>{if(!a.id||!a.title||titles[a.id])throw Error('Некорректный перечень праздников.');titles[a.id]=a.title;});
 read(doc[3],'day',a=>{const md=calendarMD(a.d,year),iso=`${year}-${md}`;
  if(seen.has(md)||!['1','2','3'].includes(a.t))throw Error('Повтор или неверный тип дня.');seen.add(md);
  days[calendarIndex(iso)]=a.t==='3'?'0':a.t;
  if(a.h){if(!titles[a.h]||a.t!=='1')throw Error('Неизвестный праздник.');holidays[md]=titles[a.h];}
  if(a.f){if(a.t!=='1')throw Error('Перенос должен быть нерабочим днём.');transfers[md]=calendarMD(a.f,year);}
 });
 return {year,country:'ru',workweek:5,days:days.join(''),holidays,transfers,sourceDate:head.date||null};
}
export function parseIsDayOffCalendar(text,year){
 const raw=typeof text==='string'?JSON.parse(text):text;if(raw?.year!==year||raw.countrycode!=='ru')throw Error('Не совпадают страна или год isDayOff.');
 for(const key of ['dayoff','predayoff','workday','holiday'])if(!Array.isArray(raw[key]))throw Error('Неполный календарь isDayOff.');
 if(raw.covidday?.length)throw Error('Специальные нерабочие периоды требуют отдельного профиля.');
 const days=calendarWeekdays(year),sets={};
 for(const key of ['dayoff','predayoff','workday','holiday']){sets[key]=new Set();for(const v of raw[key]){
  if(typeof v!=='string'||!/^\d{4}$/.test(v))throw Error('Некорректная дата isDayOff.');const md=calendarMD(v.slice(0,2)+'-'+v.slice(2),year);
  if(sets[key].has(md))throw Error('Повтор даты isDayOff.');sets[key].add(md);
 }}
 for(const md of sets.holiday)if(sets.workday.has(md)||sets.predayoff.has(md))throw Error('Противоречие праздничного и рабочего дня.');
 for(const md of sets.dayoff){if(sets.workday.has(md)||sets.predayoff.has(md))throw Error('Противоречие рабочих дней.');days[calendarIndex(`${year}-${md}`)]='1';}
 for(const md of sets.holiday)days[calendarIndex(`${year}-${md}`)]='1';
 for(const md of sets.workday)days[calendarIndex(`${year}-${md}`)]='0';
 for(const md of sets.predayoff)days[calendarIndex(`${year}-${md}`)]='2';
 return {days:days.join(''),holidayDates:[...sets.holiday].sort()};
}
export function crossCheckCalendars(xmlText,jsonText,year,checkedAt=new Date().toISOString()){
 const a=parseXmlCalendar(xmlText,year),b=parseIsDayOffCalendar(jsonText,year);
 if(a.days!==b.days||Object.keys(a.holidays).sort().join('|')!==b.holidayDates.join('|'))throw Object.assign(Error(`Источники расходятся по календарю ${year} года. Новые задания для него не назначаются.`),{code:'calendar/conflict',year});
 const urls=calendarProviderURLs(year);
 return sealCalendarYear({...a,checkedAt,assurance:'cross-checked',sources:[
  {provider:'xmlcalendar',url:urls.xmlcalendar,sourceDate:a.sourceDate},
  {provider:'isdayoff',url:urls.isdayoff}
 ]});
}

/** Same provider mirrors are transport fallbacks, not independent sources. */
export function calendarTransportURLs(year){
 const mirrors=calendarProviderURLs(year);
 return {
  isdayoff:[`https://isdayoff.ru/api/getdata?year=${year}&cc=ru&pre=1&holiday=1`,mirrors.isdayoff],
  xmlcalendar:[`https://xmlcalendar.ru/data/ru/${year}/calendar.xml`,mirrors.xmlcalendar],
  consultant:[`https://www.consultant.ru/law/ref/calendar/proizvodstvennye/${year}/`]
 };
}
export const FEDERAL_HOLIDAY_NAMES=Object.freeze({
 '01-01':'Новогодние каникулы','01-02':'Новогодние каникулы','01-03':'Новогодние каникулы',
 '01-04':'Новогодние каникулы','01-05':'Новогодние каникулы','01-06':'Новогодние каникулы',
 '01-07':'Рождество Христово','01-08':'Новогодние каникулы','02-23':'День защитника Отечества',
 '03-08':'Международный женский день','05-01':'Праздник Весны и Труда','05-09':'День Победы',
 '06-12':'День России','11-04':'День народного единства'
});
/** Full-year isDayOff response, with pre=1 and holiday=1. Never assume omitted days. */
export function parseIsDayOffAPI(text,year){
 if(typeof text!=='string')throw Error('Ответ isDayOff должен быть строкой.');
 const stream=text.trim();
 if(stream.length!==calendarYearLength(year)||!/^[0128]+$/.test(stream))throw Error('Неполный или неизвестный ответ API isDayOff.');
 const holidays={};for(let i=0;i<stream.length;i++)if(stream[i]==='8'){
  const md=calendarISO(year,i).slice(5);holidays[md]=FEDERAL_HOLIDAY_NAMES[md]||'Нерабочий праздничный день';
 }
 // Missing holiday flags indicate an unexpected request/response contract, not a workday calendar.
 if(Object.keys(holidays).length<10)throw Error('API не вернул признаки праздничных дней.');
 return {year,country:'ru',workweek:5,days:stream.replace(/8/g,'1'),holidays,transfers:{},sourceDate:null};
}
export function publishedCalendar(parsed,provider,url,checkedAt=new Date().toISOString(),extra={}){
 return sealCalendarYear({...parsed,checkedAt,assurance:'published',sources:[{provider,url,...(parsed.sourceDate?{sourceDate:parsed.sourceDate}:{})}],...extra});
}
export function isDayOffFileCalendar(text,year){
 const p=parseIsDayOffCalendar(text,year),holidays={};
 for(const md of p.holidayDates)holidays[md]=FEDERAL_HOLIDAY_NAMES[md]||'Нерабочий праздничный день';
 return {year,country:'ru',workweek:5,days:p.days,holidays,transfers:{},sourceDate:null};
}
/** Select whole calendars only; never form a hybrid by taking individual days from different providers. */
export function selectPublishedCalendar(candidates,year){
 const valid=candidates.filter(Boolean);
 if(!valid.length)throw Object.assign(Error(`Календарь ${year} года пока не опубликован в доступных источниках.`),{code:'calendar/year-unavailable',year});
 const priority={isdayoff:0,xmlcalendar:1,consultant:2};
 const ordered=valid.slice().sort((a,b)=>(priority[a.sources[0].provider]??9)-(priority[b.sources[0].provider]??9));
 const first=ordered[0],agree=ordered.filter(v=>v.days===first.days&&Object.keys(v.holidays).sort().join('|')===Object.keys(first.holidays).sort().join('|'));
 const chosen=JSON.parse(JSON.stringify(first));
 // XML often supplies richer transfer labels. Use them only with the same full daily stream.
 const labels=agree.find(v=>Object.keys(v.transfers).length>Object.keys(chosen.transfers).length);
 if(labels)chosen.transfers=labels.transfers;
 chosen.sources=[...new Map(agree.flatMap(v=>v.sources).map(v=>[v.provider,v])).values()];
 chosen.assurance='published';
 chosen.providerDiagnostics=ordered.filter(v=>!agree.includes(v)).map(v=>({provider:v.sources[0].provider,kind:'different-published-version',calendarId:v.id}));
 return sealCalendarYear(chosen);
}
