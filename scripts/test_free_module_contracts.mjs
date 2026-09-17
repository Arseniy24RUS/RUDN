import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {scopedStorage,createRunMetadata,makeSubmission} from '../site/apps/governor/platform-contract.js';
import {receptionStorageContext,storeKey,archiveDraft,recentCaseIds} from '../site/apps/reception/js/storage.js';

const memory=()=>{const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
test('Embedded modules share the initialized platform Backend singleton',async()=>{
 const files=['assets/js/main.js','apps/career/entry.mjs','apps/governor/platform-bridge.js'];
 const sources=await Promise.all(files.map(file=>readFile(new URL('../site/'+file,import.meta.url),'utf8')));
 const versions=sources.map(source=>source.match(/from ['"][^'"]*backend\.js(\?[^'"]*)?['"]/)[1]||'');
 assert.equal(new Set(versions).size,1,'A different query creates an uninitialized Backend instance with a stale profile');
});
test('Governor course/free scopes isolate campaign, metadata, backups and locks; guests only enter free play',()=>{
 const raw=memory(),course=scopedStorage(raw,'student:a'),free=scopedStorage(raw,'student:a',{context:'free'}),guest=scopedStorage(raw,'guest:governor',{context:'free'});
 for(const key of ['campaign','platform-run','meta','submission:result','backup']){course.setItem(key,'course');free.setItem(key,'free');guest.setItem(key,'guest');assert.equal(course.getItem(key),'course');assert.equal(free.getItem(key),'free');assert.equal(guest.getItem(key),'guest');}
 assert.equal(course.keyFor('campaign'),'rudn.governor.v1:student%3Aa:campaign');
 assert.equal(new Set([course.lockName,free.lockName,guest.lockName]).size,3);
 assert.throws(()=>scopedStorage(raw,'guest:governor'),{code:'governor/owner-required'});
});
test('Reception free archives, recent cases, last mode and drafts never enter course storage',()=>{
 const raw=memory(),course=receptionStorageContext('course',raw),free=receptionStorageContext('free',raw),owner='student:a',period='2026-2027';
 const state=(id,caseId)=>({owner,period,id,caseIds:[caseId],cases:{[caseId]:{first:true}},events:[{caseId}],startedAt:'2026-09-17T00:00:00Z'});
 archiveDraft(state('course','course-case'),course.storage);archiveDraft(state('free','free-case'),free.storage);
 assert.deepEqual(recentCaseIds(owner,period,course.storage),['course-case']);assert.deepEqual(recentCaseIds(owner,period,free.storage),['free-case']);
 const key=storeKey(owner,'practice',period);course.storage.setItem(key,'course');free.storage.setItem(key,'free');
 course.storage.setItem('rudn.reception.lastmode.v16:'+owner+':'+period,'assessment');
 assert.equal(free.storage.getItem('rudn.reception.lastmode.v16:'+owner+':'+period),null);
 assert.equal(course.storage.getItem(key),'course');assert.equal(free.storage.getItem(key),'free');assert.notEqual(course.keyFor(key),free.keyFor(key));
 assert.equal(course.activitySlug,'seminar-5');assert.equal(free.activitySlug,'reception-freeplay');
});
const sandbox={console};sandbox.window=sandbox;vm.createContext(sandbox);
for(const name of ['game-data','stage3-data','stage4-data','consolidation-data','agenda','project-state','population','recovery','budget-review','finance','governance-data','governance','stories-data','stories','world-outcomes','state-integrity','engine'])vm.runInContext(await readFile(new URL('../site/apps/governor/src/'+name+'.js',import.meta.url),'utf8'),sandbox);
test('Actual completed Governor campaigns create ungraded stable free records for guests, students and teachers',()=>{
 const G=sandbox.GovernorGame,state=G.Engine.createState({name:'Context test',scenarioId:'balanced',seed:'FREE-CONTEXT'});
 while(!state.completed){const mission=G.Engine.getCurrentMission(state);G.Engine.commitAction(state,mission.actions.find(item=>item.deferred).id,'treasury');G.Engine.advanceTurn(state);}
 for(const owner of ['guest:governor','student:a','teacher:a']){
  const run=createRunMetadata(),input={state,G,owner,studentKey:owner==='student:a'?'a':undefined,run,now:'2026-09-17T12:00:00Z',context:'free'};
  const result=makeSubmission(input);assert.equal(result.activitySlug,'governor-freeplay');assert.equal(result.recordGrade,false);assert.equal(result.governor.decisions,20);assert.deepEqual(makeSubmission(input),result);
  if(!owner.startsWith('student:'))assert.equal('studentKey' in result,false);
 }
 assert.equal(makeSubmission({state,G,owner:'student:a',studentKey:'a',run:createRunMetadata(),now:'2026-09-17T12:00:00Z'}).recordGrade,true);
});
