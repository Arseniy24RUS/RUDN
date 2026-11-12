import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync} from '../site/assets/js/checkpoint-sync.js';
import {bootstrapUpdateCoordinator,UPDATE_PENDING_KEY} from '../site/assets/js/platform-update-coordinator.js';
import {canResumeStoredGameDraft,compatibleCareerMirror} from '../site/assets/js/game-release-policy.js';

const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32);
const owner='student:123456';
const route='#activity/seminar-2';
const game={owner,activitySlug:'seminar-2',mode:'seminar'};
const form={owner,activitySlug:'seminar-5',mode:'form',attemptId:'appeal'};
function storage(){
  const map=new Map();
  return {get length(){return map.size},key:i=>[...map.keys()][i]??null,
    getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
}
function build(buildId){globalThis.__RUDN_RELEASE__={buildId,retention:'current-only'};}

test('only a stale unfinished game is retired; local results and queued delivery survive',async t=>{
  const device=storage();
  const options={indexedDB:null,localStorage:device,broadcast:false};
  let store=createDurableStore(options);
  t.after(()=>{store.close();delete globalThis.__RUDN_RELEASE__;});
  await store.checkpoint({...game,attemptId:'legacy',state:{placed:3}});
  build(A);
  const old=await store.checkpoint({...game,attemptId:'old',state:{placed:4}});
  assert.equal(old.releaseBuildId,A);
  await store.complete({...game,attemptId:'completed',state:{finished:true},attempt:{id:'completed',points:5}});
  await store.checkpoint({...form,state:{answer:'Сохранённое обращение'}});
  const terminal={owner,activitySlug:'seminar-3',mode:'settlements-assessment',attemptId:'pending'};
  await store.checkpoint({...terminal,state:{status:'completion-pending',result:{terminal:true}}});
  store.close();

  build(B);
  store=createDurableStore(options);
  assert.equal(await store.loadDraft({...game,attemptId:'legacy'}),null);
  assert.equal(await store.loadDraft({...game,attemptId:'old'}),null);
  assert.equal((await store.loadDraft({...game,attemptId:'completed'})).phase,'completed');
  assert.equal((await store.loadDraft(form)).state.answer,'Сохранённое обращение');
  assert.equal((await store.loadDraft(terminal)).state.status,'completion-pending');
  assert.deepEqual(await store.listAttempts({owner}),[{id:'completed',points:5}]);
  assert.equal((await store.listPending({owner})).some(op=>op.type==='attempt'&&op.attemptId==='completed'),true);
  await store.checkpoint({...game,attemptId:'new',state:{placed:1}});
  assert.equal((await store.loadDraft(game)).releaseBuildId,B);
  assert.equal((await store.loadDraft({...game,attemptId:'new'})).state.placed,1);
  assert.equal((await store.exportBackup({owner})).drafts.some(draft=>draft.attemptId==='old'),true);
});

test('cloud restore ignores a newer stale checkpoint and loads the current build',async t=>{
  build(B);
  const store=createDurableStore({indexedDB:null,localStorage:storage(),broadcast:false});
  t.after(()=>{store.close();delete globalThis.__RUDN_RELEASE__;});
  const remote=(id,releaseBuildId,updatedAt)=>({studentKey:'123456',activitySlug:game.activitySlug,mode:game.mode,
    updatedAt,revision:1,current:{...game,attemptId:id,releaseBuildId,state:{placed:updatedAt},updatedAt}});
  const cloud={older:remote('current',B,10),newer:remote('stale',A,20)};
  const sync=createCheckpointSync({store,getIdentity:()=>({owner,studentKey:'123456',uid:'test-uid'}),
    transport:{get:async()=>({value:cloud})}});
  assert.equal((await sync.restore(game)).attemptId,'current');
  assert.equal(await store.importRemoteDraft({...cloud.newer.current,remoteRevision:1}),null);
  assert.equal((await store.loadDraft(game)).state.placed,10);
});

test('Career carries completed results and independent portfolio data across builds',t=>{
  build(B);
  t.after(()=>delete globalThis.__RUDN_RELEASE__);
  const createdAt='2026-11-12T12:00:00.000Z',recordId='functional-finished';
  const unfinished=JSON.stringify({answers:[1,2],setupComplete:true});
  const completed=JSON.stringify({setupComplete:true,completedAt:createdAt,resultRecordId:recordId,answers:Array(43).fill(1),
    completion:{schema:'rudn-career-result',schemaVersion:3,resultKind:'vacancy-functional',completed:true,
      recordId,createdAt,answerCount:43}});
  const portfolio={'workbook-v2':'{"notes":{}}','scenarios-v2':'{"scenarios":[]}'};
  const pendingValues={...portfolio,'functional-career-v1':unfinished,'career-journey-v1':'{"confirmed":true}'};
  const finishedValues={...pendingValues,'functional-career-v1':completed,
    'career-journey-v1':JSON.stringify({resultRecordId:recordId})};
  const draft=(values,activitySlug='career-workspace')=>({activitySlug,releaseBuildId:A,state:{values,personalityComplete:true}});
  assert.equal(canResumeStoredGameDraft(draft(pendingValues)),false);
  assert.equal(canResumeStoredGameDraft(draft(finishedValues)),true);
  assert.deepEqual(compatibleCareerMirror(pendingValues),portfolio);
  assert.deepEqual(compatibleCareerMirror(finishedValues),finishedValues);
  const freeResult={'answers-v8.1':JSON.stringify({completedAt:createdAt,resultRecordId:'career-finished'})};
  assert.equal(canResumeStoredGameDraft(draft(freeResult,'career-freeplay')),true);
  assert.deepEqual(compatibleCareerMirror(freeResult),freeResult);
});

function recovery(adapters,sourceBuild=A,targetBuild=B){
  const token='test-recovery';
  const local=storage();
  const envelope={schema:1,token,owner,sourceBuild,targetBuild,route,previous:{buildId:A},
    adapters:adapters.map(({module})=>({module,resumeToken:module+'-state'}))};
  local.setItem(UPDATE_PENDING_KEY,JSON.stringify({token,owner,sourceBuild,targetBuild,route,phase:'switching',previous:{buildId:A}}));
  const snapshots=new Map([[token,envelope]]);
  const controller=bootstrapUpdateCoordinator({getAdapters:()=>adapters,getOwner:()=>owner,getRoute:()=>route,
    storage:local,persistentStorage:local,autoStart:false,window:null,document:null,
    store:{get:async key=>snapshots.get(key),remove:async key=>snapshots.delete(key)},
    release:{getReleaseContext:()=>({buildId:B,retention:'current-only'}),rollbackRelease:()=>assert.fail('no old build rollback')}});
  return {controller,local,snapshots,token};
}

test('a published update restores a form while retiring a game checkpoint from another build',async t=>{
  let restores=0;
  const {controller,local}=recovery([
    {module:'maps',resumeAfterUpdate:async()=>assert.fail('old game checkpoint restored')},
    {module:'form',resumeAfterUpdate:async()=>{restores++;return {status:'restored'};}}
  ]);
  t.after(()=>controller.destroy());
  assert.deepEqual(await controller.restorePending(),{status:'restored'});
  assert.equal(restores,1);
  assert.equal(local.getItem(UPDATE_PENDING_KEY),null);
});

test('failed current boot blocks in place; a superseded transition cannot block the live build',async t=>{
  const failed=recovery([{module:'form',resumeAfterUpdate:async()=>({status:'blocked',code:'failed'})}]);
  const stale=recovery([{module:'form',resumeAfterUpdate:async()=>assert.fail('stale target restored')}],A,C);
  t.after(()=>{failed.controller.destroy();stale.controller.destroy();});
  assert.deepEqual(await failed.controller.restorePending(),{status:'blocked',code:'update/current-unavailable'});
  assert.equal(failed.snapshots.has(failed.token),true);
  assert.deepEqual(await stale.controller.restorePending(),{status:'retired'});
  assert.equal(stale.local.getItem(UPDATE_PENDING_KEY),null);
  assert.equal(stale.snapshots.has(stale.token),true);
});
