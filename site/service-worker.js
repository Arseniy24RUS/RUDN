const CACHE='rudn-gmu-pages-v1.2.2';
const SHELL=[
  './','./index.html','./apps/puzzle.html',
  './assets/css/site.css?v=1.2.2',
  './assets/css/puzzle.css?v=1.2.2',
  './assets/js/main.js?v=1.2.2',
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
  './data/exam_questions.json','./data/question_media.json','./data/symbol_manifest.json'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const networkFirst=event.request.mode==='navigate'||/\.(?:html|css|js|json|geojson|topojson|webmanifest)$/i.test(url.pathname);
  if(networkFirst){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response})));
});
