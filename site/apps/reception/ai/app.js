import {createReceptionAPI, isRecoverableMaterialRequest, newRequestId, ReceptionAPIError} from './api-client.js';
import {localized, normalizeLocale, translator} from './copy.js';
import './workspace-copy.js';
import './correspondence-copy.js';
import {createReceptionTour} from './coach-tour.js';
import {MFC_VERSION, MFC_CALENDAR_VERSION, MFC_CALENDAR_WITHOUT_REGISTRATION, isCoreJourney, isMfcJourney, CORE_ACTIONS, CORE_PAGES, coreStepId, coreLabel, coreDatePayload} from './core-steps.js';
import {availableMentorActions, guidanceView, isLesson, journeyPathView, lessonLabel, lessonStep, mentorWorkFeedbackView, nextJourneyStage} from './tutorial.js';
import {blankCorrespondence,restoreCorrespondence,reduceCorrespondence,insertLegalPassage,legalPassageMessage,correspondenceEditorView,correspondencePreviewView,
  correspondenceControlView,restoreCorrespondenceControl,reduceCorrespondenceControl,correspondenceControlSubmission,
  presentCorrespondenceFeedback,correspondenceSourceKey,printCorrespondence,downloadCorrespondenceHTML} from './response-editor.js';
import {controlWorkspaceView,controlRecordView,restoreControlActionDraft,reduceControlActionDraft,
  restoreControlWorkspaceUI,reduceControlWorkspaceUI,controlActionSubmission,controlWorkspaceIntent,missingControlActionFields} from './control-workspace.js';
import {RECEPTION_AUTHORITIES} from './authority-directory.js';
import {icon} from './cabinet-icons.js';
import {createReceptionStorage} from './session-storage.js';
import {calendarWorkbenchView, createCalendarWorkbench, sourceLinkView, normativeActsView, referenceView, referenceDecisionPatch} from './workbench.js';
import {learningReviewView, workRecordView} from './learning-review.js';
import {characterMedia, createMessengerMedia} from './media.js';
import {caseIllustrations, createIllustrationViewer, illustratedDocumentText, renderIllustrationThumbnails} from './illustrations.js';
import {createSourceReader} from '../js/source-reader.js';
import {gameCopy} from '../localization/game-copy.js';
import {authorityPickerView,routingOriginView,authoritySelectionLabel,localizedAuthorityName} from './authority-picker.js';
import {caseTimelineView,workbookSummaryView,workbookFeedbackView} from './workbook.js';
import {createUpdateAdapter, captureUpdateView, restoreUpdateView} from '../../../assets/js/platform-update-state.js';
import {resourceURL, getReleaseContext} from '../../../assets/js/release-resources.js';

const VERSION = 'reception-ai-ui-v1';
const SEMINAR_STORY_VERSION = 'mfc-stories-v2';
const presentationOwners = new WeakMap();
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clone = value => JSON.parse(JSON.stringify(value));
const workspacePages = ['reception','chat','documents','calendar','route','decision'];
const mutationOps = ['start','message','document','decide','followup','control-action','next','tutorial-step','mentor-question','core-step','registration-check'];
const complaintExamplePassages = {exampleComplaintArticle8:'law59999-u52',exampleComplaintArticle10:'law59999-u60'};
function complaintExampleArticle(unitIds) {
  if(unitIds.includes(complaintExamplePassages.exampleComplaintArticle8)&&
    unitIds.every(id=>/^law59999-u(?:4[6-9]|5[0-3])$/.test(id)))return 8;
  if(unitIds.length&&unitIds.every(id=>/^law59999-u(?:5[89]|6[0-6])$/.test(id)))return 10;
  return null;
}
const blankWorkbook = () => ({referralDeadline:'',registrationTimely:false,routing:{recipientIds:[]}});
const blankDecision = () => ({workbook:blankWorkbook(),procedureId:'',routeId:'',actionIds:[],law:{number:'',article:''},deadline:'',basisDocumentIds:[],reasoning:''});
const blankAssessment = () => ({factId:'',applicationId:'',trapId:'',actDate:'',calendar:{anchor:'',rule:'',start:'',shift:''},research:{recordId:'',fragmentId:'',extracted:'',finding:''}});
function restoreDecision(value, authored=false) {
  const base=blankDecision(), source=value&&typeof value==='object'?value:{};
  for(const key of ['procedureId','routeId','deadline','reasoning'])if(typeof source[key]==='string')base[key]=source[key];
  for(const key of ['actionIds','basisDocumentIds'])if(Array.isArray(source[key]))base[key]=source[key].filter(x=>typeof x==='string');
  for(const key of ['number','article'])if(typeof source.law?.[key]==='string')base.law[key]=source.law[key];
  if(authored||source.assessment){
    const a=base.assessment=blankAssessment(),saved=source.assessment||{};
    for(const key of ['factId','applicationId','trapId','actDate'])if(typeof saved[key]==='string')a[key]=saved[key];
    for(const group of ['calendar','research'])for(const key of Object.keys(a[group]))if(typeof saved[group]?.[key]==='string')a[group][key]=saved[group][key];
  }
  if(source.workbook&&typeof source.workbook==='object'){base.workbook={referralDeadline:typeof source.workbook.referralDeadline==='string'?source.workbook.referralDeadline:'',registrationTimely:source.workbook.registrationTimely===true,routing:{recipientIds:Array.isArray(source.workbook.routing?.recipientIds)?source.workbook.routing.recipientIds.filter(id=>typeof id==='string').slice(0,2):[]}};}
  if(['internal','forward'].includes(source.workbook?.routing?.disposition))base.workbook.routing.disposition=source.workbook.routing.disposition;
  if(source.correspondence)base.correspondence=restoreCorrespondence(source.correspondence);
  return base;
}
const safeURL = value => {
  try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
};
const documentImage = value => typeof value==='string'&&/^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/.test(value)
  ? resourceURL('../'+value,import.meta.url).href : '';
export function loadAIStyle() {
  const id = 'rudn-reception-ai-style-v7';
  if (!document.getElementById(id)) {
    const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet';
    link.href = new URL('./style.css', import.meta.url).href; document.head.append(link);
    for(const href of ['./workbench.css','./learning-review.css','./cabinet.css','./authority-picker.css','./workbook.css','./response-editor.css','./control-workspace.css','../source-reader.css','./illustrations.css','./tutorial.css']){const extraStyle=document.createElement('link');extraStyle.rel='stylesheet';extraStyle.href=new URL(href,import.meta.url).href;document.head.append(extraStyle);}
  }
}

/** Native, framework-free workspace. It never receives private dossiers or scoring keys. */
export async function mountReceptionAI(root, options = {}, config = {}) {
  loadAIStyle();
  const lifetime = new AbortController();
  const stop = () => lifetime.abort();
  if (options.signal?.aborted) return Object.assign(() => {}, {module:'reception'});
  options.signal?.addEventListener('abort', stop, {once:true});
  // A scoped lease prevents an old asynchronous unmount from restoring the
  // platform bar on top of a newly opened reception workspace.
  const body=root.ownerDocument.body;
  const owners=presentationOwners.get(body)||new Set();
  const presentationToken=Symbol('reception-mount');
  owners.add(presentationToken);presentationOwners.set(body,owners);body.classList.add('reception-immersive');
  const backend = options.backend;
  const gameplayContext = config.gameplayContext ?? (config.demo ? undefined : options.context === 'free' ? 'free' : 'seminar');
  const seminar = gameplayContext === 'seminar';
  const coreStepsVersion = config.coreStepsVersion === undefined ? MFC_VERSION : config.coreStepsVersion;
  const seminarStoryVersion = seminar&&coreStepsVersion===MFC_VERSION?(config.seminarStoryVersion===undefined?SEMINAR_STORY_VERSION:config.seminarStoryVersion):null;
  const illustrationViewer = createIllustrationViewer(root);
  const tour=createReceptionTour(root);
  const guest = options.guest === true && gameplayContext === 'free';
  const ownerNow = () => {
    const studentKey=backend?.getProfile?.()?.studentKey;
    const uid=backend?.user?.uid;
    if(guest&&!studentKey&&!backend?.isAdmin?.())return 'guest:'+options.guestUid;
    return String(studentKey || uid || options.studentKey || 'local-demo');
  };
  const owner = ownerNow();
  const storageKey = `rudn.reception.ai.v1:${encodeURIComponent(owner)}:${options.context || 'course'}:${options.period || 'current'}:${encodeURIComponent(config.endpoint || '')}`;
  let locale = normalizeLocale(options.locale || options.getLocale?.() || document.documentElement.lang);
  let t = translator(locale), view = null, busy = false, disposed = false, paused = false, operation = '', error = null;
  let pending = null, draftMessage = '', decisionDraft = blankDecision(), tab = 'documents', selectedDoc = '', mode = 'training';
  let routingSearch='',routingTerritory;
  let confirmation = false, storageOkay = true, savedCaseId = '', restoring = false, requestedLocale = null, work = Promise.resolve();
  let completedNotified = '', updateAdapter = null, needsResume = false, pendingAt = null, mobilePane = 'desk';
  let enteringMessages = new Set(), lastPendingRenderedId = '';
  let chatScroll = {top:0,bottom:true}, followupDraft='';
  let detailOpen = new Set();
  let calendarDraftVersion='', registrationReviewOffered=false;
  let page='reception', calendarState={}, selectedReferences=[], readMessageIds=new Set(), pageScroll={}, savedSessionId='';
  let catalog=[], catalogLoading=false, catalogError=false, trainingLevel='', trainingCaseId='', caseSearch='';
  let notice='', recoverBusy=false, deferredDocuments=new Set(), recoveringMaterials=false;
  let failedOperation='', waitingTimer, stageFocus=false;
  let responsePreview=false,controlDraft=restoreCorrespondenceControl(),citationSelections={},recipientOrderId='';
  let executionActionDraft=restoreControlActionDraft(),controlWorkspaceUI=restoreControlWorkspaceUI(),controlRecipientPicker=false;
  let calendar, exampleDraftSeed=null;
  let seminarProgress={}, mentorDraft='', examplePreviewed=false, controlSampleOpened=false, sampleComparison=false;
  let chatDialog='citizen', mentorReturnPage='reception', mentorWelcomeSeen=false;
  let mentorChatScroll={top:0,bottom:true};
  let controlMaterialSeen='', controlMissing=false, coreEdit='', coreCitationsEdited=false, choosingCase=false;
  const legacySessionIds=new Map();
  let archiveEntry=null, historyScreen=null, reconcilingDecision=false;
  const hasCore = () => isCoreJourney(view);
  const mfcJourney = () => isMfcJourney(view);
  const currentDocumentKind = () => {
    if(!mfcJourney()||view?.seminarStoryVersion!==SEMINAR_STORY_VERSION)return null;
    const profile=view.case.correspondence;
    return profile?.fixedKind||profile?.kind||'reply';
  };
  const registrationPractice = () => view?.case?.workbook?.registrationPreviouslyUnasked===true;
  const registrationWritable = () => active()&&registrationPractice()&&!view.case.workbook.registrationPractice&&!busy&&!pending&&!paused;
  const coreCurrent = () => coreStepId(view);
  const replyOnly = () => view?.case?.correspondence?.initialOnly===true;
  const coreIsEditable = id => view?.coreSteps?.completed?.includes(id)&&(id==='materials'||view.journeyStage==='independent');
  const acceptsTwoCoreCitations = () => view?.seminarStoryVersion===SEMINAR_STORY_VERSION&&view.journeyStage==='example'&&view.case.id==='complaint-routing';
  const coreInView = () => coreEdit || coreCurrent();
  const cl = key => coreLabel(locale,key,mfcJourney());
  const tutorial = () => isLesson(view?.journeyStage);
  const l = key => lessonLabel(locale,key);
  const lessonAnswer = () => view?.guidance?.decisionByLocale?.[locale] || view?.guidance?.decision;
  const mentorWork = stepId => tutorial()&&(view.journeyStage==='mentor'||hasCore())&&lessonStep(view)?.id===stepId;
  const mentorActions = () => availableMentorActions(view);
  const guidedQuestion = () => coreCurrent()==='reception'?view?.guidance?.question:null;

  const visualViewport = window.visualViewport;
  const media = createMessengerMedia(root, {signal:lifetime.signal});
  let store;
  try { store = options.storage || globalThis.localStorage; } catch { storageOkay = false; }
  const release=getReleaseContext(),buildId=release?.retention==='current-only'?release.buildId:'';
  const drafts=createReceptionStorage({store,owner,endpoint:config.endpoint||'',legacyKey:storageKey,version:VERSION,buildId,retainPreviousBuild:seminar});
  let initial=drafts.readInitial();
  if(drafts.hasRetiredDraft())notice=t('retiredSession');
  function restoreSaved(saved) {
    if(!saved)return;
    savedSessionId=typeof saved.sessionId==='string'?saved.sessionId:'';
    draftMessage=typeof saved.draftMessage==='string'?saved.draftMessage.slice(0,2000):'';
    decisionDraft=restoreDecision(saved.decisionDraft);
    if(['documents','sources','decision'].includes(saved.tab))tab=saved.tab;
    if(workspacePages.includes(saved.page))page=saved.page;
    mobilePane=page==='chat'?'chat':'desk';
    selectedDoc=String(saved.selectedDoc||'');savedCaseId=String(saved.caseId||'');
    deferredDocuments=new Set(Array.isArray(saved.deferredDocuments)?saved.deferredDocuments.filter(id=>typeof id==='string').slice(0,30):[]);
    if(Number.isFinite(saved.pendingAt))pendingAt=saved.pendingAt;
    if(saved.chatScroll&&Number.isFinite(saved.chatScroll.top))chatScroll={top:Math.max(0,saved.chatScroll.top),bottom:saved.chatScroll.bottom!==false};
    if(['training','independent'].includes(saved.mode))mode=saved.mode;
    followupDraft=typeof saved.followupDraft==='string'?saved.followupDraft:'';
    controlDraft=restoreCorrespondenceControl(saved.controlDraft);
    executionActionDraft=restoreControlActionDraft(saved.executionActionDraft);
    controlWorkspaceUI=restoreControlWorkspaceUI(saved.controlWorkspaceUI);
    controlRecipientPicker=saved.controlRecipientPicker===true;
    responsePreview=saved.responsePreview===true;
    citationSelections={};
    for(const section of ['facts','legalBasis','resolution','nextSteps'])if(saved.citationSelections?.[section]){
      const entry=saved.citationSelections[section];citationSelections[section]={key:String(entry.key||'').slice(0,300),quote:String(entry.quote||'').slice(0,4000)};
    }
    detailOpen=new Set(Array.isArray(saved.detailOpen)?saved.detailOpen.filter(x=>typeof x==='string'):[]);
    mentorDraft=typeof saved.mentorDraft==='string'?saved.mentorDraft.slice(0,2000):'';
    chatDialog=saved.chatDialog==='mentor'?'mentor':'citizen';
    if(workspacePages.includes(saved.mentorReturnPage)&&saved.mentorReturnPage!=='chat')mentorReturnPage=saved.mentorReturnPage;
    mentorWelcomeSeen=saved.mentorWelcomeSeen===true;
    if(Number.isFinite(saved.mentorChatScroll?.top))mentorChatScroll={top:saved.mentorChatScroll.top,bottom:saved.mentorChatScroll.bottom===true};
    examplePreviewed=saved.examplePreviewed===true;
    exampleDraftSeed=saved.exampleDraftSeed||null;
    controlSampleOpened=saved.controlSampleOpened===true;
    controlMaterialSeen=typeof saved.controlMaterialSeen==='string'?saved.controlMaterialSeen:'';
    coreEdit=CORE_ACTIONS.includes(saved.coreEdit)?saved.coreEdit:'';
    coreCitationsEdited=saved.coreCitationsEdited===true;
    choosingCase=seminar&&saved.choosingCase===true;
    pending=saved.pending&&mutationOps.includes(saved.pending.op)&&typeof saved.pending.requestId==='string'?saved.pending:null;
    calendarState=saved.calendarState&&typeof saved.calendarState==='object'?saved.calendarState:{};
    calendarDraftVersion=typeof saved.calendarVersion==='string'?saved.calendarVersion:'';
    registrationReviewOffered=saved.registrationReviewOffered===true;
    routingTerritory=typeof saved.routingTerritory==='string'?saved.routingTerritory:undefined;
    selectedReferences=Array.isArray(saved.selectedReferences)?saved.selectedReferences.filter(x=>x&&typeof x.id==='string'&&typeof x.text==='string').slice(0,20):[];
    readMessageIds=new Set(Array.isArray(saved.readMessageIds)?saved.readMessageIds.filter(x=>typeof x==='string'):[]);
    pageScroll=saved.pageScroll&&typeof saved.pageScroll==='object'?saved.pageScroll:{};
    trainingLevel=['1','2','3'].includes(String(saved.trainingLevel))?String(saved.trainingLevel):'';
    trainingCaseId=typeof saved.trainingCaseId==='string'?saved.trainingCaseId:'';
    caseSearch=typeof saved.caseSearch==='string'?saved.caseSearch.slice(0,120):'';
  }
  restoreSaved(initial);
  const getToken = options.getIdToken || (backend?.getReceptionIdToken ? arg => backend.getReceptionIdToken(guest?{...arg,guestUid:options.guestUid}:arg) : null);
  const api = createReceptionAPI({endpoint:config.endpoint, getIdToken:getToken, demo:config.demo === true,
    fetch:options.fetch || globalThis.fetch, signal:lifetime.signal, timeoutMs:config.timeoutMs || 140000,buildId,context:gameplayContext,
    workbookVersion:config.workbookVersion??(config.decisionVersion==='legacy'&&config.demo?undefined:2),decisionVersion:config.decisionVersion??'correspondence-v1',
    controlVersion:config.controlVersion??'execution-v1',coreStepsVersion,seminarStoryVersion});
  const reader = createSourceReader(root, {signal:lifetime.signal, locale:() => locale,
    requireProvision:hasCore,
    presentation:'embedded', getContainer:()=>root.querySelector('[data-source-reader-host]'),
    beforeOpen:()=>{if(page!=='documents'||selectedDoc){selectedDoc='';goPage('documents');}},
    canSelect:()=>active()&&!paused&&!(busy&&operation==='decide')&&pending?.op!=='decide'&&(!hasCore()||!busy&&!pending&&coreInView()==='materials'),
    onSelect:reference=>{
      if(!active())return;
      if(hasCore()&&coreInView()==='materials'){
        const acts=view.case.normativeActs||[],index=acts.findIndex(act=>act.id===reference.docId);
        if(index<0)return false;
        let current=coreCitationsFor(reference.docId);
        if(acceptsTwoCoreCitations()&&reference.unitIds.length===1&&Object.values(complaintExamplePassages).includes(reference.unitIds[0])){
          // Older drafts can still contain a selected heading or another inapplicable paragraph.
          const article=complaintExampleArticle(reference.unitIds);
          const removed=current.filter(row=>{
            const priorArticle=row.quote.replace(/\s+/gu,' ').trim().length>=24&&complaintExampleArticle(row.unitIds);
            return !priorArticle||priorArticle===article&&!sameCoreReference(reference,row);
          });
          if(removed.length){
            current=current.filter(row=>!removed.includes(row));
            installCoreCitations(current,{replaceAll:true});
            selectedReferences=selectedReferences.filter(saved=>!removed.some(row=>sameCoreReference(saved,row)));
            if(coreIsEditable('materials'))coreCitationsEdited=true;
          }
        }
        const alreadySelected=current.find(item=>sameCoreReference(reference,item));
        if(!alreadySelected&&acceptsTwoCoreCitations()&&current.length>=2){
          reader.close();notice=cl('citationLimit');render();return;
        }
        const baseId=`core-legal-${index+1}`;
        const id=alreadySelected?.id||(acceptsTwoCoreCitations()&&current.some(item=>item.id===baseId)?baseId+'-2':baseId);
        const citation={id,section:'legalBasis',kind:'legal',sourceId:reference.docId,unitIds:reference.unitIds,quote:reference.text.trim()};
        if(!citation.quote||citation.quote.length>4000||!citation.unitIds?.length)return false;
        if(!alreadySelected){
          installCoreCitations([citation]);
          if(coreIsEditable('materials'))coreCitationsEdited=true;
        }
        selectedReferences=[reference,...selectedReferences.filter(item=>acceptsTwoCoreCitations()?item.id!==reference.id:item.docId!==reference.docId)].slice(0,20);
        if(error&&['core_citation_required','invalid_citation','core-citation-required','invalid-citation'].includes(error.code)&&
          corePayload('materials'))error=null;
        reader.close();notice=cl('sourceSaved');persist();render();
        [...root.querySelectorAll('[data-core-citation]')].find(node=>node.dataset.coreCitation===reference.docId)?.scrollIntoView({block:'nearest',behavior:'instant'});
        return;
      }
      selectedReferences=gameplayContext&&!correspondenceMode()?[reference]:[reference,...selectedReferences.filter(item=>item.id!==reference.id)].slice(0,20);
      if(correspondenceMode()){reader.close();applyReference(reference);goPage('decision');return;}
      notice=t(gameplayContext?'citationAdded':'referenceAdded');
      if(gameplayContext){detailOpen.add('assessment-legal-citation');reader.close();goPage('decision');}else if(view.case.workbook?.version>=2){reader.close();persist();goPage('documents');}else{applyReference(reference);goPage('decision');}
    }});
  calendar=createCalendarWorkbench(root,{state:calendarState,locale,signal:lifetime.signal,
    onChange:state=>{calendarState=state;if(active()&&view.case?.workbook){decisionDraft.workbook??=blankWorkbook();decisionDraft.workbook.referralDeadline=state.selectedDates?.referral||'';decisionDraft.deadline=state.selectedDates?.deadline||'';decisionDraft.workbook.registrationTimely=state.registrationTimely===true;confirmation=false;}persist();updateCoreButton();},
    onUseDate:(date,{target='deadline'}={})=>{if(!active())return;if(target==='referral'&&view.case?.workbook){decisionDraft.workbook??=blankWorkbook();decisionDraft.workbook.referralDeadline=date;}else decisionDraft.deadline=date;confirmation=false;notice=t('deadlineAdded');persist();render();}});

  const text = value => localized(value, locale);
  const authoredText = value => gameCopy(text(value), locale);
  // The assessment's material fragment describes the case; its other fragments can quote laws.
  const researchText = fragment => (fragment.id === 'material' ? authoredText : text)(fragment.text);
  const active = () => view?.status === 'active';
  const mentorAvailable = () => seminar && view?.journeyStage==='mentor' && ['active','followup'].includes(view.status);
  const inMentorChat = () => page==='chat' && chatDialog==='mentor' && mentorAvailable();
  const correspondenceMode = () => view?.decisionVersion==='correspondence-v1'||view?.case?.decisionVersion==='correspondence-v1';
  const canIndependent = () => {
    if(gameplayContext==='free'||options.context==='free')return false;
    if(config.demo===true||seminar&&backend?.user?.uid&&backend.isAdmin?.())return true;
    return !backend?.isAdmin?.()&&Boolean(backend?.getProfile?.()?.studentKey||options.studentKey)&&
      (typeof options.assessmentAllowed==='function'?options.assessmentAllowed():options.assessmentAllowed!==false);
  };
  const button = (label, action, {primary=false, quiet=false, disabled=false, extra='', glyph=''} = {}) =>
    `<button type="button" class="rxa-btn ${primary?'primary':''} ${quiet?'quiet':''}" data-action="${esc(action)}" ${disabled?'disabled':''} ${extra}>${glyph?icon(glyph):''}${esc(label)}</button>`;
  function captureChatScroll() {
    const log=root.querySelector('.rxa-messages');
    if(!view || !log?.clientHeight || log.dataset.caseId!==view.case?.id || root.dataset.sessionId!==view.id)return;
    const position={top:log.scrollTop,bottom:log.scrollHeight-log.scrollTop-log.clientHeight<50};
    if(log.hasAttribute('data-mentor-messages'))mentorChatScroll=position;else chatScroll=position;
  }
  function persist() {
    captureChatScroll();
    const content=root.querySelector('.rxa-page-content');
    if(content?.dataset.page===page&&!stageFocus)pageScroll[page]=content.scrollTop;
    storageOkay=drafts.save({version:VERSION,owner,seminarStoryVersion:view?.seminarStoryVersion||initial?.seminarStoryVersion||seminarStoryVersion,sessionId:view?.id||initial?.sessionId||'',caseId:view?.case?.id||savedCaseId,
      caseTitle:view?.case?.title||initial?.caseTitle||'',status:view?.status||initial?.status||'',
      mode:view?.mode||mode,locale,draftMessage,decisionDraft,followupDraft,controlDraft,executionActionDraft,controlWorkspaceUI,controlRecipientPicker,responsePreview,citationSelections,detailOpen:[...detailOpen],tab,selectedDoc,pending,pendingAt,mobilePane,chatScroll,
      page,calendarState,calendarVersion:calendarDraftVersion,registrationReviewOffered,routingTerritory:mfcJourney()?routingTerritory:undefined,selectedReferences,deferredDocuments:[...deferredDocuments],readMessageIds:[...readMessageIds],pageScroll,trainingLevel,trainingCaseId,caseSearch,mentorDraft,chatDialog,mentorReturnPage,mentorWelcomeSeen,mentorChatScroll,exampleDraftSeed,examplePreviewed,controlSampleOpened,controlMaterialSeen,coreEdit,coreCitationsEdited,choosingCase});
    return storageOkay;
  }
  function incomingMessages() {
    const messages=view?.messages||[];
    return messages.length?messages.filter(m=>m.role==='assistant'):view?.case?.opening?[{id:'opening'}]:[];
  }
  function unreadCount() {return incomingMessages().filter(m=>!readMessageIds.has(m.id)).length;}
  function markChatRead() {if(page==='chat'&&!inMentorChat()&&!document.hidden)for(const message of incomingMessages())readMessageIds.add(message.id);}
  function goPage(next,{dialog}={}) {
    if(!workspacePages.includes(next)||next!=='reception'&&!view)return;
    illustrationViewer.destroy();persist();
    if(next==='chat'&&mentorAvailable()){
      if(page!=='chat')mentorReturnPage=page;
      if(dialog==='mentor'&&mentorAvailable()){
        chatDialog='mentor';mentorWelcomeSeen=true;
      }else if(dialog==='citizen'||page!=='chat')chatDialog='citizen';
    }
    if(next!=='documents')reader.close();page=next;mobilePane=page==='chat'?'chat':'desk';confirmation=false;
    if(page==='decision')tab='decision';else if(page==='documents'&&tab==='decision')tab='documents';
    markChatRead();persist();render();
  }
  function installCoreCitations(citations,{replaceAll=false}={}) {
    const draft=restoreCorrespondence(decisionDraft.correspondence);
    const replaced=new Set(citations.map(citation=>citation.id));
    draft.citations=[...draft.citations.filter(item=>!replaced.has(item.id)&&(!replaceAll||!item.id.startsWith('core-legal-'))).slice(0,20-citations.length),...citations];
    decisionDraft.correspondence=draft;
    responsePreview=false;confirmation=false;
  }
  function applyReference(reference) {
    if(correspondenceMode()){
      const source={id:reference.docId,kind:'legal',title:reference.title,text:reference.text,quote:reference.text,unitIds:reference.unitIds,url:reference.url};
      decisionDraft.correspondence=reduceCorrespondence(decisionDraft.correspondence,{type:'source-add',section:'legalBasis',source});
      responsePreview=false;confirmation=false;detailOpen.add('response-sources-legalBasis');
      notice=t(reference.text.length<=4000?'responseAttached':'responseQuoteNeeded');persist();return;
    }
    const patch=referenceDecisionPatch(reference);
    // A new citation must not inherit an article or date from a different act.
    // Ambiguous fields remain empty for the student's own selection.
    decisionDraft.law={number:patch.law?.number||'',article:patch.law?.article||''};
    if(decisionDraft.assessment)decisionDraft.assessment.actDate=patch.actDate||'';
    detailOpen.add('assessment-law');confirmation=false;persist();
  }
  function resetMentorChat() {
    mentorDraft='';chatDialog='citizen';mentorReturnPage='reception';mentorWelcomeSeen=false;
    mentorChatScroll={top:0,bottom:true};
  }
  function clearSessionDraft() {
    exampleDraftSeed=null;
    coreEdit='';coreCitationsEdited=false;choosingCase=false;resetMentorChat();examplePreviewed=false;controlSampleOpened=false;sampleComparison=false;controlMaterialSeen='';controlMissing=false;
    responsePreview=false;controlDraft=restoreCorrespondenceControl();citationSelections={};recipientOrderId='';
    executionActionDraft=restoreControlActionDraft();controlWorkspaceUI=restoreControlWorkspaceUI();controlRecipientPicker=false;
    deferredDocuments.clear();failedOperation='';routingSearch='';routingTerritory=undefined;view=null;initial=null;pending=null;error=null;notice='';needsResume=false;draftMessage='';decisionDraft=blankDecision();followupDraft='';
    detailOpen.clear();savedCaseId='';savedSessionId='';selectedDoc='';confirmation=false;tab='documents';mobilePane='desk';page='reception';
    pendingAt=null;lastPendingRenderedId='';calendarState={};calendarDraftVersion='';registrationReviewOffered=false;selectedReferences=[];readMessageIds.clear();pageScroll={};drafts.clearCurrent();
    if(mode==='independent'&&!canIndependent())mode='training';
  }
  function rememberLegacySessions(recovered,stage) {
    for(const row of recovered.legacySessions||[])legacySessionIds.set(row.id,row);
    if(recovered.legacySessionId&&!legacySessionIds.has(recovered.legacySessionId))legacySessionIds.set(recovered.legacySessionId,{journeyStage:stage});
  }
  async function journeyRecovery() {
    const journeyStage=nextJourneyStage(seminarProgress);
    const mode=journeyStage==='independent'?'independent':'training';
    const parameters={studentKey:backend?.getProfile?.()?.studentKey||options.studentKey,mode,journeyStage};
    const recovered=await api.recover(parameters,{withProgress:true});
    if(recovered.seminarProgress)seminarProgress=recovered.seminarProgress;
    rememberLegacySessions(recovered,journeyStage);
    const currentStage=nextJourneyStage(seminarProgress);
    if(recovered.view||currentStage===journeyStage||currentStage==='independent'&&!canIndependent())return recovered.view;
    const current=await api.recover({...parameters,journeyStage:currentStage,mode:currentStage==='independent'?'independent':'training'},{withProgress:true});
    if(current.seminarProgress)seminarProgress=current.seminarProgress;
    rememberLegacySessions(current,currentStage);
    return current.view;
  }
  async function loadCatalog() {
    if(seminar||catalogLoading||disposed)return;
    catalogLoading=true;catalogError=false;render();
    try{catalog=await api.catalog({studentKey:backend?.getProfile?.()?.studentKey||options.studentKey,locale});}
    catch(problem){if(problem.code!=='cancelled')catalogError=true;}
    finally{catalogLoading=false;if(!disposed)render();}
  }
  async function recoverSession(chosen=null,{quiet=false}={}) {
    if(busy||pending||recoverBusy||disposed)return;
    recoverBusy=true;if(!quiet)notice=t('recovering');render();
    try{
      const modes=chosen?[chosen]:gameplayContext==='free'?['training']:['training','independent'];
      const results=await Promise.allSettled(seminar?[journeyRecovery(),...(!quiet&&!seminarStoryVersion?modes.map(mode=>api.recover({studentKey:backend?.getProfile?.()?.studentKey||options.studentKey,mode})):[])]:modes.map(mode=>api.recover({studentKey:backend?.getProfile?.()?.studentKey||options.studentKey,mode})));
      const candidates=results.filter(result=>result.status==='fulfilled'&&result.value).map(result=>result.value)
        .filter(candidate=>!buildId||candidate.context==='seminar'||candidate.buildId===buildId);
      const timestamp=value=>Number(value)||Date.parse(value)||0;
      const recovered=candidates.sort((a,b)=>timestamp(b.updatedAt||b.startedAt)-timestamp(a.updatedAt||a.startedAt))[0]||null;
      if(!recovered&&results.some(result=>result.status==='rejected'))throw results.find(result=>result.status==='rejected').reason;
      if(disposed||ownerNow()!==owner)return;
      if(recovered&&!choosingCase){persist();const saved=drafts.readSession(recovered.id);view=null;initial=null;if(saved)restoreSaved(saved);acceptView(recovered,{op:'recover'});error=null;notice='';needsResume=false;}
      else if(!quiet)notice=t('noSavedSession');
    }catch(problem){if(problem.code!=='cancelled'&&!quiet)notice=t('recoveryLimited');}
    finally{recoverBusy=false;if(!disposed){persist();render();}}
  }

  function errorText(problem) {
    const code = String(problem?.code || '').toLowerCase().replaceAll('_','-');
    if(/^(reviewer-unavailable|review-unavailable|review-invalid|review-unconfirmed)$/.test(code))return t('responseReviewUnavailable');
    if(code==='citation-source-unavailable')return t('responseSourceUnavailable');
    if(code==='invalid-citation')return hasCore()?cl('invalidCitation'):t('responseInvalidCitation');
    if(code==='control-context-limit')return t('executionContextLimit');
    if(code==='control-action-limit')return t('executionActionLimit');
    if(code==='invalid-control-version')return t('executionVersion');
    if(/^(invalid-control-state|invalid-control-workflow)$/.test(code))return t('responseReviewUnavailable');
    if(/^(invalid-correspondence|invalid-control|invalid-control-action|invalid-control-evidence|invalid-control-issue|invalid-recipient)$/.test(code))return t('responseInvalid');
    if(code==='context-limit')return t('responseTooLarge');
    if(code==='operation-in-progress')return t('operationInProgress');
    if(code==='guest-daily-limit')return t('guestDailyLimit');
    if(code==='guest-monthly-limit')return t('guestMonthlyLimit');
    if(code==='guest-busy')return t('guestBusy');
    if(code==='guest-unavailable')return t('guestUnavailable');
    if(code==='case-bank-exhausted')return t('caseBankExhausted');
    if(code==='tutorial-question-required')return l('askVisitorPrompt');
    if(/^(tutorial-step-locked|tutorial-locked|journey-stage-locked|journey-locked|stage-locked)$/.test(code))return l('locked');
    if(code==='core-citation-required')return cl('noCitation');
    if(code==='core-calendar-required')return cl('dateHint');
    if(code==='core-route-required')return cl('routeMissing');
    if(code==='core-draft-incomplete')return cl('draftIncomplete');
    if(code==='outdated-session')return t('retiredSession');
    if (/not-configured|unsafe-endpoint|pilot-incomplete/.test(code)) return t('config');
    if (/local-demo/.test(code)) return t('localOnly');
    if (/auth|token|identity|forbidden|permission|profile-required/.test(code)) return t('auth');
    if (/request-failed|request-interrupted|provider-unavailable|provider-invalid/.test(code)) return t('interrupted');
    if (/revision|conflict|stale|busy/.test(code)) return t('conflict');
    if (/budget|limit|quota/.test(code)) return t('budget');
    if (/timeout/.test(code)) return t('timeout');
    if (/network/.test(code)) return t('network');
    if (/not-found|unavailable|expired/.test(code)) return t('unavailable');
    if (code==='assessment-closed') return t('assessmentClosed');
    if (/closed|completed|locked|not-active/.test(code)) return t('locked');
    if (/invalid-response/.test(code)) return t('invalid');
    if (/input-long/.test(code)) return t('inputLong');
    if (/empty-message/.test(code)) return t('emptyMessage');
    if (/incomplete-decision/.test(code)) return t('incompleteDecision');
    if (/choose-followup/.test(code)) return t('chooseFollowup');
    return t('genericError');
  }
  function humanDate(value, style='long') {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return String(value||'');
    const date=new Date(value+'T12:00:00Z');
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(locale,{day:'numeric',month:style,year:'numeric',timeZone:'UTC'}).format(date):String(value);
  }
  function caseHeading(label, status='') {
    const number=String(Number(view?.caseIndex||0)+1).padStart(3,'0');
    const context=view?`${[authoredText(view.case?.title),t('caseNumber',{number}),status].filter(Boolean).join(' · ')}`:'';
    return `<div class="rxa-page-heading"><h1>${esc(label)}</h1>${context?`<p class="rxa-case-status">${esc(context)}</p>`:''}</div>`;
  }
  function header() {
    const hasSettings=config.demo||options.showLanguageSelector;
    const historyItem=seminar?button(l('historyTitle'),'open-history',{quiet:true,glyph:'actions'}):'';
    const settings=hasSettings?`<details class="rxa-cabinet-settings" data-details="cabinet-settings"><summary aria-label="${esc(t('settings'))}" title="${esc(t('settings'))}">${icon('menu')}</summary><div class="rxa-settings-panel"><label><span>${esc(t('language'))}</span><select class="rxa-locale" data-language data-focus="language" aria-label="${esc(t('language'))}">${[['ru','RU'],['en','EN'],['zh','中文']].map(([id,label])=>`<option value="${id}" ${locale===id?'selected':''}>${label}</option>`).join('')}</select></label>${historyItem}</div></details>`:'';
    return `<header class="rxa-top"><div class="rxa-brand"><span class="rxa-brand-mark">${icon('reception')}</span><div class="rxa-brand-copy"><strong>${esc(t('cabinet'))}</strong></div></div><div class="rxa-top-actions">${settings}${seminar&&!hasSettings?`<button type="button" class="rxa-btn quiet rxt-choose-case" data-action="open-history" aria-label="${esc(l('historyTitle'))}" title="${esc(l('historyTitle'))}">${icon('actions')}<span>${esc(l('historyTitle'))}</span></button>`:''}${seminar&&view&&!choosingCase?`<button type="button" class="rxa-btn quiet rxt-choose-case" data-action="choose-case" ${busy||pending?'disabled':''}>${icon('sources')}<span>${esc(cl('path'))}</span></button>`:''}${options.onExit?`<button class="rxa-back" type="button" data-action="exit" aria-label="${esc(t('back'))}" title="${esc(t('back'))}">${icon('exit')}</button>`:''}</div></header>`;
  }
  const atAction=(op)=>(
    op==='mentor-question'&&inMentorChat()||
    op==='start'&&(choosingCase||page==='reception'&&(!view||view.status!=='complete')||seminar&&view?.status==='complete')||
    op==='decide'&&page==='decision'&&active()&&correspondenceMode()||
    op==='followup'&&page==='decision'&&view?.status==='followup'&&correspondenceMode()||
    op==='control-action'&&page==='decision'&&view?.status==='followup'&&!!view.controlWorkflow||
    op==='next'&&page==='decision'&&view?.status==='review'&&correspondenceMode()
  );
  function actionStatus(op) {
    if(busy&&operation===op)return `<p class="rxa-operation-status" role="status" data-op-wait="${op}">${esc(t(op==='decide'||op==='followup'?'operationReview':'operationWait'))}</p>`;
    if(!busy&&(failedOperation===op&&error||pending?.op===op)){
      return `<div class="rxa-alert rxa-operation-status" role="alert"><p>${esc(error?errorText(error):t('pending'))}</p>${pending?button(t('retry'),'retry',{quiet:true}):needsResume?button(t('refresh'),'refresh',{quiet:true}):''}</div>`;
    }
    return '';
  }
  function alerts() {
    const lines = [];
    const code=String(error?.code||'').toLowerCase().replaceAll('_','-');
    const canResume=Boolean(view||initial?.sessionId)&&(needsResume||
      /^(network|timeout|invalid-response|server-error|operation-in-progress)$/.test(code));
    if ((error || pending && !busy)&&!atAction(pending?.op||failedOperation)) lines.push(`<section class="rxa-alert" role="alert">${icon('info')}<div><p>${esc(error?errorText(error):t('pending'))}</p><div class="rxa-actions">${pending?button(t('retry'),'retry',{disabled:busy}):canResume?button(t('refresh'),'refresh',{disabled:busy}):''}${error && !view && !pending?button(t('newSession'),'clear-session',{disabled:busy}):''}</div></div></section>`);
    if (!storageOkay) lines.push(`<div class="rxa-alert" role="status">${icon('info')}<p>${esc(t('storageError'))}</p></div>`);
    if(notice)lines.push(`<div class="rxa-notice" role="status">${icon('check')}<span>${esc(notice)}</span></div>`);
    return lines.join('');
  }
  function pathSetup() {
    const locked=busy||!!pending||recoverBusy;
    const savedIds=new Set(drafts.recent().map(item=>item.id));
    const legacy=[...legacySessionIds].filter(([id])=>id!==view?.id&&(seminarStoryVersion||!savedIds.has(id)));
    const resumes=legacy.map(([id,row])=>button((seminarStoryVersion?l('archiveCase'):row.completed?l('historicalResult'):coreLabel(locale,'legacyResume',true))+' · '+l(row.journeyStage),'resume-session',
      {quiet:true,disabled:locked,extra:`data-id="${esc(id)}"`})).join('');
    const history=resumes&&seminarStoryVersion?`<details class="rxa-help" data-details="archive"><summary>${esc(l('archive'))} · ${legacy.length}</summary>${resumes}</details>`:resumes;
    return `<div>${journeyPathView({locale,progress:seminarProgress,locked,canIndependent:canIndependent(),button,mfc:coreStepsVersion===MFC_VERSION})}
      ${!view||choosingCase?`<div class="rxt-recover">${history}${view?button(t('resumeSession'),'close-case-picker',{quiet:true,disabled:locked}):button(t('recoverSession'),'recover',{quiet:true,disabled:locked})}</div>`:''}
      ${choosingCase?savedSessions():''}<div class="rxa-actions">${button(l('historyTitle'),'open-history',{quiet:true,glyph:'actions'})}</div>${actionStatus('start')}</div>`;
  }
  function leaveCoreEdit() {
    if(!coreEdit)return;
    const values=view.coreSteps?.values;
    if(coreEdit==='calendar'&&values?.calendar){
      const {deadline,referralDeadline,registrationTimely}=values.calendar;
      calendarState={...calendarState,selectedDates:{deadline,referral:referralDeadline},registrationTimely};
      decisionDraft.deadline=deadline;Object.assign(decisionDraft.workbook,{referralDeadline,registrationTimely});
    }
    if(coreEdit==='route'&&values?.routing)decisionDraft.workbook.routing=clone(values.routing);
    coreEdit='';
  }
  function goCore(id) {
    if(!CORE_PAGES[id])return;
    if(id!==coreEdit)leaveCoreEdit();
    coreEdit=id!==coreCurrent()&&coreIsEditable(id)?id:'';
    if(id==='materials'){reader.close();selectedDoc='';tab='documents';}
    if(id==='route')responsePreview=false;
    pageScroll[CORE_PAGES[id]]=0;
    goPage(CORE_PAGES[id]);
    const heading=root.querySelector('[data-core-heading]')||root.querySelector('.rxa-page-heading h1');
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  }
  function coreJourney() {
    if(!hasCore()||choosingCase||view.status==='complete')return '';
    const current=coreCurrent(), activeId=coreInView()==='review'?'control':coreInView();
    const steps=['reception','materials','calendar','route','draft'];
    if(!replyOnly())steps.push('control');
    const doneUntil=current==='review'?steps.length:steps.indexOf(current);
    return `<nav class="rxt-case-steps" ${replyOnly()?'data-reply-only':''} aria-label="${esc(cl('journey'))}"><ol>${steps.map((id,index)=>{
      const visited=index<doneUntil, isHere=activeId===id;
      const label=esc(cl(id));
      const link=index===0||id===current||active()&&coreIsEditable(id);
      const content=`<span aria-hidden="true">${visited?icon('check'):index+1}</span><span>${label}</span>`;
      const attrs=`class="rxt-case-step ${visited?'is-complete':''}" ${isHere?'aria-current="step"':''}`;
      return `<li>${link?`<button type="button" ${attrs} data-action="core-go" data-step="${id}">${content}</button>`:`<span ${attrs}>${content}</span>`}</li>`;
    }).join('')}</ol></nav>`;
  }
  function coreCitationsFor(id) {
    return (decisionDraft.correspondence?.citations||[]).filter(row=>row.sourceId===id&&row.id.startsWith('core-legal-'));
  }
  function sameCoreCitations(selected,confirmed) {
    return selected.length===confirmed?.length&&selected.every(citation=>confirmed.some(row=>
      row.id===citation.id&&row.sourceId===citation.sourceId&&row.kind===citation.kind&&row.section===citation.section&&
      row.unitIds?.join(',')===citation.unitIds?.join(',')&&row.quote===citation.quote.trim()));
  }
  function sameCoreReference(reference,citation) {
    return reference.docId===citation.sourceId&&reference.unitIds?.join(',')===citation.unitIds?.join(',')&&reference.text?.trim()===citation.quote;
  }
  function removeCoreCitation(id) {
    const citation=decisionDraft.correspondence?.citations.find(row=>row.id===id&&row.id.startsWith('core-legal-'));
    if(!citation)return;
    decisionDraft.correspondence=reduceCorrespondence(decisionDraft.correspondence,{type:'source-remove',id});
    selectedReferences=selectedReferences.filter(reference=>!sameCoreReference(reference,citation));
    if(coreIsEditable('materials'))coreCitationsEdited=true;
    notice='';responsePreview=false;confirmation=false;
    persist();render();
    [...root.querySelectorAll('[data-normative-doc]')].find(node=>node.dataset.normativeDoc===citation.sourceId)?.focus({preventScroll:true});
  }
  function coreRecordsReady() {
    if(coreIsEditable('materials'))return true;
    const required=lessonStep(view)?.documentIds||[],opened=view.openedDocumentIds||[];
    return required.length?required.every(id=>opened.includes(id)):!(view.documents||[]).length||opened.length>0;
  }
  function corePayload(id) {
    if(id==='materials'){
      const acts=view.case.normativeActs||[];
      const groups=acts.map(act=>coreCitationsFor(act.id));
      return groups.every(group=>group.length)&&coreRecordsReady()?{citations:groups.flat()}:null;
    }
    if(id==='calendar'){
      const calendar=coreDatePayload(view.case.workbook,calendarState);
      return calendar?{calendar}:null;
    }
    if(id==='route'){
      const routing=decisionDraft.workbook?.routing;
      if(mfcJourney())return routing?.recipientIds.length?{routing:{...routing,disposition:'forward'}}:null;
      return routing&&(routing.disposition==='internal'||routing.disposition==='forward'&&routing.recipientIds.length)?{routing}:null;
    }
    return null;
  }
  function coreButton(id) {
    const label=cl(coreEdit===id?'update':'next'+id[0].toUpperCase()+id.slice(1));
    return button(label,'core-step',{primary:true,disabled:busy||!!pending||paused||!corePayload(id),
      extra:`data-step="${id}" data-tour-target="advance"`,glyph:'arrow'});
  }
  function updateCoreButton() {
    const control=root.querySelector('[data-action="core-step"]');
    if(control&&hasCore())control.disabled=busy||!!pending||paused||!corePayload(control.dataset.step);
    const check=root.querySelector('[data-action="registration-check"]');
    if(check)check.disabled=!registrationWritable()||typeof calendarState.registrationTimely!=='boolean';
  }
  function coreFeedback(id) {
    const finding=view.guidance?.finding;
    if(finding?.stepId!==id)return '';
    return `<p class="rxa-alert" role="status">${esc(text(finding.explanation)||l('tryAgain'))}</p>`;
  }
  function coreLessonHint(id) {
    const step=lessonStep(view);
    return view.journeyStage==='example'&&step?.id===id&&step.explanation?
      `<details class="rxt-step-hint"><summary>${esc(l('mentorHintLabel'))}</summary><p>${esc(text(step.explanation))}</p></details>`:'';
  }
  function trainingSetup() {
    if(seminar)return pathSetup();
    const filtered=catalog.filter(item=>(!trainingLevel||String(item.level)===trainingLevel)&&(!caseSearch||authoredText(item.title).toLocaleLowerCase(locale).includes(caseSearch.toLocaleLowerCase(locale))));
    const rows=filtered.map(item=>`<option value="${esc(item.id)}" ${trainingCaseId===item.id?'selected':''}>${esc(authoredText(item.title))}${item.level?` · ${esc(t('level'+item.level))}`:''}</option>`).join('');
    return `<section class="rxa-setup" aria-labelledby="rxaSetupTitle"><div class="rxa-section-heading"><span class="rxa-eyebrow">${esc(t('trainingCases'))}</span><h2 id="rxaSetupTitle">${esc(t('chooseFormat'))}</h2></div><fieldset class="rxa-mode-options"><legend class="rxa-sr">${esc(t('chooseFormat'))}</legend>${[['training',true],...(gameplayContext==='free'?[]:[['independent',canIndependent()]])].map(([id,enabled])=>`<label class="rxa-mode-choice ${mode===id?'selected':''} ${!enabled?'unavailable':''}"><input type="radio" name="mode" value="${id}" ${mode===id?'checked':''} ${!enabled?'disabled':''}><span><strong>${esc(t(id))}</strong><small>${esc(t(seminar?id+'SeminarHint':id+'Hint'))}</small></span>${icon(id==='training'?'sources':'decision')}</label>`).join('')}</fieldset>${gameplayContext!=='free'&&!canIndependent()?`<p class="rxa-availability">${esc(t('independentUnavailable'))}</p>`:''}${mode==='training'&&!seminar?`<div class="rxa-training-controls"><h3>${esc(t('trainingSetup'))}</h3><label class="rxa-field"><span>${esc(t('trainingLevel'))}</span><select name="trainingLevel" data-focus="training-level"><option value="">${esc(t('anyLevel'))}</option>${[1,2,3].map(level=>`<option value="${level}" ${trainingLevel===String(level)?'selected':''}>${esc(t('level'+level))}</option>`).join('')}</select></label><label class="rxa-field"><span>${esc(t('caseSearch'))}</span><input type="search" name="caseSearch" data-focus="case-search" value="${esc(caseSearch)}" placeholder="${esc(t('caseSearchHint'))}" maxlength="120" autocomplete="off"></label><label class="rxa-field full"><span>${esc(t('trainingCase'))}</span><select name="trainingCaseId" data-focus="training-case"><option value="">${esc(t('randomCase'))}</option>${rows}</select></label><p class="rxa-catalog-status" role="status">${esc(catalogLoading?t('catalogLoading'):catalogError?t('catalogUnavailable'):filtered.length?t('catalogCount',{count:filtered.length}):t('noCaseMatch'))}</p>${catalogError?button(t('catalogRetry'),'load-catalog',{quiet:true}):''}</div>`:''}<div class="rxa-start-row">${button(t(mode==='training'?'startTraining':'startIndependent'),'start',{primary:true,disabled:busy||!!pending||recoverBusy,glyph:'arrow'})}${button(t('recoverSession'),'recover',{quiet:true,disabled:busy||!!pending||recoverBusy})}</div>${actionStatus('start')}</section>`;
  }
  function help() {
    return `<details class="rxa-help" data-details="help"><summary>${icon('info')}<span>${esc(t('howToWork'))}</span>${icon('chevron')}</summary><div>${[['talk','helpChat'],['docs','helpDocuments'],['calendar','helpCalendar'],['decision','helpDecision']].map(([glyph,key])=>`<p>${icon(glyph)}<span>${esc(t(key))}</span></p>`).join('')}</div></details>`;
  }
  function scene(citizen,caseId) {
    const appearance=characterMedia(caseId,citizen?.portrait);
    return `<div class="rxa-foyer-scene"><div class="rxa-citizen-stage" data-rxa-actor="${esc(appearance.actorId)}" aria-label="${esc(text(citizen?.name)||t('citizen'))}"><img class="rxa-citizen-poster" src="${esc(appearance.poster)}" alt="${esc(text(citizen?.name)||t('citizen'))}"></div></div>`;
  }
  function savedSessions() {
    const rows=drafts.recent().filter(item=>!seminarStoryVersion||!legacySessionIds.has(item.id)).filter(item=>item.id!==view?.id&&(guest||item.status!=='complete'));
    return !rows.length?'':`<details class="rxa-help" data-details="saved-sessions"><summary>${icon('talk')}<span>${esc(t(guest?'guestSessions':'savedSessions'))}</span><span>${rows.length}</span></summary><div class="rxa-saved-sessions">${rows.map(item=>`<article><div><strong>${esc(authoredText(item.title))}</strong><small>${esc(t(item.mode==='independent'?'independent':'training'))}</small></div>${button(t(item.status==='complete'?'guestOpenResult':'resumeSession'),'resume-session',{disabled:busy||!!pending||recoverBusy,extra:`data-id="${esc(item.id)}"`})}</article>`).join('')}</div></details>`;
  }
  function landing() {
    return `<div class="rxa-foyer rxa-foyer-landing ${seminar?'rxt-journey-start':''}"><section class="rxa-welcome"><span class="rxa-eyebrow">${esc(t('welcome'))}</span><h1>${esc(t('hero'))}</h1><p>${esc(t('welcomeHint'))}</p>${guest?`<p class="rxa-guest-note">${esc(t('guestHistory'))}</p>`:''}</section><div class="rxa-foyer-grid">${scene(null,'')}${trainingSetup()}</div>${savedSessions()}${help()}</div>`;
  }
  function coreCaseRecords() {
    const reading=selectedDoc&&(view.documents||[]).some(doc=>doc.id===selectedDoc);
    const ready=coreRecordsReady();
    const working=active()&&coreCurrent()==='materials';
    const fromRoute=reading&&coreCurrent()==='route'&&selectedDoc===view.guidance?.routeDocumentId;
    return `<section class="rxa-document-group rxt-case-records" data-core-records>
      <h2 tabindex="-1">${esc(t('caseMaterials'))}</h2>
      ${working&&!ready?`<p>${esc(cl(tutorial()?'requireDocuments':'openRecord'))}</p>`:''}
      ${reading?`<div class="rxa-material-reader">${button(t('allDocuments'),'documents-list',{quiet:true,glyph:'arrow'})}${documents(true)}</div>`:documents()}
      ${active()?`<div class="rxt-core-footer">${fromRoute?
        button(l('backToRoute'),'core-go',{primary:true,glyph:'arrow',extra:'data-step="route"'}):
        button(cl('toSources'),'core-sources',{primary:ready,quiet:!ready,glyph:'arrow',extra:'data-tour-target="law"'})}</div>`:''}
    </section>`;
  }
  function scrollToCoreRecords() {
    if(page!=='reception')goPage('reception');
    const heading=root.querySelector('[data-core-records] h2');
    heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start',behavior:'instant'});
  }
  function reception() {
    const c=view.case||{}, mfc=mfcJourney();
    const firstMessage=(view.messages||[]).find(message=>message.role==='assistant'&&message.id===`opening-${c.id}`);
    const opening=authoredText(c.opening||firstMessage?.text);
    const roleContext=c.role?.authorityContext;
    const roleTitle=mfc?cl('roleTitle'):authoredText(c.role?.title);
    const roleText=mfc?cl('role'):authoredText(c.role?.text);
    const mfcIntro=mfc?`<section class="rxt-mfc-intro" aria-labelledby="rxtMfcRole">
      <h2 id="rxtMfcRole">${esc(roleTitle)}</h2><p>${esc(roleText)}</p></section>`:'';
    const question=guidedQuestion();
    const receptionAction=question&&!question.completed?
      button(l('askVisitor'),'page',{primary:true,glyph:'talk',extra:'data-page="chat" data-tour-target="visitor-chat"'}):
      hasCore()&&active()?button(cl(coreCurrent()==='reception'||coreCurrent()==='materials'?'read':'returnTo'),
      'core-opening',{primary:true,glyph:'arrow',extra:'data-tour-target="advance"'}):'';
    const request=opening?`<section class="rxt-opening" aria-labelledby="rxtOpeningTitle" data-tour-target="reception">
      <h2 id="rxtOpeningTitle">${esc(l('opening'))}</h2><blockquote>${esc(opening)}</blockquote>
      ${question&&!question.completed?'<p>'+esc(l('askVisitorPrompt'))+'</p>':''}${receptionAction||(!hasCore()&&tutorial()?button(l('goGuide'),'guide-jump',{quiet:true,glyph:'arrow'}):'')}</section>`:'';
    const portrait=scene(c.citizen,c.id);
    const withPortrait=mfc?`<div class="rxt-mfc-visitor">${portrait}${request}</div>`:portrait;
    const info=`<section class="rxa-active-reception">
      <h2 class="rxa-visitor-name">${esc(text(c.citizen?.name)||t('citizen'))}</h2>
      <p class="rxa-visitor-description">${esc(authoredText(c.citizen?.description)||t('applicant'))}</p>
      ${mfc?'':request}
      <p class="rxa-presence"><span aria-hidden="true"></span>${esc(t(active()?'awaitingReply':'decisionReady'))}</p>
      ${caseTimelineView(visibleWorkbook(c.workbook),{locale})}${routingOriginView(c.workbook,{locale})}
      <div class="rxa-actions">${!active()?button(t('continueDecision'),'continue',{primary:true,glyph:'arrow'}):''}
        ${hasCore()&&active()?'':button(t('caseMaterials'),'workspace',{quiet:true,extra:'data-panel="documents"',glyph:'docs'})}</div>
    </section>`;
    const caseRole=view.seminarStoryVersion?'':mfc?(roleContext?`<div><strong>${esc(text(roleContext.label))}</strong><p>${esc(text(roleContext.title))}</p>
      <p>${esc(text(roleContext.text))}</p></div>`:''):`<strong>${esc(roleTitle)}</strong><p>${esc(roleText)}</p>`;
    return `<div class="rxa-foyer">${caseHeading(t('reception'),t(active()?'caseActive':'decisionReady'))}${mentorWelcome()}
      <div class="rxa-foyer-grid rxt-active-reception${mfc?' rxt-mfc-reception':''}">${mfcIntro}${withPortrait}${info}</div>
      <details class="rxa-case-brief" data-details="case-brief"><summary>${icon('info')}<span>${esc(t('currentTask'))}</span>${icon('chevron')}</summary>
        <div class="rxa-case-brief-body"><h3>${esc(authoredText(c.title))}</h3>
        <div class="rxa-case-meta">${!seminar&&c.level?`<span>${esc(t('level'+c.level))}</span>`:''}
          ${c.estimatedMinutes?`<span>${esc(t('minutes',{count:c.estimatedMinutes}))}</span>`:''}</div>
        ${caseRole}<p class="rxa-persist-hint">${icon('cloud')}${esc(t('preservedSession'))}</p></div>
      </details>
      ${hasCore()?coreCaseRecords():currentGuide()}${help()}
      ${seminar?'':`<details class="rxa-exercise-picker" data-details="exercise-picker"><summary>${icon('sources')}<span>${esc(t('newTraining'))}</span>${icon('chevron')}</summary>${trainingSetup()}</details>`}
      ${savedSessions()}</div>`;
  }

  function messageTime(at) {
    if (at === null || at === undefined) return '';
    const date = new Date(at); if (!Number.isFinite(date.getTime())) return '';
    return `<time datetime="${date.toISOString()}" title="${esc(new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(date))}">${esc(new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hour12:false}).format(date))}</time>`;
  }
  function messageMarkup(message, pendingMessage=false) {
    const outgoing=message.role==='user', fresh=enteringMessages.has(message.id)||pendingMessage&&lastPendingRenderedId!==message.id;
    const status=pendingMessage?(busy?t('sendingMessage'):t('awaitingDelivery')):t('sent');
    const opening=message.role==='assistant'&&message.id===`opening-${view.case?.id}`;
    return `<article class="rxa-message ${outgoing?'user':'assistant'} ${fresh?'rxa-message-enter':''} ${pendingMessage?'rxa-message-pending':''}" data-message-id="${esc(message.id)}" ${pendingMessage?'data-pending-message':''}><span class="rxa-sr">${esc(outgoing?t('you'):text(view.case?.citizen?.name)||t('citizen'))}</span><div class="rxa-bubble"><p>${esc(opening ? authoredText(message.text) : text(message.text))}</p><footer class="rxa-message-meta">${messageTime(message.at)}${outgoing?`<span class="rxa-delivery" data-delivery-state="${pendingMessage?'pending':'sent'}" aria-label="${esc(status)}" title="${esc(status)}">${pendingMessage?`<span class="rxa-delivery-clock" aria-hidden="true"></span><span>${esc(status)}</span>`:icon('checks')}</span>`:''}</footer>${!outgoing&&!pendingMessage&&correspondenceMode()&&active()?`<button type="button" class="rxa-btn quiet rxc-chat-source" data-response-action="use-source" data-source-key="dialogue:${esc(message.id)}" ${busy||pending||paused?'disabled':''}>${esc(t('responseUse'))}</button>`:''}</div></article>`;
  }
  const mentorAvatar = () => resourceURL('../assets/gfx1/avatars/S02.webp',import.meta.url).href;
  const mentorPortrait = () => `<img class="rxa-avatar rxa-mentor-chat-avatar" src="${esc(mentorAvatar())}" alt="">`;
  function mentorWelcome() {
    if(!mentorAvailable()||mentorWelcomeSeen)return '';
    return `<section class="rxt-mentor-welcome" data-mentor-welcome aria-labelledby="rxaMentorWelcomeTitle">
      ${mentorPortrait()}<div><h2 id="rxaMentorWelcomeTitle">${esc(l('mentorPerson'))} · ${esc(l('mentorRole'))}</h2>
      <p>${esc(l('mentorWelcome'))}</p><div class="rxa-actions">
        ${button(l('mentorOpenChat'),'mentor-open-chat',{primary:true,glyph:'talk'})}
        ${button(l('mentorDismissWelcome'),'mentor-dismiss-welcome',{quiet:true})}
      </div></div></section>`;
  }
  function mentorMessage(message,{greeting=false,waiting=false}={}) {
    const outgoing=message.role==='user';
    const delivery=busy?t('sendingMessage'):t('awaitingDelivery');
    return `<article class="rxa-message ${outgoing?'user':'assistant'}${waiting?' rxa-message-pending':''}"
      data-mentor-message="${esc(message.id)}" ${greeting?'data-mentor-greeting':''} ${waiting?'data-mentor-pending':''}>
      <span class="rxa-sr">${esc(outgoing?l('you'):l('mentorPerson'))}</span><div class="rxa-bubble">
        <p>${esc(text(message.text))}</p>${message.at||waiting?`<footer class="rxa-message-meta">${messageTime(message.at)}${waiting?`<span class="rxa-delivery" data-delivery-state="pending">${esc(delivery)}</span>`:''}</footer>`:''}
      </div></article>`;
  }
  function mentorConversation(toolbar) {
    const messages=view.mentorMessages||[];
    const waiting=pending?.op==='mentor-question'&&pending.sessionId===view.id&&!messages.some(message=>message.id===`${pending.requestId}-user`);
    const thinking=busy&&operation==='mentor-question';
    const locked=busy||Boolean(pending)||paused||needsResume;
    const status=!thinking&&failedOperation==='mentor-question'&&error&&needsResume&&!pending&&mentorDraft.trim()
      ? `<div class="rxa-alert rxa-operation-status" role="alert"><p>${esc(errorText(error))}</p>${button(t('retry'),'mentor-retry-question',{quiet:true})}</div>`
      : thinking?'':actionStatus('mentor-question');
    return `<section class="rxa-conversation rxa-mentor-conversation" id="rxaMentorConversation" data-mentor-conversation aria-labelledby="rxaMentorDialog">
      ${toolbar}
      <div class="rxa-messages rxa-mentor-chat-log" data-mentor-messages data-case-id="${esc(view.case.id)}" role="log" aria-label="${esc(l('mentorRole'))}" aria-live="polite" aria-relevant="additions text">
        ${mentorMessage({id:'greeting',role:'assistant',text:l('mentorGreeting')},{greeting:true})}
        ${messages.map(message=>mentorMessage(message)).join('')}
        ${waiting?mentorMessage({id:`pending-${pending.requestId}`,role:'user',text:pending.text,at:pendingAt},{waiting:true}):''}
        ${thinking?`<div class="rxa-typing" role="status"><span class="rxa-dots" aria-hidden="true"><i></i><i></i><i></i></span><span data-op-wait="mentor-question">${esc(l('thinking'))}</span></div>`:''}
      </div>${status}
      <form class="rxa-compose rxa-mentor-chat-compose" data-mentor-form>
        <div class="rxa-composer-box"><label class="rxa-sr" for="rxaMentorQuestion">${esc(l('question'))}</label>
          <textarea id="rxaMentorQuestion" data-mentor-draft data-focus="mentor-question" maxlength="2000" rows="1" placeholder="${esc(l('questionExample'))}" ${paused?'disabled':''}>${esc(mentorDraft)}</textarea>
          <button class="rxa-send" type="submit" aria-label="${esc(l('send'))}" title="${esc(l('send'))}" ${locked?'disabled':''}>${icon('send')}</button>
        </div><div class="rxa-compose-actions"><small>${esc(t('enterHint'))}</small><small data-message-count aria-hidden="true"></small></div>
      </form></section>`;
  }
  function chatPortrait(appearance,{animated=true}={}) {
    return `<span class="rxa-avatar rxa-chat-portrait" ${animated?`data-rxa-chat-actor="${esc(appearance.actorId)}"`:''}><img class="rxa-citizen-poster" src="${esc(appearance.avatar)}" alt=""></span>`;
  }
  function chatMenu(c) {
    const label=esc(t('receptionInfo'));
    return `<details class="rxa-chat-menu" data-details="chat-menu">
      <summary aria-label="${label}" title="${label}">${icon('menu')}</summary>
      <div class="rxa-chat-menu-panel"><strong>${esc(authoredText(c.role?.title))}</strong><p>${esc(authoredText(c.role?.text))}</p>
      ${button(t('caseMaterials'),'workspace',{quiet:true,extra:'data-panel="documents"',glyph:'docs'})}</div>
    </details>`;
  }
  function chatWorkspace() {
    if(!mentorAvailable())return conversation();
    const c=view.case, citizen=c.citizen;
    const mentoring=inMentorChat();
    const appearance=characterMedia(c.id,citizen?.portrait);
    const dialog=(id,elementId,label,role,portrait)=>`<button type="button" class="rxa-btn quiet" id="${elementId}" data-action="chat-dialog"
      data-chat-dialog="${id}" data-focus="chat-dialog-${id}" aria-pressed="${chatDialog===id}" aria-label="${esc(label+' · '+role)}" title="${esc(label)}">
      ${portrait}<strong>${esc(label)}</strong><small>${esc(role)}</small></button>`;
    const returnLabel=esc(l('mentorReturnCase'));
    const toolbar=`<header class="rxa-chat-toolbar">
      <div class="rxa-chat-dialogs" data-chat-dialogs role="group" aria-label="${esc(l('chatDialogs'))}">
        ${dialog('citizen','rxaCitizenDialog',text(citizen?.name)||t('citizen'),t('citizen'),chatPortrait(appearance,{animated:!mentoring}))}
        ${dialog('mentor','rxaMentorDialog',l('mentorPerson'),l('mentorRole'),`<img src="${esc(mentorAvatar())}" alt="">`)}
      </div>
      ${mentoring?`<button type="button" class="rxa-btn quiet" data-action="mentor-return" aria-label="${returnLabel}" title="${returnLabel}">${icon('reception')}</button>`:chatMenu(c)}
    </header>`;
    return mentoring?mentorConversation(toolbar):conversation(toolbar);
  }
  function conversation(toolbar='') {
    const c=view.case||{}, citizen=c.citizen||{}, messages=Array.isArray(view.messages)?view.messages:[];
    const question=guidedQuestion(), locked=busy||!!pending||paused||needsResume;
    const questionActions=question?'<aside class="rxt-chat-workflow">'+(question.completed?
      button(l('nextStep'),'core-opening',{primary:true,disabled:locked,glyph:'arrow',extra:'data-tour-target="advance"'}):
      `<p>${esc(l(messages.length>1?'askVisitorAgain':'askVisitorPrompt'))}</p>${button(l('useSuggestedQuestion'),'example-question',{quiet:true,disabled:locked,glyph:'talk'})}`)+'</aside>':'';
    const opening=authoredText(c.opening);
    const items=!messages.length&&opening?[{id:'opening',role:'assistant',text:opening}]:messages;
    const waiting=pending?.op==='message'&&pending.sessionId===view.id&&!items.some(m=>m.id===`${pending.requestId}-user`);
    const typing=busy&&operation==='message', status=typing?t('typing'):error||needsResume?t('connectionPaused'):active()?t('available'):t('conversationClosed');
    const day=items[0]?.at?new Date(items[0].at):null;
    const dateLabel=day&&Number.isFinite(day.getTime())?t('chatDate',{date:new Intl.DateTimeFormat(locale,{day:'numeric',month:'long'}).format(day)}):t('conversation');
    const header = toolbar || `<header class="rxa-person"><div class="rxa-person-info"><div class="rxa-person-heading">
      ${chatPortrait(characterMedia(c.id,citizen.portrait))}<div><h2>${esc(text(citizen.name)||t('citizen'))}</h2>
      <p class="rxa-presence ${typing?'typing':''} ${error||needsResume?'paused':''}" aria-live="polite"><span aria-hidden="true"></span>${esc(status)}</p></div></div></div>
      ${chatMenu(c)}</header>`;
    // Illustrations belong to their named case documents, not to the opening message.
    const label = toolbar ? 'aria-labelledby="rxaCitizenDialog"' : `aria-label="${esc(t('chat'))}"`;
    return `<section class="rxa-conversation" id="rxaConversation" ${label}>${header}${seminar&&active()&&!tutorial()?`<aside class="rxt-chat-workflow"><p>${esc(l('chatPurpose'))}</p>${button(l('openDraft'),'page',{quiet:true,extra:'data-page="decision"',glyph:'decision'})}</aside>`:''}<div class="rxa-messages" data-case-id="${esc(c.id)}" role="log" aria-label="${esc(t('reviewChat'))}" aria-live="polite" aria-relevant="additions text"><div class="rxa-chat-date">${esc(dateLabel)}</div>${items.map(message=>messageMarkup(message)).join('')}${waiting?messageMarkup({id:`pending-${pending.requestId}`,role:'user',text:pending.text,at:pendingAt},true):''}${typing?`<div class="rxa-typing" data-typing role="status"><span class="rxa-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(t('typing'))}</span></div>`:''}</div>${questionActions}${active()&&(view.journeyStage!=='example'||question&&!question.completed)?`<form class="rxa-compose" data-chat-form><div class="rxa-composer-box"><label class="rxa-sr" for="rxaMessage">${esc(t('messageLabel'))}</label><textarea id="rxaMessage" data-message-draft data-focus="message" placeholder="${esc(t('messagePlaceholder'))}" maxlength="2000" rows="1" ${paused?'disabled':''}>${esc(draftMessage)}</textarea><button class="rxa-send" type="submit" aria-label="${esc(t('send'))}" title="${esc(t('send'))}" ${busy||pending||paused||needsResume?'disabled':''}>${icon('send')}</button></div><div class="rxa-compose-actions"><small>${esc(t('enterHint'))}</small><small data-message-count aria-hidden="true">${draftMessage.length?`${draftMessage.length} / 2000`:''}</small></div></form>`:active()?'':`<div class="rxa-fixed">${icon('check')}<span>${esc(t('fixed'))}</span></div>`}</section>`;
  }
  function documents(reading=false) {
    const docs=view.documents||[],opened=view.openedDocumentIds||[];
    const selected=docs.find(d=>d.id===selectedDoc);
    const suggested=hasCore()&&coreInView()==='materials'?(lessonStep(view)?.documentIds||[]).find(id=>!opened.includes(id)):null;
    if(!reading)return !docs.length?`<p class="rxa-empty">${esc(t('noDocuments'))}</p>`:`<div class="rxa-document-list">${docs.map(d=>`<button type="button" class="rxa-document-button" data-action="document" data-id="${esc(d.id)}" ${suggested===d.id?'data-tour-target="materials"':''} ${paused?'disabled':''}>${icon('docs')}<span><strong>${esc(authoredText(d.title))}</strong><small>${esc(opened.includes(d.id)?t('documentOpened'):t('openDocument'))}</small></span></button>`).join('')}</div>`;
    if(!selected)return '';
    const marked=opened.includes(selected.id);
    const markHint=!marked&&active()?`<p class="rxa-panel-intro">${esc(t('documentMarkPending'))}</p>${!busy&&!pending&&!needsResume?button(t('documentMark'),'document-mark',{quiet:true,extra:`data-id="${esc(selected.id)}"`}):''}`:'';
    const gallery=renderIllustrationThumbnails(caseIllustrations(view.case?.id,[selected]),{locale});
    const illustration=gallery?'':documentImage(selected.image),external=gameplayContext?'':safeURL(selected.url);
    return `<article class="rxa-document"><p class="rxa-doctype">${esc(authoredText(selected.type))}</p><h3>${esc(authoredText(selected.title))}</h3>${selected.sensitive?`<p class="rxa-document-sensitive">${icon('lock')}${esc(t('restrictedMaterial'))}</p>`:''}${gallery}${illustration?`<img class="rxa-document-image" src="${esc(illustration)}" alt="${esc(authoredText(selected.title))}" loading="lazy">`:''}<div class="rxa-document-body">${esc(authoredText(illustratedDocumentText(view.case?.id,selected,locale)))}</div>${external?`<div class="rxa-source-links">${sourceLinkView({url:external,locale,className:'rxa-btn'})}</div>`:''}${markHint}${correspondenceMode()&&active()?`<button type="button" class="rxa-btn" data-response-action="use-source" data-source-key="document:${esc(selected.id)}" ${!marked||busy||pending||paused?'disabled':''}>${icon('edit')}${esc(t('responseUse'))}</button>`:''}</article>`;
  }
  function sources() {
    if(gameplayContext)return normativeActsView(view.case?.normativeActs,{locale});
    const research=view.case?.assessment?.research;
    const records=research?`<section class="rxa-research-materials"><h3>${esc(t('researchMaterials'))}</h3><p class="rxa-panel-intro">${esc(authoredText(research.prompt))}</p>${(research.records||[]).map(record=>`<details class="rxa-source-record" data-details="source-${esc(record.id)}"><summary>${icon('sources')}<span>${esc(text(record.title))}</span></summary>${(record.fragments||[]).map(fragment=>`<article class="rxa-source-fragment" data-record="${esc(record.id)}" data-fragment="${esc(fragment.id)}"><h4>${esc(text(fragment.label))}</h4><div>${esc(researchText(fragment))}</div>${active()?button(t('selectFragment'),'research-fragment',{disabled:busy||!!pending||paused,extra:`data-record="${esc(record.id)}" data-fragment="${esc(fragment.id)}"`}):''}</article>`).join('')}${safeURL(record.url)?sourceLinkView({url:safeURL(record.url),locale,className:'rxa-btn'}):''}</details>`).join('')}</section>`:'';
    return `<section class="rxa-panel" aria-label="${esc(t('legalMaterials'))}">${(view.case?.sources || []).map(source=>{
      const url = safeURL(source.url); return `<article class="rxa-source"><h3>${esc(text(source.title))}</h3>${url?`<div class="rxa-source-links">${sourceLinkView({url,locale,className:'rxa-btn'})}</div>`:''}</article>`;
    }).join('')}${records}</section>`;
  }
  function optionsField(id, label, values, selected, checkbox=false) {
    const locked=!active()||paused||(busy&&operation==='decide')||pending?.op==='decide';
    return `<fieldset class="rxa-fieldset"><legend>${esc(label)}</legend>${(values || []).map(option=>`<label class="rxa-choice"><input type="${checkbox?'checkbox':'radio'}" data-decision="${id}" data-focus="${id}-${esc(option.id)}" name="rxa-${id}" value="${esc(option.id)}" ${checkbox?selected.includes(option.id)?'checked':'':selected===option.id?'checked':''} ${locked?'disabled':''}><span>${esc(authoredText(option.label??option.text??option.title))}</span></label>`).join('')}</fieldset>`;
  }
  function sectionHint(id) {
    if(id==='legal-citation')return selectedReferences[0]?.locator||t('detailsEmpty');
    const d=decisionDraft,a=d.assessment;
    if(id==='facts')return d.basisDocumentIds.length?t('factsSelected',{count:d.basisDocumentIds.length}):a?.factId?t('trapSelected'):t('detailsEmpty');
    if(id==='routing')return (view?.case?.procedureRequired===false||d.procedureId)&&(view?.case?.workbook?d.workbook?.routing.recipientIds.length:d.routeId)?t('routingSelected'):t('detailsEmpty');
    if(id==='actions')return d.actionIds.length?t('actionsSelected',{count:d.actionIds.length}):t('detailsEmpty');
    if(id==='law')return [d.law.number,d.law.article].filter(Boolean).join(' · ')||t('detailsEmpty');
    if(id==='research')return a?.research.recordId&&a?.research.fragmentId?t('researchSelected'):t('detailsEmpty');
    if(id==='trap')return a?.trapId?t('trapSelected'):t('detailsEmpty');
    if(id==='calendar')return authoredText(view?.case?.assessment?.calendar?.rules?.find(rule=>rule.id===a?.calendar.rule)?.label)||t('calendarRuleEmpty');
    return '';
  }
  function assessmentBlock(id,label,content) {
    const glyph={facts:'docs',routing:'arrow',actions:'actions',law:'sources',research:'search',trap:'info',calendar:'calendar'}[id]||'docs';
    return `<details class="rxa-assessment-block rxa-decision-row" data-details="assessment-${esc(id)}"><summary>${icon(glyph)}<span class="rxa-outline-label"><strong>${esc(label)}</strong><small data-outline-summary="${esc(id)}">${esc(sectionHint(id))}</small></span><span class="rxa-fold-arrow">${icon('chevron')}</span></summary><div class="rxa-assessment-content">${content}</div></details>`;
  }
  function orderedActions(c,d,locked) {
    const selected=d.actionIds.map(id=>c.actions.find(a=>a.id===id)).filter(Boolean);
    return `${optionsField('actionIds',t('actions'),c.actions,d.actionIds,true)}${selected.length?`<div class="rxa-order-heading"><h3>${esc(t('actionOrder'))}</h3><p class="rxa-panel-intro">${esc(t('actionOrderHint'))}</p></div><ol class="rxa-action-order" data-action-order>${selected.map((action,index)=>`<li><span><b>${index+1}.</b> ${esc(authoredText(action.label))}</span><div><button type="button" data-action="move-action" data-id="${esc(action.id)}" data-direction="up" data-focus="order-up-${esc(action.id)}" aria-label="${esc(t('moveUp',{action:authoredText(action.label)}))}" title="${esc(t('up'))}" ${locked||index===0?'disabled':''}>${icon('up')}</button><button type="button" data-action="move-action" data-id="${esc(action.id)}" data-direction="down" data-focus="order-down-${esc(action.id)}" aria-label="${esc(t('moveDown',{action:authoredText(action.label)}))}" title="${esc(t('down'))}" ${locked||index===selected.length-1?'disabled':''}>${icon('down')}</button></div></li>`).join('')}</ol>`:''}`;
  }
  function deadlineSummary() {
    if(view?.case?.workbook)return workbookSummaryView(decisionDraft,{locale,workbook:view.case.workbook});
    const deadline=decisionDraft.deadline;
    return `<section class="rxa-deadline-summary" data-deadline-summary aria-labelledby="rxaDeadlineSummary"><div>${icon('calendar')}<div><h3 id="rxaDeadlineSummary">${esc(t('deadline'))}</h3>${deadline?`<time datetime="${esc(deadline)}">${esc(humanDate(deadline))}</time>`:`<p>${esc(t('deadlineNotSelected'))}</p>`}</div></div>${button(t(deadline?'reviewCalendar':'openCalendar'),'page',{quiet:true,extra:'data-page="calendar"',glyph:'arrow'})}</section>`;
  }
  function calendarRulesMarkup() {
    if(view?.case?.workbook)return '';
    const a=view?.case?.assessment,d=decisionDraft;
    return a?assessmentBlock('calendar',t('calendarRuleSummary'),`${optionsField('assessment.calendar.anchor',t('calendarAnchor'),a.calendar.events,d.assessment.calendar.anchor)}${optionsField('assessment.calendar.rule',t('calendarRule'),a.calendar.rules,d.assessment.calendar.rule)}${optionsField('assessment.calendar.start',t('calendarStart'),a.calendar.starts,d.assessment.calendar.start)}${optionsField('assessment.calendar.shift',t('calendarShift'),a.calendar.lastDays,d.assessment.calendar.shift)}`):'';
  }
  function visibleWorkbook(workbook) {
    if(!workbook||!mfcJourney())return workbook;
    const currentChain=[MFC_CALENDAR_VERSION,MFC_CALENDAR_WITHOUT_REGISTRATION].includes(workbook.calendarVersion);
    const anchorIds=currentChain?['intakeReceived','intakeRegistered']:
      ['intakeReceived',...workbook.targets.map(target=>target.anchorId)];
    const anchors=new Set(anchorIds);
    const events=workbook.events.filter(event=>anchors.has(event.id));
    return {...workbook,events};
  }
  function calendarTask(){
    const workbook=visibleWorkbook(view?.case?.workbook);
    if(!workbook)return;
    const practice=registrationPractice();
    const showQuestion=workbook.registrationCheck&&(workbook.calendarVersion===MFC_CALENDAR_VERSION||practice);
    const question=showQuestion?{label:cl('registration'),yes:cl('yes'),no:cl('no')}:null;
    if(question&&practice){
      question.optional=true;
      question.disabled=!registrationWritable();
      question.footer=workbook.registrationPractice
        ?`<p class="rxa-small" role="status">${esc(cl('registrationSaved'))}</p>`
        :active()?`<div class="rxa-actions">${button(cl('saveRegistration'),'registration-check',
          {primary:true,disabled:!registrationWritable()||typeof calendarState.registrationTimely!=='boolean'})}
          ${button(cl('returnTo'),'core-go',{quiet:true,extra:`data-step="${esc(coreCurrent())}"`})}</div>`:'';
    }
    return {...workbook,hideEventList:!hasCore(),autoCommit:true,internalSources:Boolean(gameplayContext),
      ...(hasCore()?{registrationCheck:false}:{}),
      ...(mfcJourney()?{visibleInstructionsLabel:cl('dateRules')}:{}),
      registrationQuestion:question};
  }
  function coreCalendar() {
    const workbook=view.case.workbook, practice=registrationPractice();
    const editable=!practice&&active()&&coreInView()==='calendar';
    const locked=!editable||busy||!!pending||paused;
    const registration=!practice&&workbook.registrationCheck&&workbook.calendarVersion!==MFC_CALENDAR_VERSION?`<fieldset class="rxa-fieldset rxt-registration"><legend>${esc(cl('registration'))}</legend>
      ${[true,false].map(value=>`<label class="rxa-choice"><input type="radio" name="core-registration" data-core-registration value="${value}"
        ${calendarState.registrationTimely===value?'checked':''} ${locked?'disabled':''}><span>${esc(cl(value?'yes':'no'))}</span></label>`).join('')}</fieldset>`:'';
    return `<section class="rxa-panel" id="rxaCalendarPanel" aria-labelledby="rxaPage-calendar"><h1 data-core-heading>${esc(cl('calendar'))}</h1>
      ${practice?'':`<p class="rxa-panel-intro">${esc(cl('dateHint'))}</p>${coreLessonHint('calendar')}${coreFeedback('calendar')}`}
      ${calendarWorkbenchView({state:calendarState,task:calendarTask(),locale,disabled:locked})}${registration}
      ${editable?`<div class="rxa-calendar-footer rxt-core-footer">${coreButton('calendar')}</div>`:''}</section>`;
  }
  function calendarPage() {
    const c=view.case||{},a=c.assessment,d=decisionDraft;
    const locked=!active()||paused||(busy&&operation==='decide')||pending?.op==='decide';
    if(c.workbook&&hasCore())return coreCalendar();
    if(c.workbook)return `<section class="rxa-panel" id="rxaCalendarPanel" aria-labelledby="rxaPage-calendar">${caseHeading(t('calendar'))}${calendarWorkbenchView({state:calendarState,task:calendarTask(),locale,disabled:locked})}<div class="rxa-calendar-footer"><small class="rxa-save-note" data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small>${button(t('openDecision'),'page',{quiet:true,extra:'data-page="decision"',glyph:'arrow'})}</div></section>`;
    return `<section class="rxa-panel" id="rxaCalendarPanel" aria-labelledby="rxaPage-calendar">${caseHeading(t('calendar'),t('calendarTask'))}${!active()?`<p class="rxa-fixed">${icon('lock')}<span>${esc(t('calendarReadOnly'))}</span></p>`:''}${calendarWorkbenchView({state:calendarState,events:a?.calendar?.events||[],date:c.date,locale,disabled:locked,rulesMarkup:calendarRulesMarkup()})}<details class="rxa-calendar-task" data-details="calendar-task"><summary>${icon('info')}<span>${esc(t('calendarTask'))}</span>${icon('chevron')}</summary><div>${c.date?`<p class="rxa-calendar-case-date"><span>${esc(t('caseDate'))}</span><time datetime="${esc(c.date)}">${esc(humanDate(c.date))}</time></p>`:''}<p>${esc(authoredText(c.deadlinePrompt)||t('calendarHint'))}</p></div></details><details class="rxa-calendar-manual" data-details="calendar-manual"><summary>${icon('edit')}<span>${esc(t('calendarManual'))}</span>${icon('chevron')}</summary><fieldset class="rxa-fieldset rxa-calendar-deadline"><legend>${esc(t('calendarDraftDate'))}</legend><div class="rxa-fields"><label class="rxa-field"><span>${esc(t('deadline'))}</span><input type="date" data-decision="deadline" data-focus="deadline" value="${esc(d.deadline)}" autocomplete="off" ${locked?'disabled':''}></label></div></fieldset></details><div class="rxa-calendar-footer"><small class="rxa-save-note" data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small>${button(t('openDecision'),'page',{quiet:true,extra:'data-page="decision"',glyph:'arrow'})}</div></section>`;
  }
  function responseSources(row=null) {
    const feedback=row?.feedback||view?.feedback;
    const protocol=feedback?.correspondence;
    const canonical=(protocol?.initial?.citations||protocol?.citations||[]).map(source=>({...source,id:source.sourceId,text:source.quote}));
    const selected=row?[]:selectedReferences.map(reference=>({id:reference.docId,kind:'legal',title:reference.title,text:reference.text,quote:reference.text,unitIds:reference.unitIds,url:reference.url,locator:reference.locator}));
    const sources=[...(row?.correspondenceSources||view?.correspondenceSources||[]),...canonical,...selected];
    const seen=new Set();return sources.filter(source=>{const key=correspondenceSourceKey(source);if(!source.id||seen.has(key))return false;seen.add(key);return true;});
  }
  function responseRecipients(decision=decisionDraft) {
    const ids=new Set([...(decision.workbook?.routing?.recipientIds||[]),...(decision.correspondence?.orders||[]).flatMap(order=>order.recipientIds)]);
    return RECEPTION_AUTHORITIES.filter(row=>ids.has(row.id)||ids.has(row.careerId))
      .map(row=>({id:ids.has(row.id)?row.id:row.careerId,label:localizedAuthorityName(row,locale)}));
  }
  function executionRecipients(workflow=view?.controlWorkflow) {
    const ids=new Set([...(executionActionDraft.recipientIds||[]),
      ...(workflow?.plannedOrders||[]).flatMap(row=>row.recipientIds||[]),...(workflow?.journal||[]).flatMap(row=>row.recipientIds||[])]);
    return RECEPTION_AUTHORITIES.filter(row=>ids.has(row.id)||ids.has(row.careerId))
      .map(row=>({id:ids.has(row.id)?row.id:row.careerId,label:localizedAuthorityName(row,locale)}));
  }
  function executionRecord(row=null) {
    const workflow=row?.controlWorkflow||view?.controlWorkflow;
    if(!workflow)return '';
    return controlRecordView({workflow,control:row?.control||view?.control,caseInfo:row?.caseInfo||view?.case,
      sources:row?.correspondenceSources||view?.correspondenceSources,recipients:executionRecipients(workflow),locale});
  }
  function responseOptions(row=null) {
    const decision=row?.decision||decisionDraft;
    const student=backend?.user?.uid&&ownerNow()===owner?backend.getProfile?.():null;
    const caseInfo=row?.caseInfo||view?.case||{}, profile=row?.correspondenceProfile||view?.case?.correspondence||{};
    const mfc=row?caseInfo.workbook?.routingPolicy?.allowInternal===false:mfcJourney();
    const routing=decision.workbook?.routing;
    const issuer=mfc&&routing?.recipientIds.length===1?authoritySelectionLabel(routing,{locale}):'';
    return {draft:decision.correspondence,caseInfo,profile,fixedKind:currentDocumentKind(),showOrders:!replyOnly(),
      ...(mfc?{issuerLabel:issuer||coreLabel(locale,'draftIssuer',true),citizenReply:currentDocumentKind()!=='internal',
        sectionLabels:{resolution:coreLabel(locale,'draftResolution',true)},
        sectionHints:{resolution:coreLabel(locale,'draftResolutionHint',true),nextSteps:currentDocumentKind()==='internal'?l('internalNext'):coreLabel(locale,'draftNextStepsHint',true)} }:{}),
      sources:responseSources(row),recipients:responseRecipients(decision),specialistName:student?.fullName,locale,seminar,disabled:!active()||busy||!!pending||paused};
  }
  function responseRecord(row=null,index=null) {
    if(!(row?.decision||decisionDraft).correspondence)return '';
    return `<details class="rxa-assessment-block rxc-work-record" data-details="response-record-${index??'current'}"><summary>${esc(t('responseWork'))}</summary><div class="rxa-assessment-content" ${index===null?'':`data-response-result="${index}"`}>${correspondencePreviewView({...responseOptions(row),citationPrefix:`rxc-source-${index??'current'}`})}</div></details>`;
  }
  function responseProtocolMarkup(feedback) {
    const protocol=feedback?.correspondence;if(!protocol)return '';
    const phase=(item,label)=>`<section class="rxc-protocol-stage"><h3>${esc(label)} · ${esc(item.score)} / 100</h3>${item.cap?`<p class="rxa-alert">${esc(text(item.capExplanation)||t('responseCritical'))}</p>`:''}${(item.criteria||[]).filter(row=>row.reason).map(row=>`<article class="rxc-protocol-criterion"><h4>${esc(text(row.label))}</h4><p>${esc(row.reason)}</p>${(row.findings||[]).map(finding=>`${finding.quote?`<blockquote>${esc(finding.quote)}</blockquote>`:''}<p>${esc(finding.explanation)}</p>`).join('')}</article>`).join('')}${(item.criticalErrors||[]).map(error=>`<p class="rxa-alert">${esc(error.finding?.explanation||'')}</p>`).join('')}</section>`;
    return `<details class="rxa-assessment-block rxc-protocol" data-details="response-protocol"><summary>${esc(t('responseProtocol'))}</summary><div class="rxa-assessment-content">${protocol.phase==='complete'?`<p>${esc(t('responseTotal'))}</p>${phase(protocol.initial,t('responseInitial'))}${phase(protocol.control,t('responseControl'))}`:phase(protocol,t(protocol.phase==='control'?'responseControl':'responseInitial'))}</div></details>`;
  }
  function decisionOmissions(){
    const missing=[];
    const draft=decisionDraft.correspondence;
    if(view.case.workbook&&!decisionDraft.workbook?.routing.recipientIds.length)missing.push(['routing',t('responseGradedRouting')]);
    for(const target of calendarTask()?.targets||[]){
      if(!calendarState.selectedDates?.[target.id])missing.push(['date-'+target.id,text(target.label)]);
    }
    for(const section of ['facts','legalBasis','resolution','nextSteps']){
      if(!draft?.sections[section]?.trim())missing.push([section,t('omission_'+section)]);
    }
    if(!draft?.citations.some(citation=>citation.kind==='legal'))missing.push(['legal-source',t('omissionCitation')]);
    return missing;
  }
  function focusOmission(key){
    if(key==='date-referral'||key==='date-deadline'){
      goPage('calendar');
      root.querySelector(`[data-calendar-action="target"][data-target="${key.slice(5)}"]`)?.click();
      const target=root.querySelector(`[data-calendar-action="target"][data-target="${key.slice(5)}"]`);
      target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});
      return;
    }
    confirmation=false;responsePreview=false;recipientOrderId='';
    if(key==='routing')detailOpen.add('response-routing');
    if(key==='legal-source')detailOpen.add('response-sources-legalBasis');
    persist();render();
    const field=key==='routing'?root.querySelector('[data-routing-search]'):
      key==='legal-source'?root.querySelector('[data-response-source="legalBasis"]'):
      [...root.querySelectorAll('[data-response-field]')].find(node=>node.dataset.responseField==='sections.'+key);
    if(key==='legal-source'&&!field){reader.close();selectedDoc='';tab='sources';goPage('documents');return;}
    field?.closest('details')?.setAttribute('open','');
    field?.scrollIntoView({block:'center'});field?.focus({preventScroll:true});
  }
  function coreRouteRecord() {
    const routing=view.coreSteps?.values?.routing||decisionDraft.workbook?.routing;
    const label=routing?.disposition==='internal'?cl('internal'):authoritySelectionLabel(routing,{locale});
    return `<section class="rxa-panel"><h1 data-core-heading>${esc(cl('route'))}</h1>
      <p>${esc(label||cl('blocked'))}</p>${button(cl('returnTo'),'core-go',{quiet:true,extra:`data-step="${esc(coreCurrent())}"`,glyph:'arrow'})}</section>`;
  }
  function coreRouting() {
    const routing=decisionDraft.workbook.routing;
    const locked=busy||!!pending||paused;
    const workbook=view.case.workbook, policy=workbook.routingPolicy;
    const territoryId=routingTerritory??(mfcJourney()?(workbook.site?.territoryId||''):'ru-77');
    const routeDocument=(view.documents||[]).find(doc=>doc.id===view.guidance?.routeDocumentId);
    const sourceHint=routeDocument?`<aside class="rxt-step-hint"><p>${esc(l('routeDocumentPrompt'))}</p>
      ${button(t('openDocument')+' · '+authoredText(routeDocument.title),'document',{quiet:true,glyph:'docs',disabled:locked,
        extra:`data-id="${esc(routeDocument.id)}" ${view.openedDocumentIds?.includes(routeDocument.id)?'':'data-tour-target="route-document"'}`})}</aside>`:'';
    const routeNotes=mfcJourney()?[policy?.context,policy?.boundary].map(text).filter(Boolean):[];
    return `<section class="rxa-panel rxt-route-choice" aria-labelledby="rxtRouteHeading">
      <h1 id="rxtRouteHeading" data-core-heading>${esc(cl('route'))}</h1>
      <p class="rxa-panel-intro">${esc(cl('routeHint'))}</p>${routingOriginView(workbook,{locale})}
      ${routeNotes.map(note=>`<p class="rxt-route-note">${esc(note)}</p>`).join('')}
      ${sourceHint||coreLessonHint('route')}${coreFeedback('route')}
      ${mfcJourney()?'':`<fieldset class="rxa-fieldset" data-tour-target="routing">
        <legend class="rxa-sr">${esc(cl('route'))}</legend>
        ${['internal','forward'].map(value=>`<label class="rxa-choice"><input type="radio" name="core-disposition" data-core-disposition
          data-focus="core-route-${value}" value="${value}" ${routing.disposition===value?'checked':''} ${locked?'disabled':''}><span>${esc(cl(value))}</span></label>`).join('')}
      </fieldset>`}
      ${mfcJourney()||routing.disposition==='forward'?authorityPickerView(routing,{locale,workflow:workbook,search:routingSearch,territoryId,disabled:locked}):''}
      <div class="rxt-core-footer">${coreButton('route')}</div>
    </section>`;
  }
  function coreDecision() {
    const step=coreInView();
    if(step!=='draft')return `<section class="rxa-panel"><h1 data-core-heading>${esc(cl('draft'))}</h1>
      <p>${esc(cl('blocked'))}</p>${button(cl('returnTo'),'core-go',{primary:true,extra:`data-step="${esc(coreCurrent())}"`,glyph:'arrow'})}</section>`;
    const locked=busy||!!pending||paused;
    const mentorDraft=mentorWork('draft');
    const model=mentorDraft&&lessonAnswer();
    const commonReply=mfcJourney() && (view.case.workbook.sharedReply ?? (view.case.workbook.recipientLimit > 1));
    const internal=currentDocumentKind()==='internal';
    const filled=view.journeyStage==='example'&&!!exampleDraftSeed;
    const submitLabel=filled?'confirmExample':view.journeyStage==='mentor'&&replyOnly()?'submitPractice':mentorDraft?'checkOwnDraft':'submitProject';
    return `<section class="rxa-panel rxc-workspace"><h1 data-core-heading>${esc(internal?l('internalTitle'):cl('draft'))}</h1>
      <p class="rxa-panel-intro">${esc(filled?l('filledDraftHint'):internal?l('internalNext'):cl('draftHint'))}</p>
      <p class="rxa-draft-status">${icon('cloud')}<span data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</span></p>
      ${coreFeedback('draft')}${mentorWorkFeedbackView(view,locale)}
      ${mentorDraft&&!filled?`<p class="rxa-panel-intro">${esc(cl('evidence'))}</p>`:''}
      <div class="rxa-actions rxt-draft-links">${button(cl('toSources'),'core-sources',{quiet:true,glyph:'sources'})}
        ${model&&!filled?button(l('compare'),'tutorial-sample',{quiet:true}):''}</div>
      ${sampleComparison?tutorialComparison():''}
      <form id="rxaDecisionForm" data-decision-form>
        ${responsePreview?correspondencePreviewView(responseOptions()):correspondenceEditorView({...responseOptions(),guidedCore:true,showOrders:!currentDocumentKind()&&!commonReply})}
        <div class="rxa-decision-footer"><button class="rxa-btn primary" type="submit" data-tour-target="draft-submit" ${locked?'disabled':''}>
          ${icon('decision')}${esc(l(submitLabel))}</button></div>
        ${busy&&pending?.stepId==='materials'?`<p class="rxa-operation-status" role="status">${esc(cl('savingCitations'))}</p>`:''}
        ${actionStatus('decide')}
      </form>
    </section>`;
  }
  function correspondenceDecision() {
    const c=view.case||{},locked=busy||!!pending||paused,profile=c.correspondence||{};
    const order=decisionDraft.correspondence?.orders.find(row=>row.id===recipientOrderId);
    if(order)return `<section class="rxa-panel"><h2>${esc(t('responseAssignmentRecipient'))}</h2><p class="rxa-panel-intro">${esc(t('responseOrderRecipientHint'))}</p>${authorityPickerView({recipientIds:order.recipientIds},{locale,workflow:{recipientLimit:2},search:routingSearch,territoryId:routingTerritory,disabled:locked})}<button class="rxa-btn primary" type="button" data-response-action="recipient-done">${esc(t('responseAssignmentDone'))}</button></section>`;
    if(hasCore())return coreDecision();
    const omissions=confirmation?decisionOmissions():[];
    const submitLabel=seminar?l('submitProject'):t('responseSubmit');
    const submitFooter=mentorWork('draft')?`<div class="rxa-decision-footer"><button class="rxa-btn primary" type="submit"
      ${locked?'disabled':''}>${icon('check')}${esc(l('checkOwnDraft'))}</button></div>`:tutorial()?'':`<div class="rxa-decision-footer"><small>${esc(t(view.mode==='training'?'afterSubmitTraining':seminar?'afterSubmitSeminar':'afterSubmitIndependent'))}</small><button class="rxa-btn primary" type="submit" ${locked?'disabled':''}>${icon('decision')}${esc(submitLabel)}</button></div>`;
    const checklist=omissions.length?`<div class="rxa-omissions"><p>${esc(t('omissionIntro'))}</p><ul>${omissions.map(([id,label])=>`<li>${button(label,'focus-omission',{quiet:true,extra:`data-section="${id}"`})}</li>`).join('')}</ul></div>`:'';
    return `<section class="rxa-panel rxc-workspace" id="rxaPanel" aria-labelledby="rxaPage-decision">${caseHeading(t('responseTitle'),t('draftStatus'))}<p class="rxa-panel-intro">${esc(profile.task||t('responseTask'))}</p><p class="rxa-draft-status">${icon('cloud')}<span data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</span></p>${seminar?`<aside class="rxt-draft-tools"><p>${esc(l('citationGuide'))}</p>
      <div class="rxa-actions">${button(t('legalMaterials'),'workspace',{quiet:true,extra:'data-panel="sources"',glyph:'docs'})}
      ${tutorial()?'':`<button class="rxa-btn primary" type="submit" form="rxaDecisionForm" ${locked?'disabled':''}>${icon('decision')}${esc(submitLabel)}</button>`}</div></aside>`:''}<form id="rxaDecisionForm" data-decision-form><section class="rxc-assessed-routing"><h2>${esc(t('responseGradedRouting'))}</h2><p class="rxa-panel-intro">${esc(t('responseGradedRoutingHint'))}</p><details class="rxa-assessment-block" data-details="response-routing"><summary>${esc(t('responseRouting'))}${decisionDraft.workbook?.routing?.recipientIds.length?` · ${esc(authoritySelectionLabel(decisionDraft.workbook.routing,{locale}))}`:''}</summary><div class="rxa-assessment-content">${authorityPickerView(decisionDraft.workbook?.routing,{locale,workflow:c.workbook,search:routingSearch,territoryId:routingTerritory,disabled:locked})}</div></details></section>${deadlineSummary()}${responsePreview?correspondencePreviewView(responseOptions()):correspondenceEditorView(responseOptions())}${submitFooter}${!confirmation?actionStatus('decide'):''}</form>${confirmation?`<section class="rxa-confirm" role="region" aria-labelledby="rxaConfirmTitle"><h3 id="rxaConfirmTitle" tabindex="-1">${esc(t('responseConfirm'))}</h3><p>${esc(t('responseConfirmText'))}</p>${checklist}<div class="rxa-actions">${button(t(omissions.length?'submitIncomplete':'responseConfirm'),'confirm-decision',{primary:true,disabled:locked})}${button(t('cancel'),'cancel-confirm',{disabled:locked})}</div>${actionStatus('decide')}</section>`:''}</section>`;
  }
  function correspondenceFollowup() {
    const locked=busy||!!pending||paused;
    if(view.controlWorkflow){
      if(controlRecipientPicker)return `<section class="rxa-panel"><h2>${esc(t('responseAssignmentRecipient'))}</h2><p class="rxa-panel-intro">${esc(t('responseOrderRecipientHint'))}</p>${authorityPickerView({recipientIds:executionActionDraft.recipientIds},{locale,workflow:{recipientLimit:2},search:routingSearch,territoryId:routingTerritory,disabled:locked})}${button(t('responseAssignmentDone'),'control-recipient-done',{primary:true})}</section>`;
      const findings=(view.controlValidation?.findings||[]).map(row=>`<p>${esc(text(row.message))}</p>`).join('');
      return `<section class="rxa-panel rxa-followup rxe-host"><h2 tabindex="-1" data-stage-heading>${esc(t('responseControl'))}</h2>${findings?`<div class="rxa-alert" role="alert" data-control-validation>${findings}</div>`:''}${seminar?controlNavigation():''}<form data-followup-form>${controlWorkspaceView({workflow:view.controlWorkflow,draft:controlDraft,actionDraft:executionActionDraft,ui:controlWorkspaceUI,caseInfo:view.case,sources:view.correspondenceSources,recipients:executionRecipients(),locale,disabled:locked,showMissing:controlMissing,memoHint:mfcJourney()?cl('controlTextHint'):undefined})}<small data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small>${actionStatus('control-action')}${actionStatus('followup')}</form>${responseRecord()}</section>`;
    }
    return `<section class="rxa-panel rxa-followup"><h2 tabindex="-1" data-stage-heading>${esc(t('responseControl'))}</h2><form data-followup-form>${correspondenceControlView({draft:controlDraft,correspondence:decisionDraft.correspondence,issues:view.followup?.issues||view.case.correspondence?.issues,profile:view.case.correspondence,intro:view.followup?.intro,sources:(view.correspondenceSources||[]).filter(source=>source.kind!=='legal'),locale,disabled:locked})}<div class="rxa-decision-footer"><small data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small><button class="rxa-btn primary" type="submit" ${locked?'disabled':''}>${icon('check')}${esc(t('followupSubmit'))}</button></div>${actionStatus('followup')}</form>${responseRecord()}</section>`;
  }
  function controlNavigation() {
    const inMemo=controlWorkspaceUI.pane==='memorandum';
    return `<aside class="rxt-control-navigation"><p>${esc(mfcJourney()?cl('controlHint'):l('controlHint'))}</p><div class="rxa-actions">
      ${inMemo?'':button(l('controlMaterials'),'control-jump',{quiet:true,extra:'data-section="materials"'})}
      ${inMemo?'':button(l('controlActions'),'control-jump',{quiet:true,extra:'data-section="actions"'})}
      ${inMemo?button(l('controlMemo'),'control-jump',{quiet:true,extra:'data-section="memorandum"'}):
        `<button class="rxa-btn quiet" type="button" data-control-action="prepare-memorandum">${esc(l('controlMemo'))}</button>`}
      </div></aside>`;
  }
  function lessonControlFields({readOnly=false, showEvent=true}={}) {
    const profile=view.case?.correspondence;
    return correspondenceControlView({draft:readOnly?view.control||view.guidance?.control:controlDraft,
      correspondence:decisionDraft.correspondence,issues:view.followup?.issues||profile?.issues,
      intro:showEvent?view.followup?.intro:'',sources:responseSources().filter(source=>source.kind!=='legal'),
      locale,disabled:readOnly||busy||!!pending||paused});
  }
  function lessonControlRecord() {
    if(!view.control&&!view.guidance?.control)return '';
    const record=view.controlWorkflow?executionRecord():lessonControlFields({readOnly:true,showEvent:false});
    return `<details class="rxa-assessment-block rxt-example-control" data-details="practice-control-record">
      <summary>${esc(t('responseControl'))}</summary><div class="rxa-assessment-content">${record}</div></details>`;
  }
  function lessonControl() {
    const workflow=view.controlWorkflow, kinds=mentorActions(), locked=busy||!!pending||paused;
    if(kinds&&controlRecipientPicker)return `<section class="rxa-panel"><h2>${esc(t('responseAssignmentRecipient'))}</h2>
      <p class="rxa-panel-intro">${esc(t('responseOrderRecipientHint'))}</p>
      ${authorityPickerView({recipientIds:executionActionDraft.recipientIds},{locale,workflow:{recipientLimit:2},search:routingSearch,territoryId:routingTerritory,disabled:locked})}
      ${button(t('responseAssignmentDone'),'control-recipient-done',{primary:true})}</section>`;
    const canWrite=kinds&&controlWorkspaceUI.pane!=='memorandum'||mentorWork('control-memo')&&(!workflow||controlWorkspaceUI.pane==='memorandum');
    const content=workflow?controlWorkspaceView({workflow,draft:controlDraft,actionDraft:executionActionDraft,
      ui:{...controlWorkspaceUI,journalAll:true},caseInfo:view.case,sources:view.correspondenceSources,
      recipients:executionRecipients(),locale,disabled:!canWrite||locked,showMissing:controlMissing,actionKinds:kinds,
      submitLabel:l('checkOwnControl'),memoHint:mfcJourney()?cl('controlTextHint'):undefined}):lessonControlFields({readOnly:!canWrite});
    return `<section class="rxa-panel rxa-followup rxe-host rxt-control">
      <h2 tabindex="-1" data-stage-heading>${esc(t('responseControl'))}</h2>
      ${mfcJourney()?`<p class="rxa-panel-intro">${esc(cl('controlHint'))}</p>`:''}
      <form data-followup-form>${content}${actionStatus('control-action')}${canWrite&&!workflow?`<button class="rxa-btn primary" type="submit">${esc(l('checkOwnControl'))}</button>`:''}</form>
      ${responseRecord()}</section>`;
  }
  function finishReview() {
    const next=Number(view.caseIndex)+1<Number(view.caseCount);
    return button(!next&&view.journeyStage==='independent'?l('getGrade'):t(next?'next':'finish'),'next',
      {primary:true,disabled:busy||!!pending,glyph:'arrow'});
  }
  function lessonReview() {
    return `<section class="rxa-panel rxa-review"><div class="rxa-review-icon">${icon('check')}</div>
      <h2 tabindex="-1" data-stage-heading>${esc(t('reviewTitle'))}</h2>
      ${mentorWorkFeedbackView(view,locale)}${responseRecord()}${lessonControlRecord()}
      <div class="rxa-review-footer">${button(l(view.journeyStage==='example'?'finishExample':'finishMentor'),'next',
        {primary:true,disabled:busy||!!pending,glyph:'arrow'})}</div>${actionStatus('next')}</section>`;
  }
  function correspondenceReview() {
    if(tutorial())return lessonReview();
    const showGrade=view.journeyStage==='independent'&&Number(view.caseIndex)+1>=Number(view.caseCount);
    return `<section class="rxa-panel rxa-review"><div class="rxa-review-icon">${icon('check')}</div><h2 tabindex="-1" data-stage-heading>${esc(t(view.feedback?'reviewTitle':'fixed'))}</h2>${showGrade?`<p class="rxa-panel-intro">${esc(l('finishCaseHint'))}</p><div class="rxa-actions">${finishReview()}</div>`:
      view.feedback?feedbackMarkup(view.feedback):`<p class="rxa-panel-intro">${esc(t('responseNoFeedback'))}</p>`}${responseRecord()}${view.control?`<details class="rxa-assessment-block" data-details="response-control-record"><summary>${esc(t('responseControl'))}</summary><div class="rxa-assessment-content">${view.controlWorkflow?executionRecord():correspondenceControlView({draft:view.control,issues:view.case.correspondence?.issues,sources:view.correspondenceSources,locale,disabled:true})}</div></details>`:''}${showGrade?'':`<div class="rxa-review-footer">${finishReview()}</div>`}${actionStatus('next')}</section>`;
  }
  function decision() {
    if(correspondenceMode())return correspondenceDecision();
    const c=view.case||{},d=decisionDraft,readable=(view.documents||[]).filter(doc=>(view.openedDocumentIds||[]).includes(doc.id));
    const locked=paused||(busy&&operation==='decide')||pending?.op==='decide';
    const field=(name,label,value,type='text',max='80')=>`<label class="rxa-field"><span>${esc(label)}</span><input type="${type}" data-decision="${name}" data-focus="${name}" value="${esc(value)}" maxlength="${max}" autocomplete="off" ${locked?'disabled':''}></label>`;
    const select=(name,label,values,value)=>`<label class="rxa-field full"><span>${esc(label)}</span><select data-decision="${esc(name)}" data-focus="${esc(name)}" ${locked?'disabled':''}><option value="">${esc(t('decisionEmpty'))}</option>${values.map(v=>`<option value="${esc(v.id)}" ${v.id===value?'selected':''}>${esc(authoredText(v.label??v.title))}</option>`).join('')}</select></label>`;
    const a=c.assessment,answer=d.assessment;
    const basis=`${optionsField('basisDocumentIds',t('basis'),readable.map(doc=>({id:doc.id,label:doc.title})),d.basisDocumentIds,true)}<p class="rxa-small rxa-muted">${esc(readable.length?t(a?'basisExactHint':'basisHint'):t('noReadDocuments'))}</p>${button(t('caseMaterials'),'workspace',{quiet:true,extra:'data-panel="documents"',glyph:'docs'})}`;
    const routing=(c.procedureRequired===false?'':optionsField('procedureId',t('procedure'),c.procedures,d.procedureId))+(c.workbook?authorityPickerView(d.workbook?.routing,{locale,workflow:c.workbook,search:routingSearch,territoryId:routingTerritory,disabled:locked}):optionsField('routeId',t('route'),c.routes,d.routeId));
    const citations=selectedReferences.length?selectedReferences.map(reference=>`<div>${referenceView(reference,{locale,removable:!locked})}${button(t('useReference'),'use-reference',{quiet:true,disabled:locked,extra:`data-id="${esc(reference.id)}"`})}</div>`).join(''):`<p class="rxa-panel-intro">${esc(t('noReferences'))}</p>`;
    const references=`<section class="rxa-references">${citations}${button(t('chooseReferences'),'workspace',{quiet:true,extra:'data-panel="sources"',glyph:'sources'})}</section>`;
    const lawFields=`${a?`<p class="rxa-panel-intro">${esc(authoredText(a.knowledge.prompt))}</p>`:''}<div class="rxa-fields">${field('law.number',authoredText(a?.knowledge.numberLabel)||t('lawNumber'),d.law.number)}${a?field('assessment.actDate',authoredText(a.knowledge.dateLabel)||t('actDate'),answer.actDate,'date'):''}${field('law.article',authoredText(a?.knowledge.unitLabel)||t('lawArticle'),d.law.article)}</div>${a?optionsField('assessment.applicationId',t('applyLaw'),a.knowledge.options,answer.applicationId):''}`;
    const lawRecord=d.law.number||d.law.article?`<div class="rxa-law-record">${icon('docs')}<div><strong>${esc([d.law.number,d.law.article?`${authoredText(a?.knowledge.unitLabel)||t('lawArticle')} ${d.law.article}`:''].filter(Boolean).join(' · '))}</strong>${answer?.actDate?`<time datetime="${esc(answer.actDate)}">${esc(humanDate(answer.actDate))}</time>`:''}</div></div>`:'';
    const law=`<section class="rxa-law-section"><div class="rxa-section-heading"><h2>${esc(t('law'))}</h2><button type="button" class="rxa-icon-button" data-action="edit-section" data-section="law" aria-label="${esc(t('editSection',{section:t('law')}))}">${icon('edit')}</button></div>${lawRecord}${references}${assessmentBlock('law',t('lawFields'),lawFields)}</section>`;
    const facts=assessmentBlock('facts',t('factsBlock'),(a?optionsField('assessment.factId',authoredText(a.fact.prompt),a.fact.options,answer.factId):'')+basis);
    const route=assessmentBlock('routing',t('routingBlock'),routing);
    const actions=assessmentBlock('actions',t('actionsBlock'),a&&c.workbook?.version!==2?orderedActions(c,d,locked):optionsField('actionIds',t('actions'),c.actions,d.actionIds,true));
    let extra='';
    if(a&&!gameplayContext){
      const research=a.research,record=research.records.find(r=>r.id===answer.research.recordId),fragment=record?.fragments.find(f=>f.id===answer.research.fragmentId);
      const investigation=`<p class="rxa-panel-intro">${esc(authoredText(research.prompt))}</p>${button(t('viewSources'),'workspace',{extra:'data-panel="sources"',glyph:'sources'})}<div class="rxa-fields">${select('assessment.research.recordId',t('researchRecord'),research.records,answer.research.recordId)}${select('assessment.research.fragmentId',t('researchFragment'),record?.fragments||[],answer.research.fragmentId)}</div>${fragment?`<blockquote class="rxa-selected-fragment">${esc(researchText(fragment))}</blockquote>`:''}<div class="rxa-fields">${field('assessment.research.extracted',authoredText(research.extractedLabel),answer.research.extracted,'text','200')}</div>${optionsField('assessment.research.finding',t('researchFinding'),research.findingOptions,answer.research.finding)}`;
      extra=assessmentBlock('research',t('researchBlock'),investigation)+assessmentBlock('trap',t('trapBlock'),optionsField('assessment.trapId',authoredText(a.trap.prompt),a.trap.options,answer.trapId));
    }
    if(a&&gameplayContext)extra=assessmentBlock('trap',t('trapBlock'),optionsField('assessment.trapId',authoredText(a.trap.prompt),a.trap.options,answer.trapId));
    return `<section class="rxa-panel" role="tabpanel" id="rxaPanel" aria-labelledby="rxaPage-decision">${caseHeading(t('decision'),t('draftStatus'))}<p class="rxa-draft-status">${icon('cloud')}<span data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</span></p><form data-decision-form><div class="rxa-decision-outline">${facts}${route}${actions}</div>${gameplayContext?assessmentBlock('legal-citation',t('legalCitation'),`<section class="rxa-references">${selectedReferences.length?referenceView(selectedReferences[0],{locale,removable:!locked,internalOnly:true}):`<p>${esc(t('noReferences'))}</p>`}${button(t('chooseReferences'),'workspace',{quiet:true,extra:'data-panel="sources"',glyph:'sources'})}</section>`):c.workbook?.version>=2?'':law}${deadlineSummary()}${extra?`<div class="rxa-decision-outline rxa-decision-extra">${extra}</div>`:''}<fieldset class="rxa-fieldset rxa-reasoning-field"><legend>${esc(t('reasoning'))}</legend><label class="rxa-field full"><span class="rxa-sr">${esc(t('reasoning'))}</span><textarea data-decision="reasoning" data-focus="reasoning" maxlength="3000" rows="4" ${locked?'disabled':''}>${esc(d.reasoning)}</textarea><small>${esc(t('reasoningHint'))}</small></label></fieldset><div class="rxa-decision-footer"><small>${esc(t(view.mode==='training'?'afterSubmitTraining':seminar?'afterSubmitSeminar':'afterSubmitIndependent'))}</small><button class="rxa-btn primary" type="submit" ${busy||pending||paused?'disabled':''}>${icon('decision')}${esc(t('submit'))}</button></div></form>${confirmation?`<section class="rxa-confirm" role="region" aria-labelledby="rxaConfirmTitle"><h3 id="rxaConfirmTitle" tabindex="-1">${esc(t('confirmTitle'))}</h3><p>${esc(t('confirmText'))}</p><div class="rxa-actions">${button(t('confirm'),'confirm-decision',{primary:true,disabled:busy||!!pending})}${button(t('cancel'),'cancel-confirm',{disabled:busy})}</div></section>`:''}</section>`;
  }
  function followup() {
    if(correspondenceMode())return correspondenceFollowup();
    const f=view.followup||{},locked=busy||pending||paused;
    return `<section class="rxa-panel rxa-followup" role="tabpanel" id="rxaPanel" aria-labelledby="rxaPage-decision"><p class="rxa-eyebrow">${esc(t('fixed'))}</p><h2>${esc(t('followupTitle'))}</h2><p class="rxa-followup-intro">${esc(authoredText(f.intro))}</p><form data-followup-form><fieldset class="rxa-fieldset"><legend>${esc(t('followupQuestion'))}</legend>${(f.options||[]).map(option=>`<label class="rxa-choice"><input type="radio" name="rxa-followup" data-followup-choice data-focus="followup-${esc(option.id)}" value="${esc(option.id)}" ${followupDraft===option.id?'checked':''} ${locked?'disabled':''}><span>${esc(authoredText(option.label))}</span></label>`).join('')}</fieldset><div class="rxa-decision-footer"><small data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small><button class="rxa-btn primary" type="submit" ${locked?'disabled':''}>${icon('check')}${esc(t('followupSubmit'))}</button></div></form><details class="rxa-assessment-block" data-details="fixed-decision"><summary>${esc(t('submittedDecision'))}</summary><div class="rxa-assessment-content"><p><strong>${esc(t('procedure'))}:</strong> ${esc(authoredText(view.case.procedures.find(p=>p.id===decisionDraft.procedureId)?.label))}</p><p><strong>${esc(t('route'))}:</strong> ${esc(view.case.workbook?authoritySelectionLabel(decisionDraft.workbook?.routing,{locale}):authoredText(view.case.routes.find(p=>p.id===decisionDraft.routeId)?.label))}</p><ul class="rxa-fixed-actions">${decisionDraft.actionIds.map(id=>`<li>${esc(authoredText(view.case.actions.find(a=>a.id===id)?.label))}</li>`).join('')}</ul>${view.case.workbook?.version>=2?'':`<p><strong>${esc(t('law'))}:</strong> ${esc(decisionDraft.law.number)} · ${esc(decisionDraft.assessment?.actDate||'')} · ${esc(decisionDraft.law.article)}</p>`}<p><strong>${esc(t('deadline'))}:</strong> ${esc(decisionDraft.deadline)}</p><p class="rxa-fixed-reasoning">${esc(decisionDraft.reasoning)}</p></div></details></section>`;
  }
  function feedbackMarkup(feedback,row=null) {
    if (!feedback) return '';
    if(feedback.correspondence)feedback=presentCorrespondenceFeedback(feedback,{
      locale,issues:row?.correspondenceProfile?.issues||view.case.correspondence?.issues,
      sources:responseSources(row),actions:view.case.actions,recipients:responseRecipients(row?.decision||decisionDraft),
    });
    const evidenceIssueKeys = {selection:'evidenceSelection', unopened:'evidenceUnopened', fact:'evidenceFact'};
    const evidenceIssue = evidenceIssueKeys[feedback.evidenceIssue];
    const binary = view.context==='seminar'&&!correspondenceMode();
    const score = !binary ? feedback.score ?? '' : row ? view.result.points : Number(feedback.score >= (view.seminarPassScore ?? 100));
    const labelKeys = {research:'legalCitation',procedure:'procedure',route:'route',routing:'route',actions:'actionsCriterion',law:'lawCriterion',deadline:'deadlineCriterion',evidence:'evidence',facts:'factsCriterion'};
    return `${workbookFeedbackView(feedback,{locale,training:view.mode==='training',internalSources:Boolean(gameplayContext)})}<div class="rxa-score"><strong>${esc(score)}</strong><span>/ ${binary?1:100}</span></div><table class="rxa-criteria"><thead><tr><th>${esc(t('criteria'))}</th><th>${esc(t('earned'))}</th></tr></thead><tbody>${(feedback.criteria||[]).map(row=>`<tr><td>${esc(gameplayContext&&row.id==='research'?t('legalCitation'):text(row.label)||t(labelKeys[row.id]||row.id))}</td><td>${esc(binary?t(row.earned===row.max?'criterionMet':'criterionReview'):row.earned+' / '+row.max)}</td></tr>`).join('')}</tbody></table><p class="rxa-explanation">${esc(text(feedback.explanation))}</p>${evidenceIssue?`<p class="rxa-explanation">${esc(t(evidenceIssue))}</p>`:''}${Array.isArray(feedback.missingFacts)&&feedback.missingFacts.length?`<p class="rxa-explanation">${feedback.missingFacts.map(f=>esc(text(f))).join('\n')}</p>`:''}${responseProtocolMarkup(feedback)}`;
  }
  function review() {
    if(correspondenceMode())return correspondenceReview();
    return `<section class="rxa-panel rxa-review"><div class="rxa-review-icon">${icon('check')}</div><h2>${esc(t(view.feedback?'reviewTitle':'fixed'))}</h2>${view.feedback?feedbackMarkup(view.feedback):`<p class="rxa-panel-intro">${esc(t('reviewHidden'))}</p>`}${seminar?'':learningReviewView({view,catalog,locale})}${workRecordView({view,decision:decisionDraft,references:selectedReferences,locale})}<div class="rxa-review-footer">${button(t(Number(view.caseIndex)+1<Number(view.caseCount)?'next':'finish'),'next',{primary:true,disabled:busy||!!pending,glyph:'arrow'})}</div></section>`;
  }
  function coreMaterials() {
    const editable=active()&&coreInView()==='materials';
    const removable=editable&&!busy&&!pending&&!paused;
    const acts=(view.case.normativeActs||[]).map(act=>({act,citations:coreCitationsFor(act.id)}));
    const formatCount=new Intl.NumberFormat(locale);
    const selectedCount=acts.filter(({citations})=>citations.length).length;
    const progress=cl('citationProgress').replace('{count}',formatCount.format(selectedCount)).replace('{total}',formatCount.format(acts.length));
    return `<div class="rxa-desk" id="rxaDesk"><h1 data-core-heading>${esc(cl('sources'))}</h1>
      <div data-source-reader-host></div><div class="rxa-documents-library">
      ${editable?`<p class="rxa-panel-intro">${esc(cl(acceptsTwoCoreCitations()?'materialsHintTwo':'materialsHint'))}</p>`:''}
      ${acts.length?`<p class="rxt-citation-progress" data-core-citation-progress role="status">
        <span class="rxa-sr">${esc(cl('citationProgressLabel'))}. </span>${esc(progress)}</p>`:''}
      ${coreLessonHint('materials')}${coreFeedback('materials')}
      ${editable&&acceptsTwoCoreCitations()?`<div class="rxa-actions">${Object.keys(complaintExamplePassages).map(key=>
        button(cl(key),'example-law-passage',
          {quiet:true,disabled:!removable,glyph:'sources',extra:`data-passage="${key}"`})).join('')}</div>`:''}
      <section class="rxa-document-group rxt-legal-list" data-core-law>
      ${acts.map(({act,citations})=>`<div class="rxt-legal-act ${citations.length?'has-citation':''}" ${citations.length?`data-core-citation="${esc(act.id)}"`:''}>
        ${normativeActsView([act],{locale})}${citations.length?citations.map(citation=>{
          const reference=selectedReferences.find(row=>sameCoreReference(row,citation));
          const label=cl('removePassage')+(reference?.locator?' · '+text(reference.locator):'');
          return `<div class="rxt-chosen-citation" data-core-passage="${esc(citation.id)}">
            <details><summary>${icon('check')}${esc(cl('attached'))}
              ${reference?.locator?`<span>${esc(text(reference.locator))}</span>`:''}</summary><blockquote lang="ru">${esc(citation.quote)}</blockquote></details>
            ${removable?`<button type="button" class="rxa-btn quiet rxt-remove-citation" data-action="remove-core-citation" data-id="${esc(citation.id)}"
              aria-label="${esc(label)}" title="${esc(label)}">${icon('close')}</button>`:''}
          </div>`;
        }).join(''):`<p class="rxt-missing-citation" data-core-citation-missing>${esc(cl(editable?'chooseFragment':'noFragment'))}</p>`}
        </div>`).join('')}
      </section>
      ${editable&&!coreRecordsReady()?`<div class="rxt-core-footer">
        ${button(cl('read'),'core-records',{quiet:true,glyph:'docs',extra:'data-core-records-jump'})}</div>`:''}
      ${editable?`<div class="rxt-core-footer">${coreButton('materials')}</div>`:''}</div></div>`;
  }
  function documentsPage() {
    if(hasCore())return coreMaterials();
    const reading=selectedDoc&&(view.documents||[]).some(doc=>doc.id===selectedDoc);
    const notes=selectedReferences.length?`<details class="rxa-assessment-block" data-details="source-notes"><summary>${esc(t('sourceNotes'))} · ${selectedReferences.length}</summary><div class="rxa-assessment-content">${selectedReferences.map(reference=>referenceView(reference,{locale,removable:active(),internalOnly:Boolean(gameplayContext)})).join('')}</div></details>`:'';
    return `<div class="rxa-desk" id="rxaDesk">${caseHeading(t('documents'))}<div data-source-reader-host></div><div class="rxa-documents-library">${reading?`<div class="rxa-material-reader">${button(t('allDocuments'),'documents-list',{quiet:true,glyph:'arrow'})}${documents(true)}</div>`:`<section class="rxa-document-group"><h2>${esc(t('caseMaterials'))}</h2>${documents()}</section><section class="rxa-document-group"><h2>${esc(t('legalMaterials'))}</h2>${sources()}</section>${notes}`}</div></div>`;
  }
  function currentGuide() {
    const step=lessonStep(view);
    if(hasCore()&&(!step||['reception','materials','calendar','route','draft'].includes(step.id)||step.page!==page))return '';
    const sampleReady=step?.action==='draft'?examplePreviewed:step?.action==='control'?controlSampleOpened:Boolean(decisionDraft.deadline||decisionDraft.workbook?.referralDeadline);
    const required=step?.documentIds||[], opened=view?.openedDocumentIds||[];
    const documents=(view?.documents||[]).filter(document=>required.includes(document.id))
      .map(document=>({...document,opened:opened.includes(document.id)}));
    const materialsReady=required.every(id=>opened.includes(id));
    const workflow=view?.controlWorkflow;
    const materialIds=workflow?.journal?.at(-1)?.materialIds||[];
    const executionMaterial=step?.id==='control-evidence'&&workflow?.materials?.find(material=>
      materialIds.includes(material.id)&&material.kind==='execution-record');
    const materialSeen=controlMaterialSeen===executionMaterial?.id;
    return guidanceView({view,page,locale,localePage:t,button,locked:busy||!!pending||paused,sampleReady,
      materialsReady,documents,executionMaterial,materialSeen});
  }
  function workspace() {
    if(page==='decision'&&tutorial()&&view.status==='followup')return `<div class="rxa-decision-page"><div class="rxa-desk" id="rxaDesk">${lessonControl()}</div></div>`;
    if(view.status==='complete'&&['reception','decision'].includes(page))return complete();
    if(page==='reception')return reception();
    if(page==='chat')return `<div class="rxa-chat-page">${chatWorkspace()}</div>`;
    if(page==='documents')return `<div class="rxa-documents-page">${documentsPage()}</div>`;
    if(page==='route')return `<div class="rxa-decision-page"><div class="rxa-desk" id="rxaDesk">${active()&&coreInView()==='route'?coreRouting():coreRouteRecord()}</div></div>`;
    if(page==='calendar')return `<div class="rxa-calendar-page"><div class="rxa-desk" id="rxaDesk">${calendarPage()}</div></div>`;
    return `<div class="rxa-decision-page"><div class="rxa-desk" id="rxaDesk">${view.status==='review'?review():view.status==='followup'?followup():decision()}</div></div>`;
  }
  function navigation() {
    const count=unreadCount(), next=lessonStep(view);
    const tabs=[['reception','reception'],['chat','talk'],['documents',hasCore()?'sources':'docs'],
      ['calendar','calendar'],...(hasCore()?[['route','route']]:[]),['decision','decision']];
    return `<nav class="rxa-mobile-nav" aria-label="${esc(t('workplace'))}">${tabs.map(([id,glyph])=>{
      const label=hasCore()&&id==='documents'?cl('sources'):id==='route'?cl('routeTab'):t(id);
      const short=hasCore()?cl('short'+id[0].toUpperCase()+id.slice(1)):'';
      return `<button type="button" id="rxaPage-${id}" class="${next?.page===id?'rxt-next-tab':''}" data-action="page" data-page="${id}"
        data-focus="nav-${id}" aria-current="${(choosingCase?'reception':page)===id?'page':'false'}"
        ${short?`aria-label="${esc(id==='chat'&&count?label+' · '+t('unread',{count}):label)}"`:''} ${(!view||choosingCase)&&id!=='reception'?'disabled':''}>
        <span class="rxa-nav-icon">${icon(glyph)}${id==='chat'&&count?`<span class="rxa-unread" data-chat-unread aria-label="${esc(t('unread',{count}))}">${count}</span>`:''}</span>
        <span class="${short?'rxt-nav-full':''}">${esc(label)}</span>${short?`<span class="rxt-nav-short" aria-hidden="true">${esc(short)}</span>`:''}
      </button>`;
    }).join('')}</nav>`;
  }

  function journeyResult(result) {
    const grade=result.seminarPoints??result.points??0;
    const casePoints=result.points??0;
    const score=result.total??result.cases?.[0]?.score;
    const journal=result.journalStatus==='saved'?'journalSaved':result.journalStatus==='pending'?'journalPending':'journalLocal';
    const previous=result.journalStatus==='pending';
    return `<section class="rxa-complete rxt-lesson-complete"><div class="rxa-complete-head">
      <h1 tabindex="-1" data-stage-heading>${esc(l('grade'))}</h1>
      ${casePoints>=3?`<div class="rxa-score" data-case-grade><strong>${esc(casePoints)}</strong><span>${esc(t('outOf'))} 5 · ${esc(l('caseGrade'))}</span></div>`:''}
      ${casePoints===0?`<p><strong>${esc(l('zeroPoints'))}</strong> ${esc(l('threshold'))}</p>`:''}
      ${Number.isFinite(score)?`<p><strong>${esc(l('quality'))}</strong> · ${esc(new Intl.NumberFormat(locale,{maximumFractionDigits:4}).format(score))} / 100</p>`:''}
      ${casePoints>=3?`<p>${esc(l('scale'))}</p>`:''}
      ${Number.isInteger(result.seminarPoints)?`<p data-best-grade><strong>${esc(l('bestGrade'))}</strong> · ${esc(grade)} / 5</p>`:''}
      <p class="rxa-journal" role="status">${esc(t(journal))}</p>
      ${previous?button(t('journalRetry'),'refresh',{disabled:busy}):''}
      </div>${(result.cases||[]).map((row,index)=>`<details class="rxa-case-review" data-details="result-${index}"><summary>${esc(authoredText(row.title))}</summary>${feedbackMarkup(row.feedback,row)}${responseRecord(row,index)}${replyOnly()?'':executionRecord(row)}</details>`).join('')}
      ${pathSetup()}${options.onExit?`<div class="rxa-actions">${button(t('back'),'exit',{})}</div>`:''}</section>`;
  }
  function mentorPracticeResult(result) {
    const row=result.cases?.[0];
    const score=result.total;
    const number=new Intl.NumberFormat(locale,{maximumFractionDigits:4});
    const feedback=presentCorrespondenceFeedback(row?.feedback,{
      locale,issues:row?.correspondenceProfile?.issues||view.case.correspondence?.issues,
      sources:responseSources(row),actions:view.case.actions,recipients:responseRecipients(row?.decision||decisionDraft),
    });
    const protocol=feedback?.correspondence;
    const deductions=(protocol?.criteria||feedback?.criteria||[]).filter(criterion=>criterion.earned<criterion.max);
    const capApplied=Number.isFinite(protocol?.cap)&&protocol.rawScore>protocol.cap;
    return `<section class="rxa-complete rxt-lesson-complete rxt-practice-result" data-practice-result>
      <div class="rxa-complete-head">
        <h1 tabindex="-1" data-stage-heading>${esc(l('practiceResult'))}</h1>
        <div class="rxa-score" data-practice-score><strong>${esc(number.format(score))}</strong><span>/ 100</span></div>
        <p class="rxa-journal">${esc(l('practiceJournal'))}</p>
        ${score===100?`<p data-practice-perfect>${esc(l('practicePerfect'))}</p>`:''}
      </div>
      ${score<100?`<section class="rxt-practice-deductions" aria-labelledby="rxtPracticeDeductions"><h2 id="rxtPracticeDeductions">${esc(l('practiceDeductions'))}</h2>
        ${deductions.map(criterion=>`<article class="rxc-protocol-criterion" data-practice-deduction="${esc(criterion.id)}">
          <div class="rxt-deduction-heading"><h3>${esc(text(criterion.label))}</h3><strong>${esc(number.format(criterion.earned-criterion.max))} · ${esc(number.format(criterion.earned))} / ${esc(number.format(criterion.max))}</strong></div>
          ${criterion.reason?`<p>${esc(text(criterion.reason))}</p>`:''}
          ${(criterion.findings||[]).filter(finding=>finding.type==='missing'||finding.type==='incorrect').map(finding=>`${finding.quote?`<blockquote>${esc(finding.quote)}</blockquote>`:''}<p>${esc(text(finding.explanation))}</p>`).join('')}
          ${['route','calendar'].includes(criterion.id)?workbookFeedbackView(feedback,{locale,practiceCriterion:criterion.id,
            selectedAuthority:authoritySelectionLabel(row?.decision?.workbook?.routing,{locale})}):''}
        </article>`).join('')}
        ${capApplied?`<article class="rxc-protocol-criterion rxt-practice-cap" data-practice-cap>
          <div class="rxt-deduction-heading"><h3>${esc(l('practiceCap'))} · ${esc(number.format(protocol.cap))} / 100</h3><strong>${esc(number.format(protocol.cap-protocol.rawScore))}</strong></div>
          ${protocol.capExplanation?`<p>${esc(text(protocol.capExplanation))}</p>`:''}
          ${(protocol.criticalErrors||[]).map(({finding})=>`${finding?.quote?`<blockquote>${esc(finding.quote)}</blockquote>`:''}${finding?.explanation?`<p>${esc(text(finding.explanation))}</p>`:''}`).join('')}
        </article>`:''}
      </section>`:''}
      ${responseRecord(row,0)}${replyOnly()?'':lessonControlRecord()}${pathSetup()}</section>`;
  }
  function complete() {
    if(tutorial()){
      const example=view.journeyStage==='example';
      if(!example&&view.result?.practiceAssessment===true&&Number.isFinite(view.result.total))return mentorPracticeResult(view.result);
      return `<section class="rxa-complete rxt-lesson-complete"><div class="rxa-complete-head">
        <div class="rxa-review-icon">${icon('check')}</div><h1 tabindex="-1" data-stage-heading>${esc(l(example?'exampleDone':'mentorDone'))}</h1>
        <p>${esc(l(example?'noPoints':'practiceJournal'))}</p></div>${responseRecord()}${replyOnly()?'':lessonControlRecord()}${pathSetup()}</section>`;
    }
    const result = view.result;
    if (!result) return `<section class="rxa-complete"><h1>${esc(t('complete'))}</h1><p class="rxa-panel-intro">${esc(t('noResult'))}</p>${button(t('refresh'),'refresh',{primary:true,disabled:busy})}</section>`;
    if(result.gradingVersion==='seminar-thresholds-v1'||replyOnly()&&view.journeyStage==='independent')return journeyResult(result);
    const journal = result.journalStatus === 'saved' ? 'journalSaved' : ['local','not-applicable'].includes(result.journalStatus) || view.mode === 'training' || view.provider === 'mock' ? 'journalLocal' : 'journalPending';
    return `<section class="rxa-complete"><div class="rxa-complete-head"><p class="rxa-eyebrow">${esc(t('complete'))}</p><h1 tabindex="-1" data-stage-heading>${esc(t(Number.isInteger(result.seminarPoints)?'seminarTotal':'totalScore'))}</h1><div class="rxa-score"><strong>${esc(result.seminarPoints??result.points)}</strong><span>${esc(t('outOf'))} ${esc(seminar&&view.mode==='training'?1:result.maxPoints ?? 5)}</span></div>${Number.isInteger(result.seminarPoints)?`<p>${esc(t('casePoints',{count:result.points}))}</p><p>${esc(t('seminarScoreThreshold',{count:result.passScore??100}))}</p>`:''}<p class="rxa-journal" role="status">${esc(t(guest?'guestResult':journal))}</p>${journal==='journalPending'?`<div class="rxa-actions">${button(t('journalRetry'),'refresh',{disabled:busy})}</div>`:''}</div>${Array.isArray(result.cases)&&result.cases.length?`<h2>${esc(t('casesReview'))}</h2>${result.cases.map((row,index)=>`<details class="rxa-case-review" data-details="result-${index}"><summary>${index+1}. ${esc(authoredText(row.title))} · ${esc(view.context==='seminar'?t('casePoints',{count:result.points}):row.score+' / 100')}</summary>${feedbackMarkup(row.feedback,row)}${correspondenceMode()?responseRecord(row,index):''}${row.controlWorkflow?executionRecord(row):''}</details>`).join('')}`:''}${learningReviewView({view,catalog,locale})}${correspondenceMode()?'':workRecordView({view,decision:decisionDraft,references:selectedReferences,locale})}<div class="rxa-actions">${button(t(view.mode==='training'?'oneMore':'newSession'),'new-session',{primary:true,disabled:busy||result.remainingCases===0,glyph:'arrow'})}${options.onExit?button(t('back'),'exit',{}):''}</div>${guest?savedSessions():''}</section>`;
  }
  function historyNumber(value) {
    return new Intl.NumberFormat(locale,{maximumFractionDigits:4}).format(value);
  }
  function historyMarkup(screen) {
    const entries=screen.rows.map(row=>{
      const date=new Date(row.completedAt);
      const meta=[row.journeyStage?l(row.journeyStage):'',Number.isFinite(date.valueOf())?new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(date):'',
        Number.isFinite(row.points)&&Number.isFinite(row.maxPoints)?historyNumber(row.points)+' / '+historyNumber(row.maxPoints):'',
        Number.isFinite(row.score)?historyNumber(row.score)+' / 100':''].filter(Boolean).join(' · ');
      return `<article><div><strong>${esc(row.title)}</strong><small>${esc(meta)}</small></div>${button(l('historyOpen'),'open-history-entry',
        {disabled:screen.loading,extra:`data-id="${esc(row.id)}" aria-label="${esc(l('historyOpen')+' · '+row.title)}"`})}</article>`;
    }).join('');
    return `<main class="rxa-page-content" data-history-screen><section class="rxa-setup" aria-labelledby="rxaHistoryTitle">
      ${button(view&&!choosingCase?l('historyClose'):l('archiveBack'),'close-history',{quiet:true,glyph:'back'})}
      <h1 id="rxaHistoryTitle" tabindex="-1">${esc(l('historyTitle'))}</h1>
      ${screen.loading?`<p role="status">${esc(t('loading'))}</p>`:''}
      ${screen.error?`<div class="rxa-alert" role="alert"><p>${esc(l('historyUnavailable'))}</p>${button(t('retry'),'retry-history',{quiet:true})}</div>`:''}
      ${entries?`<div class="rxa-saved-sessions">${entries}</div>`:!screen.loading&&!screen.error?`<p>${esc(l('historyEmpty'))}</p>`:''}
      ${screen.nextCursor&&!screen.error?button(l('historyMore'),'more-history',{quiet:true,disabled:screen.loading}):''}</section></main>`;
  }
  async function readHistory({cursor,id}={}) {
    const screen=historyScreen;
    if(!screen||screen.loading||paused||ownerNow()!==owner)return;
    screen.loading=true;screen.error=null;render();
    const stillCurrent=()=>!disposed&&historyScreen===screen&&ownerNow()===owner;
    try{
      if(id){
        const record=await api.request({op:'resume',sessionId:id,history:true},{signal:screen.controller.signal});
        if(!stillCurrent())return;
        if(record.id!==id||record.status!=='complete')throw new ReceptionAPIError('invalid-response');
        archiveEntry=record;
      }else{
        const result=await api.history({
          studentKey:backend?.getProfile?.()?.studentKey||options.studentKey,locale,...(cursor?{cursor}:{})
        },{signal:screen.controller.signal});
        if(!stillCurrent())return;
        const rows=cursor?screen.rows:[];
        screen.rows=[...new Map([...rows,...result.attempts].map(row=>[row.id,row])).values()];
        screen.nextCursor=result.nextCursor!==cursor?result.nextCursor:null;
      }
    }catch(problem){
      if(stillCurrent()&&problem.code!=='cancelled')screen.error={cursor,id};
    }finally{
      if(stillCurrent()){
        screen.loading=false;render();
        if(archiveEntry)root.querySelector('[data-historical-session] h1')?.focus({preventScroll:true});
      }
    }
  }
  function archivedCaseContent({record,row,decision,index}) {
    const feedback=row?.feedback||(record&&record.feedback);
    const criteria=(feedback?.criteria||[]).map(criterion=>`<tr><td>${esc(authoredText(criterion.label)||criterion.id)}</td>
      <td>${esc(Number.isFinite(criterion.earned)&&Number.isFinite(criterion.max)?historyNumber(criterion.earned)+' / '+historyNumber(criterion.max):'')}</td></tr>`).join('');
    const reply=decision?.correspondence?correspondencePreviewView({
      draft:decision.correspondence,caseInfo:row?.caseInfo||record?.case,
      profile:row?.correspondenceProfile||record?.case?.correspondence,
      sources:row?.correspondenceSources||record?.correspondenceSources,locale,seminar:true,disabled:true,
      citationPrefix:`rxc-archive-source-${index}`,
    }):decision?.reasoning?`<p>${esc(decision.reasoning)}</p>`:'';
    return `${criteria?`<table class="rxa-criteria"><thead><tr><th>${esc(t('criteria'))}</th><th>${esc(t('earned'))}</th></tr></thead><tbody>${criteria}</tbody></table>`:''}
      ${feedback?.explanation?`<p>${esc(authoredText(feedback.explanation))}</p>`:''}${responseProtocolMarkup(feedback)}
      ${reply?`<details class="rxa-assessment-block" open><summary>${esc(t('responseWork'))}</summary>${reply}</details>`:''}`;
  }
  function archiveMarkup(record) {
    const local=historyScreen?null:drafts.readSession(record.id);
    const result=record.result;
    const cases=result?.cases||[];
    const lastResult=cases.at(-1);
    const decision=lastResult?.decision||record.decision||(!historyScreen&&(record.draftDecision||local?.decisionDraft));
    const points=result?.points;
    const score=result?.total??lastResult?.score;
    const journal=result?.journalStatus==='saved'?'journalSaved':result?.journalStatus==='pending'?'journalPending':'journalLocal';
    const messages=(record.messages||[]).map(message=>`<p><strong>${esc(message.role==='user'?t('you'):text(record.case?.citizen?.name)||t('citizen'))}</strong><br>${esc(text(message.text))}</p>`).join('');
    const opening=record.case?.opening?`<p>${esc(authoredText(record.case.opening))}</p>`:'';
    const mentor=(record.mentorMessages||[]).map(message=>`<p><strong>${esc(message.role==='user'?t('you'):l('mentor'))}</strong><br>${esc(text(message.text))}</p>`).join('');
    return `<main class="rxa-page-content"><section class="rxa-setup" data-historical-session>
      ${button(l(historyScreen?'historyBack':'archiveBack'),'close-archive',{quiet:true,glyph:'back'})}
      <h1 tabindex="-1">${esc(authoredText(record.case?.title||local?.caseTitle)||l('archiveCase'))}</h1>
      ${record.journeyStage?`<p>${esc(l(record.journeyStage))}</p>`:''}
      ${Number.isFinite(points)?`<p><strong>${esc(l('caseGrade'))}</strong> · ${historyNumber(points)} / ${historyNumber(result.maxPoints??5)}</p><p>${esc(t(journal))}</p>`:''}
      ${Number.isFinite(score)?`<p><strong>${esc(l('quality'))}</strong> · ${historyNumber(score)} / 100</p>`:''}
      ${archivedCaseContent({record,row:lastResult,decision,index:cases.length})}
      ${cases.slice(0,-1).map((row,index)=>`<details class="rxa-case-review"><summary>${esc(authoredText(row.title)||l('archiveCase'))}
        ${Number.isFinite(row.score)?` · ${historyNumber(row.score)} / 100`:''}</summary>
        ${archivedCaseContent({row,decision:row.decision,index})}</details>`).join('')}
      ${messages||opening?`<details class="rxa-help"><summary>${esc(t('chat'))}</summary>${messages||opening}</details>`:''}
      ${mentor?`<details class="rxa-help"><summary>${esc(l('mentor'))}</summary>${mentor}</details>`:''}</section></main>`;
  }
  function render({scrollChat=false} = {}) {
    if (disposed) return;
    if(archiveEntry||historyScreen){
      const previousHistory=root.querySelector('[data-history-screen]');
      if(previousHistory&&historyScreen)historyScreen.scrollTop=previousHistory.scrollTop;
      root.setAttribute('aria-busy',String(Boolean(historyScreen?.loading)));
      root.innerHTML=archiveEntry?archiveMarkup(archiveEntry):historyMarkup(historyScreen);
      const list=root.querySelector('[data-history-screen]');
      if(list)list.scrollTop=historyScreen.scrollTop||0;
      tour.update({paused:true});media.refresh();return;
    }
    const focused = !stageFocus && root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.dataset?.focus;
    const selection = focused && 'selectionStart' in focused ? [focused.selectionStart,focused.selectionEnd] : null;
    captureChatScroll();
    const scroll=inMentorChat()?mentorChatScroll:chatScroll;
    if(root.dataset.caseId===(view?.case?.id||''))for(const el of root.querySelectorAll('details[data-details]')){if(el.open)detailOpen.add(el.dataset.details);else detailOpen.delete(el.dataset.details);}
    const sameRenderedCase=root.dataset.sessionId===(view?.id||'')&&root.dataset.caseId===(view?.case?.id||'');
    const resetReceptionScroll=Boolean(view&&!sameRenderedCase&&page==='reception');
    root.classList.add('reception-ai-root','rxa-cabinet'); root.setAttribute('lang',locale); root.setAttribute('aria-busy',String(busy)); root.dataset.mobilePane=mobilePane;root.dataset.page=page;
    root.dataset.sessionStatus=view?.status||'setup';root.dataset.core=String(hasCore());
    root.dataset.sessionId=view?.id||'';root.dataset.caseId=view?.case?.id||'';
    const oldContent=root.querySelector('.rxa-page-content');if(!stageFocus&&sameRenderedCase&&oldContent?.dataset.page===page)pageScroll[page]=oldContent.scrollTop;
    if(resetReceptionScroll)pageScroll.reception=0;
    markChatRead();
    const guide=currentGuide();
    const comparison=sampleComparison&&!(hasCore()&&active())?tutorialComparison():'';
    const mentorIntro=!choosingCase&&!restoring&&page!=='reception'&&page!=='chat'?mentorWelcome():'';
    root.innerHTML = header() + navigation() + `<main class="rxa-page-content" data-page="${page}">`+alerts()+coreJourney()+mentorIntro+(page==='reception'||choosingCase||inMentorChat()?'':guide+comparison) + (restoring?`<div class="rxa-loading" role="status"><div class="rxa-spinner" aria-hidden="true"></div>${esc(t('loading'))}</div>`:!view||choosingCase?landing():workspace())+'</main>';
    for(const section of ['facts','legalBasis','resolution','nextSteps']){
      const saved=citationSelections[section];if(!saved)continue;
      const select=root.querySelector(`[data-response-source="${section}"]`),quote=root.querySelector(`[data-response-source-quote="${section}"]`);
      if(select)select.value=saved.key;if(quote)quote.value=saved.quote;
    }
    const content=root.querySelector('.rxa-page-content');if(content)content.scrollTop=Number(pageScroll[page])||0;
    calendar.update({state:calendarState,task:calendarTask(),rulesMarkup:calendarRulesMarkup(),events:view?.case?.assessment?.calendar?.events||[],date:view?.case?.date,locale,disabled:!active()||paused||pending?.op==='decide'||busy&&operation==='decide'||hasCore()&&(busy||!!pending||(coreInView()!=='calendar'||registrationPractice()))});
    reader.refresh?.();media.refresh();
    tour.update({stage:view?.journeyStage,sessionId:view?.id,step:lessonStep(view),page,locale,
      stepIndex:view?.guidance?.stepIndex,stepTotal:view?.guidance?.steps?.length,mfc:mfcJourney(),question:guidedQuestion(),
      registrationFirst:view?.case?.workbook?.calendarVersion===MFC_CALENDAR_VERSION,
      filledExample:view?.journeyStage==='example'&&!!exampleDraftSeed,examplePreviewed,replyOnly:replyOnly(),
      paused:busy||!!pending||paused||inMentorChat()||choosingCase||confirmation||page==='calendar'&&registrationPractice()});
    updateViewport();
    if(stageFocus){
      const heading=root.querySelector('[data-stage-heading], [data-core-heading]');
      stageFocus=false;
      if(content)content.scrollTop=0;
      if(heading){
        heading.tabIndex=-1;heading.focus({preventScroll:true});
        if(heading.closest('[data-practice-result]'))window.scrollTo({top:0,behavior:'instant'});
      }
    }
    if(resetReceptionScroll){
      const sessionId=view.id,caseId=view.case.id;
      const toTop=()=>{if(disposed||page!=='reception'||view?.id!==sessionId||view?.case?.id!==caseId)return;const pane=root.querySelector('.rxa-page-content');if(pane)pane.scrollTop=0;root.scrollTop=0;window.scrollTo({top:0,behavior:'instant'});};
      toTop();requestAnimationFrame(toTop);
    }
    enteringMessages.clear();
    const pendingNode=root.querySelector('[data-pending-message]'); if(pendingNode)lastPendingRenderedId=pendingNode.dataset.messageId;
    resizeComposer();
    for (const details of root.querySelectorAll('details[data-details]')) if (detailOpen.has(details.dataset.details)) details.open = true;
    if (focusKey) {
      const replacement = [...root.querySelectorAll('[data-focus]')].find(el=>el.dataset.focus===focusKey);
      if (replacement && !replacement.disabled) { replacement.focus({preventScroll:true}); if (selection && typeof replacement.setSelectionRange==='function') try { replacement.setSelectionRange(...selection); } catch {} }
    }
    const nextLog = root.querySelector('.rxa-messages');
    if (nextLog && page==='chat') {
      nextLog.scrollTop = scrollChat || scroll.bottom ? nextLog.scrollHeight : scroll.top;
      if(scrollChat){
        const position={top:nextLog.scrollTop,bottom:true};
        if(inMentorChat())mentorChatScroll=position;else chatScroll=position;
      }
    }
  }
  function updateViewport() {
    const height=visualViewport?.height||window.innerHeight||800;
    const editing=root.contains(document.activeElement)&&/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName||'');
    const keyboard=editing&&(visualViewport?.scale ?? 1)===1&&window.innerHeight-height>130;
    root.style.setProperty('--rxa-visible-height',Math.round(height)+'px');
    root.style.setProperty('--rxa-viewport-top',Math.round(visualViewport?.offsetTop||0)+'px');
    root.dataset.compactViewport=String(height<620);root.dataset.keyboardOpen=String(keyboard);
  }
  function resizeComposer() {
    const field=root.querySelector('[data-message-draft], [data-mentor-draft]');if(!field)return;
    field.style.height='auto';field.style.height=Math.min(144,Math.max(46,field.scrollHeight))+'px';
    const counter=root.querySelector('[data-message-count]');if(counter)counter.textContent=field.value.length?`${field.value.length} / 2000`:'';
  }
  function fillExampleDraft(next) {
    const supplied=next.guidance?.prefilledDecision?.correspondence;
    const draft=decisionDraft.correspondence;
    if(next.journeyStage!=='example'||next.status!=='active'||!supplied||!draft)return;
    // Keep deliberate edits (including erased fields) across visits and language changes.
    const language=next.locale;

    const sample=restoreCorrespondence(supplied);
    if(exampleDraftSeed?draft.subject===exampleDraftSeed.subject:!draft.subject)draft.subject=sample.subject;
    for(const key of Object.keys(sample.sections)){
      if(exampleDraftSeed?draft.sections[key]===exampleDraftSeed.sections?.[key]:!draft.sections[key])draft.sections[key]=sample.sections[key];
    }
    if(!exampleDraftSeed){
      for(const citation of sample.citations){
        if(citation.id.startsWith('core-legal-'))continue;
        const existing=draft.citations.find(item=>item.id===citation.id||
          item.section===citation.section&&item.kind===citation.kind&&item.sourceId===citation.sourceId&&item.quote===citation.quote);
        if(!existing&&draft.citations.length<20)draft.citations.push(citation);
      }
    }
    exampleDraftSeed={locale:language,subject:sample.subject,sections:sample.sections};
  }
  function syncCoreValues(next, {applySaved=false,applyCalendar=false,applyCitations=false}={}) {
    if(!hasCore())return;
    const values=next.coreSteps?.values;
    if(!coreCitationsEdited&&values?.citations?.length&&(applySaved||applyCitations||values.citations.some(item=>!decisionDraft.correspondence.citations.some(row=>row.id===item.id)))){
      installCoreCitations(values.citations,{replaceAll:true});
    }
    if(values?.calendar&&(applySaved||applyCalendar)){
      decisionDraft.deadline=values.calendar.deadline;
      Object.assign(decisionDraft.workbook,{
        referralDeadline:values.calendar.referralDeadline,registrationTimely:values.calendar.registrationTimely,
      });
      calendarState={...calendarState,registrationTimely:values.calendar.registrationTimely};
    }
    if(values?.routing&&applySaved)decisionDraft.workbook.routing=clone(values.routing);
  }
  function updateDraftStatus() {
    persist();for(const note of root.querySelectorAll('[data-save-note]'))note.textContent=t(storageOkay?'savedDraft':'storageError');
    for(const hint of root.querySelectorAll('[data-outline-summary]'))hint.textContent=sectionHint(hint.dataset.outlineSummary);
  }
  function acceptView(next, body) {
    const stageChanged=view?.id===next.id&&view.status!==next.status&&['followup','review','complete'].includes(next.status);
    const previousCase = view?.case?.id || savedCaseId;
    const sameCase = (view?.id||savedSessionId)===next.id && previousCase === next.case?.id;
    const previousIds=new Set(view?.messages?.map(m=>m.id)||[]);
    enteringMessages=new Set(['start','message','next'].includes(body.op)?(next.messages||[]).filter(m=>!previousIds.has(m.id)&&!(m.id===`${body.requestId}-user`&&lastPendingRenderedId===`pending-${body.requestId}`)).map(m=>m.id):[]);
    const stepChanged=body.op==='tutorial-step'&&lessonStep(next)?.id!==lessonStep(view)?.id;
    const previousCore=coreCurrent();
    const coreReceipt=next.coreSteps?.receipt?.requestId===body.requestId&&Boolean(body.requestId);
    const materialsSaved=coreReceipt&&body.stepId==='materials'&&next.guidance?.finding?.stepId!=='materials';
    const coreAcknowledged=!body.backgroundMaterials&&(
      body.op==='core-step'&&coreReceipt||body.op==='tutorial-step'&&materialsSaved&&coreEdit==='materials');
    const newlyStarted=body.op==='start'&&!sameCase;
    if(stepChanged){
      controlWorkspaceUI=restoreControlWorkspaceUI();
      executionActionDraft=restoreControlActionDraft();
      controlRecipientPicker=false;controlMissing=false;
    }
    const previousQuestion=guidedQuestion();
    if(body.op==='locale'&&previousQuestion&&!previousQuestion.completed&&draftMessage===previousQuestion.prompt)
      draftMessage=next.guidance?.question?.prompt??draftMessage;
    view = next; mode = next.mode || mode; confirmation = false;
    if(body.op==='start'||body.op==='recover')choosingCase=false;
    if(body.op==='start')notice='';
    if(!sameCase){coreEdit='';coreCitationsEdited=false;registrationReviewOffered=false;}
    const currentJourney=!seminarStoryVersion||next.seminarStoryVersion===seminarStoryVersion;
    if(next.seminarProgress&&currentJourney)seminarProgress=next.seminarProgress;
    if(next.status==='complete'&&isLesson(next.journeyStage)&&currentJourney){
      seminarProgress={...seminarProgress,exampleCompleted:true,...(next.journeyStage==='mentor'?{mentorCompleted:true}:{})};
      chatDialog='citizen';
    }
    if(!sameCase||stepChanged)sampleComparison=false;
    if(!sameCase){resetMentorChat();exampleDraftSeed=null;examplePreviewed=false;controlSampleOpened=false;controlMaterialSeen='';controlMissing=false;}
    if(!sameCase){responsePreview=false;controlDraft=restoreCorrespondenceControl();citationSelections={};recipientOrderId='';
      executionActionDraft=restoreControlActionDraft();controlWorkspaceUI=restoreControlWorkspaceUI();controlRecipientPicker=false;}
    if (!sameCase) { deferredDocuments.clear();illustrationViewer.destroy();routingSearch='';routingTerritory=undefined;decisionDraft = blankDecision(); followupDraft='';detailOpen=new Set();draftMessage = ''; selectedDoc = ''; tab = 'documents'; mobilePane='desk';page='reception';chatScroll={top:0,bottom:true};calendarState={};selectedReferences=[];readMessageIds.clear();pageScroll={}; }
    if (next.decision && next.status !== 'active') decisionDraft = restoreDecision(next.decision,!!next.case?.assessment);
    if (body.op === 'document'&&!body.backgroundDocument) {selectedDoc = body.documentId; tab='documents'; mobilePane='desk';page=hasCore()?'reception':'documents';}
    if (body.op === 'decide'||body.op==='followup'||body.op==='control-action') {mobilePane='desk';tab='decision';page='decision';}
    if(stageChanged){page='decision';mobilePane='desk';tab='decision';notice='';responsePreview=false;pageScroll.decision=0;stageFocus=true;}
    if (newlyStarted) { decisionDraft = blankDecision(); draftMessage = ''; selectedDoc = ''; tab = 'documents';page='reception';calendarState={};selectedReferences=[];readMessageIds.clear();pageScroll={}; }
    // A pending action can finish after the student has opened a source. Keep
    // that reader only for the same case and its Sources page; otherwise its
    // previous selection and scroll lock must not enter the next workspace.
    if(!sameCase||page!=='documents'||body.op==='document'&&!body.backgroundDocument)reader.close();
    if(correspondenceMode()){
      if(next.draftDecision&&!decisionDraft.correspondence)decisionDraft=restoreDecision(next.draftDecision);
      decisionDraft.correspondence??=blankCorrespondence(next.case?.correspondence);
      const fixedKind=currentDocumentKind();
      if(fixedKind)decisionDraft.correspondence.kind=fixedKind;
      delete decisionDraft.assessment;
      if(next.control)controlDraft=restoreCorrespondenceControl(next.control);
      else if(next.draftControl&&!controlDraft.text&&!controlDraft.statuses.length)controlDraft=restoreCorrespondenceControl(next.draftControl);
      if(body.op==='control-action'&&next.controlActionReceipt?.requestId===body.requestId){
        const latest=next.controlWorkflow?.journal?.at(-1);
        if(latest?.accepted===true)executionActionDraft=restoreControlActionDraft({issueId:body.action?.issueId});
        controlRecipientPicker=false;
      }
      // A response may arrive after the transport timed out. Do not offer to
      // resubmit a stage which the server has already committed.
      if(pending?.op==='decide'&&next.decision||pending?.op==='followup'&&(next.control||next.controlValidation?.requestId===pending.requestId)
        ||pending?.op==='control-action'&&next.controlActionReceipt?.requestId===pending.requestId)pending=null;
      if(!pending&&next.reviewPending?.status==='retry'&&/^(reviewer_unavailable|review_unavailable|review_invalid|review_unconfirmed|citation_source_unavailable|provider_unavailable|provider_busy|provider_invalid)$/.test(next.reviewPending.code||'')){
        const retry=next.reviewPending;
        // A server-normalized snapshot need not have the same digest as the
        // original raw payload. After a definitive failed review, a recovered
        // device uses a fresh key. A locally retained request keeps its key.
        if(retry.phase==='initial'&&next.draftDecision)pending={op:'decide',sessionId:next.id,requestId:newRequestId(),decision:clone(next.draftDecision)};
        if(retry.phase==='control'&&next.draftControl)pending={op:'followup',sessionId:next.id,requestId:newRequestId(),control:clone(next.draftControl)};
      }
    }else if(next.case?.assessment)decisionDraft=restoreDecision(decisionDraft,true);else delete decisionDraft.assessment;
    if(next.case?.workbook){
      decisionDraft.workbook??=blankWorkbook();
      const calendarVersion=next.case.workbook.calendarVersion||'';
      const upgraded=sameCase&&calendarVersion===MFC_CALENDAR_VERSION&&calendarDraftVersion!==calendarVersion;
      if(upgraded){
        // The preceding 7+30 calendar used the same dates but did not ask about registration.
        if(!next.coreSteps?.values?.calendar){
          if(calendarDraftVersion!==MFC_CALENDAR_WITHOUT_REGISTRATION){
            decisionDraft.deadline='';
            decisionDraft.workbook.referralDeadline='';
            calendarState={};
          }
          calendarState.registrationTimely=null;
        }
        if(pending?.stepId==='calendar'){pending=null;pendingAt=null;}
      }
      calendarDraftVersion=calendarVersion;
      if(materialsSaved)coreCitationsEdited=false;
      syncCoreValues(next,{applySaved:!sameCase,applyCalendar:upgraded,applyCitations:materialsSaved});
      const practiceAnswer=next.case.workbook.registrationPractice?.answer;
      calendarState={...calendarState,selectedDates:{referral:decisionDraft.workbook.referralDeadline,deadline:decisionDraft.deadline},
        registrationTimely:practiceAnswer??(hasCore()&&active()?calendarState.registrationTimely??null:decisionDraft.workbook.registrationTimely)};
    }else{
      delete decisionDraft.workbook;
      calendarDraftVersion='';
    }
    fillExampleDraft(next);
    const current=coreCurrent();
    if(hasCore()&&(coreAcknowledged||stepChanged&&current!==previousCore)){
      coreEdit='';selectedDoc='';notice='';tab=current==='materials'?'documents':'decision';
      if(CORE_PAGES[current]){
        page=previousCore==='reception'&&current==='materials'?'reception':CORE_PAGES[current];
        mobilePane='desk';pageScroll[page]=0;stageFocus=true;
      }
    }
    const resumed=['recover','resume'].includes(body.op)||body.op==='start'&&next.revision>1;
    if(mfcJourney()&&!sameCase&&resumed&&CORE_PAGES[current]){
      page=CORE_PAGES[current];mobilePane='desk';tab=page==='documents'?'documents':'decision';
    }
    if(resumed&&active()&&registrationPractice()&&!next.case.workbook.registrationPractice&&!registrationReviewOffered){
      registrationReviewOffered=true;
      page='calendar';mobilePane='desk';pageScroll.calendar=0;stageFocus=true;
    }
    if(body.op==='registration-check'&&next.case.workbook?.registrationPractice){
      page=CORE_PAGES[current]||'reception';mobilePane='desk';pageScroll[page]=0;stageFocus=true;
    }
    savedSessionId=next.id;savedCaseId = next.case?.id || '';markChatRead();
    if (next.status === 'complete' && next.result?.attemptId && completedNotified !== next.result.attemptId) {
      completedNotified = next.result.attemptId;
      if(tutorial())return;
      options.onComplete?.({attemptId:next.result.attemptId,journalStatus:next.result.journalStatus});
      root.dispatchEvent(new CustomEvent('reception-ai:complete',{bubbles:true,detail:{attemptId:next.result.attemptId,journalStatus:next.result.journalStatus}}));
    }
  }
  function wasCommitted(next, body) {
    if(body.op==='registration-check')return next.case?.workbook?.registrationPractice?.answer===body.registrationTimely;
    if(body.op==='core-step'||body.op==='tutorial-step'&&body.stepId==='materials'&&next.coreStepsVersion)
      return next.coreSteps?.receipt?.requestId===body.requestId;
    if(body.op==='decide')return Boolean(next.decision)||next.caseIndex!==view?.caseIndex&&next.status!=='active';
    if(body.op==='followup')return Boolean(next.control)||Boolean(next.followupChoiceId)||next.controlValidation?.requestId===body.requestId||next.status==='review'||next.status==='complete';
    if(body.op==='control-action')return next.controlActionReceipt?.requestId===body.requestId;
    if(body.op==='next')return next.status==='complete'||Boolean(view&&next.caseIndex>view.caseIndex);
    if(body.op==='message')return (next.messages||[]).some(m=>m.id===body.requestId+'-user');
    if(body.op==='mentor-question')return (next.mentorMessages||[]).some(m=>m.id===body.requestId+'-user')||next.mentorReceipt?.requestId===body.requestId;
    if(body.op==='tutorial-step')return next.tutorialReceipt?.requestId===body.requestId||next.guidance?.receipt?.requestId===body.requestId||next.coreSteps?.receipt?.requestId===body.requestId
      || lessonStep(next)?.id!==body.stepId||next.guidance?.finding?.requestId===body.requestId;
    if(body.op==='document')return (next.openedDocumentIds||[]).includes(body.documentId);
    return false;
  }
  async function registerDocuments() {
    if(disposed||!active()||busy||pending||needsResume||paused)return;
    const docId=[...deferredDocuments].find(id=>(view.documents||[]).some(doc=>doc.id===id));
    if(!docId)return;
    deferredDocuments.delete(docId);
    if((view.openedDocumentIds||[]).includes(docId)){await registerDocuments();return;}
    await perform({op:'document',sessionId:view.id,documentId:docId,requestId:newRequestId()},{backgroundDocument:true});
  }
  async function perform(body, {retry=false,backgroundDocument=false,backgroundMaterials=false,openSaved=false} = {}) {
    if (busy || disposed || paused) return;
    if (ownerNow() !== owner) { error = new ReceptionAPIError('identity-changed'); render(); return; }
    const mutation = mutationOps.includes(body.op);
    if (pending && mutation && !retry) return;
    if (mutation) {if(pending?.requestId!==body.requestId)pendingAt=Date.now();pending = clone(body);}
    const chatOperation=()=>body.op==='message'&&!inMentorChat()||body.op==='mentor-question'&&inMentorChat();
    busy = true; operation = body.op; error = null; failedOperation=''; persist(); render({scrollChat:chatOperation()});
    waitingTimer=setTimeout(()=>{
      for(const node of root.querySelectorAll('[data-op-wait]'))node.textContent=t('operationStillWaiting');
    },15000);
    let recoverCurrent=false;
    const task = (async()=>{
      try {
        let next;
        if(retry&&body.sessionId){
          const current=await api.request({op:'resume',sessionId:body.sessionId});
          if(current.historical||wasCommitted(current,body))next=current;
          else if(current.operationInProgress)throw new ReceptionAPIError('operation-in-progress',409);
        }
        next??=await api.request(body);
        if (disposed || ownerNow() !== owner) return;
        if(next.historical||seminarStoryVersion&&next.context==='free'){
          legacySessionIds.set(next.id,{journeyStage:next.journeyStage||(next.mode==='independent'?'independent':'example'),completed:next.status==='complete'});
          if(openSaved){archiveEntry=next;}
          else {clearSessionDraft();recoverCurrent=true;}
          return;
        }
        if(openSaved){
          const saved=drafts.readSession(next.id);
          clearSessionDraft();
          if(saved)restoreSaved(saved);
        }
        if(buildId && next.status!=='complete' && next.context!=='seminar' && next.buildId!==buildId)throw new ReceptionAPIError('outdated-session',409);
        const waiting=body.op==='resume'&&pending?.sessionId===body.sessionId?pending:null;
        const resolved=waiting&&wasCommitted(next,waiting);
        if(body.op==='start'&&view?.id!==next.id){
          const saved=drafts.readSession(next.id);
          if(saved){view=null;restoreSaved(saved);}
        }
        acceptView(next,{...(resolved?waiting:body),backgroundDocument,backgroundMaterials});
        if(resolved&&waiting.op==='document')deferredDocuments.delete(waiting.documentId);
        initial=null; if(mutation||resolved)pending=null; needsResume=false;
      } catch (problem) {
        if (disposed || problem.code === 'cancelled') return;
        error = problem; failedOperation=body.op; const code = String(problem.code||'').replaceAll('_','-');
        if(seminarStoryVersion&&(['outdated-session','seminar-training-update-required'].includes(code)||
           restoring&&body.op==='resume'&&['not-found','expired'].includes(code))){
          clearSessionDraft();recoverCurrent=true;return;
        }
        const retryReview=correspondenceMode()&&['decide','followup'].includes(body.op)&&/^(reviewer-unavailable|review-unavailable|review-invalid|review-unconfirmed|citation-source-unavailable|provider-unavailable|provider-busy|provider-invalid)$/.test(code);
        if(body.op==='resume'&&/not-found|expired|outdated-session/.test(code)&&!view){initial=null;pending=null;savedCaseId='';drafts.clearCurrent();}
        // A definitive rejection is safe to amend; an uncertain transport failure keeps its idempotency key.
        if(/request-failed|request-interrupted|provider-unavailable|provider-invalid|unavailable|revision|conflict|stale|busy/.test(code))needsResume=true;
        const ambiguous=/^(timeout|network|operation-in-progress|invalid-response|busy|server-error)$/.test(code)||code==='request-interrupted'&&!retry;
        if (mutation && !retryReview && !ambiguous && (/request-failed|request-interrupted|provider-unavailable|provider-invalid|unavailable|busy|revision|conflict|stale|budget|limit|quota|auth|token|forbidden|not-found|not-configured|unsafe-endpoint|local-demo|profile-required|invalid-|core-.*-required|closed|completed|locked|validation|not-active|not-reviewed|pilot-incomplete|outdated-session/.test(code)
          && !/invalid-response/.test(code))) { pending = null; if(body.op==='message'&&!draftMessage)draftMessage=body.text;if(body.op==='mentor-question'&&!mentorDraft)mentorDraft=body.text; }
      } finally {
        clearTimeout(waitingTimer);busy = false; operation = ''; restoring = false; persist(); render({scrollChat:chatOperation()});
      }
      if(!error&&deferredDocuments.size)await registerDocuments();
      if (requestedLocale && !pending && !disposed) {
        const nextLocale = requestedLocale; requestedLocale = null; await changeLocale(nextLocale);
      }
    })();
    work = task; await task;
    if(recoverCurrent&&!disposed)await recoverSession(null,{quiet:true});
  }
  function retryPending() {
    if(!pending)return;
    return perform(clone(pending),{retry:true,backgroundDocument:pending.op==='document'});
  }
  async function recoverPendingMaterials() {
    if(recoveringMaterials||disposed||paused||archiveEntry||!isRecoverableMaterialRequest(pending)||window.navigator?.onLine===false)return;
    recoveringMaterials=true;
    const requestId=pending.requestId;
    try {
      if(busy)await work;
      if(pending?.requestId===requestId&&window.navigator?.onLine!==false)await retryPending();
    } finally {
      recoveringMaterials=false;
    }
  }
  async function reconcilePendingDecision() {
    const waiting=pending;
    if(reconcilingDecision||disposed||paused||window.navigator?.onLine===false||!waiting?.sessionId||
      waiting.sessionId!==view?.id||!(waiting.op==='decide'||waiting.op==='tutorial-step'&&waiting.stepId==='draft'))return;
    reconcilingDecision=true;
    try{
      if(busy)await work;
      if(waiting.requestId===pending?.requestId&&waiting.sessionId===view?.id&&window.navigator?.onLine!==false)
        await perform({op:'resume',sessionId:waiting.sessionId});
    }finally{reconcilingDecision=false;}
  }
  async function sendMessage() {
    if (!active() || busy || pending || paused || needsResume) return;
    const question=guidedQuestion();
    if(view.journeyStage==='example'&&(!question||question.completed))return;
    const value = draftMessage.trim();
    if (!value || value.length>2000) { error=new ReceptionAPIError(value?'input-long':'empty-message');render();return; }
    draftMessage = '';
    await perform({op:'message',sessionId:view.id,text:value,...(question?.prompt===value?{suggestionId:question.id}:{}),requestId:newRequestId(),expectedRevision:view.revision});
  }
  async function changeLocale(value) {
    const chosen = normalizeLocale(value);
    locale = chosen; t = translator(locale); persist(); render();
    if (busy || pending) { requestedLocale=chosen;return; }
    if (view && view.locale !== chosen) await perform({op:'locale',sessionId:view.id,locale:chosen});
    await loadCatalog();
  }
  function handleResponseInput(target,changed=false) {
    if(!correspondenceMode()||!target.matches?.('[data-response-field],[data-response-order-field],[data-response-order-recipient],[data-response-order-citation],[data-response-control-field],[data-response-status-field],[data-response-status-evidence],[data-response-source],[data-response-source-quote]'))return false;
    if(busy||pending||paused)return true;
    if(target.matches('[data-response-control-field],[data-response-status-field],[data-response-status-evidence]')){
      if(view.status!=='followup')return true;
      let action;
      if(target.dataset.responseControlField)action={type:'text',value:target.value};
      else if(target.dataset.responseStatusField)action={type:'status',issueId:target.dataset.issueId,value:target.value};
      else action={type:'evidence',issueId:target.dataset.issueId,sourceId:target.dataset.responseStatusEvidence,selected:target.checked};
      controlDraft=reduceCorrespondenceControl(controlDraft,action);updateDraftStatus();
      if(changed&&action.type!=='text')render();return true;
    }
    if(!active())return true;
    if(target.dataset.responseSource!==undefined){
      const section=target.dataset.responseSource,source=responseSources().find(row=>correspondenceSourceKey(row)===target.value);
      const value=source?.quote||source?.text||'';
      citationSelections[section]={key:target.value,quote:value.length<=4000?value:''};
      const quote=root.querySelector(`[data-response-source-quote="${section}"]`);if(quote)quote.value=citationSelections[section].quote;
      updateDraftStatus();return true;
    }
    if(target.dataset.responseSourceQuote!==undefined){const section=target.dataset.responseSourceQuote;citationSelections[section]={...(citationSelections[section]||{}),quote:target.value};updateDraftStatus();return true;}
    let action;
    if(target.dataset.responseField)action={type:'field',field:target.dataset.responseField,value:target.value};
    else if(target.dataset.responseOrderField)action={type:'order-field',id:target.dataset.orderId,field:target.dataset.responseOrderField,value:target.value};
    else if(target.dataset.responseOrderRecipient)action={type:'order-recipient',id:target.dataset.orderId,recipientId:target.dataset.responseOrderRecipient,selected:target.checked};
    else action={type:'order-citation',id:target.dataset.orderId,citationId:target.dataset.responseOrderCitation,selected:target.checked};
    decisionDraft.correspondence=reduceCorrespondence(decisionDraft.correspondence,action);
    confirmation=false;root.querySelector('.rxa-confirm')?.remove();updateDraftStatus();return true;
  }
  function handleControlIntent(target,{changed=false,click=false}={}) {
    if(!view?.controlWorkflow||view.status!=='followup')return false;
    if(click?!target.closest?.('[data-control-action]'):!target.matches?.('[data-control-field]'))return false;
    const intent=controlWorkspaceIntent(target);
    if(!intent)return true;
    if(intent.type==='ui'){
      controlWorkspaceUI=reduceControlWorkspaceUI(controlWorkspaceUI,intent.action,view.controlWorkflow);
      if(intent.action.type==='material'&&intent.action.materialId)controlMaterialSeen=intent.action.materialId;
      persist();render();
      if(intent.action.type==='material'&&intent.action.materialId){
        const heading=root.querySelector('[data-control-material] h3');
        if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'nearest'});}
      }
      if(intent.action.type==='pane'&&intent.action.pane==='memorandum')root.querySelector('[data-control-memorandum]')?.focus();
      return true;
    }
    if(tutorial()&&!mentorActions()||busy||pending||paused)return true;
    if(intent.type==='action-draft'){
      executionActionDraft=reduceControlActionDraft(executionActionDraft,intent.action,view.controlWorkflow);
      // Blur/change must not detach the next focused text/date field.
      updateDraftStatus();
      if(intent.action.type==='select'||intent.action.type==='clear')controlMissing=false;
      if(intent.action.type!=='field'&&(changed||click))render();
      if(controlMissing&&intent.action.type==='field'){
        const fields=new Set(missingControlActionFields(executionActionDraft,view.controlWorkflow));
        const missing=root.querySelector('[data-control-missing]');
        if(missing){
          // An input update must preserve the focused textarea and pointer target.
          missing.querySelectorAll('[data-field]').forEach(link=>{link.parentElement.hidden=!fields.has(link.dataset.field);});
          missing.hidden=!fields.size;
        }
      }
      if(intent.action.type==='select'){
        const reason=root.querySelector('[data-control-field="reason"]');
        reason?.focus({preventScroll:true});reason?.scrollIntoView({block:'center',behavior:'instant'});
      }
      return true;
    }
    if(intent.type==='choose-recipient'){
      controlRecipientPicker=true;routingSearch='';persist();render();return true;
    }
    if(intent.type==='execute'){
      if(missingControlActionFields(executionActionDraft,view.controlWorkflow).length){
        controlMissing=true;render();root.querySelector('[data-control-missing]')?.scrollIntoView({block:'center',behavior:'instant'});return true;
      }
      controlMissing=false;
      void perform({op:'control-action',sessionId:view.id,requestId:newRequestId(),expectedRevision:view.revision,
        action:controlActionSubmission(executionActionDraft,view.controlWorkflow)});return true;
    }
    return true;
  }
  function handleResponseAction(target) {
    if(!correspondenceMode())return;
    const action=target.dataset.responseAction;
    const result=target.closest('[data-response-result]');
    const row=result?view.result?.cases?.[Number(result.dataset.responseResult)]:null;
    if(action==='print'||action==='download'){
      if(!seminar){
        const exportDocument=action==='print'?printCorrespondence:downloadCorrespondenceHTML;
        exportDocument(responseOptions(row));
      }
      return;
    }
    if(action==='preview'||action==='edit'){
      if(!active())return;
      responsePreview=action==='preview';if(responsePreview&&exampleDraftSeed)examplePreviewed=true;recipientOrderId='';persist();render();return;
    }
    if(action==='sources'||action==='conversation'){
      if(hasCore()&&action==='sources')scrollToCoreRecords();
      else goPage(action==='sources'?'documents':'chat');
      return;
    }
    if(busy||pending||paused||!active())return;
    if(action==='insert-provision'&&hasCore()){
      const result=insertLegalPassage(decisionDraft.correspondence,target.dataset.citationId);
      decisionDraft.correspondence=result.draft;notice=legalPassageMessage(result.status,locale);
      responsePreview=false;confirmation=false;error=null;detailOpen.add('response-legal-passages');
      persist();render();return;
    }
    if(action==='choose-recipient'){recipientOrderId=target.dataset.orderId;routingSearch='';persist();render();return;}
    if(action==='recipient-done'){recipientOrderId='';persist();render();return;}
    if(action==='calendar'){goPage('calendar');return;}
    let update;
    if(action==='add-order')update={type:'order-add'};
    if(action==='remove-order')update={type:'order-remove',id:target.dataset.orderId};
    if(action==='remove-source')update={type:'source-remove',id:target.dataset.citationId};
    if(action==='attach-source'||action==='use-source'){
      const section=target.dataset.section||'facts';
      const key=action==='use-source'?target.dataset.sourceKey:root.querySelector(`[data-response-source="${section}"]`)?.value;
      const source=responseSources().find(row=>correspondenceSourceKey(row)===key);if(!source)return;
      const candidate=source.quote||source.text||'';
      const quote=action==='use-source'?(candidate.length<=4000?candidate:''):root.querySelector(`[data-response-source-quote="${section}"]`)?.value?.trim();
      if(!quote&&hasCore()&&action==='use-source'){notice=t('responseQuoteNeeded');render();return;}
      if(!quote){citationSelections[section]={key,quote:''};detailOpen.add('response-sources-'+section);notice=t('responseQuoteNeeded');responsePreview=false;goPage('decision');root.querySelector(`[data-response-source-quote="${section}"]`)?.focus();return;}
      update={type:'source-add',section,source:{...source,quote}};citationSelections[section]={key:'',quote:''};notice=t('responseAttached');detailOpen.add('response-sources-'+section);
    }
    if(update){decisionDraft.correspondence=reduceCorrespondence(decisionDraft.correspondence,update);responsePreview=false;confirmation=false;error=null;persist();if(action==='use-source'&&!hasCore())goPage('decision');else render();}
  }
  function editDecision(target) {
    const field=target.dataset.decision;if(!field||!active())return;
    if(['actionIds','basisDocumentIds'].includes(field)) {
      const values = new Set(decisionDraft[field]); if(target.checked)values.add(target.value);else values.delete(target.value);decisionDraft[field]=[...values];
    } else if(field==='law.number'||field==='law.article') decisionDraft.law[field.split('.')[1]]=target.value;
    else if(['procedureId','routeId','deadline','reasoning'].includes(field)) decisionDraft[field]=target.value;
    else if(view.case?.assessment&&['assessment.factId','assessment.applicationId','assessment.trapId','assessment.actDate','assessment.calendar.anchor','assessment.calendar.rule','assessment.calendar.start','assessment.calendar.shift','assessment.research.recordId','assessment.research.fragmentId','assessment.research.extracted','assessment.research.finding'].includes(field)){
      const parts=field.split('.');let holder=decisionDraft;
      for(const key of parts.slice(0,-1))holder=holder[key];
      if(field==='assessment.research.recordId'&&holder.recordId!==target.value)holder.fragmentId='';
      holder[parts.at(-1)]=target.value;
    }
    confirmation=false;root.querySelector('.rxa-confirm')?.remove();updateDraftStatus();
    if(view.case?.assessment&&(['actionIds','assessment.research.recordId','assessment.research.fragmentId'].includes(field)||field.startsWith('assessment.calendar.')))render();
  }
  function incompleteDecision() {
    // In the authored bank a blank field is an unanswered item, scored by the
    // server. Confirmation still records that choice without forcing a guess.
    if(correspondenceMode()||view.case?.assessment)return;
    const required=['procedureId','routeId','law.number','law.article','deadline'];
    return required.find(path=>{const value=path.split('.').reduce((v,k)=>v?.[k],decisionDraft);return typeof value!=='string'||!value.trim();});
  }
  const input = event => {
    if(handleControlIntent(event.target))return;
    if(handleResponseInput(event.target))return;
    if(event.target.matches('[data-routing-search]')&&(active()||controlRecipientPicker)){routingSearch=event.target.value.slice(0,120);render();return;}
    if(event.target.matches('[data-mentor-draft]')){mentorDraft=event.target.value;persist();resizeComposer();return;}
    if (event.target.matches('[data-message-draft]')) {draftMessage=event.target.value;resizeComposer();updateDraftStatus();}
    else if(event.target.matches('[data-decision]')&&!['checkbox','radio'].includes(event.target.type))editDecision(event.target);
    else if(event.target.matches('[name=caseSearch]')){caseSearch=event.target.value.slice(0,120);trainingCaseId='';persist();render();}
  };
  const change = event => {
    if(handleControlIntent(event.target,{changed:true}))return;
    if(handleResponseInput(event.target,true))return;
    if(hasCore()&&active()&&event.target.matches('[data-core-registration]:not([data-calendar-input])')){
      if(busy||pending||paused)return;
      calendarState={...calendarState,registrationTimely:event.target.value==='true'};
      decisionDraft.workbook.registrationTimely=calendarState.registrationTimely;
      calendar.update({state:calendarState});persist();updateCoreButton();return;
    }
    if(hasCore()&&!mfcJourney()&&active()&&event.target.matches('[data-core-disposition]')){
      if(busy||pending||paused)return;
      const routing=decisionDraft.workbook.routing;
      routing.disposition=event.target.value;
      if(routing.disposition==='internal')routing.recipientIds=[];
      persist();render();return;
    }
    if(event.target.matches('[data-routing-territory]')&&(active()||controlRecipientPicker)){routingTerritory=event.target.value;render();return;}
    if(event.target.matches('[data-routing-recipient]')&&controlRecipientPicker&&view?.status==='followup'){
      if(busy||pending||paused)return;
      executionActionDraft=reduceControlActionDraft(executionActionDraft,{type:'recipient',recipientId:event.target.value,selected:event.target.checked},view.controlWorkflow);
      persist();render();return;
    }
    if(event.target.matches('[data-routing-recipient]')&&active()&&view.case.workbook){
      if(busy||pending||paused)return;
      if(correspondenceMode()&&recipientOrderId){decisionDraft.correspondence=reduceCorrespondence(decisionDraft.correspondence,{type:'order-recipient',id:recipientOrderId,recipientId:event.target.value,selected:event.target.checked});}
      else{decisionDraft.workbook??=blankWorkbook();const ids=decisionDraft.workbook.routing.recipientIds,limit=view.case.workbook.recipientLimit===2?2:1,id=event.target.value;decisionDraft.workbook.routing.recipientIds=event.target.checked?(limit===1?[id]:[...new Set([...ids,id])].slice(0,limit)):ids.filter(value=>value!==id);}
      if(mfcJourney()&&!recipientOrderId)decisionDraft.workbook.routing.disposition='forward';
      confirmation=false;persist();render();return;
    }
    if(event.target.matches('[data-language]'))void changeLocale(event.target.value);
    else if(event.target.matches('[data-decision]'))editDecision(event.target);
    else if(event.target.matches('[name=mode]')){if(event.target.value==='independent'&&!canIndependent())return;mode=event.target.value;persist();render();}
    else if(event.target.matches('[name=trainingLevel]')){trainingLevel=event.target.value;trainingCaseId='';persist();render();}
    else if(event.target.matches('[name=trainingCaseId]')){trainingCaseId=event.target.value;persist();}
    else if(event.target.matches('[data-followup-choice]')&&view?.status==='followup'){followupDraft=event.target.value;updateDraftStatus();}
  };
  function tutorialComparison() {
    const step=lessonStep(view),answer=lessonAnswer();
    if(step?.page!==page)return '';
    if(step.action==='draft'&&answer)return `<section class="rxt-comparison" data-tutorial-comparison data-tutorial-model><h2>${esc(l('responseModel'))}</h2>
      ${correspondencePreviewView({...responseOptions({decision:answer}),disabled:true,citationPrefix:'rxt-model'})}</section>`;
    if(step.action==='control'&&view.guidance.control){
      const workflow=view.controlWorkflow;
      const record=workflow?controlRecordView({workflow,control:view.guidance.control,caseInfo:view.case,
        sources:view.correspondenceSources,recipients:executionRecipients(workflow),locale}):lessonControlFields({readOnly:true});
      return `<section class="rxt-comparison" data-tutorial-comparison>${record}</section>`;
    }
    return '';
  }
  function showTutorialSample() {
    const step=lessonStep(view), answer=lessonAnswer();
    if(!step||step.page!==page)return;
    let target;
    if((view.journeyStage==='mentor'||hasCore())&&['draft','control'].includes(step.action)){
      sampleComparison=!sampleComparison;target='[data-tutorial-comparison]';
    }else if(step.action==='draft'&&answer){
      decisionDraft=restoreDecision(answer);
      responsePreview=true;examplePreviewed=true;target='[data-correspondence-preview]';
    }else if(step.action==='calendar'&&answer){
      decisionDraft.deadline=answer.deadline||'';
      decisionDraft.workbook=restoreDecision(answer).workbook;
      const date=answer.workbook?.referralDeadline||answer.deadline;
      calendarState={...calendarState,...(date?{month:date.slice(0,7)}:{}),
        selectedDates:{referral:decisionDraft.workbook.referralDeadline,deadline:decisionDraft.deadline},
        registrationTimely:decisionDraft.workbook.registrationTimely};
      target='[data-calendar-workbench]';
    }else if(step.action==='control'&&view.guidance.control){
      controlDraft=restoreCorrespondenceControl(view.guidance.control);
      if(view.controlWorkflow){
        controlWorkspaceUI=reduceControlWorkspaceUI(controlWorkspaceUI,{type:'pane',pane:'memorandum'},view.controlWorkflow);
      }
      controlSampleOpened=true;target=view.controlWorkflow?'[data-control-memorandum]':'[data-correspondence-control]';
    }
    persist();render();
    root.querySelector(target||'#rxtGuideTitle')?.scrollIntoView({block:'start',behavior:'instant'});
  }
  async function chooseTutorialStep(payload) {
    const step=lessonStep(view);
    const fromGuidedChat=page==='chat'&&guidedQuestion()?.completed;
    if(!step||(page!==step.page&&!fromGuidedChat)||payload.choiceId&&!step.choices.some(choice=>choice.id===payload.choiceId))return;
    await perform({op:'tutorial-step',sessionId:view.id,requestId:newRequestId(),expectedRevision:view.revision,stepId:step.id,...payload});
    if(error||pending)return;
    const focus=root.querySelector('[data-core-heading], #rxtGuideTitle');
    focus?.focus({preventScroll:true});focus?.scrollIntoView({block:'nearest',behavior:'instant'});
  }
  async function saveCoreCitationsForReply() {
    const payload=corePayload('materials');
    if(!payload){
      notice='';error=new ReceptionAPIError('core-citation-required');
      goCore('materials');
      const missing=root.querySelector('[data-core-citation-missing]')?.closest('.rxt-legal-act')?.querySelector('[data-normative-doc]');
      missing?.scrollIntoView({block:'center'});missing?.focus({preventScroll:true});
      return false;
    }
    const confirmed=()=>sameCoreCitations(payload.citations,view?.coreSteps?.values?.citations);
    if(confirmed()){
      coreCitationsEdited=false;
      return true;
    }
    const sessionId=view.id,caseId=view.case.id;
    await perform({op:tutorial()?'tutorial-step':'core-step',sessionId,stepId:'materials',requestId:newRequestId(),
      expectedRevision:view.revision,...payload},{backgroundMaterials:true});
    if(disposed||paused||busy||pending||!active()||view.id!==sessionId||view.case.id!==caseId||
      page!=='decision'||coreInView()!=='draft')return false;
    const code=String(error?.code||'').replaceAll('_','-');
    if(['invalid-citation','core-citation-required'].includes(code)||!error&&view.guidance?.finding?.stepId==='materials'){
      goCore('materials');return false;
    }
    if(error)return false;
    if(confirmed())return true;
    error=new ReceptionAPIError('core-citation-required');goCore('materials');
    return false;
  }
  async function submitCoreDecision() {
    if(coreInView()!=='draft')return;
    const draft=decisionDraft.correspondence;
    const missing=[['subject',draft.subject],...Object.entries(draft.sections).map(([id,value])=>['sections.'+id,value])]
      .find(([,value])=>!value.trim());
    if(missing){
      notice='';error=new ReceptionAPIError('core-draft-incomplete');responsePreview=false;render();
      const field=root.querySelector(`[data-response-field="${missing[0]}"]`);
      field?.scrollIntoView({block:'center'});field?.focus({preventScroll:true});return;
    }
    if(coreCitationsEdited&&!await saveCoreCitationsForReply())return;
    const decision=clone(decisionDraft);
    if(view.case.workbook?.calendarVersion===MFC_CALENDAR_WITHOUT_REGISTRATION)
      delete decision.workbook.registrationTimely;
    if(mentorWork('draft'))await chooseTutorialStep({decision});
    else if(!tutorial())await perform({op:'decide',sessionId:view.id,expectedRevision:view.revision,decision,requestId:newRequestId()});
  }
  async function sendMentorQuestion() {
    if(!inMentorChat()||busy||pending||paused||needsResume)return;
    const question=mentorDraft.trim();
    if(!question)return;
    const issues=view.controlWorkflow?.issues||[];
    const issue=mentorReturnPage==='decision'?issues.find(item=>item.id===controlWorkspaceUI.issueId):null;
    mentorDraft='';
    await perform({op:'mentor-question',sessionId:view.id,requestId:newRequestId(),expectedRevision:view.revision,text:question,
      workspacePage:mentorReturnPage,...(issue?{issueId:issue.id}:{})});
  }
  const submit = event => {
    if(event.target.matches('[data-mentor-form]')){event.preventDefault();void sendMentorQuestion();return;}
    if(event.target.matches('[data-chat-form]')){event.preventDefault();void sendMessage();}
    if(event.target.matches('[data-decision-form]')){
      event.preventDefault();if(busy||pending||paused||!active())return;
      if(hasCore()){void submitCoreDecision();return;}
      if(mentorWork('draft')){void chooseTutorialStep({decision:clone(decisionDraft)});return;}
      if(tutorial())return;
      const missing=incompleteDecision();
      if(missing){error=new ReceptionAPIError('incomplete-decision');if(missing==='deadline')goPage('calendar');else render();const field=root.querySelector(`[data-decision="${missing}"]`);for(let details=field?.closest('details');details;details=details.parentElement?.closest('details'))details.open=true;field?.focus();field?.scrollIntoView({block:'center',behavior:'instant'});return;}
      error=null;confirmation=true;render();root.querySelector('#rxaConfirmTitle')?.focus();
    }
    if(event.target.matches('[data-followup-form]')){
      event.preventDefault();if(busy||pending||paused||view?.status!=='followup')return;
      if(mentorWork('control-memo')){void chooseTutorialStep({control:correspondenceControlSubmission(controlDraft)});return;}
      if(tutorial())return;
      if(correspondenceMode()){void perform({op:'followup',sessionId:view.id,requestId:newRequestId(),expectedRevision:view.revision,control:correspondenceControlSubmission(controlDraft)});return;}
      if(!(view.followup?.options||[]).some(o=>o.id===followupDraft)){error=new ReceptionAPIError('choose-followup');render();root.querySelector('[data-followup-choice]')?.focus();return;}
      void perform({op:'followup',sessionId:view.id,requestId:newRequestId(),choiceId:followupDraft});
    }
  };
  const keydown = event => {
    if(event.target.matches('[data-mentor-draft]')&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void sendMentorQuestion();return;}
    if(event.target.matches('[data-message-draft]')&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void sendMessage();}
    if(event.target.matches('[role=tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();const tabs=['documents','sources'];let index=tabs.indexOf(tab);
      index=event.key==='Home'?0:event.key==='End'?1:(index+1)%2;reader.close();tab=tabs[index];persist();render();root.querySelector(`#rxaTab-${tab}`)?.focus();
    }
  };
  const click = async event => {
    if(handleControlIntent(event.target,{click:true}))return;
    const citationLink=event.target.closest('[data-response-citation-link]');
    if(citationLink&&root.contains(citationLink)){
      event.preventDefault();
      const id=citationLink.getAttribute('href').slice(1);
      const source=document.getElementById(id);
      if(source&&citationLink.closest('[data-correspondence-preview]')?.contains(source)){
        source.scrollIntoView({block:'nearest'});source.focus({preventScroll:true});
      }
      return;
    }
    const responseTarget=event.target.closest('[data-response-action]');
    if(responseTarget&&root.contains(responseTarget)&&!responseTarget.disabled&&!disposed){handleResponseAction(responseTarget);return;}
    const target=event.target.closest('[data-action]');if(!target||!root.contains(target)||target.disabled||disposed)return;
    const action=target.dataset.action;
    if(action==='open-history'&&seminar&&!historyScreen&&!paused&&ownerNow()===owner){
      persist();reader.close();illustrationViewer.destroy();
      historyScreen={rows:[],nextCursor:null,controller:new AbortController()};
      void readHistory();
      root.querySelector('#rxaHistoryTitle')?.focus({preventScroll:true});return;
    }
    if(action==='close-history'&&historyScreen){
      historyScreen.controller.abort();historyScreen=null;archiveEntry=null;render();
      root.querySelector('[data-action="open-history"]')?.focus({preventScroll:true});return;
    }
    if(action==='close-archive'){
      archiveEntry=null;render();root.querySelector('#rxaHistoryTitle')?.focus({preventScroll:true});return;
    }
    if(historyScreen){
      if(action==='more-history'&&historyScreen.nextCursor)await readHistory({cursor:historyScreen.nextCursor});
      if(action==='retry-history'&&historyScreen.error)await readHistory(historyScreen.error);
      if(action==='open-history-entry'&&historyScreen.rows.some(row=>row.id===target.dataset.id))
        await readHistory({id:target.dataset.id});
      return;
    }
    if(action==='mentor-open-chat'&&mentorAvailable()){
      goPage('chat',{dialog:'mentor'});root.querySelector('#rxaMentorDialog')?.focus({preventScroll:true});return;
    }
    if(action==='mentor-dismiss-welcome'&&mentorAvailable()){
      mentorWelcomeSeen=true;persist();render();root.querySelector(`[data-focus="nav-${page}"]`)?.focus({preventScroll:true});return;
    }
    if(action==='chat-dialog'&&mentorAvailable()&&page==='chat'){
      const dialog=target.dataset.chatDialog;
      if(['citizen','mentor'].includes(dialog)&&dialog!==chatDialog)goPage('chat',{dialog});
      return;
    }
    if(action==='mentor-return'&&inMentorChat()){
      const destination=mentorReturnPage;goPage(destination);
      root.querySelector(`[data-focus="nav-${destination}"]`)?.focus({preventScroll:true});return;
    }
    if(action==='mentor-retry-question'&&inMentorChat()&&!busy&&!pending){
      await perform({op:'resume',sessionId:view.id});
      if(!error)await sendMentorQuestion();return;
    }
    if(action==='guide-jump'){
      const heading=root.querySelector('#rxtGuideTitle');
      heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start',behavior:'instant'});return;
    }
    if(action==='control-field'){
      const selectors={recipientIds:'[data-control-action="choose-recipient"]',evidenceSourceIds:'[data-control-field="evidenceSourceIds"], .rxe-evidence'};
      const name=target.dataset.field;
      if(!['reason','instruction','dueDate','expectedResult','recipientIds','evidenceSourceIds'].includes(name))return;
      const scope=root.querySelector('[data-control-composer]');
      const field=scope?.querySelector(selectors[name]||`[data-control-field="${name}"]`);
      if(field){if(field.matches('fieldset'))field.tabIndex=-1;field.focus({preventScroll:true});field.scrollIntoView({block:'center',behavior:'instant'});}
      return;
    }
    if(action==='control-jump'){
      const sections={materials:'.rxe-materials h3',actions:'.rxe-action-tools h3',memorandum:'[data-control-memorandum]'};
      const heading=root.querySelector(sections[target.dataset.section]||'.rxe-workspace-intro');
      if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'start',behavior:'instant'});}
      return;
    }
    if(action==='control-recipient-done'){controlRecipientPicker=false;persist();render();return;}
    if(action==='exit'){persist();options.onExit?.();return;}
    if(action==='illustration-open'&&view){
      const illustration=caseIllustrations(view.case.id,view.documents||[]).find(item=>item.id===target.dataset.id);
      illustrationViewer.open(illustration,{locale,trigger:target});return;
    }
    if(action==='choose-case'&&seminar){reader.close();choosingCase=true;persist();render();return;}
    if(action==='close-case-picker'){choosingCase=false;persist();render();return;}
    if(action==='core-go'&&hasCore()){goCore(target.dataset.step);return;}
    if(action==='core-records'&&hasCore()){scrollToCoreRecords();return;}
    if(action==='core-sources'&&hasCore()){goCore('materials');return;}
    if(action==='example-law-passage'&&acceptsTwoCoreCitations()&&page==='documents'&&coreInView()==='materials'&&active()&&!busy&&!pending&&!paused){
      const key=target.dataset.passage;
      if(Object.hasOwn(complaintExamplePassages,key))
        await reader.openDocument('reception-law59999',target,'',{unitId:complaintExamplePassages[key]});
      return;
    }
    if(action==='example-question'&&guidedQuestion()&&!guidedQuestion().completed){
      draftMessage=guidedQuestion().prompt;
      persist();render();
      const field=root.querySelector('[data-message-draft]');
      field?.focus();field?.setSelectionRange(draftMessage.length,draftMessage.length);
      return;
    }
    if(action==='core-opening'&&hasCore()){
      const step=coreCurrent();
      if(step==='reception'&&tutorial()){
        if(guidedQuestion()&&!guidedQuestion().completed){goPage('chat');return;}
        if(!busy&&!pending&&!paused){
          await chooseTutorialStep({choiceId:'role'});
          if(coreCurrent()==='materials')scrollToCoreRecords();
        }
      }else if(step==='materials')scrollToCoreRecords();
      else goCore(step);
      return;
    }
    if(action==='registration-check'&&registrationWritable()&&typeof calendarState.registrationTimely==='boolean'){
      await perform({op:'registration-check',sessionId:view.id,requestId:newRequestId(),expectedRevision:view.revision,
        registrationTimely:calendarState.registrationTimely});
      return;
    }
    if(action==='remove-core-citation'&&hasCore()&&active()&&!busy&&!pending&&!paused&&page==='documents'&&coreInView()==='materials'){
      removeCoreCitation(target.dataset.id);return;
    }
    if(action==='core-step'&&hasCore()&&active()){
      const stepId=target.dataset.step;
      if(busy||pending||paused||stepId!==coreInView()||page!==CORE_PAGES[stepId])return;
      const payload=corePayload(stepId);if(!payload)return;
      await perform({op:tutorial()?'tutorial-step':'core-step',sessionId:view.id,stepId,requestId:newRequestId(),expectedRevision:view.revision,...payload});
      return;
    }
    if(action==='page'){
      const requestedPage=target.dataset.page;
      if(choosingCase)return;
      if(hasCore()){
        const requestedStep={documents:'materials',calendar:'calendar',route:'route'}[requestedPage];
        if(requestedStep&&active()&&(requestedStep===coreCurrent()||coreIsEditable(requestedStep))){
          goCore(requestedStep);return;
        }
        if(requestedPage!==CORE_PAGES[coreEdit]&&(requestedPage!=='chat'||!mentorAvailable()))leaveCoreEdit();
      }
      goPage(requestedPage);return;
    }
    if(action==='chat'){goPage('chat');return;}
    if(action==='continue'){goPage(active()?'chat':'decision');return;}
    if(action==='tab'||action==='workspace'){
      const selected=target.dataset.tab||target.dataset.panel;
      if(!['documents','sources','decision'].includes(selected))return;
      if(hasCore()&&selected==='documents'){reader.close();selectedDoc='';scrollToCoreRecords();return;}
      if(hasCore()&&selected==='sources'){goCore('materials');return;}
      reader.close();selectedDoc='';tab=selected;goPage(selected==='decision'?'decision':'documents');return;
    }
    if(action==='edit-section'){const section=target.dataset.section;if(!['facts','routing','actions','law','research','trap','calendar'].includes(section))return;const key='assessment-'+section;detailOpen.add(key);const details=root.querySelector(`[data-details="${key}"]`);if(details){details.open=true;details.querySelector('input,select,textarea')?.focus({preventScroll:true});details.scrollIntoView({block:'start',behavior:'instant'});}persist();return;}
    if(action==='focus-omission'&&confirmation&&!busy&&!pending){focusOmission(target.dataset.section);return;}
    if(action==='cancel-confirm'){confirmation=false;render();return;}
    if(action==='documents-list'){selectedDoc='';persist();render();return;}
    if((action==='document'||action==='document-mark')&&view&&(view.documents||[]).some(doc=>doc.id===target.dataset.id)){
      reader.close();
      selectedDoc=target.dataset.id;tab='documents';mobilePane='desk';page=hasCore()?'reception':'documents';
      if(active()&&!(view.openedDocumentIds||[]).includes(selectedDoc))deferredDocuments.add(selectedDoc);
      persist();render();
      const focusRecord=()=>{
        const heading=root.querySelector('[data-core-records] .rxa-document h3');
        if(!heading)return;
        heading.tabIndex=-1;
        heading.focus({preventScroll:true});
        const article=heading.closest('.rxa-document');
        const anchor=article && article.getBoundingClientRect().height<window.innerHeight*0.65 ? article : heading;
        anchor.scrollIntoView({block:'center',behavior:'instant'});
      };
      if(hasCore())focusRecord();
      const opened=selectedDoc;
      await registerDocuments();
      if(hasCore()&&page==='reception'&&selectedDoc===opened)focusRecord();
      return;
    }
    if(busy||paused||recoverBusy)return;
    if(action==='load-catalog'){await loadCatalog();return;}
    if(action==='recover'){await recoverSession();return;}
    if(action==='resume-session'&&!pending){
      await perform({op:'resume',sessionId:target.dataset.id},{openSaved:true});return;
    }
    if(action==='remove-reference'&&active()){selectedReferences=selectedReferences.filter(item=>item.id!==target.dataset.id);persist();render();return;}
    if(action==='use-reference'&&!gameplayContext&&active()){const reference=selectedReferences.find(item=>item.id===target.dataset.id);if(reference){applyReference(reference);render();}return;}
    if(action==='retry'&&pending){await retryPending();return;}
    if(action==='refresh'){const sessionId=view?.id||initial?.sessionId;if(sessionId)await perform({op:'resume',sessionId});return;}
    if(!seminar&&action==='related-training'&&view?.status==='complete'&&!pending){
      const caseId=target.dataset.caseId;
      if(!(view.learningReview?.related||[]).some(item=>item.id===caseId)||!catalog.some(item=>item.id===caseId))return;
      persist();clearSessionDraft();mode='training';trainingCaseId=caseId;trainingLevel='';caseSearch='';persist();render();
      root.querySelector('[name="trainingCaseId"]')?.scrollIntoView({block:'center',behavior:'instant'});return;
    }
    if(action==='new-session'||action==='clear-session') {
      if(view&&view.status!=='complete')return;
      clearSessionDraft();render();return;
    }
    if(pending)return;
    if(action==='move-action'&&active()&&view.case?.assessment){
      const index=decisionDraft.actionIds.indexOf(target.dataset.id),destination=index+(target.dataset.direction==='up'?-1:1);
      if(index<0||destination<0||destination>=decisionDraft.actionIds.length)return;
      [decisionDraft.actionIds[index],decisionDraft.actionIds[destination]]=[decisionDraft.actionIds[destination],decisionDraft.actionIds[index]];
      confirmation=false;error=null;persist();render();return;
    }
    if(action==='research-fragment'&&active()&&view.case?.assessment){
      const record=view.case.assessment.research.records.find(r=>r.id===target.dataset.record);
      if(!record?.fragments.some(f=>f.id===target.dataset.fragment))return;
      decisionDraft.assessment.research.recordId=record.id;decisionDraft.assessment.research.fragmentId=target.dataset.fragment;
      tab='decision';mobilePane='desk';page='decision';detailOpen.add('assessment-research');confirmation=false;persist();render();root.querySelector('[data-decision="assessment.research.extracted"]')?.focus({preventScroll:true});root.querySelector('[data-details="assessment-research"]')?.scrollIntoView({block:'start',behavior:'instant'});return;
    }
    if(action==='start-journey'&&seminar){
      const journeyStage=target.dataset.stage;
      if(journeyStage!=='example'&&!seminarProgress.exampleCompleted||
        journeyStage==='independent'&&(!seminarProgress.mentorCompleted||!canIndependent()))return;
      const mode=journeyStage==='independent'?'independent':'training';
      await perform({op:'start',studentKey:backend?.getProfile?.()?.studentKey||options.studentKey,mode,journeyStage,locale,...(coreStepsVersion?{coreStepsVersion}:{}),...(seminarStoryVersion?{seminarStoryVersion}:{}),requestId:newRequestId()});return;
    }
    if(action==='tutorial-sample'&&tutorial()){showTutorialSample();return;}
    if(action==='tutorial-choice'&&tutorial()){await chooseTutorialStep({choiceId:target.dataset.choice});return;}
    if(action==='mentor-check-action'&&mentorActions()){await chooseTutorialStep({confirmOwn:true});return;}
    if(action==='mentor-use-sample'&&(!hasCore()||view.journeyStage==='mentor')&&(mentorWork('draft')||mentorWork('control-memo')||mentorActions())){
      await chooseTutorialStep({useExample:true});return;
    }
    if(action==='mentor-open-work'){
      if(mentorActions()){
        controlWorkspaceUI=reduceControlWorkspaceUI(controlWorkspaceUI,{type:'pane',pane:'work'},view.controlWorkflow);
        persist();render();
        const actions=root.querySelector('.rxe-action-tools h3');
        if(actions){actions.tabIndex=-1;actions.focus({preventScroll:true});actions.scrollIntoView({block:'start',behavior:'instant'});}
        return;
      }
      if(mentorWork('control-memo')&&view.controlWorkflow){
        controlWorkspaceUI=reduceControlWorkspaceUI(controlWorkspaceUI,{type:'pane',pane:'memorandum'},view.controlWorkflow);
        persist();render();
      }else if(mentorWork('draft')&&responsePreview){responsePreview=false;persist();render();}
      const field=root.querySelector(mentorWork('draft')?'[data-response-field="subject"]':'[data-control-memorandum], [data-response-control-field="text"]');
      field?.focus({preventScroll:true});field?.scrollIntoView({block:'center',behavior:'instant'});return;
    }
    if(action==='start') {
      if(mode==='independent'&&!canIndependent())return;
      await perform({op:'start',studentKey:backend?.getProfile?.()?.studentKey||options.studentKey||undefined,mode,locale,...(mode==='training'&&!seminar?{...(trainingCaseId?{caseId:trainingCaseId}:{}),...(trainingLevel?{level:Number(trainingLevel)}:{})}:{}),requestId:newRequestId()});return;
    }
    if(action==='confirm-decision'&&!tutorial()&&active()&&confirmation){
      const decision=clone(decisionDraft), citation=selectedReferences[0];
      if(!correspondenceMode()&&gameplayContext&&citation&&decision.workbook){
        const {docId,unitIds,text}=citation;
        decision.workbook.legalCitation={docId,unitIds,text};
      }
      await perform({op:'decide',sessionId:view.id,decision,requestId:newRequestId()});return;
    }
    if(action==='next'&&view?.status==='review'){await perform({op:'next',sessionId:view.id,requestId:newRequestId()});}
  };
  const toggle = event => {if(historyScreen||archiveEntry)return;const node=event.target;if(!node.matches?.('details[data-details]')||!root.contains(node))return;if(node.open)detailOpen.add(node.dataset.details);else detailOpen.delete(node.dataset.details);persist();};
  const identity = () => {if(ownerNow()!==owner){
    persist();historyScreen?.controller.abort();historyScreen=null;archiveEntry=null;
    error=new ReceptionAPIError('identity-changed');paused=true;render();
  }};
  const reconnect = () => {void recoverPendingMaterials();void reconcilePendingDecision();};
  const visibility = () => {
    if(disposed||document.hidden)return;
    if(page==='chat'){markChatRead();persist();render();}
    reconnect();
  };
  root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('submit',submit);root.addEventListener('keydown',keydown);root.addEventListener('click',click);
  root.addEventListener('toggle',toggle,true);
  window.addEventListener('rudn:identitychange',identity);
  window.addEventListener('pagehide',persist);window.addEventListener('pageshow',reconnect);
  window.addEventListener('online',reconnect);document.addEventListener('visibilitychange',visibility);
  window.addEventListener('resize',updateViewport);visualViewport?.addEventListener('resize',updateViewport);
  visualViewport?.addEventListener('scroll',updateViewport);
  root.addEventListener('focusin',updateViewport);root.addEventListener('focusout',updateViewport);
  updateAdapter = createUpdateAdapter({module:'reception',root,signal:lifetime.signal,diagnostics:options.diagnostics,
    getIdentity:()=>({owner,attemptId:view?.id||'reception-ai-start'}),isBusy:()=>busy||recoverBusy||!!pending||reader.isOpen(),
    pause:async value=>{paused=value;await work;},
    capture:()=>({version:VERSION,locale,tab,selectedDoc,mobilePane,page,chatDialog,view:captureUpdateView(root)}),
    checkpoint:async()=>{await work;if(!persist())throw Error('update/not-durable');return {durable:true,revision:view?.revision||0,checkpointRef:{id:view?.id||'reception-ai-start',revision:view?.revision||0,version:VERSION}};},
    restore:async({state:saved,checkpointRef},{signal}={})=>{
      if(saved.version!==VERSION||checkpointRef.id!==(view?.id||'reception-ai-start'))return {status:'blocked',code:'incompatible'};
      tab=saved.tab;
      selectedDoc=saved.selectedDoc;
      page=workspacePages.includes(saved.page)?saved.page:'reception';
      if(saved.chatDialog==='mentor'||saved.chatDialog==='citizen')chatDialog=saved.chatDialog;
      mobilePane=page==='chat'?'chat':'desk';
      render();
      await restoreUpdateView(root,saved.view,{signal});
      return {status:'restored',code:'ok'};
    },
  });
  const cleanup = () => {
    if(disposed)return Promise.resolve();persist();disposed=true;historyScreen?.controller.abort();clearTimeout(waitingTimer);updateAdapter?.destroy();tour.destroy();reader.destroy();calendar.destroy();media.destroy();illustrationViewer.destroy();lifetime.abort();options.signal?.removeEventListener('abort',stop);
    owners.delete(presentationToken);if(!owners.size){body.classList.remove('reception-immersive');presentationOwners.delete(body);}
    root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('submit',submit);root.removeEventListener('keydown',keydown);root.removeEventListener('click',click);
    root.removeEventListener('toggle',toggle,true);
    window.removeEventListener('rudn:identitychange',identity);
    window.removeEventListener('pagehide',persist);window.removeEventListener('pageshow',reconnect);
    window.removeEventListener('online',reconnect);document.removeEventListener('visibilitychange',visibility);
    window.removeEventListener('resize',updateViewport);visualViewport?.removeEventListener('resize',updateViewport);
    visualViewport?.removeEventListener('scroll',updateViewport);
    root.removeEventListener('focusin',updateViewport);root.removeEventListener('focusout',updateViewport);
    return Promise.resolve();
  };
  Object.assign(cleanup,{module:'reception',flush:async()=>{await work;persist();},refreshLocale:changeLocale,getLocale:()=>locale,
    prepareForUpdate:value=>updateAdapter.prepareForUpdate(value),resumeAfterUpdate:value=>updateAdapter.resumeAfterUpdate(value),
    cancelPreparation:value=>updateAdapter.cancelPreparation(value),commitPreparation:()=>updateAdapter.commitPreparation()});
  lifetime.signal.addEventListener('abort',cleanup,{once:true});
  render();
  const catalogTask=loadCatalog();
  if(initial?.sessionId){
    restoring=true;render();await perform({op:'resume',sessionId:initial.sessionId});
    // Separate older guided journeys from the story journey while allowing
    // pre-journey correspondence sessions to resume in their own workspace.
    const resumedJourney=view&&(isLesson(view.journeyStage)||view.coreStepsVersion);
    if(resumedJourney&&seminarStoryVersion&&view.seminarStoryVersion!==seminarStoryVersion&&!pending){
      persist();clearSessionDraft();await recoverSession(null,{quiet:true});
    }
    if(view)await recoverPendingMaterials();
    if(view&&view.locale!==locale&&!pending)await changeLocale(locale);
  }
  else {
    if(pending?.op==='start'&&seminarStoryVersion&&pending.seminarStoryVersion!==seminarStoryVersion)clearSessionDraft();
    if(!pending)await recoverSession(null,{quiet:true});
  }
  await catalogTask;
  return cleanup;
}
