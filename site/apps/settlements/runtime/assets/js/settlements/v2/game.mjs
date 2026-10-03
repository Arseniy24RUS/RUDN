import {World,VERSION,CATALOG,CHAPTERS,SERVICES,createState,evaluate,preview,apply,advance,undo,restore,continueFree,result,change,trend,scenarioTrend} from './engine.mjs';
import {loadRegion,DATA,json,art} from './data.mjs';
import {createStorage,download} from './storage.mjs';
import {GameMap,COLORS} from './map.mjs';
import {TERRAIN_THEMES} from './assets.mjs';
import {icon,escape as esc,num,money} from './icons.mjs';
import {committedEvent,NumberTransition,MOTION} from './motion.mjs';

/** Embeddable module. The existing platform and old save formats are not changed. */
export async function mountSettlementsGame(root,options={}){
  if(!(root instanceof HTMLElement))throw new Error('Не найден контейнер игры');
  const owner=options.owner||'guest:settlements-v2',storage=createStorage(owner),abort=new AbortController();
  let world,state,ev,map,manifest,tool='medical',serviceFocus='medical',selected=null,selectedFacility=null,routeFrom=null,currentPreview=null,allTools=false,disposed=false,busy=false,modal=null,toastTimer,winTimer,pendingImport=null;
  const serviceNames={medical:'Медицина',school:'Школа',culture:'Досуг'};
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let settings={scenic:true,sound:false,reduced:motionQuery.matches,theme:'grass'};
  try{settings={...settings,...JSON.parse(localStorage.getItem('settlements-v2:preferences')||'{}')};}catch{}
  delete settings.basemap;
  if(!Object.hasOwn(TERRAIN_THEMES,settings.theme))settings.theme='grass';
  let audio=null,progressFrame=null,commitSequence=0,audioUnlocked=false,pendingVictory=null,saveError=null;
  const audioNodes=new Set(),shownVictories=new Set(),retiredScenes=[],progressValue=new NumberTransition(),accessibleValue=new NumberTransition();
  const reduced=()=>settings.reduced||motionQuery.matches;let ownSubscriptions=0;const displayedProgress={percent:0,accessible:0,paintedAt:0};
  function listen(target,type,handler,options={}){target.addEventListener(type,handler,{...options,signal:abort.signal});ownSubscriptions++;}
  const release='2.3.0';
  const guard=()=>{if(disposed||options.getOwner&&options.getOwner()!==owner)throw new Error('Профиль изменился. Откройте игру заново.');};
  function stopAudio(){for(const {oscillator,gain} of audioNodes){try{oscillator.stop();oscillator.disconnect();gain.disconnect();}catch{}}audioNodes.clear();}
  function unlockAudio(){if(!settings.sound||document.hidden)return;try{audio||=new (window.AudioContext||window.webkitAudioContext)();audioUnlocked=true;audio.resume().catch(()=>{});}catch{}}
  function sound(success=false){if(!settings.sound||!audioUnlocked||document.hidden||disposed)return;try{stopAudio();const notes=success?[523,659,784]:[392,523];notes.forEach((n,i)=>{const oscillator=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+i*.065,node={oscillator,gain};oscillator.type='sine';oscillator.frequency.value=n;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.035,t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+.18);oscillator.connect(gain);gain.connect(audio.destination);audioNodes.add(node);oscillator.onended=()=>{audioNodes.delete(node);oscillator.disconnect();gain.disconnect();};oscillator.start(t);oscillator.stop(t+.2);});}catch{}}
  function paintProgress(){
    progressFrame=null;if(disposed||document.hidden)return;const now=performance.now(),value=progressValue.value(now),accessible=accessibleValue.value(now),fill=root.querySelector('.sg-progress-track>div'),label=root.querySelector('[data-progress-number]'),people=root.querySelector('[data-progress-accessible]');
    displayedProgress.percent=value;displayedProgress.accessible=accessible;displayedProgress.paintedAt=now;if(fill)fill.style.width=value+'%';if(label)label.textContent=state.status==='completed'?'✓':Math.round(value)+'%';if(people)people.textContent=num(accessible);
    if(progressValue.running(now)||accessibleValue.running(now))progressFrame=requestAnimationFrame(paintProgress);
  }
  function clearVictory(){clearTimeout(winTimer);winTimer=null;pendingVictory=null;}
  function queueVictory(event){
    const key=`${state.attemptId}:${state.chapter}`;if(shownVictories.has(key))return;clearVictory();pendingVictory={key,actionId:event.actionId,chapter:state.chapter,attemptId:state.attemptId};
    if(!document.hidden)winTimer=setTimeout(()=>{winTimer=null;
      // Keep an active dialog and its input; the existing completion button remains available.
      if(modal?.open){pendingVictory=null;return;}
      if(!disposed&&pendingVictory&&pendingVictory.attemptId===state.attemptId&&pendingVictory.chapter===state.chapter&&ev.complete&&state.status==='playing'){shownVictories.add(key);pendingVictory=null;victory(true);}},800);
  }
  function applyMotionPreference(){map?.setReduced(reduced());if(reduced()){progressValue.finish();accessibleValue.finish();}if(world)render();}
  function visibility(){
    if(document.hidden){cancelAnimationFrame(progressFrame);progressFrame=null;progressValue.finish();accessibleValue.finish();clearVictory();stopAudio();audio?.suspend().catch(()=>{});root.classList.add('motion-hidden');}
    else{root.classList.remove('motion-hidden');if(world)render();}
  }
  listen(motionQuery,'change',applyMotionPreference);
  listen(document,'visibilitychange',visibility);
  function retireMap(){if(!map)return;map.destroy();retiredScenes.push(map.motionEvidence());if(retiredScenes.length>3)retiredScenes.shift();}
  function clearFeedback(){clearTimeout(toastTimer);toastTimer=null;if(!saveError){const node=root.querySelector('.sg-toast');node?.classList.remove('show');node?.replaceChildren();}}
  let feedbackMessage='';
  function toast(message,type='ok',duration=3300,details=false){const node=root.querySelector('.sg-toast');if(!node)return;if(saveError&&type!=='error'){message=saveError;type='error';duration=0;details=false;}clearTimeout(toastTimer);toastTimer=null;feedbackMessage=message;node.className=`sg-toast show ${type}`;node.innerHTML=details?`<span class="sg-feedback-full">${esc(message)}</span><button class="sg-feedback-button" data-act="feedback" aria-haspopup="dialog">Итоги хода ${icon('info')}</button>`:`${icon(type==='error'?'info':'check')}<span>${esc(message)}</span>`;if(duration)toastTimer=setTimeout(()=>{toastTimer=null;if(saveError)toast(saveError,'error',0);else node.classList.remove('show');},duration);}
  function save(){try{guard();storage.save(state);const recovered=Boolean(saveError);saveError=null;if(recovered)clearFeedback();root.querySelector('[data-save]')?.setAttribute('title','Сохранено в этом браузере');if(options.host?.checkpoint)Promise.resolve(options.host.checkpoint(state)).catch(e=>toast(e.message,'error',7000));}catch(e){saveError='Прогресс не сохранён. Экспортируйте файл через меню.';toast(saveError,'error',0);}}
  function closeModal(){if(modal?.open)modal.close();modal=null;}
  function dialog(content,cls=''){
    closeModal();const d=root.querySelector('dialog');d.onclose=null;d.removeAttribute('aria-labelledby');d.removeAttribute('aria-describedby');d.className=`sg-dialog ${cls}`;d.innerHTML=`${cls.includes('sg-celebrate')&&!reduced()?'<div class="sg-confetti" aria-hidden="true">'+Array.from({length:20},(_,i)=>`<i style="--i:${i};--x:${(i*31+7)%100}%;--delay:${(i%6)*.04}s;--tilt:${i*57}deg"></i>`).join('')+'</div>':''}<button class="sg-icon-button sg-modal-close" data-act="close-modal" aria-label="Закрыть">${icon('close')}</button>${content}`;modal=d;d.showModal();return d;
  }
  function focusBackOnClose(d,origin){d.onclose=()=>{if(d.open)return;modal=null;d.replaceChildren();const target=origin?.isConnected&&origin.getClientRects().length?origin:root.querySelector('.sg-map');target?.focus({preventScroll:true});};}
  function feedback(){
    const origin=root.querySelector('[data-act="feedback"]'),message=feedbackMessage;if(!message)return;
    const d=dialog(`<div class="sg-menu-body"><h2 id="sg-feedback-title">Итоги хода</h2><p id="sg-feedback-text">${esc(message)}</p><button class="sg-primary" data-act="close-modal">На карту ${icon('arrow')}</button></div>`,'sg-feedback-dialog');d.setAttribute('aria-labelledby','sg-feedback-title');d.setAttribute('aria-describedby','sg-feedback-text');focusBackOnClose(d,origin);
  }
  function snapshot(){return {version:VERSION,uiVersion:release,scene:settings.scenic,theme:settings.theme,region:world?.region,owner,state:state?structuredClone(state):null,progress:ev?.progress,focus:ev?.focus,selected,tool,ready:!!map&&!disposed,motion:{reduced:reduced(),hidden:document.hidden,disposed,progress:{displayed:displayedProgress.percent,renderedRatio:displayedProgress.percent/100,paintedAt:displayedProgress.paintedAt,target:progressValue.target,active:progressValue.running(performance.now()),accessibleDisplayed:displayedProgress.accessible,accessibleTarget:accessibleValue.target},audio:{activeNodes:audioNodes.size*2,unlocked:audioUnlocked,state:audio?.state||'uninitialized'},timers:{victory:Boolean(winTimer),toast:Boolean(toastTimer)},ownSubscriptions,retiredScenes:structuredClone(retiredScenes)}};}
  function setupShell(){
    root.className='sg-game';root.dataset.uiVersion=release;root.innerHTML=`
    <div class="sg-map" role="application" aria-label="Карта населённых пунктов. Выберите точку или найдите поселение через меню."></div>
    <header class="sg-header"><div class="sg-brand"><span class="sg-brand-mark">${icon('map')}</span><div class="sg-brand-copy"><h1>Система расселения</h1><div class="sg-region"></div></div><div class="sg-toast" role="status" aria-live="polite" aria-atomic="true"></div></div><div class="sg-header-actions"><button class="sg-icon-button sg-undo" data-act="undo" aria-label="Отменить последний ход" title="Отменить ход">${icon('back')}</button><button class="sg-icon-button" data-act="menu" aria-label="Меню игры">${icon('menu')}</button></div></header>
    <div class="sg-info-column"><section class="sg-mission" aria-label="Текущее поручение"></section><div class="sg-dock"><div class="sg-inspector"></div><div class="sg-action-hint" aria-live="polite"></div></div></div>
    <aside class="sg-map-controls" aria-label="Управление картой"><button class="sg-icon-button" data-act="search" title="Найти поселение" aria-label="Найти поселение">${icon('search')}</button><button class="sg-icon-button" data-act="focus" title="Зона поручения" aria-label="Показать зону поручения">${icon('focus')}</button><button class="sg-icon-button" data-act="region" title="Весь регион" aria-label="Показать весь регион">${icon('map')}</button><div class="sg-zoom"><button class="sg-icon-button" data-act="zoom-in" aria-label="Приблизить карту">${icon('plus')}</button><button class="sg-icon-button" data-act="zoom-out" aria-label="Отдалить карту">${icon('minus')}</button></div></aside>
    <div class="sg-legend"><span><i style="background:${COLORS.grow}"></i>рост</span><span><i style="background:${COLORS.stable}"></i>стабильно</span><span><i style="background:${COLORS.decline}"></i>убыль</span><button data-act="help" aria-label="Обозначения карты">${icon('info')}</button></div>
    <nav class="sg-tools" aria-label="Объекты и маршруты"></nav>
    <div class="sg-map-caption"><button data-act="help" title="Графика условная; дороги и точки — из исходного набора">Учебная карта ${icon('info')}</button></div>
    <dialog></dialog><input type="file" class="sg-import" accept="application/json,.json" hidden>
    <div class="sg-loading"><img src="${art('O-01-ready')}" alt=""><h2>Открываем регион</h2><p>Населённые пункты появятся на карте</p><span class="sg-loader"></span></div>`;
    root.querySelector('.sg-region').textContent=world.region.name;
    listen(root,'click',guardConfirmGesture,{capture:true});listen(root,'dblclick',guardConfirmGesture,{capture:true});
    listen(root,'click',onClick);listen(root,'change',onChange);listen(root,'input',onInput);
    listen(root.querySelector('.sg-import'),'change',importFile);
    listen(document,'keydown',onKey);
    listen(root.querySelector('dialog'),'click',e=>{if(e.target===e.currentTarget){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
  }
  function render(commit=null){
    if(!world||disposed)return;const chapter=CHAPTERS[state.chapter],isDone=state.status==='completed',free=state.status==='free',service=activeService(),regional=ev.services[service],missionService=state.chapter===2?(SERVICES.find(k=>ev.focus[k].ratio<.7||ev.focus[k].settlementRatio<.65)||chapter.service):chapter.service,s=free?{...regional,covered:regional.fullyServed,total:regional.settlements}:ev.focus[missionService],targetPeople=Math.ceil(s.population*chapter.threshold),targetCount=Math.ceil(s.total*chapter.settlementThreshold),remainingPeople=Math.max(0,targetPeople-s.accessible),remainingCount=Math.max(0,targetCount-s.covered);
    const next=`Ещё ${num(remainingPeople)} жит. · ${remainingCount} пос.`;
    const progress=Math.round(ev.progress*100),displayProgress=free?Math.round((s.population?s.accessible/s.population:0)*100):isDone?100:progress,now=performance.now();progressValue.set(displayProgress,now,reduced()||document.hidden);accessibleValue.set(s.accessible,now,reduced()||document.hidden);cancelAnimationFrame(progressFrame);
    root.querySelector('.sg-mission').innerHTML=`<div class="sg-mission-top"><div class="sg-chapters" aria-label="Поручение ${state.chapter+1} из 3">${CHAPTERS.map((c,i)=>`<span class="${i<state.chapter||isDone||free?'done':i===state.chapter?'current':''}" title="${c.title}">${i<state.chapter||isDone||free?icon('check'):i+1}</span>`).join('')}<span class="sg-chapter-label">${free?'Свободная игра':isDone?'Поручение выполнено':chapter.title}</span></div><div class="sg-budget" data-save><strong>${money(state.budget)}</strong><span>бюджет</span></div></div>
    <div class="sg-task-title">${free?'Развивайте сеть по всему региону':isDone?'Ваша первая сеть работает':chapter.task}</div>
    <div class="sg-goal-requirements">${free?`<strong>${serviceNames[service]} · регион</strong><span><b data-progress-accessible>${num(accessibleValue.value(now))}</b> жителей с доступом · ${s.covered}/${s.total} поселений</span>`:isDone?'Все три поручения выполнены':state.chapter===2?`<strong>Все услуги · ${serviceNames[missionService]}: ещё</strong><span>${num(remainingPeople)} ${plural(remainingPeople,'житель','жителя','жителей')} · ${remainingCount} ${plural(remainingCount,'поселение','поселения','поселений')}</span>`:`Нужно: <span>${num(targetPeople)} ${plural(targetPeople,'житель','жителя','жителей')} · ${targetCount} ${plural(targetCount,'поселение','поселения','поселений')}</span>`}</div>
    <div class="sg-progress-line"><div class="sg-progress-track" role="progressbar" aria-label="${free?'Доля жителей региона с доступом: '+serviceNames[service]:'Выполнение поручения'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${displayProgress}"><div style="width:${progressValue.value(now)}%"></div></div><span data-progress-number>${isDone?'✓':Math.round(progressValue.value(now))+'%'}</span></div>
    <div class="sg-task-bottom">${free?'':`<span>В зачёте${state.chapter===2?' · '+serviceNames[missionService]:''}: ${s.covered} из ${s.total} поселений · <b data-progress-accessible style="font-weight:inherit">${num(accessibleValue.value(now))}</b> жителей с доступом</span>`}${ev.complete&&state.status==='playing'?'<button data-act="victory">Завершить '+icon('arrow')+'</button>':`<button data-act="focus">${free?'К поручению':isDone?'К результату':next}${icon('focus')}</button>`}</div>`;
    paintProgress();
    const kinds=allTools?['medical','school','culture','bus','outreach']:['medical','bus',...(state.chapter>=1?['school']:[]),...(state.chapter>=2?['culture']:[])];
    root.querySelector('.sg-tools').dataset.count=String(kinds.length+(allTools?0:1));
    root.querySelector('.sg-tools').innerHTML=kinds.map(k=>`<button class="sg-tool ${tool===k?'active':''}" data-tool="${k}" aria-pressed="${tool===k}"><img src="${art(CATALOG[k].art,128)}" alt=""><strong>${k==='culture'?'Центр':k==='outreach'?'Выезды':CATALOG[k].name}</strong><span>${k==='bus'?'соединить':'от '+money(CATALOG[k].cost)}</span></button>`).join('')+(!allTools?`<button class="sg-tool sg-more" data-act="more" aria-label="Все инструменты">${icon('more')}<strong>Ещё</strong><span>объекты</span></button>`:'');
    root.querySelector('.sg-undo').disabled=!state.actions.length;root.querySelector('.sg-legend').classList.toggle('hidden',!!selected);
    root.classList.toggle('has-selection',!!selected);root.classList.toggle('has-preview',!!currentPreview);root.classList.toggle('is-free',free);root.classList.toggle('scenic-mode',settings.scenic);root.classList.toggle('reduced-motion',reduced());
    renderInspector();map?.update({state,evaluation:ev,selected,preview:currentPreview,tool,routeFrom,service:free?activeService():commit?.service||activeService(),commit});
  }
  function rememberService(kind){const service=kind==='outreach'?'medical':kind;if(!SERVICES.includes(service))return;serviceFocus=service;try{sessionStorage.setItem(`settlements-v2:service:${owner}:${state.regionId}`,service);}catch{}}
  function restoreService(){serviceFocus=CHAPTERS[state.chapter].service;try{const saved=sessionStorage.getItem(`settlements-v2:service:${owner}:${state.regionId}`);if(SERVICES.includes(saved))serviceFocus=saved;}catch{}}
  function activeService(){const f=state.facilities.find(f=>f.id===selectedFacility);return f?(f.type==='outreach'?'medical':f.type):SERVICES.includes(tool)?tool:tool==='outreach'?'medical':state.status==='free'?serviceFocus:CHAPTERS[state.chapter].service;}
  function setHint(text){root.querySelector('.sg-action-hint').innerHTML=`<span class="sg-hint-dot"></span>${esc(text)}`;}
  function renderInspector(){
    const target=root.querySelector('.sg-inspector');
    if(!selected){target.innerHTML='';setHint(tool==='bus'?'Выберите первое поселение для маршрута':tool?`Выберите ${tool==='outreach'?'поселение для выездов':'место для '+(tool==='medical'?'клиники':tool==='school'?'школы':'центра')}`:'Коснитесь поселения, чтобы узнать о нём');return;}
    const row=world.row(selected);if(!row){target.innerHTML='';return;}
    const d=change(row),tr=trend(row),trLabel=d===null?'динамика неизвестна':`${d>0?'↑':d<0?'↓':'→'} ${Math.abs(d).toFixed(1).replace('.',',')}% с 2010 г.`;
    let body='',secondary='';const q=currentPreview;
    if(q){
      const previewService=state.status==='free'?activeService():q.service,impacted=q.gains?.[previewService]?.ids?.length||0,gain=(state.status==='free'?q.gains?.[previewService]?.people:q.people)||0;
      const focusAfter=q.evaluation?.focus[q.service],focusBefore=ev.focus[q.service];
      body=`<div class="sg-preview-impact ${gain?'':'quiet'}"><div><span class="sg-preview-object-name">${selectedFacility?'Расширение · ':''}${esc(CATALOG[tool||state.facilities.find(f=>f.id===selectedFacility)?.type||'medical'].name)}</span><strong>${gain?'+'+num(gain)+' жителей':'Новых получателей пока нет'}</strong><span>${gain?`Доступ улучшится в ${impacted} пос. региона`:q.ok?'Сравните другое место или добавьте подвоз':''}</span>${focusAfter&&state.status==='playing'?`<span>В зачёте поручения · ${serviceNames[q.service]}: ${focusBefore.covered} → ${focusAfter.covered} пос.</span>`:''}</div>${q.path?`<div class="sg-route-time">≈ ${num(q.minutes)}<small>мин</small></div>`:''}</div>`;
      const losses=SERVICES.filter(k=>(q.losses?.[k]?.people||0)>0);
      if(losses.length)body+=`<div class="sg-loss-note">${icon('info')} Потеря доступа: ${losses.map(k=>`${k==='medical'?'медицина':k==='school'?'школа':'досуг'} −${num(q.losses[k].people)}`).join('; ')} чел.</div>`;
      const duplicate=q.action.type==='build'&&state.facilities.find(f=>f.at===q.action.at&&f.type===q.action.kind);
      if(!q.ok&&q.reason)body+=`<div class="sg-refusal-note">${esc(duplicate?.level>=3?'Объект уже есть. Максимальный уровень — 3.':q.reason)}</div>`;
      if(!state.focus.includes(row.id))secondary+='<div class="sg-scope-note">Вне поручения · строительство доступно</div>';
      if(row.population<500&&tool&&tool!=='bus')secondary+='<div class="sg-staff-note">Персонал включён в цену · строительство доступно</div>';
      if(q.path)secondary+=`<div class="sg-route-names">${esc(world.row(routeFrom)?.name)} ${icon('arrow')} ${esc(row.name)}</div>`;
      const label=tool==='bus'?'Запустить маршрут':selectedFacility?'Расширить':tool==='outreach'?'Организовать выезды':'Построить';
      body+=`<button class="sg-primary sg-confirm" data-act="confirm" ${q.ok&&!busy?'':'disabled'}>${esc(q.cost!==undefined?label:'Недоступно')} <span>${q.cost!==undefined?money(q.cost):''}</span>${icon('arrow')}</button>`;
    }else if(tool==='bus'){
      body=`<div class="sg-select-second"><span class="sg-stop-dot"></span><strong>${esc(row.name)}</strong><span class="sg-dotted-line"></span>${icon('pin')}</div><p class="sg-short-help">Теперь коснитесь второго поселения</p>`;
    }else{
      const facilities=state.facilities.filter(f=>f.at===row.id);
      body=facilities.length?facilities.map(f=>{const u=ev.facilityUsage[f.id];return `<button class="sg-facility-row" ${f.level<3?`data-facility="${f.id}"`:'data-act="details"'}><img src="${art(CATALOG[f.type].art,128)}" alt=""><span><strong>${esc(CATALOG[f.type].name)}</strong><small>Занято ${u?Math.round(u.used/u.capacity*100):0}% мощности · уровень ${f.level}</small>${f.level>=3?'<small>Максимальный уровень</small>':''}</span><span class="sg-upgrade-tag">${f.level<3?'Расширить '+icon('plus'):icon('info')}</span></button>`;}).join(''):`<button class="sg-primary" data-tool="${CHAPTERS[state.chapter].service}">Построить здесь ${icon('plus')}</button>`;
      const scenario=scenarioTrend(row,ev,row.index);if(scenario.improvement>.01)body+=`<div class="sg-scenario-effect">${icon('check')} Сценарий: ${scenario.scenario<0?'сокращение замедляется':'условия для роста улучшились'}</div>`;
    }
    target.innerHTML=`<div class="sg-settlement-title"><div><h2>${esc(row.name)}</h2><div class="sg-demography"><span>${num(row.population||0)} жителей</span><span class="${tr}">${esc(trLabel)}</span></div></div><button class="sg-icon-button" data-act="details" aria-label="Характеристики поселения">${icon('info')}</button><button class="sg-icon-button" data-act="deselect" aria-label="Закрыть выбор">${icon('close')}</button></div>${q?`<div class="sg-inspector-scroll">${secondary}</div><div class="sg-inspector-actions">${body}</div>`:`<div class="sg-inspector-scroll">${body}</div>`}`;
    setHint(tool==='bus'?(routeFrom===selected?'Второе нажатие — конечная остановка':'Сравните маршрут и подтвердите'):q?'Коснитесь другого поселения, чтобы сравнить':row.population<500?'Малое поселение · строительство доступно':'Выберите объект или маршрут');
  }
  function plural(n,a,b,c){return n%10===1&&n%100!==11?a:[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?b:c;}
  function updatePreview(){
    currentPreview=null;if(!selected)return;
    let action=null;
    if(selectedFacility)action={type:'upgrade',id:selectedFacility};
    else if(tool==='bus'&&routeFrom&&selected!==routeFrom)action={type:'route',from:routeFrom,to:selected};
    else if(tool&&tool!=='bus')action={type:'build',kind:tool,at:selected};
    if(action){try{currentPreview={...preview(world,state,action,ev),action};}catch(e){toast('Не удалось рассчитать вариант: '+e.message,'error');}}
  }
  function selectRow(row,facilityId,alternatives=[]){
    if(disposed)return;guard();clearFeedback();
    if(alternatives.length){
      const d=dialog(`<div class="sg-menu-body"><h2 id="sg-choice-title">Выберите поселение</h2><p id="sg-choice-note">В исходных данных эти поселения находятся в одной точке.</p><div class="sg-search-results sg-choice-list">${[row,...alternatives].map(r=>`<button data-place="${esc(r.id)}"><strong>${esc(r.name)}</strong><span>${num(r.population||0)} чел.</span></button>`).join('')}</div><button class="sg-text-button" data-act="close-modal">Отмена</button></div>`,'sg-place-choice');d.setAttribute('aria-labelledby','sg-choice-title');d.setAttribute('aria-describedby','sg-choice-note');focusBackOnClose(d,root.querySelector('.sg-map'));d.querySelector('[data-place]')?.focus();return;
    }
    selected=row.id;selectedFacility=null;
    if(tool==='bus'){if(!routeFrom)routeFrom=row.id;}
    else if(facilityId&&(!tool||state.facilities.find(f=>f.id===facilityId)?.type===tool)){tool=null;selectedFacility=facilityId;}
    if(selectedFacility)rememberService(state.facilities.find(f=>f.id===selectedFacility)?.type);updatePreview();render();
  }
  function setTool(kind){
    if(!CATALOG[kind])return;clearFeedback();selectedFacility=null;tool=kind;rememberService(kind);routeFrom=kind==='bus'?selected:null;updatePreview();render();
  }
  function deselect(){selected=null;selectedFacility=null;routeFrom=null;currentPreview=null;render();}
  async function confirm(){
    if(busy||!currentPreview?.ok)return;guard();busy=true;const action=currentPreview.action,before=state,oldEvaluation=ev;let event=null;
    try{state=apply(world,state,action);ev=evaluate(world,state);event=committedEvent(world,before,oldEvaluation,state,ev,action,++commitSequence);event.committedAt=performance.now();save();sound();
      const names={medical:'Медицина',school:'Школа',culture:'Досуг'},changed=SERVICES.filter(s=>event.changes[s].length),net=event.people,losses=SERVICES.filter(s=>event.losses[s]>0);
      let message=changed.length?changed.map(s=>event.access[s].net===0?`${names[s]}: охват без изменений`:`${names[s]}: ${event.access[s].net>0?'+':''}${num(event.access[s].net)} чел. с доступом`).join(' · '):action.type==='route'?'Маршрут работает. Новых получателей пока нет.':'Объект готов. Новых получателей пока нет.';
      if(losses.length)message+=' Потери охвата: '+losses.map(s=>`${names[s].toLocaleLowerCase('ru')} −${num(event.losses[s])} чел.`).join('; ');
      toast(message,losses.length?'note':net>0?'ok':'note',state.turn===1?5000:3800,changed.length>1||losses.length>0);
      rememberService(activeService());routeFrom=null;tool=null;currentPreview=null;selected=null;selectedFacility=null;
      if(!oldEvaluation.complete&&ev.complete&&state.status==='playing')queueVictory(event);
    }catch(e){toast(e.message,'error');}finally{busy=false;render(event);}
  }
  function victory(celebrate=false){
    clearVictory();
    if(state.status==='completed'||state.status==='free')return finalResult();if(!ev.complete)return;
    const ch=CHAPTERS[state.chapter],scope=ev.focus[ch.service],final=state.chapter===2;
    dialog(`<div class="sg-victory-art"><img src="${art(ch.art,ch.art==='F-03'?960:960)}" alt="${esc(ch.title)}"><div class="sg-victory-seal">${icon('check')}</div></div><div class="sg-victory-body"><div class="sg-stars">${[0,1,2].map(i=>`<span class="${i<=state.chapter?'won':''}">${icon('star')}</span>`).join('')}</div><h2>${final?'У вас получилось!':state.chapter===0?'Первый центр работает!':'Школьная сеть готова!'}</h2><p>${state.chapter===0?'Вы создали межпоселенческий центр для группы поселений в локальном сценарии. ':''}${esc(ch.insight)}</p><div class="sg-win-stats"><div><strong>${num(scope.accessible)}</strong><span>жителей с доступом</span></div><div><strong>${scope.covered}</strong><span>поселений</span></div></div><button class="sg-primary" data-act="next">${final?'Завершить поручение':'Следующее поручение'}<span>${final?icon('trophy'):'+'+money(ch.reward)}</span>${icon('arrow')}</button><button class="sg-text-button" data-act="close-modal">Посмотреть на карту</button></div>`,celebrate?'sg-victory sg-celebrate':'sg-victory');if(celebrate)sound(true);
  }
  async function next(){
    clearVictory();
    try{guard();state=advance(world,state);ev=evaluate(world,state);save();closeModal();deselect();tool=CHAPTERS[state.chapter].service;render();
      if(state.status==='completed'){
        const verified=restore(world,state,{owner}),report=result(world,verified);
        if(options.onComplete)try{await options.onComplete(report,verified);}catch(e){toast('Результат сохранён локально. Передать его не удалось.','error',7000);}
        finalResult();
      }else{map.fitFocus();toast(state.chapter===1?'Теперь школа. Уже созданные маршруты сохраняются.':'Добавьте место для встреч и досуга.', 'ok',4500);}
    }catch(e){toast(e.message,'error');}
  }
  function finalResult(){
    clearVictory();
    const r=result(world,state);dialog(`<div class="sg-victory-art"><img src="${art('F-03',960)}" alt="Работающая сеть поселений"><div class="sg-victory-seal">${icon('trophy')}</div></div><div class="sg-victory-body"><div class="sg-stars">${[0,1,2].map(()=>`<span class="won">${icon('star')}</span>`).join('')}</div><h2>Ваша первая победа</h2><p>Вы создали сеть услуг для группы поселений в локальном сценарии. Решения остались на карте.</p><div class="sg-win-stats"><div><strong>${r.facilities}</strong><span>объектов</span></div><div><strong>${r.routes}</strong><span>маршрутов</span></div><div><strong>${r.points}/${r.maxPoints}</strong><span>игровой балл</span></div></div><button class="sg-primary" data-act="free">Развивать весь регион ${icon('arrow')}</button><button class="sg-text-button" data-act="export-result">Сохранить результат</button><small class="sg-local-note">${options.onComplete?'Локальная проверка действий выполнена.':'Игровой балл — не оценка знаний. В учебный журнал он не отправляется.'}</small></div>`,'sg-victory');
  }
  function menu(){
    dialog(`<div class="sg-menu-body"><h2>Ваш регион</h2><p class="sg-menu-region">${esc(world.region.name)} <span>${num(world.rows.length)} поселений на карте</span></p><label class="sg-search">${icon('search')}<input data-search placeholder="Найти населённый пункт" aria-label="Найти населённый пункт" autocomplete="off"></label><div class="sg-search-results"></div><div class="sg-menu-grid"><button data-act="focus-close">${icon('focus')} К поручению</button><button data-act="region-close">${icon('map')} Весь регион</button><button data-act="export">${icon('save')} Сохранить в файл</button><button data-act="import">${icon('back')} Загрузить файл</button><button data-act="help">${icon('info')} Обозначения</button><button data-act="more-close">${icon('plus')} Все инструменты</button></div><div class="sg-preferences"><label><span>Художественная карта</span><input type="checkbox" data-setting="scenic" ${settings.scenic?'checked':''}></label><label><span>Звук действий</span><input type="checkbox" data-setting="sound" ${settings.sound?'checked':''}></label><label><span>Меньше анимации</span><input type="checkbox" data-setting="reduced" ${settings.reduced?'checked':''}></label></div>${options.lockRegion?'':`<details class="sg-region-choice"><summary>Другая территория</summary><select class="sg-region-select" aria-label="Выбрать регион">${manifest.regions.map(r=>`<option value="${r.id}" ${r.id===state.regionId?'selected':''}>${esc(r.name)}</option>`).join('')}</select><button class="sg-secondary" data-act="new-region">Начать в выбранном регионе</button></details>`}<button class="sg-text-button" data-act="licenses">Источники и лицензии</button><button class="sg-text-button sg-reset" data-act="restart">Начать поручение заново</button><p class="sg-version">Интерфейс ${release} · сохранение в этом браузере</p></div>`);
    root.querySelector('.sg-preferences').insertAdjacentHTML('beforeend',`<label class="sg-theme-setting"><span>Оформление карты</span><select data-setting="theme" aria-describedby="sg-theme-note">${Object.entries(TERRAIN_THEMES).map(([value,label])=>`<option value="${value}" ${settings.theme===value?'selected':''}>${label}</option>`).join('')}</select></label><p class="sg-theme-note" id="sg-theme-note">Только оформление — не климат или сезон.</p>`);
  }
  function licenses(){
    const origin=root.querySelector('[data-act="menu"]');
    const d=dialog(`<div class="sg-menu-body sg-license-body"><h2 id="sg-licenses-title">Источники и лицензии</h2><p>Геометрия дорог и границ: © OpenStreetMap contributors. Данные доступны по Open Database License (ODbL 1.0); региональные выгрузки — Geofabrik. Линии упрощены для учебной карты.</p><div class="sg-license-links"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap: авторы и лицензия</a><a href="https://www.geofabrik.de/data/download.html" target="_blank" rel="noopener noreferrer">Geofabrik: происхождение выгрузок</a></div><p>Численность, исторические значения и координаты — из предоставленного набора проекта. Сопоставимость переписей и границ отдельно не подтверждена. Автобусы используют учебный граф соседних поселений.</p><p>Дома, деревья и текстуры — условное оформление, а не сведения о реальной застройке. Новым изображениям и демографическим данным общая открытая лицензия не назначается.</p><div class="sg-license-links"><a href="assets/vendor/leaflet-1.9.4/LICENSE" target="_blank" rel="noopener noreferrer">Leaflet 1.9.4 — BSD-2-Clause</a><a href="assets/img/settlements/phosphor/LICENSE" target="_blank" rel="noopener noreferrer">Phosphor Icons — MIT</a></div><button class="sg-primary" data-act="menu">В меню ${icon('arrow')}</button></div>`);
    d.setAttribute('aria-labelledby','sg-licenses-title');d.scrollTop=0;focusBackOnClose(d,origin);
  }
  function help(){
    dialog(`<div class="sg-menu-body"><h2>Карта говорит сама</h2><div class="sg-help-item"><div class="sg-size-example"><i></i><i></i><i></i></div><div><strong>Размер — население</strong><p>Поселения до 500 жителей показаны небольшими точками. Все точки доступны для выбора и строительства. Шкала размеров сжата, чтобы крупные города не закрывали соседние точки.</p></div></div><div class="sg-help-item"><div class="sg-color-example"><i></i><i></i><i></i></div><div><strong>Цвет — динамика населения</strong><p>Рост, относительная стабильность (±3%) и убыль. Сравнение значений 2010 и 2021 гг. по правилам исходного проекта. Серый — нет сопоставимой динамики.</p></div></div><div class="sg-help-item"><div class="sg-ring-example"></div><div><strong>Контур — доступ к услуге</strong><p>Контур заполняется, когда жители получают доступ к выбранной услуге. Пунктир при примеривании показывает ожидаемый результат. Поселение засчитывается при доступе не менее 80%. Улучшение доступа ещё не означает зачёт.</p></div></div><div class="sg-help-item"><img src="${art('O-09',128)}" alt=""><div><strong>Маршрут связывает поселения</strong><p>Выберите автобус, затем две точки. Автобус пользуется существующей мощностью объектов; при перегрузке нужна дополнительная мощность. Объект можно расширять до уровня 3.</p></div></div><div class="sg-help-item"><div><strong>Два условия поручения</strong><p>Нужны одновременно указанные число жителей с доступом и число зачтённых поселений в зоне поручения. В третьем поручении обе цели выполняются отдельно по каждой услуге: медицине, школе и досугу.</p></div></div><details class="sg-model-note"><summary>Об учебных условностях и данных</summary><p>На карте сохранены все поселения выбранного региона из приложенного набора. Короткое поручение относится к отмеченной группе поселений; остальные остаются доступны.</p><p>Бюджет и цены показаны в млн ₽. Цена включает создание и работу решения на сопоставимом учебном периоде. Все цены, мощность, потребность в персонале и граница 500 жителей — параметры игры, не строительные сметы и не нормативные запреты.</p><p>Исходная база не подтверждает действительное отсутствие школ или клиник. Дефициты услуг заданы сценарием. Школьная нагрузка рассчитана по условной доле детей 16%, без утверждения о составе реального населения.</p><p>Дома и растительность в художественном режиме — условные обозначения, собранные из исходных изображений. Они не подтверждают наличие конкретного здания, леса или рельефа. Режим отключается в меню без изменения расчётов.</p><p>Геометрия дорог взята из приложенного слоя OSM. Пунктирные автобусные линии и расчётные минуты основаны на отдельной учебной сети ближайших поселений. Реальные проезды, паромы и ограничения движения не проверены.</p><p>Сценарный эффект услуг ограничен +0,54 процентного пункта к условному среднегодовому темпу. Исторические данные, цвет исторической динамики и размеры точек не переписываются. Сценарная траектория не является прогнозом.</p><p>Автор проекта: А. М. Ситковский. Исходные данные сохранены из поставленного комплекта. Иллюстрации обновлены для версии 2.2 и не изображают реальные здания. Лицензии и происхождение приложены к архиву.</p></details><button class="sg-primary" data-act="close-modal">Вернуться на карту ${icon('arrow')}</button></div>`);
  }
  function details(){
    if(!selected)return;const row=world.row(selected),d=change(row),sc=scenarioTrend(row,ev,row.index),inFocus=state.focus.includes(row.id);
    dialog(`<div class="sg-menu-body"><h2>${esc(row.name)}</h2><p class="sg-menu-region">${esc(row.municipality||world.region.name)}</p><div class="sg-detail-values"><div><span>Население, 2010</span><strong>${Number.isFinite(row.population2010)?num(row.population2010):'нет данных'}</strong></div><div><span>Население, 2021*</span><strong>${num(row.population||0)}</strong></div><div><span>Изменение</span><strong>${d===null?'не рассчитано':(d>0?'+':'')+d.toFixed(1).replace('.',',')+'%'}</strong></div><div><span>Роль в поручении</span><strong>${inFocus?'Входит в зону':'Вне зоны'}</strong></div></div>${row.population<500?'<p class="sg-info-note">Малое поселение. Крупный объект потребует дополнительных расходов на привлечённый персонал. Строительство остаётся доступным.</p>':''}<h3>Доступность в игре</h3>${SERVICES.map(s=>{const e=ev.services[s],share=e.need[row.index]?e.served[row.index]/e.need[row.index]:0;return `<div class="sg-access-row"><span>${esc(CATALOG[s].name)}</span><div><i style="width:${Math.round(share*100)}%;background:${COLORS[s]}"></i></div><strong>${Math.round(share*100)}%</strong></div>`;}).join('')}${sc.improvement>0?`<div class="sg-info-note"><strong>Учебная траектория</strong><p>${sc.historical.toFixed(2).replace('.',',')}% → ${sc.scenario.toFixed(2).replace('.',',')}% в год. Небольшой условный эффект услуг; исторические значения не изменены.</p></div>`:''}<small class="sg-source-note">* Поле Population_2020 интерпретируется как 2021 год по принятому в исходном проекте правилу. Территориальная сопоставимость исходного ряда не подтверждена. Нулевое значение 2010 г. не используется как база расчёта процентов.</small><button class="sg-primary" data-act="close-modal">На карту ${icon('arrow')}</button></div>`);
  }
  function onInput(e){
    if(!e.target.matches('[data-search]'))return;const q=e.target.value.trim().toLocaleLowerCase('ru'),list=root.querySelector('.sg-search-results');if(q.length<2){list.innerHTML='';return;}
    const matches=world.rows.filter(r=>r.name.toLocaleLowerCase('ru').includes(q)).sort((a,b)=>Number(b.name.toLocaleLowerCase('ru').startsWith(q))-Number(a.name.toLocaleLowerCase('ru').startsWith(q))||b.population-a.population).slice(0,24);
    list.innerHTML=matches.length?matches.map(r=>`<button data-place="${esc(r.id)}"><span><strong>${esc(r.name)}</strong><small>${esc(r.municipality||'')}</small></span><span>${num(r.population||0)} чел.</span></button>`).join(''):'<p>Поселение не найдено</p>';
  }
  function onChange(e){const key=e.target.dataset.setting;if(!key)return;if(key==='theme'){if(!Object.hasOwn(TERRAIN_THEMES,e.target.value))return;settings.theme=e.target.value;}else if(['scenic','sound','reduced'].includes(key))settings[key]=e.target.checked;else return;try{localStorage.setItem('settlements-v2:preferences',JSON.stringify(settings));}catch{}map.setReduced(reduced());map.setScenic(settings.scenic);map.setTheme(settings.theme);map.animate();render();if(key==='sound'){if(settings.sound){unlockAudio();sound();}else stopAudio();}}
  function onKey(e){if(e.key==='Escape'&&!modal?.open){deselect();}if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!modal?.open){e.preventDefault();doUndo();}}
  function doUndo(){try{clearVictory();state=undo(world,state);ev=evaluate(world,state);progressValue.initialized=false;accessibleValue.initialized=false;save();selectedFacility=null;currentPreview=null;tool=null;render();toast('Последний ход отменён. Бюджет восстановлен.');}catch(e){toast(e.message,'error');}}
  let confirmGesture=null;
  const pointerClick=e=>e.detail>0||Boolean(e.pointerType);
  function guardConfirmGesture(e){
    // The former confirm position can now be a tool or the map. Capture both
    // click and native dblclick before Leaflet handles the repeated gesture.
    if(!pointerClick(e)){confirmGesture=null;return;}
    if(confirmGesture&&e.timeStamp-confirmGesture.time<350&&Math.hypot(e.clientX-confirmGesture.x,e.clientY-confirmGesture.y)<4){e.preventDefault();e.stopPropagation();return;}
    confirmGesture=null;
  }
  function onClick(e){
    const b=e.target.closest('button');if(!b||!root.contains(b)||b.disabled)return;
    if(e.isTrusted)unlockAudio();
    if(b.dataset.tool){setTool(b.dataset.tool);return;}
    if(b.dataset.place){closeModal();map.panTo(b.dataset.place);selectRow(world.row(b.dataset.place));return;}
    if(b.dataset.facility){selectedFacility=b.dataset.facility;rememberService(state.facilities.find(f=>f.id===selectedFacility)?.type);tool=null;updatePreview();render();return;}
    const a=b.dataset.act;
    if(a==='confirm'){if(currentPreview?.ok&&pointerClick(e))confirmGesture={time:e.timeStamp,x:e.clientX,y:e.clientY};return void confirm();}if(a==='next')return void next();
    if(a==='search'){menu();requestAnimationFrame(()=>root.querySelector('[data-search]')?.focus());return;}if(a==='menu')return menu();if(a==='licenses')return licenses();if(a==='help')return help();if(a==='details')return details();if(a==='victory')return victory();
    if(a==='deselect')return deselect();if(a==='close-modal')return closeModal();if(a==='undo')return doUndo();if(a==='feedback')return feedback();
    if(a==='zoom-in')return map.zoom(.75);if(a==='zoom-out')return map.zoom(-.75);
    if(a==='focus'||a==='focus-close'){closeModal();if(state.status==='completed')return finalResult();map.fitFocus(true,{overview:true});return;}
    if(a==='region'||a==='region-close'){closeModal();deselect();map.fitAll();toast(`Все ${num(world.rows.length)} поселений региона на карте`);return;}
    if(a==='more'||a==='more-close'){closeModal();allTools=!allTools;render();return;}
    if(a==='export')return download(state,`settlements-v2-${state.regionId}.json`);
    if(a==='export-result')return download(result(world,restore(world,state,{owner})),`result-${state.regionId}.json`);
    if(a==='import'){root.querySelector('.sg-import').click();return;}
    if(a==='free'){clearVictory();if(state.status==='completed'){state=continueFree(state);ev=evaluate(world,state);save();}closeModal();tool=null;allTools=true;deselect();map.fitAll();return;}
    if(a==='restart')return dialog(`<div class="sg-menu-body"><h2>Начать заново?</h2><p>Текущая сеть будет заменена новым поручением в этом же регионе. Сначала можно сохранить её в файл.</p><button class="sg-secondary" data-act="export">Сохранить текущую игру</button><button class="sg-primary" data-act="restart-confirm">Начать заново ${icon('arrow')}</button></div>`);
    if(a==='restart-confirm'){closeModal();clearVictory();shownVictories.clear();stopAudio();state=createState(world,{owner});progressValue.initialized=false;accessibleValue.initialized=false;ev=evaluate(world,state);tool='medical';allTools=false;selected=null;selectedFacility=null;routeFrom=null;currentPreview=null;save();map.mission?.remove();map.mission=null;render();map.fitFocus();return;}
    if(a==='new-region'){const id=root.querySelector('.sg-region-select')?.value;if(id){dialog(`<div class="sg-menu-body"><h2>Открыть другую территорию?</h2><p>Текущая игра будет заменена. Сохраните её в файл, чтобы вернуться позже.</p><button class="sg-secondary" data-act="export">Сохранить текущую игру</button><button class="sg-primary" data-new-region="${esc(id)}">Открыть регион ${icon('arrow')}</button></div>`);}return;}
    if(b.dataset.newRegion){closeModal();changeRegion(b.dataset.newRegion);return;}
    if(a==='import-confirm'&&pendingImport){closeModal();changeRegion(pendingImport.regionId,pendingImport);pendingImport=null;return;}
  }
  async function importFile(e){
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{if(file.size>2_000_000)throw new Error('Файл сохранения слишком большой');const data=JSON.parse(await file.text());if(data.version!==VERSION||data.owner!==owner)throw new Error('Сохранение принадлежит другому профилю или версии');if(options.lockRegion&&data.regionId!==state.regionId)throw new Error('В учебном режиме назначенный регион менять нельзя');if(!manifest.regions.some(r=>r.id===data.regionId))throw new Error('Нет данных этого региона');pendingImport=data;dialog('<div class="sg-menu-body"><h2>Загрузить сохранение?</h2><p>Действия будут повторно проверены. Текущую игру можно сначала сохранить в файл.</p><button class="sg-secondary" data-act="export">Сохранить текущую игру</button><button class="sg-primary" data-act="import-confirm">Загрузить</button></div>');}catch(e){pendingImport=null;dialog(`<div class="sg-menu-body"><h2>Файл не загружен</h2><p>${esc(e instanceof SyntaxError?'Выберите файл JSON, ранее сохранённый через меню игры.':e.message)}</p><p>Текущая сеть сохранена.</p><button class="sg-primary" data-act="import">Выбрать другой файл</button><button class="sg-text-button" data-act="close-modal">Вернуться к карте</button></div>`);}
  }
  async function changeRegion(id,saved=null){
    guard();const loading=root.querySelector('.sg-loading');loading.classList.remove('hidden');
    try{const loaded=await loadRegion(id,{signal:abort.signal});guard();const nextWorld=new World(loaded.pack,loaded.network);let nextState;
      if(saved){try{nextState=restore(nextWorld,saved,{owner});}catch(error){dialog('<div class="sg-menu-body"><h2>Файл не загружен</h2><p>Действия сохранения не прошли проверку. Выберите другой файл, сохранённый через меню игры.</p><p>Текущая сеть сохранена.</p><button class="sg-primary" data-act="import">Выбрать другой файл</button><button class="sg-text-button" data-act="close-modal">Вернуться к карте</button></div>');return;}}
      else nextState=createState(nextWorld,{owner});
      clearVictory();shownVictories.clear();stopAudio();progressValue.initialized=false;accessibleValue.initialized=false;retireMap();world=nextWorld;state=nextState;ev=evaluate(world,state);selected=null;selectedFacility=null;routeFrom=null;currentPreview=null;tool=state.status==='free'?null:CHAPTERS[state.chapter].service;restoreService();allTools=state.status==='free';
      root.querySelector('.sg-region').textContent=world.region.name;map=new GameMap(root.querySelector('.sg-map'),world,{onSelect:selectRow,onEmpty:deselect,onNotice:m=>toast(m,'note',5000)});map.setReduced(reduced());map.setScenic(settings.scenic);map.setTheme(settings.theme);render();map.fitFocus(false);map.frameRestoredFacility();save();
      const url=new URL(location.href);url.searchParams.set('region',id);history.replaceState(null,'',url);
    }catch(e){dialog('<div class="sg-menu-body"><h2>Регион не открыт</h2><p>Текущая сеть сохранена. Проверьте полноту распаковки архива и повторите выбор территории.</p><button class="sg-primary" data-act="menu">Выбрать территорию</button><button class="sg-text-button" data-act="close-modal">Вернуться к текущей сети</button></div>');}finally{loading.classList.add('hidden');}
  }
  // An interrupted load never erases an existing game.
  root.innerHTML='<div class="sg-boot"><strong>Система расселения</strong><span>Открываем карту…</span></div>';
  let saved=null,savedError=null;try{saved=options.host?.load?await options.host.load():storage.load();}catch(e){savedError=e.message;}
  manifest=await json(new URL('manifest.json',DATA),{signal:abort.signal});
  let id=options.regionId||saved?.regionId;
  if(!id||!manifest.regions.some(r=>r.id===id)){const random=crypto.getRandomValues(new Uint32Array(1))[0];id=manifest.regions[random%manifest.regions.length].id;}
  const loaded=await loadRegion(id,{signal:abort.signal});guard();world=new World(loaded.pack,loaded.network);
  if(saved&&saved.regionId===id){try{state=restore(world,saved,{owner});}catch(e){savedError=e.message;state=createState(world,{owner});}}
  else state=createState(world,{owner});ev=evaluate(world,state);tool=state.turn===0?'medical':null;restoreService();allTools=state.status==='free';
  setupShell();map=new GameMap(root.querySelector('.sg-map'),world,{onSelect:selectRow,onEmpty:deselect,onNotice:m=>toast(m,'note',5000)});map.setReduced(reduced());map.setScenic(settings.scenic);map.setTheme(settings.theme);render();map.fitFocus(false);map.frameRestoredFacility();root.querySelector('.sg-loading').classList.add('hidden');
  if(savedError)toast('Прежнее сохранение не открыто: '+savedError,'error',8000);else save();
  // Restored state is silent; the visible completion button remains available.
  const api={version:VERSION,uiVersion:release,inspect:snapshot,sceneEvidence:options=>map.sceneEvidence(options),mapPoint:id=>{const r=world.row(id);if(!r)return null;const p=map.screen(r),rect=root.querySelector('.sg-map').getBoundingClientRect();return {x:p.x+rect.x,y:p.y+rect.y};},exportSave:()=>structuredClone(state),refreshLocale:()=>{},destroy(){disposed=true;abort.abort();ownSubscriptions=0;clearVictory();clearTimeout(toastTimer);toastTimer=null;cancelAnimationFrame(progressFrame);progressFrame=null;retireMap();stopAudio();audio?.close();root.replaceChildren();}};
  return api;
}
