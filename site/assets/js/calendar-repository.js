import {BUNDLED_CALENDARS} from './calendar-bundled.js';
import {calendarYearNow,validateCalendarYear,makeCalendarSnapshot,calendarYearLength} from './calendar-model.js';
import {calendarProviderURLs,crossCheckCalendars,calendarTransportURLs,parseIsDayOffAPI,isDayOffFileCalendar,parseXmlCalendar,publishedCalendar,selectPublishedCalendar} from './calendar-providers.js';
import {parseConsultantCalendar} from './calendar-consultant.js';
const CALENDAR_CACHE_KEY='rudn.calendar.feed.v1';
const CALENDAR_MAX_AGE=7*86400000;
export const CALENDAR_FEED_URL=new URL('../data/calendars/current.json',import.meta.url).href;
export async function calendarReadText(url,{fetcher=globalThis.fetch,timeoutMs=4500,maxBytes=300000}={}){
 if(typeof fetcher!=='function')throw Error('Загрузка календаря недоступна.');
 const ctrl=new AbortController();let timer;
 try{
  const task=(async()=>{const r=await fetcher(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:ctrl.signal});if(!r.ok)throw Error(`Календарь: HTTP ${r.status}`);const text=await r.text();if(text.length>maxBytes)throw Error('Слишком большой ответ календаря.');return text;})();
  return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{ctrl.abort();reject(Error('Время ожидания календаря истекло.'));},timeoutMs);})]);
 }finally{clearTimeout(timer);}
}
export async function fetchCalendarPair(year,options={}){
 const urls=calendarProviderURLs(year),[xml,json]=await Promise.all([calendarReadText(urls.xmlcalendar,options),calendarReadText(urls.isdayoff,options)]);
 return crossCheckCalendars(xml,json,year,options.checkedAt||new Date().toISOString());
}
export function readCalendarFeed(value){
 const feed=typeof value==='string'?JSON.parse(value):value;
 if(feed?.testFixtureRun)throw Error('Тестовый календарный пакет нельзя применять в опубликованной игре.');
 if(!feed||feed.format!=='rudn-calendar-feed-1'||!Number.isFinite(Date.parse(feed.generatedAt))||!feed.years||!Array.isArray(feed.rejectedYears))throw Error('Некорректный пакет календарей.');
 const years={};for(const [key,y] of Object.entries(feed.years)){validateCalendarYear(y);if(String(y.year)!==key)throw Error('Несовпадение года календаря.');years[key]=y;}
 const rejectedYears=feed.rejectedYears.map(Number);if(rejectedYears.some(y=>!Number.isInteger(y)))throw Error('Некорректный карантин календаря.');
 return {...feed,years,rejectedYears};
}
/** A failed transport is not a failed calendar. A complete year from one publisher is enough. */
export async function fetchPublishedCalendar(year,options={}){
 const endpoints=calendarTransportURLs(year),checkedAt=options.checkedAt||new Date().toISOString();
 const readProvider=async(provider,parser)=>{
  for(let i=0;i<endpoints[provider].length;i++){
   try{const url=endpoints[provider][i],text=await calendarReadText(url,options);
    return publishedCalendar(parser(text,year,i),provider,url,checkedAt);
   }catch{/* Try another transport of this same provider. No public data is invented. */}
  }return null;
 };
 const candidates=await Promise.all([
  readProvider('isdayoff',(text,y,i)=>i===0?parseIsDayOffAPI(text,y):isDayOffFileCalendar(text,y)),
  readProvider('xmlcalendar',parseXmlCalendar)
 ]);
 if(!candidates.some(Boolean)&&options.allowConsultant){
  try{const url=endpoints.consultant[0],text=await calendarReadText(url,{...options,maxBytes:1500000});
   candidates.push(publishedCalendar(parseConsultantCalendar(text,year),'consultant',url,checkedAt));
  }catch{/* Server-side fallback only: a changed page keeps the last saved calendar. */}
 }
 return selectPublishedCalendar(candidates,year);
}
/** One preparation per new shift; scoring never queries the network. */
export async function prepareCalendars({now=new Date(),fetcher=globalThis.fetch,storage,feedURL=CALENDAR_FEED_URL,timeoutMs=4500,offline=false}={}){
 if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
 const year=calendarYearNow(now),nowMs=new Date(now).getTime();calendarYearLength(year);
 const target=[year-1,year,year+1],years={},notes=[],origins={};
 for(const y of target)if(BUNDLED_CALENDARS.years[y]){years[y]=BUNDLED_CALENDARS.years[y];origins[y]='bundled';}
 let cached=null;try{const v=storage?.getItem(CALENDAR_CACHE_KEY);if(v)cached=readCalendarFeed(v);}catch{notes.push('Повреждённый кэш календаря пропущен.');}
 const merge=(feed,origin)=>{
  if(Date.parse(feed.generatedAt)>nowMs+86400000)return;
  for(const y of target){const incoming=feed.years[y],checked=Date.parse(incoming?.checkedAt||'');
   if(incoming&&checked<=nowMs+86400000&&(!years[y]||checked>=Date.parse(years[y].checkedAt))){years[y]=incoming;origins[y]=origin;}
  }
  // Legacy rejectedYears flags do not erase a complete published calendar in the educational policy.
 };
 if(cached)merge(cached,'cache');
 if(!offline&&feedURL){try{merge(readCalendarFeed(await calendarReadText(feedURL,{fetcher,timeoutMs})),'platform');}catch{notes.push('Обновление пакета с платформы недоступно.');}}
 await Promise.all(target.map(async y=>{
  if(offline)return;
  const age=years[y]?nowMs-Date.parse(years[y].checkedAt):Infinity;
  if(years[y]&&age>=0&&age<CALENDAR_MAX_AGE)return;
  try{years[y]=await fetchPublishedCalendar(y,{fetcher,timeoutMs,checkedAt:new Date(nowMs).toISOString()});origins[y]='providers';}
  catch{if(!years[y])notes.push(`Данные ${y} года пока недоступны.`);}
 }));
 const feed={format:'rudn-calendar-feed-1',policy:'published-educational-v1',generatedAt:new Date(nowMs).toISOString(),years,rejectedYears:[],unavailableYears:target.filter(y=>!years[y])};
 try{storage?.setItem(CALENDAR_CACHE_KEY,JSON.stringify(feed));}catch{notes.push('Обновление календаря не удалось сохранить в общий кэш. Снимок будет сохранён со сменой.');}
 if(!years[year])throw Object.assign(Error(`Календарь ${year} года пока не удалось загрузить. Подключитесь к интернету и повторите загрузку. Сохранённые работы доступны без изменения дат.`),{code:'calendar/current-unavailable',year});
 const snapshot=makeCalendarSnapshot(years),stale=nowMs-Date.parse(years[year].checkedAt)>CALENDAR_MAX_AGE;
 return {year,snapshot,origins,stale,notes,unavailableYears:target.filter(y=>!years[y]),loadedAt:new Date(nowMs).toISOString()};
}
