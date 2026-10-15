import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const runtime=process.env.LEGAL_LAB_RUNTIME||fileURLToPath(new URL('../site/apps/legal-lab/lib/live.mjs',import.meta.url));
const {FirebaseLive,LocalLive,aggregatePeers,aggregateAnswers}=await import(pathToFileURL(runtime).href);
const group='ГГУбд-01-26',version='v1',code='ABCDEF123456';
const empty={hotspots:{},classifications:{},selections:{},respondents:0};
function fakeBackend(){
  const profile={studentKey:'12345',group};const rows=new Map(),listeners=new Map(),reads=[],writes=[],transactionCodes=[];
  const meta={teacherUid:'teacher',group,contentVersion:version,createdAt:Date.now(),expiresAt:Date.now()+100000};
  const state={taskId:'Q01',roundId:'round-1',showSelections:false,reveal:false,phase:'collect',updatedAt:Date.now()};
  rows.set(`root/live/legalRooms/${code}/meta`,meta);rows.set(`root/live/legalRooms/${code}/state`,state);
  const emit=(path,value)=>{rows.set(path,value);for(const fn of listeners.get(path)||[])fn({val:()=>value});};
  const b={mode:'cloud',user:{uid:'student'},generation:1,database:{},getProfile:()=>profile,isAdmin:()=>false,db:{
    ref:(_,path)=>path,serverTimestamp:()=>Date.now(),get:async path=>{reads.push(path);return {val:()=>rows.get(path)||null};},
    set:async(path,value)=>{writes.push({path,value});emit(path,value);},remove:async path=>rows.delete(path),
    onValue:(path,fn)=>{const set=listeners.get(path)||new Set();set.add(fn);listeners.set(path,set);if(rows.has(path))queueMicrotask(()=>fn({val:()=>rows.get(path)}));return()=>set.delete(fn);},
    onDisconnect:()=>({remove:async()=>{},cancel:async()=>{}}),
    runTransaction:async(path,mutate)=>{transactionCodes.push(path);const existing=transactionCodes.length===1?{occupied:true}:null;const value=mutate(existing);if(value){rows.set(path,value);return {committed:true,snapshot:{val:()=>value}};}return {committed:false,snapshot:{val:()=>existing}};}
  }};
  return {b,profile,meta,state,reads,writes,listeners,emit,transactionCodes};
}
test('aggregates count participants once, deduplicate selections and ignore unsafe keys',()=>{
  const answers={a:{parsed:{selections:['u1','u1','bad/path','__proto__'],type:'Приказ',hotspot:'issuer'}},b:{parsed:{selections:['u1','u2'],type:'Указ',hotspot:'issuer'}}};
  assert.deepEqual(aggregatePeers(answers),{hotspots:{issuer:2},classifications:{'Приказ':1,'Указ':1},selections:{u1:2,u2:1},respondents:2});
  assert.deepEqual(aggregateAnswers(answers),{scans:{issuer:2},choices:{'Приказ':1,'Указ':1},units:{u1:2,u2:1},total:2});
});
test('student snapshot never subscribes to answer collections, and ignores callbacks after close',async()=>{
  const h=fakeBackend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version,group:'forged-group'});let last;
  live.subscribe(v=>last=v);await live.join(code);await new Promise(r=>setTimeout(r,0));assert.equal(live.group,group);
  assert.deepEqual(last.answers,{});assert.deepEqual(last.aggregates,empty);
  h.emit(`root/live/legalRooms/${code}/state`,{...h.state,phase:'closed',showSelections:true});
  const aggregatePath=`root/live/legalRooms/${code}/aggregates/round-1`;h.emit(aggregatePath,{contentVersion:version,roundId:'round-1',respondents:4,selections:{u1:3}});
  assert.equal(last.aggregates.respondents,4);assert.deepEqual(last.answers,{});assert.equal([...h.listeners.keys()].some(k=>k.includes('/answers/')),false);
  const late=[...h.listeners.get(aggregatePath)][0],before=last;live.close();late({val:()=>({contentVersion:version,roundId:'round-1',respondents:99})});assert.equal(last,before);
  assert.equal([...h.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});
test('pending join is cancelled after profile switch and cannot install subscriptions',async()=>{
  const h=fakeBackend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version});let release;
  h.b.db.get=()=>new Promise(resolve=>release=resolve);const joining=live.join(code);h.profile.studentKey='67890';release({val:()=>h.meta});
  await assert.rejects(joining,/Профиль изменён/);assert.equal(h.writes.length,0);assert.equal(h.listeners.size,0);live.close();
});
test('creation retries collisions without overwriting another room',async()=>{
  const h=fakeBackend();h.b.isAdmin=()=>true;h.b.user.uid='teacher';const live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version,group});
  try{const created=await live.create('T01');assert.match(created,/^[A-F0-9]{12}$/);assert.equal(h.transactionCodes.length,2);assert.notEqual(h.transactionCodes[0],h.transactionCodes[1]);assert.equal(h.writes.filter(w=>w.path===h.transactionCodes[0]).length,0);}finally{live.close();}
});
test('demo gives students aggregates only; disclosure closes answers and reopening hides aggregates',async()=>{
  const rows=new Map(),oldStorage=globalThis.localStorage;globalThis.localStorage={get length(){return rows.size},key:i=>[...rows.keys()][i],getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value)};
  const teacher=new LocalLive({role:'teacher',contentVersion:version}),student=new LocalLive({contentVersion:version});let snapshot;
  try{const id=await teacher.create('Q01');await student.join(id);student.subscribe(value=>snapshot=value);await student.submit({hotspot:'issuer'});assert.deepEqual(snapshot.answers,{});assert.equal(snapshot.aggregates.respondents,0);await teacher.control({showSelections:true});student.emit();assert.equal(snapshot.aggregates.hotspots.issuer,1);assert.deepEqual(snapshot.answers,{});await assert.rejects(student.submit({hotspot:'date'}),/закрыт/);await teacher.control({phase:'collect'});student.emit();assert.equal(snapshot.aggregates.respondents,0);await student.submit({hotspot:'date'});}finally{teacher.close();student.close();globalThis.localStorage=oldStorage;}
});

test('temporary host local mode does not discard realtime subscriptions',async()=>{
  const h=fakeBackend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version});
  try{await live.join(code);await new Promise(r=>setTimeout(r,0));h.b.mode='local';h.emit('.info/connected',false);assert.equal(live.closed,false);assert.equal(live.current.connected,false);await assert.rejects(live.submit({hotspot:'issuer'}),/Связь недоступна/);h.b.mode='cloud';h.emit('.info/connected',true);assert.equal(live.current.connected,true);assert.equal(live.closed,false);await live.submit({hotspot:'issuer'});}finally{live.close();}
});

test('a superseded join cannot attach callbacks to the newer session',async()=>{
  const h=fakeBackend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version}),pending=[];
  h.b.db.get=()=>new Promise(resolve=>pending.push(resolve));
  try{const first=live.join(code);const second=live.join(code);pending[1]({val:()=>h.meta});await second;pending[0]({val:()=>h.meta});await assert.rejects(first,/отменено/);assert.equal(h.writes.filter(w=>w.path.includes('/members/')).length,1);assert.equal(live.closed,false);}finally{live.close();}
});
