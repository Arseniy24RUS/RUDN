import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
import {G as existingGame} from './helpers/governor-gameplay.mjs';

const src = new URL('../site/apps/governor/src/', import.meta.url);
const renderer = vm.createContext({
  GovernorGame:{DATA:existingGame.DATA,Population:existingGame.Population},
  crypto:webcrypto,TextEncoder
});
for (const file of ['v3-event-bank','v3-events','v4-catalog','v4-campaign','v3-rules']) {
  vm.runInContext(await readFile(new URL(file+'.js',src),'utf8'),renderer,{filename:file+'.js'});
}
const {V4Catalog:catalog,V3Rules:rules,V3Events:events} = renderer.GovernorGame;
const schoolMap = JSON.parse(await readFile(new URL('../site/apps/governor/data/v3-school-map.json',import.meta.url),'utf8'));
const firstYears = [2026,2031,2036,2041];
const programmes = catalog.phases.flat().filter(row=>row.serviceEffect.targets);
const sourceDistricts = new Set(Object.keys(rules.DISTRICTS));
const plain = value=>JSON.parse(JSON.stringify(value));

function initial() {
  return rules.create({attemptId:'test-only/regional-programmes',schoolMap,rulesVersion:rules.V4_RULES_VERSION});
}

async function opening(year) {
  let state = initial();
  while (state.year<year) {
    const open = await openYear(state);
    state = close(open.state,open.eventPlan);
  }
  return openYear(state);
}

async function openYear(first) {
  const {attemptId,revision,year} = first;
  const priorEvents = first.history.map(row=>row.event);
  const event = await events.open({attemptId,year,drawKey:'28'.repeat(32),snapshot:{revision,tags:events.baselineTags},ledger:priorEvents});
  const state = {...first,event,draft:{...first.draft,eventChoice:'base'}};
  const eventPlan = events.year({attemptId,year,ledger:[...priorEvents,event],picks:{[year]:'base'}});
  return {state,eventPlan};
}

function close(state,eventPlan) {
  const quote = rules.quote(state,{eventPlan});
  assert.equal(quote.ok,true,JSON.stringify(quote.errors));
  return rules.commit(state,{expectedRevision:state.revision,signature:quote.signature,eventPlan,baselineEventPlan:eventPlan});
}

test('four terms preserve site choices and offer regional programmes across budget sectors',()=>{
  assert.deepEqual(Array.from(catalog.phases,term=>term.length),[22,22,23,22]);
  assert.equal(new Set(catalog.phases.flat().map(row=>row.id)).size,89);
  assert.equal(catalog.phases.flat().filter(row=>row.kind==='capital').length,18);
  assert.equal(catalog.phases.flat().filter(row=>row.kind==='service').length,71);
  assert.deepEqual(Array.from(catalog.phases,term=>term.filter(row=>row.serviceEffect.targets).length),[13,15,15,14]);
  assert.equal(new Set(catalog.phases.flat().map(row=>row.sector)).size,7);
  for (const term of catalog.phases) {
    const regional = term.filter(row=>row.serviceEffect.targets);
    assert.ok(regional.length>12);
    assert.ok(new Set(regional.map(row=>row.sector)).size>=4);
    for (const row of regional) {
      const weights = Object.entries(row.serviceEffect.targets);
      assert.equal(row.kind,'service',row.id);
      assert.equal(row.siteIds.length,0,row.id);
      assert.ok(weights.length>=2&&weights.length<=5,row.id);
      assert.ok(weights.every(([id,weight])=>sourceDistricts.has(id)&&Number.isFinite(weight)&&weight>0&&weight<1),row.id);
      assert.ok(Math.abs(weights.reduce((sum,[,weight])=>sum+weight,0)-1)<1e-9,row.id);
      assert.ok(row.serviceEffect.targets[row.districtId]>=Math.max(...weights.map(([,weight])=>weight)),row.id);
      for (const locale of ['ru','en','zh']) assert.ok(row.labels[locale]&&row.description[locale],row.id);
    }
  }
  for (const id of ['second-shift','school-bus','bridge-maintenance','north-regular-route']) {
    assert.equal(catalog.phases.flat().find(row=>row.id===id).serviceEffect.targets,undefined,id);
  }
});

test('all regional programmes charge their quoted cost once to their own sector',async()=>{
  for (const [index,year] of firstYears.entries()) {
    const {state,eventPlan} = await opening(year);
    const baseline = rules.quote(state,{eventPlan});
    for (const row of catalog.phases[index].filter(row=>row.serviceEffect.targets)) {
      const quote = rules.previewMeasure(state,row.id,null,{eventPlan});
      assert.ok(quote.ok,row.id);
      assert.equal(quote.project.siteId,null,row.id);
      assert.equal(quote.project.openingYear,year,row.id);
      assert.deepEqual(quote.project.targets,row.serviceEffect.targets,row.id);
      assert.equal(quote.marginal.spentNow,row.cost+row.annualOpex,row.id);
      assert.equal(quote.marginal.cashChange,-quote.marginal.spentNow,row.id);
      const sectorDelta = quote.finance.sectors[row.sector].total-baseline.finance.sectors[row.sector].total;
      assert.equal(sectorDelta,quote.marginal.spentNow,row.id);
    }
  }
});

test('representative programmes increase effective service coverage outside their coordinating district',async()=>{
  const examples = [
    ['train-staff',2026,'health','river'],
    ['mobile-units',2026,'health','industrial'],
    ['outreach',2026,'flood','north'],
    ['skills-compact',2026,'employment','suburb'],
    ['telemedicine-network',2031,'health','river'],
    ['childcare-extended',2031,'childcare','industrial'],
    ['modular-platform',2031,'digital','north'],
    ['oncology-screening',2036,'health','capital'],
    ['open-data-exchange',2036,'digital','north'],
    ['civic-tech-lab',2036,'employment','suburb'],
    ['integrated-primary-care',2041,'health','suburb'],
    ['family-unified-service',2041,'childcare','north']
  ];
  for (const [id,year,metric,secondaryDistrict] of examples) {
    const {state,eventPlan} = await opening(year);
    const quote = rules.previewMeasure(state,id,null,{eventPlan});
    assert.equal(quote.marginal.kpi?.metric,metric,id);
    assert.ok(quote.marginal.kpi.districts.filter(row=>row.servedChange>0).length>=2,id);
    assert.ok(quote.marginal.kpi.districts.find(row=>row.districtId===secondaryDistrict).servedChange>0,id);
    const planned = {...state,draft:{...state.draft,measures:[{measureId:id,siteId:null,promise:null}]}};
    const signed = close(planned,eventPlan);
    const reference = close(state,eventPlan);
    assert.deepEqual(plain(signed.projects[0].targets),plain(quote.project.targets),id);
    assert.ok(signed.stats.districts[secondaryDistrict].kpis[metric].served>
      reference.stats.districts[secondaryDistrict].kpis[metric].served,id);
  }
});

test('the integrated pass reaches three districts and charges the transport budget',async()=>{
  const id = 'rail-commuter-pass';
  const {state,eventPlan} = await opening(2036);
  const initialQuote = rules.quote(state,{eventPlan});
  const quote = rules.previewMeasure(state,id,null,{eventPlan});
  assert.equal(quote.project.sector,'transport');
  assert.equal(quote.finance.sectors.transport.total-initialQuote.finance.sectors.transport.total,2130);
  const planned = {...state,draft:{...state.draft,measures:[{measureId:id,siteId:null,promise:null}]}};
  const signed = close(planned,eventPlan);
  const reference = close(state,eventPlan);
  assert.deepEqual(Object.keys(signed.projects[0].targets),['industrial','suburb','capital']);
  for (const district of Object.keys(signed.projects[0].targets)) {
    assert.ok(signed.population.derived.municipalities[district].mobility>
      reference.population.derived.municipalities[district].mobility,district);
  }
});

test('family support reaches every participating district after approval',async()=>{
  const {state,eventPlan} = await opening(2026);
  const planned = {...state,draft:{...state.draft,measures:[{measureId:'family-grant',siteId:null,promise:null}]}};
  const supported = close(planned,eventPlan);
  const reference = close(state,eventPlan);
  assert.equal(Object.keys(supported.projects[0].targets).length,5);
  for (const id of sourceDistricts) {
    const actual = supported.population.derived.municipalities[id].familySupport;
    const baseline = reference.population.derived.municipalities[id].familySupport;
    assert.ok(actual>baseline,id);
  }
});

test('renewal continues the stored footprint of a previously approved local programme',async()=>{
  const id = 'family-grant';
  const first = await opening(2026);
  const approved = rules.previewMeasure(first.state,id,null,{eventPlan:first.eventPlan}).project;
  // Restore a programme approved when its whole allocation still went to New Bank.
  const {projection,draftMeasureId,...project} = approved;
  const {targets,...serviceEffect} = project.serviceEffect;
  const saved = plain({...project,serviceEffect,targets:{suburb:1},paidYears:[2026,2027,2028]});
  const {state,eventPlan} = await opening(2029);
  state.projects = [saved];
  const renewal = rules.availableMeasures(state).find(row=>row.projectId===saved.id);
  assert.equal(renewal.kind,'renew');
  const quote = rules.previewMeasure(state,renewal.id,null,{eventPlan});
  assert.equal(quote.ok,true);
  assert.deepEqual(plain(quote.project.targets),{suburb:1});
  assert.ok(programmes.find(row=>row.id===id).serviceEffect.targets.north>0);
  const planned = {...state,draft:{...state.draft,measures:[{measureId:renewal.id,siteId:null,promise:null}]}};
  assert.deepEqual(plain(close(planned,eventPlan).projects[0].targets),{suburb:1});
});
