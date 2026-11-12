import {copy, fail} from './schema.mjs';

// Legacy sessions already have owner-scoped IDs in the start quota ledger.
// Read only that small ledger for migration, never every private session payload.
// Large installations can backfill the index separately; an interactive recovery
// must not turn into an unbounded database scan.
export const LEGACY_RECOVERY_LIMITS = Object.freeze({days: 400, sessions: 128, bytes: 2_000_000});
export function legacySessionIds(ledger, ownerKey) {
  const days = Object.keys(ledger || {});
  if (days.length > LEGACY_RECOVERY_LIMITS.days || Buffer.byteLength(JSON.stringify(ledger || {}), 'utf8') > LEGACY_RECOVERY_LIMITS.bytes) {
    fail('recovery_index_required', 409);
  }
  const ids = new Set();
  for (const day of days) {
    for (const id of Object.keys(ledger[day]?.[ownerKey]?.ids || {})) {
      if (/^[a-f0-9]{40}$/.test(id)) ids.add(id);
      if (ids.size > LEGACY_RECOVERY_LIMITS.sessions) fail('recovery_index_required', 409);
    }
  }
  return [...ids];
}

// Transactions are synchronous pure updates. A global queue in the memory
// adapter mirrors Firebase atomicity for concurrent local requests.
export function createMemoryStore() {
  let root = {}, queue = Promise.resolve();
  const read = path => path.split('/').filter(Boolean).reduce((value, key) => value?.[key], root) ?? null;
  return {
    async get(path) { await queue; return copy(read(path)); },
    async getLegacySessionIds(ownerKey) { await queue; return legacySessionIds(read('starts'), ownerKey); },
    async transaction(path, update) {
      const job = queue.then(() => {
        const current = copy(read(path)), next = update(current);
        if (next === undefined) return {committed: false, value: current};
        const parts = path.split('/').filter(Boolean); let parent = root;
        for (const part of parts.slice(0, -1)) parent = parent[part] ||= {};
        if (!parts.length) root = copy(next);
        else if (next === null) delete parent[parts.at(-1)];
        else parent[parts.at(-1)] = copy(next);
        return {committed: true, value: copy(next)};
      });
      queue = job.then(() => undefined, () => undefined); return job;
    }
  };
}

export function createFirebaseStore(db, root = 'rudn-platform/v1/receptionAI') {
  const wrapped = path => /^sessions\/[A-Za-z0-9_-]+$/.test(path);
  const decode = (path, value) => wrapped(path) && value ? JSON.parse(value.payload) : value;
  const encode = (path, value) => wrapped(path) && value !== null && value !== undefined ? {schema: 1, payload: JSON.stringify(value)} : value;
  return {
    async get(path) { return decode(path, (await db.ref(`${root}/${path}`).get()).val()); },
    async getLegacySessionIds(ownerKey) {
      const snapshot = await db.ref(`${root}/starts`).orderByKey().limitToLast(LEGACY_RECOVERY_LIMITS.days + 1).get();
      return legacySessionIds(snapshot.val(), ownerKey);
    },
    async transaction(path, update) {
      let abortedOnEmpty;
      const result = await db.ref(`${root}/${path}`).transaction(value => {
        const next = update(decode(path, value));
        // The SDK initially reports null on a cold cache. Compare against null
        // without changing it so the server can retry with the actual value.
        abortedOnEmpty = value === null && next === undefined;
        return abortedOnEmpty ? null : encode(path, next);
      }, undefined, false);
      return {committed: result.committed && !abortedOnEmpty, value: decode(path, result.snapshot.val())};
    }
  };
}
