/** Per-deployment storage, with optimistic concurrency: a stale tab must not overwrite
 * a newer one silently. No account, cross-site identifier or network transmission. */
export function deploymentScope(href = globalThis.location?.href || 'http://local.invalid/') {
  try { const u=new URL(href); if(!['http:','https:'].includes(u.protocol))return '/'; return u.pathname.endsWith('/') ? u.pathname : u.pathname.slice(0,u.pathname.lastIndexOf('/')+1); }
  catch { return '/'; }
}
export function storageKey(name) { return __careerHost.storageKey(name); }
const observed = new Map();
export function readLocal(key) {
  const value=localStorage.getItem(key); observed.set(key,value); return value;
}
export function writeLocal(key,value) {
  const current=localStorage.getItem(key);
  if(observed.has(key) && current!==observed.get(key)) {
    const e=new Error('storage-conflict');
    if(typeof document!=='undefined')document.dispatchEvent(new CustomEvent('app:storage-conflict',{detail:{key}}));
    throw e;
  }
  localStorage.setItem(key,String(value)); observed.set(key,String(value));
}
export function removeLocal(key) { writeLocal(key,''); localStorage.removeItem(key); observed.set(key,null); }
export function resetObserved(key) { observed.delete(key); }
