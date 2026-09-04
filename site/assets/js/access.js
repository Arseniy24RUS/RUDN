const WEEK_MS=7*24*60*60*1000;
const MOSCOW_OFFSET_MS=3*60*60*1000;

export const ACCESS_AUTO='auto';
export const ACCESS_OPEN='open';
export const ACCESS_CLOSED='closed';

export function academicWeekStart(startYear){
  const septemberFirst=Date.UTC(Number(startYear),8,1);
  const day=new Date(septemberFirst).getUTCDay();
  const daysSinceMonday=(day+6)%7;
  return septemberFirst-daysSinceMonday*24*60*60*1000-MOSCOW_OFFSET_MS;
}

export function academicContext(nowMs=Date.now()){
  const now=Number(nowMs)||Date.now();
  const moscowDate=new Date(now+MOSCOW_OFFSET_MS);
  const calendarYear=moscowDate.getUTCFullYear();
  const candidate=academicWeekStart(calendarYear);
  const startYear=now>=candidate?calendarYear:calendarYear-1;
  const startsAt=academicWeekStart(startYear);
  const week=Math.max(1,Math.floor((now-startsAt)/WEEK_MS)+1);
  return {startYear,endYear:startYear+1,startsAt,week,now};
}

function manualState(overrides,key){
  const value=overrides?.[key];
  const state=typeof value==='string'?value:value?.state;
  return state===ACCESS_OPEN||state===ACCESS_CLOSED?state:ACCESS_AUTO;
}

function resolveGate(key,week,overrides,nowMs){
  const context=academicContext(nowMs);
  const opensAt=context.startsAt+(week-1)*WEEK_MS;
  const automaticOpen=context.now>=opensAt;
  const override=manualState(overrides,key);
  const open=override===ACCESS_OPEN?true:override===ACCESS_CLOSED?false:automaticOpen;
  return {key,week,opensAt,automaticOpen,override,open,startYear:context.startYear,endYear:context.endYear};
}

export function topicGate(topicNumber,overrides={},nowMs=Date.now()){
  const number=Math.max(1,Math.min(8,Number(topicNumber)||1));
  return resolveGate(`topic-${number}`,number*2-1,overrides,nowMs);
}

export function lectureTestGate(lectureNumber,overrides={},nowMs=Date.now()){
  const number=Math.max(1,Math.min(7,Number(lectureNumber)||1));
  return resolveGate(`lecture-${number}-test`,number*2+1,overrides,nowMs);
}

export function activityGate(activitySlug,overrides={},nowMs=Date.now()){
  const match=String(activitySlug||'').match(/^(?:lecture|seminar)-(\d+)$/);
  return match?topicGate(Number(match[1]),overrides,nowMs):null;
}

export function accessDefinitions(topics,overrides={},nowMs=Date.now()){
  const rows=[];
  for(const topic of topics||[]){
    rows.push({kind:'topic',number:topic.number,title:topic.title,gate:topicGate(topic.number,overrides,nowMs)});
    if(Number(topic.number)<=7)rows.push({kind:'test',number:topic.number,title:topic.lecture?.title||'',gate:lectureTestGate(topic.number,overrides,nowMs)});
  }
  return rows;
}

export function formatAccessDate(timestamp,locale='ru'){
  const language=locale==='zh'?'zh-CN':locale==='en'?'en-GB':'ru-RU';
  return new Intl.DateTimeFormat(language,{timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric'}).format(new Date(timestamp));
}
