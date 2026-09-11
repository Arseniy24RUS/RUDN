/* Final, independently cloned release configuration. Historical data layers remain
 * input assets; runtime modules share this single catalogue, never edit it.
 */
(function(root){
 'use strict';
 const base=root.GovernorGame?.DATA?.stage4Ready?root.GovernorGame.DATA:require('./stage4-data.js');
 const clone=v=>Array.isArray(v)?v.map(clone):(v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])):v);
 const D=clone(base),L=(ru,en)=>({ru,en});D.L=L;
 // Rebase the synthetic teaching budgets after removing reward-to-revenue feedback.
 // Amounts are classroom parameters, NOT observed regional budgets. Initial
 // operating headroom is explicit; ageing and employment then move it endogenously.
 const fiscalSetup={balanced:[4.8,.008,.008],demographic:[4.2,.006,.008],infrastructure:[4,.007,.009],digital:[5,.01,.008]};
 for(const scenario of D.scenarios){
  const [headroom,revenueGrowth,mandatoryGrowth]=fiscalSetup[scenario.id],f=scenario.finance;
  f.mandatoryCosts=Math.round((f.ownTaxRevenue+f.nonTaxRevenue+f.equalizationGrant-f.debt*f.debtRate-headroom)*100)/100;
  scenario.rules.revenueGrowth=revenueGrowth;scenario.rules.mandatoryGrowth=mandatoryGrowth;
  scenario.fiscalCalibration={initialOperatingHeadroom:headroom,priceBasis:'synthetic constant game rubles',source:'author classroom balancing, not empirical'};
 }

 for(const m of D.missions){
  m.actions.push({id:'defer-'+m.id,deferred:true,icon:'clock',title:L(m.crisis?'Работать силами действующих служб':'Не запускать новую меру в этом году',m.crisis?'Use existing services':'Start no new measure this year'),
   description:L('Сохранить свободные деньги. Новая услуга не появится, проблема останется; действующие программы и их расходы продолжаются.','Keep available funds. No new service is added and the problem remains; existing programmes and their costs continue.'),
   future:L('Можно сохранить деньги для содержания и резервов. Пропущенная мера в этой линейной кампании не переносится на другую миссию.','Funds remain available for operations and reserves. In this linear campaign the missed measure is not rescheduled.'),
   outcome:L('Новая мера не запущена. Жители продолжают пользоваться действующими услугами.','No new measure was launched. Residents continue to rely on existing services.'),
   cost:0,effects:{support:-6,development:-3},resilience:{},tags:['caution','deferred'],xp:100,stars:0,deliveryRisk:0,mapObject:null,
   finance:{kind:'operating',annualOpex:0,lag:0,duration:0,adminLoad:0,adminMaintenance:0,federalMatch:0,debtEligible:false,reserveEligible:false,annualEffects:{}}});
  // Readiness is now actual service availability, not historical reward points.
  if(m.crisis?.key==='health')m.crisis.threshold=8;
 }

 // Awards must not fire at the starting position merely because readiness has
 // changed from accumulated points to a 0–10 current-service index.
 const crisisRecords=s=>(s.history||[]).filter(r=>r.entry);
 const preparedCount=s=>crisisRecords(s).filter(r=>r.entry.classification==='prepared').length;
 Object.assign(D.quests.find(q=>q.id==='preparedness'),{
  description:L('Пройти хотя бы два кризиса с достаточной действующей готовностью.','Face at least two crises with sufficient operational readiness.'),
  evaluate:s=>Math.min(1,preparedCount(s)/2),complete:s=>preparedCount(s)>=2});
 Object.assign(D.badges.find(b=>b.id==='prepared-governor'),{
  description:L('Встретить кризис с достаточной действующей готовностью.','Face a crisis with sufficient operational readiness.'),test:s=>preparedCount(s)>=1});
 Object.assign(D.quests.find(q=>q.id==='fiscal-cushion'),{
  description:L('Завершить срок с резервом не ниже 3 млрд ₽.','Finish with at least 3 bn RUB in reserves.'),
  evaluate:s=>Math.min(1,s.finance.reserve/3),complete:s=>s.completed&&s.finance.reserve>=3});
 Object.assign(D.badges.find(b=>b.id==='fiscal-guardian'),{
  description:L('Завершить срок с казной от 8 млрд ₽ без экстренной учебной помощи.','Finish with cash of at least 8 bn RUB and no emergency classroom support.'),test:s=>s.completed&&s.stats.budget>=8&&s.finance.totalEmergencyTransfers===0});
 Object.assign(D.badges.find(b=>b.id==='perfect-delivery'),{
  description:L('Ввести не менее четырёх проектов; не более одного открытия позднее плана.','Open at least four projects, with no more than one opening behind schedule.'),
  test:s=>{const opened=(s.history||[]).filter(r=>r.execution?.opened&&!r.deferred);return s.completed&&opened.length>=4&&opened.filter(r=>!r.execution.onTime).length<=1;}});
 D.ui.ru.districtPrepared='Линия пройдена';D.ui.en.districtPrepared='Story completed';
 D.ui.ru.missionContext='Цель, советники и условия';D.ui.en.missionContext='Objective, council and terms';
 D.ui.ru.reward='Прогресс освоения';D.ui.en.reward='Learning progress';
 D.ui.ru.demoBadge='Этап 9 · Своя повестка';D.ui.en.demoBadge='Stage 9 · Your agenda';
 D.consolidationReady=true;
 root.GovernorGame=root.GovernorGame||{};root.GovernorGame.DATA=D;
 if(typeof module!=='undefined')module.exports=D;
})(typeof window!=='undefined'?window:globalThis);
