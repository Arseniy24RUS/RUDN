/* Negotiations are fictional delivery agreements, not a substitute for law.
 * Preview is pure. Money moves only through Finance, once a decision commits.
 */
(function(root){
 'use strict';
 const C=root.GovernorGame?.GovernanceData||(typeof require==='function'?require('./governance-data.js'):null);
 const VERSION='5.0';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const round=x=>Math.round((Number(x)+Number.EPSILON)*100)/100;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const sceneFor=id=>C.scenes.find(s=>s.missionId===id)||null;
 const termFor=id=>C.terms.find(t=>t.id===id);
 const keyFor=(missionId,actionId,mode,placement)=>[missionId,actionId,mode,placement||''].join('|');
 function create(){return{version:VERSION,draft:null,agreements:[],promises:[],events:[],trust:Object.fromEntries(C.actors.map(a=>[a.id,0]))};}
 function checkTerms(ids,mode){
  if(!Array.isArray(ids)||ids.length>2||new Set(ids).size!==ids.length)throw Error('A package can contain at most two distinct terms');
  const actors=new Set();
  for(const id of ids){const t=termFor(id);if(!t)throw Error('Unknown agreement term');if(actors.has(t.actor))throw Error('Choose only one term per participant');actors.add(t.actor);if(t.requires&&t.requires!==mode)throw Error('Reporting tranche requires cofinancing');}
  return ids.map(termFor);
 }
 function selectionTerms(state,missionId,actionId,mode,placement,override){
  if(override!==undefined)return checkTerms(override,mode);
  const d=state.governance?.draft;
  const ids=d?.key===keyFor(missionId,actionId,mode,placement)?d.termIds:[];
  return checkTerms(ids,mode);
 }
 function setDraft(state,selection,ids){
  const scene=sceneFor(selection.missionId);
  if(!scene||state.completed||state.awaitingContinue)throw Error('There is no editable meeting');
  checkTerms(ids,selection.mode);
  const key=keyFor(selection.missionId,selection.actionId,selection.mode,selection.placementId);
  state.governance.draft={...copy(selection),key,termIds:[...ids]};
  return state.governance.draft;
 }
 function preview(state,mission,baseAction,mode,placement,override){
  if(baseAction.deferred)return null;
  const scene=sceneFor(mission.id);
  if(!scene)return null;
  const terms=selectionTerms(state,mission.id,baseAction.id,mode,placement?.id,override);
  const scores=Object.fromEntries(C.actors.map((a,i)=>[a.id,Number(scene.positions[baseAction.id]?.[i]||0)+clamp(state.governance.trust[a.id],-2,2)]));
  if(mode==='debt')scores.finance-=1;
  if(mode==='cofinance')scores.finance+=.5;
  if(placement?.costMultiplier>1.04)scores.finance-=.5;
  if(placement?.id==='existing-towns')scores.residents+=1;
  for(const t of terms)for(const [actor,score]of Object.entries(t.positions))scores[actor]+=score;
  const positions=C.actors.map(a=>({actorId:a.id,score:round(scores[a.id]),stance:scores[a.id]>=2?'support':scores[a.id]<0?'oppose':'cautious'}));
  const supporters=positions.filter(p=>p.stance==='support').length;
  const status=supporters>=2?'agreed':supporters===1?'qualified':'open';
  const extraCost=round(terms.reduce((s,t)=>s+t.cost,0));
  return{sceneId:mission.id,key:keyFor(mission.id,baseAction.id,mode,placement?.id),termIds:terms.map(t=>t.id),positions,status,
   extraCost,annualOpex:round(terms.reduce((s,t)=>s+t.opex,0)),
   adminDelta:round(terms.reduce((s,t)=>s+t.admin,0)),
   riskDelta:round(terms.reduce((s,t)=>s+t.risk,0)+(status==='agreed'?-.02:status==='open'?.03:0)),
   delay:status==='open'?1:0,
   matchBonus:round(terms.reduce((s,t)=>s+t.match,0)),
   supportDelta:status==='agreed'?.5:status==='open'?-1.5:0,
   promises:[],conditionalGrant:0,baseMatch:Number(baseAction.finance?.federalMatch||0)};
 }
 function modifyAction(action,agreement){
  if(!agreement)return action;
  const result=copy(action),a=agreement;
  result.cost=round(action.cost+a.extraCost);
  result.finance={...result.finance,
   lag:Math.max(0,(result.finance.lag||0)+a.delay),
   annualOpex:round((result.finance.annualOpex||0)+a.annualOpex),
   adminLoad:round((result.finance.adminLoad||0)+a.adminDelta),
   federalMatch:Math.min(.8,(result.finance.federalMatch||0)+a.matchBonus)};
  // Risk reduction changes probability, never draws or reveals the outcome.
  result.deliveryRisk=clamp((result.deliveryRisk||result.finance.deliveryRisk||.08)+a.riskDelta,.01,.65);
  result.effects={...result.effects,support:round((result.effects.support||0)+a.supportDelta)};
  return result;
 }
 function describePromises(state,agreement,plan,project){
  if(!agreement)return null;
  const a=copy(agreement),turn=state.turnIndex+1;
  const lag=project?.plannedStartsIn??project?.startsIn??0;
  a.promises=a.termIds.map(id=>{
   const t=termFor(id);
   const p={id:`${a.sceneId}:${id}`,termId:id,actorId:t.actor,kind:t.promise,createdTurn:turn,
    dueTurn:turn+2,originalDueTurn:turn+2,projectId:project?.id||null,status:'pending',observations:[],revisions:[],evidence:null,recoveredAt:null};
   if(t.promise==='launch')p.dueTurn=turn+lag+t.buffer;
   if(t.promise==='continuity'){p.requiredYears=3;p.dueTurn=turn+lag+2;}
   if(t.promise==='reserve')p.floor=round(Math.max(.3,Math.min(1.5,state.finance.reserve*.65)));
   if(t.promise==='report'&&t.id==='milestones')p.conditionalGrant=round(Math.max(0,plan.federalTransfer-round(plan.totalCost*a.baseMatch)));
   p.originalDueTurn=p.dueTurn;return p;
  });
  a.conditionalGrant=round(a.promises.reduce((s,p)=>s+(p.conditionalGrant||0),0));
  return a;
 }
 function event(state,p,type,evidence,delta){
  const turn=state.turnIndex+1;
  const e={type,turn,promiseId:p?.id||null,actorId:p?.actorId||null,evidence:copy(evidence||{}),supportDelta:delta||0};
  state.governance.events.push(e);
  if(delta)state.stats.support=round(clamp(state.stats.support+delta,0,100));
  return e;
 }
 function finishPromise(state,p,status,evidence){
  if(p.status!=='pending')return null;
  p.status=status;p.resolvedTurn=state.turnIndex+1;p.evidence=copy(evidence);
  const delta=status==='kept'?.6:-1.2;
  state.governance.trust[p.actorId]=round(clamp(state.governance.trust[p.actorId]+(status==='kept'?.6:-1),-3,3));
  return event(state,p,status,evidence,delta);
 }
 function register(state,agreement,record){
  if(!agreement)return null;
  if(state.governance.agreements.some(a=>a.sceneId===agreement.sceneId))throw Error('This agreement has already been signed');
  const a={...copy(agreement),turn:state.turnIndex+1,actionId:record.actionId,mode:record.fundingMode,placementId:record.placement?.id||null};
  // The public deadline is calculated from the plan BEFORE a delivery draw.
  for(const promise of a.promises)state.governance.promises.push(copy(promise));
  state.governance.agreements.push(a);state.governance.draft=null;
  record.agreement=copy(a);
  return a;
 }
 function settle(state,Finance){
  const turn=state.turnIndex+1,out=[];
  // Settle every cash consequence before testing ongoing reserve promises.
  for(const p of state.governance.promises){
   if(p.kind==='report'&&p.status==='pending'&&turn>=p.dueTurn&&p.conditionalGrant>0&&!p.restitution){
    p.restitution=copy(Finance.applyInstitutionCost(state,p.conditionalGrant,{type:'conditional-grant-return',promiseId:p.id}));
   }
  }
  for(const p of state.governance.promises){
   const project=state.finance.portfolio.find(x=>x.id===p.projectId);
   if(p.status==='broken'){
    const recovered=p.kind==='launch'&&project?.activatedTurn!=null;
    if(recovered&&!p.recoveredAt){p.recoveredAt=turn;out.push(event(state,p,'late-delivery',{activatedTurn:project.activatedTurn},0));}
    continue;
   }
   if(p.status!=='pending')continue;
   if(p.kind==='launch'&&project?.activatedTurn!=null&&project.activatedTurn<=p.dueTurn){out.push(finishPromise(state,p,'kept',{activatedTurn:project.activatedTurn,dueTurn:p.dueTurn}));continue;}
   if(p.kind==='continuity'){
    if(!p.observations.some(o=>o.turn===turn))p.observations.push({turn,active:project?.status==='active',opex:project?.status==='active'?project.annualOpex:0});
    let consecutive=0,max=0;for(const o of p.observations){consecutive=o.active?consecutive+1:0;max=Math.max(max,consecutive);}
    if(max>=p.requiredYears){out.push(finishPromise(state,p,'kept',{consecutiveYears:max,observedThrough:turn}));continue;}
   }
   if(p.kind==='reserve'){
    // A reserve floor is a continuing annual-close commitment, not a last-day test.
    if(!p.observations.some(o=>o.turn===turn))p.observations.push({turn,reserve:state.finance.reserve,floor:p.floor});
    const breach=p.observations.find(o=>o.reserve+1e-7<p.floor);
    if(breach){out.push(finishPromise(state,p,'broken',{breachTurn:breach.turn,reserve:breach.reserve,floor:p.floor}));continue;}
    if(turn>=p.dueTurn){out.push(finishPromise(state,p,'kept',{reserve:state.finance.reserve,floor:p.floor,observedThrough:turn}));continue;}
   }
   if(turn<p.dueTurn)continue;
   const restitution=p.restitution||null;
   out.push(finishPromise(state,p,'broken',{dueTurn:p.dueTurn,checkedTurn:turn,projectStatus:project?.status||null,
    startsIn:project?.startsIn??null,reserve:p.kind==='reserve'?state.finance.reserve:undefined,floor:p.floor,restitution}));
  }
  return out.filter(Boolean);
 }
 function publishReport(state,promiseId){
  const p=state.governance.promises.find(x=>x.id===promiseId),turn=state.turnIndex+1;
  if(!p||p.kind!=='report'||p.status!=='pending'||state.completed||state.awaitingContinue||turn<=p.createdTurn||turn>p.dueTurn)throw Error('The report cannot be published now');
  const agreement=state.governance.agreements.find(a=>a.sceneId===p.id.split(':')[0]);
  const history=state.history.find(r=>r.missionId===agreement.sceneId);
  const project=state.finance.portfolio.find(x=>x.id===p.projectId);
  const evidence={sourceTurn:history.turn,actionId:history.actionId,plannedCost:history.funding.totalCost,
   actualCost:history.funding.actualTotalCost,delivery:history.delivery.id,projectStatus:project?.status||'one-off',
   activatedTurn:project?.activatedTurn??null,remainingYears:project?.yearsRemaining??0,
   reportedAtTurn:turn,populationYear:state.population.year};
  // It reports real game records even when delivery is disappointing.
  // One factual publication satisfies every still-current reporting clause
  // for this project; do not make the player publish the same facts twice.
  const current=state.governance.promises.filter(x=>x.projectId===p.projectId&&x.kind==='report'&&x.status==='pending'&&turn>x.createdTurn&&turn<=x.dueTurn);
  const results=current.map(x=>finishPromise(state,x,'kept',evidence));
  return results.find(x=>x.promiseId===promiseId);
 }
 function revisionQuote(state,promiseId){
  const p=state.governance.promises.find(x=>x.id===promiseId),turn=state.turnIndex+1;
  return{available:Boolean(p&&p.status==='pending'&&['launch','continuity'].includes(p.kind)&&!state.completed&&!state.awaitingContinue&&
    p.revisions.length===0&&turn>p.createdTurn&&turn<=p.dueTurn&&p.dueTurn-turn<=1&&state.governance.trust[p.actorId]>=-1),
   newDueTurn:(p?.dueTurn||0)+1,supportCost:.8};
 }
 function revise(state,promiseId){
  const q=revisionQuote(state,promiseId);if(!q.available)throw Error('Deadline cannot be renegotiated now');
  const p=state.governance.promises.find(x=>x.id===promiseId);
  p.revisions.push({turn:state.turnIndex+1,oldDueTurn:p.dueTurn,newDueTurn:q.newDueTurn});p.dueTurn=q.newDueTurn;
  return event(state,p,'revised',{originalDueTurn:p.originalDueTurn,newDueTurn:p.dueTurn},-.8);
 }
 function summary(state){
  const g=state.governance;
  return{agreements:g.agreements.length,agreed:g.agreements.filter(a=>a.status==='agreed').length,
   qualified:g.agreements.filter(a=>a.status==='qualified').length,open:g.agreements.filter(a=>a.status==='open').length,
   kept:g.promises.filter(p=>p.status==='kept'&&!p.revisions.length).length,
   revisedKept:g.promises.filter(p=>p.status==='kept'&&p.revisions.length).length,
   broken:g.promises.filter(p=>p.status==='broken').length,pending:g.promises.filter(p=>p.status==='pending').length,
   beyondHorizon:g.promises.filter(p=>p.status==='pending'&&p.dueTurn>20).length,
   lateDelivery:g.promises.filter(p=>p.recoveredAt!=null).length,
   returnedGrants:round(g.promises.reduce((s,p)=>s+(p.restitution?.amount||0),0)),trust:copy(g.trust)};
 }
 function verify(state){
  const g=state?.governance;
  try{
   if(!g||g.version!==VERSION||!Array.isArray(g.agreements)||!Array.isArray(g.promises)||!Array.isArray(g.events))return false;
   if(C.actors.some(a=>!Number.isFinite(g.trust[a.id])||Math.abs(g.trust[a.id])>3))return false;
   if(new Set(g.agreements.map(a=>a.sceneId)).size!==g.agreements.length||new Set(g.promises.map(p=>p.id)).size!==g.promises.length)return false;
   for(const a of g.agreements){if(!sceneFor(a.sceneId)||!state.history.some(r=>r.missionId===a.sceneId&&r.actionId===a.actionId))return false;checkTerms(a.termIds,a.mode);}
   for(const p of g.promises){
    if(!termFor(p.termId)||!['pending','kept','broken'].includes(p.status)||!Number.isInteger(p.dueTurn)||p.dueTurn<p.createdTurn)return false;
    if(!g.agreements.some(a=>a.promises.some(q=>q.id===p.id)))return false;
    if(!Array.isArray(p.observations)||new Set(p.observations.map(o=>o.turn)).size!==p.observations.length||!Array.isArray(p.revisions)||p.revisions.length>1)return false;
    if(p.projectId&&!state.finance.portfolio.some(x=>x.id===p.projectId))return false;
   }
   if(g.draft){
    checkTerms(g.draft.termIds,g.draft.mode);
    if(g.draft.key!==keyFor(g.draft.missionId,g.draft.actionId,g.draft.mode,g.draft.placementId)||!sceneFor(g.draft.missionId))return false;
   }
   return true;
  }catch(_){return false;}
 }
 const api={VERSION,CONFIG:C,create,sceneFor,termFor,keyFor,checkTerms,setDraft,preview,modifyAction,describePromises,register,settle,publishReport,revisionQuote,revise,summary,verify};
 root.GovernorGame=root.GovernorGame||{};root.GovernorGame.Governance=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
