/**
 * Pure helpers for the seminar's career journey.
 *
 * Preferences do not affect the scoring formula. Institutions are ranked with the
 * existing model and then partitioned into national and selected-region cohorts.
 * Interest scores, authored descriptions of work and self-reported qualifications
 * remain distinct. No helper here produces an eligibility or ability verdict.
 */
import {SCALE_IDS, computeRoleProfile, buildSectorPreference, scoreAuthority} from './scoring.mjs';

export const JOURNEY_SCHEMA = 1;
export const DESIRED_AUTHORITY_COUNT = 3;
export const REQUIREMENT_CATEGORIES = Object.freeze(['education', 'experience', 'knowledge', 'skills', 'eligibility', 'other']);
export const CORE_REQUIREMENT_CATEGORIES = Object.freeze(['education', 'experience', 'knowledge', 'skills']);
export const COMPETENCY_DOMAIN_IDS = Object.freeze([
  'law-regulation', 'documents-records', 'data-digital', 'finance-economy',
  'communication', 'organization-projects', 'sector-knowledge', 'analytical-work'
]);
const PERSONAL_CATEGORIES = new Set(['knowledge', 'skills']);
const FORMAL_CATEGORIES = new Set(['education', 'experience', 'eligibility']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const list = value => Array.isArray(value) ? value : [];
const ids = value => [...new Set(list(value).filter(id => typeof id === 'string' && id.trim()))];
const sourceText = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';

export function isNationalAuthority(authority) {
  if (!authority) return false;
  if (['federal', 'national', 'national-corporation'].includes(authority.level)) return true;
  if (authority.level === 'regional' || authority.level === 'municipal' || authority.regionId) return false;
  if (String(authority.cohort || '').startsWith('federal-')) return true;
  return !authority.level || ['corporation', 'fund'].includes(authority.entityType);
}

export function authorityInSelectedTerritories(authority, regionIds = []) {
  return isNationalAuthority(authority) || ids(regionIds).includes(authority?.regionId);
}

/** Missing preferences get Moscow once; an intentional empty selection stays empty. */
export function sanitizeJourneyPreferences(value, {regions = [], authorities = [], defaultRegionId = 'ru-77'} = {}) {
  const stored = object(value) ? value : {};
  const knownRegions = new Set(list(regions).map(region => typeof region === 'string' ? region : region?.id));
  const candidateRegions = Array.isArray(stored.regionIds) ? stored.regionIds : [defaultRegionId];
  const regionIds = ids(candidateRegions).filter(id => knownRegions.has(id));
  const knownAuthorities = new Map(list(authorities).filter(authority => authority?.id).map(authority => [authority.id, authority]));
  const desiredIds = ids(stored.desiredIds).filter(id => {
    const authority = knownAuthorities.get(id);
    return authority && authorityInSelectedTerritories(authority, regionIds);
  }).slice(0, DESIRED_AUTHORITY_COUNT);
  return {schemaVersion: JOURNEY_SCHEMA, regionIds, desiredIds,
    confirmed: stored.confirmed === true && desiredIds.length === DESIRED_AUTHORITY_COUNT};
}

function validProfile(profile) {
  return profile && SCALE_IDS.every(id => Number.isFinite(profile.raw?.[id]) && profile.raw[id] >= 1 && profile.raw[id] <= 5);
}

/**
 * Accepts the original result.context, or the questionnaire inputs plus questions,
 * sectors and tracks. Input answers and institution records are never modified.
 * All national employers, including corporations/funds, share the first cohort.
 */
export function rankJourneyAuthorities(options = {}) {
  const {authorities = [], tracks = [], questions = [], sectors = []} = options;
  const input = {...options, ...(object(options.inputs) ? options.inputs : {})};
  let roleProfile = options.context?.roleProfile || options.roleProfile;
  if (!roleProfile) {
    if (!questions.length || questions.some(question => !Number.isInteger(input.answers?.[question.id]) || input.answers[question.id] < 1 || input.answers[question.id] > 5)) {
      throw new Error('journey/incomplete-interest-profile');
    }
    roleProfile = computeRoleProfile(input.answers, questions);
  }
  if (!validProfile(roleProfile)) throw new Error('journey/invalid-interest-profile');
  const context = {
    roleProfile,
    sectorPreferences: options.context?.sectorPreferences || buildSectorPreference(input.prioritySectors, input.lowPrioritySectors, sectors),
    conditions: options.context?.conditions || input.conditions || {},
    focusAreas: options.context?.focusAreas || input.focusAreas || {}
  };
  const regionIds = ids(options.regionIds);
  const regionsWanted = new Set(regionIds);
  const count = Number.isSafeInteger(options.limit) && options.limit >= 0 ? options.limit : 3;
  const trackMap = new Map(list(tracks).map(track => [track.id, track]));
  const distinct = new Map();
  for (const authority of list(authorities)) {
    if (!authority || typeof authority.id !== 'string' || !authority.id || distinct.has(authority.id)) continue;
    if (isNationalAuthority(authority) || regionsWanted.has(authority.regionId)) distinct.set(authority.id, authority);
  }
  const ranked = [...distinct.values()].map(authority => scoreAuthority(authority, context, trackMap))
    .sort((left, right) => right.rawScore - left.rawScore || left.id.localeCompare(right.id))
    .map((authority, index) => ({...authority, rank: index + 1}));
  if (ranked.some(authority => !Number.isFinite(authority.rawScore))) throw new Error('journey/invalid-model-score');
  const federalPool = ranked.filter(isNationalAuthority);
  const federal = federalPool.slice(0, count);
  const regions = regionIds.map(regionId => {
    const pool = ranked.filter(authority => !isNationalAuthority(authority) && authority.regionId === regionId);
    return {regionId, authorities: pool.slice(0, count), total: pool.length,
      municipalCount: pool.filter(authority => authority.level === 'municipal').length};
  });
  return {ranked, federal, federalTotal: federalPool.length, regions,
    recommendations: [...federal, ...regions.flatMap(region => region.authorities)],
    roleProfile, context};
}

/** Desired priorities retain their original order, independent of the computed rank. */
export function compareDesiredAuthorities(desiredIds, ranked = [], groups = {}) {
  const byId = new Map(list(ranked).map(authority => [authority.id, authority]));
  const placements = new Map();
  const add = (authorities, groupId, regionId = null) => list(authorities).forEach((authority, index) => {
    if (!placements.has(authority.id)) placements.set(authority.id, []);
    placements.get(authority.id).push({groupId, regionId, rank: index + 1});
  });
  add(groups.federal, 'federal');
  for (const group of list(groups.regions)) add(group.authorities, group.regionId, group.regionId);
  return ids(desiredIds).slice(0, DESIRED_AUTHORITY_COUNT).map((authorityId, index) => ({
    authorityId, priority: index + 1, authority: byId.get(authorityId) || null,
    matched: placements.has(authorityId), recommendations: placements.get(authorityId) || []
  }));
}

/**
 * A reflection on interests, not a quantitative skills deficit. Authored salience
 * coefficients are not converted into the questionnaire's 1–5 measurement units.
 */
export function buildAuthorityDevelopment(authority, roleProfile, {tracks = [], careerFramework = {}, competencies = []} = {}) {
  const templates = new Map(list(tracks).map(track => [track.id, track]));
  const scoredTrack = authority?.track || authority?.match?.track;
  const link = list(authority?.tracks).slice().sort((left, right) => Number(right.importance || 0) - Number(left.importance || 0) || String(left.id).localeCompare(String(right.id)))
    .find(candidate => templates.has(candidate.id));
  const track = scoredTrack?.vector ? scoredTrack : templates.get(scoredTrack?.id || link?.id);
  const base = {authorityId: authority?.id || null, modelReference: true,
    comparableToQuestionnaireUnits: false, overlayOnPersonalInterestRadarAllowed: false,
    skillDeficits: null, eligibilityVerdict: null};
  if (!track || !validProfile(roleProfile)) return {...base, available: false, trackId: null,
    rows: [], lowerInterestDimensions: [], competencies: [], portfolio: [], tasks: []};
  const rows = SCALE_IDS.map(id => ({id, interest: roleProfile.raw[id],
    emphasis: Number.isFinite(track.vector?.[id]) && track.vector[id] >= 0 && track.vector[id] <= 1 ? track.vector[id] : null}));
  const profile = list(careerFramework.trackProfiles).find(candidate => candidate.id === track.id);
  const competencyMap = new Map(list(competencies).map(competency => [competency.id, competency]));
  return {...base, available: rows.some(row => row.emphasis !== null), trackId: track.id, track, rows,
    lowerInterestDimensions: rows.filter(row => row.emphasis >= .5 && row.interest < 3.5)
      .sort((left, right) => right.emphasis - left.emphasis || left.interest - right.interest || SCALE_IDS.indexOf(left.id) - SCALE_IDS.indexOf(right.id)),
    // This selection is a teaching prompt; it is not a psychometric cut-off.
    reflectionRule: {minimumModelEmphasis: .5, belowInterest: 3.5, meaning: 'topics-to-explore'},
    competencies: ids(profile?.competencyIds).map(id => competencyMap.get(id)).filter(Boolean),
    portfolio: list(profile?.portfolio).slice(), tasks: list(profile?.tasks).slice(),
    competencyMeaning: 'authored-learning-suggestions-not-measured-deficits'};
}

export function canonicalRequirementCategory(category) {
  if (category === 'skill') return 'skills';
  if (category === 'formal-eligibility' || category === 'legal-eligibility') return 'eligibility';
  return REQUIREMENT_CATEGORIES.includes(category) ? category : 'other';
}

/** Non-cryptographic identity for local checklist keys, not source authentication. */
function fingerprint(text) {
  // Two independent 32-bit accumulators avoid a single short hash for long sources.
  let left = 0x811c9dc5, right = 0x9e3779b9;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
    right ^= right >>> 13;
  }
  return (left >>> 0).toString(16).padStart(8, '0') + (right >>> 0).toString(16).padStart(8, '0');
}

function safeUrl(value) {
  try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;}
  catch {return null;}
}

/** Classifies only unambiguous standalone source phrases, without interpreting
 * an alternative/qualified requirement or changing the published wording. */
export function requirementStateFromText(text) {
  const value = sourceText(text).replace(/\s+/g, ' ').toLowerCase().replace(/[.;]$/, '').trim();
  if (!value) return 'source_not_stated';
  if (/^(?:не указано|не указан|нет данных|не установлено|source_not_stated|not stated|not specified|未说明|未注明)$/.test(value)) return 'source_not_stated';
  if (/^(?:без предъявления требований к стажу|без требований к стажу|требования к стажу не предъявляются|не предъявляются|не требуется|не требуются|not required|no experience required|无要求)$/.test(value)) return 'explicitly_not_required';
  return 'stated';
}

function requirementInput(vacancy) {
  if (Array.isArray(vacancy?.requirements)) return vacancy.requirements.filter(object);
  const fields = object(vacancy?.requirements) ? vacancy.requirements : vacancy || {};
  return REQUIREMENT_CATEGORIES.flatMap(category => {
    const field = category === 'other' ? fields.otherRequirements ?? fields.other : category === 'skills' ? fields.skills ?? fields.skill : fields[category];
    const entries = Array.isArray(field) ? field : [field];
    return entries.flatMap(entry => {
      if (object(entry)) return [{...entry, category}];
      if (!sourceText(entry)) return [];
      return [{category, sourceText: sourceText(entry), requirementState: requirementStateFromText(entry),
        sourceLocator: `feed.${category}`, sourceKind: 'published-feed-field'}];
    });
  });
}

/**
 * Keeps complete source clauses (including alternatives) and every source-only
 * note. Duties are deliberately not parsed as requirements. Supplied source IDs
 * remain in sourceId; id/key binds an answer to this vacancy and exact wording.
 */
export function buildVacancyRequirements(vacancy) {
  if (!vacancy || typeof vacancy.id !== 'string' || !vacancy.id.trim()) throw new Error('journey/vacancy-identity-required');
  const vacancyId = vacancy.id;
  const rows = [], signatures = new Set(), keySignatures = new Map();
  for (const original of requirementInput(vacancy)) {
    const category = canonicalRequirementCategory(original.category);
    const text = sourceText(original.sourceText ?? original.text);
    const state = typeof original.requirementState === 'string' ? original.requirementState : text ? 'stated' : 'source_not_stated';
    const requirementState = state === 'as-published' ? 'stated' : state;
    if (!text && requirementState !== 'source_not_stated') continue;
    const signature = JSON.stringify([vacancyId, category, text.normalize('NFC').replace(/\s+/g, ' '),
      requirementState, original.scope || null, original.selfAssessmentEligible === false ? false : true]);
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    let key = `jr-${fingerprint(signature)}`;
    // If a collision is ever observed, retain an exact discriminator rather than
    // let an answer to one statement silently apply to a different statement.
    if (keySignatures.has(key) && keySignatures.get(key) !== signature) key += `-${encodeURIComponent(signature)}`;
    keySignatures.set(key, signature);
    const assessable = requirementState === 'stated' && original.selfAssessmentEligible !== false && Boolean(text);
    const assessmentKind = PERSONAL_CATEGORIES.has(category) ? 'competency' : FORMAL_CATEGORIES.has(category) ? 'formal' : 'other';
    rows.push({...original, id: key, key, signature, sourceId: original.id || null,
      vacancyId, category, sourceCategory: original.sourceCategory || original.category || null,
      sourceRequirementState: original.sourceRequirementState || state,
      text, sourceText: original.sourceText ?? original.text ?? null,
      sourceLocator: original.sourceLocator ?? null,
      evidenceSourceUrl: original.evidenceSourceUrl ?? vacancy.source?.url ?? vacancy.url ?? null,
      sourceUrl: safeUrl(original.evidenceSourceUrl || vacancy.source?.url || vacancy.url),
      requirementState, selfAssessmentEligible: original.selfAssessmentEligible ?? null,
      competencyDomainId: typeof original.competencyDomainId === 'string' && original.competencyDomainId.trim() ? original.competencyDomainId : null,
      assessable, assessmentKind, learningEligible: assessable && assessmentKind === 'competency'});
  }
  const groups = REQUIREMENT_CATEGORIES.map(id => ({id, rows: rows.filter(row => row.category === id)}));
  const missingCategories = CORE_REQUIREMENT_CATEGORIES.filter(category => !rows.some(row => row.category === category && row.requirementState !== 'source_not_stated'));
  return {vacancyId, rows, groups, missingCategories,
    source: vacancy.source || {url: vacancy.url || null, retrievedAt: vacancy.lastSeenAt || null},
    archive: vacancy.archive || null, coverage: vacancy.coverage || null,
    assessableCount: rows.filter(row => row.assessable).length,
    contextRows: rows.filter(row => !row.assessable),
    sourceCompleteness: vacancy.coverage?.requirements || 'not-established',
    assessmentMeaning: 'student-self-report-not-verification-of-eligibility'};
}

function answerStatus(value, signature) {
  if (object(value) && value.signature && value.signature !== signature) return 'unassessed';
  const status = object(value) ? value.status : value;
  return status === 'met' || status === 'gap' ? status : 'unassessed';
}

function countsFor(rows) {
  const total = rows.length;
  const met = rows.filter(row => row.status === 'met').length;
  const gap = rows.filter(row => row.status === 'gap').length;
  const unassessed = total - met - gap;
  return {total, met, gap, unassessed, assessed: met + gap,
    metShare: total ? met / total : null, gapShare: total ? gap / total : null,
    unassessedShare: total ? unassessed / total : null,
    coverage: total ? (met + gap) / total : null,
    targetShare: total ? 1 : null,
    complete: total > 0 && unassessed === 0};
}

/** Drops stale or foreign statement keys before the UI persists a local checklist. */
export function sanitizeVacancyAssessment(requirements, statuses = {}) {
  const rows = Array.isArray(requirements) ? requirements : list(requirements?.rows);
  return Object.fromEntries(rows.filter(row => row.assessable && own(statuses, row.key || row.id))
    .map(row => [row.key || row.id, answerStatus(statuses[row.key || row.id], row.signature)])
    .filter(([, status]) => status !== 'unassessed'));
}

/**
 * Denominators include all assessable statements; unanswered statements are not
 * counted as met or as gaps. An absent category/domain has no zero-valued score.
 * Domain labels come only from source-backed grouping, never keyword inference.
 */
export function summarizeVacancyAssessment(requirements, statuses = {}) {
  const built = Array.isArray(requirements) ? {rows: requirements} : requirements || {rows: []};
  const rows = list(built.rows).map(row => ({...row,
    status: row.assessable ? answerStatus(statuses[row.key || row.id], row.signature) : null}));
  const assessable = rows.filter(row => row.assessable);
  const competencyRows = assessable.filter(row => row.assessmentKind === 'competency');
  const groups = REQUIREMENT_CATEGORIES.map(id => {
    const members = rows.filter(row => row.category === id);
    return {id, rows: members, ...countsFor(members.filter(row => row.assessable)),
      sourceMissing: members.filter(row => row.requirementState === 'source_not_stated').length,
      explicitlyNotRequired: members.filter(row => row.requirementState === 'explicitly_not_required').length,
      contextOnly: members.filter(row => !row.assessable).length,
      sourceCoverage: members.length ? 'represented-in-record' : 'not-extracted'};
  });
  const domainIds = [...new Set(competencyRows.map(row => row.competencyDomainId).filter(Boolean))]
    .sort((left, right) => {
      const li = COMPETENCY_DOMAIN_IDS.indexOf(left), ri = COMPETENCY_DOMAIN_IDS.indexOf(right);
      return (li < 0 ? COMPETENCY_DOMAIN_IDS.length : li) - (ri < 0 ? COMPETENCY_DOMAIN_IDS.length : ri) || left.localeCompare(right);
    });
  const domains = domainIds.map(id => {
    const members = competencyRows.filter(row => row.competencyDomainId === id);
    return {id, rows: members, ...countsFor(members),
      classificationReviewed: members.every(row => row.classificationProvenance?.reviewStatus === 'reviewed')};
  });
  const unclassified = competencyRows.filter(row => !row.competencyDomainId);
  return {vacancyId: built.vacancyId || rows[0]?.vacancyId || null, rows, groups, domains,
    ...countsFor(assessable), competencySummary: countsFor(competencyRows),
    developmentItems: competencyRows.filter(row => row.status === 'gap'),
    formalRequirements: rows.filter(row => FORMAL_CATEGORIES.has(row.category)),
    formalGaps: assessable.filter(row => FORMAL_CATEGORIES.has(row.category) && row.status === 'gap'),
    otherGaps: assessable.filter(row => row.assessmentKind === 'other' && row.status === 'gap'),
    unassessedItems: assessable.filter(row => row.status === 'unassessed'),
    sourceContextItems: rows.filter(row => !row.assessable),
    missingCategories: built.missingCategories || CORE_REQUIREMENT_CATEGORIES.filter(id => !rows.some(row => row.category === id && row.requirementState !== 'source_not_stated')),
    unclassifiedCompetencyRows: unclassified,
    // Missing domain classifications cannot silently disappear from a full radar.
    domainRadarAvailable: domains.length >= 3 && unclassified.length === 0 && domains.every(domain => domain.classificationReviewed),
    source: built.source || null, archive: built.archive || null, coverageMetadata: built.coverage || null,
    sourceCompleteness: built.sourceCompleteness || 'not-established',
    eligibilityVerdict: null, abilityScore: null,
    assessmentMeaning: 'student-self-report-not-verification-of-eligibility'};
}
