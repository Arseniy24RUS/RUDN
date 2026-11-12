import {bootstrapUpdateCoordinator} from '../../../assets/js/platform-update-coordinator.js';
import {getSharedPlatformDiagnostics} from '../../../assets/js/diagnostics.js';
import {backend as sharedBackend} from '../../../assets/js/backend.js?v=1.3.10';
import {attemptOwner} from '../../../assets/js/attempt-session.js?v=1.3.10';
import {resourceURL} from '../../../assets/js/release-resources.js';
import {mountReception} from '../ai/entry.js';
import {RECEPTION_AI_CONFIG} from '../ai/config.js';
const root=document.getElementById('receptionApp');
const preview=new URLSearchParams(location.search).get('preview')==='1';
const copy={
 ru:{closed:'Семинар ещё не открыт',schedule:'Приёмная будет доступна по расписанию курса.',login:'Войдите в профиль платформы',profile:'Откройте приёмную из своего профиля.',unavailable:'Связь с приёмной недоступна',retry:'Попробуйте открыть приёмную ещё раз.',course:'Вернуться к курсу'},
 en:{closed:'This seminar is not open yet',schedule:'Reception will be available according to the course schedule.',login:'Sign in to your platform profile',profile:'Open reception from your profile.',unavailable:'Reception is temporarily unavailable',retry:'Please try opening reception again.',course:'Back to course'},
 zh:{closed:'本次研讨课尚未开放',schedule:'接待室将按课程安排开放。',login:'请登录平台个人资料',profile:'请从个人资料中打开接待室。',unavailable:'暂时无法连接接待室',retry:'请稍后重新打开接待室。',course:'返回课程'}
};
const notice=(title,body)=>{const t=copy[document.documentElement.lang]||copy.ru;root.innerHTML=`<div class="boot"><h1>${t[title]}</h1><p>${t[body]}</p><p><a href="../../index.html#dashboard">${t.course}</a></p></div>`;};
const diagnosticService=getSharedPlatformDiagnostics({backend:sharedBackend,getLocale:()=>document.documentElement.lang,getModule:()=> 'reception'});let diagnosticScope=diagnosticService.forModule('reception');
const diagnostics={record:(...args)=>diagnosticScope.record(...args),error:(...args)=>diagnosticScope.error(...args),span:(...args)=>diagnosticScope.span(...args)};
const rebindDiagnostics=()=>{diagnosticScope.destroy();diagnosticScope=diagnosticService.forModule('reception');};
async function mount(options){const handle=await mountReception(root,{...options,diagnostics});const coordinator=bootstrapUpdateCoordinator({getAdapters:()=>[handle],backend:sharedBackend,diagnostics,module:'reception',getOwner:()=>preview&&!RECEPTION_AI_CONFIG.enabled?'preview':attemptOwner(),getRoute:()=>String(preview)+location.hash});await coordinator.restorePending();}
async function boot(){
 if(preview&&!RECEPTION_AI_CONFIG.enabled){void sharedBackend.ensureDiagnosticIdentity().then(rebindDiagnostics).catch(()=>{});await mount({profileLabel:'Автономная тренировка',assessmentAllowed:false,onExit:()=>{location.href='?preview=1';}});return;}
 try{
  const {backend}=await import('../../../assets/js/backend.js?v=1.3.10');
  const {topicGate,academicContext}=await import('../../../assets/js/access.js?v=1.3.10');
  const {seminarTopic}=await import('../../../assets/js/seminar-modules.js');
  const courseResponse=await fetch(resourceURL('../../../data/course.json',import.meta.url));
  if(!courseResponse.ok)throw new Error('Course catalogue unavailable');
  const topic=seminarTopic(await courseResponse.json(),'reception');
  if(!topic)throw new Error('Reception topic missing');
  await backend.init();rebindDiagnostics();
  const now=Date.now()+Number(backend.serverTimeOffset||0),year=academicContext(now).startYear;
  const gate=topicGate(topic.number,backend.getAccessOverrides(year),now),admin=backend.isAdmin();
  if(!admin&&(!preview||!RECEPTION_AI_CONFIG.enabled)&&!gate.open){if(!RECEPTION_AI_CONFIG.enabled)root.innerHTML='<div class="boot"><h1>Семинар ещё не открыт</h1><p>Доступ определяется расписанием основной платформы. Завершённые черновики не удаляются.</p><p><a href="../../index.html#dashboard">Вернуться к курсу</a></p></div>';else notice('closed','schedule');return;}
  if(!admin&&!backend.getProfile()){if(!RECEPTION_AI_CONFIG.enabled)root.innerHTML='<div class="boot"><h1>Войдите в профиль платформы</h1><p>Смена должна сохраняться под вашим студенческим профилем.</p><p><a href="../../index.html#activity/seminar-5">Открыть семинар на платформе</a></p><p><a href="?preview=1">Автономная тренировка без оценки</a></p></div>';else notice('login','profile');return;}
  await mount({backend,context:preview?'free':'course',period:`${year}-${year+1}`,assessmentAllowed:()=>{if(preview)return false;const n=Date.now()+Number(backend.serverTimeOffset||0);return topicGate(topic.number,backend.getAccessOverrides(academicContext(n).startYear),n).open;},onExit:()=>{location.href='../../index.html#dashboard';}});
 }catch(error){
  diagnostics.error(error,{event:'module-error',code:'load-failed',operation:'load'});console.warn('Reception platform connection unavailable',error?.code||error?.message);
  if(!RECEPTION_AI_CONFIG.enabled)root.innerHTML='<div class="boot"><h1>Подключение к платформе недоступно</h1><p>Этот файл предназначен для установки в репозиторий RUDN. Для просмотра без профиля откройте автономную тренировку.</p><p><a href="?preview=1">Открыть автономную тренировку</a></p><p><a href="../../index.html#dashboard">Вернуться к курсу</a></p></div>';
  else notice('unavailable','retry');
 }
}
boot();
