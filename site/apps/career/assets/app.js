import {sessionBundle,parseSession,SESSION_LIMIT} from './session-transfer.mjs';
import {createVacancies} from './vacancies.mjs';
import {MODEL_VERSION as CURRENT_MODEL,QUESTIONNAIRE_VERSION,REGISTRY_VERSION} from './versions.mjs';
import {TOPIC_GROUPS,activeTopicGroups,sanitizeFocusAreas} from './topics.mjs';
import {storageKey,readLocal,writeLocal} from './storage.mjs';
import {loadJSON,isRecord} from './loader.mjs';
import {createPublicService} from './public-service.mjs';
import {validatePublicRegistry} from './public-service-model.mjs';
import {createDecisionLab} from './decision-lab.mjs';
import {createClassroom} from './classroom.mjs';
import {readGroupInput,mergeGroupRecords,groupBundle,GROUP_FILE_LIMIT} from './group-session.mjs';
import { initializeI18n, translate, translateDOM, getLanguage, englishText, chineseText, ensureLanguage, setLanguage } from './i18n.mjs';
import { createWorkspace, resourceCards } from './workspace.mjs';
import { resourcesForAuthority } from './resources.mjs';
import {
  SCALE_IDS,
  CONDITION_IDS,
  computeRoleProfile,
  rankAuthorities,
  selectDiscoveryCandidate,
  buildExplanation,
  completionStatus
} from "./scoring.mjs";
import {
  MAX_COMPARE,
  buildAuthorityCareerRoles,
  relevantEntryRoutes,
  addCompareId,
  sanitizeCompareIds,
  compareAuthoritySet,
  buildTrackDevelopmentPlan,
  competencyMap,
  careerSystemLabel
} from "./career.mjs";
import {
  MODEL_VERSION,
  configureValidationRegistry,
  createAnonymousRecord,
  validateAnonymousRecord,
  aggregateAnonymousRecords,
  recordsToCsv,
  summaryToCsv
} from "./analytics.mjs";

export const STORAGE_KEY = storageKey("answers-v8");

const DATA_FILES = [
  "data/scales.json",
  "data/questions.json",
  "data/sectors.json",
  "data/conditions.json",
  "data/tracks.json",
  "data/authorities.json",
  "data/competencies.json",
  "data/career-framework.json",
  "data/entry-routes.json",
  "data/hierarchy.json",
  "data/career-resources.json",
  "data/agency-studies.json",
  "data/public-service.json"
];

const state = {
  answers: {},
  focusAreas: {},
  questionIndex: 0,
  prioritySectors: [],
  lowPrioritySectors: [],
  conditions: {},
  compareIds: [],
  lastRoute: "home",
  completedAt: null,
  resultRecordId: null
};

let data = null;
let workspace = null;
let classroom = null;
let decisionLab = null;
let publicService = null;
let vacancies = null;
let groupMode = "uploaded";
let groupBusy = false;
let latestResult = null;
let currentAuthority = null;
let seminarAuthority = null;
let groupRecords = [];
let groupRejected = 0;
let dialogReturnFocus = null;
let unrecoverableStoredText = null;
let protectedStorage = false;
let pendingLegacyChoice = false;
let lastSaveStatus = "idle";
let persistedFingerprint = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (id, className = "") => `<svg class="${className}" aria-hidden="true"><use href="#i-${id}"></use></svg>`;
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const safeUrl = (value = "") => {
  try {
    const url = new URL(value, location.href);
    return ["https:", "http:"].includes(url.protocol) ? escapeHtml(url.href) : "#";
  } catch {
    return "#";
  }
};

function confidenceLabel(value) {
  return value === "high" ? "высокая" : value === "medium" ? "средняя" : "ограниченная";
}

function gmupRelevanceLabel(value) {
  return value === "high"
    ? "Высокая для управленческих и аналитических треков"
    : "Зависит от подразделения и профильной подготовки";
}

function roleCountLabel(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "ключевая карьерная роль";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "ключевые карьерные роли";
  return "ключевых карьерных ролей";
}

function iconForSector(id) {
  const map = {
    SEC: "shield", EMR: "shield", HEA: "shield", SOC: "users", EDU: "method",
    FIN: "landmark", ECO: "chart", IND: "landmark", INF: "landmark", AGR: "landmark",
    ENV: "landmark", DIG: "test", INT: "route", ADM: "landmark"
  };
  return map[id] || "landmark";
}

function storedPayload() {
  try {
    const rawText=readLocal(STORAGE_KEY);
    const current = JSON.parse(rawText || "null");
    if (rawText && (!isRecord(current) || Number(current.schema)!==4 || current.modelVersion!==MODEL_VERSION || current.questionnaireVersion!==QUESTIONNAIRE_VERSION || current.registryVersion!==REGISTRY_VERSION || !isRecord(current.answers) || !isRecord(current.conditions))) {
      unrecoverableStoredText=rawText;protectedStorage=true;return null;
    }
    if (current) return current;
    return null; // Shared old keys are imported only after an explicit choice.

  } catch {
    // Do not destroy a corrupt but potentially recoverable record automatically.
    try{unrecoverableStoredText=readLocal(STORAGE_KEY);protectedStorage=Boolean(unrecoverableStoredText);}catch{protectedStorage=true;}
    return null;
  }
}

function loadStoredState() {
  const stored = storedPayload();
  if (!stored || Number(stored.schema)!==4 || stored.modelVersion!==MODEL_VERSION || stored.questionnaireVersion!==QUESTIONNAIRE_VERSION || stored.registryVersion!==REGISTRY_VERSION) return;
  Object.assign(state, {
    answers: stored.answers || {},
    questionIndex: Number(stored.questionIndex || 0),
    prioritySectors: Array.isArray(stored.prioritySectors) ? stored.prioritySectors : [],
    lowPrioritySectors: Array.isArray(stored.lowPrioritySectors) ? stored.lowPrioritySectors : [],
    conditions: stored.conditions || {},
    focusAreas: stored.focusAreas || {},
    compareIds: Array.isArray(stored.compareIds) ? stored.compareIds : [],
    lastRoute: stored.lastRoute || "home",
    completedAt: stored.completedAt || null,
    resultRecordId: stored.resultRecordId || null
  });
  const validQuestionIds = new Set(data.questions.map(q=>q.id));
  state.answers = Object.fromEntries(Object.entries(state.answers).filter(([id,v])=>validQuestionIds.has(id)&&Number.isInteger(v)&&v>=1&&v<=5));
  state.conditions = Object.fromEntries(Object.entries(state.conditions).filter(([id,v])=>CONDITION_IDS.includes(id)&&Number.isInteger(v)&&v>=1&&v<=5));
  const sectorIds = new Set(data.sectors.map(s=>s.id));
  state.prioritySectors = [...new Set(state.prioritySectors)].filter(id=>sectorIds.has(id)).slice(0,4);
  state.lowPrioritySectors = [...new Set(state.lowPrioritySectors)].filter(id=>sectorIds.has(id)&&!state.prioritySectors.includes(id)).slice(0,2);
  state.focusAreas=sanitizeFocusAreas(state.focusAreas,state.prioritySectors);
  state.questionIndex = Number.isInteger(state.questionIndex)?Math.min(26,Math.max(0,state.questionIndex)):0;
  if(!completionStatus({...state,questions:data.questions}).complete)state.completedAt=null;
  if(typeof state.completedAt!=='string'||!Number.isFinite(Date.parse(state.completedAt)))state.completedAt=null;
  if(typeof state.resultRecordId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(state.resultRecordId))state.resultRecordId=null;
  persistedFingerprint=stateFingerprint();

}

function stateFingerprint() {
  const {lastRoute,...content}=state;
  return JSON.stringify(content);
}
function saveState() {
  if(protectedStorage||pendingLegacyChoice){if($("#storage-warning"))$("#storage-warning").hidden=false;lastSaveStatus="failed";updateSaveIndicator();updateResumeButton();renderCompareTray();return false;}
  let saved=true;
  try {const fingerprint=stateFingerprint();
   if(fingerprint!==persistedFingerprint){writeLocal(STORAGE_KEY, JSON.stringify({
    schema: 4,
    questionnaireVersion:QUESTIONNAIRE_VERSION,
    registryVersion:REGISTRY_VERSION,
    modelVersion: MODEL_VERSION,
    ...state,
    updatedAt: new Date().toISOString()
  }));persistedFingerprint=fingerprint;}if($("#storage-warning"))$("#storage-warning").hidden=true;} catch { saved=false;if($("#storage-warning"))$("#storage-warning").hidden=false; }
  lastSaveStatus=saved?"saved":"failed";
  updateSaveIndicator();
  updateResumeButton();
  renderCompareTray();
  return saved;
}

function updateSaveIndicator() {
  const strip=$("#session-strip"), label=$("#session-status");
  if(!strip||!label)return;
  strip.dataset.status=lastSaveStatus;
  label.textContent=lastSaveStatus==='failed'?'Не сохранено. Скачайте ответы перед закрытием.':Object.keys(state.answers).length?'Ответы сохранены в этом браузере':'Ответы остаются на Вашем устройстве';
}

function bindSessionTransfer() {
  $("#session-export").addEventListener('click',()=>downloadText('career-answers.json',JSON.stringify(sessionBundle(state),null,2),'application/json;charset=utf-8'));
  $("#session-import").addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try {
      if(file.size>SESSION_LIMIT)throw Error('file-size');
      const inputs=parseSession(await file.text(),data.questions,data.sectors);
      if((Object.keys(state.answers).length||state.prioritySectors.length||Object.keys(state.conditions).length)&&!confirm(translate('Заменить текущие ответы данными из файла? Для сохранения своего варианта сначала скачайте ответы.')))return;
      Object.assign(state,inputs);invalidateResult();state.questionIndex=firstUnansweredIndex();
      saveState();routeTo(resolveResumeRoute());toast('Ответы восстановлены. Результат рассчитывается заново.');
    } catch { toast('Файл ответов не принят. Нужен файл «Скачать ответы» этой версии модели размером до 128 КБ.'); }
    finally {event.target.value='';}
  });
}

function resetState({ keepRoute = false, keepCompare = true } = {}) {
  state.answers = {};
  state.focusAreas = {};
  state.questionIndex = 0;
  state.prioritySectors = [];
  state.lowPrioritySectors = [];
  state.conditions = {};
  if (!keepCompare) state.compareIds = [];
  invalidateResult();
  if (!keepRoute) state.lastRoute = "home";
  saveState();
}

function invalidateResult() {
  latestResult = null;
  state.completedAt = null;
  state.resultRecordId = null;
}

async function loadData() {
  const coreFiles=DATA_FILES.slice(0,6);
  const corePromise=Promise.all(coreFiles.map(url=>loadJSON(url,{validate:Array.isArray})));
  const manifestPromise=loadJSON('data/model-manifest.json',{validate:v=>isRecord(v)&&v.modelVersion===MODEL_VERSION&&v.registryVersion===REGISTRY_VERSION&&v.questionnaireVersion===QUESTIONNAIRE_VERSION});
  const optionalFiles=DATA_FILES.slice(6);
  const defaults=[[],{trackProfiles:[],qualificationPrinciples:[],sources:[],civilServicePositionExamples:{entry:[],development:[]},publicSectorPositionExamples:{entry:[],development:[]}},[],
    {roots:[],links:[],sources:[],territorialExamples:[],checkedAt:null},[],
    {cases:[],disclaimer:{ru:'Раздел временно недоступен',en:'Section temporarily unavailable','zh-Hans':'该部分暂不可用'}},
    {records:[],eligibilitySources:[],country:'RU',registryVersion:'unavailable'}];
  const optional=Promise.all(optionalFiles.map(async(url,i)=>{
    try{return {value:await loadJSON(url,{timeout:3500,validate:v=>{
      if(Array.isArray(defaults[i]))return Array.isArray(v);
      if(!isRecord(v))return false;
      if(i===1)return Array.isArray(v.trackProfiles)&&Array.isArray(v.sources);
      if(i===3)return ['roots','links','sources','territorialExamples'].every(k=>Array.isArray(v[k]));
      if(i===5)return Array.isArray(v.cases);
      if(i===6)return Array.isArray(v.records)&&Array.isArray(v.eligibilitySources)&&v.country==='RU';
      return true;
    }})};}
    catch{return {value:defaults[i],failed:url};}
  }));
  const [core,extensions]=await Promise.all([corePromise,optional,manifestPromise]);
  const [scales,questions,sectors,conditions,tracks,authorities]=core;
  let [competencies,careerFramework,entryRoutes,hierarchy,resources,agencyStudies,publicService]=extensions.map(x=>x.value);
  if(!extensions[6].failed){
    try{if(validatePublicRegistry(publicService,{tracks,sectors}).length)throw new Error('invalid-extension');}
    catch{publicService=defaults[6];extensions[6].failed=optionalFiles[6];}
  }
  return {scales,questions,sectors,conditions,tracks,authorities,competencies,careerFramework,entryRoutes,hierarchy,resources,agencyStudies,publicService,
    unavailable:extensions.filter(x=>x.failed).map(x=>x.failed)};
}

function updateResumeButton() {
  const answered = Object.keys(state.answers).length;
  const button = $("#resume-button");
  if (!button) return;
  const hasProgress = answered > 0 || state.prioritySectors.length || Object.keys(state.conditions).length;
  const start = $("#start-test-button");
  if (start) start.firstChild.nodeValue = state.completedAt ? "Мой результат" : hasProgress ? "Продолжить тест" : "Начать тест";
  button.hidden = !hasProgress;
  button.setAttribute('aria-label', state.completedAt ? 'Мой результат' : 'Продолжить тест');
  button.querySelector("span").textContent = state.completedAt ? "Мой результат" : `Продолжить · ${answered}/27`;
}

function firstUnansweredIndex() {
  const index = data.questions.findIndex((question) => !state.answers[question.id]);
  return index === -1 ? data.questions.length - 1 : index;
}

function resolveResumeRoute() {
  if (state.completedAt) return "results";
  if (Object.keys(state.answers).length < data.questions.length) {
    state.questionIndex = firstUnansweredIndex();
    return "test";
  }
  if (state.prioritySectors.length !== 4 || state.lowPrioritySectors.length !== 2) return "sectors";
  if (CONDITION_IDS.some((id) => !state.conditions[id])) return "conditions";
  return "results";
}

function activeRoute() {
  return $(".view:not([hidden])")?.id?.replace("view-", "") || "home";
}

function routeTo(route, { updateHash = true, replace = false, focus = true } = {}) {
  const valid = ["home", "test", "sectors", "conditions", "results", "directory", "compare", "seminar", "methodology", "structure", "scenarios", "opportunities", "workshop", "lab", "public-service", "vacancies"];
  if(route==='main-content'){document.getElementById('main-content')?.focus();return;}
  if (!valid.includes(route)) route = "home";
  if(route==='results'&&!completionStatus({...state,questions:data.questions}).complete)route=resolveResumeRoute();
  const unavailableRoutes={workshop:'data/agency-studies.json','public-service':'data/public-service.json',structure:'data/hierarchy.json',opportunities:'data/career-resources.json'};
  if(data.unavailable.includes(unavailableRoutes[route])){
    toast('Раздел временно недоступен. Основной тест продолжает работать.');return;
  }

  $$(".view").forEach((view) => { view.hidden = view.id !== `view-${route}`; });
  $$("[data-route]").forEach((button) => {
    const active = button.dataset.route === route;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $$(".mobile-bottom-nav button").forEach((button) => button.classList.toggle("active", button.dataset.route === route));

  if (route === "test") {
    if (state.questionIndex >= data.questions.length) state.questionIndex = firstUnansweredIndex();
    renderQuestion();
  } else if (route === "sectors") {
    renderSectors();
  } else if (route === "conditions") {
    renderConditions();
  } else if (route === "results") {
    renderResults();
  } else if (route === "directory") {
    renderDirectory();
  } else if (route === "compare") {
    renderCompare();
  } else if (route === "seminar") {
    renderSeminarBase();
  }

  workspace?.render(route);
  classroom?.render(route);
  decisionLab?.render(route);
  publicService?.render(route);
  vacancies?.render(route);
  $$(".nav-more[open]").forEach(el=>el.open=false);
  state.lastRoute = route;
  saveState();
  if (updateHash) __careerHost.routeChanged(route, {replace});
  window.scrollTo({ top: 0, behavior: "instant" });
  if(focus){const heading=$(`#view-${route} h1`)||$("#main-content");heading.setAttribute("tabindex","-1");heading.focus({preventScroll:true});}
  $(".desktop-nav")?.classList.remove("open");
  $("#mobile-menu-button")?.setAttribute("aria-expanded", "false");
}

function startOrResume() {
  routeTo(resolveResumeRoute());
}

function renderLiveProfile() {
  const profile = computeRoleProfile(state.answers, data.questions);
  const scaleMap = new Map(data.scales.map((scale) => [scale.id, scale]));
  $("#live-profile").innerHTML = SCALE_IDS.map((id) => {
    const score = profile.raw[id] || 3;
    const answeredOnScale = data.questions.filter((q) => q.scale === id && state.answers[q.id]).length;
    const width = answeredOnScale ? ((score - 1) / 4) * 100 : 0;
    return `<div class="live-profile-row">
      <label>${escapeHtml(scaleMap.get(id)?.short || id)}</label>
      <b>${answeredOnScale ? score.toFixed(1) : "—"}</b>
      <div class="live-profile-bar"><span style="width:${width}%"></span></div>
    </div>`;
  }).join("");
}

function renderQuestion() {
  const question = data.questions[state.questionIndex];
  if (!question) return;
  const total = data.questions.length;
  const current = state.questionIndex + 1;
  const answered=Object.keys(state.answers).length;
  const percent = Math.round((answered / total) * 100);
  $("#question-counter").textContent = `Вопрос ${current} из ${total}`;
  $("#question-percent").textContent = `${percent}%`;
  $("#question-progress").style.width = `${percent}%`;
  $("#question-progress").parentElement.setAttribute("aria-valuenow",answered);
  $("#question-text").textContent = question.text;
  const labels = ["Совершенно неинтересно", "Скорее неинтересно", "Трудно сказать", "Скорее интересно", "Очень интересно"];
  $("#answer-options").innerHTML = labels.map((label, index) => {
    const value = index + 1;
    const selected = Number(state.answers[question.id]) === value;
    return `<button type="button" class="answer-option${selected ? " selected" : ""}" data-answer="${value}" role="radio" tabindex="${selected || (!state.answers[question.id] && value===1) ? 0 : -1}" aria-checked="${selected}">
      <b>${value}</b><span>${label}</span>
    </button>`;
  }).join("");
  $("#question-next").disabled = !state.answers[question.id];
  $("#question-next").innerHTML = state.questionIndex === total - 1 ? `Выбрать сферы${icon("arrow-right")}` : `Следующий вопрос${icon("arrow-right")}`;
  $("#question-back").innerHTML = `${icon("arrow-left")}${state.questionIndex ? "Предыдущий вопрос" : "На главную"}`;
  renderLiveProfile();
  renderQuestionMap();
  $$("#answer-options .answer-option").forEach((button) => button.addEventListener("click", () => selectAnswer(Number(button.dataset.answer))));
}

function renderQuestionMap() {
  const root=$("#question-map-grid");
  root.innerHTML=data.questions.map((q,i)=>`<button type="button" data-question-index="${i}" class="${state.answers[q.id]?'answered':''}" ${state.questionIndex===i?'aria-current="step"':''} aria-label="${escapeHtml(translate(`Вопрос ${i+1} из ${data.questions.length}`))}: ${escapeHtml(translate(state.answers[q.id]?'Ответ сохранён':'Без ответа'))}">${i+1}</button>`).join('');
  root.querySelectorAll('[data-question-index]').forEach(b=>b.addEventListener('click',()=>{state.questionIndex=Number(b.dataset.questionIndex);saveState();renderQuestion();focusQuestion();}));
}
function focusQuestion(){const h=$("#question-text");h.setAttribute('tabindex','-1');h.focus({preventScroll:true});h.scrollIntoView({block:matchMedia('(max-width:680px)').matches?'start':'center',behavior:'instant'});}

function selectAnswer(value) {
  const question = data.questions[state.questionIndex];
  if(state.answers[question.id]!==value)invalidateResult();
  state.answers[question.id] = value;
  saveState();
  renderQuestion();
  $(`#answer-options [data-answer="${value}"]`)?.focus({preventScroll:true});
}

function moveQuestion(direction) {
  if (direction < 0) {
    if (state.questionIndex === 0) return routeTo("home");
    state.questionIndex -= 1;
    saveState();
    renderQuestion();
    focusQuestion();
    return;
  }
  const question = data.questions[state.questionIndex];
  if (!state.answers[question.id]) {
    toast("Сначала выберите вариант ответа.");
    return;
  }
  if (state.questionIndex === data.questions.length - 1) return routeTo("sectors");
  state.questionIndex += 1;
  saveState();
  renderQuestion();
  focusQuestion();
}

function sectorState(id) {
  const priorityIndex = state.prioritySectors.indexOf(id);
  const lowIndex = state.lowPrioritySectors.indexOf(id);
  return { priority: priorityIndex >= 0, low: lowIndex >= 0, priorityIndex, lowIndex };
}

function togglePrioritySector(id) {
  const current = sectorState(id);
  if (current.priority) state.prioritySectors.splice(current.priorityIndex, 1);
  else {
    if (state.prioritySectors.length >= 4) return toast("Можно выбрать не более четырёх приоритетных сфер.");
    if (current.low) state.lowPrioritySectors.splice(current.lowIndex, 1);
    state.prioritySectors.push(id);
  }
  invalidateResult();
  saveState();
  renderSectors();
  $(`[data-sector="${id}"] .priority-toggle`)?.focus({preventScroll:true});
}

function toggleLowSector(id) {
  const current = sectorState(id);
  if (current.low) state.lowPrioritySectors.splice(current.lowIndex, 1);
  else {
    if (state.lowPrioritySectors.length >= 2) return toast("Можно отметить не более двух менее привлекательных сфер.");
    if (current.priority) state.prioritySectors.splice(current.priorityIndex, 1);
    state.lowPrioritySectors.push(id);
  }
  invalidateResult();
  saveState();
  renderSectors();
  $(`[data-sector="${id}"] .low-toggle`)?.focus({preventScroll:true});
}

function renderSectorOrder(){
  let root=$("#sector-order");if(!root){root=document.createElement('div');root.id='sector-order';$("#sector-grid").before(root);}
  const labels={prioritySectors:'Приоритеты: от первого к четвёртому',lowPrioritySectors:'Менее интересные: последняя строка наименее привлекательна'};
  root.innerHTML=Object.entries(labels).map(([key,label])=>`<div><h3>${label}</h3>${state[key].length?state[key].map((id,i)=>`<div class="sector-order-row"><span><b class="order-index">${i+1}.</b> <span>${escapeHtml(data.sectors.find(s=>s.id===id)?.title||id)}</span></span><button type="button" data-order="${key}" data-index="${i}" data-direction="-1" ${!i?'disabled':''} aria-label="Поднять приоритет">${icon('arrow-left')}</button><button type="button" data-order="${key}" data-index="${i}" data-direction="1" ${i===state[key].length-1?'disabled':''} aria-label="Опустить приоритет">${icon('arrow-right')}</button></div>`).join(''):'<p>Выберите сферы ниже.</p>'}</div>`).join('');
  $$('[data-order]',root).forEach(b=>b.addEventListener('click',()=>{
    const key=b.dataset.order,i=Number(b.dataset.index),j=i+Number(b.dataset.direction);if(j<0||j>=state[key].length)return;
    [state[key][i],state[key][j]]=[state[key][j],state[key][i]];invalidateResult();saveState();renderSectors();
    $(`[data-order="${key}"][data-index="${j}"]:not([disabled])`)?.focus({preventScroll:true});
  }));
}

function renderSectors() {
  $("#priority-count").textContent = `${state.prioritySectors.length} / 4`;
  $("#low-count").textContent = `${state.lowPrioritySectors.length} / 2`;
  $("#sectors-next").disabled = state.prioritySectors.length !== 4 || state.lowPrioritySectors.length !== 2;
  state.focusAreas=sanitizeFocusAreas(state.focusAreas,state.prioritySectors);
  renderSectorOrder();
  $("#sector-grid").innerHTML = data.sectors.map((sector) => {
    const selection = sectorState(sector.id);
    const className = selection.priority ? " priority" : selection.low ? " low" : "";
    const rankText = selection.priority ? selection.priorityIndex + 1 : selection.low ? "−" : "";
    return `<article class="sector-card${className}" data-sector="${sector.id}">
      <div class="sector-rank">${rankText}</div>
      <div class="sector-icon">${icon(iconForSector(sector.id))}</div>
      <h2>${escapeHtml(sector.title)}</h2>
      <p>${escapeHtml(sector.description)}</p>
      <div class="sector-actions">
        <button type="button" class="priority-toggle" aria-pressed="${selection.priority}">${selection.priority ? "Убрать из приоритета" : "В приоритет"}</button>
        <button type="button" class="low-toggle" aria-pressed="${selection.low}">${selection.low ? "Убрать отметку" : "Не моё"}</button>
      </div>
    </article>`;
  }).join("");
  renderTopicQuestions();
  $$(".sector-card").forEach((card) => {
    $(".priority-toggle", card).addEventListener("click", () => togglePrioritySector(card.dataset.sector));
    $(".low-toggle", card).addEventListener("click", () => toggleLowSector(card.dataset.sector));
  });
}

function renderTopicQuestions() {
  let root=$('#topic-questions');if(!root){root=document.createElement('section');root.id='topic-questions';root.className='topic-questions';$('#sector-grid').after(root);}
  const groups=activeTopicGroups(state.prioritySectors).map(id=>TOPIC_GROUPS.find(g=>g.id===id));
  root.innerHTML=groups.length?`<h2>Уточните, что именно интересно</h2><p>Необязательно. До двух уточнений в приоритетных сферах помогают различать соседние ведомства. Можно оставить широкий выбор.</p>${groups.map(g=>`<fieldset><legend>${escapeHtml(data.sectors.find(s=>s.id===g.id).title)}</legend><div class="topic-options"><button type="button" data-topic-group="${g.id}" data-topic="" aria-pressed="${!state.focusAreas[g.id]}">Пока не различаю / вся сфера</button>${g.topics.map(t=>`<button type="button" data-topic-group="${g.id}" data-topic="${t.id}" aria-pressed="${state.focusAreas[g.id]===t.id}"><span data-no-i18n>${escapeHtml(t.title[getLanguage()]||t.title.ru)}</span></button>`).join('')}</div></fieldset>`).join('')}`:'';
  $$('[data-topic-group]',root).forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.topic)state.focusAreas[b.dataset.topicGroup]=b.dataset.topic;else delete state.focusAreas[b.dataset.topicGroup];
    invalidateResult();saveState();renderTopicQuestions();
    $(`[data-topic-group="${b.dataset.topicGroup}"][data-topic="${b.dataset.topic}"]`,root)?.focus({preventScroll:true});
  }));
}

function renderConditions() {
  $("#condition-list").innerHTML = data.conditions.map((condition) => {
    const selected = Number(state.conditions[condition.id] || 0);
    return `<article class="condition-card">
      <div class="condition-title">
        <div class="condition-icon">${icon("method")}</div>
        <div><h2>${escapeHtml(condition.title)}</h2><p>${escapeHtml(condition.description)}</p></div>
      </div>
      <div class="condition-control">
        <div class="condition-scale" role="radiogroup" aria-label="${escapeHtml(condition.title)}">
          ${[1, 2, 3, 4, 5].map((value) => `<button type="button" class="condition-option${selected === value ? " selected" : ""}" data-condition="${condition.id}" data-value="${value}" role="radio" tabindex="${selected===value || (!selected && value===1) ? 0 : -1}" aria-checked="${selected === value}">${value}</button>`).join("")}
        </div>
        <div class="condition-anchors"><span>${escapeHtml(condition.low)}</span><span>${escapeHtml(condition.high)}</span></div>
      </div>
    </article>`;
  }).join("");
  $("#calculate-button").disabled = !completionStatus({...state,questions:data.questions}).complete;
  renderReview();
  $$(".condition-option").forEach((button) => button.addEventListener("click", () => {
    if(state.conditions[button.dataset.condition]!==Number(button.dataset.value))invalidateResult();
    state.conditions[button.dataset.condition] = Number(button.dataset.value);
    saveState();
    renderConditions();
    $(`.condition-option[data-condition="${button.dataset.condition}"][data-value="${button.dataset.value}"]`)?.focus({preventScroll:true});
  }));
}

function renderReview() {
  const root=$("#answer-review");
  const names=ids=>ids.map(id=>`<li>${escapeHtml(data.sectors.find(s=>s.id===id)?.title||id)}</li>`).join('');
  root.innerHTML=`<h2>Перед расчётом</h2><p>Проверьте порядок сфер и при необходимости измените ответы. Индекс покажет относительную близость интересов к направлениям работы, а не вероятность трудоустройства.</p><div class="review-summary"><div><h3>Четыре приоритетные сферы</h3><ol>${names(state.prioritySectors)}</ol></div><div><h3>Две менее интересные сферы</h3><ol>${names(state.lowPrioritySectors)}</ol></div></div><button class="text-link" type="button" id="review-sectors">Изменить выбор сфер</button><details class="review-answers"><summary>Проверить 27 ответов</summary>${data.questions.map((q,i)=>`<button type="button" class="review-answer" data-review-question="${i}"><span>${i+1}</span><span>${escapeHtml(q.text)}</span><strong>${state.answers[q.id]||'—'} / 5</strong></button>`).join('')}</details>`;
  $('#review-sectors').onclick=()=>routeTo('sectors');
  $$('[data-review-question]',root).forEach(b=>b.onclick=()=>{state.questionIndex=Number(b.dataset.reviewQuestion);routeTo('test');});
}

function calculateResults() {
  const status = completionStatus({
    answers: state.answers,
    questions: data.questions,
    prioritySectors: state.prioritySectors,
    lowPrioritySectors: state.lowPrioritySectors,
    conditions: state.conditions,
    focusAreas: state.focusAreas
  });
  if (!status.complete) {
    toast("Для расчёта завершите все три этапа.");
    return null;
  }
  latestResult = rankAuthorities({
    authorities: data.authorities,
    tracks: data.tracks,
    questions: data.questions,
    sectors: data.sectors,
    answers: state.answers,
    prioritySectors: state.prioritySectors,
    lowPrioritySectors: state.lowPrioritySectors,
    conditions: state.conditions,
    focusAreas: state.focusAreas
  });
  state.completedAt ||= new Date().toISOString();
  state.resultRecordId ||= anonymousId();
  saveState();
  __careerHost.resultCalculated(createAnonymousRecord({
    recordId:state.resultRecordId,createdAt:state.completedAt,roleProfile:latestResult.roleProfile,
    prioritySectors:state.prioritySectors,lowPrioritySectors:state.lowPrioritySectors,
    conditions:state.conditions,focusAreas:state.focusAreas,ranked:latestResult.ranked
  }));
  return latestResult;
}

function getResults() {
  if (latestResult) return latestResult;
  return calculateResults();
}

function radarSvg(profile) {
  const values = SCALE_IDS.map((id) => profile.normalized[id] ?? 0.5);
  const count = values.length;
  const center = 105;
  const radius = 78;
  const point = (index, ratio) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio];
  };
  const polygon = values.map((value, index) => point(index, 0.25 + 0.75 * value).join(",")).join(" ");
  const grids = [0.25, 0.5, 0.75, 1].map((ratio) => `<polygon points="${SCALE_IDS.map((_, i) => point(i, ratio).join(",")).join(" ")}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>`).join("");
  const axes = SCALE_IDS.map((_, i) => {
    const [x, y] = point(i, 1);
    return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,.17)" stroke-width="1"/>`;
  }).join("");
  return `<svg viewBox="0 0 210 210" role="img" aria-label="Диаграмма профессионального профиля">
    ${grids}${axes}
    <polygon points="${polygon}" fill="rgba(255,255,255,.23)" stroke="#fff" stroke-width="2.2"/>
    ${values.map((value, i) => { const [x, y] = point(i, 0.25 + 0.75 * value); return `<circle cx="${x}" cy="${y}" r="3.3" fill="#fff" stroke="#087bc1" stroke-width="1.5"/>`; }).join("")}
    <circle cx="${center}" cy="${center}" r="4" fill="#fff"/>
  </svg>`;
}

function renderResults() {
  const result = getResults();
  if (!result) return routeTo(resolveResumeRoute());
  const government = result.ranked.filter((item) => !["corporation", "fund"].includes(item.entityType)).map((item, index) => ({ ...item, rank: index + 1 }));
  const employers = result.ranked.filter((item) => ["corporation", "fund"].includes(item.entityType)).map((item, index) => ({ ...item, rank: index + 1 }));
  const top = government.slice(0, 5);
  const leadingTies=government.filter(a=>Math.abs(a.rawScore-government[0]?.rawScore)<1e-8);
  const cutTies=government.slice(5).filter(a=>Math.abs(a.rawScore-top[4]?.rawScore)<1e-8);
  const discovery = selectDiscoveryCandidate(government);
  const explanation = top[0] ? buildExplanation(top[0], result.roleProfile, data.scales, data.sectors) : null;
  const scaleMap = new Map(data.scales.map((scale) => [scale.id, scale]));
  const strongest = Object.entries(result.roleProfile.raw).sort((a,b)=>b[1]-a[1]);
  const priorityNames = state.prioritySectors.map((id) => data.sectors.find((sector) => sector.id === id)?.title).filter(Boolean);
  const broadMessage = result.roleProfile.lowInterest
    ? "Положительный интерес к предложенным видам работы пока не выражен. Ниже – направления для знакомства, а не подтверждение профессиональной склонности."
    : result.roleProfile.flat
    ? "Ваши оценки видов работы близки друг к другу. Рейтинг в большей степени опирается на выбранные сферы государственной политики."
    : `Относительно предпочтительный вид работы: ${scaleMap.get(strongest[0][0])?.title.toLowerCase()}.`;
  const trackProfile = data.careerFramework.trackProfiles.find((item) => item.id === top[0]?.track?.id);
  const development = result.roleProfile.flat || result.roleProfile.lowInterest ? null : buildTrackDevelopmentPlan(trackProfile, competencyMap(data.competencies));

  $("#results-root").innerHTML = `
    <section class="results-hero">
      <div class="results-intro">
        <span class="step-kicker">Ваша карьерная карта</span>
        <h1>${escapeHtml(result.roleProfile.lowInterest ? "Направления для знакомства" : result.roleProfile.flat ? "Широкий профиль интересов" : (top[0]?.track?.title || "Публичное управление"))}</h1>
        <p>${escapeHtml(broadMessage)} Индекс показывает относительную близость внутри текущего реестра и не является вероятностью трудоустройства.</p>
        <div class="result-actions">
          <button id="save-scenario-result" class="button button-primary" type="button">${icon("file")}Сохранить сценарий</button>
          <button id="print-result" class="button button-primary" type="button">${icon("print")}Печать / PDF</button>
          <button id="export-result" class="button button-secondary" type="button">${icon("download")}Экспорт для группы</button>
          <button id="copy-result" class="button button-secondary" type="button">${icon("copy")}Копировать итог</button>
          <button id="reset-result" class="button button-secondary" type="button">${icon("reset")}Пройти заново</button>
        </div>
      </div>
      <div class="profile-panel">
        <h2 class="profile-title">Все девять видов работы</h2><p class="profile-scale-note">Интерес: от 1 до 5. Это не оценка способностей.</p>
        <div class="profile-strengths">
          ${Object.entries(result.roleProfile.raw).map(([id, value]) => `<div class="profile-strength"><span>${escapeHtml(scaleMap.get(id)?.title || id)}</span><b>${value.toFixed(1)} / 5</b><i><em style="width:${((value - 1) / 4) * 100}%"></em></i></div>`).join("")}
          <div class="profile-flag">${result.roleProfile.lowInterest ? "Низкий общий интерес: интерпретация ограничена" : result.roleProfile.flat ? "Широкий, пока слабо дифференцированный профиль" : "Профиль достаточно различим для относительного сопоставления"}</div>
        </div>
      </div>
    </section>

    <section class="dl-lab-launch"><div><h2>Разберитесь, почему выбран этот орган</h2><p>Посмотрите вклад интересов, сфер и условий. Сравните другой вариант, не меняя исходных ответов.</p></div><button id="result-to-lab" class="button button-primary" type="button">Лаборатория выбора${icon("chart")}</button></section>
    <section class="results-section">
      <div class="results-section-header"><div><h2>Наиболее близкие органы власти</h2><p>ТОП-5 с указанием карьерного трека, за счёт которого сформировалась рекомендация.</p></div><button id="compare-top-three" class="button button-secondary" type="button">${icon("compare")}Сравнить первые три</button></div>
      ${leadingTies.length>1?`<p class="app-notice">Несколько органов имеют одинаковый неокруглённый индекс. Порядок внутри этой группы технический, а не свидетельство различий в пригодности.</p>`:''}
      <div class="top-match-grid">${top.map((item, index) => matchCard(item, index + 1)).join("")}</div>
      ${cutTies.length?`<details class="equal-results"><summary>За границей ТОП-5 есть органы с тем же индексом</summary><div class="tag-row">${cutTies.map(a=>`<button type="button" class="button button-secondary open-authority" data-authority="${a.id}">${escapeHtml(a.shortName)}</button>`).join('')}</div><p>Они не менее близки в текущей модели, чем пятый результат.</p></details>`:''}
    </section>

    <section id="result-vacancies" class="vac-result-preview" data-no-i18n></section>
    <section class="ps-entry-link"><div><strong>За пределами исполнительной власти</strong><p>Аппараты парламентов и судов, региональные и муниципальные органы России. Отдельное сопоставление по тем же ответам.</p></div><button type="button" class="button button-primary" id="result-to-public">Другие ветви и уровни${icon("arrow-right")}</button></section>
    <section class="workshop-launch"><div><h2>Проверьте интерес на примере задачи</h2><p>Пройдите профессиональную пробу или заполните лист выбора для одного из рекомендованных органов.</p></div><button id="result-to-workshop" class="button button-primary" type="button">Открыть мастерскую${icon("arrow-right")}</button></section>
    ${development ? `<section class="results-section career-development-section">
      <div class="results-section-header"><div><span class="step-kicker">Не оценка навыков, а ориентир развития</span><h2>Как подготовиться к треку «${escapeHtml(development.title)}»</h2><p>Ниже перечислены типичные знания и учебные результаты, которые полезно формировать независимо от конкретного ведомства.</p></div></div>
      <div class="development-grid">
        <article class="development-card"><div class="development-icon">${icon("graduation")}</div><h3>Образовательная база</h3><strong>Основные направления</strong><ul>${development.education.core.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><strong>Смежная подготовка</strong><ul>${development.education.adjacent.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
        <article class="development-card"><div class="development-icon">${icon("briefcase")}</div><h3>Компетенции трека</h3><div class="competency-cloud">${development.competencies.map((item) => `<button class="competency-pill" type="button" data-competency="${item.id}" title="${escapeHtml(item.description)}">${escapeHtml(item.title)}</button>`).join("")}</div><p class="development-note">Нажмите на компетенцию, чтобы увидеть пример учебного доказательства.</p></article>
        <article class="development-card"><div class="development-icon">${icon("route")}</div><h3>Три практических шага</h3><ol>${development.portfolio.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol><p class="development-note">Такие материалы можно включать в учебное портфолио и обсуждать на практике или собеседовании.</p></article>
      </div>
    </section>` : ""}

    ${discovery ? `<section class="results-section">
      <div class="results-section-header"><div><h2>Неочевидный вариант</h2><p>Дополнительный орган для знакомства. Его место и индекс можно проверить в полном рейтинге.</p></div></div>
      <article class="discovery-card">
        <div class="discovery-icon">${icon("star")}</div>
        <div><h3>${escapeHtml(discovery.shortName)}</h3><p>${escapeHtml(discovery.mission)} Ближайший трек: ${escapeHtml(discovery.track?.title || "государственное управление")}.</p></div>
        <button class="button button-secondary open-authority" type="button" data-authority="${discovery.id}">Изучить орган${icon("arrow-right")}</button>
      </article>
    </section>` : ""}

    <section class="results-section"><div class="result-insights">
      <article class="insight-card"><h3>Ваши приоритетные сферы</h3><div class="tag-row">${priorityNames.map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("")}</div></article>
      <article class="insight-card"><h3>Почему первый результат оказался близким</h3><p>${escapeHtml(result.roleProfile.lowInterest ? "Положительный интерес пока не выражен; высокий относительный индекс не доказывает склонность." : result.roleProfile.flat ? "Виды работы пока не различаются по привлекательности. Наиболее близкий трек в карточке – пример из модели органа, а не выявленное предпочтение." : explanation?.reason || "")}</p><p>${escapeHtml(explanation?.sectorReason || "")}</p></article>
    </div></section>

    ${employers.length ? `<section class="results-section"><div class="results-section-header"><div><h2>Похожие работодатели публичного сектора</h2><p>Государственные корпорации и фонды показаны отдельно от органов власти.</p></div></div><div class="top-match-grid">${employers.slice(0, 4).map((item, index) => matchCard(item, index + 1, true)).join("")}</div></section>` : ""}

    <section class="results-section">
      <div class="results-section-header"><div><h2>Полный рейтинг органов власти</h2><p>Небольшие различия в баллах не следует интерпретировать как принципиальные.</p></div></div>
      <div class="full-ranking">
        ${government.map((item, index) => `<div class="ranking-row">
          <span class="ranking-position">${index + 1}</span>
          <button class="ranking-name ranking-open open-authority" type="button" data-authority="${item.id}" aria-label="Открыть досье ${escapeHtml(item.shortName)}"><strong>${escapeHtml(item.shortName)}</strong><small>${escapeHtml(item.entityTypeLabel)}</small></button>
          <span class="ranking-track">${escapeHtml(item.track?.title || "")}</span>
          <strong class="ranking-score">${item.score.toFixed(1)}</strong>
          <button class="ranking-compare compare-toggle" type="button" data-authority="${item.id}" aria-label="Добавить ${escapeHtml(item.shortName)} в сравнение">${icon("compare")}</button>
          ${icon("chevron")}
        </div>`).join("")}
      </div>
    </section>`;

  bindResultEvents();
  syncCompareButtons();
}

function matchCard(item, rank, publicSector = false) {
  const selected = state.compareIds.includes(item.id);
  return `<article class="match-card">
    <div class="match-rank"><span>${rank}</span><div class="match-score"><strong>${item.score.toFixed(1)}</strong><small>индекс</small></div></div>
    <h3>${escapeHtml(item.shortName)}</h3>
    <span class="match-type">${escapeHtml(publicSector ? item.entityTypeLabel : item.entityTypeLabel)}</span>
    <div class="match-track"><b>Ближайший трек</b>${escapeHtml(item.track?.title || "Публичное управление")}</div>
    <div class="match-card-actions"><button class="match-more open-authority" type="button" data-authority="${item.id}">${escapeHtml(item.band.label)}${icon("arrow-right")}</button><button class="compare-toggle${selected ? " selected" : ""}" type="button" data-authority="${item.id}" aria-pressed="${selected}">${icon("compare")}<span>${selected ? "Выбрано" : "Сравнить"}</span></button></div>
    <button type="button" class="dl-explain-link" data-explain-authority="${item.id}">Почему этот орган?</button>
    <button type="button" class="vac-card-link" data-vacancy-open="${item.id}">${icon("briefcase")}Вакансии и конкурсы</button>
  </article>`;
}

function bindResultEvents() {
  $("#result-to-public")?.addEventListener("click",()=>routeTo("public-service"));
  $("#result-to-lab")?.addEventListener("click",()=>decisionLab.open());
  $$("[data-explain-authority]",$("#results-root")).forEach(b=>b.addEventListener("click",()=>decisionLab.open(b.dataset.explainAuthority)));
  $("#result-to-workshop")?.addEventListener("click",()=>routeTo("workshop"));
  $("#save-scenario-result").addEventListener("click",()=>{routeTo("scenarios");$("#scenario-title").focus();});
  $$(".open-authority", $("#results-root")).forEach((element) => element.addEventListener("click", () => openAuthority(element.dataset.authority)));
  $$(".compare-toggle", $("#results-root")).forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleCompare(button.dataset.authority);
  }));
  $("#print-result")?.addEventListener("click", () => window.print());
  $("#export-result")?.addEventListener("click", exportAnonymousResult);
  $("#copy-result")?.addEventListener("click", copyResult);
  $("#compare-top-three")?.addEventListener("click", () => {
    const topIds = getResults().ranked.filter((item) => !["corporation", "fund"].includes(item.entityType)).slice(0, 3).map((item) => item.id);
    state.compareIds = topIds;
    saveState();
    routeTo("compare");
  });
  $("#reset-result")?.addEventListener("click", () => {
    if (confirm(translate("Удалить текущие ответы и пройти тест заново? Выбранные для сравнения органы сохранятся."))) {
      resetState();
      routeTo("test");
    }
  });
  $$(".competency-pill", $("#results-root")).forEach((button) => button.addEventListener("click", () => {
    const item = data.competencies.find((competency) => competency.id === button.dataset.competency);
    if (item) toast(`${item.title}: ${item.evidenceIdeas?.[0] || item.description}`);
  }));
}

async function copyResult() {
  const result = getResults();
  if (!result) return;
  const government = result.ranked.filter((item) => !["corporation", "fund"].includes(item.entityType)).slice(0, 5);
  const text = [
    "Мой результат профориентационного теста для госслужащих:",
    ...government.map((item, index) => `${index + 1}. ${item.shortName} — ${item.score.toFixed(1)}; трек: ${item.track?.title || "публичное управление"}.`),
    "Индекс является относительным показателем внутри учебной модели."
  ].join("\n");
  try {
    await navigator.clipboard.writeText(getLanguage() !== "ru" ? text.split("\n").map(line=>translate(line)).join("\n") : text);
    toast("Краткий итог скопирован.");
  } catch {
    toast("Не удалось получить доступ к буферу обмена.");
  }
}

function anonymousId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function downloadText(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportAnonymousResult() {
  const result = getResults();
  if (!result) return;
  const record = createAnonymousRecord({
    recordId: state.resultRecordId || anonymousId(),
    createdAt: state.completedAt || new Date().toISOString(),
    roleProfile: result.roleProfile,
    prioritySectors: state.prioritySectors,
    lowPrioritySectors: state.lowPrioritySectors,
    conditions: state.conditions,
    focusAreas: state.focusAreas,
    ranked: result.ranked
  });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`rudn-career-result-${stamp}-${record.recordId.slice(0, 8)}.json`, JSON.stringify(record, null, 2), "application/json;charset=utf-8");
  toast("Обезличенный файл результата подготовлен.");
}

function directoryMatches(authority, query, type, sector, track) {
  if (type && authority.entityType !== type) return false;
  if (sector && !(authority.sectors || []).some((item) => item.id === sector)) return false;
  if (track && !(authority.tracks || []).some((item) => item.id === track)) return false;
  if (!query) return true;
  const trackMap = new Map(data.tracks.map((item) => [item.id, item]));
  const sectorMap = new Map(data.sectors.map((item) => [item.id, item]));
  const careerRoles = buildAuthorityCareerRoles(authority, data.careerFramework, data.competencies, 5);
  const haystack = [
    authority.name, authority.shortName, authority.mission, authority.parent,
    ...(authority.tracks || []).map((item) => trackMap.get(item.id)?.title || ""),
    ...(authority.sectors || []).map((item) => sectorMap.get(item.id)?.title || ""),
    ...careerRoles.flatMap((role) => [role.title, ...role.unitFamilies, ...role.entryRoles, ...role.competencies.map((item) => item.title)])
  ].flatMap(value=>[value,englishText(value),chineseText(value)]).join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function ensureDirectoryOptions() {
  const sectorSelect = $("#directory-sector-filter");
  if (sectorSelect.options.length === 1) sectorSelect.insertAdjacentHTML("beforeend", data.sectors.map((sector) => `<option value="${sector.id}">${escapeHtml(sector.title)}</option>`).join(""));
  const trackSelect = $("#directory-track-filter");
  if (trackSelect.options.length === 1) trackSelect.insertAdjacentHTML("beforeend", data.tracks.map((track) => `<option value="${track.id}">${escapeHtml(track.title)}</option>`).join(""));
}

function renderDirectory() {
  ensureDirectoryOptions();
  const query = $("#directory-search").value.trim();
  const type = $("#directory-type-filter").value;
  const sector = $("#directory-sector-filter").value;
  const track = $("#directory-track-filter").value;
  const filtered = data.authorities.filter((authority) => directoryMatches(authority, query, type, sector, track));
  $("#directory-visible-count").textContent = filtered.length;
  const sectorMap = new Map(data.sectors.map((item) => [item.id, item]));
  $("#directory-grid").innerHTML = filtered.length ? filtered.map((authority) => {
    const selected = state.compareIds.includes(authority.id);
    const careerRoles = buildAuthorityCareerRoles(authority, data.careerFramework, data.competencies, 3);
    return `<article class="authority-card">
      <div class="authority-card-head"><div class="authority-emblem">${icon(authority.entityType === "service" ? "shield" : "landmark")}</div><span class="confidence-dot ${authority.confidence}">Авторский профиль</span></div>
      <h2>${escapeHtml(authority.shortName)}</h2>
      <span class="authority-type">${escapeHtml(authority.entityTypeLabel)}</span>
      <p>${escapeHtml(authority.mission)}</p>
      <div class="authority-card-stat"><strong>${careerRoles.length}</strong><span>${roleCountLabel(careerRoles.length)} в карточке</span></div>
      <div class="tag-row">${(authority.sectors || []).slice(0, 2).map((item) => `<span class="tag">${escapeHtml(sectorMap.get(item.id)?.title || item.id)}</span>`).join("")}</div>
      <div class="authority-card-actions"><button class="authority-open-button open-authority" type="button" data-authority="${authority.id}">Открыть досье${icon("arrow-right")}</button><button class="compare-toggle${selected ? " selected" : ""}" type="button" data-authority="${authority.id}" aria-pressed="${selected}">${icon("compare")}<span>${selected ? "Выбрано" : "Сравнить"}</span></button></div>
    </article>`;
  }).join("") : `<div class="empty-state"><h2>Ничего не найдено</h2><p>Попробуйте изменить запрос или сбросить фильтры.</p></div>`;

  $$(".authority-card .open-authority").forEach((button) => button.addEventListener("click", () => openAuthority(button.dataset.authority)));
  $$(".authority-card .compare-toggle").forEach((button) => button.addEventListener("click", () => toggleCompare(button.dataset.authority)));
  syncCompareButtons();
}

function pathConditionsMarkup(authority, compact=false) {
  const trackMap=new Map(data.tracks.map(t=>[t.id,t]));
  return `<p class="small-note">Условия заданы для направления работы, а не для всего органа. Диапазоны – авторские сценарные предположения, не интервалы статистической уверенности и не требования вакансий. «Не установлено» даёт нейтральный вклад.</p><div class="requirement-table-wrap" tabindex="0" role="region" aria-label="Условия по направлениям работы"><table class="requirement-table"><caption>Условия по направлениям работы</caption><thead><tr><th>Направление</th>${data.conditions.map(c=>`<th>${escapeHtml(c.title)}</th>`).join('')}</tr></thead><tbody>${authority.tracks.map(link=>`<tr><th>${escapeHtml(trackMap.get(link.id)?.title||link.id)}</th>${CONDITION_IDS.map(id=>{const v=link.conditions?.[id];return `<td>${v==null?'Не установлено':Array.isArray(v)?v.join('–')+' / 5':v+' / 5'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function authorityOverviewMarkup(authority, sectorMap, trackMap) {
 return `<div class="dialog-meta"><div><span>Подчинённость</span><strong>${escapeHtml(authority.parent)}</strong></div><div><span>Дата исходной записи</span><strong>${formatDate(authority.verifiedAt)}</strong></div><div><span>Статус оценок</span><strong>Авторская учебная модель</strong></div><div><span>Релевантность подготовки ГМУ</span><strong>${escapeHtml(gmupRelevanceLabel(authority.careerModel?.gmupRelevance))}</strong></div></div>
 <section class="dialog-section"><h2>Сферы деятельности</h2><div class="tag-row">${authority.sectors.map(e=>`<span class="tag">${escapeHtml(sectorMap.get(e.id)?.title||e.id)}</span>`).join('')}</div></section>
 <section class="dialog-section"><h2>Представленные карьерные треки</h2><p>Значимость и состав направлений являются авторским кодированием. Подтверждение функции не означает подтверждения веса или открытого набора.</p><div class="track-list">${authority.tracks.map(e=>`<div class="track-row"><strong>${escapeHtml(trackMap.get(e.id)?.title||e.id)}</strong><span>${e.functionEvidence==='official-function-confirmed'?'Функция подтверждена отдельным источником':'Отдельная проверка функции не завершена'}</span></div>`).join('')}</div></section>
 <section class="dialog-section"><h2>Условия, которые могут иметь значение</h2>${pathConditionsMarkup(authority)}</section>`;
}

function authorityCareersMarkup(authority) {
  const roles = buildAuthorityCareerRoles(authority, data.careerFramework, data.competencies, 5);
  return `<div class="career-model-note">${icon("info")}<p>${escapeHtml(data.careerFramework.scopeNote)}</p></div>
    <div class="career-role-list">${roles.map((role, index) => `<article class="career-role-card${index === 0 ? " featured" : ""}">
      <div class="career-role-heading"><span>${String(index + 1).padStart(2, "0")}</span><div><small>${escapeHtml(role.importanceLabel)}</small><h2>${escapeHtml(role.title)}</h2></div></div>
      <p>${escapeHtml(role.description)}</p>
      <div class="career-role-columns">
        <div><h3>Где такая работа встречается</h3><ul>${role.unitFamilies.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
        <div><h3>Примеры стартовых ролей</h3><ul>${role.entryRoles.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
        <div><h3>Типичные задачи</h3><ul>${role.tasks.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      </div>
      <details class="career-role-details"><summary>Подготовка и дальнейшее развитие</summary><div class="career-role-detail-grid"><div><h3>Образование</h3><div class="tag-row">${[...role.education.core, ...role.education.adjacent.slice(0, 2)].map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div></div><div><h3>Ключевые компетенции</h3><div class="tag-row">${role.competencies.slice(0, 6).map((item) => `<span class="tag">${escapeHtml(item.title)}</span>`).join("")}</div></div><div><h3>Учебное портфолио</h3><ol>${role.portfolio.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></div></div></details>
    </article>`).join("")}</div>`;
}

function authorityEntryMarkup(authority) {
  const routes = relevantEntryRoutes(authority, data.entryRoutes);
  return `<div class="entry-verified"><h2>Проверенные кадровые источники</h2><p>Ссылки не подтверждают наличие открытых вакансий.</p><div class="resource-grid">${resourceCards(resourcesForAuthority(authority,data.resources))}</div><button class="button button-secondary" type="button" data-open-resources="${authority.id}">Все кадровые ориентиры${icon("arrow-right")}</button></div><div class="entry-summary"><div class="entry-summary-icon">${icon("route")}</div><div><span>Система входа</span><strong>${escapeHtml(careerSystemLabel(authority))}</strong><p>Актуальные условия всегда определяет конкретное объявление или кадровый раздел работодателя.</p></div></div>
    <section class="dialog-section"><h2>Возможные маршруты</h2><div class="entry-route-list">${routes.map((route, index) => `<article class="entry-route-card"><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(route.title)}</h3><p>${escapeHtml(route.description)}</p><ol>${route.steps.slice(0, 4).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><a href="${safeUrl(route.url)}" target="_blank" rel="noopener noreferrer">${icon("external")}Проверить официальный ресурс</a></div></article>`).join("")}</div></section>
    <section class="dialog-section"><h2>Что учитывать студенту ГМУ</h2><div class="principle-grid">${data.careerFramework.qualificationPrinciples.map((item) => `<div>${icon("check")}<p>${escapeHtml(item)}</p></div>`).join("")}</div></section>`;
}

function authoritySourcesMarkup(authority) {
  const sourceItems = [
    ...(authority.evidence || []).map((item) => ({ ...item, label: item.title || "Официальная карточка органа" })),
    ...data.careerFramework.sources.map((item) => ({ ...item, label: item.title }))
  ];
  return `${classroom?.sourceForAuthority(authority.id)||""}<div class="source-governance"><h2>Что является официальным, а что модельным</h2><div class="source-governance-grid"><div><strong>Официальные сведения</strong><p>Наименование, институциональный тип, подчинённость, публично описанные полномочия и ссылки на государственные ресурсы.</p></div><div><strong>Учебная модель</strong><p>Веса сфер, карьерные треки, типовые семейства подразделений, примеры ролей и интерпретация условий труда.</p></div></div></div>
    <div class="source-list">${sourceItems.map((source) => `<a href="${safeUrl(source.url || authority.governmentUrl)}" target="_blank" rel="noopener noreferrer"><span class="source-icon">${icon("source")}</span><span><strong>${escapeHtml(source.label)}</strong>${source.locator?`<small>${escapeHtml(source.locator)}</small>`:""}<small>${escapeHtml(source.rationaleText?.[getLanguage()] || source.rationale || source.sourceType || "Официальный источник")}</small></span>${icon("external")}</a>`).join("")}</div>
    <div class="career-model-note warning">${icon("info")}<p>${escapeHtml(authority.careerModel?.note || data.careerFramework.scopeNote)}</p></div>`;
}

function openAuthority(id, initialTab = "overview") {
  const authority = data.authorities.find((item) => item.id === id);
  if (!authority) {publicService?.open(id);return;}
  currentAuthority = authority;
  dialogReturnFocus = document.activeElement;
  const sectorMap = new Map(data.sectors.map((item) => [item.id, item]));
  const trackMap = new Map(data.tracks.map((item) => [item.id, item]));
  const selected = state.compareIds.includes(authority.id);
  $("#authority-dialog-content").innerHTML = `
    <div class="dialog-hero">
      <div class="dialog-hero-top"><div class="authority-emblem">${icon(authority.entityType === "service" ? "shield" : "landmark")}</div><button class="button dialog-compare compare-toggle${selected ? " selected" : ""}" type="button" data-authority="${authority.id}" aria-pressed="${selected}">${icon("compare")}<span>${selected ? "В сравнении" : "Добавить в сравнение"}</span></button></div>
      <h1 id="authority-dialog-title">${escapeHtml(authority.name)}</h1>
      <p class="official-russian-name" lang="ru" data-no-i18n>${escapeHtml(authority.name)}</p>
      <span>${escapeHtml(authority.entityTypeLabel)}</span>
      <button type="button" class="button button-secondary" id="dialog-structure-link">${icon("route")}Положение в системе</button>
      <p>${escapeHtml(authority.mission)}</p>
    </div>
    <div class="dialog-tabs" role="tablist" aria-label="Разделы карьерного досье">
      <button type="button" role="tab" data-dialog-tab="overview">Об органе</button>
      <button type="button" role="tab" data-dialog-tab="careers">Карьерные роли</button>
      <button type="button" role="tab" data-dialog-tab="entry">Как попасть</button>
      <button type="button" role="tab" data-dialog-tab="sources">Источники</button>
    </div>
    <div class="dialog-body">
      <section class="dialog-tab-panel" data-dialog-panel="overview">${authorityOverviewMarkup(authority, sectorMap, trackMap)}</section>
      <section class="dialog-tab-panel" data-dialog-panel="careers" hidden>${authorityCareersMarkup(authority)}</section>
      <section class="dialog-tab-panel" data-dialog-panel="entry" hidden>${authorityEntryMarkup(authority)}</section>
      <section class="dialog-tab-panel" data-dialog-panel="sources" hidden>${authoritySourcesMarkup(authority)}</section>
    </div>`;
  const dialog = $("#authority-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  activateDialogTab(initialTab);
  const notebookButton=document.createElement('button');notebookButton.type='button';notebookButton.className='button button-secondary';notebookButton.id='dossier-to-workbook';notebookButton.textContent='Мой лист карьерного выбора';
  dialog.querySelector('.dialog-tabs').insertAdjacentElement('afterend',notebookButton);
  notebookButton.addEventListener('click',()=>{closeAuthority();classroom.open(authority.id);});
  const dossierActions=document.createElement('div');dossierActions.className='dl-dossier-actions';notebookButton.replaceWith(dossierActions);dossierActions.append(notebookButton);
  const vacancyButton=document.createElement('button');vacancyButton.type='button';vacancyButton.className='button button-secondary';vacancyButton.dataset.vacancyOpen=id;vacancyButton.textContent='Вакансии и конкурсы';dossierActions.append(vacancyButton);
  if(completionStatus({...state,questions:data.questions}).complete){
    const explainButton=document.createElement('button');explainButton.type='button';explainButton.className='button button-secondary';explainButton.id='dossier-to-lab';explainButton.textContent='Разобрать соответствие';dossierActions.append(explainButton);
    explainButton.addEventListener('click',()=>{closeAuthority();decisionLab.open(authority.id);});
  }
  $('[data-open-resources]',dialog)?.addEventListener('click',()=>{closeAuthority();workspace.showResources(authority.id);});
  $$("[data-dialog-tab]", dialog).forEach((button) => button.addEventListener("click", () => activateDialogTab(button.dataset.dialogTab)));
  $(".dialog-tabs", dialog)?.addEventListener("keydown", handleDialogTabKeys);
  $("#dialog-structure-link",dialog)?.addEventListener("click",()=>{closeAuthority();workspace.focusAuthority(authority.id);});
  $(".dialog-compare", dialog)?.addEventListener("click", () => toggleCompare(authority.id));
  requestAnimationFrame(() => $("#dialog-close")?.focus());
}

function activateDialogTab(tab) {
  const dialog = $("#authority-dialog");
  $$('[data-dialog-tab]', dialog).forEach((button) => {
    const active = button.dataset.dialogTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $$('[data-dialog-panel]', dialog).forEach((panel) => { panel.hidden = panel.dataset.dialogPanel !== tab; });
}

function handleDialogTabKeys(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = $$("[data-dialog-tab]", $("#authority-dialog"));
  const current = tabs.indexOf(document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  let next = current;
  if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = tabs.length - 1;
  activateDialogTab(tabs[next].dataset.dialogTab);
  tabs[next].focus();
}

function closeAuthority() {
  const dialog = $("#authority-dialog");
  if (dialog.open && typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  currentAuthority = null;
  if (dialogReturnFocus instanceof HTMLElement) dialogReturnFocus.focus({ preventScroll: true });
}

function formatDate(value) {
  if (!value) return "не указана";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function toggleCompare(id) {
  const outcome = addCompareId(state.compareIds, id, MAX_COMPARE);
  if (outcome.full) return toast(`Можно одновременно сравнивать не более ${MAX_COMPARE} органов.`);
  state.compareIds = outcome.ids;
  saveState();
  syncCompareButtons();
  if (activeRoute() === "compare") renderCompare();
  toast(outcome.removed ? "Орган удалён из сравнения." : "Орган добавлен в сравнение.");
}

function syncCompareButtons() {
  $$(".compare-toggle[data-authority]").forEach((button) => {
    const selected = state.compareIds.includes(button.dataset.authority);
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    const label = $("span", button);
    if (label) {
      if (button.classList.contains("dialog-compare")) label.textContent = selected ? "В сравнении" : "Добавить в сравнение";
      else label.textContent = selected ? "Выбрано" : "Сравнить";
    }
    button.setAttribute("aria-label", `${selected ? "Удалить" : "Добавить"} ${data.authorities.find((item) => item.id === button.dataset.authority)?.shortName || "орган"} ${selected ? "из сравнения" : "в сравнение"}`);
  });
}

function renderCompareTray() {
  if (!data) return;
  state.compareIds = sanitizeCompareIds(state.compareIds, data.authorities, MAX_COMPARE);
  const tray = $("#compare-tray");
  const navButton = $("#compare-nav-button");
  const selected = compareAuthoritySet(state.compareIds, data.authorities);
  tray.hidden = selected.length === 0;
  navButton.hidden = selected.length === 0;
  $("#compare-nav-count").textContent = selected.length;
  $("#compare-tray-status").textContent = selected.length < 2 ? "Добавьте ещё один орган" : `${selected.length} из ${MAX_COMPARE} выбрано`;
  $("#compare-open").disabled = selected.length < 2;
  $("#compare-tray-items").innerHTML = selected.map((authority) => `<button type="button" data-remove-compare="${authority.id}" title="Удалить ${escapeHtml(authority.shortName)}"><span>${escapeHtml(authority.shortName)}</span>${icon("close")}</button>`).join("");
  $$('[data-remove-compare]', tray).forEach((button) => button.addEventListener("click", () => toggleCompare(button.dataset.removeCompare)));
}

function compareConditionMarkup(authority) {return pathConditionsMarkup(authority,true);}

function renderCompare() {
  const selected = compareAuthoritySet(state.compareIds, data.authorities);
  $("#compare-empty").hidden = selected.length > 0;
  $("#compare-clear").disabled = selected.length === 0;
  const root = $("#compare-root");
  if (!selected.length) {
    root.innerHTML = "";
    return;
  }
  const sectorMap = new Map(data.sectors.map((item) => [item.id, item]));
  const columns = selected.map((authority) => {
    const roles = buildAuthorityCareerRoles(authority, data.careerFramework, data.competencies, 3);
    const routes = relevantEntryRoutes(authority, data.entryRoutes).slice(0, 3);
    const competencies = [...new Map(roles.flatMap((role) => role.competencies).map((item) => [item.id, item])).values()].slice(0, 8);
    const education = [...new Set(roles.flatMap((role) => role.education.core))].slice(0, 5);
    return { authority, roles, routes, competencies, education };
  });
  root.innerHTML = `
    ${selected.length < 2 ? `<div class="compare-guidance">${icon("info")}<p>Первый вариант выбран. Добавьте ещё один орган в справочнике или в результатах теста, чтобы увидеть содержательное сравнение.</p><button class="button button-secondary" type="button" data-route="directory">Добавить орган${icon("arrow-right")}</button></div>` : `<div class="compare-actions"><button id="compare-print" class="button button-secondary" type="button">${icon("print")}Печать сравнения</button><button class="button button-secondary" type="button" data-route="directory">${icon("plus")}Добавить или заменить</button></div>`}
    <div class="compare-columns" style="--compare-count:${Math.max(selected.length, 1)}">
      ${columns.map(({ authority, roles, routes, competencies, education }) => `<article class="compare-column">
        <header class="compare-column-header"><div class="authority-emblem">${icon(authority.entityType === "service" ? "shield" : "landmark")}</div><button class="icon-button compare-remove" type="button" data-remove-compare="${authority.id}" aria-label="Удалить ${escapeHtml(authority.shortName)}">${icon("close")}</button><h2>${escapeHtml(authority.shortName)}</h2><span>${escapeHtml(authority.entityTypeLabel)}</span><p>${escapeHtml(authority.mission)}</p><button class="text-link open-authority" type="button" data-authority="${authority.id}">Открыть полное досье${icon("arrow-right")}</button></header>
        <section><h3>Институциональное положение</h3><dl><div><dt>Подчинённость</dt><dd>${escapeHtml(authority.parent)}</dd></div><div><dt>Уверенность модели</dt><dd>${confidenceLabel(authority.confidence)}</dd></div></dl></section>
        <section><h3>Ключевые сферы</h3><div class="tag-row">${(authority.sectors || []).slice(0, 4).map((entry) => `<span class="tag">${escapeHtml(sectorMap.get(entry.id)?.title || entry.id)}</span>`).join("")}</div></section>
        <section><h3>Наиболее характерные роли</h3><div class="compare-role-list">${roles.map((role) => `<div><strong>${escapeHtml(role.title)}</strong><small>${escapeHtml(role.importanceLabel)}</small><p>${escapeHtml(role.unitFamilies[0] || "профильное подразделение")}</p></div>`).join("")}</div></section>
        <section><h3>Образовательная база</h3><ul>${education.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section><h3>Компетенции</h3><div class="tag-row">${competencies.map((item) => `<span class="tag">${escapeHtml(item.title)}</span>`).join("")}</div></section>
        <section><h3>Условия работы</h3><div class="compare-meters">${compareConditionMarkup(authority)}</div></section>
        <section><h3>Способы входа</h3><ol>${routes.map((route) => `<li>${escapeHtml(route.title)}</li>`).join("")}</ol></section>
        <footer><a href="${safeUrl(authority.governmentUrl)}" target="_blank" rel="noopener noreferrer">${icon("external")}Официальная карточка</a></footer>
      </article>`).join("")}
    </div>`;
  $$('[data-remove-compare]', root).forEach((button) => button.addEventListener("click", () => toggleCompare(button.dataset.removeCompare)));
  $$(".open-authority", root).forEach((button) => button.addEventListener("click", () => openAuthority(button.dataset.authority)));
  $$('[data-route]', root).forEach((button) => button.addEventListener("click", () => routeTo(button.dataset.route)));
  $("#compare-print")?.addEventListener("click", () => window.print());
}

function renderSeminarBase() {
  renderGroupDashboard();
}

function drawSeminarAuthority() {
  const pool = data.authorities.filter((authority) => authority.familiarity <= 3 && !["corporation", "fund"].includes(authority.entityType));
  let authority = pool[Math.floor(Math.random() * pool.length)];
  if (seminarAuthority && pool.length > 1 && authority.id === seminarAuthority.id) authority = pool[(pool.indexOf(authority) + 1) % pool.length];
  seminarAuthority = authority;
  const sectorMap = new Map(data.sectors.map((item) => [item.id, item]));
  const trackMap = new Map(data.tracks.map((item) => [item.id, item]));
  const careerRole = buildAuthorityCareerRoles(authority, data.careerFramework, data.competencies, 1)[0];
  $("#seminar-name").textContent = authority.name;
  $("#seminar-mission").textContent = authority.mission;
  $("#seminar-tags").innerHTML = [
    ...(authority.sectors || []).slice(0, 2).map((item) => sectorMap.get(item.id)?.title),
    ...(authority.tracks || []).slice(0, 2).map((item) => trackMap.get(item.id)?.title)
  ].filter(Boolean).map((label) => `<span class="tag">${escapeHtml(label)}</span>`).join("");
  $("#seminar-questions").innerHTML = `
    <li>Какие общественные задачи решает ${escapeHtml(authority.shortName)} и почему для них нужен отдельный федеральный орган?</li>
    <li>Как могла бы выглядеть работа студента ГМУ в роли «${escapeHtml(careerRole?.title || "специалист публичного управления")}"?</li>
    <li>Какую из типовых задач — ${escapeHtml(careerRole?.tasks?.[0] || "анализировать реализацию государственной политики")} — можно превратить в учебный проект?</li>
    <li>Какие условия работы и способы входа в этот орган нужно проверить до выбора практики?</li>`;
  $("#seminar-details").disabled = false;
}

function answersFromTrackVector(vector, variation = 0) {
  return Object.fromEntries(data.questions.map((question, index) => {
    const base = 1 + 4 * Number(vector[question.scale] ?? 0.5);
    const shift = ((index + variation) % 3 - 1) * 0.35;
    return [question.id, Math.max(1, Math.min(5, Math.round(base + shift)))];
  }));
}

function createDemoGroup() {
  const sectorSets = [
    ["FIN", "DIG", "ECO", "INT", "AGR", "ENV"],
    ["SOC", "HEA", "EDU", "DIG", "SEC", "IND"],
    ["ENV", "AGR", "INF", "DIG", "FIN", "SEC"],
    ["INT", "SEC", "ECO", "EDU", "AGR", "EMR"],
    ["INF", "IND", "ECO", "ENV", "SOC", "INT"],
    ["DIG", "ECO", "FIN", "ADM", "AGR", "ENV"]
  ];
  const conditionSets = [
    { FIELD: 2, SCHEDULE: 3, FORMAL: 5, SECURITY: 4 },
    { FIELD: 3, SCHEDULE: 3, FORMAL: 4, SECURITY: 2 },
    { FIELD: 5, SCHEDULE: 4, FORMAL: 4, SECURITY: 3 },
    { FIELD: 3, SCHEDULE: 4, FORMAL: 5, SECURITY: 5 }
  ];
  const records = [];
  for (let index = 0; index < 24; index += 1) {
    const track = data.tracks[index % data.tracks.length];
    const sectors = sectorSets[index % sectorSets.length];
    const answers = answersFromTrackVector(track.vector, index);
    const ranked = rankAuthorities({
      authorities: data.authorities,
      tracks: data.tracks,
      questions: data.questions,
      sectors: data.sectors,
      answers,
      prioritySectors: sectors.slice(0, 4),
      lowPrioritySectors: sectors.slice(4, 6),
      conditions: conditionSets[index % conditionSets.length]
    });
    records.push(createAnonymousRecord({
      recordId: `demo-${String(index + 1).padStart(3, "0")}`,
      createdAt: new Date(Date.UTC(2026, 8, 1 + (index % 4), 9 + (index % 7))).toISOString(),
      roleProfile: ranked.roleProfile,
      prioritySectors: sectors.slice(0, 4),
      lowPrioritySectors: sectors.slice(4, 6),
      conditions: conditionSets[index % conditionSets.length],
      ranked: ranked.ranked
    }));
  }
  return records;
}

const groupErrorLabels = {
  "file-size":"Файл превышает допустимый размер.", "json":"Не удалось прочитать JSON.",
  "bundle-schema":"Неподдерживаемый формат резервной копии.", "record-schema":"Неверная схема, неизвестный орган, посторонние поля или противоречивые значения.",
  "demo-data":"Синтетические данные нельзя импортировать как результаты студентов.",
  "duplicate-in-bundle":"Внутри файла повторяется идентификатор.", "id-conflict":"Идентификатор уже существует, но содержимое отличается. Файл не добавлен.",
  "record-limit":"Превышен лимит 250 результатов. Файл не добавлен."
};
async function importGroupFiles(fileList) {
  if(groupBusy)return;
  const files=[...fileList];if(!files.length)return;
  if(groupMode==='demo'&&!confirm(translate("Перейти от демонстрации к реальным данным? Демонстрационный набор будет удалён.")))return;
  if(groupMode==='demo'){groupRecords=[];groupRejected=0;groupMode='uploaded';}
  groupBusy=true;renderGroupDashboard();
  let accepted=0,duplicates=0,rejected=0;const log=[];
  for(let i=0;i<files.length;i++){
    const file=files[i];
    try{
      if(i>=250)throw Error('record-limit');
      if(file.size>GROUP_FILE_LIMIT)throw Error('file-size');
      const incoming=readGroupInput(await file.text(),data);
      const outcome=mergeGroupRecords(groupRecords,incoming);
      groupRecords=outcome.records;accepted+=outcome.added;duplicates+=outcome.duplicates;
      log.push({file:file.name,message:`Добавлено: ${outcome.added}; повторов: ${outcome.duplicates}.`});
    }catch(error){rejected++;log.push({file:file.name,message:(groupErrorLabels[error.message]||groupErrorLabels['record-schema'])+(error.validationErrors?.length?' '+error.validationErrors.join(' '):'')});}
  }
  groupRejected+=rejected;groupBusy=false;
  $("#group-import-status").textContent=`Добавлено: ${accepted}. Повторов: ${duplicates}. Отклонено: ${rejected}.`;
  $("#group-import-log").innerHTML=log.map(row=>`<p><b data-no-i18n>${escapeHtml(row.file)}</b><span>${escapeHtml(row.message)}</span></p>`).join('');
  $("#group-import-details").hidden=false;
  renderGroupDashboard();
}

function labelRows(rows, lookup, limit = 8) {
  return (rows || []).slice(0, limit).map((row) => ({ ...row, label: lookup.get(row.id) || row.id }));
}

function barsMarkup(rows, total, suffix = "", denominatorLabel = "результатов") {
  if (!rows.length) return `<p class="group-empty-note">Недостаточно данных.</p>`;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return rows.map((row) => `<div class="group-bar-row"><div><strong>${escapeHtml(row.label)}</strong><span>${Number.isInteger(row.count)?row.count:row.count.toFixed(2)}${suffix}</span></div><i><em style="width:${(row.count / max) * 100}%"></em></i><small>${total ? `${Math.round((row.count / total) * 100)}% ${denominatorLabel}` : ""}</small></div>`).join("");
}

function renderGroupDashboard() {
  const dashboard = $("#group-dashboard");
  const has = groupRecords.length > 0;
  $("#group-export-csv").disabled = !has;
  $("#group-export-summary").disabled = !has;
  $("#group-clear").disabled = !has || groupBusy;
  $("#group-file-input").disabled=groupBusy;
  $("#group-demo-button").disabled=groupBusy;
  $("#group-backup").disabled=!has || groupBusy || groupMode==='demo';
  $("#group-export-csv").disabled=!has || groupBusy;
  $("#group-export-summary").disabled=!has || groupBusy;
  $("#group-mode-note").textContent=groupMode==='demo'
    ? "ДЕМОНСТРАЦИЯ: все 24 результата синтетические. Они не смешиваются с импортируемыми данными."
    : "Набор хранится в памяти вкладки. Скачайте резервную копию перед закрытием. Загруженные результаты – не число уникальных студентов.";
  if (!has) {
    dashboard.innerHTML = `<div class="group-empty"><div>${icon("users")}</div><h3>Здесь появится агрегированный профиль группы</h3><p>Импортируйте обезличенные файлы студентов или загрузите демонстрационный набор. Данные не покидают это устройство.</p></div>`;
    return;
  }
  const summary = aggregateAnonymousRecords(groupRecords);
  const authorityLookup = new Map(data.authorities.map((item) => [item.id, item.shortName]));
  const trackLookup = new Map(data.tracks.map((item) => [item.id, item.title]));
  const sectorLookup = new Map(data.sectors.map((item) => [item.id, item.title]));
  const scaleLookup = new Map(data.scales.map((item) => [item.id, item.short]));
  const topOne = labelRows(summary.topOneAuthorities, authorityLookup, 7);
  const trackRows = labelRows(summary.tracks, trackLookup, 7);
  const sectorRows = labelRows(summary.prioritySectors, sectorLookup, 7);
  const uniqueTopOne = summary.topOneAuthorities.length;
  dashboard.innerHTML = `
    <div class="group-metrics">
      <article><span>Результатов</span><strong>${summary.count}</strong><small>в текущем локальном наборе</small></article>
      <article><span>Разных лидеров</span><strong>${uniqueTopOne}</strong><small>органов в ведущих группах</small></article>
      <article><span>Широкие профили</span><strong>${Math.round(summary.flatShare * 100)}%</strong><small>${summary.flatCount} результатов</small></article>
      <article><span>Отклонено файлов</span><strong>${groupRejected}</strong><small>дубликаты учтены отдельно</small></article>
    </div>
    <div class="group-grid">
      <article class="group-panel"><h3>Средний профиль интересов</h3><div class="group-scale-list">${SCALE_IDS.map((id) => { const value = summary.averageScales[id]; return `<div><span>${escapeHtml(scaleLookup.get(id) || id)}</span><i><em style="width:${((value - 1) / 4) * 100}%"></em></i><b>${value.toFixed(2)}</b></div>`; }).join("")}</div></article>
      <article class="group-panel"><h3>Органы в ведущей группе</h3><p class="small-note">При точном равенстве один результат делится между всеми лидерами. Долевой учёт не равен числу отдельных студентов.</p>${barsMarkup(topOne, summary.count)}</article>
      <article class="group-panel"><h3>Карьерные треки в ТОП-5</h3>${barsMarkup(trackRows, summary.count * 5, "", "упоминаний в ТОП-5")}</article>
      <article class="group-panel"><h3>Приоритетные сферы</h3>${barsMarkup(sectorRows, summary.count, " выборов")}</article>
    </div>
    <div class="group-interpretation">${icon("info")}<p>Сводка описывает распределение результатов в загруженной группе. Она не предназначена для ранжирования студентов и не позволяет оценивать способности отдельного человека.</p></div>`;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = translate(message);
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2700);
}

function trapDialogFocus(event) {
  const dialog = $("#authority-dialog");
  if (event.key !== "Tab" || !dialog.open) return;
  const focusable = $$('button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])', dialog).filter((item) => !item.closest("[hidden]"));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function bindStaticEvents() {
  $$("[data-route]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    const route = button.dataset.route;
    if (route === "test" && button.closest(".desktop-nav,.mobile-bottom-nav")) state.questionIndex = firstUnansweredIndex();
    routeTo(route);
  }));
  $("#start-test-button").addEventListener("click", startOrResume);
  $("#resume-button").addEventListener("click", startOrResume);
  $("#mobile-menu-button").addEventListener("click", () => {
    const nav = $(".desktop-nav");
    const open = nav.classList.toggle("open");
    $("#mobile-menu-button").setAttribute("aria-expanded", String(open));
  });
  $("#question-back").addEventListener("click", () => moveQuestion(-1));
  $("#question-next").addEventListener("click", () => moveQuestion(1));
  $("#sectors-next").addEventListener("click", () => routeTo("conditions"));
  $("#calculate-button").addEventListener("click", () => { if (calculateResults()) routeTo("results"); });
  $("#directory-search").addEventListener("input", renderDirectory);
  $("#directory-type-filter").addEventListener("change", renderDirectory);
  $("#directory-sector-filter").addEventListener("change", renderDirectory);
  $("#directory-track-filter").addEventListener("change", renderDirectory);
  $("#directory-reset").addEventListener("click", () => {
    $("#directory-search").value = "";
    $("#directory-type-filter").value = "";
    $("#directory-sector-filter").value = "";
    $("#directory-track-filter").value = "";
    renderDirectory();
  });
  $("#compare-open").addEventListener("click", () => routeTo("compare"));
  $("#compare-clear").addEventListener("click", () => { state.compareIds = []; saveState(); renderCompare(); });
  $("#dialog-close").addEventListener("click", closeAuthority);
  $("#authority-dialog").addEventListener("click", (event) => { if (event.target === $("#authority-dialog")) closeAuthority(); });
  $("#authority-dialog").addEventListener("keydown", trapDialogFocus);
  $("#authority-dialog").addEventListener("cancel", (event) => { event.preventDefault(); closeAuthority(); });
  $("#seminar-draw-button").addEventListener("click", drawSeminarAuthority);
  $("#seminar-details").addEventListener("click", () => { if (seminarAuthority) openAuthority(seminarAuthority.id, "careers"); });
  $("#group-file-input").addEventListener("change", async (event) => {
    await importGroupFiles(event.target.files || []);
    event.target.value = "";
  });
  $("#group-demo-button").addEventListener("click", () => {
    if(groupRecords.length && groupMode!=='demo' && !confirm(translate("Заменить загруженный набор демонстрацией? Сначала сохраните резервную копию.")))return;
    groupMode='demo';
    $("#group-import-details").hidden=true;
    groupRecords = createDemoGroup();
    groupRejected = 0;
    $("#group-import-status").textContent = "Загружена демонстрационная группа из 24 синтетических результатов.";
    renderGroupDashboard();
  });
  $("#group-backup").addEventListener("click",()=>downloadText("career-class-backup.json",JSON.stringify(groupBundle(groupRecords),null,2),"application/json;charset=utf-8"));
  $("#group-export-csv").addEventListener("click", () => downloadText(groupMode==="demo"?"DEMO-career-records.csv":"rudn-career-group-records.csv", recordsToCsv(groupRecords), "text/csv;charset=utf-8"));
  $("#group-export-summary").addEventListener("click", () => downloadText(groupMode==="demo"?"DEMO-career-summary.csv":"rudn-career-group-summary.csv", summaryToCsv(aggregateAnonymousRecords(groupRecords)), "text/csv;charset=utf-8"));
  $("#group-clear").addEventListener("click", () => {
    if(!confirm(translate("Очистить локальный набор? Несохранённые результаты будут потеряны.")))return;
    groupMode='uploaded';$("#group-import-details").hidden=true;
    groupRecords = [];
    groupRejected = 0;
    $("#group-import-status").textContent = "Локальный набор очищен.";
    renderGroupDashboard();
  });
  document.addEventListener('keydown', event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const current=event.target.closest?.('[role="radio"]');if(!current)return;
    const group=current.closest('[role="radiogroup"]')||current.parentElement;
    const radios=$$('[role="radio"]',group);if(!radios.length)return;
    event.preventDefault();let i=radios.indexOf(current);
    if(event.key==='Home')i=0;else if(event.key==='End')i=radios.length-1;
    else i=(i+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+radios.length)%radios.length;
    radios[i].click();
  });
  window.addEventListener("keydown", (event) => {
    if(event.ctrlKey||event.altKey||event.metaKey||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    if($("#authority-dialog").open)return;
    const route = activeRoute();
    if (route === "test" && /^[1-5]$/.test(event.key) && (!event.target.closest("a,button,summary,[role=button],input,select,textarea") || event.target.closest("#answer-options"))) { event.preventDefault(); selectAnswer(Number(event.key)); }
    else if (route === "test" && event.key === "Enter" && (!event.target.closest("a,button,summary,[role=button],input,select,textarea") || event.target.closest("#answer-options"))) { event.preventDefault(); moveQuestion(1); }
    else if (event.key === "Escape" && $("#authority-dialog").open) closeAuthority();
  });
  // Host owns browser history; embedded navigation is scoped to this instance.
}

function bindReliabilityNotices() {
  if(protectedStorage){
    const el=document.createElement('section');el.id='protected-storage';el.className='app-notice migration-notice';el.setAttribute('role','alert');
    el.innerHTML='<p>Сохранённая запись повреждена или относится к другой модели. Она не перезаписывается. Сначала скачайте копию; начать новое сохранение можно только явно.</p><button type="button" class="button button-secondary" id="protected-backup">Скачать исходную запись</button><button type="button" class="button button-secondary" id="session-backup">Скачать текущие ответы</button><button type="button" class="button button-primary" id="protected-reset">Начать новое сохранение</button>';
    $('#main-content').before(el);
    $('#protected-backup').onclick=()=>downloadText('career-recoverable-record.json',unrecoverableStoredText||'null');
    $('#session-backup').onclick=()=>downloadText('career-session-backup.json',JSON.stringify({schema:4,modelVersion:MODEL_VERSION,questionnaireVersion:QUESTIONNAIRE_VERSION,registryVersion:REGISTRY_VERSION,...state},null,2));
    $('#protected-reset').onclick=()=>{
      if(!confirm(translate('Заменить исходную запись? Сначала сохраните её копию.')))return;
      protectedStorage=false;
      // Observe the latest value only after an explicit replacement request.
      try{readLocal(STORAGE_KEY);}catch{protectedStorage=true;return;}
      if(saveState()){el.remove();unrecoverableStoredText=null;}else protectedStorage=true;
    };
  }
  const skip=$('.skip-link');skip?.addEventListener('click',event=>{event.preventDefault();$('#main-content').focus({preventScroll:true});$('#main-content').scrollIntoView({block:'start'});});
  document.addEventListener('app:storage-conflict',()=>{
    let el=$('#cross-tab-warning');if(!el){el=document.createElement('p');el.id='cross-tab-warning';el.className='app-notice';el.setAttribute('role','alert');$('#main-content').before(el);}
    el.textContent='В другой вкладке сохранены более новые данные. Эта вкладка не перезаписывает их. Экспортируйте свой вариант и перезагрузите страницу.';
  });
  if(data.unavailable.length){
    const el=document.createElement('p');el.className='app-notice';el.setAttribute('role','status');
    el.textContent='Часть дополнительных разделов не загрузилась. Основной тест доступен. Повторите загрузку позже.';$('#main-content').before(el);
  }

}

async function init() {
  try {
    [data] = await Promise.all([loadData(),initializeI18n()]);
    if (__careerHost.destroyed) return;
    configureValidationRegistry(data);
    loadStoredState();
    bindReliabilityNotices();
    state.compareIds = sanitizeCompareIds(state.compareIds, data.authorities, MAX_COMPARE);
    data.allInstitutions=[...data.authorities,...data.publicService.records.map(a=>({id:a.id,name:a.name.ru,shortName:a.name.ru,mission:a.mission.ru,entityType:'additional',entityTypeLabel:'Другие ветви и уровни публичной власти',tracks:a.tracks,governmentUrl:a.sources?.[0]?.url||'',localizedName:a.name,source:a}))];
    classroom=createClassroom({data:{...data,authorities:data.allInstitutions},routeTo,openAuthority,toast,downloadText,getResult:()=>latestResult});
    workspace = createWorkspace({data,state,modelVersion:MODEL_VERSION,
      rank: inputs=>rankAuthorities({...data,...inputs}),route:routeTo,openAuthority,
      restore: inputs=>{Object.assign(state,inputs,{questionIndex:0});invalidateResult();state.questionIndex=firstUnansweredIndex();saveState();},
      toast,download:downloadText,isComplete:()=>completionStatus({...state,questions:data.questions}).complete
    });
    workspace.bind();
    decisionLab = createDecisionLab({data,state,routeTo,openAuthority,saveScenario:workspace.saveDetached,toast});
    if(!data.unavailable.includes('data/public-service.json'))publicService=createPublicService({registry:data.publicService,data,state,routeTo,downloadText,openNotebook:(id)=>classroom?.open(id)});
    vacancies=createVacancies({data,getResult:()=>latestResult||(state.completedAt&&completionStatus({...state,questions:data.questions}).complete?rankAuthorities({...data,...state}):null),routeTo,closeDialog:closeAuthority});
    bindStaticEvents();
    bindSessionTransfer();
    document.addEventListener('app:language',()=>{if(activeRoute()==='sectors')renderTopicQuestions();});
    updateResumeButton();
    renderCompareTray();
    renderGroupDashboard();
    $("#app-loading").hidden = true;
    $("#app").hidden = false;
    const requested = location.hash.slice(1);
    const route = requested || (state.completedAt ? "home" : state.lastRoute || "home");
    routeTo(route, { updateHash: !requested, replace:true, focus:false });
    // Search aliases are optional; prefetch only after the Russian app is visible.
    void Promise.allSettled(['en','zh-Hans'].map(ensureLanguage));

  } catch (error) {
    if (__careerHost.destroyed) return;
    console.error(error);
    $("#app-loading").innerHTML = `<div class="boot-error"><h1>Не удалось загрузить платформу</h1><p>Проверьте соединение и повторите попытку. Если ошибка повторяется, вернитесь к теме и откройте тест снова.</p><button class="button button-primary" id="boot-retry" type="button">Повторить загрузку</button><details><summary>Технические сведения</summary><pre>${escapeHtml(error.message)}</pre></details></div>`;
    $("#boot-retry").onclick=()=>location.reload();
  }
}

export const ready = init();
export {routeTo as navigate, setLanguage as setLocale};
