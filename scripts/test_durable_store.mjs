// Isolated real-browser storage regressions. No Firebase, production data or UI login.
// npm exec --package=playwright -- node scripts/test_durable_store.mjs
// Or set PLAYWRIGHT_PATH to an existing Playwright installation.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright'); }
catch { throw new Error('Playwright is required. Use an existing installation via PLAYWRIGHT_PATH.'); }
const source = await readFile(new URL('../site/assets/js/durable-store.js', import.meta.url));
const supportSources = Object.fromEntries(await Promise.all(['checkpoint-sync.js', 'firebase-rest.js', 'student-identity.js'].map(async name => [`/${name}`, await readFile(new URL(`../site/assets/js/${name}`, import.meta.url))])));
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/durable-store.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(source); }
  else if (supportSources[request.url]) { response.setHeader('Content-Type', 'text/javascript'); response.end(supportSources[request.url]); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Durable store regression harness</title><main>Isolated device persistence regression tests</main>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const engines = (process.env.DURABLE_TEST_BROWSERS || 'chromium,webkit').split(',');
const report = [];
try {
  for (const engine of engines) {
    const browser = await playwright[engine].launch({headless: true});
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      const results = await page.evaluate(async () => {
        const {createDurableStore, DurableConflictError} = await import('/durable-store.js');
        const results = [];
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
        const scope = name => ({owner: `student:${name}`, activitySlug: 'seminar-1-classroom', mode: 'classroom', attemptId: `${name}-attempt`});
        const make = (name, options = {}) => createDurableStore({databaseName: `test-${name}`, broadcast: false, ...options});
        const test = async (name, action) => { await action(); results.push({name, passed: true}); };
        const mapStorage = () => {
          const map = new Map();
          return {get length() { return map.size; }, key: i => [...map.keys()][i] ?? null, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k)};
        };
        await test('checkpoint and coalesced outbox are durable; slow ack is conditional', async () => {
          const store = make('atomic'); const s = scope('atomic');
          const first = await store.checkpoint({...s, state: {answers: {q1: 'federal:executive'}, index: 1, started: 12345}});
          equal(first.revision, 1, 'first revision'); assert(first.saveStatus.durable, 'IDB durable');
          equal(first.saveStatus.storage, 'indexedDB', 'storage');
          const oldOp = (await store.listPending({owner: s.owner}))[0];
          await store.checkpoint({...s, state: {answers: {q1: 'federal:executive', q2: 'regional:executive'}, index: 2, started: 12345}});
          equal(await store.ack(oldOp.id, oldOp.revision), false, 'old response must not ack new state');
          const pending = await store.listPending({owner: s.owner}); equal(pending.length, 1, 'coalesced checkpoint'); equal(pending[0].revision, 2, 'new revision retained');
          await store.ack(pending[0].id, 2, {remoteRevision: 'etag-2'});
          equal((await store.getSaveStatus(s)).state, 'saved', 'cloud acknowledgment');
          store.close();
          const restored = make('atomic'); const draft = await restored.loadDraft(s);
          equal(draft.state.index, 2, 'reload question'); equal(draft.state.started, 12345, 'reload timer');
          equal((await restored.listPending({owner: s.owner})).length, 0, 'ack stays acknowledged after reload'); restored.close();
        });
        await test('rapid checkpoints retain last text and monotonic revisions', async () => {
          const store = make('rapid'); const s = scope('rapid');
          await Promise.all(Array.from({length: 30}, (_, i) => store.checkpoint({...s, state: {text: 'x'.repeat(i + 1)}})));
          await store.flush(); const draft = await store.loadDraft(s);
          equal(draft.state.text.length, 30, 'last keystroke'); equal(draft.revision, 30, 'serialized revisions'); store.close();
        });
        await test('two open instances serialize through IndexedDB without lost revisions', async () => {
          const left = make('cross-tab'); const right = make('cross-tab'); const s = scope('cross-tab');
          await Promise.all(Array.from({length: 12}, (_, i) => (i % 2 ? left : right).checkpoint({...s, state: {index: i}})));
          equal((await left.loadDraft(s)).revision, 12, 'cross-tab transaction revision'); left.close(); right.close();
        });
        await test('completion is atomic and cannot resurrect an unfinished draft', async () => {
          const store = make('complete'); const s = scope('complete');
          await store.checkpoint({...s, state: {answers: {q1: 'yes'}, index: 49}});
          const final = await store.complete({...s, state: {answers: {q1: 'yes'}, result: 50}, attempt: {id: s.attemptId, studentKey: 'complete', activitySlug: s.activitySlug, score: 50, recordGrade: false}});
          const revision = final.revision;
          await store.complete({...s, state: {}, attempt: {id: s.attemptId, score: 0}});
          await store.checkpoint({...s, state: {answers: {}}});
          const draft = await store.loadDraft(s); equal(draft.phase, 'completed', 'completed'); equal(draft.revision, revision, 'idempotent completion'); equal(draft.state.result, 50, 'completion preserved');
          const attempts = await store.listAttempts({owner: s.owner}); equal(attempts.length, 1, 'one attempt'); equal(attempts[0].score, 50, 'no replacement score');
          equal((await store.listPending({owner: s.owner})).length, 2, 'final checkpoint and attempt queued'); store.close();
          const reload = make('complete'); equal((await reload.loadDraft(s)).phase, 'completed', 'reload remains complete'); equal((await reload.listPending({owner: s.owner})).length, 2, 'both operations survive'); reload.close();
        });
        await test('a completed UI checkpoint can still receive its final attempt', async () => {
          const store = make('ui-complete'); const s = scope('ui-complete');
          await store.checkpoint({...s, state: {phase: 'completed', score: 5}});
          await store.complete({...s, state: {phase: 'completed', score: 5}, attempt: {id: s.attemptId, score: 5}});
          equal((await store.listAttempts({owner: s.owner})).length, 1, 'attempt persisted after UI completion'); store.close();
        });
        await test('owners and explicit new attempts stay isolated', async () => {
          const store = make('owners'); const s = scope('owners');
          await store.checkpoint({...s, state: {answer: 'student'}});
          await store.checkpoint({...s, owner: 'teacher:uid-test', state: {answer: 'teacher'}}, {queue: false});
          equal(await store.loadDraft({...s, owner: 'student:another'}), null, 'other student cannot see draft');
          equal((await store.loadDraft({...s, owner: 'teacher:uid-test'})).state.answer, 'teacher', 'teacher separate');
          await store.checkpoint({...s, attemptId: 'new-attempt', state: {answers: {}}});
          equal((await store.loadDraft(s)).state.answer, 'student', 'old attempt retained');
          equal((await store.loadDraft({...s, attemptId: 'new-attempt'})).state.answers, {}, 'fresh empty attempt'); store.close();
        });
        await test('stale base revision preserves both versions without silent overwrite', async () => {
          const store = make('conflict'); const s = scope('conflict');
          await store.checkpoint({...s, state: {decision: 'first'}});
          await store.checkpoint({...s, baseRevision: 1, state: {decision: 'second'}});
          let conflict;
          try { await store.checkpoint({...s, baseRevision: 1, state: {decision: 'other-device'}}); } catch (error) { conflict = error; }
          assert(conflict instanceof DurableConflictError, 'explicit conflict');
          equal((await store.loadDraft(s)).state.decision, 'second', 'newer version kept');
          const versions = await store.listConflicts({owner: s.owner}); equal(versions.length, 1, 'one conflict'); equal(versions[0].incoming.state.decision, 'other-device', 'incoming saved'); store.close();
        });
        await test('defer, quarantine and retry do not block another operation', async () => {
          const store = make('retry'); const s = scope('retry');
          await store.checkpoint({...s, state: {}});
          await store.checkpoint({...s, attemptId: 'another', state: {}});
          const operations = await store.listPending({owner: s.owner});
          await store.defer(operations[0].id, {code: 'network/unavailable', message: 'must not be stored'}, {revision: operations[0].revision, retryAt: Date.now() + 100000});
          equal((await store.listPending({owner: s.owner})).length, 1, 'deferred only one');
          await store.quarantine(operations[0].id, {code: 'permission-denied'}, {revision: operations[0].revision});
          await store.retry(operations[0].id, {revision: operations[0].revision});
          equal((await store.listPending({owner: s.owner})).length, 2, 'explicit retry'); store.close();
        });
        await test('attachments survive reload and remain in portable backup', async () => {
          const store = make('blob'); const s = scope('blob');
          const file = await store.putAttachment({owner: s.owner, attemptId: s.attemptId, id: 'file-1', blob: new Blob(['citizen appeal'], {type: 'text/plain'}), name: 'appeal.txt'});
          await store.checkpoint({...s, state: {text: 'draft'}, attachmentIds: [file.id]});
          assert((await store.getSaveStatus(s)).durable, 'blob durable'); store.close();
          const reload = make('blob'); equal(await (await reload.getAttachment(file.id)).blob.text(), 'citizen appeal', 'reload blob');
          const backup = await reload.exportBackup({owner: s.owner}); assert(backup.attachments[0].dataUrl.startsWith('data:text/plain;base64,'), 'portable attachment'); equal(backup.drafts.length, 1, 'owner backup'); reload.close();
        });
        await test('missing required attachment is not falsely durable', async () => {
          const store = make('missing'); const s = scope('missing');
          const draft = await store.checkpoint({...s, state: {}, attachmentIds: ['missing-file']});
          equal(draft.saveStatus.state, 'unsafe', 'missing file unsafe'); equal(draft.saveStatus.missingAttachment, true, 'missing flag'); store.close();
        });
        await test('confirmed uploads are reused by later checkpoints and attempts; local Blob survives', async () => {
          const {createCheckpointSync} = await import('/checkpoint-sync.js');
          for (const fallback of [false, true]) {
            const s = scope(`uploaded-${fallback}`), local = mapStorage();
            let store = make(`uploaded-${fallback}`, fallback ? {indexedDB: null, localStorage: local} : {});
            const file = await store.putAttachment({owner: s.owner, attemptId: s.attemptId, blob: new Blob(['offline original']), name: 'work.txt'});
            const records = new Map(); let uploads = 0, attempts = 0;
            const createSync = () => createCheckpointSync({store, deviceId: 'upload-test-device', getIdentity: () => ({owner: s.owner, studentKey: s.owner.slice(8), uid: 'fixture-uid', generation: 1}),
              transport: {transaction: async (path, update) => { const old = records.get(path) || null; const next = update(old); if(next !== undefined)records.set(path, next); return {value: records.get(path)}; }},
              uploadAttachment: async record => { uploads++; equal(await record.blob.text(), 'offline original', 'upload bytes'); return {url: 'https://example.test/saved/work.txt', path: 'saved/work.txt'}; },
              commitAttempt: async (_record, {attachments}) => { attempts++; equal(attachments[0].url, 'https://example.test/saved/work.txt', 'confirmed URL supplied'); }
            });
            await store.checkpoint({...s, state: {text: 'first'}, attachmentIds: [file.id]});
            equal((await createSync().flush()).saved, 1, 'first checkpoint confirmed');
            equal(uploads, 1, 'one upload');
            let rejected = false;
            try { await store.markAttachmentUploaded(file.id, {owner: 'student:other', attemptId: s.attemptId, url: 'https://example.test/other'}); } catch { rejected = true; }
            assert(rejected, 'cannot reassign attachment owner');
            store.close(); store = make(`uploaded-${fallback}`, fallback ? {indexedDB: null, localStorage: local} : {});
            equal(await (await store.getAttachment(file.id)).blob.text(), 'offline original', 'Blob retained after reload');
            await store.checkpoint({...s, state: {text: 'second'}, attachmentIds: [file.id]});
            await createSync().flush();
            await store.complete({...s, state: {text: 'final'}, attempt: {id: s.attemptId, recordGrade: false}, attachmentIds: [file.id]});
            await createSync().flush();
            equal(uploads, 1, 'reload, later checkpoint and final attempt do not reupload'); equal(attempts, 1, 'one final attempt');
            equal((await store.listPending({owner: s.owner})).length, 0, 'all confirmed'); store.close();
          }
        });
        await test('IndexedDB unavailable uses a durable synchronous storage fallback', async () => {
          const local = mapStorage(); const s = scope('fallback');
          const store = make('fallback', {indexedDB: null, localStorage: local});
          const saved = await store.checkpoint({...s, state: {answers: {q1: 'yes'}}});
          equal(saved.saveStatus.storage, 'localStorage', 'fallback labeled'); assert(saved.saveStatus.durable, 'fallback retained'); store.close();
          const reload = make('fallback', {indexedDB: null, localStorage: local});
          equal((await reload.loadDraft(s)).state.answers.q1, 'yes', 'fallback reload'); equal((await reload.listPending({owner: s.owner})).length, 1, 'fallback outbox'); reload.close();
        });
        await test('fallback files are serialized rather than discarded', async () => {
          const local = mapStorage(); const s = scope('fallback-file');
          const store = make('fallback-file', {indexedDB: null, localStorage: local});
          const file = await store.putAttachment({owner: s.owner, attemptId: s.attemptId, blob: new Blob(['file contents'])});
          assert(file.durable, 'fallback attachment durable');
          await store.complete({...s, state: {}, attempt: {id: s.attemptId}, attachmentIds: [file.id]}); store.close();
          const reload = make('fallback-file', {indexedDB: null, localStorage: local}); equal(await (await reload.getAttachment(file.id)).blob.text(), 'file contents', 'fallback bytes'); assert((await reload.getSaveStatus(s)).durable, 'fallback completed attachment retained'); reload.close();
        });
        await test('unavailable/full storage reports unsafe but preserves emergency export', async () => {
          const full = {length: 0, getItem: () => null, key: () => null, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); }, removeItem: () => {}};
          const s = scope('full'); const store = make('full', {indexedDB: null, localStorage: full});
          const saved = await store.checkpoint({...s, state: {importantText: 'recover me'}});
          equal(saved.saveStatus.state, 'unsafe', 'unsafe visibly represented'); equal(saved.saveStatus.durable, false, 'must not lie');
          equal((await store.getSaveStatus(s)).state, 'unsafe', 'later status must stay unsafe');
          const backup = await store.exportBackup({owner: s.owner}); equal(backup.drafts[0].state.importantText, 'recover me', 'memory export recoverable'); store.close();
        });
        await test('localStorage quota does not invalidate a successful IDB save', async () => {
          const full = {length: 0, getItem: () => null, key: () => null, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); }, removeItem: () => {}};
          const store = make('idb-only', {localStorage: full}); const s = scope('idb-only');
          const saved = await store.checkpoint({...s, state: {answer: 42}}); assert(saved.saveStatus.durable, 'IDB success authoritative'); equal(saved.saveStatus.storage, 'indexedDB', 'IDB storage'); store.close();
        });
        await test('uncommitted safety journal replays once and retains owner', async () => {
          const local = mapStorage(); const s = scope('journal');
          const intent = {id: 'interrupted-write', kind: 'checkpoint', input: {...s, state: {text: 'last keystroke'}}, options: {}, createdAt: Date.now()};
          local.setItem('rudn.durable.journal.v1:interrupted-write', JSON.stringify(intent));
          const store = make('journal', {localStorage: local});
          equal((await store.loadDraft(s)).state.text, 'last keystroke', 'replay'); equal((await store.loadDraft(s)).revision, 1, 'single replay');
          store.close(); local.setItem('rudn.durable.journal.v1:interrupted-write', JSON.stringify(intent));
          const reload = make('journal', {localStorage: local}); equal((await reload.loadDraft(s)).revision, 1, 'retained journal cannot double replay'); reload.close();
        });
        await test('legacy migration copies, verifies and preserves original draft and attempts', async () => {
          const local = mapStorage(); const s = scope('legacy');
          const legacy = {owner: s.owner, activitySlug: s.activitySlug, id: s.attemptId, buildOptions: {mode: s.mode}, answers: {q1: 'yes'}, questionIds: ['q1'], index: 0, started: 12345};
          const key = `rudn.draft.v1:${s.owner}:${s.activitySlug}:${s.mode}`;
          local.setItem(key, JSON.stringify(legacy));
          const attempt = {id: 'finished', studentKey: 'legacy', activitySlug: 'seminar-1', score: 5};
          local.setItem('rudn.pending.v1:legacy:finished', JSON.stringify(attempt)); local.setItem('rudn.attempt.v2:legacy:finished', JSON.stringify(attempt));
          const store = make('legacy', {localStorage: local});
          equal(await store.importLegacy({owner: s.owner}), {drafts: 1, attempts: 1}, 'migrated counts');
          equal((await store.loadDraft(s)).state, legacy, 'draft copied exactly'); equal(JSON.parse(local.getItem(key)), legacy, 'legacy retained');
          equal(await store.importLegacy({owner: s.owner}), {drafts: 0, attempts: 0}, 'idempotent import');
          equal((await store.listAttempts({owner: s.owner}))[0], attempt, 'attempt unchanged'); equal((await store.listPending({owner: s.owner})).length, 1, 'pending attempt preserved'); store.close();
        });
        await test('remote restoration is acknowledged without enqueueing and preserves pending conflicts', async () => {
          const store = make('remote'); const s = scope('remote');
          const remote = {...s, state: {index: 5}, remoteRevision: 4, lastIntentId: 'remote-4', createdAt: 12345, updatedAt: Date.now()};
          const imported = await store.importRemoteDraft(remote);
          equal(imported.state.index, 5, 'remote loaded'); equal(imported.createdAt, 12345, 'creation time preserved');
          equal(imported.saveStatus.state, 'saved', 'remote acknowledged'); equal((await store.listPending({owner: s.owner})).length, 0, 'no duplicate outbox');
          const newer = await store.importRemoteDraft({...remote, state: {index: 6}, remoteRevision: 5, lastIntentId: 'remote-5'});
          equal(newer.state.index, 6, 'acknowledged draft can advance');
          await store.checkpoint({...s, state: {index: 7}});
          const conflicted = await store.importRemoteDraft({...remote, state: {index: 8}, remoteRevision: 6, lastIntentId: 'remote-6'});
          equal(conflicted.state.index, 7, 'pending local version preserved'); assert(conflicted.conflictId, 'conflict exposed');
          await store.importRemoteDraft({...remote, state: {index: 8}, remoteRevision: 6, lastIntentId: 'remote-6'});
          equal((await store.listConflicts({owner: s.owner})).length, 1, 'remote conflict deduplicated'); store.close();
        });
        await test('two fallback instances serialize revisions and preserve the latest mirror', async () => {
          const local = mapStorage(); const s = scope('fallback-tabs');
          const left = make('fallback-tabs', {indexedDB: null, localStorage: local});
          const right = make('fallback-tabs', {indexedDB: null, localStorage: local});
          await Promise.all(Array.from({length: 12}, (_, i) => (i % 2 ? left : right).checkpoint({...s, state: {index: i}})));
          equal((await left.loadDraft(s)).revision, 12, 'cross-tab fallback revision'); left.close(); right.close();
        });
        return results;
      });
      assert.equal(errors.length, 0, `${engine} browser errors: ${errors.join('; ')}`);
      report.push({engine, passed: results.length, cases: results});
      console.log(`${engine}: ${results.length}/${results.length} durable store regressions passed`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
console.log(JSON.stringify({passed: true, report}, null, 2));
