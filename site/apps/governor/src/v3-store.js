(function (root) {
  'use strict';
  const G = root.GovernorGame;
  const STORE = 'attempts';
  const DB_NAME = 'rudn-governor-v3';
  const copy = value => structuredClone(value);
  let opening;
  function database() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('governor-v3/storage-blocked'));
    }).catch(error => {
      opening = null;
      throw error;
    });
    return opening;
  }
  async function transaction(scope, write, callback) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, write ? 'readwrite' : 'readonly');
      const store = tx.objectStore(STORE);
      const request = store.get(scope);
      let result, failure;
      request.onsuccess = () => {
        try {
          const current = request.result || null;
          const next = callback(current);
          result = next === undefined ? current : next;
          if (write && next !== undefined) store.put(next, scope);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || Error('governor-v3/storage-write'));
      tx.onerror = () => reject(tx.error || Error('governor-v3/storage-write'));
    });
  }
  function read(scope) {
    return transaction(scope, false, () => undefined);
  }
  function put(scope, expected, draft, canWrite) {
    return transaction(scope, true, current => {
      if (!canWrite()) throw Error('governor-v3/profile-changed');
      if ((current?.recordRevision ?? -1) !== (expected?.recordRevision ?? -1) ||
          current?.state.attemptId !== expected?.state.attemptId) {
        throw Object.assign(Error('governor-v3/concurrent-change'), {code:'concurrent-change', current});
      }
      return {...copy(draft), recordRevision: (current?.recordRevision ?? -1) + 1};
    });
  }
  G.V3Store = {read, put};
})(globalThis);
