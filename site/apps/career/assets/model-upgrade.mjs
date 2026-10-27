import {MODEL_VERSION, QUESTIONNAIRE_VERSION, REGISTRY_VERSION} from './versions.mjs';

// Ranking changes keep the questionnaire. Reuse inputs, never the old result identity.
export const PREVIOUS_MODEL_VERSION = '8.0.0';
export const PREVIOUS_SCORING_REVISION = 'smooth065-path-scoped-domains-v8';
export const compatibleInputModel = version => [MODEL_VERSION, PREVIOUS_MODEL_VERSION].includes(version);
export function upgradePreviousDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 4 ||
      value.modelVersion !== PREVIOUS_MODEL_VERSION || value.questionnaireVersion !== QUESTIONNAIRE_VERSION ||
      value.registryVersion !== REGISTRY_VERSION || !value.answers || !value.conditions) return null;
  return {...structuredClone(value), modelVersion:MODEL_VERSION, completedAt:null, resultRecordId:null};
}
export function canReuseScenarioInputs(item) {
  return item?.modelVersion === PREVIOUS_MODEL_VERSION && item.scoringRevision === PREVIOUS_SCORING_REVISION;
}
