import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { G as shared } from './helpers/governor-gameplay.mjs';

const src = new URL('../site/apps/governor/src/', import.meta.url);
const renderer = vm.createContext({GovernorGame:{DATA:shared.DATA,Population:shared.Population},crypto:webcrypto,TextEncoder});
for (const name of ['v3-event-bank.js','v3-events.js','v3-rules.js']) {
  vm.runInContext(await readFile(new URL(name,src),'utf8'),renderer,{filename:name});
}
const game = renderer.GovernorGame;
const {V3Rules:rules,V3Events:events} = game;
const schoolMap = JSON.parse(await readFile(new URL('../site/apps/governor/data/v3-school-map.json',import.meta.url),'utf8'));
const fixtures = rules.MEASURES.filter(row=>row.id!=='defer');
const clinic = fixtures.find(row=>row.id==='clinics');
const sharedSite = {id:'test-plot',districtId:'north',labels:{ru:'Участок',en:'Site',zh:'地块'},
  x:.55,y:.20,cost:45,delay:1,opex:20,output:1,targets:{north:1}};
const alternatives = ['clinic-test','same-site-test'].map(id=>({...clinic,id,siteIds:[sharedSite.id],serviceEffect:{measureId:clinic.id}}));
const subsidy = {...fixtures.find(row=>row.id==='skills-compact'),id:'retraining-test',serviceEffect:{outputs:{jobs:1000}}};
game.V4Campaign = {
  available(year) {
    return year<=2030?[...fixtures,...alternatives]:[subsidy];
  },
  site:id=>id===sharedSite.id?sharedSite:null,
  initial:state=>({cash:state.finance.cash,served:state.stats.kpis.school.served}),
  advance:(_previous,next)=>({cash:next.finance.cash,served:next.stats.kpis.school.served}),
  satisfactionEffects:()=>Object.fromEntries(Object.keys(rules.GROUP_WEIGHTS).map(id=>[id,0])),
  score:state=>({version:state.rulesVersion,points:.75,maxPoints:5})
};

const json = value=>JSON.parse(JSON.stringify(value));
const selection = (measureId,siteId = null,promise = null)=>({measureId,siteId,promise});
const errorCodes = quote=>Array.from(quote.errors,row=>row.code);
const baseKey = '27'.repeat(32);

async function open(state) {
  const event = await events.open({attemptId:state.attemptId,year:state.year,drawKey:baseKey,
    snapshot:{revision:state.revision,tags:events.baselineTags},ledger:state.history.map(row=>row.event)});
  return {...state,event,draft:{...state.draft,eventChoice:'base'}};
}

function plan(state, reference = false) {
  const ledger = [...state.history.map(row=>row.event),state.event];
  const picks = Object.fromEntries(ledger.map(row=>[row.year,reference?'base':row.choice || state.draft.eventChoice]));
  return events.year({attemptId:state.attemptId,year:state.year,ledger,picks,executionHistory:
    state.history.flatMap(row=>reference?row.reference.eventOutcomes:row.stats.eventOutcomes)});
}

function preview(state) {
  return rules.quote(state,{eventPlan:plan(state)});
}

async function start() {
  return open(rules.create({attemptId:'economy-v4-fixture',schoolMap,rulesVersion:rules.V4_RULES_VERSION}));
}

function sign(state) {
  const review = preview(state);
  assert.equal(review.ok,true,JSON.stringify(review.errors));
  return rules.commit(state,{expectedRevision:state.revision,signature:review.signature,eventPlan:plan(state),
    baselineEventPlan:plan(state,true)});
}

test('the whole proposed portfolio shares one budget, quote and yearly submission',async()=>{
  const state = await start();
  const empty = preview(state);
  assert.equal(empty.ok,true);
  assert.deepEqual(json(empty.projects),[]);
  state.draft.measures = [selection('school-campus','yard',{type:'open',dueYear:2029}),
    selection('clinics','district-centre',{type:'open',dueYear:2028}),selection('second-shift')];
  const before = JSON.stringify(state);
  const review = preview(state);
  assert.equal(review.ok,true);
  assert.equal(review.projects.length,3);
  const currentCosts = review.projects.reduce((sum,p)=>sum+p.costNow+(p.openingYear===state.year?p.annualOpex:0),0);
  assert.equal(review.finance.cashEnd,empty.finance.cashEnd-currentCosts);
  assert.equal(review.finance.operations.length,new Set(review.finance.operations.map(row=>row.id)).size);
  const added = rules.previewMeasure(state,'school-bus',null,{eventPlan:plan(state)});
  assert.equal(added.projects.length,4);
  assert.equal(added.marginal.spentNow,1120);
  assert.equal(added.marginal.cashChange,-1120);
  assert.equal(added.project.draftMeasureId,'school-bus');
  assert.throws(()=>rules.commit({...state,draft:{...state.draft,measures:state.draft.measures.slice(0,2)}},
    {expectedRevision:state.revision,signature:review.signature,eventPlan:plan(state)}),/quote-changed/);
  const closed = sign(state);
  assert.equal(JSON.stringify(state),before);
  assert.equal(closed.projects.length,3);
  assert.equal(closed.history.length,1);
  assert.equal(closed.history[0].measures.length,3);
  assert.equal(closed.history[0].finance.cashEnd,review.finance.cashEnd);
  assert.equal(new Set(closed.promises.map(row=>row.id)).size,2);
  assert.equal(closed.campaignKpis.cash,closed.finance.cash);
  assert.equal(closed.history[0].referenceCampaignKpis.cash,closed.baseline.finance.cash);
  assert.deepEqual(json(closed.draft.measures),[]);
  assert.equal(rules.assess(closed).version,rules.V4_RULES_VERSION);
});

test('a site can be inspected without a write but cannot be used twice',async()=>{
  const state = await start();
  assert.equal(rules.sitesFor(state,alternatives[0])[0].id,sharedSite.id);
  state.draft.measures = [selection('clinic-test',sharedSite.id),selection('same-site-test',sharedSite.id)];
  const duplicate = preview(state);
  assert.equal(duplicate.ok,false);
  assert.equal(duplicate.errors.find(row=>row.code==='site-occupied').measureId,'same-site-test');
  state.draft.measures[1] = selection('clinic-test',sharedSite.id);
  assert.ok(errorCodes(preview(state)).includes('duplicate-measure'));
  state.draft.measures = [selection('clinic-test','bad-site')];
  assert.ok(errorCodes(preview(state)).includes('invalid-site'));
  state.draft.measures = [selection('clinic-test')];
  assert.ok(errorCodes(preview(state)).includes('site-required'));
  state.draft.measures = [selection('clinic-test',sharedSite.id)];
  const revised = await open(sign(state));
  revised.draft.measures = [selection('same-site-test',sharedSite.id)];
  assert.ok(errorCodes(preview(revised)).includes('site-occupied'));
});

test('affordable individual measures can exceed a joint cash or sector limit',async()=>{
  const state = await start();
  state.finance.base.mandatory += 6000;
  const bus = selection('school-bus');
  const mobile = selection('mobile-units');
  state.draft.measures = [bus];
  assert.equal(preview(state).ok,true);
  state.draft.measures = [mobile];
  assert.equal(preview(state).ok,true);
  state.draft.measures = [bus,mobile];
  assert.ok(errorCodes(preview(state)).includes('budget-deficit'));
  state.finance.base.mandatory -= 6000;
  const total = preview(state).finance;
  state.draft.sectorLimits = {education:total.sectors.education.total-1};
  assert.deepEqual(json(preview(state).errors.find(row=>row.code==='sector-limit').sectors),['education']);
  assert.equal(total.sectors.education.total-total.mandatoryBySector.education,1120);
});

test('school placement compares coverage with the other draft measures at its opening date',async()=>{
  const state = await start();
  const eventPlan = {...plan(state),roadChanges:[{id:'bridge-crossing',throughYear:2030,open:false}]};
  const isolated = rules.previewMeasure(state,'school-campus','south',{eventPlan});
  state.draft.measures = [selection('school-bus'),selection('second-shift')];
  const combined = rules.previewMeasure(state,'school-campus','south',{eventPlan});
  const effect = combined.marginal.kpi;
  const district = effect.districts.find(row=>row.districtId==='suburb');
  assert.equal(effect.metric,'school');
  assert.equal(effect.firstServiceYear,combined.project.openingYear);
  assert.deepEqual(json(effect.closedRoads),['bridge-crossing']);
  assert.equal(district.after.served-district.before.served,district.servedChange);
  assert.ok(district.before.served>isolated.marginal.kpi.districts[0].before.served);
  assert.ok(district.servedChange<isolated.marginal.kpi.districts[0].servedChange);
  const bridgeClosed = rules.previewMeasure(state,'school-campus','bridge',{eventPlan});
  const openAgain = rules.previewMeasure(state,'school-campus','bridge',{eventPlan:{...eventPlan,
    roadChanges:[{id:'bridge-crossing',throughYear:2029,open:false}]}});
  assert.deepEqual(json(openAgain.marginal.kpi.closedRoads),[]);
  assert.ok(openAgain.marginal.kpi.served>bridgeClosed.marginal.kpi.served);
});

test('the calendar replaces new measures without removing delivery or renewal',async()=>{
  let state = await start();
  state.draft.measures = [selection('second-shift')];
  state = sign(state);
  assert.ok(state.history[0].projects[0].paidYears.includes(2026));
  while (state.year<2031) state = sign(await open(state));
  state = await open(state);
  const available = rules.availableMeasures(state);
  assert.equal(available.some(row=>row.id==='school-campus'),false);
  assert.equal(available[0].id,subsidy.id);
  const renewal = available.find(row=>row.id==='restore:project:2026:second-shift');
  assert.ok(renewal);
  state.draft.measures = [selection(renewal.id,null,{type:'open',dueYear:2031}),selection(subsidy.id)];
  const closed = sign(state);
  assert.equal(closed.promises.at(-1).status,'missed');
  assert.equal(closed.projects.find(row=>row.measureId==='second-shift').openingYear,2032);
  assert.equal(closed.history.at(-1).measures.length,2);
});

test('the tax slider interpolates support and taxes with identical endpoints',async()=>{
  const state = await start();
  const neutral = preview(state).finance;
  for (const [rate,mode] of [[88,'low'],[100,'moderate'],[112,'high']]) {
    assert.deepEqual(json(rules.taxSupportEffects(rate)),json(rules.taxSupportEffects(mode)));
  }
  for (const taxRate of [87,112.5,113,'106']) {
    state.draft.taxRate = taxRate;
    assert.ok(errorCodes(preview(state)).includes('invalid-tax'));
  }
  state.draft.taxRate = 106;
  const raised = preview(state).finance;
  assert.equal(raised.taxes,Math.round(neutral.taxBase*1.06));
  assert.equal(raised.nonTax,neutral.nonTax);
  assert.equal(raised.cashEnd-neutral.cashEnd,raised.taxDelta);
  assert.equal(rules.taxSupportEffects(106).business,-.35);
  assert.equal(sign(state).draft.taxRate,106);
});

test('a locked investment separates principal from income and returns both once',async()=>{
  let state = await start();
  const base = preview(state).finance;
  state.draft.investment = {principal:1000,termYears:2};
  const projected = preview(state).finance;
  assert.equal(projected.cashEnd,base.cashEnd-1000);
  assert.equal(projected.investmentDraft.maturityYear,2028);
  assert.equal(projected.investmentHeadroom,base.cashEnd);
  assert.equal(projected.investmentDraft.payout,1080);
  assert.equal(projected.futureRows.find(row=>row.year===2028).investmentIncome,80);
  assert.equal(projected.futureRows.find(row=>row.year===2028).cash,base.futureRows.find(row=>row.year===2028).cash+80);
  const review = preview(state);
  const committed = sign(state);
  assert.equal(committed.finance.investments.length,1);
  assert.equal(committed.draft.investment,null);
  assert.throws(()=>rules.commit(committed,{expectedRevision:state.revision,signature:review.signature,eventPlan:plan(state)}),/stale-year/);
  state = await open(committed);
  assert.equal(preview(state).finance.investmentIncome,0);
  state = await open(sign(state));
  const due = preview(state).finance;
  assert.equal(due.operations.filter(row=>row.type==='investment-principal')[0].amount,1000);
  assert.equal(due.operations.filter(row=>row.type==='investment-income')[0].amount,80);
  assert.equal(due.investmentPrincipal,1000);
  assert.equal(due.investmentIncome,80);
  const paid = sign(state);
  assert.equal(paid.history.at(-1).finance.investmentIncome,80);
  state = await open(paid);
  assert.equal(preview(state).finance.investmentIncome,0);
});

test('a deposit is unavailable for loan or reserve draws, deficits and maturity beyond the campaign',async()=>{
  const state = await start();
  state.draft.investment = {principal:1,termYears:2};
  state.draft.loan = {principal:1000,termYears:3};
  assert.ok(errorCodes(preview(state)).includes('investment-funding-conflict'));
  state.draft.loan = null;
  state.draft.reserveDraw = 100;
  assert.ok(errorCodes(preview(state)).includes('investment-funding-conflict'));
  state.draft.reserveDraw = 0;
  state.draft.investment.principal = preview(state).finance.investmentHeadroom+1;
  const over = preview(state);
  assert.equal(over.errors.find(row=>row.code==='investment-unfunded').amount,1);
  assert.equal(over.finance.operations.some(row=>row.type==='investment-contribution'),false);
  assert.equal(rules.investmentQuote(1000,2,2044),null);
  assert.equal(rules.investmentQuote(1000,2,2043).maturityYear,2045);
  assert.equal(rules.investmentQuote(1000,5,2040).income,200);
});
