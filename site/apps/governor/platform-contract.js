/** Platform identity and reporting contract. The simulation owns no authentication. */
const PREFIX = 'rudn.governor.v1:';
const MAX_DECISIONS = 20;
const MAX_TERRITORIES = 5;
const ASSESSMENT_VERSION = 'governor-assignment-v1';

/** Published assignment targets, not an empirically validated measure of competence. */
export const assessmentRules = [
  {
    id: 'completion', title: { ru: 'Завершение кампании', en: 'Campaign completion' },
    detail: {
      ru: 'До 1 балла: число подтверждённых годовых решений / 20. Неисполненный переход не считается решением.',
      en: 'Up to 1 point: confirmed annual decisions / 20. An unexecuted transition does not count.'
    }
  },
  {
    id: 'delivery', title: { ru: 'Исполнение программ', en: 'Programme delivery' },
    detail: {
      ru: 'До 1 балла: сумма коэффициентов исполнения запущенных программ с хотя бы одним оплаченным годом / максимум из 5 и числа всех начатых программ. Коэффициент ограничен диапазоном 0–1. Решения без новой программы исключены; без программ — 0.',
      en: 'Up to 1 point: sum of implementation factors for launched programmes with at least one paid year / the larger of 5 and all programmes started. Each factor is limited to 0–1. No-new-programme choices are excluded; no programmes earns 0.'
    }
  },
  {
    id: 'territories', title: { ru: 'Услуги в территориях', en: 'Territorial services' },
    detail: {
      ru: 'До 1 балла: среднее по 5 территориям и 3 показателям — медицине, школе и занятости. Для исходной доступности b и итоговой x (0–1): при x < b — 0,5 × x / b; иначе — 0,5 + 0,5 × min(1, (x − b) / max(0,01; 0,25 × (1 − b))). При b = 1 оценка равна x. Сохранение исходной доступности даёт половину; улучшение на четверть исходного разрыва — полный балл (минимальный знаменатель 0,01).',
      en: 'Up to 1 point: mean across 5 territories and 3 indicators — health, school and employment access. For initial b and final x (0–1): if x < b, score = 0.5 × x / b; otherwise, 0.5 + 0.5 × min(1, (x − b) / max(0.01, 0.25 × (1 − b))). If b = 1, score = x. Maintaining access earns half; closing a quarter of the starting gap earns full credit, subject to the 0.01 denominator floor.'
    }
  },
  {
    id: 'finance', title: { ru: 'Финансовая устойчивость', en: 'Financial sustainability' },
    detail: {
      ru: 'До 1 балла: среднее из запаса до долгового лимита относительно начала — min(1, max(0, (лимит − долг) / max(0,01; лимит − начальный долг))) — и доли из 3 прогнозных лет, где казна + резерв ≥ 0. Прогноз использует условия модели без новых проектов и автоматической помощи. При досрочной передаче финансового управления — 0.',
      en: 'Up to 1 point: average of debt headroom relative to the start — min(1, max(0, (limit − debt) / max(0.01, limit − initial debt))) — and the fraction of 3 projected years with treasury + reserve ≥ 0. The model projection assumes no new projects or automatic rescue. Early financial handover earns 0 for this criterion.'
    }
  },
  {
    id: 'promises', title: { ru: 'Выполнение обещаний', en: 'Promise fulfilment' },
    detail: {
      ru: 'До 1 балла: (выполненные без переноса + 0,75 × выполненные после переноса) / максимум из 3 и суммы всех выполненных и нарушенных обещаний плюс ожидающие со сроком до 20-го года. Ожидающие обещания за пределами срока исключены; без обещаний — 0.',
      en: 'Up to 1 point: (kept without revision + 0.75 × kept after revision) / the larger of 3 and the count of all kept and broken promises plus pending promises due by year 20. Pending promises beyond the term are excluded; no promises earns 0.'
    }
  },
  {
    id: 'overall', title: { ru: 'Итоговая оценка', en: 'Overall grade' },
    detail: {
      ru: 'Максимум 5 баллов. Критерии 2–5 умножаются на долю выполненных решений c = min(20, число решений) / 20. При досрочной передаче управления сумма ограничена 2,5 балла: при превышении все составляющие пропорционально уменьшаются. Итог округляется до 0,01; округлённые составляющие распределяются так, чтобы их сумма точно совпала с итогом. Это опубликованная рубрика игрового задания; её пороги не являются эмпирической оценкой общей компетентности. Территориальные показатели отражают также демографические изменения и не доказывают причинный эффект решений студента.',
      en: 'Maximum 5 points. Criteria 2–5 are multiplied by completed-decision share c = min(20, decisions) / 20. Early financial handover is capped at 2.5 points; if exceeded, all criteria are reduced proportionally. The total is rounded to 0.01, with rounded criterion allocations summing exactly to it. This published game-assignment rubric is not an empirically validated measure of general competence. Territorial indicators also reflect demographic changes and do not establish the causal effect of student decisions.'
    }
  }
];

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function validOwner(owner) {
  return typeof owner === 'string' && /^(student|teacher):\S+$/.test(owner);
}

/** Capture the owner once; switching accounts requires a new adapter and game. */
export function scopedStorage(storage, owner) {
  if (!validOwner(owner)) fail('governor/owner-required');
  if (!storage || !['getItem', 'setItem', 'removeItem'].every(method => typeof storage[method] === 'function')) {
    fail('governor/storage-required');
  }
  const namespace = `${PREFIX}${encodeURIComponent(owner)}:`;
  const keyFor = key => namespace + String(key);
  return Object.freeze({
    getItem: key => storage.getItem(keyFor(key)),
    setItem: (key, value) => storage.setItem(keyFor(key), value),
    removeItem: key => storage.removeItem(keyFor(key)),
    keyFor,
    lockName: keyFor('writer')
  });
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) fail('governor/randomness-unavailable');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Serializable sidecar: never use the deterministic simulator sessionId as an attempt ID. */
export function createRunMetadata() {
  return {
    runId: randomId(),
    submissionId: randomId(),
    startedAt: new Date().toISOString()
  };
}

const text = (value, limit = 240) => String(value ?? '').slice(0, limit);
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const localName = value => typeof value === 'string' ? value : value?.ru ?? value?.en ?? '';

function campaignStatus(state, G) {
  if (state?.completed === true) return 'completed';
  if (G.BudgetReview?.stopped?.(state) || state?.budgetReview?.status === 'supervised') return 'financial-handover';
  return 'in-progress';
}

const clip = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
const scoreText = value => value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');

function assessReport(state, G, report) {
  const completionRatio = clip((Array.isArray(state.history) ? state.history.length : 0) / MAX_DECISIONS);
  const handover = campaignStatus(state, G) === 'financial-handover';
  const projects = (report.finance?.portfolio ?? []).filter(project => project.deferred !== true);
  const delivered = projects.filter(project => finite(project.activatedTurn) > 0 && Array.isArray(project.paidTurns) && project.paidTurns.length > 0);
  const deliveredFactors = delivered.reduce((sum, project) => sum + clip(project.implementationFactor), 0);
  const delivery = deliveredFactors / Math.max(5, projects.length);

  const initialPlaces = report.population?.initial?.access ?? {};
  const finalPlaces = report.population?.current?.municipalities ?? {};
  const placeIds = (G.Population?.MUNICIPALITIES?.map(place => place.id) ?? Object.keys(initialPlaces)).slice(0, MAX_TERRITORIES);
  const indicators = ['healthAccess', 'schoolAccess', 'employment'];
  let territoryTotal = 0;
  for (const id of placeIds) for (const indicator of indicators) {
    const initial = finite(initialPlaces[id]?.[indicator]);
    const current = finite(finalPlaces[id]?.[indicator]);
    if (initial === null || current === null) continue;
    const b = clip(initial), x = clip(current);
    territoryTotal += b === 1 ? x : x < b ? 0.5 * x / b : 0.5 + 0.5 * clip((x - b) / Math.max(0.01, 0.25 * (1 - b)));
  }
  const territories = territoryTotal / (MAX_TERRITORIES * indicators.length);

  const limit = finite(report.final?.debtLimit), debt = finite(report.final?.debt), initialDebt = finite(report.finance?.initialDebt);
  const debtHeadroom = limit === null || debt === null || initialDebt === null ? 0 : clip((limit - debt) / Math.max(0.01, limit - initialDebt));
  const reserve = finite(report.final?.reserve);
  const coveredYears = (report.forecast?.rows ?? []).slice(0, 3).filter(row => finite(row.cash) !== null && reserve !== null && row.cash + reserve >= 0).length;
  const finance = handover ? 0 : (debtHeadroom + coveredYears / 3) / 2;

  const promises = report.governance?.promises ?? [];
  const kept = promises.filter(promise => promise.status === 'kept' && !promise.revisions?.length).length;
  const revisedKept = promises.filter(promise => promise.status === 'kept' && promise.revisions?.length).length;
  const broken = promises.filter(promise => promise.status === 'broken').length;
  const pendingDue = promises.filter(promise => promise.status === 'pending' && finite(promise.dueTurn) !== null && promise.dueTurn <= MAX_DECISIONS).length;
  const accountable = kept + revisedKept + broken + pendingDue;
  const fulfilment = (kept + 0.75 * revisedKept) / Math.max(3, accountable);

  const raw = [completionRatio, clip(delivery), clip(territories), clip(finance), clip(fulfilment)];
  const progress = raw.map((score, index) => index === 0 ? score : score * completionRatio);
  const uncapped = progress.reduce((sum, score) => sum + score, 0);
  const capMultiplier = handover && uncapped > 2.5 ? 2.5 / uncapped : 1;
  const scaled = progress.map(score => clip(score * capMultiplier));
  // Largest-remainder allocation keeps displayed hundredths equal to the rounded total.
  const cents = scaled.map(score => Math.floor(score * 100 + 1e-9));
  const totalCents = Math.min(handover ? 250 : 500, Math.round(scaled.reduce((sum, score) => sum + score, 0) * 100));
  const remainderOrder = scaled.map((score, index) => ({ index, remainder: score * 100 - cents[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = totalCents - cents.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remaining; index++) cents[remainderOrder[index].index]++;

  const evidence = [
    { ru: `${Math.min(state.history?.length ?? 0, 20)} из 20 решений.`, en: `${Math.min(state.history?.length ?? 0, 20)} of 20 decisions.` },
    { ru: `Запущено и оплачено программ: ${delivered.length} из ${projects.length}; сумма коэффициентов ${scoreText(deliveredFactors)}; знаменатель ${Math.max(5, projects.length)}.`, en: `Launched and paid programmes: ${delivered.length} of ${projects.length}; factor sum ${scoreText(deliveredFactors)}; denominator ${Math.max(5, projects.length)}.` },
    { ru: 'Сравнение исходной и итоговой доступности по 15 территориальным показателям.', en: 'Initial and final access compared across 15 territorial indicators.' },
    { ru: handover ? 'Досрочная передача финансового управления: этот критерий равен 0.' : `Нормированный запас долга ${scoreText(debtHeadroom)}; прогнозных лет с покрытием ${coveredYears}/3.`, en: handover ? 'Early financial handover: this criterion is 0.' : `Normalized debt headroom ${scoreText(debtHeadroom)}; covered projection years ${coveredYears}/3.` },
    { ru: `Выполнено ${kept}; после переноса ${revisedKept}; нарушено ${broken}; ожидают в пределах срока ${pendingDue}; знаменатель ${Math.max(3, accountable)}.`, en: `Kept ${kept}; kept after revision ${revisedKept}; broken ${broken}; pending within term ${pendingDue}; denominator ${Math.max(3, accountable)}.` }
  ];
  return {
    version: ASSESSMENT_VERSION,
    points: totalCents / 100,
    maxPoints: 5,
    completionRatio,
    uncappedPoints: round2(uncapped),
    capMultiplier,
    handoverCapApplied: capMultiplier < 1,
    criteria: assessmentRules.slice(0, 5).map((rule, index) => ({
      id: rule.id,
      title: { ...rule.title },
      points: cents[index] / 100,
      maxPoints: 1,
      rawPoints: raw[index],
      progressPoints: progress[index],
      detail: {
        ru: `${evidence[index].ru} До поправок: ${scoreText(raw[index])}; c = ${scoreText(completionRatio)}; после учёта прохождения: ${scoreText(progress[index])}. Множитель ограничения за передачу управления: ${scoreText(capMultiplier)}. Округлённый вклад: ${cents[index] / 100} / 1.`,
        en: `${evidence[index].en} Before adjustments: ${scoreText(raw[index])}; c = ${scoreText(completionRatio)}; after progress adjustment: ${scoreText(progress[index])}. Handover cap multiplier: ${scoreText(capMultiplier)}. Rounded contribution: ${cents[index] / 100} / 1.`
      }
    }))
  };
}

/** Deterministic assignment performance, available for previews and terminal saves alike. */
export function assessCampaign(state, G) {
  if (!state || typeof G?.Engine?.buildReport !== 'function') fail('governor/state-required');
  return assessReport(state, G, G.Engine.buildReport(state, 'ru'));
}

/** Numbers retain model units: ratios 0–1, people, and billions of game rubles. */
export function compactReport(state, GovernorGame) {
  if (!state || typeof GovernorGame?.Engine?.buildReport !== 'function') fail('governor/state-required');
  const report = GovernorGame.Engine.buildReport(state, 'ru');
  const decisions = Array.isArray(report.decisions) ? report.decisions.slice(0, MAX_DECISIONS) : [];
  const municipalities = report.population?.current?.municipalities ?? {};
  const names = new Map((GovernorGame.Population?.MUNICIPALITIES ?? []).map(place => [place.id, localName(place.name)]));
  const baseYear = finite(report.population?.baseYear);
  return {
    applicationVersion: '1.0.0',
    modelVersion: text(report.modelVersion, 80),
    campaignStatus: campaignStatus(state, GovernorGame),
    decisions: decisions.length,
    seed: text(report.seed, 256),
    scenario: text(report.scenario?.name ?? report.scenario?.id),
    assessment: assessReport(state, GovernorGame, report),
    final: {
      support: finite(report.final?.support),
      development: finite(report.final?.development),
      fiscalSpace: finite(report.final?.fiscalSpace),
      reserve: finite(report.final?.reserve),
      debt: finite(report.final?.debt),
      population: finite(report.population?.current?.population)
    },
    territories: Object.entries(municipalities).slice(0, MAX_TERRITORIES).map(([id, place]) => ({
      id: text(id, 80),
      name: text(names.get(id) || id, 120),
      population: finite(place.population),
      healthAccess: finite(place.healthAccess),
      schoolAccess: finite(place.schoolAccess),
      employment: finite(place.employment)
    })),
    decisionRegister: decisions.map(record => ({
      year: baseYear !== null && finite(record.turn) !== null ? baseYear + record.turn - 1 : null,
      mission: text(record.mission ?? record.missionId),
      action: text(record.action ?? record.actionId),
      fundingMode: text(record.fundingMode, 80),
      cost: finite(record.funding?.actualTotalCost ?? record.funding?.totalCost),
      delivery: text(record.delivery?.id, 80)
    }))
  };
}

function timestamp(value) {
  if (value === null || value === undefined || value === '') fail('governor/timestamp-required');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail('governor/invalid-timestamp');
  return date;
}

/** Caller persists and reuses `now` and the resulting record for submission retries. */
export function makeSubmission({ state, G, owner, studentKey, run, reflection, now }) {
  if (typeof studentKey !== 'string' || !studentKey || owner !== `student:${studentKey}` || !validOwner(owner)) {
    fail('governor/student-owner-mismatch');
  }
  if (typeof run?.submissionId !== 'string' || !run.submissionId.trim()) fail('governor/run-required');
  if (!state || campaignStatus(state, G) === 'in-progress') fail('governor/campaign-unfinished');
  const started = timestamp(run.startedAt);
  const created = timestamp(now);
  const governor = compactReport(state, G);
  return {
    id: run.submissionId,
    studentKey,
    source: 'native-v1',
    type: 'governor-simulator',
    activitySlug: 'seminar-7',
    schemaVersion: 1,
    recordGrade: true,
    reviewStatus: 'auto-scored',
    points: governor.assessment.points,
    maxPoints: 5,
    governor,
    reflection: String(reflection ?? ''),
    createdAt: created.toISOString(),
    startedAt: started.toISOString(),
    durationMs: Math.max(0, created.getTime() - started.getTime())
  };
}
