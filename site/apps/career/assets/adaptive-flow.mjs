import {getLanguage} from './i18n.mjs';
import {storageKey, readLocal, writeLocal} from './storage.mjs';
import {loadJSON, isRecord} from './loader.mjs';
import {decodeGzip} from './employer-vacancies-bank.mjs';
import {ADAPTIVE_INDEX_SCHEMA_VERSION, decodeCandidatePayload} from './adaptive-index-codec.mjs';
import {E, L, icon, regionName, safeURL} from './journey-visuals.mjs';
import {FUNCTIONAL_MODEL_VERSION, MIN_ANSWERS, MAX_ANSWERS, buildQuestionBank, prepareCandidatePool, nextQuestion, rankVacancies, listMatchingVacancies, shouldFinish, makeCompletionRecord} from './adaptive-model.mjs';
import {createAdaptiveBankBrowse} from './adaptive-bank-browse.mjs';
import {createAdaptiveVacancyReview} from './adaptive-vacancy-review.mjs';
import {createAdaptiveEmployerCards} from './adaptive-employer-card.mjs';
import {createRegionPicker} from './region-picker.mjs';
import {FUNCTIONAL_SESSION_KEY,VACANCY_REVIEW_KEY,seminar5ReviewComplete,seminar5ReviewTarget} from './seminar-progress.mjs';

const SESSION_SCHEMA = 1;
const SESSION_MODEL = FUNCTIONAL_MODEL_VERSION;
const INDEX_ROOT = 'data/adaptive-index/';
const MIB = 1024 * 1024;
const MAX_RAW = {all:128 * MIB, national:32 * MIB, region:16 * MIB, detail:4 * MIB};
const CAREER_ROUTES = new Set(['preferences', 'test', 'sectors', 'conditions', 'results', 'review']);
const RESPONSIBILITY_PREFERENCES = new Set(['specialist', 'leadership', 'all']);
const EVIDENCE_CATEGORIES = new Set(['duties', 'skills', 'knowledge']);
const DETAIL_CACHE_LIMIT = 8;
const DETAIL_CONCURRENCY = 2;
const validRegion = value => typeof value === 'string' && /^ru-\d{2}$/.test(value);
const validValue = value => Number.isInteger(value) && value >= 0 && value <= 5;
const validSelectionSeed = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const newSelectionSeed = () => (globalThis.crypto?.randomUUID?.() || Date.now().toString(16)+Math.random().toString(16).slice(2)).replace(/-/g,'').slice(0,32).padEnd(32,'0');
const localized = value => typeof value === 'string' ? value : value?.[getLanguage()] || value?.ru || '';
const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const snippet = (value, maximum = 500) => {
  const text = compact(value);
  if (text.length <= maximum) return text;
  const boundary = text.lastIndexOf(' ', maximum);
  return text.slice(0, boundary > maximum * .6 ? boundary : maximum).trimEnd() + '…';
};

function validDescriptor(value, kind) {
  const pattern = kind === 'all' ? /^data\/adaptive-index\/all\.json\.gz$/
    : kind === 'region' ? /^data\/adaptive-index\/regions\/(?:ru-\d{2}|unknown)\.json\.gz$/
    : kind === 'national' ? /^data\/adaptive-index\/national\/n\d{4}\.json\.gz$/
    : /^data\/adaptive-index\/details\/d\d{4}\.json\.gz$/;
  return isRecord(value) && pattern.test(value.path || '') &&
    Number.isSafeInteger(value.count) && value.count >= 0 &&
    Number.isInteger(value.bytes) && value.bytes >= 18 && value.bytes <= 32 * MIB &&
    Number.isInteger(value.uncompressedBytes) && value.uncompressedBytes > 0 && value.uncompressedBytes <= MAX_RAW[kind] &&
    /^[a-f0-9]{64}$/.test(value.sha256 || '');
}

function validateManifest(value) {
  return isRecord(value) && value.schemaVersion === ADAPTIVE_INDEX_SCHEMA_VERSION && typeof value.version === 'string' &&
    value.version.startsWith(FUNCTIONAL_MODEL_VERSION + '-') && value.version.length <= 128 &&
    typeof value.taxonomyVersion === 'string' && value.taxonomyVersion.length > 0 && value.taxonomyVersion.length <= 128 &&
    validDescriptor(value.all, 'all') && Array.isArray(value.nationalParts) && value.nationalParts.length <= 10000 &&
    value.nationalParts.every(item => validDescriptor(item, 'national')) &&
    value.nationalParts.reduce((sum, item) => sum + item.count, 0) === value.all.count &&
    new Set(value.nationalParts.map(item => item.path)).size === value.nationalParts.length &&
    Array.isArray(value.shards) && value.shards.length <= 90 &&
    value.shards.every(item => (item.regionId === null || validRegion(item.regionId)) && validDescriptor(item, 'region')) &&
    Array.isArray(value.details) && value.details.length <= 10000 && value.details.every(item => validDescriptor(item, 'detail')) &&
    new Set(value.shards.map(item => item.regionId)).size === value.shards.length &&
    new Set(value.details.map(item => item.path)).size === value.details.length;
}

async function boundedBytes(response, expected, signal) {
  const announced = Number(response.headers?.get('content-length'));
  if (Number.isFinite(announced) && announced > expected) throw new Error('Adaptive index size mismatch');
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== expected) throw new Error('Adaptive index size mismatch');
    return bytes;
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > expected) throw new Error('Adaptive index size mismatch');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  }
  if (size !== expected) throw new Error('Adaptive index size mismatch');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
  return bytes;
}

async function loadPacked(descriptor, kind, parentSignal) {
  if (!validDescriptor(descriptor, kind)) throw new Error('Invalid adaptive index descriptor');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  parentSignal?.addEventListener('abort', abort, {once:true});
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {controller.abort(); reject(new DOMException('Adaptive index loading timed out', 'TimeoutError'));}, 30000);
  });
  const request = (async () => {
    const response = await fetch(descriptor.path, {cache:'no-store', signal:controller.signal});
    if (!response.ok) throw new Error('Adaptive index HTTP ' + response.status);
    const bytes = await boundedBytes(response, descriptor.bytes, controller.signal);
    if (globalThis.crypto?.subtle) {
      const hash = [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (hash !== descriptor.sha256) throw new Error('Adaptive index checksum mismatch');
    }
    const raw = await decodeGzip(bytes, {expectedBytes:descriptor.uncompressedBytes, maxBytes:MAX_RAW[kind]});
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(raw));
    if (!isRecord(value) || value.schemaVersion !== ADAPTIVE_INDEX_SCHEMA_VERSION || !Array.isArray(value.rows) || value.rows.length !== descriptor.count) throw new Error('Invalid adaptive index payload');
    return value;
  })();
  try {return await Promise.race([request, deadline]);}
  finally {clearTimeout(timer); parentSignal?.removeEventListener('abort', abort);}
}

/** The course-facing functional assessment. Personality data is intentionally not accessed. */
export function createAdaptiveFlow({navigate, authorities = []}) {
  const key = storageKey(FUNCTIONAL_SESSION_KEY);
  const empty = () => ({schemaVersion:SESSION_SCHEMA, modelVersion:SESSION_MODEL, questionnaireVersion:null, indexVersion:null,
    regionIds:[], locationConfirmed:false, responsibilityPreference:null, responsibilityDraft:null,
    setupComplete:false, setupStep:'location', locationDraft:null, answers:[], pending:null, completedAt:null, resultRecordId:null, completion:null,
    reviewTarget:null, reviewCompletion:null, selectionSeed:newSelectionSeed()});
  let session = empty(), hydrationChanged = false, corruptStorage = false;
  function restoreSession(saved) {
    const migrating = isRecord(saved) && saved.schemaVersion === SESSION_SCHEMA &&
      saved.modelVersion === 'functional-1.0.0' && SESSION_MODEL === 'functional-2.0.0';
    if (!isRecord(saved) || saved.schemaVersion !== SESSION_SCHEMA ||
      (!migrating && (saved.modelVersion !== SESSION_MODEL || !Array.isArray(saved.answers)))) throw new Error('Incompatible functional-career draft');
    const regionIds = [...new Set((Array.isArray(saved.regionIds) ? saved.regionIds : []).filter(validRegion))].slice(0, 89);
    const regionInvalid = !Array.isArray(saved.regionIds) || regionIds.length !== saved.regionIds.length;
    const locationConfirmed = !regionInvalid && (saved.locationConfirmed === true || saved.setupComplete === true);
    const responsibilityPreference = RESPONSIBILITY_PREFERENCES.has(saved.responsibilityPreference) ? saved.responsibilityPreference : null;
    const setup = {regionIds, locationConfirmed, responsibilityPreference,
      setupComplete:saved.setupComplete === true && locationConfirmed && responsibilityPreference !== null,
      setupStep:locationConfirmed && saved.setupStep !== 'location' ? 'responsibility' : 'location'};
    hydrationChanged = migrating || regionInvalid || saved.answers.length > MAX_ANSWERS;
    // Recognized earlier results are not evidence for the new model. Keep only confirmed setup choices.
    if (migrating) return {...empty(), ...setup};
    return {...empty(), ...saved, ...setup,
      reviewTarget:seminar5ReviewTarget(saved.reviewTarget),
      selectionSeed:validSelectionSeed(saved.selectionSeed) ? saved.selectionSeed : saved.completedAt ? '' : newSelectionSeed(),
      responsibilityDraft:RESPONSIBILITY_PREFERENCES.has(saved.responsibilityDraft) ? saved.responsibilityDraft : null,
      answers:saved.answers.slice(0, MAX_ANSWERS),
      pending:isRecord(saved.pending) && typeof saved.pending.questionId === 'string' && validValue(saved.pending.value) ? saved.pending : null};
  }
  try {
    const raw = readLocal(key);
    if (raw) {
      session = restoreSession(JSON.parse(raw));
    } else {
      // Preserve an earlier location choice without importing the old questionnaire or wishes.
      try {
        const previous = JSON.parse(readLocal(storageKey('career-journey-v1')) || 'null');
        if (isRecord(previous) && Array.isArray(previous.regionIds)) session.regionIds = [...new Set(previous.regionIds.filter(validRegion))].slice(0, 89);
      } catch {/* A damaged legacy preference record cannot block the new assessment. */}
    }
  } catch {corruptStorage = true;}

  let taxonomy = null, manifest = null, territories = [], questions = new Map();
  let metadataReady = false, metadataLoading = false, metadataError = false, metadataPromise = null;
  let candidates = [], candidateKey = '', poolLoading = false, poolError = false, poolGeneration = 0, poolController = null, poolPromise = null;
  let lastRoute = 'personality', dirty = false, saveFailed = false, opening = false, transitionBusy = false;
  let regionQuery = '', regionMode = session.regionIds.length ? 'selected' : 'all', draftRegions = [...session.regionIds];
  let locationPicker = null;
  if (isRecord(session.locationDraft) && ['all', 'selected'].includes(session.locationDraft.mode) && Array.isArray(session.locationDraft.regionIds)) {
    regionMode = session.locationDraft.mode;
    draftRegions = [...new Set(session.locationDraft.regionIds.filter(validRegion))].slice(0, 89);
  }
  let rankingCache = null, questionCache = null, notifiedRecordId = null;
  const detailCache = new Map(), detailPending = new Map(), detailErrors = new Set();
  let detailGeneration = 0, detailSelection = '', detailQueue = [];
  let matchBrowseOpen = false, matchOffset = 0, matchQuery = '', expandedMatchId = null;
  const review = createAdaptiveVacancyReview({
    onClose:() => navigate('results'),
    onSelect:target => {if(JSON.stringify(target)!==JSON.stringify(session.reviewTarget))save({...session,reviewTarget:target});},
    onComplete:proof => save({...session,reviewTarget:proof.target,reviewCompletion:{schemaVersion:1,resultRecordId:session.resultRecordId,...proof}}),
    isCompleted:target => target?.vacancyId===session.reviewCompletion?.target?.vacancyId && hasReviewCompletion(),
    onOpenKnowledge:goToKnowledge
  });
  const bankBrowse = createAdaptiveBankBrowse({onReview:(row,descriptor,pageRef,pageRows) => {void review.open(row,descriptor,pageRef,pageRows); navigate('review');}});
  const employerCards = createAdaptiveEmployerCards(authorities);
  const resultRoot = () => document.querySelector('#results-root');
  const questionRoot = () => document.querySelector('#view-test');
  const preferenceRoot = () => document.querySelector('#journey-preferences-root');
  const live = () => !__careerHost.destroyed;
  const poolIdentity = () => manifest?.version + '|' + [...session.regionIds].sort().join(',') + '|' + session.responsibilityPreference;

  function save(next = session) {
    if (corruptStorage) {saveFailed = true; return false;}
    try {
      writeLocal(key, JSON.stringify({...next, updatedAt:new Date().toISOString()}));
      session = next; dirty = false; saveFailed = false;
      __careerHost.progressChanged?.();
      return true;
    } catch {
      dirty = true; saveFailed = true;
      return false;
    }
  }

  function saveError() {
    return saveFailed || corruptStorage ? `<div class="adaptive-save-error" role="alert"><span>${L('Не удалось сохранить ответы. Оставьте эту вкладку открытой.', 'Answers could not be saved. Keep this tab open.', '无法保存答案。请保持此页面打开。')}</span><button type="button" class="adaptive-text-button" data-adaptive-save-retry>${L('Повторить', 'Retry', '重试')}</button></div>` : '';
  }

  function bindSaveRetry(root) {
    root?.querySelector('[data-adaptive-save-retry]')?.addEventListener('click', () => {
      if (corruptStorage) {
        // Re-observe only for a read retry; never overwrite an unreadable record.
        try {
          session = restoreSession(JSON.parse(readLocal(key) || 'null'));
          corruptStorage = false;
          if (metadataReady) validateSession();
          resetCandidatePool();
        } catch {}
      }
      if (!corruptStorage) save();
      render(lastRoute);
    });
  }

  function invalidateCompletion(value) {
    return {...value, completedAt:null, resultRecordId:null, completion:null, reviewTarget:null, reviewCompletion:null};
  }

  function hasReviewCompletion() {
    const id=session.reviewCompletion?.target?.vacancyId;
    if(!id)return false;
    const markKey=VACANCY_REVIEW_KEY+id;
    try {return seminar5ReviewComplete(session,{[markKey]:readLocal(storageKey(markKey))});}
    catch {return false;}
  }

  async function goToKnowledge() {
    if(opening||saveFailed||corruptStorage||!hasReviewCompletion())throw new Error('Vacancy review required');
    if(notifiedRecordId!==session.resultRecordId) {
      __careerHost.resultCalculated(session.completion);
      notifiedRecordId=session.resultRecordId;
    }
    opening=true;
    try {await __careerHost.openKnowledge();}
    finally {opening=false;}
  }

  function validateSession() {
    const validIds = new Set(territories.map(region => region.id)), seen = new Set();
    const clean = [], coreIds = [...questions.values()].filter(question => question.broad).map(question => question.id);
    for (const answer of session.answers || []) {
      if (!isRecord(answer) || !questions.has(answer.questionId) || seen.has(answer.questionId) || !validValue(answer.value)) break;
      if (clean.length < coreIds.length && answer.questionId !== coreIds[clean.length]) break;
      seen.add(answer.questionId); clean.push({questionId:answer.questionId, value:answer.value});
    }
    const wrongVersion = session.questionnaireVersion && session.questionnaireVersion !== taxonomy.version;
    const wrongIndex = session.indexVersion && session.indexVersion !== manifest.version;
    const changed = hydrationChanged || clean.length !== session.answers.length || wrongVersion || wrongIndex;
    if (wrongVersion) session = invalidateCompletion({...session, answers:[], pending:null});
    else if (changed) session = invalidateCompletion({...session, answers:clean, pending:null});
    else session.answers = clean;
    if (session.pending && (!questions.has(session.pending.questionId) || seen.has(session.pending.questionId))) session.pending = null;
    const oldRegions = session.regionIds;
    session.regionIds = session.regionIds.filter(id => validIds.has(id));
    if (oldRegions.length !== session.regionIds.length) {
      session = invalidateCompletion({...session, setupComplete:false, locationConfirmed:false, setupStep:'location'});
      draftRegions = [...session.regionIds]; regionMode = draftRegions.length ? 'selected' : 'all';
    }
    if (!RESPONSIBILITY_PREFERENCES.has(session.responsibilityPreference)) {
      session = invalidateCompletion({...session, responsibilityPreference:null, setupComplete:false,
        setupStep:session.locationConfirmed ? 'responsibility' : 'location'});
      dirty = true;
    }
    if (!session.locationConfirmed) session = invalidateCompletion({...session, setupComplete:false, setupStep:'location'});
    if (!RESPONSIBILITY_PREFERENCES.has(session.responsibilityDraft)) session.responsibilityDraft = null;
    session.questionnaireVersion = taxonomy.version;
    session.indexVersion = manifest.version;
    draftRegions = draftRegions.filter(id => validIds.has(id));
    const allCoreAnswered = coreIds.every(id => clean.some(answer => answer.questionId === id));
    const record = session.completion;
    const sameRegions = value => Array.isArray(value) && JSON.stringify([...value].sort()) === JSON.stringify([...session.regionIds].sort());
    const validCompletion = session.setupComplete && clean.length >= Math.min(MIN_ANSWERS, questions.size) && allCoreAnswered &&
      typeof session.completedAt === 'string' && Number.isFinite(Date.parse(session.completedAt)) &&
      typeof session.resultRecordId === 'string' && /^[\w-]{8,80}$/.test(session.resultRecordId) &&
      isRecord(record) && record.schema === 'rudn-career-result' && record.schemaVersion === 3 && record.resultKind === 'vacancy-functional' && record.completed === true &&
      record.recordId === session.resultRecordId && record.createdAt === session.completedAt && record.modelVersion === SESSION_MODEL &&
      record.questionnaireVersion === taxonomy.version && record.registryVersion === manifest.version && record.answerCount === clean.length &&
      record.informativeAnswers === clean.filter(answer => answer.value !== 0 && answer.value !== 3).length &&
      JSON.stringify(record.answeredQuestionIds) === JSON.stringify(clean.map(answer => answer.questionId)) &&
      JSON.stringify(record.broadQuestionIds) === JSON.stringify(coreIds) && sameRegions(record.regionIds) &&
      record.responsibilityPreference === session.responsibilityPreference &&
      ['matched', 'no-preference', 'no-matches'].includes(record.resultStatus) && Array.isArray(record.ranking) && record.ranking.length <= 5 &&
      (record.resultStatus === 'matched' ? record.ranking.length > 0 : record.ranking.length === 0);
    if (session.completedAt && !validCompletion) {session = invalidateCompletion(session); dirty = true;}
    hydrationChanged = false;
    if (changed) {dirty = true; questionCache = null;}
  }

  async function ensureMetadata(force = false) {
    if (metadataReady && !force) return true;
    if (metadataPromise) return metadataPromise;
    metadataLoading = true; metadataError = false;
    metadataPromise = (async () => {
      try {
        const [nextTaxonomy, nextManifest, nextTerritories] = await Promise.all([
          loadJSON('data/adaptive-taxonomy.json', {validate:value => isRecord(value) && value.schemaVersion === 1 && typeof value.version === 'string' && Array.isArray(value.facets) && value.facets.length > 0}),
          loadJSON(INDEX_ROOT + 'manifest.json', {validate:validateManifest}),
          loadJSON('data/territories.json', {validate:value => Array.isArray(value) && value.length <= 100 && value.every(region => validRegion(region.id))})
        ]);
        if (!live()) return false;
        if (nextManifest.taxonomyVersion !== nextTaxonomy.version) throw new Error('Functional questionnaire/index version mismatch');
        if (manifest && manifest.version !== nextManifest.version) {
          resetCandidatePool();
          detailCache.clear();
        }
        taxonomy = nextTaxonomy; manifest = nextManifest; territories = nextTerritories;
        const bank = buildQuestionBank(taxonomy);
        questions = new Map(bank.map(question => [question.id, question]));
        questionCache = null;
        if (!questions.size || questions.size !== bank.length) throw new Error('Invalid functional question bank');
        validateSession(); metadataReady = true;
        return true;
      } catch (error) {
        if (live() && error.name !== 'AbortError') metadataError = true;
        return false;
      } finally {
        metadataLoading = false; metadataPromise = null;
        if (live() && CAREER_ROUTES.has(lastRoute)) render(lastRoute);
      }
    })();
    return metadataPromise;
  }

  async function ensureCandidates(force = false) {
    if (!metadataReady || !session.setupComplete || !RESPONSIBILITY_PREFERENCES.has(session.responsibilityPreference)) return false;
    const wanted = poolIdentity();
    if (candidateKey === wanted && !poolError && !force) return true;
    if (poolLoading && poolPromise && poolController?.wanted === wanted && !force) return poolPromise;
    poolController?.abort();
    const controller = new AbortController(), ticket = ++poolGeneration;
    controller.wanted = wanted; poolController = controller;
    poolLoading = true; poolError = false; candidates = []; candidateKey = ''; rankingCache = null; questionCache = null;
    poolPromise = (async () => {
      try {
        const regionIds = new Set(session.regionIds), responsibilityPreference = session.responsibilityPreference;
        const regional = regionIds.size > 0;
        const selected = regional ? manifest.shards.filter(shard => regionIds.has(shard.regionId)) : manifest.nationalParts;
        const concurrency = regional ? 4 : 2;
        const version = manifest.version;
        const featureIds = new Set([...taxonomy.facets.map(facet => facet.id),
          ...[...questions.values()].filter(question => !question.broad).map(question => question.id)]);
        const profileCache = new Map();
        const gathered = [], seenIds = new Set();
        // A selected region with no records is an empty pool, never a nationwide fallback.
        for (let index = 0; index < selected.length; index += concurrency) {
          const part = await Promise.all(selected.slice(index, index + concurrency).map(async descriptor => {
            const payload = await loadPacked(descriptor, regional ? 'region' : 'national', controller.signal);
            return decodeCandidatePayload(payload, {version, count:descriptor.count, featureIds, profileCache});
          }));
          if (!live() || controller.signal.aborted || ticket !== poolGeneration) return false;
          for (const rows of part) {
            for (const row of rows) {
              if (regional && !regionIds.has(row.regionId)) throw new Error('Vacancy outside selected regions');
              if (seenIds.has(row.id)) throw new Error('Duplicate functional vacancy identity');
              seenIds.add(row.id);
              if (responsibilityPreference === 'all' || row.responsibilityLevel === responsibilityPreference) gathered.push(row);
            }
          }
        }
        if (!live() || controller.signal.aborted || ticket !== poolGeneration) return false;
        prepareCandidatePool({taxonomy, candidates:gathered});
        candidates = gathered; candidateKey = wanted;
        return true;
      } catch (error) {
        if (ticket === poolGeneration && live() && error.name !== 'AbortError') poolError = true;
        controller.abort();
        return false;
      } finally {
        if (ticket === poolGeneration) {poolLoading = false; poolPromise = null;}
        if (live() && ticket === poolGeneration && ['test', 'results'].includes(lastRoute)) render(lastRoute);
      }
    })();
    return poolPromise;
  }

  function loadingMarkup(error, retryId) {
    return `<div class="adaptive-status" data-no-i18n ${error ? 'role="alert"' : 'role="status" aria-live="polite"'}><h1>${error ? L('Не удалось загрузить тест', 'The assessment could not be loaded', '无法加载测试') : L('Загрузка…', 'Loading…', '加载中……')}</h1>${error ? `<button type="button" class="button button-primary" id="${retryId}">${L('Повторить', 'Retry', '重试')}${icon('reset')}</button>` : '<span class="adaptive-loading-dot" aria-hidden="true"></span>'}</div>`;
  }

  function readyFor(root, needsPool = false) {
    root.setAttribute('data-no-i18n', '');
    if (!metadataReady) {
      root.innerHTML = loadingMarkup(metadataError, 'adaptive-retry-metadata');
      root.querySelector('#adaptive-retry-metadata')?.addEventListener('click', () => {void ensureMetadata(true); render(lastRoute);});
      if (!metadataLoading && !metadataError) void ensureMetadata();
      return false;
    }
    if (needsPool && (candidateKey !== poolIdentity() || poolLoading || poolError)) {
      root.innerHTML = loadingMarkup(poolError, 'adaptive-retry-pool');
      root.querySelector('#adaptive-retry-pool')?.addEventListener('click', () => {void ensureCandidates(true); render(lastRoute);});
      if (!poolLoading && !poolError) void ensureCandidates();
      return false;
    }
    return true;
  }

  function destroyLocationPicker() {
    if (!locationPicker) return;
    regionQuery = locationPicker.getQuery().slice(0, 100);
    locationPicker.destroy();
    locationPicker = null;
  }

  function mountLocationPicker(root) {
    if (locationPicker || regionMode !== 'selected') return;
    locationPicker = createRegionPicker({
      root:root.querySelector('#adaptive-region-picker'),
      regions:territories,
      selectedIds:draftRegions,
      initialQuery:regionQuery,
      mapFirst:true,
      getLanguage,
      emptySelectionText:() => L('Выберите хотя бы один регион на карте или в списке.', 'Choose at least one region on the map or in the list.', '请在地图或列表中至少选择一个地区。'),
      onChange(ids) {
        draftRegions = ids;
        root.querySelector('#adaptive-location-next').disabled = !draftRegions.length;
        saveLocationDraft(root);
      }
    });
  }

  function saveLocationDraft(root) {
    session.locationDraft = {mode:regionMode, regionIds:[...draftRegions]};
    dirty = true; save();
    root.querySelector('#adaptive-save-feedback').innerHTML = saveError();
    bindSaveRetry(root);
  }

  function resetCandidatePool() {
    poolController?.abort(); poolGeneration += 1; poolLoading = false; poolPromise = null;
    candidateKey = ''; candidates = []; rankingCache = null; questionCache = null; notifiedRecordId = null;
    resetDetailRequests();
  }

  function renderResponsibility(root) {
    const selected = session.responsibilityDraft || session.responsibilityPreference;
    const options = [
      {id:'specialist', label:L('Лично выполнять профессиональные задачи', 'Carry out professional tasks myself', '亲自完成专业工作任务')},
      {id:'leadership', label:L('Руководить сотрудниками и отвечать за работу подразделения', 'Lead employees and take responsibility for a department’s work', '领导员工并对部门工作负责')},
      {id:'all', label:L('Рассматриваю оба варианта', 'I am considering both options', '两种方向都考虑')}
    ];
    root.innerHTML = `<div class="adaptive-workflow adaptive-responsibility">
      <header class="adaptive-topline"><button type="button" class="adaptive-back" id="adaptive-responsibility-back">${icon('arrow-left')}${L('Назад', 'Back', '返回')}</button></header>
      <h1 id="adaptive-responsibility-question">${L('Какая роль Вам ближе?', 'Which role appeals to you more?', '你更倾向于哪种角色？')}</h1>
      <div class="adaptive-responsibility-options" role="radiogroup" aria-labelledby="adaptive-responsibility-question">
        ${options.map(option => `<label class="adaptive-location-mode adaptive-responsibility-option"><input type="radio" name="adaptive-responsibility" value="${option.id}" data-adaptive-responsibility="${option.id}" ${selected === option.id ? 'checked' : ''}><span>${E(option.label)}</span></label>`).join('')}
      </div>
      <div id="adaptive-save-feedback">${saveError()}</div>
      <footer class="adaptive-controls"><button type="button" class="button button-primary" id="adaptive-responsibility-next" ${RESPONSIBILITY_PREFERENCES.has(selected) ? '' : 'disabled'}>${L('Продолжить', 'Continue', '继续')}${icon('arrow-right')}</button></footer>
    </div>`;
    root.querySelector('#adaptive-responsibility-back').onclick = () => {
      if (!save({...session, setupStep:'location'})) {root.querySelector('#adaptive-save-feedback').innerHTML = saveError(); bindSaveRetry(root); return;}
      navigate('preferences');
    };
    root.querySelectorAll('[data-adaptive-responsibility]').forEach(input => input.addEventListener('change', () => {
      session.responsibilityDraft = input.value; dirty = true; save();
      root.querySelector('#adaptive-responsibility-next').disabled = false;
      root.querySelector('#adaptive-save-feedback').innerHTML = saveError(); bindSaveRetry(root);
    }));
    root.querySelector('#adaptive-responsibility-next').onclick = () => {
      const responsibilityPreference = session.responsibilityDraft || session.responsibilityPreference;
      if (!RESPONSIBILITY_PREFERENCES.has(responsibilityPreference) || !session.locationConfirmed) return;
      const changed = responsibilityPreference !== session.responsibilityPreference;
      const next = {...session, responsibilityPreference, responsibilityDraft:null, setupComplete:true, setupStep:'responsibility'};
      const updated = changed ? invalidateCompletion({...next, answers:[], pending:null}) : next;
      if (!save(updated)) {root.querySelector('#adaptive-save-feedback').innerHTML = saveError(); bindSaveRetry(root); return;}
      if (changed) resetCandidatePool();
      navigate(resolveResumeRoute());
    };
    bindSaveRetry(root);
  }

  function renderPreferences() {
    destroyLocationPicker();
    const root = preferenceRoot();
    if (!root || !readyFor(root)) return;
    if (session.setupStep === 'responsibility' && session.locationConfirmed) {renderResponsibility(root); return;}
    root.innerHTML = `<div class="adaptive-workflow adaptive-location">
      <header class="adaptive-topline"><button type="button" class="adaptive-back" id="adaptive-location-back">${icon('arrow-left')}${L('Назад', 'Back', '返回')}</button></header>
      <h1>${L('Где Вы хотели бы работать?', 'Where would you like to work?', '你希望在哪里工作？')}</h1>
      <div class="adaptive-location-modes" role="radiogroup" aria-label="${E(L('Место работы', 'Work location', '工作地点'))}">
        <label class="adaptive-location-mode"><input type="radio" name="adaptive-location-mode" value="all" ${regionMode === 'all' ? 'checked' : ''}><span>${L('Без ограничений по региону', 'No region restriction', '不限地区')}</span></label>
        <label class="adaptive-location-mode"><input type="radio" name="adaptive-location-mode" value="selected" ${regionMode === 'selected' ? 'checked' : ''}><span>${L('В выбранных регионах', 'In selected regions', '所选地区')}</span></label>
      </div>
      <div id="adaptive-region-picker" class="adaptive-region-picker" ${regionMode === 'all' ? 'hidden' : ''}></div>
      <div id="adaptive-save-feedback">${saveError()}</div>
      <footer class="adaptive-controls"><button type="button" class="button button-primary" id="adaptive-location-next" ${regionMode === 'selected' && !draftRegions.length ? 'disabled' : ''}>${L('Продолжить', 'Continue', '继续')}${icon('arrow-right')}</button></footer>
    </div>`;
    root.querySelector('#adaptive-location-back').onclick = () => navigate('personality-results');
    root.querySelectorAll('input[name="adaptive-location-mode"]').forEach(input => input.addEventListener('change', () => {
      regionMode = input.value;
      root.querySelector('#adaptive-region-picker').hidden = regionMode === 'all';
      mountLocationPicker(root);
      root.querySelector('#adaptive-location-next').disabled = regionMode === 'selected' && !draftRegions.length;
      saveLocationDraft(root);
    }));
    mountLocationPicker(root);
    root.querySelector('#adaptive-location-next').onclick = () => {
      if (regionMode === 'selected' && !draftRegions.length) return;
      const regionIds = regionMode === 'all' ? [] : [...draftRegions].sort();
      const changed = JSON.stringify([...session.regionIds].sort()) !== JSON.stringify(regionIds);
      const next = {...session, regionIds, locationConfirmed:true, setupComplete:false, setupStep:'responsibility', locationDraft:null,
        questionnaireVersion:taxonomy.version, indexVersion:manifest.version};
      // Questions selected for a different candidate pool must not survive a changed location silently.
      const updated = changed ? invalidateCompletion({...next, answers:[], pending:null}) : next;
      if (!save(updated)) {root.querySelector('#adaptive-save-feedback').innerHTML = saveError(); bindSaveRetry(root); return;}
      if (changed) resetCandidatePool();
      navigate('preferences');
    };
    bindSaveRetry(root);
  }

  function questionFor(answers) {
    const signature = JSON.stringify(answers);
    if (questionCache?.taxonomy === taxonomy && questionCache.candidates === candidates && questionCache.signature === signature) return questionCache.value;
    const value = nextQuestion({taxonomy, answers, candidates});
    questionCache = {taxonomy, candidates, signature, value};
    return value;
  }

  function currentQuestion() {
    if (!metadataReady || poolLoading || poolError || candidateKey !== poolIdentity()) return null;
    if (session.pending && questions.has(session.pending.questionId) && !session.answers.some(answer => answer.questionId === session.pending.questionId)) return questions.get(session.pending.questionId);
    return questionFor(session.answers);
  }

  const answerLabels = () => [
    {value:5, text:L('Очень интересно', 'Very interested', '非常感兴趣')},
    {value:4, text:L('Скорее интересно', 'Rather interested', '比较感兴趣')},
    {value:3, text:L('Нейтрально', 'Neutral', '态度中立')},
    {value:2, text:L('Скорее неинтересно', 'Rather uninterested', '不太感兴趣')},
    {value:1, text:L('Совсем неинтересно', 'Not at all interested', '完全不感兴趣')},
    {value:0, text:L('Пока не знаю', 'Not sure yet', '暂时不确定')}
  ];

  function chooseAnswer(value, {focus = false} = {}) {
    if (!validValue(value) || transitionBusy || poolLoading || !metadataReady) return;
    const question = currentQuestion();
    if (!question) return;
    session.pending = {questionId:question.id, value}; dirty = true;
    save();
    const root = questionRoot();
    root.querySelectorAll('[data-adaptive-answer]').forEach(button => {
      const selected = Number(button.dataset.adaptiveAnswer) === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected)); button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus({preventScroll:true});
    });
    root.querySelector('#adaptive-next').disabled = false;
    root.querySelector('#adaptive-save-feedback').innerHTML = saveError();
    bindSaveRetry(root);
  }

  function backQuestion() {
    if (transitionBusy) return;
    if (!session.answers.length) {navigate('preferences'); return;}
    const answers = session.answers.slice(), previous = answers.pop();
    const updated = invalidateCompletion({...session, answers, pending:{...previous}, selectionSeed:session.selectionSeed || newSelectionSeed()});
    if (!save(updated)) {render(lastRoute); return;}
    rankingCache = null; questionCache = null; notifiedRecordId = null;
    navigate('test');
  }

  function resultRanking() {
    const cacheKey = candidateKey + '|' + session.selectionSeed + '|' + JSON.stringify(session.answers);
    if (rankingCache?.key === cacheKey) return rankingCache.value;
    const value = rankVacancies({taxonomy, answers:session.answers, candidates, limit:5, selectionSeed:session.selectionSeed});
    rankingCache = {key:cacheKey, value};
    return value;
  }

  function completedSession(answers) {
    const ranking = rankVacancies({taxonomy, answers, candidates, limit:5, selectionSeed:session.selectionSeed});
    const record = makeCompletionRecord({taxonomy, answers, regionIds:session.regionIds,
      responsibilityPreference:session.responsibilityPreference, ranking, indexVersion:manifest.version});
    return {...session, answers, pending:null, completedAt:record.createdAt, resultRecordId:record.recordId, completion:record,
      reviewTarget:null,reviewCompletion:null};
  }

  function advanceQuestion() {
    if (transitionBusy || !session.pending || !metadataReady || poolLoading) return;
    const question = currentQuestion();
    if (!question || question.id !== session.pending.questionId) return;
    transitionBusy = true;
    try {
      const answers = [...session.answers, {questionId:question.id, value:session.pending.value}];
      const finished = shouldFinish({taxonomy, answers, candidates, selectionSeed:session.selectionSeed}) || !questionFor(answers);
      const updated = finished ? completedSession(answers) : invalidateCompletion({...session, answers, pending:null});
      if (!save(updated)) {renderQuestion(); return;}
      rankingCache = null;
      navigate(finished ? 'results' : 'test');
    } finally {transitionBusy = false;}
  }

  function renderQuestion() {
    const root = questionRoot();
    if (!root || !readyFor(root, !session.completedAt)) return;
    if(session.completedAt) {
      root.innerHTML=`<div class="adaptive-workflow adaptive-question-card"><h1>${L('Профессиональные интересы','Work interests','职业兴趣')}</h1>
        <p>${L(`Ответы сохранены: ${session.answers.length}.`,`Saved answers: ${session.answers.length}.`,`已保存 ${session.answers.length} 个回答。`)}</p>
        <div class="adaptive-result-controls"><button type="button" class="button button-secondary" id="adaptive-edit-saved">${L('Изменить ответы','Edit answers','修改回答')}</button>
        <button type="button" class="button button-primary" id="adaptive-saved-results">${L('К вакансиям','View roles','查看职位')}</button></div></div>`;
      root.querySelector('#adaptive-edit-saved').onclick=backQuestion;
      root.querySelector('#adaptive-saved-results').onclick=()=>navigate('results');
      return;
    }
    const question = currentQuestion();
    if (!question) {
      if (session.answers.length && save(completedSession(session.answers))) navigate('results');
      else {root.innerHTML = loadingMarkup(true, 'adaptive-retry-question'); root.querySelector('#adaptive-retry-question').onclick = () => renderQuestion();}
      return;
    }
    const selected = session.pending?.questionId === question.id ? session.pending.value : null;
    root.innerHTML = `<div class="adaptive-workflow">
      <header class="adaptive-topline"><button type="button" class="adaptive-back" id="adaptive-back">${icon('arrow-left')}${L('Назад', 'Back', '返回')}</button><span class="adaptive-counter">${L('Вопрос ', 'Question ', '问题 ')}${session.answers.length + 1}</span></header>
      <article class="adaptive-question-card">
        <p class="adaptive-prompt">${L('Насколько Вам интересно выполнять такую работу?', 'How interested are you in doing this work?', '你对从事这项工作有多大兴趣？')}</p>
        <h1 id="adaptive-question" data-question-id="${E(question.id)}">${E(localized(question.text))}</h1>
        <div id="adaptive-answer-options" class="adaptive-answer-options" role="radiogroup" aria-labelledby="adaptive-question" aria-describedby="adaptive-answer-note">
          ${answerLabels().map((answer, index) => `<button type="button" role="radio" aria-checked="${selected === answer.value}" tabindex="${selected === answer.value || selected === null && index === 0 ? 0 : -1}" data-adaptive-answer="${answer.value}" class="adaptive-answer${selected === answer.value ? ' is-selected' : ''}${answer.value === 0 ? ' adaptive-answer-unknown' : ''}"><span class="adaptive-answer-dot" aria-hidden="true"></span><span>${E(answer.text)}</span></button>`).join('')}
        </div>
        <small id="adaptive-answer-note">${L('«Нейтрально» — задача не привлекает и не отталкивает. «Пока не знаю» — пока оставьте её без оценки.', 'Choose Neutral if the task neither attracts nor puts you off. Choose Not sure yet to leave your interest in this task undecided.', '如果这项工作对你没有明显的吸引力或排斥感，请选「态度中立」。如果暂时无法判断，请选「暂时不确定」。')}</small>
        <div id="adaptive-save-feedback">${saveError()}</div>
        <footer class="adaptive-controls"><button type="button" class="button button-primary" id="adaptive-next" ${selected === null ? 'disabled' : ''}>${L('Далее', 'Next', '下一题')}${icon('arrow-right')}</button></footer>
      </article>
    </div>`;
    root.querySelectorAll('[data-adaptive-answer]').forEach(button => button.addEventListener('click', () => chooseAnswer(Number(button.dataset.adaptiveAnswer))));
    root.querySelector('#adaptive-back').onclick = backQuestion;
    root.querySelector('#adaptive-next').onclick = advanceQuestion;
    bindSaveRetry(root);
  }

  function detailFor(row) {
    const cacheKey = detailKey(row.detailPath), chunk = detailCache.get(cacheKey);
    if (chunk) {detailCache.delete(cacheKey); detailCache.set(cacheKey, chunk);}
    const detail = chunk?.get(row.id);
    return detail && detail.sourceURL === row.sourceURL ? detail : null;
  }

  function cleanDisplayLocation(row) {
    const region = territories.find(item => item.id === row.regionId);
    const knownRegion = region ? regionName(region) : '';
    const location = compact(row.location), locality = compact(row.locality);
    const editorial = /адрес[а-я]*\s+при[её]ма|не\s+(?:принят|подтвержд[её]н|установлен)|(?:точное|конкретное)\s+рабочее место/i;
    if (editorial.test(location) || editorial.test(locality)) return {text:knownRegion, lang:getLanguage()};
    if (locality) return {text:[knownRegion, locality].filter(Boolean).join(', '), lang:'ru'};
    return location ? {text:location, lang:'ru'} : {text:knownRegion, lang:getLanguage()};
  }

  function displayEvidence(row, detail) {
    if (!Array.isArray(row.matchedFeatures) || !Array.isArray(detail?.evidence)) return [];
    const answers = new Map(session.answers.map(answer => [answer.questionId, answer.value]));
    const matched = new Map(row.matchedFeatures
      .filter(feature => isRecord(feature) && typeof feature.id === 'string' && Number.isFinite(feature.weight) && feature.weight > 0 &&
        Number.isFinite(feature.interest) && feature.interest > 0 && Number.isFinite(feature.strength) && feature.strength > 0 &&
        (!feature.specific || answers.get(feature.id) >= 4))
      .map(feature => [feature.id, feature]));
    const categoryOrder = {duties:0, skills:1, knowledge:2};
    const relevant = detail.evidence.filter(item => validEvidence(item) && matched.has(item.featureId)).slice().sort((left, right) => {
      const a = matched.get(left.featureId), b = matched.get(right.featureId);
      return Number(b.specific === true) - Number(a.specific === true) || b.weight - a.weight ||
        categoryOrder[left.category] - categoryOrder[right.category];
    });
    const selected = [], seen = [];
    for (const item of relevant) {
      const normalized = compact(item.sourceText).toLocaleLowerCase('ru');
      if (seen.some(text => text === normalized || text.includes(normalized) || normalized.includes(text))) continue;
      selected.push(item); seen.push(normalized);
      if (selected.length === 2) break;
    }
    return selected;
  }

  function evidenceSections(row, detail) {
    const groups = new Map();
    for (const item of displayEvidence(row, detail)) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    }
    const label = category => category === 'duties' ? L('Задачи', 'Tasks', '工作任务')
      : category === 'skills' ? L('Умения', 'Skills', '技能') : L('Знания', 'Knowledge', '知识');
    return [...groups].map(([category, items]) => `<section class="adaptive-role-section"><h3>${label(category)}</h3>${items.map(item =>
      `<p lang="ru" data-adaptive-evidence="${E(item.featureId)}" data-evidence-category="${E(category)}">${E(snippet(item.sourceText, 560))}</p>`).join('')}</section>`).join('');
  }

  function roleCard(row, index) {
    const detail = detailFor(row), location = cleanDisplayLocation(row);
    const url = safeURL(row.sourceURL);
    const employer = employerCards.markup(row);
    return `<article class="adaptive-role" data-adaptive-vacancy="${E(row.id)}">
      ${employer.heading}
      ${row.department ? `<p class="adaptive-role-department" lang="ru">${E(row.department)}</p>` : ''}
      <h3 class="adaptive-role-title" lang="ru" data-adaptive-role-title>${E(row.title)}</h3>
      <div class="adaptive-role-topline"><span class="adaptive-role-rank">${index + 1}</span>${employer.offer}</div>
      ${location.text ? `<p class="adaptive-role-location" lang="${E(location.lang)}">${E(location.text)}</p>` : ''}
      ${employer.brief}
      ${evidenceSections(row, detail)}
      <div class="adaptive-role-actions">${reviewAction(row)}
        ${url ? `<a class="adaptive-source" href="${url}" target="_blank" rel="noopener noreferrer">${L('Источник', 'Source', '来源')}${icon('external')}</a>` : ''}</div>
    </article>`;
  }

  function reviewAction(row) {
    return review.canOpenCandidate(row) ? `<button type="button" class="button button-primary adaptive-review-action" data-adaptive-review-id="${E(row.id)}">${L('Разобрать требования', 'Review requirements', '分析职位要求')}</button>` : '';
  }

  function matchBrowseMarkup(ranking, page, expanded) {
    if (!ranking.matchingCount) return '';
    const number = new Intl.NumberFormat(getLanguage());
    const pager = page?.total ? `<nav class="adaptive-match-pager" aria-label="${L('Страницы совпадений', 'Matching role pages', '匹配职位分页')}">
      <button type="button" class="button button-secondary" data-adaptive-match-page="previous" ${page.offset ? '' : 'disabled'}>${L('Назад', 'Previous', '上一页')}</button>
      <span>${number.format(Math.floor(page.offset/page.limit)+1)} / ${number.format(Math.ceil(page.total/page.limit))}</span>
      <button type="button" class="button button-secondary" data-adaptive-match-page="next" ${page.offset+page.limit < page.total ? '' : 'disabled'}>${L('Дальше', 'Next', '下一页')}</button></nav>` : '';
    const card = row => {
      const url = safeURL(row.sourceURL), location = cleanDisplayLocation(row), open = expanded?.id === row.id;
      const detail = open ? detailFor(row) : null;
      const employer = employerCards.markup(row, true);
      return `<article class="adaptive-match-item" data-adaptive-match-id="${E(row.id)}">
        ${employer.heading}
        ${row.department ? `<p class="adaptive-role-department" lang="ru">${E(row.department)}</p>` : ''}
        <h4 class="adaptive-role-title" lang="ru" data-adaptive-role-title>${E(row.title)}</h4>
        ${location.text ? `<p lang="${E(location.lang)}">${E(location.text)}</p>` : ''}
        ${employer.brief}
        ${employer.offer}
        <div class="adaptive-match-actions"><button type="button" class="adaptive-text-button" data-adaptive-match-evidence="${E(row.id)}" aria-expanded="${open}">${L('Совпавшие функции', 'Matching tasks', '匹配的工作任务')}</button>${reviewAction(row)}${url ? `<a class="adaptive-source" href="${url}" target="_blank" rel="noopener noreferrer">${L('Источник', 'Source', '来源')}${icon('external')}</a>` : ''}</div>
        ${open ? detail ? evidenceSections(row,detail) : `<p role="status">${detailErrors.has(detailKey(row.detailPath)) ? L('Описание не загрузилось.', 'The description could not be loaded.', '无法加载职位说明。') : L('Загрузка описания…', 'Loading the description…', '正在加载职位说明……')}</p>` : ''}
      </article>`;
    };
    return `<details class="adaptive-match-browser" id="adaptive-all-matches" ${matchBrowseOpen ? 'open' : ''}>
      <summary id="adaptive-match-summary">${L('Все совпадения', 'All matches', '全部匹配职位')} · ${number.format(ranking.matchingCount)}</summary>
      ${page ? `<div class="adaptive-match-body"><p>${L('Все объявления, которые совпали с Вашими интересами и выбранными условиями.', 'All roles that match your interests and selected conditions.', '符合你的兴趣和所选条件的所有职位。')}</p>
        <form id="adaptive-match-search" class="adaptive-match-search"><label for="adaptive-match-query">${L('Поиск по должности, работодателю или месту', 'Search by role, employer or location', '按职位、用人单位或地点搜索')}</label><div><input type="search" name="query" id="adaptive-match-query" maxlength="160" value="${E(matchQuery)}"><button type="submit" class="button button-secondary">${L('Найти', 'Search', '搜索')}</button></div></form>
        <h2 id="adaptive-match-list-title" tabindex="-1" class="adaptive-match-count" aria-live="polite">${page.total ? L(`Показано ${number.format(page.offset+1)}–${number.format(page.offset+page.rows.length)} из ${number.format(page.total)}`, `Showing ${number.format(page.offset+1)}–${number.format(page.offset+page.rows.length)} of ${number.format(page.total)}`, `显示第 ${number.format(page.offset+1)}–${number.format(page.offset+page.rows.length)} 条，共 ${number.format(page.total)} 条`) : L('По этому запросу совпадений нет.', 'No matches for this search.', '没有符合该搜索条件的职位。')}</h2>
        <div class="adaptive-match-list">${page.rows.map(card).join('')}</div>${pager}</div>` : ''}
    </details>`;
  }

  function detailKey(path, version = manifest?.version) {return version + '|' + path;}

  function validEvidence(item) {
    return isRecord(item) && typeof item.featureId === 'string' && item.featureId.length > 0 &&
      EVIDENCE_CATEGORIES.has(item.category) && typeof item.sourceText === 'string' && compact(item.sourceText) &&
      typeof item.sourcePointer === 'string';
  }

  function validDetail(row) {
    return isRecord(row) && typeof row.id === 'string' && typeof row.sourceURL === 'string' &&
      Array.isArray(row.evidence) && row.evidence.every(validEvidence);
  }

  function hasRequestedDetails(chunk, rows) {
    return rows.every(row => {
      const detail = chunk?.get(row.id);
      return detail && detail.sourceURL === row.sourceURL;
    });
  }

  function resetDetailRequests() {
    detailGeneration += 1;
    for (const job of detailPending.values()) job.controller.abort();
    detailPending.clear(); detailQueue = []; detailSelection = ''; detailErrors.clear();
  }

  function pumpDetails() {
    if (!live() || lastRoute !== 'results') return;
    while (detailPending.size < DETAIL_CONCURRENCY && detailQueue.length) {
      const request = detailQueue.shift();
      const job = {...request, controller:new AbortController(), ticket:detailGeneration};
      detailPending.set(job.key, job);
      job.promise = (async () => {
        const current = () => live() && !job.controller.signal.aborted && job.ticket === detailGeneration && manifest.version === job.version;
        try {
          const payload = await loadPacked(job.descriptor, 'detail', job.controller.signal);
          if (!current()) return;
          if (payload.version !== job.version || !payload.rows.every(validDetail)) throw new Error('Invalid vacancy details');
          const chunk = new Map(payload.rows.map(row => [row.id, row]));
          if (chunk.size !== payload.rows.length || !hasRequestedDetails(chunk, job.rows)) throw new Error('Vacancy detail identity mismatch');
          detailCache.set(job.key, chunk);
          while (detailCache.size > DETAIL_CACHE_LIMIT) detailCache.delete(detailCache.keys().next().value);
        } catch (error) {
          if (current() && error.name !== 'AbortError') detailErrors.add(job.key);
        } finally {
          if (detailPending.get(job.key) === job) detailPending.delete(job.key);
          if (current() && lastRoute === 'results') {pumpDetails(); renderResults();}
        }
      })();
    }
  }

  function loadDetails(matches, retry = false) {
    const version = manifest.version;
    const selection = JSON.stringify([version, candidateKey, matches.map(row => [row.id, row.detailPath, row.sourceURL])]);
    if (selection !== detailSelection) {resetDetailRequests(); detailSelection = selection;}
    const requested = new Map();
    for (const row of matches) {
      if (!requested.has(row.detailPath)) requested.set(row.detailPath, []);
      requested.get(row.detailPath).push(row);
    }
    for (const [path, rows] of requested) {
      const key = detailKey(path, version);
      if (retry && detailErrors.delete(key)) detailCache.delete(key);
      if (detailPending.has(key) || detailQueue.some(job => job.key === key) || detailErrors.has(key)) continue;
      if (detailCache.has(key)) {
        if (!hasRequestedDetails(detailCache.get(key), rows)) detailErrors.add(key);
        continue;
      }
      const descriptor = manifest.details.find(item => item.path === path);
      if (!descriptor) {detailErrors.add(key); continue;}
      detailQueue.push({key, version, descriptor, rows});
    }
    pumpDetails();
  }

  function notifyCompletion(ranking) {
    if (!session.completedAt || !session.resultRecordId || saveFailed || corruptStorage) return;
    if (session.resultRecordId === notifiedRecordId) return;
    // Rebuild from this session and the checked registry; never trust a stored ranking as input.
    const record = makeCompletionRecord({taxonomy, answers:session.answers, regionIds:session.regionIds, ranking, indexVersion:manifest.version,
      responsibilityPreference:session.responsibilityPreference, recordId:session.resultRecordId, createdAt:session.completedAt});
    if (JSON.stringify(session.completion) !== JSON.stringify(record) && !save({...session, completion:record})) return;
    __careerHost.resultCalculated(record);
    notifiedRecordId = record.recordId;
  }

  function renderResults() {
    const root = resultRoot();
    if (!session.completedAt) {navigate(resolveResumeRoute()); return;}
    if (!root || !readyFor(root, true)) return;
    const ranking = resultRanking(), matches = ranking.matches || [];
    const page = matchBrowseOpen && ranking.matchingCount ? listMatchingVacancies({taxonomy, answers:session.answers, candidates, selectionSeed:session.selectionSeed, query:matchQuery, offset:matchOffset}) : null;
    if (page) matchOffset = page.offset;
    const expanded = page?.rows.find(row => row.id === expandedMatchId);
    const detailRows = expanded && !matches.some(row => row.id === expanded.id) ? [...matches, expanded] : matches;
    loadDetails(detailRows);
    const focused = document.activeElement?.id;
    const noPreference = ranking.resultStatus === 'no-preference';
    const missing = matches.some(row => detailErrors.has(detailKey(row.detailPath)));
    root.innerHTML = `<div class="adaptive-results">
      <header class="adaptive-results-heading"><h1>${matches.length ? L('Подходящие должности', 'Matching roles', '适合的职位') : L('Ваш результат', 'Your result', '你的结果')}</h1></header>
      <p class="adaptive-review-instruction">${hasReviewCompletion() ? L('Разбор вакансии завершён. Можно перейти к тесту знаний.','Your vacancy review is complete. You can take the knowledge test.','职位要求自评已完成，可以参加知识测试。') : L('Выберите одну индивидуальную вакансию и разберите её требования, чтобы открыть тест знаний.','Choose one individual vacancy and review its requirements to unlock the knowledge test.','请选择一个具体职位并完成要求自评，以开放知识测试。')}</p>
      ${matches.length ? `<div class="adaptive-role-list">${matches.map(roleCard).join('')}</div>` : `<p class="adaptive-no-matches">${noPreference ? L('Вы не выделили предпочтительные виды работы. Выберите вакансию из каталога ниже или вернитесь к ответам.', 'You did not identify preferred types of work. Choose a vacancy from the catalogue below or revisit your answers.', '你尚未确定偏好的工作类型。请从下方目录选择职位，或返回修改回答。') : L('Совпадений для выбранных условий нет. Выберите вакансию из каталога ниже.', 'There are no matches for the selected conditions. Choose a vacancy from the catalogue below.', '未找到符合条件的职位。请从下方目录选择职位。')}</p>`}
      ${missing ? `<div class="adaptive-detail-error" role="status"><span>${L('Описание должностей не загрузилось.', 'Role descriptions could not be loaded.', '无法加载职位说明。')}</span><button type="button" class="adaptive-text-button" id="adaptive-retry-details">${L('Повторить', 'Retry', '重试')}</button></div>` : ''}
      ${matchBrowseMarkup(ranking,page,expanded)}
      <div id="adaptive-bank-browser"></div>
      <div id="adaptive-save-feedback">${saveError()}</div>
      <footer class="adaptive-result-controls"><button type="button" class="button button-secondary" id="adaptive-edit">${L('Изменить ответы', 'Edit answers', '修改答案')}</button>${typeof __careerHost.openKnowledge === 'function' ? `<button type="button" class="button button-primary" id="adaptive-open-knowledge" ${opening || saveFailed || corruptStorage || !hasReviewCompletion() ? 'disabled' : ''}>${L('К тесту знаний', 'Continue to the knowledge test', '进入知识测试')}${icon('arrow-right')}</button>` : ''}</footer>
    </div>`;
    root.querySelector('#adaptive-edit').onclick = backQuestion;
    void employerCards.enrich(root, [...matches, ...(page?.rows || [])]);
    root.querySelector('#adaptive-retry-details')?.addEventListener('click', () => {loadDetails(detailRows, true); renderResults();});
    const browse = root.querySelector('#adaptive-all-matches');
    browse?.addEventListener('toggle', () => {
      if (!browse.isConnected || browse.open === matchBrowseOpen) return;
      matchBrowseOpen = browse.open;
      if (!matchBrowseOpen) expandedMatchId = null;
      renderResults();
    });
    const refreshMatchPage = () => {
      expandedMatchId = null; renderResults();
      root.querySelector('#adaptive-match-list-title')?.focus();
    };
    root.querySelector('#adaptive-match-search')?.addEventListener('submit', event => {
      event.preventDefault(); matchQuery = event.currentTarget.elements.namedItem('query').value.trim().slice(0,160); matchOffset = 0; refreshMatchPage();
    });
    root.querySelectorAll('[data-adaptive-match-page]').forEach(button => button.addEventListener('click', () => {
      matchOffset = Math.max(0,matchOffset+(button.dataset.adaptiveMatchPage === 'next' ? page.limit : -page.limit)); refreshMatchPage();
    }));
    root.querySelectorAll('[data-adaptive-match-evidence]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.adaptiveMatchEvidence;
      expandedMatchId = expandedMatchId === id ? null : id; renderResults();
      [...root.querySelectorAll('[data-adaptive-match-evidence]')].find(item => item.dataset.adaptiveMatchEvidence === id)?.focus({preventScroll:true});
    }));
    root.querySelectorAll('[data-adaptive-review-id]').forEach(button => button.addEventListener('click', () => {
      const row = matches.find(item => item.id === button.dataset.adaptiveReviewId) || page?.rows.find(item => item.id === button.dataset.adaptiveReviewId);
      if (row) {void review.openCandidate(row); navigate('review');}
    }));
    bankBrowse.mount(root.querySelector('#adaptive-bank-browser'));
    root.querySelector('#adaptive-open-knowledge')?.addEventListener('click', async () => {
      if (opening || !hasReviewCompletion() || !save()) {renderResults(); return;}
      const button = root.querySelector('#adaptive-open-knowledge'); button.disabled = true;
      try {await goToKnowledge();}
      catch {
        const feedback = root.querySelector('#adaptive-save-feedback');
        if (feedback && live()) feedback.innerHTML = `<p class="adaptive-save-error" role="alert">${L('Не удалось открыть тест. Повторите переход.', 'The test could not be opened. Please try again.', '无法打开测试，请重试。')}</p>`;
      } finally {if (button.isConnected) button.disabled = !hasReviewCompletion();}
    });
    bindSaveRetry(root);
    notifyCompletion(ranking);
    if (saveFailed || corruptStorage) {
      root.querySelector('#adaptive-save-feedback').innerHTML = saveError();
      bindSaveRetry(root);
      const button = root.querySelector('#adaptive-open-knowledge');
      if (button) button.disabled = true;
    }
    if (focused) root.querySelector('#' + focused)?.focus({preventScroll:true});
  }

  function renderReview() {
    const root=document.querySelector('#adaptive-vacancy-review');
    if(!root||!readyFor(root))return;
    root.hidden=false;
    if(!review.isOpen()&&session.reviewTarget)void review.openReference(session.reviewTarget);
    if(review.isOpen()){review.mount(root);return;}
    root.innerHTML=`<section class="adaptive-workflow adaptive-question-card"><h1>${L('Разбор требований','Vacancy review','职位要求自评')}</h1>
      <p>${L('Сначала выберите индивидуальную вакансию из рекомендаций или каталога.','First choose an individual vacancy from the recommendations or catalogue.','请先从推荐列表或目录选择一个具体职位。')}</p>
      <button type="button" class="button button-primary" id="adaptive-choose-review">${L('Выбрать вакансию','Choose a vacancy','选择职位')}</button></section>`;
    root.querySelector('#adaptive-choose-review').onclick=()=>navigate('results');
  }

  function resolveResumeRoute() {
    return !session.setupComplete ? 'preferences' : session.completedAt ? 'results' : 'test';
  }

  function guardRoute(route) {
    if (!CAREER_ROUTES.has(route)) return route;
    if (route === 'preferences') return route;
    if (!session.setupComplete) return 'preferences';
    if (session.completedAt) return ['test','review'].includes(route)?route:'results';
    return 'test';
  }

  function render(route) {
    if (route !== 'preferences') destroyLocationPicker();
    if (route !== 'results' && (detailSelection || detailPending.size || detailQueue.length)) resetDetailRequests();
    if (route !== 'review' && lastRoute === 'review') review.close({notify:false});
    if (!['results','review'].includes(route) && ['results','review'].includes(lastRoute)) {
      matchBrowseOpen = false; matchOffset = 0; matchQuery = ''; expandedMatchId = null;
      bankBrowse.reset?.(); review.close({notify:false});
    }
    lastRoute = route;
    const guarded = guardRoute(route);
    if (metadataReady && guarded !== route) {navigate(guarded); return;}
    document.body.classList.toggle('adaptive-flow-active', ['preferences', 'test', 'results','review'].includes(route));
    if (route === 'preferences') renderPreferences();
    else if (route === 'test') renderQuestion();
    else if (route === 'results') renderResults();
    else if (route === 'review') renderReview();
  }

  document.addEventListener('app:language', () => {if (['preferences', 'test', 'results','review'].includes(lastRoute)) render(lastRoute);});
  document.addEventListener('keydown', event => {
    if (lastRoute !== 'test' || session.completedAt || !metadataReady || poolLoading || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const answerButton = target.closest?.('[data-adaptive-answer]');
    if (answerButton && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      const values = answerLabels().map(answer => answer.value);
      const index = values.indexOf(Number(answerButton.dataset.adaptiveAnswer));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1
        : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + values.length) % values.length;
      event.preventDefault(); chooseAnswer(values[next], {focus:true});
    } else if (/^[1-6]$/.test(event.key) && (!target.closest?.('button,a,summary') || answerButton)) {
      event.preventDefault(); chooseAnswer(event.key === '6' ? 0 : Number(event.key), {focus:true});
    } else if (event.key === 'Enter' && !target.closest?.('button,a,summary')) {
      event.preventDefault(); advanceQuestion();
    }
  });

  // Start with metadata only. The vacancy pool is loaded after both setup answers.
  void ensureMetadata();
  return {
    guardRoute, render, renderResults, resolveResumeRoute,
    isReady:() => session.setupComplete,
    flush:() => !dirty && !saveFailed && !corruptStorage || save(),
    updateBusy:() => metadataLoading || poolLoading || detailPending.size > 0 || detailQueue.length > 0 || opening || transitionBusy,
    captureForUpdate:() => ({schemaVersion:1, regionQuery:locationPicker?.getQuery().slice(0, 100) ?? regionQuery, regionMode, draftRegions:[...draftRegions],
      setupStep:session.setupStep, responsibilityDraft:session.responsibilityDraft}),
    restoreForUpdate(value) {
      if (!isRecord(value) || value.schemaVersion !== 1) return;
      destroyLocationPicker();
      regionQuery = typeof value.regionQuery === 'string' ? value.regionQuery.slice(0, 100) : '';
      regionMode = value.regionMode === 'selected' ? 'selected' : 'all';
      draftRegions = [...new Set((Array.isArray(value.draftRegions) ? value.draftRegions : []).filter(validRegion))].slice(0, 89);
      if (value.setupStep === 'responsibility' && session.locationConfirmed) session.setupStep = 'responsibility';
      else if (value.setupStep === 'location') session.setupStep = 'location';
      if (RESPONSIBILITY_PREFERENCES.has(value.responsibilityDraft)) session.responsibilityDraft = value.responsibilityDraft;
      if (live() && lastRoute === 'preferences') renderPreferences();
    }
  };
}
