import {createHash} from 'node:crypto';

export const LIMITS=Object.freeze({events:12,packetBytes:16384,intervalMs:30000,page:20,scan:100,eventPage:50,exportPage:100});
export const EVENTS=new Set(['route','runtime-error','resource-error','unhandled-rejection','bootstrap-error','module-mount','module-unmount','operation','checkpoint','restore','delivery','access','asset-load','worker-error','document-load','document-search','document-jump','reader-state','update-state','session-open','session-close','visibility','module-load','module-ready','module-error','draft-save','result-save','cloud-sync','offline','online','storage-error','interaction']);
export const CODES=new Set(['ok','unknown','cancelled','target-missing','load-failed','timeout','offline','syntax','type','range','resource','promise','storage','network','limit','import-failed','failed','blocked','deferred','ready','conflict','permission','auth','not-found','invalid','quota','deleted','dropped']);
for(const value of ['marker-not-durable','release-not-verified','deadline','owner-or-route-changed','envelope-not-ready','rollback-unavailable','restore-timeout','storage-unavailable','storage-blocked','snapshot-oversize','snapshot-mismatch','cancelled','owner-changed','busy','checkpoint-unsupported','not-durable','revision-changed'])CODES.add('update/'+value);
for(const value of ['url-outside-scope','invalid-target','resource-unavailable','integrity','invalid-manifest','invalid-resource','pointer-unavailable','invalid-pointer','unknown-resource','not-prepared','transition-storage-unavailable','entry-import-failed','requested-build-unavailable','invalid-context','context-already-bound'])CODES.add('release/'+value);
for(const value of ['module-loading','inactive-or-restoring','unversioned','adapter-not-ready','context-changed','checkpoint-unconfirmed','unavailable','disposed','different-build','owner-not-ready','route-restoring','module-not-ready','owner-changed','interaction-active','owner-missing','saved','resume-owner-mismatch','restore-failed','resume-failed'])CODES.add(value);
export class DiagnosticError extends Error {constructor(code,status=400,fields={}){super(code);this.code=code;this.status=status;this.fields=fields;}}
export const fail=(code='invalid',status=400,fields)=>{throw new DiagnosticError(code,status,fields)};
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail();return value;}
export function identifier(value){if(typeof value!=='string'||!/^[a-zA-Z0-9-]{12,64}$/.test(value))fail();return value;}
export function token(value,max=64,empty=false){if(empty&&(value===undefined||value===''))return '';if(typeof value!=='string'||value.length>max||!/^[a-zA-Z0-9_.:-]+$/.test(value))fail();return value;}
export function number(value,max,min=0){if(!Number.isFinite(value)||value<min||value>max)fail();return value;}
const pick=(value,choices,fallback)=>{if(value===undefined)return fallback;if(!choices.includes(value))fail();return value;};
const version=value=>value==null||value===''?null:typeof value==='string'&&/^\d+(?:\.\d+){0,3}$/.test(value)&&value.length<=24?value:fail();
export function environment(value={}){
 fields(value,['browser','browserVersion','browserEngine','os','osVersion','osSource','width','height','screenWidth','screenHeight','dpr','input','model','modelSource','hardwareConcurrency','deviceMemory','connection','storageEstimate','displayMode','capabilities','visualViewport']);
 const result={browser:pick(value.browser,['unknown','edge','chrome','firefox','safari'],'unknown'),browserVersion:version(value.browserVersion),browserEngine:pick(value.browserEngine,['unknown','webkit','blink','gecko'],'unknown'),os:pick(value.os,['unknown','ios','android','windows','macos','linux'],'unknown'),osVersion:version(value.osVersion),osSource:pick(value.osSource,['ua-reported','ua-may-be-frozen','ua-ch'],'ua-reported'),input:pick(value.input,['touch','pointer','hybrid'],'pointer'),model:null,modelSource:'unavailable'};
 for(const key of ['width','height','screenWidth','screenHeight'])result[key]=number(value[key]??0,10000);
 result.dpr=number(value.dpr??1,10,0.1);
 if(value.model!=null&&value.model!==''){if(typeof value.model!=='string'||value.model.length>80||!/^[\p{L}\p{N} ._()+-]+$/u.test(value.model)||value.modelSource!=='ua-ch')fail();result.model=value.model;result.modelSource='ua-ch';}
 for(const [field,max] of [['hardwareConcurrency',256],['deviceMemory',1024]])result[field]=value[field]==null?null:number(value[field],max);
 result.displayMode=pick(value.displayMode,['browser','standalone','fullscreen','minimal-ui'],'browser');
 result.connection=null;if(value.connection!=null){fields(value.connection,['effectiveType','downlinkMbps','rttMs','saveData']);const c=value.connection;if(c.saveData!=null&&typeof c.saveData!=='boolean')fail();result.connection={effectiveType:pick(c.effectiveType,['slow-2g','2g','3g','4g','unknown',null],null),downlinkMbps:c.downlinkMbps==null?null:number(c.downlinkMbps,100000),rttMs:c.rttMs==null?null:number(c.rttMs,1000000),saveData:c.saveData??null};}
 result.storageEstimate=null;if(value.storageEstimate!=null){fields(value.storageEstimate,['quotaBytes','usageBytes']);result.storageEstimate={quotaBytes:value.storageEstimate.quotaBytes==null?null:number(value.storageEstimate.quotaBytes,1e15),usageBytes:value.storageEstimate.usageBytes==null?null:number(value.storageEstimate.usageBytes,1e15)};}
 result.visualViewport=null;if(value.visualViewport!=null){fields(value.visualViewport,['width','height','scale','offsetTop','offsetLeft']);result.visualViewport={};for(const field of ['width','height','scale','offsetTop','offsetLeft'])result.visualViewport[field]=number(value.visualViewport[field]??0,field==='scale'?100:1e6,field.startsWith('offset')?-1e6:0);}
 result.capabilities={};if(value.capabilities!=null){fields(value.capabilities,['serviceWorker','webWorker','indexedDB','cacheStorage','webGL','webGL2','canvas','wasm','pointerEvents','touchEvents','offscreenCanvas','resizeObserver','intersectionObserver','visualViewport']);for(const [field,enabled] of Object.entries(value.capabilities)){if(typeof enabled!=='boolean')fail();result.capabilities[field]=enabled;}}
 return result;
}
export function event(value){
 fields(value,['event','module','locale','at','docId','questionId','screenId','moduleVersion','durationMs','code','success','found','visible','units','cacheBytes','targetCount','operation','stage','severity','repeat','dropped','deduplicated','stack']);
 if(!EVENTS.has(value.event))fail();
 const result={event:value.event,module:token(value.module||'platform'),locale:pick(value.locale,['ru','en','zh'],'ru'),at:number(value.at??0,9999999999999),code:pick(value.code,[...CODES],value.success===true?'ok':'unknown')};
 for(const key of ['success','found','visible'])if(value[key]!==undefined){if(typeof value[key]!=='boolean')fail();result[key]=value[key];}
 for(const [key,max] of Object.entries({durationMs:3600000,units:200000,cacheBytes:100000000,targetCount:200000,repeat:1000,dropped:1000000,deduplicated:1000000}))if(value[key]!==undefined)result[key]=number(value[key],max);
 for(const key of ['docId','questionId','screenId','moduleVersion','operation','stage'])if(value[key]!==undefined)result[key]=token(value[key],['operation','stage'].includes(key)?48:64,true);
 if(value.severity!==undefined)result.severity=pick(value.severity,['info','warning','error']);
 if(value.stack!==undefined){if(!Array.isArray(value.stack)||value.stack.length>5)fail();result.stack=value.stack.map(frame=>{fields(frame,['file','line','column']);if(typeof frame.file!=='string'||frame.file.length>200||frame.file.includes('..')||!/^\/(?:assets|apps|_releases)\/[a-zA-Z0-9_./-]+$/.test(frame.file))fail();return {file:frame.file,line:number(frame.line??0,1e7),column:number(frame.column??0,1e7)};});}
 return result;
}
export function packet(value){
 fields(value,['action','sessionId','batchId','events','dropped','deduplicated']);
 if(Buffer.byteLength(JSON.stringify(value))>LIMITS.packetBytes)fail('limit',413);
 if(!Array.isArray(value.events)||value.events.length<1||value.events.length>LIMITS.events)fail();
 return {sessionId:identifier(value.sessionId),batchId:identifier(value.batchId),events:value.events.map(event),dropped:number(value.dropped??0,1e6),deduplicated:number(value.deduplicated??0,1e6)};
}
export const nameTokens=value=>[...new Set(String(value??'').normalize('NFKC').toLowerCase().replaceAll('ё','е').match(/[\p{L}\p{N}]+/gu)||[])].slice(0,12);
export const nameKey=value=>Buffer.from(value,'utf8').toString('hex');
export const isError=value=>value.severity==='error'||value.event.endsWith('-error')||value.event==='unhandled-rejection'||value.success===false&&!['cancelled','offline','deferred','blocked'].includes(value.code);
export const encodeCursor=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
export function decodeCursor(value){if(!value)return null;if(typeof value!=='string'||value.length>2048)fail();try{return JSON.parse(Buffer.from(value,'base64url').toString('utf8'));}catch{fail();}}
