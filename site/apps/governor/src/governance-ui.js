(function(root){
 'use strict';
 const G=root.GovernorGame.Governance,E=root.GovernorGame.Engine,C=G.CONFIG,icon=root.GovernorGame.icon;
 const asset=src=>root.GovernorGame.resolveAsset?root.GovernorGame.resolveAsset(src):src;
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
 const copy=(ru,en,zh)=>lang()==='zh'?zh:txt(ru,en);
 const ownCost=plan=>plan.treasuryCost+(plan.firstYearOpex||0);
 const year=(s,t)=>s.population.baseYear+t-1;
 const statusLabel=s=>({agreed:txt('Пакет согласован','Agreement reached'),qualified:txt('Есть замечания','Qualified agreement'),open:txt('Разногласия сохраняются','Dissent remains')})[s];
 const stanceLabel=s=>({support:txt('Поддерживает','Supports'),cautious:txt('С условиями','Conditional'),oppose:txt('Возражает','Objects')})[s];
 function avatar(a,size=28){return a.image?`<img src="${esc(asset(a.image))}" alt="">`:`<span class="gov-role-icon">${icon(a.id==='municipality'?'town':a.icon,{size})}</span>`;}
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
 const signedMoney=value=>(value>0?'+':'')+money(value);
 const sideName=id=>({
  municipality:copy('Муниципалитет','Municipality','市政团队'),
  finance:copy('Финансовый блок','Finance','财政部门'),
  residents:copy('Жители','Residents','居民')
 })[id];
 function commitment(p,s){
  const due=year(s,p.dueTurn);
  switch(p.kind){
   case 'launch':return copy(`Запустить к ${due}`,`Open by ${due}`,`最晚于 ${due} 年启用`);
   case 'report':return copy(`Опубликовать отчёт до конца ${due}`,`Publish the report by the end of ${due}`,`${due} 年底前发布报告`);
   case 'reserve':return copy(`Резерв ≥ ${money(p.floor)} на конец каждого года по ${due}`,`Keep ≥ ${money(p.floor)} in reserve each year-end through ${due}`,`截至 ${due} 年，每年年底储备金 ≥ ${money(p.floor)}`);
   case 'continuity':return copy(`${p.requiredYears} года работы подряд к концу ${due}`,`${p.requiredYears} consecutive operating years by the end of ${due}`,`到 ${due} 年底连续运行 ${p.requiredYears} 年`);
  }
 }
 function coalition(a){
  const count=a.positions.filter(p=>p.stance==='support').length;
  const opponents=a.positions.filter(p=>p.stance==='oppose').map(p=>sideName(p.actorId)).join(', ');
  const status=copy(`Поддерживают ${count} из ${a.positions.length}`,`${count} of ${a.positions.length} support`,`${a.positions.length} 方中有 ${count} 方支持`);
  const dissent=opponents?copy(`Против: ${opponents}`,`Opposed: ${opponents}`,`反对方：${opponents}`):'';
  const penalty=a.delay?copy(`Согласование +${a.delay} год · поддержка ${n(a.supportDelta)}`,`Coordination +${a.delay} year · support ${n(a.supportDelta)}`,`协调延长 ${a.delay} 年 · 支持度 ${n(a.supportDelta)}`):'';
  return [status,dissent,penalty].filter(Boolean).join(' · ');
 }
 function offer(t,s,v){
  const ids=v.agreement.termIds, picked=ids.includes(t.id),other=ids.filter(id=>G.termFor(id).actor!==t.actor);
  let reason='';
  if(t.requires&&t.requires!==selection.mode)reason=txt('Нужен источник «Софинансирование»','Select cofinancing first');
  else if(other.length>=2)reason=txt('Сначала снимите одно из двух условий','Remove one of the two terms first');
  let detail='',price='',refund='';
  if(!reason){
   const quote=terms=>E.previewAction(s,selection.actionId,selection.mode,selection.placementId,terms);
   const base=other.length===ids.length?v:quote(other),withTerm=picked?v:quote([...other,t.id]);
   const promise=withTerm.agreement.promises.find(p=>p.termId===t.id);
   detail=commitment(promise,s);
   const diff=(x,y)=>Math.round((x-y)*100)/100;
   const now=signedMoney(diff(ownCost(withTerm.plan),ownCost(base.plan)));
   const annual=diff(withTerm.agreement.annualOpex,base.agreement.annualOpex);
   const parts=[copy(`Из казны сейчас ${now}`,`Treasury now ${now}`,`本期财政支出 ${now}`)];
   if(selection.mode==='cofinance'){
    const project=signedMoney(diff(withTerm.plan.totalCost,base.plan.totalCost));
    parts.unshift(copy(`К проекту ${project}`,`Project cost ${project}`,`项目总成本 ${project}`));
   }
   if(annual)parts.push(copy(`${signedMoney(annual)}/год работы`,`${signedMoney(annual)}/operating year`,`每个运营年 ${signedMoney(annual)}`));
   price=parts.join(' · ');
   if(promise.conditionalGrant)refund=copy(`Без отчёта вернуть ${money(promise.conditionalGrant)}`,`Repay ${money(promise.conditionalGrant)} if unreported`,`未提交报告须退还 ${money(promise.conditionalGrant)}`);
  }else detail=l(t.line);
  return `<button type="button" class="gov-term ${picked?'selected':''}" data-term="${t.id}" aria-pressed="${picked}" ${reason?'disabled':''}>
   <span class="gov-term-indicator">${icon(picked?'check':'plus',{size:18})}</span><span><strong>${esc(l(t.title))}</strong><span class="gov-term-text">${esc(detail)}</span>${price?`<small>${esc(price)}</small>`:''}${reason||refund?`<em>${esc(reason||refund)}</em>`:''}</span></button>`;
 }
 function renderMeeting(){
  const s=host.getState(),v=E.previewAction(s,selection.actionId,selection.mode,selection.placementId),a=v.agreement;
  const scene=G.sceneFor(v.mission.id,selection.actionId),actor=C.actors.find(x=>x.id===actorId),index=C.actors.indexOf(actor);
  const d=createDialog('negotiation-dialog',txt('Переговоры о проекте','Project negotiations'));
  const oldBody=d.querySelector('.gov-meeting-body'),scroll=d.open?oldBody?.scrollTop:0;
  const memory=s.governance.trust[actorId];
  const memoryText=memory>0?txt('«Прежние обещания вы выполняли. Это имеет значение».','“You kept earlier promises. That matters.”'):memory<0?txt('«Сначала вспомним прежние обещания. Не все они были выполнены».','“Let us remember your earlier promises. Not all were kept.”'):'';
  const opening=year(s,s.turnIndex+1+(v.project?.startsIn||0));
  const participants=C.actors.map(x=>{
   const p=a.positions.find(p=>p.actorId===x.id);
   return `<button type="button" class="gov-participant ${x.id===actorId?'selected':''}" data-participant="${x.id}" aria-pressed="${x.id===actorId}"><span class="gov-avatar">${avatar(x)}</span><span><strong>${esc(l(x.name))}</strong><small>${esc(sideName(x.id))}</small><b class="gov-stance ${p.stance}">${esc(stanceLabel(p.stance))}</b></span></button>`;
  }).join('');
  const terms=C.terms.filter(t=>t.actor===actorId).map(t=>offer(t,s,v)).join('');
  let premium='';
  if(a.termIds.length){
   const empty=E.previewAction(s,selection.actionId,selection.mode,selection.placementId,[]);
   const added=Math.round((v.plan.totalCost-empty.plan.totalCost)*100)/100;
   const costs=[copy(`К цене проекта ${signedMoney(added)}`,`Added to project cost ${signedMoney(added)}`,`项目总成本变化 ${signedMoney(added)}`)];
   if(a.annualOpex)costs.push(copy(`содержание ${signedMoney(a.annualOpex)}/год`,`upkeep ${signedMoney(a.annualOpex)}/year`,`年运营费 ${signedMoney(a.annualOpex)}`));
   premium=costs.join(' · ');
  }
  const pledges=a.promises.map(p=>{
   const label=sideName(p.actorId)+' · '+commitment(p,s);
   return `<button type="button" data-remove-term="${p.termId}" aria-label="${esc(txt('Снять условие','Remove term')+' · '+label)}"><span>${esc(label)}</span>${icon('close',{size:16})}</button>`;
  }).join('');
  d.innerHTML=`<header class="gov-header"><div class="gov-header-copy"><small>${txt('ПЕРЕГОВОРЫ','NEGOTIATION')} · ${year(s,s.turnIndex+1)}</small><h2 id="negotiation-title">${esc(l(v.action.title))}</h2></div><button class="gov-close" type="button" data-meeting-back aria-label="${txt('Вернуться к проекту','Return to proposal')}">${icon('close',{size:23})}</button></header>
   <div class="gov-meeting-body"><aside class="gov-participants" aria-label="${txt('Участники переговоров','Negotiation participants')}">${participants}</aside>
   <section class="gov-conversation"><h3>${esc(l(actor.name))}</h3><p class="gov-opening">${esc(l(scene.actionDialogue[selection.actionId].short[index]))}</p>
    <div class="gov-terms">${terms}</div>
    <details class="gov-remit gov-transcript"><summary>${copy('Разговор и полномочия','Conversation and remit','对话与职责')}</summary>
     <p>${esc(l(scene.setting))}</p><blockquote aria-live="polite">${esc(l((inquiry?scene.questions:scene.speeches)[index]))}</blockquote>
     ${memoryText?`<p>${esc(memoryText)}</p>`:''}
     <button class="gov-question" type="button" data-inquiry>${inquiry?txt('Вернуться к вопросу','Back to the question'):txt('Что для вас принципиально?','What matters most to you?')}</button>
     <p><strong>${esc(l(actor.role))}.</strong> ${esc(l(actor.remit))}</p></details></section></div>
   <footer class="meeting-contract"><div class="meeting-receipt"><p class="meeting-stance ${a.status}" role="status">${esc(coalition(a))}</p>
    <div class="meeting-pledges">${pledges||`<span>${copy('Без дополнительных обещаний','No extra promises','无额外承诺')}</span>`}</div>${premium?`<p class="meeting-premium">${esc(premium)}</p>`:''}</div>
    <div class="meeting-sign"><div><span>${txt('Собственные средства сейчас','Own funds now')} <strong>${money(ownCost(v.plan))}</strong></span><span>${copy('Плановый запуск','Planned opening','计划启用')} <strong>${opening}</strong></span></div>
    <button class="primary-button gov-sign" type="button" data-sign-agreement ${v.affordable?'':'disabled'}>${esc(v.affordable?txt('Утвердить пакет','Approve package'):txt('Пакет не обеспечен ресурсами','Package lacks resources'))}${icon('arrow',{size:18})}</button></div></footer>`;
  d.setAttribute('aria-labelledby','negotiation-title');
  if(scroll)d.querySelector('.gov-meeting-body').scrollTop=scroll;
  d.querySelector('[data-meeting-back]').onclick=()=>{d.close();host.refresh();host.save();};
  d.querySelectorAll('[data-participant]').forEach(b=>b.onclick=()=>{actorId=b.dataset.participant;inquiry=false;renderMeeting();d.querySelector(`[data-participant="${actorId}"]`).focus({preventScroll:true});});
  d.querySelector('[data-inquiry]').onclick=()=>{inquiry=!inquiry;renderMeeting();d.querySelector('.gov-transcript').open=true;d.querySelector('[data-inquiry]').focus();};
  const change=(id,fromReceipt)=>{
   const t=G.termFor(id),ids=a.termIds.filter(x=>G.termFor(x).actor!==t.actor);
   if(!a.termIds.includes(id))ids.push(id);
   const expanded=d.querySelector('.gov-transcript').open;
   try{
    E.setAgreementTerms(s,selection.actionId,selection.mode,selection.placementId,ids);host.save();renderMeeting();
    d.querySelector('.gov-transcript').open=expanded;
    const target=fromReceipt?(d.querySelector('[data-remove-term]')||d.querySelector('[data-sign-agreement]')):d.querySelector(`[data-term="${id}"]`);
    target.focus({preventScroll:true});
   }catch(e){host.toast(e.message);}
  };
  d.querySelectorAll('[data-term]').forEach(b=>b.onclick=()=>change(b.dataset.term,false));
  d.querySelectorAll('[data-remove-term]').forEach(b=>b.onclick=()=>change(b.dataset.removeTerm,true));
  d.querySelector('[data-sign-agreement]').onclick=()=>{host.commit();if(host.getState().awaitingContinue)d.close();};
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
  const loc=(ru,en)=>root.GovernorGame.I18n.local({ru,en},language);
  const eventText=type=>type==='kept'?loc('обещание выполнено','promise kept'):type==='late-delivery'?loc('проект введён позже срока','delivered late'):loc('обещание не выполнено','promise broken');
  const terms=a?.termIds.map(id=>`<span>${esc(E.localise(G.termFor(id).title,language))}</span>`).join('');
  const events=(record.promiseEvents||[]).map(e=>`<p class="gov-record-event ${e.type}">${icon(e.type==='kept'?'check':'warning',{size:16})}${esc(E.localise(G.termFor(e.promiseId.split(':')[1])?.title||e.promiseId,language))} · ${eventText(e.type)}</p>`).join('');
  return `<section class="gov-resolution"><h3>${loc('Слово губернатора','A Governor’s Word')}</h3>${a?`<p>${loc('Условия закреплены в протоколе. Дополнительные расходы включены в стоимость проекта.','The terms are recorded in the minutes. Extra costs are included in the project cost.')}</p><div class="gov-record-terms">${terms||loc('Без дополнительных условий, с открытыми замечаниями.','No added terms; open objections remain.')}</div>`:''}${events}</section>`;
 }
 function summaryHtml(s,language){
  const q=G.summary(s),loc=(ru,en)=>root.GovernorGame.I18n.local({ru,en},language);
  const tally=loc(`Выполнено без переноса: ${q.kept}. После согласованного переноса: ${q.revisedKept}. Не выполнено: ${q.broken}. Остаётся проверить: ${q.pending}.`,`Kept on the original terms: ${q.kept}. Kept after renegotiation: ${q.revisedKept}. Broken: ${q.broken}. Still pending: ${q.pending}.`);
  const amount=new Intl.NumberFormat(root.GovernorGame.I18n.intlLocale(language),{minimumFractionDigits:2,maximumFractionDigits:2}).format(q.returnedGrants);
  return `<section class="gov-legacy"><h3>${loc('Какой вес имело ваше слово','What your word was worth')}</h3><p>${tally}</p>${q.returnedGrants?`<p>${loc('Возвращено условных траншей','Conditional tranches repaid')}: ${amount} ${loc('млрд ₽','bn RUB')}.</p>`:''}<small>${loc('Поздний ввод не стирает нарушенный срок. Обязательства за пределами кампании не засчитываются ни как успех, ни как провал.','Late delivery does not erase a missed deadline. Commitments beyond the campaign count as neither success nor failure.')}</small><button class="secondary-button" type="button" data-open-promises>${icon('journal',{size:17})}${loc('Протоколы и обещания','Minutes and promises')}</button></section>`;
 }
 function attach(container){container.querySelectorAll('[data-open-promises]').forEach(b=>b.onclick=()=>openPromises());}
 function focusPromise(d,id){
  if(!id)return;
  const card=[...d.querySelectorAll('[data-promise-id]')].find(element=>element.dataset.promiseId===id);
  const heading=card?.querySelector('.gov-factual-report h4')||card?.querySelector('h3');
  heading?.focus();
 }
 function openPromises(reportId){
  returnFocus=document.activeElement;
  const d=renderPromises(reportId);
  if(!d.open)d.showModal();
  focusPromise(d,reportId);
 }
 function renderPromises(reportId){
  const s=host.getState(),d=createDialog('promises-dialog',txt('Протоколы и обещания','Minutes and promises'));
  const turn=s.turnIndex+1;
  const sorted=[...s.governance.promises].sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||a.dueTurn-b.dueTurn);
  const cards=sorted.map(p=>{
   const a=s.governance.agreements.find(x=>x.sceneId===p.id.split(':')[0]),actor=C.actors.find(x=>x.id===p.actorId),r=G.revisionQuote(s,p.id);
   const record=s.history.find(x=>x.missionId===a.sceneId),project=s.finance.portfolio.find(x=>x.id===p.projectId);
   const publish=p.kind==='report'&&p.status==='pending'&&!s.completed&&!s.awaitingContinue&&turn>p.createdTurn&&turn<=p.dueTurn;
   const name=l(root.GovernorGame.DATA.missions.find(m=>m.id===a.sceneId)?.title);
   const showing=publish && p.id===reportId;
   const report=showing?`<div class="gov-factual-report"><h4 tabindex="-1">${txt('Фактический отчёт','Factual report')}</h4><p>${esc(l(project?.title||name))}</p><dl><div><dt>${txt('Плановая стоимость','Planned cost')}</dt><dd>${money(record.funding.totalCost)}</dd></div><div><dt>${txt('Фактическая стоимость','Actual cost')}</dt><dd>${money(record.funding.actualTotalCost)}</dd></div><div><dt>${txt('Исполнение','Delivery')}</dt><dd>${esc(({ 'on-time':txt('По плану','As planned'),delayed:txt('Задержка','Delay'),overrun:txt('Удорожание','Overrun'),partial:txt('Неполное исполнение','Partial delivery')})[record.delivery.id])}</dd></div><div><dt>${txt('Объект','Project')}</dt><dd>${project?.status==='active'?txt('Работает','Operating'):project?.status==='delivery'?txt('В реализации','In delivery'):txt('Срок завершён','Completed')}</dd></div></dl><p>${txt('Публикация включает эти факты, даже если результат хуже обещанного, и исполняет действующие условия отчётности по этому проекту.','Publication includes these facts, even if the result is worse than promised, and satisfies current reporting clauses for this project.')}</p><button class="primary-button" data-publish-promise="${p.id}" type="button">${txt('Опубликовать без изменений','Publish these facts')}</button></div>`:'';
   return `<article class="gov-promise ${p.status}" data-promise-id="${p.id}"><header><small>${esc(name)} · ${esc(l(actor.role))}</small><b>${esc(promiseStatus(p,s))}</b></header><h3 tabindex="-1">${esc(promiseTitle(p,s))}</h3>${p.revisions.length?`<p>${txt('Первоначальный срок','Original deadline')}: ${year(s,p.originalDueTurn)}. ${txt('Перенос согласован до нарушения срока.','The revision was agreed before the deadline.')}</p>`:''}${p.conditionalGrant?`<p>${txt('Дополнительный транш с условием отчётности','Extra tranche subject to reporting')}: ${money(p.conditionalGrant)}.</p>`:''}${p.restitution?`<p class="gov-refund">${txt('Возвращено из казны','Repaid from the treasury')}: ${money(p.restitution.amount)}.</p>`:''}${p.evidence?`<details><summary>${txt('Основание проверки','Evidence')}</summary><p>${txt('Проверено в году','Checked in year')} ${year(s,p.resolvedTurn)}. ${p.kind==='report'&&p.status==='kept'?txt(`В отчёте: факт ${money(p.evidence.actualCost)}, исход ${esc(deliveryLabel(p.evidence.delivery))}.`,`Report: actual cost ${money(p.evidence.actualCost)}, outcome ${esc(deliveryLabel(p.evidence.delivery))}.`):p.kind==='launch'?txt(`Фактический ввод: ${p.evidence.activatedTurn?year(s,p.evidence.activatedTurn):txt('не состоялся к сроку','not delivered by the deadline')}.`,`Actual opening: ${p.evidence.activatedTurn?year(s,p.evidence.activatedTurn):txt('не состоялся к сроку','not delivered by the deadline')}.`):txt('Проверка по состоянию проекта и финансовому регистру.','Checked against project state and the fiscal ledger.')}</p></details>`:''}${publish&&!showing?`<button class="secondary-button" data-inspect-report="${p.id}" type="button">${icon('receipt',{size:16})}${txt('Проверить и опубликовать отчёт','Review and publish report')}</button>`:''}${r.available?`<button class="secondary-button" data-revise-promise="${p.id}" type="button">${icon('calendar',{size:16})}${txt('Согласовать перенос на год','Agree a one-year extension')} · ${txt('поддержка −0,8','support −0.8')}</button>`:''}${report}</article>`;
  }).join('');
  d.innerHTML=`<header class="gov-header"><div class="gov-header-copy"><small>${txt('ОТ СЛОВ К ДЕЛУ','FROM WORDS TO ACTION')}</small><h2>${txt('Протоколы и обещания','Minutes and promises')}</h2><p>${txt('Сроки и факты остаются в истории. Договорённость не гарантирует результат.','Dates and facts remain in the history. An agreement does not guarantee delivery.')}</p></div><img class="gov-header-art" src="${esc(asset('assets/scenes/governor-office.webp'))}" alt=""><button class="gov-close" type="button" data-promises-close aria-label="${txt('Закрыть','Close')}">${icon('close',{size:23})}</button></header><div class="gov-promise-body">${cards||`<p class="gov-empty">${txt('Пока нет дополнительных обещаний. Они появятся, если вы включите их в согласованный пакет.','No extra promises yet. They appear when you include them in an agreed package.')}</p>`}<details class="gov-protocols"><summary>${txt('Все протоколы встреч','All meeting minutes')} (${s.governance.agreements.length})</summary>${s.governance.agreements.map(a=>`<article><h3>${esc(l(G.sceneFor(a.sceneId).title))} · ${year(s,a.turn)}</h3><p>${esc(statusLabel(a.status))}</p>${a.positions.map(p=>`<span>${esc(l(C.actors.find(x=>x.id===p.actorId).role))}: ${esc(stanceLabel(p.stance))}</span>`).join('')}</article>`).join('')}</details></div>`;
  d.querySelector('[data-promises-close]').onclick=()=>d.close();
  d.querySelectorAll('[data-inspect-report]').forEach(b=>b.onclick=()=>{renderPromises(b.dataset.inspectReport);focusPromise(d,b.dataset.inspectReport);});
  const update=(fn,id)=>{try{fn(s,id);host.save();host.refresh();renderPromises();focusPromise(d,id);}catch(e){host.toast(e.message);}};
  d.querySelectorAll('[data-publish-promise]').forEach(b=>b.onclick=()=>update(E.publishPromiseReport,b.dataset.publishPromise));
  d.querySelectorAll('[data-revise-promise]').forEach(b=>b.onclick=()=>update(E.renegotiatePromise,b.dataset.revisePromise));
  return d;
 }
 root.GovernorGame.GovernanceUI={init,openMeeting,openPromises,briefing,recordSummary,summaryHtml,attach};
})(window);
