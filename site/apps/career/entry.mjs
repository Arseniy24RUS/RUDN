import { createCareerRuntime } from './runtime.bundle.mjs';

const MODULE_BASE = new URL('./', import.meta.url);
const VALID_ROUTES = new Set(['home','test','sectors','conditions','results','directory','compare','seminar','methodology','structure','scenarios','opportunities','workshop','lab','public-service','vacancies']);
const locale = value => String(value || 'ru').startsWith('zh') ? 'zh-Hans' : String(value || 'ru').startsWith('en') ? 'en' : 'ru';
const activeMounts = new WeakMap();

/** A native, isolated DOM component. Authentication and course navigation belong to the host. */
export async function mountCareer(container, {owner = 'guest', lang = 'ru', onResult, initialRoute = 'home', onRouteChange, signal} = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('Career module requires an HTMLElement container.');
  activeMounts.get(container)?.destroy();
  const shadow = container.shadowRoot || container.attachShadow({mode:'open'});
  const ownerKey = `rudn-career:embedded:${encodeURIComponent(MODULE_BASE.pathname)}:${encodeURIComponent(String(owner || 'guest'))}:`;
  let current = null, disposed = false, language = locale(lang), route = VALID_ROUTES.has(initialRoute) ? initialRoute : 'home', generation = 0;
  const hostWindow = container.ownerDocument.defaultView;
  const hostDocument = container.ownerDocument;
  const controller = new AbortController();
  const abortFromHost = () => api.destroy();

  const api = {
    destroy() {
      if (disposed) return;
      disposed = true; generation += 1; controller.abort(); current?.cleanup(); current = null;
      signal?.removeEventListener('abort',abortFromHost);
      shadow.replaceChildren(); activeMounts.delete(container);
      container.removeAttribute('data-career-ready');
    },
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
      getItem(key) {if(destroyed)throw new Error('Career instance closed.');if(!key.startsWith(ownerKey))return null;return hostWindow.localStorage.getItem(key);},
      setItem(key,value) {if(destroyed||!key.startsWith(ownerKey))throw new Error('Career storage scope rejected.');hostWindow.localStorage.setItem(key,value);},
      removeItem(key) {if(destroyed||!key.startsWith(ownerKey))throw new Error('Career storage scope rejected.');hostWindow.localStorage.removeItem(key);}
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
        if (typeof onRouteChange === 'function') onRouteChange(value,{replace});
      },
      resultCalculated(record) {
        if(destroyed || resultsSent.has(record.recordId))return;
        resultsSent.add(record.recordId);
        if(typeof onResult === 'function') Promise.resolve().then(() => !destroyed && onResult(structuredClone(record))).catch(error => console.error('Career result callback failed:',error));
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
