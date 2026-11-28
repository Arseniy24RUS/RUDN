import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { G as shared } from './helpers/governor-gameplay.mjs';

const schoolMap = JSON.parse(await readFile(new URL('../site/apps/governor/data/v3-school-map.json',import.meta.url),'utf8'));
const noop = () => {};
const key = createHash('sha256').update('rudn-balance-v1-22').digest('hex');
const sandbox = vm.createContext({
  GovernorGame:{DATA:shared.DATA,Population:shared.Population},structuredClone,TextEncoder,
  crypto:{subtle:webcrypto.subtle,randomUUID:()=>webcrypto.randomUUID(),
    getRandomValues(bytes) { bytes.set(Buffer.from(key,'hex')); return bytes; }},
  fetch:async()=>({ok:true,json:async()=>structuredClone(schoolMap)}),
  addEventListener:noop,removeEventListener:noop
});
for (const file of ['v3-event-bank','v3-event-copy','v4-major-events','v3-events','v4-catalog','v4-campaign','v3-rules','v3-runtime']) {
  const source = await readFile(new URL('../site/apps/governor/src/'+file+'.js',import.meta.url),'utf8');
  vm.runInContext(source,sandbox,{filename:file+'.js'});
}
const G = sandbox.GovernorGame;
const {V3Rules:R,V3Events:E,V4MajorEvents:M} = G;
const energy = 'base.energy.municipalBuildings';
const total = rows => rows.reduce((sum,row)=>sum+row.amount,0);

async function opening() {
  const state = R.create({attemptId:'fiscal-savings-fixture',schoolMap,rulesVersion:R.V4_RULES_VERSION});
  const event = await E.open({attemptId:state.attemptId,year:state.year,drawKey:key,ledger:[],eventPolicy:M.POLICY,
    snapshot:{revision:0,tags:E.baselineTags}});
  assert.equal(event.eventId,'UTILITY-01');
  return {...state,event,balanceVersion:'governor-balance-v1',draft:{...state.draft,eventChoice:'a'}};
}

function plan(state,{verified = R.verifiedBaseExpenses(state), ...extra} = {}) {
  return E.year({attemptId:state.attemptId,year:state.year,ledger:[state.event],
    picks:{[state.event.year]:state.draft.eventChoice},verifiedBaseExpenses:verified,...extra});
}

test('fiscal items come from existing sector allocations and legacy opening totals remain exact',async()=>{
  const state = await opening(), legacy = {...state,balanceVersion:undefined};
  const before = R.baseOperations(legacy), after = R.baseOperations(state);
  assert.equal(after.length-before.length,4);
  for (const {sector,amount} of before) assert.equal(total(after.filter(row=>row.sector===sector)),amount);
  assert.deepEqual(Object.keys(R.verifiedBaseExpenses(legacy)),[]);
  assert.equal(R.verifiedBaseExpenses(state)[energy].expenseMln,9);
  assert.equal(R.verifiedBaseExpenses(state)[energy].reductionMln,4);
  const empty = {...state,finance:{...state.finance,base:{...state.finance.base,mandatory:0}}};
  assert.deepEqual(Object.keys(R.verifiedBaseExpenses(empty)),[]);
});

test('confirmed energy saving is an expense reduction and cannot use a source twice',async()=>{
  const state = await opening(), proof=R.verifiedBaseExpenses(state);
  const noProof = R.quote(state,{eventPlan:plan(state,{verified:{}})}).finance;
  const calculation = plan(state);
  assert.equal(calculation.currentExpenseMln,5);
  assert.equal(calculation.currentReceiptMln,0);
  const saving = calculation.rows.find(row=>row.type==='saving');
  assert.equal(saving.replaces,proof[energy].id);
  const quote = R.quote(state,{eventPlan:calculation});
  assert.equal(quote.finance.eventSavings,2);
  assert.equal(quote.finance.totalOut,noProof.totalOut-2);
  assert.equal(quote.finance.totalIn,noProof.totalIn);
  const repeated = R.quote(state,{eventPlan:{...calculation,rows:[...calculation.rows,saving]}});
  assert.equal(repeated.finance.cashEnd,quote.finance.cashEnd);
  const atCap = R.quote(state,{eventPlan:{...calculation,rows:[...calculation.rows,{...saving,id:'second-eligible-saving',amount:9}]}});
  assert.equal(atCap.finance.eventSavings,4);
  assert.equal(plan(state,{capacity:{'UTILITY-01':0}}).rows.some(row=>row.type==='saving'),false);
  const closed = R.commit(state,{expectedRevision:state.revision,signature:quote.signature,eventPlan:calculation,baselineEventPlan:plan(
    {...state,draft:{...state.draft,eventChoice:'base'}})});
  assert.equal(closed.finance.cash,quote.finance.cashEnd);
  assert.equal(closed.history[0].finance.eventSavings,2);
});

test('savings begin with delivery and stop at the end of the funded term',async()=>{
  const current = await opening();
  current.draft.eventChoice='b';
  assert.equal(plan(current).rows.some(row=>row.type==='saving'),false);
  const years = [2027,2028,2029,2030].map(year=>plan({...current,year}).rows.find(row=>row.type==='saving')?.amount??0);
  assert.deepEqual(years,[4,4,4,0]);
});

test('real runtime uses the same qualified source for preview and signed year',async()=>{
  const slots = new Map();
  let controller;
  G.V3Store = {
    read:async scope=>slots.get(scope),
    put:async (scope,_expected,record)=>{
      const stored = structuredClone(record);
      slots.set(scope,stored);
      return stored;
    }
  };
  G.V3UI = {mount(_host,api){controller=api;return {render:noop};}};
  G.resolveAsset = path=>path;
  const bridge = {owner:'guest:fiscal-test',context:'free',language:'ru',canWrite:()=>true};
  const runtime = await G.V3Runtime.mount({},bridge);
  try {
    await controller.start();
    assert.equal(runtime.state().event.eventId,'UTILITY-01');
    await controller.patchDraft({eventChoice:'a'});
    await controller.saveUI({tutorialStep:11});
    const quote = controller.getQuote();
    assert.equal(quote.finance.eventSavings,2);
    await controller.commitYear({signature:quote.signature,revision:runtime.state().revision});
    assert.equal(runtime.state().history[0].finance.eventSavings,2);
    assert.equal(runtime.state().history[0].finance.cashEnd,quote.finance.cashEnd);
  } finally {
    runtime.freeze();
  }
});
