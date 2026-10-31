/** Versioned, replayable papers from reviewed Ministry of Labour questions.
 * Career interests never enter this knowledge score. Original option order is
 * retained because some source tasks refer to another option by position.
 */
export const SECTION_IDS = ['russian','constitution','civil-service','anti-corruption','ict'];
export const PAPER_SIZE = 40;
export const PER_SECTION = 8;
// Compatibility exports: knowledge attempts no longer have a time limit.
export const TEST_DURATION_MS = Infinity;
const fail = (code, message) => {throw Object.assign(new Error(message), {code:`civil-service/${code}`});};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const sameSet = (a,b) => a.length === b.length && a.every(value => b.includes(value));
const translated = value => record(value) && ['ru','en','zh'].every(lang => typeof value[lang] === 'string' && value[lang].trim());
export function canonicalJSONString(value) {
  const canonical=input=>Array.isArray(input)?input.map(canonical):record(input)?Object.fromEntries(Object.keys(input).sort().map(key=>[key,canonical(input[key])])):input;
  return JSON.stringify(canonical(value));
}

/** Kept for existing callers. Historical deadline metadata does not limit
 * an unfinished paper; completed records retain their original result.
 */
export const attemptDeadline = () => Infinity;
export const remainingAttemptTime = () => Infinity;
export const isAttemptExpired = () => false;

export function validateBank(bank) {
  if (!record(bank) || bank.schemaVersion !== 1 || typeof bank.contentVersion !== 'string' || !bank.contentVersion || !Array.isArray(bank.questions)) fail('invalid-bank','Invalid question bank.');
  const ids = new Set();
  for (const q of bank.questions) {
    if (!record(q) || typeof q.id !== 'string' || !q.id || ids.has(q.id) || !SECTION_IDS.includes(q.sectionId)) fail('invalid-bank','Invalid or duplicate question identity.');
    ids.add(q.id);
    if (!Array.isArray(q.options) || q.options.length < 2 || !Array.isArray(q.correctOptionIds)) fail('invalid-bank',`Invalid options: ${q.id}`);
    const optionIds = q.options.map(option => option.id);
    if (optionIds.some(id => typeof id !== 'string' || !id) || new Set(optionIds).size !== optionIds.length) fail('invalid-bank',`Invalid option identity: ${q.id}`);
    if (new Set(q.correctOptionIds).size !== q.correctOptionIds.length || q.correctOptionIds.some(id => !optionIds.includes(id))) fail('invalid-bank',`Invalid answer key: ${q.id}`);
    if (q.review?.status === 'verified' && (!q.correctOptionIds.length || !translated(q.stem) || q.options.some(option => !translated(option.text)))) fail('translation-incomplete',`Reviewed question requires all three languages and a source key: ${q.id}`);
  }
  return true;
}

export function availableQuestions(bank) {
  validateBank(bank);
  return bank.questions.filter(q => q.review?.status === 'verified');
}

function random(seed) {
  let state = seed >>> 0;
  return () => {state += 0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function shuffled(values, next) {
  const result=[...values];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}

export function createAttempt(bank,{seed,id,startedAt=Date.now()}={}) {
  const pool=availableQuestions(bank);
  if (seed === undefined) {const value=new Uint32Array(1);globalThis.crypto.getRandomValues(value);seed=value[0];}
  if (!Number.isInteger(seed) || seed<0 || seed>0xffffffff) fail('invalid-seed','Seed must be an unsigned 32-bit integer.');
  if (!id) id=globalThis.crypto.randomUUID();
  const next=random(seed), selected=[];
  for(const sectionId of SECTION_IDS){
    const section=pool.filter(q=>q.sectionId===sectionId).sort((a,b)=>a.id.localeCompare(b.id,'en'));
    if(section.length<PER_SECTION)fail('pool-incomplete',`Not enough reviewed questions in ${sectionId}.`);
    selected.push(...shuffled(section,next).slice(0,PER_SECTION));
  }
  const attempt={schemaVersion:1,id,contentVersion:bank.contentVersion,seed,startedAt,phase:'active',questionIds:shuffled(selected,next).map(q=>q.id),answers:{},currentIndex:0,finishedAt:null};
  validateAttempt(bank,attempt);
  return attempt;
}

export function validateAttempt(bank,attempt) {
  validateBank(bank);
  if(!record(attempt)||attempt.schemaVersion!==1||typeof attempt.id!=='string'||!attempt.id||attempt.id.length>200||attempt.contentVersion!==bank.contentVersion)fail('version-mismatch','The attempt requires its original question bank.');
  if(!['active','completed'].includes(attempt.phase)||!Array.isArray(attempt.questionIds)||attempt.questionIds.length!==PAPER_SIZE||new Set(attempt.questionIds).size!==PAPER_SIZE||!record(attempt.answers))fail('invalid-attempt','Invalid paper.');
  if(!Number.isFinite(attempt.startedAt)||attempt.startedAt<0||!Number.isInteger(attempt.currentIndex)||attempt.currentIndex<0||attempt.currentIndex>=PAPER_SIZE||!Number.isInteger(attempt.seed)||attempt.seed<0||attempt.seed>0xffffffff)fail('invalid-attempt','Invalid attempt metadata.');
  if(attempt.deadlineAt!==undefined&&(!Number.isFinite(attempt.deadlineAt)||attempt.deadlineAt<attempt.startedAt))fail('invalid-attempt','Invalid historical deadline.');
  const byId=new Map(bank.questions.map(q=>[q.id,q])), counts=Object.fromEntries(SECTION_IDS.map(id=>[id,0]));
  for(const id of attempt.questionIds){const q=byId.get(id);if(!q||q.review?.status!=='verified')fail('invalid-attempt','Paper contains an unreviewed question.');counts[q.sectionId]++;}
  if(SECTION_IDS.some(id=>counts[id]!==PER_SECTION))fail('invalid-attempt','Invalid topic proportions.');
  for(const [id,answer] of Object.entries(attempt.answers)){
    const q=byId.get(id);
    if(!attempt.questionIds.includes(id)||!Array.isArray(answer)||new Set(answer).size!==answer.length||answer.some(optionId=>!q.options.some(option=>option.id===optionId))||(q.correctOptionIds.length===1&&answer.length>1))fail('invalid-answer',`Invalid answer: ${id}`);
  }
  if(attempt.phase==='completed'&&(!Number.isFinite(attempt.finishedAt)||attempt.finishedAt<attempt.startedAt||!record(attempt.result)))fail('invalid-attempt','Invalid completed attempt.');
  if(attempt.completionReason!==undefined&&(!['submitted','time-limit'].includes(attempt.completionReason)||attempt.phase!=='completed'))fail('invalid-attempt','Invalid completion reason.');
  if(attempt.completionReason==='time-limit'&&attempt.deadlineAt!==undefined&&attempt.finishedAt!==attempt.deadlineAt)fail('invalid-attempt','Invalid historical timeout timestamp.');
  if(attempt.phase==='active'&&(attempt.finishedAt!==null||attempt.result!==undefined))fail('invalid-attempt','Active attempt contains a final result.');
  return true;
}

export function getAttemptQuestions(bank,attempt){validateAttempt(bank,attempt);const byId=new Map(bank.questions.map(q=>[q.id,q]));return attempt.questionIds.map(id=>byId.get(id));}

export function setAnswer(bank,attempt,questionId,optionIds,{now=Date.now()}={}) {
  validateAttempt(bank,attempt);
  if(attempt.phase!=='active')fail('already-completed','A completed attempt cannot be edited.');
  if(!Number.isFinite(now))fail('invalid-attempt','Invalid answer time.');
  const updated={...attempt,answers:{...attempt.answers,[questionId]:copy(optionIds)}};
  validateAttempt(bank,updated);
  return updated;
}

export function gradeAttempt(bank,attempt){
  const questions=getAttemptQuestions(bank,attempt);
  const questionResults=questions.map(q=>{const selectedOptionIds=[...(attempt.answers[q.id]||[])];return {id:q.id,correct:sameSet(selectedOptionIds,q.correctOptionIds),selectedOptionIds,correctOptionIds:[...q.correctOptionIds]};});
  const correct=questionResults.filter(result=>result.correct).length,total=questions.length;
  return {correct,total,percent:Math.round(10000*correct/total)/100,points:Math.round(500*correct/total)/100,maxPoints:5,questionResults};
}

export function finishAttempt(bank,attempt,{finishedAt=Date.now()}={}){
  validateAttempt(bank,attempt);
  if(attempt.phase==='completed'){
    const expected=gradeAttempt(bank,attempt);
    if(canonicalJSONString(expected)!==canonicalJSONString(attempt.result))fail('result-mismatch','Stored result differs from the original paper.');
    return copy(attempt);
  }
  if(!Number.isFinite(finishedAt)||finishedAt<attempt.startedAt)fail('invalid-attempt','Invalid completion time.');
  const completed={...copy(attempt),phase:'completed',finishedAt,completionReason:'submitted',result:gradeAttempt(bank,attempt)};
  validateAttempt(bank,completed);
  return completed;
}
