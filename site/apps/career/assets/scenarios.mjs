import {storageKey} from './storage.mjs';
import {validateFocusAreas,sanitizeFocusAreas} from './topics.mjs';
import {SCORING_REVISION} from './versions.mjs';
export {SCORING_REVISION};
/** Local, explicit snapshots. No server, account or telemetry. */
export const SCENARIO_SCHEMA = 'rudn-career-scenarios';
export const SCENARIO_VERSION = 1;
export const SCENARIO_LIMIT = 12;
export const SCENARIO_FILE_LIMIT = 512 * 1024;
export const SCENARIO_STORAGE_KEY = storageKey('scenarios-v2');

const CONDITION_IDS = ['FIELD','SCHEDULE','FORMAL','SECURITY'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const allowedKeys = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const answerValue = value => Number.isInteger(value) && value >= 1 && value <= 5;

export function validateInputs(input, questions, sectors) {
  const errors = [];
  if (!allowedKeys(input, ['answers','prioritySectors','lowPrioritySectors','conditions','focusAreas'])) return ['input-schema'];
  const questionIds = questions.map(q => q.id);
  if (!allowedKeys(input.answers, questionIds) || Object.keys(input.answers).length !== questionIds.length || questionIds.some(id => !answerValue(input.answers[id]))) errors.push('answers');
  if (!allowedKeys(input.conditions, CONDITION_IDS) || CONDITION_IDS.some(id => !answerValue(input.conditions[id]))) errors.push('conditions');
  const valid = new Set(sectors.map(s => s.id));
  for (const [key, size] of [['prioritySectors',4],['lowPrioritySectors',2]]) {
    const values = input[key];
    if (!Array.isArray(values) || values.length !== size || new Set(values).size !== size || values.some(id => !valid.has(id))) errors.push(key);
  }
  if (Array.isArray(input.prioritySectors) && Array.isArray(input.lowPrioritySectors) && input.prioritySectors.some(id => input.lowPrioritySectors.includes(id))) errors.push('sector-overlap');
  if(!validateFocusAreas(input.focusAreas||{},input.prioritySectors||[]))errors.push('focus-areas');
  return errors;
}
export function inputsFromState(state) {
  return structuredClone({answers: state.answers, prioritySectors: state.prioritySectors, lowPrioritySectors: state.lowPrioritySectors, conditions: state.conditions, focusAreas:sanitizeFocusAreas(state.focusAreas||{},state.prioritySectors)});
}
export function createScenario(state, { id, title, modelVersion, createdAt = new Date().toISOString() }, questions, sectors) {
  const inputs = inputsFromState(state);
  const snapshot = {id, title: String(title || '').trim(), createdAt, modelVersion, scoringRevision: SCORING_REVISION, inputs};
  const errors = validateScenario(snapshot, questions, sectors);
  if (errors.length) throw new Error(errors.join(', '));
  return snapshot;
}
export function validateScenario(item, questions, sectors) {
  if (!allowedKeys(item, ['id','title','createdAt','modelVersion','scoringRevision','inputs'])) return ['scenario-schema'];
  const errors=[];
  if (typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(item.id)) errors.push('id');
  if (typeof item.title !== 'string' || item.title.trim().length < 1 || item.title.length > 60 || /[\x00-\x1f]/.test(item.title)) errors.push('title');
  if (!validDate(item.createdAt)) errors.push('date');
  if (typeof item.modelVersion !== 'string' || item.modelVersion.length > 80 || typeof item.scoringRevision !== 'string' || item.scoringRevision.length > 100) errors.push('version');
  return errors.concat(validateInputs(item.inputs, questions, sectors));
}
export function compatibleScenario(item, modelVersion) { return item.modelVersion === modelVersion && item.scoringRevision === SCORING_REVISION; }
export function scenarioBundle(items) { return {schema: SCENARIO_SCHEMA, schemaVersion: SCENARIO_VERSION, scenarios: structuredClone(items)}; }
export function importScenarios(text, existing, questions, sectors) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > SCENARIO_FILE_LIMIT) throw new Error('file-too-large');
  const bundle = JSON.parse(text);
  if (!allowedKeys(bundle, ['schema','schemaVersion','scenarios']) || bundle.schema !== SCENARIO_SCHEMA || bundle.schemaVersion !== SCENARIO_VERSION || !Array.isArray(bundle.scenarios) || bundle.scenarios.length > SCENARIO_LIMIT) throw new Error('bundle-schema');
  // Validate everything before changing state: an invalid file has no partial side effects.
  for (const item of bundle.scenarios) { const errors=validateScenario(item,questions,sectors); if(errors.length) throw new Error(errors.join(', ')); }
  if (new Set(bundle.scenarios.map(x=>x.id)).size !== bundle.scenarios.length) throw new Error('duplicate-file-id');
  const result=structuredClone(existing), ids=new Map(result.map(x=>[x.id,x]));
  let added=0, duplicates=0;
  for(const item of bundle.scenarios) {
    if(ids.has(item.id)) {
      if(JSON.stringify(ids.get(item.id)) !== JSON.stringify(item)) throw new Error('id-conflict');
      duplicates++; continue;
    }
    result.push(item); ids.set(item.id,item); added++;
  }
  if(result.length > SCENARIO_LIMIT) throw new Error('limit');
  return {items:result,added,duplicates};
}
export function compareScenarioResults(a, b, resultA, resultB) {
  const government = r => r.ranked.filter(x=>!['corporation','fund'].includes(x.entityType));
  const left=government(resultA), right=government(resultB), rightMap=new Map(right.map((x,i)=>[x.id,{...x,position:i+1}]));
  return {
    changedAnswers: Object.keys(a.inputs.answers).filter(id=>a.inputs.answers[id]!==b.inputs.answers[id]),
    changedConditions: CONDITION_IDS.filter(id=>a.inputs.conditions[id]!==b.inputs.conditions[id]),
    samePriorityOrder: JSON.stringify(a.inputs.prioritySectors)===JSON.stringify(b.inputs.prioritySectors),
    topOverlap: left.slice(0,5).filter(x=>right.slice(0,5).some(y=>y.id===x.id)).length,
    rows: left.map((x,i)=>({id:x.id,scoreA:x.score,scoreB:rightMap.get(x.id)?.score ?? null,rankA:i+1,rankB:rightMap.get(x.id)?.position ?? null,delta:Math.round(((rightMap.get(x.id)?.score ?? x.score)-x.score)*10)/10}))
  };
}
