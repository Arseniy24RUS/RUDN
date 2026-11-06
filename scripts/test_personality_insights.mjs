import assert from 'node:assert/strict';
import {PERSONALITY_FACETS} from '../site/apps/career/assets/personality-model.mjs';
import {expressionBand,suggestTeamRoles,TEAM_ROLES} from '../site/apps/career/assets/personality-insights.mjs';

const profile=(base=3,overrides={})=>({facets:Object.fromEntries(PERSONALITY_FACETS.map(({id})=>[id,{mean:overrides[id]??base}]))});
assert.deepEqual(suggestTeamRoles(profile()),{kind:'exploratory',roles:[]},'Neutral responses cannot produce an arbitrary leading role.');
assert.deepEqual(suggestTeamRoles(profile(1)),{kind:'exploratory',roles:[]},'Low endorsement is not renormalised into a high role match.');
const uniform=suggestTeamRoles(profile(5));
assert.equal(uniform.kind,'balanced');
assert.equal(uniform.roles.length,TEAM_ROLES.length,'Equivalent roles are retained together.');
const leader=suggestTeamRoles(profile(2,{E3:4,C1:4,C3:4}));
assert.equal(leader.kind,'differentiated');
assert.deepEqual(leader.roles.map(role=>role.id),['coordinator']);
for(const facet of ['E3','C1','C3']){
  const result=suggestTeamRoles(profile(5,{[facet]:1}));
  assert.equal(result.roles.some(role=>role.id==='coordinator'),false,'A low core trait must not be hidden by averaging: '+facet);
}
assert.equal(suggestTeamRoles(profile(5,{A4:1})).roles.some(role=>role.id==='supporter'),false);
const edge=suggestTeamRoles(profile(3.5,{C2:3.25,O5:3.25,A3:3.25,C4:3.25}));
assert.deepEqual(edge,{kind:'exploratory',roles:[]},'Near-flat scores do not acquire a single winner by crossing the display threshold.');
const base=profile(4,{E3:4.5,C1:4.5,C3:4.5,O1:3,O4:3,O5:3});
const privateTraits=structuredClone(base);
for(const id of ['N1','N2','N3','N4','N5','N6','O6'])privateTraits.facets[id].mean=1;
assert.deepEqual(suggestTeamRoles(base),suggestTeamRoles(privateTraits),'Political beliefs and emotional sensitivity do not affect team roles.');
assert.equal(expressionBand(2.5),'mid');
assert.equal(expressionBand(3.5),'mid');
assert.equal(expressionBand(4),'high');
assert.throws(()=>suggestTeamRoles(profile(3,{E3:NaN})),TypeError);
console.log('PASS personality role interpretation: neutral, low, balanced, core-trait floor, ties, threshold boundary and excluded sensitive facets.');
