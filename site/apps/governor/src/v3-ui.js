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
    advisorGuest:['В гостевом режиме доступны подсказки по игре. Для полного диалога войдите в профиль РУДН.','Guests can use the built-in tips. Sign in to your RUDN account for the full chat.','访客可以使用游戏内的提示。登录俄罗斯人民友谊大学账号后即可完整使用对话功能。'],
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
    min:['мин','min','分钟'], served:['Ученики в пределах допустимого времени в пути','Pupils within the travel-time limit','通勤时间达标的学生'],
    schoolTrip:['Среднее время дороги в одну сторону','Average one-way travel time','平均单程时间'],
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
    futureBalance:['Прогноз остатка средств на {from}–{to} годы','Projected cash balance for {from}–{to}','{from}–{to}年预计资金余额'],
    futureBalanceYear:['Прогноз остатка средств на {year} год','Projected cash balance for {year}','{year}年预计资金余额'],
    futureMore:['Остальные годы до {year}','Other years through {year}','其余年份（至{year}年）'],
    futureMoreYear:['Прогноз на {year} год','Forecast for {year}','{year}年预测'],
    reasons:['Что повлияло','What affected this','影响因素'],
    promise:['Обещание','Promise','承诺'], noPromise:['Без дополнительного обещания','No extra promise','不作额外承诺'],
    promiseOpen:['Открыть услугу к сроку','Open the service by a deadline','按期限启用服务'],
    promiseRun:['Сохранить работу к сроку','Keep the service operating','维持服务运行'],
    promiseReserve:['Сохранить резерв','Maintain a reserve','保留储备金'],
    promiseDue:['Проверить в конце года','Check at year end','年末检查'],
    promiseAmount:['Резерв не ниже, млн ₽','Minimum reserve, m RUB','最低储备金，百万卢布'],
    promiseWho:['Адресат','Recipient','承诺对象'], municipality:['Муниципалитет','Municipality','市政府'],
    residents:['Жители','Residents','居民'], financeTeam:['Финансовый блок','Finance team','财政部门'],
    menu:['Меню игры','Game menu','游戏菜单'], lang:['Язык','Language','语言'],
    menuClose:['Закрыть меню','Close menu','关闭菜单'], menuReturn:['Вернуться в игру','Return to the game','返回游戏'],
    large:['Увеличенный текст','Larger text','大号文字'], still:['Статичные иллюстрации','Still illustrations','静态插图'],
    help:['Как проходит год','How a year works','年度流程'], helpText:['Ответьте на срочную задачу. Выберите проект для района или отложите его. Проверьте бюджет и исходные показатели. Кнопка ▶ открывает сводку плана перед подтверждением года.','Respond to the urgent issue. Choose a district project or defer it. Check the budget and starting figures. ▶ opens the plan for review before you close the year.','先处理紧急任务，再决定启动或暂缓地区项目。核对预算和基准数据。点击 ▶ 可查看年度计划，确认后才结算。'],
    localAdvisor:['Илья Орлов','Ilya Orlov','伊利亚·奥尔洛夫'], advisorRole:['Стратегическое развитие','Strategic development','战略发展'],
    ask:['Спросить советника…','Ask your adviser…','询问顾问…'], send:['Отправить','Send','发送'],
    chatWelcome:['Губернатор, я на связи. Что обсудим?','Governor, I’m here. What shall we discuss?','州长，我在。您想讨论什么？'],
    chatYou:['Вы','You','您'], chatHistory:['Переписка с советником','Conversation with your adviser','与顾问的对话'],
    navigation:['Что делать в этом году?','What should I do this year?','今年要做什么？'], compare:['Как сравнить варианты?','How can I compare options?','如何比较方案？'],
    awaiting:['Подготовка ответа…','Preparing an answer…','正在准备回答…'], unavailable:['Консультация сейчас недоступна. Можно продолжить год.','Consultation is unavailable. You can continue the year.','咨询暂不可用，可以继续年度决策。'],
    ready:['План готов к проверке','Plan ready for review','计划可供核查'],
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
    welcome2Programmes:['Каждый год вы решаете, какие отрасли поддержать и сколько на это потратить.','Each year, choose which sectors to support and how much to spend.','每年由您决定支持哪些行业，以及投入多少资金。'],
    welcome3Title:['Первый год','Your first year','任期第一年'],
    welcome3First:['На карте можно познакомиться с пятью районами области.','Use the map to get to know the region’s five districts.','您可以在地图上了解本州的五个区。'],
    welcome3Construction:['На карте вы узнаете, чем живут пять районов, и сможете выбрать площадку для стройки.','Use the map to explore the five districts and choose where to build.','在地图上了解五个区，并为建设项目选择地块。'],
    welcome3Second:['Когда будете готовы, вместе разберём первую ситуацию.','When you’re ready, we’ll look at your first situation together.','准备好后，我们一起看看第一件要处理的事。'],
    welcomeProgress:['{step} из 3','{step} of 3','第 {step} 步，共 3 步'],
    welcomeNext:['Дальше','Continue','继续'], welcomeStart:['К первому году','Start the first year','进入第一年'],
    welcomeReplay:['Вступление Орлова','Orlov’s introduction','奥尔洛夫的开场介绍'], welcomeReturn:['В меню','Back to menu','返回菜单'],
    coachEvent:['Откройте ситуацию года. Посмотрите, что случилось и кому нужна ваша помощь.','Open the situation. See what happened and who needs your help.','打开年度情况，了解发生了什么，以及谁需要您的帮助。'],
    coachAnswer:['Сравните, кому поможет каждый ответ и сколько он стоит. Сохраните свой выбор.','Compare who benefits from each response and what it costs. Save your choice.','比较每种回应能帮助谁、需要多少钱，再保存选择。'],
    coachProject:['Проект — отдельное улучшение для района. Его можно начать или отложить на этот год.','A project is a separate improvement for a district. You can start one or defer it for the year.','项目用于单独改善一个地区。您可以今年启动，也可以暂缓。'],
    coachMeasures:['Меры улучшают жизнь в районах. В план можно добавить несколько, если хватит денег.','Measures improve life in the districts. Add as many to the plan as you can afford.','措施可以改善各区居民的生活。预算允许时，可以把多项措施加入计划。'],
    coachOpenScope:['Откройте карту. Нажмите на район, чтобы посмотреть его показатели.','Open the map and tap a district to see its indicators.','打开地图，点击一个地区查看其指标。'],
    coachProgrammeScope:['Районы программы: {districts}. Откройте один из них и прочитайте показатели.','Programme districts: {districts}. Open one and read its indicators.','项目地区：{districts}。请选择一个查看指标。'],
    mapConstruction:['Выбрать стройку','Choose what to build','选择建设项目'],
    mapDistrictMeasures:['Местные меры','Local measures','地方措施'],
    mapMarkSuburb:['НБ','NB','新'],
    mapMarkCapital:['ОЦ','C','州'],
    sectorProgrammes:['Программы отрасли','Programmes in this sector','本行业项目'],
    territoryReach:['Районы действия','Districts served','覆盖地区'],
    localProgrammes:['Программы в районе','Programmes serving this district','覆盖本区的项目'],
    placesEstimate:['Охват к началу работы','Projected reach when service starts','服务启动时的预计覆盖人数'],
    programmeYears:['Период работы','Operating years','运行年份'],
    programmeBalance:['Остаток с программой','Cash balance with this programme','实施本项目后的国库余额'],
    majorEvent:['Событие области','Regional event','全州事件'],
    majorMap:['Показать на карте','Show on map','在地图上查看'],
    majorRequired:['Обязательные расходы','Unavoidable spending','必要支出'],
    majorTotalNow:['Всего из казны сейчас','Total from the treasury now','当前国库总支出'],
    eventPayments:['Из казны по событию в этом году','Treasury spending on this event this year','本年度该事件的国库支出'],
    eventReimbursement:['Возмещение по событию','Event reimbursement','该事件的支出补偿'],
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
    toProjects:['К проектам','View projects','查看项目'], toProgrammes:['К программам','View programmes','查看行业项目'],
    toStats:['К статистике','View statistics','查看统计'], toMap:['К карте','View the map','打开地图'],
    backToProgramme:['Вернуться к программе','Back to programme','返回项目'],
    taxPractice:['Пробный расчёт','Trial calculation','试算结果'],
    taxRestored:['Исходная нагрузка восстановлена','Original tax level restored','已恢复原来的税负'],
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
    negotiationOpen:['Обсудить обязательства','Discuss commitments','商议承诺'],
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
    let chatDraft = '', chatPending = '', chatError = '', chatShell = '', chatLog = '';
    let loanDraft = null, review = null;
    let replayWelcome = 0, practiceError = '', menuReturnPending = false, scrollAfterMenu = null;
    let investmentDraft = null, taxFrame = 0, taxRelease = 0, taxWrite = null, spotlightFrame = 0;
    const navigation = ['decisions','budget','map','stats','advisor'];
    const routeFields=['tab','panel','selectedMeasureId','catalogueMode','catalogueOrigin','programmeSector','constructionDistrict',
      'districtId','locationScope','inspectedSiteId','objectId','mapYear','historyMapSource','programmeMapReturn',
      'sourceTab','returnPanel','scroll'];
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
    const ui = () => {
      const current={...defaultUI,...(controller.getUI?.() || {})};
      if (!modern()||!current.selectedMeasureId||
          !['project','sites','negotiation'].includes(current.panel)) return current;
      const measure=G.V4Campaign.measure(current.selectedMeasureId)||measures().find(row=>row.id===current.selectedMeasureId);
      if (!measure) return current;
      const mode=v4.scope(measure);
      const origin=mode==='programmes'?(current.catalogueOrigin==='budget'?'budget':'decisions'):'map';
      return {...current,tab:origin,catalogueMode:mode,catalogueOrigin:origin};
    };
    const state = () => controller.getState();
    const modern = () => controller.meta?.edition==='v4';
    const welcomeStep = current => replayWelcome || (current.welcomeStep>=1&&current.welcomeStep<=3?current.welcomeStep:0);
    const quote = () => controller.getQuote();
    const asset = path => G.resolveAsset ? G.resolveAsset(path) : path;
    const number = (value,digits = 0) => Number.isFinite(Number(value)) ? new Intl.NumberFormat({ru:'ru-RU',en:'en-GB',zh:'zh-CN'}[language()],{maximumFractionDigits:digits}).format(value) : '—';
    const money = value => number(value >= 1000 || value <= -1000 ? value/1000 : value,2)+' '+t(Math.abs(value)>=1000?'billion':'million');
    const label = (key,value) => '<div class="v3-line"><span>'+esc(key)+'</span><strong>'+esc(value)+'</strong></div>';
    const button = (text,action,cls = '',attributes = '') => '<button type="button" class="v3-button '+cls+'" data-v3-action="'+esc(action)+'" '+attributes+'>'+text+'</button>';
    const card = () => G.V3Events?.card(state()?.event,language());
    const measures = () => rules.availableMeasures?.(state()) || rules.MEASURES;
    const selectedMeasure = () => {
      const id=modern()?ui().selectedMeasureId:state()?.draft.measureId;
      return id&&(measures().find(row=>row.id===id)||rules.MEASURES.find(row=>row.id===id));
    };
    const selectedDraft = () => modern()?state()?.draft.measures.find(row=>row.measureId===ui().selectedMeasureId):state()?.draft;
    const districtLabel = id => local(rules.DISTRICTS[id]?.labels) || id;
    const districtCaption = id => t('district')+' · '+districtLabel(id);
    const needsSite = () => {
      const sites=selectedMeasure()?.siteIds;
      return Boolean(sites?.length&&!sites.includes(selectedDraft()?.siteId));
    };
    const projectArt = measure => 'assets/illustrated/'+({north:'clinic',river:'barrier',industrial:'industry',capital:'digital'}[measure.districtId]||'school')+'.webp';
    const phase = project => project.status || rules.projectPhase(project,state().year);
    const phaseLabel = value => t({open:'running',foundation:'foundation',frame:'frame',finishing:'finishing',construction:'building',building:'building',closed:'closed',ended:'closed',restoring:'restoring',preparing:'approved',approved:'approved'}[value] || 'approved');
    const wasChanged = id => {
      const history=state().history;
      if(!history.length)return false;
      const current=history.at(-1).projects?.find(row=>row.id===id);
      const previous=history.at(-2)?.projects?.find(row=>row.id===id);
      return Boolean(current&&(!previous||previous.status!==current.status));
    };
    const moneyInput = (name,value,title,max) => '<label class="v3-field"><span>'+esc(title)+'</span><input inputmode="decimal" type="number" min="0" step="1" '+(Number.isFinite(max)?'max="'+max+'" ':'')+'name="'+name+'" value="'+esc(value || 0)+'"></label>';
    const picture = (src,alt,cls = '') => '<img class="'+cls+'" src="'+esc(asset(src))+'" alt="'+esc(alt)+'" decoding="async">';
    const regionalArt = 'assets/illustrated/region-cover-1024.webp';
    const v4=G.V4Planning?.create({state,quote,ui,t,local,esc,label,button,money,number,language,measures,heading,back,controller,asset,
      districtLabel,siteLabel:id=>id?local(rules.SITES.find(row=>row.id===id)?.labels||G.V4Campaign?.site(id)?.labels||
        siteData({id:'school-campus',siteIds:[id]}).find(row=>row.id===id)?.labels):''});

    const selectedProject = () => {
      const measure=selectedMeasure();
      return measure&&v4?.projectFor(measure.id);
    };
    const returnFromNegotiation = async () => {
      await storeUI({tab:ui().catalogueOrigin||ui().tab,panel:'project'});
      focusAfter='v3-heading';
      render();
    };
    const negotiation=G.V4Negotiation?.create({
      state,measure:selectedMeasure,project:selectedProject,quote,language,asset,money,
      async savePromise(promise,measureId) {
        if (controller.meta?.readOnly||!state().draft.measures.some(row=>row.measureId===measureId)) {
          throw Error('governor-v3/stale-project');
        }
        await editPortfolio(measureId,{promise});
      },
      confirm:returnFromNegotiation,back:returnFromNegotiation,
    });

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
      await storeUI({tab,panel:null,...filters,...(modern()?{programmeMapReturn:false}:{})});
      focusAfter = anchor || 'v3-heading';
      render();
    }
    function pushPanel(panel,patch = {}) {
      const current=ui();
      const destination={...patch,panel};
      if (modern()) {
        const entry=view=>({governorV3:true,attemptId:state().attemptId,year:state().year,
          route:Object.fromEntries(routeFields.map(key=>[key,view[key]??null]))});
        const origin=entry(current);
        if (JSON.stringify(history.state)!==JSON.stringify(origin)) history.replaceState(origin,'');
        history.pushState(entry({...current,...destination}),'');
      } else {
        history.pushState({governorV3:true,tab:current.tab,panel:current.panel},'');
      }
      return storeUI(destination);
    }
    function closePanel() {
      return storeUI({panel:null});
    }
    async function openMenu(fromHistory = false) {
      const current=ui(),scroll=host.querySelector('.v3-content')?.scrollTop||0;
      await storeUI({panel:'menu',sourceTab:current.tab,returnPanel:current.panel,scroll});
      if (!fromHistory) history.pushState({governorV3Menu:true},'');
      focusAfter='v3-menu-toggle';
    }
    async function closeMenu(fromHistory = false) {
      const current=ui();
      // An open menu from an older build may only have its origin in the history entry.
      const previous=history.state?.governorV3?(history.state.route||history.state):null;
      const tab=current.sourceTab||previous?.tab||current.tab;
      const panel=Object.hasOwn(current,'returnPanel')?current.returnPanel:previous?.panel??null;
      replayWelcome=0;
      await storeUI({tab,panel,sourceTab:null,returnPanel:null,scroll:null});
      scrollAfterMenu=Number.isFinite(current.scroll)?current.scroll:0;
      focusAfter='v3-menu-toggle';
      if (!fromHistory&&history.state?.governorV3Menu) {
        menuReturnPending=true;
        history.back();
      }
    }
    async function openEvent() {
      optionDraft=state().draft.eventChoice;
      await pushPanel('event',{tab:'decisions'});
      await finishStep(1);
      focusAfter='v3-heading';
    }
    async function openSites() {
      await storeUI({tab:'map',panel:'sites',districtId:selectedMeasure()?.districtId||'suburb',
        ...(modern()?{locationScope:'district',inspectedSiteId:selectedDraft()?.siteId||null,
          catalogueMode:'construction',catalogueOrigin:'map'}:{})});
      focusAfter='v3-heading';
    }
    async function openCatalogue(mode, origin, filter='all') {
      const field=mode==='programmes'?'programmeSector':'constructionDistrict';
      await pushPanel('measures',{tab:origin,catalogueMode:mode,catalogueOrigin:origin,[field]:filter});
      focusAfter='v3-heading';
    }
    function programmeDistricts(measure) {
      if(!measure)return [];
      const current=measure.projectId&&state().projects.find(project=>project.id===measure.projectId);
      return Object.keys(current?.targets||measure.serviceEffect?.targets||{[measure.districtId]:1});
    }
    function projectDistricts(project) {
      return project?Object.keys(project.targets||{[project.districtId]:1}):[];
    }
    async function learnDistrict() {
      if (needsSite()) return openSites();
      const measure=selectedMeasure();
      const fromProgramme=ui().panel==='project'&&Boolean(measure)&&v4.scope(measure)==='programmes';
      await storeUI({tab:'map',panel:null,locationScope:'region',programmeMapReturn:fromProgramme});
      focusAfter='v3-heading';
    }
    function practiceStep(current) {
      if (!current.started||!state()||state().completed||current.panel==='menu'||welcomeStep(current)) return 0;
      return current.tutorialStep<=10?current.tutorialStep:0;
    }
    function activePracticeSurface(step,{tab,panel,catalogueMode}) {
      if (panel==='negotiation') return false;
      if (step<=2) return tab==='decisions'&&(!panel||panel==='event');
      if (step===3) return tab==='decisions'&&(!panel||panel==='measures'&&catalogueMode!=='construction');
      if (step===4) return panel==='project'||tab==='map'&&(!panel||panel==='sites');
      if (step===5) return tab==='budget'&&!panel;
      if (step===6) return ['budget','stats'].includes(tab)&&!panel;
      if (step===7) return panel==='investment'||tab==='decisions'&&(!panel||panel==='measures');
      if (step===8) return panel==='review'||tab==='decisions'&&!panel;
      if (step===9) return panel==='result'||tab==='stats'&&!panel;
      return step===10&&tab==='map'&&(!panel||panel==='object');
    }
    function schoolExampleNeeded(step,current) {
      if (step===4) return !modern()&&!needsSite();
      const district=current.districtId||'suburb';
      return step===10&&district!=='suburb'&&!state().projects.some(project=>project.districtId===district);
    }
    function practiceView(step,current) {
      const {tab,panel}=current;
      const example=schoolExampleNeeded(step,current);
      const taxResult=step===6&&tab==='budget'&&!panel&&current.taxPractice;
      const reviewBlocked=step===8&&panel==='review'&&!quote().ok;
      const programmeMap=modern()&&step===4&&!needsSite();
      const coverage=programmeDistricts(selectedMeasure()).map(districtLabel).join(', ');
      const keys=['coachEvent','coachAnswer',modern()?'coachMeasures':'coachProject',example?'coachSchool':'coachSites','coachBudget',
        taxResult?'coachTaxResult':'coachStats','coachReview',reviewBlocked?'coachFixPlan':'coachConfirm','coachResults',example?'coachSchoolResult':'coachMap'];
      let action='';
      if (example) action=button(esc(t('schoolExample')),'tutorial-school','secondary');
      else {
        const sitesShown=['project','sites'].includes(panel)||!panel&&['decisions','map'].includes(tab);
        const routes={1:[tab!=='decisions'||panel,'eventOpen'],2:[panel!=='event','eventOpen'],
          3:[panel!=='measures',modern()?'toProgrammes':'toProjects'],4:programmeMap?[tab!=='map'||panel,'toMap']:[!sitesShown,'map.chooseSite'],
          5:[tab!=='budget'||panel,'budget.review'],6:[!taxResult&&!controller.schoolPractice?.()?.visible,'toStats'],
          9:[panel!=='result'&&!controller.schoolPractice?.()?.visible,'resultStats'],10:[tab!=='map'||panel,'toMap']};
        const route=routes[step];
        if (route?.[0]) action=button(esc(t(route[1])),'tutorial-next','secondary');
      }
      const fund=modern()&&step===7&&(!current.investmentViewed||current.panel==='investment');
      const portfolio=modern()&&step===7&&!fund&&!current.portfolioPracticed;
      if(fund&&current.panel!=='investment')action=button(esc(v4.tr('fundEdit')),'v4-fund','secondary');
      if(portfolio)action=button(esc(v4.tr('pick')),'measures','secondary');
      const guidance=programmeMap?(coverage?t('coachProgrammeScope',{districts:coverage}):t('coachOpenScope')):t(keys[step-1]);
      return '<aside class="v3-coach" aria-label="'+esc(t('localAdvisor'))+'">'+picture('assets/characters/ilya-avatar.webp','','')+
        '<div><strong>'+esc(t('localAdvisor'))+'</strong><p>'+
        esc(fund?v4.tr('tutorialFund'):portfolio?v4.tr('tutorialPortfolio'):guidance)+'</p>'+action+'</div></aside>';
    }
    function eventIllustration(event, detailed = false) {
      const illustration=modern()?G.V4EventMedia.get(event):controller.eventArt?.(event,language());
      if (!illustration) return '';
      const art=typeof illustration==='string'?{poster:illustration}:illustration;
      const poster=art.poster||art.src;
      const diorama=poster.match(/\/v3\/events\/(bridge-drainage|civic-tech-workshop|clean-production-line|clinic|commuter-transport|digital|family-childcare|first-job-mentoring|home-long-term-care|housing|industry|mobile-medical-unit|school)-800\.webp$/)?.[1];
      const compact=['civic-tech-workshop','clean-production-line'].includes(diorama);
      const low=['commuter-transport','mobile-medical-unit'].includes(diorama);
      const visualClass=diorama?' v4-event-diorama'+(low?' v4-event-diorama-low':compact?' v4-event-diorama-compact':''):
        /\/v4\/media\/decisions\//.test(poster)?' v4-event-portrait':'';
      const gif=modern()&&detailed?(art.gif||(art.motion==='river'?'river-flow':poster.endsWith('/school-street.webp')?'school-breeze':null)):null;
      const motion=gif?' data-v4-event-gif="'+esc(gif)+'"':detailed&&art.motion==='river'?' data-v3-motion="river"':'';
      return '<div class="v3-event-visual'+visualClass+'"'+motion+'><picture>'+
        (art.small&&asset(art.small)!==asset(poster)?'<source media="(max-width: 600px)" srcset="'+esc(asset(art.small))+'">':'')+
        picture(poster,'','v3-event-art'+(art.emblem?' v3-event-emblem':''))+'</picture></div>';
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
          visual.classList.remove('v4-event-diorama','v4-event-diorama-low','v4-event-diorama-compact','v4-event-portrait');
          image.classList.remove('v3-event-emblem');
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
        (modern()&&controller.meta?.graded?'<p>'+esc(v4.tr('journalRounding'))+'</p>':'')+
        (modern()?'<p><strong>'+esc(v4.tr('scoreChoice'))+'</strong></p><details><summary>'+esc(v4.tr('ratings'))+'</summary><p>'+esc(v4.tr('scoreHelp'))+'</p></details>':'')+
        button(esc(t(controller.meta?.canResume?'resume':'opening')),'start','primary')+
        '<button type="button" class="v3-link" data-v3-action="menu">'+esc(t('menu'))+'</button>'+
        (controller.meta?.legacyURL?'<a class="v3-link" href="'+esc(controller.meta.legacyURL)+'">'+esc(t('legacy'))+'</a>':'')+
        '<p id="offline-status" role="status" class="v3-muted"></p></section>';
    }
    function welcomeView(step) {
      const key='welcome'+step;
      const action=step<3?'welcomeNext':replayWelcome?'welcomeReturn':'welcomeStart';
      const first=modern()&&step===3?'welcome3Construction':key+'First';
      const second=modern()&&step===2?'welcome2Programmes':key+'Second';
      return '<section class="v3-card v3-welcome" data-v3-welcome="'+step+'" aria-labelledby="v3-heading">'+
        picture(regionalArt,'','v3-welcome-art')+
        '<div class="v3-welcome-copy"><div class="v3-welcome-speaker">'+picture('assets/characters/ilya-avatar.webp','')+
        '<div><strong>'+esc(t('localAdvisor'))+'</strong><small>'+esc(t('nav.advisor'))+'</small></div></div>'+
        heading(t(key+'Title'))+'<p>'+esc(t(first))+'</p><p>'+esc(t(second))+'</p>'+
        '<div class="v3-welcome-actions"><span>'+esc(t('welcomeProgress',{step}))+'</span>'+button(esc(t(action)),'welcome-next','primary')+'</div></div></section>';
    }
    function decisions() {
      const event=card(),draft=state().draft,choice=event?.options.find(row=>row.id===draft.eventChoice),measure=selectedMeasure(),project=quote()?.project;
      const major=majorSituation(state().event);
      return heading(t('nav.decisions'))+(modern()?'<p class="v3-muted">'+esc(v4.period(G.V4Campaign.chapter(state().year)))+'</p>':'')+
        '<div class="v3-decision-grid"><section class="v3-card v3-event">'+
        (event?eventIllustration(event):'')+'<div class="v3-card-body"><p class="v3-eyebrow'+(major?' v3-major-label':'')+'">'+
        esc(major?t('majorEvent')+' · '+districtLabel(major.districtId):t('event'))+'</p>'+
        '<h2>'+esc(event?.title || t('eventRequired'))+'</h2>'+ (choice?'<p class="v3-selected-copy">✓ '+esc(choice.label)+'</p>':'')+
        button(esc(t(choice?'eventChange':'eventOpen')),'event','primary','data-anchor="event.open"')+'</div></section>'+
        (modern()?v4.summary()+'</div>':
        '<section class="v3-project-summary"><h2>'+esc(t('newProject'))+'</h2><div class="v3-card v3-card-body">'+
        (measure?'<div class="v3-project-heading">'+(measure.districtId?picture(projectArt(measure),'','v3-project-thumb'):'')+'<div><h3>'+esc(local(measure.labels))+'</h3>'+
          (measure.districtId?'<p class="v3-muted">'+esc(districtCaption(measure.districtId))+'</p>':'')+'</div></div>':
          '<p>'+esc(t('projectPurpose'))+'</p>')+
        (project?label(t('budget.now'),money(project.costNow))+label(t('plannedOpen'),project.openingYear):'')+
        button(esc(t(measure?'projectChange':'choose')),'measures','link','data-anchor="measure.select"')+
        (measure&&measure.id!=='defer'?button(esc(t('details')),'project','secondary'):'')+
        (measure?.siteIds?.length?button(esc(t(draft.siteId?'siteChange':'map.chooseSite')),'sites','secondary'):'')+
        '</div></section></div>');
    }
    function eventView() {
      const event=card();
      if (!event) return heading(t('event'))+'<p role="status">'+esc(t('eventRequired'))+'</p>';
      const chosen=optionDraft ?? state().draft.eventChoice;
      const major=majorSituation(state().event), required=event.circumstance?.effects?.unavoidableExpenseMlnRub||0;
      return back('back',t('nav.decisions'))+heading(event.title)+'<section class="v3-card v3-event-detail">'+eventIllustration(event,true)+
        '<div class="v3-card-body"><p>'+esc(event.situation)+'</p>'+
        (event.circumstance?.summary?'<p>'+esc(event.circumstance.summary)+'</p>':'')+
        (major&&required?label(t('majorRequired'),money(required)):'')+
        (major?button(esc(t('majorMap')),'major-map','link','data-district-id="'+esc(major.districtId)+'"'):'')+
        (event.fallbackLocale?'<small>'+esc(t('translatedFallback'))+'</small>':'')+'</div></section>'+
        '<div class="v3-options" role="group" aria-label="'+esc(t('event'))+'" data-anchor="event.option">'+event.options.map(option=>{
          const tax=option.effects?.treasury||{},outcome=option.effects?.localOutcome||{},picked=chosen===option.id;
          const now=(tax.oneOffMlnRub||0)+(tax.firstOperatingYearOffset===0?(tax.operatingMlnRubPerYear||0):0)+(major?required:0);
          const costs=now>0||tax.operatingMlnRubPerYear>0;
          return '<button type="button" class="v3-option '+(picked?'selected':'')+'" aria-pressed="'+picked+'" data-v3-option="'+esc(option.id)+'"><strong>'+esc(option.label)+(picked?'<span aria-hidden="true">✓</span>':'')+'</strong>'+
            '<span>'+esc(option.tradeoff)+'</span>'+(costs?'<small>'+esc(major?t('majorTotalNow'):modern()?v4.tr('yearSpending'):t('budget.now'))+': '+esc(money(now))+(tax.operatingMlnRubPerYear?' · '+esc(money(tax.operatingMlnRubPerYear))+' '+esc(t('annual')):'')+'</small>':'')+
            (picked&&option.beneficiaries?'<small>'+esc(option.beneficiaries)+'</small>':'')+
            (outcome.units?'<small>'+esc(number(outcome.units))+' · '+esc(event.localIndicator?.unitLabel || '')+' · '+(state().year+(outcome.firstYearOffset||0))+'</small>':'')+'</button>';
        }).join('')+'</div>'+button(esc(t('dec.saveAnswer')),'save-event','primary full',chosen?'':'disabled');
    }
    function measuresView() {
      if(modern())return v4.catalogue();
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
    function measureIllustration(measure) {
      const scene=G.V4DecisionMedia?.get(measure.id);
      return scene?picture(scene,'','v4-measure-image'):'';
    }
    function projectView() {
      const measure=selectedMeasure(),project=quote()?.project,draft=state().draft;
      if (!measure) return measuresView();
      if(modern()){
        const row=selectedDraft();
        const offer=!row&&!measure.siteIds?.length?controller.previewMeasure(measure.id,null):null;
        const candidate=row?v4.projectFor(measure.id):offer?.project;
        const illustration=measureIllustration(measure);
        const scope=v4.scope(measure),construction=scope==='construction';
        const catalogue=scope==='programmes'?v4.tr('pick'):t(construction?'mapConstruction':'mapDistrictMeasures');
        const context='<p class="v3-eyebrow">'+esc(t(measure.sector))+'</p><p>'+esc(local(measure.description))+'</p>';
        const districts=construction?[measure.districtId]:programmeDistricts(measure);
        const continuation={renew:'renewalFee',restore:'restorationFee'}[measure.kind];
        const costKey=continuation?v4.tr(continuation):t(construction?'construction':'launchCost');
        const cost=continuation?candidate?.costNow??measure.cost:candidate?.capex??measure.cost;
        return back('catalogue-back',catalogue)+heading(local(measure.labels))+
          '<section class="v3-card v4-measure-detail">'+
          '<div class="v4-measure-intro">'+illustration+'<div class="v4-measure-copy">'+context+'</div></div>'+
          '<div class="v3-card-body v4-measure-terms">'+
          label(t('territoryReach'),districts.map(districtLabel).join(', '))+
          label(costKey,money(cost))+
          label(t('budget.annual'),money(candidate?.annualOpex??measure.annualOpex))+
          (candidate?label(v4.tr('yearSpending'),money(v4.spendingNow(candidate,offer?.finance)))+label(t('plannedOpen'),candidate.openingYear):'')+
          (!construction&&candidate?label(t('programmeYears'),candidate.openingYear+'–'+candidate.endYear)+
            label(t('programmeBalance'),money(offer?.finance.cashEnd??quote().finance.cashEnd)):'')+
          (!construction&&candidate?.projection?.districts?.some(row=>row.servedChange)?
            '<details><summary>'+esc(t('placesEstimate')+' · '+number(candidate.projection.served)+' / '+number(candidate.projection.demand))+'</summary>'+candidate.projection.districts.map(row=>
              label(districtLabel(row.districtId),number(row.before.served)+' → '+number(row.after.served)+' / '+number(row.after.demand))).join('')+'</details>':'')+
          (measure.siteIds?.length?button(esc(t(row?.siteId?'siteChange':'map.chooseSite')),'sites','primary full'):
            !row?button(esc(v4.tr('add')),'v4-add','primary full'): '')+
          (row?button(esc(v4.tr('remove')),'v4-remove','secondary full','data-measure-id="'+esc(measure.id)+'"'):'')+
          '</div></section>'+
          (row?.promise?negotiation.summarize(measure.id):'')+
          (row&&candidate?button(esc(t('negotiationOpen')),'negotiate','secondary full'):'')+
          button(esc(catalogue),'catalogue-back','secondary full');
      }
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
      if(modern()&&operation.type.startsWith('investment-'))return v4.tr({
        'investment-contribution':'fundContribution','investment-principal':'fundPrincipal','investment-income':'fundIncome'}[operation.type]||'fund');
      if(modern()&&operation.type==='mandatory'&&operation.sector)return t('locked')+' · '+t(operation.sector);
      if(modern()&&operation.eventId){
        const named=G.V3Events.eventCard(operation.eventId,language());
        if(named?.title)return named.title;
      }
      const keys={tax:'ownTax','non-tax':'nonTax',equalization:'transfers',loan:'borrowing',interest:'interest',principal:'principal',operation:'operational',capex:'construction',mandatory:'locked','reserve-draw':'budget.reserve','reserve-add':'budget.reserve',event:'event',start:'construction'};
      const projects=modern()?[...state().projects,...(quote()?.projects??[])]:state().projects;
      const project=projects.find(row=>operation.id.startsWith(row.id+':'));
      return project?local(project.labels):t(keys[operation.type] || 'spend');
    }
    function taxesView(finance,current) {
      if(modern())return v4.taxes(finance,current);
      const selected=state().draft.taxMode,trial=current.taxPractice;
      return '<section><h2>'+esc(t('budget.taxes'))+'</h2><div class="v3-segments" data-anchor="budget.tax">'+
        ['low','moderate','high'].map(id=>'<button type="button" data-v3-tax="'+id+'" aria-pressed="'+(selected===id)+'">'+esc(t('budget.tax.'+id))+'</button>').join('')+'</div>'+
        (trial&&!state().history.length?'<section class="v3-card v3-card-body v3-tax-practice" id="v3-tax-practice"><h3>'+esc(t('taxPractice'))+'</h3>'+
          '<p class="v3-muted">'+esc(t('budget.tax.'+trial.from))+' → '+esc(t('budget.tax.'+trial.to))+'</p>'+
          label(t('ownTax'),money(trial.taxesBefore)+' → '+money(trial.taxesAfter))+
          label(t('budget.remaining'),money(trial.cashBefore)+' → '+money(trial.cashAfter))+
          (selected===trial.from?'<p class="v3-muted">'+esc(t('taxRestored'))+'</p>':'')+
          (current.tutorialStep===6?button(esc(t('toStats')),'tutorial-next','primary full'):'')+
          (selected!==trial.from?button(esc(t('restoreTax')),'restore-tutorial-tax','link'):'')+'</section>'
          :current.tutorialStep===5?'<div class="v3-card v3-card-body">'+label(t('ownTax'),money(finance.taxes))+
            label(t('budget.remaining'),money(finance.cashEnd))+'</div>'
          :'<p class="v3-muted">'+esc((finance.taxDelta>=0?'+':'')+money(finance.taxDelta))+' · '+esc(t('ownTax'))+'</p>')+'</section>';
    }
    function budgetView() {
      const current=ui(),s=state(),past=s.history.find(row=>row.year===Number(current.budgetYear))||(s.completed?s.history.at(-1):null);
      const finance=past?.finance || quote().finance;
      const nearTerm=finance.futureRows.slice(0,3),later=finance.futureRows.slice(3);
      const forecastRows=rows=>rows.map(row=>label(String(row.year),money(row.cash))+
        (modern()&&row.investmentIncome?label(v4.tr('fundIncome'),money(row.investmentIncome)):'')).join('');
      const taxes=past?'':taxesView(finance,current);
      const startWithTaxes=!past&&!s.history.length&&(current.tutorialStep===5||Boolean(current.taxPractice));
      const period='<label class="v3-period"><span class="v3-sr">'+esc(t('period'))+'</span><select name="budget-year"><option value="">'+esc(t('freshYear',{year:s.year}))+'</option>'+
        s.history.map(row=>'<option value="'+row.year+'" '+(past?.year===row.year?'selected':'')+'>'+esc(t('budget.sectorActual',{year:row.year}))+'</option>').join('')+'</select></label>';
      return heading(t('nav.budget'),period)+'<div class="v3-budget-grid"><div>'+(startWithTaxes?taxes:'')+'<section class="v3-card v3-card-body v3-balance" data-anchor="budget.review">'+
        '<p class="v3-eyebrow">'+esc(t(past?'actual':'budget.remaining'))+'</p><strong class="v3-total '+(finance.cashEnd<0?'negative':'')+'">'+esc(money(finance.cashEnd))+'</strong>'+
        label(t('cashStart'),money(finance.cash))+label(t('totalIn'),money(finance.totalIn))+label(t('totalOut'),money(finance.totalOut))+
        '<details><summary>'+esc(t('disclose'))+'</summary>'+finance.operations.map(op=>label(operationName(op),(op.direction==='in'?'+':'−')+money(op.amount))).join('')+'</details></section>'+
        (startWithTaxes?'':taxes)+
        (modern()&&!past?v4.funding(finance):'')+
        (!past?'<section class="v3-card v3-card-body">'+button('<span><strong>'+esc(t('budget.loan'))+'</strong><small>'+esc(s.draft.loan?money(s.draft.loan.principal):t('noLoan'))+'</small></span><span aria-hidden="true">›</span>','loan','v3-row-button','data-anchor="budget.loan"')+
          '<details><summary>'+esc(t('budget.reserve'))+'</summary><p>'+esc(t('reserveHelp'))+'</p>'+label(t('cashStart'),money(s.finance.reserve))+
          moneyInput('reserveDraw',s.draft.reserveDraw,t('reserveTake'),s.finance.reserve)+moneyInput('reserveContribution',s.draft.reserveContribution,t('reserveAdd'))+label(t('after'),money(finance.reserveEnd))+'</details></section>':'')+
        '</div><div><h2>'+esc(t('budget.sectors'))+'</h2><section class="v3-card v3-card-body">'+
        (!past?'<details><summary>'+esc(t('sectorHelpTitle'))+'</summary><p>'+esc(t('sectorHelp'))+'</p></details>':'')+
        Object.entries(finance.sectors||{}).map(([id,sector])=>'<details class="v3-sector" data-v4-sector-id="'+esc(id)+'"'+
        (!past&&current.catalogueOrigin==='budget'&&current.programmeSector===id?' open':'')+'><summary><span>'+esc(t(id))+'</span><strong>'+esc(money(sector.total))+'</strong></summary>'+
        (sector.entries||[]).map(op=>label(operationName(op),money(op.amount))).join('')+(!past?moneyInput('sector:'+id,s.draft.sectorLimits[id]??sector.total,t('allocation')):'')+
        (!past&&modern()&&measures().some(measure=>measure.sector===id&&v4.scope(measure)==='programmes')?
          button(esc(t('sectorProgrammes')),'v4-sector-programmes','secondary','data-sector="'+esc(id)+'"'):'')+'</details>').join('')+
        label(t('interest'),money(finance.operations.filter(op=>op.type==='interest').reduce((sum,row)=>sum+row.amount,0)))+
        label(t('principal'),money(finance.operations.filter(op=>op.type==='principal').reduce((sum,row)=>sum+row.amount,0)))+'</section>'+
        (nearTerm.length?'<section class="v3-card v3-card-body" aria-labelledby="v3-future-balance"><h2 id="v3-future-balance">'+
          esc(nearTerm.length===1?t('futureBalanceYear',{year:nearTerm[0].year}):
            t('futureBalance',{from:nearTerm[0].year,to:nearTerm.at(-1).year}))+'</h2>'+
          (modern()?v4.warning(finance):'')+forecastRows(nearTerm)+
          (later.length?'<details><summary>'+esc(t(later.length===1?'futureMoreYear':'futureMore',{year:later.at(-1).year}))+
            '</summary>'+forecastRows(later)+'</details>':'')+'</section>':'')+
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
      if(modern())return rules.sitesFor(state(),measure).map(site=>({...site,...G.V4Map.sitePoint(measure.districtId,site.id,site)}));
      return rules.SITES.filter(row=>measure?.siteIds?.includes(row.id));
    }
    const mapCopy=()=>({
      zoomIn:{ru:'Приблизить карту',en:'Zoom in',zh:'放大地图'}[language()],
      zoomOut:{ru:'Отдалить карту',en:'Zoom out',zh:'缩小地图'}[language()],
      reset:{ru:'Сбросить масштаб',en:'Reset the map view',zh:'重置地图视角'}[language()],
      controls:{ru:'Масштаб карты',en:'Map zoom controls',zh:'地图缩放控件'}[language()],
      objects:t('locations'),closedRoad:{ru:'Дорога закрыта',en:'Road closed',zh:'道路已关闭'}[language()]
    });
    function majorSituation(record) {
      const identity=record?.eventId;
      return modern()&&G.V4MajorEvents?.has(identity)?G.V3Events.eventCard(identity,language()):null;
    }
    function majorMapPin(situation, position) {
      return {...position,id:situation.id,kind:'event',marker:'!',label:situation.title};
    }
    function modernMap(district,siteMode=false,historical=null) {
      const s=state(),map=G.V4Map,school=district==='suburb',chosen=selectedDraft();
      const major=majorSituation(historical?historical.event:s.event);
      const ambient=G.V4TerrainMedia.layers(district).map(layer=>({...layer,src:asset(layer.src)}));
      if(district==='all') {
        const marks={suburb:t('mapMarkSuburb'),capital:t('mapMarkCapital')};
        const pins=Object.entries(rules.DISTRICTS).map(([id,row])=>({
          id,x:row.x,y:row.y,label:districtLabel(id),kind:'district',marker:marks[id]||districtLabel(id).slice(0,1)
        }));
        if (major) {
          const {x,y}=rules.DISTRICTS[major.districtId];
          pins.push(majorMapPin(major,{x:x+.047,y:y-.065}));
        }
        return map.render({key:historical?'year:'+historical.year+':region':'region',district,image:asset(regionalArt),aspect:16/9,
          label:t('whole'),strings:mapCopy(),fit:'contain',historical:!!historical,routes:map.ambientRoads('region'),ambient,pins});
      }
      const current=historical?.projects??s.projects;
      const rows=current.filter(project=>project.siteId&&project.districtId===district),pins=[],buildings=[];
      if(major?.districtId===district) {
        const points={suburb:{x:.67,y:.43},river:{x:.58,y:.37},capital:{x:.65,y:.55}};
        pins.push(majorMapPin(major,points[district]||{x:.53,y:.44}));
      }
      const draftIds=new Set(s.draft.measures.map(row=>row.siteId).filter(Boolean));
      for(const [index,project] of rows.entries()){
        const descriptor=G.V4Campaign.measure(project.measureId)||rules.MEASURES.find(row=>row.id===project.measureId);
        const site=project.siteId&&siteData(descriptor||{id:project.measureId,districtId:district,siteIds:[project.siteId]}).find(row=>row.id===project.siteId);
        const position=site||{x:.23+(index%4)*.17,y:.63+Math.floor(index%8/4)*.16};
        const status=historical?project.status:phase(project);
        const recent=!historical&&wasChanged(project.id);
        pins.push({...position,id:project.id,label:local(project.labels)+' · '+phaseLabel(status)+(recent?' · '+v4.tr('recent'):''),
          kind:'object',status,recent,selected:ui().objectId===project.id});
        const visual=G.V4FacilityMedia.get(project.measureId,status);
        if(!visual)continue;
        const groundwork=['river','transport'].includes(visual.type);
        const displayMotion=!historical&&(status!=='open'||recent||ui().objectId===project.id);
        const animation=displayMotion&&visual.loop?{...visual.loop,src:asset(visual.loop.src)}:null;
        const width=groundwork?.17:visual.type==='school'?.28:school?.20:.21;
        buildings.push({...position,id:project.id,status,src:asset(visual.building),width,groundwork,animation});
      }
      if(school){
        for(const [id,node,name] of [['old-school','old',t('oldSchool')],['other-school','other',t('otherSchool')]]){
          pins.push({...mapPoint(node),id,label:name,kind:'object',status:'open',selected:ui().objectId===id});
        }
      }
      if(siteMode){
        siteData(selectedMeasure()).forEach((site,index)=>{
          const label=local(site.labels)||site.id;
          const occupied=current.some(row=>row.siteId===site.id)||draftIds.has(site.id)&&chosen?.siteId!==site.id;
          pins.push({...site,id:site.id,label:(occupied?label+' · '+v4.tr('occupied'):label),kind:'site',
            selected:ui().inspectedSiteId===site.id||!ui().inspectedSiteId&&chosen?.siteId===site.id,
            status:occupied?'occupied':draftIds.has(site.id)?'planned':'available',marker:site.marker||String.fromCharCode(65+index)});
        });
      }
      const districts=s.stats.districts;
      const baseImage=school?'assets/v3/district-base.webp':'assets/v4/terrain-'+district+'.webp';
      const running=new Set(current.filter(project=>projectDistricts(project).includes(district)&&phase(project)==='open').map(project=>project.measureId));
      const schoolBus=running.has('school-bus')&&s.stats.school?.transported>0;
      const medical=['mobile-units','municipal-health-contracts'].some(id=>running.has(id));
      const freight=['agro-cold-chain','county-freight-hubs','logistics-embankment'].some(id=>running.has(id));
      const vehicle=schoolBus?'bus':medical?'medical':freight?'freight':undefined;
      let closedRoads=historical?historical.stats?.school?.closedRoads||[]:s.closedRoads;
      if(school&&!historical) {
        closedRoads=closedRoads.filter(id=>(s.roadExpiry?.[id]??s.year)>=s.year);
        const impact=G.V4MajorEvents?.roadImpact(s.event,s.draft.eventChoice);
        if(impact)closedRoads=impact.open?closedRoads.filter(id=>id!==impact.id):[...new Set([...closedRoads,impact.id])];
      }
      const routes=school?map.schoolRoads({roads:s.schoolMap.roads,closedRoads,projectPoint:mapPoint,vehicle}):map.ambientRoads(district,vehicle);
      return map.render({key:historical?'year:'+historical.year+':'+district:'district:'+district,district,
        image:asset(baseImage),overlayImage:school?asset('assets/v3/old-school-layer.webp'):undefined,pins,buildings,routes,ambient,
        historical:!!historical,label:districtLabel(district)+' · '+number(districts[district]?.population),strings:mapCopy(),fit:'contain'});
    }
    function mapDistricts(district) {
      return '<div class="v4-map-districts">'+[['all',t('whole')],...Object.keys(rules.DISTRICTS).map(id=>[id,districtLabel(id)])].map(([id,title])=>
        '<button type="button" class="v3-button '+(id===district?'primary':'secondary')+'" data-v3-district="'+id+'" aria-pressed="'+(id===district)+'">'+
        esc(title)+'</button>').join('')+'</div>';
    }
    function mapWorkbench({district,inspector='',siteMode=false,historical=null,controls=true}) {
      const major=majorSituation(historical?historical.event:state().event);
      return (controls?mapDistricts(district):'')+(major&&(district==='all'||district===major.districtId)?
        '<aside class="v3-major-map-note"><div><small>'+esc(t('majorEvent')+' · '+districtLabel(major.districtId))+'</small><strong>'+esc(major.title)+'</strong></div>'+
        (historical?'':button(esc(t('eventOpen')),'event','secondary'))+'</aside>':'')+'<div class="v4-map-workspace" data-anchor="map.inspectOrPlace">'+
        modernMap(district,siteMode,historical)+inspector+'</div>';
    }
    function districtBrief(district,historical=null) {
      const area=(historical?.stats??state().stats).districts[district];
      if(!area)return '';
      const special={suburb:'childcare',river:'flood',industrial:'housing',capital:'digital'}[district];
      const relevant=['school','health','employment',...(special?[special]:[])];
      const counts=area.kpis;
      const programmes=(historical?.projects??state().projects).filter(project=>!project.siteId&&projectDistricts(project).includes(district)&&phase(project)==='open');
      return '<section class="v4-map-inspector"><h2>'+esc(districtLabel(district))+'</h2>'+
        label(v4.tr('population'),number(area.population))+'<p class="v3-muted">'+esc(v4.tr('coverage'))+'</p>'+
        relevant.map(metric=>label(t(metric==='school'?'stats.schoolAccess':metric),counts[metric].value===null?t('noDemand'):
          number(counts[metric].value,1)+'%')).join('')+
        (programmes.length?'<details><summary>'+esc(t('localProgrammes'))+' ('+number(programmes.length)+')</summary><ul class="v4-plan-list">'+programmes.map(project=>
          '<li>'+(historical?'<span>'+esc(local(project.labels))+'</span>':'<button type="button" class="v4-plan-name" data-v3-object="'+
            esc(project.id)+'">'+esc(local(project.labels))+'</button>')+'</li>').join('')+'</ul></details>':'')+
        '</section>';
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
      if(modern()) {
        const current=ui(),district=current.locationScope==='district'?current.districtId||'suburb':'all';
        const available=state().completed?[]:measures().filter(row=>district==='all'||row.districtId===district);
        const sections=new Set(available.map(v4.scope));
        const options=[['construction','mapConstruction','v4-map-construction'],['district','mapDistrictMeasures','v4-map-district-measures']]
          .filter(([name])=>sections.has(name));
        const tools=options.length?'<div class="v4-map-plan-actions">'+options.map(([,key,action])=>
          button(esc(t(key)),action,'secondary','data-district-id="'+esc(district)+'"')).join('')+'</div>':'';
        const returning=current.programmeMapReturn&&selectedMeasure()?back('project-back',t('backToProgramme')):'';
        const workbench=mapWorkbench({district,inspector:districtBrief(district)});
        return returning+heading(t('nav.map'))+(returning?workbench+tools:tools+workbench)+
          (!state().completed?v4.mapPlan(district):'')+
          (state().history.length?button(esc(t('history')),'history','secondary'):'');
      }
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
      if(modern()){
        const current=ui(),site=siteData(measure).find(row=>row.id===(current.inspectedSiteId||selectedDraft()?.siteId));
        const result=site?controller.previewMeasure(measure.id,site.id):null;
        const project=result?.project;
        const occupied=!!site&&!project&&result?.errors.some(row=>row.code==='site-occupied'||row.code==='duplicate-site');
        const kpi=result?.marginal?.kpi;
        const delta=kpi?.districts?.map(row=>label(districtLabel(row.districtId),number(row.before.served)+' → '+number(row.after.served)+
          ' / '+number(row.after.demand))).join('')||'';
        const same=selectedDraft()?.siteId===site?.id;
        const inspector='<section class="v4-map-inspector" aria-labelledby="v4-map-inspect-title"><h2 id="v4-map-inspect-title">'+
          esc(site?local(site.labels):v4.tr('noSite'))+'</h2>'+
          (occupied?'<p role="status">'+esc(v4.tr('occupied'))+'</p>':'')+
          (project?label(v4.tr('yearSpending'),money(v4.spendingNow(project,result.finance)))+label(t('construction'),money(project.capex))+
            label(t('budget.annual'),money(project.annualOpex))+label(t('plannedOpen'),project.openingYear)+
            (delta?'<h3>'+esc(v4.tr('effect'))+'</h3>'+delta:'')+label(v4.tr('yearCash'),money(result.finance.cashEnd))+
            (result.finance.cashEnd<0?'<p class="v4-money-warning">'+esc(v4.tr('shortageNow'))+'</p>':'')+
            button(esc(v4.tr(same?'selected':'add')),'accept-site','primary full','data-site-id="'+esc(site.id)+'" '+
              (same?'disabled':'')):'')+'</section>';
        return back('project-back',t('newProject'))+heading(t('map.chooseSite'))+
          mapWorkbench({district:measure.districtId,siteMode:true,inspector,controls:false});
      }
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
          label(t('bridgeRisk'),number(prospective.servedWithBridgeClosed)+' / '+number(prospective.demand))+
          label(t('schoolTrip'),prospective.meanTripMinutesServed===null?'—':number(prospective.meanTripMinutesServed,2)+' '+t('min')):
          label(t('plannedOpen'),s.year+measure.lag+selected.delay)+label(t('construction'),money(measure.cost+selected.cost))+
          label(t('budget.annual'),money(measure.annualOpex+selected.opex))+
          (prospective?.districts||[]).map(row=>label(districtLabel(row.districtId),number(row.before.served)+' → '+number(row.after.served)+' / '+number(row.after.demand))).join(''))+
        '</section>'+button(esc(occupied?t('siteRequired'):t('map.acceptSite')),'accept-site','primary full','data-site-id="'+esc(selected.id)+'" '+(occupied?'disabled':''))+'</div></div>';
    }
    function objectView() {
      const id=ui().objectId,s=state(),project=s.projects.find(row=>row.id===id),baseline=!project,school=s.stats.school?.facilities?.find(row=>row.id===(id==='other-school'?'east-school':id));
      const name=project?local(project.labels):t(id==='other-school'?'otherSchool':'oldSchool');
      const restore=measures().filter(row=>row.projectId===id);
      if(modern()){
        const serviceDistricts=projectDistricts(project),activeDistrict=ui().districtId;
        const district=serviceDistricts.includes(activeDistrict)?activeDistrict:project?.districtId||'suburb';
        const service=project?.outputs&&Object.keys(project.outputs)[0];
        const servedAs={schoolStaff:'school',healthCapacity:'health',digitalAccess:'digital',floodProtection:'flood',jobs:'employment',childcareCapacity:'childcare'};
        const kpi=s.stats.districts[district]?.kpis[servedAs[service]||({north:'health',river:'flood',industrial:'employment',capital:'digital',suburb:'school'}[district])];
        const status=project?phase(project):'open';
        const observedYear=s.history.at(-1)?.year;
        const inspector='<section class="v4-map-inspector" data-anchor="map.inspectResult"><h2>'+esc(name)+'</h2><p class="v3-muted">'+
          esc(districtCaption(district))+'</p><p class="v3-state '+esc(status)+'">'+esc(phaseLabel(status)+' · '+
            (observedYear?t('factYear',{year:observedYear}):t('baseline')))+'</p>'+
          (project?label(t('plannedOpen'),project.openingYear)+label(t('budget.annual'),money(project.annualOpex))+
            (!project.siteId?label(t('territoryReach'),serviceDistricts.map(districtLabel).join(', ')):'')+
            label(t('period'),project.openingYear+'–'+project.endYear)+(kpi&&phase(project)==='open'?
              label(t('district')+' · '+t('people'),number(kpi.served)+' / '+number(kpi.demand)):''):
            label(t('people'),number(school?.served))+label(t('demand'),number(Math.min(school?.physicalSeats,school?.staffedSeats))))+
          restore.map(row=>'<button type="button" class="v3-button primary full" data-v3-measure="'+esc(row.id)+'">'+esc(local(row.labels))+'</button>').join('')+'</section>';
        return back('back',t('nav.map'))+heading(t('nav.map'))+mapWorkbench({district,inspector});
      }
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
        const displayed=row=>{
          if(id==='school'&&controller.schoolCoverage)return controller.schoolCoverage(row);
          const value=row?.kpis?.[id]?.value;
          return Number.isFinite(value)?Math.round(value*10)/10:null;
        };
        const value=displayed(stats),baseline=displayed(previous);
        const delta=Number.isFinite(value)&&Number.isFinite(baseline)?Math.round((value-baseline)*10)/10:null;
        const metric='<div class="v3-kpi" data-v3-kpi="'+esc(id)+'"><div><strong>'+esc(title)+'</strong><small>'+esc(number(kpi.served))+' / '+esc(number(kpi.demand))+'</small></div><div><b>'+esc(value===null?t('noDemand'):number(value,1)+'%')+'</b>'+
          (Number.isFinite(delta)?'<small'+(delta?' class="'+(delta>0?'positive':'negative')+'"':'')+'>'+
            (delta>0?'+':'')+esc(number(delta,1))+' '+esc(language()==='ru'?'п.п.':language()==='zh'?'百分点':'pp')+'</small>':'')+'</div></div>';
        return id==='school'&&exercise?'<div data-v3-school-practice>'+metric+exercise+'</div>':metric;
      }).join('');
    }
    function statsView() {
      const s=state(),current=ui(),last=s.history.at(-1),row=s.history.find(row=>row.year===Number(current.statsYear))||last;
      const stats=current.statsYear==='initial'?s.initialStats:row?.stats||s.initialStats,district=current.statsDistrict||'all';
      const projection=district==='all'?stats:stats.districts[district];
      const previous=district==='all'?s.initialStats:s.initialStats.districts[district];
      const exercise=schoolExercise();
      const goals=modern()?v4.goals(G.V4Campaign.status(s)):'';
      return heading(t('nav.stats'))+(exercise?'':goals)+
        '<div class="v3-stat-filters"><label><span class="v3-sr">'+esc(t('period'))+'</span><select name="stats-year"><option value="initial" '+(current.statsYear==='initial'?'selected':'')+'>'+esc(t('baseline'))+'</option>'+
        s.history.map(entry=>'<option value="'+entry.year+'" '+((current.statsYear?Number(current.statsYear)===entry.year:last?.year===entry.year)?'selected':'')+'>'+entry.year+'</option>').join('')+'</select></label>'+
        '<label><span class="v3-sr">'+esc(t('district'))+'</span><select name="stats-district"><option value="all">'+esc(t('whole'))+'</option>'+Object.keys(rules.DISTRICTS).map(id=>'<option value="'+id+'" '+(district===id?'selected':'')+'>'+esc(districtLabel(id))+'</option>').join('')+'</select></label></div>'+
        '<p class="v3-muted">'+esc(current.statsYear==='initial'||!row?t('baseline'):t('stats.after',{year:row.year}))+'</p>'+
        '<div class="v3-stats-grid"><section class="v3-card v3-card-body" data-anchor="'+(row?'stats.actual':'stats.baseline')+'"><h2>'+esc(t('stats.kpi'))+'</h2>'+kpiRows(current.statsYear==='initial'?previous:projection,previous,exercise)+'</section>'+
        '<section class="v3-card v3-card-body"><h2>'+esc(t('stats.support'))+'</h2>'+label(t('support'),number(stats.support,1)+' / 100')+
        Object.entries(stats.groups||{}).map(([id,value])=>'<div class="v3-group"><div>'+label(t(id),number(value,1))+'</div><meter min="0" max="100" value="'+value+'" aria-label="'+esc(t(id))+'">'+value+'</meter></div>').join('')+
        '<details><summary>'+esc(t('reasons'))+'</summary>'+Object.entries(stats.groupReasons||{}).map(([id,value])=>'<p><strong>'+esc(t(id))+'</strong> '+esc(typeof value==='number'?(value>0?'+':'')+number(value,1):value?.delta!==undefined?(value.delta>0?'+':'')+number(value.delta,1):local(value))+'</p>').join('')+'</details></section></div>'+
        (exercise?goals:'')+
        ((stats.eventOutcomes||[]).length?'<section class="v3-card v3-card-body"><h2>'+esc(t('event'))+'</h2>'+stats.eventOutcomes.map(outcome=>{
          const event=G.V3Events.eventCard(outcome.eventId,language());
          return '<p><strong>'+esc(event?.title||'')+'</strong></p>'+label(event?.localIndicator.unitLabel||'',number(outcome.actualUnits??outcome.units??outcome.value));
        }).join('')+'</section>':'')+
        (modern()?v4.archive():'')+(s.history.length?button(esc(t('history')),'history','secondary full'):'');
    }
    function historyView() {
      return back('back',t('nav.stats'))+heading(t('history'))+'<div class="v3-history">'+state().history.map(row=>{
        const event=G.V3Events.eventCard(row.event?.id||row.event?.eventId,language());
        const measures=row.measures??[];
        return '<details class="v3-card v3-card-body" data-v3-history-year="'+row.year+'" '+(Number(ui().mapYear)===row.year?'open':'')+'><summary><strong>'+row.year+'</strong> '+
          esc(modern()?(measures.map(project=>local(project.labels)).slice(0,2).join(' · ')||v4.tr('empty')):local(row.measure?.labels)||t('dec.defer'))+'</summary>'+
          '<p>'+esc(event?.title||'')+'</p>'+label(t('budget.remaining'),money(row.finance.cashEnd))+label(t('support'),number(row.stats.support,1))+
          (modern()&&measures.length?v4.list(measures,{finance:row.finance}):'')+
          (Array.isArray(row.projects)?'<button type="button" class="v3-button secondary full" data-v3-history-map="'+row.year+'">'+esc(t('historyMap'))+'</button>':'')+'</details>';
      }).join('')+'</div>';
    }
    function historyMapView() {
      const row=state().history.find(entry=>entry.year===Number(ui().mapYear));
      if (!Array.isArray(row?.projects)) return historyView();
      const district=ui().districtId||'suburb',projects=row.projects.filter(project=>project.districtId===district);
      if(modern())return back('history-return',t(ui().historyMapSource==='result'?'result':'history'))+
        heading(t('factYear',{year:row.year}))+mapWorkbench({district,historical:row,inspector:districtBrief(district,row)});
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
      const sendIcon='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 3-7.2 18-3.3-7.5L3 10.2 21 3Z"/><path d="M21 3 10.5 13.5"/></svg>';
      return '<section class="v3-chat-panel" aria-labelledby="v3-heading"><header class="v3-advisor-person">'+
        picture('assets/characters/ilya-avatar.webp','','')+'<div><h1 id="v3-heading" tabindex="-1">'+esc(t('localAdvisor'))+'</h1>'+
        '<span>'+esc(t('nav.advisor'))+' · '+esc(t('advisorRole'))+'</span></div></header>'+
        '<div class="v3-conversation" role="log" tabindex="0" aria-label="'+esc(t('chatHistory'))+'"></div>'+
        '<form id="v3-chat" class="v3-composer"><label class="v3-sr" for="v3-question">'+esc(t('ask'))+'</label>'+
        '<textarea rows="1" id="v3-question" name="question" enterkeyhint="send" maxlength="1200" placeholder="'+esc(t('ask'))+'"></textarea>'+
        '<button type="submit" aria-label="'+esc(t('send'))+'" title="'+esc(t('send'))+'">'+sendIcon+'</button></form></section>';
    }
    function adviserMessages() {
      const messages=controller.advisor?.messages?.()||[];
      const question=text=>'<p class="v3-chat-question"><span class="v3-sr">'+esc(t('chatYou'))+' </span>'+esc(text)+'</p>';
      return (controller.advisor?.cloudAccount?'':'<p class="v3-chat-notice">'+esc(t('advisorGuest'))+'</p>')+
        '<p class="v3-chat-answer v3-chat-welcome">'+esc(t('chatWelcome'))+'</p>'+
        messages.map((message,index)=>question(message.question)+
          '<div class="v3-chat-answer"><span class="v3-sr">'+esc(t('localAdvisor'))+' </span><p>'+esc(message.text)+'</p>'+
          (message.target?'<button type="button" class="v3-button secondary" data-v3-advice="'+index+'">'+esc(t('advisor.show'))+'</button>':'')+
          (message.status==='unavailable'?'<button type="button" class="v3-button secondary" data-v3-advice-retry="'+index+'">'+esc(t('advisorRetry'))+'</button>':'')+'</div>').join('')+
        (chatPending?(messages.at(-1)?.question===chatPending?'':question(chatPending))+
          '<p class="v3-chat-typing" role="status"><span aria-hidden="true"><i></i><i></i><i></i></span>'+esc(t('awaiting'))+'</p>':'')+
        (chatError?'<p class="v3-chat-notice" role="alert">'+esc(chatError)+'</p>':'')+
        (!messages.length&&!chatPending?'<div class="v3-chat-suggestions">'+button(esc(t('navigation')),'ask-navigation','secondary')+
          button(esc(t('compare')),'ask-compare','secondary')+'</div>':'');
    }
    function chatAtEnd(log) {
      return log.scrollHeight-log.scrollTop-log.clientHeight<40;
    }
    function refreshComposer(field) {
      field.style.height='auto';
      field.style.height=(field.scrollHeight+2)+'px';
      field.form.querySelector('button[type="submit"]').disabled=!!chatPending||!chatDraft.trim();
    }
    function updateChatLog(log,markup,field) {
      // Keep messages already present in the live region so only new text is announced.
      const template=document.createElement('template');
      template.innerHTML=markup;
      let current=log.firstElementChild;
      for (const next of [...template.content.children]) {
        if (!current?.isEqualNode(next)) break;
        current=current.nextElementSibling;
        next.remove();
      }
      while (current) {
        const next=current.nextElementSibling;
        if (current.contains(document.activeElement)&&document.activeElement.matches(':focus-visible')) field.focus({preventScroll:true});
        current.remove();
        current=next;
      }
      log.append(template.content);
    }
    function refreshChat({reset=false,follow=false}={}) {
      const log=host.querySelector('.v3-conversation');
      const field=host.querySelector('#v3-question');
      if (!log||!field) return;
      const atEnd=follow||reset||chatAtEnd(log);
      const markup=adviserMessages();
      if (reset||chatLog!==markup) {
        updateChatLog(log,markup,field);
        chatLog=markup;
      }
      if (field.value!==chatDraft) field.value=chatDraft;
      refreshComposer(field);
      if (atEnd) log.scrollTop=log.scrollHeight;
    }
    function errorLabel(error) {
      const code=error.code;
      if(modern()){
        if(['duplicate-site','site-occupied'].includes(code))return v4.tr('occupied');
        if(code.startsWith('investment'))return v4.tr('fundLimit');
        if(['duplicate-measure','measure-unavailable','duplicate-project'].includes(code))return v4.tr('invalidPlan');
      }
      if (code==='cash-shortfall'||code==='budget-deficit'||code==='insufficient-cash') return t('shortage',{amount:money(error.amount||Math.abs(quote().finance.cashEnd))});
      const keys={'event-required':'eventRequired','measure-required':'measureRequired','site-required':'siteRequired','site-occupied':'siteRequired','invalid-site':'siteRequired','loan-limit':'loanError','reserve-unavailable':'budgetError','sector-below-commitments':'balanceError','sector-total':'balanceError','campaign-finished':'final'};
      return t(keys[code]||'budgetError');
    }
    function eventPayments(event,finance) {
      const rows=finance.operations.filter(row=>row.eventId===event.id);
      const paid=rows.filter(row=>row.direction==='out').reduce((sum,row)=>sum+row.amount,0);
      const receipts=rows.filter(row=>row.direction==='in').reduce((sum,row)=>sum+row.amount,0);
      return label(t('eventPayments'),money(paid))+(receipts?label(t('eventReimbursement'),money(receipts)):'');
    }
    function reviewView() {
      const current=quote(),event=card(),chosen=event?.options.find(row=>row.id===state().draft.eventChoice),year=state().year;
      const lessonLocked=year===2026&&ui().tutorialStep<8;
      return back('back',t('cancel'))+heading(t('freshYear',{year}))+
        (!current.ok?'<div class="v3-card v3-card-body"><h2>'+esc(t('reviewError'))+'</h2>'+current.errors.map(error=>
          '<button class="v3-error-link" type="button" data-v3-fix="'+esc(error.code)+'" data-tab="'+esc(error.tab)+
          '" data-measure-id="'+esc(error.measureId||'')+'">'+esc(errorLabel(error))+' →</button>').join('')+'</div>':'')+
        '<section class="v3-card v3-card-body"><p class="v3-eyebrow">'+esc(t('event'))+'</p><h2>'+esc(event?.title||'')+'</h2><p>'+esc(chosen?.label||t('eventRequired'))+'</p>'+
        (modern()&&chosen?eventPayments(event,current.finance):'')+
        (modern()?'<h2>'+esc(v4.tr('plan'))+'</h2>'+v4.list(current.projects,{finance:current.finance})+(negotiation?.summarize()||'')+v4.warning(current.finance)+(current.finance.investmentDraft?
          label(v4.tr('fundContribution'),money(current.finance.investmentDraft.principal))+label(v4.tr('fundMaturity'),current.finance.investmentDraft.maturityYear):''):
          '<hr><p class="v3-eyebrow">'+esc(t('newProject'))+'</p><h2>'+esc(local(selectedMeasure()?.labels)||t('measureRequired'))+'</h2>'+
          (current.project?label(t('plannedOpen'),current.project.openingYear)+label(t('budget.now'),money(current.project.costNow))+label(t('budget.annual'),money(current.project.annualOpex)):''))+
        '<hr>'+label(t('budget.remaining'),money(current.finance.cashEnd))+label(t('budget.debt'),money(current.finance.debtEnd))+label(t('budget.reserve'),money(current.finance.reserveEnd))+'</section>'+
        (modern()&&lessonLocked?'<p>'+esc(v4.tr('tutorialBeforeClose'))+'</p>'+button(esc(v4.tr('tutorialContinue')),'advance','secondary full'):'')+
        button(esc(t('confirm',{year})),'commit','primary full','data-anchor="year.commit" '+(!current.ok||busy||lessonLocked?'disabled':''))+
        (controller.handoverStatus?.()?.available?button(esc(language()==='ru'?'Передать управление':language()==='en'?'Hand over administration':'移交管理'),'handover','secondary full'):'');
    }
    function mapProgress(row) {
      const prior=new Map((state().history.at(-2)?.projects||[]).map(project=>[project.id,project.status]));
      const changed=(row.projects||[]).filter(project=>project.status&&prior.get(project.id)!==project.status);
      if (!changed.length)return '';
      return '<section class="v3-card v3-card-body"><h2>'+esc(v4.tr('mapProgress'))+'</h2>'+
        '<ul class="v4-plan-list">'+changed.map(project=>'<li><div><button type="button" class="v4-plan-name" data-v3-object="'+
          esc(project.id)+'">'+esc(local(project.labels))+'</button><small>'+esc(projectDistricts(project).length===Object.keys(rules.DISTRICTS).length?
            v4.tr('allDistrictsLocation'):projectDistricts(project).map(districtLabel).join(', '))+
          '</small></div><strong>'+esc(phaseLabel(project.status))+'</strong></li>').join('')+'</ul></section>';
    }
    function resultView() {
      const row=state().history.at(-1);
      if (!row) return decisions();
      const term=modern()?G.V4Campaign.chapter(row.year):null;
      const situation=G.V3Events.card(row.event,language());
      const outcome=situation?.options.find(option=>option.id===row.event.choice);
      const major=majorSituation(row.event);
      const delivery=major&&row.stats.eventOutcomes?.find(item=>item.eventId===major.id);
      return heading(t('result'))+'<p class="v3-year-result">'+row.year+'</p><section class="v3-card v3-card-body">'+
        (modern()?'<p class="v3-eyebrow'+(major?' v3-major-label':'')+'">'+esc(t(major?'majorEvent':'event'))+'</p><h2>'+esc(situation?.title||'')+'</h2>'+
          (outcome?'<p>'+esc(outcome.label)+'</p>':'')+
          (situation?eventPayments(situation,row.finance):'')+
          (major?(delivery?label(major.localIndicator.unitLabel,number(delivery.actualUnits)):'')+
            button(esc(t('majorMap')),'major-history-map','link','data-district-id="'+esc(major.districtId)+'"'):'')+
          '<h3>'+esc(v4.tr('plan'))+'</h3>'+v4.list(row.measures||[],{finance:row.finance}):
          '<h2>'+esc(local(row.measure?.labels)||t('dec.defer'))+'</h2>')+
        label(t('budget.remaining'),money(row.finance.cashEnd))+label(t('support'),number(row.stats.support,1)+' / 100')+
        (!modern()?(row.measure?label(t('plannedOpen'),row.measure.openingYear):'<p>'+esc(t('noBuilding'))+'</p>'):'')+'</section>'+
        (modern()?mapProgress(row):'')+
        (term?.endYear===row.year?v4.goals(G.V4Campaign.status(state(),term.number),true)+
          (!state().completed?'<p class="v3-muted">'+esc(v4.tr('nextChapter'))+'</p>':''):'')+
        (modern()&&state().projects.length?button(esc(t('returnMap')),'v4-view-last-map','secondary full'):'')+
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
        (modern()&&controller.meta?.graded?label(v4.tr('journalScore'),number(G.V4Campaign.journalPoints(result.points),0)+' / 5'):'')+
        '<p class="v3-submission" role="status">'+esc(t({sent:'sent',sending:'sending',error:'saved',offline:'saved',saved:'saved',preview:'saved'}[key]||'saved'))+'</p>'+
        (key==='error'?button(esc(t('retry')),'retry','secondary'):'')+'</section>'+
        (modern()?'<section class="v3-card v3-card-body">'+label(v4.tr('reportKpi'),number(result.paths?.kpi,2)+' / 5')+
          label(v4.tr('reportSatisfaction'),number(result.paths?.satisfaction,2)+' / 5')+'<p>'+esc(v4.tr('ratings'))+'</p></section>'+
          v4.goals(G.V4Campaign.status(state(),G.V4Campaign.chapter(state().year).number),true):'')+
        '<section class="v3-card v3-card-body">'+result.criteria.map(row=>label(local(row.label||row.title),number(row.points,2)+' / '+number(row.maxPoints,2))).join('')+'</section>'+
        button(esc(t('stats.kpi')),'stats','secondary full')+button(esc(t('history')),'history','secondary full')+
        (modern()?button(esc(v4.tr('replay')),'v4-restart','secondary full'):'')+
        button(esc(exitLabel()),'exit','primary full');
    }
    function menuView() {
      return back('back',t('menuReturn'))+heading(t('menu'))+'<section class="v3-card v3-card-body">'+
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
      const menuOpen=current.panel==='menu';
      const showWelcome=welcome&&(replayWelcome||!menuOpen);
      const step=practiceStep(current);
      const spotlight=step&&(modern()?activePracticeSurface(step,current):current.panel!=='negotiation');
      const coach=spotlight||step&&current.tab==='decisions'&&!current.panel;
      const lesson=current.tutorialStep;
      const learning=modern()&&active&&!s.history.length&&lesson>0&&(lesson<7||lesson===7&&!current.investmentViewed);
      const advanceLabel=learning?v4.tr('tutorialContinue'):t('turn.next');
      const finished=modern()&&s?.completed;
      const showChat=active&&current.tab==='advisor'&&!current.panel&&!showWelcome;
      const advance=finished?'':'<button type="button" class="v3-advance" data-v3-action="advance" data-anchor="year.review" aria-label="'+
        esc(advanceLabel)+'" '+(s?.completed?'disabled':'')+'><span aria-hidden="true">'+advanceIcon+'</span><small>'+
        esc(learning?v4.tr('tutorialShort'):advanceLabel)+'</small></button>';
      host.classList.add('governor-v3');
      host.classList.toggle('v3-large-text',!!current.largeText);
      host.classList.toggle('v3-still',current.motion==='still');
      host.dataset.v3Tab=current.tab;
      document.body.classList.toggle('governor-v3-active',active);
      const panels={event:eventView,measures:measuresView,project:projectView,sites:sitesView,object:objectView,loan:loanView,review:reviewView,
        result:resultView,history:historyView,'history-map':historyMapView,menu:menuView,investment:()=>v4.investment(investmentDraft),
        negotiation:()=>selectedProject()?negotiation.render():projectView()};
      let content;
      if (showWelcome) content=welcomeView(welcome);
      else if (menuOpen) content=menuView();
      else if (!active) content=startView();
      else if (s.completed&&['result','review'].includes(current.panel)) content=finalView();
      else if (current.panel&&panels[current.panel]) content=panels[current.panel]();
      else if (s.completed&&current.tab==='decisions') content=finalView();
      else content=({decisions,budget:budgetView,map:mapView,stats:statsView,advisor:adviserView}[current.tab]||decisions)();
      const brand='<span class="v3-emblem" aria-hidden="true">♜</span><strong>'+esc(t('subtitle'))+'</strong>';
      const shell='<header class="v3-header">'+(welcome?'<div class="v3-welcome-brand">'+brand+'</div>':'<a href="#" data-v3-action="decisions" aria-label="'+esc(t('title'))+'">'+brand+'</a>')+
        (s?'<time>'+s.year+'</time>':'')+'<button type="button" id="v3-menu-toggle" class="v3-menu-button" data-v3-action="menu" aria-label="'+esc(t(menuOpen?'menuClose':'menu'))+'" aria-expanded="'+menuOpen+'" aria-controls="v3-main">'+(menuOpen?'×':'☰')+'</button></header>'+
        '<main class="v3-content '+(showChat?'v3-chat-content':'')+'" id="v3-main">'+
        (errorText?'<div class="v3-alert" role="alert">'+esc(errorText)+button(esc(t('retry')),'retry','link')+'</div>':'')+
        (controller.meta?.readOnly?'<div class="v3-alert" role="status">'+esc(t('system.otherTab'))+'</div>':'')+
        (coach?practiceView(step,current):'')+content+'</main>'+
        (active&&!welcome?'<nav class="v3-navigation '+(finished?'v4-complete':'')+'" aria-label="'+esc(t('menu'))+'">'+navigation.map(tab=>
          '<button type="button" data-v3-tab="'+tab+'" aria-current="'+(current.tab===tab?'page':'false')+'">'+navIcon(tab)+'<span>'+esc(t('nav.'+tab))+'</span></button>').join('')+
          advance+'</nav>':'')+(spotlight?
          '<svg class="v3-coach-shade" aria-hidden="true" focusable="false"><defs><mask id="v3-coach-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">'+
          '<rect width="100%" height="100%" fill="white"/><g data-v3-coach-holes fill="black"/></mask></defs>'+
          '<rect width="100%" height="100%" mask="url(#v3-coach-mask)"/></svg>':'');
      // Keep the composer mounted during replies, including a runtime repaint when a reply is saved.
      if (showChat&&chatShell===shell&&!focusAfter) {
        refreshChat();
        return;
      }
      chatShell=showChat?shell:'';
      host.innerHTML=shell;
      if (showChat) refreshChat({reset:true});
      if (showChat||host.classList.contains('v3-keyboard-open')) viewportChanged();
      const main=host.querySelector('.v3-content');
      main.scrollTop=scrollAfterMenu??(focusAfter?0:previousScroll);
      scrollAfterMenu=null;
      if (focusAfter) {
        const target=host.querySelector('[data-anchor="'+CSS.escape(focusAfter)+'"]')||host.querySelector('#'+CSS.escape(focusAfter));
        if (target&&!target.matches('button,input,select,textarea,a,[tabindex]')) target.tabIndex=-1;
        target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});focusAfter=null;
      } else if (focusSelector) host.querySelector(focusSelector)?.focus({preventScroll:true});
      if (spotlight) {
        cancelAnimationFrame(spotlightFrame);
        tutorialTarget(step,current)?.classList.add('v3-coach-target');
        if (step===2 && current.panel==='event') host.querySelector('.v3-event-detail')?.setAttribute('data-v3-coach-context','');
        if (step===3 && current.panel==='measures') host.querySelector('.v4-catalog-filter')?.setAttribute('data-v3-coach-context','');
        drawSpotlight();
      }
    }
    function drawSpotlight() {
      spotlightFrame=0;
      const holes=host.querySelector('[data-v3-coach-holes]');
      if (!holes) return;
      const bounds=holes.ownerSVGElement.getBoundingClientRect();
      const main=host.querySelector('.v3-content'), viewport=main.getBoundingClientRect();
      const subjects=[...host.querySelectorAll('.v3-coach,.v3-coach-target,[data-v3-coach-context],#v3-menu-toggle')];
      const focused=document.activeElement;
      if (focused&&host.contains(focused)&&focused.matches(':focus-visible')) subjects.push(focused);
      holes.innerHTML=subjects.map(node=>{
        const area=node.getBoundingClientRect(), clip=main.contains(node)?viewport:bounds;
        const x=Math.max(area.left-4,clip.left)-bounds.left;
        const y=Math.max(area.top-4,clip.top)-bounds.top;
        const width=Math.min(area.right+4,clip.right)-bounds.left-x;
        const height=Math.min(area.bottom+4,clip.bottom)-bounds.top-y;
        return width>0&&height>0?'<rect x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" rx="8"/>':'';
      }).join('');
    }
    function scheduleSpotlight() {
      if (!spotlightFrame&&host.querySelector('[data-v3-coach-holes]')) spotlightFrame=requestAnimationFrame(drawSpotlight);
    }
    function tutorialTarget(step,current) {
      const {tab,panel}=current;
      const locate=selector=>host.querySelector(selector);
      const tabButton=name=>locate('[data-v3-tab="'+name+'"]');
      const route=locate('[data-v3-action="tutorial-next"]');
      if (step===1) return locate('[data-anchor="event.open"]')||route;
      if (step===2) return panel==='event'?locate(optionDraft?'[data-v3-action="save-event"]':'.v3-options'):route;
      if (step===3) return panel==='measures'?locate('.v3-measures'):route||locate('[data-anchor="measure.select"]');
      if (schoolExampleNeeded(step,current)) return locate('[data-v3-action="tutorial-school"]');
      if (step===4&&modern()&&!needsSite()) {
        const districts=programmeDistricts(selectedMeasure());
        return route||(districts.length&&locate('[data-v4-map-key] [data-v3-district="'+districts[0]+'"]'))||
          locate('.v4-map-districts')||tabButton('map');
      }
      if (step===4) return panel==='sites'?locate(current.inspectedSiteId?'[data-v3-action="accept-site"]':'.v3-site-choices'):locate('[data-v3-action="sites"]')||route;
      if (step===5) return locate('[data-anchor="budget.tax"]')||tabButton('budget');
      if (step===6||step===9) return locate('[data-v3-school-practice]')||locate('#v3-tax-practice')||locate('[data-v3-action="result-next"]')||tabButton('stats');
      if (step===7) return locate('#v4-fund-form')||locate('.v3-coach .v3-button')||locate('[data-v3-action="advance"]');
      if (step===8) return locate('[data-v3-fix]')||locate('[data-v3-action="commit"]')||locate('[data-v3-action="advance"]');
      if (step===10) return tab==='map'&&!panel?locate('.v3-map-grid .v3-measure[data-v3-object]'):tabButton('map');
      return null;
    }
    async function chooseMeasure(id) {
      if(modern()){
        if(id==='defer'){
          await storeUI({panel:null,tab:'decisions',selectedMeasureId:null,portfolioPracticed:true});
          await finishStep(3);
        }else{
          const selected=measures().find(row=>row.id===id);
          if(!selected)return;
          const current=ui();
          const mode=v4.scope(selected);
          const origin=mode!=='programmes'?'map':current.tab==='budget'?'budget':'decisions';
          await storeUI({selectedMeasureId:id,tab:origin,panel:'project',districtId:selected.districtId,inspectedSiteId:null,
            catalogueMode:mode,catalogueOrigin:origin});
          await finishStep(3);
        }
        focusAfter='v3-heading';
        return;
      }
      const measure=measures().find(row=>row.id===id);
      if (!measure) return;
      await controller.patchDraft({measureId:id,siteId:null,districtId:measure.districtId,promise:null});
      await storeUI({panel:id==='defer'?null:'project',tab:'decisions',inspectedSiteId:null,districtId:measure.districtId||ui().districtId});
      await finishStep(3);
      focusAfter='v3-heading';
    }
    async function editPortfolio(id,patch) {
      const previous=state().draft.measures,existing=previous.find(row=>row.measureId===id);
      const next=patch===null?previous.filter(row=>row.measureId!==id):
        existing?previous.map(row=>row.measureId===id?{...row,...patch}:row):
          [...previous,{measureId:id,siteId:null,promise:null,...patch}];
      await controller.patchDraft({measures:next});
      if(next.length>=2&&!ui().portfolioPracticed)await storeUI({portfolioPracticed:true});
    }
    async function submitChat(question,options) {
      const text=question.trim();
      if (!text||chatPending) return;
      const field=host.querySelector('#v3-question');
      if (field?.form.querySelector('button[type="submit"]')===document.activeElement) {
        field.focus({preventScroll:true});
      }
      if (!options) chatDraft='';
      chatPending=text;
      chatError='';
      refreshChat({follow:true});
      try {await controller.advisor.ask(text,options);}
      catch (error) {
        if (!chatDraft&&!options) chatDraft=question;
        chatError=t(error.message==='advisor/context-changed'?'advisorChanged':'unavailable');
      }
      chatPending='';
      refreshChat();
    }
    async function click(event) {
      const item=event.target.closest('button,a[data-v3-action]');
      if (!item||!host.contains(item)) return;
      if (item.matches('a')) event.preventDefault();
      const pendingTax=saveTaxRate();
      if (pendingTax) await pendingTax;
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
        await pushPanel('history-map',{mapYear:year,historyMapSource:'history'});focusAfter='v3-heading';
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
      if (item.dataset.v3District) return perform(()=>{
        const districtId=item.dataset.v3District;
        if(!modern())return storeUI({districtId});
        const districts=programmeDistricts(selectedMeasure());
        const completed=ui().tutorialStep===4&&!needsSite()&&districtId!=='all'&&(!districts.length||districts.includes(districtId));
        return storeUI({districtId:districtId==='all'?'suburb':districtId,locationScope:districtId==='all'?'region':'district',
          ...(completed?{mapPracticed:true}:{}),
          ...(ui().panel==='object'?{panel:null,objectId:null}:{})});
      });
      if (item.dataset.v3Site) return perform(()=>storeUI({inspectedSiteId:item.dataset.v3Site}));
      if (item.dataset.v3Event) return perform(()=>openEvent());
      if (item.dataset.v3Measure) return perform(()=>chooseMeasure(item.dataset.v3Measure));
      if (item.dataset.v3Object) return perform(async()=>{
        const project=state().projects.find(row=>row.id===item.dataset.v3Object);
        const contextDistrict=ui().tab==='map'&&projectDistricts(project).includes(ui().districtId)?ui().districtId:project?.districtId||'suburb';
        await storeUI({tab:'map',panel:'object',objectId:item.dataset.v3Object,districtId:contextDistrict,
          ...(modern()?{locationScope:'district',mapPracticed:true}:{})});
        if (!selectedMeasure()?.siteIds.length) await finishStep(4);
        await finishStep(10);
        focusAfter='v3-heading';
      });
      if (item.dataset.v3Fix) return perform(async()=>{
        const code=item.dataset.v3Fix;
        if (code==='event-required') {optionDraft=state().draft.eventChoice;await storeUI({tab:'decisions',panel:'event'});}
        else if (code==='measure-required') await storeUI({tab:'decisions',panel:'measures'});
        else if (code.includes('site')) {
          if(modern()&&item.dataset.measureId)await storeUI({selectedMeasureId:item.dataset.measureId});
          await openSites();
        }
        else if (modern()&&code.startsWith('investment'))await openInvestment();
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
        else if (action==='menu') {if (ui().panel==='menu') await closeMenu();else await openMenu();}
        else if (action==='welcome-replay') {replayWelcome=1;focusAfter='v3-heading';}
        else if (action==='welcome-next') {
          const step=welcomeStep(ui());
          if (!step) return;
          if (replayWelcome) replayWelcome=step<3?step+1:0;
          else await storeUI(step<3?{welcomeStep:step+1}:{welcomeStep:4,tutorialStep:1,tab:'decisions',panel:null});
          focusAfter='v3-heading';
        }
        else if (action==='back') {if (ui().panel==='menu') await closeMenu();else await closePanel();}
        else if (action==='exit') await controller.exit();
        else if (action==='retry') await controller.retry?.();
        else if (action==='event') await openEvent();
        else if (action==='major-map') {
          await storeUI({tab:'map',panel:null,districtId:item.dataset.districtId,locationScope:'district'});
          focusAfter='v3-heading';
        }
        else if (action==='major-history-map') {
          const year=state().history.at(-1)?.year;
          await pushPanel('history-map',{tab:'map',mapYear:year,historyMapSource:'result',
            districtId:item.dataset.districtId,locationScope:'district'});
          focusAfter='v3-heading';
        }
        else if (action==='save-event') {await controller.patchDraft({eventChoice:optionDraft??state().draft.eventChoice});await closePanel();await finishStep(2);optionDraft=null;focusAfter='v3-heading';}
        else if (action==='measures') {
          if(modern()) await openCatalogue('programmes','decisions');
          else {await pushPanel('measures');focusAfter='v3-heading';}
        }
        else if (action==='v4-map-construction') await openCatalogue('construction','map',item.dataset.districtId||'all');
        else if (action==='v4-map-district-measures') await openCatalogue('district','map',item.dataset.districtId||'all');
        else if (action==='v4-sector-programmes') await openCatalogue('programmes','budget',item.dataset.sector);
        else if (action==='catalogue-back') {
          const current=ui();
          await storeUI({tab:current.catalogueOrigin||current.tab,panel:'measures'});
          focusAfter='v3-heading';
        }
        else if (action==='project') await pushPanel('project');
        else if (action==='defer') await chooseMeasure('defer');
        else if (action==='project-back') {
          await storeUI({tab:ui().catalogueOrigin||'decisions',panel:'project',...(modern()?{programmeMapReturn:false}:{})});
          focusAfter='v3-heading';
        }
        else if (action==='negotiate'&&modern()) {
          const measureId=item.dataset.measureId||selectedMeasure()?.id;
          if (!measureId||!v4.projectFor(measureId)) return;
          const mode=v4.scope(measures().find(row=>row.id===measureId));
          const origin=mode==='programmes'?ui().tab==='budget'?'budget':'decisions':'map';
          await pushPanel('negotiation',{tab:origin,catalogueOrigin:origin,catalogueMode:mode,selectedMeasureId:measureId});
          focusAfter='v3-heading';
        }
        else if (action==='sites') await openSites();
        else if (action==='accept-site') {
          if(modern()){
            await editPortfolio(selectedMeasure().id,{siteId:item.dataset.siteId});
            await storeUI({mapPracticed:true,tab:'map',panel:'project'});
          }else{
            await controller.patchDraft({siteId:item.dataset.siteId});
            await storeUI({tab:'decisions',panel:'project'});
          }
          await finishStep(4);focusAfter='v3-heading';
        }
        else if (action==='restore-tutorial-tax'&&ui().taxPractice) {
          await controller.patchDraft({[modern()?'taxRate':'taxMode']:ui().taxPractice.from});focusAfter='v3-tax-practice';
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
        else if(action==='v4-add'){
          const measure=selectedMeasure();
          if(!measure||measure.siteIds?.length)return;
          await editPortfolio(measure.id,{siteId:null});
          await storeUI({tab:ui().catalogueOrigin||'decisions',panel:null});
        }
        else if(action==='v4-remove'){
          await editPortfolio(item.dataset.measureId,null);
          await storeUI({panel:null,selectedMeasureId:null});
        }
        else if(action==='v4-fund')await openInvestment();
        else if(action==='v4-save-fund'){
          if(!v4.investable(investmentDraft))return;
          await controller.patchDraft({investment:investmentDraft});
          await closePanel();
        }
        else if(action==='v4-remove-fund'){
          await controller.patchDraft({investment:null});
          await closePanel();
        }
        else if(action==='v4-view-last-map'){
          const latest=state().history.at(-1)?.measures?.[0];
          await storeUI({tab:'map',panel:latest?'object':null,locationScope:'district',
            districtId:latest?.districtId||'suburb',objectId:latest?.id||null});
        }
        else if(action==='v4-restart'){
          await controller.restart();
          focusAfter='v3-heading';
        }
        else if (action==='advance') {
          if(modern()&&!state().history.length&&ui().tutorialStep<7){
            const next=ui().tutorialStep;
            if(next<=2)await openEvent();
            else if(next===3)await openCatalogue('programmes','decisions');
            else if(next===4)await learnDistrict();
            else await navigate(next===5?'budget':'stats');
            return;
          }
          if(modern()&&!state().history.length&&ui().tutorialStep===7&&!ui().investmentViewed&&state().year<=2043){
            await openInvestment();
            return;
          }
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
          else if (step===3) {
            if(modern()) await openCatalogue('programmes','decisions');
            else {await pushPanel('measures',{tab:'decisions'});focusAfter='v3-heading';}
          }
          else if (step===4) {if(modern()) await learnDistrict();else await openSites();}
          else if (step===5) await navigate('budget');
          else if (step===6||step===9) await navigate('stats');
          else if (step===10) await navigate('map');
        }
        else if (action==='tutorial-school') {
          if (!schoolExampleNeeded(ui().tutorialStep,ui())) return;
          await pushPanel('object',{tab:'map',objectId:'old-school',
            ...(modern()?{locationScope:'district',districtId:'suburb',mapPracticed:true}:{})});
          focusAfter='v3-heading';
        }
        else if (action==='handover') {await controller.handover({revision:state().revision});await storeUI({tab:'decisions',panel:null});}
        else if (action==='result-next') {
          if (ui().tutorialStep===9) await navigate('stats');else await storeUI({panel:null,tab:'decisions'});focusAfter='v3-heading';
        }
        else if (action==='history') {
          await pushPanel('history');
          focusAfter='v3-heading';
        }
        else if (action==='history-return') {
          await storeUI(ui().historyMapSource==='result'?{tab:'decisions',panel:'result'}:{panel:'history'});
          focusAfter='v3-heading';
        }
      });
    }
    async function openInvestment() {
      const room=quote()?.finance.investmentHeadroom??0;
      investmentDraft={...(state().draft.investment??{principal:Math.min(room,1000),termYears:Math.min(3,2045-state().year)})};
      await pushPanel('investment',{tab:'budget',investmentViewed:true});
      focusAfter='v3-heading';
    }
    function saveTaxRate() {
      if (taxWrite) return taxWrite;
      const slider=host.querySelector('[name="tax-rate"]');
      if (!slider||busy||controller.meta?.readOnly) return;
      const value=Number(slider.value);
      if (value===state().draft.taxRate) return;
      taxWrite=perform(()=>controller.patchDraft({taxRate:value})).finally(()=>{taxWrite=null;});
      return taxWrite;
    }
    function finishTaxGesture(event) {
      if (event.target.name!=='tax-rate') return;
      clearTimeout(taxRelease);
      taxRelease=setTimeout(saveTaxRate,0);
    }
    function change(event) {
      const input=event.target,name=input.name;
      if (!name||name==='question') return;
      if(name.startsWith('investment-')){
        updateInvestment(input.form);
        return;
      }
      if (name==='loan-principal'||name==='loan-term') {updateLoan(input.form);return;}
      if (name==='tax-rate') return saveTaxRate();
      perform(async()=>{
        if (name==='language') await controller.setLanguage(input.value);
        else if(name==='portfolio-filter')await storeUI({portfolioFilter:input.value});
        else if(name==='programme-sector')await storeUI({programmeSector:input.value});
        else if(name==='construction-district')await storeUI({constructionDistrict:input.value});
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
    function updateInvestment(form) {
      investmentDraft={principal:Number(form.elements['investment-principal'].value),termYears:Number(form.elements['investment-term'].value)};
      host.querySelector('#v4-investment-preview').innerHTML=v4.investmentPreview(investmentDraft,true);
      host.querySelector('[data-v3-action="v4-save-fund"]').disabled=!v4.investable(investmentDraft);
    }
    function updateLoan(form) {
      loanDraft={principal:Number(form.elements['loan-principal'].value),termYears:Number(form.elements['loan-term'].value)};
      let rows=[];
      try{rows=rules.loanSchedule(loanDraft.principal,state().finance.annualPercent,loanDraft.termYears,state().year);}catch(_){}
      const target=host.querySelector('#v3-loan-schedule');
      const html=loanRows(rows);
      if(target.innerHTML!==html)target.innerHTML=html;
    }
    function input(event) {
      if (event.target.id==='v3-question') {
        chatDraft=event.target.value;
        const log=host.querySelector('.v3-conversation');
        const atEnd=log&&chatAtEnd(log);
        refreshComposer(event.target);
        if (atEnd) log.scrollTop=log.scrollHeight;
      }
      if(event.target.name==='investment-principal')updateInvestment(event.target.form);
      if(event.target.name==='loan-principal')updateLoan(event.target.form);
      if(event.target.name==='tax-rate'){
        const rate=Number(event.target.value);
        cancelAnimationFrame(taxFrame);
        taxFrame=requestAnimationFrame(()=>v4.updateTax(host,rate));
      }
    }
    function submit(event) {
      if (event.target.id==='v3-chat') {event.preventDefault();submitChat(event.target.elements.question.value);}
      if (event.target.id==='v3-loan-form'||event.target.id==='v4-fund-form') event.preventDefault();
    }
    function keydown(event) {
      if (event.target.id!=='v3-question'||event.key!=='Enter'||event.shiftKey||event.isComposing||event.keyCode===229) return;
      event.preventDefault();
      if (!event.repeat) event.target.form.requestSubmit();
    }
    function retainChatFocus(event) {
      const send=event.target.closest('#v3-chat button[type="submit"]');
      if (send?.form.elements.question===document.activeElement) event.preventDefault();
    }
    function popstate(event) {
      if (menuReturnPending) {menuReturnPending=false;return;}
      if (ui().panel==='menu') {perform(()=>closeMenu(true));return;}
      if (event.state?.governorV3Menu) {perform(()=>openMenu(true));return;}
      replayWelcome=0;
      if (event.state?.governorV3&&event.state.route) {
        if (event.state.attemptId===state()?.attemptId&&event.state.year===state().year) perform(()=>storeUI(event.state.route));
      }
      else if (event.state?.governorV3) perform(()=>storeUI({tab:event.state.tab,panel:event.state.panel}));
      else if (ui().panel) perform(()=>closePanel());
    }
    function viewportChanged() {
      const visual=window.visualViewport;
      const log=host.querySelector('.v3-conversation');
      const atEnd=log&&chatAtEnd(log);
      host.style.setProperty('--v3-height',(visual?.height||window.innerHeight)+'px');
      host.classList.toggle('v3-keyboard-open',!!log&&!!visual&&window.innerHeight-visual.height>140);
      if (atEnd) log.scrollTop=log.scrollHeight;
      scheduleSpotlight();
    }
    host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('input',input);host.addEventListener('submit',submit);host.addEventListener('keydown',keydown);
    host.addEventListener('error',imageError,true);
    for (const type of ['scroll','focusin','load','toggle']) host.addEventListener(type,scheduleSpotlight,true);
    host.addEventListener('pointerup',finishTaxGesture);
    host.addEventListener('pointerdown',retainChatFocus);
    host.addEventListener('touchend',finishTaxGesture,{passive:true});
    window.addEventListener('popstate',popstate);window.addEventListener('resize',viewportChanged);window.visualViewport?.addEventListener('resize',viewportChanged);
    negotiation?.attach(host);
    viewportChanged();render();
    return {render,navigate,destroy(){
      destroyed=true;
      negotiation?.destroy();
      cancelAnimationFrame(taxFrame);
      cancelAnimationFrame(spotlightFrame);
      clearTimeout(taxRelease);
      host.removeEventListener('pointerup',finishTaxGesture);
      host.removeEventListener('pointerdown',retainChatFocus);
      host.removeEventListener('touchend',finishTaxGesture);
      host.removeEventListener('click',click);host.removeEventListener('change',change);host.removeEventListener('input',input);host.removeEventListener('submit',submit);host.removeEventListener('keydown',keydown);
      host.removeEventListener('error',imageError,true);
      for (const type of ['scroll','focusin','load','toggle']) host.removeEventListener(type,scheduleSpotlight,true);
      window.removeEventListener('popstate',popstate);window.removeEventListener('resize',viewportChanged);window.visualViewport?.removeEventListener('resize',viewportChanged);
      document.body.classList.remove('governor-v3-active');
    }};
  }
  G.V3UI = {mount};
})(globalThis);
