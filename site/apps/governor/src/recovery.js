/* Optional, bounded classroom case. All amounts are authored game parameters,
 * not statutory Russian budget instruments. Same Finance ledger, no shadow money.
 * Pure views live here; Finance performs the actual cash movements. */
(function(root){
  'use strict';
  const VERSION='1.0.0', CASE='inherited-bill', BILL=11.3, SUPPORT=3, PAUSE_UNTIL=2;
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const KEYS=['version','caseId','bill','choice','settledTurn','grantReturnTurn','payments'];
  const choices=['reserves','grant','loan'];
  function fresh(){return{version:VERSION,caseId:CASE,bill:BILL,choice:null,settledTurn:null,grantReturnTurn:null,payments:[]};}
  function active(s){return Boolean(s?.recovery);}
  function pending(s){return active(s)&&s.recovery.choice===null;}
  function repaid(s){return round((s?.recovery?.payments||[]).reduce((sum,p)=>sum+p.amount,0));}
  function outstanding(s){return s?.recovery?.choice==='loan'?round(Math.max(0,SUPPORT-repaid(s))):0;}
  function due(s,turn=s?.turnIndex+1){return s?.recovery?.choice==='loan'?round(Math.max(0,Math.min(SUPPORT,Math.max(0,turn-1))-repaid(s))):0;}
  function pause(s){return s?.recovery?.choice==='grant'&&!s.recovery.grantReturnTurn&&s.turnIndex+1<=PAUSE_UNTIL;}
  function blockReason(s,action,mode){
    if(pending(s))return'recovery-pending';
    if(!active(s)||action?.deferred)return'';
    if(pause(s))return'recovery-pause';
    if(due(s)>0)return'recovery-arrears';
    if(mode==='debt'&&outstanding(s)>0)return'recovery-credit';
    return'';
  }
  function quotes(s){
    if(!pending(s)||s.completed||s.awaitingContinue||s.turnIndex!==0||!s.finance?.currentLedger)return[];
    const f=s.finance;
    return choices.map(id=>{
      const grant=id==='grant'?SUPPORT:0,loan=id==='loan'?SUPPORT:0;
      const reserve=id==='reserves'?round(Math.max(0,BILL-f.treasury)):0;
      const own=round(BILL-grant-loan-reserve);
      const available=own<=f.treasury+1e-7&&reserve<=f.reserve+1e-7&&loan+f.debt<=f.debtLimit+1e-7&&!(loan&&s.rules.noNewDebt);
      return{id,available,bill:BILL,own,grant,loan,reserve,treasuryAfter:round(f.treasury-own),reserveAfter:round(f.reserve-reserve),debtAfter:round(f.debt+loan),pauseUntil:id==='grant'?PAUSE_UNTIL:null,
        repayments:id==='loan'?[{turn:2,amount:1},{turn:3,amount:1},{turn:4,amount:1}]:[],
        plannedAdditionalInterest:id==='loan'?round(loan*f.debtRate+(loan-1)*f.debtRate+(loan-2)*f.debtRate):0};
    });
  }
  function grantReturnQuote(s){
    const eligible=s?.recovery?.choice==='grant'&&!s.recovery.grantReturnTurn&&s.turnIndex+1<=PAUSE_UNTIL&&!s.completed&&!s.awaitingContinue&&!!s.finance.currentLedger;
    return{eligible:Boolean(eligible),available:Boolean(eligible&&s.finance.treasury>=SUPPORT),amount:SUPPORT};
  }
  function scheduledPayment(s){
    if(!active(s))return 0;
    return round(Math.max(0,Math.min(due(s),s.finance.treasury,s.finance.debt)));
  }
  function credit(s,amount,source){
    const value=round(Math.min(amount,outstanding(s)));
    if(value>0)s.recovery.payments.push({turn:s.turnIndex+1,amount:value,source});
    return value;
  }
  function status(s){
    if(!active(s))return null;
    if(pending(s))return'pending';
    if(s.recovery.choice==='reserves')return'settled';
    if(s.recovery.choice==='grant')return s.recovery.grantReturnTurn?'returned':pause(s)?'pause':'conditions-met';
    return outstanding(s)<=0?'repaid':due(s)>0?'arrears':'repayment';
  }
  function report(s){
    if(!active(s))return null;
    return{version:VERSION,caseId:CASE,bill:BILL,choice:s.recovery.choice,status:status(s),grantReceived:s.recovery.choice==='grant'?SUPPORT:0,
      grantReturned:s.recovery.grantReturnTurn?SUPPORT:0,loanIssued:s.recovery.choice==='loan'?SUPPORT:0,principalRepaid:repaid(s),principalOutstanding:outstanding(s),overdue:due(s),
      pauseUntilYear:s.recovery.choice==='grant'?s.population.baseYear+PAUSE_UNTIL-1:null,
      payments:clone(s.recovery.payments),meaning:'Optional authored case; the regular emergency-backstop mechanism is unchanged.'};
  }
  function verify(s){
    const errors=[],r=s?.recovery,accounts=[...(s?.finance?.ledgers||[]),...(s?.finance?.currentLedger?[s.finance.currentLedger]:[])];
    const ops=accounts.flatMap(l=>(l.decisions||[]).map(op=>({op,l})));
    const relevant=ops.filter(x=>String(x.op.operation||'').startsWith('recovery-')||x.op.recoveryCredit);
    if(!r)return relevant.length?['missing-recovery-state']:[];
    try{
      if(!r||Object.keys(r).sort().join('|')!==KEYS.slice().sort().join('|')||r.version!==VERSION||r.caseId!==CASE||r.bill!==BILL||!Array.isArray(r.payments))return['recovery-schema'];
      if(s.scenarioId!=='balanced'||s.challengeId!=='standard'||s.agenda?.mode!=='agenda')errors.push('recovery-setup');
      if(r.choice===null){
        if(s.turnIndex!==0||s.history.length||r.settledTurn!==null||r.grantReturnTurn!==null||r.payments.length||relevant.length)errors.push('recovery-pending-time');
        const f=s.finance;
        if(f.treasury!==9.3||f.reserve!==2.5||f.debt!==6||f.currentLedger.decisions.length)errors.push('recovery-pending-cash');
        return errors;
      }
      if(!choices.includes(r.choice)||r.settledTurn!==1)errors.push('recovery-choice');
      const settlements=relevant.filter(x=>x.op.operation==='recovery-settlement');
      const expected={operation:'recovery-settlement',turn:1,caseId:CASE,choice:r.choice,bill:BILL,own:r.choice==='reserves'?9.3:8.3,reserve:r.choice==='reserves'?2:0,grant:r.choice==='grant'?3:0,loan:r.choice==='loan'?3:0};
      if(settlements.length!==1||JSON.stringify(settlements[0].op)!==JSON.stringify(expected)||settlements[0].l.turn!==1)errors.push('recovery-receipt');
      const returned=relevant.filter(x=>x.op.operation==='recovery-grant-return');
      if(r.grantReturnTurn!==null){
        if(r.choice!=='grant'||![1,2].includes(r.grantReturnTurn)||r.grantReturnTurn>s.turnIndex+1||returned.length!==1||returned[0].op.amount!==3||returned[0].op.turn!==r.grantReturnTurn||returned[0].l.turn!==r.grantReturnTurn)errors.push('recovery-return');
      }else if(returned.length)errors.push('recovery-unrecorded-return');
      const payments=relevant.filter(x=>x.op.operation==='recovery-principal'||x.op.recoveryCredit).map(x=>({turn:x.op.turn,amount:x.op.operation==='recovery-principal'?x.op.amount:x.op.recoveryCredit,source:x.op.operation==='recovery-principal'?'scheduled':'voluntary'}));
      if(JSON.stringify(payments)!==JSON.stringify(r.payments))errors.push('recovery-payment-log');
      if(r.payments.length&&r.choice!=='loan')errors.push('recovery-unissued-loan');
      if(repaid(s)>3+1e-7||outstanding(s)>s.finance.debt+1e-7)errors.push('recovery-principal');
      for(const p of r.payments)if(!Number.isInteger(p.turn)||p.turn<1||p.turn>s.turnIndex+1||!Number.isFinite(p.amount)||p.amount<=0||round(p.amount)!==p.amount||!['scheduled','voluntary'].includes(p.source))errors.push('recovery-payment');
      for(const l of accounts){
        const loanOps=(l.decisions||[]).filter(o=>o.operation==='recovery-principal');
        if(loanOps.some(o=>o.turn!==l.turn||o.amount<=0)||loanOps.reduce((sum,o)=>sum+o.amount,0)>l.outflows.debtRepayment+1e-7)errors.push('recovery-principal-flow');
        const receipts=(l.decisions||[]).filter(o=>o.operation==='recovery-settlement');
        for(const o of receipts)if(o.bill>l.outflows.governanceSpending+1e-7||o.grant>l.inflows.federalCofinance+1e-7||o.reserve>l.inflows.reserveDraw+1e-7||o.loan>l.inflows.borrowing+1e-7)errors.push('recovery-settlement-flow');
        for(const o of (l.decisions||[]).filter(o=>o.operation==='recovery-grant-return'))if(o.amount>l.outflows.governanceSpending+1e-7)errors.push('recovery-return-flow');
      }
      if(r.choice==='grant')for(const h of s.history)if(h.turn<=2&&(!r.grantReturnTurn||h.turn<r.grantReturnTurn)&&!h.deferred)errors.push('recovery-pause-breach');
    }catch(_){errors.push('recovery-malformed');}
    return errors;
  }
  const API={VERSION,CASE,BILL,SUPPORT,PAUSE_UNTIL,fresh,active,pending,repaid,outstanding,due,pause,blockReason,quotes,grantReturnQuote,scheduledPayment,credit,status,report,verify};
  root.GovernorGame=root.GovernorGame||{};root.GovernorGame.Recovery=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
