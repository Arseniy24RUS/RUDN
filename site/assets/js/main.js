import {CONFIG} from './config.js?v=1.1.21';
import {backend,groupOptions} from './backend.js?v=1.1.21';
import {buildQuiz, renderQuiz, questionText} from './quiz.js?v=1.1.21';
import {getLocale, localized, setLocale, t, translateDocument} from './i18n.js?v=1.1.21';
import {mountAdaptiveSeminar1,mountAutomaticBoard} from './adaptive-quiz.js?v=1.1.21';
import {academicContext,academicWeekStart,accessDefinitions,formatAccessDate,lectureTestGate,topicGate} from './access.js?v=1.1.21';
import {mountPuzzlePage} from './puzzle-bootstrap.js?v=1.1.21';

const app = document.getElementById('app');
const authDialog = document.getElementById('authDialog');
const authForm = document.getElementById('authForm');
const profileButton = document.getElementById('profileButton');
const languageOptions = [...document.querySelectorAll('[data-lang]')];
const versionLabel = document.getElementById('versionLabel');
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const slugify = (value) => String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '');
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const UI = {
  ru: {
    dashboardTitle:'Курс и учебная траектория', currentGroup:'Текущая группа', materialsTitle:'Материалы курса', seminarAssignment:'Практическое задание', download:'Скачать', noResults:'Результатов пока нет', dashboardLead:'Восемь лекций, восемь семинаров, интерактивные задания и единый электронный журнал.',
    signInToContinue:'Войдите по номеру студенческого билета, чтобы результаты сохранялись в журнале.', login:'Войти', profileReady:'Профиль подключён',
    lectureWord:'Лекция', seminarWord:'Семинар', quizWord:'Квиз', independentWork:'Самостоятельная работа', openActivity:'Открыть', pointsOf:'баллов из', completedCount:'выполнено', perfectResult:'Максимальный результат', platinumTopic:'Все задания раздела выполнены на максимум',
    currentScore:'Текущий результат', learningPath:'Учебный маршрут', bestResult:'Лучший результат', notPassed:'не пройдено',
    continuous:'Текущий контроль', examination:'Экзамен', total:'Итого', activity:'Активность', result:'Результат', max:'Максимум', status:'Статус',
    materials:'Материалы курса', syllabus:'Рабочая программа дисциплины', examQuestions:'Вопросы к экзамену', seminar3:'Задание к семинару 3', seminar5Variants:'Варианты обращений граждан', seminar5Template:'Шаблон ответа',
    presentations:'Презентации лекций', originalPptx:'Исходный PPTX', browserPdf:'PDF для просмотра',
    profileTitle:'Профиль студента', profileHelp:'ФИО и группа подставляются по студенческому билету, если он есть в списке. ФИО и группу можно изменить в любое время.', identifier:'Студенческий билет', corporateEmail:'Корпоративный email', fullName:'ФИО', group:'Группа', recovery:'Код восстановления', editProfile:'Изменить профиль', signOutLocal:'Удалить профиль с устройства',
    save:'Сохранить', submit:'Отправить', cancel:'Отмена', cloud:'Облачная синхронизация', local:'Локальное сохранение',
    lectureMaterials:'Материалы лекции', videoLecture:'Видеолекция', presentation:'Презентация', lectureTest:'Тест по лекции', startTest:'Начать тест', noLectureTest:'Для этой лекции отдельный тест не предусмотрен.',
    reflectionTitle:'Профессиональная рефлексия', reflectionLead:'Пройдите профориентационный тест, затем зафиксируйте свой результат и выводы.', careerResult:'Полученный профиль / направление', reflection:'Краткий вывод: какие роли в государственном управлении вам подходят и почему?', externalTest:'Открыть профориентационный тест',
    seminar1Lead:'Классифицируйте органы с помощью девяти вариантов. На муниципальном уровне используются категории «Представительная», «Исполнительная» и «Иные органы».', seminar1ClassroomTitle:'Квиз · 50 вопросов', seminar1ClassroomLead:'Все 50 органов из исходного аудиторного квиза. Результат не выставляется в журнал.', launchQuiz:'Начать квиз', seminar1AssessmentTitle:'Самостоятельная работа · 5 вопросов', seminar1AssessmentLead:'Пять заданий из исходного теста. Итоговая оценка — от 0 до 5 баллов.', launchAssessment:'Начать работу', joinLive:'Открыть общую доску',
    seminar2Lead:'Соберите карту России из 89 субъектов. Выберите сложность; лучший результат сохранится в журнале.', openPuzzle:'Открыть географический конструктор',
    seminar3Lead:'Исследуйте систему расселения по интерактивному дашборду и подготовьте аналитический вывод.', openDashboard:'Открыть дашборд', territory:'Выбранная агломерация / территория', indicator:'Ключевые показатели', dynamics:'Основная динамика и пространственные различия', conclusion:'Управленческий вывод', attachment:'Презентация или тезисы (необязательно)',
    seminar4Lead:'Получите один целостный блок вопросов по конкретному нормативному правовому акту.',
    seminar5Lead:'Система закрепляет за студентом один из 30 вариантов обращения. Заполните служебную карточку и подготовьте официальный ответ гражданину.', yourVariant:'Ваш вариант', appealType:'Тип обращения', completeness:'Полнота обязательных сведений', registration:'Регистрация и первоначальное действие', deadline:'Срок рассмотрения', competentBody:'Компетентный орган', addresseeDetails:'Реквизиты адресата', officialReply:'Проект официального ответа гражданину', rubric:'Автоматическая предварительная оценка проверяет полноту карточки, сроки, компетенцию и структуру ответа. Преподаватель может уточнить итог.',
    seminar6Lead:'Пройдите официальный внешний тест, укажите результат и прикрепите скриншот.', openCivilTest:'Открыть тест госслужбы', testScore:'Результат теста (процент или балл)', screenshot:'Скриншот результата',
    seminar7Lead:'Пройдите симулятор губернатора. Платформа попытается найти итоговый KPI автоматически.', openSimulator:'Открыть симулятор', syncSimulator:'Найти мой результат', kpi:'Итоговый KPI', simulatorNotFound:'Результат не найден автоматически. Введите KPI вручную после завершения симуляции.',
    finalLead:'Итоговый тест проверяет освоение всех тем курса.',
    saved:'Результат сохранён', fillRequired:'Заполните обязательные поля', profileRequired:'Для сохранения результата сначала войдите в профиль.',
    gradebookTitle:'Электронный журнал', gradebookLead:'По каждой активности учитывается лучший результат. Максимум за курс — 100 баллов.', exportCsv:'Скачать CSV', attempts:'История попыток', date:'Дата', type:'Тип', duration:'Время',
    puzzleTitle:'Карты · свободная игра', puzzleLead:'Все режимы доступны постоянно и не зависят от расписания курса.',
    liveTitle:'Общая доска квиза', liveLead:'', sessionCode:'Код сессии', connect:'Подключиться', waiting:'Ожидаем ответы студентов…', answerSaved:'Ответ сохранён', wrongCode:'Сессия не найдена.', liveCloudOnly:'Общая доска требует доступной облачной базы Firebase.',
    teacherTitle:'Панель преподавателя', teacherLead:'Контингент, электронный журнал и общая доска аудиторного квиза.', email:'Email', password:'Пароль', teacherLogin:'Войти', teacherLogout:'Выйти', firebaseRequired:'Административный режим требует Firebase Authentication и правил доступа из каталога firebase.',
    students:'Студенты', createSession:'Открыть общую доску', activeSession:'Общая доска', noSession:'Выберите группу на общей доске', sessionLobby:'Лобби', showQuestion:'Показать вопрос', lockQuestion:'Закрыть приём', revealAnswer:'Показать ответ', nextQuestion:'Следующий вопрос', closeSession:'Завершить и выставить баллы', responses:'ответов',
    filter:'Поиск по ФИО, студенческому билету, email или группе', totalScore:'Итог', actions:'Действия', editGrades:'Оценки', manualGrade:'Ручная оценка', note:'Комментарий',
    noStudents:'В базе пока нет студентов.', exportAll:'Экспорт журнала', profileCreated:'Профиль создан.', profileUpdated:'Профиль обновлён.', confirmDelete:'Удалить локальный профиль? Облачные результаты сохранятся.',
    pagesLimitation:'GitHub Pages публикует статическое приложение. Оценивание выполняется в браузере, а журнал хранится в Firebase; для официального экзамена потребуется отдельный серверный контур.',
    practiceAuto:'Предварительный автоматический балл', manualReview:'подлежит проверке преподавателем', fileCloudOnly:'Файл можно загрузить только при активной облачной синхронизации.', chooseFile:'Выберите файл', successful:'выполнено', failed:'не выполнено',
    externalResource:'Внешний ресурс', openNewTab:'Открыть в новой вкладке', back:'Назад к курсу', noProfile:'Профиль не создан', refresh:'Обновить',
    adminQuizInstruction:'На проектор можно вывести общую доску. В режиме прохождения преподаватель отвечает вместе со студентами; группа определяется автоматически по подключившимся участникам.', quizBoardMode:'Общая доска', takeQuizMode:'Пройти квиз', teacherQuizGroup:'Группа определяется автоматически',
  },
  en: {
    dashboardTitle:'Course and learning pathway', currentGroup:'Current group', materialsTitle:'Course materials', seminarAssignment:'Practical assignment', download:'Download', noResults:'No results yet', dashboardLead:'Eight lectures, eight seminars, interactive assignments and a unified electronic gradebook.',
    signInToContinue:'Sign in with your student ID so that results can be linked to your gradebook.', login:'Sign in', profileReady:'Profile connected',
    lectureWord:'Lecture', seminarWord:'Seminar', quizWord:'Quiz', independentWork:'Independent work', openActivity:'Open', pointsOf:'points out of', completedCount:'completed', perfectResult:'Maximum result', platinumTopic:'Every activity in this section is completed with the maximum result',
    currentScore:'Current score', learningPath:'Learning pathway', bestResult:'Best result', notPassed:'not completed',
    continuous:'Continuous assessment', examination:'Examination', total:'Total', activity:'Activity', result:'Result', max:'Maximum', status:'Status',
    materials:'Course materials', syllabus:'Course syllabus', examQuestions:'Examination questions', seminar3:'Seminar 3 assignment', seminar5Variants:'Citizens’ petition cases', seminar5Template:'Response template',
    presentations:'Lecture presentations', originalPptx:'Original PPTX', browserPdf:'Browser PDF',
    profileTitle:'Student profile', profileHelp:'Your name and group are filled from the class list when your student ID is found. You can edit both fields at any time.', identifier:'Student ID', corporateEmail:'Institutional email', fullName:'Full name', group:'Group', recovery:'Recovery code', editProfile:'Edit profile', signOutLocal:'Remove profile from this device',
    save:'Save', submit:'Submit', cancel:'Cancel', cloud:'Cloud synchronization', local:'Local storage',
    lectureMaterials:'Lecture materials', videoLecture:'Video lecture', presentation:'Presentation', lectureTest:'Lecture test', startTest:'Start test', noLectureTest:'No separate test is assigned to this lecture.',
    reflectionTitle:'Professional reflection', reflectionLead:'Complete the career-guidance test and record your result and conclusions.', careerResult:'Profile / career direction obtained', reflection:'Brief conclusion: which public-administration roles suit you and why?', externalTest:'Open career-guidance test',
    seminar1Lead:'Classify public bodies using nine answer cards. At municipal level, the categories are Representative, Executive and Other bodies.', seminar1ClassroomTitle:'Quiz · 50 questions', seminar1ClassroomLead:'All 50 public bodies from the original classroom quiz. This result is not recorded in the gradebook.', launchQuiz:'Start quiz', seminar1AssessmentTitle:'Independent work · 5 questions', seminar1AssessmentLead:'Five tasks from the original assessment. The final mark ranges from 0 to 5 points.', launchAssessment:'Start assessment', joinLive:'Open shared board',
    seminar2Lead:'Assemble the map of Russia from 89 federal subjects. Choose a difficulty; your best result is saved to the gradebook.', openPuzzle:'Open Geographic Constructor',
    seminar3Lead:'Explore the settlement system using the interactive dashboard and formulate a management-oriented conclusion.', openDashboard:'Open dashboard', territory:'Selected agglomeration / territory', indicator:'Key indicators', dynamics:'Main dynamics and spatial differences', conclusion:'Management conclusion', attachment:'Presentation or notes (optional)',
    seminar4Lead:'Receive one coherent question block devoted to a particular normative legal act.',
    seminar5Lead:'The platform assigns one of 30 petition cases to each student. Complete the processing card and draft an official reply.', yourVariant:'Your case', appealType:'Type of petition', completeness:'Completeness of mandatory information', registration:'Registration and initial action', deadline:'Review deadline', competentBody:'Competent authority', addresseeDetails:'Addressee details', officialReply:'Draft official reply to the citizen', rubric:'The preliminary automated mark checks completeness, deadlines, competence and reply structure. The instructor may adjust it.',
    seminar6Lead:'Complete the official external test, record the result and upload a screenshot.', openCivilTest:'Open civil-service test', testScore:'Test result (percentage or score)', screenshot:'Result screenshot',
    seminar7Lead:'Complete the governor simulator. The platform will try to locate your final KPI automatically.', openSimulator:'Open simulator', syncSimulator:'Find my result', kpi:'Final KPI', simulatorNotFound:'The result could not be found automatically. Enter the KPI manually after completing the simulation.',
    finalLead:'The final course test covers all course themes.',
    saved:'Result saved', fillRequired:'Complete all required fields', profileRequired:'Sign in before saving a result.',
    gradebookTitle:'Electronic gradebook', gradebookLead:'The best result is retained for each activity. The course maximum is 100 points.', exportCsv:'Download CSV', attempts:'Attempt history', date:'Date', type:'Type', duration:'Time',
    puzzleTitle:'Maps · free play', puzzleLead:'Every map mode is always available and independent of the course schedule.',
    liveTitle:'Shared quiz board', liveLead:'', sessionCode:'Session code', connect:'Connect', waiting:'Waiting for student responses…', answerSaved:'Response saved', wrongCode:'Session not found.', liveCloudOnly:'The shared board requires an available Firebase cloud database.',
    teacherTitle:'Instructor panel', teacherLead:'Enrolment, the gradebook and the shared classroom quiz board.', email:'Email', password:'Password', teacherLogin:'Sign in', teacherLogout:'Sign out', firebaseRequired:'Administrative mode requires Firebase Authentication and the access rules supplied in the firebase directory.',
    students:'Students', createSession:'Open shared board', activeSession:'Shared board', noSession:'Select a group on the shared board', sessionLobby:'Lobby', showQuestion:'Show question', lockQuestion:'Lock responses', revealAnswer:'Reveal answer', nextQuestion:'Next question', closeSession:'Close and assign marks', responses:'responses',
    filter:'Search by name, student ID, email or group', totalScore:'Total', actions:'Actions', editGrades:'Grades', manualGrade:'Manual grade', note:'Comment',
    noStudents:'No students are registered yet.', exportAll:'Export gradebook', profileCreated:'Profile created.', profileUpdated:'Profile updated.', confirmDelete:'Remove the local profile? Cloud results will remain.',
    pagesLimitation:'GitHub Pages publishes a static application. Scoring runs in the browser and the gradebook is stored in Firebase; an official high-stakes examination would require a separate server-side layer.',
    practiceAuto:'Preliminary automated mark', manualReview:'subject to instructor review', fileCloudOnly:'File upload requires active cloud synchronization.', chooseFile:'Choose a file', successful:'completed', failed:'not completed',
    externalResource:'External resource', openNewTab:'Open in new tab', back:'Back to course', noProfile:'No profile created', refresh:'Refresh',
    adminQuizInstruction:'The shared board may be shown on the projector. In play mode, the instructor answers together with the students; the active group is detected automatically.', quizBoardMode:'Shared board', takeQuizMode:'Take the quiz', teacherQuizGroup:'Group detected automatically',
  },
  zh: {
    dashboardTitle:'课程与学习路径', currentGroup:'当前班级', materialsTitle:'课程资料', seminarAssignment:'实践任务', download:'下载', noResults:'暂无成绩', dashboardLead:'八次讲座、八次研讨课、互动任务和统一电子成绩册。',
    signInToContinue:'请使用学生证号登录，以便将学习成果写入成绩册。', login:'登录', profileReady:'个人资料已连接',
    lectureWord:'讲座', seminarWord:'研讨课', quizWord:'测验', independentWork:'自主作业', openActivity:'打开', pointsOf:'分（满分', completedCount:'已完成', perfectResult:'最高成绩', platinumTopic:'本章节所有活动均以最高成绩完成',
    currentScore:'当前成绩', learningPath:'学习路径', bestResult:'最佳成绩', notPassed:'未完成',
    continuous:'过程性考核', examination:'考试', total:'总分', activity:'学习活动', result:'成绩', max:'满分', status:'状态',
    materials:'课程资料', syllabus:'课程教学大纲', examQuestions:'考试问题', seminar3:'研讨课3任务', seminar5Variants:'公民来信案例', seminar5Template:'答复模板',
    presentations:'讲座演示文稿', originalPptx:'原始PPTX', browserPdf:'浏览器PDF',
    profileTitle:'学生个人资料', profileHelp:'若学生证号在名单中，姓名和班级会自动填写。姓名和班级可随时修改。', identifier:'学生证号', corporateEmail:'学校邮箱', fullName:'姓名', group:'班级', recovery:'恢复码', editProfile:'修改资料', signOutLocal:'从本设备删除资料',
    save:'保存', submit:'提交', cancel:'取消', cloud:'云端同步', local:'本地保存',
    lectureMaterials:'讲座资料', videoLecture:'视频讲座', presentation:'演示文稿', lectureTest:'讲座测验', startTest:'开始测验', noLectureTest:'本讲座不设单独测验。',
    reflectionTitle:'职业反思', reflectionLead:'完成职业指导测试，并记录结果与个人结论。', careerResult:'获得的职业类型 / 方向', reflection:'简要说明：哪些公共管理岗位更适合你，为什么？', externalTest:'打开职业指导测试',
    seminar1Lead:'使用九个选项卡对公共机关进行分类。市政层级采用代表、行政和其他机关三类。', seminar1ClassroomTitle:'测验 · 50题', seminar1ClassroomLead:'包含原课堂测验中的全部50个机关，不计入成绩册。', launchQuiz:'开始测验', seminar1AssessmentTitle:'自主作业 · 5题', seminar1AssessmentLead:'包含原考核中的5道题，最终成绩为0至5分。', launchAssessment:'开始作业', joinLive:'打开共享大屏',
    seminar2Lead:'用89个联邦主体拼合俄罗斯地图。选择难度，最佳成绩将保存到成绩册。', openPuzzle:'打开地理拼图构造器',
    seminar3Lead:'使用互动数据看板研究居民点体系，并提出管理结论。', openDashboard:'打开数据看板', territory:'所选城市群 / 地区', indicator:'关键指标', dynamics:'主要变化与空间差异', conclusion:'管理结论', attachment:'演示文稿或提纲（可选）',
    seminar4Lead:'系统将发放一个围绕特定规范性法律文件的完整题组。',
    seminar5Lead:'系统为每位学生固定分配30个公民来信案例之一。请填写办理卡并起草正式答复。', yourVariant:'你的案例', appealType:'来信类型', completeness:'必备信息完整性', registration:'登记与初始处理', deadline:'办理期限', competentBody:'主管机关', addresseeDetails:'收件人信息', officialReply:'致公民的正式答复草案', rubric:'自动初评检查资料完整性、期限、职权归属和答复结构；教师可调整最终成绩。',
    seminar6Lead:'完成外部官方测试，填写结果并上传截图。', openCivilTest:'打开公务员测试', testScore:'测试结果（百分比或分数）', screenshot:'成绩截图',
    seminar7Lead:'完成行政长官模拟器；平台将尝试自动查找最终KPI。', openSimulator:'打开模拟器', syncSimulator:'查找我的结果', kpi:'最终KPI', simulatorNotFound:'未能自动找到结果。完成模拟后可手动输入KPI。',
    finalLead:'课程期末测验覆盖全部主题。',
    saved:'结果已保存', fillRequired:'请填写必填项', profileRequired:'保存结果前请先登录。',
    gradebookTitle:'电子成绩册', gradebookLead:'每项活动保留最佳成绩，课程总分上限为100分。', exportCsv:'下载CSV', attempts:'作答记录', date:'日期', type:'类型', duration:'用时',
    puzzleTitle:'地图 · 自由游戏', puzzleLead:'所有地图模式始终开放，不受课程时间表限制。',
    liveTitle:'测验共享大屏', liveLead:'', sessionCode:'会话代码', connect:'连接', waiting:'正在等待学生作答……', answerSaved:'答案已保存', wrongCode:'未找到会话。', liveCloudOnly:'共享大屏需要可用的Firebase云数据库。',
    teacherTitle:'教师控制台', teacherLead:'学生信息、电子成绩册与课堂测验共享大屏。', email:'邮箱', password:'密码', teacherLogin:'登录', teacherLogout:'退出', firebaseRequired:'管理模式需要启用Firebase Authentication，并应用firebase目录中的访问规则。',
    students:'学生', createSession:'打开共享大屏', activeSession:'共享大屏', noSession:'请在共享大屏选择班级', sessionLobby:'等候室', showQuestion:'显示题目', lockQuestion:'停止作答', revealAnswer:'揭晓答案', nextQuestion:'下一题', closeSession:'结束并计分', responses:'份回答',
    filter:'按姓名、学生证号、邮箱或班级搜索', totalScore:'总分', actions:'操作', editGrades:'成绩', manualGrade:'手动评分', note:'备注',
    noStudents:'目前尚无学生登记。', exportAll:'导出成绩册', profileCreated:'个人资料已创建。', profileUpdated:'个人资料已更新。', confirmDelete:'从本设备删除个人资料？云端成绩仍会保留。',
    pagesLimitation:'GitHub Pages发布静态应用。评分在浏览器中执行，成绩册保存在Firebase中；正式高风险考试仍需独立的服务器端系统。',
    practiceAuto:'自动初评分', manualReview:'需教师复核', fileCloudOnly:'仅在云端同步可用时才能上传文件。', chooseFile:'选择文件', successful:'已完成', failed:'未完成',
    externalResource:'外部资源', openNewTab:'在新标签页打开', back:'返回课程', noProfile:'尚未创建个人资料', refresh:'刷新',
    adminQuizInstruction:'可在投影仪上显示共享大屏。在答题模式中，教师与学生一起作答；系统会根据已加入的学生自动识别班级。', quizBoardMode:'共享大屏', takeQuizMode:'参加测验', teacherQuizGroup:'自动识别班级',
  }
};

const ACCESS_COPY={
  ru:{
    scheduleTitle:'Доступ к разделам',scheduleLead:'Курс открывается поэтапно по серверному времени. Первая учебная неделя — неделя, в которой находится 1 сентября; следующая тема открывается через две недели.',
    academicYear:'Учебный год',currentWeek:'Текущая учебная неделя',topic:'Тема',lectureTest:'Тест по лекции',week:'Неделя',automatic:'Авто',forceOpen:'Открыть',forceClosed:'Закрыть',
    automaticOpen:'Открыто по расписанию',manualOpen:'Открыто преподавателем',manualClosed:'Закрыто преподавателем',locked:'Закрыто',
    lockedUntil:'Откроется с {week}-й учебной недели — {date}',teacherPreview:'Преподавателю доступен предварительный просмотр.',accessSaved:'Доступ обновлён для всех студентов'
  },
  en:{
    scheduleTitle:'Section access',scheduleLead:'The course opens gradually using Firebase server time. Week 1 is the week containing 1 September; each next topic opens two weeks later.',
    academicYear:'Academic year',currentWeek:'Current teaching week',topic:'Topic',lectureTest:'Lecture test',week:'Week',automatic:'Auto',forceOpen:'Open',forceClosed:'Close',
    automaticOpen:'Open on schedule',manualOpen:'Opened by instructor',manualClosed:'Closed by instructor',locked:'Locked',
    lockedUntil:'Opens in teaching week {week} — {date}',teacherPreview:'Preview remains available to the instructor.',accessSaved:'Access updated for all students'
  },
  zh:{
    scheduleTitle:'章节开放设置',scheduleLead:'课程按Firebase服务器时间逐步开放。包含9月1日的一周为第1教学周，此后每两周开放一个新主题。',
    academicYear:'学年',currentWeek:'当前教学周',topic:'主题',lectureTest:'讲座测验',week:'第',automatic:'自动',forceOpen:'开放',forceClosed:'关闭',
    automaticOpen:'已按计划开放',manualOpen:'教师已开放',manualClosed:'教师已关闭',locked:'尚未开放',
    lockedUntil:'第{week}教学周开放 — {date}',teacherPreview:'教师仍可预览。',accessSaved:'已为所有学生更新访问权限'
  }
};

function ui(key){ return UI[getLocale()]?.[key] ?? UI.ru[key] ?? key; }
function accessText(key,params={}){let value=ACCESS_COPY[getLocale()]?.[key]??ACCESS_COPY.ru[key]??key;for(const [name,replacement] of Object.entries(params))value=value.replaceAll(`{${name}}`,String(replacement));return value}
function loc(obj,key,fallback=''){ return localized(obj,key,fallback); }
function presentationPdf(lecture){const locale=getLocale();return lecture?.[`presentation_pdf_${locale}`]||lecture?.presentation_pdf||''}
function accessSnapshot(){const now=backend.globalNow();const context=academicContext(now);return {now,context,overrides:backend.getAccessOverrides(context.startYear)}}
function accessAllowed(gate){return backend.isAdmin()||Boolean(gate?.open)}
function gateStatus(gate){
  if(gate.override==='open')return accessText('manualOpen');
  if(gate.override==='closed')return accessText('manualClosed');
  if(gate.open)return accessText('automaticOpen');
  return accessText('lockedUntil',{week:gate.week,date:formatAccessDate(gate.opensAt,getLocale())});
}
function lockedAccessPage(title,gate){
  app.innerHTML=contentPage(title,gateStatus(gate),`<div class="panel access-lock-panel"><div class="access-lock-icon">⌛</div><h2>${accessText('locked')}</h2><p>${esc(gateStatus(gate))}</p><a class="btn btn-neutral" href="#dashboard">← ${ui('back')}</a></div>`);
}
function quizAccessGate(activitySlug,snapshot=accessSnapshot()){
  const lecture=String(activitySlug).match(/^lecture-(\d+)$/);if(lecture)return lectureTestGate(Number(lecture[1]),snapshot.overrides,snapshot.now);
  const seminar=String(activitySlug).match(/^seminar-(\d+)/);if(seminar)return topicGate(Number(seminar[1]),snapshot.overrides,snapshot.now);
  return null;
}
function route(){
  const raw=(location.hash||'#dashboard').slice(1);
  const [name,...parts]=raw.split('/');
  return {name:name||'dashboard',parts};
}
function formatDate(value){
  if(!value) return '—';
  try{return new Intl.DateTimeFormat(getLocale()==='zh'?'zh-CN':getLocale()==='en'?'en-GB':'ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{return String(value)}
}
function formatDuration(ms){const total=Math.max(0,Math.round(number(ms)/1000));const m=Math.floor(total/60);const s=total%60;return `${m}:${String(s).padStart(2,'0')}`}
function toast(message,type='info',timeout=3800){
  const stack=document.getElementById('toastStack');
  const node=document.createElement('div');node.className=`toast ${type}`;node.textContent=message;stack.append(node);
  setTimeout(()=>node.remove(),timeout);
}
window.addEventListener('rudn:toast',(event)=>toast(event.detail?.message||'',event.detail?.type||'info'));

let data={course:null,questions:[],variants:[],exam:[],media:{},symbols:{}};
let currentCleanup=null;
let accessRefreshTimer=null;

function scheduleAccessRefresh(){
  clearTimeout(accessRefreshTimer);
  if(!data.course?.topics?.length)return;
  const access=accessSnapshot();
  const next=[academicWeekStart(access.context.startYear+1),...accessDefinitions(data.course.topics,access.overrides,access.now).map(item=>item.gate.opensAt)]
    .filter(timestamp=>timestamp>access.now).sort((a,b)=>a-b)[0];
  if(!next)return;
  accessRefreshTimer=setTimeout(()=>{
    if(app.querySelector('#quizMount'))scheduleAccessRefresh();
    else render();
  },Math.min(next-access.now+1000,2147483000));
}

async function loadJson(path,fallback){
  const response=await fetch(path,{cache:'no-store'});
  if(!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
async function loadData(){
  const [course,questions,variants,exam,media,symbols]=await Promise.all([
    loadJson('data/course.json',{}),loadJson('data/questions.json',[]),loadJson('data/seminar5_variants.json',[]),
    loadJson('data/exam_questions.json',[]),loadJson('data/question_media.json',{}),loadJson('data/symbol_manifest.json',{})
  ]);
  data={course,questions,variants,exam,media,symbols};
  window.RUDN_DATA=data;
}

function setActiveNav(name){
  const normal=name==='activity'?'dashboard':name;
  document.querySelectorAll('[data-route]').forEach(link=>link.classList.toggle('active',link.dataset.route===normal));
}
function updateTopProfile(){
  if(backend.isAdmin()){
    document.getElementById('topAvatar').textContent='A';
    document.getElementById('topName').textContent=backend.user.email;
    document.getElementById('topGroup').textContent=ui('teacherTitle');
    return;
  }
  const profile=backend.getProfile();
  document.getElementById('topAvatar').textContent=profile?.fullName?.trim()?.[0]||'?';
  document.getElementById('topName').textContent=profile?.fullName||t('signIn');
  document.getElementById('topGroup').textContent=profile?`${profile.group} · ${profile.ticket}`:'';
}
function updateSync(status){
  updateTopProfile();
}
function requireProfile({open=true}={}){
  if(backend.getProfile())return true;
  if(open)openAuthDialog();
  toast(ui('profileRequired'),'error');return false;
}
function contentPage(title,lead,body,actions=''){
  return `<section class="page"><header class="page-head"><div><h1>${esc(title)}</h1>${lead?`<p>${esc(lead)}</p>`:''}</div>${actions?`<div class="page-actions">${actions}</div>`:''}</header>${body}</section>`;
}
function activityHeader(item,kind,preview){
  const grade=backend.localGrades()[item.slug];
  return `<div class="activity-header">${preview?`<img src="${esc(preview)}" alt="">`:''}<div><span class="badge">${esc(kind)}</span><h1>${esc(loc(item,'title',item.title))}</h1><div class="activity-meta"><span class="badge success">${ui('max')}: ${esc(String(item.points))}</span><span class="badge dark">${ui('result')}: ${grade?`${number(grade.points)}/5`:`${ui('notPassed')}`}</span></div></div></div>`;
}
function externalCard(title,description,url,button=ui('openNewTab')){
  return `<div class="panel external-card"><div><span class="badge">${ui('externalResource')}</span><h2>${esc(title)}</h2><p class="muted">${esc(description||'')}</p></div><a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(button)} ↗</a></div>`;
}

async function render(){
  if(currentCleanup){try{currentCleanup()}catch{} currentCleanup=null}
  const r=route();setActiveNav(r.name);
  app.setAttribute('aria-busy','true');
  try{
    if(r.name==='dashboard') await renderDashboard();
    else if(r.name==='gradebook') await renderGradebook();
    else if(r.name==='materials') renderMaterials();
    else if(r.name==='profile') renderProfile();
    else if(r.name==='live'){location.hash='activity/seminar-1-classroom';return}
    else if(r.name==='puzzle') await renderPuzzleRoute();
    else if(r.name==='admin') await renderAdmin();
    else if(r.name==='activity') await renderActivity(r.parts[0]);
    else location.hash='dashboard';
  }catch(error){console.error(error);app.innerHTML=contentPage(t('error'),String(error?.message||error),`<div class="panel notice danger">${esc(String(error?.stack||error))}</div>`);}
  app.setAttribute('aria-busy','false');app.focus({preventScroll:true});translateDocument(app);
  scheduleAccessRefresh();
}

function bestCourseQuizAttempt(attempts=[]){
  return attempts.filter(item=>item.activitySlug==='seminar-1-classroom').reduce((best,item)=>!best||number(item.points)>number(best.points)?item:best,null);
}
function isPerfectResult(result,max){return Boolean(result)&&number(result.points)>=Number(max)}
function courseResult(result,max){
  const perfect=isPerfectResult(result,max);const value=result?`${number(result.points)}/${max}`:`—/${max}`;
  return `${esc(value)}${perfect?` <span class="achievement-star" role="img" aria-label="${esc(ui('perfectResult'))}" title="${esc(ui('perfectResult'))}">★</span>`:''}`;
}
async function renderDashboard(){
  const profile=backend.getProfile();
  const [grades,attempts]=profile?await Promise.all([backend.getGrades(),backend.getAttempts()]):[{},[]];
  const classroomBest=bestCourseQuizAttempt(attempts);
  const total=Object.values(grades).reduce((sum,g)=>sum+number(g.points),0);
  const coursework=data.course.topics.flatMap(x=>[x.lecture.slug,x.seminar.slug]).reduce((sum,slug)=>sum+number(grades[slug]?.points),0);
  const completed=data.course.topics.flatMap(x=>[x.lecture.slug,x.seminar.slug]).filter(slug=>number(grades[slug]?.points)>0).length;
  const access=accessSnapshot();
  const topics=data.course.topics.map(topic=>{
    const lecture=topic.lecture,seminar=topic.seminar;const gate=topicGate(topic.number,access.overrides,access.now);const allowed=accessAllowed(gate);
    const action=(slug)=>allowed?`<a class="btn btn-secondary btn-small" href="#activity/${slug}">${ui('openActivity')}</a>`:`<span class="btn btn-neutral btn-small access-disabled" aria-disabled="true">${accessText('locked')}</span>`;
    const activities=topic.number===1?[
      {kind:ui('lectureWord'),title:loc(lecture,'title',lecture.title),route:lecture.slug,result:grades[lecture.slug],max:5},
      {kind:ui('quizWord'),title:ui('seminar1ClassroomTitle'),route:'seminar-1-classroom',result:classroomBest,max:50},
      {kind:ui('independentWork'),title:ui('seminar1AssessmentTitle'),route:'seminar-1-assessment',result:grades[seminar.slug],max:5}
    ]:[
      {kind:ui('lectureWord'),title:loc(lecture,'title',lecture.title),route:lecture.slug,result:grades[lecture.slug],max:5},
      {kind:ui('seminarWord'),title:loc(seminar,'title',seminar.title),route:seminar.slug,result:grades[seminar.slug],max:5}
    ];
    const perfect=activities.every(item=>isPerfectResult(item.result,item.max));
    const activityCards=activities.map(item=>`<div class="activity-mini ${allowed?'':'access-locked'}"><div><span class="kind">${esc(item.kind)}</span><strong>${esc(item.title)}</strong></div><footer><span class="grade">${courseResult(item.result,item.max)}</span>${action(item.route)}</footer></div>`).join('');
    return `<article class="topic-card ${allowed?'':'access-locked'} ${perfect?'topic-perfect':''}" ${perfect?`aria-label="${esc(ui('platinumTopic'))}"`:''}><div class="topic-no"><strong>${String(topic.number).padStart(2,'0')}</strong></div><div class="topic-copy"><div class="access-status ${gate.open?'open':'closed'}">${esc(gateStatus(gate))}</div><h2>${esc(loc(topic,'title',topic.title))}</h2><p>${esc(loc(topic,'summary',topic.summary))}</p></div><div class="activity-pair ${activities.length===3?'activity-trio':''}">${activityCards}</div></article>`;
  }).join('');
  app.innerHTML=`<section class="page"><div class="hero"><div class="hero-grid"><div><h1>${esc(loc(data.course,'title',data.course.title))}</h1><p>${esc(ui('dashboardLead'))}</p><div class="hero-meta"><span>${esc(data.course.programme)}</span><span>${accessText('academicYear')} ${access.context.startYear}/${access.context.endYear}</span><span>${accessText('currentWeek')}: ${access.context.week}</span><span>${profile?`${esc(profile.fullName)} · ${esc(profile.group)}`:ui('signInToContinue')}</span></div>${!profile?`<div style="margin-top:18px"><button class="btn btn-neutral" id="heroLogin">${ui('login')}</button></div>`:''}</div><div class="score-ring" style="--progress:${Math.min(100,total)}%"><strong>${total}</strong><span>/ 100 · ${ui('currentScore')}</span></div></div></div><div class="stats-grid"><div class="stat-card"><span>${ui('continuous')}</span><strong>${coursework}/80</strong><small>${completed}/16 ${ui('completedCount')}</small></div><div class="stat-card"><span>${ui('examination')}</span><strong>${number(grades.exam?.points)}/20</strong><small>${grades.exam?ui('completedCount'):ui('notPassed')}</small></div><div class="stat-card"><span>${ui('currentGroup')}</span><strong>${esc(profile?.group||'—')}</strong><small>${esc(profile?.ticket||ui('noProfile'))}</small></div><div class="stat-card"><span>${ui('fullName')}</span><strong>${esc(profile?.fullName||'—')}</strong><small>${esc(profile?.ticket||ui('noProfile'))}</small></div></div><header class="page-head"><div><h1>${ui('learningPath')}</h1><p>${accessText('scheduleLead')}</p></div></header><div class="topic-list">${topics}</div></section>`;
  app.querySelector('#heroLogin')?.addEventListener('click',openAuthDialog);
}

const gradeItems=()=>[
  ...data.course.topics.flatMap(topic=>[
    {slug:topic.lecture.slug,title:loc(topic.lecture,'title',topic.lecture.title),max:5,kind:ui('lectureWord')},
    {slug:topic.seminar.slug,title:loc(topic.seminar,'title',topic.seminar.title),max:5,kind:ui('seminarWord')}
  ]),
  {slug:'exam',title:ui('examination'),max:20,kind:ui('examination')}
];
async function renderGradebook(){
  const profile=backend.getProfile();const grades=await backend.getGrades();const attempts=await backend.getAttempts();const items=gradeItems();
  const total=items.reduce((sum,item)=>sum+number(grades[item.slug]?.points),0);
  const rows=items.map(item=>{const g=grades[item.slug];return`<tr><td><strong>${esc(item.title)}</strong><br><small class="muted">${esc(item.kind)}</small></td><td>${g?`<span class="grade-good">${number(g.points)}</span>`:'<span class="grade-empty">—</span>'}</td><td>${item.max}</td><td>${g?`${Math.round(number(g.points)/item.max*100)}%`:'—'}</td><td>${g?formatDate(g.updatedAt):'—'}</td></tr>`}).join('');
  const attemptRows=attempts.filter(x=>x.recordGrade!==false).slice(0,40).map(x=>`<tr><td>${esc(x.title||x.activitySlug||x.type)}</td><td>${esc(x.type||'—')}</td><td>${number(x.points)}/${number(x.maxPoints||CONFIG.activityMax[x.activitySlug]||5)}</td><td>${formatDuration(x.durationMs)}</td><td>${formatDate(x.createdAt)}</td></tr>`).join('');
  const body=!profile?`<div class="panel empty-state"><div class="icon">◎</div><p>${ui('signInToContinue')}</p><button class="btn btn-primary" id="gradeLogin">${ui('login')}</button></div>`:`<div class="stats-grid"><div class="stat-card"><span>${ui('total')}</span><strong>${total}/100</strong></div><div class="stat-card"><span>${ui('continuous')}</span><strong>${Math.min(80,total-number(grades.exam?.points))}/80</strong></div><div class="stat-card"><span>${ui('examination')}</span><strong>${number(grades.exam?.points)}/20</strong></div><div class="stat-card"><span>${ui('completedCount')}</span><strong>${items.filter(i=>number(grades[i.slug]?.points)>0).length}/17</strong></div></div><div class="page-actions" style="margin-bottom:14px"><button class="btn btn-primary" id="exportPersonal">${ui('exportCsv')}</button><button class="btn btn-neutral" id="refreshGrades">${ui('refresh')}</button></div><div class="gradebook-wrap"><table class="gradebook"><thead><tr><th>${ui('activity')}</th><th>${ui('result')}</th><th>${ui('max')}</th><th>%</th><th>${ui('date')}</th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel" style="margin-top:18px"><h2>${ui('attempts')}</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>${ui('activity')}</th><th>${ui('type')}</th><th>${ui('result')}</th><th>${ui('duration')}</th><th>${ui('date')}</th></tr></thead><tbody>${attemptRows||`<tr><td colspan="5">${ui('noResults')}</td></tr>`}</tbody></table></div></div>`;
  app.innerHTML=contentPage(ui('gradebookTitle'),ui('gradebookLead'),body);
  app.querySelector('#gradeLogin')?.addEventListener('click',openAuthDialog);
  app.querySelector('#refreshGrades')?.addEventListener('click',render);
  app.querySelector('#exportPersonal')?.addEventListener('click',()=>downloadCsv(`gradebook-${profile.ticket}.csv`,[
    ['student_id','full_name','email','group',...items.map(x=>x.slug),'total'],
    [profile.ticket,profile.fullName,profile.email,profile.group,...items.map(x=>number(grades[x.slug]?.points)),total]
  ]));
}

function renderMaterials(){
  const access=accessSnapshot();const gate=(number)=>topicGate(number,access.overrides,access.now);
  const cards=[
    {title:ui('syllabus'),text:data.course.programme,url:data.course.documents.rpd,kind:'PDF'},
    {title:ui('examQuestions'),text:loc(data.course,'title',data.course.title),url:data.course.documents.exam_questions,kind:'DOCX'}
  ];
  const docs=cards.map(card=>{const allowed=!card.gate||accessAllowed(card.gate);return`<article class="material-card ${allowed?'':'access-locked'}"><div class="body"><span class="badge">${card.kind}</span>${card.gate?`<span class="access-status ${card.gate.open?'open':'closed'}">${esc(gateStatus(card.gate))}</span>`:''}<h3>${esc(card.title)}</h3><p>${esc(card.text||'')}</p><div class="material-actions">${allowed?`<a class="btn btn-secondary btn-small" href="${esc(card.url)}" target="_blank">${ui('download')}</a>`:`<span class="btn btn-neutral btn-small access-disabled">${accessText('locked')}</span>`}</div></div></article>`}).join('');
  const presentations=data.course.topics.map(topic=>{const itemGate=gate(topic.number),allowed=accessAllowed(itemGate);return`<article class="material-card ${allowed?'':'access-locked'}"><img src="${esc(topic.lecture.preview)}" alt=""><div class="body"><span class="badge">${ui('lectureWord')} ${topic.number}</span><span class="access-status ${itemGate.open?'open':'closed'}">${esc(gateStatus(itemGate))}</span><h3>${esc(loc(topic,'title',topic.title))}</h3><div class="material-actions">${allowed?`<a class="btn btn-secondary btn-small" href="${esc(presentationPdf(topic.lecture))}" target="_blank">${ui('browserPdf')}</a><a class="btn btn-neutral btn-small" href="${esc(topic.lecture.presentation_pptx)}">${ui('originalPptx')}</a>`:`<span class="btn btn-neutral btn-small access-disabled">${accessText('locked')}</span>`}</div></div></article>`}).join('');
  app.innerHTML=contentPage(ui('materialsTitle'),t('materialsLead'),`<div class="material-grid">${docs}</div><header class="page-head subsection"><div><h1>${ui('presentations')}</h1></div></header><div class="material-grid">${presentations}</div>`);
}

function renderProfile(){
  const p=backend.getProfile();
  const body=p?`<div class="panel"><h2>${ui('profileReady')}</h2><dl class="profile-dl"><dt>${ui('fullName')}</dt><dd>${esc(p.fullName)}</dd><dt>${ui('identifier')}</dt><dd>${esc(p.ticket)}</dd><dt>${ui('corporateEmail')}</dt><dd>${esc(p.email)}</dd><dt>${ui('group')}</dt><dd>${esc(p.group)}</dd></dl><div class="page-actions"><button class="btn btn-primary" id="editProfile">${ui('editProfile')}</button><button class="btn btn-danger" id="removeProfile">${ui('signOutLocal')}</button></div></div>`:`<div class="panel empty-state"><div class="icon">◎</div><h2>${ui('noProfile')}</h2><p>${ui('signInToContinue')}</p><button class="btn btn-primary" id="profileLogin">${ui('login')}</button></div>`;
  app.innerHTML=contentPage(ui('profileTitle'),ui('profileHelp'),body);
  app.querySelector('#profileLogin')?.addEventListener('click',openAuthDialog);
  app.querySelector('#editProfile')?.addEventListener('click',openAuthDialog);
  app.querySelector('#removeProfile')?.addEventListener('click',()=>{if(confirm(ui('confirmDelete'))){backend.clearLocalProfile();render()}});
}
async function renderActivity(slug){
  if(slug==='seminar-1'){location.hash='activity/seminar-1-classroom';return}
  if(slug==='seminar-1-classroom'||slug==='seminar-1-assessment'){await startQuiz(slug);return}
  const topic=data.course.topics.find(x=>x.lecture.slug===slug||x.seminar.slug===slug);
  if(!topic){location.hash='dashboard';return}
  const access=accessSnapshot();const gate=topicGate(topic.number,access.overrides,access.now);
  if(!accessAllowed(gate)){lockedAccessPage(loc(topic,'title',topic.title),gate);return}
  if(topic.lecture.slug===slug)renderLecture(topic);
  else await renderSeminar(topic);
}
function renderLecture(topic){
  const lecture=topic.lecture;const n=topic.number;const currentPresentation=presentationPdf(lecture);
  const testAvailable=n<=7;
  const access=accessSnapshot();const testGate=testAvailable?lectureTestGate(n,access.overrides,access.now):null;const testAllowed=testGate&&accessAllowed(testGate);
  const testPanel=testAvailable?(testAllowed?`<div class="panel"><span class="access-status ${testGate.open?'open':'closed'}">${esc(gateStatus(testGate))}</span><h2>${ui('lectureTest')}</h2><p class="muted">${esc(loc(topic,'summary',topic.summary))}</p>${backend.isAdmin()&&!testGate.open?`<p class="notice warning">${accessText('teacherPreview')}</p>`:''}<button class="btn btn-primary" id="launchLectureTest">${ui('startTest')}</button></div>`:`<div class="panel access-locked"><span class="access-status closed">${esc(gateStatus(testGate))}</span><h2>${ui('lectureTest')}</h2><p class="muted">${esc(loc(topic,'summary',topic.summary))}</p><button class="btn btn-neutral" type="button" disabled>${accessText('locked')}</button></div>`):`<div class="panel"><h2>${ui('reflectionTitle')}</h2><p class="muted">${ui('reflectionLead')}</p><div class="page-actions"><a class="btn btn-secondary" href="${esc(data.course.external_apps.career_guidance)}" target="_blank" rel="noopener">${ui('externalTest')} ↗</a></div><form id="reflectionForm" class="form-grid" style="margin-top:18px"><label class="full"><span>${ui('careerResult')}</span><input name="result" required></label><label class="full"><span>${ui('reflection')}</span><textarea name="reflection" required minlength="120"></textarea></label><div class="full"><button class="btn btn-primary" type="submit">${ui('submit')}</button></div></form></div>`;
  app.innerHTML=`<section class="page"><div class="page-actions" style="margin-bottom:12px"><a class="btn btn-neutral btn-small" href="#dashboard">← ${ui('back')}</a></div>${activityHeader(lecture,`${ui('lectureWord')} ${n}`,lecture.preview)}<div class="panel"><div class="tabs" role="tablist"><button class="tab active" data-video-platform="vk">VK Видео</button><button class="tab" data-video-platform="youtube">YouTube</button><button class="tab" data-video-platform="presentation">${ui('presentation')}</button></div><div id="lectureContent"><iframe class="video-frame" src="${esc(lecture.vk_embed)}" title="${esc(loc(lecture,'title',lecture.title))}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div><div class="page-actions" style="margin-top:14px"><a class="btn btn-neutral btn-small" href="${esc(lecture.vk_link)}" target="_blank">VK ↗</a><a class="btn btn-neutral btn-small" href="${esc(lecture.youtube_link)}" target="_blank">YouTube ↗</a><a class="btn btn-secondary btn-small" href="${esc(currentPresentation)}" target="_blank">PDF</a><a class="btn btn-neutral btn-small" href="${esc(lecture.presentation_pptx)}">PPTX</a></div></div>${testPanel}</section>`;
  app.querySelectorAll('[data-video-platform]').forEach(btn=>btn.addEventListener('click',()=>{
    app.querySelectorAll('[data-video-platform]').forEach(x=>x.classList.toggle('active',x===btn));
    const kind=btn.dataset.videoPlatform;const container=app.querySelector('#lectureContent');
    if(kind==='youtube')container.innerHTML=`<iframe class="video-frame" src="${esc(lecture.youtube_embed)}" title="YouTube" allowfullscreen></iframe>`;
    else if(kind==='vk')container.innerHTML=`<iframe class="video-frame" src="${esc(lecture.vk_embed)}" title="VK Видео" allowfullscreen></iframe>`;
    else container.innerHTML=`<iframe class="doc-frame" src="${esc(currentPresentation)}" title="${ui('presentation')}"></iframe>`;
  }));
  app.querySelector('#launchLectureTest')?.addEventListener('click',()=>startQuiz(lecture.slug));
  app.querySelector('#reflectionForm')?.addEventListener('submit',async event=>{
    event.preventDefault();if(!requireProfile())return;
    const form=new FormData(event.currentTarget);const reflection=String(form.get('reflection')||'').trim();
    const result=String(form.get('result')||'').trim();if(reflection.length<120||!result){toast(ui('fillRequired'),'error');return}
    await backend.saveAttempt({type:'reflection',activitySlug:'lecture-8',title:loc(lecture,'title',lecture.title),points:5,maxPoints:5,result,reflection});toast(ui('saved'),'success');render();
  });
}

async function renderSeminar(topic){
  const seminar=topic.seminar,n=topic.number;
  if(n===2) return renderPuzzleRoute(true);
  if(n===3) return renderSeminar3(topic);
  if(n===4) return renderSeminar4(topic);
  if(n===5) return renderSeminar5(topic);
  if(n===6) return renderSeminar6(topic);
  if(n===7) return renderSeminar7(topic);
  if(n===8) return renderSeminar8(topic);
}
function seminarShell(topic,body){return `<section class="page"><div class="page-actions" style="margin-bottom:12px"><a class="btn btn-neutral btn-small" href="#dashboard">← ${ui('back')}</a></div>${activityHeader(topic.seminar,`${ui('seminarWord')} ${topic.number}`,topic.number===2?'assets/course/previews/seminar_02_puzzle.png':topic.number===3?'assets/course/previews/seminar_03_dashboard.png':topic.number===7?'assets/course/previews/seminar_07_simulator.jpg':topic.lecture.preview)}${body}</section>`}
function renderSeminar4(topic){
  app.innerHTML=seminarShell(topic,`<div class="panel"><h2>${esc(loc(topic.seminar,'title',topic.seminar.title))}</h2><p class="muted">${ui('seminar4Lead')}</p><button class="btn btn-primary" id="seminar4Quiz">${ui('launchQuiz')}</button></div>`);
  app.querySelector('#seminar4Quiz').onclick=()=>startQuiz('seminar-4');
}
function renderSeminar8(topic){
  app.innerHTML=seminarShell(topic,`<div class="panel"><h2>${esc(loc(topic.seminar,'title',topic.seminar.title))}</h2><p class="muted">${ui('finalLead')}</p><button class="btn btn-primary" id="finalQuiz">${ui('startTest')}</button></div>`);
  app.querySelector('#finalQuiz').onclick=()=>startQuiz('seminar-8');
}
async function startQuiz(activitySlug){
  const gate=quizAccessGate(activitySlug);
  if(gate&&!accessAllowed(gate)){lockedAccessPage(activitySlug,gate);return}
  const classroom=activitySlug==='seminar-1-classroom';
  if(!(classroom&&backend.isAdmin())&&!requireProfile())return;
  app.innerHTML=`<section class="page"><div id="quizMount"></div></section>`;
  const mount=app.querySelector('#quizMount');
  const returnTo=(target)=>{const hash=`#${target}`;if(location.hash===hash)render();else location.hash=target};
  if(activitySlug==='seminar-1-classroom'){
    if(backend.isAdmin()){
      let selectedGroup='';
      mount.insertAdjacentHTML('beforebegin',`<div class="page-actions" style="margin-bottom:12px"><a class="btn btn-neutral btn-small" href="#dashboard">← ${ui('back')}</a></div><header class="page-head"><div><h1>${ui('seminar1ClassroomTitle')}</h1><p>${ui('adminQuizInstruction')}</p></div></header><div class="admin-quiz-mode" role="group" aria-label="${esc(ui('seminar1ClassroomTitle'))}"><button class="btn btn-primary" type="button" data-admin-quiz-mode="board">${ui('quizBoardMode')}</button><button class="btn btn-neutral" type="button" data-admin-quiz-mode="play">${ui('takeQuizMode')}</button></div>`);
      const controls=app.querySelector('.admin-quiz-mode');let activeCleanup=()=>{};let disposed=false;
      const setMode=(mode)=>controls.querySelectorAll('[data-admin-quiz-mode]').forEach(button=>{const active=button.dataset.adminQuizMode===mode;button.classList.toggle('btn-primary',active);button.classList.toggle('btn-neutral',!active);button.setAttribute('aria-pressed',String(active))});
      const showBoard=()=>{
        if(disposed)return;try{activeCleanup()}catch{};mount.innerHTML='';setMode('board');
        activeCleanup=mountAutomaticBoard(mount,{initialGroup:selectedGroup,onGroupChange:group=>{selectedGroup=group}});
      };
      const showQuiz=async()=>{
        if(disposed)return;try{activeCleanup()}catch{};mount.innerHTML='';setMode('play');
        activeCleanup=await mountAdaptiveSeminar1(mount,{group:selectedGroup,recordAttempt:false,participateLive:false,onExit:showBoard});
      };
      controls.querySelector('[data-admin-quiz-mode="board"]').onclick=showBoard;
      controls.querySelector('[data-admin-quiz-mode="play"]').onclick=()=>showQuiz().catch(error=>toast(String(error.message||error),'error'));
      currentCleanup=()=>{disposed=true;try{activeCleanup()}catch{}};
      showBoard();
      return;
    }
    currentCleanup=await mountAdaptiveSeminar1(mount,{onExit:()=>returnTo('dashboard')});
    return;
  }
  const assessment=activitySlug==='seminar-1-assessment';
  const session=buildQuiz(data.questions,assessment?'seminar-1':activitySlug,backend.getProfile(),assessment?{mode:'assessment'}:{});
  renderQuiz(mount,session,{onExit:()=>returnTo(assessment?'dashboard':`activity/${activitySlug}`)});
}
function renderSeminar3(topic){
  app.innerHTML=seminarShell(topic,`${externalCard(ui('openDashboard'),ui('seminar3Lead'),data.course.external_apps.settlement_dashboard,ui('openDashboard'))}<div class="panel"><h2>${ui('seminarAssignment')}</h2><form id="settlementForm" class="form-grid"><label><span>${ui('territory')}</span><input name="territory" required></label><label><span>${ui('indicator')}</span><input name="indicators" required></label><label class="full"><span>${ui('dynamics')}</span><textarea name="dynamics" required minlength="180"></textarea></label><label class="full"><span>${ui('conclusion')}</span><textarea name="conclusion" required minlength="180"></textarea></label><label class="full"><span>${ui('attachment')}</span><input type="file" name="file" accept=".pdf,.ppt,.pptx,.doc,.docx"></label><div class="full"><button class="btn btn-primary" type="submit">${ui('submit')}</button></div></form></div>`);
  app.querySelector('#settlementForm').onsubmit=async event=>{
    event.preventDefault();if(!requireProfile())return;const form=new FormData(event.currentTarget);
    const territory=String(form.get('territory')||'').trim(),indicators=String(form.get('indicators')||'').trim(),dynamics=String(form.get('dynamics')||'').trim(),conclusion=String(form.get('conclusion')||'').trim();
    if(!territory||!indicators||dynamics.length<180||conclusion.length<180){toast(ui('fillRequired'),'error');return}
    let fileUrl='';const file=form.get('file');if(file instanceof File&&file.size){try{fileUrl=await backend.uploadFile('seminar-3',file)}catch(error){toast(error.message,'error')}}
    const points=Math.min(5,(territory?1:0)+(indicators?1:0)+(dynamics.length>=180?1:0)+(conclusion.length>=180?1:0)+(dynamics.length+conclusion.length>=600||fileUrl?1:0));
    await backend.saveAttempt({type:'settlement-analysis',activitySlug:'seminar-3',title:loc(topic.seminar,'title'),points,maxPoints:5,territory,indicators,dynamics,conclusion,fileUrl,reviewStatus:'pending'});toast(`${ui('saved')} · ${ui('practiceAuto')}: ${points}/5`,'success');render();
  };
}
function stableVariant(){const p=backend.getProfile();if(!p)return data.variants[0];let h=0;for(const c of p.studentKey)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return data.variants[h%data.variants.length]}
function renderSeminar5(topic){
  const v=stableVariant();
  const caseText=[`${ui('yourVariant')} №${v.number}`,`${v.directed_to}`,`${v.citizen_name}; ${v.citizen_address}; ${v.contacts}`,`${v.sent_at} / ${v.received_at} / ${v.registered_at}`,v.appeal_text].join('\n\n');
  app.innerHTML=seminarShell(topic,`<div class="panel"><h2>${ui('yourVariant')} №${v.number}</h2><div class="submission-case">${esc(caseText)}</div></div><div class="panel"><p class="notice">${ui('seminar5Lead')}</p><form id="appealForm" class="form-grid"><label><span>${ui('appealType')}</span><select name="appealType" required><option value="">—</option><option>Заявление / Application / 申请</option><option>Жалоба / Complaint / 投诉</option><option>Предложение / Proposal / 建议</option></select></label><label><span>${ui('completeness')}</span><input name="completeness" required></label><label><span>${ui('registration')}</span><input name="registration" required></label><label><span>${ui('deadline')}</span><input name="deadline" required></label><label><span>${ui('competentBody')}</span><input name="competentBody" required></label><label><span>${ui('addresseeDetails')}</span><input name="details" required></label><label class="full"><span>${ui('officialReply')}</span><textarea name="reply" required minlength="500"></textarea></label><label class="full"><span>${ui('attachment')}</span><input type="file" name="file" accept=".pdf,.doc,.docx"></label><div class="full"><p class="form-hint">${ui('rubric')}</p><button class="btn btn-primary" type="submit">${ui('submit')}</button></div></form></div>`);
  app.querySelector('#appealForm').onsubmit=async event=>{
    event.preventDefault();if(!requireProfile())return;const fd=new FormData(event.currentTarget);const values=Object.fromEntries([...fd.entries()].filter(([k,v])=>!(v instanceof File)));
    const reply=String(values.reply||'').trim();if(Object.values(values).some(v=>!String(v).trim())||reply.length<500){toast(ui('fillRequired'),'error');return}
    const combined=Object.values(values).join(' ').toLowerCase();let points=0;
    if(values.appealType&&values.completeness)points+=1;
    if(values.registration&&/(3|тр[её]х|three|三)/i.test(values.registration))points+=1;else if(values.registration)points+=.5;
    if(values.deadline&&/(30|тридцат|thirty|三十)/i.test(values.deadline))points+=1;else if(values.deadline)points+=.5;
    if(values.competentBody&&values.details)points+=1;
    if(reply.length>=500&&/(59[-–— ]?фз|федеральн|federal law|联邦法|уважаем|dear|尊敬)/i.test(combined))points+=1;else if(reply.length>=500)points+=.5;
    points=Math.min(5,Math.round(points*2)/2);
    let fileUrl='';const file=fd.get('file');if(file instanceof File&&file.size){try{fileUrl=await backend.uploadFile('seminar-5',file)}catch(error){toast(error.message,'error')}}
    await backend.saveAttempt({type:'citizen-appeal',activitySlug:'seminar-5',title:loc(topic.seminar,'title'),points,maxPoints:5,variant:v.number,case:v,answers:values,fileUrl,reviewStatus:'pending'});toast(`${ui('saved')} · ${ui('practiceAuto')}: ${points}/5`,'success');render();
  };
}
function renderSeminar6(topic){
  app.innerHTML=seminarShell(topic,`${externalCard(ui('openCivilTest'),ui('seminar6Lead'),data.course.external_apps.civil_service_test,ui('openCivilTest'))}<div class="panel"><form id="civilForm" class="form-grid"><label><span>${ui('testScore')}</span><input name="score" required></label><label><span>${ui('screenshot')}</span><input name="file" type="file" accept="image/*,.pdf" required></label><div class="full"><button class="btn btn-primary" type="submit">${ui('submit')}</button></div></form></div>`);
  app.querySelector('#civilForm').onsubmit=async event=>{
    event.preventDefault();if(!requireProfile())return;const fd=new FormData(event.currentTarget);const score=String(fd.get('score')||'').trim();const file=fd.get('file');if(!score||!(file instanceof File)||!file.size){toast(ui('fillRequired'),'error');return}
    let fileUrl='';try{fileUrl=await backend.uploadFile('seminar-6',file)}catch(error){toast(error.message,'error');return}
    await backend.saveAttempt({type:'external-test-proof',activitySlug:'seminar-6',title:loc(topic.seminar,'title'),points:5,maxPoints:5,reportedScore:score,fileUrl,reviewStatus:'pending'});toast(`${ui('saved')} · 5/5 (${ui('manualReview')})`,'success');render();
  };
}
function flattenObjects(value,out=[]){if(Array.isArray(value))value.forEach(x=>flattenObjects(x,out));else if(value&&typeof value==='object'){if(value.fio||value.fullName||value.name||value.group||value.kpi||value.finalKpi||value.KPI)out.push(value);Object.values(value).forEach(x=>flattenObjects(x,out))}return out}
function nameNorm(s){return String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim()}
function simulatorPoints(kpi){const x=number(kpi);return x>=85?5:x>=70?4:x>=55?3:0}
function renderSeminar7(topic){
  app.innerHTML=seminarShell(topic,`${externalCard(ui('openSimulator'),ui('seminar7Lead'),data.course.external_apps.governor_simulator,ui('openSimulator'))}<div class="panel"><div class="page-actions"><button class="btn btn-primary" id="syncSimulator">${ui('syncSimulator')}</button></div><form id="simulatorForm" class="form-grid" style="margin-top:16px"><label><span>${ui('kpi')}</span><input name="kpi" type="number" min="0" max="100" step="0.01" required></label><label><span>${ui('screenshot')}</span><input name="file" type="file" accept="image/*,.pdf"></label><div class="full"><button class="btn btn-secondary" type="submit">${ui('submit')}</button></div></form><p class="form-hint" id="simulatorStatus"></p></div>`);
  app.querySelector('#syncSimulator').onclick=async()=>{
    if(!requireProfile())return;const status=app.querySelector('#simulatorStatus');status.textContent=t('loading');
    try{const response=await fetch(CONFIG.simulatorResultsUrl,{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);const objects=flattenObjects(await response.json());const p=backend.getProfile();const targetName=nameNorm(p.fullName),targetGroup=nameNorm(p.group);
      const matches=objects.filter(x=>{const n=nameNorm(x.fio||x.fullName||x.name||x.studentName),g=nameNorm(x.group||x.groupNumber||x.studentGroup);return n&&n===targetName&&(!g||!targetGroup||g===targetGroup)});
      matches.sort((a,b)=>String(b.completedAt||b.date||b.timestamp||'').localeCompare(String(a.completedAt||a.date||a.timestamp||'')));
      const found=matches[0];if(!found)throw new Error(ui('simulatorNotFound'));const kpi=number(found.kpi??found.finalKpi??found.KPI??found.final_kpi??found.result?.kpi);if(!Number.isFinite(kpi))throw new Error(ui('simulatorNotFound'));
      app.querySelector('[name="kpi"]').value=kpi;const points=simulatorPoints(kpi);await backend.saveAttempt({type:'governor-simulator',activitySlug:'seminar-7',title:loc(topic.seminar,'title'),points,maxPoints:5,kpi,source:'firebase-import',sourceRecord:found});status.textContent=`${ui('saved')}: KPI ${kpi} → ${points}/5`;toast(status.textContent,'success');
    }catch(error){status.textContent=String(error.message||error);toast(status.textContent,'error')}
  };
  app.querySelector('#simulatorForm').onsubmit=async event=>{
    event.preventDefault();if(!requireProfile())return;const fd=new FormData(event.currentTarget);const kpi=number(fd.get('kpi'));if(kpi<0||kpi>100){toast(ui('fillRequired'),'error');return}let fileUrl='';const file=fd.get('file');if(file instanceof File&&file.size){try{fileUrl=await backend.uploadFile('seminar-7',file)}catch(error){toast(error.message,'error')}}const points=simulatorPoints(kpi);await backend.saveAttempt({type:'governor-simulator',activitySlug:'seminar-7',title:loc(topic.seminar,'title'),points,maxPoints:5,kpi,fileUrl,source:'manual',reviewStatus:'pending'});toast(`${ui('saved')}: ${points}/5`,'success');render();
  };
}
let puzzleFragmentPromise=null;
async function getPuzzleFragment(){
  if(!puzzleFragmentPromise)puzzleFragmentPromise=fetch('apps/puzzle.html',{cache:'no-store'}).then(async response=>{
    if(!response.ok)throw new Error(`apps/puzzle.html: HTTP ${response.status}`);
    const documentCopy=new DOMParser().parseFromString(await response.text(),'text/html');
    const main=documentCopy.querySelector('.puzzle-page-main');
    const toastNode=documentCopy.getElementById('puzzleToast');
    const resultDialog=documentCopy.getElementById('puzzleResultDialog');
    if(!main||!toastNode||!resultDialog)throw new Error('Puzzle component markup is incomplete.');
    return `${main.innerHTML}${toastNode.outerHTML}${resultDialog.outerHTML}`;
  });
  return puzzleFragmentPromise;
}
async function renderPuzzleRoute(asSeminar=false){
  if(asSeminar){
    const access=accessSnapshot(),gate=topicGate(2,access.overrides,access.now);
    if(!accessAllowed(gate)){lockedAccessPage(ui('puzzleTitle'),gate);return}
  }
  const context=asSeminar?'seminar':'free';
  app.innerHTML=`<section class="page puzzle-native-page" data-puzzle-route="${context}">${await getPuzzleFragment()}</section>`;
  app.querySelector('.puzzle-profile-warning a')?.setAttribute('href','#profile');
  app.querySelector('#puzzleResultBack')?.setAttribute('href',asSeminar?'#activity/seminar-2':'#puzzle');
  const root=app.querySelector('#geoPuzzleApp');
  root.dataset.native='true';
  currentCleanup=await mountPuzzlePage({context,base:'assets/puzzle/data',legacyBase:'data'});
}

async function renderAdmin(){
  if(!backend.isAdmin()){
    app.innerHTML=contentPage(ui('teacherTitle'),ui('teacherLead'),`<div class="panel admin-login"><div class="notice warning">${ui('firebaseRequired')}</div><form id="adminLogin" class="form-grid" style="margin-top:18px"><label class="full"><span>${ui('email')}</span><input name="email" type="email" value="${esc(CONFIG.adminEmails[0])}" required></label><label class="full"><span>${ui('password')}</span><input name="password" type="password" required></label><div class="full"><button class="btn btn-primary btn-wide">${ui('teacherLogin')}</button></div></form></div>`);
    app.querySelector('#adminLogin').onsubmit=async event=>{event.preventDefault();const fd=new FormData(event.currentTarget);try{await backend.adminSignIn(fd.get('email'),fd.get('password'));toast(ui('profileReady'),'success');render()}catch(error){toast(String(error.message||error),'error')}};return;
  }
  let all;try{all=await backend.adminAll()}catch(error){app.innerHTML=contentPage(ui('teacherTitle'),ui('teacherLead'),`<div class="notice danger">${esc(error.message)}</div>`);return}
  const access=accessSnapshot();
  const accessRows=accessDefinitions(data.course.topics,access.overrides,access.now).map(item=>{
    const topic=data.course.topics.find(entry=>Number(entry.number)===Number(item.number));
    const title=item.kind==='topic'
      ?`${accessText('topic')} ${item.number} · ${loc(topic,'title',topic?.title||'')}`
      :`${accessText('lectureTest')} ${item.number} · ${loc(topic?.lecture,'title',topic?.lecture?.title||'')}`;
    const automatic=`${accessText('week')} ${item.gate.week} · ${formatAccessDate(item.gate.opensAt,getLocale())}`;
    return `<div class="access-admin-row"><div class="access-admin-copy"><strong>${esc(title)}</strong><small>${esc(automatic)}</small><span class="access-status ${item.gate.open?'open':'closed'}">${esc(gateStatus(item.gate))}</span></div><div class="access-mode" role="group" aria-label="${esc(title)}"><button type="button" class="${item.gate.override==='auto'?'active auto':''}" data-access-key="${esc(item.gate.key)}" data-access-state="auto">${accessText('automatic')}</button><button type="button" class="${item.gate.override==='open'?'active open':''}" data-access-key="${esc(item.gate.key)}" data-access-state="open">${accessText('forceOpen')}</button><button type="button" class="${item.gate.override==='closed'?'active closed':''}" data-access-key="${esc(item.gate.key)}" data-access-state="closed">${accessText('forceClosed')}</button></div></div>`;
  }).join('');
  const items=gradeItems();const profiles=Object.values(all.profiles||{});const rows=profiles.map(p=>{const grades=all.grades?.[p.studentKey]||{};const total=items.reduce((sum,item)=>sum+number(grades[item.slug]?.points),0);return`<tr data-student-row data-search="${esc(`${p.fullName||''} ${p.ticket} ${p.email} ${p.group}`.toLowerCase())}"><td><strong>${esc(p.fullName||p.ticket)}</strong><br><small>${esc(p.ticket)} · ${esc(p.email||'')}</small></td><td>${esc(p.group)}</td><td><strong>${total}/100</strong></td><td>${items.filter(item=>number(grades[item.slug]?.points)>0).length}/17</td><td><button class="btn btn-secondary btn-small" data-edit-student="${esc(p.studentKey)}">${ui('editGrades')}</button></td></tr>`}).join('');
  app.innerHTML=contentPage(ui('teacherTitle'),ui('teacherLead'),`<div class="admin-toolbar"><div class="page-actions"><button class="btn btn-secondary" id="exportAll">${ui('exportAll')}</button></div><button class="btn btn-neutral" id="adminLogout">${ui('teacherLogout')}</button></div><section class="panel access-admin"><div class="access-admin-header"><div><h2>${accessText('scheduleTitle')}</h2><p>${accessText('scheduleLead')}</p></div><div class="access-admin-meta"><strong>${accessText('academicYear')} ${access.context.startYear}/${access.context.endYear}</strong><span>${accessText('currentWeek')}: ${access.context.week}</span></div></div><div class="access-admin-list">${accessRows}</div></section><div class="panel"><h2>${ui('students')} · ${profiles.length}</h2><input id="studentFilter" placeholder="${esc(ui('filter'))}"><div class="table-wrap" style="margin-top:12px"><table class="data-table"><thead><tr><th>${ui('fullName')} / ${ui('identifier')}</th><th>${ui('group')}</th><th>${ui('totalScore')}</th><th>${ui('completedCount')}</th><th>${ui('actions')}</th></tr></thead><tbody>${rows||`<tr><td colspan="5">${ui('noStudents')}</td></tr>`}</tbody></table></div></div>`);
  app.querySelector('#adminLogout').onclick=async()=>{await backend.adminSignOut();render()};
  app.querySelector('#studentFilter').oninput=event=>{const query=event.target.value.toLowerCase();app.querySelectorAll('[data-student-row]').forEach(row=>row.hidden=!row.dataset.search.includes(query))};
  app.querySelectorAll('[data-edit-student]').forEach(button=>button.onclick=()=>renderStudentGrades(button.dataset.editStudent,all));
  app.querySelector('#exportAll').onclick=()=>exportAdminCsv(profiles,all.grades||{},items);
  app.querySelectorAll('[data-access-key]').forEach(button=>button.onclick=async()=>{
    const controls=button.closest('.access-mode');controls.querySelectorAll('button').forEach(item=>item.disabled=true);
    try{await backend.setAccessOverride(access.context.startYear,button.dataset.accessKey,button.dataset.accessState);toast(accessText('accessSaved'),'success');await render()}
    catch(error){toast(String(error.message||error),'error');controls.querySelectorAll('button').forEach(item=>item.disabled=false)}
  });
}
function renderStudentGrades(studentKey,all){
  const p=all.profiles[studentKey],grades=all.grades?.[studentKey]||{},items=gradeItems();
  app.innerHTML=contentPage(`${ui('editGrades')} · ${p.fullName||p.ticket}`,`${p.group} · ${p.ticket} · ${p.email||p.ticket}`,`<div class="panel"><form id="gradeEdit" class="grade-edit-grid">${items.map(i=>`<label><span>${esc(i.title)} (${i.max})</span><input name="${esc(i.slug)}" type="number" min="0" max="${i.max}" step="0.01" value="${number(grades[i.slug]?.points)}"></label>`).join('')}<label class="full"><span>${ui('note')}</span><textarea name="note"></textarea></label><div class="full page-actions"><button class="btn btn-primary" type="submit">${ui('save')}</button><a class="btn btn-neutral" href="#admin">${ui('cancel')}</a></div></form></div>`);
  app.querySelector('#gradeEdit').onsubmit=async event=>{event.preventDefault();const fd=new FormData(event.currentTarget);const note=fd.get('note');for(const item of items)await backend.setManualGrade(studentKey,item.slug,fd.get(item.slug),note);toast(ui('saved'),'success');location.hash='admin'};
}
function exportAdminCsv(profiles,grades,items){const rows=[['student_id','full_name','email','group',...items.map(x=>x.slug),'total']];for(const p of profiles){const g=grades[p.studentKey]||{},values=items.map(x=>number(g[x.slug]?.points)),total=values.reduce((a,b)=>a+b,0);rows.push([p.ticket,p.fullName||'',p.email,p.group,...values,total])}downloadCsv('rudn-gradebook.csv',rows)}
function downloadCsv(filename,rows){const text='\ufeff'+rows.map(row=>row.map(cell=>`"${String(cell??'').replaceAll('"','""')}"`).join(';')).join('\r\n');const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

const authStudentDetails=document.getElementById('authStudentDetails');
const authPasswordField=document.getElementById('authPasswordField');
const authSubmit=document.getElementById('authSubmit');
const authIdentifier=document.getElementById('authIdentifier');
const authFullName=document.getElementById('authFullName');
const authGroup=document.getElementById('authGroup');
const authPassword=document.getElementById('authPassword');
const rosterStatus=document.getElementById('rosterStatus');
const authKey=(value)=>String(value||'').trim().toLowerCase();
const isAdminIdentifier=(value)=>CONFIG.adminEmails.some(email=>email.toLowerCase()===authKey(value));

function selectAuthGroup(value=''){
  const selected=groupOptions().includes(value)?value:'';
  authGroup.value=selected;
  document.querySelectorAll('.auth-group-option').forEach(button=>{
    const active=button.dataset.group===selected;
    button.classList.toggle('selected',active);
    button.setAttribute('aria-checked',String(active));
    button.setAttribute('aria-pressed',String(active));
  });
}
function populateGroupButtons(){
  const mount=document.getElementById('authGroupOptions');
  mount.innerHTML=groupOptions().map(value=>`<button class="auth-group-option" type="button" role="radio" aria-checked="false" aria-pressed="false" data-group="${esc(value)}">${esc(value)}</button>`).join('');
  mount.querySelectorAll('.auth-group-option').forEach(button=>button.addEventListener('click',()=>selectAuthGroup(button.dataset.group)));
  selectAuthGroup(backend.getProfile()?.group||'');
}
function setAuthStage(stage,source=''){
  authForm.dataset.stage=stage;
  authForm.dataset.source=source;
  authStudentDetails.hidden=stage!=='student';
  authPasswordField.hidden=stage!=='admin';
  authPassword.required=stage==='admin';
  authFullName.required=stage==='student';
  authSubmit.textContent=stage==='admin'?t('teacherLogin'):stage==='student'?t('signIn'):t('continue');
}
let rosterLookupTimer=null;
let rosterLookupRequest=0;
let resolvedIdentifier='';
async function resolveIdentifier(){
  const identifier=authIdentifier.value.trim();
  const key=authKey(identifier);
  const request=++rosterLookupRequest;
  if(!identifier){setAuthStage('identifier');rosterStatus.textContent=t('authHint');return false}
  if(key===resolvedIdentifier)return true;
  if(isAdminIdentifier(identifier)){
    resolvedIdentifier=key;
    setAuthStage('admin','admin');
    rosterStatus.textContent=t('adminPasswordHint');
    authPassword.focus();
    return true;
  }
  setAuthStage('identifier');
  rosterStatus.textContent=t('rosterChecking');
  try{
    const match=await backend.lookupStudent(identifier);
    if(request!==rosterLookupRequest)return false;
    authFullName.value=match.fullName||'';
    selectAuthGroup(match.group||'');
    resolvedIdentifier=key;
    setAuthStage('student',match.source);
    rosterStatus.textContent=t(match.source==='profile'?'profileFound':match.source==='roster'?'rosterFound':'rosterMissing');
    if(!match.fullName)authFullName.focus();
    return true;
  }catch(error){
    if(request===rosterLookupRequest){
      resolvedIdentifier='';
      setAuthStage('identifier');
      rosterStatus.textContent=String(error.message||error);
    }
    return false;
  }
}
function openAuthDialog(){
  const p=backend.isAdmin()?null:backend.getProfile();
  authIdentifier.value=backend.isAdmin()?backend.user.email:(p?.email||p?.ticket||'');
  authFullName.value=p?.fullName||'';
  authPassword.value='';
  resolvedIdentifier=p?authKey(authIdentifier.value):'';
  if(backend.isAdmin()){
    resolvedIdentifier=authKey(authIdentifier.value);setAuthStage('admin','admin');rosterStatus.textContent=t('adminPasswordHint');
  }else if(p){
    selectAuthGroup(p.group);setAuthStage('student','profile');rosterStatus.textContent=t('profileFound');
  }else{
    selectAuthGroup('');setAuthStage('identifier');rosterStatus.textContent=t('authHint');
  }
  authDialog.showModal();
  if(!p&&!backend.isAdmin())authIdentifier.focus();
}
authIdentifier.addEventListener('input',()=>{
  resolvedIdentifier='';
  authFullName.value='';authPassword.value='';selectAuthGroup('');setAuthStage('identifier');
  rosterStatus.textContent=t('authHint');
  clearTimeout(rosterLookupTimer);
  rosterLookupTimer=setTimeout(resolveIdentifier,450);
});
authIdentifier.addEventListener('blur',()=>{clearTimeout(rosterLookupTimer);if(!resolvedIdentifier)resolveIdentifier()});
document.querySelector('.modal-close').addEventListener('click',()=>authDialog.close());
profileButton.addEventListener('click',openAuthDialog);
authForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const identifier=authIdentifier.value.trim();
  if(resolvedIdentifier!==authKey(identifier)){await resolveIdentifier();return}
  try{
    if(isAdminIdentifier(identifier)){
      await backend.adminSignIn(identifier,authPassword.value);
      authDialog.close();toast(ui('profileReady'),'success');location.hash='admin';await render();return;
    }
    const p=await backend.saveProfile({identifier,fullName:authFullName.value,group:authGroup.value});
    authDialog.close();toast(ui(p.createdAt===p.updatedAt?'profileCreated':'profileUpdated'),'success');render();
  }catch(error){toast(String(error.message||error),'error')}
});
function updateLanguageSwitcher(){languageOptions.forEach(button=>{const active=button.dataset.lang===getLocale();button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))})}
function updateRudnLogos(){const international=getLocale()!=='ru';document.querySelectorAll('[data-rudn-logo]').forEach(image=>{image.src=international?'assets/img/rudn-logo-en.png':'assets/img/rudn-logo.png';image.alt=international?'RUDN University':'РУДН'})}
languageOptions.forEach(button=>button.addEventListener('click',()=>{setLocale(button.dataset.lang);updateLanguageSwitcher();updateRudnLogos();updateSync(backend.status());render()}));
window.addEventListener('hashchange',render);window.addEventListener('rudn:gradechange',()=>{if(route().name==='gradebook'||route().name==='dashboard')render()});
window.addEventListener('rudn:accesschange',()=>render());

async function bootstrap(){
  translateDocument();updateLanguageSwitcher();updateRudnLogos();populateGroupButtons();setAuthStage('identifier');versionLabel.textContent=CONFIG.version;
  backend.onStatus(updateSync);
  await Promise.all([loadData(),backend.init()]);
  updateTopProfile();await render();
  if('serviceWorker' in navigator){navigator.serviceWorker.register('service-worker.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(error=>console.warn('Service worker',error))}
}
bootstrap().catch(error=>{console.error(error);app.innerHTML=`<div class="notice danger">${esc(error.stack||error)}</div>`});
