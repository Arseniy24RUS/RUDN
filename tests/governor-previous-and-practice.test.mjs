import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {G, E, A, fresh, defer, json, firstPlan, settle, advance} from './helpers/governor-gameplay.mjs';
import {scopedStorage} from '../site/apps/governor/platform-contract.js';
import {finalFive, replayURL, practiceAdapter} from '../site/apps/governor/src/final-five.js';

const sandbox=vm.createContext({TextEncoder,DataView,Uint8Array,Uint32Array,crypto:webcrypto,GovernorGame:G});
await vm.runInContext(await fs.readFile(new URL('../site/apps/governor/src/save-system.js',import.meta.url),'utf8'),sandbox);
const S=G.Saves;
function memory(){
  const records=new Map();
  return {getItem:key=>records.get(key)??null,setItem:(key,v)=>records.set(key,String(v)),removeItem:key=>records.delete(key),records};
}
function position(token, n=0){
  const state=fresh({seed:'IDENTICAL-SETUP',name:'Test'});
  state.storiesRunId=token;
  for(let i=0;i<n;i++)defer(state);
  return state;
}

test('an explicit new campaign pins its predecessor through two initial writes, later turns and a cold reload',()=>{
  const db=memory(), scoped=scopedStorage(db,'guest:governor',{context:'free'});
  const source=position('run-old',3), run={submissionId:'original-submission',campaignToken:'run-old',submitted:true};
  const old=JSON.stringify(source);
  const s=new S.Store(scoped);s.write(source);
  const next=position('run-new');delete next.storiesRunId;
  assert.equal(next.sessionId,source.sessionId);
  s.replace(next,run);next.storiesRunId='run-new';s.write(next);
  defer(next);s.write(next);defer(next);s.write(next);
  const reloaded=new S.Store(scoped);
  const chosen=reloaded.backup().state;
  assert.equal(chosen.history.length,3);
  assert.equal(JSON.stringify(chosen),JSON.stringify(G.Engine.restoreState(JSON.parse(old))));
  const current=reloaded.inspect().state;
  assert.equal(current.history.length,2);assert.equal(current.storiesRunId,'run-new');
  const receiving=reloaded.replace(chosen,{submissionId:'successor',campaignToken:'run-new'});
  assert.deepEqual(json(receiving),run,'restoring can reuse the original submission ID');
  assert.equal(reloaded.previous().state.storiesRunId,'run-new','the displaced new game is available too');
  assert.equal(reloaded.inspect(S.Backup).state.history.length,1,'rolling recovery still exists');
  for(const [owner,context] of [['student:synthetic','course'],['student:synthetic','free'],['teacher:synthetic','free']]){
    assert.equal(new S.Store(scopedStorage(db,owner,{context})).previous().state,null);
  }
});
test('clear, a new campaign and subsequent autosaves retain the prior local game',()=>{
  const db=memory(),s=new S.Store(db), old=position('old',2);
  s.write(old);s.clear();assert.equal(s.inspect().status,'empty');assert.equal(s.previous().state.history.length,2);
  const next=position('new');s.replace(next);defer(next);s.write(next);
  assert.equal(new S.Store(db).backup().state.storiesRunId,'old');
});
test('quota denial before and during replacement, and another writer, preserve verified original slots',()=>{
  for(const fail of [S.Previous,S.Key]){
    const db=memory(),active=new S.Store(db);
    active.write(position('A',1));active.replace(position('B',2));
    const primary=db.getItem(S.Key),previous=db.getItem(S.Previous);
    let denied=true;
    const storage={...db,setItem(key,value){if(denied&&key===fail){denied=false;throw new Error('quota');}db.setItem(key,value);}};
    const switching=new S.Store(storage);switching.inspect();
    const next=position('C');
    assert.throws(()=>switching.replace(next),/quota/);
    assert.equal(db.getItem(S.Key),primary);assert.equal(db.getItem(S.Previous),previous);
    switching.replace(next);assert.equal(switching.backup().state.storiesRunId,'B');
    assert.throws(()=>active.replace(position('D')),e=>e.code==='other-tab');
    assert.equal(switching.inspect().state.storiesRunId,'C');
  }
});

test('a voluntary last-five-year replay uses the exact turn 16 and preserves original storage and submitted scores',async()=>{
  const db=memory(), owner='student:synthetic',sc=scopedStorage(db,owner), store=new S.Store(sc);
  const real=position('authored-run',14);
  let active=true;
  const session=finalFive(sc,G,()=>active);
  session.capture(real);assert.equal(session.origin(real),null);
  defer(real);session.capture(real);
  const initial=json(real);
  for(let i=0;i<5;i++)defer(real);
  assert.ok(real.completed);store.write(real);
  sc.setItem('platform-run','{"submissionId":"original"}');sc.setItem('submission:original','original-grade');
  const mainRows=[...db.records.entries()];
  assert.ok(session.origin(real));
  assert.ok(session.begin(real,'Improve transport'));
  const local=session.open();
  assert.equal(local.practice.history.length,15);
  assert.equal(local.practice.turnIndex,15);assert.equal(local.practice.practiceOf,real.storiesRunId);
  assert.deepEqual(json(local.practice.history),initial.history);
  assert.deepEqual(json(local.practice.finance.ledgers),initial.finance.ledgers);
  assert.equal(local.practice.practiceIntention,'Improve transport');
  const practiceStore=new S.Store(local.storage);
  let altered=practiceStore.inspect().state;
  defer(altered);practiceStore.write(altered);
  assert.ok(session.begin(real,'Any subsequent click resumes'));
  altered=new S.Store(finalFive(sc,G,()=>true).open().storage).inspect().state;
  assert.equal(altered.turnIndex,16);assert.equal(altered.practiceIntention,'Improve transport');
  while(!altered.completed){defer(altered);practiceStore.write(altered);}
  assert.ok(session.getPractice().completed);
  assert.ok(session.begin(real,'A second experiment'));assert.equal(session.open().practice.history.length,15);
  for(const [key,val] of mainRows)assert.equal(db.getItem(key),val,key);
  assert.equal([...db.records.keys()].filter(k=>k.includes('submission:')).length,1);
  const adapter=practiceAdapter(session,{language:'ru',tr:x=>x,canWrite:()=>true,onLanguage(){},reveal(){}});
  for(const name of ['onSaved','onNewRun','currentRun','captureFinalFive'])assert.equal(adapter[name],undefined);
  assert.equal(adapter.practice,true);assert.notEqual(adapter.lockName,sc.lockName);
  assert.throws(()=>store.replace(altered),e=>e.code==='practice-only');
  await assert.rejects(S.pack(altered),e=>e.code==='practice-only');
  const otherContext=finalFive(scopedStorage(db,owner,{context:'free'}),G,()=>true);
  assert.equal(otherContext.open(),null);
  const otherUser=finalFive(scopedStorage(db,'student:other'),G,()=>true);
  assert.equal(otherUser.open(),null);
  const otherFinal=position('another-run',20);assert.equal(otherFinal.sessionId,real.sessionId);
  assert.equal(session.origin(otherFinal),null);
  active=false;assert.equal(session.open(),null);assert.throws(()=>local.storage.setItem(S.Key,'wrong'));
  assert.equal(db.getItem(sc.keyFor(S.Key)),mainRows.find(([k])=>k===sc.keyFor(S.Key))[1]);
});

test('old or unrelated finals have no fabricated checkpoint, return keeps source context and route',()=>{
  const sc=scopedStorage(memory(),'guest:governor',{context:'free'}), api=finalFive(sc,G,()=>true);
  const closed=position('inspected-legacy',20);
  new S.Store(sc).write(closed);
  assert.equal(api.origin(closed),null);assert.equal(api.begin(closed,'test'),false);
  const address='https://example.test/RUDN/apps/governor/index.html?context=free&lang=zh';
  const started=new URL(replayURL(true,address));assert.equal(started.searchParams.get('context'),'free');assert.equal(started.searchParams.get('practice'),'last-five');
  const returned=new URL(replayURL(false,started));assert.equal(returned.searchParams.get('context'),'free');assert.equal(returned.searchParams.get('returnTo'),'term');assert.equal(returned.searchParams.has('practice'),false);
});


test('a project launched in the last year of the original checkpoint may open after capture',()=>{
  const sc=scopedStorage(memory(),'guest:test',{context:'free'}), api=finalFive(sc,G,()=>true);
  const s=position('delivered-after-checkpoint',14);
  const healthcare=A.pending(s).find(topic=>topic.id==='rural-healthcare');
  assert.ok(healthcare);E.chooseAgenda(s,healthcare.id);
  const p=firstPlan(s,'clinics');
  assert.ok(p);E.commitAction(s,p.action.id,p.plan.id,p.placement?.id,[]);settle(s);advance(s);
  const before=json(s.history[14]);api.capture(s);
  while(!s.completed)defer(s);
  assert.notDeepEqual(json(s.history[14].execution),before.execution,'the committed record matured after capture');
  new S.Store(sc).write(s);assert.ok(api.origin(s));assert.ok(api.begin(s,'Try a different final decision'));
  assert.ok(api.open());
  const altered=json(s);altered.history[14].actionId='different';
  assert.equal(api.origin(altered),null);
});

test('new and cleared campaigns wait for disk confirmation and keep the current one on failure',async()=>{
  for(const operation of ['replace','clear']){
    const source=memory(),s=new S.Store(source);
    s.write(position('retired',1));s.replace(position('live',3));
    const old=source.getItem(S.Key),older=source.getItem(S.Previous);
    let confirm,deny;
    const gate={...source,confirmPrevious:()=>new Promise((resolve,reject)=>{confirm=resolve;deny=reject;})};
    const switcher=new S.Store(gate);switcher.inspect();
    const change=()=>operation==='replace'?switcher.replaceDurably(position('candidate')):switcher.clearDurably();
    const first=change();
    assert.equal(source.getItem(S.Key),old,'before asynchronous disk commit');
    await assert.rejects(change(),e=>e.code==='replacement-pending');
    deny(new Error('disk/quota'));await assert.rejects(first,/quota/);
    assert.equal(source.getItem(S.Key),old);assert.equal(source.getItem(S.Previous),older);
    const retry=change();confirm();await retry;
    assert.equal(switcher.previous().state.storiesRunId,'live');
    assert.equal(switcher.inspect().state?.storiesRunId??null,operation==='clear'?null:'candidate');
  }
});

test('a tab-only recovery copy never authorizes destructive replacement',async()=>{
  const {openLocalCampaignSlots}=await import('../site/apps/governor/src/local-campaign-slots.js');
  const db=memory(),scoped=scopedStorage(db,'guest:test',{context:'free'}),tab=memory();
  let full=true;
  const protectedStore={...scoped,setItem(key,value){if(full)throw new Error('local/quota');scoped.setItem(key,value);}};
  const slots=await openLocalCampaignSlots(protectedStore,{indexedDB:null,sessionStorage:tab});
  slots.setItem('previous','original');assert.equal(slots.getItem('previous'),'original');
  await assert.rejects(slots.confirm('previous','original'),/quota/);
  full=false;await slots.confirm('previous','original');
  const freshTab=await openLocalCampaignSlots(scoped,{indexedDB:null,sessionStorage:memory()});
  assert.equal(freshTab.getItem('previous'),'original');
});

test('a full primary localStorage mirror cannot substitute a stale turn for the original final',()=>{
  const sc=scopedStorage(memory(),'guest:mirror',{context:'free'}), primary=new S.Store(sc);
  const game=position('durable-finish',15);const api=finalFive(sc,G,()=>true);
  primary.write(game);api.capture(game);
  // Only the platform's durable store could accept the remaining years.
  sc.setItem('platform-run',JSON.stringify({campaignToken:game.storiesRunId}));
  while(!game.completed)defer(game);
  assert.ok(api.begin(game,'Alternative'));assert.equal(api.open().finished.history.length,20);
  sc.setItem('platform-run',JSON.stringify({campaignToken:'different-new-run'}));
  assert.equal(api.open(),null);
});

test('the last good current revision and the previous campaign can each recover a damaged primary',async()=>{
  for (const choice of ['current','previous']) {
    const db=memory(), store=new S.Store(db);
    const previous=position('earlier',3), current=position('now',1);
    const oldRun={campaignToken:'earlier',submissionId:'previous-result'};
    const run={campaignToken:'now',submissionId:'current-result'};
    store.write(previous);await store.replaceDurably(current,oldRun);
    defer(current);store.write(current);defer(current);store.write(current);
    assert.equal(store.recoverableRevision('ok',run),null);
    const pinned=db.getItem(S.Previous), rolling=db.getItem(S.Backup);
    db.setItem(S.Key,'{damaged current');
    const reopen=new S.Store(db), {status}=reopen.inspect();
    assert.equal(status,'corrupt');
    assert.equal(reopen.recoverableRevision(status,{campaignToken:'unrelated'}),null);
    const lastGood=reopen.recoverableRevision(status,run);
    assert.equal(lastGood.storiesRunId,'now');assert.equal(lastGood.history.length,2);
    assert.equal(reopen.backup().state.storiesRunId,'earlier');
    const selected=choice==='current'?lastGood:reopen.backup().state;
    const restored=await reopen.replaceDurably(selected,run);
    assert.equal(restored.submissionId,choice==='current'?run.submissionId:oldRun.submissionId);
    assert.equal(reopen.inspect().state.storiesRunId,selected.storiesRunId);
    assert.equal(reopen.previous().state.storiesRunId,choice==='current'?'earlier':'now');
    if(choice==='current')assert.equal(db.getItem(S.Previous),pinned);
    assert.equal(db.getItem(S.Backup),rolling);
    assert.ok(reopen.recovery().some(entry=>entry.key===S.Key&&entry.raw==='{damaged current'));
    defer(selected);reopen.write(selected);
    assert.equal(reopen.previous().state.storiesRunId,choice==='current'?'earlier':'now','the other healthy campaign survives autosave');
    db.setItem(S.Backup,db.getItem(S.Previous));assert.equal(reopen.recoverableRevision('corrupt',null),null);
    db.removeItem(S.Previous);assert.equal(reopen.recoverableRevision('corrupt',null),null);
  }
});
