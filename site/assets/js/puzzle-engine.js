(() => {
  "use strict";
  const engineScriptUrl = document.currentScript?.src;
  const rasterWorkerUrl = engineScriptUrl ? new URL("./puzzle-raster-worker.js", engineScriptUrl) : null;
  const rasterVersion = engineScriptUrl && new URL(engineScriptUrl).searchParams.get("v");
  if (rasterVersion) rasterWorkerUrl.searchParams.set("v", rasterVersion);

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
  const backgroundSprite = { valid: false, direct: false };
  const activeSprite = { canvas: document.createElement("canvas"), path: null };
  const rasterPreparation = {
    worker: null, status: "idle", projection: null, timer: 0, timeout: 0,
    generation: 0, sequence: 0, pending: null, cache: new Map(), commands: new Map(), failed: new Set(),
    vertexCounts: new WeakMap(), planKey: null, desired: [], preparations: [],
    lastScale: null, notBefore: 0,
    hits: 0, fallbacks: 0, peakReservedRasterBytes: 0, peakCommandBytes: 0,
  };
  const ACTIVE_RASTER_BUDGET = 16 * 1024 * 1024, COMMAND_BUDGET = 8 * 1024 * 1024;

  const DIFFICULTY = {
    easy: { label: tr("Низкая"), points: 3, snap: 60 },
    medium: { label: tr("Средняя"), points: 4, snap: 30 },
    hard: { label: tr("Высокая"), points: 5, snap: 12 },
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
    mode: seminarContext ? "russia-subjects" : "world-countries",
    selection: null,
    difficulty: "medium",
    wrapper: null,
    collection: null,
    features: [],
    paths: [],
    strokePaths: [],
    bounds: [],
    anchors: [],
    pieces: [],
    order: [],
    cursor: 0,
    current: -1,
    placed: 0,
    hints: 0,
    startedAt: null,
    elapsedBeforeStart: 0,
    hintUntil: 0,
    view: { x: 0, y: 0, k: 1 },
    baseViewK: 1,
    viewMin: 0.55,
    viewMax: 16,
    projection: null,
    legacyProjection: false,
    cssWidth: 1,
    cssHeight: 1,
    dpr: 1,
    trayHeight: 138,
    mapBottom: 1,
    mapRect: { x: 0, y: 0, width: 1, height: 1 },
    trayRect: { x: 0, y: 0, width: 1, height: 1 },
    sideTray: false,
    renderGeometry: null,
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
    const center = mapCenter();
    const worldCentre=screenToWorld(center.x, center.y);
    const centre = state.projection?.invert([worldCentre.x,worldCentre.y]);
    const snapshot = {
      version:3,geometryRef:state.geometryRef,finishedResult:state.finishedResult,selections:{...state.selections},
      attemptId:state.attemptId,seed:state.seed,mode:state.mode,selection:state.selection,difficulty:state.difficulty,
      wrapper:{dataset:state.wrapper?.dataset},featureIds:state.features.map(feature=>feature.properties._puzzleId),
      order:[...state.order],cursor:state.cursor,current:state.current,placed:state.placed,hints:state.hints,
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
    els.countryField.hidden = seminarContext || !["country-regions", "russia-subjects"].includes(mode);
    els.modeSummary.textContent = MODE_HELP[mode] || tr("Выберите вариант карты.");
    els.modeCards.forEach((card) => {
      const active = card.dataset.puzzleMode === (mode === "russia-subjects" ? "country-regions" : mode);
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

  function normalizeCollection(collection, mode, savedFeatureIds = null) {
    const seen = new Set();
    const retained = new Set(savedFeatureIds || []);
    const features = [];
    (collection.features || []).forEach((feature, index) => {
      if (!feature || !feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) return;
      const name = featureName(feature, index);
      const properties = feature.properties || {};
      const countryCode = String(
        properties.ADM0_A3 || properties.adm0_a3 || properties.ISO_A3 || properties.iso_a3 || properties.SOV_A3 || properties.sov_a3 || "",
      ).toUpperCase();
      // Keep the established non-Antarctic set identical in every language.
      // Filtering translated names made ATF disappear only in RU/EN and broke
      // recovery when a saved world game was reopened in Chinese.
      if (mode === "world-countries" && ["ATA", "ATF"].includes(countryCode) && !retained.has(featureId(feature, index))) return;
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
      const items = [...new Map((payload.countries || []).filter(item => item.iso !== "RUS").map(item => [item.iso, item])).values()];
      items.sort((a, b) => localeCompare(localized(a, "name", a.name), localized(b, "name", b.name)));
      items.unshift({ iso: "RUS", name: "Россия", name_en: "Russia", name_zh: "俄罗斯" });
      if (disposed) return items;
      const selected = state.selections["country-regions"] || els.country.value || "RUS";
      els.country.innerHTML = items.map(item => `<option value="${escapeAttr(item.iso)}">${escapeHtml(localized(item, "name", item.name || item.iso))}</option>`).join("");
      els.country.value = items.some(item => item.iso === selected) ? selected : "RUS";
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
    return state.timerStarted || state.placed > 0 || state.hints > 0;
  }

  function selectedSettings() {
    const mode = seminarContext ? "russia-subjects" : els.mode.value;
    const settings = { mode, difficulty: els.difficulty.value || "medium", selection: mode === "russia-municipalities" ? els.subject.value : mode === "country-regions" ? els.country.value || "RUS" : null };
    // A legacy ADM1 Russia attempt keeps its original geometry until an explicit
    // country choice. Merely changing its difficulty must not silently swap it.
    return state.ready && state.mode === "country-regions" && state.selection === "RUS" && settings.mode === state.mode && settings.selection === "RUS" ? settings : canonicalSettings(settings);
  }

  function canonicalSettings(settings) {
    if (seminarContext || (settings.mode === "country-regions" && (!settings.selection || settings.selection === "RUS"))) {
      return { ...settings, mode: "russia-subjects", selection: null };
    }
    return settings;
  }

  function syncSelectors(settings = state) {
    els.mode.value = settings.mode;
    els.difficulty.value = settings.difficulty;
    if (settings.mode === "russia-municipalities" && settings.selection) els.subject.value = settings.selection;
    if (settings.mode === "country-regions" && settings.selection) els.country.value = settings.selection;
    if (settings.mode === "russia-subjects") {
      if (![...els.country.options].some(option => option.value === "RUS")) els.country.add(new Option(copy("Россия", "Russia", "俄罗斯"), "RUS"), 0);
      els.country.value = "RUS";
    }
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
    settings.mode = seminarContext ? "russia-subjects" : settings.mode || "world-countries";
    settings.difficulty = DIFFICULTY[settings.difficulty] ? settings.difficulty : "medium";
    syncSelectors(settings);
    root.dataset.loadPhase = "geometry";
    setLoading(true, copy("Загружаем карту", "Loading the map", "正在加载地图"), copy("Получаем границы территорий. Карта откроется автоматически.", "Loading territory boundaries. The map will open automatically.", "正在获取行政边界，地图将自动打开。"));
    if (!state.ready) els.empty.hidden = true;
    let previousScene = null;
    try {
      let storedGeometry = resume?.geometryRef ? await root.puzzleProgress?.loadGeometry?.(resume.geometryRef) : null;
      if (!current()) return;
      if (settings.mode === "russia-municipalities" && !storedGeometry) {
        await loadSubjectCatalog();
        settings.selection = settings.selection || state.selections[settings.mode] || els.subject.value;
      } else if (settings.mode === "country-regions" && !storedGeometry) {
        await loadAdm1Catalog();
        settings.selection = settings.selection || state.selections[settings.mode] || "RUS";
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
      const collection = normalizeCollection(resolved.collection, settings.mode, resume?.featureIds);
      const featureIds = collection.features.map(feature => feature.properties._puzzleId);
      if (resume && JSON.stringify(featureIds) !== JSON.stringify(resume.featureIds)) throw new Error(tr("Набор карты изменился. Сохранённая попытка не перезаписана."));
      const count = collection.features.length;
      if (resume && (!Array.isArray(resume.order) || resume.order.length !== count || new Set(resume.order).size !== count || resume.order.some(index => !Number.isInteger(index) || index < 0 || index >= count) || !Array.isArray(resume.pieces) || resume.pieces.length !== count)) throw new Error(tr("Сохранённая попытка несовместима с картой."));
      // An evicted snapshot must be replaced with the recovered map bytes;
      // retaining its missing reference would force another download on reload.
      root.dataset.loadPhase = "cache";
      setLoading(true, copy("Подготавливаем карту", "Preparing the map", "正在准备地图"), copy("Границы загружены. Подготавливаем карту к игре.", "Boundaries loaded. Preparing the map for play.", "边界已加载，正在准备地图。"));
      const geometryRef = (storedGeometry?.geometry && resume?.geometryRef) || await root.puzzleProgress?.saveGeometry?.(resolved.wrapper) || null;
      if (!current()) return;
      const attempt = resume ? { attempt_id: resume.attemptId, seed: resume.seed } : await startAttempt(settings.mode, resolved.selection, settings.difficulty, count, featureIds, resolved.wrapper.dataset || {});
      if (!current()) return;
      cancelGesture();
      // Preparation below is synchronous: retain the whole live scene until
      // projection, paths, restored positions and the first draw all succeed.
      previousScene = { ...state };
      Object.assign(state, {
        mode: settings.mode, selection: resolved.selection, difficulty: settings.difficulty,
        wrapper: resolved.wrapper, collection, features: collection.features, geometryRef,
        // Older drafts used offsets in the fitted projection instead of a
        // geographic point/relative zoom. Keep their original coordinate space
        // for this first restore; the next checkpoint writes portable values.
        legacyProjection: Boolean(resume && (!(Number(resume.view?.zoom) > 0)
          || resume.pieces.some(piece => !piece.locked && !piece.inTray
            && (!Array.isArray(piece.point) || piece.point.length !== 2 || !piece.point.every(Number.isFinite))))),
        attemptId: attempt.attempt_id, seed: Number(attempt.seed) || hashString(attempt.attempt_id),
        cursor: resume?.cursor || 0, current: -1, placed: 0,
        // Legacy error counters are deliberately ignored; all game progress is retained.
        hints: Math.max(0, Number(resume?.hints) || 0),
        startedAt: null, elapsedBeforeStart: Math.max(0, Number(resume?.elapsedMs) || 0),
        timerStarted: Boolean(resume?.timerStarted), finished: Boolean(resume?.finished),
        finishedResult: resume?.finishedResult || null, started: true, ready: true,
        view: { x: 0, y: 0, k: 1 }, hintUntil: 0,
        selections: { ...state.selections, ...resume?.selections, [settings.mode]: resolved.selection },
      });
      if (settings.mode === "russia-subjects") state.selections["country-regions"] = "RUS";
      state.order = resume ? [...resume.order] : seededShuffle(count, state.seed);
      state.current = state.finished ? -1 : resume ? resume.current : state.order[0];
      state.pieces = state.features.map((_, index) => ({ index, dx: 0, dy: 0, locked: false, inTray: true }));
      root.dataset.loadPhase = "render";
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
      root.dataset.loadPhase = "ready";
      previousScene = null;
      clearTimeout(hintTimer);
      if (els.resultDialog.open) els.resultDialog.close();
      state.restoring = false;
      // Catalogues enrich the controls, but a saved offline map can open first.
      if (!seminarContext && ["russia-subjects", "country-regions"].includes(state.mode)) void loadAdm1Catalog().catch(() => {});
      if (state.mode === "russia-municipalities") void loadSubjectCatalog().catch(() => {});
      if (state.finished) showResult();
      else await checkpoint();
    } catch (error) {
      if (previousScene) {
        Object.assign(state, previousScene);
        // fitCanvas clears the live and cached canvases. Restore their sizes
        // and rebuild pixels from the retained paths without preparing again.
        const width = Math.floor(state.cssWidth * state.dpr);
        const height = Math.floor(state.cssHeight * state.dpr);
        for (const canvas of [els.canvas, hitCanvas, staticCanvas]) {
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
        }
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        hitCtx.setTransform(1, 0, 0, 1, 0, 0);
        staticCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        if (!disposed && state.ready) {
          syncSelectors();
          updateDatasetMeta();
          updateUi();
          setControlsEnabled(true);
          drawAll(true);
        }
      }
      if (!current()) return;
      // A stale tab must not write its old scene if loading the durable head failed.
      state.restoring = Boolean(resume);
      setLoading(false);
      if (state.ready) syncSelectors();
      else {
        els.empty.hidden = false;
        els.empty.querySelector("h2").textContent = copy("Не удалось открыть карту", "The map could not be opened", "无法打开地图");
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
      const limits = zoomLimits();
      const k = clamp(savedZoom > 0 ? savedZoom * state.baseViewK : Number(saved.view.k) || state.view.k, limits.min, limits.max);
      const center = mapCenter();
      if (point?.every(Number.isFinite)) state.view = { k, x: center.x - point[0] * k, y: center.y - point[1] * k };
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
    // The background cache allocates its own bounded viewport plus overscan.
    backgroundSprite.valid = false;
    staticCanvas.width = staticCanvas.height = 0;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    hitCtx.setTransform(1, 0, 0, 1, 0, 0);
    staticCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.staticDirty = true;
    const layout = window.RudnPuzzleGeometry.computeLayout(state.cssWidth, state.cssHeight, isFullscreen(), window.visualViewport?.width || window.innerWidth, window.visualViewport?.height || window.innerHeight);
    state.sideTray = layout.side;
    state.mapRect = layout.map;
    state.trayRect = layout.tray;
    state.trayHeight = layout.tray.height;
    state.mapBottom = layout.map.y + layout.map.height;
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
    const map = state.mapRect;
    const padding = Math.max(8, Math.min(20, map.width * 0.025));
    let projection;
    if (state.mode === "world-countries") {
      // A small European central-meridian shift keeps Russia and most Pacific
      // island states on a single visual side of the antimeridian.
      projection = window.d3.geoNaturalEarth1().rotate([-11, 0]);
    } else if (state.mode === "russia-subjects") {
      projection = window.d3.geoMercator().rotate([-105, 0]);
      if (!state.legacyProjection) {
        // fitRussiaView already fits the exact projected coordinate bounds.
        // A second spherical-stream fit here is expensive and algebraically
        // cancels out in that final view transform. Keep fixed internal units.
        return projection.scale(150).translate([0, 0]);
      }
      projection.fitSize(
        [Math.max(1, map.width - padding * 2), Math.max(1, map.height - padding * 2)],
        state.collection,
      );
      const translated = projection.translate();
      projection.translate([translated[0] + map.x + padding, translated[1] + map.y + padding]);
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
    const availableWidth = Math.max(1, map.width - padding * 2);
    const availableHeight = Math.max(1, map.height - padding * 2);
    const scale = Math.min(availableWidth / rawWidth, availableHeight / rawHeight);
    const tx = map.x + padding + (availableWidth - rawWidth * scale) / 2 - raw.x0 * scale;
    const ty = map.y + padding + (availableHeight - rawHeight * scale) / 2 - raw.y0 * scale;
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

  function appendRing(path, ring, toleranceOverride = null, projectedRing = null) {
    if (state.mode === "russia-subjects") {
      const tolerance = toleranceOverride ?? 0;
      let previous = null;
      let subpathStart = null;
      ring.forEach((coordinate, index) => {
        const projected = projectedRing ? projectedRing[index] : state.projection(coordinate);
        if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return;
        if (!previous) {
          path.moveTo(projected[0], projected[1]);
          previous = projected;
          subpathStart = projected;
          return;
        }
        const distance = Math.hypot(projected[0] - previous[0], projected[1] - previous[1]);
        if (Math.abs(projected[0] - previous[0]) > Math.PI * state.projection.scale()) {
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
    ring.forEach((coordinate, index) => {
      const projected = projectedRing ? projectedRing[index] : state.projection(coordinate);
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
    // Closing a ring on a large compound Path2D can repeatedly rescan all its
    // preceding contours in browser canvas backends. Close each independent
    // ring first, then append it; coordinates, winding and fill rules stay exact.
    const append = (ring) => {
      const ringPath = new Path2D();
      appendRing(ringPath, ring, toleranceOverride);
      path.addPath(ringPath);
    };
    const geometry = feature.geometry || {};
    if (geometry.type === "Polygon") {
      (geometry.coordinates || []).forEach(append);
    } else if (geometry.type === "MultiPolygon") {
      (geometry.coordinates || []).forEach((polygon) => polygon.forEach(append));
    }
    return path;
  }

  function appendStrokeRing(path, ring, toleranceOverride = null, projectedRing = null) {
    if (state.mode === "russia-subjects") {
      const tolerance = toleranceOverride ?? 0;
      let previousCoordinate = null;
      let previousProjected = null;
      let subpathStart = null;
      let meridianInterrupted = false;
      const onAntimeridian = (coordinate) => Math.abs(Math.abs(Number(coordinate?.[0])) - 180) < 1e-6;
      ring.forEach((coordinate, index) => {
        const projected = projectedRing ? projectedRing[index] : state.projection(coordinate);
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
        if (Math.abs(projected[0] - previousProjected[0]) > Math.PI * state.projection.scale()) {
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
    ring.forEach((coordinate, index) => {
      const projected = projectedRing ? projectedRing[index] : state.projection(coordinate);
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
    const append = (ring) => {
      const ringPath = new Path2D();
      appendStrokeRing(ringPath, ring, toleranceOverride);
      path.addPath(ringPath);
    };
    const geometry = feature.geometry || {};
    if (geometry.type === "Polygon") {
      (geometry.coordinates || []).forEach(append);
    } else if (geometry.type === "MultiPolygon") {
      (geometry.coordinates || []).forEach((polygon) => polygon.forEach(append));
    }
    return path;
  }

  function highResolutionPaths(index) {
    if (state.renderGeometry) return state.renderGeometry.getFull(index);
    // FeatureCollection/legacy maps already use unsimplified paths.
    return { path: state.paths[index], strokePath: state.strokePaths[index] };
  }

  function buildFeatureGeometry(feature, TargetPath = Path2D) {
    const path = new TargetPath(), strokePath = new TargetPath();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const append = (ring) => {
      // Reuse each projection for bounds, fill and border. Keep this temporary
      // array per ring so large island datasets do not retain a second geometry.
      const projected = ring.map(coordinate => {
        const point = state.projection(coordinate);
        if (point && point.every(Number.isFinite)) {
          x0 = Math.min(x0, point[0]); y0 = Math.min(y0, point[1]);
          x1 = Math.max(x1, point[0]); y1 = Math.max(y1, point[1]);
        }
        return point;
      });
      const fillRing = new TargetPath(), strokeRing = new TargetPath();
      appendRing(fillRing, ring, 0, projected);
      appendStrokeRing(strokeRing, ring, 0, projected);
      path.addPath(fillRing); strokePath.addPath(strokeRing);
    };
    const geometry = feature.geometry || {};
    if (geometry.type === "Polygon") (geometry.coordinates || []).forEach(append);
    else if (geometry.type === "MultiPolygon") (geometry.coordinates || []).forEach(polygon => polygon.forEach(append));
    if (![x0, y0, x1, y1].every(Number.isFinite)) { x0 = y0 = 0; x1 = y1 = 1; }
    return { path, strokePath, bounds: { x0, y0, x1, y1, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 } };
  }

  function rebuildGeometry() {
    if (!state.collection) return;
    resetRasterPreparation();
    activeSprite.path = null;
    state.projection = buildProjection();
    const geoPath = window.d3.geoPath(state.projection);
    const prepared = state.mode === "russia-subjects" ? null : state.features.map(feature => buildFeatureGeometry(feature));
    state.bounds = state.features.map((feature, index) => {
      if (state.mode !== "world-countries") return prepared ? prepared[index].bounds : manualFeatureBounds(feature);
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
    state.renderGeometry = state.mode === "russia-subjects" ? window.RudnPuzzleGeometry.createTopologyRenderer({ topology: state.wrapper?.geometry, objectKey: bestTopologyObject(state.wrapper?.geometry || {}), featureIds: state.features.map(feature => feature.properties._puzzleId), project: state.projection, seamWidth: 2 * Math.PI * state.projection.scale(), maxScale: state.baseViewK * state.viewMax }) : null;
    state.paths = state.renderGeometry ? [] : prepared ? prepared.map(feature => feature.path) : state.features.map((feature) => buildPath(feature));
    state.strokePaths = state.renderGeometry ? [] : prepared ? prepared.map(feature => feature.strokePath) : state.features.map((feature) => buildStrokePath(feature));
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
    const map = state.mapRect, center = mapCenter();
    const scale = Math.max(0.01, Math.min((map.width - padding * 2) / width, (map.height - padding * 2) / height));
    state.view = {
      k: scale,
      x: center.x - scale * (x0 + x1) / 2,
      y: center.y - scale * (y0 + y1) / 2,
    };
  }

  function trayRect() {
    return state.trayRect;
  }

  function mapCenter() {
    const map = state.mapRect;
    return { x: map.x + map.width / 2, y: map.y + map.height / 2 };
  }

  function zoomLimits() {
    return { min: state.baseViewK * state.viewMin, max: state.baseViewK * state.viewMax };
  }

  function inMap(x, y) {
    const map = state.mapRect;
    return x >= map.x && x <= map.x + map.width && y >= map.y && y <= map.y + map.height;
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

  function setScene(context, view = state.view) {
    context.setTransform(
      state.dpr * view.k,
      0,
      0,
      state.dpr * view.k,
      state.dpr * view.x,
      state.dpr * view.y,
    );
  }

  function resetContext(context) {
    context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function clearCanvas() {
    resetContext(ctx);
    ctx.clearRect(0, 0, state.cssWidth, state.cssHeight);
  }

  function clipMap(context, map = state.mapRect) {
    resetContext(context);
    context.beginPath(); context.rect(map.x, map.y, map.width, map.height); context.clip();
  }

  function visibleFeature(index, view = state.view, map = state.mapRect) {
    const bounds = state.bounds[index];
    return bounds.x1 * view.k + view.x >= map.x - 3 && bounds.x0 * view.k + view.x <= map.x + map.width + 3
      && bounds.y1 * view.k + view.y >= map.y - 3 && bounds.y0 * view.k + view.y <= map.y + map.height + 3;
  }

  function displayPaths(index) {
    return state.renderGeometry ? state.renderGeometry.get(index, state.view.k) : { path: state.paths[index], strokePath: state.strokePaths[index] };
  }

  function drawMap(context = ctx, view = state.view, map = state.mapRect) {
    const fillRule = state.mode === "russia-subjects" ? "nonzero" : "evenodd";
    context.save();
    clipMap(context, map);
    setScene(context, view);
    context.fillStyle = "#e7f1f7";
    context.strokeStyle = "#91b2c6";
    context.lineWidth = 1 / state.view.k;
    context.lineJoin = context.lineCap = "round";
    state.features.forEach((_, index) => {
      if (!visibleFeature(index, view, map)) return;
      const paths = displayPaths(index);
      context.fill(paths.path, fillRule);
      context.stroke(paths.strokePath);
    });
    context.restore();
  }

  function drawHint() {
    const piece = currentPiece();
    if (!piece || piece.locked || piece.inTray) return;
    if (Date.now() >= state.hintUntil) return;
    ctx.save();
    clipMap(ctx);
    setScene(ctx);
    ctx.fillStyle = "rgba(255, 213, 74, .44)";
    ctx.strokeStyle = "#b97900";
    ctx.lineWidth = 2.2 / state.view.k;
    ctx.lineJoin = ctx.lineCap = "round";
    const paths = highResolutionPaths(piece.index);
    ctx.fill(paths.path, state.mode === "russia-subjects" ? "nonzero" : "evenodd");
    ctx.stroke(paths.strokePath);
    ctx.restore();
  }

  function drawLockedPieces(context = ctx, view = state.view, map = state.mapRect) {
    const fillRule = state.mode === "russia-subjects" ? "nonzero" : "evenodd";
    context.save();
    clipMap(context, map);
    setScene(context, view);
    context.fillStyle = "#0079c1";
    context.strokeStyle = "#004f80";
    context.lineWidth = 1 / state.view.k;
    context.lineJoin = context.lineCap = "round";
    state.pieces.forEach((piece) => {
      if (!piece.locked || !visibleFeature(piece.index, view, map)) return;
      const paths = displayPaths(piece.index);
      context.fill(paths.path, fillRule);
      context.stroke(paths.strokePath);
    });
    context.restore();
  }

  function rasterPreparationStats() {
    const cache = rasterPreparation.cache;
    const bitmapBytes = [...cache.values()].reduce((sum, item) => sum + item.bytes, 0);
    const canvasBytes = activeSprite.canvas.width * activeSprite.canvas.height * 4;
    // Reserve canvas + ImageData + transferred bitmap for the in-flight job.
    // Native path/backend memory is separate from these explicit raster bounds.
    const reservedRasterBytes = bitmapBytes + canvasBytes + (rasterPreparation.pending?.bytes || 0) * 3;
    const cachedCommandBytes = [...rasterPreparation.commands.values()].reduce((sum, item) => sum + item.bytes, 0);
    const inFlightCommandBytes = rasterPreparation.pending?.commandBytes || 0;
    const commandBytes = cachedCommandBytes + inFlightCommandBytes;
    rasterPreparation.peakReservedRasterBytes = Math.max(rasterPreparation.peakReservedRasterBytes, reservedRasterBytes);
    rasterPreparation.peakCommandBytes = Math.max(rasterPreparation.peakCommandBytes, commandBytes);
    return { status: rasterPreparation.status, pendingJobs: Number(!!rasterPreparation.pending), commandBytes, cachedCommandBytes, inFlightCommandBytes,
      bitmapBytes, canvasBytes, reservedRasterBytes, rasterBudgetBytes: ACTIVE_RASTER_BUDGET,
      commandBudgetBytes: COMMAND_BUDGET, peakReservedRasterBytes: rasterPreparation.peakReservedRasterBytes,
      peakCommandBytes: rasterPreparation.peakCommandBytes, hits: rasterPreparation.hits, fallbacks: rasterPreparation.fallbacks,
      preparations: rasterPreparation.preparations.map(item => ({ ...item })) };
  }

  function stopRasterWorker(status = "idle") {
    ++rasterPreparation.generation;
    rasterPreparation.worker?.terminate();
    rasterPreparation.worker = null;
    rasterPreparation.pending = null;
    rasterPreparation.status = status;
    clearTimeout(rasterPreparation.timeout);
  }

  function removePreparedRaster(key) {
    rasterPreparation.cache.get(key)?.bitmap.close();
    rasterPreparation.cache.delete(key);
  }

  function resetRasterPreparation() {
    clearTimeout(rasterPreparation.timer);
    rasterPreparation.timer = 0;
    const terminal = ["unsupported", "failed"].includes(rasterPreparation.status) ? rasterPreparation.status : "idle";
    stopRasterWorker(terminal);
    for (const key of rasterPreparation.cache.keys()) removePreparedRaster(key);
    rasterPreparation.commands.clear();
    rasterPreparation.failed.clear();
    rasterPreparation.planKey = null;
    rasterPreparation.projection = null;
    rasterPreparation.lastScale = null;
    rasterPreparation.notBefore = 0;
  }

  function startRasterWorker() {
    if (rasterPreparation.worker || ["unsupported", "failed"].includes(rasterPreparation.status)) return;
    if (!rasterWorkerUrl || typeof Worker !== "function") { rasterPreparation.status = "unsupported"; return; }
    try {
      const worker = new Worker(rasterWorkerUrl), generation = rasterPreparation.generation;
      rasterPreparation.worker = worker;
      rasterPreparation.status = "probing";
      worker.onerror = event => { event.preventDefault(); stopRasterWorker("failed"); };
      worker.onmessageerror = event => { event.preventDefault?.(); stopRasterWorker("failed"); };
      worker.onmessage = ({ data }) => {
        if (disposed || generation !== rasterPreparation.generation) {
          data.results?.forEach(item => item.bitmap.close()); return;
        }
        if (data.type === "capability") {
          clearTimeout(rasterPreparation.timeout);
          if (!data.supported) { stopRasterWorker("unsupported"); return; }
          rasterPreparation.status = "ready";
          rasterPreparation.planKey = null;
          scheduleRasterPreparation();
          return;
        }
        const pending = rasterPreparation.pending;
        if (!pending || data.id !== pending.id) { data.results?.forEach(item => item.bitmap.close()); return; }
        clearTimeout(rasterPreparation.timeout);
        rasterPreparation.pending = null;
        const sameScene = pending.projection === state.projection && pending.attemptId === state.attemptId;
        const desired = sameScene ? rasterCandidates() : [];
        const keys = new Set(desired.flat().map(item => item.key));
        const wantedCommands = desired.some(group => group[0]?.index === pending.index);
        if (wantedCommands && data.fill?.byteLength && data.stroke?.byteLength) {
          // Transfer ownership back, rather than cloning several MiB on every
          // zoom. Even an obsolete scale returns useful immutable commands.
          rasterPreparation.commands.delete(pending.index);
          rasterPreparation.commands.set(pending.index, { fill: data.fill, stroke: data.stroke,
            bytes: data.fill.byteLength + data.stroke.byteLength, projection: pending.projection });
        }
        if (data.type !== "ready") {
          pending.variants.filter(item => keys.has(item.key)).forEach(item => rasterPreparation.failed.add(item.key));
        } else {
          let discardedVariants = 0;
          data.results.forEach(result => {
            const variant = pending.variants.find(item => item.scale === result.scale);
            if (!variant || !keys.has(variant.key)) { result.bitmap.close(); ++discardedVariants; return; }
            removePreparedRaster(variant.key);
            rasterPreparation.cache.set(variant.key, { ...variant, bitmap: result.bitmap, projection: pending.projection });
          });
          rasterPreparation.preparations.push({ index: pending.index, attemptId: pending.attemptId, mode: pending.mode,
            selection: pending.selection, serializationMs: pending.serializationMs, reusedCommands: pending.reusedCommands, discardedVariants,
            readyMs: performance.now() - pending.begin, buildMs: data.buildMs, rasterMs: data.rasterMs,
            workerMs: data.workerMs, bytes: pending.bytes, commandBytes: pending.commandBytes });
          if (rasterPreparation.preparations.length > 32) rasterPreparation.preparations.shift();
        }
        rasterPreparationStats();
        rasterPreparation.planKey = null;
        scheduleRasterPreparation();
      };
      rasterPreparation.timeout = setTimeout(() => stopRasterWorker("failed"), 15000);
    } catch (_) { stopRasterWorker("failed"); }
  }

  function complexFeature(index) {
    const feature = state.features[index];
    if (!feature) return false;
    if (!rasterPreparation.vertexCounts.has(feature)) {
      const geometry = feature.geometry || {};
      const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
      let vertices = 0, rings = 0;
      for (const polygon of polygons) for (const ring of polygon) { vertices += ring.length; ++rings; }
      // Conservative serialized-size bound, including ring closure/flush markers.
      const commandEstimate = (vertices + rings * 4) * 48;
      rasterPreparation.vertexCounts.set(feature, { complex: vertices >= 20000 && commandEstimate <= COMMAND_BUDGET, commandEstimate });
    }
    return rasterPreparation.vertexCounts.get(feature).complex;
  }

  function rasterVariant(index, scale) {
    const bounds = state.bounds[index], dpr = state.dpr;
    const x0 = Math.floor((bounds.x0 * scale - 2) * dpr), y0 = Math.floor((bounds.y0 * scale - 2) * dpr);
    const width = Math.ceil((bounds.x1 * scale + 2) * dpr) - x0, height = Math.ceil((bounds.y1 * scale + 2) * dpr) - y0;
    return { index, key: `${index}:${scale}:${dpr}`, scale, dpr, x0, y0, width, height, bytes: width * height * 4 };
  }

  function scheduleRasterPreparation() {
    const piece = currentPiece();
    if (disposed || !state.ready || !piece?.inTray || piece.locked || ["unsupported", "failed"].includes(rasterPreparation.status)) return;
    if (rasterPreparation.lastScale !== null && rasterPreparation.lastScale !== state.view.k) {
      // Wheel/pinch frames need the exact new vector scale immediately, but a
      // cold-raster prefetch is useful only after that scale stops changing.
      // Do not serialize the same large contour on every intermediate frame.
      rasterPreparation.notBefore = performance.now() + 150;
      // Keep the one in-flight job alive to recover its transferred commands.
      // Its response is filtered against the latest exact-scale candidates.
    }
    rasterPreparation.lastScale = state.view.k;
    const planKey = `${state.current}:${state.view.k}:${state.dpr}`;
    if (rasterPreparation.projection === state.projection && rasterPreparation.planKey === planKey) return;
    rasterPreparation.projection = state.projection;
    rasterPreparation.planKey = planKey;
    clearTimeout(rasterPreparation.timer);
    rasterPreparation.timer = setTimeout(prepareRasterCandidates, Math.max(0, rasterPreparation.notBefore - performance.now()));
  }

  function rasterCandidates() {
    if (disposed || !state.ready || !currentPiece() || currentPiece().locked) return [];
    // Look ahead to the next complex contour; simple intervening pieces need no
    // worker and must not evict a useful preparation before it can be displayed.
    const indices = state.order.slice(state.cursor).filter(index => !state.pieces[index].locked && complexFeature(index)).slice(0, 2);
    return indices.map(index => {
      const bounds = state.bounds[index], tray = trayRect();
      const trayScale = Math.max(0.001, Math.min((tray.width - 28) / bounds.width, (tray.height - 50) / bounds.height));
      return [...new Set([state.view.k, trayScale])].map(scale => rasterVariant(index, scale));
    });
  }

  function prepareRasterCandidates() {
    rasterPreparation.timer = 0;
    if (disposed || !state.ready || !currentPiece()?.inTray) { rasterPreparation.planKey = null; return; }
    startRasterWorker();
    if (rasterPreparation.status !== "ready") return;
    const desired = rasterCandidates();
    const indices = desired.map(group => group[0].index);
    const keys = new Set(desired.flat().map(item => item.key));
    for (const key of rasterPreparation.cache.keys()) if (!keys.has(key)) removePreparedRaster(key);
    for (const index of rasterPreparation.commands.keys()) if (!indices.includes(index)) rasterPreparation.commands.delete(index);
    // A newer scale/selection waits for this job's returned command buffers;
    // Map/projection disposal and safety checks can still terminate it.
    if (rasterPreparation.pending) return;
    for (const group of desired) {
      const variants = group.filter(item => !rasterPreparation.cache.has(item.key) && !rasterPreparation.failed.has(item.key));
      if (!variants.length) continue;
      const bytes = variants.reduce((sum, item) => sum + item.bytes, 0);
      if (bytes > 2 * 1024 * 1024 || rasterPreparationStats().reservedRasterBytes + bytes * 3 > ACTIVE_RASTER_BUDGET) continue;
      const begin = performance.now(), index = variants[0].index;
      let commands;
      try {
        const cached = rasterPreparation.commands.get(index);
        const reusedCommands = cached?.projection === state.projection;
        if (reusedCommands) {
          commands = { fill: cached.fill, stroke: cached.stroke };
          rasterPreparation.commands.delete(index);
        } else {
          // Reserve an upper bound before allocating encoded buffers. Prefer
          // retaining the active contour over speculative look-ahead work.
          const estimate = rasterPreparation.vertexCounts.get(state.features[index]).commandEstimate;
          for (const key of rasterPreparation.commands.keys()) {
            if (rasterPreparationStats().commandBytes + estimate <= COMMAND_BUDGET) break;
            if (key !== state.current) rasterPreparation.commands.delete(key);
          }
          if (rasterPreparationStats().commandBytes + estimate > COMMAND_BUDGET) continue;
          if (state.renderGeometry) commands = state.renderGeometry.getFullCommands(index);
          else {
            const paths = buildFeatureGeometry(state.features[index], window.RudnPuzzleGeometry.CommandPath);
            commands = { fill: paths.path.commands(), stroke: paths.strokePath.commands() };
          }
        }
        const commandBytes = commands.fill.byteLength + commands.stroke.byteLength;
        if (rasterPreparationStats().commandBytes + commandBytes > COMMAND_BUDGET) { variants.forEach(item => rasterPreparation.failed.add(item.key)); continue; }
        const id = ++rasterPreparation.sequence;
        rasterPreparation.pending = { id, index, variants, bytes, commandBytes, begin,
          serializationMs: performance.now() - begin, reusedCommands, projection: state.projection,
          attemptId: state.attemptId, mode: state.mode, selection: state.selection };
        rasterPreparationStats();
        rasterPreparation.worker.postMessage({ id, variants, dpr: state.dpr, fillRule: state.mode === "russia-subjects" ? "nonzero" : "evenodd", ...commands },
          [commands.fill.buffer, commands.stroke.buffer]);
        rasterPreparation.timeout = setTimeout(() => stopRasterWorker("failed"), 15000);
      } catch (_) { stopRasterWorker("failed"); }
      return;
    }
  }

  function reserveActiveRaster(bytes, keepKey = null) {
    const oldBytes = activeSprite.canvas.width * activeSprite.canvas.height * 4;
    for (const key of rasterPreparation.cache.keys()) {
      if (rasterPreparationStats().reservedRasterBytes - oldBytes + bytes <= ACTIVE_RASTER_BUDGET) break;
      if (key !== keepKey) removePreparedRaster(key);
    }
    if (rasterPreparationStats().reservedRasterBytes - oldBytes + bytes > ACTIVE_RASTER_BUDGET && rasterPreparation.pending) stopRasterWorker();
    return rasterPreparationStats().reservedRasterBytes - oldBytes + bytes <= ACTIVE_RASTER_BUDGET;
  }

  function resizeActiveRaster(width, height) {
    // Clear the old height first so a tall-to-wide resize cannot transiently
    // allocate newWidth * oldHeight outside the explicit raster budget.
    const canvas = activeSprite.canvas;
    canvas.height = 0;
    canvas.width = width; canvas.height = height;
    return canvas;
  }

  function drawPieceRaster(path, strokePath, bounds, scale, tx, ty) {
    // Rasterize the complete original contour at the *current* physical pixel
    // scale. Translation can reuse it without retessellating thousands of
    // islands. Zoom/projection changes always rebuild; never stretch old pixels.
    const dpr = state.dpr, pad = 2;
    const fillRule = state.mode === "russia-subjects" ? "nonzero" : "evenodd";
    const left = Math.max(bounds.x0 * scale - pad, -tx);
    const top = Math.max(bounds.y0 * scale - pad, -ty);
    const right = Math.min(bounds.x1 * scale + pad, state.cssWidth - tx);
    const bottom = Math.min(bounds.y1 * scale + pad, state.cssHeight - ty);
    if (right <= left || bottom <= top) return true;
    const sprite = activeSprite;
    if (sprite.path !== path || sprite.strokePath !== strokePath || sprite.fillRule !== fillRule || sprite.scale !== scale || sprite.dpr !== dpr
      || left < sprite.left || top < sprite.top || right > sprite.right || bottom > sprite.bottom) {
      const key = `${state.current}:${scale}:${dpr}`, prepared = rasterPreparation.cache.get(key);
      if (prepared?.projection === state.projection && reserveActiveRaster(prepared.bytes, key)) {
        const canvas = resizeActiveRaster(prepared.width, prepared.height);
        canvas.getContext("2d").drawImage(prepared.bitmap, 0, 0);
        Object.assign(sprite, { path, strokePath, fillRule, scale, dpr, left: prepared.x0 / dpr, top: prepared.y0 / dpr,
          right: (prepared.x0 + prepared.width) / dpr, bottom: (prepared.y0 + prepared.height) / dpr });
        ++rasterPreparation.hits;
      } else {
      if (complexFeature(state.current)) ++rasterPreparation.fallbacks;
      // At most 16 MiB, including a small motion margin; oversize displays keep
      // the vector fallback instead of allocating an unbounded zoomed bitmap.
      const maxPixels = 4 * 1024 * 1024;
      let margin = 96;
      let x0, y0, x1, y1;
      do {
        x0 = Math.floor(Math.max(bounds.x0 * scale - pad, left - margin) * dpr);
        y0 = Math.floor(Math.max(bounds.y0 * scale - pad, top - margin) * dpr);
        x1 = Math.ceil(Math.min(bounds.x1 * scale + pad, right + margin) * dpr);
        y1 = Math.ceil(Math.min(bounds.y1 * scale + pad, bottom + margin) * dpr);
        if ((x1 - x0) * (y1 - y0) <= maxPixels) break;
        if (!margin) return false;
        margin = Math.floor(margin / 2);
      } while (true);
      if (!reserveActiveRaster((x1 - x0) * (y1 - y0) * 4)) return false;
      const canvas = resizeActiveRaster(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      const context = canvas.getContext("2d", { alpha: true });
      context.setTransform(dpr * scale, 0, 0, dpr * scale, -x0, -y0);
      context.fillStyle = "#dc3f45"; context.strokeStyle = "#8e2028";
      context.lineWidth = 1.2 / scale; context.lineJoin = context.lineCap = "round";
      context.fill(path, fillRule);
      context.stroke(strokePath);
      Object.assign(sprite, { path, strokePath, fillRule, scale, dpr, left: x0 / dpr, top: y0 / dpr, right: x1 / dpr, bottom: y1 / dpr });
      }
      rasterPreparationStats();
    }
    ctx.save(); resetContext(ctx);
    ctx.drawImage(sprite.canvas, sprite.left + tx, sprite.top + ty, sprite.canvas.width / dpr, sprite.canvas.height / dpr);
    ctx.restore();
    return true;
  }

  function drawCurrentPiece() {
    const piece = currentPiece();
    if (!piece || piece.locked) return;
    const { path, strokePath } = highResolutionPaths(piece.index);
    const bounds = state.bounds[piece.index];
    if (piece.inTray) {
      scheduleRasterPreparation();
      const tray = trayRect();
      const scale = Math.max(0.001, Math.min((tray.width - 28) / bounds.width, (tray.height - 50) / bounds.height));
      const center = trayCenter();
      if (drawPieceRaster(path, strokePath, bounds, scale, center.x - bounds.cx * scale, center.y - bounds.cy * scale)) return;
      ctx.save();
      resetContext(ctx);
      ctx.translate(center.x, center.y);
      ctx.scale(scale, scale);
      ctx.translate(-bounds.cx, -bounds.cy);
      ctx.fillStyle = "#dc3f45";
      ctx.strokeStyle = "#8e2028";
      ctx.lineWidth = 1.2 / scale;
      ctx.lineJoin = ctx.lineCap = "round";
      ctx.fill(path, state.mode === "russia-subjects" ? "nonzero" : "evenodd");
      ctx.stroke(strokePath);
      ctx.restore();
      return;
    }
    if (drawPieceRaster(path, strokePath, bounds, state.view.k, state.view.x + piece.dx * state.view.k, state.view.y + piece.dy * state.view.k)) return;
    ctx.save();
    setScene(ctx);
    ctx.translate(piece.dx, piece.dy);
    ctx.fillStyle = "#dc3f45";
    ctx.strokeStyle = "#8e2028";
    ctx.lineWidth = 1.2 / state.view.k;
    ctx.lineJoin = ctx.lineCap = "round";
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
    const sprite = backgroundSprite, map = state.mapRect, view = state.view, dpr = state.dpr;
    const sameScene = sprite.valid && sprite.projection === state.projection && sprite.pieces === state.pieces
      && sprite.placed === state.placed && sprite.scale === view.k && sprite.dpr === dpr
      && sprite.map.x === map.x && sprite.map.y === map.y && sprite.map.width === map.width && sprite.map.height === map.height;
    const x = sprite.left + view.x - sprite.viewX, y = sprite.top + view.y - sprite.viewY;
    if (sameScene && !sprite.direct && x <= map.x && y <= map.y
      && x + staticCanvas.width / dpr >= map.x + map.width && y + staticCanvas.height / dpr >= map.y + map.height) {
      state.staticDirty = false;
      return;
    }
    let margin = Math.max(64, Math.min(256, Math.min(map.width, map.height) / 2));
    let left, top, width, height;
    do {
      left = Math.floor((map.x - margin) * dpr) / dpr;
      top = Math.floor((map.y - margin) * dpr) / dpr;
      width = Math.ceil((map.x + map.width + margin - left) * dpr);
      height = Math.ceil((map.y + map.height + margin - top) * dpr);
      if (width * height <= 4 * 1024 * 1024 || !margin) break;
      margin = Math.floor(margin / 2);
    } while (true);
    Object.assign(sprite, { valid: true, direct: width * height > 4 * 1024 * 1024,
      projection: state.projection, pieces: state.pieces, placed: state.placed, scale: view.k, dpr,
      map: { ...map }, left, top, viewX: view.x, viewY: view.y });
    if (sprite.direct) {
      staticCanvas.width = staticCanvas.height = 0;
    } else {
      staticCanvas.width = width; staticCanvas.height = height;
      const cacheView = { x: view.x - left, y: view.y - top, k: view.k };
      const cacheMap = { x: 0, y: 0, width: width / dpr, height: height / dpr };
      drawMap(staticCtx, cacheView, cacheMap);
      drawLockedPieces(staticCtx, cacheView, cacheMap);
    }
    state.staticDirty = false;
  }

  function drawAll(rebuildStatic = false) {
    if (!state.ready) return;
    if (rebuildStatic) state.staticDirty = true;
    if (state.staticDirty) rebuildStaticLayer();
    clearCanvas();
    resetContext(ctx);
    if (backgroundSprite.direct) {
      drawMap(); drawLockedPieces();
    } else {
      // Cache translation never changes scale. Clip at the actual map rectangle
      // so the overscan cannot appear in the piece tray or over the controls.
      ctx.save(); clipMap(ctx);
      const x = backgroundSprite.left + state.view.x - backgroundSprite.viewX;
      const y = backgroundSprite.top + state.view.y - backgroundSprite.viewY;
      ctx.drawImage(staticCanvas, x, y, staticCanvas.width / state.dpr, staticCanvas.height / state.dpr);
      ctx.restore();
    }
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
    const limits = zoomLimits();
    const k = clamp(state.pinch.k * distance / state.pinch.distance, limits.min, limits.max);
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

    if (state.pointers.size >= 2) {
      state.draggingPiece = false;
      state.draggingFromTray = false;
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
        if (inMap(point.x, point.y)) {
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
    const wasMultiTouch = state.pointers.size >= 2;
    state.pointers.delete(event.pointerId);
    if (state.pointers.size >= 2) startPinch();
    else state.pinch = null;
    if (!wasMultiTouch && state.draggingPiece) attemptSnap();
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
      if (state.placed >= state.features.length) {
        void completeGame();
      } else {
        do { state.cursor += 1; } while (state.cursor < state.order.length && state.pieces[state.order[state.cursor]].locked);
        setCurrentPiece(state.order[state.cursor]);
        drawAll(true);
      }
    } else {
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
    const attemptId = state.attemptId;
    const payload = {
      csrf, activity_slug: root.dataset.activitySlug, attempt_id: state.attemptId,
      mode: state.mode, selection: state.selection, difficulty: state.difficulty,
      placed: state.placed, total: state.features.length, hints: state.hints,
      duration_ms: Math.round(state.elapsedBeforeStart),
      feature_ids: state.features.map(feature => feature.properties._puzzleId),
      dataset_id: state.wrapper?.dataset?.id,
    };
    await checkpoint();
    // A slow local acknowledgement may arrive after the student has already
    // started another map. Never complete or open a result for that new attempt.
    if (disposed || state.attemptId !== attemptId) return;
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
    const limits = zoomLimits();
    const k = clamp(state.view.k * factor, limits.min, limits.max);
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
    els.hint.hidden = false;
    els.hint.disabled = !state.ready || state.finished || !writable() || state.hints >= 10 || Date.now() < state.hintUntil;
    if (els.hintLabel) els.hintLabel.textContent = `${tr("Подсказка")} · ${Math.max(0, 10 - state.hints)}/10`;
  }

  function showHint() {
    if (!state.ready || state.finished || state.hints >= 10 || Date.now() < state.hintUntil || !acceptInput()) return;
    const piece = currentPiece();
    if (!piece) return;
    startTimerIfNeeded();
    if (piece.inTray) {
      const center = mapCenter();
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
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "h", "H"].includes(event.key)) return;
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
        const point = mapCenter();
        const center = screenToWorld(point.x, point.y);
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
      const side = window.RudnPuzzleGeometry.computeLayout(rect.width, rect.height, isFullscreen(), window.visualViewport?.width || innerWidth, window.visualViewport?.height || innerHeight).side;
      if (Math.abs(state.cssWidth - rect.width) < 0.5 && Math.abs(state.cssHeight - rect.height) < 0.5 && state.sideTray === side && state.dpr === Math.min(2, devicePixelRatio || 1)) return;
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
  on(els.mode, "change", () => void requestGame(canonicalSettings(selectedSettings())));
  els.modeCards.forEach(card => on(card, "click", () => {
    if (seminarContext) return;
    const mode = card.dataset.puzzleMode;
    void requestGame(canonicalSettings({ mode, difficulty: els.difficulty.value, selection: state.selections[mode] || (mode === "country-regions" ? "RUS" : null) }));
  }));
  on(els.subject, "change", () => void requestGame());
  on(els.country, "change", () => void requestGame(canonicalSettings({ mode: "country-regions", selection: els.country.value, difficulty: els.difficulty.value })));
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
  on(els.zoomIn, "click", () => { const center = mapCenter(); zoomAt(1.22, center.x, center.y); });
  on(els.zoomOut, "click", () => { const center = mapCenter(); zoomAt(1 / 1.22, center.x, center.y); });
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
  else void startGame({ desired: { mode: seminarContext ? "russia-subjects" : "world-countries", difficulty: "medium", selection: null } });
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
    resetRasterPreparation();
    activeSprite.path = null;
    activeSprite.canvas.width = activeSprite.canvas.height = 0;
    backgroundSprite.valid = false;
    staticCanvas.width = staticCanvas.height = 0;
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
