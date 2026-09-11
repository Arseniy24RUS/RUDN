(function (root) {
  'use strict';

  const DATA = root.GovernorGame && root.GovernorGame.DATA?.consolidationReady
    ? root.GovernorGame.DATA
    : (typeof require === 'function' ? require('./consolidation-data.js') : null);

  if (!DATA) throw new Error('GovernorGame.DATA must be loaded before finance.js');

  const Population = root.GovernorGame?.Population || (typeof require === 'function' ? require('./population.js') : null);
  const Agenda = root.GovernorGame?.Agenda || (typeof require==='function' ? require('./agenda.js') : null);
  const Recovery = root.GovernorGame?.Recovery || (typeof require==='function' ? require('./recovery.js') : null);
  const BudgetReview = root.GovernorGame?.BudgetReview || (typeof require==='function' ? require('./budget-review.js') : null);
  const VERSION = '8.0';
  const EPSILON = 1e-7;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100 || 0;
  }

  function round1(value) {
    return Math.round((Number(value) + Number.EPSILON) * 10) / 10 || 0;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sumValues(object) {
    return round2(Object.values(object || {}).reduce((sum, value) => sum + (Number(value) || 0), 0));
  }

  function blankInflows() {
    return {
      ownTaxes: 0,
      nonTax: 0,
      equalization: 0,
      federalCofinance: 0,
      reserveDraw: 0,
      borrowing: 0,
      emergencyTransfer: 0
    };
  }

  function blankOutflows() {
    return {
      mandatory: 0,
      debtService: 0,
      programmeOpex: 0,
      renewalFees: 0,
      governanceSpending: 0,
      actionSpending: 0,
      crisisSpending: 0,
      debtRepayment: 0,
      reserveContribution: 0
    };
  }

  function findScenario(id) {
    return DATA.scenarios.find(item => item.id === id) || DATA.scenarios[0];
  }

  function createFinanceState(scenario) {
    const config = (scenario && scenario.finance) || DATA.scenarios[0].finance;
    return {
      version: VERSION,
      treasury: round2(config.openingTreasury),
      reserve: round2(config.reserve),
      debt: round2(config.debt),
      initialDebt: round2(config.debt),
      debtLimit: round2(config.debtLimit),
      debtRate: Number(config.debtRate),
      adminCapacity: Number(config.adminCapacity),
      base: {
        ownTaxRevenue: round2(config.ownTaxRevenue),
        nonTaxRevenue: round2(config.nonTaxRevenue),
        equalizationGrant: round2(config.equalizationGrant),
        mandatoryCosts: round2(config.mandatoryCosts)
      },
      portfolio: [],
      ledgers: [],
      currentLedger: null,
      lastClosedLedger: null,
      lastLifecycleEvents: [],
      lastOperatingBalance: 0,
      fundingCounts: { treasury: 0, cofinance: 0, debt: 0, reserve: 0 },
      totalFederalFunds: 0,
      totalBorrowed: 0,
      totalReserveDraw: 0,
      totalEmergencyTransfers: 0,
      totalCostOverruns: 0,
      overrunEmergencyTransfers: 0,
      overloadCount: 0,
      fiscalIdentityFailures: 0,
      notices: []
    };
  }

  function syncBudget(state) {
    if (!state || !state.finance || !state.stats) return;
    state.stats.budget = round1(state.finance.treasury);
  }

  function programmeOpex(state) {
    if (!state || !state.finance) return 0;
    return round2((state.finance.portfolio || [])
      .filter(project => project.status === 'active')
      .reduce((sum, project) => sum + (Number(project.annualOpex) || 0), 0));
  }

  function getAdminLoad(state) {
    if (!state || !state.finance) return 0;
    const load = (state.finance.portfolio || []).reduce((sum, project) => {
      if (project.status === 'delivery') return sum + Math.max(0.35, (Number(project.adminLoad) || 0) * 0.58);
      if (project.status === 'active') return sum + (Number(project.adminMaintenance) || 0);
      return sum;
    }, 0);
    return round1(load);
  }

  function getAnnualForecast(state, turnIndex) {
    const scenario = findScenario(state.scenarioId);
    const finance = state.finance;
    const index = Number.isInteger(turnIndex) ? turnIndex : state.turnIndex;
    const developmentDelta = (Number(state.stats.development) || 0) - (Number(scenario.stats.development) || 0);
    const developmentFactor = 1; // An outcome score is not a tax base. Employment is counted once below.
    const rules = Object.assign({}, (scenario && scenario.rules) || {}, (state && state.rules) || {});
    const revenueGrowth = Number.isFinite(Number(rules.revenueGrowth)) ? Number(rules.revenueGrowth) : 0.004;
    const mandatoryGrowth = Number.isFinite(Number(rules.mandatoryGrowth)) ? Number(rules.mandatoryGrowth) : 0.008;
    const timeFactor = 1 + index * revenueGrowth;
    const demographics = Population.fiscalFactors(state);
    const ownTaxesWithoutPopulation = round2(finance.base.ownTaxRevenue * developmentFactor * timeFactor);
    const ownTaxes = round2(ownTaxesWithoutPopulation * demographics.taxFactor);
    const nonTax = round2(finance.base.nonTaxRevenue * (1 + index * Math.max(0.001, revenueGrowth * 0.75)));
    const equalization = round2(finance.base.equalizationGrant);
    const mandatoryWithoutPopulation = round2(finance.base.mandatoryCosts * (1 + index * mandatoryGrowth));
    const mandatory = round2(mandatoryWithoutPopulation * demographics.mandatoryFactor);
    const debtService = round2(finance.debt * finance.debtRate);
    const opex = programmeOpex(state);
    const inflows = round2(ownTaxes + nonTax + equalization);
    const outflows = round2(mandatory + debtService + opex);
    return {
      ownTaxes,
      nonTax,
      equalization,
      mandatory,
      debtService,
      programmeOpex: opex,
      inflows,
      outflows,
      netOperating: round2(inflows - outflows),
      demographics: { ...demographics, referenceYear: state.population?.year || 2026,
        taxDelta: round2(ownTaxes - ownTaxesWithoutPopulation),
        mandatoryDelta: round2(mandatory - mandatoryWithoutPopulation) }
    };
  }

  function recalculateLedger(state) {
    const ledger = state && state.finance && state.finance.currentLedger;
    if (!ledger) return null;
    ledger.totalInflows = sumValues(ledger.inflows);
    ledger.totalOutflows = sumValues(ledger.outflows);
    ledger.closingTreasury = round2(ledger.openingTreasury + ledger.totalInflows - ledger.totalOutflows);
    const reconstructed = round2(ledger.openingTreasury + ledger.totalInflows - ledger.totalOutflows);
    ledger.identityGap = round2(ledger.closingTreasury - reconstructed);
    ledger.identityOk = Math.abs(ledger.identityGap) < EPSILON;
    if (!ledger.identityOk) state.finance.fiscalIdentityFailures += 1;
    state.finance.treasury = ledger.closingTreasury;
    syncBudget(state);
    return ledger;
  }

  function addFlow(target, key, amount) {
    if (!target || !Object.prototype.hasOwnProperty.call(target, key)) return;
    target[key] = round2((Number(target[key]) || 0) + (Number(amount) || 0));
  }

  function stabiliseTreasury(state, reason, meta) {
    const finance = state.finance;
    const ledger = finance.currentLedger;
    recalculateLedger(state);
    let deficit = Math.max(0, -finance.treasury);
    if (deficit <= EPSILON) return { reserveUsed: 0, debtIssued: 0, transfer: 0 };
    if (BudgetReview.active(state)) {
      const result=BudgetReview.fundShortfall(state,reason,meta);
      recalculateLedger(state);
      ledger.closingReserve=finance.reserve;ledger.closingDebt=finance.debt;
      return result;
    }

    const reserveUsed = round2(Math.min(finance.reserve, deficit));
    if (reserveUsed > 0) {
      finance.reserve = round2(finance.reserve - reserveUsed);
      finance.totalReserveDraw = round2(finance.totalReserveDraw + reserveUsed);
      addFlow(ledger.inflows, 'reserveDraw', reserveUsed);
      deficit = round2(deficit - reserveUsed);
    }

    const headroom = state.rules && state.rules.noNewDebt
      ? 0
      : Math.max(0, round2(finance.debtLimit - finance.debt));
    const debtIssued = round2(Math.min(headroom, deficit));
    if (debtIssued > 0) {
      finance.debt = round2(finance.debt + debtIssued);
      finance.totalBorrowed = round2(finance.totalBorrowed + debtIssued);
      addFlow(ledger.inflows, 'borrowing', debtIssued);
      deficit = round2(deficit - debtIssued);
    }

    const transfer = round2(Math.max(0, deficit));
    if (transfer > 0) {
      finance.totalEmergencyTransfers = round2(finance.totalEmergencyTransfers + transfer);
      addFlow(ledger.inflows, 'emergencyTransfer', transfer);
      state.stats.support = round1(clamp(state.stats.support - Math.min(4, 1.5 + transfer * 0.35), 0, 100));
      finance.notices.push({
        type: 'bailout',
        turn: state.turnIndex + 1,
        reason: reason || 'liquidity',
        amount: transfer
      });
    }

    recalculateLedger(state);
    return { reserveUsed, debtIssued, transfer };
  }

  function openTurn(state) {
    if (!state || !state.finance) throw new Error('Finance state is required');
    if (state.finance.currentLedger) throw new Error('The fiscal turn is already open');
    const forecast = getAnnualForecast(state, state.turnIndex);
    state.finance.currentLedger = {
      turn: state.turnIndex + 1,
      openingTreasury: round2(state.finance.treasury),
      openingReserve: round2(state.finance.reserve),
      openingDebt: round2(state.finance.debt),
      inflows: blankInflows(),
      outflows: blankOutflows(),
      decisions: [],
      shocks: [],
      openedAt: null,
      closedAt: null,
      closingTreasury: 0,
      closingReserve: round2(state.finance.reserve),
      closingDebt: round2(state.finance.debt),
      identityGap: 0,
      identityOk: true
    };
    const ledger = state.finance.currentLedger;
    ledger.demographics = deepClone(forecast.demographics);
    ledger.inflows.ownTaxes = forecast.ownTaxes;
    ledger.inflows.nonTax = forecast.nonTax;
    ledger.inflows.equalization = forecast.equalization;
    ledger.outflows.mandatory = forecast.mandatory;
    ledger.outflows.debtService = forecast.debtService;
    ledger.outflows.programmeOpex = forecast.programmeOpex;
    for(const p of state.finance.portfolio)if(p.status==='active'){p.paidTurns=p.paidTurns||[];if(!p.paidTurns.includes(state.turnIndex+1))p.paidTurns.push(state.turnIndex+1);}
    state.finance.lastOperatingBalance = forecast.netOperating;
    recalculateLedger(state);
    const stabilisation = stabiliseTreasury(state, 'annual-obligations', {amount:forecast.outflows});
    const payment=Recovery.scheduledPayment(state);
    if(payment>0){
      addFlow(ledger.outflows,'debtRepayment',payment);
      state.finance.debt=round2(state.finance.debt-payment);
      Recovery.credit(state,payment,'scheduled');
      ledger.decisions.push({operation:'recovery-principal',turn:state.turnIndex+1,amount:payment});
      recalculateLedger(state);
    }
    const reviewPayment=BudgetReview.scheduledPayment(state);
    if(reviewPayment>0){
      addFlow(ledger.outflows,'debtRepayment',reviewPayment);
      state.finance.debt=round2(state.finance.debt-reviewPayment);
      const credits=BudgetReview.credit(state,reviewPayment,'scheduled');
      ledger.decisions.push({operation:'budget-review-principal',turn:state.turnIndex+1,amount:reviewPayment,reviewCredits:credits});
      recalculateLedger(state);
    }
    ledger.closingReserve = round2(state.finance.reserve);
    ledger.closingDebt = round2(state.finance.debt);
    return { ledger, forecast, stabilisation };
  }

  function closeTurn(state) {
    if (!state || !state.finance || !state.finance.currentLedger) return null;
    const ledger = state.finance.currentLedger;
    recalculateLedger(state);
    ledger.closingReserve = round2(state.finance.reserve);
    ledger.closingDebt = round2(state.finance.debt);
    ledger.closedAt = null;
    ledger.identityOk = verifyLedger(ledger).ok;
    if (!ledger.identityOk) state.finance.fiscalIdentityFailures += 1;
    const closed = deepClone(ledger);
    state.finance.ledgers.push(closed);
    state.finance.lastClosedLedger = closed;
    state.finance.currentLedger = null;
    return closed;
  }

  function profileFor(action) {
    return Object.assign({
      kind: 'programme',
      annualOpex: 0,
      lag: 0,
      duration: 0,
      adminLoad: 1,
      adminMaintenance: 0.2,
      federalMatch: 0,
      debtEligible: false,
      reserveEligible: false,
      annualEffects: {}
    }, (action && action.finance) || {});
  }

  function planBase(state, mission, action, id) {
    const profile = profileFor(action);
    const cost = round2(Math.abs(Number(action.cost) || 0));
    const currentLoad = getAdminLoad(state);
    const capacity = Number(state.finance.adminCapacity) || 1;
    const base = {
      id,
      deferred: Boolean(action.deferred),
      available: true,
      reasonCode: '',
      totalCost: cost,
      treasuryCost: cost,
      federalTransfer: 0,
      reserveUse: 0,
      debtIssue: 0,
      delay: 0,
      effectFactor: 1,
      supportAdjustment: 0,
      adminDelta: 0,
      currentAdminLoad: currentLoad,
      actionAdminLoad: Number(profile.adminLoad) || 0,
      totalAdminLoad: 0,
      implementationFactor: 1,
      profile,
      missionId: mission.id,
      actionId: action.id,
      recommended: false
    };
    return base;
  }

  function finalisePlan(state, plan) {
    const capacity = Number(state.finance.adminCapacity) || 1;
    const recoveryReason=BudgetReview.blockReason(state,{deferred:plan.deferred,kind:plan.profile.kind},plan.id)||Recovery.blockReason(state,{deferred:plan.deferred},plan.id);
    if(recoveryReason){plan.available=false;plan.reasonCode=recoveryReason;return plan;}
    if(plan.deferred){plan.totalAdminLoad=plan.currentAdminLoad;plan.firstYearOpex=0;return plan;}
    plan.totalAdminLoad = round1(plan.currentAdminLoad + plan.actionAdminLoad + plan.adminDelta);
    if (plan.totalAdminLoad > capacity * 1.35 + EPSILON) {
      plan.available = false;
      plan.reasonCode = plan.reasonCode || 'capacity';
      plan.implementationFactor = 0;
    } else if (plan.totalAdminLoad > capacity + EPSILON) {
      plan.implementationFactor = round2(clamp(capacity / plan.totalAdminLoad, 0.62, 1));
      plan.delay += 1;
    }
    plan.treasuryCost = round2(plan.treasuryCost);
    plan.federalTransfer = round2(plan.federalTransfer);
    plan.reserveUse = round2(plan.reserveUse);
    plan.debtIssue = round2(plan.debtIssue);
    plan.firstYearOpex = plan.delay + (plan.profile.lag || 0) === 0 && plan.profile.duration > 0 ? round2(plan.profile.annualOpex || 0) : 0;
    if (plan.treasuryCost + plan.firstYearOpex > state.finance.treasury + EPSILON) {
      plan.available = false;
      plan.reasonCode = plan.reasonCode || 'treasury';
    }
    if (plan.reserveUse > state.finance.reserve + EPSILON) {
      plan.available = false;
      plan.reasonCode = plan.reasonCode || 'reserve';
    }
    if (state.finance.debt + plan.debtIssue > state.finance.debtLimit + EPSILON) {
      plan.available = false;
      plan.reasonCode = plan.reasonCode || 'debt-limit';
    }
    return plan;
  }

  function getFundingOptions(state, mission, action) {
    if (!state || !state.finance || !mission || !action) return [];
    const profile = profileFor(action);
    const cost = round2(Math.abs(Number(action.cost) || 0));
    const options = [];

    const treasury = planBase(state, mission, action, 'treasury');
    options.push(finalisePlan(state, treasury));

    if (profile.federalMatch > 0) {
      const cofinance = planBase(state, mission, action, 'cofinance');
      cofinance.federalTransfer = round2(cost * clamp(profile.federalMatch, 0, 0.8));
      cofinance.treasuryCost = round2(cost - cofinance.federalTransfer);
      cofinance.delay = 1;
      cofinance.effectFactor = 0.87;
      cofinance.adminDelta = 0.8;
      finalisePlan(state, cofinance);
      const window = Agenda.window(state, mission.id);
      if (window && !window.open) { cofinance.available=false;cofinance.reasonCode='agenda-window';cofinance.offerDeadline=window.untilYear; }
      options.push(cofinance);
    }

    if (profile.debtEligible && !(state.rules && state.rules.noNewDebt)) {
      const debt = planBase(state, mission, action, 'debt');
      debt.debtIssue = round2(cost * 0.75);
      debt.treasuryCost = round2(cost - debt.debtIssue);
      debt.effectFactor = 0.98;
      debt.supportAdjustment = -1;
      debt.adminDelta = 0.2;
      options.push(finalisePlan(state, debt));
    }

    if (profile.reserveEligible) {
      const reserve = planBase(state, mission, action, 'reserve');
      const reserveShare = profile.kind === 'emergency' ? 0.8 : 0.5;
      reserve.reserveUse = round2(cost * reserveShare);
      reserve.treasuryCost = round2(cost - reserve.reserveUse);
      reserve.effectFactor = profile.kind === 'emergency' ? 1.04 : 1;
      reserve.supportAdjustment = profile.kind === 'emergency' ? 0.5 : 0;
      options.push(finalisePlan(state, reserve));
    }

    const available = options.filter(option => option.available);
    let recommended = null;
    if (mission.crisis) {
      recommended = available.find(option => option.id === 'reserve' && state.finance.reserve - option.reserveUse >= 0.4)
        || available.find(option => option.id === 'cofinance')
        || available.find(option => option.id === 'treasury')
        || available[0];
    } else {
      recommended = available.find(option => option.id === 'cofinance' && option.totalAdminLoad <= state.finance.adminCapacity)
        || available.find(option => option.id === 'treasury' && state.finance.treasury - option.treasuryCost >= 1.5)
        || available.find(option => option.id === 'debt')
        || available[0];
    }
    if (recommended) recommended.recommended = true;
    return options;
  }

  function getFundingPlan(state, mission, action, requestedId) {
    const options = getFundingOptions(state, mission, action);
    if (requestedId) return options.find(option => option.id === requestedId) || null;
    return options.find(option => option.recommended && option.available) || options.find(option => option.available) || options[0] || null;
  }

  function applyFundingPlan(state, plan, project) {
    if (!state || !state.finance || !state.finance.currentLedger) throw new Error('The fiscal turn is not open');
    if (!plan || !plan.available) throw new Error('Funding plan is unavailable');
    const finance = state.finance;
    const ledger = finance.currentLedger;

    if (plan.reserveUse > 0) {
      finance.reserve = round2(finance.reserve - plan.reserveUse);
      finance.totalReserveDraw = round2(finance.totalReserveDraw + plan.reserveUse);
      addFlow(ledger.inflows, 'reserveDraw', plan.reserveUse);
    }
    if (plan.debtIssue > 0) {
      finance.debt = round2(finance.debt + plan.debtIssue);
      finance.totalBorrowed = round2(finance.totalBorrowed + plan.debtIssue);
      addFlow(ledger.inflows, 'borrowing', plan.debtIssue);
    }
    if (plan.federalTransfer > 0) {
      finance.totalFederalFunds = round2(finance.totalFederalFunds + plan.federalTransfer);
      addFlow(ledger.inflows, 'federalCofinance', plan.federalTransfer);
    }
    addFlow(ledger.outflows, 'actionSpending', plan.totalCost);
    finance.fundingCounts[plan.id] = (finance.fundingCounts[plan.id] || 0) + 1;
    if (plan.implementationFactor < 0.9) finance.overloadCount += 1;

    ledger.decisions.push({
      missionId: plan.missionId,
      actionId: plan.actionId,
      fundingMode: plan.id,
      totalCost: plan.totalCost,
      treasuryCost: plan.treasuryCost,
      federalTransfer: plan.federalTransfer,
      reserveUse: plan.reserveUse,
      debtIssue: plan.debtIssue,
      adminLoad: plan.totalAdminLoad,
      implementationFactor: plan.implementationFactor
    });

    if (project) {
      finance.portfolio.push(project);
      if (project.status === 'active') {
        addFlow(ledger.outflows, 'programmeOpex', project.annualOpex || 0);
        project.firstYearOpexPaid = round2(project.annualOpex || 0);
        project.paidTurns = [state.turnIndex+1];
      }
    }
    recalculateLedger(state);
    ledger.closingReserve = round2(finance.reserve);
    ledger.closingDebt = round2(finance.debt);
    return ledger;
  }


  function applyInstitutionCost(state, amount, meta) {
    const ledger = state.finance?.currentLedger;
    if (!ledger || !Number.isFinite(amount) || amount < 0) throw new Error('Invalid institutional expense');
    amount = round2(amount);
    addFlow(ledger.outflows, 'governanceSpending', amount);
    const result = {amount, ...deepClone(meta || {}), ...stabiliseTreasury(state, 'conditional-grant-return', {amount,...meta})};
    ledger.institutional = ledger.institutional || [];
    ledger.institutional.push(deepClone(result));
    recalculateLedger(state);
    ledger.closingDebt = state.finance.debt;
    ledger.closingReserve = state.finance.reserve;
    return result;
  }

  function applyCostVariation(state, amount, meta) {
    if (!state || !state.finance || !state.finance.currentLedger) {
      throw new Error('The fiscal turn is not open');
    }
    const variation = round2(Math.max(0, Number(amount) || 0));
    if (!variation) {
      return {
        amount: 0,
        reserveUsed: 0,
        debtIssued: 0,
        transfer: 0,
        missionId: meta && meta.missionId,
        actionId: meta && meta.actionId
      };
    }

    const finance = state.finance;
    const ledger = finance.currentLedger;
    addFlow(ledger.outflows, 'actionSpending', variation);
    finance.totalCostOverruns = round2((finance.totalCostOverruns || 0) + variation);
    recalculateLedger(state);
    const stabilisation = stabiliseTreasury(state, 'cost-overrun', {amount:variation,...meta});
    finance.overrunEmergencyTransfers = round2(
      (finance.overrunEmergencyTransfers || 0) + (Number(stabilisation.transfer) || 0)
    );

    const decision = BudgetReview.active(state) ? [...ledger.decisions].reverse().find(d=>d.missionId===meta?.missionId&&d.actionId===meta?.actionId&&!d.operation) : ledger.decisions.length ? ledger.decisions[ledger.decisions.length - 1] : null;
    if (decision) {
      decision.costVariation = round2((decision.costVariation || 0) + variation);
      decision.actualTotalCost = round2((decision.actualTotalCost || decision.totalCost || 0) + variation);
      decision.overrunReserveUsed = round2((decision.overrunReserveUsed || 0) + stabilisation.reserveUsed);
      decision.overrunDebtIssued = round2((decision.overrunDebtIssued || 0) + stabilisation.debtIssued);
      decision.overrunEmergencyTransfer = round2((decision.overrunEmergencyTransfer || 0) + stabilisation.transfer);
    }

    const record = {
      amount: variation,
      reserveUsed: stabilisation.reserveUsed,
      debtIssued: stabilisation.debtIssued,
      transfer: stabilisation.transfer,
      missionId: meta && meta.missionId,
      actionId: meta && meta.actionId,
      reason: (meta && meta.reason) || 'delivery-overrun'
    };
    ledger.costVariations = ledger.costVariations || [];
    ledger.costVariations.push(record);
    ledger.closingReserve = round2(finance.reserve);
    ledger.closingDebt = round2(finance.debt);
    return record;
  }

  function applyShock(state, cost, meta) {
    if (!state || !state.finance || !state.finance.currentLedger) throw new Error('The fiscal turn is not open');
    const finance = state.finance;
    const ledger = finance.currentLedger;
    const totalCost = round2(Math.max(0, Number(cost) || 0));
    const reserveUsed = BudgetReview.active(state) ? 0 : round2(Math.min(finance.reserve, totalCost));
    if (reserveUsed > 0) {
      finance.reserve = round2(finance.reserve - reserveUsed);
      finance.totalReserveDraw = round2(finance.totalReserveDraw + reserveUsed);
      addFlow(ledger.inflows, 'reserveDraw', reserveUsed);
    }
    addFlow(ledger.outflows, 'crisisSpending', totalCost);
    recalculateLedger(state);
    const stabilisation = stabiliseTreasury(state, 'crisis', {totalCost,...meta});
    ledger.shocks.push({
      missionId: meta && meta.missionId,
      totalCost,
      reserveUsed,
      debtIssued: stabilisation.debtIssued,
      emergencyTransfer: stabilisation.transfer,
      treasuryImpact: round2(-(totalCost - reserveUsed - stabilisation.debtIssued - stabilisation.transfer))
    });
    ledger.closingReserve = round2(finance.reserve);
    ledger.closingDebt = round2(finance.debt);
    return ledger.shocks[ledger.shocks.length - 1];
  }

  function addEmergencyTransfer(state, amount, reason) {
    if(BudgetReview.active(state))throw new Error('Unconditional transfers are disabled in financial-decision mode');
    if (!state || !state.finance || !state.finance.currentLedger) return 0;
    const value = round2(Math.max(0, Number(amount) || 0));
    if (!value) return 0;
    state.finance.totalEmergencyTransfers = round2(state.finance.totalEmergencyTransfers + value);
    addFlow(state.finance.currentLedger.inflows, 'emergencyTransfer', value);
    state.finance.notices.push({ type: 'bailout', turn: state.turnIndex + 1, reason: reason || 'mission-access', amount: value });
    recalculateLedger(state);
    return value;
  }

  function advancePortfolio(state) {
    if (!state || !state.finance) return { effects: {}, resilience: {}, events: [] };
    const effects = { support: 0, development: 0 };
    const resilience = {};
    const events = [];

    for (const project of state.finance.portfolio) {
      if (project.status === 'completed') continue;
      let justActivated = false;
      if (project.status === 'active') {
        project.yearsRemaining = Math.max(0, Number(project.yearsRemaining || 0) - 1);
        if (project.yearsRemaining === 0) {
          project.status = 'completed'; project.completedTurn = state.turnIndex + 1;
          events.push({ type: 'completed', projectId: project.id, title: project.title });
          continue;
        }
      }
      if (project.status === 'delivery') {
        project.startsIn = Math.max(0, (Number(project.startsIn) || 0) - 1);
        if (project.startsIn <= 0) {
          project.status = 'active';
          project.activatedTurn = state.turnIndex + 1;
          justActivated = true;
          for (const [key, value] of Object.entries(project.activationEffects || {})) {
            effects[key] = round2((effects[key] || 0) + (Number(value) || 0));
          }
          for (const [key, value] of Object.entries(project.activationResilience || {})) {
            resilience[key] = round2((resilience[key] || 0) + (Number(value) || 0));
          }
          events.push({ type: 'activated', projectId: project.id, title: project.title });
        }
      }

      if (project.status === 'active') {
        for (const [key, value] of Object.entries(project.annualEffects || {})) {
          effects[key] = round2((effects[key] || 0) + (Number(value) || 0) * (key==='support'?.15:key==='development'?.30:1));
        }
        if (!justActivated) events.push({ type: 'operating', projectId: project.id, title: project.title });
      }
    }

    state.finance.lastLifecycleEvents = deepClone(events);
    return { effects, resilience, events };
  }

  function verifyLedger(ledger) {
    if (!ledger) return { ok: false, gap: NaN };
    const expected = round2((Number(ledger.openingTreasury) || 0) + sumValues(ledger.inflows) - sumValues(ledger.outflows));
    const gap = round2((Number(ledger.closingTreasury) || 0) - expected);
    const debtGap = round2(Number(ledger.closingDebt) - (Number(ledger.openingDebt) + Number(ledger.inflows?.borrowing || 0) - Number(ledger.outflows?.debtRepayment || 0)));
    const reserveGap = round2(Number(ledger.closingReserve) - (Number(ledger.openingReserve) + Number(ledger.outflows?.reserveContribution || 0) - Number(ledger.inflows?.reserveDraw || 0)));
    const valid = [...Object.values(ledger.inflows || {}), ...Object.values(ledger.outflows || {}), ledger.openingTreasury, ledger.openingDebt, ledger.openingReserve, ledger.closingTreasury, ledger.closingDebt, ledger.closingReserve].every(v => Number.isFinite(v) && v >= -EPSILON);
    return { ok: valid && Math.abs(gap) < EPSILON && Math.abs(debtGap) < EPSILON && Math.abs(reserveGap) < EPSILON, gap, debtGap, reserveGap, expected };
  }

  function renewalQuote(state, projectId) {
    const project=state.finance?.portfolio.find(p=>p.id===projectId);
    const eligible=Boolean(!BudgetReview.locked(state) && !Recovery.pending(state) && project && project.status==='active' && project.yearsRemaining===1
      && project.kind!=='emergency' && project.annualOpex>0 && !state.completed && !state.awaitingContinue);
    const fee=project?round2(project.annualOpex*.25):0;
    return {eligible,available:eligible&&state.finance.treasury+EPSILON>=fee,projectId,fee,
      extraYears:3,annualOpex:project?.annualOpex||0,futureCommitment:round2((project?.annualOpex||0)*3)};
  }

  function renewProgramme(state, projectId) {
    const quote=renewalQuote(state,projectId);
    if(!quote.available || !state.finance.currentLedger)throw new Error('Programme renewal is unavailable');
    const project=state.finance.portfolio.find(p=>p.id===projectId);
    // Existing operation was already paid at the opening of this year. Charge
    // only the contract fee now; added operating years will be paid once each.
    addFlow(state.finance.currentLedger.outflows,'renewalFees',quote.fee);
    project.yearsRemaining+=quote.extraYears;
    project.renewals=project.renewals||[];
    const record={operation:'renewal',turn:state.turnIndex+1,projectId,fee:quote.fee,
      extraYears:quote.extraYears,annualOpex:quote.annualOpex,futureCommitment:quote.futureCommitment};
    project.renewals.push(deepClone(record));
    state.finance.currentLedger.decisions.push(deepClone(record));
    recalculateLedger(state);syncBudget(state);
    return record;
  }

  function treasuryOperationQuote(state,kind,amount){
    const f=state?.finance;
    if(BudgetReview.locked(state))return{available:false,reason:BudgetReview.stopped(state)?'review-supervised':'review-pending'};
    if(Recovery.pending(state))return{available:false,reason:'recovery-pending'};
    if(!['reserve','repay'].includes(kind)||!Number.isFinite(amount)||amount<=0||Math.abs(round2(amount)-amount)>EPSILON)
      return {available:false,reason:'invalid-amount'};
    if(!f?.currentLedger||state.completed||state.awaitingContinue)return{available:false,reason:'not-planning'};
    if(amount>f.treasury+EPSILON)return{available:false,reason:'treasury'};
    if(kind==='repay'&&amount>f.debt+EPSILON)return{available:false,reason:'debt'};
    return{available:true,kind,amount,treasuryAfter:round2(f.treasury-amount),reserveAfter:round2(f.reserve+(kind==='reserve'?amount:0)),debtAfter:round2(f.debt-(kind==='repay'?amount:0)),annualInterestSaved:kind==='repay'?round2(amount*f.debtRate):0};
  }
  function treasuryOperation(state,kind,amount){
    const q=treasuryOperationQuote(state,kind,amount);if(!q.available)throw new Error(q.reason);
    const f=state.finance,l=f.currentLedger;
    addFlow(l.outflows,kind==='reserve'?'reserveContribution':'debtRepayment',amount);
    f.reserve=q.reserveAfter;f.debt=q.debtAfter;
    const op={operation:kind==='reserve'?'reserve-contribution':'principal-repayment',amount,turn:state.turnIndex+1};
    if(kind==='repay'){const credited=Recovery.credit(state,amount,'voluntary');if(credited)op.recoveryCredit=credited;const credits=BudgetReview.credit(state,amount,'voluntary');if(credits.length)op.reviewCredits=credits;}
    l.decisions.push(op);recalculateLedger(state);l.closingReserve=f.reserve;l.closingDebt=f.debt;
    return op;
  }
  function projectObligations(state,years=3){
    // Conditional cash projection, frozen population and indices, no new policies,
    // no automatic rescue or renewal. NOT a prediction or a fiscal recommendation.
    const sim={...state,budgetReview:state.budgetReview?deepClone(state.budgetReview):undefined,recovery:state.recovery?deepClone(state.recovery):undefined,stats:{...state.stats},population:{...state.population},finance:{...state.finance,portfolio:deepClone(state.finance.portfolio),notices:[],currentLedger:null}};
    let cash=sim.finance.treasury;const rows=[];
    for(let i=1;i<=years;i++){
      sim.turnIndex=state.turnIndex+i;advancePortfolio(sim);sim.population.derived=Population.derive(sim);
      const forecast=getAnnualForecast(sim,sim.turnIndex);cash=round2(cash+forecast.netOperating);
      const principal=round2(Math.min(Recovery.due(sim),sim.finance.debt));
      if(principal>0){cash=round2(cash-principal);sim.finance.debt=round2(sim.finance.debt-principal);Recovery.credit(sim,principal,'scheduled');}
      const reviewPrincipal=round2(Math.min(BudgetReview.due(sim),sim.finance.debt));
      if(reviewPrincipal>0){cash=round2(cash-reviewPrincipal);sim.finance.debt=round2(sim.finance.debt-reviewPrincipal);BudgetReview.credit(sim,reviewPrincipal,'scheduled');}
      rows.push({year:state.population.baseYear+sim.turnIndex,inflows:forecast.inflows,mandatory:forecast.mandatory,interest:forecast.debtService,programmeOpex:forecast.programmeOpex,...(Recovery.active(state)?{recoveryPrincipal:principal}:{}),...(BudgetReview.active(state)?{reviewPrincipal}:{}),net:round2(forecast.netOperating-principal-reviewPrincipal),cash,uncovered:round2(Math.max(0,-cash))});
    }
    return{assumption:'frozen-population-no-new-projects-no-rescue',rows,minimumCash:Math.min(state.finance.treasury,...rows.map(r=>r.cash)),openingCash:state.finance.treasury,reserveExcluded:state.finance.reserve,unfunded:rows.some(r=>r.cash<0)};
  }

  function getSummary(state) {
    const finance = state.finance;
    const current = finance.currentLedger;
    const latest = current || finance.lastClosedLedger;
    const debtRatio = finance.debtLimit > 0 ? finance.debt / finance.debtLimit : 0;
    const annualObligations = latest ? latest.outflows.mandatory + latest.outflows.debtService + latest.outflows.programmeOpex : finance.base.mandatoryCosts;
    const reserveCoverage = annualObligations > 0 ? finance.reserve / (annualObligations / 12) : 0;
    return {
      treasury: round2(finance.treasury),
      reserve: round2(finance.reserve),
      debt: round2(finance.debt),
      debtLimit: round2(finance.debtLimit),
      debtRatio,
      reserveCoverage,
      adminLoad: getAdminLoad(state),
      adminCapacity: finance.adminCapacity,
      programmeOpex: programmeOpex(state),
      operatingBalance: round2(finance.lastOperatingBalance),
      portfolio: finance.portfolio,
      activeProjects: finance.portfolio.filter(project => project.status !== 'completed'),
      currentLedger: current,
      latestLedger: latest,
      identity: latest ? verifyLedger(latest) : { ok: true, gap: 0 }
    };
  }

  function settleRecovery(state,id){
    const q=Recovery.quotes(state).find(q=>q.id===id);
    if(!q?.available)throw new Error('Recovery option unavailable');
    const f=state.finance,l=f.currentLedger;
    addFlow(l.outflows,'governanceSpending',q.bill);
    if(q.reserve){addFlow(l.inflows,'reserveDraw',q.reserve);f.reserve=round2(f.reserve-q.reserve);f.totalReserveDraw=round2(f.totalReserveDraw+q.reserve);}
    if(q.grant){addFlow(l.inflows,'federalCofinance',q.grant);f.totalFederalFunds=round2(f.totalFederalFunds+q.grant);}
    if(q.loan){addFlow(l.inflows,'borrowing',q.loan);f.debt=round2(f.debt+q.loan);f.totalBorrowed=round2(f.totalBorrowed+q.loan);}
    state.recovery.choice=id;state.recovery.settledTurn=state.turnIndex+1;
    const receipt={operation:'recovery-settlement',turn:state.turnIndex+1,caseId:Recovery.CASE,choice:id,bill:q.bill,own:q.own,reserve:q.reserve,grant:q.grant,loan:q.loan};
    l.decisions.push(receipt);recalculateLedger(state);l.closingReserve=f.reserve;l.closingDebt=f.debt;
    return deepClone(receipt);
  }
  function returnRecoveryGrant(state){
    const q=Recovery.grantReturnQuote(state);if(!q.available)throw new Error('Recovery grant return unavailable');
    const f=state.finance,l=f.currentLedger;
    addFlow(l.outflows,'governanceSpending',q.amount);state.recovery.grantReturnTurn=state.turnIndex+1;
    const receipt={operation:'recovery-grant-return',turn:state.turnIndex+1,amount:q.amount};l.decisions.push(receipt);recalculateLedger(state);
    return deepClone(receipt);
  }

  const Finance = {
    settleRecovery,returnRecoveryGrant,
    VERSION,
    treasuryOperationQuote,
    treasuryOperation,
    projectObligations,
    clamp,
    round1,
    round2,
    deepClone,
    createFinanceState,
    syncBudget,
    programmeOpex,
    getAdminLoad,
    getAnnualForecast,
    openTurn,
    closeTurn,
    getFundingOptions,
    getFundingPlan,
    applyFundingPlan,
    applyCostVariation,
    applyInstitutionCost,
    applyShock,
    addEmergencyTransfer,
    advancePortfolio,
    verifyLedger,
    getSummary,
    profileFor,
    renewalQuote,
    renewProgramme
  };

  root.GovernorGame = root.GovernorGame || {};
  root.GovernorGame.Finance = Finance;
  if (typeof module !== 'undefined' && module.exports) module.exports = Finance;
})(typeof window !== 'undefined' ? window : globalThis);
