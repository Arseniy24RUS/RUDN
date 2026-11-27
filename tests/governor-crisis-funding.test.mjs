import test from 'node:test';
import assert from 'node:assert/strict';
import {G, E, F, A, fresh, json, valid, advance, defer} from './helpers/governor-gameplay.mjs';

function floodReview() {
  const s = fresh({scenarioId:'infrastructure', seed:'RUDN-2026', budgetMode:'decisions'});
  while(s.turnIndex < 11) defer(s);
  E.treasuryOperation(s,'reserve',s.finance.treasury);
  E.chooseAgenda(s,A.OPERATIONS.id);
  E.commitAction(s,A.OPERATIONS.actions[0].id,'treasury');
  const before = json(s.finance);
  E.advanceTurn(s);
  assert.equal(s.turnIndex,11);
  assert.deepEqual(json(s.finance),before);
  assert.equal(s.budgetReview.pending.event.reason,'crisis');
  assert.equal(s.budgetReview.pending.event.missionId,'major-flood');
  assert.equal(s.budgetReview.pending.event.amount,2.44);
  return s;
}

test('flood debits match the selected source, also after restoring a suspended budget decision', () => {
  const suspended = floodReview();
  for (const choice of ['reserve','loan','grant']) {
    const s = E.restoreState(E.serialiseState(suspended));
    E.resolveBudgetReview(s,choice);
    const ledger = s.finance.currentLedger;
    const shock = s.currentEntry.finance;
    assert.deepEqual(json(shock),{
      missionId:'major-flood', totalCost:4.02, reserveUsed:choice==='reserve'?2.44:0,
      debtIssued:choice==='loan'?2.44:0, emergencyTransfer:choice==='grant'?2.44:0, treasuryImpact:-1.58
    });
    assert.deepEqual(json(ledger.shocks[0]),json(shock));
    assert.equal(ledger.outflows.crisisSpending,4.02);
    assert.equal(ledger.inflows.reserveDraw,shock.reserveUsed);
    assert.equal(ledger.inflows.borrowing,shock.debtIssued);
    assert.equal(ledger.inflows.emergencyTransfer,shock.emergencyTransfer);
    assert.equal(F.round2(shock.reserveUsed + shock.debtIssued + shock.emergencyTransfer - shock.treasuryImpact),shock.totalCost);
    assert.ok(F.verifyLedger(ledger).ok);
    assert.equal(s.currentEntry.effects.budget,shock.treasuryImpact);
    assert.equal(s.currentEntry.effects.reserve,F.round2(-shock.reserveUsed));
    valid(s,'closed flood decision');
  }
});

function oldShockCopy(shock) {
  shock.reserveUsed = 0;
  shock.treasuryImpact = -shock.totalCost;
}

function staleEntry(entry) {
  if (!entry) return;
  oldShockCopy(entry.finance);
  entry.effects.budget = entry.finance.treasuryImpact;
  entry.effects.reserve = 0;
}

test('legacy manual-budget snapshots recover exact active and archived flood display figures without changing transactions', () => {
  const s = floodReview();
  E.resolveBudgetReview(s,'reserve');
  const actual = json(s.currentEntry.finance);
  const active = json(s);
  staleEntry(active.currentEntry);
  oldShockCopy(active.finance.currentLedger.shocks[0]);
  const fixed = E.restoreState(active);
  assert.deepEqual(json(fixed.currentEntry.finance),actual);
  assert.deepEqual(json(fixed.finance.currentLedger),json(s.finance.currentLedger));
  assert.equal(fixed.finance.treasury,active.finance.treasury);
  defer(s);
  const archived = json(s);
  const year = archived.history[12];
  staleEntry(year.entry);
  for (const ledger of [year.fiscalLedger,archived.finance.lastClosedLedger,archived.finance.ledgers[12]]) oldShockCopy(ledger.shocks[0]);
  const repaired = E.restoreState(archived);
  assert.deepEqual(json(repaired.history[12].entry.finance),actual);
  assert.deepEqual(json(repaired.finance.ledgers),json(s.finance.ledgers));
  assert.deepEqual(json(repaired.history[12].fiscalLedger),json(s.history[12].fiscalLedger));
  assert.deepEqual(json(repaired.finance.lastClosedLedger),json(s.finance.lastClosedLedger));
  assert.equal(repaired.history[12].entry.effects.budget,-1.58);
  assert.equal(repaired.history[12].entry.effects.reserve,-2.44);
  assert.deepEqual(json(repaired.budgetReview),json(s.budgetReview));
  assert.deepEqual(json(repaired.population),json(s.population));
  assert.deepEqual(json(E.restoreState(repaired).finance),json(repaired.finance));
});

test('automatic-budget crisis coverage still separates its own reserve and treasury contributions', () => {
  const s = fresh({scenarioId:'infrastructure',seed:'RUDN-2026'});
  while(s.turnIndex < 12) defer(s);
  const shock = s.currentEntry.finance;
  assert.equal(shock.missionId,'major-flood');
  assert.ok(F.verifyLedger(s.finance.currentLedger).ok);
  assert.equal(F.round2(shock.reserveUsed+shock.debtIssued+shock.emergencyTransfer-shock.treasuryImpact),shock.totalCost);
  assert.deepEqual(json(E.restoreState(s).currentEntry.finance),json(shock));
});
