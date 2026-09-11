/* Application shell, offline lifecycle and readable reports; no authentication. */
(function(root){
 'use strict';
 const G=root.GovernorGame;
 let hooks,language='ru',waitingWorker=null,offlineReady=false,activated=false;
 const tr=(r,e)=>language==='en'?e:r;
 const $=s=>document.querySelector(s);
 function button(label,fn,cls='secondary-button'){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=fn;return b;}
 function dialog(id,title){const d=document.createElement('dialog');d.id=id;d.className='release-dialog';d.setAttribute('aria-label',title);document.body.append(d);return d;}
 function closeButton(d){return button(tr('Закрыть','Close'),()=>d.close(),'secondary-button release-close');}
 function openGuide(){const d=$('#learning-dialog');d.innerHTML=G.Learning.guide(language);d.prepend(closeButton(d));if(!d.open)d.showModal();}
 function downloadHtml(){const s=hooks.state();if(!s)return;const url=URL.createObjectURL(new Blob([G.Learning.documentHtml(s,language)],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`governor-${s.sessionId}-report-${language}.html`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function openReport(){const s=hooks.state();if(!s)return;const d=$('#learning-report');d.innerHTML='<div class="report-actions"></div><div class="readable-report"></div>';d.querySelector('.readable-report').innerHTML=G.Learning.reportBody(s,language);const actions=d.querySelector('.report-actions');actions.append(closeButton(d),button(tr('Скачать HTML для чтения и печати','Download HTML for reading and printing'),downloadHtml),button(tr('Полный JSON','Full JSON'),()=>hooks.report()));if(!d.open)d.showModal();}
 function reportButton(host){if(!host||host.querySelector('[data-learning-report]'))return;const b=button(tr('Учебный отчёт','Learning report'),openReport);b.dataset.learningReport='';host.append(b);}
 function openMenu(){const d=$('#section-menu');d.innerHTML=`<h2>${tr('Разделы игры','Game sections')}</h2><div class="section-menu-grid"></div>`;d.prepend(closeButton(d));const grid=d.querySelector('.section-menu-grid');const items=[['mission','Решение года','Yearly decision'],['agenda','Повестка','Agenda'],['map','Карта и проекты','Map and projects'],['residents','Жители и услуги','Residents and services'],['stories','Письма жителей','Residents’ letters'],['treasury','Казначейство','Treasury'],['advisors','Советники','Advisers'],['quests','Задания','Quests'],['badges','Награды','Awards'],['journal','История','Journal'],['settings','Настройки','Settings']];
  for(const [view,r,e] of items){if(view==='agenda'&&G.Agenda.mode(hooks.state())!=='agenda')continue;grid.append(button(tr(r,e),()=>{d.close();hooks.navigate(view);}));}
  grid.append(button(tr('Как играть','How to play'),()=>{d.close();openGuide();}),button(tr('Учебный отчёт','Learning report'),()=>{d.close();openReport();}),button(tr('Скачать сохранение','Download save'),()=>hooks.save()));if(!d.open)d.showModal();
 }
 function translate(l){language=l;const strings={campaignOptions:['Параметры кампании','Campaign options'],regionCaption:['Один регион. Пять территорий. Последствия каждого решения.','One region. Five districts. Every decision leaves a mark.'],startGuide:['Как играть','How to play'],gameGuide:['Справочник','Guide'],privacyNote:['Можно использовать имя персонажа. Данные остаются в этом браузере.','You can use a character name. Data stays in this browser.']};if(G.Platform)strings.privacyNote=['Профиль учебной платформы. Партия сохраняется на устройстве; итоговая оценка и отчёт передаются в журнал автоматически.','Your course profile. Campaigns are saved on this device; the final grade and report are submitted automatically.'];for(const [k,v]of Object.entries(strings))for(const el of document.querySelectorAll(`[data-ui="${k}"]`))el.textContent=v[l==='en'?1:0];
  const labels={'start-language':tr('Switch to English','Переключить на русский'),'language-toggle':tr('Switch to English','Переключить на русский'),'start-sound':tr('Звуки интерфейса','Interface sounds'),'sound-toggle':tr('Звуки интерфейса','Interface sounds'),'advisor-dialog':tr('Советник','Adviser'),'district-dialog':tr('Территория и проекты','District and projects'),'profile-dialog':tr('Профиль игрока','Player profile'),'section-menu':tr('Разделы игры','Game sections'),'learning-dialog':tr('Как играть','How to play'),'learning-report':tr('Учебный отчёт','Learning report')};for(const [id,label]of Object.entries(labels))$('#'+id)?.setAttribute('aria-label',label);
  for(const b of document.querySelectorAll('[data-close-dialog]'))b.setAttribute('aria-label',tr('Закрыть','Close'));
  if($('#learning-dialog')?.open)openGuide();updateStatus();
 }
 function updateStatus(){const el=$('#offline-status');if(!el)return;if(G.Platform){el.textContent=tr('Сохранение привязано к профилю курса','Saved to your course profile');return;}el.textContent=offlineReady?tr('Готово к работе без сети','Ready for offline use'):tr('Автономное приложение · ресурсы загружаются','Standalone app · resources loading');}
 function offerUpdate(worker){waitingWorker=worker;const banner=$('#release-update');banner.hidden=false;banner.replaceChildren();const text=document.createElement('p');text.textContent=tr('Доступна новая версия. Скачайте сохранение перед обновлением.','A new version is available. Download a save before updating.');banner.append(text,button(tr('Скачать сохранение','Download save'),()=>hooks.save()),button(tr('Обновить','Update'),()=>{if(!waitingWorker)return;if(!window.confirm(tr('Обновить приложение? Текущая партия останется в автосохранении. Перед обновлением рекомендуется скачать её копию.','Update the app? The campaign stays in autosave. Download a copy before updating.')))return;activated=true;waitingWorker.postMessage({type:'ACTIVATE_RELEASE'});}),button(tr('Позже','Later'),()=>{banner.hidden=true;}));}
 async function registerOffline(){
  try{const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});if(reg.active){offlineReady=true;updateStatus();}if(reg.waiting)offerUpdate(reg.waiting);
   reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'){if(navigator.serviceWorker.controller)offerUpdate(worker);else{offlineReady=true;updateStatus();}}});});
   navigator.serviceWorker.addEventListener('controllerchange',()=>{if(activated)location.reload();});
   navigator.serviceWorker.ready.then(()=>{offlineReady=true;updateStatus();});
  }catch(_){const el=$('#offline-status');if(el)el.textContent=tr('Игра работает; офлайн-копия пока недоступна','Game available; offline copy is not ready');}
 }
 function init(h){hooks=h;language=h.language();dialog('learning-dialog',tr('Как играть','How to play'));dialog('learning-report',tr('Учебный отчёт','Learning report'));dialog('section-menu',tr('Разделы игры','Game sections'));
  const help=button(tr('Как играть','How to play'),openGuide);help.id='start-guide';help.dataset.ui='startGuide';$('.start-copy').append(help);
  const privacy=document.createElement('p');privacy.className='privacy-note';privacy.dataset.ui='privacyNote';$('#player-group').after(privacy);
  const gameHelp=button(tr('Справочник','Guide'),openGuide,'nav-button');gameHelp.dataset.ui='gameGuide';gameHelp.id='game-guide';$('.side-nav').append(gameHelp);
  const status=document.createElement('p');status.id='offline-status';status.className='offline-status';status.setAttribute('role','status');$('#start-form').append(status);
  const notice=document.createElement('aside');notice.id='release-update';notice.hidden=true;notice.setAttribute('aria-label',tr('Обновление приложения','App update'));document.body.append(notice);
  const menu=$('#mobile-menu-button');menu.setAttribute('aria-haspopup','dialog');menu.setAttribute('aria-controls','section-menu');
  for(const d of document.querySelectorAll('.release-dialog'))d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});
  translate(language);
 }
 G.ReleaseUI={init,translate,openMenu,openGuide,openReport,reportButton,registerOffline};
})(window);
