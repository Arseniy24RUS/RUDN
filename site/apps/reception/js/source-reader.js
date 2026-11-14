import {resourceURL} from '../../../assets/js/release-resources.js';
import {esc} from './icons.js';
import {icon as cabinetIcon} from '../ai/cabinet-icons.js';
import {createSourceReference,sourceReferenceFromSelection} from './source-reference.js';
import {SOURCE_LOCATORS} from './source-locators.js';
import {documentTranslations} from './source-reader-translations.js';

let Corpus,readerView,attachReader,refreshReaderToc,refreshReaderSearch,setReaderQuery,translateDOM,readerImports;
function loadReader(){
  if(!readerImports)readerImports=Promise.all([
    import('../../legal-lab/lib/corpus.mjs'),import('../../legal-lab/lib/reader-view.mjs'),
    import('../../legal-lab/lib/translation-ui.mjs'),import('../../legal-lab/locales/ui.mjs'),
  ]).then(([corpus,view,translation,ui])=>{
    ({Corpus}=corpus);({readerView,attachReader,refreshReaderToc,refreshReaderSearch}=view);
    ({setReaderQuery}=translation);({translateDOM}=ui);
  }).catch(error=>{readerImports=null;throw error;});
  return readerImports;
}
const BASE=new URL('../',import.meta.url);
const SHARED_BASE=new URL('../../legal-lab/',import.meta.url);
const EXISTING={'48601':'civil79','82959':'corruption273','34661':'koap'};
const localizedReaderCopy={
  ru:{original:'Русский оригинал',translation:'Показать перевод',translatedSelection:'В черновике сохранится соответствующий фрагмент русского оригинала.',tooLong:'Откройте русский оригинал и выделите фрагмент до 4 000 знаков.',switchFailed:'Не удалось переключить язык документа. Повторите попытку.'},
  en:{original:'Russian original',translation:'Show translation',studyTranslation:'Study translation',machineTranslation:'Machine-assisted study translation',translatedSelection:'Your draft will cite the corresponding passage in the Russian original.',tooLong:'Open the Russian original and select a passage of up to 4,000 characters.',switchFailed:'Could not switch the document language. Try again.'},
  zh:{original:'俄文原文',translation:'显示译文',studyTranslation:'学习译文',machineTranslation:'机器辅助学习译文',translatedSelection:'草稿中将引用对应的俄文原文段落。',tooLong:'请打开俄文原文，选择不超过 4,000 个字符的片段。',switchFailed:'无法切换文件语言，请重试。'},
};
const LOCAL_LAWS=new Set(['59999','61801','103023','182661','8559','8585','58968','13744','6719','19671','165795','19109','71450','155986','34823','34683','107289','121895','37318','305','491941','140174','39570','363263','64871']);
const ALIASES=[
  ['mintrud.gov.ru/docs/laws/129','reception-info8'],
  ['base.garant.ru/12125268/','reception-law34683'],
  ['base.garant.ru/12148567/','reception-law61801'],
  ['sudact.ru/law/federalnyi-zakon-ot-29112010-n-326-fz','reception-law107289'],
  ['sfr.gov.ru/branches/moscow/news~2026/02/24/279071','reception-law64871'],
  ['legalacts.ru/doc/79_FZ-o-gosudarstvennoj-grazhdanskoj-sluzhbe/','civil79'],
  ['base.garant.ru/191872/','reception-flight82'],
  ['nalog.garant.ru/fns/nk/6f1c6ca78c7f356c4f502d5a4aeec0e5/','reception-law19671'],
  ['nalog.gov.ru/rn02/news/activities_fts/13685992/','reception-tax2'],
  ['zpp.rospotrebnadzor.ru/adjudications/federal/243619','reception-law305'],
  ['base.garant.ru/12112084/','reception-law19109'],
  ['base.garant.ru/378789/','reception-moscow42'],
  ['moskva-pravo.ru/zakon/2002/07/12/n-42/','reception-moscow42'],
  ['archives.gov.ru/documents/rules/office-work-rules-gos.shtml','reception-archive71'],
  ['archives.gov.ru/docs/rules/office-work-rules-gos.htm','reception-archive71'],
  ['sudact.ru/law/prikaz-rosarkhiva-ot-22052019-n-71-ob/','reception-archive71'],
  ['garant.ru/products/ipo/prime/doc/414140907/','reception-driver160'],
];
export function sourceDocumentForURL(value){
  let url;try{url=new URL(value);}catch{return null;}
  if(!['https:','http:'].includes(url.protocol))return null;
  const host=url.hostname.replace(/^www\./,'');
  if(host==='consultant.ru'){
    const law=url.pathname.match(/^\/document\/cons_doc_LAW_(\d+)\//)?.[1];
    if(EXISTING[law])return EXISTING[law];
    if(law==='84602')return 'reception-info8';
    if(law==='28165')return 'reception-tax2';
    if(law==='342093')return 'reception-archive71';
    if(law==='71492')return 'reception-flight82';
    if(LOCAL_LAWS.has(law))return 'reception-law'+law;
  }
  return ALIASES.find(([prefix])=>(host+url.pathname).startsWith(prefix))?.[1]||null;
}

let stylesReady;
function loadStyles(){
  if(!stylesReady)stylesReady=Promise.all([
    resourceURL('style.css',SHARED_BASE),resourceURL('source-reader.css',BASE),
  ].map(url=>new Promise((resolve,reject)=>{
    const existing=[...document.querySelectorAll('link[rel="stylesheet"]')].find(link=>link.href===url.href);
    if(existing?.sheet){resolve();return;}
    const link=existing||document.createElement('link');link.rel='stylesheet';link.href=url.href;
    link.onload=resolve;link.onerror=()=>{link.remove();reject(new Error('Не удалось загрузить оформление документа.'));};
    if(!existing)document.head.append(link);
  }))).catch(error=>{stylesReady=null;throw error;});
  return stylesReady;
}

/** Mounts the seminar-4 reader without importing its assignments or grading. */
export function createSourceReader(host,{signal,locale=()=>document.documentElement.lang,onSelect,canSelect=()=>true,presentation='dialog',getContainer,beforeOpen}={}){
  const lifetime=new AbortController();
  const positions={},readerState={};
  const embedded=presentation==='embedded';
  let mountedContainer=null;
  let dialog=null,app=null,current=null,session=null,opener=null,generation=0,closed=false,selectedReference=null,sourceURL='',saving=false,switching=false;
  const language=()=>{const value=String((typeof locale==='function'?locale():locale)||'');return /^en/i.test(value)?'en':/^zh/i.test(value)?'zh':'ru';};
  const readerCopy=()=>localizedReaderCopy[language()];
  const labels=()=>({en:{close:'Back to case',loading:'Opening document…',failed:'Could not open the document. Try again.',retry:'Try again',document:'Document',selectHint:'Tap a paragraph or select text to use it as a legal basis.',selected:'Selected passage',use:'Use in decision',clear:'Clear selection',saving:'Saving…',selectFailed:'Could not save the passage. Try again.'},zh:{close:'返回案件',loading:'正在打开文件…',failed:'无法打开文件，请重试。',retry:'重试',document:'文件',selectHint:'点击段落或选择文本，将其作为法律依据。',selected:'所选片段',use:'填入决定',clear:'清除选择',saving:'正在保存…',selectFailed:'无法保存片段，请重试。'}}[language()]||{close:'Вернуться к делу',loading:'Открываем документ…',failed:'Не удалось открыть документ. Повторите загрузку.',retry:'Повторить',document:'Документ',selectHint:'Нажмите на абзац или выделите текст, чтобы использовать его как правовое основание.',selected:'Выбранный фрагмент',use:'В решение',clear:'Снять выделение',saving:'Сохраняем…',selectFailed:'Не удалось сохранить фрагмент. Повторите попытку.'});
  const baseLabels=labels;
  const cabinetLabels=()=>{const text=baseLabels();return embedded?{...text,...({en:{close:'All documents',selected:'Passage selected',selectHint:'Tap a paragraph or select text to save a passage.',use:'Save passage',clear:'Clear',savedHint:'The passage and citation will be saved in your draft.'},zh:{close:'全部文件',selected:'已选择片段',selectHint:'点击段落或选择文字以保存所需片段。',use:'保存片段',clear:'取消',savedHint:'片段及出处将保存在草稿中。'}}[language()]||{close:'Все документы',selected:'Фрагмент выделен',selectHint:'Нажмите на абзац или выделите текст, чтобы сохранить нужный фрагмент.',use:'Сохранить фрагмент',clear:'Снять',savedHint:'Цитата и реквизиты сохранятся в черновике.'})}:text;};
  const selectionEnabled=()=>typeof onSelect==='function'&&(typeof canSelect==='function'?canSelect():canSelect)!==false;
  function close(){
    generation++;
    if(app?.readerController&&current)positions[current.id]=app.readerController.capture();
    app?.readerController?.destroy();app?.corpus?.destroy();session?.abort();
    app=null;current=null;session=null;selectedReference=null;saving=false;switching=false;
    dialog?.close?.();dialog?.remove();dialog=null;
    mountedContainer?.classList.remove('rx-source-reader-open');mountedContainer=null;
    if(embedded)delete host.dataset.sourceReaderOpen;
    if(opener?.isConnected)opener.focus({preventScroll:true});
  }
  // The application may replace its own panel while a network request finishes.
  // Keep the real reader DOM/controller and reattach them to the new page host.
  function refresh(){
    if(!embedded||!dialog||closed)return !embedded;
    const target=typeof getContainer==='function'?getContainer():getContainer||host;
    if(!target?.isConnected||!host.contains(target))return false;
    if(mountedContainer!==target)mountedContainer?.classList.remove('rx-source-reader-open');
    mountedContainer=target;target.classList.add('rx-source-reader-open');host.dataset.sourceReaderOpen='true';
    if(dialog.parentNode!==target)target.append(dialog);
    if(app&&app.locale!==language()&&!switching)void switchDocumentLanguage(false);
    return true;
  }
  function setEmbeddedSearchResults(open){
    if(!embedded||!dialog||!app)return;
    dialog.dataset.searchResultsOpen=String(open);
    const paper=app.root.querySelector('.ll-reader-surface');
    if(paper)paper.inert=open;
    const contents=dialog.querySelector('[data-action="toggle-toc"]');
    if(contents)contents.disabled=open;
    if(open){const title=dialog.querySelector('.rx-source-title');if(title)title.open=false;}
  }
  function decorateEmbeddedReader(){
    if(!embedded||!app)return;
    const reader=app.root.querySelector('.ll-reader');if(!reader)return;
    const surface=reader.querySelector('.ll-reader-surface'),searchPanel=reader.querySelector('[data-reader-search-panel]');
    if(searchPanel&&searchPanel.parentNode===surface)reader.prepend(searchPanel);
    const input=reader.querySelector('[data-input="reader-query"]');
    if(input)input.placeholder=({en:'Find in document',zh:'在文件中查找'}[language()]||'Найти в документе');
    // The native reader still owns search, structure, pagination and its virtual
    // text window. Only the cabinet's presentation moves these controls.
    const tools=reader.querySelector('.ll-reader-tools'),bar=dialog.querySelector('.rx-source-dialog-bar');
    if(tools&&bar&&!bar.querySelector('.ll-reader-tools'))bar.append(tools);
    const toc=bar?.querySelector('[data-action="toggle-toc"]');if(toc){const title=({en:'Contents',zh:'目录'}[language()]||'Оглавление');toc.innerHTML=cabinetIcon('sources');toc.setAttribute('title',title);toc.setAttribute('aria-label',title);}
    const find=reader.querySelector('.ll-searchbar button[type="submit"]');if(find)find.innerHTML=cabinetIcon('search');
    const clear=reader.querySelector('[data-action="clear-search"]');if(clear){clear.innerHTML=cabinetIcon('close');clear.setAttribute('aria-label',({en:'Clear search',zh:'清除搜索'}[language()]||'Очистить поиск'));}
    const header=reader.querySelector('.ll-reader-header');
    if(header&&!header.querySelector('[data-cabinet-document-icon]')){
      header.insertAdjacentHTML('afterbegin',`<span data-cabinet-document-icon>${cabinetIcon('docs')}</span>`);
      const title=header.querySelector('h2')?.textContent||cabinetLabels().document;
      const number=header.querySelector('.ll-eyebrow')?.textContent||title;
      const compactNumber=number.match(/(?<![\p{L}\d])\d+[-‑–](?:ФЗ|FZ)(?![\p{L}\d])/iu)?.[0]||number;
      const revision=header.querySelector('.ll-revision')?.textContent;
      const lang=app.readerSpec.descriptor.locale;
      bar?.querySelector('[data-source-reader-close]')?.insertAdjacentHTML('afterend',`<details class="rx-source-title">
        <summary title="${esc(title)}"><span>${esc(compactNumber)}</span>${cabinetIcon('down')}</summary>
        <div class="rx-source-title-panel"><h2 lang="${lang}">${esc(title)}</h2>${revision?`<p lang="${lang}">${esc(revision)}</p>`:''}
        ${lang!=='ru'?`<p>${esc(documentTranslations[current.id]?readerCopy().machineTranslation:readerCopy().studyTranslation)}</p>`:''}
        ${selectionEnabled()?`<p>${esc(cabinetLabels().selectHint)}</p>`:''}</div></details>`);
    }
    setEmbeddedSearchResults(Boolean(searchPanel?.querySelector('.ll-search-results:not([hidden])')));
  }
  function fail(error){
    if(error?.name==='AbortError'||!dialog)return;
    dialog.querySelector('[data-source-reader-status]').textContent=cabinetLabels().failed;
    const retry=dialog.querySelector('[data-source-reader-retry]');retry.hidden=false;
  }
  function translate(){if(app)translateDOM(app.root,language());}
  function originalUnit(id,unit){
    const spec=SOURCE_LOCATORS[current.id],position=Number(id.match(/-u(\d+)$/)?.[1]);
    const locator=spec?.starts.findLast(([start])=>start<=position)?.[1];
    return {...unit,id,label:locator?`${spec.kind} ${locator}`:unit.label||unit.locator||''};
  }
  function unitForElement(element){
    const id=element.dataset.unit,descriptor=app.readerSpec.descriptor,locale=descriptor.locale;
    const unit=app.corpus.peekUnit(current.id,locale,id);
    const display={...unit,id,label:unit?.label||descriptor.labels[id]||unit?.locator||'',text:unit?.text||element.querySelector('.ll-paragraph-text')?.textContent||''};
    return locale==='ru'?originalUnit(id,display):display;
  }
  function setSelection(reference){
    selectedReference=reference?{...reference,displayLocale:app.readerSpec.descriptor.locale}:null;
    renderSelection();
  }
  function renderSelection(){
    if(!dialog)return;
    const tray=dialog.querySelector('[data-source-reference-tray]');if(!tray)return;
    tray.hidden=!selectionEnabled();
    const text=cabinetLabels(),selected=Boolean(selectedReference);
    tray.dataset.sourceReferenceFeedback=String(selected&&selectedReference.displayLocale!=='ru');
    tray.querySelector('[data-source-reference-hint]').textContent=selected?(selectedReference.displayLocale==='ru'?text.selected:readerCopy().translatedSelection):text.selectHint;
    tray.dataset.selected=String(selected);
    tray.querySelector('[data-source-reference-title]').textContent=selectedReference?.locator||'';
    tray.querySelector('[data-source-reference-preview]').textContent=selectedReference?.text.slice(0,160)||'';
    const use=tray.querySelector('[data-source-reference-use]');use.disabled=!selected||saving||switching;use.innerHTML=(embedded?cabinetIcon('decision'):'')+`<span>${esc(saving?text.saving:text.use)}</span>`;
    tray.querySelector('[data-source-reference-clear]').hidden=!selected;
    if(app?.readerSpec){app.readerSpec.selected=selectedReference?.unitIds||[];app.readerController?.update(app.readerSpec);}
  }
  function selectionFeedback(message){
    const tray=dialog.querySelector('[data-source-reference-tray]');
    tray.dataset.sourceReferenceFeedback='true';
    tray.querySelector('[data-source-reference-hint]').textContent=message;
  }
  function captureSelection(){
    if(!selectionEnabled()||!app||!current||saving||switching)return false;
    const selection=dialog.ownerDocument.defaultView.getSelection();
    const reference=sourceReferenceFromSelection(selection,app.root.querySelector('.ll-paper'),current,unitForElement,sourceURL);
    if(!reference)return false;
    setSelection(reference);return true;
  }
  async function useSelection(){
    if(!selectedReference||saving||switching||!selectionEnabled())return;
    const ticket=generation,owner=app,doc=current,{displayLocale,...selection}=structuredClone(selectedReference);
    saving=true;renderSelection();
    try{
      let reference=selection;
      if(displayLocale!=='ru'){
        const original=await owner.corpus.readerDocument(doc.id,'ru',{activate:false});
        const ordered=selection.unitIds.map(id=>original.units.find(unit=>unit.id===id));
        if(ordered.some((unit,index)=>!unit||index>0&&unit.index!==ordered[index-1].index+1))throw Error('Selected passage is unavailable');
        const loaded=await owner.corpus.loadUnits(doc.id,'ru',selection.unitIds);
        if(ticket!==generation)return;
        const units=ordered.map(unit=>unit&&loaded.has(unit.id)?originalUnit(unit.id,{...unit,...loaded.get(unit.id)}):null);
        if(units.some(unit=>!unit))throw Error('Selected passage is unavailable');
        reference=createSourceReference(doc,{units,url:sourceURL});
        if(!reference||units.length>40||reference.text.length>4000){
          saving=false;renderSelection();selectionFeedback(readerCopy().tooLong);return;
        }
      }
      const result=await onSelect(reference);
      if(ticket!==generation)return;
      if(result!==false)close();else{saving=false;renderSelection();}
    }catch{
      if(ticket!==generation)return;
      saving=false;renderSelection();selectionFeedback(cabinetLabels().selectFailed);
    }
  }
  function renderDocument(){
    const selected=selectedReference?.unitIds||[];
    dialog.querySelector('.rx-source-dialog-bar .ll-reader-tools')?.remove();
    dialog.querySelector('.rx-source-title')?.remove();
    app.root.innerHTML=readerView(app,current,selected,{context:'reception',readonly:true,showSource:!embedded});
    const bar=dialog.querySelector('.rx-source-dialog-bar');
    const languageTools=app.root.querySelector('.ll-document-language');
    bar.querySelector('.ll-document-language')?.remove();
    const toggle=languageTools?.querySelector('[data-action="toggle-document-original"]');
    if(languageTools){
      languageTools.hidden=!toggle||!app.locales.includes(app.locale);
      if(!languageTools.hidden&&embedded)bar.append(languageTools);
    }
    if(embedded)decorateEmbeddedReader();
    translate();
    if(toggle&&!languageTools.hidden){
      const displayingOriginal=readerState[current.id].original;
      const label=displayingOriginal?readerCopy().translation:readerCopy().original;
      toggle.textContent=label;
      toggle.title=label;
      toggle.setAttribute('aria-label',label);
      const format=languageTools.querySelector('small');
      format.textContent=displayingOriginal?readerCopy().original:(documentTranslations[current.id]?readerCopy().machineTranslation:readerCopy().studyTranslation);
      if(embedded&&!displayingOriginal){
        const abbreviated=document.createElement('span');
        abbreviated.className='rx-source-translation-label';
        abbreviated.textContent=readerCopy().studyTranslation;
        toggle.prepend(abbreviated);
        toggle.setAttribute('aria-label',`${format.textContent}. ${label}`);
      }
    }
    const labels=cabinetLabels(),back=bar.querySelector('[data-source-reader-close]');
    back.setAttribute('aria-label',labels.close);
    back.querySelector('span').textContent=labels.close;
    dialog.querySelector('[data-source-reference-clear]')?.replaceChildren(labels.clear);
    dialog.querySelector('.rx-source-reference-note')?.replaceChildren(labels.savedHint);
    renderSelection();
  }
  async function switchDocumentLanguage(toggleOriginal){
    if(!app||!current||switching||saving)return;
    const owner=app,doc=current,ticket=generation,lang=language(),rs=readerState[doc.id];
    const oldOriginal=rs.original,oldLocale=owner.locale;
    const original=!owner.locales.includes(lang)||(toggleOriginal?!rs.original:lang==='ru');
    const position=owner.readerController?.capture();
    const control=dialog.querySelector('[data-action="toggle-document-original"]');
    const focus=control===dialog.ownerDocument.activeElement;
    const status=dialog.querySelector('[data-source-reader-status]');
    switching=true;dialog.dataset.languageSwitching='true';if(control)control.disabled=true;status.textContent=cabinetLabels().loading;renderSelection();
    let changed=false;
    try{
      await owner.corpus.readerDocument(doc.id,original?'ru':lang);
      if(ticket!==generation)return;
      owner.locale=lang;rs.original=original;rs.uiLocale=lang;
      changed=true;renderDocument();await attachReader(owner,position);
      if(ticket!==generation)return;
      status.textContent='';
      if(focus)dialog.querySelector('[data-action="toggle-document-original"]')?.focus({preventScroll:true});
    }catch(error){
      if(ticket!==generation)return;
      owner.locale=oldLocale;rs.original=oldOriginal;rs.uiLocale=oldLocale;
      if(changed){
        try{await owner.corpus.readerDocument(doc.id,oldOriginal?'ru':oldLocale);if(ticket!==generation)return;renderDocument();await attachReader(owner,position);}
        catch(other){if(ticket===generation)fail(other);}
      }
      if(ticket!==generation)return;
      if(error?.name!=='AbortError')status.textContent=readerCopy().switchFailed;
    }finally{
      if(ticket===generation){switching=false;delete dialog.dataset.languageSwitching;if(control?.isConnected)control.disabled=false;renderSelection();}
    }
  }
  async function search(page=0){
    const owner=app,doc=current,controller=owner?.readerController;if(!controller||!doc||switching)return;
    const field=owner.root.querySelector('[data-input="reader-query"]');
    const query=field?.value||'';
    if(embedded&&field===field?.ownerDocument.activeElement)field.blur();
    setReaderQuery(owner,doc,query);
    const pending=controller.search(query,page);
    refreshReaderSearch(owner,doc);if(embedded)decorateEmbeddedReader();translate();
    try{await pending;if(app!==owner||owner.readerController!==controller)return;refreshReaderSearch(owner,doc);if(embedded)decorateEmbeddedReader();translate();}
    catch(error){if(app===owner&&owner.readerController===controller)fail(error);}
  }
  async function action(event){
    const target=event.target.closest('[data-action]');if(!target||!app||!current||switching)return;
    const owner=app,doc=current,rs=readerState[doc.id];
    try{
      if(target.dataset.unit&&selectionEnabled()){
        const nativeSelection=dialog.ownerDocument.defaultView.getSelection();
        if(!nativeSelection?.isCollapsed&&(target.contains(nativeSelection?.anchorNode)||target.contains(nativeSelection?.focusNode))&&captureSelection())return;
        nativeSelection?.removeAllRanges();
        const unit=unitForElement(target),reference=createSourceReference(doc,{units:[unit],url:sourceURL});
        setSelection(reference?.id===selectedReference?.id?null:reference);
      }else if(target.dataset.action==='toggle-document-original'){
        await switchDocumentLanguage(true);
      }else if(target.dataset.action==='toggle-toc'){
        rs.tocOpen=!rs.tocOpen;owner.root.querySelector('.ll-reader-grid').classList.toggle('toc-open',rs.tocOpen);
        target.setAttribute('aria-expanded',String(rs.tocOpen));refreshReaderToc(owner,doc);
      }else if(target.dataset.action==='toggle-reader-search'||target.dataset.action==='clear-search'){
        rs.searchOpen=embedded||target.dataset.action==='toggle-reader-search'&&!rs.searchOpen;
        if(!rs.searchOpen||target.dataset.action==='clear-search'){owner.readerController.cancelSearch();setReaderQuery(owner,doc,'');}
        refreshReaderSearch(owner,doc);if(embedded)decorateEmbeddedReader();translate();
        if(rs.searchOpen)owner.root.querySelector('[data-input="reader-query"]')?.focus();
      }else if(target.dataset.action==='section'){
        const section=owner.readerSpec.descriptor.sections.find(item=>item.id===target.dataset.id);
        if(section){rs.tocOpen=false;owner.root.querySelector('.ll-reader-grid').classList.remove('toc-open');refreshReaderToc(owner,doc);await owner.readerController.navigate(section.unitIds[0]);}
      }else if(target.dataset.action==='jump-unit'){
        if(embedded){
          target.closest('.ll-search-results').hidden=true;
          setEmbeddedSearchResults(false);
          if(rs.tocOpen)dialog.querySelector('[data-action="toggle-toc"]')?.click();
        }else{
          rs.searchOpen=false;refreshReaderSearch(owner,doc);
        }
        await owner.readerController.navigate(target.dataset.id);
      }else if(target.dataset.action==='search-page')await search(Number(target.dataset.page));
    }catch(error){if(app===owner)fail(error);}
  }
  async function openDocument(id,trigger=document.activeElement,url=''){
    if(!id||closed)return false;
    close();
    if(embedded){await beforeOpen?.();if(closed)return false;}
    opener=trigger;sourceURL=url;const ticket=++generation;
    const aborter=session=new AbortController();
    dialog=document.createElement(embedded?'section':'dialog');dialog.className='legal-lab rx-source-dialog'+(embedded?' rx-source-embedded':'');dialog.setAttribute('aria-label',cabinetLabels().document);
    if(embedded){dialog.setAttribute('role','region');dialog.setAttribute('open','');}
    const text=cabinetLabels();
    dialog.innerHTML=`<div class="rx-source-dialog-bar"><button type="button" data-source-reader-close aria-label="${esc(text.close)}">${embedded?cabinetIcon('back'):''}<span>${esc(text.close)}</span></button><p role="status" data-source-reader-status>${esc(text.loading)}</p><button type="button" data-source-reader-retry hidden>${esc(text.retry)}</button></div><div class="rx-source-reader-content"></div>${typeof onSelect==='function'?`<footer class="rx-source-reference-tray" data-source-reference-tray ${selectionEnabled()?'':'hidden'}><div class="rx-source-reference-copy"><p role="status" data-source-reference-hint>${esc(text.selectHint)}</p><strong data-source-reference-title></strong><p data-source-reference-preview></p></div><div class="rx-source-reference-actions"><button type="button" data-source-reference-clear hidden>${esc(text.clear)}</button><button type="button" data-source-reference-use disabled>${esc(text.use)}</button></div>${embedded?`<small class="rx-source-reference-note">${esc(text.savedHint)}</small>`:''}</footer>`:''}`;
    if(embedded){if(!refresh()){dialog.remove();dialog=null;session?.abort();session=null;return false;}}
    else{document.body.append(dialog);dialog.showModal();}
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();},{signal:aborter.signal});
    dialog.querySelector('[data-source-reader-close]').addEventListener('click',close,{signal:aborter.signal});
    dialog.querySelector('[data-source-reader-retry]').addEventListener('click',()=>void openDocument(id,opener,url),{signal:aborter.signal});
    dialog.querySelector('[data-source-reference-use]')?.addEventListener('click',()=>void useSelection(),{signal:aborter.signal});
    dialog.querySelector('[data-source-reference-clear]')?.addEventListener('click',()=>{selectedReference=null;dialog.ownerDocument.defaultView.getSelection()?.removeAllRanges();renderSelection();},{signal:aborter.signal});
    try{
      const shared=Object.values(EXISTING).includes(id);
      await Promise.all([loadReader(),loadStyles()]);
      if(ticket!==generation||closed)return false;
      const corpus=new Corpus(shared?SHARED_BASE:BASE,{signal:aborter.signal});
      const catalog=await corpus.json(shared?'data/catalog.json':'content/legal-documents/catalog.json');
      corpus.catalog=catalog;
      if(!shared){
        Object.assign(corpus.readerData,{catalogPath:catalog.readerCatalog.path,catalogSha256:catalog.readerCatalog.sha256,contentVersion:catalog.contentVersion});
        const bundle=catalog.documents.find(item=>item.id===id)?.bundle;
        if(bundle){
          const read=corpus.json.bind(corpus);let packed;
          corpus.json=async(path,expectedSha,options={})=>{
            if(!path.startsWith('content/legal-documents/'+id+'/'))return read(path,expectedSha,options);
            packed||=read(bundle.path||bundle.url,bundle.sha256,{signal:aborter.signal}).catch(error=>{packed=null;throw error;});
            const packet=await packed;corpus.assertActive();
            if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
            const entry=packet.files[path];
            if(packet.docId!==id||!entry||entry.sha256!==expectedSha)throw new Error('Контрольная сумма документа не совпадает.');
            return entry.value;
          };
        }
      }
      const doc=await corpus.load(id),entry=await corpus.readerData.entry(id);
      const translation=documentTranslations[id];
      if(!shared&&translation?.sourceSha256===entry.sourceSha256&&translation?.sourceFileSha256===entry.sourceFileSha256){
        Object.assign(entry.locales,translation.locales);
      }
      const locales=Object.keys(entry.locales),lang=language();
      const rs=readerState[id]||={original:lang==='ru'||!locales.includes(lang),tocOpen:false,searchOpen:embedded};
      if(!locales.includes(lang)||lang==='ru')rs.original=true;
      else if(rs.uiLocale&&rs.uiLocale!==lang)rs.original=false;
      rs.uiLocale=lang;
      await corpus.readerDocument(id,rs.original?'ru':lang);
      if(ticket!==generation||closed){corpus.destroy();return false;}
      current=doc;app={root:dialog.querySelector('.rx-source-reader-content'),corpus,locale:lang,locales,state:{reader:readerState},unitIndexes:new WeakMap(),isLocked:()=>false,applyPresence:()=>{},fail};
      renderDocument();await attachReader(app,positions[id]);
      if(ticket!==generation)return false;
      dialog.querySelector('[data-source-reader-status]').textContent='';
      dialog.addEventListener('click',action,{signal:aborter.signal});
      if(typeof onSelect==='function'){
        dialog.ownerDocument.addEventListener('selectionchange',captureSelection,{signal:aborter.signal});
        app.root.addEventListener('pointerup',captureSelection,{signal:aborter.signal});
        app.root.addEventListener('keyup',captureSelection,{signal:aborter.signal});
        renderSelection();
      }
      app.root.addEventListener('submit',event=>{if(event.target.matches('[data-search-form="reader"]')){event.preventDefault();void search();}},{signal:aborter.signal});
      dialog.querySelector('[data-source-reader-close]').focus({preventScroll:true});
      return true;
    }catch(error){if(ticket===generation)fail(error);return false;}
  }
  const open=(url,trigger)=>openDocument(sourceDocumentForURL(url),trigger,url);
  host.addEventListener('click',event=>{
    const button=event.target.closest('button[data-normative-doc]');
    if(button){if(!button.disabled)void openDocument(button.dataset.normativeDoc,button);return;}
    const anchor=event.target.closest('a[data-source-reader]');
    if(!anchor||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!sourceDocumentForURL(anchor.href))return;
    event.preventDefault();void open(anchor.href,anchor);
  },{signal:lifetime.signal});
  function destroy(){closed=true;close();lifetime.abort();signal?.removeEventListener('abort',destroy);}
  signal?.addEventListener('abort',destroy,{once:true});if(signal?.aborted)destroy();
  return {open,openDocument,close,destroy,refresh,isOpen:()=>Boolean(dialog),supports:url=>Boolean(sourceDocumentForURL(url))};
}
