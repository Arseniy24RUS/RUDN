const CACHE='rudn-gmu-pages-v1.1.6';
const SHELL=[
  './','./index.html',
  './assets/css/site.css?v=1.1.6',
  './assets/js/main.js?v=1.1.6',
  './assets/js/backend.js?v=1.1.6',
  './assets/js/config.js?v=1.1.6',
  './assets/js/i18n.js?v=1.1.6',
  './assets/js/quiz.js?v=1.1.6',
  './assets/js/adaptive-quiz.js?v=1.1.6',
  './assets/img/rudn-logo.png','./manifest.webmanifest'
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
