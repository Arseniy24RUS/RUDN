/** Full published source text for one selected vacancy/page; no eager bank scan. */
import {decodeGzip} from './employer-vacancies-bank.mjs';
import {requirementStateFromText} from './career-journey-model.mjs';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const HEX=/^[a-f0-9]{64}$/;
const BASE_PAGE=/^pages\/[a-f0-9]{2}\/[a-f0-9]{24}\/p[0-9]{4}-[a-f0-9]{16}\.json\.gz$/;
const PART_PAGE=/^pages\/[a-f0-9]{2}\/[a-f0-9]{24}\/p[0-9]{4}-[a-f0-9]{16}\.part[0-9]{4}\.json\.gz$/;
const abortError=()=>new DOMException('Vacancy details cancelled','AbortError');
async function digest(raw){if(!globalThis.crypto?.subtle)throw new Error('Source verification is unavailable');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(v=>v.toString(16).padStart(2,'0')).join('');}
function sameIDs(actual,expected){return actual.length===expected.length&&new Set(actual).size===actual.length&&actual.every(id=>expected.includes(id));}
export function validateDetailsPack(pack,binding,expectedIDs=binding.uuids){
 if(!object(pack)||pack.schemaVersion!==1||pack.baseTreeSHA!==binding.baseTreeSHA||pack.basePage!==binding.basePage||pack.basePageSHA256!==binding.basePageSHA256||pack.employerId!==binding.employerId)throw new Error('Source detail/base-page identity mismatch');
 if(Array.isArray(pack.shards)){
  if(pack.records!==undefined&&Object.keys(pack.records).length||pack.recordCount!==binding.uuids.length)throw new Error('Invalid detail index');
  const ids=[],paths=new Set();
  for(const part of pack.shards){
   if(!object(part)||!PART_PAGE.test(part.path)||!part.path.startsWith(binding.basePage.slice(0,-8)+'.part')||paths.has(part.path)||!Array.isArray(part.uuids)||!part.uuids.length||!HEX.test(part.sha256)||!HEX.test(part.uncompressedSHA256)||!Number.isInteger(part.bytes)||part.bytes<18||part.bytes>4*1024*1024||!Number.isInteger(part.uncompressedBytes)||part.uncompressedBytes<1||part.uncompressedBytes>8*1024*1024)throw new Error('Invalid bound source-detail shard');
   paths.add(part.path);ids.push(...part.uuids);
  }
  if(!sameIDs(ids,binding.uuids))throw new Error('Detail index UUID coverage mismatch');
 }else if(!object(pack.records)||!sameIDs(Object.keys(pack.records),expectedIDs))throw new Error('Source detail UUID coverage mismatch');
 return pack;
}
export function createVacancyDetailsStore({getMetadata=()=>null,fetchImpl=(...args)=>fetch(...args),baseURL='data/vacancies/details/',maxPages=4,maxStates=16,timeout=20000}={}){
 const cache=new Map(),pending=new Map(),states=new Map(),listeners=new Set();let disposed=false,active=0;const waiting=[];
 async function acquire(signal){if(signal.aborted)throw abortError();if(active<2){active++;return;}await new Promise((resolve,reject)=>{const item={resolve:()=>{signal.removeEventListener('abort',cancel);resolve();}},cancel=()=>{const index=waiting.indexOf(item);if(index>=0)waiting.splice(index,1);reject(abortError());};waiting.push(item);signal.addEventListener('abort',cancel,{once:true});});}
 function release(){const next=waiting.shift();if(next)next.resolve();else active--;}

 const notify=key=>{if(!disposed)for(const fn of listeners)fn(key);};
 function context(binding){const meta=getMetadata();if(!meta?.available||!HEX.test(meta.baseTreeSHA)||meta.baseTreeSHA!==meta.detailsBaseTreeSHA||!HEX.test(meta.detailsTreeSHA))throw new Error('Full source details are not connected');if(!BASE_PAGE.test(binding.basePage)||!HEX.test(binding.basePageSHA256)||!Array.isArray(binding.uuids)||new Set(binding.uuids).size!==binding.uuids.length||!binding.uuids.length||binding.uuids.length>250||!binding.employerId)throw new Error('Invalid current vacancy page');return{...binding,baseTreeSHA:meta.baseTreeSHA,detailsTreeSHA:meta.detailsTreeSHA,sourceHosting:meta.collectionRoot||null};}
 const pageKey=b=>JSON.stringify([b.detailsTreeSHA,b.baseTreeSHA,b.basePage,b.basePageSHA256,b.employerId,b.uuids]);
 const stateKey=(b,id)=>pageKey(b)+'|'+id;
 function touch(key,value){cache.delete(key);cache.set(key,value);while(cache.size>maxPages)cache.delete(cache.keys().next().value);}
 function locate(b,id){const root=cache.get(pageKey(b)+'|'+b.basePage);if(!root)return null;let found=root;if(root.pack.shards){const part=root.pack.shards.find(p=>p.uuids.includes(id));if(!part)return null;found=cache.get(pageKey(b)+'|'+part.path);if(!found)return null;}const record=found.pack.records?.[id];return record?{record:hydrateDetailRecord(found.pack,id),provenance:{baseTreeSHA:b.baseTreeSHA,basePage:b.basePage,basePageSHA256:b.basePageSHA256,employerId:b.employerId,detailsTreeSHA:b.detailsTreeSHA,sourceHosting:b.sourceHosting,detailPage:found.path,gzipSHA256:found.gzipSHA256,uncompressedSHA256:found.uncompressedSHA256,recordJSONPointer:'/records/'+id,sourceDatabaseSHA256:found.pack.sourceDatabaseSHA256||root.pack.sourceDatabaseSHA256||null,sourceFields:found.pack.sourceFields||root.pack.sourceFields||null}}:null;}
 async function readFile(path,b,ref,signal){const key=pageKey(b)+'|'+path;if(cache.has(key)){const value=cache.get(key);touch(key,value);return value;}
  let job=pending.get(key);if(job?.controller.signal.aborted){pending.delete(key);job=null;}
  if(!job){const controller=new AbortController();job={controller,consumers:new Set()};
   job.promise=(async()=>{let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new DOMException('Source detail timeout','TimeoutError'));},timeout);});
    try{const value=await Promise.race([(async()=>{await acquire(controller.signal);let response;try{response=await fetchImpl(baseURL+path,{cache:'no-store',signal:controller.signal});}catch(error){release();throw error;}if(!response.ok){release();throw new Error('Source detail HTTP '+response.status);}let raw;try{raw=new Uint8Array(await response.arrayBuffer());}finally{release();}if(raw.length>4*1024*1024)throw new Error('Compressed source detail exceeds limit');const compressedSHA=await digest(raw);if(ref&&(raw.length!==ref.bytes||compressedSHA!==ref.sha256))throw new Error('Source detail shard compressed checksum mismatch');const decoded=await decodeGzip(raw,{expectedBytes:ref?.uncompressedBytes,maxBytes:8*1024*1024});const decodedSHA=await digest(decoded);if(ref&&decodedSHA!==ref.uncompressedSHA256)throw new Error('Source detail shard checksum mismatch');if(controller.signal.aborted)throw abortError();const pack=validateDetailsPack(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded)),b,ref?.uuids||b.uuids);const result={pack,path,gzipSHA256:compressedSHA,uncompressedSHA256:decodedSHA};touch(key,result);return result;})(),deadline]);return value;}finally{clearTimeout(timer);}
   })();pending.set(key,job);job.promise.finally(()=>{if(pending.get(key)===job)pending.delete(key);}).catch(()=>{});
  }
  return new Promise((resolve,reject)=>{const consumer={};job.consumers.add(consumer);let settled=false;const cleanup=()=>{job.consumers.delete(consumer);signal.removeEventListener('abort',cancel);};const cancel=()=>{if(settled)return;settled=true;cleanup();if(!job.consumers.size)job.controller.abort();reject(abortError());};if(signal.aborted){cancel();return;}signal.addEventListener('abort',cancel,{once:true});job.promise.then(v=>{if(!settled){settled=true;cleanup();resolve(v);}},e=>{if(!settled){settled=true;cleanup();reject(e);}});});
 }
 function status(binding,id){try{const b=context(binding),key=stateKey(b,id),state=states.get(key),ready=locate(b,id);return{key,status:state?.loading?'loading':state?.error?'error':ready?'ready':'idle',error:state?.error||null,...ready};}catch{return{key:null,status:'unavailable',error:'not-connected'};}}
 function load(binding,id){if(disposed)return Promise.resolve(null);let b;try{b=context(binding);if(!b.uuids.includes(id))throw new Error('Vacancy not in current page');}catch{return Promise.resolve({status:'error',error:'source-mismatch'});}
  const key=stateKey(b,id),existing=states.get(key);if(existing?.loading)return existing.promise;const ready=locate(b,id);if(ready&&!existing?.error)return Promise.resolve({key,status:'ready',...ready});
  existing?.controller?.abort();const state={loading:true,error:null,controller:new AbortController()};states.delete(key);states.set(key,state);while(states.size>maxStates){const first=states.keys().next().value;states.get(first).controller.abort();states.delete(first);}notify(key);
  state.promise=(async()=>{try{const root=await readFile(b.basePage,b,null,state.controller.signal);if(root.pack.shards){const part=root.pack.shards.find(p=>p.uuids.includes(id));await readFile(part.path,b,part,state.controller.signal);touch(pageKey(b)+'|'+b.basePage,root);}if(state.controller.signal.aborted)throw abortError();const found=locate(b,id);if(!found)throw new Error('Selected source detail missing');return{key,status:'ready',...found};}catch(error){if(error.name!=='AbortError')state.error=error.name==='TimeoutError'?'timeout':'load-failed';return{key,status:'error',error:state.error||'cancelled'};}finally{state.loading=false;state.promise=null;notify(key);}})();return state.promise;
 }
 return{get:status,load,cancelAll(){for(const state of states.values())state.controller.abort();},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},cancel(binding,id){try{const key=stateKey(context(binding),id),state=states.get(key);state?.controller?.abort();if(state){state.loading=false;state.error=null;}notify(key);}catch{}},cacheInfo:()=>({pages:cache.size,pending:pending.size,activeRequests:active,states:states.size}),dispose(){disposed=true;for(const state of states.values())state.controller.abort();for(const job of pending.values())job.controller.abort();cache.clear();states.clear();listeners.clear();}};
}

export const DETAIL_CATEGORIES=['duties','knowledge','skills','knowledgeDescription','additionalRequirements','departmentLabels','otherRequirements'];
/** Resolve only the requested record. A dictionary never leaves this page/part. */
export function hydrateDetailRecord(pack,id){
 const input=pack.records?.[id];if(!object(input))throw new Error('Missing selected source record');
 const result={};
 for(const category of DETAIL_CATEGORIES){
  const tokens=input[category]??[];if(!Array.isArray(tokens))throw new Error('Invalid source text category');
  result[category]=tokens.map(token=>{
   if(!object(token)||typeof token.sourceField!=='string'||typeof token.sourcePointer!=='string'||!token.sourcePointer.startsWith('/'))throw new Error('Invalid source text locator');
   let text=token.text;
   if(Object.hasOwn(token,'textIndex')){if(pack.tokenEncoding!=='page-strings-v1'||!Array.isArray(pack.strings)||!Number.isInteger(token.textIndex)||token.textIndex<0||token.textIndex>=pack.strings.length)throw new Error('Invalid source string reference');text=pack.strings[token.textIndex];}
   if(typeof text!=='string')throw new Error('Invalid source text');
   const {textIndex,...rest}=token;return{...rest,text};
  });
 }
 return result;
}
const educationFields=new Set(['educationLevelName','trainingTypes','trainingTypesCollection','targetedTrainingEducationLevelName','academicPerformanceRequirements']);
const experienceFields=new Set(['governmentExperienceName','professionalExperienceName']);
const SOURCE_LABELS={knowledge:'Знания',skills:'Умения и навыки',education:'Образование',experience:'Стаж',majors:'Направления подготовки (альтернативы)',other:'Дополнительные требования',service:'Условия службы'};
function sourceLabelKey(field,category){return ['trainingTypes','trainingTypesCollection'].includes(field)?'majors':/CivilServicePassingConditions|withoutCompetitionReason/.test(field)?'service':category;}
function sourceLabel(field,category){return SOURCE_LABELS[sourceLabelKey(field,category)]||SOURCE_LABELS.other;}
/** No duties-to-qualification inference: duties are read-only context. */
export function bankVacancySnapshot(row,detail,{institutionId,employerId,employerName,provenance}={}){
 const requirements=[],seen=new Map();
 function add(category,token){
  if(!token.text.trim())return;
  const paragraphs=token.alternativeGroup?[token.text]:token.text.split(/\n\s*\n|\n(?=\s*(?:[•●▪–—-]\s|\d+[.)]\s))/).filter(text=>text.trim());
  for(const text of paragraphs){const key=category+'|'+text;const ref={sourceField:token.sourceField,sourcePointer:token.sourcePointer,sourceNamespace:token.sourceNamespace};if(seen.has(key)){seen.get(key).sourceReferences.push(ref);continue;}
   const item={category,sourceText:text,requirementState:requirementStateFromText(text),selfAssessmentEligible:true,sourceLocator:sourceLabel(token.sourceField,category),sourceHeading:sourceLabel(token.sourceField,category),sourceLabelKey:sourceLabelKey(token.sourceField,category),evidenceSourceUrl:row.sourceURL,sourceKind:'published-vacancy-field',scope:row.scope,sourceReferences:[ref,...(token.sourceProvenance||[])]};seen.set(key,item);requirements.push(item);
  }
 }
 for(const [field,category] of [['knowledge','knowledge'],['skills','skills'],['knowledgeDescription','knowledge'],['additionalRequirements','other']])for(const token of detail[field]||[])add(category,token);
 const other=detail.otherRequirements||[],majors=other.filter(token=>token.sourceField==='trainingTypesCollection'&&token.text.trim());
 if(majors.length){const first=majors[0],references=majors.flatMap(token=>[{sourceField:token.sourceField,sourcePointer:token.sourcePointer,sourceNamespace:token.sourceNamespace},...(token.sourceProvenance||[])]);add('education',{...first,text:[...new Set(majors.map(token=>token.text))].join(' / '),alternativeGroup:true,sourceProvenance:references});}
 for(const token of other){if(majors.length&&['trainingTypes','trainingTypesCollection'].includes(token.sourceField))continue;add(educationFields.has(token.sourceField)?'education':experienceFields.has(token.sourceField)?'experience':'other',token);}
 for(const [field,category] of [['education','education'],['professionalExperience','experience'],['governmentExperience','experience']])if(typeof row[field]==='string'&&row[field].trim())add(category,{text:row[field],sourceField:field,sourcePointer:'/basePage/'+field,sourceNamespace:'base-public-summary'});
 return{id:'bank-'+row.id,sourceVacancyId:row.id,sourceCategory:'public-vacancy-bank',bankVacancy:true,institutionId,employerId,employerName,title:row.title,regionId:null,regionName:row.region,url:row.sourceURL,scope:row.scope,archive:row.archive,announcedAt:row.announcedAt,expiresAt:row.expiresAt,state:row.state,currentness:'unknown',requirements,duties:detail.duties,department:detail.departmentLabels.map(t=>t.text).join('\n'),source:{url:row.sourceURL,kind:'published-vacancy-bank',provenance},sourceDetails:detail};
}
