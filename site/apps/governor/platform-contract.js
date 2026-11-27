/** Platform identity and reporting contract. The simulation owns no authentication. */
const PREFIX = 'rudn.governor.v1:';
const MAX_DECISIONS = 20;
const MAX_TERRITORIES = 5;
const ASSESSMENT_VERSION = 'governor-assignment-v1';

/** Published assignment targets, not an empirically validated measure of competence. */
const legacyAssessmentRules = [
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

/** Outcomes over the whole term, compared with the same model without new policy.
 * Weights are published assignment rules, not an estimate of general competence.
 * Existing version-1 saves retain their original grading contract. */
export const assessmentRules = [
  {id:'mandate',title:{ru:'Общественный мандат',en:'Public mandate',zh:'公众信任'},detail:{
    ru:'До 0,75 балла: сохранение поддержки и развития относительно начала и их улучшение относительно того же сценария без новых мер. Учитывается весь срок: 65% веса у всех прошедших лет, 35% — у последних пяти. Полное сохранение индекса даёт половину критерия; вторая половина — за преимущество над бездействием на 20% исходного индекса (не менее 5 пунктов).',
    en:'Up to 0.75 points: preserve support and development relative to the start and improve on the same scenario without new measures. All elapsed years carry 65% of the weight; the latest five carry 35%. Full preservation earns half the criterion; the other half requires a gain over inaction of 20% of the initial index, at least 5 points.',
    zh:'最高0.75分：保持初始公众支持和发展水平，并优于相同情景下不采取新措施的结果。全部已过年度权重为65%，最近五年为35%。保持初始水平获得本项一半分数；另一半要求优于无行动基准达到初始指标的20%，且至少5点。'}},
  {id:'delivery',title:{ru:'Качество исполнения',en:'Quality of delivery',zh:'执行质量'},detail:{
    ru:'До 0,75 балла за среднее исполнение решений. Для программы учитываются открытие и оплата работы по договору за первые три года или за весь срок более короткого договора. Учитываются только прошедшие годы. Для восстановления отсчёт начинается с открытия по новому договору. У разовой меры учитывается фактическое исполнение.',
    en:'Up to 0.75 points for average delivery. A programme must open and its operating costs must be paid for the first three years or its full contract if shorter. Only elapsed years count. A restored service is assessed from its reopening under the new contract. A one-off measure uses its actual delivery factor.',
    zh:'执行质量按各项决策的平均执行情况计分，最高0.75分。项目须启用并支付前三年的运营费用，合同不足三年则按合同期限计算。只统计已经过去的年度。恢复的服务从按新合同重新启用时算起。一次性措施按实际执行情况计分。'}},
  {id:'territories',title:{ru:'Многолетний результат услуг',en:'Services over the term',zh:'任期服务成效'},detail:{
    ru:'До 2 баллов: преимущество доступности услуг над тем же сценарием без новых мер. Пять территорий имеют равный вес; медицина/школа/уход за детьми/жильё/занятость/цифровые услуги — веса 25/20/15/15/15/10%. Цель полного балла — сокращение 35% исходного среднего разрыва (не менее 2,5 процентного пункта). 65% веса у всего срока, 35% — у последних пяти лет. Ухудшение территории относительно бездействия снижает результат. Рост населения не требуется; демографическое уменьшение спроса само по себе баллов не даёт.',
    en:'Up to 2 points: service access gained over the same scenario without new measures. Five districts have equal weight; health/school/childcare/housing/employment/digital services have weights 25/20/15/15/15/10%. Full credit requires closing 35% of the initial mean gap, at least 2.5 percentage points. All years carry 65% of the weight; the latest five carry 35%. A district doing worse than inaction reduces the result. Population growth is not required; demographic reductions in demand do not themselves earn points.',
    zh:'最高2分：相对同情景无新政策基准的服务改善。五个地区等权；医疗、学校、托幼、住房、就业和数字服务权重分别为25、20、15、15、15、10%。满分目标为缩小初始平均缺口的35%，且不少于2.5个百分点。全任期权重65%，最近五年35%。地区表现低于无行动基准会扣分。不要求人口增长；单纯因人口需求减少而提高可及性不计分。'}},
  {id:'finance',title:{ru:'Финансовая устойчивость',en:'Financial sustainability',zh:'财政可持续性'},detail:{
    ru:'До 1 балла: среднее из запаса до долгового лимита относительно начала и доли трёх прогнозных лет с покрытием казной и резервом. Результат умножается на 1 / (1 + полученная экстренная помощь / исходные казна и резерв). Законное проектное софинансирование не штрафуется. При досрочной передаче управления — 0.',
    en:'Up to 1 point: average initial-relative debt headroom and the share of three projected years covered by cash and reserves. Multiply by 1 / (1 + emergency aid received / initial cash and reserves). Ordinary project cofinancing is not penalised. Early financial handover earns 0.',
    zh:'最高1分：相对初始债务余量和未来三年现金及储备覆盖比例的平均值。再乘以1/(1+所获紧急援助/初始现金与储备)。正常项目配套资金不扣分。提前移交财政管理得0分。'}},
  {id:'promises',title:{ru:'Проверяемые обязательства',en:'Accountable commitments',zh:'可核验承诺'},detail:{
    ru:'До 0,5 балла: выполненные обещания / максимум из 3 и числа обещаний, срок которых наступил в пределах кампании. Выполненное после согласованного переноса даёт коэффициент 0,75. Учитываются обещания с согласованным сроком до конца 20-го года включительно. Более поздние обещания остаются в протоколе, в том числе при досрочном исполнении.',
    en:'Up to 0.5 points: kept promises / the larger of 3 and promises due within the campaign. Fulfilment after an agreed revision has factor 0.75. The calculation includes commitments due by the end of year 20. Commitments due later remain in the record, including those fulfilled early.',
    zh:'最高0.5分：已兑现承诺数除以3与任期内应履行承诺数中的较大值。经协商延期后兑现的系数为0.75。计分范围为约定期限在第20年年底或之前的承诺。期限在此之后的承诺保留在记录中，包括提前兑现的承诺。'}},
  {id:'overall',title:{ru:'Итоговая оценка',en:'Overall grade',zh:'总评'},detail:{
    ru:'Максимум 5 баллов. Все критерии умножаются на долю подтверждённых лет / 20; прохождение само по себе баллов не даёт. Досрочная передача управления ограничивает сумму 2,5 балла. Эталон без новых мер пересчитывает ту же модель, сценарий и календарные кризисы; это игровое сравнение, не доказательство реального причинного эффекта. Старые сохранения версии повестки 1.0 сохраняют опубликованную для них рубрику.',
    en:'Maximum 5 points. Every criterion is multiplied by confirmed years / 20; completion itself earns no points. Early handover caps the total at 2.5. The no-new-measures baseline runs the same model, scenario and calendar crises; this is an in-model comparison, not evidence of a real causal effect. Agenda version 1.0 saves keep their original published rubric.',
    zh:'总分最高5分。所有指标乘以已确认年度数/20；完成回合本身不计分。提前移交管理时总分上限2.5分。无新措施基准使用相同模型、情景和危机日程；它是模型内比较，不证明现实因果效应。议程1.0旧存档保留原评分规则。'}}
];

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function validOwner(owner) {
  return typeof owner === 'string' && /^(student|teacher):\S+$/.test(owner);
}

/** Capture the owner once; switching accounts requires a new adapter and game. */
export function scopedStorage(storage, owner, {context='course'}={}) {
  const free=context==='free';
  if (!validOwner(owner)&&!(free&&/^guest:\S+$/.test(owner))) fail('governor/owner-required');
  if (!storage || !['getItem', 'setItem', 'removeItem'].every(method => typeof storage[method] === 'function')) {
    fail('governor/storage-required');
  }
  const namespace = `${free?'rudn.governor.free.v1:':PREFIX}${encodeURIComponent(owner)}:`;
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

function assessLegacyReport(state, G, report) {
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
    criteria: legacyAssessmentRules.slice(0, 5).map((rule, index) => ({
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

const assessmentBaselines = new WeakMap();
const CURRENT_ASSESSMENT_VERSION = 'governor-outcomes-v2';
const OUTCOME_WEIGHTS = [0.75, 0.75, 2, 1, 0.5];
const SERVICE_KEYS = ['healthAccess','schoolAccess','childcareAccess','housingAccess','employment','digitalAccess'];
const SERVICE_WEIGHTS = [0.25,0.2,0.15,0.15,0.15,0.1];

function policyBaseline(state, G) {
  const E=G.Engine;
  if(typeof E.createState!=='function'||typeof E.commitAction!=='function')return null;
  let cache=assessmentBaselines.get(E);
  if(!cache){cache=new Map();assessmentBaselines.set(E,cache);}
  const key=JSON.stringify([state.scenarioId,state.challengeId,state.seed,state.agenda?.mode,state.agenda?.version]);
  if(cache.has(key))return cache.get(key);
  // No promises, new projects, strategy bonuses or financial rescues chosen by
  // the player. Automatic mode keeps the counterfactual calendar comparable.
  const baseline=E.createState({scenarioId:state.scenarioId,challengeId:state.challengeId,seed:state.seed,
    campaignMode:state.agenda?.mode||'guided',budgetMode:'automatic',soundEnabled:false});
  if(state.agenda?.version===G.Agenda?.LEGACY_VERSION)baseline.agenda.version=G.Agenda.LEGACY_VERSION;
  const initialStats={...baseline.stats};
  while(!baseline.completed){
    if(G.Agenda?.needsChoice(baseline))E.chooseAgenda(baseline,G.Agenda.OPERATIONS.id);
    const mission=E.getCurrentMission(baseline),action=mission.actions.find(item=>item.deferred);
    E.commitAction(baseline,action.id,'treasury');
    E.advanceTurn(baseline);
  }
  const value={initialStats,history:baseline.history,initial:baseline.population.initial,finance:baseline.finance};
  cache.set(key,value);
  if(cache.size>24)cache.delete(cache.keys().next().value);
  return value;
}

/** End-of-term teaching comparison. Covered demand is capped at total demand,
 * the same limit used by the displayed access ratio. These are modelled units. */
export function northernCareComparison(state, G) {
  if (!state?.completed || state.recovery || !G?.CampaignStrategy?.metrics) return [];
  const baseline = policyBaseline(state, G);
  if (!baseline) return [];
  function measure(derived) {
    const north = derived?.municipalities?.north;
    if (!north || ![north.health, north.healthAccess, north.elderCare].every(Number.isFinite) || north.health <= 0) return null;
    return {
      demand: north.health,
      covered: north.health * north.healthAccess,
      access: north.healthAccess,
      care: G.CampaignStrategy.metrics(state, derived).care
    };
  }
  const rows = [];
  for (const year of [5, 10, 15, 20]) {
    const actual = measure(state.history[year - 1]?.population?.after);
    const reference = measure(baseline.history[year - 1]?.population?.after);
    if (!actual || !reference) return [];
    rows.push({year: state.population.baseYear + year - 1, actual, reference});
  }
  return rows;
}

const mean = values => values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
function annualWeights(count){
  const recent=Math.min(5,count);
  return Array.from({length:count},(_,index)=>0.65/count+(index>=count-recent?0.35/recent:0));
}
function serviceValue(place){
  return SERVICE_KEYS.reduce((sum,key,index)=>sum+clip(finite(place?.[key])??0)*SERVICE_WEIGHTS[index],0);
}
// A restored service keeps the original portfolio item. Score only the years
// belonging to this contract, using the agreed term captured when it was signed.
function paidContractShare(project, opening, duration, elapsed) {
  if (!project || !Number.isInteger(opening) || opening < 1 || opening > elapsed) return 0;
  const years = Math.min(3, Math.max(1, duration), elapsed - opening + 1);
  const paid = new Set((project.paidTurns || []).filter(year => year >= opening && year < opening + years));
  return paid.size / years;
}

function deliveredShare(record, projects, elapsed) {
  if (record.restoration) {
    const {projectId, reopenTurn, extraYears} = record.restoration;
    return paidContractShare(projects.find(item => item.id === projectId), reopenTurn, extraYears, elapsed);
  }
  if (!record.project) return clip(record.delivery?.effectFactor ?? 1);
  const project = projects.find(item => item.id === record.project.id);
  const duration = finite(record.project.yearsRemaining) ?? finite(record.funding?.profile?.duration) ?? 3;
  return clip(project?.implementationFactor) * paidContractShare(project, project?.activatedTurn, duration, elapsed);
}

function assessOutcomeReport(state,G,report){
  const history=(state.history||[]).slice(0,MAX_DECISIONS),count=history.length,completionRatio=clip(count/MAX_DECISIONS);
  const weights=annualWeights(count),baseline=policyBaseline(state,G),handover=campaignStatus(state,G)==='financial-handover';
  const initial=report.population?.initial?.access||{},ids=(G.Population?.MUNICIPALITIES?.map(m=>m.id)||Object.keys(initial)).slice(0,MAX_TERRITORIES);
  const initialStats=baseline?.initialStats||history[0]?.before||report.final||{};
  let preservation=0,mandateGain=0,serviceGain=0;
  const districtGains=Object.fromEntries(ids.map(id=>[id,0]));
  for(let index=0;index<count;index++){
    const actual=history[index],reference=baseline?.history[index];
    const places=actual.population?.after?.municipalities||report.population?.current?.municipalities||{};
    const referencePlaces=reference?.population?.after?.municipalities||initial;
    const actualStats=actual.after||report.final||{},referenceStats=reference?.after||initialStats;
    for(const key of ['support','development']){
      const start=finite(initialStats[key])??0,value=finite(actualStats[key])??0,b=finite(referenceStats[key])??start;
      preservation+=weights[index]*0.5*clip((value-start*0.5)/Math.max(1,start*0.5));
      mandateGain+=weights[index]*0.5*clip((value-b)/Math.max(5,start*0.2));
    }
    for(const id of ids){
      const gain=serviceValue(places[id])-serviceValue(referencePlaces[id]);
      districtGains[id]+=weights[index]*gain;
      serviceGain+=weights[index]*gain/Math.max(1,ids.length);
    }
  }
  const mandate=count?(preservation+mandateGain)/2:0;
  const initialGap=mean(ids.map(id=>1-serviceValue(initial[id])));
  const serviceTarget=Math.max(0.025,initialGap*0.35);
  const worstDistrictGain=Math.min(0,...Object.values(districtGains));
  // Explicit regional equity discount. Equal district weights already prevent
  // improvement in the capital from outweighing all smaller territories.
  const equityFactor=clip(1+worstDistrictGain/0.1);
  const territories=clip(serviceGain/serviceTarget)*(0.75+0.25*equityFactor);

  const projects = report.finance?.portfolio || [];
  const adopted = history.filter(record => !record.deferred || record.restoration);
  const delivery = mean(adopted.map(record => deliveredShare(record, projects, count)));
  const limit=finite(report.final?.debtLimit),debt=finite(report.final?.debt),initialDebt=finite(report.finance?.initialDebt);
  const debtHeadroom=limit===null||debt===null||initialDebt===null?0:clip((limit-debt)/Math.max(0.01,limit-initialDebt));
  const reserve=finite(report.final?.reserve);
  const coveredYears=(report.forecast?.rows||[]).slice(0,3).filter(row=>finite(row.cash)!==null&&reserve!==null&&row.cash+reserve>=0).length;
  const firstLedger=state.finance?.ledgers?.[0]||state.finance?.currentLedger;
  const initialCushion=Math.max(1,(finite(firstLedger?.openingTreasury)||0)+(finite(firstLedger?.openingReserve)||0));
  const emergencyAid=Math.max(0,finite(report.finance?.totalEmergencyTransfers)||0),aidFactor=1/(1+emergencyAid/initialCushion);
  const finance=handover?0:(debtHeadroom+coveredYears/3)/2*aidFactor;
  const duePromises = (report.governance?.promises || []).filter(p => Number.isInteger(p.dueTurn) && p.dueTurn >= 1 && p.dueTurn <= MAX_DECISIONS);
  const kept = duePromises.filter(p => p.status === 'kept' && !p.revisions?.length).length;
  const revisedKept = duePromises.filter(p => p.status === 'kept' && p.revisions?.length).length;
  const accountable = duePromises.length;
  const fulfilment = (kept + 0.75 * revisedKept) / Math.max(3, accountable);
  const raw=[mandate,delivery,territories,finance,fulfilment].map(clip);
  const progress=raw.map((score,index)=>score*OUTCOME_WEIGHTS[index]*completionRatio);
  const uncapped=progress.reduce((sum,value)=>sum+value,0),capMultiplier=handover&&uncapped>2.5?2.5/uncapped:1;
  const scaled=progress.map(value=>value*capMultiplier),cents=scaled.map(value=>Math.floor(value*100+1e-9));
  const totalCents=Math.min(handover?250:500,Math.round(scaled.reduce((sum,value)=>sum+value,0)*100));
  const remainder=scaled.map((value,index)=>({index,remainder:value*100-cents[index]})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  const remaining=totalCents-cents.reduce((sum,value)=>sum+value,0);
  for(let index=0;index<remaining;index++)cents[remainder[index].index]++;
  const evidence=[
    {ru:`Сохранение индексов ${scoreText(preservation)}; преимущество над бездействием ${scoreText(mandateGain)}.`,en:`Index preservation ${scoreText(preservation)}; gain over inaction ${scoreText(mandateGain)}.`,zh:`指标保持系数${scoreText(preservation)}；优于无行动基准${scoreText(mandateGain)}。`},
    {ru:`Принято мер: ${adopted.length}; средний коэффициент исполнения ${scoreText(delivery)}.`,en:`Measures adopted: ${adopted.length}; mean delivery factor ${scoreText(delivery)}.`,zh:`已采取${adopted.length}项措施；平均执行系数${scoreText(delivery)}。`},
    {ru:`Многолетнее преимущество услуг ${(serviceGain*100).toFixed(2)} п.п.; цель ${(serviceTarget*100).toFixed(2)} п.п.; территориальный коэффициент ${scoreText(0.75+0.25*equityFactor)}.`,en:`Weighted service gain ${(serviceGain*100).toFixed(2)} pp; target ${(serviceTarget*100).toFixed(2)} pp; equity factor ${scoreText(0.75+0.25*equityFactor)}.`,zh:`多年服务改善${(serviceGain*100).toFixed(2)}个百分点；目标${(serviceTarget*100).toFixed(2)}个百分点；地区公平系数${scoreText(0.75+0.25*equityFactor)}。`},
    {ru:handover?'Финансовое управление передано досрочно.':`Запас долга ${scoreText(debtHeadroom)}; прогнозных лет с покрытием ${coveredYears}/3; экстренная помощь ${scoreText(emergencyAid)}, коэффициент ${scoreText(aidFactor)}.`,en:handover?'Financial management handed over early.':`Debt headroom ${scoreText(debtHeadroom)}; covered years ${coveredYears}/3; emergency aid ${scoreText(emergencyAid)}, factor ${scoreText(aidFactor)}.`,zh:handover?'财政管理已提前移交。':`债务余量${scoreText(debtHeadroom)}；覆盖年度${coveredYears}/3；紧急援助${scoreText(emergencyAid)}，系数${scoreText(aidFactor)}。`},
    {ru:`Выполнено ${kept}; после переноса ${revisedKept}; учтено обязательств ${accountable}.`,en:`Kept ${kept}; kept after revision ${revisedKept}; accountable commitments ${accountable}.`,zh:`已兑现${kept}项；延期后兑现${revisedKept}项；计入${accountable}项承诺。`}
  ];
  return {version:CURRENT_ASSESSMENT_VERSION,points:totalCents/100,maxPoints:5,completionRatio,uncappedPoints:round2(uncapped),capMultiplier,handoverCapApplied:capMultiplier<1,
    comparison:{kind:baseline?'same-scenario-no-new-policy':'initial-state-only',years:count,serviceGain,serviceTarget,districtGains,equityFactor,emergencyAid,aidFactor},
    criteria:assessmentRules.slice(0,5).map((rule,index)=>({id:rule.id,title:{...rule.title},points:cents[index]/100,maxPoints:OUTCOME_WEIGHTS[index],rawPoints:raw[index],progressPoints:progress[index],detail:{
      ru:`${evidence[index].ru} Коэффициент ${scoreText(raw[index])}; вес ${OUTCOME_WEIGHTS[index]}; подтверждено ${count}/20 лет; множитель ограничения ${scoreText(capMultiplier)}. Вклад ${cents[index]/100}/${OUTCOME_WEIGHTS[index]}.`,
      en:`${evidence[index].en} Factor ${scoreText(raw[index])}; weight ${OUTCOME_WEIGHTS[index]}; confirmed years ${count}/20; cap multiplier ${scoreText(capMultiplier)}. Contribution ${cents[index]/100}/${OUTCOME_WEIGHTS[index]}.`,
      zh:`${evidence[index].zh} 系数${scoreText(raw[index])}；权重${OUTCOME_WEIGHTS[index]}；已确认${count}/20年；上限系数${scoreText(capMultiplier)}。得分${cents[index]/100}/${OUTCOME_WEIGHTS[index]}。`
    }}))};
}
function assessReport(state,G,report){
  return state.agenda?.version==='2.0.0'?assessOutcomeReport(state,G,report):assessLegacyReport(state,G,report);
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
    applicationVersion: '1.1.0',
    modelVersion: text(report.modelVersion, 80),
    campaignStatus: campaignStatus(state, GovernorGame),
    decisions: decisions.length,
    seed: text(report.seed, 256),
    scenario: text(report.scenario?.name ?? report.scenario?.id),
    assessment: assessReport(state, GovernorGame, report),
    campaignStrategy: report.campaignStrategy ? {
      version: report.campaignStrategy.version,
      courseId: text(report.campaignStrategy.id, 80),
      reviews: (report.campaignStrategy.reviews || []).slice(0, 4).map(review => ({
        year: finite(review.year), status: text(review.status, 40), progress: finite(review.progress),
        support: finite(review.support), sustainable: review.sustainable === true,
        capacityDelta: finite(review.capacityDelta),
        goals: (review.goals || []).slice(0, 2).map(goal => ({
          key: text(goal.key, 80), initial: finite(goal.initial), value: finite(goal.value),
          target: finite(goal.target), progress: finite(goal.progress), met: goal.met === true
        }))
      }))
    } : null,
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
export function makeSubmission({ state, G, owner, studentKey, run, reflection, now, context='course' }) {
  const free=context==='free';
  if ((!free&&(typeof studentKey !== 'string'||!studentKey||owner!==`student:${studentKey}`||!validOwner(owner))) ||
      (free&&(!/^(student|teacher|guest):\S+$/.test(owner)||owner.startsWith('student:')&&owner!==`student:${studentKey}`))) {
    fail('governor/student-owner-mismatch');
  }
  if (typeof run?.submissionId !== 'string' || !run.submissionId.trim()) fail('governor/run-required');
  if (!state || campaignStatus(state, G) === 'in-progress') fail('governor/campaign-unfinished');
  const started = timestamp(run.startedAt);
  const created = timestamp(now);
  const governor = compactReport(state, G);
  return {
    id: run.submissionId,
    ...(owner.startsWith('student:')?{studentKey}:{}),
    source: 'native-v1',
    type: 'governor-simulator',
    activitySlug: free?'governor-freeplay':'seminar-7',
    schemaVersion: 1,
    recordGrade: !free,
    reviewStatus: free?'practice':'auto-scored',
    points: governor.assessment.points,
    maxPoints: 5,
    governor,
    reflection: String(reflection ?? ''),
    createdAt: created.toISOString(),
    startedAt: started.toISOString(),
    durationMs: Math.max(0, created.getTime() - started.getTime())
  };
}
