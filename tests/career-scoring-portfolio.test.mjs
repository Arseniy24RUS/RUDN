import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AGENCY_AGGREGATION, SCALE_IDS, CONDITION_IDS, scoreAuthority, rankAuthorities,
  computeRoleProfile, buildSectorPreference} from '../site/apps/career/assets/scoring.mjs';
// Browser storage is irrelevant to these pure calculations; only module key setup uses it.
globalThis.__careerHost = {storageKey:name=>`synthetic-scoring-test:${name}`};
const {explainAuthority} = await import('../site/apps/career/assets/decision-model.mjs');
const {rankPublicService,publicServiceReport} = await import('../site/apps/career/assets/public-service-model.mjs');
const {MODEL_VERSION,SCORING_REVISION} = await import('../site/apps/career/assets/versions.mjs');

const read = name => JSON.parse(fs.readFileSync(new URL(`../site/apps/career/data/${name}.json`, import.meta.url), 'utf8'));
const data = Object.fromEntries(['authorities','tracks','questions','sectors'].map(name => [name, read(name)]));
const trackMap = new Map(data.tracks.map(track => [track.id, track]));
const inputs = {answers: Object.fromEntries(data.questions.map(q => [q.id, 3])),
  prioritySectors:['DIG','FIN','ADM','INT'], lowPrioritySectors:['AGR','EMR'],
  conditions:{FIELD:3,SCHEDULE:3,FORMAL:3,SECURITY:3}, focusAreas:{}};
const rank = (input = inputs, overrides = {}) => rankAuthorities({...data,...input,...overrides});
const context = input => ({roleProfile:computeRoleProfile(input.answers,data.questions),
  sectorPreferences:buildSectorPreference(input.prioritySectors,input.lowPrioritySectors,data.sectors),
  conditions:input.conditions,focusAreas:input.focusAreas});
const close = (a,b,message='') => assert.ok(Math.abs(a-b)<1e-9, `${message}: ${a} != ${b}`);
const source = data.authorities.find(a => a.id === 'mincifry');
const singleScores = (authority, input = inputs) => authority.tracks.map(link =>
  scoreAuthority({...authority,tracks:[link]},context(input),trackMap).rawScore);
const tieGroups = values => {
  const groups = new Map();
  for (const value of values) {const key=value.toFixed(8);groups.set(key,(groups.get(key)||0)+1);}
  return [...groups.values()].sort((a,b)=>b-a);
};

test('an institution includes its best path and the mean of all distinct paths', () => {
  const values=singleScores(source), mean=values.reduce((a,b)=>a+b,0)/values.length;
  const item=scoreAuthority(source,context(inputs),trackMap);
  close(item.rawScore,.7*Math.max(...values)+.3*mean);
  close(item.bestPathScore,Math.max(...values));close(item.pathMeanScore,mean);
  assert.equal(item.pathCount,source.tracks.length);
  assert.deepEqual(item.aggregation,{bestPathWeight:.7,portfolioWeight:.3});
});

test('a weaker additional real path changes the portfolio but not the best path', () => {
  const links=source.tracks.map(link=>({link,score:singleScores({...source,tracks:[link]})[0]})).sort((a,b)=>b.score-a.score);
  const best=scoreAuthority({...source,tracks:[links[0].link]},context(inputs),trackMap);
  const both=scoreAuthority({...source,tracks:[links[0].link,links.at(-1).link]},context(inputs),trackMap);
  close(best.rawScore,both.bestPathScore);assert.ok(both.rawScore<best.rawScore);
  close(both.rawScore,.85*best.rawScore+.15*links.at(-1).score);
});

test('one real path retains the path formula without a breadth bonus or penalty', () => {
  for (const authority of data.authorities) for (const link of authority.tracks) {
    const item=scoreAuthority({...authority,tracks:[link]},context(inputs),trackMap);
    const factor=link.importance>=3?1:link.importance===2?.96:.91;
    close(item.rawScore,100*(.40*item.roleFit+.45*item.sectorFit+.15*item.conditionFit)*factor);
    close(item.rawScore,item.bestPathScore);assert.equal(item.pathCount,1);
  }
});

test('duplicating paths, metadata and translated labels does not boost the score', () => {
  const item=scoreAuthority(source,context(inputs),trackMap);
  const copy=structuredClone(source.tracks[0]);copy.title='Synthetic duplicate';copy.sourceIds=['different-label'];
  copy.sectors.reverse();
  const duplicated=scoreAuthority({...source,tracks:[...source.tracks,copy,...source.tracks]},context(inputs),trackMap);
  close(item.rawScore,duplicated.rawScore);assert.equal(item.pathCount,duplicated.pathCount);
  assert.deepEqual(item.contributions,duplicated.contributions);
});

test('renaming an institution or a repeated template does not change its index', () => {
  const base=scoreAuthority(source,context(inputs),trackMap);
  const renamed=scoreAuthority({...source,id:'arbitrary-id',name:'Synthetic title'},context(inputs),trackMap);
  close(base.rawScore,renamed.rawScore);
  const link=source.tracks[0], clonedMap=new Map(trackMap);
  clonedMap.set('DUPLICATE',{...trackMap.get(link.id),id:'DUPLICATE'});
  const duplicate=scoreAuthority({...source,tracks:[...source.tracks,{...link,id:'DUPLICATE'}]},context(inputs),clonedMap);
  close(base.rawScore,duplicate.rawScore);assert.equal(base.pathCount,duplicate.pathCount);
});

test('authority and path permutations preserve scores and displayed ranking', () => {
  const baseline=rank();
  const permuted=rank(inputs,{authorities:data.authorities.slice().reverse().map(a=>({...a,tracks:a.tracks.slice().reverse()})),tracks:data.tracks.slice().reverse()});
  assert.deepEqual(baseline.ranked.map(x=>[x.id,x.rawScore,x.score]),permuted.ranked.map(x=>[x.id,x.rawScore,x.score]));
});

test('identical profiles honestly tie; identifiers only order an exact tie', () => {
  const pair=rank(inputs,{authorities:[{...source,id:'z-copy'},{...source,id:'a-copy'}]}).ranked;
  assert.deepEqual(pair.map(x=>x.id),['a-copy','z-copy']);
  assert.equal(pair[0].rawScore,pair[1].rawScore);assert.equal(pair[0].score,pair[1].score);
});

test('all catalog scores are bounded and remain between their path mean and best', () => {
  for(const item of rank().ranked) {
    assert.ok(item.rawScore>=0&&item.rawScore<=100);
    assert.ok(item.rawScore>=item.pathMeanScore-1e-9&&item.rawScore<=item.bestPathScore+1e-9);
    assert.equal(item.score,Math.round(item.rawScore*10)/10);
  }
});

test('higher readiness cannot lower any catalog index', () => {
  for(const condition of CONDITION_IDS) {
    let previous=null;
    for(let willingness=1;willingness<=5;willingness++) {
      const current=new Map(rank({...inputs,conditions:{...inputs.conditions,[condition]:willingness}}).ranked.map(x=>[x.id,x.rawScore]));
      if(previous)for(const [id,value] of current)assert.ok(value>=previous.get(id)-1e-9,`${id}/${condition}`);
      previous=current;
    }
  }
});

test('one answer step respects the unchanged analytic 3.2234-point bound', () => {
  const baseline=new Map(rank().ranked.map(x=>[x.id,x.rawScore]));
  for(const question of data.questions)for(const direction of [-1,1]) {
    const next={...inputs,answers:{...inputs.answers,[question.id]:3+direction}};
    for(const item of rank(next).ranked)assert.ok(Math.abs(item.rawScore-baseline.get(item.id))<=3.2234,`${question.id}/${direction}/${item.id}`);
  }
});

test('the real digital fixture no longer collapses to the old 16/21 matching groups', () => {
  const oldScores=data.authorities.map(a=>Math.max(...singleScores(a)));
  const oldTop=Math.max(...oldScores);assert.equal(oldScores.filter(score=>Math.abs(score-oldTop)<1e-9).length,16);
  assert.equal(tieGroups(oldScores)[0],21);
  const actual=rank().ranked;assert.equal(tieGroups(actual.map(x=>x.rawScore))[0],2);
  assert.ok(new Set(actual.map(x=>x.rawScore.toFixed(8))).size>=72);
  assert.ok(actual[0].rawScore>actual[1].rawScore);
});

test('every explanation reconciles overall contributions with the displayed index', () => {
  const existing=rank();
  for(const authority of data.authorities) {
    const explanation=explainAuthority(authority.id,inputs,data,existing);
    close(explanation.raw.reduce((a,b)=>a+b,0),explanation.item.rawScore);
    close(explanation.contributions.reduce((a,b)=>a+b,0),explanation.item.score);
    close(explanation.bestPathScore,explanation.item.bestPathScore);
    close(Object.values(explanation.bestPathContributions).reduce((a,b)=>a+b,0),explanation.bestPathScore);
  }
});

test('missing or unknown paths use explicit neutral fallback, not invented opportunities', () => {
  const empty=scoreAuthority({...source,tracks:[]},context(inputs),trackMap);
  const unknown=scoreAuthority({...source,tracks:[{id:'NOT_IN_CATALOG'}]},context(inputs),trackMap);
  close(empty.rawScore,unknown.rawScore);
  assert.equal(empty.pathCount,0);assert.equal(empty.bestPathScore,null);assert.equal(empty.pathMeanScore,null);
  close(empty.rawScore,Object.values(empty.contributions).reduce((a,b)=>a+b,0));
});

test('regional and other public institutions aggregate the same way while retaining individual options', () => {
  const registry=read('public-service');const result=rankPublicService(registry,data,inputs);
  assert.equal(result.ranked.length,registry.records.length);
  for(const item of result.ranked) {
    assert.equal(item.options.length,item.tracks.length);
    const expected=scoreAuthority({id:item.id,tracks:item.tracks},context(inputs),trackMap);
    close(item.match.rawScore,expected.rawScore);assert.equal(item.match.link.id,expected.track.id);
    close(item.match.bestPathScore,Math.max(...item.options.map(option=>option.rawScore)));
  }
});

test('scoring never mutates answers, institution records or templates', () => {
  const before=JSON.stringify({data,inputs});rank();
  assert.equal(JSON.stringify({data,inputs}),before);assert.ok(Object.isFrozen(AGENCY_AGGREGATION));
  assert.equal(SCALE_IDS.length,9);
});

test('public-service export identifies the calculation rather than registry metadata', () => {
  const registry={...read('public-service'),modelVersion:'8.0.0'};
  const ranked=rankPublicService(registry,data,inputs).ranked;
  const report=publicServiceReport(registry,ranked);
  assert.equal(report.modelVersion,MODEL_VERSION);
  assert.equal(report.scoringRevision,SCORING_REVISION);
  assert.deepEqual(report.items.map(x=>x.index),ranked.map(x=>x.match.score));
});
