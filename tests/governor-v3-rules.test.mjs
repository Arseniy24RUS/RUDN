import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { G as existingGame } from './helpers/governor-gameplay.mjs';

const src = new URL('../site/apps/governor/src/', import.meta.url);
const renderer = vm.createContext({GovernorGame:{DATA:existingGame.DATA,Population:existingGame.Population},crypto:webcrypto,TextEncoder});
for (const name of ['v3-event-bank.js','v3-events.js','v3-rules.js'])
  vm.runInContext(await readFile(new URL(name,src),'utf8'),renderer,{filename:name});
const {V3Rules:R,V3Events:Events} = renderer.GovernorGame;
const schoolMap = JSON.parse(await readFile(new URL('../site/apps/governor/data/v3-school-map.json',import.meta.url),'utf8'));
const json = value => JSON.parse(JSON.stringify(value));
const sum = values => values.reduce((a,b)=>a+b,0);
const newGame = (attemptId='synthetic:rules') => R.create({attemptId,schoolMap});
const assignment = '00'.repeat(32); // Reference key only for deterministic fixture tests.

async function withEvent(state, eventId = null) {
  const ledger = state.history.map(row=>row.event);
  const snapshot={revision:state.revision,tags:Events.baselineTags};
  const opened=await Events.open({attemptId:state.attemptId,year:state.year,drawKey:assignment,snapshot,ledger});
  return {...state,event:eventId?{...opened,eventId,circumstance:Events.bank.cards.find(row=>row.id===eventId).circumstance}:opened};
}

function planFor(state,patch={}) {
  const ledger=[...state.history.map(row=>row.event),state.event];
  const executionHistory=state.history.flatMap(row=>row.stats.eventOutcomes);
  return Events.year({attemptId:state.attemptId,year:state.year,ledger,executionHistory,
    picks:Object.fromEntries(ledger.map(row=>[row.year,row.choice || state.draft.eventChoice])),...patch});
}

function sign(state, current = {}) {
  const eventPlan=planFor(state,current);
  const baselineEventPlan=planFor(state,{picks:{},executionHistory:[]});
  const quote=R.quote(state,{eventPlan});
  assert.ok(quote.ok,JSON.stringify(quote.errors));
  return R.commit(state,{expectedRevision:state.revision,signature:quote.signature,eventPlan,baselineEventPlan});
}

test('the reference financial fixture balances all three scenarios at unit precision', () => {
  const sectors = {education:182,health:130,transport:95,economy:72,social:48,housingUtilities:40,administration:35};
  for (const [factor,borrowing,cash,debt] of [[100,0,370,80],[112,50,480,130],[88,0,310,80]]) {
    const row=(id,type,direction,amount,sector=null)=>({id,year:2026,type,direction,amount,sector});
    const ledger=R.reconcile({cash:300,debt:100,reserve:0,operations:[
      row('tax','tax','in',500*factor/100),row('non','non-tax','in',60),row('transfer','equalization','in',140),
      row('loan','loan','in',borrowing),row('interest','interest','out',8),row('principal','principal','out',20),
      ...Object.entries(sectors).map(([id,amount])=>row(id,'programme','out',amount,id))
    ]});
    assert.equal(ledger.cashEnd,cash);
    assert.equal(ledger.debtEnd,debt);
    assert.equal(sum(Object.values(ledger.sectors).map(r=>r.total)),602);
    assert.equal(ledger.totalOut,630);
  }
  const schedule=R.loanSchedule(50,8,3);
  assert.deepEqual(json(schedule.map(p=>p.principal)),[17,17,16]);
  assert.deepEqual(json(schedule.map(p=>p.interest)),[4,3,1]);
  assert.deepEqual(json(schedule.map(p=>p.total)),[21,20,17]);
  assert.deepEqual(json(R.loanSchedule(2,0,2).map(p=>p.total)),[1,1]);
});

test('the school allocator reproduces every expected site and closure without fabricated places', () => {
  const fields=['served','demand','coveragePct','servedByZone','pupilMinutesOneWay','meanTripMinutesServed','lowestZoneCoveragePct'];
  const initial=R.schoolAllocation(schoolMap);
  for (const field of fields) assert.deepEqual(json(initial[field]),schoolMap.expected.baseline[field],field);
  for (const [site,expected] of Object.entries(schoolMap.expected.sites)) {
    const result=R.schoolComparison(schoolMap,site);
    for (const [key,value] of Object.entries(expected))
      assert.deepEqual(json(result[key]),value,site+'/'+key);
  }
  const noStaff=R.schoolAllocation(schoolMap,{schools:schoolMap.baselineSchools.map(s=>({...s,staffedSeats:0}))});
  assert.equal(noStaff.served,0);
  assert.equal(noStaff.unserved,1000);
  assert.equal(noStaff.meanTripMinutesServed,null);
  const zeroDemand=R.schoolAllocation({...schoolMap,zones:schoolMap.zones.map(z=>({...z,pupilsByAge:{'7-10':0,'11-17':0}}))});
  assert.equal(zeroDemand.coveragePct,null);
  assert.equal(R.aggregateSupport({families:60,seniors:56,business:58,youth:58,publicStaff:58,activists:57}),58);
});

test('the pinned EDU-01 event posts the exact first-year expense and never changes the quote input', async () => {
  let state=await withEvent(newGame(),'EDU-01');
  state.draft={...state.draft,measureId:'defer',eventChoice:'a'};
  const input=JSON.stringify(state), selected=planFor(state);
  assert.equal(selected.currentExpenseMln,7);
  assert.equal(selected.outcomes[0].actualUnits,40);
  const quote=R.quote(state,{eventPlan:selected});
  assert.equal(JSON.stringify(state),input);
  assert.equal(quote.finance.operations.filter(p=>p.eventId==='EDU-01').reduce((n,p)=>n+p.amount,0),7);
  const next=sign(state);
  assert.equal(JSON.stringify(state),input);
  assert.equal(next.history.length,1);
  assert.equal(next.year,2027);
  assert.equal(next.history[0].event.eventId,'EDU-01');
  assert.equal(next.history[0].reference.eventOutcomes[0].actualUnits,0);
  assert.throws(()=>R.commit(next,{signature:quote.signature,expectedRevision:state.revision,eventPlan:selected}),/stale-year/);
  const updated={...state,draft:{...state.draft,taxMode:'low'}};
  assert.throws(()=>R.commit(updated,{signature:quote.signature,expectedRevision:state.revision,eventPlan:selected}),/quote-changed/);
});

test('taxes affect their own base and loan and reserve post separately', async () => {
  const state=await withEvent(newGame(),'EDU-01');
  state.draft={...state.draft,measureId:'defer',eventChoice:'base'};
  const eventPlan=planFor(state);
  const base=R.quote(state,{eventPlan}).finance;
  state.draft={...state.draft,taxMode:'high',loan:{principal:500,termYears:3,annualPercent:state.finance.annualPercent},reserveDraw:200};
  const high=R.quote(state,{eventPlan}).finance;
  assert.equal(high.taxes,Math.round(base.taxes*1.12));
  assert.equal(high.nonTax,base.nonTax);
  assert.equal(high.cashEnd-base.cashEnd,high.taxDelta+700);
  assert.equal(high.debtEnd-base.debtEnd,500);
  assert.equal(high.reserveEnd-base.reserveEnd,-200);
  const next=sign(state);
  assert.equal(next.stats.groupReasons.business.source,'tax');
  assert.ok(next.stats.groups.business<state.stats.groups.business);
  assert.equal(next.draft.taxMode,'high');
  assert.equal(next.draft.loan,null);
});

test('school construction, operating loss and reopening stay tied to one facility and one paid year', async () => {
  let s=await withEvent(newGame('synthetic:school'));
  s.draft={...s.draft,eventChoice:'base',measureId:'school-campus',siteId:'bridge'};
  s=sign(s);
  assert.equal(s.projects[0].status,'foundation');
  assert.equal(s.projects[0].openingYear,2030);
  assert.equal(s.finance.debt,5400);
  assert.equal(s.history[0].finance.operations.filter(o=>o.type==='capex')[0].amount,432);
  assert.equal(s.stats.school.facilities.length,2);
  for (let year=2027;year<=2030;year++) {
    s=await withEvent(s);
    s.draft={...s.draft,measureId:year===2027?'school-bus':'defer',eventChoice:'base'};
    s=sign(s);
  }
  const campus=s.projects.find(p=>p.measureId==='school-campus');
  const bus=s.projects.find(p=>p.measureId==='school-bus');
  assert.equal(s.stats.school.facilities.length,3);
  assert.equal(s.stats.school.facilities.find(f=>f.id==='old-school').node,'old');
  assert.equal(campus.status,'open');
  assert.deepEqual(json(campus.paidYears),[2030]);
  assert.deepEqual(json(bus.paidYears),[2027,2028,2029,2030]);
  s=await withEvent(s);
  s.draft={...s.draft,measureId:'restore:'+bus.id,eventChoice:'base'};
  s=sign(s,{roadChanges:[{id:'bridge-crossing',throughYear:2031}]});
  assert.equal(s.stats.school.transported,0);
  assert.equal(s.projects.find(p=>p.id===bus.id).status,'restoring');
  s=await withEvent(s);
  s.draft={...s.draft,measureId:'defer',eventChoice:'base'};
  s=sign(s);
  const returned=s.projects.find(p=>p.id===bus.id);
  assert.equal(returned.id,bus.id);
  assert.equal(returned.status,'open');
  assert.deepEqual(json(returned.paidYears),[2027,2028,2029,2030,2032]);
  const savedStage=year=>s.history.find(row=>row.year===year).projects.find(row=>row.id===campus.id);
  assert.equal(savedStage(2026).status,'foundation');
  assert.equal(savedStage(2029).status,'finishing');
  assert.deepEqual(json(savedStage(2029).paidYears),[]);
  assert.equal(savedStage(2030).status,'open');
  assert.deepEqual(json(savedStage(2030).paidYears),[2030]);
});

test('twenty actual event draws close one chronological accounting period each and award five components', async () => {
  let s=newGame('synthetic:20');
  const measures={2026:'train-staff',2027:'school-campus',2028:'industrial-park',2029:'single-window',2030:'defenses',2031:'second-shift'};
  const sites={2027:'south',2028:'logistics-corridor',2029:'outer-district',2030:'river-towns'};
  const seen=new Set();
  for (let year=2026;year<=2045;year++) {
    s=await withEvent(s);
    assert.ok(!seen.has(s.event.eventId));
    seen.add(s.event.eventId);
    s.draft={...s.draft,eventChoice:year%2?'a':'b',measureId:measures[year] || 'defer',siteId:sites[year] || null};
    s=sign(s);
    const row=s.history.at(-1), f=row.finance;
    assert.equal(row.year,year);
    assert.equal(f.cash + f.totalIn - f.totalOut,f.cashEnd);
    assert.equal(f.cashEnd,s.finance.cash);
    assert.equal(row.stats.year,year);
  }
  assert.equal(s.completed,true);
  assert.equal(s.year,2045);
  assert.equal(s.event,null);
  assert.equal(s.history.length,20);
  assert.equal(s.population.ledgers.length,20);
  assert.equal(existingGame.Population.verify(s.population).ok,true);
  assert.ok(s.history.at(-1).finance.futureRows.some(row=>row.year===2046));
  const result=R.assess(s);
  assert.equal(result.criteria.length,5);
  assert.equal(Math.round(sum(result.criteria.map(row=>row.points))*100),Math.round(result.points*100));
  assert.ok(result.points>=0 && result.points<=5);
});

test('grant match is booked only after spending and the settled year balances', async () => {
  const state=await withEvent(newGame('synthetic:verified-grant'),'BUDGET-01');
  state.draft={...state.draft,measureId:'defer',eventChoice:'a'};
  const eventPlan=planFor(state), quote=R.quote(state,{eventPlan});
  assert.ok(quote.ok);
  assert.equal(quote.finance.operations.filter(row=>row.type==='grant').length,0);
  const settledSpend=Object.fromEntries(eventPlan.rows.map(row=>[row.id,row.amount]));
  const settledEventPlan=planFor(state,{settledSpend});
  const next=R.commit(state,{expectedRevision:0,signature:quote.signature,eventPlan,settledEventPlan});
  assert.equal(next.finance.cash-quote.finance.cashEnd,2);
  const finance=next.history[0].finance;
  assert.equal(finance.cashEnd,finance.cash+finance.totalIn-finance.totalOut);
  assert.equal(finance.operations.find(row=>row.type==='grant').amount,2);
  assert.throws(()=>R.commit(state,{expectedRevision:0,signature:quote.signature,eventPlan,settledEventPlan:eventPlan}),/event-receipt-mismatch/);
});

test('each geography compares real coverage and cash implications for its alternative sites', async () => {
  const base=await withEvent(newGame('synthetic:regions'),'EDU-01');
  for (const id of ['clinics','defenses','industrial-park','single-window']) {
    const m=R.MEASURES.find(row=>row.id===id);
    const cases=m.siteIds.map(siteId=>{
      const state={...base,draft:{...base.draft,measureId:id,eventChoice:'base',siteId}};
      return R.quote(state,{eventPlan:planFor(state)}).project;
    });
    assert.ok(cases.every(row=>row.projection?.districts.length>0));
    assert.ok(new Set(cases.map(row=>row.capex)).size>1);
    assert.ok(new Set(cases.map(row=>row.openingYear)).size>1);
    assert.ok(new Set(cases.map(row=>row.projection.servedChange)).size>1);
  }
});

test('early handover requires no viable event response and does not close a fictitious year', async () => {
  const state=await withEvent(newGame('synthetic:handover'));
  assert.equal(R.handoverStatus(state).available,false);
  assert.throws(()=>R.handover(state,{expectedRevision:state.revision}),/handover-unavailable/);
  const insolvent={...state,finance:{...state.finance,cash:0,reserve:0,debtLimit:5000,
    base:{taxes:0,nonTax:0,grant:0,mandatory:200000}}};
  assert.equal(R.handoverStatus(insolvent).available,true);
  const finished=R.handover(insolvent,{expectedRevision:state.revision});
  assert.equal(finished.completed,true);
  assert.equal(finished.handover.code,'no-funded-legal-plan');
  assert.equal(finished.history.length,0);
  assert.equal(R.assess(finished).criteria.find(row=>row.id==='finance').points,0);
});

test('same-policy scores do not depend on the seed for the base-plan decision profile', async () => {
  const initialA=newGame('synthetic:first'),initialB=newGame('synthetic:second');
  assert.deepEqual(json(initialA.stats),json(initialB.stats));
  assert.deepEqual(json(initialA.finance),json(initialB.finance));
  const scores=[];
  for (let attempt=0;attempt<12;attempt++) {
    let state=newGame('synthetic:policy:'+attempt);
    const key=attempt.toString(16).padStart(2,'0').repeat(32);
    for (let year=2026;year<=2045;year++) {
      const ledger=state.history.map(row=>row.event);
      const event=await Events.open({attemptId:state.attemptId,year,drawKey:key,
        snapshot:{revision:state.revision,tags:Events.baselineTags},ledger});
      const final=(year===2045);
      const picks={...state.draft,measureId:'defer',eventChoice:'base'};
      state=sign({...state,event,draft:picks});
      assert.equal(state.completed,final);
    }
    const score=R.assess(state);
    assert.equal(score.comparison.serviceGain,0);
    scores.push(score.points);
  }
  assert.equal(Math.max(...scores)-Math.min(...scores),0);
});

test('a measure taken in the last year retains scheduled spending beyond handover', async () => {
  let state=newGame('synthetic:beyond-horizon');
  for (let year=2026;year<=2045;year++) {
    state=await withEvent(state);
    state.draft={...state.draft,eventChoice:'base',measureId:year===2045?'school-campus':'defer',siteId:year===2045?'south':null};
    state=sign(state);
  }
  const campus=state.projects.find(p=>p.measureId==='school-campus');
  assert.equal(state.completed,true);
  assert.equal(campus.openingYear,2048);
  assert.equal(campus.paidYears.length,0);
  assert.ok(state.history.at(-1).finance.futureRows.find(row=>row.year===2046).projectExpense>0);
  assert.equal(state.history.at(-1).finance.futureRows.find(row=>row.year===2048).projectExpense,80);
});

test('conditional savings need documented execution and reduce an existing outflow once', async () => {
  const state=await withEvent(newGame('synthetic:verified-saving'),'UTILITY-01');
  state.draft={...state.draft,eventChoice:'a',measureId:'defer'};
  const original=R.baseOperations(state).find(row=>row.sector==='housingUtilities');
  const noProof=R.quote(state,{eventPlan:planFor(state)}).finance;
  assert.equal(noProof.operations.find(row=>row.id===original.id).amount,original.amount);
  // This deliberately supplies a proof in a test ledger. The runtime's
  // aggregate municipal expense does not by itself establish this linkage.
  const proof={'base.energy.municipalBuildings':{id:original.id,year:state.year,expenseMln:9,reductionMln:3,usedMln:2}};
  const plan=planFor(state,{verifiedBaseExpenses:proof});
  assert.equal(plan.currentReceiptMln,0);
  const posted=R.quote(state,{eventPlan:plan}).finance;
  assert.equal(posted.totalOut,noProof.totalOut-1);
  assert.equal(posted.totalIn,noProof.totalIn);
  assert.equal(posted.operations.find(row=>row.id===original.id).amount,original.amount-1);
  assert.equal(sign(state,{verifiedBaseExpenses:proof}).finance.cash,noProof.cashEnd+1);
  const voided=planFor(state,{verifiedBaseExpenses:proof,capacity:{'UTILITY-01':0}});
  assert.equal(R.quote(state,{eventPlan:voided}).finance.cashEnd,noProof.cashEnd);
});
