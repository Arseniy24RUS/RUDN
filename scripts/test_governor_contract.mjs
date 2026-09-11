import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import { scopedStorage, createRunMetadata, compactReport, makeSubmission, assessCampaign, assessmentRules } from '../site/apps/governor/platform-contract.js';

// Load the shipped classic modules in their browser order, without changing package type.
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const name of [
  'game-data', 'stage3-data', 'stage4-data', 'consolidation-data', 'agenda', 'project-state',
  'population', 'recovery', 'budget-review', 'finance', 'governance-data', 'governance',
  'stories-data', 'stories', 'world-outcomes', 'state-integrity', 'engine'
]) {
  const path = new URL(`../site/apps/governor/src/${name}.js`, import.meta.url);
  vm.runInContext(await readFile(path, 'utf8'), sandbox, { filename: path.pathname });
}
const G = sandbox.GovernorGame;
const E = G.Engine;
const fresh = extra => E.createState({ name: 'Contract test', scenarioId: 'balanced', seed: 'NATIVE-CONTRACT', ...extra });
const completed = fresh();
while (!completed.completed) {
  const mission = E.getCurrentMission(completed);
  const action = mission.actions.find(item => item.deferred);
  E.commitAction(completed, action.id, 'treasury');
  E.advanceTurn(completed);
}

test('storage isolates users, teachers, backups and writer locks without legacy fallback', () => {
  const map = new Map([['save', 'legacy']]);
  const storage = {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
  const a = scopedStorage(storage, 'student:a');
  const b = scopedStorage(storage, 'student:b');
  const teacher = scopedStorage(storage, 'teacher:a');
  assert.equal(a.getItem('save'), null);
  a.setItem('save', 'A');
  a.setItem('save-backup', 'A backup');
  b.setItem('save', 'B');
  teacher.setItem('save', 'teacher preview');
  assert.equal(a.keyFor('save'), 'rudn.governor.v1:student%3Aa:save');
  assert.equal(a.getItem('save'), 'A');
  assert.equal(b.getItem('save'), 'B');
  assert.equal(teacher.getItem('save'), 'teacher preview');
  assert.equal(b.getItem('save-backup'), null);
  assert.notEqual(a.lockName, b.lockName);
  assert.notEqual(a.lockName, teacher.lockName);
  assert.equal(a.lockName, scopedStorage(storage, 'student:a').lockName);
  assert.ok(Object.isFrozen(a));
  assert.throws(() => { a.lockName = b.lockName; }, TypeError);
  a.removeItem('save');
  assert.equal(a.getItem('save'), null);
  assert.equal(b.getItem('save'), 'B');
  assert.equal(map.get('save'), 'legacy');
  for (const owner of ['', 'guest', 'student:', 'teacher:', null, 'student: a']) {
    assert.throws(() => scopedStorage(storage, owner), { code: 'governor/owner-required' });
  }
});

test('identical simulator seeds create distinct serializable run and submission IDs', () => {
  assert.equal(fresh().sessionId, fresh().sessionId, 'Simulator session IDs intentionally repeat');
  const a = createRunMetadata();
  const b = createRunMetadata();
  assert.equal(new Set([a.runId, a.submissionId, b.runId, b.submissionId]).size, 4);
  assert.ok(Number.isFinite(Date.parse(a.startedAt)));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});

test('real completed and partial reports preserve model values, units and state', () => {
  for (const state of [fresh(), completed]) {
    const before = JSON.stringify(state);
    const result = compactReport(state, G);
    const original = E.buildReport(state, 'ru');
    assert.equal(JSON.stringify(state), before);
    assert.equal(result.campaignStatus, state.completed ? 'completed' : 'in-progress');
    assert.equal(result.decisions, state.history.length);
    assert.equal(result.final.fiscalSpace, original.final.fiscalSpace);
    assert.equal(result.final.population, state.population.derived.population);
    assert.equal(result.territories.length, 5);
    for (const place of result.territories) {
      const derived = state.population.derived.municipalities[place.id];
      assert.equal(place.population, derived.population);
      assert.equal(place.healthAccess, derived.healthAccess);
      assert.equal(place.schoolAccess, derived.schoolAccess);
      assert.equal(place.employment, derived.employment);
      assert.ok(place.healthAccess >= 0 && place.healthAccess <= 1);
    }
    assert.equal(Object.hasOwn(result.final, 'stars'), false);
  }
  const full = compactReport(completed, G);
  assert.equal(full.decisionRegister.length, 20);
  assert.equal(full.decisionRegister[0].year, completed.population.baseYear);
  assert.equal(full.decisionRegister[19].year, completed.population.baseYear + 19);
});

test('report arrays and text stay bounded and plain text is escaped only by rendering', () => {
  const report = E.buildReport(completed, 'ru');
  report.decisions.push(...report.decisions);
  report.decisions[0].mission = '<b>Public policy</b>';
  report.decisions[0].action = 'x'.repeat(1000);
  report.population.current.municipalities.extra = report.population.current.municipalities.north;
  const before = JSON.stringify(report);
  const result = compactReport(completed, { ...G, Engine: { buildReport: () => report } });
  assert.equal(result.decisions, 20);
  assert.equal(result.decisionRegister.length, 20);
  assert.equal(result.territories.length, 5);
  assert.equal(result.decisionRegister[0].mission, '<b>Public policy</b>');
  assert.equal(result.decisionRegister[0].action.length, 240);
  assert.equal(JSON.stringify(report), before);
});

const run = { runId: 'test-run', submissionId: 'test-submission', startedAt: '2026-09-11T10:00:00.000Z' };
const submissionArgs = {
  state: completed, G, owner: 'student:a', studentKey: 'a', run,
  reflection: 'My <plain text> reflection', now: '2026-09-11T10:15:00.000Z'
};

test('completed submissions carry the exact automatic grade and leave state and metadata unchanged', () => {
  const before = JSON.stringify({ completed, run });
  const result = makeSubmission(submissionArgs);
  assert.deepEqual(makeSubmission(submissionArgs), result);
  assert.equal(result.id, run.submissionId);
  assert.equal(result.studentKey, 'a');
  assert.equal(result.createdAt, submissionArgs.now);
  assert.equal(result.durationMs, 15 * 60 * 1000);
  assert.equal(result.recordGrade, true);
  assert.equal(result.reviewStatus, 'auto-scored');
  assert.equal(result.points, assessCampaign(completed, G).points);
  assert.equal(result.points, result.governor.assessment.points);
  assert.equal(result.maxPoints, 5);
  assert.equal(result.reflection, submissionArgs.reflection);
  for (const field of ['kpi', 'grade', 'ratio']) assert.equal(Object.hasOwn(result, field), false);
  assert.equal(JSON.stringify({ completed, run }), before);
});

test('submission rejects guest, teacher, changed owner, missing metadata and unfinished games', () => {
  for (const patch of [{ owner: 'guest' }, { owner: 'teacher:a' }, { owner: 'student:b' }, { studentKey: '' }]) {
    assert.throws(() => makeSubmission({ ...submissionArgs, ...patch }), { code: 'governor/student-owner-mismatch' });
  }
  assert.throws(() => makeSubmission({ ...submissionArgs, state: fresh() }), { code: 'governor/campaign-unfinished' });
  assert.throws(() => makeSubmission({ ...submissionArgs, run: {} }), { code: 'governor/run-required' });
  assert.throws(() => makeSubmission({ ...submissionArgs, now: 'invalid' }), { code: 'governor/invalid-timestamp' });
});

test('real financial handover is submittable without fabricating full completion', () => {
  const state = fresh({ budgetMode: 'decisions' });
  const settle = () => {
    while (G.BudgetReview.pending(state)) {
      const choice = state.budgetReview.pending.event.options.find(item => item.available);
      assert.ok(choice);
      E.resolveBudgetReview(state, choice.id);
    }
  };
  E.commitAction(state, 'clinics', 'cofinance', null, ['milestones']);
  settle(); E.advanceTurn(state); settle();
  E.commitAction(state, 'defer-youth-employment', 'treasury');
  settle(); E.advanceTurn(state); settle();
  E.treasuryOperation(state, 'reserve', state.finance.treasury);
  E.commitAction(state, 'defer-flood-preparedness', 'treasury');
  assert.ok(G.BudgetReview.pending(state));
  E.endUnderSupervision(state);
  assert.equal(state.completed, false);
  assert.ok(E.validateState(state));
  const before = JSON.stringify(state);
  const result = makeSubmission({ ...submissionArgs, state });
  assert.equal(result.governor.campaignStatus, 'financial-handover');
  assert.equal(result.governor.decisions, state.history.length);
  assert.ok(result.governor.decisions < 20);
  assert.equal(result.recordGrade, true);
  assert.equal(result.points, result.governor.assessment.points);
  assert.ok(result.points <= 2.5);
  assert.equal(result.governor.assessment.criteria.find(item => item.id === 'finance').points, 0);
  assert.equal(JSON.stringify(state), before);
});

function scoringFixture() {
  const ids = ['north', 'industrial', 'river', 'capital', 'suburb'];
  const values = access => ({ healthAccess: access, schoolAccess: access, employment: access, population: 1000 });
  const state = { history: Array.from({ length: 20 }, () => ({})), completed: true };
  const report = {
    final: { debtLimit: 10, debt: 2, reserve: 0 },
    finance: {
      initialDebt: 2,
      portfolio: Array.from({ length: 5 }, () => ({ activatedTurn: 1, paidTurns: [1], implementationFactor: 1, deferred: false }))
    },
    population: {
      initial: { access: Object.fromEntries(ids.map(id => [id, values(0.5)])) },
      current: { municipalities: Object.fromEntries(ids.map(id => [id, values(0.625)])) }
    },
    forecast: { rows: [{ cash: 0 }, { cash: 0 }, { cash: 0 }] },
    governance: { promises: Array.from({ length: 3 }, () => ({ status: 'kept', revisions: [], dueTurn: 3 })) }
  };
  const game = {
    Engine: { buildReport: (_state, language) => { assert.equal(language, 'ru'); return report; } },
    Population: { MUNICIPALITIES: ids.map(id => ({ id })) },
    BudgetReview: { stopped: candidate => candidate.budgetReview?.status === 'supervised' }
  };
  return { state, report, game, assess: () => assessCampaign(state, game) };
}
const criterion = (assessment, id) => assessment.criteria.find(item => item.id === id);

test('published rubric has five one-point criteria, exposes both languages and reaches exact 0 and 5', () => {
  const f = scoringFixture();
  assert.equal(f.assess().points, 5);
  assert.deepEqual(f.assess().criteria.map(item => item.points), [1, 1, 1, 1, 1]);
  assert.equal(f.assess().maxPoints, 5);
  f.state.history = [];
  f.state.completed = false;
  assert.equal(f.assess().points, 0);
  assert.equal(f.assess().completionRatio, 0);
  assert.deepEqual(f.assess().criteria.map(item => item.points), [0, 0, 0, 0, 0]);
  assert.equal(assessmentRules.length, 6);
  assert.ok(assessmentRules.every(rule => rule.title.ru && rule.title.en && rule.detail.ru && rule.detail.en));
});

test('delivery requires actual operation, uses authored factor once and handles zero projects', () => {
  const f = scoringFixture();
  f.report.finance.portfolio = [];
  assert.equal(criterion(f.assess(), 'delivery').rawPoints, 0);
  f.report.finance.portfolio = Array.from({ length: 5 }, () => ({ activatedTurn: null, paidTurns: [], implementationFactor: 1 }));
  assert.equal(criterion(f.assess(), 'delivery').rawPoints, 0);
  let previous = 0;
  for (const project of f.report.finance.portfolio) {
    project.activatedTurn = 2;
    project.paidTurns = [2];
    project.implementationFactor = 0.8;
    const score = criterion(f.assess(), 'delivery').rawPoints;
    assert.ok(score >= previous);
    previous = score;
  }
  assert.equal(previous, 0.8);
  f.report.finance.portfolio.push({ activatedTurn: 1, paidTurns: [1], implementationFactor: 1, deferred: true });
  assert.equal(criterion(f.assess(), 'delivery').rawPoints, 0.8, 'No-new-programme records do not change the denominator');
});

test('territorial criterion uses scenario baselines and grows monotonically with current access', () => {
  const f = scoringFixture();
  const setAccess = (places, value) => Object.values(places).forEach(place => {
    place.healthAccess = value; place.schoolAccess = value; place.employment = value;
  });
  let previous = 0;
  for (let step = 0; step <= 100; step++) {
    setAccess(f.report.population.current.municipalities, step / 100);
    const score = criterion(f.assess(), 'territories').rawPoints;
    assert.ok(score + 1e-12 >= previous);
    previous = score;
  }
  setAccess(f.report.population.current.municipalities, 0.5);
  assert.equal(criterion(f.assess(), 'territories').rawPoints, 0.5);
  setAccess(f.report.population.current.municipalities, 0.25);
  assert.equal(criterion(f.assess(), 'territories').rawPoints, 0.25);
  setAccess(f.report.population.initial.access, 0.8);
  setAccess(f.report.population.current.municipalities, 0.85);
  assert.ok(Math.abs(criterion(f.assess(), 'territories').rawPoints - 1) < 1e-12);
  setAccess(f.report.population.initial.access, 1);
  setAccess(f.report.population.current.municipalities, 1);
  assert.equal(criterion(f.assess(), 'territories').rawPoints, 1);
});

test('finance uses initial debt headroom and exactly three cash projections with reserve', () => {
  const f = scoringFixture();
  f.report.final.debt = 6;
  assert.equal(criterion(f.assess(), 'finance').rawPoints, 0.75);
  f.report.final.debt = 10;
  assert.equal(criterion(f.assess(), 'finance').rawPoints, 0.5);
  f.report.forecast.rows = [{ cash: -1 }, { cash: -2 }, { cash: -3 }, { cash: 100 }];
  assert.equal(criterion(f.assess(), 'finance').rawPoints, 0);
  f.report.final.reserve = 2;
  assert.equal(criterion(f.assess(), 'finance').rawPoints, 1 / 3);
  f.report.final.reserve = 3;
  assert.equal(criterion(f.assess(), 'finance').rawPoints, 0.5);
  f.report.final.debt = 2;
  assert.equal(criterion(f.assess(), 'finance').rawPoints, 1);
});

test('promise scores distinguish none, deadlines, breaches and revised fulfilment without overlap', () => {
  const f = scoringFixture();
  f.report.governance.promises = [];
  assert.equal(criterion(f.assess(), 'promises').rawPoints, 0);
  f.report.governance.promises.push({ status: 'kept', revisions: [], dueTurn: 1 });
  assert.equal(criterion(f.assess(), 'promises').rawPoints, 1 / 3);
  f.report.governance.promises.push({ status: 'kept', revisions: [{}], dueTurn: 2 });
  assert.equal(criterion(f.assess(), 'promises').rawPoints, 1.75 / 3);
  f.report.governance.promises.push({ status: 'broken', revisions: [], dueTurn: 3 });
  f.report.governance.promises.push({ status: 'pending', revisions: [], dueTurn: 20 });
  assert.equal(criterion(f.assess(), 'promises').rawPoints, 1.75 / 4);
  f.report.governance.promises.push({ status: 'pending', revisions: [], dueTurn: 21 });
  assert.equal(criterion(f.assess(), 'promises').rawPoints, 1.75 / 4);
  f.report.governance.promises[2].status = 'kept';
  assert.equal(criterion(f.assess(), 'promises').rawPoints, 2.75 / 4);
});

test('progress scales performance and early handover cannot earn more than 2.5', () => {
  const f = scoringFixture();
  f.state.completed = false;
  let previous = 0;
  for (let count = 0; count <= 20; count++) {
    f.state.history = Array.from({ length: count }, () => ({}));
    const result = f.assess();
    assert.equal(result.completionRatio, count / 20);
    assert.equal(result.points, count / 4);
    assert.ok(result.points >= previous);
    previous = result.points;
  }
  f.state.history = Array.from({ length: 19 }, () => ({}));
  f.state.budgetReview = { status: 'supervised' };
  const result = f.assess();
  assert.equal(result.points, 2.5);
  assert.equal(result.uncappedPoints, 3.8);
  assert.equal(result.handoverCapApplied, true);
  assert.equal(criterion(result, 'finance').rawPoints, 0);
  assert.equal(criterion(result, 'completion').rawPoints, 0.95);
  assert.ok(result.capMultiplier < 1);
  assert.ok(result.criteria.every(item => item.detail.en.includes('Handover cap multiplier:')));
  assert.equal(Math.round(result.criteria.reduce((sum, item) => sum + item.points, 0) * 100), 250);
});

test('scoring is pure, deterministic, bounded and rounded criterion allocations equal the total', () => {
  const f = scoringFixture();
  for (const handover of [false, true]) for (const count of [0, 1, 7, 19, 20, 25]) for (const factor of [0, 0.123456, 0.5, 0.9999, 1, 1.2]) {
    f.state.history = Array.from({ length: count }, () => ({}));
    f.state.completed = !handover;
    f.state.budgetReview = handover ? { status: 'supervised' } : undefined;
    for (const project of f.report.finance.portfolio) project.implementationFactor = factor;
    const before = JSON.stringify({ state: f.state, report: f.report });
    const result = f.assess();
    assert.deepEqual(f.assess(), result);
    assert.equal(JSON.stringify({ state: f.state, report: f.report }), before);
    assert.ok(result.points >= 0 && result.points <= (handover ? 2.5 : 5));
    assert.ok(result.criteria.every(item => item.points >= 0 && item.points <= 1 && item.rawPoints >= 0 && item.rawPoints <= 1));
    assert.equal(Math.round(result.criteria.reduce((sum, item) => sum + item.points, 0) * 100), Math.round(result.points * 100));
    assert.equal(result.criteria.length, 5);
  }
});
