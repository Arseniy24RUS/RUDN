import {escapeHTML as e,expandIds,gradeTask} from './core.mjs';
import {translate,translateDOM} from '../locales/ui.mjs';
import {documentTaskGroups} from './reader-tools.mjs';
import {documentDisplay,documentLocale,displayLabel,readerQuery} from './translation-ui.mjs';
import {ReaderController} from './reader-controller.mjs';
const BASE=new URL('../',import.meta.url);
const asset=path=>new URL(path,BASE).href;
const SEARCH='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
const CONTENTS='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h14M7 12h14M7 19h14M2 5h1M2 12h1M2 19h1"/></svg>';
const clip=(value,n=120)=>String(value).length>n?String(value).slice(0,n-1)+'…':String(value);
const label=(app,key)=>translate(key,app.locale);
const icon=(action,svg,title,extra='')=>`<button type="button" class="ll-secondary ll-reader-icon" data-action="${action}" aria-label="${e(title)}" title="${e(title)}" ${extra}>${svg}</button>`;
function searchState(app,d){const rs=app.state.reader[d.id]||{},query=readerQuery(app,d),controller=app.readerController,result=controller?.descriptor.docId===d.id&&controller.searchResult?.query===query?controller.searchResult:null;return {rs,query,hits:result?.hits||[],total:result?.total||0,page:result?.page||0,pageHits:result?.hits||[],pending:Boolean(controller?.searchPending),searched:Boolean(result)};}
function highlighter(query){const words=[...new Set(query.trim().split(/\s+/).filter(word=>word.length>=(/\p{Script=Han}/u.test(word)?1:3)))].sort((a,b)=>b.length-a.length),pattern=words.length?new RegExp('('+words.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[её]/gi,'[её]')).join('|')+')','giu'):null;return value=>{let marks=0;return pattern?String(value).split(pattern).map((part,i)=>i%2&&marks++<40?`<mark>${e(part)}</mark>`:e(part)).join(''):e(value);};}
export function lessonNavigation(app,t,disabled=false){
  const groups=documentTaskGroups(app.bank,app.catalog),sections=[{title:'Реквизиты',items:app.bank.classroom.map((task,index)=>({task,index})).filter(x=>x.task.kind==='scan')},{title:'Виды актов',items:app.bank.classroom.map((task,index)=>({task,index})).filter(x=>x.task.kind==='type')},{title:'Документы',items:groups.map(group=>({task:group.tasks[0].task,index:group.tasks[0].index,group}))}];
  const active=item=>!app.extraTask&&(item.group?t.kind==='text'&&t.docId===item.group.docId:t.id===item.task.id);
  const title=item=>item.group?label(app,item.group.title):app.taskLabel(item.task);
  const checked=item=>item.group?item.group.tasks.every(x=>app.answer(x.task).submitted):app.answer(item.task).submitted;
  return `<label class="ll-mobile-task-picker">Задание<select data-input="task-picker" ${disabled?'disabled':''}>${sections.map(section=>`<optgroup label="${e(label(app,section.title))}">${section.items.map(item=>`<option value="${item.index}" ${active(item)?'selected':''}>${checked(item)?'✔ ':''}${e(clip(title(item),100))}</option>`).join('')}</optgroup>`).join('')}</select></label><div class="ll-lesson-grid"><aside class="ll-task-list"><div class="ll-task-scroll">${sections.map(section=>`<h2 class="ll-task-group-title">${e(label(app,section.title))}</h2>${section.items.map(item=>`<button data-action="go-task" data-index="${item.index}" ${item.group?`data-doc-group="${e(item.group.docId)}"`:''} ${disabled?'disabled':''} class="${active(item)?'active':''}"><span>${checked(item)?'✔':'·'}</span><span>${e(clip(title(item),90))}</span></button>`).join('')}`).join('')}</div></aside><section class="ll-task-work">`;
}
export function readerSearchPanel(app,d){
  const {rs,query,total,page,pageHits,pending,searched}=searchState(app,d),hits={length:total},info=documentDisplay(app,d);
  return `<section class="ll-reader-search-panel" data-reader-search-panel ${rs.searchOpen?'':'hidden'} role="search" aria-label="Поиск в документе"><form class="ll-searchbar" data-search-form="reader"><input data-input="reader-query" value="${e(query)}" placeholder="Поиск по словам в документе" aria-label="Поиск в документе" autocomplete="off"><button type="submit" class="ll-primary ll-reader-icon" aria-label="Найти">${SEARCH}</button>${icon('clear-search','×','Закрыть поиск')}</form>${query&&(pending||searched)?`<div class="ll-search-results" aria-busy="${pending}"><strong>${pending?'…':hits.length?'Найдено фрагментов: '+hits.length:'Совпадений нет. Попробуйте другое слово.'}</strong>${pageHits.map(u=>`<button data-action="jump-unit" data-id="${e(u.id)}" data-doc="${e(d.id)}"><b data-document-text lang="${info.locale}">${e(u.label||info.descriptor?.labels[u.id]||u.locator)}</b><span data-document-text lang="${info.locale}">${e(clip(u.text,180))}</span></button>`).join('')}${hits.length>20?`<div class="ll-search-pages"><button type="button" class="ll-secondary" data-action="search-page" data-doc="${e(d.id)}" data-page="${page-1}" ${page===0?'disabled':''}>← Назад</button><span>${page+1} / ${Math.ceil(hits.length/20)}</span><button type="button" class="ll-secondary" data-action="search-page" data-doc="${e(d.id)}" data-page="${page+1}" ${(page+1)*20>=hits.length?'disabled':''}>Далее →</button></div>`:''}</div>`:''}</section>`;
}
export function selectionTrayView(app,selected,context,limit,docId,readonly=false){
  const graded=context==='assessment-five',t=context==='learning'?app.selectedTask():graded?app.fiveTask():null,a=t?(graded?app.fiveAnswer(t):app.answer(t)):null,grade=!graded&&a?.submitted?gradeTask(t,a,[...app.corpus.cache.values()],app.scans):null,rs=app.state.reader[docId]||{},group=!graded&&t?.kind==='text'&&!app.extraTask?documentTaskGroups(app.bank,app.catalog).find(g=>g.docId===docId):null;
  const next=graded?a?.submitted&&app.state.assessment.stage<4:t&&grade?.exact&&!app.extraTask&&app.state.index<app.bank.classroom.length-1;
  const chips=selected.slice(0,30).map(id=>{let d,u;for(const doc of app.corpus.cache.values()){u=app.unitIndexes.get(doc)?.get(id)||doc.units.find(x=>x.id===id);if(u){d=doc;break;}}return `<button type="button" data-action="remove-unit" data-id="${e(id)}" data-context="${context}"><span data-document-text lang="${d?documentDisplay(app,d).locale:'ru'}">${e(d?displayLabel(app,d,id)||u.locator:id)}</span> ×</button>`;}).join('');
  return `<div class="ll-selection-tray" data-selection-context="${context}" data-reader-controls="${e(docId)}">${group?`<nav class="ll-doc-questions" aria-label="Вопросы документа">${group.tasks.map(({task,index},i)=>`<button type="button" data-action="go-task" data-index="${index}" data-reader-question="${e(task.id)}" aria-label="${e(label(app,'Вопрос')+' '+(i+1)+': '+task.prompt)}" aria-pressed="${task.id===t.id}" class="${task.id===t.id?'active':''}">${i+1}${app.answer(task).submitted?' ✔':''}</button>`).join('')}</nav>`:''}${t?`<p class="ll-reader-question">${e(t.prompt)}</p>`:''}<div class="ll-reader-tools">${icon('toggle-toc',CONTENTS,'Оглавление',`aria-expanded="${Boolean(rs.tocOpen)}"`)}${icon('toggle-reader-search',SEARCH,'Поиск в документе',`aria-expanded="${Boolean(rs.searchOpen)}"`)}${!readonly?`<button type="button" class="ll-primary ll-reader-icon" data-action="${graded?'five-submit':context==='learning'?'submit-task':'assessment-next'}" aria-label="${graded?'Сохранить ответ':context==='learning'?'Проверить ответ':'Следующий этап'}" title="${graded?'Сохранить ответ':context==='learning'?'Проверить ответ':'Следующий этап'}" ${app.isLocked()?'disabled':''}>✔</button>`:''}${next?`<button type="button" class="ll-primary ll-reader-next" data-action="${graded?'five-next':'next-task'}">Далее →</button>`:''}${!graded&&t?.kind==='text'&&!app.extraTask?'<span class="ll-reader-presence" data-presence-status role="status"></span>':''}</div><div class="ll-reader-selection-row">${chips?`<div class="ll-selected-passages">${chips}</div>`:''}${graded&&a?.submitted?'<span class="ll-answer-saved" role="status">Ответ сохранён</span>':''}${grade?`<details class="ll-reader-feedback ll-feedback ${grade.exact?'success':'attention'}"><summary>${grade.exact?'Верно':grade.fraction>0?'Основание найдено частично':'Проверьте выбор'}</summary><p>${e(t.explanation)}</p>${grade.extra?'<p>Уберите лишние фрагменты.</p>':''}${grade.missing?'<p>Выделение пока неполное.</p>':''}</details>`:''}</div></div>`;
}

export function readerToc(app,d){
  const descriptor=app.corpus.peekReaderDocument(d.id,documentDisplay(app,d).locale),rs=app.state.reader[d.id]||{};
  return (descriptor?.sections||d.sections).map(section=>'<button data-action="section" data-id="'+e(section.id)+'" data-doc="'+e(d.id)+'" class="'+(section.id===rs.sectionId?'active':'')+'" data-document-text lang="'+(descriptor?.locale||'ru')+'">'+e(section.title)+'</button>').join('');
}
export function refreshReaderToc(app,d){
  const reader=app.root.querySelector('[data-reader-doc="'+CSS.escape(d.id)+'"]'),nav=reader?.querySelector('.ll-toc');
  if(nav)nav.innerHTML=app.state.reader[d.id]?.tocOpen?readerToc(app,d):'';
}
export function readerView(app,d,selected=[],{context='learning',counts={},review=false,correctIds=[],limit=5,readonly=false,scope}={}){
  scope?.assert();
  const locale=documentLocale(app,d.id),descriptor=app.corpus.peekReaderDocument(d.id,locale),view={title:descriptor?.title||d.title,revisionLabel:descriptor?.revisionLabel||d.revisionLabel};
  if(!descriptor)throw Error('Reader descriptor unavailable');
  const rs=app.state.reader[d.id]||{};
  const spec={doc:d,descriptor,context,readonly,selected,review,correctIds},sectionIndex=new Map(descriptor.sections.map(section=>[section.id,section])),unitMeta=new Map(descriptor.units.map(unit=>[unit.id,unit]));
  spec.renderBlock=block=>{
    const chosen=new Set(spec.selected),correct=new Set(spec.correctIds),{query,pageHits}=searchState(app,d),marked=new Set(pageHits.map(u=>u.id)),text=highlighter(query);
    let sectionId=null;
    return block.units.map(u=>{
      const section=sectionIndex.get(u.sectionId),meta=unitMeta.get(u.id),heading=Boolean(meta?.heading),title=sectionId!==u.sectionId&&section?.unitIds[0]===u.id&&!heading?'<h3 data-document-text lang="'+locale+'">'+e(section.title)+'</h3>':'';
      sectionId=u.sectionId;
      return title+'<section class="ll-reader-section" data-reader-section="'+e(u.sectionId)+'" data-reader-materialized="true"><button type="button" class="ll-paragraph '+(heading?'ll-paragraph-heading ':'')+(chosen.has(u.id)?'selected ':'')+(spec.review&&correct.has(u.id)?'correct ':'')+'" data-action="'+(spec.readonly?'noop':'select-unit')+'" data-unit="'+e(u.id)+'" data-doc="'+e(d.id)+'" data-context="'+context+'" aria-pressed="'+chosen.has(u.id)+'" '+(!spec.readonly&&app.isLocked()?'disabled':'')+'><span class="ll-paragraph-locator"><span class="ll-sr" data-document-text lang="'+locale+'">'+e(u.label||descriptor.labels[u.id]||u.locator)+'</span></span>'+(u.context?'<small class="ll-unit-context" data-document-text lang="'+locale+'">'+e(u.context)+'</small>':'')+'<span class="ll-paragraph-text" data-document-text lang="'+locale+'">'+(marked.has(u.id)?text(u.text):e(u.text))+'</span><span class="ll-check" aria-hidden="true">'+(chosen.has(u.id)?'✓':'')+'</span></button>'+(u.imageUrl?'<figure class="ll-source-figure"><a href="'+asset('data/'+u.imageUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="Увеличить изображение"><img src="'+asset('data/'+u.imageUrl)+'" alt="'+e(u.locator)+'" loading="lazy" data-document-text lang="'+locale+'"></a><figcaption>Увеличить изображение</figcaption></figure>':'')+'</section>';
    }).join('');
  };
  spec.afterRender=()=>app.applyPresence();
  scope?.assert();app.readerSpec=spec;
  let source='';try{const url=new URL(d.sourceUrl);if(['https:','http:'].includes(url.protocol))source='<a href="'+e(url.href)+'" target="_blank" rel="noopener noreferrer">Источник ↗</a>';}catch{}
  return '<section class="ll-reader" data-reader-doc="'+e(d.id)+'" data-reader-locale="'+locale+'" data-reader-context="'+context+'"><header class="ll-reader-header"><div data-document-text lang="'+locale+'"><span class="ll-eyebrow">'+e(d.number)+'</span><h2>'+e(view.title)+'</h2><span class="ll-revision">'+e(view.revisionLabel)+'</span></div><div class="ll-document-language"><small>'+(locale!=='ru'?'Учебный перевод':'Русский оригинал')+'</small>'+(app.locale!=='ru'?'<button type="button" class="ll-secondary" data-action="toggle-document-original">'+(rs.original?'Показать перевод':'Русский оригинал')+'</button>':'')+source+'</div></header>'+(d.coverage!=='full'?'<div class="ll-text-warning">Материалы временно недоступны</div>':'')+'<div class="ll-reader-dock">'+selectionTrayView(app,selected,context,limit,d.id,readonly)+'</div><div class="ll-reader-surface">'+readerSearchPanel(app,d)+'<div class="ll-reader-grid '+(rs.tocOpen?'toc-open':'')+'"><nav class="ll-toc" aria-label="Оглавление документа">'+(rs.tocOpen?readerToc(app,d):'')+'</nav><article class="ll-paper" tabindex="0" aria-label="Текст документа"></article></div></div></section>';
}
export function refreshReaderSearch(app,d){
  const reader=app.root.querySelector('[data-reader-doc="'+CSS.escape(d.id)+'"]');if(!reader)return;
  const old=reader.querySelector('[data-reader-search-panel]'),focused=document.activeElement,hadFocus=old?.contains(focused),focusInfo=hadFocus?{input:focused.dataset.input,action:focused.dataset.action,page:focused.dataset.page,start:focused.selectionStart,end:focused.selectionEnd}:null,box=document.createElement('div');
  box.innerHTML=readerSearchPanel(app,d);translateDOM(box,app.locale);const panel=box.firstElementChild;old.replaceWith(panel);
  if(hadFocus&&app.state.reader[d.id]?.searchOpen){let next;if(focusInfo.input)next=panel.querySelector('[data-input="reader-query"]');else if(focusInfo.action)next=panel.querySelector('[data-action="'+CSS.escape(focusInfo.action)+'"]'+(focusInfo.page!==undefined?'[data-page="'+CSS.escape(focusInfo.page)+'"]':''));else next=panel.querySelector('button[type="submit"]');if(!next||next.disabled)next=panel.querySelector('[data-input="reader-query"]');next?.focus({preventScroll:true});if(next?.tagName==='INPUT'&&typeof focusInfo.start==='number')next.setSelectionRange(focusInfo.start,focusInfo.end);}
  const {rs,query,pageHits}=searchState(app,d),text=highlighter(query),hits=new Set(pageHits.map(u=>u.id)),locale=documentDisplay(app,d).locale;
  for(const p of reader.querySelectorAll('.ll-paper [data-unit]')){const u=app.corpus.peekUnit(d.id,locale,p.dataset.unit),target=p.querySelector('.ll-paragraph-text');if(!u||!target)continue;if(rs.searchOpen&&hits.has(u.id))target.innerHTML=text(u.text);else if(target.querySelector('mark'))target.textContent=u.text;}
  reader.querySelector('[data-action="toggle-reader-search"]')?.setAttribute('aria-expanded',String(Boolean(rs.searchOpen)));
}
export async function attachReader(app,position,scope){
  scope?.assert();
  const reader=app.root.querySelector('[data-reader-doc]'),spec=app.readerSpec;
  if(!reader||!spec){app.readerController?.destroy();app.readerController=null;app.readerSpec=null;app.corpus.releaseReader();return;}
  if(position?.docId!==spec.descriptor.docId)position=null;
  if(app.readerController?.reader===reader){
    const controller=app.readerController;controller.resume();controller.update(spec);
    // A question change can cancel the very first window before any block paints.
    if(!controller.nodes.size)await controller.initialize(position);
    await new Promise(resolve=>requestAnimationFrame(resolve));scope?.assert();
    if(app.readerController===controller&&!controller.closed){controller.restore(position);controller.scheduleScroll();}return;
  }
  app.readerController?.destroy();app.readerController=new ReaderController(app,reader,spec);await app.readerController.initialize(position);scope?.assert();
}
export function captureReaderPosition(app){return app.readerController?.capture()||null;}
export async function restoreReaderPosition(app,position){if(app.readerController&&position?.docId===app.readerController.descriptor.docId){const block=position.anchor&&app.readerController.descriptor.unitToBlock[position.anchor.id];if(Number.isInteger(block))await app.readerController.window(block,null);app.readerController.restore(position);}}
export function prepareReaderLayout(app){
  if(app.closed||app.readerLayoutFrame)return;
  app.readerLayoutFrame=requestAnimationFrame(()=>{
    app.readerLayoutFrame=0;if(app.closed)return;const readers=[...app.root.querySelectorAll('.ll-reader')];
    for(const reader of readers){const dock=reader.querySelector('.ll-reader-dock'),viewport=window.visualViewport,nav=document.querySelector('.mobile-nav')?.getBoundingClientRect(),bar=document.querySelector('.topbar')?.getBoundingClientRect(),available=(viewport?.height||innerHeight)-(bar?.height||0)-(nav?.height||0)-(dock?.getBoundingClientRect().height||0)-20,height=Math.round(Math.max(100,Math.min(available,(viewport?.height||innerHeight)*.72)))+'px';if(reader.style.getPropertyValue('--ll-reader-pane-height')!==height)reader.style.setProperty('--ll-reader-pane-height',height);}
    const dock=readers[0]?.querySelector('.ll-reader-dock');if(app.observedReaderDock!==dock){app.readerLayoutObserver?.disconnect();app.observedReaderDock=dock;if(dock&&globalThis.ResizeObserver){app.readerLayoutObserver=new ResizeObserver(()=>prepareReaderLayout(app));app.readerLayoutObserver.observe(dock);}}
  });
}
export function scrollReaderUnitIntoView(app,docId,id,options={}){
  if(app.readerController?.descriptor.docId!==docId)return Promise.resolve(false);
  return app.readerController.navigate(id,options);
}
