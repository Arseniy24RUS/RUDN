/** Curated Russian institutional extension. Separate comparison cohort using the current shared scoring module.
 * Numerical role mappings are editorial hypotheses; source links validate institutions,
 * not weights, hiring availability or an individual's right to enter service.
 */
import {computeRoleProfile,buildSectorPreference,scoreAuthority} from './scoring.mjs';
import {inputsFromState,validateInputs} from './scenarios.mjs';
export const PUBLIC_SERVICE_COHORTS=['federal-legislative','federal-judicial','regional','municipal'];
const LANGS=['ru','en','zh-Hans'];
const OFFICIAL_HOSTS=new Set(['duma.gov.ru','council.gov.ru','www.ksrf.ru','vsrf.ru','www.vsrf.ru','www.zs74.ru','www.gov.spb.ru','novo-sibirsk.ru','gorsovetnsk.ru']);
const text=v=>v&&LANGS.every(l=>typeof v[l]==='string'&&v[l].trim());
export function validatePublicRegistry(registry,data){
 const errors=[];const fail=(id,reason)=>errors.push(`${id}: ${reason}`);
 if(registry?.country!=='RU'||registry?.schemaVersion!==1||!Array.isArray(registry?.records))return ['Invalid registry'];
 if(!Array.isArray(registry.eligibilitySources)||registry.eligibilitySources.length!==2||registry.eligibilitySources.some(url=>{try {const u=new URL(url);return u.protocol!=='https:'||!['www.minjust.gov.ru','novo-sibirsk.ru'].includes(u.hostname)||u.username||u.password;}catch{return true;}}))fail('registry','unsafe eligibility source');
 const ids=new Set(),trackIds=new Set(data.tracks.map(t=>t.id)),sectorIds=new Set(data.sectors.map(s=>s.id));
 for(const a of registry.records){
  if(!a||typeof a!=='object'){fail('record','invalid object');continue;}
  if(!/^[a-z][a-z0-9-]+$/.test(a.id)||ids.has(a.id))fail(a.id,'invalid or duplicate id');ids.add(a.id);
  if(a.country!=='RU'||!PUBLIC_SERVICE_COHORTS.includes(a.cohort)||!text(a.name)||!text(a.mission)||!text(a.location)||!text(a.exercise))fail(a.id,'scope or translated content');
  if(!['apparatus','authority'].includes(a.unitType)||a.vacancyStatus!=='not-a-vacancy'||a.educationStatus!=='check-each-position')fail(a.id,'status');
  if(a.cohort==='municipal'&&(a.level!=='municipal'||!a.branch?.startsWith('local-')))fail(a.id,'municipal classification');
  if(a.cohort.startsWith('federal-')&&(a.level!=='federal'||a.unitType!=='apparatus'))fail(a.id,'federal staff classification');
  if(a.cohort==='regional'&&a.level!=='regional')fail(a.id,'regional classification');
  if(a.cohort==='federal-judicial'&&a.branch!=='judicial'||a.cohort==='federal-legislative'&&a.branch!=='legislative')fail(a.id,'branch mismatch');
  if(!Array.isArray(a.verifiedUnits)||a.verifiedUnits.some(v=>typeof v!=='string'))fail(a.id,'official unit labels');
  const sourceIds=new Set();
  if(!Array.isArray(a.sources)){fail(a.id,'sources schema');continue;}
  for(const s of a.sources){
   if(!s||typeof s!=='object'){fail(a.id,'invalid source');continue;}
   if(!['full-page','official-indexed-text'].includes(s.access)||!s.doesNotSupport?.includes('model-weights')||!s.doesNotSupport?.includes('vacancy-status'))fail(a.id,'evidence status');
   try {const u=new URL(s.url);if(u.protocol!=='https:'||!OFFICIAL_HOSTS.has(u.hostname)||u.username||u.password)fail(a.id,'non-official or unsafe source');}catch{fail(a.id,'invalid URL');}
   if(sourceIds.has(s.id)||!text(s.title)||!/^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt))fail(a.id,'invalid source metadata');sourceIds.add(s.id);
  }
  if(!sourceIds.has('structure')||!a.tracks?.length)fail(a.id,'missing evidence or role');
  const seenTracks=new Set();
  if(!Array.isArray(a.tracks)){fail(a.id,'tracks schema');continue;}
  for(const t of a.tracks){
   if(!t||typeof t!=='object'){fail(a.id,'invalid track');continue;}
   if(t.status!=='authored-functional-mapping')fail(a.id,'model classification');
   if(!trackIds.has(t.id)||seenTracks.has(t.id)||![1,2,3].includes(t.importance)||!text(t.title)||!text(t.rationale))fail(a.id,'invalid role');seenTracks.add(t.id);
   if(!t.sourceIds?.length||t.sourceIds.some(id=>!sourceIds.has(id)))fail(a.id,'role without source');
   if(!t.sectors?.length||new Set(t.sectors.map(s=>s.id)).size!==t.sectors.length||t.sectors.some(s=>!sectorIds.has(s.id)||!Number.isFinite(s.weight)||s.weight<=0||s.weight>1))fail(a.id,'invalid sectors');
   if(['FIELD','SCHEDULE','FORMAL','SECURITY'].some(k=>!Number.isInteger(t.conditions?.[k])||t.conditions[k]<1||t.conditions[k]>5))fail(a.id,'invalid conditions');
  }
 }
 return errors;
}
export function rankPublicService(registry,data,inputs){
 if(!inputs||validateInputs(inputsFromState(inputs),data.questions,data.sectors).length)return null;
 // No arrays or state belonging to the original application are modified.
 const roleProfile=computeRoleProfile(inputs.answers,data.questions);
 const sectorPreferences=buildSectorPreference(inputs.prioritySectors,inputs.lowPrioritySectors,data.sectors);
 const context={roleProfile,sectorPreferences,conditions:inputs.conditions,focusAreas:inputs.focusAreas||{}};
 const map=new Map(data.tracks.map(t=>[t.id,t]));
 const ranked=registry.records.map(record=>{
  const options=record.tracks.map(link=>{
   const scored=scoreAuthority({id:record.id,shortName:record.name.ru,sectors:link.sectors,conditions:link.conditions,tracks:[link]},context,map);
   return {...scored,link};
  }).sort((a,b)=>b.rawScore-a.rawScore||b.sectorFit-a.sectorFit||a.link.id.localeCompare(b.link.id));
  return {...record,match:options[0],options};
 }).sort((a,b)=>b.match.rawScore-a.match.rawScore||b.match.sectorFit-a.match.sectorFit||a.name.ru.localeCompare(b.name.ru,'ru'));
 return {ranked,roleProfile,sectorPreferences};
}
export function filterPublicRecords(records,{cohort='all',query=''}={}){
 const q=String(query).normalize('NFKC').trim().toLocaleLowerCase();
 return records.filter(a=>(cohort==='all'||a.cohort===cohort)&&(!q||[...Object.values(a.name),...Object.values(a.location),...Object.values(a.mission),...a.verifiedUnits,...a.tracks.flatMap(t=>Object.values(t.title))].join(' ').normalize('NFKC').toLocaleLowerCase().includes(q)));
}
export function publicServiceReport(registry,ranked){
 return {kind:'russian-public-service-exploration',schemaVersion:1,registryVersion:registry.registryVersion,modelVersion:registry.modelVersion,generatedAt:new Date().toISOString(),notice:'Not an anonymous class result or evidence of eligibility. Russian institutions only.',items:ranked.map((a,i)=>({id:a.id,officialName:a.name.ru,country:'RU',cohort:a.cohort,rankWithinSelection:i+1,index:a.match?.score??null,track:a.match?.link.id??null,source:a.sources[0].url}))};
}
