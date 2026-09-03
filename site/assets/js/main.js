import {CONFIG} from './config.js?v=1.0.7';
import {backend} from './backend.js?v=1.0.7';
import {buildQuiz, renderQuiz, questionText} from './quiz.js?v=1.0.7';
import {getLocale, localized, setLocale, t, translateDocument} from './i18n.js?v=1.0.7';

const app = document.getElementById('app');
const authDialog = document.getElementById('authDialog');
const authForm = document.getElementById('authForm');
const profileButton = document.getElementById('profileButton');
const languageOptions = [...document.querySelectorAll('[data-lang]')];
const syncChip = document.getElementById('syncChip');
const versionLabel = document.getElementById('versionLabel');
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const slugify = (value) => String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '');
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const UI = {
  ru: {
    dashboardTitle:'Курс и учебная траектория', currentGroup:'Текущая группа', materialsTitle:'Материалы курса', seminarAssignment:'Практическое задание', download:'Скачать', noResults:'Результатов пока нет', dashboardLead:'Восемь лекций, восемь семинаров, интерактивные задания и единый электронный журнал.',
    signInToContinue:'Войдите по номеру студенческого билета, чтобы результаты сохранялись в журнале.', login:'Войти', profileReady:'Профиль подключён',
    lectureWord:'Лекция', seminarWord:'Семинар', openActivity:'Открыть', pointsOf:'баллов из', completedCount:'выполнено',
    currentScore:'Текущий результат', learningPath:'Учебный маршрут', bestResult:'Лучший результат', notPassed:'не пройдено',
    continuous:'Текущий контроль', examination:'Экзамен', total:'Итого', activity:'Активность', result:'Результат', max:'Максимум', status:'Статус',
    materials:'Материалы курса', syllabus:'Рабочая программа дисциплины', examQuestions:'Вопросы к экзамену', seminar3:'Задание к семинару 3', seminar5Variants:'Варианты обращений граждан', seminar5Template:'Шаблон ответа',
    presentations:'Презентации лекций', originalPptx:'Исходный PPTX', browserPdf:'PDF для просмотра',
    profileTitle:'Профиль студента', profileHelp:'Номер студенческого билета — постоянный идентификатор. Группу можно изменить без потери результатов.', identifier:'Студенческий билет', corporateEmail:'Корпоративный email', fullName:'ФИО', group:'Группа', recovery:'Код восстановления', editProfile:'Изменить профиль', signOutLocal:'Удалить профиль с устройства',
    save:'Сохранить', submit:'Отправить', cancel:'Отмена', cloud:'Облачная синхронизация', local:'Локальное сохранение',
    lectureMaterials:'Материалы лекции', videoLecture:'Видеолекция', presentation:'Презентация', lectureTest:'Тест по лекции', startTest:'Начать тест', noLectureTest:'Для этой лекции отдельный тест не предусмотрен.',
    reflectionTitle:'Профессиональная рефлексия', reflectionLead:'Пройдите профориентационный тест, затем зафиксируйте свой результат и выводы.', careerResult:'Полученный профиль / направление', reflection:'Краткий вывод: какие роли в государственном управлении вам подходят и почему?', externalTest:'Открыть профориентационный тест',
    seminar1Lead:'Классифицируйте органы по уровню и ветви публичной власти. Вопросы сопровождаются фотографиями и официальной символикой.', launchQuiz:'Начать квиз', joinLive:'Подключиться к аудиторной сессии',
    seminar2Lead:'Соберите субъекты России, муниципальные образования, страны мира или регионы выбранного государства.', openPuzzle:'Открыть географический конструктор',
    seminar3Lead:'Исследуйте систему расселения по интерактивному дашборду и подготовьте аналитический вывод.', openDashboard:'Открыть дашборд', territory:'Выбранная агломерация / территория', indicator:'Ключевые показатели', dynamics:'Основная динамика и пространственные различия', conclusion:'Управленческий вывод', attachment:'Презентация или тезисы (необязательно)',
    seminar4Lead:'Получите один целостный блок вопросов по конкретному нормативному правовому акту.',
    seminar5Lead:'Система закрепляет за студентом один из 30 вариантов обращения. Заполните служебную карточку и подготовьте официальный ответ гражданину.', yourVariant:'Ваш вариант', appealType:'Тип обращения', completeness:'Полнота обязательных сведений', registration:'Регистрация и первоначальное действие', deadline:'Срок рассмотрения', competentBody:'Компетентный орган', addresseeDetails:'Реквизиты адресата', officialReply:'Проект официального ответа гражданину', rubric:'Автоматическая предварительная оценка проверяет полноту карточки, сроки, компетенцию и структуру ответа. Преподаватель может уточнить итог.',
    seminar6Lead:'Пройдите официальный внешний тест, укажите результат и прикрепите скриншот.', openCivilTest:'Открыть тест госслужбы', testScore:'Результат теста (процент или балл)', screenshot:'Скриншот результата',
    seminar7Lead:'Пройдите симулятор губернатора. Платформа попытается найти итоговый KPI автоматически.', openSimulator:'Открыть симулятор', syncSimulator:'Найти мой результат', kpi:'Итоговый KPI', simulatorNotFound:'Результат не найден автоматически. Введите KPI вручную после завершения симуляции.',
    finalLead:'Итоговый тест проверяет освоение всех тем курса.',
    saved:'Результат сохранён', fillRequired:'Заполните обязательные поля', profileRequired:'Для сохранения результата сначала войдите в профиль.',
    gradebookTitle:'Электронный журнал', gradebookLead:'По каждой активности учитывается лучший результат. Максимум за курс — 100 баллов.', exportCsv:'Скачать CSV', attempts:'История попыток', date:'Дата', type:'Тип', duration:'Время',
    puzzleTitle:'Географический конструктор', puzzleLead:'Конструктор встроен в платформу и использует тот же профиль студента.',
    liveTitle:'Live-квиз', liveLead:'Введите код с экрана преподавателя. До раскрытия ответа общая доска не показывает распределение вариантов.', sessionCode:'Код сессии', connect:'Подключиться', waiting:'Ожидаем вопрос преподавателя…', answerSaved:'Ответ сохранён', wrongCode:'Активная сессия с таким кодом не найдена.', liveCloudOnly:'Live-квиз требует доступной облачной базы Firebase.',
    teacherTitle:'Панель преподавателя', teacherLead:'Контингент, журнал и управление аудиторным квизом.', email:'Email', password:'Пароль', teacherLogin:'Войти', teacherLogout:'Выйти', firebaseRequired:'Административный режим требует Firebase Authentication и правил доступа из каталога firebase.',
    students:'Студенты', createSession:'Создать live-сессию', activeSession:'Активная сессия', noSession:'Сессия ещё не создана', sessionLobby:'Лобби', showQuestion:'Показать вопрос', lockQuestion:'Закрыть приём', revealAnswer:'Показать ответ', nextQuestion:'Следующий вопрос', closeSession:'Завершить и выставить баллы', responses:'ответов',
    filter:'Поиск по ФИО, билету или группе', totalScore:'Итог', actions:'Действия', editGrades:'Оценки', manualGrade:'Ручная оценка', note:'Комментарий',
    noStudents:'В базе пока нет студентов.', exportAll:'Экспорт журнала', profileCreated:'Профиль создан. Сохраните код восстановления:', profileUpdated:'Профиль обновлён.', confirmDelete:'Удалить локальный профиль? Облачные результаты сохранятся.',
    pagesLimitation:'GitHub Pages публикует статическое приложение. Оценивание выполняется в браузере, а журнал хранится в Firebase; для официального экзамена потребуется отдельный серверный контур.',
    practiceAuto:'Предварительный автоматический балл', manualReview:'подлежит проверке преподавателем', fileCloudOnly:'Файл можно загрузить только при активной облачной синхронизации.', chooseFile:'Выберите файл', successful:'выполнено', failed:'не выполнено',
    externalResource:'Внешний ресурс', openNewTab:'Открыть в новой вкладке', back:'Назад к курсу', noProfile:'Профиль не создан', refresh:'Обновить',
    adminQuizInstruction:'На проектор можно вывести эту же страницу в отдельном окне; персональные ответы студентов не показываются до раскрытия.',
  },
  en: {
    dashboardTitle:'Course and learning pathway', currentGroup:'Current group', materialsTitle:'Course materials', seminarAssignment:'Practical assignment', download:'Download', noResults:'No results yet', dashboardLead:'Eight lectures, eight seminars, interactive assignments and a unified electronic gradebook.',
    signInToContinue:'Sign in with your student ID so that results can be linked to your gradebook.', login:'Sign in', profileReady:'Profile connected',
    lectureWord:'Lecture', seminarWord:'Seminar', openActivity:'Open', pointsOf:'points out of', completedCount:'completed',
    currentScore:'Current score', learningPath:'Learning pathway', bestResult:'Best result', notPassed:'not completed',
    continuous:'Continuous assessment', examination:'Examination', total:'Total', activity:'Activity', result:'Result', max:'Maximum', status:'Status',
    materials:'Course materials', syllabus:'Course syllabus', examQuestions:'Examination questions', seminar3:'Seminar 3 assignment', seminar5Variants:'Citizens’ petition cases', seminar5Template:'Response template',
    presentations:'Lecture presentations', originalPptx:'Original PPTX', browserPdf:'Browser PDF',
    profileTitle:'Student profile', profileHelp:'Your student ID is the permanent identifier. You may change groups without losing results.', identifier:'Student ID', corporateEmail:'Institutional email', fullName:'Full name', group:'Group', recovery:'Recovery code', editProfile:'Edit profile', signOutLocal:'Remove profile from this device',
    save:'Save', submit:'Submit', cancel:'Cancel', cloud:'Cloud synchronization', local:'Local storage',
    lectureMaterials:'Lecture materials', videoLecture:'Video lecture', presentation:'Presentation', lectureTest:'Lecture test', startTest:'Start test', noLectureTest:'No separate test is assigned to this lecture.',
    reflectionTitle:'Professional reflection', reflectionLead:'Complete the career-guidance test and record your result and conclusions.', careerResult:'Profile / career direction obtained', reflection:'Brief conclusion: which public-administration roles suit you and why?', externalTest:'Open career-guidance test',
    seminar1Lead:'Classify public bodies by level and branch of public authority. Each question includes a photograph and verified public symbol.', launchQuiz:'Start quiz', joinLive:'Join classroom session',
    seminar2Lead:'Assemble Russian federal subjects, municipalities, countries of the world, or regions of a selected state.', openPuzzle:'Open Geographic Constructor',
    seminar3Lead:'Explore the settlement system using the interactive dashboard and formulate a management-oriented conclusion.', openDashboard:'Open dashboard', territory:'Selected agglomeration / territory', indicator:'Key indicators', dynamics:'Main dynamics and spatial differences', conclusion:'Management conclusion', attachment:'Presentation or notes (optional)',
    seminar4Lead:'Receive one coherent question block devoted to a particular normative legal act.',
    seminar5Lead:'The platform assigns one of 30 petition cases to each student. Complete the processing card and draft an official reply.', yourVariant:'Your case', appealType:'Type of petition', completeness:'Completeness of mandatory information', registration:'Registration and initial action', deadline:'Review deadline', competentBody:'Competent authority', addresseeDetails:'Addressee details', officialReply:'Draft official reply to the citizen', rubric:'The preliminary automated mark checks completeness, deadlines, competence and reply structure. The instructor may adjust it.',
    seminar6Lead:'Complete the official external test, record the result and upload a screenshot.', openCivilTest:'Open civil-service test', testScore:'Test result (percentage or score)', screenshot:'Result screenshot',
    seminar7Lead:'Complete the governor simulator. The platform will try to locate your final KPI automatically.', openSimulator:'Open simulator', syncSimulator:'Find my result', kpi:'Final KPI', simulatorNotFound:'The result could not be found automatically. Enter the KPI manually after completing the simulation.',
    finalLead:'The final course test covers all course themes.',
    saved:'Result saved', fillRequired:'Complete all required fields', profileRequired:'Sign in before saving a result.',
    gradebookTitle:'Electronic gradebook', gradebookLead:'The best result is retained for each activity. The course maximum is 100 points.', exportCsv:'Download CSV', attempts:'Attempt history', date:'Date', type:'Type', duration:'Time',
    puzzleTitle:'Geographic Constructor', puzzleLead:'The constructor is integrated into the platform and uses the same student profile.',
    liveTitle:'Live quiz', liveLead:'Enter the code displayed by the instructor. The shared board does not show response distribution before reveal.', sessionCode:'Session code', connect:'Connect', waiting:'Waiting for the instructor’s question…', answerSaved:'Response saved', wrongCode:'No active session was found for this code.', liveCloudOnly:'The live quiz requires an available Firebase cloud database.',
    teacherTitle:'Instructor panel', teacherLead:'Enrolment, gradebook and classroom quiz control.', email:'Email', password:'Password', teacherLogin:'Sign in', teacherLogout:'Sign out', firebaseRequired:'Administrative mode requires Firebase Authentication and the access rules supplied in the firebase directory.',
    students:'Students', createSession:'Create live session', activeSession:'Active session', noSession:'No session has been created', sessionLobby:'Lobby', showQuestion:'Show question', lockQuestion:'Lock responses', revealAnswer:'Reveal answer', nextQuestion:'Next question', closeSession:'Close and assign marks', responses:'responses',
    filter:'Search by name, student ID or group', totalScore:'Total', actions:'Actions', editGrades:'Grades', manualGrade:'Manual grade', note:'Comment',
    noStudents:'No students are registered yet.', exportAll:'Export gradebook', profileCreated:'Profile created. Keep this recovery code:', profileUpdated:'Profile updated.', confirmDelete:'Remove the local profile? Cloud results will remain.',
    pagesLimitation:'GitHub Pages publishes a static application. Scoring runs in the browser and the gradebook is stored in Firebase; an official high-stakes examination would require a separate server-side layer.',
    practiceAuto:'Preliminary automated mark', manualReview:'subject to instructor review', fileCloudOnly:'File upload requires active cloud synchronization.', chooseFile:'Choose a file', successful:'completed', failed:'not completed',
    externalResource:'External resource', openNewTab:'Open in new tab', back:'Back to course', noProfile:'No profile created', refresh:'Refresh',
    adminQuizInstruction:'This page may be shown on the projector in a separate window; personal responses remain hidden until reveal.',
  },
  zh: {
    dashboardTitle:'课程与学习路径', currentGroup:'当前班级', materialsTitle:'课程资料', seminarAssignment:'实践任务', download:'下载', noResults:'暂无成绩', dashboardLead:'八次讲座、八次研讨课、互动任务和统一电子成绩册。',
    signInToContinue:'请使用学生证号登录，以便将学习成果写入成绩册。', login:'登录', profileReady:'个人资料已连接',
    lectureWord:'讲座', seminarWord:'研讨课', openActivity:'打开', pointsOf:'分（满分', completedCount:'已完成',
    currentScore:'当前成绩', learningPath:'学习路径', bestResult:'最佳成绩', notPassed:'未完成',
    continuous:'过程性考核', examination:'考试', total:'总分', activity:'学习活动', result:'成绩', max:'满分', status:'状态',
    materials:'课程资料', syllabus:'课程教学大纲', examQuestions:'考试问题', seminar3:'研讨课3任务', seminar5Variants:'公民来信案例', seminar5Template:'答复模板',
    presentations:'讲座演示文稿', originalPptx:'原始PPTX', browserPdf:'浏览器PDF',
    profileTitle:'学生个人资料', profileHelp:'学生证号是永久标识。更换班级不会导致成绩丢失。', identifier:'学生证号', corporateEmail:'学校邮箱', fullName:'姓名', group:'班级', recovery:'恢复码', editProfile:'修改资料', signOutLocal:'从本设备删除资料',
    save:'保存', submit:'提交', cancel:'取消', cloud:'云端同步', local:'本地保存',
    lectureMaterials:'讲座资料', videoLecture:'视频讲座', presentation:'演示文稿', lectureTest:'讲座测验', startTest:'开始测验', noLectureTest:'本讲座不设单独测验。',
    reflectionTitle:'职业反思', reflectionLead:'完成职业指导测试，并记录结果与个人结论。', careerResult:'获得的职业类型 / 方向', reflection:'简要说明：哪些公共管理岗位更适合你，为什么？', externalTest:'打开职业指导测试',
    seminar1Lead:'按公共权力层级和权力分支对机关进行分类。每题附有照片及经核验的公共标识。', launchQuiz:'开始测验', joinLive:'加入课堂会话',
    seminar2Lead:'拼合俄罗斯联邦主体、市政单位、世界各国或所选国家的一级行政区。', openPuzzle:'打开地理拼图构造器',
    seminar3Lead:'使用互动数据看板研究居民点体系，并提出管理结论。', openDashboard:'打开数据看板', territory:'所选城市群 / 地区', indicator:'关键指标', dynamics:'主要变化与空间差异', conclusion:'管理结论', attachment:'演示文稿或提纲（可选）',
    seminar4Lead:'系统将发放一个围绕特定规范性法律文件的完整题组。',
    seminar5Lead:'系统为每位学生固定分配30个公民来信案例之一。请填写办理卡并起草正式答复。', yourVariant:'你的案例', appealType:'来信类型', completeness:'必备信息完整性', registration:'登记与初始处理', deadline:'办理期限', competentBody:'主管机关', addresseeDetails:'收件人信息', officialReply:'致公民的正式答复草案', rubric:'自动初评检查资料完整性、期限、职权归属和答复结构；教师可调整最终成绩。',
    seminar6Lead:'完成外部官方测试，填写结果并上传截图。', openCivilTest:'打开公务员测试', testScore:'测试结果（百分比或分数）', screenshot:'成绩截图',
    seminar7Lead:'完成行政长官模拟器；平台将尝试自动查找最终KPI。', openSimulator:'打开模拟器', syncSimulator:'查找我的结果', kpi:'最终KPI', simulatorNotFound:'未能自动找到结果。完成模拟后可手动输入KPI。',
    finalLead:'课程期末测验覆盖全部主题。',
    saved:'结果已保存', fillRequired:'请填写必填项', profileRequired:'保存结果前请先登录。',
    gradebookTitle:'电子成绩册', gradebookLead:'每项活动保留最佳成绩，课程总分上限为100分。', exportCsv:'下载CSV', attempts:'作答记录', date:'日期', type:'类型', duration:'用时',
    puzzleTitle:'地理拼图构造器', puzzleLead:'拼图构造器已嵌入平台，并使用同一学生资料。',
    liveTitle:'课堂实时测验', liveLead:'输入教师屏幕上的代码。在揭晓答案前，共享屏幕不会显示答案分布。', sessionCode:'会话代码', connect:'连接', waiting:'正在等待教师发布题目……', answerSaved:'答案已保存', wrongCode:'未找到该代码对应的活动会话。', liveCloudOnly:'实时测验需要可用的Firebase云数据库。',
    teacherTitle:'教师控制台', teacherLead:'学生信息、成绩册与课堂测验控制。', email:'邮箱', password:'密码', teacherLogin:'登录', teacherLogout:'退出', firebaseRequired:'管理模式需要启用Firebase Authentication，并应用firebase目录中的访问规则。',
    students:'学生', createSession:'创建实时会话', activeSession:'当前会话', noSession:'尚未创建会话', sessionLobby:'等候室', showQuestion:'显示题目', lockQuestion:'停止作答', revealAnswer:'揭晓答案', nextQuestion:'下一题', closeSession:'结束并计分', responses:'份回答',
    filter:'按姓名、学生证号或班级搜索', totalScore:'总分', actions:'操作', editGrades:'成绩', manualGrade:'手动评分', note:'备注',
    noStudents:'目前尚无学生登记。', exportAll:'导出成绩册', profileCreated:'个人资料已创建。请保存恢复码：', profileUpdated:'个人资料已更新。', confirmDelete:'从本设备删除个人资料？云端成绩仍会保留。',
    pagesLimitation:'GitHub Pages发布静态应用。评分在浏览器中执行，成绩册保存在Firebase中；正式高风险考试仍需独立的服务器端系统。',
    practiceAuto:'自动初评分', manualReview:'需教师复核', fileCloudOnly:'仅在云端同步可用时才能上传文件。', chooseFile:'选择文件', successful:'已完成', failed:'未完成',
    externalResource:'外部资源', openNewTab:'在新标签页打开', back:'返回课程', noProfile:'尚未创建个人资料', refresh:'刷新',
    adminQuizInstruction:'可在投影仪上另开此页面；揭晓答案前不会显示学生个人答案。',
  }
};

function ui(key){ return UI[getLocale()]?.[key] ?? UI.ru[key] ?? key; }
function loc(obj,key,fallback=''){ return localized(obj,key,fallback); }
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
  const profile=backend.getProfile();
  document.getElementById('topAvatar').textContent=profile?.fullName?.trim()?.[0]?.toUpperCase()||'?';
  document.getElementById('topName').textContent=profile?.fullName||t('signIn');
  document.getElementById('topGroup').textContent=profile?`${profile.group} · ${profile.ticket}`:'';
}
function updateSync(status){
  syncChip.classList.toggle('online',status.mode==='cloud');syncChip.classList.toggle('error',Boolean(status.error));
  syncChip.querySelector('span:last-child').textContent=status.mode==='cloud'?t('cloudMode'):status.error?t('connectionError'):t('localMode');
  updateTopProfile();
}
function requireProfile({open=true}={}){
  if(backend.getProfile())return true;
  if(open)authDialog.showModal();
  toast(ui('profileRequired'),'error');return false;
}
function contentPage(title,lead,body,actions=''){
  return `<section class="page"><header class="page-head"><div><h1>${esc(title)}</h1><p>${esc(lead||'')}</p></div>${actions?`<div class="page-actions">${actions}</div>`:''}</header>${body}</section>`;
}
function activityHeader(item,kind,preview){
  const grade=backend.localGrades()[item.slug];
  return `<div class="activity-header">${preview?`<img src="${esc(preview)}" alt="">`:''}<div><span class="badge">${esc(kind)}</span><h1>${esc(loc(item,'title',item.title))}</h1><div class="activity-meta"><span class="badge success">${esc(String(item.points))}/5</span><span class="badge dark">${grade?`${number(grade.points)}/5`:`${ui('notPassed')}`}</span></div></div></div>`;
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
    else if(r.name==='live') await renderLive();
    else if(r.name==='puzzle') renderPuzzleRoute();
    else if(r.name==='admin') await renderAdmin();
    else if(r.name==='activity') await renderActivity(r.parts[0]);
    else location.hash='dashboard';
  }catch(error){console.error(error);app.innerHTML=contentPage(t('error'),String(error?.message||error),`<div class="panel notice danger">${esc(String(error?.stack||error))}</div>`);}
  app.setAttribute('aria-busy','false');app.focus({preventScroll:true});translateDocument(app);
}

async function renderDashboard(){
  const grades=await backend.getGrades();
  const total=Object.values(grades).reduce((sum,g)=>sum+number(g.points),0);
  const coursework=data.course.topics.flatMap(x=>[x.lecture.slug,x.seminar.slug]).reduce((sum,slug)=>sum+number(grades[slug]?.points),0);
  const completed=data.course.topics.flatMap(x=>[x.lecture.slug,x.seminar.slug]).filter(slug=>number(grades[slug]?.points)>0).length;
  const profile=backend.getProfile();
  const topics=data.course.topics.map(topic=>{
    const lecture=topic.lecture,seminar=topic.seminar;
    const lg=grades[lecture.slug],sg=grades[seminar.slug];
    return `<article class="topic-card"><div class="topic-no"><strong>${String(topic.number).padStart(2,'0')}</strong><span>${esc(ui('learningPath'))}</span></div><div class="topic-copy"><h2>${esc(loc(topic,'title',topic.title))}</h2><p>${esc(loc(topic,'summary',topic.summary))}</p></div><div class="activity-pair"><div class="activity-mini"><div><span class="kind">${ui('lectureWord')}</span><strong>${esc(loc(lecture,'title',lecture.title))}</strong></div><footer><span class="grade">${lg?`${number(lg.points)}/5`:'—/5'}</span><a class="btn btn-secondary btn-small" href="#activity/${lecture.slug}">${ui('openActivity')}</a></footer></div><div class="activity-mini"><div><span class="kind">${ui('seminarWord')}</span><strong>${esc(loc(seminar,'title',seminar.title))}</strong></div><footer><span class="grade">${sg?`${number(sg.points)}/5`:'—/5'}</span><a class="btn btn-secondary btn-small" href="#activity/${seminar.slug}">${ui('openActivity')}</a></footer></div></div></article>`;
  }).join('');
  app.innerHTML=`<section class="page"><div class="hero"><div class="hero-grid"><div><h1>${esc(loc(data.course,'title',data.course.title))}</h1><p>${esc(ui('dashboardLead'))}</p><div class="hero-meta"><span>${esc(data.course.programme)}</span><span>${esc(data.course.academic_year)}</span><span>${profile?`${esc(profile.fullName)} · ${esc(profile.group)}`:ui('signInToContinue')}</span></div>${!profile?`<div style="margin-top:18px"><button class="btn btn-neutral" id="heroLogin">${ui('login')}</button></div>`:''}</div><div class="score-ring" style="--progress:${Math.min(100,total)}%"><strong>${total}</strong><span>/ 100 · ${ui('currentScore')}</span></div></div></div><div class="stats-grid"><div class="stat-card"><span>${ui('continuous')}</span><strong>${coursework}/80</strong><small>${completed}/16 ${ui('completedCount')}</small></div><div class="stat-card"><span>${ui('examination')}</span><strong>${number(grades.exam?.points)}/20</strong><small>${grades.exam?ui('completedCount'):ui('notPassed')}</small></div><div class="stat-card"><span>${ui('currentGroup')}</span><strong>${esc(profile?.group||'—')}</strong><small>${esc(profile?.ticket||ui('noProfile'))}</small></div><div class="stat-card"><span>${ui('cloud')}</span><strong>${backend.mode==='cloud'?'✓':'—'}</strong><small>${backend.mode==='cloud'?t('synced'):t('localSaved')}</small></div></div><header class="page-head"><div><h1>${ui('learningPath')}</h1><p>${ui('dashboardLead')}</p></div></header><div class="topic-list">${topics}</div><div class="notice warning" style="margin-top:20px">${ui('pagesLimitation')}</div></section>`;
  app.querySelector('#heroLogin')?.addEventListener('click',()=>authDialog.showModal());
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
  const attemptRows=attempts.slice(0,40).map(x=>`<tr><td>${esc(x.title||x.activitySlug||x.type)}</td><td>${esc(x.type||'—')}</td><td>${number(x.points)}/${number(x.maxPoints||CONFIG.activityMax[x.activitySlug]||5)}</td><td>${formatDuration(x.durationMs)}</td><td>${formatDate(x.createdAt)}</td></tr>`).join('');
  const body=!profile?`<div class="panel empty-state"><div class="icon">◎</div><p>${ui('signInToContinue')}</p><button class="btn btn-primary" id="gradeLogin">${ui('login')}</button></div>`:`<div class="stats-grid"><div class="stat-card"><span>${ui('total')}</span><strong>${total}/100</strong></div><div class="stat-card"><span>${ui('continuous')}</span><strong>${Math.min(80,total-number(grades.exam?.points))}/80</strong></div><div class="stat-card"><span>${ui('examination')}</span><strong>${number(grades.exam?.points)}/20</strong></div><div class="stat-card"><span>${ui('completedCount')}</span><strong>${items.filter(i=>number(grades[i.slug]?.points)>0).length}/17</strong></div></div><div class="page-actions" style="margin-bottom:14px"><button class="btn btn-primary" id="exportPersonal">${ui('exportCsv')}</button><button class="btn btn-neutral" id="refreshGrades">${ui('refresh')}</button></div><div class="gradebook-wrap"><table class="gradebook"><thead><tr><th>${ui('activity')}</th><th>${ui('result')}</th><th>${ui('max')}</th><th>%</th><th>${ui('date')}</th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel" style="margin-top:18px"><h2>${ui('attempts')}</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>${ui('activity')}</th><th>${ui('type')}</th><th>${ui('result')}</th><th>${ui('duration')}</th><th>${ui('date')}</th></tr></thead><tbody>${attemptRows||`<tr><td colspan="5">${ui('noResults')}</td></tr>`}</tbody></table></div></div>`;
  app.innerHTML=contentPage(ui('gradebookTitle'),ui('gradebookLead'),body);
  app.querySelector('#gradeLogin')?.addEventListener('click',()=>authDialog.showModal());
  app.querySelector('#refreshGrades')?.addEventListener('click',render);
  app.querySelector('#exportPersonal')?.addEventListener('click',()=>downloadCsv(`gradebook-${profile.ticket}.csv`,[
    ['student_id','email','full_name','group',...items.map(x=>x.slug),'total'],
    [profile.ticket,profile.email,profile.fullName,profile.group,...items.map(x=>number(grades[x.slug]?.points)),total]
  ]));
}

function renderMaterials(){
  const cards=[
    {title:ui('syllabus'),text:data.course.programme,url:data.course.documents.rpd,kind:'PDF'},
    {title:ui('examQuestions'),text:loc(data.course,'title',data.course.title),url:data.course.documents.exam_questions,kind:'DOCX'},
    {title:ui('seminar3'),text:loc(data.course.topics[2].seminar,'title'),url:'assets/course/docs/seminar_03_assignment.docx',kind:'DOCX'},
    {title:ui('seminar5Variants'),text:'30',url:'assets/course/docs/seminar_05_variants.docx',kind:'DOCX'},
    {title:ui('seminar5Template'),text:loc(data.course.topics[4].seminar,'title'),url:'assets/course/docs/seminar_05_template.docx',kind:'DOCX'}
  ];
  const docs=cards.map(card=>`<article class="material-card"><div class="body"><span class="badge">${card.kind}</span><h3>${esc(card.title)}</h3><p>${esc(card.text||'')}</p><div class="material-actions"><a class="btn btn-secondary btn-small" href="${esc(card.url)}" target="_blank">${ui('download')}</a></div></div></article>`).join('');
  const presentations=data.course.topics.map(topic=>`<article class="material-card"><img src="${esc(topic.lecture.preview)}" alt=""><div class="body"><span class="badge">${ui('lectureWord')} ${topic.number}</span><h3>${esc(loc(topic,'title',topic.title))}</h3><div class="material-actions"><a class="btn btn-secondary btn-small" href="${esc(topic.lecture.presentation_pdf)}" target="_blank">${ui('browserPdf')}</a><a class="btn btn-neutral btn-small" href="${esc(topic.lecture.presentation_pptx)}">${ui('originalPptx')}</a></div></div></article>`).join('');
  app.innerHTML=contentPage(ui('materialsTitle'),t('materialsLead'),`<div class="material-grid">${docs}</div><header class="page-head subsection"><div><h1>${ui('presentations')}</h1></div></header><div class="material-grid">${presentations}</div>`);
}

function renderProfile(){
  const p=backend.getProfile();
  const body=p?`<div class="split"><div class="panel"><h2>${ui('profileReady')}</h2><dl class="profile-dl"><dt>${ui('identifier')}</dt><dd>${esc(p.ticket)}</dd><dt>${ui('corporateEmail')}</dt><dd>${esc(p.email)}</dd><dt>${ui('fullName')}</dt><dd>${esc(p.fullName)}</dd><dt>${ui('group')}</dt><dd>${esc(p.group)}</dd><dt>${ui('recovery')}</dt><dd><code>${esc(p.recoveryPin||'—')}</code></dd></dl><div class="page-actions"><button class="btn btn-primary" id="editProfile">${ui('editProfile')}</button><button class="btn btn-danger" id="removeProfile">${ui('signOutLocal')}</button></div></div><div class="panel"><h2>${ui('cloud')}</h2><p class="muted">${backend.mode==='cloud'?t('cloudMode'):t('localMode')}</p><div class="notice ${backend.mode==='cloud'?'success':'warning'}">${backend.mode==='cloud'?t('synced'):ui('pagesLimitation')}</div></div></div>`:`<div class="panel empty-state"><div class="icon">◎</div><h2>${ui('noProfile')}</h2><p>${ui('signInToContinue')}</p><button class="btn btn-primary" id="profileLogin">${ui('login')}</button></div>`;
  app.innerHTML=contentPage(ui('profileTitle'),ui('profileHelp'),body);
  app.querySelector('#profileLogin')?.addEventListener('click',()=>authDialog.showModal());
  app.querySelector('#editProfile')?.addEventListener('click',openAuthDialog);
  app.querySelector('#removeProfile')?.addEventListener('click',()=>{if(confirm(ui('confirmDelete'))){backend.clearLocalProfile();render()}});
}

async function renderActivity(slug){
  const topic=data.course.topics.find(x=>x.lecture.slug===slug||x.seminar.slug===slug);
  if(!topic){location.hash='dashboard';return}
  if(topic.lecture.slug===slug)renderLecture(topic);
  else await renderSeminar(topic);
}
function renderLecture(topic){
  const lecture=topic.lecture;const n=topic.number;
  const testAvailable=n<=7;
  const testPanel=testAvailable?`<div class="panel"><h2>${ui('lectureTest')}</h2><p class="muted">${esc(loc(topic,'summary',topic.summary))}</p><button class="btn btn-primary" id="launchLectureTest">${ui('startTest')}</button></div>`:`<div class="panel"><h2>${ui('reflectionTitle')}</h2><p class="muted">${ui('reflectionLead')}</p><div class="page-actions"><a class="btn btn-secondary" href="${esc(data.course.external_apps.career_guidance)}" target="_blank" rel="noopener">${ui('externalTest')} ↗</a></div><form id="reflectionForm" class="form-grid" style="margin-top:18px"><label class="full"><span>${ui('careerResult')}</span><input name="result" required></label><label class="full"><span>${ui('reflection')}</span><textarea name="reflection" required minlength="120"></textarea></label><div class="full"><button class="btn btn-primary" type="submit">${ui('submit')}</button></div></form></div>`;
  app.innerHTML=`<section class="page"><div class="page-actions" style="margin-bottom:12px"><a class="btn btn-neutral btn-small" href="#dashboard">← ${ui('back')}</a></div>${activityHeader(lecture,`${ui('lectureWord')} ${n}`,lecture.preview)}<div class="panel"><div class="tabs" role="tablist"><button class="tab active" data-video-platform="youtube">YouTube</button><button class="tab" data-video-platform="vk">VK Видео</button><button class="tab" data-video-platform="presentation">${ui('presentation')}</button></div><div id="lectureContent"><iframe class="video-frame" src="${esc(lecture.youtube_embed)}" title="${esc(loc(lecture,'title',lecture.title))}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><div class="page-actions" style="margin-top:14px"><a class="btn btn-neutral btn-small" href="${esc(lecture.youtube_link)}" target="_blank">YouTube ↗</a><a class="btn btn-neutral btn-small" href="${esc(lecture.vk_link)}" target="_blank">VK ↗</a><a class="btn btn-secondary btn-small" href="${esc(lecture.presentation_pdf)}" target="_blank">PDF</a><a class="btn btn-neutral btn-small" href="${esc(lecture.presentation_pptx)}">PPTX</a></div></div>${testPanel}</section>`;
  app.querySelectorAll('[data-video-platform]').forEach(btn=>btn.addEventListener('click',()=>{
    app.querySelectorAll('[data-video-platform]').forEach(x=>x.classList.toggle('active',x===btn));
    const kind=btn.dataset.videoPlatform;const container=app.querySelector('#lectureContent');
    if(kind==='youtube')container.innerHTML=`<iframe class="video-frame" src="${esc(lecture.youtube_embed)}" title="YouTube" allowfullscreen></iframe>`;
    else if(kind==='vk')container.innerHTML=`<iframe class="video-frame" src="${esc(lecture.vk_embed)}" title="VK Видео" allowfullscreen></iframe>`;
    else container.innerHTML=`<iframe class="doc-frame" src="${esc(lecture.presentation_pdf)}" title="${ui('presentation')}"></iframe>`;
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
  if(n===1) return renderSeminar1(topic);
  if(n===2) return renderPuzzleRoute(true);
  if(n===3) return renderSeminar3(topic);
  if(n===4) return renderSeminar4(topic);
  if(n===5) return renderSeminar5(topic);
  if(n===6) return renderSeminar6(topic);
  if(n===7) return renderSeminar7(topic);
  if(n===8) return renderSeminar8(topic);
}
function seminarShell(topic,body){return `<section class="page"><div class="page-actions" style="margin-bottom:12px"><a class="btn btn-neutral btn-small" href="#dashboard">← ${ui('back')}</a></div>${activityHeader(topic.seminar,`${ui('seminarWord')} ${topic.number}`,topic.number===2?'assets/course/previews/seminar_02_puzzle.png':topic.number===3?'assets/course/previews/seminar_03_dashboard.png':topic.number===7?'assets/course/previews/seminar_07_simulator.jpg':topic.lecture.preview)}${body}</section>`}
function renderSeminar1(topic){
  app.innerHTML=seminarShell(topic,`<div class="split"><div class="panel"><h2>${esc(loc(topic.seminar,'title',topic.seminar.title))}</h2><p class="muted">${ui('seminar1Lead')}</p><button class="btn btn-primary" id="seminar1Quiz">${ui('launchQuiz')}</button></div><div class="panel"><h2>Live</h2><p class="muted">${ui('liveLead')}</p><a class="btn btn-secondary" href="#live">${ui('joinLive')}</a></div></div>`);
  app.querySelector('#seminar1Quiz').onclick=()=>startQuiz('seminar-1');
}
function renderSeminar4(topic){
  app.innerHTML=seminarShell(topic,`<div class="panel"><h2>${esc(loc(topic.seminar,'title',topic.seminar.title))}</h2><p class="muted">${ui('seminar4Lead')}</p><button class="btn btn-primary" id="seminar4Quiz">${ui('launchQuiz')}</button></div>`);
  app.querySelector('#seminar4Quiz').onclick=()=>startQuiz('seminar-4');
}
function renderSeminar8(topic){
  app.innerHTML=seminarShell(topic,`<div class="panel"><h2>${esc(loc(topic.seminar,'title',topic.seminar.title))}</h2><p class="muted">${ui('finalLead')}</p><button class="btn btn-primary" id="finalQuiz">${ui('startTest')}</button></div>`);
  app.querySelector('#finalQuiz').onclick=()=>startQuiz('seminar-8');
}
function startQuiz(activitySlug){
  if(!requireProfile())return;
  const session=buildQuiz(data.questions,activitySlug,backend.getProfile());
  app.innerHTML=`<section class="page"><div id="quizMount"></div></section>`;
  renderQuiz(app.querySelector('#quizMount'),session,{onExit:()=>{location.hash=`activity/${activitySlug}`}});
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
function renderPuzzleRoute(asSeminar=false){
  const frame=`<div class="panel puzzle-embed-panel"><iframe class="app-frame puzzle-frame" src="apps/puzzle.html" title="${ui('puzzleTitle')}" allow="fullscreen"></iframe></div>`;
  if(asSeminar){const topic=data.course.topics[1];app.innerHTML=seminarShell(topic,`<p class="notice">${ui('seminar2Lead')}</p>${frame}`)}else app.innerHTML=contentPage(ui('puzzleTitle'),ui('puzzleLead'),frame,`<a class="btn btn-primary" href="apps/puzzle.html" target="_blank">${ui('openNewTab')} ↗</a>`);
}

async function renderLive(){
  const p=backend.getProfile();
  const body=backend.mode!=='cloud'?`<div class="panel notice warning">${ui('liveCloudOnly')}</div>`:`<div class="live-layout"><div class="panel" id="liveMain"><form id="joinLiveForm"><label><span>${ui('sessionCode')}</span><input name="code" inputmode="numeric" maxlength="6" required></label><button class="btn btn-primary" style="margin-top:12px" type="submit">${ui('connect')}</button></form></div><aside class="panel"><h2>${ui('liveTitle')}</h2><p class="muted">${ui('liveLead')}</p>${p?`<span class="badge success">${esc(p.fullName)} · ${esc(p.group)}</span>`:`<button class="btn btn-primary" id="liveLogin">${ui('login')}</button>`}</aside></div>`;
  app.innerHTML=contentPage(ui('liveTitle'),ui('liveLead'),body);
  app.querySelector('#liveLogin')?.addEventListener('click',()=>authDialog.showModal());
  app.querySelector('#joinLiveForm')?.addEventListener('submit',event=>{event.preventDefault();if(!requireProfile())return;const code=new FormData(event.currentTarget).get('code');connectLive(String(code||''))});
}
function liveQuestionHtml(question,selected,onSelect){
  const matrix=question.matrix||{},rows=matrix.rows||[],cols=matrix.columns||[];
  return `<div class="question-kicker">${esc(loc(question,'category',question.category))}</div><h2>${esc(questionText(question))}</h2>${question.media?`<div class="question-media"><img class="question-photo" src="${esc(question.media.photo)}" alt=""><img class="question-symbol" src="${esc(question.media.symbol)}" alt=""></div>`:''}<div class="matrix-grid"><div class="matrix-cell header"></div>${cols.map(c=>`<div class="matrix-cell header">${esc(loc(c,'label',c.label))}</div>`).join('')}${rows.map(r=>`<div class="matrix-cell header">${esc(loc(r,'label',r.label))}</div>${cols.map(c=>{const v=`${r.id}|${c.id}`;return`<button type="button" class="matrix-cell choice ${selected===v?'selected':''}" data-live-answer="${esc(v)}">${selected===v?'✓':''}</button>`}).join('')}`).join('')}</div>`;
}
function connectLive(code){
  const mount=app.querySelector('#liveMain');let current=null,selected='';
  const unsubscribe=backend.subscribeCurrentLive(session=>{
    if(!session||String(session.code)!==String(code)){mount.innerHTML=`<div class="notice warning">${ui('wrongCode')}</div><a class="btn btn-neutral" href="#live" style="margin-top:12px">${ui('back')}</a>`;return}
    current=session;const questionId=session.questionIds?.[session.currentIndex];const question=data.questions.find(q=>q.id===questionId);
    if(session.state==='lobby'||session.currentIndex<0||!question){mount.innerHTML=`<div class="empty-state"><div class="spinner"></div><p>${ui('waiting')}</p><div class="live-code">${esc(code)}</div></div>`;return}
    const locked=['locked','reveal','closed'].includes(session.state);const correct=question.matrix?`${question.matrix.correct.row}|${question.matrix.correct.column}`:'';
    mount.innerHTML=`<article class="quiz-question">${liveQuestionHtml(question,selected)}${locked?`<div class="notice ${selected===correct?'success':'danger'}" style="margin-top:14px">${session.state==='reveal'||session.state==='closed'?`${selected===correct?t('correct'):t('incorrect')} · ${esc(loc(question,'general_feedback',question.general_feedback||''))}`:ui('answerSaved')}</div>`:''}</article>`;
    mount.querySelectorAll('[data-live-answer]').forEach(btn=>{btn.disabled=locked;btn.onclick=async()=>{selected=btn.dataset.liveAnswer;await backend.submitLiveResponse(session.sessionId,question.id,selected);toast(ui('answerSaved'),'success');connectLiveRender(question,selected,locked)}});
    function connectLiveRender(q,s,l){mount.querySelector('.quiz-question').innerHTML=liveQuestionHtml(q,s)+`<div class="notice success" style="margin-top:14px">${ui('answerSaved')}</div>`}
  });
  currentCleanup=unsubscribe;
}

async function renderAdmin(){
  if(!backend.isAdmin()){
    app.innerHTML=contentPage(ui('teacherTitle'),ui('teacherLead'),`<div class="panel admin-login"><div class="notice warning">${ui('firebaseRequired')}</div><form id="adminLogin" class="form-grid" style="margin-top:18px"><label class="full"><span>${ui('email')}</span><input name="email" type="email" value="${esc(CONFIG.adminEmails[0])}" required></label><label class="full"><span>${ui('password')}</span><input name="password" type="password" required></label><div class="full"><button class="btn btn-primary btn-wide">${ui('teacherLogin')}</button></div></form></div>`);
    app.querySelector('#adminLogin').onsubmit=async event=>{event.preventDefault();const fd=new FormData(event.currentTarget);try{await backend.adminSignIn(fd.get('email'),fd.get('password'));toast(ui('profileReady'),'success');render()}catch(error){toast(String(error.message||error),'error')}};return;
  }
  let all;try{all=await backend.adminAll()}catch(error){app.innerHTML=contentPage(ui('teacherTitle'),ui('teacherLead'),`<div class="notice danger">${esc(error.message)}</div>`);return}
  const items=gradeItems();const profiles=Object.values(all.profiles||{});const rows=profiles.map(p=>{const grades=all.grades?.[p.studentKey]||{};const total=items.reduce((s,i)=>s+number(grades[i.slug]?.points),0);return`<tr data-student-row data-search="${esc(`${p.fullName} ${p.ticket} ${p.group}`.toLowerCase())}"><td><strong>${esc(p.fullName)}</strong><br><small>${esc(p.ticket)}</small></td><td>${esc(p.group)}</td><td><strong>${total}/100</strong></td><td>${items.filter(i=>number(grades[i.slug]?.points)>0).length}/17</td><td><button class="btn btn-secondary btn-small" data-edit-student="${esc(p.studentKey)}">${ui('editGrades')}</button></td></tr>`}).join('');
  app.innerHTML=contentPage(ui('teacherTitle'),ui('teacherLead'),`<div class="admin-toolbar"><div class="page-actions"><button class="btn btn-primary" id="createLive">${ui('createSession')}</button><button class="btn btn-secondary" id="exportAll">${ui('exportAll')}</button></div><button class="btn btn-neutral" id="adminLogout">${ui('teacherLogout')}</button></div><div class="split"><div class="panel"><h2>${ui('students')} · ${profiles.length}</h2><input id="studentFilter" placeholder="${esc(ui('filter'))}"><div class="table-wrap" style="margin-top:12px"><table class="data-table"><thead><tr><th>${ui('fullName')}</th><th>${ui('group')}</th><th>${ui('totalScore')}</th><th>${ui('completedCount')}</th><th>${ui('actions')}</th></tr></thead><tbody>${rows||`<tr><td colspan="5">${ui('noStudents')}</td></tr>`}</tbody></table></div></div><div class="panel" id="liveAdminPanel"><h2>${ui('activeSession')}</h2><p class="muted">${ui('noSession')}</p></div></div>`);
  app.querySelector('#adminLogout').onclick=async()=>{await backend.adminSignOut();render()};
  app.querySelector('#studentFilter').oninput=event=>{const q=event.target.value.toLowerCase();app.querySelectorAll('[data-student-row]').forEach(row=>row.hidden=!row.dataset.search.includes(q))};
  app.querySelectorAll('[data-edit-student]').forEach(btn=>btn.onclick=()=>renderStudentGrades(btn.dataset.editStudent,all));
  app.querySelector('#exportAll').onclick=()=>exportAdminCsv(profiles,all.grades||{},items);
  app.querySelector('#createLive').onclick=async()=>{const qids=data.questions.filter(q=>q.category==='Семинар 1. Ветви и уровни власти').map(q=>q.id);const selection=shuffleDet(qids,Date.now()).slice(0,10);const session=await backend.createLiveSession(selection);renderLiveAdmin(session)};
  const unsub=backend.subscribeCurrentLive(session=>{if(session)renderLiveAdmin(session)});currentCleanup=unsub;
}
function shuffleDet(arr,seed){let state=seed>>>0,copy=[...arr];const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};for(let i=copy.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
function renderStudentGrades(studentKey,all){
  const p=all.profiles[studentKey],grades=all.grades?.[studentKey]||{},items=gradeItems();
  app.innerHTML=contentPage(`${ui('editGrades')} · ${p.fullName}`,`${p.group} · ${p.ticket}`,`<div class="panel"><form id="gradeEdit" class="grade-edit-grid">${items.map(i=>`<label><span>${esc(i.title)} (${i.max})</span><input name="${esc(i.slug)}" type="number" min="0" max="${i.max}" step="0.01" value="${number(grades[i.slug]?.points)}"></label>`).join('')}<label class="full"><span>${ui('note')}</span><textarea name="note"></textarea></label><div class="full page-actions"><button class="btn btn-primary" type="submit">${ui('save')}</button><a class="btn btn-neutral" href="#admin">${ui('cancel')}</a></div></form></div>`);
  app.querySelector('#gradeEdit').onsubmit=async event=>{event.preventDefault();const fd=new FormData(event.currentTarget);const note=fd.get('note');for(const item of items)await backend.setManualGrade(studentKey,item.slug,fd.get(item.slug),note);toast(ui('saved'),'success');location.hash='admin'};
}
function renderLiveAdmin(session){
  const panel=app.querySelector('#liveAdminPanel');if(!panel)return;const qid=session.questionIds?.[session.currentIndex],q=data.questions.find(x=>x.id===qid);
  let responseData={};
  const updateLiveAdminStats=()=>{const stat=panel.querySelector('#liveResponseCount');if(stat&&qid)stat.textContent=Object.keys(responseData?.[qid]||{}).length};
  const unsub=backend.subscribeLiveResponses(session.sessionId,value=>{responseData=value;updateLiveAdminStats()});
  panel.innerHTML=`<h2>${ui('activeSession')}</h2><div class="live-code">${esc(session.code)}</div><p><span class="badge">${esc(session.state)}</span> · <strong>${session.currentIndex+1}/${session.questionIds.length}</strong> · <span id="liveResponseCount">0</span> ${ui('responses')}</p>${q?`<div class="live-admin-question"><strong>${esc(questionText(q))}</strong>${session.state==='reveal'?liveDistribution(q,responseData?.[qid]||{}):''}</div>`:`<p class="muted">${ui('adminQuizInstruction')}</p>`}<div class="page-actions" style="margin-top:14px"><button class="btn btn-primary" id="liveOpen">${session.currentIndex<0?ui('showQuestion'):ui('nextQuestion')}</button><button class="btn btn-neutral" id="liveLock" ${session.currentIndex<0?'disabled':''}>${ui('lockQuestion')}</button><button class="btn btn-secondary" id="liveReveal" ${session.currentIndex<0?'disabled':''}>${ui('revealAnswer')}</button><button class="btn btn-danger" id="liveClose">${ui('closeSession')}</button></div>`;
  updateLiveAdminStats();
  panel.querySelector('#liveOpen').onclick=async()=>{session.currentIndex=Math.min(session.questionIds.length-1,session.currentIndex+1);session.state='open';await backend.updateLiveSession(session)};
  panel.querySelector('#liveLock').onclick=async()=>{session.state='locked';await backend.updateLiveSession(session)};
  panel.querySelector('#liveReveal').onclick=async()=>{session.state='reveal';await backend.updateLiveSession(session)};
  panel.querySelector('#liveClose').onclick=async()=>{session.state='closed';await backend.updateLiveSession(session);await finalizeLiveGrades(session,responseData);toast(ui('saved'),'success');render()};
}
function liveDistribution(q,responses){const counts={};for(const x of Object.values(responses))counts[x.answer]=(counts[x.answer]||0)+1;const correct=`${q.matrix.correct.row}|${q.matrix.correct.column}`;return`<div class="live-heatmap" style="margin-top:12px">${(q.matrix.rows||[]).flatMap(r=>(q.matrix.columns||[]).map(c=>{const k=`${r.id}|${c.id}`;return`<div class="heat-cell ${k===correct?'correct':''}"><strong>${counts[k]||0}</strong><small>${esc(loc(r,'label',r.label))} · ${esc(loc(c,'label',c.label))}</small></div>`})).join('')}</div>`}
async function finalizeLiveGrades(session,responseData){
  const scores={};for(const qid of session.questionIds){const q=data.questions.find(x=>x.id===qid);if(!q)continue;const correct=`${q.matrix.correct.row}|${q.matrix.correct.column}`;for(const [studentKey,r] of Object.entries(responseData?.[qid]||{})){scores[studentKey]??={right:0,total:0};scores[studentKey].total++;if(r.answer===correct)scores[studentKey].right++}}
  for(const [studentKey,s] of Object.entries(scores)){const points=Math.round((s.right/session.questionIds.length)*5*100)/100;await backend.setManualGrade(studentKey,'seminar-1',points,'Live-квиз')}
}
function exportAdminCsv(profiles,grades,items){const rows=[['student_id','email','full_name','group',...items.map(x=>x.slug),'total']];for(const p of profiles){const g=grades[p.studentKey]||{},values=items.map(x=>number(g[x.slug]?.points)),total=values.reduce((a,b)=>a+b,0);rows.push([p.ticket,p.email,p.fullName,p.group,...values,total])}downloadCsv('rudn-gradebook.csv',rows)}
function downloadCsv(filename,rows){const text='\ufeff'+rows.map(row=>row.map(cell=>`"${String(cell??'').replaceAll('"','""')}"`).join(';')).join('\r\n');const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

function openAuthDialog(){const p=backend.getProfile();document.getElementById('authIdentifier').value=p?.email||'';document.getElementById('authFullName').value=p?.fullName||'';document.getElementById('authGroup').value=p?.group||'';document.getElementById('authRecovery').value='';authDialog.showModal()}
profileButton.addEventListener('click',openAuthDialog);
authForm.addEventListener('submit',async event=>{
  event.preventDefault();
  try{const p=await backend.saveProfile({identifier:document.getElementById('authIdentifier').value,fullName:document.getElementById('authFullName').value,group:document.getElementById('authGroup').value,recoveryPin:document.getElementById('authRecovery').value});authDialog.close();toast(`${ui(p.createdAt===p.updatedAt?'profileCreated':'profileUpdated')} ${p.recoveryPin}`,'success',9000);render()}catch(error){toast(String(error.message||error),'error')}
});
function updateLanguageSwitcher(){languageOptions.forEach(button=>{const active=button.dataset.lang===getLocale();button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))})}
languageOptions.forEach(button=>button.addEventListener('click',()=>{setLocale(button.dataset.lang);updateLanguageSwitcher();updateSync(backend.status());render()}));
window.addEventListener('hashchange',render);window.addEventListener('rudn:gradechange',()=>{if(route().name==='gradebook'||route().name==='dashboard')render()});

async function bootstrap(){
  translateDocument();updateLanguageSwitcher();versionLabel.textContent=CONFIG.version;
  backend.onStatus(updateSync);
  await Promise.all([loadData(),backend.init()]);
  updateTopProfile();await render();
  if('serviceWorker' in navigator){navigator.serviceWorker.register('service-worker.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(error=>console.warn('Service worker',error))}
}
bootstrap().catch(error=>{console.error(error);app.innerHTML=`<div class="notice danger">${esc(error.stack||error)}</div>`});
