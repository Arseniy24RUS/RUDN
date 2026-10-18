import test from 'node:test';
import assert from 'node:assert/strict';
import {FirebaseLive,LocalLive,PRESENCE_TTL_MS} from '../site/apps/legal-lab/lib/live.mjs';

function harness(){
 const callbacks=new Map(),profile={studentKey:'synthetic-presence'};
 const backend={user:{uid:'synthetic'},generation:1,database:{},isAdmin:()=>false,getProfile:()=>profile,db:{
  ref:(_,path)=>path,onValue:(path,fn)=>{callbacks.set(path,fn);if(path==='.info/connected')queueMicrotask(()=>fn({val:()=>true}));return()=>callbacks.delete(path);},
  set:async()=>{},update:async()=>{},onDisconnect:()=>({update:async()=>{},cancel:async()=>{}})
 }};
 const live=new FirebaseLive({backend,rootPath:'synthetic',contentVersion:'v1'});
 return {live,backend,emit:rows=>callbacks.get('synthetic/live/legalPresence/v1/Q01')?.({val:()=>rows})};
}
const rows=now=>Object.fromEntries(Array.from({length:30},(_,i)=>['peer-'+i,{answer:{docId:'constitution',selections:['unit-'+i%3]},updatedAt:now,expiresAt:now+PRESENCE_TTL_MS}]));

test('thirty heartbeat renewals do not publish identical visible aggregates; expiry remains exact',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:200000});
 const h=harness(),seen=[];
 try{
  await Promise.resolve();h.live.watchTask('Q01');h.live.subscribe(snapshot=>seen.push(snapshot));
  h.emit(rows(Date.now()));const count=seen.length;
  assert.equal(seen.at(-1).aggregates.respondents,30);
  for(let i=0;i<4;i++){t.mock.timers.tick(15000);h.emit(rows(Date.now()));}
  assert.equal(seen.length,count,'one minute of unchanged heartbeat data produces no extra notifications');
  t.mock.timers.tick(PRESENCE_TTL_MS-1);assert.equal(seen.length,count);
  t.mock.timers.tick(2);assert.equal(seen.length,count+1);
  assert.equal(seen.at(-1).aggregates.respondents,0,'expiry is processed without a polling interval');
  t.mock.timers.tick(60000);assert.equal(seen.length,count+1,'empty rooms have no expiry work');
 }finally{h.live.close();}
});

test('changed counts, hidden state and new subscribers still receive the current snapshot',async()=>{
 const h=harness(),seen=[];
 try{
  await Promise.resolve();h.live.watchTask('Q01');h.live.subscribe(snapshot=>seen.push(snapshot));
  const data=rows(Date.now());h.emit(data);let latest;const unsubscribe=h.live.subscribe(snapshot=>latest=snapshot);
  assert.equal(latest.aggregates.respondents,30);
  data['peer-0'].answer.selections=['another-unit'];h.emit(data);
  assert.equal(latest.aggregates.selections['another-unit'],1);assert.equal(latest.aggregates.selections['unit-0'],9);
  h.live.setVisible(false);assert.equal(latest.connected,false);assert.equal(latest.aggregates.respondents,0);
  assert.equal(h.live.timer,null,'hidden state clears the expiry timer');unsubscribe();
 }finally{h.live.close();}
});

test('local deselection is visible immediately without a polling tick',async()=>{
 const previous=globalThis.localStorage,storage=new Map();
 globalThis.localStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 const live=new LocalLive({contentVersion:'v1'});let latest;
 try{
  live.watchTask('Q01');live.subscribe(snapshot=>latest=snapshot);await live.choose({docId:'constitution',selections:['a']});
  assert.equal(latest.aggregates.respondents,1);await live.choose({selections:[]});assert.equal(latest.aggregates.respondents,0);
  assert.equal(live.timer,null);
 }finally{live.close();globalThis.localStorage=previous;}
});

test('rapid choices share one drain and publish only the latest pending answer',async()=>{
 const h=harness(),waiting=[],writes=[];let concurrent=0,peak=0;
 const turn=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  await Promise.resolve();h.live.watchTask('Q01');await h.live.choose({selections:['initial']});
  h.backend.db.set=async(_path,value)=>{writes.push(structuredClone(value));peak=Math.max(peak,++concurrent);await new Promise(resolve=>waiting.push(resolve));concurrent--;};
  const first=h.live.choose({selections:['a']});await turn();
  const second=h.live.choose({selections:['b']}),third=h.live.choose({selections:['c']}),heartbeat=h.live.publish(h.live.slot);
  assert.equal(writes.length,1);waiting.shift()();await turn();
  assert.equal(writes.length,2);assert.deepEqual(writes[1].answer.selections,['c']);
  assert.equal(peak,1,'pending clients cannot fan out concurrent writes');
  waiting.shift()();await Promise.all([first,second,third,heartbeat]);
  assert.equal(writes.length,2,'intermediate answer and redundant heartbeat are coalesced');
 }finally{for(const release of waiting)release();h.live.close();}
});

test('retired own tokens are forgotten after their maximum remaining presence lifetime',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:200000});
 const h=harness();
 try{
  await Promise.resolve();h.live.watchTask('Q01');await h.live.choose({selections:['a']});
  const token=h.live.token;h.live.watchTask('Q02');assert.equal(h.live.ownedTokens.has(token),true);
  t.mock.timers.tick(PRESENCE_TTL_MS+5001);
  assert.equal(h.live.ownedTokens.size,0);assert.equal(h.live.retiredTokens.size,0);
  assert.equal(h.live.timer,null);
 }finally{h.live.close();}
});
