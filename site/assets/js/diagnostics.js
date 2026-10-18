// Automatic technical diagnostics. Never pass answers, names, queries or raw errors to transport.
export const DIAGNOSTIC_LIMITS=Object.freeze({queue:256,queueBytes:256*1024,events:12,batchBytes:16*1024,interval:30000,stack:5});
export const DIAGNOSTIC_EVENTS=Object.freeze(['route','runtime-error','resource-error','unhandled-rejection','bootstrap-error','session-open','session-close','visibility','module-load','module-ready','module-error','module-mount','module-unmount','draft-save','result-save','cloud-sync','offline','online','storage-error','interaction','operation','checkpoint','restore','delivery','access','asset-load','worker-error','document-load','document-search','document-jump','reader-state','update-state']);
const EVENTS=new Set(DIAGNOSTIC_EVENTS);
const ERROR_EVENTS=new Set(['runtime-error','resource-error','unhandled-rejection','bootstrap-error','module-error','storage-error','worker-error']);
const ERROR_CLASSES=new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError','URIError','EvalError','AggregateError','DOMException','FirebaseError']);
const isErrorEvent=value=>value?.severity==='error'||ERROR_EVENTS.has(value?.event)||value?.success===false&&!['cancelled','offline','deferred','blocked'].includes(value.code);
const CODES=new Set(['ok','unknown','cancelled','target-missing','load-failed','timeout','offline','syntax','type','range','resource','promise','storage','network','limit','import-failed','failed','blocked','deferred','ready','conflict','permission','auth','not-found','invalid','quota','deleted','dropped']);
for(const code of ['marker-not-durable','release-not-verified','deadline','owner-or-route-changed','envelope-not-ready','rollback-unavailable','restore-timeout','storage-unavailable','storage-blocked','snapshot-oversize','snapshot-mismatch','cancelled','owner-changed','busy','checkpoint-unsupported','not-durable','revision-changed'])CODES.add('update/'+code);
for(const code of ['url-outside-scope','invalid-target','resource-unavailable','integrity','invalid-manifest','invalid-resource','pointer-unavailable','invalid-pointer','unknown-resource','not-prepared','transition-storage-unavailable','entry-import-failed','requested-build-unavailable','invalid-context','context-already-bound'])CODES.add('release/'+code);
for(const code of ['module-loading','inactive-or-restoring','unversioned','adapter-not-ready','context-changed','checkpoint-unconfirmed','unavailable','disposed','different-build','owner-not-ready','route-restoring','module-not-ready','owner-changed','interaction-active','owner-missing','saved','resume-owner-mismatch','restore-failed','resume-failed'])CODES.add(code);
const CODE_ALIASES=Object.freeze({'auth/network-request-failed':'network','auth/too-many-requests':'limit','auth/invalid-credential':'auth','auth/profile-changed':'cancelled','auth/user-not-found':'auth','auth/unauthorized-domain':'permission','database/permission-denied':'permission','network/timeout':'timeout','storage/unavailable':'storage','storage/quota-exceeded':'quota','checkpoint/not-durable':'storage'});
const safeCode=code=>CODES.has(code)?code:typeof code==='string'&&Object.hasOwn(CODE_ALIASES,code)?CODE_ALIASES[code]:null;
const token=(v,max=64)=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]+$/.test(v)?v.slice(0,max):'';
const integer=(v,max=1e7)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(max,Math.round(v))):0;
const version=v=>(String(v||'').match(/^\d+(?:[._]\d+){0,3}/)?.[0]||'').replaceAll('_','.').slice(0,24)||null;
const byteSize=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const uid=env=>env.crypto?.randomUUID?.()||globalThis.crypto?.randomUUID?.()||'d'+Math.random().toString(36).slice(2)+Date.now().toString(36);
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9-]{12,64}$/.test(v);
const safeRead=(storage,key)=>{try{return JSON.parse(storage?.getItem(key)||'null')}catch{return null}};
const safeWrite=(storage,key,value)=>{try{storage?.setItem(key,JSON.stringify(value));return true}catch{return false}};
const storage=(env,key)=>{try{return env[key]}catch{return null}};
const nullableNumber=(value,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(max,value):null;
function environmentCapabilities(env,nav){
 const connection=nav.connection||nav.mozConnection||nav.webkitConnection,v=env.visualViewport;
 let displayMode='browser';for(const mode of ['fullscreen','standalone','minimal-ui'])if(env.matchMedia?.('(display-mode: '+mode+')')?.matches){displayMode=mode;break}if(nav.standalone===true)displayMode='standalone';
 const capabilities={};for(const [key,exists] of Object.entries({serviceWorker:'serviceWorker' in nav,webWorker:typeof env.Worker==='function',indexedDB:Boolean(storage(env,'indexedDB')),cacheStorage:Boolean(storage(env,'caches')),webGL:typeof env.WebGLRenderingContext==='function',webGL2:typeof env.WebGL2RenderingContext==='function',canvas:typeof env.HTMLCanvasElement==='function',wasm:typeof env.WebAssembly==='object',pointerEvents:typeof env.PointerEvent==='function',touchEvents:'ontouchstart' in env,offscreenCanvas:typeof env.OffscreenCanvas==='function',resizeObserver:typeof env.ResizeObserver==='function',intersectionObserver:typeof env.IntersectionObserver==='function',visualViewport:Boolean(v)}))capabilities[key]=exists;
 return {hardwareConcurrency:nullableNumber(nav.hardwareConcurrency,256),deviceMemory:nullableNumber(nav.deviceMemory,1024),connection:connection?{effectiveType:['slow-2g','2g','3g','4g'].includes(connection.effectiveType)?connection.effectiveType:null,downlinkMbps:nullableNumber(connection.downlink,10000),rttMs:nullableNumber(connection.rtt,1e6),saveData:typeof connection.saveData==='boolean'?connection.saveData:null}:null,storageEstimate:null,displayMode,capabilities,visualViewport:v?{width:nullableNumber(v.width,10000),height:nullableNumber(v.height,10000),scale:nullableNumber(v.scale,100),offsetTop:nullableNumber(v.offsetTop,10000),offsetLeft:nullableNumber(v.offsetLeft,10000)}:null};
}

export function detectEnvironment(env=globalThis){
 const nav=env.navigator||{},ua=String(nav.userAgent||''),ios=/iPhone|iPad|iPod/.test(ua)||nav.platform==='MacIntel'&&nav.maxTouchPoints>1;
 let browser='unknown',browserVersion=null,os='unknown',osVersion=null;
 for(const [name,re] of [['edge',/Edg(?:A|iOS)?\/([\d.]+)/],['chrome',/(?:Chrome|CriOS)\/([\d.]+)/],['firefox',/(?:Firefox|FxiOS)\/([\d.]+)/],['safari',/Version\/([\d.]+).*Safari/]]){const m=ua.match(re);if(m){browser=name;browserVersion=version(m[1]);break}}
 if(ios){os='ios';osVersion=version(ua.match(/(?:CPU (?:iPhone )?OS|iPhone OS) ([\d_]+)/)?.[1])}
 else if(/Android/.test(ua)){os='android';osVersion=version(ua.match(/Android ([\d.]+)/)?.[1])}
 else if(/Windows/.test(ua)){os='windows';osVersion=version(ua.match(/Windows NT ([\d.]+)/)?.[1])}
 else if(/Mac OS X/.test(ua)){os='macos';osVersion=version(ua.match(/Mac OS X ([\d_]+)/)?.[1])}
 else if(/Linux/.test(ua))os='linux';
 return {browser,browserVersion,os,osVersion,osSource:ios?'ua-may-be-frozen':'ua-reported',model:null,modelSource:'unavailable',browserEngine:ios?'webkit':browser==='firefox'?'gecko':['chrome','edge'].includes(browser)?'blink':browser==='safari'?'webkit':'unknown',width:integer(env.innerWidth,10000),height:integer(env.innerHeight,10000),screenWidth:integer(env.screen?.width,10000),screenHeight:integer(env.screen?.height,10000),dpr:Math.min(10,Math.max(1,Number(env.devicePixelRatio)||1)),input:nav.maxTouchPoints>0?'touch':'pointer',...environmentCapabilities(env,nav)};
}
// Explicit browser-provided hints only. Never infer a model from screen, timing or hardware.
export async function detectEnvironmentHints(env=globalThis){
 const result=detectEnvironment(env);
 try{const hint=await env.navigator?.userAgentData?.getHighEntropyValues?.(['model','platformVersion']);if(hint){const model=typeof hint.model==='string'?hint.model.trim():'';if(model&&/^[\p{L}\p{N} ._()+-]{1,80}$/u.test(model)){result.model=model;result.modelSource='ua-ch'}if(version(hint.platformVersion)){result.osVersion=version(hint.platformVersion);result.osSource='ua-ch'}}}catch{}
 try{const estimate=await env.navigator?.storage?.estimate?.();if(estimate)result.storageEstimate={quotaBytes:nullableNumber(estimate.quota,1e15),usageBytes:nullableNumber(estimate.usage,1e15)}}catch{}
 return result;
}
export function sanitizeDiagnosticStack(error,env=globalThis){
 const raw=typeof error?.stack==='string'?error.stack.slice(0,16000):'';const base=env.location?.href||'https://invalid.local/';const origin=new URL(base).origin;const frames=[];
 for(const line of raw.split('\n').slice(0,30)){
  const m=line.match(/((?:https?:\/\/|\/)[^\s()]+?):(\d+):(\d+)\)?$/);if(!m)continue;
  try{const url=new URL(m[1],base),file=url.pathname.replace(/^.*?(?=\/(?:assets|apps|_releases)\/)/,'');if(url.origin!==origin||!/^\/(?:assets|apps|_releases)\/[a-zA-Z0-9_./-]+$/.test(file)||file.includes('..')||file.length>200||! /\.(?:m?js)$/.test(file))continue;frames.push({file,line:integer(Number(m[2])),column:integer(Number(m[3]))});if(frames.length===DIAGNOSTIC_LIMITS.stack)break}catch{}
 }
 return frames;
}
export function classifyDiagnosticError(error){
 if(safeCode(error?.code))return safeCode(error.code);
 if(error?.name==='SyntaxError')return 'syntax';if(error?.name==='TypeError')return 'type';if(error?.name==='RangeError')return 'range';if(error?.name==='QuotaExceededError')return 'storage';if(error?.name==='AbortError')return 'cancelled';return 'unknown';
}
export function diagnosticErrorClass(error){
 const name=error?.name;if(ERROR_CLASSES.has(name))return name;
 return ['AbortError','QuotaExceededError','SecurityError','NetworkError','NotAllowedError','InvalidStateError','DataCloneError','TimeoutError','NotFoundError','NotSupportedError','InvalidAccessError','OperationError'].includes(name)?'DOMException':undefined;
}
export function sanitizeDiagnosticEvent(event,fields={},context={}){
 if(!EVENTS.has(event))return null;
 const value={event,module:token(context.module)||'platform',locale:['ru','en','zh'].includes(context.locale)?context.locale:'ru',at:integer(context.at,9999999999999),code:safeCode(fields.code)||(fields.success===true?'ok':'unknown')};
 for(const name of ['docId','operation','stage','questionId','screenId','moduleVersion']){const max=['operation','stage'].includes(name)?48:64;if(token(fields[name],max))value[name]=token(fields[name],max)}
 for(const name of ['success','found','visible'])if(typeof fields[name]==='boolean')value[name]=fields[name];
 for(const [name,max] of [['durationMs',3600000],['units',200000],['cacheBytes',1e8],['targetCount',200000],['repeat',1000]])if(typeof fields[name]==='number')value[name]=integer(fields[name],max);
 if(['info','warning','error'].includes(fields.severity))value.severity=fields.severity;
 if(ERROR_CLASSES.has(fields.errorClass))value.errorClass=fields.errorClass;
 if(Array.isArray(fields.stack)){value.stack=fields.stack.filter(f=>f&&typeof f.file==='string'&&/^\/(?:assets|apps|_releases)\/[a-zA-Z0-9_./-]+$/.test(f.file)&&!f.file.includes('..')&&f.file.length<=200&&/\.(?:m?js)$/.test(f.file)).slice(0,5).map(f=>({file:f.file,line:integer(f.line),column:integer(f.column)}));if(!value.stack.length)delete value.stack}
 return value;
}
export function createPlatformDiagnostics({backend={},build='unknown',getLocale=()=> 'ru',getModule=()=> 'platform',env=globalThis,now=()=>backend.globalNow?.()||Date.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const local=storage(env,'localStorage'),tab=storage(env,'sessionStorage');
 let installationId=safeRead(local,'rudn.diagnostics.installation.v2');if(!validId(installationId)){installationId=uid(env);safeWrite(local,'rudn.diagnostics.installation.v2',installationId)}
 let tabId=safeRead(tab,'rudn.diagnostics.tab.v2');if(!validId(tabId)){tabId=uid(env);safeWrite(tab,'rudn.diagnostics.tab.v2',tabId)}
 const storageKey='rudn.diagnostics.queue.v2.'+tabId;
 let buckets=[],active=null,disposed=false,timer=null,sending=null,lastWrite=0,retryAt=0,environment=detectEnvironment(env),state='idle',droppedTotal=0,deduplicatedTotal=0,persistQueued=false,identityEpoch=0;
 const identity=()=>{const auth=backend.user?.uid||'',profile=backend.getProfile?.(),student=!backend.isAdmin?.()&&/^\d{5,20}$/.test(profile?.studentKey||'')?profile.studentKey:null;return {key:auth+'|'+(backend.isAdmin?.()?'teacher':student||'anonymous'),auth,studentKey:student}};
 const currentBuild=()=>token(env.__RUDN_RELEASE__?.buildId||build,80)||'unknown';
 // Exact release identity, not a guessed semantic module version.
 const moduleVersion=()=>/^[a-f0-9]{32}$/.test(env.__RUDN_RELEASE__?.buildId||'')?'build:'+env.__RUDN_RELEASE__.buildId:undefined;
 function createBucket(owner){return {owner,clientSessionId:uid(env),session:null,build:currentBuild(),environment:{...environment},queue:[],pending:null,dropped:0,deduplicated:0,createdAt:now()}}
 const allEvents=()=>buckets.reduce((n,b)=>n+b.queue.length+(b.pending?.events.length||0),0);
 const persist=()=>safeWrite(tab||local,storageKey,{schema:2,buckets,lastWrite,droppedTotal,deduplicatedTotal});
 const schedulePersist=()=>{if(persistQueued)return;persistQueued=true;Promise.resolve().then(()=>{persistQueued=false;if(!disposed)persist()}).catch(()=>{})};
 function trim(){
  // Pending batches are immutable for idempotent retry; evict only unsent events.
  while(allEvents()>DIAGNOSTIC_LIMITS.queue||byteSize(buckets)>DIAGNOSTIC_LIMITS.queueBytes){let candidate=null;for(const b of buckets)for(let index=0;index<b.queue.length;index++){const event=b.queue[index],error=isErrorEvent(event);if(!candidate||candidate.error&&!error||candidate.error===error&&event.at<candidate.event.at)candidate={b,index,event,error}}if(candidate){candidate.b.queue.splice(candidate.index,1);candidate.b.dropped++;droppedTotal++}else{const old=buckets.find(b=>b!==active&&b!==sending?.bucket);if(!old)break;const count=old.pending?.events.length||0;droppedTotal+=count;if(active){active.dropped+=count+old.dropped+(old.pending?.dropped||0);active.deduplicated+=old.deduplicated+(old.pending?.deduplicated||0)}buckets.splice(buckets.indexOf(old),1)}}
  buckets=buckets.filter(b=>{if(b===active||b===sending?.bucket||b.queue.length||b.pending)return true;if(active){active.dropped+=b.dropped;active.deduplicated+=b.deduplicated}return false});
 }
 function restore(){
  const saved=safeRead(tab||local,storageKey);if(saved?.schema!==2||!Array.isArray(saved.buckets)||byteSize(saved)>DIAGNOSTIC_LIMITS.queueBytes*2)return;
  for(const old of saved.buckets.slice(-32)){if(!validId(old.clientSessionId)||typeof old.owner?.key!=='string'||typeof old.owner.auth!=='string')continue;const studentKey=/^\d{5,20}$/.test(old.owner.studentKey||'')?old.owner.studentKey:null;if(old.owner.studentKey&&!studentKey)continue;
   const b=createBucket({key:old.owner.key,auth:old.owner.auth,studentKey});b.clientSessionId=old.clientSessionId;b.build=token(old.build,80)||'unknown';b.createdAt=integer(old.createdAt,9999999999999);b.dropped=integer(old.dropped,1e6);b.deduplicated=integer(old.deduplicated,1e6);b.queue=(old.queue||[]).map(e=>sanitizeDiagnosticEvent(e.event,e,e)).filter(Boolean).slice(-256);
   if(validId(old.session?.sessionId))b.session={sessionId:old.session.sessionId,subjectKey:token(old.session.subjectKey),generation:integer(old.session.generation,1e9),reportCode:token(old.session.reportCode)};
   if(validId(old.pending?.batchId)&&Array.isArray(old.pending.events)){const events=old.pending.events.map(e=>sanitizeDiagnosticEvent(e.event,e,e)).filter(Boolean).slice(0,12);const pending={batchId:old.pending.batchId,events,dropped:integer(old.pending.dropped,1e6),deduplicated:integer(old.pending.deduplicated,1e6)};if(events.length&&byteSize(pending)<DIAGNOSTIC_LIMITS.batchBytes-1024)b.pending=pending}
   buckets.push(b);
  }lastWrite=Math.min(now(),integer(saved.lastWrite,9999999999999));droppedTotal=integer(saved.droppedTotal,1e9);deduplicatedTotal=integer(saved.deduplicatedTotal,1e9);
 }
 function syncIdentity(){
  if(disposed)return;const owner=identity();if(active?.owner.key===owner.key&&active.build===currentBuild())return;
  identityEpoch++;const initial=active===null;active=(initial?[...buckets].reverse().find(b=>b.owner.key===owner.key&&b.build===currentBuild()):null)||createBucket(owner);if(!buckets.includes(active))buckets.push(active);if(!initial)active.queue.push(sanitizeDiagnosticEvent('session-open',{success:true,moduleVersion:moduleVersion()},{module:getModule(),locale:getLocale(),at:now()}));trim();persist();schedule();
 }
 function eligible(){const auth=backend.user?.uid;if(!auth)return null;return buckets.find(b=>(b.owner.auth===auth||!b.owner.auth&&!b.owner.studentKey)&&(b.queue.length||b.pending))||null}
 function schedule(){if(disposed||timer||sending||!eligible()||env.navigator?.onLine===false||env.document?.visibilityState==='hidden')return;const delay=Math.max(1000,retryAt-now(),lastWrite?lastWrite+DIAGNOSTIC_LIMITS.interval-now():DIAGNOSTIC_LIMITS.interval);timer=setTimer(()=>{timer=null;void flush()},delay)}
 function record(event,fields={},bound){
  try{if(disposed)return false;syncIdentity();const value=sanitizeDiagnosticEvent(event,{...fields,moduleVersion:bound?.moduleVersion||moduleVersion()},{module:bound?.module||getModule(),locale:bound?.locale||getLocale(),at:now()});if(!value)return false;
   const key=JSON.stringify({...value,at:0,repeat:0}),error=isErrorEvent(value),windowMs=error?30000:5000,previous=error?[...active.queue].reverse().find(e=>value.at-e.at<=windowMs&&JSON.stringify({...e,at:0,repeat:0})===key):active.queue.at(-1);if(previous&&value.at-previous.at<=windowMs&&JSON.stringify({...previous,at:0,repeat:0})===key){previous.repeat=Math.min(1000,(previous.repeat||1)+1);active.deduplicated++;deduplicatedTotal++}else active.queue.push(value);
   trim();schedulePersist();schedule();return true;
  }catch{return false}
 }
 async function request(action,payload,signal){if(typeof backend.diagnosticsRequest!=='function')throw Object.assign(new Error('unavailable'),{code:'diagnostics/unavailable'});return backend.diagnosticsRequest(action,payload,{signal})}
 async function flush(){
  if(disposed)return false;syncIdentity();if(sending||env.navigator?.onLine===false)return false;const bucket=eligible();if(!bucket)return false;if(now()<Math.max(retryAt,lastWrite?lastWrite+DIAGNOSTIC_LIMITS.interval:0)){schedule();return false}
  clearTimer(timer);timer=null;const controller=new AbortController(),flight={bucket,controller};sending=flight;state='sending';
  try{
   // Pre-auth events remain anonymous, but their first authenticated delivery
   // permanently owns the session and every idempotent retry, even after a lost ACK.
   if(!bucket.owner.auth){bucket.owner={...bucket.owner,auth:backend.user.uid,key:backend.user.uid+'|anonymous'};persist()}
   if(!bucket.session){const payload={clientSessionId:bucket.clientSessionId,installationId,build:bucket.build,environment:bucket.environment};if(bucket.owner.studentKey)payload.studentKey=bucket.owner.studentKey;const session=await request('openSession',payload,controller.signal);if(disposed)return false;bucket.session={sessionId:session.sessionId,subjectKey:session.subjectKey,generation:session.generation,reportCode:session.reportCode};persist()}
   if(!bucket.pending){const events=[];while(bucket.queue.length&&events.length<12){const next=bucket.queue[0];if(byteSize({sessionId:bucket.session.sessionId,batchId:uid(env),events:[...events,next],dropped:bucket.dropped,deduplicated:bucket.deduplicated})>DIAGNOSTIC_LIMITS.batchBytes-1024)break;events.push(bucket.queue.shift())}if(!events.length)return false;bucket.pending={batchId:uid(env),events,dropped:Math.min(1e6,bucket.dropped),deduplicated:Math.min(1e6,bucket.deduplicated)};bucket.dropped=0;bucket.deduplicated=0;persist()}
   const packet=bucket.pending;lastWrite=now();persist();await request('append',{sessionId:bucket.session.sessionId,...packet},controller.signal);if(disposed)return false;
   if(bucket.pending===packet)bucket.pending=null;retryAt=0;state='sent';trim();persist();return true;
  }catch(error){
   if(!disposed){const code=String(error?.code||'');state='queued';retryAt=now()+Math.max(DIAGNOSTIC_LIMITS.interval,integer(error?.retryAfterMs,300000));if(/deleted|tombstone|generation-conflict/.test(code)||bucket.session&&/(?:^|\/)not-found$/.test(code)){droppedTotal+=bucket.queue.length+(bucket.pending?.events.length||0);bucket.queue=[];bucket.pending=null;bucket.session=null;bucket.clientSessionId=uid(env);bucket.createdAt=now();state='discarded'}persist()}return false;
  }finally{if(sending===flight)sending=null;schedule()}
 }
 function bound(module=getModule(),options={}){
  syncIdentity();let ended=false;const owner=identity().key,epoch=identityEpoch,current=()=>{syncIdentity();return !ended&&!disposed&&identityEpoch===epoch&&identity().key===owner};const context={module:token(module)||'platform',locale:options.locale,moduleVersion:moduleVersion()};const api={record:(event,fields)=>current()&&record(event,fields,context),error:(error,fields={})=>current()&&record(fields.event||'module-error',{...fields,code:fields.code||classifyDiagnosticError(error),errorClass:diagnosticErrorClass(error),severity:'error',stack:sanitizeDiagnosticStack(error,env)},context),span:(operation,fields={})=>{const started=env.performance?.now?.()??now();let done=false;return(result={})=>{if(done||!current())return false;done=true;return record('operation',{...fields,...result,operation,durationMs:(env.performance?.now?.()??now())-started},context)}},destroy(){ended=true}};return api;
 }
 function globalContext(stack){for(const frame of stack){const app=frame.file.match(/\/apps\/(legal-lab|career|reception|settlements|governor)\//)?.[1];if(app)return {module:app};if(/\/assets\/js\/puzzle[^/]*\.(?:js|mjs)$/.test(frame.file))return {module:'maps'};if(/\/assets\/js\/(?:quiz|adaptive-quiz)\.js$/.test(frame.file))return {module:'quiz'}}return {module:'platform'}}
 const runtime=event=>{const stack=sanitizeDiagnosticStack(event.error||{stack:typeof event.filename==='string'?event.filename+':'+integer(event.lineno)+':'+integer(event.colno):''},env);record(event.error?'runtime-error':'resource-error',{code:event.error?classifyDiagnosticError(event.error):'resource',errorClass:diagnosticErrorClass(event.error),severity:'error',stack},globalContext(stack))};
 const rejection=event=>{const stack=sanitizeDiagnosticStack(event.reason,env);record('unhandled-rejection',{code:classifyDiagnosticError(event.reason),errorClass:diagnosticErrorClass(event.reason),severity:'error',stack},globalContext(stack))};
 const visibility=()=>{record('visibility',{stage:env.document?.visibilityState==='hidden'?'hidden':'visible'});if(env.document?.visibilityState==='hidden'){clearTimer(timer);timer=null;void flush()}else schedule()};
 const online=()=>{record('online',{success:true});schedule()},offline=()=>record('offline',{code:'offline'});
 restore();syncIdentity();
 const bootstrap=env.__RUDN_DIAGNOSTICS_BOOTSTRAP__;let bootstrapBucket=null;
 bootstrap?.drain?.((event,fields)=>{const value=sanitizeDiagnosticEvent(event,fields,{module:'bootstrap',locale:getLocale(),at:now()});if(!value)return;if(!bootstrapBucket){bootstrapBucket=createBucket({key:'|anonymous',auth:'',studentKey:null});buckets.unshift(bootstrapBucket)}bootstrapBucket.queue.push(value)});bootstrap?.dispose?.();trim();persist();
 env.addEventListener?.('error',runtime,true);env.addEventListener?.('unhandledrejection',rejection);env.addEventListener?.('online',online);env.addEventListener?.('offline',offline);env.addEventListener?.('rudn:identitychange',syncIdentity);env.addEventListener?.('rudn:release-context',syncIdentity);env.document?.addEventListener?.('visibilitychange',visibility);
 const unsubscribe=backend.onStatus?.(()=>{syncIdentity();schedule()});
 void detectEnvironmentHints(env).then(value=>{if(disposed)return;environment=value;for(const b of buckets)if(!b.session)b.environment={...value};persist()}).catch(()=>{});
 record('session-open',{success:true});
 try{Promise.resolve(backend.ensureDiagnosticIdentity?.()).then(()=>{if(!disposed){syncIdentity();schedule()}}).catch(()=>{})}catch{}
 return {record,flush,syncIdentity,forModule:bound,error:(error,fields)=>bound(getModule()).error(error,fields),span:(operation,fields)=>bound(getModule()).span(operation,fields),status:()=>({state,queued:allEvents(),bytes:byteSize(buckets),dropped:droppedTotal,deduplicated:deduplicatedTotal,code:active?.session?.reportCode||null,authenticated:Boolean(backend.user?.uid)}),destroy(){if(disposed)return;persist();disposed=true;sending?.controller.abort();clearTimer(timer);unsubscribe?.();env.removeEventListener?.('error',runtime,true);env.removeEventListener?.('unhandledrejection',rejection);env.removeEventListener?.('online',online);env.removeEventListener?.('offline',offline);env.removeEventListener?.('rudn:identitychange',syncIdentity);env.removeEventListener?.('rudn:release-context',syncIdentity);env.document?.removeEventListener?.('visibilitychange',visibility);buckets=[];active=null;}};
}
export function getSharedPlatformDiagnostics(options={}){
 const env=options.env||globalThis;if(env.__RUDN_DIAGNOSTICS__?.forModule)return env.__RUDN_DIAGNOSTICS__;
 const service=createPlatformDiagnostics(options),destroy=service.destroy;service.destroy=()=>{destroy();if(env.__RUDN_DIAGNOSTICS__===service)delete env.__RUDN_DIAGNOSTICS__};env.__RUDN_DIAGNOSTICS__=service;return service;
}
