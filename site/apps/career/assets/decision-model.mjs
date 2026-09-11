import {sanitizeFocusAreas,topicAdjustment} from './topics.mjs';
/** Read-only interpretation of the existing model. No new weights or hidden reranking. */
import {rankAuthorities, scoreAuthority, conditionDetails, CONDITION_IDS, SCALE_IDS} from './scoring.mjs';
import {inputsFromState, validateInputs} from './scenarios.mjs';

export const CONTRIBUTION_WEIGHTS = Object.freeze({role:40, sector:45, conditions:15});
export const CLOSE_SCORE_DISTANCE = 2.5;
const core = item => !['corporation','fund'].includes(item.entityType);
const factorFor = importance => importance >= 3 ? 1 : importance === 2 ? .96 : .91;
export const governmentRanking = result => result.ranked.filter(core).map((x,i)=>({...x,rank:i+1}));
export function checkedInputs(state, data) {
  const input = inputsFromState(state);
  const errors = validateInputs(input, data.questions, data.sectors);
  if(errors.length) throw new Error(`incomplete-input: ${errors.join(', ')}`);
  return input;
}
export function inputFingerprint(state, data) {
  const v=checkedInputs(state,data);
  return JSON.stringify([data.questions.map(q=>v.answers[q.id]),v.prioritySectors,v.lowPrioritySectors,CONDITION_IDS.map(id=>v.conditions[id]),v.focusAreas]);
}
export function rankInput(state, data) { return rankAuthorities({...data,...checkedInputs(state,data)}); }

// Display tenths with a largest-remainder adjustment so the three visible numbers add up.
// Raw values remain available; this adjusts presentation only, never the ranking.
export function displayContributions(values, displayedTotal) {
  const tenths=values.map(v=>Math.floor(v*10+1e-10));
  let remainder=Math.round(displayedTotal*10)-tenths.reduce((a,b)=>a+b,0);
  const order=values.map((v,i)=>({i,remainder:v*10-tenths[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  if(remainder<0||remainder>values.length)throw new Error('contribution-rounding');
  for(let i=0;i<remainder;i++)tenths[order[i].i]++;
  return tenths.map(v=>v/10);
}

export function explainAuthority(authorityId, state, data, existingResult=null) {
  const inputs=checkedInputs(state,data);
  const result=existingResult||rankAuthorities({...data,...inputs});
  const authority=data.authorities.find(a=>a.id===authorityId);
  if(!authority)throw new Error('unknown-authority');
  const item=result.ranked.find(a=>a.id===authorityId);
  const trackMap=new Map(data.tracks.map(t=>[t.id,t]));
  const tracks=authority.tracks.map(link=>{
    const scored=scoreAuthority({...authority,tracks:[link]},result.context,trackMap);
    return {id:link.id,importance:link.importance,factor:factorFor(link.importance),score:scored.score,
      roleFit:scored.roleFit,selected:item.track?.id===link.id};
  }).sort((a,b)=>b.score-a.score||Number(b.selected)-Number(a.selected));
  const factor=factorFor(item.importance);
  const raw=[40*item.roleFit*factor,45*item.sectorFit*factor,15*item.conditionFit*factor];
  const contributions=displayContributions(raw,item.score);
  const pathSectors=item.pathSectors||authority.sectors;
  const sectorRows=pathSectors.map(s=>({id:s.id,weight:s.weight,preference:result.sectorPreferences[s.id],
    adjustment:topicAdjustment(s.id,{topics:item.pathTopics||{}},inputs.focusAreas),
    priority:inputs.prioritySectors.indexOf(s.id)+1,lowPriority:inputs.lowPrioritySectors.indexOf(s.id)+1}));
  for(const row of sectorRows)row.candidate=row.weight*row.preference*row.adjustment;
  const winning=sectorRows.reduce((best,row)=>!best||row.candidate>best.candidate?row:best,null);
  for(const row of sectorRows){row.selected=row===winning;row.points=row.selected?45*factor*row.candidate:0;}
  const conditionRows=conditionDetails(inputs.conditions,item.pathConditions||{}).map(row=>({...row,
    requirementLabel:row.known ? row.interval.join('–') : 'Не установлено',
    pointsLost:15*factor*(1-row.fit)/4}));
  const category=result.ranked.filter(a=>core(a)===core(item));
  const neighbours=category.filter(a=>a.id!==item.id&&Math.abs(a.score-item.score)<=CLOSE_SCORE_DISTANCE)
    .sort((a,b)=>Math.abs(a.score-item.score)-Math.abs(b.score-item.score)).slice(0,5);
  const lowInterest=result.roleProfile.lowInterest;
  return {authority,item,rank:category.findIndex(a=>a.id===item.id)+1,categorySize:category.length,adjacent:!core(item),
    raw,contributions,factor,tracks,sectorRows,conditionRows,neighbours,roleProfile:result.roleProfile,lowInterest,
    roleRows:SCALE_IDS.map(id=>({id,interest:result.roleProfile.raw[id],relevance:item.track?.vector[id]??0}))};
}

/** One controlled change, always on a detached copy. Low-priority sectors are never promoted silently. */
export function promoteSector(state, sectorId, data) {
  const next=checkedInputs(state,data);
  if(!data.sectors.some(s=>s.id===sectorId))throw new Error('unknown-sector');
  if(next.lowPrioritySectors.includes(sectorId))throw new Error('low-priority-conflict');
  const index=next.prioritySectors.indexOf(sectorId);
  if(index>0)[next.prioritySectors[0],next.prioritySectors[index]]=[next.prioritySectors[index],next.prioritySectors[0]];
  else if(index<0)next.prioritySectors[0]=sectorId;
  next.focusAreas=sanitizeFocusAreas(next.focusAreas||{},next.prioritySectors);
  return checkedInputs(next,data);
}
export function changeCondition(state,id,value,data) {
  if(!CONDITION_IDS.includes(id)||!Number.isInteger(value)||value<1||value>5)throw new Error('condition-value');
  const next=checkedInputs(state,data);next.conditions[id]=value;return next;
}
export function inputDifferences(before,after,data) {
  const a=checkedInputs(before,data),b=checkedInputs(after,data);
  return {answers:data.questions.filter(q=>a.answers[q.id]!==b.answers[q.id]).map(q=>q.id),
    priorityChanged:JSON.stringify(a.prioritySectors)!==JSON.stringify(b.prioritySectors),
    lowChanged:JSON.stringify(a.lowPrioritySectors)!==JSON.stringify(b.lowPrioritySectors),
    conditions:CONDITION_IDS.filter(id=>a.conditions[id]!==b.conditions[id])};
}
export function comparePreview(before,after,data) {
  const leftResult=rankInput(before,data),rightResult=rankInput(after,data);
  const left=governmentRanking(leftResult),right=governmentRanking(rightResult);
  const leftMap=new Map(left.map(a=>[a.id,a]));
  return {leftResult,rightResult,left,right,
    overlap:left.slice(0,5).filter(a=>right.slice(0,5).some(b=>a.id===b.id)).length,
    changes:inputDifferences(before,after,data),
    rows:right.map(b=>({id:b.id,rankBefore:leftMap.get(b.id).rank,rankAfter:b.rank,scoreBefore:leftMap.get(b.id).score,
      scoreAfter:b.score,scoreDelta:Math.round((b.score-leftMap.get(b.id).score)*10)/10,
      rankDelta:leftMap.get(b.id).rank-b.rank}))};
}

/** Exhaustive local perturbations, not random samples or confidence intervals. */
export function localSensitivity(state,data) {
  const input=checkedInputs(state,data),baseline=governmentRanking(rankInput(input,data));
  const stats=new Map(baseline.map(a=>[a.id,{id:a.id,baseRank:a.rank,baseScore:a.score,
    minRank:a.rank,maxRank:a.rank,minScore:a.score,maxScore:a.score,topFive:0,first:0}]));
  let count=0,overlapSum=0,leaderChanged=0;
  for(const q of data.questions)for(const step of [-1,1]){
    const value=input.answers[q.id]+step;if(value<1||value>5)continue;
    const perturbed=structuredClone(input);perturbed.answers[q.id]=value;
    const ranked=governmentRanking(rankInput(perturbed,data));count++;
    overlapSum+=ranked.slice(0,5).filter(a=>baseline.slice(0,5).some(b=>a.id===b.id)).length;
    if(ranked[0].id!==baseline[0].id)leaderChanged++;
    for(const a of ranked){const s=stats.get(a.id);s.minRank=Math.min(s.minRank,a.rank);s.maxRank=Math.max(s.maxRank,a.rank);
      s.minScore=Math.min(s.minScore,a.score);s.maxScore=Math.max(s.maxScore,a.score);
      if(a.rank<=5)s.topFive++;if(a.rank===1)s.first++;}
  }
  return {count,leaderChanged,meanOverlap:overlapSum/count,rows:[...stats.values()],
    specification:'Every permissible +/-1 change to exactly one of the 27 task answers. Sectors and conditions fixed. Ranges include the original profile; counts exclude it.'};
}
