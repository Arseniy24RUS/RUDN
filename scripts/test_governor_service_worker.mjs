import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const siteRoot=fileURLToPath(new URL('../site/',import.meta.url));
const workerSource=await readFile(path.join(siteRoot,'service-worker.js'),'utf8');
const {version:currentVersion}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
assert.match(currentVersion,/^\d+\.\d+\.\d+$/,'Release fixture requires a semantic version');
const versionParts=currentVersion.split('.').map(Number);
const futureVersion=[versionParts[0],versionParts[1],versionParts[2]+1].join('.');
assert.notEqual(futureVersion,currentVersion,'The second update must install a different release');
const scope='https://example.test/platform-rudn/';
const modulePath='apps/governor/';
const excludedNames=new Set(['LICENSE','VERSION']);

async function runtimeFiles(directory,prefix=''){
  const entries=await readdir(directory,{withFileTypes:true});
  const nested=await Promise.all(entries.map(entry=>{
    const relative=prefix+entry.name;
    if(entry.isDirectory())return runtimeFiles(path.join(directory,entry.name),relative+'/');
    return entry.name.endsWith('.md')||excludedNames.has(entry.name)?[]:[relative];
  }));
  return nested.flat().sort();
}

function makeWorker(workerScope=scope,{stores=new Map(),source=workerSource}={}){
  const listeners=new Map();
  const installedRequests=[];
  let networkCalls=0;
  let skipped=false;
  let claimed=false;
  const urlOf=input=>new URL(typeof input==='string'?input:input.url,workerScope).href;
  const cacheStorage={
    async open(name){
      if(!stores.has(name)){
        const entries=new Map();
        stores.set(name,{
          entries,
          async match(request){return entries.get(urlOf(request))?.clone()},
          async put(request,response){entries.set(urlOf(request),response.clone())},
          async keys(){return [...entries.keys()].map(url=>new Request(url))},
          async delete(request){return entries.delete(urlOf(request))},
          async addAll(requests){
            // Like browser addAll, installation fails if any response is unsuccessful.
            const pending=await Promise.all(requests.map(async request=>{
              installedRequests.push(request);
              const response=await harness.fetch(request);
              assert.equal(response.ok,true,`Precache request failed: ${urlOf(request)}`);
              return [request,response];
            }));
            for(const [request,response] of pending)await this.put(request,response);
          }
        });
      }
      return stores.get(name);
    },
    async keys(){return [...stores.keys()]},
    async delete(name){return stores.delete(name)}
    // Deliberately no global match: fallback must use only the owned cache.
  };
  const context=vm.createContext({
    URL,Request,Response,AbortController,setTimeout,clearTimeout,
    caches:cacheStorage,
    fetch:request=>{networkCalls++;if(request.cache==='reload')installedRequests.push(request);return harness.fetch(request)},
    self:{
      registration:{scope:workerScope},
      addEventListener:(name,callback)=>listeners.set(name,callback),
      skipWaiting:async()=>{skipped=true},
      clients:{claim:async()=>{claimed=true},matchAll:async()=>harness.activeClients||[],get:async id=>harness.activeClients?.find(client=>client.id===id)}
    }
  });
  vm.runInContext(source,context,{filename:'service-worker.js'});
  const harness={
    stores,cacheStorage,installedRequests,
    get cacheName(){return vm.runInContext('CACHE',context)},
    get cachePrefix(){return vm.runInContext('CACHE_PREFIX',context)},
    get clientCacheName(){return vm.runInContext('CLIENT_CACHE',context)},
    get precache(){return Array.from(vm.runInContext('PRECACHE',context))},
    get core(){return Array.from(vm.runInContext('CORE_SHELL',context))},
    get puzzle(){return Array.from(vm.runInContext('PUZZLE_SHELL',context))},
    get networkCalls(){return networkCalls},
    get skipped(){return skipped},
    get claimed(){return claimed},
    async fetch(request){
      const url=new URL(urlOf(request));
      const root=new URL(workerScope);
      assert.equal(url.origin,root.origin);
      assert.ok(url.pathname.startsWith(root.pathname));
      let localPath=path.join(siteRoot,decodeURIComponent(url.pathname.slice(root.pathname.length)));
      if((await stat(localPath)).isDirectory())localPath=path.join(localPath,'index.html');
      return new Response(await readFile(localPath));
    },
    async emit(name,event={}){
      const pending=[];
      listeners.get(name)({...event,waitUntil:promise=>pending.push(promise)});
      await Promise.all(pending);
    },
    async request(relative,options={}){
      let response;
      const {clientId='',resultingClientId='',...requestOptions}=options;
      await this.emit('fetch',{
        clientId,resultingClientId,
        request:{url:urlOf(relative),method:'GET',mode:'cors',...requestOptions},
        respondWith:promise=>{response=promise}
      });
      return response===undefined?undefined:await response;
    }
  };
  return harness;
}

test('module manifest includes runtime files; platform and puzzle entry are installed',async()=>{
  const worker=makeWorker();
  await worker.emit('install');
  assert.equal(worker.skipped,true);
  assert.equal(new Set(worker.precache).size,worker.precache.length,'No duplicate precache URLs');
  const nativeFiles=await runtimeFiles(path.join(siteRoot,modulePath));
  for(const file of nativeFiles){
    assert.ok(worker.precache.includes('./'+modulePath+file),`Missing native runtime file: ${file}`);
  }
  for(const entry of ['./','./index.html','./apps/puzzle.html','./'+modulePath,'./'+modulePath+'index.html',
    './'+modulePath+'platform-bridge.js','./'+modulePath+'platform-contract.js','./'+modulePath+'platform.css',
    `./assets/js/main.js?v=${currentVersion}`,`./assets/js/teacher-journal.js?v=${currentVersion}`,`./assets/css/site.css?v=${currentVersion}`,
    './assets/js/career-course.js','./apps/career/entry.mjs','./apps/career/runtime.bundle.mjs',
    './apps/career/surface.html','./apps/career/module.css','./apps/career/assets/fonts/noto-sans-sc.woff2',
    './apps/career/data/model-manifest.json','./apps/career/docs/TEACHER-GUIDE-STAGE8.md',
    './assets/course/previews/seminar_07_simulator.jpg']){
    assert.ok(worker.precache.includes(entry),`Missing entry: ${entry}`);
  }
  assert.ok(worker.installedRequests.every(request=>request.cache==='reload'));
  assert.ok(!worker.installedRequests.some(request=>request.url.includes('/apps/')&&!request.url.endsWith('/apps/puzzle.html')),'Other optional modules cannot delay installation');
  assert.equal(worker.precache.filter(entry=>entry.startsWith('./apps/career/')).length,29);
  assert.ok(worker.cacheName.startsWith(worker.cachePrefix+`v${currentVersion}-`));
});

test('a newly activated release can reopen a saved puzzle before its first online visit',async()=>{
  const worker=makeWorker();
  await worker.emit('install');
  await worker.emit('activate');
  worker.fetch=async()=>{throw new TypeError('Network unavailable')};
  for(const entry of worker.puzzle){
    const response=await worker.request(entry,{mode:entry.endsWith('.html')?'navigate':'cors'});
    assert.equal(response?.status,200,`New puzzle release unavailable offline: ${entry}`);
  }
});

test('an incomplete puzzle entry prevents activation of an unusable update',async()=>{
  const worker=makeWorker();
  const fetch=worker.fetch;
  worker.fetch=request=>request.url.endsWith('/apps/puzzle.html')?Promise.resolve(new Response('Unavailable',{status:503})):fetch(request);
  await assert.rejects(worker.emit('install'),/resource\/unavailable/);
  assert.equal(worker.skipped,false,'The prepared older worker must remain active');
});

test('activation deletes only this scope releases and the exact legacy platform cache',async()=>{
  const worker=makeWorker();
  const rootWorker=makeWorker('https://example.test/');
  const retained=[worker.cacheName,worker.clientCacheName,rootWorker.cacheName,
    'rudn-governor-stage9','unrelated-site-v4','rudn-gmu-pages-v0.9.0','rudn-gmu-pages-v1.3.0-career-other'];
  const removed=[worker.cachePrefix+'v1.2.2','rudn-gmu-pages-v1.2.2','rudn-gmu-pages-v1.3.0-career'];
  for(const name of [...retained,...removed])await worker.cacheStorage.open(name);
  await worker.emit('activate');
  assert.equal(worker.claimed,true);
  assert.deepEqual((await worker.cacheStorage.keys()).sort(),retained.sort());
  assert.notEqual(worker.cachePrefix,rootWorker.cachePrefix);
});

test('opened module resource pack becomes available offline without caching other modules',async()=>{
  const worker=makeWorker();
  await worker.emit('install');
  await worker.emit('message',{data:{type:'PREPARE_MODULE',module:'governor'}});
  worker.fetch=async()=>{throw new TypeError('Network unavailable')};
  for(const entry of [...worker.core,...worker.precache.filter(path=>path.startsWith('./apps/governor/'))]){
    const navigate=entry.endsWith('/')||entry.endsWith('.html');
    const response=await worker.request(entry,{mode:navigate?'navigate':'cors'});
    assert.equal(response?.status,200,`Offline response unavailable: ${entry}`);
  }
  const navigation=await worker.request('./'+modulePath+'index.html?from=seminar-7',{mode:'navigate'});
  assert.equal(navigation.status,200);
  assert.match(await navigation.text(),/<!doctype html>/i);
  const missing=await worker.request('./apps/missing/index.html',{mode:'navigate'});
  assert.equal(missing.type,'error','An uncached page must not receive unrelated HTML');
});

test('reception preparation caches metadata but leaves the complete bank and catalog lazy',async()=>{
  const worker=makeWorker();
  await worker.emit('install');
  await worker.emit('message',{data:{type:'PREPARE_MODULE',module:'reception'}});
  const paths=worker.installedRequests.map(request=>new URL(request.url).pathname);
  assert.ok(paths.some(path=>path.endsWith('/reception/content/manifest.js')));
  assert.ok(paths.some(path=>path.endsWith('/reception/js/content-library.js')));
  assert.ok(!paths.some(path=>/\/reception\/js\/(cases|evidence-catalog|source-index)\.js$/.test(path)));
  assert.ok(!paths.some(path=>/\/reception\/(content\/.+\.json|localization\/source\/)/.test(path)));
});

test('404 and 500 responses preserve and return the healthy cached resource',async()=>{
  const worker=makeWorker();
  const cache=await worker.cacheStorage.open(worker.cacheName);
  const existing='./'+modulePath+'src/engine.js';
  const careerModule='./apps/career/entry.mjs';
  await cache.put(existing,new Response('healthy engine'));
  await cache.put(careerModule,new Response('healthy career module'));
  for(const status of [404,500]){
    worker.fetch=async()=>new Response('bad deployment',{status});
    assert.equal(await (await worker.request(existing)).text(),'healthy engine');
    assert.equal(await (await cache.match(existing)).text(),'healthy engine');
    assert.equal(await (await worker.request(careerModule)).text(),'healthy career module');
    assert.equal(await (await cache.match(careerModule)).text(),'healthy career module');
    const missing='./'+modulePath+`missing-${status}.js`;
    assert.equal((await worker.request(missing)).status,status);
    assert.equal(await cache.match(missing),undefined);
    const missingImage='./'+modulePath+`assets/missing-${status}.webp`;
    assert.equal((await worker.request(missingImage)).status,status);
    assert.equal(await cache.match(missingImage),undefined);
  }
  worker.fetch=async()=>new Response('new healthy engine');
  assert.equal(await (await worker.request(existing)).text(),'new healthy engine');
  worker.fetch=async()=>new Response('new healthy career module');
  assert.equal(await (await worker.request(careerModule)).text(),'new healthy career module');
  worker.fetch=async()=>{throw new TypeError('Network unavailable')};
  assert.equal(await (await worker.request(existing)).text(),'new healthy engine');
  assert.equal(await (await worker.request(careerModule)).text(),'new healthy career module');
});

test('fallback never reads another application cache and ignores requests outside scope',async()=>{
  const worker=makeWorker();
  const foreignCache=await worker.cacheStorage.open('another-module-cache');
  const file='./'+modulePath+'src/engine.js';
  await foreignCache.put(file,new Response('another app copy'));
  worker.fetch=async()=>{throw new TypeError('Network unavailable')};
  assert.equal((await worker.request(file)).type,'error');
  const before=worker.networkCalls;
  assert.equal(await worker.request('https://other.test/platform-rudn/file.js'),undefined);
  assert.equal(await worker.request('https://example.test/another-app/file.js'),undefined);
  assert.equal(await worker.request('https://example.test/platform-rudn-extra/file.js'),undefined);
  assert.equal(await worker.request(file,{method:'POST'}),undefined);
  assert.equal(worker.networkCalls,before);
});

test('a cache write failure still returns the successful network response',async()=>{
  const worker=makeWorker();
  const cache=await worker.cacheStorage.open(worker.cacheName);
  cache.put=async()=>{throw new Error('Cache quota exceeded')};
  worker.fetch=async()=>new Response('successful network content');
  assert.equal(await (await worker.request('./'+modulePath+'src/engine.js')).text(),'successful network content');
});

test('an open task retains its own previous-release cache during activation',async()=>{
  const worker=makeWorker();worker.activeClients=[{id:'open-task',url:scope,postMessage(){}}];
  const previous=worker.cachePrefix+'previous';
  const cache=await worker.cacheStorage.open(previous);await cache.put('./data/questions.json',new Response('previous valid questions'));
  await worker.emit('activate');
  assert.ok((await worker.cacheStorage.keys()).includes(previous));
  worker.fetch=async()=>{throw new TypeError('offline')};
  assert.equal(await (await worker.request('./data/questions.json',{clientId:'open-task'})).text(),'previous valid questions');
});

test('activation removes unused own releases while retaining each live binding and unrelated application caches',async()=>{
  const worker=makeWorker();
  const client={id:'active-old-tab',url:scope,postMessage(){}};
  worker.activeClients=[client,{id:'another-app',url:'https://example.test/other-app/',postMessage(){}}];
  const retained=worker.cachePrefix+'v1.3.1-old';
  const unused=worker.cachePrefix+'v1.3.2-unused';
  await (await worker.cacheStorage.open(retained)).put('./assets/js/main.js?v=1.3.1',new Response('active old main'));
  await worker.cacheStorage.open(unused);
  await worker.cacheStorage.open(worker.cacheName);
  await worker.cacheStorage.open('unrelated-site-v4');
  await worker.emit('message',{source:client,data:{type:'BIND_RELEASE',release:'1.3.1'}});
  await worker.emit('activate');
  const names=await worker.cacheStorage.keys();
  assert.ok(names.includes(retained));
  assert.ok(names.includes(worker.cacheName));
  assert.ok(names.includes(worker.clientCacheName));
  assert.ok(names.includes('unrelated-site-v4'));
  assert.ok(!names.includes(unused));
});

test('handshake preserves an existing compatible binding even when another cache reuses the version',async()=>{
  const worker=makeWorker();
  const client={id:'same-version-old-tab',url:scope,postMessage(){}};
  worker.activeClients=[client];
  const old=await worker.cacheStorage.open(worker.cachePrefix+`v${currentVersion}-earlier-build`);
  const current=await worker.cacheStorage.open(worker.cacheName);
  for(const [cache,label] of [[old,'earlier'],[current,'current']]){
    await cache.put(`./assets/js/main.js?v=${currentVersion}`,new Response(label+' main'));
    await cache.put('./apps/career/entry.mjs',new Response(label+' lazy module'));
  }
  await worker.emit('activate');
  await worker.emit('message',{source:client,data:{type:'BIND_RELEASE',release:currentVersion}});
  assert.equal(await (await worker.request('./apps/career/entry.mjs',{clientId:client.id})).text(),'earlier lazy module');
});

test('current clients refresh the daily calendar while old clients keep their cached assignment data',async()=>{
  const worker=makeWorker();
  const client={id:'old-calendar-tab',url:scope,postMessage(){}};
  const old=await worker.cacheStorage.open(worker.cachePrefix+'v1.3.2-reliability-1');
  const current=await worker.cacheStorage.open(worker.cacheName);
  const calendar='./assets/data/calendars/current.json';
  await old.put('./assets/js/main.js?v=1.3.2',new Response('old main'));
  await old.put(calendar,new Response('old assignment calendar'));
  await current.put(calendar,new Response('yesterday calendar'));
  worker.fetch=async()=>new Response('today calendar');
  assert.equal(await (await worker.request(calendar,{clientId:'new-calendar-tab'})).text(),'today calendar');
  assert.equal(await (await current.match(calendar)).text(),'today calendar');
  await worker.emit('message',{source:client,data:{type:'BIND_RELEASE',release:'1.3.2'}});
  assert.equal(await (await worker.request(calendar,{clientId:client.id})).text(),'old assignment calendar');
  assert.equal(worker.networkCalls,1);
});

test('open clients keep cached lazy modules and versioned core while a new navigation gets the installed release',async()=>{
  const worker=makeWorker();
  const messages=[];
  const oldClient={id:'old-tab',url:scope,postMessage:message=>messages.push(message)};
  worker.activeClients=[oldClient];
  const previous=await worker.cacheStorage.open(worker.cachePrefix+'v1.3.2-reliability-1');
  const current=await worker.cacheStorage.open(worker.cacheName);
  await previous.put('./assets/js/main.js?v=1.3.2',new Response('old main'));
  await previous.put('./assets/js/backend.js?v=1.3.2',new Response('old singleton backend'));
  await previous.put('./apps/career/entry.mjs',new Response('old lazy career'));
  await current.put('./index.html',new Response('current document'));
  await current.put(`./assets/js/main.js?v=${currentVersion}`,new Response('current main'));
  await current.put(`./assets/js/backend.js?v=${currentVersion}`,new Response('current singleton backend'));
  await current.put('./apps/career/entry.mjs',new Response('current lazy career'));
  await worker.emit('activate');
  worker.fetch=async()=>new Response('new code served even for an old URL');
  for(const [file,expected] of [
    ['./apps/career/entry.mjs','old lazy career'],
    ['./assets/js/backend.js?v=1.3.2','old singleton backend']
  ])assert.equal(await (await worker.request(file,{clientId:oldClient.id})).text(),expected);
  assert.equal(await (await worker.request('./index.html',{mode:'navigate',clientId:oldClient.id,resultingClientId:'new-tab'})).text(),'current document');
  assert.equal(await (await worker.request(`./assets/js/backend.js?v=${currentVersion}`,{clientId:'new-tab'})).text(),'current singleton backend');
  assert.equal(await (await worker.request('./apps/career/entry.mjs',{clientId:'new-tab'})).text(),'current lazy career');
  assert.equal((await worker.request('./assets/js/backend.js?v=1.3.2',{clientId:'new-tab'})).type,'error','A current tab cannot cache fresh code under an old version URL');
  assert.equal(await current.match('./assets/js/backend.js?v=1.3.2'),undefined);
  assert.equal(worker.networkCalls,0,'Cached releases must not be overwritten by the deployment');
  assert.equal((await worker.request('./apps/career/uncached-old-module.mjs',{clientId:oldClient.id})).type,'error');
  assert.equal(messages.at(-1).type,'RELEASE_RESOURCE_UNAVAILABLE');
  assert.equal(worker.networkCalls,0,'Missing old code must not be replaced with current code');
  assert.equal(await previous.match('./apps/career/uncached-old-module.mjs'),undefined);
});

test('client bindings survive worker restarts and a second update without moving old tabs forward',async()=>{
  const worker=makeWorker();
  const clients=[{id:'old-tab',url:scope,postMessage(){}},{id:'middle-tab',url:scope,postMessage(){}}];
  worker.activeClients=[clients[0]];
  const oldName=worker.cachePrefix+'v1.3.2-reliability-1';
  await (await worker.cacheStorage.open(oldName)).put('./apps/career/entry.mjs',new Response('1.3.2 career'));
  await (await worker.cacheStorage.open(worker.cacheName)).put('./apps/career/entry.mjs',new Response(currentVersion+' career'));
  await worker.emit('activate');
  await worker.request('./index.html',{mode:'navigate',resultingClientId:clients[1].id});
  const restarted=makeWorker(scope,{stores:worker.stores});
  restarted.fetch=async()=>new Response('wrong fresh code');
  assert.equal(await (await restarted.request('./apps/career/entry.mjs',{clientId:clients[0].id})).text(),'1.3.2 career');
  assert.equal(await (await restarted.request('./apps/career/entry.mjs',{clientId:clients[1].id})).text(),currentVersion+' career');
  const futureSource=workerSource.replaceAll(currentVersion,futureVersion);
  assert.notEqual(futureSource,workerSource,'Synthetic update must change the worker source');
  const next=makeWorker(scope,{stores:worker.stores,source:futureSource});
  assert.notEqual(next.cacheName,worker.cacheName,'The second update must use a distinct cache');
  assert.ok(next.cacheName.startsWith(next.cachePrefix+`v${futureVersion}-`));
  next.activeClients=clients;
  const nextCache=await next.cacheStorage.open(next.cacheName);
  await nextCache.put('./apps/career/entry.mjs',new Response(futureVersion+' career'));
  await nextCache.put('./index.html',new Response(futureVersion+' document'));
  await next.emit('activate');
  next.fetch=async()=>new Response('wrong fresh code');
  for(const [clientId,expected] of [['old-tab','1.3.2 career'],['middle-tab',currentVersion+' career']]){
    assert.equal(await (await next.request('./apps/career/entry.mjs',{clientId})).text(),expected);
  }
  assert.equal(await (await next.request('./index.html',{mode:'navigate',resultingClientId:'new-tab'})).text(),futureVersion+' document');
  assert.equal(await (await next.request('./apps/career/entry.mjs',{clientId:'new-tab'})).text(),futureVersion+' career');
  for(const name of [oldName,worker.cacheName,next.cacheName])assert.ok(next.stores.has(name),'Every live release cache survives both updates');
  assert.equal(next.networkCalls,0);
});

test('release handshake binds only its own in-scope client and module preparation cannot fetch into old releases',async()=>{
  const worker=makeWorker();
  const messages=[];
  const client={id:'announcing-tab',url:scope,postMessage:message=>messages.push(message)};
  const old=await worker.cacheStorage.open(worker.cachePrefix+'v1.3.2-reliability-1');
  const current=await worker.cacheStorage.open(worker.cacheName);
  await old.put('./assets/js/main.js?v=1.3.2',new Response('old main'));
  await old.put('./apps/career/entry.mjs',new Response('old career'));
  await current.put('./apps/career/entry.mjs',new Response('current career'));
  await worker.emit('message',{source:client,data:{type:'BIND_RELEASE',release:'1.3.2',clientId:'forged-client'}});
  assert.equal(messages.at(-1).type,'RELEASE_BOUND');
  assert.equal(await (await worker.request('./apps/career/entry.mjs',{clientId:client.id})).text(),'old career');
  assert.equal(await (await worker.request('./apps/career/entry.mjs',{clientId:'forged-client'})).text(),'current career');
  await worker.emit('message',{source:{...client,id:'outside',url:'https://example.test/other-app/'},data:{type:'BIND_RELEASE',release:'1.3.2'}});
  assert.equal(await (await worker.request('./apps/career/entry.mjs',{clientId:'outside'})).text(),'current career');
  await worker.emit('message',{source:client,data:{type:'PREPARE_MODULE',module:'career'}});
  assert.equal(messages.find(message=>message.type==='MODULE_CACHE_STATUS').ready,false);
  assert.equal(messages.at(-1).type,'RELEASE_RESOURCE_UNAVAILABLE');
  assert.equal(worker.networkCalls,0);
  assert.equal(await old.match('./apps/career/runtime.bundle.mjs'),undefined);
  await worker.emit('message',{source:client,data:{type:'BIND_RELEASE',release:'0.0.1'}});
  assert.equal(messages.at(-1).type,'RELEASE_RESOURCE_UNAVAILABLE');
  assert.equal((await worker.request('./apps/career/entry.mjs',{clientId:client.id})).type,'error');
  assert.equal(worker.networkCalls,0,'A missing historical release must not inherit the current module');
});

test('page boot announces its loaded version after a controller change and only trusts that worker for update notices',async()=>{
  const main=await readFile(path.join(siteRoot,'assets/js/main.js'),'utf8');
  const helper=main.slice(main.indexOf('function connectPageRelease(){'),main.indexOf('async function bootstrap(){'));
  assert.ok(helper.startsWith('function connectPageRelease(){'));
  const listeners=new Map(),sent=[],notices=[];
  const original={postMessage:message=>sent.push(message)};
  const updated={postMessage:message=>sent.push(message)};
  const workers={controller:original,ready:Promise.resolve(),addEventListener:(type,handler)=>listeners.set(type,handler)};
  vm.runInNewContext(helper.replace('import.meta.url',JSON.stringify(scope+'assets/js/main.js?v=1.3.2'))+'\nconnectPageRelease();',{
    URL,navigator:{serviceWorker:workers},CONFIG:{version:currentVersion},getLocale:()=> 'en',toast:(...args)=>notices.push(args)
  });
  await Promise.resolve();
  assert.ok(sent.length>=1);
  assert.ok(sent.every(message=>message.type==='BIND_RELEASE'&&message.release==='1.3.2'));
  workers.controller=updated;
  listeners.get('controllerchange')();
  assert.equal(sent.at(-1).release,'1.3.2');
  listeners.get('message')({source:original,data:{type:'RELEASE_RESOURCE_UNAVAILABLE'}});
  assert.equal(notices.length,0);
  listeners.get('message')({source:updated,data:{type:'RELEASE_RESOURCE_UNAVAILABLE'}});
  assert.equal(notices.length,1);
  assert.match(notices[0][0],/refresh the page after finishing or saving/i);
  assert.equal(notices[0][2],0,'The student can read and dismiss the notice without a countdown');
});

test('hung request falls back to the matching cached file within a finite deadline',async()=>{
  const worker=makeWorker();const cache=await worker.cacheStorage.open(worker.cacheName);
  await cache.put('./data/questions.json',new Response('local questions'));
  worker.fetch=()=>new Promise(()=>{});
  const started=Date.now();assert.equal(await (await worker.request('./data/questions.json')).text(),'local questions');
  assert.ok(Date.now()-started<3000);
});
