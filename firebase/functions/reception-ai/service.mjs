import {randomUUID} from 'node:crypto';
import {ReceptionError, fail, fields, identifier, string, locale, localized, copy, hash, validateCase, validateDecision, evaluateDecision, actorCase,MAX_CATALOG_CASES} from './schema.mjs';
import {validateActorTurn, estimateReservation, costMicros} from './provider.mjs';
import {selectShiftCases} from './selection.mjs';

const DEFAULTS = {maxMessageChars: 2400, maxTurnsPerCase: 24, maxInputAllowance: 80000, maxOutputTokens: 650,
  dailyBudgetMicros: 2_000_000, monthlyBudgetMicros: 20_000_000, studentDailyBudgetMicros: 1_000_000,
  maxConcurrent: 8, maxDailyTurnsPerStudent: 240, maxDailyStartsPerStudent: 20, leaseMs: 45000, providerTimeoutMs: 30000};
const allowed = {
  start: ['op', 'studentKey', 'mode', 'locale', 'requestId', 'caseId'], resume: ['op', 'sessionId'],
  message: ['op', 'sessionId', 'text', 'requestId', 'expectedRevision'], document: ['op', 'sessionId', 'documentId', 'requestId'],
  decide: ['op', 'sessionId', 'decision', 'requestId'], followup:['op','sessionId','requestId','choiceId'], next: ['op', 'sessionId', 'requestId'], locale: ['op', 'sessionId', 'locale'], catalog: ['op', 'locale', 'studentKey']
};
const dayOf = n => new Date(n).toISOString().slice(0, 10), monthOf = n => dayOf(n).slice(0, 7);
const scopeOf = identity => identity.teacher ? `teacher:${identity.uid}` : `student:${identity.studentKey || identity.uid}`;
const values = rows => Array.isArray(rows) ? rows : Object.values(rows || {});
const normalizeSession = s => {
  // Realtime Database omits empty arrays/objects. Restore schema defaults after
  // every read; this also keeps emulator and memory adapters behavior aligned.
  if (!s) return s;
  s.requests ||= {}; s.results = values(s.results); s.caseStates = values(s.caseStates); s.caseData = values(s.caseData);
  for (const state of s.caseStates) {
    for (const key of ['messages', 'knownFactIds', 'releasedDocumentIds', 'openedDocumentIds']) state[key] = values(state[key]);
  }
  return s;
};

export function createReceptionService({store, cases, provider, clock = Date.now, config = {}, canStartAssessment = null, saveResult = null} = {}) {
  if (!store?.transaction || !store?.get || !provider?.generate) throw new TypeError('Reception adapters are required');
  const limits = {...DEFAULTS, ...config};
  if (limits.leaseMs <= limits.providerTimeoutMs + 3000) throw new TypeError('Lease must exceed provider timeout');
  for (const key of Object.keys(DEFAULTS)) if (!Number.isFinite(limits[key]) || limits[key] <= 0) throw new TypeError('Invalid reception limit');
  let catalogPromise;
  function catalogue() {
    // The HTTP adapter owns one service per immutable active catalog version.
    // Cache the in-flight read too: simultaneous cold requests must not load
    // and validate the entire bank once per request. Failures remain retryable.
    if(!catalogPromise)catalogPromise=(async()=>{
      const loaded=typeof cases==='function'?await cases():cases;
      if(!Array.isArray(loaded)||!loaded.length||loaded.length>MAX_CATALOG_CASES)fail('not_configured',503);
      const validated=loaded.map(validateCase);
      if(new Set(validated.map(c=>c.id)).size!==validated.length)fail('invalid_case',503);
      return validated;
    })().catch(error=>{catalogPromise=undefined;throw error;});
    return catalogPromise;
  }
  function checkIdentity(identity) {
    if (!identity || typeof identity.uid !== 'string' || !identity.uid || identity.uid.length > 150) fail('auth', 401);
    if (!identity.teacher && !identity.studentKey) fail('profile_required', 403);
  }
  function own(session, identity) {
    if (!session) fail('not_found', 404);
    if (session.owner !== scopeOf(identity)) fail('forbidden', 403);
  }
  async function get(id, identity) {
    identifier(id); const s = normalizeSession(await store.get(`sessions/${id}`)); own(s, identity); return s;
  }
  function view(session) {
    const s = normalizeSession(copy(session)), c = s.caseData[s.caseIndex], state = s.caseStates[s.caseIndex];
    const p = localized(c.public, s.locale);
    const result = s.status === 'complete' ? {points: s.result.points, maxPoints: 5, total: s.result.total, cap:s.result.cap||null, attemptId: s.result.attemptId,
      journalStatus: s.teacher || s.mode === 'training' || provider.name === 'mock' || typeof saveResult !== 'function' ? 'local' : s.journalSaved ? 'saved' : 'pending',
      cases: s.results.map((r, i) => ({caseId: s.caseData[i].id, title: localized(s.caseData[i].public.title, s.locale), score: r.score,
        feedback: localized(r, s.locale), decision: s.caseStates[i].decision,followupChoiceId:s.caseStates[i].followupChoiceId||null}))} : null;
    return {id: s.id, revision: s.revision, mode: s.mode, locale: s.locale, caseIndex: s.caseIndex, caseCount: s.caseData.length,
      status: s.status, case: {id: c.id, ...p}, messages: state.messages,
      documents: c.documents.filter(d => state.releasedDocumentIds.includes(d.id)).map(d => localized({id: d.id, title: d.title, type: d.type, text: d.text,
        ...(d.image?{image:d.image}:{}),...(d.url?{url:d.url}:{}),...(d.sensitive!==undefined?{sensitive:d.sensitive}:{})}, s.locale)),
      openedDocumentIds: state.openedDocumentIds, decision: state.decision || null,
      followup:s.status==='followup'&&c.followup?localized({intro:c.followup.intro,options:c.followup.options},s.locale):null,
      followupChoiceId:state.followupChoiceId||null,
      feedback: s.mode === 'training' && state.feedback ? localized(state.feedback, s.locale) : null, result, provider: provider.name};
  }
  const response = s => ({ok: true, view: view(s)});
  function initialState(c, language, timestamp) {
    return {messages: [{id: `opening-${c.id}`, role: 'assistant', text: localized(c.public.opening, language), at: timestamp}],
      knownFactIds: c.facts.filter(f => f.initial).map(f => f.id), releasedDocumentIds: c.documents.filter(d => d.initial).map(d => d.id),
      openedDocumentIds: [], turns: 0, decision: null, feedback: null};
  }
  async function start(body, identity) {
    identifier(body.requestId); const language = locale(body.locale), mode = body.mode;
    if (!['training', 'independent'].includes(mode)) fail('invalid_mode');
    if (body.studentKey && body.studentKey !== identity.studentKey && !identity.teacher) fail('forbidden', 403);
    if (provider.ready === false) fail('not_configured', 503);
    const owner = scopeOf(identity), id = hash(`${owner}:${body.requestId}`).slice(0, 40), signature = hash(body);
    const existing = normalizeSession(await store.get(`sessions/${id}`));
    if (existing) { own(existing, identity); if (existing.startSignature !== signature) fail('request_conflict', 409); return response(existing); }
    const timestamp = clock(), day = dayOf(timestamp), ownerKey = hash(owner);
    if (mode === 'independent' && !identity.teacher && canStartAssessment && !await canStartAssessment(timestamp)) fail('assessment_closed', 403);
    const all = await catalogue();
    if (mode === 'independent' && new Set(all.map(c=>c.familyId||c.id)).size < 8) fail('pilot_incomplete', 503);
    if (body.caseId && (mode !== 'training' || !all.some(c => c.id === body.caseId))) fail('invalid_case');
    const grant = await store.transaction(`starts/${day}/${ownerKey}`, old => {
      const value = old || {ids: {}}; value.ids ||= {};
      if (value.ids[id]) return value;
      if (Object.keys(value.ids).length >= limits.maxDailyStartsPerStudent) return undefined;
      value.ids[id] = true; return value;
    });
    if (!grant.committed) fail('daily_limit', 429);
    const selected=selectShiftCases(all,id,{count:mode==='independent'?8:1,caseId:body.caseId});
    const session = {schema: 1, id, owner, studentKey: identity.studentKey || null, uid: identity.uid, teacher: Boolean(identity.teacher),
      mode, locale: language, startedAt: timestamp, updatedAt: timestamp, revision: 1, status: 'active', caseIndex: 0,
      caseData: selected, caseStates: selected.map(c => initialState(c, language, timestamp)), results: [], requests: {},
      startSignature: signature, lease: null, result: null, journalSaved: false};
    const created = await store.transaction(`sessions/${id}`, old => old || session);
    const out = normalizeSession(created.value);
    if (out.startSignature !== signature) fail('request_conflict', 409);
    return response(out);
  }

  // This ledger is entirely server-owned. Reservations are charged pessimistically
  // before a provider call. A crash or ambiguous timeout never refunds spent money.
  async function reserve(session, requestId, amount) {
    const now = clock(), day = dayOf(now), month = monthOf(now), owner = hash(session.owner), token = hash(`${session.id}:${requestId}`).slice(0, 40);
    const result = await store.transaction('budget', prior => {
      const b = prior || {}; b.days ||= {}; b.months ||= {}; b.active ||= {}; b.reservations ||= {};
      for (const [key, value] of Object.entries(b.active)) if (value.expiresAt <= now) delete b.active[key];
      // Keep billing aggregates and recent receipts bounded. Expired receipts are
      // never treated as refunds; a session request ledger prevents replay.
      for (const [key, value] of Object.entries(b.reservations)) if (value.createdAt < now - 3 * 86400000) delete b.reservations[key];
      for (const key of Object.keys(b.days)) if (key < dayOf(now - 32 * 86400000)) delete b.days[key];
      for (const key of Object.keys(b.months)) if (key < monthOf(now - 370 * 86400000)) delete b.months[key];
      if (b.reservations[token]) return undefined;
      const d = b.days[day] ||= {micros: 0, owners: {}}, m = b.months[month] ||= {micros: 0}; d.owners ||= {};
      const o = d.owners[owner] ||= {micros: 0, turns: 0};
      if (Object.keys(b.active).length >= limits.maxConcurrent || d.micros + amount > limits.dailyBudgetMicros || m.micros + amount > limits.monthlyBudgetMicros || o.micros + amount > limits.studentDailyBudgetMicros || o.turns >= limits.maxDailyTurnsPerStudent) return undefined;
      d.micros += amount; m.micros += amount; o.micros += amount; o.turns++;
      b.active[token] = {expiresAt: now + limits.leaseMs};
      b.reservations[token] = {amount, day, month, owner, createdAt: now, settled: false}; return b;
    });
    if (!result.committed) fail('budget_or_rate_limit', 429);
    return token;
  }
  async function settle(token, usage) {
    await store.transaction('budget', b => {
      if (!b?.reservations?.[token]) return undefined;
      const r = b.reservations[token]; if (r.settled) return undefined;
      const valid = Number.isSafeInteger(usage?.inputTokens) && usage.inputTokens >= 0 && Number.isSafeInteger(usage?.outputTokens) && usage.outputTokens >= 0;
      const actual = valid ? costMicros(usage.inputTokens, usage.outputTokens) : r.amount;
      const delta = actual - r.amount;
      if (b.days?.[r.day]) { b.days[r.day].micros += delta; if (b.days[r.day].owners?.[r.owner]) b.days[r.day].owners[r.owner].micros += delta; }
      if (b.months?.[r.month]) b.months[r.month].micros += delta;
      r.settled = true; r.chargedMicros = actual; r.usage = valid ? usage : null;
      if (b.active) delete b.active[token]; return b;
    });
  }
  async function mutate(body, identity, update) {
    const requestId = identifier(body.requestId), digest = hash(body), timestamp = clock();
    let failure;
    const result = await store.transaction(`sessions/${identifier(body.sessionId)}`, old => {
      const s = normalizeSession(old); try {
        own(s, identity);
        if (s.lease && s.lease.until > timestamp) fail('busy', 409);
        const request = Object.hasOwn(s.requests, requestId) ? s.requests[requestId] : null;
        if (request) { if (request.digest !== digest) fail('request_conflict', 409); if (request.status !== 'done') fail('request_failed', 409); return s; }
        if (s.status === 'complete') fail('completed', 409);
        update(s); s.requests[requestId] = {digest, status: 'done'}; s.revision++; s.updatedAt = timestamp; return s;
      } catch (error) { failure = error; return undefined; }
    });
    if (!result.committed) throw failure || new ReceptionError('conflict', 409);
    return normalizeSession(result.value);
  }
  async function deliverResult(s) {
    if (s.status === 'complete' && !s.journalSaved && s.mode === 'independent' && !s.teacher && provider.name !== 'mock' && typeof saveResult === 'function') {
      try {
        await saveResult({sessionId: s.id, studentKey: s.studentKey, uid: s.uid, result: copy(s.result), startedAt: s.startedAt, completedAt: s.updatedAt,
          cases: s.caseData.map(c => ({id: c.id, version: c.version,...(c.datePackId?{datePackId:c.datePackId}:{}),...(c.familyId?{familyId:c.familyId}:{})})),
          decisions: s.caseStates.map(state => state.followupChoiceId?{...state.decision,followupChoiceId:state.followupChoiceId}:state.decision)});
        await store.transaction(`sessions/${s.id}`, old => old ? {...old, journalSaved: true} : undefined); s.journalSaved = true;
      } catch { /* The immutable completed shift remains resumable; retry receipt on resume. */ }
    }
    return s;
  }
  async function message(body, identity) {
    const requestId = identifier(body.requestId), text = string(body.text, limits.maxMessageChars), digest = hash(body), timestamp = clock(), leaseId = randomUUID();
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) fail('invalid_revision');
    let failure, duplicate = false;
    const acquired = await store.transaction(`sessions/${identifier(body.sessionId)}`, old => {
      const s = normalizeSession(old); try {
        own(s, identity); const prior = Object.hasOwn(s.requests, requestId) ? s.requests[requestId] : null;
        if (prior) {
          if (prior.digest !== digest) fail('request_conflict', 409);
          if (prior.status === 'done') { duplicate = true; return s; }
          if (prior.status === 'pending' && s.lease?.until > timestamp) fail('busy', 409);
          // An expired in-flight request may have reached OpenAI. Never call it a
          // second time under the same request ID or fabricate an unpaid result.
          fail(prior.status === 'pending' ? 'request_interrupted' : 'request_failed', 409);
        }
        if (s.lease && s.lease.until > timestamp) fail('busy', 409);
        if (s.status !== 'active') fail('not_active', 409);
        if (s.revision !== body.expectedRevision) fail('revision_conflict', 409);
        if (s.caseStates[s.caseIndex].turns >= limits.maxTurnsPerCase) fail('case_turn_limit', 429);
        s.lease = {id: leaseId, requestId, until: timestamp + limits.leaseMs}; s.requests[requestId] = {digest, status: 'pending'}; return s;
      } catch (error) { failure = error; return undefined; }
    });
    if (!acquired.committed) throw failure || new ReceptionError('conflict', 409);
    const s = normalizeSession(acquired.value);
    if (duplicate) return response(s);
    const c = s.caseData[s.caseIndex], state = s.caseStates[s.caseIndex]; let reservation, usage;
    try {
      if (provider.ready === false) fail('not_configured', 503);
      const dossier = actorCase(c, s.locale); dossier.releasedDocumentIds = state.releasedDocumentIds;
      const estimate = estimateReservation({actorCase: dossier, messages: state.messages, text, locale: s.locale,
        maxOutputTokens: Math.max(limits.maxOutputTokens, provider.maxOutputTokens || 0), maxCalls: provider.maxCalls || 1});
      if (estimate.perCallInputTokens > limits.maxInputAllowance) fail('context_limit', 413);
      reservation = await reserve(s, requestId, estimate.micros);
      const controller = new AbortController(); let timeout;
      const deadline = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new ReceptionError('provider_unavailable', 503)); }, limits.providerTimeoutMs); });
      let generated;
      try { generated = await Promise.race([provider.generate({actorCase: dossier, messages: copy(state.messages), text, locale: s.locale, signal: controller.signal}), deadline]); }
      finally { clearTimeout(timeout); }
      usage = generated?.usage;
      const turn = validateActorTurn(generated, c, state, s.locale);
      const finished = await store.transaction(`sessions/${s.id}`, old => {
        const current = normalizeSession(old); if (!current || current.lease?.id !== leaseId) return undefined;
        const st = current.caseStates[current.caseIndex];
        st.messages.push({id: `${requestId}-user`, role: 'user', text, at: timestamp}, {id: `${requestId}-assistant`, role: 'assistant', text: turn.reply, at: clock()});
        st.knownFactIds = [...new Set([...st.knownFactIds, ...turn.revealedFactIds])];
        st.releasedDocumentIds = [...new Set([...st.releasedDocumentIds, ...turn.releasedDocumentIds])]; st.turns++;
        current.requests[requestId] = {digest, status: 'done', guarded: turn.guarded}; current.lease = null; current.revision++; current.updatedAt = clock(); return current;
      });
      if (!finished.committed) fail('request_interrupted', 409);
      return response(finished.value);
    } catch (error) {
      await store.transaction(`sessions/${s.id}`, old => {
        const current = normalizeSession(old); if (!current || current.lease?.id !== leaseId) return undefined;
        current.requests[requestId] = {digest, status: 'failed'}; current.lease = null; return current;
      });
      throw error instanceof ReceptionError ? error : new ReceptionError('unavailable', 503);
    } finally { if (reservation) await settle(reservation, usage); }
  }
  async function handle(body, identity) {
    checkIdentity(identity); if (!body || !Object.hasOwn(allowed, body.op)) fail('invalid_operation'); fields(body, allowed[body.op]);
    if (body.op === 'catalog') return {ok: true, cases: (await catalogue()).map(c => ({id: c.id, title: localized(c.public.title, locale(body.locale))}))};
    if (body.op === 'start') return start(body, identity);
    if (body.op === 'resume') return response(await deliverResult(await get(body.sessionId, identity)));
    if (body.op === 'message') return message(body, identity);
    if (body.op === 'locale') {
      const language = locale(body.locale); let failure;
      const r = await store.transaction(`sessions/${identifier(body.sessionId)}`, old => {
        const s = normalizeSession(old); try { own(s, identity); if (s.lease && s.lease.until > clock()) fail('busy', 409); s.locale = language; s.revision++; return s; }
        catch (error) { failure = error; return undefined; }
      });
      if (!r.committed) throw failure; return response(r.value);
    }
    const s = await mutate(body, identity, session => {
      const c = session.caseData[session.caseIndex], state = session.caseStates[session.caseIndex];
      if (body.op === 'document') {
        if (session.status !== 'active' || !state.releasedDocumentIds.includes(body.documentId)) fail('document_unavailable', 403);
        const doc = c.documents.find(d => d.id === body.documentId);
        state.openedDocumentIds = [...new Set([...state.openedDocumentIds, doc.id])];
        state.knownFactIds = [...new Set([...state.knownFactIds, ...doc.factIds])];
      } else if (body.op === 'decide') {
        if (session.status !== 'active' || state.decision) fail('not_active', 409);
        const decision = validateDecision(body.decision, c, state.openedDocumentIds);
        state.decision=decision;
        if(c.followup){state.feedback=null;session.status='followup';}
        else {const feedback=evaluateDecision(c,state,decision);state.feedback=feedback;session.results.push(feedback);session.status='review';}
      } else if(body.op==='followup'){
        if(session.status!=='followup'||!state.decision||state.followupChoiceId)fail('not_active',409);
        if(!c.followup?.options.some(option=>option.id===body.choiceId))fail('invalid_decision');
        state.followupChoiceId=body.choiceId;const feedback=evaluateDecision(c,state,state.decision);
        state.feedback=feedback;session.results.push(feedback);session.status='review';
      } else if (body.op === 'next') {
        if (session.status !== 'review') fail('not_reviewed', 409);
        if (session.caseIndex + 1 < session.caseData.length) {
          session.caseIndex++; session.status = 'active';
          // A not-yet-opened case starts in the currently selected language.
          // Earlier dialogue is historical and is never rewritten on locale change.
          session.caseStates[session.caseIndex] = initialState(session.caseData[session.caseIndex], session.locale, clock());
        }
        else {
          session.status = 'complete'; const raw = session.results.reduce((sum,r)=>sum+r.score,0)/session.results.length;
          const critical=session.results.some(r=>r.authored&&r.criticalIds?.length),bounded=critical?Math.min(raw,60):raw;
          const total=session.results.some(r=>r.authored)?bounded:Math.round(bounded*10)/10;
          session.result = {points: Math.round(total / 20 * 10) / 10, maxPoints: 5, total, raw, cap:critical?60:null, attemptId: `reception-ai-${session.id}`, caseCount: session.caseData.length};
        }
      }
    });
    return response(await deliverResult(s));
  }
  return {handle};
}
