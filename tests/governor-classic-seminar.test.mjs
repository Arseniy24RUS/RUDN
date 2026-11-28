import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../site/apps/governor/'+name,import.meta.url),'utf8');
const bridge=read('platform-bridge.js'),budgetUI=read('src/budget-review-ui.js');
function section(start,end){
  const from=bridge.indexOf(start),to=bridge.indexOf(end,from+1);
  if(from<0||to<0)throw Error('Cannot find '+start);
  return bridge.slice(from,to);
}
function element(){
  return {hidden:false,disabled:false,children:[],events:{},focus(){},scrollIntoView(){},
    append(child){this.children.push(child);},addEventListener(type,fn){this.events[type]=fn;},showModal(){this.open=true;},setAttribute(){}};
}
const address='https://example.edu/apps/governor/?context=course&edition=legacy&practice=last-five&returnTo=term&lang=ru#old';
function fixture({free=false,admin=false,accepted=null}={}){
  const nodes=new Map(),writes=[],items=new Map(),attempts=accepted?[accepted]:[];
  const $=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  const state={history:[{},{}],completed:false,budgetReview:{status:'supervised'}};
  const scope={state,free,admin,$,items,attempts,writes,location:new URL(address),URL,performance,document:{createElement:element},
    backend:{isAdmin:()=>admin,localAttempts:()=>attempts,getProfile:()=>({studentKey:'student'}),saveAttempt:async row=>{writes.push(row);attempts.push(row);}},
    G:{BudgetReview:{stopped:s=>s?.budgetReview?.status==='supervised'}},assessmentReceived:undefined};
  vm.createContext(scope);
  vm.runInContext(`
    const run={submissionId:'test',submitted:false},owner='student:student',context=free?'free':'course',storage={setItem:(k,v)=>items.set(k,v)};
    const runtime={state:()=>state,canWrite:()=>true},sameOwner=()=>true,terminal=s=>Boolean(s&&(s.completed||G.BudgetReview.stopped(s)));
    const tr=ru=>ru,diagnostics={record(){},error(){}},ensureRun=()=>run,persistRun=()=>{},refresh=()=>{},syncText=()=>'',renderReflectionStatus=()=>{};
    const reflectionParent=()=>attempts[0],reflectionReceipt=()=>null,renderAssessment=a=>{globalThis.assessmentReceived=a;};
    const assessCampaign=()=>({points:3}),stored=k=>items.has(k)?JSON.parse(items.get(k)):null,makeSubmission=()=>({id:'test',studentKey:'student',points:3});
    let submissionBusy=false,updatePaused=false;
    ${section('function canSubmitCampaign(', 'function reflectionReceipt(')}
    ${section('function submissionDialog(', 'async function tryStart(')}
    globalThis.api={dialog:submissionDialog,submit,canSaveCampaignReflection,useHistoricCampaign,currentSeminarURL,needsNewSeminarCampaign};
  `,scope);
  return {api:scope.api,state,writes,nodes,items,scope,$};
}

test('Classic grading accepts only a complete term, preserves historical receipts and leaves free-play supervision available',async()=>{
  const blocked=fixture();await blocked.api.submit();blocked.api.dialog();
  assert.equal(blocked.writes.length,0);assert.equal(blocked.items.size,0);
  assert.equal(blocked.$('#platform-submit').hidden,true);
  assert.equal(blocked.scope.assessmentReceived,null);
  assert.equal(blocked.api.canSaveCampaignReflection(blocked.state),false);
  const link=blocked.$('#platform-submission-intro').children[0];
  assert.equal(new URL(link.href).search,'?context=course&edition=v4&lang=ru');assert.equal(new URL(link.href).hash,'');
  const receipt={id:'test',studentKey:'student',points:2,governor:{assessment:{points:2}}};
  const historical=fixture({accepted:structuredClone(receipt)});await historical.api.submit();historical.api.dialog();
  assert.equal(historical.scope.assessmentReceived.points,2);assert.equal(historical.api.canSaveCampaignReflection(historical.state),true);
  assert.deepEqual(historical.scope.attempts,[receipt]);assert.equal(historical.writes.length,0);
  const finished=fixture();finished.state.completed=true;finished.state.budgetReview.status='active';
  finished.state.history=Array(19).fill({});await finished.api.submit();assert.equal(finished.writes.length,0);
  finished.state.history.push({});await finished.api.submit();await finished.api.submit();assert.equal(finished.writes.length,1);
  const free=fixture({free:true});await free.api.submit();assert.equal(free.writes.length,1);
  const preview=fixture({admin:true});await preview.api.submit();assert.equal(preview.writes.length,0);
});

test('The default keeps a prior classic save, the explicit course link opens V4, and practice returns to its original term',()=>{
  const api=fixture().api;
  assert.equal(api.useHistoricCampaign(true,null,false,false),true);
  assert.equal(api.useHistoricCampaign(true,'v4',false,false),false);
  assert.equal(api.useHistoricCampaign(true,null,true,false),false);
  assert.equal(api.useHistoricCampaign(true,'legacy',true,false),true);
  assert.equal(api.useHistoricCampaign(true,null,true,true),true);
  assert.equal(api.useHistoricCampaign(false,null,false,false),false);
  assert.equal(fixture({free:true}).api.useHistoricCampaign(true,null,false,false),false);
});

function drawBudget({graded=true,available=false,stopped=false}={}){
  const dialog=element(),nodes=new Map(),currentURL=fixture().api.currentSeminarURL();
  dialog.querySelector=selector=>{
    if(selector.startsWith('[data-')&&!dialog.innerHTML.includes(selector.slice(1,-1)))return null;
    if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);
  };
  dialog.querySelectorAll=()=>[];
  const state={history:[{}],turnIndex:1,population:{baseYear:2026},budgetReview:{pending:{approvals:[],event:{year:2027,amount:2,reason:'crisis',options:[{id:'reserve',available}]}}}};
  let handovers=0;
  const game={I18n:{choose:(l,r)=>typeof r==='function'?r():r,intlLocale:()=>'ru'},Platform:{gradedSeminar:graded,currentSeminarURL:currentURL},
    BudgetReview:{active:()=>true,stopped:()=>stopped,pauseUntil:()=>0,loans:()=>[],LIMITS:{grantLifetime:10},report:()=>({events:[],loans:[],payments:[]})},
    Engine:{endUnderSupervision:()=>{handovers++;}},icon:()=>''};
  const scope={GovernorGame:game,document:{createElement:()=>dialog,body:{append(){}},activeElement:null},Intl};
  vm.createContext(scope);vm.runInContext(budgetUI,scope);
  game.BudgetReviewUI.init({state:()=>state,language:()=>'ru',canWrite:()=>true,save:()=>true,refresh(){}});
  game.BudgetReviewUI.open();
  return {html:dialog.innerHTML,dialog,handovers:()=>handovers};
}
test('Classic shortfall screen offers funding first, opens V4 only at a dead end, and keeps handover in free play',()=>{
  const solvent=drawBudget({available:true});assert.doesNotMatch(solvent.html,/data-budget-stop-review|edition=v4/);
  const exhausted=drawBudget();assert.doesNotMatch(exhausted.html,/data-budget-stop-review/);assert.match(exhausted.html,/href="[^"]*edition=v4/);
  const archive=drawBudget({stopped:true});assert.match(archive.html,/edition=v4/);
  const practice=drawBudget({graded:false,available:true});
  assert.match(practice.html,/data-budget-stop-review/);assert.doesNotMatch(practice.html,/edition=v4/);
  practice.dialog.querySelector('[data-budget-stop-review]').events.click();
  practice.dialog.querySelector('[data-budget-confirm]').onclick();
  assert.equal(practice.handovers(),1);
});
