/* Read-only derivation of readiness, citizen response and execution awards.
 * No hidden population or money is created here. Indices are game assumptions.
 */
(function(root){
 'use strict';
 const P=root.GovernorGame?.Population||(typeof require==='function'?require('./population.js'):null);
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const r=(v,n=2)=>Number(v.toFixed(n))||0;
 const clone=v=>JSON.parse(JSON.stringify(v));
 const ACCESS=['healthAccess','schoolAccess','childcareAccess','housingAccess','employment','digitalAccess'];
 const WEIGHTS=[.25,.2,.15,.15,.15,.1];
 function snapshot(state,observed){
  const derived=observed||P.derive(state);
  const municipal=Object.values(derived.municipalities);
  const score=m=>ACCESS.reduce((s,k,i)=>s+clamp(m[k]||0,0,1)*WEIGHTS[i],0);
  return {year:state.population.year,municipalities:Object.fromEntries(municipal.map(m=>[m.id,{population:m.population,score:r(score(m),6),...Object.fromEntries(ACCESS.map(k=>[k,r(m[k]||0,6)]))}])),
   mean:r(municipal.reduce((s,m)=>s+score(m)*m.population,0)/derived.population,6),
   floor:r(Math.min(...municipal.map(score)),6)};
 }
 function readiness(state,key,districtId){
  const d=P.derive(state),m=d.municipalities[districtId]||d.municipalities.capital;
  let level=0,components={};
  if(key==='health'){level=m.healthAccess*10;components={healthAccess:m.healthAccess};}
  else if(key==='jobs'){level=clamp((m.employment-.65)/.35,0,1)*10;components={employment:m.employment};}
  else if(key==='family'){level=(m.schoolAccess*.45+m.childcareAccess*.45+m.housingAccess*.1)*10;components={schoolAccess:m.schoolAccess,childcareAccess:m.childcareAccess,housingAccess:m.housingAccess};}
  else if(key==='flood'){level=(m.floodProtection*.85+m.mobility*.15)*10;components={floodProtection:m.floodProtection,mobility:m.mobility};}
  else if(key==='digital'){level=(m.digitalProtection*.7+m.digitalAccess*.3)*10;components={digitalProtection:m.digitalProtection,digitalAccess:m.digitalAccess};}
  return {key,districtId:m.id,value:r(clamp(level,0,10),1),components,source:'actual-service-supply'};
 }
 function refreshReadiness(state){
  const districts={health:'north',jobs:'industrial',flood:'river',digital:'capital',family:'suburb'};
  state.resilience=Object.fromEntries(Object.entries(districts).map(([key,id])=>[key,readiness(state,key,id).value]));
  return state.resilience;
 }
 function publicResponse(previous,current){
  // Changes use the same pre-transition residents as weights: migration cannot
  // make a service gain by merely moving the averaging denominator.
  const ids=Object.keys(previous.municipalities),pop=ids.reduce((s,id)=>s+previous.municipalities[id].population,0);
  const changes=ids.map(id=>({id,change:current.municipalities[id].score-previous.municipalities[id].score,weight:previous.municipalities[id].population/pop}));
  const weightedChange=changes.reduce((s,c)=>s+c.change*c.weight,0);
  const worstChange=Math.min(...changes.map(c=>c.change));
  const changeEffect=clamp(weightedChange*32+Math.min(0,worstChange)*10,-5,5);
  // Persistent service shortfalls have a modest, explicit effect; improving an
  // already prosperous territory is not the only route to citizen approval.
  const unmet=Math.max(0,.7-current.mean);
  const floorGap=Math.max(0,.55-current.floor);
  const levelEffect=-Math.min(.65,unmet*2+floorGap);
  return {effects:r(changeEffect+levelEffect),changeEffect:r(changeEffect),levelEffect:r(levelEffect),weightedChange:r(weightedChange,6),worstChange:r(worstChange,6),before:clone(previous),after:clone(current)};
 }
 function settleAwards(state){
  let total=0;
  for(const record of state.history||[]){
   if(record.deferred){record.execution={stars:0,pending:false,opened:false,paidYears:0,onTime:false,meaning:"no-new-project"};record.stars=0;continue;}
   const project=state.finance.portfolio.find(p=>p.id===record.project?.id);
   const opened=project?Number.isInteger(project.activatedTurn):true;
   const paidYears=project?(project.paidTurns||[]).length:0;
   const onTime=project ? (opened && project.activatedTurn<=project.createdTurn+project.plannedStartsIn) : true;
   const asPlanned=onTime && (record.delivery?.effectFactor??1)>=.99 && (record.delivery?.costVariation||0)===0;
   // Execution marks, NOT welfare, moral correctness or a student's grade.
   const stars=opened?1+(asPlanned?1:0)+(paidYears>=3?1:0):0;
   record.execution={stars,pending:!opened,opened,paidYears,onTime,asPlanned,meaning:'delivery-not-welfare'};
   record.stars=stars;total+=stars;
  }
  state.stars=total;return total;
 }
 const api={VERSION:'1.0.0',ACCESS,WEIGHTS,snapshot,readiness,refreshReadiness,publicResponse,settleAwards};
 root.GovernorGame=root.GovernorGame||{};root.GovernorGame.Outcomes=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
