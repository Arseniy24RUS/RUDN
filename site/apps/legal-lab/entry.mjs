import {migrateClassroomScans,VERSION,EVIDENCE_MODE,ACT_TYPES,SCAN_METADATA_MODE,scanQuestionsFor,dossierScanQuestions,normalizeScanSelections,escapeHTML as e,uid,gradeTask,gradeEvidence,scoreDossier,chooseCase,assessmentReady,searchUnits,expandIds,selectionLimit,hash32,parseDossierAnswer} from './lib/core.mjs';
import {Store,editorLease,freshState,RevisionConflict} from './lib/storage.mjs';
import {Corpus} from './lib/corpus.mjs';
import {loadReportDocuments} from './lib/report-corpus.mjs';
import {DocumentTranslations} from './lib/translations.mjs';
import {documentDisplay,documentLocale,displayLabel,setReaderQuery} from './lib/translation-ui.mjs';
import {canonicalArticleSelections} from './lib/article-evidence.mjs';
import {labelForUnit} from './lib/reader-tools.mjs';
import {captureReaderPosition,restoreReaderPosition,readerView,selectionTrayView,readerSearchPanel,refreshReaderSearch,prepareReaderLayout,scrollReaderUnitIntoView,lessonNavigation} from './lib/reader-view.mjs';
import {FIVE_MODE,chooseFiveVariant} from './lib/assessment-five.mjs';
import {isFiveWork,fiveVariant,fiveTask,fiveAnswer,fiveIntro,fiveAssessment,fiveReport,fiveEvidenceSet} from './lib/five-view.mjs';
import {LocalLive} from './lib/live.mjs';
import {localizeContent} from './locales/content.mjs';
import {translate,translateDOM,normalizeLocale} from './locales/ui.mjs';
const BASE=new URL('./',import.meta.url);
const SEARCH_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
const SCAN_EYE='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h11l6 6v20H8z"/><path d="M19 3v7h6M12 15h9M12 19h9M12 23h6"/></svg>';
const SCAN_FIELD_COLORS=Object.freeze({issuer:'#17658c',type:'#8254a3',title:'#a24d1c',date:'#237366',number:'#994667',signature:'#62652c',approved:'#5261a7',agreed:'#9b592c',registration:'#596b83',acknowledgment:'#7f573d',emblem:'#6b587a',place:'#425e72',executor:'#725523',seal:'#3d6f74','signature-chair':'#6c387c','signature-secretary':'#304d84','signatures-members':'#6f6222','certified-copy':'#7d3840','letterhead-author':'#686029',address:'#8c4f24',contacts:'#2f6c55'});
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
const imageDimensions=scan=>Number.isInteger(scan?.imageWidth)&&Number.isInteger(scan?.imageHeight)&&scan.imageWidth>0&&scan.imageHeight>0?` width="${scan.imageWidth}" height="${scan.imageHeight}"`:'';
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
      this.translations=new DocumentTranslations(BASE,{catalog:this.catalog,signal:this.signal});
      this.fiveSource=await this.corpus.json('data/assessment-variants.json');if(this.fiveSource.contentVersion!==this.catalog.contentVersion)throw Error('Assessment content version mismatch');this.localizeFive();
      this.namespace=`${this.owner}:${this.period}`;this.store=new Store(this.namespace);this.lease=await editorLease(this.namespace);this.readOnly=!this.lease.acquired;
      const local=await this.store.get('session');if(!this.active())return;
      const incoming=this.opt.initialState;const saved=incoming?{revision:local?.revision||0,value:structuredClone(incoming)}:local;
      if(saved?.value&&(!saved.value.answers||!saved.value.reader||!saved.value.id))throw new Error('Invalid draft state');
      if(saved&&saved.value.contentVersion!==this.catalog.contentVersion){this.revision=saved.revision;this.incompatible=saved.value;this.state=freshState(this.catalog.contentVersion);this.readOnly=true;this.notice='Сохранённая работа относится к прежнему комплекту заданий. Экспортируйте её и обратитесь к преподавателю.';this.noticeType='warning';}
      else {this.state=saved?.value||freshState(this.catalog.contentVersion);this.revision=saved?.revision||0;}
      migrateClassroomScans(this.state,this.bank);
      if(this.state.assessment&&!isFiveWork(this.state.assessment)&&!this.state.assessment.result){this.state.assessmentHistory||=[];this.state.assessmentHistory.push(structuredClone(this.state.assessment));this.state.assessment=null;}
      this.view=['learn','assessment'].includes(this.opt.initialView)?this.opt.initialView:this.state.view||'home';if(!['home','learn','assessment','help'].includes(this.view))this.view='home';
      // Only unfinished drafts adopt the complete-scan rubric. Completed work
      // retains its recorded mode, including the original three-field rubric.
      if(this.state.assessment&&!isFiveWork(this.state.assessment)&&!this.state.assessment.result){if(!Object.hasOwn(this.state.assessment.answer,'metadataMode'))this.state.assessment.answer.metadataMode=SCAN_METADATA_MODE;if(!Object.hasOwn(this.state.assessment.answer,'evidenceMode'))this.state.assessment.answer.evidenceMode=EVIDENCE_MODE;}
      if(this.readOnly&&!this.incompatible)this.notice='Другая вкладка редактирует эту работу. Здесь доступен просмотр. Закройте другую вкладку и обновите страницу.';
      if(this.catalog.documents.every(d=>d.coverage==='excerpts'))await this.corpus.all();
      this.clickHandler=ev=>{const b=ev.target.closest('[data-action]');if(b&&this.root.contains(b)&&!b.disabled){ev.preventDefault();this.action(b.dataset.action,b).catch(err=>this.fail(err));}};
      this.inputHandler=ev=>this.input(ev);this.submitHandler=ev=>{if(ev.target.matches('[data-search-form]')){ev.preventDefault();this.runSearch(ev.target.dataset.searchForm).catch(err=>this.fail(err));}};
      this.readerPointerHandler=ev=>{const button=ev.target.closest('.ll-reader button');if(button&&!button.disabled&&ev.isPrimary!==false)button.focus({preventScroll:true});};this.root.addEventListener('pointerdown',this.readerPointerHandler,{passive:true});
      this.readerScrollHandler=ev=>{const paper=ev.target;if(!paper.matches?.('.ll-paper'))return;const id=paper.closest('[data-reader-doc]')?.dataset.readerDoc;if(id){this.state.reader[id]||={};this.state.reader[id].scrollTop=paper.scrollTop;}};this.root.addEventListener('scroll',this.readerScrollHandler,{capture:true,passive:true});
      this.readerViewportHandler=()=>prepareReaderLayout(this);window.addEventListener('resize',this.readerViewportHandler,{signal:this.signal});window.visualViewport?.addEventListener('resize',this.readerViewportHandler,{signal:this.signal});
      this.typeContextHandler=ev=>{if(ev.target.closest('.ll-type-scan'))ev.preventDefault();};this.root.addEventListener('contextmenu',this.typeContextHandler);
      this.root.addEventListener('click',this.clickHandler);this.root.addEventListener('input',this.inputHandler);this.root.addEventListener('change',this.inputHandler);this.root.addEventListener('submit',this.submitHandler);
      this.identityHandler=()=>{if(!this.teacherAccess()){this.teacher=false;this.root.querySelectorAll('[data-teacher-answer]').forEach(el=>el.remove());this.root.querySelectorAll('.ll-teacher-target').forEach(el=>el.classList.remove('ll-teacher-target'));}if(!this.active()||this.opt.getOwner&&this.opt.getOwner()!==this.owner)this.destroy();};
      window.addEventListener('rudn:identitychange',this.identityHandler);
      this.beforeUnload=ev=>{if(this.pending){ev.preventDefault();ev.returnValue='';}};window.addEventListener('beforeunload',this.beforeUnload);
      this.tick=setInterval(()=>{if(!this.active())return;if(document.visibilityState==='visible')this.state.elapsedMs+=1000;const el=this.root.querySelector('[data-clock]');if(el)el.textContent=timeText(this.state.elapsedMs);if(this.state.elapsedMs%15000===0)this.persist().then(()=>this.completePractice()).catch(err=>this.fail(err));},1000);
      // Older drafts may contain a classroom link. It never reconnects or
      // restricts navigation in the automatic, page-scoped shared activity.
      delete this.state.liveRoom;
      await this.initializePresence();await this.render();void this.completePractice();
    } catch(err){if(err.name==='AbortError'||!this.active())return;console.error('Legal Lab loading failed',err);this.root.innerHTML=`<div class="ll-alert ll-danger" role="alert"><h2>Модуль не открылся</h2><p>Не удалось открыть материалы. Проверьте соединение и повторите загрузку.</p><button class="ll-primary" data-retry-load>Повторить загрузку</button></div>`;translateDOM(this.root,this.locale);this.root.querySelector('[data-retry-load]').addEventListener('click',()=>window.location.reload());}
  }
  persist(){
    if(!this.state||this.readOnly||this.closed)return this.queue;
    if(!this.state.quizCompletion&&this.bank.classroom.every(t=>this.answer(t).submitted))this.state.quizCompletion={contentVersion:this.catalog.contentVersion,finishedAt:Date.now()};
    const snapshot=structuredClone({...this.state,view:this.view});this.pending++;
    this.queue=this.queue.catch(()=>{}).then(async()=>{try{if(this.readOnly||!this.active())return;const record=await this.store.put('session',snapshot,this.revision);this.revision=record.revision;
      if(this.opt.checkpoint&&this.active()){try{await this.opt.checkpoint({attemptId:snapshot.assessment?.attemptId||snapshot.id,contentVersion:this.catalog.contentVersion,state:snapshot,mode:snapshot.assessment&&!snapshot.assessment.preview?'assessment':'practice'});}catch(err){if(['RevisionConflict','DraftConflict'].includes(err?.name)){this.readOnly=true;this.notice='Работа изменена на другом устройстве. Обновите страницу, чтобы загрузить актуальный черновик.';this.noticeType='warning';void this.render();throw err;}this.notice='Сохранено на устройстве. Облачная копия черновика пока недоступна.';this.noticeType='warning';}}
      const label=this.root.querySelector('[data-save-state]');if(label)label.textContent=translate(this.store.mode==='indexeddb'?'Сохранено на устройстве':'Резервное локальное сохранение',this.locale);
    }catch(err){if(err instanceof RevisionConflict)this.readOnly=true;throw err;}finally{this.pending--;}});
    return this.queue;
  }
  async completePractice(){
    if(!this.opt.onPracticeComplete||this.teacher||this.demo||!this.active()||this.readOnly||this.practiceDelivery||this.state.practiceCompletion?.delivered)return;
    this.practiceDelivery=true;
    try{
      if(!this.state.practiceCompletion){
        if(!this.bank.classroom.every(t=>this.answer(t).submitted))return;
        await this.corpus.all();if(!this.active()||this.readOnly)return;
        const docs=[...this.corpus.cache.values()],answers=this.bank.classroom.map(t=>({task:t,answer:structuredClone(this.answer(t))}));
        if(!answers.every(({task,answer})=>answer.submitted&&gradeTask(task,answer,docs,this.scans).exact))return;
        this.state.practiceCompletion={id:this.state.id,contentVersion:this.catalog.contentVersion,points:answers.length,total:answers.length,finishedAt:Date.now()};
        await this.persist();if(!this.active()||this.readOnly)return;
      }
      const receipt=structuredClone(this.state.practiceCompletion);await this.opt.onPracticeComplete(receipt);
      if(!this.active())return;this.state.practiceCompletion.delivered=true;await this.persist();
    }catch{ /* Durable delivery is retried on the next ordinary save. */ }finally{this.practiceDelivery=false;}
  }
  flush(){return this.persist();}
  fail(err){if(!this.active()||err?.name==='AbortError')return;console.warn('Legal Lab action failed',err);if(['RevisionConflict','DraftConflict'].includes(err?.name))this.notice='Работа изменена на другом устройстве. Обновите страницу, чтобы загрузить актуальный черновик.';else this.notice=['Связь недоступна. Дождитесь подключения.','Профиль изменён. Откройте модуль заново.','Для досье можно выбрать до трёх документов','Самостоятельная работа ещё не открыта'].includes(err?.message)?err.message:'Не удалось выполнить действие. Ответы сохранены. Повторите попытку.';this.noticeType='danger';this.render().catch(()=>{});}
  isLocked(){return this.readOnly||!this.active();}
  doc(id){return this.catalog.documents.find(d=>d.id===id);}
  task(){return this.bank.classroom[Math.max(0,Math.min(this.state.index||0,this.bank.classroom.length-1))];}
  selectedTask(){return this.extraTask||this.task();}
  answer(t){const saved=this.state.answers[t.id]||{docId:t.kind==='history'?null:t.docId,selections:[],submitted:false};return t.kind==='scan'?{...saved,metadataMode:SCAN_METADATA_MODE,metadata:normalizeScanSelections(t,saved,this.scans),scanId:t.scanId,submitted:saved.metadataMode===SCAN_METADATA_MODE&&Boolean(saved.submitted)}:saved;}
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
    const oldReader=this.root.querySelector('[data-reader-doc]'),oldPaper=oldReader?.querySelector('.ll-paper'),nextReaderDoc=this.view==='learn'&&['text','history'].includes(this.selectedTask().kind)?(this.answer(this.selectedTask()).docId||this.selectedTask().docId):this.view==='library'?this.libraryDoc:this.view==='assessment'?this.assessmentDoc:null;
    const preserveReading=Boolean(learningTask&&learningTask===this.renderedLearningTask||oldReader&&oldReader.dataset.readerDoc===nextReaderDoc),previousMinHeight={value:this.root.style.getPropertyValue('min-height'),priority:this.root.style.getPropertyPriority('min-height')};
    const oldViewport=this.root.querySelector('.ll-scan-viewport');const scanPosition=oldViewport?{key:oldViewport.dataset.scanContext,left:oldViewport.scrollLeft,top:oldViewport.scrollTop}:null;
    const pagePosition=preserveReading?{x:window.scrollX,y:window.scrollY}:null;
    const readerPosition=captureReaderPosition(this,oldReader);
    try{
      // WebKit can clamp page scroll while innerHTML briefly removes all children.
      if(preserveReading)this.root.style.setProperty('min-height',this.root.getBoundingClientRect().height+'px',previousMinHeight.priority);
      this.root.innerHTML=`<header class="ll-header"><button class="ll-brand" data-action="home" aria-label="На главную модуля">${ICON}<span><strong>На подпись</strong><small>Правовые акты · Семинар 4</small></span></button><div class="ll-header-meta"><span class="ll-chip">${this.teacher?'Преподаватель':this.demo?'Демонстрация':'Практикум'}</span><span class="ll-clock" title="Ориентир занятия – 90 минут; скорость не влияет на балл"><span data-clock>${timeText(this.state.elapsedMs)}</span><small> / 90 мин</small></span><button class="ll-icon-button" data-action="exit" aria-label="Вернуться к курсу">↗</button></div></header><nav class="ll-nav" aria-label="Разделы практикума">${[['home','Главная'],['learn','Квиз'],['assessment','На оценку'],['help','?']].map(([v,t])=>`<button data-action="view" data-view="${v}" class="${this.view===v?'active':''}" ${this.view===v?'aria-current="page"':''} ${v==='assessment'&&!this.assessmentUnlocked()?'disabled':''} ${v==='help'?'aria-label="Справка" title="Справка"':''}>${t}</button>`).join('')}</nav>${language}${warn}${this.incompatible&&this.lease?.acquired&&(this.demo||this.incompatible.assessment?.preview)?'<div class="ll-alert ll-warning"><button class="ll-secondary" data-action="archive-preview">Архивировать старую демонстрацию и открыть новый комплект</button></div>':''}<main class="ll-main">${body}</main><footer class="ll-footer"><span data-save-state>${this.readOnly?'Только просмотр':this.pending?'Сохраняем…':'Сохранение на устройстве'}</span></footer><div class="ll-sr" aria-live="polite" id="ll-live-region"></div>`;
      translateDOM(this.root,this.locale);this.prepareScanCrops();this.prepareTypeScans();prepareReaderLayout(this);this.applyPresence();
      for(const reader of this.root.querySelectorAll('[data-reader-doc]')){const paper=reader.querySelector('.ll-paper'),id=reader.dataset.readerDoc;if(paper){if(readerPosition?.docId===id)restoreReaderPosition(this,readerPosition);else paper.scrollTop=this.state.reader[id]?.scrollTop||0;}}
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
        if(pagePosition)window.scrollTo({left:pagePosition.x,top:pagePosition.y,behavior:'instant'});
      }
    }
    if(learningTask!==this.renderedLearningTask){
      this.renderedLearningTask=learningTask;this.pendingLearningScroll=learningTask;
      if(learningTask)requestAnimationFrame(()=>{
        if(!this.active()||this.view!=='learn'||this.pendingLearningScroll!==learningTask)return;
        this.pendingLearningScroll=null;if(!preserveReading)this.root.querySelector('.ll-question-card,.ll-reader-dock')?.scrollIntoView({block:'start',behavior:'instant'});
      });
    }
    if(this.scrollUnit){const id=this.scrollUnit;this.scrollUnit=null;const el=this.root.querySelector(`[data-unit="${CSS.escape(id)}"]`),docId=el?.closest('[data-reader-doc]')?.dataset.readerDoc;if(docId)this.scrollReaderUnit(docId,id);}
  }
  quizCompleted(){return this.state.quizCompletion?.contentVersion===this.catalog.contentVersion||this.bank.classroom.every(t=>this.answer(t).submitted);}
  assessmentUnlocked(){return this.teacherAccess()||this.quizCompleted();}
  home(){
    const sections=[['Реквизиты','scan',0],['Виды актов','type',6],['Поиск нормы','text',14]],a=this.state.assessment,unlocked=this.assessmentUnlocked();
    return `<section class="ll-hero"><div class="ll-eyebrow">РАБОЧЕЕ МЕСТО · 04</div><h1>Найдите норму.<br><span>Обоснуйте ответ.</span></h1><p>Распознайте документ, найдите норму и обоснуйте ответ.</p><div class="ll-hero-number" aria-hidden="true">§</div></section><section class="ll-section ll-home-quiz"><div class="ll-section-title"><h2>Квиз</h2><span>${this.bank.classroom.filter(t=>this.answer(t).submitted).length} / ${this.bank.classroom.length}</span></div><div class="ll-route-cards">${sections.map(([title,kind,index])=>{const tasks=this.bank.classroom.filter(t=>t.kind===kind),done=tasks.filter(t=>this.answer(t).submitted).length;return `<button class="ll-route-card" data-action="go-task" data-index="${index}"><h3>${title}</h3><span class="ll-home-progress">${done} / ${tasks.length}</span></button>`;}).join('')}</div><div class="ll-actions"><button class="ll-primary" data-action="view" data-view="learn">Продолжить →</button></div></section><section class="ll-dossier-banner ll-home-assessment"><div><h2>На оценку</h2>${a?.result?`<p class="ll-home-score">${a.result.points} / 5</p>`:''}${!unlocked?'<p>Ответьте на все задания квиза, чтобы открыть работу на оценку.</p>':''}</div><div class="ll-actions"><button class="ll-primary" data-action="view" data-view="assessment" ${!unlocked?'disabled':''}>Продолжить →</button>${a?`<button class="ll-secondary" data-action="restart-assessment" ${!unlocked||this.isLocked()?'disabled':''}>Начать заново</button>`:''}</div></section>`;
  }
  livePanel(){
    return '<section class="ll-live-panel"><div><strong>Совместная работа</strong><p>Совместные отметки работают только при поиске абзацев в больших документах. Их видят участники на том же вопросе; при переходе или выходе отметки исчезают. Сканы, виды актов и досье выполняются индивидуально.</p></div></section>';
  }
  async loadDocument(id){
    const doc=await this.corpus.load(id),locale=documentLocale(this,id);
    if(locale!=='ru')try{await this.translations.load(doc,locale);}catch(error){if(error.name==='AbortError')throw error;this.translationErrors||={};this.translationErrors[id+':'+locale]=error.code||'load';}
    return doc;
  }
  async learning(){
    const t=this.selectedTask(),a=this.answer(t),revealed=this.displayCorrect(t);
    let body='';
    if(t.kind==='scan'){const scan=this.scans.find(s=>s.id===t.scanId),questions=scanQuestionsFor(scan);body=this.scanAssignment(scan,a.metadata,{questions,index:this.scanFieldIndex(t,questions),review:revealed});}
    else if(t.kind==='type')body=this.typeView(t,a.type,{review:revealed,correct:t.answer,action:'type-choice'});
    else if(t.kind==='history')body=`<div class="ll-editions"><h3>Документ для даты события</h3>${t.editionChoices.map(id=>{const d=this.doc(id);return `<button data-action="history-edition" data-id="${id}" class="${a.docId===id?'selected':''}"><strong>${e(d.title)}</strong><span>${e(d.number)}</span></button>`;}).join('')}</div>`;
    else {const d=await this.loadDocument(a.docId||t.docId);body=this.reader(d,a.selections||[],{context:'learning',review:revealed,correctIds:expandIds(t.answerSets[0],[d]),limit:selectionLimit(t,[...this.corpus.cache.values()])});}
    if(t.kind==='history'&&(a.docId||this.teacherAccess()&&this.teacherReading?.taskId===t.id)){const preview=this.teacherAccess()&&this.teacherReading?.taskId===t.id,d=await this.loadDocument(preview?this.teacherReading.docId:a.docId);body+=this.reader(d,preview?[]:a.selections||[],{context:'learning',review:revealed&&!preview,correctIds:expandIds(t.answerSets[0],[d]),limit:selectionLimit(t,[d]),readonly:Boolean(preview)});}
    const teacherKey=this.teacherAccess()?await this.teacherAnswer(t):'';
    const navDisabled=false;
    const grade=revealed&&t.kind==='type'?gradeTask(t,a,[...this.corpus.cache.values()],this.scans):null;
    return `${lessonNavigation(this,t,navDisabled)}${t.kind==='text'?'':`<div class="ll-question-card"><div class="ll-question-meta"><span>${this.extraTask?'Дополнительная ситуация':`${this.state.index+1} / ${this.bank.classroom.length}`}</span><span>${({scan:'На скане',type:'Вид акта',text:'В документе',history:'На дату события'})[t.kind]}</span></div><h1>${e(t.kind==='scan'?'Найдите реквизиты документа':t.prompt)}</h1><p>${t.kind==='scan'?'Выберите название реквизита, затем нажмите на его место в документе.':t.kind==='type'?'Восстановите вид реального документа по автору и заголовку.':'Ответьте фрагментом документа. Нажмите на абзац. При необходимости отметьте несколько.'}</p>${t.kind==='text'&&!this.extraTask?'<div class="ll-live-strip" data-presence-status role="status"></div>':''}</div>`}${teacherKey}${body}<div class="ll-task-bottom">${grade?`<div class="ll-feedback ${grade.exact?'success':'attention'}"><strong>${grade.exact?'Верно':'Попробуйте ещё раз'}</strong>${grade.exact?`<p>${e(t.explanation)}</p>`:'<p>Выбранный вид не подходит. Попробуйте другой ответ.</p>'}${grade.extra?'<p>Уберите лишние фрагменты.</p>':''}${grade.missing?'<p>Выделение пока неполное.</p>':''}</div>`:''}<div class="ll-actions"><button class="ll-secondary" data-action="prev-task" ${navDisabled||(!this.extraTask&&this.state.index===0)?'disabled':''}>← Назад</button><button class="ll-primary" data-action="submit-task" ${this.isLocked()?'disabled':''}>${t.kind==='scan'?'Проверить все реквизиты':'Проверить ответ'}</button><button class="ll-secondary" data-action="next-task" ${navDisabled?'disabled':''}>Далее →</button></div></div></section></div>`;
  }
  taskLabel(task){if(task.kind!=='scan')return task.kind==='type'?task.title:task.prompt;const scan=this.scans.find(s=>s.id===task.scanId);return translate('Реквизиты',this.locale)+' · '+(scan?.number||task.id)+' · '+translate(scan?.shortTitle||scan?.classificationTitle||scan?.title||'',this.locale);}
  scanFieldIndex(task,questions){const index=this.state.scanFields?.[task.id];return Math.max(0,Math.min(Number.isInteger(index)?index:0,questions.length-1));}
  scanFieldColor(field){return SCAN_FIELD_COLORS[field]||'#526b7d';}
  scanFieldValue(scan,field){return scan?.hotspots.find(h=>h.id===field)?.value||({issuer:scan?.author,type:scan?.actType,date:scan?.date,number:scan?.number,title:scan?.classificationTitle||scan?.title})[field]||'';}
  scanOriginal(scan){return scan?`<details class="ll-report-original"><summary>Открыть оригинал</summary><p data-original lang="ru">${e(scan.author)}<br>${e(scan.date+' · № '+scan.number)}</p><a href="${asset(scan.image)}" target="_blank" rel="noopener noreferrer"><img src="${asset(scan.image)}" alt="Скан документа" loading="lazy"><span>Увеличить изображение</span></a></details>`:'';}
  scanCrop(scan,field){
    const h=scan?.hotspots.find(h=>h.id===field);if(!h)return '';
    const [x,y,w,hh]=h.rect,ratio=scan.imageWidth*w/(scan.imageHeight*hh);
    const size=Number.isFinite(ratio)&&ratio>0?` style="aspect-ratio:${ratio}"`:'';
    return `<figure class="ll-scan-source-crop" data-source-crop="${e(field)}"><div class="ll-scan-crop"${size}><img src="${asset(scan.image)}" alt="Фрагмент оригинала" loading="lazy" data-crop-width="${w}" data-crop-height="${hh}" style="width:${100/w}%;left:${-x/w*100}%;transform:translateY(${-y*100}%)"></div><figcaption>Фрагмент оригинала</figcaption></figure>`;
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
    return `<section class="ll-scan-assignment-work" data-scan-assignment="${e(scan.id)}" data-scan-mode="${e(context)}"><nav class="ll-scan-fields" aria-label="Реквизиты документа">${questions.map((q,i)=>`<button type="button" data-action="${assessment?'metadata-field':'scan-field'}" data-index="${i}" data-scan-field="${e(q.field)}" class="${i===index?'active':''} ${metadata[q.field]?'assigned':''}" aria-current="${i===index?'step':'false'}" aria-pressed="${Boolean(metadata[q.field])}" style="--ll-field-color:${this.scanFieldColor(q.field)}">${e(q.prompt)}</button>`).join('')}</nav>${this.scanView(scan,metadata[current.field],{action:assessment?'assessment-hotspot':'hotspot',assignments:metadata,questions,activeField:current.field})}${review?this.scanReview(scan,metadata,questions):''}</section>`;
  }
  scanView(scan,selected,{review=false,correct=null,action='hotspot',assignments={},questions=[],activeField=null}={}){
    if(!scan)return '<div class="ll-alert ll-danger">Изображение не найдено</div>';
    const question=action==='assessment-hotspot'?this.state.assessment.attemptId:this.selectedTask().id;
    const context=this.view+':'+question+':'+scan.id;
    if(this.scanContext!==context){this.scanContext=context;this.scanZoom=1;this.scanHints=false;}
    const locked=this.isLocked();
    const assigned=questions.filter(q=>scan.hotspots.some(h=>h.id===assignments[q.field]));
    const frames=assigned.map(q=>{const h=scan.hotspots.find(h=>h.id===assignments[q.field]),same=assigned.filter(other=>assignments[other.field]===h.id),offset=same.findIndex(other=>other.field===q.field)*3;return `<span class="ll-assigned-frame ${activeField===q.field?'active':''}" aria-hidden="true" data-assigned-field="${e(q.field)}" data-selected-region="${e(h.id)}" style="--ll-field-color:${this.scanFieldColor(q.field)};outline-offset:${offset}px;left:${h.rect[0]*100}%;top:${h.rect[1]*100}%;width:${h.rect[2]*100}%;height:${h.rect[3]*100}%"></span>`;}).join('');
    return `<section class="ll-scan-card ${questions.length?'ll-scan-multi':''} ${this.scanHints?'ll-scan-hints-visible':''}"><div class="ll-scan-toolbar"><div><button data-action="toggle-scan-hints" aria-label="${this.scanHints?'Скрыть подсказки на скане':'Показать подсказки на скане'}" title="${this.scanHints?'Скрыть подсказки на скане':'Показать подсказки на скане'}" aria-pressed="${this.scanHints}">${SCAN_EYE}</button><button data-action="zoom-out" aria-label="Уменьшить скан" ${this.scanZoom<=1?'disabled':''}>−</button><span data-scan-zoom>${Math.round(this.scanZoom*100)}%</span><button data-action="zoom-in" aria-label="Увеличить скан" ${this.scanZoom>=3?'disabled':''}>+</button></div></div><div class="ll-scan-viewport" data-scan-context="${e(context)}" role="group" aria-label="Области на скане"><div class="ll-scan" style="width:${this.scanZoom*100}%;max-width:${this.scanZoom*740}px"><img${imageDimensions(scan)} src="${asset(scan.image)}" alt="Скан документа" draggable="false">${scan.hotspots.map(h=>`<button class="ll-hotspot ${selected===h.id?'selected':''} ${!questions.length&&review&&selected===h.id&&h.id===correct?'correct':''}" data-action="${action}" data-id="${e(h.id)}" data-priority-field="${activeField===h.id}" aria-label="${e(this.scanRegionLabel(h))}" aria-pressed="${selected===h.id}" style="left:${h.rect[0]*100}%;top:${h.rect[1]*100}%;width:${h.rect[2]*100}%;height:${h.rect[3]*100}%" ${locked?'disabled':''}></button>`).join('')}${frames}</div></div></section>`;
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
  prepareTypeScans(){
    this.typeImages||=new Map();
    for(const canvas of this.root.querySelectorAll('canvas[data-type-image]')){
      const scan=this.scans.find(s=>s.id===canvas.dataset.typeImage);if(!scan)continue;
      let ready=this.typeImages.get(scan.image);
      if(!ready){ready=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Document image unavailable'));img.src=asset(scan.image);});this.typeImages.set(scan.image,ready);}
      ready.then(img=>{if(!this.active()||!canvas.isConnected)return;canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const region=scan.hotspots.find(h=>h.id==='type');if(canvas.dataset.typeRevealed!=='true'&&region){const [x,y,w,h]=region.rect;ctx.fillStyle='#eef2f6';ctx.fillRect(Math.floor(x*canvas.width),Math.floor(y*canvas.height),Math.ceil(w*canvas.width)+1,Math.ceil(h*canvas.height)+1);}canvas.dataset.imageReady='true';}).catch(()=>{if(canvas.isConnected){canvas.dataset.imageReady='false';canvas.setAttribute('aria-label',translate('Изображение не загрузилось. Обновите страницу.',this.locale));}});
    }
  }
  typeView(t,selected,{review=false,correct=null,action='type-choice',scanId=null}={}){
    const s=scanId?this.scans.find(s=>s.id===scanId):t.scanId?this.scans.find(s=>s.id===t.scanId):null;
    const reveal=review&&selected===correct&&action==='type-choice',region=s?.hotspots.find(h=>h.id==='type');
    const sheet=s?`<div class="ll-type-paper"><div class="ll-type-scan" data-type-scan="${e(s.id)}"><canvas${imageDimensions(s)} data-type-image="${e(s.id)}" data-type-revealed="${reveal}" role="img" aria-label="${reveal?'Скан документа':'Скан документа с закрытым видом акта'}"></canvas>${!reveal&&region?`<span class="ll-type-mask" role="img" aria-label="Вид акта скрыт до проверки" style="left:${region.rect[0]*100}%;top:${region.rect[1]*100}%;width:${region.rect[2]*100}%;height:${region.rect[3]*100}%"><span aria-hidden="true">?</span></span>`:''}</div></div>`:`<div class="ll-type-paper ll-type-text"><p data-original lang="ru">${e(t.author)}</p><div class="ll-missing-type">${reveal?e(translate(correct,this.locale)):'ВИД ДОКУМЕНТА'}</div><h2 data-original lang="ru">${e(t.title)}</h2></div>`;
    return `<section class="ll-type-card"><div class="ll-type-options" role="group" aria-label="Вид документа">${ACT_TYPES.map(v=>`<button data-action="${action}" data-value="${v}" data-scan="${e(scanId||'')}" class="${selected===v?'selected':''} ${reveal&&v===correct?'correct':''}" aria-pressed="${selected===v}" ${this.isLocked()?'disabled':''}>${v}</button>`).join('')}</div><figure class="ll-type-document">${sheet}<figcaption class="ll-sr"><span data-original lang="ru">${e(t.author||s?.author)}. ${e(t.title||s?.classificationTitle)}</span></figcaption></figure>${!reveal?'<p class="ll-type-instruction">Надпись с видом акта закрыта. Определите вид по документу.</p>':''}</section>`;
  }
  reader(d,selected=[],options={}){return readerView(this,d,selected,options);}
  selectionTray(selected,context,limit,docId,readonly=false){return selectionTrayView(this,selected,context,limit,docId,readonly);}

  refreshReaderSelection(context,{review=false}={}){
    const five=context==='assessment-five',assessment=five||context==='assessment',t=five?fiveTask(this):assessment?this.cases.find(c=>c.id===this.state.assessment.caseId):this.selectedTask(),a=five?fiveAnswer(this,t):assessment?this.state.assessment.answer:this.answer(t),selected=new Set(a.selections||[]);
    for(const el of this.root.querySelectorAll(`.ll-paragraph[data-context="${context}"].selected,.ll-paragraph[data-context="${context}"].correct`)){el.classList.remove('selected','correct');el.setAttribute('aria-pressed','false');el.querySelector('.ll-check').textContent='';}
    for(const id of selected){const el=this.root.querySelector(`.ll-paragraph[data-context="${context}"][data-unit="${CSS.escape(id)}"]`);if(el){el.classList.add('selected');el.setAttribute('aria-pressed','true');el.querySelector('.ll-check').textContent='✓';}}
    if(review)for(const id of (gradeTask(t,a,[...this.corpus.cache.values()],this.scans).exact?[...selected]:expandIds(t.answerSets?.[0]||[],[...this.corpus.cache.values()])))this.root.querySelector(`.ll-paragraph[data-context="${context}"][data-unit="${CSS.escape(id)}"]`)?.classList.add('correct');
    for(const tray of this.root.querySelectorAll(`[data-selection-context="${context}"]`)){const box=document.createElement('div'),docId=tray.closest('[data-reader-doc]')?.dataset.readerDoc;box.innerHTML=this.selectionTray([...selected],context,selectionLimit(t,[...this.corpus.cache.values()]),docId);translateDOM(box,this.locale);tray.replaceWith(box.firstElementChild);}
    if(!assessment&&!this.extraTask){const oldPicker=this.root.querySelector('.ll-mobile-task-picker'),oldList=this.root.querySelector('.ll-task-scroll'),box=document.createElement('div');box.innerHTML=lessonNavigation(this,t,false);translateDOM(box,this.locale);const nextPicker=box.querySelector('.ll-mobile-task-picker'),nextList=box.querySelector('.ll-task-scroll');if(oldPicker&&nextPicker)oldPicker.replaceWith(nextPicker);if(oldList&&nextList){const top=oldList.scrollTop;oldList.replaceWith(nextList);nextList.scrollTop=top;}}

    const gate=this.root.querySelector('.ll-nav [data-view="assessment"]');if(gate)gate.disabled=!this.assessmentUnlocked();prepareReaderLayout(this);this.applyPresence();
  }
  scrollReaderUnit(docId,id,options={}){return scrollReaderUnitIntoView(this,docId,id,options);}

  async teacherAnswer(t){
    if(!this.teacherAccess())return '';
    const s=this.scans.find(s=>s.id===t.scanId);let content='';
    if(t.kind==='scan'){
      content=scanQuestionsFor(s).map(q=>{const value=this.scanFieldValue(s,q.field);return `<section class="ll-teacher-scan-field" data-teacher-field="${e(q.field)}"><h3>${e(q.prompt)}</h3>${value?`<p data-original lang="ru">${e(value)}</p>`:''}${this.scanCrop(s,q.field)}</section>`;}).join('');
    }else if(t.kind==='type'){
      content=`<p><strong>${e(t.answer)}</strong></p>${s?`<p data-original lang="ru">${e(s.author)} · ${e(s.date)} · № ${e(s.number)}</p><p data-original lang="ru">${e(s.classificationTitle||s.title)}</p><p><span>В оригинале этого акта указан вид:</span> <q data-original lang="ru">${e(s.actType.toLocaleUpperCase('ru'))}</q></p>`:''}`;
    }else{
      const d=await this.loadDocument(t.docId);if(!this.teacherAccess())return '';const info=documentDisplay(this,d),sets=isFiveWork(this.state.assessment)&&fiveVariant(this)?.tasks.some(q=>q.id===t.id)?[fiveEvidenceSet(t)]:(t.answerSets||[]);
      content=`<p data-document-text lang="${info.locale}"><strong>${e(info.view.title)}</strong><br>${e(info.view.revisionLabel)}</p>`+sets.map((set,i)=>`<section class="ll-teacher-variant">${sets.length>1?`<h4>Допустимый вариант ${i+1}</h4>`:''}${expandIds(set,[d]).map(id=>{const u=info.units.get(id);return u?`<blockquote data-document-text lang="${info.locale}"><strong>${e(displayLabel(this,d,id))}</strong><p>${e(u.text)}</p></blockquote><button type="button" class="ll-secondary" data-action="teacher-jump-unit" data-id="${e(id)}" data-doc="${e(d.id)}">Перейти к основанию</button>`:'';}).join('')}</section>`).join('');
    }
    return `<details class="ll-teacher-answer" data-teacher-answer="${e(t.id)}"><summary>Ответ преподавателю</summary>${content}${t.kind==='scan'?'':`<p>${e(t.explanation)}</p>`}</details>`;
  }
  async library(assessmentMode){
    if(!assessmentMode&&this.libraryDoc){const d=await this.loadDocument(this.libraryDoc);return `<button class="ll-secondary ll-back" data-action="library-back">← К документам</button>${this.reader(d,[],{readonly:true,context:'library'})}`;}
    const entries=this.libraryHits||this.catalog.documents.map(document=>({document,hits:[]}));
    const chosen=new Set(this.state.assessment?.answer.documentIds||[]);
    return `<section class="ll-library"><div class="ll-section-title"><div><div class="ll-eyebrow">ПРАВОВЫЕ ИСТОЧНИКИ</div><h1>${assessmentMode?'Найдите документ для задачи':'Библиотека документов'}</h1></div><span>${this.catalog.documents.length} документов</span></div><form class="ll-searchbar" data-search-form="library"><input data-input="library-query" value="${e(this.librarySearch)}" placeholder="Название, номер или слова из текста" aria-label="Поиск по библиотеке"><button class="ll-primary" type="submit">Найти</button><label class="ll-checkbox"><input type="checkbox" data-input="library-content" ${this.libraryContent?'checked':''}> По содержанию</label></form><p class="ll-muted">${assessmentMode?'Выберите акт, затем откройте его и найдите правовое основание. Варианты ответов не предлагаются.':'Оглавление и поиск доступны для каждого установленного текста.'}</p><div class="ll-doc-grid">${entries.map(({document:d,hits})=>`<article class="ll-doc-card ${chosen.has(d.id)&&assessmentMode?'selected':''}"><div class="ll-doc-top"><span>${e(d.group)}</span><small>${d.coverage==='full'?'Полный текст':'Выдержки'}</small></div><h2>${e(d.shortTitle)}</h2><p>${e(d.title)}</p><strong>${e(d.number)}</strong><div class="ll-actions">${assessmentMode?`<button class="${chosen.has(d.id)?'ll-primary':'ll-secondary'}" data-action="choose-document" data-id="${d.id}" aria-pressed="${chosen.has(d.id)}" ${this.isLocked()?'disabled':''}>${chosen.has(d.id)?'✓ Выбран':'Выбрать акт'}</button><button class="ll-secondary" data-action="assessment-open-doc" data-id="${d.id}">Читать</button>`:`<button class="ll-primary" data-action="library-open" data-id="${d.id}">Открыть →</button>`}</div>${hits?.length?`<details><summary>Первые найденные фрагменты: ${hits.length}</summary>${hits.map(u=>`<button class="ll-hit" data-action="library-hit" data-doc="${d.id}" data-id="${u.id}" data-context="${assessmentMode?'assessment':'library'}">${e(u.locator)} · ${e(clip(u.text,100))}</button>`).join('')}</details>`:''}</article>`).join('')}</div>${!entries.length?'<div class="ll-empty">Документы не найдены. Попробуйте сократить запрос.</div>':''}</section>`;
  }
  async assessment(){
    if(!this.assessmentUnlocked())return '<section class="ll-assessment-intro"><h1>На оценку</h1><p>Ответьте на все задания квиза, чтобы открыть работу на оценку.</p><button class="ll-primary" data-action="view" data-view="learn">Квиз →</button></section>';
    const a=this.state.assessment,ready=assessmentReady(this.catalog).ready;
    if(!a)return fiveIntro(this);if(isFiveWork(a))return fiveAssessment(this);
    if(!a)return `<section class="ll-assessment-intro"><span class="ll-eyebrow">25 МИНУТ · ДО 5 БАЛЛОВ</span><h1>Самостоятельная работа</h1><p>После начала система случайно закрепит за вами одно из ${this.cases.length} досье. Назначение сохранится после перезагрузки. Ситуация и сканы отличаются от совместного занятия.</p><div class="ll-criteria-preview">${[['1','Реквизиты','Все реквизиты реального скана'],['1','Виды документов','Два новых автора и заголовка'],['1','Поиск документа','Нужный акт в общей библиотеке'],['2','Правовое основание','Достаточный фрагмент текста']].map(([p,h,t])=>`<div><strong>${p}</strong><h3>${h}</h3><p>${t}</p></div>`).join('')}</div>${!ready?`<div class="ll-alert ll-warning"><strong>Материалы временно недоступны</strong><p>Часть документов ещё не готова. Можно тренироваться; отправка досье на оценку откроется после проверки материалов.</p></div>`:''}<button class="ll-primary" data-action="start-assessment" ${this.isLocked()||(!ready&&!this.demo&&!this.teacher)?'disabled':''}>${ready&&!this.demo&&!this.teacher?'Получить досье':'Пройти тренировочное досье'} →</button></section>`;
    const item=this.cases.find(c=>c.id===a.caseId);if(!item)throw new Error('Назначенное досье не найдено');
    if(a.result){const docs=await loadReportDocuments(this.corpus,[...item.docIds,...a.answer.documentIds],id=>this.loadDocument(id));return this.report(item,a,docs);}
    const questions=dossierScanQuestions(item,a.answer,this.scans),fieldIndex=a.scanFieldIndex??this.assessmentField;this.assessmentField=Math.max(0,Math.min(Number.isInteger(fieldIndex)?fieldIndex:0,questions.length-1));
    const stage=a.stage||0;let body='';
    if(stage===0){body=this.scanAssignment(this.scans.find(s=>s.id===item.scanId),a.answer.metadata,{questions,index:this.assessmentField,context:'assessment'})+`<p class="ll-source-note">${e(item.sourceNote)}</p>`;}
    else if(stage===1){body=`<div class="ll-substeps">${item.classificationIds.map((id,i)=>`<button data-action="classification-index" data-index="${i}" class="${this.activeType===i?'active':''}">${a.answer.classifications?.[id]?'✓ ':''}Документ ${i+1}</button>`).join('')}</div>${this.typeView({},a.answer.classifications?.[item.classificationIds[this.activeType]],{action:'assessment-type',scanId:item.classificationIds[this.activeType]})}`;}
    else if(stage===2)body=await this.library(true);
    else if(stage===3){const ids=a.answer.documentIds||[];if(!ids.length)body='<div class="ll-empty">Сначала найдите и выберите документ на предыдущем этапе.</div>';else{this.assessmentDoc=ids.includes(this.assessmentDoc)?this.assessmentDoc:ids[0];const docs=await loadReportDocuments(this.corpus,ids,id=>this.loadDocument(id)),d=docs.find(x=>x.id===this.assessmentDoc);body=`<div class="ll-substeps">${docs.map(source=>`<button data-action="assessment-doc" data-id="${e(source.id)}" class="${source.id===d.id?'active':''}">${e(source.shortTitle||source.title)}</button>`).join('')}</div>${d.referenceOnly?`<section class="ll-empty"><p>Этот дополнительный материал удалён из занятия. Прежний выбор сохранён.</p><button class="ll-secondary" data-action="choose-document" data-id="${e(d.id)}">Убрать из ответа</button></section>`:this.reader(d,a.answer.selections||[],{context:'assessment',limit:selectionLimit(item,docs)})}`;}}
    else body=`<section class="ll-review"><h2>Проверьте собранное досье</h2><div class="ll-review-counts"><p>Области скана: <strong>${questions.filter(q=>a.answer.metadata?.[q.field]).length} / ${questions.length}</strong></p><p>Виды документов: <strong>${count(a.answer.classifications)} / ${item.classificationIds.length}</strong></p><p>Выбрано актов: <strong>${(a.answer.documentIds||[]).length}</strong></p><p>Выбрано фрагментов: <strong>${(a.answer.selections||[]).length}</strong></p></div><p>До отправки можно вернуться к любому этапу. После отправки эта попытка становится доступной только для просмотра. Полнота и точность будут проверены вместе.</p>${this.confirming?`<div class="ll-alert ll-warning"><strong>Завершить работу?</strong><p>Будут отправлены текущие ответы, включая незаполненные позиции.</p><div class="ll-actions"><button class="ll-primary" data-action="finish-assessment" ${this.submitting?'disabled':''}>${this.submitting?'Сохраняем…':'Да, завершить'}</button><button class="ll-secondary" data-action="cancel-finish">Вернуться к проверке</button></div></div>`:`<button class="ll-primary" data-action="confirm-finish" ${this.isLocked()?'disabled':''}>Завершить и проверить досье</button>`}</section>`;
    return `<header class="ll-assessment-heading"><div class="ll-eyebrow">ДОСЬЕ ${e(a.caseId)} · ${a.preview?'ТРЕНИРОВКА':'САМОСТОЯТЕЛЬНАЯ РАБОТА'}</div><h1>${e(item.title)}</h1><p>${e(item.prompt)}</p></header><nav class="ll-stage-nav" aria-label="Этапы досье">${['Реквизиты','Виды актов','Документ','Основание','Отправка'].map((v,i)=>`<button data-action="assessment-stage" data-index="${i}" class="${stage===i?'active':''}" aria-current="${stage===i?'step':'false'}"><span>${i+1}</span>${v}</button>`).join('')}</nav>${body}<div class="ll-stage-bottom"><button class="ll-secondary" data-action="assessment-prev" ${stage===0?'disabled':''}>← Предыдущий этап</button><span>${stage+1} / 5</span><button class="ll-primary" data-action="assessment-next" ${stage===4?'disabled':''}>Следующий этап →</button></div>`;
  }
  report(item,a,reportDocs=null){
    if(item?.format==='five-task-v1')return fiveReport(this,item,a);
    const docs=reportDocs||[...this.corpus.cache.values()],scan=this.scans.find(s=>s.id===item.scanId);
    const label=(scan,id)=>scan?.hotspots.find(h=>h.id===id)?.label||'Не выбрано';
    const original=value=>`<span data-original lang="ru">${e(value)}</span>`;
    const scanValue=(s,field)=>this.scanFieldValue(s,field),questions=dossierScanQuestions(item,a.answer,this.scans);
    const scanOriginal=s=>s?`<details class="ll-report-original"><summary>Открыть оригинал</summary><p>${original(s.author)}<br>${original(s.date+' · № '+s.number)}</p><a href="${asset(s.image)}" target="_blank" rel="noopener noreferrer"><img src="${asset(s.image)}" alt="Скан документа" loading="lazy"><span>Увеличить изображение</span></a></details>`:'';
    const selectedDocs=[...new Set(a.answer.documentIds||[])],rawSelections=[...new Set(a.answer.selections||[])],wholeArticles=a.answer.evidenceMode===EVIDENCE_MODE,selectedUnits=wholeArticles?canonicalArticleSelections(rawSelections,docs):rawSelections;
    const names=ids=>ids.length?`<ul>${ids.map(id=>{const d=docs.find(x=>x.id===id),info=d&&!d.referenceOnly?documentDisplay(this,d):null;return `<li>${d?.referenceOnly?`${original(d.title)} <span>Дополнительный материал удалён из занятия.</span>`:info?`<span data-document-text lang="${info.locale}">${e(info.view.title)}</span>`:'<span>Документ не найден</span>'}</li>`;}).join('')}</ul>`:'<p>Нет</p>';
    const textList=(ids,expected,reviewExpected=false)=>ids.length?ids.map(id=>{
      const d=docs.find(d=>d.units.some(u=>u.id===id)),info=d&&!d.referenceOnly?documentDisplay(this,d):null,u=info?.units.get(id);
      const matched=reviewExpected?selectedUnits.includes(id):expected.includes(id),status=matched?'Совпало':reviewExpected?'Пропущенный фрагмент':'Лишний фрагмент';
      if(d?.referenceOnly)return `<article class="ll-passage-review"><p class="ll-review-status">${status}</p><p>Дополнительный материал удалён из занятия.</p><p><span>Идентификатор прежнего фрагмента:</span> <code>${e(id)}</code></p></article>`;
      return `<article class="ll-passage-review"><p class="ll-review-status">${status}</p>${u?`<blockquote data-document-text lang="${info.locale}"><strong>${e(info.translation?info.view.title:d.shortTitle||d.title)} · ${e(displayLabel(this,d,id))}</strong><p>${e(u.text)}</p></blockquote>${!reviewExpected&&!selectedDocs.includes(d.id)?'<p class="ll-review-status">Документ этого фрагмента не выбран.</p>':''}`:'<p>Фрагмент не найден в материалах.</p>'}</article>`;
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
        const best=item.answerSets.map(set=>({ids:wholeArticles?canonicalArticleSelections(expandIds(set,docs),docs):expandIds(set,docs),grade:gradeEvidence(selectedUnits,[set],docs,{wholeArticles})})).reduce((best,next)=>!best||next.grade.fraction>best.grade.fraction||next.grade.fraction===best.grade.fraction&&next.grade.missing<best.grade.missing?next:best,null);
        const expected=best?.ids||[];
        review=`<div class="ll-review-columns"><section><h3>Ваш ответ</h3>${JSON.stringify(rawSelections)!==JSON.stringify(selectedUnits)?`<p><span>Ваш выбор в документе:</span> ${rawSelections.map(id=>{const d=docs.find(d=>d.units.some(u=>u.id===id));return d&&!d.referenceOnly?`<span data-document-text lang="${documentDisplay(this,d).locale}">${e(displayLabel(this,d,id))}</span>`:original(id);}).join(' · ')}</p>`:''}${textList(selectedUnits,expected)}</section><section><h3>Правильное основание</h3>${textList(expected,expected,true)}</section></div>`;
        reason=c.detail?.sourceOK===false?'Фрагменты относятся к документу, который вы не выбрали. За основание баллы не начислены.':c.points===c.max?'Все позиции совпадают. Баллы начислены полностью.':`Совпало: ${c.detail?.matched||0}; пропущено: ${c.detail?.missing||0}; лишних: ${c.detail?.extra||0}. Балл учитывает полноту и точность выделения.`;
      }
      return `<details class="ll-criterion-review" data-criterion="${e(c.id)}"><summary><span>${e(c.label)}</span><strong>${e(c.points)} / ${e(c.max)}</strong></summary><h3>Почему такой балл</h3><p>${e(reason)}</p>${c.id==='evidence'?`<p>${e(item.explanation)}</p>`:''}${review}</details>`;
    }).join('');
    return `<section class="ll-result"><div class="ll-eyebrow">ДОСЬЕ ${e(a.caseId)} · ${a.preview?'ТРЕНИРОВКА':'РАБОТА ЗАВЕРШЕНА'}</div><h1>Досье проверено</h1><div class="ll-result-score">${e(a.result.points)}<small> / 5</small></div><p>${a.preview?'Результат тренировочный и не отправляется в журнал.':a.delivery==='host-accepted'?'Результат сохранён. При подключении к сети журнал синхронизируется автоматически.':'Результат сохранён. Отправка в журнал ещё не подтверждена.'}</p><div class="ll-result-criteria">${a.result.criteria.map(c=>`<div><span>${e(c.label)}</span><meter min="0" max="${e(c.max)}" value="${e(c.points)}" aria-label="${e(c.label)}"></meter><strong>${e(c.points)} / ${e(c.max)}</strong></div>`).join('')}</div><div class="ll-answer-review">${breakdown}</div>${this.reportOnly?'':`<div class="ll-actions"><button class="ll-primary" data-action="export-report">Сохранить отчёт</button>${!a.preview&&a.delivery!=='host-accepted'?'<button class="ll-secondary" data-action="retry-delivery">Повторить передачу в журнал</button>':''}<button class="ll-secondary" data-action="home">К маршруту</button></div>`}</section>`;
  }
  help(){return `<section class="ll-help"><div class="ll-eyebrow">СПРАВКА</div><h1>Как работать с документами</h1><div class="ll-help-grid"><article><h2>Выбор фрагмента на скане</h2><p>Выберите название реквизита, затем его область на скане. Цвет кнопки совпадает с цветом выбранной рамки. Можно менять выбор в любом порядке. Кнопка с глазом показывает доступные области. С клавиатуры выбирайте область клавишами Tab и Enter.</p></article><article><h2>Ответ фрагментом</h2><p>Найдите положение с помощью оглавления или поиска. Нажмите на абзац. Для составного ответа отметьте несколько. Лишние фрагменты снижают точность ответа.</p></article><article><h2>Вид документа</h2><p>Ориентируйтесь на автора и содержание заголовка. Проверка относится к конкретному реальному акту. Распоряжения не ограничены вопросами о сотрудниках.</p></article><article><h2>Совместная работа</h2><p>Совместные отметки работают только при поиске абзацев в больших документах. Их видят участники на том же вопросе; при переходе или выходе отметки исчезают. Сканы, виды актов и досье выполняются индивидуально.</p></article></div><h2>Схемы из лекции</h2><p>Ниже сохранены авторские схемы. Они помогают ориентироваться в примерах; правовая форма каждого задания проверяется по его оригиналу.</p>${[36,48,58].map((n,i)=>`<details><summary>${['Федеральный уровень','Уровень субъекта','Муниципальный уровень'][i]} · слайд ${n}</summary><img src="${asset(`assets/help/lecture-${n}.webp`)}" alt="Схема из лекции, слайд ${n}" loading="lazy"></details>`).join('')}<details><summary>Источники и авторство</summary><p data-original lang="ru">${e(this.catalog.sources.lecture)}</p><p data-original lang="ru">${e(this.catalog.sources.tickets)}</p></details><button class="ll-secondary" data-action="export-state">Экспортировать локальную работу</button></section>`;}
  input(ev){const el=ev.target;if(!el.dataset.input)return;switch(el.dataset.input){case'task-picker':if(ev.type!=='change')break;this.action('go-task',{dataset:{index:el.value}}).catch(err=>this.fail(err));break;case'library-query':this.librarySearch=el.value;break;case'library-content':this.libraryContent=el.checked;break;case'reader-query':{const id=el.closest('[data-reader-doc]')?.dataset.readerDoc;if(id){this.state.reader[id]||={};const doc=this.corpus.cache.get(id);if(doc)setReaderQuery(this,doc,el.value);}break;}}}
  async runSearch(which){if(which==='reader'){const reader=this.root.querySelector('[data-reader-doc]'),d=this.corpus.cache.get(reader?.dataset.readerDoc);if(!d)return;this.state.reader[d.id]||={};this.state.reader[d.id].searchOpen=true;await this.persist();refreshReaderSearch(this,d);return;}if(which==='library')this.libraryHits=await this.corpus.search(this.librarySearch,{content:this.libraryContent,signal:this.signal});await this.persist();return this.render();}
  async action(action,b){
    if(!this.active())return;
    if(action==='noop')return;
    if(action==='restart-assessment')return this.restartAssessment();
    if(isFiveWork(this.state.assessment)&&['five-task','five-submit','five-next','metadata-field','assessment-hotspot','assessment-type','select-unit','remove-unit'].includes(action))return this.fiveAction(action,b);
    if(action==='archive-preview'){if(!this.incompatible||!this.lease?.acquired||!(this.demo||this.incompatible.assessment?.preview))return;await this.store.put('archive:'+Date.now(),this.incompatible);this.state=freshState(this.catalog.contentVersion);this.incompatible=null;this.readOnly=false;this.view='home';this.notice='Предыдущая демонстрационная работа сохранена в локальном архиве.';await this.persist();return this.render();}
    if(action==='dismiss'){this.notice='';return this.render();}
    if(action==='exit'){this.live?.watchTask(null);this.presenceTask=null;await this.persist();return this.opt.onExit?.();}
    if(action==='home'||action==='view'){const target=action==='home'?'home':b.dataset.view;if(!['home','learn','assessment','help'].includes(target)||target==='assessment'&&!this.assessmentUnlocked())return;this.view=target;this.extraTask=null;this.syncPresenceTask();await this.persist();return this.render();}
    if(action==='toggle-scan-hints'){this.setScanHints(!this.scanHints);return;}
    if(action==='zoom-in'||action==='zoom-out'){this.setScanZoom(this.scanZoom+(action==='zoom-in'?0.5:-0.5));return;}
    if(action==='go-task'||action==='prev-task'||action==='next-task'){
      this.extraTask=null;this.view='learn';const step=action==='next-task'?1:-1;
      this.state.index=action==='go-task'?Number(b.dataset.index):Math.max(0,Math.min(this.bank.classroom.length-1,this.state.index+step));
      this.syncPresenceTask();await this.persist();return this.render();
    }
    if(action==='extra')return;
    if(action==='scan-field'||action==='scan-prev-field'||action==='scan-next-field'){
      const assessment=b.dataset.context==='assessment';if(assessment&&this.state.assessment?.result)return;
      const t=this.selectedTask();if(!assessment&&t.kind!=='scan')return;
      const a=assessment?this.state.assessment:null,item=assessment?this.cases.find(c=>c.id===a.caseId):null,questions=assessment?dossierScanQuestions(item,a.answer,this.scans):scanQuestionsFor(this.scans.find(s=>s.id===t.scanId));
      const current=assessment?this.assessmentField:this.scanFieldIndex(t,questions),next=action==='scan-field'?Number(b.dataset.index):current+(action==='scan-next-field'?1:-1),index=Math.max(0,Math.min(next,questions.length-1));if(!Number.isInteger(index)||index===current)return;
      if(assessment){this.assessmentField=index;a.scanFieldIndex=index;}else{this.state.scanFields||={};this.state.scanFields[t.id]=index;this.state.answers[t.id]=this.answer(t);}
      this.setScanHints(false);await this.persist();return this.render();
    }
    if(action==='hotspot'||action==='type-choice'||action==='history-edition'){
      if(this.isLocked())return;const t=this.selectedTask(),a=this.answer(t);a.submitted=false;
      if(action==='hotspot'){if(t.kind!=='scan')return;const scan=this.scans.find(s=>s.id===t.scanId),questions=scanQuestionsFor(scan);if(!scan.hotspots.some(h=>h.id===b.dataset.id))return;a.metadata[questions[this.scanFieldIndex(t,questions)].field]=b.dataset.id;this.setScanHints(false);}if(action==='type-choice')a.type=b.dataset.value;if(action==='history-edition'){a.docId=b.dataset.id;a.selections=[];this.teacherReading=null;this.teacherTarget=null;}
      this.state.answers[t.id]=a;await this.persist();return this.render();
    }
    if(action==='submit-task'){
      if(this.isLocked())return;const t=this.selectedTask(),a=this.answer(t);if(t.kind!=='scan'&&!a.type&&!(a.selections||[]).length){this.notice='Сначала выберите область, вид документа или фрагмент.';return this.render();}
      a.submitted=true;this.state.answers[t.id]=a;await this.persist();void this.completePractice();
      if(['text','history'].includes(t.kind)&&this.root.querySelector('.ll-reader')){this.refreshReaderSelection('learning',{review:true});return;}
      return this.render();
    }
    if(action==='teacher-jump-unit'){
      if(!this.teacherAccess()||this.view!=='learn')return;const t=this.selectedTask(),d=await this.corpus.load(t.docId);if(!this.teacherAccess()||this.selectedTask().id!==t.id)return;
      const allowed=new Set((t.answerSets||[]).flatMap(set=>expandIds(set,[d])));if(b.dataset.doc!==d.id||!allowed.has(b.dataset.id))return;
      this.teacherTarget={taskId:t.id,unitId:b.dataset.id};
      if(!this.scrollReaderUnit(d.id,b.dataset.id,{teacher:true})){this.teacherReading={taskId:t.id,docId:d.id};await this.render();this.scrollReaderUnit(d.id,b.dataset.id,{teacher:true});}return;
    }
    if(action==='search-page'){const d=this.corpus.cache.get(b.dataset.doc);if(!d)return;this.state.reader[d.id]||={};Object.assign(this.state.reader[d.id],{searchPage:Math.max(0,Number(b.dataset.page)||0),searchOpen:true});await this.persist();refreshReaderSearch(this,d);return;}
    if(action==='toggle-document-original'){
      const id=b.closest('[data-reader-doc]')?.dataset.readerDoc;if(!id)return;this.state.reader[id]||={};this.state.reader[id].original=!this.state.reader[id].original;await this.persist();return this.render();
    }
    if(action==='section'){
      const d=await this.corpus.load(b.dataset.doc),section=d.sections.find(s=>s.id===b.dataset.id);if(!section)return;
      this.state.reader[d.id]||={};Object.assign(this.state.reader[d.id],{sectionId:section.id,tocOpen:false});
      const reader=b.closest('[data-reader-doc]');reader?.querySelector('.ll-reader-grid')?.classList.remove('toc-open');reader?.querySelector('[data-action="toggle-toc"]')?.setAttribute('aria-expanded','false');
      reader?.querySelectorAll('[data-action="section"]').forEach(el=>el.classList.toggle('active',el.dataset.id===section.id));prepareReaderLayout(this);this.scrollReaderUnit(d.id,section.unitIds[0]);await this.persist();return;
    }
    if(['toggle-reader-search','toggle-toc','clear-search'].includes(action)){
      const reader=b.closest('[data-reader-doc]'),id=reader?.dataset.readerDoc,d=this.corpus.cache.get(id);if(!d)return;this.state.reader[id]||={};const rs=this.state.reader[id];
      if(action==='toggle-toc'){rs.tocOpen=!rs.tocOpen;rs.searchOpen=false;reader.querySelector('.ll-reader-grid')?.classList.toggle('toc-open',rs.tocOpen);b.setAttribute('aria-expanded',String(rs.tocOpen));}
      else if(action==='clear-search'){setReaderQuery(this,d,'');rs.searchOpen=false;rs.searchPage=0;}
      else{rs.searchOpen=!rs.searchOpen;rs.tocOpen=false;reader.querySelector('.ll-reader-grid')?.classList.remove('toc-open');reader.querySelector('[data-action="toggle-toc"]')?.setAttribute('aria-expanded','false');}
      refreshReaderSearch(this,d);prepareReaderLayout(this);if(rs.searchOpen){const paper=reader.querySelector('.ll-paper'),dock=reader.querySelector('.ll-reader-dock'),top=paper.getBoundingClientRect().top,bottom=dock.getBoundingClientRect().bottom;if(top<bottom||top>innerHeight-120)window.scrollBy({top:top-bottom-8,behavior:'instant'});reader.querySelector('[data-input="reader-query"]')?.focus({preventScroll:true});}return;
    }
    if(action==='jump-unit'||action==='library-hit'){
      const d=await this.corpus.load(b.dataset.doc),u=d.units.find(u=>u.id===b.dataset.id);if(!u)return;
      this.state.reader[d.id]||={};this.state.reader[d.id].sectionId=u.sectionId;
      if(action==='jump-unit'){this.state.reader[d.id].searchOpen=false;this.state.reader[d.id].tocOpen=false;const reader=b.closest('[data-reader-doc]');reader?.querySelector('.ll-reader-grid')?.classList.remove('toc-open');reader?.querySelector('[data-action="toggle-toc"]')?.setAttribute('aria-expanded','false');refreshReaderSearch(this,d);if(this.scrollReaderUnit(d.id,u.id)){await this.persist();return;}}
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
    if(action==='metadata-field'){const a=this.state.assessment;if(!a||a.result)return;const item=this.cases.find(c=>c.id===a.caseId),questions=dossierScanQuestions(item,a.answer,this.scans),index=Number(b.dataset.index);if(!Number.isInteger(index)||index<0||index>=questions.length||index===(a.scanFieldIndex??this.assessmentField))return;this.assessmentField=index;a.scanFieldIndex=index;this.setScanHints(false);await this.persist();return this.render();}
    if(action==='classification-index'){this.activeType=Number(b.dataset.index);return this.render();}
    if(action==='assessment-hotspot'||action==='assessment-type'){
      if(this.isLocked()||this.state.assessment?.result)return;const a=this.state.assessment,item=this.cases.find(c=>c.id===a.caseId);
      if(action==='assessment-hotspot'){const scan=this.scans.find(s=>s.id===item.scanId),questions=dossierScanQuestions(item,a.answer,this.scans);if(!scan.hotspots.some(h=>h.id===b.dataset.id)||!questions[this.assessmentField])return;a.answer.metadata[questions[this.assessmentField].field]=b.dataset.id;this.setScanHints(false);}else a.answer.classifications[b.dataset.scan]=b.dataset.value;
      await this.persist();return this.render();
    }
    if(action==='choose-document'){
      if(this.isLocked()||this.state.assessment?.result)return;const a=this.state.assessment.answer,id=b.dataset.id;
      if(a.documentIds.includes(id)){const [d]=await loadReportDocuments(this.corpus,[id]);a.documentIds=a.documentIds.filter(x=>x!==id);const remove=new Set(d.units.map(u=>u.id));a.selections=a.selections.filter(x=>!remove.has(x));}else this.addDocument(id);
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
  localizeFive(){
    const sets=new Map(this.fiveSource.questionSets.map(s=>[s.docId,s.tasks]));
    this.fiveVariants=this.fiveSource.variants.map(v=>({id:v.id,format:FIVE_MODE,tasks:[{id:v.id+'-S',kind:'scan',scanId:v.scanId,prompt:translate('Найдите реквизиты документа',this.locale)},{id:v.id+'-T',kind:'type',scanId:v.typeScanId,answer:this.scans.find(s=>s.id===v.typeScanId).actType,prompt:translate('Определите вид документа',this.locale)},...sets.get(v.questionSet).map((t,i)=>({...t,...t.i18n?.[this.locale],id:v.id+'-Q'+(i+1)}))]}));
  }
  fiveTask(){return fiveTask(this);}
  fiveAnswer(t){return fiveAnswer(this,t);}
  async fiveAction(action,b){
    const a=this.state.assessment;if(!isFiveWork(a)||a.result||this.isLocked())return;const item=fiveVariant(this),t=fiveTask(this),answer=fiveAnswer(this,t);
    if(action==='five-task'||action==='five-next'){const index=action==='five-next'?Math.min(4,a.stage+1):Number(b.dataset.index);if(!Number.isInteger(index)||index<0||index>4)return;a.stage=index;await this.persist();return this.render();}
    if(action==='metadata-field'){if(t.kind!=='scan')return;const fields=scanQuestionsFor(this.scans.find(s=>s.id===t.scanId)),index=Number(b.dataset.index);if(!fields[index]||index===(a.scanFieldIndex||0))return;a.scanFieldIndex=index;await this.persist();return this.render();}
    if(action==='assessment-hotspot'){if(t.kind!=='scan')return;const scan=this.scans.find(s=>s.id===t.scanId),fields=scanQuestionsFor(scan);if(!scan.hotspots.some(h=>h.id===b.dataset.id))return;answer.metadata[fields[a.scanFieldIndex||0].field]=b.dataset.id;this.setScanHints(false);}
    else if(action==='assessment-type'){if(t.kind!=='type'||!ACT_TYPES.includes(b.dataset.value))return;answer.type=b.dataset.value;}
    else if(action==='select-unit'||action==='remove-unit'){if(t.kind!=='text')return;const id=b.dataset.unit||b.dataset.id,d=this.corpus.cache.get(t.docId);if(!d?.units.some(u=>u.id===id))return;const list=answer.selections||[],has=list.includes(id);if(!has&&list.length>=selectionLimit(t,[d]))return;answer.selections=has?list.filter(x=>x!==id):[...list,id];}
    else if(action==='five-submit'){answer.submitted=true;}
    if(action!=='five-submit')answer.submitted=false;a.answer.tasks[t.id]=answer;await this.persist();
    if(t.kind==='text'){this.refreshReaderSelection('assessment-five');for(const button of this.root.querySelectorAll('.ll-five-nav [data-index]')){const index=Number(button.dataset.index);button.textContent=String(index+1)+(a.answer.tasks[item.tasks[index]?.id]?.submitted?' ✔':'');}if(item.tasks.every(q=>a.answer.tasks[q.id]?.submitted))return this.render();return;}return this.render();
  }
  async restartAssessment(){
    if(this.isLocked()||!this.assessmentUnlocked())return;const a=this.state.assessment;if(a?.result&&!a.preview&&a.delivery!=='host-accepted'){this.notice='Сначала отправьте сохранённый результат в журнал.';return this.render();}
    if(a){this.state.assessmentHistory||=[];this.state.assessmentHistory.push(structuredClone(a));this.state.assessment=null;}return this.startAssessment();
  }
  async startAssessment(){
    if(this.isLocked()||!this.assessmentUnlocked())return;if(this.state.assessment){this.view='assessment';return this.render();}
    const ready=assessmentReady(this.catalog).ready;if(!ready&&!this.demo&&!this.teacher)throw Error('Полный корпус не установлен и не проверен');
    if(this.opt.assessmentAllowed&&!this.opt.assessmentAllowed()&&!this.teacher)throw Error('Самостоятельная работа ещё не открыта');
    const previous=(this.state.assessmentHistory||[]).map(a=>a.caseId),seed=this.opt.assignmentSeed,pick=Number.isSafeInteger(seed)&&seed>=0?(length=>seed%length):undefined,item=chooseFiveVariant(this.fiveVariants,previous,pick,seed);
    this.state.assessment={format:FIVE_MODE,caseId:item.id,attemptId:(this.opt.attemptId||this.state.id)+'-r-'+uid(),startedAt:Date.now(),contentVersion:this.catalog.contentVersion,preview:this.demo||this.teacher||!ready,stage:0,phase:'active',answer:{assessmentMode:FIVE_MODE,tasks:{}},result:null,delivery:'not-submitted'};
    this.view='assessment';this.syncPresenceTask();await this.persist();return this.render();
  }
  async finishAssessment(){
    if(this.isLocked()||this.submitting||this.state.assessment?.result)return;this.submitting=true;
    try{const a=this.state.assessment,item=isFiveWork(a)?fiveVariant(this):this.cases.find(c=>c.id===a.caseId);const ids=isFiveWork(a)?[...new Set(item.tasks.filter(t=>t.kind==='text').map(t=>t.docId))]:[...new Set([...item.docIds,...a.answer.documentIds])];const docs=isFiveWork(a)?await Promise.all(ids.map(id=>this.corpus.load(id))):await loadReportDocuments(this.corpus,ids);if(!this.active())return;
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
  async setLocale(lang){if(normalizeLocale(lang)===this.locale)return;const extraId=this.extraTask?.id;this.locale=normalizeLocale(lang);this.root.lang=this.locale==='zh'?'zh-Hans':this.locale;Object.assign(this,localizeContent(this.corpus.bank,this.corpus.cases,this.locale));this.extraTask=extraId?this.bank.extra.find(t=>t.id===extraId):null;this.localizeFive();return this.render();}
  async destroy(){if(this.closed||this.disposing)return this.queue;this.disposing=true;this.leaveLive();clearInterval(this.tick);await this.persist().catch(()=>{});this.closed=true;this.controller.abort();this.lease?.release();this.store?.close();this.opt.signal?.removeEventListener('abort',this.abortParent);this.readerLayoutObserver?.disconnect();this.root.removeEventListener('pointerdown',this.readerPointerHandler);this.root.removeEventListener('scroll',this.readerScrollHandler,true);this.root.removeEventListener('contextmenu',this.typeContextHandler);this.root.removeEventListener('click',this.clickHandler);this.root.removeEventListener('input',this.inputHandler);this.root.removeEventListener('change',this.inputHandler);this.root.removeEventListener('submit',this.submitHandler);window.removeEventListener('rudn:identitychange',this.identityHandler);window.removeEventListener('beforeunload',this.beforeUnload);this.root.classList.remove('legal-lab');}
}

export async function mountLegalLabReport(container,{attempt,locale='ru',signal}={}){
  if(!(container instanceof HTMLElement))throw new TypeError('A mount HTMLElement is required');
  applyStyle();const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  container.classList.add('legal-lab');container.innerHTML='<div class="ll-loading" role="status">Открываем рабочее место…</div>';translateDOM(container,locale);
  let app;
  const render=async lang=>{
    app.locale=normalizeLocale(lang);Object.assign(app,localizeContent(app.corpus.bank,app.corpus.cases,app.locale));app.localizeFive();
    const item=[...app.cases,...app.fiveVariants].find(c=>c.id===attempt?.caseId);
    if(!item||attempt?.contentVersion!==app.catalog.contentVersion||!Array.isArray(attempt?.legalLab?.criteria)||!attempt?.legalLab)throw new Error('Report data unavailable');
    const answer=parseDossierAnswer(attempt.legalLab);
    if(item.format!==FIVE_MODE&&(!Array.isArray(answer.documentIds)||answer.documentIds.length>3||!Array.isArray(answer.selections)||answer.selections.length>500))throw new Error('Invalid report answer');
    const docIds=item.format===FIVE_MODE?item.tasks.filter(t=>t.kind==='text').map(t=>t.docId):[...item.docIds,...answer.documentIds];const reportDocs=item.format===FIVE_MODE?await Promise.all([...new Set(docIds)].map(id=>app.loadDocument(id))):await loadReportDocuments(app.corpus,docIds,id=>app.loadDocument(id));
    if(controller.signal.aborted)return;
    // Stored reports are untrusted student input. Recompute rubric fields from
    // the fixed case and verified documents instead of rendering stored markup.
    if(typeof attempt.points!=='number'||!Number.isFinite(attempt.points)||attempt.points<0||attempt.points>5)throw new Error('Invalid report score');
    const result=scoreDossier(item,answer,app.scans,reportDocs);
    if(Math.abs(result.points-attempt.points)>0.001)throw new Error('Report score does not match its answers');
    container.innerHTML=app.report(item,{caseId:item.id,preview:false,delivery:'host-accepted',answer,result},reportDocs);translateDOM(container,lang);app.prepareScanCrops(container);
  };
  try{
    const corpus=await new Corpus(BASE,{signal:controller.signal}).initialize();
    app=Object.create(LegalLab.prototype);Object.assign(app,{corpus,catalog:corpus.catalog,scans:corpus.scans,reportOnly:true,signal:controller.signal,state:{reader:{}},translations:new DocumentTranslations(BASE,{catalog:corpus.catalog,signal:controller.signal})});app.fiveSource=await corpus.json('data/assessment-variants.json');await render(locale);
  }catch(err){if(err.name!=='AbortError'){console.warn('Legal Lab report unavailable',err);container.innerHTML='<div class="ll-alert ll-warning" role="alert">Не удалось открыть материалы. Проверьте соединение и повторите загрузку.</div>';translateDOM(container,locale);}}
  return {setLocale:lang=>app?render(lang):Promise.resolve(),destroy(){controller.abort();signal?.removeEventListener('abort',abort);container.classList.remove('legal-lab');container.replaceChildren();}};
}
