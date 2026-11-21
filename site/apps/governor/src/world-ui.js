/* One read-only world renderer per visible surface. DOM owns all labels/controls;
 * the canvas only draws geometry. No timer changes the simulation. */
(function(root){
'use strict';const G=root.GovernorGame,M=G.WorldModel,R=G.IllustratedWorld||G.WorldGeometry;
const instances=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(lang,ru,en)=>globalThis.GovernorGame.I18n.choose(lang,()=>(ru),()=>(en));
const icon=(n,s=18)=>G.icon(n,{size:s});
const fmt=(v,lang)=>new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(lang)).format(v);
// A turn scene shares the atlas projection. Its camera, selection and animation
// belong to this view only; re-rendering a saved decision never replays a turn.
const labels = {
  map: {ru:'Районы и события', en:'Districts and events', zh:'地区与事件'},
  region: {ru:'Новая область', en:'Novaya Oblast', zh:'新州'},
  approved: {ru:'Программа утверждена', en:'Programme approved', zh:'方案已批准'},
  construction: {ru:'Строительство началось', en:'Construction started', zh:'已开工'},
  deferred: {ru:'Год без нового проекта', en:'No new project this year', zh:'本年未启动新项目'},
  immediate: {ru:'Программа начала работу', en:'Programme launched', zh:'项目已启用'},
  activated: {ru:'Началась работа', en:'Now operating', zh:'开始运行'},
  operating: {ru:'Продолжает работу', en:'Still operating', zh:'持续运行'},
  completed: {ru:'Финансирование завершено', en:'Funding ended', zh:'资助已结束'},
  delayed: {ru:'Задержка', en:'Delayed', zh:'延期'},
  partial: {ru:'Частичное исполнение', en:'Partial delivery', zh:'部分实施'},
  overrun: {ru:'Превышена смета', en:'Over budget', zh:'超出预算'},
  target: {ru:'План запуска', en:'Target opening', zh:'计划启用'},
  districts: {ru:'Территории', en:'Districts', zh:'地区'},
  projects: {ru:'Проекты', en:'Projects', zh:'项目'},
  activity: {ru:'За год', en:'Year in review', zh:'本年变化'},
  all: {ru:'Вся область', en:'Entire region', zh:'全区'},
  local: {ru:'В районе',en:'District',zh:'本地区'},
  mobility: {ru:'Транспортная доступность',en:'Transport access',zh:'交通可达性'},
  housingAccess: {ru:'Доступность жилья',en:'Housing access',zh:'住房可及性'},
  childcareAccess: {ru:'Доступность детских садов',en:'Childcare access',zh:'托育可及性'},
  digitalProtection: {ru:'Цифровая защита',en:'Digital protection',zh:'数字防护'},
  flexWork: {ru:'Гибкая занятость',en:'Flexible work',zh:'灵活就业'},
  elderCare: {ru:'Помощь пожилым',en:'Elder care',zh:'养老服务'},
  familySupport: {ru:'Поддержка семей',en:'Family support',zh:'家庭支持'},
  healthAccess: {ru:'Доступ к медицине', en:'Health care access', zh:'医疗服务可及性'},
  schoolAccess: {ru:'Доступ к школам', en:'School access', zh:'学校可及性'},
  employment: {ru:'Занятость', en:'Employment', zh:'就业率'},
  floodProtection: {ru:'Защита от паводков', en:'Flood protection', zh:'防洪保障'},
  digitalAccess: {ru:'Доступ к цифровым услугам', en:'Digital access', zh:'数字服务可及性'}
};
function words(a,key){return M.local(labels[key],a.language);}
function momentLabel(a,e){
 const p=a.model.projects.find(p=>p.id===e.id);
 const type=e.type==='approved' && p?.structural?'construction':e.type;
 const pieces=[words(a,type)];
 if(labels[e.outcome])pieces.push(words(a,e.outcome));
 if(e.type==='approved' && e.startsIn)pieces.push(words(a,'target')+' '+(e.year+e.startsIn));
 return pieces.join(' · ');
}
function createMoment(a){
 a.host.classList.add('world-moment');
 a.window.insertAdjacentHTML('beforeend','<div class="moment-halo" aria-hidden="true" hidden></div><div class="moment-year"></div><details class="moment-index"><summary></summary><div></div></details>');
 a.window.insertAdjacentHTML('afterend','<div class="moment-caption" role="status" aria-atomic="true"></div>');
 a.halo=a.window.querySelector('.moment-halo');
 a.transition=document.createElement('img');a.transition.alt='';a.transition.className='moment-transition';a.transition.hidden=true;
 a.window.insertBefore(a.transition,a.halo);
 a.transition.addEventListener('animationend',()=>{a.transition.hidden=true;});
 a.index=a.window.querySelector('.moment-index');
 a.caption=a.host.querySelector('.moment-caption');
 // The popover stays in the normal keyboard order. Escape returns to its trigger.
 a.index.addEventListener('keydown',event=>{
   if(event.key==='Escape' && a.index.open){event.stopPropagation();a.index.open=false;a.index.querySelector('summary').focus();}
 });
 a.index.addEventListener('toggle',()=>{if(a.index.open)a.halo.classList.remove('is-changing');});
}
function selectedSite(a){
 const event=a.events[a.eventIndex];
 const project=a.model.projects.find(p=>p.id===(a.selectedProject||event?.id));
 const place=a.model.places.find(p=>p.id===(project?.districtId||a.focusId));
 return {event,project,place};
}
function metricText(a,place,project,event){
 if(!place)return '';
 const value=M.districtMetric(a.source,place.id,project?.id,event?.type);
 if(!value)return '';
 const format=new Intl.NumberFormat(G.I18n.intlLocale(a.language),{style:'percent',maximumFractionDigits:1});
 const current=format.format(value.current);
 const previous=Number.isFinite(value.before)?format.format(value.before):current;
 return words(a,value.metric)+' '+(previous===current?'':previous+' → ')+current;
}
function momentCaption(a,animate=false){
 const {event,project,place}=selectedSite(a);
 const title=event?.type==='deferred'?words(a,'deferred'):M.local(event?.title || project?.title || place?.name || labels.region,a.language);
 const where=M.local(place?.name,a.language);
 const status=event?momentLabel(a,event):project?M.local(M.STATUS[project.status],a.language):'';
 const metric=metricText(a,place,project,event);
 const sub=event||project?[where,status].filter(Boolean).join(' · '):metric;
 const observation=event && project && metric?'<small class="moment-reading">'+esc(words(a,'local')+' · '+metric)+'</small>':'';
 const visual=project?.visual;
 a.caption.innerHTML=(visual?G.IllustratedAssets.tag(visual,{className:'moment-art'}):'')+
   '<div><strong>'+esc(title)+'</strong><span>'+esc(event?.type==='deferred'?(where||words(a,'region')):sub)+'</span>'+observation+'</div>';
 if(project && a.callbacks.onProject){
   const b=document.createElement('button');b.type='button';b.innerHTML=icon('arrow',17);b.setAttribute('aria-label',title);
   b.onclick=()=>a.callbacks.onProject(project.id);a.caption.append(b);
 }
 a.halo.hidden=!project;
 a.halo.dataset.kind=event?.type||project?.status||'';
 const visualKey=JSON.stringify([project?.id,event?.type,project?.status]);
 if(a.visualKey!==visualKey||animate){
   a.transition.hidden=true;a.transition.classList.remove('leaving');
   a.halo.classList.remove('is-changing');a.visualKey=visualKey;
 }
 if(animate&&project&&!root.matchMedia('(prefers-reduced-motion: reduce)').matches){
   // One bounded pulse per accepted event. Map refresh and focus never delay input.
   void a.halo.offsetWidth;
   a.halo.classList.add('is-changing');
   if(event?.type==='activated'&&project?.structural){
     const previous=G.IllustratedAssets.image({...project,status:'delivery'},{thumb:true});
     if(previous.deliveryArtwork){
       a.transition.src=G.resolveAsset?G.resolveAsset(previous.src):previous.src;
       a.transition.hidden=false;a.transition.classList.add('leaving');
     }
   }
 }
}
function selectMoment(a,{index=-1,projectId=null,districtId=null,zoom=true,animate=false}={}){
 a.eventIndex=index;
 a.selectedProject=projectId;
 const event=a.events[index];
 const project=a.model.projects.find(p=>p.id===(projectId||event?.id));
 a.focusId=project?.districtId||districtId||event?.districtId||null;
 a.cameraTarget=zoom?(project||a.model.places.find(p=>p.id===a.focusId)):null;
 if(!a.cameraTarget){a.zoom=1;a.dx=a.dy=0;}
 renderLabels(a);
 momentCaption(a,animate);
 a.request();
}
function momentIndex(a){
 const list=a.index.querySelector('div');
 const button=(attr,value,body)=>'<button type="button" '+attr+'="'+esc(value)+'">'+esc(body)+'</button>';
 const group=(title,content)=>content?'<section><h4>'+esc(words(a,title))+'</h4>'+content+'</section>':'';
 a.index.querySelector('summary').innerHTML=icon('map',16)+'<span>'+esc(words(a,'map'))+'</span>';
 const districts=a.model.places.map(p=>button('data-moment-place',p.id,M.local(p.name,a.language))).join('');
 const entries=a.events.map((e,i)=>button('data-moment-event',i,[momentLabel(a,e),M.local(e.title,a.language)].filter(Boolean).join(' · '))).join('');
 const projects=a.model.projects.map(p=>button('data-moment-site',p.id,M.local(p.title,a.language)+' · '+M.local(M.STATUS[p.status],a.language))).join('');
 list.innerHTML=button('data-moment-overview','',words(a,'all'))+group('activity',entries)+group('districts',districts)+group('projects',projects);
 list.onclick=event=>{
   const b=event.target.closest('button');if(!b)return;
   a.index.open=false;
   if(b.hasAttribute('data-moment-overview'))selectMoment(a,{zoom:false});
   else if(b.hasAttribute('data-moment-event'))selectMoment(a,{index:Number(b.dataset.momentEvent),animate:true});
   else if(b.hasAttribute('data-moment-site'))selectMoment(a,{projectId:b.dataset.momentSite});
   else {selectMoment(a,{districtId:b.dataset.momentPlace});a.callbacks.onVisit?.(b.dataset.momentPlace);}
   a.index.querySelector('summary').focus({preventScroll:true});
 };
}
function updateMoment(a,options){
 if(!a.index)createMoment(a);
 const oldKey=a.momentKey,events=M.moments(a.source,options);
 a.events=events;
 const key=JSON.stringify([a.source.sessionId,a.source.startedAt,options.phase,a.source.turnIndex,a.model.decisions,events.map(e=>[e.id,e.type]),options.focusId]);
 a.momentKey=key;
 a.window.querySelector('.moment-year').textContent=words(a,'region')+' · '+(a.source.population.baseYear+a.source.turnIndex);
 momentIndex(a);
 if(key!==oldKey){
   const districtId=options.focusId||(!events.length?a.model.focus:null);
   selectMoment(a,{index:districtId?-1:0,districtId,zoom:!!events.length&&!options.focusId,animate:!!oldKey});
 }else{renderLabels(a);momentCaption(a);a.request();}
}
function mountMoment(host,state,language,options={}){
 return mount(host,state,language,options.callbacks||{},{...options,moment:true});
}

function create(host,callbacks){
 const api={host,callbacks,zoom:1,dx:0,dy:0,focusId:null,baseline:false,frame:null,width:0,height:0,signature:null,draws:0,disposed:false};
 host.classList.add('world-host');
 host.innerHTML='<div class="world-toolbar"></div><div class="world-window"><canvas class="world-canvas" aria-hidden="true"></canvas><svg class="world-routes" aria-hidden="true"></svg><div class="world-labels"></div><div class="world-project-pins"></div></div><div class="world-selection" aria-live="polite"></div><div class="world-key"></div><details class="world-accessible"><summary></summary><div></div></details>';
 api.canvas=host.querySelector('canvas');api.window=host.querySelector('.world-window');
 try{api.ctx=api.canvas.getContext('2d');}catch(_){api.ctx=null;}
 function request(){if(api.disposed||api.frame)return;api.frame=requestAnimationFrame(()=>{api.frame=null;draw(api);});}
 api.request=request;
 if(R.prepare)R.prepare().then(()=>{if(!api.disposed){api.signature=null;request();}});
 api.observer=new ResizeObserver(request);api.observer.observe(api.window);
 let drag=null;
 api.canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||api.zoom<=1)return;drag={x:e.clientX,y:e.clientY,dx:api.dx,dy:api.dy};api.canvas.setPointerCapture(e.pointerId);api.canvas.classList.add('dragging');});
 api.canvas.addEventListener('pointermove',e=>{if(!drag)return;api.dx=Math.max(-api.width*.48,Math.min(api.width*.48,drag.dx+e.clientX-drag.x));api.dy=Math.max(-api.height*.4,Math.min(api.height*.4,drag.dy+e.clientY-drag.y));request();});
 const end=()=>{drag=null;api.canvas.classList.remove('dragging');};api.canvas.addEventListener('pointerup',end);api.canvas.addEventListener('pointercancel',end);
 api.dispose=()=>{api.disposed=true;api.observer.disconnect();if(api.frame)cancelAnimationFrame(api.frame);api.canvas.width=1;api.faces=null;instances.delete(host);};
 return api;
}
function draw(a){
 if(a.disposed||!a.model)return;
 const rect=a.window.getBoundingClientRect();const w=Math.round(rect.width),h=Math.round(rect.height);if(w<5||h<5)return;
 const dpr=Math.min(1.5,root.devicePixelRatio||1);
 const camera=a.options.moment && a.cameraTarget;
 if(camera){
  // Centre the *visible object*, whose ground anchor is below its roof. Keep the
  // illuminated building clear of the upper controls in a narrow landscape.
  const t=R.fit(w,h),xy=R.project([camera.x,0,camera.z]);
  const isSite=!!camera.visual,fitHeight=h/(Math.max(75,isSite?139:80)*t.scale);
  a.zoom=Math.max(1,Math.min(w<520?1.75:1.55,fitHeight));
  const size=isSite?(camera.structural?128:95)*t.scale*a.zoom:0;
  a.dx=-xy[0]*t.scale*a.zoom;
  a.dy=-xy[1]*t.scale*a.zoom+Math.min(h*.28,size*.49);
 }
 const view={zoom:a.zoom,dx:a.dx,dy:a.dy};
 if(camera?.visual)view.spotlight=camera.id;
 const signature=a.model.signature+JSON.stringify(view);
 if(a.signature!==signature||w!==a.width||h!==a.height){
  a.width=w;a.height=h;a.canvas.width=Math.round(w*dpr);a.canvas.height=Math.round(h*dpr);
  if(a.ctx){
   a.ctx.setTransform(dpr,0,0,dpr,0,0);
   const before=performance.now();a.faces=R.build(a.model);
   R.paint(a.ctx,w,h,a.faces,view);a.lastPaintMs=performance.now()-before;
  }else{a.canvas.style.visibility='hidden';a.window.style.background='center / contain no-repeat url('+esc(G.resolveAsset?G.resolveAsset('assets/world/atlas.webp'):'assets/world/atlas.webp')+')';}
  a.signature=signature;a.draws++;
 }
 const v=view;
 a.host.querySelectorAll('[data-world-place]').forEach(b=>{const p=M.PLACES.find(p=>p.id===b.dataset.worldPlace);const xy=R.screen([p.x,1,p.z],w,h,v);b.style.left=xy.x+'px';b.style.top=xy.y+'px';b.style.visibility=xy.x<14||xy.x>w-14||xy.y<12||xy.y>h-18?'hidden':'visible';});
 a.host.querySelectorAll('[data-world-project]').forEach(b=>{const p=a.model.projects.find(p=>p.id===b.dataset.worldProject);if(!p)return;const xy=R.screen([p.x,1.8,p.z],w,h,v);b.style.left=xy.x+'px';b.style.top=xy.y+'px';b.style.visibility=xy.x<12||xy.x>w-12||xy.y<12||xy.y>h-12?'hidden':'visible';});
 if(a.options.moment && !a.halo.hidden){
  const {project}=selectedSite(a);
  if(project){
   const xy=R.screen([project.x,0,project.z],w,h,v);
   a.halo.style.left=xy.x+'px';a.halo.style.top=xy.y+'px';
   const scale=R.fit(w,h,v).scale;
   a.halo.style.width=Math.max(28,(project.structural?105:68)*scale)+'px';
   if(!a.transition.hidden){a.transition.style.left=xy.x+'px';a.transition.style.top=xy.y+'px';a.transition.style.width=((v.spotlight===project.id?148:112)*scale)+'px';}
  }
 }
 const routes=a.host.querySelector('.world-routes');
 routes.setAttribute('viewBox',`0 0 ${w} ${h}`);
 if(a.options.flows&&!a.baseline){
  const marker='flow-'+(a.host.id||'resident')+'-arrow';
  routes.innerHTML=`<defs><marker id="${marker}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#237da1"/></marker></defs>`+a.model.flows.map(f=>{const from=M.PLACES.find(p=>p.id===f.from),to=M.PLACES.find(p=>p.id===f.to);if(!from||!to)return'';const u=R.screen([from.x,1,from.z],w,h,v),q=R.screen([to.x,1,to.z],w,h,v);return`<path d="M${u.x},${u.y} Q${(u.x+q.x)/2+25},${(u.y+q.y)/2-18} ${q.x},${q.y}" fill="none" stroke="#237da1" stroke-width="2" stroke-dasharray="5 4" opacity=".7" marker-end="url(#${marker})"/>`;}).join('');
 }else routes.innerHTML='';
 a.host.dataset.worldReady='true';a.host.dataset.renderer=a.ctx?(R.ready?.()?'canvas2d-illustrated':'canvas2d-orthographic'):'static-accessible';a.host.dataset.worldDraws=String(a.draws);
}
function focus(a,id,zoom=true){
 const p=M.PLACES.find(p=>p.id===id);if(!p)return;
 a.focusId=id;if(zoom){a.zoom=1.65;const xy=R.project([p.x,0,p.z]),t=R.fit(a.width,a.height);a.dx=-xy[0]*t.scale*a.zoom;a.dy=-xy[1]*t.scale*a.zoom;}
 renderLabels(a);a.request();
}
function renderLabels(a){
 const lang=a.language,selected=a.focusId||a.model.focus;
 a.host.querySelector('.world-labels').innerHTML=a.model.places.map(p=>`<button type="button" data-world-place="${p.id}" class="world-place ${p.id===selected?'selected':''}" aria-label="${esc(M.local(p.name,lang))}" aria-pressed="${p.id===selected}"><span>${icon(p.icon,18)}</span><b>${esc(M.local(p.name,lang))}</b></button>`).join('');
 a.host.querySelectorAll('[data-world-place]').forEach(b=>b.addEventListener('click',()=>{if(a.options.moment){
  selectMoment(a,{districtId:b.dataset.worldPlace});a.host.querySelector('[data-world-place="'+b.dataset.worldPlace+'"]')?.focus({preventScroll:true});
 }else{focus(a,b.dataset.worldPlace,false);renderSelection(a,b.dataset.worldPlace);}
 a.callbacks.onVisit?.(b.dataset.worldPlace);}));
 // Detailed project markers are revealed at close view or through a selected place;
 // twenty construction icons must never compete with five district names.
 const visible=a.model.projects.filter(p=>p.districtId===selected);
 a.host.querySelector('.world-project-pins').innerHTML=visible.map(p=>`<button type="button" data-world-project="${esc(p.id)}" class="world-project ${p.status} ${p.partial?'partial':''}" title="${esc(M.local(p.title,lang))}" aria-label="${esc(M.local(p.title,lang))}, ${esc(M.local(M.STATUS[p.status],lang))}">${icon(p.status==='delivery'?(p.structural?'construction':'clock'):p.status==='completed'?'clock':'check',13)}</button>`).join('');
 a.host.querySelectorAll('[data-world-project]').forEach(b=>b.addEventListener('click',()=>a.callbacks.onProject?.(b.dataset.worldProject)));
}
function renderSelection(a,id){
 const p=a.model.places.find(p=>p.id===id);if(!p)return;
 const lang=a.language,now=a.model.projects.filter(o=>o.districtId===id);
 const counts={delivery:now.filter(p=>p.status==='delivery').length,active:now.filter(p=>p.status==='active').length};
 a.host.querySelector('.world-selection').innerHTML=`<div class="world-selection-copy"><small>${a.baseline?text(lang,'Начало срока · справочный вид','Start of term · reference view'):text(lang,'На этой территории','In this place')}</small><strong>${esc(M.local(p.name,lang))}</strong><span>${a.baseline?text(lang,'Ваших новых проектов ещё нет.','Your new projects have not started yet.'):`${text(lang,'Работают','Operating')}: ${counts.active} · ${text(lang,'В реализации','In delivery')}: ${counts.delivery}`}</span></div><button type="button" class="world-focus" aria-label="${text(lang,'Приблизить территорию','Zoom to this place')}">${icon('location',18)}</button>${a.baseline?'':`<button type="button" class="world-inspect">${text(lang,'Посмотреть','Inspect')} ${icon('arrow',16)}</button>`}`;
 const panel=a.host.querySelector('.world-selection');
 const recent=now.slice(-2).reverse();
 if(recent.length){panel.insertAdjacentHTML('beforeend',`<div class="world-live-strip">${recent.map(p=>`<button type="button" data-live-project="${esc(p.id)}">${G.IllustratedAssets.tag(p.visual||{src:p.visualSrc,width:256,height:256,maxDisplayWidth:84,id:''},{className:'world-live-art'})}<span><b>${esc(M.local(p.title,lang))}</b><small>${esc(M.local(M.STATUS[p.status],lang))}${p.status==='delivery'?' · '+p.startsIn+text(lang,' г.',' yr'):''}</small></span></button>`).join('')}</div>`);
 panel.querySelectorAll('[data-live-project]').forEach(b=>b.onclick=()=>a.callbacks.onProject?.(b.dataset.liveProject));}
 a.host.querySelector('.world-focus').addEventListener('click',()=>focus(a,id,true));
 a.host.querySelector('.world-inspect')?.addEventListener('click',()=>a.callbacks.onDistrict?.(id));
}
function update(a,state,language,options={}){
 a.source=state;a.language=language;a.options=options;
 a.model=M.snapshot(state,a.baseline);
 if(G.IllustratedAssets){const pending=a.model.projects.filter(p=>!G.IllustratedAssets.peek(p.visualSrc)&&!G.IllustratedAssets.failed(p.visualSrc));if(pending.length)Promise.all(pending.map(p=>G.IllustratedAssets.preload(p.visualSrc))).then(()=>{if(!a.disposed){a.signature=null;a.request();}});}
 if(a.focusId&&!M.PLACES.some(p=>p.id===a.focusId))a.focusId=null;
 if(options.moment){updateMoment(a,options);return;}
 const lang=language;
 a.host.querySelector('.world-toolbar').innerHTML=`<div class="world-view-switch" role="group" aria-label="${text(lang,'Период сравнения','Comparison period')}"><button type="button" data-world-period="now" class="${a.baseline?'':'selected'}" aria-pressed="${!a.baseline}">${text(lang,'Сейчас','Now')} · ${a.model.baseline?M.snapshot(state).year:a.model.year}</button><button type="button" data-world-period="before" class="${a.baseline?'selected':''}" aria-pressed="${a.baseline}">${text(lang,'До начала срока','Before your term')}</button></div><div class="world-tools"><button type="button" data-world-tool="portfolio" class="world-portfolio-tool" aria-label="${text(lang,'Ход проектов','Project delivery')}">${icon('construction',18)}<span>${text(lang,'Проекты','Projects')}</span></button><button type="button" data-world-tool="minus" aria-label="${text(lang,'Отдалить','Zoom out')}">−</button><button type="button" data-world-tool="plus" aria-label="${text(lang,'Приблизить','Zoom in')}">+</button><button type="button" data-world-tool="reset" aria-label="${text(lang,'Показать всю область','Show the whole region')}">${icon('map',18)}</button><button type="button" data-world-tool="photo" aria-label="${text(lang,'Сохранить вид региона','Save a regional postcard')}">${icon('download',18)}</button></div>`;
 a.host.querySelectorAll('[data-world-period]').forEach(b=>b.addEventListener('click',()=>{a.baseline=b.dataset.worldPeriod==='before';a.focusId=null;update(a,a.source,a.language,a.options);a.host.querySelector(`[data-world-period="${a.baseline?'before':'now'}"]`)?.focus({preventScroll:true});}));
 a.host.querySelectorAll('[data-world-tool]').forEach(b=>b.addEventListener('click',()=>{switch(b.dataset.worldTool){case'portfolio':a.callbacks.onPortfolio?.();return;case'plus':a.zoom=Math.min(2.4,a.zoom+.3);break;case'minus':a.zoom=Math.max(.85,a.zoom-.3);break;case'reset':a.zoom=1;a.dx=a.dy=0;a.focusId=null;renderLabels(a);renderSelection(a,a.model.focus);break;case'photo':download(a);return;}a.request();}));
 renderLabels(a);
 a.host.querySelector('.world-key').innerHTML=`${!a.ctx?`<small>${text(lang,'Упрощённый вид: Canvas недоступен. Состояния проектов доступны ниже.','Simplified view: Canvas is unavailable. Project states are listed below.')}</small>`:''}${a.options.flows?`<small class="world-flow-note">${text(lang,'Стрелки – крупнейшие внутренние переезды за год; это не новые жители.','Arrows show the largest internal moves during the year, not new residents.')}</small>`:''}<span><i class="construction"></i>${text(lang,'В реализации','In delivery')}</span><span><i class="open"></i>${text(lang,'Работает','Operating')}</span><span><i class="closed"></i>${text(lang,'Финансирование завершено','Funding ended')}</span><small>${text(lang,'Фоновая застройка – иллюстрация. Выделенные объекты – ваши программы.','Background buildings are illustrative. Highlighted sites are your programmes.')}</small>`;
 const details=a.host.querySelector('.world-accessible');details.querySelector('summary').textContent=text(lang,'Территории и проекты списком','Places and projects as a list');
 details.querySelector('div').innerHTML=`<button type="button" class="world-download-link" ${!a.ctx?'disabled':''}>${text(lang,'Сохранить вид региона PNG','Save a regional postcard PNG')}</button>`+a.model.places.map(p=>`<button type="button" data-world-access="${p.id}">${esc(M.local(p.name,lang))}</button>`).join('')+a.model.projects.map(p=>`<button type="button" data-world-project-access="${esc(p.id)}">${esc(M.local(p.title,lang))} · ${esc(M.local(M.STATUS[p.status],lang))}</button>`).join('');
 details.querySelector('.world-download-link').addEventListener('click',()=>download(a));
 a.host.querySelector('[data-world-tool=photo]').disabled=!a.ctx;
 details.querySelectorAll('[data-world-access]').forEach(b=>b.addEventListener('click',()=>{focus(a,b.dataset.worldAccess,false);renderSelection(a,b.dataset.worldAccess);a.callbacks.onVisit?.(b.dataset.worldAccess);}));
 details.querySelectorAll('[data-world-project-access]').forEach(b=>b.addEventListener('click',()=>a.callbacks.onProject?.(b.dataset.worldProjectAccess)));
 renderSelection(a,a.focusId||a.model.focus);a.request();
}
async function download(a){
 if(!a.ctx)return;
 const model=a.model,language=a.language,baseline=a.baseline;
 if(G.IllustratedAssets)await Promise.all([R.prepare?.(),...model.projects.map(p=>G.IllustratedAssets.preload(p.visualSrc))]);
 const c=document.createElement('canvas');c.width=1440;c.height=1060;const ctx=c.getContext('2d');R.paint(ctx,1440,950,R.build(model));
 ctx.fillStyle='#ffffff';ctx.fillRect(0,950,1440,110);ctx.fillStyle='#133453';ctx.font='600 30px system-ui';ctx.fillText(text(language,'Новая область','Novaya Oblast')+' · '+model.year,48,998);
 ctx.font='18px system-ui';ctx.fillStyle='#42627b';ctx.fillText(text(language,'Учебный мир · выполненные решения: ','Educational world · decisions enacted: ')+model.decisions,48,1032);
 for(const p of model.places){const xy=R.screen([p.x,1,p.z],1440,950);ctx.font='600 18px system-ui';const txt=M.local(p.name,language),w=ctx.measureText(txt).width;ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(xy.x-w/2-10,xy.y-18,w+20,29);ctx.fillStyle='#173858';ctx.fillText(txt,xy.x-w/2,xy.y+3);}
 c.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),el=document.createElement('a');el.href=url;el.download=`Novaya_Oblast_${model.year}_${baseline?'before':'now'}.png`;document.body.append(el);el.click();el.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);},'image/png');
}
function mount(host,state,language,callbacks={},options={}){
 for(const [h,a]of instances)if(!h.isConnected)a.dispose();
 let a=instances.get(host);if(!a){a=create(host,callbacks);instances.set(host,a);}else a.callbacks=callbacks;
 update(a,state,language,options);return a;
}
function refreshVisible(){for(const a of instances.values())if(a.host.isConnected)a.request();}
function disposeWithin(element){for(const [host,a]of instances)if(element.contains(host))a.dispose();}
G.WorldUI={mount,mountMoment,refreshVisible,disposeWithin,focus:(host,id)=>{const a=instances.get(host);if(!a)return;if(a.options.moment)selectMoment(a,{districtId:id});else focus(a,id,true);},diagnostics:()=>[...instances.values()].map(a=>({connected:a.host.isConnected,visible:a.width>0&&!!a.host.offsetParent,faces:a.faces?.length||0,draws:a.draws,paintMs:a.lastPaintMs,canvasPixels:a.canvas.width*a.canvas.height}))};
root.addEventListener('pagehide',()=>{for(const a of [...instances.values()])a.dispose();});
})(typeof window!=='undefined'?window:globalThis);
