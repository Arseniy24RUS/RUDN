import {getReleaseContext} from './release-resources.js';
import {FUNCTIONAL_SESSION_KEY,VACANCY_REVIEW_KEY,seminar5CareerComplete} from '../../apps/career/assets/seminar-progress.mjs';

export function currentGameReleaseBuild(context = getReleaseContext()) {
  return context?.retention === 'current-only' ? context.buildId || null : null;
}

export function canResumeGameDraft(draft, {completed = false, context = getReleaseContext()} = {}) {
  const buildId = currentGameReleaseBuild(context);
  return !buildId || completed || draft?.releaseBuildId === buildId;
}

export function markGameDraft(draft, context = getReleaseContext()) {
  const buildId = currentGameReleaseBuild(context);
  return buildId ? {...draft, releaseBuildId: buildId} : draft;
}

export function gameWorkspaceId(base, context = getReleaseContext()) {
  const buildId = currentGameReleaseBuild(context);
  return buildId ? `${base}-${buildId}` : base;
}

const games = new Set(['maps-freeplay', 'settlements-freeplay', 'settlements-tutorial', 'reception-freeplay',
  'governor-freeplay', 'career-workspace', 'career-freeplay']);
const gameModes = {'seminar-2': /^seminar$/, 'seminar-3': /^settlements-assessment$/,
  'seminar-5': /^\d{4}-\d{4}:(practice|assessment|demo)$/, 'seminar-7': /^campaign$/};
const gameAdapters = new Set(['maps', 'puzzle', 'settlements', 'reception', 'governor', 'career']);

export function isGameDraft({activitySlug, mode} = {}) {
  return games.has(activitySlug) || (Object.hasOwn(gameModes, activitySlug) && gameModes[activitySlug].test(mode));
}

export const isGameUpdateAdapter = module => gameAdapters.has(module);

function readCareerValue(value) {
  try { return JSON.parse(value || 'null'); } catch { return null; }
}

function completedCareerAnswers(value) {
  const result = readCareerValue(value);
  return typeof result?.completedAt === 'string' && Number.isFinite(Date.parse(result.completedAt)) &&
    typeof result.resultRecordId === 'string' && /^[a-zA-Z0-9-]{8,100}$/.test(result.resultRecordId);
}

export function completedCareerWorkspace(values) {
  return seminar5CareerComplete(readCareerValue(values?.[FUNCTIONAL_SESSION_KEY])) ||
    completedCareerAnswers(values?.['answers-v8.1']) || completedCareerAnswers(values?.['answers-v8']);
}

export function compatibleCareerMirror(values) {
  const functional = readCareerValue(values[FUNCTIONAL_SESSION_KEY]);
  const functionalComplete = seminar5CareerComplete(functional);
  const reviewKey = functionalComplete && functional.reviewCompletion?.target?.vacancyId;
  return Object.fromEntries(Object.entries(values).filter(([key, value]) =>
    ['language-v2', 'scenarios-v2', 'workbook-v2'].includes(key) ||
    (key === FUNCTIONAL_SESSION_KEY && functionalComplete) ||
    (key === 'career-journey-v1' && functionalComplete && readCareerValue(value)?.resultRecordId === functional.resultRecordId) ||
    (reviewKey && key === VACANCY_REVIEW_KEY + reviewKey) ||
    ((key === 'answers-v8.1' || key === 'answers-v8') && completedCareerAnswers(value))));
}

export function canResumeStoredGameDraft(draft) {
  if (!draft || !isGameDraft(draft)) return true;
  const state = draft.state;
  const completed = draft.phase === 'completed' || state?.phase === 'completed' || state?.completed === true ||
    state?.finished === true || state?.status === 'completed' ||
    state?.campaign?.completed === true || state?.campaign?.budgetReview?.status === 'supervised' ||
    (state?.status === 'completion-pending' && state?.result?.terminal === true) ||
    (['career-workspace','career-freeplay'].includes(draft.activitySlug) && completedCareerWorkspace(state?.values));
  return canResumeGameDraft(draft, {completed});
}

const notices = new Set();
export function notifyRetiredGameDraft(activity) {
  const key = `${currentGameReleaseBuild()}:${activity}`;
  if (notices.has(key) || typeof globalThis.CustomEvent !== 'function' || !globalThis.dispatchEvent) return;
  notices.add(key);
  globalThis.dispatchEvent(new CustomEvent('rudn:game-draft-retired', {detail:{activity}}));
}
