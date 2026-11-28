import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
import {G as existingGame} from './helpers/governor-gameplay.mjs';

const {DATA,Population}=existingGame;
const sandbox=vm.createContext({GovernorGame:{DATA,Population},crypto:webcrypto,TextEncoder});
const directory=new URL('../site/apps/governor/',import.meta.url);
for(const file of ['v3-event-bank','v3-events','v4-catalog','v4-campaign','v3-rules']){
  const source=await readFile(new URL('src/'+file+'.js',directory),'utf8');
  vm.runInContext(source,sandbox,{filename:file});
}
const {V3Rules:rules,V3Events:events}=sandbox.GovernorGame;
const schoolMap=JSON.parse(await readFile(new URL('data/v3-school-map.json',directory),'utf8'));
const start=map=>rules.create({attemptId:'spatial-balance-test',schoolMap:map,rulesVersion:rules.V4_RULES_VERSION});
const plain=value=>JSON.parse(JSON.stringify(value));
const sum=values=>values.reduce((total,value)=>total+value,0);
const select=(measureId,siteId=null)=>({measureId,siteId,promise:null});

async function open(state){
  const ledger=state.history.map(row=>row.event);
  const event=await events.open({attemptId:state.attemptId,year:state.year,drawKey:'00'.repeat(32),
    snapshot:{revision:state.revision,tags:events.baselineTags},ledger});
  return {...state,event};
}

function sign(state,measures){
  const ledger=[...state.history.map(row=>row.event),state.event];
  const eventPlan=events.year({attemptId:state.attemptId,year:state.year,ledger,picks:{}});
  const draft={...state.draft,eventChoice:'base',measures};
  const quote=rules.quote({...state,draft},{eventPlan});
  assert.equal(quote.ok,true,JSON.stringify(quote.errors));
  return rules.commit({...state,draft},{expectedRevision:state.revision,signature:quote.signature,eventPlan,baselineEventPlan:eventPlan});
}

test('bus places track the unmet need, independently of renamed or reordered neighbourhoods',async()=>{
  const renamed=structuredClone(schoolMap);
  renamed.zones.find(row=>row.id==='southern').id='aa-southern';
  renamed.zones.reverse();
  const A=sign(await open(start(schoolMap)),[select('school-bus')]).stats.school;
  const B=sign(await open(start(renamed)),[select('school-bus')]).stats.school;
  assert.equal(A.transported,B.transported);
  assert.equal(A.served,B.served);
  assert.equal(A.transported,sum(A.routes.map(row=>row.pupils)));
  assert.equal(A.served,sum(Object.values(A.allServedByZone)));
  assert.equal(A.travel.lowestZoneCoveragePct,B.travel.lowestZoneCoveragePct);
  assert.equal(A.travel.pupilMinutesOneWay,A.pupilMinutesOneWay+sum(A.routes.map(row=>row.minutes*row.pupils)));
  const remaining=A.demand-A.localServed;
  assert.ok(remaining>A.transported);
  for(const [id,demand] of Object.entries(A.demandByZone)){
    const equivalent=id==='southern'?'aa-southern':id;
    const expected=A.transported*(demand-A.servedByZone[id])/remaining;
    const added=A.allServedByZone[id]-A.servedByZone[id];
    assert.equal(A.allServedByZone[id],B.allServedByZone[equivalent]);
    assert.equal(A.travel.pupilMinutesByZone[id],B.travel.pupilMinutesByZone[equivalent]);
    assert.ok(Math.abs(added-expected)<1);
    assert.ok(added>=0&&A.allServedByZone[id]<=demand);
    if(id==='southern')assert.ok(added>0&&added<demand);
  }
});

test('a school can shorten trips while leaving total coverage unchanged',async()=>{
  const first=await open(start(schoolMap));
  let shifts=sign(first,[select('second-shift')]);
  let withSchool=sign(first,[select('second-shift'),select('school-campus','yard')]);
  for(const year of [2027,2028]){
    shifts=await open(shifts);
    withSchool=await open(withSchool);
    const renew=year===2027?[select(rules.availableMeasures(shifts).find(row=>row.kind==='renew').id)]:[];
    shifts=sign(shifts,renew);
    withSchool=sign(withSchool,renew);
  }
  assert.equal(withSchool.stats.school.served,shifts.stats.school.served);
  assert.ok(withSchool.stats.school.travel.meanTripMinutesServed<shifts.stats.school.travel.meanTripMinutesServed);
  const measure=withSchool.history.at(-1).projects.find(row=>row.measureId==='school-campus');
  assert.equal(measure.status,'open');
});

test('life expectancy is recorded from the same annual mortality risks as births and deaths',()=>{
  const create=()=>({scenarioId:'balanced',population:Population.create('balanced'),turnIndex:0,recordLifeExpectancy:true,finance:{portfolio:[]}});
  const healthy=create(),epidemic=create();
  epidemic.population.shock={districtId:'capital',gap:4,key:'health'};
  const noShock=Population.advanceYear(healthy),shock=Population.advanceYear(epidemic);
  assert.equal(shock.gap,0);
  assert.equal(shock.internalNet,0);
  assert.equal(shock.closing,shock.opening+shock.births-shock.deaths+shock.externalIn-shock.externalOut);
  assert.ok(shock.municipalities.capital.deaths>noShock.municipalities.capital.deaths);
  assert.ok(shock.municipalities.capital.modelLifeYears<noShock.municipalities.capital.modelLifeYears);
  for(const [id,row] of Object.entries(shock.municipalities)){
    if(id==='capital')continue;
    const control=noShock.municipalities[id];
    assert.deepEqual(plain([row.deaths,row.modelLifeYears]),plain([control.deaths,control.modelLifeYears]));
  }
  const exposed=Object.values(shock.municipalities);
  assert.equal(Population.lifeExpectancy(epidemic.population),sum(exposed.map(row=>row.modelLifeYears*row.opening))/shock.opening);
});
