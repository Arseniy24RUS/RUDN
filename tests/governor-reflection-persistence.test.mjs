import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRunMetadata} from '../site/apps/governor/platform-contract.js';
import {governorReflectionText,isGovernorReflection,makeGovernorReflection,latestGovernorReflection,governorAttemptsWithReflections} from '../site/assets/js/governor-reflections.js';
import {createDurableStore} from '../site/assets/js/durable-store.js';
import {createCheckpointSync,commitStudentAttempt} from '../site/assets/js/checkpoint-sync.js';

globalThis.crypto ||= webcrypto;
const bridge=await fs.readFile(new URL('../site/apps/governor/platform-bridge.js',import.meta.url),'utf8');
const studentKey='governor-synthetic',owner='student:'+studentKey,uid='synthetic-uid';
const campaign=(extra={})=>({id:'campaign-one',studentKey,activitySlug:'seminar-7',type:'governor-simulator',source:'native-v1',recordGrade:true,
  points:4,maxPoints:5,reflection:'',createdAt:'2026-01-01T00:00:00.000Z',governor:{campaignStatus:'completed',decisions:20,assessment:{points:4}},...extra});
const memoryStorage=()=>{const map=new Map();return {get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};

test('Governor report grouping joins the latest reflection without adding attempts or changing grades',()=>{
  const parent=campaign(),early=makeGovernorReflection({id:'reflection-one',parent,reflection:'Первый вывод',revision:1,now:'2026-01-02T00:00:00Z'});
  const latest=makeGovernorReflection({id:'reflection-two',parent,reflection:'Уточнение после итогов',revision:2,now:'2026-01-03T00:00:00Z'});
  const foreign={...latest,id:'foreign',studentKey:'another-student',createdAt:'2026-02-01T00:00:00Z'};
  const wrongParent={...latest,id:'wrong-parent',parentAttemptId:'another-campaign',createdAt:'2026-02-02T00:00:00Z'};
  const future={...latest,id:'future-schema',schemaVersion:2,createdAt:'2026-02-03T00:00:00Z'};
  const records={parent,latest,early,foreign,wrongParent,future},original=structuredClone(parent);
  const reports=governorAttemptsWithReflections(records,studentKey);
  assert.equal(reports.length,1);assert.equal(reports[0].reflection,latest.reflection);assert.equal(reports[0].reflectionRecordId,latest.id);
  assert.equal(reports[0].points,4);assert.deepEqual(reports[0].governor,parent.governor);assert.deepEqual(parent,original);
  assert.equal(Object.values(records).filter(a=>a.recordGrade!==false).length,1,'general student history still has one graded attempt');
  const clear=makeGovernorReflection({id:'reflection-clear',parent,reflection:'',revision:3,now:'2026-01-04T00:00:00Z'});
  assert.equal(governorAttemptsWithReflections({...records,clear},studentKey)[0].reflection,'','an explicit empty replacement does not resurrect the original');
  assert.equal(governorAttemptsWithReflections({parent},studentKey)[0].reflection,'');
  assert.equal(latestGovernorReflection(records,parent).id,latest.id);
  assert.equal(isGovernorReflection(latest,null),false);assert.equal(latestGovernorReflection(records,null),null);
  assert.deepEqual(governorAttemptsWithReflections([null,{},latest],undefined),[]);
});

// Execute the production bridge functions and input handler. Browser elements,
// identity and the backend boundary are synthetic; the grading model is outside
// this test, so the immutable facts have a deliberately fixed four-point result.
function bridgeFixture({storage=memoryStorage(),attempts=[],initialRun=null}={}){
  const nodes=new Map(),calls=[];let failType=null;
  const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{open:false,events:{},showModal(){this.open=true;},addEventListener(name,fn){this.events[name]=fn;}});return nodes.get(selector);};
  const backend={isAdmin:()=>false,getProfile:()=>({studentKey}),localAttempts:()=>attempts,
    async saveAttempt(record){calls.push(structuredClone(record));if(record.type===failType)throw new Error('synthetic storage failure');
      if(!attempts.some(a=>a.id===record.id))attempts.push(structuredClone(record));return record;}};
  const sandbox=vm.createContext({$,backend,storage,attempts,calls,structuredClone,performance,createRunMetadata,
    governorReflectionText,isGovernorReflection,latestGovernorReflection,makeGovernorReflection,
    initialRun:initialRun||{...createRunMetadata(),submissionId:'campaign-one'},owner,
    makeSubmission:({run,reflection})=>campaign({id:run.submissionId,reflection}),assessCampaign:()=>({points:4})});
  vm.runInContext(`const G={BudgetReview:{stopped:()=>false}},free=false,context='course';
    let run=initialRun,updatePaused=false,submissionBusy=false,reflectionBusy=false,reflectionFailure='';
    const state={completed:true,history:Array.from({length:20},()=>({}))},runtime={state:()=>state,canWrite:()=>true};
    const sameOwner=()=>true,terminal=s=>s?.completed===true,tr=ru=>ru,diagnostics={record(){},error(){}};
    const message=()=>{},refresh=()=>{},renderAssessment=()=>{},syncText=()=>'',readState=()=>({pending:true}),pendingStorageKey=()=>'';
    function stored(key,fallback=null){try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}}
    function persistRun(){storage.setItem('platform-run',JSON.stringify(run));}
    function ensureRun(){persistRun();return run;}
    ${bridge.slice(bridge.indexOf('function reflectionParent('),bridge.indexOf('async function tryStart('))}
    ${bridge.slice(bridge.indexOf("$('#platform-reflection').addEventListener('input'"),bridge.indexOf("$('#platform-back').addEventListener('click',async event"))}
    globalThis.api={submit,saveReflection,dialog:submissionDialog,getRun:()=>run,busy:()=>reflectionBusy||submissionBusy,
      edit:text=>{$('#platform-reflection').value=text;$('#platform-reflection').events.input();}};`,sandbox);
  return {api:sandbox.api,$,storage,attempts,calls,fail:type=>failType=type};
}
async function settled(f){for(let i=0;i<30&&f.api.busy();i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.api.busy(),false);}

test('Governor reflection stays editable after failed auto-submission and is persisted as an ungraded addendum on retry',async()=>{
  const f=bridgeFixture();f.fail('governor-simulator');f.api.dialog();await f.api.submit();
  const frozen=JSON.parse(f.storage.getItem('submission:campaign-one'));
  assert.equal(frozen.reflection,'');f.api.dialog();assert.equal(f.$('#platform-reflection').readOnly,false);
  f.api.edit('После анализа итогов выбрал бы иную территорию.');
  assert.equal(JSON.parse(f.storage.getItem('platform-run')).reflection,'После анализа итогов выбрал бы иную территорию.');
  f.fail(null);await f.api.saveReflection();await settled(f);
  assert.equal(f.attempts.length,2);assert.deepEqual(JSON.parse(f.storage.getItem('submission:campaign-one')),frozen);
  const addendum=f.attempts.find(a=>a.type==='governor-reflection');assert.equal(addendum.recordGrade,false);
  assert.equal(Object.hasOwn(addendum,'points'),false);assert.equal(addendum.parentAttemptId,frozen.id);assert.equal(addendum.draftMode,'reflection');
  const report=governorAttemptsWithReflections(f.attempts,studentKey)[0];assert.equal(report.reflection,addendum.reflection);assert.equal(report.points,4);
  f.api.dialog();assert.equal(f.$('#platform-reflection').readOnly,false);assert.equal(f.$('#platform-reflection').value,addendum.reflection);
});

test('Governor retries the exact pending reflection id after reopening, then saves later edits in a new immutable record',async()=>{
  const first=bridgeFixture();await first.api.submit();first.api.edit('Первый послесловный вывод.');first.fail('governor-reflection');
  await first.api.saveReflection();const pending=structuredClone(first.api.getRun().pendingReflection);
  assert.ok(pending);assert.equal(first.$('#platform-reflection').readOnly,false);
  first.api.edit('Уточнённый вывод после сопоставления территорий.');
  const reopened=bridgeFixture({storage:first.storage,attempts:first.attempts,initialRun:JSON.parse(first.storage.getItem('platform-run'))});
  await reopened.api.saveReflection();await settled(reopened);
  const sent=reopened.calls.filter(a=>a.type==='governor-reflection');assert.equal(sent.length,2);
  assert.deepEqual(sent[0],{...pending,draftMode:'reflection'});assert.notEqual(sent[1].id,pending.id);assert.equal(sent[1].reflectionRevision,pending.reflectionRevision+1);
  assert.equal(reopened.api.getRun().pendingReflection,undefined);
  assert.equal(governorAttemptsWithReflections(reopened.attempts,studentKey).length,1);
  assert.equal(governorAttemptsWithReflections(reopened.attempts,studentKey)[0].reflection,'Уточнённый вывод после сопоставления территорий.');
  assert.equal(reopened.attempts.filter(a=>a.recordGrade!==false).length,1);
});

test('Governor release checkpoint preserves reflection when its editor has not been opened',async()=>{
  let adapterOptions;
  const run={submissionId:'campaign-one',submitted:true,reflection:'Вывод восстановлен из сохранённой кампании.'};
  const sandbox=vm.createContext({run,createUpdateAdapter:options=>{adapterOptions=options;return{destroy(){}};},
    bootstrapUpdateCoordinator:()=>({restorePending:async()=>{}}),captureUpdateView:()=>({}),restoreUpdateView:async()=>{},
    $:()=>({value:'',readOnly:false}),document:{body:{}},location:{hash:''},backend:{},diagnostics:{},
    currentOwner:()=>owner,sameOwner:()=>true,runtime:{checkpointForUpdate:()=>({completed:true})},
    checkpointCampaign:async()=>({revision:2,saveStatus:{durable:true}})});
  vm.runInContext(`let updateAdapter=null,updateCoordinator=null,updatePaused=false,submissionBusy=false,reflectionBusy=false;const context='course',pendingCheckpoints=new Set();
    ${bridge.slice(bridge.indexOf('function installUpdateAdapter('),bridge.indexOf("$('#platform-back').href=courseUrl"))}
    installUpdateAdapter();`,sandbox);
  assert.equal((await adapterOptions.checkpoint()).durable,true);
  assert.equal(run.reflection,'Вывод восстановлен из сохранённой кампании.');
});

test('Governor offline reflection queue survives reopening and lost acknowledgement without creating a new grade',async()=>{
  const storage=memoryStorage(),cloud=new Map();let offline=true,loseAck=false,gradeWrites=0;
  const transport={async get(path){if(offline)throw new TypeError('offline');return{value:structuredClone(cloud.get(path)??null)};},
    async transaction(path,update){if(offline)throw new TypeError('offline');const next=update(structuredClone(cloud.get(path)??null));
      if(next!==undefined){cloud.set(path,structuredClone(next));if(path.startsWith('grades/'))gradeWrites++;
        if(loseAck&&path.startsWith('attempts/')&&next.type==='governor-reflection'){loseAck=false;throw new TypeError('lost acknowledgement');}}
      return{value:structuredClone(cloud.get(path)??null)};}};
  let store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null});
  const parent=campaign(),addon=makeGovernorReflection({id:'offline-reflection',parent,reflection:'Отложенный вывод',revision:1,now:'2026-01-02T00:00:00Z'});
  const scope={owner,activitySlug:'seminar-7',mode:'campaign',attemptId:parent.id};
  await store.complete({...scope,state:{campaign:{completed:true},run:{submissionId:parent.id}},attempt:parent});
  const before=(await store.loadDraft(scope)).state;
  await store.complete({owner,activitySlug:'seminar-7',mode:'reflection',attemptId:addon.id,state:{resultAttempt:addon},attempt:addon});
  store.close();store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null});
  const sync=createCheckpointSync({store,transport,deviceId:'governor-synthetic-device',getIdentity:()=>({owner,studentKey,uid,generation:1}),
    commitAttempt:(attempt,options)=>commitStudentAttempt(transport,attempt,{studentKey,uid,activityMax:{'seminar-7':5},...options})});
  async function retry(){for(const op of await store.listPending({owner,includeDeferred:true,limit:1000}))await store.retry(op.id,{revision:op.revision});return sync.flush();}
  try{
    assert.ok((await sync.flush()).deferred>0);assert.equal((await store.listAttempts({owner})).length,2);
    offline=false;loseAck=true;await retry();assert.equal(loseAck,false);
    await retry();assert.equal((await store.listPending({owner,includeDeferred:true})).length,0);
    assert.equal(cloud.get('attempts/'+studentKey+'/'+addon.id).reflection,'Отложенный вывод');
    assert.equal(cloud.get('grades/'+studentKey+'/seminar-7').points,4);assert.equal(gradeWrites,1);
    assert.deepEqual((await store.loadDraft(scope)).state,before,'reflection does not overwrite the campaign draft');
  }finally{sync.stop();store.close();}
});
