import {CONTENT_VERSION,RUBRIC_VERSION,CASES} from './cases.js';
import {restoreShift,summary} from './engine.js';

export const PILOT_VERSION='reception-pilot-2';
const median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b),n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null;};
const toMinute=value=>Math.round(value/6000)/10;
/** Observed wall intervals include reading, external search and breaks. Not active-time tracking.
 * Missing/negative/>4h intervals stay missing/outliers, never become zero minutes.
 */
export function observedIntervals(shift){
 const events=Array.isArray(shift?.events)?shift.events:[],firstStart=events.find(e=>['opened','question','decision-confirmed','case-skipped'].includes(e.type));
 const start=Date.parse(firstStart?.at),end=Date.parse(shift?.endedAt),wall=end-start;
 const valid=Number.isFinite(wall)&&wall>=0&&wall<=4*3600000;
 const cases=Object.fromEntries((shift?.caseIds||[]).map(id=>{
  const own=events.filter(e=>e.caseId===id);const from=Date.parse(own.find(e=>['opened','next-case','question','decision-confirmed','case-skipped'].includes(e.type))?.at);
  const to=Date.parse(own.find(e=>e.type==='followup-confirmed')?.at),span=to-from;
  return [id,{minutes:Number.isFinite(span)&&span>=0&&span<=4*3600000?toMinute(span):null,status:!Number.isFinite(span)?'missing':span<0?'invalid-order':span>4*3600000?'long-interval':'observed-wall'}];
 }));
 return {minutes:valid?toMinute(wall):null,status:!Number.isFinite(wall)?'missing':wall<0?'invalid-order':wall>4*3600000?'long-interval':'observed-wall',cases};
}
/** Read-only calibration. De-duplicates retries and retains the first completed attempt
 * per student + content + blueprint. Output contains no names, IDs, emails or answers.
 */
export function buildPilotReport(attempts,{minimumGroup=5}={}){
 const rows=Array.isArray(attempts)?attempts:[],seenIds=new Set(),seenStudents=new Set();let excluded=0;
 const groups=new Map();
 for(const a of [...rows].sort((a,b)=>String(a?.createdAt||'').localeCompare(String(b?.createdAt||'')))){
  if(!a||a.type!=='citizen-reception'||!a.shift?.completed||a.shift.mode!=='assessment')continue;
  const key=`${a.studentKey}/${a.id}`;if(seenIds.has(key))continue;seenIds.add(key);
  if(!a.studentKey||a.contentVersion!==CONTENT_VERSION||a.rubricVersion!==RUBRIC_VERSION||!restoreShift(a.shift,`student:${a.studentKey}`,'assessment',a.shift.period)){excluded++;continue;}
  const gkey=`${a.shift.period}|${a.shift.assignment.profileId}|${a.contentVersion}|${a.rubricVersion}|${a.shift.calendarYear}|${a.shift.calendarSnapshot.id}`;
  const studentGroup=`${a.studentKey}|${gkey}`;if(seenStudents.has(studentGroup))continue;seenStudents.add(studentGroup);
  const g=groups.get(gkey)||{calendarYear:a.shift.calendarYear,calendarSnapshotId:a.shift.calendarSnapshot.id,period:a.shift.period,profileId:a.shift.assignment.profileId,contentVersion:a.contentVersion,rubricVersion:a.rubricVersion,samples:[],cases:new Map()};
  const score=summary(a.shift),timing=observedIntervals(a.shift);g.samples.push({points:score.points,minutes:timing.minutes});
  for(const r of score.results){const c=CASES.find(c=>c.id===r.caseId);if(!c)continue;const cr=g.cases.get(c.templateId)||{templateId:c.templateId,title:c.title,level:c.level,results:[],minutes:[]};cr.results.push(r);const minutes=timing.cases[c.id]?.minutes;if(Number.isFinite(minutes))cr.minutes.push(minutes);g.cases.set(c.templateId,cr);}
  groups.set(gkey,g);
 }
 const threshold=Math.max(3,Math.min(100,Number(minimumGroup)||5));
 return {version:PILOT_VERSION,generatedAt:new Date().toISOString(),contentVersion:CONTENT_VERSION,minimumGroup:threshold,excludedIncompatible:excluded,
  interpretation:'Интервалы включают внешние поиски и паузы. Это описание учебного пилота, не доказательство эффективности, самостоятельности или активного времени. Только первая завершённая попытка одного студента в данном периоде и профиле.',
  groups:[...groups.values()].map(g=>({calendarYear:g.calendarYear,calendarSnapshotId:g.calendarSnapshotId,period:g.period,profileId:g.profileId,contentVersion:g.contentVersion,rubricVersion:g.rubricVersion,count:g.samples.length,
   status:g.samples.length<threshold?'insufficient-sample':'descriptive-only',medianPoints:g.samples.length>=threshold?median(g.samples.map(s=>s.points)):null,
   medianMinutes:g.samples.filter(s=>Number.isFinite(s.minutes)).length>=threshold?median(g.samples.map(s=>s.minutes)):null,timedCount:g.samples.filter(s=>Number.isFinite(s.minutes)).length,
   cases:[...g.cases.values()].map(c=>({templateId:c.templateId,title:c.title,level:c.level,count:c.results.length,
    meanScore:c.results.length>=threshold?Math.round(c.results.reduce((n,r)=>n+r.total,0)/c.results.length*10)/10:null,
    medianMinutes:c.minutes.length>=threshold?median(c.minutes):null,
    criteria:c.results.length>=threshold?Object.fromEntries(['facts','research','routing','calendar','actions','rights'].map(k=>[k,Math.round(c.results.reduce((n,r)=>n+r.scores[k],0)/c.results.length*10)/10])):null,
    status:c.results.length<threshold?'insufficient-sample':'descriptive-only'})).sort((a,b)=>a.level-b.level||a.title.localeCompare(b.title,'ru'))}))};
}
export function pilotCSV(report){
 const cell=x=>{let s=x==null?'':String(x);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const rows=[['Период','Год календаря','Версия календаря','Профиль','Версия содержания','Ситуация','Уровень','Наблюдений','Средний балл /100','Медиана интервала, мин','Статус']];
 for(const g of report.groups||[])for(const c of g.cases)rows.push([g.period,g.calendarYear,g.calendarSnapshotId,g.profileId,g.contentVersion,c.title,c.level,c.count,c.meanScore,c.medianMinutes,c.status]);
 return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
