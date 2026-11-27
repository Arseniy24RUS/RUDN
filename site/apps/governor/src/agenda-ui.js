/* The agenda is a decision desk: urgent issues, current evidence and future options.
 * Every preview is read-only. Only the main confirmation commits an annual choice. */
(function(root){
 'use strict';
 const G=root.GovernorGame,A=G.Agenda;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tr=(l,r,e,z)=>l==='zh'?z:l==='en'?e:r;
 const loc=(v,l)=>G.I18n.local(v,l);
 const asset=v=>G.resolveAsset?G.resolveAsset(v):v;
 const fmt=(v,l)=>new Intl.NumberFormat(G.I18n.intlLocale(l),{maximumFractionDigits:1}).format((Number(v)||0)*100)+'%';
 let hooks;
 function init(h){hooks=h;}
 function row(t,l){
  const place=G.WorldModel.PLACES.find(d=>d.id===t.districtId);
  const s=hooks.state();
  let evidence=fmt(t.current,l);
  if(t.id==='youth-outflow'){
    const last=s.population.ledgers.at(-1)?.municipalities[t.districtId];
    const n=s.population.derived.municipalities[t.districtId]?.cohorts?.[1];
    if(Number.isFinite(n)){
      const fmtN=v=>new Intl.NumberFormat(G.I18n.intlLocale(l)).format(v);
      const delta=last?last.cohortsAfter[1]-last.cohortsBefore[1]:null;
      const trend=delta===null?'':tr(l,` · за год ${delta>0?'+':''}${fmtN(delta)}`,` · annual change ${delta>0?'+':''}${fmtN(delta)}`,` · 年变化 ${delta>0?'+':''}${fmtN(delta)}`);
      evidence+=tr(l,` · Жителей 18–34 лет ${fmtN(n)}`,` · Residents aged 18–34: ${fmtN(n)}`,` · 18至34岁居民 ${fmtN(n)} 人`)+trend;
    }
  }
  return `<button type="button" class="agenda-topic" data-agenda-topic="${t.id}"><span class="agenda-topic-icon">${G.icon(t.icon||'quest',{size:21})}</span><span><strong>${esc(loc(t.title,l))}</strong><small>${esc(loc(place?.name,l))} · ${esc(loc(t.label,l))} ${esc(evidence)}</small></span>${G.icon('arrow',{size:16})}</button>`;

 }
 function render(host){
  const s=hooks.state(),l=hooks.language();host.classList.add('agenda-stage');
  if(!A.open(s)||s.completed){renderReview(host,s,l);return;}
  const all=A.available(s).map(t=>({...t,current:t.current??s.population.derived.municipalities[t.districtId]?.[t.metric]??0})),pending=all.filter(t=>t.available),future=all.filter(t=>t.status==='future'),done=all.filter(t=>t.status==='started');
  const horizon=A.persistent(s)?20:5,untilReview=Math.min(5-s.turnIndex%5,horizon-s.turnIndex);
  const yearLabel=untilReview===1?'год':untilReview<5?'года':'лет';
  const reviewControl=s.campaignStrategy
    ? `<button type="button" class="agenda-time" data-agenda-course><b>${untilReview}</b><span>${tr(l,yearLabel+' до проверки курса',untilReview===1?'year until review':'years until review','年后检查战略')}</span></button>`
    : `<div class="agenda-time"><b>${untilReview}</b><span>${tr(l,yearLabel+' до конца этапа',untilReview===1?'year left in this stage':'years left in this stage','年后结束阶段')}</span></div>`;
  host.innerHTML=`<header class="agenda-heading"><div><p>${s.population.baseYear+s.turnIndex} · ${tr(l,`Год ${s.turnIndex+1} из 20`,`Year ${s.turnIndex+1} of 20`,`第${s.turnIndex+1}年，共20年`)}</p><h2 id="agenda-heading">${tr(l,'Что важнее в этом году?','What matters most this year?','今年什么最重要？')}</h2></div>${reviewControl}</header>
   <div class="agenda-board"><section class="agenda-inbox" aria-label="${tr(l,'Вопросы региона','Regional issues','地区议题')}"><div class="agenda-topic-list">${pending.slice(0,5).map(t=>row(t,l)).join('')}</div>
    ${pending.length>5?`<details class="agenda-more"><summary>${tr(l,`Другие доступные вопросы: ${pending.length-5}`,`Other available issues: ${pending.length-5}`,`其他可选议题：${pending.length-5}`)}</summary><div class="agenda-topic-list">${pending.slice(5).map(t=>row(t,l)).join('')}</div></details>`:''}
    ${G.DeliveryUI.managementChoices(s,l)}
    <button type="button" class="agenda-hold" data-agenda-topic="${A.OPERATIONS.id}">${G.icon('clock',{size:20})}<span><strong>${tr(l,'Прожить год без новых запусков','Advance a year without new starts','推进一年，不启动新项目')}</strong><small>${tr(l,'Действующие программы и их расходы продолжатся.','Current programmes and their costs continue.','已有项目继续运行并产生费用。')}</small></span>${G.icon('arrow',{size:16})}</button>
    ${future.length?`<details class="agenda-more"><summary>${tr(l,`На горизонте: ${future.length}`,`On the horizon: ${future.length}`,`未来议题：${future.length}`)}</summary>${future.map(t=>`<div class="agenda-future-row"><span>${esc(loc(t.title,l))}</span><small>${tr(l,`Не позднее ${s.population.baseYear+t.unlocksAt-1}`,`By ${s.population.baseYear+t.unlocksAt-1}`,`最迟${s.population.baseYear+t.unlocksAt-1}年`)}</small></div>`).join('')}<p class="agenda-footnote">${tr(l,'Некоторые следующие шаги открываются раньше, если регион к ним готов или проблема обострилась. Даты кризисов от этого не меняются.','Some follow-ups open earlier when the region is ready or a problem worsens. Crisis dates do not change.','部分后续议题会因地区已做好准备或问题恶化而提前开放。危机日期不变。')}</p></details>`:''}
    ${done.length?`<details class="agenda-more"><summary>${tr(l,`Уже приняты решения: ${done.length}`,`Decisions already approved: ${done.length}`,`已批准决策：${done.length}`)}</summary>${done.map(t=>`<div class="agenda-future-row"><span>${esc(loc(t.title,l))}</span><small>${tr(l,'Исполнение — в портфеле','Delivery is in the portfolio','在项目组合中查看执行')}</small></div>`).join('')}</details>`:''}
   </section></div>
   <details class="agenda-rules"><summary>${tr(l,'Как читать эту повестку','How to read this agenda','如何阅读议程')}</summary><p>${!A.persistent(s)?tr(l,'В этой сохранённой кампании свободны первые пять лет; далее продолжается прежний последовательный маршрут. ','This saved campaign keeps five open years followed by its original guided route. ','此旧存档保留前五年的开放议程，之后按原有顺序继续。 '):''}${tr(l,'В новой кампании открытые проблемы остаются доступными до конца срока. Утверждённая мера не покупается второй раз: её исполнение и продление находятся в портфеле. Следующие меры по той же территории открывают другой способ действия. Год без нового проекта сохраняет деньги, но не останавливает расходы, старение населения и календарные кризисы.','In a new campaign, open problems stay available until the end of the term. An approved measure is not purchased twice: delivery and renewal are managed in the portfolio. Follow-up measures offer a different way to act in the same territory. A year without a new project saves money but does not stop operating costs, population ageing or calendar crises.','在新进程中，开放议题保留至任期结束。已批准的措施不会重复购买；执行与续期在项目组合中管理。同地区的后续措施提供其他行动方式。不启动新项目可节省资金，但不能停止运营成本、人口老龄化或既定危机。')}</p><p>${tr(l,'Приоритет рассчитывается по дефициту услуги, её ухудшению, срокам программ и кризисной ситуации. Просмотр вариантов ничего не списывает и не меняет случайный исход.','Priority uses service shortfalls, deterioration, programme deadlines and crises. Browsing spends nothing and never redraws an outcome.','优先级依据服务缺口、恶化趋势、项目期限和危机情况。查看方案不花费资源，也不会重抽随机结果。')}</p></details>`;
  G.DeliveryUI.bindManagement(host,hooks);
  host.querySelectorAll('[data-agenda-topic]').forEach(button=>{
   button.addEventListener('click',()=>hooks.choose(button.dataset.agendaTopic));
  });
 }
 function renderReview(host,s,l){
  const r=A.report(s),through=r.completedYears||0,year=s.population.baseYear+through;
  host.innerHTML=`<header class="agenda-heading"><div><p>${s.population.baseYear}–${year-1}</p><h2>${tr(l,'История вашей повестки','Your agenda in retrospect','议程回顾')}</h2><span>${tr(l,'Принятое решение и работающая услуга проверяются отдельно.','An approved decision and a working service are assessed separately.','已批准决策与实际运行服务分别评估。')}</span></div><button type="button" class="secondary-button" data-agenda-return>${tr(l,'Вернуться','Return','返回')}</button></header><section class="agenda-sequence">${r.order.map(o=>`<div><small>${s.population.baseYear+o.turn-1}</small><strong>${esc(o.restoredService?tr(l,'Восстановить','Restore','恢复')+' · '+loc(o.restoredService,l):o.deferred?tr(l,'Без новых запусков','No new starts','无新项目'):loc(A.byId(o.missionId)?.title,l))}</strong></div>`).join('')}</section><section class="agenda-review-list">${r.topics.map(t=>`<article><img src="${esc(asset('assets/world/'+A.topic(t.id).image+'.webp'))}" alt=""><div><h3>${esc(loc(t.title,l))}</h3><p>${esc(t.startedTurn?loc(t.titleAction,l):tr(l,'Новая мера не принималась.','No new measure was approved.','未批准新措施。'))}</p></div><div class="agenda-review-value"><span>${esc(loc(t.label,l))}</span><strong>${fmt(t.initial,l)} <i>→</i> ${fmt(t.current,l)}</strong></div></article>`).join('')}</section><p class="agenda-review-note">${tr(l,'Сравнение начала и конца периода описывает итог всей модели, включая демографию, кризисы и прежние программы. Оно не устанавливает причинный эффект отдельной меры.','Before/after comparisons describe the whole model, including demography, crises and earlier programmes. They do not identify a single measure’s causal effect.','期初与期末比较描述整个模型的结果，包括人口、危机和先前项目；不能据此确定单项措施的因果效应。')}</p>`;
  host.querySelector('[data-agenda-return]').onclick=()=>hooks.return();
 }
 function context(host,s,m,l){
  host.querySelector('.agenda-context')?.remove();if(A.mode(s)!=='agenda')return;
  const box=document.createElement('div');box.className='agenda-context';
  if(A.open(s)){
   const place=G.WorldModel.PLACES.find(p=>p.id===m.districtId);
   box.innerHTML=`<button type="button" data-agenda-back>${G.icon('arrow',{size:15})}${tr(l,'Другой вопрос','Change issue','更换议题')}</button><span>${esc(loc(place?.name,l))}</span>`;
   box.querySelector('button').onclick=()=>hooks.navigate('agenda');
  }else{const c=A.continuation(s,m);if(!c)return;box.innerHTML=`<p>${esc(loc(c.text,l))}</p>`;}
  host.querySelector('.mission-heading')?.after(box);
 }
 G.AgendaUI={init,render,context};
})(typeof window!=='undefined'?window:globalThis);
