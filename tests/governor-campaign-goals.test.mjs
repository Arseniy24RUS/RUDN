import assert from 'node:assert/strict';
import {test} from 'node:test';
import {G,E,fresh,json,defer} from './helpers/governor-gameplay.mjs';

test('all four courses declare bounded goals before a decision in every scenario',()=>{
  for(const scenario of G.DATA.scenarios)for(const course of G.CampaignStrategy.COURSES){
    const state=fresh({scenarioId:scenario.id,strategyId:course.id});
    assert.ok(E.validateState(state));
    for(const year of [5,10,15,20]){
      const goals=G.CampaignStrategy.goals(state,year);
      assert.equal(goals.length,2);
      for(const goal of goals){assert.ok(goal.target>=goal.initial&&goal.target<=1);assert.ok(goal.value>=0&&goal.value<=1);}
    }
    for(const locale of ['ru','en','zh'])assert.ok(course.title[locale]&&course.description[locale]);
  }
});

test('course previews and repeated reviews do not mutate a saved campaign or stack capacity',()=>{
  const state=fresh({strategyId:'services'});
  while(state.history.length<5)defer(state);
  assert.equal(state.campaignStrategy.reviews.length,1);
  const before=JSON.stringify(state);
  for(let i=0;i<5;i++){
    G.CampaignStrategy.snapshot(state);
    assert.equal(G.CampaignStrategy.review(state,5),null);
  }
  assert.equal(JSON.stringify(state),before);
  assert.equal(state.finance.adminCapacity,state.campaignStrategy.baseCapacity+state.campaignStrategy.reviews[0].capacityDelta);
});

test('malformed course evidence and capacity cannot survive an imported save',()=>{
  const original=fresh({strategyId:'generations'});
  while(original.history.length<5)defer(original);
  const mutations=[
    s=>delete s.campaignStrategy.reviews[0].goals,
    s=>s.campaignStrategy.reviews[0].goals[0].value=Infinity,
    s=>s.campaignStrategy.reviews[0].goals[0].target=.999,
    s=>s.campaignStrategy.reviews[0].support='high',
    s=>s.campaignStrategy.reviews[0].sustainable='yes',
    s=>s.campaignStrategy.reviews[0].year=10,
    s=>s.finance.adminCapacity+=5,
    s=>s.campaignStrategy.baseline.care=-.5
  ];
  for(const mutate of mutations){const state=json(original);mutate(state);assert.equal(E.validateState(state),false);assert.equal(E.restoreState(state),null);}
});

test('a legacy campaign has no newly invented strategic goal or administrative penalty',()=>{
  const state=fresh({campaignMode:'guided'});
  state.agenda.version=G.Agenda.LEGACY_VERSION;
  const capacity=state.finance.adminCapacity;
  for(let i=0;i<6;i++)defer(state);
  assert.equal(state.campaignStrategy,undefined);
  assert.equal(state.finance.adminCapacity,capacity);
  assert.ok(E.validateState(state));
});
