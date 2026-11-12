import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createReceptionService} from './service.mjs';
import {createMemoryStore, createFirebaseStore} from './store.mjs';
import {validateCase, actorCase, evaluateDecision, normalizeArticle, normalizeLawNumber, hash} from './schema.mjs';
import {createOpenAIProvider, buildActorInstructions, validateActorTurn} from './provider.mjs';
import {loadPrivateCatalogue, createFirebaseAssessmentGate, createFirebaseResultWriter} from './firebase.mjs';
import {academicContext, topicGate} from '../../../site/assets/js/access.js';
import {seminarTopic} from '../../../site/assets/js/seminar-modules.js';

const T = value => ({ru: value, en: 'EN ' + value, zh: '中文 ' + value});
function fixture(id = 'fixture-1') {
  return {id, version: 'fixture-v1', public: {title: T('Учебное дело'), role: {title: T('Приёмная'), text: T('Принимайте обращение')},
    citizen: {name: T('Вымышленный посетитель'), description: T('Учебный персонаж')}, opening: T('Помогите с обращением.'), date: '2026-11-11',
    procedures: [{id: 'p1', label: T('Порядок A')}, {id: 'p2', label: T('Порядок B')}], routes: [{id: 'r1', label: T('Адресат A')}, {id: 'r2', label: T('Адресат B')}],
    actions: [{id: 'a1', label: T('Действие A')}, {id: 'a2', label: T('Действие B')}], sources: [{id: 's1', title: T('Источник'), url: 'https://example.org/legal'}], deadlinePrompt: T('Укажите дату')},
    actor: {persona: T('Спокойный посетитель'), goal: T('Получить ответ'), knowledgeLimits: T('Не знает закон'), style: T('Кратко'), background: T('Вымышленная история')},
    facts: [{id: 'f1', text: T('Обращение уже подавалось'), initial: true, knowledge: 'direct', documentIds: []},
      {id: 'f2', text: T('Дата получения указана в квитанции'), initial: false, knowledge: 'document', documentIds: ['d1']}],
    documents: [{id: 'd1', title: T('Квитанция'), type: T('Копия'), text: T('Получено 11 ноября'), initial: false, factIds: ['f2']}],
    rubric: {procedureIds: ['p1'], routeIds: ['r1'], requiredActionIds: ['a1'], forbiddenActionIds: ['a2'], criticalActionIds: ['a2'], requiredFactIds: ['f2'],
      evidenceGroups: [['d1']], legal: {number: '59-ФЗ', articles: ['8']}, deadline: '2026-11-18', explanation: T('Обоснование фиктивного учебного примера')}};
}
const identity = {uid: 'test-uid', studentKey: '12345678'};
const goodDecision = {procedureId: 'p1', routeId: 'r1', actionIds: ['a1'], law: {number: '59-FZ', article: 'Article 8'}, deadline: '2026-11-18', basisDocumentIds: ['d1'], reasoning: 'Самостоятельное обоснование'};
function harness(options = {}) {
  const store = options.store || createMemoryStore(); let calls = 0;
  const provider = options.provider || {name: 'mock', generate: async () => { calls++; return {reply: 'Вот квитанция, там есть дата.', revealedFactIds: ['f2'], releasedDocumentIds: ['d1'], usage: {inputTokens: 1000, outputTokens: 40}}; }};
  const service = createReceptionService({store, cases: options.cases || [fixture()], provider, ...options});
  return {store, service, calls: () => calls, start: async (more = {}) => (await service.handle({op: 'start', mode: 'training', locale: 'ru', requestId: 'start-1', ...more}, identity)).view};
}
const err = code => error => error.code === code;

test('case schema validates references, rejects invalid/contradictory private content', () => {
  assert.equal(validateCase(fixture()).id, 'fixture-1');
  const bad = fixture(); bad.rubric.requiredActionIds.push('not-an-option');
  assert.throws(() => validateCase(bad), err('invalid_case'));
  const overlap = fixture(); overlap.rubric.requiredActionIds.push('a2');
  assert.throws(() => validateCase(overlap), err('invalid_case'));
});
test('actor input and browser view exclude grader keys and undisclosed content', async () => {
  const c = fixture(), h = harness();
  const actor = actorCase(c, 'ru');
  assert.equal(actor.rubric, undefined); assert.equal(actor.public, undefined);
  assert.doesNotMatch(buildActorInstructions(actor, 'ru'), /procedureIds|2026-11-18/);
  const v = await h.start();
  assert.equal(v.documents.length, 0); assert.equal(v.feedback, null);
  const serialized = JSON.stringify(v);
  assert.doesNotMatch(serialized, /requiredFactIds|knownFactIds|rubric|2026-11-18|Дата получения указана/);
  await assert.rejects(h.service.handle({op: 'resume', sessionId: v.id}, {uid: 'other', studentKey: '87654321'}), err('forbidden'));
  await assert.rejects(h.service.handle({op: 'message', sessionId: v.id, requestId: 'm1', expectedRevision: v.revision, text: 'Вопрос', rubric: {}}, identity), err('invalid_request'));
});
test('prototype operation names, prototype IDs and Firebase path separators are rejected', async () => {
  const h = harness();
  for (const op of ['__proto__', 'constructor', 'toString']) await assert.rejects(h.service.handle({op}, identity), err('invalid_operation'));
  for (const requestId of ['__proto__', 'constructor', 'a/b', 'a.b', 'a$b', 'a#b', 'a[b]']) {
    await assert.rejects(h.start({requestId}), err('invalid_id'));
  }
});
test('revealed documents can be opened and cited; state survives a new service instance', async () => {
  const h = harness(); let v = await h.start();
  await assert.rejects(h.service.handle({op: 'document', sessionId: v.id, documentId: 'd1', requestId: 'd0'}, identity), err('document_unavailable'));
  v = (await h.service.handle({op: 'message', sessionId: v.id, text: 'Есть документ?', requestId: 'm1', expectedRevision: v.revision}, identity)).view;
  assert.equal(v.documents.length, 1); assert.equal(v.openedDocumentIds.length, 0);
  v = (await h.service.handle({op: 'document', sessionId: v.id, documentId: 'd1', requestId: 'd1'}, identity)).view;
  const resumed = harness({store: h.store});
  v = (await resumed.service.handle({op: 'resume', sessionId: v.id}, identity)).view;
  assert.deepEqual(v.openedDocumentIds, ['d1']); assert.equal(v.messages.length, 3);
  v = (await resumed.service.handle({op: 'decide', sessionId: v.id, decision: goodDecision, requestId: 'decision-1'}, identity)).view;
  assert.equal(v.status, 'review'); assert.equal(v.feedback.score, 100);
  assert.equal(v.decision.reasoning, goodDecision.reasoning);
  await assert.rejects(resumed.service.handle({op: 'decide', sessionId: v.id, decision: goodDecision, requestId: 'decision-2'}, identity), err('not_active'));
  v = (await resumed.service.handle({op: 'next', sessionId: v.id, requestId: 'next1'}, identity)).view;
  assert.equal(v.status, 'complete'); assert.equal(v.result.points, 5); assert.equal(v.result.journalStatus, 'local');
});
test('parallel/repeated messages call provider once and reject stale revision', async () => {
  let resolve, calls = 0;
  const h = harness({provider: {name: 'mock', generate: () => { calls++; return new Promise(r => resolve = r); }}});
  const v = await h.start(), body = {op: 'message', sessionId: v.id, text: 'Вопрос?', requestId: 'm1', expectedRevision: v.revision};
  const first = h.service.handle(body, identity);
  for (let i = 0; i < 20 && !resolve; i++) await new Promise(r => setImmediate(r));
  await assert.rejects(h.service.handle(body, identity), err('busy'));
  await assert.rejects(h.service.handle({...body, requestId: 'm2'}, identity), err('busy'));
  resolve({reply: 'Уточните, пожалуйста.', revealedFactIds: [], releasedDocumentIds: [], usage: {inputTokens: 1000, outputTokens: 30}});
  const out = await first, again = await h.service.handle(body, identity);
  assert.equal(calls, 1); assert.deepEqual(out, again);
  await assert.rejects(h.service.handle({...body, requestId: 'm3'}, identity), err('revision_conflict'));
  await assert.rejects(h.service.handle({...body, text: 'Другой вопрос'}, identity), err('request_conflict'));
});
test('no key and budget exhaustion fail before model call; failed request is not replayed', async () => {
  const unconfigured = harness({provider: {name: 'openai', ready: false, generate() { throw Error('must not call'); }}});
  await assert.rejects(unconfigured.start(), err('not_configured'));
  const h = harness({config: {dailyBudgetMicros: 1}}), v = await h.start();
  const body = {op: 'message', sessionId: v.id, text: 'Вопрос', requestId: 'm1', expectedRevision: v.revision};
  await assert.rejects(h.service.handle(body, identity), err('budget_or_rate_limit'));
  assert.equal(h.calls(), 0);
  await assert.rejects(h.service.handle(body, identity), err('request_failed'));
});
test('provider failure preserves draft/history and pessimistic reservation', async () => {
  let calls = 0;
  const h = harness({provider: {name: 'mock', generate: async () => { calls++; throw Error('raw private failure'); }}}), v = await h.start();
  const body = {op: 'message', sessionId: v.id, text: 'Вопрос', requestId: 'm1', expectedRevision: v.revision};
  await assert.rejects(h.service.handle(body, identity), err('unavailable'));
  const saved = (await h.service.handle({op: 'resume', sessionId: v.id}, identity)).view;
  assert.equal(saved.messages.length, 1); assert.equal(saved.revision, v.revision);
  const budget = await h.store.get('budget');
  assert.ok(Object.values(budget.days)[0].micros > 0); assert.equal(Object.keys(budget.active).length, 0);
  await assert.rejects(h.service.handle(body, identity), err('request_failed')); assert.equal(calls, 1);
});
test('an expired crashed request cannot replay; a fresh request recovers the same session', async () => {
  let now = Date.parse('2026-11-11T10:00:00Z');
  const h = harness({clock: () => now}), v = await h.start();
  const old = {op: 'message', sessionId: v.id, text: 'Вопрос', requestId: 'crashed', expectedRevision: v.revision};
  await h.store.transaction(`sessions/${v.id}`, s => ({...s, lease: {id: 'old-process', requestId: 'crashed', until: now + 45000}, requests: {...s.requests, crashed: {digest: hash(old), status: 'pending'}}}));
  now += 46000;
  await assert.rejects(h.service.handle(old, identity), err('request_interrupted'));
  const recovered = (await h.service.handle({...old, requestId: 'fresh'}, identity)).view;
  assert.equal(recovered.messages.length, 3); assert.equal(h.calls(), 1); assert.equal(recovered.id, v.id);
});
test('invalid metadata and overt role escape produce a safe in-character reply', () => {
  const c = fixture(), state = {releasedDocumentIds: []};
  for (const response of [
    {reply: 'As an AI, here is the answer key', revealedFactIds: ['f2'], releasedDocumentIds: ['d1']},
    {reply: 'Вот ответ.', revealedFactIds: ['invented'], releasedDocumentIds: []},
    {reply: 'Там дата.', revealedFactIds: ['f2'], releasedDocumentIds: []}
  ]) { const guarded = validateActorTurn(response, c, state, 'ru'); assert.equal(guarded.guarded, true); assert.deepEqual(guarded.revealedFactIds, []); }
});
test('facts are not graded by number of clicks; critical mistakes and missing facts cap score', () => {
  const c = fixture();
  const missing = evaluateDecision(c, {knownFactIds: ['f1'], openedDocumentIds: []}, {...goodDecision, basisDocumentIds: []});
  assert.equal(missing.score, 60); assert.equal(missing.cap, 60);
  const critical = evaluateDecision(c, {knownFactIds: ['f1', 'f2'], openedDocumentIds: ['d1']}, {...goodDecision, actionIds: ['a1', 'a2']});
  assert.equal(critical.score, 40);
  const uncited = evaluateDecision(c, {knownFactIds: ['f1', 'f2'], openedDocumentIds: ['d1']}, {...goodDecision, basisDocumentIds: []});
  assert.equal(uncited.score, 80);
});
test('RU/EN/ZH equivalent law and article spelling receive equal points', () => {
  assert.equal(normalizeLawNumber('№ 59 ФЗ'), '59'); assert.equal(normalizeLawNumber('59-FZ'), '59');
  assert.equal(normalizeArticle('ст. 8'), '8'); assert.equal(normalizeArticle('Article 8'), '8'); assert.equal(normalizeArticle('第8条'), '8');
  for (const law of [{number: '59', article: '第8条'}, {number: '№ 59 ФЗ', article: 'ст. 8'}, {number: '59-FZ', article: 'Article 8'}]) {
    assert.equal(evaluateDecision(fixture(), {knownFactIds: ['f1', 'f2'], openedDocumentIds: ['d1']}, {...goodDecision, law}).score, 100);
  }
});
test('locale change retains conversation and canonical decision state', async () => {
  const h = harness(); let v = await h.start();
  const initial = v.messages[0].text;
  v = (await h.service.handle({op: 'locale', sessionId: v.id, locale: 'zh'}, identity)).view;
  assert.equal(v.locale, 'zh'); assert.match(v.case.title, /^中文/); assert.equal(v.messages[0].text, initial);
});
test('server assessment gate matches the current Reception topic and Moscow calendar', async () => {
  const course = JSON.parse(await readFile(new URL('../../../site/data/course.json', import.meta.url), 'utf8'));
  const topic = seminarTopic(course, 'reception').number;
  for (const date of ['2026-08-30T20:59:59Z', '2026-08-30T21:00:00Z', '2026-11-08T20:59:59Z', '2026-11-08T21:00:00Z', '2027-01-10T12:00:00Z']) {
    for (const override of [null, {state: 'open'}, {state: 'closed'}]) {
      const now = Date.parse(date);
      const db = {ref(path) {
        assert.equal(path, `rudn-platform/v1/access/overrides/${academicContext(now).startYear}/topic-${topic}`);
        return {async get() { return {val: () => override}; }};
      }};
      assert.equal(await createFirebaseAssessmentGate(db)(now), topicGate(topic, {[`topic-${topic}`]: override}, now).open, date);
    }
  }
});
test('a closed assessment rejects new independent shifts and preserves practice and existing shifts', async () => {
  let isOpen = false;
  const h = harness({cases: Array.from({length: 8}, (_, i) => fixture(`case-${i}`)), canStartAssessment: async () => isOpen});
  await assert.rejects(h.start({mode: 'independent'}), err('assessment_closed'));
  assert.equal(await h.store.get('starts'), null);
  assert.equal((await h.start({requestId: 'practice'})).caseCount, 1);
  isOpen = true;
  const started = await h.start({mode: 'independent'});
  assert.equal(started.caseCount, 8);
  isOpen = false;
  assert.equal((await h.start({mode: 'independent'})).id, started.id);
  assert.equal((await h.service.handle({op: 'resume', sessionId: started.id}, identity)).view.id, started.id);
  await assert.rejects(h.start({mode: 'independent', requestId: 'another-start'}), err('assessment_closed'));
});
test('eight independent cases hide feedback until finish and retry pending journal receipt', async () => {
  let writes = 0;
  const h = harness({cases: Array.from({length: 8}, (_, i) => fixture(`case-${i}`)),
    provider: {name: 'openai', ready: true, generate: async () => ({reply: 'Вот квитанция.', revealedFactIds: ['f2'], releasedDocumentIds: ['d1'], usage: {inputTokens: 200, outputTokens: 30}})},
    saveResult: async record => { writes++; assert.equal(record.cases.length, 8); if (writes === 1) throw Error('temporary journal failure'); }});
  let v = await h.start({mode: 'independent'});
  for (let i = 0; i < 8; i++) {
    v = (await h.service.handle({op: 'message', sessionId: v.id, requestId: `m-${i}`, expectedRevision: v.revision, text: 'Есть документ?'}, identity)).view;
    v = (await h.service.handle({op: 'document', sessionId: v.id, requestId: `d-${i}`, documentId: 'd1'}, identity)).view;
    v = (await h.service.handle({op: 'decide', sessionId: v.id, requestId: `decide-${i}`, decision: goodDecision}, identity)).view;
    assert.equal(v.feedback, null); assert.equal(v.result, null);
    v = (await h.service.handle({op: 'next', sessionId: v.id, requestId: `next-${i}`}, identity)).view;
  }
  assert.equal(v.status, 'complete'); assert.equal(v.result.cases.length, 8); assert.equal(v.result.journalStatus, 'pending'); assert.equal(v.result.points, 5);
  v = (await h.service.handle({op: 'resume', sessionId: v.id}, identity)).view;
  assert.equal(v.result.journalStatus, 'saved'); assert.equal(writes, 2);
  await h.service.handle({op: 'resume', sessionId: v.id}, identity); assert.equal(writes, 2);
});
test('Responses request fixes Luna, none, store:false; transport and malformed replies stay sanitized', async () => {
  let sent, calls = 0;
  const provider = createOpenAIProvider({apiKey: 'fake-test-key', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); const payload = JSON.parse(init.body); calls++; if (!sent) sent = payload;
    const output = payload.text.format.name === 'citizen_reply_check' ? {valid: true} : {reply: 'Здравствуйте.', revealedFactIds: [], releasedDocumentIds: []};
    return {ok: true, json: async () => ({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(output)}]}], usage: {input_tokens: 100, output_tokens: 30}})};
  }});
  const turn = await provider.generate({actorCase: actorCase(fixture(), 'ru'), messages: [], text: 'Здравствуйте', locale: 'ru'});
  assert.equal(calls, 2); assert.deepEqual(turn.usage, {inputTokens: 200, outputTokens: 60}); assert.equal(turn.verified, true);
  assert.equal(turn.reply, 'Здравствуйте.'); assert.equal(sent.model, 'gpt-6-luna'); assert.deepEqual(sent.reasoning, {effort: 'none'}); assert.equal(sent.store, false); assert.equal(sent.text.format.strict, true);
  assert.doesNotMatch(sent.instructions, /procedureIds|2026-11-18/);
  const failing = createOpenAIProvider({apiKey: 'fake', fetchImpl: async () => ({ok: false, status: 401})});
  await assert.rejects(failing.generate({actorCase: actorCase(fixture(), 'ru'), messages: [], text: 'Здравствуйте', locale: 'ru'}), err('provider_unavailable'));
});
test('semantic verifier rejects a fluent unsupported claim without retrying generation', async () => {
  let calls = 0;
  const provider = createOpenAIProvider({apiKey: 'fake', fetchImpl: async (_url, init) => {
    calls++; const request = JSON.parse(init.body);
    const value = request.text.format.name === 'citizen_reply' ? {reply: 'Я получил решение 10 декабря.', revealedFactIds: ['f2'], releasedDocumentIds: ['d1']} : {valid: false};
    return {ok: true, json: async () => ({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(value)}]}], usage: {input_tokens: 100, output_tokens: 20}})};
  }});
  const result = await provider.generate({actorCase: actorCase(fixture(), 'ru'), messages: [], text: 'Когда было решение?', locale: 'ru'});
  assert.equal(calls, 2); assert.equal(result.verified, false); assert.deepEqual(result.revealedFactIds, []); assert.doesNotMatch(result.reply, /декабря/);
});

// Minimal RTDB adapter fake exercises the actual serialization/writer adapters;
// the full Firebase emulator/production binding remains a deployment rehearsal.
function databaseStub() {
  const memory = createMemoryStore();
  return {memory, ref: path => ({get: async () => { const value = await memory.get(path); return {val: () => value}; },
    transaction: async update => { const r = await memory.transaction(path, update); return {committed: r.committed, snapshot: {val: () => r.value}}; }})};
}
test('Firebase session adapter preserves empty arrays/nulls and private catalogue verifies its hash', async () => {
  const db = databaseStub(), store = createFirebaseStore(db), session = {caseData: [fixture()], missing: null, empty: []};
  await store.transaction('sessions/abcdef', () => session);
  assert.deepEqual(await store.get('sessions/abcdef'), session);
  const raw = await db.memory.get('rudn-platform/v1/receptionAI/sessions/abcdef'); assert.equal(typeof raw.payload, 'string');
  const payload = JSON.stringify(fixture());
  await db.memory.transaction('rudn-platform/v1/receptionAI/catalogs/v1/fixture-1', () => ({payload, sha256: hash(payload)}));
  assert.deepEqual(await loadPrivateCatalogue(db, 'v1'), [fixture()]);
  await db.memory.transaction('rudn-platform/v1/receptionAI/catalogs/v1/fixture-1', old => ({...old, sha256: 'bad'}));
  await assert.rejects(loadPrivateCatalogue(db, 'v1'), err('invalid_case'));
});
test('Firebase transactions on a cold cache reach existing sessions before reporting a missing record', async () => {
  const cachedSession = {schema: 1, payload: JSON.stringify({revision: 1})};
  let stored = cachedSession;
  const db = {ref: () => ({
    async transaction(update) {
      // Simulate Firebase's initial empty cache and compare-and-set retry.
      const first = update(null);
      if (first === undefined) return {committed: false, snapshot: {val: () => null}};
      const next = stored === null ? first : update(stored);
      if (next !== undefined) stored = next;
      return {committed: next !== undefined, snapshot: {val: () => stored}};
    }
  })};
  const store = createFirebaseStore(db);
  assert.deepEqual(await store.transaction('sessions/abcdef', old => old ? {revision: old.revision + 1} : undefined),
    {committed: true, value: {revision: 2}});
  assert.deepEqual(await store.transaction('sessions/abcdef', () => undefined),
    {committed: false, value: {revision: 2}});
  stored = null;
  assert.deepEqual(await store.transaction('sessions/abcdef', () => undefined), {committed: false, value: null});
  assert.deepEqual(await store.transaction('sessions/abcdef', () => null), {committed: true, value: null});
});
test('server journal writes are idempotent and preserve a better existing grade', async () => {
  const db = databaseStub(), write = createFirebaseResultWriter(db);
  const record = {sessionId: 'abcdef', studentKey: '12345678', uid: 'test', result: {attemptId: 'reception-ai-abcdef', points: 4, total: 80}, startedAt: 1, completedAt: 2, cases: [{id: 'fixture-1', version: 'v1'}], decisions: [goodDecision]};
  await db.memory.transaction('rudn-platform/v1/grades/12345678/seminar-5', () => ({points: 5}));
  await write(record); await write(record);
  assert.equal((await db.memory.get('rudn-platform/v1/grades/12345678/seminar-5')).points, 5);
  assert.equal((await db.memory.get('rudn-platform/v1/attempts/12345678/reception-ai-abcdef')).serverScored, true);
  await assert.rejects(write({...record, result: {...record.result, points: 5}}), err('result_conflict'));
});
