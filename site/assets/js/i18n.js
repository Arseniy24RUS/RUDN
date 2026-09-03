const dictionaries = {
  ru: {
    courseShort:'Введение в специальность', programmeShort:'Государственное и муниципальное управление',
    navDashboard:'Курс', navGradebook:'Журнал', navLive:'Live-квиз', navPuzzle:'Карты', navMaterials:'Материалы', navProfile:'Профиль', navTeacher:'Преподавателю',
    localMode:'Локальный режим', cloudMode:'Данные синхронизируются', connectionError:'Нет связи с базой', loading:'Загрузка платформы…', signIn:'Войти', signOut:'Выйти',
    authTitle:'Вход студента', authSubtitle:'Список группы заранее не требуется', studentIdLabel:'Номер студенческого билета или корпоративный email', fullNameLabel:'Фамилия, имя, отчество', groupLabel:'Учебная группа', recoveryPinLabel:'Код восстановления (только при входе с нового устройства)', authHint:'При первом входе платформа создаст профиль. Пароль и одноразовый код не используются.', continue:'Продолжить', cancel:'Отмена', confirm:'Подтвердить',
    dashboardTitle:'Курс и учебный маршрут', dashboardLead:'Восемь лекций, восемь семинаров, интерактивные задания и единый электронный журнал.', points:'баллов', completed:'завершено', activities:'активностей', currentGroup:'текущая группа',
    lecture:'Лекция', seminar:'Семинар', open:'Открыть', start:'Начать', continueActivity:'Продолжить', grade:'Оценка', notCompleted:'не выполнено', courseProgress:'Прогресс курса', coursework:'Текущий контроль', exam:'Экзамен', total:'Итого',
    gradebookTitle:'Электронный журнал', gradebookLead:'Лучший результат по каждой активности. Максимум за дисциплину — 100 баллов.', noResults:'Результатов пока нет', exportCsv:'Экспорт CSV', refresh:'Обновить',
    materialsTitle:'Учебные материалы', materialsLead:'Рабочая программа, презентации, вопросы к экзамену и методические задания.', download:'Скачать', view:'Открыть', presentation:'Презентация', programme:'Рабочая программа дисциплины', examQuestions:'Вопросы к экзамену', seminarAssignment:'Задание к семинару',
    profileTitle:'Профиль студента', profileLead:'Идентификатор связан с результатами и не зависит от актуальности списков групп.', save:'Сохранить', changeDevice:'Вход на новом устройстве', recoveryCode:'Код восстановления', recoveryOnce:'Сохраните код: он потребуется только для восстановления профиля на другом устройстве.',
    liveTitle:'Аудиторный квиз', liveLead:'Введите код с экрана преподавателя. Ответ сохраняется сразу после выбора.', join:'Подключиться', sessionCode:'Код сессии', waiting:'Ожидание вопроса', answerSaved:'Ответ сохранён',
    puzzleTitle:'Географический конструктор', puzzleLead:'Субъекты России, муниципалитеты, страны мира и регионы других государств.', launchPuzzle:'Открыть конструктор',
    teacherTitle:'Панель преподавателя', teacherLead:'Журнал, контингент и управление аудиторным квизом.', teacherEmail:'Email преподавателя', password:'Пароль', teacherLogin:'Войти как преподаватель', firebaseSetup:'Для защищённого журнала включите Firebase Authentication и примените правила из каталога firebase.',
    test:'Тест', video:'Видео', pdf:'PDF', pptx:'PPTX', watchLecture:'Смотреть лекцию', takeTest:'Пройти тест', youtube:'YouTube', vk:'VK Видео', source:'Источник',
    quizQuestion:'Вопрос', next:'Далее', previous:'Назад', finish:'Завершить', selectAnswer:'Выберите ответ', typeAnswer:'Введите ответ', quizResult:'Результат', correct:'Верно', incorrect:'Неверно', review:'Разбор ответов', retry:'Пройти ещё раз', backToCourse:'Вернуться к курсу',
    submissionSaved:'Работа сохранена', synced:'Синхронизировано', localSaved:'Сохранено на устройстве', error:'Ошибка',
  },
  en: {
    courseShort:'Introduction to the Profession', programmeShort:'State and Municipal Administration',
    navDashboard:'Course', navGradebook:'Gradebook', navLive:'Live quiz', navPuzzle:'Maps', navMaterials:'Materials', navProfile:'Profile', navTeacher:'Instructor',
    localMode:'Local mode', cloudMode:'Cloud sync active', connectionError:'Database unavailable', loading:'Loading the platform…', signIn:'Sign in', signOut:'Sign out',
    authTitle:'Student sign-in', authSubtitle:'No preloaded class roster is required', studentIdLabel:'Student ID number or institutional email', fullNameLabel:'Full name', groupLabel:'Study group', recoveryPinLabel:'Recovery code (only on a new device)', authHint:'The platform creates your profile on first sign-in. No password or one-time code is required.', continue:'Continue', cancel:'Cancel', confirm:'Confirm',
    dashboardTitle:'Course and learning pathway', dashboardLead:'Eight lectures, eight seminars, interactive activities and a unified electronic gradebook.', points:'points', completed:'completed', activities:'activities', currentGroup:'current group',
    lecture:'Lecture', seminar:'Seminar', open:'Open', start:'Start', continueActivity:'Continue', grade:'Grade', notCompleted:'not completed', courseProgress:'Course progress', coursework:'Continuous assessment', exam:'Examination', total:'Total',
    gradebookTitle:'Electronic gradebook', gradebookLead:'The best result for each activity. The maximum course score is 100 points.', noResults:'No results yet', exportCsv:'Export CSV', refresh:'Refresh',
    materialsTitle:'Learning materials', materialsLead:'Course syllabus, presentations, examination questions and seminar instructions.', download:'Download', view:'Open', presentation:'Presentation', programme:'Course syllabus', examQuestions:'Examination questions', seminarAssignment:'Seminar assignment',
    profileTitle:'Student profile', profileLead:'Your identifier remains linked to your results even when group rosters change.', save:'Save', changeDevice:'Sign in on a new device', recoveryCode:'Recovery code', recoveryOnce:'Keep this code. It is needed only to recover your profile on another device.',
    liveTitle:'Classroom live quiz', liveLead:'Enter the code shown by the instructor. Your response is saved immediately.', join:'Join', sessionCode:'Session code', waiting:'Waiting for the question', answerSaved:'Response saved',
    puzzleTitle:'Geographic Constructor', puzzleLead:'Russian federal subjects, municipalities, countries of the world and regions of other states.', launchPuzzle:'Open constructor',
    teacherTitle:'Instructor panel', teacherLead:'Gradebook, enrolment data and classroom quiz control.', teacherEmail:'Instructor email', password:'Password', teacherLogin:'Sign in as instructor', firebaseSetup:'For a protected gradebook, enable Firebase Authentication and apply the rules from the firebase directory.',
    test:'Test', video:'Video', pdf:'PDF', pptx:'PPTX', watchLecture:'Watch lecture', takeTest:'Take test', youtube:'YouTube', vk:'VK Video', source:'Source',
    quizQuestion:'Question', next:'Next', previous:'Back', finish:'Finish', selectAnswer:'Select an answer', typeAnswer:'Enter your answer', quizResult:'Result', correct:'Correct', incorrect:'Incorrect', review:'Review answers', retry:'Try again', backToCourse:'Return to course',
    submissionSaved:'Submission saved', synced:'Synchronized', localSaved:'Saved on this device', error:'Error',
  },
  zh: {
    courseShort:'专业导论', programmeShort:'国家与市政管理',
    navDashboard:'课程', navGradebook:'成绩册', navLive:'课堂测验', navPuzzle:'地图', navMaterials:'资料', navProfile:'个人资料', navTeacher:'教师端',
    localMode:'本地模式', cloudMode:'云端同步已开启', connectionError:'无法连接数据库', loading:'正在加载平台…', signIn:'登录', signOut:'退出',
    authTitle:'学生登录', authSubtitle:'无需预先导入班级名单', studentIdLabel:'学生证号或学校邮箱', fullNameLabel:'姓名', groupLabel:'班级', recoveryPinLabel:'恢复码（仅在新设备上需要）', authHint:'首次登录时平台会创建个人资料，无需密码或一次性验证码。', continue:'继续', cancel:'取消', confirm:'确认',
    dashboardTitle:'课程与学习路径', dashboardLead:'八次讲座、八次研讨课、互动任务和统一电子成绩册。', points:'分', completed:'已完成', activities:'项活动', currentGroup:'当前班级',
    lecture:'讲座', seminar:'研讨课', open:'打开', start:'开始', continueActivity:'继续', grade:'成绩', notCompleted:'未完成', courseProgress:'课程进度', coursework:'过程性考核', exam:'考试', total:'总分',
    gradebookTitle:'电子成绩册', gradebookLead:'每项活动取最高成绩，课程总分上限为100分。', noResults:'暂无成绩', exportCsv:'导出CSV', refresh:'刷新',
    materialsTitle:'学习资料', materialsLead:'课程大纲、演示文稿、考试问题和研讨课说明。', download:'下载', view:'打开', presentation:'演示文稿', programme:'课程教学大纲', examQuestions:'考试问题', seminarAssignment:'研讨课任务',
    profileTitle:'学生个人资料', profileLead:'即使班级名单发生变化，学生标识仍与学习成果保持关联。', save:'保存', changeDevice:'在新设备上登录', recoveryCode:'恢复码', recoveryOnce:'请妥善保存此代码，仅在其他设备恢复个人资料时使用。',
    liveTitle:'课堂实时测验', liveLead:'输入教师屏幕上的会话代码；选择答案后立即保存。', join:'加入', sessionCode:'会话代码', waiting:'等待题目', answerSaved:'答案已保存',
    puzzleTitle:'地理拼图构造器', puzzleLead:'俄罗斯联邦主体、市政单位、世界各国及其他国家的一级行政区。', launchPuzzle:'打开构造器',
    teacherTitle:'教师控制台', teacherLead:'成绩册、学生信息和课堂测验控制。', teacherEmail:'教师邮箱', password:'密码', teacherLogin:'教师登录', firebaseSetup:'为确保成绩册安全，请启用Firebase Authentication并应用firebase目录中的规则。',
    test:'测验', video:'视频', pdf:'PDF', pptx:'PPTX', watchLecture:'观看讲座', takeTest:'参加测验', youtube:'YouTube', vk:'VK视频', source:'来源',
    quizQuestion:'题目', next:'下一题', previous:'上一题', finish:'完成', selectAnswer:'请选择答案', typeAnswer:'请输入答案', quizResult:'结果', correct:'正确', incorrect:'错误', review:'查看答案', retry:'重新作答', backToCourse:'返回课程',
    submissionSaved:'作业已保存', synced:'已同步', localSaved:'已保存在本设备', error:'错误',
  }
};

const flags = {ru:'🇷🇺',en:'🇬🇧',zh:'🇨🇳'};
const supported = new Set(Object.keys(dictionaries));

function browserLanguage(){
  const values = [...(navigator.languages || []), navigator.language].filter(Boolean);
  for(const value of values){
    const code = String(value).toLowerCase();
    if(code.startsWith('zh')) return 'zh';
    if(code.startsWith('ru')) return 'ru';
    if(code.startsWith('en')) return 'en';
  }
  return 'en';
}

let locale = localStorage.getItem('rudn.locale');
if(!supported.has(locale)) locale = browserLanguage();

export function getLocale(){ return locale; }
export function flag(){ return flags[locale]; }
export function t(key, fallback){ return dictionaries[locale]?.[key] ?? dictionaries.ru[key] ?? fallback ?? key; }
export function localized(obj, key, fallback=''){
  if(!obj) return fallback;
  if(locale === 'en' && obj[`${key}_en`]) return obj[`${key}_en`];
  if(locale === 'zh' && obj[`${key}_zh`]) return obj[`${key}_zh`];
  return obj[key] ?? fallback;
}
export function setLocale(next){
  if(!supported.has(next)) return;
  locale = next; localStorage.setItem('rudn.locale',next);
  document.documentElement.lang = next === 'zh' ? 'zh-Hans' : next;
  document.documentElement.dataset.locale = next;
  translateDocument();
  window.dispatchEvent(new CustomEvent('rudn:locale',{detail:{locale:next}}));
}
export function translateDocument(root=document){
  document.documentElement.lang = locale === 'zh' ? 'zh-Hans' : locale;
  document.documentElement.dataset.locale = locale;
  root.querySelectorAll?.('[data-i18n]').forEach(el=>{ el.textContent=t(el.dataset.i18n,el.textContent); });
  const flagEl=document.getElementById('languageFlag'); if(flagEl) flagEl.textContent=flag();
}

window.RUDNI18N = {
  get locale(){ return locale; },
  t(source, params={}){
    let result = dictionaries[locale]?.[source] ?? source;
    for(const [key,value] of Object.entries(params)) result = result.replaceAll(`{${key}}`,String(value));
    return result;
  },
  ready: Promise.resolve(),
};
