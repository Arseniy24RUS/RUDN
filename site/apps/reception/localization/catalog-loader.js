// Browser-only lazy locale reader. No canonical content, answers or profile writes.
export const LOCALE_CACHE = 'rudn-reception-locales-v2';
const normalizeLocale = value => /^zh/i.test(value||'')?'zh':/^en/i.test(value||'')?'en':'ru';
const issue = (code,message) => Object.assign(new Error(message),{code});
const canceled = signal => {if(signal?.aborted)throw new DOMException('Reception translation loading canceled.','AbortError');};
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
function bounded(promise, milliseconds, onTimeout) {
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout?.();reject(issue('locale/timeout','Reception translation loading timed out.'));},milliseconds);})]).finally(()=>clearTimeout(timer));
}
function manifestValid(value,locale,contentVersion) {
  if(value?.schema!==2||value.locale!==locale||value.complete!==true||typeof value.contentVersion!=='string'||
     (contentVersion&&value.contentVersion!==contentVersion)||!/^[a-f0-9]{64}$/.test(value.sourceVersion||'')||!Array.isArray(value.templates)||
     !value.entries?.common||!value.entries.catalog||!value.entries['source-index'])throw issue('locale/incomplete','Reception translation manifest is incomplete or belongs to another content version.');
  if(new Set(value.templates).size!==value.templates.length||value.templates.some(id=>!/^[a-z0-9][a-z0-9-]*$/.test(id)||!value.entries['cases/'+id]))throw issue('locale/incomplete','Reception translation manifest has invalid case IDs.');
  return value;
}
function resourceValid(entry,id,locale) {
  const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!entry||!/^[a-f0-9]{64}$/.test(entry.sha256||'')||!Number.isSafeInteger(entry.count)||entry.count<0||
     !new RegExp('^'+locale+'/'+escaped+'\\.'+entry.sha256.slice(0,16)+'\\.json$').test(entry.path||''))throw issue('locale/integrity','Reception translation resource reference is invalid.');
  return entry;
}

export function createReceptionCatalogLoader({fetch:fetcher=globalThis.fetch,timeoutMs=8000,cacheStorage=globalThis.caches,baseURL=new URL('compiled/',import.meta.url)}={}) {
  const manifests=new Map(),packs=new Map(),aliasLoads=new Map();
  const urlFor=path=>new URL(path,baseURL);
  async function cacheGet(url) {
    try {const cache=await bounded(Promise.resolve(cacheStorage?.open(LOCALE_CACHE)),500);const response=await bounded(Promise.resolve(cache?.match(url.href)),500);return response?JSON.parse(await bounded(response.text(),500)):null;}catch{return null;}
  }
  async function cachePut(url,value) {
    try {const cache=await bounded(Promise.resolve(cacheStorage?.open(LOCALE_CACHE)),500);await bounded(Promise.resolve(cache?.put(url.href,new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}))),500);}catch{/* Optional display cache must not block work or claim it saved answers. */}
  }
  async function network(url,signal) {
    canceled(signal);const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});
    try {
      return await bounded((async()=>{const response=await fetcher(url,{signal:controller.signal});if(!response.ok)throw issue('locale/unavailable',`Reception translation resource unavailable (${response.status}).`);return response.json();})(),timeoutMs,()=>controller.abort());
    } finally {signal?.removeEventListener('abort',abort);}
  }
  async function readManifest(locale,{contentVersion,signal}) {
    canceled(signal);const key=locale+':'+(contentVersion||'current');
    if(!manifests.has(key))manifests.set(key,(async()=>{
      const url=urlFor(locale+'.manifest.json');if(contentVersion)url.searchParams.set('content',contentVersion);
      try {const value=manifestValid(await network(url,signal),locale,contentVersion);canceled(signal);await cachePut(url,value);return value;}
      catch(error){canceled(signal);const cached=await cacheGet(url);if(cached)return manifestValid(cached,locale,contentVersion);throw error;}
    })().catch(error=>{manifests.delete(key);throw error;}));
    const manifest=await manifests.get(key);canceled(signal);return manifest;
  }
  async function readPack(id,manifest,signal) {
    canceled(signal);const entry=resourceValid(manifest.entries[id],id,manifest.locale),key=entry.sha256;
    const validate=async value=>{
      if(value?.schema!==2||value.locale!==manifest.locale||value.id!==id||value.complete!==true||value.contentVersion!==manifest.contentVersion||value.sourceVersion!==manifest.sourceVersion||
         !value.strings||typeof value.strings!=='object'||Array.isArray(value.strings)||value.count!==entry.count||Object.keys(value.strings).length!==entry.count||
         Object.values(value.strings).some(text=>typeof text!=='string'||!text.trim())||await hash(value)!==entry.sha256)throw issue('locale/integrity','Reception translation resource does not match the selected content.');
      const literals=value.literals||{};
      if(typeof literals!=='object'||Array.isArray(literals)||Object.entries(literals).some(([source,list])=>!Object.hasOwn(value.strings,source)||!Array.isArray(list)||list.some(text=>typeof text!=='string'||!source.includes(text))))throw issue('locale/integrity','Reception translation evidence metadata is invalid.');
      return {strings:value.strings,literals};
    };
    if(!packs.has(key))packs.set(key,(async()=>{
      const url=urlFor(entry.path),cached=await cacheGet(url);
      if(cached){try{return await validate(cached);}catch{/* Fetch a fresh verified copy of a damaged optional cache entry. */}}
      const value=await network(url,signal),strings=await validate(value);canceled(signal);await cachePut(url,value);return strings;
    })().catch(error=>{packs.delete(key);throw error;}));
    const strings=await packs.get(key);canceled(signal);return strings;
  }
  async function load(locale,{templateIds=[],includeCatalog=false,includeSourceIndex=false,contentVersion,signal}={}) {
    canceled(signal);const language=normalizeLocale(locale);
    if(language==='ru')return {locale:language,catalog:{},groups:[],manifest:null};
    const manifest=await readManifest(language,{contentVersion,signal});
    if(!Array.isArray(templateIds)||templateIds.some(id=>!manifest.templates.includes(id)))throw issue('locale/unknown-template','The saved assignment has no translation in this content version.');
    const groups=['common',...[...new Set(templateIds)].map(id=>'cases/'+id),...(includeCatalog?['catalog']:[]),...(includeSourceIndex?['source-index']:[])];
    const values=await Promise.all(groups.map(id=>readPack(id,manifest,signal))),catalog=Object.create(null),literals=Object.create(null);
    for(const value of values)for(const [source,text] of Object.entries(value.strings)) {
      if(Object.hasOwn(catalog,source)&&catalog[source]!==text)throw issue('locale/integrity','Reception translation packs disagree on a shared label.');
      catalog[source]=text;
      if(value.literals[source])literals[source]=value.literals[source];
    }
    canceled(signal);return {locale:language,catalog,literals,groups,manifest};
  }
  async function loadEvidenceAliases({contentVersion,signal}={}) {
    canceled(signal);const key=contentVersion||'current';
    if(!aliasLoads.has(key))aliasLoads.set(key,(async()=>{
      const url=urlFor('evidence-aliases.manifest.json');if(contentVersion)url.searchParams.set('content',contentVersion);
      const validManifest=value=>{
        if(value?.schema!==1||value.kind!=='evidence-aliases'||value.complete!==true||typeof value.contentVersion!=='string'||(contentVersion&&value.contentVersion!==contentVersion)||!/^[a-f0-9]{64}$/.test(value.sha256||'')||!/^[a-f0-9]{64}$/.test(value.sourceVersion||'')||value.path!==`evidence-aliases.${value.sha256.slice(0,16)}.json`||!Number.isSafeInteger(value.count)||value.count<1)throw issue('locale/integrity','Reception evidence alias manifest is invalid.');
        return value;
      };
      let manifest;
      try{manifest=validManifest(await network(url,signal));canceled(signal);await cachePut(url,manifest);}
      catch(error){canceled(signal);const cached=await cacheGet(url);if(!cached)throw error;manifest=validManifest(cached);}
      const packURL=urlFor(manifest.path),validate=async value=>{
        if(value?.schema!==1||value.kind!=='evidence-aliases'||value.complete!==true||value.contentVersion!==manifest.contentVersion||value.sourceVersion!==manifest.sourceVersion||!Array.isArray(value.aliases)||value.aliases.length!==manifest.count||await hash(value)!==manifest.sha256)throw issue('locale/integrity','Reception evidence aliases do not match this content version.');
        return {aliases:value.aliases,contentVersion:value.contentVersion};
      };
      const cached=await cacheGet(packURL);if(cached)try{return await validate(cached);}catch{}
      const value=await network(packURL,signal),result=await validate(value);canceled(signal);await cachePut(packURL,value);return result;
    })().catch(error=>{aliasLoads.delete(key);throw error;}));
    const result=await aliasLoads.get(key);canceled(signal);return result;
  }
  return {load,loadEvidenceAliases,clearMemory(){manifests.clear();packs.clear();aliasLoads.clear();}};
}
