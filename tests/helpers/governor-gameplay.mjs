import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const sandbox={console};sandbox.window=sandbox;vm.createContext(sandbox);
for(const name of ['game-data','stage3-data','stage4-data','consolidation-data','agenda','project-state',
  'population','recovery','budget-review','finance','governance-data','governance','stories-data','stories',
  'world-outcomes','campaign-strategy','state-integrity','engine']){
  vm.runInContext(await fs.readFile(new URL(`../../site/apps/governor/src/${name}.js`,import.meta.url),'utf8'),sandbox,{filename:name});
}
const G=sandbox.GovernorGame,E=G.Engine,A=G.Agenda,F=G.Finance;
const fresh=options=>E.createState({scenarioId:'balanced',seed:'GAMEPLAY-1',campaignMode:'agenda',...options});
const json=value=>JSON.parse(JSON.stringify(value));
function valid(state,where){
  assert.ok(E.validateState(state),`${where}: ${JSON.stringify({agenda:A.verify(state),integrity:G.Integrity.check(state,G.DATA,G.Population,F),strategy:G.CampaignStrategy.check(state)})}`);
}
function settle(state){
  for(let guard=0;G.BudgetReview.pending(state)&&!G.BudgetReview.stopped(state);guard++){
    assert.ok(guard<12,'financial transition must resolve or stop');
    const choices=state.budgetReview.pending.event.options;
    const choice=['reserve','grant','loan'].map(id=>choices.find(q=>q.id===id&&q.available)).find(Boolean);
    if(choice)E.resolveBudgetReview(state,choice.id);else E.endUnderSupervision(state);
  }
}
function advance(state){E.advanceTurn(state);settle(state);valid(state,'advance');}
function defer(state,id=A.OPERATIONS.id){
  if(A.needsChoice(state))E.chooseAgenda(state,id);
  const m=E.getCurrentMission(state);
  E.commitAction(state,m.actions.find(a=>a.deferred).id,'treasury');settle(state);valid(state,'defer');
  if(!G.BudgetReview.stopped(state))advance(state);
}
function promiseReports(state){
  for(const p of state.governance.promises)if(p.kind==='report'&&p.status==='pending'&&state.turnIndex+1>p.createdTurn&&state.turnIndex+1<=p.dueTurn)E.publishPromiseReport(state,p.id);
}
function firstPlan(state,actionId,terms=[],placementId){
  const mission=E.getCurrentMission(state);
  const actions=actionId?mission.actions.filter(a=>a.id===actionId):mission.actions.filter(a=>!a.deferred);
  for(const action of actions){
    const p=E.previewAction(state,action.id,undefined,placementId,terms);
    if(p?.affordable)return p;
    for(const mode of ['treasury','cofinance','reserve','debt']){
      const alternate=E.previewAction(state,action.id,mode,placementId,terms);
      if(alternate?.affordable)return alternate;
    }
  }
  return null;
}
const PLANNED=[['school-neighbourhood','school-campus'],['rural-healthcare','mobile-units'],['digital-services','cyber-first'],
  ['family-neighbourhood','commuter-link'],['youth-employment','skills-compact'],['health-delivery','municipal-health-contracts'],
  ['river-land-use','nature-buffer'],['digital-procurement','modular-platform'],['industrial-transition','supplier-clusters'],
  null,['flu-wave','federal-help'],null,['major-flood','evacuate'],['health-legacy','integrated-primary-care'],
  ['childcare-queue','licensed-childminders'],['generations-city','mixed-generations'],['river-legacy','climate-insurance-pool'],
  ['industrial-legacy','university-industry-city'],['public-audit','open-ledger'],null];
function campaign(scenarioId,seed,policy,budgetMode='automatic',strategyId){
  const state=fresh({scenarioId,seed,budgetMode,...(strategyId?{strategyId}:{})});
  const planning=policy==='planned'||Array.isArray(policy),plan=Array.isArray(policy)?policy:PLANNED;
  while(!state.completed&&!G.BudgetReview.stopped(state)){
    promiseReports(state);
    if(planning)for(const project of state.finance.portfolio){
      const q=E.renewalQuote(state,project.id);
      if(q.available&&F.projectObligations(state,3).minimumCash>q.fee+q.futureCommitment+3)E.renewProgramme(state,project.id);
    }
    const requested=policy==='five'&&state.turnIndex<5?[A.TOPICS[state.turnIndex].id,null]:planning?plan[state.turnIndex]:null;
    let p=null,terms=[];
    if(requested&&A.pending(state).some(t=>t.id===requested[0])){
      E.chooseAgenda(state,requested[0]);
      if(G.Governance.sceneFor(requested[0]))terms=['delivery-team','public-report'];
      p=firstPlan(state,requested[1],terms,requested[2]);
      if(planning&&p){
        const forecast=F.projectObligations(state,3);
        if(forecast.minimumCash<p.plan.treasuryCost+3*p.plan.profile.annualOpex+2.5)p=null;
      }
    }
    if(!p){E.chooseAgenda(state,A.OPERATIONS.id);p=E.previewAction(state,A.OPERATIONS.actions[0].id,'treasury');terms=[];}
    E.commitAction(state,p.action.id,p.plan.id,p.placement?.id,terms);settle(state);valid(state,'policy commit');
    if(!G.BudgetReview.stopped(state))advance(state);
  }
  valid(state,'terminal');
  return state;
}


export {G,E,A,F,fresh,json,valid,settle,advance,defer,promiseReports,firstPlan,campaign};
