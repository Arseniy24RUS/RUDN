// Stable names are shared by the administrative migration and device recovery.
export const officialTicket = profile => profile?.officialTicket || profile?.ticket || '';
export const mergedRecordId = (sourceKey, id) => `merged-${sourceKey}-${id}`;

/** Public puzzle results keep their first delivery key when private owners merge. */
export function puzzleLeaderboardAttemptId(attempt) {
  let id = attempt?.leaderboardAttemptId ?? attempt?.id;
  const source = attempt?.mergedFrom;
  if (attempt?.leaderboardAttemptId == null && /^\d{5,20}$/.test(source?.studentKey || '') &&
      id === mergedRecordId(source.studentKey, source.attemptId)) {
    // Recover the exact recorded source of a legacy migration. A valid public
    // ID can itself start with "merged-", so never infer deeper ancestry from it.
    id = source.attemptId;
  }
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(id)) {
    throw Object.assign(new TypeError('Invalid puzzle leaderboard attempt ID'), {code: 'database/invalid-attempt-id'});
  }
  return id;
}

/** Invalid local receipts stay durable, but cannot prevent public rows rendering. */
export function puzzleLeaderboardLocalResult(attempt) {
  if (attempt?.type !== 'map-puzzle' || !attempt.leaderboard) return null;
  try { return {...attempt.leaderboard, id: puzzleLeaderboardAttemptId(attempt), pending: true}; }
  catch { return null; } // Delivery still applies the strict identifier validator.
}

export function rekeyStudentValue(value, {from, to, ids = {}}) {
  const visit = (item, field = '') => {
    if (typeof item === 'string') {
      if (field === 'studentKey' && item === from) return to;
      if (field === 'owner' && item === `student:${from}`) return `student:${to}`;
      if (['id', 'attemptId', 'sourceAttemptId', 'draftId', 'attachmentIds'].includes(field)) return ids[item] || item;
      for (const prefix of ['pending-attachment:', 'rudn-attachment:']) {
        if (item.startsWith(prefix) && ids[item.slice(prefix.length)]) return prefix + ids[item.slice(prefix.length)];
      }
      return item;
    }
    if (Array.isArray(item)) return item.map(child => visit(child, field));
    if (item && typeof item === 'object' && !(typeof Blob !== 'undefined' && item instanceof Blob)) {
      const puzzleResult = item.type === 'map-puzzle' && item.leaderboard;
      const next = Object.fromEntries(Object.entries(item).map(([name, child]) => [name,
        // This JSON payload may already be public under append-only rules.
        puzzleResult && name === 'leaderboard' ? JSON.parse(JSON.stringify(child)) : visit(child, name)]));
      if (puzzleResult) {
        try { next.leaderboardAttemptId = puzzleLeaderboardAttemptId(item); }
        catch { /* Retain an unpublishable receipt without blocking the owner's other work. */ }
      }
      return next;
    }
    return item;
  };
  return visit(value);
}

export function rekeyStudentAttempt(attempt, from, to) {
  const id = mergedRecordId(from, attempt.id);
  return {...rekeyStudentValue(attempt, {from, to, ids: {[attempt.id]: id}}), id, studentKey: to,
    mergedFrom: {studentKey: from, attemptId: attempt.id}};
}

const normalizedName = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
export function absentFromRoster(profile, absences = {}) {
  return Object.values(absences).some(record => record.absent !== false && record.group === profile.group &&
    normalizedName(record.fullName) === normalizedName(profile.fullName));
}
