/** Functional career exploration. Scores express stated interests, never aptitude,
 * admission eligibility, a validated psychometric scale, or hiring probability.
 * Unknown source features are absent; unknown answers never become dislikes.
 * This pure model deliberately has no access to personality data or employer ratings.
 */
export const FUNCTIONAL_MODEL_VERSION = 'functional-2.0.0';
export const MIN_ANSWERS = 43;
export const MAX_ANSWERS = 55;
const taxonomyCache = new WeakMap();
const candidateCache = new WeakMap();
const scoreCache = new WeakMap();
const SCORE_CACHE_STATES = 5;
const functionalLevels = new Set(['duties','skills','knowledge','requirements','functional']);
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const normalized = value => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function compiled(taxonomy) {
  if (!taxonomy || !Array.isArray(taxonomy.facets) || !taxonomy.facets.length) throw new TypeError('Invalid functional taxonomy');
  if (taxonomyCache.has(taxonomy)) return taxonomyCache.get(taxonomy);
  const questions = [], ids = new Set(), facets = new Map();
  for (const facet of taxonomy.facets) {
    if (!facet.id || facets.has(facet.id) || !Array.isArray(facet.questions) || !facet.questions.length) throw new TypeError('Invalid functional facet');
    facets.set(facet.id, facet);
    facet.questions.forEach((question, index) => {
      if (!question.id || ids.has(question.id)) throw new TypeError('Duplicate functional question');
      ids.add(question.id);
      questions.push({...question, facetId:facet.id, broad:question.broad === true || index === 0});
    });
  }
  const value = {questions, byId:new Map(questions.map(q => [q.id, q])), facets};
  taxonomyCache.set(taxonomy, value);
  return value;
}

export function buildQuestionBank(taxonomy) { return compiled(taxonomy).questions.slice(); }

export function validAnswers(taxonomy, answers = []) {
  const {byId} = compiled(taxonomy), seen = new Set(), output = [];
  if (!Array.isArray(answers)) return output;
  for (const answer of answers.slice(0, MAX_ANSWERS)) {
    if (!byId.has(answer?.questionId) || seen.has(answer.questionId) || !Number.isInteger(answer.value) || answer.value < 0 || answer.value > 5) continue;
    seen.add(answer.questionId); output.push({questionId:answer.questionId, value:answer.value});
  }
  return output;
}

function preferences(taxonomy, answers) {
  const {byId, facets} = compiled(taxonomy), clean = validAnswers(taxonomy, answers);
  const broad = {}, detail = {}, count = {}, detailByFacet = {};
  for (const answer of clean) {
    const q = byId.get(answer.questionId);
    count[q.facetId] = (count[q.facetId] || 0) + 1;
    if (answer.value === 0) continue;
    const interest = (answer.value - 3) / 2;
    if (q.broad) broad[q.facetId] = interest;
    else { detail[q.id] = interest; (detailByFacet[q.facetId] ||= []).push(interest); }
  }
  // An unknown broad answer can steer later questions through a known narrow
  // interest. It does not become positive matching evidence for other tasks.
  const steering = {...broad};
  for (const [id, values] of Object.entries(detailByFacet)) {
    if (!(id in steering)) steering[id] = values.reduce((a,b) => a+b, 0) / values.length * .5;
  }
  const profile = [...facets.values()].map(facet => ({id:facet.id, label:facet.label,
    interest:facet.id in steering ? steering[facet.id] : null, answers:count[facet.id] || 0}));
  return {clean, broad, detail, steering, count, profile,
    informativeAnswers:clean.filter(a => a.value !== 0 && a.value !== 3).length,
    positiveAnswers:clean.filter(a => a.value >= 4).length};
}

function feature(row, id) {
  const value = row?.features?.[id];
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value) : 0;
}

/** Candidate arrays are immutable snapshots. Repeated announcements share one
 * numerical profile, while every source vacancy remains selectable. This avoids
 * scoring hundreds of thousands of duplicate vectors for every student answer.
 */
function candidateGroups(taxonomy, candidates) {
  if (!Array.isArray(candidates)) return [];
  let cache = candidateCache.get(candidates);
  if (!cache) {cache = new WeakMap(); candidateCache.set(candidates, cache);}
  const prior = cache.get(taxonomy);
  if (prior?.length === candidates.length) return prior.groups;
  const {facets, byId} = compiled(taxonomy), groups = new Map(), ids = new Set(), signatures = new WeakMap();
  for (const row of candidates) {
    if (!row?.id || !row.title || !row.features || typeof row.features !== 'object' || ids.has(row.id) || !functionalLevels.has(row.evidenceLevel)) continue;
    ids.add(row.id);
    let prepared = signatures.get(row.features);
    if (!prepared) {
      const entries = Object.entries(row.features).filter(([id,value]) =>
        (facets.has(id) || byId.has(id) && !byId.get(id).broad) && Number.isFinite(value) && value > 0)
        .map(([id,value]) => [id,clamp(value)]).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0);
      const signature = entries.map(([id,value]) => id+':'+value).join('|');
      const functions = new Map();
      for (const [id,strength] of entries) {
        const facetId = facets.has(id) ? id : byId.get(id).facetId;
        if (!functions.has(facetId)) functions.set(facetId,{id:facetId,strength:0,details:[]});
        const family = functions.get(facetId);
        family.strength = Math.max(family.strength,strength);
        if (id !== facetId) family.details.push({id,strength});
      }
      prepared = {signature,functions:[...functions.values()],features:Object.fromEntries(entries)};
      signatures.set(row.features,prepared);
    }
    if (!prepared.signature) continue;
    let group = groups.get(prepared.signature);
    if (!group) {group = {...prepared,members:[]};groups.set(prepared.signature,group);}
    group.members.push(row);
  }
  const result = [...groups.values()];
  for (const group of result) group.members.sort((a,b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  cache.set(taxonomy,{length:candidates.length,groups:result});
  return result;
}

// Prepare immutable source profiles while the pool is loading, so the first
// adaptive question does not pay the one-off grouping cost after an answer.
export function prepareCandidatePool({taxonomy, candidates = []}) {
  const groups = candidateGroups(taxonomy,candidates);
  return {considered:groups.reduce((sum,group) => sum+group.members.length,0),functionalProfilesConsidered:groups.length};
}

function candidateStatistics(taxonomy, candidates) {
  const groups = candidateGroups(taxonomy,candidates);
  const cache = Array.isArray(candidates) ? candidateCache.get(candidates)?.get(taxonomy) : null;
  if (cache?.statistics) return cache.statistics;
  const features = new Map();
  for (const group of groups) for (const [id,value] of Object.entries(group.features)) {
    const item = features.get(id) || {sum:0,square:0};
    item.sum += value; item.square += value*value; features.set(id,item);
  }
  const result = {features,count:groups.length};
  if (cache) cache.statistics = result;
  return result;
}

function scoredCandidates(taxonomy, answers, candidates) {
  if (!Array.isArray(candidates)) candidates = [];
  const pref = preferences(taxonomy, answers);
  // The same answer state is used for stopping, choosing the next question and
  // rendering. Retain five computed states for the current/−2/−4 stability check;
  // reads do not reorder this window, so alternating answer counts remain cached.
  // changing an answer's value changes the key even if its array is reused.
  let byTaxonomy = scoreCache.get(candidates);
  if (!byTaxonomy) {byTaxonomy = new WeakMap(); scoreCache.set(candidates,byTaxonomy);}
  let cache = byTaxonomy.get(taxonomy);
  if (!cache || cache.length !== candidates.length) {
    cache = {length:candidates.length,states:new Map()}; byTaxonomy.set(taxonomy,cache);
  }
  const answerKey = JSON.stringify(pref.clean);
  if (cache.states.has(answerKey)) {
    return cache.states.get(answerKey);
  }
  const positiveTotal = Object.values(pref.broad).reduce((sum,value) => sum + Math.max(0,value),0);
  const rows = [];
  for (const group of candidateGroups(taxonomy,candidates)) {
    let total = 0, positive = 0, negative = 0, overlap = 0, confidenceSum = 0, positiveSpecific = 0;
    for (const family of group.functions) {
      const broad = pref.broad[family.id];
      const detail = family.details.filter(item => Object.hasOwn(pref.detail,item.id));
      const detailMass = detail.reduce((sum,item) => sum + item.strength,0);
      // Parent and child describe one family of tasks. They are not independent
      // votes: a concrete answer replaces most of its broad family's influence.
      const broadShare = detail.length ? .3 : 1;
      const detailShare = broad === undefined ? 1 : .7;
      const add = (interest,strength,weight) => {
        const yes = Math.max(0,interest)*weight, no = Math.max(0,-interest)*weight;
        total += weight; positive += yes; negative += no;
        confidenceSum += yes*strength;
      };
      if (broad !== undefined) {
        add(broad,family.strength,family.strength*broadShare);
        overlap += Math.max(0,broad)*family.strength;
      }
      for (const item of detail) {
        const interest = pref.detail[item.id];
        add(interest,item.strength,item.strength*detailShare/Math.max(1,detailMass));
        if (interest > 0) {
          positiveSpecific += interest*item.strength;
        }
      }
    }
    const alignment = total ? (positive-negative)/total : 0;
    const confidence = positive ? confidenceSum/positive : 0;
    const support = 1-Math.exp(-positive/1.75), specificity = 1-Math.exp(-positiveSpecific);
    const coverage = positiveTotal ? Math.min(1,overlap/positiveTotal) : 0;
    const penalty = total ? negative/total : 0;
    // Saturating support separates a single weak mention from several published
    // tasks. Missing source information remains unknown, never a dislike.
    const score = clamp(50*Math.max(0,alignment)+22*support+12*specificity+10*confidence+6*coverage-15*penalty,0,100);
    rows.push({group,features:group.features,score:Number(score.toFixed(4)),
      _alignment:alignment,_positive:positive,_negative:negative,_evidence:confidence});
  }
  rows.sort((a,b) => b.score-a.score || b._evidence-a._evidence || a.group.signature.localeCompare(b.group.signature,'en'));
  const result = {rows,pref};
  cache.states.set(answerKey,result);
  while (cache.states.size > SCORE_CACHE_STATES) cache.states.delete(cache.states.keys().next().value);
  return result;
}

function identity(row, signature) {
  return [row.employerId || row.employerName,row.department,row.title,row.regionId,row.location,signature].map(normalized).join('|');
}

function memberScope(regionIds, responsibilityPreference) {
  const regions = new Set(regionIds);
  if (!regions.size && responsibilityPreference === 'all') return null;
  return row => (!regions.size || regions.has(row.regionId)) &&
    (responsibilityPreference === 'all' || row.responsibilityLevel === responsibilityPreference);
}

function meetsInterestThreshold(scored) {
  return scored._positive >= .2 && scored._alignment > .08 && scored._negative <= scored._positive * .9;
}

function hashText(text, initial = 2166136261) {
  let hash = initial;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function seedHash(selectionSeed) {
  return typeof selectionSeed === 'string' && selectionSeed.length ? hashText(selectionSeed) : null;
}

function memberStart(group, seed) {
  if (seed === null || group.members.length < 2) return 0;
  return hashText(group.signature, seed) % group.members.length;
}

function* orderedMembers(group, seed) {
  const {members} = group;
  const start = memberStart(group, seed);
  for (let index = 0; index < members.length; index++) {
    yield members[(start + index) % members.length];
  }
}

function matchingEvidence(group, pref, facets) {
  const matchedFeatures = [], matchedFacets = [];
  for (const family of group.functions) {
    const broad = pref.broad[family.id];
    const detail = family.details.filter(item => Object.hasOwn(pref.detail,item.id));
    const detailMass = detail.reduce((sum,item) => sum + item.strength,0);
    const broadShare = detail.length ? .3 : 1, detailShare = broad === undefined ? 1 : .7;
    const broadWeight = family.strength*broadShare;
    let positive = broad === undefined ? 0 : Math.max(0,broad)*broadWeight;
    let negative = broad === undefined ? 0 : Math.max(0,-broad)*broadWeight;
    for (const item of detail) {
      const interest = pref.detail[item.id], weight = item.strength*detailShare/Math.max(1,detailMass);
      positive += Math.max(0,interest)*weight; negative += Math.max(0,-interest)*weight;
      if (interest > 0) matchedFeatures.push({id:item.id,weight:interest*item.strength,interest,strength:item.strength,specific:true});
    }
    if (broad > 0 && positive > negative) {
      matchedFeatures.push({id:family.id,weight:broad*family.strength,interest:broad,strength:family.strength,specific:false});
      matchedFacets.push({id:family.id,label:facets.get(family.id)?.label,strength:family.strength,interest:broad});
    }
  }
  matchedFeatures.sort((a,b) => Number(b.specific)-Number(a.specific) || b.weight-a.weight || a.id.localeCompare(b.id,'en'));
  matchedFacets.sort((a,b) => b.interest*b.strength-a.interest*a.strength);
  return {matchedFeatures,matchedFacets};
}

function annotatedMatch(scored, row, pref, facets, annotations) {
  if (!annotations.has(scored.group)) {
    annotations.set(scored.group, matchingEvidence(scored.group, pref, facets));
  }
  return {...row, score:scored.score, ...annotations.get(scored.group)};
}

function selectMatches(eligible, limit, pref, facets, scope, seed) {
  const selected = [], identities = new Set(), taskSignatures = new Map();
  const annotations = new Map();
  const add = (scored,row) => {
    if (scope && !scope(row)) return false;
    const key = identity(row,scored.group.signature); if (identities.has(key)) return false;
    identities.add(key);
    selected.push(annotatedMatch(scored, row, pref, facets, annotations));
    return true;
  };
  // Preserve different published task profiles, including different functions
  // behind the same job/department title. Frequency never increases a score.
  for (const scored of eligible) {
    if (scored.score < eligible[0].score-8) break;
    const signature = Object.keys(scored.features).sort().join('|');
    for (const row of orderedMembers(scored.group, seed)) {
      if ((taskSignatures.get(signature)||0) >= 2) break;
      if (add(scored,row)) taskSignatures.set(signature,(taskSignatures.get(signature)||0)+1);
      if (selected.length >= limit) break;
    }
    if (selected.length >= limit) break;
  }
  for (const scored of eligible) {
    if (selected.length >= limit) break;
    for (const row of orderedMembers(scored.group, seed)) {
      add(scored,row); if (selected.length >= limit) break;
    }
  }
  selected.sort((a,b) => b.score-a.score || (seed === null ? String(a.id).localeCompare(String(b.id),'en') : 0));
  return selected;
}

export function rankVacancies({taxonomy, answers = [], candidates = [], limit = 5, regionIds = [], responsibilityPreference = 'all', selectionSeed = ''}) {
  const {rows, pref} = scoredCandidates(taxonomy, answers, candidates);
  const scope = memberScope(regionIds, responsibilityPreference);
  const shortlistSize = Number.isFinite(limit) ? clamp(Math.trunc(limit), 1, 10) : 5;
  const eligible = [];
  let considered = 0, functionalProfilesConsidered = 0, matchingCount = 0;
  for (const scored of rows) {
    const members = scored.group.members;
    const count = scope ? members.reduce((sum, row) => sum + Number(scope(row)), 0) : members.length;
    if (!count) continue;
    considered += count;
    functionalProfilesConsidered++;
    if (pref.positiveAnswers && meetsInterestThreshold(scored)) {
      eligible.push(scored);
      matchingCount += count;
    }
  }
  const matches = selectMatches(eligible, shortlistSize, pref, compiled(taxonomy).facets, scope, seedHash(selectionSeed));
  return {matches, matchingCount, profile:pref.profile, considered, functionalProfilesConsidered, informativeAnswers:pref.informativeAnswers,
    resultStatus:!pref.positiveAnswers ? 'no-preference' : matches.length ? 'matched' : 'no-matches'};
}

/** Page through source vacancies that meet the same interest and scope criteria
 * as the shortlist. Repeated announcements retain their separate source IDs.
 */
export function listMatchingVacancies({taxonomy, answers = [], candidates = [], regionIds = [], responsibilityPreference = 'all', query = '', offset = 0, limit = 12, selectionSeed = ''}) {
  const pageSize = Number.isFinite(limit) ? clamp(Math.trunc(limit), 1, 100) : 12;
  const position = Number.isFinite(offset) ? clamp(offset, 0, Number.MAX_SAFE_INTEGER) : 0;
  const requestedOffset = Math.floor(position / pageSize) * pageSize;
  const {rows, pref} = scoredCandidates(taxonomy, answers, candidates);
  if (!pref.positiveAnswers) return {rows:[], total:0, offset:0, limit:pageSize};

  const scope = memberScope(regionIds, responsibilityPreference);
  const term = normalized(query);
  const accepts = term ? row => (!scope || scope(row)) && normalized([
    row.title, row.employerName, row.employerId, row.department, row.location, row.regionId, row.id
  ].join(' ')).includes(term) : scope;
  const seed = seedHash(selectionSeed);
  const scan = start => {
    const page = [];
    let total = 0;
    for (const scored of rows) {
      if (!meetsInterestThreshold(scored)) continue;
      const {group} = scored;
      if (accepts) {
        for (const row of orderedMembers(group, seed)) {
          if (!accepts(row)) continue;
          if (total >= start && page.length < pageSize) page.push({scored, row});
          total++;
        }
        continue;
      }
      // Unfiltered groups already have a count, so skip their members unless
      // they overlap the requested page.
      const {members} = group;
      const first = Math.max(0, start - total);
      const end = Math.min(members.length, start + pageSize - total);
      if (first < end) {
        const rotation = memberStart(group, seed);
        for (let index = first; index < end; index++) {
          page.push({scored, row:members[(rotation + index) % members.length]});
        }
      }
      total += members.length;
    }
    return {page, total};
  };
  const {page, total} = scan(requestedOffset);
  const lastOffset = total ? Math.floor((total - 1) / pageSize) * pageSize : 0;
  const currentOffset = Math.min(requestedOffset, lastOffset);
  const visible = total && currentOffset !== requestedOffset ? scan(currentOffset).page : page;
  const annotations = new Map(), {facets} = compiled(taxonomy);
  return {rows:visible.map(({scored, row}) => annotatedMatch(scored, row, pref, facets, annotations)), total, offset:currentOffset, limit:pageSize};
}

function questionUtilities({taxonomy, answers, candidates}) {
  const {questions} = compiled(taxonomy), {rows, pref} = scoredCandidates(taxonomy, answers, candidates);
  const answered = new Set(pref.clean.map(a => a.questionId));
  // The index already groups identical functional evidence, so archive volume
  // cannot dominate the adaptive branch selection.
  const pool = rows.slice(0,160);
  const top = pool[0]?.score || 0;
  const near = pool.filter(row => row.score >= top - 22);
  const relevantPool = near.length >= 8 ? near : pool.slice(0, 80);
  const remaining = questions.filter(q => !answered.has(q.id));
  const makeOption = (question,sum,square,relevant,n) => {
    const interest = pref.steering[question.facetId] ?? 0;
    const mean = sum/n, variance = Math.max(0, square/n-mean*mean);
    const utility = 3*variance + .35*mean + .18*relevant/n + .32*Math.max(0,interest)
      + .12/(1+(pref.count[question.facetId] || 0)) - .16*Math.max(0,-interest);
    return {question, utility, variance, evidence:sum};
  };
  const options = remaining.map(question => {
    let sum=0, square=0, relevant=0;
    for (const row of relevantPool) {
      const value = question.broad ? feature(row, question.facetId) : feature(row, question.id);
      sum += value; square += value*value;
      relevant += feature(row, question.facetId);
    }
    // Specific published tasks with a balanced split have high information value.
    // A small exploration term permits reconsideration of initially weak interests.
    return makeOption(question,sum,square,relevant,relevantPool.length || 1);
  });
  let supported = options.filter(option => option.evidence > 0);
  // A very narrow leading set may exhaust its own tasks. Explore the rest of
  // the explicitly scoped pool before asking about a task absent from it.
  if (!supported.length && relevantPool.length < rows.length) {
    const all = candidateStatistics(taxonomy,candidates), n = all.count || 1;
    supported = remaining.map(question => {
      const item = all.features.get(question.broad ? question.facetId : question.id) || {sum:0,square:0};
      return makeOption(question,item.sum,item.square,all.features.get(question.facetId)?.sum || 0,n);
    }).filter(option => option.evidence > 0);
  }
  // Unsupported exploration remains possible only after the whole eligible
  // pool has no evidence-bearing unanswered task (or the pool itself is empty).
  return (supported.length ? supported : options).sort((a,b) => b.utility-a.utility || a.question.id.localeCompare(b.question.id, 'en'));
}

export function nextQuestion({taxonomy, answers = [], candidates = []}) {
  const {questions} = compiled(taxonomy), clean = validAnswers(taxonomy, answers), used = new Set(clean.map(a => a.questionId));
  if (clean.length >= Math.min(MAX_ANSWERS, questions.length)) return null;
  // Every functional family is encountered once before adaptive narrowing.
  const core = questions.find(q => q.broad && !used.has(q.id));
  if (core) return core;
  return questionUtilities({taxonomy,answers:clean,candidates})[0]?.question || null;
}

export function shouldFinish({taxonomy, answers = [], candidates = [], selectionSeed = ''}) {
  const {questions} = compiled(taxonomy), clean = validAnswers(taxonomy, answers);
  if (clean.length >= Math.min(MAX_ANSWERS, questions.length)) return true;
  if (clean.length < Math.min(MIN_ANSWERS, questions.length)) return false;
  if (questions.some(q => q.broad && !clean.some(a => a.questionId === q.id))) return false;
  const ranking = rankVacancies({taxonomy,answers:clean,candidates,selectionSeed});
  // A neutral/unknown questionnaire is complete, but has no invented best match.
  if (!clean.some(a => a.value >= 4) || !candidates.length) return true;
  const current = ranking.matches.map(row => row.id).join('|');
  if (!current) return clean.length >= MIN_ANSWERS + 4;
  const previous = [2,4].map(step => rankVacancies({taxonomy,answers:clean.slice(0,-step),candidates,selectionSeed}).matches.map(row => row.id).join('|'));
  const stable = previous.every(value => value === current);
  const information = questionUtilities({taxonomy,answers:clean,candidates})[0];
  return stable && (clean.length >= MIN_ANSWERS + 4 || !information || information.variance < .025);
}

export function makeCompletionRecord({taxonomy, answers = [], regionIds = [], responsibilityPreference = 'all', ranking, indexVersion, recordId, createdAt}) {
  const clean = validAnswers(taxonomy, answers);
  const bank = compiled(taxonomy).questions;
  if (clean.length < Math.min(MIN_ANSWERS, bank.length) || bank.some(q => q.broad && !clean.some(a => a.questionId === q.id))) throw new TypeError('Functional questionnaire is incomplete');
  if (!ranking || !['matched','no-preference','no-matches'].includes(ranking.resultStatus)) throw new TypeError('Invalid functional ranking');
  if (!['specialist','leadership','all'].includes(responsibilityPreference)) throw new TypeError('Invalid responsibility preference');
  if (ranking.matches.some(row => regionIds.length && !regionIds.includes(row.regionId) || responsibilityPreference !== 'all' && row.responsibilityLevel !== responsibilityPreference)) throw new TypeError('Functional recommendation violates an explicit preference');
  const resultId = recordId || ('functional-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)));
  return {
    schema:'rudn-career-result', schemaVersion:3, resultKind:'vacancy-functional', completed:true,
    recordId:resultId, createdAt:createdAt || new Date().toISOString(), modelVersion:FUNCTIONAL_MODEL_VERSION,
    featureBasis:'published-source-content',
    questionnaireVersion:String(taxonomy.version || '1.0.0'), registryVersion:String(indexVersion || 'functional-index-1'),
    answerCount:clean.length, broadQuestionIds:bank.filter(q => q.broad).map(q => q.id), informativeAnswers:clean.filter(a => a.value !== 0 && a.value !== 3).length,
    answeredQuestionIds:clean.map(a => a.questionId), regionIds:[...new Set(regionIds)].filter(id => /^ru-\d{2}$/.test(id)), responsibilityPreference,
    resultStatus:ranking.resultStatus,
    ranking:ranking.matches.slice(0,5).map((row,index) => ({rank:index+1,vacancyId:row.id,title:row.title,
      department:row.department || '',employerName:row.employerName || '',regionId:row.regionId || null,
      sourceURL:row.sourceURL || '',evidenceLevel:row.evidenceLevel || 'title',responsibilityLevel:row.responsibilityLevel || 'unspecified',score:Number(row.score.toFixed(2))}))
  };
}
