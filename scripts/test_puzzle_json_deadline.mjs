import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

// Exercise the real classic engine method, without browser/game setup. Only
// transport and timer primitives are controlled; the 45-second value is real.
const source=await readFile(new URL('../site/assets/js/puzzle-engine.js',import.meta.url),'utf8');
const start=source.indexOf('  async function fetchJson(');
const end=source.indexOf('\n  function bestTopologyObject(',start);
assert.ok(start>=0&&end>start,'The actual fetchJson method must be available');
const create=new Function('scopedFetch','setTimeout','clearTimeout','AbortController','DOMException',
  `${source.slice(start,end)};return fetchJson;`);
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const url='/api/puzzle/data/country-adm1/ZWE';

function harness(fetchImpl){
  const timers=new Map(),delays=[],listeners=new Set(),controller=new AbortController();
  const signal=controller.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
  signal.addEventListener=(kind,listener,options)=>{if(kind==='abort')listeners.add(listener);return add(kind,listener,options)};
  signal.removeEventListener=(kind,listener,options)=>{if(kind==='abort')listeners.delete(listener);return remove(kind,listener,options)};
  let counter=0,clears=0;
  const fetch=create(fetchImpl,(callback,delay)=>{const id=++counter;delays.push(delay);timers.set(id,callback);return id},
    id=>{clears++;timers.delete(id)},AbortController,DOMException);
  return{fetch,controller,signal,delays,deadline(){assert.equal(timers.size,1);assert.deepEqual(delays,[45000]);[...timers.values()][0]()},
    clean(){assert.equal(timers.size,0,'Timer is released');assert.equal(listeners.size,0,'Parent listener is released')},
    get clears(){return clears}};
}
async function outcome(promise){
  const result=await Promise.race([promise.then(value=>({status:'fulfilled',value}),error=>({status:'rejected',error})),
    turn().then(()=>({status:'pending'}))]);
  assert.notEqual(result.status,'pending','Independent cancellation must settle even when native work ignores abort');
  return result;
}
async function rejected(promise,name){const result=await outcome(promise);assert.equal(result.status,'rejected');assert.equal(result.error.name,name);return result.error}

test('ordinary JSON keeps payload identity, request options and the 45000ms deadline',async()=>{
  const value={features:[{id:'synthetic'}]},body='synthetic request';let seen,child;
  const h=harness(async(request,options)=>{seen={request,options};child=options.signal;return{ok:true,json:async()=>value}});
  const result=await h.fetch(url,{signal:h.signal,method:'POST',body,credentials:'omit',headers:{Accept:'application/geo+json','X-Test':'safe'}});
  assert.equal(result,value);assert.equal(seen.request,url);assert.equal(seen.options.method,'POST');assert.equal(seen.options.body,body);
  assert.equal(seen.options.credentials,'omit');assert.deepEqual(seen.options.headers,{Accept:'application/geo+json','X-Test':'safe'});
  assert.notEqual(child,h.signal);assert.deepEqual(h.delays,[45000]);assert.equal(h.clears,1);h.clean();
  h.controller.abort();assert.equal(child.aborted,false,'Settled request is detached from the parent');
});

test('default credentials and Accept header are unchanged',async()=>{
  let options;const h=harness(async(_,received)=>{options=received;return{ok:true,json:async()=>null}});
  assert.equal(await h.fetch(url),null);assert.equal(options.credentials,'same-origin');assert.deepEqual(options.headers,{Accept:'application/json'});h.clean();
});

for(const stage of ['headers','body'])test(`${stage} ignoring abort still rejects at the independent deadline`,async()=>{
  let child,bodyCalls=0;const started=deferred();
  const h=harness((_,options)=>{child=options.signal;if(stage==='headers'){started.resolve();return new Promise(()=>{})}
    return Promise.resolve({ok:true,json:()=>{bodyCalls++;started.resolve();return new Promise(()=>{})}})});
  const pending=h.fetch(url,{signal:h.signal});await started.promise;h.deadline();await rejected(pending,'TimeoutError');
  assert.equal(child.aborted,true);assert.equal(bodyCalls,stage==='body'?1:0);h.clean();
});

test('already-aborted parent does not create transport, body work, timer or listener',async()=>{
  let calls=0;const h=harness(async()=>{calls++;return{ok:true,json:async()=>null}});h.controller.abort();
  await rejected(h.fetch(url,{signal:h.signal}),'AbortError');assert.equal(calls,0);assert.deepEqual(h.delays,[]);h.clean();
});

for(const stage of ['headers','body'])test(`parent abort rejects while ${stage} ignores native cancellation`,async()=>{
  const started=deferred();let child;const h=harness((_,options)=>{child=options.signal;
    if(stage==='headers'){started.resolve();return new Promise(()=>{})}
    return Promise.resolve({ok:true,json:()=>{started.resolve();return new Promise(()=>{})}})});
  const pending=h.fetch(url,{signal:h.signal});await started.promise;h.controller.abort();await rejected(pending,'AbortError');
  assert.equal(child.aborted,true);h.clean();
});

test('deadline remains the winner when native abort immediately rejects transport',async()=>{
  const started=deferred();const h=harness((_,options)=>new Promise((_,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new DOMException('Synthetic native abort','AbortError')),{once:true});started.resolve();
  }));const pending=h.fetch(url,{signal:h.signal});await started.promise;h.deadline();await rejected(pending,'TimeoutError');h.clean();
});

for(const [label,ok,status,payload,error] of [
  ['HTTP detail',false,503,{detail:'Synthetic detail'},'Synthetic detail'],
  ['HTTP message',false,403,{message:'Synthetic message'},'Synthetic message'],
  ['HTTP status fallback',false,404,{},'HTTP 404'],
])test(`${label} remains unchanged`,async()=>{
  const h=harness(async()=>({ok,status,json:async()=>payload}));await assert.rejects(h.fetch(url,{signal:h.signal}),{message:error});h.clean();
});

for(const ok of [true,false])test(`ordinary JSON rejection remains ${ok?'null':'HTTP status error'}`,async()=>{
  const h=harness(async()=>({ok,status:502,json:async()=>{throw new SyntaxError('Synthetic invalid JSON')}}));
  if(ok)assert.equal(await h.fetch(url,{signal:h.signal}),null);else await assert.rejects(h.fetch(url,{signal:h.signal}),{message:'HTTP 502'});
  h.clean();
});

test('synchronous transport failure preserves the original error and cleans resources',async()=>{
  const original=new TypeError('Synthetic transport failure'),h=harness(()=>{throw original});
  assert.equal(await h.fetch(url,{signal:h.signal}).catch(error=>error),original);h.clean();
});

for(const stage of ['headers','body'])for(const reason of ['deadline','parent'])for(const finish of ['resolve','reject'])
test(`late ${stage} ${finish} after ${reason} cannot succeed or become unhandled`,async()=>{
  const late=deferred(),started=deferred(),unhandled=[];let bodyCalls=0;
  const observe=error=>unhandled.push(error);process.on('unhandledRejection',observe);
  try{
    const h=harness(()=>{if(stage==='headers'){started.resolve();return late.promise}
      return Promise.resolve({ok:true,json:()=>{bodyCalls++;started.resolve();return late.promise}})});
    const pending=h.fetch(url,{signal:h.signal});await started.promise;
    if(reason==='deadline')h.deadline();else h.controller.abort();
    const winner=await rejected(pending,reason==='deadline'?'TimeoutError':'AbortError');
    if(finish==='reject')late.reject(new SyntaxError('Synthetic late error'));
    else late.resolve(stage==='headers'?{ok:true,json:()=>{bodyCalls++;return Promise.resolve({late:true})}}:{late:true});
    await turn();await turn();assert.equal(await pending.catch(error=>error),winner);assert.deepEqual(unhandled,[]);
    assert.equal(bodyCalls,stage==='body'?1:0,'Late headers do not start JSON work');h.clean();
  }finally{process.off('unhandledRejection',observe)}
});
