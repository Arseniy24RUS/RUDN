/** Employer-scoped static pages. No global vacancy index or automatic page prefetch. */
export const BANK_COLUMNS=Object.freeze(['id','title','scope','region','locality','salaryFrom','salaryTo','announcedAt','expiresAt','state','archive','sourceURL','education','professionalExperience','governmentExperience']);
const abortError=()=>new DOMException('Vacancy request cancelled','AbortError');
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const safePath=p=>typeof p==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_./-]*\.gz$/.test(p)&&!p.split('/').some(s=>s==='.'||s==='..'||!s);
export function platformEmployerId(value){
 // Prefixes are explicit platform namespaces, never organisation-name guesses.
 const id=String(value||'').replace(/^(?:ps:|territorial:)/,'');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,246}$/.test(id))throw new Error('Invalid employer identifier');
 return id;
}
function validateDescriptor(value,id){
 if(!record(value)||value.schemaVersion!==2||value.authorityId!==id||!Number.isInteger(value.jobCount)||value.jobCount<0||!Array.isArray(value.pages))throw new Error('Invalid employer descriptor');
 if(value.pages.some(p=>!record(p)||!safePath(p.path)||!Number.isInteger(p.count)||p.count<1||p.count>250||!Number.isInteger(p.bytes)||p.bytes<18||p.bytes>4*1024*1024||!Number.isInteger(p.uncompressedBytes)||p.uncompressedBytes<1||p.uncompressedBytes>8*1024*1024||!/^[a-f0-9]{64}$/.test(p.sha256)||!/^[a-f0-9]{64}$/.test(p.uncompressedSHA256)))throw new Error('Invalid employer page');
 if(value.pages.reduce((n,p)=>n+p.count,0)!==value.jobCount)throw new Error('Employer count differs from pages');
 return value;
}
async function digest(bytes){
 if(!globalThis.crypto?.subtle)return null;
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function decodeGzip(bytes,{expectedBytes,maxBytes=8*1024*1024}={}){
 const input=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(input[0]!==31||input[1]!==139||input[2]!==8)throw new Error('Invalid gzip page');
 let output;
 if(typeof globalThis.DecompressionStream==='function'){
  const reader=new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes)throw new Error('Vacancy page exceeds size limit');chunks.push(value);}}
  catch(error){await reader.cancel(error).catch(()=>{});throw error;}
  output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
 }else{
  // The static pack supplies exact output lengths; the fallback is bundled locally.
  const size=new DataView(input.buffer,input.byteOffset,input.byteLength).getUint32(input.length-4,true);
  if(size>maxBytes||expectedBytes!==undefined&&size!==expectedBytes)throw new Error('Invalid gzip output length');
  const {gunzipSync}=await import('fflate');output=gunzipSync(input);
 }
 if(output.length>maxBytes||expectedBytes!==undefined&&output.length!==expectedBytes)throw new Error('Vacancy page length mismatch');
 return output;
}
export function unpackVacancyPage(value,descriptor,page){
 if(!record(value)||value.schemaVersion!==2||value.employerId!==descriptor.employerId||JSON.stringify(value.columns)!==JSON.stringify(BANK_COLUMNS)||!Array.isArray(value.rows)||value.rows.length!==page.count)throw new Error('Invalid vacancy page');
 return value.rows.map(row=>{
  if(!Array.isArray(row)||row.length!==BANK_COLUMNS.length||typeof row[0]!=='string'||row[1]!==null&&typeof row[1]!=='string'||![true,false,null].includes(row[10]))throw new Error('Invalid vacancy row');
  const result=Object.fromEntries(BANK_COLUMNS.map((key,i)=>[key,row[i]]));
  if(result.sourceURL!==null){let url;try{url=new URL(result.sourceURL);}catch{throw new Error('Invalid vacancy source');}if(url.protocol!=='https:'||url.hostname!=='gossluzhba.gov.ru')throw new Error('Invalid vacancy source');}
  return result;
 });
}
export function vacancyBankStatus(row,now=new Date()){
 const state=String(row.state||'').toLowerCase();
 if(row.archive===true||/закрыт|архив|отмен[её]н|заверш[её]н/.test(state))return 'archived';
 const deadline=typeof row.expiresAt==='string'&&/^\d{4}-\d{2}-\d{2}/.test(row.expiresAt)?row.expiresAt.slice(0,10):null;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(deadline&&deadline<today)return 'expired';
 return row.archive===false?'source-active':'unknown';
}
export function createEmployerVacancyBank({baseURL='data/vacancies/bank/',fetchImpl=(...args)=>fetch(...args),maxEmployers=8,maxPages=12,maxConcurrent=2,timeout=20000,decompress=decodeGzip}={}){
 const entries=new Map(),pages=new Map(),inflight=new Map(),listeners=new Set(),queue=[];let active=0,disposed=false;
 const invalidState=input=>({authorityId:String(input||''),descriptor:null,rows:[],pageIndex:0,targetPage:0,loading:false,error:'invalid-employer',status:'error'});
 const notify=id=>{if(!disposed)for(const listener of listeners)listener(id);};
 function limited(fn,signal){return new Promise((resolve,reject)=>{
  const task={fn,resolve,reject,signal};
  const cancelled=()=>{const i=queue.indexOf(task);if(i>=0){queue.splice(i,1);reject(abortError());}};
  task.cleanup=()=>signal.removeEventListener('abort',cancelled);signal.addEventListener('abort',cancelled,{once:true});queue.push(task);pump();
 });}
 function pump(){while(active<maxConcurrent&&queue.length){const task=queue.shift();task.cleanup();if(task.signal.aborted){task.reject(abortError());continue;}active++;Promise.resolve().then(task.fn).then(task.resolve,task.reject).finally(()=>{active--;pump();});}}
 async function request(url,signal,asJSON){return limited(async()=>{
  const control=new AbortController(),abort=()=>control.abort(signal.reason||abortError());signal.addEventListener('abort',abort,{once:true});let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{control.abort();reject(new DOMException('Vacancy loading timed out','TimeoutError'));},timeout);});
  try{return await Promise.race([(async()=>{if(signal.aborted)throw abortError();const response=await fetchImpl(url,{cache:'no-store',signal:control.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);const value=asJSON?await response.json():new Uint8Array(await response.arrayBuffer());if(signal.aborted)throw abortError();return value;})(),deadline]);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
 },signal);}
 function touch(map,key,value){map.delete(key);map.set(key,value);}
 function entryFor(input){const id=platformEmployerId(input);let entry=entries.get(id);
  if(!entry){entry={id,descriptor:null,rows:[],loaded:false,pageIndex:0,targetPage:0,loading:false,error:null,generation:0,controller:null,promise:null};entries.set(id,entry);while(entries.size>maxEmployers){const first=entries.keys().next().value;entries.get(first).controller?.abort();entries.delete(first);}}
  else touch(entries,id,entry);return entry;
 }
 function snapshot(entry){return {authorityId:entry.id,descriptor:entry.descriptor,rows:entry.rows,pageIndex:entry.pageIndex,targetPage:entry.targetPage,loading:entry.loading,error:entry.error,status:entry.loading?'loading':entry.error?'error':entry.descriptor?'ready':'idle'};}
 function sharedPage(descriptor,page,signal){const key=descriptor.employerId+'|'+page.path;
  if(pages.has(key)){const value=pages.get(key);touch(pages,key,value);return Promise.resolve(value);}
  let job=inflight.get(key);
  if(job?.control.signal.aborted){inflight.delete(key);job=null;}
  if(!job){const control=new AbortController();job={control,consumers:new Set()};
   job.promise=(async()=>{const compressed=await request(baseURL+page.path,control.signal,false);if(compressed.length!==page.bytes)throw new Error('Vacancy page download length mismatch');const actual=await digest(compressed);if(actual&&actual!==page.sha256)throw new Error('Vacancy page checksum mismatch');const raw=await decompress(compressed,{expectedBytes:page.uncompressedBytes});if(control.signal.aborted)throw abortError();const decoded=await digest(raw);if(decoded&&decoded!==page.uncompressedSHA256)throw new Error('Decoded vacancy page checksum mismatch');const rows=unpackVacancyPage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),descriptor,page);touch(pages,key,rows);while(pages.size>maxPages)pages.delete(pages.keys().next().value);return rows;})();
   inflight.set(key,job);job.promise.finally(()=>{if(inflight.get(key)===job)inflight.delete(key);}).catch(()=>{});
  }
  return new Promise((resolve,reject)=>{const consumer={};job.consumers.add(consumer);let settled=false;
   const cleanup=()=>{job.consumers.delete(consumer);signal.removeEventListener('abort',cancel);};
   const cancel=()=>{if(settled)return;settled=true;cleanup();if(!job.consumers.size)job.control.abort();reject(abortError());};
   if(signal.aborted){cancel();return;}signal.addEventListener('abort',cancel,{once:true});job.promise.then(value=>{if(!settled){settled=true;cleanup();resolve(value);}},error=>{if(!settled){settled=true;cleanup();reject(error);}});
  });
 }
 function loadPage(input,index=0){if(disposed)return Promise.resolve(null);let entry;try{entry=entryFor(input);}catch{return Promise.resolve(invalidState(input));}
  if(entry.loading&&entry.targetPage===index)return entry.promise;
  entry.controller?.abort();const generation=++entry.generation,controller=new AbortController();entry.controller=controller;entry.targetPage=index;entry.loading=true;entry.error=null;notify(entry.id);
  entry.promise=(async()=>{try{
   let descriptor=entry.descriptor;
   if(!descriptor){const compressed=await request(baseURL+'employers/'+entry.id+'.json.gz',controller.signal,false);if(compressed.length>256*1024)throw new Error('Employer descriptor exceeds size limit');const raw=await decompress(compressed,{maxBytes:2*1024*1024});descriptor=validateDescriptor(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),entry.id);}
   if(controller.signal.aborted||generation!==entry.generation)return snapshot(entry);entry.descriptor=descriptor;
   if(index<0||index>=Math.max(1,descriptor.pages.length))throw new Error('Invalid vacancy page number');
   const rows=descriptor.pages.length?await sharedPage(descriptor,descriptor.pages[index],controller.signal):[];
   if(controller.signal.aborted||generation!==entry.generation)return snapshot(entry);entry.rows=rows;entry.loaded=true;entry.pageIndex=index;entry.error=null;
  }catch(error){if(generation===entry.generation&&error.name!=='AbortError')entry.error=error.name==='TimeoutError'?'timeout':'load-failed';}
  finally{if(generation===entry.generation){entry.loading=false;entry.controller=null;entry.promise=null;notify(entry.id);}}
  return snapshot(entry);})();return entry.promise;
 }
 return {get:input=>{try{return snapshot(entryFor(input));}catch{return invalidState(input);}},loadPage,ensure(input){let e;try{e=entryFor(input);}catch{return Promise.resolve(invalidState(input));}return e.descriptor&&e.loaded&&!e.error?Promise.resolve(snapshot(e)):loadPage(e.id,e.pageIndex);},retry:input=>{let e;try{e=entryFor(input);}catch{return Promise.resolve(invalidState(input));}return loadPage(e.id,e.targetPage);},cancel(input){let e;try{e=entries.get(platformEmployerId(input));}catch{return;}if(e){e.controller?.abort();e.generation++;e.loading=false;e.controller=null;e.promise=null;notify(e.id);}},subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},isBusy:()=>[...entries.values()].some(e=>e.loading),cacheInfo:()=>({employers:entries.size,pages:pages.size,pending:inflight.size,activeRequests:active}),dispose(){disposed=true;for(const e of entries.values())e.controller?.abort();for(const job of inflight.values())job.control.abort();listeners.clear();entries.clear();pages.clear();}};
}
