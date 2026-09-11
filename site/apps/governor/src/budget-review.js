/* Financial decisions at actual cash shortfalls. Authored classroom rules, not law.
 * A draft transition either commits completely, or stays in a read-only review.
 * No unpaid service is recorded as paid, and no phantom cash bridges the review.
 */
(function(root){
 'use strict';
 const VERSION='1.0.0',MODEL_VERSION='0.16.0-budget-review';
 const LIMITS=Object.freeze({grantPerEvent:3,grantLifetime:6,loanPerEvent:3,repaymentYears:3,pauseYears:2});
 const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100||0;
 const copy=x=>JSON.parse(JSON.stringify(x));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const REASONS=['annual-obligations','cost-overrun','conditional-grant-return','crisis'];
 const contexts=new WeakMap();
 const active=s=>Boolean(s?.budgetReview);
 const pending=s=>Boolean(s?.budgetReview?.pending);
 const stopped=s=>s?.budgetReview?.status==='supervised';
 const locked=s=>(pending(s)||stopped(s))&&!contexts.has(s);
 const fresh=()=>({version:VERSION,status:'active',events:[],payments:[],pending:null});
 const grants=s=>round((s?.budgetReview?.events||[]).reduce((n,e)=>n+e.grant,0));
 const loans=s=>(s?.budgetReview?.events||[]).filter(e=>e.loan>0);
 const repaid=(s,id)=>round((s?.budgetReview?.payments||[]).filter(p=>!id||p.eventId===id).reduce((n,p)=>n+p.amount,0));
 const outstanding=(s,id)=>round(Math.max(0,loans(s).filter(e=>!id||e.id===id).reduce((n,e)=>n+e.loan,0)-repaid(s,id)));
 function schedule(e){
  const cents=Math.round(e.loan*100),unit=Math.floor(cents/3),extra=cents%3;
  return [1,2,3].map((i)=>({turn:e.turn+i,amount:(unit+(i<=extra?1:0))/100}));
 }
 function dueFor(s,e,turn=s.turnIndex+1){return round(Math.max(0,schedule(e).filter(p=>p.turn<=turn).reduce((n,p)=>n+p.amount,0)-repaid(s,e.id)));}
 function due(s,turn=s?.turnIndex+1){return round(loans(s).reduce((n,e)=>n+dueFor(s,e,turn),0));}
 function pauseUntil(s){return (s?.budgetReview?.events||[]).reduce((n,e)=>Math.max(n,e.pauseUntil||0),0);}
 function blockReason(s,action,mode){
  if(!active(s))return'';
  if(locked(s))return stopped(s)?'review-supervised':'review-pending';
  if(action?.deferred)return'';
  const emergency=action?.kind==='emergency'||action?.finance?.kind==='emergency';
  if(!emergency&&due(s)>0)return'review-arrears';
  if(!emergency&&pauseUntil(s)>=s.turnIndex+1)return'review-pause';
  if(mode==='debt'&&outstanding(s)>0)return'review-credit';
  return'';
 }
 function options(s,reason,amount){
  const f=s.finance,gap=round(amount),reserve=round(f.reserve),headroom=round(Math.max(0,f.debtLimit-f.debt));
  const loan=round(Math.min(gap,LIMITS.loanPerEvent,headroom));
  const grant=round(Math.min(gap,LIMITS.grantPerEvent,Math.max(0,LIMITS.grantLifetime-grants(s))));
  const ownReserve=gap,loanReserve=round(gap-loan),grantReserve=round(gap-grant);
  const eligible=['annual-obligations','crisis'].includes(reason);
  const make=(id,reserveUse,borrow,support,why)=>({id,available:!why,reasonCode:why||'',reserveUse,borrow,grant:support,
    debtAfter:round(f.debt+borrow),reserveAfter:round(f.reserve-reserveUse),treasuryAfter:0,
    pauseUntil:support?s.turnIndex+LIMITS.pauseYears:null,
    schedule:borrow?schedule({turn:s.turnIndex+1,loan:borrow}):[],
    plannedInterest:borrow?round(schedule({turn:s.turnIndex+1,loan:borrow}).reduce((a,p,i,arr)=>a+(borrow-arr.slice(0,i).reduce((n,x)=>n+x.amount,0))*f.debtRate,0)):0});
  return [make('reserve',ownReserve,0,0,ownReserve>reserve?'reserve-insufficient':''),
   make('loan',loanReserve,loan,0,s.rules.noNewDebt?'new-debt-forbidden':outstanding(s)>0?'loan-already-open':loan<=0?'debt-limit':loanReserve>reserve?'loan-limit':''),
   make('grant',grantReserve,0,grant,!eligible?'grant-purpose':grant<=0?'grant-exhausted':grantReserve>reserve?'grant-limit':'')];
 }
 function makeEvent(s,reason,meta){
  if(!REASONS.includes(reason))throw new Error('Unknown shortfall cause');
  const f=s.finance,l=f.currentLedger,amount=round(-f.treasury);
  const missionId=meta?.missionId||meta?.promiseId?.split(':')[0]||null;
  const actionId=meta?.actionId||(missionId?s.history.find(h=>h.missionId===missionId)?.actionId:null)||null;
  return {id:`${l.turn}:${s.budgetReview.events.length+1}:${reason}`,turn:l.turn,year:s.population.baseYear+l.turn-1,reason,amount,
   missionId,actionId,charged:round(meta?.amount||meta?.totalCost||0),
   openingTreasury:l.openingTreasury,regularReceipts:round(l.inflows.ownTaxes+l.inflows.nonTax+l.inflows.equalization),
   mandatory:l.outflows.mandatory,interest:l.outflows.debtService,programmeOpex:l.outflows.programmeOpex,
   reserve:f.reserve,debt:f.debt,debtLimit:f.debtLimit,grantUsed:grants(s),options:options(s,reason,amount)};
 }
 class Shortfall extends Error{constructor(event){super('review-needed');this.name='BudgetShortfall';this.event=event;}}
 function run(s,approvals,fn){
  if(contexts.has(s))throw new Error('Nested financial transaction');
  const context={approvals,index:0};contexts.set(s,context);
  try{const result=fn();if(context.index!==approvals.length)throw new Error('Unused financial authorisation');return result;}
  finally{contexts.delete(s);}
 }
 function fundShortfall(s,reason,meta){
  const c=contexts.get(s);if(!c)throw new Error('Financial transition requires Engine transaction');
  const e=makeEvent(s,reason,meta),a=c.approvals[c.index];
  if(!a)throw new Shortfall(e);
  if(!equal(a.event,e))throw new Error('Financial authorisation is stale');
  const q=e.options.find(q=>q.id===a.choice);if(!q?.available)throw new Error('Financial option unavailable');
  c.index++;
  const f=s.finance,l=f.currentLedger;
  f.reserve=round(f.reserve-q.reserveUse);f.debt=round(f.debt+q.borrow);
  f.totalReserveDraw=round(f.totalReserveDraw+q.reserveUse);f.totalBorrowed=round(f.totalBorrowed+q.borrow);
  f.totalEmergencyTransfers=round(f.totalEmergencyTransfers+q.grant);
  l.inflows.reserveDraw=round(l.inflows.reserveDraw+q.reserveUse);l.inflows.borrowing=round(l.inflows.borrowing+q.borrow);
  l.inflows.emergencyTransfer=round(l.inflows.emergencyTransfer+q.grant);
  const receipt={id:e.id,turn:e.turn,reason,amount:e.amount,missionId:e.missionId,actionId:e.actionId,choice:q.id,reserve:q.reserveUse,loan:q.borrow,grant:q.grant,pauseUntil:q.pauseUntil};
  s.budgetReview.events.push(receipt);
  l.decisions.push({operation:'budget-review-funding',...copy(receipt)});
  f.notices.push({type:'financial-decision',turn:e.turn,reason,amount:e.amount,choice:q.id});
  return{reserveUsed:q.reserveUse,debtIssued:q.borrow,transfer:q.grant};
 }
 function credit(s,amount,source){
  if(!active(s))return[];
  let remaining=round(amount);const entries=[];
  for(const e of loans(s)){
   const limit=source==='scheduled'?dueFor(s,e):outstanding(s,e.id);
   const n=round(Math.min(remaining,limit));if(n<=0)continue;
   const p={eventId:e.id,turn:s.turnIndex+1,amount:n,source};s.budgetReview.payments.push(p);entries.push(copy(p));remaining=round(remaining-n);
  }
  return entries;
 }
 function scheduledPayment(s){return active(s)?round(Math.max(0,Math.min(due(s),s.finance.treasury,s.finance.debt))):0;}
 function report(s){
  if(!active(s))return null;
  return{version:VERSION,mode:'decisions',status:s.budgetReview.status,limits:copy(LIMITS),events:copy(s.budgetReview.events),payments:copy(s.budgetReview.payments),
   grantsReceived:grants(s),grantRemaining:round(LIMITS.grantLifetime-grants(s)),loanIssued:round(loans(s).reduce((n,e)=>n+e.loan,0)),
   principalRepaid:repaid(s),principalOutstanding:outstanding(s),overdue:due(s),pauseUntilYear:pauseUntil(s)?s.population.baseYear+pauseUntil(s)-1:null,
   pending:s.budgetReview.pending?copy(s.budgetReview.pending.event):null,annualDecisionsCompleted:s.history.length,
   completedFullTerm:s.completed,meaning:'Authored financial choice rules. A suspended draft is not an executed budget year. No grade of the student is inferred.'};
 }
 function verify(s){
  const r=s?.budgetReview,acc=[...(s?.finance?.ledgers||[]),...(s?.finance?.currentLedger?[s.finance.currentLedger]:[])],errors=[];
  const receipts=acc.flatMap(l=>(l.decisions||[]).filter(o=>o.operation==='budget-review-funding').map(o=>({l,o})));
  if(!r)return receipts.length?['missing-budget-review']:[];
  const amount=n=>Number.isFinite(n)&&n>=0&&round(n)===n;
  const keys=(o,ks)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===ks.split('|').sort().join('|');
  try{
   if(!keys(r,'version|status|events|payments|pending')||r.version!==VERSION||!['active','supervised'].includes(r.status)||!Array.isArray(r.events)||r.events.length>100||!Array.isArray(r.payments)||r.payments.length>300)return['budget-review-schema'];
   if(s.recovery)errors.push('incompatible-financial-modes');
   if(stopped(s)&&(!r.pending||s.completed))errors.push('supervision-state');
   if(r.events.length!==receipts.length)errors.push('funding-log-length');
   const ids=new Set();let support=0,prev=0;
   for(const [i,e] of r.events.entries()){
    if(!keys(e,'id|turn|reason|amount|missionId|actionId|choice|reserve|loan|grant|pauseUntil')){errors.push('funding-schema');continue;}
    if(ids.has(e.id)||e.id!==`${e.turn}:${i+1}:${e.reason}`)errors.push('funding-id');ids.add(e.id);
    if(!Number.isInteger(e.turn)||e.turn<1||e.turn>s.turnIndex+1||e.turn<prev||!REASONS.includes(e.reason))errors.push('funding-time');prev=e.turn;
    if(![e.amount,e.reserve,e.loan,e.grant].every(amount)||e.amount<=0||round(e.reserve+e.loan+e.grant)!==e.amount)errors.push('funding-identity');
    if(!['reserve','loan','grant'].includes(e.choice)||e.choice==='reserve'&&(e.loan||e.grant)||e.choice==='loan'&&(!e.loan||e.grant)||e.choice==='grant'&&(!e.grant||e.loan))errors.push('funding-choice');
    if(e.loan>LIMITS.loanPerEvent||e.loan&&s.rules.noNewDebt||e.grant>LIMITS.grantPerEvent||e.grant&&!['annual-obligations','crisis'].includes(e.reason))errors.push('funding-limits');
    if(e.pauseUntil!==(e.grant?e.turn+LIMITS.pauseYears-1:null))errors.push('grant-pause');
    support=round(support+e.grant);if(support>LIMITS.grantLifetime)errors.push('grant-cap');
    if(!receipts[i]||receipts[i].l.turn!==e.turn||!equal(receipts[i].o,{operation:'budget-review-funding',...e}))errors.push('funding-receipt');
    if(e.missionId!==null&&typeof e.missionId!=='string'||e.actionId!==null&&typeof e.actionId!=='string')errors.push('funding-reference');
   }
   let lastPayment=0;
   for(const p of r.payments){
    const e=r.events.find(e=>e.id===p.eventId&&e.loan>0);
    if(!keys(p,'eventId|turn|amount|source')||!e||!Number.isInteger(p.turn)||p.turn<e.turn||p.turn>s.turnIndex+1||p.turn<lastPayment||!amount(p.amount)||p.amount<=0||!['scheduled','voluntary'].includes(p.source)||p.source==='scheduled'&&p.turn<=e.turn)errors.push('payment-schema');
    lastPayment=p.turn;
   }
   for(const e of loans(s)){
    if(repaid(s,e.id)>e.loan)errors.push('overpayment');
    if(loans(s).some(other=>other.turn>e.turn&&round(e.loan-r.payments.filter(p=>p.eventId===e.id&&p.turn<=other.turn).reduce((n,p)=>n+p.amount,0))>0))errors.push('loan-rollover');
   }
   if(outstanding(s)>s.finance.debt+1e-7)errors.push('principal-exceeds-debt');
   if(s.finance.totalEmergencyTransfers!==support)errors.push('support-total');
   for(const h of s.history){
    const a=root.GovernorGame?.DATA?.missions.find(m=>m.id===h.missionId)?.actions.find(a=>a.id===h.actionId);
    if(h.deferred||a?.finance?.kind==='emergency')continue;
    if(r.events.some(e=>e.grant>0&&e.turn<=h.turn&&e.pauseUntil>=h.turn))errors.push('grant-condition-breach');
    if(loans(s).some(e=>{const target=schedule(e).filter(p=>p.turn<=h.turn).reduce((n,p)=>n+p.amount,0),paid=r.payments.filter(p=>p.eventId===e.id&&p.turn<=h.turn).reduce((n,p)=>n+p.amount,0);return round(target-paid)>0;}))errors.push('arrears-breach');
   }
   const credited=acc.flatMap(l=>(l.decisions||[]).flatMap(o=>o.reviewCredits||[]));
   if(!equal(credited,r.payments))errors.push('payment-receipts');
   for(const l of acc){
    const es=receipts.filter(x=>x.l===l).map(x=>x.o),ps=(l.decisions||[]).flatMap(o=>o.reviewCredits||[]);
    for(const [key,field] of [['reserveDraw','reserve'],['borrowing','loan'],['emergencyTransfer','grant']])if(round(es.reduce((n,e)=>n+e[field],0))>l.inflows[key]+1e-7)errors.push('funding-flow');
    if(round(es.reduce((n,e)=>n+e.grant,0))!==l.inflows.emergencyTransfer)errors.push('unexplained-transfer');
    if(round(ps.reduce((n,p)=>n+p.amount,0))>l.outflows.debtRepayment+1e-7||ps.some(p=>p.turn!==l.turn))errors.push('repayment-flow');
   }
   if(r.pending){
    const p=r.pending;
    if(!keys(p,'operation|args|approvals|event')||!['commit','advance'].includes(p.operation)||!Array.isArray(p.args)||p.args.length!== (p.operation==='advance'?0:4)||!Array.isArray(p.approvals)||p.approvals.length>8||!REASONS.includes(p.event?.reason))errors.push('pending-schema');
    else if(p.approvals.some(a=>!keys(a,'event|choice')||!['reserve','loan','grant'].includes(a.choice)))errors.push('authorisation-schema');
    if(s.completed)errors.push('pending-completed');
   }
  }catch(_){errors.push('budget-review-malformed');}
  return errors;
 }
 const API={VERSION,MODEL_VERSION,LIMITS,REASONS,fresh,active,pending,stopped,locked,grants,loans,repaid,outstanding,due,dueFor,pauseUntil,blockReason,options,Shortfall,run,fundShortfall,credit,scheduledPayment,schedule,report,verify};
 root.GovernorGame=root.GovernorGame||{};root.GovernorGame.BudgetReview=API;
 if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
