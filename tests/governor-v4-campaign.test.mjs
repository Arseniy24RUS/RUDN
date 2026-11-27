import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
import {G as existingGame} from './helpers/governor-gameplay.mjs';

const src=new URL('../site/apps/governor/src/',import.meta.url);
const renderer=vm.createContext({
  GovernorGame:{DATA:existingGame.DATA,Population:existingGame.Population},
  crypto:webcrypto,TextEncoder
});
for (const file of ['v3-event-bank.js','v3-events.js','v4-catalog.js','v4-campaign.js','v3-rules.js']) {
  vm.runInContext(await readFile(new URL(file,src),'utf8'),renderer,{filename:file});
}
const {V4Campaign:C,V3Rules:R,V3Events:E}=renderer.GovernorGame;
const schoolMap=JSON.parse(await readFile(new URL('../site/apps/governor/data/v3-school-map.json',import.meta.url),'utf8'));
const make=()=>R.create({attemptId:'campaign-fixture-v4',schoolMap,rulesVersion:'governor-v4.0'});
const plain=value=>JSON.parse(JSON.stringify(value));

test('four distinct phase portfolios contain 89 localized playable policies',()=>{
  const terms=[2026,2031,2036,2041].map(year=>C.available(year));
  assert.deepEqual(terms.map(rows=>rows.length),[22,22,23,22]);
  const measures=terms.flat();
  assert.equal(new Set(measures.map(row=>row.id)).size,89);
  for (const [index,rows] of terms.entries()) {
    const state={...make(),year:2026+index*5};
    assert.equal(R.availableMeasures(state).length,rows.length);
    assert.equal(C.chapter(state.year).number,index+1);
    assert.equal(C.available(state.year+4),rows);
    assert.equal(C.chapter(state.year).satisfactionTarget,60+index*2);
    for (const row of rows) {
      assert.ok(Number.isInteger(row.cost)&&row.cost>0);
      assert.ok(Number.isInteger(row.annualOpex)&&row.annualOpex>0);
      assert.ok(row.years>=2&&Object.keys(row.kpiEffects).length>=2);
      for (const language of ['ru','en','zh']) {
        assert.ok(row.labels[language]&&row.description[language]);
      }
      assert.equal(R.sitesFor(state,row).length,row.siteIds.length);
      if (row.kind==='capital') assert.ok(row.lag>0&&row.siteIds.length>=2);
      const effectId=row.serviceEffect.measureId;
      assert.ok(effectId?existingGame.Population.OUTPUTS[effectId]:Object.keys(row.serviceEffect.outputs).length);
    }
  }
});

test('the gradebook rounds fractional campaign points up and preserves integers',()=>{
  const points=[0,0.01,0.8,3,4,4.01,4.83,5];
  assert.deepEqual(points.map(C.journalPoints),[0,1,1,3,4,5,5,5]);
});

function gradeFixture({goodKpi,goodSupport}) {
  const state=make();
  const bad=Object.fromEntries(C.METRICS.map(m=>[m.id,m.inverse?m.max:m.min]));
  const history=[...Array(20)].map((_,i)=>{
    const year=2026+i, term=C.chapter(year);
    return {year,campaignKpis:goodKpi.includes(term.number)?term.targets:bad,
      referenceCampaignKpis:state.initialCampaignKpis,
      stats:{support:goodSupport.includes(term.number)?term.satisfactionTarget:58}};
  });
  return {...state,year:2045,completed:true,history,campaignKpis:history.at(-1).campaignKpis};
}

test('the four reported results use a single winning path, never a patchwork of years',()=>{
  const state=gradeFixture({goodKpi:[1,2],goodSupport:[3,4]});
  const grade=C.score(state);
  assert.equal(grade.winning,'satisfaction');
  assert.deepEqual(plain(grade.paths),{kpi:1.5,satisfaction:3.5});
  assert.equal(grade.points,3.5);
  assert.deepEqual(plain(grade.criteria.map(row=>row.maxPoints)),[.5,1,1.5,2]);
  assert.deepEqual(plain(grade.criteria.map(row=>row.points)),[0,0,1.5,2]);
  assert.equal(C.score(gradeFixture({goodKpi:[1,2,3,4],goodSupport:[]})).points,5);
  assert.equal(C.score(gradeFixture({goodKpi:[],goodSupport:[1,2,3,4]})).points,5);
  assert.equal(C.score({...state,handover:true}).points,3.5);
  const partial={...state,year:2027,completed:false,history:state.history.slice(0,1)};
  assert.equal(C.score(partial).points,.1);
  assert.equal(C.status(partial,1).closed,false);
  assert.equal(C.status(partial,2).entries.every(row=>row.actual===null),true);
});

async function sign(state,entries) {
  const {attemptId,year,revision}=state;
  const old=state.history.map(row=>row.event);
  const event=await E.open({attemptId,year,drawKey:'00'.repeat(32),
    snapshot:{revision,tags:E.baselineTags},ledger:old});
  const ledger=[...old,event];
  const preview={...state,event,draft:{...state.draft,eventChoice:'base',
    measures:entries.map(([measureId,siteId])=>({measureId,siteId,promise:null}))}};
  const eventPlan=E.year({attemptId,year,ledger,picks:{}});
  const quote=R.quote(preview,{eventPlan});
  assert.ok(quote.ok,JSON.stringify(quote.errors));
  return R.commit(preview,{expectedRevision:revision,signature:quote.signature,eventPlan,baselineEventPlan:eventPlan});
}

test('year history separates funded work from a matching reference and from later construction',async()=>{
  const first=make();
  assert.equal(Object.keys(first.campaignKpis).length,12);
  assert.equal(first.campaignKpis.tfr>1.1,true);
  assert.equal(first.campaignKpis.life>70,true);
  assert.equal(first.campaignKpis.population,100);

  const permitOnly=await sign(first,[['market-permit-desk',null]]);
  const year1=await sign(first,[['school-campus','yard'],['market-permit-desk',null]]);
  assert.ok(year1.campaignKpis.sme_income>year1.baseline.campaignKpis.sme_income);
  assert.equal(year1.campaignKpis.education,permitOnly.campaignKpis.education);
  const year2=await sign(year1,[]);
  const year3=await sign(year2,[]);
  assert.ok(year3.campaignKpis.education>year3.baseline.campaignKpis.education);
  assert.equal(year3.history[0].projects.find(row=>row.measureId==='school-campus').status,'foundation');
  assert.equal(year3.history[2].projects.find(row=>row.measureId==='school-campus').status,'open');
  assert.deepEqual(year3.campaignKpis,year3.history[2].campaignKpis);
  assert.deepEqual(year3.initialCampaignKpis,first.campaignKpis);
  const term=C.status(year3,1);
  assert.equal(term.yearsClosed,3);
  assert.ok(term.entries.find(row=>row.id==='education').delta>0);
});
