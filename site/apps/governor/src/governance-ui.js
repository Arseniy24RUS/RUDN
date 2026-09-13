(function(root){
 'use strict';
 const G=root.GovernorGame.Governance,E=root.GovernorGame.Engine,C=G.CONFIG,icon=root.GovernorGame.icon;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let host=null,selection=null,actorId='municipality',inquiry=false,returnFocus=null;
 const lang=()=>host.getLanguage();
 const txt=(ru,en)=>globalThis.GovernorGame.I18n.choose(lang(),()=>(ru),()=>(en));
 const l=x=>E.localise(x,lang());
 const n=x=>new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(lang()),{maximumFractionDigits:2}).format(x);
 const deliveryLabel=id=>({
  'on-time':txt('по плану','on plan'),delayed:txt('задержка','delayed'),overrun:txt('удорожание','cost overrun'),partial:txt('неполное исполнение','partial delivery')
 })[id]||id;
 const money=x=>`${n(x)} ${txt('млрд ₽','bn RUB')}`;
 const year=(s,t)=>s.population.baseYear+t-1;
 const statusLabel=s=>({agreed:txt('Пакет согласован','Agreement reached'),qualified:txt('Есть замечания','Qualified agreement'),open:txt('Разногласия сохраняются','Dissent remains')})[s];
 const stanceLabel=s=>({support:txt('Поддерживает','Supports'),cautious:txt('С условиями','Conditional'),oppose:txt('Возражает','Objects')})[s];
 function avatar(a,size=28){return a.image?`<img src="${a.image}" alt="">`:`<span class="gov-role-icon">${icon(a.id==='municipality'?'town':a.icon,{size})}</span>`;}
 function promiseTitle(p,s){
  if(p.kind==='launch')return txt(`Запуск не позднее ${year(s,p.dueTurn)} года`,`Open by ${year(s,p.dueTurn)}`);
  if(p.kind==='report')return txt(`Опубликовать фактический отчёт до конца ${year(s,p.dueTurn)} года`,`Publish a factual report by the end of ${year(s,p.dueTurn)}`);
  if(p.kind==='reserve')return txt(`Резерв на конец каждого года не ниже ${money(p.floor)} до конца ${year(s,p.dueTurn)} года`,`Year-end reserve of at least ${money(p.floor)} until the end of ${year(s,p.dueTurn)}`);
  return txt(`Обеспечить три года работы услуги подряд к концу ${year(s,p.dueTurn)} года`,`Fund three consecutive years of service by the end of ${year(s,p.dueTurn)}`);
 }
 function promiseStatus(p,s){
  if(p.status==='kept')return p.revisions.length?txt('Выполнено после переноса','Kept after rescheduling'):txt('Выполнено','Kept');
  if(p.status==='broken')return p.recoveredAt?txt('Срок нарушен · объект позже запущен','Deadline missed · delivered later'):txt('Не выполнено','Broken');
  if(s.completed&&p.dueTurn>20)return txt('Обязательство следующего срока','Beyond this term');
  return p.revisions.length?txt('Новый срок согласован','New deadline agreed'):txt('Предстоит проверить','Pending verification');
 }
 function createDialog(id,title){
  let d=document.getElementById(id);if(d)return d;
  d=document.createElement('dialog');d.id=id;d.className='gov-dialog';d.setAttribute('aria-label',title);document.body.append(d);
  d.addEventListener('keydown',event=>{
   if(event.key!=='Tab')return;
   const targets=[...d.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex="0"]')].filter(x=>x.getClientRects().length>0);
   if(!targets.length){event.preventDefault();d.focus();return;}
   const first=targets[0],last=targets[targets.length-1],active=document.activeElement;
   if(event.shiftKey&&(active===first||!d.contains(active))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(active===last||!d.contains(active))){event.preventDefault();first.focus();}
  });
  d.addEventListener('close',()=>{if(!document.querySelector('dialog[open]')&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});});
  return d;
 }
 function init(callbacks){host=callbacks;}
 function openMeeting(actionId,mode,placementId){
  const s=host.getState(),v=E.previewAction(s,actionId,mode,placementId);
  if(!v?.agreement||!v.plan)return;
  selection={actionId,mode:mode||v.plan.id,placementId:v.placement?.id||null};
  E.setAgreementTerms(s,actionId,selection.mode,selection.placementId,v.agreement.termIds);
  actorId='municipality';inquiry=false;returnFocus=document.activeElement;
  host.save();renderMeeting();document.getElementById('negotiation-dialog').showModal();
 }
 function renderMeeting(focusTerm){
  const s=host.getState(),v=E.previewAction(s,selection.actionId,selection.mode,selection.placementId),a=v.agreement;
  const scene=G.sceneFor(v.mission.id),actor=C.actors.find(x=>x.id===actorId),index=C.actors.indexOf(actor);
  const d=createDialog('negotiation-dialog',txt('Переговоры о проекте','Project negotiations'));
  const chosen=a.termIds.map(G.termFor),stance=a.positions.find(p=>p.actorId===actorId);
  const memory=s.governance.trust[actorId];
  const memoryText=memory>0?txt('«Прежние обещания вы выполняли. Это имеет значение».','“You kept earlier promises. That matters.”'):memory<0?txt('«Сначала вспомним прежние обещания. Не все они были выполнены».','“Let us remember your earlier promises. Not all were kept.”'):'';
  const terms=C.terms.filter(t=>t.actor===actorId).map(t=>{
   const picked=a.termIds.includes(t.id),same=chosen.some(x=>x.actor===t.actor);
   const disabled=(!picked&&!same&&chosen.length>=2)||(t.requires&&t.requires!==selection.mode);
   const unavailable=t.requires&&t.requires!==selection.mode?txt('Нужен источник «Софинансирование»','Select cofinancing first'):txt('Сначала снимите одно из двух условий','Remove one of the two terms first');
   return `<button type="button" class="gov-term ${picked?'selected':''}" data-term="${t.id}" aria-pressed="${picked}" ${disabled?'disabled':''}>
    <span class="gov-term-indicator">${icon(picked?'check':'plus',{size:20})}</span><span><strong>${esc(l(t.title))}</strong><span class="gov-term-text">${esc(l(t.line))}</span><small>${t.cost?`+${money(t.cost)} ${txt('сейчас','now')}`:txt('Без дополнительных затрат сейчас','No extra upfront cost')}${t.opex?` · +${money(t.opex)} / ${txt('год','year')}`:''}</small>${disabled?`<em>${esc(unavailable)}</em>`:''}</span></button>`;
  }).join('');
  const pledgeList=a.promises.length?a.promises.map(p=>`<li>${icon('calendar',{size:16})}<span>${esc(promiseTitle(p,s))}${p.conditionalGrant?`<small>${txt('Условный дополнительный транш','Conditional extra tranche')}: ${money(p.conditionalGrant)}</small>`:''}</span></li>`).join(''):`<li>${esc(txt('Дополнительных обещаний нет. Возражения останутся в протоколе.','No extra promises. Objections will remain in the minutes.'))}</li>`;
  d.innerHTML=`<header class="gov-header"><div class="gov-header-copy"><small>${txt('ПЕРЕГОВОРЫ','NEGOTIATION')} · ${year(s,s.turnIndex+1)}</small><h2 id="negotiation-title">${esc(l(scene.title))}</h2><p>${esc(l(scene.setting))}</p></div><img class="gov-header-art" src="${esc(scene.image||'assets/scenes/negotiation-room.webp')}" alt=""><button class="gov-close" type="button" data-meeting-back aria-label="${txt('Вернуться к проекту','Return to proposal')}">${icon('close',{size:23})}</button></header>
    <div class="gov-meeting-body">
     <aside class="gov-participants" aria-label="${txt('Участники переговоров','Negotiation participants')}">${C.actors.map(x=>{const p=a.positions.find(p=>p.actorId===x.id);return `<button type="button" class="gov-participant ${x.id===actorId?'selected':''}" data-participant="${x.id}" aria-pressed="${x.id===actorId}"><span class="gov-avatar">${avatar(x)}</span><span><strong>${esc(l(x.name))}</strong><small>${esc(l(x.role))}</small><b class="gov-stance ${p.stance}">${esc(stanceLabel(p.stance))}</b></span></button>`;}).join('')}<p class="gov-synthetic">${txt('Вымышленные собеседники. Это переговоры об исполнении, не голосование вместо органов власти.','Fictional counterparts. This is a delivery meeting, not a vote replacing public authorities.')}</p></aside>
     <main class="gov-conversation"><div class="gov-speaker"><span class="gov-avatar large">${avatar(actor,36)}</span><div><small>${esc(l(actor.role))}</small><h3>${esc(l(actor.name))}</h3></div></div>
      <blockquote aria-live="polite">${esc(l((inquiry?scene.questions:scene.speeches)[index]))}</blockquote>
      ${memoryText?`<p class="gov-memory">${esc(memoryText)}</p>`:''}
      <button class="gov-question" type="button" data-inquiry>${icon('info',{size:17})}${inquiry?txt('Вернуться к вопросу','Back to the question'):txt('Что для вас принципиально?','What matters most to you?')}</button>
      <div class="gov-choice-label"><strong>${txt('Что предложим?','What can we offer?')}</strong><small>${txt('До двух условий на весь пакет','At most two terms for the whole package')}</small></div>
      <div class="gov-terms">${terms}</div><details class="gov-remit"><summary>${txt('Полномочия участника','This participant’s remit')}</summary><p>${esc(l(actor.remit))}</p></details>
     </main>
     <aside class="gov-contract"><p class="gov-contract-title">${txt('НА СТОЛЕ ПЕРЕГОВОРОВ','ON THE TABLE')}</p><h3>${esc(l(v.action.title))}</h3><div class="gov-contract-state ${a.status}">${icon(a.status==='agreed'?'check':'info',{size:18})}${esc(statusLabel(a.status))}</div>
      <div class="gov-slots">${[0,1].map(i=>chosen[i]?`<button type="button" data-remove-term="${chosen[i].id}" aria-label="${txt('Снять условие','Remove term')}: ${esc(l(chosen[i].title))}">${esc(l(chosen[i].title))}${icon('close',{size:15})}</button>`:`<span>${txt('Место для условия','Available term slot')}</span>`).join('')}</div>
      <details class="gov-obligations" open><summary>${txt('Что проверят позже','What will be checked later')}</summary><ul>${pledgeList}</ul></details>
      <p class="gov-procedure">${a.status==='open'?txt('Разногласия означают дополнительный год согласования и потерю поддержки. Законная процедура остаётся доступной.','Dissent adds a year of coordination and reduces support. A lawful procedure remains available.'):txt('Согласие помогает исполнению, но не отменяет закупки, бюджетные процедуры или риск задержки.','Agreement helps delivery but does not remove procurement, budget procedures or delay risk.')}</p>
     </aside>
    </div><footer class="gov-footer"><div><small>${txt('Собственные средства сейчас','Own funds now')}</small><strong>${money(v.plan.treasuryCost+(v.plan.firstYearOpex||0))}</strong><span>${txt('Запуск','Opening')}: ${year(s,s.turnIndex+1+(v.project?.startsIn||0))}</span></div><button class="primary-button gov-sign" type="button" data-sign-agreement ${v.affordable?'':'disabled'}>${esc(v.affordable?txt('Утвердить пакет','Approve package'):txt('Пакет не обеспечен ресурсами','Package lacks resources'))}${icon('arrow',{size:18})}</button></footer>`;
  d.setAttribute('aria-labelledby','negotiation-title');
  d.querySelector('[data-meeting-back]').onclick=()=>{d.close();host.refresh();host.save();};
  d.querySelectorAll('[data-participant]').forEach(b=>b.onclick=()=>{actorId=b.dataset.participant;inquiry=false;renderMeeting();d.querySelector(`[data-participant="${actorId}"]`).focus({preventScroll:true});});
  d.querySelector('[data-inquiry]').onclick=()=>{inquiry=!inquiry;renderMeeting();d.querySelector('[data-inquiry]').focus({preventScroll:true});};
  const change=id=>{
   let ids=[...a.termIds];const t=G.termFor(id);
   if(ids.includes(id))ids=ids.filter(x=>x!==id);else ids=[...ids.filter(x=>G.termFor(x).actor!==t.actor),id];
   try{E.setAgreementTerms(s,selection.actionId,selection.mode,selection.placementId,ids);host.save();renderMeeting(id);}catch(e){host.toast(e.message);}
  };
  d.querySelectorAll('[data-term]').forEach(b=>b.onclick=()=>change(b.dataset.term));
  d.querySelectorAll('[data-remove-term]').forEach(b=>b.onclick=()=>change(b.dataset.removeTerm));
  d.querySelector('[data-sign-agreement]').onclick=()=>{host.commit();if(host.getState().awaitingContinue)d.close();};
  if(focusTerm)d.querySelector(`[data-term="${focusTerm}"]`)?.focus({preventScroll:true});
 }
 function briefing(s,language){
  const scene=G.sceneFor(E.getCurrentMission(s)?.id),due=s.governance.promises.filter(p=>p.status==='pending'&&p.createdTurn<s.turnIndex+1&&p.dueTurn<=s.turnIndex+2);
  let html='';
  if(due.length)html+=`<button type="button" class="gov-brief pending" data-open-promises>${icon('calendar',{size:17})}<span>${globalThis.GovernorGame.I18n.choose(language,()=>(`Есть обещание со сроком ${year(s,due[0].dueTurn)} года`),()=>(`A promise is due in ${year(s,due[0].dueTurn)}`))}</span>${icon('arrow',{size:15})}</button>`;
  else if(scene)html+=`<div class="gov-brief">${icon('people',{size:17})}<span>${globalThis.GovernorGame.I18n.choose(language,()=>('Этот проект обсудим с муниципалитетом и жителями.'),()=>('We will discuss this project with the municipality and residents.'))}</span></div>`;
  if(E.getCurrentMission(s)?.id==='public-audit'){const q=G.summary(s);html+=`<button class="gov-brief" type="button" data-open-promises>${icon('journal',{size:17})}<span>${globalThis.GovernorGame.I18n.choose(language,()=>(`К публичному разбору: выполнено ${q.kept+q.revisedKept}, нарушено ${q.broken}, ещё в работе ${q.pending}.`),()=>(`Public review: ${q.kept+q.revisedKept} kept, ${q.broken} broken, ${q.pending} pending.`))}</span>${icon('arrow',{size:15})}</button>`;}
  return html;
 }
 function recordSummary(record,language){
  const a=record.agreement;if(!a&&!record.promiseEvents?.length)return'';
  const loc=x=>E.localise(x,language),ru=language==='ru';
  return `<section class="gov-resolution"><h3>${ru?'Слово губернатора':'A Governor’s Word'}</h3>${a?`<p>${ru?'Условия закреплены в протоколе. Дополнительные расходы включены в стоимость проекта.':'The terms are recorded in the minutes. Extra costs are included in the project cost.'}</p><div class="gov-record-terms">${a.termIds.length?a.termIds.map(id=>`<span>${esc(loc(G.termFor(id).title))}</span>`).join(''):esc(ru?'Без дополнительных условий, с открытыми замечаниями.':'No added terms; open objections remain.')}</div>`:''}${(record.promiseEvents||[]).map(e=>`<p class="gov-record-event ${e.type}">${icon(e.type==='kept'?'check':'warning',{size:16})}${esc(loc(G.termFor(e.promiseId.split(':')[1])?.title||e.promiseId))} · ${ru?(e.type==='kept'?'обещание выполнено':e.type==='late-delivery'?'проект введён позже срока':'обещание не выполнено'):(e.type==='kept'?'promise kept':e.type==='late-delivery'?'delivered late':'promise broken')}</p>`).join('')}</section>`;
 }
 function summaryHtml(s,language){
  const q=G.summary(s),ru=language==='ru';
  return `<section class="gov-legacy"><h3>${ru?'Какой вес имело ваше слово':'What your word was worth'}</h3><p>${ru?`Выполнено без переноса: ${q.kept}. После согласованного переноса: ${q.revisedKept}. Не выполнено: ${q.broken}. Остаётся проверить: ${q.pending}.`:`Kept on the original terms: ${q.kept}. Kept after renegotiation: ${q.revisedKept}. Broken: ${q.broken}. Still pending: ${q.pending}.`}</p>${q.returnedGrants?`<p>${ru?'Возвращено условных траншей':'Conditional tranches repaid'}: ${q.returnedGrants.toFixed(2)} ${ru?'млрд ₽':'bn RUB'}.</p>`:''}<small>${ru?'Поздний ввод не стирает нарушенный срок. Обязательства за пределами кампании не засчитываются ни как успех, ни как провал.':'Late delivery does not erase a missed deadline. Commitments beyond the campaign count as neither success nor failure.'}</small><button class="secondary-button" type="button" data-open-promises>${icon('journal',{size:17})}${ru?'Протоколы и обещания':'Minutes and promises'}</button></section>`;
 }
 function attach(container){container.querySelectorAll('[data-open-promises]').forEach(b=>b.onclick=()=>openPromises());}
 function openPromises(){returnFocus=document.activeElement;renderPromises();createDialog('promises-dialog',txt('Протоколы и обещания','Minutes and promises')).showModal();}
 function renderPromises(reportId){
  const s=host.getState(),d=createDialog('promises-dialog',txt('Протоколы и обещания','Minutes and promises')),ru=lang()==='ru';
  const turn=s.turnIndex+1;
  const sorted=[...s.governance.promises].sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||a.dueTurn-b.dueTurn);
  const cards=sorted.map(p=>{
   const a=s.governance.agreements.find(x=>x.sceneId===p.id.split(':')[0]),actor=C.actors.find(x=>x.id===p.actorId),r=G.revisionQuote(s,p.id);
   const record=s.history.find(x=>x.missionId===a.sceneId),project=s.finance.portfolio.find(x=>x.id===p.projectId);
   const publish=p.kind==='report'&&p.status==='pending'&&!s.completed&&!s.awaitingContinue&&turn>p.createdTurn&&turn<=p.dueTurn;
   const name=l(root.GovernorGame.DATA.missions.find(m=>m.id===a.sceneId)?.title);
   const showing=reportId===p.id;
   const report=showing?`<div class="gov-factual-report"><h4>${txt('Фактический отчёт','Factual report')}</h4><p>${esc(l(project?.title||name))}</p><dl><div><dt>${txt('Плановая стоимость','Planned cost')}</dt><dd>${money(record.funding.totalCost)}</dd></div><div><dt>${txt('Фактическая стоимость','Actual cost')}</dt><dd>${money(record.funding.actualTotalCost)}</dd></div><div><dt>${txt('Исполнение','Delivery')}</dt><dd>${esc(({ 'on-time':txt('По плану','As planned'),delayed:txt('Задержка','Delay'),overrun:txt('Удорожание','Overrun'),partial:txt('Неполное исполнение','Partial delivery')})[record.delivery.id])}</dd></div><div><dt>${txt('Объект','Project')}</dt><dd>${project?.status==='active'?txt('Работает','Operating'):project?.status==='delivery'?txt('В реализации','In delivery'):txt('Срок завершён','Completed')}</dd></div></dl><p>${txt('Публикация включает эти факты, даже если результат хуже обещанного, и исполняет действующие условия отчётности по этому проекту.','Publication includes these facts, even if the result is worse than promised, and satisfies current reporting clauses for this project.')}</p><button class="primary-button" data-publish-promise="${p.id}" type="button">${txt('Опубликовать без изменений','Publish these facts')}</button></div>`:'';
   return `<article class="gov-promise ${p.status}" data-promise-id="${p.id}"><header><small>${esc(name)} · ${esc(l(actor.role))}</small><b>${esc(promiseStatus(p,s))}</b></header><h3>${esc(promiseTitle(p,s))}</h3>${p.revisions.length?`<p>${txt('Первоначальный срок','Original deadline')}: ${year(s,p.originalDueTurn)}. ${txt('Перенос согласован до нарушения срока.','The revision was agreed before the deadline.')}</p>`:''}${p.conditionalGrant?`<p>${txt('Дополнительный транш с условием отчётности','Extra tranche subject to reporting')}: ${money(p.conditionalGrant)}.</p>`:''}${p.restitution?`<p class="gov-refund">${txt('Возвращено из казны','Repaid from the treasury')}: ${money(p.restitution.amount)}.</p>`:''}${p.evidence?`<details><summary>${txt('Основание проверки','Evidence')}</summary><p>${txt('Проверено в году','Checked in year')} ${year(s,p.resolvedTurn)}. ${p.kind==='report'&&p.status==='kept'?txt(`В отчёте: факт ${money(p.evidence.actualCost)}, исход ${esc(deliveryLabel(p.evidence.delivery))}.`,`Report: actual cost ${money(p.evidence.actualCost)}, outcome ${esc(deliveryLabel(p.evidence.delivery))}.`):p.kind==='launch'?txt(`Фактический ввод: ${p.evidence.activatedTurn?year(s,p.evidence.activatedTurn):txt('не состоялся к сроку','not delivered by the deadline')}.`,`Actual opening: ${p.evidence.activatedTurn?year(s,p.evidence.activatedTurn):txt('не состоялся к сроку','not delivered by the deadline')}.`):txt('Проверка по состоянию проекта и финансовому регистру.','Checked against project state and the fiscal ledger.')}</p></details>`:''}${publish&&!showing?`<button class="secondary-button" data-inspect-report="${p.id}" type="button">${icon('receipt',{size:16})}${txt('Проверить и опубликовать отчёт','Review and publish report')}</button>`:''}${r.available?`<button class="secondary-button" data-revise-promise="${p.id}" type="button">${icon('calendar',{size:16})}${txt('Согласовать перенос на год','Agree a one-year extension')} · ${txt('поддержка −0,8','support −0.8')}</button>`:''}${report}</article>`;
  }).join('');
  d.innerHTML=`<header class="gov-header"><div class="gov-header-copy"><small>${txt('ОТ СЛОВ К ДЕЛУ','FROM WORDS TO ACTION')}</small><h2>${txt('Протоколы и обещания','Minutes and promises')}</h2><p>${txt('Сроки и факты остаются в истории. Договорённость не гарантирует результат.','Dates and facts remain in the history. An agreement does not guarantee delivery.')}</p></div><img class="gov-header-art" src="assets/scenes/governor-office.webp" alt=""><button class="gov-close" type="button" data-promises-close aria-label="${txt('Закрыть','Close')}">${icon('close',{size:23})}</button></header><div class="gov-promise-body">${cards||`<p class="gov-empty">${txt('Пока нет дополнительных обещаний. Они появятся, если вы включите их в согласованный пакет.','No extra promises yet. They appear when you include them in an agreed package.')}</p>`}<details class="gov-protocols"><summary>${txt('Все протоколы встреч','All meeting minutes')} (${s.governance.agreements.length})</summary>${s.governance.agreements.map(a=>`<article><h3>${esc(l(G.sceneFor(a.sceneId).title))} · ${year(s,a.turn)}</h3><p>${esc(statusLabel(a.status))}</p>${a.positions.map(p=>`<span>${esc(l(C.actors.find(x=>x.id===p.actorId).role))}: ${esc(stanceLabel(p.stance))}</span>`).join('')}</article>`).join('')}</details></div>`;
  d.querySelector('[data-promises-close]').onclick=()=>d.close();
  d.querySelectorAll('[data-inspect-report]').forEach(b=>b.onclick=()=>{renderPromises(b.dataset.inspectReport);d.querySelector('[data-publish-promise]')?.focus({preventScroll:false});});
  const update=(fn,id)=>{try{fn(s,id);host.save();host.refresh();renderPromises();d.querySelector('[data-promises-close]').focus({preventScroll:true});}catch(e){host.toast(e.message);}};
  d.querySelectorAll('[data-publish-promise]').forEach(b=>b.onclick=()=>update(E.publishPromiseReport,b.dataset.publishPromise));
  d.querySelectorAll('[data-revise-promise]').forEach(b=>b.onclick=()=>update(E.renegotiatePromise,b.dataset.revisePromise));
 }
 root.GovernorGame.GovernanceUI={init,openMeeting,openPromises,briefing,recordSummary,summaryHtml,attach};
})(window);
