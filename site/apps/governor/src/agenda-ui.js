/* Stage 9 UI. Existing art and colour system; no numerical model in the view. */
(function(root) {
 'use strict';
 const G=root.GovernorGame,A=G.Agenda;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tr=(l,r,e)=>globalThis.GovernorGame.I18n.choose(l,()=>(r),()=>(e));
 const loc=(v,l)=>globalThis.GovernorGame.I18n.local(v,l);
 let hooks,focused=null;
 const fmt=(v,l,metric)=>new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(l),{maximumFractionDigits:1}).format(v*100)+(metric==='floodProtection'?' / 100':'%');
 function init(h){hooks=h;}
 function returnButton(label){return `<button type="button" class="secondary-button" data-agenda-return>${esc(label)}</button>`;}
 function render(host) {
  const s=hooks.state(),l=hooks.language();
  host.classList.add('agenda-stage');
  if(!A.open(s)||s.completed){renderReview(host,s,l);return;}
  const pending=A.pending(s),done=A.started(s),all=A.TOPICS;
  if(!pending.some(t=>t.id===focused))focused=pending[0]?.id||A.OPERATIONS.id;
  const years=A.LENGTH-s.turnIndex;
  host.innerHTML=`<header class="agenda-heading"><div><p>${s.population.baseYear+s.turnIndex} · ${tr(l,'Первая глава','Chapter one')}</p><h2 id="agenda-heading">${tr(l,'Что важнее в этом году?','What matters most this year?')}</h2><span>${tr(l,'Вы выбираете порядок. Один год – одно решение.','You set the order. One year, one decision.')}</span></div><div class="agenda-time"><b>${years}</b><span>${tr(l,'лет до конца главы','years left in this chapter')}</span></div></header>
   <div class="agenda-board"><section class="agenda-inbox" aria-label="${tr(l,'Вопросы региона','Regional issues')}"><h3>${tr(l,'На вашем столе','On your desk')}</h3><div class="agenda-topic-list">${all.map(t=>{
    const chosen=done.has(t.id),win=A.window(s,t.id);
    const status=chosen?tr(l,'Мера уже принята','A measure has been approved'):win?(win.open?tr(l,`Софинансирование: до ${win.untilYear}`,`Cofinancing: until ${win.untilYear}`):tr(l,'Предложение софинансирования закрыто','Cofinancing offer closed')):tr(l,'Можно взять в работу','Available to address');
    return `<button type="button" class="agenda-topic ${focused===t.id?'is-focused':''} ${chosen?'is-started':''}" data-agenda-topic="${t.id}" aria-pressed="${focused===t.id}" ${chosen?'disabled':''}><span class="agenda-topic-icon">${G.icon(chosen?'check':t.icon,{size:23})}</span><span><strong>${esc(loc(t.title,l))}</strong><small class="${!chosen&&win&&!win.open?'expired':''}">${esc(status)}</small></span>${G.icon(chosen?'check':'arrow',{size:17})}</button>`;
   }).join('')}</div><button type="button" class="agenda-hold ${focused===A.OPERATIONS.id?'is-focused':''}" data-agenda-topic="${A.OPERATIONS.id}" aria-pressed="${focused===A.OPERATIONS.id}">${G.icon('clock',{size:21})}<span><strong>${tr(l,'Сосредоточиться на исполнении','Focus on existing delivery')}</strong><small>${tr(l,'Год без новых запусков','A year without new starts')}</small></span></button><p class="agenda-footnote">${tr(l,'«Мера принята» не означает, что проблема решена. Её результат виден в услугах и на карте.','“Approved” does not mean “resolved”. Check the services and map for results.')}</p></section><section id="agenda-focus" class="agenda-focus" aria-label="${tr(l,'Выбранный вопрос','Selected issue')}"></section></div>
   <details class="agenda-rules"><summary>${tr(l,'Что изменит порядок решений?','What does the order change?')}</summary><p>${tr(l,'Годы строительства, содержание, демография и нагрузка аппарата идут своим чередом. Поздний запуск оставляет меньше лет полезной работы. У двух предложений софинансирования есть заранее объявленный срок. Просмотр вопросов ничего не списывает и не перебрасывает случайность.','Construction years, operating costs, demography and administrative workload all continue normally. A late start leaves fewer years of useful operation. Two cofinancing offers have announced deadlines. Viewing an issue spends nothing and never redraws an outcome.')}</p><p>${tr(l,'Первые пять лет свободны, последующие пятнадцать сохраняют сюжетную последовательность. Сроки конкурсов – условие учебной кампании, не нормы бюджетного законодательства.','The first five years are open; the next fifteen retain the story sequence. Offer deadlines are fictional campaign rules, not budget law.')}</p></details>`;
  host.querySelectorAll('[data-agenda-topic]').forEach(b=>b.addEventListener('click',()=>{focused=b.dataset.agendaTopic;host.querySelectorAll('[data-agenda-topic]').forEach(x=>{x.classList.toggle('is-focused',x===b);x.setAttribute('aria-pressed',String(x===b));});detail(host.querySelector('#agenda-focus'),s,l);if(innerWidth<=900){host.querySelector('#agenda-focus').scrollIntoView({block:'start',behavior:'auto'});host.querySelector('#agenda-focus h3')?.focus({preventScroll:true});}}));
  detail(host.querySelector('#agenda-focus'),s,l);
 }
 function detail(host,s,l) {
  const t=A.topic(focused),wait=!t;
  const image=t?.image||'service';
  const scenes={'rural-healthcare':'north-access-scene','youth-employment':'industrial-mentoring-scene','flood-preparedness':'river-before-flood-scene','digital-services':'capital-service-scene','school-neighbourhood':'suburb-school-scene'};
  const scene=scenes[focused];
  const active=s.finance.portfolio.filter(p=>p.status==='active').length;
  const delivery=s.finance.portfolio.filter(p=>p.status==='delivery').length;
  const val=t?s.population.derived.municipalities[t.districtId][t.metric]:null;
  const win=t?A.window(s,t.id):null;
  const title=wait?tr(l,'Довести начатое','Let existing work progress'):loc(t.title,l);
  host.innerHTML=`<div class="agenda-illustration ${scene?'with-scene':''}"><img src="${scene?'assets/scenes/'+scene+'.webp':G.IllustratedAssets.topic(focused)}" alt=""><span>${esc(wait?tr(l,'Правительство области','Regional government'):loc(G.WorldModel.PLACES.find(d=>d.id===t.districtId)?.name,l))}</span></div><div class="agenda-focus-copy"><h3 tabindex="-1">${esc(title)}</h3><div class="agenda-voice"><strong>${esc(wait?tr(l,'Виктор · финансовый советник','Viktor · finance adviser'):loc(t.voice,l))}</strong><p>${esc(wait?tr(l,delivery||active?`В реализации: ${delivery}; работают: ${active}. Можно не брать новых обязательств и дать этим программам пройти обычный год.`:'Проектов пока нет. Этот год просто пройдёт без новых мер: обязательные расходы будут оплачены, а жители останутся с нынешними услугами.',delivery||active?`In delivery: ${delivery}; operating: ${active}. You can take on no new commitments while these programmes pass through a normal year.`:'There are no projects yet. This year would pass without new measures: mandatory expenses are paid and residents keep their current services.'):loc(t.opening,l))}</p></div>
   ${t?`<div class="agenda-service"><span>${esc(loc(t.label,l))}</span><b>${fmt(val,l,t.metric)}</b></div><p class="agenda-tradeoff">${esc(loc(t.tradeoff,l))}</p>`:''}
   <details class="agenda-wait"><summary>${tr(l,'Если не сейчас','If not this year')}</summary><p>${esc(wait?tr(l,'Ни опыт, ни удача не ускоряют строительство. Никакого специального бонуса за ожидание нет. Непринятые вопросы останутся на столе, пока не закончатся пять лет.','Neither experience nor luck speeds construction. Waiting gives no special bonus. Unaddressed issues stay on the desk until the five years end.'):loc(t.wait,l))}</p></details>
   ${win?`<p class="agenda-offer ${win.open?'':'expired'}">${G.icon('calendar',{size:17})}<span>${esc(win.open?tr(l,`Предложение софинансирования действует по ${win.untilYear} включительно. После этого – свои средства или допустимый долг.`,`The cofinancing offer is valid through ${win.untilYear}. After that: own funds or eligible debt.`):tr(l,'Это предложение софинансирования закрыто. Сам проект по-прежнему доступен за собственные средства или допустимый долг.','This cofinancing offer has closed. The project itself is still available using own funds or eligible debt.'))}</span></p>`:''}
   <button type="button" class="primary-button agenda-explore" data-agenda-explore="${wait?A.OPERATIONS.id:t.id}">${tr(l,'Рассмотреть решение','Explore this decision')}${G.icon('arrow',{size:20})}</button><small class="agenda-no-commit">${tr(l,'Иллюстрация вводной ситуации. Сейчас вы только выбираете вопрос; деньги списываются после утверждения.','Opening-situation illustration. This only selects an issue; spending happens after confirmation.')}</small></div>`;
  host.querySelector('[data-agenda-explore]').addEventListener('click',e=>hooks.choose(e.currentTarget.dataset.agendaExplore));
 }
 function renderReview(host,s,l) {
  const r=A.report(s),year=s.population.baseYear+5;
  if(A.mode(s)!=='agenda'){host.innerHTML=`<header class="agenda-heading"><div><h2>${tr(l,'Первый срок','First term')}</h2><p>${tr(l,'В этой партии выбран последовательный маршрут.','This game follows the guided sequence.')}</p></div></header>${returnButton(tr(l,'Вернуться к миссии','Return to the mission'))}`;host.querySelector('[data-agenda-return]').onclick=()=>hooks.return();return;}
  host.innerHTML=`<header class="agenda-heading"><div><p>${s.population.baseYear}–${year-1} · ${tr(l,'Итоги на начало','State at the start of')} ${year}</p><h2>${tr(l,'Пять лет вашего курса','Five years of your priorities')}</h2><span>${tr(l,'Что успели запустить – и с чем живёт область.','What you started, and what the region lives with.')}</span></div>${returnButton(tr(l,s.completed?'Вернуться к региону':'Продолжить срок',s.completed?'Return to the region':'Continue your term'))}</header><section class="agenda-sequence" aria-label="${tr(l,'Порядок решений','Decision order')}">${r.order.map(o=>`<div><small>${s.population.baseYear+o.turn-1}</small><strong>${esc(o.deferred?tr(l,'Без новых запусков','No new starts'):loc(A.topic(o.missionId)?.title,l))}</strong></div>`).join('')}</section><section class="agenda-review-list">${r.topics.map(t=>`<article><img src="assets/world/${A.topic(t.id).image}.webp" alt=""><div><h3>${esc(loc(t.title,l))}</h3><p>${t.startedTurn?esc(tr(l,`Начато в ${s.population.baseYear+t.startedTurn-1}: `,`Started in ${s.population.baseYear+t.startedTurn-1}: `)+loc(t.titleAction,l)):tr(l,'В первой главе новую меру не запускали.','No new measure was started in chapter one.')}</p><small>${t.startedTurn?(t.openedByChapter?tr(l,`Открытие: ${s.population.baseYear+t.openedTurn-1}.`,`Opened: ${s.population.baseYear+t.openedTurn-1}.`):tr(l,'К концу главы ещё не открыто.','Not yet open by the end of the chapter.')):tr(l,'Вопрос вернётся в следующих главах.','The issue returns in later chapters.')}</small></div><div class="agenda-review-value"><span>${esc(loc(t.label,l))}</span><strong>${fmt(t.initial,l,t.metric)} <i>→</i> ${fmt(t.current,l,t.metric)}</strong></div></article>`).join('')}</section><p class="agenda-review-note">${tr(l,'Показатели зафиксированы на конце пятого года. Это итог всей модели: услуг, прежних решений и демографических изменений. Разность не является оценкой причинного эффекта одного решения.','Indicators are fixed at the end of year five. They reflect the whole model: services, earlier decisions and demographic changes. The difference is not a causal estimate for one decision.')}</p><details class="agenda-rules"><summary>${tr(l,'Нерешённое не исчезает','Unresolved issues do not vanish')}</summary><p>${tr(l,'Вторая глава не выдаёт вам недостроенные проекты задним числом. Реализация, расходы и последующие кризисы опираются на то, что вы действительно приняли. Старые карточки первой главы закрываются, но соответствующие проблемы получают продолжение.','Chapter two does not invent earlier projects. Delivery, costs and later crises depend on what you actually approved. Chapter-one cards close, but their underlying problems continue.')}</p></details>`;
  host.querySelector('[data-agenda-return]').onclick=()=>hooks.return();
 }
 function context(host,s,m,l) {
  host.querySelector('.agenda-context')?.remove();
  if(A.mode(s)!=='agenda')return;
  const box=document.createElement('div');box.className='agenda-context';
  if(A.open(s)) {
    const w=A.window(s,m.id);
    box.innerHTML=`<button type="button" data-agenda-back>${G.icon('arrow',{size:15})}${tr(l,'Другой вопрос','Choose another issue')}</button><span>${tr(l,`Год ${s.turnIndex+1} из 5: запуск не обязателен.`,`Year ${s.turnIndex+1} of 5: a new start is optional.`)}</span>${w?`<small>${esc(w.open?tr(l,`Софинансирование до ${w.untilYear}`,`Cofinancing through ${w.untilYear}`):tr(l,'Предложение софинансирования закрыто','Cofinancing offer closed'))}</small>`:''}`;
    box.querySelector('button').onclick=()=>hooks.navigate('agenda');
  }else{
    const c=A.continuation(s,m);if(!c)return;box.innerHTML=`<p>${esc(loc(c.text,l))}</p>`;
  }
  host.querySelector('.mission-heading')?.after(box);
  if(!box.isConnected)host.querySelector('#mission-description')?.before(box);
 }
 G.AgendaUI={init,render,context};
})(typeof window!=='undefined'?window:globalThis);
