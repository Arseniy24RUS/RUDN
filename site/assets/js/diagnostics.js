// Deliberately small, allowlisted telemetry. No raw URLs, exceptions, answers or profiles.
export const DIAGNOSTIC_LIMITS=Object.freeze({sessions:4,batches:8,events:12,queue:48,interval:30000,retention:30*86400000});
const EVENTS=new Set(['route','runtime-error','resource-error','unhandled-rejection','document-load','document-search','document-jump','reader-state','report']);
const CODES=new Set(['ok','unknown','cancelled','target-missing','load-failed','timeout','offline','syntax','type','range','resource','promise','storage','network','limit']);
const token=(v,max=64)=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]+$/.test(v)?v.slice(0,max):'';
const integer=(v,max)=>Number.isFinite(Number(v))?Math.max(0,Math.min(max,Math.round(Number(v)))):0;
const shortVersion=v=>(String(v||'').match(/^\d+(?:[._]\d+){0,3}/)?.[0]||'').replaceAll('_','.').slice(0,24);
const id=()=>globalThis.crypto?.randomUUID?.().replaceAll('-','')||Math.random().toString(36).slice(2)+Date.now().toString(36);

export function detectEnvironment(env=globalThis){
  const nav=env.navigator||{},ua=String(nav.userAgent||''),ios=/iPhone|iPad|iPod/.test(ua)||nav.platform==='MacIntel'&&nav.maxTouchPoints>1;
  let browser='unknown',browserVersion='',os='unknown',osVersion='';
  for(const [name,re] of [['edge',/Edg(?:A|iOS)?\/([\d.]+)/],['chrome',/(?:Chrome|CriOS)\/([\d.]+)/],['firefox',/(?:Firefox|FxiOS)\/([\d.]+)/],['safari',/Version\/([\d.]+).*Safari/]]){const m=ua.match(re);if(m){browser=name;browserVersion=shortVersion(m[1]);break}}
  if(ios){os='ios';osVersion=shortVersion(ua.match(/(?:CPU (?:iPhone )?OS|iPhone OS) ([\d_]+)/)?.[1])}
  else if(/Android/.test(ua)){os='android';osVersion=shortVersion(ua.match(/Android ([\d.]+)/)?.[1])}
  else if(/Windows/.test(ua)){os='windows';osVersion=shortVersion(ua.match(/Windows NT ([\d.]+)/)?.[1])}
  else if(/Mac OS X/.test(ua)){os='macos';osVersion=shortVersion(ua.match(/Mac OS X ([\d_]+)/)?.[1])}
  else if(/Linux/.test(ua))os='linux';
  return {browser,browserVersion,os,osVersion,osSource:ios?'ua-may-be-frozen':'ua-reported',width:integer(env.innerWidth,10000),height:integer(env.innerHeight,10000),screenWidth:integer(env.screen?.width,10000),screenHeight:integer(env.screen?.height,10000),dpr:Math.min(10,Math.max(1,Number(env.devicePixelRatio)||1)),input:nav.maxTouchPoints>0?'touch':'pointer'};
}
export function sanitizeDiagnosticEvent(event,fields={},context={}){
  if(!EVENTS.has(event))return null;
  return {event,module:token(context.module)||'platform',locale:['ru','en','zh'].includes(context.locale)?context.locale:'ru',at:integer(context.at,9999999999999),docId:token(fields.docId),durationMs:integer(fields.durationMs,3600000),code:CODES.has(fields.code)?fields.code:fields.success===true?'ok':'unknown',success:fields.success===true,found:fields.found===true,visible:fields.visible===true,units:integer(fields.units,200000),cacheBytes:integer(fields.cacheBytes,100000000),targetCount:integer(fields.targetCount,200000)};
}
export function classifyDiagnosticError(error){
  // Names are only compared to constants, never transmitted verbatim.
  if(error?.name==='SyntaxError')return 'syntax';if(error?.name==='TypeError')return 'type';if(error?.name==='RangeError')return 'range';
  if(error?.name==='QuotaExceededError')return 'storage';if(error?.name==='AbortError')return 'cancelled';return 'unknown';
}
export function sanitizeSelfReport({model='',os=''}={}){
  return {model:String(model).replace(/[^\p{L}\p{N} ._()+-]/gu,'').trim().slice(0,60),os:String(os).replace(/[^a-zA-Z0-9 ._()+-]/g,'').trim().slice(0,40)};
}
function restoreBatch(value,sessionId,stamp){
  if(value?.schema!==1||value.sessionId!==sessionId||!/^[a-z0-9]{12,40}$/.test(value.batchId)||!Number.isFinite(value.createdAt)||value.createdAt>stamp+120000||value.expiresAt!==value.createdAt+DIAGNOSTIC_LIMITS.retention||value.expiresAt<=stamp)return null;
  const e=value.environment||{},pick=(key,choices)=>choices.includes(e[key])?e[key]:choices[0];
  const environment={browser:pick('browser',['unknown','edge','chrome','firefox','safari']),browserVersion:shortVersion(e.browserVersion),os:pick('os',['unknown','ios','android','windows','macos','linux']),osVersion:shortVersion(e.osVersion),osSource:pick('osSource',['ua-reported','ua-may-be-frozen']),width:integer(e.width,10000),height:integer(e.height,10000),screenWidth:integer(e.screenWidth,10000),screenHeight:integer(e.screenHeight,10000),dpr:Math.min(10,Math.max(1,Number(e.dpr)||1)),input:pick('input',['touch','pointer'])};
  const events=Object.fromEntries(Object.entries(value.events||{}).filter(([key])=>/^e([0-9]|1[01])$/.test(key)).map(([key,event])=>[key,sanitizeDiagnosticEvent(event.event,event,event)]).filter(([,event])=>event&&event.at>stamp-DIAGNOSTIC_LIMITS.retention));
  if(!Object.keys(events).length)return null;
  return {schema:1,batchId:value.batchId,sessionId,reportCode:sessionId.slice(0,12).toUpperCase(),build:token(value.build,80)||'unknown',createdAt:value.createdAt,expiresAt:value.expiresAt,environment,selfReport:sanitizeSelfReport(value.selfReport),events};
}
export function createPlatformDiagnostics({backend,build='unknown',getLocale=()=> 'ru',getModule=()=> 'platform',env=globalThis,now=()=>backend.globalNow?.()||Date.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let identity='',generation=0,sessionId='',slot=0,batch=0,queue=[],pending=null,pendingLocation=null,timer=null,lastWrite=0,disposed=false,reportInfo={model:'',os:''},sendState='idle',abort=null;
  const sessionStorage=()=>{try{return env.sessionStorage}catch{return null}};
  const storageKey='rudn.diagnostics.pending.v1';
  const currentIdentity=()=>backend.user?.uid&&(backend.isAdmin?.()||backend.getProfile?.())?backend.user.uid+':'+backend.generation:'';
  const savePending=()=>{try{if(identity)sessionStorage()?.setItem(storageKey,JSON.stringify({identity,sessionId,slot,batch,queue,pending,pendingLocation,reportInfo,lastWrite}));else sessionStorage()?.removeItem(storageKey)}catch{}};
  function syncIdentity(){
    const next=currentIdentity();if(next===identity)return;
    abort?.abort();abort=null;clearTimer(timer);timer=null;generation++;identity=next;queue=[];pending=null;pendingLocation=null;lastWrite=0;batch=0;reportInfo={model:'',os:''};sendState='idle';sessionId=id();slot=parseInt(sessionId.slice(0,6),16)%4;if(!Number.isInteger(slot))slot=0;
    if(next){try{const old=JSON.parse(sessionStorage()?.getItem(storageKey)||'null');if(old?.identity===next&&/^[a-z0-9]{12,40}$/.test(old.sessionId)&&Number.isInteger(old.slot)&&old.slot>=0&&old.slot<4&&Number.isInteger(old.batch)&&old.batch>=0&&old.batch<8){sessionId=old.sessionId;slot=old.slot;batch=old.batch;reportInfo=sanitizeSelfReport(old.reportInfo);pending=restoreBatch(old.pending,sessionId,now());if(pending&&/^s[0-3]$/.test(old.pendingLocation?.slot)&&/^b[0-7]$/.test(old.pendingLocation?.batch))pendingLocation={slot:old.pendingLocation.slot,batch:old.pendingLocation.batch};queue=(old.queue||[]).map(e=>sanitizeDiagnosticEvent(e.event,e,e)).filter(Boolean).slice(-(DIAGNOSTIC_LIMITS.queue-(pending?Object.keys(pending.events).length:0)));lastWrite=Math.min(now(),Number(old.lastWrite)||0)}}catch{}}
    savePending();schedule();
  }
  function schedule(){if(disposed||timer||!identity||(!queue.length&&!pending)||env.navigator?.onLine===false||env.document?.visibilityState==='hidden')return;timer=setTimer(()=>{timer=null;void flush()},Math.max(1000,lastWrite+DIAGNOSTIC_LIMITS.interval-now()));}
  function record(event,fields={}){try{syncIdentity();if(!identity||disposed)return false;const value=sanitizeDiagnosticEvent(event,fields,{module:getModule(),locale:getLocale(),at:now()});if(!value)return false;queue.push(value);if(queue.length+(pending?Object.keys(pending.events).length:0)>DIAGNOSTIC_LIMITS.queue)queue.shift();savePending();schedule();return true}catch{return false}}
  async function flush(){
    syncIdentity();if(disposed||!identity||env.navigator?.onLine===false||(!pending&&!queue.length))return false;
    if(abort)return false;if(lastWrite&&now()-lastWrite<DIAGNOSTIC_LIMITS.interval){schedule();return false}
    const activeGeneration=generation,uid=backend.user.uid;
    queue=queue.filter(e=>e.at>now()-DIAGNOSTIC_LIMITS.retention);if(pending?.expiresAt<=now()){pending=null;pendingLocation=null}if(!pending&&!queue.length){savePending();return false}
    if(!pending){const createdAt=now();pending={schema:1,batchId:id(),sessionId,reportCode:sessionId.slice(0,12).toUpperCase(),build:token(build,80)||'unknown',createdAt,expiresAt:createdAt+DIAGNOSTIC_LIMITS.retention,environment:detectEnvironment(env),selfReport:{...reportInfo},events:Object.fromEntries(queue.splice(0,DIAGNOSTIC_LIMITS.events).map((e,i)=>['e'+i,e]))};savePending()}
    abort=new AbortController();sendState='sending';lastWrite=now();const sending=pending;
    try{const alreadySent=pendingLocation&&await backend.confirmDiagnosticBatch?.(uid,pendingLocation.slot,pendingLocation.batch,sending,{signal:abort.signal});if(activeGeneration!==generation)return false;if(!alreadySent){const claimed=await backend.claimDiagnosticSession(uid,sessionId,slot,{signal:abort.signal});if(activeGeneration!==generation)return false;if(claimed===null){sendState='queued';savePending();return false}slot=claimed;pendingLocation={slot:'s'+slot,batch:'b'+batch};savePending();await backend.writeDiagnosticBatch(uid,pendingLocation.slot,pendingLocation.batch,sending,{signal:abort.signal})}if(activeGeneration!==generation)return false;pending=null;pendingLocation=null;batch=(batch+1)%8;sendState='sent';savePending();return true}
    catch{if(activeGeneration===generation){sendState='queued';savePending()}return false}
    finally{if(activeGeneration===generation){abort=null;schedule()}}
  }
  async function report(value={}){syncIdentity();reportInfo=sanitizeSelfReport(value);record('report',{success:true,code:'ok'});savePending();const delivered=await flush();return {code:sessionId.slice(0,12).toUpperCase(),status:!identity?'unavailable':delivered&&!pending&&!queue.some(e=>e.event==='report')?'sent':'queued'};}
  const visibility=()=>{if(env.document?.visibilityState==='hidden'){clearTimer(timer);timer=null;void flush()}else schedule()};
  const online=()=>{syncIdentity();schedule()};
  const runtime=event=>record(event.error?'runtime-error':'resource-error',{code:event.error?classifyDiagnosticError(event.error):'resource'});
  const rejection=event=>record('unhandled-rejection',{code:classifyDiagnosticError(event.reason)});
  env.addEventListener?.('error',runtime,true);env.addEventListener?.('unhandledrejection',rejection);env.addEventListener?.('online',online);env.addEventListener?.('rudn:identitychange',syncIdentity);env.document?.addEventListener?.('visibilitychange',visibility);
  const unsubscribe=backend.onStatus?.(()=>{syncIdentity();schedule()});syncIdentity();
  return {record,flush,report,syncIdentity,status:()=>({state:sendState,queued:queue.length+(pending?Object.keys(pending.events).length:0),code:sessionId.slice(0,12).toUpperCase(),authenticated:Boolean(identity)}),destroy(){disposed=true;abort?.abort();clearTimer(timer);unsubscribe?.();env.removeEventListener?.('error',runtime,true);env.removeEventListener?.('unhandledrejection',rejection);env.removeEventListener?.('online',online);env.removeEventListener?.('rudn:identitychange',syncIdentity);env.document?.removeEventListener?.('visibilitychange',visibility);}};
}
