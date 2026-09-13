import {CONTENT_MANIFEST as manifest} from '../content/manifest.js';
import {realizeDatePack,caseDeadlineWithSnapshot} from './case-time.js';

// Public synchronous read interfaces are retained. Async entry points hydrate the
// assigned/restored cases before any validation, scoring, or rendering uses them.
export const VERSION=manifest.version, CONTENT_VERSION=manifest.contentVersion, RUBRIC_VERSION=manifest.rubricVersion, LEGAL_DATE=manifest.legalDate;
export const EVIDENCE_VERSION=manifest.evidenceVersion, EVIDENCE_DATE=manifest.evidenceDate;
export const ROLE=manifest.role, RUBRIC=manifest.rubric, BANK_INFO=manifest.bank;
export const CASE_TEMPLATES=manifest.templates.map(value=>structuredClone(value));
export const SOURCES=[], EVIDENCE_RECORDS=[], EVIDENCE_TASKS={};
export const SOURCE_INDEX={...manifest.indexHeader,entries:[]};
const hydrated=new Set(),pending=new Map(),templatePositions=new Map(CASE_TEMPLATES.map((c,i)=>[c.id,i]));
const sourcePositions=new Map(manifest.sourceOrder.map((id,i)=>[id,i])),recordPositions=new Map(manifest.recordOrder.map((id,i)=>[id,i]));
const sourceRecords=new Map(),evidenceRecords=new Map();
let commonPromise=null,catalogPromise=null,indexPromise=null,contentRevision=0;
const failure=(code,message)=>Object.assign(new Error(message),{code});
const clone=value=>JSON.parse(JSON.stringify(value));

function interpolate(value,pack){
 if(Array.isArray(value))return value.map(v=>interpolate(v,pack));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,interpolate(v,pack)]));
 if(typeof value!=='string')return value;
 return value.replace(/\{\{(\w+)\}\}/g,(_,key)=>{
  const raw=pack[key]??pack[key+'ISO'];if(raw===undefined)throw Error('Неизвестная переменная даты: '+key);
  return key.endsWith('ISO')?raw:/^\d{4}-\d{2}-\d{2}$/.test(String(raw))?raw.split('-').reverse().join('.'):String(raw);
 });
}
export function instantiateCase(template,datePackId,options={}){
 const authored=template.datePacks.find(d=>d.id===datePackId);
 const pack=authored&&(options.dateValues||(options.year?realizeDatePack(template,authored,options.year,options.calendarSnapshot):{...authored,caseYear:Number(authored.receivedISO.slice(0,4))}));
 if(!pack)throw Error('Набор дат отсутствует.');
 const data=clone(template);delete data.datePacks;const c=interpolate(data,pack);
 c.templateId=template.id;c.datePackId=pack.id;c.id=template.id+'@'+pack.id;c.dateValues={...pack};c.calendarYear=Number(pack.receivedISO.slice(0,4));
 if(options.calendarSnapshot)Object.defineProperty(c,'calendarSnapshot',{value:options.calendarSnapshot,enumerable:false});
 return c;
}
export const CASES=CASE_TEMPLATES.flatMap(c=>c.datePacks.map(p=>instantiateCase(c,p.id)));
const instancePositions=new Map(CASES.map((c,i)=>[c.id,i])),datedBankCache=new Map();
export function datedCaseBank(year,calendarSnapshot){
 const cacheKey=String(year)+':'+calendarSnapshot?.id+':'+contentRevision;if(datedBankCache.has(cacheKey))return datedBankCache.get(cacheKey);
 const cases=[],excluded=[];
 for(const t of CASE_TEMPLATES)for(const p of t.datePacks){
  try{const c=instantiateCase(t,p.id,{year,calendarSnapshot});caseDeadlineWithSnapshot(c,calendarSnapshot);cases.push(c);}
  catch(error){if(error.code!=='calendar/year-unavailable')throw error;excluded.push({id:t.id+'@'+p.id,templateId:t.id,year:error.year,reason:error.code});}
 }
 const result={cases,excluded,year,total:CASES.length};if(datedBankCache.size>=8)datedBankCache.delete(datedBankCache.keys().next().value);datedBankCache.set(cacheKey,result);return result;
}

async function checksum(value){const bytes=new TextEncoder().encode(JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function readResource(path,sha256,{signal,timeoutMs=8000,fetch:fetcher=globalThis.fetch}={}){
 if(signal?.aborted)throw new DOMException('Загрузка материалов отменена.','AbortError');
 const url=new URL('../content/'+path,import.meta.url);url.searchParams.set('v',sha256.slice(0,16));
 const validate=async text=>{const value=JSON.parse(text);if(await checksum(value)!==sha256)throw failure('content/integrity','Сохранённые материалы не совпадают с версией задания. Работа не заменена новым вариантом.');return value;};
 // Node build/regression harnesses use the same files and checksum checks, without a network dependency.
 if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');url.search='';return validate(await readFile(url,'utf8'));}
 let cache=null;
 const cacheStep=promise=>{let timer;return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),500);})]).finally(()=>clearTimeout(timer));};
 try{cache=await cacheStep(globalThis.caches?.open('rudn-reception-content-v1'));const saved=await cacheStep(cache?.match(url.href));if(saved)return await validate(await saved.text());}catch{/* Network may repair an unavailable or damaged resource cache. */}
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(url,{signal:controller.signal});if(!response.ok)throw failure('content/unavailable','Не удалось загрузить материалы назначенного дела. Сохранённые ответы не удалены.');
  const text=await response.text(),value=await validate(text);
  try{await cacheStep(cache?.put(url.href,new Response(text,{headers:{'Content-Type':'application/json'}})));}catch{/* Optional resource cache failure never deletes saved work. */}
  return value;
 }catch(error){if(error.code)throw error;throw failure('content/unavailable','Материалы назначенного дела пока недоступны. Проверьте соединение и повторите загрузку; вариант и ответы сохранены.');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function installMetadata(entries){
 for(const entry of entries){if(!sourcePositions.has(entry.id))throw failure('content/integrity','Неизвестная запись источника.');sourceRecords.set(entry.id,entry);}
 SOURCE_INDEX.entries.splice(0,SOURCE_INDEX.entries.length,...[...sourceRecords.values()].sort((a,b)=>sourcePositions.get(a.id)-sourcePositions.get(b.id)));
}
export async function ensureCommonContent(options={}){
 if(!commonPromise)commonPromise=readResource('common.json',manifest.commonSHA256,options).then(pack=>{SOURCES.splice(0,SOURCES.length,...pack.sources);installMetadata(pack.metadata);}).catch(error=>{commonPromise=null;throw error;});
 return commonPromise;
}
export async function hydrateTemplates(ids,options={}){
 if(options.signal?.aborted)throw new DOMException('Загрузка материалов отменена.','AbortError');
 const selected=[...new Set(ids)];if(selected.some(id=>!templatePositions.has(id)))throw failure('content/unknown-template','Назначенное дело отсутствует в этой версии. Сохранённая работа не заменена.');
 await ensureCommonContent(options);
 await Promise.all(selected.map(async id=>{
  if(hydrated.has(id))return;
  if(!pending.has(id))pending.set(id,(async()=>{
   const resource=manifest.resources[id],pack=await readResource(resource.path,resource.sha256,options);
   if(pack.template?.id!==id||!pack.task||!Array.isArray(pack.records)||!Array.isArray(pack.metadata))throw failure('content/integrity','Неполный пакет назначенного дела.');
   CASE_TEMPLATES[templatePositions.get(id)]=pack.template;EVIDENCE_TASKS[pack.template.evidenceTaskId]=pack.task;
   for(const record of pack.records)evidenceRecords.set(record.id,record);
   EVIDENCE_RECORDS.splice(0,EVIDENCE_RECORDS.length,...[...evidenceRecords.values()].sort((a,b)=>recordPositions.get(a.id)-recordPositions.get(b.id)));
   installMetadata(pack.metadata);
   for(const date of pack.template.datePacks){const c=instantiateCase(pack.template,date.id);CASES[instancePositions.get(c.id)]=c;}
   hydrated.add(id);contentRevision++;datedBankCache.clear();
  })().finally(()=>pending.delete(id)));
  await pending.get(id);
 }));
 return selected.map(id=>CASE_TEMPLATES[templatePositions.get(id)]);
}
export function requireTemplate(id){if(!hydrated.has(id))throw failure('content/not-loaded','Сначала загрузите материалы назначенного дела. Сохранённая работа не заменена.');return CASE_TEMPLATES[templatePositions.get(id)];}
export async function hydrateSavedShift(raw,options={}){
 if(!raw||raw.contentVersion!==CONTENT_VERSION||!Array.isArray(raw.assignment?.manifest))return;
 const ids=raw.assignment.manifest.map(row=>row?.templateId);
 if(!ids.length||ids.length>CASE_TEMPLATES.length)throw failure('content/invalid-assignment','Не удалось прочитать состав сохранённой смены.');
 await hydrateTemplates(ids,options);
}
export async function loadCaseCatalog(options={}){
 if(!catalogPromise)catalogPromise=readResource('catalog.json',manifest.catalogSHA256,options).then(rows=>{for(const row of rows)if(!hydrated.has(row.id))Object.assign(CASE_TEMPLATES[templatePositions.get(row.id)],row);return rows;}).catch(error=>{catalogPromise=null;throw error;});
 return catalogPromise;
}
export async function loadSourceIndex(options={}){
 if(!indexPromise)indexPromise=readResource('source-index.json',manifest.indexSHA256,options).then(index=>{installMetadata(index.entries);return SOURCE_INDEX;}).catch(error=>{indexPromise=null;throw error;});
 return indexPromise;
}
export function loadedContentIds(){return [...hydrated];}
