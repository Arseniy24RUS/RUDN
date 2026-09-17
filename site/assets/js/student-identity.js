// Stable names are shared by the administrative migration and device recovery.
export const officialTicket = profile => profile?.officialTicket || profile?.ticket || '';
export const mergedRecordId = (sourceKey, id) => `merged-${sourceKey}-${id}`;

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
      return Object.fromEntries(Object.entries(item).map(([name, child]) => [name, visit(child, name)]));
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
