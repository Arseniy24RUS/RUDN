import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expandTerritorialCatalog, selectedPositionMaterialShards,
  mergeTerritorialAuthorityDetails} from '../site/apps/career/assets/territorial-catalog.mjs';
import {rankFromProfile, profileFromMeans, SCALE_IDS, CONDITION_IDS} from '../site/apps/career/assets/scoring.mjs';
import {rankJourneyAuthorities, buildVacancyRequirements} from '../site/apps/career/assets/career-journey-model.mjs';

const base = new URL('../site/apps/career/', import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, base), 'utf8'));
const regions = read('data/territories.json');
const authorities = expandTerritorialCatalog(read('data/territorial-authorities.json'));
const baseline = read('data/authorities.json');
const completeCatalogue = [...baseline, ...authorities];
const provenance = read('data/territorial-catalog-provenance.json');
const manifest = read('data/sourced-position-materials.json');

test('89 selectable subjects retain unique puzzle IDs and Moscow-first ordering', () => {
  assert.equal(regions.length, 89);
  assert.equal(regions[0].id, 'ru-77');
  assert.equal(regions[0].mapId, '102269');
  assert.deepEqual(regions.filter((r) => r.defaultSelected).map((r) => r.id), ['ru-77']);
  assert.equal(new Set(regions.map((r) => r.id)).size, 89);
  assert.equal(new Set(regions.map((r) => r.mapId)).size, 89);
  assert.deepEqual(regions.slice(1).map((r) => r.name), regions.slice(1).map((r) => r.name).sort((a, b) => a.localeCompare(b, 'ru')));
  for (const region of regions) assert.ok(region.name && region.name_en && region.name_zh);
});

test('every selected subject has distinct source-backed regional or local choices', () => {
  assert.equal(new Set([...baseline, ...authorities].map((a) => a.id)).size, baseline.length + authorities.length);
  for (const region of regions) {
    const group = authorities.filter((a) => a.regionId === region.id);
    assert.ok(group.length >= 3, `Missing choices for ${region.name}`);
    assert.ok(group.every((a) => ['regional', 'municipal'].includes(a.level)));
    assert.ok(group.every((a) => a.descriptionSources.some((s) => /^https?:\/\//.test(s.url))));
  }
  assert.ok(authorities.some((a) => a.regionId === 'ru-77' && a.level === 'municipal'));
  assert.ok(authorities.filter((a) => a.level === 'national-corporation').every((a) => a.regionId === null && a.entityType === 'corporation'));
  assert.equal(authorities.length, provenance.counts.newEmployers);
});

test('all shared templates produce finite scores without invented working conditions', () => {
  const tracks = read('data/tracks.json');
  const sectors = read('data/sectors.json');
  const knownTracks = new Set(tracks.map((t) => t.id));
  const knownSectors = new Set(sectors.map((s) => s.id));
  for (const authority of authorities) {
    assert.ok(authority.tracks.length > 0);
    for (const link of authority.tracks) {
      assert.ok(knownTracks.has(link.id));
      assert.equal(link.conditions, undefined);
      assert.ok(link.sectors.every((s) => knownSectors.has(s.id) && s.weight >= 0 && s.weight <= 1));
    }
  }
  const result = rankFromProfile({authorities, tracks, sectors,
    roleProfile: profileFromMeans(Object.fromEntries(SCALE_IDS.map((id) => [id, id === 'A' ? 5 : id === 'E' ? 4 : 2])), 40),
    prioritySectors: ['FIN', 'ECO', 'SOC'], lowPrioritySectors: [], conditions: {}});
  assert.ok(result.ranked.every((a) => Number.isFinite(a.rawScore) && a.rawScore >= 0 && a.rawScore <= 100));
  for (const region of regions) assert.equal(result.ranked.filter((a) => a.regionId === region.id).slice(0, 3).length, 3);
});

test('the complete 2754-employer journey ranks all 89 territorial groups with three choices', () => {
  const result = rankJourneyAuthorities({authorities: completeCatalogue,
    tracks: read('data/tracks.json'), sectors: read('data/sectors.json'),
    roleProfile: profileFromMeans({N: 3, K: 2, A: 5, M: 4, C: 2, E: 3, D: 3, T: 2, I: 3}, 40),
    prioritySectors: ['FIN', 'ECO', 'DIG'], lowPrioritySectors: [],
    conditions: Object.fromEntries(CONDITION_IDS.map((id) => [id, 3])),
    regionIds: regions.map((region) => region.id), limit: 3});
  assert.equal(result.ranked.length, 2754);
  assert.ok(result.ranked.every((authority) => Number.isFinite(authority.rawScore)
    && authority.rawScore >= 0 && authority.rawScore <= 100));
  assert.equal(result.federalTotal, 76);
  assert.equal(result.federal.length, 3);
  assert.ok(result.federal.every((authority) => !authority.regionId));
  assert.equal(result.regions.length, 89);
  assert.equal(result.recommendations.length, 3 + 89 * 3);
  for (const group of result.regions) {
    assert.equal(group.authorities.length, 3, group.regionId);
    assert.equal(new Set(group.authorities.map((authority) => authority.id)).size, 3);
    assert.ok(group.authorities.every((authority) => authority.regionId === group.regionId));
  }
});

test('Rostec, VEB and ASV can each enter the national top three without special treatment', () => {
  const tracks = read('data/tracks.json');
  const sectors = read('data/sectors.json');
  const cases = [
    {id: 'rostec', trackId: 'POLICY', prioritySectors: ['IND', 'ECO', 'INT']},
    {id: 'veb', trackId: 'POLICY', prioritySectors: ['FIN', 'ECO', 'DIG']},
    {id: 'asv', trackId: 'LEGAL', prioritySectors: ['FIN', 'ECO', 'DIG']}
  ];
  for (const scenario of cases) {
    const vector = tracks.find((track) => track.id === scenario.trackId).vector;
    const means = Object.fromEntries(SCALE_IDS.map((id) => [id, Math.round(1 + 4 * vector[id])]));
    const result = rankJourneyAuthorities({authorities: completeCatalogue, tracks, sectors,
      roleProfile: profileFromMeans(means, 40), prioritySectors: scenario.prioritySectors,
      lowPrioritySectors: [], conditions: Object.fromEntries(CONDITION_IDS.map((id) => [id, 3])),
      regionIds: [], limit: 3});
    assert.equal(result.ranked.length, 76);
    assert.ok(result.federal.some((authority) => authority.id === scenario.id), scenario.id);
    assert.ok(result.federal.every((authority) => !authority.regionId));
  }
});

test('position data is requested only for the national and selected territorial groups', () => {
  assert.deepEqual(selectedPositionMaterialShards(manifest, []).map((r) => r.path), [manifest.national.path]);
  const selected = selectedPositionMaterialShards(manifest, ['ru-77', 'unknown', 'ru-77']);
  assert.equal(selected.filter((r) => r.regionId === 'ru-77').length, 1);
  assert.ok(selected.every((r) => r.regionId === null || r.regionId === 'ru-77'));
  assert.throws(() => selectedPositionMaterialShards({}, []), /invalid-position-manifest/);
});

test('published job requirements preserve source scope, missingness and classifications', () => {
  const ids = new Set();
  const employers = new Set([...baseline, ...authorities].map((a) => a.id));
  let total = 0;
  let requirements = 0;
  let uniqueRequirementRows = 0;
  let assessableRequirementRows = 0;
  let reviewedClassifications = 0;
  for (const shard of [manifest.national, ...manifest.regions]) {
    const payload = read(shard.path);
    assert.equal(payload.positions.length, shard.count);
    for (const position of payload.positions) {
      total += 1;
      assert.ok(!ids.has(position.id));
      ids.add(position.id);
      assert.ok(employers.has(position.institutionId));
      assert.ok(/^https?:\/\//.test(position.url));
      assert.equal(position.currentRecruitmentVerified, false);
      if (position.kind === 'position-profile') assert.equal(position.status, 'profile');
      if (position.kind === 'archived-vacancy') assert.equal(position.status, 'archived');
      assert.ok(position.requirements.some((r) => r.selfAssessmentEligible));
      const parsed = buildVacancyRequirements(position);
      assert.ok(parsed.assessableCount > 0, position.id);
      uniqueRequirementRows += parsed.rows.length;
      assessableRequirementRows += parsed.assessableCount;
      for (const row of position.requirements) {
        requirements += 1;
        assert.ok(['education', 'experience', 'knowledge', 'skills', 'eligibility', 'other'].includes(row.category));
        assert.equal(typeof row.sourceText, 'string');
        assert.ok(row.evidenceSourceUrl);
        if (['source_not_stated', 'explicitly_not_required', 'source_uncertain'].includes(row.requirementState)) {
          assert.equal(row.selfAssessmentEligible, false);
        }
        if (row.competencyDomainId && row.classificationProvenance?.reviewStatus === 'reviewed') reviewedClassifications += 1;
      }
    }
  }
  assert.equal(total, manifest.total);
  assert.equal(total, provenance.counts.positionMaterials);
  assert.equal(requirements, provenance.counts.requirements);
  assert.equal(uniqueRequirementRows, 8716);
  assert.equal(assessableRequirementRows, 7847);
  assert.ok(reviewedClassifications > 0);
});

test('lazy employer details belong to the exact institution and preserve full sources', () => {
  const authority = authorities.find((a) => a.id === 'moscow-finance-department');
  const payload = read(authority.detailPath);
  const detail = mergeTerritorialAuthorityDetails(authority, payload);
  assert.ok(detail.descriptionParagraphs.length >= 2);
  assert.ok(detail.descriptionSources.length >= 1);
  assert.throws(() => mergeTerritorialAuthorityDetails({...authority, regionId: 'ru-74'}, payload), /authority-details-mismatch/);
  assert.ok(fs.statSync(fileURLToPath(new URL('data/territorial-authorities.json', base))).size < 3 * 1024 * 1024);
});
