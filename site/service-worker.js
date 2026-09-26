const SCOPE=new URL(self.registration.scope);
// CacheStorage is shared by every application on this origin. Own only this scope.
const CACHE_PREFIX=`rudn-gmu-pages:${encodeURIComponent(SCOPE.href)}:`;
const CACHE=`${CACHE_PREFIX}v1.3.8-map-startup-recovery`;
const CLIENT_CACHE=`${CACHE_PREFIX}client-bindings`;
const ACTIVE_RELEASE=new URL('.release-clients/active',SCOPE).href;
const clientBindings=new Map();
const isReleaseCache=name=>name!==CLIENT_CACHE&&name.startsWith(CACHE_PREFIX);
const releaseVersion=name=>name.slice(CACHE_PREFIX.length).match(/^v(\d+\.\d+\.\d+)(?:-|$)/)?.[1];
const LEGACY_CACHES=new Set(['rudn-gmu-pages-v1.2.2','rudn-gmu-pages-v1.3.0-career']);
const CAREER_SHELL=[
  './apps/career/entry.mjs',
  './apps/career/runtime.bundle.mjs',
  './apps/career/surface.html',
  './apps/career/module.css',
  './apps/career/assets/fonts/noto-sans-sc.woff2',
  './apps/career/locales/en.json',
  './apps/career/locales/zh-Hans.json',
  './apps/career/data/scales.json',
  './apps/career/data/questions.json',
  './apps/career/data/sectors.json',
  './apps/career/data/conditions.json',
  './apps/career/data/tracks.json',
  './apps/career/data/authorities.json',
  './apps/career/data/model-manifest.json',
  './apps/career/data/agency-studies.json',
  './apps/career/data/career-framework.json',
  './apps/career/data/career-resources.json',
  './apps/career/data/competencies.json',
  './apps/career/data/entry-routes.json',
  './apps/career/data/hierarchy.json',
  './apps/career/data/path-rubric.json',
  './apps/career/data/public-service.json',
  './apps/career/data/topics.json',
  './apps/career/data/vacancies/gossluzhba.json',
  './apps/career/data/vacancies/sync-status.json',
  './apps/career/docs/METHODOLOGY-STAGE8.md',
  './apps/career/docs/AUDIT-1.0.md',
  './apps/career/docs/TEACHER-GUIDE-STAGE8.md',
  './apps/career/reports/stage8/independent-audit.json'
];
const SHELL=[
  './apps/reception/index.html',
  './apps/reception/js/app.js',
  './apps/reception/js/assignment.js',
  './apps/reception/js/boot.js',
  './apps/reception/js/case-time.js',
  './apps/reception/js/content-library.js',
  './apps/reception/content/manifest.js',
  './apps/reception/js/catalog.js',
  './apps/reception/js/characters.js',
  './apps/reception/js/confirm.js',
  './apps/reception/js/documents.js',
  './apps/reception/js/engine.js',
  './apps/reception/js/evidence.js',
  './apps/reception/js/evidence-locale-aliases.js',
  './apps/reception/localization/runtime.js',
  './apps/reception/localization/presentation.js',
  './apps/reception/localization/catalog-loader.js',
  './apps/reception/localization/validation.js',
  './apps/reception/localization/ui.js',
  './apps/reception/localization/compiled/evidence-aliases.js',
  './apps/reception/js/graphics-data.js',
  './apps/reception/js/icons.js',
  './apps/reception/js/legal-reference.js',
  './apps/reception/js/pilot.js',
  './apps/reception/js/policy.js',
  './apps/reception/js/settings.js',
  './apps/reception/js/source-lifecycle.js',
  './apps/reception/js/source-monitor-ui.js',
  './apps/reception/js/source-policy.js',
  './apps/reception/js/standalone.js',
  './apps/reception/js/storage.js',
  './apps/reception/style.css',
  './assets/data/calendars/current.json',
  './assets/js/calendar-bundled.js',
  './assets/js/calendar-consultant.js',
  './assets/js/calendar-model.js',
  './assets/js/calendar-providers.js',
  './assets/js/calendar-repository.js',
  './assets/js/legal-calendar.js',
  './apps/reception/js/app.js?v=1.0.1',
  './apps/reception/style.css?v=1.0.1',
  './apps/reception/platform.css?v=1.0.1',
  './','./index.html','./apps/puzzle.html',
  './assets/css/site.css?v=1.3.8',
  './assets/css/puzzle.css?v=1.3.8',
  './assets/js/main.js?v=1.3.8',
  './assets/js/games-catalog.js?v=1.3.8',
  './assets/js/career-course.js',
  './assets/js/durable-store.js',
  './assets/js/student-identity.js',
  './assets/js/checkpoint-sync.js',
  './assets/js/firebase-rest.js',
  './assets/js/form-draft.js',
  './assets/js/governor-report-locale.js',
  './assets/js/backend.js?v=1.3.8',
  './assets/js/session.js?v=1.3.8',
  './assets/js/attempt-session.js?v=1.3.8',
  './assets/js/notifications.js?v=1.3.8',
  './assets/js/account.js?v=1.3.8',
  './assets/js/teacher-journal.js?v=1.3.8',
  './assets/vendor/firebase/firebase-core.js',
  './assets/vendor/firebase/firebase-storage.js',
  './assets/vendor/firebase/firebase-shared.js',
  './assets/js/grading-revisions.js?v=1.3.8',
  './assets/js/config.js?v=1.3.8',
  './assets/js/i18n.js?v=1.3.8',
  './assets/js/quiz.js?v=1.3.8',
  './assets/js/adaptive-quiz.js?v=1.3.8',
  './assets/js/access.js?v=1.3.8',
  './assets/js/puzzle-bootstrap.js?v=1.3.8',
  './assets/js/puzzle-map-loader.js?v=1.3.8',
  './assets/js/puzzle-engine.js?v=1.3.8',
  './assets/js/puzzle-render-geometry.js?v=1.3.8',
  './assets/js/puzzle-raster-worker.js?v=1.3.8',
  './assets/js/puzzle-leaderboard.js?v=1.3.8',
  './assets/vendor/xlsx/xlsx-0.20.3.full.min.js',
  './assets/js/puzzle-storage.js?v=1.3.8',
  './assets/puzzle/vendor/d3.v7.9.0.min.js',
  './assets/puzzle/vendor/topojson-client.v3.1.0.min.js',
  './assets/img/rudn-logo.png','./assets/img/rudn-logo-en.png',
  './assets/img/quiz-legislative.png','./assets/img/quiz-executive.png','./assets/img/quiz-judicial.png','./assets/img/quiz-other.svg',
  './assets/course/previews/seminar_07_simulator.jpg',
  './manifest.webmanifest',
  './data/course.json','./data/questions.json','./data/seminar5_variants.json',
  './data/exam_questions.json','./data/question_media.json','./data/symbol_manifest.json'
];
// Native simulator runtime and artwork. Keep this list in sync with the module;
// scripts/test_governor_service_worker.mjs checks every shipped runtime file.
const GOVERNOR_ASSETS=[
  './apps/governor/locales/zh-Hans.js',
  './apps/governor/src/i18n.js',
  './apps/governor/src/i18n-shell.js',
  "./apps/governor/",
  "./apps/governor/agenda.css",
  "./apps/governor/assets/advisors/anna-berezina.png",
  "./apps/governor/assets/advisors/anna-resident.png",
  "./apps/governor/assets/advisors/denis-kovalev.png",
  "./apps/governor/assets/advisors/denis-resident.png",
  "./apps/governor/assets/advisors/elena.png",
  "./apps/governor/assets/advisors/ilya.png",
  "./apps/governor/assets/advisors/mikhail-resident.png",
  "./apps/governor/assets/advisors/mira.png",
  "./apps/governor/assets/advisors/olga-resident.png",
  "./apps/governor/assets/advisors/valentina-resident.png",
  "./apps/governor/assets/advisors/viktor.png",
  "./apps/governor/assets/art/digital-procurement.webp",
  "./apps/governor/assets/art/flood-defenses.webp",
  "./apps/governor/assets/art/flood-event.webp",
  "./apps/governor/assets/art/flood-infrastructure.webp",
  "./apps/governor/assets/art/flood-outreach.webp",
  "./apps/governor/assets/art/health-clinics.webp",
  "./apps/governor/assets/art/health-delivery.webp",
  "./apps/governor/assets/art/health-legacy.webp",
  "./apps/governor/assets/art/health-mobile.webp",
  "./apps/governor/assets/art/health-training.webp",
  "./apps/governor/assets/art/industrial-green.webp",
  "./apps/governor/assets/art/industrial-legacy.webp",
  "./apps/governor/assets/art/industrial-transition.webp",
  "./apps/governor/assets/art/public-audit.webp",
  "./apps/governor/assets/art/region-map.webp",
  "./apps/governor/assets/art/river-land-use.webp",
  "./apps/governor/assets/art/river-legacy.webp",
  "./apps/governor/assets/art/river-nature.webp",
  "./apps/governor/assets/art/storm-event.webp",
  "./apps/governor/assets/art/youth-event.webp",
  "./apps/governor/assets/asset-plan-status.json",
  "./apps/governor/assets/characters/anna-berezina-avatar.webp",
  "./apps/governor/assets/characters/anna-berezina.webp",
  "./apps/governor/assets/characters/anna-resident-avatar.webp",
  "./apps/governor/assets/characters/anna-resident.webp",
  "./apps/governor/assets/characters/denis-kovalev-avatar.webp",
  "./apps/governor/assets/characters/denis-kovalev.webp",
  "./apps/governor/assets/characters/denis-resident-avatar.webp",
  "./apps/governor/assets/characters/denis-resident.webp",
  "./apps/governor/assets/characters/elena-avatar.webp",
  "./apps/governor/assets/characters/elena.webp",
  "./apps/governor/assets/characters/ilya-avatar.webp",
  "./apps/governor/assets/characters/ilya.webp",
  "./apps/governor/assets/characters/manifest.json",
  "./apps/governor/assets/characters/mikhail-resident-avatar.webp",
  "./apps/governor/assets/characters/mikhail-resident.webp",
  "./apps/governor/assets/characters/mira-avatar.webp",
  "./apps/governor/assets/characters/mira.webp",
  "./apps/governor/assets/characters/olga-resident-avatar.webp",
  "./apps/governor/assets/characters/olga-resident.webp",
  "./apps/governor/assets/characters/valentina-resident-avatar.webp",
  "./apps/governor/assets/characters/valentina-resident.webp",
  "./apps/governor/assets/characters/viktor-avatar.webp",
  "./apps/governor/assets/characters/viktor.webp",
  "./apps/governor/assets/icon-192.png",
  "./apps/governor/assets/icon-512.png",
  "./apps/governor/assets/illustrated/barrier-thumb.webp",
  "./apps/governor/assets/illustrated/barrier.webp",
  "./apps/governor/assets/illustrated/clinic-thumb.webp",
  "./apps/governor/assets/illustrated/clinic.webp",
  "./apps/governor/assets/illustrated/construction-thumb.webp",
  "./apps/governor/assets/illustrated/construction.webp",
  "./apps/governor/assets/illustrated/digital-thumb.webp",
  "./apps/governor/assets/illustrated/digital.webp",
  "./apps/governor/assets/illustrated/housing-thumb.webp",
  "./apps/governor/assets/illustrated/housing.webp",
  "./apps/governor/assets/illustrated/industry-thumb.webp",
  "./apps/governor/assets/illustrated/industry.webp",
  "./apps/governor/assets/illustrated/manifest.json",
  "./apps/governor/assets/illustrated/region.webp",
  "./apps/governor/assets/illustrated/school-thumb.webp",
  "./apps/governor/assets/illustrated/school.webp",
  "./apps/governor/assets/illustrated/stage-decision-thumb.webp",
  "./apps/governor/assets/illustrated/stage-decision.webp",
  "./apps/governor/assets/illustrated/stage-delivery-thumb.webp",
  "./apps/governor/assets/illustrated/stage-delivery.webp",
  "./apps/governor/assets/illustrated/stage-opening-thumb.webp",
  "./apps/governor/assets/illustrated/stage-opening.webp",
  "./apps/governor/assets/illustrated/stage-operation-thumb.webp",
  "./apps/governor/assets/illustrated/stage-operation.webp",
  "./apps/governor/assets/letters/anna-letter-02-avatar.webp",
  "./apps/governor/assets/letters/anna-letter-02.webp",
  "./apps/governor/assets/letters/anna-letter-03-avatar.webp",
  "./apps/governor/assets/letters/anna-letter-03.webp",
  "./apps/governor/assets/letters/denis-letter-02-avatar.webp",
  "./apps/governor/assets/letters/denis-letter-02.webp",
  "./apps/governor/assets/letters/denis-letter-03-avatar.webp",
  "./apps/governor/assets/letters/denis-letter-03.webp",
  "./apps/governor/assets/letters/manifest.json",
  "./apps/governor/assets/letters/mikhail-letter-02-avatar.webp",
  "./apps/governor/assets/letters/mikhail-letter-02.webp",
  "./apps/governor/assets/letters/mikhail-letter-03-avatar.webp",
  "./apps/governor/assets/letters/mikhail-letter-03.webp",
  "./apps/governor/assets/letters/olga-letter-02-avatar.webp",
  "./apps/governor/assets/letters/olga-letter-02.webp",
  "./apps/governor/assets/letters/olga-letter-03-avatar.webp",
  "./apps/governor/assets/letters/olga-letter-03.webp",
  "./apps/governor/assets/letters/valentina-letter-02-avatar.webp",
  "./apps/governor/assets/letters/valentina-letter-02.webp",
  "./apps/governor/assets/letters/valentina-letter-03-avatar.webp",
  "./apps/governor/assets/letters/valentina-letter-03.webp",
  "./apps/governor/assets/rudn-logo.png",
  "./apps/governor/assets/rudn-logo.webp",
  "./apps/governor/assets/scenes/capital-service-scene.webp",
  "./apps/governor/assets/scenes/digital-outage-scene.webp",
  "./apps/governor/assets/scenes/flood-response-scene.webp",
  "./apps/governor/assets/scenes/governor-office.webp",
  "./apps/governor/assets/scenes/industrial-mentoring-scene.webp",
  "./apps/governor/assets/scenes/negotiation-room.webp",
  "./apps/governor/assets/scenes/north-access-scene.webp",
  "./apps/governor/assets/scenes/public-meeting-room.webp",
  "./apps/governor/assets/scenes/respiratory-outbreak-scene.webp",
  "./apps/governor/assets/scenes/river-before-flood-scene.webp",
  "./apps/governor/assets/scenes/suburb-school-scene.webp",
  "./apps/governor/assets/scenes/youth-outflow-scene.webp",
  "./apps/governor/assets/services/backup-server-room-thumb.webp",
  "./apps/governor/assets/services/backup-server-room.webp",
  "./apps/governor/assets/services/barrier-delivery-thumb.webp",
  "./apps/governor/assets/services/barrier-delivery.webp",
  "./apps/governor/assets/services/bridge-drainage-thumb.webp",
  "./apps/governor/assets/services/bridge-drainage.webp",
  "./apps/governor/assets/services/civic-tech-workshop-thumb.webp",
  "./apps/governor/assets/services/civic-tech-workshop.webp",
  "./apps/governor/assets/services/clean-production-line-thumb.webp",
  "./apps/governor/assets/services/clean-production-line.webp",
  "./apps/governor/assets/services/clinic-delivery-thumb.webp",
  "./apps/governor/assets/services/clinic-delivery.webp",
  "./apps/governor/assets/services/commuter-transport-thumb.webp",
  "./apps/governor/assets/services/commuter-transport.webp",
  "./apps/governor/assets/services/digital-delivery-thumb.webp",
  "./apps/governor/assets/services/digital-delivery.webp",
  "./apps/governor/assets/services/family-childcare-thumb.webp",
  "./apps/governor/assets/services/family-childcare.webp",
  "./apps/governor/assets/services/first-job-mentoring-thumb.webp",
  "./apps/governor/assets/services/first-job-mentoring.webp",
  "./apps/governor/assets/services/flood-warning-service-thumb.webp",
  "./apps/governor/assets/services/flood-warning-service.webp",
  "./apps/governor/assets/services/home-long-term-care-thumb.webp",
  "./apps/governor/assets/services/home-long-term-care.webp",
  "./apps/governor/assets/services/housing-delivery-thumb.webp",
  "./apps/governor/assets/services/housing-delivery.webp",
  "./apps/governor/assets/services/industry-delivery-thumb.webp",
  "./apps/governor/assets/services/industry-delivery.webp",
  "./apps/governor/assets/services/intergenerational-centre-thumb.webp",
  "./apps/governor/assets/services/intergenerational-centre.webp",
  "./apps/governor/assets/services/manifest.json",
  "./apps/governor/assets/services/medical-training-thumb.webp",
  "./apps/governor/assets/services/medical-training.webp",
  "./apps/governor/assets/services/mobile-medical-unit-thumb.webp",
  "./apps/governor/assets/services/mobile-medical-unit.webp",
  "./apps/governor/assets/services/modular-nursery-thumb.webp",
  "./apps/governor/assets/services/modular-nursery.webp",
  "./apps/governor/assets/services/public-service-desk-thumb.webp",
  "./apps/governor/assets/services/public-service-desk.webp",
  "./apps/governor/assets/services/river-nature-buffer-thumb.webp",
  "./apps/governor/assets/services/river-nature-buffer.webp",
  "./apps/governor/assets/services/school-bus-thumb.webp",
  "./apps/governor/assets/services/school-bus.webp",
  "./apps/governor/assets/services/school-delivery-thumb.webp",
  "./apps/governor/assets/services/school-delivery.webp",
  "./apps/governor/assets/services/telemedicine-room-thumb.webp",
  "./apps/governor/assets/services/telemedicine-room.webp",
  "./apps/governor/assets/services/unavailable.svg",
  "./apps/governor/assets/services/vocational-training-thumb.webp",
  "./apps/governor/assets/services/vocational-training.webp",
  "./apps/governor/assets/world/atlas.webp",
  "./apps/governor/assets/world/barrier.webp",
  "./apps/governor/assets/world/care.webp",
  "./apps/governor/assets/world/clinic.webp",
  "./apps/governor/assets/world/digital.webp",
  "./apps/governor/assets/world/greenIndustry.webp",
  "./apps/governor/assets/world/housing.webp",
  "./apps/governor/assets/world/industry.webp",
  "./apps/governor/assets/world/nature.webp",
  "./apps/governor/assets/world/school.webp",
  "./apps/governor/assets/world/service.webp",
  "./apps/governor/assets/world/training.webp",
  "./apps/governor/assets/world/transport.webp",
  "./apps/governor/budget-review.css",
  "./apps/governor/consolidation.css",
  "./apps/governor/delivery.css",
  "./apps/governor/governance.css",
  "./apps/governor/illustrated.css",
  "./apps/governor/index.html",
  "./apps/governor/platform-bridge.js",
  "./apps/governor/platform-contract.js",
  "./apps/governor/platform.css",
  "./apps/governor/recovery.css",
  "./apps/governor/release.css",
  "./apps/governor/src/agenda-ui.js",
  "./apps/governor/src/agenda.js",
  "./apps/governor/src/app.js",
  "./apps/governor/src/asset-metadata.js",
  "./apps/governor/src/budget-review-ui.js",
  "./apps/governor/src/budget-review.js",
  "./apps/governor/src/consolidation-data.js",
  "./apps/governor/src/consolidation-ui.js",
  "./apps/governor/src/delivery-desk.js",
  "./apps/governor/src/delivery-ui.js",
  "./apps/governor/src/engine.js",
  "./apps/governor/src/finance.js",
  "./apps/governor/src/game-data.js",
  "./apps/governor/src/governance-data.js",
  "./apps/governor/src/governance-ui.js",
  "./apps/governor/src/governance.js",
  "./apps/governor/src/icons.js",
  "./apps/governor/src/illustrated-assets.js",
  "./apps/governor/src/illustrated-world.js",
  "./apps/governor/src/learning.js",
  "./apps/governor/src/population-ui.js",
  "./apps/governor/src/population.js",
  "./apps/governor/src/presentation.js",
  "./apps/governor/src/project-presentation.js",
  "./apps/governor/src/project-state.js",
  "./apps/governor/src/project-ui.js",
  "./apps/governor/src/recovery-ui.js",
  "./apps/governor/src/recovery.js",
  "./apps/governor/src/release-ui.js",
  "./apps/governor/src/save-system.js",
  "./apps/governor/src/stage3-data.js",
  "./apps/governor/src/stage4-data.js",
  "./apps/governor/src/state-integrity.js",
  "./apps/governor/src/stories-data.js",
  "./apps/governor/src/stories-ui.js",
  "./apps/governor/src/stories.js",
  "./apps/governor/src/world-geometry.js",
  "./apps/governor/src/world-model.js",
  "./apps/governor/src/world-outcomes.js",
  "./apps/governor/src/world-ui.js",
  "./apps/governor/stories.css",
  "./apps/governor/styles.css",
  "./apps/governor/world.css"
];
const PUZZLE_SHELL=[
  './apps/puzzle.html','./assets/css/puzzle.css?v=1.3.8',
  './assets/js/puzzle-bootstrap.js?v=1.3.8','./assets/js/puzzle-engine.js?v=1.3.8',
  './assets/js/puzzle-map-loader.js?v=1.3.8',
  './assets/js/puzzle-render-geometry.js?v=1.3.8',
  './assets/js/puzzle-raster-worker.js?v=1.3.8',
  './assets/js/puzzle-leaderboard.js?v=1.3.8',
  './assets/vendor/xlsx/xlsx-0.20.3.full.min.js',
  './assets/js/puzzle-storage.js?v=1.3.8','./assets/js/durable-store.js?v=1.3.8',
  './assets/puzzle/vendor/d3.v7.9.0.min.js','./assets/puzzle/vendor/topojson-client.v3.1.0.min.js',
  './assets/puzzle/data/municipal/catalog.json','./assets/puzzle/data/adm1/manifest.json',
  './assets/puzzle/data/geoboundaries_adm1_catalog.json',
  './data/legacy-en.json','./data/legacy-zh.json'
];
const PRECACHE=[...SHELL,...CAREER_SHELL,...GOVERNOR_ASSETS];
// The puzzle entry and catalogs must survive the first offline navigation after
// an update. Its scripts already belong to the platform shell; prepare the whole
// small entry pack before activation so a new release cannot strand a saved game.
// Other optional modules remain lazy.
const CORE_SHELL=SHELL.filter(path=>!/^\.\/apps\//.test(path)&&!path.includes('/calendars/')&&!path.includes('/calendar-')&&!path.includes('/legal-calendar')&&!path.includes('/previews/')&&!path.includes('firebase-storage'));

async function fetchWithDeadline(request,timeout=12000){
  const controller=new AbortController();
  let timer;
  try{
    return await Promise.race([
      fetch(request,{signal:controller.signal}),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('network/timeout'))},timeout)})
    ]);
  }finally{clearTimeout(timer)}
}

async function prepareResources(paths,{required=false,cacheName=CACHE}={}){
  const cache=await caches.open(cacheName);const pending=[...new Set(paths)];let failed=0;
  await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
    while(pending.length){
      const url=new URL(pending.shift(),SCOPE);
      if(url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname)){failed++;continue}
      try{
        if(!required&&await cache.match(url.href))continue;
        // The deployed URL no longer supplies missing files from an older release.
        if(cacheName!==CACHE)throw new Error('release/resource-unavailable');
        const request=new Request(url,{cache:'reload'}),response=await fetchWithDeadline(request);
        if(!response.ok)throw new Error('resource/unavailable');
        await cache.put(request,response);
      }catch(error){failed++;if(required)throw error}
    }
  }));
  return {ready:failed===0,failed};
}

self.addEventListener('install',event=>{
  event.waitUntil(
    prepareResources([...CORE_SHELL,...PUZZLE_SHELL],{required:true})
      .then(()=>self.skipWaiting())
  );
});
self.addEventListener('activate',event=>event.waitUntil(activateRelease()));

function inScopeClient(client){
  if(!client?.id||!client.url)return false;
  try{const url=new URL(client.url);return url.origin===SCOPE.origin&&url.pathname.startsWith(SCOPE.pathname)}catch{return false}
}
const clientKey=id=>new URL(`.release-clients/client/${encodeURIComponent(id)}`,SCOPE).href;
async function clientRelease(id){
  if(!id)return null;
  if(clientBindings.has(id))return clientBindings.get(id);
  try{
    const response=await (await caches.open(CLIENT_CACHE)).match(clientKey(id));
    const name=response&&await response.text();
    if(name&&isReleaseCache(name)){clientBindings.set(id,name);return name}
  }catch{}
  return null;
}
async function bindClient(id,name){
  if(!id)return;
  clientBindings.set(id,name);
  try{await (await caches.open(CLIENT_CACHE)).put(clientKey(id),new Response(name))}catch{}
}
async function activateRelease(){
  const clients=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(inScopeClient);
  const names=await caches.keys();
  const metadata=await caches.open(CLIENT_CACHE);
  const prior=await metadata.match(ACTIVE_RELEASE);
  const active=prior&&await prior.text();
  const previous=names.includes(active)&&isReleaseCache(active)?active:names.filter(name=>name!==CACHE&&isReleaseCache(name)).at(-1)||CACHE;
  // Migrate tabs opened before the release handshake existed; later workers read
  // their exact persisted binding instead of guessing from cache insertion order.
  await Promise.all(clients.map(async client=>{if(!await clientRelease(client.id))await bindClient(client.id,previous)}));
  const used=new Set([CACHE,...await Promise.all(clients.map(client=>clientRelease(client.id)))]);
  await Promise.all(names.filter(name=>isReleaseCache(name)?!used.has(name):!clients.length&&LEGACY_CACHES.has(name)).map(name=>caches.delete(name)));
  const liveKeys=new Set(clients.map(client=>clientKey(client.id)));
  for(const request of await metadata.keys())if(request.url!==ACTIVE_RELEASE&&!liveKeys.has(request.url))await metadata.delete(request);
  await metadata.put(ACTIVE_RELEASE,new Response(CACHE));
  await self.clients.claim();
}

function puzzleRuntimeCacheKey(request){
  const url=new URL(request.url),path=url.pathname.slice(SCOPE.pathname.length);
  // The native loader uses this counter solely to escape browser coalescing of
  // an abandoned script request. It must still read/write the exact bound
  // release's canonical asset; preserve v and every other query parameter.
  if(['assets/js/puzzle-engine.js','assets/js/puzzle-render-geometry.js','assets/puzzle/vendor/d3.v7.9.0.min.js','assets/puzzle/vendor/topojson-client.v3.1.0.min.js'].includes(path)&&url.searchParams.getAll('puzzle_retry').length===1&&/^\d{1,6}$/.test(url.searchParams.get('puzzle_retry'))){url.searchParams.delete('puzzle_retry');return url.href;}
  return request;
}
async function matchOwnCache(cache,request){
  const cached=await cache.match(puzzleRuntimeCacheKey(request));
  if(cached)return cached;
  // Navigation parameters do not change these static HTML entry points.
  if(request.mode==='navigate'){
    const url=new URL(request.url);
    url.search='';
    url.hash='';
    const clean=await cache.match(url.href);if(clean)return clean;
  }
}

async function unavailableRelease(clientId){
  const client=clientId&&await self.clients.get(clientId);
  if(inScopeClient(client))client.postMessage({type:'RELEASE_RESOURCE_UNAVAILABLE'});
  return Response.error();
}
async function optionalGeometryCache(action){
  let timer;
  try{
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(null),750)})
    ]);
  }catch{return null}
  finally{clearTimeout(timer)}
}
async function serveCurrentRussiaGeometry(event){
  const request=event.request;
  let cache;
  // A broken browser cache must not hide a healthy same-origin map response.
  // This is only the current release's optional geometry, never its app shell.
  const cached=await optionalGeometryCache(async()=>{
    cache=await caches.open(CACHE);
    return cache.match(request);
  });
  if(cached)return cached;
  try{
    const response=await fetchWithDeadline(request);
    if(response.ok){
      const copy=response.clone();
      event.waitUntil(optionalGeometryCache(async()=>{
        const target=cache||await caches.open(CACHE);
        await target.put(request,copy);
      }));
    }
    return response;
  }catch{return Response.error()}
}
async function serveRequest(event,networkFirst){
  const request=event.request;
  // A navigation creates a new document. Its HTML and imports use the installed
  // release even if a deployment is already replacing files on the server.
  const navigation=request.mode==='navigate';
  if(navigation)await bindClient(event.resultingClientId,CACHE);
  const cacheName=navigation?CACHE:await clientRelease(event.clientId)||CACHE;
  if(!navigation&&event.clientId&&!await clientRelease(event.clientId))await bindClient(event.clientId,cacheName);
  const url=new URL(request.url),version=url.searchParams.get('v');
  if(version&&/^assets\/js\//.test(url.pathname.slice(SCOPE.pathname.length))&&releaseVersion(cacheName)&&version!==releaseVersion(cacheName))return unavailableRelease(event.clientId);
  if(!navigation&&cacheName===CACHE&&/^assets\/puzzle\/data\/russia_subjects_89\.(?:topojson|compact\.json)$/.test(url.pathname.slice(SCOPE.pathname.length)))return serveCurrentRussiaGeometry(event);
  const cache=await caches.open(cacheName);
  // This daily CI feed is mutable independently of the application release.
  const mutableCalendar=cacheName===CACHE&&url.pathname===new URL('assets/data/calendars/current.json',SCOPE).pathname;
  if(!mutableCalendar&&(navigation||event.clientId||!networkFirst)){
    const cached=await matchOwnCache(cache,request);
    if(cached)return cached;
  }
  if(cacheName!==CACHE)return unavailableRelease(event.clientId);
  try{
    const available=await matchOwnCache(cache,request);
    const response=await fetchWithDeadline(request,available?1800:12000);
    if(response.ok){
      // An unavailable/full cache must not turn a successful request into an error.
      try{await cache.put(puzzleRuntimeCacheKey(request),response.clone())}catch{}
      return response;
    }
    // A failed deployment or temporary server error must not poison offline copies.
    return await matchOwnCache(cache,request)||response;
  }catch{
    return await matchOwnCache(cache,request)||Response.error();
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))return;
  const networkFirst=event.request.mode==='navigate'||/\.(?:html|css|m?js|json|geojson|topojson|webmanifest)$/i.test(url.pathname);
  event.respondWith(serveRequest(event,networkFirst));
});

self.addEventListener('message',event=>{
  if(event.data?.type==='BIND_RELEASE'){
    if(!inScopeClient(event.source)||!/^\d+\.\d+\.\d+$/.test(event.data.release))return;
    event.waitUntil((async()=>{
      const entry=new URL(`assets/js/main.js?v=${event.data.release}`,SCOPE).href;
      const bound=await clientRelease(event.source.id);
      if(bound&&releaseVersion(bound)===event.data.release&&await (await caches.open(bound)).match(entry)){
        event.source.postMessage({type:'RELEASE_BOUND',release:event.data.release});return;
      }
      const names=(await caches.keys()).filter(name=>isReleaseCache(name)&&releaseVersion(name)===event.data.release).reverse();
      for(const name of names){
        if(await (await caches.open(name)).match(entry)){
          await bindClient(event.source.id,name);
          event.source.postMessage({type:'RELEASE_BOUND',release:event.data.release});return;
        }
      }
      // Missing/evicted historical caches cannot be replaced with current code.
      await bindClient(event.source.id,`${CACHE_PREFIX}unavailable-v${event.data.release}`);
      event.source.postMessage({type:'RELEASE_RESOURCE_UNAVAILABLE'});
    })());
    return;
  }
  if(event.data?.type!=='PREPARE_MODULE')return;
  const module=event.data.module;
  const paths=module==='puzzle'?PUZZLE_SHELL:module==='governor'?GOVERNOR_ASSETS:module==='career'?CAREER_SHELL:module==='reception'?SHELL.filter(path=>path.includes('/reception/')||path.includes('/calendar')||path.includes('/legal-calendar')):[];
  const extras=Array.isArray(event.data.urls)?event.data.urls.slice(0,250).filter(url=>typeof url==='string'):[];
  event.waitUntil((async()=>{
    const cacheName=inScopeClient(event.source)?await clientRelease(event.source.id)||CACHE:CACHE;
    const result=await prepareResources([...paths,...extras],{cacheName});
    event.source?.postMessage({type:'MODULE_CACHE_STATUS',module,...result});
    if(!result.ready&&cacheName!==CACHE)event.source?.postMessage({type:'RELEASE_RESOURCE_UNAVAILABLE'});
  })());
});
