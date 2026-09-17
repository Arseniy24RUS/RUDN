// Reproduce the observed Firefox transaction/result ordering without a browser.
// Only IDB event delivery is controlled; assertions use the real durable store.
import assert from 'node:assert/strict';
import {setImmediate as nextTask} from 'node:timers/promises';
import {test} from 'node:test';
import {createDurableStore} from '../site/assets/js/durable-store.js';

function controlledDatabase(records, delivery = 'complete-before-continuations') {
  let transaction;
  const factory = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction(names, mode) {
            assert.deepEqual(names, ['attempts']);
            assert.equal(mode, 'readonly');
            let complete = false;
            transaction = {
              finish() { complete = true; transaction.oncomplete(); },
              abort() {
                if (complete) throw new DOMException('Already committed', 'InvalidStateError');
                transaction.onabort();
              },
              objectStore(name) {
                assert.equal(name, 'attempts');
                return {getAll() {
                  const read = {};
                  queueMicrotask(() => {
                    read.result = records;
                    read.onsuccess();
                    // Deliver completion before promise reactions that derive the
                    // public return value. This exposed undefined in real CI.
                    if (delivery === 'complete-before-continuations') transaction.finish();
                    if (delivery === 'abort-after-success') {
                      transaction.error = new DOMException('Commit rejected', 'DataCloneError');
                      transaction.onabort();
                    }
                  });
                  return read;
                }};
              },
            };
            return transaction;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  const store = createDurableStore({indexedDB: factory, localStorage: null, locks: null, broadcast: false});
  return {store, finish: () => transaction.finish()};
}

test('completion before action continuations preserves empty and populated lists and memory readback', async () => {
  for (const rows of [[], [{id: 'stored', owner: 'student:one', payload: {id: 'one', points: 5}}]]) {
    const {store} = controlledDatabase(rows);
    const expected = rows.map(row => row.payload);
    assert.deepEqual(await store.listAttempts({owner: 'student:one'}), expected);
    store.close();
    assert.deepEqual(await store.listAttempts({owner: 'student:one'}), expected, 'successful IDB read also updates the fallback mirror');
  }
});

test('a ready action result cannot acknowledge a still-uncommitted transaction', async () => {
  const {store, finish} = controlledDatabase([], 'manual-completion');
  let settled = false;
  const pending = store.listAttempts().then(result => { settled = true; return result; });
  await nextTask();
  assert.equal(settled, false);
  finish();
  assert.deepEqual(await pending, []);
  store.close();
});

test('an action error after completion is propagated, never replaced by undefined', async () => {
  const {store} = controlledDatabase([{id: 'invalid', owner: 'student:one', payload: {uncloneable() {}}}]);
  await assert.rejects(store.listAttempts(), {name: 'DataCloneError'});
  store.close();
});

test('request success cannot acknowledge a rejected transaction', async () => {
  const {store} = controlledDatabase([], 'abort-after-success');
  await assert.rejects(store.listAttempts(), {name: 'DataCloneError'});
  store.close();
});
