import {VERSION,ACT_TYPES,escapeHTML as e,uid,gradeTask,scoreDossier,chooseCase,assessmentReady,searchUnits,expandIds,selectionLimit,hash32,parseDossierAnswer} from './lib/core.mjs';
import {Store,editorLease,freshState,RevisionConflict} from './lib/storage.mjs';
import {Corpus} from './lib/corpus.mjs';
import {LocalLive} from './lib/live.mjs';
import {localizeContent} from './locales/content.mjs';
import {translate,translateDOM,normalizeLocale} from './locales/ui.mjs';
const BASE=new URL('./',import.meta.url);
const SCAN_EYE='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h11l6 6v20H8z"/><path d="M19 3v7h6M12 15h9M12 19h9M12 23h6"/></svg>';
const clip=(s,n=120)=>String(s).length>n?String(s).slice(0,n-1)+'…':String(s);
const count=(a)=>Object.keys(a||{}).length;
const timeText=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
function external(url,text){let u;try{u=new URL(url);}catch{return '';}if(!['https:','http:'].includes(u.protocol))return '';return `<a href="${e(u.href)}" target="_blank" rel="noopener noreferrer">${e(text)} ↗</a>`;}
function asset(path){return new URL(path,BASE).href;}
function applyStyle(){if(!document.querySelector('link[data-legal-lab-style]')){const link=document.createElement('link');link.dataset.legalLabStyle='1';link.rel='stylesheet';link.href=new URL('style.css',BASE).href;document.head.append(link);}}

/** Mounts into the course DOM. The host retains authentication, navigation,
 * gradebook, Firebase SDK, access gates and service worker. */
export async function mountLegalLab(container, options={}) {
  if(!(container instanceof HTMLElement))throw new TypeError('A mount HTMLElement is required');
  applyStyle();const app=new LegalLab(container,options);await app.initialize();
  return {contentVersion:app.catalog?.contentVersion,destroy:()=>app.destroy(),flush:()=>app.flush(),setLocale:lang=>app.setLocale(lang),getReport:()=>app.state?.assessment?.result||null};
}
class LegalLab {
  constructor(root,opt){
    this.root=root;this.opt=opt;this.controller=new AbortController();this.signal=this.controller.signal;
    this.owner=opt.owner||'guest';this.teacher=Boolean(opt.isTeacher??opt.backend?.isAdmin?.());this.demo=opt.demo===true;
    this.period=opt.period||String(new Date().getMonth()<8?new Date().getFullYear()-1:new Date().getFullYear());
    this.identityGeneration=opt.backend?.generation;this.locale=normalizeLocale(opt.locale);this.unitIndexes=new WeakMap();this.revision=0;this.seq=0;this.closed=false;this.pending=0;this.queue=Promise.resolve();this.readOnly=false;this.notice='';this.noticeType='info';this.view='home';this.renderedLearningTask=null;this.pendingLearningScroll=null;this.live=null;this.liveData=null;this.search='';this.librarySearch='';this.libraryContent=false;this.libraryHits=null;this.libraryDoc=null;this.scanZoom=1;this.scanHints=false;this.scanContext=null;this.scanTouch=null;this.suppressScanClickUntil=0;this.assessmentField=0;this.activeType=0;this.assessmentDoc=null;this.confirming=false;this.submitting=false;
    this.abortParent=()=>this.destroy();opt.signal?.addEventListener('abort',this.abortParent,{once:true});
  }
  active(){return !this.closed&&!this.signal.aborted&&(!this.opt.backend||this.opt.backend.generation===this.identityGeneration);}
  async initialize(){
    this.root.classList.add('legal-lab');this.root.lang=this.locale;this.root.innerHTML='<div class="ll-loading" role="status">Открываем рабочее место…</div>';
    try {
      this.corpus=await new Corpus(BASE,{signal:this.signal}).initialize();if(!this.active())return;
      Object.assign(this,{catalog:this.corpus.catalog,scans:this.corpus.scans},localizeContent(this.corpus.bank,this.corpus.cases,this.locale));
      this.namespace=`${this.owner}:${this.period}`;this.store=new Store(this.namespace);this.lease=await editorLease(this.namespace);this.readOnly=!this.lease.acquired;
      const local=await this.store.get('session');if(!this.active())return;
      const incoming=this.opt.initialState;const saved=incoming?{revision:local?.revision||0,value:structuredClone(incoming)}:local;
      if(saved?.value&&(!saved.value.answers||!saved.value.reader||!saved.value.id))throw new Error('Invalid draft state');
      if(saved&&saved.value.contentVersion!==this.catalog.contentVersion){this.revision=saved.revision;this.incompatible=saved.value;this.state=freshState(this.catalog.contentVersion);this.readOnly=true;this.notice='Сохранённая работа относится к прежнему комплекту заданий. Экспортируйте её и обратитесь к преподавателю.';this.noticeType='warning';}
      else {this.state=saved?.value||freshState(this.catalog.contentVersion);this.revision=saved?.revision||0;}
      this.view=this.state.view||'home';if(!['home','learn','library','assessment','help'].includes(this.view))this.view='home';
      if(this.readOnly&&!this.incompatible)this.notice='Другая вкладка редактирует эту работу. Здесь доступен просмотр. Закройте другую вкладку и обновите страницу.';
      if(this.catalog.documents.every(d=>d.coverage==='excerpts'))await this.corpus.all();
      this.clickHandler=ev=>{if(ev.detail!==0&&ev.target.closest('.ll-scan-viewport')&&(this.scanTouch||Date.now()<this.suppressScanClickUntil)){ev.preventDefault();ev.stopPropagation();return;}const b=ev.target.closest('[data-action]');if(b&&this.root.contains(b)&&!b.disabled){ev.preventDefault();this.action(b.dataset.action,b).catch(err=>this.fail(err));}};
      this.inputHandler=ev=>this.input(ev);this.submitHandler=ev=>{if(ev.target.matches('[data-search-form]')){ev.preventDefault();this.runSearch(ev.target.dataset.searchForm).catch(err=>this.fail(err));}};
      this.scanTouchHandler=ev=>this.handleScanTouch(ev);
      for(const type of ['touchstart','touchmove','touchend','touchcancel'])this.root.addEventListener(type,this.scanTouchHandler,{passive:false,signal:this.signal});
      this.root.addEventListener('click',this.clickHandler);this.root.addEventListener('input',this.inputHandler);this.root.addEventListener('change',this.inputHandler);this.root.addEventListener('submit',this.submitHandler);
      this.identityHandler=()=>{if(!this.active()||this.opt.getOwner&&this.opt.getOwner()!==this.owner)this.destroy();};
      window.addEventListener('rudn:identitychange',this.identityHandler);
      this.beforeUnload=ev=>{if(this.pending){ev.preventDefault();ev.returnValue='';}};window.addEventListener('beforeunload',this.beforeUnload);
      this.tick=setInterval(()=>{if(!this.active())return;if(document.visibilityState==='visible')this.state.elapsedMs+=1000;const el=this.root.querySelector('[data-clock]');if(el)el.textContent=timeText(this.state.elapsedMs);if(this.state.elapsedMs%15000===0)this.persist().catch(err=>this.fail(err));},1000);
      // Older drafts may contain a classroom link. It never reconnects or
      // restricts navigation in the automatic, page-scoped shared activity.
      delete this.state.liveRoom;
      await this.initializePresence();await this.render();
    } catch(err){if(err.name==='AbortError'||!this.active())return;console.error('Legal Lab loading failed',err);this.root.innerHTML=`<div class="ll-alert ll-danger" role="alert"><h2>Модуль не открылся</h2><p>Не удалось открыть материалы. Проверьте соединение и повторите загрузку.</p><button class="ll-primary" data-retry-load>Повторить загрузку</button></div>`;translateDOM(this.root,this.locale);this.root.querySelector('[data-retry-load]').addEventListener('click',()=>window.location.reload());}
  }
  persist(){
    if(!this.state||this.readOnly||this.closed)return this.queue;
    const snapshot=structuredClone({...this.state,view:this.view});this.pending++;
    this.queue=this.queue.catch(()=>{}).then(async()=>{try{if(this.readOnly||!this.active())return;const record=await this.store.put('session',snapshot,this.revision);this.revision=record.revision;
      if(this.opt.checkpoint&&this.active()){try{await this.opt.checkpoint({attemptId:snapshot.assessment?.attemptId||snapshot.id,contentVersion:this.catalog.contentVersion,state:snapshot,mode:snapshot.assessment&&!snapshot.assessment.preview?'assessment':'practice'});}catch(err){if(['RevisionConflict','DraftConflict'].includes(err?.name)){this.readOnly=true;this.notice='Работа изменена на другом устройстве. Обновите страницу, чтобы загрузить актуальный черновик.';this.noticeType='warning';void this.render();throw err;}this.notice='Сохранено на устройстве. Облачная копия черновика пока недоступна.';this.noticeType='warning';}}
      const label=this.root.querySelector('[data-save-state]');if(label)label.textContent=translate(this.store.mode==='indexeddb'?'Сохранено на устройстве':'Резервное локальное сохранение',this.locale);
    }catch(err){if(err instanceof RevisionConflict)this.readOnly=true;throw err;}finally{this.pending--;}});
    return this.queue;
  }
  flush(){return this.persist();}
  fail(err){if(!this.active()||err?.name==='AbortError')return;console.warn('Legal Lab action failed',err);if(['RevisionConflict','DraftConflict'].includes(err?.name))this.notice='Работа изменена на другом устройстве. Обновите страницу, чтобы загрузить актуальный черновик.';else this.notice=['Связь недоступна. Дождитесь подключения.','Профиль изменён. Откройте модуль заново.','Для досье можно выбрать до трёх документов','Самостоятельная работа ещё не открыта'].includes(err?.message)?err.message:'Не удалось выполнить действие. Ответы сохранены. Повторите попытку.';this.noticeType='danger';this.render().catch(()=>{});}
  isLocked(){return this.readOnly||!this.active();}
  doc(id){return this.catalog.documents.find(d=>d.id===id);}
  task(){return this.bank.classroom[Math.max(0,Math.min(this.state.index||0,this.bank.classroom.length-1))];}
  selectedTask(){return this.extraTask||this.task();}
  answer(t){return this.state.answers[t.id]||{docId:t.kind==='history'?null:t.docId,selections:[],submitted:false};}
  liveFor(t){return this.liveData?.taskId===t?.id?this.liveData:null;}
  displayCorrect(t){return Boolean(this.answer(t).submitted);}
  async render(){
    if(!this.active()||!this.state)return;this.syncPresenceTask();const epoch=++this.seq;let body='';
    if(this.view==='home')body=this.home();
    else if(this.view==='help')body=this.help();
    else if(this.view==='learn')body=await this.learning();
    else if(this.view==='library')body=await this.library(false);
    else if(this.view==='assessment')body=await this.assessment();
    if(!this.active()||epoch!==this.seq)return;
    const warn=this.notice?`<div class="ll-alert ll-${e(this.noticeType)}" role="status">${e(this.notice)} <button data-action="dismiss" aria-label="Закрыть сообщение">×</button></div>`:'';
    const language='';
    const focus=document.activeElement;const focusInfo=this.root.contains(focus)&&focus?.dataset?.input?{input:focus.dataset.input,start:focus.selectionStart,end:focus.selectionEnd}:null;const focusButton=this.root.contains(focus)&&focus?.dataset?.action?{...focus.dataset}:null;
    const learningTask=this.view==='learn'?this.selectedTask().id:null;
    const preserveReading=learningTask&&learningTask===this.renderedLearningTask,previousMinHeight={value:this.root.style.getPropertyValue('min-height'),priority:this.root.style.getPropertyPriority('min-height')};
    const oldViewport=this.root.querySelector('.ll-scan-viewport');const scanPosition=oldViewport?{key:oldViewport.dataset.scanContext,left:oldViewport.scrollLeft,top:oldViewport.scrollTop}:null;this.cancelScanTouch();
    try{
      // WebKit can clamp page scroll while innerHTML briefly removes all children.
      if(preserveReading)this.root.style.setProperty('min-height',this.root.getBoundingClientRect().height+'px',previousMinHeight.priority);
      this.root.innerHTML=`<header class="ll-header"><button class="ll-brand" data-action="home" aria-label="На главную модуля">${ICON}<span><strong>На подпись</strong><small>Правовые акты · Семинар 4</small></span></button><div class="ll-header-meta"><span class="ll-chip">${this.teacher?'Преподаватель':this.demo?'Демонстрация':'Практикум'}</span><span class="ll-clock" title="Ориентир занятия – 90 минут; скорость не влияет на балл"><span data-clock>${timeText(this.state.elapsedMs)}</span><small> / 90 мин</small></span><button class="ll-icon-button" data-action="exit" aria-label="Вернуться к курсу">↗</button></div></header><nav class="ll-nav" aria-label="Разделы практикума">${[['home','Маршрут'],['learn','Занятие'],['library','Библиотека'],['assessment','Моё досье'],['help','Справка']].map(([v,t])=>`<button data-action="view" data-view="${v}" class="${this.view===v?'active':''}" ${this.view===v?'aria-current="page"':''}>${t}</button>`).join('')}</nav>${language}${warn}${this.incompatible&&this.lease?.acquired&&(this.demo||this.incompatible.assessment?.preview)?'<div class="ll-alert ll-warning"><button class="ll-secondary" data-action="archive-preview">Архивировать старую демонстрацию и открыть новый комплект</button></div>':''}<main class="ll-main">${body}</main><footer class="ll-footer"><span data-save-state>${this.readOnly?'Только просмотр':this.pending?'Сохраняем…':'Сохранение на устройстве'}</span></footer><div class="ll-sr" aria-live="polite" id="ll-live-region"></div>`;
      translateDOM(this.root,this.locale);this.applyPresence();
      const viewport=this.root.querySelector('.ll-scan-viewport');if(!viewport)this.scanContext=null;else if(scanPosition?.key===viewport.dataset.scanContext){viewport.scrollLeft=scanPosition.left;viewport.scrollTop=scanPosition.top;}
      if(focusInfo){const el=this.root.querySelector(`[data-input="${CSS.escape(focusInfo.input)}"]`);if(el){el.focus({preventScroll:true});if(typeof focusInfo.start==='number')try{el.setSelectionRange(focusInfo.start,focusInfo.end);}catch{}}}
      if(!focusInfo&&focusButton){const keys=['action','id','index','value','view','unit'];const selector=keys.filter(k=>focusButton[k]!==undefined).map(k=>`[data-${k}="${CSS.escape(focusButton[k])}"]`).join('');const el=this.root.querySelector(selector);if(el&&!el.disabled)el.focus({preventScroll:true});}
    }finally{
      if(preserveReading){
        this.root.getBoundingClientRect();
        if(previousMinHeight.value)this.root.style.setProperty('min-height',previousMinHeight.value,previousMinHeight.priority);
        else this.root.style.removeProperty('min-height');
      }
    }
    if(learningTask!==this.renderedLearningTask){
      this.renderedLearningTask=learningTask;this.pendingLearningScroll=learningTask;
      if(learningTask)requestAnimationFrame(()=>{
        if(!this.active()||this.view!=='learn'||this.pendingLearningScroll!==learningTask)return;
        this.pendingLearningScroll=null;this.root.querySelector('.ll-question-card')?.scrollIntoView({block:'start',behavior:'auto'});
      });
    }
    if(this.scrollUnit){const id=this.scrollUnit;this.scrollUnit=null;requestAnimationFrame(()=>this.root.querySelector(`[data-unit="${CSS.escape(id)}"]`)?.scrollIntoView({block:'center',behavior:'auto'}));}
  }
  home(){
    const done=this.bank.classroom.filter(t=>this.state.answers[t.id]?.submitted).length, a=this.state.assessment;
    const ready=assessmentReady(this.catalog).ready;
    return `<section class="ll-hero"><div class="ll-eyebrow">РАБОЧЕЕ МЕСТО · 04</div><h1>Найдите норму.<br><span>Обоснуйте ответ.</span></h1><p>Распознайте документ, найдите норму и подготовьте досье.</p><div class="ll-actions"><button class="ll-primary" data-action="view" data-view="learn">${done?'Продолжить занятие':'Начать занятие'} <span>→</span></button><button class="ll-secondary" data-action="view" data-view="library">Открыть библиотеку</button></div><div class="ll-hero-number" aria-hidden="true">§</div></section><div class="ll-metrics"><div><strong>${done}<small> / ${this.bank.classroom.length}</small></strong><span>Отправлено ответов</span></div><div><strong>${this.catalog.documents.filter(d=>d.main).length}</strong><span>Основных актов</span></div><div><strong>${this.cases.length}</strong><span>Вариантов досье</span></div></div><section class="ll-section"><div class="ll-section-title"><h2>Ваш маршрут</h2><span>Ориентир · 90 минут</span></div><div class="ll-route-cards">${[['01','Прочитать скан','Выберите реквизиты прямо на изображении.','6 мин',0],['02','Определить вид акта','Соотнесите автора, заголовок и вид документа.','8 мин',6],['03','Найти положение','Используйте оглавление и поиск по документу.','38 мин',14]].map(([n,title,desc,time,index])=>`<button class="ll-route-card" data-action="go-task" data-index="${index}"><span class="ll-route-number">${n}</span><h3>${title}</h3><p>${desc}</p><small>${time} <span>→</span></small></button>`).join('')}</div></section><section class="ll-dossier-banner"><div><div class="ll-eyebrow">САМОСТОЯТЕЛЬНАЯ РАБОТА</div><h2>${a?`Ваше досье ${e(a.caseId)}`:'Одно досье. Все основные навыки.'}</h2><p>Другие сканы, другие ситуации, случайное назначение. Реквизиты, виды актов, поиск документа и правовое основание. До 5 баллов.</p></div><button class="ll-primary" data-action="view" data-view="assessment">${a?'Открыть досье':'Перейти к досье'} →</button></section>${!ready?`<details class="ll-corpus-notice"><summary>Материалы временно недоступны</summary><p>Часть документов ещё не готова. Можно тренироваться; отправка досье на оценку откроется после проверки материалов.</p></details>`:''}${this.livePanel()}<section class="ll-section"><h2>Дополнительные ситуации</h2><div class="ll-actions"><button class="ll-secondary" data-action="extra" data-id="X01">Проверить утверждение</button><button class="ll-secondary" data-action="extra" data-id="H01">Документ на дату события</button></div></section>`;
  }
  livePanel(){
    return '<section class="ll-live-panel"><div><strong>Совместная работа</strong><p>Выбранные ответы видны другим участникам только на том же вопросе. При переходе к другому вопросу или выходе отметки исчезают. Досье выполняется индивидуально.</p></div></section>';
  }
  async learning(){
    const t=this.selectedTask(),a=this.answer(t),revealed=this.displayCorrect(t),agg={scans:{},choices:{},units:{},total:0};
    let body='';
    if(t.kind==='scan')body=this.scanView(this.scans.find(s=>s.id===t.scanId),a.hotspot,{counts:agg.scans,review:revealed,correct:t.answer,action:'hotspot'});
    else if(t.kind==='type')body=this.typeView(t,a.type,{counts:agg.choices,review:revealed,correct:t.answer,action:'type-choice'});
    else if(t.kind==='history')body=`<div class="ll-editions"><h3>Документ для даты события</h3>${t.editionChoices.map(id=>{const d=this.doc(id);return `<button data-action="history-edition" data-id="${id}" class="${a.docId===id?'selected':''}"><strong>${e(d.title)}</strong><span>${e(d.number)}</span></button>`;}).join('')}</div>`;
    else {const d=await this.corpus.load(a.docId||t.docId);body=this.reader(d,a.selections||[],{context:'learning',counts:agg.units,review:revealed,correctIds:expandIds(t.answerSets[0],[d]),limit:selectionLimit(t,[...this.corpus.cache.values()])});}
    if(t.kind==='history'&&a.docId){const d=await this.corpus.load(a.docId);body+=this.reader(d,a.selections||[],{context:'learning',review:revealed,correctIds:expandIds(t.answerSets[0],[d]),limit:selectionLimit(t,[d])});}
    const navDisabled=false;
    const grade=revealed?gradeTask(t,a,[...this.corpus.cache.values()]):null;
    return `<label class="ll-mobile-task-picker">Задание<select data-input="task-picker" ${navDisabled?'disabled':''}>${this.bank.classroom.map((x,i)=>`<option value="${i}" ${!this.extraTask&&this.state.index===i?'selected':''}>${i+1}. ${e(clip(x.kind==='type'?x.title:x.prompt,90))}</option>`).join('')}</select></label><div class="ll-lesson-grid"><aside class="ll-task-list"><div class="ll-eyebrow">СОВМЕСТНЫЙ МАРШРУТ</div><div class="ll-task-scroll">${this.bank.classroom.map((x,i)=>`<button data-action="go-task" data-index="${i}" ${navDisabled?'disabled':''} class="${!this.extraTask&&t.id===x.id?'active':''}"><span>${this.state.answers[x.id]?.submitted?'✓':String(i+1).padStart(2,'0')}</span><span>${e(clip(x.kind==='type'?x.title:x.prompt,68))}</span></button>`).join('')}</div></aside><section class="ll-task-work"><div class="ll-question-card"><div class="ll-question-meta"><span>${this.extraTask?'Дополнительная ситуация':`${this.state.index+1} / ${this.bank.classroom.length}`}</span><span>${({scan:'На скане',type:'Вид акта',text:'В документе',history:'На дату события'})[t.kind]}</span></div><h1>${e(t.prompt)}</h1><p>${t.kind==='scan'?'Нажмите на нужный фрагмент документа.':t.kind==='type'?'Восстановите вид реального документа по автору и заголовку.':'Ответьте фрагментом документа. Нажмите на абзац. При необходимости отметьте несколько.'}</p><div class="ll-live-strip" data-presence-status role="status"></div></div>${body}<div class="ll-task-bottom">${grade?`<div class="ll-feedback ${grade.exact?'success':'attention'}"><strong>${grade.exact?'Основание найдено':grade.fraction>0?'Основание найдено частично':'Сопоставьте ответ с документом'}</strong><p>${e(t.explanation)}</p>${grade.extra?'<p>Уберите лишние фрагменты.</p>':''}${grade.missing?'<p>Выделение пока неполное.</p>':''}</div>`:''}<div class="ll-actions"><button class="ll-secondary" data-action="prev-task" ${navDisabled||(!this.extraTask&&this.state.index===0)?'disabled':''}>← Назад</button><button class="ll-primary" data-action="submit-task" ${this.isLocked()?'disabled':''}>Проверить ответ</button><button class="ll-secondary" data-action="next-task" ${navDisabled?'disabled':''}>Далее →</button></div></div></section></div>`;
  }
  scanView(scan,selected,{review=false,correct=null,action='hotspot'}={}){
    if(!scan)return '<div class="ll-alert ll-danger">Изображение не найдено</div>';
    const question=action==='assessment-hotspot'?this.state.assessment.attemptId+':'+this.assessmentField:this.selectedTask().id;
    const context=this.view+':'+question+':'+scan.id;
    if(this.scanContext!==context){this.cancelScanTouch();this.scanContext=context;this.scanZoom=1;this.scanHints=false;}
    const locked=this.isLocked();
    return `<section class="ll-scan-card ${this.scanHints?'ll-scan-hints-visible':''}"><div class="ll-scan-toolbar"><span>Реальный документ · исторический образец</span><div><button data-action="toggle-scan-hints" aria-label="${this.scanHints?'Скрыть подсказки на скане':'Показать подсказки на скане'}" title="${this.scanHints?'Скрыть подсказки на скане':'Показать подсказки на скане'}" aria-pressed="${this.scanHints}">${SCAN_EYE}</button><button data-action="zoom-out" aria-label="Уменьшить скан" ${this.scanZoom<=1?'disabled':''}>−</button><span data-scan-zoom>${Math.round(this.scanZoom*100)}%</span><button data-action="zoom-in" aria-label="Увеличить скан" ${this.scanZoom>=3?'disabled':''}>+</button></div></div><p class="ll-scan-hint">Разведите два пальца, чтобы увеличить скан. Увеличенный скан перемещайте одним пальцем. Кнопка с глазом покажет доступные фрагменты.</p><div class="ll-scan-viewport" data-scan-context="${e(context)}" role="group" aria-label="Области на скане"><div class="ll-scan" style="width:${this.scanZoom*100}%;max-width:${this.scanZoom*740}px"><img src="${asset(scan.image)}" alt="Скан документа" draggable="false">${scan.hotspots.map(h=>`<button class="ll-hotspot ${selected===h.id?'selected':''} ${review&&selected===h.id&&h.id===correct?'correct':''}" data-action="${action}" data-id="${e(h.id)}" aria-label="${e(this.scanRegionLabel(h))}" aria-pressed="${selected===h.id}" style="left:${h.rect[0]*100}%;top:${h.rect[1]*100}%;width:${h.rect[2]*100}%;height:${h.rect[3]*100}%" ${locked?'disabled':''}></button>`).join('')}</div></div><details class="ll-source-note"><summary>Источник</summary><p data-original lang="ru">${e(scan.source)}</p></details>${review&&selected?`<p class="ll-selected-label"><span>Ваш ответ</span>: <strong>${e(scan.hotspots.find(h=>h.id===selected)?.label||'')}</strong></p>`:''}</section>`;
  }
  scanRegionLabel(h){
    const x=h.rect[0]+h.rect[2]/2,y=h.rect[1]+h.rect[3]/2;
    const positions=[['Фрагмент вверху слева','Фрагмент вверху по центру','Фрагмент вверху справа'],['Фрагмент посередине слева','Фрагмент посередине страницы','Фрагмент посередине справа'],['Фрагмент внизу слева','Фрагмент внизу по центру','Фрагмент внизу справа']];
    return translate(positions[Math.min(2,Math.floor(y*3))][Math.min(2,Math.floor(x*3))],this.locale)+'. '+translate(`Центр: ${Math.round(x*100)}% ширины и ${Math.round(y*100)}% высоты страницы.`,this.locale);
  }
  setScanHints(visible){
    this.scanHints=Boolean(visible);const card=this.root.querySelector('.ll-scan-card');if(!card)return;
    card.classList.toggle('ll-scan-hints-visible',this.scanHints);const button=card.querySelector('[data-action="toggle-scan-hints"]');
    const label=translate(this.scanHints?'Скрыть подсказки на скане':'Показать подсказки на скане',this.locale);button.setAttribute('aria-pressed',String(this.scanHints));button.setAttribute('aria-label',label);button.title=label;
  }
  cancelScanTouch(){if(this.scanTouch)this.suppressScanClickUntil=Date.now()+750;this.scanTouch=null;}
  setScanZoom(value,viewport=this.root.querySelector('.ll-scan-viewport'),center=null,anchor=null){
    if(!viewport?.isConnected)return;const scan=viewport.querySelector('.ll-scan');if(!scan)return;
    const bounds=viewport.getBoundingClientRect(),before=scan.getBoundingClientRect();
    if(!before.width||!before.height)return;
    center||={x:bounds.left+viewport.clientWidth/2,y:bounds.top+viewport.clientHeight/2};
    anchor||={x:(center.x-before.left)/before.width,y:(center.y-before.top)/before.height};
    this.scanZoom=Math.max(1,Math.min(3,value));scan.style.width=this.scanZoom*100+'%';scan.style.maxWidth=this.scanZoom*740+'px';
    const after=scan.getBoundingClientRect();viewport.scrollLeft+=after.left+anchor.x*after.width-center.x;viewport.scrollTop+=after.top+anchor.y*after.height-center.y;
    const card=viewport.closest('.ll-scan-card');card.querySelector('[data-scan-zoom]').textContent=Math.round(this.scanZoom*100)+'%';card.querySelector('[data-action="zoom-out"]').disabled=this.scanZoom<=1;card.querySelector('[data-action="zoom-in"]').disabled=this.scanZoom>=3;
  }
  handleScanTouch(ev){
    if(this.disposing||!this.active())return;
    const viewport=this.scanTouch?.viewport||ev.target.closest?.('.ll-scan-viewport');if(!viewport||!this.root.contains(viewport)){this.cancelScanTouch();return;}
    if(ev.type==='touchcancel'){this.cancelScanTouch();return;}
    const touches=Array.from(ev.touches).filter(t=>viewport.contains(t.target));
    if(!this.scanTouch&&touches.length<2){if(ev.type==='touchstart')this.suppressScanClickUntil=0;return;}
    // Only a gesture begun with two fingers takes over scrolling. A fresh one-finger swipe stays native.
    if(ev.cancelable)ev.preventDefault();this.suppressScanClickUntil=Date.now()+750;
    if(!touches.length){this.scanTouch=null;return;}
    if(touches.length===1){
      const point={x:touches[0].clientX,y:touches[0].clientY},previous=this.scanTouch;
      if(previous?.mode==='pan'&&ev.type==='touchmove'){viewport.scrollLeft+=previous.point.x-point.x;viewport.scrollTop+=previous.point.y-point.y;}
      this.scanTouch={viewport,mode:'pan',point};return;
    }
    const [a,b]=touches,center={x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2},distance=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY),gesture=this.scanTouch;
    if(!gesture||gesture.mode!=='pinch'||gesture.ids[0]!==a.identifier||gesture.ids[1]!==b.identifier){
      const rect=viewport.querySelector('.ll-scan').getBoundingClientRect();if(!rect.width||!rect.height)return;
      this.scanTouch={viewport,mode:'pinch',ids:[a.identifier,b.identifier],distance:Math.max(1,distance),zoom:this.scanZoom,anchor:{x:(center.x-rect.left)/rect.width,y:(center.y-rect.top)/rect.height}};
    }else if(ev.type==='touchmove')this.setScanZoom(gesture.zoom*distance/gesture.distance,viewport,center,gesture.anchor);
  }
  typeView(t,selected,{counts={},review=false,correct=null,action='type-choice',scanId=null}={}){
    const s=scanId?this.scans.find(s=>s.id===scanId):t.scanId?this.scans.find(s=>s.id===t.scanId):null;
    return `<section class="ll-type-card"><div class="ll-document-head"><span class="ll-eyebrow">${e(t.author||s?.author)}</span><div class="ll-missing-type">${selected?e(translate(selected,this.locale)):'ВИД ДОКУМЕНТА'}</div><h2 data-original lang="ru">${e(t.title||s?.classificationTitle)}</h2></div><div class="ll-type-options" role="group" aria-label="Вид документа">${ACT_TYPES.map(v=>`<button data-action="${action}" data-value="${v}" data-scan="${e(scanId||'')}" class="${selected===v?'selected':''} ${review&&v===correct?'correct':''}" aria-pressed="${selected===v}" ${this.isLocked()?'disabled':''}>${v}${counts[v]?`<small>${counts[v]} ответов</small>`:''}</button>`).join('')}</div>${review&&s?`<details class="ll-original"><summary>Открыть оригинал</summary><img src="${asset(s.image)}" alt="Оригинал: ${e(s.title)}" loading="lazy"></details>`:''}${review&&t.sourceUrl?`<p>${external(t.sourceUrl,'Источник документа')}</p>`:''}</section>`;
  }
  reader(d,selected=[],{context='learning',counts={},review=false,correctIds=[],limit=5,readonly=false}={}){
    const rs=this.state.reader[d.id]||{},section=d.sections.find(s=>s.id===rs.sectionId)||d.sections[0],chosen=new Set(selected),correct=new Set(correctIds);
    let unitIndex=this.unitIndexes.get(d);if(!unitIndex){unitIndex=new Map(d.units.map(u=>[u.id,u]));this.unitIndexes.set(d,unitIndex);}
    const sectionUnits=section?.unitIds||[],readerPage=Math.min(rs.readerPage||0,Math.max(0,Math.ceil(sectionUnits.length/80)-1));const visible=sectionUnits.slice(readerPage*80,(readerPage+1)*80).map(id=>unitIndex.get(id)).filter(Boolean);
    const query=rs.query||'',hits=query?searchUnits(d,query):[],page=Math.max(0,Math.min(rs.searchPage||0,Math.max(0,Math.ceil(hits.length/20)-1)));
    
    return `<section class="ll-reader" data-reader-doc="${d.id}"><header class="ll-reader-header"><div><span class="ll-eyebrow">${e(d.number)}</span><h2>${e(d.title)}</h2><span class="ll-revision">${e(d.revisionLabel)}</span></div>${external(d.sourceUrl,'Источник')}</header>${d.coverage!=='full'?'<div class="ll-text-warning">Материалы временно недоступны</div>':''}<form class="ll-searchbar" data-search-form="reader"><button type="button" data-action="toggle-toc" class="ll-secondary">Оглавление</button><input data-input="reader-query" value="${e(query)}" placeholder="Поиск по словам в документе" aria-label="Поиск в документе" autocomplete="off"><button type="submit" class="ll-primary">Найти</button>${query?'<button type="button" data-action="clear-search" class="ll-secondary">Сбросить</button>':''}</form>${query?`<div class="ll-search-results"><strong>${hits.length?'Найдено фрагментов: '+hits.length:'Совпадений нет. Попробуйте другое слово.'}</strong>${hits.slice(page*20,page*20+20).map(u=>`<button data-action="jump-unit" data-id="${e(u.id)}" data-doc="${d.id}"><b>${e(u.locator)}</b><span>${e(clip(u.text,180))}</span></button>`).join('')}${hits.length>20?`<div class="ll-actions"><button type="button" class="ll-secondary" data-action="search-page" data-doc="${d.id}" data-page="${page-1}" ${page===0?'disabled':''}>← Назад</button><span>${page+1} / ${Math.ceil(hits.length/20)}</span><button type="button" class="ll-secondary" data-action="search-page" data-doc="${d.id}" data-page="${page+1}" ${(page+1)*20>=hits.length?'disabled':''}>Далее →</button></div>`:''}</div>`:''}<div class="ll-reader-grid ${rs.tocOpen?'toc-open':''}"><nav class="ll-toc" aria-label="Оглавление документа">${d.sections.map(s=>`<button data-action="section" data-id="${e(s.id)}" data-doc="${d.id}" class="${section?.id===s.id?'active':''}">${e(s.title)}</button>`).join('')}</nav><article class="ll-paper"><h3>${e(section?.title||'Текст документа')}</h3>${visible.map(u=>`<button type="button" class="ll-paragraph ${chosen.has(u.id)?'selected':''} ${review&&correct.has(u.id)?'correct':''} ${counts[u.id]?'peer':''}" data-action="${readonly?'noop':'select-unit'}" data-unit="${e(u.id)}" data-doc="${d.id}" data-context="${context}" aria-pressed="${chosen.has(u.id)}" ${!readonly&&this.isLocked()?'disabled':''}><span class="ll-paragraph-locator" data-original lang="ru">${e(u.locator)}${counts[u.id]?`<span class="ll-peer-badge">${e(translate(String(counts[u.id])+' выбрали',this.locale))}</span>`:''}</span>${u.context?`<small class="ll-unit-context" data-original lang="ru">${e(u.context)}</small>`:""}<span class="ll-paragraph-text" data-original lang="ru">${e(u.text)}</span><span class="ll-check" aria-hidden="true">${chosen.has(u.id)?'✓':'+'}</span></button>${u.imageUrl?`<figure class="ll-source-figure"><a href="${asset('data/'+u.imageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Увеличить изображение"><img src="${asset('data/'+u.imageUrl)}" alt="${e(u.locator)}" loading="lazy" data-original lang="ru"></a><figcaption>Увеличить изображение</figcaption></figure>`:''}` ).join('')}${sectionUnits.length>80?`<div class="ll-actions ll-page-controls"><button class="ll-secondary" data-action="reader-page" data-doc="${d.id}" data-page="${readerPage-1}" ${readerPage===0?'disabled':''}>← Назад</button><span>${readerPage+1} / ${Math.ceil(sectionUnits.length/80)}</span><button class="ll-secondary" data-action="reader-page" data-doc="${d.id}" data-page="${readerPage+1}" ${(readerPage+1)*80>=sectionUnits.length?'disabled':''}>Далее →</button></div>`:''}</article></div>${!readonly?`<div class="ll-selection-tray"><span><b>${selected.length}</b> фрагм. выбрано · максимум ${limit}</span><div>${selected.slice(0,30).map(id=>{const u=[...this.corpus.cache.values()].flatMap(x=>x.units).find(x=>x.id===id);return `<button data-action="remove-unit" data-id="${e(id)}" data-context="${context}">${e(u?.locator||id)} ×</button>`;}).join('')}</div></div>`:''}</section>`;
  }
  async library(assessmentMode){
    if(!assessmentMode&&this.libraryDoc){const d=await this.corpus.load(this.libraryDoc);return `<button class="ll-secondary ll-back" data-action="library-back">← К документам</button>${this.reader(d,[],{readonly:true,context:'library'})}`;}
    const entries=this.libraryHits||this.catalog.documents.map(document=>({document,hits:[]}));
    const chosen=new Set(this.state.assessment?.answer.documentIds||[]);
    return `<section class="ll-library"><div class="ll-section-title"><div><div class="ll-eyebrow">ПРАВОВЫЕ ИСТОЧНИКИ</div><h1>${assessmentMode?'Найдите документ для задачи':'Библиотека документов'}</h1></div><span>${this.catalog.documents.length} документов</span></div><form class="ll-searchbar" data-search-form="library"><input data-input="library-query" value="${e(this.librarySearch)}" placeholder="Название, номер или слова из текста" aria-label="Поиск по библиотеке"><button class="ll-primary" type="submit">Найти</button><label class="ll-checkbox"><input type="checkbox" data-input="library-content" ${this.libraryContent?'checked':''}> По содержанию</label></form><p class="ll-muted">${assessmentMode?'Выберите акт, затем откройте его и найдите правовое основание. Варианты ответов не предлагаются.':'Оглавление и поиск доступны для каждого установленного текста.'}</p><div class="ll-doc-grid">${entries.map(({document:d,hits})=>`<article class="ll-doc-card ${chosen.has(d.id)&&assessmentMode?'selected':''}"><div class="ll-doc-top"><span>${e(d.group)}</span><small>${d.coverage==='full'?'Полный текст':'Выдержки'}</small></div><h2>${e(d.shortTitle)}</h2><p>${e(d.title)}</p><strong>${e(d.number)}</strong><div class="ll-actions">${assessmentMode?`<button class="${chosen.has(d.id)?'ll-primary':'ll-secondary'}" data-action="choose-document" data-id="${d.id}" aria-pressed="${chosen.has(d.id)}" ${this.isLocked()?'disabled':''}>${chosen.has(d.id)?'✓ Выбран':'Выбрать акт'}</button><button class="ll-secondary" data-action="assessment-open-doc" data-id="${d.id}">Читать</button>`:`<button class="ll-primary" data-action="library-open" data-id="${d.id}">Открыть →</button>`}</div>${hits?.length?`<details><summary>Первые найденные фрагменты: ${hits.length}</summary>${hits.map(u=>`<button class="ll-hit" data-action="library-hit" data-doc="${d.id}" data-id="${u.id}" data-context="${assessmentMode?'assessment':'library'}">${e(u.locator)} · ${e(clip(u.text,100))}</button>`).join('')}</details>`:''}</article>`).join('')}</div>${!entries.length?'<div class="ll-empty">Документы не найдены. Попробуйте сократить запрос.</div>':''}</section>`;
  }
  async assessment(){
    const a=this.state.assessment,ready=assessmentReady(this.catalog).ready;
    if(!a)return `<section class="ll-assessment-intro"><span class="ll-eyebrow">25 МИНУТ · ДО 5 БАЛЛОВ</span><h1>Ваше самостоятельное досье</h1><p>После начала система случайно закрепит за вами одно из ${this.cases.length} досье. Назначение сохранится после перезагрузки. Ситуация и сканы отличаются от совместного занятия.</p><div class="ll-criteria-preview">${[['1','Реквизиты','Три области реального скана'],['1','Виды документов','Два новых автора и заголовка'],['1','Поиск документа','Нужный акт в общей библиотеке'],['2','Правовое основание','Достаточный фрагмент текста']].map(([p,h,t])=>`<div><strong>${p}</strong><h3>${h}</h3><p>${t}</p></div>`).join('')}</div>${!ready?`<div class="ll-alert ll-warning"><strong>Материалы временно недоступны</strong><p>Часть документов ещё не готова. Можно тренироваться; отправка досье на оценку откроется после проверки материалов.</p></div>`:''}<button class="ll-primary" data-action="start-assessment" ${this.isLocked()||(!ready&&!this.demo&&!this.teacher)?'disabled':''}>${ready&&!this.demo&&!this.teacher?'Получить досье':'Пройти тренировочное досье'} →</button></section>`;
    const item=this.cases.find(c=>c.id===a.caseId);if(!item)throw new Error('Назначенное досье не найдено');
    if(a.result){await Promise.all([...new Set([...item.docIds,...a.answer.documentIds])].map(id=>this.corpus.load(id)));return this.report(item,a);}
    const stage=a.stage||0;let body='';
    if(stage===0){const f=item.scanQuestions[this.assessmentField];body=`<div class="ll-substeps">${item.scanQuestions.map((x,i)=>`<button data-action="metadata-field" data-index="${i}" class="${this.assessmentField===i?'active':''}">${a.answer.metadata?.[x.field]?'✓ ':''}${e(x.prompt)}</button>`).join('')}</div><h2 class="ll-field-question">${e(f.prompt)}</h2>${this.scanView(this.scans.find(s=>s.id===item.scanId),a.answer.metadata?.[f.field],{action:'assessment-hotspot'})}<p class="ll-source-note">${e(item.sourceNote)}</p>`;}
    else if(stage===1){body=`<div class="ll-substeps">${item.classificationIds.map((id,i)=>`<button data-action="classification-index" data-index="${i}" class="${this.activeType===i?'active':''}">${a.answer.classifications?.[id]?'✓ ':''}Документ ${i+1}</button>`).join('')}</div>${this.typeView({},a.answer.classifications?.[item.classificationIds[this.activeType]],{action:'assessment-type',scanId:item.classificationIds[this.activeType]})}`;}
    else if(stage===2)body=await this.library(true);
    else if(stage===3){const ids=a.answer.documentIds||[];if(!ids.length)body='<div class="ll-empty">Сначала найдите и выберите документ на предыдущем этапе.</div>';else{this.assessmentDoc=ids.includes(this.assessmentDoc)?this.assessmentDoc:ids[0];const d=await this.corpus.load(this.assessmentDoc);body=`<div class="ll-substeps">${ids.map(id=>`<button data-action="assessment-doc" data-id="${id}" class="${id===d.id?'active':''}">${e(this.doc(id).shortTitle)}</button>`).join('')}</div>${this.reader(d,a.answer.selections||[],{context:'assessment',limit:selectionLimit(item,[...this.corpus.cache.values()])})}`;}}
    else body=`<section class="ll-review"><h2>Проверьте собранное досье</h2><div class="ll-review-counts"><p>Области скана: <strong>${count(a.answer.metadata)} / ${item.scanQuestions.length}</strong></p><p>Виды документов: <strong>${count(a.answer.classifications)} / ${item.classificationIds.length}</strong></p><p>Выбрано актов: <strong>${(a.answer.documentIds||[]).length}</strong></p><p>Выбрано фрагментов: <strong>${(a.answer.selections||[]).length}</strong></p></div><p>До отправки можно вернуться к любому этапу. После отправки эта попытка становится доступной только для просмотра. Полнота и точность будут проверены вместе.</p>${this.confirming?`<div class="ll-alert ll-warning"><strong>Завершить работу?</strong><p>Будут отправлены текущие ответы, включая незаполненные позиции.</p><div class="ll-actions"><button class="ll-primary" data-action="finish-assessment" ${this.submitting?'disabled':''}>${this.submitting?'Сохраняем…':'Да, завершить'}</button><button class="ll-secondary" data-action="cancel-finish">Вернуться к проверке</button></div></div>`:`<button class="ll-primary" data-action="confirm-finish" ${this.isLocked()?'disabled':''}>Завершить и проверить досье</button>`}</section>`;
    return `<header class="ll-assessment-heading"><div class="ll-eyebrow">ДОСЬЕ ${e(a.caseId)} · ${a.preview?'ТРЕНИРОВКА':'САМОСТОЯТЕЛЬНАЯ РАБОТА'}</div><h1>${e(item.title)}</h1><p>${e(item.prompt)}</p></header><nav class="ll-stage-nav" aria-label="Этапы досье">${['Реквизиты','Виды актов','Документ','Основание','Отправка'].map((v,i)=>`<button data-action="assessment-stage" data-index="${i}" class="${stage===i?'active':''}" aria-current="${stage===i?'step':'false'}"><span>${i+1}</span>${v}</button>`).join('')}</nav>${body}<div class="ll-stage-bottom"><button class="ll-secondary" data-action="assessment-prev" ${stage===0?'disabled':''}>← Предыдущий этап</button><span>${stage+1} / 5</span><button class="ll-primary" data-action="assessment-next" ${stage===4?'disabled':''}>Следующий этап →</button></div>`;
  }
  report(item,a){
    const docs=[...this.corpus.cache.values()],scan=this.scans.find(s=>s.id===item.scanId);
    const label=(scan,id)=>scan?.hotspots.find(h=>h.id===id)?.label||'Не выбрано';
    const textList=ids=>ids.length?ids.map(id=>{const d=docs.find(d=>d.units.some(u=>u.id===id)),u=d?.units.find(u=>u.id===id);return u?`<blockquote data-original lang="ru"><strong>${e(d.shortTitle||d.title)} · ${e(u.locator)}</strong><p>${e(u.text)}</p></blockquote>`:'';}).join(''):'<p>Не выбрано</p>';
    const names=ids=>ids.length?ids.map(id=>`<li data-original lang="ru">${e(this.doc(id)?.title||id)}</li>`).join(''):'<li>Не выбрано</li>';
    const breakdown=a.result.criteria.map(c=>{
      let chosen='',expected='',reason='';
      if(c.id==='metadata'){
        chosen=item.scanQuestions.map(q=>`<li><span>${e(q.prompt)}</span>: <strong>${e(label(scan,a.answer.metadata?.[q.field]))}</strong></li>`).join('');
        expected=item.scanQuestions.map(q=>`<li><span>${e(q.prompt)}</span>: <strong>${e(label(scan,q.field))}</strong></li>`).join('');
        const n=item.scanQuestions.filter(q=>a.answer.metadata?.[q.field]===q.field).length;
        reason=n===item.scanQuestions.length?'Все позиции совпадают. Баллы начислены полностью.':`Правильных позиций: ${n} из ${item.scanQuestions.length}. Каждая позиция даёт одинаковую долю балла.`;
      }else if(c.id==='classification'){
        chosen=item.classificationIds.map((id,i)=>`<li><span>Документ ${i+1}</span>: <strong>${e(a.answer.classifications?.[id]||'Не выбрано')}</strong></li>`).join('');
        expected=item.classificationIds.map((id,i)=>`<li><span>Документ ${i+1}</span>: <strong>${e(this.scans.find(s=>s.id===id)?.actType)}</strong></li>`).join('');
        const n=item.classificationIds.filter(id=>a.answer.classifications?.[id]===this.scans.find(s=>s.id===id)?.actType).length;
        reason=n===item.classificationIds.length?'Все позиции совпадают. Баллы начислены полностью.':`Правильных позиций: ${n} из ${item.classificationIds.length}. Каждая позиция даёт одинаковую долю балла.`;
      }else if(c.id==='document'){
        chosen=names(a.answer.documentIds||[]);expected=names(item.docIds);reason=c.points===c.max?'Все позиции совпадают. Баллы начислены полностью.':'Учитываются совпавшие документы, пропуски и лишние акты.';
      }else{
        chosen=textList(a.answer.selections||[]);expected=textList(expandIds(item.answerSets[0],docs));
        reason=c.detail?.sourceOK===false?'Фрагменты относятся к документу, который вы не выбрали. За основание баллы не начислены.':c.points===c.max?'Все позиции совпадают. Баллы начислены полностью.':`Совпало: ${c.detail?.matched||0}; пропущено: ${c.detail?.missing||0}; лишних: ${c.detail?.extra||0}. Балл учитывает полноту и точность выделения.`;
      }
      return `<details class="ll-criterion-review" data-criterion="${e(c.id)}"><summary><span>${e(c.label)}</span><strong>${e(c.points)} / ${e(c.max)}</strong></summary><h3>Почему такой балл</h3><p>${e(reason)}</p>${c.id==='evidence'?`<p>${e(item.explanation)}</p>`:''}<div class="ll-review-columns"><section><h3>Ваш ответ</h3>${c.id==='evidence'?chosen:`<ul>${chosen}</ul>`}</section><section><h3>Правильное основание</h3>${c.id==='evidence'?expected:`<ul>${expected}</ul>`}</section></div></details>`;
    }).join('');
    return `<section class="ll-result"><div class="ll-eyebrow">ДОСЬЕ ${e(a.caseId)} · ${a.preview?'ТРЕНИРОВКА':'РАБОТА ЗАВЕРШЕНА'}</div><h1>Досье проверено</h1><div class="ll-result-score">${e(a.result.points)}<small> / 5</small></div><p>${a.preview?'Результат тренировочный и не отправляется в журнал.':a.delivery==='host-accepted'?'Результат сохранён. При подключении к сети журнал синхронизируется автоматически.':'Результат сохранён. Отправка в журнал ещё не подтверждена.'}</p><div class="ll-result-criteria">${a.result.criteria.map(c=>`<div><span>${e(c.label)}</span><meter min="0" max="${e(c.max)}" value="${e(c.points)}" aria-label="${e(c.label)}"></meter><strong>${e(c.points)} / ${e(c.max)}</strong></div>`).join('')}</div><div class="ll-answer-review">${breakdown}</div>${this.reportOnly?'':`<div class="ll-actions"><button class="ll-primary" data-action="export-report">Сохранить отчёт</button>${!a.preview&&a.delivery!=='host-accepted'?'<button class="ll-secondary" data-action="retry-delivery">Повторить передачу в журнал</button>':''}<button class="ll-secondary" data-action="home">К маршруту</button></div>`}</section>`;
  }
  help(){return `<section class="ll-help"><div class="ll-eyebrow">СПРАВКА</div><h1>Как работать с документами</h1><div class="ll-help-grid"><article><h2>Выбор фрагмента на скане</h2><p>Нажмите на нужный фрагмент документа. Разведите два пальца или используйте кнопки масштаба, чтобы рассмотреть скан. Увеличенный скан перемещайте одним пальцем. Кнопка с глазом включает подсказки; после выбора остаётся выделенным только ваш ответ. Для выбора с клавиатуры переходите между фрагментами клавишей Tab и нажимайте Enter. Номер акта, номер государственной регистрации и подпись – разные элементы.</p></article><article><h2>Ответ фрагментом</h2><p>Найдите положение с помощью оглавления или поиска. Нажмите на абзац. Для составного ответа отметьте несколько. Лишние фрагменты снижают точность ответа.</p></article><article><h2>Вид документа</h2><p>Ориентируйтесь на автора и содержание заголовка. Проверка относится к конкретному реальному акту. Распоряжения не ограничены вопросами о сотрудниках.</p></article><article><h2>Совместная работа</h2><p>Выбранные ответы видны другим участникам только на том же вопросе. При переходе к другому вопросу или выходе отметки исчезают. Досье выполняется индивидуально.</p></article></div><h2>Схемы из лекции</h2><p>Ниже сохранены авторские схемы. Они помогают ориентироваться в примерах; правовая форма каждого задания проверяется по его оригиналу.</p>${[36,48,58].map((n,i)=>`<details><summary>${['Федеральный уровень','Уровень субъекта','Муниципальный уровень'][i]} · слайд ${n}</summary><img src="${asset(`assets/help/lecture-${n}.webp`)}" alt="Схема из лекции, слайд ${n}" loading="lazy"></details>`).join('')}<details><summary>Источники и авторство</summary><p data-original lang="ru">${e(this.catalog.sources.lecture)}</p><p data-original lang="ru">${e(this.catalog.sources.tickets)}</p></details><button class="ll-secondary" data-action="export-state">Экспортировать локальную работу</button></section>`;}
  input(ev){const el=ev.target;if(!el.dataset.input)return;switch(el.dataset.input){case'task-picker':this.action('go-task',{dataset:{index:el.value}}).catch(err=>this.fail(err));break;case'library-query':this.librarySearch=el.value;break;case'library-content':this.libraryContent=el.checked;break;case'reader-query':{const id=el.closest('[data-reader-doc]')?.dataset.readerDoc;if(id){this.state.reader[id]||={};this.state.reader[id].query=el.value;this.state.reader[id].searchPage=0;}break;}}}
  async runSearch(which){if(which==='library'){this.libraryHits=await this.corpus.search(this.librarySearch,{content:this.libraryContent,signal:this.signal});}await this.persist();await this.render();}
  async action(action,b){
    if(!this.active())return;
    if(action==='noop')return;
    if(action==='archive-preview'){if(!this.incompatible||!this.lease?.acquired||!(this.demo||this.incompatible.assessment?.preview))return;await this.store.put('archive:'+Date.now(),this.incompatible);this.state=freshState(this.catalog.contentVersion);this.incompatible=null;this.readOnly=false;this.view='home';this.notice='Предыдущая демонстрационная работа сохранена в локальном архиве.';await this.persist();return this.render();}
    if(action==='dismiss'){this.notice='';return this.render();}
    if(action==='exit'){this.live?.watchTask(null);this.presenceTask=null;await this.persist();return this.opt.onExit?.();}
    if(action==='home'||action==='view'){this.view=action==='home'?'home':b.dataset.view;this.extraTask=null;this.syncPresenceTask();await this.persist();return this.render();}
    if(action==='toggle-scan-hints'){this.setScanHints(!this.scanHints);return;}
    if(action==='zoom-in'||action==='zoom-out'){this.setScanZoom(this.scanZoom+(action==='zoom-in'?0.5:-0.5));return;}
    if(action==='go-task'||action==='prev-task'||action==='next-task'){
      this.extraTask=null;this.view='learn';const step=action==='next-task'?1:-1;
      this.state.index=action==='go-task'?Number(b.dataset.index):Math.max(0,Math.min(this.bank.classroom.length-1,this.state.index+step));
      this.syncPresenceTask();await this.persist();return this.render();
    }
    if(action==='extra'){this.extraTask=this.bank.extra.find(t=>t.id===b.dataset.id);this.view='learn';this.syncPresenceTask();return this.render();}
    if(action==='hotspot'||action==='type-choice'||action==='history-edition'){
      if(this.isLocked())return;const t=this.selectedTask(),a=this.answer(t);a.submitted=false;
      if(action==='hotspot'){a.hotspot=b.dataset.id;this.setScanHints(false);}if(action==='type-choice')a.type=b.dataset.value;if(action==='history-edition'){a.docId=b.dataset.id;a.selections=[];}
      this.state.answers[t.id]=a;this.publishPresence();await this.persist();return this.render();
    }
    if(action==='submit-task'){
      if(this.isLocked())return;const t=this.selectedTask(),a=this.answer(t);if(!a.hotspot&&!a.type&&!(a.selections||[]).length){this.notice='Сначала выберите область, вид документа или фрагмент.';return this.render();}
      a.submitted=true;this.state.answers[t.id]=a;await this.persist();
      return this.render();
    }
    if(action==='reader-page'){this.state.reader[b.dataset.doc]||={};this.state.reader[b.dataset.doc].readerPage=Math.max(0,Number(b.dataset.page)||0);await this.persist();return this.render();}
    if(action==='search-page'){this.state.reader[b.dataset.doc]||={};this.state.reader[b.dataset.doc].searchPage=Math.max(0,Number(b.dataset.page)||0);await this.persist();return this.render();}
    if(action==='section'){this.state.reader[b.dataset.doc]||={};this.state.reader[b.dataset.doc].sectionId=b.dataset.id;this.state.reader[b.dataset.doc].readerPage=0;this.state.reader[b.dataset.doc].tocOpen=false;await this.persist();return this.render();}
    if(action==='toggle-toc'||action==='clear-search'){
      const id=b.closest('[data-reader-doc]')?.dataset.readerDoc;if(!id)return;this.state.reader[id]||={};if(action==='toggle-toc')this.state.reader[id].tocOpen=!this.state.reader[id].tocOpen;else this.state.reader[id].query='';return this.render();
    }
    if(action==='jump-unit'||action==='library-hit'){
      const d=await this.corpus.load(b.dataset.doc),u=d.units.find(u=>u.id===b.dataset.id);if(!u)return;
      this.state.reader[d.id]||={};this.state.reader[d.id].sectionId=u.sectionId;this.state.reader[d.id].readerPage=Math.max(0,Math.floor((d.sections.find(s=>s.id===u.sectionId)?.unitIds.indexOf(u.id)||0)/80));this.state.reader[d.id].query='';this.scrollUnit=u.id;
      if(action==='library-hit'){if(b.dataset.context==='assessment'){this.addDocument(d.id);this.state.assessment.stage=3;this.assessmentDoc=d.id;}else this.libraryDoc=d.id;}
      await this.persist();return this.render();
    }
    if(action==='select-unit'||action==='remove-unit'){
      if(this.isLocked())return;const assessment=b.dataset.context==='assessment';if(assessment&&this.state.assessment?.result)return;
      const t=assessment?this.cases.find(c=>c.id===this.state.assessment.caseId):this.selectedTask();const a=assessment?this.state.assessment.answer:this.answer(t);const id=b.dataset.unit||b.dataset.id;
      const list=a.selections||=[],has=list.includes(id);if(!has&&list.length>=selectionLimit(t,[...this.corpus.cache.values()])){this.notice='Достигнут предел фрагментов. Уберите лишний, прежде чем добавить новый.';return this.render();}
      a.selections=has?list.filter(x=>x!==id):[...list,id];if(!assessment){a.docId=b.dataset.doc||a.docId;a.submitted=false;this.state.answers[t.id]=a;this.publishPresence();}
      await this.persist();return this.render();
    }
    if(action==='library-open'){this.libraryDoc=b.dataset.id;return this.render();}
    if(action==='library-back'){this.libraryDoc=null;return this.render();}
    if(action==='start-assessment')return this.startAssessment();
    if(action==='assessment-stage'||action==='assessment-prev'||action==='assessment-next'){
      if(!this.state.assessment||this.state.assessment.result)return;this.state.assessment.stage=action==='assessment-stage'?Number(b.dataset.index):Math.max(0,Math.min(4,this.state.assessment.stage+(action==='assessment-next'?1:-1)));this.confirming=false;await this.persist();return this.render();
    }
    if(action==='metadata-field'){this.assessmentField=Number(b.dataset.index);return this.render();}
    if(action==='classification-index'){this.activeType=Number(b.dataset.index);return this.render();}
    if(action==='assessment-hotspot'||action==='assessment-type'){
      if(this.isLocked()||this.state.assessment?.result)return;const a=this.state.assessment,item=this.cases.find(c=>c.id===a.caseId);
      if(action==='assessment-hotspot'){a.answer.metadata[item.scanQuestions[this.assessmentField].field]=b.dataset.id;this.setScanHints(false);}else a.answer.classifications[b.dataset.scan]=b.dataset.value;
      await this.persist();return this.render();
    }
    if(action==='choose-document'){
      if(this.isLocked()||this.state.assessment?.result)return;const a=this.state.assessment.answer,id=b.dataset.id;
      if(a.documentIds.includes(id)){a.documentIds=a.documentIds.filter(x=>x!==id);const d=await this.corpus.load(id),remove=new Set(d.units.map(u=>u.id));a.selections=a.selections.filter(x=>!remove.has(x));}else this.addDocument(id);
      await this.persist();return this.render();
    }
    if(action==='assessment-open-doc'||action==='assessment-doc'){
      if(action==='assessment-open-doc'){this.addDocument(b.dataset.id);this.state.assessment.stage=3;}this.assessmentDoc=b.dataset.id;await this.persist();return this.render();
    }
    if(action==='confirm-finish'){if(this.isLocked())return;this.confirming=true;return this.render();}
    if(action==='cancel-finish'){this.confirming=false;return this.render();}
    if(action==='finish-assessment')return this.finishAssessment();
    if(action==='retry-delivery'){await this.deliver();return this.render();}
    if(action==='export-report'){return this.download('legal-lab-'+this.state.assessment.caseId+'.json',{contentVersion:this.catalog.contentVersion,caseId:this.state.assessment.caseId,preview:this.state.assessment.preview,answer:this.state.assessment.answer,result:this.state.assessment.result,attemptId:this.state.assessment.attemptId});}
    if(action==='export-state')return this.download('legal-lab-local-work.json',this.incompatible||this.state);
  }
  addDocument(id){const a=this.state.assessment?.answer;if(!a||this.state.assessment.result||this.isLocked())return;if(!this.doc(id))throw new Error('Неизвестный документ');if(!a.documentIds.includes(id)){if(a.documentIds.length>=3)throw new Error('Для досье можно выбрать до трёх документов');a.documentIds.push(id);}}
  async startAssessment(){
    if(this.isLocked())return;if(this.state.assessment){this.view='assessment';return this.render();}
    const ready=assessmentReady(this.catalog).ready;if(!ready&&!this.demo&&!this.teacher)throw new Error('Полный корпус не установлен и не проверен');
    if(this.opt.assessmentAllowed&&!this.opt.assessmentAllowed()&&!this.teacher)throw new Error('Самостоятельная работа ещё не открыта');
    this.view='assessment';this.syncPresenceTask();const item=chooseCase(this.cases,null,this.opt.assignmentSeed ? n=>parseInt(hash32(this.opt.assignmentSeed+'|'+this.catalog.contentVersion),36)%n : undefined);
    this.state.assessment={caseId:item.id,attemptId:this.opt.attemptId||uid(),startedAt:Date.now(),contentVersion:this.catalog.contentVersion,preview:this.demo||this.teacher||!ready,stage:0,phase:'active',answer:{metadata:{},classifications:{},documentIds:[],selections:[]},result:null,delivery:'not-submitted'};
    await this.persist();this.view='assessment';return this.render();
  }
  async finishAssessment(){
    if(this.isLocked()||this.submitting||this.state.assessment?.result)return;this.submitting=true;
    try{const a=this.state.assessment,item=this.cases.find(c=>c.id===a.caseId);const ids=[...new Set([...item.docIds,...a.answer.documentIds])];const docs=await Promise.all(ids.map(id=>this.corpus.load(id)));if(!this.active())return;
      a.result=scoreDossier(item,a.answer,this.scans,docs);a.finishedAt=Date.now();a.phase='completed';a.documentVersions=docs.map(d=>({id:d.id,sha256:d.sha256,revisionLabel:d.revisionLabel}));
      await this.persist();if(!a.preview)await this.deliver();
    }finally{this.submitting=false;this.confirming=false;await this.render();}
  }
  async deliver(){
    const a=this.state.assessment;if(!a?.result||a.preview||a.delivery==='host-accepted')return;
    if(!assessmentReady(this.catalog,[...this.corpus.cache.values()]).ready)throw new Error('Передача заблокирована: корпус не прошёл проверку');
    if(!this.active())throw new Error('Профиль изменён');if(this.opt.assessmentAllowed&&!this.opt.assessmentAllowed())throw new Error('Доступ к оценочной работе закрыт. Результат сохранён локально.');
    const b=this.opt.backend;if(!b?.saveAttempt&&!this.opt.saveAttempt)throw new Error('Адаптер журнала не подключён');
    const profile=b?.getProfile?.();if(b&&(!profile||b.isAdmin?.()))throw new Error('Для передачи результата необходим профиль студента');
    const record={id:a.attemptId,type:'legal-lab',activitySlug:'seminar-4',draftMode:'legal-lab-assessment',title:'Семинар 4. На подпись',studentKey:profile?.studentKey,points:a.result.points,maxPoints:5,recordGrade:true,contentVersion:a.contentVersion,caseId:a.caseId,startedAt:a.startedAt,finishedAt:a.finishedAt,durationMs:a.finishedAt-a.startedAt,legalLab:{criteria:a.result.criteria,answer:a.answer,answerJson:JSON.stringify(a.answer),documentVersions:a.documentVersions}};
    try{const save=this.opt.saveAttempt||((x)=>b.saveAttempt(x));await save(record);if(!this.active())return;a.delivery='host-accepted';await this.persist();}
    catch(err){a.delivery='pending';await this.persist();this.notice='Результат сохранён. Не удалось отправить его в журнал; повторите отправку.';this.noticeType='warning';}
  }
  async initializePresence(){
    if(this.readOnly)return;
    try{
      this.live=this.demo?new LocalLive({contentVersion:this.catalog.contentVersion,participantId:this.state.id}):await this.opt.liveFactory?.({contentVersion:this.catalog.contentVersion,signal:this.signal});
      if(!this.active()){this.live?.close();this.live=null;return;}
      if(!this.live)return;
      this.liveUnsub=this.live.subscribe(snapshot=>{if(!this.active())return;const reconnected=snapshot.connected&&!this.liveData?.connected;this.liveData=snapshot;this.applyPresence();if(reconnected)this.publishPresence();});
      this.presenceVisibilityHandler=()=>{if(document.visibilityState==='visible'&&this.view==='learn')this.publishPresence();};
      document.addEventListener('visibilitychange',this.presenceVisibilityHandler,{signal:this.signal});
    }catch{this.live=null;}
  }
  syncPresenceTask(){
    const taskId=this.view==='learn'&&!this.extraTask?this.task().id:null;
    if(this.presenceTask===taskId)return;
    this.presenceTask=taskId;this.liveData=null;
    this.live?.watchTask(taskId);if(taskId)this.publishPresence();
  }
  publishPresence(){
    if(!this.live||this.isLocked()||this.view!=='learn'||this.extraTask||document.visibilityState!=='visible')return;
    const task=this.selectedTask();if(this.presenceTask!==task.id)return;
    const answer=this.answer(task);
    void this.live.choose({hotspot:answer.hotspot,type:answer.type,docId:answer.docId,selections:answer.selections||[]}).catch(()=>this.applyPresence());
  }
  applyPresence(){
    const task=this.view==='learn'&&!this.extraTask?this.selectedTask():null;
    const snapshot=task&&this.liveData?.taskId===task.id?this.liveData:null;
    const aggregates=snapshot?.connected&&!snapshot.error?snapshot.aggregates:null;
    const status=this.root.querySelector('[data-presence-status]');
    if(status){
      const message=!this.live?'Совместные отметки доступны после входа в профиль.':!snapshot?.connected||snapshot.error?'Общие отметки временно недоступны. Ваш ответ сохранён.':'Сейчас на вопросе ответов: '+(aggregates?.respondents||0);
      status.textContent=translate(message,this.locale);
    }
    this.root.querySelectorAll('[data-presence-count]').forEach(el=>el.remove());
    for(const el of this.root.querySelectorAll('.ll-hotspot'))el.classList.toggle('peer',Boolean(aggregates?.hotspots?.[el.dataset.id])&&!el.classList.contains('selected'));
    for(const el of this.root.querySelectorAll('.ll-type-options [data-action="type-choice"]')){
      const n=aggregates?.classifications?.[el.dataset.value]||0;el.classList.toggle('peer',Boolean(n)&&!el.classList.contains('selected'));
      if(n){const label=document.createElement('small');label.dataset.presenceCount='';label.textContent=translate(n+' выбрали',this.locale);el.append(label);}
    }
    for(const el of this.root.querySelectorAll('.ll-paragraph[data-context="learning"]')){
      const n=aggregates?.selections?.[el.dataset.unit]||0;el.classList.toggle('peer',Boolean(n));
      if(n){const label=document.createElement('span');label.dataset.presenceCount='';label.className='ll-peer-badge';label.textContent=translate(n+' выбрали',this.locale);el.querySelector('.ll-paragraph-locator')?.append(label);}
    }
  }
  leaveLive(){this.liveUnsub?.();this.live?.close();this.live=null;this.liveData=null;this.presenceTask=null;this.liveUnsub=null;document.removeEventListener('visibilitychange',this.presenceVisibilityHandler);}
  download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async setLocale(lang){const extraId=this.extraTask?.id;this.locale=normalizeLocale(lang);this.root.lang=this.locale==='zh'?'zh-Hans':this.locale;Object.assign(this,localizeContent(this.corpus.bank,this.corpus.cases,this.locale));this.extraTask=extraId?this.bank.extra.find(t=>t.id===extraId):null;return this.render();}
  async destroy(){if(this.closed||this.disposing)return this.queue;this.disposing=true;this.leaveLive();this.cancelScanTouch();for(const type of ['touchstart','touchmove','touchend','touchcancel'])this.root.removeEventListener(type,this.scanTouchHandler);clearInterval(this.tick);await this.persist().catch(()=>{});this.closed=true;this.controller.abort();this.lease?.release();this.store?.close();this.opt.signal?.removeEventListener('abort',this.abortParent);this.root.removeEventListener('click',this.clickHandler);this.root.removeEventListener('input',this.inputHandler);this.root.removeEventListener('change',this.inputHandler);this.root.removeEventListener('submit',this.submitHandler);window.removeEventListener('rudn:identitychange',this.identityHandler);window.removeEventListener('beforeunload',this.beforeUnload);this.root.classList.remove('legal-lab');}
}

export async function mountLegalLabReport(container,{attempt,locale='ru',signal}={}){
  if(!(container instanceof HTMLElement))throw new TypeError('A mount HTMLElement is required');
  applyStyle();const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  container.classList.add('legal-lab');container.innerHTML='<div class="ll-loading" role="status">Открываем рабочее место…</div>';translateDOM(container,locale);
  let app;
  const render=async lang=>{
    Object.assign(app,localizeContent(app.corpus.bank,app.corpus.cases,normalizeLocale(lang)));
    const item=app.cases.find(c=>c.id===attempt?.caseId);
    if(!item||attempt?.contentVersion!==app.catalog.contentVersion||!Array.isArray(attempt?.legalLab?.criteria)||!attempt?.legalLab)throw new Error('Report data unavailable');
    const answer=parseDossierAnswer(attempt.legalLab);
    if(!Array.isArray(answer.documentIds)||answer.documentIds.length>3||!Array.isArray(answer.selections)||answer.selections.length>500)throw new Error('Invalid report answer');
    await Promise.all([...new Set([...item.docIds,...answer.documentIds])].map(id=>app.corpus.load(id)));
    if(controller.signal.aborted)return;
    // Stored reports are untrusted student input. Recompute rubric fields from
    // the fixed case and verified documents instead of rendering stored markup.
    if(typeof attempt.points!=='number'||!Number.isFinite(attempt.points)||attempt.points<0||attempt.points>5)throw new Error('Invalid report score');
    const result=scoreDossier(item,answer,app.scans,[...app.corpus.cache.values()]);
    if(Math.abs(result.points-attempt.points)>0.001)throw new Error('Report score does not match its answers');
    container.innerHTML=app.report(item,{caseId:item.id,preview:false,delivery:'host-accepted',answer,result});translateDOM(container,lang);
  };
  try{
    const corpus=await new Corpus(BASE,{signal:controller.signal}).initialize();
    app=Object.create(LegalLab.prototype);Object.assign(app,{corpus,catalog:corpus.catalog,scans:corpus.scans,reportOnly:true});await render(locale);
  }catch(err){if(err.name!=='AbortError'){console.warn('Legal Lab report unavailable',err);container.innerHTML='<div class="ll-alert ll-warning" role="alert">Не удалось открыть материалы. Проверьте соединение и повторите загрузку.</div>';translateDOM(container,locale);}}
  return {setLocale:lang=>app?render(lang):Promise.resolve(),destroy(){controller.abort();signal?.removeEventListener('abort',abort);container.classList.remove('legal-lab');container.replaceChildren();}};
}
