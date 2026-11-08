import {resourceURL} from '../../../assets/js/release-resources.js';
import {esc} from './icons.js';

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
export function createSourceReader(host,{signal,locale=()=>document.documentElement.lang}={}){
  const lifetime=new AbortController();
  const positions={},readerState={};
  let dialog=null,app=null,current=null,session=null,opener=null,generation=0,closed=false;
  const language=()=>typeof locale==='function'?locale():locale;
  const labels=()=>({en:{close:'Back to case',loading:'Opening document…',failed:'Could not open the document. Try again.',retry:'Try again'},zh:{close:'返回案件',loading:'正在打开文件…',failed:'无法打开文件，请重试。',retry:'重试'}}[language()]||{close:'Вернуться к делу',loading:'Открываем документ…',failed:'Не удалось открыть документ. Повторите загрузку.',retry:'Повторить'});
  function close(){
    generation++;
    if(app?.readerController&&current)positions[current.id]=app.readerController.capture();
    app?.readerController?.destroy();app?.corpus?.destroy();session?.abort();
    app=null;current=null;session=null;
    dialog?.close();dialog?.remove();dialog=null;
    if(opener?.isConnected)opener.focus({preventScroll:true});
  }
  function fail(error){
    if(error?.name==='AbortError'||!dialog)return;
    dialog.querySelector('[data-source-reader-status]').textContent=labels().failed;
    const retry=dialog.querySelector('[data-source-reader-retry]');retry.hidden=false;
  }
  function translate(){if(app)translateDOM(app.root,language());}
  async function search(page=0){
    const owner=app,doc=current;if(!owner?.readerController||!doc)return;
    const query=owner.root.querySelector('[data-input="reader-query"]')?.value||'';
    setReaderQuery(owner,doc,query);
    const pending=owner.readerController.search(query,page);
    refreshReaderSearch(owner,doc);translate();
    try{await pending;if(app!==owner)return;refreshReaderSearch(owner,doc);translate();}
    catch(error){if(app===owner)fail(error);}
  }
  async function action(event){
    const target=event.target.closest('[data-action]');if(!target||!app||!current)return;
    const owner=app,doc=current,rs=readerState[doc.id];
    try{
      if(target.dataset.action==='toggle-toc'){
        rs.tocOpen=!rs.tocOpen;owner.root.querySelector('.ll-reader-grid').classList.toggle('toc-open',rs.tocOpen);
        target.setAttribute('aria-expanded',String(rs.tocOpen));refreshReaderToc(owner,doc);
      }else if(target.dataset.action==='toggle-reader-search'||target.dataset.action==='clear-search'){
        rs.searchOpen=target.dataset.action==='toggle-reader-search'?!rs.searchOpen:false;
        if(!rs.searchOpen){owner.readerController.cancelSearch();setReaderQuery(owner,doc,'');}
        refreshReaderSearch(owner,doc);translate();
        if(rs.searchOpen)owner.root.querySelector('[data-input="reader-query"]')?.focus();
      }else if(target.dataset.action==='section'){
        const section=owner.readerSpec.descriptor.sections.find(item=>item.id===target.dataset.id);
        if(section){rs.tocOpen=false;owner.root.querySelector('.ll-reader-grid').classList.remove('toc-open');refreshReaderToc(owner,doc);await owner.readerController.navigate(section.unitIds[0]);}
      }else if(target.dataset.action==='jump-unit'){
        rs.searchOpen=false;refreshReaderSearch(owner,doc);await owner.readerController.navigate(target.dataset.id);
      }else if(target.dataset.action==='search-page')await search(Number(target.dataset.page));
    }catch(error){if(app===owner)fail(error);}
  }
  async function open(url,trigger=document.activeElement){
    const id=sourceDocumentForURL(url);if(!id||closed)return false;
    close();opener=trigger;const ticket=++generation;
    const aborter=session=new AbortController();
    dialog=document.createElement('dialog');dialog.className='legal-lab rx-source-dialog';dialog.setAttribute('aria-label','Документ');
    const text=labels();
    dialog.innerHTML=`<div class="rx-source-dialog-bar"><button type="button" data-source-reader-close>${esc(text.close)}</button><p role="status" data-source-reader-status>${esc(text.loading)}</p><button type="button" data-source-reader-retry hidden>${esc(text.retry)}</button></div><div class="rx-source-reader-content"></div>`;
    document.body.append(dialog);dialog.showModal();
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();},{signal:aborter.signal});
    dialog.querySelector('[data-source-reader-close]').addEventListener('click',close,{signal:aborter.signal});
    dialog.querySelector('[data-source-reader-retry]').addEventListener('click',()=>void open(url,opener),{signal:aborter.signal});
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
      readerState[id]||={original:true,tocOpen:false,searchOpen:false};
      current=doc;app={root:dialog.querySelector('.rx-source-reader-content'),corpus,locale:'ru',state:{reader:readerState},unitIndexes:new WeakMap(),isLocked:()=>false,applyPresence:()=>{},fail};
      app.root.innerHTML=readerView(app,doc,[],{context:'reception',readonly:true});
      translate();await attachReader(app,positions[id]);
      if(ticket!==generation)return false;
      dialog.querySelector('[data-source-reader-status]').textContent='';
      app.root.addEventListener('click',action,{signal:aborter.signal});
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
  return {open,close,destroy,supports:url=>Boolean(sourceDocumentForURL(url))};
}
