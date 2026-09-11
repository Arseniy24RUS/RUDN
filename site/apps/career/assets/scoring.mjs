import { topicAdjustment } from './topics.mjs';
export const SCALE_IDS = ["N","K","A","M","C","E","D","T","I"];
export const CONDITION_IDS = ["FIELD","SCHEDULE","FORMAL","SECURITY"];

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

export function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

export function pearsonCorrelation(left, right) {
  if (!left.length || left.length !== right.length) return 0;
  const leftMean = average(left);
  const rightMean = average(right);
  let numerator = 0;
  let leftSq = 0;
  let rightSq = 0;
  for (let index = 0; index < left.length; index += 1) {
    const x = left[index] - leftMean;
    const y = right[index] - rightMean;
    numerator += x * y;
    leftSq += x * x;
    rightSq += y * y;
  }
  const denominator = Math.sqrt(leftSq * rightSq);
  return denominator > 1e-9 ? numerator / denominator : 0;
}

export function computeRoleProfile(answerMap, questions) {
  const grouped = Object.fromEntries(SCALE_IDS.map((id) => [id, []]));
  for (const question of questions) {
    const raw = Number(answerMap[question.id]);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 5) {
      grouped[question.scale].push(raw);
    }
  }
  const raw = {};
  const normalized = {};
  for (const id of SCALE_IDS) {
    raw[id] = grouped[id].length ? average(grouped[id]) : 3;
    normalized[id] = (raw[id] - 1) / 4;
  }
  return profileFromMeans(raw, Object.values(grouped).reduce((sum, values) => sum + values.length, 0));
}

export function profileFromMeans(raw, answered = 27) {
  const normalized = Object.fromEntries(SCALE_IDS.map(id=>[id,(Number(raw[id])-1)/4]));
  const values=SCALE_IDS.map(id=>Number(raw[id]));
  const dispersion = standardDeviation(values);
  const mean=average(values);
  return {
    raw,
    normalized,
    dispersion,
    flat: dispersion < 0.26,
    answered,
    mean,
    lowInterest: Math.max(...values) <= 3 && mean < 2.5,
    positiveScales: values.filter(v=>v>=3.5).length,
    roleSignal: dispersion / Math.sqrt(dispersion ** 2 + 0.65 ** 2)
  };
}

export function buildSectorPreference(priorityIds = [], lowPriorityIds = [], sectors = []) {
  const priorityWeights = [1.0, 0.82, 0.66, 0.50];
  const lowWeights = [0.08, 0.0];
  const values = Object.fromEntries(sectors.map((sector) => [sector.id, 0.25]));
  priorityIds.slice(0, 4).forEach((id, index) => {
    if (id in values) values[id] = priorityWeights[index];
  });
  lowPriorityIds.slice(0, 2).forEach((id, index) => {
    if (id in values && !priorityIds.includes(id)) values[id] = lowWeights[index];
  });
  return values;
}

/** A career path is an opportunity, not the average of every mission of an agency.
 * Adding a secondary area cannot reduce an existing area match. Weights are authored
 * salience coefficients, not percentages of employees or activities. */
export function sectorFit(preferences, authority, focusAreas = {}) {
  const entries = authority.sectors || [];
  if (!entries.length) return 0.25;
  return clamp(Math.max(...entries.map(entry=>Number(entry.weight||0) *
    Number(preferences[entry.id] ?? .25) * topicAdjustment(entry.id,authority,focusAreas))));
}

export function conditionDetails(userConditions = {}, requirements = {}) {
  return CONDITION_IDS.map(id=>{
    const willingness=Number(userConditions[id]??3), requirement=requirements[id]??null;
    const interval=Array.isArray(requirement)?requirement:Number.isFinite(requirement)?[requirement,requirement]:null;
    if(!interval)return {id,willingness,requirement:null,interval:null,known:false,fit:.5,gap:null};
    const [lo,hi]=interval;
    if(!(lo>=1&&hi<=5&&lo<=hi))throw new Error(`Invalid condition interval ${id}`);
    const expectedGap=lo===hi?Math.max(0,lo-willingness):
      (Math.max(0,hi-willingness)**2-Math.max(0,lo-willingness)**2)/(2*(hi-lo));
    return {id,willingness,requirement,interval,known:true,fit:clamp(1-expectedGap/4),gap:expectedGap};
  });
}
export function conditionFit(userConditions = {}, requirements = {}) {
  // Unknown is neutral, not a made-up "3" and not an automatic maximum.
  return average(conditionDetails(userConditions,requirements).map(row=>row.fit));
}

export function roleFit(roleProfile, template) {
  const user = SCALE_IDS.map(id => Number(roleProfile.raw[id]));
  const target = SCALE_IDS.map(id => Number(template.vector[id] ?? .5));
  const mean=average(user), tmean=average(target);
  let dot=0, norm=0, tnorm=0;
  for(let i=0;i<user.length;i++){const u=user[i]-mean,t=target[i]-tmean;dot+=u*t;norm+=u*u;tnorm+=t*t;}
  // Smooth regularised correlation. The display-only `flat` flag is never a switch.
  // lambda=0.65 is an explicitly documented engineering setting in raw 1..5 units.
  // An individual +/-1 item change alters the role contribution by at most ~3.23 points.
  if(tnorm<1e-12)return .5;
  return clamp(.5+.5*dot/(Math.sqrt(norm+user.length*.65**2)*Math.sqrt(tnorm)));
}

export function matchBand(score) {
  if (score >= 80) return { id: "high", label: "Высокая относительная близость" };
  if (score >= 70) return { id: "good", label: "Хорошая относительная близость" };
  if (score >= 60) return { id: "moderate", label: "Умеренная относительная близость" };
  return { id: "exploratory", label: "Направление для знакомства" };
}

function importanceFactor(importance) {
  if (Number(importance) >= 3) return 1;
  if (Number(importance) === 2) return 0.96;
  return 0.91;
}

export function scoreAuthority(authority, context, trackMap) {
  const sFit = sectorFit(context.sectorPreferences, authority, context.focusAreas);
  const cFit = conditionFit(context.conditions, authority.conditions);
  let best = null;

  for (const link of authority.tracks || []) {
    const template = trackMap.get(link.id);
    if (!template) continue;
    const path={...authority,...link,sectors:link.sectors||authority.sectors,topics:link.topics||authority.topics};
    const sFit = sectorFit(context.sectorPreferences,path,context.focusAreas);
    const cFit = conditionFit(context.conditions,link.conditions||{});
    const rFit = roleFit(context.roleProfile, template);
    const base = 0.40 * rFit + 0.45 * sFit + 0.15 * cFit;
    const score = 100 * base * importanceFactor(link.importance);
    const candidate = {
      score,
      roleFit: rFit,
      sectorFit: sFit,
      conditionFit: cFit,
      track: template,
      importance: link.importance,
      path:link,
      pathSectors:path.sectors,
      pathTopics:path.topics||{},
      pathConditions:link.conditions||{}
    };
    if (!best || candidate.score > best.score) best = candidate;
  }

  if (!best) {
    best = {
      score: 100 * (0.45 * sFit + 0.15 * cFit + 0.20),
      roleFit: 0.5,
      sectorFit: sFit,
      conditionFit: cFit,
      track: null,
      importance: 0
    };
  }

  return {
    ...authority,
    ...best,
    score: Math.round(best.score * 10) / 10,
    rawScore: best.score,
    band: matchBand(best.score)
  };
}

export function rankAuthorities({authorities,tracks,questions,sectors,answers,prioritySectors,lowPrioritySectors,conditions,focusAreas={}}) {
  const roleProfile=computeRoleProfile(answers,questions);
  return rankFromProfile({authorities,tracks,sectors,roleProfile,prioritySectors,lowPrioritySectors,conditions,focusAreas});
}
export function rankFromProfile({authorities,tracks,sectors,roleProfile,prioritySectors,lowPrioritySectors,conditions,focusAreas={}}) {
  const sectorPreferences=buildSectorPreference(prioritySectors,lowPrioritySectors,sectors);
  const trackMap=new Map(tracks.map(track=>[track.id,track]));
  const context={roleProfile,sectorPreferences,conditions,focusAreas};
  const ranked=authorities.map(authority=>scoreAuthority(authority,context,trackMap))
    .sort((a,b)=>b.rawScore-a.rawScore || a.id.localeCompare(b.id))
    .map((item,index)=>({...item,rank:index+1}));
  return {ranked,roleProfile,sectorPreferences,context};
}

export function groupCloseMatches(ranked, threshold = 2.5) {
  if (!ranked.length) return [];
  const groups = [];
  let current = [ranked[0]];
  for (let index = 1; index < ranked.length; index += 1) {
    const previous = ranked[index - 1];
    const item = ranked[index];
    if (current[0].rawScore - item.rawScore <= threshold) {
      current.push(item);
    } else {
      groups.push(current);
      current = [item];
    }
  }
  groups.push(current);
  return groups;
}

export function selectDiscoveryCandidate(ranked, topCount = 5) {
  if (ranked.length <= topCount) return null;
  const fifthScore = ranked[Math.min(topCount - 1, ranked.length - 1)].score;
  const candidates = ranked
    .slice(topCount, 20)
    .filter((item) => item.familiarity <= 3 && fifthScore - item.score <= 9 && item.sectorFit >= 0.28)
    .sort((left, right) => {
      if (left.familiarity !== right.familiarity) return left.familiarity - right.familiarity;
      return right.score - left.score;
    });
  return candidates[0] || null; // No fallback that silently bypasses relevance constraints.
}

export function buildExplanation(item, roleProfile, scales, sectors) {
  const scaleById = new Map(scales.map((scale) => [scale.id, scale]));
  const sectorById = new Map(sectors.map((sector) => [sector.id, sector]));
  const strongest = Object.entries(roleProfile.raw)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => scaleById.get(id)?.short || id);
  const authoritySectors = (item.pathSectors || item.sectors || [])
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((entry) => sectorById.get(entry.id)?.title || entry.id);
  return {
    strengths: strongest,
    sectors: authoritySectors,
    reason: roleProfile.lowInterest
      ? "Положительный интерес к этим видам работы пока не выражен. Рекомендации предназначены для знакомства, а не подтверждают склонность."
      : roleProfile.flat
      ? "Предпочтения видов работы близки. Название трека – пример возможной работы, а не уверенный вывод о склонности."
      : `${item.track?.title || "Профессиональный трек"} ближе к относительному порядку Ваших предпочтений: ${strongest.join(", ").toLowerCase()}.`,
    sectorReason: authoritySectors.length
      ? `Содержательная область выбранного направления: ${authoritySectors.join("; ").toLowerCase()}.`
      : "Содержательная область органа требует дополнительного изучения."
  };
}

export function completionStatus({ answers, questions, prioritySectors, lowPrioritySectors, conditions }) {
  const valid = value => Number.isInteger(value) && value >= 1 && value <= 5;
  const missingQuestions = questions.filter((question) => !valid(answers[question.id])).map((question) => question.id);
  const missingConditions = CONDITION_IDS.filter((id) => !valid(conditions[id]));
  return {
    complete: missingQuestions.length === 0 && prioritySectors.length === 4 && new Set(prioritySectors).size===4 && lowPrioritySectors.length === 2 && new Set(lowPrioritySectors).size===2 && !lowPrioritySectors.some(id=>prioritySectors.includes(id)) && missingConditions.length === 0,
    missingQuestions,
    priorityCount: prioritySectors.length,
    lowPriorityCount: lowPrioritySectors.length,
    missingConditions
  };
}
