(() => {
  "use strict";

  const initialisePuzzle = () => {
  const root = document.getElementById("geoPuzzleApp");
  if (!root) return;

  const locale = window.RUDNI18N?.locale || document.documentElement.dataset.locale || "en";
  const htmlLocale = locale === "zh" ? "zh-Hans" : locale;
  const tr = (source, params = {}) => window.RUDNI18N?.t(source, params) || source;
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
    start: byId("puzzleStart"),
    reset: byId("puzzleReset"),
    center: byId("puzzleCenter"),
    zoomIn: byId("puzzleZoomIn"),
    zoomOut: byId("puzzleZoomOut"),
    fullscreen: byId("puzzleFullscreen"),
    returnPiece: byId("puzzleReturn"),
    hint: byId("puzzleHint"),
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
    progressMirrors: [...document.querySelectorAll("[data-progress-mirror]")],
    sourceTitle: byId("puzzleSourceTitle"),
    source: byId("puzzleSource"),
    origin: byId("puzzleOriginBadge"),
    modeCards: [...document.querySelectorAll("[data-puzzle-mode]")],
    startDuplicates: [...document.querySelectorAll("[data-puzzle-start-duplicate]")],
    toast: byId("puzzleToast"),
    resultDialog: byId("puzzleResultDialog"),
    resultText: byId("puzzleResultText"),
    resultPointsLabel: byId("puzzleResultPointsLabel"),
    resultPoints: byId("puzzleResultPoints"),
    resultCount: byId("puzzleResultCount"),
    resultTime: byId("puzzleResultTime"),
    resultErrors: byId("puzzleResultErrors"),
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
    easy: { label: tr("Учебная"), points: 3, snap: 60, hintAlways: true },
    medium: { label: tr("Стандартная"), points: 4, snap: 30, hintAlways: false },
    hard: { label: tr("Экспертная"), points: 5, snap: 12, hintAlways: false },
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
    strokePaths: [],
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
  };

  function toast(message, type = "info", ms = 3000) {
    els.toast.textContent = message;
    els.toast.className = `puzzle-toast ${type}`;
    requestAnimationFrame(() => els.toast.classList.add("visible"));
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => els.toast.classList.remove("visible"), ms);
  }

  function setLoading(visible, title = "Загружаем геоданные", text = "При первом открытии набор сохраняется в локальный кэш платформы.") {
    state.loading = visible;
    els.loading.hidden = !visible;
    els.loadingTitle.textContent = tr(title);
    els.loadingText.textContent = tr(text);
    els.start.disabled = visible;
  }

  function setControlsEnabled(enabled) {
    [els.center, els.zoomIn, els.zoomOut, els.returnPiece, els.hint, els.reset].forEach((el) => {
      el.disabled = !enabled;
    });
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
      els.datasetSubtitle.textContent = mode === "russia-subjects"
        ? tr("89 территорий · выберите сложность и загрузите карту.")
        : tr("Выберите территорию и загрузите тренировочную карту.");
      els.placed.textContent = mode === "russia-subjects" ? "0 / 89" : "0 / —";
      els.currentName.textContent = tr("Игра ещё не начата");
      if (els.sourceTitle) els.sourceTitle.textContent = tr("Карта ещё не загружена");
      els.source.textContent = tr("Источник, период и лицензия появятся после загрузки.");
      els.origin.textContent = tr("нет данных");
      els.origin.className = "badge";
    }
    if (mode === "russia-municipalities") void loadSubjectCatalog();
    if (mode === "country-regions") void loadAdm1Catalog();
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
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
    if (features.length < 2) throw new Error(tr("В выбранном наборе недостаточно территорий для игры."));
    return { type: "FeatureCollection", features };
  }

  async function loadWrapper(cacheKey, url) {
    if (state.datasetCache.has(cacheKey)) return state.datasetCache.get(cacheKey);
    const promise = fetchJson(url).catch((error) => {
      state.datasetCache.delete(cacheKey);
      throw error;
    });
    state.datasetCache.set(cacheKey, promise);
    return promise;
  }

  async function ensureGeometry(wrapper, cacheKey) {
    if (wrapper && wrapper.geometry) return wrapper;
    const geometryUrl = wrapper && wrapper.dataset && wrapper.dataset.geometry_url;
    if (!geometryUrl) throw new Error(tr("Для выбранного набора не указана геометрия."));
    const geometry = await loadWrapper(`${cacheKey}:geometry`, geometryUrl);
    return { ...wrapper, geometry };
  }

  async function loadSubjectCatalog() {
    if (state.subjectCatalogLoaded) return;
    state.subjectCatalogLoaded = true;
    els.subject.innerHTML = `<option value="">${escapeHtml(tr("Загрузка субъектов…"))}</option>`;
    try {
      const payload = await loadWrapper("municipal-catalog", "/api/puzzle/catalog/municipal");
      const items = Array.isArray(payload.subjects) ? payload.subjects : [];
      items.sort((a, b) => localeCompare(localized(a, "name", a.name), localized(b, "name", b.name)));
      els.subject.innerHTML = items.map((item) => {
        const count = Number.isFinite(item.units) && item.units > 0 ? ` · ${item.units}` : "";
        const unavailable = item.available ? "" : " disabled";
        const suffix = item.available ? count : ` · ${tr("карта ожидается")}`;
        return `<option value="${escapeAttr(item.id)}"${unavailable}>${escapeHtml(localized(item, "name", item.name || item.id))}${escapeHtml(suffix)}</option>`;
      }).join("");
      const firstAvailable = items.find((item) => item.available);
      if (firstAvailable) els.subject.value = String(firstAvailable.id);
      const unavailableCount = Number(payload.missing_count || 0);
      els.subjectHint.textContent = mapAvailabilityText(payload.available_count, payload.subject_count, unavailableCount);
      if (unavailableCount > 0) {
        toast(municipalNotice(payload.available_count, payload.subject_count, unavailableCount), "info", 6500);
      }
    } catch (error) {
      state.subjectCatalogLoaded = false;
      els.subject.innerHTML = `<option value="">${escapeHtml(tr("Не удалось загрузить каталог"))}</option>`;
      toast(localizeError(`Каталог субъектов недоступен: ${error.message}`), "error", 6000);
    }
  }

  async function loadAdm1Catalog() {
    if (state.adm1CatalogLoaded) return;
    state.adm1CatalogLoaded = true;
    els.country.innerHTML = `<option value="USA">${escapeHtml(tr("Загрузка каталога стран…"))}</option>`;
    try {
      const payload = await fetchJson("/api/puzzle/catalog/adm1");
      const items = Array.isArray(payload.countries) ? payload.countries : [];
      items.sort((a, b) => Number(Boolean(b.local)) - Number(Boolean(a.local)) || localeCompare(localized(a, "name", a.name), localized(b, "name", b.name)));
      const localItems = items.filter((item) => item.local);
      const remoteItems = items.filter((item) => !item.local);
      const optionMarkup = (item) => {
        const count = Number.isFinite(item.units) && item.units > 0 ? ` · ${item.units}` : "";
        const canonicalValue = localized(item, "canonical", item.canonical || "ADM1");
        const canonical = canonicalValue && canonicalValue !== "ADM1" ? ` · ${canonicalValue}` : "";
        return `<option value="${escapeAttr(item.iso)}">${escapeHtml(localized(item, "name", item.name || item.iso))}${escapeHtml(canonical)}${count}</option>`;
      };
      els.country.innerHTML = [
        localItems.length ? `<optgroup label="${escapeAttr(tr("Встроены в платформу"))}">${localItems.map(optionMarkup).join("")}</optgroup>` : "",
        remoteItems.length ? `<optgroup label="${escapeAttr(tr("Загружаются через geoBoundaries"))}">${remoteItems.map(optionMarkup).join("")}</optgroup>` : "",
      ].join("");
      const offlineCount = Number(payload.offline_count || localItems.length);
      els.countryHint.textContent = offlineAvailabilityText(offlineCount);
      if ([...els.country.options].some((option) => option.value === "USA")) els.country.value = "USA";
    } catch (error) {
      state.adm1CatalogLoaded = false;
      els.country.innerHTML = `<option value="USA">${escapeHtml(locale === "zh" ? "美国" : locale === "en" ? "United States of America" : "Соединённые Штаты Америки")}</option>`;
      toast(localizeError(`Полный каталог стран временно недоступен: ${error.message}`), "error", 5000);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  async function resolveDataset(mode) {
    if (!window.d3) throw new Error(tr("Локальный картографический модуль не загрузился. Обновите страницу."));

    if (mode === "russia-subjects") {
      let wrapper = await loadWrapper("russia-subjects", "/api/puzzle/data/russia-subjects");
      wrapper = await ensureGeometry(wrapper, "russia-subjects");
      return { wrapper, collection: normalizeCollection(geometryToCollection(wrapper.geometry), mode), selection: null };
    }

    if (mode === "world-countries") {
      let wrapper = await loadWrapper("world-countries", "/api/puzzle/data/world-countries");
      wrapper = await ensureGeometry(wrapper, "world-countries");
      return { wrapper, collection: normalizeCollection(geometryToCollection(wrapper.geometry), mode), selection: null };
    }

    if (mode === "country-regions") {
      const iso = els.country.value || "USA";
      let wrapper = await loadWrapper(`adm1-${iso}`, `/api/puzzle/data/country-adm1/${encodeURIComponent(iso)}`);
      wrapper = await ensureGeometry(wrapper, `adm1-${iso}`);
      return { wrapper, collection: normalizeCollection(geometryToCollection(wrapper.geometry), mode), selection: iso };
    }

    if (mode === "russia-municipalities") {
      await loadSubjectCatalog();
      const subjectId = els.subject.value;
      if (!subjectId) throw new Error(tr("Выберите субъект Российской Федерации."));
      let wrapper = await loadWrapper(
        `municipal-${subjectId}`,
        `/api/puzzle/data/russia-municipalities/${encodeURIComponent(subjectId)}`,
      );
      wrapper = await ensureGeometry(wrapper, `municipal-${subjectId}`);
      return {
        wrapper,
        collection: normalizeCollection(geometryToCollection(wrapper.geometry), mode),
        selection: subjectId,
      };
    }

    throw new Error(tr("Неизвестный вариант карты."));
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

  async function startGame({ reuseDataset = false } = {}) {
    if (state.loading) return;
    if (state.started && !state.finished && state.placed > 0 && !window.confirm(tr("Текущая попытка будет прервана. Начать заново?"))) return;

    const mode = seminarContext ? "russia-subjects" : els.mode.value;
    const difficulty = els.difficulty.value;
    setLoading(true, "Подготавливаем карту", mode === "russia-municipalities" ? "Муниципальный слой крупнее обычного; первая загрузка может занять некоторое время." : "Геометрия проверяется и подготавливается для сенсорного управления.");
    els.empty.hidden = true;

    try {
      let resolved;
      if (reuseDataset && state.wrapper && state.collection && state.mode === mode && state.difficulty === difficulty) {
        resolved = { wrapper: state.wrapper, collection: state.collection, selection: state.selection };
      } else {
        resolved = await resolveDataset(mode);
      }
      const collection = normalizeCollection(resolved.collection, mode);
      const attempt = await startAttempt(
        mode,
        resolved.selection,
        difficulty,
        collection.features.length,
        collection.features.map((feature) => feature.properties._puzzleId),
        resolved.wrapper.dataset || {},
      );

      state.mode = mode;
      state.selection = resolved.selection;
      state.difficulty = difficulty;
      state.wrapper = resolved.wrapper;
      state.collection = collection;
      state.features = collection.features;
      state.attemptId = attempt.attempt_id;
      state.seed = Number(attempt.seed) || hashString(`${Date.now()}-${mode}-${resolved.selection || ""}`);
      state.order = seededShuffle(state.features.length, state.seed);
      state.pieces = state.features.map((_, index) => ({ index, dx: 0, dy: 0, locked: false, inTray: true }));
      state.cursor = 0;
      state.current = state.order[0];
      state.placed = 0;
      state.errors = 0;
      state.hints = 0;
      state.startedAt = null;
      state.elapsedBeforeStart = 0;
      state.finished = false;
      state.started = true;
      state.ready = true;
      state.view = { x: 0, y: 0, k: 1 };
      state.hintUntil = 0;

      fitCanvas();
      rebuildGeometry();
      setCurrentPiece(state.current);
      updateUi();
      updateDatasetMeta();
      setControlsEnabled(true);
      els.mode.disabled = true;
      els.subject.disabled = true;
      els.country.disabled = true;
      els.difficulty.disabled = true;
      els.start.textContent = tr("Загрузить другую карту");
      setLoading(false);
      drawAll(true);
      els.canvas.focus({ preventScroll: true });
    } catch (error) {
      setLoading(false);
      state.started = false;
      state.ready = false;
      els.empty.hidden = false;
      setControlsEnabled(false);
      els.mode.disabled = false;
      els.subject.disabled = false;
      els.country.disabled = false;
      els.difficulty.disabled = false;
      toast(localizeError(error.message || tr("Не удалось запустить игру.")), "error", 7000);
    }
  }

  function updateDatasetMeta() {
    const meta = state.wrapper && state.wrapper.dataset ? state.wrapper.dataset : {};
    const title = localized(meta, "title", MODE_LABELS[state.mode] || tr("Географическая карта"));
    const year = localized(meta, "year", meta.year || "");
    const source = localized(meta, "source", meta.source || "");
    const license = localized(meta, "license", meta.license || "");
    const note = localized(meta, "note", meta.note || "");
    els.datasetTitle.textContent = title;
    if (els.sourceTitle) els.sourceTitle.textContent = title || tr("Набор геоданных");
    if (els.modeBadge) {
      const graded = seminarContext && state.mode === "russia-subjects";
      els.modeBadge.textContent = graded ? tr("Зачётный режим") : seminarContext ? tr("Тренировочный режим") : tr("Свободная игра");
      els.modeBadge.classList.toggle("training", !graded);
    }
    const count = state.features.length;
    const detail = [
      territoryCount(count),
      seminarContext && state.mode === "russia-subjects" ? tr("зачётный режим") : tr("свободная игра"),
      year ? `${tr("данные")}: ${year}` : null,
    ].filter(Boolean).join(" · ");
    els.datasetSubtitle.textContent = detail;
    const sourceLabel = source ? escapeHtml(source) : escapeHtml(tr("Источник не указан"));
    const sourceMarkup = meta.source_url
      ? `<strong><a href="${escapeAttr(meta.source_url)}" target="_blank" rel="noopener noreferrer">${sourceLabel}</a></strong>`
      : `<strong>${sourceLabel}</strong>`;
    const osmAttribution = /openstreetmap|odbl/i.test(`${source} ${license}`)
      ? `<br><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a>`
      : "";
    els.source.innerHTML = [
      sourceMarkup,
      license ? `<br>${escapeHtml(tr("Лицензия"))}: ${escapeHtml(license)}` : "",
      osmAttribution,
      note ? `<br>${escapeHtml(note)}` : "",
    ].join("");
    els.origin.textContent = originLabel(meta.origin);
    els.origin.className = `badge ${String(meta.origin || "").includes("network") ? "badge-success" : "badge-blue"}`;
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
    state.cssWidth = Math.max(320, Math.floor(rect.width));
    state.cssHeight = Math.max(420, Math.floor(rect.height));
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
    state.trayHeight = Math.min(150, Math.max(116, state.cssHeight * 0.19));
    state.mapBottom = state.cssHeight - state.trayHeight - 14;
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

  function appendRing(path, ring) {
    if (state.mode === "russia-subjects") {
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
        } else if (distance > 0.8) {
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

  function buildPath(feature) {
    const path = new Path2D();
    const geometry = feature.geometry || {};
    if (geometry.type === "Polygon") {
      (geometry.coordinates || []).forEach((ring) => appendRing(path, ring));
    } else if (geometry.type === "MultiPolygon") {
      (geometry.coordinates || []).forEach((polygon) => polygon.forEach((ring) => appendRing(path, ring)));
    }
    return path;
  }

  function appendStrokeRing(path, ring) {
    if (state.mode === "russia-subjects") {
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
        } else if (distance > 0.8) {
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

  function buildStrokePath(feature) {
    const path = new Path2D();
    const geometry = feature.geometry || {};
    if (geometry.type === "Polygon") {
      (geometry.coordinates || []).forEach((ring) => appendStrokeRing(path, ring));
    } else if (geometry.type === "MultiPolygon") {
      (geometry.coordinates || []).forEach((polygon) => polygon.forEach((ring) => appendStrokeRing(path, ring)));
    }
    return path;
  }

  function rebuildGeometry() {
    if (!state.collection) return;
    state.projection = buildProjection();
    const geoPath = window.d3.geoPath(state.projection);
    state.paths = state.features.map(buildPath);
    state.strokePaths = state.features.map(buildStrokePath);
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
    return { x: tray.x + tray.width / 2, y: tray.y + tray.height / 2 + 7 };
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
    context.lineWidth = Math.max(0.7, 1 / state.view.k);
    state.paths.forEach((path, index) => {
      context.fill(path, fillRule);
      context.stroke(state.strokePaths[index]);
    });
    context.restore();
  }

  function drawHint() {
    const piece = currentPiece();
    if (!piece || piece.locked || piece.inTray) return;
    const config = DIFFICULTY[state.difficulty];
    if (!config.hintAlways && Date.now() > state.hintUntil) return;
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
    context.lineWidth = Math.max(0.8, 1.1 / state.view.k);
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
      const scale = Math.min((tray.width * 0.54) / bounds.width, (tray.height * 0.52) / bounds.height, 2.4);
      const center = trayCenter();
      ctx.save();
      resetContext(ctx);
      ctx.translate(center.x, center.y + 4);
      ctx.scale(scale, scale);
      ctx.translate(-bounds.cx, -bounds.cy);
      ctx.fillStyle = "#dc3f45";
      ctx.strokeStyle = "#8e2028";
      ctx.lineWidth = Math.max(0.7, 1.3 / scale);
      ctx.fill(path, state.mode === "russia-subjects" ? "nonzero" : "evenodd");
      ctx.stroke(strokePath);
      ctx.restore();
      return;
    }
    ctx.save();
    setScene(ctx);
    ctx.translate(piece.dx, piece.dy);
    ctx.fillStyle = "#dc3f45";
    ctx.strokeStyle = "#8e2028";
    ctx.lineWidth = Math.max(0.9, 1.3 / state.view.k);
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
    ctx.fillStyle = "#60708a";
    ctx.font = '700 11px Inter, "Segoe UI", sans-serif';
    ctx.fillText(tr("ТЕКУЩАЯ ТЕРРИТОРИЯ"), tray.x + 13, tray.y + 20);
    ctx.fillStyle = "#152238";
    ctx.font = '800 13px Inter, "Segoe UI", sans-serif';
    const name = state.current >= 0 ? state.features[state.current].properties._puzzleName : "";
    drawEllipsizedText(ctx, name, tray.x + 13, tray.y + 42, Math.min(350, tray.width * 0.35));
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

  function drawEllipsizedText(context, text, x, y, maxWidth) {
    let value = String(text || "");
    if (context.measureText(value).width <= maxWidth) {
      context.fillText(value, x, y);
      return;
    }
    while (value.length > 2 && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
    context.fillText(`${value}…`, x, y);
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
    drawCurrentPiece();
    drawTray();
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
    els.progressMirrors.forEach((bar) => { bar.style.width = progressPercent; });
    if (state.current >= 0 && state.features[state.current]) {
      els.currentName.textContent = state.finished ? tr("Карта собрана") : state.features[state.current].properties._puzzleName;
    } else {
      els.currentName.textContent = state.finished ? tr("Карта собрана") : tr("Игра ещё не начата");
    }
  }

  function startTimerIfNeeded() {
    if (!state.startedAt) state.startedAt = performance.now();
  }

  function elapsedMs() {
    return state.elapsedBeforeStart + (state.startedAt && !state.finished ? performance.now() - state.startedAt : 0);
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
    if (state.ready && Date.now() <= state.hintUntil) requestDraw();
    state.animationFrame = requestAnimationFrame(tick);
  }

  function inTray(x, y) {
    const tray = trayRect();
    return x >= tray.x && x <= tray.x + tray.width && y >= tray.y && y <= tray.y + tray.height;
  }

  function pointOnCurrentPiece(x, y) {
    const piece = currentPiece();
    if (!piece || piece.locked || piece.inTray) return false;
    const world = screenToWorld(x, y);
    try {
      return hitCtx.isPointInPath(state.paths[piece.index], world.x - piece.dx, world.y - piece.dy, state.mode === "russia-subjects" ? "nonzero" : "evenodd");
    } catch (_) {
      return false;
    }
  }

  function canvasPoint(event) {
    const rect = els.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
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
    if (!state.ready || state.finished) return;
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
    if (pointOnCurrentPiece(point.x, point.y)) {
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
    if (!state.ready || state.finished) return;
    const point = canvasPoint(event);
    if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, point);
    if (state.pointers.size >= 2) {
      updatePinch();
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
  }

  function pointerEnd(event) {
    state.pointers.delete(event.pointerId);
    if (state.pointers.size < 2) state.pinch = null;
    if (state.draggingPiece) attemptSnap();
    state.draggingPiece = false;
    state.draggingFromTray = false;
    state.draggingPan = false;
    try { els.canvas.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
  }

  function attemptSnap() {
    const piece = currentPiece();
    if (!piece || piece.locked || piece.inTray) return;
    const screenDistance = Math.hypot(piece.dx, piece.dy) * state.view.k;
    const remaining = state.features.length - state.placed;
    const threshold = DIFFICULTY[state.difficulty].snap;
    if (screenDistance <= threshold || remaining === 1) {
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
      toast(tr("Деталь пока не совпала с контуром. Попробуйте точнее или измените масштаб."), "error", 2300);
      drawAll();
    }
  }

  async function completeGame() {
    state.finished = true;
    state.elapsedBeforeStart = elapsedMs();
    state.current = -1;
    updateUi();
    drawAll(true);
    setControlsEnabled(false);
    els.reset.disabled = false;
    // The server rejects zero-duration synthetic completions.  On very small
    // maps a genuine expert attempt can finish in under one second, therefore
    // clamp only the transmitted value while retaining the measured UI time.
    const duration = Math.max(1000, Math.round(state.elapsedBeforeStart));
    const payload = {
      csrf,
      activity_slug: root.dataset.activitySlug,
      attempt_id: state.attemptId,
      mode: state.mode,
      selection: state.selection,
      difficulty: state.difficulty,
      placed: state.placed,
      total: state.features.length,
      errors: state.errors,
      hints: state.hints,
      duration_ms: duration,
      feature_ids: state.features.map((feature) => feature.properties._puzzleId),
      dataset_id: state.wrapper && state.wrapper.dataset && state.wrapper.dataset.id,
    };
    let result = {
      points: state.mode === "russia-subjects" ? DIFFICULTY[state.difficulty].points : 0,
      practice_points: DIFFICULTY[state.difficulty].points,
      best_points: Number(root.dataset.currentGrade || 0),
      grade_eligible: seminarContext && state.mode === "russia-subjects",
    };
    try {
      result = await fetchJson(`/api/puzzle/complete?lang=${encodeURIComponent(locale)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      root.dataset.currentGrade = String(result.best_points ?? result.points ?? 0);
      els.resultText.textContent = result.message || tr("Результат сохранён в электронном журнале.");
    } catch (error) {
      els.resultText.textContent = localizeError(`Карта собрана, но результат пока не записан: ${error.message}`);
      toast(tr("Не удалось записать результат. Не закрывайте страницу и повторите попытку позже."), "error", 7000);
    }
    if (result.grade_eligible) {
      els.resultPointsLabel.textContent = tr("Баллы в журнал");
      els.resultPoints.textContent = `${formatPoints(result.points)}/5`;
    } else {
      els.resultPointsLabel.textContent = tr("Режим");
      els.resultPoints.textContent = tr("тренировка");
    }
    els.resultCount.textContent = String(state.features.length);
    els.resultTime.textContent = formatTime(duration);
    els.resultErrors.textContent = String(state.errors);
    if (typeof els.resultDialog.showModal === "function") els.resultDialog.showModal();
    else els.resultDialog.setAttribute("open", "");
  }

  function formatPoints(value) {
    const number = Number(value || 0);
    return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function zoomAt(factor, x, y) {
    if (!state.ready) return;
    const world = screenToWorld(x, y);
    const k = clamp(state.view.k * factor, state.viewMin, state.viewMax);
    state.view.k = k;
    state.view.x = x - world.x * k;
    state.view.y = y - world.y * k;
    drawAll(true);
  }

  function centerView() {
    if (state.mode === "russia-subjects") fitRussiaView();
    else state.view = { x: 0, y: 0, k: 1 };
    const piece = currentPiece();
    if (piece && piece.inTray) placePieceInTray(piece.index);
    drawAll(true);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function showHint() {
    if (!state.ready || state.finished) return;
    const piece = currentPiece();
    if (!piece) return;
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
    drawAll();
    toast(tr("Правильное место подсвечено жёлтым контуром."), "success", 2200);
  }

  function returnCurrentPiece() {
    const piece = currentPiece();
    if (!piece || piece.locked) return;
    placePieceInTray(piece.index);
    drawAll();
  }

  function wheel(event) {
    if (!state.ready) return;
    event.preventDefault();
    const point = canvasPoint(event);
    zoomAt(event.deltaY < 0 ? 1.14 : 1 / 1.14, point.x, point.y);
  }

  function keyDown(event) {
    if (!state.ready || state.finished) return;
    const piece = currentPiece();
    const step = event.shiftKey ? 28 : 9;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
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
  }

  async function toggleFullscreen() {
    const target = els.canvasWrap.parentElement;
    try {
      if (!document.fullscreenElement) await target.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      toast(localizeError(`Полноэкранный режим недоступен: ${error.message}`), "error");
    }
  }

  function handleResize() {
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(() => {
      if (!state.ready) return;
      fitCanvas();
      rebuildGeometry();
      const piece = currentPiece();
      if (piece && !piece.locked) placePieceInTray(piece.index);
      centerView();
    }, 140);
  }

  function unlockSelectors() {
    els.mode.disabled = seminarContext;
    els.subject.disabled = false;
    els.country.disabled = false;
    els.difficulty.disabled = false;
  }

  els.mode.addEventListener("change", updateDependentFields);
  els.modeCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (seminarContext) return;
      if (state.started && !state.finished && state.placed > 0) {
        const proceed = window.confirm(tr("Текущая попытка будет прервана при загрузке другой карты. Продолжить?"));
        if (!proceed) return;
      }
      els.mode.value = card.dataset.puzzleMode;
      updateDependentFields();
      card.focus();
    });
  });
  els.start.addEventListener("click", () => void startGame());
  els.startDuplicates.forEach((button) => button.addEventListener("click", () => void startGame()));
  els.reset.addEventListener("click", () => {
    unlockSelectors();
    void startGame({ reuseDataset: true });
  });
  els.center.addEventListener("click", centerView);
  els.zoomIn.addEventListener("click", () => zoomAt(1.22, state.cssWidth / 2, state.mapBottom / 2));
  els.zoomOut.addEventListener("click", () => zoomAt(1 / 1.22, state.cssWidth / 2, state.mapBottom / 2));
  els.returnPiece.addEventListener("click", returnCurrentPiece);
  els.hint.addEventListener("click", showHint);
  els.fullscreen.addEventListener("click", () => void toggleFullscreen());
  els.canvas.addEventListener("pointerdown", pointerDown);
  els.canvas.addEventListener("pointermove", pointerMove);
  els.canvas.addEventListener("pointerup", pointerEnd);
  els.canvas.addEventListener("pointercancel", pointerEnd);
  els.canvas.addEventListener("wheel", wheel, { passive: false });
  els.canvas.addEventListener("keydown", keyDown);
  els.playAgain.addEventListener("click", () => {
    els.resultDialog.close();
    unlockSelectors();
    void startGame({ reuseDataset: true });
  });
  els.closeResult.addEventListener("click", () => { window.location.href = seminarContext ? "../index.html#activity/seminar-2" : "../index.html#puzzle"; });
  window.addEventListener("resize", handleResize);
  document.addEventListener("fullscreenchange", handleResize);

  updateDependentFields();
  updateUi();
  state.animationFrame = requestAnimationFrame(tick);
  };

  if (window.RUDNI18N?.ready) {
    window.RUDNI18N.ready.then(initialisePuzzle).catch(initialisePuzzle);
  } else {
    initialisePuzzle();
  }
})();
