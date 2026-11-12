import {createReceptionAPI, newRequestId, ReceptionAPIError} from './api-client.js';
import {localized, normalizeLocale, translator} from './copy.js';
import {characterMedia, createMessengerMedia} from './media.js';
import {createSourceReader, sourceDocumentForURL} from '../js/source-reader.js';
import {createUpdateAdapter, captureUpdateView, restoreUpdateView} from '../../../assets/js/platform-update-state.js';
import {resourceURL} from '../../../assets/js/release-resources.js';

const VERSION = 'reception-ai-ui-v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clone = value => JSON.parse(JSON.stringify(value));
const paths = {
  talk:'<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/>',
  docs:'<path d="M5 3h10l4 4v14H5Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
  sources:'<path d="M3 4h6l3 3 3-3h6v15h-6l-3 2-3-2H3Z"/><path d="M12 7v14"/>',
  decision:'<path d="M8 4H5v17h14V4h-3M8 2h8v5H8Z"/><path d="m8 13 3 3 5-6"/>',
  back:'<path d="M20 12H4m6-6-6 6 6 6"/>', send:'<path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>', check:'<path d="m5 12 4 4L19 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  out:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  lock:'<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  up:'<path d="M12 20V4m-6 6 6-6 6 6"/>', down:'<path d="M12 4v16m-6-6 6 6 6-6"/>',
};
const icon = name => `<svg class="rxa-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.docs}</svg>`;
const blankDecision = () => ({procedureId:'',routeId:'',actionIds:[],law:{number:'',article:''},deadline:'',basisDocumentIds:[],reasoning:''});
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
  return base;
}
const safeURL = value => {
  try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
};
const documentImage = value => typeof value==='string'&&/^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/.test(value)
  ? resourceURL('../'+value,import.meta.url).href : '';
export function loadAIStyle() {
  const id = 'rudn-reception-ai-style-v3';
  if (!document.getElementById(id)) {
    const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet';
    link.href = new URL('./style.css', import.meta.url).href; document.head.append(link);
  }
}

/** Native, framework-free workspace. It never receives private dossiers or scoring keys. */
export async function mountReceptionAI(root, options = {}, config = {}) {
  loadAIStyle();
  const lifetime = new AbortController();
  const stop = () => lifetime.abort();
  if (options.signal?.aborted) return Object.assign(() => {}, {module:'reception'});
  options.signal?.addEventListener('abort', stop, {once:true});
  const backend = options.backend;
  const ownerNow = () => String(backend?.getProfile?.()?.studentKey || backend?.user?.uid || options.studentKey || 'local-demo');
  const owner = ownerNow();
  const storageKey = `rudn.reception.ai.v1:${encodeURIComponent(owner)}:${options.context || 'course'}:${options.period || 'current'}:${encodeURIComponent(config.endpoint || '')}`;
  let locale = normalizeLocale(options.locale || options.getLocale?.() || document.documentElement.lang);
  let t = translator(locale), view = null, busy = false, disposed = false, paused = false, operation = '', error = null;
  let pending = null, draftMessage = '', decisionDraft = blankDecision(), tab = 'documents', selectedDoc = '', mode = 'training';
  let confirmation = false, storageOkay = true, savedCaseId = '', restoring = false, requestedLocale = null, work = Promise.resolve();
  let completedNotified = '', updateAdapter = null, needsResume = false, pendingAt = null, mobilePane = 'chat';
  let enteringMessages = new Set(), enteringDocuments = new Set(), lastPendingRenderedId = '';
  let chatScroll = {top:0,bottom:true}, followupDraft='';
  let detailOpen = new Set();
  const visualViewport = window.visualViewport;
  const media = createMessengerMedia(root, {signal:lifetime.signal});
  let store;
  try { store = options.storage || globalThis.localStorage; } catch { storageOkay = false; }
  const initial = (() => {
    try { const value = JSON.parse(store?.getItem(storageKey) || 'null'); return value?.version === VERSION && value.owner === owner ? value : null; }
    catch { return null; }
  })();
  if (initial) {
    draftMessage = typeof initial.draftMessage === 'string' ? initial.draftMessage.slice(0,2000) : '';
    if (initial.decisionDraft && typeof initial.decisionDraft === 'object') decisionDraft = restoreDecision(initial.decisionDraft);
    if (!Array.isArray(decisionDraft.actionIds)) decisionDraft.actionIds = [];
    if (!Array.isArray(decisionDraft.basisDocumentIds)) decisionDraft.basisDocumentIds = [];
    if (['documents','sources','decision'].includes(initial.tab)) tab = initial.tab;
    selectedDoc = String(initial.selectedDoc || ''); savedCaseId = String(initial.caseId || '');
    if (['chat','desk'].includes(initial.mobilePane)) mobilePane = initial.mobilePane;
    if (Number.isFinite(initial.pendingAt)) pendingAt = initial.pendingAt;
    if (initial.chatScroll && Number.isFinite(initial.chatScroll.top)) chatScroll={top:Math.max(0,initial.chatScroll.top),bottom:initial.chatScroll.bottom!==false};
    if (['training','independent'].includes(initial.mode)) mode = initial.mode;
    if(typeof initial.followupDraft==='string')followupDraft=initial.followupDraft;
    if(Array.isArray(initial.detailOpen))detailOpen=new Set(initial.detailOpen.filter(x=>typeof x==='string'));
    if (initial.pending && ['start','message','document','decide','followup','next'].includes(initial.pending.op)
      && typeof initial.pending.requestId === 'string') pending = initial.pending;
  }
  const getToken = options.getIdToken || (backend?.getReceptionIdToken ? arg => backend.getReceptionIdToken(arg) : null);
  const api = createReceptionAPI({endpoint:config.endpoint, getIdToken:getToken, demo:config.demo === true,
    fetch:options.fetch || globalThis.fetch, signal:lifetime.signal, timeoutMs:config.timeoutMs || 60000});
  const reader = createSourceReader(root, {signal:lifetime.signal, locale:() => locale});
  const text = value => localized(value, locale);
  const active = () => view?.status === 'active';
  const canIndependent = () => config.demo === true || (!backend?.isAdmin?.() && options.context !== 'free'
    && (typeof options.assessmentAllowed === 'function' ? options.assessmentAllowed() : options.assessmentAllowed !== false)
    && Boolean(backend?.getProfile?.()?.studentKey || options.studentKey));
  const button = (label, action, {primary=false, quiet=false, disabled=false, extra='', glyph=''} = {}) =>
    `<button type="button" class="rxa-btn ${primary?'primary':''} ${quiet?'quiet':''}" data-action="${esc(action)}" ${disabled?'disabled':''} ${extra}>${glyph?icon(glyph):''}${esc(label)}</button>`;
  function persist() {
    const log=root.querySelector('.rxa-messages');
    if(log?.clientHeight>0&&log.dataset.caseId===view?.case?.id)chatScroll={top:log.scrollTop,bottom:log.scrollHeight-log.scrollTop-log.clientHeight<50};
    try {
      store?.setItem(storageKey, JSON.stringify({version:VERSION,owner,sessionId:view?.id || initial?.sessionId || '',caseId:view?.case?.id || savedCaseId,
        mode:view?.mode || mode,locale,draftMessage,decisionDraft,followupDraft,detailOpen:[...detailOpen],tab,selectedDoc,pending,pendingAt,mobilePane,chatScroll}));
      storageOkay = Boolean(store); return storageOkay;
    } catch { storageOkay = false; return false; }
  }
  function errorText(problem) {
    const code = String(problem?.code || '').toLowerCase().replaceAll('_','-');
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
  function header() {
    return `<header class="rxa-top"><div class="rxa-brand">${options.onExit?`<button class="rxa-back" type="button" data-action="exit" aria-label="${esc(t('back'))}">${icon('back')}</button>`:`<span class="rxa-brand-mark">${icon('talk')}</span>`}<strong>${esc(t('title'))}</strong></div><div class="rxa-top-actions">${view?`<span class="rxa-shift-count">${esc(t('caseCounter',{current:Number(view.caseIndex)+1,total:view.caseCount}))}</span>`:''}${config.demo || options.showLanguageSelector?`<label><span class="rxa-sr">${esc(t('language'))}</span><select class="rxa-locale" data-language data-focus="language" aria-label="${esc(t('language'))}">${[['ru','RU'],['en','EN'],['zh','中文']].map(([id,label])=>`<option value="${id}" ${locale===id?'selected':''}>${label}</option>`).join('')}</select></label>`:''}</div></header>`;
  }
  function alerts() {
    const lines = [];
    if (error || pending && !busy) lines.push(`<section class="rxa-alert" role="alert">${icon('info')}<div><p>${esc(error?errorText(error):t('pending'))}</p><div class="rxa-actions">${pending?button(t('retry'),'retry',{disabled:busy}):view || initial?.sessionId?button(t('refresh'),'refresh',{disabled:busy}):''}${error && !view && !pending?button(t('newSession'),'clear-session',{disabled:busy}):''}</div></div></section>`);
    if (!storageOkay) lines.push(`<div class="rxa-alert" role="status">${icon('info')}<p>${esc(t('storageError'))}</p></div>`);
    return lines.join('');
  }
  function landing() {
    mode = config.demo === true ? 'training' : canIndependent() ? 'independent' : 'training';
    return `<section class="rxa-landing"><div class="rxa-standby"><span class="rxa-standby-icon" aria-hidden="true">${icon('talk')}</span><h1>${esc(t('hero'))}</h1><p>${esc(t('intro'))}</p>${button(t('begin'),'start',{primary:true,disabled:busy||!!pending,glyph:'arrow'})}</div></section>`;
  }
  function messageTime(at) {
    if (at === null || at === undefined) return '';
    const date = new Date(at); if (!Number.isFinite(date.getTime())) return '';
    return `<time datetime="${date.toISOString()}" title="${esc(new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(date))}">${esc(new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hour12:false}).format(date))}</time>`;
  }
  function messageMarkup(message, pendingMessage=false) {
    const outgoing=message.role==='user', fresh=enteringMessages.has(message.id)||pendingMessage&&lastPendingRenderedId!==message.id;
    const status=pendingMessage?(busy?t('sendingMessage'):t('awaitingDelivery')):t('sent');
    return `<article class="rxa-message ${outgoing?'user':'assistant'} ${fresh?'rxa-message-enter':''} ${pendingMessage?'rxa-message-pending':''}" data-message-id="${esc(message.id)}" ${pendingMessage?'data-pending-message':''}><span class="rxa-sr">${esc(outgoing?t('you'):text(view.case?.citizen?.name)||t('citizen'))}</span><div class="rxa-bubble"><p>${esc(text(message.text))}</p><footer class="rxa-message-meta">${messageTime(message.at)}${outgoing?`<span class="rxa-delivery" data-delivery-state="${pendingMessage?'pending':'sent'}" aria-label="${esc(status)}" title="${esc(status)}">${pendingMessage?`<span class="rxa-delivery-clock" aria-hidden="true"></span><span>${esc(status)}</span>`:icon('check')}</span>`:''}</footer></div></article>`;
  }
  function conversation() {
    const c=view.case||{}, citizen=c.citizen||{}, messages=Array.isArray(view.messages)?view.messages:[];
    const appearance=characterMedia(c.id,citizen.portrait), opening=text(c.opening);
    const items=!messages.length&&opening?[{id:'opening',role:'assistant',text:opening}]:messages;
    const waiting=pending?.op==='message'&&pending.sessionId===view.id&&!items.some(m=>m.id===`${pending.requestId}-user`);
    const typing=busy&&operation==='message', status=typing?t('typing'):error||needsResume?t('connectionPaused'):active()?t('available'):t('conversationClosed');
    const day=items[0]?.at?new Date(items[0].at):null;
    const dateLabel=day&&Number.isFinite(day.getTime())?new Intl.DateTimeFormat(locale,{day:'numeric',month:'long'}).format(day):t('conversation');
    const docs=view.documents||[];
    return `<section class="rxa-conversation" id="rxaConversation" aria-label="${esc(t('chat'))}"><header class="rxa-person"><div class="rxa-person-info"><div class="rxa-person-heading"><img class="rxa-avatar" src="${esc(appearance.avatar)}" alt=""><div><h2>${esc(text(citizen.name)||t('citizen'))}</h2><p class="rxa-presence ${typing?'typing':''} ${error||needsResume?'paused':''}" aria-live="polite"><span aria-hidden="true"></span>${esc(status)}</p></div></div></div></header><div class="rxa-citizen-stage" data-rxa-actor="${esc(appearance.actorId)}" aria-hidden="true"><img class="rxa-citizen-poster" src="${esc(appearance.poster)}" alt=""></div><details class="rxa-role" data-details="role"><summary>${icon('info')}${esc(t('role'))}<span aria-hidden="true">⌄</span></summary><strong>${esc(text(c.role?.title))}</strong><p>${esc(text(c.role?.text))}</p></details><div class="rxa-messages" data-case-id="${esc(c.id)}" role="log" aria-label="${esc(t('reviewChat'))}" aria-live="polite" aria-relevant="additions text"><div class="rxa-chat-date">${esc(dateLabel)}</div>${items.map(m=>messageMarkup(m)).join('')}${waiting?messageMarkup({id:`pending-${pending.requestId}`,role:'user',text:pending.text,at:pendingAt},true):''}${typing?`<div class="rxa-typing" data-typing role="status"><span class="rxa-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(t('typing'))}</span></div>`:''}${docs.length?`<section class="rxa-chat-attachments" aria-label="${esc(t('caseMaterials'))}"><div class="rxa-chat-date">${esc(t('caseMaterials'))}</div>${docs.map(doc=>`<button type="button" class="rxa-attachment ${enteringDocuments.has(doc.id)?'rxa-attachment-enter':''}" data-action="document" data-id="${esc(doc.id)}" ${busy||pending||paused||!active()&&!(view.openedDocumentIds||[]).includes(doc.id)?'disabled':''}>${icon('docs')}<span><strong>${esc(text(doc.title))}</strong><small>${esc((view.openedDocumentIds||[]).includes(doc.id)?t('documentOpened'):t('openDocument'))}</small></span>${icon('out')}</button>`).join('')}</section>`:''}</div>${active()?`<form class="rxa-compose" data-chat-form><div class="rxa-composer-box"><button class="rxa-compose-materials" type="button" data-action="workspace" data-panel="documents" aria-label="${esc(t('caseMaterials'))}" title="${esc(t('caseMaterials'))}">${icon('docs')}</button><label class="rxa-sr" for="rxaMessage">${esc(t('messageLabel'))}</label><textarea id="rxaMessage" data-message-draft data-focus="message" placeholder="${esc(t('messagePlaceholder'))}" maxlength="2000" rows="1" ${paused?'disabled':''}>${esc(draftMessage)}</textarea><button class="rxa-send" type="submit" aria-label="${esc(t('send'))}" title="${esc(t('send'))}" ${busy||pending||paused||needsResume?'disabled':''}>${icon('send')}</button></div><div class="rxa-compose-actions"><small>${esc(t('enterHint'))}</small><small data-message-count aria-hidden="true">${draftMessage.length?`${draftMessage.length} / 2000`:''}</small></div></form>`:`<div class="rxa-fixed">${icon('check')}<span>${esc(t('fixed'))}</span></div>`}</section>`;
  }
  function documents() {
    const docs = view.documents || [], opened = view.openedDocumentIds || [];
    const selected = docs.find(d=>d.id===selectedDoc) || docs.find(d=>opened.includes(d.id));
    const illustration=selected&&documentImage(selected.image),external=selected&&safeURL(selected.url);
    return `<section class="rxa-panel" role="tabpanel" id="rxaPanel" aria-labelledby="rxaTab-documents"><h2>${esc(t('documents'))}</h2><p class="rxa-panel-intro">${esc(t('documentsHint'))}</p>${!docs.length?`<p class="rxa-empty">${esc(t('noDocuments'))}</p>`:`<div class="rxa-document-list">${docs.map(d=>`<button type="button" class="rxa-document-button" data-action="document" data-id="${esc(d.id)}" aria-pressed="${selected?.id===d.id}" ${busy||pending||paused||!active()&&!opened.includes(d.id)?'disabled':''}>${icon('docs')}<span><strong>${esc(text(d.title))}</strong><small>${esc(opened.includes(d.id)?t('documentOpened'):t('openDocument'))}</small></span></button>`).join('')}</div>${selected&&opened.includes(selected.id)?`<article class="rxa-document"><p class="rxa-doctype">${esc(text(selected.type))}</p><h3>${esc(text(selected.title))}</h3>${selected.sensitive?`<p class="rxa-document-sensitive">${icon('lock')}${esc(t('restrictedMaterial'))}</p>`:''}${illustration?`<img class="rxa-document-image" src="${esc(illustration)}" alt="${esc(text(selected.title))}" loading="lazy">`:''}<div class="rxa-document-body">${esc(text(selected.text))}</div>${external?`<div class="rxa-source-links"><a class="rxa-btn" href="${esc(external)}" target="_blank" rel="noopener noreferrer">${icon('out')}${esc(t('original'))}</a></div>`:''}</article>`:`<p class="rxa-empty">${esc(t('documentUnread'))}</p>`}`}</section>`;
  }
  function sources() {
    const research=view.case?.assessment?.research;
    const records=research?`<section class="rxa-research-materials"><h3>${esc(t('researchMaterials'))}</h3><p class="rxa-panel-intro">${esc(text(research.prompt))}</p>${(research.records||[]).map(record=>`<details class="rxa-source-record" data-details="source-${esc(record.id)}"><summary>${icon('sources')}<span>${esc(text(record.title))}</span></summary>${(record.fragments||[]).map(fragment=>`<article class="rxa-source-fragment" data-record="${esc(record.id)}" data-fragment="${esc(fragment.id)}"><h4>${esc(text(fragment.label))}</h4><div>${esc(text(fragment.text))}</div>${active()?button(t('selectFragment'),'research-fragment',{disabled:busy||!!pending||paused,extra:`data-record="${esc(record.id)}" data-fragment="${esc(fragment.id)}"`}):''}</article>`).join('')}${safeURL(record.url)?`<a class="rxa-btn" href="${esc(safeURL(record.url))}" target="_blank" rel="noopener noreferrer">${icon('out')}${esc(t('original'))}</a>`:''}</details>`).join('')}</section>`:'';
    return `<section class="rxa-panel" role="tabpanel" id="rxaPanel" aria-labelledby="rxaTab-sources"><h2>${esc(t('sourceTitle'))}</h2><p class="rxa-panel-intro">${esc(t('sourceHint'))}</p>${records}${(view.case?.sources || []).map(source=>{
      const url = safeURL(source.url); return `<article class="rxa-source"><h3>${esc(text(source.title))}</h3>${url?`<div class="rxa-source-links">${sourceDocumentForURL(url)?`<a class="rxa-btn" href="${esc(url)}" data-source-reader target="_blank" rel="noopener noreferrer">${icon('sources')}${esc(t('readLaw'))}</a>`:''}<a class="rxa-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('out')}${esc(t('original'))}</a></div>`:''}</article>`;
    }).join('')}</section>`;
  }
  function optionsField(id, label, values, selected, checkbox=false) {
    const locked=!active()||paused||(busy&&operation==='decide')||pending?.op==='decide';
    return `<fieldset class="rxa-fieldset"><legend>${esc(label)}</legend>${(values || []).map(option=>`<label class="rxa-choice"><input type="${checkbox?'checkbox':'radio'}" data-decision="${id}" data-focus="${id}-${esc(option.id)}" name="rxa-${id}" value="${esc(option.id)}" ${checkbox?selected.includes(option.id)?'checked':'':selected===option.id?'checked':''} ${locked?'disabled':''}><span>${esc(text(option.label??option.text??option.title))}</span></label>`).join('')}</fieldset>`;
  }
  function assessmentBlock(id,label,content) {
    return `<details class="rxa-assessment-block" data-details="assessment-${esc(id)}"><summary><span>${esc(label)}</span><span class="rxa-fold-arrow" aria-hidden="true">⌄</span></summary><div class="rxa-assessment-content">${content}</div></details>`;
  }
  function orderedActions(c,d,locked) {
    const selected=d.actionIds.map(id=>c.actions.find(a=>a.id===id)).filter(Boolean);
    return `${optionsField('actionIds',t('actions'),c.actions,d.actionIds,true)}${selected.length?`<div class="rxa-order-heading"><h3>${esc(t('actionOrder'))}</h3><p class="rxa-panel-intro">${esc(t('actionOrderHint'))}</p></div><ol class="rxa-action-order" data-action-order>${selected.map((action,index)=>`<li><span><b>${index+1}.</b> ${esc(text(action.label))}</span><div><button type="button" data-action="move-action" data-id="${esc(action.id)}" data-direction="up" data-focus="order-up-${esc(action.id)}" aria-label="${esc(t('moveUp',{action:text(action.label)}))}" title="${esc(t('up'))}" ${locked||index===0?'disabled':''}>${icon('up')}</button><button type="button" data-action="move-action" data-id="${esc(action.id)}" data-direction="down" data-focus="order-down-${esc(action.id)}" aria-label="${esc(t('moveDown',{action:text(action.label)}))}" title="${esc(t('down'))}" ${locked||index===selected.length-1?'disabled':''}>${icon('down')}</button></div></li>`).join('')}</ol>`:''}`;
  }
  function decision() {
    const c = view.case || {}, d = decisionDraft, readable = (view.documents||[]).filter(doc=>(view.openedDocumentIds||[]).includes(doc.id));
    const locked=paused||(busy&&operation==='decide')||pending?.op==='decide';
    const field = (name,label,value,type='text',max='80') => `<label class="rxa-field"><span>${esc(label)}</span><input type="${type}" data-decision="${name}" data-focus="${name}" value="${esc(value)}" maxlength="${max}" autocomplete="off" ${locked?'disabled':''}></label>`;
    const select=(name,label,values,value)=>`<label class="rxa-field full"><span>${esc(label)}</span><select data-decision="${esc(name)}" data-focus="${esc(name)}" ${locked?'disabled':''}><option value="">${esc(t('decisionEmpty'))}</option>${values.map(v=>`<option value="${esc(v.id)}" ${v.id===value?'selected':''}>${esc(text(v.label??v.title))}</option>`).join('')}</select></label>`;
    const a=c.assessment,answer=d.assessment;
    const basis=`${optionsField('basisDocumentIds',t('basis'),readable.map(doc=>({id:doc.id,label:doc.title})),d.basisDocumentIds,true)}<p class="rxa-small rxa-muted">${esc(readable.length?t(a?'basisExactHint':'basisHint'):t('noReadDocuments'))}</p>`;
    const routing=optionsField('procedureId',t('procedure'),c.procedures,d.procedureId)+optionsField('routeId',t('route'),c.routes,d.routeId);
    const law=`<fieldset class="rxa-fieldset"><legend>${esc(t('law'))}</legend>${a?`<p class="rxa-panel-intro">${esc(text(a.knowledge.prompt))}</p>`:''}<div class="rxa-fields">${field('law.number',text(a?.knowledge.numberLabel)||t('lawNumber'),d.law.number)}${a?field('assessment.actDate',text(a.knowledge.dateLabel)||t('actDate'),answer.actDate,'date'):''}${field('law.article',text(a?.knowledge.unitLabel)||t('lawArticle'),d.law.article)}</div></fieldset>${a?optionsField('assessment.applicationId',t('applyLaw'),a.knowledge.options,answer.applicationId):''}`;
    const calendar=`<fieldset class="rxa-fieldset"><legend>${esc(t('deadline'))}</legend>${c.deadlinePrompt?`<p class="rxa-panel-intro">${esc(text(c.deadlinePrompt))}</p>`:''}${a?`<div class="rxa-calendar-events">${a.calendar.events.map(e=>`<p><span>${esc(text(e.label))}</span><strong>${esc(e.date)}</strong></p>`).join('')}</div>`:''}<div class="rxa-fields">${field('deadline',t('deadline'),d.deadline,'date')}</div></fieldset>${a?`${optionsField('assessment.calendar.anchor',t('calendarAnchor'),a.calendar.events,answer.calendar.anchor)}${optionsField('assessment.calendar.rule',t('calendarRule'),a.calendar.rules,answer.calendar.rule)}${optionsField('assessment.calendar.start',t('calendarStart'),a.calendar.starts,answer.calendar.start)}${optionsField('assessment.calendar.shift',t('calendarShift'),a.calendar.lastDays,answer.calendar.shift)}`:''}`;
    let body;
    if(a){
      const research=a.research,record=research.records.find(r=>r.id===answer.research.recordId),fragment=record?.fragments.find(f=>f.id===answer.research.fragmentId);
      const investigation=`<p class="rxa-panel-intro">${esc(text(research.prompt))}</p>${button(t('viewSources'),'workspace',{extra:'data-panel="sources"',glyph:'sources'})}<div class="rxa-fields">${select('assessment.research.recordId',t('researchRecord'),research.records,answer.research.recordId)}${select('assessment.research.fragmentId',t('researchFragment'),record?.fragments||[],answer.research.fragmentId)}</div>${fragment?`<blockquote class="rxa-selected-fragment">${esc(text(fragment.text))}</blockquote>`:''}<div class="rxa-fields">${field('assessment.research.extracted',text(research.extractedLabel),answer.research.extracted,'text','200')}</div>${optionsField('assessment.research.finding',t('researchFinding'),research.findingOptions,answer.research.finding)}`;
      body=assessmentBlock('facts',t('factsBlock'),optionsField('assessment.factId',text(a.fact.prompt),a.fact.options,answer.factId)+basis)+assessmentBlock('routing',t('routingBlock'),routing)+assessmentBlock('actions',t('actionsBlock'),orderedActions(c,d,locked))+assessmentBlock('law',t('law'),law)+assessmentBlock('calendar',t('deadline'),calendar)+assessmentBlock('research',t('researchBlock'),investigation)+assessmentBlock('trap',t('trapBlock'),optionsField('assessment.trapId',text(a.trap.prompt),a.trap.options,answer.trapId));
    }else body=routing+optionsField('actionIds',t('actions'),c.actions,d.actionIds,true)+law+calendar+basis;
    return `<section class="rxa-panel" role="tabpanel" id="rxaPanel" aria-labelledby="rxaTab-decision"><h2>${esc(t('decisionTitle'))}</h2><p class="rxa-panel-intro">${esc(t('decisionHint'))}</p><form data-decision-form>${body}<fieldset class="rxa-fieldset"><legend>${esc(t('reasoning'))}</legend><label class="rxa-field full"><span class="rxa-sr">${esc(t('reasoning'))}</span><textarea data-decision="reasoning" data-focus="reasoning" maxlength="3000" rows="4" ${locked?'disabled':''}>${esc(d.reasoning)}</textarea><small>${esc(t('reasoningHint'))}</small></label></fieldset><div class="rxa-decision-footer"><small class="rxa-save-note" data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small><button class="rxa-btn primary" type="submit" ${busy||pending||paused?'disabled':''}>${icon('check')}${esc(t('submit'))}</button></div></form>${confirmation?`<section class="rxa-confirm" role="region" aria-labelledby="rxaConfirmTitle"><h3 id="rxaConfirmTitle" tabindex="-1">${esc(t('confirmTitle'))}</h3><p>${esc(t('confirmText'))}</p><div class="rxa-actions">${button(t('confirm'),'confirm-decision',{primary:true,disabled:busy||!!pending})}${button(t('cancel'),'cancel-confirm',{disabled:busy})}</div></section>`:''}</section>`;
  }
  function followup() {
    const f=view.followup||{},locked=busy||pending||paused;
    return `<section class="rxa-panel rxa-followup" role="tabpanel" id="rxaPanel" aria-labelledby="rxaTab-decision"><p class="rxa-eyebrow">${esc(t('fixed'))}</p><h2>${esc(t('followupTitle'))}</h2><p class="rxa-followup-intro">${esc(text(f.intro))}</p><form data-followup-form><fieldset class="rxa-fieldset"><legend>${esc(t('followupQuestion'))}</legend>${(f.options||[]).map(option=>`<label class="rxa-choice"><input type="radio" name="rxa-followup" data-followup-choice data-focus="followup-${esc(option.id)}" value="${esc(option.id)}" ${followupDraft===option.id?'checked':''} ${locked?'disabled':''}><span>${esc(text(option.label))}</span></label>`).join('')}</fieldset><div class="rxa-decision-footer"><small data-save-note>${esc(t(storageOkay?'savedDraft':'storageError'))}</small><button class="rxa-btn primary" type="submit" ${locked?'disabled':''}>${icon('check')}${esc(t('followupSubmit'))}</button></div></form><details class="rxa-assessment-block" data-details="fixed-decision"><summary>${esc(t('submittedDecision'))}</summary><div class="rxa-assessment-content"><p><strong>${esc(t('procedure'))}:</strong> ${esc(text(view.case.procedures.find(p=>p.id===decisionDraft.procedureId)?.label))}</p><p><strong>${esc(t('route'))}:</strong> ${esc(text(view.case.routes.find(p=>p.id===decisionDraft.routeId)?.label))}</p><ol class="rxa-fixed-actions">${decisionDraft.actionIds.map(id=>`<li>${esc(text(view.case.actions.find(a=>a.id===id)?.label))}</li>`).join('')}</ol><p><strong>${esc(t('law'))}:</strong> ${esc(decisionDraft.law.number)} · ${esc(decisionDraft.assessment?.actDate||'')} · ${esc(decisionDraft.law.article)}</p><p><strong>${esc(t('deadline'))}:</strong> ${esc(decisionDraft.deadline)}</p><p class="rxa-fixed-reasoning">${esc(decisionDraft.reasoning)}</p></div></details></section>`;
  }
  function feedbackMarkup(feedback) {
    if (!feedback) return '';
    const evidenceIssueKeys = {selection:'evidenceSelection', unopened:'evidenceUnopened', fact:'evidenceFact'};
    const evidenceIssue = evidenceIssueKeys[feedback.evidenceIssue];
    const labelKeys = {procedure:'procedure',route:'route',routing:'route',actions:'actionsCriterion',law:'lawCriterion',deadline:'deadlineCriterion',evidence:'evidence',facts:'factsCriterion'};
    return `<div class="rxa-score"><strong>${esc(feedback.score ?? '')}</strong><span>/ 100</span></div><table class="rxa-criteria"><thead><tr><th>${esc(t('criteria'))}</th><th>${esc(t('earned'))}</th></tr></thead><tbody>${(feedback.criteria||[]).map(row=>`<tr><td>${esc(text(row.label)||t(labelKeys[row.id]||row.id))}</td><td>${esc(row.earned)} / ${esc(row.max)}</td></tr>`).join('')}</tbody></table><p class="rxa-explanation">${esc(text(feedback.explanation))}</p>${evidenceIssue?`<p class="rxa-explanation">${esc(t(evidenceIssue))}</p>`:''}${Array.isArray(feedback.missingFacts)&&feedback.missingFacts.length?`<p class="rxa-explanation">${feedback.missingFacts.map(f=>esc(text(f))).join('\n')}</p>`:''}`;
  }
  function review() {
    return `<section class="rxa-panel rxa-review"><div class="rxa-review-icon">${icon('check')}</div><h2>${esc(t(view.feedback?'reviewTitle':'fixed'))}</h2>${view.feedback?feedbackMarkup(view.feedback):`<p class="rxa-panel-intro">${esc(t('reviewHidden'))}</p>`}<div class="rxa-review-footer">${button(t(Number(view.caseIndex)+1<Number(view.caseCount)?'next':'finish'),'next',{primary:true,disabled:busy||!!pending,glyph:'arrow'})}</div></section>`;
  }
  function workspace() {
    const tabs=[['documents','docs'],['sources','sources'],['decision','decision']];
    return `<div class="rxa-workspace">${conversation()}<div class="rxa-desk" id="rxaDesk"><header class="rxa-desk-heading"><h1>${esc(text(view.case?.title))}</h1>${view.case?.date?`<p>${esc(t('date'))}: ${esc(view.case.date)}</p>`:''}</header>${view.status==='review'?review():`<nav class="rxa-tabs" role="tablist" aria-label="${esc(t('decisionTitle'))}">${tabs.map(([id,glyph])=>`<button id="rxaTab-${id}" type="button" class="rxa-tab" role="tab" data-action="tab" data-tab="${id}" aria-selected="${tab===id}" aria-controls="rxaPanel">${icon(glyph)}<span>${esc(t(id))}</span>${id==='documents'?`<span class="rxa-count">${(view.documents||[]).length}</span>`:''}</button>`).join('')}</nav>${({documents,sources,decision:view.status==='followup'?followup:decision}[tab]||documents)()}`}</div></div><nav class="rxa-mobile-nav" aria-label="${esc(t('workplace'))}"><button type="button" class="rxa-mobile-chat" data-action="chat" aria-label="${esc(t('returnChat'))}" aria-current="${mobilePane==='chat'?'page':'false'}">${icon('talk')}<span>${esc(t('chat'))}</span></button>${tabs.map(([id,glyph])=>`<button type="button" data-action="workspace" data-panel="${id}" aria-current="${mobilePane==='desk'&&tab===id?'page':'false'}">${icon(glyph)}<span>${esc(t(id))}</span></button>`).join('')}</nav>`;
  }
  function complete() {
    const result = view.result;
    if (!result) return `<section class="rxa-complete"><h1>${esc(t('complete'))}</h1><p class="rxa-panel-intro">${esc(t('noResult'))}</p>${button(t('refresh'),'refresh',{primary:true,disabled:busy})}</section>`;
    const journal = result.journalStatus === 'saved' ? 'journalSaved' : ['local','not-applicable'].includes(result.journalStatus) || view.mode === 'training' || view.provider === 'mock' ? 'journalLocal' : 'journalPending';
    return `<section class="rxa-complete"><div class="rxa-complete-head"><p class="rxa-eyebrow">${esc(t('complete'))}</p><h1>${esc(t('totalScore'))}</h1><div class="rxa-score"><strong>${esc(result.points)}</strong><span>${esc(t('outOf'))} ${esc(result.maxPoints ?? 5)}</span></div><p class="rxa-journal" role="status">${esc(t(journal))}</p>${journal==='journalPending'?`<div class="rxa-actions">${button(t('journalRetry'),'refresh',{disabled:busy})}</div>`:''}</div>${Array.isArray(result.cases)&&result.cases.length?`<h2>${esc(t('casesReview'))}</h2>${result.cases.map((row,index)=>`<details class="rxa-case-review" data-details="result-${index}"><summary>${index+1}. ${esc(text(row.title))} · ${esc(row.score)} / 100</summary>${feedbackMarkup(row.feedback)}</details>`).join('')}`:''}<div class="rxa-actions">${button(t(view.mode==='training'?'oneMore':'newSession'),'new-session',{primary:true,disabled:busy,glyph:'arrow'})}${options.onExit?button(t('back'),'exit',{}):''}</div></section>`;
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
    root.classList.add('reception-ai-root'); root.setAttribute('lang',locale); root.setAttribute('aria-busy',String(busy)); root.dataset.mobilePane=mobilePane;
    root.dataset.caseId=view?.case?.id||'';
    root.innerHTML = header() + alerts() + (restoring?`<div class="rxa-loading" role="status"><div class="rxa-spinner" aria-hidden="true"></div>${esc(t('loading'))}</div>`:!view?landing():view.status==='complete'?complete():workspace());
    media.refresh();
    updateViewport();
    enteringMessages.clear(); enteringDocuments.clear();
    const pendingNode=root.querySelector('[data-pending-message]'); if(pendingNode)lastPendingRenderedId=pendingNode.dataset.messageId;
    resizeComposer();
    for (const details of root.querySelectorAll('details[data-details]')) if (detailOpen.has(details.dataset.details)) details.open = true;
    if (focusKey) {
      const replacement = [...root.querySelectorAll('[data-focus]')].find(el=>el.dataset.focus===focusKey);
      if (replacement && !replacement.disabled) { replacement.focus({preventScroll:true}); if (selection && typeof replacement.setSelectionRange==='function') try { replacement.setSelectionRange(...selection); } catch {} }
    }
    const nextLog = root.querySelector('.rxa-messages');
    if (nextLog && (mobilePane==='chat'||!matchMedia('(max-width:820px)').matches)) {
      nextLog.scrollTop = scrollChat || scroll.bottom ? nextLog.scrollHeight : scroll.top;
      if(scrollChat)chatScroll={top:nextLog.scrollTop,bottom:true};
    }
  }
  function updateViewport() {
    const height=visualViewport?.height||window.innerHeight||800;
    const editing=root.contains(document.activeElement)&&/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName||'');
    const keyboard=editing&&(visualViewport?.scale ?? 1)===1&&window.innerHeight-height>130;
    root.style.setProperty('--rxa-visible-height',Math.round(height)+'px');
    root.dataset.compactViewport=String(height<620);root.dataset.keyboardOpen=String(keyboard);
  }
  function resizeComposer() {
    const field=root.querySelector('[data-message-draft]');if(!field)return;
    field.style.height='auto';field.style.height=Math.min(144,Math.max(46,field.scrollHeight))+'px';
    const counter=root.querySelector('[data-message-count]');if(counter)counter.textContent=draftMessage.length?`${draftMessage.length} / 2000`:'';
  }
  function updateDraftStatus() {
    persist(); const note = root.querySelector('[data-save-note]'); if (note) note.textContent = t(storageOkay?'savedDraft':'storageError');
  }
  function acceptView(next, body) {
    const previousCase = view?.case?.id || savedCaseId;
    const sameCase = previousCase === next.case?.id;
    const previousIds=new Set(view?.messages?.map(m=>m.id)||[]), previousDocs=new Set(view?.documents?.map(d=>d.id)||[]);
    enteringMessages=new Set(['start','message','next'].includes(body.op)?(next.messages||[]).filter(m=>!previousIds.has(m.id)&&!(m.id===`${body.requestId}-user`&&lastPendingRenderedId===`pending-${body.requestId}`)).map(m=>m.id):[]);
    enteringDocuments=new Set(body.op==='message'?(next.documents||[]).filter(d=>!previousDocs.has(d.id)).map(d=>d.id):[]);
    view = next; mode = next.mode || mode; confirmation = false;
    if (!sameCase) { decisionDraft = blankDecision(); followupDraft='';detailOpen=new Set(['assessment-facts']);draftMessage = ''; selectedDoc = ''; tab = 'documents'; mobilePane='chat';chatScroll={top:0,bottom:true}; }
    if (next.decision && next.status !== 'active') decisionDraft = restoreDecision(next.decision,!!next.case?.assessment);
    if (body.op === 'message' && draftMessage.trim() === body.text) draftMessage = '';
    if (body.op === 'document') {selectedDoc = body.documentId; tab='documents'; mobilePane='desk';}
    if (body.op === 'decide'||body.op==='followup') {mobilePane='desk';tab='decision';}
    if (body.op === 'start') { decisionDraft = blankDecision(); draftMessage = ''; selectedDoc = ''; tab = 'documents'; }
    if(next.case?.assessment)decisionDraft=restoreDecision(decisionDraft,true);else delete decisionDraft.assessment;
    savedCaseId = next.case?.id || '';
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
        acceptView(next,body); if (mutation) pending = null; if(body.op==='resume'||body.op==='start')needsResume=false;
      } catch (problem) {
        if (disposed || problem.code === 'cancelled') return;
        error = problem; const code = String(problem.code||'').replaceAll('_','-');
        // A definitive rejection is safe to amend; an uncertain transport failure keeps its idempotency key.
        if(/request-failed|request-interrupted|provider-unavailable|provider-invalid|unavailable|revision|conflict|stale|busy/.test(code))needsResume=true;
        if (mutation && (/request-failed|request-interrupted|provider-unavailable|provider-invalid|unavailable|busy|revision|conflict|stale|budget|limit|quota|auth|token|forbidden|not-found|not-configured|unsafe-endpoint|local-demo|profile-required|invalid-|closed|completed|locked|validation|not-active|not-reviewed|pilot-incomplete/.test(code)
          && !/invalid-response/.test(code))) pending = null;
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
    await perform({op:'message',sessionId:view.id,text:value,requestId:newRequestId(),expectedRevision:view.revision});
  }
  async function changeLocale(value) {
    const chosen = normalizeLocale(value);
    locale = chosen; t = translator(locale); persist(); render();
    if (busy || pending) { requestedLocale=chosen;return; }
    if (view && view.locale !== chosen) await perform({op:'locale',sessionId:view.id,locale:chosen});
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
    if(view.case?.assessment&&['actionIds','assessment.research.recordId','assessment.research.fragmentId'].includes(field))render();
  }
  function incompleteDecision() {
    // In the authored bank a blank field is an unanswered item, scored by the
    // server. Confirmation still records that choice without forcing a guess.
    if(view.case?.assessment)return;
    const required=['procedureId','routeId','law.number','law.article','deadline'];
    return required.find(path=>{const value=path.split('.').reduce((v,k)=>v?.[k],decisionDraft);return typeof value!=='string'||!value.trim();});
  }
  const input = event => {
    if (event.target.matches('[data-message-draft]')) {draftMessage=event.target.value;resizeComposer();updateDraftStatus();}
    else if(event.target.matches('[data-decision]')&&!['checkbox','radio'].includes(event.target.type))editDecision(event.target);
  };
  const change = event => {
    if(event.target.matches('[data-language]'))void changeLocale(event.target.value);
    else if(event.target.matches('[data-decision]'))editDecision(event.target);
    else if(event.target.matches('[data-followup-choice]')&&view?.status==='followup'){followupDraft=event.target.value;updateDraftStatus();}
  };
  const submit = event => {
    if(event.target.matches('[data-chat-form]')){event.preventDefault();void sendMessage();}
    if(event.target.matches('[data-decision-form]')){
      event.preventDefault();if(busy||pending||paused||!active())return;
      const missing=incompleteDecision();
      if(missing){error=new ReceptionAPIError('incomplete-decision');render();const field=root.querySelector(`[data-decision="${missing}"]`);for(let details=field?.closest('details');details;details=details.parentElement?.closest('details'))details.open=true;field?.focus();field?.scrollIntoView({block:'center',behavior:'instant'});return;}
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
      event.preventDefault();const tabs=['documents','sources','decision'];let index=tabs.indexOf(tab);
      index=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;tab=tabs[index];persist();render();root.querySelector(`#rxaTab-${tab}`)?.focus();
    }
  };
  const click = async event => {
    const target=event.target.closest('[data-action]');if(!target||!root.contains(target)||target.disabled||disposed)return;
    const action=target.dataset.action;
    if(action==='exit'){options.onExit?.();return;}
    if(action==='chat'){mobilePane='chat';persist();render();root.querySelector('#rxaConversation')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});root.querySelector('[data-message-draft]')?.focus({preventScroll:true});return;}
    if(action==='tab'||action==='workspace'){const selected=target.dataset.tab||target.dataset.panel;if(!['documents','sources','decision'].includes(selected))return;tab=selected;mobilePane='desk';confirmation=false;persist();render();if(action==='workspace')root.querySelector('#rxaDesk')?.scrollIntoView({behavior:'instant',block:'start'});return;}
    if(action==='cancel-confirm'){confirmation=false;render();return;}
    if(busy||paused)return;
    if(action==='retry'&&pending){await perform(clone(pending),{retry:true});return;}
    if(action==='refresh'){const sessionId=view?.id||initial?.sessionId;if(sessionId)await perform({op:'resume',sessionId});return;}
    if(action==='new-session'||action==='clear-session') {
      if(view&&view.status!=='complete')return;
      view=null;pending=null;error=null;draftMessage='';decisionDraft=blankDecision();followupDraft='';detailOpen.clear();savedCaseId='';selectedDoc='';confirmation=false;tab='documents';mobilePane='chat';pendingAt=null;lastPendingRenderedId='';
      if(initial)initial.sessionId='';try{store?.removeItem(storageKey);}catch{}render();return;
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
      tab='decision';mobilePane='desk';detailOpen.add('assessment-research');confirmation=false;persist();render();root.querySelector('[data-decision="assessment.research.extracted"]')?.focus({preventScroll:true});root.querySelector('[data-details="assessment-research"]')?.scrollIntoView({block:'start',behavior:'instant'});return;
    }
    if(action==='start') {
      if(mode==='independent'&&!canIndependent())return;
      await perform({op:'start',studentKey:backend?.getProfile?.()?.studentKey||options.studentKey||undefined,mode,locale,requestId:newRequestId()});return;
    }
    if(action==='document'&&view) {
      tab='documents';mobilePane='desk';
      if((view.openedDocumentIds||[]).includes(target.dataset.id)){selectedDoc=target.dataset.id;persist();render();}
      else await perform({op:'document',sessionId:view.id,documentId:target.dataset.id,requestId:newRequestId()});return;
    }
    if(action==='confirm-decision'&&active()&&confirmation){await perform({op:'decide',sessionId:view.id,decision:clone(decisionDraft),requestId:newRequestId()});return;}
    if(action==='next'&&view?.status==='review'){await perform({op:'next',sessionId:view.id,requestId:newRequestId()});}
  };
  const toggle = event => {const node=event.target;if(!node.matches?.('details[data-details]')||!root.contains(node))return;if(node.open)detailOpen.add(node.dataset.details);else detailOpen.delete(node.dataset.details);persist();};
  const identity = () => {if(ownerNow()!==owner){persist();error=new ReceptionAPIError('identity-changed');paused=true;render();}};
  root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('submit',submit);root.addEventListener('keydown',keydown);root.addEventListener('click',click);
  root.addEventListener('toggle',toggle,true);
  window.addEventListener('rudn:identitychange',identity);
  window.addEventListener('resize',updateViewport);visualViewport?.addEventListener('resize',updateViewport);
  root.addEventListener('focusin',updateViewport);root.addEventListener('focusout',updateViewport);
  updateAdapter = createUpdateAdapter({module:'reception',root,signal:lifetime.signal,diagnostics:options.diagnostics,
    getIdentity:()=>({owner,attemptId:view?.id||'reception-ai-start'}),isBusy:()=>busy||!!pending||!!root.ownerDocument.querySelector('.rx-source-dialog[open]'),
    pause:async value=>{paused=value;await work;},
    capture:()=>({version:VERSION,locale,tab,selectedDoc,mobilePane,view:captureUpdateView(root)}),
    checkpoint:async()=>{await work;if(!persist())throw Error('update/not-durable');return {durable:true,revision:view?.revision||0,checkpointRef:{id:view?.id||'reception-ai-start',revision:view?.revision||0,version:VERSION}};},
    restore:async({state:saved,checkpointRef},{signal}={})=>{if(saved.version!==VERSION||checkpointRef.id!==(view?.id||'reception-ai-start'))return {status:'blocked',code:'incompatible'};tab=saved.tab;selectedDoc=saved.selectedDoc;mobilePane=saved.mobilePane||'chat';render();await restoreUpdateView(root,saved.view,{signal});return {status:'restored',code:'ok'};},
  });
  const cleanup = () => {
    if(disposed)return Promise.resolve();persist();disposed=true;updateAdapter?.destroy();reader.destroy();media.destroy();lifetime.abort();options.signal?.removeEventListener('abort',stop);
    root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('submit',submit);root.removeEventListener('keydown',keydown);root.removeEventListener('click',click);
    root.removeEventListener('toggle',toggle,true);
    window.removeEventListener('rudn:identitychange',identity);
    window.removeEventListener('resize',updateViewport);visualViewport?.removeEventListener('resize',updateViewport);
    root.removeEventListener('focusin',updateViewport);root.removeEventListener('focusout',updateViewport);
    return Promise.resolve();
  };
  Object.assign(cleanup,{module:'reception',flush:async()=>{await work;persist();},refreshLocale:changeLocale,getLocale:()=>locale,
    prepareForUpdate:value=>updateAdapter.prepareForUpdate(value),resumeAfterUpdate:value=>updateAdapter.resumeAfterUpdate(value),
    cancelPreparation:value=>updateAdapter.cancelPreparation(value),commitPreparation:()=>updateAdapter.commitPreparation()});
  lifetime.signal.addEventListener('abort',cleanup,{once:true});
  render();
  if(initial?.sessionId){restoring=true;render();await perform({op:'resume',sessionId:initial.sessionId});if(view&&view.locale!==locale&&!pending)await changeLocale(locale);}
  return cleanup;
}
