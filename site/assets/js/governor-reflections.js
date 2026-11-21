/** Append-only seminar reflections. The original simulation and its grade stay immutable. */
export const GOVERNOR_REFLECTION_SCHEMA = 1;
export const governorReflectionText = value => typeof value === 'string' ? value.trim().slice(0, 6000) : '';

function isCampaign(attempt, studentKey) {
  return Boolean(attempt && typeof studentKey === 'string' && studentKey && attempt.studentKey === studentKey && attempt.activitySlug === 'seminar-7' &&
    attempt.type === 'governor-simulator' && attempt.source === 'native-v1' &&
    typeof attempt.id === 'string' && attempt.id && attempt.governor && typeof attempt.governor === 'object');
}

export function isGovernorReflection(attempt, parent) {
  return isCampaign(parent, parent?.studentKey) && attempt?.studentKey === parent.studentKey &&
    attempt.activitySlug === 'seminar-7' && attempt.type === 'governor-reflection' && attempt.source === 'native-v1' &&
    attempt.schemaVersion === GOVERNOR_REFLECTION_SCHEMA && attempt.recordGrade === false &&
    attempt.parentAttemptId === parent.id && typeof attempt.id === 'string' && attempt.id.length > 0 && attempt.id !== parent.id &&
    Number.isSafeInteger(attempt.reflectionRevision) && attempt.reflectionRevision > 0 &&
    typeof attempt.reflection === 'string' && attempt.reflection.length <= 6000 &&
    typeof attempt.createdAt === 'string' && Number.isFinite(Date.parse(attempt.createdAt));
}

export function makeGovernorReflection({id, parent, reflection, revision, now = new Date().toISOString()}) {
  const record = {
    id, studentKey: parent?.studentKey, activitySlug: 'seminar-7', type: 'governor-reflection', source: 'native-v1',
    schemaVersion: GOVERNOR_REFLECTION_SCHEMA, recordGrade: false, parentAttemptId: parent?.id,
    reflectionRevision: revision, reflection: governorReflectionText(reflection), createdAt: now
  };
  if (!isGovernorReflection(record, parent)) throw Object.assign(new Error('governor/invalid-reflection'), {code: 'governor/invalid-reflection'});
  return record;
}

export function latestGovernorReflection(attempts, parent) {
  // Offline edits have no server-assigned sequence. Use their creation time,
  // then revision and id for a stable order, independently of object key order.
  return Object.values(attempts || {}).filter(attempt => isGovernorReflection(attempt, parent)).sort((a, b) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.reflectionRevision - a.reflectionRevision || b.id.localeCompare(a.id))[0] || null;
}

export function governorAttemptsWithReflections(attempts, studentKey) {
  return Object.values(attempts || {}).filter(attempt => isCampaign(attempt, studentKey)).map(attempt => {
    const reflection = latestGovernorReflection(attempts, attempt);
    return reflection ? {...attempt, reflection: reflection.reflection, reflectionRecordId: reflection.id,
      reflectionUpdatedAt: reflection.createdAt} : {...attempt};
  }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
