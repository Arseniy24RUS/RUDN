/** Every declared course must have an attainable mandate milestone.
 * These fixed, budget-aware examples do not establish optimal play or ensure
 * that every final target can be met in every scenario without adaptation.
 * Usage: node scripts/test_governor_courses.mjs [optional-results.json]
 */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {G,campaign} from '../tests/helpers/governor-gameplay.mjs';
import {COURSE_PLANS} from '../tests/helpers/governor-course-plans.mjs';
import {assessCampaign} from '../site/apps/governor/platform-contract.js';
const rows=[];
for(const scenario of G.DATA.scenarios)for(const course of G.CampaignStrategy.COURSES){
  const state=campaign(scenario.id,'RUDN-2026',COURSE_PLANS[course.id],'decisions',course.id);
  assert.ok(state.completed,`${scenario.id}/${course.id}: incomplete term`);
  assert.ok(state.campaignStrategy.reviews.some(r=>r.status==='secured'),`${scenario.id}/${course.id}: no secured milestone`);
  rows.push({scenario:scenario.id,course:course.id,complete:state.completed,score:assessCampaign(state,G).points,
    support:state.stats.support,aid:state.finance.totalEmergencyTransfers,
    finalGoals:G.CampaignStrategy.goals(state,20).map(g=>({key:g.key,value:g.value,target:g.target,met:g.met})),
    reviews:state.campaignStrategy.reviews,
    sequence:state.history.map(r=>({year:r.turn,mission:r.missionId,action:r.actionId,funding:r.fundingMode,placement:r.placement?.id||null})),
    renewals:state.finance.portfolio.map(p=>({action:p.actionId,renewed:p.renewals?.map(r=>r.turn)||[]}))});
}
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify({budgetMode:'decisions',seed:'RUDN-2026',plans:COURSE_PLANS,rows},null,2));
console.log(JSON.stringify(rows.map(row=>({scenario:row.scenario,course:row.course,score:row.score,
  secured:row.reviews.filter(r=>r.status==='secured').map(r=>r.year),finalGoals:row.finalGoals})),null,2));
