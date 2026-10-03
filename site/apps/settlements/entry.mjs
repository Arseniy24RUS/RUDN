import {COPY,normalizeLocale,regionName,durationText} from './copy.mjs';
import {createSettlementsPersistence} from '../../assets/js/settlements-storage.js';

const BASE=new URL('./',import.meta.url),DIFFICULTIES=['easy','normal','hard'];
const SERVICES=['telecom','medical','school','culture'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>structuredClone(value);
// Tool previews can change the visible layer without producing a checkpoint.
// The replay identity still includes every action and terminal/guide metadata.
const checkpointIdentity=save=>JSON.stringify(save,(key,value)=>key==='activeLayer'?undefined:value);
export function randomRegion(regions,previous,random=crypto){
  const choices=regions.filter(region=>region.id!==previous);if(!choices.length)throw Error('settlements/no-regions');
  const maximum=Math.floor(0x100000000/choices.length)*choices.length,array=new Uint32Array(1);
  do{random.getRandomValues(array);}while(array[0]>=maximum);
  return choices[array[0]%choices.length].id;
}
export function resultMetrics(evaluation,save,reason,elapsedMs){
  const services=SERVICES.map(name=>evaluation.services[name]);
  if(services.some(service=>!(service.total>0)||!(service.population>0)||!Number.isFinite(service.people)))throw Error('settlements/invalid-coverage');
  const total=services[0].total,coverageNp=services.every(s=>s.total===total)?services.reduce((sum,s)=>sum+s.covered,0)*100/(total*4):services.reduce((sum,s)=>sum+s.covered/s.total,0)*25;
  return {terminal:true,coverageNp:Math.min(100,coverageNp),
    coveragePopulation:Math.min(100,services.reduce((sum,s)=>sum+s.people/s.population,0)*25),
    turns:save.actions.length,spentMillionRub:evaluation.spent??0,reason,elapsedMs};
}

/** Native platform module. Geography is loaded only when a game is mounted. */
export async function mountSettlements(container,{backend,owner='guest:settlements',mode='free',locale='ru',signal,onLogin,onExit,onViewChange,onLocaleChange}={}){
  const shadow=container.shadowRoot||container.attachShadow({mode:'open'}),abort=new AbortController();
  let lang=normalizeLocale(locale),session=null,tutorial=null,game=null,disposed=false,busy=false,view='lobby',regions=[],rankRows=[],rankMode=mode,rankDifficulty='normal',selectedDifficulty='normal',selectedRegion='',rankState='loading',saveState='device-only',partySaveState='device-only',tutorialSaveState='device-only',conflict=null,writable=false,lastTick=0,elapsedMs=0,loadGeneration=0,notice='';
  let queue=Promise.resolve(),actionQueue=Promise.resolve(),pendingCompletion=false,restoringWriter=false,acquiringWriter=false,appliedReadOnly=null,destroyPromise=null;
  const pendingCheckpoints={session:0,tutorial:0},submittedSaves={session:null,tutorial:null};
  let presentedView=null;
  function notifyView(value){if(presentedView!==value){presentedView=value;onViewChange?.(value)}}
  const c=()=>COPY[lang],number=(n,d=1)=>new Intl.NumberFormat(lang==='zh'?'zh-CN':lang==='en'?'en-GB':'ru-RU',{maximumFractionDigits:d}).format(n||0);
  const $=selector=>shadow.querySelector(selector),student=owner.startsWith('student:'),teacher=owner.startsWith('teacher:'),active=()=>!disposed&&!abort.signal.aborted;
  const renderedMarkup=new WeakMap();
  function setMarkup(node,html){if(renderedMarkup.get(node)===html)return;renderedMarkup.set(node,html);node.innerHTML=html;}
  const textRegion=id=>{const region=regions.find(item=>item.id===id);return region?regionName(region,lang):id;};
  const options=selected=>DIFFICULTIES.map(id=>`<option value="${id}"${selected===id?' selected':''}>${esc(c()[id])}${mode==='assessment'?` · ${{easy:3,normal:4,hard:5}[id]}/5`:''}</option>`).join('');
  const enqueue=task=>{const next=queue.then(task);queue=next.catch(error=>{if(active()){notice=error?.code==='settlements/online-required'?'onlineRequired':'failed';showStatus();console.error('Settlements operation:',error?.code||error?.message);}});return next;};
  function checkpointStatus(which,state){return ['unsafe','conflict'].includes(state)?state:pendingCheckpoints[which]?'pending':state;}
  function reconcileSnapshotStatus(){
    if(!game||view==='lobby')return;
    const which=view==='tutorial'?'tutorial':'session',state=which==='tutorial'?tutorialSaveState:partySaveState;
    // Native saveQueue may still hold callbacks for later moves. Only compare
    // the small exported replay when an online ACK could otherwise be shown.
    if(state==='saved'&&!pendingCheckpoints[which]&&checkpointIdentity(game.snapshot()?.save)!==submittedSaves[which]){
      if(which==='tutorial')tutorialSaveState='pending';else partySaveState='pending';
    }
  }
  function enqueueCheckpoint(intro,generation,payload,task){
    if(!active()||generation!==loadGeneration)return Promise.resolve();
    const which=intro?'tutorial':'session';pendingCheckpoints[which]++;showStatus();
    return enqueue(async()=>{
      if(!active()||generation!==loadGeneration)return;
      submittedSaves[which]=checkpointIdentity(payload.save);await task();
    }).finally(()=>{pendingCheckpoints[which]--;reconcileSnapshotStatus();showStatus()});
  }
  const act=task=>{actionQueue=actionQueue.then(task).catch(error=>{if(active()){notice='failed';showStatus();console.error('Settlements action:',error?.code||error?.message);}});return actionQueue;};
  function tick(){const now=performance.now();if(lastTick)elapsedMs+=Math.max(0,now-lastTick);lastTick=view==='game'&&session?.status==='active'&&!document.hidden&&!busy&&writable&&!conflict&&!restoringWriter?now:0;}
  function statusLabel(){return c()[saveState==='saved'?'saved':saveState==='unsafe'?'unsafe':saveState==='pending'&&navigator.onLine!==false?'pending':saveState==='conflict'?'conflict':'device'];}
  function showStatus(){if(!active())return;saveState=view==='tutorial'?checkpointStatus('tutorial',tutorialSaveState):checkpointStatus('session',partySaveState);$('[data-status]').hidden=view!=='lobby';for(const node of shadow.querySelectorAll('[data-status],[data-game-status]')){setMarkup(node,`${esc(notice?c()[notice]||notice:statusLabel())}${notice==='failed'||saveState==='unsafe'?` <button data-action="retry-save">${esc(c().retry)}</button>`:''}`);node.dataset.state=saveState;}
    const box=$('[data-conflict]');if(box){box.hidden=!conflict;setMarkup(box,conflict?`<p>${esc(c().conflict)}</p><div class="actions"><button data-action="cloud">${esc(c().cloudVersion)}</button><button data-action="local">${esc(c().localVersion)}</button></div>`:'');}
    const lock=$('[data-writer]');if(lock){lock.hidden=writable||busy;setMarkup(lock,`<p>${esc(c().writer)}</p><button data-action="takeover"${acquiringWriter?' disabled':''}>${esc(acquiringWriter?c().takeoverWaiting:c().takeover)}</button>`);}
    const readOnly=!writable||restoringWriter||!!conflict||saveState==='unsafe'||(view!=='tutorial'&&(session?.status==='completed'||session?.status==='completion-pending'));
    if(game&&appliedReadOnly!==readOnly){appliedReadOnly=readOnly;game.setReadOnly?.(readOnly);}
    if(game)fitGame();
  }
  const persistence=createSettlementsPersistence({backend,owner,mode,
    onBeforeRelease:async()=>{if(game&&persistence.canWrite()&&!conflict&&!restoringWriter){await game.flush?.();await queue;await saveCurrent();}},
    onStatus:event=>{partySaveState=event.state||event.saveState||partySaveState;tutorialSaveState=event.state==='unsafe'?'unsafe':event.tutorialState||tutorialSaveState;reconcileSnapshotStatus();saveState=view==='tutorial'?checkpointStatus('tutorial',tutorialSaveState):checkpointStatus('session',partySaveState);if(typeof event.writable==='boolean')writable=event.writable;
      if(saveState==='saved'&&['failed','onlineRequired'].includes(notice))notice='';
      if(event.session?.attemptId===session?.attemptId&&event.session?.status==='completed'){session={...session,...event.session};pendingCompletion=false;lastTick=0;if(notice==='receiptPending')notice='';if(view!=='tutorial')renderResult();}
      showStatus();},
    onConflict:event=>{const reveal=!!event&&!conflict;tick();conflict=event;tick();showStatus();
      if(reveal)queueMicrotask(()=>{if(!active()||!conflict)return;const box=$('[data-conflict]');box.scrollIntoView({block:'center',behavior:'instant'});box.querySelector('button')?.focus({preventScroll:true});});
    },onWriterChange:event=>{
      tick();writable=typeof event==='boolean'?event:!!(event?.writable??event?.writer);
      if(event?.writable&&Object.hasOwn(event,'restore')&&game){
        restoringWriter=true;showStatus();
        void act(async()=>{const intro=view==='tutorial';await releaseGame({save:false});session=event.restore;tutorial=await persistence.loadTutorial();restoringWriter=false;if(active()){if(intro||session)await openGame({intro});else{view='lobby';renderLobby();renderGameHeading();renderResult();}}});
      }else if(event?.restore){session=event.restore;}
      tick();showStatus();}});
  shadow.innerHTML=`<link rel="stylesheet" href="${new URL('module.css',BASE)}"><div class="page"><header class="heading"></header><section class="panel leaderboard"></section><section class="panel lobby"></section><div class="status" data-status role="status" aria-live="polite"></div><div class="notice warn" data-conflict role="alert" hidden></div><div class="notice warn" data-writer hidden></div><section class="panel result" hidden></section><div class="game-heading" hidden></div><div class="game-stage" hidden><div class="game-host" style="height:100%"></div></div><dialog class="host-dialog"></dialog></div>`;
  const gameShadow=$('.game-host').attachShadow({mode:'open'});
  gameShadow.innerHTML=`<link rel="stylesheet" href="${new URL('runtime/assets/css/settlements-v24.css',BASE)}"><div data-game-root></div>`;
  const gameRoot=gameShadow.querySelector('[data-game-root]');
  function renderHeader(){container.lang=lang==='zh'?'zh-Hans':lang;$('.heading').innerHTML=`<div class="topline"><a class="button" href="${mode==='assessment'?'#dashboard':'#games'}">← ${esc(c().back)}</a><span class="version">${esc(c().version)}</span></div><span class="eyebrow">${esc(mode==='assessment'?c().assessment:c().free)}</span><h1>${esc(c().title)}</h1><p class="muted">${esc(c().lead)}</p>`;}
  function renderLobby(){const completed=session?.status==='completed'||session?.status==='completion-pending',hasActive=session?.status==='active';
    $('.lobby').hidden=view!=='lobby';
    $('.lobby').innerHTML=`<p>${esc(mode==='assessment'?c().rule:c().freeRule)}</p>${!student?`<p class="notice">${esc(teacher?c().teacher:c().guest)}</p>`:''}
      ${mode==='assessment'&&!student&&!teacher?`<button class="primary" data-action="login">${esc(c().login)}</button>`:
      !tutorial?.completed?`<p class="notice">${esc(c().firstTutorial)}</p><button class="primary" data-action="tutorial">${esc(tutorial?.engineSave?c().resume:c().learn)}</button>`:
      `<div class="controls"><label>${esc(c().difficulty)}<select data-select="difficulty">${options(selectedDifficulty)}</select></label>${mode==='free'?`<label class="region">${esc(c().region)}<select data-select="region">${regions.map(r=>`<option value="${esc(r.id)}"${r.id===selectedRegion?' selected':''}>${esc(regionName(r,lang))}</option>`).join('')}</select></label>`:''}<button class="primary" data-action="start"${busy?' disabled':''}>${esc(c().start)}</button></div>${mode==='assessment'?`<p class="muted">${esc(c().random)}</p>`:''}`}
      ${session&&session.status!=='abandoned'?`<div class="notice"><strong>${esc(c().history)} · ${esc(textRegion(session.regionId))} · ${esc(c()[session.difficulty])}</strong><p>${esc(c().time)}: ${durationText(session.elapsedMs)}</p><div class="actions"><button data-action="resume">${esc(completed?c().view:c().resume)}</button>${hasActive?`<button data-action="abandon">${esc(c().abandon)}</button>`:''}</div></div>`:''}
      ${tutorial?.completed?`<button data-action="tutorial">${esc(c().tutorial)}</button>`:''}`;
    showStatus();
  }
  function renderRanking(){const columns=['rank','fullName','group','region','turns','time','spent','coverageNp','coveragePopulation'];
    $('.leaderboard').innerHTML=`<div class="rank-head"><h2>${esc(c().ranking)}</h2><button data-action="rank-refresh">${esc(c().refresh)}</button></div><p class="muted">${esc(c().rankLead)}</p><div class="tabs"><button data-rank-mode="assessment" aria-pressed="${rankMode==='assessment'}">${esc(c().rankAssessment)}</button><button data-rank-mode="free" aria-pressed="${rankMode==='free'}">${esc(c().rankFree)}</button><label>${esc(c().difficulty)} <select data-select="rank-difficulty">${DIFFICULTIES.map(d=>`<option value="${d}"${d===rankDifficulty?' selected':''}>${esc(c()[d])}</option>`).join('')}</select></label></div>
      ${rankState!=='ready'||!rankRows.length?`<p class="empty" role="status">${esc(c()[rankState==='loading'?'loading':rankState==='error'?'rankUnavailable':'rankEmpty'])}</p>`:`<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(c().ranking)}"><table><thead><tr>${columns.map(key=>`<th scope="col">${esc(c()[key])}</th>`).join('')}</tr></thead><tbody>${rankRows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.fio||row.fullName||row.full_name)}</td><td>${esc(row.group)}</td><td>${esc(textRegion(row.regionId))}</td><td>${number(row.turns,0)}</td><td>${durationText(row.elapsedMs??row.durationMs)}</td><td>${number(row.spentMillionRub)}</td><td>${number(row.coverageNp,2)}%</td><td>${number(row.coveragePopulation,2)}%</td></tr>`).join('')}</tbody></table></div>`}`;
  }
  let rankRequest=0;
  async function refreshRanking(){const request=++rankRequest;rankState='loading';renderRanking();try{const rows=await persistence.readLeaderboard({mode:rankMode,difficulty:rankDifficulty});if(!active()||request!==rankRequest)return;rankRows=Array.isArray(rows)?rows:Object.values(rows||{});rankState='ready';}catch{if(!active()||request!==rankRequest)return;rankState='error';}renderRanking();}
  function renderResult(){if(!active())return;const result=session?.result||session?.completionResult;const target=$('.result');target.hidden=!result||view==='tutorial';if(!result)return;
    const points=mode==='assessment'&&result.coverageNp>=90?{easy:3,normal:4,hard:5}[session.difficulty]:0;
    target.innerHTML=`<h2>${esc(c().completed)}</h2><p>${esc(c()[result.reason?.replaceAll('-','_')]||c().complete)}</p><div class="result-grid">${[[number(result.coverageNp,2)+'%',c().coverageNp],[number(result.coveragePopulation,2)+'%',c().coveragePopulation],[number(result.spentMillionRub),c().spent],[number(result.turns,0),c().turns],[durationText(session.elapsedMs),c().time],...(mode==='assessment'?[[`${points}/5`,c().points]]:[])].map(([value,label])=>`<div><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('')}</div><p>${esc(mode==='free'?c().freeResult:points?c().rule:c().noPoints)}</p><p class="muted">${esc(!student?c().device:session.status==='completed'?c().receiptSaved:c().receiptPending)}</p><button data-action="lobby">${esc(c().newGame)}</button>`;
  }
  function renderGameHeading(){notifyView(view);const node=$('.game-heading');node.hidden=view==='lobby';if(node.hidden)return;node.innerHTML=`<div class="game-title"><h2>${esc(view==='tutorial'?c().learning:`${textRegion(session.regionId)} · ${c()[session.difficulty]}`)}</h2><div class="status" data-game-status role="status" aria-live="polite">${esc(statusLabel())}</div></div><div class="actions"><select data-select="locale" aria-label="Language / Язык / 语言">${[['ru','RU'],['en','EN'],['zh','中文']].map(([value,label])=>`<option value="${value}"${value===lang?' selected':''}>${label}</option>`).join('')}</select><button data-action="lobby">${esc(view==='tutorial'?c().tutorialReturn:c().back)}</button></div>`;}
  async function saveCurrent(){tick();if(!game||!persistence.canWrite()||conflict||restoringWriter)return;const snapshot=game.snapshot?.();if(!snapshot)return;const save=snapshot.save||snapshot;
    submittedSaves[view==='tutorial'?'tutorial':'session']=checkpointIdentity(save);
    if(view==='tutorial'){tutorial={...tutorial,engineSave:save,step:save.actions?.length||0};await persistence.saveTutorial(tutorial);}
    else if(session?.status==='active'){session={...session,engineSave:save,elapsedMs:Math.round(elapsedMs)};await persistence.saveSession(session);}
  }
  async function releaseGame({save=true}={}){tick();lastTick=0;
    if(!save||!persistence.canWrite()||conflict||restoringWriter){++loadGeneration;save=false;}
    if(game){if(save){await game.flush?.();await saveCurrent();}game.destroy();game=null;}
    ++loadGeneration;appliedReadOnly=null;gameRoot.replaceChildren();$('.game-stage').hidden=true;lastTick=0;
  }
  function fitGame(scroll=false){if(!active()||view==='lobby')return;const stage=$('.game-stage'),heading=$('.game-heading');
    if(container.dataset.presentation==='game'){stage.style.removeProperty('height');return;}
    const viewport=globalThis.visualViewport,top=document.querySelector('.topbar')?.getBoundingClientRect().bottom||0;
    const nav=document.querySelector('.mobile-nav'),navRect=nav?.getBoundingClientRect();
    const bottom=navRect&&getComputedStyle(nav).display!=='none'?navRect.height:0;
    const height=viewport?.height||innerHeight;stage.style.height=`${Math.max(200,Math.min(820,height-top-bottom-heading.getBoundingClientRect().height-12))}px`;
    heading.style.scrollMarginTop=`${top+6}px`;
    if(scroll)heading.scrollIntoView({block:'start',behavior:'instant'});
  }
  async function openGame({intro=false,freshTutorial=false}={}){
    await releaseGame();view=intro?'tutorial':'game';busy=true;notice='';const generation=++loadGeneration;
    renderLobby();renderGameHeading();renderResult();$('.game-stage').hidden=false;gameRoot.innerHTML=`<p class="busy" role="status">${esc(c().loading)}</p>`;
    if(intro&&freshTutorial)tutorial={...tutorial,engineSave:null,step:0};
    elapsedMs=intro?0:Number(session.elapsedMs||0);
    try{
      const {mountSettlementsGame}=await import('./runtime/assets/js/settlements/v24/game.mjs');
      if(!active()||generation!==loadGeneration)return;
      const initialSave=intro?tutorial?.engineSave:session.engineSave;
      const handle=await mountSettlementsGame(gameRoot,{locale:lang,owner,regionId:intro?'chelyabinskaya_oblast':session.regionId,mode:intro?'intro':'free',difficulty:intro?'normal':session.difficulty,initialSave,signal:abort.signal,readOnly:!writable||(!intro&&session.status!=='active'),
        onCheckpoint:payload=>enqueueCheckpoint(intro,generation,payload,async()=>{tick();if(intro){tutorial={...tutorial,engineSave:payload.save,step:payload.save.actions?.length||0};await persistence.saveTutorial(tutorial);}else if(session.status==='active'){session={...session,engineSave:payload.save,elapsedMs:Math.round(elapsedMs)};await persistence.saveSession(session);}}),
        onComplete:payload=>enqueueCheckpoint(intro,generation,payload,async()=>{tick();if(intro){tutorial={...tutorial,completed:true,engineSave:payload.save,step:6};await persistence.saveTutorial(tutorial);notice='tutorialDone';showStatus();return;}
          if(pendingCompletion||['completed','abandoned'].includes(session.status))return;pendingCompletion=true;const previous=session;
          const result=resultMetrics(payload.evaluation,payload.save,payload.reason,Math.round(elapsedMs));result.spentMillionRub=payload.metrics?.spentMillionRub??payload.spentMillionRub??payload.evaluation.spent;
          // The game supplies spent directly from its replayed engine state.
          if(payload.metrics?.spentMillionRub!==undefined)result.spentMillionRub=payload.metrics.spentMillionRub;
          session={...session,engineSave:payload.save,elapsedMs:Math.round(elapsedMs),status:'completion-pending',result};lastTick=0;
          try{session=await persistence.completeSession(session,result);pendingCompletion=false;renderResult();showStatus();$('.result').style.scrollMarginTop=`${(document.querySelector('.topbar')?.getBoundingClientRect().bottom||0)+8}px`;$('.result').scrollIntoView({block:'start'});void refreshRanking();}
          catch(error){try{session=await persistence.loadSession({attemptId:previous.attemptId})||previous;}catch{session=previous;}pendingCompletion=false;throw error;}}),
        onExit:()=>{void act(()=>toLobby());}});
      if(!active()||generation!==loadGeneration){handle.destroy();return;}
      // Imported games replay the already persisted snapshot without emitting a
      // boot checkpoint. Establish that replay as the comparison baseline.
      if(initialSave)submittedSaves[intro?'tutorial':'session']=checkpointIdentity(handle.snapshot()?.save);
      game=handle;appliedReadOnly=null;busy=false;tick();showStatus();fitGame(true);
    }catch(error){busy=false;if(!active()||generation!==loadGeneration)return;gameRoot.innerHTML=`<div class="busy"><p>${esc(c().startError)}</p><button data-action="reload-game">${esc(c().retry)}</button></div>`;gameRoot.querySelector('button').onclick=()=>void act(()=>openGame({intro:view==='tutorial'}));console.error('Settlements load:',error?.code||error?.message);}
  }
  async function toLobby(){await releaseGame();view='lobby';busy=false;renderLobby();renderGameHeading();renderResult();}
  async function startTutorial(){await openGame({intro:true,freshTutorial:!!tutorial?.completed});}
  async function startGame(){if(view!=='lobby'||!writable||conflict||restoringWriter)return;if(session?.status==='completion-pending'){notice='receiptPending';showStatus();await persistence.flush();return;}if(!tutorial?.completed){await startTutorial();return;}if(mode==='assessment'&&!student&&!teacher){onLogin?.();return;}
    if(session?.status==='active'){await askAbandon(true);return;}
    const regionId=mode==='assessment'?randomRegion(regions,session?.regionId):selectedRegion||regions[0].id;
    session={attemptId:crypto.randomUUID(),regionId,difficulty:selectedDifficulty,mode,status:'active',engineSave:null,elapsedMs:0,startedAt:new Date().toISOString(),previousRegionId:session?.regionId||null};
    pendingCompletion=false;session=await persistence.saveSession(session);
    if(mode==='assessment'&&student&&!await persistence.confirmOnline()){notice='onlineRequired';showStatus();renderLobby();return;}
    await openGame();
  }
  async function askAbandon(startAfter=false){const d=$('.host-dialog');d.returnValue='';d.innerHTML=`<h2>${esc(c().abandonTitle)}</h2><p>${esc(c().abandonText)}</p><div class="actions"><button data-dialog="cancel">${esc(c().cancel)}</button><button data-dialog="confirm">${esc(c().confirm)}</button></div>`;d.showModal();
    const confirmed=await new Promise(resolve=>{d.onclose=()=>resolve(d.returnValue==='confirm');d.querySelectorAll('button').forEach(button=>button.onclick=()=>d.close(button.dataset.dialog));});if(!confirmed)return;
    await releaseGame();session={...session,status:'abandoned'};await persistence.saveSession(session);view='lobby';renderLobby();if(startAfter)await startGame();}
  async function resolveConflict(choice){
    const previousConflict=conflict,resumeTutorial=previousConflict?.scope==='tutorial'&&view==='tutorial';
    await releaseGame({save:false});
    // Resolving one scope can reveal a second conflict. Keep the adapter's next
    // onConflict event instead of clearing it after the asynchronous operation.
    conflict=null;
    try{session=await persistence.resolveConflict(choice,previousConflict?.scope);tutorial=await persistence.loadTutorial();}
    catch(error){conflict=conflict||previousConflict;showStatus();throw error;}
    pendingCompletion=false;writable=persistence.canWrite();view='lobby';renderLobby();renderGameHeading();renderResult();
    if(resumeTutorial&&!conflict)await openGame({intro:true});
  }
  async function handleAction(action){if(action==='login'){onLogin?.();return;}if(action==='rank-refresh'){await refreshRanking();return;}if(action==='start'){await startGame();return;}
    if(action==='retry-save'){await queue;await saveCurrent();await persistence.flush();notice='';appliedReadOnly=null;showStatus();return;}
    if(action==='resume'){if(mode==='assessment'&&student&&session?.status==='active'&&!session.engineSave&&!await persistence.confirmOnline()){notice='onlineRequired';showStatus();return;}await openGame();return;}
    if(action==='tutorial'){await startTutorial();return;}if(action==='lobby'){await toLobby();return;}if(action==='abandon'){await askAbandon();return;}if(action==='reload-game'){await openGame({intro:view==='tutorial'});return;}
    if(action==='cloud'||action==='local'){await resolveConflict(action);return;}if(action==='takeover'){
      // Closing a tab may take seconds to release its browser lock. Keep the
      // user's explicit handover request alive, without stealing another writer.
      acquiringWriter=true;showStatus();const deadline=performance.now()+10000;
      try{do{await persistence.acquireWriter();writable=persistence.canWrite();if(writable||!active()||conflict)break;await new Promise(resolve=>setTimeout(resolve,150));}while(performance.now()<deadline);}
      finally{acquiringWriter=false;showStatus();}return;}}
  shadow.addEventListener('click',event=>{const button=event.target.closest?.('[data-action],[data-rank-mode]');if(!button)return;event.preventDefault();if(button.dataset.rankMode){rankMode=button.dataset.rankMode;void refreshRanking();return;}void act(()=>handleAction(button.dataset.action));},{signal:abort.signal});
  shadow.addEventListener('change',event=>{const field=event.target.dataset.select;if(field==='locale'){if(onLocaleChange)onLocaleChange(event.target.value);else void api.setLocale(event.target.value);}else if(field==='difficulty')selectedDifficulty=event.target.value;else if(field==='region')selectedRegion=event.target.value;else if(field==='rank-difficulty'){rankDifficulty=event.target.value;void refreshRanking();}},{signal:abort.signal});
  const onVisibility=()=>{tick();if(document.hidden)void enqueue(saveCurrent);};document.addEventListener('visibilitychange',onVisibility,{signal:abort.signal});
  const heartbeat=setInterval(()=>{if(active()&&view==='game'&&!busy&&!document.hidden&&session?.status==='active'&&writable)void enqueue(saveCurrent);},15000);
  globalThis.addEventListener('resize',()=>fitGame(),{signal:abort.signal});globalThis.visualViewport?.addEventListener('resize',()=>fitGame(),{signal:abort.signal});
  const api={async setLocale(value){lang=normalizeLocale(value);renderHeader();renderLobby();renderRanking();renderGameHeading();renderResult();await game?.setLocale?.(lang);showStatus();fitGame();},async flush(){
    if(disposed||!persistence.canWrite()||conflict||restoringWriter)return;
    await game?.flush?.();await queue;if(!persistence.canWrite()||conflict)return;await saveCurrent();await persistence.flush();
  },destroy(){if(destroyPromise)return destroyPromise;destroyPromise=(async()=>{try{await api.flush();}finally{disposed=true;notifyView('lobby');clearInterval(heartbeat);++loadGeneration;game?.destroy();game=null;abort.abort();try{await persistence.destroy();}finally{shadow.replaceChildren();}}})();return destroyPromise;}};
  signal?.addEventListener('abort',()=>void api.destroy(),{once:true});
  renderHeader();renderRanking();$('.lobby').innerHTML=`<p role="status">${esc(c().loading)}</p>`;
  try{const response=await fetch(new URL('runtime/data/settlements/v1/manifest.json',BASE),{signal:abort.signal});if(!response.ok)throw Error('settlements/manifest');const manifest=await response.json();regions=manifest.regions;selectedRegion=regions[0].id;
    await persistence.acquireWriter();writable=persistence.canWrite();[session,tutorial]=await Promise.all([persistence.loadSession(),persistence.loadTutorial()]);
    if(session){selectedDifficulty=session.difficulty;selectedRegion=session.regionId;}if(!active())return api;renderLobby();renderResult();void refreshRanking();
  }catch(error){if(!active())return api;notice='failed';$('.lobby').innerHTML=`<p>${esc(c().failed)}</p><button data-action="reload-page">${esc(c().retry)}</button>`;$('.lobby button').onclick=()=>onExit?.();showStatus();console.error('Settlements initialization:',error?.code||error?.message);}
  return api;
}
