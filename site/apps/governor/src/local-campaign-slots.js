// A synchronous tab copy lets the game safely replace a campaign or navigate
// immediately. IndexedDB retains these local slots after the tab closes. They
// are independent of the platform's submission queue and its localStorage mirror.
export async function openLocalCampaignSlots(scoped, environment=globalThis) {
  const prefix = scoped.keyFor('local-campaign-slot:');
  let tab, disk;
  try { tab = environment.sessionStorage; } catch {}
  const saved = new Map();
  const pending = new Set();
  try {
    disk = await new Promise((resolve, reject) => {
      const request = environment.indexedDB.open('rudn-governor-local-slots-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('slots');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('storage/blocked'));
    });
    const tx = disk.transaction('slots','readonly');
    const cursor = tx.objectStore('slots').openCursor(environment.IDBKeyRange.bound(prefix, prefix+'\uffff'));
    await new Promise((resolve,reject)=>{
      cursor.onsuccess = ()=>{
        const row=cursor.result;
        if (!row) return;
        saved.set(String(row.key).slice(prefix.length),row.value);
        row.continue();
      };
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    disk.onversionchange = () => {disk.close();disk=null;};
  } catch { disk?.close();disk=null; }

  const observed=new Map();
  function lookup(key){
    if (observed.has(key)) return observed.get(key);
    const records=[saved.get(key)];
    try { records.push(JSON.parse(tab?.getItem(prefix+key)||'null')); } catch {}
    // Only used when IndexedDB or sessionStorage is unavailable.
    try { records.push(JSON.parse(scoped.getItem('local-campaign-slot:'+key)||'null')); } catch {}
    const last=records.filter(r=>r && Number.isSafeInteger(r.at) &&
      (r.value===null || typeof r.value==='string')).sort((a,b)=>b.at-a.at)[0]||null;
    observed.set(key,last);
    return last;
  }
  function write(key,value){
    const last=lookup(key);
    if (last?.value===value) return;
    const record={at:Math.max(Date.now(),(last?.at||0)+1),value};
    const text=JSON.stringify(record);
    let inTab=false;
    if (tab) try {tab.setItem(prefix+key,text);inTab=true;} catch {}
    // A failed write on both synchronous stores must leave the original
    // campaign intact. The caller can retry or use its normal file export.
    if (!inTab || !disk) {
      try { scoped.setItem('local-campaign-slot:'+key,text); }
      catch (error) { if (!inTab) throw error; }
    }
    observed.set(key,record);
    if (disk) {
      try {
        const tx=disk.transaction('slots','readwrite');
        tx.objectStore('slots').put(record,prefix+key);
        const promise=new Promise(resolve=>{
          tx.oncomplete=()=>{
            saved.set(key,record);
            // The tab mirror is a write-ahead journal, which stays bounded even
            // on shared devices with several users. Only retire our exact write.
            try { if (tab?.getItem(prefix+key)===text) tab.removeItem(prefix+key); } catch {}
            resolve();
          };
          tx.onabort=tx.onerror=resolve;
        });
        pending.add(promise);promise.then(()=>pending.delete(promise));
      } catch { /* The synchronous copy still covers reload. */ }
    }
  }
  async function confirm(key,expected){
    await Promise.all([...pending]);
    const record=lookup(key);
    if (!record || record.value!==expected) throw new Error('storage/changed');
    if (saved.get(key)?.value===expected) return;
    // sessionStorage alone does not survive a closed tab. Require a persistent
    // acknowledgment before a new campaign can displace the player's only save.
    scoped.setItem('local-campaign-slot:'+key,JSON.stringify(record));
  }
  return {getItem:key=>lookup(key)?.value??null,setItem:(key,v)=>write(key,String(v)),
    removeItem:key=>write(key,null),confirm};
}
