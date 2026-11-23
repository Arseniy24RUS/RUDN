/* Release 1.0: read-only teaching support. No scores or simulation mutations. */
(function(root){
 'use strict';
 const G=root.GovernorGame||(root.GovernorGame={});
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tr=(l,r,e)=>globalThis.GovernorGame.I18n.choose(l,()=>(r),()=>(e));
 const number=(v,l,d=1)=>Number.isFinite(Number(v))?new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(l),{maximumFractionDigits:d}).format(Number(v)):'—';
 const topics=[
  ['Первый год','Your first year','Откройте вопрос повестки, сравните варианты и выберите меру. Затем проверьте размещение, источник средств, срок запуска и ежегодное содержание. Кнопка утверждения принимает решение; просмотр вариантов не расходует ресурсы.','Open an agenda issue, compare alternatives and select a measure. Check its location, funding, opening date and yearly operation. Approval commits the decision; viewing alternatives spends nothing.'],
  ['Что означает год','What a year means','Кампания охватывает двадцать бюджетных лет: 2026–2045. Население после последнего годового перехода относится к началу 2046 года. Это учебный горизонт управления, а не срок полномочий одного губернатора. В новой открытой кампании вы выбираете приоритеты все двадцать лет; новые вопросы открываются по ситуации и этапу. Сохранённые кампании прежней версии сохраняют свой маршрут.','The campaign spans twenty budget years, 2026–2045. Population after the final annual transition refers to the start of 2046. This is a learning horizon, not one governor’s legal term of office. The new open campaign lets you choose priorities for all twenty years; issues unlock with conditions and stages. Existing saves retain their original route.'],
  ['Деньги и обязательства','Money and commitments','Все финансовые суммы — в условных млрд рублей. Свободный ресурс — остаток казны, доступный для решений; он не равен полному бюджету региона. Заём увеличивает долг, софинансирование может иметь условия, резерв расходуется отдельно. Открытый объект требует оплаченного содержания и кадров.','Money is measured in fictional billions of rubles. Fiscal space is available treasury cash, not the region’s total budget. Borrowing increases debt, cofinancing can impose conditions, and reserves are separate. Open facilities require funded operation and staffing.'],
  ['Три финансовых режима','Three financial modes','По умолчанию «Дефицит требует решения» ограничивает источники покрытия и допускает досрочную передачу управления. В облегчённом бюджете крайний дефицит покрывается учебной помощью и остаётся в отчёте. «Счёт из прошлого» — отдельный стартовый кейс; два дополнительных режима не совмещаются.','By default, “Every shortfall needs a decision” limits funding and allows an early handover. The assisted budget uses emergency classroom support for a final shortfall and discloses it. “An inherited bill” is a separate opening case; the two optional modes cannot be combined.'],
  ['Как читать показатели','Reading the indicators','Поддержка — условный индекс 0–100, а не результат опроса или выборов. Развитие — игровой индекс 0–100, не ВРП. Доступность услуги рассчитывается по её предложению и спросу, а занятость — относительно модельного предложения труда. Изменение долей сравнивайте в процентных пунктах.','Support is a fictional 0–100 index, not an opinion poll or an election result. Development is a game index, not GDP. Service access relates supply to demand; employment relates employed residents to modelled labour supply. Compare changes in shares in percentage points.'],
  ['Люди и территория','People and places','Население меняется через рождения, смерти и миграцию по полу и возрасту. Внутренний переезд меняет население территории, но не области. Поездки на работу не являются переселением. Пять авторов писем — вымышленные персонажи, не репрезентативная выборка жителей.','Population changes through births, deaths and migration by age and sex. An internal move changes district populations, not the regional total. Commuting is not migration. The five letter writers are fictional characters, not a representative sample of residents.'],
  ['Риск и сравнение стратегий','Risk and strategy comparison','Одинаковый код вместе с одинаковыми сценарием, режимом, порядком и решениями воспроизводит расчёты. Для сравнения стратегий сохраняйте исходные условия. Один удачный исход не доказывает превосходство политики: повторяйте сравнение на нескольких кодах и учитывайте распределение результатов.','The same code, scenario, mode, order and decisions reproduce the calculations. Hold starting conditions fixed when comparing strategies. One favourable outcome does not prove a policy superior: compare several codes and examine the distribution of outcomes.'],
  ['Учебный разбор','Learning debrief','Звёзды показывают, какие обещания вы выполнили и сколько лет оплачивали работу служб. В отчёте сравните доступность услуг по районам, долги и цену выбранного курса.','Stars track delivery and funded years of service. In your report, compare access across districts, debt and the cost of your chosen course.'],
  ['Сохранение и автономная работа','Saving and offline use','Игра сохраняет партию в этом браузере. Чтобы продолжить на другом устройстве, откройте настройки и перенесите сохранение. Когда все ресурсы загружены, можно играть без сети.','Your campaign is saved in this browser. To continue on another device, transfer your save in Settings. Once all resources have loaded, you can play offline.']
 ];
 // A worked example that can be replayed without touching the campaign.
 const phrase=(ru,en,zh)=>({ru,en,zh});
 const rehearsal=[
  {
   title:phrase('1. Найдите адресата','1. Find who needs help','1. 找出需要帮助的居民'),
   prompt:phrase('В дальнем районе есть здание клиники, но приёма почти нет. Что посмотреть до выбора меры?','A remote district has a clinic building but sees few patients. What would you check before choosing a measure?','偏远地区已有诊所，但很少能接诊。选择措施前，应该先看什么？'),
   choices:[phrase('Число новых зданий','The number of new buildings','新建楼宇数量'),phrase('Доступность медицины в этом районе','Health service access in this district','本区的医疗服务可及性')],
   correct:1,explain:phrase('Откройте «Жители и услуги» и сравните районы. Нужны работающая услуга, персонал и возможность до неё добраться.','Open Residents and services and compare districts. People need a working service, staff and a way to reach it.','打开“居民与服务”比较各区。居民需要实际运行的服务、工作人员和可达的地点。')
  },{
   title:phrase('2. Прочитайте смету','2. Read a proposal','2. 读懂预算'),
   prompt:phrase('Учебный пример: на запуск нужно 2 млрд ₽ сейчас, а после открытия — 0,4 млрд ₽ в год. Что проверить перед подписью?','Worked example: opening takes 2 bn RUB now, then operation costs 0.4 bn RUB per year. What do you check before signing?','练习示例：启动需要本期支出 20 亿卢布，启用后每年还需 4 亿卢布。签字前要核对什么？'),
   choices:[phrase('Казну сейчас и деньги на последующие годы','Cash now and future operating funds','本期财政资金和后续运营经费'),phrase('Только 2 млрд ₽ на запуск','Just the 2 bn RUB up front','只检查启动所需的 20 亿卢布')],
   correct:0,explain:phrase('В проекте выберите источник и сравните сумму из казны, год открытия и содержание. В казначействе уже учтены прежние обязательства.','In the proposal, choose a funding source and compare treasury spending, opening year and upkeep. The treasury also carries earlier commitments.','在方案中选择资金来源，比较财政支出、启用年份和运营费。财政还承担着以前的承诺。')
  },{
   title:phrase('3. Дайте проверяемое обещание','3. Make a verifiable promise','3. 作出可核查的承诺'),
   prompt:phrase('Плановый запуск — 2028. Муниципалитету вы обещали запустить услугу к 2029 году. Если её откроют в 2029-м, каков итог?','Opening is planned for 2028. You promised the municipality to open by 2029. What if the service opens in 2029?','计划于 2028 年启用，你承诺最晚在 2029 年为市政团队启用服务。如果 2029 年启用，结果如何？'),
   choices:[phrase('Обещание нарушено','The promise was broken','承诺未兑现'),phrase('Проект опоздал, обещание выполнено','The project was late, but the promise was kept','项目延期，承诺仍已兑现')],
   correct:1,explain:phrase('На встрече выберите собеседника и сравните два предложения. Проверьте цену условия и крайний срок рядом с подписью. Можно подписать и без условий.','At a meeting, choose a participant and compare both offers. Check the term’s cost and deadline before signing. You can also sign without promises.','在会议上选一位参与者，比较两项提议。签字前核对条件的成本和截止时间，也可以不附加承诺。')
  },{
   title:phrase('4. Проверьте результат','4. Check delivery','4. 核查执行结果'),
   prompt:phrase('Проект появился на карте. Жители всё ещё пишут, что попасть на приём трудно. Как выяснить причину?','The project appears on the map, yet residents still report trouble getting an appointment. Where would you look?','项目已经出现在地图上，居民却仍反映挂号难。应该怎样查找原因？'),
   choices:[phrase('Открыть проект и проверить запуск и работу','Open the project and check its status and operation','打开项目，核查启用及运营情况'),phrase('Сразу заказать ещё одно здание','Order another building immediately','立即再建一座楼')],
   correct:0,explain:phrase('Сверьте фактическое открытие, кадры и срок финансирования с доступностью услуги в районе. В протоколах проверьте сроки. Обещанный отчёт нужно опубликовать.','Compare actual opening, staffing and funded duration with district access. Check the deadlines in the minutes. A promised report must be published.','对照实际启用时间、人员、经费期限和本区服务可及性。到会议记录中核对截止时间；承诺的报告须主动发布。')
  },{
   title:phrase('5. Измените курс','5. Adjust course','5. 调整方向'),
   prompt:phrase('На пятилетней проверке средний результат вырос, но отстающий район всё ещё не достигает цели курса. Что сравните перед следующим решением?','At the five-year review the regional average rose, yet the weakest district still misses the course target. What would you compare next?','五年评估时，全区平均水平上升，最薄弱地区却还未达到战略目标。下一步要比较什么？'),
   choices:[phrase('Только общий рост показателя','Only the change in the average','只看平均指标的增长'),phrase('Цель курса, отставание района и цену улучшения','The course target, district gap and cost of improvement','战略目标、地区差距和改善成本')],
   correct:1,explain:phrase('Выберите одну цель следующего пятилетия. Откройте карту или казначейство и проверьте, какая доступная мера приближает вас к ней.','Pick one target for the next five years. On the map or in the treasury, see which available measure would move you closer.','为下一个五年选择一个目标，在地图或财政页面检查哪项可行措施能够推进目标。')
  }
 ];
 function practice(d,l){
  let index=0;
  const panel=d.querySelector('[data-practice]');
  const label=(ru,en,zh)=>phrase(ru,en,zh)[l];
  function draw(){
   const item=rehearsal[index];
   panel.innerHTML=`<h3 tabindex="-1">${esc(item.title[l])}</h3><p>${esc(item.prompt[l])}</p><div class="practice-choices"></div><p role="status"></p>`;
   const buttons=panel.querySelector('div'),status=panel.querySelector('[role="status"]');
   for(const [i,choice] of item.choices.entries()){
    const b=document.createElement('button');b.type='button';b.className='secondary-button';b.textContent=choice[l];buttons.append(b);
    b.onclick=()=>{
     const correct=i===item.correct;
     status.textContent=(correct?label('Верно. ','Correct. ','正确。'):label('Посмотрите ещё раз. ','Try again. ','请再看一看。'))+item.explain[l];
     if(!correct||panel.querySelector('[data-practice-next]'))return;
     const next=document.createElement('button');next.type='button';next.className='primary-button';next.dataset.practiceNext='';
     next.textContent=index+1<rehearsal.length?label('Дальше','Next','下一步'):label('Завершить тренировку','Finish practice','完成练习');
     next.onclick=()=>{if(++index<rehearsal.length)draw();else{d.close();}};
     panel.append(next);
    };
   }
   panel.querySelector('h3').focus();
  }
  d.querySelector('[data-practice-start]').onclick=()=>{index=0;panel.hidden=false;draw();};
 }
 function guide(l='ru'){
  return `<div class="learning-intro"><small>${tr(l,'СПРАВОЧНИК ГУБЕРНАТОРА','GOVERNOR’S GUIDE')}</small><h2 id="learning-title">${tr(l,'Решение начинается с вопроса','Every decision starts with a question')}</h2><p>${tr(l,'Кому поможет мера, когда она заработает и чем вы оплатите её работу через три года?','Who benefits, when will the service open, and how will you fund it three years from now?')}</p></div><section class="practice-intro"><button type="button" class="secondary-button" data-practice-start>${esc(phrase('Тренировка первого решения','Practise your first decision','练习第一次决策')[l])}</button><div data-practice hidden></div></section><div class="learning-topics">${topics.map((t,i)=>`<details ${i===0?'open':''}><summary>${esc(globalThis.GovernorGame.I18n.choose(l,()=>t[0],()=>t[1]))}</summary><p>${esc(globalThis.GovernorGame.I18n.choose(l,()=>t[2],()=>t[3]))}</p></details>`).join('')}</div><p class="learning-boundary">${tr(l,'Область, карта, персонажи, параметры и правовые условия вымышлены. Коэффициенты не оценены на наблюдаемых данных; результат не является прогнозом субъекта РФ.','The region, map, characters, parameters and legal conditions are fictional. Coefficients were not fitted to observed data; results are not a real-region forecast.')}</p>`;
 }
 function reportBody(state,l='ru'){
  const E=G.Engine||(typeof require==='function'?require('./engine.js'):null),D=G.DATA||(typeof require==='function'?require('./consolidation-data.js'):null);
  const r=E.buildReport(state,l),p=r.population,F=r.final,fmt=(v,d=1)=>number(v,l,d);
  const status=state.completed?tr(l,'Кампания завершена','Campaign complete'):state.budgetReview?.status==='supervised'?tr(l,'Досрочная передача управления','Early financial handover'):tr(l,'Промежуточный отчёт','Interim report');
  const table=(headers,rows)=>`<div class="report-table" tabindex="0" role="region" aria-label="${tr(l,'Таблица: прокрутка по горизонтали','Table: scroll horizontally')}"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>i===0?`<th scope="row">${esc(v)}</th>`:`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const districts=D.districts.map(d=>{const a=p.initial.access[d.id],b=p.current.municipalities[d.id];return[E.localise(d.name,l),fmt(a.population,0),fmt(b.population,0),fmt(b.population-a.population,0),fmt(b.healthAccess*100),fmt(b.schoolAccess*100),fmt(b.employment*100)];});
  const funds={treasury:tr(l,'Казна','Treasury'),cofinance:tr(l,'Софинансирование','Cofinancing'),reserve:tr(l,'Резерв','Reserve'),debt:tr(l,'Заём','Debt')};
  const outcomes={'on-time':tr(l,'По плану','On time'),delayed:tr(l,'Задержка','Delayed'),overrun:tr(l,'Удорожание','Cost overrun'),partial:tr(l,'Неполное исполнение','Partial delivery')};
  const decisions=r.decisions.map(d=>{const original=state.history[d.turn-1];return[p.baseYear+d.turn-1,d.mission,d.action,funds[d.fundingMode]||d.fundingMode,fmt(d.funding?.actualTotalCost??d.funding?.totalCost??0,2),original.deferred?tr(l,'Без новой меры','No new measure'):outcomes[d.delivery?.id]||'—'];});
  const financial=r.forecast.rows.map(y=>[y.year,fmt(y.programmeOpex,2),fmt((y.reviewPrincipal||0)+(y.recoveryPrincipal||0),2),fmt(y.net,2),fmt(y.cash,2)]);
  const labels=tr(l,['Казна, млрд ₽','Резерв, млрд ₽','Долг, млрд ₽','Экстренная учебная помощь, млрд ₽','Поддержка, индекс 0–100','Развитие, индекс 0–100'],['Treasury, bn RUB','Reserve, bn RUB','Debt, bn RUB','Emergency classroom support, bn RUB','Support, 0–100 index','Development, 0–100 index']);
  const values=[F.fiscalSpace,F.reserve,F.debt,r.finance.totalEmergencyTransfers,F.support,F.development];
  return `<header class="report-heading"><p>${l==='ru'?'РУДН':'RUDN'} · ${tr(l,'Губернатор: Новая область','Governor: Novaya Oblast')}</p><h1>${status}</h1><p>${esc(state.profile.name)}${state.profile.group?' · '+esc(state.profile.group):''}</p><p>${esc(r.scenario.name)} · ${tr(l,'Принято решений','Decisions made')}: ${state.history.length}/20 · ${tr(l,'Код','Code')}: ${esc(state.seed)}</p><p>${tr(l,'Бюджетные решения относятся к','Budget decisions cover')} ${p.baseYear}${state.history.length?'–'+(p.baseYear+state.history.length-1):tr(l,' (решений ещё нет)',' (no decisions yet)')}. ${tr(l,'Население на начало','Population at the start of')} ${p.year}.</p></header>
  <section><h2>${tr(l,'Ресурсы и результаты','Resources and outcomes')}</h2><div class="report-metrics">${labels.map((x,i)=>`<div><small>${x}</small><strong>${fmt(values[i],2)}</strong></div>`).join('')}</div>${state.completed?`<h3>${esc(F.ending.title)}</h3><p>${esc(F.ending.description)}</p>`:`<p>${tr(l,'Это состояние последнего подтверждённого перехода. Незавершённая кампания не оценивается как полный двадцатилетний результат.','This is the last confirmed state. An unfinished campaign is not assessed as a full twenty-year outcome.')}</p>`}</section>
  <section><h2>${tr(l,'Пять территорий','Five districts')}</h2>${table(tr(l,['Территория','Население: старт','Население: сейчас','Изменение, чел.','Медицина, %','Школа, %','Занятость, %'],['District','Initial population','Current population','Change, people','Health, %','School, %','Employment, %']),districts)}<p class="report-note">${tr(l,'Индексы доступности — модельные отношения предложения и спроса. Занятость — доля занятых в модельном предложении труда. Сравнение «до/после» описывает траекторию, но не устанавливает причинный эффект выбранной меры.','Access indices are modelled supply-to-demand ratios. Employment is the employed share of modelled labour supply. Before/after comparisons describe a trajectory; they do not identify the causal effect of a policy.')}</p></section>
  <section><h2>${tr(l,'Обязательства после текущего года','Commitments after the current year')}</h2>${table(tr(l,['Год','Содержание, млрд ₽','Погашение займов, млрд ₽','Баланс, млрд ₽','Казна на конец, млрд ₽'],['Year','Operation, bn RUB','Loan principal, bn RUB','Balance, bn RUB','Closing cash, bn RUB']),financial)}<p>${tr(l,'Условный расчёт на три года: без новых решений, при фиксированных численности и структуре населения. Резерв не расходуется автоматически. Отрицательная казна означает потребность в дополнительном финансировании.','Conditional three-year projection: no new decisions and a fixed population and age structure. Reserves are not used automatically. Negative cash indicates a financing requirement.')}</p></section>
  <section><h2>${tr(l,'Регистр решений','Decision register')}</h2>${decisions.length?table(tr(l,['Год','Вопрос','Решение','Источник','Стоимость, млрд ₽','Исполнение'],['Year','Issue','Decision','Funding','Cost, bn RUB','Delivery']),decisions):`<p>${tr(l,'Решения ещё не приняты.','No decisions yet.')}</p>`}</section>
  ${G.CampaignUI?.reportHtml(state,l)||''}
  <section><h2>${tr(l,'Вопросы для учебного разбора','Questions for the debrief')}</h2><p>${tr(l,'Какую альтернативу вы отвергли и почему? В какой территории результат оказался слабее среднего? Какие затраты будут нести следующие бюджеты? Как вы разделяете результат решения и влияние начальных условий, предыдущих программ и случайного исхода? Какие обещания удалось выполнить и какой ценой?','Which alternative did you reject, and why? Which district performed below the regional average? What costs remain for future budgets? How do you separate the decision’s result from starting conditions, earlier programmes and chance? Which promises were fulfilled, and at what cost?')}</p></section>
`;
 }
 const api={guide,practice,reportBody,topics};G.Learning=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
