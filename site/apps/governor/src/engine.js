(function (root) {
  'use strict';

  const DATA = root.GovernorGame && root.GovernorGame.DATA?.consolidationReady
    ? root.GovernorGame.DATA
    : (typeof require === 'function' ? require('./consolidation-data.js') : null);
  const Finance = root.GovernorGame && root.GovernorGame.Finance
    ? root.GovernorGame.Finance
    : (typeof require === 'function' ? require('./finance.js') : null);

  if (!DATA) throw new Error('GovernorGame.DATA must be loaded before engine.js');
  if (!Finance) throw new Error('GovernorGame.Finance must be loaded before engine.js');

  const Population = root.GovernorGame?.Population || (typeof require === 'function' ? require('./population.js') : null);
  if (!Population) throw new Error('Population module is required');
  const Governance = root.GovernorGame?.Governance || (typeof require === 'function' ? require('./governance.js') : null);
  if (!Governance) throw new Error('Governance module is required');
  const Stories = root.GovernorGame?.Stories || (typeof require === 'function' ? require('./stories.js') : null);
  if (!Stories) throw new Error('Stories module is required');
  const Outcomes = root.GovernorGame?.Outcomes || (typeof require === 'function' ? require('./world-outcomes.js') : null);
  const Integrity = root.GovernorGame?.Integrity || (typeof require === 'function' ? require('./state-integrity.js') : null);
  const Agenda = root.GovernorGame?.Agenda || (typeof require === 'function' ? require('./agenda.js') : null);
  const Recovery=root.GovernorGame?.Recovery || (typeof require==='function'?require('./recovery.js'):null);
  const BudgetReview=root.GovernorGame?.BudgetReview || (typeof require==='function'?require('./budget-review.js'):null);
  const REVIEW_VERSION=BudgetReview.MODEL_VERSION;
  const VERSION = '0.9.0-agenda';
  const CONTENT_VERSION = 'stage9-2026-09-06';
  const RECOVERY_VERSION='0.15.0-recovery';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function round1(value) {
    return Math.round((Number(value) + Number.EPSILON) * 10) / 10 || 0;
  }

  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100 || 0;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hashString(input) {
    let h = 2166136261 >>> 0;
    const str = String(input || 'RUDN-2026');
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function localise(value, language) {
    if (value && typeof value === 'object' && (value.ru || value.en)) {
      return value[language] || value.ru || value.en;
    }
    return value == null ? '' : String(value);
  }

  function findScenario(id) {
    return DATA.scenarios.find(item => item.id === id) || DATA.scenarios[0];
  }

  function findChallenge(id) {
    const challenges = Array.isArray(DATA.challenges) ? DATA.challenges : [];
    return challenges.find(item => item.id === id) || challenges[0] || {
      id: 'standard', rewardMultiplier: 1, rules: {}
    };
  }

  function mergeRules(scenario, challenge) {
    const scenarioRules = (scenario && scenario.rules) || {};
    const challengeRules = (challenge && challenge.rules) || {};
    const merged = Object.assign({}, scenarioRules, challengeRules);

    // Relative cost rules compound, while risk and reserve shocks accumulate.
    // This prevents a challenge preset from accidentally making a difficult
    // scenario cheaper or safer by replacing its baseline coefficients.
    merged.costMultiplier =
      Number(scenarioRules.costMultiplier || 1) * Number(challengeRules.costMultiplier || 1);
    merged.capitalCostMultiplier =
      Number(scenarioRules.capitalCostMultiplier || 1) * Number(challengeRules.capitalCostMultiplier || 1);
    merged.deliveryRisk =
      Number(scenarioRules.deliveryRisk || 0) + Number(challengeRules.deliveryRisk || 0);
    merged.crisisRisk =
      Number(scenarioRules.crisisRisk || 0) + Number(challengeRules.crisisRisk || 0);
    merged.reserveDelta =
      Number(scenarioRules.reserveDelta || 0) + Number(challengeRules.reserveDelta || 0);

    const districtIds = new Set([
      ...Object.keys(scenarioRules.districtEffects || {}),
      ...Object.keys(challengeRules.districtEffects || {})
    ]);
    merged.districtEffects = {};
    districtIds.forEach(id => {
      merged.districtEffects[id] =
        Number((scenarioRules.districtEffects || {})[id] || 1)
        * Number((challengeRules.districtEffects || {})[id] || 1);
    });

    return merged;
  }

  function chooseScenario(seed, requestedId) {
    if (requestedId && requestedId !== 'random') return findScenario(requestedId);
    const random = mulberry32(hashString(seed));
    return DATA.scenarios[Math.floor(random() * DATA.scenarios.length)] || DATA.scenarios[0];
  }

  function getCurrentMission(state) {
    return Agenda.mission(state);
  }

  function getScenario(state) {
    return findScenario(state.scenarioId);
  }

  function getChallenge(state) {
    return findChallenge(state && state.challengeId);
  }

  function getLevel(state) {
    return 1 + Math.floor((state.xp || 0) / 400);
  }

  function getLevelProgress(state) {
    return ((state.xp || 0) % 400) / 400;
  }

  function getChapter(state) {
    const mission = getCurrentMission(state);
    return mission ? mission.chapter : 4;
  }

  function getTurnIncome(state) {
    if (!state || !state.finance) return 0;
    return round1(state.finance.lastOperatingBalance || 0);
  }

  function getFinanceSummary(state) {
    return Finance.getSummary(state);
  }

  function applyOutcomeEffects(stats, effects) {
    const result = { ...stats };
    for (const key of ['support', 'development']) {
      const delta = Number(effects[key] || 0);
      // Positive index gains saturate smoothly; losses remain observable.
      // These are game indices, not estimated probabilities or measured GDP.
      if (delta) result[key] = round1(clamp(delta > 0
        ? 100 - (100 - result[key]) * Math.exp(-delta / 65)
        : result[key] + delta, 0, 100));
    }
    return result;
  }

  function mergeEffects(target, source) {
    const result = {
      budget: Number(target && target.budget) || 0,
      reserve: Number(target && target.reserve) || 0,
      debt: Number(target && target.debt) || 0,
      federal: Number(target && target.federal) || 0,
      support: Number(target && target.support) || 0,
      development: Number(target && target.development) || 0
    };
    if (!source) return result;
    Object.keys(result).forEach(key => {
      result[key] = round2(result[key] + (Number(source[key]) || 0));
    });
    return result;
  }

  function bonusMatches(state, bonus) {
    if (bonus.flag) {
      const current = state.flags[bonus.flag];
      if (Array.isArray(bonus.values) && !bonus.values.includes(current)) return false;
      if (bonus.value !== undefined && bonus.value !== current) return false;
    }
    if (bonus.resilience) {
      const value = Number(state.resilience[bonus.resilience.key] || 0);
      if (bonus.resilience.min !== undefined && value < bonus.resilience.min) return false;
      if (bonus.resilience.max !== undefined && value > bonus.resilience.max) return false;
    }
    return true;
  }


  function conditionMatches(state, condition) {
    if (!condition) return true;
    if (condition.flag) {
      const current = state.flags && state.flags[condition.flag];
      if (Array.isArray(condition.values) && !condition.values.includes(current)) return false;
      if (condition.value !== undefined && condition.value !== current) return false;
    }
    if (condition.scenario && state.scenarioId !== condition.scenario) return false;
    if (condition.challenge && state.challengeId !== condition.challenge) return false;
    if (condition.finance) {
      const summary = Finance.getSummary(state);
      const financeCondition = condition.finance;
      if (financeCondition.debtRatioMin !== undefined && summary.debtRatio < financeCondition.debtRatioMin) return false;
      if (financeCondition.debtRatioMax !== undefined && summary.debtRatio > financeCondition.debtRatioMax) return false;
      if (financeCondition.overloadMin !== undefined && (state.finance.overloadCount || 0) < financeCondition.overloadMin) return false;
      if (financeCondition.adminLoadMin !== undefined && summary.adminLoad < financeCondition.adminLoadMin) return false;
    }
    return true;
  }

  function resolveInteractions(state, action) {
    return (action.interactions || [])
      .filter(interaction => conditionMatches(state, interaction.when))
      .map(interaction => deepClone(interaction));
  }

  function mergeNumericMap(target, source, factor) {
    const result = { ...(target || {}) };
    Object.entries(source || {}).forEach(([key, value]) => {
      result[key] = round2((Number(result[key]) || 0) + (Number(value) || 0) * (factor == null ? 1 : factor));
    });
    return result;
  }

  function scalePositiveMap(source, factor) {
    return Object.fromEntries(Object.entries(source || {}).map(([key, value]) => {
      const number = Number(value) || 0;
      return [key, round2(number > 0 ? number * factor : number)];
    }));
  }

  function getPlacements(mission) {
    return Array.isArray(mission && mission.placements) ? mission.placements : [];
  }

  function resolvePlacement(mission, requestedId) {
    const placements = getPlacements(mission);
    if (!placements.length) return null;
    return placements.find(item => item.id === requestedId)
      || placements.find(item => item.recommended)
      || placements[0];
  }

  function effectiveActionFor(state, mission, action, placement) {
    const scenario = getScenario(state);
    const rules = state.rules || mergeRules(scenario, findChallenge(state.challengeId));
    const effective = deepClone(action);
    const baseProfile = Object.assign({}, Finance.profileFor(action));
    const districtFactor = Number((rules.districtEffects && rules.districtEffects[mission.districtId]) || 1);
    const placementCost = Number((placement && placement.costMultiplier) || 1);
    const kindMultiplier = baseProfile.kind === 'capital' ? Number(rules.capitalCostMultiplier || 1) : 1;
    const costMultiplier = Number(rules.costMultiplier || 1) * placementCost * kindMultiplier;
    effective.cost = round2(Math.abs(Number(action.cost) || 0) * costMultiplier);
    effective.baseCost = round2(Math.abs(Number(action.cost) || 0));
    effective.effects = Object.fromEntries(Object.entries(action.effects || {}).map(([key, value]) => [key, round2((Number(value) || 0) * districtFactor)]));
    effective.resilience = Object.fromEntries(Object.entries(action.resilience || {}).map(([key, value]) => [key, round2((Number(value) || 0) * districtFactor)]));
    if (placement) {
      effective.effects = mergeNumericMap(effective.effects, placement.effects);
      effective.resilience = mergeNumericMap(effective.resilience, placement.resilience);
    }
    const interactions = resolveInteractions(state, action);
    interactions.forEach(interaction => {
      effective.effects = mergeNumericMap(effective.effects, interaction.effects);
      effective.resilience = mergeNumericMap(effective.resilience, interaction.resilience);
    });
    effective.finance = Object.assign({}, baseProfile, {
      lag: Math.max(0, Number(baseProfile.lag || 0) + Number((placement && placement.delayDelta) || 0)),
      adminLoad: Math.max(0, Number(baseProfile.adminLoad || 0) + Number((placement && placement.adminDelta) || 0))
    });
    effective.mapObject = deepClone(action.mapObject || {});
    if (placement && placement.position) effective.mapObject.position = deepClone(placement.position);
    effective.originalId = action.id;
    effective.interactions = interactions;
    return effective;
  }

  function deliveryRiskFor(state, action, plan) {
    const capacity = Math.max(1, Number(state.finance.adminCapacity) || 1);
    const overload = Math.max(0, (Number(plan.totalAdminLoad) || 0) - capacity) / capacity;
    const fundingRisk = plan.id === 'cofinance' ? 0.025 : plan.id === 'debt' ? 0.015 : plan.id === 'reserve' ? -0.02 : 0;
    return round2(clamp(
      Number(action.deliveryRisk || action.finance && action.finance.deliveryRisk || 0.08)
      + Number(state.rules && state.rules.deliveryRisk || 0)
      + overload * 0.24
      + fundingRisk,
      0.02,
      0.62
    ));
  }

  function deliveryRiskLabel(risk) {
    if (risk < 0.14) return 'low';
    if (risk < 0.27) return 'medium';
    return 'high';
  }

  function resolveDeliveryOutcome(state, preview) {
    if(preview.action.deferred)return {id:'on-time',risk:0,roll:0,effectFactor:1,delayDelta:0,costVariation:0};
    const key = `${state.seed}:${state.challengeId}:${state.turnIndex + 1}:${preview.action.id}:${preview.plan.id}:${preview.placement ? preview.placement.id : 'default'}:delivery`;
    const random = mulberry32(hashString(key));
    const roll = random();
    const risk = preview.deliveryRisk;
    if (roll >= risk) {
      return { id: 'on-time', risk, roll: round2(roll), effectFactor: 1, delayDelta: 0, costVariation: 0 };
    }
    const failureRoll = random();
    if (failureRoll < 0.44) {
      return { id: 'delayed', risk, roll: round2(roll), effectFactor: 0.92, delayDelta: 1, costVariation: 0 };
    }
    if (failureRoll < 0.78) {
      const overrunRate = round2(0.1 + random() * 0.16);
      return {
        id: 'overrun', risk, roll: round2(roll), effectFactor: 1,
        delayDelta: random() < 0.35 ? 1 : 0,
        overrunRate,
        costVariation: round2(preview.plan.totalCost * overrunRate)
      };
    }
    const effectFactor = round2(0.64 + random() * 0.17);
    return { id: 'partial', risk, roll: round2(roll), effectFactor, delayDelta: random() < 0.45 ? 1 : 0, costVariation: 0 };
  }

  function advisorScore(state, mission, action, plan, advisor) {
    let score = Number(action.advisorAffinity && action.advisorAffinity[advisor.id] || 0);
    const support = Number(action.effects && action.effects.support || 0);
    const development = Number(action.effects && action.effects.development || 0);
    const cost = Math.abs(Number(action.cost) || 0);
    if (advisor.id === 'mira') score += support >= 5 ? 1 : support < 0 ? -1.5 : 0;
    if (advisor.id === 'ilya') score += development >= 6 ? 1 : development <= 2 ? -0.5 : 0;
    if (advisor.id === 'elena') {
      if ((action.tags || []).some(tag => ['open', 'community', 'coordination', 'support'].includes(tag))) score += 1;
      if (Number(action.deliveryRisk || 0) >= 0.18) score -= 0.5;
    }
    if (advisor.id === 'viktor') {
      if (plan.id === 'cofinance') score += 1;
      if (plan.id === 'debt') score -= 1;
      if (plan.id === 'reserve' && !mission.crisis) score -= 1;
      if (cost <= 2) score += 0.5;
      if (cost >= 4) score -= 0.5;
    }
    if ((mission.debate || []).includes(advisor.id)) score *= 1.15;
    return round2(score);
  }

  function previewAdvisorReactions(state, mission, action, plan) {
    return DATA.advisors.map(advisor => {
      const score = advisorScore(state, mission, action, plan, advisor);
      return {
        advisorId: advisor.id,
        score,
        stance: score >= 0.8 ? 'support' : score <= -0.8 ? 'oppose' : 'cautious',
        message: mission.advisors && mission.advisors[advisor.id] ? deepClone(mission.advisors[advisor.id]) : deepClone(advisor.principle)
      };
    });
  }

  function commitAdvisorReactions(state, reactions, delivery) {
    const result = [];
    for (const reaction of reactions || []) {
      let delta = clamp(Math.round(reaction.score), -2, 2);
      if (delivery.id === 'on-time') delta += reaction.stance === 'support' ? 1 : 0;
      if (delivery.id === 'partial') delta -= 1;
      if (delivery.id === 'overrun' && reaction.advisorId === 'viktor') delta -= 2;
      if (delivery.id === 'delayed' && reaction.advisorId === 'elena') delta -= 1;
      delta = clamp(delta, -3, 3);
      state.advisorTrust[reaction.advisorId] = round1(clamp((state.advisorTrust[reaction.advisorId] || 50) + delta, 20, 90));
      result.push({ ...deepClone(reaction), trustDelta: delta, trustAfter: state.advisorTrust[reaction.advisorId] });
    }
    return result;
  }

  function classifyEntry(gap) {
    if (gap <= 1) return 'prepared';
    if (gap <= 3) return 'partial';
    return 'unprepared';
  }

  function timingShares(profile, plan) {
    const lag = Math.max(0, (Number(profile.lag) || 0) + (Number(plan.delay) || 0));
    if (lag >= 3) return { support: 0.35, development: 0.65, resilience: 0.82, lag };
    if (lag >= 2) return { support: 0.25, development: 0.55, resilience: 0.75, lag };
    if (lag >= 1) return { support: 0.15, development: 0.35, resilience: 0.55, lag };
    return { support: 0, development: 0, resilience: 0, lag: 0 };
  }

  function splitPositive(value, deferredShare, factor) {
    const number = Number(value) || 0;
    const scaled = round2(number * factor);
    if (number <= 0 || deferredShare <= 0) return { immediate: scaled, deferred: 0 };
    const deferred = round2(scaled * deferredShare);
    return { immediate: round2(scaled - deferred), deferred };
  }

  function splitResilience(action, shares, factor) {
    const immediate = {};
    const activation = {};
    Object.entries(action.resilience || {}).forEach(([key, value]) => {
      const total = round2((Number(value) || 0) * factor);
      const deferred = round2(total * shares.resilience);
      immediate[key] = round2(total - deferred);
      activation[key] = deferred;
    });
    return { immediate, activation };
  }

  function buildProjectDraft(state, mission, action, plan, activationEffects, activationResilience, placement) {
    const profile = plan.profile;
    const shouldCreate = profile.duration > 0 || profile.annualOpex > 0 || plan.delay + profile.lag > 0;
    if (!shouldCreate) return null;
    const effectiveLag = Math.max(0, Number(profile.lag || 0) + Number(plan.delay || 0));
    return {
      id: `${mission.id}:${action.id}:${state.turnIndex + 1}`,
      missionId: mission.id,
      actionId: action.id,
      deferred: Boolean(action.deferred),
      districtId: mission.districtId,
      title: deepClone(action.title),
      kind: profile.kind,
      tags: deepClone(action.tags || []),
      placement: placement ? deepClone(placement) : null,
      mapObject: deepClone(action.mapObject || null),
      fundingMode: plan.id,
      totalCost: plan.totalCost,
      actualTotalCost: plan.totalCost,
      treasuryCost: plan.treasuryCost,
      federalTransfer: plan.federalTransfer,
      reserveUse: plan.reserveUse,
      debtIssue: plan.debtIssue,
      annualOpex: round2(profile.annualOpex || 0),
      startsIn: effectiveLag,
      plannedStartsIn: effectiveLag,
      yearsRemaining: Math.max(1, Number(profile.duration) || 1),
      status: effectiveLag > 0 ? 'delivery' : 'active',
      adminLoad: round1(profile.adminLoad || 0),
      adminMaintenance: round1(profile.adminMaintenance || 0),
      activationEffects: deepClone(activationEffects),
      activationResilience: deepClone(activationResilience),
      annualEffects: Object.fromEntries(Object.entries(profile.annualEffects || {}).map(([key, value]) => [key, round2((Number(value) || 0) * plan.implementationFactor)])),
      implementationFactor: plan.implementationFactor,
      deliveryOutcome: null,
      createdTurn: state.turnIndex + 1,
      activatedTurn: effectiveLag === 0 ? state.turnIndex + 1 : null,
      completedTurn: null
    };
  }

  function ensureFeasibleChoice(state, mission) {
    // Never mint a mission-access grant. A no-new-project choice remains legal.
    if(!mission?.actions.some(a=>a.deferred))throw Error('Missing no-new-project choice');
  }

  function enterCurrentMission(state) {
    const mission = getCurrentMission(state);
    state.currentEntry = null;
    if (!mission || !mission.crisis || state.entryApplied[mission.id]) {
      ensureFeasibleChoice(state, mission);
      return state;
    }

    const scenario = getScenario(state);
    const key = mission.crisis.key;
    Outcomes.refreshReadiness(state);
    const readiness = Outcomes.readiness(state, key, mission.districtId);
    const basePreparedness = readiness.value;
    let deliveryAdjustment = 0;
    let deliveryNote = null;
    if (mission.deliveryFlag) {
      const deliveryValue = state.flags[mission.deliveryFlag];
      if (deliveryValue && mission.notes && mission.notes[deliveryValue]) deliveryNote = mission.notes[deliveryValue];
      if (deliveryValue === 'vendor') deliveryAdjustment = -1;
      else if (deliveryValue === 'guarantee' || deliveryValue === 'corridor') deliveryAdjustment = 0.5;
      else if (deliveryValue) deliveryAdjustment = 1;
    }
    deliveryAdjustment = 0; // Earlier flags are not a second source of operational protection.
    const preparedness = basePreparedness;
    const scenarioRisk = Number((scenario.risk && scenario.risk[key]) || 0);
    const challengeRisk = Number(state.rules && state.rules.crisisRisk || 0);
    const riskModifier = round1(scenarioRisk + challengeRisk);
    const gap = round1(Math.max(0, mission.crisis.threshold - preparedness + riskModifier));
    const crisisCost = round2(Math.abs((mission.crisis.perGap.budget || 0) * gap));
    const shock = Finance.applyShock(state, crisisCost, { missionId: mission.id });
    const effects = {
      budget: round2(shock.treasuryImpact || 0),
      reserve: round2(-(shock.reserveUsed || 0)),
      debt: round2(shock.debtIssued || 0),
      support: round1((mission.crisis.perGap.support || 0) * gap),
      development: round1((mission.crisis.perGap.development || 0) * gap)
    };
    state.stats = applyOutcomeEffects(state.stats, effects);
    Finance.syncBudget(state);
    const classification = classifyEntry(gap);
    const text = classification === 'prepared'
      ? mission.crisis.preparedText
      : classification === 'partial'
        ? mission.crisis.partialText
        : mission.crisis.unpreparedText;

    state.currentEntry = {
      missionId: mission.id,
      key,
      preparedness,
      basePreparedness,
      readiness,
      deliveryAdjustment,
      riskModifier,
      gap,
      effects,
      finance: deepClone(shock),
      classification,
      text,
      bonusNotes: deliveryNote ? [deepClone(deliveryNote)] : []
    };
    state.population.shock = { missionId: mission.id, districtId: mission.districtId, key, gap };
    state.entryApplied[mission.id] = true;
    state.storyLog.push({
      type: 'crisis-entry', turn: state.turnIndex + 1, missionId: mission.id,
      classification, gap, note: deliveryNote ? deepClone(deliveryNote) : null
    });
    ensureFeasibleChoice(state, mission);
    return state;
  }

  function createState(options) {
    const opts = options || {};
    if(opts.budgetMode!==undefined&&!['automatic','decisions'].includes(opts.budgetMode))throw new Error('Unknown budget mode');
    if(opts.budgetMode==='decisions'&&opts.recoveryCase)throw new Error('Choose the inherited case OR real shortfall decisions, not both');
    if(opts.recoveryCase!==undefined&&opts.recoveryCase!==null&&opts.recoveryCase!==Recovery.CASE)throw new Error('Unknown recovery case');
    if(opts.recoveryCase&&(opts.scenarioId!=='balanced'||(opts.challengeId||'standard')!=='standard'||opts.campaignMode!=='agenda'))throw new Error('Recovery case uses the balanced scenario, standard rules and open agenda');
    const seed = String(opts.seed || 'RUDN-2026').trim() || 'RUDN-2026';
    const scenario = chooseScenario(seed, opts.scenarioId || 'random');
    const challenge = findChallenge(opts.challengeId || 'standard');
    const rules = mergeRules(scenario, challenge);
    const agenda = Agenda.create(opts.campaignMode || 'guided');
    const state = {
      agenda,
      version: VERSION,
      contentVersion: CONTENT_VERSION,
      language: opts.language === 'en' ? 'en' : 'ru',
      profile: {
        name: String(opts.name || '').trim(),
        group: String(opts.group || '').trim()
      },
      seed,
      sessionId: hashString(`${seed}:${scenario.id}:${challenge.id}:${agenda.mode}:${CONTENT_VERSION}`).toString(36).toUpperCase(),
      scenarioId: scenario.id,
      challengeId: challenge.id,
      rewardMultiplier: Number(challenge.rewardMultiplier || 1),
      rules,
      turnIndex: 0,
      stats: {
        budget: 0,
        support: Number(scenario.stats.support),
        development: Number(scenario.stats.development)
      },
      finance: Finance.createFinanceState(scenario),
      governance: Governance.create(),
      population: Population.create(scenario.id),
      resilience: { health: 0, jobs: 0, flood: 0, digital: 0, family: 0 },
      flags: {},
      advisorTrust: Object.fromEntries(DATA.advisors.map(advisor => [advisor.id, 50])),
      advisorMemories: Object.fromEntries(DATA.advisors.map(advisor => [advisor.id, []])),
      interactionCounts: { synergy: 0, conflict: 0 },
      deliveryStats: { onTime: 0, delayed: 0, overrun: 0, partial: 0, overrunBailouts: 0, totalOverrun: 0 },
      storyLog: [],
      xp: 0,
      stars: 0,
      badges: [],
      history: [],
      entryApplied: {},
      currentEntry: null,
      awaitingContinue: false,
      completed: false,
      startedAt: null,
      completedAt: null,
      lastIncome: 0,
      totalIncome: 0,
      emergencyTransfers: 0,
      selectedActionId: null,
      selectedFundingMode: null,
      selectedPlacementId: null,
      activeView: agenda.mode === 'agenda' ? 'agenda' : 'mission',
      soundEnabled: opts.soundEnabled !== false
    };
    if (Number(rules.reserveDelta || 0) !== 0) {
      state.finance.reserve = round2(Math.max(0, state.finance.reserve + Number(rules.reserveDelta)));
    }
    state.serviceAnchor = Outcomes.snapshot(state);
    Outcomes.refreshReadiness(state);
    const opened = Finance.openTurn(state);
    state.lastIncome = round1(opened.forecast.netOperating);
    state.totalIncome = round1(opened.forecast.netOperating);
    enterCurrentMission(state);
    evaluateBadges(state);
    Stories.sync(state);
    if(opts.recoveryCase){state.recovery=Recovery.fresh();state.version=RECOVERY_VERSION;state.sessionId+='-R1';}
    if(opts.budgetMode==='decisions'){state.budgetReview=BudgetReview.fresh();state.version=REVIEW_VERSION;state.sessionId+='-B1';}
    return state;
  }

  function previewAction(state, actionId, fundingMode, placementId, termIds) {
    if (Agenda.needsChoice(state)) return null;
    const mission = getCurrentMission(state);
    if (!mission) return null;
    const action = mission.actions.find(item => item.id === actionId);
    if (!action) return null;
    const placement = action.deferred ? null : resolvePlacement(mission, placementId);
    const baseEffective = action.deferred ? deepClone(action) : effectiveActionFor(state, mission, action, placement);
    const basePlan = Finance.getFundingPlan(state, mission, baseEffective, fundingMode);
    const resolvedMode = fundingMode || basePlan?.id || 'treasury';
    const agreementDraft = Governance.preview(state, mission, baseEffective, resolvedMode, placement, termIds);
    const effectiveAction = Governance.modifyAction(baseEffective, agreementDraft);
    const interactions = effectiveAction.interactions || [];

    const fundingOptions = Finance.getFundingOptions(state, mission, effectiveAction);
    const plan = Finance.getFundingPlan(state, mission, effectiveAction, resolvedMode);
    const availablePlans = fundingOptions.filter(option => option.available);
    const minimumTreasuryCost = availablePlans.length
      ? Math.min(...availablePlans.map(option => option.treasuryCost + (option.firstYearOpex || 0)))
      : Math.abs(Number(effectiveAction.cost) || 0);
    const rewardMultiplier = Number(state.rewardMultiplier || 1);
    const rewardXp = Math.round(100 * rewardMultiplier); // Equal learning progress for every legal policy choice.
    const rewardStars = 0; // Awarded on actual opening/operation, never for a preferred card.

    if (!plan) {
      return {
        mission, action, effectiveAction, placement, placements: action.deferred ? [] : getPlacements(mission), interactions,
        fundingOptions, plan: null, agreement: agreementDraft, affordable: false, minimumTreasuryCost,
        effects: { budget: 0, support: 0, development: 0 },
        before: { ...state.stats }, after: { ...state.stats },
        resilienceBefore: { ...state.resilience }, resilienceAfter: { ...state.resilience },
        immediateResilience: {}, activationResilience: {}, activationEffects: {},
        bonusTexts: [], project: null, xp: rewardXp, stars: rewardStars,
        deliveryRisk: 1, deliveryRiskLabel: 'high', advisorReactions: []
      };
    }

    const profile = plan.profile;
    const shares = timingShares(profile, plan);
    const totalFactor = round2(plan.effectFactor * plan.implementationFactor);
    const supportSplit = splitPositive(effectiveAction.effects && effectiveAction.effects.support, shares.support, totalFactor);
    const developmentSplit = splitPositive(effectiveAction.effects && effectiveAction.effects.development, shares.development, totalFactor);
    const resilienceSplit = splitResilience(effectiveAction, shares, totalFactor);

    let effects = {
      budget: round2(-plan.treasuryCost - (plan.firstYearOpex || 0)),
      reserve: round2(-plan.reserveUse),
      debt: round2(plan.debtIssue),
      federal: round2(plan.federalTransfer),
      support: round2(supportSplit.immediate + plan.supportAdjustment),
      development: round2(developmentSplit.immediate)
    };
    const activationEffects = {
      support: round2(supportSplit.deferred),
      development: round2(developmentSplit.deferred)
    };
    if (plan.implementationFactor < 0.9) effects.support = round2(effects.support - 1);

    const bonusTexts = interactions.map(item => item.text).filter(Boolean);
    (action.bonuses || []).forEach(bonus => {
      if (!bonusMatches(state, bonus)) return;
      effects = mergeEffects(effects, bonus.effects || {});
      if (bonus.text) bonusTexts.push(bonus.text);
    });

    effects.support = round2(effects.support * 0.15);
    effects.development = round2(effects.development * 0.30);
    activationEffects.support = round2(activationEffects.support * 0.15);
    activationEffects.development = round2(activationEffects.development * 0.30);
    const modelEffects = deepClone(effects);
    const after = applyOutcomeEffects(state.stats, modelEffects);
    effects.support = round1(after.support-state.stats.support);
    effects.development = round1(after.development-state.stats.development);
    after.budget = round1(Math.max(0, state.finance.treasury - plan.treasuryCost - (plan.firstYearOpex || 0)));
    // There is no separate reward-point readiness preview. Readiness is derived
    // from operational services; future capacity is shown by Population.preview.
    const resilienceAfter = { ...state.resilience };
    const project = buildProjectDraft(state, mission, effectiveAction, plan, activationEffects, resilienceSplit.activation, placement);
    const risk = action.deferred ? 0 : deliveryRiskFor(state, effectiveAction, plan);

    const rangeFactorLow = 0.64; // Worst supported realisation, not a fabricated confidence interval.
    const rangeFactorHigh = 1;

    return {
      mission, action, effectiveAction, placement, placements: action.deferred ? [] : getPlacements(mission), interactions,
      fundingOptions, plan, agreement: Governance.describePromises(state, agreementDraft, plan, project),
      recommendedFundingMode: fundingOptions.find(option => option.recommended && option.available)?.id || plan.id,
      recommendedPlacementId: action.deferred ? null : (getPlacements(mission).find(item => item.recommended)?.id || (placement && placement.id) || null),
      minimumTreasuryCost: round2(minimumTreasuryCost),
      effects, modelEffects,
      expectedRange: {
        support: [round1(applyOutcomeEffects(state.stats, scalePositiveMap(modelEffects, rangeFactorLow)).support-state.stats.support), round1(applyOutcomeEffects(state.stats, scalePositiveMap(modelEffects, rangeFactorHigh)).support-state.stats.support)].sort((a,b)=>a-b),
        development: [round1(applyOutcomeEffects(state.stats, scalePositiveMap(modelEffects, rangeFactorLow)).development-state.stats.development), round1(applyOutcomeEffects(state.stats, scalePositiveMap(modelEffects, rangeFactorHigh)).development-state.stats.development)].sort((a,b)=>a-b)
      },
      rangeMeaning: 'possible-direct-effect-not-confidence-interval',
      costRange: [plan.totalCost, action.deferred ? 0 : round2(plan.totalCost * 1.26)],
      launchRange: [project?.startsIn || 0, action.deferred ? 0 : (project?.startsIn || 0) + 1],
      before: { ...state.stats },
      beforeFinance: {
        treasury: state.finance.treasury,
        reserve: state.finance.reserve,
        debt: state.finance.debt,
        adminLoad: Finance.getAdminLoad(state)
      },
      after,
      afterFinance: {
        treasury: round2(state.finance.treasury - plan.treasuryCost - (plan.firstYearOpex || 0)),
        reserve: round2(state.finance.reserve - plan.reserveUse),
        debt: round2(state.finance.debt + plan.debtIssue),
        adminLoad: plan.totalAdminLoad
      },
      resilienceBefore: { ...state.resilience },
      resilienceAfter,
      immediateResilience: deepClone(resilienceSplit.immediate),
      activationEffects,
      activationResilience: resilienceSplit.activation,
      bonusTexts,
      project,
      affordable: Boolean(plan.available),
      xp: rewardXp,
      stars: rewardStars,
      deliveryRisk: risk,
      deliveryRiskLabel: deliveryRiskLabel(risk),
      advisorReactions: previewAdvisorReactions(state, mission, effectiveAction, plan),
      people: Population.preview(state, mission, effectiveAction, plan, placement)
    };
  }

  function evaluateBadges(state) {
    const newlyUnlocked = [];
    DATA.badges.forEach(badge => {
      if (state.badges.includes(badge.id)) return;
      let unlocked = false;
      try {
        unlocked = Boolean(badge.test(state));
      } catch (_) {
        unlocked = false;
      }
      if (unlocked) {
        state.badges.push(badge.id);
        newlyUnlocked.push(badge.id);
      }
    });
    return newlyUnlocked;
  }

  function commitActionCore(state, actionId, fundingMode, placementId, termIds) {
    if (!state || state.completed) throw new Error('Campaign is already complete');
    if (state.awaitingContinue) throw new Error('Resolve the current turn before committing another action');
    const preview = previewAction(state, actionId, fundingMode, placementId, termIds);
    if (!preview) throw new Error('Unknown action');
    if (!preview.affordable || !preview.plan || !preview.plan.available) throw new Error('Funding plan is unavailable');

    const mission = preview.mission;
    const action = preview.action;
    const before = { ...state.stats };
    const beforeFinance = deepClone(preview.beforeFinance);
    const delivery = resolveDeliveryOutcome(state, preview);
    const actualEffects = scalePositiveMap(preview.modelEffects || preview.effects, delivery.effectFactor);
    const immediateResilience = scalePositiveMap(preview.immediateResilience, delivery.effectFactor);
    const activationEffects = scalePositiveMap(preview.activationEffects, delivery.effectFactor);
    const activationResilience = scalePositiveMap(preview.activationResilience, delivery.effectFactor);
    const actualProject = preview.project ? deepClone(preview.project) : null;
    if (actualProject) {
      actualProject.startsIn = Math.max(0, actualProject.startsIn + delivery.delayDelta);
      actualProject.plannedStartsIn = preview.project.startsIn;
      actualProject.status = actualProject.startsIn > 0 ? 'delivery' : 'active';
      actualProject.activatedTurn = actualProject.status === 'active' ? state.turnIndex + 1 : null;
      actualProject.activationEffects = activationEffects;
      actualProject.activationResilience = activationResilience;
      actualProject.annualEffects = scalePositiveMap(actualProject.annualEffects, delivery.effectFactor);
      actualProject.implementationFactor = round2(actualProject.implementationFactor * delivery.effectFactor);
      actualProject.deliveryOutcome = delivery.id;
      actualProject.costVariation = delivery.costVariation || 0;
      actualProject.actualTotalCost = round2(actualProject.totalCost + (delivery.costVariation || 0));
    }

    Finance.applyFundingPlan(state, preview.plan, actualProject);
    let variation = null;
    if (delivery.costVariation > 0) {
      variation = Finance.applyCostVariation(state, delivery.costVariation, {
        missionId: mission.id, actionId: action.id, reason: 'delivery-overrun'
      });
      if (actualProject) {
        const stored = state.finance.portfolio.find(project => project.id === actualProject.id);
        if (stored) {
          stored.costVariation = delivery.costVariation;
          stored.actualTotalCost = round2(stored.totalCost + delivery.costVariation);
        }
      }
    }

    state.stats = applyOutcomeEffects(state.stats, actualEffects);
    Finance.syncBudget(state);
    // Current protection is derived after service supply is registered below.
    if (action.flag && action.flag.key) state.flags[action.flag.key] = action.flag.value;
    state.xp += preview.xp;
    // Execution marks are settled below, and again when projects open.
    state.selectedActionId = action.id;
    state.selectedFundingMode = preview.plan.id;
    state.selectedPlacementId = preview.placement ? preview.placement.id : null;
    state.awaitingContinue = true;

    for (const interaction of preview.interactions || []) {
      const key = interaction.type === 'conflict' ? 'conflict' : 'synergy';
      state.interactionCounts[key] = (state.interactionCounts[key] || 0) + 1;
    }
    const deliveryKey = delivery.id === 'on-time' ? 'onTime' : delivery.id;
    if(!action.deferred)state.deliveryStats[deliveryKey] = (state.deliveryStats[deliveryKey] || 0) + 1;
    state.deliveryStats.totalOverrun = round2((state.deliveryStats.totalOverrun || 0) + (delivery.costVariation || 0));
    if (variation && variation.transfer > 0) state.deliveryStats.overrunBailouts += 1;

    const advisorReactions = commitAdvisorReactions(state, preview.advisorReactions, delivery);
    advisorReactions.forEach(reaction => {
      state.advisorMemories[reaction.advisorId] = state.advisorMemories[reaction.advisorId] || [];
      state.advisorMemories[reaction.advisorId].push({
        turn: state.turnIndex + 1, missionId: mission.id, actionId: action.id,
      deferred: Boolean(action.deferred),
        stance: reaction.stance, trustDelta: reaction.trustDelta, delivery: delivery.id
      });
      state.advisorMemories[reaction.advisorId] = state.advisorMemories[reaction.advisorId].slice(-5);
    });

    const financeSummary = Finance.getSummary(state);
    actualEffects.budget = round2(financeSummary.treasury - beforeFinance.treasury);
    actualEffects.reserve = round2(financeSummary.reserve - beforeFinance.reserve);
    actualEffects.debt = round2(financeSummary.debt - beforeFinance.debt);
    actualEffects.federal = round2(preview.plan.federalTransfer || 0);

    const record = {
      turn: state.turnIndex + 1,
      chapter: mission.chapter,
      threadPhase: mission.threadPhase || 'design',
      missionId: mission.id,
      districtId: mission.districtId,
      actionId: action.id,
      deferred: Boolean(action.deferred),
      fundingMode: preview.plan.id,
      placement: preview.placement ? deepClone(preview.placement) : null,
      mapObject: deepClone(preview.effectiveAction.mapObject || null),
      before,
      beforeFinance,
      entry: state.currentEntry ? deepClone(state.currentEntry) : null,
      expectedEffects: deepClone(preview.effects),
      effects: deepClone(actualEffects),
      after: { ...state.stats },
      afterFinance: {
        treasury: financeSummary.treasury,
        reserve: financeSummary.reserve,
        debt: financeSummary.debt,
        adminLoad: financeSummary.adminLoad
      },
      funding: Object.assign(deepClone(preview.plan), {
        costVariation: delivery.costVariation || 0,
        actualTotalCost: round2(preview.plan.totalCost + (delivery.costVariation || 0)),
        variation: variation ? deepClone(variation) : null
      }),
      project: actualProject ? deepClone(actualProject) : null,
      resilienceBefore: { ...preview.resilienceBefore },
      resilienceAfter: { ...state.resilience },
      immediateResilience: deepClone(immediateResilience),
      activationEffects: deepClone(activationEffects),
      activationResilience: deepClone(activationResilience),
      interactions: deepClone(preview.interactions),
      delivery: deepClone(delivery),
      advisorReactions: deepClone(advisorReactions),
      bonusTexts: deepClone(preview.bonusTexts),
      xp: preview.xp,
      stars: preview.stars,
      timestamp: Date.now(),
      incomeAfter: 0,
      fiscalLedger: null
    };
    if (Agenda.open(state)) record.agenda = {mode:'agenda', selectedId:mission.id, year:state.turnIndex+1, offer:Agenda.window(state,mission.id)};
    state.history.push(record);
    Population.registerDecision(state, mission, action, preview.plan, actualProject, preview.placement, delivery);
    record.population = deepClone(Population.advanceYear(state));
    const serviceAfter = Outcomes.snapshot(state, record.population.after);
    const response = Outcomes.publicResponse(state.serviceAnchor, serviceAfter);
    record.population.publicEffect = response.effects;
    state.population.lastYear.publicEffect = response.effects;
    state.stats.support = round1(clamp(state.stats.support + response.effects, 0, 100));
    const serviceDevelopment = round1(clamp(response.weightedChange * 20, -2, 2));
    state.stats.development = round1(clamp(state.stats.development + serviceDevelopment, 0, 100));
    record.serviceDevelopmentEffect = serviceDevelopment;
    record.serviceResponse = response;
    record.serviceSupportEffect = response.effects;
    state.serviceAnchor = serviceAfter;
    Outcomes.refreshReadiness(state);
    record.resilienceAfter = {...state.resilience};
    Outcomes.settleAwards(state);
    Governance.register(state, preview.agreement, record);
    record.promiseEvents = Governance.settle(state, Finance);
    record.after = { ...state.stats };
    const finalFinance = Finance.getSummary(state);
    record.afterFinance = {treasury: finalFinance.treasury, reserve: finalFinance.reserve, debt: finalFinance.debt, adminLoad: finalFinance.adminLoad};
    record.effects.budget = round2(finalFinance.treasury - beforeFinance.treasury);
    record.effects.reserve = round2(finalFinance.reserve - beforeFinance.reserve);
    record.effects.debt = round2(finalFinance.debt - beforeFinance.debt);
    record.modelEffects = deepClone(actualEffects);
    record.effects.support = round1(record.after.support-record.before.support);
    record.effects.development = round1(record.after.development-record.before.development);
    state.storyLog.push({
      type: 'decision', turn: record.turn, chapter: record.chapter, missionId: mission.id,
      actionId: action.id, delivery: delivery.id, placementId: record.placement && record.placement.id,
      interactions: record.interactions.map(item => item.type)
    });
    const newBadges = evaluateBadges(state);

    Stories.sync(state);
    return { state, preview, record, newBadges, delivery, variation, advisorReactions };
  }

  // Suspended transitions store intent, not a partially executed budget year.
  function runBudgetDraft(state,operation,args,approvals){
    const draft=deepClone(state);draft.budgetReview.pending=null;draft.budgetReview.status='active';
    return BudgetReview.run(draft,approvals,()=>{
      const result=operation==='commit'?commitActionCore(draft,args[0],args[1],args[2],args[3]===null?undefined:args[3]):advanceTurnCore(draft);
      return {draft,result};
    });
  }
  function performBudgetTransition(state,operation,args,approvals=[]){
    try{
      const {draft,result}=runBudgetDraft(state,operation,args,approvals);
      if(!validateState(draft))throw new Error('Invalid financial transition');
      Object.assign(state,draft);result.state=state;result.budgetOperation=operation;return result;
    }catch(e){
      if(!(e instanceof BudgetReview.Shortfall))throw e;
      state.budgetReview.pending={operation,args:deepClone(args),approvals:deepClone(approvals),event:deepClone(e.event)};
      return{state,pendingBudgetReview:true,newBadges:[],budgetOperation:operation};
    }
  }
  function commitAction(state, actionId, fundingMode, placementId, termIds){
    if(!BudgetReview.active(state))return commitActionCore(state,actionId,fundingMode,placementId,termIds);
    if(BudgetReview.locked(state))throw new Error('review-pending');
    return performBudgetTransition(state,'commit',[actionId,fundingMode||null,placementId||null,termIds||null]);
  }
  function advanceTurn(state){
    if(!BudgetReview.active(state))return advanceTurnCore(state);
    if(BudgetReview.locked(state))throw new Error('review-pending');
    return performBudgetTransition(state,'advance',[]);
  }
  function verifyBudgetPending(state){
    const p=state.budgetReview.pending;if(!p)return true;
    if(!['commit','advance'].includes(p.operation)||p.operation==='advance'&&(!state.awaitingContinue||p.args.length)||p.operation==='commit'&&(state.awaitingContinue||p.args.length!==4))return false;
    try{runBudgetDraft(state,p.operation,p.args,p.approvals);return false;}
    catch(e){return e instanceof BudgetReview.Shortfall&&JSON.stringify(e.event)===JSON.stringify(p.event);}
  }
  function resolveBudgetReview(state,choice){
    if(!BudgetReview.pending(state)||BudgetReview.stopped(state))throw new Error('No pending financial decision');
    if(!verifyBudgetPending(state))throw new Error('Financial review is stale');
    const p=state.budgetReview.pending,q=p.event.options.find(q=>q.id===choice);
    if(!q?.available)throw new Error('Financial option unavailable');
    return performBudgetTransition(state,p.operation,p.args,[...p.approvals,{event:deepClone(p.event),choice}]);
  }
  function endUnderSupervision(state){
    if(!BudgetReview.pending(state)||BudgetReview.stopped(state)||!verifyBudgetPending(state))throw new Error('No pending financial decision');
    state.budgetReview.status='supervised';
    return BudgetReview.report(state);
  }
  function ensureBudgetWritable(state){if(BudgetReview.locked(state))throw new Error(BudgetReview.stopped(state)?'review-supervised':'review-pending');}

  function setAgreementTerms(state, actionId, fundingMode, placementId, termIds) {
    ensureBudgetWritable(state);
    const mission = getCurrentMission(state);
    if (!mission?.actions.some(a=>a.id===actionId)) throw new Error('Unknown agreement action');
    const base = previewAction(state, actionId, fundingMode, placementId, []);
    if (!base?.plan) throw new Error('No funding plan');
    const selection = {missionId: mission.id, actionId, mode: fundingMode || base.plan.id, placementId: base.placement?.id || null};
    Governance.setDraft(state, selection, termIds);
    return previewAction(state, actionId, selection.mode, selection.placementId);
  }

  function publishPromiseReport(state, promiseId) { ensureBudgetWritable(state); return Governance.publishReport(state, promiseId); }
  function renegotiatePromise(state, promiseId) { ensureBudgetWritable(state); return Governance.revise(state, promiseId); }

  function renewalQuote(state, projectId) {
    const quote=Finance.renewalQuote(state,projectId);
    if(quote.available){
      const simulated={...state,finance:{...state.finance,treasury:round2(state.finance.treasury-quote.fee)}};
      const mission=getCurrentMission(state);
      const places=getPlacements(mission);
      const feasible=mission.actions.some(action=>(places.length?places:[null]).some(place=>
        Finance.getFundingOptions(simulated,mission,effectiveActionFor(simulated,mission,action,place)).some(p=>p.available)));
      if(!feasible){quote.available=false;quote.reason='mission-reserve';}
    }
    return quote;
  }

  function renewProgramme(state, projectId) {
    if(!renewalQuote(state,projectId).available)throw new Error('Renewal must leave one affordable response to the current mission');
    const record=Finance.renewProgramme(state,projectId);
    state.storyLog.push({...record,type:'renewal'});
    return record;
  }

  function applyLifecycle(state, lifecycle) {
    const before = { support: state.stats.support, development: state.stats.development };
    state.stats = applyOutcomeEffects(state.stats, lifecycle.effects || {});
    Outcomes.refreshReadiness(state);
    return {
      before,
      after: { support: state.stats.support, development: state.stats.development },
      effects: {support:round1(state.stats.support-before.support),development:round1(state.stats.development-before.development)},
      modelEffects: lifecycle.effects || {},
      resilience: lifecycle.resilience || {},
      events: lifecycle.events || []
    };
  }

  function advanceTurnCore(state) {
    if (!state) throw new Error('State is required');
    if (state.completed) return { state, completed: true, newBadges: [] };
    if (!state.awaitingContinue) throw new Error('Commit an action before advancing');

    const closedLedger = Finance.closeTurn(state);
    if (state.history.length) state.history[state.history.length - 1].fiscalLedger = deepClone(closedLedger);

    const isLast = state.turnIndex >= DATA.missions.length - 1;
    if (isLast) {
      state.completed = true;
      state.completedAt = null;
      state.awaitingContinue = false;
      state.selectedActionId = null;
      state.selectedFundingMode = null;
      state.selectedPlacementId = null;
      const newBadges = evaluateBadges(state);
      Stories.sync(state);
      return { state, completed: true, newBadges, closedLedger };
    }

    state.turnIndex += 1;
    state.agenda.selectedId = null;
    if (Agenda.mode(state) === 'agenda') state.activeView = state.turnIndex <= Agenda.LENGTH ? 'agenda' : 'mission';
    state.draft = null;
    state.governance.draft = null;
    const lifecycle = applyLifecycle(state, Finance.advancePortfolio(state));
    Population.refresh(state);
    Outcomes.refreshReadiness(state);
    const opened = Finance.openTurn(state);
    Outcomes.settleAwards(state);
    const income = round1(opened.forecast.netOperating);
    state.totalIncome = round1(state.totalIncome + income);
    state.lastIncome = income;
    if (state.history.length) state.history[state.history.length - 1].incomeAfter = income;
    state.awaitingContinue = false;
    state.selectedActionId = null;
    state.selectedFundingMode = null;
    state.selectedPlacementId = null;
    enterCurrentMission(state);
    const newBadges = evaluateBadges(state);
    Stories.sync(state);
    return {
      state,
      completed: false,
      income,
      newBadges,
      lifecycle,
      openedLedger: deepClone(state.finance.currentLedger),
      closedLedger
    };
  }

  function treasuryOperationQuote(state,kind,amount){
    const q=Finance.treasuryOperationQuote(state,kind,amount);
    if(!q.available)return q;
    const draft=deepClone(state);
    Finance.treasuryOperation(draft,kind,amount);
    const m=getCurrentMission(draft),placements=getPlacements(m);
    const has=m.actions.some(a=>(placements.length?placements:[null]).some(p=>Finance.getFundingOptions(draft,m,effectiveActionFor(draft,m,a,p)).some(f=>f.available)));
    if(!has){q.available=false;q.reason='mission-reserve';}
    return q;
  }
  function treasuryOperation(state,kind,amount){
    const q=treasuryOperationQuote(state,kind,amount);if(!q.available)throw new Error(q.reason||'Unavailable treasury operation');
    return Finance.treasuryOperation(state,kind,amount);
  }

  function settleRecovery(state,option){
    const draft=deepClone(state);const receipt=Finance.settleRecovery(draft,option);
    if(!validateState(draft))throw new Error('Invalid recovery settlement');
    Object.assign(state,draft);return receipt;
  }
  function returnRecoveryGrant(state){
    const draft=deepClone(state);const receipt=Finance.returnRecoveryGrant(draft);
    if(!validateState(draft))throw new Error('Invalid recovery return');
    Object.assign(state,draft);return receipt;
  }

  function getWorldObjects(state) {
    const objects = [];
    for (const record of state.history || []) {
      if(record.deferred)continue;
      const mission = Agenda.byId(record.missionId);
      const action = mission && mission.actions.find(item => item.id === record.actionId);
      if (!mission || !action) continue;
      const project = record.project && state.finance.portfolio.find(item => item.id === record.project.id);
      const mapObject = record.mapObject || action.mapObject;
      if (!mapObject || !mapObject.position) continue;
      objects.push({
        id: record.project ? record.project.id : `${record.missionId}:${record.actionId}:${record.turn}`,
        missionId: record.missionId,
        actionId: record.actionId,
        districtId: mission.districtId,
        title: deepClone(action.title),
        icon: mapObject.icon || action.icon || mission.icon,
        position: deepClone(mapObject.position),
        placement: record.placement ? deepClone(record.placement) : null,
        turn: record.turn,
        chapter: record.chapter || mission.chapter,
        status: project ? project.status : 'legacy',
        delivery: record.delivery ? record.delivery.id : 'on-time',
        fundingMode: record.fundingMode
      });
    }
    return objects;
  }

  function getStoryThreads(state) {
    const completed = new Set((state.history || []).map(item => item.missionId));
    return (DATA.chapters || []).map(chapter => {
      const missions = DATA.missions.filter(mission => mission.chapter === chapter.id);
      if (chapter.id===1 && Agenda.mode(state)==='agenda') {
        const rows=Array.from({length:5},(_,i)=>{
          const r=state.history[i];
          return {record:r||null,mission:r?Agenda.byId(r.missionId):{id:'agenda-slot-'+i,threadPhase:'design',title:{ru:`Повестка ${state.population.baseYear+i} года`,en:`Agenda for ${state.population.baseYear+i}`},objective:{ru:'Выберите следующий приоритет',en:'Choose the next priority'}},
            status:r?'done':state.turnIndex===i?'current':'locked'};
        });
        return {chapter,records:rows,completed:Math.min(5,state.history.length),total:5,status:state.history.length>=5?'done':'current'};
      }
      const records = missions.map(mission => ({
        mission: Agenda.byId(mission.id, state),
        record: (state.history || []).find(item => item.missionId === mission.id) || null,
        status: completed.has(mission.id) ? 'done' : getCurrentMission(state) && getCurrentMission(state).id === mission.id ? 'current' : 'locked'
      }));
      return {
        chapter,
        records,
        completed: records.filter(item => item.status === 'done').length,
        total: records.length,
        status: records.every(item => item.status === 'done') ? 'done' : records.some(item => item.status === 'current') ? 'current' : 'locked'
      };
    });
  }

  function getDistrictStatus(state, district) {
    const current = getCurrentMission(state);
    if (current && !Agenda.needsChoice(state) && current.id !== Agenda.OPERATIONS.id && current.districtId === district.id && !state.completed) return 'active';
    const completedMissionIds = new Set(state.history.filter(item => !item.deferred).map(item => item.missionId));
    const completedCount = district.missionIds.filter(id => completedMissionIds.has(id)).length;
    if (completedCount >= district.missionIds.length) return 'prepared';
    if (completedCount > 0) return 'progress';
    return 'waiting';
  }

  function questStatus(state, quest) {
    let progress = 0;
    let complete = false;
    try {
      progress = clamp(Number(quest.evaluate(state)) || 0, 0, 1);
      complete = Boolean(quest.complete(state));
    } catch (_) {
      progress = 0;
      complete = false;
    }
    return { progress, complete };
  }

  function getEnding(state) {
    // Describe the observed course separately from success. An aid-dependent
    // capital strategy is still capital-led; it is never labelled a success.
    const finance=Finance.getSummary(state),future=Finance.projectObligations(state,3);
    const records=state.history||[],launched=records.filter(r=>!r.deferred),projects=state.finance.portfolio;
    const deferred=records.length-launched.length;
    const spent=launched.reduce((sum,r)=>sum+(r.funding?.actualTotalCost||0),0)||1;
    const share=predicate=>launched.filter(predicate).reduce((sum,r)=>sum+(r.funding?.actualTotalCost||0),0)/spent;
    const capitalShare=share(r=>r.project?.kind==='capital');
    const serviceShare=share(r=>['north','suburb'].includes(r.districtId));
    const protectionShare=share(r=>{const o=Population.outputsFor(r.actionId);return o.floodProtection>0||o.digitalProtection>0;});
    const coverage=new Set(launched.map(r=>r.districtId)).size;
    const advisorAverage=Object.values(state.advisorTrust).reduce((a,b)=>a+b,0)/DATA.advisors.length;
    const promises=Governance.summary(state);
    const actualCapital=projects.filter(p=>p.kind==='capital'&&p.activatedTurn).length;
    let id='adaptive';
    if((state.interactionCounts?.conflict||0)>=5)id='fragmented';
    else if(records.length&&deferred/records.length>=.45)id='fiscal';
    else if(promises.kept>=5&&promises.broken<=1&&advisorAverage>=50)id='institutional';
    else if(capitalShare>=.55&&projects.filter(p=>p.kind==='capital').length>=4)id='visionary';
    else if(serviceShare>=.50)id='people';
    else if(protectionShare>=.28)id='resilient';
    else if(coverage===5)id='balanced';
    const titles={
      fiscal:['Ограничение новых расходов','Restrained new spending'],
      institutional:['Управление через соглашения','Agreement-led governance'],
      visionary:['Ставка на капитальные проекты','Capital-led strategy'],
      people:['Приоритет повседневных услуг','Everyday services first'],
      resilient:['Подготовка к кризисам','Crisis preparation'],
      balanced:['Разноотраслевой портфель','Cross-sector portfolio'],
      adaptive:['Ситуативное управление','Case-by-case governance'],
      fragmented:['Несогласованные реформы','Conflicting reforms']};
    const actual=Outcomes.snapshot(state),initial=Outcomes.snapshot(state,{population:state.population.initial.population,municipalities:state.population.initial.access});
    const serviceChange=round1((actual.mean-initial.mean)*100);
    const assistance=state.finance.totalEmergencyTransfers;
    const fiscalStatus=assistance>0?'assistance-used':future.unfunded?'future-gap':'covered-under-assumptions';
    const recoveryReport=Recovery.report(state);
    const ru=`Новых мер: ${launched.length}; годов без новой меры: ${deferred}. Капитальные проекты составили ${Math.round(capitalShare*100)}% расходов на меры. Запущено капитальных объектов: ${actualCapital}. Средний индекс доступности услуг изменился на ${serviceChange>0?'+':''}${serviceChange} п. п. `+
      (assistance>0?`Для завершения срока понадобилось ${round2(assistance)} млрд ₽ экстренной учебной помощи. `:'Экстренная учебная помощь не использовалась. ')+
      (future.unfunded?'При продолжении действующих обязательств есть дефицит следующего бюджета. ':'Условный прогноз следующих трёх лет не требует помощи. ')+
      (recoveryReport?`В учебном кейсе старый счёт: ${recoveryReport.bill} млрд ₽; целевая помощь: ${recoveryReport.grantReceived}; возврат помощи: ${recoveryReport.grantReturned}; остаток займа: ${recoveryReport.principalOutstanding}. `:'')+
      'Название описывает ваш курс, а не оценку знаний и не доказательство успешности управления.';
    const en=`New measures: ${launched.length}; years without a new measure: ${deferred}. Capital projects account for ${Math.round(capitalShare*100)}% of policy spending; ${actualCapital} capital projects opened. Mean service-access index changed by ${serviceChange>0?'+':''}${serviceChange} pp. `+
      (assistance>0?`Completing the term required ${round2(assistance)} bn RUB in emergency classroom support. `:'No emergency classroom support was used. ')+
      (future.unfunded?'Existing commitments imply a future cash shortfall. ':'The conditional three-year projection requires no support. ')+
      (recoveryReport?`Classroom inherited bill: ${recoveryReport.bill} bn RUB; conditional grant: ${recoveryReport.grantReceived}; grant returned: ${recoveryReport.grantReturned}; loan still outstanding: ${recoveryReport.principalOutstanding}. `:'')+
      'The title describes your course, not learning attainment or proof of governance success.';
    return {id,title:{ru:titles[id][0],en:titles[id][1]},description:{ru,en},future,
      evidence:{advisorAverage:round1(advisorAverage),actualCapital,assistance,deferred,launched:launched.length,capitalShare:round2(capitalShare),serviceShare:round2(serviceShare),protectionShare:round2(protectionShare),coverage,serviceChange,fiscalStatus,promises,future},
      lessons:[
       {ru:'Ввод объекта, доступность услуги и бюджетная устойчивость проверяются отдельно.',en:'Facility opening, service access and fiscal resilience are assessed separately.'},
       {ru:'Положительный средний результат не исключает ухудшения в отдельных территориях.',en:'A positive regional average does not rule out losses in individual places.'}
      ]};
  }

  function validateStateUnchecked(state) {
    if (!Integrity.check(state, DATA, Population, Finance).ok) return false;
    if (Recovery.verify(state).length) return false;
    if (BudgetReview.verify(state).length) return false;
    if (BudgetReview.pending(state) && !verifyBudgetPending(state)) return false;
    if (state?.stories && Stories.verify(state).length) return false;
    if (!state || typeof state !== 'object') return false;
    if (state.version !== (BudgetReview.active(state)?REVIEW_VERSION:Recovery.active(state)?RECOVERY_VERSION:VERSION) || state.contentVersion !== CONTENT_VERSION) return false;
    if (!DATA.scenarios.some(s => s.id === state.scenarioId) || !DATA.challenges.some(c => c.id === state.challengeId)) return false;
    if(JSON.stringify(state.rules)!==JSON.stringify(mergeRules(findScenario(state.scenarioId),findChallenge(state.challengeId))))return false;
    if(state.rewardMultiplier!==findChallenge(state.challengeId).rewardMultiplier)return false;
    if (Agenda.verify(state).length) return false;
    const draftMission=getCurrentMission(state);
    if(state.selectedActionId&&!draftMission?.actions.some(a=>a.id===state.selectedActionId))return false;
    if(state.draft){
      if(state.draft.actionId&&!draftMission?.actions.some(a=>a.id===state.draft.actionId))return false;
      if(state.draft.fundingMode&&!['treasury','cofinance','debt','reserve'].includes(state.draft.fundingMode))return false;
      if(state.draft.placementId&&!draftMission?.placements?.some(p=>p.id===state.draft.placementId))return false;
    }

    if(state.selectedFundingMode&&!['treasury','cofinance','debt','reserve'].includes(state.selectedFundingMode))return false;
    if(state.selectedPlacementId&&!draftMission?.placements?.some(p=>p.id===state.selectedPlacementId))return false;
    if (!Population.verify(state.population).ok) return false;
    if (!Governance.verify(state)) return false;
    if (state.population.ledgers.length !== (state.history || []).length) return false;
    if (!Number.isInteger(state.turnIndex) || state.turnIndex < 0 || state.turnIndex >= DATA.missions.length) return false;
    if (!state.stats || ['budget', 'support', 'development'].some(key => !Number.isFinite(Number(state.stats[key])))) return false;
    if (!state.profile || typeof state.profile.name !== 'string') return false;
    if (!state.finance || state.finance.version !== Finance.VERSION) return false;
    if (!Array.isArray(state.history) || !Array.isArray(state.finance.ledgers)) return false;
    const expectedHistory = state.completed || state.awaitingContinue ? state.turnIndex + 1 : state.turnIndex;
    if (state.history.length !== expectedHistory) return false;
    if (state.history.some((r,i)=>r.turn!==i+1 || ((Agenda.mode(state)!=='agenda'||i>=Agenda.LENGTH) && r.missionId!==DATA.missions[i].id))) return false;
    if (state.finance.ledgers.length !== (state.completed ? DATA.missions.length : state.turnIndex)) return false;
    if ([state.finance.treasury,state.finance.reserve,state.finance.debt].some(n=>!Number.isFinite(n)||n<0)) return false;
    if (state.finance.debt > state.finance.debtLimit + 1e-7) return false;
    if (state.stats.support<0||state.stats.support>100||state.stats.development<0||state.stats.development>100) return false;
    if (state.finance.currentLedger && !Finance.verifyLedger(state.finance.currentLedger).ok) return false;
    if ((state.finance.ledgers || []).some(ledger => !Finance.verifyLedger(ledger).ok)) return false;
    if (Boolean(state.finance.currentLedger) === Boolean(state.completed)) return false;
    const accounts = [...state.finance.ledgers, ...(state.finance.currentLedger ? [state.finance.currentLedger] : [])];
    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i].turn !== i + 1) return false;
      if (i > 0 && ['Treasury', 'Debt', 'Reserve'].some(k => Math.abs(accounts[i]['opening' + k] - accounts[i - 1]['closing' + k]) > 1e-7)) return false;
    }
    const last = accounts[accounts.length - 1];
    if (!last || [['Treasury','treasury'],['Debt','debt'],['Reserve','reserve']].some(([suffix,key]) => Math.abs(last['closing'+suffix]-state.finance[key]) > 1e-7)) return false;
    return true;
  }

  function validateState(state) {
    try { return validateStateUnchecked(state); } catch (_) { return false; }
  }

  function restoreState(raw) {
    try {
      const state = typeof raw === 'string' ? JSON.parse(raw) : deepClone(raw);
      // Stage14 only added artwork but changed the narrative schema tag. Validate
      // every snapshot against the unchanged rules after normalising this known tag.
      if(state?.stories?.version==='1.1.0-stage14')state.stories.version='1.0.0-stage7';
      if (state?.version === '0.8.0-consolidation' && state?.contentVersion === 'stage8-2026-09-05') {
        state.migratedFrom = {version:state.version,contentVersion:state.contentVersion};
        state.version = VERSION;state.contentVersion = CONTENT_VERSION;
        state.agenda = Agenda.create('guided');
      }
      if (!validateState(state)) return null;
      state.language = state.language === 'en' ? 'en' : 'ru';
      state.activeView = state.activeView || 'mission';
      state.soundEnabled = state.soundEnabled !== false;
      state.badges = Array.isArray(state.badges) ? state.badges : [];
      state.history = Array.isArray(state.history) ? state.history : [];
      state.storyLog = Array.isArray(state.storyLog) ? state.storyLog : [];
      state.entryApplied = state.entryApplied || {};
      state.resilience = state.resilience || { health: 0, jobs: 0, flood: 0, digital: 0, family: 0 };
      state.flags = state.flags || {};
      state.challengeId = state.challengeId || 'standard';
      const challenge = findChallenge(state.challengeId);
      state.rules = state.rules || mergeRules(findScenario(state.scenarioId), challenge);
      state.rewardMultiplier = Number(state.rewardMultiplier || challenge.rewardMultiplier || 1);
      state.selectedFundingMode = state.selectedFundingMode || null;
      state.selectedPlacementId = state.selectedPlacementId || null;
      state.advisorTrust = state.advisorTrust || Object.fromEntries(DATA.advisors.map(advisor => [advisor.id, 50]));
      state.advisorMemories = state.advisorMemories || Object.fromEntries(DATA.advisors.map(advisor => [advisor.id, []]));
      state.interactionCounts = state.interactionCounts || { synergy: 0, conflict: 0 };
      state.deliveryStats = state.deliveryStats || { onTime: 0, delayed: 0, overrun: 0, partial: 0, overrunBailouts: 0, totalOverrun: 0 };
      state.finance.totalCostOverruns = Number(state.finance.totalCostOverruns || 0);
      state.finance.overrunEmergencyTransfers = Number(state.finance.overrunEmergencyTransfers || 0);
      Finance.syncBudget(state);
      evaluateBadges(state);
      Stories.sync(state);
      return state;
    } catch (_) {
      return null;
    }
  }

  function serialiseState(state) {
    return JSON.stringify(state);
  }

  function buildReport(state, language) {
    const lang = language === 'en' ? 'en' : 'ru';
    const scenario = getScenario(state);
    const challenge = getChallenge(state);
    const ending = BudgetReview.stopped(state) ? {
      id: 'financial-handover',
      title: {ru: 'Досрочная передача финансового управления', en: 'Early financial handover'},
      description: {ru: 'Срок не завершён. Отчёт сохраняет последнюю подтверждённую историю, а не итоги двадцати лет.', en: 'The term is not complete. This report preserves the last confirmed history, not twenty-year results.'},
      lessons: [{ru: 'Непрофинансированный переход не считается исполненным; остаток обязательств показан отдельно.', en: 'An unfunded transition is not recorded as delivered; outstanding obligations are reported separately.'}]
    } : getEnding(state);
    const finance = Finance.getSummary(state);
    return {
      firstTermAgenda: Agenda.report(state),
      recoveryCase: Recovery.report(state),
      budgetReview: BudgetReview.report(state),
      campaignMode: Agenda.mode(state),
      outcomeModelVersion: Outcomes.VERSION,
      forecast: Finance.projectObligations(state,3),
      serviceResponse: state.history.map(r=>({turn:r.turn,response:r.serviceResponse})),
      product: DATA.ui[lang].appTitle,
      residentStories: Stories.report(state, lang),
      modelVersion: state.version,
      financeModelVersion: state.finance.version,
      contentVersion: state.contentVersion,
      sessionId: state.sessionId,
      seed: state.seed,
      student: { ...state.profile },
      scenario: {
        id: scenario.id,
        name: localise(scenario.name, lang),
        description: localise(scenario.description, lang),
        rules: deepClone(scenario.rules || {})
      },
      challenge: {
        id: challenge.id,
        name: DATA.ui[lang][challenge.nameKey] || challenge.id,
        description: DATA.ui[lang][challenge.descriptionKey] || '',
        rewardMultiplier: challenge.rewardMultiplier,
        rules: deepClone(challenge.rules || {})
      },
      final: {
        fiscalSpace: finance.treasury,
        reserve: finance.reserve,
        debt: finance.debt,
        debtLimit: finance.debtLimit,
        debtRatio: round2(finance.debtRatio),
        programmeOpex: finance.programmeOpex,
        administrativeLoad: finance.adminLoad,
        administrativeCapacity: finance.adminCapacity,
        support: state.stats.support,
        development: state.stats.development,
        resilience: { ...state.resilience },
        interactions: { ...state.interactionCounts },
        delivery: { ...state.deliveryStats },
        advisorTrust: { ...state.advisorTrust },
        xp: state.xp,
        stars: state.stars,
        level: getLevel(state),
        ending: {
          id: ending.id,
          title: localise(ending.title, lang),
          description: localise(ending.description, lang),
          lessons: ending.lessons.map(item => localise(item, lang))
        }
      },
      finance: {
        initialDebt: state.finance.initialDebt,
        totalFederalFunds: state.finance.totalFederalFunds,
        totalBorrowed: state.finance.totalBorrowed,
        totalReserveDraw: state.finance.totalReserveDraw,
        totalEmergencyTransfers: state.finance.totalEmergencyTransfers,
        totalCostOverruns: state.finance.totalCostOverruns || 0,
        overrunEmergencyTransfers: state.finance.overrunEmergencyTransfers || 0,
        fundingCounts: { ...state.finance.fundingCounts },
        overloadCount: state.finance.overloadCount,
        fiscalIdentityFailures: state.finance.fiscalIdentityFailures,
        portfolio: state.finance.portfolio.map(project => ({
          ...deepClone(project),
          title: localise(project.title, lang),
          placement: project.placement ? { ...deepClone(project.placement), title: localise(project.placement.title, lang) } : null
        })),
        ledgers: deepClone(state.finance.ledgers),
        openLedger: state.finance.currentLedger ? deepClone(state.finance.currentLedger) : null
      },
      population: Population.report(state),
      governance: {...deepClone(state.governance), summary: Governance.summary(state)},
      world: {
        objects: getWorldObjects(state).map(object => ({
          ...deepClone(object),
          title: localise(object.title, lang),
          placement: object.placement ? { ...deepClone(object.placement), title: localise(object.placement.title, lang) } : null
        })),
        chapters: getStoryThreads(state).map(thread => ({
          id: thread.chapter.id,
          title: DATA.ui[lang][thread.chapter.titleKey] || thread.chapter.id,
          status: thread.status,
          completed: thread.completed,
          total: thread.total
        }))
      },
      quests: DATA.quests.map(quest => ({
        id: quest.id,
        title: localise(quest.title, lang),
        ...questStatus(state, quest)
      })),
      badges: state.badges.map(id => {
        const badge = DATA.badges.find(item => item.id === id);
        return badge ? { id, title: localise(badge.title, lang) } : { id, title: id };
      }),
      decisions: state.history.map(record => {
        const mission = Agenda.byId(record.missionId);
        const action = mission && mission.actions.find(item => item.id === record.actionId);
        return {
          turn: record.turn,
          chapter: record.chapter,
          phase: record.threadPhase,
          missionId: record.missionId,
          mission: mission ? localise(mission.title, lang) : record.missionId,
          actionId: record.actionId,
          action: action ? localise(action.title, lang) : record.actionId,
          fundingMode: record.fundingMode,
          placement: record.placement ? {
            id: record.placement.id,
            title: localise(record.placement.title, lang),
            position: record.placement.position
          } : null,
          funding: record.funding ? {
            totalCost: record.funding.totalCost,
            actualTotalCost: record.funding.actualTotalCost,
            costVariation: record.funding.costVariation,
            treasuryCost: record.funding.treasuryCost,
            federalTransfer: record.funding.federalTransfer,
            reserveUse: record.funding.reserveUse,
            debtIssue: record.funding.debtIssue,
            implementationFactor: record.funding.implementationFactor,
            variation: record.funding.variation
          } : null,
          delivery: record.delivery,
          interactions: (record.interactions || []).map(item => ({
            type: item.type,
            text: localise(item.text, lang)
          })),
          advisorReactions: (record.advisorReactions || []).map(item => ({ ...item, message: localise(item.message, lang) })),
          expectedEffects: record.expectedEffects,
          effects: record.effects,
          entryEffects: record.entry ? record.entry.effects : null,
          entryFinance: record.entry ? record.entry.finance : null,
          resilienceAfter: record.resilienceAfter,
          reasoning: action ? localise(action.outcome, lang) : '',
          future: action ? localise(action.future, lang) : '',
          fiscalLedger: record.fiscalLedger,
          population: record.population,
          serviceSupportEffect: record.serviceSupportEffect || 0,
          agreement: record.agreement || null, promiseEvents: record.promiseEvents || []
        };
      }),
      storyLog: deepClone(state.storyLog || []),
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      integrity: {
        population: Population.verify(state.population),
        governance: Governance.verify(state),
        allLedgersBalanced: state.finance.ledgers.every(ledger => Finance.verifyLedger(ledger).ok),
        verifiedLedgers: state.finance.ledgers.length,
        uniqueMissionCount: new Set(state.history.map(record => record.missionId)).size,
        allMissionsCompleted: state.completed && state.history.length === DATA.missions.length
      }
    };
  }

  const Engine = {
    settleRecovery,returnRecoveryGrant,RECOVERY_VERSION,
    REVIEW_VERSION,resolveBudgetReview,endUnderSupervision,
    VERSION,
    treasuryOperationQuote,
    treasuryOperation,
    CONTENT_VERSION,
    clamp,
    round1,
    round2,
    hashString,
    mulberry32,
    localise,
    createState,
    restoreState,
    serialiseState,
    getCurrentMission,
    findMission: Agenda.byId,
    chooseAgenda: (state,id)=>{ensureBudgetWritable(state);return Agenda.select(state,id);},
    getScenario,
    getChallenge,
    getChapter,
    getLevel,
    getLevelProgress,
    getTurnIncome,
    getFinanceSummary,
    previewAction,
    commitAction,
    setAgreementTerms,
    publishPromiseReport,
    renegotiatePromise,
    renewProgramme,
    renewalQuote,
    advanceTurn,
    enterCurrentMission,
    getPlacements,
    resolvePlacement,
    getWorldObjects,
    getStoryThreads,
    getDistrictStatus,
    questStatus,
    evaluateBadges,
    getEnding,
    buildReport,
    validateState
  };

  root.GovernorGame = root.GovernorGame || {};
  root.GovernorGame.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
