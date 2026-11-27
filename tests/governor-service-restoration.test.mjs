import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {G, E, F, A, fresh, json, valid, advance, defer, firstPlan} from './helpers/governor-gameplay.mjs';

const browser = {GovernorGame:G};
browser.window = browser;
vm.createContext(browser);
for (const file of ['src/i18n.js','locales/zh-Hans.js']) {
  vm.runInContext(await fs.readFile(new URL('../site/apps/governor/' + file,import.meta.url),'utf8'),browser);
}
G.I18n.install(G.DATA);

function busState(options = {}) {
  const s = fresh(options);
  if (A.open(s)) E.chooseAgenda(s, 'school-neighbourhood');
  else while (E.getCurrentMission(s).id !== 'school-neighbourhood') defer(s);
  const plan = E.previewAction(s, 'school-bus', 'treasury', null, []);
  E.commitAction(s, 'school-bus', 'treasury', plan.placement?.id, []);
  advance(s);
  return s;
}

function waitForExpiry(s) {
  while (s.finance.portfolio[0].status !== 'completed') defer(s);
}

function reopenQuote(s) {
  return E.restorationQuote(s, s.finance.portfolio[0].id);
}

function resumed(s) {
  const copy = E.restoreState(E.serialiseState(s));
  assert.ok(copy);
  valid(copy, 'restored snapshot');
  return copy;
}

test('a closed school bus can return after a full year, paying its original operating rate exactly once per year', () => {
  const s = busState({budgetMode:'decisions'});
  waitForExpiry(s);
  const idle = resumed(s);
  const old = json(s.finance.portfolio[0]);
  const q = reopenQuote(s);
  assert.ok(q.available && q.eligible);
  assert.equal(q.fee, 0.17);
  assert.equal(q.timelyFee, 0.06);
  assert.equal(q.futureCommitment, 0.66);
  assert.equal(q.annualOpex, 0.22);
  assert.equal(q.reopenYear, s.population.baseYear + s.turnIndex + 1);
  const {record} = E.restoreProgramme(s, old.id);
  assert.equal(record.restoration.reopenYear, q.reopenYear);
  assert.equal(s.history.length, idle.history.length + 1);
  assert.equal(s.finance.currentLedger.outflows.renewalFees, q.fee);
  assert.equal(s.finance.currentLedger.outflows.actionSpending, 0);
  assert.equal(s.finance.currentLedger.outflows.programmeOpex, 0);
  assert.equal(s.finance.portfolio.length, 1);
  assert.equal(s.finance.portfolio[0].status, 'completed');
  assert.equal(s.finance.portfolio[0].activatedTurn, old.activatedTurn);
  assert.deepEqual(json(s.finance.portfolio[0].paidTurns), old.paidTurns);
  assert.deepEqual(json(s.finance.portfolio[0].people), old.people);
  assert.equal(record.project, null);
  assert.equal(record.districtId, old.districtId);
  assert.equal(record.effects.budget, -q.fee);
  const signed = E.serialiseState(s);
  assert.throws(() => E.restoreProgramme(s, old.id));
  assert.throws(() => E.commitAction(s, A.OPERATIONS.actions[0].id, 'treasury'));
  assert.equal(E.serialiseState(s), signed);
  const prediction = F.projectObligations(s, 4);
  assert.deepEqual(json(prediction.rows.map(row => row.programmeOpex)), [.22,.22,.22,0]);
  const continued = resumed(s);
  advance(continued);
  advance(s);
  defer(idle);
  assert.deepEqual(json(s.finance), json(continued.finance));
  assert.deepEqual(json(s.population), json(continued.population));
  assert.ok(s.population.derived.municipalities.suburb.schoolAccess > idle.population.derived.municipalities.suburb.schoolAccess);
  assert.deepEqual(json(G.ProjectState.outputs(s.finance.portfolio[0], q.reopenTurn)), old.people.outputs);
  assert.equal(s.finance.portfolio[0].yearsRemaining, 3);
  assert.equal(s.finance.currentLedger.outflows.programmeOpex, q.annualOpex);
  assert.equal(s.finance.portfolio[0].activatedTurn, old.activatedTurn);
  for (let i = 0; i < 3; i++) defer(s);
  const project = s.finance.portfolio[0];
  assert.equal(project.status, 'completed');
  assert.deepEqual(json(project.paidTurns), [...old.paidTurns,q.reopenTurn,q.reopenTurn+1,q.reopenTurn+2]);
  const accounts = s.finance.ledgers.filter(l => l.turn >= q.reopenTurn);
  assert.equal(F.round2(accounts.reduce((sum,l) => sum + l.outflows.programmeOpex, 0)), q.futureCommitment);
  assert.ok(s.finance.ledgers.every(l => F.verifyLedger(l).ok));
  assert.deepEqual(json(G.ProjectState.outputs(project,s.turnIndex+1)), {});
  E.restoreProgramme(s, project.id);
  advance(s);
  assert.equal(s.finance.portfolio.length, 1);
  assert.equal(s.finance.portfolio[0].restorations.length, 2);
  assert.ok(resumed(s));
});

test('a recovery leaves other agenda questions open and the guided calendar resumes on schedule', () => {
  for (const campaignMode of ['agenda', 'guided']) {
    const s = busState({campaignMode});
    waitForExpiry(s);
    const turn = s.turnIndex + 1;
    const choices = A.pending(s).map(t => t.id);
    const current = E.getCurrentMission(s).id;
    if (A.open(s) && choices.length) E.chooseAgenda(s, choices[0]);
    const {record} = E.restoreProgramme(s, s.finance.portfolio[0].id);
    assert.equal(record.missionId, campaignMode === 'agenda' ? A.OPERATIONS.id : current);
    assert.equal(record.turn, turn);
    for (const lang of ['ru','en','zh']) {
      const report = E.buildReport(s,lang).decisions.at(-1);
      assert.ok(report.restoration);
      assert.equal(report.action, {
        ru:'Восстановление · Школьный автобус',
        en:'Restoration · School bus service',
        zh:'恢复服务 · 校车线路'
      }[lang]);
    }
    advance(s);
    assert.equal(s.turnIndex,turn);
    if (A.open(s)) assert.ok(choices.every(id => A.pending(s).some(t => t.id === id)));
    else assert.equal(E.getCurrentMission(s).id,G.DATA.missions[turn].id);
  }
});

test('timely renewal still costs a quarter of one operating year and does not consume the decision', () => {
  const s = busState();
  const id = s.finance.portfolio[0].id;
  while(s.finance.portfolio[0].yearsRemaining !== 1) defer(s);
  assert.equal(reopenQuote(s).available,false);
  const before = s.history.length;
  const q = E.renewalQuote(s,id);
  assert.ok(q.available);
  const charge = E.renewProgramme(s,id);
  assert.equal(charge.fee,q.fee);
  assert.equal(s.history.length,before);
  assert.equal(s.awaitingContinue,false);
  defer(s);
  assert.equal(s.finance.portfolio[0].status,'active');
  assert.equal(s.finance.portfolio[0].yearsRemaining,3);
  assert.equal(s.finance.portfolio[0].restorations,undefined);
});

test('financial and administrative limits, final year, active services and duplicate claims are enforced without mutation', () => {
  const s = busState();
  const id = s.finance.portfolio[0].id;
  assert.equal(reopenQuote(s).reason,'service-unavailable');
  waitForExpiry(s);
  const poor = resumed(s);
  E.treasuryOperation(poor,'reserve',poor.finance.treasury);
  const capped = resumed(s);
  capped.finance.adminCapacity = .1;
  const last = resumed(s);
  while(last.turnIndex < 19) defer(last);
  for(const [state,reason] of [[poor,'treasury'],[capped,'capacity'],[last,'term-ended']]){
    assert.equal(reopenQuote(state).reason,reason);
    const before = E.serialiseState(state);
    assert.throws(() => E.restoreProgramme(state,id),new RegExp(reason));
    assert.equal(E.serialiseState(state),before);
  }
  assert.equal(E.restorationQuote(s,'missing').eligible,false);
  E.restoreProgramme(s,id);
  const corrupt = json(s);
  corrupt.finance.currentLedger.decisions.find(d => d.operation === 'restoration').fee += 1;
  assert.equal(E.restoreState(corrupt),null);
  for (const tamper of [
    x => { x.finance.portfolio[0].restorations[0].fee = -1; },
    x => { x.history.at(-1).restoration.projectId = 'invented-service'; },
    x => { x.finance.portfolio[0].restorations.push(x.finance.portfolio[0].restorations[0]); },
    x => { x.finance.portfolio[0].restorations[0].reopenTurn++; },
  ]) {
    const changed = json(s);
    tamper(changed);
    assert.equal(E.restoreState(changed),null);
  }
  const lost = json(s);
  lost.history.at(-1).restoration = null;
  assert.equal(E.restoreState(lost),null);
});

test('reopening preserves the original activation and construction bonuses', () => {
  const seed = busState();
  waitForExpiry(seed);
  const id = seed.finance.portfolio[0].id;
  E.restoreProgramme(seed,id);
  const projected = json(seed);
  projected.turnIndex += 1;
  const lifecycle = F.advancePortfolio(projected);
  const p = projected.finance.portfolio[0];
  assert.equal(lifecycle.events.filter(e=>e.restoration && e.projectId===id).length,1);
  assert.equal(lifecycle.effects.support,F.round2(p.annualEffects.support * .15));
  assert.equal(lifecycle.effects.development,F.round2(p.annualEffects.development * .30));
  assert.deepEqual(json(lifecycle.resilience),{});
  assert.equal(p.activatedTurn,seed.finance.portfolio[0].activatedTurn);
});

test('ending and report count annual launches, restored services and other years separately in all languages', () => {
  for (const holdLastYear of [false,true]) {
    const state=busState({seed:'RUDN-2026'});
    let restorations=0;
    while(!state.completed){
      if(holdLastYear && state.turnIndex===19){ defer(state); continue; }
      if(restorations<2 && reopenQuote(state).available){
        E.restoreProgramme(state,state.finance.portfolio[0].id);
        restorations++;
      } else {
        let plan=null;
        for(const topic of A.pending(state)){
          E.chooseAgenda(state,topic.id);
          plan=firstPlan(state);
          if(plan)break;
        }
        assert.ok(plan);
        E.commitAction(state,plan.action.id,plan.plan.id,plan.placement?.id);
      }
      advance(state);
    }
    const idle=holdLastYear?1:0,starts=18-idle;
    assert.equal(state.history.length,20);
    assert.equal(restorations,2);
    assert.equal(state.history.filter(row=>!row.deferred).length,starts);
    const expected={
      ru:`Годы с новой мерой — ${starts}, с восстановлением службы — 2, без запуска и восстановления — ${idle}.`,
      en:`New measures — ${starts}. Service restorations — 2. Years with neither — ${idle}.`,
      zh:`任期内有${starts}年采取新措施，2年恢复服务，${idle}年既未启动新措施也未恢复服务。`
    };
    const ending=E.getEnding(state);
    for(const [locale,intro] of Object.entries(expected)){
      assert.ok(ending.description[locale].startsWith(intro));
      assert.equal(E.buildReport(state,locale).final.ending.description,ending.description[locale]);
    }
  }
});
