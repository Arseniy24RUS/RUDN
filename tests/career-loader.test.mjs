import test from 'node:test';
import assert from 'node:assert/strict';
import {loadJSON} from '../site/apps/career/assets/loader.mjs';

const deferred=()=>{
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
};
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('cold career JSON can finish after five seconds without losing validation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const headers=deferred(),body=deferred();let signal,validated=0;
 t.mock.method(globalThis,'fetch',(_url,options)=>{signal=options.signal;return headers.promise;});
 const result=loadJSON('data/questions.json',{validate:value=>{validated++;return Array.isArray(value);}});
 t.mock.timers.tick(6000);
 assert.equal(signal.aborted,false);
 headers.resolve({ok:true,json:()=>body.promise});
 await settle();
 t.mock.timers.tick(6000);
 assert.equal(signal.aborted,false);
 body.resolve([{id:'question'}]);
 assert.deepEqual(await result,[{id:'question'}]);
 assert.equal(validated,1);
 t.mock.timers.tick(30000);
 assert.equal(signal.aborted,false,'A completed request must clear its deadline');
});

test('the default deadline rejects a stalled body even when the host transport ignores abort',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const body=deferred();let signal,validated=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  signal=options.signal;
  return {ok:true,json:()=>body.promise};
 });
 const result=loadJSON('data/authorities.json',{validate:()=>{validated++;return true;}});
 const rejected=assert.rejects(result,error=>error.name==='TimeoutError');
 await settle();
 t.mock.timers.tick(29999);
 assert.equal(signal.aborted,false);
 t.mock.timers.tick(1);
 await rejected;
 assert.equal(signal.aborted,true);
 assert.equal(validated,0);
 // The request branch remains handled after Promise.race has rejected.
 body.reject(new Error('late body failure'));
 await settle();
});

test('an explicit deadline aborts the actual fetch signal without waiting for a response',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let signal;
 t.mock.method(globalThis,'fetch',(_url,options)=>{
  signal=options.signal;
  return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 });
 const result=loadJSON('data/scales.json',{timeout:1200});
 const rejected=assert.rejects(result,error=>error.name==='TimeoutError');
 t.mock.timers.tick(1199);
 assert.equal(signal.aborted,false);
 t.mock.timers.tick(1);
 await rejected;
 assert.equal(signal.aborted,true);
});

test('host navigation abort propagates immediately and clears the loading deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const request=deferred();let signal;
 t.mock.method(globalThis,'fetch',(_url,options)=>{signal=options.signal;return request.promise;});
 const result=loadJSON('data/model-manifest.json');
 const abort=new DOMException('Navigation disposed the module','AbortError');
 const rejected=assert.rejects(result,error=>error===abort);
 request.reject(abort);
 await rejected;
 t.mock.timers.tick(30000);
 assert.equal(signal.aborted,false,'A rejected host request must not retain a timer');
});

test('HTTP and schema failures remain failures and clear their deadlines',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const signals=[];
 const responses=[{ok:false,status:503},{ok:true,json:async()=>({unexpected:true})}];
 t.mock.method(globalThis,'fetch',async(_url,options)=>{signals.push(options.signal);return responses.shift();});
 await assert.rejects(loadJSON('data/questions.json'),/HTTP 503/);
 await assert.rejects(loadJSON('data/questions.json',{validate:Array.isArray}),/Invalid data/);
 t.mock.timers.tick(30000);
 assert.ok(signals.every(signal=>!signal.aborted));
});
