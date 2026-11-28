/* The annual situation is chosen from the opening world and stored before presentation. */
(function (root) {
  'use strict';
  const G = root.GovernorGame;
  const bank = G.V3EventBank;
  const major = G.V4MajorEvents;
  const contentVersion = bank.contentVersion;
  const algorithmVersion = bank.drawPolicy.version;
  const firstYear = 2026;
  const lastYear = 2045;
  const range = 2 ** 32;
  const encoder = new TextEncoder();
  const majorDrawSlots = ['major','ordinary-1','ordinary-2','ordinary-3','ordinary-4'];

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  freeze(bank);
  freeze(major);
  const byId = new Map([...bank.cards, ...(major?.cards || [])].map(card => [card.id, card]));
  const baselineTags = bank.worldBaselineTags.byDistrict;

  class EventError extends Error {
    constructor(code) {
      super(code);
      this.name = 'GovernorEventError';
      this.code = code;
    }
  }

  const invariant = (condition, code) => {
    if (!condition) throw new EventError(code);
  };
  const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const validYear = year => Number.isInteger(year) && year >= firstYear && year <= lastYear;
  const validHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const validPolicy = policy => policy === undefined || policy === major?.POLICY || policy === major?.LEGACY_POLICY;
  const nonnegative = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

  function createDrawKey() {
    invariant(typeof root.crypto?.getRandomValues === 'function', 'entropy-unavailable');
    return hex(root.crypto.getRandomValues(new Uint8Array(32)));
  }

  function validRecord(record, attemptId) {
    const entry = record && byId.get(record.eventId);
    invariant(entry && record.attemptId === attemptId && validYear(record.year), 'invalid-event-record');
    invariant(record.contentVersion === contentVersion, 'event-bank-unavailable');
    invariant(record.algorithmVersion === algorithmVersion, 'event-algorithm-unavailable');
    invariant(validPolicy(record.eventPolicy), 'event-policy-unavailable');
    if (major?.has(entry.id)) {
      invariant(record.eventPolicy === major.POLICY ||
        record.eventPolicy === major.LEGACY_POLICY && major.legacyCards.some(card => card.id === entry.id),
        'invalid-major-event-record');
    }
    invariant(validHash(record.candidateHash) && validRevision(record.snapshotRevision), 'invalid-event-receipt');
    const circumstance = record.circumstance;
    const authored = entry.circumstance;
    invariant(circumstance?.kind === authored.kind && circumstance.appliesAt === authored.appliesAt &&
      circumstance.summary === authored.summary, 'invalid-opening-fact');
    const terms = Object.entries(authored.effects);
    invariant(circumstance.effects && Object.keys(circumstance.effects).length === terms.length &&
      terms.every(([key, value]) => circumstance.effects[key] === value), 'invalid-opening-fact');
    return entry;
  }

  const validRevision = revision => Number.isSafeInteger(revision) && revision >= 0 ||
    typeof revision === 'string' && revision.trim().length > 0 && revision.length <= 128;

  const baseText = {
    en: {label: 'Keep the existing plan', tradeoff: 'Fund the required services as planned. This year has no additional measure.',
      beneficiaries: 'people using existing services', instrument: 'existing operating plan'},
    zh: {label: '保留现行计划', tradeoff: '按计划资助必要服务，本年不增加措施。', beneficiaries: '现有服务的使用者', instrument: '现行安排'}
  };
  const instruments = {
    'организация действующих ресурсов': {en: 'coordinate existing resources', zh: '协调现有资源'},
    'оказание услуги или вложение': {en: 'service or investment', zh: '服务或投入'}
  };

  function language(locale) {
    return ({en:'en', zh:'zh'})[String(locale || '').toLowerCase().split(/[-_]/)[0]] || 'ru';
  }

  const eventCopy = id => major?.copy[id] || G.V3EventCopy?.[id];

  function localeInfo(eventId, locale) {
    const requested = language(locale);
    const fallback = requested !== bank.locale && !eventCopy(eventId)?.[requested];
    return {locale: fallback ? bank.locale : requested, fallback};
  }

  function eventCard(eventId, locale) {
    const entry = byId.get(eventId);
    if (!entry) return null;
    const available = localeInfo(eventId, locale);
    if (available.locale === bank.locale) {
      return available.fallback ? {...entry, locale:bank.locale, fallbackLocale:bank.locale} : entry;
    }
    const {title, situation, unitLabel, circumstance, ...measures} = eventCopy(eventId)[available.locale];
    return {...entry, title, situation, locale: available.locale,
      localIndicator: {...entry.localIndicator, unitLabel},
      circumstance: {...entry.circumstance, summary: circumstance || null},
      options: entry.options.map(option => option.id === 'base' ? {...option, ...baseText[available.locale], ...measures.base} :
        {...option, ...measures[option.id], instrument: instruments[option.instrument]?.[available.locale] || option.instrument})};
  }

  function card(record, locale) {
    if (!record) return null;
    const entry = validRecord(record, record.attemptId);
    return eventCard(entry.id, locale);
  }

  function options(record, locale) {
    return card(record, locale)?.options || [];
  }

  function verifyLedger(ledger, attemptId) {
    invariant(Array.isArray(ledger), 'invalid-event-ledger');
    const years = new Set();
    const used = new Set();
    for (const record of ledger) {
      validRecord(record, attemptId);
      invariant(record.eventPolicy === ledger[0].eventPolicy, 'event-policy-conflict');
      invariant(!years.has(record.year) && !used.has(record.eventId), 'event-ledger-conflict');
      years.add(record.year);
      used.add(record.eventId);
    }
    return used;
  }

  function candidates(tags, used = new Set(), cards = bank.cards) {
    if (!tags || typeof tags !== 'object') return [];
    return cards.filter(entry => {
      const {requiresTerritory, requiresBaselineTag} = entry.applicability;
      return Object.hasOwn(tags, requiresTerritory) && Array.isArray(tags[requiresTerritory]) &&
        tags[requiresTerritory].includes(requiresBaselineTag) && !used.has(entry.id);
    }).map(entry => entry.id).sort();
  }

  async function unbiasedIndex(size, nextWord) {
    invariant(Number.isInteger(size) && size >= 1 && size <= range, 'invalid-candidate-count');
    if (size === 1) return 0;
    const limit = Math.floor(range / size) * size;
    for (let counter = 0; counter < 4096; counter += 1) {
      const word = await nextWord(counter);
      invariant(Number.isInteger(word) && word >= 0 && word < range, 'invalid-random-word');
      if (word < limit) return word % size;
    }
    throw new EventError('draw-entropy-exhausted');
  }

  async function draw(ids, drawKey, year, domain = 'governor-event-v1') {
    invariant(validHash(drawKey), 'invalid-draw-key');
    const subtle = root.crypto?.subtle;
    invariant(subtle, 'secure-browser-required');
    const input = encoder.encode(ids.join('\n'));
    const candidateHash = hex(new Uint8Array(await subtle.digest('SHA-256', input)));
    const keyBytes = Uint8Array.from(drawKey.match(/../g), value => Number.parseInt(value, 16));
    const key = await subtle.importKey('raw', keyBytes, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
    const index = await unbiasedIndex(ids.length, async counter => {
      const message = encoder.encode(domain + '|' + contentVersion + '|' + year + '|' + candidateHash + '|' + counter);
      const bytes = await subtle.sign('HMAC', key, message);
      return new DataView(bytes).getUint32(0);
    });
    return {eventId: ids[index], candidateHash};
  }

  async function isScheduledMajorYear(year, drawKey) {
    const termStart = year - (year-firstYear)%5;
    const startOffset = termStart === firstYear ? 2 : 1;
    if (year < termStart+startOffset) return false;
    const years = Array.from({length:5-startOffset}, (_,i) => String(termStart+startOffset+i));
    const selected = await draw(years, drawKey, termStart, 'governor-major-year-v1');
    return selected.eventId === String(year);
  }

  async function rolledMajor(year, drawKey) {
    const chance = await draw(majorDrawSlots, drawKey, year, 'governor-major-chance-v2');
    return chance.eventId === 'major';
  }

  // Call inside the controller's attempt lock. This routine never persists or reveals a card.
  async function open({
    attemptId, year, drawKey, snapshot, ledger = [], eventPolicy,
    contentVersion: version = contentVersion, algorithmVersion: algorithm = algorithmVersion
  }) {
    invariant(typeof attemptId === 'string' && attemptId.trim() && validYear(year), 'invalid-event-key');
    invariant(version === contentVersion, 'event-bank-unavailable');
    invariant(algorithm === algorithmVersion, 'event-algorithm-unavailable');
    const used = verifyLedger(ledger, attemptId);
    const policy = eventPolicy ?? ledger[0]?.eventPolicy;
    invariant(validPolicy(policy), 'event-policy-unavailable');
    invariant(ledger.length === 0 || ledger[0].eventPolicy === policy, 'event-policy-conflict');
    const saved = ledger.find(record => record.year === year);
    if (saved) return saved;
    invariant(!ledger.some(record => record.year > year), 'event-ledger-gap');
    invariant(validRevision(snapshot?.revision), 'opening-snapshot-unavailable');
    // The policy belongs to the attempt, including after a reload or a recovery from the cloud.
    let ids = candidates(snapshot.tags,used);
    if (policy && policy === major.POLICY) {
      const featured = candidates(snapshot.tags,used,major.cards);
      if (featured.length && (!ids.length || await rolledMajor(year,drawKey))) ids = featured;
    } else if (policy && await isScheduledMajorYear(year,drawKey)) {
      const featured = candidates(snapshot.tags,used,major.legacyCards);
      if (featured.length) ids = featured;
    }
    invariant(ids.length > 0, 'no-applicable-events');
    const selected = await draw(ids, drawKey, year);
    const circumstance = byId.get(selected.eventId).circumstance;
    return {...selected, attemptId, year, contentVersion, algorithmVersion, ...(policy ? {eventPolicy:policy} : {}),
      snapshotRevision: snapshot.revision, circumstance};
  }

  async function verify(record, {snapshot, ledger, drawKey}) {
    validRecord(record, record?.attemptId);
    verifyLedger(ledger, record.attemptId);
    if (snapshot?.revision !== record.snapshotRevision) return false;
    const expected = await open({
      attemptId: record.attemptId, year: record.year, drawKey, snapshot,
      ledger: ledger.filter(item => item.year < record.year), eventPolicy: record.eventPolicy
    });
    return expected.eventId === record.eventId && expected.candidateHash === record.candidateHash;
  }

  function plan({record, choice, locale}) {
    const entry = card(record, locale);
    const option = entry?.options.find(item => item.id === choice);
    invariant(option, 'invalid-event-option');
    const terms = record.circumstance.effects;
    const treasury = option.effects.treasury;
    const firstOperatingYear = record.year + treasury.firstOperatingYearOffset;
    const lastOperatingYear = firstOperatingYear + treasury.fundedYears - 1;
    const inYearOperating = record.year === firstOperatingYear ? treasury.operatingMlnRubPerYear : 0;
    const need = entry.localIndicator.potential + (terms.needDelta || 0);
    const baselineUnits = Math.min(need, terms.baselineUnits || 0);
    const plannedUnits = Math.min(need - baselineUnits, option.effects.localOutcome.units);
    return {
      record, card: entry, option, need, baselineUnits, plannedUnits, firstOperatingYear, lastOperatingYear,
      eventId: entry.id, optionId: option.id, district: entry.districtId, sector: entry.topic,
      oneOffMln: treasury.oneOffMlnRub, annualMln: treasury.operatingMlnRubPerYear,
      fundedYears: treasury.fundedYears, currentExpenseMln: treasury.oneOffMlnRub + inYearOperating,
      futureMln: treasury.fundedYears * treasury.operatingMlnRubPerYear - inYearOperating,
      externalExpenseMln: terms.unavoidableExpenseMlnRub || 0,
      matchedReceiptCapMln: terms.matchedReceiptCapMlnRub || 0
    };
  }

  function posting(selection, type, fiscalYear, amount, details) {
    const {record, eventId, optionId, sector, district} = selection;
    // External expense belongs to the opening facts, irrespective of the chosen option.
    const action = type === 'external' ? 'opening' : optionId;
    const id = [encodeURIComponent(record.attemptId), record.year, eventId, action, type, fiscalYear].join('|');
    return {id, year: fiscalYear, amount, amountMln: amount, type, eventId, optionId: action,
      decisionYear: record.year, sector, district, direction: type === 'grant' ? 'in' : 'out', ...details};
  }

  function serviceOutcome(selection, year, options) {
    const {record, card: entry, option, firstOperatingYear, lastOperatingYear, need, baselineUnits} = selection;
    const indicator = entry.localIndicator;
    const active = option.id !== 'base' && year >= firstOperatingYear && year <= lastOperatingYear;
    const due = indicator.kind === 'flow' ? active : active && year === firstOperatingYear;
    const ceiling = options.capacity[entry.id];
    const currentCeiling = typeof ceiling === 'object' && ceiling !== null ? ceiling[year] : ceiling;
    const currentUnits = due ? Math.min(selection.plannedUnits, currentCeiling == null ?
      selection.plannedUnits : nonnegative(currentCeiling)) : 0;
    const history = options.executionHistory;
    const opened = history.find(row => row.eventId === entry.id && row.year === firstOperatingYear);
    const pastUnits = opened ? Math.min(selection.plannedUnits, nonnegative(opened.actualUnits)) : 0;
    const cumulativeUnits = indicator.kind === 'flow' ? currentUnits : currentUnits || pastUnits;
    const attributed = indicator.kind === 'stock' && active ? cumulativeUnits : currentUnits;
    const countsInNativeModel = options.nativeCoverage[entry.id] === true;
    const budget = option.effects.support.maxBasisPoints;
    const supportBasisPoints = countsInNativeModel ? 0 : Math.round(budget * attributed / need);
    const execution = year < firstOperatingYear ? 'scheduled' : active ? 'operating' : 'ended';
    return {
      decisionYear: record.year, year, eventId: entry.id, optionId: option.id,
      sector: entry.topic, district: entry.districtId, territory: entry.districtId,
      metric: indicator.id, unitLabel: indicator.unitLabel, kind: indicator.kind,
      beneficiaries: option.beneficiaries, need, baselineUnits: year === record.year ? baselineUnits : 0,
      baselineOpeningUnits: baselineUnits, actualUnits: currentUnits, cumulativeUnits,
      supportBasisPoints, active, execution: option.id === 'base' ? 'baseline' : execution
    };
  }

  function year({
    attemptId, year: fiscalYear, ledger, picks, verifiedBaseExpenses = {}, settledSpend = {},
    capacity = {}, nativeCoverage = {}, executionHistory = []
  }) {
    invariant(validYear(fiscalYear), 'invalid-financial-year');
    verifyLedger(ledger, attemptId);
    const rows = [];
    const futureRows = [];
    const outcomes = [];
    const supportByDistrict = {};
    let roadChange;
    const usedSavings = new Map();
    for (const record of [...ledger].sort((a, b) => a.year - b.year)) {
      if (record.year > fiscalYear) break;
      const choice = picks?.[record.year];
      // Older open rows from a pending transaction may still have no picked answer.
      const selection = plan({record, choice: choice ?? 'base'});
      const {oneOffMln, annualMln, externalExpenseMln, firstOperatingYear, lastOperatingYear} = selection;
      const current = record.year === fiscalYear;
      const active = fiscalYear >= firstOperatingYear && fiscalYear <= lastOperatingYear;
      if (current) roadChange = major?.roadImpact(record,selection.optionId,fiscalYear);
      const required = [];
      if (current && externalExpenseMln) rows.push(posting(selection, 'external', fiscalYear, externalExpenseMln));
      if (current && oneOffMln) required.push(posting(selection, 'oneOff', fiscalYear, oneOffMln));
      if (active && annualMln) required.push(posting(selection, 'operating', fiscalYear, annualMln));
      rows.push(...required);
      for (let y = Math.max(firstOperatingYear, fiscalYear + 1); annualMln > 0 && y <= lastOperatingYear; y += 1) {
        futureRows.push(posting(selection, 'operating', y, annualMln));
      }
      const outcome = serviceOutcome(selection, fiscalYear, {capacity, nativeCoverage, executionHistory});
      if (current || choice && choice !== 'base') outcomes.push(outcome);
      if (outcome.supportBasisPoints) {
        supportByDistrict[outcome.district] = (supportByDistrict[outcome.district] || 0) + outcome.supportBasisPoints;
      }
      // A grant settles an actual eligible payment, not a provisional draft expense.
      const confirmed = required.reduce((sum, row) => sum + Math.min(row.amount, nonnegative(settledSpend[row.id])), 0);
      const grant = current ? Math.min(selection.matchedReceiptCapMln, confirmed) : 0;
      if (grant) rows.push(posting(selection, 'grant', fiscalYear, grant));
      const terms = selection.option.effects.conditionalSaving;
      if (terms && active && (outcome.actualUnits || outcome.active && outcome.kind === 'stock' && outcome.cumulativeUnits)) {
        const source = verifiedBaseExpenses[terms.baseLedgerRef];
        if (typeof source?.id === 'string' && source.id && source.year === fiscalYear) {
          const used = usedSavings.get(source.id) ?? nonnegative(source.usedMln);
          const amount = Math.min(terms.maxMlnRubPerYear, Math.max(0, nonnegative(source.expenseMln) - used),
            Math.max(0, nonnegative(source.reductionMln) - used));
          if (amount) {
            usedSavings.set(source.id, used + amount);
            rows.push(posting(selection, 'saving', fiscalYear, amount, {sourceId: source.id, replaces: source.id}));
          }
        }
      }
    }
    const currentExpenseMln = rows.reduce((sum, row) =>
      sum + (row.direction === 'in' ? 0 : row.type === 'saving' ? -row.amount : row.amount), 0);
    const currentReceiptMln = rows.reduce((sum, row) => sum + (row.direction === 'in' ? row.amount : 0), 0);
    const futureMln = futureRows.reduce((sum, row) => sum + row.amount, 0);
    return {rows, futureRows, outcomes, supportByDistrict, currentExpenseMln, currentReceiptMln, futureMln,
      ...(roadChange ? {roadChanges:[roadChange]} : {})};
  }

  G.V3Events = {bank, baselineTags, contentVersion, algorithmVersion, createDrawKey, candidates,
    unbiasedIndex, open, verify, card, eventCard, localeInfo, options, plan, year, Error: EventError};
})(globalThis);
