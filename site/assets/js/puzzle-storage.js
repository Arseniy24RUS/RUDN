/** geoBoundaries raw links may be redirects or Git LFS pointers; serve official media bytes. */
export function puzzleGeometryUrl(input,base=globalThis.location?.href){
  const url=new URL(input,base);
  if(url.hostname==='raw.githubusercontent.com'&&url.pathname.startsWith('/wmgeolab/geoBoundaries/'))return `https://media.githubusercontent.com/media${url.pathname}`;
  if(url.hostname==='github.com'&&url.pathname.startsWith('/wmgeolab/geoBoundaries/raw/'))return `https://media.githubusercontent.com${url.pathname.replace('/wmgeolab/geoBoundaries/raw/','/media/wmgeolab/geoBoundaries/')}`;
  return url.href;
}

/** Exact, immutable map snapshots. Geometry stays on the device, outside cloud checkpoints. */
export function createPuzzleGeometryStore({indexedDB=globalThis.indexedDB,caches=globalThis.caches,onWarning=()=>{},databaseName='rudn-puzzle-geometry-v1',operationTimeoutMs=3000}={}){
  const memory=new Map();
  const remember=(id,json)=>{memory.delete(id);memory.set(id,json);while(memory.size>3)memory.delete(memory.keys().next().value)};
  // Geometry is an optional offline copy. A browser storage request can remain
  // pending without firing an error; it must never prevent drawing a loaded map.
  const timeoutError=()=>new Error('storage/geometry-timeout');
  const bounded=async action=>{
    let timer;
    try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError()),operationTimeoutMs)})])}
    finally{clearTimeout(timer)}
  };
  let opening,db=null,closed=false;
  const open=()=>opening||=(new Promise(resolve=>{
    if(!indexedDB||closed){resolve(null);return}
    let request,settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value)};
    const timer=setTimeout(()=>finish(null),operationTimeoutMs);
    try{request=indexedDB.open(databaseName,1)}catch{finish(null);return}
    request.onupgradeneeded=()=>{
      if(settled||closed){try{request.transaction?.abort()}catch{}return}
      request.result.createObjectStore('geometry',{keyPath:'id'});
    };
    request.onsuccess=()=>{
      if(settled||closed){request.result.close();finish(null);return}
      db=request.result;
      db.onversionchange=()=>{db?.close();db=null};
      finish(db);
    };
    request.onerror=request.onblocked=()=>finish(null);
  }));
  const transaction=async(action,write=false)=>{
    const connection=await open();if(!connection||closed)throw new Error('storage/unavailable');
    return new Promise((resolve,reject)=>{
      let tx,value,settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value)};
      const timer=setTimeout(()=>{finish(timeoutError());try{tx?.abort()}catch{}},operationTimeoutMs);
      try{
        tx=connection.transaction('geometry',write?'readwrite':'readonly');
        const request=action(tx.objectStore('geometry'));
        request.onsuccess=()=>value=request.result;
        tx.oncomplete=()=>finish();tx.onerror=tx.onabort=()=>finish(tx.error||new Error('storage/unavailable'));
      }catch(error){finish(error);try{tx?.abort()}catch{}}
    });
  };
  const cacheKey=id=>new URL(`/.rudn-puzzle-snapshots/${encodeURIComponent(id)}`,globalThis.location?.origin||'https://localhost/').href;
  return {
    async save(wrapper){
      if(!wrapper?.geometry)throw new TypeError('A complete map geometry is required.');
      const json=JSON.stringify(wrapper),bytes=new TextEncoder().encode(json);
      let digest=null;
      try{if(globalThis.crypto?.subtle)digest=new Uint8Array(await bounded(()=>crypto.subtle.digest('SHA-256',bytes)))}catch{}
      const id=digest?Array.from(digest,value=>value.toString(16).padStart(2,'0')).join(''):globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
      remember(id,json);
      try{await transaction(store=>store.put({id,json}),true);return id}catch{}
      try{await bounded(async()=>{const cache=await caches.open(databaseName);await cache.put(cacheKey(id),new Response(json,{headers:{'content-type':'application/json'}}))});return id}catch{}
      onWarning({code:'storage/geometry-unavailable'});
      return id;
    },
    async load(id){
      if(!id)return null;
      if(memory.has(id))return JSON.parse(memory.get(id));
      try{const record=await transaction(store=>store.get(id));if(record?.json){remember(id,record.json);return JSON.parse(record.json)}}catch{}
      try{const json=await bounded(async()=>{const cached=await (await caches.open(databaseName)).match(cacheKey(id));return cached?cached.text():null});if(json){remember(id,json);return JSON.parse(json)}}catch{}
      return null;
    },
    async close(){closed=true;db?.close();db=null},
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
  const same=existing=>existing&&['fio','group','difficulty','time_ms','placed','total','timestamp','user_agent'].every(key=>existing[key]===record[key])&&['participant_id','elapsed_ms'].every(key=>(existing[key]??null)===(record[key]??null));
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
