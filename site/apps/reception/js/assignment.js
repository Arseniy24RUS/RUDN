import {EVIDENCE_VERSION,CASES,CASE_TEMPLATES,CONTENT_VERSION,datedCaseBank} from './content-library.js';
import {modePolicy} from './policy.js';

export const ASSIGNMENT_VERSION='balanced-bank-4';
export const SHIFT_PROFILES=Object.freeze({
 'balanced-six':Object.freeze({id:'balanced-six',title:'Занятие с общим разбором',levels:[1,1,2,2,2,3],
 requiredFamilies:['budget','mfc-complaint'],requiredTerms:['calendarDays:7','calendarDays:30','workingDays'],
 estimatedMinutes:60,description:'Шесть дел: два базовых, три средних и одно сложное. Ориентир 60 минут самостоятельной работы плюс общий разбор и завершение занятия. Продолжительность требует пилота.'}),
 'extended-eight':Object.freeze({id:'extended-eight',title:'Самостоятельная смена · 90 минут',levels:[1,1,2,2,2,2,3,3],
 requiredFamilies:['budget','mfc-complaint'],requiredTerms:['calendarDays:7','calendarDays:30','workingDays'],
 estimatedMinutes:90,description:'Восемь дел и восемь контрольных продолжений: два базовых, четыре средних, два сложных. Ориентир 90 минут без общего разбора; это учебный план, а не измеренное время и не таймер оценки.'})
});
export const SHIFT_PROFILE=SHIFT_PROFILES['balanced-six'];
export function getShiftProfile(id){const p=SHIFT_PROFILES[id];if(!p)throw Error('Неизвестный профиль смены.');return p;}
export function seededRandom(seed){let x=2166136261;for(const c of String(seed))x=Math.imul(x^c.charCodeAt(0),16777619)>>>0;return ()=>{x=(x+0x6D2B79F5)>>>0;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(items,rng){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function hasRequiredCoverage(cases,profile){return profile.requiredFamilies.every(f=>cases.some(c=>c.familyId===f))&&profile.requiredTerms.every(t=>cases.some(c=>t==='workingDays'?c.calendar.unit===t:`${c.calendar.unit}:${c.calendar.duration}`===t));}
function instanceRank(c,recentIds,recentTemplates){return (recentIds.has(c.id)?4:0)+(recentTemplates.has(c.templateId)?1:0);}

/** Fixed blueprint first, random substantive case second. Times never enter scoring. */
export function createAssignment({seed,mode,templateId=null,level=null,recentCaseIds=[],profileId='balanced-six',calendarYear=null,calendarSnapshot=null}={}){
 modePolicy(mode);const profile=getShiftProfile(profileId);const available=calendarYear?datedCaseBank(calendarYear,calendarSnapshot):{cases:CASES,excluded:[]};const pool=available.cases;
 if(typeof seed!=='string'||!seed)throw Error('Не задано зерно назначения.');
 if(!Array.isArray(recentCaseIds))throw Error('Повреждена история выдачи.');
 if((templateId||level)&&mode!=='practice')throw Error('В самостоятельной работе состав смены не выбирается вручную.');
 const rng=seededRandom(seed),recentIds=new Set(recentCaseIds),recentTemplates=new Set(pool.filter(c=>recentIds.has(c.id)).map(c=>c.templateId));
 const rank=items=>shuffle(items,rng).sort((a,b)=>instanceRank(a,recentIds,recentTemplates)-instanceRank(b,recentIds,recentTemplates));
 let chosen,assignedProfile=profile.id;
 if(templateId){
  if(!CASE_TEMPLATES.some(c=>c.id===templateId))throw Error('Ситуация отсутствует в банке.');
  chosen=[rank(pool.filter(c=>c.templateId===templateId))[0]];assignedProfile='single-practice';
 }else if(level){
  if(![1,2,3].includes(Number(level)))throw Error('Неизвестный уровень.');
  const byFamily=new Map();for(const c of rank(pool.filter(c=>c.level===Number(level))))if(!byFamily.has(c.familyId))byFamily.set(c.familyId,c);
  chosen=[...byFamily.values()].slice(0,3);assignedProfile='level-practice';
 }else{
  const candidates=profile.levels.map(l=>rank(pool.filter(c=>c.level===l)));let nodes=0;
  function select(index,picked,families){
   if(++nodes>200000)throw Error('Не удалось собрать смену: проверьте покрытие банка.');
   if(index===profile.levels.length)return hasRequiredCoverage(picked,profile)?picked:null;
   for(const c of candidates[index]){
    if(families.has(c.familyId))continue;const next=[...picked,c],used=new Set([...families,c.familyId]);
    if(!profile.requiredFamilies.every(f=>used.has(f)||candidates.slice(index+1).some(a=>a.some(v=>v.familyId===f&&!used.has(f)))))continue;
    const result=select(index+1,next,used);if(result)return result;
   }return null;
  }
  chosen=select(0,[],new Set());if(!chosen)throw Error('В банке недостаточно совместимых ситуаций для сопоставимой смены.');
 }
 if(!chosen?.length||chosen.some(c=>!c))throw Error('Для выбранной ситуации пока нет полного календаря; выберите другую ситуацию или обновите календарь.');const ids=chosen.map(c=>c.id);
 return {calendarYear,calendarSnapshotId:calendarSnapshot?.id||null,excludedDatePackCount:available.excluded.length,version:ASSIGNMENT_VERSION,evidenceVersion:EVIDENCE_VERSION,contentVersion:CONTENT_VERSION,profileId:assignedProfile,seed,
 templateId:templateId||null,level:level?Number(level):null,caseIds:ids,
 manifest:chosen.map(c=>({id:c.id,templateId:c.templateId,familyId:c.familyId,datePackId:c.datePackId,level:c.level,difficulty:{...c.difficulty},evidenceTaskId:c.evidenceTaskId,dateValues:{...c.dateValues}})),
 recentPolicy:'prefer-unseen-instance-then-template',repeatCount:ids.filter(id=>recentIds.has(id)).length,
 plannedMinutes:assignedProfile===profile.id?profile.estimatedMinutes:chosen.reduce((n,c)=>n+c.estimatedMinutes,0),
 estimatedCaseMinutes:chosen.reduce((n,c)=>n+c.estimatedMinutes,0),timeEstimateStatus:'editorial-not-calibrated'};
}
export function validAssignment(a,mode,calendarSnapshot=null){
 try{
  modePolicy(mode);
  if(a?.calendarYear&&(!calendarSnapshot||a.calendarSnapshotId!==calendarSnapshot.id))return false;
  const pool=a?.calendarYear?datedCaseBank(a.calendarYear,calendarSnapshot).cases:CASES;
  if(!a||a.evidenceVersion!==EVIDENCE_VERSION||a.version!==ASSIGNMENT_VERSION||a.contentVersion!==CONTENT_VERSION||typeof a.seed!=='string'||!a.seed||!Array.isArray(a.caseIds)||!Array.isArray(a.manifest))return false;
  const rows=a.caseIds.map(id=>pool.find(c=>c.id===id));if(!rows.length||rows.some(c=>!c)||a.caseIds.length!==new Set(a.caseIds).size||a.manifest.length!==rows.length)return false;
  if(rows.some((c,i)=>{const m=a.manifest[i];return !m||m.id!==c.id||m.templateId!==c.templateId||m.familyId!==c.familyId||m.datePackId!==c.datePackId||m.level!==c.level||m.evidenceTaskId!==c.evidenceTaskId||JSON.stringify(m.dateValues)!==JSON.stringify(c.dateValues);}))return false;
  if(new Set(rows.map(c=>c.familyId)).size!==rows.length)return false;
  if(a.profileId==='single-practice')return mode==='practice'&&rows.length===1&&rows[0].templateId===a.templateId;
  if(a.profileId==='level-practice')return mode==='practice'&&[1,2,3].includes(a.level)&&rows.length<=3&&rows.every(c=>c.level===a.level);
  const p=getShiftProfile(a.profileId);return rows.length===p.levels.length&&rows.every((c,i)=>c.level===p.levels[i])&&hasRequiredCoverage(rows,p);
 }catch{return false;}
}
