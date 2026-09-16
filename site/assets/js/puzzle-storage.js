/** geoBoundaries raw links may be redirects or Git LFS pointers; serve official media bytes. */
export function puzzleGeometryUrl(input,base=globalThis.location?.href){
  const url=new URL(input,base);
  if(url.hostname==='raw.githubusercontent.com'&&url.pathname.startsWith('/wmgeolab/geoBoundaries/'))return `https://media.githubusercontent.com/media${url.pathname}`;
  if(url.hostname==='github.com'&&url.pathname.startsWith('/wmgeolab/geoBoundaries/raw/'))return `https://media.githubusercontent.com${url.pathname.replace('/wmgeolab/geoBoundaries/raw/','/media/wmgeolab/geoBoundaries/')}`;
  return url.href;
}

/** Exact, immutable map snapshots. Geometry stays on the device, outside cloud checkpoints. */
export function createPuzzleGeometryStore({indexedDB=globalThis.indexedDB,caches=globalThis.caches,onWarning=()=>{},databaseName='rudn-puzzle-geometry-v1'}={}){
  const memory=new Map();
  const remember=(id,json)=>{memory.delete(id);memory.set(id,json);while(memory.size>3)memory.delete(memory.keys().next().value)};
  let opening;
  const open=()=>opening||=(new Promise(resolve=>{
    if(!indexedDB){resolve(null);return}
    let request;
    try{request=indexedDB.open(databaseName,1)}catch{resolve(null);return}
    request.onupgradeneeded=()=>request.result.createObjectStore('geometry',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=request.onblocked=()=>resolve(null);
  }));
  const transaction=async(action,write=false)=>{
    const db=await open();if(!db)throw new Error('storage/unavailable');
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('geometry',write?'readwrite':'readonly');
      const request=action(tx.objectStore('geometry'));
      let value;request.onsuccess=()=>value=request.result;
      tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('storage/unavailable'));
    });
  };
  const cacheKey=id=>new URL(`/.rudn-puzzle-snapshots/${encodeURIComponent(id)}`,globalThis.location?.origin||'https://localhost/').href;
  return {
    async save(wrapper){
      if(!wrapper?.geometry)throw new TypeError('A complete map geometry is required.');
      const json=JSON.stringify(wrapper),bytes=new TextEncoder().encode(json);
      const digest=globalThis.crypto?.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)):null;
      const id=digest?Array.from(digest,value=>value.toString(16).padStart(2,'0')).join(''):globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
      remember(id,json);
      try{await transaction(store=>store.put({id,json}),true);return id}catch{}
      try{const cache=await caches.open(databaseName);await cache.put(cacheKey(id),new Response(json,{headers:{'content-type':'application/json'}}));return id}catch{}
      onWarning({code:'storage/geometry-unavailable'});
      return id;
    },
    async load(id){
      if(!id)return null;
      if(memory.has(id))return JSON.parse(memory.get(id));
      try{const record=await transaction(store=>store.get(id));if(record?.json){remember(id,record.json);return JSON.parse(record.json)}}catch{}
      try{const cached=await (await caches.open(databaseName)).match(cacheKey(id));if(cached){const json=await cached.text();remember(id,json);return JSON.parse(json)}}catch{}
      return null;
    },
    async close(){(await opening)?.close()},
  };
}

/** A visible page holds the write lock. Transfer always reloads the durable head. */
export function createPuzzleWriter({scope,readState,onChange=()=>{},beforeRelease=()=>{},isActive=()=>true,locks=globalThis.navigator?.locks,storage,now=()=>Date.now()}={}){
  if(storage===undefined){try{storage=globalThis.localStorage}catch{storage=null}}
  const name=`rudn-puzzle-writer:${scope}`,id=globalThis.crypto?.randomUUID?.()||`${now()}-${Math.random()}`;
  let writable=false,releaseLock=null,pending=null,closed=false,timer=null,generation=0;
  const readLease=()=>{try{return JSON.parse(storage?.getItem(name)||'null')}catch{return null}};
  const emit=(restore=null)=>onChange({writable,restore});
  const verify=()=>{
    if(!writable||locks?.request)return writable;
    const current=readLease();
    if(current&&current.id!==id&&current.expires>now()){writable=false;emit();return false}
    return true;
  };
  async function becomeWriter(epoch){
    const restore=await readState();if(closed||epoch!==generation||!isActive())return null;
    writable=true;emit(restore);return restore;
  }
  async function acquire(){
    if(closed||!isActive())return null;if(verify())return null;if(pending)return pending;
    const epoch=generation;
    pending=(async()=>{
      if(locks?.request){
        return new Promise((resolve,reject)=>{
          locks.request(name,{ifAvailable:true},async lock=>{
            if(!lock||closed||epoch!==generation||!isActive()){resolve(null);return}
            const held=new Promise(done=>releaseLock=done);
            try{resolve(await becomeWriter(epoch));if(writable)await held}finally{releaseLock=null}
          }).catch(reject);
        });
      }
      const current=readLease();if(current&&current.id!==id&&current.expires>now())return null;
      try{storage?.setItem(name,JSON.stringify({id,expires:now()+8000}))}catch{}
      // Recheck after other contenders have had a turn. Every save also verifies ownership.
      await new Promise(resolve=>setTimeout(resolve,40));
      if(readLease()?.id&&readLease().id!==id)return null;
      const state=await becomeWriter(epoch);
      if(!writable){if(readLease()?.id===id){try{storage?.removeItem(name)}catch{}}return null}
      timer=setInterval(()=>{if(verify()){try{storage?.setItem(name,JSON.stringify({id,expires:now()+8000}))}catch{}}},2000);
      return state;
    })().finally(()=>pending=null);
    return pending;
  }
  async function release(){
    generation++;
    if(!writable)return;
    await beforeRelease();
    writable=false;clearInterval(timer);timer=null;
    if(readLease()?.id===id){try{storage?.removeItem(name)}catch{}}
    releaseLock?.();emit();
  }
  return {acquire,release,canWrite:verify,async close(){closed=true;await release();releaseLock?.()}};
}

/** Append-only Firebase rules permit the first write only; lost acknowledgments are safe. */
export async function commitPuzzleLeaderboard(transport,attemptId,record,{signal,active=()=>true}={}){
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(String(attemptId)))throw Object.assign(new Error('Invalid attempt ID'),{code:'database/invalid-attempt-id'});
  const assertActive=()=>{if(!active())throw Object.assign(new Error('Profile changed'),{code:'auth/profile-changed'})};
  const same=existing=>existing&&['fio','group','difficulty','time_ms','placed','total','timestamp','user_agent'].every(key=>existing[key]===record[key]);
  assertActive();
  try{
    const result=await transport.transaction(attemptId,existing=>{
      assertActive();
      if(existing){if(!same(existing))throw Object.assign(new Error('Attempt ID collision'),{code:'database/leaderboard-conflict'});return undefined}
      return record;
    },{signal});
    assertActive();return result.value;
  }catch(error){
    assertActive();
    if(error.code==='database/permission-denied'||error.code==='database/conflict'){
      const {value}=await transport.get(attemptId,{signal});assertActive();if(same(value))return value;
    }
    throw error;
  }
}
