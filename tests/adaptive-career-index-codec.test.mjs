import test from 'node:test';
import assert from 'node:assert/strict';
import {CANDIDATE_COLUMNS, CANDIDATE_ENCODING, decodeCandidatePayload} from '../site/apps/career/assets/adaptive-index-codec.mjs';

const version = 'functional-2.0.0-fixture';
const featureIds = new Set(['budget_planning', 'budget_planning_2']);
const fixture = () => ({schemaVersion:2, version, encoding:CANDIDATE_ENCODING, columns:[...CANDIDATE_COLUMNS],
  dictionaries:{
    strings:['Специалист', 'Бюджетный отдел', 'Москва', 'https://example.org/vacancy/1',
      'data/vacancies/details/source.json', 'data/adaptive-index/details/d0000.json.gz'],
    employers:[['employer-1', 'Орган власти']],
    profiles:[{id:'a'.repeat(64), features:{budget_planning:.8, budget_planning_2:1}}]
  },
  rows:[
    ['vacancy-1', 0, 1, 0, 'ru-77', 2, 0, 'duties', 'specialist', 'archived', true, 3, 4, 'bank', 1, 5],
    ['vacancy-2', 0, 1, 0, null, 2, 0, 'knowledge', 'leadership', 'profile', null, 3, 4, 'position', 1, 5]
  ]
});
const read = (payload = fixture(), options = {}) => decodeCandidatePayload(payload, {version, count:2, featureIds, ...options});
const rejects = (change, options) => {const payload = fixture(); change(payload); assert.throws(() => read(payload, options), TypeError);};

test('compact rows restore individual vacancies and their exact source metadata', () => {
  const rows = read();
  assert.deepEqual(rows[0], {id:'vacancy-1', title:'Специалист', department:'Бюджетный отдел',
    employerId:'employer-1', employerName:'Орган власти', regionId:'ru-77', location:'Москва',
    profileId:'a'.repeat(64), features:{budget_planning:.8, budget_planning_2:1}, evidenceLevel:'duties',
    responsibilityLevel:'specialist', status:'archived', archive:true, sourceURL:'https://example.org/vacancy/1',
    sourcePath:'data/vacancies/details/source.json', sourceType:'bank', sourceRecordCount:1,
    detailPath:'data/adaptive-index/details/d0000.json.gz'});
  assert.equal(rows[1].id, 'vacancy-2');
  assert.equal(rows[1].regionId, null);
  assert.equal(rows[1].status, 'profile');
});

test('repeated source vacancies share one immutable numerical profile without merging their identities', () => {
  const payload = fixture(), rows = read(payload);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[0].features, rows[1].features);
  assert.ok(Object.isFrozen(rows[0].features));
  assert.throws(() => {rows[0].features.budget_planning = 0;}, TypeError);
  payload.dictionaries.profiles[0].features.budget_planning = .1;
  assert.equal(rows[0].features.budget_planning, .8);
});

test('separate national parts share profiles, while conflicts and rejected parts cannot corrupt the cache', () => {
  const profileCache = new Map(), first = read(fixture(), {profileCache}), second = read(fixture(), {profileCache});
  assert.equal(profileCache.size, 1);
  assert.equal(first[0].features, second[0].features);
  rejects(p => {p.dictionaries.profiles[0].features.budget_planning = .5;}, {profileCache});
  const emptyCache = new Map();
  rejects(p => {p.rows[0][3] = -1;}, {profileCache:emptyCache});
  assert.equal(emptyCache.size, 0);
  assert.equal(profileCache.get('a'.repeat(64)).budget_planning, .8);
});

test('an empty regional shard stays empty', () => {
  const payload = {...fixture(), rows:[], dictionaries:{strings:[], employers:[], profiles:[]}};
  assert.deepEqual(read(payload, {count:0}), []);
});

test('schema, encoding, version, count and column order must match the manifest contract', () => {
  for (const change of [
    p => {p.schemaVersion = 1;}, p => {p.version = 'functional-1.0.0-old';}, p => {p.encoding = 'unknown';},
    p => {p.rows.pop();}, p => {p.columns.reverse();}, p => {delete p.columns[0];}, p => {p.rows[0].pop();}
  ]) rejects(change);
  assert.throws(() => read(fixture(), {count:1}), TypeError);
  assert.throws(() => decodeCandidatePayload(fixture()), TypeError);
});

test('invalid dictionary references and missing dictionary values cannot become partial candidates', () => {
  for (const column of [1, 2, 3, 5, 6, 11, 12, 15]) {
    for (const invalid of [-1, .5, '0', true, 999]) rejects(p => {p.rows[0][column] = invalid;});
  }
  for (const change of [
    p => {p.dictionaries.strings[0] = null;}, p => {delete p.dictionaries.strings[2];},
    p => {p.dictionaries.employers[0] = ['employer-1'];}, p => {delete p.dictionaries.profiles[0];},
    p => {delete p.rows[0];}
  ]) rejects(change);
});

test('duplicate vacancy and profile identities are rejected', () => {
  rejects(p => {p.rows[1][0] = p.rows[0][0];});
  rejects(p => {p.dictionaries.profiles.push(structuredClone(p.dictionaries.profiles[0]));});
});

test('only evidence from source duties, skills and knowledge can enter the functional index', () => {
  for (const level of ['duties', 'skills', 'knowledge', 'requirements', 'functional']) {
    const payload = fixture(); payload.rows[0][7] = level;
    assert.equal(read(payload)[0].evidenceLevel, level);
  }
  for (const level of ['title', 'department', '', null]) rejects(p => {p.rows[0][7] = level;});
});

test('numerical features must be positive, finite and known to the current taxonomy', () => {
  for (const value of [0, -1, 1.1, NaN, Infinity, '.8']) rejects(p => {p.dictionaries.profiles[0].features.budget_planning = value;});
  rejects(p => {p.dictionaries.profiles[0].features.foreign_feature = .5;});
  rejects(p => {p.dictionaries.profiles[0].features = {};});
  rejects(p => {Object.defineProperty(p.dictionaries.profiles[0].features, '__proto__', {value:.5, enumerable:true});});
});

test('source links allow public HTTP(S) URLs and reject executable schemes or credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/relative-source', '', 'https://user:password@example.org/']) {
    rejects(p => {p.dictionaries.strings[3] = url;});
  }
  const payload = fixture(); payload.dictionaries.strings[3] = 'http://example.org/archive.pdf';
  assert.equal(read(payload)[0].sourceURL, 'http://example.org/archive.pdf');
});

test('detail references stay inside the declared adaptive detail collection', () => {
  for (const path of ['../details/d0000.json.gz', 'https://example.org/d0000.json.gz',
    'data/adaptive-index/details/d0000.json', 'data/adaptive-index/details/../d0000.json.gz']) {
    rejects(p => {p.dictionaries.strings[5] = path;});
  }
});

test('region, responsibility, status and source multiplicity retain their exact meanings', () => {
  for (const [column, value] of [[4, 'all'], [4, 77], [8, 'minister'], [9, 'open'], [10, 0], [13, 'unknown'], [14, 2], [14, '1']]) {
    rejects(p => {p.rows[0][column] = value;});
  }
});
