import {copy} from './schema.mjs';

// Transactions are synchronous pure updates. A global queue in the memory
// adapter mirrors Firebase atomicity for concurrent local requests.
export function createMemoryStore() {
  let root = {}, queue = Promise.resolve();
  const read = path => path.split('/').filter(Boolean).reduce((value, key) => value?.[key], root) ?? null;
  return {
    async get(path) { await queue; return copy(read(path)); },
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
