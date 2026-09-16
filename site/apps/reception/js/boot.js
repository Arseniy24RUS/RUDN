import {mountReception} from './app.js';
const root=document.getElementById('receptionApp');
const preview=new URLSearchParams(location.search).get('preview')==='1';
async function boot(){
 if(preview){await mountReception(root,{profileLabel:'Автономная тренировка',assessmentAllowed:false,onExit:()=>{location.href='?preview=1';}});return;}
 try{
  const {backend}=await import('../../../assets/js/backend.js?v=1.3.6');
  const {topicGate,academicContext}=await import('../../../assets/js/access.js?v=1.3.6');
  await backend.init();
  const now=Date.now()+Number(backend.serverTimeOffset||0),year=academicContext(now).startYear;
  const gate=topicGate(5,backend.getAccessOverrides(year),now),admin=backend.isAdmin();
  if(!admin&&!gate.open){root.innerHTML='<div class="boot"><h1>Семинар ещё не открыт</h1><p>Доступ определяется расписанием основной платформы. Завершённые черновики не удаляются.</p><p><a href="../../index.html#dashboard">Вернуться к курсу</a></p></div>';return;}
  if(!admin&&!backend.getProfile()){root.innerHTML='<div class="boot"><h1>Войдите в профиль платформы</h1><p>Смена должна сохраняться под вашим студенческим профилем.</p><p><a href="../../index.html#activity/seminar-5">Открыть семинар на платформе</a></p><p><a href="?preview=1">Автономная тренировка без оценки</a></p></div>';return;}
  await mountReception(root,{backend,period:`${year}-${year+1}`,assessmentAllowed:()=>{const n=Date.now()+Number(backend.serverTimeOffset||0);return topicGate(5,backend.getAccessOverrides(academicContext(n).startYear),n).open;},onExit:()=>{location.href='../../index.html#dashboard';}});
 }catch(error){
  console.warn('Reception platform connection unavailable',error?.code||error?.message);
  root.innerHTML='<div class="boot"><h1>Подключение к платформе недоступно</h1><p>Этот файл предназначен для установки в репозиторий RUDN. Для просмотра без профиля откройте автономную тренировку.</p><p><a href="?preview=1">Открыть автономную тренировку</a></p><p><a href="../../index.html#dashboard">Вернуться к курсу</a></p></div>';
 }
}
boot();
