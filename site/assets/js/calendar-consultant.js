/** Optional pre-publication fallback. Parses explicit published calendar facts, not legal approval.
 * Input text is never inserted into the DOM. If the commentary format changes, reject it and keep cache.
 */
import {calendarYearLength,calendarIndex,calendarISO,calendarDateOK} from './calendar-model.js';
import {FEDERAL_HOLIDAY_NAMES} from './calendar-providers.js';
const RU_MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function consultantText(html){
 if(typeof html!=='string'||html.length>1500000)throw Error('Неподдерживаемый размер календарной страницы.');
 return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<!--[^]*?-->/g,' ').replace(/<[^>]+>/g,' ')
 .replace(/&(?:nbsp|#160|#xA0);/gi,' ').replace(/&(?:ndash|mdash);/gi,'–').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
 .replace(/&#(\d{1,5});/g,(_,n)=>String.fromCharCode(Number(n))).replace(/\s+/g,' ').trim();
}
export function parseConsultantCalendar(html,year){
 calendarYearLength(year);const text=consultantText(html);
 if(!new RegExp(`Производственный календарь\\s+на\\s+${year}\\s+год`,'i').test(text)||!/пятидневн[а-яё]*\s+рабоч[а-яё]*\s+недел/i.test(text))throw Error('Не распознаны год и пятидневная неделя календаря.');
 const monthPattern=RU_MONTHS.join('|');
 const md=(d,m)=>{const result=String(RU_MONTHS.indexOf(m.toLowerCase())+1).padStart(2,'0')+'-'+String(Number(d)).padStart(2,'0');if(!calendarDateOK(`${year}-${result}`))throw Error('Неверная дата в комментарии календаря.');return result;};
 const days=Array.from({length:calendarYearLength(year)},(_,i)=>[0,6].includes(new Date(calendarISO(year,i)+'T00:00:00Z').getUTCDay())?'1':'0');
 const holidays={...FEDERAL_HOLIDAY_NAMES},transfers={};
 for(const h of Object.keys(holidays))days[calendarIndex(`${year}-${h}`)]='1';
 // Standard observed holidays outside January, as described by the calendar commentary.
 for(const h of Object.keys(holidays).sort()){
  const i=calendarIndex(`${year}-${h}`),w=new Date(calendarISO(year,i)+'T00:00:00Z').getUTCDay();
  if(h.startsWith('01-')||![0,6].includes(w))continue;
  let j=i+1;while(days[j]==='1')j++;if(j>=days.length)throw Error('Неподдерживаемый переход календаря.');
  days[j]='1';transfers[calendarISO(year,j).slice(5)]=h;
 }
 const weekday='(?:понедельника|вторника|среды|четверга|пятницы|субботы|воскресенья)',targetWeekday='(?:понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)';
 const re=new RegExp(`с\\s+${weekday}\\s+(\\d{1,2})\\s+(${monthPattern})\\s+на\\s+${targetWeekday}\\s+(\\d{1,2})\\s+(${monthPattern})`,'gi');
 const pairs=new Map();for(const m of text.matchAll(re)){const from=md(m[1],m[2]),to=md(m[3],m[4]);if(pairs.has(from)&&pairs.get(from)!==to)throw Error('Противоречащие переносы на странице.');pairs.set(from,to);}
 if(pairs.size<1||pairs.size>16)throw Error('Не найден полный перечень переносов.');
 for(const [from,to] of pairs){
  if(from===to||holidays[to])throw Error('Некорректная пара переноса.');
  if(!holidays[from])days[calendarIndex(`${year}-${from}`)]='0';
  days[calendarIndex(`${year}-${to}`)]='1';transfers[to]=from;
 }
 const shortMatch=text.match(new RegExp(`В\\s+${year}\\s+году\\s+работники\\s+будут\\s+работать\\s+на\\s+один\\s+час\\s+меньше\\s+([^.!?]+)[.!?]`,'i'));
 if(!shortMatch)throw Error('Не найден явный перечень сокращённых дней.');
 const shorts=[...shortMatch[1].matchAll(new RegExp(`(\\d{1,2})\\s+(${monthPattern})`,'gi'))].map(m=>md(m[1],m[2]));
 if(!shorts.length||new Set(shorts).size!==shorts.length)throw Error('Неверный перечень сокращённых дней.');
 for(const h of shorts){const i=calendarIndex(`${year}-${h}`);if(days[i]==='1')throw Error('Сокращённый день оказался нерабочим.');days[i]='2';}
 const annual=text.match(new RegExp(`Кол-во дней за\\s*${year}\\s*год\\s*календарных\\s*[—–-]?\\s*(\\d{3})\\s*рабочие дни\\s*[—–-]?\\s*(\\d{3})\\s*выходных/праздничных\\s*[—–-]?\\s*(\\d{3})`,'i'));
 if(!annual||Number(annual[1])!==days.length||Number(annual[2])!==days.filter(d=>d!=='1').length||Number(annual[3])!==days.filter(d=>d==='1').length)throw Error('Дневные статусы не совпали с опубликованными годовыми итогами.');
 return {year,country:'ru',workweek:5,days:days.join(''),holidays,transfers,sourceDate:null};
}
