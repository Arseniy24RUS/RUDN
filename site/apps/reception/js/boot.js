import {bootstrapUpdateCoordinator} from '../../../assets/js/platform-update-coordinator.js';
import {getSharedPlatformDiagnostics} from '../../../assets/js/diagnostics.js';
import {backend as sharedBackend} from '../../../assets/js/backend.js?v=1.3.10';
import {attemptOwner} from '../../../assets/js/attempt-session.js?v=1.3.10';
import {resourceURL} from '../../../assets/js/release-resources.js';
import {mountReception} from './app.js';
const root=document.getElementById('receptionApp');
const preview=new URLSearchParams(location.search).get('preview')==='1';
const diagnosticService=getSharedPlatformDiagnostics({backend:sharedBackend,getLocale:()=>document.documentElement.lang,getModule:()=> 'reception'});let diagnostics=diagnosticService.forModule('reception');
async function mount(options){const handle=await mountReception(root,{...options,diagnostics});const coordinator=bootstrapUpdateCoordinator({getAdapters:()=>[handle],backend:sharedBackend,diagnostics,module:'reception',getOwner:()=>preview?'preview':attemptOwner(),getRoute:()=>String(preview)+location.hash});await coordinator.restorePending();}
async function boot(){
 if(preview){await mount({profileLabel:'Автономная тренировка',assessmentAllowed:false,onExit:()=>{location.href='?preview=1';}});return;}
 try{
  const {backend}=await import('../../../assets/js/backend.js?v=1.3.10');
  const {topicGate,academicContext}=await import('../../../assets/js/access.js?v=1.3.10');
  const {seminarTopic}=await import('../../../assets/js/seminar-modules.js');
  const courseResponse=await fetch(resourceURL('../../../data/course.json',import.meta.url));
  if(!courseResponse.ok)throw new Error('Course catalogue unavailable');
  const topic=seminarTopic(await courseResponse.json(),'reception');
  if(!topic)throw new Error('Reception topic missing');
  await backend.init();diagnostics.destroy();diagnostics=diagnosticService.forModule('reception');
  const now=Date.now()+Number(backend.serverTimeOffset||0),year=academicContext(now).startYear;
  const gate=topicGate(topic.number,backend.getAccessOverrides(year),now),admin=backend.isAdmin();
  if(!admin&&!gate.open){root.innerHTML='<div class="boot"><h1>Семинар ещё не открыт</h1><p>Доступ определяется расписанием основной платформы. Завершённые черновики не удаляются.</p><p><a href="../../index.html#dashboard">Вернуться к курсу</a></p></div>';return;}
  if(!admin&&!backend.getProfile()){root.innerHTML='<div class="boot"><h1>Войдите в профиль платформы</h1><p>Смена должна сохраняться под вашим студенческим профилем.</p><p><a href="../../index.html#activity/seminar-5">Открыть семинар на платформе</a></p><p><a href="?preview=1">Автономная тренировка без оценки</a></p></div>';return;}
  await mount({backend,period:`${year}-${year+1}`,assessmentAllowed:()=>{const n=Date.now()+Number(backend.serverTimeOffset||0);return topicGate(topic.number,backend.getAccessOverrides(academicContext(n).startYear),n).open;},onExit:()=>{location.href='../../index.html#dashboard';}});
 }catch(error){
  diagnostics.error(error,{event:'module-error',code:'load-failed',operation:'load'});console.warn('Reception platform connection unavailable',error?.code||error?.message);
  root.innerHTML='<div class="boot"><h1>Подключение к платформе недоступно</h1><p>Этот файл предназначен для установки в репозиторий RUDN. Для просмотра без профиля откройте автономную тренировку.</p><p><a href="?preview=1">Открыть автономную тренировку</a></p><p><a href="../../index.html#dashboard">Вернуться к курсу</a></p></div>';
 }
}
boot();
