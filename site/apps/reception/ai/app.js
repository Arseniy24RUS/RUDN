import {createReceptionAPI, newRequestId, ReceptionAPIError} from './api-client.js';
import {localized, normalizeLocale, translator} from './copy.js';
import './workspace-copy.js';
import {icon} from './cabinet-icons.js';
import {createReceptionStorage} from './session-storage.js';
import {calendarWorkbenchView, createCalendarWorkbench, sourceLinkView, normativeActsView, referenceView, referenceDecisionPatch} from './workbench.js';
import {learningReviewView, workRecordView} from './learning-review.js';
import {characterMedia, createMessengerMedia} from './media.js';
import {caseIllustrations, createIllustrationViewer, illustratedDocumentText, renderIllustrationThumbnails} from './illustrations.js';
import {createSourceReader} from '../js/source-reader.js';
import {gameCopy} from '../localization/game-copy.js';
import {authorityPickerView,routingOriginView,authoritySelectionLabel} from './authority-picker.js';
import {caseTimelineView,workbookSummaryView,workbookFeedbackView} from './workbook.js';
import {createUpdateAdapter, captureUpdateView, restoreUpdateView} from '../../../assets/js/platform-update-state.js';
import {resourceURL, getReleaseContext} from '../../../assets/js/release-resources.js';

const VERSION = 'reception-ai-ui-v1';
const presentationOwners = new WeakMap();
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clone = value => JSON.parse(JSON.stringify(value));
const workspacePages = ['reception','chat','documents','calendar','decision'];
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
  return base;
}
const safeURL = value => {
  try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
};
const documentImage = value => typeof value==='string'&&/^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/.test(value)
  ? resourceURL('../'+value,import.meta.url).href : '';
export function loadAIStyle() {
  const id = 'rudn-reception-ai-style-v6';
  if (!document.getElementById(id)) {
    const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet';
    link.href = new URL('./style.css', import.meta.url).href; document.head.append(link);
    for(const href of ['./workbench.css','./learning-review.css','./cabinet.css','./authority-picker.css','./workbook.css','../source-reader.css','./illustrations.css']){const extraStyle=document.createElement('link');extraStyle.rel='stylesheet';extraStyle.href=new URL(href,import.meta.url).href;document.head.append(extraStyle);}
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
  const illustrationViewer = createIllustrationViewer(root);
  const ownerNow = () => String(backend?.getProfile?.()?.studentKey || backend?.user?.uid || options.studentKey || 'local-demo');
  const owner = ownerNow();
  const storageKey = `rudn.reception.ai.v1:${encodeURIComponent(owner)}:${options.context || 'course'}:${options.period || 'current'}:${encodeURIComponent(config.endpoint || '')}`;
  let locale = normalizeLocale(options.locale || options.getLocale?.() || document.documentElement.lang);
  let t = translator(locale), view = null, busy = false, disposed = false, paused = false, operation = '', error = null;
  let pending = null, draftMessage = '', decisionDraft = blankDecision(), tab = 'documents', selectedDoc = '', mode = 'training';
  let routingSearch='',routingTerritory='ru-77';
  let confirmation = false, storageOkay = true, savedCaseId = '', restoring = false, requestedLocale = null, work = Promise.resolve();
  let completedNotified = '', updateAdapter = null, needsResume = false, pendingAt = null, mobilePane = 'desk';
  let enteringMessages = new Set(), lastPendingRenderedId = '';
  let chatScroll = {top:0,bottom:true}, followupDraft='';
  let detailOpen = new Set();
  let page='reception', calendarState={}, selectedReferences=[], readMessageIds=new Set(), pageScroll={}, savedSessionId='';
  let catalog=[], catalogLoading=false, catalogError=false, trainingLevel='', trainingCaseId='', caseSearch='';
  let notice='', recoverBusy=false;
  let calendar;

  const visualViewport = window.visualViewport;
  const media = createMessengerMedia(root, {signal:lifetime.signal});
  let store;
  try { store = options.storage || globalThis.localStorage; } catch { storageOkay = false; }
  const release=getReleaseContext(),buildId=release?.retention==='current-only'?release.buildId:'';
  const drafts=createReceptionStorage({store,owner,endpoint:config.endpoint||'',legacyKey:storageKey,version:VERSION,buildId});
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
    if(Number.isFinite(saved.pendingAt))pendingAt=saved.pendingAt;
    if(saved.chatScroll&&Number.isFinite(saved.chatScroll.top))chatScroll={top:Math.max(0,saved.chatScroll.top),bottom:saved.chatScroll.bottom!==false};
    if(['training','independent'].includes(saved.mode))mode=saved.mode;
    followupDraft=typeof saved.followupDraft==='string'?saved.followupDraft:'';
    detailOpen=new Set(Array.isArray(saved.detailOpen)?saved.detailOpen.filter(x=>typeof x==='string'):[]);
    pending=saved.pending&&['start','message','document','decide','followup','next'].includes(saved.pending.op)&&typeof saved.pending.requestId==='string'?saved.pending:null;
    calendarState=saved.calendarState&&typeof saved.calendarState==='object'?saved.calendarState:{};
    selectedReferences=Array.isArray(saved.selectedReferences)?saved.selectedReferences.filter(x=>x&&typeof x.id==='string'&&typeof x.text==='string').slice(0,20):[];
    readMessageIds=new Set(Array.isArray(saved.readMessageIds)?saved.readMessageIds.filter(x=>typeof x==='string'):[]);
    pageScroll=saved.pageScroll&&typeof saved.pageScroll==='object'?saved.pageScroll:{};
    trainingLevel=['1','2','3'].includes(String(saved.trainingLevel))?String(saved.trainingLevel):'';
    trainingCaseId=typeof saved.trainingCaseId==='string'?saved.trainingCaseId:'';
    caseSearch=typeof saved.caseSearch==='string'?saved.caseSearch.slice(0,120):'';
  }
  restoreSaved(initial);
  const getToken = options.getIdToken || (backend?.getReceptionIdToken ? arg => backend.getReceptionIdToken(arg) : null);
  const api = createReceptionAPI({endpoint:config.endpoint, getIdToken:getToken, demo:config.demo === true,
    fetch:options.fetch || globalThis.fetch, signal:lifetime.signal, timeoutMs:config.timeoutMs || 60000,buildId,context:gameplayContext,workbookVersion:config.workbookVersion??(config.demo?undefined:2)});
  const reader = createSourceReader(root, {signal:lifetime.signal, locale:() => locale,
    presentation:'embedded', getContainer:()=>root.querySelector('[data-source-reader-host]'),
    beforeOpen:()=>{if(page!=='documents'||selectedDoc){selectedDoc='';goPage('documents');}},
    canSelect:()=>active()&&!paused&&!(busy&&operation==='decide')&&pending?.op!=='decide',
    onSelect:reference=>{
      if(!active())return;
      selectedReferences=gameplayContext?[reference]:[reference,...selectedReferences.filter(item=>item.id!==reference.id)].slice(0,20);
      notice=t(gameplayContext?'citationAdded':'referenceAdded');
      if(gameplayContext){detailOpen.add('assessment-legal-citation');reader.close();goPage('decision');}else if(view.case.workbook?.version>=2){reader.close();persist();goPage('documents');}else{applyReference(reference);goPage('decision');}
    }});
  calendar=createCalendarWorkbench(root,{state:calendarState,locale,signal:lifetime.signal,
    onChange:state=>{calendarState=state;if(active()&&view.case?.workbook){decisionDraft.workbook??=blankWorkbook();decisionDraft.workbook.referralDeadline=state.selectedDates?.referral||'';decisionDraft.deadline=state.selectedDates?.deadline||'';decisionDraft.workbook.registrationTimely=state.registrationTimely===true;confirmation=false;}persist();},
    onUseDate:(date,{target='deadline'}={})=>{if(!active())return;if(target==='referral'&&view.case?.workbook){decisionDraft.workbook??=blankWorkbook();decisionDraft.workbook.referralDeadline=date;}else decisionDraft.deadline=date;confirmation=false;notice=t('deadlineAdded');persist();render();}});

  const text = value => localized(value, locale);
  const authoredText = value => gameCopy(text(value), locale);
  // The assessment's material fragment describes the case; its other fragments can quote laws.
  const researchText = fragment => (fragment.id === 'material' ? authoredText : text)(fragment.text);
  const active = () => view?.status === 'active';
  const canIndependent = () => gameplayContext!=='free' && (config.demo === true || (!backend?.isAdmin?.() && options.context !== 'free'
    && (typeof options.assessmentAllowed === 'function' ? options.assessmentAllowed() : options.assessmentAllowed !== false)
    && Boolean(backend?.getProfile?.()?.studentKey || options.studentKey)));
  const button = (label, action, {primary=false, quiet=false, disabled=false, extra='', glyph=''} = {}) =>
    `<button type="button" class="rxa-btn ${primary?'primary':''} ${quiet?'quiet':''}" data-action="${esc(action)}" ${disabled?'disabled':''} ${extra}>${glyph?icon(glyph):''}${esc(label)}</button>`;
  function persist() {
    const log=root.querySelector('.rxa-messages');
    if(log?.clientHeight>0&&log.dataset.caseId===view?.case?.id)chatScroll={top:log.scrollTop,bottom:log.scrollHeight-log.scrollTop-log.clientHeight<50};
    const content=root.querySelector('.rxa-page-content');
    if(content?.dataset.page===page)pageScroll[page]=content.scrollTop;
    storageOkay=drafts.save({version:VERSION,owner,sessionId:view?.id||initial?.sessionId||'',caseId:view?.case?.id||savedCaseId,
      caseTitle:view?.case?.title||initial?.caseTitle||'',status:view?.status||initial?.status||'',
      mode:view?.mode||mode,locale,draftMessage,decisionDraft,followupDraft,detailOpen:[...detailOpen],tab,selectedDoc,pending,pendingAt,mobilePane,chatScroll,
      page,calendarState,selectedReferences,readMessageIds:[...readMessageIds],pageScroll,trainingLevel,trainingCaseId,caseSearch});
    return storageOkay;
  }
  function incomingMessages() {
    const messages=view?.messages||[];
    return messages.length?messages.filter(m=>m.role==='assistant'):view?.case?.opening?[{id:'opening'}]:[];
  }
  function unreadCount() {return incomingMessages().filter(m=>!readMessageIds.has(m.id)).length;}
  function markChatRead() {if(page==='chat'&&!document.hidden)for(const message of incomingMessages())readMessageIds.add(message.id);}
  function goPage(next) {
    if(!workspacePages.includes(next)||next!=='reception'&&!view)return;
    illustrationViewer.destroy();persist();if(next!=='documents')reader.close();page=next;mobilePane=page==='chat'?'chat':'desk';confirmation=false;
    if(page==='decision')tab='decision';else if(page==='documents'&&tab==='decision')tab='documents';
    markChatRead();persist();render();
  }
  function applyReference(reference) {
    const patch=referenceDecisionPatch(reference);
    // A new citation must not inherit an article or date from a different act.
    // Ambiguous fields remain empty for the student's own selection.
    decisionDraft.law={number:patch.law?.number||'',article:patch.law?.article||''};
    if(decisionDraft.assessment)decisionDraft.assessment.actDate=patch.actDate||'';
    detailOpen.add('assessment-law');confirmation=false;persist();
  }
  function clearSessionDraft() {
    routingSearch='';routingTerritory='ru-77';view=null;initial=null;pending=null;error=null;notice='';needsResume=false;draftMessage='';decisionDraft=blankDecision();followupDraft='';
    detailOpen.clear();savedCaseId='';savedSessionId='';selectedDoc='';confirmation=false;tab='documents';mobilePane='desk';page='reception';
    pendingAt=null;lastPendingRenderedId='';calendarState={};selectedReferences=[];readMessageIds.clear();pageScroll={};drafts.clearCurrent();
    if(mode==='independent'&&!canIndependent())mode='training';
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
      const results=await Promise.allSettled(modes.map(mode=>api.recover({studentKey:backend?.getProfile?.()?.studentKey||options.studentKey,mode})));
      const candidates=results.filter(result=>result.status==='fulfilled'&&result.value).map(result=>result.value)
        .filter(candidate=>!buildId||candidate.buildId===buildId);
      const timestamp=value=>Number(value)||Date.parse(value)||0;
      const recovered=candidates.sort((a,b)=>timestamp(b.updatedAt||b.startedAt)-timestamp(a.updatedAt||a.startedAt))[0]||null;
      if(!recovered&&results.some(result=>result.status==='rejected'))throw results.find(result=>result.status==='rejected').reason;
      if(disposed||ownerNow()!==owner)return;
      if(recovered){persist();const saved=drafts.readSession(recovered.id);view=null;initial=null;if(saved)restoreSaved(saved);acceptView(recovered,{op:'recover'});page='reception';error=null;notice='';needsResume=false;}
      else if(!quiet)notice=t('noSavedSession');
    }catch(problem){if(problem.code!=='cancelled'&&!quiet)notice=t('recoveryLimited');}
    finally{recoverBusy=false;if(!disposed){persist();render();}}
  }

  function errorText(problem) {
    const code = String(problem?.code || '').toLowerCase().replaceAll('_','-');
    if(code==='case-bank-exhausted')return t('caseBankExhausted');
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
    const context=view?`${t('caseNumber',{number})}${status?' · '+status:''}`:'';
    return `<div class="rxa-page-heading"><h1>${esc(label)}</h1>${context?`<p class="rxa-case-status">${esc(context)}</p>`:''}</div>`;
  }
  function header() {
    const settings=config.demo||options.showLanguageSelector?`<details class="rxa-cabinet-settings" data-details="cabinet-settings"><summary aria-label="${esc(t('settings'))}" title="${esc(t('settings'))}">${icon('menu')}</summary><div class="rxa-settings-panel"><label><span>${esc(t('language'))}</span><select class="rxa-locale" data-language data-focus="language" aria-label="${esc(t('language'))}">${[['ru','RU'],['en','EN'],['zh','中文']].map(([id,label])=>`<option value="${id}" ${locale===id?'selected':''}>${label}</option>`).join('')}</select></label></div></details>`:'';
    return `<header class="rxa-top"><div class="rxa-brand"><span class="rxa-brand-mark">${icon('reception')}</span><div class="rxa-brand-copy"><strong>${esc(t('cabinet'))}</strong></div></div><div class="rxa-top-actions">${settings}${options.onExit?`<button class="rxa-back" type="button" data-action="exit" aria-label="${esc(t('back'))}" title="${esc(t('back'))}">${icon('exit')}</button>`:''}</div></header>`;
  }
  function alerts() {
    const lines = [];
    if (error || pending && !busy) lines.push(`<section class="rxa-alert" role="alert">${icon('info')}<div><p>${esc(error?errorText(error):t('pending'))}</p><div class="rxa-actions">${pending?button(t('retry'),'retry',{disabled:busy}):view || initial?.sessionId?button(t('refresh'),'refresh',{disabled:busy}):''}${error && !view && !pending?button(t('newSession'),'clear-session',{disabled:busy}):''}</div></div></section>`);
    if (!storageOkay) lines.push(`<div class="rxa-alert" role="status">${icon('info')}<p>${esc(t('storageError'))}</p></div>`);
    if(notice)lines.push(`<div class="rxa-notice" role="status">${icon('check')}<span>${esc(notice)}</span></div>`);
    return lines.join('');
  }
  function trainingSetup() {
    const filtered=catalog.filter(item=>(!trainingLevel||String(item.level)===trainingLevel)&&(!caseSearch||authoredText(item.title).toLocaleLowerCase(locale).includes(caseSearch.toLocaleLowerCase(locale))));
    const rows=filtered.map(item=>`<option value="${esc(item.id)}" ${trainingCaseId===item.id?'selected':''}>${esc(authoredText(item.title))}${item.level?` · ${esc(t('level'+item.level))}`:''}</option>`).join('');
    return `<section class="rxa-setup" aria-labelledby="rxaSetupTitle"><div class="rxa-section-heading"><span class="rxa-eyebrow">${esc(t('trainingCases'))}</span><h2 id="rxaSetupTitle">${esc(t('chooseFormat'))}</h2></div><fieldset class="rxa-mode-options"><legend class="rxa-sr">${esc(t('chooseFormat'))}</legend>${[['training',true],...(gameplayContext==='free'?[]:[['independent',canIndependent()]])].map(([id,enabled])=>`<label class="rxa-mode-choice ${mode===id?'selected':''} ${!enabled?'unavailable':''}"><input type="radio" name="mode" value="${id}" ${mode===id?'checked':''} ${!enabled?'disabled':''}><span><strong>${esc(t(id))}</strong><small>${esc(t(seminar?id+'SeminarHint':id+'Hint'))}</small></span>${icon(id==='training'?'sources':'decision')}</label>`).join('')}</fieldset>${gameplayContext!=='free'&&!canIndependent()?`<p class="rxa-availability">${esc(t('independentUnavailable'))}</p>`:''}${mode==='training'&&!seminar?`<div class="rxa-training-controls"><h3>${esc(t('trainingSetup'))}</h3><label class="rxa-field"><span>${esc(t('trainingLevel'))}</span><select name="trainingLevel" data-focus="training-level"><option value="">${esc(t('anyLevel'))}</option>${[1,2,3].map(level=>`<option value="${level}" ${trainingLevel===String(level)?'selected':''}>${esc(t('level'+level))}</option>`).join('')}</select></label><label class="rxa-field"><span>${esc(t('caseSearch'))}</span><input type="search" name="caseSearch" data-focus="case-search" value="${esc(caseSearch)}" placeholder="${esc(t('caseSearchHint'))}" maxlength="120" autocomplete="off"></label><label class="rxa-field full"><span>${esc(t('trainingCase'))}</span><select name="trainingCaseId" data-focus="training-case"><option value="">${esc(t('randomCase'))}</option>${rows}</select></label><p class="rxa-catalog-status" role="status">${esc(catalogLoading?t('catalogLoading'):catalogError?t('catalogUnavailable'):filtered.length?t('catalogCount',{count:filtered.length}):t('noCaseMatch'))}</p>${catalogError?button(t('catalogRetry'),'load-catalog',{quiet:true}):''}</div>`:''}<div class="rxa-start-row">${button(t(mode==='training'?'startTraining':'startIndependent'),'start',{primary:true,disabled:busy||!!pending||recoverBusy,glyph:'arrow'})}${button(t('recoverSession'),'recover',{quiet:true,disabled:busy||!!pending||recoverBusy})}</div></section>`;
  }
  function help() {
    return `<details class="rxa-help" data-details="help"><summary>${icon('info')}<span>${esc(t('howToWork'))}</span>${icon('chevron')}</summary><div>${[['talk','helpChat'],['docs','helpDocuments'],['calendar','helpCalendar'],['decision','helpDecision']].map(([glyph,key])=>`<p>${icon(glyph)}<span>${esc(t(key))}</span></p>`).join('')}</div></details>`;
  }
  function scene(citizen,caseId) {
    const appearance=characterMedia(caseId,citizen?.portrait);
    return `<div class="rxa-foyer-scene"><div class="rxa-citizen-stage" data-rxa-actor="${esc(appearance.actorId)}" aria-label="${esc(text(citizen?.name)||t('citizen'))}"><img class="rxa-citizen-poster" src="${esc(appearance.poster)}" alt="${esc(text(citizen?.name)||t('citizen'))}"></div></div>`;
  }
  function savedSessions() {
    const rows=drafts.recent().filter(item=>item.id!==view?.id&&item.status!=='complete');
    return !rows.length?'':`<details class="rxa-help" data-details="saved-sessions"><summary>${icon('talk')}<span>${esc(t('savedSessions'))}</span><span>${rows.length}</span></summary><div class="rxa-saved-sessions">${rows.map(item=>`<article><div><strong>${esc(authoredText(item.title))}</strong><small>${esc(t(item.mode==='independent'?'independent':'training'))}</small></div>${button(t('resumeSession'),'resume-session',{disabled:busy||!!pending||recoverBusy,extra:`data-id="${esc(item.id)}"`})}</article>`).join('')}</div></details>`;
  }
  function landing() {
    return `<div class="rxa-foyer rxa-foyer-landing"><section class="rxa-welcome"><span class="rxa-eyebrow">${esc(t('welcome'))}</span><h1>${esc(t('hero'))}</h1><p>${esc(t('welcomeHint'))}</p></section><div class="rxa-foyer-grid">${scene(null,'')}${trainingSetup()}</div>${savedSessions()}${help()}</div>`;
  }
  function reception() {
    const c=view.case||{};
    return `<div class="rxa-foyer">${caseHeading(t('reception'),t(active()?'caseActive':'decisionReady'))}<div class="rxa-foyer-grid">${scene(c.citizen,c.id)}<section class="rxa-active-reception"><h2 class="rxa-visitor-name">${esc(text(c.citizen?.name)||t('citizen'))}</h2><p class="rxa-visitor-description">${esc(authoredText(c.citizen?.description)||t('applicant'))}</p><p class="rxa-presence"><span aria-hidden="true"></span>${esc(t(active()?'awaitingReply':'decisionReady'))}</p>${caseTimelineView(c.workbook,{locale})}${routingOriginView(c.workbook,{locale})}<div class="rxa-actions">${!active()?button(t('continueDecision'),'continue',{primary:true,glyph:'arrow'}):''}${button(t('caseMaterials'),'workspace',{quiet:true,extra:'data-panel="documents"',glyph:'docs'})}</div></section></div><details class="rxa-case-brief" data-details="case-brief"><summary>${icon('info')}<span>${esc(t('currentTask'))}</span>${icon('chevron')}</summary><div class="rxa-case-brief-body"><h3>${esc(authoredText(c.title))}</h3><div class="rxa-case-meta">${!seminar&&c.level?`<span>${esc(t('level'+c.level))}</span>`:''}${c.estimatedMinutes?`<span>${esc(t('minutes',{count:c.estimatedMinutes}))}</span>`:''}</div><strong>${esc(authoredText(c.role?.title))}</strong><p>${esc(authoredText(c.role?.text))}</p><p class="rxa-persist-hint">${icon('cloud')}${esc(t('preservedSession'))}</p></div></details>${help()}<details class="rxa-exercise-picker" data-details="exercise-picker"><summary>${icon('sources')}<span>${esc(t('newTraining'))}</span>${icon('chevron')}</summary>${trainingSetup()}</details>${savedSessions()}</div>`;
  }

  function messageTime(at) {
    if (at === null || at === undefined) return '';
    const date = new Date(at); if (!Number.isFinite(date.getTime())) return '';
    return `<time datetime="${date.toISOString()}" title="${esc(new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(date))}">${esc(new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hour12:false}).format(date))}</time>`;
  }
  function messageMarkup(message, pendingMessage=false, illustrationMarkup='') {
    const outgoing=message.role==='user', fresh=enteringMessages.has(message.id)||pendingMessage&&lastPendingRenderedId!==message.id;
    const status=pendingMessage?(busy?t('sendingMessage'):t('awaitingDelivery')):t('sent');
    const opening=message.role==='assistant'&&message.id===`opening-${view.case?.id}`;
    return `<article class="rxa-message ${outgoing?'user':'assistant'} ${fresh?'rxa-message-enter':''} ${pendingMessage?'rxa-message-pending':''}" data-message-id="${esc(message.id)}" ${pendingMessage?'data-pending-message':''}><span class="rxa-sr">${esc(outgoing?t('you'):text(view.case?.citizen?.name)||t('citizen'))}</span><div class="rxa-bubble"><p>${esc(opening ? authoredText(message.text) : text(message.text))}</p>${illustrationMarkup}<footer class="rxa-message-meta">${messageTime(message.at)}${outgoing?`<span class="rxa-delivery" data-delivery-state="${pendingMessage?'pending':'sent'}" aria-label="${esc(status)}" title="${esc(status)}">${pendingMessage?`<span class="rxa-delivery-clock" aria-hidden="true"></span><span>${esc(status)}</span>`:icon('checks')}</span>`:''}</footer></div></article>`;
  }
  function conversation() {
    const c=view.case||{}, citizen=c.citizen||{}, messages=Array.isArray(view.messages)?view.messages:[];
    const appearance=characterMedia(c.id,citizen.portrait), opening=authoredText(c.opening);
    const items=!messages.length&&opening?[{id:'opening',role:'assistant',text:opening}]:messages;
    const waiting=pending?.op==='message'&&pending.sessionId===view.id&&!items.some(m=>m.id===`${pending.requestId}-user`);
    const typing=busy&&operation==='message', status=typing?t('typing'):error||needsResume?t('connectionPaused'):active()?t('available'):t('conversationClosed');
    const day=items[0]?.at?new Date(items[0].at):null;
    const dateLabel=day&&Number.isFinite(day.getTime())?new Intl.DateTimeFormat(locale,{day:'numeric',month:'long'}).format(day):t('conversation');
    const illustrations=renderIllustrationThumbnails(caseIllustrations(c.id,view.documents||[]),{locale});
    return `<section class="rxa-conversation" id="rxaConversation" aria-label="${esc(t('chat'))}"><header class="rxa-person"><div class="rxa-person-info"><div class="rxa-person-heading"><img class="rxa-avatar" src="${esc(appearance.avatar)}" alt=""><div><h2>${esc(text(citizen.name)||t('citizen'))}</h2><p class="rxa-presence ${typing?'typing':''} ${error||needsResume?'paused':''}" aria-live="polite"><span aria-hidden="true"></span>${esc(status)}</p></div></div></div><details class="rxa-chat-menu" data-details="chat-menu"><summary aria-label="${esc(t('receptionInfo'))}" title="${esc(t('receptionInfo'))}">${icon('menu')}</summary><div class="rxa-chat-menu-panel"><strong>${esc(authoredText(c.role?.title))}</strong><p>${esc(authoredText(c.role?.text))}</p>${button(t('caseMaterials'),'workspace',{quiet:true,extra:'data-panel="documents"',glyph:'docs'})}</div></details></header><div class="rxa-messages" data-case-id="${esc(c.id)}" role="log" aria-label="${esc(t('reviewChat'))}" aria-live="polite" aria-relevant="additions text"><div class="rxa-chat-date">${esc(dateLabel)}</div>${items.map((message,index)=>messageMarkup(message,false,index===0?illustrations:'')).join('')}${waiting?messageMarkup({id:`pending-${pending.requestId}`,role:'user',text:pending.text,at:pendingAt},true):''}${typing?`<div class="rxa-typing" data-typing role="status"><span class="rxa-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(t('typing'))}</span></div>`:''}</div>${active()?`<form class="rxa-compose" data-chat-form><div class="rxa-composer-box"><label class="rxa-sr" for="rxaMessage">${esc(t('messageLabel'))}</label><textarea id="rxaMessage" data-message-draft data-focus="message" placeholder="${esc(t('messagePlaceholder'))}" maxlength="2000" rows="1" ${paused?'disabled':''}>${esc(draftMessage)}</textarea><button class="rxa-send" type="submit" aria-label="${esc(t('send'))}" title="${esc(t('send'))}" ${busy||pending||paused||needsResume?'disabled':''}>${icon('send')}</button></div><div class="rxa-compose-actions"><small>${esc(t('enterHint'))}</small><small data-message-count aria-hidden="true">${draftMessage.length?`${draftMessage.length} / 2000`:''}</small></div></form>`:`<div class="rxa-fixed">${icon('check')}<span>${esc(t('fixed'))}</span></div>`}</section>`;
  }
  function documents(reading=false) {
    const docs=view.documents||[],opened=view.openedDocumentIds||[];
    const selected=docs.find(d=>d.id===selectedDoc);
    if(!reading)return !docs.length?`<p class="rxa-empty">${esc(t('noDocuments'))}</p>`:`<div class="rxa-document-list">${docs.map(d=>`<button type="button" class="rxa-document-button" data-action="document" data-id="${esc(d.id)}" ${busy||pending||paused||!active()&&!opened.includes(d.id)?'disabled':''}>${icon('docs')}<span><strong>${esc(authoredText(d.title))}</strong><small>${esc(opened.includes(d.id)?t('documentOpened'):t('openDocument'))}</small></span></button>`).join('')}</div>`;
    if(!selected||!opened.includes(selected.id))return '';
    const gallery=renderIllustrationThumbnails(caseIllustrations(view.case?.id,[selected]),{locale});
    const illustration=gallery?'':documentImage(selected.image),external=gameplayContext?'':safeURL(selected.url);
    return `<article class="rxa-document"><p class="rxa-doctype">${esc(authoredText(selected.type))}</p><h3>${esc(authoredText(selected.title))}</h3>${selected.sensitive?`<p class="rxa-document-sensitive">${icon('lock')}${esc(t('restrictedMaterial'))}</p>`:''}${gallery}${illustration?`<img class="rxa-document-image" src="${esc(illustration)}" alt="${esc(authoredText(selected.title))}" loading="lazy">`:''}<div class="rxa-document-body">${esc(authoredText(illustratedDocumentText(view.case?.id,selected,locale)))}</div>${external?`<div class="rxa-source-links">${sourceLinkView({url:external,locale,className:'rxa-btn'})}</div>`:''}</article>`;
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
  function calendarTask(){return view?.case?.workbook?{...view.case.workbook,hideEventList:true,eventListIds:['recipientRegistered'],autoCommit:true,internalSources:Boolean(gameplayContext)}:undefined;}
  function calendarPage() {
    const c=view.case||{},a=c.assessment,d=decisionDraft;
    const locked=!active()||paused||(busy&&operation==='decide')||pending?.op==='decide';
    if(c.workbook)return `<section class="rxa-panel" id="rxaCalendarPanel" aria-labelledby="rxaPage-calendar">${caseHeading(t('calendar'))}${calendarWorkbenchView({state:calendarState,task:calendarTask(),locale,disabled:locked})}<div class="rxa-calendar-footer"><small class="rxa-save-note" data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small>${button(t('openDecision'),'page',{quiet:true,extra:'data-page="decision"',glyph:'arrow'})}</div></section>`;
    return `<section class="rxa-panel" id="rxaCalendarPanel" aria-labelledby="rxaPage-calendar">${caseHeading(t('calendar'),t('calendarTask'))}${!active()?`<p class="rxa-fixed">${icon('lock')}<span>${esc(t('calendarReadOnly'))}</span></p>`:''}${calendarWorkbenchView({state:calendarState,events:a?.calendar?.events||[],date:c.date,locale,disabled:locked,rulesMarkup:calendarRulesMarkup()})}<details class="rxa-calendar-task" data-details="calendar-task"><summary>${icon('info')}<span>${esc(t('calendarTask'))}</span>${icon('chevron')}</summary><div>${c.date?`<p class="rxa-calendar-case-date"><span>${esc(t('caseDate'))}</span><time datetime="${esc(c.date)}">${esc(humanDate(c.date))}</time></p>`:''}<p>${esc(authoredText(c.deadlinePrompt)||t('calendarHint'))}</p></div></details><details class="rxa-calendar-manual" data-details="calendar-manual"><summary>${icon('edit')}<span>${esc(t('calendarManual'))}</span>${icon('chevron')}</summary><fieldset class="rxa-fieldset rxa-calendar-deadline"><legend>${esc(t('calendarDraftDate'))}</legend><div class="rxa-fields"><label class="rxa-field"><span>${esc(t('deadline'))}</span><input type="date" data-decision="deadline" data-focus="deadline" value="${esc(d.deadline)}" autocomplete="off" ${locked?'disabled':''}></label></div></fieldset></details><div class="rxa-calendar-footer"><small class="rxa-save-note" data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small>${button(t('openDecision'),'page',{quiet:true,extra:'data-page="decision"',glyph:'arrow'})}</div></section>`;
  }
  function decision() {
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
    const f=view.followup||{},locked=busy||pending||paused;
    return `<section class="rxa-panel rxa-followup" role="tabpanel" id="rxaPanel" aria-labelledby="rxaPage-decision"><p class="rxa-eyebrow">${esc(t('fixed'))}</p><h2>${esc(t('followupTitle'))}</h2><p class="rxa-followup-intro">${esc(authoredText(f.intro))}</p><form data-followup-form><fieldset class="rxa-fieldset"><legend>${esc(t('followupQuestion'))}</legend>${(f.options||[]).map(option=>`<label class="rxa-choice"><input type="radio" name="rxa-followup" data-followup-choice data-focus="followup-${esc(option.id)}" value="${esc(option.id)}" ${followupDraft===option.id?'checked':''} ${locked?'disabled':''}><span>${esc(authoredText(option.label))}</span></label>`).join('')}</fieldset><div class="rxa-decision-footer"><small data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small><button class="rxa-btn primary" type="submit" ${locked?'disabled':''}>${icon('check')}${esc(t('followupSubmit'))}</button></div></form><details class="rxa-assessment-block" data-details="fixed-decision"><summary>${esc(t('submittedDecision'))}</summary><div class="rxa-assessment-content"><p><strong>${esc(t('procedure'))}:</strong> ${esc(authoredText(view.case.procedures.find(p=>p.id===decisionDraft.procedureId)?.label))}</p><p><strong>${esc(t('route'))}:</strong> ${esc(view.case.workbook?authoritySelectionLabel(decisionDraft.workbook?.routing,{locale}):authoredText(view.case.routes.find(p=>p.id===decisionDraft.routeId)?.label))}</p><ul class="rxa-fixed-actions">${decisionDraft.actionIds.map(id=>`<li>${esc(authoredText(view.case.actions.find(a=>a.id===id)?.label))}</li>`).join('')}</ul>${view.case.workbook?.version>=2?'':`<p><strong>${esc(t('law'))}:</strong> ${esc(decisionDraft.law.number)} · ${esc(decisionDraft.assessment?.actDate||'')} · ${esc(decisionDraft.law.article)}</p>`}<p><strong>${esc(t('deadline'))}:</strong> ${esc(decisionDraft.deadline)}</p><p class="rxa-fixed-reasoning">${esc(decisionDraft.reasoning)}</p></div></details></section>`;
  }
  function feedbackMarkup(feedback) {
    if (!feedback) return '';
    const evidenceIssueKeys = {selection:'evidenceSelection', unopened:'evidenceUnopened', fact:'evidenceFact'};
    const evidenceIssue = evidenceIssueKeys[feedback.evidenceIssue];
    const binary = view.context==='seminar';
    const labelKeys = {research:'legalCitation',procedure:'procedure',route:'route',routing:'route',actions:'actionsCriterion',law:'lawCriterion',deadline:'deadlineCriterion',evidence:'evidence',facts:'factsCriterion'};
    return `${workbookFeedbackView(feedback,{locale,training:view.mode==='training',internalSources:Boolean(gameplayContext)})}<div class="rxa-score"><strong>${esc(binary?(Math.abs(feedback.score-100)<1e-8?1:0):feedback.score ?? '')}</strong><span>/ ${binary?1:100}</span></div><table class="rxa-criteria"><thead><tr><th>${esc(t('criteria'))}</th><th>${esc(t('earned'))}</th></tr></thead><tbody>${(feedback.criteria||[]).map(row=>`<tr><td>${esc(gameplayContext&&row.id==='research'?t('legalCitation'):text(row.label)||t(labelKeys[row.id]||row.id))}</td><td>${esc(binary?t(row.earned===row.max?'criterionMet':'criterionReview'):row.earned+' / '+row.max)}</td></tr>`).join('')}</tbody></table><p class="rxa-explanation">${esc(text(feedback.explanation))}</p>${evidenceIssue?`<p class="rxa-explanation">${esc(t(evidenceIssue))}</p>`:''}${Array.isArray(feedback.missingFacts)&&feedback.missingFacts.length?`<p class="rxa-explanation">${feedback.missingFacts.map(f=>esc(text(f))).join('\n')}</p>`:''}`;
  }
  function review() {
    return `<section class="rxa-panel rxa-review"><div class="rxa-review-icon">${icon('check')}</div><h2>${esc(t(view.feedback?'reviewTitle':'fixed'))}</h2>${view.feedback?feedbackMarkup(view.feedback):`<p class="rxa-panel-intro">${esc(t('reviewHidden'))}</p>`}${seminar?'':learningReviewView({view,catalog,locale})}${workRecordView({view,decision:decisionDraft,references:selectedReferences,locale})}<div class="rxa-review-footer">${button(t(Number(view.caseIndex)+1<Number(view.caseCount)?'next':'finish'),'next',{primary:true,disabled:busy||!!pending,glyph:'arrow'})}</div></section>`;
  }
  function documentsPage() {
    const reading=selectedDoc&&(view.openedDocumentIds||[]).includes(selectedDoc);
    const notes=selectedReferences.length?`<details class="rxa-assessment-block" data-details="source-notes"><summary>${esc(t('sourceNotes'))} · ${selectedReferences.length}</summary><div class="rxa-assessment-content">${selectedReferences.map(reference=>referenceView(reference,{locale,removable:active(),internalOnly:Boolean(gameplayContext)})).join('')}</div></details>`:'';
    return `<div class="rxa-desk" id="rxaDesk">${caseHeading(t('documents'))}<div data-source-reader-host></div><div class="rxa-documents-library">${reading?`<div class="rxa-material-reader">${button(t('allDocuments'),'documents-list',{quiet:true,glyph:'arrow'})}${documents(true)}</div>`:`<section class="rxa-document-group"><h2>${esc(t('caseMaterials'))}</h2>${documents()}</section><section class="rxa-document-group"><h2>${esc(t('legalMaterials'))}</h2>${sources()}</section>${notes}`}</div></div>`;
  }
  function workspace() {
    if(view.status==='complete'&&['reception','decision'].includes(page))return complete();
    if(page==='reception')return reception();
    if(page==='chat')return `<div class="rxa-chat-page">${conversation()}</div>`;
    if(page==='documents')return `<div class="rxa-documents-page">${documentsPage()}</div>`;
    if(page==='calendar')return `<div class="rxa-calendar-page"><div class="rxa-desk" id="rxaDesk">${calendarPage()}</div></div>`;
    return `<div class="rxa-decision-page"><div class="rxa-desk" id="rxaDesk">${view.status==='review'?review():view.status==='followup'?followup():decision()}</div></div>`;
  }
  function navigation() {
    const count=unreadCount();
    return `<nav class="rxa-mobile-nav" aria-label="${esc(t('workplace'))}">${[['reception','reception'],['chat','talk'],['documents','docs'],['calendar','calendar'],['decision','decision']].map(([id,glyph])=>`<button type="button" id="rxaPage-${id}" data-action="page" data-page="${id}" data-focus="nav-${id}" aria-current="${page===id?'page':'false'}" ${!view&&id!=='reception'?'disabled':''}><span class="rxa-nav-icon">${icon(glyph)}${id==='chat'&&count?`<span class="rxa-unread" data-chat-unread aria-label="${esc(t('unread',{count}))}">${count}</span>`:''}</span><span>${esc(t(id))}</span></button>`).join('')}</nav>`;
  }

  function complete() {
    const result = view.result;
    if (!result) return `<section class="rxa-complete"><h1>${esc(t('complete'))}</h1><p class="rxa-panel-intro">${esc(t('noResult'))}</p>${button(t('refresh'),'refresh',{primary:true,disabled:busy})}</section>`;
    const journal = result.journalStatus === 'saved' ? 'journalSaved' : ['local','not-applicable'].includes(result.journalStatus) || view.mode === 'training' || view.provider === 'mock' ? 'journalLocal' : 'journalPending';
    return `<section class="rxa-complete"><div class="rxa-complete-head"><p class="rxa-eyebrow">${esc(t('complete'))}</p><h1>${esc(t(Number.isInteger(result.seminarPoints)?'seminarTotal':'totalScore'))}</h1><div class="rxa-score"><strong>${esc(result.seminarPoints??result.points)}</strong><span>${esc(t('outOf'))} ${esc(seminar&&view.mode==='training'?1:result.maxPoints ?? 5)}</span></div>${Number.isInteger(result.seminarPoints)?`<p>${esc(t('casePoints',{count:result.points}))}</p>`:''}<p class="rxa-journal" role="status">${esc(t(journal))}</p>${journal==='journalPending'?`<div class="rxa-actions">${button(t('journalRetry'),'refresh',{disabled:busy})}</div>`:''}</div>${Array.isArray(result.cases)&&result.cases.length?`<h2>${esc(t('casesReview'))}</h2>${result.cases.map((row,index)=>`<details class="rxa-case-review" data-details="result-${index}"><summary>${index+1}. ${esc(authoredText(row.title))} · ${esc(view.context==='seminar'?t('casePoints',{count:Math.abs(row.score-100)<1e-8?1:0}):row.score+' / 100')}</summary>${feedbackMarkup(row.feedback)}</details>`).join('')}`:''}${learningReviewView({view,catalog,locale})}${workRecordView({view,decision:decisionDraft,references:selectedReferences,locale})}<div class="rxa-actions">${button(t(view.mode==='training'?'oneMore':'newSession'),'new-session',{primary:true,disabled:busy||result.remainingCases===0,glyph:'arrow'})}${options.onExit?button(t('back'),'exit',{}):''}</div></section>`;
  }
  function render({scrollChat=false} = {}) {
    if (disposed) return;
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.dataset?.focus;
    const selection = focused && 'selectionStart' in focused ? [focused.selectionStart,focused.selectionEnd] : null;
    const log = root.querySelector('.rxa-messages');
    if(log && log.clientHeight>0 && log.dataset.caseId===view?.case?.id)chatScroll={top:log.scrollTop,bottom:log.scrollHeight-log.scrollTop-log.clientHeight<50};
    const scroll=chatScroll;
    if(root.dataset.caseId===(view?.case?.id||''))for(const el of root.querySelectorAll('details[data-details]')){if(el.open)detailOpen.add(el.dataset.details);else detailOpen.delete(el.dataset.details);}
    const sameRenderedCase=root.dataset.sessionId===(view?.id||'')&&root.dataset.caseId===(view?.case?.id||'');
    const resetReceptionScroll=Boolean(view&&!sameRenderedCase&&page==='reception');
    root.classList.add('reception-ai-root','rxa-cabinet'); root.setAttribute('lang',locale); root.setAttribute('aria-busy',String(busy)); root.dataset.mobilePane=mobilePane;root.dataset.page=page;
    root.dataset.sessionStatus=view?.status||'setup';
    root.dataset.sessionId=view?.id||'';root.dataset.caseId=view?.case?.id||'';
    const oldContent=root.querySelector('.rxa-page-content');if(sameRenderedCase&&oldContent?.dataset.page===page)pageScroll[page]=oldContent.scrollTop;
    if(resetReceptionScroll)pageScroll.reception=0;
    markChatRead();
    root.innerHTML = header() + navigation() + `<main class="rxa-page-content" data-page="${page}">`+alerts() + (restoring?`<div class="rxa-loading" role="status"><div class="rxa-spinner" aria-hidden="true"></div>${esc(t('loading'))}</div>`:!view?landing():workspace())+'</main>';
    const content=root.querySelector('.rxa-page-content');if(content)content.scrollTop=Number(pageScroll[page])||0;
    calendar.update({state:calendarState,task:calendarTask(),rulesMarkup:calendarRulesMarkup(),events:view?.case?.assessment?.calendar?.events||[],date:view?.case?.date,locale,disabled:!active()||paused||pending?.op==='decide'||busy&&operation==='decide'});
    reader.refresh?.();media.refresh();
    updateViewport();
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
      if(scrollChat)chatScroll={top:nextLog.scrollTop,bottom:true};
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
    const field=root.querySelector('[data-message-draft]');if(!field)return;
    field.style.height='auto';field.style.height=Math.min(144,Math.max(46,field.scrollHeight))+'px';
    const counter=root.querySelector('[data-message-count]');if(counter)counter.textContent=draftMessage.length?`${draftMessage.length} / 2000`:'';
  }
  function updateDraftStatus() {
    persist();for(const note of root.querySelectorAll('[data-save-note]'))note.textContent=t(storageOkay?'savedDraft':'storageError');
    for(const hint of root.querySelectorAll('[data-outline-summary]'))hint.textContent=sectionHint(hint.dataset.outlineSummary);
  }
  function acceptView(next, body) {
    const previousCase = view?.case?.id || savedCaseId;
    const sameCase = (view?.id||savedSessionId)===next.id && previousCase === next.case?.id;
    const previousIds=new Set(view?.messages?.map(m=>m.id)||[]);
    enteringMessages=new Set(['start','message','next'].includes(body.op)?(next.messages||[]).filter(m=>!previousIds.has(m.id)&&!(m.id===`${body.requestId}-user`&&lastPendingRenderedId===`pending-${body.requestId}`)).map(m=>m.id):[]);
    view = next; mode = next.mode || mode; confirmation = false;
    if (!sameCase) { illustrationViewer.destroy();routingSearch='';routingTerritory='ru-77';decisionDraft = blankDecision(); followupDraft='';detailOpen=new Set();draftMessage = ''; selectedDoc = ''; tab = 'documents'; mobilePane='desk';page='reception';chatScroll={top:0,bottom:true};calendarState={};selectedReferences=[];readMessageIds.clear();pageScroll={}; }
    if (next.decision && next.status !== 'active') decisionDraft = restoreDecision(next.decision,!!next.case?.assessment);
    if (body.op === 'document') {selectedDoc = body.documentId; tab='documents'; mobilePane='desk';page='documents';}
    if (body.op === 'decide'||body.op==='followup') {mobilePane='desk';tab='decision';page='decision';}
    if (body.op === 'start') { decisionDraft = blankDecision(); draftMessage = ''; selectedDoc = ''; tab = 'documents';page='reception';calendarState={};selectedReferences=[];readMessageIds.clear();pageScroll={}; }
    // A pending action can finish after the student has opened a source. Keep
    // that reader only for the same case and its Sources page; otherwise its
    // previous selection and scroll lock must not enter the next workspace.
    if(!sameCase||page!=='documents'||body.op==='document')reader.close();
    if(next.case?.assessment)decisionDraft=restoreDecision(decisionDraft,true);else delete decisionDraft.assessment;
    if(next.case?.workbook){decisionDraft.workbook??=blankWorkbook();calendarState={...calendarState,selectedDates:{referral:decisionDraft.workbook.referralDeadline,deadline:decisionDraft.deadline},registrationTimely:decisionDraft.workbook.registrationTimely};}else delete decisionDraft.workbook;
    savedSessionId=next.id;savedCaseId = next.case?.id || '';markChatRead();
    if (next.status === 'complete' && next.result?.attemptId && completedNotified !== next.result.attemptId) {
      completedNotified = next.result.attemptId;
      options.onComplete?.({attemptId:next.result.attemptId,journalStatus:next.result.journalStatus});
      root.dispatchEvent(new CustomEvent('reception-ai:complete',{bubbles:true,detail:{attemptId:next.result.attemptId,journalStatus:next.result.journalStatus}}));
    }
  }
  async function perform(body, {retry=false} = {}) {
    if (busy || disposed || paused) return;
    if (ownerNow() !== owner) { error = new ReceptionAPIError('identity-changed'); render(); return; }
    const mutation = ['start','message','document','decide','followup','next'].includes(body.op);
    if (pending && mutation && !retry) return;
    if (mutation) {if(pending?.requestId!==body.requestId)pendingAt=Date.now();pending = clone(body);}
    busy = true; operation = body.op; error = null; persist(); render({scrollChat:body.op==='message'});
    const task = (async()=>{
      try {
        const next = await api.request(body);
        if (disposed || ownerNow() !== owner) return;
        if(buildId && next.status!=='complete' && next.buildId!==buildId)throw new ReceptionAPIError('outdated-session',409);
        acceptView(next,body);initial=null; if (mutation) pending = null; if(body.op==='resume'||body.op==='start')needsResume=false;
      } catch (problem) {
        if (disposed || problem.code === 'cancelled') return;
        error = problem; const code = String(problem.code||'').replaceAll('_','-');
        if(body.op==='resume'&&/not-found|expired|outdated-session/.test(code)&&!view){initial=null;pending=null;savedCaseId='';drafts.clearCurrent();}
        // A definitive rejection is safe to amend; an uncertain transport failure keeps its idempotency key.
        if(/request-failed|request-interrupted|provider-unavailable|provider-invalid|unavailable|revision|conflict|stale|busy/.test(code))needsResume=true;
        if (mutation && (/request-failed|request-interrupted|provider-unavailable|provider-invalid|unavailable|busy|revision|conflict|stale|budget|limit|quota|auth|token|forbidden|not-found|not-configured|unsafe-endpoint|local-demo|profile-required|invalid-|closed|completed|locked|validation|not-active|not-reviewed|pilot-incomplete/.test(code)
          && !/invalid-response/.test(code))) { pending = null; if(body.op==='message'&&!draftMessage)draftMessage=body.text; }
      } finally {
        busy = false; operation = ''; restoring = false; persist(); render({scrollChat:body.op==='message'});
      }
      if (requestedLocale && !pending && !disposed) {
        const nextLocale = requestedLocale; requestedLocale = null; await changeLocale(nextLocale);
      }
    })();
    work = task; await task;
  }
  async function sendMessage() {
    if (!active() || busy || pending || paused || needsResume) return;
    const value = draftMessage.trim();
    if (!value || value.length>2000) { error=new ReceptionAPIError(value?'input-long':'empty-message');render();return; }
    draftMessage = '';
    await perform({op:'message',sessionId:view.id,text:value,requestId:newRequestId(),expectedRevision:view.revision});
  }
  async function changeLocale(value) {
    const chosen = normalizeLocale(value);
    locale = chosen; t = translator(locale); persist(); render();
    if (busy || pending) { requestedLocale=chosen;return; }
    if (view && view.locale !== chosen) await perform({op:'locale',sessionId:view.id,locale:chosen});
    await loadCatalog();
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
    if(view.case?.assessment)return;
    const required=['procedureId','routeId','law.number','law.article','deadline'];
    return required.find(path=>{const value=path.split('.').reduce((v,k)=>v?.[k],decisionDraft);return typeof value!=='string'||!value.trim();});
  }
  const input = event => {
    if(event.target.matches('[data-routing-search]')&&active()){routingSearch=event.target.value.slice(0,120);render();return;}
    if (event.target.matches('[data-message-draft]')) {draftMessage=event.target.value;resizeComposer();updateDraftStatus();}
    else if(event.target.matches('[data-decision]')&&!['checkbox','radio'].includes(event.target.type))editDecision(event.target);
    else if(event.target.matches('[name=caseSearch]')){caseSearch=event.target.value.slice(0,120);trainingCaseId='';persist();render();}
  };
  const change = event => {
    if(event.target.matches('[data-routing-territory]')&&active()){routingTerritory=event.target.value;render();return;}
    if(event.target.matches('[data-routing-recipient]')&&active()&&view.case.workbook){decisionDraft.workbook??=blankWorkbook();const ids=decisionDraft.workbook.routing.recipientIds,limit=view.case.workbook.recipientLimit===2?2:1,id=event.target.value;decisionDraft.workbook.routing.recipientIds=event.target.checked?(limit===1?[id]:[...new Set([...ids,id])].slice(0,limit)):ids.filter(value=>value!==id);confirmation=false;persist();render();return;}
    if(event.target.matches('[data-language]'))void changeLocale(event.target.value);
    else if(event.target.matches('[data-decision]'))editDecision(event.target);
    else if(event.target.matches('[name=mode]')){if(event.target.value==='independent'&&!canIndependent())return;mode=event.target.value;persist();render();}
    else if(event.target.matches('[name=trainingLevel]')){trainingLevel=event.target.value;trainingCaseId='';persist();render();}
    else if(event.target.matches('[name=trainingCaseId]')){trainingCaseId=event.target.value;persist();}
    else if(event.target.matches('[data-followup-choice]')&&view?.status==='followup'){followupDraft=event.target.value;updateDraftStatus();}
  };
  const submit = event => {
    if(event.target.matches('[data-chat-form]')){event.preventDefault();void sendMessage();}
    if(event.target.matches('[data-decision-form]')){
      event.preventDefault();if(busy||pending||paused||!active())return;
      const missing=incompleteDecision();
      if(missing){error=new ReceptionAPIError('incomplete-decision');if(missing==='deadline')goPage('calendar');else render();const field=root.querySelector(`[data-decision="${missing}"]`);for(let details=field?.closest('details');details;details=details.parentElement?.closest('details'))details.open=true;field?.focus();field?.scrollIntoView({block:'center',behavior:'instant'});return;}
      error=null;confirmation=true;render();root.querySelector('#rxaConfirmTitle')?.focus();
    }
    if(event.target.matches('[data-followup-form]')){
      event.preventDefault();if(busy||pending||paused||view?.status!=='followup')return;
      if(!(view.followup?.options||[]).some(o=>o.id===followupDraft)){error=new ReceptionAPIError('choose-followup');render();root.querySelector('[data-followup-choice]')?.focus();return;}
      void perform({op:'followup',sessionId:view.id,requestId:newRequestId(),choiceId:followupDraft});
    }
  };
  const keydown = event => {
    if(event.target.matches('[data-message-draft]')&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void sendMessage();}
    if(event.target.matches('[role=tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();const tabs=['documents','sources'];let index=tabs.indexOf(tab);
      index=event.key==='Home'?0:event.key==='End'?1:(index+1)%2;reader.close();tab=tabs[index];persist();render();root.querySelector(`#rxaTab-${tab}`)?.focus();
    }
  };
  const click = async event => {
    const target=event.target.closest('[data-action]');if(!target||!root.contains(target)||target.disabled||disposed)return;
    const action=target.dataset.action;
    if(action==='exit'){persist();options.onExit?.();return;}
    if(action==='illustration-open'&&view){
      const illustration=caseIllustrations(view.case.id,view.documents||[]).find(item=>item.id===target.dataset.id);
      illustrationViewer.open(illustration,{locale,trigger:target});return;
    }
    if(action==='page'){goPage(target.dataset.page);return;}
    if(action==='chat'){goPage('chat');return;}
    if(action==='continue'){goPage(active()?'chat':'decision');return;}
    if(action==='tab'||action==='workspace'){
      const selected=target.dataset.tab||target.dataset.panel;
      if(!['documents','sources','decision'].includes(selected))return;
      reader.close();selectedDoc='';tab=selected;goPage(selected==='decision'?'decision':'documents');return;
    }
    if(action==='edit-section'){const section=target.dataset.section;if(!['facts','routing','actions','law','research','trap','calendar'].includes(section))return;const key='assessment-'+section;detailOpen.add(key);const details=root.querySelector(`[data-details="${key}"]`);if(details){details.open=true;details.querySelector('input,select,textarea')?.focus({preventScroll:true});details.scrollIntoView({block:'start',behavior:'instant'});}persist();return;}
    if(action==='cancel-confirm'){confirmation=false;render();return;}
    if(busy||paused||recoverBusy)return;
    if(action==='load-catalog'){await loadCatalog();return;}
    if(action==='recover'){await recoverSession();return;}
    if(action==='resume-session'&&!pending){persist();const saved=drafts.readSession(target.dataset.id);if(saved)restoreSaved(saved);view=null;initial=saved;page='reception';await perform({op:'resume',sessionId:target.dataset.id});return;}
    if(action==='remove-reference'&&active()){selectedReferences=selectedReferences.filter(item=>item.id!==target.dataset.id);persist();render();return;}
    if(action==='use-reference'&&!gameplayContext&&active()){const reference=selectedReferences.find(item=>item.id===target.dataset.id);if(reference){applyReference(reference);render();}return;}
    if(action==='retry'&&pending){await perform(clone(pending),{retry:true});return;}
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
    if(action==='start') {
      if(mode==='independent'&&!canIndependent())return;
      await perform({op:'start',studentKey:backend?.getProfile?.()?.studentKey||options.studentKey||undefined,mode,locale,...(mode==='training'&&!seminar?{...(trainingCaseId?{caseId:trainingCaseId}:{}),...(trainingLevel?{level:Number(trainingLevel)}:{})}:{}),requestId:newRequestId()});return;
    }
    if(action==='documents-list'){selectedDoc='';persist();render();return;}
    if(action==='document'&&view) {
      reader.close();
      tab='documents';mobilePane='desk';page='documents';
      if((view.openedDocumentIds||[]).includes(target.dataset.id)){selectedDoc=target.dataset.id;persist();render();}
      else await perform({op:'document',sessionId:view.id,documentId:target.dataset.id,requestId:newRequestId()});return;
    }
    if(action==='confirm-decision'&&active()&&confirmation){
      const decision=clone(decisionDraft), citation=selectedReferences[0];
      if(gameplayContext&&citation&&decision.workbook){
        const {docId,unitIds,text}=citation;
        decision.workbook.legalCitation={docId,unitIds,text};
      }
      await perform({op:'decide',sessionId:view.id,decision,requestId:newRequestId()});return;
    }
    if(action==='next'&&view?.status==='review'){await perform({op:'next',sessionId:view.id,requestId:newRequestId()});}
  };
  const toggle = event => {const node=event.target;if(!node.matches?.('details[data-details]')||!root.contains(node))return;if(node.open)detailOpen.add(node.dataset.details);else detailOpen.delete(node.dataset.details);persist();};
  const identity = () => {if(ownerNow()!==owner){persist();error=new ReceptionAPIError('identity-changed');paused=true;render();}};
  const visibility = () => {if(!disposed&&page==='chat'&&!document.hidden){markChatRead();persist();render();}};
  root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('submit',submit);root.addEventListener('keydown',keydown);root.addEventListener('click',click);
  root.addEventListener('toggle',toggle,true);
  window.addEventListener('rudn:identitychange',identity);
  window.addEventListener('pagehide',persist);document.addEventListener('visibilitychange',visibility);
  window.addEventListener('resize',updateViewport);visualViewport?.addEventListener('resize',updateViewport);
  visualViewport?.addEventListener('scroll',updateViewport);
  root.addEventListener('focusin',updateViewport);root.addEventListener('focusout',updateViewport);
  updateAdapter = createUpdateAdapter({module:'reception',root,signal:lifetime.signal,diagnostics:options.diagnostics,
    getIdentity:()=>({owner,attemptId:view?.id||'reception-ai-start'}),isBusy:()=>busy||recoverBusy||!!pending||reader.isOpen(),
    pause:async value=>{paused=value;await work;},
    capture:()=>({version:VERSION,locale,tab,selectedDoc,mobilePane,page,view:captureUpdateView(root)}),
    checkpoint:async()=>{await work;if(!persist())throw Error('update/not-durable');return {durable:true,revision:view?.revision||0,checkpointRef:{id:view?.id||'reception-ai-start',revision:view?.revision||0,version:VERSION}};},
    restore:async({state:saved,checkpointRef},{signal}={})=>{if(saved.version!==VERSION||checkpointRef.id!==(view?.id||'reception-ai-start'))return {status:'blocked',code:'incompatible'};tab=saved.tab;selectedDoc=saved.selectedDoc;page=workspacePages.includes(saved.page)?saved.page:'reception';mobilePane=page==='chat'?'chat':'desk';render();await restoreUpdateView(root,saved.view,{signal});return {status:'restored',code:'ok'};},
  });
  const cleanup = () => {
    if(disposed)return Promise.resolve();persist();disposed=true;updateAdapter?.destroy();reader.destroy();calendar.destroy();media.destroy();illustrationViewer.destroy();lifetime.abort();options.signal?.removeEventListener('abort',stop);
    owners.delete(presentationToken);if(!owners.size){body.classList.remove('reception-immersive');presentationOwners.delete(body);}
    root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('submit',submit);root.removeEventListener('keydown',keydown);root.removeEventListener('click',click);
    root.removeEventListener('toggle',toggle,true);
    window.removeEventListener('rudn:identitychange',identity);
    window.removeEventListener('pagehide',persist);document.removeEventListener('visibilitychange',visibility);
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
  if(initial?.sessionId){restoring=true;render();await perform({op:'resume',sessionId:initial.sessionId});if(view&&view.locale!==locale&&!pending)await changeLocale(locale);}
  else if(!pending)await recoverSession(null,{quiet:true});
  await catalogTask;
  return cleanup;
}
