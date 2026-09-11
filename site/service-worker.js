const CACHE_PREFIX='rudn-gmu-pages-';
const CACHE=`${CACHE_PREFIX}v1.3.0-career`;
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
  './','./index.html','./apps/puzzle.html',
  './assets/css/site.css?v=1.3.0',
  './assets/css/puzzle.css?v=1.2.2',
  './assets/js/main.js?v=1.3.0',
  './assets/js/career-course.js',
  './assets/js/backend.js?v=1.2.2',
  './assets/js/session.js?v=1.2.2',
  './assets/js/attempt-session.js?v=1.2.2',
  './assets/js/notifications.js?v=1.2.2',
  './assets/js/account.js?v=1.2.2',
  './assets/js/teacher-journal.js?v=1.2.2',
  './assets/vendor/firebase/firebase-core.js',
  './assets/vendor/firebase/firebase-storage.js',
  './assets/vendor/firebase/firebase-shared.js',
  './assets/js/grading-revisions.js?v=1.2.2',
  './assets/js/config.js?v=1.2.2',
  './assets/js/i18n.js?v=1.2.2',
  './assets/js/quiz.js?v=1.2.2',
  './assets/js/adaptive-quiz.js?v=1.2.2',
  './assets/js/access.js?v=1.2.2',
  './assets/js/puzzle-bootstrap.js?v=1.2.2',
  './assets/js/puzzle-engine.js?v=1.2.2',
  './assets/puzzle/vendor/d3.v7.9.0.min.js',
  './assets/puzzle/vendor/topojson-client.v3.1.0.min.js',
  './assets/img/rudn-logo.png','./assets/img/rudn-logo-en.png',
  './assets/img/quiz-legislative.png','./assets/img/quiz-executive.png','./assets/img/quiz-judicial.png','./assets/img/quiz-other.svg',
  './manifest.webmanifest',
  './data/course.json','./data/questions.json','./data/seminar5_variants.json',
  './data/exam_questions.json','./data/question_media.json','./data/symbol_manifest.json',
  ...CAREER_SHELL
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});

function cacheSuccessfulResponse(event,response){
  if(response.ok){
    const copy=response.clone();
    event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{}));
  }
  return response;
}
const cachedResponse=request=>caches.open(CACHE).then(cache=>cache.match(request));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const networkFirst=event.request.mode==='navigate'||/\.(?:html|css|m?js|json|geojson|topojson|webmanifest)$/i.test(url.pathname);
  if(networkFirst){
    event.respondWith(fetch(event.request).then(response=>cacheSuccessfulResponse(event,response)).catch(async()=>await cachedResponse(event.request)||Response.error()));
    return;
  }
  event.respondWith(cachedResponse(event.request).then(cached=>cached||fetch(event.request).then(response=>cacheSuccessfulResponse(event,response))));
});
