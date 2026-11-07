import {getLanguage as currentLanguage} from './i18n.mjs';
import {loadJSON} from './loader.mjs';
import {REGION_MAP_MAX_ZOOM,zoomMapAt,containMapView} from './region-map-geometry.mjs';

const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[—–−]/g,'-').replace(/\s+/g,' ').trim();
const languageCode=value=>String(value||'ru').startsWith('zh')?'zh-Hans':String(value).startsWith('en')?'en':'ru';
const isMoscow=region=>String(region.mapId)==='102269'||region.id==='ru-77'||normalize(region.name)==='москва';
const copy={
  ru:{search:'Найти субъект',searchHint:'Название субъекта',list:'Субъекты для работы',map:'Выбор субъектов на карте',mapHelp:'Коснитесь субъекта для выбора. Разведите два пальца для увеличения, сдвигайте карту одним пальцем. На компьютере — колёсико и перетаскивание. С клавиатуры: +/− — масштаб, 0 — вся карта; стрелки — перемещение, Tab — выбор субъекта, пробел или Enter — отметить.',selected:'Выбрано',notSelected:'Не выбрано',of:'из',add:'Выбрать',remove:'Убрать из выбора',none:'Выбраны только федеральные органы и организации.',noMatches:'Субъектов с таким названием не найдено.',loading:'Загружаем карту…',unavailable:'Карта временно недоступна. Выберите субъекты в списке.',zoomIn:'Увеличить карту',zoomOut:'Уменьшить карту',reset:'Вся карта',zoom:'Масштаб карты',hint:'Выберите территорию на карте или в списке.',searchResults:'Найдено субъектов',chosenLegend:'Выбранные субъекты'},
  en:{search:'Find a region',searchHint:'Region name',list:'Regions to work in',map:'Select regions on the map',mapHelp:'Tap a region to select it. Spread two fingers to zoom and drag with one finger to move. On a computer, use the wheel and drag. Keyboard: +/− to zoom, 0 for the whole map; arrows to move, Tab to focus a region, Space or Enter to select.',selected:'Selected',notSelected:'Not selected',of:'of',add:'Select',remove:'Deselect',none:'Only federal authorities and organisations are selected.',noMatches:'No regions match this name.',loading:'Loading the map…',unavailable:'The map is temporarily unavailable. Select regions in the list.',zoomIn:'Zoom in',zoomOut:'Zoom out',reset:'Whole map',zoom:'Map zoom',hint:'Select a region on the map or in the list.',searchResults:'Regions found',chosenLegend:'Selected regions'},
  'zh-Hans':{search:'搜索地区',searchHint:'地区名称',list:'希望工作的地区',map:'在地图上选择地区',mapHelp:'点击地区进行选择。双指张开放大，单指拖动平移；电脑上使用滚轮和拖动。键盘：+/−缩放，0显示全图；方向键移动，Tab聚焦地区，空格或回车选择。',selected:'已选择',notSelected:'未选择',of:'/',add:'选择',remove:'取消选择',none:'目前仅选择联邦机关和组织。',noMatches:'未找到符合该名称的地区。',loading:'正在加载地图……',unavailable:'地图暂不可用。请在列表中选择地区。',zoomIn:'放大地图',zoomOut:'缩小地图',reset:'完整地图',zoom:'地图缩放',hint:'在地图或列表中选择地区。',searchResults:'找到的地区',chosenLegend:'已选择地区'}
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
 * mapFirst changes the display and keyboard order together.
 */
export function createRegionPicker({root,regions=[],selectedIds,onChange=()=>{},getLanguage=currentLanguage,mapURL='data/region-map.json',mapFirst=false,initialQuery='',emptySelectionText}={}){
  if(!root?.replaceChildren)throw new TypeError('A region picker root element is required.');
  const catalog=regions.filter(region=>region&&region.id!=null&&region.name).map(region=>({...region,id:String(region.id)}));
  if(new Set(catalog.map(region=>region.id)).size!==catalog.length)throw new TypeError('Region identifiers must be unique.');
  const byId=new Map(catalog.map(region=>[region.id,region]));
  const defaultRegion=catalog.find(isMoscow)||catalog.find(region=>region.defaultSelected);
  let selection=new Set(sanitizeRegionSelection(selectedIds===undefined?(defaultRegion?[defaultRegion.id]:[]):selectedIds,catalog));
  let language=languageCode(getLanguage()),ordered=orderRegions(catalog,language),data=null,destroyed=false,zoom=1;
  let query=initialQuery,activeId=defaultRegion?.id||ordered[0]?.id,hoveredId=null,ignoreMapClick=false,ignoreTimer;
  let mapX=0,mapY=0,resizeObserver=null,labelNodes=[];
  const pointers=new Map();let gesture=null,gestureMoved=false;
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
    updateStatus();updateMapLabels();
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

  function metrics(){
    const svg=root.querySelector('.career-region-map');
    if(!svg||!data)return null;
    const rect=svg.getBoundingClientRect(),width=rect.width||data.width,height=rect.height||data.height;
    const scale=Math.min(width/data.width,height/data.height);
    return {rect,width,height,scale,offsetX:(width-data.width*scale)/2,offsetY:(height-data.height*scale)/2};
  }
  function svgPoint(event){
    const m=metrics();
    return {x:(event.clientX-m.rect.left-m.offsetX)/m.scale,y:(event.clientY-m.rect.top-m.offsetY)/m.scale};
  }
  const textWidth=value=>[...value].reduce((sum,char)=>sum+(/[\p{Script=Han}]/u.test(char)?13:/[MWЖШЩЮФ]/.test(char)?10:/[il1.,' ]/.test(char)?4:7),0);
  function labelLines(value){
    const words=language==='zh-Hans'?[...value]:value.split(/\s+/),lines=[];let line='';
    for(const word of words){const next=line+(line&&language!=='zh-Hans'?' ':'')+word;if(line&&textWidth(next)>168){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);return lines;
  }
  function updateMapLabels(m=metrics()){
    if(!m)return;
    const pixels=m.scale*zoom,placed=[];
    const candidates=labelNodes.map(item=>{
      const bounds=item.feature.bounds,area=(bounds[2]-bounds[0])*(bounds[3]-bounds[1]);
      return {...item,area,priority:(item.feature.city?1e9:0)+(selection.has(item.id)?1e8:0)+area};
    }).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
    for(const item of candidates){
      const {node,feature,id,lines}=item;
      const threshold=feature.city?1.5:item.area>10000?1.2:item.area>2500?2:item.area>600?3.5:6;
      let visible=zoom>=threshold;
      const width=Math.max(...lines.map(textWidth))+10,height=lines.length*16+4;
      const x=(feature.anchor[0]*zoom+mapX)*m.scale+m.offsetX,y=(feature.anchor[1]*zoom+mapY)*m.scale+m.offsetY;
      const options=feature.city?[[width/2+14,0],[0,-height/2-14],[0,height/2+14],[-width/2-14,0]]:[[0,0]];
      let chosen=null;
      if(visible)for(const [dx,dy]of options){
        const box={left:x+dx-width/2,right:x+dx+width/2,top:y+dy-height/2,bottom:y+dy+height/2};
        if(box.left<5||box.right>m.width-5||box.top<5||box.bottom>m.height-5)continue;
        if(placed.some(other=>box.left<other.right+5&&box.right>other.left-5&&box.top<other.bottom+4&&box.bottom>other.top-4))continue;
        chosen={dx,dy,box};break;
      }
      visible=visible&&!!chosen;
      node.style.display=visible?'':'none';node.dataset.labelVisible=String(visible);
      if(!visible)continue;
      placed.push(chosen.box);
      node.setAttribute('font-size',String(13/pixels));
      node.setAttribute('stroke-width',String(3/pixels));
      node.setAttribute('x',String(feature.anchor[0]+chosen.dx/pixels));
      node.setAttribute('y',String(feature.anchor[1]+(chosen.dy-(lines.length-1)*8+4)/pixels));
      [...node.children].forEach((span,index)=>{span.setAttribute('x',node.getAttribute('x'));span.setAttribute('dy',index?String(16/pixels):'0');});
    }
  }
  function applyView(){
    const m=metrics(),viewport=root.querySelector('.career-region-map-viewport'),content=root.querySelector('.career-region-map-content');
    if(!m||!viewport||!content)return;
    const view=containMapView({zoom,x:mapX,y:mapY},{width:data.width,height:data.height,left:-m.offsetX/m.scale,top:-m.offsetY/m.scale,right:(m.width-m.offsetX)/m.scale,bottom:(m.height-m.offsetY)/m.scale});
    zoom=view.zoom;mapX=view.x;mapY=view.y;
    content.setAttribute('transform',`translate(${mapX} ${mapY}) scale(${zoom})`);
    viewport.dataset.mapZoom=String(zoom);viewport.dataset.mapPanX=String(mapX);viewport.dataset.mapPanY=String(mapY);
    viewport.classList.toggle('is-zoomed',zoom>1);
    root.querySelector('[data-region-zoom="reset"]').disabled=zoom<=1;
    root.querySelector('[data-region-zoom-value]').textContent=`${Math.round(zoom*100)}%`;
    updateMapLabels(m);
  }
  function setZoom(value,{point,focusId}={}){
    if(!data)return;
    if(focusId&&mappedFeatures.has(focusId)){
      zoom=Math.min(REGION_MAP_MAX_ZOOM,Math.max(1,value));
      const anchor=mappedFeatures.get(focusId).anchor;mapX=data.width/2-anchor[0]*zoom;mapY=data.height/2-anchor[1]*zoom;
    }else{
      const next=zoomMapAt({zoom,x:mapX,y:mapY},value,point||{x:data.width/2,y:data.height/2});
      zoom=next.zoom;mapX=next.x;mapY=next.y;
    }
    if(zoom===1){mapX=0;mapY=0;}
    applyView();
  }
  function revealMapRegion(id){
    const m=metrics(),feature=mappedFeatures.get(id);if(!m||!feature)return;
    const x=(feature.anchor[0]*zoom+mapX)*m.scale+m.offsetX,y=(feature.anchor[1]*zoom+mapY)*m.scale+m.offsetY;
    if(x<30||x>m.width-30||y<30||y>m.height-30){mapX=data.width/2-feature.anchor[0]*zoom;mapY=data.height/2-feature.anchor[1]*zoom;applyView();}
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
    const featureMarkup=region=>{
      const feature=mappedFeatures.get(region.id);if(!feature)return '';
      const city=feature.city?` data-region-marker`:'';
      return `<g class="career-region-shape${feature.city?' career-region-city':''}" data-region-map-id="${E(region.id)}"${city} role="checkbox" aria-checked="false" aria-label="${E(label(region.id))}" tabindex="-1"><title>${E(label(region.id))} · ${badge(region.id)}</title><path class="career-region-fill" data-region-fill="${E(region.id)}" d="${E(feature.d)}"/><path class="career-region-outline" data-region-outline="${E(region.id)}" d="${E(feature.outlineD||feature.d)}"/>${feature.city?`<g transform="translate(${feature.anchor.join(' ')})"><circle class="career-region-city-hit" r=".01"/><circle class="career-region-city-halo" r=".01"/><circle class="career-region-city-dot" r=".01"/></g>`:''}</g>`;
    };
    const labelMarkup=ordered.filter(region=>mappedFeatures.has(region.id)).map(region=>`<text class="career-region-label" data-region-label="${E(region.id)}" data-label-visible="false" aria-hidden="true" style="display:none">${labelLines(label(region.id)).map(line=>`<tspan>${E(line)}</tspan>`).join('')}</text>`).join('');
    frame.innerHTML=`<div class="career-region-map-viewport" tabindex="0" role="group" aria-label="${ui().map}" aria-describedby="${key}-map-help"><svg class="career-region-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${data.width} ${data.height}" width="${data.width}" height="${data.height}" role="group" aria-label="${ui().map}"><g class="career-region-map-content"><g class="career-region-boundaries" fill-rule="evenodd">${ordered.filter(region=>!mappedFeatures.get(region.id)?.city).map(featureMarkup).join('')}</g><g class="career-region-city-markers" fill-rule="evenodd">${ordered.filter(region=>mappedFeatures.get(region.id)?.city).map(featureMarkup).join('')}</g><g class="career-region-labels" aria-hidden="true">${labelMarkup}</g></g></svg></div>`;
    root.dataset.regionMapState='ready';
    root.querySelector('[data-region-map-controls]').hidden=false;
    const viewport=frame.querySelector('.career-region-map-viewport');
    labelNodes=[...frame.querySelectorAll('[data-region-label]')].map(node=>({node,id:node.dataset.regionLabel,feature:mappedFeatures.get(node.dataset.regionLabel),lines:labelLines(label(node.dataset.regionLabel))}));
    const suppressClick=()=>{ignoreMapClick=true;clearTimeout(ignoreTimer);ignoreTimer=setTimeout(()=>{ignoreMapClick=false;},350);};
    const startGesture=()=>{
      const values=[...pointers.values()];
      if(values.length>=2){
        const a=svgPoint(values[0]),b=svgPoint(values[1]),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        gesture={kind:'pinch',distance:Math.max(.01,Math.hypot(a.x-b.x,a.y-b.y)),zoom,anchor:{x:(mid.x-mapX)/zoom,y:(mid.y-mapY)/zoom}};
        gestureMoved=true;suppressClick();
      }else if(values.length){gesture={kind:'pan',point:svgPoint(values[0]),x:mapX,y:mapY};}
      else gesture=null;
    };
    listen(viewport,'pointerdown',event=>{
      if((event.pointerType==='mouse'&&event.button!==0)||pointers.has(event.pointerId))return;
      if(!pointers.size){gestureMoved=false;ignoreMapClick=false;clearTimeout(ignoreTimer);}
      pointers.set(event.pointerId,{pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,regionId:event.target.closest?.('[data-region-map-id]')?.dataset.regionMapId});
      viewport.setPointerCapture?.(event.pointerId);startGesture();event.preventDefault();
    });
    listen(viewport,'pointermove',event=>{
      const previous=pointers.get(event.pointerId);if(!previous||!gesture)return;
      pointers.set(event.pointerId,{...previous,clientX:event.clientX,clientY:event.clientY});
      const values=[...pointers.values()];
      if(gesture.kind==='pinch'&&values.length>=2){
        const a=svgPoint(values[0]),b=svgPoint(values[1]),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        zoom=Math.min(REGION_MAP_MAX_ZOOM,Math.max(1,gesture.zoom*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance));
        mapX=mid.x-gesture.anchor.x*zoom;mapY=mid.y-gesture.anchor.y*zoom;gestureMoved=true;
      }else if(gesture.kind==='pan'){
        const point=svgPoint(event),dx=point.x-gesture.point.x,dy=point.y-gesture.point.y;
        if(!gestureMoved&&Math.hypot(dx,dy)*(metrics()?.scale||1)<6)return;
        gestureMoved=true;mapX=gesture.x+dx;mapY=gesture.y+dy;
      }
      viewport.classList.add('is-panning');ignoreMapClick=true;applyView();event.preventDefault();
    });
    const endPointer=(event,cancelled=false)=>{
      const pointer=pointers.get(event.pointerId);if(!pointer)return;
      if(!cancelled&&pointers.size===1&&!gestureMoved&&pointer.regionId){
        hoveredId=pointer.regionId;toggle(pointer.regionId,'map');
        [...frame.querySelectorAll('[data-region-map-id]')].find(shape=>shape.dataset.regionMapId===pointer.regionId)?.focus({preventScroll:true});
      }
      pointers.delete(event.pointerId);
      if(viewport.hasPointerCapture?.(event.pointerId))viewport.releasePointerCapture(event.pointerId);
      if(cancelled)gestureMoved=true;
      suppressClick();startGesture();
      if(!pointers.size)viewport.classList.remove('is-panning');
    };
    listen(viewport,'pointerup',event=>endPointer(event));
    listen(viewport,'pointercancel',event=>endPointer(event,true));
    listen(viewport,'lostpointercapture',event=>endPointer(event,true));
    listen(viewport,'wheel',event=>{
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
      if(!delta)return;
      event.preventDefault();setZoom(zoom*Math.exp(-Math.max(-1000,Math.min(1000,delta))*.002),{point:svgPoint(event)});
    },{passive:false});
    resizeObserver?.disconnect();
    if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(()=>{if(!destroyed)applyView();});resizeObserver.observe(viewport);}
    applyView();updateSelection();
  }

  function render(){
    if(destroyed)return;
    const focused=root.querySelector(':focus'),focusRegion=focused?.dataset?.regionCheckbox,searchFocused=focused?.hasAttribute('data-region-search');
    const scroll=root.querySelector('.career-region-options')?.scrollTop||0;
    for(const off of bindings.splice(0))off();
    root.classList.add('career-region-picker');root.setAttribute('data-no-i18n','');
    pointers.clear();gesture=null;resizeObserver?.disconnect();
    const listMarkup=`<div class="career-region-list-panel"><label class="career-region-search-label" for="${key}-search">${ui().search}</label><input id="${key}-search" class="career-region-search" type="search" autocomplete="off" placeholder="${ui().searchHint}" data-region-search value="${E(query)}"><span class="career-region-sr-only" role="status" data-region-search-status></span><fieldset class="career-region-options"><legend class="career-region-sr-only">${ui().list}</legend>${ordered.map(region=>`<label class="career-region-option" data-region-option="${E(region.id)}"><input type="checkbox" value="${E(region.id)}" data-region-checkbox="${E(region.id)}"><span>${E(regionLabel(region,language))}</span></label>`).join('')}<p class="career-region-no-matches" data-region-no-matches hidden>${ui().noMatches}</p></fieldset></div>`;
    const mapMarkup=`<div class="career-region-map-panel"><div class="career-region-map-controls" data-region-map-controls hidden><span class="career-region-zoom" aria-label="${ui().zoom}"><span data-region-zoom-value>100%</span></span><button type="button" class="career-region-map-reset" data-region-zoom="reset">${ui().reset}</button></div><p id="${key}-map-help" class="career-region-map-help">${ui().mapHelp}</p><div data-region-map-frame class="career-region-map-frame"><p class="career-region-map-loading" role="status">${ui().loading}</p></div><p class="career-region-map-current" data-region-map-current aria-live="polite"></p></div>`;
    root.innerHTML=`<div class="career-region-picker-heading"><strong data-region-selection-status role="status" aria-live="polite"></strong><span class="career-region-legend"><i aria-hidden="true"></i>${ui().chosenLegend}</span></div><p class="career-region-federal-only" data-region-empty-selection hidden>${E(emptySelectionText?.() ?? ui().none)}</p><div class="career-region-grid">${mapFirst?mapMarkup+listMarkup:listMarkup+mapMarkup}</div>`;
    listen(root,'change',event=>{const checkbox=event.target.closest?.('[data-region-checkbox]');if(checkbox)toggle(checkbox.dataset.regionCheckbox,'list');});
    listen(root,'input',event=>{if(event.target.matches?.('[data-region-search]')){query=event.target.value;filterList();}});
    listen(root,'click',event=>{
      const zoomButton=event.target.closest?.('[data-region-zoom]');
      if(zoomButton){setZoom(1);return;}
      const shape=event.target.closest?.('[data-region-map-id]');
      if(shape&&(!ignoreMapClick||event.detail===0)){const id=shape.dataset.regionMapId;hoveredId=id;toggle(id,'map');shape.focus({preventScroll:true});}
    });
    listen(root,'keydown',event=>{
      const shape=event.target.closest?.('[data-region-map-id]'),viewport=event.target.closest?.('.career-region-map-viewport');
      if(!viewport)return;
      if(shape)activeId=shape.dataset.regionMapId;
      if(shape&&(event.key===' '||event.key==='Enter')){event.preventDefault();toggle(activeId,'map');}
      else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();
        if(shape&&!event.shiftKey)moveMapFocus(event.key);
        else{const step=60/(metrics()?.scale||1);mapX+=(event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0);mapY+=(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0);applyView();}
      }else if(shape&&['Home','End'].includes(event.key)){event.preventDefault();moveMapFocus(event.key);}
      else if(event.key==='+'||event.key==='='){event.preventDefault();setZoom(zoom*1.6,shape?{focusId:activeId}:{});}
      else if(event.key==='-'||event.key==='−'){event.preventDefault();setZoom(zoom/1.6,shape?{focusId:activeId}:{});}
      else if(event.key==='0'){event.preventDefault();setZoom(1);}
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
    getQuery:()=>query,
    setSelection(ids,{emit:shouldEmit=false}={}){if(destroyed)return;selection=new Set(sanitizeRegionSelection(ids,catalog));updateSelection();if(shouldEmit)emit('external');},
    refresh,
    destroy(){if(destroyed)return;destroyed=true;for(const off of bindings.splice(0))off();clearTimeout(ignoreTimer);resizeObserver?.disconnect();pointers.clear();gesture=null;document.removeEventListener('app:language',languageListener);root.replaceChildren();root.classList.remove('career-region-picker');delete root.dataset.regionMapState;delete root.dataset.selectedRegionCount;}
  };
}
