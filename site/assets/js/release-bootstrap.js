import {getReleaseContext,setReleaseContext,resourceURL} from './release-resources.js';
export {getReleaseContext,resourceURL};
const SCHEMA=1, HEX=/^[a-f0-9]{64}$/;
const RESUME_KEY='rudn.release.transition.v1';
const receipts=new Map();
const manifestBytes=new Map();
let bootTimer=null,bootSettled=false;
function stopBootWatchdog(){bootSettled=true;clearTimeout(bootTimer);bootTimer=null;}
export function markReleaseRestored(){stopBootWatchdog();}
function pendingTransition(){try{const session=JSON.parse(sessionStorage.getItem('rudn.update.pending.v1')||'null');if(session)return session;const token=new URL(location.href).searchParams.get('rudnResume');if(token&&/^[a-zA-Z0-9_-]{1,128}$/.test(token))return JSON.parse(localStorage.getItem('rudn.update.pending.v1:'+token)||'null');}catch{}return null;}
async function bootFailed(code){
  if(bootSettled)return;stopBootWatchdog();
  const event=new CustomEvent('rudn:release-boot-failed',{cancelable:true,detail:{code}});
  if(globalThis.dispatchEvent?.(event)===false)return;
  const pending=pendingTransition();
  if(!pending||pending.targetBuild!==document.documentElement.dataset.releaseBuild||pending.phase==='rollback'||!pending.previous)return;
  try{
    validateTarget(pending.previous);pending.phase='rollback';pending.bootFailure=code;pending.rollbackAttempted=true;
    sessionStorage.setItem('rudn.update.pending.v1',JSON.stringify(pending));if(pending.token)localStorage.setItem('rudn.update.pending.v1:'+pending.token,JSON.stringify(pending));
    await prepareRelease(pending.previous);activatePreparedRelease(pending.previous,{resumeToken:pending.token});
  }catch{mark('rollback-unavailable','runtime-import');}
}
const ownURL=new URL(import.meta.url);
export const siteRoot=new URL(ownURL.pathname.includes('/_releases/')?ownURL.pathname.split('/_releases/')[0]+'/':'../../',ownURL).href;
const failure=code=>Object.assign(new Error(code),{code});
function validateContracts(value){
  const version=n=>Number.isSafeInteger(n)&&n>0&&n<=65535;
  if(!value||value.schema!==1||Object.keys(value).sort().join(',')!=='adapterSnapshot,durableStore,modules,schema,updateEnvelope'||!['updateEnvelope','adapterSnapshot','durableStore'].every(key=>version(value[key]))||!value.modules||Array.isArray(value.modules))throw failure('release/invalid-contracts');
  const entries=Object.entries(value.modules);if(entries.length>32||!['platform','quiz','form','maps','legal-lab','career','reception','settlements','governor'].every(key=>version(value.modules[key]))||!entries.every(([key,v])=>/^[a-z][a-z0-9-]{0,31}$/.test(key)&&version(v)))throw failure('release/invalid-contracts');
  return value;
}
const abort=signal=>signal?.throwIfAborted();
async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function inside(value){const u=new URL(value,siteRoot),root=new URL(siteRoot);if(u.origin!==root.origin||!u.pathname.startsWith(root.pathname))throw failure('release/url-outside-scope');return u;}
function validateTarget(target){if(!target||!/^[a-f0-9]{32}$/.test(target.buildId||'')||!HEX.test(target.manifestSha256||''))throw failure('release/invalid-target');const runtime=new URL(`_releases/${target.buildId}/`,siteRoot);if(inside(target.manifestURL).href!==new URL('manifest.json',runtime).href||!inside(target.entryURL).pathname.startsWith(runtime.pathname))throw failure('release/invalid-target-path');return target;}
async function verified(url,sha256,{signal}={}){
  abort(signal);const response=await fetch(inside(url),{cache:'reload',credentials:'same-origin',signal});
  if(!response.ok)throw failure('release/resource-unavailable');const bytes=await response.arrayBuffer();abort(signal);
  if(await hash(bytes)!==sha256)throw failure('release/integrity');abort(signal);
  return {bytes,response:new Response(bytes,{status:200,headers:response.headers})};
}
async function readManifest(target,{signal}={}){
  validateTarget(target);const {bytes}=await verified(target.manifestURL,target.manifestSha256,{signal});
  const manifest=JSON.parse(new TextDecoder().decode(bytes));
  if(manifest.schema!==SCHEMA||manifest.buildId!==target.buildId||!manifest.resources||!manifest.packs?.shell)throw failure('release/invalid-manifest');
  validateContracts(manifest.contracts);if(!manifest.resources['data/platform-contracts.json'])throw failure('release/contracts-missing');
  const exactRoot=new URL(`_releases/${target.buildId}/`,siteRoot);if(inside(manifest.runtimeRoot).href!==exactRoot.href)throw failure('release/invalid-runtime-root');
  for(const [path,item] of Object.entries(manifest.resources)){
    if(path.startsWith('/')||path.includes('..')||!HEX.test(item.sha256||'')||!Number.isSafeInteger(item.bytes)||item.bytes<0)throw failure('release/invalid-resource');const url=inside(item.url);if(item.kind==='runtime'&&!url.pathname.startsWith(exactRoot.pathname))throw failure('release/mutable-runtime');
  }
  manifestBytes.set(target.buildId,bytes);while(manifestBytes.size>2)manifestBytes.delete(manifestBytes.keys().next().value);
  return {...manifest,siteRoot,runtimeRoot:new URL(manifest.runtimeRoot,siteRoot).href,manifestURL:new URL(target.manifestURL,siteRoot).href,manifestSha256:target.manifestSha256,entryURL:new URL(target.entryURL,siteRoot).href};
}
export async function checkRelease({signal}={}){
  const response=await fetch(new URL('release.json',siteRoot),{cache:'no-store',credentials:'same-origin',signal});
  if(!response.ok)throw failure('release/pointer-unavailable');const pointer=await response.json();abort(signal);
  if(pointer.schema!==SCHEMA)throw failure('release/invalid-pointer');validateTarget(pointer.current);if(pointer.previous)validateTarget(pointer.previous);
  return {...pointer.current,previous:pointer.previous||null};
}
export async function prepareRelease(target,{module,resources=[],signal}={}){
  const context=await readManifest(target,{signal});
  const names=[...new Set([...context.packs.shell,...(context.packs[module]||[]),...resources])];
  if(names.some(path=>!context.resources[path]))throw failure('release/unknown-resource');
  let cache=null;try{cache=await globalThis.caches?.open(`rudn-gmu-pages:${encodeURIComponent(siteRoot)}:release-${context.buildId}`);}catch{}
  const queue=[...names],verifiedNames=[];
  await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{while(queue.length){
    abort(signal);const path=queue.shift(),item=context.resources[path],url=inside(item.url);let good=false;
    if(cache){const cached=await cache.match(url);if(cached){try{good=await hash(await cached.arrayBuffer())===item.sha256;}catch{}}}
    if(!good){const result=await verified(url,item.sha256,{signal});if(cache){try{await cache.put(url,result.response);}catch{cache=null;}}}
    verifiedNames.push(path);
  }}));
  abort(signal);
  if(cache){try{await cache.put(new URL(context.manifestURL),new Response(manifestBytes.get(context.buildId),{headers:{'content-type':'application/json'}}));await cache.put(new URL(`_releases/${context.buildId}/release.json`,siteRoot),new Response(JSON.stringify({buildId:target.buildId,manifestURL:target.manifestURL,manifestSha256:target.manifestSha256,entryURL:target.entryURL}),{headers:{'content-type':'application/json'}}));}catch{cache=null;}}
  abort(signal);
  const receipt=Object.freeze({buildId:context.buildId,module:module||null,ready:true,durable:Boolean(cache),resources:Object.freeze(verifiedNames.sort()),context,target:{...target}});
  receipts.set(context.buildId,receipt);
  while(receipts.size>2)receipts.delete(receipts.keys().next().value);
  globalThis.dispatchEvent?.(new CustomEvent('rudn:release-prepared',{detail:{buildId:context.buildId,module:module||null,durable:receipt.durable}}));
  return receipt;
}
export function activatePreparedRelease(target,{resumeToken}={}){
  validateTarget(target);const receipt=receipts.get(target.buildId);if(!receipt?.ready)throw failure('release/not-prepared');
  const marker={schema:1,buildId:target.buildId,manifestURL:target.manifestURL,manifestSha256:target.manifestSha256,entryURL:target.entryURL,resumeToken:typeof resumeToken==='string'?resumeToken:null,createdAt:Date.now()};
  try{sessionStorage.setItem(RESUME_KEY,JSON.stringify(marker));}catch{throw failure('release/transition-storage-unavailable');}
  const context=getReleaseContext(),current=context&&new URL(location.href).pathname;
  const logical=current?.startsWith(new URL(context.runtimeRoot).pathname)?current.slice(new URL(context.runtimeRoot).pathname.length):'index.html';
  const alternative=receipt.context.resources[logical];
  const url=inside(alternative?.kind==='runtime'&&logical.endsWith('.html')?alternative.url:target.entryURL);url.search=location.search;url.hash=location.hash;if(resumeToken){if(!/^[a-zA-Z0-9_-]{1,128}$/.test(resumeToken))throw failure('release/invalid-resume-token');url.searchParams.set('rudnResume',resumeToken);}location.replace(url.href);
}
export const rollbackRelease=activatePreparedRelease;
function mark(code,stage){globalThis.__RUDN_DIAGNOSTICS_BOOTSTRAP__?.record('bootstrap-error',{code,stage});}
async function executePlan(context){
  const planNode=document.getElementById('platform-entry-scripts');
  const plan=planNode?JSON.parse(planNode.textContent):[{type:'module',src:new URL('assets/js/main.js',context.runtimeRoot).href}];
  for(const entry of plan){
    if(entry.type==='module'&&entry.src){await import(inside(entry.src).href);continue;}
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');if(entry.type)script.type=entry.type;
      if(entry.src){script.src=inside(entry.src).href;script.onload=resolve;script.onerror=()=>reject(failure('release/entry-import-failed'));}
      else script.textContent=entry.text||'';
      document.body.append(script);if(!entry.src)resolve();
    });
  }
  document.dispatchEvent(new CustomEvent('rudn:release-entry-ready',{detail:{buildId:context.buildId}}));
}
export async function bootRelease(){
  const expected=document.documentElement.dataset.releaseBuild;
  if(!expected){
    // Source checkout/test fixtures are not a staged release and retain their URL contract.
    await import(new URL('assets/js/main.js?v=1.3.10',siteRoot).href);return;
  }
  const pending=pendingTransition();
  if(pending&&pending.targetBuild===expected&&pending.phase!=='rollback')bootTimer=setTimeout(()=>void bootFailed('restore-timeout'),45000);
  globalThis.addEventListener?.('rudn:update-restored',markReleaseRestored,{once:true});
  globalThis.addEventListener?.('rudn:update-recovery-dismissed',stopBootWatchdog,{once:true});
  let target;
  const descriptor=await fetch(new URL(`_releases/${expected}/release.json`,siteRoot),{cache:'reload',credentials:'same-origin'});
  if(descriptor.ok)target=await descriptor.json();
  if(!target||target.buildId!==expected)throw failure('release/requested-build-unavailable');
  const context=setReleaseContext(await readManifest(target));
  try{sessionStorage.setItem('rudn.release.last-ready.v1',JSON.stringify(target));}catch{}
  const workers=navigator.serviceWorker;
  const announce=()=>workers?.controller?.postMessage({type:'BIND_BUILD',buildId:context.buildId,manifestURL:context.manifestURL,manifestSha256:context.manifestSha256});
  workers?.addEventListener('controllerchange',announce);announce();
  if(workers)void workers.register(new URL('service-worker.js',siteRoot),{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{});
  await executePlan(context);
}
if(typeof document!=='undefined'&&[...document.querySelectorAll('script[data-platform-bootstrap]')].some(script=>script.src===import.meta.url)){
  void bootRelease().catch(error=>{
    mark(error?.code||'import-failed','runtime-import');
    void bootFailed(error?.code||'import-failed');
    if(!pendingTransition())void globalThis.__RUDN_RELEASE_RECOVERY__?.recover('runtime-unavailable');
    const root=document.getElementById('app');if(root){root.setAttribute('aria-busy','false');root.innerHTML='<div role="status">Не удалось загрузить приложение. Сохранённая работа остаётся на устройстве.</div>';}
  });
}
