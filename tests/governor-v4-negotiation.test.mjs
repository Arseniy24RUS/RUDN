import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
import {G as existingGame} from './helpers/governor-gameplay.mjs';

const src = new URL('../site/apps/governor/src/', import.meta.url);
const sandbox = vm.createContext({GovernorGame:{DATA:existingGame.DATA,Population:existingGame.Population},crypto:webcrypto,TextEncoder});
for (const file of ['v3-event-bank.js','v3-events.js','v4-catalog.js','v4-campaign.js','v3-rules.js','v4-negotiation.js']) {
  vm.runInContext(await readFile(new URL(file,src),'utf8'),sandbox,{filename:file});
}
const {V3Rules:R,V3Events:E,V4Negotiation:N} = sandbox.GovernorGame;
const schoolMap = JSON.parse(await readFile(new URL('../site/apps/governor/data/v3-school-map.json',import.meta.url),'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const state = R.create({attemptId:'negotiation-v4-fixture',schoolMap,rulesVersion:R.V4_RULES_VERSION});
  state.draft.measures = [{measureId:'school-campus',siteId:'yard',promise:null},
    {measureId:'school-bus',siteId:null,promise:null}];
  return state;
}
function view(state, id = 'school-campus') {
  const quote = R.quote(state);
  const measure = R.availableMeasures(state).find(row=>row.id===id);
  const project = quote.projects.find(row=>row.draftMeasureId===id);
  return N.model({state,measure,project,quote});
}
function ui(state, locale = 'ru', id = 'school-campus') {
  const quote = () => R.quote(state);
  return N.create({state:()=>state, measure:()=>R.availableMeasures(state).find(row=>row.id===id),
    project:()=>quote().projects.find(row=>row.draftMeasureId===id),quote,
    language:()=>locale,money:value=>value+' mln RUB',asset:path=>'/'+path});
}

async function closeBaseYear(state) {
  const {attemptId,year,revision} = state;
  const past = state.history.map(row=>row.event);
  const event = await E.open({attemptId,year,drawKey:'27'.repeat(32),ledger:past,
    snapshot:{revision,tags:E.baselineTags}});
  const plan = E.year({attemptId,year,ledger:[...past,event],picks:{[year]:'base'}});
  const draft = {...state,draft:{...state.draft,eventChoice:'base'},event};
  const quote = R.quote(draft,{eventPlan:plan});
  assert.equal(quote.ok,true,JSON.stringify(quote.errors));
  return R.commit(draft,{expectedRevision:revision,signature:quote.signature,eventPlan:plan,baselineEventPlan:plan});
}

test('the negotiation uses the real quoted cash, annual costs, and planned opening without changing the plan',()=>{
  const state = fixture(), before = JSON.stringify(state), quote = R.quote(state), actual = view(state);
  assert.equal(actual.ready,true);
  const expenses = quote.finance.operations.filter(row=>row.direction==='out' &&
    quote.projects.some(project=>row.id.startsWith(project.id+':')));
  assert.equal(actual.totalNow,expenses.reduce((sum,row)=>sum+row.amount,0));
  assert.equal(actual.opening,quote.projects[0].openingYear);
  assert.equal(actual.offers.municipality[0].promise.dueYear,actual.opening);
  const service = view(state,'school-bus');
  const bus = quote.projects.find(row=>row.draftMeasureId==='school-bus');
  assert.equal(service.currentCost,bus.costNow+bus.annualOpex);
  assert.equal(JSON.stringify(state),before);
});

test('replacing a promise changes neither cash, service costs, nor opening year',()=>{
  const state=fixture(), baseline=plain(R.quote(state));
  const opening=baseline.projects[0].openingYear;
  state.draft.measures[0].promise={type:'open',dueYear:opening};
  assert.equal(view(state).risk,null);
  state.draft.measures[0].promise={type:'operate',dueYear:opening+2};
  const replaced=R.quote(state);
  assert.deepEqual(plain(replaced.finance),baseline.finance);
  assert.equal(replaced.projects[0].openingYear,opening);
  assert.equal(view(state).promise.type,'operate');
});

test('two projects retain their addressed promises and another reserve offer is unavailable',()=>{
  const state=fixture(), opening=view(state).opening;
  state.draft.measures[0].promise={type:'open',dueYear:opening};
  state.draft.measures[1].promise={type:'reserve',dueYear:2026,amount:100};
  const actual=view(state);
  assert.equal(actual.entries.filter(row=>row.promise).length,2);
  assert.equal(actual.offers.finance.every(row=>row.disabled==='otherReserve'),true);
  const summary=ui(state).summarize();
  assert.match(summary,/Муниципалитет/);
  assert.match(summary,/Финансы/);
  assert.match(summary,/2026/);
  assert.match(summary,/100 mln RUB/);
  assert.doesNotMatch(summary,/<button/);
});

test('reserve offers use the amount left by this plan including a current withdrawal',()=>{
  const state=fixture();
  state.draft.reserveDraw=50;
  const actual=view(state);
  assert.equal(actual.offers.finance[0].promise.amount,R.quote(state).finance.reserveEnd);
  assert.equal(actual.offers.finance[0].promise.amount,state.finance.reserve-50);
  state.draft.measures[0].promise={type:'reserve',dueYear:state.year,amount:state.finance.reserve};
  assert.equal(view(state).risk,'reserveRisk');
});

test('a promised deadline differs visibly from the real opening and operating period',()=>{
  const state=fixture(), opening=view(state).opening;
  state.draft.measures[0].promise={type:'open',dueYear:opening-1};
  assert.equal(view(state).risk,'mismatch');
  const html=ui(state,'en').render();
  assert.match(html,new RegExp('Open by the end of '+(opening-1)));
  assert.match(html,new RegExp('Planned opening.*<b>'+opening));
  state.draft.measures[0].promise={type:'operate',dueYear:opening-1};
  assert.equal(view(state).risk,'expired');
  state.draft.measures[0].promise={type:'operate',dueYear:R.quote(state).projects[0].endYear+1};
  assert.equal(view(state).risk,'expired');
});

test('closing the opening year fulfils the exact deadline on both kinds of commitment',async()=>{
  for (const [measureId,siteId,expectedOpening] of [['train-staff',null,2026],['school-campus','yard',2028]]) {
    for (const actor of ['municipality','residents']) {
      let state = fixture();
      state.draft.measures = [{measureId,siteId,promise:null}];
      const {promise} = view(state,measureId).offers[actor][0];
      assert.equal(promise.dueYear,expectedOpening);
      state.draft.measures[0].promise = promise;
      while (state.year<=promise.dueYear) {
        state = await closeBaseYear(state);
        assert.equal(state.promises[0].status,state.year<=promise.dueYear?'pending':'kept');
      }
      assert.equal(state.history.at(-1).projects[0].status,'open');
      assert.ok(state.history.at(-1).projects[0].paidYears.includes(promise.dueYear));
    }
  }
});

test('an actual late opening does not overwrite the closed deadline or mutate the saved year',async()=>{
  let state = fixture();
  state.draft.measures = [{measureId:'school-campus',siteId:'yard',promise:{type:'open',dueYear:2027}}];
  while (state.year<=2027) state = await closeBaseYear(state);
  assert.equal(state.promises[0].status,'missed');
  const saved = JSON.stringify(state);
  const later = await closeBaseYear(state);
  assert.equal(later.projects[0].status,'open');
  assert.ok(later.projects[0].paidYears.includes(2028));
  assert.equal(later.promises[0].status,'missed');
  assert.equal(JSON.stringify(state),saved);
  assert.equal(JSON.stringify(later.history.slice(0,-1)),JSON.stringify(state.history));
});

test('the second operating offer stays inside a short programme’s funded period',()=>{
  const state=fixture();
  state.draft.measures=[{measureId:'second-shift',siteId:null,promise:null}];
  const actual=view(state,'second-shift');
  const project=R.quote(state).projects[0];
  assert.equal(project.endYear,project.openingYear+1);
  assert.equal(actual.offers.residents[1].promise.dueYear,project.endYear);
  assert.equal(actual.offers.residents[1].title.en,'Running one year later');
});

test('renewing an operating service offers commitments starting in the renewal year',()=>{
  const state=fixture();
  const original=R.quote(state).projects.find(row=>row.draftMeasureId==='school-bus');
  state.projects=[{...original,paidYears:[2026,2027,2028]}];
  state.year=2029;
  const id='renew:'+original.id;
  state.draft.measures=[{measureId:id,siteId:null,promise:null}];
  const renewal=view(state,id);
  assert.equal(renewal.opening,2026);
  assert.deepEqual(plain(renewal.offers.municipality.map(offer=>offer.promise.dueYear)),[2029,2030]);
  assert.deepEqual(plain(renewal.offers.residents.map(offer=>offer.promise.dueYear)),[2029,2031]);
  const html=ui(state,'en',id).render();
  assert.match(html,/Confirm service by the end of 2029/);
  assert.match(html,/Operating since <b>2026/);
  state.draft.measures[0].promise={type:'open',dueYear:2026};
  assert.equal(view(state,id).risk,'pastDue');
});

test('all three locales retain two offers, three participants, annual cost and an empty-package action',()=>{
  const state=fixture();
  for (const locale of ['ru','en','zh']) {
    const html=ui(state,locale).render();
    assert.equal((html.match(/data-v4-neg-actor=/g)||[]).length,3);
    assert.equal((html.match(/data-v4-neg-offer=/g)||[]).length,2);
    assert.match(html,/data-v4-neg-confirm/);
    assert.doesNotMatch(html,/undefined|NaN/);
    assert.match(html,new RegExp(R.quote(state).projects[0].annualOpex+' mln RUB'));
  }
  state.draft.measures=[];
  assert.equal(view(state).ready,false);
  assert.doesNotMatch(ui(state).summarize(),/<button/);
});
