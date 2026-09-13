/* One read-only world renderer per visible surface. DOM owns all labels/controls;
 * the canvas only draws geometry. No timer changes the simulation. */
(function(root){
'use strict';const G=root.GovernorGame,M=G.WorldModel,R=G.IllustratedWorld||G.WorldGeometry;
const instances=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(lang,ru,en)=>globalThis.GovernorGame.I18n.choose(lang,()=>(ru),()=>(en));
const icon=(n,s=18)=>G.icon(n,{size:s});
const fmt=(v,lang)=>new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(lang)).format(v);
function create(host,callbacks){
 const api={host,callbacks,zoom:1,dx:0,dy:0,focusId:null,baseline:false,frame:null,width:0,height:0,signature:null,draws:0,disposed:false};
 host.classList.add('world-host');
 host.innerHTML='<div class="world-toolbar"></div><div class="world-window"><canvas class="world-canvas" aria-hidden="true"></canvas><svg class="world-routes" aria-hidden="true"></svg><div class="world-labels"></div><div class="world-project-pins"></div></div><div class="world-selection" aria-live="polite"></div><div class="world-key"></div><details class="world-accessible"><summary></summary><div></div></details>';
 api.canvas=host.querySelector('canvas');api.window=host.querySelector('.world-window');api.cache=document.createElement('canvas');
 try{api.ctx=api.canvas.getContext('2d');api.cacheCtx=api.cache.getContext('2d');}catch(_){api.ctx=null;api.cacheCtx=null;}
 function request(){if(api.disposed||api.frame)return;api.frame=requestAnimationFrame(()=>{api.frame=null;draw(api);});}
 api.request=request;
 if(R.prepare)R.prepare().then(()=>{if(!api.disposed){api.signature=null;request();}});
 api.observer=new ResizeObserver(request);api.observer.observe(api.window);
 let drag=null;
 api.canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||api.zoom<=1)return;drag={x:e.clientX,y:e.clientY,dx:api.dx,dy:api.dy};api.canvas.setPointerCapture(e.pointerId);api.canvas.classList.add('dragging');});
 api.canvas.addEventListener('pointermove',e=>{if(!drag)return;api.dx=Math.max(-api.width*.48,Math.min(api.width*.48,drag.dx+e.clientX-drag.x));api.dy=Math.max(-api.height*.4,Math.min(api.height*.4,drag.dy+e.clientY-drag.y));request();});
 const end=()=>{drag=null;api.canvas.classList.remove('dragging');};api.canvas.addEventListener('pointerup',end);api.canvas.addEventListener('pointercancel',end);
 api.dispose=()=>{api.disposed=true;api.observer.disconnect();if(api.frame)cancelAnimationFrame(api.frame);api.canvas.width=api.cache.width=1;api.faces=null;instances.delete(host);};
 return api;
}
function draw(a){
 if(a.disposed||!a.model)return;
 const rect=a.window.getBoundingClientRect();const w=Math.round(rect.width),h=Math.round(rect.height);if(w<5||h<5)return;
 const dpr=Math.min(1.5,root.devicePixelRatio||1);
 if(a.signature!==a.model.signature||w!==a.width||h!==a.height){
  a.width=w;a.height=h;a.canvas.width=Math.round(w*dpr);a.canvas.height=Math.round(h*dpr);a.cache.width=a.canvas.width;a.cache.height=a.canvas.height;
  if(a.ctx&&a.cacheCtx){a.cacheCtx.setTransform(dpr,0,0,dpr,0,0);
  const before=performance.now();a.faces=R.build(a.model);R.paint(a.cacheCtx,w,h,a.faces);a.lastPaintMs=performance.now()-before;
  }else{a.canvas.style.visibility='hidden';a.window.style.background='center / contain no-repeat url(assets/world/atlas.webp)';}
  a.signature=a.model.signature;a.draws++;
 }
 if(a.ctx){a.ctx.setTransform(dpr,0,0,dpr,0,0);a.ctx.fillStyle='#d3eaf3';a.ctx.fillRect(0,0,w,h);
 const t=R.fit(w,h);a.ctx.save();a.ctx.translate(t.cx+a.dx,t.cy+a.dy);a.ctx.scale(a.zoom,a.zoom);a.ctx.drawImage(a.cache,-t.cx,-t.cy,w,h);a.ctx.restore();}
 const v={zoom:a.zoom,dx:a.dx,dy:a.dy};
 a.host.querySelectorAll('[data-world-place]').forEach(b=>{const p=M.PLACES.find(p=>p.id===b.dataset.worldPlace);const xy=R.screen([p.x,1,p.z],w,h,v);b.style.left=xy.x+'px';b.style.top=xy.y+'px';b.style.visibility=xy.x<14||xy.x>w-14||xy.y<12||xy.y>h-18?'hidden':'visible';});
 a.host.querySelectorAll('[data-world-project]').forEach(b=>{const p=a.model.projects.find(p=>p.id===b.dataset.worldProject);if(!p)return;const xy=R.screen([p.x,1.8,p.z],w,h,v);b.style.left=xy.x+'px';b.style.top=xy.y+'px';b.style.visibility=xy.x<12||xy.x>w-12||xy.y<12||xy.y>h-12?'hidden':'visible';});
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
 a.host.querySelectorAll('[data-world-place]').forEach(b=>b.addEventListener('click',()=>{focus(a,b.dataset.worldPlace,false);a.callbacks.onVisit?.(b.dataset.worldPlace);renderSelection(a,b.dataset.worldPlace);}));
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
G.WorldUI={mount,refreshVisible,disposeWithin,focus:(host,id)=>{let a=instances.get(host);if(a)focus(a,id,true);},diagnostics:()=>[...instances.values()].map(a=>({connected:a.host.isConnected,visible:a.width>0&&!!a.host.offsetParent,faces:a.faces?.length||0,draws:a.draws,paintMs:a.lastPaintMs,canvasPixels:a.canvas.width*a.canvas.height}))};
root.addEventListener('pagehide',()=>{for(const a of [...instances.values()])a.dispose();});
})(typeof window!=='undefined'?window:globalThis);
