/* Read-only delivery agenda. Use the current budget year, not population.year,
 * which has already advanced while the result of a decision is open.
 * Future cells extrapolate existing contracts; no random draws or new projects. */
(function(root){
'use strict';
const G=root.GovernorGame=root.GovernorGame||{};
const labels={digital:['Цифровой доступ','Digital access'],schoolStaff:['Кадровое обеспечение школы','School staffing'],schoolReach:['Доступ к местам в других школах','Access to places in other schools'],emergencyMortality:['Влияние на смертность при ЧС','Effect on emergency mortality'],health:['Медицинские мощности','Medical capacity'],healthStaff:['Кадровое обеспечение','Medical staffing'],school:['Школьные мощности','School capacity'],childcare:['Уход за детьми','Childcare provision'],housing:['Жилищный фонд','Housing capacity'],jobs:['Рабочие места','Job capacity'],mobility:['Транспортная доступность','Mobility contribution'],floodProtection:['Противопаводковая защита','Flood protection'],digitalProtection:['Цифровая устойчивость','Digital resilience'],digitalAccess:['Цифровой доступ','Digital access'],flexWork:['Гибкая занятость','Flexible work'],elderCare:['Уход за старшими','Older-person care'],familySupport:['Поддержка семьи','Family support']};
const localLabel=k=>({ru:labels[k]?.[0]||k,en:labels[k]?.[1]||k});
function budgetTurn(s){return Math.max(1,(s?.turnIndex||0)+1);}
function timeline(s,p,horizon=3){
 const result=[],turn=budgetTurn(s),base=s.population.baseYear,x={...p};
 const count=s.completed?1:Math.max(1,Math.min(5,Math.floor(horizon)||3));
 for(let step=0;step<count;step++){
  if(step){
   if(x.status==='active'){x.yearsRemaining=Math.max(0,x.yearsRemaining-1);if(!x.yearsRemaining)x.status='completed';}
   else if(x.status==='delivery'){x.startsIn=Math.max(0,x.startsIn-1);if(!x.startsIn)x.status='active';}
  }
  result.push({year:base+turn-1+step,status:x.status,projected:step>0,paid:step===0&&(p.paidTurns||[]).includes(turn),opex:x.status==='active'?Number(x.annualOpex||0):0,beyondTerm:turn+step>20});
 }
 return result;
}
function expiry(s,p){
 const at=budgetTurn(s)+(p.status==='active'?p.yearsRemaining:0);
 const stopped={...p,status:'completed',completedTurn:p.completedTurn||at},running={...p,status:'active'};
 const retained=[],lost=[],reduced=[];
 for(const[key,value]of Object.entries(p.people?.outputs||{})){
  if(!value)continue;
  const before=G.ProjectState.remainingFactor(running,key,at),after=G.ProjectState.remainingFactor(stopped,key,at),item={key,label:localLabel(key)};
  if(after<=0)lost.push(item);else if(after<before-1e-6)reduced.push(item);else retained.push(item);
 }
 return{retained,lost,reduced,physical:G.ProjectState.hasPhysicalAssets(p)};
}
function item(s,p){
 const turn=budgetTurn(s),year=s.population.baseYear+turn-1;
 const eligible=p.status==='active'&&p.yearsRemaining===1&&p.kind!=='emergency'&&p.annualOpex>0;
 const quote=eligible&&!s.completed&&!s.awaitingContinue?G.Engine.renewalQuote(s,p.id):null;
 const lastFundedYear=p.status==='active'?year+p.yearsRemaining-1:null;
 const launchYear=p.status==='delivery'?year+p.startsIn:p.activatedTurn?s.population.baseYear+p.activatedTurn-1:null;
 const justOpened=p.activatedTurn===turn,justEnded=p.completedTurn===turn;
 let reason='operating';
 if(s.completed)reason='archive';else if(p.status==='active'&&p.yearsRemaining===1)reason='ending';else if(p.status==='delivery'&&p.startsIn===1)reason='opening-next';else if(justOpened)reason='opened';else if(justEnded)reason='ended';else if(p.status==='delivery')reason='delivery';else if(p.status==='completed')reason='archive';
 const priority={ending:0,'opening-next':1,opened:2,ended:3,delivery:4,operating:5,archive:6};
 return{id:p.id,title:p.title,actionId:p.actionId,districtId:G.WorldModel.projectDistrict(p),status:p.status,reason,priority:priority[reason],quote,renewable:eligible,year,lastFundedYear,launchYear,opex:p.annualOpex,timeline:timeline(s,p),consequence:expiry(s,p),paidYears:new Set(p.paidTurns||[]).size,renewals:(p.renewals||[]).map(r=>({...r,year:s.population.baseYear+r.turn-1})),completionYear:p.completedTurn?s.population.baseYear+p.completedTurn-1:null};
}
function snapshot(s){
 if(!s?.finance)return{year:null,items:[],attention:[],events:[],pendingRenewals:0};
 const items=s.finance.portfolio.map(p=>item(s,p)).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)),attention=items.filter(p=>p.priority<4);
 return{year:s.population.baseYear+budgetTurn(s)-1,completed:s.completed,planning:!s.awaitingContinue&&!s.completed,items,attention,pendingRenewals:items.filter(p=>p.reason==='ending'&&p.renewable).length,events:items.filter(p=>['opened','ended'].includes(p.reason))};
}
G.DeliveryDesk={VERSION:'1.0.0',snapshot,item,timeline,expiry};
if(typeof module!=='undefined')module.exports=G.DeliveryDesk;
})(typeof window!=='undefined'?window:globalThis);
