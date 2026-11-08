import {bootstrapUpdateCoordinator} from '../../../assets/js/platform-update-coordinator.js';
import {getSharedPlatformDiagnostics} from '../../../assets/js/diagnostics.js';
import {backend} from '../../../assets/js/backend.js?v=1.3.10';
import {mountReception} from './app.js';
import {prepareCalendars} from '../../../assets/js/calendar-repository.js';
import {esc} from './icons.js';

/** Offline first: use the supplied published calendar; fetch only when the current year is absent. */
export async function standaloneCalendar(options={}){
 try{return await prepareCalendars({...options,offline:true});}
 catch(error){if(error.code!=='calendar/current-unavailable')throw error;return prepareCalendars({...options,offline:false});}
}

export async function mountStandalone(root){
 const lifetime=new AbortController();const diagnosticService=getSharedPlatformDiagnostics({backend,getLocale:()=>document.documentElement.lang,getModule:()=> 'reception'});
 let diagnosticScope=diagnosticService.forModule('reception');
 const diagnostics={record:(...args)=>diagnosticScope.record(...args),error:(...args)=>diagnosticScope.error(...args),span:(...args)=>diagnosticScope.span(...args),destroy:()=>diagnosticScope.destroy()};
 void backend.ensureDiagnosticIdentity().then(()=>{if(lifetime.signal.aborted)return;diagnosticScope.destroy();diagnosticScope=diagnosticService.forModule('reception')}).catch(()=>{});
 const dialog=document.createElement('dialog');dialog.className='rx-help-dialog';dialog.setAttribute('aria-labelledby','rxHelpTitle');
 dialog.innerHTML=`<form method="dialog"><header><h2 id="rxHelpTitle">Работа с тренажёром</h2><button class="rx-help-close" aria-label="Закрыть справку">×</button></header></form>
 <p>Вы — сотрудник приёмной. Уточните обстоятельства, сопоставьте документы, найдите норму, рассчитайте срок и составьте план. После подтверждения решения прочитайте продолжение дела.</p>
 <p><strong>Обучение</strong> позволяет разбирать любую историю, получать объяснения и исправлять решения. <strong>Самостоятельная смена</strong> состоит из восьми дел без подсказок; итог — от 0 до 5 баллов. В автономной версии он остаётся на этом устройстве.</p>
 <p>В верхней части рабочего экрана находятся инструменты: приём, документы, источники, календарь, решение и история. Все действия доступны кнопками и с клавиатуры. Перетаскивать элементы не требуется.</p>
 <h3>Сохранение</h3><p>Ответы сохраняются автоматически. При следующем входе можно продолжить смену с того же места.</p>
 <h3>Календарь и источники</h3><p>Календарь закрепляется при создании смены. В источниках можно прочитать полные тексты и сопоставить их с материалами дела.</p>`;
 document.body.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 try{
  const cleanup=await mountReception(root,{diagnostics,standalone:true,editorTools:false,profileLabel:'Автономная работа',assessmentAllowed:false,calendarLoader:standaloneCalendar,onHelp:()=>dialog.showModal()});
  const adapter={module:'reception',prepareForUpdate:options=>dialog.open?Promise.resolve({status:'defer',code:'busy'}):cleanup.prepareForUpdate(options),resumeAfterUpdate:options=>cleanup.resumeAfterUpdate(options),cancelPreparation:options=>cleanup.cancelPreparation(options),commitPreparation:()=>cleanup.commitPreparation()};const coordinator=bootstrapUpdateCoordinator({getAdapters:()=>[adapter],backend,diagnostics,module:'reception',getOwner:()=> 'preview',getRoute:()=>location.hash});await coordinator.restorePending();
  return async()=>{coordinator.destroy();diagnostics.destroy();lifetime.abort();dialog.remove();await cleanup?.();};
 }catch(error){diagnostics.error(error,{event:'module-error',operation:'load'});root.innerHTML=`<section class="boot" role="alert"><h1>Не удалось открыть тренажёр</h1><p>${esc(error.message)}</p><p>Проверьте подключение и повторите загрузку.</p><button type="button" id="rxBootReload">Повторить</button></section>`;root.querySelector('#rxBootReload').onclick=()=>location.reload();}
}
