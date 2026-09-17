/**
 * Device-first persistence. This module never accesses Firebase or changes an identity.
 * Pass the canonical owner (student:<studentKey> or teacher:<Firebase UID>) explicitly.
 * Await checkpoint/complete before acknowledging a save or leaving an activity.
 *
 * A draft and its latest pending checkpoint are committed in one IDB transaction.
 * Completion adds an immutable attempt in that same transaction. Queue acknowledgments
 * are revision-conditional, so a slow response cannot acknowledge a subsequent edit.
 */
const DATABASE = 'rudn-durable-v1';
const VERSION = 1;
const TABLES = ['drafts', 'outbox', 'attempts', 'attachments', 'conflicts', 'meta'];
const JOURNAL = 'rudn.durable.journal.v1:';
const MIRROR = 'rudn.durable.mirror.v1:';
const ATTACHMENT = 'rudn.durable.attachment.v1:';
const LEGACY_DRAFT = 'rudn.draft.v1:';
const LEGACY_ATTEMPT = 'rudn.attempt.v2:';
const LEGACY_PENDING = 'rudn.pending.v1:';
const copy = value => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  if (value === null || typeof value !== 'object' || value instanceof Blob) return value;
  if (value instanceof Date) return new Date(value);
  return Array.isArray(value) ? value.map(copy) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
};
const safeCode = error => String(error?.code || error?.name || 'storage/unavailable').slice(0, 100);
const idPart = value => encodeURIComponent(String(value));
const attemptKey = (owner, id) => `${idPart(owner)}:${idPart(id)}`;
const scopeKey = ({owner, activitySlug, mode = 'default'}) => `${idPart(owner)}:${idPart(activitySlug)}:${idPart(mode)}`;
const draftKey = scope => `${scopeKey(scope)}:${idPart(scope.attemptId)}`;
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class DurableConflictError extends Error {
  constructor(conflictId) {
    super('A newer version is already saved; both versions have been retained.');
    this.name = 'DurableConflictError';
    this.code = 'storage/conflict';
    this.conflictId = conflictId;
  }
}

function normalize(input) {
  const owner = String(input?.owner || '');
  const activitySlug = String(input?.activitySlug || '');
  const attemptId = String(input?.attemptId || input?.attempt?.id || input?.state?.id || '');
  if (!/^(student|teacher|guest):[^\s]+$/.test(owner) || !activitySlug || !attemptId) {
    throw new TypeError('A canonical owner, activitySlug and stable attemptId are required.');
  }
  const mode = String(input.mode || 'default');
  return {...input, owner, activitySlug, attemptId, mode, state: copy(input.state || {})};
}

function readEntries(storage, prefix) {
  const entries = [];
  try {
    for (let i = 0; i < storage?.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) {
        try { entries.push([key, JSON.parse(storage.getItem(key))]); } catch { /* Preserve unreadable legacy data. */ }
      }
    }
  } catch { /* Private browsing/storage restrictions are handled by the save status. */ }
  return entries;
}

/** Factory is also used by isolated browser tests with unavailable/full storage. */
export function createDurableStore(options = {}) {
  const indexedDB = 'indexedDB' in options ? options.indexedDB : globalThis.indexedDB;
  let storage;
  try { storage = 'localStorage' in options ? options.localStorage : globalThis.localStorage; } catch { storage = null; }
  const databaseName = options.databaseName || DATABASE;
  const now = options.now || (() => Date.now());
  const locks = 'locks' in options ? options.locks : globalThis.navigator?.locks;
  const listeners = new Set();
  const serial = new Map();
  const memory = Object.fromEntries(TABLES.map(name => [name, new Map()]));
  const storedMirrors = readEntries(storage, MIRROR).map(([, value]) => value);
  const mirrors = new Map(storedMirrors.filter(value => value.draft?.id).map(value => [value.draft.id, {...value, durable: true}]));
  let db = null;
  let initPromise = null;
  let closed = false;
  let storageMode = 'initializing';
  let storageError = null;
  let channel;
  try { if (options.broadcast !== false && globalThis.BroadcastChannel) channel = new BroadcastChannel(databaseName); } catch { /* Optional cross-tab signal. */ }

  const notify = detail => {
    for (const listener of listeners) { try { listener(copy(detail)); } catch { /* A subscriber cannot interrupt persistence. */ } }
    try { channel?.postMessage(detail); } catch { /* Best effort; transactions, not this channel, ensure correctness. */ }
    if (detail.saveStatus?.durable === false) {
      try { globalThis.dispatchEvent?.(new CustomEvent('rudn:storage-warning', {detail: {owner: detail.owner, draftId: detail.id, status: detail.saveStatus}})); } catch { /* Worker environment. */ }
    }
  };
  if (channel) channel.onmessage = event => {
    for (const listener of listeners) { try { listener(event.data); } catch { /* See notify. */ } }
  };

  function journalWrite(key, value) {
    try { if (!storage) return false; storage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { storageError = safeCode(error); return false; }
  }
  function journalRemove(key) { try { storage?.removeItem(key); } catch { /* A retained journal entry is replay-safe. */ } }

  // A mirror never replaces a newer IDB record. It is also the fallback when IDB is
  // blocked/unavailable. Files are separate because JSON cannot safely serialize Blob.
  function rememberMirror(envelope) {
    if (!envelope?.draft?.id) return;
    mirrors.set(envelope.draft.id, envelope);
    for (const [id, op] of memory.outbox) if (op.draftId === envelope.draft.id) memory.outbox.delete(id);
    for (const [table, records] of Object.entries({drafts: [envelope.draft], outbox: envelope.operations || [], attempts: envelope.attempt ? [envelope.attempt] : []})) {
      for (const record of records) memory[table].set(record.id, copy(record));
    }
  }
  for (const envelope of mirrors.values()) rememberMirror(envelope);
  for (const envelope of storedMirrors) if (envelope.conflict?.id) memory.conflicts.set(envelope.conflict.id, envelope.conflict);
  for (const [, record] of readEntries(storage, ATTACHMENT)) {
    if (record?.id && record.dataUrl) memory.attachments.set(record.id, record);
  }

  const memoryAdapter = () => {
    const tables = Object.fromEntries(TABLES.map(name => [name, new Map([...memory[name]].map(([id, value]) => [id, copy(value)]))]));
    return {
      get: async (table, id) => copy(tables[table].get(id)),
      all: async table => [...tables[table].values()].map(copy),
      put: async (table, record) => { tables[table].set(record.id, copy(record)); },
      delete: async (table, id) => { tables[table].delete(id); },
      commit: () => { for (const name of TABLES) memory[name] = tables[name]; },
    };
  };

  function idbTransaction(names, write, action) {
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(names, write ? 'readwrite' : 'readonly'); }
      catch (error) { reject(error); return; }
      const changes = [];
      let actionError;
      const request = req => new Promise((ok, fail) => { req.onsuccess = () => ok(req.result); req.onerror = () => fail(req.error); });
      const adapter = {
        get: async (table, id) => {
          const value = await request(tx.objectStore(table).get(id));
          if (value) changes.push([table, value.id, value]);
          return value;
        },
        all: async table => {
          const values = await request(tx.objectStore(table).getAll());
          for (const value of values) changes.push([table, value.id, value]);
          return values;
        },
        put: async (table, value) => { await request(tx.objectStore(table).put(value)); changes.push([table, value.id, value]); },
        delete: async (table, id) => { await request(tx.objectStore(table).delete(id)); changes.push([table, id, undefined]); },
      };
      tx.oncomplete = () => {
        // IDB completion and the action's promise continuations are separate
        // signals. Wait for both before returning a value or mirroring reads.
        actionResult.then(result => {
          for (const [table, id, value] of changes) value === undefined ? memory[table].delete(id) : memory[table].set(id, copy(value));
          resolve(result);
        }).catch(reject);
      };
      tx.onabort = () => reject(actionError || tx.error || new Error('IDB transaction aborted'));
      tx.onerror = () => { /* Abort owns rejection. */ };
      const actionResult = Promise.resolve().then(() => action(adapter));
      actionResult.catch(error => {
        actionError = error;
        try { tx.abort(); } catch { reject(error); }
      });
    });
  }

  // Serialize fallback transactions too: IDB already serializes cross-tab writes.
  let fallbackTail = Promise.resolve();
  async function transaction(names, write, action) {
    if (db) {
      try { return await idbTransaction(names, write, action); }
      catch (error) {
        if (error instanceof DurableConflictError || error instanceof TypeError || error?.name === 'DataCloneError') throw error;
        storageError = safeCode(error);
        try { db.close(); } catch { /* Already closed. */ }
        db = null;
        storageMode = 'localStorage';
      }
    }
    const run = fallbackTail.then(async () => {
      const perform = async () => {
        for (const [, envelope] of readEntries(storage, MIRROR)) {
          if (!envelope.draft?.id) continue;
          const cached = mirrors.get(envelope.draft.id);
          if (!cached || envelope.draft.revision > cached.draft.revision || (envelope.savedAt || 0) > (cached.savedAt || 0)) rememberMirror({...envelope, durable: true});
        }
        const adapter = memoryAdapter();
        const result = await action(adapter);
        if (write) adapter.commit();
        return result;
      };
      return locks?.request ? locks.request(`${databaseName}:fallback`, perform) : perform();
    });
    fallbackTail = run.catch(() => {});
    return run;
  }

  function openDatabase() {
    return new Promise(resolve => {
      if (!indexedDB || closed) { storageMode = 'localStorage'; resolve(); return; }
      let settled = false;
      let request;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) { storageError = safeCode(error); storageMode = 'localStorage'; }
        resolve();
      };
      const timer = setTimeout(() => finish({code: 'storage/open-timeout'}), options.openTimeoutMs ?? 3000);
      try { request = indexedDB.open(databaseName, VERSION); }
      catch (error) { finish(error); return; }
      request.onupgradeneeded = () => {
        for (const name of TABLES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, {keyPath: 'id'});
      };
      request.onerror = () => finish(request.error);
      request.onblocked = () => finish({code: 'storage/blocked'});
      request.onsuccess = () => {
        if (settled || closed) { request.result.close(); return; }
        db = request.result;
        db.onversionchange = () => { db?.close(); db = null; storageMode = 'localStorage'; };
        storageMode = 'indexedDB';
        finish();
      };
    });
  }

  function exclusive(key, callback) {
    const pending = (serial.get(key) || Promise.resolve()).catch(() => {}).then(callback);
    serial.set(key, pending);
    pending.finally(() => { if (serial.get(key) === pending) serial.delete(key); }).catch(() => {});
    return pending;
  }

  async function recoverCompletedAttempt(tx, envelope, previous) {
    const {draft, attempt} = envelope;
    // A terminal checkpoint can reach IDB before complete() falls back to the
    // mirror. Recover its missing immutable result independently of the draft;
    // the checkpoint's state, revision and delivery must remain authoritative.
    if (draft.phase !== 'completed' || !attempt) return;
    const equivalent = (a, b) => {
      const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
      return canonical(a) === canonical(b);
    };
    const conflict = (reason, current = previous) => tx.put('conflicts', {
      id: `recovery:${draft.id}:${draft.lastIntentId}:${reason}`, owner: previous.owner,
      draftId: previous.id, current, incoming: attempt, createdAt: now(), reason,
    });
    const payload = attempt.payload;
    const validScope = /^(student|teacher|guest):[^\s]+$/.test(draft.owner)
      && ['owner', 'activitySlug', 'mode', 'attemptId', 'scope', 'id'].every(key => draft[key] === previous[key])
      && draft.id === draftKey(draft) && draft.scope === scopeKey(draft);
    const validAttempt = attempt.id === attemptKey(previous.owner, previous.attemptId)
      && attempt.owner === previous.owner && attempt.attemptId === previous.attemptId && attempt.draftId === previous.id
      && Number.isSafeInteger(attempt.revision) && attempt.revision > 0
      && payload && typeof payload === 'object' && !Array.isArray(payload)
      && (payload.id === undefined || payload.id === previous.attemptId)
      && (payload.activitySlug === undefined || payload.activitySlug === previous.activitySlug)
      && (payload.studentKey == null || !previous.owner.startsWith('student:') || String(payload.studentKey) === previous.owner.slice(8));
    if (!validScope || !validAttempt) { await conflict('fallback-attempt-invalid'); return; }
    const existing = await tx.get('attempts', attempt.id);
    if (existing) {
      if (existing.owner !== attempt.owner || existing.attemptId !== attempt.attemptId || existing.draftId !== attempt.draftId || !equivalent(existing.payload, payload)) {
        await conflict('fallback-attempt-mismatch', existing);
      }
      // An existing result can already be acknowledged. An older mirror must
      // neither replace that result nor resurrect its completed delivery.
      return;
    }
    const operationId = `attempt:${attempt.id}`;
    const incoming = (envelope.operations || []).filter(op => op.type === 'attempt' || op.id === operationId);
    const validOperation = op => op.id === operationId && op.type === 'attempt'
      && ['owner', 'attemptId', 'draftId'].every(key => op[key] === attempt[key])
      && op.activitySlug === previous.activitySlug && op.mode === previous.mode
      && Number.isSafeInteger(op.revision) && op.revision > 0
      && ['pending', 'quarantined'].includes(op.status) && equivalent(op.payload, payload);
    if (incoming.length > 1 || (incoming[0] && !validOperation(incoming[0]))) {
      await conflict('fallback-attempt-invalid'); return;
    }
    const pending = await tx.get('outbox', operationId);
    if (pending && !validOperation(pending)) { await conflict('fallback-attempt-mismatch', pending); return; }
    await tx.put('attempts', attempt);
    // Keep a current delivery's retry/revision metadata. No mirror operation
    // means a device-only or already acknowledged result: do not invent one.
    if (!pending && incoming[0]) await tx.put('outbox', incoming[0]);
  }

  function ready() {
    if (!initPromise) {
      // Capture before a caller writes its new intent, preventing self-replay.
      const intents = readEntries(storage, JOURNAL);
      initPromise = (async () => {
        await openDatabase();
        if (db) {
          for (const conflict of memory.conflicts.values()) await transaction(['conflicts'], true, tx => tx.put('conflicts', conflict));
          for (const envelope of mirrors.values()) {
            if (!envelope.fallback) continue;
            await transaction(TABLES, true, async tx => {
              const previous = await tx.get('drafts', envelope.draft.id);
              if (!previous || (previous.revision === envelope.baseRevision && previous.phase !== 'completed')) {
                await tx.put('drafts', envelope.draft);
                for (const op of envelope.operations || []) await tx.put('outbox', op);
                if (envelope.attempt) await tx.put('attempts', envelope.attempt);
              } else if (previous.phase === 'completed') {
                await recoverCompletedAttempt(tx, envelope, previous);
              } else if (previous.lastIntentId !== envelope.draft.lastIntentId && previous.phase !== 'completed') {
                await tx.put('conflicts', {id: `recovery:${envelope.draft.id}:${envelope.draft.lastIntentId}`, owner: envelope.draft.owner, draftId: envelope.draft.id, current: previous, incoming: envelope.draft, createdAt: now(), reason: 'fallback-recovery'});
              }
            });
          }
          for (const record of memory.attachments.values()) {
            if (record.dataUrl) await transaction(['attachments'], true, async tx => {
              if (!await tx.get('attachments', record.id)) await tx.put('attachments', record);
            });
          }
        }
        for (const [journalKey, intent] of intents) {
          if (!intent?.input || !intent.id) continue;
          try { if (!storage?.getItem(journalKey)) continue; } catch { /* Recovery remains best effort. */ }
          try { await commit(intent.input, intent.kind, intent.options || {}, intent, journalKey); }
          catch { /* Retain a failed recovery intent; exportBackup includes it. */ }
        }
      })();
    }
    return initPromise;
  }

  function operation(type, draft, payload, attachmentIds, previous) {
    return {
      id: type === 'attempt' ? `attempt:${attemptKey(draft.owner, draft.attemptId)}` : `checkpoint:${draft.id}`,
      type, owner: draft.owner, studentKey: draft.studentKey, draftId: draft.id, attemptId: draft.attemptId,
      activitySlug: draft.activitySlug, mode: draft.mode, revision: draft.revision, payload,
      attachmentIds, status: 'pending', failures: 0, nextAttemptAt: 0,
      createdAt: previous?.createdAt || draft.updatedAt, updatedAt: draft.updatedAt,
    };
  }

  async function commit(raw, kind, settings, intent, journalKey) {
    const input = normalize(raw);
    const id = draftKey(input);
    const outcome = await transaction(TABLES, true, async tx => {
      const previous = await tx.get('drafts', id);
      const applied = await tx.get('meta', `intent:${intent.id}`);
      const completedAttempt = kind === 'complete' ? await tx.get('attempts', attemptKey(input.owner, input.attemptId)) : null;
      if (applied || previous?.lastIntentId === intent.id || previous?.recentIntentIds?.includes(intent.id) || (previous?.phase === 'completed' && (kind !== 'complete' || completedAttempt))) return {draft: previous, unchanged: true};
      if (input.baseRevision !== undefined && previous && input.baseRevision !== previous.revision) {
        const conflict = {id: `conflict:${intent.id}`, owner: input.owner, draftId: id, current: previous, incoming: input, createdAt: intent.createdAt, reason: 'revision-mismatch'};
        await tx.put('conflicts', conflict);
        return {draft: previous, conflict};
      }
      const attachmentIds = [...new Set(input.attachmentIds || previous?.attachmentIds || [])];
      const revision = (previous?.revision || 0) + 1;
      const phase = kind === 'complete' ? 'completed' : (input.phase || input.state.phase || 'answering');
      const draft = {
        id, scope: scopeKey(input), owner: input.owner,
        studentKey: input.owner.startsWith('student:') ? input.owner.slice(8) : null,
        activitySlug: input.activitySlug, mode: input.mode, attemptId: input.attemptId,
        contentVersion: String(input.contentVersion || previous?.contentVersion || '1'),
        revision, remoteRevision: input.remoteRevision ?? previous?.remoteRevision ?? null,
        state: {...input.state, ...(phase === 'completed' ? {phase: 'completed'} : {})}, phase,
        attachmentIds, createdAt: previous?.createdAt || input.createdAt || intent.createdAt,
        updatedAt: intent.createdAt, lastIntentId: intent.id, queue: settings.queue !== false,
        recentIntentIds: [...(previous?.recentIntentIds || []), intent.id].slice(-64),
        acknowledgedRevision: previous?.acknowledgedRevision || 0,
      };
      await tx.put('drafts', draft);
      const operations = [];
      if (settings.queue !== false) {
        const previousOp = await tx.get('outbox', `checkpoint:${id}`);
        const pending = operation('checkpoint', draft, draft, attachmentIds, previousOp);
        await tx.put('outbox', pending);
        operations.push(pending);
      }
      let attempt;
      if (kind === 'complete') {
        const storageId = attemptKey(input.owner, input.attemptId);
        const existing = await tx.get('attempts', storageId);
        attempt = existing || {id: storageId, owner: input.owner, attemptId: input.attemptId, draftId: id, revision, payload: copy(input.attempt || {id: input.attemptId, ...input.state}), createdAt: intent.createdAt};
        await tx.put('attempts', attempt);
        if (settings.queue !== false && !existing) {
          const pending = operation('attempt', draft, attempt.payload, attachmentIds);
          await tx.put('outbox', pending);
          operations.push(pending);
        }
      }
      await tx.put('meta', {id: `intent:${intent.id}`, draftId: id, revision});
      return {draft, operations, attempt, baseRevision: previous?.revision || 0};
    });
    if (outcome.conflict) {
      journalWrite(`${MIRROR}conflict:${intent.id}`, {conflict: outcome.conflict, fallback: !db});
      journalRemove(journalKey);
      notify({id, owner: input.owner, saveStatus: {state: 'conflict', durable: !!db, storage: storageMode}});
      throw new DurableConflictError(outcome.conflict.id);
    }
    if (outcome.unchanged) {
      journalRemove(journalKey);
      return outcome.draft ? {...outcome.draft, saveStatus: await statusFor(outcome.draft)} : null;
    }
    const existingMirror = mirrors.get(id);
    const envelope = {...outcome, fallback: !db, savedAt: now(), baseRevision: existingMirror?.fallback ? existingMirror.baseRevision : outcome.baseRevision};
    const mirrored = journalWrite(`${MIRROR}${id}`, envelope);
    envelope.durable = !!db || mirrored;
    rememberMirror(envelope);
    if (db || mirrored) journalRemove(journalKey);
    const saveStatus = await statusFor(outcome.draft, {durable: envelope.durable});
    const result = {...outcome.draft, saveStatus};
    notify({id, owner: input.owner, revision: result.revision, saveStatus});
    return result;
  }

  function persist(raw, kind, settings = {}) {
    const input = normalize(raw);
    const initialization = ready();
    const intent = {id: uuid(), kind, input, options: settings, createdAt: now()};
    const journalKey = `${JOURNAL}${intent.id}`;
    // This synchronous safety journal precedes every asynchronous operation.
    journalWrite(journalKey, intent);
    return exclusive(draftKey(input), async () => { await initialization; return commit(input, kind, settings, intent, journalKey); });
  }

  async function findDraft(scope) {
    if (scope.attemptId) return transaction(['drafts'], false, tx => tx.get('drafts', draftKey(scope)));
    return transaction(['drafts'], false, async tx => (await tx.all('drafts')).filter(draft => draft.scope === scopeKey(scope)).sort((a, b) => b.updatedAt - a.updatedAt || b.revision - a.revision)[0]);
  }

  async function statusFor(draft, overrides = {}) {
    if (!draft) return {state: 'empty', durable: true, storage: storageMode, pending: 0};
    const records = await transaction(['outbox', 'attachments', 'conflicts'], false, async tx => ({
      operations: (await tx.all('outbox')).filter(op => op.draftId === draft.id),
      attachments: await Promise.all((draft.attachmentIds || []).map(id => tx.get('attachments', id))),
      conflicts: (await tx.all('conflicts')).filter(item => item.draftId === draft.id),
    }));
    const hasMissingAttachment = records.attachments.some(record => !record || record.durable === false || (!db && !record.dataUrl && !record.remoteUrl));
    const fileUnavailableOffline=records.attachments.some(record=>record?.remoteUrl&&!record.blob&&!record.dataUrl)&&globalThis.navigator?.onLine===false;
    const mirror = mirrors.get(draft.id);
    const durable = (overrides.durable ?? (!!db || !!mirror?.durable)) && !hasMissingAttachment && !records.conflicts.some(conflict => conflict.durable === false);
    const quarantined = records.operations.filter(op => op.status === 'quarantined').length;
    const pending = records.operations.length;
    const state = !durable ? 'unsafe' : records.conflicts.length ? 'conflict' : pending ? 'pending' : draft.acknowledgedRevision >= draft.revision ? 'saved' : 'device-only';
    return {state, durable, storage: db ? 'indexedDB' : durable ? 'localStorage' : 'memory', pending, quarantined, missingAttachment: hasMissingAttachment, fileUnavailableOffline, revision: draft.revision, acknowledgedRevision: draft.acknowledgedRevision, ...(storageError ? {diagnostic: storageError} : {})};
  }

  async function updateMirrorFromDatabase(draftId) {
    const envelope = await transaction(['drafts', 'outbox', 'attempts'], false, async tx => {
      const draft = await tx.get('drafts', draftId);
      if (!draft) return null;
      return {draft, operations: (await tx.all('outbox')).filter(op => op.draftId === draftId), attempt: (await tx.all('attempts')).find(attempt => attempt.draftId === draftId)};
    });
    if (!envelope) return;
    const old = mirrors.get(draftId);
    Object.assign(envelope, {fallback: !db, savedAt: now(), baseRevision: old?.baseRevision || 0});
    const mirrored = journalWrite(`${MIRROR}${draftId}`, envelope);
    envelope.durable = !!db || mirrored;
    mirrors.set(draftId, envelope);
    notify({id: draftId, owner: envelope.draft.owner, saveStatus: await statusFor(envelope.draft)});
  }

  async function mutateOperation(id, revision, action) {
    await ready();
    const outcome = await transaction(['outbox', 'drafts'], true, async tx => {
      const op = await tx.get('outbox', id);
      if (!op || (revision !== undefined && op.revision !== revision)) return false;
      await action(tx, op);
      return op;
    });
    if (outcome) await updateMirrorFromDatabase(outcome.draftId);
    return !!outcome;
  }

  async function putAttachment({owner, attemptId, id = uuid(), blob, name = '', type = blob?.type || 'application/octet-stream'}) {
    if (!owner || !attemptId || !(blob instanceof Blob)) throw new TypeError('Attachment owner, attemptId and Blob are required.');
    await ready();
    const record = {id: `${attemptKey(owner, attemptId)}:${idPart(id)}`, owner, attemptId, name, type, blob, size: blob.size, createdAt: now(), durable: true};
    await transaction(['attachments'], true, tx => tx.put('attachments', record));
    if (!db) {
      let encoded = '';
      const bytes = new Uint8Array(await blob.arrayBuffer());
      for (let offset = 0; offset < bytes.length; offset += 0x8000) encoded += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      record.dataUrl = `data:${type};base64,${btoa(encoded)}`;
      record.durable = journalWrite(`${ATTACHMENT}${record.id}`, {...record, blob: undefined});
      await transaction(['attachments'], true, tx => tx.put('attachments', record));
    }
    return {...record, blob: undefined, dataUrl: undefined};
  }

  /** Retain the offline Blob; record only a confirmed upload for this same owner/attempt. */
  async function markAttachmentUploaded(id, metadata = {}) {
    if (!metadata.owner || !metadata.attemptId || !metadata.url) throw new TypeError('Confirmed attachment owner, attemptId and URL are required.');
    const url = new URL(metadata.url);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new TypeError('Attachment URL must use HTTPS.');
    await ready();
    const record = await transaction(['attachments'], true, async tx => {
      const previous = await tx.get('attachments', id);
      if (!previous || previous.owner !== metadata.owner || previous.attemptId !== metadata.attemptId) throw new TypeError('Attachment upload identity must match the saved file.');
      if (metadata.id !== undefined && metadata.id !== id) throw new TypeError('Attachment ID is immutable.');
      const next = {...previous, remoteUrl: url.href, remotePath: metadata.path || previous.remotePath || null, cloudBacked: true, uploadedAt: previous.uploadedAt || now()};
      await tx.put('attachments', next);
      return next;
    });
    if (!db && !journalWrite(`${ATTACHMENT}${record.id}`, {...record, blob: undefined})) {
      const error = new Error('The confirmed attachment upload could not be retained on this device.');
      error.code = 'storage/upload-receipt-unavailable';
      throw error;
    }
    return {...record, blob: undefined, dataUrl: undefined};
  }

  function remoteConflict({owner, draftId, current, incoming, remoteRevision, reason = 'remote-conflict'}) {
    const version = remoteRevision ?? incoming?.remoteRevision ?? incoming?.lastIntentId ?? incoming?.updatedAt;
    if (version === undefined) throw new TypeError('A remote revision is required to deduplicate conflicts.');
    return {id: `remote:${draftId}:${idPart(version)}`, owner, draftId, current: copy(current), incoming: copy(incoming), remoteRevision: remoteRevision ?? incoming?.remoteRevision ?? null, reason, createdAt: now()};
  }

  async function mirrorConflict(conflict) {
    const mirrored = journalWrite(`${MIRROR}conflict:${conflict.id}`, {conflict, fallback: !db});
    if (!db && !mirrored) await transaction(['conflicts'], true, tx => tx.put('conflicts', {...conflict, durable: false}));
    const draft = await transaction(['drafts'], false, tx => tx.get('drafts', conflict.draftId));
    notify({id: conflict.draftId, owner: conflict.owner, saveStatus: await statusFor(draft)});
    return conflict;
  }

  async function recordRemoteConflict(input) {
    await ready();
    if (!input.owner || !input.draftId || input.incoming?.owner !== input.owner || input.current?.owner !== input.owner) throw new TypeError('Remote conflict owner must match both versions.');
    const conflict = remoteConflict(input);
    await transaction(['conflicts'], true, async tx => { if (!await tx.get('conflicts', conflict.id)) await tx.put('conflicts', conflict); });
    return mirrorConflict(conflict);
  }

  async function importRemoteDraft(remote) {
    const input = normalize(remote);
    await ready();
    const id = draftKey(input);
    const result = await transaction(['drafts', 'outbox', 'conflicts', 'attachments'], true, async tx => {
      const previous = await tx.get('drafts', id);
      if (previous) {
        const pending = (await tx.all('outbox')).some(op => op.draftId === id);
        const same = remote.lastIntentId && remote.lastIntentId === previous.lastIntentId;
        const older = Number.isFinite(remote.remoteRevision) && Number.isFinite(previous.remoteRevision) && remote.remoteRevision <= previous.remoteRevision;
        if (same || older) return {draft: previous};
        if (pending || previous.acknowledgedRevision < previous.revision || previous.phase === 'completed') {
          const conflict = remoteConflict({owner: input.owner, draftId: id, current: previous, incoming: remote, remoteRevision: remote.remoteRevision});
          if (!await tx.get('conflicts', conflict.id)) await tx.put('conflicts', conflict);
          return {draft: previous, conflict};
        }
      }
      const revision = (previous?.revision || 0) + 1;
      for(const file of remote.remoteAttachments||[]){
        if(!file?.id||!/^https:\/\//.test(file.url||''))continue;
        if(!await tx.get('attachments',file.id))await tx.put('attachments',{id:file.id,owner:input.owner,attemptId:input.attemptId,name:file.name||'',type:file.type||'application/octet-stream',size:Number(file.size)||0,remoteUrl:file.url,durable:true,cloudBacked:true,createdAt:now()});
      }
      const draft = {...copy(remote), id, scope: scopeKey(input), owner: input.owner, studentKey: input.owner.startsWith('student:') ? input.owner.slice(8) : null,
        activitySlug: input.activitySlug, mode: input.mode, attemptId: input.attemptId, state: input.state, contentVersion: String(input.contentVersion || '1'),
        revision, acknowledgedRevision: revision, remoteRevision: remote.remoteRevision ?? null, queue: false,
        phase: remote.phase || input.state.phase || 'answering', attachmentIds: remote.attachmentIds || [],
        createdAt: remote.createdAt || now(), updatedAt: remote.updatedAt || now(), lastIntentId: remote.lastIntentId || `remote:${remote.remoteRevision}`};
      delete draft.saveStatus;
      await tx.put('drafts', draft);
      return {draft, changed: true};
    });
    if (result.conflict) await mirrorConflict(result.conflict);
    else if (result.changed) await updateMirrorFromDatabase(id);
    return {...result.draft, saveStatus: await statusFor(result.draft), ...(result.conflict ? {conflictId: result.conflict.id} : {})};
  }

  async function importLegacy({owner}) {
    if (!owner || !/^(student|teacher):/.test(owner)) return {drafts: 0, attempts: 0};
    await ready();
    let drafts = 0;
    let attempts = 0;
    for (const [key, state] of readEntries(storage, LEGACY_DRAFT + owner + ':')) {
      if (state?.owner !== owner || !state.activitySlug || !state.id) continue;
      const scope = {owner, activitySlug: state.activitySlug, mode: state.buildOptions?.mode || 'default', attemptId: state.id};
      if (await findDraft(scope)) continue;
      await persist({...scope, state, contentVersion: 'legacy-v1', createdAt: state.startedAt || state.started}, 'checkpoint', {queue: false});
      const verified = await findDraft(scope);
      if (JSON.stringify(verified?.state) !== JSON.stringify(state)) throw new Error('Legacy draft readback failed; original retained.');
      drafts++;
      // key intentionally retained: old clients and manual recovery still work.
      void key;
    }
    if (owner.startsWith('student:')) {
      const studentKey = owner.slice(8);
      const known = new Map(readEntries(storage, `${LEGACY_ATTEMPT}${studentKey}:`).map(([, value]) => [value?.id, value]));
      const pending = new Map(readEntries(storage, `${LEGACY_PENDING}${studentKey}:`).map(([, value]) => [value?.id, value]));
      for (const [id, attempt] of pending) if (!known.has(id)) known.set(id, attempt);
      for (const [id, attempt] of known) {
        if (!id || String(attempt.studentKey) !== studentKey) continue;
        await transaction(['attempts', 'outbox'], true, async tx => {
          const storageId = attemptKey(owner, id);
          if (await tx.get('attempts', storageId)) return;
          const draftId = draftKey({owner, activitySlug: attempt.activitySlug || 'legacy', mode: attempt.mode || 'default', attemptId: id});
          await tx.put('attempts', {id: storageId, owner, attemptId: id, draftId, revision: 1, payload: copy(attempt), createdAt: now()});
          if (pending.has(id)) {
            const draft = {id: draftId, owner, studentKey, activitySlug: attempt.activitySlug || 'legacy', mode: attempt.mode || 'default', attemptId: id, revision: 1, updatedAt: now()};
            await tx.put('outbox', operation('attempt', draft, attempt, []));
          }
          attempts++;
        });
      }
    }
    return {drafts, attempts};
  }

  return {
    ready,
    checkpoint: (input, settings) => persist(input, 'checkpoint', settings),
    complete: (input, settings) => persist(input, 'complete', settings),
    async loadDraft(scope) {
      await ready();
      let draft = await findDraft(scope);
      if (!draft && scope.legacyKeys?.length) {
        for (const key of scope.legacyKeys) {
          let legacy;
          try { legacy = JSON.parse(storage?.getItem(key)); } catch { continue; }
          if (!legacy || (legacy.owner && legacy.owner !== scope.owner)) continue;
          const attemptId = scope.attemptId || legacy.id;
          if (!attemptId) continue;
          draft = await persist({...scope, attemptId, state: legacy, contentVersion: 'legacy-v1'}, 'checkpoint', {queue: false});
          break;
        }
      }
      return draft ? {...draft, saveStatus: await statusFor(draft)} : null;
    },
    async getSaveStatus(scope) { await ready(); return statusFor(await findDraft(scope)); },
    async listPending({owner, limit = 50, now: timestamp = now(), includeDeferred = false} = {}) {
      await ready();
      return transaction(['outbox'], false, async tx => (await tx.all('outbox'))
        .filter(op => (!owner || op.owner === owner) && op.status === 'pending' && (includeDeferred || op.nextAttemptAt <= timestamp))
        .sort((a, b) => a.createdAt - b.createdAt || (a.type === 'checkpoint' ? -1 : 1)).slice(0, limit));
    },
    ack: (id, revision, {remoteRevision} = {}) => mutateOperation(id, revision, async (tx, op) => {
      await tx.delete('outbox', id);
      const draft = await tx.get('drafts', op.draftId);
      if (draft && op.type === 'checkpoint') await tx.put('drafts', {...draft, acknowledgedRevision: Math.max(draft.acknowledgedRevision || 0, op.revision), remoteRevision: remoteRevision ?? draft.remoteRevision});
    }),
    defer: (id, error, {revision, retryAt} = {}) => mutateOperation(id, revision, async (tx, op) => {
      const failures = (op.failures || 0) + 1;
      const wait = Math.min(300000, 1000 * 2 ** Math.min(failures, 8)) * (0.8 + Math.random() * 0.4);
      await tx.put('outbox', {...op, failures, lastError: safeCode(error), nextAttemptAt: retryAt ?? now() + Math.round(wait)});
    }),
    quarantine: (id, error, {revision} = {}) => mutateOperation(id, revision, (tx, op) => tx.put('outbox', {...op, status: 'quarantined', lastError: safeCode(error), updatedAt: now()})),
    retry: (id, {revision} = {}) => mutateOperation(id, revision, (tx, op) => tx.put('outbox', {...op, status: 'pending', nextAttemptAt: 0, lastError: null})),
    putAttachment,
    markAttachmentUploaded,
    async getAttachment(id) {
      await ready();
      const record = await transaction(['attachments'], false, tx => tx.get('attachments', id));
      if (!record) return null;
      if (!record.blob && record.dataUrl) {
        const bytes = Uint8Array.from(atob(record.dataUrl.split(',')[1]), c => c.charCodeAt(0));
        record.blob = new Blob([bytes], {type: record.type});
      }
      return record;
    },
    async listAttempts({owner} = {}) { await ready(); return transaction(['attempts'], false, async tx => (await tx.all('attempts')).filter(record => !owner || record.owner === owner).map(record => copy(record.payload))); },
    async listConflicts({owner, draftId} = {}) { await ready(); return transaction(['conflicts'], false, async tx => (await tx.all('conflicts')).filter(record => (!owner || record.owner === owner) && (!draftId || record.draftId === draftId))); },
    importLegacy,
    importRemoteDraft,
    recordRemoteConflict,
    async exportBackup({owner} = {}) {
      await ready();
      const data = await transaction(TABLES, false, async tx => Object.fromEntries(await Promise.all(TABLES.filter(name => name !== 'meta').map(async name => [name, (await tx.all(name)).filter(record => !owner || record.owner === owner)]))));
      for (const attachment of data.attachments) {
        if (attachment.blob && !attachment.dataUrl) {
          let binary = '';
          const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
          for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          attachment.dataUrl = `data:${attachment.type};base64,${btoa(binary)}`;
        }
        delete attachment.blob;
      }
      return {format: 'rudn-device-backup', version: 1, createdAt: new Date(now()).toISOString(), ...data, recoveryJournal: readEntries(storage, JOURNAL).map(([, value]) => value).filter(value => !owner || value.input?.owner === owner)};
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async flushLocal() { await ready(); await Promise.allSettled([...serial.values()]); await fallbackTail; },
    async flush() { await ready(); await Promise.all([...serial.values()]); await fallbackTail; },
    close() { closed = true; db?.close(); db = null; channel?.close(); },
  };
}

let singleton;
export const durableStore = new Proxy({}, {get(_target, name) { singleton ||= createDurableStore(); return singleton[name]; }});
export const loadDraft = (...args) => durableStore.loadDraft(...args);
export const checkpoint = (...args) => durableStore.checkpoint(...args);
export const complete = (...args) => durableStore.complete(...args);
export const getSaveStatus = (...args) => durableStore.getSaveStatus(...args);
export const listPending = (...args) => durableStore.listPending(...args);
export const ack = (...args) => durableStore.ack(...args);
export const defer = (...args) => durableStore.defer(...args);
export const quarantine = (...args) => durableStore.quarantine(...args);
export const putAttachment = (...args) => durableStore.putAttachment(...args);
export const getAttachment = (...args) => durableStore.getAttachment(...args);
export const markAttachmentUploaded = (...args) => durableStore.markAttachmentUploaded(...args);
export const importLegacy = (...args) => durableStore.importLegacy(...args);
export const exportBackup = (...args) => durableStore.exportBackup(...args);
export const flush = (...args) => durableStore.flush(...args);
export const importRemoteDraft = (...args) => durableStore.importRemoteDraft(...args);
export const recordRemoteConflict = (...args) => durableStore.recordRemoteConflict(...args);
