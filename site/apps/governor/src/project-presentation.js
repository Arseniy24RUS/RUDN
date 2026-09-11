/* Read-only lifecycle projection. Dates come from records, never the illustration.
 * 'Schedule elapsed' is not a construction-completion percentage; we show years only.
 */
(function(root){
'use strict';const G=root.GovernorGame;
function project(state,id){
 const p=state?.finance?.portfolio?.find(x=>x.id===id);if(!p)return null;
 const origin=(state.history||[]).find(r=>r.project?.id===id);
 const base=state.population.baseYear,turn=state.turnIndex+1;
 const actualYear=p.activatedTurn?base+p.activatedTurn-1:null;
 const decisionYear=base+p.createdTurn-1;
 const scheduledYear=p.status==='delivery'?base+turn-1+p.startsIn:actualYear;
 const originalYear=decisionYear+(p.plannedStartsIn||0);
 const structural=G.IllustratedAssets.structural(p);
 const paid=p.paidTurns||[];
 return{
  id:p.id,title:p.title,form:G.IllustratedAssets.spec(p).form,initialStatus:(origin?.project||p).status,districtId:G.WorldModel.projectDistrict(p),status:p.status,
  createdYear:decisionYear,originalYear,launchYear:actualYear,currentPlanYear:scheduledYear,
  completionYear:p.completedTurn?base+p.completedTurn-1:null,
  yearsToLaunch:p.status==='delivery'?p.startsIn:0,yearsFunded:p.status==='active'?p.yearsRemaining:0,
  paidYears:new Set(paid).size,cost:p.actualTotalCost??p.totalCost,plannedCost:p.totalCost,
  opex:p.annualOpex,funding:p.fundingMode,outcome:p.deliveryOutcome,structural,
  physicalRemaining:G.ProjectState.hasPhysicalAssets(p),outputs:G.ProjectState.outputs(p,turn),
  current:G.IllustratedAssets.image(p),initial:G.IllustratedAssets.image(origin?.project||p),
  preview:G.IllustratedAssets.image(p,{phase:'planned'}),
  stages:[{id:'decision',state:'done',year:decisionYear},
   {id:'delivery',state:p.status==='delivery'?'current':'done',years:p.startsIn},
   {id:'opening',state:actualYear?'done':'future',year:actualYear||scheduledYear,planned:!actualYear},
   {id:'operation',state:p.status==='active'?'current':p.status==='completed'?'ended':'future',years:p.yearsRemaining}],
  // New views never expose unreleased future outcomes beyond the existing model.
  badges:[...(p.deliveryOutcome==='delayed'?['delayed']:[]),...(p.deliveryOutcome==='partial'?['partial']:[]),...(p.costVariation>0?['overrun']:[])]
 };
}
function list(state,filter='all',district=null){
 return (state.finance?.portfolio||[]).filter(p=>(filter==='all'||p.status===filter)&&(!district||G.WorldModel.projectDistrict(p)===district)).map(p=>project(state,p.id)).reverse();
}
function changes(state){
 const ids=new Map();
 for(const e of state.finance?.lastLifecycleEvents||[]){if(!['activated','completed'].includes(e.type))continue;const id=e.projectId||e.id;if(id)ids.set(id,{id,type:e.type});}
 const r=(state.history||[]).at(-1);if(state.awaitingContinue&&r?.project)ids.set(r.project.id,{id:r.project.id,type:'approved'});
 return [...ids.values()].map(e=>({...e,project:project(state,e.id)})).filter(e=>e.project);
}
G.ProjectPresentation={VERSION:'1.0.0',project,list,changes};
if(typeof module!=='undefined')module.exports=G.ProjectPresentation;
})(typeof window!=='undefined'?window:globalThis);
