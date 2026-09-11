/** Validated date-only calendars. Fingerprints detect accidental corruption, not cheating. */
export const CALENDAR_SCHEMA='rudn-ru-five-day/1';
export function calendarDateOK(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number),t=new Date(Date.UTC(y,m-1,d));
 return y>=1900&&y<=9999&&t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d;
}
export function calendarYearLength(year){if(!Number.isInteger(year)||year<1900||year>9999)throw Error('Некорректный календарный год.');return (Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;}
export function calendarIndex(date){if(!calendarDateOK(date))throw Error('Некорректная календарная дата.');const y=Number(date.slice(0,4));return (Date.parse(date+'T00:00:00Z')-Date.UTC(y,0,1))/86400000;}
export function calendarISO(year,index){return new Date(Date.UTC(year,0,1)+index*86400000).toISOString().slice(0,10);}
export function calendarFingerprint(value){
 const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
 const s=canonical(value);let a=2166136261,b=2654435761;
 for(const c of s){a=Math.imul(a^c.charCodeAt(0),16777619)>>>0;b=Math.imul(b^c.charCodeAt(0),2246822519)>>>0;}
 return 'cal1-'+a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}
export function calendarYearPayload(y){return {year:y.year,country:y.country,workweek:y.workweek,days:y.days,holidays:y.holidays,transfers:y.transfers};}
export function sealCalendarYear(row){const result=JSON.parse(JSON.stringify(row));result.id=calendarFingerprint(calendarYearPayload(result));validateCalendarYear(result);return result;}
export function validateCalendarYear(y){
 if(!y||y.country!=='ru'||y.workweek!==5||typeof y.days!=='string'||y.days.length!==calendarYearLength(y.year)||!/^[012]+$/.test(y.days))throw Error('Неполный или неподдерживаемый производственный календарь.');
 const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
 if(!plain(y.holidays)||!plain(y.transfers))throw Error('Отсутствуют сведения о праздниках и переносах.');
 for(const [md,title] of Object.entries(y.holidays))if(!calendarDateOK(`${y.year}-${md}`)||typeof title!=='string'||!title.trim()||title.length>180||y.days[calendarIndex(`${y.year}-${md}`)]!=='1')throw Error('Некорректная праздничная дата.');
 for(const [md,from] of Object.entries(y.transfers))if(!calendarDateOK(`${y.year}-${md}`)||!calendarDateOK(`${y.year}-${from}`)||y.days[calendarIndex(`${y.year}-${md}`)]!=='1')throw Error('Некорректный перенос.');
 const off=[...y.days].filter(x=>x==='1').length;
 if(off<90||off>150||Object.keys(y.holidays).length<10||Object.keys(y.holidays).length>40)throw Error('Календарь не прошёл проверку полноты.');
 if(y.id!==calendarFingerprint(calendarYearPayload(y)))throw Error('Контрольная сумма календаря не совпадает.');
 if(!Array.isArray(y.sources)||!y.sources.length||y.sources.length>8||!y.sources.every(x=>{
  if(!x||typeof x.provider!=='string'||!x.provider.trim()||x.provider.length>80)return false;
  try{const u=new URL(x.url);return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=2048;}catch{return false;}
 }))throw Error('Не указан источник календарных данных.');
 // All complete published calendars are equally usable in this educational product.
 // Legacy assurance values remain valid so that v0.7 attempts keep their snapshots.
 if(!Number.isFinite(Date.parse(y.checkedAt)))throw Error('Не указана дата получения календаря.');
 return y;
}
export function makeCalendarSnapshot(years){
 const rows={};for(const [key,row] of Object.entries(years||{})){validateCalendarYear(row);if(String(row.year)!==String(key))throw Error('Год календаря не совпадает с ключом.');rows[key]=JSON.parse(JSON.stringify(row));}
 if(!Object.keys(rows).length)throw Error('Календарные данные отсутствуют.');
 return {schema:CALENDAR_SCHEMA,years:rows,id:calendarFingerprint(Object.keys(rows).sort().map(k=>rows[k].id))};
}
export function validateCalendarSnapshot(snapshot){
 if(!snapshot||snapshot.schema!==CALENDAR_SCHEMA||!snapshot.years)throw Error('Неизвестный формат снимка календаря.');
 if(snapshot.id!==makeCalendarSnapshot(snapshot.years).id)throw Error('Повреждён снимок календаря смены.');return snapshot;
}
export function calendarYearNow(now=new Date()){
 const d=now instanceof Date?now:new Date(now);if(!Number.isFinite(d.getTime()))throw Error('Не удалось определить текущее время.');
 return Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Moscow',year:'numeric'}).format(d));
}
export function calendarDayFromSnapshot(date,snapshot){
 if(!calendarDateOK(date))throw Error('Несуществующая календарная дата.');
 const year=Number(date.slice(0,4)),row=snapshot?.years?.[year];
 if(!row)throw Object.assign(Error(`Календарь ${year} года ещё не получен. Расчёт по предполагаемым выходным не выполняется.`),{code:'calendar/year-unavailable',year});
 const code=row.days[calendarIndex(date)],weekday=new Date(date+'T00:00:00Z').getUTCDay(),md=date.slice(5),working=code!=='1',shortened=code==='2';
 let type=working?'working':(weekday===0||weekday===6?'weekend':'transfer');
 let label=working?'Рабочий день':'Выходной день';
 if(row.holidays[md]){type='holiday';label=row.holidays[md];}
 else if(!working&&row.transfers[md]){type='transfer';label='Выходной перенесён с '+row.transfers[md].split('-').reverse().join('.')+'.'+year;}
 else if(!working&&type==='transfer')label='Нерабочий день по производственному календарю';
 else if(working&&(weekday===0||weekday===6)){type='working-transfer';label='Рабочий выходной по производственному календарю';}
 if(shortened)label+=(label==='Рабочий день'?' сокращён на один час':' · сокращён на один час');
 return {date,weekday,working,shortened,type,label};
}
