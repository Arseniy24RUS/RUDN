/* Defensive schema and cross-reference checks. Not anti-cheat authentication.
 * Imported saves are local untrusted JSON; executable values are never accepted.
 */
(function(root){
 'use strict';
 const Agenda=root.GovernorGame?.Agenda||(typeof require==='function'?require('./agenda.js'):null);
 const finite=(v,min=0,max=1e9)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 const integer=(v,min=0,max=1000000)=>finite(v,min,max)&&Number.isInteger(v);
 function safeTree(value,depth=0,budget={nodes:0}){
  if(depth>80||++budget.nodes>1500000)throw new Error('Save too complex');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Non-finite value');return;}
  if(typeof value==='string'){if(value.length>250000)throw new Error('Oversized string');return;}
  if(typeof value!=='object')throw new Error('Not JSON data');
  if(Array.isArray(value)){if(value.length>30000)throw new Error('Oversized array');for(const v of value)safeTree(v,depth+1,budget);return;}
  for(const [k,v]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(k))throw new Error('Unsafe key');safeTree(v,depth+1,budget);}
 }
 function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
 function check(s,D,P,F){
  const errors=[];
  try{
   safeTree(s);
   if(!s||typeof s!=='object'||!s.finance||!s.population)return{ok:false,errors:['state-shape']};
   const f=s.finance;
   const scenario=D.scenarios.find(d=>d.id===s.scenarioId);if(!scenario)return{ok:false,errors:['scenario']};
   if(typeof s.completed!=='boolean'||typeof s.awaitingContinue!=='boolean')errors.push('phase');
   if(typeof s.seed!=='string'||s.seed.length>256||!s.seed.trim())errors.push('seed');
   if(!s.profile||typeof s.profile.name!=='string'||s.profile.name.length>200||typeof s.profile.group!=='string'||s.profile.group.length>200)errors.push('profile');
   if(!['mission','map','treasury','advisors','journal','quests','badges','stories','residents','settings','agenda'].includes(s.activeView))errors.push('view');
   for(const k of ['budget','support','development'])if(!finite(s.stats?.[k],0,k==='budget'?1e7:100))errors.push('stats:'+k);
   if(!integer(s.xp)||!integer(s.stars))errors.push('rewards');
   for(const k of ['treasury','reserve','debt','initialDebt','debtLimit','adminCapacity'])if(!finite(f[k]))errors.push('finance:'+k);
   if(!finite(f.debtRate,0,1)||f.debtRate!==scenario.finance.debtRate||f.debtLimit!==scenario.finance.debtLimit||f.initialDebt!==scenario.finance.debt)errors.push('finance-contract');
   const base={ownTaxRevenue:scenario.finance.ownTaxRevenue,nonTaxRevenue:scenario.finance.nonTaxRevenue,equalizationGrant:scenario.finance.equalizationGrant,mandatoryCosts:scenario.finance.mandatoryCosts};
   if(!equal(f.base,base))errors.push('finance-base');
   if(Math.abs(s.stats.budget-F.round1(f.treasury))>1e-7)errors.push('cash-display');
   if(!Array.isArray(s.history)||s.history.length>20||!Array.isArray(f.portfolio)||f.portfolio.length>20)return{ok:false,errors:['array-shape']};
   if(!s.resilience||Object.keys(s.resilience).sort().join(',')!=='digital,family,flood,health,jobs'||Object.values(s.resilience).some(v=>!finite(v,0,10)))errors.push('readiness');
   if(!s.serviceAnchor||Object.keys(s.serviceAnchor.municipalities||{}).sort().join(',')!==P.MUNICIPALITIES.map(c=>c.id).sort().join(','))errors.push('service-anchor');
   for(const m of Object.values(s.serviceAnchor?.municipalities||{}))if(!finite(m.score,0,1)||!integer(m.population,0,100000000))errors.push('service-anchor-value');
   if(!s.advisorTrust||D.advisors.some(a=>!finite(s.advisorTrust[a.id],0,100)))errors.push('advisors');
   const ids=new Set();
   for(const p of f.portfolio){
    if(!p||typeof p.id!=='string'||ids.has(p.id)){errors.push('project-id');continue;}ids.add(p.id);
    const m=Agenda.byId(p.missionId),a=m?.actions.find(a=>a.id===p.actionId);
    if(!m||!a){errors.push('project-content');continue;}
    const record=s.history.find(r=>r.project?.id===p.id);
    if(!record||record.actionId!==p.actionId)errors.push('project-history');
    if(record?.project){
      for(const k of ['kind','districtId','placement','fundingMode','totalCost','actualTotalCost','treasuryCost','federalTransfer','reserveUse','debtIssue','annualOpex','adminLoad','adminMaintenance','activationEffects','activationResilience','annualEffects','implementationFactor','deliveryOutcome','createdTurn','plannedStartsIn','costVariation'])
        if(!equal(p[k],record.project[k]))errors.push('project-contract:'+k);
    }
    if(!['capital','programme','emergency','operating'].includes(p.kind))errors.push('project-kind');
    if(!['delivery','active','completed'].includes(p.status))errors.push('project-status');
    for(const k of ['annualOpex','adminLoad','adminMaintenance','totalCost','actualTotalCost','treasuryCost','federalTransfer','reserveUse','debtIssue'])if(!finite(p[k]))errors.push('project:'+k);
    if(!finite(p.implementationFactor,0,2)||!integer(p.startsIn,0,100)||!integer(p.yearsRemaining,0,100)||!integer(p.createdTurn,1,20))errors.push('project-timing');
    if(p.status==='active'&&(!integer(p.activatedTurn,1,20)||p.startsIn!==0||p.yearsRemaining<=0))errors.push('active-project');
    if(p.status==='completed'&&(!integer(p.completedTurn,1,21)||p.yearsRemaining!==0))errors.push('completed-project');
    if(p.status==='delivery'&&p.startsIn<1)errors.push('delivery-project');
    if(!p.people||p.people.actionId!==a.id||!equal(p.people.outputs,P.outputsFor(a.id))||!equal(p.people.targets,P.targets(m,p.placement))||!finite(p.people.factor,0,2))errors.push('project-supply');
    const paid=p.paidTurns||[];if(!Array.isArray(paid)||paid.some(t=>!integer(t,p.activatedTurn||1,s.turnIndex+1))||new Set(paid).size!==paid.length)errors.push('paid-years');
    for(const effect of [p.activationEffects,p.activationResilience,p.annualEffects])if(!effect||Object.values(effect).some(v=>!finite(v,-1000,1000)))errors.push('project-effects');
   }
   for(const [i,r]of s.history.entries()){
    const m=Agenda.mode(s)==='agenda'&&i<5?Agenda.byId(r.missionId):D.missions[i];if(!m||r.missionId!==m.id||!m.actions.some(a=>a.id===r.actionId)||!['treasury','cofinance','debt','reserve'].includes(r.fundingMode))errors.push('decision-reference');
   }
   // Validate display caches against their authoritative year snapshot or live supply.
   // A newly entered crisis is applied by advanceYear, not retroactively to last year's display.
   const expectedDerived=(s.awaitingContinue||s.completed)?s.population.lastYear?.after:P.derive({...s,population:{...s.population,shock:null}});
   if(!equal(s.population.derived,expectedDerived))errors.push('population-display');
   if(f.currentLedger&&!F.verifyLedger(f.currentLedger).ok)errors.push('current-ledger');
  }catch(e){errors.push(e.message||'malformed');}
  return{ok:errors.length===0,errors};
 }
 const api={safeTree,check};root.GovernorGame=root.GovernorGame||{};root.GovernorGame.Integrity=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
