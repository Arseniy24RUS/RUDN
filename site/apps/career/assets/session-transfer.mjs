import {MODEL_VERSION, QUESTIONNAIRE_VERSION, REGISTRY_VERSION, RELEASE_VERSION} from './versions.mjs';
import {validateFocusAreas} from './topics.mjs';

export const SESSION_SCHEMA = 'rudn-career-session';
export const SESSION_LIMIT = 128 * 1024;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const allowed = (v, keys) => plain(v) && Object.keys(v).every(k => keys.includes(k));
const score = n => Number.isInteger(n) && n >= 1 && n <= 5;
const conditions = ['FIELD','SCHEDULE','FORMAL','SECURITY'];

/** Partial answers are portable; an imported score is never trusted or stored. */
export function sessionBundle(state) {
  return {schema:SESSION_SCHEMA, schemaVersion:1, releaseVersion:RELEASE_VERSION,
    modelVersion:MODEL_VERSION, questionnaireVersion:QUESTIONNAIRE_VERSION, registryVersion:REGISTRY_VERSION,
    savedAt:new Date().toISOString(), inputs:structuredClone({answers:state.answers,
      prioritySectors:state.prioritySectors, lowPrioritySectors:state.lowPrioritySectors,
      conditions:state.conditions, focusAreas:state.focusAreas || {}})};
}

export function parseSession(text, questions, sectors) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > SESSION_LIMIT) throw Error('file-size');
  const v = JSON.parse(text);
  if (!allowed(v,['schema','schemaVersion','releaseVersion','modelVersion','questionnaireVersion','registryVersion','savedAt','inputs']) ||
      v.schema !== SESSION_SCHEMA || v.schemaVersion !== 1 || v.modelVersion !== MODEL_VERSION ||
      v.questionnaireVersion !== QUESTIONNAIRE_VERSION || v.registryVersion !== REGISTRY_VERSION) throw Error('version');
  const i = v.inputs, qids = questions.map(q => q.id), sids = sectors.map(s => s.id);
  if (!allowed(i,['answers','prioritySectors','lowPrioritySectors','conditions','focusAreas']) ||
      !allowed(i.answers,qids) || !Object.values(i.answers).every(score) ||
      !allowed(i.conditions,conditions) || !Object.values(i.conditions).every(score)) throw Error('answers');
  for (const [key, limit] of [['prioritySectors',4],['lowPrioritySectors',2]]) {
    if (!Array.isArray(i[key]) || i[key].length > limit || new Set(i[key]).size !== i[key].length ||
        i[key].some(id => !sids.includes(id))) throw Error('sectors');
  }
  if (i.prioritySectors.some(id => i.lowPrioritySectors.includes(id)) || !plain(i.focusAreas) ||
      !validateFocusAreas(i.focusAreas,i.prioritySectors)) throw Error('focus');
  return structuredClone(i);
}
