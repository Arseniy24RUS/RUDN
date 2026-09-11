/* Stage 11: explicit visual recipes. Financial 'capital' is NOT synonymous with
 * building a facility. Artwork is a read-only interpretation of the programme.
 * Prepared media metadata is reproducible from assets/services/manifest.json.
 */
(function (root) {
  'use strict';
  const G = root.GovernorGame = root.GovernorGame || {};
  if (!G.AssetMetadata && typeof require === 'function') require('./asset-metadata.js');
  const base = 'assets/illustrated/';
  const serviceBase = 'assets/services/';
  const memo = new Map();
  const existing = new Set(['school', 'clinic', 'digital', 'industry', 'barrier', 'housing', 'construction']);
  const titles = [
    ['school-delivery', 'Строительство школы', 'School construction'],
    ['clinic-delivery', 'Строительство клиники', 'Clinic construction'],
    ['digital-delivery', 'Монтаж цифрового центра', 'Digital centre construction'],
    ['industry-delivery', 'Строительство промышленного комплекса', 'Industrial construction'],
    ['barrier-delivery', 'Строительство защиты долины', 'Flood defence construction'],
    ['housing-delivery', 'Строительство жилья', 'Housing construction'],
    ['mobile-medical-unit', 'Выездная медицинская бригада', 'Mobile medical team'],
    ['school-bus', 'Школьный автобус', 'School bus service'],
    ['medical-training', 'Подготовка медицинских кадров', 'Medical staff training'],
    ['vocational-training', 'Переобучение в мастерской', 'Vocational training'],
    ['first-job-mentoring', 'Первое рабочее место', 'First-job mentoring'],
    ['modular-nursery', 'Модульный детский сад', 'Modular nursery'],
    ['family-childcare', 'Семейная группа ухода', 'Family childcare'],
    ['home-long-term-care', 'Долговременный уход на дому', 'Long-term care at home'],
    ['bridge-drainage', 'Мост и ливневые сети', 'Bridge and drainage'],
    ['river-nature-buffer', 'Природный буфер долины', 'River nature buffer'],
    ['flood-warning-service', 'Оповещение и подготовка жителей', 'Warning and preparedness'],
    ['public-service-desk', 'Очная помощь в центре услуг', 'In-person public services'],
    ['telemedicine-room', 'Телемедицинская консультация', 'Telemedicine consultation'],
    ['backup-server-room', 'Резервная цифровая инфраструктура', 'Backup digital infrastructure'],
    ['civic-tech-workshop', 'Совместная проверка цифровой услуги', 'Civic technology workshop'],
    ['commuter-transport', 'Пригородное сообщение', 'Commuter transport'],
    ['intergenerational-centre', 'Центр для разных поколений', 'Intergenerational centre'],
    ['clean-production-line', 'Модернизированная производственная линия', 'Modernised production line']
  ];
  const catalog = Object.freeze(Object.fromEntries(titles.map(([id, ru, en]) => [id,
    Object.freeze({id, title: {ru, en}, ...(G.AssetMetadata?.[id] || {}),
      reserved: id === 'digital-delivery'})])));

  // form describes the activity pictured, not legal authority, capitalisation or
  // the numerical presence of durable outputs. Those remain in ProjectState.
  function recipe(asset, form = 'service', delivery = null, contextual = false) {
    return Object.freeze({asset, form, delivery, contextual});
  }
  const recipes = Object.freeze({
    'clinics': recipe('clinic', 'building', 'clinic-delivery'),
    'mobile-units': recipe('mobile-medical-unit'),
    'train-staff': recipe('medical-training'),
    'skills-compact': recipe('vocational-training'),
    'first-job': recipe('first-job-mentoring'),
    'industrial-park': recipe('industry', 'building', 'industry-delivery'),
    'outreach': recipe('flood-warning-service'),
    'defenses': recipe('barrier', 'civil', 'barrier-delivery'),
    'infrastructure': recipe('bridge-drainage', 'civil'),
    'single-window': recipe('public-service-desk', 'equipment'),
    'cyber-first': recipe('backup-server-room', 'equipment'),
    'open-feedback': recipe('civic-tech-workshop'),
    'school-campus': recipe('school', 'building', 'school-delivery'),
    'school-bus': recipe('school-bus'),
    'second-shift': recipe('school', 'service', null, true),
    'medical-hub': recipe('clinic', 'building', 'clinic-delivery'),
    'telemedicine-network': recipe('telemedicine-room', 'equipment'),
    'municipal-health-contracts': recipe('clinic', 'service', null, true),
    'supplier-clusters': recipe('industry', 'service', null, true),
    'clean-line-modernisation': recipe('clean-production-line', 'equipment'),
    'worker-income-guarantee': recipe('vocational-training', 'service', null, true),
    'nature-buffer': recipe('river-nature-buffer', 'landscape'),
    'logistics-embankment': recipe('barrier', 'civil', 'barrier-delivery'),
    'zoning-moratorium': recipe('river-nature-buffer', 'service', null, true),
    'modular-platform': recipe('civic-tech-workshop', 'equipment'),
    'single-vendor-contract': recipe('backup-server-room', 'equipment', null, true),
    'civic-tech-lab': recipe('civic-tech-workshop'),
    'complete-neighbourhood': recipe('housing', 'building', 'housing-delivery'),
    'commuter-link': recipe('commuter-transport'),
    'housing-first': recipe('housing', 'building', 'housing-delivery'),
    'emergency-purchase': recipe('clinic', 'equipment', null, true),
    'mobilise-network': recipe('mobile-medical-unit'),
    'federal-help': recipe('clinic', 'service', null, true),
    'skills-scale': recipe('vocational-training'),
    'housing-package': recipe('housing', 'building', 'housing-delivery'),
    'startup-challenge': recipe('civic-tech-workshop', 'service', null, true),
    'evacuate': recipe('flood-warning-service', 'service', null, true),
    'rebuild-better': recipe('barrier', 'civil', 'barrier-delivery'),
    'compensation': recipe('public-service-desk', 'service', null, true),
    'incident-command': recipe('backup-server-room', 'equipment'),
    'offline-centres': recipe('public-service-desk'),
    'open-briefing': recipe('civic-tech-workshop', 'service', null, true),
    'modular-nursery': recipe('modular-nursery', 'building'),
    'licensed-childminders': recipe('family-childcare'),
    'flexible-employers': recipe('civic-tech-workshop', 'service', null, true),
    'integrated-primary-care': recipe('clinic', 'service', null, true),
    'long-term-care-network': recipe('home-long-term-care'),
    'hospital-consolidation': recipe('clinic', 'service', null, true),
    'green-manufacturing': recipe('industry', 'building', 'industry-delivery'),
    'university-industry-city': recipe('industry', 'building', 'industry-delivery'),
    'investor-rebate': recipe('industry', 'service', null, true),
    'resilient-relocation': recipe('housing', 'building', 'housing-delivery'),
    'build-back-fast': recipe('housing', 'building', 'housing-delivery'),
    'climate-insurance-pool': recipe('public-service-desk', 'service', null, true),
    'mixed-generations': recipe('intergenerational-centre', 'building'),
    'age-friendly-routes': recipe('commuter-transport', 'service', null, true),
    'family-grant': recipe('public-service-desk', 'service', null, true),
    'open-ledger': recipe('civic-tech-workshop', 'service', null, true),
    'citizens-assembly': recipe('civic-tech-workshop', 'service', null, true),
    'legacy-expo': recipe('industry', 'service', null, true)
  });
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  function spec(p) {
    if (own(recipes, p?.actionId)) return recipes[p.actionId];
    const sector = {north: 'clinic', industrial: 'industry', river: 'barrier', capital: 'digital', suburb: 'school'}[p?.districtId] || 'digital';
    return recipe(sector, 'service', null, true);
  }
  function family(p) { return spec(p).asset; }
  function structural(p) { return ['building', 'civil'].includes(spec(p).form); }
  function file(id, thumb = false) {
    if (own(catalog, id)) return serviceBase + id + (thumb ? '-thumb' : '') + '.webp';
    return base + (existing.has(id) ? id : 'digital') + (thumb ? '-thumb' : '') + '.webp';
  }
  function describe(id, thumb = false) {
    const m = own(catalog, id) ? catalog[id] : {width: 768, height: 768, maxDisplayWidth: 432, qualityTier: 'large'};
    return {id, src: file(id, thumb), width: thumb ? 256 : m.width, height: thumb ? 256 : m.height,
      maxDisplayWidth: m.maxDisplayWidth, qualityTier: m.qualityTier, title: m.title};
  }
  function image(p, {thumb = false, phase = 'current'} = {}) {
    const r = spec(p), inDelivery = p?.status === 'delivery' && phase !== 'planned';
    const id = inDelivery && r.delivery ? r.delivery : r.asset;
    // Without a dedicated unfinished drawing we show a clearly labelled target
    // view. It is never presented as an actually opened service or building.
    return {...describe(id, thumb), family: r.asset, form: r.form, site: structural(p),
      contextual: r.contextual, direct: !r.contextual, ended: phase === 'current' && p?.status === 'completed',
      targetView: inDelivery && !r.delivery, inDelivery, deliveryArtwork: inDelivery && !!r.delivery,
      approximatePair: !!r.delivery, phase, icon: p?.icon || null};
  }
  function note(im, lang = 'ru') {
    if (im.contextual) return lang === 'en'
      ? 'Thematic illustration, not a literal output of this measure.'
      : 'Тематический образ: он не означает, что мера создаёт именно этот объект.';
    if (im.targetView) return lang === 'en'
      ? 'Intended form after launch. Preparation is still in progress.'
      : 'Планируемый вид после запуска. Сейчас ещё идёт подготовка.';
    return lang === 'en'
      ? 'Representative programme illustration, not a count of facilities or people.'
      : 'Условный образ программы, не количество объектов или обслуженных жителей.';
  }
  function topic(id) {
    const map = {'rural-healthcare': 'mobile-medical-unit', 'school-neighbourhood': 'school',
      'digital-services': 'public-service-desk', 'youth-employment': 'first-job-mentoring',
      'flood-preparedness': 'flood-warning-service'};
    return own(map, id) ? file(map[id]) : base + 'region.webp';
  }
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  function tag(im, {className = '', alt = '', lazy = true} = {}) {
    return `<img class="${safe(className)}" src="${safe(im.src)}" width="${im.width}" height="${im.height}" style="--art-limit:${im.maxDisplayWidth}px" data-art-id="${safe(im.id)}" alt="${safe(alt)}" ${lazy ? 'loading="lazy"' : 'loading="eager"'} decoding="async">`;
  }
  function preload(src) {
    if (memo.has(src)) return memo.get(src).promise;
    const entry = {image: null, failed: false, promise: null};
    memo.set(src, entry);
    entry.promise = new Promise(resolve => {
      if (typeof root.Image !== 'function') { entry.failed = true; resolve(null); return; }
      const im = new root.Image(); im.decoding = 'async'; im.crossOrigin = 'anonymous';
      let settled = false;
      const finish = success => {
        if (settled) return; settled = true; clearTimeout(timer);
        entry.image = success ? im : null; entry.failed = !success; resolve(entry.image);
      };
      const timer = setTimeout(() => finish(false), 10000);
      im.onload = () => finish(true); im.onerror = () => finish(false); im.src = src;
    });
    return entry.promise;
  }
  // Fail to a neutral symbol, never to a fictitious replacement facility.
  if (root.document) root.document.addEventListener('error', event => {
    const im = event.target;
    if (im?.tagName !== 'IMG' || !im.dataset.artId || im.dataset.artFallback) return;
    im.dataset.artFallback = 'true'; im.classList.add('art-unavailable');
    im.src = serviceBase + 'unavailable.svg';
    im.alt = root.document.documentElement.lang === 'en' ? 'Illustration unavailable' : 'Иллюстрация недоступна';
  }, true);
  if (G.DATA?.ui) {
    G.DATA.ui.ru.demoBadge = '0.11 · Объекты и услуги';
    G.DATA.ui.en.demoBadge = '0.11 · Buildings and services';
  }
  G.IllustratedAssets = {VERSION: '2.0.0', base, serviceBase, catalog, recipes, spec, family, structural,
    image, describe, note, file, tag, topic, preload,
    peek: src => memo.get(src)?.image || null, failed: src => !!memo.get(src)?.failed,
    prepare: () => preload(base + 'region.webp')};
  if (typeof module !== 'undefined') module.exports = G.IllustratedAssets;
})(typeof window !== 'undefined' ? window : globalThis);
