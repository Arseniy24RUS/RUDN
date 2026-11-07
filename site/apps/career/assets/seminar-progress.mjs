// Course progress is derived from the saved workspace, not from a navigation URL.
export const FUNCTIONAL_SESSION_KEY = 'functional-career-v1';
export const VACANCY_REVIEW_KEY = 'functional-vacancy-review-v1:';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const basePage = /^pages\/[a-f0-9]{2}\/[a-f0-9]{24}\/p(\d{4})-[a-f0-9]{16}\.json\.gz$/;
const sha256 = /^[a-f0-9]{64}$/;
const employer = /^[A-Za-z0-9][A-Za-z0-9_-]{0,246}$/;
const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function decoded(value) {
  if (typeof value !== 'string') return null;
  try {const result = JSON.parse(value);return record(result) ? result : null;}
  catch {return null;}
}

export function seminar5ReviewTarget(value) {
  if (!record(value) || !uuid.test(value.vacancyId || '') || !employer.test(value.authorityId || '') ||
      !basePage.test(value.pagePath || '') || !sha256.test(value.pageSHA256 || '') ||
      value.sourceURL !== `https://gossluzhba.gov.ru/vacancy/${value.vacancyId}`) return null;
  return {vacancyId:value.vacancyId,authorityId:value.authorityId,pagePath:value.pagePath,
    pageSHA256:value.pageSHA256,sourceURL:value.sourceURL};
}

export function seminar5CareerComplete(session) {
  const completion = session?.completion;
  return session?.setupComplete === true && typeof session.completedAt === 'string' && Number.isFinite(Date.parse(session.completedAt)) &&
    typeof session.resultRecordId === 'string' && /^functional-[\w-]{8,80}$/.test(session.resultRecordId) &&
    completion?.schema === 'rudn-career-result' && completion.schemaVersion === 3 && completion.resultKind === 'vacancy-functional' &&
    completion.completed === true && completion.recordId === session.resultRecordId && completion.createdAt === session.completedAt &&
    Array.isArray(session.answers) && session.answers.length >= 43 && session.answers.length <= 55 && completion.answerCount === session.answers.length;
}

export function seminar5ReviewComplete(session, values) {
  const proof = session?.reviewCompletion;
  if (!seminar5CareerComplete(session) || proof?.schemaVersion !== 1 ||
      proof.resultRecordId !== session.resultRecordId || !seminar5ReviewTarget(proof.target) ||
      typeof proof.markKey !== 'string' || !proof.markKey || proof.markKey.length > 1000 ||
      typeof proof.signature !== 'string' || !proof.signature || proof.signature.length > 1048576 ||
      !['met','gap'].includes(proof.status)) return false;
  const review = decoded(values?.[VACANCY_REVIEW_KEY + proof.target.vacancyId]);
  const mark = review?.marks?.[proof.markKey];
  return review?.schemaVersion === 1 && review.vacancyId === proof.target.vacancyId &&
    mark?.signature === proof.signature && ['met','gap'].includes(mark.status);
}

export function seminar5ProgressFromWorkspace(state, currentStage = state?.route) {
  const session = decoded(state?.values?.[FUNCTIONAL_SESSION_KEY]);
  const personalityComplete = state?.personalityComplete === true;
  const preferencesComplete = personalityComplete && session?.setupComplete === true;
  const careerComplete = preferencesComplete && seminar5CareerComplete(session);
  const stage = ['preferences','test','results','review','knowledge'].includes(currentStage) ? currentStage : 'personality';
  return {stage,personalityComplete,preferencesComplete,careerComplete,
    reviewAvailable:careerComplete,reviewComplete:careerComplete && seminar5ReviewComplete(session,state?.values)};
}
