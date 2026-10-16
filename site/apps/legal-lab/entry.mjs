import {VERSION,ACT_TYPES,SCAN_METADATA_MODE,scanQuestionsFor,dossierScanQuestions,normalizeScanSelections,escapeHTML as e,uid,gradeTask,gradeEvidence,scoreDossier,chooseCase,assessmentReady,searchUnits,expandIds,selectionLimit,hash32,parseDossierAnswer} from './lib/core.mjs';
import {Store,editorLease,freshState,RevisionConflict} from './lib/storage.mjs';
import {Corpus} from './lib/corpus.mjs';
import {LocalLive} from './lib/live.mjs';
import {localizeContent} from './locales/content.mjs';
import {translate,translateDOM,normalizeLocale} from './locales/ui.mjs';
const BASE=new URL('./',import.meta.url);
const SCAN_EYE='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h11l6 6v20H8z"/><path d="M19 3v7h6M12 15h9M12 19h9M12 23h6"/></svg>';
const SCAN_FIELD_COLORS=Object.freeze({issuer:'#17658c',type:'#8254a3',title:'#a24d1c',date:'#237366',number:'#994667',signature:'#62652c',approved:'#5261a7',agreed:'#9b592c',registration:'#596b83',acknowledgment:'#7f573d'});
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
    this.identityGeneration=opt.backend?.generation;this.locale=normalizeLocale(opt.locale);this.unitIndexes=new WeakMap();this.revision=0;this.seq=0;this.closed=false;this.pending=0;this.queue=Promise.resolve();this.readOnly=false;this.notice='';this.noticeType='info';this.view='home';this.renderedLearningTask=null;this.pendingLearningScroll=null;this.live=null;this.liveData=null;this.search='';this.librarySearch='';this.libraryContent=false;this.libraryHits=null;this.libraryDoc=null;this.scanZoom=1;this.scanHints=false;this.scanContext=null;this.assessmentField=0;this.activeType=0;this.assessmentDoc=null;this.confirming=false;this.submitting=false;
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
      // Only unfinished drafts adopt the complete-scan rubric. Completed work
      // retains its recorded mode, including the original three-field rubric.
      if(this.state.assessment&&!this.state.assessment.result&&!Object.hasOwn(this.state.assessment.answer,'metadataMode'))this.state.assessment.answer.metadataMode=SCAN_METADATA_MODE;
      if(this.readOnly&&!this.incompatible)this.notice='Другая вкладка редактирует эту работу. Здесь доступен просмотр. Закройте другую вкладку и обновите страницу.';
      if(this.catalog.documents.every(d=>d.coverage==='excerpts'))await this.corpus.all();
      this.clickHandler=ev=>{const b=ev.target.closest('[data-action]');if(b&&this.root.contains(b)&&!b.disabled){ev.preventDefault();this.action(b.dataset.action,b).catch(err=>this.fail(err));}};
      this.inputHandler=ev=>this.input(ev);this.submitHandler=ev=>{if(ev.target.matches('[data-search-form]')){ev.preventDefault();this.runSearch(ev.target.dataset.searchForm).catch(err=>this.fail(err));}};
      this.root.addEventListener('click',this.clickHandler);this.root.addEventListener('input',this.inputHandler);this.root.addEventListener('change',this.inputHandler);this.root.addEventListener('submit',this.submitHandler);
      this.identityHandler=()=>{if(!this.teacherAccess()){this.teacher=false;this.root.querySelectorAll('[data-teacher-answer]').forEach(el=>el.remove());this.root.querySelectorAll('.ll-teacher-target').forEach(el=>el.classList.remove('ll-teacher-target'));}if(!this.active()||this.opt.getOwner&&this.opt.getOwner()!==this.owner)this.destroy();};
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
  answer(t){const saved=this.state.answers[t.id]||{docId:t.kind==='history'?null:t.docId,selections:[],submitted:false};return t.kind==='scan'?{...saved,metadataMode:SCAN_METADATA_MODE,metadata:normalizeScanSelections(t,saved,this.scans),submitted:saved.metadataMode===SCAN_METADATA_MODE&&Boolean(saved.submitted)}:saved;}
  liveFor(t){return this.liveData?.taskId===t?.id?this.liveData:null;}
  displayCorrect(t){return Boolean(this.answer(t).submitted);}
  teacherAccess(){return this.teacher&&this.active()&&(!this.opt.backend||Boolean(this.opt.backend.isAdmin?.()));}
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
    const oldViewport=this.root.querySelector('.ll-scan-viewport');const scanPosition=oldViewport?{key:oldViewport.dataset.scanContext,left:oldViewport.scrollLeft,top:oldViewport.scrollTop}:null;
    try{
      // WebKit can clamp page scroll while innerHTML briefly removes all children.
      if(preserveReading)this.root.style.setProperty('min-height',this.root.getBoundingClientRect().height+'px',previousMinHeight.priority);
      this.root.innerHTML=`<header class="ll-header"><button class="ll-brand" data-action="home" aria-label="На главную модуля">${ICON}<span><strong>На подпись</strong><small>Правовые акты · Семинар 4</small></span></button><div class="ll-header-meta"><span class="ll-chip">${this.teacher?'Преподаватель':this.demo?'Демонстрация':'Практикум'}</span><span class="ll-clock" title="Ориентир занятия – 90 минут; скорость не влияет на балл"><span data-clock>${timeText(this.state.elapsedMs)}</span><small> / 90 мин</small></span><button class="ll-icon-button" data-action="exit" aria-label="Вернуться к курсу">↗</button></div></header><nav class="ll-nav" aria-label="Разделы практикума">${[['home','Маршрут'],['learn','Занятие'],['library','Библиотека'],['assessment','Моё досье'],['help','Справка']].map(([v,t])=>`<button data-action="view" data-view="${v}" class="${this.view===v?'active':''}" ${this.view===v?'aria-current="page"':''}>${t}</button>`).join('')}</nav>${language}${warn}${this.incompatible&&this.lease?.acquired&&(this.demo||this.incompatible.assessment?.preview)?'<div class="ll-alert ll-warning"><button class="ll-secondary" data-action="archive-preview">Архивировать старую демонстрацию и открыть новый комплект</button></div>':''}<main class="ll-main">${body}</main><footer class="ll-footer"><span data-save-state>${this.readOnly?'Только просмотр':this.pending?'Сохраняем…':'Сохранение на устройстве'}</span></footer><div class="ll-sr" aria-live="polite" id="ll-live-region"></div>`;
      translateDOM(this.root,this.locale);this.prepareScanCrops();this.applyPresence();
      const fieldNav=this.root.querySelector('.ll-scan-fields'),activeField=fieldNav?.querySelector('[aria-current="step"]');
      if(activeField&&fieldNav.scrollWidth>fieldNav.clientWidth){const navBox=fieldNav.getBoundingClientRect(),fieldBox=activeField.getBoundingClientRect();fieldNav.scrollLeft+=fieldBox.left-navBox.left-(fieldNav.clientWidth-fieldBox.width)/2;}
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
        this.pendingLearningScroll=null;this.root.querySelector('.ll-question-card')?.scrollIntoView({block:'start',behavior:'instant'});
      });
    }
    if(this.scrollUnit){const id=this.scrollUnit;this.scrollUnit=null;const el=this.root.querySelector(`[data-unit="${CSS.escape(id)}"]`),docId=el?.closest('[data-reader-doc]')?.dataset.readerDoc;if(docId)this.scrollReaderUnit(docId,id);}
  }
  home(){
    const done=this.bank.classroom.filter(t=>this.answer(t).submitted).length, a=this.state.assessment;
    const ready=assessmentReady(this.catalog).ready;
    return `<section class="ll-hero"><div class="ll-eyebrow">РАБОЧЕЕ МЕСТО · 04</div><h1>Найдите норму.<br><span>Обоснуйте ответ.</span></h1><p>Распознайте документ, найдите норму и подготовьте досье.</p><div class="ll-actions"><button class="ll-primary" data-action="view" data-view="learn">${done?'Продолжить занятие':'Начать занятие'} <span>→</span></button><button class="ll-secondary" data-action="view" data-view="library">Открыть библиотеку</button></div><div class="ll-hero-number" aria-hidden="true">§</div></section><div class="ll-metrics"><div><strong>${done}<small> / ${this.bank.classroom.length}</small></strong><span>Отправлено ответов</span></div><div><strong>${this.catalog.documents.filter(d=>d.main).length}</strong><span>Основных актов</span></div><div><strong>${this.cases.length}</strong><span>Вариантов досье</span></div></div><section class="ll-section"><div class="ll-section-title"><h2>Ваш маршрут</h2><span>Ориентир · 90 минут</span></div><div class="ll-route-cards">${[['01','Прочитать скан','Выберите реквизиты прямо на изображении.','6 мин',0],['02','Определить вид акта','Соотнесите автора, заголовок и вид документа.','8 мин',6],['03','Найти положение','Используйте оглавление и поиск по документу.','38 мин',14]].map(([n,title,desc,time,index])=>`<button class="ll-route-card" data-action="go-task" data-index="${index}"><span class="ll-route-number">${n}</span><h3>${title}</h3><p>${desc}</p><small>${time} <span>→</span></small></button>`).join('')}</div></section><section class="ll-dossier-banner"><div><div class="ll-eyebrow">САМОСТОЯТЕЛЬНАЯ РАБОТА</div><h2>${a?`Ваше досье ${e(a.caseId)}`:'Одно досье. Все основные навыки.'}</h2><p>Другие сканы, другие ситуации, случайное назначение. Реквизиты, виды актов, поиск документа и правовое основание. До 5 баллов.</p></div><button class="ll-primary" data-action="view" data-view="assessment">${a?'Открыть досье':'Перейти к досье'} →</button></section>${!ready?`<details class="ll-corpus-notice"><summary>Материалы временно недоступны</summary><p>Часть документов ещё не готова. Можно тренироваться; отправка досье на оценку откроется после проверки материалов.</p></details>`:''}${this.livePanel()}<section class="ll-section"><h2>Дополнительные ситуации</h2><div class="ll-actions"><button class="ll-secondary" data-action="extra" data-id="X01">Проверить утверждение</button><button class="ll-secondary" data-action="extra" data-id="H01">Документ на дату события</button></div></section>`;
  }
  livePanel(){
    return '<section class="ll-live-panel"><div><strong>Совместная работа</strong><p>Совместные отметки работают только при поиске абзацев в больших документах. Их видят участники на том же вопросе; при переходе или выходе отметки исчезают. Сканы, виды актов и досье выполняются индивидуально.</p></div></section>';
  }
  async learning(){
    const t=this.selectedTask(),a=this.answer(t),revealed=this.displayCorrect(t);
    let body='';
    if(t.kind==='scan'){const scan=this.scans.find(s=>s.id===t.scanId),questions=scanQuestionsFor(scan);body=this.scanAssignment(scan,a.metadata,{questions,index:this.scanFieldIndex(t,questions),review:revealed});}
    else if(t.kind==='type')body=this.typeView(t,a.type,{review:revealed,correct:t.answer,action:'type-choice'});
    else if(t.kind==='history')body=`<div class="ll-editions"><h3>Документ для даты события</h3>${t.editionChoices.map(id=>{const d=this.doc(id);return `<button data-action="history-edition" data-id="${id}" class="${a.docId===id?'selected':''}"><strong>${e(d.title)}</strong><span>${e(d.number)}</span></button>`;}).join('')}</div>`;
    else {const d=await this.corpus.load(a.docId||t.docId);body=this.reader(d,a.selections||[],{context:'learning',review:revealed,correctIds:expandIds(t.answerSets[0],[d]),limit:selectionLimit(t,[...this.corpus.cache.values()])});}
    if(t.kind==='history'&&(a.docId||this.teacherAccess()&&this.teacherReading?.taskId===t.id)){const preview=this.teacherAccess()&&this.teacherReading?.taskId===t.id,d=await this.corpus.load(preview?this.teacherReading.docId:a.docId);body+=this.reader(d,preview?[]:a.selections||[],{context:'learning',review:revealed&&!preview,correctIds:expandIds(t.answerSets[0],[d]),limit:selectionLimit(t,[d]),readonly:Boolean(preview)});}
    const teacherKey=this.teacherAccess()?await this.teacherAnswer(t):'';
    const navDisabled=false;
    const grade=revealed&&t.kind==='type'?gradeTask(t,a,[...this.corpus.cache.values()],this.scans):null;
    return `<label class="ll-mobile-task-picker">Задание<select data-input="task-picker" ${navDisabled?'disabled':''}>${this.bank.classroom.map((x,i)=>`<option value="${i}" ${!this.extraTask&&this.state.index===i?'selected':''}>${i+1}. ${this.answer(x).submitted?e(translate('Ответ проверен',this.locale))+' · ':''}${e(clip(x.kind==='scan'?translate('Найдите реквизиты документа',this.locale):x.kind==='type'?x.title:x.prompt,90))}</option>`).join('')}</select></label><div class="ll-lesson-grid"><aside class="ll-task-list"><div class="ll-eyebrow">МАРШРУТ ЗАНЯТИЯ</div><div class="ll-task-scroll">${this.bank.classroom.map((x,i)=>`<button data-action="go-task" data-index="${i}" ${navDisabled?'disabled':''} class="${!this.extraTask&&t.id===x.id?'active':''}"><span>${String(i+1).padStart(2,'0')}</span><span>${e(clip(x.kind==='scan'?translate('Найдите реквизиты документа',this.locale):x.kind==='type'?x.title:x.prompt,68))}${this.answer(x).submitted?'<small class="ll-task-checked" title="Ответ проверен" aria-label="Ответ проверен">Ответ проверен</small>':''}</span></button>`).join('')}</div></aside><section class="ll-task-work"><div class="ll-question-card"><div class="ll-question-meta"><span>${this.extraTask?'Дополнительная ситуация':`${this.state.index+1} / ${this.bank.classroom.length}`}</span><span>${({scan:'На скане',type:'Вид акта',text:'В документе',history:'На дату события'})[t.kind]}</span></div><h1>${e(t.kind==='scan'?'Найдите реквизиты документа':t.prompt)}</h1><p>${t.kind==='scan'?'Выберите область для каждого реквизита. Переходите к следующему шагу кнопкой или названием реквизита.':t.kind==='type'?'Восстановите вид реального документа по автору и заголовку.':'Ответьте фрагментом документа. Нажмите на абзац. При необходимости отметьте несколько.'}</p>${t.kind==='text'&&!this.extraTask?'<div class="ll-live-strip" data-presence-status role="status"></div>':''}</div>${teacherKey}${body}<div class="ll-task-bottom">${grade?`<div class="ll-feedback ${grade.exact?'success':'attention'}"><strong>${grade.exact?'Основание найдено':grade.fraction>0?'Основание найдено частично':'Сопоставьте ответ с документом'}</strong><p>${e(t.explanation)}</p>${grade.extra?'<p>Уберите лишние фрагменты.</p>':''}${grade.missing?'<p>Выделение пока неполное.</p>':''}</div>`:''}<div class="ll-actions"><button class="ll-secondary" data-action="prev-task" ${navDisabled||(!this.extraTask&&this.state.index===0)?'disabled':''}>← Назад</button><button class="ll-primary" data-action="submit-task" ${this.isLocked()?'disabled':''}>${t.kind==='scan'?'Проверить все реквизиты':'Проверить ответ'}</button><button class="ll-secondary" data-action="next-task" ${navDisabled?'disabled':''}>Далее →</button></div></div></section></div>`;
  }
  scanFieldIndex(task,questions){const index=this.state.scanFields?.[task.id];return Math.max(0,Math.min(Number.isInteger(index)?index:0,questions.length-1));}
  scanFieldColor(field){return SCAN_FIELD_COLORS[field]||'#526b7d';}
  scanFieldValue(scan,field){return scan?.hotspots.find(h=>h.id===field)?.value||({issuer:scan?.author,type:scan?.actType,date:scan?.date,number:scan?.number,title:scan?.classificationTitle||scan?.title})[field]||'';}
  scanOriginal(scan){return scan?`<details class="ll-report-original"><summary>Открыть оригинал</summary><p data-original lang="ru">${e(scan.author)}<br>${e(scan.date+' · № '+scan.number)}</p><a href="${asset(scan.image)}" target="_blank" rel="noopener noreferrer"><img src="${asset(scan.image)}" alt="Скан документа" loading="lazy"><span>Увеличить изображение</span></a></details>`:'';}
  scanCrop(scan,field){
    const h=scan?.hotspots.find(h=>h.id===field);if(!h)return '';
    const [x,y,w,hh]=h.rect;
    return `<figure class="ll-scan-source-crop" data-source-crop="${e(field)}"><div class="ll-scan-crop"><img src="${asset(scan.image)}" alt="Фрагмент оригинала" loading="lazy" data-crop-width="${w}" data-crop-height="${hh}" style="width:${100/w}%;left:${-x/w*100}%;transform:translateY(${-y*100}%)"></div><figcaption>Фрагмент оригинала</figcaption></figure>`;
  }
  prepareScanCrops(root=this.root){
    for(const img of root.querySelectorAll('img[data-crop-width]')){
      const fit=()=>{if(img.naturalWidth&&img.naturalHeight)img.parentElement.style.aspectRatio=String(img.naturalWidth*Number(img.dataset.cropWidth)/(img.naturalHeight*Number(img.dataset.cropHeight)));};
      if(img.complete)fit();else img.addEventListener('load',fit,{once:true});
    }
  }
  scanReview(scan,metadata,questions){
    const n=questions.filter(q=>metadata?.[q.field]===q.field).length;
    return `<section class="ll-scan-review" data-scan-review="${e(scan.id)}"><h2>${n===questions.length?'Все реквизиты найдены верно.':'Проверьте отмеченные реквизиты.'}</h2><p>Верно: ${n} из ${questions.length}.</p>${questions.map(q=>{
      const selected=metadata?.[q.field],matched=selected===q.field,chosen=scan.hotspots.find(h=>h.id===selected),value=this.scanFieldValue(scan,q.field);
      return `<article class="ll-item-review" data-review-field="${e(q.field)}" data-review-status="${matched?'correct':chosen?'wrong':'missing'}"><h3>${e(q.prompt)}</h3><p class="ll-review-status">${matched?'Реквизит найден верно.':chosen?'Выбрана другая область.':'Реквизит пропущен.'}</p><dl class="ll-review-facts"><div><dt>Ваш ответ</dt><dd>${e(chosen?.label||'Не выбрано')}</dd></div><div><dt>Верная область</dt><dd>${e(q.prompt)}${value?`<p data-original lang="ru">${e(value)}</p>`:''}</dd></div></dl>${this.scanCrop(scan,q.field)}</article>`;
    }).join('')}${this.scanOriginal(scan)}</section>`;
  }
  scanAssignment(scan,metadata={}, {questions=scanQuestionsFor(scan),index=0,context='learning',review=false}={}){
    index=Math.max(0,Math.min(index,questions.length-1));const current=questions[index],assigned=questions.filter(q=>Boolean(metadata[q.field])).length,assessment=context==='assessment';
    if(!current)return '<div class="ll-alert ll-danger">Изображение не найдено</div>';
    return `<section class="ll-scan-assignment-work" data-scan-assignment="${e(scan.id)}" data-scan-mode="${e(context)}"><nav class="ll-scan-fields" aria-label="Реквизиты документа">${questions.map((q,i)=>`<button type="button" data-action="${assessment?'metadata-field':'scan-field'}" data-index="${i}" data-scan-field="${e(q.field)}" class="${i===index?'active':''} ${metadata[q.field]?'assigned':''}" aria-current="${i===index?'step':'false'}" style="--ll-field-color:${this.scanFieldColor(q.field)}"><span class="ll-field-step">${i+1}</span><span>${e(q.prompt)}<small>${metadata[q.field]?'Область выбрана':'Область не выбрана'}</small></span></button>`).join('')}</nav><div class="ll-current-field" style="--ll-field-color:${this.scanFieldColor(current.field)}"><span>Реквизит ${index+1} из ${questions.length}</span><h2 class="ll-field-question">${e(current.prompt)}</h2><p>Нажмите на область этого реквизита на скане.</p><p class="ll-scan-progress" role="status">Отмечено реквизитов: ${assigned} из ${questions.length}.</p></div>${this.scanView(scan,metadata[current.field],{action:assessment?'assessment-hotspot':'hotspot',assignments:metadata,questions,activeField:current.field})}<div class="ll-scan-step-actions"><button class="ll-secondary" data-action="scan-prev-field" data-context="${context}" ${index===0?'disabled':''}>← Предыдущий реквизит</button><button class="ll-primary" data-action="scan-next-field" data-context="${context}" ${index===questions.length-1?'disabled':''}>Следующий реквизит →</button></div><p class="ll-scan-legend">Цвет связывает название с выбранной областью. Оценка появится после проверки.</p>${review?this.scanReview(scan,metadata,questions):''}</section>`;
  }
  scanView(scan,selected,{review=false,correct=null,action='hotspot',assignments={},questions=[],activeField=null}={}){
    if(!scan)return '<div class="ll-alert ll-danger">Изображение не найдено</div>';
    const question=action==='assessment-hotspot'?this.state.assessment.attemptId:this.selectedTask().id;
    const context=this.view+':'+question+':'+scan.id;
    if(this.scanContext!==context){this.scanContext=context;this.scanZoom=1;this.scanHints=false;}
    const locked=this.isLocked();
    const assigned=questions.filter(q=>scan.hotspots.some(h=>h.id===assignments[q.field]));
    const frames=assigned.map(q=>{const h=scan.hotspots.find(h=>h.id===assignments[q.field]),same=assigned.filter(other=>assignments[other.field]===h.id),offset=same.findIndex(other=>other.field===q.field)*3;return `<span class="ll-assigned-frame ${activeField===q.field?'active':''}" aria-hidden="true" data-assigned-field="${e(q.field)}" data-selected-region="${e(h.id)}" style="--ll-field-color:${this.scanFieldColor(q.field)};outline-offset:${offset}px;left:${h.rect[0]*100}%;top:${h.rect[1]*100}%;width:${h.rect[2]*100}%;height:${h.rect[3]*100}%"></span>`;}).join('');
    return `<section class="ll-scan-card ${questions.length?'ll-scan-multi':''} ${this.scanHints?'ll-scan-hints-visible':''}"><div class="ll-scan-toolbar"><span>Реальный документ · исторический образец</span><div><button data-action="toggle-scan-hints" aria-label="${this.scanHints?'Скрыть подсказки на скане':'Показать подсказки на скане'}" title="${this.scanHints?'Скрыть подсказки на скане':'Показать подсказки на скане'}" aria-pressed="${this.scanHints}">${SCAN_EYE}</button><button data-action="zoom-out" aria-label="Уменьшить скан" ${this.scanZoom<=1?'disabled':''}>−</button><span data-scan-zoom>${Math.round(this.scanZoom*100)}%</span><button data-action="zoom-in" aria-label="Увеличить скан" ${this.scanZoom>=3?'disabled':''}>+</button></div></div><p class="ll-scan-hint">Страницу можно увеличить обычным жестом двумя пальцами. Кнопка с глазом покажет доступные фрагменты. Мелкие реквизиты удобнее выбирать после увеличения кнопкой «+».</p><div class="ll-scan-viewport" data-scan-context="${e(context)}" role="group" aria-label="Области на скане"><div class="ll-scan" style="width:${this.scanZoom*100}%;max-width:${this.scanZoom*740}px"><img src="${asset(scan.image)}" alt="Скан документа" draggable="false">${scan.hotspots.map(h=>`<button class="ll-hotspot ${selected===h.id?'selected':''} ${!questions.length&&review&&selected===h.id&&h.id===correct?'correct':''}" data-action="${action}" data-id="${e(h.id)}" data-priority-field="${activeField===h.id}" aria-label="${e(this.scanRegionLabel(h))}" aria-pressed="${selected===h.id}" style="left:${h.rect[0]*100}%;top:${h.rect[1]*100}%;width:${h.rect[2]*100}%;height:${h.rect[3]*100}%" ${locked?'disabled':''}></button>`).join('')}${frames}</div></div></section>`;
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
  typeView(t,selected,{review=false,correct=null,action='type-choice',scanId=null}={}){
    const s=scanId?this.scans.find(s=>s.id===scanId):t.scanId?this.scans.find(s=>s.id===t.scanId):null;
    const reveal=review&&action==='type-choice',region=s?.hotspots.find(h=>h.id==='type');
    const sheet=s?`<div class="ll-type-paper"><div class="ll-type-scan" data-type-scan="${e(s.id)}"><img src="${asset(s.image)}" alt="${reveal?'Скан документа':'Скан документа с закрытым видом акта'}" draggable="false">${!reveal&&region?`<span class="ll-type-mask" role="img" aria-label="Вид акта скрыт до проверки" style="left:${region.rect[0]*100}%;top:${region.rect[1]*100}%;width:${region.rect[2]*100}%;height:${region.rect[3]*100}%"><span aria-hidden="true">?</span></span>`:''}</div></div>`:`<div class="ll-type-paper ll-type-text"><p data-original lang="ru">${e(t.author)}</p><div class="ll-missing-type">${reveal?e(translate(correct,this.locale)):'ВИД ДОКУМЕНТА'}</div><h2 data-original lang="ru">${e(t.title)}</h2></div>`;
    return `<section class="ll-type-card"><figure class="ll-type-document">${sheet}<figcaption class="ll-sr"><span data-original lang="ru">${e(t.author||s?.author)}. ${e(t.title||s?.classificationTitle)}</span></figcaption></figure>${!reveal?'<p class="ll-type-instruction">Надпись с видом акта закрыта. Определите вид по документу.</p>':''}<div class="ll-type-options" role="group" aria-label="Вид документа">${ACT_TYPES.map(v=>`<button data-action="${action}" data-value="${v}" data-scan="${e(scanId||'')}" class="${selected===v?'selected':''} ${reveal&&v===correct?'correct':''}" aria-pressed="${selected===v}" ${this.isLocked()?'disabled':''}>${v}</button>`).join('')}</div>${reveal&&s?`<details class="ll-original"><summary>Открыть оригинал</summary><img src="${asset(s.image)}" alt="Оригинал: ${e(s.title)}" loading="lazy"></details>`:''}${reveal&&t.sourceUrl?`<p>${external(t.sourceUrl,'Источник документа')}</p>`:''}</section>`;
  }
  reader(d,selected=[],{context='learning',counts={},review=false,correctIds=[],limit=5,readonly=false}={}){
    const rs=this.state.reader[d.id]||{},section=d.sections.find(s=>s.id===rs.sectionId)||d.sections[0],chosen=new Set(selected),correct=new Set(correctIds);
    let unitIndex=this.unitIndexes.get(d);if(!unitIndex){unitIndex=new Map(d.units.map(u=>[u.id,u]));this.unitIndexes.set(d,unitIndex);}
    const query=rs.query||'',hits=query?searchUnits(d,query):[],page=Math.max(0,Math.min(rs.searchPage||0,Math.max(0,Math.ceil(hits.length/20)-1)));
    const words=[...new Set(query.trim().split(/\s+/).filter(word=>word.length>=3))].sort((a,b)=>b.length-a.length);
    const pattern=words.length?new RegExp('('+words.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[её]/gi,'[её]')).join('|')+')','giu'):null;
    const pageHits=hits.slice(page*20,page*20+20),highlightedUnits=new Set(pageHits.map(u=>u.id));
    const text=value=>{let marks=0;return pattern?String(value).split(pattern).map((part,i)=>i%2&&marks++<40?`<mark>${e(part)}</mark>`:e(part)).join(''):e(value);};
    const paragraph=(u,heading=false)=>`<button type="button" class="ll-paragraph ${heading?'ll-paragraph-heading':''} ${chosen.has(u.id)?'selected':''} ${review&&correct.has(u.id)?'correct':''} ${counts[u.id]?'peer':''} ${this.teacher&&this.teacherTarget?.taskId===this.selectedTask().id&&this.teacherTarget?.unitId===u.id?'ll-teacher-target':''}" data-action="${readonly?'noop':'select-unit'}" data-unit="${e(u.id)}" data-doc="${d.id}" data-context="${context}" aria-pressed="${chosen.has(u.id)}" ${!readonly&&this.isLocked()?'disabled':''}><span class="ll-paragraph-locator"><span class="ll-sr" data-original lang="ru">${e(u.locator)}</span>${counts[u.id]?`<span class="ll-peer-badge">${e(translate(String(counts[u.id])+' выбрали',this.locale))}</span>`:''}</span>${u.context?`<small class="ll-unit-context" data-original lang="ru">${e(u.context)}</small>`:''}<span class="ll-paragraph-text" data-original lang="ru">${highlightedUnits.has(u.id)?text(u.text):e(u.text)}</span><span class="ll-check" aria-hidden="true">${chosen.has(u.id)?'✓':''}</span></button>${u.imageUrl?`<figure class="ll-source-figure"><a href="${asset('data/'+u.imageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Увеличить изображение"><img src="${asset('data/'+u.imageUrl)}" alt="${e(u.locator)}" loading="lazy" data-original lang="ru"></a><figcaption>Увеличить изображение</figcaption></figure>`:''}`;
    const body=d.sections.map(s=>{const units=s.unitIds.map(id=>unitIndex.get(id)).filter(Boolean),headingInText=units[0]?.text.trim()===s.title.trim();return `<section class="ll-reader-section" data-reader-section="${e(s.id)}" style="--ll-section-height:${Math.max(120,units.length*110)}px">${headingInText?'':`<h3 data-original lang="ru">${e(s.title)}</h3>`}${units.map((u,i)=>headingInText&&i===0?`<h3>${paragraph(u,true)}</h3>`:paragraph(u)).join('')}</section>`;}).join('');
    return `<section class="ll-reader" data-reader-doc="${d.id}"><header class="ll-reader-header"><div data-original lang="ru"><span class="ll-eyebrow">${e(d.number)}</span><h2>${e(d.title)}</h2><span class="ll-revision">${e(d.revisionLabel)}</span></div>${external(d.sourceUrl,'Источник')}</header>${d.coverage!=='full'?'<div class="ll-text-warning">Материалы временно недоступны</div>':''}<form class="ll-searchbar" data-search-form="reader"><button type="button" data-action="toggle-toc" class="ll-secondary" aria-expanded="${Boolean(rs.tocOpen)}">Оглавление</button><input data-input="reader-query" value="${e(query)}" placeholder="Поиск по словам в документе" aria-label="Поиск в документе" autocomplete="off"><button type="submit" class="ll-primary">Найти</button>${query?'<button type="button" data-action="clear-search" class="ll-secondary">Сбросить</button>':''}</form>${query?`<div class="ll-search-results"><strong>${hits.length?'Найдено фрагментов: '+hits.length:'Совпадений нет. Попробуйте другое слово.'}</strong>${pageHits.map(u=>`<button data-action="jump-unit" data-id="${e(u.id)}" data-doc="${d.id}"><b data-original lang="ru">${e(u.locator)}</b><span data-original lang="ru">${text(clip(u.text,180))}</span></button>`).join('')}${hits.length>20?`<div class="ll-actions"><button type="button" class="ll-secondary" data-action="search-page" data-doc="${d.id}" data-page="${page-1}" ${page===0?'disabled':''}>← Назад</button><span>${page+1} / ${Math.ceil(hits.length/20)}</span><button type="button" class="ll-secondary" data-action="search-page" data-doc="${d.id}" data-page="${page+1}" ${(page+1)*20>=hits.length?'disabled':''}>Далее →</button></div>`:''}</div>`:''}${!readonly?this.selectionTray(selected,context,limit):''}<div class="ll-reader-grid ${rs.tocOpen?'toc-open':''}"><nav class="ll-toc" aria-label="Оглавление документа">${d.sections.map(s=>`<button data-action="section" data-id="${e(s.id)}" data-doc="${d.id}" class="${section?.id===s.id?'active':''}" data-original lang="ru">${e(s.title)}</button>`).join('')}</nav><article class="ll-paper" aria-label="Текст документа">${body}</article></div></section>`;
  }
  selectionTray(selected,context,limit){
    const t=context==='learning'?this.selectedTask():null,a=t?this.answer(t):null,grade=a?.submitted?gradeTask(t,a,[...this.corpus.cache.values()],this.scans):null;
    return `<div class="ll-selection-tray" data-selection-context="${context}"><div class="ll-selection-heading"><span><b>${selected.length}</b> фрагм. выбрано · максимум ${limit}</span><button class="ll-secondary" data-action="${context==='learning'?'submit-task':'assessment-next'}" ${this.isLocked()?'disabled':''}>${context==='learning'?'Проверить ответ':'Следующий этап →'}</button></div><div class="ll-selected-passages">${selected.slice(0,30).map(id=>{let u;for(const d of this.corpus.cache.values()){u=this.unitIndexes.get(d)?.get(id)||d.units.find(x=>x.id===id);if(u)break;}return `<button data-action="remove-unit" data-id="${e(id)}" data-context="${context}"><span data-original lang="ru">${e(u?.locator||id)}</span> ×</button>`;}).join('')}</div>${grade?`<div class="ll-reader-feedback ll-feedback ${grade.exact?'success':'attention'}"><strong>${grade.exact?'Основание найдено':grade.fraction>0?'Основание найдено частично':'Сопоставьте ответ с документом'}</strong><p>${e(t.explanation)}</p>${grade.extra?'<p>Уберите лишние фрагменты.</p>':''}${grade.missing?'<p>Выделение пока неполное.</p>':''}</div>`:''}</div>`;
  }
  refreshReaderSelection(context,{review=false}={}){
    const assessment=context==='assessment',t=assessment?this.cases.find(c=>c.id===this.state.assessment.caseId):this.selectedTask(),a=assessment?this.state.assessment.answer:this.answer(t),selected=new Set(a.selections||[]);
    for(const el of this.root.querySelectorAll(`.ll-paragraph[data-context="${context}"].selected,.ll-paragraph[data-context="${context}"].correct`)){el.classList.remove('selected','correct');el.setAttribute('aria-pressed','false');el.querySelector('.ll-check').textContent='';}
    for(const id of selected){const el=this.root.querySelector(`.ll-paragraph[data-context="${context}"][data-unit="${CSS.escape(id)}"]`);if(el){el.classList.add('selected');el.setAttribute('aria-pressed','true');el.querySelector('.ll-check').textContent='✓';}}
    if(review)for(const id of expandIds(t.answerSets?.[0]||[],[...this.corpus.cache.values()]))this.root.querySelector(`.ll-paragraph[data-context="${context}"][data-unit="${CSS.escape(id)}"]`)?.classList.add('correct');
    for(const tray of this.root.querySelectorAll(`[data-selection-context="${context}"]`)){const box=document.createElement('div');box.innerHTML=this.selectionTray([...selected],context,selectionLimit(t,[...this.corpus.cache.values()]));translateDOM(box,this.locale);tray.replaceWith(box.firstElementChild);}
    if(!assessment&&!this.extraTask){this.root.querySelector('.ll-task-bottom .ll-feedback')?.remove();const button=this.root.querySelector(`.ll-task-list [data-index="${this.state.index}"]`);button?.querySelector('.ll-task-checked')?.remove();if(review&&button){const status=document.createElement('small');status.className='ll-task-checked';status.textContent=translate('Ответ проверен',this.locale);status.title=status.textContent;status.setAttribute('aria-label',status.textContent);button.lastElementChild.append(status);}const option=this.root.querySelector(`[data-input="task-picker"] option[value="${this.state.index}"]`);if(option)option.textContent=`${this.state.index+1}. ${review?translate('Ответ проверен',this.locale)+' · ':''}${clip(t.kind==='type'?t.title:t.prompt,90)}`;}
  }
  scrollReaderUnit(docId,id,{teacher=false}={}){
    const reader=this.root.querySelector(`[data-reader-doc="${CSS.escape(docId)}"]`),el=reader?.querySelector(`[data-unit="${CSS.escape(id)}"]`);if(!el)return false;
    const sectionId=el.closest('[data-reader-section]')?.dataset.readerSection;if(sectionId){this.state.reader[docId]||={};this.state.reader[docId].sectionId=sectionId;for(const button of reader.querySelectorAll('[data-action="section"]'))button.classList.toggle('active',button.dataset.id===sectionId);}
    for(const previous of reader.querySelectorAll('.ll-search-target,.ll-teacher-target'))previous.classList.remove('ll-search-target','ll-teacher-target');el.classList.add(teacher?'ll-teacher-target':'ll-search-target');
    // Resolve nearby section heights before positioning an anchor in lazy text.
    const section=el.closest('.ll-reader-section'),materialize=part=>{part.dataset.readerMaterialized='true';return part.getBoundingClientRect().height;};
    if(section){
      materialize(section);
      for(const direction of ['previousElementSibling','nextElementSibling']){
        let part=section[direction],remaining=window.innerHeight*3;
        while(part?.classList.contains('ll-reader-section')&&remaining>0){remaining-=materialize(part);part=part[direction];}
      }
    }
    el.focus({preventScroll:true});el.scrollIntoView({block:'center',behavior:'instant'});return true;
  }
  async teacherAnswer(t){
    if(!this.teacherAccess())return '';
    const s=this.scans.find(s=>s.id===t.scanId);let content='';
    if(t.kind==='scan'){
      content=scanQuestionsFor(s).map(q=>{const value=this.scanFieldValue(s,q.field);return `<section class="ll-teacher-scan-field" data-teacher-field="${e(q.field)}"><h3>${e(q.prompt)}</h3>${value?`<p data-original lang="ru">${e(value)}</p>`:''}${this.scanCrop(s,q.field)}</section>`;}).join('');
    }else if(t.kind==='type'){
      content=`<p><strong>${e(t.answer)}</strong></p>${s?`<p data-original lang="ru">${e(s.author)} · ${e(s.date)} · № ${e(s.number)}</p><p data-original lang="ru">${e(s.classificationTitle||s.title)}</p><p><span>В оригинале этого акта указан вид:</span> <q data-original lang="ru">${e(s.actType.toLocaleUpperCase('ru'))}</q></p>`:''}`;
    }else{
      const d=await this.corpus.load(t.docId);if(!this.teacherAccess())return '';
      content=`<p data-original lang="ru"><strong>${e(d.title)}</strong><br>${e(d.revisionLabel)}</p>`+(t.answerSets||[]).map((set,i)=>`<section class="ll-teacher-variant">${t.answerSets.length>1?`<h4>Допустимый вариант ${i+1}</h4>`:''}${expandIds(set,[d]).map(id=>{const u=d.units.find(u=>u.id===id);return u?`<blockquote data-original lang="ru"><strong>${e(u.locator)}</strong><p>${e(u.text)}</p></blockquote><button type="button" class="ll-secondary" data-action="teacher-jump-unit" data-id="${e(id)}" data-doc="${e(d.id)}">Перейти к основанию</button>`:'';}).join('')}</section>`).join('');
    }
    return `<details class="ll-teacher-answer" data-teacher-answer="${e(t.id)}"><summary>Ответ преподавателю</summary>${content}${t.kind==='scan'?'':`<p>${e(t.explanation)}</p>`}</details>`;
  }
  async library(assessmentMode){
    if(!assessmentMode&&this.libraryDoc){const d=await this.corpus.load(this.libraryDoc);return `<button class="ll-secondary ll-back" data-action="library-back">← К документам</button>${this.reader(d,[],{readonly:true,context:'library'})}`;}
    const entries=this.libraryHits||this.catalog.documents.map(document=>({document,hits:[]}));
    const chosen=new Set(this.state.assessment?.answer.documentIds||[]);
    return `<section class="ll-library"><div class="ll-section-title"><div><div class="ll-eyebrow">ПРАВОВЫЕ ИСТОЧНИКИ</div><h1>${assessmentMode?'Найдите документ для задачи':'Библиотека документов'}</h1></div><span>${this.catalog.documents.length} документов</span></div><form class="ll-searchbar" data-search-form="library"><input data-input="library-query" value="${e(this.librarySearch)}" placeholder="Название, номер или слова из текста" aria-label="Поиск по библиотеке"><button class="ll-primary" type="submit">Найти</button><label class="ll-checkbox"><input type="checkbox" data-input="library-content" ${this.libraryContent?'checked':''}> По содержанию</label></form><p class="ll-muted">${assessmentMode?'Выберите акт, затем откройте его и найдите правовое основание. Варианты ответов не предлагаются.':'Оглавление и поиск доступны для каждого установленного текста.'}</p><div class="ll-doc-grid">${entries.map(({document:d,hits})=>`<article class="ll-doc-card ${chosen.has(d.id)&&assessmentMode?'selected':''}"><div class="ll-doc-top"><span>${e(d.group)}</span><small>${d.coverage==='full'?'Полный текст':'Выдержки'}</small></div><h2>${e(d.shortTitle)}</h2><p>${e(d.title)}</p><strong>${e(d.number)}</strong><div class="ll-actions">${assessmentMode?`<button class="${chosen.has(d.id)?'ll-primary':'ll-secondary'}" data-action="choose-document" data-id="${d.id}" aria-pressed="${chosen.has(d.id)}" ${this.isLocked()?'disabled':''}>${chosen.has(d.id)?'✓ Выбран':'Выбрать акт'}</button><button class="ll-secondary" data-action="assessment-open-doc" data-id="${d.id}">Читать</button>`:`<button class="ll-primary" data-action="library-open" data-id="${d.id}">Открыть →</button>`}</div>${hits?.length?`<details><summary>Первые найденные фрагменты: ${hits.length}</summary>${hits.map(u=>`<button class="ll-hit" data-action="library-hit" data-doc="${d.id}" data-id="${u.id}" data-context="${assessmentMode?'assessment':'library'}">${e(u.locator)} · ${e(clip(u.text,100))}</button>`).join('')}</details>`:''}</article>`).join('')}</div>${!entries.length?'<div class="ll-empty">Документы не найдены. Попробуйте сократить запрос.</div>':''}</section>`;
  }
  async assessment(){
    const a=this.state.assessment,ready=assessmentReady(this.catalog).ready;
    if(!a)return `<section class="ll-assessment-intro"><span class="ll-eyebrow">25 МИНУТ · ДО 5 БАЛЛОВ</span><h1>Ваше самостоятельное досье</h1><p>После начала система случайно закрепит за вами одно из ${this.cases.length} досье. Назначение сохранится после перезагрузки. Ситуация и сканы отличаются от совместного занятия.</p><div class="ll-criteria-preview">${[['1','Реквизиты','Все реквизиты реального скана'],['1','Виды документов','Два новых автора и заголовка'],['1','Поиск документа','Нужный акт в общей библиотеке'],['2','Правовое основание','Достаточный фрагмент текста']].map(([p,h,t])=>`<div><strong>${p}</strong><h3>${h}</h3><p>${t}</p></div>`).join('')}</div>${!ready?`<div class="ll-alert ll-warning"><strong>Материалы временно недоступны</strong><p>Часть документов ещё не готова. Можно тренироваться; отправка досье на оценку откроется после проверки материалов.</p></div>`:''}<button class="ll-primary" data-action="start-assessment" ${this.isLocked()||(!ready&&!this.demo&&!this.teacher)?'disabled':''}>${ready&&!this.demo&&!this.teacher?'Получить досье':'Пройти тренировочное досье'} →</button></section>`;
    const item=this.cases.find(c=>c.id===a.caseId);if(!item)throw new Error('Назначенное досье не найдено');
    if(a.result){await Promise.all([...new Set([...item.docIds,...a.answer.documentIds])].map(id=>this.corpus.load(id)));return this.report(item,a);}
    const questions=dossierScanQuestions(item,a.answer,this.scans),fieldIndex=a.scanFieldIndex??this.assessmentField;this.assessmentField=Math.max(0,Math.min(Number.isInteger(fieldIndex)?fieldIndex:0,questions.length-1));
    const stage=a.stage||0;let body='';
    if(stage===0){body=this.scanAssignment(this.scans.find(s=>s.id===item.scanId),a.answer.metadata,{questions,index:this.assessmentField,context:'assessment'})+`<p class="ll-source-note">${e(item.sourceNote)}</p>`;}
    else if(stage===1){body=`<div class="ll-substeps">${item.classificationIds.map((id,i)=>`<button data-action="classification-index" data-index="${i}" class="${this.activeType===i?'active':''}">${a.answer.classifications?.[id]?'✓ ':''}Документ ${i+1}</button>`).join('')}</div>${this.typeView({},a.answer.classifications?.[item.classificationIds[this.activeType]],{action:'assessment-type',scanId:item.classificationIds[this.activeType]})}`;}
    else if(stage===2)body=await this.library(true);
    else if(stage===3){const ids=a.answer.documentIds||[];if(!ids.length)body='<div class="ll-empty">Сначала найдите и выберите документ на предыдущем этапе.</div>';else{this.assessmentDoc=ids.includes(this.assessmentDoc)?this.assessmentDoc:ids[0];const d=await this.corpus.load(this.assessmentDoc);body=`<div class="ll-substeps">${ids.map(id=>`<button data-action="assessment-doc" data-id="${id}" class="${id===d.id?'active':''}">${e(this.doc(id).shortTitle)}</button>`).join('')}</div>${this.reader(d,a.answer.selections||[],{context:'assessment',limit:selectionLimit(item,[...this.corpus.cache.values()])})}`;}}
    else body=`<section class="ll-review"><h2>Проверьте собранное досье</h2><div class="ll-review-counts"><p>Области скана: <strong>${questions.filter(q=>a.answer.metadata?.[q.field]).length} / ${questions.length}</strong></p><p>Виды документов: <strong>${count(a.answer.classifications)} / ${item.classificationIds.length}</strong></p><p>Выбрано актов: <strong>${(a.answer.documentIds||[]).length}</strong></p><p>Выбрано фрагментов: <strong>${(a.answer.selections||[]).length}</strong></p></div><p>До отправки можно вернуться к любому этапу. После отправки эта попытка становится доступной только для просмотра. Полнота и точность будут проверены вместе.</p>${this.confirming?`<div class="ll-alert ll-warning"><strong>Завершить работу?</strong><p>Будут отправлены текущие ответы, включая незаполненные позиции.</p><div class="ll-actions"><button class="ll-primary" data-action="finish-assessment" ${this.submitting?'disabled':''}>${this.submitting?'Сохраняем…':'Да, завершить'}</button><button class="ll-secondary" data-action="cancel-finish">Вернуться к проверке</button></div></div>`:`<button class="ll-primary" data-action="confirm-finish" ${this.isLocked()?'disabled':''}>Завершить и проверить досье</button>`}</section>`;
    return `<header class="ll-assessment-heading"><div class="ll-eyebrow">ДОСЬЕ ${e(a.caseId)} · ${a.preview?'ТРЕНИРОВКА':'САМОСТОЯТЕЛЬНАЯ РАБОТА'}</div><h1>${e(item.title)}</h1><p>${e(item.prompt)}</p></header><nav class="ll-stage-nav" aria-label="Этапы досье">${['Реквизиты','Виды актов','Документ','Основание','Отправка'].map((v,i)=>`<button data-action="assessment-stage" data-index="${i}" class="${stage===i?'active':''}" aria-current="${stage===i?'step':'false'}"><span>${i+1}</span>${v}</button>`).join('')}</nav>${body}<div class="ll-stage-bottom"><button class="ll-secondary" data-action="assessment-prev" ${stage===0?'disabled':''}>← Предыдущий этап</button><span>${stage+1} / 5</span><button class="ll-primary" data-action="assessment-next" ${stage===4?'disabled':''}>Следующий этап →</button></div>`;
  }
  report(item,a){
    const docs=[...this.corpus.cache.values()],scan=this.scans.find(s=>s.id===item.scanId);
    const label=(scan,id)=>scan?.hotspots.find(h=>h.id===id)?.label||'Не выбрано';
    const original=value=>`<span data-original lang="ru">${e(value)}</span>`;
    const scanValue=(s,field)=>this.scanFieldValue(s,field),questions=dossierScanQuestions(item,a.answer,this.scans);
    const scanOriginal=s=>s?`<details class="ll-report-original"><summary>Открыть оригинал</summary><p>${original(s.author)}<br>${original(s.date+' · № '+s.number)}</p><a href="${asset(s.image)}" target="_blank" rel="noopener noreferrer"><img src="${asset(s.image)}" alt="Скан документа" loading="lazy"><span>Увеличить изображение</span></a></details>`:'';
    const selectedDocs=[...new Set(a.answer.documentIds||[])],selectedUnits=[...new Set(a.answer.selections||[])];
    const names=ids=>ids.length?`<ul>${ids.map(id=>`<li>${this.doc(id)?original(this.doc(id).title):'<span>Документ не найден</span>'}</li>`).join('')}</ul>`:'<p>Нет</p>';
    const textList=(ids,expected,reviewExpected=false)=>ids.length?ids.map(id=>{
      const d=docs.find(d=>d.units.some(u=>u.id===id)),u=d?.units.find(u=>u.id===id);
      const matched=reviewExpected?selectedUnits.includes(id):expected.includes(id),status=matched?'Совпало':reviewExpected?'Пропущенный фрагмент':'Лишний фрагмент';
      return `<article class="ll-passage-review"><p class="ll-review-status">${status}</p>${u?`<blockquote data-original lang="ru"><strong>${e(d.shortTitle||d.title)} · ${e(u.locator)}</strong><p>${e(u.text)}</p></blockquote>${!reviewExpected&&!selectedDocs.includes(d.id)?'<p class="ll-review-status">Документ этого фрагмента не выбран.</p>':''}`:'<p>Фрагмент не найден в материалах.</p>'}</article>`;
    }).join(''):'<p>Не выбрано</p>';
    const breakdown=a.result.criteria.map(c=>{
      let review='',reason='';
      if(c.id==='metadata'){
        review=questions.map(q=>{
          const selected=a.answer.metadata?.[q.field],matched=selected===q.field;
          return `<article class="ll-item-review" data-review-field="${e(q.field)}"><h4>${e(q.prompt)}</h4><p class="ll-review-status">${matched?'Реквизит найден верно.':selected?'Выбрана другая область.':'Реквизит пропущен.'}</p><dl class="ll-review-facts"><div><dt>Ваш ответ</dt><dd><span>${e(label(scan,selected))}</span>${scanValue(scan,selected)?`<br>${original(scanValue(scan,selected))}`:''}</dd></div><div><dt>Верная область</dt><dd><span>${e(label(scan,q.field))}</span><br>${original(scanValue(scan,q.field)||'')}</dd></div></dl>${this.scanCrop(scan,q.field)}</article>`;
        }).join('')+scanOriginal(scan);
        const n=questions.filter(q=>a.answer.metadata?.[q.field]===q.field).length;
        reason=n===questions.length?'Все позиции совпадают. Баллы начислены полностью.':`Правильных позиций: ${n} из ${questions.length}. Каждая позиция даёт одинаковую долю балла.`;
      }else if(c.id==='classification'){
        review=item.classificationIds.map((id,i)=>{
          const source=this.scans.find(s=>s.id===id),selected=a.answer.classifications?.[id],matched=selected===source?.actType,max=c.max/item.classificationIds.length;
          return `<article class="ll-item-review" data-review-scan="${e(id)}"><h4>Документ ${i+1}</h4><p data-original lang="ru"><strong>${e(source?.author||'')}</strong></p><p data-original lang="ru">${e(source?.classificationTitle||source?.title||'')}</p><p class="ll-review-status">${matched?'Вид определён верно.':selected?'Выбран другой вид документа.':'Вид документа не выбран.'}</p><dl class="ll-review-facts"><div><dt>Ваш ответ</dt><dd>${e(selected||'Не выбрано')}</dd></div><div><dt>Правильный вид</dt><dd>${e(source?.actType||'')}</dd></div></dl><p><span>В оригинале этого акта указан вид:</span> <q data-original lang="ru">${e(source?.actType.toLocaleUpperCase('ru')||'')}</q></p><p class="ll-review-points">Баллы за этот документ: ${matched?max:0} из ${max}.</p>${matched?'':`<p class="ll-review-points">Потеря за этот документ: ${max} балла.</p>`}${scanOriginal(source)}</article>`;
        }).join('');
        const n=item.classificationIds.filter(id=>a.answer.classifications?.[id]===this.scans.find(s=>s.id===id)?.actType).length;
        reason=n===item.classificationIds.length?'Все позиции совпадают. Баллы начислены полностью.':`Правильных позиций: ${n} из ${item.classificationIds.length}. Каждая позиция даёт одинаковую долю балла.`;
      }else if(c.id==='document'){
        review=`<div class="ll-review-columns"><section data-review="matched-documents"><h3>Выбрано верно</h3>${names(selectedDocs.filter(id=>item.docIds.includes(id)))}</section><section data-review="extra-documents"><h3>Лишние документы</h3>${names(selectedDocs.filter(id=>!item.docIds.includes(id)))}</section><section data-review="missing-documents"><h3>Пропущенные документы</h3>${names(item.docIds.filter(id=>!selectedDocs.includes(id)))}</section></div>`;
        reason=c.points===c.max?'Все позиции совпадают. Баллы начислены полностью.':'Учитываются совпавшие документы, пропуски и лишние акты.';
      }else{
        // Explain the same accepted alternative chosen by gradeEvidence; a
        // different complete answer must not be described as missing evidence.
        const best=item.answerSets.map(set=>({ids:expandIds(set,docs),grade:gradeEvidence(selectedUnits,[set],docs)})).reduce((best,next)=>!best||next.grade.fraction>best.grade.fraction||next.grade.fraction===best.grade.fraction&&next.grade.missing<best.grade.missing?next:best,null);
        const expected=best?.ids||[];
        review=`<div class="ll-review-columns"><section><h3>Ваш ответ</h3>${textList(selectedUnits,expected)}</section><section><h3>Правильное основание</h3>${textList(expected,expected,true)}</section></div>`;
        reason=c.detail?.sourceOK===false?'Фрагменты относятся к документу, который вы не выбрали. За основание баллы не начислены.':c.points===c.max?'Все позиции совпадают. Баллы начислены полностью.':`Совпало: ${c.detail?.matched||0}; пропущено: ${c.detail?.missing||0}; лишних: ${c.detail?.extra||0}. Балл учитывает полноту и точность выделения.`;
      }
      return `<details class="ll-criterion-review" data-criterion="${e(c.id)}"><summary><span>${e(c.label)}</span><strong>${e(c.points)} / ${e(c.max)}</strong></summary><h3>Почему такой балл</h3><p>${e(reason)}</p>${c.id==='evidence'?`<p>${e(item.explanation)}</p>`:''}${review}</details>`;
    }).join('');
    return `<section class="ll-result"><div class="ll-eyebrow">ДОСЬЕ ${e(a.caseId)} · ${a.preview?'ТРЕНИРОВКА':'РАБОТА ЗАВЕРШЕНА'}</div><h1>Досье проверено</h1><div class="ll-result-score">${e(a.result.points)}<small> / 5</small></div><p>${a.preview?'Результат тренировочный и не отправляется в журнал.':a.delivery==='host-accepted'?'Результат сохранён. При подключении к сети журнал синхронизируется автоматически.':'Результат сохранён. Отправка в журнал ещё не подтверждена.'}</p><div class="ll-result-criteria">${a.result.criteria.map(c=>`<div><span>${e(c.label)}</span><meter min="0" max="${e(c.max)}" value="${e(c.points)}" aria-label="${e(c.label)}"></meter><strong>${e(c.points)} / ${e(c.max)}</strong></div>`).join('')}</div><div class="ll-answer-review">${breakdown}</div>${this.reportOnly?'':`<div class="ll-actions"><button class="ll-primary" data-action="export-report">Сохранить отчёт</button>${!a.preview&&a.delivery!=='host-accepted'?'<button class="ll-secondary" data-action="retry-delivery">Повторить передачу в журнал</button>':''}<button class="ll-secondary" data-action="home">К маршруту</button></div>`}</section>`;
  }
  help(){return `<section class="ll-help"><div class="ll-eyebrow">СПРАВКА</div><h1>Как работать с документами</h1><div class="ll-help-grid"><article><h2>Выбор фрагмента на скане</h2><p>Для каждого названия реквизита выберите область на скане, затем нажмите «Следующий реквизит». К любому шагу можно вернуться. Цвет названия совпадает с цветом назначенной рамки; он не означает правильность. После всех шагов проверьте комплект. Кнопка с глазом показывает доступные области. Страницу можно увеличить обычным жестом двумя пальцами. С клавиатуры выбирайте область клавишами Tab и Enter.</p></article><article><h2>Ответ фрагментом</h2><p>Найдите положение с помощью оглавления или поиска. Нажмите на абзац. Для составного ответа отметьте несколько. Лишние фрагменты снижают точность ответа.</p></article><article><h2>Вид документа</h2><p>Ориентируйтесь на автора и содержание заголовка. Проверка относится к конкретному реальному акту. Распоряжения не ограничены вопросами о сотрудниках.</p></article><article><h2>Совместная работа</h2><p>Совместные отметки работают только при поиске абзацев в больших документах. Их видят участники на том же вопросе; при переходе или выходе отметки исчезают. Сканы, виды актов и досье выполняются индивидуально.</p></article></div><h2>Схемы из лекции</h2><p>Ниже сохранены авторские схемы. Они помогают ориентироваться в примерах; правовая форма каждого задания проверяется по его оригиналу.</p>${[36,48,58].map((n,i)=>`<details><summary>${['Федеральный уровень','Уровень субъекта','Муниципальный уровень'][i]} · слайд ${n}</summary><img src="${asset(`assets/help/lecture-${n}.webp`)}" alt="Схема из лекции, слайд ${n}" loading="lazy"></details>`).join('')}<details><summary>Источники и авторство</summary><p data-original lang="ru">${e(this.catalog.sources.lecture)}</p><p data-original lang="ru">${e(this.catalog.sources.tickets)}</p></details><button class="ll-secondary" data-action="export-state">Экспортировать локальную работу</button></section>`;}
  input(ev){const el=ev.target;if(!el.dataset.input)return;switch(el.dataset.input){case'task-picker':this.action('go-task',{dataset:{index:el.value}}).catch(err=>this.fail(err));break;case'library-query':this.librarySearch=el.value;break;case'library-content':this.libraryContent=el.checked;break;case'reader-query':{const id=el.closest('[data-reader-doc]')?.dataset.readerDoc;if(id){this.state.reader[id]||={};this.state.reader[id].query=el.value;this.state.reader[id].searchPage=0;}break;}}}
  async runSearch(which){if(which==='library'){this.libraryHits=await this.corpus.search(this.librarySearch,{content:this.libraryContent,signal:this.signal});}await this.persist();await this.render();if(which==='reader')this.root.querySelector('.ll-reader .ll-search-results')?.scrollIntoView({block:'start',behavior:'instant'});}
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
    if(action==='scan-field'||action==='scan-prev-field'||action==='scan-next-field'){
      const assessment=b.dataset.context==='assessment';if(assessment&&this.state.assessment?.result)return;
      const t=this.selectedTask();if(!assessment&&t.kind!=='scan')return;
      const a=assessment?this.state.assessment:null,item=assessment?this.cases.find(c=>c.id===a.caseId):null,questions=assessment?dossierScanQuestions(item,a.answer,this.scans):scanQuestionsFor(this.scans.find(s=>s.id===t.scanId));
      const current=assessment?this.assessmentField:this.scanFieldIndex(t,questions),next=action==='scan-field'?Number(b.dataset.index):current+(action==='scan-next-field'?1:-1),index=Math.max(0,Math.min(next,questions.length-1));if(!Number.isInteger(index))return;
      if(assessment){this.assessmentField=index;a.scanFieldIndex=index;}else{this.state.scanFields||={};this.state.scanFields[t.id]=index;this.state.answers[t.id]=this.answer(t);}
      this.setScanHints(false);await this.persist();await this.render();this.root.querySelector('.ll-current-field')?.scrollIntoView({block:'nearest',behavior:'instant'});return;
    }
    if(action==='hotspot'||action==='type-choice'||action==='history-edition'){
      if(this.isLocked())return;const t=this.selectedTask(),a=this.answer(t);a.submitted=false;
      if(action==='hotspot'){if(t.kind!=='scan')return;const scan=this.scans.find(s=>s.id===t.scanId),questions=scanQuestionsFor(scan);if(!scan.hotspots.some(h=>h.id===b.dataset.id))return;a.metadata[questions[this.scanFieldIndex(t,questions)].field]=b.dataset.id;this.setScanHints(false);}if(action==='type-choice')a.type=b.dataset.value;if(action==='history-edition'){a.docId=b.dataset.id;a.selections=[];this.teacherReading=null;this.teacherTarget=null;}
      this.state.answers[t.id]=a;await this.persist();return this.render();
    }
    if(action==='submit-task'){
      if(this.isLocked())return;const t=this.selectedTask(),a=this.answer(t);if(t.kind!=='scan'&&!a.type&&!(a.selections||[]).length){this.notice='Сначала выберите область, вид документа или фрагмент.';return this.render();}
      a.submitted=true;this.state.answers[t.id]=a;await this.persist();
      if(['text','history'].includes(t.kind)&&this.root.querySelector('.ll-reader')){this.refreshReaderSelection('learning',{review:true});return;}
      return this.render();
    }
    if(action==='teacher-jump-unit'){
      if(!this.teacherAccess()||this.view!=='learn')return;const t=this.selectedTask(),d=await this.corpus.load(t.docId);if(!this.teacherAccess()||this.selectedTask().id!==t.id)return;
      const allowed=new Set((t.answerSets||[]).flatMap(set=>expandIds(set,[d])));if(b.dataset.doc!==d.id||!allowed.has(b.dataset.id))return;
      this.teacherTarget={taskId:t.id,unitId:b.dataset.id};
      if(!this.scrollReaderUnit(d.id,b.dataset.id,{teacher:true})){this.teacherReading={taskId:t.id,docId:d.id};await this.render();this.scrollReaderUnit(d.id,b.dataset.id,{teacher:true});}return;
    }
    if(action==='search-page'){this.state.reader[b.dataset.doc]||={};this.state.reader[b.dataset.doc].searchPage=Math.max(0,Number(b.dataset.page)||0);await this.persist();return this.render();}
    if(action==='section'){
      const d=await this.corpus.load(b.dataset.doc),section=d.sections.find(s=>s.id===b.dataset.id);if(!section)return;
      this.state.reader[d.id]||={};Object.assign(this.state.reader[d.id],{sectionId:section.id,tocOpen:false});
      const reader=b.closest('[data-reader-doc]');reader?.querySelector('.ll-reader-grid')?.classList.remove('toc-open');reader?.querySelector('[data-action="toggle-toc"]')?.setAttribute('aria-expanded','false');
      reader?.querySelectorAll('[data-action="section"]').forEach(el=>el.classList.toggle('active',el.dataset.id===section.id));this.scrollReaderUnit(d.id,section.unitIds[0]);await this.persist();return;
    }
    if(action==='toggle-toc'||action==='clear-search'){
      const reader=b.closest('[data-reader-doc]'),id=reader?.dataset.readerDoc;if(!id)return;this.state.reader[id]||={};if(action==='toggle-toc'){this.state.reader[id].tocOpen=!this.state.reader[id].tocOpen;reader.querySelector('.ll-reader-grid')?.classList.toggle('toc-open',this.state.reader[id].tocOpen);b.setAttribute('aria-expanded',String(this.state.reader[id].tocOpen));return;}this.state.reader[id].query='';return this.render();
    }
    if(action==='jump-unit'||action==='library-hit'){
      const d=await this.corpus.load(b.dataset.doc),u=d.units.find(u=>u.id===b.dataset.id);if(!u)return;
      this.state.reader[d.id]||={};this.state.reader[d.id].sectionId=u.sectionId;
      if(action==='jump-unit'&&this.scrollReaderUnit(d.id,u.id)){await this.persist();return;}
      this.state.reader[d.id].query='';this.scrollUnit=u.id;
      if(action==='library-hit'){if(b.dataset.context==='assessment'){this.addDocument(d.id);this.state.assessment.stage=3;this.assessmentDoc=d.id;}else this.libraryDoc=d.id;}
      await this.persist();return this.render();
    }
    if(action==='select-unit'||action==='remove-unit'){
      if(this.isLocked())return;const assessment=b.dataset.context==='assessment';if(assessment&&this.state.assessment?.result)return;
      const t=assessment?this.cases.find(c=>c.id===this.state.assessment.caseId):this.selectedTask();const a=assessment?this.state.assessment.answer:this.answer(t);const id=b.dataset.unit||b.dataset.id;
      const list=a.selections||=[],has=list.includes(id);if(!has&&list.length>=selectionLimit(t,[...this.corpus.cache.values()])){this.notice='Достигнут предел фрагментов. Уберите лишний, прежде чем добавить новый.';return this.render();}
      a.selections=has?list.filter(x=>x!==id):[...list,id];if(!assessment){a.docId=b.dataset.doc||a.docId;a.submitted=false;this.state.answers[t.id]=a;this.publishPresence();}
      this.refreshReaderSelection(assessment?'assessment':'learning');await this.persist();return;
    }
    if(action==='library-open'){this.libraryDoc=b.dataset.id;return this.render();}
    if(action==='library-back'){this.libraryDoc=null;return this.render();}
    if(action==='start-assessment')return this.startAssessment();
    if(action==='assessment-stage'||action==='assessment-prev'||action==='assessment-next'){
      if(!this.state.assessment||this.state.assessment.result)return;this.state.assessment.stage=action==='assessment-stage'?Number(b.dataset.index):Math.max(0,Math.min(4,this.state.assessment.stage+(action==='assessment-next'?1:-1)));this.confirming=false;await this.persist();return this.render();
    }
    if(action==='metadata-field'){const a=this.state.assessment;if(!a||a.result)return;const item=this.cases.find(c=>c.id===a.caseId),questions=dossierScanQuestions(item,a.answer,this.scans),index=Number(b.dataset.index);if(!Number.isInteger(index)||index<0||index>=questions.length)return;this.assessmentField=index;a.scanFieldIndex=index;this.setScanHints(false);await this.persist();return this.render();}
    if(action==='classification-index'){this.activeType=Number(b.dataset.index);return this.render();}
    if(action==='assessment-hotspot'||action==='assessment-type'){
      if(this.isLocked()||this.state.assessment?.result)return;const a=this.state.assessment,item=this.cases.find(c=>c.id===a.caseId);
      if(action==='assessment-hotspot'){const scan=this.scans.find(s=>s.id===item.scanId),questions=dossierScanQuestions(item,a.answer,this.scans);if(!scan.hotspots.some(h=>h.id===b.dataset.id)||!questions[this.assessmentField])return;a.answer.metadata[questions[this.assessmentField].field]=b.dataset.id;this.setScanHints(false);}else a.answer.classifications[b.dataset.scan]=b.dataset.value;
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
    this.state.assessment={caseId:item.id,attemptId:this.opt.attemptId||uid(),startedAt:Date.now(),contentVersion:this.catalog.contentVersion,preview:this.demo||this.teacher||!ready,stage:0,phase:'active',answer:{metadataMode:SCAN_METADATA_MODE,metadata:{},classifications:{},documentIds:[],selections:[]},result:null,delivery:'not-submitted'};
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
    const taskId=this.view==='learn'&&!this.extraTask&&this.selectedTask().kind==='text'?this.selectedTask().id:null;
    if(this.presenceTask===taskId)return;
    this.presenceTask=taskId;this.liveData=null;
    this.live?.watchTask(taskId);if(taskId)this.publishPresence();
  }
  publishPresence(){
    if(!this.live||this.isLocked()||this.view!=='learn'||this.extraTask||document.visibilityState!=='visible')return;
    const task=this.selectedTask();if(task.kind!=='text'||this.presenceTask!==task.id)return;
    const answer=this.answer(task);
    void this.live.choose({docId:answer.docId,selections:answer.selections||[]}).catch(()=>this.applyPresence());
  }
  applyPresence(){
    const task=this.view==='learn'&&!this.extraTask&&this.selectedTask().kind==='text'?this.selectedTask():null;
    const snapshot=task&&this.liveData?.taskId===task.id?this.liveData:null;
    const aggregates=snapshot?.connected&&!snapshot.error?snapshot.aggregates:null;
    const status=this.root.querySelector('[data-presence-status]');
    if(status){
      const message=!this.live?'Совместные отметки доступны после входа в профиль.':!snapshot?.connected||snapshot.error?'Общие отметки временно недоступны. Ваш ответ сохранён.':'Сейчас на вопросе ответов: '+(aggregates?.respondents||0);
      status.textContent=translate(message,this.locale);
    }
    this.root.querySelectorAll('[data-presence-count]').forEach(el=>el.remove());
    const peerUnits=aggregates?.selections||{},changedUnits=new Set([...Object.keys(peerUnits),...Array.from(this.root.querySelectorAll('.ll-paragraph.peer[data-context="learning"]'),el=>el.dataset.unit)]);
    for(const id of changedUnits){
      const el=this.root.querySelector(`.ll-paragraph[data-context="learning"][data-unit="${CSS.escape(id)}"]`);if(!el)continue;
      const n=peerUnits[id]||0;el.classList.toggle('peer',Boolean(n));
      if(n){const label=document.createElement('span');label.dataset.presenceCount='';label.className='ll-peer-badge';label.textContent=translate(n+' выбрали',this.locale);el.querySelector('.ll-paragraph-locator')?.append(label);}
    }
  }
  leaveLive(){this.liveUnsub?.();this.live?.close();this.live=null;this.liveData=null;this.presenceTask=null;this.liveUnsub=null;document.removeEventListener('visibilitychange',this.presenceVisibilityHandler);}
  download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async setLocale(lang){const extraId=this.extraTask?.id;this.locale=normalizeLocale(lang);this.root.lang=this.locale==='zh'?'zh-Hans':this.locale;Object.assign(this,localizeContent(this.corpus.bank,this.corpus.cases,this.locale));this.extraTask=extraId?this.bank.extra.find(t=>t.id===extraId):null;return this.render();}
  async destroy(){if(this.closed||this.disposing)return this.queue;this.disposing=true;this.leaveLive();clearInterval(this.tick);await this.persist().catch(()=>{});this.closed=true;this.controller.abort();this.lease?.release();this.store?.close();this.opt.signal?.removeEventListener('abort',this.abortParent);this.root.removeEventListener('click',this.clickHandler);this.root.removeEventListener('input',this.inputHandler);this.root.removeEventListener('change',this.inputHandler);this.root.removeEventListener('submit',this.submitHandler);window.removeEventListener('rudn:identitychange',this.identityHandler);window.removeEventListener('beforeunload',this.beforeUnload);this.root.classList.remove('legal-lab');}
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
    container.innerHTML=app.report(item,{caseId:item.id,preview:false,delivery:'host-accepted',answer,result});translateDOM(container,lang);app.prepareScanCrops(container);
  };
  try{
    const corpus=await new Corpus(BASE,{signal:controller.signal}).initialize();
    app=Object.create(LegalLab.prototype);Object.assign(app,{corpus,catalog:corpus.catalog,scans:corpus.scans,reportOnly:true});await render(locale);
  }catch(err){if(err.name!=='AbortError'){console.warn('Legal Lab report unavailable',err);container.innerHTML='<div class="ll-alert ll-warning" role="alert">Не удалось открыть материалы. Проверьте соединение и повторите загрузку.</div>';translateDOM(container,locale);}}
  return {setLocale:lang=>app?render(lang):Promise.resolve(),destroy(){controller.abort();signal?.removeEventListener('abort',abort);container.classList.remove('legal-lab');container.replaceChildren();}};
}
