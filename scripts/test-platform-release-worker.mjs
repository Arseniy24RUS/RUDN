import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const workerSource=await fs.readFile(new URL('../site/service-worker.js',import.meta.url),'utf8');
const scope='https://test.invalid/RUDN/',hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function release(id,code){const entry=`/RUDN/_releases/${id}/index.html`,main=`/RUDN/_releases/${id}/assets/js/main.js`;const files=new Map([[entry,`<html>${code}</html>`],[main,code]]);const resources={'index.html':{url:entry,sha256:hash(files.get(entry)),bytes:files.get(entry).length,kind:'runtime'},'assets/js/main.js':{url:main,sha256:hash(code),bytes:code.length,kind:'runtime'}};const manifest=JSON.stringify({schema:1,buildId:id,runtimeRoot:`/RUDN/_releases/${id}/`,resources,packs:{shell:Object.keys(resources)}}),target={buildId:id,manifestURL:`/RUDN/_releases/${id}/manifest.json`,manifestSha256:hash(manifest),entryURL:entry};files.set(target.manifestURL,manifest);files.set(`/RUDN/_releases/${id}/release.json`,JSON.stringify(target));return {target,files};}
function harness(pointer,files,{stores=new Map()}={}){
  const listeners=new Map(),clients=[],urlOf=input=>new URL(typeof input==='string'?input:input.url||input.href,scope).href;
  const caches={async open(name){if(!stores.has(name)){const map=new Map();stores.set(name,{async match(input){return map.get(urlOf(input))?.clone();},async put(input,response){map.set(urlOf(input),response.clone());},async delete(input){return map.delete(urlOf(input));},async keys(){return [...map.keys()].map(x=>new Request(x));}});}return stores.get(name);},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
  const h={stores,caches,clients,offline:false,requests:[],async fetch(input){const url=new URL(urlOf(input));h.requests.push(url.pathname);if(h.offline)throw new Error('offline');return new Response(files.get(url.pathname)||'missing',{status:files.has(url.pathname)?200:404});},async emit(name,event={}){const pending=[];listeners.get(name)({...event,waitUntil:p=>pending.push(p)});await Promise.all(pending);},async request(value,{clientId='',mode='cors',resultingClientId=''}={}){let result;await h.emit('fetch',{clientId,resultingClientId,request:{url:urlOf(value),method:'GET',mode},respondWith:p=>result=p});return await result;}};
  const context=vm.createContext({URL,Request,Response,crypto:crypto.webcrypto,AbortController,setTimeout,clearTimeout,caches,fetch:input=>h.fetch(input),self:{registration:{scope},addEventListener:(name,fn)=>listeners.set(name,fn),skipWaiting:async()=>{},clients:{matchAll:async()=>clients,get:async id=>clients.find(c=>c.id===id),claim:async()=>{}}}});
  vm.runInContext(workerSource.replace('const PLATFORM_RELEASE=null;',`const PLATFORM_RELEASE=${JSON.stringify(pointer)};`),context);return h;
}

test('cold evicted HTML navigation passes through the real host 404 while integrity failures stay closed',async()=>{
  const b=release('b'.repeat(32),'new'),files=new Map(b.files),h=harness({schema:1,current:b.target,previous:null},files),original=h.fetch;
  h.fetch=async input=>{const url=new URL(typeof input==='string'?input:input.url||input.href,scope);if(url.pathname.endsWith('/index.html')&&!files.has(url.pathname))return new Response('<html>Recovery entry</html>',{status:404,headers:{'content-type':'text/html'}});return original(input);};
  const missing=await h.request(`_releases/${'a'.repeat(32)}/index.html`,{mode:'navigate',resultingClientId:'cold'});assert.equal(missing.status,404);assert.equal(await missing.text(),'<html>Recovery entry</html>');
  files.set(b.target.entryURL,'corrupt');await assert.rejects(h.request(b.target.entryURL,{mode:'navigate',resultingClientId:'corrupt'}),/release\/integrity/);
});

test('current-only installation caches the verified manifest shell without fetching legacy root scripts',async()=>{
  const current=release('c'.repeat(32),'current'),pointer={schema:1,retention:'current-only',current:current.target,previous:null},files=new Map(current.files);
  files.set('/RUDN/release.json',JSON.stringify(pointer));const h=harness(pointer,files);await h.emit('install');
  assert.ok(h.requests.includes(current.target.manifestURL));assert.ok(h.requests.includes(current.target.entryURL));assert.ok(h.requests.includes(`/RUDN/_releases/${current.target.buildId}/assets/js/main.js`));
  assert.ok(!h.requests.includes('/RUDN/assets/js/main.js'));assert.ok(!h.requests.some(name=>name.includes('/_releases/')&&!name.includes(current.target.buildId)));
  h.offline=true;assert.equal(await (await h.request(current.target.entryURL,{mode:'navigate',resultingClientId:'new'})).text(),'<html>current</html>');
});

test('exact SW stages verified shell, keeps two tab bindings and serves offline immutable paths',async()=>{
  const a=release('a'.repeat(32),'old'),b=release('b'.repeat(32),'new'),files=new Map([...a.files,...b.files]);files.set('/RUDN/release.json',JSON.stringify({schema:1,current:b.target,previous:a.target}));
  const h=harness({schema:1,current:b.target,previous:a.target},files),messages=[];const first={id:'first',url:scope,postMessage:m=>messages.push(m)},second={id:'second',url:scope,postMessage:m=>messages.push(m)};h.clients.push(first,second);
  await h.emit('install');await h.emit('message',{source:first,data:{type:'BIND_BUILD',...a.target}});await h.emit('message',{source:second,data:{type:'BIND_BUILD',...b.target}});await h.emit('activate');
  assert.equal(await (await h.request('assets/js/main.js',{clientId:'first'})).text(),'old');assert.equal(await (await h.request('assets/js/main.js',{clientId:'second'})).text(),'new');
  await h.emit('message',{source:first,data:{type:'BIND_RELEASE',release:'1.3.10'}});assert.equal(await (await h.request('assets/js/main.js',{clientId:'first'})).text(),'old');
  h.offline=true;assert.equal(await (await h.request(b.target.entryURL,{mode:'navigate',resultingClientId:'third'})).text(),'<html>new</html>');assert.equal(await (await h.request('assets/js/main.js',{clientId:'first'})).text(),'old');
  const restarted=harness({schema:1,current:b.target,previous:a.target},files,{stores:h.stores});restarted.offline=true;assert.equal(await (await restarted.request('assets/js/main.js',{clientId:'first'})).text(),'old');
  assert.ok(messages.some(m=>m.type==='BUILD_BOUND'&&m.buildId===a.target.buildId));
});
test('old worker can prepare newly deployed immutable release; wrong bytes never activate',async()=>{
  const a=release('a'.repeat(32),'old'),b=release('b'.repeat(32),'new'),files=new Map([...a.files,...b.files]);const h=harness({schema:1,current:a.target,previous:null},files);
  await h.emit('install');assert.equal(await (await h.request(b.target.manifestURL)).json().then(x=>x.buildId),b.target.buildId);
  const corruptFiles=new Map(b.files);corruptFiles.set(`/RUDN/_releases/${b.target.buildId}/assets/js/main.js`,'corrupt');const corrupt=harness({schema:1,current:b.target,previous:null},corruptFiles);await assert.rejects(corrupt.emit('install'),/release\/integrity/);
});

test('current-only navigation leaves cached retired HTML and opens the published build',async()=>{
  const a=release('a'.repeat(32),'old'),b=release('b'.repeat(32),'new'),pointer={schema:1,retention:'current-only',current:b.target,previous:null};
  const files=new Map([...a.files,...b.files]);files.set('/RUDN/release.json',JSON.stringify(pointer));
  const old=harness({schema:1,retention:'current-only',current:a.target,previous:null},files);await old.emit('install');
  const start=old.requests.length,response=await old.request(a.target.entryURL+'?language=zh',{mode:'navigate',resultingClientId:'new-session'});
  assert.equal(response.status,302);assert.equal(response.headers.get('location'),scope.replace(/\/$/,'')+b.target.entryURL.slice('/RUDN'.length)+'?language=zh');
  assert.ok(!old.requests.slice(start).some(name=>name.includes('/_releases/'+a.target.buildId+'/')));
  assert.equal(await (await old.request(b.target.entryURL,{mode:'navigate',resultingClientId:'new-session'})).text(),'<html>new</html>');
  old.offline=true;assert.equal(await (await old.request(b.target.entryURL,{mode:'navigate',resultingClientId:'offline-session'})).text(),'<html>new</html>');
});
