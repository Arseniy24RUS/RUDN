import {participantOpening} from './participant-context.mjs';
import {addReviewDialogue} from './correspondence.mjs';
import {buildConflictContractMaterials} from './contract-materials.mjs';
import {randomUUID} from 'node:crypto';
import {ReceptionError, fail, fields, identifier, string, locale, localized, copy, hash, validateCase, validateDecision, evaluateDecision, actorCase,MAX_CATALOG_CASES} from './schema.mjs';
import {validateActorTurn, estimateReservation, estimateReviewReservation, costMicros, reviewCostMicros, estimateMentorReservation, estimateMentorWorkReservation} from './provider.mjs';
import {groundedMentorFallback,mentorEvidence} from './mentor-evidence.mjs';
import {selectShiftCases} from './selection.mjs';
import {CATALOG_METADATA} from './catalog-metadata.mjs';
import {legacySessionIds, LEGACY_RECOVERY_LIMITS} from './store.mjs';
import {learningReviewFor} from './learning-review.mjs';
import {WORKBOOK_VERSION,LEGACY_WORKBOOK_VERSION,supportsWorkbook,publicWorkbook,validateWorkbookDecision,evaluateWorkbook,registrationTimely} from './workbook.mjs';
import {DECISION_VERSION,CORRESPONDENCE_WEIGHTS,publicCorrespondenceSources,resolveCorrespondenceCitations,validateCorrespondenceControl,
  buildCorrespondenceReview,scoreCorrespondenceReview,combineCorrespondenceFeedback} from './correspondence.mjs';
import {privateCorrespondenceProfile,publicCorrespondenceProfile} from './correspondence-profiles.mjs';
import {createControlWorkflow,applyControlAction,normalizeControlWorkflow,publicControlWorkflow,validateControlSubmission} from './control-workflow.mjs';
import {resolveLegalCitation as defaultLegalCitationResolver} from './correspondence-legal-sources.mjs';
import {calendarNormId} from './workbook-norms.mjs';
import {normativeActsForCase,requiredSeminarActs,validateLegalCitation,hasApplicableLegalCitation,acceptableLegalProvisions} from './normative-acts.mjs';
import {JOURNEY_STAGES, SEMINAR_EXAMPLE, SEMINAR_GRADING_VERSION, SEMINAR_REPLY_GRADING_VERSION, isThresholdGradingVersion, isTutorial, exactCaseScore, seminarPointsAt,
  seminarExample, tutorialGuide, publicTutorialGuide, tutorialOperational, tutorialExecutionAction, validatedTutorialMemo, mentorFinding, tutorialExecutionKinds, tutorialExecutionProgress, walkthroughControlProfile} from './seminar-journey.mjs';
import {SEMINAR_CORE_VERSION,CORE_STEP_FIELDS,publicCoreSteps,inspectCoreStep,saveCoreStep,assertCoreDecision} from './seminar-core.mjs';
import {LEGACY_SEMINAR_STORY_VERSION,SEMINAR_STORY_VERSION,SEMINAR_STORY_PROGRESS_KEY,withSeminarStory} from './seminar-stories.mjs';
import {MFC_SEMINAR_VERSION,MFC_REPLY_KIND,MFC_CALENDAR_VERSION,MFC_DATES_ONLY_CALENDAR_VERSION,LEGACY_MFC_CALENDAR_VERSION,mfcRole,mfcUsesSharedReply,mfcSharedReplyInstruction} from './mfc-seminar.mjs';

const DEFAULTS = {maxMessageChars: 2400, maxTurnsPerCase: 24, maxInputAllowance: 80000, maxReviewInputAllowance:320000, maxOutputTokens: 650,
  dailyBudgetMicros: 2_000_000, monthlyBudgetMicros: 20_000_000, studentDailyBudgetMicros: 1_000_000,
  maxConcurrent: 8, maxDailyTurnsPerStudent: 240, maxDailyStartsPerStudent: 20, leaseMs: 45000, providerTimeoutMs: 30000,
  reviewLeaseMs:105000,reviewTimeoutMs:90000,
  guestDailyBudgetMicros:750_000,guestMonthlyBudgetMicros:5_000_000,guestMaxConcurrent:2,
  guestMaxDailyStartsPerUid:3,guestMaxDailyStarts:12};
const allowed = {
  start: ['op', 'studentKey', 'mode', 'locale', 'requestId', 'caseId', 'level', 'buildId', 'workbookVersion','decisionVersion','controlVersion','context','journeyStage','coreStepsVersion','seminarStoryVersion'], resume: ['op', 'sessionId', 'buildId', 'workbookVersion','decisionVersion','context'],
  recover: ['op', 'studentKey', 'mode', 'buildId', 'workbookVersion','decisionVersion','controlVersion','context','journeyStage','coreStepsVersion','seminarStoryVersion'],
  message: ['op', 'sessionId', 'text', 'requestId', 'expectedRevision','suggestionId'], document: ['op', 'sessionId', 'documentId', 'requestId'],
  decide: ['op', 'sessionId', 'decision', 'requestId','expectedRevision'], followup:['op','sessionId','requestId','choiceId','control','expectedRevision'],
  'control-action':['op','sessionId','requestId','expectedRevision','action'],
  'tutorial-step':['op','sessionId','requestId','expectedRevision','stepId','choiceId','decision','control','useExample','confirmOwn','citations','calendar','routing'],
  'core-step':['op','sessionId','requestId','expectedRevision','stepId','citations','calendar','routing'],
  'registration-check':['op','sessionId','requestId','expectedRevision','registrationTimely'],
  'mentor-question':['op','sessionId','requestId','expectedRevision','text','issueId','workspacePage'],
  next: ['op', 'sessionId', 'requestId'], locale: ['op', 'sessionId', 'locale'], catalog: ['op', 'locale', 'studentKey', 'workbookVersion','decisionVersion','controlVersion','context']
};
const dayOf = n => new Date(n).toISOString().slice(0, 10), monthOf = n => dayOf(n).slice(0, 7);
const scopeOf = identity => identity.teacher ? `teacher:${identity.uid}`
  : identity.guest ? `guest:${identity.uid}` : `student:${identity.studentKey || identity.uid}`;
const values = rows => Array.isArray(rows) ? rows : Object.values(rows || {});
const MAX_SEMINAR_POINTS = 5;
const SEMINAR_PASS_SCORE = 70;
const seminarPath = owner => `seminarProgress/${hash(owner)}`;
const usesLegalCitation = (context,workbookVersion) => Boolean(context) && workbookVersion === WORKBOOK_VERSION;
const isCurrentStoryJourney = s => s.seminarStoryVersion === SEMINAR_STORY_VERSION;
const isStoryJourney = s => isCurrentStoryJourney(s)||s.seminarStoryVersion===LEGACY_SEMINAR_STORY_VERSION;
const journeyLedger = (version,s) => isCurrentStoryJourney(s)?SEMINAR_STORY_PROGRESS_KEY:s.seminarStoryVersion===LEGACY_SEMINAR_STORY_VERSION?
  'storyJourney':version===MFC_SEMINAR_VERSION?'mfcJourney':version===SEMINAR_CORE_VERSION?'guidedJourney':'journey';
const caseHistory = (progress,s) => isCurrentStoryJourney(s)?(progress.storyCasesV2 ||= {}):
  s.seminarStoryVersion===LEGACY_SEMINAR_STORY_VERSION?(progress.storyCases ||= {}):progress;
const currentSeminarContract = s => s.context==='seminar'&&isCurrentStoryJourney(s)&&s.coreStepsVersion===MFC_SEMINAR_VERSION&&
  s.workbookVersion===WORKBOOK_VERSION&&s.decisionVersion===DECISION_VERSION&&s.controlVersion==='execution-v1'&&
  JOURNEY_STAGES.includes(s.journeyStage)&&s.mode===(s.journeyStage==='independent'?'independent':'training');
const scoredPractice = s => currentSeminarContract(s)&&s.journeyStage==='mentor';
const fixedKindFor = (s,profile) => currentSeminarContract(s)
  ? (profile?.acceptedKinds?.includes(MFC_REPLY_KIND) ? MFC_REPLY_KIND : profile?.acceptedKinds?.[0])
  : undefined;
const initialOnlyFor = s => currentSeminarContract(s) &&
  (s.status!=='complete'||s.result?.assessmentVersion===SEMINAR_REPLY_GRADING_VERSION);
function replyDecision(decision) {
  return decision?.correspondence?{...decision,correspondence:{...decision.correspondence,orders:[]}}:decision;
}
const exampleDialogue = (s,c) => isStoryJourney(s)&&s.journeyStage==='example'?c?.seminarStory?.exampleDialogue:null;
const calendarVersionFor = s => s.coreStepsVersion===MFC_SEMINAR_VERSION?(s.mfcCalendarVersion||LEGACY_MFC_CALENDAR_VERSION):undefined;
const workbookOptions = s => ({gameplay:Boolean(s.context),coreStepsVersion:s.coreStepsVersion,mfcCalendarVersion:calendarVersionFor(s)});
function canUpgradeMfcCalendar(s) {
  if(s?.coreStepsVersion!==MFC_SEMINAR_VERSION||s.status!=='active'||
    (s.mfcCalendarVersion&&s.mfcCalendarVersion!==MFC_DATES_ONLY_CALENDAR_VERSION))return false;
  const state=values(s.caseStates)[s.caseIndex];
  return Boolean(state&&!state.coreStepsValues?.calendar&&!state.decision&&!state.correspondenceDraft&&!state.reviewPending);
}
const hasWorkbook = s => [LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(s.workbookVersion);
const workbookFor = (c,s) => hasWorkbook(s)?publicWorkbook(c,s.workbookVersion,workbookOptions(s)):null;
const showRegistrationPractice = (s,state) => s.status!=='complete'&&calendarVersionFor(s)===MFC_DATES_ONLY_CALENDAR_VERSION&&Boolean(state.coreStepsValues?.calendar);
function registrationPracticeWorkbook(c,s,state) {
  const current=publicWorkbook(c,s.workbookVersion,{...workbookOptions(s),mfcCalendarVersion:MFC_CALENDAR_VERSION});
  return {...current,calendarVersion:MFC_DATES_ONLY_CALENDAR_VERSION,registrationPreviouslyUnasked:true,
    ...(state.registrationPractice?{registrationPractice:state.registrationPractice}:{})};
}
const roleFor = (c,s,workbook,fixedKind) => s.coreStepsVersion===MFC_SEMINAR_VERSION?
  mfcRole(c.public.role,s.locale,mfcUsesSharedReply(s.coreStepsVersion,workbook||workbookFor(c,s)),fixedKind):localized(c.public.role,s.locale);
function controlCommand(action,workflow) {
  if(!workflow.sharedReply||!['request_evidence','refer'].includes(action?.kind))return action;
  const spec=workflow.definition.issues.find(issue=>issue.id===action.issueId);
  const receipt=action.kind==='refer'&&Array.isArray(action.evidenceSourceIds)&&workflow.materials.find(material=>
    material.issueIds.includes(action.issueId)&&material.verification==='delivery'&&action.evidenceSourceIds.includes(material.id));
  return {...action,recipientIds:receipt?.recipientIds?.length?receipt.recipientIds:spec?.acceptedRecipientSets?.[0]||[]};
}
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
    if(state.controlWorkflow)state.controlWorkflow=normalizeControlWorkflow(state.controlWorkflow);
    if(s.journeyStage==='mentor')state.mentorMessages=values(state.mentorMessages);
    if(state.control)for(const row of (state.control.statuses=values(state.control.statuses)))row.evidenceSourceIds=values(row.evidenceSourceIds);
    if(state.decision){for(const key of ['actionIds','basisDocumentIds'])state.decision[key]=values(state.decision[key]);if(state.decision.workbook){state.decision.workbook.routing??={};state.decision.workbook.routing.recipientIds=values(state.decision.workbook.routing.recipientIds);}}
  }
  // Repair only the current active case. Keep the session identity, revision,
  // history, drafts, observed facts and all completed results untouched.
  if(s.status==='active'){
    const c=s.caseData[s.caseIndex],state=s.caseStates[s.caseIndex];
    if(c&&state){
      const supplements=buildConflictContractMaterials(c);
      for(const material of supplements){
        if(!c.documents.some(doc=>doc.id===material.id))c.documents.push(material);
        if(!state.releasedDocumentIds.includes(material.id))state.releasedDocumentIds.push(material.id);
      }
    }
  }
  return s;
};

export function createReceptionService({store, cases, provider, clock = Date.now, config = {}, canStartAssessment = null, saveResult = null, requireGameplay = false,
  guestEnabled = true, requireSeminarJourney = requireGameplay, guidedSeminarCore = false, requireCurrentSeminarTraining = false,
  resolveLegalCitation=defaultLegalCitationResolver,
  correspondenceProfiles={private:privateCorrespondenceProfile,public:publicCorrespondenceProfile}} = {}) {
  if (!store?.transaction || !store?.get || !provider?.generate) throw new TypeError('Reception adapters are required');
  const limits = {enforceMonetaryBudgets:true, ...DEFAULTS, ...config};
  if (typeof limits.enforceMonetaryBudgets !== 'boolean') throw new TypeError('Invalid monetary budget enforcement flag');
  if (limits.leaseMs <= limits.providerTimeoutMs + 3000) throw new TypeError('Lease must exceed provider timeout');
  if(limits.reviewLeaseMs<=limits.reviewTimeoutMs+3000)throw new TypeError('Review lease must exceed review timeout');
  if(limits.reviewTimeoutMs>90000||limits.reviewLeaseMs>110000)throw new TypeError('Review limits must fit the 120 second function deadline');
  for (const key of Object.keys(DEFAULTS)) if (!Number.isFinite(limits[key]) || limits[key] <= 0) throw new TypeError('Invalid reception limit');
  let catalogPromise;
  const legacyMigrations = new Map(), seminarMigrations = new Map(), availableCases = new Map();
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
  const historicalSession = s => requireCurrentSeminarTraining&&(s.context!=='free'||s.mode==='independent')&&!currentSeminarContract(s);
  function assertWritable(s) {
    if(historicalSession(s))fail('outdated_session',409);
  }
  async function upgradeMfcCalendar(s) {
    if(historicalSession(s)||!canUpgradeMfcCalendar(s))return s;
    // The revision invalidates an in-flight submission from the previous
    // calendar. A concurrently confirmed worksheet keeps its original rules.
    const saved=await store.transaction(`sessions/${s.id}`,current=>{
      if(!canUpgradeMfcCalendar(current))return undefined;
      current.caseStates=values(current.caseStates);
      const state=current.caseStates[current.caseIndex];
      if(state.tutorialFinding?.stepId==='calendar')delete state.tutorialFinding;
      if(state.coreStepReceipt?.stepId==='calendar')delete state.coreStepReceipt;
      current.mfcCalendarVersion=MFC_CALENDAR_VERSION;
      current.revision++;
      return current;
    });
    if(!saved.value)fail('not_found',404);
    return normalizeSession(saved.value);
  }
  async function get(id, identity, {readOnly=false}={}) {
    identifier(id); const s = normalizeSession(await store.get(`sessions/${id}`)); own(s, identity);
    if(!readOnly)assertWritable(s);
    return upgradeMfcCalendar(s);
  }
  function guideFor(s,c,profile){
    return tutorialGuide(c,profile,s.locale,{execution:s.controlVersion==='execution-v1',core:Boolean(s.coreStepsVersion),
      coreStepsVersion:s.coreStepsVersion,mfcCalendarVersion:calendarVersionFor(s),fixedKind:fixedKindFor(s,profile),initialOnly:initialOnlyFor(s)});
  }
  function view(session) {
    const s = normalizeSession(copy(session)), c = s.caseData[s.caseIndex], state = s.caseStates[s.caseIndex];
    const p = localized(c.public, s.locale);
    const initialOnly=initialOnlyFor(s);
    const shownDecision=decision=>initialOnly?replyDecision(decision):decision;
    p.opening=participantOpening(c,s.locale);
    const workbook=localized(showRegistrationPractice(s,state)?registrationPracticeWorkbook(c,s,state):workbookFor(c,s),s.locale);
    const mfc=s.coreStepsVersion===MFC_SEMINAR_VERSION;
    const privateProfile=isTutorial(s)||currentSeminarContract(s)?correspondenceProfiles.private(c,s.locale):null;
    const fixedKind=fixedKindFor(s,privateProfile);
    if(mfc){
      p.role=roleFor(c,s,workbook,fixedKind);
      p.deadlinePrompt=workbook.instructions;
    }
    if(s.context){
      p.procedureRequired=!fixedProcedure(c,s.context);
      if(!p.procedureRequired)p.procedures=[];
    }
    if(usesLegalCitation(s.context,s.workbookVersion)){
      p.normativeActs=s.coreStepsVersion?requiredSeminarActs(c):normativeActsForCase(c);
      delete p.sources;
      if(p.assessment)delete p.assessment.research;
    }
    const correspondence=s.decisionVersion===DECISION_VERSION;
    const profile=correspondence?correspondenceProfiles.public(c,s.locale):null;
    const guide=isTutorial(s)?publicTutorialGuide(guideFor(s,c,privateProfile),s):null;
    if(correspondence){
      // Work-product sessions never publish the old multiple-choice answer menu.
      delete p.assessment;p.actions=[];p.procedures=[];p.routes=[];p.procedureRequired=false;
      p.correspondence=mfc&&profile?{...profile,role:{title:p.role.title},
        ...(fixedKind?{kind:fixedKind,fixedKind,task:p.role.text,...(initialOnly?{initialOnly}: {})}:
          mfcUsesSharedReply(s.coreStepsVersion,workbook)?{task:localized(mfcSharedReplyInstruction,s.locale)}:{})}:profile;
      p.decisionVersion=DECISION_VERSION;
    }
    const result = s.status === 'complete' ? {...(guide?{}:{points:s.result.points,maxPoints:5}), total: s.result.total, cap:s.result.cap||null, attemptId: s.result.attemptId,
      ...(s.result.practiceAssessment?{practiceAssessment:true}:{}),
      ...(s.context==='seminar'?{...s.seminarProgress,...(guide?{}:{passScore:s.result.passScore??100})}:{}),
      ...(s.result.gradingVersion?{gradingVersion:s.result.gradingVersion}:{}),
      journalStatus: s.teacher || s.mode === 'training' || provider.name === 'mock' || typeof saveResult !== 'function' ? 'local' : s.journalSaved ? 'saved' : 'pending',
      cases: s.results.map((r, i) => ({caseId: s.caseData[i].id, title: localized(s.caseData[i].public.title, s.locale), score: r.score,
         feedback: localized(r, s.locale), decision: shownDecision(s.caseStates[i].decision),...(initialOnly?{}:{followupChoiceId:s.caseStates[i].followupChoiceId||null}),
         ...(correspondence?{caseInfo:localized({id:s.caseData[i].id,title:s.caseData[i].public.title,citizen:s.caseData[i].public.citizen,
           date:s.caseData[i].public.date,role:roleFor(s.caseData[i],s,null,fixedKind),
           ...(hasWorkbook(s)?{workbook:workbookFor(s.caseData[i],s)}:{})},s.locale),
           correspondenceProfile:initialOnly?{...p.correspondence}:correspondenceProfiles.public(s.caseData[i],s.locale),
           correspondenceSources:publicCorrespondenceSources(s.caseData[i],s.caseStates[i],s.locale,{includeFollowup:!initialOnly})}:{}),
         ...(!initialOnly&&s.caseStates[i].control?{control:s.caseStates[i].control}:{}),
         ...(!initialOnly&&s.caseStates[i].controlWorkflow?{controlWorkflow:publicControlWorkflow(s.caseStates[i].controlWorkflow,null,s.locale)}:{})}))} : null;
    return {id: s.id, revision: s.revision, mode: s.mode, locale: s.locale, caseIndex: s.caseIndex, caseCount: s.caseData.length,
      ...(historicalSession(s)?{historical:true}:{}),
      startedAt: s.startedAt, updatedAt: s.updatedAt, ...(s.buildId ? {buildId:s.buildId} : {}), ...(s.context ? {context:s.context} : {}),
      ...(s.context==='seminar'?{journeyStage:s.journeyStage||(s.mode==='independent'?'independent':null),
        seminarProgress:s.seminarProgress,seminarPassScore:SEMINAR_PASS_SCORE}:{}),
      ...(isStoryJourney(s)?{seminarStoryVersion:s.seminarStoryVersion}:{}),
      ...(guide?{guidance:guide,...(s.journeyStage==='mentor'?{mentorMessages:state.mentorMessages}:{} )}:{}),
      ...(s.coreStepsVersion?{coreStepsVersion:s.coreStepsVersion,coreSteps:publicCoreSteps(state,guide?.steps[guide.stepIndex]?.id)}:{}),
      ...(correspondence?{decisionVersion:DECISION_VERSION,correspondenceSources:publicCorrespondenceSources(c,state,s.locale,{includeFollowup:!initialOnly&&s.status!=='active'}),
        draftDecision:shownDecision(state.correspondenceDraft)||null,reviewPending:state.reviewPending||null,
        ...(initialOnly?{initialOnly}:{draftControl:state.controlDraft||null,control:state.control||null})}:{}),
      ...(s.controlVersion==='execution-v1'&&!initialOnly?{controlVersion:s.controlVersion,
        controlWorkflow:state.controlWorkflow?publicControlWorkflow(state.controlWorkflow,null,s.locale):null,
        controlActionReceipt:state.controlActionReceipt||null,
        controlValidation:state.controlValidation?localized({valid:false,requestId:state.controlValidation.requestId,
          findings:values(state.controlValidation.findings)},s.locale):null}:{}),
      operationInProgress: Boolean(s.lease && s.lease.until > clock()),
      status: s.status, case: {id: c.id, ...publicMetadata(c), ...p, ...(hasWorkbook(s)?{workbook}:{})}, messages: state.messages,
      documents: c.documents.filter(d => state.releasedDocumentIds.includes(d.id)).map(d => localized({id: d.id, title: d.title, type: d.type, text: d.text, chatAttachment:!s.context&&!d.initial,
        ...(d.image?{image:d.image}:{}),
        ...(c.seminarStory?.textOnlyDocumentIds?.includes(d.id)?{useCaseIllustrations:false}:{}),...(d.url?{url:d.url}:{}),...(d.sensitive!==undefined?{sensitive:d.sensitive}:{})}, s.locale)),
      openedDocumentIds: state.openedDocumentIds, decision: shownDecision(state.decision) || null,
      followup:!initialOnly&&s.status==='followup'&&c.followup?(correspondence?{intro:localized(c.followup.intro,s.locale),control:true,issues:profile?.issues||[]}:
        localized({intro:c.followup.intro,options:c.followup.options},s.locale)):null,
      followupChoiceId:state.followupChoiceId||null,
      feedback: !guide && s.mode === 'training' && state.feedback ? localized(state.feedback, s.locale) : null,
      learningReview: guide?null:learningReviewFor({mode:s.mode,status:s.status,caseData:c,locale:s.locale}),result, provider: provider.name};
  }
  async function remember(session) {
    // Repeatable practice is recovered from its atomic stage pointer. The
    // full session remains resumable by its original ID after completion.
    if(session.coreStepsVersion&&isTutorial(session))return;
    // Store only an opaque session pointer and lifecycle metadata. Keep completed
    // tombstones so a delayed response cannot resurrect an older active revision.
    const entry = sessionEntry(session);
    await store.transaction(`sessionIndex/${hash(session.owner)}/entries/${session.id}`, old =>
      old?.revision > entry.revision ? undefined : entry);
  }
  function sessionEntry(session) {
    return {id: session.id, mode: session.mode, status: session.status, revision: session.revision,
      ...(session.journeyStage?{journeyStage:session.journeyStage}:{}),
      ...(session.decisionVersion?{decisionVersion:session.decisionVersion}:{}),
      ...(session.controlVersion?{controlVersion:session.controlVersion}:{}),
      ...(session.coreStepsVersion?{coreStepsVersion:session.coreStepsVersion}:{}),
      ...(isStoryJourney(session)?{seminarStoryVersion:session.seminarStoryVersion}:{}),
      startedAt: session.startedAt, updatedAt: session.updatedAt, ...(session.workbookVersion?{workbookVersion:session.workbookVersion}:{}),
      ...(session.buildId ? {buildId:session.buildId} : {}), ...(session.context ? {context:session.context} : {})};
  }
  async function response(s) {
    if(historicalSession(s))return {ok:true,view:view(s)};
    s=await upgradeMfcCalendar(s);
    s=await finishPendingReply(s);
    await deliverResult(s);
    await remember(s);
    const progress = s.context==='seminar' ? await seminarProgress(s.owner,s) : null;
    // The immutable attempt receipt is used for journal retries. The student
    // sees current progress, including a better result from another session.
    const current = progress ? {...s,seminarProgress:progress} : s;
    return {ok:true,view:view(current),...(progress?{seminarProgress:progress}:{})};
  }
  function completeShift(s,timestamp,{initialOnly=false}={}) {
    s.status='complete';
    const receipt={attemptId:`reception-ai-${s.id}`,caseCount:s.caseData.length,
      ...(initialOnly?{assessmentVersion:SEMINAR_REPLY_GRADING_VERSION}:{})};
    if(isTutorial(s)){
      s.result={...receipt,completedAt:timestamp};
      const feedback=s.results[0];
      if(scoredPractice(s)&&feedback?.correspondence){
        Object.assign(s.result,{practiceAssessment:true,total:exactCaseScore(feedback),cap:feedback.cap});
      }
      return;
    }
    const seminar=s.context==='seminar';
    const gradedSeminar=seminar&&s.journeyStage==='independent';
    const raw=s.results.reduce((sum,r)=>sum+(gradedSeminar?exactCaseScore(r):r.score),0)/s.results.length;
    const critical=s.results.some(r=>r.authored&&r.criticalIds?.length);
    const bounded=critical?Math.min(raw,60):raw;
    const total=gradedSeminar||s.results.some(r=>r.authored)?bounded:Math.round(bounded*10)/10;
    const points=gradedSeminar?seminarPointsAt(total):seminar?Number(total>=SEMINAR_PASS_SCORE):Math.round(total/20*10)/10;
    s.result={...receipt,points,maxPoints:5,total,raw,cap:critical?60:null,
      ...(gradedSeminar?{gradingVersion:initialOnly?SEMINAR_REPLY_GRADING_VERSION:SEMINAR_GRADING_VERSION}:{}),
      ...(seminar?{completedAt:timestamp,passScore:SEMINAR_PASS_SCORE}:{})};
  }
  function completeCurrentReply(s,feedback,timestamp) {
    const state=s.caseStates[s.caseIndex];
    state.reviewPending=null;
    state.feedback=feedback;
    s.results=[feedback];
    completeShift(s,timestamp,{initialOnly:true});
  }
  async function finishPendingReply(s) {
    const pending = session => currentSeminarContract(session)&&['followup','review'].includes(session.status);
    if(!pending(s))return s;
    const timestamp=clock();
    const finished=await store.transaction(`sessions/${s.id}`,old=>{
      const current=normalizeSession(old);
      if(!current||!pending(current))return undefined;
      const state=current.caseStates[current.caseIndex];
      if(!state.decision)return undefined;
      const feedback=isTutorial(current)?{explanation:'',criteria:[]}:state.correspondenceInitialFeedback;
      if(!feedback)return undefined;
      if(isTutorial(current)){
        const c=current.caseData[current.caseIndex], profile=correspondenceProfiles.private(c,current.locale);
        state.tutorialStepIndex=guideFor(current,c,profile).steps.length;
      }
      completeCurrentReply(current,feedback,timestamp);
      // A legacy control review may already be in flight. Its lease can no
      // longer commit a control result after the saved initial reply closes.
      current.lease=null;
      current.revision++;
      current.updatedAt=timestamp;
      return current;
    });
    return normalizeSession(finished.value)||s;
  }
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
  async function recover(body, identity, cachedIndex=null) {
    if (!['training', 'independent'].includes(body.mode)) fail('invalid_mode');
    if (body.studentKey && body.studentKey !== identity.studentKey && !identity.teacher) fail('forbidden', 403);
    const owner = scopeOf(identity), path = `sessionIndex/${hash(owner)}`;
    const matches = entry => !historicalSession(entry) && entry.mode===body.mode && entry.context===body.context && entry.status!=='complete'
      && (body.journeyStage==='independent' ? !entry.journeyStage||entry.journeyStage==='independent' : entry.journeyStage===body.journeyStage)
      && (!body.decisionVersion || entry.decisionVersion===body.decisionVersion)
      && (!body.workbookVersion || entry.workbookVersion===body.workbookVersion)
      && (body.context==='seminar' || !body.buildId || entry.buildId===body.buildId);
    const version=body.coreStepsVersion|| (guidedSeminarCore&&body.journeyStage?SEMINAR_CORE_VERSION:undefined);
    const wanted = entry => matches(entry)&&entry.coreStepsVersion===version&&entry.seminarStoryVersion===body.seminarStoryVersion;
    let legacySessionId;
    const legacySessions=[];
    if(body.journeyStage){
      const ledger=await store.get(seminarPath(owner));
      const previous=requireCurrentSeminarTraining?[]:isStoryJourney(body)?['mfcJourney','guidedJourney','journey']:
        version===MFC_SEMINAR_VERSION?['guidedJourney','journey']:version===SEMINAR_CORE_VERSION?['journey']:[];
      const legacyStages=version===MFC_SEMINAR_VERSION?JOURNEY_STAGES:[body.journeyStage];
      for(const stage of legacyStages)for(const key of previous){
        const old=ledger?.[key]?.[stage];
        if(!old?.sessionId||old.completed&&!isStoryJourney(body)||legacySessions.some(row=>row.id===old.sessionId))continue;
        const saved=await store.get(`sessions/${old.sessionId}`);
        if(!saved||saved.status==='complete'&&!isStoryJourney(body)||saved.context!=='seminar')continue;
        own(saved,identity);
        legacySessions.push({id:saved.id,journeyStage:stage,...(saved.status==='complete'?{completed:true}:{})});
        if(matches(saved))legacySessionId??=saved.id;
      }
      const pointer=ledger?.[journeyLedger(version,body)]?.[body.journeyStage];
      const historical={...(legacySessionId?{legacySessionId}:{}),...(legacySessions.length&&version===MFC_SEMINAR_VERSION?{legacySessions}:{})};
      if(pointer&&(!pointer.completed||body.journeyStage==='independent')){
        const saved=normalizeSession(await store.get(`sessions/${pointer.sessionId}`));
        if(saved&&wanted(saved)){own(saved,identity);return {...await response(saved),...historical};}
        if(saved?.status==='complete'&&(!pointer.completed||!saved.journalSaved)){
          own(saved,identity);await deliverResult(saved);await remember(saved);
        }
        // An interrupted session allocation can be completed using its original start request.
        if(!saved&&pointer.startRequest)return {...await start(JSON.parse(pointer.startRequest),identity),...historical};
      }
    }
    async function indexed() {
      const index = await (cachedIndex||store.get(`${path}/entries`));
      const candidates = Object.values(index || {}).filter(entry => matches(entry) && (isStoryJourney(body)||!isStoryJourney(entry)) && /^[a-f0-9]{40}$/.test(entry.id))
        .sort((a, b) => b.updatedAt - a.updatedAt || b.startedAt - a.startedAt || b.id.localeCompare(a.id));
      for (let i = 0; i < candidates.length; i++) {
        if (i >= LEGACY_RECOVERY_LIMITS.sessions) fail('recovery_index_required', 409);
        const entry = candidates[i], s = normalizeSession(await store.get(`sessions/${entry.id}`));
        if (!s) { await store.transaction(`${path}/entries/${entry.id}`, () => null); continue; }
        own(s, identity);
        if (!matches(s)) { await remember(s); continue; }
        if(!wanted(s)){
          if(isStoryJourney(body)||s.coreStepsVersion!==MFC_SEMINAR_VERSION)legacySessionId??=s.id;
          continue;
        }
        return response(s);
      }
      return null;
    }
    let recovered = await indexed();
    if (!recovered && !body.context && !await store.get(`${path}/legacyMigrated`)) {
      await migrateLegacyIndex(identity); recovered = await indexed();
    }
    if(legacySessionId)recovered={...(recovered||{ok:true,view:null,seminarProgress:await seminarProgress(owner,body)}),legacySessionId};
    return {...(recovered||{ok:true,view:null,
      ...(body.context==='seminar'?{seminarProgress:await seminarProgress(owner,body)}:{})}),
      ...(legacySessions.length&&version===MFC_SEMINAR_VERSION?{legacySessions}:{})};
  }
  async function recoverCurrentSeminar(body, identity) {
    if (!['training','independent'].includes(body.mode))fail('invalid_mode');
    if (body.studentKey&&body.studentKey!==identity.studentKey&&!identity.teacher)fail('forbidden',403);
    const owner=scopeOf(identity), current={...body,context:'seminar',seminarStoryVersion:SEMINAR_STORY_VERSION,
      journeyStage:body.journeyStage||(body.mode==='independent'?'independent':'example'),
      coreStepsVersion:MFC_SEMINAR_VERSION,workbookVersion:WORKBOOK_VERSION,decisionVersion:DECISION_VERSION,controlVersion:'execution-v1'};
    const indexRead=migrateLegacyIndex(identity).catch(error=>{
      if(error.code!=='recovery_index_required')throw error;
    }).then(()=>store.get(`sessionIndex/${hash(owner)}/entries`));
    const [recovered, progress, entries]=await Promise.all([
      isCurrentStoryJourney(body)?recover(current,identity,indexRead):null,
      store.get(seminarPath(owner)),indexRead,
    ]);
    const history=new Map();
    for(const entry of Object.values(entries||{}).sort((a,b)=>b.updatedAt-a.updatedAt)){
      if(!historicalSession(entry))continue;
      const stage=entry.journeyStage||(entry.mode==='independent'?'independent':'example');
      history.set(entry.id,{id:entry.id,journeyStage:stage,...(entry.status==='complete'?{completed:true}:{})});
    }
    for(const key of ['storyJourney','mfcJourney','guidedJourney','journey'])for(const stage of JOURNEY_STAGES){
      const item=progress?.[key]?.[stage];
      if(item?.sessionId&&!history.has(item.sessionId))history.set(item.sessionId,{id:item.sessionId,journeyStage:stage,
        ...(item.completed?{completed:true}:{})});
    }
    return {ok:true,view:recovered?.view||null,seminarProgress:recovered?.seminarProgress||await seminarProgress(owner,current),
      ...(history.size?{legacySessions:[...history.values()]}:{})};
  }
  function initialState(c, language, timestamp, context) {
    return {messages: [{id: `opening-${c.id}`, role: 'assistant', text: participantOpening(c,language), at: timestamp}],
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
  function seminarAvailable({workbookVersion,decisionVersion,controlVersion}) {
    const key=JSON.stringify([workbookVersion,decisionVersion,controlVersion]);
    if(!availableCases.has(key)){
      const filtered=catalogue().then(all=>all.filter(c=>{
        if(workbookVersion&&!supportsWorkbook(c,workbookVersion))return false;
        if(!decisionVersion&&!controlVersion)return true;
        const profile=correspondenceProfiles.private(c);
        return Boolean(profile&&(!controlVersion||profile.control?.workflow?.version===controlVersion));
      })).catch(error=>{availableCases.delete(key);throw error;});
      availableCases.set(key,filtered);
    }
    return availableCases.get(key);
  }

  function remainingSeminarCases(available, progress) {
    return available.filter(c => !Object.hasOwn(progress.assigned || {}, c.id)).length;
  }
  function journeyCompleted(progress,stage,s){
    const ledgers=isStoryJourney(s)?[journeyLedger(s.coreStepsVersion,s)]:['journey','guidedJourney','mfcJourney'];
    return ledgers.some(key=>{
      const current=progress[key]?.[stage];
      return current?.completed===true||current?.everCompleted===true;
    });
  }
  async function seminarProgress(owner, options) {
    const progress=await store.get(seminarPath(owner))||{};
    const available=(await seminarAvailable(options)).filter(c=>!options.journeyStage||c.id!==SEMINAR_EXAMPLE.caseId);
    const showPoints=!options.id||options.mode==='independent';
    const stages=progress[journeyLedger(options.coreStepsVersion===MFC_SEMINAR_VERSION?MFC_SEMINAR_VERSION:SEMINAR_CORE_VERSION,options)];
    const active=stage=>Boolean(stages?.[stage]&&!stages[stage].completed);
    return {exampleCompleted:journeyCompleted(progress,'example',options),mentorCompleted:journeyCompleted(progress,'mentor',options),
      ...(guidedSeminarCore||options.coreStepsVersion===MFC_SEMINAR_VERSION?{exampleActive:active('example'),mentorActive:active('mentor'),independentActive:active('independent')}:{}),
      ...(showPoints?{seminarPoints:Math.max(progress.points||0,progress.bestPoints||0)}:{}),
      remainingCases:remainingSeminarCases(available,caseHistory(progress,options))};
  }
  async function reserveSeminarCase(owner, id, signature, available, body) {
    const stage=body.journeyStage;
    const version=body.coreStepsVersion||(guidedSeminarCore&&stage?SEMINAR_CORE_VERSION:undefined);
    const guided=Boolean(version), journeyKey=journeyLedger(version,body), repeatable=guided&&isTutorial(body);
    const example=stage==='example'?seminarExample(available):null;
    const seed = randomUUID(), ordered = [...available].filter(c=>!stage||c.id!==SEMINAR_EXAMPLE.caseId)
      .sort((a,b) => hash(`${seed}:${a.id}`).localeCompare(hash(`${seed}:${b.id}`)));
    const storySnapshots=new Map();
    function storySnapshot(caseId){
      if(!storySnapshots.has(caseId)){
        const snapshot=example||selectShiftCases(available,id,{count:1,caseId})[0];
        const projected=validateCase(withSeminarStory(snapshot),{allowSeminarStory:true});
        if(projected.seminarStory?.version!==SEMINAR_STORY_VERSION||
          stage==='example'&&!exampleDialogue(body,projected))fail('invalid_case',503);
        storySnapshots.set(caseId,projected);
      }
      return storySnapshots.get(caseId);
    }
    let rejection='case_bank_exhausted';
    const allocation = await store.transaction(seminarPath(owner), old => {
      rejection='case_bank_exhausted';
      const progress = old || {};
      progress.attempts ||= {};
      const history=caseHistory(progress,body);
      history.assigned ||= {};
      if(stage){
        progress[journeyKey] ||= {};
        if((stage!=='example'&&!journeyCompleted(progress,'example',body))||(stage==='independent'&&!journeyCompleted(progress,'mentor',body))){
          rejection='journey_stage_locked';return undefined;
        }
      }
      if (progress.attempts[id]) return progress;
      if(stage){
        const current=progress[journeyKey][stage];
        if(current&&(current.sessionId===id||!current.completed||!guided&&stage!=='independent'))return progress;
      }
      let selected=example;
      if(guided&&stage==='mentor'){
        const pool=ordered.length?ordered:available;
        let cycle=history.mentorCycle||{};
        if(!pool.some(c=>!Object.hasOwn(cycle,c.id)))cycle={};
        const unplayed=pool.filter(c=>!Object.hasOwn(cycle,c.id));
        selected=unplayed.find(c=>c.id!==history.mentorLastCase)||unplayed[0];
        history.mentorCycle={...cycle,[selected.id]:true};
        (history.mentorSeen??={})[selected.id]=true;
        history.mentorLastCase=selected.id;
      }else if(!selected){
        const unassigned=ordered.filter(c=>!Object.hasOwn(history.assigned,c.id));
        selected=guided ? unassigned.find(c=>!Object.hasOwn(history.mentorSeen||{},c.id))||unassigned[0] : unassigned[0];
      }
      if (!selected) return undefined;
      // A broken date-pack projection must never reserve an unplayable stage.
      if(isStoryJourney(body)){
        try{storySnapshot(selected.id);}
        catch(error){
          if(!(error instanceof ReceptionError)||error.code!=='invalid_case')throw error;
          rejection='invalid_case';return undefined;
        }
      }
      const attempt={caseId:selected.id, signature,...(stage?{journeyStage:stage}:{}),
        ...(version?{coreStepsVersion:version}:{})};
      if(!repeatable)progress.attempts[id]=attempt;
      if(!example&&!repeatable)history.assigned[selected.id]=id;
      if(stage)progress[journeyKey][stage]={sessionId:id,startRequest:JSON.stringify(body),completed:false,
        ...(repeatable?attempt:{}),...(guided&&journeyCompleted(progress,stage,body)?{everCompleted:true}:{})};
      return progress;
    });
    if (!allocation.committed) fail(rejection, rejection==='invalid_case'?503:409);
    const progress=allocation.value, pointer=progress[journeyKey]?.[stage];
    const attempt=progress.attempts?.[id]||(repeatable&&pointer?.sessionId===id?pointer:null);
    if(!attempt&&stage)return {existing:pointer};
    if(attempt.signature!==signature)fail('request_conflict',409);
    if(!available.some(c=>c.id===attempt.caseId))fail('outdated_session',409);
    return {caseId:attempt.caseId,example,coreStepsVersion:attempt.coreStepsVersion,
      ...(isStoryJourney(body)?{storySnapshot:storySnapshot(attempt.caseId)}:{})};
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
    if(historicalSession(body))fail('seminar_training_update_required',409);
    const tutorial=isTutorial(body);
    if (!tutorial && provider.ready === false) fail('not_configured', 503);
    if(!tutorial && body.decisionVersion===DECISION_VERSION&&typeof provider.reviewDecision!=='function')fail('reviewer_unavailable',503);
    const owner = scopeOf(identity), requestScope = isCurrentStoryJourney(body)?`${owner}:${context}:${SEMINAR_STORY_VERSION}`:
      context?`${owner}:${context}`:owner;
    const id = hash(`${requestScope}:${body.requestId}`).slice(0, 40), signature = hash(body);
    const existing = normalizeSession(await store.get(`sessions/${id}`));
    if (existing) { own(existing, identity); if (existing.startSignature !== signature) fail('request_conflict', 409); return response(existing); }
    if (requireGameplay && !context) fail('invalid_context');
    if (requireGameplay && body.workbookVersion!==WORKBOOK_VERSION) fail('invalid_workbook');
    if (context==='seminar' && !body.journeyStage && (guidedSeminarCore||requireSeminarJourney&&mode==='independent')) fail('journey_stage_required',409);
    if (body.journeyStage && (body.workbookVersion!==WORKBOOK_VERSION||body.decisionVersion!==DECISION_VERSION)) fail('invalid_workbook');
    if (body.journeyStage && body.controlVersion!=='execution-v1') fail('invalid_control_version');
    const timestamp = clock(), day = dayOf(timestamp), ownerKey = hash(owner);
    if (mode === 'independent' && !identity.teacher && canStartAssessment && !await canStartAssessment(timestamp)) fail('assessment_closed', 403);
    const all = await seminarAvailable(body);
    if (mode === 'independent' && context !== 'seminar' && new Set(all.map(c=>c.familyId||c.id)).size < 8) fail('pilot_incomplete', 503);
    if (Object.hasOwn(body, 'caseId')) {
      identifier(body.caseId);
      if (mode !== 'training' || context === 'seminar' || !all.some(c => c.id === body.caseId)) fail('invalid_case');
    }
    if (Object.hasOwn(body, 'level') && (mode !== 'training' || context === 'seminar' || ![1, 2, 3].includes(body.level))) fail('invalid_level');
    const available = body.level ? all.filter(c => publicMetadata(c).level === body.level) : all;
    if (!available.length || (body.caseId && !available.some(c => c.id === body.caseId))) fail('invalid_case');
    if (context==='seminar') await seedSeminarHistory(identity);
    const seminar = context==='seminar' ? await reserveSeminarCase(owner,id,signature,available,body) : null;
    if(seminar?.existing){
      const resumed=normalizeSession(await store.get(`sessions/${seminar.existing.sessionId}`));
      if(resumed){own(resumed,identity);return response(resumed);}
      if(!seminar.existing.startRequest)fail('outdated_session',409);
      return start(JSON.parse(seminar.existing.startRequest),identity);
    }
    const multiCase = mode==='independent' && !seminar;
    const selected=seminar?.storySnapshot?[seminar.storySnapshot]:seminar?.example?[seminar.example]:
      selectShiftCases(available,id,{count:multiCase?8:1,caseId:seminar?.caseId||body.caseId,balanced:multiCase});
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
      ...(body.controlVersion?{controlVersion:body.controlVersion}:{}),
      mode, locale: language, ...(body.workbookVersion?{workbookVersion:body.workbookVersion}:{}), ...(body.buildId ? {buildId:body.buildId} : {}), startedAt: timestamp, updatedAt: timestamp, revision: 1, status: 'active', caseIndex: 0,
      ...(context ? {context} : {}), ...(body.journeyStage ? {journeyStage:body.journeyStage} : {}),
      ...(seminar?.coreStepsVersion?{coreStepsVersion:seminar.coreStepsVersion}:{}),
      ...(isStoryJourney(body)?{seminarStoryVersion:body.seminarStoryVersion,storyDossierSHA256:hash(selected[0])}:{}),
      ...(seminar?.coreStepsVersion===MFC_SEMINAR_VERSION?{mfcCalendarVersion:MFC_CALENDAR_VERSION}:{}),
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
        if (limits.enforceMonetaryBudgets && (m.guestMicros || 0) + amount > limits.guestMonthlyBudgetMicros) limitCode = 'guest_monthly_limit';
        else if (limits.enforceMonetaryBudgets && (d.guestMicros || 0) + amount > limits.guestDailyBudgetMicros) limitCode = 'guest_daily_limit';
        else if (active.filter(request => request.guest).length >= limits.guestMaxConcurrent) limitCode = 'guest_busy';
        if (limitCode !== 'budget_or_rate_limit') return undefined;
      }
      if (active.length >= limits.maxConcurrent || limits.enforceMonetaryBudgets && (d.micros + amount > limits.dailyBudgetMicros || m.micros + amount > limits.monthlyBudgetMicros || o.micros + amount > limits.studentDailyBudgetMicros) || o.turns >= limits.maxDailyTurnsPerStudent) return undefined;
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
        own(s, identity);assertWritable(s);
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
    const available=(await seminarAvailable(s)).filter(c=>!s.journeyStage||c.id!==SEMINAR_EXAMPLE.caseId);
    const repeatable=s.coreStepsVersion&&isTutorial(s);
    const recorded = await store.transaction(seminarPath(s.owner), progress => {
      const stage=progress?.[journeyLedger(s.coreStepsVersion,s)]?.[s.journeyStage];
      if(repeatable&&stage?.sessionId!==s.id){
        // This session can race a completed response and another browser's
        // next start. The newer pointer proves the prior practice was closed.
        return stage?.everCompleted?progress:undefined;
      }
      const attempt=repeatable?stage:progress?.attempts?.[s.id];
      if (!attempt || attempt.caseId !== s.caseData[0].id || attempt.signature !== s.startSignature) return undefined;
      if (attempt.completed) return progress;
      attempt.completed = true;
      attempt.remainingCases = remainingSeminarCases(available,caseHistory(progress,s));
      if (s.mode === 'independent') {
        if(isThresholdGradingVersion(s.result.gradingVersion))progress.bestPoints=Math.max(progress.bestPoints||0,s.result.points);
        else progress.points=Math.min(MAX_SEMINAR_POINTS,(progress.points||0)+s.result.points);
        attempt.seminarPoints=isThresholdGradingVersion(s.result.gradingVersion)?Math.max(progress.bestPoints||0,progress.points||0):progress.points;
      }
      if(stage?.sessionId===s.id){
        stage.completed=true;
        delete stage.startRequest;
      }
      return progress;
    });
    if (!recorded.committed) fail('result_conflict',409);
    const attempt=repeatable?recorded.value[journeyLedger(s.coreStepsVersion,s)][s.journeyStage]:recorded.value.attempts[s.id];
    const seminarProgress = {remainingCases:repeatable?remainingSeminarCases(available,caseHistory(recorded.value,s)):attempt.remainingCases,
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
        const result = s.context==='seminar'&&!s.result.gradingVersion
          ? {...s.result,seminarPoints:s.seminarProgress.seminarPoints} : copy(s.result);
        await saveResult({sessionId: s.id, studentKey: s.studentKey, uid: s.uid, result, startedAt: s.startedAt, completedAt: s.result.completedAt ?? s.updatedAt,
          cases: s.caseData.map(c => ({id: c.id, version: c.version,...(c.datePackId?{datePackId:c.datePackId}:{}),...(c.familyId?{familyId:c.familyId}:{}),
            ...(isStoryJourney(s)?{seminarStoryVersion:s.seminarStoryVersion,storyDossierSHA256:s.storyDossierSHA256,...(c.provenance?{provenance:c.provenance}:{})}:{})})),
          decisions: s.caseStates.map(state => initialOnlyFor(s)?replyDecision(state.decision):state.control?{...state.decision,control:state.control,correspondenceFeedback:state.feedback?.correspondence}:
            state.followupChoiceId?{...state.decision,followupChoiceId:state.followupChoiceId}:state.decision)});
        await store.transaction(`sessions/${s.id}`, old => old ? {...old, journalSaved: true} : undefined); s.journalSaved = true;
      } catch { /* The immutable completed shift remains resumable; retry receipt on resume. */ }
    }
    return s;
  }
  function requireExampleQuestion(s,c,state) {
    const dialogue=exampleDialogue(s,c);
    if(!dialogue||(state.tutorialStepIndex||0)!==0||state.exampleQuestionCompleted)fail('tutorial_step_required',409);
    return dialogue;
  }

  async function suggestedMessage(body,identity) {
    if(body.suggestionId!=='example-question')fail('invalid_request');
    const text=string(body.text,limits.maxMessageChars);
    const updated=await mutate(body,identity,(s,timestamp)=>{
      if(s.status!=='active')fail('not_active',409);
      if(s.revision!==body.expectedRevision)fail('revision_conflict',409);
      const c=s.caseData[s.caseIndex],state=s.caseStates[s.caseIndex];
      const dialogue=requireExampleQuestion(s,c,state);
      if(!Object.values(dialogue.prompt).includes(text))fail('invalid_request');
      state.messages.push({id:`${body.requestId}-user`,role:'user',text,at:timestamp},
        {id:`${body.requestId}-assistant`,role:'assistant',text:localized(dialogue.reply,s.locale),at:timestamp});
      state.knownFactIds=[...new Set([...state.knownFactIds,dialogue.factId])];
      state.exampleQuestionCompleted=true;
      state.tutorialFinding=null;
      state.turns++;
    });
    return response(updated);
  }

  async function message(body, identity) {
    const mentor=body.op==='mentor-question';
    if(body.suggestionId!==undefined)return suggestedMessage(body,identity);
    const requestId = identifier(body.requestId), text = string(body.text, limits.maxMessageChars), digest = hash(body), timestamp = clock(), leaseId = randomUUID();
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) fail('invalid_revision');
    let failure, duplicate = false, resumedReply = false;
    const acquired = await store.transaction(`sessions/${identifier(body.sessionId)}`, old => {
      const s = normalizeSession(old); try {
        own(s, identity); assertWritable(s);
        const prior = Object.hasOwn(s.requests, requestId) ? s.requests[requestId] : null;
        if (prior) {
          if (prior.digest !== digest) fail('request_conflict', 409);
          if (prior.status === 'done') { duplicate = true; return s; }
          if (prior.status === 'pending' && s.lease?.until > timestamp) fail('busy', 409);
          // An expired in-flight request may have reached OpenAI. Never call it a
          // second time under the same request ID or fabricate an unpaid result.
          fail(prior.status === 'pending' ? 'request_interrupted' : 'request_failed', 409);
        }
        if(mentor&&s.journeyStage!=='mentor')fail('mentor_unavailable',403);
        if(mentor&&initialOnlyFor(s)&&['followup','review'].includes(s.status)){
          resumedReply=true;
          return s;
        }
        if (s.lease && s.lease.until > timestamp) fail('busy', 409);
        if(mentor ? s.status==='complete' : s.status!=='active')fail('not_active',409);
        if (s.revision !== body.expectedRevision) fail('revision_conflict', 409);
        const state=s.caseStates[s.caseIndex], turns=mentor?state.mentorMessages.length/2:state.turns;
        if(s.journeyStage==='example')requireExampleQuestion(s,s.caseData[s.caseIndex],state);
        if(mentor&&body.issueId!==undefined&&!state.controlWorkflow?.issues.some(issue=>issue.id===body.issueId))
          fail('invalid_control_issue');
        if (turns >= limits.maxTurnsPerCase) fail('case_turn_limit', 429);
        s.lease = {id: leaseId, requestId, until: timestamp + limits.leaseMs}; s.requests[requestId] = {digest, status: 'pending'}; return s;
      } catch (error) { failure = error; return undefined; }
    });
    if (!acquired.committed) throw failure || new ReceptionError('conflict', 409);
    const s = normalizeSession(acquired.value);
    if (duplicate||resumedReply) return response(s);
    const c = s.caseData[s.caseIndex], state = s.caseStates[s.caseIndex]; let reservation, usage;
    try {
      if (!mentor && provider.ready === false) fail('not_configured', 503);
      let estimate, generate;
      let mentorInput;
      if(mentor){
        const guide=mentorContext(s,c,state,body.issueId);
        if(body.workspacePage)guide.workspacePage=body.workspacePage;
        const workbook=showRegistrationPractice(s,state)?registrationPracticeWorkbook(c,s,state):workbookFor(c,s);
        guide.evidence=mentorEvidence(c,state,s.locale,guide,localized(workbook,s.locale),s.status);
        guide.decision.correspondence.citations=[];
        const history=state.mentorMessages.slice(-12).map(({role,text})=>({role,text}));
        mentorInput={guide,history,text,locale:s.locale};
        estimate=estimateMentorReservation(mentorInput);
        generate=signal=>{
          if(provider.ready===false)fail('not_configured',503);
          if(typeof provider.answerMentor!=='function')fail('mentor_unavailable',503);
          return provider.answerMentor({...mentorInput,signal});
        };
      }else{
        const dossier = actorCase(c, s.locale);
        if(hasWorkbook(s)){
          const facts=localized(workbookFor(c,s),s.locale);
          dossier.correspondenceAddress=facts?.origin||null;dossier.eventLocation=facts?.site||null;
          if(s.coreStepsVersion===MFC_SEMINAR_VERSION)dossier.receptionScene={
            context:facts?.routingPolicy?.context||null,
            events:facts?.events.filter(event=>['intakeReceived','intakeRegistered'].includes(event.id))||[]
          };
        }
        dossier.releasedDocumentIds = dossier.documents.filter(document => state.releasedDocumentIds.includes(document.id)).map(document => document.id);
        if(s.context)dossier.documentsAvailableUpfront=true;
        estimate=estimateReservation({actorCase:dossier,messages:state.messages,text,locale:s.locale,
          maxOutputTokens:Math.max(limits.maxOutputTokens,provider.maxOutputTokens||0),maxCalls:provider.maxCalls||1});
        generate=signal=>provider.generate({actorCase:dossier,messages:copy(state.messages),text,locale:s.locale,signal});
      }
      let generated;
      let timeout;
      try {
        if (estimate.perCallInputTokens > limits.maxInputAllowance) fail('context_limit', 413);
        if (!mentor || provider.ready !== false && typeof provider.answerMentor==='function')
          reservation = await reserve(s, requestId, estimate.micros);
        const controller = new AbortController();
        const deadline = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new ReceptionError('provider_unavailable', 503)); }, limits.providerTimeoutMs); });
        generated = await Promise.race([generate(controller.signal),deadline]);
      } catch (error) {
        const recoverable = ['not_configured','mentor_unavailable','provider_busy','provider_unavailable','provider_invalid'];
        const reply = mentorInput && recoverable.includes(error.code) && groundedMentorFallback(mentorInput);
        if(!reply)throw error;
        generated={reply};
      } finally { clearTimeout(timeout); }
      usage = generated?.usage;
      const turn=mentor?{reply:string(generated?.reply,3200)}:validateActorTurn(generated,c,state,s.locale);
      const finished = await store.transaction(`sessions/${s.id}`, old => {
        const current = normalizeSession(old); if (!current || current.lease?.id !== leaseId) return undefined;
        const st = current.caseStates[current.caseIndex];
        const messages=mentor?st.mentorMessages:st.messages;
        messages.push({id:`${requestId}-user`,role:'user',text,at:timestamp},{id:`${requestId}-assistant`,role:'assistant',text:turn.reply,at:clock()});
        if(!mentor){
          st.knownFactIds = [...new Set([...st.knownFactIds, ...turn.revealedFactIds])];
          if(!current.context)st.releasedDocumentIds = [...new Set([...st.releasedDocumentIds, ...turn.releasedDocumentIds])];
          if(exampleDialogue(current,c)&&!turn.guarded){
            // A relevant answer must communicate a dossier fact. Greetings and
            // requests for information the visitor does not have remain chat.
            st.exampleQuestionCompleted=turn.revealedFactIds.length>0;
            if(st.exampleQuestionCompleted)st.tutorialFinding=null;
          }
          st.turns++;
        }
        current.requests[requestId] = {digest, status:'done',...(mentor?{}:{guarded:turn.guarded}),
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
        if ((s.guest||mentor) && !reservation && error instanceof ReceptionError && error.status === 429) delete current.requests[requestId];
        else current.requests[requestId] = {digest, status: 'failed'};
        current.lease = null; return current;
      });
      throw error instanceof ReceptionError ? error : new ReceptionError('unavailable', 503);
    } finally { if (reservation) await settle(reservation, usage); }
  }
  function correspondenceOperational(c,decision,session) {
    const base={score:0,criteria:[
      {id:'route',earned:0,max:CORRESPONDENCE_WEIGHTS.initial.route},
      {id:'calendar',earned:0,max:CORRESPONDENCE_WEIGHTS.initial.calendar},
    ],cap:null,explanation:''};
    if(hasWorkbook(session))return evaluateWorkbook(c,decision,base,session.workbookVersion,workbookOptions(session));
    base.criteria[0].earned=c.rubric.routeIds.includes(decision.routeId)?base.criteria[0].max:0;
    base.criteria[1].earned=decision.deadline===c.rubric.deadline?base.criteria[1].max:0;
    base.score=base.criteria.reduce((sum,row)=>sum+row.earned,0);
    return base;
  }

  function assertExecutionReviewCapacity(session,c,state,profile,workflow) {
    // Check BEFORE recording the action. Even a maximum-size final memorandum
    // must remain assessable after all accepted actions. JSON escaping can cost
    // six bytes per input code unit, and the review contains the final text twice.
    // The stored journal and full public documents are never silently truncated.
    try{
      for(const language of ['ru','en','zh']){
        const projected=publicControlWorkflow(workflow,null,language);
        const statuses=projected.issues.map(issue=>({issueId:issue.id,status:'pending',
          evidenceSourceIds:projected.materials.filter(material=>material.issueIds.includes(issue.id))
            .sort((a,b)=>Buffer.byteLength(JSON.stringify({id:b.id,title:b.title}))-Buffer.byteLength(JSON.stringify({id:a.id,title:a.title})))
            .slice(0,20).map(material=>material.id)}));
        const context=buildCorrespondenceReview(c,{...state,controlWorkflow:workflow},state.decision,language,{
          profile,phase:'control',control:{text:'\u0001'.repeat(6000),statuses},resolvedCitations:state.correspondenceEvidence||[],
          workbook:localized(workbookFor(c,session),language),coreStepsVersion:session.coreStepsVersion,fixedKind:fixedKindFor(session,profile),
        });
        // Reserve a margin for different status labels and small review metadata.
        if(Buffer.byteLength(JSON.stringify(context),'utf8')+4096>240000||estimateReviewReservation({context}).perCallInputTokens+4096>limits.maxReviewInputAllowance)fail('control_context_limit',413);
      }
    }catch(error){
      if(error instanceof ReceptionError&&['context_limit','control_context_limit'].includes(error.code))fail('control_context_limit',413);
      throw error;
    }
  }

  async function reviewCorrespondence(body,identity,{practice=false}={}) {
    const requestId=identifier(body.requestId),requestDigest=hash(body),timestamp=clock(),leaseId=randomUUID();
    const phase=body.op==='followup'?'control':'initial';
    const pendingPhase=practice?'mentor-draft':phase;
    let failure;
    const acquired=await store.transaction('sessions/'+identifier(body.sessionId),old=>{
      const s=normalizeSession(old);
      try{
        own(s,identity);assertWritable(s);
        if(s.decisionVersion!==DECISION_VERSION)fail('invalid_decision_version');
        const prior=Object.hasOwn(s.requests,requestId)?s.requests[requestId]:null;
        if(prior){
          if(prior.digest!==requestDigest)fail('request_conflict',409);
          if(prior.status==='done')return s;
          if(s.lease?.until>timestamp)fail('busy',409);
        }
        if(s.lease&&s.lease.until>timestamp)fail('busy',409);
        if(s.status!==(phase==='control'?'followup':'active'))fail('not_active',409);
        if((practice||body.expectedRevision!==undefined)&&(!Number.isSafeInteger(body.expectedRevision)||s.revision!==body.expectedRevision))fail('revision_conflict',409);
        const c=s.caseData[s.caseIndex],state=s.caseStates[s.caseIndex],profile=correspondenceProfiles.private(c);
        if(!profile)fail('invalid_case',503);
        if(practice&&(!scoredPractice(s)||guideFor(s,c,profile).steps[state.tutorialStepIndex]?.id!=='draft'))fail('tutorial_step_locked',409);
        if(phase==='initial'){
          if(state.decision)fail('not_active',409);
          const raw=copy(body.decision);let workbook;
          if([LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(s.workbookVersion)){
            workbook=validateWorkbookDecision(raw?.workbook,s.workbookVersion,workbookOptions(s));delete raw.workbook;
          }
          const decision=validateDecision(raw,c,state.openedDocumentIds,{decisionVersion:DECISION_VERSION,state,locale:s.locale,
            fixedKind:fixedKindFor(s,profile),initialOnly:initialOnlyFor(s)});
          if(workbook)decision.workbook=workbook;
          if(s.coreStepsVersion)assertCoreDecision(state,decision,{rejectUnconfirmedCoreCitations:practice});
          const sections=decision.correspondence.sections;
          if(practice&&!Object.values(sections).some(Boolean))fail('invalid_correspondence');
          if(!practice&&s.coreStepsVersion===MFC_SEMINAR_VERSION&&!sections.resolution)fail('invalid_correspondence');
          state.correspondenceDraft=decision;
        }else{
          if(body.choiceId!==undefined||!state.decision||state.control)fail('invalid_control');
          state.controlDraft=validateCorrespondenceControl(body.control,c,state,profile,s.locale);
          if(s.controlVersion==='execution-v1'){
            if(!state.controlWorkflow)fail('invalid_control',409);
            const validation=validateControlSubmission(state.controlWorkflow,profile,state.controlDraft);
            state.controlValidation=validation.valid?null:{...validation,requestId};
            if(!validation.valid){
              // An inconsistent closure is returned for correction. It is neither
              // an assessed zero nor a paid model request, and the draft survives.
              state.reviewPending=null;
              s.requests[requestId]={digest:requestDigest,status:'done',phase,outcome:'returned-for-correction'};
              s.revision++;s.updatedAt=timestamp;return s;
            }
          }
        }
        state.reviewPending={requestId,phase:pendingPhase,status:'pending'};
        s.lease={id:leaseId,requestId,until:timestamp+limits.reviewLeaseMs};
        s.requests[requestId]={digest:requestDigest,status:'pending',phase:pendingPhase,attempt:prior ? (prior.attempt||1)+1 : 1};
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
      const operational=phase==='initial'?correspondenceOperational(c,decision,s):null;
      let preparedControl;
      if(phase==='initial'&&!initialOnlyFor(s)&&s.controlVersion==='execution-v1'&&c.followup){
        preparedControl=createControlWorkflow({caseData:c,profile,decision,initialFeedback:operational,locale:s.locale,timestamp,
          sharedReply:mfcUsesSharedReply(s.coreStepsVersion,workbookFor(c,s))});
        assertExecutionReviewCapacity(s,c,{...state,decision,correspondenceEvidence:evidence,correspondenceInitialFeedback:operational},profile,preparedControl);
      }
      const context=buildCorrespondenceReview(c,state,decision,s.locale,{
        profile,resolvedCitations:evidence,phase,control:phase==='control'?state.controlDraft:null,operational,
        workbook:localized(workbookFor(c,s),s.locale),coreStepsVersion:s.coreStepsVersion,fixedKind:fixedKindFor(s,profile),
        initialOnly:initialOnlyFor(s),
      });
      const inputLimit=s.controlVersion==='execution-v1'?limits.maxReviewInputAllowance:limits.maxInputAllowance;
      const remaining=Math.min(inputLimit-estimateReviewReservation({context}).perCallInputTokens,
        240000-Buffer.byteLength(JSON.stringify(context),'utf8'));
      addReviewDialogue(context,state.messages,remaining);
      const estimate=estimateReviewReservation({context});
      if(estimate.perCallInputTokens>inputLimit)fail('context_limit',413);
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
      const feedback=scoreCorrespondenceReview(generated.review,context,{practice});
      const finished=await store.transaction('sessions/'+s.id,old=>{
        const current=normalizeSession(old);
        if(!current||current.lease?.id!==leaseId||current.caseIndex!==s.caseIndex)return undefined;
        const st=current.caseStates[current.caseIndex];
        if(phase==='initial'){
          st.decision=copy(decision);st.correspondenceEvidence=copy(evidence);
          st.correspondenceInitialFeedback=copy(feedback);st.correspondenceDraft=null;
          if(practice){
            st.tutorialFinding=null;
            st.tutorialStepIndex=guideFor(current,c,profile).steps.length;
            completeCurrentReply(current,feedback,timestamp);
          }else if(initialOnlyFor(current))completeCurrentReply(current,feedback,timestamp);
          else if(c.followup){
            if(current.controlVersion==='execution-v1')st.controlWorkflow=copy(preparedControl);
            st.feedback=null;current.status='followup';
          }
          else{st.feedback=feedback;current.results.push(feedback);current.status='review';}
        }else{
          st.control=copy(state.controlDraft);st.controlDraft=null;
          st.controlValidation=null;
          st.correspondenceControlFeedback=copy(feedback);
          st.feedback=combineCorrespondenceFeedback(st.correspondenceInitialFeedback,feedback);
          current.results.push(st.feedback);current.status='review';
        }
        st.reviewPending=null;
        current.requests[requestId]={digest:requestDigest,status:'done',phase:pendingPhase,attempt,reviewContextHash:hash(context),
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
        current.requests[requestId]={digest:requestDigest,status:'failed',phase:pendingPhase,attempt};
        current.caseStates[current.caseIndex].reviewPending={requestId,phase:pendingPhase,status:'retry',code:safe.code};
        current.lease=null;return current;
      });
      throw safe;
    }finally{controller.abort();if(reservation)await settle(reservation,usage);}
  }

  function openTutorialDocuments(c,state,documentIds) {
    for(const document of c.documents.filter(doc=>documentIds.includes(doc.id)&&state.releasedDocumentIds.includes(doc.id))){
      state.openedDocumentIds=[...new Set([...state.openedDocumentIds,document.id])];
      state.knownFactIds=[...new Set([...state.knownFactIds,...document.factIds])];
    }
  }

  function mentorContext(s,c,state,selectedIssueId) {
    const profile=correspondenceProfiles.private(c,s.locale);
    const guide=guideFor(s,c,profile);
    if(showRegistrationPractice(s,state)){
      const practice=localized(registrationPracticeWorkbook(c,s,state),s.locale);
      guide.registrationPractice={events:practice.events,instructions:practice.instructions,optional:true};
    }
    guide.currentStep=guide.steps[state.tutorialStepIndex||0]?.id||'review';
    if(selectedIssueId)guide.selectedIssueId=selectedIssueId;
    if(s.status==='active'){
      guide.steps=guide.steps.filter(step=>!step.id.startsWith('control'));
      delete guide.control;
    }
    const draft=state.decision||state.correspondenceDraft, conclusion=state.control||state.controlDraft;
    if(draft){
      const {subject,kind,sections}=draft.correspondence;
      guide.currentPracticeDraft={subject,kind,sections:Object.fromEntries(Object.entries(sections).map(([key,text])=>[key,text.slice(0,900)]))};
    }
    if(conclusion)guide.currentConclusion={text:conclusion.text.slice(0,1200),statuses:conclusion.statuses};
    if(state.tutorialFinding)guide.currentFinding=state.tutorialFinding;
    if(!guide.initialOnly&&state.controlWorkflow){
      const shown=publicControlWorkflow(state.controlWorkflow,null,s.locale);
      const latest=shown.journal.at(-1);
      const related=selectedIssueId ? shown.materials.filter(row=>row.issueIds.includes(selectedIssueId)).slice(-6) : [];
      const materials=[...new Map([...related,...shown.materials.slice(-6)].map(row=>[row.id,row])).values()].slice(0,6);
      guide.currentExecution={
        issues:shown.issues.slice(0,8).map(({id,title,scope,status,verifiedEvidenceIds,availableActions})=>
          ({id,title,scope,status,verifiedEvidenceIds,availableActions:availableActions.map(({kind,label})=>({kind,label}))})),
        materials:materials.map(({id,title,text,issueIds,provenanceLabel})=>({id,title,text:text.slice(0,800),issueIds,provenanceLabel})),
        latestAction:{issueId:latest?.issueId,kind:latest?.kind,outcome:latest?.outcome,message:latest?.message}
      };
    }
    return guide;
  }

  const tutorCorrespondence = (raw,c,state,language,session,profile) => {
    const {workbook,...decision}=raw||{};
    return {...validateDecision(decision,c,state.openedDocumentIds,{decisionVersion:DECISION_VERSION,state,locale:language,
      fixedKind:fixedKindFor(session,profile),initialOnly:initialOnlyFor(session)}),
      workbook:validateWorkbookDecision(workbook,WORKBOOK_VERSION,workbookOptions(session))};
  };

  async function inspectMentorDraft(raw,c,state,profile,language,session) {
    const {coreStepsVersion}=session;
    let decision,evidence;
    try{
      decision=tutorCorrespondence(raw,c,state,language,session,profile);
      if(coreStepsVersion)assertCoreDecision(state,decision,{rejectUnconfirmedCoreCitations:currentSeminarContract(session)});
      const {sections,subject,citations}=decision.correspondence;
      if(!subject||Object.values(sections).some(text=>!text))return {finding:'emptyDraft',decision};
      if(!fixedKindFor(session,profile)&&!profile.acceptedKinds.includes(decision.correspondence.kind))return {finding:'kind',decision};
      const {routing,calendar}=tutorialOperational(c,decision,coreStepsVersion,calendarVersionFor(session)).workbook;
      if(!routing?.correct)return {finding:'route',decision};
      if(Object.values(calendar.correct).some(correct=>!correct))return {finding:'calendar',decision};
      if(!citations.some(row=>row.section==='facts'&&['document','dialogue'].includes(row.kind)))return {finding:'evidence',decision};
      const legal = citations.filter(row=>row.kind==='legal'&&row.section==='legalBasis');
      const applicability=Object.keys(acceptableLegalProvisions(c)).length>0;
      const sourceIds=new Set(normativeActsForCase(c).map(row=>row.id));
      const supported=legal.some(row=>applicability
        ? hasApplicableLegalCitation(c,{docId:row.sourceId,unitIds:row.unitIds,text:row.quote})
        : !sourceIds.size||sourceIds.has(row.sourceId));
      if(!coreStepsVersion&&!supported)return {finding:'legal',decision};
      evidence=await resolveCorrespondenceCitations(c,state,decision.correspondence,language,{resolveLegalCitation});
    }catch(error){
      if(error instanceof ReceptionError&&error.status<500){
        const finding={core_steps_required:'invalidDraft',core_calendar_required:'calendar',core_route_required:'route',core_citation_required:'legal'}[error.code];
        return {finding:finding||'invalidDraft'};
      }
      throw error;
    }
    return {decision,evidence};
  }

  function inspectMentorControl(raw,c,state,profile,language) {
    try{
      const control=validateCorrespondenceControl(raw,c,state,profile,language);
      if(!control.text)return {finding:'emptyControl',control};
      const validation=validateControlSubmission(state.controlWorkflow,profile,control);
      if(!validation.valid)return {finding:'invalidControl',control,details:localized(validation.findings,language)};
      return {control};
    }catch(error){
      if(error instanceof ReceptionError&&error.status<500)return {finding:'invalidControl'};
      throw error;
    }
  }

  function assertCoreStepAllowed(s,body) {
    if(!s.coreStepsVersion)fail('invalid_core_step',409);
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==s.revision)fail('revision_conflict',409);
    if(s.status!=='active')fail('not_active',409);
    const state=s.caseStates[s.caseIndex];
    if(isTutorial(s)){
      const c=s.caseData[s.caseIndex], profile=correspondenceProfiles.private(c,s.locale);
      const {steps}=guideFor(s,c,profile), index=state.tutorialStepIndex||0;
      if(steps[index]?.id===body.stepId)return true;
      if(body.stepId==='materials'&&state.coreStepsValues?.citations?.length&&
        steps.slice(0,index).some(step=>step.id==='materials'))return false;
      fail('tutorial_step_locked',409);
    }
    const steps=publicCoreSteps(state);
    if(steps.stepId!==body.stepId&&!steps.completed.includes(body.stepId))fail('core_step_locked',409);
    return false;
  }

  async function coreStep(body,identity,loaded) {
    const requestId=identifier(body.requestId);
    identifier(body.stepId);
    if(!Object.hasOwn(CORE_STEP_FIELDS,body.stepId))fail('invalid_core_step');
    const session=loaded||await get(body.sessionId,identity);
    if(isTutorial(session)!==(body.op==='tutorial-step'))fail('invalid_core_step',409);
    const prior=Object.hasOwn(session.requests,requestId)?session.requests[requestId]:null;
    if(prior){
      if(prior.digest!==hash(body))fail('request_conflict',409);
      if(prior.status==='done')return response(session);
    }
    if(session.lease?.until>clock())fail('busy',409);
    assertCoreStepAllowed(session,body);
    const c=session.caseData[session.caseIndex],state=session.caseStates[session.caseIndex];
    const complaintExample=currentSeminarContract(session)&&session.journeyStage==='example'&&c.id===SEMINAR_EXAMPLE.caseId;
    const inspected=await inspectCoreStep(body,c,state,session.locale,{resolveLegalCitation,guide:isTutorial(session),
      complaintExample,...workbookOptions(session)});
    return response(await mutate(body,identity,s=>{
      const advancesTutorial=assertCoreStepAllowed(s,body);
      const current=s.caseStates[s.caseIndex];
      if(inspected.finding){
        current.tutorialFinding={stepId:body.stepId,explanation:mentorFinding(inspected.finding,s.locale,calendarVersionFor(s))};
        current.coreStepReceipt={requestId,stepId:body.stepId};
      }else{
        saveCoreStep(current,body,inspected);
        if(isTutorial(s)){
          current.tutorialFinding=null;
          if(advancesTutorial)current.tutorialStepIndex=(current.tutorialStepIndex||0)+1;
        }
      }
    }));
  }

  async function tutorialStep(body,identity) {
    const requestId=identifier(body.requestId);
    identifier(body.stepId);
    let inspected;
    const session=await get(body.sessionId,identity);
    if(initialOnlyFor(session)&&body.stepId.startsWith('control')&&session.status!=='active')return response(session);
    if(session.coreStepsVersion&&Object.hasOwn(CORE_STEP_FIELDS,body.stepId))return coreStep(body,identity,session);
    if(Object.values(CORE_STEP_FIELDS).some(field=>Object.hasOwn(body,field)))fail('invalid_core_step');
    const draft=Object.hasOwn(body,'decision'), control=Object.hasOwn(body,'control');
    if(scoredPractice(session)&&body.stepId==='draft'&&draft&&!control&&
      body.useExample===undefined&&body.confirmOwn===undefined&&body.choiceId===undefined){
      return reviewCorrespondence(body,identity,{practice:true});
    }
    if(draft!==control&&body.useExample===undefined&&body.confirmOwn===undefined&&body.choiceId===undefined){
      const state=session.caseStates[session.caseIndex], prior=session.requests[requestId];
      if(prior){
        if(prior.digest!==hash(body))fail('request_conflict',409);
        if(prior.status==='done')return response(session);
      }
      const ownProduct=session.journeyStage==='mentor'||session.coreStepsVersion&&session.journeyStage==='example';
      if(ownProduct&&body.stepId===(draft?'draft':'control-memo')&&session.revision===body.expectedRevision){
        if(session.lease?.until>clock())fail('busy',409);
        const c=session.caseData[session.caseIndex], profile=correspondenceProfiles.private(c,session.locale);
        const guide=guideFor(session,c,profile);
        if(guide.steps[state.tutorialStepIndex]?.id===body.stepId){
          inspected=draft?await inspectMentorDraft(body.decision,c,state,profile,session.locale,session):
            inspectMentorControl(body.control,c,state,profile,session.locale);
          if(!inspected.finding&&session.journeyStage==='mentor')return reviewMentorProduct(body,identity,inspected);
        }
      }
    }
    return response(await mutate(body,identity,(session,timestamp)=>applyTutorialStep(session,body,timestamp,inspected)));
  }

  async function reviewMentorProduct(body,identity,inspected) {
    const {requestId,sessionId,stepId}=body, digest=hash(body), timestamp=clock(), leaseId=randomUUID();
    const phase=inspected.decision?'draft':'control';
    let failure;
    const acquired=await store.transaction('sessions/'+sessionId,old=>{
      const s=normalizeSession(old);
      try{
        own(s,identity);assertWritable(s);
        const prior=s.requests[requestId];
        if(prior?.digest&&prior.digest!==digest)fail('request_conflict',409);
        if(prior?.status==='done')return s;
        if(s.lease?.until>timestamp)fail('busy',409);
        if(s.journeyStage!=='mentor'||s.status!==(phase==='draft'?'active':'followup'))fail('tutorial_step_locked',409);
        if(s.revision!==body.expectedRevision)fail('revision_conflict',409);
        const state=s.caseStates[s.caseIndex];
        if(phase==='draft')state.correspondenceDraft=inspected.decision;
        else state.controlDraft=inspected.control;
        state.reviewPending={requestId,phase:'mentor-'+phase,status:'pending'};
        s.requests[requestId]={digest,status:'pending',attempt:(prior?.attempt||0)+1};
        s.lease={id:leaseId,requestId,until:timestamp+limits.leaseMs};
        return s;
      }catch(error){failure=error;return undefined;}
    });
    if(!acquired.committed)throw failure||new ReceptionError('conflict',409);
    const s=normalizeSession(acquired.value), prior=s.requests[requestId];
    if(prior.status==='done')return response(s);
    let reservation,usage,timeout;
    const controller=new AbortController();
    try{
      if(provider.ready===false||typeof provider.reviewMentorWork!=='function')fail('review_unavailable',503);
      const c=s.caseData[s.caseIndex], state=s.caseStates[s.caseIndex];
      const guide=mentorContext(s,c,state);
      const work=phase==='draft'?{decision:inspected.decision,evidence:inspected.evidence.map(({title,quote,kind,locator})=>({title,quote,kind,locator}))}
        :inspected.control;
      const input={guide,work,phase,locale:s.locale};
      const estimate=estimateMentorWorkReservation(input);
      if(estimate.perCallInputTokens>limits.maxReviewInputAllowance)fail('context_limit',413);
      const billingId=hash([requestId,'mentor-work',prior.attempt]).slice(0,40);
      reservation=await reserve(s,billingId,estimate.micros);
      const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{
        controller.abort();reject(new ReceptionError('review_unavailable',503));
      },limits.providerTimeoutMs);});
      const review=await Promise.race([provider.reviewMentorWork({...input,signal:controller.signal}),deadline]);
      usage=review?.usage;
      if(typeof review?.ready!=='boolean'||typeof review.feedback!=='string'||!review.feedback.trim()||review.feedback.length>3200)
        fail('review_unavailable',503);
      const finished=await store.transaction('sessions/'+sessionId,old=>{
        const current=normalizeSession(old);
        if(current?.lease?.id!==leaseId)return undefined;
        const state=current.caseStates[current.caseIndex];
        if(review.ready){
          applyTutorialStep(current,body,timestamp,inspected);
          state.tutorialWorkFeedback={stepId,text:review.feedback.trim()};
        }else state.tutorialFinding={stepId,explanation:review.feedback.trim()};
        state.reviewPending=null;
        current.requests[requestId]={digest,status:'done',attempt:prior.attempt};
        current.lease=null;current.revision++;current.updatedAt=clock();
        return current;
      });
      if(!finished.committed)fail('request_interrupted',409);
      return response(finished.value);
    }catch(error){
      const safe=error instanceof ReceptionError?error:new ReceptionError('review_unavailable',503);
      await store.transaction('sessions/'+sessionId,old=>{
        const current=normalizeSession(old);
        if(current?.lease?.id!==leaseId)return undefined;
        current.caseStates[current.caseIndex].reviewPending={requestId,phase:'mentor-'+phase,status:'retry',code:safe.code};
        current.requests[requestId]={digest,status:'failed',attempt:prior.attempt};
        current.lease=null;
        return current;
      });
      throw safe;
    }finally{
      clearTimeout(timeout);
      controller.abort();
      if(reservation)await settle(reservation,usage);
    }
  }

  function applyTutorialStep(s,body,timestamp,inspected) {
    if(!isTutorial(s))fail('tutorial_unavailable',403);
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==s.revision)fail('revision_conflict',409);
    const c=s.caseData[s.caseIndex],state=s.caseStates[s.caseIndex];
    const profile=correspondenceProfiles.private(c,s.locale), guide=guideFor(s,c,profile);
    const index=state.tutorialStepIndex||0, step=guide.steps[index];
    if(!step||step.id!==body.stepId)fail('tutorial_step_locked',409);
    const writesOwnWork=s.journeyStage==='mentor'||Boolean(s.coreStepsVersion);
    const ownDraft=writesOwnWork&&step.id==='draft';
    const ownControl=writesOwnWork&&step.id==='control-memo';
    const ownExecution=writesOwnWork&&tutorialExecutionKinds(step.id);
    const product=ownDraft||ownControl;
    if ((body.useExample!==undefined&&(s.coreStepsVersion||body.useExample!==true||!product&&!ownExecution))||
      (body.confirmOwn!==undefined&&(body.confirmOwn!==true||!ownExecution||body.useExample))||
      (body.decision!==undefined&&(!ownDraft||body.useExample))||
      (body.control!==undefined&&(!ownControl||body.useExample)))fail('invalid_request');
    if(product||ownExecution){
      if(body.choiceId!==undefined)fail('invalid_tutorial_choice');
      if(ownExecution&&!body.useExample){
        const finding=tutorialExecutionProgress(state.controlWorkflow,step.id);
        if(finding||!body.confirmOwn){
          state.tutorialFinding={stepId:step.id,explanation:mentorFinding(finding||{ 'control-request':'request', 'control-evidence':'verify', 'control-status':'status' }[step.id],s.locale)};
          return;
        }
      }
      if(product&&!body.useExample){
        inspected=ownDraft?(inspected||{finding:'emptyDraft'})
          :body.control===undefined?{finding:'emptyControl'}:inspectMentorControl(body.control,c,state,profile,s.locale);
        if(inspected.finding){
          if(inspected.decision)state.correspondenceDraft=inspected.decision;
          if(inspected.control)state.controlDraft=inspected.control;
          state.tutorialFinding={stepId:step.id,explanation:[mentorFinding(inspected.finding,s.locale,calendarVersionFor(s)),
            ...(inspected.details||[]).map(finding=>finding.message)].join(' ')};
          return;
        }
      }
    }else{
      const selected=step.choices.find(choice=>choice.id===body.choiceId);
      if(!selected)fail('invalid_tutorial_choice');
      if(!selected.correct){
        state.tutorialFinding={stepId:step.id,correctChoiceId:step.choices.find(choice=>choice.correct).id,explanation:step.explanation};
        return;
      }
    }
    if(step.id==='reception'&&exampleDialogue(s,c)&&!state.exampleQuestionCompleted)fail('tutorial_question_required',409);
    state.tutorialFinding=null;
    state.tutorialStepIndex=index+1;
    if((s.coreStepsVersion?step.id==='reception':step.id==='conversation')&&s.journeyStage==='example'&&!isStoryJourney(s)){
      // The walkthrough uses the frozen dossier, so every learner sees the same
      // conversation. It never asks the actor to improvise a solution.
      for(const fact of c.facts.filter(fact=>c.rubric.requiredFactIds.includes(fact.id)&&fact.knowledge!=='document')){
        if(fact.prompt)state.messages.push({id:`example-${fact.id}-user`,role:'user',text:localized(fact.prompt,s.locale),at:timestamp});
        state.messages.push({id:`example-${fact.id}-assistant`,role:'assistant',text:localized(fact.text,s.locale),at:timestamp});
        state.knownFactIds=[...new Set([...state.knownFactIds,fact.id])];
      }
    }
    if(step.action==='document')openTutorialDocuments(c,state,step.documentIds);
    if(step.action==='draft'){
      state.correspondenceDraft=null;
      state.reviewPending=null;
      if(inspected?.decision){
        state.decision=inspected.decision;
        state.correspondenceEvidence=inspected.evidence;
      }else{
        openTutorialDocuments(c,state,guide.decision.correspondence.citations.map(citation=>citation.sourceId));
        state.decision=tutorCorrespondence(guide.decision,c,state,s.locale,s,profile);
      }
      if(guide.initialOnly)completeCurrentReply(s,{explanation:'',criteria:[]},timestamp);
      else if(c.followup){
        if(s.controlVersion==='execution-v1')state.controlWorkflow=createControlWorkflow({caseData:c,
          profile:s.journeyStage==='example'?walkthroughControlProfile(c,profile):profile,decision:state.decision,
          initialFeedback:tutorialOperational(c,state.decision,s.coreStepsVersion,calendarVersionFor(s)),locale:s.locale,timestamp,sharedReply:guide.sharedReply});
        s.status='followup';
      }
    }
    if(state.controlWorkflow&&tutorialExecutionKinds(step.id)&&(!ownExecution||body.useExample))
      state.controlWorkflow=tutorialExecutionAction(state.controlWorkflow,step.id,guide,{caseData:c,locale:s.locale,timestamp});
    if(step.action==='control'){
      state.controlDraft=null;
      state.reviewPending=null;
      state.control=inspected?.control||(state.controlWorkflow ? validatedTutorialMemo(state.controlWorkflow,profile,guide,s.locale)
        : validateCorrespondenceControl(guide.control,c,state,profile,s.locale));
    }
    if(step.action==='review'){
      state.feedback={explanation:step.explanation,criteria:[]};
      s.results.push(state.feedback);
      s.status='review';
    }
  }

  async function handle(body, identity) {
    checkIdentity(identity); if (!body || !Object.hasOwn(allowed, body.op)) fail('invalid_operation'); fields(body, allowed[body.op]);
    if (body.workspacePage!==undefined && !['reception','chat','documents','calendar','route','decision'].includes(body.workspacePage)) fail('invalid_request');
    if (body.context!==undefined && !['seminar','free'].includes(body.context)) fail('invalid_context');
    if (body.journeyStage!==undefined && (!JOURNEY_STAGES.includes(body.journeyStage) || body.context!=='seminar' ||
      body.mode!==(body.journeyStage==='independent'?'independent':'training'))) fail('invalid_journey_stage');
    const knownStoryVersion=isCurrentStoryJourney(body)||body.seminarStoryVersion===LEGACY_SEMINAR_STORY_VERSION&&
      (body.op==='recover'||requireCurrentSeminarTraining);
    if(body.seminarStoryVersion!==undefined&&
      (!knownStoryVersion||
        body.context!=='seminar'||body.coreStepsVersion!==MFC_SEMINAR_VERSION||!body.journeyStage))fail('invalid_story_version');
    if(body.coreStepsVersion!==undefined&&(body.coreStepsVersion!==MFC_SEMINAR_VERSION||!body.journeyStage))fail('invalid_request');
    if(body.workbookVersion!==undefined&&![LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(body.workbookVersion))fail('invalid_workbook');
    if(body.decisionVersion!==undefined&&body.decisionVersion!==DECISION_VERSION)fail('invalid_decision_version');
    if(body.controlVersion!==undefined&&(body.controlVersion!=='execution-v1'||body.decisionVersion!==DECISION_VERSION))fail('invalid_control_version');
    if (body.buildId !== undefined && (typeof body.buildId !== 'string' || !/^[a-f0-9]{32}$/.test(body.buildId))) fail('invalid_build');
    if (identity.guest) {
      if (Object.hasOwn(body, 'studentKey')) fail('forbidden', 403);
      if (['catalog', 'start', 'recover'].includes(body.op) && body.context !== 'free') fail('forbidden', 403);
      if (['start', 'recover'].includes(body.op) && body.mode !== 'training') fail('forbidden', 403);
      if (body.op === 'start' && (body.workbookVersion !== WORKBOOK_VERSION || body.decisionVersion !== DECISION_VERSION)) fail('invalid_workbook');
      if (!guestEnabled && ['start', 'message', 'decide', 'followup','control-action'].includes(body.op)) fail('guest_unavailable', 503);
    }
    if (body.op === 'catalog') return {ok: true, cases: (await catalogue()).filter(c=>(!body.workbookVersion||supportsWorkbook(c,body.workbookVersion))&&
      (!body.decisionVersion||Boolean(correspondenceProfiles.private(c)))&&
      (!body.controlVersion||correspondenceProfiles.private(c)?.control?.workflow?.version===body.controlVersion)).map(c => ({id: c.id, title: localized(c.public.title, locale(body.locale)), ...publicMetadata(c)}))};
    if (body.op === 'start') return start(body, identity);
    if (body.op === 'resume') {
      const session=await get(body.sessionId, identity,{readOnly:true});
      const historical=historicalSession(session);
      const historicalResult = !session.context&&(session.status==='complete'||historical);
      if(body.context && session.context!==body.context && !historicalResult)fail('outdated_session',409);
      if((body.buildId && session.context!=='seminar' && session.buildId!==body.buildId||
        body.workbookVersion&&session.workbookVersion!==body.workbookVersion) && session.status!=='complete'&&!historical) fail('outdated_session',409);
      if(body.decisionVersion&&session.decisionVersion!==body.decisionVersion&&session.status!=='complete'&&!historical)fail('outdated_session',409);
      return response(session);
    }
    if (body.op === 'recover') return requireCurrentSeminarTraining&&(body.context!=='free'||body.mode==='independent')?
      recoverCurrentSeminar(body,identity):recover(body,identity);
    if (body.op==='message'||body.op==='mentor-question')return message(body,identity);
    if (body.op==='tutorial-step')return tutorialStep(body,identity);
    if (body.op==='core-step')return coreStep(body,identity);
    if (body.op==='registration-check'){
      if(typeof body.registrationTimely!=='boolean')fail('core_calendar_required');
      const updated=await mutate(body,identity,s=>{
        const state=s.caseStates[s.caseIndex];
        if(s.status!=='active'||!showRegistrationPractice(s,state))fail('invalid_core_step',409);
        if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==s.revision)fail('revision_conflict',409);
        const workbook=registrationPracticeWorkbook(s.caseData[s.caseIndex],s,state);
        const dates=Object.fromEntries(workbook.events.map(event=>[event.id,event.date]));
        const expected=registrationTimely(dates.intakeReceived,dates.intakeRegistered,workbook.registrationCounting);
        state.registrationPractice={answer:body.registrationTimely,correct:body.registrationTimely===expected};
      });
      return response(updated);
    }
    if(body.op==='control-action'){
      const session=await get(body.sessionId,identity);
      if(initialOnlyFor(session))return response(session);
      const updated=await mutate(body,identity,(s,timestamp)=>{
        if(s.journeyStage==='example'&&!s.coreStepsVersion)fail('tutorial_step_required',409);
        if(s.controlVersion!=='execution-v1'||s.decisionVersion!==DECISION_VERSION)fail('invalid_control_version');
        if(s.status!=='followup')fail('not_active',409);
        if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==s.revision)fail('revision_conflict',409);
        const c=s.caseData[s.caseIndex],state=s.caseStates[s.caseIndex];
        if(!state.controlWorkflow||state.control)fail('invalid_control',409);
        const profile=correspondenceProfiles.private(c,s.locale);
        const guided=isTutorial(s);
        const step=guided?guideFor(s,c,profile).steps[state.tutorialStepIndex]:null;
        if(guided&&!tutorialExecutionKinds(step?.id)?.includes(body.action?.kind))fail('tutorial_step_required',409);
        const workflow=applyControlAction(state.controlWorkflow,null,controlCommand(body.action,state.controlWorkflow),{
          caseData:c,locale:s.locale,timestamp,requestId:body.requestId,expectedRevision:state.controlWorkflow.revision,
        });
        if(guided){
          const last=workflow.journal.at(-1);
          state.tutorialFinding=last.accepted&&last.outcome!=='evidence_insufficient'?null:
            {stepId:step.id,explanation:localized(last.message,s.locale)};
        }else assertExecutionReviewCapacity(s,c,state,profile,workflow);
        state.controlWorkflow=workflow;
        state.controlActionReceipt={requestId:body.requestId,workflowRevision:state.controlWorkflow.revision};
        state.controlValidation=null;
      });
      return response(updated);
    }
    if(['decide','followup'].includes(body.op)){
      const session=await get(body.sessionId,identity);
      if(body.op==='followup'&&initialOnlyFor(session))return response(session);
      if(isTutorial(session))fail('tutorial_step_required',409);
      if(session.decisionVersion===DECISION_VERSION)return reviewCorrespondence(body,identity);
      if(body.control!==undefined||body.decision?.correspondence!==undefined)fail('invalid_decision_version');
    }
    if (body.op === 'locale') {
      const language = locale(body.locale); let failure;
      const r = await store.transaction(`sessions/${identifier(body.sessionId)}`, old => {
        const s = normalizeSession(old); try { own(s, identity); assertWritable(s); if (s.lease && s.lease.until > clock()) fail('busy', 409); s.locale = language; s.revision++; s.updatedAt = clock(); return s; }
        catch (error) { failure = error; return undefined; }
      });
      if (!r.committed) throw failure; return response(r.value);
    }
    if(body.op==='next'){
      const session=await get(body.sessionId,identity);
      if(initialOnlyFor(session)&&(session.status==='complete'||
        ['followup','review'].includes(session.status)&&session.caseStates[session.caseIndex].decision))
        return response(session);
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
        else completeShift(session,timestamp);
      }
    });
    return response(s);
  }
  return {handle};
}
