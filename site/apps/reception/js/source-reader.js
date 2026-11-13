import {resourceURL} from '../../../assets/js/release-resources.js';
import {esc} from './icons.js';
import {icon as cabinetIcon} from '../ai/cabinet-icons.js';
import {createSourceReference,sourceReferenceFromSelection} from './source-reference.js';

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
const EXISTING={'48601':'civil79','82959':'corruption273'};
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
  let dialog=null,app=null,current=null,session=null,opener=null,generation=0,closed=false,selectedReference=null,sourceURL='',saving=false;
  const language=()=>typeof locale==='function'?locale():locale;
  const labels=()=>({en:{close:'Back to case',loading:'Opening document…',failed:'Could not open the document. Try again.',retry:'Try again',document:'Document',selectHint:'Tap a paragraph or select text to use it as a legal basis.',selected:'Selected passage',use:'Use in decision',clear:'Clear selection',saving:'Saving…',selectFailed:'Could not save the passage. Try again.'},zh:{close:'返回案件',loading:'正在打开文件…',failed:'无法打开文件，请重试。',retry:'重试',document:'文件',selectHint:'点击段落或选择文本，将其作为法律依据。',selected:'所选片段',use:'填入决定',clear:'清除选择',saving:'正在保存…',selectFailed:'无法保存片段，请重试。'}}[language()]||{close:'Вернуться к делу',loading:'Открываем документ…',failed:'Не удалось открыть документ. Повторите загрузку.',retry:'Повторить',document:'Документ',selectHint:'Нажмите на абзац или выделите текст, чтобы использовать его как правовое основание.',selected:'Выбранный фрагмент',use:'В решение',clear:'Снять выделение',saving:'Сохраняем…',selectFailed:'Не удалось сохранить фрагмент. Повторите попытку.'});
  const baseLabels=labels;
  const cabinetLabels=()=>{const text=baseLabels();return embedded?{...text,...({en:{close:'All documents',selected:'Passage selected',selectHint:'Tap a paragraph or select text to save a passage.',use:'Save passage',clear:'Clear',savedHint:'The passage and citation will be saved in your draft.'},zh:{close:'全部文件',selected:'已选择片段',selectHint:'点击段落或选择文字以保存所需片段。',use:'保存片段',clear:'取消',savedHint:'片段及出处将保存在草稿中。'}}[language()]||{close:'Все документы',selected:'Фрагмент выделен',selectHint:'Нажмите на абзац или выделите текст, чтобы сохранить нужный фрагмент.',use:'Сохранить фрагмент',clear:'Снять',savedHint:'Цитата и реквизиты сохранятся в черновике.'})}:text;};
  const selectionEnabled=()=>typeof onSelect==='function'&&(typeof canSelect==='function'?canSelect():canSelect)!==false;
  function close(){
    generation++;
    if(app?.readerController&&current)positions[current.id]=app.readerController.capture();
    app?.readerController?.destroy();app?.corpus?.destroy();session?.abort();
    app=null;current=null;session=null;selectedReference=null;saving=false;
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
      bar?.querySelector('[data-source-reader-close]')?.insertAdjacentHTML('afterend',`<details class="rx-source-title">
        <summary title="${esc(title)}"><span>${esc(compactNumber)}</span>${cabinetIcon('down')}</summary>
        <div class="rx-source-title-panel"><h2 lang="ru">${esc(title)}</h2>${revision?`<p lang="ru">${esc(revision)}</p>`:''}
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
  function unitForElement(element){
    const id=element.dataset.unit,unit=app?.corpus.peekUnit(current.id,'ru',id)||{},descriptor=app?.readerSpec?.descriptor;
    return {...unit,id,label:unit.label||descriptor?.labels?.[id]||unit.locator||element.querySelector('.ll-paragraph-locator')?.textContent||'',text:unit.text||element.querySelector('.ll-paragraph-text')?.textContent||''};
  }
  function renderSelection(){
    if(!dialog)return;
    const tray=dialog.querySelector('[data-source-reference-tray]');if(!tray)return;
    tray.hidden=!selectionEnabled();
    const text=cabinetLabels(),selected=Boolean(selectedReference);
    tray.querySelector('[data-source-reference-hint]').textContent=selected?text.selected:text.selectHint;
    tray.dataset.selected=String(selected);
    tray.querySelector('[data-source-reference-title]').textContent=selectedReference?.locator||'';
    tray.querySelector('[data-source-reference-preview]').textContent=selectedReference?.text.slice(0,160)||'';
    const use=tray.querySelector('[data-source-reference-use]');use.disabled=!selected||saving;use.innerHTML=(embedded?cabinetIcon('decision'):'')+`<span>${esc(saving?text.saving:text.use)}</span>`;
    tray.querySelector('[data-source-reference-clear]').hidden=!selected;
    if(app?.readerSpec){app.readerSpec.selected=selectedReference?.unitIds||[];app.readerController?.update(app.readerSpec);}
  }
  function captureSelection(){
    if(!selectionEnabled()||!app||!current||saving)return false;
    const selection=dialog.ownerDocument.defaultView.getSelection();
    const reference=sourceReferenceFromSelection(selection,app.root.querySelector('.ll-paper'),current,unitForElement,sourceURL);
    if(!reference)return false;
    selectedReference=reference;renderSelection();return true;
  }
  async function useSelection(){
    if(!selectedReference||saving||!selectionEnabled())return;
    const ticket=generation,reference=structuredClone(selectedReference);
    saving=true;renderSelection();
    try{
      const result=await onSelect(reference);
      if(ticket!==generation)return;
      if(result!==false)close();else{saving=false;renderSelection();}
    }catch{
      if(ticket!==generation)return;
      saving=false;renderSelection();dialog.querySelector('[data-source-reference-hint]').textContent=cabinetLabels().selectFailed;
    }
  }
  async function search(page=0){
    const owner=app,doc=current;if(!owner?.readerController||!doc)return;
    const field=owner.root.querySelector('[data-input="reader-query"]');
    const query=field?.value||'';
    if(embedded&&field===field?.ownerDocument.activeElement)field.blur();
    setReaderQuery(owner,doc,query);
    const pending=owner.readerController.search(query,page);
    refreshReaderSearch(owner,doc);if(embedded)decorateEmbeddedReader();translate();
    try{await pending;if(app!==owner)return;refreshReaderSearch(owner,doc);if(embedded)decorateEmbeddedReader();translate();}
    catch(error){if(app===owner)fail(error);}
  }
  async function action(event){
    const target=event.target.closest('[data-action]');if(!target||!app||!current)return;
    const owner=app,doc=current,rs=readerState[doc.id];
    try{
      if(target.dataset.unit&&selectionEnabled()){
        const nativeSelection=dialog.ownerDocument.defaultView.getSelection();
        if(!nativeSelection?.isCollapsed&&(target.contains(nativeSelection?.anchorNode)||target.contains(nativeSelection?.focusNode))&&captureSelection())return;
        nativeSelection?.removeAllRanges();
        const unit=unitForElement(target),reference=createSourceReference(doc,{units:[unit],url:sourceURL});
        selectedReference=reference?.id===selectedReference?.id?null:reference;renderSelection();
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
  async function open(url,trigger=document.activeElement){
    const id=sourceDocumentForURL(url);if(!id||closed)return false;
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
    dialog.querySelector('[data-source-reader-retry]').addEventListener('click',()=>void open(url,opener),{signal:aborter.signal});
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
            packed||=read(bundle.url,bundle.sha256,{signal:aborter.signal}).catch(error=>{packed=null;throw error;});
            const packet=await packed;corpus.assertActive();
            if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
            const entry=packet.files[path];
            if(packet.docId!==id||!entry||entry.sha256!==expectedSha)throw new Error('Контрольная сумма документа не совпадает.');
            return entry.value;
          };
        }
      }
      const doc=await corpus.load(id);await corpus.readerDocument(id,'ru');
      if(ticket!==generation||closed){corpus.destroy();return false;}
      readerState[id]||={original:true,tocOpen:false,searchOpen:embedded};
      current=doc;app={root:dialog.querySelector('.rx-source-reader-content'),corpus,locale:'ru',state:{reader:readerState},unitIndexes:new WeakMap(),isLocked:()=>false,applyPresence:()=>{},fail};
      app.root.innerHTML=readerView(app,doc,[],{context:'reception',readonly:true});
      if(embedded)decorateEmbeddedReader();
      translate();await attachReader(app,positions[id]);
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
  host.addEventListener('click',event=>{
    const anchor=event.target.closest('a[data-source-reader]');
    if(!anchor||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!sourceDocumentForURL(anchor.href))return;
    event.preventDefault();void open(anchor.href,anchor);
  },{signal:lifetime.signal});
  function destroy(){closed=true;close();lifetime.abort();signal?.removeEventListener('abort',destroy);}
  signal?.addEventListener('abort',destroy,{once:true});if(signal?.aborted)destroy();
  return {open,close,destroy,refresh,isOpen:()=>Boolean(dialog),supports:url=>Boolean(sourceDocumentForURL(url))};
}
