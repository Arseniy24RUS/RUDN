import {randomUUID} from 'node:crypto';
import {ReceptionError, fail, fields, identifier, string, locale, localized, copy, hash, validateCase, validateDecision, evaluateDecision, actorCase,MAX_CATALOG_CASES} from './schema.mjs';
import {validateActorTurn, estimateReservation, estimateReviewReservation, costMicros, reviewCostMicros} from './provider.mjs';
import {selectShiftCases} from './selection.mjs';
import {CATALOG_METADATA} from './catalog-metadata.mjs';
import {legacySessionIds, LEGACY_RECOVERY_LIMITS} from './store.mjs';
import {learningReviewFor} from './learning-review.mjs';
import {WORKBOOK_VERSION,LEGACY_WORKBOOK_VERSION,supportsWorkbook,publicWorkbook,validateWorkbookDecision,evaluateWorkbook} from './workbook.mjs';
import {DECISION_VERSION,CORRESPONDENCE_WEIGHTS,publicCorrespondenceSources,resolveCorrespondenceCitations,validateCorrespondenceControl,
  buildCorrespondenceReview,scoreCorrespondenceReview,combineCorrespondenceFeedback} from './correspondence.mjs';
import {privateCorrespondenceProfile,publicCorrespondenceProfile} from './correspondence-profiles.mjs';
import {resolveLegalCitation as defaultLegalCitationResolver} from './correspondence-legal-sources.mjs';
import {calendarNormId} from './workbook-norms.mjs';
import {normativeActsForCase,validateLegalCitation,hasApplicableLegalCitation} from './normative-acts.mjs';

const DEFAULTS = {maxMessageChars: 2400, maxTurnsPerCase: 24, maxInputAllowance: 80000, maxOutputTokens: 650,
  dailyBudgetMicros: 2_000_000, monthlyBudgetMicros: 20_000_000, studentDailyBudgetMicros: 1_000_000,
  maxConcurrent: 8, maxDailyTurnsPerStudent: 240, maxDailyStartsPerStudent: 20, leaseMs: 45000, providerTimeoutMs: 30000,
  reviewLeaseMs:105000,reviewTimeoutMs:90000,
  guestDailyBudgetMicros:750_000,guestMonthlyBudgetMicros:5_000_000,guestMaxConcurrent:2,
  guestMaxDailyStartsPerUid:3,guestMaxDailyStarts:12};
const allowed = {
  start: ['op', 'studentKey', 'mode', 'locale', 'requestId', 'caseId', 'level', 'buildId', 'workbookVersion','decisionVersion','context'], resume: ['op', 'sessionId', 'buildId', 'workbookVersion','decisionVersion','context'],
  recover: ['op', 'studentKey', 'mode', 'buildId', 'workbookVersion','decisionVersion','context'],
  message: ['op', 'sessionId', 'text', 'requestId', 'expectedRevision'], document: ['op', 'sessionId', 'documentId', 'requestId'],
  decide: ['op', 'sessionId', 'decision', 'requestId','expectedRevision'], followup:['op','sessionId','requestId','choiceId','control','expectedRevision'], next: ['op', 'sessionId', 'requestId'], locale: ['op', 'sessionId', 'locale'], catalog: ['op', 'locale', 'studentKey', 'workbookVersion','decisionVersion','context']
};
const dayOf = n => new Date(n).toISOString().slice(0, 10), monthOf = n => dayOf(n).slice(0, 7);
const scopeOf = identity => identity.teacher ? `teacher:${identity.uid}`
  : identity.guest ? `guest:${identity.uid}` : `student:${identity.studentKey || identity.uid}`;
const values = rows => Array.isArray(rows) ? rows : Object.values(rows || {});
const MAX_SEMINAR_POINTS = 5;
const seminarPath = owner => `seminarProgress/${hash(owner)}`;
const usesLegalCitation = (context,workbookVersion) => Boolean(context) && workbookVersion === WORKBOOK_VERSION;
function fixedProcedure(c,context) {
  if (!context || !c.rubric.authored || !['registration59','review59','referral59'].includes(calendarNormId(c))) return null;
  const [procedure] = c.rubric.procedureIds;
  // The bank uses numeric options for the standard workflow and named IDs for
  // comparison between statutory procedures, including combined regimes.
  return c.rubric.procedureIds.length===1 && ['0','59'].includes(procedure) ? procedure : null;
}
const publicMetadata = c => {
  const metadata = Object.hasOwn(CATALOG_METADATA, c.id) ? CATALOG_METADATA[c.id] : null;
  return {familyId: c.familyId || metadata?.familyId || c.id, level: metadata?.level ?? null, estimatedMinutes: metadata?.estimatedMinutes ?? null};
};
const normalizeSession = s => {
  // Realtime Database omits empty arrays/objects. Restore schema defaults after
  // every read; this also keeps emulator and memory adapters behavior aligned.
  if (!s) return s;
  s.requests ||= {}; s.results = values(s.results); s.caseStates = values(s.caseStates); s.caseData = values(s.caseData);
  for (const state of s.caseStates) {
    for (const key of ['messages', 'knownFactIds', 'releasedDocumentIds', 'openedDocumentIds']) state[key] = values(state[key]);
    if(state.decision){for(const key of ['actionIds','basisDocumentIds'])state.decision[key]=values(state.decision[key]);if(state.decision.workbook){state.decision.workbook.routing??={};state.decision.workbook.routing.recipientIds=values(state.decision.workbook.routing.recipientIds);}}
  }
  return s;
};

export function createReceptionService({store, cases, provider, clock = Date.now, config = {}, canStartAssessment = null, saveResult = null, requireGameplay = false,
  guestEnabled = true, resolveLegalCitation=defaultLegalCitationResolver,
  correspondenceProfiles={private:privateCorrespondenceProfile,public:publicCorrespondenceProfile}} = {}) {
  if (!store?.transaction || !store?.get || !provider?.generate) throw new TypeError('Reception adapters are required');
  const limits = {...DEFAULTS, ...config};
  if (limits.leaseMs <= limits.providerTimeoutMs + 3000) throw new TypeError('Lease must exceed provider timeout');
  if(limits.reviewLeaseMs<=limits.reviewTimeoutMs+3000)throw new TypeError('Review lease must exceed review timeout');
  if(limits.reviewTimeoutMs>90000||limits.reviewLeaseMs>110000)throw new TypeError('Review limits must fit the 120 second function deadline');
  for (const key of Object.keys(DEFAULTS)) if (!Number.isFinite(limits[key]) || limits[key] <= 0) throw new TypeError('Invalid reception limit');
  let catalogPromise;
  const legacyMigrations = new Map(), seminarMigrations = new Map();
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
  function scoreDecision(c,state,decision,workbookVersion,context){
    const workbook=[LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(workbookVersion);
    const options={knowledgeQuiz:workbookVersion!==2,orderedActions:workbookVersion!==2};
    // The authority picker replaces the old route radio. When a case permits
    // alternative action plans, grade the student's chosen actions against both.
    const routes=workbook&&!decision.routeId?(workbookVersion===2?c.rubric.routeIds:[c.rubric.routeIds[0]||'']):[decision.routeId];
    const candidates=routes.map(routeId=>evaluateDecision(c,state,{...decision,routeId},options));
    const base=candidates.reduce((best,item)=>!best||item.score>best.score?item:best,null);
    if(!workbook)return base;
    const result=evaluateWorkbook(c,decision,base,workbookVersion,{gameplay:Boolean(context)});
    if(usesLegalCitation(context,workbookVersion)){
      const research=result.criteria.find(criterion=>criterion.id==='research');
      if(research){
        research.earned=hasApplicableLegalCitation(c,decision.workbook.legalCitation)?research.max:0;
        result.score=result.criteria.reduce((sum,criterion)=>sum+criterion.earned,0);
        if(Number.isFinite(result.cap))result.score=Math.min(result.score,result.cap);
      }
    }
    return result;
  }
  function checkIdentity(identity) {
    if (!identity || typeof identity.uid !== 'string' || !identity.uid || identity.uid.length > 150) fail('auth', 401);
    if (identity.guest && (identity.teacher || identity.studentKey)) fail('forbidden', 403);
    if (!identity.guest && !identity.teacher && !identity.studentKey) fail('profile_required', 403);
  }
  function own(session, identity) {
    if (!session) fail('not_found', 404);
    if (session.owner !== scopeOf(identity) || Boolean(session.guest) !== Boolean(identity.guest)) fail('forbidden', 403);
    if (identity.guest && (session.context !== 'free' || session.mode !== 'training' || session.studentKey || session.teacher)) fail('forbidden', 403);
  }
  async function get(id, identity) {
    identifier(id); const s = normalizeSession(await store.get(`sessions/${id}`)); own(s, identity); return s;
  }
  function view(session) {
    const s = normalizeSession(copy(session)), c = s.caseData[s.caseIndex], state = s.caseStates[s.caseIndex];
    const p = localized(c.public, s.locale);
    if(s.context){
      p.procedureRequired=!fixedProcedure(c,s.context);
      if(!p.procedureRequired)p.procedures=[];
    }
    if(usesLegalCitation(s.context,s.workbookVersion)){
      p.normativeActs=normativeActsForCase(c);
      delete p.sources;
      if(p.assessment)delete p.assessment.research;
    }
    const correspondence=s.decisionVersion===DECISION_VERSION;
    const profile=correspondence?correspondenceProfiles.public(c,s.locale):null;
    if(correspondence){
      // Work-product sessions never publish the old multiple-choice answer menu.
      delete p.assessment;p.actions=[];p.procedures=[];p.routes=[];p.procedureRequired=false;
      p.correspondence=profile;p.decisionVersion=DECISION_VERSION;
    }
    const result = s.status === 'complete' ? {points: s.result.points, maxPoints: 5, total: s.result.total, cap:s.result.cap||null, attemptId: s.result.attemptId,
      ...(s.context==='seminar'?s.seminarProgress:{}),
      journalStatus: s.teacher || s.mode === 'training' || provider.name === 'mock' || typeof saveResult !== 'function' ? 'local' : s.journalSaved ? 'saved' : 'pending',
      cases: s.results.map((r, i) => ({caseId: s.caseData[i].id, title: localized(s.caseData[i].public.title, s.locale), score: r.score,
         feedback: localized(r, s.locale), decision: s.caseStates[i].decision,followupChoiceId:s.caseStates[i].followupChoiceId||null,
         ...(correspondence?{caseInfo:localized({id:s.caseData[i].id,title:s.caseData[i].public.title,citizen:s.caseData[i].public.citizen,
           date:s.caseData[i].public.date,role:s.caseData[i].public.role,
           ...([LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(s.workbookVersion)?{workbook:publicWorkbook(s.caseData[i],s.workbookVersion,{gameplay:Boolean(s.context)})}:{})},s.locale),
           correspondenceProfile:correspondenceProfiles.public(s.caseData[i],s.locale),
           correspondenceSources:publicCorrespondenceSources(s.caseData[i],s.caseStates[i],s.locale,{includeFollowup:true})}:{}),
         ...(s.caseStates[i].control?{control:s.caseStates[i].control}:{})}))} : null;
    return {id: s.id, revision: s.revision, mode: s.mode, locale: s.locale, caseIndex: s.caseIndex, caseCount: s.caseData.length,
      startedAt: s.startedAt, updatedAt: s.updatedAt, ...(s.buildId ? {buildId:s.buildId} : {}), ...(s.context ? {context:s.context} : {}),
      ...(s.context==='seminar'?{seminarProgress:s.seminarProgress}:{}),
      ...(correspondence?{decisionVersion:DECISION_VERSION,correspondenceSources:publicCorrespondenceSources(c,state,s.locale,{includeFollowup:s.status!=='active'}),
        draftDecision:state.correspondenceDraft||null,draftControl:state.controlDraft||null,reviewPending:state.reviewPending||null,control:state.control||null}:{}),
      operationInProgress: Boolean(s.lease && s.lease.until > clock()),
      status: s.status, case: {id: c.id, ...publicMetadata(c), ...p, ...([LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(s.workbookVersion)?{workbook:localized(publicWorkbook(c,s.workbookVersion,{gameplay:Boolean(s.context)}),s.locale)}:{})}, messages: state.messages,
      documents: c.documents.filter(d => state.releasedDocumentIds.includes(d.id)).map(d => localized({id: d.id, title: d.title, type: d.type, text: d.text, chatAttachment:!s.context&&!d.initial,
        ...(d.image?{image:d.image}:{}),...(d.url?{url:d.url}:{}),...(d.sensitive!==undefined?{sensitive:d.sensitive}:{})}, s.locale)),
      openedDocumentIds: state.openedDocumentIds, decision: state.decision || null,
      followup:s.status==='followup'&&c.followup?(correspondence?{intro:localized(c.followup.intro,s.locale),control:true,issues:profile?.issues||[]}:
        localized({intro:c.followup.intro,options:c.followup.options},s.locale)):null,
      followupChoiceId:state.followupChoiceId||null,
      feedback: s.mode === 'training' && state.feedback ? localized(state.feedback, s.locale) : null,
      learningReview: learningReviewFor({mode:s.mode,status:s.status,caseData:c,locale:s.locale}),result, provider: provider.name};
  }
  async function remember(session) {
    // Store only an opaque session pointer and lifecycle metadata. Keep completed
    // tombstones so a delayed response cannot resurrect an older active revision.
    const entry = sessionEntry(session);
    await store.transaction(`sessionIndex/${hash(session.owner)}/entries/${session.id}`, old =>
      old?.revision > entry.revision ? undefined : entry);
  }
  function sessionEntry(session) {
    return {id: session.id, mode: session.mode, status: session.status, revision: session.revision,
      ...(session.decisionVersion?{decisionVersion:session.decisionVersion}:{}),
      startedAt: session.startedAt, updatedAt: session.updatedAt, ...(session.workbookVersion?{workbookVersion:session.workbookVersion}:{}),
      ...(session.buildId ? {buildId:session.buildId} : {}), ...(session.context ? {context:session.context} : {})};
  }
  const response = async s => { await deliverResult(s); await remember(s); return {ok: true, view: view(s)}; };
  async function migrateLegacyIndex(identity) {
    const owner = scopeOf(identity), ownerKey = hash(owner), path = `sessionIndex/${ownerKey}`;
    if (await store.get(`${path}/legacyMigrated`)) return;
    if (!legacyMigrations.has(ownerKey)) {
      const job = (async () => {
        const deadline = Date.now() + 15000, entries = [];
        const ids = typeof store.getLegacySessionIds === 'function'
          ? await store.getLegacySessionIds(ownerKey) : legacySessionIds(await store.get('starts'), ownerKey);
        // A bounded batch keeps recovery from flooding Firebase with reads. Only
        // IDs recorded in this owner's quota ledger are ever loaded.
        for (let offset = 0; offset < ids.length; offset += 8) {
          if (Date.now() > deadline) fail('recovery_index_required', 409);
          const sessions = await Promise.all(ids.slice(offset, offset + 8).map(id => store.get(`sessions/${id}`)));
          entries.push(...sessions.filter(s => s?.owner === owner).map(sessionEntry));
        }
        if (Date.now() > deadline) fail('recovery_index_required', 409);
        // Publish migration atomically. A timed-out/failed scan must not leave
        // a partial index that looks like the latest recoverable session.
        await store.transaction(path, old => {
          const index = old || {}; index.entries ||= {};
          for (const entry of entries) if (!(index.entries[entry.id]?.revision > entry.revision)) index.entries[entry.id] = entry;
          index.legacyMigrated = true; return index;
        });
      })().finally(() => legacyMigrations.delete(ownerKey));
      legacyMigrations.set(ownerKey, job);
    }
    await legacyMigrations.get(ownerKey);
  }
  async function recover(body, identity) {
    if (!['training', 'independent'].includes(body.mode)) fail('invalid_mode');
    if (body.studentKey && body.studentKey !== identity.studentKey && !identity.teacher) fail('forbidden', 403);
    const owner = scopeOf(identity), path = `sessionIndex/${hash(owner)}`;
    async function indexed() {
      const index = await store.get(`${path}/entries`);
      const candidates = Object.values(index || {}).filter(entry => entry.mode === body.mode && entry.context === body.context && entry.status !== 'complete'
        && (!body.decisionVersion || entry.decisionVersion===body.decisionVersion)
        && (!body.workbookVersion || entry.workbookVersion===body.workbookVersion) && (!body.buildId || entry.buildId === body.buildId) && /^[a-f0-9]{40}$/.test(entry.id))
        .sort((a, b) => b.updatedAt - a.updatedAt || b.startedAt - a.startedAt || b.id.localeCompare(a.id));
      for (let i = 0; i < candidates.length; i++) {
        if (i >= LEGACY_RECOVERY_LIMITS.sessions) fail('recovery_index_required', 409);
        const entry = candidates[i], s = normalizeSession(await store.get(`sessions/${entry.id}`));
        if (!s) { await store.transaction(`${path}/entries/${entry.id}`, () => null); continue; }
        own(s, identity);
        if (s.mode !== body.mode || s.context !== body.context || s.status === 'complete' || body.workbookVersion && s.workbookVersion!==body.workbookVersion || body.buildId && s.buildId !== body.buildId
          ||body.decisionVersion&&s.decisionVersion!==body.decisionVersion) { await remember(s); continue; }
        return response(s);
      }
      return null;
    }
    let recovered = await indexed();
    if (!recovered && !body.context && !await store.get(`${path}/legacyMigrated`)) {
      await migrateLegacyIndex(identity); recovered = await indexed();
    }
    return recovered || {ok: true, view: null};
  }
  function initialState(c, language, timestamp, context) {
    return {messages: [{id: `opening-${c.id}`, role: 'assistant', text: localized(c.public.opening, language), at: timestamp}],
      knownFactIds: c.facts.filter(f => f.initial).map(f => f.id), releasedDocumentIds: c.documents.filter(d => context || d.initial).map(d => d.id),
      openedDocumentIds: [], turns: 0, decision: null, feedback: null};
  }
  async function seedSeminarHistory(identity) {
    const owner = scopeOf(identity), path = seminarPath(owner);
    if (await store.get(`${path}/legacyMigrated`)) return;
    if (!seminarMigrations.has(owner)) {
      const job = (async () => {
        try { await migrateLegacyIndex(identity); }
        catch (error) { if (error.code !== 'recovery_index_required') throw error; }
        const entries = Object.values(await store.get(`sessionIndex/${hash(owner)}/entries`) || {})
          .filter(entry => entry.mode==='independent' && !entry.context && /^[a-f0-9]{40}$/.test(entry.id))
          .sort((a,b) => b.updatedAt-a.updatedAt).slice(0,LEGACY_RECOVERY_LIMITS.sessions);
        const shown = new Set();
        for (let offset = 0; offset < entries.length; offset += 8) {
          const sessions = await Promise.all(entries.slice(offset,offset+8).map(entry => store.get(`sessions/${entry.id}`)));
          for (const s of sessions) if (s?.owner===owner && s.mode==='independent' && !s.context) {
            for (const c of values(s.caseData).slice(0,s.caseIndex+1)) shown.add(c.id);
          }
        }
        await store.transaction(path, old => {
          if (old?.legacyMigrated) return undefined;
          const progress = old || {}; progress.assigned ||= {};
          for (const id of shown) if (!Object.hasOwn(progress.assigned,id)) progress.assigned[id] = 'legacy';
          progress.legacyMigrated = true;
          return progress;
        });
      })().finally(() => seminarMigrations.delete(owner));
      seminarMigrations.set(owner,job);
    }
    await seminarMigrations.get(owner);
  }
  async function reserveSeminarCase(owner, id, signature, available, mode) {
    const seed = randomUUID(), ordered = [...available].sort((a,b) => hash(`${seed}:${a.id}`).localeCompare(hash(`${seed}:${b.id}`)));
    const path = seminarPath(owner);
    const allocation = await store.transaction(path, old => {
      const progress = old || {};
      progress.attempts ||= {};
      progress.assigned ||= {};
      if (progress.attempts[id]) return progress;
      const selected = ordered.find(c => !Object.hasOwn(progress.assigned, c.id));
      if (!selected) return undefined;
      progress.attempts[id] = {caseId:selected.id, signature};
      progress.assigned[selected.id] = id;
      return progress;
    });
    if (!allocation.committed) fail('case_bank_exhausted', 409);
    const progress = allocation.value, attempt = progress.attempts[id];
    if (attempt.signature !== signature) fail('request_conflict', 409);
    if (!available.some(c => c.id === attempt.caseId)) fail('outdated_session', 409);
    return {caseId:attempt.caseId, progress:{remainingCases:remainingSeminarCases(available,progress),
      ...(mode==='independent'?{seminarPoints:progress.points||0}:{})}};
  }
  function remainingSeminarCases(available, progress) {
    return available.filter(c => !Object.hasOwn(progress.assigned || {}, c.id)).length;
  }
  async function reserveGuestStart(day, ownerKey, id, timestamp) {
    const grant = await store.transaction('guestStarts', old => {
      const starts = old || {};
      const cutoff = dayOf(timestamp - 32 * 86400000);
      for (const key of Object.keys(starts)) if (key < cutoff) delete starts[key];
      const today = starts[day] ||= {};
      const owners = Object.values(today);
      if (today[id] === ownerKey) return starts;
      if (owners.length >= limits.guestMaxDailyStarts ||
          owners.filter(owner => owner === ownerKey).length >= limits.guestMaxDailyStartsPerUid) return undefined;
      today[id] = ownerKey;
      return starts;
    });
    if (!grant.committed) fail('guest_daily_limit', 429);
  }
  async function start(body, identity) {
    identifier(body.requestId); const language = locale(body.locale), {mode,context} = body;
    if (!['training', 'independent'].includes(mode)) fail('invalid_mode');
    if (context==='free' && mode!=='training') fail('invalid_mode');
    if (body.studentKey && body.studentKey !== identity.studentKey && !identity.teacher) fail('forbidden', 403);
    if (provider.ready === false) fail('not_configured', 503);
    if(body.decisionVersion===DECISION_VERSION&&typeof provider.reviewDecision!=='function')fail('reviewer_unavailable',503);
    const owner = scopeOf(identity), requestScope = context ? `${owner}:${context}` : owner;
    const id = hash(`${requestScope}:${body.requestId}`).slice(0, 40), signature = hash(body);
    const existing = normalizeSession(await store.get(`sessions/${id}`));
    if (existing) { own(existing, identity); if (existing.startSignature !== signature) fail('request_conflict', 409); return response(existing); }
    if (requireGameplay && !context) fail('invalid_context');
    if (requireGameplay && body.workbookVersion!==WORKBOOK_VERSION) fail('invalid_workbook');
    const timestamp = clock(), day = dayOf(timestamp), ownerKey = hash(owner);
    if (mode === 'independent' && !identity.teacher && canStartAssessment && !await canStartAssessment(timestamp)) fail('assessment_closed', 403);
    const all = (await catalogue()).filter(c=>(!body.workbookVersion||supportsWorkbook(c,body.workbookVersion))
      &&(!body.decisionVersion||Boolean(correspondenceProfiles.private(c))));
    if (mode === 'independent' && context !== 'seminar' && new Set(all.map(c=>c.familyId||c.id)).size < 8) fail('pilot_incomplete', 503);
    if (Object.hasOwn(body, 'caseId')) {
      identifier(body.caseId);
      if (mode !== 'training' || context === 'seminar' || !all.some(c => c.id === body.caseId)) fail('invalid_case');
    }
    if (Object.hasOwn(body, 'level') && (mode !== 'training' || context === 'seminar' || ![1, 2, 3].includes(body.level))) fail('invalid_level');
    const available = body.level ? all.filter(c => publicMetadata(c).level === body.level) : all;
    if (!available.length || (body.caseId && !available.some(c => c.id === body.caseId))) fail('invalid_case');
    if (context==='seminar') await seedSeminarHistory(identity);
    const seminar = context==='seminar' ? await reserveSeminarCase(owner,id,signature,available,mode) : null;
    const multiCase = mode==='independent' && !seminar;
    const selected=selectShiftCases(available,id,{count:multiCase?8:1,caseId:seminar?.caseId||body.caseId,balanced:multiCase});
    if (identity.guest) await reserveGuestStart(day, ownerKey, id, timestamp);
    else if (!seminar) {
      const grant = await store.transaction(`starts/${day}/${ownerKey}`, old => {
        const value = old || {ids: {}}; value.ids ||= {};
        if (value.ids[id]) return value;
        if (Object.keys(value.ids).length >= limits.maxDailyStartsPerStudent) return undefined;
        value.ids[id] = true; return value;
      });
      if (!grant.committed) fail('daily_limit', 429);
    }
    const session = {schema: 1, id, owner, studentKey: identity.studentKey || null, uid: identity.uid, teacher: Boolean(identity.teacher),
      ...(identity.guest ? {guest:true} : {}),
      ...(body.decisionVersion?{decisionVersion:body.decisionVersion}:{}),
      mode, locale: language, ...(body.workbookVersion?{workbookVersion:body.workbookVersion}:{}), ...(body.buildId ? {buildId:body.buildId} : {}), startedAt: timestamp, updatedAt: timestamp, revision: 1, status: 'active', caseIndex: 0,
      ...(context ? {context} : {}), ...(seminar ? {seminarProgress:seminar.progress} : {}),
      caseData: selected, caseStates: selected.map(c => initialState(c, language, timestamp,context)), results: [], requests: {},
      startSignature: signature, lease: null, result: null, journalSaved: false};
    const created = await store.transaction(`sessions/${id}`, old => old || session);
    const out = normalizeSession(created.value);
    if (out.startSignature !== signature) fail('request_conflict', 409);
    return response(out);
  }

  // This ledger is entirely server-owned. Reservations are charged pessimistically
  // before a provider call. A crash or ambiguous timeout never refunds spent money.
  async function reserve(session, requestId, amount, reviewAttempt = null) {
    const now = clock(), day = dayOf(now), month = monthOf(now), owner = hash(session.owner);
    const review = reviewAttempt !== null, leaseMs = review ? limits.reviewLeaseMs : limits.leaseMs;
    const token = hash(review ? [session.id,'review',requestId,reviewAttempt] : `${session.id}:${requestId}`).slice(0, 40);
    let limitCode = 'budget_or_rate_limit';
    const result = await store.transaction('budget', prior => {
      limitCode = 'budget_or_rate_limit';
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
      const active = Object.values(b.active);
      if (session.guest) {
        if ((m.guestMicros || 0) + amount > limits.guestMonthlyBudgetMicros) limitCode = 'guest_monthly_limit';
        else if ((d.guestMicros || 0) + amount > limits.guestDailyBudgetMicros) limitCode = 'guest_daily_limit';
        else if (active.filter(request => request.guest).length >= limits.guestMaxConcurrent) limitCode = 'guest_busy';
        if (limitCode !== 'budget_or_rate_limit') return undefined;
      }
      if (active.length >= limits.maxConcurrent || d.micros + amount > limits.dailyBudgetMicros || m.micros + amount > limits.monthlyBudgetMicros || o.micros + amount > limits.studentDailyBudgetMicros || o.turns >= limits.maxDailyTurnsPerStudent) return undefined;
      d.micros += amount; m.micros += amount; o.micros += amount; o.turns++;
      const guest = session.guest ? {guest:true} : {};
      if (session.guest) {
        d.guestMicros = (d.guestMicros || 0) + amount;
        m.guestMicros = (m.guestMicros || 0) + amount;
      }
      b.active[token] = {expiresAt: now + leaseMs, ...guest};
      b.reservations[token] = {amount, day, month, owner, createdAt: now, settled: false, ...guest, ...(review ? {review:true} : {})}; return b;
    });
    if (!result.committed) fail(limitCode, 429);
    return token;
  }
  async function settle(token, usage) {
    await store.transaction('budget', b => {
      if (!b?.reservations?.[token]) return undefined;
      const r = b.reservations[token]; if (r.settled) return undefined;
      const valid = Number.isSafeInteger(usage?.inputTokens) && usage.inputTokens >= 0 && Number.isSafeInteger(usage?.outputTokens) && usage.outputTokens >= 0;
      const actual = !valid ? r.amount : r.review ? reviewCostMicros(usage.inputTokens,usage.outputTokens,usage.cachedInputTokens) : costMicros(usage.inputTokens,usage.outputTokens);
      const delta = actual - r.amount;
      const day = b.days?.[r.day], month = b.months?.[r.month];
      if (day) {
        day.micros += delta;
        if (day.owners?.[r.owner]) day.owners[r.owner].micros += delta;
        if (r.guest) day.guestMicros += delta;
      }
      if (month) {
        month.micros += delta;
        if (r.guest) month.guestMicros += delta;
      }
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
        update(s,timestamp); s.requests[requestId] = {digest, status: 'done'}; s.revision++; s.updatedAt = timestamp; return s;
      } catch (error) { failure = error; return undefined; }
    });
    if (!result.committed) throw failure || new ReceptionError('conflict', 409);
    return normalizeSession(result.value);
  }
  async function finalizeSeminar(s) {
    const available = (await catalogue()).filter(c => (!s.workbookVersion || supportsWorkbook(c,s.workbookVersion))
      &&(s.decisionVersion!==DECISION_VERSION||Boolean(correspondenceProfiles.private(c))));
    const recorded = await store.transaction(seminarPath(s.owner), progress => {
      const attempt = progress?.attempts?.[s.id];
      if (!attempt || attempt.caseId !== s.caseData[0].id || attempt.signature !== s.startSignature) return undefined;
      if (attempt.completed) return progress;
      attempt.completed = true;
      attempt.remainingCases = remainingSeminarCases(available,progress);
      if (s.mode === 'independent') {
        progress.points = Math.min(MAX_SEMINAR_POINTS,(progress.points||0) + s.result.points);
        attempt.seminarPoints = progress.points;
      }
      return progress;
    });
    if (!recorded.committed) fail('result_conflict',409);
    const attempt = recorded.value.attempts[s.id];
    const seminarProgress = {remainingCases:attempt.remainingCases,
      ...(s.mode==='independent'?{seminarPoints:attempt.seminarPoints}:{})};
    await store.transaction(`sessions/${s.id}`, old => old?.status==='complete'
      ? {...old,seminarProgress,seminarFinalized:true} : undefined);
    s.seminarProgress = seminarProgress;
    s.seminarFinalized = true;
  }
  async function deliverResult(s) {
    if(s.status==='complete' && s.context==='seminar' && !s.seminarFinalized) await finalizeSeminar(s);
    if (s.status === 'complete' && !s.journalSaved && s.mode === 'independent' && !s.teacher && !s.guest && provider.name !== 'mock' && typeof saveResult === 'function') {
      try {
        const result = s.context==='seminar'?{...s.result,seminarPoints:s.seminarProgress.seminarPoints}:copy(s.result);
        await saveResult({sessionId: s.id, studentKey: s.studentKey, uid: s.uid, result, startedAt: s.startedAt, completedAt: s.result.completedAt ?? s.updatedAt,
          cases: s.caseData.map(c => ({id: c.id, version: c.version,...(c.datePackId?{datePackId:c.datePackId}:{}),...(c.familyId?{familyId:c.familyId}:{})})),
          decisions: s.caseStates.map(state => state.control?{...state.decision,control:state.control,correspondenceFeedback:state.feedback?.correspondence}:
            state.followupChoiceId?{...state.decision,followupChoiceId:state.followupChoiceId}:state.decision)});
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
      const dossier = actorCase(c, s.locale);
      if([LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(s.workbookVersion)){const facts=localized(publicWorkbook(c,s.workbookVersion,{gameplay:Boolean(s.context)}),s.locale);dossier.correspondenceAddress=facts?.origin||null;dossier.eventLocation=facts?.site||null;}
      dossier.releasedDocumentIds = dossier.documents.filter(document => state.releasedDocumentIds.includes(document.id)).map(document => document.id);
      if(s.context)dossier.documentsAvailableUpfront=true;
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
        if(!current.context)st.releasedDocumentIds = [...new Set([...st.releasedDocumentIds, ...turn.releasedDocumentIds])];
        st.turns++;
        current.requests[requestId] = {digest, status: 'done', guarded: turn.guarded,
          ...(generated.actorModels?.reply && generated.actorModels?.verification ? {actorModels:generated.actorModels} : {})};
        current.lease = null; current.revision++; current.updatedAt = clock(); return current;
      });
      if (!finished.committed) fail('request_interrupted', 409);
      return response(finished.value);
    } catch (error) {
      await store.transaction(`sessions/${s.id}`, old => {
        const current = normalizeSession(old); if (!current || current.lease?.id !== leaseId) return undefined;
        // A quota rejection occurs before any model call. Preserve the option to
        // retry the identical guest message once the allowance is available.
        if (s.guest && !reservation && error instanceof ReceptionError && error.status === 429) delete current.requests[requestId];
        else current.requests[requestId] = {digest, status: 'failed'};
        current.lease = null; return current;
      });
      throw error instanceof ReceptionError ? error : new ReceptionError('unavailable', 503);
    } finally { if (reservation) await settle(reservation, usage); }
  }
  function correspondenceOperational(c,decision,workbookVersion,context) {
    const base={score:0,criteria:[
      {id:'route',earned:0,max:CORRESPONDENCE_WEIGHTS.initial.route},
      {id:'calendar',earned:0,max:CORRESPONDENCE_WEIGHTS.initial.calendar},
    ],cap:null,explanation:''};
    if([LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(workbookVersion))return evaluateWorkbook(c,decision,base,workbookVersion,{gameplay:Boolean(context)});
    base.criteria[0].earned=c.rubric.routeIds.includes(decision.routeId)?base.criteria[0].max:0;
    base.criteria[1].earned=decision.deadline===c.rubric.deadline?base.criteria[1].max:0;
    base.score=base.criteria.reduce((sum,row)=>sum+row.earned,0);
    return base;
  }

  async function reviewCorrespondence(body,identity) {
    const requestId=identifier(body.requestId),requestDigest=hash(body),timestamp=clock(),leaseId=randomUUID();
    const phase=body.op==='followup'?'control':'initial';
    let failure;
    const acquired=await store.transaction('sessions/'+identifier(body.sessionId),old=>{
      const s=normalizeSession(old);
      try{
        own(s,identity);if(s.decisionVersion!==DECISION_VERSION)fail('invalid_decision_version');
        const prior=Object.hasOwn(s.requests,requestId)?s.requests[requestId]:null;
        if(prior){
          if(prior.digest!==requestDigest)fail('request_conflict',409);
          if(prior.status==='done')return s;
          if(s.lease?.until>timestamp)fail('busy',409);
        }
        if(s.lease&&s.lease.until>timestamp)fail('busy',409);
        if(s.status!==(phase==='control'?'followup':'active'))fail('not_active',409);
        if(body.expectedRevision!==undefined&&(!Number.isSafeInteger(body.expectedRevision)||s.revision!==body.expectedRevision))fail('revision_conflict',409);
        const c=s.caseData[s.caseIndex],state=s.caseStates[s.caseIndex],profile=correspondenceProfiles.private(c);
        if(!profile)fail('invalid_case',503);
        if(phase==='initial'){
          if(state.decision)fail('not_active',409);
          const raw=copy(body.decision);let workbook;
          if([LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(s.workbookVersion)){
            workbook=validateWorkbookDecision(raw?.workbook,s.workbookVersion);delete raw.workbook;
          }
          const decision=validateDecision(raw,c,state.openedDocumentIds,{decisionVersion:DECISION_VERSION,state,locale:s.locale});
          if(workbook)decision.workbook=workbook;
          state.correspondenceDraft=decision;
        }else{
          if(body.choiceId!==undefined||!state.decision||state.control)fail('invalid_control');
          state.controlDraft=validateCorrespondenceControl(body.control,c,state,profile,s.locale);
        }
        state.reviewPending={requestId,phase,status:'pending'};
        s.lease={id:leaseId,requestId,until:timestamp+limits.reviewLeaseMs};
        s.requests[requestId]={digest:requestDigest,status:'pending',phase,attempt:prior ? (prior.attempt||1)+1 : 1};
        return s;
      }catch(error){failure=error;return undefined;}
    });
    if(!acquired.committed)throw failure||new ReceptionError('conflict',409);
    const s=normalizeSession(acquired.value);
    if(s.requests[requestId].status==='done')return response(s);
    const {attempt}=s.requests[requestId];
    const c=s.caseData[s.caseIndex],state=s.caseStates[s.caseIndex],profile=correspondenceProfiles.private(c);
    let reservation,usage;
    const controller=new AbortController();
    try{
      if(provider.ready===false||typeof provider.reviewDecision!=='function')fail('reviewer_unavailable',503);
      const decision=phase==='initial'?state.correspondenceDraft:state.decision;
      const evidence=phase==='initial'?await resolveCorrespondenceCitations(c,state,decision.correspondence,s.locale,{resolveLegalCitation,signal:controller.signal}):
        copy(state.correspondenceEvidence||[]);
      const operational=phase==='initial'?correspondenceOperational(c,decision,s.workbookVersion,s.context):null;
      const context=buildCorrespondenceReview(c,state,decision,s.locale,{
        profile,resolvedCitations:evidence,phase,control:phase==='control'?state.controlDraft:null,operational,
        workbook:[LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(s.workbookVersion)?localized(publicWorkbook(c,s.workbookVersion,{gameplay:Boolean(s.context)}),s.locale):null,
      });
      const estimate=estimateReviewReservation({context});
      if(estimate.perCallInputTokens>limits.maxInputAllowance)fail('context_limit',413);
      // Every failed attempt has a separately charged receipt. A successful request
      // is returned from the session ledger without invoking the reviewer again.
      reservation=await reserve(s,requestId,estimate.micros,attempt);
      let timeout,generated;
      const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{
        controller.abort();reject(new ReceptionError('review_unavailable',503));
      },limits.reviewTimeoutMs);});
      try{generated=await Promise.race([provider.reviewDecision({context,signal:controller.signal}),deadline]);}
      finally{clearTimeout(timeout);}
      usage=generated?.usage;
      if(generated?.verified!==true)fail('review_unconfirmed',503);
      const feedback=scoreCorrespondenceReview(generated.review,context);
      const finished=await store.transaction('sessions/'+s.id,old=>{
        const current=normalizeSession(old);
        if(!current||current.lease?.id!==leaseId||current.caseIndex!==s.caseIndex)return undefined;
        const st=current.caseStates[current.caseIndex];
        if(phase==='initial'){
          st.decision=copy(decision);st.correspondenceEvidence=copy(evidence);
          st.correspondenceInitialFeedback=copy(feedback);st.correspondenceDraft=null;
          if(c.followup){st.feedback=null;current.status='followup';}
          else{st.feedback=feedback;current.results.push(feedback);current.status='review';}
        }else{
          st.control=copy(state.controlDraft);st.controlDraft=null;
          st.correspondenceControlFeedback=copy(feedback);
          st.feedback=combineCorrespondenceFeedback(st.correspondenceInitialFeedback,feedback);
          current.results.push(st.feedback);current.status='review';
        }
        st.reviewPending=null;
        current.requests[requestId]={digest:requestDigest,status:'done',phase,attempt,reviewContextHash:hash(context),
          ...(generated.reviewModels?.assessment && generated.reviewModels?.verification ? {reviewModels:generated.reviewModels} : {})};
        current.lease=null;current.revision++;current.updatedAt=clock();return current;
      });
      if(!finished.committed)fail('request_interrupted',409);
      return response(finished.value);
    }catch(error){
      const safe=error instanceof ReceptionError?error:new ReceptionError('review_unavailable',503);
      await store.transaction('sessions/'+s.id,old=>{
        const current=normalizeSession(old);
        if(!current||current.lease?.id!==leaseId)return undefined;
        current.requests[requestId]={digest:requestDigest,status:'failed',phase,attempt};
        current.caseStates[current.caseIndex].reviewPending={requestId,phase,status:'retry',code:safe.code};
        current.lease=null;return current;
      });
      throw safe;
    }finally{controller.abort();if(reservation)await settle(reservation,usage);}
  }

  async function handle(body, identity) {
    checkIdentity(identity); if (!body || !Object.hasOwn(allowed, body.op)) fail('invalid_operation'); fields(body, allowed[body.op]);
    if (body.context!==undefined && !['seminar','free'].includes(body.context)) fail('invalid_context');
    if(body.workbookVersion!==undefined&&![LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(body.workbookVersion))fail('invalid_workbook');
    if(body.decisionVersion!==undefined&&body.decisionVersion!==DECISION_VERSION)fail('invalid_decision_version');
    if (body.buildId !== undefined && (typeof body.buildId !== 'string' || !/^[a-f0-9]{32}$/.test(body.buildId))) fail('invalid_build');
    if (identity.guest) {
      if (Object.hasOwn(body, 'studentKey')) fail('forbidden', 403);
      if (['catalog', 'start', 'recover'].includes(body.op) && body.context !== 'free') fail('forbidden', 403);
      if (['start', 'recover'].includes(body.op) && body.mode !== 'training') fail('forbidden', 403);
      if (body.op === 'start' && (body.workbookVersion !== WORKBOOK_VERSION || body.decisionVersion !== DECISION_VERSION)) fail('invalid_workbook');
      if (!guestEnabled && ['start', 'message', 'decide', 'followup'].includes(body.op)) fail('guest_unavailable', 503);
    }
    if (body.op === 'catalog') return {ok: true, cases: (await catalogue()).filter(c=>(!body.workbookVersion||supportsWorkbook(c,body.workbookVersion))&&
      (!body.decisionVersion||Boolean(correspondenceProfiles.private(c)))).map(c => ({id: c.id, title: localized(c.public.title, locale(body.locale)), ...publicMetadata(c)}))};
    if (body.op === 'start') return start(body, identity);
    if (body.op === 'resume') {
      const session=await get(body.sessionId, identity);
      const historicalResult = session.status==='complete' && !session.context;
      if(body.context && session.context!==body.context && !historicalResult)fail('outdated_session',409);
      if((body.buildId && session.buildId!==body.buildId||body.workbookVersion&&session.workbookVersion!==body.workbookVersion) && session.status!=='complete') fail('outdated_session',409);
      if(body.decisionVersion&&session.decisionVersion!==body.decisionVersion&&session.status!=='complete')fail('outdated_session',409);
      return response(session);
    }
    if (body.op === 'recover') return recover(body, identity);
    if (body.op === 'message') return message(body, identity);
    if(['decide','followup'].includes(body.op)){
      const session=await get(body.sessionId,identity);
      if(session.decisionVersion===DECISION_VERSION)return reviewCorrespondence(body,identity);
      if(body.control!==undefined||body.decision?.correspondence!==undefined)fail('invalid_decision_version');
    }
    if (body.op === 'locale') {
      const language = locale(body.locale); let failure;
      const r = await store.transaction(`sessions/${identifier(body.sessionId)}`, old => {
        const s = normalizeSession(old); try { own(s, identity); if (s.lease && s.lease.until > clock()) fail('busy', 409); s.locale = language; s.revision++; s.updatedAt = clock(); return s; }
        catch (error) { failure = error; return undefined; }
      });
      if (!r.committed) throw failure; return response(r.value);
    }
    const s = await mutate(body, identity, (session,timestamp) => {
      const c = session.caseData[session.caseIndex], state = session.caseStates[session.caseIndex];
      if (body.op === 'document') {
        if (session.status !== 'active' || !state.releasedDocumentIds.includes(body.documentId)) fail('document_unavailable', 403);
        const doc = c.documents.find(d => d.id === body.documentId);
        state.openedDocumentIds = [...new Set([...state.openedDocumentIds, doc.id])];
        state.knownFactIds = [...new Set([...state.knownFactIds, ...doc.factIds])];
      } else if (body.op === 'decide') {
        if (session.status !== 'active' || state.decision) fail('not_active', 409);
        const rawDecision=copy(body.decision);let workbook;
        if([LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(session.workbookVersion)){
          let rawWorkbook=rawDecision?.workbook;
          const useCitation=usesLegalCitation(session.context,session.workbookVersion);
          if(useCitation && rawWorkbook && typeof rawWorkbook==='object' && !Array.isArray(rawWorkbook)){
            const {legalCitation,...fields}=rawWorkbook;
            workbook=validateWorkbookDecision(fields,session.workbookVersion);
            const citation=validateLegalCitation(legalCitation);
            if(citation)workbook.legalCitation=citation;
          } else workbook=validateWorkbookDecision(rawWorkbook,session.workbookVersion);
          delete rawDecision.workbook;
        }
        const procedure=fixedProcedure(c,session.context);
        if(procedure && rawDecision && typeof rawDecision==='object' && !Array.isArray(rawDecision))rawDecision.procedureId=procedure;
        const decision = validateDecision(rawDecision, c, state.openedDocumentIds,{knowledgeQuiz:session.workbookVersion!==2});
        if(workbook)decision.workbook=workbook;
        state.decision=decision;
        if(c.followup){state.feedback=null;session.status='followup';}
        else {const feedback=scoreDecision(c,state,decision,session.workbookVersion,session.context);state.feedback=feedback;session.results.push(feedback);session.status='review';}
      } else if(body.op==='followup'){
        if(session.status!=='followup'||!state.decision||state.followupChoiceId)fail('not_active',409);
        if(!c.followup?.options.some(option=>option.id===body.choiceId))fail('invalid_decision');
        state.followupChoiceId=body.choiceId;const feedback=scoreDecision(c,state,state.decision,session.workbookVersion,session.context);
        state.feedback=feedback;session.results.push(feedback);session.status='review';
      } else if (body.op === 'next') {
        if (session.status !== 'review') fail('not_reviewed', 409);
        if (session.caseIndex + 1 < session.caseData.length) {
          session.caseIndex++; session.status = 'active';
          // A not-yet-opened case starts in the currently selected language.
          // Earlier dialogue is historical and is never rewritten on locale change.
          session.caseStates[session.caseIndex] = initialState(session.caseData[session.caseIndex], session.locale, clock(),session.context);
        }
        else {
          session.status = 'complete'; const raw = session.results.reduce((sum,r)=>sum+r.score,0)/session.results.length;
          const critical=session.results.some(r=>r.authored&&r.criticalIds?.length),bounded=critical?Math.min(raw,60):raw;
          const total=session.results.some(r=>r.authored)?bounded:Math.round(bounded*10)/10;
          const points = session.context==='seminar' ? Number(Math.abs(bounded-100)<1e-8) : Math.round(total / 20 * 10) / 10;
          session.result = {points, maxPoints: 5, total, raw, cap:critical?60:null, attemptId: `reception-ai-${session.id}`, caseCount: session.caseData.length,
            ...(session.context==='seminar'?{completedAt:timestamp}: {})};
        }
      }
    });
    return response(s);
  }
  return {handle};
}
