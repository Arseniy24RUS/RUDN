import {hash, ReceptionError} from './schema.mjs';

export const PRIVATE_ROOT = 'rudn-platform/v1/receptionAI';

// Firebase deploys functions/ without the browser's access.js. Keep this
// server-side check in step with that module and the Reception topic order.
const DAY_MS = 86400000;
const MOSCOW_OFFSET_MS = 3 * 3600000;
const RECEPTION_TOPIC = 6;

function academicWeekStart(year) {
  const septemberFirst = Date.UTC(year, 8, 1);
  const daysSinceMonday = (new Date(septemberFirst).getUTCDay() + 6) % 7;
  return septemberFirst - daysSinceMonday * DAY_MS - MOSCOW_OFFSET_MS;
}

export function createFirebaseAssessmentGate(db) {
  return async now => {
    const moscowYear = new Date(now + MOSCOW_OFFSET_MS).getUTCFullYear();
    const year = now >= academicWeekStart(moscowYear) ? moscowYear : moscowYear - 1;
    const path = `rudn-platform/v1/access/overrides/${year}/topic-${RECEPTION_TOPIC}`;
    const override = (await db.ref(path).get()).val();
    const state = typeof override === 'string' ? override : override?.state;
    if (state === 'open' || state === 'closed') return state === 'open';
    return now >= academicWeekStart(year) + (RECEPTION_TOPIC * 2 - 2) * 7 * DAY_MS;
  };
}

export async function loadPrivateCatalogue(db, version) {
  if (typeof version !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(version)) throw new ReceptionError('not_configured', 503);
  const rows = (await db.ref(`${PRIVATE_ROOT}/catalogs/${version}`).get()).val();
  if (!rows || typeof rows !== 'object') throw new ReceptionError('not_configured', 503);
  return Object.entries(rows).map(([id, record]) => {
    if (!record || typeof record.payload !== 'string' || hash(record.payload) !== record.sha256) throw new ReceptionError('invalid_case', 503);
    let c; try { c = JSON.parse(record.payload); } catch { throw new ReceptionError('invalid_case', 503); }
    if (c.id !== id) throw new ReceptionError('invalid_case', 503); return c;
  });
}

export function createFirebaseResultWriter(db) {
  return async ({sessionId, studentKey, uid, result, startedAt, completedAt, cases, decisions}) => {
    if (!/^\d{5,20}$/.test(studentKey || '')) throw new ReceptionError('profile_required', 403);
    const id = result.attemptId, base = 'rudn-platform/v1';
    // Preserve the exact historical writer payload on an interrupted pilot
    // journal retry; new-bank attempts identify their actual dossier version.
    const fullBank=cases.some(c=>c.version?.startsWith('reception-ai-bank-'));
    const contentVersion=fullBank?[...new Set(cases.map(c=>c.version))].sort().join('|'):'reception-ai-pilot-v1';
    const attempt = {id, studentKey, ownerUid: uid, createdAt: new Date(startedAt).toISOString(), completedAt: new Date(completedAt).toISOString(),
      type: 'citizen-reception', engine: fullBank?'reception-ai-v3':'reception-ai-v1', serverScored: true, activitySlug: 'seminar-5', title: 'Приёмная. Интерактивная смена',
      points: result.points, maxPoints: 5, recordGrade: true, reviewStatus: 'server-scored', sourceSessionId: sessionId,
      contentVersion, summary: {total: result.total, points: result.points, maxPoints: 5, caseCount: cases.length, complete: true},
      cases, decisions};
    const signature = hash(attempt);
    const saved = await db.ref(`${base}/attempts/${studentKey}/${id}`).transaction(old => old || {...attempt, serverSignature: signature});
    if (saved.snapshot.val()?.serverSignature !== signature) throw new ReceptionError('result_conflict', 409);
    // The same existing platform convention: preserve a better result. A retry
    // after the attempt write is safe; it completes a previously missed grade.
    await db.ref(`${base}/grades/${studentKey}/seminar-5`).transaction(old => {
      if (old && Number(old.points) >= result.points) return undefined;
      return {points: result.points, max: 5, ownerUid: uid, sourceAttemptId: id, activitySlug: 'seminar-5',
        serverScored: true, updatedAt: new Date(completedAt).toISOString()};
    });
  };
}
