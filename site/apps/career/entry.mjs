import { createCareerRuntime } from './runtime.bundle.mjs';
import {backend} from '../../assets/js/backend.js?v=1.3.8';
import {durableStore} from '../../assets/js/durable-store.js';

const MODULE_BASE = new URL('./', import.meta.url);
const VALID_ROUTES = new Set(['home','test','sectors','conditions','results','directory','compare','seminar','methodology','structure','scenarios','opportunities','workshop','lab','public-service','vacancies']);
const locale = value => String(value || 'ru').startsWith('zh') ? 'zh-Hans' : String(value || 'ru').startsWith('en') ? 'en' : 'ru';
const activeMounts = new WeakMap();

/** A native, isolated DOM component. Authentication and course navigation belong to the host. */
export async function mountCareer(container, {owner = 'guest', context: hostContext = 'course', lang = 'ru', onResult, initialRoute = 'home', onRouteChange, signal} = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('Career module requires an HTMLElement container.');
  activeMounts.get(container)?.destroy();
  const shadow = container.shadowRoot || container.attachShadow({mode:'open'});
  const free=hostContext==='free';
  const ownerKey = `rudn-career:${free?'free:':''}embedded:${encodeURIComponent(MODULE_BASE.pathname)}:${encodeURIComponent(String(owner || 'guest'))}:`;
  let current = null, disposed = false, language = locale(lang), route = VALID_ROUTES.has(initialRoute) ? initialRoute : 'home', generation = 0;
  const hostWindow = container.ownerDocument.defaultView;
  const hostDocument = container.ownerDocument;
  const controller = new AbortController();
  const abortFromHost = () => api.destroy();
  const durableOwner=/^(student|teacher):/.test(owner)?owner:'guest:career';
  const progressScope={owner:durableOwner,activitySlug:free?'career-freeplay':'career-workspace',mode:free?'workspace':'diagnostic',attemptId:'workspace-v1'};
  const values=new Map(),observedLegacy=new Map(),pendingSaves=new Set();
  try{for(let i=0;i<hostWindow.localStorage.length;i++){const key=hostWindow.localStorage.key(i);if(key?.startsWith(ownerKey)){const value=hostWindow.localStorage.getItem(key);values.set(key.slice(ownerKey.length),value);observedLegacy.set(key,value);}}}catch{}
  const saveCopy={ru:{pending:'Сохранено на устройстве · ожидает отправки',saved:'Сохранено',unsafe:'Не удалось сохранить. Скачайте ответы перед закрытием.'},en:{pending:'Saved on this device · awaiting upload',saved:'Saved',unsafe:'Could not save. Download your answers before closing.'},'zh-Hans':{pending:'已保存在此设备 · 等待上传',saved:'已保存',unsafe:'无法保存。关闭前请下载答案。'}};
  const track=promise=>{pendingSaves.add(promise);promise.finally(()=>pendingSaves.delete(promise)).catch(()=>{});return promise;};
  const persistWorkspace=()=>track(backend.checkpoint({...progressScope,contentVersion:'career-workspace-v1',state:{values:Object.fromEntries(values),route}},{queue:durableOwner.startsWith('student:')}).then(saved=>{
    const label=shadow.querySelector('#session-status');if(label&&!disposed)label.textContent=saveCopy[language][!saved.saveStatus.durable?'unsafe':saved.saveStatus.state==='saved'?'saved':'pending'];return saved;
  }).catch(error=>{hostWindow.dispatchEvent(new CustomEvent('rudn:storage-warning',{detail:{owner:durableOwner,errorCode:error.code||'storage/unavailable'}}));return null;}));

  const api = {
    destroy() {
      if (disposed) return;
      const flushed=api.flush();
      disposed = true; generation += 1; controller.abort(); current?.cleanup(); current = null;
      signal?.removeEventListener('abort',abortFromHost);
      shadow.replaceChildren(); activeMounts.delete(container);
      container.removeAttribute('data-career-ready');
      return flushed;
    },
    async flush(){await Promise.allSettled([...pendingSaves]);await durableStore.flush();},
    async setLocale(value) {
      language = locale(value);
      if (current && !disposed) await current.runtime.setLocale(language, {persist:false});
    },
    navigate(value) {
      if (disposed || !VALID_ROUTES.has(value)) return;
      route = value;
      current?.runtime.navigate(value, {updateHash:false});
    }
  };
  activeMounts.set(container, api);
  signal?.addEventListener('abort',abortFromHost,{once:true});
  if(signal?.aborted){api.destroy();throw new DOMException('Career mount aborted.','AbortError');}
  const restored=await backend.loadDraft(progressScope);
  const legacyTime=Math.max(0,...[...values.values()].map(value=>{try{return Date.parse(JSON.parse(value)?.updatedAt)||0;}catch{return 0;}}));
  if(restored?.state?.values&&restored.updatedAt>=legacyTime){values.clear();for(const [key,value] of Object.entries(restored.state.values))values.set(key,String(value));if(initialRoute==='home'&&VALID_ROUTES.has(restored.state.route))route=restored.state.route;}
  else if(values.size)await persistWorkspace();
  let markup, css;
  try {
    const [surfaceResponse, styleResponse] = await Promise.all([
      fetch(new URL('surface.html', MODULE_BASE), {signal:controller.signal}),
      fetch(new URL('module.css', MODULE_BASE), {signal:controller.signal})
    ]);
    if (!surfaceResponse.ok || !styleResponse.ok) throw new Error('Career module resources could not be loaded.');
    [markup, css] = await Promise.all([surfaceResponse.text(), styleResponse.text()]);
  } catch(error) {api.destroy();throw error;}

  async function start() {
    if(disposed)throw new DOMException('Career mount aborted.','AbortError');
    const ticket = ++generation;
    current?.cleanup();
    const life = new AbortController();
    const timers = new Set(), frames = new Set(), observers = new Set(), objectURLs = new Set(), resultsSent = new Set();
    let destroyed = false;
    const style = hostDocument.createElement('style');
    // Stylesheet URLs normally resolve relative to the CSS file; inline Shadow DOM styles need an explicit base.
    style.textContent = css.replace(/url\(\s*(['"]?)(?!data:|blob:|#)([^)'"\s]+)\1\s*\)/g, (_, quote, value) => `url("${new URL(value, MODULE_BASE).href}")`);
    const surface = hostDocument.createElement('div');
    surface.className = 'career-surface'; surface.lang = language;
    surface.innerHTML = markup;
    for (const element of surface.querySelectorAll('[src],[href]')) {
      for (const attribute of ['src','href']) {
        const value = element.getAttribute(attribute);
        if (value && !value.startsWith('#') && !/^(?:[a-z]+:|\/\/)/i.test(value)) element.setAttribute(attribute, new URL(value, MODULE_BASE).href);
      }
    }
    shadow.replaceChildren(style, surface);

    const addListener = (target, type, listener, options = {}) => {
      const normalized = typeof options === 'boolean' ? {capture:options} : options;
      target.addEventListener(type, listener, {...normalized, signal:life.signal});
    };
    const scopedDocument = {
      body:surface, documentElement:surface,
      get activeElement() { return shadow.activeElement; },
      get title() { return ''; }, set title(_value) {},
      querySelector: selector => surface.querySelector(selector),
      querySelectorAll: selector => surface.querySelectorAll(selector),
      getElementById: id => surface.querySelector(`#${CSS.escape(id)}`),
      createElement: hostDocument.createElement.bind(hostDocument),
      createTreeWalker: hostDocument.createTreeWalker.bind(hostDocument),
      addEventListener: (type, listener, options) => addListener(surface,type,listener,options),
      removeEventListener: (type, listener, options) => surface.removeEventListener(type,listener,options),
      dispatchEvent: event => !destroyed && surface.dispatchEvent(event)
    };
    const timeout = (callback, delay, ...args) => {
      if (destroyed) return 0;
      const id = hostWindow.setTimeout(() => {timers.delete(id); if (!destroyed) callback(...args);},delay);
      timers.add(id);return id;
    };
    const clearTimer = id => {timers.delete(id);hostWindow.clearTimeout(id);};
    const raf = callback => {
      const id = hostWindow.requestAnimationFrame(timestamp => {frames.delete(id);if(!destroyed)callback(timestamp);});
      frames.add(id);return id;
    };
    class ScopedObserver extends MutationObserver {
      constructor(callback) {super((...args) => {if(!destroyed)callback(...args);});observers.add(this);}
    }
    class ScopedURL extends URL {
      static createObjectURL(blob) {const url=URL.createObjectURL(blob);objectURLs.add(url);return url;}
      static revokeObjectURL(url) {objectURLs.delete(url);URL.revokeObjectURL(url);}
    }
    const scopedStorage = {
      getItem(key) {if(destroyed)throw new Error('Career instance closed.');if(!key.startsWith(ownerKey))return null;return values.get(key.slice(ownerKey.length))??null;},
      setItem(key,value) {
        if(destroyed||!key.startsWith(ownerKey))throw new Error('Career storage scope rejected.');
        let actual;try{actual=hostWindow.localStorage.getItem(key);}catch{actual=observedLegacy.get(key)??null;}
        if(actual!==(observedLegacy.get(key)??null))throw Object.assign(new Error('storage-conflict'),{code:'storage/conflict'});
        values.set(key.slice(ownerKey.length),String(value));persistWorkspace();
        try{hostWindow.localStorage.setItem(key,String(value));observedLegacy.set(key,String(value));}catch{/* IndexedDB checkpoint owns durability; its warning remains visible if both stores fail. */}
      },
      removeItem(key) {if(destroyed||!key.startsWith(ownerKey))throw new Error('Career storage scope rejected.');values.delete(key.slice(ownerKey.length));persistWorkspace();try{hostWindow.localStorage.removeItem(key);observedLegacy.set(key,null);}catch{}}
    };
    const context = {
      document:scopedDocument,
      window:{
        addEventListener:(type,listener,options) => addListener(type === 'afterprint' ? hostWindow : surface,type,listener,options),
        scrollTo:() => {if(!destroyed)container.scrollIntoView({block:'start',behavior:'instant'});},
        print:() => {if(!destroyed){container.dispatchEvent(new CustomEvent('career:beforeprint',{bubbles:true}));hostWindow.print();}}
      },
      localStorage:scopedStorage,
      location:{href:new URL(`?lang=${encodeURIComponent(language)}#${route}`,MODULE_BASE).href,hash:`#${route}`,protocol:MODULE_BASE.protocol,reload:() => {if(!destroyed)void start();}},
      navigator:{languages:[language],language,clipboard:hostWindow.navigator.clipboard},
      async fetch(input, options = {}) {
        const combined = new AbortController();
        const abort = () => combined.abort();
        if(life.signal.aborted || options.signal?.aborted)combined.abort();
        life.signal.addEventListener('abort',abort,{once:true}); options.signal?.addEventListener('abort',abort,{once:true});
        try{return await hostWindow.fetch(new URL(input,MODULE_BASE),{...options,signal:combined.signal});}
        finally{life.signal.removeEventListener('abort',abort);options.signal?.removeEventListener('abort',abort);}
      },
      MutationObserver:ScopedObserver,URL:ScopedURL,setTimeout:timeout,clearTimeout:clearTimer,requestAnimationFrame:raf,
      confirm:message => !destroyed && hostWindow.confirm(message),
      prompt:(message,value) => destroyed ? null : hostWindow.prompt(message,value),
      lang:language, liveVacancies:false,
      get destroyed() {return destroyed;},
      storageKey:name => `${ownerKey}${name}`,
      routeChanged(value, {replace=false} = {}) {
        if(destroyed || !VALID_ROUTES.has(value))return;
        route=value;
        persistWorkspace();
        if (typeof onRouteChange === 'function') onRouteChange(value,{replace});
      },
      resultCalculated(record) {
        if(destroyed || resultsSent.has(record.recordId))return;
        resultsSent.add(record.recordId);
        const captured=structuredClone(record);
        if(free||durableOwner.startsWith('student:')){
          const student=durableOwner.startsWith('student:');
          const attempt={id:captured.recordId,...(student?{studentKey:durableOwner.slice(8)}:{}),activitySlug:free?'career-freeplay':'career-diagnostic',draftMode:'diagnostic',type:'career-diagnostic',recordGrade:false,createdAt:captured.createdAt,title:'Career diagnostic',career:captured};
          track(durableStore.complete({owner:durableOwner,activitySlug:attempt.activitySlug,mode:'diagnostic',attemptId:attempt.id,state:{record:captured},attempt},{queue:student}).then(()=>{
            if(student&&!backend.isAdmin()&&backend.getProfile()?.studentKey===attempt.studentKey)return backend.saveAttempt(attempt);
          }).catch(error=>hostWindow.dispatchEvent(new CustomEvent('rudn:storage-warning',{detail:{owner:durableOwner,errorCode:error.code||'storage/unavailable'}}))));
        }
        if(typeof onResult === 'function') track(Promise.resolve().then(() => onResult(captured)).catch(error => console.error('Career result callback failed:',error)));
      }
    };
    const cleanup = () => {
      if(destroyed)return;
      destroyed=true;life.abort();observers.forEach(observer=>observer.disconnect());
      timers.forEach(id=>hostWindow.clearTimeout(id));frames.forEach(id=>hostWindow.cancelAnimationFrame(id));
      objectURLs.forEach(url=>URL.revokeObjectURL(url));
      surface.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
      surface.classList.remove('print-workbook');
    };
    const runtime = createCareerRuntime(context);
    current={runtime,cleanup};
    await runtime.ready;
    if(disposed || ticket!==generation){cleanup();return;}
    container.setAttribute('data-career-ready','true');
  }

  try {await start();} catch(error) {api.destroy();throw error;}
  return api;
}
