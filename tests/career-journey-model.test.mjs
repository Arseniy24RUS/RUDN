import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SCALE_IDS, scoreAuthority, profileFromMeans} from '../site/apps/career/assets/scoring.mjs';
import {
  sanitizeJourneyPreferences, rankJourneyAuthorities, compareDesiredAuthorities,
  buildAuthorityDevelopment, buildVacancyRequirements, summarizeVacancyAssessment,
  sanitizeVacancyAssessment, canonicalRequirementCategory, isNationalAuthority, requirementStateFromText
} from '../site/apps/career/assets/career-journey-model.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL(`../site/apps/career/data/${name}.json`, import.meta.url), 'utf8'));
const data = Object.fromEntries(['authorities', 'questions', 'tracks', 'sectors', 'competencies'].map(name => [name, read(name)]));
const careerFramework = read('career-framework');
const profile = profileFromMeans({N: 2, K: 2, A: 3, M: 4, C: 5, E: 2, D: 5, T: 2, I: 3});
const context = {roleProfile: profile, sectorPreferences: {DIG: 1, ADM: .82, FIN: .66, SOC: .5},
  conditions: {FIELD: 3, SCHEDULE: 3, FORMAL: 4, SECURITY: 2}, focusAreas: {}};
const base = data.authorities.find(authority => authority.id === 'mincifry');
const employers = [
  {...base, id: 'national-a', level: 'federal'},
  {...base, id: 'national-b', level: 'federal'},
  {...base, id: 'corporation', entityType: 'corporation', level: 'national-corporation'},
  {...base, id: 'moscow-a', level: 'regional', regionId: 'ru-77'},
  {...base, id: 'moscow-b', level: 'regional', regionId: 'ru-77'},
  {...base, id: 'moscow-municipal', level: 'municipal', regionId: 'ru-77'},
  {...base, id: 'spb-a', level: 'regional', regionId: 'ru-78'},
  {...base, id: 'spb-b', level: 'regional', regionId: 'ru-78'},
  {...base, id: 'spb-municipal', level: 'municipal', regionId: 'ru-78'}
];
const regions = [{id: 'ru-77'}, {id: 'ru-78'}];
const rank = (overrides = {}) => rankJourneyAuthorities({authorities: employers, tracks: data.tracks, context, regionIds: ['ru-77'], ...overrides});
const req = (id, category, sourceText, extra = {}) => ({id, category, sourceText, requirementState: 'stated',
  sourceLocator: `Official document, paragraph ${id}`, evidenceSourceUrl: 'https://example.gov/announcement', ...extra});
const vacancy = (requirements, id = 'position-1') => ({id, institutionId: 'national-a', title: 'Published position',
  source: {url: 'https://example.gov/announcement', publishedAt: '2026-01-02'},
  archive: {isArchive: true}, coverage: {requirements: 'partial'}, requirements});

test('Moscow is a one-time default and can be deliberately deselected', () => {
  assert.deepEqual(sanitizeJourneyPreferences(null, {regions, authorities: employers}),
    {schemaVersion: 1, regionIds: ['ru-77'], desiredIds: [], confirmed: false});
  assert.deepEqual(sanitizeJourneyPreferences({regionIds: []}, {regions, authorities: employers}).regionIds, []);
  assert.deepEqual(sanitizeJourneyPreferences({regionIds: ['ru-78', 'missing', 'ru-78']}, {regions, authorities: employers}).regionIds, ['ru-78']);
});

test('desired institutions remain distinct, ordered and restricted to the selected territories', () => {
  const stored = {regionIds: ['ru-77'], desiredIds: ['moscow-municipal', 'corporation', 'corporation', 'national-a', 'spb-a'], confirmed: true};
  const cleaned = sanitizeJourneyPreferences(stored, {regions, authorities: employers});
  assert.deepEqual(cleaned.desiredIds, ['moscow-municipal', 'corporation', 'national-a']);
  assert.equal(cleaned.confirmed, true);
  const changed = sanitizeJourneyPreferences({...cleaned, regionIds: []}, {regions, authorities: employers});
  assert.deepEqual(changed.desiredIds, ['corporation', 'national-a']);
  assert.equal(changed.confirmed, false);
  assert.deepEqual(stored.desiredIds, ['moscow-municipal', 'corporation', 'corporation', 'national-a', 'spb-a']);
});

test('federal and regional groups include corporations and municipal employers', () => {
  const result = rank({regionIds: ['ru-77', 'ru-78']});
  assert.equal(result.federal.length, 3);
  assert.ok(result.federal.some(authority => authority.id === 'corporation'));
  assert.deepEqual(result.regions.map(group => group.regionId), ['ru-77', 'ru-78']);
  for (const group of result.regions) {
    assert.equal(group.authorities.length, 3);
    assert.ok(group.authorities.every(authority => authority.regionId === group.regionId));
    assert.ok(group.authorities.some(authority => authority.level === 'municipal'));
  }
  assert.equal(result.recommendations.length, 9);
});

test('empty or unknown territories do not leak recommendations from other regions', () => {
  assert.equal(rank({regionIds: []}).ranked.length, 3);
  const empty = rank({regionIds: ['ru-99']});
  assert.equal(empty.ranked.length, 3);
  assert.deepEqual(empty.regions, [{regionId: 'ru-99', authorities: [], total: 0, municipalCount: 0}]);
  assert.equal(isNationalAuthority({id: 'local-fund', entityType: 'fund', level: 'regional', regionId: 'ru-77'}), false);
  assert.equal(isNationalAuthority({id: 'legacy-corp', entityType: 'corporation'}), true);
});

test('journey rankings preserve the existing formula without a desired-choice bonus', () => {
  const result = rank();
  const map = new Map(data.tracks.map(track => [track.id, track]));
  for (const authority of result.ranked) {
    const original = employers.find(entry => entry.id === authority.id);
    assert.equal(authority.rawScore, scoreAuthority(original, context, map).rawScore);
  }
  const withWishes = rank({desiredIds: ['national-a', 'moscow-b', 'corporation']});
  assert.deepEqual(withWishes.ranked, result.ranked);
});

test('the raw questionnaire contract is accepted, and incomplete answers do not create a profile', () => {
  const inputs = {answers: Object.fromEntries(data.questions.map(question => [question.id, 3])),
    prioritySectors: ['DIG', 'FIN', 'ADM', 'INT'], lowPrioritySectors: ['AGR', 'EMR'],
    conditions: {FIELD: 3, SCHEDULE: 3, FORMAL: 3, SECURITY: 3}, focusAreas: {}};
  const options = {authorities: employers, tracks: data.tracks, questions: data.questions, sectors: data.sectors, regionIds: ['ru-77']};
  assert.deepEqual(rankJourneyAuthorities({...options, ...inputs}), rankJourneyAuthorities({...options, inputs}));
  const partial = {...inputs, answers: {...inputs.answers}};
  delete partial.answers[data.questions[0].id];
  assert.throws(() => rankJourneyAuthorities({...options, ...partial}), /incomplete-interest-profile/);
  assert.throws(() => rank({context: {...context, roleProfile: {raw: {...profile.raw, N: NaN}}}}), /invalid-interest-profile/);
});

test('duplicate institutions and repeated region IDs cannot create repeated cards', () => {
  const result = rank({authorities: [...employers, employers[0], employers[3]], regionIds: ['ru-77', 'ru-77']});
  assert.equal(result.ranked.length, 6);
  assert.equal(result.regions.length, 1);
  assert.equal(new Set(result.recommendations.map(authority => authority.id)).size, result.recommendations.length);
});

test('exact matches include national and selected-region top threes without rearranging wishes', () => {
  const result = rank();
  const rows = compareDesiredAuthorities(['moscow-municipal', 'corporation', 'missing'], result.ranked, result);
  assert.deepEqual(rows.map(row => [row.authorityId, row.priority, row.matched]),
    [['moscow-municipal', 1, true], ['corporation', 2, true], ['missing', 3, false]]);
  assert.equal(rows[0].recommendations[0].regionId, 'ru-77');
  assert.equal(rows[1].recommendations[0].groupId, 'federal');
  assert.equal(rows[2].authority, null);
});

test('reflection never treats authored coefficients as measured competence or questionnaire units', () => {
  const chosen = {id: 'legal-role', track: data.tracks.find(track => track.id === 'LEGAL')};
  const reflection = buildAuthorityDevelopment(chosen, profile, {...data, careerFramework});
  assert.equal(reflection.available, true);
  assert.equal(reflection.trackId, 'LEGAL');
  assert.equal(reflection.skillDeficits, null);
  assert.equal(reflection.overlayOnPersonalInterestRadarAllowed, false);
  assert.equal(reflection.comparableToQuestionnaireUnits, false);
  assert.equal(reflection.lowerInterestDimensions[0].id, 'N');
  assert.ok(reflection.competencies.some(competency => competency.id === 'legal-literacy'));
  assert.ok(reflection.portfolio.length);
  assert.ok(reflection.rows.every(row => !('gap' in row) && !('targetRaw' in row)));
  assert.equal(buildAuthorityDevelopment({id: 'unknown'}, profile).available, false);
});

test('complete source clauses and their provenance survive normalization', () => {
  const wording = 'Высшее образование по специальности «Юриспруденция» ИЛИ «Экономика»;\nстаж не менее 2 лет. ' + 'Полная формулировка. '.repeat(180);
  const source = vacancy([req('source-id', 'education-and-experience', wording, {
    competencyDomainId: null, scope: 'alternatives-as-published', selfAssessmentEligible: true,
    classificationProvenance: {reviewStatus: 'reviewed', isEmployerAssessment: false}})]);
  const before = JSON.stringify(source);
  const built = buildVacancyRequirements(source);
  assert.equal(built.rows.length, 1);
  const row = built.rows[0];
  assert.equal(row.sourceText, wording);
  assert.equal(row.text, wording.trim());
  assert.equal(row.category, 'other');
  assert.equal(row.sourceCategory, 'education-and-experience');
  assert.equal(row.scope, 'alternatives-as-published');
  assert.equal(row.sourceId, 'source-id');
  assert.equal(row.sourceLocator, 'Official document, paragraph source-id');
  assert.equal(row.evidenceSourceUrl, 'https://example.gov/announcement');
  assert.equal(row.learningEligible, false);
  assert.equal(JSON.stringify(source), before);
});

test('missing data is distinct from an explicit absence of requirements', () => {
  const built = buildVacancyRequirements({id: 'feed-record', education: 'Высшее образование',
    experience: 'Без предъявления требований к стажу', duties: ['Готовить сложные отчёты'], url: 'https://gossluzhba.gov.ru/vacancy/source'});
  assert.deepEqual(built.missingCategories, ['knowledge', 'skills']);
  assert.equal(built.rows.length, 2);
  assert.equal(built.rows.find(row => row.category === 'experience').requirementState, 'explicitly_not_required');
  assert.equal(built.assessableCount, 1);
  assert.ok(!built.rows.some(row => row.text.includes('сложные отчёты')));
});

test('source context, generic references and preferred qualifications are not counted as mandatory gaps', () => {
  const built = buildVacancyRequirements(vacancy([
    req('a', 'education', 'Высшее образование'),
    req('b', 'education', 'Специальность не устанавливается', {requirementState: 'explicitly_not_required', scope: 'education_specialism_only'}),
    req('c', 'knowledge', null, {requirementState: 'source_not_stated'}),
    req('d', 'skill', 'Навыки в соответствии с задачами отдела', {selfAssessmentEligible: false}),
    req('e', 'experience', 'Опыт работы в организации желателен', {requirementState: 'preferred'})
  ]));
  const summary = summarizeVacancyAssessment(built, Object.fromEntries(built.rows.map(row => [row.id, 'gap'])));
  assert.equal(built.rows.length, 5);
  assert.equal(summary.total, 1);
  assert.equal(summary.formalGaps.length, 1);
  assert.equal(summary.developmentItems.length, 0);
  assert.equal(summary.sourceContextItems.length, 4);
  assert.equal(summary.groups.find(group => group.id === 'education').explicitlyNotRequired, 1);
  assert.equal(summary.groups.find(group => group.id === 'knowledge').metShare, null);
});

test('standalone source phrases preserve explicit absence without misreading qualified alternatives', () => {
  for (const value of ['Без предъявления требований к стажу', 'Не требуется.', 'No experience required']) {
    assert.equal(requirementStateFromText(value), 'explicitly_not_required');
  }
  assert.equal(requirementStateFromText('Не указано'), 'source_not_stated');
  assert.equal(requirementStateFromText(''), 'source_not_stated');
  assert.equal(requirementStateFromText('Стаж не требуется при наличии диплома магистра'), 'stated');
  assert.equal(requirementStateFromText('Высшее образование; требования к специальности не предъявляются'), 'stated');
});

test('stable statement keys ignore source numbering but reset for changed text, category, scope or vacancy', () => {
  const original = req('old-id', 'knowledge', 'Знание бюджетного законодательства', {scope: 'specific-knowledge'});
  const one = buildVacancyRequirements(vacancy([original])).rows[0];
  const renamed = buildVacancyRequirements(vacancy([{...original, id: 'new-id', sourceLocator: 'New page'}])).rows[0];
  assert.equal(one.id, renamed.id);
  for (const changed of [
    {...original, sourceText: 'Знание налогового законодательства'},
    {...original, category: 'skills'},
    {...original, scope: 'different-scope'},
    {...original, requirementState: 'explicitly_not_required'}
  ]) assert.notEqual(one.id, buildVacancyRequirements(vacancy([changed])).rows[0].id);
  assert.notEqual(one.id, buildVacancyRequirements(vacancy([original], 'position-2')).rows[0].id);
});

test('identical repeated source clauses count once; skill aliases and source metadata remain usable', () => {
  const one = req('a', 'skill', 'Работа с электронными таблицами');
  const built = buildVacancyRequirements(vacancy([one, {...one, id: 'duplicate'}]));
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0].category, 'skills');
  assert.equal(built.rows[0].sourceCategory, 'skill');
  assert.equal(canonicalRequirementCategory('formal-eligibility'), 'eligibility');
  assert.equal(canonicalRequirementCategory('basic-knowledge-and-skills'), 'other');
});

test('an unanswered statement is neither a confirmed deficit nor a satisfied requirement', () => {
  const built = buildVacancyRequirements(vacancy([
    req('a', 'knowledge', 'Знание А'), req('b', 'knowledge', 'Знание Б'), req('c', 'skill', 'Умение В')
  ]));
  const [a, b] = built.rows;
  const summary = summarizeVacancyAssessment(built, {[a.id]: 'met', [b.id]: 'gap'});
  assert.equal(summary.total, 3);
  assert.equal(summary.met, 1);
  assert.equal(summary.gap, 1);
  assert.equal(summary.unassessed, 1);
  assert.equal(summary.metShare, 1 / 3);
  assert.equal(summary.coverage, 2 / 3);
  assert.equal(summary.complete, false);
  assert.deepEqual(summary.developmentItems.map(row => row.sourceId), ['b']);
  assert.equal(summary.unassessedItems.length, 1);
  assert.equal(summary.eligibilityVerdict, null);
  assert.equal(summary.abilityScore, null);
});

test('education, seniority and eligibility gaps stay outside the list of missing competencies', () => {
  const built = buildVacancyRequirements(vacancy([
    req('a', 'education', 'Диплом магистра'), req('b', 'experience', 'Стаж 3 года'),
    req('c', 'formal-eligibility', 'Условие допуска к службе'), req('d', 'knowledge', 'Знание предмета')
  ]));
  const summary = summarizeVacancyAssessment(built, Object.fromEntries(built.rows.map(row => [row.id, 'gap'])));
  assert.equal(summary.formalGaps.length, 3);
  assert.deepEqual(summary.developmentItems.map(row => row.sourceId), ['d']);
  assert.equal(summary.competencySummary.total, 1);
});

test('source domains are not inferred from keywords and absent domains have no zero scores', () => {
  const built = buildVacancyRequirements(vacancy([req('a', 'knowledge', 'Знание SQL, Excel и Бюджетного кодекса')]));
  const summary = summarizeVacancyAssessment(built, {});
  assert.deepEqual(summary.domains, []);
  assert.equal(summary.unclassifiedCompetencyRows.length, 1);
  assert.equal(summary.domainRadarAvailable, false);
  assert.equal(summary.groups.find(group => group.id === 'experience').metShare, null);
});

test('competency domains use identical met/total denominators and require complete reviewed classification for radar', () => {
  const items = [
    req('a', 'knowledge', 'Знание А', {competencyDomainId: 'law-regulation'}),
    req('b', 'skills', 'Умение Б', {competencyDomainId: 'data-digital'}),
    req('c', 'skills', 'Умение В', {competencyDomainId: 'data-digital'}),
    req('d', 'knowledge', 'Знание Г', {competencyDomainId: 'communication'})
  ].map(item => ({...item, classificationProvenance: {reviewStatus: 'reviewed'}}));
  const built = buildVacancyRequirements(vacancy(items));
  const summary = summarizeVacancyAssessment(built, {[built.rows[1].id]: 'met'});
  const digital = summary.domains.find(domain => domain.id === 'data-digital');
  assert.equal(digital.total, 2);
  assert.equal(digital.metShare, .5);
  assert.equal(digital.unassessedShare, .5);
  assert.equal(digital.targetShare, 1);
  assert.equal(summary.domainRadarAvailable, true);
  const incomplete = buildVacancyRequirements(vacancy([...items, req('unclassified', 'skills', 'Ещё одно умение')]));
  assert.equal(summarizeVacancyAssessment(incomplete).domainRadarAvailable, false);
  const unreviewed = buildVacancyRequirements(vacancy(items.map(item => ({...item, classificationProvenance: {reviewStatus: 'provisional'}}))));
  assert.equal(summarizeVacancyAssessment(unreviewed).domainRadarAvailable, false);
});

test('stale answers, foreign requirements, unsupported statuses and mismatched exact signatures do not carry over', () => {
  const built = buildVacancyRequirements(vacancy([req('a', 'skills', 'Умение А'), req('b', 'skills', 'Умение Б')]));
  const [a, b] = built.rows;
  const answers = {[a.id]: {status: 'met', signature: a.signature}, [b.id]: {status: 'gap', signature: 'changed source'}, foreign: 'met'};
  assert.deepEqual(sanitizeVacancyAssessment(built, answers), {[a.id]: 'met'});
  const summary = summarizeVacancyAssessment(built, answers);
  assert.equal(summary.met, 1);
  assert.equal(summary.gap, 0);
  assert.equal(summary.unassessed, 1);
  assert.equal(summarizeVacancyAssessment(built, {[a.id]: true, [b.id]: 'unsure'}).unassessed, 2);
});

test('no requirements means no denominator, no completion and no invented target', () => {
  const built = buildVacancyRequirements({id: 'empty', duties: ['Prepare a report']});
  const summary = summarizeVacancyAssessment(built);
  assert.equal(summary.total, 0);
  assert.equal(summary.metShare, null);
  assert.equal(summary.targetShare, null);
  assert.equal(summary.complete, false);
  assert.deepEqual(summary.missingCategories, ['education', 'experience', 'knowledge', 'skills']);
  assert.equal(summary.domains.length, 0);
});

test('pure helper operations do not mutate source data, questionnaire answers or checklist state', () => {
  const source = vacancy([req('a', 'skills', 'Умение А')]);
  const built = buildVacancyRequirements(source);
  const answers = {[built.rows[0].id]: 'met'};
  const before = JSON.stringify({employers, context, source, built, answers});
  rank();
  buildVacancyRequirements(source);
  summarizeVacancyAssessment(built, answers);
  sanitizeVacancyAssessment(built, answers);
  buildAuthorityDevelopment(base, profile, {...data, careerFramework});
  assert.equal(JSON.stringify({employers, context, source, built, answers}), before);
  assert.equal(SCALE_IDS.length, 9);
});
