import test from 'node:test';
import assert from 'node:assert/strict';
import {FirebaseLive,LocalLive,aggregatePeers,aggregateAnswers,serializePresenceAnswer,PRESENCE_TTL_MS} from '../site/apps/legal-lab/lib/live.mjs';
const version='legal-lab-2026-10-15.2',prefix='root/live';
const empty={hotspots:{},classifications:{},selections:{},respondents:0};
const row=answer=>({answer,updatedAt:Date.now(),expiresAt:Date.now()+PRESENCE_TTL_MS});
function backend(){const profile={studentKey:'12345',group:'ГГУбд-01-26'},rows=new Map(),listeners=new Map(),writes=[],disconnects=[];rows.set('.info/connected',true);const emit=(path,value)=>{rows.set(path,value);for(const fn of listeners.get(path)||[])fn({val:()=>value});};const b={mode:'cloud',user:{uid:'student'},generation:1,database:{},getProfile:()=>profile,isAdmin:()=>false,db:{ref:(_,path)=>path,onValue:(path,fn)=>{const set=listeners.get(path)||new Set();set.add(fn);listeners.set(path,set);if(rows.has(path))queueMicrotask(()=>fn({val:()=>rows.get(path)}));return()=>set.delete(fn);},set:async(path,value)=>{writes.push({path,value});emit(path,value);},update:async(path,changes)=>{writes.push({path,changes});for(const[k,v]of Object.entries(changes))emit(path+'/'+k,v);},onDisconnect:path=>({update:async changes=>disconnects.push({path,changes}),cancel:async()=>{}})}};return {b,profile,rows,listeners,writes,disconnects,emit};}
const settle=()=>new Promise(r=>setTimeout(r,0));
const scanFields=['issuer','type','title','date','number','signature','registration','approved','agreed','acknowledgment'];
const actTypes=['Указ','Постановление','Распоряжение','Приказ','Решение'];
const textAnswer=(unit='unit-a')=>({docId:'constitution',selections:[unit]});

test('anonymous aggregates ignore expired/malformed data and deduplicate text selections',()=>{
 const a=aggregatePeers({a:row({selections:['u1','u1','bad/path','__proto__'],type:'Приказ',hotspot:'issuer'}),b:row({selections:['u1','u2'],type:'Указ',hotspot:'issuer'}),expired:{...row(textAnswer('expired-unit')),expiresAt:Date.now()-1},malformed:row('bad')});
 assert.deepEqual(a,{hotspots:{},classifications:{},selections:{u1:2,u2:1},respondents:2});
 assert.equal(aggregateAnswers({a:row(textAnswer())}).units['unit-a'],1);
 assert.deepEqual(aggregateAnswers({a:row(textAnswer())}).scans,{});
 assert.deepEqual(aggregateAnswers({a:row(textAnswer())}).choices,{});
 assert.deepEqual(serializePresenceAnswer({...textAnswer(),ownerUid:'secret',studentKey:'secret',fullName:'secret',hotspot:'issuer',type:'Приказ'}),textAnswer());
});

test('automatic watch and choose expose aggregates only; navigation removes owner and answer atomically',async()=>{
 const h=backend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version});let seen;
 try{live.subscribe(v=>seen=v);await settle();live.watchTask('Q01');await live.choose({...textAnswer(),private:'drop',ownerUid:'secret',studentKey:'secret',fullName:'secret',hotspot:'issuer',type:'Приказ'});
 const token=live.token,p=prefix+'/legalPresence/'+version.replaceAll('.','_')+'/Q01';h.emit(p,{[token]:row(textAnswer())});
 assert.equal(seen.aggregates.respondents,1);assert.deepEqual(seen.aggregates.selections,{});assert.equal('answers'in seen,false);assert.equal('uid'in seen,false);
 assert.deepEqual(h.writes.find(x=>x.value?.answer).value.answer,textAnswer());
 assert.equal(h.disconnects.length,1);assert.deepEqual(Object.values(h.disconnects[0].changes),[null,null]);
 live.watchTask('Q02');await settle();assert.equal(live.token,null);assert.ok(h.writes.some(x=>x.changes&&x.changes['legalPresence/'+version.replaceAll('.','_')+'/Q01/'+token]===null));assert.deepEqual(seen.aggregates,empty);
 }finally{live.close();}assert.equal([...h.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});

test('offline choice is not queued; reconnect/navigation cannot publish the old answer',async()=>{
 const h=backend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version});
 try{await settle();live.watchTask('Q01');await live.choose(textAnswer());h.emit('.info/connected',false);assert.equal(await live.choose(textAnswer('unit-b')),false);live.watchTask('Q02');h.emit('.info/connected',true);await settle();const published=h.writes.filter(x=>x.value?.answer);assert.equal(published.length,1);assert.deepEqual(published[0].value.answer,textAnswer());assert.equal(live.token,null);}finally{live.close();}
});

test('hidden and null task remove selections, profile changes reject, non-text IDs never write',async()=>{
 const h=backend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version});
 try{await settle();for(const task of ['A01','Q99','S01','T01','H01','H01extra','Q00','Q39'])assert.throws(()=>live.watchTask(task),/classroom/);
 assert.equal(h.writes.length,0,'invalid tasks cannot claim owners or write answers');
 live.watchTask('Q01');await live.choose(textAnswer());live.setVisible(false);await settle();assert.equal(live.token,null);assert.equal(await live.choose(textAnswer()),false);live.setVisible(true);assert.equal(live.token,null);live.watchTask(null);assert.equal(await live.choose(textAnswer()),false);h.profile.studentKey='other';await assert.rejects(live.choose(textAnswer()),/Профиль/);}finally{live.close();}
});

test('inflight owner claim is retired before it can publish after question navigation',async()=>{
 const h=backend(),set=h.b.db.set;let release;h.b.db.set=(p,v)=>p.includes('legalPresenceOwners')?new Promise(resolve=>release=async()=>{await set(p,v);resolve();}):set(p,v);const live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version});
 try{await settle();live.watchTask('Q01');const choosing=live.choose(textAnswer());live.watchTask('Q02');await release();await choosing;assert.equal(h.writes.some(x=>x.value?.answer),false);}finally{live.close();}
});

test('local automatic peers disappear on next task, hidden, null task and close',async()=>{
 const rows=new Map(),previous=globalThis.localStorage;globalThis.localStorage={get length(){return rows.size},key:i=>[...rows.keys()][i],getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};const a=new LocalLive({contentVersion:version}),b=new LocalLive({contentVersion:version});
 try{for(const task of ['S01','T01','H01','H01extra','A01','Q99'])assert.throws(()=>a.watchTask(task),/classroom/);assert.equal(rows.size,0);
 a.watchTask('Q01');b.watchTask('Q01');await a.choose(textAnswer());b.emit();assert.equal(b.current.aggregates.selections['unit-a'],1);a.watchTask('Q02');b.emit();assert.equal(b.current.aggregates.respondents,0);a.watchTask('Q01');await a.choose(textAnswer('unit-b'));a.setVisible(false);b.emit();assert.equal(b.current.aggregates.respondents,0);a.setVisible(true);await a.choose(textAnswer('unit-c'));a.watchTask(null);b.emit();assert.equal(b.current.aggregates.respondents,0);a.watchTask('Q01');await a.choose(textAnswer());a.close();b.emit();assert.equal(b.current.aggregates.respondents,0);}finally{a.close();b.close();globalThis.localStorage=previous;}
});

test('all ten scan fields stay private, even when forged into a valid text choice',async()=>{
 const h=backend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version});
 try{await settle();live.watchTask('Q01');assert.equal(scanFields.length,10);
 for(const hotspot of scanFields){assert.equal(serializePresenceAnswer({hotspot,ownerUid:'private'}),null,hotspot+' alone is private');assert.deepEqual(serializePresenceAnswer({...textAnswer(),hotspot}),textAnswer(),hotspot+' is stripped from valid text');assert.deepEqual(aggregatePeers({choice:row({hotspot})}),empty);assert.deepEqual(aggregatePeers({choice:row({...textAnswer(),hotspot})}),{...empty,selections:{'unit-a':1},respondents:1});await live.choose({hotspot});}
 assert.equal(h.writes.length,0,'scan-only choices under a valid Q task never claim an owner or write');
 assert.equal(serializePresenceAnswer({hotspot:'not-a-scan-field'}),null);assert.equal(serializePresenceAnswer({docId:'constitution'}),null);assert.equal(serializePresenceAnswer({docId:'constitution',selections:[]}),null);
 }finally{live.close();}
});

test('all five act types stay private, and serializers retain only safe text fields',async()=>{
 const h=backend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version});
 try{await settle();live.watchTask('Q01');assert.equal(actTypes.length,5);
 for(const type of actTypes){assert.equal(serializePresenceAnswer({type}),null,type+' alone is private');assert.deepEqual(serializePresenceAnswer({...textAnswer(),type}),textAnswer(),type+' is stripped from valid text');assert.deepEqual(aggregatePeers({choice:row({type})}),empty);assert.deepEqual(aggregatePeers({choice:row({...textAnswer(),type})}),{...empty,selections:{'unit-a':1},respondents:1});await live.choose({type});}
 assert.equal(h.writes.length,0,'type-only choices under a valid Q task never claim an owner or write');
 for(const selections of ['arbitrary text',42,true])assert.equal(serializePresenceAnswer({docId:'constitution',selections}),null,'scalar selections are never serialized');
 assert.deepEqual(serializePresenceAnswer({docId:'bad/path',selections:['unit-a','unit-a','bad/path','__proto__',null]}),{selections:['unit-a']});
 const thirty=Array.from({length:30},(_,i)=>'unit-'+i);assert.deepEqual(serializePresenceAnswer({selections:[...thirty,'unit-over-limit']}),{selections:thirty});
 }finally{live.close();}
});

test('peer aggregation excludes only the matching own row while retaining total respondents',()=>{
 const now=Date.now(),own=row({selections:['unit-a','unit-a','unit-b']}),other=row(textAnswer());
 const records={'own-token':own,'other-token':other};
 assert.deepEqual(aggregatePeers(records,now),{...empty,selections:{'unit-a':2,'unit-b':1},respondents:2});
 assert.deepEqual(aggregatePeers({'own-token':own},now,'own-token'),{...empty,respondents:1});
 assert.deepEqual(aggregatePeers(records,now,'own-token'),{...empty,selections:{'unit-a':1},respondents:2});
 assert.deepEqual(aggregatePeers(records,now,'other-token'),{...empty,selections:{'unit-a':1,'unit-b':1},respondents:2});
 assert.deepEqual(aggregatePeers(records,now,'missing-token'),{...empty,selections:{'unit-a':2,'unit-b':1},respondents:2});
 assert.deepEqual(aggregatePeers({'other-token':other},now,'own-token'),{...empty,selections:{'unit-a':1},respondents:1});
 assert.deepEqual(aggregatePeers({'own-token':{...own,expiresAt:now-1},'other-token':other},now,'own-token'),{...empty,selections:{'unit-a':1},respondents:1});
});

test('local own choice is not a peer; two matching choices stay one peer each through deselection and navigation',async()=>{
 const rows=new Map(),previous=globalThis.localStorage;globalThis.localStorage={get length(){return rows.size},key:i=>[...rows.keys()][i],getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};
 const a=new LocalLive({contentVersion:version}),b=new LocalLive({contentVersion:version});
 try{
  a.watchTask('Q01');b.watchTask('Q01');await a.choose(textAnswer());a.emit();b.emit();
  assert.equal(a.current.aggregates.respondents,1);assert.deepEqual(a.current.aggregates.selections,{});assert.equal(b.current.aggregates.selections['unit-a'],1);
  await b.choose(textAnswer());a.emit();b.emit();
  for(const live of [a,b]){assert.equal(live.current.aggregates.respondents,2);assert.deepEqual(live.current.aggregates.selections,{'unit-a':1});}
  await a.choose({selections:[]});a.emit();b.emit();
  assert.equal(a.current.aggregates.respondents,1);assert.deepEqual(a.current.aggregates.selections,{'unit-a':1});assert.equal(b.current.aggregates.respondents,1);assert.deepEqual(b.current.aggregates.selections,{});
  a.watchTask('Q02');b.watchTask('Q02');await b.choose(textAnswer());a.emit();b.emit();
  assert.deepEqual(a.current.aggregates.selections,{'unit-a':1});assert.deepEqual(b.current.aggregates.selections,{});
  a.setVisible(false);a.setVisible(true);a.emit();assert.equal(a.current.aggregates.respondents,1);assert.deepEqual(a.current.aggregates.selections,{'unit-a':1});
 }finally{a.close();b.close();globalThis.localStorage=previous;}
});

test('Firebase snapshots count actual other tokens after own deselection, retirement and navigation',async()=>{
 const ha=backend(),hb=backend();hb.b.user.uid='other-student';hb.profile.studentKey='67890';
 const a=new FirebaseLive({backend:ha.b,rootPath:'root',contentVersion:version}),b=new FirebaseLive({backend:hb.b,rootPath:'root',contentVersion:version});
 const p=prefix+'/legalPresence/'+version.replaceAll('.','_')+'/Q01';
 try{
  await settle();a.watchTask('Q01');b.watchTask('Q01');await a.choose(textAnswer());await b.choose(textAnswer());
  const snapshot={[a.token]:row(textAnswer()),[b.token]:row(textAnswer())};ha.emit(p,snapshot);hb.emit(p,snapshot);
  assert.notEqual(a.token,b.token);for(const live of [a,b]){assert.equal(live.current.aggregates.respondents,2);assert.deepEqual(live.current.aggregates.selections,{'unit-a':1});}
  await a.choose({selections:[]});const onlyOther={[b.token]:snapshot[b.token]};ha.emit(p,onlyOther);hb.emit(p,onlyOther);
  assert.equal(a.token,null);assert.equal(a.current.aggregates.respondents,1);assert.deepEqual(a.current.aggregates.selections,{'unit-a':1});assert.deepEqual(b.current.aggregates.selections,{});
  a.retire();a.emit();assert.deepEqual(a.current.aggregates.selections,{'unit-a':1});
  a.watchTask('Q02');ha.emit(p.replace('/Q01','/Q02'),{'new-other-token':row(textAnswer())});
  assert.equal(a.current.aggregates.respondents,1);assert.deepEqual(a.current.aggregates.selections,{'unit-a':1});
 }finally{a.close();b.close();}
});

test('failed Firebase publication cannot subtract a real peer with the same paragraph',async()=>{
 const h=backend(),set=h.b.db.set;h.b.db.set=(path,value)=>value?.answer?Promise.reject(new Error('publication denied')):set(path,value);
 const live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version}),p=prefix+'/legalPresence/'+version.replaceAll('.','_')+'/Q01';
 try{
  await settle();live.watchTask('Q01');h.emit(p,{'actual-peer':row(textAnswer())});
  await assert.rejects(live.choose(textAnswer()),/publication denied/);
  assert.equal(h.writes.some(x=>x.value?.answer),false);assert.equal(live.current.aggregates.respondents,1);assert.deepEqual(live.current.aggregates.selections,{'unit-a':1});
  await live.choose({selections:[]});h.emit(p,{'actual-peer':row(textAnswer())});assert.equal(live.token,null);assert.deepEqual(live.current.aggregates.selections,{'unit-a':1});
 }finally{live.close();}
});

test('retired and replacement own tokens never become peers while cleanup is delayed or rejected',async()=>{
 const now=Date.now(),records={'retired-own':row(textAnswer()),'new-own':row(textAnswer()),'actual-other':row(textAnswer())};
 assert.deepEqual(aggregatePeers(records,now,new Set(['retired-own','new-own'])),{...empty,selections:{'unit-a':1},respondents:3});
 assert.deepEqual(aggregatePeers(records,now,new Set()),aggregatePeers(records,now));
 const h=backend(),live=new FirebaseLive({backend:h.b,rootPath:'root',contentVersion:version}),p=prefix+'/legalPresence/'+version.replaceAll('.','_')+'/Q01';
 try{
  await settle();live.watchTask('Q01');await live.choose(textAnswer());const oldToken=live.token;
  h.emit(p,{[oldToken]:row(textAnswer()),'actual-other':row(textAnswer())});
  h.b.db.update=async()=>{throw new Error('Synthetic cleanup rejected');};
  await live.choose({selections:[]});await settle();h.emit(p,{[oldToken]:row(textAnswer()),'actual-other':row(textAnswer())});
  assert.equal(live.token,null);assert.deepEqual(live.current.aggregates.selections,{'unit-a':1});assert.equal(live.current.aggregates.respondents,2);
  await live.choose(textAnswer());const nextToken=live.token;assert.notEqual(nextToken,oldToken);
  const staleSnapshot={[oldToken]:row(textAnswer()),[nextToken]:row(textAnswer()),'actual-other':row(textAnswer())};h.emit(p,staleSnapshot);
  assert.deepEqual(live.current.aggregates.selections,{'unit-a':1});assert.equal(live.current.aggregates.respondents,3);
  live.watchTask('Q02');live.watchTask('Q01');await settle();h.emit(p,staleSnapshot);
  assert.deepEqual(live.current.aggregates.selections,{'unit-a':1});assert.equal(live.current.aggregates.respondents,3);
  assert.equal('ownedTokens' in live.current,false,'Owned token history stays outside public snapshots');
 }finally{live.close();}
});
