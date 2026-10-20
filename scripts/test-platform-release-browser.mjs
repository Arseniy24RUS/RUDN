// Automated protocol fixture, not a claim about physical phones. Native
// Chromium/Firefox/WebKit contexts run locally or on Linux CI; the available
// host in-app browser cannot execute this Linux multi-engine/SW context matrix.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildRelease} from './build-platform-release.mjs';
import {captureCheckpointContracts} from '../site/assets/js/platform-update-contracts.js';
function boundedRing(limit){const events=[];let dropped=0;return {push(event){if(events.length===limit){events.shift();dropped++;}events.push(event);},snapshot(){return {events:[...events],dropped,limit};}};}
function fixturePath(value,scope){try{const url=new URL(value,scope),root=new URL(scope);return url.origin===root.origin&&url.pathname.startsWith(root.pathname)&&url.pathname.length<=300?url.pathname:null;}catch{return null;}}
async function failureObservation(label,operation,timeoutMs=3000){
  let timer;const task=Promise.resolve().then(operation);
  try{return await Promise.race([task.then(value=>({label,status:'observed',value}),error=>({label,status:'unavailable',errorClass:error?.name||'Error'})),new Promise(resolve=>{timer=setTimeout(()=>resolve({label,status:'observation-timeout'}),timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
// Failure-only: reads this synthetic fixture's B cache without opening/creating
// caches, fetching resources, sending BIND, consuming SDK records or retrying.
async function browserFailureSnapshot(spec){
  const deadline=Date.now()+1800,unavailable=[];
  const bounded=async(label,operation)=>{
    if(Date.now()>=deadline){unavailable.push({label,code:'observation-deadline'});return null;}
    let timer;const task=Promise.resolve().then(operation);
    try{const result=await Promise.race([task.then(value=>({value}),error=>({errorClass:error?.name||'Error'})),new Promise(resolve=>{timer=setTimeout(()=>resolve({code:'observation-timeout'}),Math.min(300,deadline-Date.now()));})]);
      if('value' in result)return result.value;unavailable.push({label,...result});return null;
    }finally{clearTimeout(timer);}
  };
  const safeBuild=value=>/^[a-f0-9]{32}$/.test(value||'')?value:null;
  const safeCode=value=>/^(?:release\/[a-z-]{1,64}|syntax|type|range|resource|unknown|import-failed|load-failed|network|offline|storage|cancelled)$/.test(value||'')?value:'unknown';
  const safePath=value=>{try{const url=new URL(value,location.href);return url.origin===location.origin?url.pathname.slice(0,300):null;}catch{return null;}};
  const worker=value=>value?{scriptPath:safePath(value.scriptURL),state:value.state}:null;
  const result={at:Date.now(),href:location.origin+location.pathname+location.hash,readyState:document.readyState,
    text:document.getElementById('app')?.textContent?.slice(0,2000),clicks:(window.fixtureClicks||[]).slice(-16),
    build:safeBuild(globalThis.__RUDN_RELEASE__?.buildId),htmlBuild:safeBuild(document.documentElement.dataset.releaseBuild),
    controller:worker(navigator.serviceWorker?.controller),online:navigator.onLine,unavailable};
  try{result.startupTrace=globalThis.__fixtureReleaseTraceSnapshot?.()||null;}catch(error){unavailable.push({label:'startup-trace',errorClass:error.name});}
  try{const text=sessionStorage.getItem('rudn.diagnostics.bootstrap.v2');const queue=text&&text.length<=65536?JSON.parse(text):[];
    result.earlyCodes=Array.isArray(queue)?queue.slice(-32).filter(Array.isArray).map(item=>({event:['bootstrap-error','runtime-error','resource-error','unhandled-rejection'].includes(item[0])?item[0]:'unknown',code:safeCode(item[1]?.code),stage:['bootstrap','runtime-import','entry-import','prepare','restore','rollback'].includes(item[1]?.stage)?item[1].stage:null,build:safeBuild(item[2]?.build)})):[];
  }catch(error){unavailable.push({label:'early-safe-codes',errorClass:error.name});}
  const registrations=await bounded('worker-registrations',()=>navigator.serviceWorker?.getRegistrations());
  result.registrations=registrations?.slice(0,4).map(registration=>({scope:safePath(registration.scope),active:worker(registration.active),waiting:worker(registration.waiting),installing:worker(registration.installing)}))||[];
  if(!spec.inspectCache)return result;
  const names=await bounded('cache-names',()=>caches.keys());result.cache={name:spec.cacheName,present:names?.includes(spec.cacheName)??null,entries:[]};
  if(!result.cache.present)return result;
  for(const item of spec.entries.slice(0,48)){
    if(Date.now()>=deadline){unavailable.push({label:'remaining-cache-entries',code:'observation-deadline'});break;}
    const response=await bounded('cache-match:'+item.name,()=>caches.match(new URL(item.url,location.origin),{cacheName:spec.cacheName}));
    const entry={name:item.name,path:item.url,present:Boolean(response),expectedSHA256:item.sha256||null,expectedBytes:item.bytes??null};result.cache.entries.push(entry);
    if(!response)continue;entry.status=response.status;
    const bytes=await bounded('cache-bytes:'+item.name,()=>response.arrayBuffer());
    if(!bytes)continue;entry.bytes=bytes.byteLength;
    if(bytes.byteLength>524288){entry.hashSkipped='size-bound';continue;}
    const digest=await bounded('cache-hash:'+item.name,()=>crypto.subtle.digest('SHA-256',bytes));
    if(digest){entry.sha256=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');entry.hashMatches=item.sha256?entry.sha256===item.sha256:null;}
    if(item.name==='descriptor'){
      try{const target=JSON.parse(new TextDecoder().decode(bytes));entry.descriptorFields={buildId:safeBuild(target.buildId),manifestURL:safePath(target.manifestURL),manifestSha256:/^[a-f0-9]{64}$/.test(target.manifestSha256||'')?target.manifestSha256:null,entryURL:target.entryURL?safePath(target.entryURL):null};
        entry.expectedFields=spec.target;entry.fieldsMatch=Object.keys(spec.target).every(key=>entry.descriptorFields[key]===spec.target[key]);entry.knownSerializationHashMatches=spec.descriptorHashes.includes(entry.sha256);
      }catch(error){entry.parseErrorClass=error.name;}
    }
  }
  return result;
}
async function installStartupTrace(context,pages,emit,scope){
  await context.exposeBinding('__fixtureReleaseTrace',({page},event)=>{try{emit('startup',{page:pages.get(page)||'new',...event});}catch{}});
  await context.addInitScript(({scope})=>{
    const ring=[];let dropped=0;const workerSeen=new WeakSet(),registrationSeen=new WeakSet();
    const path=value=>{try{const url=new URL(value,location.href),root=new URL(scope);return url.origin===root.origin&&url.pathname.startsWith(root.pathname)?url.pathname.slice(0,300):null;}catch{return null;}};
    const worker=value=>value?{scriptPath:path(value.scriptURL),state:value.state}:null;
    const send=(kind,fields={})=>{try{const event={at:Date.now(),documentPath:location.pathname,kind,...fields};if(ring.length===96){ring.shift();dropped++;}ring.push(event);Promise.resolve(globalThis.__fixtureReleaseTrace(event)).catch(()=>{});}catch{}};
    globalThis.__fixtureReleaseTraceSnapshot=()=>({events:[...ring],dropped});
    const watchWorker=value=>{if(!value||workerSeen.has(value))return;workerSeen.add(value);value.addEventListener('statechange',()=>send('worker-state',{worker:worker(value)}));};
    const watchRegistration=value=>{if(registrationSeen.has(value))return;registrationSeen.add(value);const sample=()=>{for(const item of [value.active,value.waiting,value.installing])watchWorker(item);send('worker-registration',{active:worker(value.active),waiting:worker(value.waiting),installing:worker(value.installing)});};value.addEventListener('updatefound',sample);sample();};
    const registrations=()=>{try{navigator.serviceWorker?.getRegistrations().then(values=>values.slice(0,4).forEach(watchRegistration),()=>send('observer-unavailable',{operation:'registrations'}));}catch{send('observer-unavailable',{operation:'registrations'});}};
    navigator.serviceWorker?.addEventListener('controllerchange',()=>{watchWorker(navigator.serviceWorker.controller);send('controllerchange',{controller:worker(navigator.serviceWorker.controller)});registrations();});
    navigator.serviceWorker?.addEventListener('message',event=>{const type=event.data?.type;if(!['BUILD_BOUND','RELEASE_BOUND','RELEASE_RESOURCE_UNAVAILABLE','MODULE_CACHE_STATUS'].includes(type))return;send('worker-message',{type,buildId:/^[a-f0-9]{32}$/.test(event.data?.buildId||'')?event.data.buildId:null,source:worker(event.source),sourceIsController:event.source===navigator.serviceWorker.controller});});
    addEventListener('rudn:release-prepared',event=>{try{const detail=event.detail,buildId=detail?.buildId,durable=detail?.durable,moduleName=detail?.module;send('release-prepared',{buildId:typeof buildId==='string'&&/^[a-f0-9]{32}$/.test(buildId)?buildId:null,durable:typeof durable==='boolean'?durable:null,module:['platform','quiz','puzzle','legal-lab','career','reception','settlements','governor'].includes(moduleName)?moduleName:null});}catch{send('observer-unavailable',{operation:'release-prepared'});}});
    addEventListener('error',event=>{if(event.target===window)return;const resource=path(event.target?.src||event.target?.href);if(resource)send('resource-error',{path:resource,tag:String(event.target?.tagName||'').slice(0,16)});},true);
    for(const type of ['DOMContentLoaded','load','pageshow','pagehide'])addEventListener(type,event=>send(type,{persisted:event.persisted===true}));
    watchWorker(navigator.serviceWorker?.controller);send('document-start',{controller:worker(navigator.serviceWorker?.controller)});registrations();
  },{scope});
}
function installNetworkTrace(page,name,emit,scope,corePaths){
  const ids=new WeakMap();let sequence=0;
  const observed=request=>{const pathname=fixturePath(request.url(),scope);if(!pathname||!corePaths.has(pathname))return null;let id=ids.get(request);if(!id){id=++sequence;ids.set(request,id);}return {page:name,requestId:id,path:pathname,method:request.method(),resourceType:request.resourceType()};};
  const guarded=operation=>(...args)=>{try{operation(...args);}catch{try{emit('observer-unavailable',{operation:'network-event',page:name});}catch{}}};
  page.on('request',guarded(request=>{const data=observed(request);if(data)emit('request-start',data);}));
  page.on('requestfinished',guarded(request=>{const data=observed(request);if(data)emit('request-finished',data);}));
  page.on('requestfailed',guarded(request=>{const data=observed(request);if(data){const raw=request.failure()?.errorText||'';emit('request-failed',{...data,code:/^(?:net::ERR_[A-Z_]+|NS_[A-Z_]+)$/.test(raw)?raw:'unknown-network-error'});}}));
  page.on('response',guarded(response=>{const data=observed(response.request());if(data)emit('response',{...data,status:response.status(),fromServiceWorker:response.fromServiceWorker()});}));
}
async function observerSelfTest(){
  const ring=boundedRing(2);ring.push(1);ring.push(2);ring.push(3);assert.deepEqual(ring.snapshot(),{events:[2,3],dropped:1,limit:2});
  assert.equal(fixturePath('/RUDN/main.js?token=hidden#x','http://localhost/RUDN/'),'/RUDN/main.js');assert.equal(fixturePath('https://elsewhere.test/RUDN/main.js','http://localhost/RUDN/'),null);assert.equal(fixturePath('/elsewhere','http://localhost/RUDN/'),null);
  assert.equal((await failureObservation('value',()=>7,20)).value,7);assert.equal((await failureObservation('error',()=>{throw new TypeError('not exported');},20)).errorClass,'TypeError');assert.equal((await failureObservation('pending',()=>new Promise(()=>{}),5)).status,'observation-timeout');
  let reject;const late=new Promise((_,no)=>{reject=no;});assert.equal((await failureObservation('late',()=>late,5)).status,'observation-timeout');reject(new Error('late-safe'));await new Promise(resolve=>setTimeout(resolve,0));
  const events=[],handlers=new Map(),fakePage={on(name,listener){handlers.set(name,listener);}},request={url:()=> 'http://localhost/RUDN/main.js?private=omitted',method:()=> 'GET',resourceType:()=> 'script',failure:()=>({errorText:'NS_BINDING_ABORTED'})};
  installNetworkTrace(fakePage,'main',(kind,fields)=>events.push({kind,...fields}),'http://localhost/RUDN/',new Set(['/RUDN/main.js']));
  handlers.get('request')(request);handlers.get('response')({request:()=>request,status:()=>200,fromServiceWorker:()=>true});handlers.get('requestfailed')(request);handlers.get('requestfinished')(request);
  assert.deepEqual(events.map(event=>event.kind),['request-start','response','request-failed','request-finished']);assert.ok(events.every(event=>event.requestId===1&&event.path==='/RUDN/main.js'));assert.equal(events[1].fromServiceWorker,true);assert.equal(events[2].code,'NS_BINDING_ABORTED');
  request.failure=()=>({errorText:'arbitrary-secret-content'});handlers.get('requestfailed')(request);assert.equal(events.at(-1).code,'unknown-network-error');
  request.url=()=>{throw new TypeError('observer-fault');};assert.doesNotThrow(()=>handlers.get('request')(request));assert.equal(events.at(-1).kind,'observer-unavailable');
  const {runInNewContext}=await import('node:vm'),build='a'.repeat(32),payload=new TextEncoder().encode('fixture'),sha=createHash('sha256').update(payload).digest('hex');let writes=0,reads=0;
  const sandbox={Date,Promise,setTimeout,clearTimeout,URL,TextDecoder,Uint8Array,crypto:globalThis.crypto,location:{origin:'http://localhost',pathname:'/RUDN/index.html',hash:'#fixture',href:'http://localhost/RUDN/index.html?secret=omitted#fixture'},document:{readyState:'complete',documentElement:{dataset:{releaseBuild:build}},getElementById:()=>({textContent:'fixture'})},window:{fixtureClicks:[]},__RUDN_RELEASE__:{buildId:build},navigator:{onLine:true,serviceWorker:{controller:null,getRegistrations:async()=>[]}},sessionStorage:{getItem:()=>null},caches:{keys:async()=>['fixture-B'],match:async()=>{reads++;return {status:200,arrayBuffer:async()=>payload.buffer};},open:()=>{writes++;throw Error('must not open');}},spec:{inspectCache:true,cacheName:'fixture-B',entries:[{name:'core',url:'/RUDN/main.js',sha256:sha,bytes:payload.byteLength}]}};
  const snapshot=await runInNewContext('('+browserFailureSnapshot.toString()+')(spec)',sandbox);
  assert.equal(snapshot.cache.entries[0].hashMatches,true);assert.equal(snapshot.cache.entries[0].bytes,payload.byteLength);assert.equal(snapshot.href,'http://localhost/RUDN/index.html#fixture');assert.equal(reads,1);assert.equal(writes,0);
  sandbox.caches.keys=()=>{throw new DOMException('secret-omitted','SecurityError');};const unavailable=await runInNewContext('('+browserFailureSnapshot.toString()+')(spec)',sandbox);assert.ok(unavailable.unavailable.some(item=>item.label==='cache-names'&&item.errorClass==='SecurityError'));
  console.log(JSON.stringify({status:'pass',checks:21,classification:'pure observer controls; no builds or browsers'}));
}
if(process.argv.includes('--observer-self-test')){await observerSelfTest();process.exit(0);}
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.env.QA_OUT||path.join(repo,'../evidence/runs/20261018-platform-observability/release/browser-fixture'));
await fs.mkdir(out,{recursive:true});const source=path.join(out,'source'),baseline=path.join(out,'baseline');
async function write(root,name,text){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);}
for(const root of [source,baseline]){
  await write(root,'index.html','<!doctype html><html><head><title>Release protocol fixture</title></head><body><main id="app">Loading</main><button id="update">Update</button><button id="lazy">Lazy</button><output id="lazy-result"></output><script type="module" src="assets/js/main.js"></script></body></html>');
  for(const name of ['service-worker.js','assets/js/release-bootstrap.js','assets/js/release-resources.js','assets/js/release-recovery.js','assets/js/diagnostics-bootstrap.js','assets/js/platform-update-failures.js','assets/js/platform-update-contracts.js','data/platform-contracts.json'])await write(root,name,await fs.readFile(path.join(repo,'site',name)));
  await write(root,'data/course.json','{"release":"A"}');await write(root,'data/lazy.json','{"lazy":"A"}');
}
const main=version=>`import {getReleaseContext,releaseFetch} from './release-resources.js';import {checkRelease,prepareRelease,activatePreparedRelease} from './release-bootstrap.js';const data=await (await releaseFetch('../../data/course.json',{},import.meta.url)).json();document.querySelector('#app').textContent='${version} '+data.release+' '+(sessionStorage.getItem('fixture-draft')||'none');document.querySelector('#app').dataset.build=getReleaseContext().buildId;document.querySelector('#update').onclick=async()=>{sessionStorage.setItem('fixture-draft','question-7');const target=await checkRelease();await prepareRelease(target);activatePreparedRelease(target,{resumeToken:'fixture-token'});};document.querySelector('#lazy').onclick=async()=>document.querySelector('#lazy-result').textContent=(await(await releaseFetch('../../data/lazy.json',{},import.meta.url)).json()).lazy;`;
await write(source,'assets/js/main.js',main('A'));await write(baseline,'assets/js/main.js',main('A'));
const standalone=version=>`<html><head><title>Standalone protocol fixture</title></head><body><main id="app">Loading</main><button id="update">Update</button><button id="lazy">Lazy</button><output id="lazy-result"></output><script type="module">${main(version).replaceAll("from './","from './assets/js/").replaceAll("'../../data/","'./data/")}</script></body></html>`;
const nested=version=>standalone(version).replaceAll("from './assets/js/","from '../../assets/js/").replaceAll("'./data/","'../../data/");
await write(source,'standalone.html',standalone('A'));
await write(baseline,'standalone.html',standalone('legacy'));
await write(source,'apps/demo/index.html',nested('A'));await write(baseline,'apps/demo/index.html',nested('legacy'));
const a=await buildRelease({site:source,baseline,out:path.join(out,'a')});await write(source,'assets/js/main.js',main('B'));await write(source,'standalone.html',standalone('B'));await write(source,'apps/demo/index.html',nested('B'));await write(source,'data/course.json','{"release":"B"}');await write(source,'data/lazy.json','{"lazy":"B"}');const b=await buildRelease({site:source,baseline:a.out,out:path.join(out,'b')});
await write(source,'assets/js/main.js',main('C'));await write(source,'standalone.html',standalone('C'));await write(source,'apps/demo/index.html',nested('C'));await write(source,'data/course.json','{"release":"C"}');await write(source,'data/lazy.json','{"lazy":"C"}');const c=await buildRelease({site:source,baseline:b.out,out:path.join(out,'c')});
await assert.rejects(fs.access(path.join(c.out,`_releases/${a.buildId}`)),{code:'ENOENT'});
await write(source,'assets/js/main.js',"throw new Error('synthetic-entry-import-failure');");const broken=await buildRelease({site:source,baseline:a.out,out:path.join(out,'broken')});
let live=a.out,networkDown=false,staleRoot=false,cachedBootstrap=false;
const manifests=new Map();for(const release of [a,b,c,broken])manifests.set(release.buildId,JSON.parse(await fs.readFile(path.join(release.out,`_releases/${release.buildId}/manifest.json`),'utf8')));
const corePaths=new Set(['/RUDN/','/RUDN/index.html','/RUDN/release.json','/RUDN/service-worker.js']);
for(const [id,manifest] of manifests){for(const resource of Object.values(manifest.resources))corePaths.add(new URL(resource.url,'http://fixture.invalid').pathname);corePaths.add(`/RUDN/_releases/${id}/release.json`);corePaths.add(`/RUDN/_releases/${id}/manifest.json`);}
let stage='setup',timeline=boundedRing(512);const emit=(kind,fields={})=>{try{timeline.push({at:Date.now(),stage,kind,...fields});}catch{}};
const markStage=value=>{stage=value;emit('stage');};
const requests=[];
const server=http.createServer(async(req,res)=>{
  if(networkDown){const pathname=new URL(req.url,'http://localhost').pathname;requests.push({at:Date.now(),stage,path:pathname,status:null,dropped:true});emit('server-drop',{path:pathname,networkDown:true});req.socket.destroy();return;}
  let name;try{
    const url=new URL(req.url,'http://localhost');name=decodeURIComponent(url.pathname).replace(/^\/RUDN\//,'');if(!name||name.endsWith('/'))name+='index.html';if(name.includes('..'))throw Error('path');
    const cached=staleRoot&&name==='index.html'||cachedBootstrap&&name.startsWith(`_releases/${a.buildId}/assets/js/`)&&/release-(bootstrap|resources)\.js$/.test(name);
    const file=path.join(cached?a.out:live,name),bytes=await fs.readFile(file),type=/\.m?js$/.test(file)?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'application/octet-stream';
    requests.push({at:Date.now(),stage,path:url.pathname,status:200});if(corePaths.has(url.pathname))emit('server-response',{path:url.pathname,status:200,networkDown:false});res.writeHead(200,{'content-type':type,'cache-control':'no-cache'});res.end(bytes);
  }catch{
    requests.push({at:Date.now(),stage,path:req.url,status:404});emit('server-response',{path:new URL(req.url,'http://localhost').pathname,status:404,networkDown:false});const documentRequest=req.headers['sec-fetch-dest']==='document'||name?.endsWith('.html');
    res.writeHead(404,{'content-type':documentRequest?'text/html':'text/plain','cache-control':'no-store'});res.end(documentRequest?await fs.readFile(path.join(live,'404.html')):'missing');
  }
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/RUDN/?language=en#activity/fixture';const playwright=await import(pathToFileURL(process.env.PLAYWRIGHT_PATH||'C:/Users/arsen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const descriptorBytes=await fs.readFile(path.join(b.out,`_releases/${b.buildId}/release.json`)),bManifest=manifests.get(b.buildId);
const failureSpec={inspectCache:true,cacheName:`rudn-gmu-pages:${encodeURIComponent(origin+'/RUDN/')}:release-${b.buildId}`,target:b.target,descriptorHashes:[createHash('sha256').update(descriptorBytes).digest('hex'),createHash('sha256').update(JSON.stringify(b.target)).digest('hex')],entries:[
  {name:'descriptor',url:`/RUDN/_releases/${b.buildId}/release.json`},
  {name:'manifest',url:b.target.manifestURL,sha256:b.target.manifestSha256},
  ...bManifest.packs.shell.map(name=>({name,...bManifest.resources[name]}))
]};
const results=[];
// Keep the synthetic localhost fixture independent of the host's proxy settings.
const launch=engine=>playwright[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
try{for(const engine of (process.env.RELEASE_BROWSERS||'chromium,webkit').split(','))for(const sw of ['allow','block']){
  console.log(JSON.stringify({engine,phase:'update',serviceWorkers:sw}));
  timeline=boundedRing(512);markStage('update-context');
  live=a.out;const browser=await launch(engine),context=await browser.newContext({serviceWorkers:sw,viewport:{width:390,height:844}});if(sw==='block')await context.addInitScript(()=>Object.defineProperty(window,'caches',{get(){throw new DOMException('Synthetic cache unavailable','SecurityError');}}));const page=await context.newPage(),other=await context.newPage(),standalonePage=await context.newPage(),errors=[];
  await context.addInitScript(()=>{window.fixtureClicks=[];addEventListener('click',event=>fixtureClicks.push({id:event.target?.id,at:performance.now()}),true);});
  page.on('pageerror',error=>errors.push(error.message));other.on('pageerror',error=>errors.push(error.message));standalonePage.on('pageerror',error=>errors.push(error.message));
  const namedPages=[['main',page],['other',other],['standalone',standalonePage]];
  try{await installStartupTrace(context,new Map(namedPages.map(([name,tab])=>[tab,name])),emit,origin+'/RUDN/');for(const [name,tab] of namedPages)installNetworkTrace(tab,name,emit,origin+'/RUDN/',corePaths);}catch{emit('observer-unavailable',{operation:'install-trace'});}
  try{
    markStage('main-A-navigation');await page.goto(url);markStage('main-A-ready');await page.locator('#app').filter({hasText:'A A none'}).waitFor();
    markStage('other-A-navigation');await other.goto(url);markStage('other-A-ready');await other.locator('#app').filter({hasText:'A A none'}).waitFor();
    markStage('standalone-A-navigation');await standalonePage.goto(origin+`/RUDN/_releases/${a.buildId}/standalone.html#question-3`);markStage('standalone-A-ready');await standalonePage.locator('#app').filter({hasText:'A A none'}).waitFor();await context.addCookies([{name:'fixture-login',value:'preserved',url:origin}]);
    if(sw==='allow'){markStage('main-A-controller');await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);}
    live=b.out;markStage('main-B-update-click');await page.locator('#update').click();markStage('main-B-ready');await page.locator('#app').filter({hasText:'B B question-7'}).waitFor();assert.equal(await page.locator('#app').getAttribute('data-build'),b.buildId);assert.equal(new URL(page.url()).hash,'#activity/fixture');assert.equal(new URL(page.url()).searchParams.get('language'),'en');assert.equal(new URL(page.url()).searchParams.get('rudnResume'),'fixture-token');assert.ok((await context.cookies()).some(x=>x.name==='fixture-login'&&x.value==='preserved'));
    markStage('other-A-lazy-click');await other.locator('#lazy').click();markStage('other-A-lazy-ready');await other.locator('#lazy-result').filter({hasText:'A'}).waitFor();
    markStage('standalone-B-update-click');await standalonePage.locator('#update').click();markStage('standalone-B-ready');await standalonePage.locator('#app').filter({hasText:'B B question-7'}).waitFor();assert.equal(new URL(standalonePage.url()).pathname,`/RUDN/_releases/${b.buildId}/standalone.html`);assert.equal(new URL(standalonePage.url()).hash,'#question-3');
    if(sw==='allow'){markStage('offline-controller');await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);networkDown=true;markStage('offline-reload');await page.reload();markStage('offline-B-ready');await page.locator('#app').filter({hasText:'B B question-7'}).waitFor();networkDown=false;}
    markStage('update-assertions');
    await page.screenshot({path:path.join(out,`${engine}-${sw}.png`)});assert.deepEqual(errors,[]);results.push({engine,serviceWorkers:sw,status:'pass',buildId:b.buildId,oldTabStable:true,draftRestored:true,cookiePreserved:true,offline:sw==='allow'?'pass':'not-applicable'});
  }catch(error){
    const failedStage=stage,pages=[],observationErrors=[];emit('original-failure',{errorClass:error.name});
    try{for(const [name,tab] of namedPages){
      pages.push({name,...await failureObservation('page-snapshot:'+name,()=>tab.evaluate(browserFailureSnapshot,{...failureSpec,inspectCache:name==='main'}))});
      const screenshot=await failureObservation('failure-screenshot:'+name,()=>tab.screenshot({path:path.join(out,`${engine}-${sw}-${name}-failure.png`),timeout:2000}),2500);
      if(screenshot.status!=='observed')observationErrors.push(screenshot);
    }}catch(observationError){observationErrors.push({label:'failure-collector',errorClass:observationError.name});}
    const receipt={engine,serviceWorkers:sw,stage:failedStage,error:error.message,errorClass:error.name,stack:error.stack,errors,pages,requests,networkDown,trace:timeline.snapshot(),observationErrors};
    const saved=await failureObservation('failure-receipt',()=>fs.writeFile(path.join(out,'failure.json'),JSON.stringify(receipt,null,2)+'\n'));
    if(saved.status!=='observed')console.error(JSON.stringify({kind:'failure-receipt-unavailable',stage:failedStage,originalErrorClass:error.name,observation:saved}));
    throw error;
  }finally{networkDown=false;await browser.close();}
}
for(const engine of (process.env.RELEASE_BROWSERS||'chromium,webkit').split(',')){
  console.log(JSON.stringify({engine,phase:'cold-entry'}));
  markStage('cold-entry');
  live=a.out;const browser=await launch(engine),context=await browser.newContext({serviceWorkers:'block'}),old=await context.newPage(),errors=[];
  await context.addInitScript(()=>Object.defineProperty(window,'caches',{get(){throw new DOMException('Synthetic cache unavailable','SecurityError');}}));
  try{
    await old.goto(url);await old.locator('#app').filter({hasText:'A A none'}).waitFor();const oldURL=old.url();live=c.out;
    await old.locator('#lazy').click();await old.locator('#lazy-result').filter({hasText:'A'}).waitFor();assert.equal(old.url(),oldURL);
    await old.evaluate(()=>{localStorage.setItem('fixture-persistent-draft','unchanged');});
    for(const scenario of ['obsolete-exact-entry','obsolete-exact-directory','canonical-standalone','canonical-standalone-directory','stale-root-dead-bootstrap','stale-root-cached-bootstrap']){
      console.log(JSON.stringify({engine,scenario}));
      markStage('cold-entry:'+scenario);
      const page=await context.newPage(),navigations=[];page.on('pageerror',error=>errors.push({scenario,message:error.message}));page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())navigations.push(request.url());});
      staleRoot=scenario.startsWith('stale-root');cachedBootstrap=scenario==='stale-root-cached-bootstrap';
      const directory=scenario.endsWith('-directory'),logical=directory?'apps/demo/index.html':scenario==='canonical-standalone'?'standalone.html':'index.html';
      const pathname=scenario.startsWith('obsolete-exact')?`_releases/${a.buildId}/`+(directory?'apps/demo/':'index.html'):scenario.startsWith('canonical-standalone')?(directory?'apps/demo/':logical):'';
      await page.goto(origin+'/RUDN/'+pathname+'?language=zh&rudnResume=opaque-local-token#question-9');await page.locator('#app').filter({hasText:'C C none'}).waitFor();
      const current=new URL(page.url());assert.equal(current.pathname,`/RUDN/_releases/${c.buildId}/${logical}`);assert.equal(current.hash,'#question-9');assert.equal(current.searchParams.get('language'),'zh');assert.equal(current.searchParams.get('rudnResume'),'opaque-local-token');assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
      await page.waitForFunction(()=>!new URL(location.href).searchParams.has('rudnRecovery'));assert.equal(await page.evaluate(()=>localStorage.getItem('fixture-persistent-draft')),'unchanged');assert.equal(navigations.length,2);
      results.push({engine,scenario,status:'pass',serviceWorkers:'block',cacheStorage:'unavailable',buildId:c.buildId,navigations:2,persistentDraftPreserved:true});await page.close();staleRoot=false;cachedBootstrap=false;
    }
    const missing=await context.newPage(),start=requests.length,response=await missing.goto(origin+'/RUDN/not-ours.html#question-9');assert.equal(response.status(),404);assert.equal(new URL(missing.url()).pathname,'/RUDN/not-ours.html');assert.equal(await missing.evaluate(()=>__RUDN_RELEASE_RECOVERY__.recover('test')),false);assert.ok(!requests.slice(start).some(x=>x.path.endsWith('/release.json')));await missing.close();
    assert.deepEqual(errors,[]);results.push({engine,scenario:'unknown-entry-remains-404-and-live-old-tab-stable',status:'pass'});
    live=broken.out;const failed=await context.newPage(),moves=[];failed.on('framenavigated',frame=>{if(frame===failed.mainFrame())moves.push(frame.url());});await failed.goto(origin+broken.target.entryURL);await failed.getByRole('status').filter({hasText:'Не удалось загрузить приложение'}).waitFor();assert.equal(await failed.evaluate(()=>__RUDN_RELEASE_RECOVERY__.recover('test')),false);assert.equal(moves.length,1);assert.equal(await failed.evaluate(()=>localStorage.getItem('fixture-persistent-draft')),'unchanged');results.push({engine,scenario:'broken-current-no-reload-loop',status:'pass',navigations:1});await failed.close();
  }finally{staleRoot=false;cachedBootstrap=false;await browser.close();}
}
for(const engine of (process.env.RELEASE_BROWSERS||'chromium,webkit').split(',')){
  markStage('process-session-lost-import-failure');
  live=broken.out;const token='process-recovery-token',pending={token,owner:'synthetic-owner',sourceBuild:a.buildId,targetBuild:broken.buildId,phase:'switching',attempts:1,startedAt:Date.now(),route:'#activity/fixture',previous:a.target,checkpointContracts:captureCheckpointContracts(manifests.get(a.buildId).contracts,[{module:'platform'}])};
  const browser=await launch(engine),context=await browser.newContext({serviceWorkers:'block',storageState:{cookies:[],origins:[{origin,localStorage:[{name:'rudn.update.pending.v1:'+token,value:JSON.stringify(pending)}]}]}}),page=await context.newPage(),navigations=[];page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url());});
  try{await page.goto(origin+broken.target.entryURL+'?rudnResume='+token+'#activity/fixture');await page.locator('#app').filter({hasText:'A A none'}).waitFor();assert.equal(new URL(page.url()).pathname,`/RUDN/_releases/${a.buildId}/index.html`);assert.equal(navigations.filter(value=>value.includes(broken.buildId)).length,1);const marker=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),'rudn.update.pending.v1:'+token);assert.equal(marker.phase,'rollback');assert.equal(marker.targetBuild,a.buildId);assert.equal(marker.failedBuild,broken.buildId);results.push({engine,scenario:'process-session-lost-import-failure',status:'pass',rollbackCount:1,previousBuild:a.buildId});}finally{await browser.close();}
}
}finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});await fs.writeFile(path.join(out,'report.json'),JSON.stringify({classification:'automated synthetic protocol fixture',browserPlugin:'host in-app browser available; native Chromium/Firefox/WebKit and service-worker context matrix requires local/Linux CI Playwright',results},null,2)+'\n');}
console.log(JSON.stringify({status:'pass',results,out},null,2));
