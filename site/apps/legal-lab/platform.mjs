import {mountLegalLab} from './entry.mjs';
import {FirebaseLive} from './lib/live.mjs';
import {createLegalLabPersistence,legalLabAttemptForCourse} from '../../assets/js/legal-lab-storage.js';
/** No Firebase initializeApp, new authentication, iframe, or service worker. */
export async function mountLegalLabInCourse(root,{backend,rootPath,owner,getOwner,period,groups,locale,signal,assessmentAllowed,onExit,checkpoint}={}){
  if(!backend||typeof backend.getProfile!=='function'||typeof backend.saveAttempt!=='function')throw new TypeError('The existing course backend is required');
  const teacher=backend.isAdmin();const profile=backend.getProfile();
  const response=await fetch(new URL('./data/catalog.json',import.meta.url),{signal,credentials:'same-origin',cache:'no-cache'});
  if(!response.ok)throw new Error('The document catalogue could not be loaded');
  const catalog=await response.json();
  let handle=null,conflictPanel=null,destroyed=false,currentLocale=locale;
  const mount=document.createElement('div');
  root.replaceChildren(mount);
  const copy={ru:['Работа изменена на другом устройстве','Оба варианта сохранены. Выберите, какой продолжить.','Продолжить на этом устройстве','Продолжить облачный вариант','Не удалось выбрать вариант. Подключитесь к сети и повторите.'],en:['Your work changed on another device','Both versions are saved. Choose which one to continue.','Continue this device’s version','Continue the cloud version','The version could not be selected. Reconnect and try again.'],zh:['作业已在另一台设备上更改','两个版本均已保存，请选择要继续的版本。','继续本设备版本','继续云端版本','未能选择版本，请联网后重试。']};
  function showConflict(){
    if(destroyed||signal?.aborted||conflictPanel)return;
    mount.inert=true;
    const text=copy[currentLocale]||copy.ru;
    conflictPanel=document.createElement('section');conflictPanel.className='panel';conflictPanel.setAttribute('role','alert');
    const heading=document.createElement('h2');heading.textContent=text[0];
    const lead=document.createElement('p');lead.textContent=text[1];
    conflictPanel.append(heading,lead);
    for(const [index,choice] of ['local','cloud'].entries()){
      const button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.textContent=text[index+2];
      button.onclick=async()=>{button.disabled=true;try{await persistence.resolve(choice);location.reload();}catch(error){button.disabled=false;lead.textContent=text[4];}};
      conflictPanel.append(button);
    }
    root.prepend(conflictPanel);
  }
  const persistence=createLegalLabPersistence({backend,owner,getOwner,period,contentVersion:catalog.contentVersion,onConflict:showConflict});
  const initialState=await persistence.load();
  if(signal?.aborted){persistence.destroy();throw new DOMException('Aborted','AbortError');}
  // A pending choice is resolved before mounting: the device mirror cannot
  // silently replace a retained branch from a second device.
  if(persistence.conflicted)showConflict();
  const moduleBackend=new Proxy(backend,{get(target,key){
    if(key==='saveAttempt')return attempt=>persistence.saveAttempt(legalLabAttemptForCourse(attempt));
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  handle = await mountLegalLab(mount,{
    backend:moduleBackend,owner,getOwner,period,locale,signal,onExit,
    initialState,attemptId:persistence.attemptId,
    checkpoint:async value=>{await persistence.checkpoint(value);await checkpoint?.(value);},
    isTeacher:teacher,group:profile?.group,groups:groups?.length?groups:undefined,
    // Pseudorandom per-profile assignment: same case on another device in the
    // same academic period/version. This is not cryptographic exam protection.
    assignmentSeed:teacher?undefined:`${owner}|${period}|seminar-4`,
    assessmentAllowed:()=>Boolean(backend.getProfile())&&!backend.isAdmin()&&Boolean(assessmentAllowed?.()),
    liveFactory:({contentVersion,signal:liveSignal})=>backend.user?.uid&&(backend.isAdmin()||backend.getProfile()?.studentKey)?new FirebaseLive({backend,rootPath,contentVersion,signal:liveSignal}):null
  });
  if(!signal?.aborted)void warmCourseCache(handle.contentVersion,signal);
  return {contentVersion:handle.contentVersion,getReport:()=>handle.getReport(),
    async flush(){await handle.flush();await persistence.flush();},
    async setLocale(next){currentLocale=next;if(conflictPanel){conflictPanel.remove();conflictPanel=null;showConflict();}await handle.setLocale(next);},
    async destroy(){destroyed=true;try{await handle.destroy();}finally{persistence.destroy();}}};
}

/** Existing service-worker.js accepts PREPARE_MODULE.urls, so no second worker
 * and no change to seminar-1/other module caching is needed. */
export async function warmCourseCache(contentVersion,signal){
  const worker=globalThis.navigator?.serviceWorker?.controller;if(!worker)return false;
  try{
    const response=await fetch(new URL('./precache-manifest.json',import.meta.url),{signal,credentials:'same-origin',cache:'no-cache'});
    if(!response.ok)return false;const manifest=await response.json();
    if(manifest.contentVersion!==contentVersion||!Array.isArray(manifest.files))return false;
    const scope=new URL('../../',import.meta.url),prefix=new URL('./',import.meta.url);
    // Full acts and their annex images are fetched by the reader when needed.
    // The course worker then retains visited documents for offline reading.
    const urls=manifest.files.map(f=>new URL(f.url,scope)).filter(u=>u.origin===prefix.origin&&u.pathname.startsWith(prefix.pathname)&&!u.pathname.includes('/data/documents/')&&!u.search&&!u.hash).map(u=>u.href);
    for(let offset=0;offset<urls.length;offset+=200){
      if(signal?.aborted)return false;
      const ready=await new Promise(resolve=>{
        const requestId=crypto.randomUUID();
        const finish=value=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',listener);resolve(value);};
        const listener=event=>{if(event.data?.type==='MODULE_CACHE_STATUS'&&event.data.requestId===requestId)finish(event.data.ready===true);};
        const timer=setTimeout(()=>finish(false),20000);
        navigator.serviceWorker.addEventListener('message',listener);
        worker.postMessage({type:'PREPARE_MODULE',module:'legal-lab',requestId,urls:urls.slice(offset,offset+200)});
      });
      if(!ready)return false;
    }
    return true;
  }catch{return false;}
}

