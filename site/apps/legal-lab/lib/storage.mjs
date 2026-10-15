import {uid} from './core.mjs';
const DB='rudn-legal-lab-v1', TABLE='records';
export class RevisionConflict extends Error { constructor(){super('Работа изменена в другой вкладке. Обновите страницу, чтобы продолжить.');this.name='RevisionConflict';} }
export class Store {
  constructor(namespace){this.namespace=namespace;this.db=null;this.mode='indexeddb';this.opening=null;}
  key(key){return `${this.namespace}::${key}`;}
  async open(){
    if(this.db)return this.db;if(this.opening)return this.opening;
    this.opening=new Promise((resolve,reject)=>{
      if(!globalThis.indexedDB){reject(new Error('IndexedDB is unavailable'));return;}
      const r=indexedDB.open(DB,1);
      r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(TABLE))r.result.createObjectStore(TABLE);};
      r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Закройте старую вкладку модуля и повторите.'));
      r.onsuccess=()=>{this.db=r.result;this.db.onversionchange=()=>this.close();resolve(this.db);};
    }).catch(e=>{this.mode='localStorage';this.opening=null;try{const k='ll-storage-probe';localStorage.setItem(k,'1');localStorage.removeItem(k);}catch{throw new Error('Хранилище браузера недоступно. Ответы нельзя надёжно сохранить.');}return null;});
    return this.opening;
  }
  async get(key){
    const db=await this.open(), k=this.key(key);
    if(!db){const raw=localStorage.getItem(k);return raw?JSON.parse(raw):null;}
    return new Promise((resolve,reject)=>{const t=db.transaction(TABLE,'readonly'),r=t.objectStore(TABLE).get(k);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});
  }
  async put(key,value,expectedRevision=null){
    const db=await this.open(),k=this.key(key);
    if(!db){
      const commit=()=>{const raw=localStorage.getItem(k),prior=raw?JSON.parse(raw):null;if(expectedRevision!==null&&(prior?.revision||0)!==expectedRevision)throw new RevisionConflict();const row={revision:(prior?.revision||0)+1,value:structuredClone(value),updatedAt:Date.now()};localStorage.setItem(k,JSON.stringify(row));return row;};
      return navigator.locks?navigator.locks.request(`ll-cas:${k}`,commit):commit();
    }
    return new Promise((resolve,reject)=>{
      const t=db.transaction(TABLE,'readwrite'),s=t.objectStore(TABLE),r=s.get(k);let result,error;
      r.onsuccess=()=>{const prior=r.result;if(expectedRevision!==null&&(prior?.revision||0)!==expectedRevision){error=new RevisionConflict();t.abort();return;}result={revision:(prior?.revision||0)+1,value:structuredClone(value),updatedAt:Date.now()};s.put(result,k);};
      t.oncomplete=()=>resolve(result);t.onabort=()=>reject(error||t.error||new Error('Не удалось сохранить работу'));t.onerror=()=>{};
    });
  }
  async remove(key){const db=await this.open(),k=this.key(key);if(!db){localStorage.removeItem(k);return;}return new Promise((resolve,reject)=>{const t=db.transaction(TABLE,'readwrite');t.objectStore(TABLE).delete(k);t.oncomplete=resolve;t.onabort=()=>reject(t.error);});}
  close(){this.db?.close();this.db=null;this.opening=null;}
}
/** Cross-tab editor lock. IndexedDB CAS remains authoritative on older browsers. */
export async function editorLease(namespace){
  if(!globalThis.navigator?.locks)return {acquired:true,release(){},fallback:true};
  let release,resolve;const ready=new Promise(r=>resolve=r),hold=new Promise(r=>release=r);
  navigator.locks.request(`legal-lab-editor:${namespace}`,{ifAvailable:true},async lock=>{resolve(Boolean(lock));if(lock)await hold;}).catch(()=>resolve(false));
  return {acquired:await ready,release:()=>release?.()};
}
export function freshState(version){return {schema:1,contentVersion:version,id:uid(),startedAt:Date.now(),answers:{},index:0,reader:{},assessment:null,elapsedMs:0,view:'home'};}
