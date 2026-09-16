(() => {
  "use strict";

  const mountRudnPuzzle = () => {
  const root = document.getElementById("geoPuzzleApp");
  const initialisePuzzle = () => {
  if (!root?.isConnected || root.dataset.playAllowed === "false") return;
  // Keep this mount's API bridge alive until its last local completion has drained.
  const scopedFetch=window.fetch.bind(window);

  const locale = window.RUDNI18N?.locale || document.documentElement.dataset.locale || "en";
  const htmlLocale = locale === "zh" ? "zh-Hans" : locale;
  const tr = (source, params = {}) => window.RUDNI18N?.t(source, params) || source;
  const copy = (ru, en, zh) => locale === "zh" ? zh : locale === "en" ? en : ru;
  const localized = (object, key, fallback = "") => {
    if (!object || typeof object !== "object") return fallback;
    if (locale !== "ru") {
      const value = object[`${key}_${locale}`] ?? object[locale === "en" ? `${key}:en` : `${key}:zh`];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    const value = object[key];
    return value !== undefined && value !== null && String(value).trim() ? String(value).trim() : fallback;
  };
  const localeCompare = (a, b) => String(a || "").localeCompare(String(b || ""), htmlLocale, { sensitivity: "base" });
  const territoryCount = (count) => {
    if (locale === "zh") return `${count}个区域`;
    if (locale === "en") return `${count} ${count === 1 ? "territory" : "territories"}`;
    return `${count} ${declension(count, ["территория", "территории", "территорий"])}`;
  };
  const mapAvailabilityText = (available, total, missing) => {
    if (locale === "zh") return `已提供${available}/${total}幅地图；缺少${missing}幅。`;
    if (locale === "en") return `${available} of ${total} maps are available; ${missing} are missing.`;
    return `Доступно ${available} из ${total} карт; отсутствуют ${missing}.`;
  };
  const municipalNotice = (available, total, missing) => {
    if (locale === "zh") return `目前已提供${available}/${total}个联邦主体的市政地图；另有${missing}个主体仍需经过核验的GeoJSON源数据。`;
    if (locale === "en") return `Municipal maps are available for ${available} of ${total} federal subjects. Verified source GeoJSON is still required for ${missing} subjects.`;
    return `Муниципальные карты доступны для ${available} из ${total} субъектов. Для ещё ${missing} субъектов требуются проверенные исходные GeoJSON.`;
  };
  const offlineAvailabilityText = (count) => {
    if (locale === "zh") return `离线可使用${count}幅地图；其余地图首次加载后将保存到本地缓存。`;
    if (locale === "en") return `${count} maps are available offline; the others are downloaded once and stored in the local cache.`;
    return `Без внешней сети доступны ${count} карт; остальные загружаются один раз и сохраняются в кэше.`;
  };
  const localizeError = (message) => {
    const source = String(message || "");
    const direct = tr(source);
    if (direct !== source) return direct;
    const rules = locale === "zh" ? [
      [/^Каталог субъектов недоступен:\s*/u, "无法加载联邦主体目录："],
      [/^Полный каталог стран временно недоступен:\s*/u, "完整国家目录暂时不可用："],
      [/^Полноэкранный режим недоступен:\s*/u, "无法进入全屏模式："],
      [/^Карта собрана, но результат пока не записан:\s*/u, "地图已拼合，但成绩尚未保存："],
    ] : locale === "en" ? [
      [/^Каталог субъектов недоступен:\s*/u, "The federal-subject catalogue is unavailable: "],
      [/^Полный каталог стран временно недоступен:\s*/u, "The full country catalogue is temporarily unavailable: "],
      [/^Полноэкранный режим недоступен:\s*/u, "Full-screen mode is unavailable: "],
      [/^Карта собрана, но результат пока не записан:\s*/u, "The map is complete, but the result has not yet been saved: "],
    ] : [];
    for (const [pattern, target] of rules) if (pattern.test(source)) return source.replace(pattern, target);
    return source;
  };

  const byId = (id) => document.getElementById(id);
  const els = {
    mode: byId("puzzleMode"),
    subjectField: byId("subjectField"),
    subject: byId("puzzleSubject"),
    subjectHint: byId("puzzleSubjectHint"),
    countryField: byId("countryField"),
    country: byId("puzzleCountry"),
    countryHint: byId("puzzleCountryHint"),
    difficulty: byId("puzzleDifficulty"),
    difficulties: [...root.querySelectorAll("[data-puzzle-difficulty]")],
    reset: byId("puzzleReset"),
    center: byId("puzzleCenter"),
    zoomIn: byId("puzzleZoomIn"),
    zoomOut: byId("puzzleZoomOut"),
    fullscreen: byId("puzzleFullscreen"),
    returnPiece: byId("puzzleReturn"),
    hint: byId("puzzleHint"),
    hintLabel: byId("puzzleHintLabel"),
    canvas: byId("puzzleCanvas"),
    canvasWrap: byId("puzzleCanvasWrap"),
    empty: byId("puzzleEmpty"),
    loading: byId("puzzleLoading"),
    loadingTitle: byId("puzzleLoadingTitle"),
    loadingText: byId("puzzleLoadingText"),
    datasetTitle: byId("puzzleDatasetTitle"),
    datasetSubtitle: byId("puzzleDatasetSubtitle"),
    placed: byId("puzzlePlaced"),
    time: byId("puzzleTime"),
    errors: byId("puzzleErrors"),
    difficultyLabel: byId("puzzleDifficultyLabel"),
    modeSummary: byId("puzzleModeSummary"),
    modeBadge: byId("puzzleModeBadge"),
    contextValue: byId("puzzleContextValue"),
    difficultyHint: byId("puzzleDifficultyHint"),
    currentName: byId("puzzleCurrentName"),
    progress: byId("puzzleProgressBar"),
    progressTrack: byId("puzzleProgressTrack"),
    modeCards: [...document.querySelectorAll("[data-puzzle-mode]")],
    toast: byId("puzzleToast"),
    resultDialog: byId("puzzleResultDialog"),
    resultText: byId("puzzleResultText"),
    resultPointsLabel: byId("puzzleResultPointsLabel"),
    resultPoints: byId("puzzleResultPoints"),
    resultCount: byId("puzzleResultCount"),
    resultTime: byId("puzzleResultTime"),
    resultBack: byId("puzzleResultBack"),
    playAgain: byId("puzzlePlayAgain"),
    closeResult: byId("puzzleCloseResult"),
  };

  const csrf = root.dataset.csrf;
  const seminarContext = root.dataset.context === "seminar";
  const ctx = els.canvas.getContext("2d", { alpha: true });
  const hitCanvas = document.createElement("canvas");
  const hitCtx = hitCanvas.getContext("2d");
  const staticCanvas = document.createElement("canvas");
  const staticCtx = staticCanvas.getContext("2d", { alpha: true });

  const DIFFICULTY = {
    easy: { label: tr("Учебная"), points: 3, snap: 60 },
    medium: { label: tr("Стандартная"), points: 4, snap: 30 },
    hard: { label: tr("Экспертная"), points: 5, snap: 12 },
  };

  const MODE_LABELS = {
    "russia-subjects": tr("Субъекты Российской Федерации"),
    "russia-municipalities": tr("Муниципальные районы и округа субъекта РФ"),
    "world-countries": tr("Страны мира"),
    "country-regions": tr("Регионы выбранной страны"),
  };

  const MODE_HELP = {
    "russia-subjects": tr("Соберите все субъекты Российской Федерации на общей карте страны."),
    "russia-municipalities": tr("Выберите субъект РФ и восстановите его внутреннее муниципальное устройство из районов и округов."),
    "world-countries": tr("Соберите политическую карту мира из стран и территорий, представленных полигональной геометрией."),
    "country-regions": tr("Выберите государство и соберите его единицы первого административного уровня; название уровня зависит от национальной системы."),
  };

  const state = {
    ready: false,
    loading: false,
    restoring: false,
    started: false,
    finished: false,
    attemptId: null,
    seed: 0,
    mode: "russia-subjects",
    selection: null,
    difficulty: "medium",
    wrapper: null,
    collection: null,
    features: [],
    paths: [],
    pathsHi: [],
    strokePaths: [],
    strokePathsHi: [],
    bounds: [],
    anchors: [],
    pieces: [],
    order: [],
    cursor: 0,
    current: -1,
    placed: 0,
    errors: 0,
    hints: 0,
    startedAt: null,
    elapsedBeforeStart: 0,
    hintUntil: 0,
    view: { x: 0, y: 0, k: 1 },
    baseViewK: 1,
    viewMin: 0.55,
    viewMax: 16,
    projection: null,
    cssWidth: 1,
    cssHeight: 1,
    dpr: 1,
    trayHeight: 138,
    mapBottom: 1,
    pointers: new Map(),
    pinch: null,
    draggingPiece: false,
    draggingFromTray: false,
    draggingPan: false,
    dragOffset: { x: 0, y: 0 },
    panOffset: { x: 0, y: 0 },
    datasetCache: new Map(),
    subjectWrapper: null,
    adm1CatalogLoaded: false,
    subjectCatalogLoaded: false,
    animationFrame: 0,
    drawFrame: 0,
    staticDirty: true,
    resizeTimer: 0,
    lastCheckpointAt: 0,
    timerStarted: false,
    geometryRef: null,
    finishedResult: null,
    selections: {},
  };
  let disposed = false;
  let loadGeneration = 0;
  let activeLoad = null;
  let retryLoad = null;
  let catalogSubjects = null;
  let catalogCountries = null;
  let hintTimer = 0;
  let checkpointTimer = 0;
  let storageNoticeShown = false;
  let selectionGeneration = 0;
  const listeners = [];
  const on = (target, name, callback, options) => {
    target?.addEventListener(name, callback, options);
    listeners.push(() => target?.removeEventListener(name, callback, options));
  };
  const writable = () => !disposed && (root.puzzleProgress?.canWrite?.() ?? true);
  function acceptInput(gameplay = true) {
    if (state.restoring) return false;
    if (writable()) {
      // Continuing the visible game withdraws an unfinished map change. A
      // delayed request/reconnection must never replace newly played progress.
      if (gameplay && state.ready && (state.loading || retryLoad)) {
        ++selectionGeneration;
        ++loadGeneration;
        activeLoad?.abort();
        retryLoad = null;
        clearTimeout(state.retryTimer);
        setLoading(false);
        syncSelectors();
      }
      return true;
    }
    void root.puzzleProgress?.takeControl?.();
    return false;
  }
  function storageNotice() {
    if (storageNoticeShown || disposed) return;
    storageNoticeShown = true;
    const notice = document.createElement("p");
    notice.className = "puzzle-save-notice";
    notice.setAttribute("role", "status");
    notice.textContent = copy("Игра продолжается, но браузер не смог сохранить её на устройстве. Освободите место, чтобы сохранить прогресс.", "You can keep playing, but this browser could not save the game on this device. Free some storage to keep your progress.", "您可以继续游戏，但浏览器无法在设备上保存进度。请释放存储空间。");
    els.canvasWrap.parentElement.append(notice);
  }

  function snapshotState() {
    const worldCentre=screenToWorld(state.cssWidth / 2,state.mapBottom / 2);
    const centre = state.projection?.invert([worldCentre.x,worldCentre.y]);
    const snapshot = {
      version:3,geometryRef:state.geometryRef,finishedResult:state.finishedResult,selections:{...state.selections},
      attemptId:state.attemptId,seed:state.seed,mode:state.mode,selection:state.selection,difficulty:state.difficulty,
      wrapper:{dataset:state.wrapper?.dataset},featureIds:state.features.map(feature=>feature.properties._puzzleId),
      order:[...state.order],cursor:state.cursor,current:state.current,placed:state.placed,errors:state.errors,hints:state.hints,
      finished:state.finished,started:state.started,elapsedMs:Math.round(elapsedMs()),timerStarted:state.timerStarted,
      view:{k:state.view.k,zoom:state.view.k/state.baseViewK,centre},pieces:state.pieces.map(piece=>{
        const anchor=state.anchors[piece.index];
        const point=!piece.locked&&!piece.inTray&&anchor?state.projection?.invert([anchor[0]+piece.dx,anchor[1]+piece.dy]):null;
        return {index:piece.index,locked:piece.locked,inTray:piece.inTray,point,dx:piece.dx/state.cssWidth,dy:piece.dy/state.cssHeight};
      }),
    };
    return snapshot;
  }
  function checkpoint() {
    clearTimeout(checkpointTimer);
    checkpointTimer = 0;
    if (state.restoring || !state.ready || !state.attemptId || !root.puzzleProgress?.save || !writable()) return Promise.resolve();
    const snapshot = snapshotState();
    state.lastCheckpointAt=performance.now();
    return Promise.resolve(root.puzzleProgress.save(snapshot)).then(result => {
      if (result?.saveStatus?.durable === false) storageNotice();
      return result;
    }).catch(storageNotice);
  }
  function scheduleCheckpoint() {
    if (performance.now() - state.lastCheckpointAt >= 250) void checkpoint();
    else if (!checkpointTimer) checkpointTimer = setTimeout(() => { checkpointTimer = 0; void checkpoint(); }, 250);
  }
  if(root.puzzleProgress)root.puzzleProgress.capture=checkpoint;

  function toast(message, type = "info", ms = 3000) {
    if(document.getElementById('toastStack')){window.dispatchEvent(new CustomEvent('rudn:toast',{detail:{message,type}}));return}
    els.toast.textContent = message;
    els.toast.className = `puzzle-toast ${type}`;
    requestAnimationFrame(() => els.toast.classList.add("visible"));
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => els.toast.classList.remove("visible"), ms);
  }

  function setLoading(visible, title = "Загружаем геоданные", text = "При первом открытии набор сохраняется в локальный кэш платформы.") {
    state.loading = visible;
    els.loading.hidden = !visible || state.ready;
    root.setAttribute("aria-busy", String(visible));
    els.loadingTitle.textContent = tr(title);
    els.loadingText.textContent = tr(text);
  }

  function setControlsEnabled(enabled) {
    [els.center, els.zoomIn, els.zoomOut, els.returnPiece, els.reset].forEach((el) => {
      el.disabled = !enabled || !writable();
    });
    updateHintControl();
  }

  function updateDependentFields() {
    if (seminarContext) els.mode.value = "russia-subjects";
    const mode = els.mode.value;
    els.subjectField.hidden = mode !== "russia-municipalities";
    els.countryField.hidden = mode !== "country-regions";
    els.modeSummary.textContent = MODE_HELP[mode] || tr("Выберите вариант карты.");
    els.modeCards.forEach((card) => {
      const active = card.dataset.puzzleMode === mode;
      card.classList.toggle("active", active);
      card.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (els.modeBadge) {
      const graded = seminarContext && mode === "russia-subjects";
      els.modeBadge.textContent = graded ? tr("Зачётный режим") : seminarContext ? tr("Тренировочный режим") : tr("Свободная игра");
      els.modeBadge.classList.toggle("training", !graded);
    }
    if (els.difficultyHint) {
      els.difficultyHint.textContent = seminarContext && mode === "russia-subjects"
        ? tr("За карту субъектов России: 3 / 4 / 5 баллов.")
        : tr("Сложность влияет на точность совмещения и не изменяет учебный журнал.");
    }
    if (els.contextValue) {
      const labels = {
        "russia-subjects": tr("Россия · 89 субъектов"),
        "russia-municipalities": tr("Выберите субъект РФ"),
        "world-countries": tr("Мир · страны и территории"),
        "country-regions": tr("Выберите государство"),
      };
      els.contextValue.textContent = labels[mode] || MODE_LABELS[mode] || tr("Географическая карта");
    }
    if (!state.ready) {
      els.datasetTitle.textContent = MODE_LABELS[mode] || tr("Географическая карта");
      els.datasetSubtitle.textContent = copy("Карта загружается автоматически", "The map loads automatically", "地图自动加载");
      els.placed.textContent = mode === "russia-subjects" ? "0 / 89" : "0 / —";
      els.currentName.textContent = tr("Игра ещё не начата");
    }
    els.difficulties.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.puzzleDifficulty === els.difficulty.value)));
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 45000);
    try {
    const response = await scopedFetch(url, {
      credentials: "same-origin",
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }
    if (!response.ok) {
      const detail = payload && (payload.detail || payload.message);
      throw new Error(detail || `HTTP ${response.status}`);
    }
    return payload;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  }

  function bestTopologyObject(topology) {
    let best = null;
    let count = -1;
    for (const [key, object] of Object.entries(topology.objects || {})) {
      const current = Array.isArray(object && object.geometries) ? object.geometries.length : 0;
      if (current > count) {
        best = key;
        count = current;
      }
    }
    return best;
  }

  function geometryToCollection(payload) {
    if (!payload || typeof payload !== "object") throw new Error(tr("Пустой набор геоданных."));
    if (payload.type === "FeatureCollection") return payload;
    if (payload.type === "Feature") return { type: "FeatureCollection", features: [payload] };
    if (payload.type === "Topology") {
      if (!window.topojson) throw new Error(tr("Локальный модуль TopoJSON не загрузился. Обновите страницу."));
      const key = bestTopologyObject(payload);
      if (!key) throw new Error(tr("В TopoJSON нет коллекции геометрий."));
      const converted = window.topojson.feature(payload, payload.objects[key]);
      return converted.type === "FeatureCollection" ? converted : { type: "FeatureCollection", features: [converted] };
    }
    const type = payload.type || tr("неизвестный");
    if (locale === "zh") throw new Error(`不支持的地理数据格式：${type}。`);
    if (locale === "en") throw new Error(`Unsupported geographic-data format: ${type}.`);
    throw new Error(`Неподдерживаемый формат геоданных: ${type}.`);
  }

  function firstCoordinate(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    let cursor = geometry.coordinates;
    while (Array.isArray(cursor) && Array.isArray(cursor[0])) cursor = cursor[0];
    if (Array.isArray(cursor) && cursor.length >= 2 && Number.isFinite(+cursor[0]) && Number.isFinite(+cursor[1])) {
      return [+cursor[0], +cursor[1]];
    }
    return null;
  }

  function featureName(feature, index) {
    const p = feature.properties || {};
    const languageCandidates = locale === "zh"
      ? [p.name_zh, p.NAME_ZH, p.name_en, p.NAME_EN]
      : locale === "en"
        ? [p.name_en, p["name:en"], p.NAME_EN, p.shapeName, p.ADMIN, p.admin]
        : [p.name_ru, p.NAME_RU, p.name, p.NAME];
    const candidates = [
      ...languageCandidates,
      p.name_ru,
      p.NAME_RU,
      p.name,
      p.NAME,
      p.shapeName,
      p.ADMIN,
      p.admin,
      p.name_en,
      p.NAME_EN,
      p.GEOUNIT,
      p.BRK_NAME,
      feature.id,
    ];
    const value = candidates.find((item) => typeof item === "string" && item.trim());
    if (value) return value.trim();
    if (locale === "zh") return `区域${index + 1}`;
    if (locale === "en") return `Territory ${index + 1}`;
    return `Территория ${index + 1}`;
  }

  function featureId(feature, index) {
    const p = feature.properties || {};
    const candidates = [feature.id, p.id, p.shapeID, p.iso_3166_2, p.ISO_A3, p.ADM0_A3, p.adm0_a3, p.iso_a3, p.SOV_A3, p.sov_a3, p.GID_1, p.GID_2];
    const value = candidates.find((item) => item !== null && item !== undefined && String(item).trim());
    // Numeric zero is a valid stable TopoJSON identifier (the first feature
    // in the 89-subject author dataset uses id=0).  Do not treat it as a
    // falsy missing value, otherwise the browser and server contracts diverge.
    return value !== undefined && value !== null ? String(value) : `feature-${index + 1}`;
  }

  function normalizeCollection(collection, mode) {
    const seen = new Set();
    const features = [];
    (collection.features || []).forEach((feature, index) => {
      if (!feature || !feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) return;
      const name = featureName(feature, index);
      const properties = feature.properties || {};
      const countryCode = String(
        properties.ADM0_A3 || properties.adm0_a3 || properties.ISO_A3 || properties.iso_a3 || properties.SOV_A3 || properties.sov_a3 || "",
      ).toUpperCase();
      if (mode === "world-countries" && (countryCode === "ATA" || /antarct|антаркт/i.test(name))) return;
      let id = featureId(feature, index);
      if (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      feature.properties = { ...(feature.properties || {}), _puzzleName: name, _puzzleId: id };
      feature.id = id;
      features.push(feature);
    });
    if (features.length < 1) throw new Error(tr("В выбранном наборе недостаточно территорий для игры."));
    return { type: "FeatureCollection", features };
  }

  async function loadWrapper(cacheKey, url, signal) {
    if (state.datasetCache.has(cacheKey)) return state.datasetCache.get(cacheKey);
    const value = await fetchJson(url, { signal });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    state.datasetCache.set(cacheKey, value);
    // Keep only a few maps in RAM; durable geometry remains available offline.
    while (state.datasetCache.size > 8) state.datasetCache.delete(state.datasetCache.keys().next().value);
    return value;
  }

  async function ensureGeometry(wrapper, cacheKey, signal) {
    if (wrapper && wrapper.geometry) return wrapper;
    const geometryUrl = wrapper && wrapper.dataset && wrapper.dataset.geometry_url;
    if (!geometryUrl) throw new Error(tr("Для выбранного набора не указана геометрия."));
    const geometry = await loadWrapper(`${cacheKey}:geometry`, geometryUrl, signal);
    return { ...wrapper, geometry };
  }

  function loadSubjectCatalog() {
    if (catalogSubjects) return catalogSubjects;
    catalogSubjects = (async () => {
      const payload = await loadWrapper("municipal-catalog", "/api/puzzle/catalog/municipal");
      const items = [...(payload.subjects || [])].filter(item => item.available);
      items.sort((a, b) => localeCompare(localized(a, "name", a.name), localized(b, "name", b.name)));
      if (disposed) return items;
      const selected = els.subject.value;
      els.subject.innerHTML = items.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(localized(item, "name", item.name || item.id))}</option>`).join("");
      const preferred = state.selections["russia-municipalities"] || selected;
      els.subject.value = items.some(item => String(item.id) === String(preferred)) ? String(preferred) : String(items[0]?.id || "");
      els.subjectHint.textContent = "";
      return items;
    })().catch(error => { catalogSubjects = null; throw error; });
    return catalogSubjects;
  }

  function loadAdm1Catalog() {
    if (catalogCountries) return catalogCountries;
    catalogCountries = (async () => {
      const payload = await loadWrapper("adm1-catalog", "/api/puzzle/catalog/adm1");
      const items = [...new Map((payload.countries || []).map(item => [item.iso, item])).values()];
      items.sort((a, b) => localeCompare(localized(a, "name", a.name), localized(b, "name", b.name)));
      if (disposed) return items;
      const selected = state.selections["country-regions"] || els.country.value || "USA";
      els.country.innerHTML = items.map(item => `<option value="${escapeAttr(item.iso)}">${escapeHtml(localized(item, "name", item.name || item.iso))}</option>`).join("");
      els.country.value = items.some(item => item.iso === selected) ? selected : (items.some(item => item.iso === "USA") ? "USA" : items[0]?.iso || "");
      els.countryHint.textContent = "";
      return items;
    })().catch(error => { catalogCountries = null; throw error; });
    return catalogCountries;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  async function resolveDataset(mode, selection, signal) {
    if (!window.d3) throw new Error(tr("Локальный картографический модуль не загрузился. Обновите страницу."));
    const route = mode === "russia-subjects" ? "russia-subjects"
      : mode === "world-countries" ? "world-countries"
      : mode === "country-regions" ? `country-adm1/${encodeURIComponent(selection)}`
      : `russia-municipalities/${encodeURIComponent(selection)}`;
    const cacheKey = `${mode}:${selection || ""}`;
    const wrapper = await loadWrapper(cacheKey, `/api/puzzle/data/${route}`, signal);
    const complete = await ensureGeometry(wrapper, cacheKey, signal);
    return { wrapper: complete, collection: geometryToCollection(complete.geometry), selection };
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(length, seed) {
    const result = Array.from({ length }, (_, index) => index);
    const random = mulberry32(seed || 1);
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  async function startAttempt(mode, selection, difficulty, total, featureIds, datasetMeta) {
    return fetchJson(`/api/puzzle/start?lang=${encodeURIComponent(locale)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csrf,
        activity_slug: root.dataset.activitySlug,
        mode,
        selection,
        difficulty,
        total,
        feature_ids: featureIds,
        dataset_id: datasetMeta && datasetMeta.id,
        dataset_title: datasetMeta && localized(datasetMeta, "title", datasetMeta.title),
      }),
    });
  }

  function hasPlayed() {
    return state.timerStarted || state.placed > 0 || state.hints > 0 || state.errors > 0;
  }

  function selectedSettings() {
    const mode = seminarContext ? "russia-subjects" : els.mode.value;
    return { mode, difficulty: els.difficulty.value || "medium", selection: mode === "russia-municipalities" ? els.subject.value : mode === "country-regions" ? els.country.value || "USA" : null };
  }

  function syncSelectors(settings = state) {
    els.mode.value = settings.mode;
    els.difficulty.value = settings.difficulty;
    if (settings.mode === "russia-municipalities" && settings.selection) els.subject.value = settings.selection;
    if (settings.mode === "country-regions" && settings.selection) els.country.value = settings.selection;
    updateDependentFields();
  }

  async function requestGame(settings = selectedSettings(), force = false) {
    if (!acceptInput(false)) { syncSelectors(); return; }
    if (!force && state.ready && settings.mode === state.mode && settings.difficulty === state.difficulty && String(settings.selection || "") === String(state.selection || "")) {
      ++selectionGeneration;
      ++loadGeneration;
      activeLoad?.abort();
      retryLoad = null;
      clearTimeout(state.retryTimer);
      setLoading(false);
      syncSelectors();
      return;
    }
    if (state.started && !state.finished && hasPlayed() && !window.confirm(copy("Начать новую игру? Текущая попытка будет заменена.", "Start a new game? This will replace the current attempt.", "开始新游戏？当前进度将被替换。"))) {
      syncSelectors();
      return;
    }
    const selection = ++selectionGeneration;
    ++loadGeneration;
    activeLoad?.abort();
    syncSelectors(settings);
    setLoading(true, "Подготавливаем карту");
    await checkpoint();
    if (disposed || selection !== selectionGeneration) return;
    return startGame({ desired: settings });
  }

  async function startGame({ resume = null, desired = null } = {}) {
    if (disposed || root.dataset.playAllowed === "false") return;
    const generation = ++loadGeneration;
    state.restoring = Boolean(resume);
    activeLoad?.abort();
    const controller = new AbortController();
    activeLoad = controller;
    retryLoad = null;
    clearTimeout(state.retryTimer);
    const current = () => !disposed && generation === loadGeneration && !controller.signal.aborted;
    const settings = { ...(resume || desired || selectedSettings()) };
    settings.mode = seminarContext ? "russia-subjects" : settings.mode || "russia-subjects";
    settings.difficulty = DIFFICULTY[settings.difficulty] ? settings.difficulty : "medium";
    syncSelectors(settings);
    setLoading(true, "Подготавливаем карту", "Геометрия проверяется и подготавливается для сенсорного управления.");
    if (!state.ready) els.empty.hidden = true;
    try {
      let storedGeometry = resume?.geometryRef ? await root.puzzleProgress?.loadGeometry?.(resume.geometryRef) : null;
      if (!current()) return;
      if (settings.mode === "russia-municipalities" && !storedGeometry) {
        await loadSubjectCatalog();
        settings.selection = settings.selection || state.selections[settings.mode] || els.subject.value;
      } else if (settings.mode === "country-regions" && !storedGeometry) {
        await loadAdm1Catalog();
        settings.selection = settings.selection || state.selections[settings.mode] || "USA";
      }
      if (!current()) return;
      let resolved;
      if (storedGeometry?.geometry) resolved = { wrapper: storedGeometry, collection: geometryToCollection(storedGeometry.geometry), selection: settings.selection };
      else if (resume?.wrapper?.dataset?.geometry_url) {
        const wrapper = await ensureGeometry(resume.wrapper, `resume-${resume.wrapper.dataset.id}`, controller.signal);
        resolved = { wrapper, collection: geometryToCollection(wrapper.geometry), selection: settings.selection };
      } else if (state.wrapper && state.mode === settings.mode && String(state.selection || "") === String(settings.selection || "")) {
        resolved = { wrapper: state.wrapper, collection: state.collection, selection: state.selection };
      } else resolved = await resolveDataset(settings.mode, settings.selection, controller.signal);
      if (!current()) return;
      const collection = normalizeCollection(resolved.collection, settings.mode);
      const featureIds = collection.features.map(feature => feature.properties._puzzleId);
      if (resume && JSON.stringify(featureIds) !== JSON.stringify(resume.featureIds)) throw new Error(tr("Набор карты изменился. Сохранённая попытка не перезаписана."));
      const count = collection.features.length;
      if (resume && (!Array.isArray(resume.order) || resume.order.length !== count || new Set(resume.order).size !== count || resume.order.some(index => !Number.isInteger(index) || index < 0 || index >= count) || !Array.isArray(resume.pieces) || resume.pieces.length !== count)) throw new Error(tr("Сохранённая попытка несовместима с картой."));
      const geometryRef = resume?.geometryRef || await root.puzzleProgress?.saveGeometry?.(resolved.wrapper) || null;
      if (!current()) return;
      const attempt = resume ? { attempt_id: resume.attemptId, seed: resume.seed } : await startAttempt(settings.mode, resolved.selection, settings.difficulty, count, featureIds, resolved.wrapper.dataset || {});
      if (!current()) return;
      cancelGesture();
      clearTimeout(hintTimer);
      if (els.resultDialog.open) els.resultDialog.close();
      Object.assign(state, {
        mode: settings.mode, selection: resolved.selection, difficulty: settings.difficulty,
        wrapper: resolved.wrapper, collection, features: collection.features, geometryRef,
        attemptId: attempt.attempt_id, seed: Number(attempt.seed) || hashString(attempt.attempt_id),
        cursor: resume?.cursor || 0, current: -1, placed: 0,
        errors: Math.max(0, Number(resume?.errors) || 0), hints: Math.max(0, Number(resume?.hints) || 0),
        startedAt: null, elapsedBeforeStart: Math.max(0, Number(resume?.elapsedMs) || 0),
        timerStarted: Boolean(resume?.timerStarted), finished: Boolean(resume?.finished),
        finishedResult: resume?.finishedResult || null, started: true, ready: true,
        view: { x: 0, y: 0, k: 1 }, hintUntil: 0,
        selections: { ...state.selections, ...resume?.selections, [settings.mode]: resolved.selection },
      });
      state.order = resume ? [...resume.order] : seededShuffle(count, state.seed);
      state.current = state.finished ? -1 : resume ? resume.current : state.order[0];
      state.pieces = state.features.map((_, index) => ({ index, dx: 0, dy: 0, locked: false, inTray: true }));
      fitCanvas();
      rebuildGeometry();
      if (resume) restorePositions(resume);
      else setCurrentPiece(state.current);
      if (state.timerStarted && !state.finished && !document.hidden && writable()) state.startedAt = performance.now();
      syncSelectors();
      updateDatasetMeta();
      updateUi();
      setControlsEnabled(true);
      setLoading(false);
      els.empty.hidden = true;
      drawAll(true);
      state.restoring = false;
      if (state.finished) showResult();
      else await checkpoint();
    } catch (error) {
      if (!current()) return;
      // A stale tab must not write its old scene if loading the durable head failed.
      state.restoring = Boolean(resume);
      setLoading(false);
      if (state.ready) syncSelectors();
      else {
        els.empty.hidden = false;
        els.empty.querySelector("h2").textContent = copy("Подготавливаем карту", "Preparing the map", "正在准备地图");
        els.empty.querySelector("p").textContent = copy("Для первой загрузки требуется подключение. Карта появится автоматически, когда связь восстановится.", "A connection is needed for the first download. The map will open automatically when it returns.", "首次加载需要网络连接。连接恢复后地图将自动打开。");
      }
      retryLoad = { resume, desired: settings };
      state.retryTimer = setTimeout(() => { if (retryLoad && navigator.onLine) void startGame(retryLoad); }, 15000);
      // Keep the current scene and draft intact. Network retries never block play.
      root.dispatchEvent(new CustomEvent("puzzle:load-status", { detail: { status: "waiting", mode: settings.mode, selection: settings.selection, reason: String(error.message || error) } }));
    }
  }

  function restorePositions(saved) {
    state.pieces = saved.pieces.map((piece, index) => {
      const point = piece.point && state.projection(piece.point), anchor = state.anchors[index];
      return { index, locked: Boolean(piece.locked), inTray: Boolean(piece.inTray), dx: piece.locked ? 0 : point ? point[0] - anchor[0] : Number(piece.dx || 0) * state.cssWidth, dy: piece.locked ? 0 : point ? point[1] - anchor[1] : Number(piece.dy || 0) * state.cssHeight };
    });
    state.placed = state.pieces.filter(piece => piece.locked).length;
    if (saved.view?.centre?.every(Number.isFinite)) {
      const point = state.projection(saved.view.centre);
      const savedZoom = Number(saved.view.zoom);
      const k = clamp(savedZoom > 0 ? savedZoom * state.baseViewK : Number(saved.view.k) || state.view.k, Math.min(state.viewMin,state.baseViewK), Math.max(state.viewMax,state.baseViewK));
      if (point?.every(Number.isFinite)) state.view = { k, x: state.cssWidth / 2 - point[0] * k, y: state.mapBottom / 2 - point[1] * k };
    }
    if (state.current >= 0 && state.pieces[state.current]?.inTray) placePieceInTray(state.current);
  }

  function updateDatasetMeta() {
    const meta = state.wrapper?.dataset || {};
    els.datasetTitle.textContent = localized(meta, "title", MODE_LABELS[state.mode] || tr("Географическая карта"));
    els.datasetSubtitle.textContent = [territoryCount(state.features.length), seminarContext ? tr("зачётный режим") : tr("свободная игра")].join(" · ");
  }

  function originLabel(origin) {
    const value = String(origin || "");
    if (value.includes("network")) return tr("загружено из источника");
    if (value.includes("cache")) return tr("локальный кэш");
    if (value.includes("fallback") || value.includes("bundled")) return tr("встроенная копия");
    return value || tr("источник");
  }

  function declension(number, forms) {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  function fitCanvas() {
    const rect = els.canvasWrap.getBoundingClientRect();
    state.cssWidth = Math.max(1, rect.width);
    state.cssHeight = Math.max(1, rect.height);
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    els.canvas.width = Math.floor(state.cssWidth * state.dpr);
    els.canvas.height = Math.floor(state.cssHeight * state.dpr);
    hitCanvas.width = els.canvas.width;
    hitCanvas.height = els.canvas.height;
    staticCanvas.width = els.canvas.width;
    staticCanvas.height = els.canvas.height;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    hitCtx.setTransform(1, 0, 0, 1, 0, 0);
    staticCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.staticDirty = true;
    state.trayHeight = Math.min(150, state.cssHeight * 0.46, Math.max(82, state.cssHeight * 0.22));
    state.mapBottom = Math.max(1, state.cssHeight - state.trayHeight - 14);
  }

  function forEachGeometryCoordinate(geometry, callback) {
    if (!geometry || !geometry.coordinates) return;
    const visit = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(+value[0]) && Number.isFinite(+value[1])) {
        callback([+value[0], +value[1]]);
        return;
      }
      value.forEach(visit);
    };
    visit(geometry.coordinates);
  }

  function collectionCentralLongitude() {
    // A circular mean keeps Chukotka, Alaska and other dateline datasets
    // compact instead of placing their parts at opposite canvas edges.
    let sinSum = 0;
    let cosSum = 0;
    let samples = 0;
    let seen = 0;
    const stride = state.mode === "russia-subjects" ? 24 : 6;
    state.features.forEach((feature) => {
      forEachGeometryCoordinate(feature.geometry, (coordinate) => {
        seen += 1;
        if (seen % stride !== 0) return;
        const radians = coordinate[0] * Math.PI / 180;
        sinSum += Math.sin(radians);
        cosSum += Math.cos(radians);
        samples += 1;
      });
    });
    if (!samples || (!sinSum && !cosSum)) return 0;
    return Math.atan2(sinSum / samples, cosSum / samples) * 180 / Math.PI;
  }

  function projectedCollectionBounds(projection) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    state.features.forEach((feature) => {
      forEachGeometryCoordinate(feature.geometry, (coordinate) => {
        const point = projection(coordinate);
        if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
        x0 = Math.min(x0, point[0]);
        y0 = Math.min(y0, point[1]);
        x1 = Math.max(x1, point[0]);
        y1 = Math.max(y1, point[1]);
      });
    });
    if (![x0, y0, x1, y1].every(Number.isFinite)) return { x0: -1, y0: -1, x1: 1, y1: 1 };
    return { x0, y0, x1, y1 };
  }

  function buildProjection() {
    const padding = Math.max(12, Math.min(30, state.cssWidth * 0.025));
    let projection;
    if (state.mode === "world-countries") {
      // A small European central-meridian shift keeps Russia and most Pacific
      // island states on a single visual side of the antimeridian.
      projection = window.d3.geoNaturalEarth1().rotate([-11, 0]);
    } else if (state.mode === "russia-subjects") {
      projection = window.d3.geoMercator().rotate([-105, 0]);
      projection.fitSize(
        [Math.max(40, state.cssWidth - padding * 2), Math.max(40, state.mapBottom - padding * 2)],
        state.collection,
      );
      const translated = projection.translate();
      projection.translate([translated[0] + padding, translated[1] + padding]);
      return projection;
    } else {
      projection = window.d3.geoMercator().rotate([-collectionCentralLongitude(), 0]);
    }

    // D3's fitExtent follows GeoJSON ring orientation. Several established
    // Some imported administrative layers use the opposite ring winding and
    // would otherwise be interpreted as the complement of the polygon. Fit the visible coordinate cloud directly,
    // preserving the proven engine while making every dataset fill the stage.
    projection.scale(1).translate([0, 0]);
    const raw = projectedCollectionBounds(projection);
    const rawWidth = Math.max(1e-9, raw.x1 - raw.x0);
    const rawHeight = Math.max(1e-9, raw.y1 - raw.y0);
    const availableWidth = Math.max(40, state.cssWidth - padding * 2);
    const availableHeight = Math.max(40, state.mapBottom - padding * 2);
    const scale = Math.min(availableWidth / rawWidth, availableHeight / rawHeight);
    const tx = padding + (availableWidth - rawWidth * scale) / 2 - raw.x0 * scale;
    const ty = padding + (availableHeight - rawHeight * scale) / 2 - raw.y0 * scale;
    projection.scale(scale).translate([tx, ty]);
    return projection;
  }

  function manualFeatureBounds(feature) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    forEachGeometryCoordinate(feature.geometry, (coordinate) => {
      const point = state.projection(coordinate);
      if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
      x0 = Math.min(x0, point[0]);
      y0 = Math.min(y0, point[1]);
      x1 = Math.max(x1, point[0]);
      y1 = Math.max(y1, point[1]);
    });
    if (![x0, y0, x1, y1].every(Number.isFinite)) return { x0: 0, y0: 0, x1: 1, y1: 1, width: 1, height: 1, cx: .5, cy: .5 };
    return { x0, y0, x1, y1, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  function appendRing(path, ring, toleranceOverride = null) {
    if (state.mode === "russia-subjects") {
      const tolerance = toleranceOverride ?? 0.8;
      let previous = null;
      let subpathStart = null;
      ring.forEach((coordinate) => {
        const projected = state.projection(coordinate);
        if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return;
        if (!previous) {
          path.moveTo(projected[0], projected[1]);
          previous = projected;
          subpathStart = projected;
          return;
        }
        const distance = Math.hypot(projected[0] - previous[0], projected[1] - previous[1]);
        if (distance > 80) {
          if (subpathStart) path.closePath();
          path.moveTo(projected[0], projected[1]);
          subpathStart = projected;
          previous = projected;
        } else if (distance > tolerance) {
          path.lineTo(projected[0], projected[1]);
          previous = projected;
        }
      });
      if (subpathStart) path.closePath();
      return;
    }
    let active = false;
    let previous = null;
    const seamLimit = state.cssWidth * 0.72;
    const tolerance = 0;
    ring.forEach((coordinate) => {
      const projected = state.projection(coordinate);
      if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return;
      const distance = previous ? Math.hypot(projected[0] - previous[0], projected[1] - previous[1]) : 0;
      if (previous && distance > seamLimit) {
        if (active) path.closePath();
        active = false;
      }
      if (!active) {
        path.moveTo(projected[0], projected[1]);
        active = true;
      } else if (distance > tolerance) {
        path.lineTo(projected[0], projected[1]);
      }
      previous = projected;
    });
    if (active) path.closePath();
  }

  function buildPath(feature, toleranceOverride = null) {
    const path = new Path2D();
    const geometry = feature.geometry || {};
    if (geometry.type === "Polygon") {
      (geometry.coordinates || []).forEach((ring) => appendRing(path, ring, toleranceOverride));
    } else if (geometry.type === "MultiPolygon") {
      (geometry.coordinates || []).forEach((polygon) => polygon.forEach((ring) => appendRing(path, ring, toleranceOverride)));
    }
    return path;
  }

  function appendStrokeRing(path, ring, toleranceOverride = null) {
    if (state.mode === "russia-subjects") {
      const tolerance = toleranceOverride ?? 0.8;
      let previousCoordinate = null;
      let previousProjected = null;
      let subpathStart = null;
      let meridianInterrupted = false;
      const onAntimeridian = (coordinate) => Math.abs(Math.abs(Number(coordinate?.[0])) - 180) < 1e-6;
      ring.forEach((coordinate) => {
        const projected = state.projection(coordinate);
        if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return;
        if (!previousProjected) {
          path.moveTo(projected[0], projected[1]);
          previousCoordinate = coordinate;
          previousProjected = projected;
          subpathStart = projected;
          return;
        }
        const distance = Math.hypot(projected[0] - previousProjected[0], projected[1] - previousProjected[1]);
        const meridianSegment = onAntimeridian(previousCoordinate) && onAntimeridian(coordinate);
        if (distance > 80) {
          if (subpathStart) path.closePath();
          path.moveTo(projected[0], projected[1]);
          previousCoordinate = coordinate;
          previousProjected = projected;
          subpathStart = projected;
        } else if (meridianSegment) {
          path.moveTo(projected[0], projected[1]);
          previousCoordinate = coordinate;
          previousProjected = projected;
          subpathStart = projected;
          meridianInterrupted = true;
        } else if (distance > tolerance) {
          path.lineTo(projected[0], projected[1]);
          previousCoordinate = coordinate;
          previousProjected = projected;
        }
      });
      if (subpathStart && !meridianInterrupted) path.closePath();
      return;
    }
    let active = false;
    let previousCoordinate = null;
    let previousProjected = null;
    let interrupted = false;
    const seamLimit = state.mode === "russia-subjects" ? 80 : state.cssWidth * 0.72;
    const tolerance = state.mode === "russia-subjects" ? 0.8 : 0;
    const onAntimeridian = (coordinate) => Math.abs(Math.abs(Number(coordinate?.[0])) - 180) < 1e-6;
    ring.forEach((coordinate) => {
      const projected = state.projection(coordinate);
      if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return;
      const distance = previousProjected ? Math.hypot(projected[0] - previousProjected[0], projected[1] - previousProjected[1]) : 0;
      const meridianSegment = state.mode === "russia-subjects"
        && previousCoordinate
        && onAntimeridian(previousCoordinate)
        && onAntimeridian(coordinate);
      if (previousProjected && (distance > seamLimit || meridianSegment)) {
        path.moveTo(projected[0], projected[1]);
        active = true;
        interrupted = true;
      } else if (!active) {
        path.moveTo(projected[0], projected[1]);
        active = true;
      } else if (distance > tolerance) {
        path.lineTo(projected[0], projected[1]);
      }
      previousCoordinate = coordinate;
      previousProjected = projected;
    });
    if (active && !interrupted) path.closePath();
  }

  function buildStrokePath(feature, toleranceOverride = null) {
    const path = new Path2D();
    const geometry = feature.geometry || {};
    if (geometry.type === "Polygon") {
      (geometry.coordinates || []).forEach((ring) => appendStrokeRing(path, ring, toleranceOverride));
    } else if (geometry.type === "MultiPolygon") {
      (geometry.coordinates || []).forEach((polygon) => polygon.forEach((ring) => appendStrokeRing(path, ring, toleranceOverride)));
    }
    return path;
  }

  function highResolutionPaths(index) {
    if (!state.pathsHi[index]) state.pathsHi[index] = buildPath(state.features[index], 0);
    if (!state.strokePathsHi[index]) state.strokePathsHi[index] = buildStrokePath(state.features[index], 0);
    return { path: state.pathsHi[index], strokePath: state.strokePathsHi[index] };
  }

  function rebuildGeometry() {
    if (!state.collection) return;
    state.projection = buildProjection();
    const geoPath = window.d3.geoPath(state.projection);
    state.paths = state.features.map((feature) => buildPath(feature));
    state.pathsHi = new Array(state.features.length);
    state.strokePaths = state.features.map((feature) => buildStrokePath(feature));
    state.strokePathsHi = new Array(state.features.length);
    state.bounds = state.features.map((feature) => {
      if (state.mode !== "world-countries") return manualFeatureBounds(feature);
      const value = geoPath.bounds(feature);
      const x0 = Number.isFinite(value[0][0]) ? value[0][0] : 0;
      const y0 = Number.isFinite(value[0][1]) ? value[0][1] : 0;
      const x1 = Number.isFinite(value[1][0]) ? value[1][0] : x0 + 1;
      const y1 = Number.isFinite(value[1][1]) ? value[1][1] : y0 + 1;
      return { x0, y0, x1, y1, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    });
    state.anchors = state.features.map((feature, index) => {
      if (state.mode !== "world-countries") return [state.bounds[index].cx, state.bounds[index].cy];
      const value = geoPath.centroid(feature);
      return Number.isFinite(value[0]) && Number.isFinite(value[1]) ? value : [state.bounds[index].cx, state.bounds[index].cy];
    });
    if (state.mode === "russia-subjects") fitRussiaView();
    state.baseViewK = state.mode === "russia-subjects" ? state.view.k : 1;
    if (state.current >= 0 && state.pieces[state.current] && state.pieces[state.current].inTray) placePieceInTray(state.current);
  }

  function fitRussiaView() {
    if (!state.bounds.length) {
      state.view = { x: 0, y: 0, k: 1 };
      return;
    }
    const x0 = Math.min(...state.bounds.map((bounds) => bounds.x0));
    const y0 = Math.min(...state.bounds.map((bounds) => bounds.y0));
    const x1 = Math.max(...state.bounds.map((bounds) => bounds.x1));
    const y1 = Math.max(...state.bounds.map((bounds) => bounds.y1));
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    const padding = 12;
    const scale = Math.min((state.cssWidth - padding * 2) / width, (state.mapBottom - padding * 2) / height);
    state.view = {
      k: scale,
      x: state.cssWidth / 2 - scale * (x0 + x1) / 2,
      y: state.mapBottom - padding - scale * y1,
    };
  }

  function trayRect() {
    const margin = 11;
    return { x: margin, y: state.cssHeight - state.trayHeight - margin, width: state.cssWidth - margin * 2, height: state.trayHeight };
  }

  function trayCenter() {
    const tray = trayRect();
    return { x: tray.x + tray.width / 2, y: tray.y + 42 + (tray.height - 48) / 2 };
  }

  function screenToWorld(x, y) {
    return { x: (x - state.view.x) / state.view.k, y: (y - state.view.y) / state.view.k };
  }

  function worldToScreen(x, y) {
    return { x: x * state.view.k + state.view.x, y: y * state.view.k + state.view.y };
  }

  function placePieceInTray(index) {
    const piece = state.pieces[index];
    if (!piece) return;
    piece.inTray = true;
    const center = trayCenter();
    const world = screenToWorld(center.x, center.y);
    const anchor = state.anchors[index] || [0, 0];
    piece.dx = world.x - anchor[0];
    piece.dy = world.y - anchor[1];
  }

  function setCurrentPiece(index) {
    state.current = index;
    if (index >= 0 && state.pieces[index] && !state.pieces[index].locked) placePieceInTray(index);
    updateUi();
  }

  function currentPiece() {
    return state.current >= 0 ? state.pieces[state.current] : null;
  }

  function setScene(context) {
    context.setTransform(
      state.dpr * state.view.k,
      0,
      0,
      state.dpr * state.view.k,
      state.dpr * state.view.x,
      state.dpr * state.view.y,
    );
  }

  function resetContext(context) {
    context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function clearCanvas() {
    resetContext(ctx);
    ctx.clearRect(0, 0, state.cssWidth, state.cssHeight);
  }

  function drawMap(context = ctx) {
    const fillRule = state.mode === "russia-subjects" ? "nonzero" : "evenodd";
    context.save();
    setScene(context);
    context.fillStyle = "#e7f1f7";
    context.strokeStyle = "#91b2c6";
    context.lineWidth = state.mode === "russia-subjects"
      ? Math.max(1 / state.view.k, 0.6)
      : Math.max(0.7, 1 / state.view.k);
    state.paths.forEach((path, index) => {
      context.fill(path, fillRule);
      context.stroke(state.strokePaths[index]);
    });
    context.restore();
  }

  function drawHint() {
    const piece = currentPiece();
    if (!piece || piece.locked || piece.inTray) return;
    if (seminarContext || Date.now() >= state.hintUntil) return;
    ctx.save();
    setScene(ctx);
    ctx.fillStyle = "rgba(255, 213, 74, .44)";
    ctx.strokeStyle = "#b97900";
    ctx.lineWidth = Math.max(1.4, 2.2 / state.view.k);
    ctx.fill(state.paths[piece.index], state.mode === "russia-subjects" ? "nonzero" : "evenodd");
    ctx.stroke(state.strokePaths[piece.index]);
    ctx.restore();
  }

  function drawLockedPieces(context = ctx) {
    const fillRule = state.mode === "russia-subjects" ? "nonzero" : "evenodd";
    context.save();
    setScene(context);
    context.fillStyle = "#0079c1";
    context.strokeStyle = "#004f80";
    context.lineWidth = state.mode === "russia-subjects"
      ? Math.max(1 / state.view.k, 0.6)
      : Math.max(0.8, 1.1 / state.view.k);
    state.pieces.forEach((piece) => {
      if (!piece.locked) return;
      context.fill(state.paths[piece.index], fillRule);
      context.stroke(state.strokePaths[piece.index]);
    });
    context.restore();
  }

  function drawCurrentPiece() {
    const piece = currentPiece();
    if (!piece || piece.locked) return;
    const path = state.paths[piece.index];
    const strokePath = state.strokePaths[piece.index];
    const bounds = state.bounds[piece.index];
    if (piece.inTray) {
      const tray = trayRect();
      const scale = state.mode === "russia-subjects"
        ? Math.min((tray.width - 28) / bounds.width, (tray.height - 50) / bounds.height)
        : Math.min((tray.width * 0.54) / bounds.width, (tray.height - 50) / bounds.height, 2.4);
      const center = trayCenter();
      const trayPaths = state.mode === "russia-subjects"
        ? highResolutionPaths(piece.index)
        : { path, strokePath };
      ctx.save();
      resetContext(ctx);
      ctx.translate(center.x, center.y);
      ctx.scale(scale, scale);
      ctx.translate(-bounds.cx, -bounds.cy);
      ctx.fillStyle = "#dc3f45";
      ctx.strokeStyle = "#8e2028";
      ctx.lineWidth = state.mode === "russia-subjects" ? 1.2 / scale : Math.max(0.7, 1.3 / scale);
      ctx.fill(trayPaths.path, state.mode === "russia-subjects" ? "nonzero" : "evenodd");
      ctx.stroke(trayPaths.strokePath);
      ctx.restore();
      return;
    }
    ctx.save();
    setScene(ctx);
    ctx.translate(piece.dx, piece.dy);
    ctx.fillStyle = "#dc3f45";
    ctx.strokeStyle = "#8e2028";
    ctx.lineWidth = state.mode === "russia-subjects"
      ? Math.max(1 / state.view.k, 0.6)
      : Math.max(0.9, 1.3 / state.view.k);
    ctx.fill(path, state.mode === "russia-subjects" ? "nonzero" : "evenodd");
    ctx.stroke(strokePath);
    ctx.restore();
  }

  function drawTray() {
    const tray = trayRect();
    ctx.save();
    resetContext(ctx);
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.strokeStyle = "rgba(62, 101, 128, .52)";
    ctx.lineWidth = 1.35;
    ctx.setLineDash([8, 6]);
    roundedRect(ctx, tray.x, tray.y, tray.width, tray.height, 12);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#152238";
    ctx.font = '800 13px Inter, "Segoe UI", sans-serif';
    const name = state.current >= 0 ? state.features[state.current].properties._puzzleName : "";
    drawWrappedText(ctx, name, tray.x + 13, tray.y + 19, tray.width - 26, 16);
    ctx.restore();
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      // Break unspaced names (including Chinese) rather than drawing outside the tray.
      if (context.measureText(word).width > maxWidth) {
        if (line) lines.push(line);
        line = "";
        for (const char of word) {
          if (line && context.measureText(line + char).width > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
        return;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    if (lines.length > 2) {
      let last = lines[1];
      while (last && context.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
      lines[1] = last + "…";
    }
    lines.slice(0, 2).forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
  }

  function rebuildStaticLayer() {
    staticCtx.setTransform(1, 0, 0, 1, 0, 0);
    staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
    drawMap(staticCtx);
    drawLockedPieces(staticCtx);
    state.staticDirty = false;
  }

  function drawAll(rebuildStatic = false) {
    if (!state.ready) return;
    if (rebuildStatic) state.staticDirty = true;
    if (state.staticDirty) rebuildStaticLayer();
    clearCanvas();
    resetContext(ctx);
    ctx.drawImage(staticCanvas, 0, 0, staticCanvas.width, staticCanvas.height, 0, 0, state.cssWidth, state.cssHeight);
    drawHint();
    drawTray();
    drawCurrentPiece();
  }

  function requestDraw(rebuildStatic = false) {
    if (rebuildStatic) state.staticDirty = true;
    if (state.drawFrame) return;
    state.drawFrame = requestAnimationFrame(() => {
      state.drawFrame = 0;
      drawAll();
    });
  }

  function updateUi() {
    const total = state.features.length;
    els.placed.textContent = `${state.placed} / ${total}`;
    els.errors.textContent = String(state.errors);
    els.difficultyLabel.textContent = state.started ? DIFFICULTY[state.difficulty].label : "—";
    const progressPercent = total ? `${Math.round(state.placed / total * 100)}%` : "0%";
    els.progress.style.width = progressPercent;
    if (els.progressTrack) {
      els.progressTrack.setAttribute("aria-valuenow", String(state.placed));
      els.progressTrack.setAttribute("aria-valuemax", String(total || 1));
      els.progressTrack.setAttribute("aria-valuetext", `${state.placed} / ${total}`);
    }
    updateHintControl();
    if (state.current >= 0 && state.features[state.current]) {
      els.currentName.textContent = state.finished ? tr("Карта собрана") : state.features[state.current].properties._puzzleName;
    } else {
      els.currentName.textContent = state.finished ? tr("Карта собрана") : tr("Игра ещё не начата");
    }
  }

  function startTimerIfNeeded() {
    if (state.finished || document.hidden || !writable()) return;
    state.timerStarted = true;
    if (state.startedAt === null) state.startedAt = performance.now();
  }

  function pauseTimer() {
    if (state.startedAt !== null) state.elapsedBeforeStart += performance.now() - state.startedAt;
    state.startedAt = null;
  }

  function elapsedMs() {
    return state.elapsedBeforeStart + (state.startedAt !== null && !state.finished ? performance.now() - state.startedAt : 0);
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function tick() {
    if (state.started && !state.finished) els.time.textContent = formatTime(elapsedMs());
    if(state.startedAt!==null&&!state.finished&&performance.now()-state.lastCheckpointAt>10000)void checkpoint();
    state.animationFrame = requestAnimationFrame(tick);
  }

  function inTray(x, y) {
    const tray = trayRect();
    return x >= tray.x && x <= tray.x + tray.width && y >= tray.y && y <= tray.y + tray.height;
  }

  function pointOnCurrentPiece(x, y, pointerType = "mouse") {
    const piece = currentPiece();
    if (!piece || piece.locked || piece.inTray) return false;
    const world = screenToWorld(x, y);
    const hitPath = state.mode === "russia-subjects"
      ? highResolutionPaths(piece.index).path
      : state.paths[piece.index];
    const localX = world.x - piece.dx;
    const localY = world.y - piece.dy;
    try {
      if (hitCtx.isPointInPath(hitPath, localX, localY, state.mode === "russia-subjects" ? "nonzero" : "evenodd")) return true;
      // Keep tiny territories easy to reacquire after they shrink to map scale.
      // The invisible stroke produces a comfortable pointer target without
      // changing the visible geography or the snapping precision.
      hitCtx.save();
      hitCtx.lineWidth = (pointerType === "touch" ? 48 : 36) / state.view.k;
      hitCtx.lineJoin = "round";
      hitCtx.lineCap = "round";
      const withinExpandedTarget = hitCtx.isPointInStroke(hitPath, localX, localY);
      hitCtx.restore();
      return withinExpandedTarget;
    } catch (_) {
      try { hitCtx.restore(); } catch (_) { /* no-op */ }
      return false;
    }
  }

  function canvasPoint(event) {
    const rect = els.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * state.cssWidth / Math.max(1, rect.width), y: (event.clientY - rect.top) * state.cssHeight / Math.max(1, rect.height) };
  }

  function startPinch() {
    const values = [...state.pointers.values()];
    if (values.length < 2) return;
    const [a, b] = values;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    state.pinch = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      k: state.view.k,
      center: { x: cx, y: cy },
      world: screenToWorld(cx, cy),
    };
  }

  function updatePinch() {
    if (!state.pinch) return;
    const values = [...state.pointers.values()];
    if (values.length < 2) return;
    const [a, b] = values;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (!distance || !state.pinch.distance) return;
    const k = clamp(state.pinch.k * distance / state.pinch.distance, state.viewMin, state.viewMax);
    state.view.k = k;
    state.view.x = state.pinch.center.x - state.pinch.world.x * k;
    state.view.y = state.pinch.center.y - state.pinch.world.y * k;
    requestDraw(true);
  }

  function pointerDown(event) {
    if (!state.ready || state.finished || !acceptInput() || (event.pointerType === "mouse" && event.button !== 0)) return;
    startTimerIfNeeded();
    const point = canvasPoint(event);
    state.pointers.set(event.pointerId, point);
    try { els.canvas.setPointerCapture(event.pointerId); } catch (_) { /* no-op */ }

    if (state.pointers.size === 2) {
      state.draggingPiece = false;
      state.draggingPan = false;
      startPinch();
      return;
    }

    const piece = currentPiece();
    if (!piece) return;
    if (!piece.locked && piece.inTray && inTray(point.x, point.y)) {
      state.draggingPiece = true;
      state.draggingFromTray = true;
      startTimerIfNeeded();
      return;
    }
    if (pointOnCurrentPiece(point.x, point.y, event.pointerType)) {
      state.draggingPiece = true;
      state.draggingFromTray = false;
      const world = screenToWorld(point.x, point.y);
      const anchor = state.anchors[piece.index];
      state.dragOffset = { x: world.x - (anchor[0] + piece.dx), y: world.y - (anchor[1] + piece.dy) };
      startTimerIfNeeded();
      return;
    }
    state.draggingPan = true;
    state.panOffset = { x: point.x - state.view.x, y: point.y - state.view.y };
  }

  function pointerMove(event) {
    if (!state.ready || state.finished || !writable() || !state.pointers.has(event.pointerId)) return;
    const point = canvasPoint(event);
    if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, point);
    if (state.pointers.size >= 2) {
      updatePinch();
      scheduleCheckpoint();
      return;
    }
    const piece = currentPiece();
    if (!piece) return;
    if (state.draggingPiece) {
      if (state.draggingFromTray) {
        const tray = trayRect();
        if (point.y < tray.y - 4) {
          const world = screenToWorld(point.x, point.y);
          const anchor = state.anchors[piece.index];
          piece.inTray = false;
          piece.dx = world.x - anchor[0];
          piece.dy = world.y - anchor[1];
          state.draggingFromTray = false;
          state.dragOffset = { x: 0, y: 0 };
        }
      } else {
        const world = screenToWorld(point.x, point.y);
        const anchor = state.anchors[piece.index];
        piece.dx = world.x - anchor[0] - state.dragOffset.x;
        piece.dy = world.y - anchor[1] - state.dragOffset.y;
      }
      requestDraw();
    } else if (state.draggingPan) {
      state.view.x = point.x - state.panOffset.x;
      state.view.y = point.y - state.panOffset.y;
      requestDraw(true);
    }
    scheduleCheckpoint();
  }

  function pointerEnd(event) {
    if (!state.pointers.has(event.pointerId)) return;
    state.pointers.delete(event.pointerId);
    if (state.pointers.size < 2) state.pinch = null;
    if (state.draggingPiece) attemptSnap();
    state.draggingPiece = false;
    state.draggingFromTray = false;
    state.draggingPan = false;
    try { els.canvas.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
    void checkpoint();
  }

  function cancelGesture() {
    const ids = [...state.pointers.keys()];
    state.pointers.clear();
    state.pinch = null;
    state.draggingPiece = state.draggingFromTray = state.draggingPan = false;
    for (const id of ids) { try { els.canvas.releasePointerCapture(id); } catch (_) { /* capture already released */ } }
  }

  function pointerCancel(event) {
    if (!state.pointers.has(event.pointerId)) return;
    cancelGesture();
    void checkpoint();
  }

  function attemptSnap() {
    const piece = currentPiece();
    if (!piece || piece.locked || piece.inTray) return;
    const screenDistance = Math.hypot(piece.dx, piece.dy) * state.view.k;
    const threshold = DIFFICULTY[state.difficulty].snap;
    if (screenDistance <= threshold) {
      state.hintUntil = 0;
      clearTimeout(hintTimer);
      piece.dx = 0;
      piece.dy = 0;
      piece.locked = true;
      piece.inTray = false;
      state.placed += 1;
      updateUi();
      drawAll(true);
      if (state.placed >= state.features.length) {
        void completeGame();
      } else {
        do { state.cursor += 1; } while (state.cursor < state.order.length && state.pieces[state.order[state.cursor]].locked);
        setCurrentPiece(state.order[state.cursor]);
        drawAll();
      }
    } else {
      state.errors += 1;
      updateUi();
      drawAll();
    }
  }

  function localResult() {
    return { points: seminarContext && state.mode === "russia-subjects" ? DIFFICULTY[state.difficulty].points : 0,
      practice_points: DIFFICULTY[state.difficulty].points,
      grade_eligible: seminarContext && state.mode === "russia-subjects",
      difficulty: state.difficulty, total: state.features.length, durationMs: Math.round(state.elapsedBeforeStart) };
  }

  function showResult() {
    const result = state.finishedResult || localResult();
    els.resultPointsLabel.textContent = result.grade_eligible ? copy("Сложность / балл", "Difficulty / score", "难度 / 分数") : tr("Сложность");
    els.resultPoints.textContent = DIFFICULTY[state.difficulty].label + (result.grade_eligible ? ` · ${formatPoints(result.points)}/5` : "");
    els.resultCount.textContent = String(result.total ?? state.features.length);
    els.resultTime.textContent = formatTime(result.durationMs ?? state.elapsedBeforeStart);
    els.time.textContent = formatTime(state.elapsedBeforeStart);
    setControlsEnabled(true);
    if (!els.resultDialog.open) {
      if (typeof els.resultDialog.showModal === "function") els.resultDialog.showModal();
      else els.resultDialog.setAttribute("open", "");
    }
  }

  async function completeGame() {
    if (state.finished || !writable()) return;
    pauseTimer();
    state.finished = true;
    state.current = -1;
    state.finishedResult = localResult();
    updateUi();
    drawAll(true);
    await checkpoint();
    const payload = {
      csrf, activity_slug: root.dataset.activitySlug, attempt_id: state.attemptId,
      mode: state.mode, selection: state.selection, difficulty: state.difficulty,
      placed: state.placed, total: state.features.length, errors: state.errors, hints: state.hints,
      duration_ms: Math.round(state.elapsedBeforeStart),
      feature_ids: state.features.map(feature => feature.properties._puzzleId),
      dataset_id: state.wrapper?.dataset?.id,
    };
    const attemptId = state.attemptId;
    try {
      // This bridge commits only to the device. Cloud delivery is queued separately.
      const result = await fetchJson(`/api/puzzle/complete?lang=${encodeURIComponent(locale)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (result?.saveStatus?.durable === false) storageNotice();
    } catch (_) { storageNotice(); }
    if (!disposed && state.attemptId === attemptId) showResult();
  }

  function formatPoints(value) {
    const number = Number(value || 0);
    return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function zoomAt(factor, x, y) {
    if (!state.ready || !acceptInput()) return;
    startTimerIfNeeded();
    const world = screenToWorld(x, y);
    const k = clamp(state.view.k * factor, state.viewMin, state.viewMax);
    state.view.k = k;
    state.view.x = x - world.x * k;
    state.view.y = y - world.y * k;
    drawAll(true);
    scheduleCheckpoint();
  }

  function centerView() {
    if (!state.ready || !acceptInput()) return;
    startTimerIfNeeded();
    if (state.mode === "russia-subjects") fitRussiaView();
    else state.view = { x: 0, y: 0, k: 1 };
    const piece = currentPiece();
    if (piece && piece.inTray) placePieceInTray(piece.index);
    drawAll(true);
    void checkpoint();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateHintControl() {
    els.hint.hidden = seminarContext;
    els.hint.disabled = seminarContext || !state.ready || state.finished || !writable() || state.hints >= 10 || Date.now() < state.hintUntil;
    if (els.hintLabel) els.hintLabel.textContent = `${tr("Подсказка")} · ${Math.max(0, 10 - state.hints)}/10`;
  }

  function showHint() {
    if (seminarContext || !state.ready || state.finished || state.hints >= 10 || Date.now() < state.hintUntil || !acceptInput()) return;
    const piece = currentPiece();
    if (!piece) return;
    startTimerIfNeeded();
    if (piece.inTray) {
      const center = { x: state.cssWidth / 2, y: state.mapBottom / 2 };
      const world = screenToWorld(center.x, center.y);
      const anchor = state.anchors[piece.index];
      piece.inTray = false;
      piece.dx = world.x - anchor[0];
      piece.dy = world.y - anchor[1];
    }
    state.hints += 1;
    state.hintUntil = Date.now() + 2200;
    updateHintControl();
    drawAll();
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { state.hintUntil = 0; updateHintControl(); requestDraw(); }, 2200);
    void checkpoint();
  }

  function returnCurrentPiece() {
    if (!acceptInput()) return;
    const piece = currentPiece();
    if (!piece || piece.locked) return;
    placePieceInTray(piece.index);
    drawAll();
    void checkpoint();
  }

  function wheel(event) {
    if (!state.ready) return;
    event.preventDefault();
    const point = canvasPoint(event);
    zoomAt(event.deltaY < 0 ? 1.14 : 1 / 1.14, point.x, point.y);
  }

  function keyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "h", "H"].includes(event.key) || (seminarContext && event.key.toLowerCase() === "h")) return;
    if (!state.ready || state.finished || !acceptInput()) return;
    const piece = currentPiece();
    const step = event.shiftKey ? 28 : 9;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      startTimerIfNeeded();
      if (event.altKey || !piece || piece.inTray) {
        if (event.key === "ArrowLeft") state.view.x += step;
        if (event.key === "ArrowRight") state.view.x -= step;
        if (event.key === "ArrowUp") state.view.y += step;
        if (event.key === "ArrowDown") state.view.y -= step;
      } else {
        startTimerIfNeeded();
        if (event.key === "ArrowLeft") piece.dx -= step / state.view.k;
        if (event.key === "ArrowRight") piece.dx += step / state.view.k;
        if (event.key === "ArrowUp") piece.dy -= step / state.view.k;
        if (event.key === "ArrowDown") piece.dy += step / state.view.k;
      }
      drawAll(event.altKey || !piece || piece.inTray);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (piece && piece.inTray) {
        const center = screenToWorld(state.cssWidth / 2, state.mapBottom / 2);
        const anchor = state.anchors[piece.index];
        piece.inTray = false;
        piece.dx = center.x - anchor[0];
        piece.dy = center.y - anchor[1];
        startTimerIfNeeded();
        drawAll();
      } else {
        attemptSnap();
      }
    } else if (event.key.toLowerCase() === "h") {
      event.preventDefault();
      showHint();
    }
    void checkpoint();
  }

  const stage = els.canvasWrap.parentElement;
  let fullscreenOrigin = null;
  const inertSiblings = new Map();
  function isFullscreen() { return document.fullscreenElement === stage || stage.classList.contains("is-puzzle-fullscreen"); }
  function updateViewportHeight() {
    stage.style.setProperty("--puzzle-viewport-height", `${window.visualViewport?.height || window.innerHeight}px`);
  }
  function fullscreenUi() {
    const active = isFullscreen();
    document.body.classList.toggle("puzzle-fullscreen-active", active);
    els.fullscreen.setAttribute("aria-pressed", String(active));
    const label = els.fullscreen.querySelector("span");
    if (label) label.textContent = active ? copy("Выйти", "Exit full screen", "退出全屏") : tr("Во весь экран");
    if (active && !inertSiblings.size) {
      for (let node = stage; node.parentElement && node.parentElement !== document.documentElement; node = node.parentElement) {
        for (const sibling of node.parentElement.children) if (sibling !== node && sibling instanceof HTMLElement) { inertSiblings.set(sibling, sibling.inert); sibling.inert = true; }
      }
    } else if (!active) {
      for (const [element, inert] of inertSiblings) element.inert = inert;
      inertSiblings.clear();
      if (fullscreenOrigin) {
        window.scrollTo(fullscreenOrigin.x, fullscreenOrigin.y);
        fullscreenOrigin.focus?.focus?.({ preventScroll: true });
        fullscreenOrigin = null;
      }
    }
    updateViewportHeight();
    handleResize();
  }
  async function toggleFullscreen() {
    if (isFullscreen()) {
      if (document.fullscreenElement === stage) await document.exitFullscreen().catch(() => {});
      stage.classList.remove("is-puzzle-fullscreen");
    } else {
      fullscreenOrigin = { x: scrollX, y: scrollY, focus: document.activeElement };
      try {
        if (!stage.requestFullscreen) throw new Error("No native fullscreen");
        await stage.requestFullscreen();
      } catch (_) { stage.classList.add("is-puzzle-fullscreen"); }
    }
    fullscreenUi();
  }

  function handleResize() {
    updateViewportHeight();
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(() => {
      if (!state.ready || disposed) return;
      const rect = els.canvasWrap.getBoundingClientRect();
      if (Math.abs(state.cssWidth - rect.width) < 0.5 && Math.abs(state.cssHeight - rect.height) < 0.5) return;
      const saved = snapshotState();
      cancelGesture();
      fitCanvas();
      rebuildGeometry();
      restorePositions(saved);
      drawAll(true);
      void checkpoint();
    }, 60);
  }

  function lifecycleSave() {
    pauseTimer();
    cancelGesture();
    void checkpoint();
  }
  function onVisible() {
    if (document.hidden) lifecycleSave();
    else if (state.timerStarted && !state.finished && writable()) startTimerIfNeeded();
    else if (!writable()) void root.puzzleProgress?.takeControl?.();
  }
  function writerChange(event) {
    if (!event.detail?.writable) { pauseTimer(); cancelGesture(); setControlsEnabled(false); return; }
    if (event.detail.restore) void startGame({ resume: event.detail.restore });
    else { setControlsEnabled(state.ready); if (state.timerStarted) startTimerIfNeeded(); }
  }
  on(els.mode, "change", () => void requestGame());
  els.modeCards.forEach(card => on(card, "click", () => {
    if (seminarContext) return;
    const mode = card.dataset.puzzleMode;
    void requestGame({ mode, difficulty: els.difficulty.value, selection: state.selections[mode] || (mode === "country-regions" ? "USA" : null) });
  }));
  on(els.subject, "change", () => void requestGame());
  on(els.country, "change", () => void requestGame());
  els.difficulties.forEach(button => {
    on(button, "click", () => { const settings = selectedSettings(); settings.difficulty = button.dataset.puzzleDifficulty; void requestGame(settings); });
    on(button, "keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = els.difficulties.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
      els.difficulties[next].focus();
      els.difficulties[next].click();
    });
  });
  on(els.reset, "click", () => void requestGame({ mode: state.mode, selection: state.selection, difficulty: state.difficulty }, true));
  on(els.center, "click", centerView);
  on(els.zoomIn, "click", () => zoomAt(1.22, state.cssWidth / 2, state.mapBottom / 2));
  on(els.zoomOut, "click", () => zoomAt(1 / 1.22, state.cssWidth / 2, state.mapBottom / 2));
  on(els.returnPiece, "click", returnCurrentPiece);
  on(els.hint, "click", showHint);
  on(els.fullscreen, "click", () => void toggleFullscreen());
  on(els.canvas, "pointerdown", pointerDown);
  on(els.canvas, "pointermove", pointerMove);
  on(els.canvas, "pointerup", pointerEnd);
  on(els.canvas, "pointercancel", pointerCancel);
  on(els.canvas, "lostpointercapture", pointerCancel);
  on(els.canvas, "wheel", wheel, { passive: false });
  on(els.canvas, "keydown", keyDown);
  on(els.playAgain, "click", () => void requestGame({ mode: state.mode, selection: state.selection, difficulty: state.difficulty }, true));
  on(els.resultBack, "click", event => {
    if (root.dataset.native !== "true") return;
    event.preventDefault();
    els.resultDialog.close();
  });
  on(els.closeResult, "click", () => {
    els.resultDialog.close();
    if (root.dataset.native === "true") window.location.hash = "dashboard";
    else window.location.href = "../index.html#dashboard";
  });
  on(document, "keydown", event => { if (event.key === "Escape" && stage.classList.contains("is-puzzle-fullscreen") && !els.resultDialog.open) { event.preventDefault(); void toggleFullscreen(); } });
  on(window, "resize", handleResize);
  on(window.visualViewport, "resize", handleResize);
  on(document, "fullscreenchange", fullscreenUi);
  on(window, "pagehide", lifecycleSave);
  on(document, "visibilitychange", onVisible);
  on(document, "freeze", lifecycleSave);
  on(window, "pageshow", onVisible);
  on(window, "online", () => { if (retryLoad) void startGame(retryLoad); });
  on(root, "puzzle:writerchange", writerChange);
  on(root, "puzzle:storage-warning", storageNotice);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(handleResize) : null;
  resizeObserver?.observe(els.canvasWrap);
  updateDependentFields();
  updateUi();
  state.animationFrame = requestAnimationFrame(tick);
  const restored = root.puzzleProgress?.restore;
  if (restored?.started) { state.selections = { ...restored.selections }; void startGame({ resume: restored }); }
  else void startGame({ desired: { mode: "russia-subjects", difficulty: "medium", selection: null } });
  return () => {
    lifecycleSave();
    disposed = true;
    ++loadGeneration;
    activeLoad?.abort();
    clearTimeout(hintTimer);
    clearTimeout(checkpointTimer);
    clearTimeout(state.retryTimer);
    cancelAnimationFrame(state.animationFrame);
    cancelAnimationFrame(state.drawFrame);
    window.clearTimeout(state.resizeTimer);
    window.clearTimeout(toast.timer);
    resizeObserver?.disconnect();
    listeners.forEach(remove => remove());
    stage.classList.remove("is-puzzle-fullscreen");
    document.body.classList.remove("puzzle-fullscreen-active");
    for (const [element, inert] of inertSiblings) element.inert = inert;
    if (document.fullscreenElement === stage) void document.exitFullscreen().catch(() => {});
  };
  };

  let cleanup=null;
  let destroyed=false;
  let initialised = false;
  const initialise = () => { if (!destroyed && !initialised) { initialised = true; cleanup = initialisePuzzle(); } };
  Promise.all([window.RUDNI18N?.ready, root?.puzzleReady]).then(initialise).catch(error => { console.error("Puzzle initialization failed", error); });
  return ()=>{destroyed=true;cleanup?.()};
  };

  window.mountRudnPuzzle=mountRudnPuzzle;
  const standaloneRoot=document.getElementById("geoPuzzleApp");
  if(standaloneRoot&&standaloneRoot.dataset.native!=="true")mountRudnPuzzle();
})();
