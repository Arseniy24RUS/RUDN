/* Five-tab interface for the annual Governor assignment. */
(function (root) {
  'use strict';
  const G = root.GovernorGame ||= {};
  const COPY = {
  "nav.decisions": [
    "Решения",
    "Decisions",
    "决策"
  ],
  "nav.budget": [
    "Бюджет",
    "Budget",
    "预算"
  ],
  "nav.map": [
    "Карта",
    "Map",
    "地图"
  ],
  "nav.stats": [
    "Статистика",
    "Statistics",
    "统计"
  ],
  "nav.advisor": [
    "Советник",
    "Adviser",
    "顾问"
  ],
  "turn.next": [
    "Следующий год",
    "Next year",
    "下一年"
  ],
  "turn.commitName": [
    "Завершить {year} год",
    "Finish {year}",
    "结束{year}年"
  ],
  "turn.finish": [
    "Завершить кампанию",
    "Finish campaign",
    "结束任期"
  ],
  "start.name": [
    "Губернатор",
    "Governor",
    "州长"
  ],
  "start.courseNote": [
    "20 лет · Оценка за семинар",
    "20 years · Graded seminar",
    "20年任期 · 计入研讨课成绩"
  ],
  "start.begin": [
    "Начать",
    "Start",
    "开始"
  ],
  "start.resume": [
    "Продолжить",
    "Continue",
    "继续"
  ],
  "start.practice": [
    "Свободная игра · без оценки",
    "Free play · Ungraded",
    "自由模式 · 不计分"
  ],
  "game.menu": [
    "Меню игры",
    "Game menu",
    "游戏菜单"
  ],
  "game.exit": [
    "Выйти в семинар",
    "Return to seminar",
    "返回研讨课"
  ],
  "game.exitFree": [
    "Выйти к играм",
    "Return to games",
    "返回游戏列表"
  ],
  "game.year": [
    "{year} год",
    "{year}",
    "{year}年"
  ],
  "game.skip": [
    "Перейти к игре",
    "Skip to game",
    "跳至游戏"
  ],
  "dec.event": [
    "Ситуация года",
    "Event of the year",
    "年度事件"
  ],
  "dec.projects": [
    "Проект года",
    "Project for the year",
    "年度项目"
  ],
  "dec.add": [
    "Добавить в план",
    "Add to plan",
    "加入计划"
  ],
  "dec.change": [
    "Изменить",
    "Change",
    "更改"
  ],
  "dec.defer": [
    "Не начинать проект",
    "Start no project",
    "本年不启动项目"
  ],
  "dec.dismiss": [
    "Закрыть",
    "Close",
    "关闭"
  ],
  "dec.promise": [
    "Сохранить условия",
    "Save terms",
    "保存条件"
  ],
  "dec.forecast": [
    "Прогноз",
    "Forecast",
    "预测"
  ],
  "budget.taxes": [
    "Налоги",
    "Taxes",
    "税收"
  ],
  "budget.loan": [
    "Заём",
    "Loan",
    "借款"
  ],
  "budget.sectors": [
    "По отраслям",
    "By sector",
    "分领域"
  ],
  "budget.remaining": [
    "Остаток",
    "Remaining",
    "余额"
  ],
  "budget.available": [
    "Доступно",
    "Available",
    "可用资金"
  ],
  "budget.income": [
    "Доходы",
    "Revenue",
    "收入"
  ],
  "budget.expenses": [
    "Расходы",
    "Expenditure",
    "支出"
  ],
  "budget.reserve": [
    "Резерв",
    "Reserves",
    "储备金"
  ],
  "budget.debt": [
    "Долг",
    "Debt",
    "债务"
  ],
  "budget.debtLimit": [
    "Лимит долга",
    "Debt limit",
    "债务上限"
  ],
  "budget.interest": [
    "Проценты",
    "Interest",
    "利息"
  ],
  "budget.principal": [
    "Основной долг",
    "Principal",
    "本金"
  ],
  "budget.loanDraft": [
    "Добавить заём в план",
    "Add loan to plan",
    "将借款加入计划"
  ],
  "budget.sectorPlanned": [
    "План на {year} год",
    "Plan for {year}",
    "{year}年计划"
  ],
  "budget.sectorActual": [
    "Потрачено за {year} год",
    "Spent in {year}",
    "{year}年实际支出"
  ],
  "budget.now": [
    "Сейчас",
    "Up front",
    "前期支出"
  ],
  "budget.annual": [
    "Содержание в год",
    "Annual operating cost",
    "年度运营费"
  ],
  "budget.insufficient": [
    "Не хватает {amount}",
    "Short by {amount}",
    "资金缺口为{amount}"
  ],
  "map.chooseSite": [
    "Выбрать участок",
    "Choose a site",
    "选择用地"
  ],
  "map.acceptSite": [
    "Выбрать это место",
    "Choose this site",
    "选定此处"
  ],
  "map.sites": [
    "Участки списком",
    "List sites",
    "地块列表"
  ],
  "map.objects": [
    "Объекты списком",
    "List facilities",
    "设施列表"
  ],
  "map.noCanvas": [
    "Карта недоступна. Выберите объект в списке.",
    "Map unavailable. Choose a facility from the list.",
    "地图暂不可用。请从列表中选择设施。"
  ],
  "map.proposed": [
    "Предложено",
    "Proposed",
    "拟议中"
  ],
  "map.approved": [
    "Утверждено",
    "Approved",
    "已批准"
  ],
  "map.building": [
    "Строится",
    "Under construction",
    "建设中"
  ],
  "map.active": [
    "Работает",
    "Operating",
    "运营中"
  ],
  "map.routeActive": [
    "Рейсы идут",
    "Buses running",
    "班车运行中"
  ],
  "map.routeStopped": [
    "Рейсы прекращены",
    "Service stopped",
    "班车已停运"
  ],
  "map.actualDate": [
    "Открыто в {year} году",
    "Opened in {year}",
    "于{year}年启用"
  ],
  "stats.kpi": [
    "Показатели",
    "Indicators",
    "指标"
  ],
  "stats.support": [
    "Поддержка населения",
    "Public support",
    "民众支持度"
  ],
  "stats.after": [
    "Итоги {year} года",
    "Results for {year}",
    "{year}年结果"
  ],
  "stats.compare": [
    "Сравнить годы",
    "Compare years",
    "比较年份"
  ],
  "stats.history": [
    "История решений",
    "Decision history",
    "决策记录"
  ],
  "stats.gradeCriteria": [
    "Критерии оценки",
    "Grading criteria",
    "评分标准"
  ],
  "advisor.input": [
    "Спросить советника…",
    "Ask the adviser…",
    "向顾问提问…"
  ],
  "advisor.name": [
    "Илья Орлов",
    "Ilya Orlov",
    "伊利亚·奥尔洛夫"
  ],
  "advisor.askBudget": [
    "Где взять заём?",
    "Where can I take out a loan?",
    "在哪里可以申请借款？"
  ],
  "advisor.askChoice": [
    "Как сравнить два места?",
    "How do I compare two sites?",
    "如何比较两处选址？"
  ],
  "advisor.show": [
    "Показать на экране",
    "Show me where",
    "在界面中显示"
  ],
  "advisor.offline": [
    "Нет сети. Подсказки по игре доступны.",
    "Offline. Game guidance is available.",
    "网络未连接。仍可查看操作提示。"
  ],
  "advisor.send": [
    "Отправить вопрос",
    "Send question",
    "发送问题"
  ],
  "tutorial.event": [
    "Откройте ситуацию года.",
    "Open this year’s event.",
    "打开本年度事件。"
  ],
  "tutorial.pick": [
    "Выберите, как поступить.",
    "Choose your response.",
    "选择应对方式。"
  ],
  "tutorial.budget": [
    "Откройте бюджет и проверьте остаток.",
    "Open the budget and check the balance.",
    "打开预算，查看余额。"
  ],
  "tutorial.site": [
    "Сравните участки и выберите место.",
    "Compare the sites and choose one.",
    "比较地块并选择一处。"
  ],
  "tutorial.map": [
    "Откройте объект на карте.",
    "Open the facility on the map.",
    "打开地图上的设施。"
  ],
  "tutorial.commit": [
    "Нажмите «Следующий год», чтобы утвердить план.",
    "Choose Next year to approve your plan.",
    "点击“下一年”确认年度计划。"
  ],
  "tutorial.results": [
    "Посмотрите, что изменилось за год.",
    "See what changed over the year.",
    "查看本年度的变化。"
  ],
  "tutorial.complete": [
    "Завершить обучение",
    "Finish tutorial",
    "完成引导"
  ],
  "turn.missingEvent": [
    "Выберите ответ на ситуацию года.",
    "Choose a response to this year’s event.",
    "请选择本年度事件的应对方案。"
  ],
  "turn.missingSite": [
    "Выберите участок для проекта.",
    "Choose a site for the project.",
    "请为项目选择用地。"
  ],
  "turn.noFunds": [
    "В бюджете не хватает {amount}.",
    "The budget is short by {amount}.",
    "预算仍缺少{amount}。"
  ],
  "turn.missingProject": [
    "Выберите проект или отложите запуск.",
    "Choose a project or defer it.",
    "请选择项目或暂缓启动。"
  ],
  "grade.final": [
    "Оценка за семинар · {points}/5",
    "Seminar grade · {points}/5",
    "研讨课成绩 · {points}/5"
  ],
  "grade.sending": [
    "Сохраняем оценку…",
    "Saving grade…",
    "正在保存成绩…"
  ],
  "grade.local": [
    "Сохранено на устройстве",
    "Saved on this device",
    "已保存在此设备"
  ],
  "grade.received": [
    "В журнале",
    "In gradebook",
    "已记入成绩册"
  ],
  "grade.unconfirmed": [
    "Журнал ещё не подтвердил оценку.",
    "The gradebook has not confirmed the grade yet.",
    "成绩册尚未确认成绩。"
  ],
  "grade.retry": [
    "Повторить отправку",
    "Retry upload",
    "重新提交"
  ],
  "grade.report": [
    "Открыть отчёт",
    "Open report",
    "打开报告"
  ],
  "free.scenario": [
    "Сценарий",
    "Scenario",
    "情景"
  ],
  "free.strategy": [
    "Стратегия",
    "Strategy",
    "策略"
  ],
  "free.options": [
    "Параметры",
    "Options",
    "选项"
  ],
  "free.budgetRules": [
    "Правила бюджета",
    "Budget rules",
    "预算规则"
  ],
  "free.recoveryCase": [
    "Счёт из прошлого",
    "A bill from the past",
    "一笔旧账"
  ],
  "free.replay": [
    "Повтор кампании",
    "Replay campaign",
    "重玩任期"
  ],
  "course.title": [
    "Введение в специальность",
    "Introduction to the profession",
    "专业导论"
  ],
  "grade.summary": [
    "Итоги кампании",
    "Campaign results",
    "任期结果"
  ],
  "start.teacher": [
    "Проба преподавателя · без оценки",
    "Instructor preview · Ungraded",
    "教师试用 · 不计分"
  ],
  "dec.regionIssues": [
    "Вопросы региона",
    "Regional issues",
    "地区议题"
  ],
  "project.school.title": [
    "Новый квартал без школы",
    "A new neighbourhood without a school",
    "新社区缺少学校"
  ],
  "project.school.build": [
    "Построить школу",
    "Build a school",
    "新建学校"
  ],
  "project.school.bus": [
    "Организовать подвоз",
    "Arrange school transport",
    "安排校车"
  ],
  "project.school.shift": [
    "Ввести вторую смену",
    "Introduce a second shift",
    "实行两班制教学"
  ],
  "dec.existingContinue": [
    "Действующие программы продолжаются.",
    "Existing programmes continue.",
    "现有项目继续运行。"
  ],
  "project.launch": [
    "Запуск",
    "Launch",
    "启用"
  ],
  "project.negotiate": [
    "Обсудить условия",
    "Discuss terms",
    "商谈条件"
  ],
  "project.authority": [
    "Полномочия",
    "Authority",
    "职权"
  ],
  "project.noPledge": [
    "Без обещаний",
    "No pledge",
    "不作承诺"
  ],
  "budget.ownRevenue": [
    "Собственные доходы",
    "Own-source revenue",
    "本级收入"
  ],
  "budget.nonTax": [
    "Неналоговые доходы",
    "Non-tax revenue",
    "非税收入"
  ],
  "budget.grant": [
    "Дотация",
    "General-purpose grant",
    "一般性补助"
  ],
  "budget.mandatory": [
    "Обязательные расходы",
    "Mandatory expenditure",
    "刚性支出"
  ],
  "budget.programmes": [
    "Содержание программ",
    "Programme operating costs",
    "项目运营支出"
  ],
  "budget.entries": [
    "Операции за {year} год",
    "Transactions in {year}",
    "{year}年收支明细"
  ],
  "budget.servicing": [
    "Обслуживание долга",
    "Debt servicing",
    "债务付息费用"
  ],
  "budget.badLedger": [
    "Не удалось проверить расчёт. Повторите попытку.",
    "Couldn’t verify the calculation. Try again.",
    "无法核对计算结果。请重试。"
  ],
  "project.teamCapacity": [
    "Возможности команды",
    "Team capacity",
    "团队执行能力"
  ],
  "budget.limitUsed": [
    "Лимит долга исчерпан.",
    "The debt limit has been reached.",
    "已达到债务上限。"
  ],
  "budget.repayFirst": [
    "Сначала погасите действующий заём.",
    "Repay the existing loan first.",
    "请先偿还现有借款。"
  ],
  "budget.overdue": [
    "Просрочен платёж {amount}",
    "Payment overdue: {amount}",
    "逾期还款额：{amount}"
  ],
  "budget.renew": [
    "Продлить договор",
    "Renew contract",
    "续签合同"
  ],
  "map.baseline": [
    "Начало срока",
    "Start of term",
    "任期开始"
  ],
  "map.fundingEnded": [
    "Финансирование завершено",
    "Funding ended",
    "资金支持已结束"
  ],
  "map.full": [
    "Вся область",
    "Whole region",
    "全地区"
  ],
  "map.download": [
    "Скачать карту",
    "Download map",
    "下载地图"
  ],
  "stats.schoolAccess": [
    "Доступность школы",
    "School access",
    "学校可及性"
  ],
  "stats.development": [
    "Развитие",
    "Development",
    "发展"
  ],
  "stats.yearsClosed": [
    "Завершено лет",
    "Years completed",
    "已完成年数"
  ],
  "stats.supportIndex": [
    "Поддержка, индекс 0–100",
    "Support index, 0–100",
    "支持度指数（0–100）"
  ],
  "stats.noNewPolicy": [
    "Без новых мер",
    "Without new measures",
    "未采取新措施"
  ],
  "tutorial.firstYear": [
    "Первый год",
    "First year",
    "第一年"
  ],
  "turn.closed": [
    "Год завершён",
    "Year complete",
    "年度已结束"
  ],
  "grade.reflection": [
    "Комментарий к итогам",
    "Comment on results",
    "结果评述"
  ],
  "system.openSeminar": [
    "Открываем семинар…",
    "Opening seminar…",
    "正在打开研讨课…"
  ],
  "system.signIn": [
    "Войдите на платформу и откройте семинар 7.",
    "Sign in to the platform and open seminar 7.",
    "请登录平台并打开第7次研讨课。"
  ],
  "system.seminarClosed": [
    "Семинар 7 закрыт преподавателем.",
    "Seminar 7 is closed by the instructor.",
    "教师已关闭第7次研讨课。"
  ],
  "system.ownerChange": [
    "Профиль изменился. Вернитесь в семинар.",
    "Your profile has changed. Return to the seminar.",
    "账号已变更。请返回研讨课。"
  ],
  "system.saveFailed": [
    "Партия не сохранена. Скачайте копию перед выходом.",
    "Game not saved. Download a copy before leaving.",
    "游戏未保存。请在退出前下载副本。"
  ],
  "system.otherTab": [
    "Партия открыта в другой вкладке",
    "Game open in another tab",
    "游戏已在其他标签页中打开"
  ],
  "system.newerSave": [
    "Для этой партии нужна более новая версия игры.",
    "This save requires a newer game version.",
    "此进度需要更新版本的游戏。"
  ],
  "system.offlinePreparing": [
    "Загружаем офлайн-версию…",
    "Preparing offline play…",
    "正在准备离线游戏…"
  ],
  "system.offlineReady": [
    "Игра готова к работе без сети",
    "Game ready for offline play",
    "游戏已可离线运行"
  ],
  "system.requiresJs": [
    "Чтобы открыть игру, включите JavaScript.",
    "Enable JavaScript to open the game.",
    "请启用 JavaScript 以打开游戏。"
  ]
};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const navPaths = {
    decisions:'<path d="M8 4.75H6.25A2.25 2.25 0 0 0 4 7v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2.25 2.25 0 0 0-2.25-2.25H16"/><rect x="8" y="2.75" width="8" height="4" rx="1.45"/><path d="m7.8 12.35 1.75 1.75 3.55-3.6M8 17h8"/>',
    budget:'<path d="M19 7V5.75a1.5 1.5 0 0 0-1.85-1.46L6.2 6.9A2.7 2.7 0 0 0 4 9.55V17.5A2.5 2.5 0 0 0 6.5 20H19a2 2 0 0 0 2-2v-2.5M4.4 8h14.1A2.5 2.5 0 0 1 21 10.5v.75"/><path d="M21 11.25h-4.85a2.15 2.15 0 0 0 0 4.3H21v-4.3Z"/><circle cx="16.6" cy="13.4" r=".7" fill="currentColor" stroke="none"/>',
    map:'<path d="m3 6.5 5.9-2.8 6.1 2.8 5.35-2.45a.45.45 0 0 1 .65.4V17.6l-6 2.8-6.1-2.8-5.25 2.42a.45.45 0 0 1-.65-.4V6.5Zm5.9-2.8v13.9M15 6.5v13.9"/>',
    stats:'<path d="M4 4.75v13A2.25 2.25 0 0 0 6.25 20H20"/><rect x="7.25" y="12.75" width="2.6" height="4.15" rx=".7"/><rect x="12.25" y="9.15" width="2.6" height="7.75" rx=".7"/><rect x="17.25" y="5.25" width="2.6" height="11.65" rx=".7"/>',
    advisor:'<path d="M7.35 17H5.7A2.7 2.7 0 0 1 3 14.3V6.6A2.6 2.6 0 0 1 5.6 4h11.8A2.6 2.6 0 0 1 20 6.6v7.7a2.7 2.7 0 0 1-2.7 2.7h-4.7l-4.5 3.36a.48.48 0 0 1-.75-.4V17Z"/><path d="M7.2 8.9h8.6M7.2 12.1h5.55"/>'
  };
  function navIcon(id) {
    return '<svg class="v3-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+navPaths[id]+'</svg>';
  }
  const advanceIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.2 5.3a1.13 1.13 0 0 1 1.72-.96l10 6.7a1.15 1.15 0 0 1 0 1.92l-10 6.7a1.13 1.13 0 0 1-1.72-.96V5.3Z" fill="currentColor"/></svg>';
  const extra = {
    'budget.tax.low':['Низкая','Low','低'],
    'budget.tax.moderate':['Умеренная','Moderate','中'],
    'budget.tax.high':['Высокая','High','高'],
    'budget.review':['Проверить средства','Check the funds','核对资金'],
    'dec.saveAnswer':['Сохранить ответ','Save response','保存回应'],
    'dec.defer':['Год без нового проекта','Year without a new project','本年不启动新项目'],
    advisorChanged:['План изменился. Задайте вопрос снова.','The plan has changed. Ask your question again.','计划已更改。请重新提问。'],
    advisorRetry:['Повторить запрос','Retry question','重试提问'],
    legacy:['Открыть прежнюю партию','Open an earlier game','打开之前的游戏'],
    factYear:['Факт за {year}','Actual for {year}','{year}年实际情况'],
    foundation:['Фундамент','Foundation','地基'],frame:['Каркас','Frame','主体框架'],finishing:['Подготовка к открытию','Preparing to open','启用准备'],
    year:['Год','Year','年份'], change:['Изменить','Change','修改'], back:['Назад','Back','返回'],
    save:['Сохранить','Save','保存'], cancel:['Вернуться к плану','Return to plan','返回计划'],
    close:['Закрыть','Close','关闭'], current:['Текущий год','Current year','本年度'],
    newProject:['Проект года','Project of the year','年度项目'], otherProjects:['Другие проекты','Other projects','其他项目'],
    choose:['Выбрать проект','Choose a project','选择项目'], selected:['В плане','In the plan','已列入计划'],
    projectChange:['Изменить проект','Change project','更换项目'], projectDefer:['Отложить проект','Defer project','暂缓新项目'],
    projectPurpose:['Отдельное улучшение для района, например школа или подвоз.','A separate improvement for a district, such as a school or a bus service.','单独改善某个地区的服务，例如新建学校或开通校车。'],
    eventOpen:['Открыть ситуацию','Open the situation','查看情况'], eventChange:['Изменить ответ','Change response','修改回应'],
    event:['Ситуация года','This year’s situation','年度情况'],
    open:['Открыть','Open','打开'], baseline:['На начало срока','At the start of the term','任期开始时'],
    people:['Обеспечены','People served','已覆盖人数'], demand:['Потребность','Demand','需求'],
    noDemand:['Нет потребности','No demand','无需求'], unserved:['Без доступной услуги','Without access','未获得服务'],
    spend:['Расходы по плану','Planned expenditure','计划支出'], cashStart:['На начало года','At the start of the year','年初余额'],
    totalIn:['Поступления и финансирование','Receipts and financing','收入与融资'],
    totalOut:['Всего выплат','Total payments','支出总额'], forecast:['Прогноз','Forecast','预测'],
    after:['После закрытия года','After the year closes','年度结算后'], million:['млн ₽','m RUB','百万卢布'],
    billion:['млрд ₽','bn RUB','十亿卢布'], annual:['в год','per year','每年'],
    months:['Модельное ограничение пути','Model travel limit','模型通行时间限制'],
    oldSchool:['Действующая школа','Existing school','现有学校'], otherSchool:['Школа за рекой','School across the river','河对岸学校'],
    district:['Район','District','地区'],
    site:['Участок','Site','地块'], siteChange:['Изменить участок','Change site','更换用地'],
    whole:['Вся область','Whole region','全地区'], inspect:['Осмотреть','Inspect','查看'],
    locations:['Объекты и участки','Facilities and sites','设施与地块'], details:['Подробнее','Details','详情'],
    plannedOpen:['План начала работы','Planned opening','计划启用年份'], running:['Работает','Operating','运营中'],
    building:['Строится','Under construction','建设中'], closed:['Финансирование завершено','Funding ended','资助期已结束'],
    restoring:['Восстанавливается','Restarting','恢复中'], approved:['Подготовка','Preparing','准备中'],
    noBuilding:['Новых объектов пока нет','No new facilities yet','暂无新设施'],
    min:['мин','min','分钟'], served:['Место в пределах пути','Places within reach','通行范围内的学位'],
    bridgeRisk:['При закрытии переправы','If the crossing closes','若渡口关闭'],
    loanAmount:['Сумма займа, млн ₽','Loan amount, m RUB','借款金额，百万卢布'],
    loanTerm:['Срок, лет','Term, years','期限，年'], rate:['Годовая ставка','Annual interest rate','年利率'],
    loanTotal:['Полная сумма выплат','Total repayments','总还款额'],
    noLoan:['Новый заём не запланирован','No new loan planned','未计划新增借款'],
    removeLoan:['Убрать заём','Remove loan','取消借款'], reserveTake:['Изъять из резерва, млн ₽','Draw from reserves, m RUB','动用储备金，百万卢布'],
    reserveAdd:['Пополнить резерв, млн ₽','Add to reserves, m RUB','补充储备金，百万卢布'],
    locked:['Обязательные выплаты','Mandatory payments','必要支出'], allocation:['Лимит отрасли, млн ₽','Sector limit, m RUB','部门预算上限，百万卢布'],
    projection:['После планируемого ввода','After the planned opening','计划启用后'],
    period:['Период','Period','期间'], groups:['Поддержка групп','Support by group','各群体支持度'],
    actual:['Факт','Actual','实际'], facilities:['Учреждения','Facilities','设施'], noHistory:['Первый год ещё не завершён','The first year has not ended','第一年尚未结束'],
    future:['Следующие три года','Next three years','未来三年'], reasons:['Что повлияло','What affected this','影响因素'],
    promise:['Обещание','Promise','承诺'], noPromise:['Без дополнительного обещания','No extra promise','不作额外承诺'],
    promiseOpen:['Открыть услугу к сроку','Open the service by a deadline','按期限启用服务'],
    promiseRun:['Сохранить работу к сроку','Keep the service operating','维持服务运行'],
    promiseReserve:['Сохранить резерв','Maintain a reserve','保留储备金'],
    promiseDue:['Проверить в конце года','Check at year end','年末检查'],
    promiseAmount:['Резерв не ниже, млн ₽','Minimum reserve, m RUB','最低储备金，百万卢布'],
    promiseWho:['Адресат','Recipient','承诺对象'], municipality:['Муниципалитет','Municipality','市政府'],
    residents:['Жители','Residents','居民'], financeTeam:['Финансовый блок','Finance team','财政部门'],
    menu:['Меню игры','Game menu','游戏菜单'], lang:['Язык','Language','语言'],
    large:['Увеличенный текст','Larger text','大号文字'], still:['Статичные иллюстрации','Still illustrations','静态插图'],
    help:['Как проходит год','How a year works','年度流程'], helpText:['Ответьте на срочную задачу. Выберите проект для района или отложите его. Проверьте бюджет и исходные показатели. Кнопка ▶ открывает сводку плана перед подтверждением года.','Respond to the urgent issue. Choose a district project or defer it. Check the budget and starting figures. ▶ opens the plan for review before you close the year.','先处理紧急任务，再决定启动或暂缓地区项目。核对预算和基准数据。点击 ▶ 可查看年度计划，确认后才结算。'],
    localAdvisor:['Илья Орлов','Ilya Orlov','伊利亚·奥尔洛夫'], advisorRole:['Стратегическое развитие','Strategic development','战略发展'],
    ask:['Спросить советника…','Ask your adviser…','询问顾问…'], send:['Отправить','Send','发送'],
    navigation:['Что делать в этом году?','What should I do this year?','今年要做什么？'], compare:['Как сравнить варианты?','How can I compare options?','如何比较方案？'],
    awaiting:['Подготовка ответа…','Preparing an answer…','正在准备回答…'], unavailable:['Консультация сейчас недоступна. Можно продолжить год.','Consultation is unavailable. You can continue the year.','咨询暂不可用，可以继续年度决策。'],
    answerLabel:['Ответ советника','Adviser’s reply','顾问回复'], ready:['План готов к проверке','Plan ready for review','计划可供核查'],
    confirm:['Завершить {year} год','Close {year}','结束{year}年'],
    result:['Год завершён','Year complete','年度已结束'], resultNext:['Продолжить','Continue','继续'],
    resultStats:['Посмотреть результат','View the results','查看结果'],
    returnMap:['Посмотреть изменения','See the changes','查看变化'],
    final:['Кампания завершена','Campaign complete','任期已结束'], seminarFinal:['Семинар завершён','Seminar complete','研讨课已完成'],
    score:['Итоговая оценка','Final score','最终成绩'], points:['из 5','out of 5','满分5分'],
    saved:['Сохранено на устройстве','Saved on this device','已保存在本机'], sending:['Отправляется','Sending','正在发送'],
    sent:['В журнале','In the gradebook','已记入成绩簿'], retry:['Повторить отправку','Retry submission','重新提交'],
    yearNumber:['{n} из 20','{n} of 20','第{n}年，共20年'], saveError:['Не удалось сохранить изменение. Попробуйте ещё раз.','Could not save this change. Try again.','无法保存修改，请重试。'],
    reviewError:['Проверьте план','Check the plan','检查计划'], eventRequired:['Выберите ответ на ситуацию года','Choose a response to this year’s situation','请选择年度情况回应'],
    measureRequired:['Выберите проект или отложите его','Choose or defer a project','选择项目或暂缓启动'],
    siteRequired:['Выберите свободный участок','Choose an available site','选择可用地块'],
    loanError:['Проверьте сумму и срок займа','Check the loan amount and term','核对借款金额与期限'],
    budgetError:['Измените план расходов или источники финансирования','Review expenditure or financing','调整支出计划或资金来源'],
    balanceError:['Проверьте сумму отраслевых лимитов','Check the total sector limits','核对部门预算上限总额'],
    opening:['Начать','Start','开始'], resume:['Продолжить','Continue','继续'],
    twenty:['2026–2045 · 20 лет','2026–2045 · 20 years','2026–2045 · 20年'],
    title:['Губернатор','Governor','州长'], subtitle:['Новая область','New region','新的地区'],
    welcome1Title:['Добро пожаловать','Welcome','欢迎上任'],
    welcome1First:['Поздравляю с назначением губернатором!','Congratulations on your appointment as governor!','祝贺您出任州长！'],
    welcome1Second:['Я Илья Орлов, ваш советник.','I’m Ilya Orlov, your adviser.','我是您的顾问伊利亚·奥尔洛夫。'],
    welcome2Title:['Ваши задачи','Your priorities','您的职责'],
    welcome2First:['Жителям разных районов нужны школы, врачи и рабочие места.','People in each district need schools, health care and jobs.','各区居民都需要学校、医疗服务和就业机会。'],
    welcome2Second:['Каждый год вы выбираете, что улучшить и сколько на это потратить.','Each year, you choose what to improve and how much to spend.','每年由您决定优先改善什么、投入多少资金。'],
    welcome3Title:['Первый год','Your first year','任期第一年'],
    welcome3First:['На карте можно познакомиться с пятью районами области.','Use the map to get to know the region’s five districts.','您可以在地图上了解本州的五个区。'],
    welcome3Second:['Когда будете готовы, вместе разберём первую ситуацию.','When you’re ready, we’ll look at your first situation together.','准备好后，我们一起看看第一件要处理的事。'],
    welcomeProgress:['{step} из 3','{step} of 3','第 {step} 步，共 3 步'],
    welcomeNext:['Дальше','Continue','继续'], welcomeStart:['К первому году','Start the first year','进入第一年'],
    welcomeReplay:['Вступление Орлова','Orlov’s introduction','奥尔洛夫的开场介绍'], welcomeReturn:['В меню','Back to menu','返回菜单'],
    coachEvent:['Ситуация года — срочная задача. Откройте её, чтобы узнать, что случилось.','This year’s situation is urgent. Open it to see what happened.','年度情况是一项紧急任务。打开看看发生了什么。'],
    coachAnswer:['Сравните, кому поможет каждый ответ и сколько он стоит. Сохраните свой выбор.','Compare who benefits from each response and what it costs. Save your choice.','比较每种回应能帮助谁、需要多少钱，再保存选择。'],
    coachProject:['Проект — отдельное улучшение для района. Его можно начать или отложить на этот год.','A project is a separate improvement for a district. You can start one or defer it for the year.','项目用于单独改善一个地区。您可以今年启动，也可以暂缓。'],
    coachSites:['Место влияет на срок, расходы и число людей, которым поможет проект. Сравните участки на карте.','The location affects timing, costs and how many people benefit. Compare the sites on the map.','选址会影响工期、开支和受益人数。请在地图上比较地块。'],
    coachSchool:['В карточке школы видно, сколько детей она уже обслуживает. Этот пример поможет читать карту.','The school card shows how many children it already serves. Use it to learn how to read the map.','学校详情显示目前服务了多少学生。用这个例子熟悉地图。'],
    coachBudget:['Попробуйте изменить налоговую нагрузку в бюджете. Сравните доход от налогов и остаток денег.','Try a different tax level in the budget. Compare tax revenue and the money left over.','在预算中换一个税负水平，比较税收和年底余额。'],
    coachTaxResult:['Сверьте доходы и остаток до и после изменения. Можно вернуть исходную нагрузку.','Compare the revenue and balance before and after the change. You can restore the original tax level.','比较变更前后的税收和余额。如有需要，可以恢复原来的税负。'],
    coachStats:['Найдите «Доступность школы» в статистике и выберите процент на начало срока. С ним мы сравним итог года.','Find School access in Statistics and pick the percentage at the start of your term. We’ll compare it with your year-end result.','在统计中找到“学校可及性”，选择任期开始时的百分比。我们会用它和年终结果比较。'],
    coachReview:['▶ открывает сводку вашего плана. Год изменится только после подтверждения.','▶ opens your plan for review. The year advances when you confirm it.','点击 ▶ 查看计划汇总。确认后才会进入下一年。'],
    coachConfirm:['Сверьте ответ, проект и остаток бюджета. Подтвердите план, чтобы завершить год.','Check the response, project and remaining funds. Confirm the plan to close the year.','核对回应、项目和预算余额。确认计划即可结束本年。'],
    coachFixPlan:['В плане ещё кое-чего не хватает. Откройте отмеченный пункт.','Something is missing from your plan. Open the highlighted item.','计划仍有缺项。请打开标出的项目。'],
    coachResults:['В статистике сравните доступность школы с началом срока. Стала она выше, ниже или не изменилась?','In Statistics, compare school access with the start of your term. Did it rise, fall or stay the same?','在统计中把学校可及性与任期开始时比较。它上升了、下降了，还是没有变化？'],
    coachMap:['На карте видно, какие объекты работают и что изменилось. Посмотрите один из них.','The map shows which facilities are operating and what changed. Inspect one of them.','地图显示哪些设施在运行，以及发生了哪些变化。请选择一处查看。'],
    coachSchoolResult:['На карте видно, какие объекты работают сейчас. Посмотрите это на примере школы.','The map shows which facilities are operating now. Take a look at an example school.','地图显示目前哪些设施在运行。请查看学校示例。'],
    schoolExample:['Посмотреть действующую школу на Новом берегу','See the existing school in New Bank','查看新岸正在运行的学校'],
    toProjects:['К проектам','View projects','查看项目'], toStats:['К статистике','View statistics','查看统计'], toMap:['К карте','View the map','打开地图'],
    taxPractice:['Что изменилось после смены налога','What changed when you adjusted taxes','调整税负带来的变化'],
    restoreTax:['Вернуть исходную нагрузку','Restore original tax level','恢复原来的税负'],
    loanHelp:['Заём даёт деньги сейчас. В следующих бюджетах нужно будет вернуть долг и выплатить проценты.','A loan adds money now. Later budgets must repay the principal and interest.','借款会增加当前可用资金。以后的预算必须偿还本金和利息。'],
    reserveHelp:['Резерв нужен на непредвиденные расходы. Изъятие добавляет деньги в план, пополнение откладывает их на будущее.','The reserve covers unexpected costs. A withdrawal adds money to the plan, while a contribution sets money aside.','储备金用于意外开支。提取会增加计划可用资金，存入则为今后留出资金。'],
    sectorHelpTitle:['Как читать расходы отрасли','How to read sector spending','如何查看部门支出'],
    sectorHelp:['В сумме видны все запланированные выплаты. Лимит ограничивает расходы отрасли и должен покрывать обязательные выплаты.','The total lists all planned payments. The sector limit caps spending and must cover mandatory payments.','合计包含所有计划支出。部门支出不得超过限额，限额也必须覆盖必要支出。'],
    schoolQuestion:['Какой процент указан на начало срока?','What is the percentage at the start of the term?','任期开始时的百分比是多少？'],
    schoolWrong:['Проверьте процент в строке «Доступность школы» за всю область.','Check the percentage in the School access row for the whole region.','请查看全州“学校可及性”一行的百分比。'],
    schoolChangeQuestion:['Как изменилась доступность школы?','How did school access change?','学校可及性有何变化？'],
    schoolWrongChange:['Сравните два процента в строке «Доступность школы».','Compare the two percentages in the School access row.','请比较“学校可及性”一行的两个百分比。'],
    higher:['Стала выше','It rose','上升'], same:['Не изменилась','It stayed the same','没有变化'], lower:['Стала ниже','It fell','下降'],
    schoolUnknown:['Данных для сравнения нет','No data to compare','没有可比较的数据'],
    launchCost:['На запуск','To start','启动费用'],
    coursePoints:['До 5 баллов','Up to 5 points','最高5分'],
    historyMap:['Карта за этот год','Map for this year','本年度地图'],
    historyStageUnknown:['Стадия не записана','Stage not recorded','未记录阶段'],
    illustrationUnavailable:['Иллюстрация не загрузилась','Illustration could not load','插图未能加载'],
    staffedPlaces:['Мест с персоналом','Staffed places','配有教职员工的学位'],
    history:['История решений','Decision history','决策记录'], noExtra:['Без новых расходов','No additional expenditure','无新增支出'],
    translatedFallback:['Ситуация доступна на русском','This situation is available in Russian','此情况目前提供俄文'],
    mapUnavailable:['Выберите объект в списке','Choose a facility from the list','请从列表选择设施'],
    closeYear:['Закрыть год','Close the year','年度结算'], education:['Образование','Education','教育'],
    health:['Здравоохранение','Health','医疗'], childcare:['Дошкольные места','Childcare places','学前教育学位'],
    housing:['Жилищные условия','Housing conditions','住房条件'], employment:['Занятость','Employment','就业'],
    digital:['Государственные услуги','Public services','公共服务'], flood:['Защита от паводков','Flood protection','防洪保障'],
    transport:['Транспорт','Transport','交通'],
    economy:['Экономика','Economy','经济'], social:['Социальная поддержка','Social support','社会保障'],
    housingUtilities:['Жильё и коммунальные услуги','Housing and utilities','住房与公用事业'], administration:['Управление','Administration','行政管理'],
    families:['Семьи с детьми','Families with children','有子女家庭'], seniors:['Старшее поколение','Older residents','老年居民'],
    business:['Предприниматели','Businesses','企业经营者'], youth:['Молодёжь','Young people','青年'],
    publicStaff:['Работники учреждений','Public-service staff','公共机构工作人员'], activists:['Общественные объединения','Community groups','社会团体'],
    development:['Развитие','Development','发展'], support:['Поддержка','Support','支持度'],
    ownTax:['Налоги','Taxes','税收'], nonTax:['Неналоговые доходы','Non-tax revenue','非税收入'],
    transfers:['Трансферты','Transfers','转移支付'], borrowing:['Новые займы','New borrowing','新增借款'],
    interest:['Проценты','Interest','利息'], principal:['Погашение долга','Principal repayments','本金偿还'],
    operational:['Содержание служб','Service operation','服务运行'], construction:['Строительство','Construction','建设'],
    shortage:['Не хватает {amount}','Short by {amount}','资金缺口为{amount}'],
    disclose:['Показать расчёт','Show the calculation','显示计算明细'], freshYear:['План на {year} год','Plan for {year}','{year}年计划']
  };

  function mount(host, controller) {
    const rules = G.V3Rules;
    let busy = false, destroyed = false, errorText = '', optionDraft = null, focusAfter = null;
    let chatDraft = '', chatPending = false, chatError = '', loanDraft = null, review = null;
    let replayWelcome = 0, practiceError = '';
    const navigation = ['decisions','budget','map','stats','advisor'];
    const defaultUI = {started:false,tab:'decisions',panel:null,tutorialStep:1,welcomeStep:4,districtId:'suburb',motion:'auto'};
    const language = () => {
      const selected = typeof controller.language === 'function' ? controller.language() : 'ru';
      return selected === 'zh-Hans' || selected?.startsWith('zh') ? 'zh' : selected?.startsWith('en') ? 'en' : 'ru';
    };
    const local = value => typeof value === 'object' && value !== null ? value[language()] ?? value.ru ?? value.en ?? '' : value ?? '';
    const t = (key, values = {}) => {
      const line = COPY[key] || extra[key] || [key,key,key];
      return Object.entries(values).reduce((text,[name,value]) => text.replaceAll('{'+name+'}',String(value)),line[{ru:0,en:1,zh:2}[language()]]);
    };
    const ui = () => ({...defaultUI,...(controller.getUI?.() || {})});
    const state = () => controller.getState();
    const welcomeStep = current => replayWelcome || (current.welcomeStep>=1&&current.welcomeStep<=3?current.welcomeStep:0);
    const quote = () => controller.getQuote();
    const asset = path => G.resolveAsset ? G.resolveAsset(path) : path;
    const number = (value,digits = 0) => Number.isFinite(Number(value)) ? new Intl.NumberFormat({ru:'ru-RU',en:'en-GB',zh:'zh-CN'}[language()],{maximumFractionDigits:digits}).format(value) : '—';
    const money = value => number(value >= 1000 || value <= -1000 ? value/1000 : value,2)+' '+t(Math.abs(value)>=1000?'billion':'million');
    const label = (key,value) => '<div class="v3-line"><span>'+esc(key)+'</span><strong>'+esc(value)+'</strong></div>';
    const button = (text,action,cls = '',attributes = '') => '<button type="button" class="v3-button '+cls+'" data-v3-action="'+esc(action)+'" '+attributes+'>'+text+'</button>';
    const card = () => G.V3Events?.card(state()?.event,language());
    const measures = () => rules.availableMeasures?.(state()) || rules.MEASURES;
    const selectedMeasure = () => measures().find(row => row.id === state()?.draft.measureId) || rules.MEASURES.find(row => row.id === state()?.draft.measureId);
    const districtLabel = id => local(rules.DISTRICTS[id]?.labels) || id;
    const districtCaption = id => t('district')+' · '+districtLabel(id);
    const needsSite = () => {
      const sites=selectedMeasure()?.siteIds;
      return Boolean(sites?.length&&!sites.includes(state().draft.siteId));
    };
    const projectArt = measure => 'assets/illustrated/'+({north:'clinic',river:'barrier',industrial:'industry',capital:'digital'}[measure.districtId]||'school')+'.webp';
    const phase = project => project.status || rules.projectPhase(project,state().year);
    const phaseLabel = value => t({open:'running',foundation:'foundation',frame:'frame',finishing:'finishing',construction:'building',building:'building',closed:'closed',ended:'closed',restoring:'restoring',preparing:'approved',approved:'approved'}[value] || 'approved');
    const moneyInput = (name,value,title,max) => '<label class="v3-field"><span>'+esc(title)+'</span><input inputmode="decimal" type="number" min="0" step="1" '+(Number.isFinite(max)?'max="'+max+'" ':'')+'name="'+name+'" value="'+esc(value || 0)+'"></label>';
    const picture = (src,alt,cls = '') => '<img class="'+cls+'" src="'+esc(asset(src))+'" alt="'+esc(alt)+'" decoding="async">';
    const regionalArt = 'assets/illustrated/region-cover-1024.webp';

    async function perform(operation, after) {
      if (busy || controller.meta?.readOnly) return;
      busy = true; errorText = '';
      host.setAttribute('aria-busy','true');
      try {
        await operation();
        if (after) await after();
      } catch (error) {
        errorText = controller.errorMessage?.(error,language()) || t('saveError');
      } finally {
        busy = false;
        host.removeAttribute('aria-busy');
        render();
      }
    }

    async function storeUI(patch) {
      await controller.saveUI(patch);
    }
    async function finishStep(step) {
      if (ui().tutorialStep === step) await storeUI({tutorialStep:step+1});
    }
    async function navigate(tab,anchor) {
      if (!navigation.includes(tab)) return;
      const step=ui().tutorialStep;
      const filters=tab==='stats'&&[6,9].includes(step)
        ? {statsDistrict:'all',statsYear:step===6?'initial':String(state().history.at(-1)?.year||'')} : {};
      practiceError='';
      await storeUI({tab,panel:null,...filters});
      focusAfter = anchor || 'v3-heading';
      render();
    }
    function pushPanel(panel,patch = {}) {
      const current=ui();
      history.pushState({governorV3:true,tab:current.tab,panel:current.panel},'');
      return storeUI({...patch,panel});
    }
    function closePanel() {
      return storeUI({panel:null});
    }
    async function openEvent() {
      optionDraft=state().draft.eventChoice;
      await pushPanel('event',{tab:'decisions'});
      await finishStep(1);
      focusAfter='v3-heading';
    }
    async function openSites() {
      await storeUI({tab:'map',panel:'sites',districtId:selectedMeasure()?.districtId||'suburb'});
      focusAfter='v3-heading';
    }
    function practiceStep(current) {
      if (!current.started||!state()||state().completed||current.panel==='menu'||welcomeStep(current)) return 0;
      return current.tutorialStep<=10?current.tutorialStep:0;
    }
    function schoolExampleNeeded(step,current) {
      if (step===4) return !needsSite();
      const district=current.districtId||'suburb';
      return step===10&&district!=='suburb'&&!state().projects.some(project=>project.districtId===district);
    }
    function practiceView(step,current) {
      const {tab,panel}=current;
      const example=schoolExampleNeeded(step,current);
      const taxResult=step===6&&tab==='budget'&&!panel&&current.taxPractice;
      const reviewBlocked=step===8&&panel==='review'&&!quote().ok;
      const keys=['coachEvent','coachAnswer','coachProject',example?'coachSchool':'coachSites','coachBudget',
        taxResult?'coachTaxResult':'coachStats','coachReview',reviewBlocked?'coachFixPlan':'coachConfirm','coachResults',example?'coachSchoolResult':'coachMap'];
      let action='';
      if (example) action=button(esc(t('schoolExample')),'tutorial-school','secondary');
      else {
        const sitesShown=['project','sites'].includes(panel)||!panel&&['decisions','map'].includes(tab);
        const routes={1:[tab!=='decisions'||panel,'eventOpen'],2:[panel!=='event','eventOpen'],
          3:[panel!=='measures','toProjects'],4:[!sitesShown,'map.chooseSite'],
          5:[tab!=='budget'||panel,'budget.review'],6:[!taxResult&&!controller.schoolPractice?.()?.visible,'toStats'],
          9:[panel!=='result'&&!controller.schoolPractice?.()?.visible,'resultStats'],10:[tab!=='map'||panel,'toMap']};
        const route=routes[step];
        if (route?.[0]) action=button(esc(t(route[1])),'tutorial-next','secondary');
      }
      return '<aside class="v3-coach" aria-label="'+esc(t('localAdvisor'))+'">'+picture('assets/characters/ilya-avatar.webp','','')+
        '<div><strong>'+esc(t('localAdvisor'))+'</strong><p>'+esc(t(keys[step-1]))+'</p>'+action+'</div></aside>';
    }
    function eventIllustration(event, detailed = false) {
      const illustration=controller.eventArt?.(event,language());
      if (!illustration) return '';
      const art=typeof illustration==='string'?{poster:illustration}:illustration;
      const poster=art.poster||art.src;
      const lowerSubject=/\/(mobile-medical-unit|commuter-transport)-800\.webp$/.test(poster);
      const classes='v3-event-art'+(art.emblem?' v3-event-emblem':'')+(lowerSubject?' v3-event-subject-low':'');
      return '<div class="v3-event-visual"'+(detailed&&art.motion==='river'?' data-v3-motion="river"':'')+'><picture>'+
        (art.small&&asset(art.small)!==asset(poster)?'<source media="(max-width: 600px)" srcset="'+esc(asset(art.small))+'">':'')+
        picture(poster,'',classes)+'</picture></div>'+
        (detailed&&art.contextOnly?'<p class="v3-art-note">'+esc({ru:'Иллюстрация темы',en:'Topic illustration',zh:'主题插图'}[language()])+'</p>':'');
    }
    function imageError(event) {
      const image=event.target;
      if (!(image instanceof HTMLImageElement)) return;
      const visual=image.closest('.v3-event-visual');
      if (visual) {
        const selected=image.currentSrc;
        const sources=Array.from(image.parentElement.querySelectorAll('source'));
        sources.forEach(source=>source.remove());
        if (sources.length&&selected!==image.src) return;
        const fallback=asset(regionalArt);
        if (image.getAttribute('src')!==fallback) {
          image.classList.remove('v3-event-subject-low','v3-event-emblem');
          image.alt=t('whole');
          image.src=fallback;
          return;
        }
        const notice=document.createElement('p');
        notice.className='v3-event-visual-error';
        notice.textContent=t('illustrationUnavailable');
        image.closest('picture').replaceWith(notice);
        return;
      }
      image.classList.add('v3-image-unavailable');
      image.alt='';
    }
    function heading(text,sub = '') {
      return '<div class="v3-heading-row"><h1 id="v3-heading" tabindex="-1">'+esc(text)+'</h1>'+sub+'</div>';
    }
    function back(action = 'back',text = t('back')) {
      return '<button type="button" class="v3-back" data-v3-action="'+action+'">‹ '+esc(text)+'</button>';
    }

    function startView() {
      return '<section class="v3-start">'+picture(regionalArt,t('whole'),'v3-start-art')+
        '<h1>'+esc(t('title'))+'</h1><p class="v3-start-subtitle">'+esc(t('subtitle'))+'</p><p>'+esc(t('twenty'))+'</p>'+
        (controller.meta?.context==='course'?'<p>'+esc(t('coursePoints'))+'</p>':'')+
        button(esc(t(controller.meta?.canResume?'resume':'opening')),'start','primary')+
        '<button type="button" class="v3-link" data-v3-action="menu">'+esc(t('menu'))+'</button>'+
        (controller.meta?.legacyURL?'<a class="v3-link" href="'+esc(controller.meta.legacyURL)+'">'+esc(t('legacy'))+'</a>':'')+
        '<p id="offline-status" role="status" class="v3-muted"></p></section>';
    }
    function welcomeView(step) {
      const key='welcome'+step;
      const action=step<3?'welcomeNext':replayWelcome?'welcomeReturn':'welcomeStart';
      return '<section class="v3-card v3-welcome" data-v3-welcome="'+step+'" aria-labelledby="v3-heading">'+
        picture(regionalArt,'','v3-welcome-art')+
        '<div class="v3-welcome-copy"><div class="v3-welcome-speaker">'+picture('assets/characters/ilya-avatar.webp','')+
        '<div><strong>'+esc(t('localAdvisor'))+'</strong><small>'+esc(t('nav.advisor'))+'</small></div></div>'+
        heading(t(key+'Title'))+'<p>'+esc(t(key+'First'))+'</p><p>'+esc(t(key+'Second'))+'</p>'+
        '<div class="v3-welcome-actions"><span>'+esc(t('welcomeProgress',{step}))+'</span>'+button(esc(t(action)),'welcome-next','primary')+'</div></div></section>';
    }
    function decisions() {
      const event=card(),draft=state().draft,choice=event?.options.find(row=>row.id===draft.eventChoice),measure=selectedMeasure(),project=quote()?.project;
      return heading(t('nav.decisions'))+'<div class="v3-decision-grid"><section class="v3-card v3-event">'+
        (event?eventIllustration(event):'')+'<div class="v3-card-body"><p class="v3-eyebrow">'+esc(t('event'))+'</p>'+
        '<h2>'+esc(event?.title || t('eventRequired'))+'</h2>'+ (choice?'<p class="v3-selected-copy">✓ '+esc(choice.label)+'</p>':'')+
        button(esc(t(choice?'eventChange':'eventOpen')),'event','primary','data-anchor="event.open"')+'</div></section>'+
        '<section class="v3-project-summary"><h2>'+esc(t('newProject'))+'</h2><div class="v3-card v3-card-body">'+
        (measure?'<div class="v3-project-heading">'+(measure.districtId?picture(projectArt(measure),'','v3-project-thumb'):'')+'<div><h3>'+esc(local(measure.labels))+'</h3>'+
          (measure.districtId?'<p class="v3-muted">'+esc(districtCaption(measure.districtId))+'</p>':'')+'</div></div>':
          '<p>'+esc(t('projectPurpose'))+'</p>')+
        (project?label(t('budget.now'),money(project.costNow))+label(t('plannedOpen'),project.openingYear):'')+
        button(esc(t(measure?'projectChange':'choose')),'measures','link','data-anchor="measure.select"')+
        (measure&&measure.id!=='defer'?button(esc(t('details')),'project','secondary'):'')+
        (measure?.siteIds?.length?button(esc(t(draft.siteId?'siteChange':'map.chooseSite')),'sites','secondary'):'')+
        '</div></section></div>';
    }
    function eventView() {
      const event=card();
      if (!event) return heading(t('event'))+'<p role="status">'+esc(t('eventRequired'))+'</p>';
      const chosen=optionDraft ?? state().draft.eventChoice;
      return back('back',t('nav.decisions'))+heading(event.title)+'<section class="v3-card v3-event-detail">'+eventIllustration(event,true)+
        '<div class="v3-card-body"><p>'+esc(event.situation)+'</p>'+
        (event.circumstance?.summary?'<p>'+esc(event.circumstance.summary)+'</p>':'')+
        (event.fallbackLocale?'<small>'+esc(t('translatedFallback'))+'</small>':'')+'</div></section>'+
        '<div class="v3-options" role="group" aria-label="'+esc(t('event'))+'" data-anchor="event.option">'+event.options.map(option=>{
          const tax=option.effects?.treasury||{},outcome=option.effects?.localOutcome||{},picked=chosen===option.id;
          const costs=tax.oneOffMlnRub>0||tax.operatingMlnRubPerYear>0;
          const now=(tax.oneOffMlnRub||0)+(tax.firstOperatingYearOffset===0?(tax.operatingMlnRubPerYear||0):0);
          return '<button type="button" class="v3-option '+(picked?'selected':'')+'" aria-pressed="'+picked+'" data-v3-option="'+esc(option.id)+'"><strong>'+esc(option.label)+(picked?'<span aria-hidden="true">✓</span>':'')+'</strong>'+
            '<span>'+esc(option.tradeoff)+'</span>'+(costs?'<small>'+esc(t('budget.now'))+': '+esc(money(now))+(tax.operatingMlnRubPerYear?' · '+esc(money(tax.operatingMlnRubPerYear))+' '+esc(t('annual')):'')+'</small>':'')+
            (picked&&option.beneficiaries?'<small>'+esc(option.beneficiaries)+'</small>':'')+
            (outcome.units?'<small>'+esc(number(outcome.units))+' · '+esc(event.localIndicator?.unitLabel || '')+' · '+(state().year+(outcome.firstYearOffset||0))+'</small>':'')+'</button>';
        }).join('')+'</div>'+button(esc(t('dec.saveAnswer')),'save-event','primary full',chosen?'':'disabled');
    }
    function measuresView() {
      const all=measures(),selected=state().draft.measureId;
      return back('back',t('nav.decisions'))+heading(t('choose'))+button(esc(t('projectDefer')),'defer','secondary full')+
        '<div class="v3-measures">'+Object.keys(rules.DISTRICTS).map(id=>{
          const rows=all.filter(row=>row.districtId===id);
          if (!rows.length) return '';
          return '<section><h2>'+esc(districtCaption(id))+'</h2><div class="v3-card">'+rows.map(row=>
            '<button class="v3-measure" type="button" data-v3-measure="'+esc(row.id)+'" aria-pressed="'+(selected===row.id)+'"><span><strong>'+esc(local(row.labels))+'</strong><small>'+esc(t('launchCost')+' '+money(row.cost))+
            (row.annualOpex?' · '+esc(money(row.annualOpex))+' '+esc(t('annual')):'')+'</small></span><span aria-hidden="true">'+(selected===row.id?'✓':'›')+'</span></button>').join('')+'</div></section>';
        }).join('')+'</div>';
    }
    function projectView() {
      const measure=selectedMeasure(),project=quote()?.project,draft=state().draft;
      if (!measure) return measuresView();
      const promise=draft.promise;
      return back('back',t('nav.decisions'))+heading(local(measure.labels))+
        (measure.siteIds?.length?button(esc(t(draft.siteId?'siteChange':'map.chooseSite')),'sites','primary full'):'')+
        '<section class="v3-card v3-card-body">'+picture(projectArt(measure),'','v3-project-art')+
        '<p class="v3-eyebrow">'+esc(districtCaption(measure.districtId))+'</p>'+
        (project?label(t('budget.now'),money(project.costNow))+label(t('budget.annual'),money(project.annualOpex))+label(t('plannedOpen'),project.openingYear):
          label(t('construction'),money(measure.cost))+label(t('budget.annual'),money(measure.annualOpex)))+
        '</section>'+
        '<section class="v3-card v3-card-body"><h2>'+esc(t('promise'))+'</h2>'+
        '<label class="v3-field"><span>'+esc(t('promise'))+'</span><select name="promise-type"><option value="">'+esc(t('noPromise'))+'</option>'+
        [['open','promiseOpen'],['operate','promiseRun'],['reserve','promiseReserve']].map(([id,key])=>'<option value="'+id+'" '+(promise?.type===id?'selected':'')+'>'+esc(t(key))+'</option>').join('')+'</select></label>'+
        (promise?label(t('promiseWho'),t(promise.type==='reserve'?'financeTeam':promise.type==='operate'?'residents':'municipality'))+
          '<label class="v3-field"><span>'+esc(t('promiseDue'))+'</span><input type="number" name="promise-year" min="'+state().year+'" max="2045" value="'+promise.dueYear+'"></label>'+
          (promise.type==='reserve'?moneyInput('promise-amount',promise.amount,t('promiseAmount')):''):'')+
        '</section>'+(practiceStep(ui())===4?'':button(esc(t('budget.review')),'budget','secondary full'));
    }
    function operationName(operation) {
      const keys={tax:'ownTax','non-tax':'nonTax',equalization:'transfers',loan:'borrowing',interest:'interest',principal:'principal',operation:'operational',capex:'construction',mandatory:'locked','reserve-draw':'budget.reserve','reserve-add':'budget.reserve',event:'event',start:'construction'};
      const project=state().projects.find(row=>operation.id.startsWith(row.id));
      return project?local(project.labels):t(keys[operation.type] || 'spend');
    }
    function taxesView(finance,current) {
      const selected=state().draft.taxMode,trial=current.taxPractice;
      return '<section><h2>'+esc(t('budget.taxes'))+'</h2><div class="v3-segments" data-anchor="budget.tax">'+
        ['low','moderate','high'].map(id=>'<button type="button" data-v3-tax="'+id+'" aria-pressed="'+(selected===id)+'">'+esc(t('budget.tax.'+id))+'</button>').join('')+'</div>'+
        (trial&&!state().history.length?'<section class="v3-card v3-card-body v3-tax-practice" id="v3-tax-practice"><h3>'+esc(t('taxPractice'))+'</h3>'+
          '<p class="v3-muted">'+esc(t('budget.tax.'+trial.from))+' → '+esc(t('budget.tax.'+trial.to))+'</p>'+
          label(t('ownTax'),money(trial.taxesBefore)+' → '+money(trial.taxesAfter))+
          label(t('budget.remaining'),money(trial.cashBefore)+' → '+money(trial.cashAfter))+
          (current.tutorialStep===6?button(esc(t('toStats')),'tutorial-next','primary full'):'')+
          (selected!==trial.from?button(esc(t('restoreTax')),'restore-tutorial-tax','link'):'')+'</section>'
          :current.tutorialStep===5?'<div class="v3-card v3-card-body">'+label(t('ownTax'),money(finance.taxes))+
            label(t('budget.remaining'),money(finance.cashEnd))+'</div>'
          :'<p class="v3-muted">'+esc((finance.taxDelta>=0?'+':'')+money(finance.taxDelta))+' · '+esc(t('ownTax'))+'</p>')+'</section>';
    }
    function budgetView() {
      const current=ui(),s=state(),past=s.history.find(row=>row.year===Number(current.budgetYear));
      const finance=past?.finance || quote().finance;
      const taxes=past?'':taxesView(finance,current);
      const startWithTaxes=!past&&!s.history.length&&(current.tutorialStep===5||Boolean(current.taxPractice));
      const period='<label class="v3-period"><span class="v3-sr">'+esc(t('period'))+'</span><select name="budget-year"><option value="">'+esc(t('freshYear',{year:s.year}))+'</option>'+
        s.history.map(row=>'<option value="'+row.year+'" '+(past?.year===row.year?'selected':'')+'>'+esc(t('budget.sectorActual',{year:row.year}))+'</option>').join('')+'</select></label>';
      return heading(t('nav.budget'),period)+'<div class="v3-budget-grid"><div>'+(startWithTaxes?taxes:'')+'<section class="v3-card v3-card-body v3-balance" data-anchor="budget.review">'+
        '<p class="v3-eyebrow">'+esc(t(past?'actual':'budget.remaining'))+'</p><strong class="v3-total '+(finance.cashEnd<0?'negative':'')+'">'+esc(money(finance.cashEnd))+'</strong>'+
        label(t('cashStart'),money(finance.cash))+label(t('totalIn'),money(finance.totalIn))+label(t('totalOut'),money(finance.totalOut))+
        '<details><summary>'+esc(t('disclose'))+'</summary>'+finance.operations.map(op=>label(operationName(op),(op.direction==='in'?'+':'−')+money(op.amount))).join('')+'</details></section>'+
        (startWithTaxes?'':taxes)+
        (!past?'<section class="v3-card v3-card-body">'+button('<span><strong>'+esc(t('budget.loan'))+'</strong><small>'+esc(s.draft.loan?money(s.draft.loan.principal):t('noLoan'))+'</small></span><span aria-hidden="true">›</span>','loan','v3-row-button','data-anchor="budget.loan"')+
          '<details><summary>'+esc(t('budget.reserve'))+'</summary><p>'+esc(t('reserveHelp'))+'</p>'+label(t('cashStart'),money(s.finance.reserve))+
          moneyInput('reserveDraw',s.draft.reserveDraw,t('reserveTake'),s.finance.reserve)+moneyInput('reserveContribution',s.draft.reserveContribution,t('reserveAdd'))+label(t('after'),money(finance.reserveEnd))+'</details></section>':'')+
        '</div><div><h2>'+esc(t('budget.sectors'))+'</h2><section class="v3-card v3-card-body">'+
        (!past?'<details><summary>'+esc(t('sectorHelpTitle'))+'</summary><p>'+esc(t('sectorHelp'))+'</p></details>':'')+
        Object.entries(finance.sectors||{}).map(([id,sector])=>'<details class="v3-sector"><summary><span>'+esc(t(id))+'</span><strong>'+esc(money(sector.total))+'</strong></summary>'+
        (sector.entries||[]).map(op=>label(operationName(op),money(op.amount))).join('')+(!past?moneyInput('sector:'+id,s.draft.sectorLimits[id]??sector.total,t('allocation')):'')+'</details>').join('')+
        label(t('interest'),money(finance.operations.filter(op=>op.type==='interest').reduce((sum,row)=>sum+row.amount,0)))+
        label(t('principal'),money(finance.operations.filter(op=>op.type==='principal').reduce((sum,row)=>sum+row.amount,0)))+'</section>'+
        '<section class="v3-card v3-card-body"><h2>'+esc(t('future'))+'</h2>'+finance.futureRows.map(row=>label(String(row.year),money(row.cash))).join('')+'</section>'+
        '<section><h2>'+esc(t('operational'))+'</h2><div class="v3-card">'+s.projects.map(project=>'<button type="button" class="v3-measure" data-v3-object="'+esc(project.id)+'"><span><strong>'+esc(local(project.labels))+'</strong><small>'+esc(phaseLabel(phase(project)))+' · '+esc(money(project.annualOpex))+' '+esc(t('annual'))+'</small></span><span aria-hidden="true">›</span></button>').join('')+(s.projects.length?'':'<p class="v3-card-body">'+esc(t('noBuilding'))+'</p>')+'</div></section></div></div>';
    }
    function loanView() {
      const draft=loanDraft || {...(state().draft.loan||{principal:0,termYears:3})},finance=state().finance;
      let schedule=[];
      try {schedule=rules.loanSchedule(Number(draft.principal),finance.annualPercent,Number(draft.termYears),state().year);} catch (_) {}
      return back('back',t('nav.budget'))+heading(t('budget.loan'))+'<form id="v3-loan-form" class="v3-card v3-card-body">'+
        '<p>'+esc(t('loanHelp'))+'</p>'+
        label(t('budget.debt'),money(finance.debt))+label(t('budget.debtLimit'),money(finance.debtLimit))+
        moneyInput('loan-principal',draft.principal,t('loanAmount'),(quote().finance.loanHeadroom??finance.debtLimit-finance.debt))+
        '<label class="v3-field"><span>'+esc(t('loanTerm'))+'</span><select name="loan-term">'+Array.from({length:10},(_,i)=>'<option value="'+(i+1)+'" '+(draft.termYears===i+1?'selected':'')+'>'+(i+1)+'</option>').join('')+'</select></label>'+
        label(t('rate'),number(finance.annualPercent,2)+'%')+
        '<div id="v3-loan-schedule">'+loanRows(schedule)+'</div>'+
        button(esc(t('budget.loanDraft')),'save-loan','primary full')+
        (state().draft.loan?button(esc(t('removeLoan')),'remove-loan','secondary full'):'')+'</form>';
    }
    function loanRows(schedule) {
      return label(t('loanTotal'),money(schedule.reduce((sum,row)=>sum+row.principal+row.interest,0)))+
        '<div class="v3-table-scroll"><table><thead><tr><th>'+esc(t('year'))+'</th><th>'+esc(t('principal'))+'</th><th>'+esc(t('interest'))+'</th></tr></thead><tbody>'+
        schedule.map(row=>'<tr><th>'+row.year+'</th><td>'+esc(money(row.principal))+'</td><td>'+esc(money(row.interest))+'</td></tr>').join('')+'</tbody></table></div>';
    }
    // Screen projection for the approved district illustration. Model nodes, roads and
    // travel minutes are unchanged; both screen routes and pins use this projection.
    function mapPoint(nodeId) {
      const projected={yard:[.84,.17],bridge:[.62,.335],south:[.25,.757],
        old:[.19,.43],other:[.93,.36],w:[.27,.52],c:[.4,.53],
        b:[.49,.52],e:[.72,.41],j:[.32,.66],s:[.09,.87]};
      const node=state().schoolMap.nodes.find(row=>row.id===nodeId);
      const point=projected[nodeId]||[node?.x01??.5,node?.y01??.5];
      return {x:point[0],y:point[1]};
    }
    function servicePoint(project) {
      const node={'school-bus':'s','second-shift':'w'}[project.measureId];
      if (node) return mapPoint(node);
      const district=rules.DISTRICTS[project.districtId];
      return {x:district?.x??.5,y:district?.y??.5};
    }
    function siteData(measure) {
      if (measure?.id==='school-campus') return state().schoolMap.sites.map(site=>{
        const position=mapPoint(site.node);
        const captions={yard:['Во дворах','In the courtyards','居民院落'],bridge:['У моста','By the bridge','桥边'],south:['Южная развилка','Southern junction','南部路口']};
        return {...site,labels:captions[site.id]?{ru:captions[site.id][0],en:captions[site.id][1],zh:captions[site.id][2]}:site.label,...position};
      });
      return rules.SITES.filter(row=>measure?.siteIds?.includes(row.id));
    }
    function locationArt(district,siteMode,historical = null) {
      const s=historical?{schoolMap:state().schoolMap,projects:historical.projects,closedRoads:historical.stats?.school?.closedRoads||[]}:state();
      const rows=s.projects.filter(row=>row.districtId===district),school=district==='suburb';
      const pin=(id,title,status,position,classes='')=>{
        const tag=historical?'span':'button';
        return '<'+tag+' '+(historical?'role="img"':'type="button" data-v3-object="'+esc(id)+'"')+
          ' class="v3-facility-pin '+classes+' '+esc(status)+'" style="--x:'+position.x+';--y:'+position.y+'" aria-label="'+esc(title)+'">'+
          '<span aria-hidden="true">'+(status==='open'?'●':status==='closed'?'■':'◷')+'</span></'+tag+'>';
      };
      const img=school?'assets/v3/district-base.webp':'assets/illustrated/region-cover-1024.webp';
      const content=['<div class="v3-map-stage '+(siteMode?'site-mode':'')+'" data-anchor="map.inspectOrPlace"'+(historical?' data-v3-map-year="'+historical.year+'"':'')+'>',picture(img,districtLabel(district),'v3-map-base')];
      if (school) {
        content.push(picture('assets/v3/old-school-layer.webp','','v3-old-school'));
        const roads=s.schoolMap.roads,nodes=Object.fromEntries(s.schoolMap.nodes.map(n=>[n.id,n]));
        content.push('<svg class="v3-roads" viewBox="0 0 1000 667" aria-hidden="true">'+roads.filter(road=>road.id==='bridge-crossing'&&s.closedRoads.includes(road.id)).map(road=>{
          const from=nodes[road.from]&&mapPoint(road.from),to=nodes[road.to]&&mapPoint(road.to);
          if (!from||!to) return '';
          return '<path class="'+(s.closedRoads.includes(road.id)?'closed':'')+'" d="M'+from.x*1000+' '+from.y*667+' L'+to.x*1000+' '+to.y*667+'"/>';
        }).join('')+'</svg>');
      }
      rows.forEach(project=>{
        const measure=rules.MEASURES.find(m=>m.id===project.measureId);
        const status=historical?project.status:phase(project),site=siteData(measure).find(row=>row.id===project.siteId);
        if (historical&&(!status||(measure?.siteIds?.length&&!site))) return;
        const position=site||servicePoint(project);
        if (project.measureId==='school-campus'&&(!historical||['foundation','frame','finishing','open'].includes(status)||(['closed','restoring'].includes(status)&&project.paidYears?.length))) {
          const step=status==='open'||(['closed','restoring'].includes(status)&&project.paidYears?.length)?'open':['foundation','frame','finishing'].includes(status)?status:'foundation';
          content.push('<img class="v3-building '+(status==='closed'?'closed':'')+'" '+(['foundation','frame','finishing'].includes(status)?'data-v3-construction="'+status+'" ':'')+'style="--x:'+position.x+';--y:'+position.y+'" src="'+esc(asset('assets/v3/new-school-'+step+'.webp'))+'" alt="">');
        }
        content.push(pin(project.id,local(project.labels)+' · '+phaseLabel(status),status,position,project.measureId==='school-campus'?'v3-campus-pin':''));
      });
      if (school&&!siteMode) {
        const old=mapPoint('old'),other=mapPoint('other');
        content.push(pin('old-school',t('oldSchool'),'open',old,'existing'));
        content.push(pin('other-school',t('otherSchool'),'open',other,'existing'));
      }
      if (siteMode) siteData(selectedMeasure()).forEach((site,index)=>{
        content.push('<button type="button" class="v3-site-pin '+(ui().inspectedSiteId===site.id?'selected':'')+'" data-v3-site="'+esc(site.id)+'" style="--x:'+site.x+';--y:'+site.y+'" aria-label="'+esc(local(site.labels))+'">'+esc(site.marker || String.fromCharCode(65+index))+'</button>');
      });
      return content.join('')+'</div>';
    }
    function mapView() {
      const district=ui().districtId||'suburb',s=state(),projects=s.projects.filter(row=>row.districtId===district);
      return heading(t('nav.map'))+'<section class="v3-overview" aria-label="'+esc(t('whole'))+'">'+picture('assets/illustrated/region-cover-1024.webp',t('whole'))+
        Object.entries(rules.DISTRICTS).map(([id,row])=>'<button type="button" class="v3-region-pin '+(id===district?'selected':'')+'" style="--x:'+row.x+';--y:'+row.y+'" data-v3-district="'+id+'" aria-label="'+esc(districtCaption(id))+'"></button>').join('')+'</section>'+
        '<label class="v3-field v3-district-picker"><span>'+esc(t('district'))+'</span><select name="district">'+Object.entries(rules.DISTRICTS).map(([id,row])=>'<option value="'+id+'" '+(id===district?'selected':'')+'>'+esc(local(row.labels))+'</option>').join('')+'</select></label>'+
        '<p class="v3-muted">'+esc(s.history.length?t('factYear',{year:s.history.at(-1).year}):t('baseline'))+'</p><div class="v3-map-grid">'+locationArt(district,false)+'<div><div class="v3-card">'+
        (district==='suburb'?'<button class="v3-measure" type="button" data-v3-object="old-school" data-anchor="map.inspectResult"><span><strong>'+esc(t('oldSchool'))+'</strong><small>'+esc(t('running'))+'</small></span><span aria-hidden="true">›</span></button>':'')+
        projects.map(project=>'<button class="v3-measure" type="button" data-v3-object="'+esc(project.id)+'"><span><strong>'+esc(local(project.labels))+'</strong><small>'+esc(phaseLabel(phase(project)))+' · '+(project.siteId?esc(local(siteData(rules.MEASURES.find(row=>row.id===project.measureId)).find(site=>site.id===project.siteId)?.labels)||project.siteId):esc(districtLabel(district)))+'</small></span><span aria-hidden="true">›</span></button>').join('')+
        (!projects.length&&district!=='suburb'?'<div class="v3-card-body">'+esc(t('noBuilding'))+'</div>':'')+'</div>'+
        (selectedMeasure()?.siteIds?.length?button(esc(t(s.draft.siteId?'siteChange':'map.chooseSite')),'sites','secondary full'):'')+
        (s.history.length?button(esc(t('history')),'history','link'):'')+'</div></div>';
    }
    function sitesView() {
      const measure=selectedMeasure();
      if (!measure?.siteIds?.length) return mapView();
      const sites=siteData(measure),selected=sites.find(row=>row.id===(ui().inspectedSiteId||state().draft.siteId))||sites[0];
      const s=state(),school=measure.id==='school-campus';
      const prospective=school?rules.schoolQuote(s,selected.id):rules.quote({...s,draft:{...s.draft,siteId:selected.id}},{eventPlan:G.V3Events.plan({record:s.event,choice:s.draft.eventChoice||'base'})}).project?.projection;
      const occupied=s.projects.some(project=>project.siteId===selected.id);
      return back('project-back',t('newProject'))+heading(t('map.chooseSite'))+
        '<div class="v3-segments v3-site-choices">'+sites.map((site,index)=>'<button type="button" data-v3-site="'+esc(site.id)+'" aria-pressed="'+(selected.id===site.id)+'">'+esc((site.marker||String.fromCharCode(65+index))+' '+local(site.labels))+'</button>').join('')+'</div>'+
        '<div class="v3-placement-grid">'+locationArt(measure.districtId,true)+
        '<div><section class="v3-card v3-card-body"><h2>'+esc(local(selected.labels))+'</h2>'+
        (school?label(t('served'),number(prospective.served)+' / '+number(prospective.demand))+
          label(t('plannedOpen'),prospective.firstServiceYear)+label(t('construction'),money(prospective.capexMillion))+label(t('budget.annual'),money(prospective.annualOpexMillion))+
          label(t('bridgeRisk'),number(prospective.servedWithBridgeClosed)+' / '+number(prospective.demand))+label(t('min'),number(prospective.meanTripMinutesServed,2)):
          label(t('plannedOpen'),s.year+measure.lag+selected.delay)+label(t('construction'),money(measure.cost+selected.cost))+
          label(t('budget.annual'),money(measure.annualOpex+selected.opex))+
          (prospective?.districts||[]).map(row=>label(districtLabel(row.districtId),number(row.before.served)+' → '+number(row.after.served)+' / '+number(row.after.demand))).join(''))+
        '</section>'+button(esc(occupied?t('siteRequired'):t('map.acceptSite')),'accept-site','primary full','data-site-id="'+esc(selected.id)+'" '+(occupied?'disabled':''))+'</div></div>';
    }
    function objectView() {
      const id=ui().objectId,s=state(),project=s.projects.find(row=>row.id===id),baseline=!project,school=s.stats.school?.facilities?.find(row=>row.id===(id==='other-school'?'east-school':id));
      const name=project?local(project.labels):t(id==='other-school'?'otherSchool':'oldSchool');
      const restore=measures().filter(row=>row.id.includes(id)&&row.id!==project?.measureId);
      return back('back',t('nav.map'))+heading(name)+'<p class="v3-muted">'+esc(districtCaption(project?.districtId||'suburb'))+'</p>'+locationArt(project?.districtId||'suburb',false)+
        '<section class="v3-card v3-card-body" data-anchor="map.inspectResult">'+
        '<p class="v3-eyebrow">'+esc(s.history.length?t('factYear',{year:s.history.at(-1).year}):t('baseline'))+'</p>'+
        '<p class="v3-state '+esc(project?phase(project):'open')+'">'+esc(project?phaseLabel(phase(project)):t('running'))+'</p>'+
        (project?label(t('plannedOpen'),project.openingYear)+label(t('budget.annual'),money(project.annualOpex))+label(t('period'),project.openingYear+'–'+project.endYear):
          label(t('people'),number(school?.served))+label(t('demand'),number(Math.min(school?.physicalSeats,school?.staffedSeats))))+
        (project?.siteId?label(t('site'),local(siteData(rules.MEASURES.find(row=>row.id===project.measureId)).find(row=>row.id===project.siteId)?.labels)||project.siteId):'')+
        restore.map(row=>'<button type="button" class="v3-button primary full" data-v3-measure="'+esc(row.id)+'">'+esc(local(row.labels))+'</button>').join('')+
        '</section>'+button(esc(t('nav.decisions')),'decisions','secondary full');
    }
    function schoolExercise() {
      const practice=controller.schoolPractice?.();
      if (!practice?.visible) return '';
      const comparison=ui().tutorialStep===9,initial=practice.initial;
      const question=t(comparison?'schoolChangeQuestion':'schoolQuestion');
      let options;
      if (comparison) {
        options=initial===null||practice.recent===null?['higher','same','lower','unknown']:['higher','same','lower'];
      } else {
        const choices=initial===null?[0,'no-demand',100]:initial<8?[initial,initial+4,initial+8]:initial>92?[initial-8,initial-4,initial]:[initial-4,initial,initial+6];
        const offset=(Number.parseInt(state().attemptId.at(-1),16)||0)%choices.length;
        options=[...choices.slice(offset),...choices.slice(0,offset)].map(value=>typeof value==='number'?Number(value.toFixed(1)):value);
      }
      const answerText=value=>comparison?t(value==='unknown'?'schoolUnknown':value):value==='no-demand'?t('noDemand'):number(value,1)+'%';
      return '<section class="v3-school-exercise" data-v3-school-question>'+
        (comparison?label(t('baseline'),initial===null?t('noDemand'):number(initial,1)+'%'):'')+
        '<h3>'+esc(question)+'</h3><div class="v3-practice-options" role="group" aria-label="'+esc(question)+'">'+options.map(value=>
          button(esc(answerText(value)),comparison?'tutorial-kpi-change':'tutorial-kpi','secondary','data-v3-value="'+esc(value)+'"')).join('')+'</div>'+
        (practiceError?'<p class="v3-practice-feedback" role="status">'+esc(t(practiceError))+'</p>':'')+'</section>';
    }
    function kpiRows(stats,previous,exercise) {
      return Object.entries(stats.kpis||{}).map(([id,kpi])=>{
        const title=t(id==='school'?'stats.schoolAccess':id);
        const delta=kpi.value!==null&&previous?.kpis?.[id]?.value!==null?kpi.value-Number(previous?.kpis?.[id]?.value):null;
        const value=id==='school'&&controller.schoolCoverage?controller.schoolCoverage(stats):kpi.value;
        return '<div class="v3-kpi" data-v3-kpi="'+esc(id)+'"><div><strong>'+esc(title)+'</strong><small>'+esc(number(kpi.served))+' / '+esc(number(kpi.demand))+'</small></div><div><b>'+esc(value===null?t('noDemand'):number(value,1)+'%')+'</b>'+
          (Number.isFinite(delta)?'<small class="'+(delta>=0?'positive':'negative')+'">'+(delta>0?'+':'')+esc(number(delta,1))+' '+esc(language()==='ru'?'п.п.':language()==='zh'?'百分点':'pp')+'</small>':'')+'</div></div>'+(id==='school'?exercise:'');
      }).join('');
    }
    function statsView() {
      const s=state(),current=ui(),last=s.history.at(-1),row=s.history.find(row=>row.year===Number(current.statsYear))||last;
      const stats=current.statsYear==='initial'?s.initialStats:row?.stats||s.initialStats,district=current.statsDistrict||'all';
      const projection=district==='all'?stats:stats.districts[district];
      const previous=district==='all'?s.initialStats:s.initialStats.districts[district];
      return heading(t('nav.stats'))+'<div class="v3-stat-filters"><label><span class="v3-sr">'+esc(t('period'))+'</span><select name="stats-year"><option value="initial" '+(current.statsYear==='initial'?'selected':'')+'>'+esc(t('baseline'))+'</option>'+
        s.history.map(entry=>'<option value="'+entry.year+'" '+((current.statsYear?Number(current.statsYear)===entry.year:last?.year===entry.year)?'selected':'')+'>'+entry.year+'</option>').join('')+'</select></label>'+
        '<label><span class="v3-sr">'+esc(t('district'))+'</span><select name="stats-district"><option value="all">'+esc(t('whole'))+'</option>'+Object.keys(rules.DISTRICTS).map(id=>'<option value="'+id+'" '+(district===id?'selected':'')+'>'+esc(districtLabel(id))+'</option>').join('')+'</select></label></div>'+
        '<p class="v3-muted">'+esc(current.statsYear==='initial'||!row?t('baseline'):t('stats.after',{year:row.year}))+'</p>'+
        '<div class="v3-stats-grid"><section class="v3-card v3-card-body" data-anchor="'+(row?'stats.actual':'stats.baseline')+'"><h2>'+esc(t('stats.kpi'))+'</h2>'+kpiRows(current.statsYear==='initial'?previous:projection,previous,schoolExercise())+'</section>'+
        '<section class="v3-card v3-card-body"><h2>'+esc(t('stats.support'))+'</h2>'+label(t('support'),number(stats.support,1)+' / 100')+
        Object.entries(stats.groups||{}).map(([id,value])=>'<div class="v3-group"><div>'+label(t(id),number(value,1))+'</div><meter min="0" max="100" value="'+value+'" aria-label="'+esc(t(id))+'">'+value+'</meter></div>').join('')+
        '<details><summary>'+esc(t('reasons'))+'</summary>'+Object.entries(stats.groupReasons||{}).map(([id,value])=>'<p><strong>'+esc(t(id))+'</strong> '+esc(typeof value==='number'?(value>0?'+':'')+number(value,1):value?.delta!==undefined?(value.delta>0?'+':'')+number(value.delta,1):local(value))+'</p>').join('')+'</details></section></div>'+
        ((stats.eventOutcomes||[]).length?'<section class="v3-card v3-card-body"><h2>'+esc(t('event'))+'</h2>'+stats.eventOutcomes.map(outcome=>{
          const event=G.V3Events.eventCard(outcome.eventId,language());
          return '<p><strong>'+esc(event?.title||'')+'</strong></p>'+label(event?.localIndicator.unitLabel||'',number(outcome.actualUnits??outcome.units??outcome.value));
        }).join('')+'</section>':'')+
        (s.history.length?button(esc(t('history')),'history','secondary full'):'');
    }
    function historyView() {
      return back('back',t('nav.stats'))+heading(t('history'))+'<div class="v3-history">'+state().history.map(row=>{
        const event=G.V3Events.eventCard(row.event?.id||row.event?.eventId,language());
        return '<details class="v3-card v3-card-body" data-v3-history-year="'+row.year+'" '+(Number(ui().mapYear)===row.year?'open':'')+'><summary><strong>'+row.year+'</strong> '+esc(local(row.measure?.labels)||t('dec.defer'))+'</summary>'+
          '<p>'+esc(event?.title||'')+'</p>'+label(t('budget.remaining'),money(row.finance.cashEnd))+label(t('support'),number(row.stats.support,1))+
          (Array.isArray(row.projects)?'<button type="button" class="v3-button secondary full" data-v3-history-map="'+row.year+'">'+esc(t('historyMap'))+'</button>':'')+'</details>';
      }).join('')+'</div>';
    }
    function historyMapView() {
      const row=state().history.find(entry=>entry.year===Number(ui().mapYear));
      if (!Array.isArray(row?.projects)) return historyView();
      const district=ui().districtId||'suburb',projects=row.projects.filter(project=>project.districtId===district);
      const facilities=district==='suburb'?row.stats?.school?.facilities||[]:[];
      const facilityName=facility=>facility.id==='old-school'?t('oldSchool'):facility.id==='east-school'?t('otherSchool'):
        local(projects.find(project=>project.measureId==='school-campus')?.labels)||t('newProject');
      return back('history-return',t('history'))+heading(t('factYear',{year:row.year}))+
        '<label class="v3-field v3-district-picker"><span class="v3-sr">'+esc(t('district'))+'</span><select name="district">'+
        Object.entries(rules.DISTRICTS).map(([id,item])=>'<option value="'+id+'" '+(id===district?'selected':'')+'>'+esc(local(item.labels))+'</option>').join('')+'</select></label>'+
        '<div class="v3-map-grid">'+locationArt(district,false,row)+'<div><section class="v3-card v3-card-body">'+
        projects.map(project=>'<div class="v3-history-project"><h2>'+esc(local(project.labels))+'</h2>'+
          '<p class="v3-state '+esc(project.status||'')+'">'+esc(project.status?phaseLabel(project.status):t('historyStageUnknown'))+'</p>'+
          label(t('plannedOpen'),project.openingYear)+label(t('budget.annual'),money(project.annualOpex))+'</div>').join('')+
        (!projects.length?'<p>'+esc(t('noBuilding'))+'</p>':'')+'</section>'+
        (facilities.length?'<section class="v3-card v3-card-body">'+facilities.map(facility=>'<h3>'+esc(facilityName(facility))+'</h3>'+
          label(t('people'),number(facility.served))+label(t('staffedPlaces'),number(facility.staffedSeats))).join('')+'</section>':'')+'</div></div>';
    }
    function adviserView() {
      const messages=controller.advisor?.messages?.()||[];
      return heading(t('nav.advisor'))+'<div class="v3-advisor-person">'+picture('assets/characters/ilya-avatar.webp','','')+
        '<div><strong>'+esc(t('localAdvisor'))+'</strong><span>'+esc(t('advisorRole'))+'</span></div></div>'+
        '<div class="v3-conversation" role="log" aria-live="polite" aria-label="'+esc(t('answerLabel'))+'">'+messages.map((message,index)=>
          '<p class="v3-chat-question">'+esc(message.question)+'</p><div class="v3-chat-answer"><p>'+esc(message.text).replace(/\n/g,'<br>')+'</p>'+
          (message.target?'<button type="button" class="v3-button secondary" data-v3-advice="'+index+'">'+esc(t('advisor.show'))+'</button>':'')+
          (message.status==='unavailable'?'<button type="button" class="v3-button secondary" data-v3-advice-retry="'+index+'">'+esc(t('advisorRetry'))+'</button>':'')+'</div>').join('')+
          (chatPending?'<p class="v3-chat-answer" role="status">'+esc(t('awaiting'))+'</p>':'')+
          (chatError?'<p role="alert">'+esc(chatError)+'</p>':'')+'</div>'+
        (!messages.length?'<div class="v3-chat-suggestions">'+button(esc(t('navigation')),'ask-navigation','secondary')+button(esc(t('compare')),'ask-compare','secondary')+'</div>':'')+
        '<form id="v3-chat" class="v3-composer"><label class="v3-sr" for="v3-question">'+esc(t('ask'))+'</label><textarea rows="1" id="v3-question" name="question" maxlength="1200" placeholder="'+esc(t('ask'))+'">'+esc(chatDraft)+'</textarea>'+
        '<button type="submit" aria-label="'+esc(t('send'))+'" '+(chatPending?'disabled':'')+'>➤</button></form>';
    }
    function errorLabel(error) {
      const code=error.code;
      if (code==='cash-shortfall'||code==='budget-deficit'||code==='insufficient-cash') return t('shortage',{amount:money(error.amount||Math.abs(quote().finance.cashEnd))});
      const keys={'event-required':'eventRequired','measure-required':'measureRequired','site-required':'siteRequired','site-occupied':'siteRequired','invalid-site':'siteRequired','loan-limit':'loanError','reserve-unavailable':'budgetError','sector-below-commitments':'balanceError','sector-total':'balanceError','campaign-finished':'final'};
      return t(keys[code]||'budgetError');
    }
    function reviewView() {
      const current=quote(),event=card(),chosen=event?.options.find(row=>row.id===state().draft.eventChoice),year=state().year;
      return back('back',t('cancel'))+heading(t('freshYear',{year}))+
        (!current.ok?'<div class="v3-card v3-card-body"><h2>'+esc(t('reviewError'))+'</h2>'+current.errors.map(error=>
          '<button class="v3-error-link" type="button" data-v3-fix="'+esc(error.code)+'" data-tab="'+esc(error.tab)+'">'+esc(errorLabel(error))+' →</button>').join('')+'</div>':'')+
        '<section class="v3-card v3-card-body"><p class="v3-eyebrow">'+esc(t('event'))+'</p><h2>'+esc(event?.title||'')+'</h2><p>'+esc(chosen?.label||t('eventRequired'))+'</p>'+
        '<hr><p class="v3-eyebrow">'+esc(t('newProject'))+'</p><h2>'+esc(local(selectedMeasure()?.labels)||t('measureRequired'))+'</h2>'+
        (current.project?label(t('plannedOpen'),current.project.openingYear)+label(t('budget.now'),money(current.project.costNow))+label(t('budget.annual'),money(current.project.annualOpex)):'')+
        '<hr>'+label(t('budget.remaining'),money(current.finance.cashEnd))+label(t('budget.debt'),money(current.finance.debtEnd))+label(t('budget.reserve'),money(current.finance.reserveEnd))+'</section>'+
        button(esc(t('confirm',{year})),'commit','primary full','data-anchor="year.commit" '+(!current.ok||busy||(state().year===2026&&ui().tutorialStep<8)?'disabled':''))+
        (controller.handoverStatus?.()?.available?button(esc(language()==='ru'?'Передать управление':language()==='en'?'Hand over administration':'移交管理'),'handover','secondary full'):'');
    }
    function resultView() {
      const row=state().history.at(-1);
      if (!row) return decisions();
      return heading(t('result'))+'<p class="v3-year-result">'+row.year+'</p><section class="v3-card v3-card-body">'+
        '<h2>'+esc(local(row.measure?.labels)||t('dec.defer'))+'</h2>'+
        label(t('budget.remaining'),money(row.finance.cashEnd))+label(t('support'),number(row.stats.support,1)+' / 100')+
        (row.measure?label(t('plannedOpen'),row.measure.openingYear):'<p>'+esc(t('noBuilding'))+'</p>')+'</section>'+
        button(esc(t(ui().tutorialStep===9?'resultStats':'resultNext')),'result-next','primary full');
    }
    function exitLabel() {
      return controller.meta?.context==='free'
        ? {ru:'К играм',en:'Back to games',zh:'返回游戏目录'}[language()]
        : t('game.exit');
    }
    function finalView() {
      const result=rules.assess(state()),status=controller.meta?.status||{},key=typeof status==='string'?status:status.key;
      return heading(t(controller.meta?.context==='course'?'seminarFinal':'final'))+
        '<section class="v3-card v3-card-body"><p class="v3-eyebrow">'+esc(t('score'))+'</p><p class="v3-score">'+esc(number(result.points,2))+'<small>'+esc(t('points'))+'</small></p>'+
        '<p class="v3-submission" role="status">'+esc(t({sent:'sent',sending:'sending',error:'saved',offline:'saved',saved:'saved',preview:'saved'}[key]||'saved'))+'</p>'+
        (key==='error'?button(esc(t('retry')),'retry','secondary'):'')+'</section>'+
        '<section class="v3-card v3-card-body">'+result.criteria.map(row=>label(local(row.label||row.title),number(row.points,2)+' / '+number(row.maxPoints,2))).join('')+'</section>'+
        button(esc(t('stats.kpi')),'stats','secondary full')+button(esc(t('history')),'history','secondary full')+
        button(esc(exitLabel()),'exit','primary full');
    }
    function menuView() {
      return back()+heading(t('menu'))+'<section class="v3-card v3-card-body">'+
        '<label class="v3-field"><span>'+esc(t('lang'))+'</span><select name="language">'+[['ru','Русский'],['en','English'],['zh','简体中文']].map(([id,title])=>'<option value="'+id+'" '+(language()===id?'selected':'')+'>'+title+'</option>').join('')+'</select></label>'+
        '<label class="v3-check"><input type="checkbox" name="still" '+(ui().motion==='still'?'checked':'')+'>'+esc(t('still'))+'</label>'+
        '<label class="v3-check"><input type="checkbox" name="large" '+(ui().largeText?'checked':'')+'>'+esc(t('large'))+'</label>'+
        '<details><summary>'+esc(t('help'))+'</summary><p>'+esc(t('helpText'))+'</p></details>'+
        '<p id="offline-status" role="status"></p></section>'+
        (state()&&ui().started&&!welcomeStep(ui())?button(esc(t('welcomeReplay')),'welcome-replay','secondary full'):'')+
        (controller.meta?.legacyURL?'<a class="v3-button secondary full" href="'+esc(controller.meta.legacyURL)+'">'+esc(language()==='ru'?'Открыть прежнюю партию':language()==='en'?'Open an earlier game':'打开之前的游戏')+'</a>':'')+
        button(esc(exitLabel()),'exit','primary full');
    }
    function render() {
      if (destroyed) return;
      const current=ui(),s=state();
      const previousScroll=host.querySelector('.v3-content')?.scrollTop||0;
      const focused=host.contains(document.activeElement)?document.activeElement:null;
      const focusAttr=focused&&['name','data-v3-value','data-v3-action','data-v3-tab','data-v3-site','data-v3-object','data-v3-measure','data-v3-option','data-v3-tax'].find(key=>focused.hasAttribute(key));
      const focusSelector=focused?.id?'#'+CSS.escape(focused.id):focusAttr?'['+focusAttr+'="'+CSS.escape(focused.getAttribute(focusAttr))+'"]':null;
      const active=!!s&&current.started;
      const welcome=active?welcomeStep(current):0;
      const showWelcome=welcome&&(replayWelcome||current.panel!=='menu');
      const step=practiceStep(current);
      host.className='governor-v3'+(current.largeText?' v3-large-text':'')+(current.motion==='still'?' v3-still':'');
      host.dataset.v3Tab=current.tab;
      document.body.classList.toggle('governor-v3-active',active);
      const panels={event:eventView,measures:measuresView,project:projectView,sites:sitesView,object:objectView,loan:loanView,review:reviewView,result:resultView,history:historyView,'history-map':historyMapView,menu:menuView};
      let content;
      if (showWelcome) content=welcomeView(welcome);
      else if (current.panel==='menu') content=menuView();
      else if (!active) content=startView();
      else if (s.completed&&['result','review'].includes(current.panel)) content=finalView();
      else if (current.panel&&panels[current.panel]) content=panels[current.panel]();
      else if (s.completed&&current.tab==='decisions') content=finalView();
      else content=({decisions,budget:budgetView,map:mapView,stats:statsView,advisor:adviserView}[current.tab]||decisions)();
      const brand='<span class="v3-emblem" aria-hidden="true">♜</span><strong>'+esc(t('subtitle'))+'</strong>';
      host.innerHTML='<header class="v3-header">'+(welcome?'<div class="v3-welcome-brand">'+brand+'</div>':'<a href="#" data-v3-action="decisions" aria-label="'+esc(t('title'))+'">'+brand+'</a>')+
        (s?'<time>'+s.year+'</time>':'')+'<button type="button" class="v3-menu-button" data-v3-action="menu" aria-label="'+esc(t('menu'))+'">☰</button></header>'+
        '<main class="v3-content '+(current.tab==='advisor'&&!current.panel&&!showWelcome?'v3-chat-content':'')+'" id="v3-main">'+
        (errorText?'<div class="v3-alert" role="alert">'+esc(errorText)+button(esc(t('retry')),'retry','link')+'</div>':'')+
        (controller.meta?.readOnly?'<div class="v3-alert" role="status">'+esc(t('system.otherTab'))+'</div>':'')+
        (step?practiceView(step,current):'')+content+'</main>'+
        (active&&!welcome?'<nav class="v3-navigation" aria-label="'+esc(t('menu'))+'">'+navigation.map(tab=>
          '<button type="button" data-v3-tab="'+tab+'" aria-current="'+(current.tab===tab?'page':'false')+'">'+navIcon(tab)+'<span>'+esc(t('nav.'+tab))+'</span></button>').join('')+
          '<button type="button" class="v3-advance" data-v3-action="advance" data-anchor="year.review" aria-label="'+esc(t('turn.next'))+'" '+(s.completed?'disabled':'')+'><span aria-hidden="true">'+advanceIcon+'</span><small>'+esc(t('turn.next'))+'</small></button></nav>':'');
      const main=host.querySelector('.v3-content');
      main.scrollTop=focusAfter?0:previousScroll;
      if (focusAfter) {
        const target=host.querySelector('[data-anchor="'+CSS.escape(focusAfter)+'"]')||host.querySelector('#'+CSS.escape(focusAfter));
        if (target&&!target.matches('button,input,select,textarea,a,[tabindex]')) target.tabIndex=-1;
        target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});focusAfter=null;
      } else if (focusSelector) host.querySelector(focusSelector)?.focus({preventScroll:true});
      if (step) tutorialTarget(step,current)?.classList.add('v3-coach-target');
    }
    function tutorialTarget(step,current) {
      const {tab,panel}=current;
      const locate=selector=>host.querySelector(selector);
      const tabButton=name=>locate('[data-v3-tab="'+name+'"]');
      const route=locate('[data-v3-action="tutorial-next"]');
      if (step===1) return locate('[data-anchor="event.open"]')||route;
      if (step===2) return panel==='event'?locate(optionDraft?'[data-v3-action="save-event"]':'[data-v3-option]'):route;
      if (step===3) return panel==='measures'?locate('[data-v3-measure]'):route||locate('[data-anchor="measure.select"]');
      if (schoolExampleNeeded(step,current)) return locate('[data-v3-action="tutorial-school"]');
      if (step===4) return panel==='sites'?locate(current.inspectedSiteId?'[data-v3-action="accept-site"]':'.v3-site-choices'):locate('[data-v3-action="sites"]')||route;
      if (step===5) return locate('[data-anchor="budget.tax"]')||tabButton('budget');
      if (step===6||step===9) return locate('[data-v3-school-question]')||locate('#v3-tax-practice')||locate('[data-v3-action="result-next"]')||tabButton('stats');
      if (step===7) return locate('[data-v3-action="advance"]');
      if (step===8) return locate('[data-v3-fix]')||locate('[data-v3-action="commit"]')||locate('[data-v3-action="advance"]');
      if (step===10) return tab==='map'&&!panel?locate('.v3-map-grid .v3-measure[data-v3-object]'):tabButton('map');
      return null;
    }
    async function chooseMeasure(id) {
      const measure=measures().find(row=>row.id===id);
      if (!measure) return;
      await controller.patchDraft({measureId:id,siteId:null,districtId:measure.districtId,promise:null});
      await storeUI({panel:id==='defer'?null:'project',tab:'decisions',inspectedSiteId:null,districtId:measure.districtId||ui().districtId});
      await finishStep(3);
      focusAfter='v3-heading';
    }
    async function submitChat(question,options) {
      if (!question.trim()||chatPending) return;
      chatDraft='';chatPending=true;chatError='';render();
      try {await controller.advisor.ask(question.trim(),options);} catch (_) {chatError=t('unavailable');}
      chatPending=false;render();host.querySelector('#v3-question')?.focus();
      const main=host.querySelector('.v3-content');main.scrollTop=main.scrollHeight;
    }
    async function click(event) {
      const item=event.target.closest('button,a[data-v3-action]');
      if (!item||!host.contains(item)) return;
      if (item.matches('a')) event.preventDefault();
      if (item.dataset.v3Option) {optionDraft=item.dataset.v3Option;render();return;}
      if (item.dataset.v3Advice!==undefined) {
        const reply=controller.advisor.messages()[Number(item.dataset.v3Advice)];
        try {if (await controller.advisor.navigate(reply.target)===false) {chatError=t('advisorChanged');render();}}
        catch (_) {chatError=t('unavailable');render();}
        return;
      }
      if (item.dataset.v3AdviceRetry!==undefined) {
        const reply=controller.advisor.messages()[Number(item.dataset.v3AdviceRetry)];
        return submitChat(reply.question,{retry:true});
      }
      if (item.dataset.v3HistoryMap) return perform(async()=>{
        const year=Number(item.dataset.v3HistoryMap);
        if (!state().history.some(row=>row.year===year&&Array.isArray(row.projects))) return;
        await pushPanel('history-map',{mapYear:year});focusAfter='v3-heading';
      });
      if (item.dataset.v3Tax) {
        const taxMode=item.dataset.v3Tax;
        if (taxMode===state().draft.taxMode) return;
        return perform(async()=>{
          const wasTaxPractice=ui().tutorialStep===5;
          await controller.patchDraft({taxMode});
          if (wasTaxPractice&&ui().tutorialStep===6) focusAfter='v3-tax-practice';
        });
      }
      if (item.dataset.v3Tab) return perform(()=>navigate(item.dataset.v3Tab));
      if (item.dataset.v3District) return perform(()=>storeUI({districtId:item.dataset.v3District}));
      if (item.dataset.v3Site) return perform(()=>storeUI({inspectedSiteId:item.dataset.v3Site}));
      if (item.dataset.v3Measure) return perform(()=>chooseMeasure(item.dataset.v3Measure));
      if (item.dataset.v3Object) return perform(async()=>{
        const project=state().projects.find(row=>row.id===item.dataset.v3Object);
        await storeUI({tab:'map',panel:'object',objectId:item.dataset.v3Object,districtId:project?.districtId||'suburb'});
        if (!selectedMeasure()?.siteIds.length) await finishStep(4);
        await finishStep(10);
        focusAfter='v3-heading';
      });
      if (item.dataset.v3Fix) return perform(async()=>{
        const code=item.dataset.v3Fix;
        if (code==='event-required') {optionDraft=state().draft.eventChoice;await storeUI({tab:'decisions',panel:'event'});}
        else if (code==='measure-required') await storeUI({tab:'decisions',panel:'measures'});
        else if (code.startsWith('site-')) await storeUI({tab:'map',panel:'sites'});
        else await navigate(item.dataset.tab||'budget');
      });
      const action=item.dataset.v3Action;
      if (!action) return;
      if (action==='ask-navigation'||action==='ask-compare') {
        const year=action==='ask-navigation';
        return submitChat(t(year?'navigation':'compare'),{guide:year?'year':'choices'});
      }
      return perform(async()=>{
        if (navigation.includes(action)) return navigate(action);
        if (action==='start') {await controller.start();focusAfter='v3-heading';}
        else if (action==='menu') {
          if (replayWelcome) {replayWelcome=0;focusAfter='v3-heading';}
          else await pushPanel('menu');
        }
        else if (action==='welcome-replay') {replayWelcome=1;focusAfter='v3-heading';}
        else if (action==='welcome-next') {
          const step=welcomeStep(ui());
          if (!step) return;
          if (replayWelcome) replayWelcome=step<3?step+1:0;
          else await storeUI(step<3?{welcomeStep:step+1}:{welcomeStep:4,tutorialStep:1,tab:'decisions',panel:null});
          focusAfter='v3-heading';
        }
        else if (action==='back') await closePanel();
        else if (action==='exit') await controller.exit();
        else if (action==='retry') await controller.retry?.();
        else if (action==='event') await openEvent();
        else if (action==='save-event') {await controller.patchDraft({eventChoice:optionDraft??state().draft.eventChoice});await closePanel();await finishStep(2);optionDraft=null;focusAfter='v3-heading';}
        else if (action==='measures') {await pushPanel('measures');focusAfter='v3-heading';}
        else if (action==='project') await pushPanel('project');
        else if (action==='defer') await chooseMeasure('defer');
        else if (action==='project-back') await storeUI({tab:'decisions',panel:'project'});
        else if (action==='sites') await openSites();
        else if (action==='accept-site') {
          await controller.patchDraft({siteId:item.dataset.siteId});await storeUI({tab:'decisions',panel:'project'});await finishStep(4);focusAfter='v3-heading';
        }
        else if (action==='restore-tutorial-tax'&&ui().taxPractice) {
          await controller.patchDraft({taxMode:ui().taxPractice.from});focusAfter='v3-tax-practice';
        }
        else if (action==='tutorial-kpi'||action==='tutorial-kpi-change') {
          const correct=await controller.answerSchoolPractice(item.dataset.v3Value);
          practiceError=correct?'':action==='tutorial-kpi'?'schoolWrong':'schoolWrongChange';
          if (correct) focusAfter='v3-heading';
        }
        else if (action==='loan') {loanDraft={...(state().draft.loan||{principal:0,termYears:3})};await pushPanel('loan');}
        else if (action==='save-loan') {
          const form=host.querySelector('#v3-loan-form');await controller.patchDraft({loan:{principal:Number(form.elements['loan-principal'].value),termYears:Number(form.elements['loan-term'].value),annualPercent:state().finance.annualPercent}});await closePanel();
        }
        else if (action==='remove-loan') {await controller.patchDraft({loan:null});await closePanel();}
        else if (action==='advance') {
          review={signature:quote().signature,revision:state().revision};await storeUI({panel:'review'});await finishStep(7);focusAfter='v3-heading';
        }
        else if (action==='commit') {
          const current=quote();
          if (!current.ok) return;
          if (!review||review.signature!==current.signature) {review={signature:current.signature,revision:state().revision};return;}
          await controller.commitYear(review);await finishStep(8);await storeUI({panel:state().completed?null:'result',tab:'decisions'});focusAfter='v3-heading';review=null;
        }
        else if (action==='tutorial-next') {
          const step=ui().tutorialStep;
          if (step<=2) await openEvent();
          else if (step===3) {await pushPanel('measures',{tab:'decisions'});focusAfter='v3-heading';}
          else if (step===4) await openSites();
          else if (step===5) await navigate('budget');
          else if (step===6||step===9) await navigate('stats');
          else if (step===10) await navigate('map');
        }
        else if (action==='tutorial-school') {
          if (!schoolExampleNeeded(ui().tutorialStep,ui())) return;
          await pushPanel('object',{tab:'map',objectId:'old-school'});
          focusAfter='v3-heading';
        }
        else if (action==='handover') {await controller.handover({revision:state().revision});await storeUI({tab:'decisions',panel:null});}
        else if (action==='result-next') {
          if (ui().tutorialStep===9) await navigate('stats');else await storeUI({panel:null,tab:'decisions'});focusAfter='v3-heading';
        }
        else if (action==='history') await pushPanel('history');
        else if (action==='history-return') {await storeUI({panel:'history'});focusAfter='v3-heading';}
      });
    }
    function change(event) {
      const input=event.target,name=input.name;
      if (!name||name==='question') return;
      if (name==='loan-principal'||name==='loan-term') {
        const form=input.form;loanDraft={principal:Number(form.elements['loan-principal'].value),termYears:Number(form.elements['loan-term'].value)};
        let rows=[];try{rows=rules.loanSchedule(loanDraft.principal,state().finance.annualPercent,loanDraft.termYears,state().year);}catch(_){}
        host.querySelector('#v3-loan-schedule').innerHTML=loanRows(rows);return;
      }
      perform(async()=>{
        if (name==='language') await controller.setLanguage(input.value);
        else if (name==='still') await storeUI({motion:input.checked?'still':'auto'});
        else if (name==='large') await storeUI({largeText:input.checked});
        else if (name==='budget-year') await storeUI({budgetYear:input.value});
        else if (name==='stats-year') {practiceError='';await storeUI({statsYear:input.value});}
        else if (name==='stats-district') {practiceError='';await storeUI({statsDistrict:input.value});}
        else if (name==='district') await storeUI({districtId:input.value});
        else if (name==='reserveDraw'||name==='reserveContribution') await controller.patchDraft({[name]:Number(input.value)});
        else if (name.startsWith('sector:')) await controller.patchDraft({sectorLimits:{...state().draft.sectorLimits,[name.split(':')[1]]:Number(input.value)}});
        else if (name==='promise-type') await controller.patchDraft({promise:input.value?{type:input.value,dueYear:quote().project?.openingYear||state().year,amount:state().finance.reserve}:null});
        else if (name==='promise-year') await controller.patchDraft({promise:{...state().draft.promise,dueYear:Number(input.value)}});
        else if (name==='promise-amount') await controller.patchDraft({promise:{...state().draft.promise,amount:Number(input.value)}});
      });
    }
    function input(event) {
      if (event.target.id==='v3-question') chatDraft=event.target.value;
    }
    function submit(event) {
      if (event.target.id==='v3-chat') {event.preventDefault();submitChat(event.target.elements.question.value);}
      if (event.target.id==='v3-loan-form') event.preventDefault();
    }
    function popstate(event) {
      replayWelcome=0;
      if (event.state?.governorV3) perform(()=>storeUI({tab:event.state.tab,panel:event.state.panel}));
      else if (ui().panel) perform(()=>closePanel());
    }
    function viewportChanged() {
      const visual=window.visualViewport;
      host.style.setProperty('--v3-height',(visual?.height||window.innerHeight)+'px');
      host.classList.toggle('v3-keyboard-open',ui().tab==='advisor'&&!!visual&&window.innerHeight-visual.height>140);
    }
    host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('input',input);host.addEventListener('submit',submit);
    host.addEventListener('error',imageError,true);
    window.addEventListener('popstate',popstate);window.addEventListener('resize',viewportChanged);window.visualViewport?.addEventListener('resize',viewportChanged);
    viewportChanged();render();
    return {render,navigate,destroy(){
      destroyed=true;
      host.removeEventListener('click',click);host.removeEventListener('change',change);host.removeEventListener('input',input);host.removeEventListener('submit',submit);
      host.removeEventListener('error',imageError,true);
      window.removeEventListener('popstate',popstate);window.removeEventListener('resize',viewportChanged);window.visualViewport?.removeEventListener('resize',viewportChanged);
      document.body.classList.remove('governor-v3-active');
    }};
  }
  G.V3UI = {mount};
})(globalThis);
