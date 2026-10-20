import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Corpus} from '../site/apps/legal-lab/lib/corpus.mjs';

const base=new URL('https://reader.test/apps/legal-lab/');
const originalSetTimeout=globalThis.setTimeout;
const originalClearTimeout=globalThis.clearTimeout;
const sleep=ms=>new Promise(resolve=>originalSetTimeout(resolve,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const bytes=text=>new TextEncoder().encode(text).buffer;
const goodBytes=bytes('{"value":7}');
const sha=value=>createHash('sha256').update(new Uint8Array(value)).digest('hex');
const response=value=>({ok:true,status:200,arrayBuffer:async()=>value});
const abortError=error=>error?.name==='AbortError';
const timeoutError=error=>error?.name==='TimeoutError'&&error?.code==='reader/timeout';
async function outcome(promise,limit=200){
  let timer;
  try{return await Promise.race([promise.then(value=>({status:'fulfilled',value}),reason=>({status:'rejected',reason})),new Promise(resolve=>{timer=originalSetTimeout(()=>resolve({status:'watchdog'}),limit);})]);}
  finally{originalClearTimeout(timer);}
}
async function rejectsBounded(promise,predicate){
  const result=await outcome(promise);
  assert.equal(result.status,'rejected','The operation must reject before the independent test watchdog');
  assert.ok(predicate(result.reason),`Unexpected rejection class/code: ${result.reason?.name}/${result.reason?.code||''}`);
  return result.reason;
}
async function until(predicate){
  const end=Date.now()+200;
  while(!predicate()){assert.ok(Date.now()<end,'Expected bounded asynchronous state');await sleep(2);}
}
function fixture(t,{parent}={}){
  const corpus=new Corpus(base,{signal:parent?.signal});
  t.after(()=>corpus.destroy());
  return corpus;
}
function delayedStage(t,stage){
  const gate=deferred(),started=deferred(),calls={fetch:0,body:0,digest:0,signal:null};
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    calls.fetch++;calls.signal=options.signal;
    if(stage==='headers'){started.resolve();return gate.promise;}
    return {ok:true,status:200,arrayBuffer:async()=>{
      calls.body++;
      if(stage==='body'){started.resolve();return gate.promise;}
      return goodBytes;
    }};
  });
  if(stage==='digest')t.mock.method(crypto.subtle,'digest',async()=>{calls.digest++;started.resolve();return gate.promise;});
  return {gate,started:started.promise,calls,finish(){gate.resolve(stage==='headers'?response(goodBytes):stage==='body'?goodBytes:new Uint8Array(Buffer.from(sha(goodBytes),'hex')).buffer);}};
}

for(const stage of ['headers','body','digest']){
  test(`independent deadline rejects non-cooperative ${stage}`,async t=>{
    const corpus=fixture(t),delayed=delayedStage(t,stage);
    const request=corpus.json('data/fixture.json',stage==='digest'?sha(goodBytes):null,{timeoutMs:25});
    await delayed.started;
    await rejectsBounded(request,timeoutError);
    assert.equal(delayed.calls.signal.aborted,true,'The native operation also receives abort');
  });

  test(`parent cancellation rejects immediately during non-cooperative ${stage}`,async t=>{
    const parent=new AbortController(),corpus=fixture(t),delayed=delayedStage(t,stage);
    const request=corpus.json('data/fixture.json',stage==='digest'?sha(goodBytes):null,{signal:parent.signal,timeoutMs:1000});
    await delayed.started;parent.abort();
    await rejectsBounded(request,abortError);
    assert.equal(delayed.calls.signal.aborted,true);
  });

  for(const late of ['resolve','reject']){
    test(`late ${stage} ${late} cannot replace deadline or escape as unhandled rejection`,async t=>{
      const corpus=fixture(t),delayed=delayedStage(t,stage),unhandled=[];
      const listener=error=>unhandled.push(error);process.on('unhandledRejection',listener);t.after(()=>process.off('unhandledRejection',listener));
      const request=corpus.json('data/fixture.json',stage==='digest'?sha(goodBytes):null,{timeoutMs:25});
      await delayed.started;const winner=await rejectsBounded(request,timeoutError);
      if(late==='resolve')delayed.finish();else delayed.gate.reject(new Error('synthetic-late-failure'));
      await sleep(12);
      const final=await outcome(request);
      assert.equal(final.reason,winner);assert.deepEqual(unhandled,[]);
      if(stage==='headers')assert.equal(delayed.calls.body,0,'A late header response must not start reading its body');
    });
  }
}

test('already-aborted request does not call fetch',async t=>{
  const parent=new AbortController();parent.abort();let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return response(goodBytes);});
  await rejectsBounded(fixture(t).json('data/fixture.json',null,{signal:parent.signal}),abortError);
  assert.equal(calls,0);
});

test('corpus-level cancellation still applies when a different request signal is supplied',async t=>{
  const parent=new AbortController(),requestController=new AbortController(),corpus=fixture(t,{parent}),delayed=delayedStage(t,'body');
  const request=corpus.json('data/fixture.json',null,{signal:requestController.signal,timeoutMs:1000});
  await delayed.started;parent.abort();
  await rejectsBounded(request,abortError);
  assert.equal(requestController.signal.aborted,false);
  assert.equal(delayed.calls.signal.aborted,true);
});

test('ordinary JSON/checksum and original URL/HTTP options remain unchanged',async t=>{
  let received;
  t.mock.method(globalThis,'fetch',async(url,options)=>{received={url:String(url),options};return response(goodBytes);});
  const value=await fixture(t).json('data/fixture.json',sha(goodBytes),{timeoutMs:200});
  assert.deepEqual(value,{value:7});
  assert.equal(received.url,'https://reader.test/apps/legal-lab/data/fixture.json');
  assert.equal(received.options.credentials,'same-origin');assert.equal(received.options.cache,'no-cache');
  assert.equal(received.options.signal.aborted,false);
});

test('HTTP errors preserve status/message and do not read the body',async t=>{
  let bodyCalls=0;
  t.mock.method(globalThis,'fetch',async()=>({ok:false,status:503,arrayBuffer:async()=>{bodyCalls++;return goodBytes;}}));
  await assert.rejects(fixture(t).json('data/fixture.json'),{message:'Не удалось загрузить data/fixture.json: HTTP 503'});
  assert.equal(bodyCalls,0);
});

test('integrity mismatch remains an error and invalid JSON remains SyntaxError',async t=>{
  t.mock.method(globalThis,'fetch',async()=>response(goodBytes));
  const corpus=fixture(t);
  await assert.rejects(corpus.json('data/fixture.json','0'.repeat(64)),{message:'Контрольная сумма документа не совпадает. Обновите материалы.'});
  t.mock.method(globalThis,'fetch',async()=>response(bytes('{invalid')));
  await assert.rejects(corpus.json('data/fixture.json'),SyntaxError);
});

test('native network and body failures preserve their original identity',async t=>{
  const corpus=fixture(t),network=new TypeError('synthetic-network'),body=new Error('synthetic-body');
  t.mock.method(globalThis,'fetch',async()=>{throw network;});
  await assert.rejects(corpus.json('data/fixture.json'),error=>error===network);
  t.mock.method(globalThis,'fetch',async()=>({ok:true,status:200,arrayBuffer:async()=>{throw body;}}));
  await assert.rejects(corpus.json('data/fixture.json'),error=>error===body);
});

test('production default is 10000ms and cancellation clears its timer',async t=>{
  const scheduled=new Map(),delays=[];
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{const id=originalSetTimeout(fn,ms,...args);scheduled.set(id,ms);delays.push(ms);return id;});
  t.mock.method(globalThis,'clearTimeout',id=>{scheduled.delete(id);originalClearTimeout(id);});
  t.after(()=>{for(const id of scheduled.keys())originalClearTimeout(id);});
  const parent=new AbortController(),corpus=fixture(t),delayed=delayedStage(t,'headers');
  const request=corpus.json('data/fixture.json',null,{signal:parent.signal});
  await delayed.started;parent.abort();await rejectsBounded(request,abortError);
  assert.deepEqual(delays,[10000]);assert.equal(scheduled.size,0);
});

for(const end of ['success','http','timeout','abort']){
  test(`timer and parent abort listeners are removed after ${end}`,async t=>{
    const parent=new AbortController(),corpus=fixture(t),listeners=new Set(),timers=new Set();
    const add=parent.signal.addEventListener.bind(parent.signal),remove=parent.signal.removeEventListener.bind(parent.signal);
    t.mock.method(parent.signal,'addEventListener',(type,fn,options)=>{if(type==='abort')listeners.add(fn);return add(type,fn,options);});
    t.mock.method(parent.signal,'removeEventListener',(type,fn,options)=>{if(type==='abort')listeners.delete(fn);return remove(type,fn,options);});
    t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{const id=originalSetTimeout(fn,ms,...args);timers.add(id);return id;});
    t.mock.method(globalThis,'clearTimeout',id=>{timers.delete(id);originalClearTimeout(id);});
    t.after(()=>{for(const id of timers)originalClearTimeout(id);});
    let delayed;
    if(end==='timeout'||end==='abort')delayed=delayedStage(t,'headers');
    else t.mock.method(globalThis,'fetch',async()=>end==='http'?{ok:false,status:404}:response(goodBytes));
    const request=corpus.json('data/fixture.json',null,{signal:parent.signal,timeoutMs:end==='timeout'?25:1000});
    if(delayed)await delayed.started;if(end==='abort')parent.abort();
    const result=await outcome(request);
    assert.equal(result.status,end==='success'?'fulfilled':'rejected');
    if(end==='timeout')assert.ok(timeoutError(result.reason));if(end==='abort')assert.ok(abortError(result.reason));
    assert.equal(timers.size,0);assert.equal(listeners.size,0);
  });
}

test('elapsed parse overrun is rejected rather than reported as successful JSON',async t=>{
  const text='{"slowParse":true}',parse=JSON.parse;
  t.mock.method(JSON,'parse',function(value,...rest){
    const result=Reflect.apply(parse,this,[value,...rest]);
    if(value===text){const end=performance.now()+35;while(performance.now()<end){}}
    return result;
  });
  t.mock.method(globalThis,'fetch',async()=>response(bytes(text)));
  await rejectsBounded(fixture(t).json('data/fixture.json',null,{timeoutMs:15}),timeoutError);
});

function blockFixture(t){
  const corpus=fixture(t),units=Array.from({length:6},(_,id)=>({id:`unit-${id}`,text:`Text ${id}`})),encoded=units.map((unit,id)=>bytes(JSON.stringify({schema:1,docId:'fixture',locale:'ru',contentVersion:'test',id,units:[unit]})));
  corpus.catalog={contentVersion:'test'};
  corpus.readerData.descriptors.set('fixture/ru',{docId:'fixture',locale:'ru',contentVersion:'test',units,blocks:encoded.map((value,id)=>({id,start:id,count:1,bytes:value.byteLength,sha256:sha(value),file:`data/fixture/blocks/${id}.json`}))});
  const original=corpus.json.bind(corpus);corpus.json=(path,expected,options)=>original(path,expected,{...options,timeoutMs:25});
  return {corpus,encoded};
}

test('real block scheduler frees all three occupied slots after non-cooperative deadline',async t=>{
  const {corpus}=blockFixture(t),calls=[];
  t.mock.method(globalThis,'fetch',(url,options)=>{calls.push({url:String(url),signal:options.signal});return new Promise(()=>{});});
  const requests=[0,1,2,3].map(id=>corpus.loadBlock('fixture','ru',id)),settled=Promise.allSettled(requests);
  await until(()=>calls.length===3);assert.equal(corpus.cacheStats().activeBlockLoads,3);assert.equal(corpus.cacheStats().queuedBlockLoads,1);
  const result=await outcome(settled);
  assert.equal(result.status,'fulfilled','Deadline must release active slots and allow the waiting block to finish');
  assert.ok(result.value.every(item=>item.status==='rejected'&&timeoutError(item.reason)));
  await until(()=>corpus.cacheStats().activeBlockLoads===0);
  assert.equal(calls.length,4);assert.ok(calls.every(call=>call.signal.aborted));
  assert.equal(corpus.cacheStats().queuedBlockLoads,0);assert.equal(corpus.cacheStats().pendingBlocks,0);assert.equal(corpus.cacheStats().blocks,0);
});

test('last-consumer cancellation frees real scheduler slots and late blocks never enter cache',async t=>{
  const {corpus,encoded}=blockFixture(t),gates=new Map(),calls=[];
  t.mock.method(globalThis,'fetch',(url,options)=>{const id=Number(new URL(url).pathname.match(/(\d+)\.json$/)[1]),gate=deferred();calls.push({id,signal:options.signal});gates.set(id,gate);return gate.promise;});
  // A long per-operation timeout makes cancellation, rather than deadline, the cause.
  const original=Corpus.prototype.json.bind(corpus);corpus.json=(path,expected,options)=>original(path,expected,{...options,timeoutMs:1000});
  const oldController=new AbortController(),old=Promise.allSettled([0,1,2].map(id=>corpus.loadBlock('fixture','ru',id,{signal:oldController.signal})));
  await until(()=>calls.length===3);oldController.abort();assert.ok((await old).every(item=>abortError(item.reason)));
  const nextController=new AbortController(),next=Promise.allSettled([3,4,5].map(id=>corpus.loadBlock('fixture','ru',id,{signal:nextController.signal})));
  await until(()=>calls.length===6);
  for(const id of [0,1,2])gates.get(id).resolve(response(encoded[id]));
  for(const id of [3,4,5])gates.get(id).resolve(response(encoded[id]));
  assert.ok((await next).every(item=>item.status==='fulfilled'));
  await until(()=>corpus.cacheStats().activeBlockLoads===0);
  for(const id of [0,1,2])assert.equal(corpus.peekBlock('fixture','ru',id),null);
  assert.equal(corpus.cacheStats().blocks,3);assert.equal(corpus.cacheStats().pendingBlocks,0);assert.equal(corpus.cacheStats().queuedBlockLoads,0);
});
