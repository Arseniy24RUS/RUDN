/** Reproducible smoke agents: these are feasible examples, not optimal policies.
 * Usage: node scripts/test_governor_balance.mjs [optional-results.json]
 * Four scenarios, twelve seeds plus the UI default, strict budgets and a mandate.
 */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {G,campaign} from '../tests/helpers/governor-gameplay.mjs';
import {assessCampaign} from '../site/apps/governor/platform-contract.js';
const rows=[];
for(const scenario of G.DATA.scenarios)for(const seed of ['RUDN-2026',...Array.from({length:12},(_,i)=>`BALANCE-${i+1}`)]){
  for(const policy of ['defer','five','planned']){
    const state=campaign(scenario.id,seed,policy,'decisions','services'),score=assessCampaign(state,G);
    const row={scenario:scenario.id,seed,policy,completed:state.completed,turns:state.history.length,points:score.points,
      launches:state.history.filter(r=>!r.deferred).length,renewals:state.finance.portfolio.reduce((n,p)=>n+(p.renewals?.length||0),0),
      support:state.stats.support,development:state.stats.development,treasury:state.finance.treasury,debt:state.finance.debt,
      aid:state.finance.totalEmergencyTransfers,serviceGain:score.comparison.serviceGain,
      criteria:score.criteria.map(c=>({id:c.id,points:c.points,maxPoints:c.maxPoints})),
      reviews:state.campaignStrategy.reviews.map(r=>({year:r.year,status:r.status,progress:r.progress})),
      sequence:state.history.map(r=>({turn:r.turn,mission:r.missionId,action:r.actionId,funding:r.fundingMode}))};
    rows.push(row);
    assert.ok(score.points>=0&&score.points<=5);
    if(policy==='defer')assert.equal(score.criteria.find(c=>c.id==='territories').rawPoints,0);
    if(policy==='five')assert.ok(score.points<4,`${scenario.id}/${seed} five-then-wait: ${score.points}`);
    if(policy==='planned')assert.ok(state.completed,`${scenario.id}/${seed}: planned policy must finish a default strict term`);
  }
}
const summaries=[];
for(const scenario of G.DATA.scenarios)for(const policy of ['defer','five','planned']){
  const selected=rows.filter(r=>r.scenario===scenario.id&&r.policy===policy);
  summaries.push({scenario:scenario.id,policy,runs:selected.length,completed:selected.filter(r=>r.completed).length,
    minScore:Math.min(...selected.map(r=>r.points)),maxScore:Math.max(...selected.map(r=>r.points)),
    minLaunches:Math.min(...selected.map(r=>r.launches)),maxLaunches:Math.max(...selected.map(r=>r.launches)),
    maxAid:Math.max(...selected.map(r=>r.aid)),default: selected.find(r=>r.seed==='RUDN-2026')});
}
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify({model:'persistent-agenda-2.0',budgetMode:'decisions',strategyId:'services',summaries,rows},null,2));
console.log(JSON.stringify(summaries.map(({default:sample,...s})=>({...s,defaultScore:sample.points,defaultLaunches:sample.launches,defaultRenewals:sample.renewals})),null,2));
