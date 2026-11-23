/* Progressive, dismissible coaching and an outcome-based campaign briefing.
 * This view never applies a project, advances a year, or draws a random outcome. */
(function(root){
  'use strict';
  const G=root.GovernorGame, S=G.CampaignStrategy;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tr=(l,r,e,z)=>l==='zh'?z:l==='en'?e:r;
  const local=(v,l)=>G.I18n.local(v,l);
  const fmt=(v,l,d=1)=>new Intl.NumberFormat(G.I18n.intlLocale(l),{maximumFractionDigits:d}).format(Number(v)||0);
  let hooks;
  const $=s=>document.querySelector(s);
  function init(h){
    hooks=h;
    const parent=$('#campaign-options');
    parent.insertAdjacentHTML('beforebegin','<div class="campaign-start-course"><label for="campaign-strategy" id="campaign-strategy-label"></label><select id="campaign-strategy" aria-describedby="campaign-strategy-hint"></select><p id="campaign-strategy-hint" class="field-hint"></p><label class="campaign-coach-choice"><input id="campaign-coach-enabled" type="checkbox" checked><span id="campaign-coach-label"></span></label><p class="field-hint" id="campaign-stakes-hint"></p></div>');
    $('#campaign-strategy').addEventListener('change',translate);
    const button=document.createElement('button');button.type='button';button.id='campaign-coach-toggle';button.className='nav-button';
    button.onclick=reopenCoaching;
    $('.side-nav').append(button);
    translate();
  }
  function reopenCoaching(){
    const s=hooks.state();if(!s)return;
    s.onboarding=s.onboarding||{enabled:true,seen:[]};s.onboarding.enabled=true;s.onboarding.seen=[];
    hooks.save();hooks.navigate('mission');refresh();
    const step=$('.campaign-coach');
    if(!step){G.ReleaseUI.openGuide(true);return;}
    step.open=true;
    step.querySelector('summary').focus({preventScroll:true});
    step.scrollIntoView({block:'center'});
  }
  function translate(){
    const l=hooks.language(),selected=$('#campaign-strategy')?.value||'services';
    if(!$('#campaign-strategy'))return;
    $('#campaign-strategy-label').textContent=tr(l,'Ваш стратегический курс','Your strategic course','您的战略方向');
    $('#campaign-strategy').innerHTML=S.COURSES.map(c=>`<option value="${c.id}">${esc(local(c.title,l))}</option>`).join('');
    $('#campaign-strategy').value=selected;
    $('#campaign-strategy-hint').textContent=local(S.course(selected).description,l);
    $('#campaign-coach-label').textContent=tr(l,'Пошаговые подсказки по ходу кампании','Introduce the mechanics as I play','游戏过程中逐步介绍机制');
    const pace=$('#campaign-pace');
    pace.textContent=tr(l,'План занятия: около 80 минут на 20 лет. Можно продолжить с сохранённого года.','Seminar plan: about 80 minutes for 20 years. You can resume from a saved year.','研讨课安排：约 80 分钟完成 20 年，可从保存的年份继续。');
    $('#campaign-stakes-hint').textContent=tr(l,'Каждые пять лет проверяется результат курса. Дефицит требует решения; облегчённый бюджет можно выбрать в параметрах.','Your course is reviewed every five years. Shortfalls require a decision; an assisted budget is available in campaign options.','每五年检查战略成效。预算缺口需要决策；可在设置中选择辅助预算模式。');
    $('#campaign-coach-toggle').textContent=tr(l,'Подсказки по ходу игры','In-game coaching','游戏引导');
  }
  function startOptions(){return {strategyId:$('#campaign-strategy').value,tutorialEnabled:$('#campaign-coach-enabled').checked};}
  function start(state,options){
    if(!state.campaignStrategy)state.campaignStrategy=S.create(state,options.strategyId);
    state.onboarding={version:1,enabled:options.tutorialEnabled,seen:[],allSections:false};
  }
  function seminarFocus(state,l){
    if(state.completed||!state.onboarding?.enabled)return '';
    const block=Math.min(3,Math.floor(state.turnIndex/5));
    const tasks=[
      tr(l,'Выберите район, сравните две меры и проверьте на карте, когда жители действительно получат услугу.','Choose a district, compare two measures and check on the map when residents actually receive the service.','选择一个地区，比较两项措施，然后在地图上核查居民何时真正获得服务。'),
      tr(l,'Найдите обещание или проект из первого пятилетия. Сверьте срок, фактический результат и расходы на продолжение работы.','Find an earlier promise or project. Compare its deadline, actual result and continuing cost.','找出第一个五年的一项承诺或项目，对照期限、实际结果和后续成本。'),
      tr(l,'Сравните два района после кризиса. Проверьте, кому помогло прежнее решение и за счёт чего можно поддержать отстающих.','Compare two districts after a crisis. Check who benefited from earlier decisions and what could support those left behind.','危机后比较两个地区：先前决策帮助了谁，还能怎样支持落后地区？'),
      tr(l,'Проверьте услуги, письма и неоплаченные будущие обязательства перед последним решением. Выберите один результат, который хотите оставить жителям.','Review services, letters and future commitments before your last decision. Choose one result you want to leave residents.','最后一次决策前检查服务、居民来信和未来财政责任，选定一项想留给居民的成果。')
    ];
    const first=state.population.baseYear+block*5;
    return `<p class="campaign-seminar-focus"><strong>${first}–${first+4} · ${tr(l,'ориентир 20 минут','about 20 minutes','建议约 20 分钟')}</strong><br>${esc(tasks[block])}</p>`;
  }
  function openCourse(reviewComplete=false){
    const state=hooks.state(),l=hooks.language();if(!state?.campaignStrategy)return;
    let d=$('#campaign-course-dialog');
    if(!d){d=document.createElement('dialog');d.id='campaign-course-dialog';d.className='release-dialog';document.body.append(d);}
    const reviewed=reviewComplete===true;
    const course=agendaHtml(state,l),reviews=reportHtml(state,l);
    const title=reviewed?tr(l,'Пятилетняя проверка курса','Five-year course review','五年战略评估'):tr(l,'Ваш курс и обязательства','Your course and commitments','您的战略与承诺');
    const latest=state.campaignStrategy.reviews?.at(-1);
    const verdict=reviewed&&latest?`<section class="review-verdict"><p>${state.population.baseYear+latest.year-1}</p><h3>${statusText(latest.status,l)}</h3><p>${tr(l,'Изменение мощности аппарата на следующее пятилетие','Administrative capacity change for the next five years','下一个五年行政能力的变化')} <b>${latest.capacityDelta>0?'+':''}${latest.capacityDelta}</b></p></section>`:'';
    d.innerHTML=`<button type="button" class="secondary-button release-close" data-course-close>${tr(l,'Закрыть','Close','关闭')}</button><h2>${title}</h2>${verdict}${seminarFocus(state,l)}${course}${reviews}`;
    d.setAttribute('aria-label',tr(l,'Курс и обязательства','Course and commitments','战略与承诺'));
    d.querySelector('[data-course-close]').onclick=()=>d.close();
    attachPromiseLinks(d);
    d.querySelector('[data-campaign-delivery]')?.addEventListener('click',()=>{d.close();hooks.delivery();});
    if(!d.open)d.showModal();
  }
  function coach(state,l,selected){
    const turn=state.turnIndex,agenda=state.activeView==='agenda';
    if(turn===0&&agenda)return {key:'agenda',title:tr(l,'Начните с проблемы людей','Start with a problem people face','从居民的问题开始'),text:tr(l,'Посмотрите текущую доступность услуги и причину срочности. Выберите один вопрос. Пока вы рассматриваете варианты, время и деньги не расходуются.','Read the current service access and why the issue is urgent. Pick one issue. Exploring choices spends neither time nor money.','查看当前服务可及性和紧迫原因，选择一个议题。查看方案不会消耗时间或资金。'),view:'residents',link:tr(l,'Посмотреть жителей и услуги','Inspect residents and services','查看居民与服务')};
    if(turn===0&&!selected)return {key:'alternatives',title:tr(l,'Сравните способы решения','Compare ways to solve it','比较解决方案'),text:tr(l,'У вариантов разные сроки, расходы и ограничения. Здание, персонал и транспорт решают разные задачи. Выберите меру — затем появятся размещение, финансирование и условия.','Options differ in timing, costs and constraints. Buildings, staff and transport solve different problems. Choose a measure to inspect its location, funding and terms.','不同方案的期限、费用和限制不同。建筑、人员和交通解决不同问题。选择措施后可查看地点、资金与条件。')};
    if(turn===0&&selected)return {key:'cost',title:tr(l,'Проверьте цену всего решения','Check the full commitment','检查完整承诺'),text:tr(l,'Разовые затраты — только начало. Ниже указаны срок открытия, ежегодное содержание и нагрузка на аппарат. Посмотрите другой вариант, если обязательства не помещаются в ваш план.','Up-front spending is only the beginning. Check opening time, yearly operation and administrative workload below. Compare another option if these commitments do not fit your plan.','一次性支出只是开始。请检查启用时间、年度运营费用和行政负担。如果承诺不符合计划，可比较其他方案。'),view:'treasury',link:tr(l,'Проверить казначейство','Check the treasury','检查财政')};
    if(turn===1)return {key:'delivery',title:tr(l,'Решение ещё должно заработать','An approved measure must start working','批准后还须落地'),text:tr(l,'На карте остаются принятые проекты. Открытие объекта и доступность услуги проверяются отдельно: нужны персонал, содержание и связь с жителями. Можно потратить год на исполнение без нового запуска.','Approved projects stay on the map. Opening a facility and delivering a service are separate: staff, operating funds and access are required. You can devote a year to delivery without launching another project.','已批准项目会保留在地图上。设施启用与服务供给是两回事：还需要人员、运营资金和可达性。可以用一年推进现有项目。'),view:'map',link:tr(l,'Открыть карту проектов','Open the project map','打开项目地图')};
    if(turn===2)return {key:'finance',title:tr(l,'Следующий бюджет уже зависит от вас','You are already shaping the next budget','您的选择已影响下一年预算'),text:tr(l,'Сравните будущие расходы с доходами. Резерв, заём и помощь имеют разную цену. Продление работающей программы может быть важнее нового проекта; срок окончания показан в обязательствах.','Compare future costs with revenue. Reserves, loans and support carry different costs. Renewing a working programme can matter more than a new project; expiry dates appear in commitments.','比较未来支出与收入。储备、贷款和援助各有代价。续期有效项目可能比新项目更重要；到期日在承诺清单中显示。'),view:'treasury',link:tr(l,'Сопоставить обязательства','Compare commitments','比较财政承诺')};
    if(turn===3)return {key:'promises',title:tr(l,'Обещание имеет срок и последствия','A promise has a deadline and consequences','承诺有期限和后果'),text:tr(l,'Условия переговоров меняют стоимость и поддержку. Проверяйте обещания и публикуйте отчёт, когда он требуется. Письма жителей отражают состояние услуг, а не только принятое решение.','Negotiated terms affect cost and support. Check promises and publish a report when required. Residents’ letters reflect service conditions, not merely an approved decision.','谈判条件影响费用与支持度。请检查承诺并按要求公布报告。居民来信反映服务现状，而不仅是已批准的决策。'),view:'stories',link:tr(l,'Прочитать письма жителей','Read residents’ letters','阅读居民来信')};
    if(turn===4&&state.campaignStrategy)return {key:'review',title:tr(l,'Скоро проверка курса','Your course is about to be reviewed','战略检查即将到来'),text:tr(l,'Проверка после пятого года смотрит на услуги, поддержку и будущие обязательства. Сильный результат добавляет одну единицу управленческой мощности; серьёзный провал временно отнимает одну. В следующем пятилетии результат можно исправить.','The five-year review checks services, support and future commitments. A strong result adds one unit of administrative capacity; a serious shortfall temporarily removes one. You can recover at the next review.','五年检查评估服务、支持度与未来承诺。良好结果增加一个行政能力单位；严重不足暂时减少一个。下一次检查可以恢复。')};
    if(turn===5&&G.Agenda.persistent(state))return {key:'followups',title:tr(l,'Новые средства, прежняя ответственность','New tools, continuing responsibility','新工具，持续责任'),text:tr(l,'Повестка остаётся свободной. Новые вопросы открываются по сроку и состоянию региона. Старые нерешённые проблемы сохраняются; календарные кризисы наступят независимо от выбранной карточки.','The agenda remains open. New issues unlock with time and regional conditions. Unresolved problems persist; calendar crises arrive regardless of the card you select.','议程继续开放。新议题根据时间和地区状态解锁。未解决问题仍然存在；日历危机不因选择其他卡片而取消。')};
    return {key:'planning',title:tr(l,'Сопоставьте план и обязательства','Reconcile your plan and commitments','核对计划与承诺'),text:state.campaignStrategy?tr(l,'Проверьте ближайшие открытия, сроки продления и обещания. Затем сравните состояние услуг с целями курса. Вы можете выбрать следующий шаг или дать начатым программам поработать.','Check upcoming openings, renewals and promises. Compare service conditions with your course targets. You can choose a follow-up or let existing programmes operate.','检查近期启用、续期和承诺，并将服务状况与战略目标比较。您可以选择后续行动，也可让已有项目继续运行。'):tr(l,'Проверьте ближайшие открытия, сроки продления и обещания. Сравните состояние услуг в разных территориях и обязательства будущих лет перед следующим решением.','Check upcoming openings, renewals and promises. Compare services across districts and future commitments before your next decision.','检查近期启用、续期和承诺。在下一次决策前比较各地区服务与未来支出承诺。'),view:'treasury',link:tr(l,'Проверить будущие бюджеты','Check future budgets','检查未来预算')};
  }
  function refresh(selected=hooks.selected?.()||false){
    const state=hooks.state(),l=hooks.language();
    document.querySelectorAll('.campaign-coach').forEach(n=>n.remove());
    if(!state)return;
    let courseLink=$('#campaign-course-shortcut');
    if(!courseLink){courseLink=document.createElement('button');courseLink.id='campaign-course-shortcut';courseLink.type='button';courseLink.className='campaign-text-button';courseLink.onclick=openCourse;$('#mission-description').before(courseLink);}
    courseLink.hidden=!state.campaignStrategy||state.activeView!=='mission';
    courseLink.textContent=tr(l,'Курс, цели и ближайшие обязательства','Course, targets and upcoming commitments','战略、目标与近期承诺');
    const onboarding=state.onboarding,collapsed=onboarding?.enabled&&state.turnIndex<2&&!onboarding.allSections;
    for(const b of document.querySelectorAll('.side-nav [data-view]'))b.hidden=!!(collapsed&&['quests','advisors','badges','journal','settings'].includes(b.dataset.view));
    let reveal=$('#campaign-all-sections');
    if(!reveal){reveal=document.createElement('button');reveal.id='campaign-all-sections';reveal.type='button';reveal.className='nav-button';$('.side-nav').append(reveal);reveal.onclick=()=>{const current=hooks.state();if(!current?.onboarding)return;current.onboarding.allSections=true;hooks.save();refresh();};}
    reveal.hidden=!collapsed;reveal.textContent=tr(l,'Показать все разделы','Show all sections','显示所有栏目');
    if(!onboarding?.enabled||state.completed||state.awaitingContinue||!['agenda','mission'].includes(state.activeView))return;
    const step=coach(state,l,selected);if(!step||(onboarding.seen||[]).includes(step.key))return;
    const el=document.createElement('details');el.className='campaign-coach';el.setAttribute('aria-label',tr(l,'Подсказка','Coaching','引导'));
    el.innerHTML=`<summary>${esc(step.title)}</summary><p>${esc(step.text)}</p><div class="campaign-coach-actions">${state.turnIndex===0?`<button type="button" data-coach-practice>${tr(l,'Потренироваться перед решением','Practise before deciding','先练习再决策')}</button>`:''}${step.view?`<button type="button" data-coach-link>${esc(step.link)}</button>`:''}<button type="button" data-coach-done>${tr(l,'Понятно','Got it','明白了')}</button><button type="button" data-coach-skip>${tr(l,'Без подсказок','Skip coaching','跳过引导')}</button></div>`;
    el.querySelector('[data-coach-practice]')?.addEventListener('click',()=>G.ReleaseUI.openGuide(true));
    el.querySelector('[data-coach-link]')?.addEventListener('click',()=>hooks.navigate(step.view));
    el.querySelector('[data-coach-done]').onclick=()=>{(onboarding.seen=onboarding.seen||[]).push(step.key);hooks.save();refresh(selected);};
    el.querySelector('[data-coach-skip]').onclick=()=>{onboarding.enabled=false;hooks.save();refresh(selected);};
    if(state.activeView==='agenda')$('#secondary-stage .agenda-board')?.after(el);
    else $('#mission-context')?.after(el);
  }
  function statusText(id,l){return id==='secured'?tr(l,'Курс подтверждён','Mandate secured','战略得到确认'):id==='at-risk'?tr(l,'Курс требует пересмотра','Mandate at risk','战略需要调整'):tr(l,'Условное доверие','Conditional confidence','有条件信任');}
  function agendaHtml(state,l){
    const s=S.snapshot(state);if(!s)return '';
    const nextYear=state.population.baseYear+s.due-1;
    const goals=s.goals.map(g=>`<div class="campaign-goal"><span>${esc(local(g.label,l))}</span><strong>${fmt(g.value*100,l)}% <small>/ ${fmt(g.target*100,l)}%</small></strong><meter min="0" max="1" value="${g.progress}" aria-label="${esc(local(g.label,l))}"></meter></div>`).join('');
    const review=s.lastReview;
    const reviewText=review?`${state.population.baseYear+review.year-1}: ${statusText(review.status,l)} · ${tr(l,'аппарат','capacity','行政能力')} ${review.capacityDelta>0?'+':''}${review.capacityDelta}`:'';
    const year=state.population.baseYear+state.turnIndex;
    const commitments=G.DeliveryDesk.snapshot(state),items=commitments.items.filter(x=>(x.status==='delivery'&&x.launchYear<=year+3)||x.reason==='ending').slice(0,3);
    const promises=(state.governance?.promises||[]).filter(p=>p.status==='pending'&&p.dueTurn<=state.turnIndex+4).sort((a,b)=>a.dueTurn-b.dueTurn).slice(0,2);
    const milestones=items.map(p=>`<p><b>${p.status==='delivery'?p.launchYear:p.lastFundedYear}</b><span>${esc(local(p.title,l))} · ${p.status==='delivery'?tr(l,'запуск','opening','启用'):tr(l,'истекает финансирование','funding expires','资金到期')}</span></p>`).join('')+promises.map(p=>{
      const due=state.population.baseYear+p.dueTurn-1;
      const project=state.finance.portfolio.find(item=>item.id===p.projectId);
      const action=p.kind==='report'?tr(l,'Отчёт по обещанию','Promised report','承诺的报告'):tr(l,'Публичное обязательство','Public commitment','公共承诺');
      return `<p><b>${due}</b><button type="button" class="campaign-text-button" data-campaign-promise="${esc(p.id)}">${esc(action)}${project?' · '+esc(local(project.title,l)):''}</button></p>`;
    }).join('');
    return `<section class="campaign-overview" aria-label="${tr(l,'Курс и ближайшие события','Course and upcoming events','战略与近期事项')}"><details class="campaign-mandate"><summary><span>${tr(l,'Курс','Course','方向')}: <strong>${esc(local(s.course.title,l))}</strong></span><span>${tr(l,'Проверка','Review','检查')} ${nextYear}</span></summary><div class="campaign-goals">${goals}</div><p class="campaign-guardrails">${tr(l,'Дополнительно: поддержка не ниже 40, долг не выше 90% лимита и покрытие трёх будущих бюджетов.','Also: support at least 40, debt within 90% of its limit, and three funded future budgets.','其他条件：支持度至少40，债务不超过上限的90%，未来三年预算有资金覆盖。')}</p><p class="campaign-guardrails">${tr(l,'Итог: +1 / 0 / −1 к мощности аппарата на следующее пятилетие; эффекты не накапливаются.','Result: +1 / 0 / −1 administrative capacity for the next five years; effects do not stack.','结果：下一个五年行政能力 +1 / 0 / −1，效果不叠加。')}</p></details>${review?`<p class="campaign-review-status ${review.status}">${esc(reviewText)}</p>`:''}<details class="campaign-milestones" ${items.some(p=>p.reason==='ending')||promises.some(p=>p.dueTurn<=state.turnIndex+1)?'open':''}><summary>${tr(l,'Ближайшие обязательства','Upcoming commitments','近期承诺')} <span>${year}–${year+3}</span></summary>${milestones||`<p>${tr(l,'Новых запусков и сроков пока нет. После первого решения здесь появится горизонт вашего плана.','No upcoming openings or deadlines yet. Your first decision will start this planning horizon.','目前没有启用计划或截止日期。首次决策后将在这里显示计划。')}</p>`}<button type="button" class="campaign-text-button" data-campaign-delivery>${tr(l,'Проекты и продление финансирования','Projects and funding renewals','项目与经费续期')}</button></details></section>`;
  }
  function attachPromiseLinks(host){
    host.querySelectorAll('[data-campaign-promise]').forEach(button=>{
      button.onclick=()=>{
        if(host instanceof HTMLDialogElement)host.close();
        G.GovernanceUI.openPromises(button.dataset.campaignPromise);
      };
    });
  }
  function attachAgenda(host){
    attachPromiseLinks(host);
    host.querySelector('[data-agenda-course]')?.addEventListener('click',openCourse);
    host.querySelector('[data-campaign-delivery]')?.addEventListener('click',()=>hooks.delivery());
  }
  function resultHtml(record,state,l){
    const next=G.DeliveryDesk.snapshot(state).items.filter(p=>p.status==='delivery').sort((a,b)=>a.launchYear-b.launchYear)[0];
    const total=record.effects?.support||0,service=record.serviceSupportEffect||0;
    return `<section class="campaign-result"><h3>${tr(l,'Что связывает этот год со следующим','How this year connects to the next','这一年如何影响下一年')}</h3><p>${record.deferred?tr(l,'Новых обязательств нет. Действующие услуги, расходы, демография и кризисы всё равно прошли годовой пересчёт.','No new commitments. Existing services, costs, demography and crises still passed through the annual update.','没有新的承诺。但现有服务、支出、人口与危机仍完成年度更新。'):tr(l,'Принятие меры, её запуск и результат для жителей происходят в разное время. Проверьте карту и доступность услуг после открытия.','Approval, opening and residents’ outcomes happen at different times. Check the map and service access after opening.','批准、启用和居民实际受益发生在不同时间。启用后请检查地图与服务可及性。')}</p><p>${tr(l,'Изменение поддержки за решение и год','Support change from decision and year','决策与全年支持度变化')}: <b>${total>0?'+':''}${fmt(total,l)}</b>. ${tr(l,'Расчётная реакция на услуги до ограничения шкалы','Calculated service response before scale limits','限制量表前的服务响应计算值')}: <b>${service>0?'+':''}${fmt(service,l)}</b>.</p>${next?`<p>${tr(l,'Ближайший ожидаемый запуск','Next expected opening','最近预计启用')}: <b>${esc(local(next.title,l))}</b>, ${next.launchYear}. ${tr(l,'Дальнейшее содержание оплачивается отдельно.','Subsequent operation requires continued funding.','之后的运营需持续资金支持。')}</p>`:''}</section>`;
  }
  function reportHtml(state,l){
    const c=state.campaignStrategy;if(!c)return '';
    return `<section class="campaign-report"><h2>${tr(l,'Как выдержал проверку ваш курс','How your course held up','您的战略经受了怎样的检验')}</h2><p><strong>${esc(local(S.course(c.id).title,l))}</strong></p>${c.reviews.map(r=>`<article><h3>${state.population.baseYear+r.year-1} · ${statusText(r.status,l)}</h3><p>${r.goals.map(g=>`${esc(local(g.label,l))}: ${fmt(g.value*100,l)}% / ${fmt(g.target*100,l)}%`).join('; ')}.</p><p>${tr(l,'Поддержка','Support','支持度')}: ${fmt(r.support,l)}. ${tr(l,'Финансовые условия','Fiscal conditions','财政条件')}: ${r.sustainable?tr(l,'выполнены','met','满足'):tr(l,'не выполнены','not met','未满足')}.</p></article>`).join('')}<p>${tr(l,'Цели объявлены до первого решения. Проценты — показатели модели; проверка курса не заменяет учебную оценку и обсуждение альтернатив.','Goals were declared before the first decision. Percentages are model indicators; course reviews do not replace the learning assessment or discussion of alternatives.','目标在首次决策前公布。百分比是模型指标；战略检查不替代教学评价与备选方案讨论。')}</p></section>`;
  }
  G.CampaignUI={init,translate,startOptions,start,refresh,reopenCoaching,openCourse,agendaHtml,attachAgenda,resultHtml,reportHtml};
})(typeof window!=='undefined'?window:globalThis);
