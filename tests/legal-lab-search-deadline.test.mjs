import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Worker as NodeWorker} from 'node:worker_threads';
import {ReaderSearch} from '../site/apps/legal-lab/lib/reader-data.mjs';

const base=new URL('../site/apps/legal-lab/lib/',import.meta.url);
const manifest={docId:'fixture',locale:'ru',contentVersion:'test',search:{file:'index.json',sha256:'pinned-index'}};
const data=new TextEncoder().encode('{"index":"worker-only"}').buffer;
const nativeTimeout=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;
const sleep=ms=>new Promise(resolve=>nativeTimeout(resolve,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const response=bytes=>({ok:true,status:200,arrayBuffer:async()=>bytes});
const timeoutError=error=>error?.name==='TimeoutError'&&error?.code==='reader/timeout';
async function outcome(promise,limit=220){let timer;try{return await Promise.race([promise.then(value=>({status:'fulfilled',value}),reason=>({status:'rejected',reason})),new Promise(resolve=>{timer=nativeTimeout(()=>resolve({status:'watchdog'}),limit);})]);}finally{nativeClear(timer);}}
async function rejected(promise,predicate){const result=await outcome(promise);assert.equal(result.status,'rejected','Bounded search must finish before the test watchdog');assert.ok(predicate(result.reason),`Unexpected ${result.reason?.name}/${result.reason?.code||''}`);return result.reason;}
async function until(predicate){const end=Date.now()+220;while(!predicate()){assert.ok(Date.now()<end,'Expected asynchronous search state');await sleep(2);}}
function fixture(t,{fetcher=async()=>response(data),timeoutMs=30,signal}={}){
  const workers=[];
  class Worker{
    constructor(url,options){this.url=url;this.options=options;this.messages=[];this.transfers=[];this.terminated=false;workers.push(this);}
    postMessage(message,transfer){this.messages.push(message);this.transfers.push(transfer);}
    terminate(){this.terminated=true;}
    emit(message){this.onmessage?.({data:message});}
  }
  const search=new ReaderSearch(base,{WorkerClass:Worker,fetch:fetcher,timeoutMs,signal});
  t.after(()=>search.destroy());
  return {search,workers};
}
const pendingId=worker=>worker.messages.findLast(message=>message.type==='search').request;
const sendResult=(worker,value={hits:[],total:0,page:0,pages:1})=>worker.emit({type:'result',request:pendingId(worker),result:value});
function empty(search){assert.equal(search.stats().searchIndexes,0);assert.equal(search.stats().pendingSearches,0);assert.equal(search.stats().searchReady,false);assert.equal(search.key,null);}

for(const stage of ['headers','body','worker-ready']){
  test(`initialization deadline includes non-cooperative ${stage} and releases worker/index`,async t=>{
    let nativeSignal;
    const {search,workers}=fixture(t,{fetcher:async(_url,options)=>{
      nativeSignal=options.signal;
      if(stage==='headers')return new Promise(()=>{});
      return {ok:true,status:200,arrayBuffer:async()=>stage==='body'?new Promise(()=>{}):data};
    }});
    const request=search.search(manifest,'word');
    await rejected(request,timeoutError);
    assert.equal(nativeSignal.aborted,true);assert.equal(workers[0].terminated,true);empty(search);
  });
}

test('ready worker with a non-settling query result is bounded and can be recreated',async t=>{
  const {search,workers}=fixture(t,{timeoutMs:200});
  const warm=search.search(manifest,'warm');await until(()=>workers[0].messages.some(m=>m.type==='index'));workers[0].emit({type:'ready'});sendResult(workers[0]);await warm;
  search.timeoutMs=30;const first=search.search(manifest,'first');
  await rejected(first,timeoutError);empty(search);
  search.timeoutMs=200;
  const second=search.search(manifest,'second');await until(()=>workers[1].messages.some(m=>m.type==='index'));workers[1].emit({type:'ready'});sendResult(workers[1]);
  assert.equal((await second).total,0);assert.equal(workers[0].terminated,true);assert.equal(workers[1].terminated,false);
});

test('an initialization timeout with no query still releases the worker',async t=>{
  const {search,workers}=fixture(t,{fetcher:async()=>new Promise(()=>{})});
  search.activate(manifest);await until(()=>workers[0].terminated);empty(search);
});

test('request budget is scheduled before pending initialization and is not restarted on ready',async t=>{
  const deadlines=[];
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{deadlines.push(ms);return nativeTimeout(fn,ms,...args);});
  const gate=deferred(),{search,workers}=fixture(t,{fetcher:async()=>gate.promise,timeoutMs:1000});
  const request=search.search(manifest,'word');assert.deepEqual(deadlines,[1000,1000]);assert.equal(workers[0].messages.some(m=>m.type==='index'),false);gate.resolve(response(data));
  await until(()=>workers[0].messages.some(m=>m.type==='index'));workers[0].emit({type:'ready'});
  sendResult(workers[0]);assert.equal((await request).total,0);assert.deepEqual(deadlines,[1000,1000],'Ready does not restart a request budget');
});

test('request cancellation settles immediately but leaves shared initialization for a newer query',async t=>{
  const gate=deferred(),oldController=new AbortController(),{search,workers}=fixture(t,{fetcher:async()=>gate.promise,timeoutMs:200});
  const first=search.search(manifest,'first',{signal:oldController.signal}),firstRejected=rejected(first,error=>error?.name==='AbortError');
  const second=search.search(manifest,'second');await firstRejected;oldController.abort();
  assert.equal(workers.length,1);assert.equal(workers[0].terminated,false);assert.equal(search.stats().pendingSearches,1);
  gate.resolve(response(data));await until(()=>workers[0].messages.some(m=>m.type==='index'));workers[0].emit({type:'ready'});sendResult(workers[0]);
  assert.equal((await second).total,0);assert.equal(search.stats().searchReady,true);
});

test('individual parent abort during ignored body settles without terminating shared worker',async t=>{
  const parent=new AbortController(),gate=deferred(),{search,workers}=fixture(t,{fetcher:async()=>({ok:true,arrayBuffer:()=>gate.promise}),timeoutMs:200});
  const first=search.search(manifest,'first',{signal:parent.signal});parent.abort();await rejected(first,error=>error?.name==='AbortError');
  assert.equal(workers[0].terminated,false);
  const second=search.search(manifest,'second');gate.resolve(data);await until(()=>workers[0].messages.some(m=>m.type==='index'));workers[0].emit({type:'ready'});sendResult(workers[0]);
  assert.equal((await second).total,0);
});

for(const action of ['parent-abort','destroy']){
  test(`${action} settles pending search immediately and aborts ignored index transport`,async t=>{
    const parent=new AbortController();let nativeSignal;
    const {search,workers}=fixture(t,{signal:parent.signal,fetcher:async(_url,options)=>{nativeSignal=options.signal;return new Promise(()=>{});},timeoutMs:1000});
    const request=search.search(manifest,'word');await until(()=>nativeSignal);
    if(action==='destroy')search.destroy();else parent.abort();
    await rejected(request,error=>error?.name==='AbortError');assert.equal(nativeSignal.aborted,true);assert.equal(workers[0].terminated,true);empty(search);
  });
}

test('already aborted search never creates a worker or fetch',async t=>{
  const parent=new AbortController();parent.abort();let fetches=0;
  const {search,workers}=fixture(t,{fetcher:async()=>{fetches++;return response(data);}});
  await rejected(search.search(manifest,'word',{signal:parent.signal}),error=>error?.name==='AbortError');
  assert.equal(workers.length,0);assert.equal(fetches,0);
});

test('late callbacks from a terminated worker cannot mark or fail its replacement',async t=>{
  const {search,workers}=fixture(t,{timeoutMs:200}),first=search.search(manifest,'first'),oldRejected=rejected(first,error=>error?.name==='AbortError');
  const second=search.search({...manifest,docId:'other'},'second');second.catch(()=>{});await oldRejected;
  workers[0].emit({type:'ready'});assert.equal(search.stats().searchReady,false,'Only the active worker may become ready');
  workers[0].onerror?.(new Error('synthetic-late-worker-error'));assert.equal(search.stats().pendingSearches,1);assert.equal(workers[1].terminated,false);
  workers[0].emit({type:'result',request:pendingId(workers[0]),result:{total:99}});
  await until(()=>workers[1].messages.some(m=>m.type==='index'));workers[1].emit({type:'ready'});sendResult(workers[1]);assert.equal((await second).total,0);
});

for(const late of ['resolve','reject']){
  test(`late index ${late} after timeout cannot post bytes or reject a new search`,async t=>{
    const gate=deferred(),unhandled=[];let fetches=0;
    const listener=error=>unhandled.push(error);process.on('unhandledRejection',listener);t.after(()=>process.off('unhandledRejection',listener));
    const {search,workers}=fixture(t,{fetcher:async()=>++fetches===1?gate.promise:response(data)});
    await rejected(search.search(manifest,'first'),timeoutError);
    search.timeoutMs=200;
    const next=search.search(manifest,'second');await until(()=>workers[1].messages.some(m=>m.type==='index'));
    if(late==='resolve')gate.resolve(response(data));else gate.reject(new Error('synthetic-late-transport'));
    await sleep(5);workers[1].emit({type:'ready'});sendResult(workers[1]);assert.equal((await next).total,0);
    assert.equal(workers[0].messages.some(m=>m.type==='index'),false);assert.deepEqual(unhandled,[]);
  });
}

test('index remains a transferred ArrayBuffer with existing fetch options and worker pins',async t=>{
  let received;
  const {search,workers}=fixture(t,{fetcher:async(url,options)=>{received={url,options};return response(data);},timeoutMs:200});
  const parse=JSON.parse;
  t.mock.method(JSON,'parse',function(text,...rest){assert.notEqual(text,'{"index":"worker-only"}','Index parsing belongs to the worker');return Reflect.apply(parse,this,[text,...rest]);});
  const request=search.search(manifest,'word');await until(()=>workers[0].messages.some(m=>m.type==='index'));
  const indexPosition=workers[0].messages.findIndex(m=>m.type==='index');
  assert.equal(workers[0].messages[indexPosition].bytes,data);assert.deepEqual(workers[0].transfers[indexPosition],[data]);
  assert.equal(workers[0].messages[0].sha256,manifest.search.sha256);assert.equal(workers[0].messages[0].contentVersion,'test');
  assert.equal(received.options.credentials,'same-origin');assert.equal(received.options.cache,'no-cache');
  workers[0].emit({type:'ready'});sendResult(workers[0]);assert.equal((await request).total,0);
});

test('HTTP and body errors settle, release the worker and permit ordinary retry',async t=>{
  let mode='http';
  const {search,workers}=fixture(t,{fetcher:async()=>mode==='http'?{ok:false,status:503}:mode==='body'?{ok:true,arrayBuffer:async()=>{throw new Error('synthetic-body');}}:response(data),timeoutMs:200});
  await rejected(search.search(manifest,'one'),error=>!timeoutError(error));empty(search);
  mode='body';await rejected(search.search(manifest,'two'),error=>!timeoutError(error));empty(search);
  mode='ok';const request=search.search(manifest,'three');await until(()=>workers[2].messages.some(m=>m.type==='index'));workers[2].emit({type:'ready'});sendResult(workers[2]);assert.equal((await request).total,0);
});

test('all operation timers and per-query abort listeners clear on success/cancel/destroy',async t=>{
  const timers=new Set(),listeners=new Set(),parent=new AbortController();
  const add=parent.signal.addEventListener.bind(parent.signal),remove=parent.signal.removeEventListener.bind(parent.signal);
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{const id=nativeTimeout(fn,ms,...args);timers.add(id);return id;});
  t.mock.method(globalThis,'clearTimeout',id=>{timers.delete(id);nativeClear(id);});
  t.mock.method(parent.signal,'addEventListener',(type,fn,options)=>{if(type==='abort')listeners.add(fn);return add(type,fn,options);});
  t.mock.method(parent.signal,'removeEventListener',(type,fn,options)=>{if(type==='abort')listeners.delete(fn);return remove(type,fn,options);});
  t.after(()=>{for(const timer of timers)nativeClear(timer);});
  const {search,workers}=fixture(t,{timeoutMs:200});
  const first=search.search(manifest,'one',{signal:parent.signal});await until(()=>workers[0].messages.some(m=>m.type==='index'));workers[0].emit({type:'ready'});sendResult(workers[0]);await first;
  await sleep(1);assert.equal(timers.size,0);assert.equal(listeners.size,0);
  const second=search.search(manifest,'two',{signal:parent.signal});search.cancel();await rejected(second,error=>error?.name==='AbortError');assert.equal(timers.size,0);assert.equal(listeners.size,0);
  const third=search.search(manifest,'three',{signal:parent.signal});search.destroy();await rejected(third,error=>error?.name==='AbortError');assert.equal(timers.size,0);assert.equal(listeners.size,0);
});

test('real worker still rejects checksum/schema failures and accepts the next valid index',async t=>{
  class Worker{
    constructor(url){this.inner=new NodeWorker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=data=>parentPort.postMessage(data);import(${JSON.stringify(url.href)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});this.inner.on('message',data=>this.onmessage?.({data}));this.inner.on('error',error=>this.onerror?.(error));}
    postMessage(data,transfer){this.inner.postMessage(data,transfer);}
    terminate(){void this.inner.terminate();}
  }
  let schema=1;
  const payload=()=>new TextEncoder().encode(JSON.stringify({schema,docId:'fixture',locale:'ru',contentVersion:'test',encoding:'indexed-v1',rows:[['unit','section','word','Word']]}));
  const search=new ReaderSearch(base,{WorkerClass:Worker,timeoutMs:1500,fetch:async()=>response(payload().buffer)});t.after(()=>search.destroy());
  await assert.rejects(search.search({...manifest,search:{file:'index.json',sha256:'0'.repeat(64)}},'word'),error=>error.code==='reader/search-hash');empty(search);
  schema=2;const invalid={...manifest,search:{file:'index.json',sha256:createHash('sha256').update(payload()).digest('hex')}};
  await assert.rejects(search.search(invalid,'word'),error=>error.code==='reader/search-index');empty(search);
  schema=1;const valid={...manifest,search:{file:'index.json',sha256:createHash('sha256').update(payload()).digest('hex')}};
  const result=await search.search(valid,'word');assert.equal(result.total,1);assert.equal(result.hits[0].id,'unit');
});
