/* Five addresses: a deterministic narrative projection of existing simulation records.
 * Only state.stories is written. No time, money, population, RNG, score or policy is changed.
 * Snapshots use the end-of-year population ledger, never invented individual agent events.
 */
(function (root) {
  'use strict';
  const DATA = root.GovernorGame?.StoriesData || (typeof require === 'function' ? require('./stories-data.js') : null);
  if (!DATA) throw new Error('StoriesData must be loaded before stories.js');
  const VERSION = DATA.version;
  const clone = value => JSON.parse(JSON.stringify(value));
  const METRICS = ['healthAccess','schoolAccess','childcareAccess','employment','housingAccess','digitalAccess','mobility','floodProtection','digitalProtection'];
  const local = (v, lang) => root.GovernorGame.I18n ? root.GovernorGame.I18n.local(v,lang) : v?.[lang] || v?.ru || '';
  const find = id => DATA.arcs.find(a => a.id === id);
  const key = (id, phase) => `${id}:${phase}`;
  const finishedTurns = state => state?.population?.ledgers?.length || 0;

  function fresh() {
    return {version: VERSION, snapshots: {}, answers: {}, endingsRead: [], tracked: null};
  }

  function snapshot(state, arc, phase) {
    const turn = arc.turns[phase];
    const ledger = state.population.ledgers[turn - 1];
    const district = ledger?.after?.municipalities?.[arc.districtId];
    if (!district) throw new Error(`Missing recorded population evidence for ${arc.id}, turn ${turn}`);
    const rows = state.population.ledgers.slice(Math.max(0, turn - 3), turn);
    return {
      turn, year: ledger.year + 1, age: arc.age + turn,
      source: `population.ledgers[${turn - 1}].after.municipalities.${arc.districtId}`,
      metrics: Object.fromEntries(METRICS.map(k => [k, Number(district[k] || 0)])),
      recent: rows.map(row => ({year: row.year + 1, metrics: Object.fromEntries(METRICS.map(k => [k, Number(row.after.municipalities[arc.districtId][k] || 0)]))})),
      population: district.population,
      decisions: state.history.filter(r => r.turn <= turn && arc.related.includes(r.missionId)).map(r => ({
        turn: r.turn, missionId: r.missionId, actionId: r.actionId, outcome: r.delivery?.id || 'on-time',
        fundingMode: r.fundingMode, placementId: r.placement?.id || null
      }))
    };
  }

  function sync(state) {
    if (!state?.population?.ledgers || !Array.isArray(state.history)) return null;
    if (!state.stories) state.stories = fresh();
    if (state.stories.version !== VERSION) throw new Error('Unsupported stories version');
    for (const arc of DATA.arcs) {
      for (let phase = 0; phase < 3; phase++) {
        const id = key(arc.id, phase);
        if (finishedTurns(state) >= arc.turns[phase] && (phase < 2 || state.completed) && !state.stories.snapshots[id]) {
          state.stories.snapshots[id] = snapshot(state, arc, phase);
        }
      }
    }
    return state.stories;
  }

  function phaseAvailable(state, arcId, phase) {
    const arc = find(arcId), s = state?.stories;
    return Boolean(arc && Number.isInteger(phase) && phase >= 0 && phase < 3 && s?.snapshots[key(arcId, phase)]
      && (phase === 0 || s.answers[key(arcId, phase - 1)]));
  }

  function nextPhase(state, id) {
    if (!find(id)) return null;
    for (let i = 0; i < 3; i++) {
      const done = i < 2 ? state.stories?.answers[key(id,i)] : state.stories?.endingsRead.includes(id);
      if (!done && phaseAvailable(state,id,i)) return i;
    }
    return null;
  }

  function list(state) {
    return DATA.arcs.map(arc => ({
      id: arc.id, districtId: arc.districtId, phase: nextPhase(state,arc.id),
      started: Boolean(state.stories?.answers[key(arc.id,0)]),
      finished: Boolean(state.stories?.endingsRead.includes(arc.id)),
      answered: [0,1].filter(i => state.stories?.answers[key(arc.id,i)]).length,
      unlocked: Boolean(state.stories?.snapshots[key(arc.id,0)]),
      tracked: state.stories?.tracked === arc.id
    }));
  }

  function answer(state, arcId, phase, choiceId) {
    const arc = find(arcId);
    if (!arc || ![0,1].includes(phase)) throw new Error('Unknown story episode');
    if (!phaseAvailable(state,arcId,phase)) throw new Error('This episode is not available yet');
    const options = phase === 0 ? arc.routes : arc.followups;
    if (!options.some(o => o.id === choiceId)) throw new Error('Unknown story choice');
    const id = key(arcId,phase), old = state.stories.answers[id];
    if (old) {
      if (old.choiceId !== choiceId) throw new Error('An answered letter cannot be rewritten');
      return clone(old); // Idempotent confirmation never grants or repeats anything.
    }
    const reply = {choiceId, recordedAtTurn: finishedTurns(state), sourceTurn: arc.turns[phase]};
    state.stories.answers[id] = reply;
    if (phase === 0) state.stories.tracked = arcId;
    return clone(reply);
  }

  function track(state, id) {
    if (id !== null && (!find(id) || !state.stories?.answers[key(id,0)])) throw new Error('Meet this resident first');
    state.stories.tracked = id;
  }

  function assess(state, arcId, phase=2) {
    const arc = find(arcId), s = state.stories;
    const sn = s?.snapshots[key(arcId,phase)];
    const start = s?.snapshots[key(arcId,0)];
    if (!arc || !sn || !start) return null;
    const routeId = s.answers[key(arcId,0)]?.choiceId || 'near';
    const rule = arc.metrics[routeId];
    const follow = s.answers[key(arcId,1)]?.choiceId || 'today';
    const recentValues = sn.recent.map(r => r.metrics[rule.key]);
    // The lasting lens uses the worst of three years, not a misleading average.
    const value = follow === 'lasting' ? Math.min(...recentValues) : sn.metrics[rule.key];
    const baseline = start.metrics[rule.key];
    const grade = value >= rule.good ? 'steady' : value >= rule.watch ? 'fragile' : 'unresolved';
    return {grade, routeId, follow, metricKey: rule.key, label: clone(rule.label), baseline,
      current: sn.metrics[rule.key], value, change: value - baseline, benchmark: rule.good, watch: rule.watch,
      years: sn.recent.map(r => r.year), recentValues,
      endingId: `${arc.id}/${routeId}/${follow}/${grade}`,
      explanation: 'Narrative thresholds, not empirical standards; last-three-years lens uses their minimum.'};
  }

  function openingForRoute(state, arc) {
    // Open-agenda users may have opened the school before Olga's fifth-year
    // letter. Do not narrate a fixed failure that their actual path avoided.
    if (state.agenda?.mode === 'agenda' && arc.id === 'olga') return {
      ru: 'Когда Ольга переезжала в Новый берег, сыну было шесть. За пять лет изменились и район, и семейное расписание. Теперь она предлагает посмотреть, что значит жизнь в пригороде на практике: где учиться ребёнку и как родителям добираться до работы. Она просит выбрать вопрос, к которому вы вернётесь спустя годы.',
      en: 'When Olga moved to New Bank, her son was six. Five years have changed both the area and the family schedule. She asks what suburban life now means in practice: where her child can study and how parents get to work. Choose the question you will return to in later years.'
    };
    return clone(arc.opening);
  }

  function scene(state, arcId, phase) {
    const arc = find(arcId);
    if (!phaseAvailable(state,arcId,phase)) return null;
    const sn = state.stories.snapshots[key(arcId,phase)];
    const response = state.stories.answers[key(arcId,phase)] || null;
    const assessment = assess(state,arcId,phase);
    const route = arc.routes.find(r => r.id === assessment.routeId);
    return {arc: clone(arc), phase, snapshot: clone(sn), response: clone(response), assessment,
      route: clone(route), final: phase === 2,
      title: phase === 0 ? clone(arc.title) : phase === 1 ? clone(arc.returnTitle) : clone(arc.endings[assessment.grade].title),
      body: phase === 0 ? openingForRoute(state, arc) : phase === 1 ? clone(arc.returning) : clone(arc.endings[assessment.grade].body),
      options: phase < 2 ? clone(phase === 0 ? arc.routes : arc.followups) : []};
  }

  function finish(state, arcId) {
    if (!phaseAvailable(state,arcId,2)) throw new Error('This ending is not available');
    if (!state.stories.endingsRead.includes(arcId)) state.stories.endingsRead.push(arcId);
    return assess(state,arcId,2);
  }

  function verify(state) {
    const s=state?.stories;
    if (!s) return []; // A valid Stage 5/6 state migrates without losing its numerical history.
    const errors=[];
    if(s.version!==VERSION || !s.snapshots || typeof s.snapshots!=='object' || Array.isArray(s.snapshots) || !s.answers || typeof s.answers!=='object' || Array.isArray(s.answers) || !Array.isArray(s.endingsRead)) return ['stories-schema'];
    const legal = new Set(DATA.arcs.flatMap(a=>[0,1,2].map(i=>key(a.id,i))));
    for(const id of Object.keys(s.snapshots)) {
      if (!legal.has(id)) {errors.push(`unknown-snapshot:${id}`);continue;}
      const [arcId,p]=id.split(':'),phase=Number(p),arc=find(arcId),sn=s.snapshots[id];
      if (!sn || sn.turn!==arc.turns[phase] || sn.turn>finishedTurns(state) || (phase===2&&!state.completed)) {errors.push(`snapshot-time:${id}`);continue;}
      try {if(JSON.stringify(sn)!==JSON.stringify(snapshot(state,arc,phase)))errors.push(`snapshot-evidence:${id}`);}catch(_){errors.push(`snapshot-ledger:${id}`);}
    }
    for(const [id,a] of Object.entries(s.answers)) {
      const [arcId,p]=id.split(':'),phase=Number(p),arc=find(arcId);
      if(!legal.has(id) || !arc || ![0,1].includes(phase) || !s.snapshots[id] || !a || !(phase===0?arc.routes:arc.followups).some(o=>o.id===a.choiceId)) {errors.push(`answer:${id}`);continue;}
      if(phase>0&&(!s.answers[key(arcId,phase-1)] || a.recordedAtTurn<s.answers[key(arcId,phase-1)].recordedAtTurn))errors.push(`answer-order:${id}`);
      if(!Number.isInteger(a.recordedAtTurn)||a.recordedAtTurn<arc.turns[phase]||a.recordedAtTurn>finishedTurns(state)||a.sourceTurn!==arc.turns[phase])errors.push(`answer-time:${id}`);
    }
    if(new Set(s.endingsRead).size!==s.endingsRead.length)errors.push('duplicate-ending');
    for(const id of s.endingsRead)if(!find(id)||!phaseAvailable(state,id,2))errors.push(`ending:${id}`);
    if(s.tracked!==null && (!find(s.tracked)||!s.answers[key(s.tracked,0)]))errors.push('tracked');
    return errors;
  }

  function report(state,language='ru') {
    return {version: VERSION, optional: true, affectsSimulation: false, individualAgents: false,
      snapshotConvention:'End of year, read from population ledgers; no invented individual migration or births.',
      residents: DATA.arcs.map(arc=>({id:arc.id,name:local(arc.name,language),district:arc.districtId,
        answers:[0,1].map(i=>state.stories?.answers[key(arc.id,i)] || null),
        snapshots:[0,1,2].map(i=>state.stories?.snapshots[key(arc.id,i)] || null),
        ending:state.stories?.endingsRead.includes(arc.id)?assess(state,arc.id,2):null}))};
  }

  function archiveEntry(state, runId) {
    if(!state.completed) return null;
    return {id:String(runId),...(state.recovery?{recoveryCase:state.recovery.caseId}:{}),sessionId:state.sessionId,seed:state.seed,scenarioId:state.scenarioId,challengeId:state.challengeId,
      campaignMode:state.agenda?.mode||'guided',storyVersion:VERSION,modelVersion:state.version,contentVersion:state.contentVersion,
      decisions:state.history.map(r=>({turn:r.turn,missionId:r.missionId,actionId:r.actionId,fundingMode:r.fundingMode,placementId:r.placement?.id||null})),
      endings:DATA.arcs.filter(a=>state.stories?.endingsRead.includes(a.id)).map(a=>({arcId:a.id,...assess(state,a.id,2)}))};
  }
  function comparable(a,b) {
    return Boolean(a&&b&&(a.recoveryCase||null)===(b.recoveryCase||null)&&['seed','scenarioId','challengeId','modelVersion','contentVersion','storyVersion','campaignMode'].every(k=>a[k]===b[k]));
  }
  function remember(archive,entry) {
    if(!entry)return Array.isArray(archive)?clone(archive):[];
    const out=(Array.isArray(archive)?archive:[]).filter(x=>x&&typeof x.id==='string'&&x.id!==entry.id);
    out.push(clone(entry));return out.slice(-12);
  }
  const API={VERSION,DATA,fresh,sync,list,find,nextPhase,phaseAvailable,answer,track,assess,scene,finish,verify,report,archiveEntry,comparable,remember};
  root.GovernorGame=root.GovernorGame||{};root.GovernorGame.Stories=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
