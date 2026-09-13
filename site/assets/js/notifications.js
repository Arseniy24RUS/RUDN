import {getLocale} from './i18n.js?v=1.3.3';

const COPY={
  ru:{network:'Нет соединения с сервером. Проверьте интернет и повторите попытку.',credentials:'Неверный email или пароль.',limited:'Слишком много попыток. Попробуйте немного позже.',disabled:'Доступ к этому аккаунту отключён.',permission:'Недостаточно прав для этой операции.',unknown:'Не удалось выполнить операцию. Повторите попытку.',unavailable:'Сервис временно недоступен.',storage:'Не удалось сохранить работу на устройстве. Не закрывайте задание. Скачайте резервную копию ответов.',slow:'Сервер отвечает медленно. Ожидаем соединения…',details:'Код ошибки',close:'Закрыть',export:'Скачать резервную копию',exporting:'Подготовка копии…',exportFailed:'Не удалось подготовить полную копию. Не закрывайте задание.',notifications:'Сообщения'},
  en:{network:'Cannot connect to the server. Check your connection and try again.',credentials:'Incorrect email or password.',limited:'Too many attempts. Please try again later.',disabled:'This account has been disabled.',permission:'You do not have permission for this operation.',unknown:'The operation could not be completed. Please try again.',unavailable:'The service is temporarily unavailable.',storage:'Your work could not be saved on this device. Keep the activity open and download a backup of your answers.',slow:'The server is responding slowly. Waiting for a connection…',details:'Error code',close:'Close',export:'Download a backup',exporting:'Preparing backup…',exportFailed:'A complete backup could not be prepared. Keep the activity open.',notifications:'Notifications'},
  zh:{network:'无法连接服务器。请检查网络后重试。',credentials:'电子邮箱或密码错误。',limited:'尝试次数过多，请稍后重试。',disabled:'此账户已被停用。',permission:'您没有执行此操作的权限。',unknown:'操作未能完成，请重试。',unavailable:'服务暂时不可用。',storage:'无法在此设备上保存作业。请勿关闭作业，并下载答案备份。',slow:'服务器响应缓慢，正在等待连接……',details:'错误代码',close:'关闭',export:'下载备份',exporting:'正在准备备份……',exportFailed:'无法生成完整备份。请勿关闭作业。',notifications:'通知'}
};
export const notificationText=key=>(COPY[getLocale()]||COPY.ru)[key];
const isStorageError=error=>Object.values(COPY).some(copy=>copy.storage===error)||/quota|storage-full|storage-error|local-save-failed|indexeddb|securityerror/i.test(String(error?.code||'')+' '+String(error?.name||'')+' '+String(error?.message||''));
export function errorText(error){
  const code=String(error?.code||error?.name||'');const message=String(error?.message||error||'');const text=code+' '+message;
  if(isStorageError(error))return notificationText('storage');
  if(/network|offline|timeout|fetch|connection|unavailable/i.test(text))return notificationText('network');
  if(/invalid-credential|wrong-password|user-not-found|invalid-email/i.test(text))return notificationText('credentials');
  if(/too-many-requests/i.test(text))return notificationText('limited');
  if(/user-disabled/i.test(text))return notificationText('disabled');
  if(/permission|denied|admin-required/i.test(text))return notificationText('permission');
  if(/unauthorized-domain|operation-not-allowed|api-key/i.test(text))return notificationText('unavailable');
  if(/invalid-identifier/i.test(text))return getLocale()==='en'?'Enter a student ID number or a RUDN corporate email.':getLocale()==='zh'?'请输入学号或俄罗斯人民友谊大学企业邮箱。':'Введите номер студенческого билета или корпоративный email РУДН.';
  return getLocale()==='ru'&&/[а-яё]/i.test(message)&&!message.includes('FirebaseError')?message:notificationText('unknown');
}

const notices=new Map(),dialogHosts=new WeakMap(),recoveryProviders=new Set(),inlineErrors=new Map();
let initialized=false,pageHost;
let recoveryOwner=()=>null;
export function setRecoveryOwnerProvider(provider){recoveryOwner=provider}

// Providers may include the current in-memory answer when storage itself is unavailable.
export function registerRecoveryProvider(provider){
  recoveryProviders.add(provider);return()=>recoveryProviders.delete(provider);
}
const sensitiveKey=key=>/password|passphrase|secret|token|credential|api.?key|firebase.?auth|stsTokenManager/i.test(key);
function sanitized(value){
  return JSON.parse(JSON.stringify(value,(key,item)=>sensitiveKey(key)?undefined:item));
}
export async function exportRecovery(){
  const owner=recoveryOwner(),studentKey=owner?.startsWith('student:')?owner.slice(8):null;
  const backup={format:'rudn-local-recovery',version:1,exportedAt:new Date().toISOString(),localStorage:{},work:[],incomplete:false};
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      // Teacher journal caches contain other people's records, not this device's unsent work.
      if(!key?.startsWith('rudn.')||sensitiveKey(key)||key.startsWith('rudn.teacher-cache.'))continue;
      const raw=localStorage.getItem(key);try{
        let value=JSON.parse(raw);
        if(key==='rudn.grades.v2')value=studentKey&&value[studentKey]?{[studentKey]:value[studentKey]}:null;
        else if(Array.isArray(value))value=value.filter(item=>studentKey&&item?.studentKey===studentKey||owner&&item?.owner===owner);
        else if(value?.owner?value.owner!==owner:value?.studentKey?value.studentKey!==studentKey:!key.includes(owner||'no-owner'))continue;
        if(value!=null)backup.localStorage[key]=sanitized(value);
      }catch{if(key==='rudn.locale')backup.localStorage[key]=raw}
    }
  }catch{backup.incomplete=true}
  for(const provider of recoveryProviders){try{const value=await provider();if(value!=null)backup.work.push(sanitized(value))}catch{backup.incomplete=true}}
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='rudn-answers-'+backup.exportedAt.slice(0,19).replaceAll(':','-')+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  return backup;
}

function makeHost(host=document.createElement('div')){
  host.removeAttribute('popover');host.removeAttribute('aria-live');host.className='toast-stack rudn-notices';host.setAttribute('aria-label',notificationText('notifications'));host.hidden=true;return host;
}
function currentHost(){
  // Hosts never enter the popover top layer. Each modal owns its normal-flow host.
  const dialog=document.activeElement?.closest('dialog[open]')||[...document.querySelectorAll('dialog[open]')].at(-1);
  if(dialog){
    let host=dialogHosts.get(dialog);
    const target=dialog.querySelector('.modal-card')||dialog;
    if(!host){host=makeHost();host.classList.add('rudn-notices-dialog');dialogHosts.set(dialog,host)}
    if(host.parentElement!==target)target.prepend(host);
    return host;
  }
  if(!pageHost)pageHost=makeHost(document.getElementById('toastStack')||undefined);
  const target=document.getElementById('app')||document.querySelector('main')||document.body;
  if(pageHost.parentElement!==target)target.prepend(pageHost);
  return pageHost;
}
function syncHosts(){
  if(!notices.size){document.querySelectorAll('.rudn-notices').forEach(host=>{host.hidden=true});return}
  const host=currentHost();
  for(const entry of notices.values())if(entry.node.parentElement!==host)host.append(entry.node);
  document.querySelectorAll('.rudn-notices').forEach(item=>{item.hidden=item!==host||!item.childElementCount});
}
function removeNotice(key){
  const entry=notices.get(key);if(!entry)return;clearTimeout(entry.timer);entry.node.remove();notices.delete(key);syncHosts();
}
function renew(entry,timeout){
  clearTimeout(entry.timer);
  if(!entry.critical&&timeout>0)entry.timer=setTimeout(()=>removeNotice(entry.key),entry.type==='error'?Math.max(timeout,12000):timeout);
}
export function toast(message,type='info',timeout=5000,options={}){
  initNotifications();
  const critical=Boolean(options.critical||isStorageError(message));
  const text=critical?notificationText('storage'):message instanceof Error||message?.code?errorText(message):String(message??'').trim();
  if(!text)return;
  type=['info','success','error'].includes(type)?type:'info';
  const key=critical?'storage-critical':type+':'+text;
  if(notices.has(key)){renew(notices.get(key),timeout);syncHosts();return}
  if(notices.size>=2){
    const expendable=[...notices.values()].find(entry=>!entry.critical);
    if(!expendable&&!critical)return;
    removeNotice((expendable||notices.values().next().value).key);
  }
  const node=document.createElement('div');node.className='rudn-notice rudn-notice-'+type;
  node.setAttribute('role',type==='error'||critical?'alert':'status');node.setAttribute('aria-atomic','true');
  const content=document.createElement('div');content.className='rudn-notice-content';
  const copy=document.createElement('span');copy.textContent=text;content.append(copy);node.append(content);
  if(critical){
    node.dataset.critical='true';
    const action=document.createElement('button');action.type='button';action.className='rudn-notice-export';action.textContent=notificationText('export');
    action.onclick=async()=>{
      action.disabled=true;action.textContent=notificationText('exporting');
      try{const result=await exportRecovery();if(result.incomplete)copy.textContent=notificationText('exportFailed')}
      catch{copy.textContent=notificationText('exportFailed')}
      finally{action.disabled=false;action.textContent=notificationText('export')}
    };content.append(action);
  }
  const close=document.createElement('button');close.type='button';close.className='rudn-notice-close';close.textContent='×';close.setAttribute('aria-label',notificationText('close'));close.onclick=()=>removeNotice(key);node.append(close);
  const entry={key,node,copy,message,type,critical};notices.set(key,entry);renew(entry,timeout);syncHosts();
}
function renderFormError(element,error){
  if(!element)return;
  element.replaceChildren();element.hidden=false;element.setAttribute('role','alert');element.append(document.createTextNode(errorText(error)));
  const code=String(error?.code||'');if(/^[a-z0-9_/-]{1,80}$/i.test(code)){const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=notificationText('details');detail.append(summary,document.createTextNode(code));element.append(detail)}
}
export function formError(element,error){
  if(!element)return;
  inlineErrors.set(element,error);renderFormError(element,error);
  if(isStorageError(error))toast(error,'error',0);
}
export function initNotifications(){
  if(initialized||!document.body)return;initialized=true;
  // Reattach normal-flow notices if the SPA replaces #app, or a modal opens/closes.
  new MutationObserver(syncHosts).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
  window.addEventListener('rudn:toast',event=>toast(event.detail?.message,event.detail?.type||'info',event.detail?.timeout??5000,{critical:event.detail?.critical}));
  window.addEventListener('rudn:locale',()=>{
    for(const entry of notices.values()){
      if(entry.critical)entry.copy.textContent=notificationText('storage');
      else if(entry.message instanceof Error||entry.message?.code)entry.copy.textContent=errorText(entry.message);
      entry.node.querySelector('.rudn-notice-close').setAttribute('aria-label',notificationText('close'));
      const action=entry.node.querySelector('.rudn-notice-export');if(action)action.textContent=notificationText(action.disabled?'exporting':'export');
    }
    for(const [element,error]of inlineErrors){if(element.isConnected&&!element.hidden)renderFormError(element,error);else inlineErrors.delete(element)}
  });
}
