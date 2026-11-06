import {getLanguage as currentLanguage} from './i18n.mjs';
import {loadJSON} from './loader.mjs';

const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[—–−]/g,'-').replace(/\s+/g,' ').trim();
const languageCode=value=>String(value||'ru').startsWith('zh')?'zh-Hans':String(value).startsWith('en')?'en':'ru';
const isMoscow=region=>String(region.mapId)==='102269'||region.id==='ru-77'||normalize(region.name)==='москва';
const copy={
  ru:{search:'Найти субъект',searchHint:'Название субъекта',list:'Субъекты для работы',map:'Выбор субъектов на карте',mapHelp:'Нажмите на субъект, чтобы выбрать его. Для небольших территорий увеличьте карту. С клавиатуры: стрелки перемещают фокус, пробел или Enter меняют выбор.',selected:'Выбрано',notSelected:'Не выбрано',of:'из',add:'Выбрать',remove:'Убрать из выбора',none:'Выбраны только федеральные органы и организации.',noMatches:'Субъектов с таким названием не найдено.',loading:'Загружаем карту…',unavailable:'Карта временно недоступна. Выберите субъекты в списке.',zoomIn:'Увеличить карту',zoomOut:'Уменьшить карту',reset:'Вся карта',zoom:'Масштаб карты',hint:'Выберите территорию на карте или в списке.',searchResults:'Найдено субъектов',chosenLegend:'Выбранные субъекты'},
  en:{search:'Find a region',searchHint:'Region name',list:'Regions to work in',map:'Select regions on the map',mapHelp:'Select a region by clicking it. Zoom in for smaller regions. With a keyboard, use the arrow keys to move focus and Space or Enter to change selection.',selected:'Selected',notSelected:'Not selected',of:'of',add:'Select',remove:'Deselect',none:'Only federal authorities and organisations are selected.',noMatches:'No regions match this name.',loading:'Loading the map…',unavailable:'The map is temporarily unavailable. Select regions in the list.',zoomIn:'Zoom in',zoomOut:'Zoom out',reset:'Whole map',zoom:'Map zoom',hint:'Select a region on the map or in the list.',searchResults:'Regions found',chosenLegend:'Selected regions'},
  'zh-Hans':{search:'搜索地区',searchHint:'地区名称',list:'希望工作的地区',map:'在地图上选择地区',mapHelp:'点击地区即可选择。较小的地区可放大地图后选择。键盘操作：方向键移动焦点，空格或回车键切换选择。',selected:'已选择',notSelected:'未选择',of:'/',add:'选择',remove:'取消选择',none:'目前仅选择联邦机关和组织。',noMatches:'未找到符合该名称的地区。',loading:'正在加载地图……',unavailable:'地图暂不可用。请在列表中选择地区。',zoomIn:'放大地图',zoomOut:'缩小地图',reset:'完整地图',zoom:'地图缩放',hint:'在地图或列表中选择地区。',searchResults:'找到的地区',chosenLegend:'已选择地区'}
};
let instanceCounter=0;
const mapRequests=new Map();

export function regionLabel(region,language='ru'){
  const locale=languageCode(language);
  return String(locale==='en'?(region.name_en||region.name):locale==='zh-Hans'?(region.name_zh||region.name):region.name||region.name_ru||region.id);
}

/** Moscow is first in every locale. Other names follow the active language. */
export function orderRegions(regions,language='ru'){
  const locale=languageCode(language);
  const collator=new Intl.Collator(locale==='zh-Hans'?'zh-CN':locale,{sensitivity:'base',numeric:true});
  return [...regions].sort((a,b)=>Number(isMoscow(b))-Number(isMoscow(a))||collator.compare(regionLabel(a,locale),regionLabel(b,locale))||String(a.id).localeCompare(String(b.id)));
}

export function sanitizeRegionSelection(ids,regions){
  const valid=new Set(regions.map(region=>String(region.id)));
  return [...new Set((Array.isArray(ids)?ids:[]).map(String))].filter(id=>valid.has(id));
}

function loadMap(url){
  if(!mapRequests.has(url)){
    const promise=loadJSON(url,{timeout:10000,validate:value=>value?.schema==='rudn-career-region-map'&&value.schemaVersion===1&&value.width>0&&value.height>0&&Array.isArray(value.features)&&value.features.length===89&&value.features.every(feature=>typeof feature.mapId==='string'&&typeof feature.d==='string'&&Array.isArray(feature.anchor)&&feature.anchor.every(Number.isFinite))})
      .catch(error=>{mapRequests.delete(url);throw error;});
    mapRequests.set(url,promise);
  }
  return mapRequests.get(url);
}

/**
 * Linked region checkboxes and a map derived from the geographical puzzle.
 *
 * Regions: {id, name, name_en, name_zh, mapId, defaultSelected?}.
 * `selectedIds` is an explicit list; [] must remain a valid federal-only choice.
 * Omitting `selectedIds` selects Moscow. Selection is persisted by the caller.
 * onChange(ids, {source,regionId}) receives a new array of canonical IDs.
 */
export function createRegionPicker({root,regions=[],selectedIds,onChange=()=>{},getLanguage=currentLanguage,mapURL='data/region-map.json'}={}){
  if(!root?.replaceChildren)throw new TypeError('A region picker root element is required.');
  const catalog=regions.filter(region=>region&&region.id!=null&&region.name).map(region=>({...region,id:String(region.id)}));
  if(new Set(catalog.map(region=>region.id)).size!==catalog.length)throw new TypeError('Region identifiers must be unique.');
  const byId=new Map(catalog.map(region=>[region.id,region]));
  const defaultRegion=catalog.find(isMoscow)||catalog.find(region=>region.defaultSelected);
  let selection=new Set(sanitizeRegionSelection(selectedIds===undefined?(defaultRegion?[defaultRegion.id]:[]):selectedIds,catalog));
  let language=languageCode(getLanguage()),ordered=orderRegions(catalog,language),data=null,destroyed=false,zoom=1;
  let query='',activeId=defaultRegion?.id||ordered[0]?.id,hoveredId=null,pan=null,ignoreMapClick=false,ignoreTimer;
  const key=`career-regions-${++instanceCounter}`;
  const ui=()=>copy[language];
  const selected=()=>orderRegions(catalog,'ru').filter(region=>selection.has(region.id)).map(region=>region.id);
  const canonicalByMap=new Map(catalog.filter(region=>region.mapId!=null).map(region=>[String(region.mapId),region.id]));
  const canonicalByName=new Map(catalog.map(region=>[normalize(region.name),region.id]));
  const mappedFeatures=new Map();
  const bindings=[];

  const listen=(target,type,listener,options)=>{target.addEventListener(type,listener,options);bindings.push(()=>target.removeEventListener(type,listener,options));};
  const label=id=>regionLabel(byId.get(id)||{},language);
  const emit=(source,regionId=null)=>onChange(selected(),{source,regionId});
  const badge=id=>selection.has(id)?ui().selected:ui().notSelected;
  const setText=(element,value)=>{if(element.textContent!==value)element.textContent=value;};

  function updateStatus(){
    const status=root.querySelector('[data-region-selection-status]');
    setText(status,`${ui().selected}: ${selection.size} ${ui().of} ${catalog.length}`);
    root.querySelector('[data-region-empty-selection]').hidden=selection.size>0;
    root.dataset.selectedRegionCount=String(selection.size);
    const describedId=hoveredId||activeId;
    const hint=root.querySelector('[data-region-map-current]');
    setText(hint,describedId&&byId.has(describedId)?`${label(describedId)} · ${badge(describedId)}`:ui().hint);
  }

  function updateSelection(){
    if(destroyed)return;
    for(const checkbox of root.querySelectorAll('[data-region-checkbox]')){
      const checked=selection.has(checkbox.dataset.regionCheckbox);
      checkbox.checked=checked;
      checkbox.closest('.career-region-option').classList.toggle('is-selected',checked);
    }
    for(const shape of root.querySelectorAll('[data-region-map-id]')){
      const id=shape.dataset.regionMapId,checked=selection.has(id);
      shape.setAttribute('aria-checked',String(checked));
      shape.setAttribute('aria-label',label(id));
      shape.classList.toggle('is-selected',checked);
      shape.classList.toggle('is-active',id===activeId);
      shape.setAttribute('tabindex',id===activeId?'0':'-1');
      const title=shape.querySelector('title');if(title)title.textContent=`${label(id)} · ${badge(id)}`;
    }
    for(const boundary of root.querySelectorAll('[data-region-boundary]'))boundary.classList.toggle('is-selected',selection.has(boundary.dataset.regionBoundary));
    updateStatus();
  }

  function toggle(id,source){
    if(!byId.has(id)||destroyed)return;
    if(selection.has(id))selection.delete(id);else selection.add(id);
    if(source==='map')activeId=id;
    updateSelection();emit(source,id);
  }

  function filterList(){
    const normalized=normalize(query);let count=0;
    for(const option of root.querySelectorAll('.career-region-option')){
      const record=byId.get(option.dataset.regionOption);
      const searchable=[record.name,record.name_en,record.name_zh,record.code,record.id].map(normalize).join(' ');
      option.hidden=!!normalized&&!searchable.includes(normalized);
      if(!option.hidden)count++;
    }
    root.querySelector('[data-region-no-matches]').hidden=count>0;
    const status=root.querySelector('[data-region-search-status]');
    status.textContent=normalized?`${ui().searchResults}: ${count}`:'';
  }

  function setZoom(value,{focusId}={}){
    const next=Math.min(4,Math.max(1,value));
    const viewport=root.querySelector('.career-region-map-viewport'),svg=root.querySelector('.career-region-map');
    if(!viewport||!svg||!data)return;
    const ratio=next/zoom;
    let centreX=viewport.scrollLeft+viewport.clientWidth/2,centreY=viewport.scrollTop+viewport.clientHeight/2;
    if(focusId&&mappedFeatures.has(focusId)){
      const feature=mappedFeatures.get(focusId),oldWidth=svg.getBoundingClientRect().width;
      centreX=feature.anchor[0]*oldWidth/data.width;centreY=feature.anchor[1]*oldWidth/data.width;
    }
    zoom=next;
    svg.style.width=`${zoom*100}%`;
    viewport.classList.toggle('is-zoomed',zoom>1);
    viewport.scrollLeft=zoom===1?0:centreX*ratio-viewport.clientWidth/2;
    viewport.scrollTop=zoom===1?0:centreY*ratio-viewport.clientHeight/2;
    root.querySelector('[data-region-zoom="in"]').disabled=zoom>=4;
    root.querySelector('[data-region-zoom="out"]').disabled=zoom<=1;
    root.querySelector('[data-region-zoom="reset"]').disabled=zoom<=1;
    root.querySelector('[data-region-zoom-value]').textContent=`${Math.round(zoom*100)}%`;
  }

  function revealMapRegion(id){
    const viewport=root.querySelector('.career-region-map-viewport'),shape=[...root.querySelectorAll('[data-region-map-id]')].find(element=>element.dataset.regionMapId===id);
    if(!viewport||!shape)return;
    const box=shape.getBoundingClientRect(),visible=viewport.getBoundingClientRect(),pad=24;
    if(box.left<visible.left+pad)viewport.scrollLeft-=visible.left+pad-box.left;
    else if(box.right>visible.right-pad)viewport.scrollLeft+=box.right-visible.right+pad;
    if(box.top<visible.top+pad)viewport.scrollTop-=visible.top+pad-box.top;
    else if(box.bottom>visible.bottom-pad)viewport.scrollTop+=box.bottom-visible.bottom+pad;
  }

  function moveMapFocus(keyName){
    const available=ordered.filter(region=>mappedFeatures.has(region.id));
    if(!available.length)return;
    let id=activeId;
    if(keyName==='Home')id=available[0].id;
    else if(keyName==='End')id=available.at(-1).id;
    else{
      const origin=mappedFeatures.get(activeId)?.anchor||mappedFeatures.get(available[0].id).anchor;
      const direction={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[keyName];
      let score=Infinity;
      for(const region of available){
        if(region.id===activeId)continue;
        const point=mappedFeatures.get(region.id).anchor,dx=point[0]-origin[0],dy=point[1]-origin[1];
        const forward=dx*direction[0]+dy*direction[1],side=Math.abs(dx*direction[1]-dy*direction[0]);
        if(forward<=.01)continue;
        const distance=Math.hypot(dx,dy)+side*1.4;
        if(distance<score){score=distance;id=region.id;}
      }
    }
    activeId=id;hoveredId=null;updateSelection();
    const shape=[...root.querySelectorAll('[data-region-map-id]')].find(element=>element.dataset.regionMapId===id);
    shape?.focus({preventScroll:true});revealMapRegion(id);
  }

  function renderMap(){
    const frame=root.querySelector('[data-region-map-frame]');
    if(!data||!frame||destroyed)return;
    mappedFeatures.clear();
    for(const feature of data.features){
      const id=canonicalByMap.get(String(feature.mapId))||canonicalByName.get(normalize(feature.name));
      if(id)mappedFeatures.set(id,feature);
    }
    if(!mappedFeatures.has(activeId))activeId=ordered.find(region=>mappedFeatures.has(region.id))?.id;
    const featureMarkup=(region,marker=false)=>{
      const feature=mappedFeatures.get(region.id);if(!feature)return '';
      const title=`<title>${E(label(region.id))} · ${badge(region.id)}</title>`;
      // Non-scaling strokes keep city locators and their 28px pointer targets
      // usable at every map size without an observer tied to the host window.
      if(marker)return `<g class="career-region-shape career-region-city" data-region-map-id="${E(region.id)}" data-region-marker role="checkbox" aria-checked="false" aria-label="${E(label(region.id))}" tabindex="-1" transform="translate(${feature.anchor.join(' ')})">${title}<circle class="career-region-city-hit" r=".01"/><circle class="career-region-city-halo" r=".01"/><circle class="career-region-city-dot" r=".01"/></g>`;
      if(feature.city)return `<path class="career-region-shape career-region-city-boundary" aria-hidden="true" data-region-boundary="${E(region.id)}" d="${E(feature.d)}"/>`;
      return `<path class="career-region-shape" data-region-map-id="${E(region.id)}" role="checkbox" aria-checked="false" aria-label="${E(label(region.id))}" tabindex="-1" d="${E(feature.d)}">${title}</path>`;
    };
    frame.innerHTML=`<div class="career-region-map-viewport" aria-describedby="${key}-map-help"><svg class="career-region-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${data.width} ${data.height}" width="${data.width}" height="${data.height}" role="group" aria-label="${ui().map}" aria-describedby="${key}-map-help"><g class="career-region-boundaries" fill-rule="evenodd">${ordered.map(region=>featureMarkup(region)).join('')}</g><g class="career-region-city-markers">${ordered.filter(region=>mappedFeatures.get(region.id)?.city).map(region=>featureMarkup(region,true)).join('')}</g></svg></div>`;
    root.dataset.regionMapState='ready';
    root.querySelector('[data-region-map-controls]').hidden=false;
    const viewport=frame.querySelector('.career-region-map-viewport');
    // Native touch scrolling keeps page gestures available and avoids a map
    // library intercepting scroll. Mouse dragging is enabled only after zoom.
    listen(viewport,'pointerdown',event=>{
      if(event.pointerType!=='mouse'||event.button!==0||zoom<=1)return;
      pan={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};
    });
    listen(viewport,'pointermove',event=>{
      if(!pan||event.pointerId!==pan.id||event.buttons!==1)return;
      const dx=event.clientX-pan.x,dy=event.clientY-pan.y;
      if(!pan.moved&&Math.hypot(dx,dy)<5)return;
      pan.moved=true;ignoreMapClick=true;
      viewport.setPointerCapture?.(event.pointerId);
      viewport.classList.add('is-panning');
      viewport.scrollLeft=pan.left-dx;viewport.scrollTop=pan.top-dy;
      event.preventDefault();
    });
    const endPan=()=>{if(!pan)return;pan=null;viewport.classList.remove('is-panning');clearTimeout(ignoreTimer);ignoreTimer=setTimeout(()=>{ignoreMapClick=false;},120);};
    listen(viewport,'pointerup',endPan);listen(viewport,'pointercancel',endPan);listen(viewport,'lostpointercapture',endPan);
    setZoom(zoom);updateSelection();
    for(const shape of frame.querySelectorAll('[data-region-boundary]'))shape.classList.toggle('is-selected',selection.has(shape.dataset.regionBoundary));
  }

  function render(){
    if(destroyed)return;
    const focused=root.querySelector(':focus'),focusRegion=focused?.dataset?.regionCheckbox,searchFocused=focused?.hasAttribute('data-region-search');
    const scroll=root.querySelector('.career-region-options')?.scrollTop||0;
    for(const off of bindings.splice(0))off();
    root.classList.add('career-region-picker');root.setAttribute('data-no-i18n','');
    root.innerHTML=`<div class="career-region-picker-heading"><strong data-region-selection-status role="status" aria-live="polite"></strong><span class="career-region-legend"><i aria-hidden="true"></i>${ui().chosenLegend}</span></div><p class="career-region-federal-only" data-region-empty-selection hidden>${ui().none}</p><div class="career-region-grid"><div class="career-region-map-panel"><div class="career-region-map-controls" data-region-map-controls hidden><div class="career-region-zoom" role="group" aria-label="${ui().zoom}"><button type="button" data-region-zoom="out" aria-label="${ui().zoomOut}" title="${ui().zoomOut}">−</button><span data-region-zoom-value>100%</span><button type="button" data-region-zoom="in" aria-label="${ui().zoomIn}" title="${ui().zoomIn}">+</button></div><button type="button" class="career-region-map-reset" data-region-zoom="reset">${ui().reset}</button></div><div data-region-map-frame class="career-region-map-frame"><p class="career-region-map-loading" role="status">${ui().loading}</p></div><p id="${key}-map-help" class="career-region-sr-only">${ui().mapHelp}</p><p class="career-region-map-current" data-region-map-current aria-live="polite"></p></div><div class="career-region-list-panel"><label class="career-region-search-label" for="${key}-search">${ui().search}</label><input id="${key}-search" class="career-region-search" type="search" autocomplete="off" placeholder="${ui().searchHint}" data-region-search value="${E(query)}"><span class="career-region-sr-only" role="status" data-region-search-status></span><fieldset class="career-region-options"><legend class="career-region-sr-only">${ui().list}</legend>${ordered.map(region=>`<label class="career-region-option" data-region-option="${E(region.id)}"><input type="checkbox" value="${E(region.id)}" data-region-checkbox="${E(region.id)}"><span>${E(regionLabel(region,language))}</span></label>`).join('')}<p class="career-region-no-matches" data-region-no-matches hidden>${ui().noMatches}</p></fieldset></div></div>`;
    listen(root,'change',event=>{const checkbox=event.target.closest?.('[data-region-checkbox]');if(checkbox)toggle(checkbox.dataset.regionCheckbox,'list');});
    listen(root,'input',event=>{if(event.target.matches?.('[data-region-search]')){query=event.target.value;filterList();}});
    listen(root,'click',event=>{
      const zoomButton=event.target.closest?.('[data-region-zoom]');
      if(zoomButton){const action=zoomButton.dataset.regionZoom;setZoom(action==='reset'?1:zoom*(action==='in'?2:.5));return;}
      const shape=event.target.closest?.('[data-region-map-id]');
      if(shape&&!ignoreMapClick){const id=shape.dataset.regionMapId;hoveredId=id;toggle(id,'map');shape.focus({preventScroll:true});}
    });
    listen(root,'keydown',event=>{
      const shape=event.target.closest?.('[data-region-map-id]');if(!shape)return;
      activeId=shape.dataset.regionMapId;
      if(event.key===' '||event.key==='Enter'){event.preventDefault();toggle(activeId,'map');}
      else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();moveMapFocus(event.key);}
      else if(event.key==='+'||event.key==='='){event.preventDefault();setZoom(zoom*2,{focusId:activeId});}
      else if(event.key==='-'){event.preventDefault();setZoom(zoom*.5,{focusId:activeId});}
    });
    listen(root,'pointerover',event=>{const shape=event.target.closest?.('[data-region-map-id]');if(shape){hoveredId=shape.dataset.regionMapId;updateStatus();}});
    listen(root,'pointerout',event=>{const shape=event.target.closest?.('[data-region-map-id]');if(shape&&!shape.contains(event.relatedTarget)){hoveredId=null;updateStatus();}});
    listen(root,'focusin',event=>{const shape=event.target.closest?.('[data-region-map-id]');if(shape){activeId=shape.dataset.regionMapId;hoveredId=null;updateSelection();}});
    filterList();updateSelection();
    if(data)renderMap();
    else if(root.dataset.regionMapState==='unavailable')showMapUnavailable();
    root.querySelector('.career-region-options').scrollTop=scroll;
    if(searchFocused)root.querySelector('[data-region-search]').focus({preventScroll:true});
    else if(focusRegion)[...root.querySelectorAll('[data-region-checkbox]')].find(checkbox=>checkbox.dataset.regionCheckbox===focusRegion)?.focus({preventScroll:true});
  }

  function showMapUnavailable(){
    if(destroyed)return;
    root.dataset.regionMapState='unavailable';
    const frame=root.querySelector('[data-region-map-frame]');
    frame.innerHTML=`<p class="career-region-map-loading" role="status">${ui().unavailable}</p>`;
  }

  function refresh(){
    if(destroyed)return;
    language=languageCode(getLanguage());ordered=orderRegions(catalog,language);render();
  }

  root.dataset.regionMapState='loading';render();
  const languageListener=()=>refresh();document.addEventListener('app:language',languageListener);
  const ready=loadMap(mapURL).then(value=>{if(destroyed)return false;data=value;renderMap();return true;}).catch(()=>{showMapUnavailable();return false;});
  return {
    ready,
    getSelection:()=>selected(),
    setSelection(ids,{emit:shouldEmit=false}={}){if(destroyed)return;selection=new Set(sanitizeRegionSelection(ids,catalog));updateSelection();if(shouldEmit)emit('external');},
    refresh,
    destroy(){if(destroyed)return;destroyed=true;for(const off of bindings.splice(0))off();clearTimeout(ignoreTimer);document.removeEventListener('app:language',languageListener);root.replaceChildren();root.classList.remove('career-region-picker');delete root.dataset.regionMapState;delete root.dataset.selectedRegionCount;}
  };
}
