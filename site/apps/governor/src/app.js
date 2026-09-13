(function () {
  'use strict';

  const DATA = window.GovernorGame.DATA;
  const Engine = window.GovernorGame.Engine;
  const Agenda = window.GovernorGame.Agenda;
  const AgendaUI = window.GovernorGame.AgendaUI;
  const BudgetReview=window.GovernorGame.BudgetReview;
  const BudgetReviewUI=window.GovernorGame.BudgetReviewUI;
  const financialReason=(code,lang)=>BudgetReviewUI.reason(code,lang)||RecoveryUI.reason(code,lang);
  const Recovery=window.GovernorGame.Recovery;
  const RecoveryUI=window.GovernorGame.RecoveryUI;
  const Finance = window.GovernorGame.Finance;
  const Population = window.GovernorGame.Population;
  const PeopleUI = window.GovernorGame.PopulationUI;
  const Governance = window.GovernorGame.Governance;
  const GovUI = window.GovernorGame.GovernanceUI;
  const WorldUI = window.GovernorGame.WorldUI;
  const WorldModel = window.GovernorGame.WorldModel;
  const Art = window.GovernorGame.IllustratedAssets;
  const ProjectUI = window.GovernorGame.ProjectUI;
  const Presentation = window.GovernorGame.Presentation;
  const Stories = window.GovernorGame.Stories;
  const StoriesUI = window.GovernorGame.StoriesUI;
  const icon = window.GovernorGame.icon;
  const Saves = window.GovernorGame.Saves;
  const Platform=window.GovernorGame.Platform;
  const storage=Platform?.storage||localStorage;
  const STORAGE_KEY = Platform?.storageKey||Saves.Key;
  let store;
  try {store=new Saves.Store(storage);}catch(_){store=new Saves.Store({getItem(){throw Error('storage');},setItem(){throw Error('storage');}});}
  let storageStatus='empty',writerReady=false,releaseWriter=null;
  let blockedByOtherTab=false;
  let pendingImport=null, importRequest=0;
  let updateCampaignModeLabels=()=>{};
  const PREFS_KEY = 'rudn-governor-stage9-prefs';
  const META_KEY = 'rudn-governor-stage9-meta';

  let language = Platform?.language||detectLanguage();
  window.GovernorGame.I18n.install(DATA);
  window.GovernorGame.I18n.setLanguage(language);
  let state = null;
  let saveFailureWarned = false;
  let selectedActionId = null;
  let selectedFundingMode = null;
  let selectedPlacementId = null;
  let resolutionShown = false;
  let audioContext = null;
  let savedState = loadSavedState();
  let metaState = loadMetaState();
  const toastQueue = [];
  let activeToastCount = 0;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function detectLanguage() {
    try {
      const prefs = JSON.parse(storage.getItem(PREFS_KEY) || storage.getItem('rudn-governor-stage8-prefs') || storage.getItem('rudn-governor-stage7-prefs') || storage.getItem('rudn-governor-stage6-prefs') || storage.getItem('rudn-governor-stage5-prefs') || storage.getItem('rudn-governor-stage4-prefs') || '{}');
      if (['ru','en','zh'].includes(prefs.language)) return prefs.language;
    } catch (_) {}
    const browserLanguage=String(navigator.language || '').toLowerCase();
    return browserLanguage.startsWith('zh') ? 'zh' : browserLanguage.startsWith('ru') ? 'ru' : 'en';
  }

  function getPrefs() {
    try {
      return JSON.parse(storage.getItem(PREFS_KEY) || storage.getItem('rudn-governor-stage8-prefs') || storage.getItem('rudn-governor-stage7-prefs') || storage.getItem('rudn-governor-stage6-prefs') || storage.getItem('rudn-governor-stage5-prefs') || storage.getItem('rudn-governor-stage4-prefs') || '{}');
    } catch (_) {
      return {};
    }
  }

  function savePrefs(patch) {
    const next = { ...getPrefs(), ...patch };
    try {
      storage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function t(key) {
    return (DATA.ui[language] && DATA.ui[language][key]) || DATA.ui.ru[key] || key;
  }

  function l(value) {
    return Engine.localise(value, language);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[ch]);
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return globalThis.GovernorGame.I18n.choose(language,()=>('Г'),()=>('G'));
    return parts.slice(0, 2).map(part => part[0].toUpperCase()).join('');
  }

  function formatNumber(value, digits) {
    return new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(language), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(Number(value) || 0);
  }

  function formatBudget(value, compact) {
    const number = formatNumber(value, 1);
    if (language === 'ru') return compact ? `₽ ${number}` : `₽ ${number} ${t('billion')}`;
    return compact ? `₽ ${number}` : `${number} ${t('billion')}`;
  }

  function formatSigned(value, suffix) {
    const n = Number(value) || 0;
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return `${sign}${formatNumber(Math.abs(n), Number.isInteger(Math.abs(n)) ? 0 : 1)}${suffix || ''}`;
  }

  function statClass(value) {
    if (Number(value) > 0) return 'positive';
    if (Number(value) < 0) return 'negative';
    return '';
  }


  const FUNDING_META = {
    treasury: { label: 'fundingTreasury', short: 'fundingTreasuryShort', reason: 'treasuryReason', icon: 'vault' },
    cofinance: { label: 'fundingCofinance', short: 'fundingCofinanceShort', reason: 'cofinanceReason', icon: 'federal' },
    debt: { label: 'fundingDebt', short: 'fundingDebtShort', reason: 'debtReason', icon: 'bank' },
    reserve: { label: 'fundingReserve', short: 'fundingReserveShort', reason: 'reserveReason', icon: 'shield' }
  };

  function fundingMeta(id) {
    return FUNDING_META[id] || FUNDING_META.treasury;
  }

  function fundingName(id, short) {
    const meta = fundingMeta(id);
    return t(short ? meta.short : meta.label);
  }

  function fundingReason(id) {
    return t(fundingMeta(id).reason);
  }

  function formatTurns(value) {
    const turns = Math.max(0, Number(value) || 0);
    if (turns <= 0) return t('immediately');
    if (language === 'zh') return `${formatNumber(turns, 0)}年`;
    if (language === 'ru') {
      const mod100 = turns % 100, mod10 = turns % 10;
      const unit = mod100 >= 11 && mod100 <= 14 ? 'лет' : mod10 === 1 ? 'год' : mod10 >= 2 && mod10 <= 4 ? 'года' : 'лет';
      return `${formatNumber(turns, 0)} ${unit}`;
    }
    return `${formatNumber(turns, 0)} ${turns === 1 ? 'year' : 'years'}`;
  }

  function projectStatus(project) {
    if (project.status === 'delivery') return t('underConstruction');
    if (project.status === 'active') return t('activeProgramme');
    return t('completedProgramme');
  }

  function projectStatusIcon(project) {
    if (project.status === 'delivery') return 'construction';
    if (project.status === 'active') return 'play';
    return 'check';
  }

  function ledgerSideTotal(side) {
    return Object.values(side || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  }


  function loadMetaState() {
    try {
      const raw = JSON.parse(storage.getItem(META_KEY) || storage.getItem('rudn-governor-stage8-meta') || '{}');
      return {
        campaignsCompleted: Math.max(0, Number(raw.campaignsCompleted) || 0),
        completedChallenges: Array.isArray(raw.completedChallenges) ? raw.completedChallenges : [],
        recordedSessions: Array.isArray(raw.recordedSessions) ? raw.recordedSessions : [],
        bestStars: Math.max(0, Number(raw.bestStars) || 0)
      };
    } catch (_) {
      return { campaignsCompleted: 0, completedChallenges: [], recordedSessions: [], bestStars: 0 };
    }
  }

  function saveMetaState() {
    try { storage.setItem(META_KEY, JSON.stringify(metaState)); } catch (_) {}
  }

  function challengeUnlocked(challenge) {
    return !challenge || Number(metaState.campaignsCompleted || 0) >= Number(challenge.unlockAfter || 0);
  }

  function recordCompletedCampaign() {
    if (!state || !state.completed || metaState.recordedSessions.includes(state.storiesRunId || state.sessionId)) return [];
    const before = DATA.challenges.filter(challengeUnlocked).map(item => item.id);
    metaState.campaignsCompleted += 1;
    metaState.bestStars = Math.max(metaState.bestStars || 0, state.stars || 0);
    metaState.recordedSessions.push(state.storiesRunId || state.sessionId);
    metaState.recordedSessions = metaState.recordedSessions.slice(-30);
    if (!metaState.completedChallenges.includes(state.challengeId)) metaState.completedChallenges.push(state.challengeId);
    saveMetaState();
    return DATA.challenges.filter(challengeUnlocked).filter(item => !before.includes(item.id)).map(item => item.id);
  }

  function directionSymbol(value) {
    const number = Number(value) || 0;
    return number > 0 ? '↑' : number < 0 ? '↓' : '•';
  }

  function deliveryLabel(id) {
    const keys = {
      'on-time': 'deliveryOnTime',
      delayed: 'deliveryDelayed',
      overrun: 'deliveryOverrun',
      partial: 'deliveryPartial'
    };
    return t(keys[id] || 'deliveryOnTime');
  }

  function deliveryDescription(id) {
    const keys = {
      'on-time': 'deliveryOnTimeText',
      delayed: 'deliveryDelayedText',
      overrun: 'deliveryOverrunText',
      partial: 'deliveryPartialText'
    };
    return t(keys[id] || 'deliveryOnTimeText');
  }

  function deliveryRiskText(label) {
    return t(label === 'high' ? 'deliveryHigh' : label === 'medium' ? 'deliveryMedium' : 'deliveryLow');
  }


  function chapterName(chapter) {
    if (!chapter) return '';
    return t(chapter.titleKey || chapter.key || `chapter${chapter.id}`);
  }

  function phaseName(phase) {
    const keys = { design: 'threadDesign', delivery: 'threadDelivery', crisis: 'threadCrisis', legacy: 'threadLegacy' };
    return t(keys[phase] || 'threadDesign');
  }

  function actionForRecord(record) {
    const mission = Engine.findMission(record.missionId);
    const action = mission && mission.actions.find(item => item.id === record.actionId);
    return { mission, action };
  }

  function stanceName(stance) {
    return t(stance === 'support' ? 'advisorApproved' : stance === 'oppose' ? 'advisorOpposed' : 'advisorCautious');
  }

  function effectRangeText(range) {
    if (!Array.isArray(range) || range.length < 2) return '—';
    return `${formatSigned(range[0])}…${formatSigned(range[1])}`;
  }

  function loadSavedState() {
    const result=store.inspect();storageStatus=result.status;
    return result.state;
  }

  function saveState(showFeedback) {
    if (!state || blockedByOtherTab || !writerReady || Platform?.canWrite?.()===false) return false;
    state.language=language;
    if(!state.awaitingContinue)state.draft={actionId:selectedActionId,fundingMode:selectedFundingMode,placementId:selectedPlacementId};
    try {
      store.write(state);savedState=state;saveFailureWarned=false;storageStatus='ok';
      Platform?.onSaved?.(state);
      if(showFeedback)toast(t('saved'),`${t('turn')} ${state.turnIndex+1}`,'check');
      return true;
    }catch(e){
      if(e.code==='other-tab'){blockForOtherTab();return false;}
      if(showFeedback||!saveFailureWarned)toast(t('saveFailed'),globalThis.GovernorGame.I18n.choose(language,()=>('Партия в памяти. Скачайте файл сохранения через кнопку «Сохранение» перед закрытием.'),()=>('The game is in memory. Download a save file before closing.')),'warning');
      saveFailureWarned=true;return false;
    }
  }

  function clearState() {
    try{store.clear();savedState=null;}catch(e){if(e.code==='other-tab')blockForOtherTab();}
  }

  function blockForOtherTab(){
    blockedByOtherTab=true;writerReady=false;
    const dialog=$('#tab-conflict');if(dialog&&!dialog.open)dialog.showModal();
    $('#game-shell').inert=true;$('#start-screen').inert=true;
  }

  async function acquireWriter(){
    if(!navigator.locks){writerReady=true;return;}
    return new Promise(resolve=>{
      navigator.locks.request(Platform?.lockName||'rudn-governor-stage9-writer',{ifAvailable:true},lock=>{
        if(!lock){blockForOtherTab();resolve(false);return;}
        writerReady=true;resolve(true);
        return new Promise(done=>{releaseWriter=done;});
      }).catch(()=>{writerReady=true;resolve(true);});
    });
  }

  function downloadBlob(content,name,type='application/json'){
    const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  async function downloadSave(){
    const current=state||savedState;if(!current)return;
    try{downloadBlob(await Saves.pack(current),`governor-${current.sessionId}-year-${current.turnIndex+1}.govsave.json`);}
    catch(e){$('#save-status').textContent=saveError(e);}
  }
  function saveError(e){
    const messages={
      'checksum-mismatch':['Контрольная сумма не совпала. Файл повреждён или изменён.','Checksum mismatch. File is corrupted or modified.'],
      'incompatible-model':['Эта модель сохранения не поддерживается. Версия 1.0 читает партии 0.9–0.16 и проверенные партии 0.8 с переносом в последовательный маршрут.','Unsupported save model. Version 1.0 reads games from 0.9–0.16 and validated 0.8 games on the guided route.'],
      'not-save-file':['Нужен файл .govsave.json, а не итоговый отчёт.','Select a .govsave.json file, not an outcome report.'],
      'invalid-state':['Состояние не прошло проверку. Текущая партия не заменена.','State validation failed. Your current game was not replaced.'],
      'file-too-large':['Файл больше 20 МБ.','File exceeds 20 MB.'],
      'other-tab':['Партия уже изменена в другой вкладке.','The game changed in another tab.']};
    const pair=messages[e.code]||['Не удалось прочитать или сохранить файл. Текущая партия сохранена в памяти.','Could not read or write the file. Your game remains in memory.'];
    return globalThis.GovernorGame.I18n.choose(language,...pair);
  }
  function openSaveManager(){
    const current=state||savedState,backup=store.backup();
    $('#save-status').textContent=storageStatus==='corrupt'?(globalThis.GovernorGame.I18n.choose(language,()=>('Текущее автосохранение повреждено. Резервная копия не загружается без вашего решения.'),()=>('The autosave is corrupted. A backup will not load without your choice.'))):(globalThis.GovernorGame.I18n.choose(language,()=>('Файл переносит партию, выборы и письма. Итоговый отчёт для этого не подходит.'),()=>('A save file transfers the game, choices and letters. Outcome reports cannot restore a game.')));
    $('#save-export').disabled=!current;$('#save-backup').disabled=backup.status!=='ok';
    $('#save-current').textContent=current?`${current.profile.name} · ${current.history.length}/20 · ${current.version}`:(globalThis.GovernorGame.I18n.choose(language,()=>('Нет текущей партии. Выберите файл .govsave.json версии 0.8–1.0.'),()=>('No current game. Choose a .govsave.json file from version 0.8–1.0.')));
    $('#save-backup-info').textContent=backup.state?(globalThis.GovernorGame.I18n.choose(language,()=>(`Резервная копия: ${backup.state.profile.name}, решений ${backup.state.history.length}/20`),()=>(`Backup: ${backup.state.profile.name}, decisions ${backup.state.history.length}/20`))):'';
    pendingImport=null;importRequest++;$('#save-import-confirm').hidden=true;
    const legacy=store.legacy();$('#save-legacy').hidden=!legacy.state;
    if(!$('#save-dialog').open)$('#save-dialog').showModal();
  }
  async function selectSaveFile(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    pendingImport=null;importRequest++;$('#save-import-confirm').hidden=true;
    const request=importRequest;
    try{
      if(file.size>Saves.MAX_BYTES)throw{code:'file-too-large'};
      const imported=await Saves.unpack(await file.text());
      if(request!==importRequest||!$('#save-dialog').open)return;
      pendingImport=imported;
      $('#save-status').textContent=globalThis.GovernorGame.I18n.choose(language,()=>(`Проверено: ${imported.profile.name}; принятых решений ${imported.history.length}/20. При подтверждении текущая автокопия станет резервной.`),()=>(`Verified: ${imported.profile.name}; decisions ${imported.history.length}/20. Confirmation keeps the current autosave as a backup.`));
      if(imported.migratedFrom)$('#save-status').textContent+=globalThis.GovernorGame.I18n.choose(language,()=>(' Сохранение 0.8 продолжится по последовательному маршруту, без новых сроков софинансирования.'),()=>(' The 0.8 game keeps its guided route, without the new cofinancing deadlines.'));
      $('#save-import-confirm').hidden=false;
    }catch(e){if(request===importRequest&&$('#save-dialog').open)$('#save-status').textContent=saveError(e);}
  }
  function installSave(){
    if(!pendingImport||blockedByOtherTab||!writerReady)return;
    try{store.write(pendingImport);}catch(e){$('#save-status').textContent=saveError(e);return;}
    Platform?.onNewRun?.(pendingImport);
    savedState=pendingImport;state=null;storageStatus='ok';pendingImport=null;
    $$('dialog[open]').forEach(d=>d.close());continueSavedCampaign();
  }

  function mountConsolidationUI(){
    Object.assign(DATA.ui.ru,{saveTitle:'Сохранение и перенос',saveExport:'Скачать сохранение',saveImport:'Выбрать файл',saveConfirm:'Заменить и продолжить',saveBackup:'Выбрать резервную копию',saveClose:'Закрыть',saveNumbers:'Клавиши 1–3 только внутри списка решений',saveAccess:'Сохранение',conflictTitle:'Эта партия открыта в другой вкладке',conflictText:'Закройте другую вкладку и обновите эту. Текущее состояние не перезаписывается.',reload:'Обновить вкладку',modelStage:'Версия 1.0',shortcutHint:'Tab – перейти к кнопке; Enter – нажать кнопку',forecastRange:'Возможный прямой эффект',reward:'Освоение механики'});
    Object.assign(DATA.ui.en,{saveTitle:'Save and transfer',saveExport:'Download save',saveImport:'Choose file',saveConfirm:'Replace and continue',saveBackup:'Choose backup',saveClose:'Close',saveNumbers:'Keys 1–3 only inside the decision list',saveAccess:'Save',conflictTitle:'This game is open in another tab',conflictText:'Close the other tab and refresh this one. The saved game has not been overwritten.',reload:'Refresh tab',modelStage:'Version 1.0',shortcutHint:'Tab moves to a button; Enter activates it',forecastRange:'Possible direct effect',reward:'Learning progress'});
    document.body.insertAdjacentHTML('beforeend',`<dialog id="save-dialog" class="save-dialog" aria-labelledby="save-title"><h2 id="save-title" data-ui="saveTitle"></h2><p id="save-current"></p><p id="save-status" role="status"></p><div class="save-actions"><button class="primary-button" id="save-export" type="button" data-ui="saveExport"></button><button class="secondary-button" id="save-import" type="button" data-ui="saveImport"></button><button class="secondary-button" id="save-backup" type="button" data-ui="saveBackup"></button></div><p id="save-backup-info"></p><button type="button" class="secondary-button" id="save-legacy" hidden>Открыть сохранение 0.8</button><input id="save-file" type="file" accept=".json,application/json" hidden><button class="primary-button" id="save-import-confirm" type="button" data-ui="saveConfirm" hidden></button><label><input type="checkbox" id="number-shortcuts"><span data-ui="saveNumbers"></span></label><div class="save-actions"><button class="secondary-button" id="save-close" type="button" data-ui="saveClose"></button></div></dialog>
     <dialog id="tab-conflict" class="save-dialog" aria-labelledby="conflict-title"><h2 id="conflict-title" data-ui="conflictTitle"></h2><p data-ui="conflictText"></p><div class="save-actions"><button id="conflict-export" type="button" class="secondary-button" data-ui="saveExport"></button><button id="conflict-refresh" type="button" class="primary-button" data-ui="reload"></button></div></dialog>`);
    $('#start-form').insertAdjacentHTML('beforeend','<button type="button" class="save-access" id="start-save" data-ui="saveAccess"></button>');
    // Saving belongs to the toolbar, never over a decision card or its text.
    $('#game-shell .profile-box').insertAdjacentHTML('afterbegin','<button id="floating-save" class="save-access" type="button" data-ui="saveAccess"></button>');
    $('#start-save').addEventListener('click',openSaveManager);$('#floating-save').addEventListener('click',openSaveManager);
    $('#save-export').addEventListener('click',downloadSave);$('#save-import').addEventListener('click',()=>$('#save-file').click());
    $('#save-file').addEventListener('change',selectSaveFile);$('#save-import-confirm').addEventListener('click',installSave);
    $('#save-close').addEventListener('click',()=>$('#save-dialog').close());
    $('#save-dialog').addEventListener('close',()=>{importRequest++;pendingImport=null;});
    $('#save-backup').addEventListener('click',()=>{importRequest++;const backup=store.backup();if(!backup.state)return;pendingImport=backup.state;$('#save-status').textContent=globalThis.GovernorGame.I18n.choose(language,()=>(`Выбрана резервная копия: ${backup.state.history.length}/20 решений. Подтвердите замену.`),()=>(`Backup selected: ${backup.state.history.length}/20 decisions. Confirm replacement.`));$('#save-import-confirm').hidden=false;});
    $('#number-shortcuts').checked=Boolean(getPrefs().numberShortcuts);$('#number-shortcuts').addEventListener('change',e=>savePrefs({numberShortcuts:e.target.checked}));
    $('#tab-conflict').addEventListener('cancel',e=>e.preventDefault());$('#conflict-refresh').addEventListener('click',()=>location.reload());$('#conflict-export').addEventListener('click',downloadSave);
  }

  function setStaticIcons() {
    const staticIcons = {
      'start-card-icon': ['flag', 28],
      'start-arrow': ['arrow', 18],
      'budget-icon': ['budget', 23],
      'support-icon': ['people', 23],
      'development-icon': ['development', 23],
      'turn-icon': ['hourglass', 25],
      'start-sound': ['sound', 20],
      'sound-toggle': ['sound', 20],
      'reward-xp-icon': ['sparkles', 17],
      'reward-stars-icon': ['quest', 17],
      'confirm-arrow': ['arrow', 18],
      'tip-icon': ['info', 22],
      'result-check': ['check', 29],
      'result-star-icon': ['quest', 20],
      'continue-arrow': ['arrow', 18],
      'play-again-icon': ['refresh', 18],
      'end-download-icon': ['download', 20],
      'mobile-menu-button': ['menu', 21]
    };
    Object.entries(staticIcons).forEach(([id, [name, size]]) => {
      const element = document.getElementById(id);
      if (element) element.innerHTML = icon(name, { size });
    });
    $$('[data-icon]').forEach(element => {
      element.innerHTML = icon(element.dataset.icon, { size: element.closest('.mobile-bottom-nav') ? 23 : 26 });
    });
    $$('[data-close-dialog]').forEach(button => {
      button.innerHTML = icon('close', { size: 19 });
    });
  }

  function applyTranslations() {
    window.GovernorGame.I18n.setLanguage(language);
    window.GovernorGame.I18n.shell(document,language);
    document.documentElement.lang = language;
    document.title = `${t('appTitle')} · ${language==='ru'?'РУДН':'RUDN'}`;
    $$('[data-ui]').forEach(element => {
      const key = element.dataset.ui;
      if (DATA.ui[language][key] !== undefined) element.textContent = t(key);
    });
    $$('[data-ui-placeholder]').forEach(element => {
      element.setAttribute('placeholder', t(element.dataset.uiPlaceholder));
    });
    $('.skip-link').textContent = t('skipToGame');
    const nextLanguage=window.GovernorGame.I18n.ready()?{ru:'EN',en:'中文',zh:'RU'}[language]:language==='ru'?'EN':'RU';
    $('#start-language').textContent = nextLanguage;
    $('#language-toggle').textContent = nextLanguage;
    $('#mobile-menu-button').setAttribute('aria-label', globalThis.GovernorGame.I18n.choose(language,()=>('Открыть разделы игры'),()=>('Open game sections')));
    updateCampaignModeLabels();
    window.GovernorGame.ReleaseUI.translate(language);
    Platform?.onLanguage?.(language);
    populateScenarioOptions();
    populateChallengeOptions();
    updateStartScenarioPreview();
    updateChallengePreview();
    updateSoundButtons();
    updateRecoverySetup();
    if (state) {
      state.language = language;
      saveState(false);
      renderGame();
    }
  }

  function populateScenarioOptions() {
    const select = $('#scenario-select');
    if (!select) return;
    const current = select.value || 'balanced';
    select.innerHTML = '';
    const randomOption = document.createElement('option');
    randomOption.value = 'random';
    randomOption.textContent = t('scenarioRandom');
    select.appendChild(randomOption);
    DATA.scenarios.forEach(scenario => {
      const option = document.createElement('option');
      option.value = scenario.id;
      option.textContent = l(scenario.name);
      select.appendChild(option);
    });
    select.value = Array.from(select.options).some(option => option.value === current) ? current : 'random';
  }


  function populateChallengeOptions() {
    const select = $('#challenge-select');
    if (!select) return;
    const current = select.value || 'standard';
    select.innerHTML = DATA.challenges.map(challenge => {
      const unlocked = challengeUnlocked(challenge);
      const label = t(challenge.nameKey);
      const suffix = unlocked ? ` · ×${formatNumber(challenge.rewardMultiplier || 1, 1)}` : ` · ${t('challengeLocked')}`;
      return `<option value="${challenge.id}" ${unlocked ? '' : 'disabled'}>${esc(label + suffix)}</option>`;
    }).join('');
    const allowed = DATA.challenges.find(item => item.id === current && challengeUnlocked(item));
    select.value = allowed ? current : 'standard';
  }

  function updateChallengePreview() {
    const target = $('#challenge-preview');
    if (!target) return;
    const id = $('#challenge-select') ? $('#challenge-select').value : 'standard';
    const challenge = DATA.challenges.find(item => item.id === id) || DATA.challenges[0];
    const completed = Number(metaState.campaignsCompleted || 0);
    target.innerHTML = `<span class="challenge-preview-icon">${icon(challenge.id === 'standard' ? 'flag' : challenge.id === 'no-debt' ? 'bank' : challenge.id === 'hard-season' ? 'warning' : 'eye', { size: 20 })}</span>
      <span><strong>${esc(t(challenge.nameKey))}</strong><small>${esc(t(challenge.descriptionKey))}</small></span>
      <span class="challenge-reward">×${formatNumber(challenge.rewardMultiplier || 1, 1)}<small>${esc(t('challengeReward'))}</small></span>
      <span class="meta-progress">${esc(t('campaignsCompleted'))}: ${completed}</span>`;
  }

  function previewSelectedScenario() {
    const scenarioId = $('#scenario-select').value || 'random';
    const seed = $('#session-seed').value.trim() || 'RUDN-2026';
    const challengeId = $('#challenge-select') ? $('#challenge-select').value : 'standard';
    const preview = Engine.createState({ name: '', group: '', scenarioId, challengeId, seed, language, soundEnabled: true });
    return Engine.getScenario(preview);
  }

  function updateStartScenarioPreview() {
    const target = $('#start-card-scenario-preview');
    if (!target) return;
    const scenario = previewSelectedScenario();
    target.textContent = `${l(scenario.name)} · ${l(scenario.description)}`;
    updateChallengePreview();
  }

  function toggleLanguage() {
    language = window.GovernorGame.I18n.ready()?({ru:'en',en:'zh',zh:'ru'}[language]||'ru'):(language==='ru'?'en':'ru');
    savePrefs({ language });
    applyTranslations();
  }

  function currentSoundEnabled() {
    if (state) return state.soundEnabled !== false;
    const prefs = getPrefs();
    return prefs.soundEnabled !== false;
  }

  function toggleSound() {
    const next = !currentSoundEnabled();
    savePrefs({ soundEnabled: next });
    if (state) {
      state.soundEnabled = next;
      saveState(false);
    }
    updateSoundButtons();
    if (next) playSound('select');
  }

  function updateSoundButtons() {
    const enabled = currentSoundEnabled();
    ['start-sound', 'sound-toggle'].forEach(id => {
      const button = document.getElementById(id);
      if (!button) return;
      button.innerHTML = icon(enabled ? 'sound' : 'mute', { size: 20 });
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('title', t('sound'));
    });
  }

  function playSound(type) {
    if (!currentSoundEnabled()) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const now = audioContext.currentTime;
      const notes = type === 'confirm'
        ? [{ f: 440, d: 0 }, { f: 554, d: 0.07 }, { f: 659, d: 0.14 }]
        : type === 'warning'
          ? [{ f: 210, d: 0 }, { f: 165, d: 0.08 }]
          : [{ f: 520, d: 0 }];
      notes.forEach((note, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = type === 'warning' ? 'triangle' : 'sine';
        oscillator.frequency.value = note.f;
        gain.gain.setValueAtTime(0.0001, now + note.d);
        gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.06 : 0.045, now + note.d + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note.d + 0.13);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(now + note.d);
        oscillator.stop(now + note.d + 0.15);
      });
    } catch (_) {}
  }

  function setupAgendaUI() {
    AgendaUI.init({state:()=>state,language:()=>language,choose:chooseAgendaTopic,navigate:setView,return:()=>{
      setView(state?.completed?'map':'mission');
      if(state && state.turnIndex===5 && !state.awaitingContinue && !state.completed)Presentation.maybeChapter();
    }});
    const updateMode=()=>{const en=language==='en';
      $('#campaign-mode-label').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Маршрут кампании'),()=>('Campaign route'));
      $('#campaign-mode').options[0].textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Своя повестка · первые пять лет на ваш выбор'),()=>('Your agenda · choose the first five years'));
      $('#campaign-mode').options[1].textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Последовательный маршрут · фиксированный порядок'),()=>('Guided route · fixed sequence'));
      $('#campaign-mode-hint').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('В обоих вариантах 20 лет. Последующие главы сохраняют сюжетный порядок.'),()=>('20 years in either route. Later chapters remain story-led.'));
      $('#save-legacy').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Открыть сохранение 0.8'),()=>('Open a 0.8 autosave'));
    };
    updateCampaignModeLabels=updateMode;updateMode();$('#campaign-mode').addEventListener('change',updateMode);
    $('#save-legacy').addEventListener('click',()=>{importRequest++;const legacy=store.legacy();if(!legacy.state)return;pendingImport=legacy.state;
      $('#save-status').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Партия 0.8 проверена. Она продолжится по прежнему, последовательному маршруту. Исходное сохранение 0.8 не перезаписывается.'),()=>('The 0.8 game has been checked. It keeps its guided route; the original 0.8 autosave will not be overwritten.'));
      $('#save-import-confirm').hidden=false;});
    document.addEventListener('click',e=>{if(e.target.closest('#language-toggle,#start-language'))setTimeout(updateMode,0);});
  }

  let setupBeforeRecovery=null;
  function updateRecoverySetup(){
    const on=$('#recovery-case').checked;
    const budgetInput=$('#budget-review-mode');
    if(on&&budgetInput.checked){budgetInput.dataset.previous='1';budgetInput.checked=false;}
    if(!on&&budgetInput.dataset.previous==='1'){budgetInput.checked=true;delete budgetInput.dataset.previous;}
    budgetInput.disabled=on;
    $('#budget-review-mode-label').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Дефицит требует решения'),()=>('Every shortfall needs a decision'));
    $('#budget-review-mode-hint').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Реальные разрывы бюджета: резерв, ограниченный заём, помощь с условиями. Без автоматического спасения; возможна досрочная передача управления. Только для новой партии, отдельно от «Счёта из прошлого».'),()=>('Actual cash gaps: reserves, a capped loan or conditional support. No automatic bailout; an early handover is possible. New campaigns only, separate from An inherited bill.'));
    $('#recovery-case-label').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Особое начало: «Счёт из прошлого»'),()=>('Special opening: An inherited bill'));
    $('#recovery-case-hint').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Резерв, помощь с условиями или заём. Учебный кейс: сбалансированная область, обычные правила, открытая повестка. Дальше – та же кампания из 20 лет.'),()=>('Reserves, conditional support or a loan. Classroom case: balanced region, standard rules and open agenda, followed by the same 20-year campaign.'));
    const fields=['scenario-select','challenge-select','campaign-mode'];
    if(on&&!setupBeforeRecovery)setupBeforeRecovery=fields.map(id=>$('#'+id).value);
    if(on){$('#scenario-select').value='balanced';$('#challenge-select').value='standard';$('#campaign-mode').value='agenda';}
    else if(setupBeforeRecovery){fields.forEach((id,i)=>$('#'+id).value=setupBeforeRecovery[i]);setupBeforeRecovery=null;}
    fields.forEach(id=>$('#'+id).disabled=on);
    updateStartScenarioPreview();
  }
  function recoveryBrief(host,after){
    host?.querySelectorAll('.recovery-brief').forEach(n=>n.remove());
    if(host&&BudgetReview.active(state)){
      host.querySelectorAll('.budget-brief').forEach(n=>n.remove());
      const div=document.createElement('div');div.innerHTML=BudgetReviewUI.brief(state,language);
      if(after)after.after(div.firstElementChild);else host.prepend(div.firstElementChild);BudgetReviewUI.attach(host);
    }
    if(!host||!Recovery.active(state))return;
    const div=document.createElement('div');div.innerHTML=RecoveryUI.brief(state,language);
    const b=div.firstElementChild;if(after)after.after(b);else host.prepend(b);RecoveryUI.attach(host);
  }

  function startCampaign(event) {
    event.preventDefault();
    if(!writerReady||blockedByOtherTab)return;
    if(savedState&&!window.confirm(globalThis.GovernorGame.I18n.choose(language,()=>('Начать новую партию? Предыдущая автокопия останется резервной.'),()=>('Start a new game? The old autosave will remain as a backup.'))))return;
    const name = Platform?.profile?.name||$('#player-name').value.trim();
    const group = Platform?.profile?.group??$('#player-group').value.trim();
    const error = $('#start-error');
    if (!name) {
      error.textContent = globalThis.GovernorGame.I18n.choose(language,()=>('Укажите имя персонажа. Учебная группа необязательна.'),()=>('Enter a character name. A student group is optional.'));
      $('#player-name').setAttribute('aria-invalid','true');
      $('#player-name').focus();
      playSound('warning');
      return;
    }
    $('#player-name').removeAttribute('aria-invalid');
    error.textContent = '';
    state = Engine.createState({
      name,
      group,
      recoveryCase: $('#recovery-case').checked?Recovery.CASE:undefined,
      budgetMode: $('#budget-review-mode').checked?'decisions':'automatic',
      scenarioId: $('#scenario-select').value,
      challengeId: $('#challenge-select').value,
      campaignMode: $('#campaign-mode').value,
      seed: $('#session-seed').value.trim(),
      language,
      soundEnabled: currentSoundEnabled()
    });
    Platform?.onNewRun?.(state);
    selectedActionId = null;
    selectedFundingMode = null;
    selectedPlacementId = null;
    resolutionShown = false;
    saveState(false);
    showGame();
    playSound('confirm');
  }

  function continueSavedCampaign() {
    if(!writerReady||blockedByOtherTab)return;
    const restored = savedState && Engine.restoreState(savedState);
    if (!restored) return;
    state = restored;
    Platform?.onSaved?.(state);
    language = state.language || language;
    selectedActionId = state.awaitingContinue ? state.selectedActionId : (state.draft?.actionId || null);
    selectedFundingMode = state.awaitingContinue ? state.selectedFundingMode : (state.draft?.fundingMode || null);
    selectedPlacementId = state.awaitingContinue ? state.selectedPlacementId : (state.draft?.placementId || null);
    resolutionShown = false;
    applyTranslations();
    showGame();
  }

  function showGame() {
    if (!state.storiesRunId) {
      const legacyCompleted = state.completed && metaState.recordedSessions.includes(state.sessionId);
      state.storiesRunId = legacyCompleted ? `legacy:${state.sessionId}` : `run-${window.crypto?.randomUUID?.() || Date.now() + '-' + Math.floor(Math.random()*1e9)}`;
      // A completed legacy campaign has already unlocked its rewards. Link identities,
      // rather than awarding the same completion again during migration.
      if (legacyCompleted && !metaState.recordedSessions.includes(state.storiesRunId)) {
        metaState.recordedSessions.push(state.storiesRunId);
        saveMetaState();
      }
      saveState(false);
    }
    $('#start-screen').classList.add('hidden');
    $('#game-shell').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'auto' });
    state.activeView = state.activeView || 'mission';
    renderGame();
    requestAnimationFrame(() => {
      if(Platform?.canWrite?.()===false)return;
      $('#main-game').focus({ preventScroll: true });
      if(BudgetReview.locked(state)){BudgetReviewUI.open();}
      else if(Recovery.pending(state)){RecoveryUI.open();}
      else if (state.awaitingContinue && !resolutionShown) {
        const record = state.history[state.history.length - 1];
        if (record) showResolution(record);
      } else if (state.completed) {
        showEndScreen();
      } else if (!(Agenda.mode(state)==='agenda' && state.turnIndex===5 && state.activeView==='agenda')) { Presentation.maybeChapter(); }
    });
  }

  function showStartScreen() {
    $('#game-shell').classList.add('hidden');
    $('#start-screen').classList.remove('hidden');
    $('#continue-campaign').classList.toggle('hidden', !savedState);
    if(savedState?.completed) $('#continue-campaign').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Открыть итоги завершённого срока'),()=>('Revisit the completed term'));
    populateChallengeOptions();
    updateStartScenarioPreview();
    updateChallengePreview();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function chooseAgendaTopic(id) {
    if (!writerReady || blockedByOtherTab || !state || state.awaitingContinue || state.completed) return;
    try {
      Engine.chooseAgenda(state,id);selectedActionId=null;selectedFundingMode=null;selectedPlacementId=null;
      saveState(false);renderGame();
      $('#mission-title').setAttribute('tabindex','-1');$('#mission-title').focus({preventScroll:true});
      if(innerWidth<=900)$('#mission-panel').scrollIntoView({block:'start',behavior:'auto'});
    } catch(e) { toast(globalThis.GovernorGame.I18n.choose(language,()=>('Вопрос недоступен'),()=>('Issue unavailable')),financialReason(e.message,language)||e.message,'warning'); }
  }

  function renderGame() {
    if (!state) return;
    $('#game-shell').classList.toggle('agenda-route',Agenda.mode(state)==='agenda');
    if (Agenda.needsChoice(state) && state.activeView === 'mission') state.activeView = 'agenda';
    renderTopbar();
    renderNavigation();
    renderMapStage();
    renderMissionPanel();
    scrollMissionToTop('auto');
    renderFooter();
    Presentation.yearNote(state);
    renderStoryBrief();
    if (state.activeView && state.activeView !== 'mission') renderSecondaryStage(state.activeView);
    else showMissionView();
    recoveryBrief($('#mission-panel'),$('#mission-description'));
  }

  function renderStoryBrief() {
    if (!state) return;
    const content = StoriesUI.briefHtml(state, language);
    let mobile = $('#stories-mobile-brief');
    if (!mobile) { mobile=document.createElement('div');mobile.id='stories-mobile-brief';$('#resident-brief-container').after(mobile); }
    mobile.innerHTML=content;StoriesUI.attachBrief(mobile);
    const tip=$('.footer-tip');
    if(content){tip.innerHTML=content;tip.classList.add('story-footer-tip');StoriesUI.attachBrief(tip);}
    else{tip.classList.remove('story-footer-tip');tip.innerHTML=`<span id="tip-icon">${icon('info',{size:21})}</span><div><strong>${esc(t('proTip'))}</strong><p>${esc(t('proTipText'))}</p></div>`;}
  }

  function renderTopbar() {
    const previous = state.history[state.history.length - 1];
    const finance = Engine.getFinanceSummary(state);
    $('#budget-value').textContent = formatBudget(finance.treasury, true);
    const balancePrefix = finance.operatingBalance > 0 ? '+' : finance.operatingBalance < 0 ? '−' : '';
    const balanceValue = formatNumber(Math.abs(finance.operatingBalance), 1);
    $('#budget-income').textContent = `${balancePrefix}${balanceValue} · ${t('reserve')} ${formatNumber(finance.reserve, 1)}`;
    $('#budget-income').className = finance.operatingBalance < 0 ? 'negative' : '';
    $('#treasury-shortcut').setAttribute('aria-label', `${t('openTreasury')}: ${formatBudget(finance.treasury, false)}`);
    $('#support-value').textContent = `${formatNumber(state.stats.support, 0)}%`;
    $('#development-value').textContent = formatNumber(state.stats.development, 0);
    $('#support-trend').textContent = previous ? formatSigned(previous.effects.support, '') : '';
    $('#development-trend').textContent = previous ? formatSigned(previous.effects.development, '') : '';

    const chapterNumber = Engine.getChapter(state);
    const chapter = (DATA.chapters || []).find(item => item.id === chapterNumber);
    $('#chapter-number').textContent = String(chapterNumber);
    $('#chapter-title').textContent = chapter ? t(chapter.titleKey) : t(`chapter${chapterNumber === 1 ? 'One' : chapterNumber === 2 ? 'Two' : chapterNumber === 3 ? 'Three' : 'Four'}`);
    $('#turn-value').textContent = `${state.population.baseYear + (state.completed ? state.history.length : state.turnIndex)}`;
    $('#turn-value').title = `${state.turnIndex + 1} / ${DATA.missions.length}`;
    const chapterMissions = DATA.missions.filter(item => item.chapter === chapterNumber);
    const chapterIndex = state.turnIndex % 5;
    $('#chapter-dots').innerHTML = chapterMissions.map((_, index) => {
      const cls = index < chapterIndex ? 'done' : index === chapterIndex ? 'active' : '';
      return `<i class="${cls}" aria-hidden="true"></i>`;
    }).join('');
    const challenge = Engine.getChallenge(state);
    const challengeChip = $('#challenge-active');
    challengeChip.textContent = challenge.id === 'standard' ? '' : `${t('challengeActive')}: ${t(challenge.nameKey)} ×${formatNumber(challenge.rewardMultiplier, 1)}`;
    challengeChip.classList.toggle('hidden', challenge.id === 'standard');

    $('#profile-avatar').textContent = initials(state.profile.name);
    $('#profile-name').textContent = state.profile.name;
    $('#profile-level').textContent = `${t('level')} ${Engine.getLevel(state)} · ${state.stars} ★`;
    updateSoundButtons();
  }

  function renderNavigation() {
    const view = state.activeView || 'mission';
    $$('.nav-button[data-view], .mobile-bottom-nav [data-view]').forEach(button => {
      button.classList.toggle('active', button.dataset.view === view || (view === 'agenda' && button.dataset.view === 'mission') || ((view === 'residents' || view === 'stories') && button.dataset.view === 'map') || (button.classList.contains('mobile-primary') && view === 'mission'));
    });
    const incompleteQuests = DATA.quests.filter(quest => !Engine.questStatus(state, quest).complete).length;
    $('#quest-badge').textContent = String(incompleteQuests);
    $('#badge-count').textContent = String(state.badges.length);
    $('#game-shell').classList.toggle('secondary-active', view !== 'mission');
  }

  function worldCallbacks() {
    return {onDistrict: id => showDistrictDialog(id), onProject: id => showProjectDialog(id), onPortfolio: () => showProjectGallery(), onVisit: id => Presentation.visit(id)};
  }

  function projectDialogHooks() {
    return {inspect:showProjectDialog,gallery:showProjectGallery,library:showAssetLibrary,delivery:showDeliveryDesk,renew:showRenewalDialog,people:id=>{
      $('#district-dialog').close();state.residentSelection=id;setView('residents');
    }};
  }
  function showDeliveryDesk() {
    window.GovernorGame.DeliveryUI.render($('#district-dialog-content'),state,language,projectDialogHooks());
    openProjectWindow();
  }
  function showRenewalDialog(id) {
    if(!state || !Engine.renewalQuote(state,id).eligible) return;
    let submitted=false;
    window.GovernorGame.DeliveryUI.confirmation($('#district-dialog-content'),state,id,language,{
      cancel:()=>showProjectDialog(id),
      confirm:()=>{
        if(submitted || blockedByOtherTab || !writerReady) return;
        if(!Engine.renewalQuote(state,id).available){
          const message=$('.renew-error');message.hidden=false;
          message.textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Условия изменились. Вернитесь к проекту и проверьте казну.'),()=>('Conditions changed. Return to the project and check the treasury.'));return;
        }
        try {
          submitted=true;
          const record=Engine.renewProgramme(state,id);
          const saved=saveState(false);renderGame();showProjectDialog(id);
          toast(globalThis.GovernorGame.I18n.choose(language,()=>('Контракт продлён на три года'),()=>('Contract renewed for three years')),
            (globalThis.GovernorGame.I18n.choose(language,()=>('Расход сейчас: '),()=>('Charged now: ')))+formatBudget(record.fee,true)+(saved===false?(globalThis.GovernorGame.I18n.choose(language,()=>(' · Скачайте сохранение: запись на устройство не удалась.'),()=>(' · Export a save: writing to the device failed.'))) : ''),'check');
        } catch(error){submitted=false;const m=$('.renew-error');if(m){m.hidden=false;m.textContent=error.message;}}
      }
    });
    openProjectWindow();
  }
  function showProjectGallery() {
    ProjectUI.gallery($('#district-dialog-content'),state,language,projectDialogHooks());
    openProjectWindow();
  }
  function showAssetLibrary() {
    ProjectUI.library($('#district-dialog-content'),language,projectDialogHooks());
    openProjectWindow();
  }
  let projectOrigin=null;
  function openProjectWindow() {
    const d=$('#district-dialog');
    if(!d.open)projectOrigin=document.activeElement;d.classList.add('illustrated-project-dialog');
    d.setAttribute('aria-labelledby','project-visit-title');
    if(!d.open)d.showModal();
    const h=d.querySelector('h2');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}
    d.scrollTop=0;
  }
  function showProjectDialog(id) {
    if (!state.finance.portfolio.some(p=>p.id===id)) return;
    ProjectUI.render($('#district-dialog-content'),state,id,language,projectDialogHooks());
    window.GovernorGame.DeliveryUI.projectBlock($('#district-dialog-content'),state,id,language,projectDialogHooks());
    openProjectWindow();
  }

  function renderMapStage() {
    WorldUI.mount($('#main-world'),state,language,worldCallbacks());
    const advisorContainer = $('#advisor-portraits');
    advisorContainer.innerHTML = DATA.advisors.map(advisor => {
      const trust = Number(state.advisorTrust[advisor.id] || 50);
      return `<button class="advisor-button" type="button" data-advisor="${advisor.id}" aria-label="${esc(l(advisor.name))}, ${esc(l(advisor.role))}, ${t('advisorTrust')} ${trust}">
        <span class="portrait-frame" style="--trust:${trust}"><img src="${advisor.image}" alt=""><span class="advisor-trust">${formatNumber(trust, 0)}</span></span>
        <strong>${esc(l(advisor.role))}</strong>
      </button>`;
    }).join('');
    advisorContainer.querySelectorAll('[data-advisor]').forEach(button => {
      button.addEventListener('click', () => showAdvisorDialog(button.dataset.advisor));
    });
  }

  function renderCouncilDebate() {
    const container = $('#council-debate');
    const mission = Engine.getCurrentMission(state);
    const ids = Array.isArray(mission.debate) ? mission.debate : [];
    if (!ids.length) {
      container.className = 'council-debate hidden';
      container.innerHTML = '';
      return;
    }
    const cards = ids.map(id => {
      const advisor = DATA.advisors.find(item => item.id === id);
      if (!advisor) return '';
      const trust = Number(state.advisorTrust[id] || 50);
      const advice = mission.advisors && mission.advisors[id] ? mission.advisors[id] : advisor.principle;
      return `<button type="button" class="debate-advisor" data-debate-advisor="${id}">
        <img src="${advisor.image}" alt=""><span><small>${esc(l(advisor.role))} · ${esc(t('advisorTrust'))} ${formatNumber(trust, 0)}</small><strong>${esc(l(advice))}</strong></span>
      </button>`;
    }).join('');
    const split = ids.length > 1;
    container.className = 'council-debate';
    container.innerHTML = `<div class="debate-heading">${icon(split ? 'balance' : 'people', { size: 16 })}<span>${esc(split ? t('councilSplit') : t('councilAgreement'))}</span></div><div class="debate-grid">${cards}</div>`;
    container.querySelectorAll('[data-debate-advisor]').forEach(button => button.addEventListener('click', () => showAdvisorDialog(button.dataset.debateAdvisor)));
  }

  function renderMissionPanel() {
    const mission = Engine.getCurrentMission(state);
    if (!mission) return;
    const missionPanel = $('#mission-panel');
    if (Agenda.needsChoice(state)) { $('#action-cards').innerHTML='';$('#confirm-action').disabled=true;return; }
    if (missionPanel.dataset.missionId !== mission.id) { $('#mission-context').open = false; missionPanel.dataset.missionId = mission.id; }
    const fundingStep = Boolean(selectedActionId && !state.awaitingContinue);
    missionPanel.classList.toggle('funding-step', fundingStep);
    missionPanel.dataset.phase = mission.threadPhase || 'design';
    const choiceHeading = missionPanel.querySelector('.choice-heading h3');
    if (choiceHeading) choiceHeading.textContent = fundingStep ? t('selectedActionStep') : t('chooseAction');
    $('#mission-icon').innerHTML = icon(mission.icon, { size: 29 });
    const phaseIcon = mission.threadPhase === 'crisis' ? 'warning' : mission.threadPhase === 'legacy' ? 'trophy' : mission.threadPhase === 'delivery' ? 'construction' : 'quest';
    $('#mission-ribbon-icon').innerHTML = icon(phaseIcon, { size: 23 });
    $('#mission-kicker').textContent = l(mission.kicker);
    $('#mission-title').textContent = Agenda.mode(state)==='agenda' && mission.id==='health-delivery' ? (globalThis.GovernorGame.I18n.choose(language,()=>('Северная медицина: следующий шаг'),()=>('Northern healthcare: the next step'))) : l(mission.title);
    $('#mission-description').textContent = l(mission.description);
    AgendaUI.context(missionPanel, state, mission, language);
    $('#mission-objective').innerHTML = `<strong>${globalThis.GovernorGame.I18n.choose(language,()=>('Задача:'),()=>('Objective:'))}</strong> ${esc(l(mission.objective))}`;
    $('#footer-mission-title').textContent = l(mission.title);
    $('#reward-xp').textContent = `+${Math.round(100 * (state.rewardMultiplier || 1))}`;
    $('#reward-stars').textContent = globalThis.GovernorGame.I18n.choose(language,()=>('за исполнение'),()=>('for delivery'));

    const residentId = mission.districtId;
    $('#resident-brief-container').innerHTML = PeopleUI.briefing(state, residentId, language);
    $('#resident-brief-container').querySelector('[data-resident-open]')?.addEventListener('click', () => { state.residentSelection = residentId; setView('residents'); });
    renderEntryImpact();
    renderCouncilDebate();
    renderActionCards();
    renderSelectedPreview();
    let governanceBrief = $('#governance-brief-container');
    if (!governanceBrief) { governanceBrief = document.createElement('div'); governanceBrief.id='governance-brief-container'; $('#mission-context').append(governanceBrief); }
    governanceBrief.innerHTML = GovUI.briefing(state, language); GovUI.attach(governanceBrief);
    $('#mission-context').querySelector('summary').after($('#mission-objective'));
    $('#mission-context').append(governanceBrief);

    const confirm = $('#confirm-action');
    const preview = selectedActionId ? Engine.previewAction(state, selectedActionId, selectedFundingMode, selectedPlacementId) : null;
    const hasMeeting = Boolean(Governance.sceneFor(mission.id)) && !preview?.action.deferred;
    const basePreview = hasMeeting && selectedActionId ? Engine.previewAction(state, selectedActionId, selectedFundingMode, selectedPlacementId, []) : preview;
    confirm.disabled = !basePreview || !basePreview.plan || (!hasMeeting && !basePreview.affordable) || state.awaitingContinue || state.completed;
    if (state.awaitingContinue) {
      confirm.querySelector('[data-ui]').textContent = globalThis.GovernorGame.I18n.choose(language,()=>('Решение уже принято'),()=>('Decision already confirmed'));
    } else {
      confirm.querySelector('[data-ui]').textContent = hasMeeting ? (globalThis.GovernorGame.I18n.choose(language,()=>('Обсудить условия'),()=>('Discuss terms'))) : t('confirmAction');
    }
  }

  function renderEntryImpact() {
    const panel = $('#entry-impact');
    const entry = state.currentEntry;
    if (!entry) {
      panel.className = 'entry-impact hidden';
      panel.innerHTML = '';
      return;
    }
    panel.className = `entry-impact ${entry.classification}`;
    const title = entry.classification === 'prepared'
      ? t('reducedImpact')
      : entry.classification === 'unprepared'
        ? t('highImpact')
        : t('neutralImpact');
    const effects = [
      entry.effects.budget ? `<span>${t('budget')} ${formatSigned(entry.effects.budget)}</span>` : '',
      entry.effects.reserve ? `<span>${t('reserve')} ${formatSigned(entry.effects.reserve)}</span>` : '',
      entry.effects.debt ? `<span>${t('debt')} ${formatSigned(entry.effects.debt)}</span>` : '',
      entry.effects.support ? `<span>${t('support')} ${formatSigned(entry.effects.support)}</span>` : '',
      entry.effects.development ? `<span>${t('development')} ${formatSigned(entry.effects.development)}</span>` : ''
    ].filter(Boolean).join('');
    const notes = (entry.bonusNotes || []).map(note => `<p>${esc(l(note))}</p>`).join('');
    const reserveNote = entry.finance && entry.finance.reserveUsed > 0
      ? `<p class="reserve-note">${icon('shield', { size: 14 })}${esc(t('reserveProtected'))}: ${formatBudget(entry.finance.reserveUsed, false)}</p>`
      : '';
    panel.innerHTML = `<span class="entry-icon">${icon(entry.classification === 'prepared' ? 'shield' : 'warning', { size: 20 })}</span>
      <div><strong>${esc(title)}</strong><p>${esc(l(entry.text))}</p>${reserveNote}${notes}<div class="entry-numbers">${effects}</div></div>`;
  }

  function renderActionCards() {
    const mission = Engine.getCurrentMission(state);
    const cards = $('#action-cards');
    cards.classList.toggle('has-selection', Boolean(selectedActionId));
    const hideExact = Boolean(state.rules && state.rules.hideExactPreview);
    cards.innerHTML = mission.actions.map(action => {
      const preview = Engine.previewAction(state, action.id, null, null);
      const selected = selectedActionId === action.id;
      const effective = preview.effectiveAction || action;
      const futureStrength = Object.values(preview.immediateResilience || {}).reduce((sum, value) => sum + Number(value || 0), 0)
        + Object.values(preview.activationResilience || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      const kind=WorldModel.kind({actionId:action.id,districtId:mission.districtId});
      const artSource=Art.image({...preview.project,actionId:action.id,districtId:mission.districtId},{thumb:true,phase:'planned'});
      const art = `<div class="action-art illustrated-action ${artSource.contextual?'programme-art':'direct-programme-art'}">${Art.tag(artSource)}${artSource.contextual?`<span class="programme-art-symbol" title="${globalThis.GovernorGame.I18n.choose(language,()=>('Программа без нового здания'),()=>('Programme, not a new building'))}">${icon(action.icon||mission.icon,{size:27})}</span>`:''}</div>`;
      const contribution = preview.affordable ? preview.minimumTreasuryCost : Math.abs(Number(effective.cost) || 0);
      const interactionBadge = preview.interactions.length
        ? `<span class="interaction-mini ${preview.interactions.some(item => item.type === 'conflict') ? 'conflict' : 'synergy'}">${icon(preview.interactions.some(item => item.type === 'conflict') ? 'conflict' : 'link', { size: 12 })}${preview.interactions.length}</span>`
        : '';
      const costText = hideExact ? `${icon('eye', { size: 13 })} ${esc(t('exactForecastHidden'))}` : `${icon('coins', { size: 14 })} ${globalThis.GovernorGame.I18n.choose(language,()=>('от'),()=>('from'))} ${formatBudget(contribution, true)}`;
      const futureText = `${icon('clock', { size: 13 })} ${esc(formatTurns(preview.project?.startsIn||0))}`;
      if(action.deferred)return `<button class="action-card defer-action ${selected?'selected':''}" type="button" role="radio" aria-checked="${selected}" data-action="${action.id}"><span>${icon('clock',{size:19})}</span><div><strong>${esc(l(action.title))}</strong><small>${esc(globalThis.GovernorGame.I18n.choose(language,()=>('Без нового проекта и новых расходов; проблема остаётся.'),()=>('No new project or spending; the problem remains.')))}</small></div></button>`;
      return `<button class="action-card ${selected ? 'selected' : ''} ${preview.affordable ? '' : 'disabled'}" type="button" role="radio" aria-checked="${selected}" aria-disabled="${!preview.affordable}" data-action="${action.id}">
        <span class="selected-check">${icon('check', { size: 15 })}</span>
        ${art}
        <div class="action-card-heading"><h4>${esc(l(action.title))}</h4>${interactionBadge}<span class="risk-mini ${preview.deliveryRiskLabel}">${icon('clock', { size: 12 })}${esc(deliveryRiskText(preview.deliveryRiskLabel))}</span></div>
        <p>${esc(l(action.description))}</p>
        <span class="action-card-footer">
          <span class="cost-chip ${hideExact ? 'fog' : ''}">${costText}</span>
          <span class="future-chip">${futureText}</span>
        </span>
        ${preview.affordable ? '' : `<span class="disabled-label">${esc(financialReason(preview.plan?.reasonCode,language)||t('fundingUnavailable'))}</span>`}
      </button>`;
    }).join('');

    cards.querySelectorAll('[data-action]').forEach(card => {
      card.addEventListener('click', () => selectAction(card.dataset.action));
    });
  }

  function selectAction(actionId) {
    if (state.awaitingContinue || state.completed) return;
    const preview = Engine.previewAction(state, actionId);
    if (!preview) return;
    if (!preview.affordable) {
      toast(t('fundingUnavailable'), financialReason(preview.plan?.reasonCode,language)||`${t('budget')}: ${formatBudget(state.stats.budget, false)}`, 'warning');
      playSound('warning');
      return;
    }
    selectedActionId = actionId;
    selectedFundingMode = preview.recommendedFundingMode || (preview.plan && preview.plan.id) || 'treasury';
    selectedPlacementId = preview.recommendedPlacementId || null;
    playSound('select');
    renderMissionPanel();
    const mission = Engine.getCurrentMission(state);
    const index = mission.actions.findIndex(item => item.id === actionId);
    const card = $(`[data-action="${CSS.escape(actionId)}"]`);
    if (card && window.innerWidth <= 900) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    requestAnimationFrame(() => {
      scrollMissionToTop('smooth');
      const panel = $('#mission-panel');
      if (panel && window.innerWidth <= 900) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#screen-reader-live').textContent = `${t('selected')}: ${l(mission.actions[index].title)}. ${t('fundingTitle')}: ${fundingName(selectedFundingMode)}`;
    saveState(false);
  }

  function renderSelectedPreview() {
    const container = $('#selected-preview');
    if (!selectedActionId) {
      container.innerHTML = `<div class="preview-placeholder"><span>${icon('coins', { size: 18 })}</span><span>${esc(t('noDecisionYet'))}</span></div>`;
      return;
    }

    let preview = Engine.previewAction(state, selectedActionId, selectedFundingMode, selectedPlacementId);
    if (!preview) return;
    // A selected unavailable funding source stays selected and cannot be committed.
    // Never silently replace debt/reserve/cofinancing after a placement change.
    if (!preview.plan) {
      container.innerHTML = `<div class="implementation-status blocked">${icon('warning', { size: 17 })}<span>${esc(t('fundingUnavailable'))}</span></div>`;
      return;
    }

    const plan = preview.plan;
    const hideExact = Boolean(state.rules && state.rules.hideExactPreview);
    const effectValue = (value,key) => hideExact ? directionSymbol(value) : effectRangeText(preview.expectedRange?.[key]||[value,value]);
    const effectChips = [
      `<span class="effect-chip budget">${icon('coins', { size: 14 })}${hideExact ? '−' : formatSigned(preview.effects.budget)}</span>`,
      `<span class="effect-chip ${statClass(preview.effects.support)}">${icon('people', { size: 14 })}${effectValue(preview.effects.support,'support')}</span>`,
      `<span class="effect-chip ${statClass(preview.effects.development)}">${icon('development', { size: 14 })}${effectValue(preview.effects.development,'development')}</span>`
    ].join('');

    const placements = preview.placements || [];
    const placementSelector = placements.length ? `<div class="placement-selector">
      <div class="funding-selector-title"><span>${icon('location', { size: 17 })}</span><div><strong>${esc(t('placementTitle'))}</strong><small>${esc(t('placementHint'))}</small></div></div>
      <div class="placement-options">${placements.map(placement => {
        const selected = preview.placement && preview.placement.id === placement.id;
        const costDelta = Math.round((Number(placement.costMultiplier || 1) - 1) * 100);
        const modifiers = [
          costDelta ? `${costDelta > 0 ? '+' : ''}${costDelta}%` : '',
          placement.delayDelta ? `${placement.delayDelta > 0 ? '+' : ''}${placement.delayDelta} ${t('turns')}` : '',
          Number(placement.effects && placement.effects.support || 0) ? `${icon('people', { size: 11 })}${formatSigned(placement.effects.support)}` : '',
          Number(placement.effects && placement.effects.development || 0) ? `${icon('development', { size: 11 })}${formatSigned(placement.effects.development)}` : ''
        ].filter(Boolean).join(' · ');
        return `<button class="placement-option ${selected ? 'selected' : ''}" type="button" data-placement-id="${placement.id}" aria-pressed="${selected}">
          <span class="placement-icon">${icon(placement.icon || 'location', { size: 17 })}</span><span><strong>${esc(l(placement.title))}</strong><small>${modifiers || esc(t('projectOnMap'))}</small></span>${placement.recommended ? `<b>${esc(t('recommendedPlacement'))}</b>` : ''}
        </button>`;
      }).join('')}</div>
    </div>` : '';

    const fundingOptions = preview.fundingOptions.map(option => {
      const meta = fundingMeta(option.id);
      const selected = plan && plan.id === option.id;
      const recommendation = option.recommended ? `<b>${esc(t('fundingRecommended'))}</b>` : '';
      const stateLabel = option.available
        ? `${formatBudget(option.treasuryCost, true)} ${globalThis.GovernorGame.I18n.choose(language,()=>('сейчас'),()=>('now'))}`
        : financialReason(option.reasonCode,language) || (option.reasonCode==='agenda-window' ? (globalThis.GovernorGame.I18n.choose(language,()=>('Срок предложения истёк'),()=>('Offer deadline passed'))) : t('fundingUnavailable'));
      return `<button class="funding-option ${selected ? 'selected' : ''} ${option.available ? '' : 'unavailable'}" type="button" data-funding-mode="${option.id}" ${option.available ? '' : 'disabled'} aria-pressed="${selected}">
        <span class="funding-option-icon">${icon(meta.icon, { size: 18 })}</span>
        <span><strong>${esc(fundingName(option.id, true))}</strong><small>${esc(stateLabel)}</small></span>${recommendation}
      </button>`;
    }).join('');

    const launch = preview.project ? preview.project.startsIn : 0;
    const opex = preview.project ? preview.project.annualOpex : 0;
    const commitmentParts = [
      { icon: 'receipt', label: t('totalProjectCost'), value: formatBudget(plan.totalCost, true) },
      { icon: 'vault', label: t('ownContribution'), value: formatBudget(plan.treasuryCost, true) },
      plan.federalTransfer > 0 ? { icon: 'federal', label: t('federalShare'), value: formatBudget(plan.federalTransfer, true) } : null,
      plan.reserveUse > 0 ? { icon: 'shield', label: t('reserveUse'), value: formatBudget(plan.reserveUse, true) } : null,
      plan.debtIssue > 0 ? { icon: 'bank', label: t('debtIssue'), value: formatBudget(plan.debtIssue, true) } : null,
      { icon: 'calendar', label: t('launchIn'), value: formatTurns(launch) },
      opex > 0 ? { icon: 'repeat', label: t('annualOpex'), value: formatBudget(opex, true) } : null,
      plan.firstYearOpex > 0 ? { icon: 'receipt', label: globalThis.GovernorGame.I18n.choose(language,()=>('Содержание уже сейчас'),()=>('Operating cost this year')), value: formatBudget(plan.firstYearOpex, true) } : null,
      { icon: 'capacity', label: t('adminLoad'), value: `${formatNumber(plan.totalAdminLoad, 1)} / ${formatNumber(state.finance.adminCapacity, 1)}` }
    ].filter(Boolean);

    const readiness = plan.implementationFactor >= 0.99
      ? { cls: 'ready', text: t('implementationReady'), icon: 'check' }
      : plan.implementationFactor > 0
        ? { cls: 'tight', text: t('implementationTight'), icon: 'warning' }
        : { cls: 'blocked', text: t('implementationBlocked'), icon: 'warning' };

    const interactions = preview.interactions.length
      ? `<div class="interaction-list"><div class="funding-selector-title"><span>${icon('link', { size: 17 })}</span><strong>${esc(t('portfolioInteraction'))}</strong></div>${preview.interactions.map(item => `<div class="interaction-card ${item.type === 'conflict' ? 'conflict' : 'synergy'}"><span>${icon(item.type === 'conflict' ? 'conflict' : 'link', { size: 17 })}</span><div><strong>${esc(t(item.type === 'conflict' ? 'conflict' : 'synergy'))}</strong><p>${esc(l(item.text))}</p></div></div>`).join('')}</div>`
      : `<div class="interaction-empty">${icon('link', { size: 15 })}<span>${esc(t('noInteractions'))}</span></div>`;

    const risk = `<div class="delivery-risk ${preview.deliveryRiskLabel}"><span>${icon('clock', { size: 17 })}</span><div><small>${esc(t('deliveryRisk'))}</small><strong>${esc(deliveryRiskText(preview.deliveryRiskLabel))}</strong></div><i style="--risk:${Math.round(preview.deliveryRisk * 100)}%"></i></div>`;
    const debateIds = Engine.getCurrentMission(state).debate || [];
    const reactions = preview.advisorReactions.filter(item => debateIds.includes(item.advisorId));
    const reactionStrip = reactions.length ? `<div class="reaction-strip">${reactions.map(reaction => {
      const advisor = DATA.advisors.find(item => item.id === reaction.advisorId);
      return `<span class="reaction-pill ${reaction.stance}"><img src="${advisor.image}" alt=""><b>${esc(l(advisor.role))}</b><small>${esc(t(reaction.stance === 'support' ? 'advisorApproved' : reaction.stance === 'oppose' ? 'advisorOpposed' : 'advisorCautious'))}</small></span>`;
    }).join('')}</div>` : '';

    container.innerHTML = `<div class="preview-content preview-content-stage3">
      <div class="preview-summary"><span class="preview-title">${esc(globalThis.GovernorGame.I18n.choose(language,()=>('Прямой эффект решения'),()=>('Direct policy effect')))}</span><span class="preview-effects">${effectChips}</span><button class="change-decision" type="button">${icon('arrowLeft', { size: 14 })}<span>${esc(t('changeDecision'))}</span></button></div>
      ${hideExact ? `<div class="fog-notice">${icon('eye', { size: 16 })}<span>${esc(t('exactForecastHidden'))}</span></div>` : ''}
      <p class="forecast-scope">${esc(globalThis.GovernorGame.I18n.choose(language,()=>('Диапазон возможного прямого эффекта, не доверительный интервал. Изменения услуг за год и кризисы рассчитываются отдельно.'),()=>('Possible direct-effect bounds, not a confidence interval. Annual service changes and crises are calculated separately.')))}</p>
      ${preview.action.deferred?'':PeopleUI.preview(preview, state, language)}
      ${placementSelector}
      <div class="funding-selector"><div class="funding-selector-title"><span>${icon('coins', { size: 17 })}</span><strong>${esc(t('fundingTitle'))}</strong></div><div class="funding-options">${fundingOptions}</div></div>
      <div class="funding-explainer"><span>${icon(fundingMeta(plan.id).icon, { size: 18 })}</span><p>${esc(fundingReason(plan.id))}</p></div>
      <div class="commitment-summary">${commitmentParts.map(item => `<div class="commitment-chip"><span>${icon(item.icon, { size: 16 })}</span><small>${esc(item.label)}</small><strong>${esc(item.value)}</strong></div>`).join('')}</div>
      <div class="preview-risk-row">${risk}<div class="implementation-status ${readiness.cls}">${icon(readiness.icon, { size: 17 })}<span>${esc(readiness.text)}</span>${plan.implementationFactor < 0.99 && plan.implementationFactor > 0 ? `<small>${globalThis.GovernorGame.I18n.choose(language,()=>('Ожидаемый эффект снижен до'),()=>('Expected effect reduced to'))} ${formatNumber(plan.implementationFactor * 100, 0)}%</small>` : ''}</div></div>
      ${interactions}${reactionStrip}
      <span class="preview-future"><b>${esc(t('strategicEffect'))}:</b> ${esc(l(preview.action.future))}</span>
    </div>`;

    const changeDecision = container.querySelector('.change-decision');
    if (changeDecision) {
      changeDecision.addEventListener('click', () => {
        selectedActionId = null;
        selectedFundingMode = null;
        selectedPlacementId = null;
        playSound('select');
        renderMissionPanel();
        requestAnimationFrame(() => scrollMissionToTop('smooth'));
        saveState(false);
      });
    }

    container.querySelectorAll('[data-funding-mode]').forEach(button => {
      button.addEventListener('click', () => {
        selectedFundingMode = button.dataset.fundingMode;
        playSound('select');
        renderMissionPanel();
        $('#screen-reader-live').textContent = `${t('fundingTitle')}: ${fundingName(selectedFundingMode)}`;
        saveState(false);
      });
    });
    container.querySelectorAll('[data-placement-id]').forEach(button => {
      button.addEventListener('click', () => {
        selectedPlacementId = button.dataset.placementId;
        const updated = Engine.previewAction(state, selectedActionId, selectedFundingMode, selectedPlacementId);
        if (updated && updated.plan && updated.plan.available) selectedFundingMode = updated.plan.id;
        playSound('select');
        renderMissionPanel();
        $('#screen-reader-live').textContent = `${t('location')}: ${l(updated.placement.title)}`;
        saveState(false);
      });
    });
  }

  function renderFooter() {
    const chosen = Boolean(selectedActionId || state.awaitingContinue);
    $('#progress-action').classList.toggle('active', chosen && !state.awaitingContinue);
    $('#progress-action').classList.toggle('done', state.awaitingContinue);
    $('#progress-result').classList.toggle('active', state.awaitingContinue);
    const lines = $$('.progress-line');
    if (lines[0]) lines[0].classList.toggle('done', chosen);
    if (lines[1]) lines[1].classList.toggle('done', state.awaitingContinue);
  }

  function scrollMissionToTop(behavior = 'auto') {
    const scroll = $('#mission-scroll');
    if (scroll) scroll.scrollTo({ top: 0, behavior });
    const panel = $('#mission-panel');
    if (panel && panel.scrollTop) panel.scrollTop = 0;
  }

  function showMissionView() {
    if (Agenda.needsChoice(state)) {
      state.activeView='agenda';$('#map-stage').classList.add('hidden');$('#secondary-stage').classList.remove('hidden');
      renderNavigation();renderSecondaryStage('agenda');return;
    }
    state.activeView = 'mission';
    $('#map-stage').classList.remove('hidden');
    $('#secondary-stage').classList.add('hidden');
    $('#game-shell').classList.remove('secondary-active');
    renderNavigation();
    WorldUI.refreshVisible();
  }

  function setView(view) {
    if (!state) return;
    if (view==='mission' && Agenda.needsChoice(state)) view='agenda';
    state.activeView = view;
    if (state.awaitingContinue) {
      selectedActionId = state.selectedActionId;
      selectedFundingMode = state.selectedFundingMode;
      selectedPlacementId = state.selectedPlacementId;
    }
    saveState(false);
    renderNavigation();
    scrollMissionToTop('auto');
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (view === 'mission') {
      showMissionView();
      if (window.innerWidth <= 900) $('#mission-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      $('#map-stage').classList.add('hidden');
      $('#secondary-stage').classList.remove('hidden');
      renderSecondaryStage(view);
      $('#secondary-stage').scrollTop = 0;
      if (window.innerWidth <= 900) $('#secondary-stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    playSound('select');
  }

  function secondaryHeader(iconName, title, lead) {
    return `<header class="secondary-stage-header">
      <span class="view-icon">${icon(iconName, { size: 29 })}</span>
      <h2>${esc(title)}</h2>
      <p>${esc(lead)}</p>
      <button class="secondary-button back-mission" type="button" style="margin-top:16px;min-height:42px;padding:0 15px">${icon('arrow', { size: 17, className: 'back-arrow' })}<span>${esc(t('backToMission'))}</span></button>
    </header>`;
  }

  function renderSecondaryStage(view) {
    $('#map-stage').classList.add('hidden');
    $('#secondary-stage').classList.remove('hidden');
    $('#game-shell').classList.add('secondary-active');
    const stage = $('#secondary-stage');
    WorldUI.disposeWithin(stage);
    stage.classList.toggle('agenda-stage', view === 'agenda');
    stage.classList.toggle('residents-stage', view === 'residents');
    stage.classList.toggle('atlas-stage', view === 'map');
    stage.classList.toggle('stories-stage', view === 'stories');
    if (view === 'agenda') {
      AgendaUI.render(stage);
      const overview=window.GovernorGame.DeliveryDesk.snapshot(state);
      if(overview.items.length){const b=document.createElement('button');b.type='button';b.className='agenda-delivery-link';b.dataset.openDelivery='';
        b.innerHTML=icon('calendar',{size:19})+'<span>'+(globalThis.GovernorGame.I18n.choose(language,()=>('Уже принятые решения'),()=>('Existing commitments')))+'</span><b>'+
          (globalThis.GovernorGame.I18n.choose(language,()=>((overview.pendingRenewals?overview.pendingRenewals+' продление · ':'' )+overview.attention.length+' требуют внимания'),()=>(overview.attention.length+' need attention')))+'</b>'+icon('arrow',{size:17});
        b.onclick=showDeliveryDesk;stage.querySelector('.agenda-heading')?.after(b);}
    }
    else if (view === 'stories') StoriesUI.render(stage);
    else if (view === 'residents') renderResidentsView(stage);
    else if (view === 'map') renderMapView(stage);
    else if (view === 'treasury') renderTreasuryView(stage);
    else if (view === 'quests') renderQuestsView(stage);
    else if (view === 'advisors') renderAdvisorsView(stage);
    else if (view === 'badges') renderBadgesView(stage);
    else if (view === 'journal') renderJournalView(stage);
    else if (view === 'settings') renderSettingsView(stage);
    else renderMapView(stage);
    if(view==='treasury'){const panel=document.createElement('div');panel.innerHTML=window.GovernorGame.ConsolidationUI.treasury(state,language);stage.querySelector('.secondary-stage-header').after(panel);window.GovernorGame.ConsolidationUI.attachTreasury(panel,state,language,()=>renderGame(),()=>saveState(false));}
    if(['agenda','treasury','journal'].includes(view))recoveryBrief(stage,stage.querySelector('.agenda-heading,.secondary-stage-header'));
    const back = stage.querySelector('.back-mission');
    if (back) {
      const svg = back.querySelector('svg');
      if (svg) svg.style.transform = 'rotate(180deg)';
      back.addEventListener('click', () => setView('mission'));
    }
  }


  function renderResidentsView(stage) {
    const selected = state.residentSelection || Engine.getCurrentMission(state)?.districtId || 'north';
    PeopleUI.render(stage, state, language, selected, {
      navigate: view => setView(view),
      select: id => {
        state.residentSelection = id;
        const scroll = stage.scrollTop;
        renderResidentsView(stage);
        stage.scrollTop = scroll;
        stage.querySelector(`[data-resident-id="${id}"]`)?.focus({ preventScroll: true });
        saveState(false);
      }
    });
    StoriesUI.teaser(stage.querySelector('.resident-story'), selected);
    const residentWorld=stage.querySelector('.residents-world');
    if (residentWorld) { residentWorld.innerHTML='<div class="resident-atlas"></div>'; WorldUI.mount(residentWorld.firstElementChild,state,language,{...worldCallbacks(),onDistrict:id=>{state.residentSelection=id;renderResidentsView(stage);saveState(false);}},{flows:true}); }
  }

  function renderMapView(stage) {
    stage.innerHTML = `${secondaryHeader('map',globalThis.GovernorGame.I18n.choose(language,()=>('Ваша Новая область'),()=>('Your Novaya Oblast')),globalThis.GovernorGame.I18n.choose(language,()=>('Область меняется вместе с вашими решениями. Выберите место, чтобы рассмотреть действующие программы.'),()=>('The region changes with your decisions. Choose a place to inspect its programmes.')))}${PeopleUI.tabs(language,'map')}
      <div class="atlas-intro"><p>${globalThis.GovernorGame.I18n.choose(language,()=>('Посмотрите, что строится, какие программы уже работают и где закончилось финансирование. Нажмите на объект, чтобы открыть его историю.'),()=>('See projects in delivery, operating services and expired funding. Open a site to inspect its history.'))}</p><button type="button" class="secondary-button" id="map-projects">${globalThis.GovernorGame.I18n.choose(language,()=>('Ход проектов'),()=>('Project delivery'))}</button><button type="button" class="secondary-button" id="replay-chapter">${globalThis.GovernorGame.I18n.choose(language,()=>('Эта глава'),()=>('This chapter'))}</button></div>
      <div class="atlas-full" id="regional-atlas"></div>
      <p class="atlas-note">${globalThis.GovernorGame.I18n.choose(language,()=>('Макет показывает ваши программы, а не точную географию или число учреждений. Масштаб меняется кнопками; на ПК приближённую карту можно двигать мышью.'),()=>('The model shows your programmes, not literal geography or facility counts. Use zoom buttons; on desktop drag to pan a close view.'))}</p>`;
    WorldUI.mount(stage.querySelector('#regional-atlas'),state,language,worldCallbacks());
    stage.querySelectorAll('[data-world-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.worldView)));
    stage.querySelector('#map-projects').addEventListener('click',showProjectGallery);
    stage.querySelector('#replay-chapter').addEventListener('click',()=>Presentation.maybeChapter(true));
  }

  function renderTreasuryView(stage) {
    const finance = Engine.getFinanceSummary(state);
    const ledger = finance.currentLedger || finance.latestLedger;
    const inflows = ledger ? ledgerSideTotal(ledger.inflows) : 0;
    const outflows = ledger ? ledgerSideTotal(ledger.outflows) : 0;
    const identity = ledger ? Finance.verifyLedger(ledger) : { ok: true, gap: 0 };
    const debtPct = Math.min(100, finance.debtRatio * 100);
    const adminPct = Math.min(140, finance.adminCapacity > 0 ? finance.adminLoad / finance.adminCapacity * 100 : 0);
    const reservePct = Math.min(100, finance.reserveCoverage / 3 * 100);
    const projects = [...finance.portfolio].reverse();
    const demographicFiscal = ledger?.demographics;
    const flowCards = ledger ? [
      { icon: 'vault', label: globalThis.GovernorGame.I18n.choose(language,()=>('Старт хода'),()=>('Opening space')), value: ledger.openingTreasury, cls: '' },
      { icon: 'income', label: t('inflows'), value: inflows, cls: 'positive' },
      { icon: 'receipt', label: t('outflows'), value: -outflows, cls: 'negative' },
      { icon: 'coins', label: t('closingTreasury'), value: ledger.closingTreasury, cls: ledger.closingTreasury >= 1 ? 'positive' : 'negative' }
    ] : [];

    stage.innerHTML = `${secondaryHeader('vault', t('treasuryTitle'), t('treasuryLead'))}
      <section class="treasury-hero">
        <div class="treasury-token fiscal"><span>${icon('coins', { size: 25 })}</span><div><small>${esc(t('budget'))}</small><strong>${formatBudget(finance.treasury, true)}</strong><em class="${statClass(finance.operatingBalance)}">${formatSigned(finance.operatingBalance)} ${esc(t('perTurn'))}</em></div></div>
        <div class="treasury-token reserve"><span>${icon('shield', { size: 25 })}</span><div><small>${esc(t('reserve'))}</small><strong>${formatBudget(finance.reserve, true)}</strong><em>${formatNumber(finance.reserveCoverage, 1)} ${globalThis.GovernorGame.I18n.choose(language,()=>('мес. обязательств'),()=>('months of cover'))}</em></div></div>
        <div class="treasury-token debt"><span>${icon('bank', { size: 25 })}</span><div><small>${esc(t('debt'))}</small><strong>${formatBudget(finance.debt, true)}</strong><em>${formatNumber(debtPct, 0)}% ${globalThis.GovernorGame.I18n.choose(language,()=>('лимита'),()=>('of limit'))}</em></div></div>
        <div class="treasury-token variation"><span>${icon('warning', { size: 25 })}</span><div><small>${esc(t('costVariation'))}</small><strong>${formatBudget(finance.totalCostOverruns || 0, true)}</strong><em>${state.deliveryStats.overrun || 0} ${globalThis.GovernorGame.I18n.choose(language,()=>('удорожания'),()=>('overruns'))}</em></div></div>
      </section>
      <section class="treasury-board">
        <div class="fiscal-path-card">
          <div class="treasury-section-heading"><div><p class="dialog-eyebrow">${esc(ledger === finance.currentLedger ? t('currentLedger') : t('latestLedger'))}</p><h3>${esc(t('currentYearLedger'))}</h3></div><span class="identity-badge ${identity.ok ? 'ok' : 'error'}">${icon(identity.ok ? 'check' : 'warning', { size: 16 })}${esc(identity.ok ? t('identityVerified') : t('identityError'))}</span></div>
          <div class="fiscal-flow">${flowCards.map((item, index) => `<div class="fiscal-flow-step ${item.cls}"><span class="flow-icon">${icon(item.icon, { size: 19 })}</span><small>${esc(item.label)}</small><strong>${item.value > 0 && index > 0 && index < 3 ? '+' : ''}${formatBudget(item.value, true)}</strong></div>${index < flowCards.length - 1 ? `<span class="flow-arrow">${icon('arrow', { size: 19 })}</span>` : ''}`).join('')}</div>
          <p class="fiscal-rule">${icon('info', { size: 16 })}<span>${esc(t('fiscalRule'))}</span></p>
        </div>
        <div class="capacity-card">
          <div class="treasury-section-heading"><div><p class="dialog-eyebrow">${esc(t('fiscalIntegrity'))}</p><h3>${esc(t('adminCapacity'))}</h3></div><span class="capacity-number">${formatNumber(finance.adminLoad, 1)} / ${formatNumber(finance.adminCapacity, 1)}</span></div>
          <div class="capacity-meter ${adminPct > 100 ? 'over' : ''}"><i style="width:${Math.min(100, adminPct)}%"></i></div>
          <p>${esc(adminPct > 100 ? t('implementationTight') : t('portfolioHint'))}</p>
          <div class="mini-gauges"><div><span><b>${esc(t('debtPressure'))}</b><em>${formatNumber(debtPct, 0)}%</em></span><div class="mini-meter debt"><i style="width:${debtPct}%"></i></div></div><div><span><b>${esc(t('reserveCoverage'))}</b><em>${formatNumber(finance.reserveCoverage, 1)} ${globalThis.GovernorGame.I18n.choose(language,()=>('мес.'),()=>('mo.'))}</em></span><div class="mini-meter reserve"><i style="width:${reservePct}%"></i></div></div></div>
        </div>
      </section>
      ${demographicFiscal ? `<details class="population-budget-note"><summary>${globalThis.GovernorGame.I18n.choose(language,()=>('Как население влияет на этот бюджет'),()=>('How population affects this budget'))}</summary><p>${globalThis.GovernorGame.I18n.choose(language,()=>('Относительно неизменной исходной численности и занятости, при остальных тех же параметрах:'),()=>('Compared with unchanged initial population and employment, holding other parameters fixed:'))}</p><p>${globalThis.GovernorGame.I18n.choose(language,()=>('Собственные налоги'),()=>('Own taxes'))}: <b>${formatSigned(demographicFiscal.taxDelta)} ${globalThis.GovernorGame.I18n.choose(language,()=>('млрд ₽'),()=>('bn RUB'))}</b> · ${globalThis.GovernorGame.I18n.choose(language,()=>('Обязательные расходы'),()=>('Mandatory costs'))}: <b>${formatSigned(demographicFiscal.mandatoryDelta)} ${globalThis.GovernorGame.I18n.choose(language,()=>('млрд ₽'),()=>('bn RUB'))}</b>.</p><small>${globalThis.GovernorGame.I18n.choose(language,()=>('Учебный расчёт. Больше жителей означает и новые потребности, а не только доходы.'),()=>('Educational calculation. More residents also mean more service needs, not only revenue.'))}</small></details>` : ''}
      ${Governance.summary(state).returnedGrants>0?`<details class="population-budget-note"><summary>${globalThis.GovernorGame.I18n.choose(language,()=>('Возвраты условных траншей за срок'),()=>('Conditional tranche repayments during this term'))}</summary><p>${globalThis.GovernorGame.I18n.choose(language,()=>('Фактически возвращено'),()=>('Actually repaid'))}: <b>${formatBudget(Governance.summary(state).returnedGrants,true)}</b>. ${globalThis.GovernorGame.I18n.choose(language,()=>('Расход записан отдельной статьёй в регистре того года, когда истёк срок отчётности.'),()=>('The expense is a separate ledger entry in the year the reporting deadline expired.'))}</p></details>`:''}
      <section class="portfolio-section">
        <div class="treasury-section-heading"><div><p class="dialog-eyebrow">${esc(t('futureCommitment'))}</p><h3>${esc(t('projectPortfolio'))}</h3></div><span class="portfolio-count">${projects.length}</span></div>
        <p class="portfolio-lead">${esc(t('financeTip'))}</p>
        ${projects.length ? `<div class="portfolio-grid">${projects.map(project => {
          const status = projectStatus(project);
          const timing = project.status === 'delivery' ? `${formatTurns(project.startsIn)} ${t('startsNext')}` : project.status === 'active' ? `${formatTurns(project.yearsRemaining)} ${t('remains')}` : t('completedProgramme');
          const delivery = deliveryLabel(project.deliveryOutcome || 'on-time');
          const renewal = Engine.renewalQuote(state,project.id);
          const renewalButton = renewal.eligible ? `<div class="renewal-offer"><p>${globalThis.GovernorGame.I18n.choose(language,()=>('Последний оплачиваемый год. Продление сохранит услугу ещё на три года.'),()=>('Final funded year. Renewal keeps this service for three additional years.'))}</p><small>${globalThis.GovernorGame.I18n.choose(language,()=>('Организация продления'),()=>('Renewal fee'))}: ${formatBudget(renewal.fee,false)}. ${globalThis.GovernorGame.I18n.choose(language,()=>('Будущее содержание'),()=>('Future operation'))}: ${formatBudget(renewal.futureCommitment,false)}.</small><button type="button" class="secondary-button" data-renew-project="${esc(project.id)}" ${renewal.available?'':'disabled'} title="${renewal.reason==='mission-reserve'?(globalThis.GovernorGame.I18n.choose(language,()=>('Сначала сохраните ресурс для текущего решения'),()=>('Keep funds for the current mission'))):''}">${globalThis.GovernorGame.I18n.choose(language,()=>('Продлить на 3 года'),()=>('Renew for 3 years'))}</button></div>` : '';
          const location = project.placement ? l(project.placement.title) : l(DATA.districts.find(item => item.id === project.districtId)?.name || '');
          return `<article class="project-card ${project.status} ${project.deliveryOutcome || ''}"><button class="project-art-link" type="button" data-inspect-project="${esc(project.id)}" aria-label="${esc(l(project.title))}">${ProjectUI.thumb(project,language)}<span>${globalThis.GovernorGame.I18n.choose(language,()=>('Посмотреть проект'),()=>('Inspect project'))} ${icon('arrow',{size:15})}</span></button><div class="project-card-top"><span class="project-icon">${icon(projectStatusIcon(project), { size: 22 })}</span><div><small>${esc(fundingName(project.fundingMode, true))}</small><h4>${esc(l(project.title))}</h4></div><span class="project-status">${esc(status)}</span></div><div class="project-location">${icon('location', { size: 14 })}<span>${esc(location)}</span><b class="delivery-tag ${project.deliveryOutcome || 'on-time'}">${esc(delivery)}</b></div><div class="project-meta"><span>${icon('calendar', { size: 15 })}${esc(timing)}</span><span>${icon('repeat', { size: 15 })}${esc(t('annualOpex'))}: ${formatBudget(project.annualOpex, true)}</span><span>${icon('capacity', { size: 15 })}${esc(t('adminLoad'))}: ${formatNumber(project.adminLoad, 1)}</span>${project.costVariation > 0 ? `<span class="negative">${icon('warning', { size: 15 })}${esc(t('costVariation'))}: +${formatBudget(project.costVariation, true)}</span>` : ''}</div>${renewalButton}</article>`;
        }).join('')}</div>` : `<div class="portfolio-empty">${icon('portfolio', { size: 34 })}<strong>${esc(t('portfolioEmpty'))}</strong><p>${esc(t('noProjects'))}</p></div>`}
      </section>`;
    stage.querySelectorAll('[data-inspect-project]').forEach(b=>b.addEventListener('click',()=>showProjectDialog(b.dataset.inspectProject)));
    stage.querySelectorAll('[data-renew-project]').forEach(button=>button.addEventListener('click',()=>{
      showRenewalDialog(button.dataset.renewProject);
    }));
  }

  function renderQuestsView(stage) {
    stage.innerHTML = `${secondaryHeader('quest', t('questsTitle'), t('questsLead'))}
      <div class="view-grid">
        ${DATA.quests.map(quest => {
          const status = Engine.questStatus(state, quest);
          return `<article class="view-card">
            <div class="view-card-top"><span class="view-card-icon">${icon(quest.icon, { size: 24 })}</span><div><h3>${esc(l(quest.title))}</h3><p>${esc(l(quest.description))}</p></div><span class="card-status ${status.complete ? 'success' : ''}">${status.complete ? esc(t('completed')) : `${Math.round(status.progress * 100)}%`}</span></div>
            <div class="quest-progress"><i style="width:${status.progress * 100}%"></i></div>
          </article>`;
        }).join('')}
      </div>`;
  }

  function renderAdvisorsView(stage) {
    const mission = Engine.getCurrentMission(state);
    stage.innerHTML = `${secondaryHeader('people', t('advisorsTitle'), t('advisorsLead'))}
      <div class="advisor-command-grid">
        ${DATA.advisors.map(advisor => {
          const trust = Number(state.advisorTrust[advisor.id] || 50);
          const memories = state.advisorMemories[advisor.id] || [];
          const latest = memories[memories.length - 1];
          const latestText = latest ? (() => { const pair = actionForRecord(latest); return pair.action ? `${l(pair.action.title)} · ${deliveryLabel(latest.delivery)}` : ''; })() : l(advisor.memory || advisor.principle);
          return `<button class="advisor-command-card" type="button" data-advisor-card="${advisor.id}">
            <div class="advisor-command-portrait"><img src="${advisor.image}" alt=""><span style="--trust:${trust}%"><i></i><b>${formatNumber(trust, 0)}</b></span></div>
            <div class="advisor-command-copy"><small>${esc(l(advisor.role))}</small><h3>${esc(l(advisor.name))}</h3><p>${esc(l(advisor.principle))}</p><div class="advisor-memory-preview">${icon('journal', { size: 15 })}<span>${esc(latestText)}</span></div></div>
            <div class="advisor-command-now"><small>${esc(t('currentMission'))}</small><strong>${esc(l(mission.advisors?.[advisor.id] || advisor.principle))}</strong></div>
          </button>`;
        }).join('')}
      </div>`;
    stage.querySelectorAll('[data-advisor-card]').forEach(button => button.addEventListener('click', () => showAdvisorDialog(button.dataset.advisorCard)));
  }

  function renderBadgesView(stage) {
    stage.innerHTML = `${secondaryHeader('shield', t('badgesTitle'), t('badgesLead'))}
      <div class="view-grid">
        ${DATA.badges.map(badge => {
          const unlocked = state.badges.includes(badge.id);
          return `<article class="view-card badge-card ${unlocked ? '' : 'locked'}">
            <div class="view-card-top"><span class="badge-medallion">${icon(unlocked ? badge.icon : 'lock', { size: 30 })}</span><div><h3>${esc(l(badge.title))}</h3><p>${esc(l(badge.description))}</p></div><span class="card-status ${unlocked ? 'success' : ''}">${esc(unlocked ? t('unlocked') : t('locked'))}</span></div>
          </article>`;
        }).join('')}
      </div>`;
  }


  function renderJournalView(stage) {
    const threads = Engine.getStoryThreads(state);
    const worldObjects = Engine.getWorldObjects(state);
    stage.innerHTML = `${secondaryHeader('journal', t('journalTitle'), t('journalLead'))}
      <section class="journal-summary">
        <div><span>${icon('route', { size: 22 })}</span><strong>${state.history.length}/${DATA.missions.length}</strong><small>${esc(globalThis.GovernorGame.I18n.choose(language,()=>('решений в истории'),()=>('decisions recorded')))}</small></div>
        <div><span>${icon('link', { size: 22 })}</span><strong>${state.interactionCounts.synergy || 0}</strong><small>${esc(t('synergy'))}</small></div>
        <div><span>${icon('conflict', { size: 22 })}</span><strong>${state.interactionCounts.conflict || 0}</strong><small>${esc(t('conflict'))}</small></div>
        <div><span>${icon('map', { size: 22 })}</span><strong>${worldObjects.length}</strong><small>${esc(t('worldChanges'))}</small></div>
      </section>
      ${GovUI.summaryHtml(state, language)}
      <section class="journal-chapters">
        ${threads.map(thread => `<article class="journal-chapter ${thread.status}">
          <header><span class="journal-chapter-icon">${icon(thread.chapter.icon, { size: 21 })}</span><div><small>${esc(thread.status === 'done' ? t('chapterStatusDone') : thread.status === 'current' ? t('chapterStatusCurrent') : t('chapterStatusLocked'))}</small><h3>${esc(chapterName(thread.chapter))}</h3></div><b>${thread.completed}/${thread.total}</b></header>
          <div class="journal-track">${thread.records.map(item => {
            const record = item.record;
            if (!record) return `<div class="journal-entry ${item.status}"><span class="journal-node">${item.status === 'current' ? icon('play', { size: 13 }) : icon('lock', { size: 12 })}</span><div><small>${esc(phaseName(item.mission.threadPhase))}</small><strong>${esc(l(item.mission.title))}</strong><p>${esc(item.status === 'current' ? l(item.mission.objective) : t('chapterStatusLocked'))}</p></div></div>`;
            const pair = actionForRecord(record);
            const interactions = (record.interactions || []).map(interaction => `<i class="${interaction.type}">${icon(interaction.type === 'conflict' ? 'conflict' : 'link', { size: 12 })}${esc(t(interaction.type === 'conflict' ? 'conflict' : 'synergy'))}</i>`).join('');
            return `<div class="journal-entry done"><span class="journal-node">${icon('check', { size: 13 })}</span><div><small>${esc(phaseName(record.threadPhase))} · ${esc(fundingName(record.fundingMode, true))}</small><strong>${esc(l(item.mission.title))}</strong><p>${esc(pair.action ? l(pair.action.title) : record.actionId)}</p><div class="journal-entry-meta">${record.placement ? `<span>${icon('location', { size: 13 })}${esc(l(record.placement.title))}</span>` : ''}<span class="delivery-tag ${record.delivery?.id || 'on-time'}">${esc(deliveryLabel(record.delivery?.id))}</span>${interactions}</div></div></div>`;
          }).join('')}</div>
        </article>`).join('')}
      </section>`;
    GovUI.attach(stage);
    if (Agenda.mode(state)==='agenda') {
      const a=document.createElement('button');a.type='button';a.className='secondary-button agenda-menu-entry';a.dataset.journalAgenda='';
      a.textContent=globalThis.GovernorGame.I18n.choose(language,()=>(Agenda.open(state)?'Вернуться к повестке':'Первые пять лет: порядок и результат'),()=>(Agenda.open(state)?'Return to your agenda':'First five years: order and outcomes'));
      a.addEventListener('click',()=>setView('agenda'));stage.querySelector('.secondary-stage-header').after(a);
    }
    const letters=document.createElement('button');letters.type='button';letters.className='secondary-button journal-letters-link';letters.textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Пять адресов: письма жителей'),()=>('Five addresses: residents’ letters'));letters.style.margin='0 0 20px';letters.addEventListener('click',()=>setView('stories'));stage.querySelector('.secondary-stage-header').after(letters);
  }

  function renderSettingsView(stage) {
    const scenario = Engine.getScenario(state);
    const challenge = Engine.getChallenge(state);
    stage.innerHTML = `${secondaryHeader('settings', t('settingsTitle'), `${t('session')}: ${state.sessionId} · ${t('scenario')}: ${l(scenario.name)}`)}
      <section class="meta-campaign-card"><span>${icon('trophy', { size: 29 })}</span><div><small>${esc(t('replayProgress'))}</small><h3>${metaState.campaignsCompleted} ${esc(t('campaignsCompleted').toLowerCase())}</h3><p>${esc(t(challenge.descriptionKey))}</p></div><b>×${formatNumber(challenge.rewardMultiplier, 1)}</b></section>
      <div class="settings-stack">
        <div class="settings-row"><span>${icon('quest', { size: 22 })}</span><div><strong>${esc(t('challengeActive'))}</strong><small>${esc(t(challenge.nameKey))} · ${esc(t(challenge.descriptionKey))}</small></div><b class="settings-version">${esc(t('modelStage'))}</b></div>
        <div class="settings-row"><span>${icon(currentSoundEnabled() ? 'sound' : 'mute', { size: 22 })}</span><div><strong>${esc(t('sound'))}</strong><small>${globalThis.GovernorGame.I18n.choose(language,()=>('Короткие сигналы выбора, подтверждения и предупреждения.'),()=>('Short selection, confirmation and warning cues.'))}</small></div><button id="settings-sound" class="switch ${currentSoundEnabled() ? 'on' : ''}" type="button" role="switch" aria-checked="${currentSoundEnabled()}"></button></div>
        <div class="settings-row"><span>${icon('globe', { size: 22 })}</span><div><strong>${esc(t('language'))}</strong><small>Русский / English / 中文</small></div><button id="settings-language" class="language-button" type="button">${window.GovernorGame.I18n.ready()?{ru:'EN',en:'中文',zh:'RU'}[language]:language==='ru'?'EN':'RU'}</button></div>
        <div class="settings-row"><span>${icon('download', { size: 22 })}</span><div><strong>${esc(t('export'))}</strong><small>${globalThis.GovernorGame.I18n.choose(language,()=>('JSON-отчёт содержит версии, seed, размещение проектов, реализацию, связи и последствия.'),()=>('The JSON report includes versions, seed, locations, delivery, interactions and consequences.'))}</small></div><button id="settings-export" class="secondary-button" type="button" style="min-height:42px;padding:0 14px">${esc(globalThis.GovernorGame.I18n.choose(language,()=>('Скачать'),()=>('Download')))}</button></div>
        <div class="settings-row"><span>${icon('refresh', { size: 22 })}</span><div><strong>${esc(t('restart'))}</strong><small>${globalThis.GovernorGame.I18n.choose(language,()=>('Автосохранение кампании будет удалено, но открытые режимы сохранятся.'),()=>('The campaign autosave will be deleted, while unlocked modes remain.'))}</small></div><button id="settings-restart" class="secondary-button" type="button" style="min-height:42px;padding:0 14px;color:#a63b3b">${esc(globalThis.GovernorGame.I18n.choose(language,()=>('Сбросить'),()=>('Restart')))}</button></div>
      </div>`;
    window.GovernorGame.ReleaseUI.reportButton(stage.querySelector('.settings-stack'));
    $('#settings-sound').setAttribute('aria-label', t('sound'));
    $('#settings-sound').addEventListener('click', () => { toggleSound(); renderSettingsView(stage); });
    $('#settings-language').addEventListener('click', toggleLanguage);
    $('#settings-export').addEventListener('click', downloadReport);
    $('#settings-restart').addEventListener('click', restartCampaign);
  }

  function confirmSelectedAction() {
    if(BudgetReview.locked(state)){BudgetReviewUI.open();return;}
    if (state && selectedActionId && !state.awaitingContinue && !state.completed && !Engine.getCurrentMission(state)?.actions.find(a=>a.id===selectedActionId)?.deferred && Governance.sceneFor(Engine.getCurrentMission(state)?.id)) {
      GovUI.openMeeting(selectedActionId, selectedFundingMode, selectedPlacementId);
      return;
    }
    commitSelectedAction();
  }

  function commitSelectedAction() {
    if (blockedByOtherTab || !writerReady || !selectedActionId || state.awaitingContinue || state.completed) {
      toast(t('noDecisionYet'), '', 'warning');
      playSound('warning');
      return;
    }
    try {
      const result = Engine.commitAction(state, selectedActionId, selectedFundingMode, selectedPlacementId);
      state = result.state;
      if(result.pendingBudgetReview){saveState(false);$('#negotiation-dialog')?.close();renderGame();BudgetReviewUI.open();return;}
      selectedPlacementId = state.selectedPlacementId;
      saveState(false);
      playSound('confirm');
      // A construction approval is not a completed facility; celebrate only the finale.
      renderGame();
      showBadgeToasts(result.newBadges);
      showResolution(result.record, result.preview);
    } catch (error) {
      toast(globalThis.GovernorGame.I18n.choose(language,()=>('Решение не принято'),()=>('Decision not confirmed')), error.message, 'warning');
      playSound('warning');
    }
  }

  function completeBudgetTransition(result){
    state=result.state;
    selectedActionId=state.selectedActionId;selectedFundingMode=state.selectedFundingMode;selectedPlacementId=state.selectedPlacementId;
    resolutionShown=false;saveState(false);renderGame();showBadgeToasts(result.newBadges||[]);
    if(result.budgetOperation==='commit'){showResolution(result.record,result.preview);return;}
    $('#resolution-dialog').close();
    if(result.completed){recordCompletedCampaign();showEndScreen();return;}
    Presentation.yearNote(state,result.lifecycle?.events||[]);
    if(!(Agenda.mode(state)==='agenda'&&state.turnIndex===5))Presentation.maybeChapter();
  }

  function showResolution(record, previewArg) {
    const { mission, action } = actionForRecord(record);
    if (!mission || !action) return;
    const preview = previewArg || {
      effects: record.expectedEffects || record.effects,
      expectedRange: null,
      action,
      bonusTexts: record.bonusTexts || [],
      stars: record.stars,
      plan: record.funding,
      project: record.project,
      interactions: record.interactions || [],
      advisorReactions: record.advisorReactions || []
    };
    const plan = record.funding || preview.plan;
    const project = record.project || preview.project;
    const delivery = record.delivery || { id: 'on-time', effectFactor: 1, delayDelta: 0, costVariation: 0 };
    $('#resolution-title').textContent = l(action.title);
    $('#result-reward-stars').textContent = `${record.execution?.pending ? (globalThis.GovernorGame.I18n.choose(language,()=>('после запуска'),()=>('after opening'))) : (record.stars ?? 0)+' ★'}`;

    const effectCards = [
      { icon: 'coins', label: t('budget'), expected: record.expectedEffects?.budget ?? preview.effects?.budget, actual: record.effects.budget, after: record.afterFinance ? record.afterFinance.treasury : record.after.budget, budget: true },
      { icon: 'people', label: t('support'), expected: record.expectedEffects?.support ?? preview.effects?.support, actual: record.effects.support, after: record.after.support },
      { icon: 'development', label: t('development'), expected: record.expectedEffects?.development ?? preview.effects?.development, actual: record.effects.development, after: record.after.development }
    ];
    const bonusNotes = (record.bonusTexts || []).map(note => `<div class="bonus-note">${icon('sparkles', { size: 18 })}<span>${esc(l(note))}</span></div>`).join('');
    const entryNote = record.entry && record.entry.bonusNotes ? record.entry.bonusNotes.map(note => `<div class="bonus-note">${icon('info', { size: 18 })}<span>${esc(l(note))}</span></div>`).join('') : '';
    const entryFinance = record.entry && record.entry.finance;
    const reserveSaved = entryFinance && entryFinance.reserveUsed > 0 ? `<div class="bonus-note">${icon('shield', { size: 18 })}<span>${esc(t('reserveProtected'))}: ${formatBudget(entryFinance.reserveUsed, false)}</span></div>` : '';
    const financeItems = plan ? [
      { icon: fundingMeta(plan.id).icon, label: t('fundingTitle'), value: fundingName(plan.id) },
      { icon: 'receipt', label: t('totalProjectCost'), value: formatBudget(plan.totalCost, true) },
      plan.actualTotalCost > plan.totalCost ? { icon: 'warning', label: t('actualResult'), value: formatBudget(plan.actualTotalCost, true), cls: 'negative' } : null,
      { icon: 'vault', label: t('ownContribution'), value: formatBudget(plan.treasuryCost, true) },
      plan.federalTransfer > 0 ? { icon: 'federal', label: t('federalShare'), value: formatBudget(plan.federalTransfer, true) } : null,
      plan.reserveUse > 0 ? { icon: 'shield', label: t('reserveUse'), value: formatBudget(plan.reserveUse, true) } : null,
      plan.debtIssue > 0 ? { icon: 'bank', label: t('debtIssue'), value: formatBudget(plan.debtIssue, true) } : null,
      project && project.annualOpex > 0 ? { icon: 'repeat', label: t('annualOpex'), value: formatBudget(project.annualOpex, true) } : null,
      project ? { icon: 'calendar', label: t('launchIn'), value: formatTurns(project.startsIn) } : null,
      record.placement ? { icon: 'location', label: t('location'), value: l(record.placement.title) } : null
    ].filter(Boolean) : [];
    const interactions = (record.interactions || []).map(item => `<div class="resolution-interaction ${item.type}">${icon(item.type === 'conflict' ? 'conflict' : 'link', { size: 17 })}<div><strong>${esc(t(item.type === 'conflict' ? 'conflict' : 'synergy'))}</strong><span>${esc(l(item.text))}</span></div></div>`).join('');
    const reactions = (record.advisorReactions || []).filter(item => (mission.debate || []).includes(item.advisorId)).map(reaction => {
      const advisor = DATA.advisors.find(item => item.id === reaction.advisorId);
      return `<div class="resolution-advisor ${reaction.stance}"><img src="${advisor.image}" alt=""><div><small>${esc(l(advisor.role))} · ${esc(stanceName(reaction.stance))}</small><strong>${esc(l(advisor.name))}</strong><span>${formatSigned(reaction.trustDelta)} · ${esc(t('advisorTrust'))} ${formatNumber(reaction.trustAfter, 0)}</span></div></div>`;
    }).join('');
    const expectedRange = preview.expectedRange || null;

    $('#resolution-content').innerHTML = `<section class="delivery-result ${delivery.id}"><span class="delivery-result-icon">${icon(delivery.id === 'on-time' ? 'check' : delivery.id === 'delayed' ? 'clock' : 'warning', { size: 24 })}</span><div><small>${esc(t('deliveryOutcome'))}</small><h3>${esc(deliveryLabel(delivery.id))}</h3><p>${esc(deliveryDescription(delivery.id))}</p></div><b>${Math.round((delivery.effectFactor || 1) * 100)}%</b></section>
      ${GovUI.recordSummary(record, language)}
      ${PeopleUI.year(record, language)}
      <section class="result-section"><h3>${esc(globalThis.GovernorGame.I18n.choose(language,()=>('Итог после решения и годового пересчёта'),()=>('After the decision and annual update')))}</h3><p>${esc(globalThis.GovernorGame.I18n.choose(language,()=>('План ниже относится только к прямому эффекту; итог также включает услуги и обязательства. Это не проверка точности одного и того же показателя.'),()=>('The plan below covers only direct effects; the total also includes services and commitments. These are different scopes, not a like-for-like accuracy check.')))}</p><div class="result-effects stage3">
        ${effectCards.map(item => `<div class="result-effect"><span>${icon(item.icon, { size: 20 })}</span><div><small>${esc(item.label)}</small><span class="expected-line">${esc(t('expectedRange'))}: ${state.rules?.hideExactPreview ? directionSymbol(item.expected) : item.label === t('support') && expectedRange ? effectRangeText(expectedRange.support) : item.label === t('development') && expectedRange ? effectRangeText(expectedRange.development) : formatSigned(item.expected)}</span><strong class="${statClass(item.actual)}">${formatSigned(item.actual)} · ${item.budget ? formatBudget(item.after, true) : formatNumber(item.after, 0)}</strong></div></div>`).join('')}
      </div></section>
      ${financeItems.length ? `<section class="result-section"><h3>${esc(t('financeInResolution'))}</h3><div class="result-finance-grid">${financeItems.map(item => `<div class="${item.cls || ''}"><span>${icon(item.icon, { size: 17 })}</span><small>${esc(item.label)}</small><strong>${esc(item.value)}</strong></div>`).join('')}</div>${delivery.costVariation > 0 ? `<div class="cost-variation-note">${icon('warning', { size: 17 })}<span>${esc(t('costVariation'))}: +${formatBudget(delivery.costVariation, false)}${delivery.delayDelta ? ` · ${esc(t('scheduleVariation'))}: +${delivery.delayDelta}` : ''}</span></div>` : delivery.delayDelta ? `<div class="cost-variation-note delayed">${icon('clock', { size: 17 })}<span>${esc(t('scheduleVariation'))}: +${delivery.delayDelta} ${esc(t('turns'))}</span></div>` : ''}</section>` : ''}
      ${interactions ? `<section class="result-section"><h3>${esc(t('portfolioInteraction'))}</h3><div class="resolution-interactions">${interactions}</div></section>` : ''}
      ${reactions ? `<section class="result-section"><h3>${esc(t('councilSplit'))}</h3><div class="resolution-advisors">${reactions}</div></section>` : ''}
      <section class="result-section"><h3>${esc(t('resultWhy'))}</h3><div class="result-narrative">${esc(l(action.outcome))}</div>${bonusNotes}${entryNote}${reserveSaved}</section>
      <section class="result-section"><h3>${esc(t('resultFuture'))}</h3><div class="result-future">${esc(l(action.future))}</div></section>`;

    Presentation.decorateResolution(record,state);
    const isLast = state.turnIndex >= DATA.missions.length - 1;
    $('#continue-turn').querySelector('[data-ui]').textContent = isLast ? (globalThis.GovernorGame.I18n.choose(language,()=>('Завершить кампанию'),()=>('Complete campaign'))) : t('nextTurn');
    $('#resolution-content').insertAdjacentHTML('beforeend',window.GovernorGame.ConsolidationUI.results(state,record,language));
    const dialog = $('#resolution-dialog');
    dialog.dataset.delivery = delivery.id;
    resolutionShown = true;
    if (!dialog.open) dialog.showModal();
  }

  function continueAfterResolution() {
    try {
      if(BudgetReview.locked(state)){ $('#resolution-dialog').close();BudgetReviewUI.open();return; }
      const result = Engine.advanceTurn(state);
      state = result.state;
      if(result.pendingBudgetReview){saveState(false);$('#resolution-dialog').close();renderGame();BudgetReviewUI.open();return;}
      selectedActionId = null;
      selectedFundingMode = null;
      selectedPlacementId = null;
      resolutionShown = false;
      saveState(false);
      $('#resolution-dialog').close();
      showBadgeToasts(result.newBadges);
      if (result.completed) {
        const unlocked = recordCompletedCampaign();
        playSound('confirm');
        launchConfetti(70);
        renderGame();
        unlocked.forEach((id, index) => {
          const challenge = DATA.challenges.find(item => item.id === id);
          setTimeout(() => toast(t('newChallengeUnlocked'), challenge ? t(challenge.nameKey) : id, 'trophy'), index * 500);
        });
        showEndScreen();
      } else {
        renderGame();
        const lifecycleEvents = result.lifecycle?.events || [];
        Presentation.yearNote(state,lifecycleEvents);
        if (!(Agenda.mode(state)==='agenda' && state.turnIndex===5)) Presentation.maybeChapter();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      toast(globalThis.GovernorGame.I18n.choose(language,()=>('Не удалось продолжить'),()=>('Could not continue')), error.message, 'warning');
    }
  }

  function showAdvisorDialog(advisorId) {
    const advisor = DATA.advisors.find(item => item.id === advisorId);
    const mission = Engine.getCurrentMission(state);
    if (!advisor || !mission) return;
    const trust = Number(state.advisorTrust[advisorId] || 50);
    const memories = (state.advisorMemories[advisorId] || []).slice().reverse();
    $('#advisor-dialog-content').innerHTML = `<div class="advisor-dialog-card stage3"><div class="advisor-dialog-profile"><div class="advisor-dialog-portrait"><img src="${advisor.image}" alt=""><span style="--trust:${trust}%"><b>${formatNumber(trust, 0)}</b></span></div><div><p class="dialog-eyebrow">${esc(l(advisor.role))}</p><h2>${esc(l(advisor.name))}</h2><p class="principle">${esc(l(advisor.principle))}</p></div></div><div class="advisor-quote">«${esc(l(mission.advisors?.[advisor.id] || advisor.principle))}»</div><div class="advisor-memory-section"><p class="dialog-eyebrow">${esc(t('advisorMemory'))}</p><p class="advisor-memory-principle">${esc(l(advisor.memory || advisor.principle))}</p>${memories.length ? memories.map(memory => { const pair = actionForRecord(memory); return `<div class="advisor-memory-row ${memory.stance}"><span>${icon(memory.stance === 'support' ? 'check' : memory.stance === 'oppose' ? 'conflict' : 'info', { size: 15 })}</span><div><small>${esc(pair.mission ? l(pair.mission.title) : memory.missionId)} · ${esc(deliveryLabel(memory.delivery))}</small><strong>${esc(pair.action ? l(pair.action.title) : memory.actionId)}</strong></div><b>${formatSigned(memory.trustDelta)}</b></div>`; }).join('') : `<div class="interaction-empty">${icon('journal', { size: 15 })}<span>${esc(globalThis.GovernorGame.I18n.choose(language,()=>('Советник ещё не видел ваших решений.'),()=>('The adviser has not observed a decision yet.')))}</span></div>`}</div></div>`;
    $('#advisor-dialog').showModal();
    playSound('select');
  }

  function showDistrictDialog(districtId) {
    $('#district-dialog').classList.remove('illustrated-project-dialog');
    $('#district-dialog').removeAttribute('aria-labelledby');
    const district = DATA.districts.find(item => item.id === districtId);
    if (!district) return;
    const status = Engine.getDistrictStatus(state, district);
    const resilienceKey = district.id === 'north' ? 'health' : district.id === 'industrial' ? 'jobs' : district.id === 'river' ? 'flood' : district.id === 'suburb' ? 'family' : 'digital';
    const completed = district.missionIds.map(id => state.history.find(record => record.missionId === id)).filter(Boolean);
    const objects = Engine.getWorldObjects(state).filter(item => item.districtId === districtId);
    const currentMission = Engine.getCurrentMission(state);
    const statusLabel = status === 'prepared' ? t('districtPrepared') : status === 'active' ? t('districtActive') : status === 'progress' ? (globalThis.GovernorGame.I18n.choose(language,()=>('Преобразуется'),()=>('Changing'))) : t('districtWaiting');
    $('#district-dialog-content').innerHTML = `<div class="district-dialog-content stage3"><p class="dialog-eyebrow">${esc(statusLabel)}</p><h2>${esc(l(district.name))}</h2><p class="district-role">${esc(l(district.role))}</p>
      <div class="district-status-panel"><div><small>${globalThis.GovernorGame.I18n.choose(language,()=>('Устойчивость системы'),()=>('System resilience'))}</small><strong>${formatNumber(state.resilience[resilienceKey], 1)} / 10</strong></div><div><small>${t('completed')}</small><strong>${completed.length} ${t('of')} ${district.missionIds.length}</strong></div><div><small>${esc(t('worldChanges'))}</small><strong>${objects.length}</strong></div></div>
      ${status === 'active' ? `<div class="result-future"><b>${esc(t('currentMission'))}:</b> ${esc(l(currentMission.title))}</div>` : ''}
      <section class="district-object-gallery"><p class="dialog-eyebrow">${esc(t('worldChanges'))}</p>${objects.length ? objects.map(object => `<article class="district-object-item ${object.status} ${object.delivery}"><span>${icon(object.icon, { size: 19 })}</span><div><small>${esc(object.placement ? l(object.placement.title) : l(district.name))}</small><strong>${esc(l(object.title))}</strong></div><b>${esc(deliveryLabel(object.delivery))}</b></article>`).join('') : `<div class="interaction-empty">${icon('map', { size: 16 })}<span>${esc(t('noWorldChanges'))}</span></div>`}</section>
      ${completed.length ? `<section class="district-history"><p class="dialog-eyebrow">${globalThis.GovernorGame.I18n.choose(language,()=>('История территории'),()=>('District story'))}</p>${completed.map(record => { const pair = actionForRecord(record); return `<div class="district-history-row"><span>${icon(record.threadPhase === 'crisis' ? 'warning' : record.threadPhase === 'legacy' ? 'trophy' : record.threadPhase === 'delivery' ? 'construction' : 'route', { size: 16 })}</span><div><small>${esc(phaseName(record.threadPhase))} · ${esc(fundingName(record.fundingMode, true))}</small><strong>${esc(pair.mission ? l(pair.mission.title) : record.missionId)}</strong><p>${esc(pair.action ? l(pair.action.title) : record.actionId)}</p></div><b class="delivery-tag ${record.delivery?.id || 'on-time'}">${esc(deliveryLabel(record.delivery?.id))}</b></div>`; }).join('')}</section>` : ''}</div>`;
    const peopleButton = document.createElement('button');
    peopleButton.type = 'button'; peopleButton.className = 'primary-button resident-dialog-link';
    peopleButton.textContent = t('residentsAction');
    peopleButton.addEventListener('click', () => { $('#district-dialog').close(); state.residentSelection = districtId; setView('residents'); });
    $('#district-dialog-content').appendChild(peopleButton);
    $('#district-dialog').showModal();
    playSound('select');
  }

  function showProfileDialog() {
    const scenario = Engine.getScenario(state);
    const challenge = Engine.getChallenge(state);
    const finance = Engine.getFinanceSummary(state);
    $('#profile-dialog-content').innerHTML = `<div class="profile-hero"><span class="profile-hero-avatar">${esc(initials(state.profile.name))}</span><div><p class="dialog-eyebrow">${esc(t('profileGovernor'))}</p><h2>${esc(state.profile.name)}</h2><p style="margin:4px 0;color:var(--muted)">${esc(state.profile.group)}</p><div class="profile-progress"><i style="width:${Engine.getLevelProgress(state) * 100}%"></i></div></div></div>
      <div class="profile-meta"><div><small>${esc(t('level'))}</small><strong>${Engine.getLevel(state)}</strong></div><div><small>${esc(t('reputation'))}</small><strong>${state.xp} XP · ${state.stars} ★</strong></div><div><small>${esc(t('session'))}</small><strong>${esc(state.sessionId)}</strong></div></div>
      <div class="profile-fiscal-row"><div><small>${esc(t('budget'))}</small><strong>${formatBudget(finance.treasury, true)}</strong></div><div><small>${esc(t('reserve'))}</small><strong>${formatBudget(finance.reserve, true)}</strong></div><div><small>${esc(t('debt'))}</small><strong>${formatBudget(finance.debt, true)}</strong></div></div>
      <div class="profile-campaign-meta"><div>${icon('map', { size: 18 })}<span><small>${esc(t('scenario'))}</small><strong>${esc(l(scenario.name))}</strong></span></div><div>${icon('quest', { size: 18 })}<span><small>${esc(t('challengeActive'))}</small><strong>${esc(t(challenge.nameKey))}</strong></span></div><div>${icon('link', { size: 18 })}<span><small>${esc(t('portfolioInteraction'))}</small><strong>${state.interactionCounts.synergy} / ${state.interactionCounts.conflict}</strong></span></div></div>
      <div class="result-future"><b>${esc(t('scenario'))}:</b> ${esc(l(scenario.description))}<br><b>${esc(t('challengeActive'))}:</b> ${esc(t(challenge.descriptionKey))}</div>`;
    const settingsLink=document.createElement('button');
    settingsLink.type='button';settingsLink.id='profile-settings-link';settingsLink.className='secondary-button';settingsLink.style.marginTop='18px';
    settingsLink.textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Настройки, язык и экспорт'),()=>('Settings, language and export'));
    settingsLink.addEventListener('click',()=>{$('#profile-dialog').close();setView('settings');$('#settings-language').focus({preventScroll:true});});
    $('#profile-dialog-content').appendChild(settingsLink);
    $('#profile-dialog').showModal();
  }

  function showEndScreen() {
    const ending = Engine.getEnding(state);
    const report = Engine.buildReport(state, language);
    report.applicationVersion=Presentation.build;
    report.campaignStatus=state.completed?'completed':BudgetReview.stopped(state)?'financial-handover':'in-progress';
    report.completedDecisions=state.history.length;
    const finance = Engine.getFinanceSummary(state);
    const challenge = Engine.getChallenge(state);
    const delivery = state.deliveryStats || {};
    const advisorAverage = DATA.advisors.reduce((sum, advisor) => sum + Number(state.advisorTrust[advisor.id] || 0), 0) / DATA.advisors.length;
    $('#end-title').textContent = l(ending.title);
    $('#end-summary').innerHTML = `<div class="end-style-card"><small>${esc(t('endStyle'))}</small><h3>${esc(l(ending.title))}</h3><p>${esc(l(ending.description))}</p><span class="end-challenge">${icon('quest', { size: 15 })}${esc(t(challenge.nameKey))} · ×${formatNumber(challenge.rewardMultiplier, 1)}</span></div>
      <div class="end-stat-row stage3"><div class="end-stat"><small>${esc(t('support'))}</small><strong>${formatNumber(state.stats.support, 0)}%</strong></div><div class="end-stat"><small>${esc(t('development'))}</small><strong>${formatNumber(state.stats.development, 0)}</strong></div><div class="end-stat"><small>${esc(t('budget'))}</small><strong>${formatBudget(finance.treasury, true)}</strong></div><div class="end-stat"><small>${esc(t('synergy'))}</small><strong>${state.interactionCounts.synergy}</strong></div><div class="end-stat"><small>${esc(t('advisorTrust'))}</small><strong>${formatNumber(advisorAverage, 0)}</strong></div></div>
      <div class="end-delivery-strip"><span class="on-time">${icon('check', { size: 15 })}${esc(t('deliveryOnTime'))} <b>${delivery.onTime || 0}</b></span><span class="delayed">${icon('clock', { size: 15 })}${esc(t('deliveryDelayed'))} <b>${delivery.delayed || 0}</b></span><span class="overrun">${icon('warning', { size: 15 })}${esc(t('deliveryOverrun'))} <b>${delivery.overrun || 0}</b></span><span class="partial">${icon('info', { size: 15 })}${esc(t('deliveryPartial'))} <b>${delivery.partial || 0}</b></span></div>
      ${GovUI.summaryHtml(state, language)}
      ${PeopleUI.finalSummary(state, language)}
      <ul class="end-lessons">${report.final.ending.lessons.map(lesson => `<li>${esc(lesson)}</li>`).join('')}</ul>`;
    $('#end-summary').insertAdjacentHTML('beforeend',window.GovernorGame.ConsolidationUI.treasury(state,language));
    window.GovernorGame.ReleaseUI.reportButton($('#end-summary'));
    Platform?.onEnd?.($('#end-summary'));
    GovUI.attach($('#end-summary'));
    StoriesUI.endingButton($('#end-summary'));
    if(BudgetReview.active(state)){$('#end-summary').insertAdjacentHTML('beforeend',BudgetReviewUI.ending(state,language));BudgetReviewUI.attach($('#end-summary'));}
    StoriesUI.remember();
    const dialog = $('#end-dialog');
    if (!dialog.open) dialog.showModal();
  }

  function showBadgeToasts(ids) {
    (ids || []).forEach((id, index) => {
      const badge = DATA.badges.find(item => item.id === id);
      if (!badge) return;
      setTimeout(() => {
        toast(globalThis.GovernorGame.I18n.choose(language,()=>('Новая награда'),()=>('New award')), l(badge.title), badge.icon);
        launchConfetti(16);
      }, index * 450);
    });
  }

  let toastTimer = null;
  function toast(title, message, iconName) {
    if(!String(title||'').trim()&&!String(message||'').trim())return;
    let region=$('#toast-region');
    if(!region){region=document.createElement('div');region.id='toast-region';region.className='toast-region';region.setAttribute('role','status');region.setAttribute('aria-live','polite');}
    const target=Array.from(document.querySelectorAll('dialog[open]')).at(-1)
      ||(!$('#secondary-stage')?.classList.contains('hidden')?$('#secondary-stage'):$('.mission-panel'))||$('#start-form');
    if(!target)return;
    if(region.parentElement!==target)target.prepend(region);
    clearTimeout(toastTimer);
    // A normal-flow notice takes its own space; it can never cover an answer.
    region.innerHTML=`<div class="toast"><span class="toast-icon">${icon(iconName||'info',{size:19})}</span><div><strong>${esc(title)}</strong>${message?`<span>${esc(message)}</span>`:''}</div><button class="toast-close" type="button" aria-label="${globalThis.GovernorGame.I18n.choose(language,()=>('Скрыть уведомление'),()=>('Dismiss notification'))}">${icon('close',{size:16})}</button></div>`;
    const clear=()=>{clearTimeout(toastTimer);region.innerHTML='';};
    region.querySelector('.toast-close').addEventListener('click',clear);
    toastTimer=setTimeout(clear,3200);
  }

  function launchConfetti(count) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = $('#confetti-layer');
    const colors = ['#087fc4', '#16a9ed', '#f2ae2e', '#26ad70', '#7a6ee6'];
    for (let index = 0; index < count; index += 1) {
      const piece = document.createElement('i');
      piece.className = 'confetti';
      piece.style.left = `${5 + Math.random() * 90}%`;
      piece.style.background = colors[index % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.35}s`;
      piece.style.setProperty('--drift', `${-100 + Math.random() * 200}px`);
      layer.appendChild(piece);
      setTimeout(() => piece.remove(), 2400);
    }
  }

  function restartCampaign() {
    if (!window.confirm(t('restartConfirm'))) return;
    $$('.game-dialog[open]').forEach(dialog => dialog.close());
    clearState();
    state = null;
    selectedActionId = null;
    selectedFundingMode = null;
    selectedPlacementId = null;
    resolutionShown = false;
    $('#continue-campaign').classList.add('hidden');
    showStartScreen();
  }

  function downloadReport() {
    if (!state) return;
    const report = Engine.buildReport(state, language);
    report.applicationVersion=Presentation.build;
    report.campaignStatus=state.completed?'completed':BudgetReview.stopped(state)?'financial-handover':'in-progress';
    report.completedDecisions=state.history.length;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `governor-${state.sessionId}-${language}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast(globalThis.GovernorGame.I18n.choose(language,()=>('Отчёт подготовлен'),()=>('Report ready')), anchor.download, 'download');
  }

  function bindEvents() {
    const projectDialog=$('#district-dialog');
    projectDialog.addEventListener('close',()=>{if(projectOrigin?.isConnected)projectOrigin.focus({preventScroll:true});});
    projectDialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const nodes=[...projectDialog.querySelectorAll('button:not([disabled]),summary,a[href],input:not([disabled]),[tabindex="0"]')].filter(x=>x.getClientRects().length>0);
      const i=nodes.indexOf(document.activeElement);
      if(nodes.length&&(i<0||(event.shiftKey&&i===0)||(!event.shiftKey&&i===nodes.length-1))){event.preventDefault();nodes[event.shiftKey?nodes.length-1:0].focus();}
    });
    $('#resolution-dialog').addEventListener('cancel', event => event.preventDefault());
    $('#end-dialog').addEventListener('cancel', event => event.preventDefault());
    $('#start-form').addEventListener('submit', startCampaign);
    $('#recovery-case').addEventListener('change',updateRecoverySetup);
    $('#continue-campaign').addEventListener('click', continueSavedCampaign);
    $('#scenario-select').addEventListener('change', updateStartScenarioPreview);
    $('#challenge-select').addEventListener('change', () => { updateChallengePreview(); updateStartScenarioPreview(); });
    $('#session-seed').addEventListener('input', updateStartScenarioPreview);
    $('#start-language').addEventListener('click', toggleLanguage);
    $('#language-toggle').addEventListener('click', toggleLanguage);
    $('#start-sound').addEventListener('click', toggleSound);
    $('#sound-toggle').addEventListener('click', toggleSound);
    $('#confirm-action').addEventListener('click', confirmSelectedAction);
    $('#continue-turn').addEventListener('click', continueAfterResolution);
    $('#profile-button').addEventListener('click', showProfileDialog);
    $('#download-report-end').addEventListener('click', downloadReport);
    $('#review-region').addEventListener('click',()=>{$('#end-dialog').close();setView('journal');$('.secondary-view [data-open-promises]')?.focus({preventScroll:true});});
    $('#play-again').addEventListener('click', restartCampaign);
    $('#mobile-menu-button').addEventListener('click', () => window.GovernorGame.ReleaseUI.openMenu());
    $('#treasury-shortcut').addEventListener('click', () => setView('treasury'));

    $$('.nav-button[data-view], .mobile-bottom-nav [data-view]').forEach(button => {
      button.addEventListener('click', () => setView(button.dataset.view));
    });

    $$('[data-close-dialog]').forEach(button => {
      button.addEventListener('click', () => button.closest('dialog').close());
    });

    ['advisor-dialog', 'district-dialog', 'profile-dialog'].forEach(id => {
      const dialog = document.getElementById(id);
      dialog.addEventListener('click', event => {
        // Child clicks can reflow the dialog before bubbling. Only a true
        // backdrop click may close it; never compare old click coordinates
        // with a new, smaller dialog after filtering a list.
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
        if (outside) dialog.close();
      });
    });

    window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY&&state&&e.newValue!==store.token)blockForOtherTab();});
    window.addEventListener('pagehide',()=>{saveState(false);if(releaseWriter){releaseWriter();writerReady=false;}});
    window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
    document.addEventListener('keydown', event => {
      if(!state||state.completed||state.awaitingContinue||state.activeView!=='mission'||blockedByOtherTab)return;
      if(event.defaultPrevented||event.repeat||event.ctrlKey||event.altKey||event.metaKey||document.querySelector('dialog[open]'))return;
      if(!getPrefs().numberShortcuts||!event.target.closest('#action-cards'))return;
      if(event.key>='1'&&event.key<='3'){
        const action=Engine.getCurrentMission(state).actions[Number(event.key)-1];
        if(action){event.preventDefault();selectAction(action.id);}
      }
      // Enter/Space belong to the focused native button, never to a global handler.
    });
  }

  async function init() {
    Object.assign(DATA.ui.ru,{demoBadge:'Версия 1.0 · Учебная кампания',startTitle:'Какой останется ваша область?',startLead:'Двадцать годовых решений. Пять разных территорий. Стройте, договаривайтесь и возвращайтесь к людям, которым дали обещания.'});
    Object.assign(DATA.ui.en,{demoBadge:'Version 1.0 · Learning campaign',startTitle:'What will your region become?',startLead:'Twenty yearly decisions. Five different places. Build, negotiate, and return to the people you made promises to.'});
    BudgetReviewUI.init({state:()=>state,language:()=>language,canWrite:()=>writerReady&&!blockedByOtherTab,save:()=>saveState(false),refresh:()=>renderGame(),transition:completeBudgetTransition,exportSave:downloadSave,notice:message=>toast(globalThis.GovernorGame.I18n.choose(language,()=>('Сохранение'),()=>('Save')),message,'warning')});
    RecoveryUI.init({state:()=>state,language:()=>language,canWrite:()=>writerReady&&!blockedByOtherTab,save:()=>saveState(false),refresh:()=>renderGame()});
    StoriesUI.init({state:()=>state, language:()=>language, save:()=>saveState(false), navigate:view=>setView(view), refreshBrief:()=>renderStoryBrief(), refreshList:()=>{if(state?.activeView==='stories')StoriesUI.render($('#secondary-stage'));}, notice:message=>toast(globalThis.GovernorGame.I18n.choose(language,()=>('История жителей'),()=>('Residents’ stories')),message,'info')});
    Presentation.init({state:()=>state,language:()=>language,map:()=>setView('map'),delivery:()=>showDeliveryDesk(),onClose:()=>{WorldUI.refreshVisible();const focus=state?.activeView==='agenda'?$('#agenda-heading'):$('#mission-title');if(focus){focus.tabIndex=-1;focus.focus({preventScroll:true});}}});
    GovUI.init({getState:()=>state, getLanguage:()=>language, save:()=>saveState(false), refresh:()=>renderGame(), commit:()=>commitSelectedAction(), toast:message=>toast(globalThis.GovernorGame.I18n.choose(language,()=>('Проверьте условия'),()=>('Check the terms')),message,'warning')});
    window.GovernorGame.ReleaseUI.init({state:()=>state,language:()=>language,navigate:setView,save:downloadSave,report:downloadReport});
    mountConsolidationUI();
  setupAgendaUI();
    setStaticIcons();
    bindEvents();
    await acquireWriter();
    applyTranslations();
    const prefs = getPrefs();
    if (prefs.soundEnabled === undefined) savePrefs({ soundEnabled: true, language });
    $('#continue-campaign').classList.toggle('hidden', !savedState);
    if(savedState?.completed) $('#continue-campaign').textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Открыть итоги завершённого срока'),()=>('Revisit the completed term'));
    if (savedState && !savedState.completed) {
      $('#player-name').value = savedState.profile.name || '';
      $('#player-group').value = savedState.profile.group || '';
    }
    showStartScreen();
    Platform?.attach?.({state:()=>state||savedState,canWrite:()=>writerReady&&!blockedByOtherTab,freeze:()=>{writerReady=false;blockedByOtherTab=true;releaseWriter?.();$('#app').inert=true;}});
    document.documentElement.dataset.appReady='true';

    if (!Platform && 'serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
      window.GovernorGame.ReleaseUI.registerOffline();
    }
  }

  init().catch(error=>{
    console.error('Application initialization failed:',error);
    Platform?.onError?.(error);
    const notice=$('#boot-error');notice.hidden=false;notice.textContent=globalThis.GovernorGame.I18n.choose(language,()=>('Не удалось запустить игру. Обновите страницу. Если ошибка повторяется, заново распакуйте полный архив и запустите START_WINDOWS.bat или START_MAC_LINUX.sh.'),()=>('Could not start. Refresh the page, or extract the complete archive again and use its launcher.'));
  });
})();
