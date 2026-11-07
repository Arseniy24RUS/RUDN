/** Decode one verified, compact snapshot. Source text is loaded separately for the final roles. */
export const ADAPTIVE_INDEX_SCHEMA_VERSION = 2;
export const CANDIDATE_ENCODING = 'career-candidates-dictionary-v1';
export const CANDIDATE_COLUMNS = Object.freeze([
  'id', 'title', 'department', 'employer', 'regionId', 'location', 'profile',
  'evidenceLevel', 'responsibilityLevel', 'status', 'archive', 'sourceURL',
  'sourcePath', 'sourceType', 'sourceRecordCount', 'detailPath'
]);
export const FUNCTIONAL_EVIDENCE_LEVELS = Object.freeze(['duties', 'skills', 'knowledge', 'requirements', 'functional']);

const functionalLevels = new Set(FUNCTIONAL_EVIDENCE_LEVELS);
const responsibilityLevels = new Set(['specialist', 'leadership', 'unspecified']);
const statuses = new Set(['archived', 'profile', 'unconfirmed']);
const sourceTypes = new Set(['bank', 'portal', 'position']);
const detailPathPattern = /^data\/adaptive-index\/details\/d\d{4}\.json\.gz$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, maximum, allowEmpty = false) => typeof value === 'string' && value.length <= maximum && (allowEmpty || value.trim().length > 0);
const fail = message => {throw new TypeError('Invalid functional candidate index: ' + message);};

/** `version` and `count` must come from the checked manifest descriptor.
 * `featureIds`, when supplied, binds every numerical feature to the current question bank.
 * An optional `profileCache` shares validated profiles across parts of the same snapshot.
 * Shared profile objects remain shared and immutable after decoding.
 */
export function decodeCandidatePayload(payload, {version, count, featureIds, profileCache} = {}) {
  if (!text(version, 128) || !Number.isInteger(count) || count < 0 || count > 1000000) fail('invalid expected identity');
  if (!object(payload) || payload.schemaVersion !== ADAPTIVE_INDEX_SCHEMA_VERSION || payload.version !== version ||
    payload.encoding !== CANDIDATE_ENCODING || !Array.isArray(payload.rows) || payload.rows.length !== count) fail('payload identity mismatch');
  if (!Array.isArray(payload.columns) || payload.columns.length !== CANDIDATE_COLUMNS.length ||
    CANDIDATE_COLUMNS.some((column, index) => payload.columns[index] !== column)) fail('column mismatch');
  const dictionaries = payload.dictionaries;
  if (!object(dictionaries) || !Array.isArray(dictionaries.strings) || !Array.isArray(dictionaries.employers) ||
    !Array.isArray(dictionaries.profiles)) fail('missing dictionaries');
  const {strings, employers} = dictionaries;
  for (const value of strings) if (!text(value, 65536, true)) fail('invalid string dictionary');
  for (const value of employers) if (!Array.isArray(value) || value.length !== 2 ||
    !text(value[0], 600, true) || !text(value[1], 10000, true)) fail('invalid employer dictionary');
  let allowedFeatures = null;
  if (featureIds !== undefined) {
    if (!Array.isArray(featureIds) && !(featureIds instanceof Set)) fail('invalid feature catalogue');
    allowedFeatures = new Set(featureIds);
    if (!allowedFeatures.size || [...allowedFeatures].some(id => !text(id, 128))) fail('invalid feature catalogue');
  }
  if (profileCache !== undefined && !(profileCache instanceof Map)) fail('invalid profile cache');
  const profileIds = new Set(), profiles = [], additions = new Map();
  for (const profile of dictionaries.profiles) {
    if (!object(profile) || !text(profile.id, 128) || profileIds.has(profile.id) || !object(profile.features)) fail('invalid profile identity');
    profileIds.add(profile.id);
    const entries = Object.entries(profile.features);
    if (!entries.length || entries.some(([id, value]) => !/^[a-z][a-z0-9_-]{0,127}$/.test(id) ||
      ['constructor', 'prototype', '__proto__'].includes(id) || allowedFeatures && !allowedFeatures.has(id) ||
      !Number.isFinite(value) || value <= 0 || value > 1)) fail('invalid functional profile');
    let features = profileCache?.get(profile.id);
    if (profileCache?.has(profile.id)) {
      if (!object(features) || !Object.isFrozen(features) || Object.keys(features).length !== entries.length ||
        entries.some(([id, value]) => features[id] !== value)) fail('inconsistent shared profile');
    } else {
      features = Object.freeze(Object.fromEntries(entries));
      if (profileCache) additions.set(profile.id, features);
    }
    profiles.push({id:profile.id, features});
  }
  const lookup = (dictionary, index, field) => {
    if (!Number.isInteger(index) || index < 0 || index >= dictionary.length) fail('invalid ' + field + ' reference');
    return dictionary[index];
  };
  const checkedURLs = new Set(), ids = new Set();
  const checkURL = value => {
    if (checkedURLs.has(value)) return;
    if (!text(value, 10000)) fail('missing source URL');
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail('invalid source URL');
    } catch {fail('invalid source URL');}
    checkedURLs.add(value);
  };
  const decoded = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const tuple = payload.rows[index];
    if (!Array.isArray(tuple) || tuple.length !== CANDIDATE_COLUMNS.length) fail('invalid row width');
    const [id, titleRef, departmentRef, employerRef, regionId, locationRef, profileRef, evidenceLevel,
      responsibilityLevel, status, archive, sourceURLRef, sourcePathRef, sourceType, sourceRecordCount, detailPathRef] = tuple;
    if (!text(id, 600) || ids.has(id)) fail('invalid or duplicate vacancy identity');
    ids.add(id);
    if (regionId !== null && (typeof regionId !== 'string' || !/^ru-\d{2}$/.test(regionId))) fail('invalid region');
    if (!functionalLevels.has(evidenceLevel)) fail('non-functional source evidence');
    if (!responsibilityLevels.has(responsibilityLevel) || !statuses.has(status) ||
      archive !== null && typeof archive !== 'boolean') fail('invalid role metadata');
    if (!sourceTypes.has(sourceType) || sourceRecordCount !== 1) fail('invalid individual source record');
    const title = lookup(strings, titleRef, 'title');
    if (!text(title, 10000)) fail('missing role title');
    const department = lookup(strings, departmentRef, 'department');
    const [employerId, employerName] = lookup(employers, employerRef, 'employer');
    const location = lookup(strings, locationRef, 'location');
    const profile = lookup(profiles, profileRef, 'profile');
    const sourceURL = lookup(strings, sourceURLRef, 'source URL');
    checkURL(sourceURL);
    const sourcePath = lookup(strings, sourcePathRef, 'source path');
    if (!text(sourcePath, 10000)) fail('missing source locator');
    const detailPath = lookup(strings, detailPathRef, 'detail path');
    if (!detailPathPattern.test(detailPath)) fail('invalid detail path');
    decoded[index] = {id, title, department, employerId, employerName, regionId, location,
      profileId:profile.id, features:profile.features, evidenceLevel, responsibilityLevel,
      status, archive, sourceURL, sourcePath, sourceType, sourceRecordCount, detailPath};
  }
  // A rejected part must not leave unverified entries in a caller's shared cache.
  if (profileCache) for (const [id, features] of additions) profileCache.set(id, features);
  return decoded;
}
