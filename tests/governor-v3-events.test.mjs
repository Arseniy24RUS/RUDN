import assert from 'node:assert/strict';
import {createHash, createHmac, webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const sources = new URL('../site/apps/governor/src/', import.meta.url);
const sandbox = vm.createContext({crypto: webcrypto, TextEncoder});
for (const name of ['v3-event-bank.js', 'v3-event-copy.js', 'v3-events.js']) {
  vm.runInContext(await readFile(new URL(name, sources), 'utf8'), sandbox, {filename: name});
}
const E = sandbox.GovernorGame.V3Events;
const bank = E.bank;
const isolate = value => JSON.parse(JSON.stringify(value));
const attemptId = 'test-only/attempt-1';
const drawKey = '00'.repeat(32); // Only for checking the supplied reference vector.
const snapshot = {revision: 0, tags: E.baselineTags};
const all = bank.cards.map(card => card.id).sort();

function opening(eventId, year = 2026) {
  const card = bank.cards.find(entry => entry.id === eventId);
  assert.ok(card);
  return {eventId, attemptId, year, circumstance: card.circumstance, snapshotRevision: 0,
    contentVersion: E.contentVersion, algorithmVersion: E.algorithmVersion, candidateHash: '00'.repeat(32)};
}

function year(record, choice, fiscalYear = record.year, facts = {}) {
  return E.year({attemptId, year: fiscalYear, ledger: [record], picks: {[record.year]: choice}, ...facts});
}

test('bank preserves 100 individual cards, 300 choices and territorial coverage', () => {
  assert.equal(all.length, 100);
  assert.equal(new Set(all).size, 100);
  assert.equal(new Set(bank.cards.map(c => c.illustration.artKey)).size, 100);
  assert.equal(new Set(bank.cards.map(c => c.title)).size, 100);
  assert.equal(new Set(bank.cards.map(c => c.situation)).size, 100);
  for (const topic of Object.keys(bank.topics)) assert.equal(bank.cards.filter(c => c.topic === topic).length, 10);
  for (const district of Object.keys(E.baselineTags)) assert.equal(bank.cards.filter(c => c.districtId === district).length, 20);
  for (const card of bank.cards) assert.deepEqual(isolate(card.options.map(o => o.id)), ['a', 'b', 'base']);
  assert.deepEqual(isolate(E.candidates(E.baselineTags)), isolate(all));
  assert.ok(Object.isFrozen(bank.cards[0].options[0].effects.treasury));
});

test('production initialization fills 32 independent bytes without depending on an owner identifier', () => {
  const keys = Array.from({length: 32}, E.createDrawKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every(key => /^[0-9a-f]{64}$/.test(key)));
});

test('opening matches the published reference and reload returns the saved entry even with unavailable origin', async () => {
  const initial = await E.open({attemptId, year: 2026, drawKey, snapshot});
  assert.equal(initial.eventId, 'EDU-07');
  assert.equal(initial.candidateHash, '466345b8eaa23a7933f9d84a5e1f17052cf53b3a8cfef2a611ce954a56e7d722');
  assert.equal(E.card(initial).id, 'EDU-07');
  assert.equal(await E.open({attemptId, year: 2026, snapshot: null, ledger: [initial]}), initial);
  assert.equal(await E.verify(initial, {snapshot, ledger: [initial], drawKey}), true);
  assert.equal(await E.verify({...initial, candidateHash: 'ab'.repeat(32)}, {snapshot, ledger: [initial], drawKey}), false);
  await assert.rejects(E.open({attemptId: 'another-owner', year: 2026, ledger: [initial]}), /invalid-event-record/);
  await assert.rejects(E.open({attemptId, year: 2026, ledger: [initial, initial]}), /event-ledger-conflict/);
  await assert.rejects(E.open({attemptId, year: 2026, ledger: [{...initial, circumstance: null}]}), /invalid-opening-fact/);
});

test('rejection takes another unbiased word, accepts the sole candidate and detects invalid entropy', async () => {
  const attempts = [];
  assert.equal(await E.unbiasedIndex(100, counter => {
    attempts.push(counter);
    return counter === 0 ? 4294967295 : 53;
  }), 53);
  assert.deepEqual(attempts, [0, 1]);
  assert.equal(await E.unbiasedIndex(1, () => assert.fail('one candidate needs no entropy')), 0);
  await assert.rejects(E.unbiasedIndex(0, () => 0), /invalid-candidate-count/);
  await assert.rejects(E.unbiasedIndex(100, () => -10), /invalid-random-word/);
  await assert.rejects(E.unbiasedIndex(100, () => 4294967295), /draw-entropy-exhausted/);
});

test('opening uses geographic presence, blocks on no eligible events and never invents a replacement', async () => {
  const restricted = isolate(E.baselineTags);
  delete restricted.river;
  const chosen = await E.open({attemptId, year: 2026, drawKey, snapshot: {revision: 1, tags: restricted}});
  assert.notEqual(E.card(chosen).districtId, 'river');
  await assert.rejects(E.open({attemptId, year: 2026, drawKey, snapshot: {revision: 1, tags: {}}}), /no-applicable-events/);
  // A known version can restore the tags independently of card art, and keeps the same saved entry.
  const recovered = await E.open({attemptId, year: 2026, drawKey, snapshot, ledger: [chosen]});
  assert.equal(recovered, chosen);
  await assert.rejects(E.open({attemptId, year: 2027, drawKey, snapshot, contentVersion: 'missing'}), /event-bank-unavailable/);
});

function reference(remaining, key, year) {
  const digest = createHash('sha256').update(remaining.join('\n'), 'ascii').digest('hex');
  const limit = Math.floor(2 ** 32 / remaining.length) * remaining.length;
  for (let counter = 0; ; counter += 1) {
    const input = 'governor-event-v1|' + E.contentVersion + '|' + year + '|' + digest + '|' + counter;
    const word = createHmac('sha256', key).update(input).digest().readUInt32BE(0);
    if (word < limit) return {id: remaining[word % remaining.length], digest};
  }
}

test('1024 test keys reach all cards and 64 campaigns match an independent 20-year reference', async () => {
  const firsts = new Set();
  for (let i = 0; i < 1024; i += 1) {
    const key = createHash('sha256').update('test-only-' + i).digest();
    const ledger = [];
    const remaining = [...all];
    for (let year = 2026; year < (i < 64 ? 2046 : 2027); year += 1) {
      const expected = reference(remaining, key, year);
      const found = await E.open({attemptId, year, drawKey: key.toString('hex'), snapshot, ledger});
      assert.equal(found.eventId, expected.id);
      assert.equal(found.candidateHash, expected.digest);
      if (year === 2026) firsts.add(found.eventId);
      ledger.push(found);
      remaining.splice(remaining.indexOf(found.eventId), 1);
      assert.equal(await E.open({attemptId, year, ledger}), found);
    }
    if (i < 64) assert.equal(new Set(ledger.map(row => row.eventId)).size, 20);
  }
  assert.equal(firsts.size, 100); // Repeated first-year outcomes are permitted.
});

test('EDU-01 option A accounts for immediate costs and 25 bps once', () => {
  const card = opening('EDU-01');
  const current = year(card, 'a');
  assert.equal(current.currentExpenseMln, 7);
  assert.deepEqual(isolate(current.rows.map(row => [row.type, row.amount])), [['oneOff', 2], ['operating', 5]]);
  assert.equal(new Set(current.rows.map(row => row.id)).size, 2);
  assert.equal(current.outcomes[0].actualUnits, 40);
  assert.equal(current.outcomes[0].need, 96);
  assert.equal(current.supportByDistrict.suburb, 25);
  assert.deepEqual(year(card, 'a'), current);
  const following = year(card, 'a', 2027);
  assert.equal(following.currentExpenseMln, 0);
  assert.equal(following.outcomes[0].actualUnits, 0);
  assert.equal(following.outcomes[0].execution, 'ended');
  assert.equal(following.supportByDistrict.suburb, undefined);
  assert.equal(year(card, 'a', 2026, {nativeCoverage: {'EDU-01': true}}).outcomes[0].supportBasisPoints, 0);
  assert.equal(year(card, 'a', 2026, {capacity: {'EDU-01': 24}}).outcomes[0].supportBasisPoints, 15);
  assert.deepEqual(isolate(year(card, 'base').rows), []);
});

test('EDU-01 option B records 18 now and exactly three future costs and flows', () => {
  const card = opening('EDU-01', 2044);
  const initial = year(card, 'b');
  assert.equal(initial.currentExpenseMln, 18);
  assert.equal(initial.futureMln, 21);
  assert.equal(initial.outcomes[0].actualUnits, 0);
  assert.deepEqual(isolate(initial.futureRows.map(row => [row.year, row.amount])), [[2045, 7], [2046, 7], [2047, 7]]);
  const next = year(card, 'b', 2045);
  assert.equal(next.currentExpenseMln, 7);
  assert.equal(next.futureMln, 14);
  assert.equal(next.outcomes[0].actualUnits, 75);
  assert.equal(next.rows[0].id, initial.futureRows[0].id);
});

test('external coverage, greater demand and unavoidable expenditure stay in the baseline', () => {
  const social = opening('SOCIAL-05');
  assert.equal(year(social, 'base').outcomes[0].baselineUnits, 24);
  assert.equal(year(social, 'base').outcomes[0].actualUnits, 0);
  assert.equal(year(social, 'a').outcomes[0].baselineUnits, 24);
  assert.equal(year(social, 'a', 2027).outcomes[0].baselineUnits, 0);
  const price = opening('UTILITY-03');
  const externalRows = ['a', 'b', 'base'].map(choice => year(price, choice).rows.find(row => row.type === 'external'));
  assert.ok(externalRows.every(row => row.amount === 4 && row.id === externalRows[0].id));
  assert.equal(year(price, 'base').currentExpenseMln, 4);
  const health = opening('HEALTH-10');
  assert.equal(year(health, 'a').outcomes[0].need, 720);
  assert.equal(year(health, 'base').outcomes[0].need, 720);
});

test('matched receipts require a verified payment and consume only the eligible cap', () => {
  const card = opening('BUDGET-01');
  const quote = year(card, 'a');
  const payment = quote.rows.find(row => row.type === 'oneOff');
  assert.equal(quote.currentReceiptMln, 0);
  assert.equal(year(card, 'base', 2026, {settledSpend: {[payment.id]: 5}}).currentReceiptMln, 0);
  assert.equal(year(card, 'a', 2026, {settledSpend: {[payment.id]: 1}}).currentReceiptMln, 1);
  const settled = year(card, 'a', 2026, {settledSpend: {[payment.id]: 5}});
  assert.equal(settled.currentReceiptMln, 2);
  assert.equal(settled.currentExpenseMln, 4);
  assert.equal(settled.rows.find(row => row.type === 'grant').direction, 'in');
});

test('verified conditional savings reduce an identified base expense only, bounded by documented remainder', () => {
  const card = opening('UTILITY-01');
  const quote = year(card, 'a');
  const source = {id: 'real-ledger-1', year: 2026, expenseMln: 9, reductionMln: 3, usedMln: 2};
  const proof = {'base.energy.municipalBuildings': source};
  assert.equal(quote.currentExpenseMln, 7);
  const verified = year(card, 'a', 2026, {verifiedBaseExpenses: proof});
  assert.equal(verified.currentExpenseMln, 6);
  assert.equal(verified.currentReceiptMln, 0);
  assert.equal(verified.rows.find(row => row.type === 'saving').replaces, source.id);
  assert.equal(year(card, 'a', 2026, {verifiedBaseExpenses: proof, capacity: {'UTILITY-01': 0}}).currentExpenseMln, 7);
  assert.equal(year(card, 'a', 2026, {verifiedBaseExpenses: {'base.energy.municipalBuildings': {...source, year: 2027}}}).currentExpenseMln, 7);
});

test('a cohort or a physical stock is recorded once and remains in the history', () => {
  const cohort = opening('BUDGET-01');
  const first = year(cohort, 'a');
  assert.ok(first.outcomes[0].actualUnits > 0);
  assert.equal(first.outcomes[0].supportBasisPoints, 0);
  const later = year(cohort, 'a', 2027, {executionHistory: first.outcomes});
  assert.equal(later.outcomes[0].actualUnits, 0);
  assert.equal(later.outcomes[0].cumulativeUnits, first.outcomes[0].actualUnits);
  const stock = bank.cards.find(entry => entry.localIndicator.kind === 'stock');
  const record = opening(stock.id);
  const firstOperatingYear = E.plan({record, choice: 'a'}).firstOperatingYear;
  const opened = year(record, 'a', firstOperatingYear);
  const laterStock = year(record, 'a', firstOperatingYear + 1, {executionHistory: opened.outcomes});
  assert.ok(opened.outcomes[0].actualUnits > 0);
  assert.equal(laterStock.outcomes[0].actualUnits, 0);
  assert.equal(laterStock.outcomes[0].cumulativeUnits, opened.outcomes[0].actualUnits);
});

test('all 100 cards present editorial drafts in English and Simplified Chinese with identical model facts', () => {
  for (const id of all) {
    const record = opening(id);
    const author = E.card(record);
    for (const [locale, character] of [['en-GB', /[a-z]/i], ['zh-Hans', /[\u3400-\u9fff]/]]) {
      const localized = E.card(record, locale);
      for (const prose of [localized.title, localized.situation, localized.localIndicator.unitLabel,
        ...localized.options.flatMap(o => [o.label,o.tradeoff,o.beneficiaries,o.instrument])]) {
        assert.match(prose, character, id+' '+locale);
        assert.doesNotMatch(prose, /[А-Яа-яЁё]/, id+' '+locale);
      }
      assert.equal(localized.fallbackLocale, undefined);
      if (author.circumstance.summary) assert.match(localized.circumstance.summary, character);
      assert.equal(localized.circumstance.effects, author.circumstance.effects);
      assert.deepEqual(Array.from(localized.options, o => o.effects), Array.from(author.options, o => o.effects));
      assert.equal(E.plan({record, choice:'a', locale}).plannedUnits, E.plan({record, choice:'a'}).plannedUnits);
      assert.equal(E.plan({record, choice:'a', locale}).option.label, localized.options[0].label);
    }
  }
});

test('an unavailable locale is identifiable and preserves the Russian card and the open record', () => {
  const copy = sandbox.GovernorGame.V3EventCopy;
  delete sandbox.GovernorGame.V3EventCopy;
  try {
    const record = opening('EDU-01');
    const english = E.card(record, 'en-US');
    assert.equal(english.fallbackLocale, 'ru');
    assert.equal(E.localeInfo(english.id, 'en').fallback, true);
    assert.equal(E.card(record).title, english.title);
  } finally {
    sandbox.GovernorGame.V3EventCopy = copy;
  }
});
