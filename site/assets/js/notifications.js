import {getLocale} from './i18n.js?v=1.2.0';
const COPY={
  ru:{network:'Нет соединения с сервером. Проверьте интернет и повторите попытку.',credentials:'Неверный email или пароль.',limited:'Слишком много попыток. Попробуйте немного позже.',disabled:'Доступ к этому аккаунту отключён.',permission:'Недостаточно прав для этой операции.',unknown:'Не удалось выполнить операцию. Повторите попытку.',unavailable:'Сервис временно недоступен.',storage:'На устройстве недостаточно места для сохранения. Не закрывайте задание.',slow:'Сервер отвечает медленно. Ожидаем соединения…',details:'Код ошибки',close:'Закрыть'},
  en:{network:'Cannot connect to the server. Check your connection and try again.',credentials:'Incorrect email or password.',limited:'Too many attempts. Please try again later.',disabled:'This account has been disabled.',permission:'You do not have permission for this operation.',unknown:'The operation could not be completed. Please try again.',unavailable:'The service is temporarily unavailable.',storage:'Not enough space to save on this device. Keep the activity open.',slow:'The server is responding slowly. Waiting for a connection…',details:'Error code',close:'Close'},
  zh:{network:'无法连接服务器。请检查网络后重试。',credentials:'电子邮箱或密码错误。',limited:'尝试次数过多，请稍后重试。',disabled:'此账户已被停用。',permission:'您没有执行此操作的权限。',unknown:'操作未能完成，请重试。',unavailable:'服务暂时不可用。',storage:'设备存储空间不足。请勿关闭作业。',slow:'服务器响应缓慢，正在等待连接……',details:'错误代码',close:'关闭'}
};
export const notificationText=key=>(COPY[getLocale()]||COPY.ru)[key];
export function errorText(error){
  const code=String(error?.code||error?.name||'');const message=String(error?.message||error||'');const text=code+' '+message;
  if(/quota|storage-full/i.test(text))return notificationText('storage');
  if(/network|offline|timeout|fetch|connection|unavailable/i.test(text))return notificationText('network');
  if(/invalid-credential|wrong-password|user-not-found|invalid-email/i.test(text))return notificationText('credentials');
  if(/too-many-requests/i.test(text))return notificationText('limited');
  if(/user-disabled/i.test(text))return notificationText('disabled');
  if(/permission|denied|admin-required/i.test(text))return notificationText('permission');
  if(/unauthorized-domain|operation-not-allowed|api-key/i.test(text))return notificationText('unavailable');
  return getLocale()==='ru'&&/[а-яё]/i.test(message)&&!message.includes('FirebaseError')?message:notificationText('unknown');
}
function positionHost(){
  const host=document.getElementById('toastStack');if(!host)return;
  const dialogs=[...document.querySelectorAll('dialog[open]')];const parent=dialogs.at(-1)||document.body;
  if(host.parentElement!==parent){try{host.hidePopover?.()}catch{};parent.append(host)}
  if(host.childElementCount){try{host.hidePopover?.();host.showPopover?.()}catch{}}
  else try{host.hidePopover?.()}catch{}
}
export function toast(message,type='info',timeout=5000){
  const host=document.getElementById('toastStack');if(!host)return;
  host.setAttribute('popover','manual');
  const node=document.createElement('div');node.className=`toast ${type}`;node.setAttribute('role',type==='error'?'alert':'status');
  const text=document.createElement('span');text.textContent=message instanceof Error?errorText(message):String(message);node.append(text);
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',notificationText('close'));close.onclick=()=>{node.remove();positionHost()};node.append(close);host.append(node);positionHost();
  if(timeout>0)setTimeout(()=>{node.remove();positionHost()},type==='error'?Math.max(timeout,12000):timeout);
}
export function formError(element,error){
  element.replaceChildren();element.hidden=false;const text=errorText(error);element.append(document.createTextNode(text));
  const code=String(error?.code||'');if(/^[a-z0-9_/-]{1,80}$/i.test(code)){const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=notificationText('details');detail.append(summary,document.createTextNode(code));element.append(detail)}
  toast(text,'error');
}
let initialized=false;
export function initNotifications(){
  if(initialized)return;initialized=true;
  new MutationObserver(positionHost).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  window.addEventListener('rudn:toast',event=>toast(event.detail?.message||'',event.detail?.type||'info'));
}
