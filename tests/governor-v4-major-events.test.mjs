import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { G as shared } from './helpers/governor-gameplay.mjs';

const src = new URL('../site/apps/governor/src/', import.meta.url);
const map = JSON.parse(await readFile(new URL('../site/apps/governor/data/v3-school-map.json', import.meta.url), 'utf8'));
const files = ['v3-event-bank', 'v3-event-copy', 'v4-major-events', 'v3-events', 'v4-catalog',
  'v4-campaign', 'v3-rules', 'v3-runtime'];
const sources = await Promise.all(files.map(file => readFile(new URL(file+'.js',src),'utf8')));
const plain = value => JSON.parse(JSON.stringify(value));
const key = seed => createHash('sha256').update('governor-major-test-'+seed).digest('hex');
const attemptId = 'test-only/major-events';
const firstYear = 2026;
const lastYear = 2045;
const noListeners = () => {};

function setup(crypto = webcrypto) {
  const sandbox = vm.createContext({
    GovernorGame:{DATA:shared.DATA,Population:shared.Population}, structuredClone, crypto, TextEncoder,
    fetch:async()=>({ok:true,json:async()=>structuredClone(map)}),
    addEventListener:noListeners, removeEventListener:noListeners
  });
  files.forEach((file,i) => vm.runInContext(sources[i],sandbox,{filename:file+'.js'}));
  return sandbox.GovernorGame;
}

const game = setup();
const {V3Events:events,V4MajorEvents:major,V3Rules:rules} = game;
const snapshot = {revision:0,tags:events.baselineTags};
const ids = ['LANDMARK-01','LANDMARK-02','LANDMARK-03','LANDMARK-04'];

async function drawCampaign(drawKey, eventPolicy, eventSnapshot = snapshot) {
  const ledger = [];
  for (let year=firstYear; year<=lastYear; year++) {
    const record = await events.open({attemptId,year,drawKey,snapshot:eventSnapshot,ledger,eventPolicy});
    assert.equal(await events.verify(record,{drawKey,snapshot:eventSnapshot,ledger:[...ledger,record]}),true);
    // Persist real receipt shape, including policy and opening facts, before opening another year.
    ledger.push(plain(record));
  }
  return ledger;
}

test('the archived schedule still draws exactly one distinct signature situation per five-year term',async()=>{
  assert.equal(events.bank.cards.length,100);
  assert.equal(events.candidates(events.baselineTags).length,100);
  const orderings = new Set(),dates = new Set();
  for (let i=0;i<24;i++) {
    const ledger = await drawCampaign(key(i),major.LEGACY_POLICY);
    const landmarks = ledger.filter(row=>major.has(row.eventId));
    assert.equal(landmarks.length,4);
    assert.deepEqual(landmarks.map(row=>row.eventId).sort(),ids);
    assert.ok(landmarks[0].year>=2028 && landmarks[0].year<=2030);
    landmarks.slice(1).forEach((row,i) => {
      const termStart = firstYear+(i+1)*5;
      assert.ok(row.year>termStart && row.year<=termStart+4);
    });
    assert.ok(ledger.every(row=>row.eventPolicy===major.LEGACY_POLICY));
    assert.equal(new Set(ledger.map(row=>row.eventId)).size,20);
    orderings.add(landmarks.map(row=>row.eventId).join(','));
    dates.add(landmarks.map(row=>row.year).join(','));
  }
  assert.ok(orderings.size>6 && dates.size>6);
});

test('new terms draw rare situations from the first year, allow several in one term, and can omit them all',async()=>{
  const frequencies = Array(20).fill(0);
  const campaignCounts = new Set(), firstYearEvents = new Set();
  const landmarksIn = ledger => ledger.filter(row=>major.has(row.eventId));
  for (let i=0;i<128;i++) {
    const ledger = await drawCampaign(key(i),major.POLICY);
    const landmarks = landmarksIn(ledger);
    campaignCounts.add(landmarks.length);
    for (const {year} of landmarks) frequencies[year-firstYear]++;
    if (major.has(ledger[0].eventId)) firstYearEvents.add(ledger[0].eventId);
    assert.equal(new Set(ledger.map(row=>row.eventId)).size,20);
    assert.ok(ledger.every(row=>row.eventPolicy===major.POLICY));
  }
  assert.deepEqual([...campaignCounts].sort(),[0,1,2,3,4]);
  assert.deepEqual([...firstYearEvents].sort(),ids);
  assert.ok(frequencies.every(count=>count>0));
  assert.equal(frequencies[0],24,'The fixed sample includes 24 rare opening rolls in 128 attempts');
  const clustered = landmarksIn(await drawCampaign(key(28),major.POLICY));
  assert.deepEqual(clustered.map(row=>[row.year,row.eventId]),[
    [2026,'LANDMARK-03'],[2027,'LANDMARK-01'],[2028,'LANDMARK-02'],[2030,'LANDMARK-04']
  ]);
  assert.deepEqual(landmarksIn(await drawCampaign(key(56),major.POLICY)),[]);
});

test('the random policy uses the eligible pool when the other one is empty',async()=>{
  const restricted = {revision:0,tags:{capital:['publicBuilding']}};
  const drawKey = key(0); // Ordinary rolls in both 2026 and 2027.
  const first = await events.open({attemptId,year:firstYear,drawKey,snapshot:restricted,eventPolicy:major.POLICY});
  assert.equal(first.eventId,'BUDGET-02');
  const second = await events.open({attemptId,year:firstYear+1,drawKey,snapshot:restricted,ledger:[first]});
  assert.equal(second.eventId,'LANDMARK-03');
  assert.ok(await events.verify(second,{snapshot:restricted,drawKey,ledger:[first,second]}));
  await assert.rejects(events.open({attemptId,year:firstYear+2,drawKey,snapshot:restricted,ledger:[first,second]}),/no-applicable-events/);
  const scheduled = await events.open({attemptId,year:firstYear,drawKey,snapshot:restricted,eventPolicy:major.LEGACY_POLICY});
  await assert.rejects(events.open({attemptId,year:firstYear+1,drawKey,snapshot:restricted,ledger:[scheduled]}),/no-applicable-events/);
  // The first-year rare roll for this seed must use an ordinary card when no large situation applies.
  const ordinaryOnly = {revision:0,tags:{suburb:['school']}};
  const fallback = await events.open({attemptId,year:firstYear,drawKey:key(3),snapshot:ordinaryOnly,eventPolicy:major.POLICY});
  assert.ok(events.candidates(ordinaryOnly.tags).includes(fallback.eventId));
});

test('older saves retain the original draw, and policy receipts prevent accidental mixing',async()=>{
  const original = await events.open({attemptId,year:firstYear,drawKey:'00'.repeat(32),snapshot});
  assert.equal(original.eventId,'EDU-07');
  assert.equal(original.candidateHash,'466345b8eaa23a7933f9d84a5e1f17052cf53b3a8cfef2a611ce954a56e7d722');
  assert.equal(Object.hasOwn(original,'eventPolicy'),false);
  assert.ok((await drawCampaign(key('legacy'),undefined)).every(row=>!major.has(row.eventId)));
  const current = await drawCampaign(key(3),major.POLICY);
  const scheduled = await drawCampaign(key(3),major.LEGACY_POLICY);
  assert.equal(scheduled[0].eventId,'HEALTH-04');
  assert.equal(scheduled[0].candidateHash, original.candidateHash);
  const landmark = current.find(row=>major.has(row.eventId));
  assert.equal(await events.open({attemptId,year:landmark.year,ledger:current}),landmark);
  assert.equal(await events.open({attemptId,year:scheduled[0].year,ledger:scheduled}),scheduled[0]);
  await assert.rejects(events.open({attemptId,year:firstYear+1,drawKey:key(1),snapshot,ledger:[original],
    eventPolicy:major.POLICY}),/event-policy-conflict/);
  await assert.rejects(events.open({attemptId,year:firstYear+1,drawKey:key(3),snapshot,ledger:scheduled.slice(0,1),
    eventPolicy:major.POLICY}),/event-policy-conflict/);
  await assert.rejects(events.open({attemptId,year:firstYear+1,drawKey:key(3),snapshot,ledger:current.slice(0,1),
    eventPolicy:major.LEGACY_POLICY}),/event-policy-conflict/);
  await assert.rejects(events.open({attemptId,year:firstYear,drawKey:key(3),snapshot,eventPolicy:'unknown'}),/event-policy-unavailable/);
  assert.throws(()=>events.card({...landmark,eventPolicy:undefined}),/invalid-major-event-record/);
  assert.throws(()=>events.card({...landmark,eventPolicy:'unknown'}),/event-policy-unavailable/);
  const restricted = plain(snapshot);
  delete restricted.tags.river;
  for (const policy of [major.POLICY,major.LEGACY_POLICY]) {
    assert.ok((await drawCampaign(key(3),policy,restricted)).every(row=>row.eventId!=='LANDMARK-02'));
  }
});

test('four genuine options sets are readable in Russian, English and Chinese',()=>{
  for (const id of ids) {
    const translated = ['ru','en-GB','zh-CN'].map(locale=>events.eventCard(id,locale));
    assert.equal(new Set(translated.map(card=>card.title)).size,3,id);
    assert.equal(new Set(translated.map(card=>card.localIndicator.unitLabel)).size,3,id);
    translated.forEach((card,i) => {
      assert.equal(card.locale,['ru','en','zh'][i],id);
      assert.equal(card.fallbackLocale,undefined,id);
      assert.ok(card.situation && card.circumstance.summary);
      assert.deepEqual(Array.from(card.options,option=>option.id),['a','b','base']);
      assert.ok(card.options.every(choice=>choice.label && choice.tradeoff && choice.beneficiaries));
      assert.notEqual(card.options[0].tradeoff,card.options[1].tradeoff);
    });
    assert.equal(events.eventCard(id).options[2].effects.treasury.oneOffMlnRub,0);
  }
});

function calculate(record, choice, context = {}) {
  return events.year({attemptId,year:record.year,ledger:[record],picks:{[record.year]:choice},...context});
}

test('the ledger counts mandatory costs once, models actual coverage, and credits the dam grant only at settlement',async()=>{
  const ledger = await drawCampaign(key(28),major.POLICY);
  const [meteor,dam,visit,games] = ids.map(id=>ledger.find(row=>row.eventId===id));
  for (const [record, a, b, base, coverage, authority] of [
    [meteor,1300,490,180,[950,420,140],'suburb'],
    [dam,2090,795,420,[1240,640,180],'river'],
    [visit,690,70,70,[2760,840,160],'capital'],
    [games,2350,520,0,[24000,12600,0],'capital']
  ]) {
    const results = ['a','b','base'].map(choice=>calculate(record,choice));
    assert.deepEqual(results.map(plan=>plan.currentExpenseMln),[a,b,base]);
    assert.deepEqual(results.map((plan,i)=>i===2?plan.outcomes[0].baselineUnits:plan.outcomes[0].actualUnits),coverage);
    assert.equal(results[0].currentReceiptMln,0);
    assert.ok(results[0].supportByDistrict[authority]>results[1].supportByDistrict[authority]);
    assert.equal(results[2].supportByDistrict[authority],undefined);
    assert.ok(results.every(plan=>plan.rows.length===new Set(plan.rows.map(row=>row.id)).size));
  }
  const fullDam = calculate(dam,'a');
  const partPaid = {[fullDam.rows.find(row=>row.type==='oneOff').id]:120};
  assert.equal(calculate(dam,'a',{settledSpend:partPaid}).currentReceiptMln,120);
  const settledSpend = Object.fromEntries(fullDam.rows.map(row=>[row.id,row.amount]));
  assert.equal(calculate(dam,'a',{settledSpend}).currentReceiptMln,280);
  assert.equal(calculate(dam,'base',{settledSpend}).currentReceiptMln,0);
  assert.equal(calculate(dam,'a',{year:dam.year+1,settledSpend}).currentExpenseMln,110);
  assert.equal(calculate(dam,'a',{year:dam.year+1,settledSpend}).currentReceiptMln,0);
});

test('a late bid provides current-year benefits and exposes obligations to the succeeding administration',async()=>{
  const bid = (await drawCampaign(key(52),major.POLICY)).at(-1);
  assert.equal(bid.eventId,'LANDMARK-04');
  const eventPlan = calculate(bid,'a');
  assert.equal(eventPlan.outcomes[0].actualUnits,24000);
  assert.deepEqual(plain(eventPlan.futureRows.map(row=>[row.year,row.amount])),[[2046,170]]);
  const initial = rules.create({attemptId,schoolMap:map,rulesVersion:rules.V4_RULES_VERSION});
  const state = {...initial,year:lastYear,event:bid,draft:{...initial.draft,eventChoice:'a'}};
  const quote = rules.quote(state,{eventPlan});
  const baseline = rules.quote({...state,draft:{...state.draft,eventChoice:'base'}},{eventPlan:calculate(bid,'base')});
  assert.equal(baseline.finance.cashEnd-quote.finance.cashEnd,2350);
  assert.equal(baseline.finance.futureRows[0].cash-quote.finance.futureRows[0].cash,2520);
});

function closeCampaign(ledger, choice, openingDraft = {}) {
  let state = rules.create({attemptId,schoolMap:map,rulesVersion:rules.V4_RULES_VERSION});
  for (const record of ledger) {
    assert.equal(state.year,record.year);
    state = {...state,event:record,draft:{...state.draft,...(record.year===firstYear?openingDraft:{}),
      eventChoice:major.has(record.eventId)?choice:'base'}};
    const ledgerToDate = ledger.filter(row=>row.year<=record.year);
    const params = {attemptId,year:record.year,ledger:ledgerToDate};
    const picks = Object.fromEntries(ledgerToDate.map(row=>[row.year,major.has(row.eventId)?choice:'base']));
    const eventPlan = events.year({...params,picks,executionHistory:state.history.flatMap(row=>row.stats.eventOutcomes)});
    const baselineEventPlan = events.year({...params,picks:{},executionHistory:state.history.flatMap(row=>row.reference.eventOutcomes)});
    const preview = rules.quote(state,{eventPlan});
    assert.ok(preview.ok,JSON.stringify(preview.errors));
    state = rules.commit(state,{expectedRevision:state.revision,signature:preview.signature,eventPlan,baselineEventPlan});
    const committed = state.history.at(-1);
    const grants = committed.finance.operations.filter(entry=>entry.eventId===record.eventId && entry.type==='grant');
    assert.equal(grants.length,choice!=='base'&&record.eventId==='LANDMARK-02'?1:0);
    assert.equal(state.finance.cash,preview.finance.cashEnd+(grants[0]?.amount||0));
    assert.ok(state.finance.cash>=0);
  }
  assert.equal(state.completed,true);
  assert.equal(state.history.length,20);
  assert.ok(rules.assess(state).points>=0 && rules.assess(state).points<=5);
  return state.history;
}

test('whole 20-year V4 ledgers close with conservative, targeted, or full responses and expose the actual road impact',async()=>{
  const ledger = await drawCampaign(key(28),major.POLICY);
  const meteor = ledger.find(row=>row.eventId==='LANDMARK-01');
  const histories = Object.fromEntries(['base','b','a'].map(choice=>[choice,closeCampaign(ledger,choice)]));
  const result = (choice,year) => histories[choice].find(row=>row.year===year);
  assert.equal(major.roadImpact(meteor,'a').open,true);
  assert.equal(major.roadImpact(meteor,'b',meteor.year+2),null);
  assert.ok(result('b',meteor.year).stats.school.closedRoads.includes('w-c'));
  assert.ok(!result('a',meteor.year).stats.school.closedRoads.includes('w-c'));
  assert.ok(result('a',meteor.year).reference.school.closedRoads.includes('w-c'));
  assert.ok(result('a',meteor.year).stats.school.served>result('base',meteor.year).stats.school.served);
  if (meteor.year<lastYear) assert.ok(result('b',meteor.year+1).stats.school.closedRoads.includes('w-c'));
  if (meteor.year<lastYear-1) assert.ok(!result('b',meteor.year+2).stats.school.closedRoads.includes('w-c'));
});

test('the opening budget can fund a portfolio and withstand the two costliest landmark events in consecutive years',async()=>{
  const ledger = await drawCampaign(key(589),major.POLICY);
  assert.deepEqual(ledger.slice(0,2).map(row=>row.eventId),['LANDMARK-02','LANDMARK-04']);
  const draft = {measures:[{measureId:'school-campus',siteId:'bridge'}],taxRate:104,investment:{principal:1000,termYears:3}};
  const history = closeCampaign(ledger,'a',draft);
  assert.equal(history[0].measures[0].measureId,'school-campus');
  assert.equal(history[0].finance.investmentContribution,1000);
  assert.ok(history[0].finance.cashEnd>0 && history[1].finance.cashEnd>0);
});

test('V4 runtime assigns the policy only to new attempts and keeps saved events on resume',async()=>{
  const actual = setup({subtle:webcrypto.subtle,randomUUID:()=>webcrypto.randomUUID(),
    getRandomValues(bytes){bytes.set(Buffer.from(key(3),'hex'));return bytes;}});
  const slots = new Map();
  let controller;
  actual.V3Store = {
    read:async scope=>slots.get(scope),
    put:async(scope,_expected,record)=>{
      const stored = plain(record);
      slots.set(scope,stored);
      return stored;
    }
  };
  actual.V3UI = {mount(_host,api){controller=api;return {render:noListeners};}};
  actual.resolveAsset = path=>path;
  const bridge = {owner:'guest:test',context:'free',language:'ru',canWrite:()=>true};
  for (const edition of ['v3','v4']) {
    const runtime = await actual.V3Runtime.mount({}, {...bridge,edition});
    await controller.start();
    const scope = JSON.stringify([bridge.owner,bridge.context,'governor-'+edition]);
    const saved = slots.get(scope);
    assert.equal(saved.eventPolicy,edition==='v4'?major.POLICY:undefined);
    if (edition==='v4') assert.equal(saved.state.event.eventId,'LANDMARK-02');
    runtime.freeze();
    const reopened = await actual.V3Runtime.mount({}, {...bridge,edition});
    assert.equal(reopened.state().event.eventId,saved.state.event.eventId);
    assert.equal(slots.get(scope).draws[0].candidateHash,saved.draws[0].candidateHash);
    reopened.freeze();
  }
  const v4Key = JSON.stringify([bridge.owner,bridge.context,'governor-v4']);
  const old = slots.get(v4Key);
  for (const eventPolicy of [undefined,major.LEGACY_POLICY]) {
    const event = await events.open({attemptId:old.state.attemptId,year:firstYear,snapshot,drawKey:old.drawKey,eventPolicy});
    const saved = {...old,eventPolicy,draws:[event],state:{...old.state,event}};
    for (const recoverFromCloud of [false,true]) {
      if (recoverFromCloud) slots.delete(v4Key);
      else slots.set(v4Key,saved);
      const resumed = await actual.V3Runtime.mount({}, {...bridge,edition:'v4'},recoverFromCloud?saved:undefined);
      assert.deepEqual(plain(resumed.state().event),plain(event));
      assert.equal(slots.get(v4Key).eventPolicy,eventPolicy);
      assert.deepEqual(plain(slots.get(v4Key).draws),plain(saved.draws));
      resumed.freeze();
    }
  }
});
