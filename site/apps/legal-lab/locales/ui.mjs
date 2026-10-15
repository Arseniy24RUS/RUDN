// Translation touches presentation text/labels only, never values or data-* identifiers.
const rows=`
Совместное занятие|Shared session|共同课堂
Выберите группу и создайте комнату. Вы управляете вопросами и раскрытием ответов.|Choose a group and create a room. You control the questions and reveal responses.|选择班级并创建课堂。您控制题目以及答案的公布。
Досье выполняется отдельно. К комнате можно вернуться.|Dossiers are completed separately. You can return to the room.|档案作业单独完成。您可以返回课堂。
Вернуться в комнату|Return to the room|返回课堂
Области на скане|Areas on the scan|扫描件中的区域
Федеральные акты|Federal acts|联邦法律文件
Муниципальные акты|Municipal acts|市政法律文件
Москва|Moscow|莫斯科
Архив|Archive|历史档案
Дополнительные акты|Additional acts|补充法律文件
Например, A1B2C3D4E5F6|For example, A1B2C3D4E5F6|例如 A1B2C3D4E5F6
Неверный код занятия|Invalid room code|课堂代码无效
Занятие не найдено|Room not found|未找到课堂
Время занятия истекло|The class session has expired|课堂已过期
Приём ответов закрыт|Submissions are closed|已关闭答案提交
Комната другой учебной группы или преподавателя|This room belongs to another group or teacher|该课堂属于其他班级或教师
Выберите группу|Select a group|请选择班级
Связь недоступна. Дождитесь подключения.|Connection unavailable. Wait for reconnection.|连接不可用，请等待重新连接。
Профиль изменён. Откройте модуль заново.|Your profile changed. Open the module again.|个人档案已更改，请重新打开模块。
Увеличить изображение|Open full-size image|查看原尺寸图像
Комната изменена. Подключитесь заново.|The room changed. Please reconnect.|课堂已更改，请重新连接。
На подпись|Ready to sign|待签署
Правовые акты · Семинар 4|Legal acts · Seminar 4|法律文件 · 研讨课4
На главную модуля|Module home|模块首页
Преподаватель|Teacher|教师
Практикум|Workshop|实践课
Демонстрация|Practice preview|练习预览
Вернуться к курсу|Return to course|返回课程
Разделы практикума|Workshop sections|实践课栏目
Маршрут|Route|学习路线
Занятие|Classroom|课堂
Библиотека|Library|资料库
Моё досье|My dossier|我的卷宗
Справка|Help|帮助
Открываем рабочее место…|Opening your workspace…|正在打开工作区…
Ориентир занятия – 90 минут; скорость не влияет на балл|Suggested duration: 90 minutes. Speed does not affect your score.|建议用时90分钟，速度不影响得分。
/ 90 мин|/ 90 min|/ 90分钟
Только просмотр|Read only|只读
Сохраняем…|Saving…|正在保存…
Сохранено на устройстве|Saved on this device|已保存到本设备
Сохранение на устройстве|Work is saved on this device|作答保存在本设备
Резервное локальное сохранение|Saved on this device|已保存到本设备
Закрыть сообщение|Dismiss message|关闭消息
РАБОЧЕЕ МЕСТО · 04|WORKSPACE · 04|工作区 · 04
Найдите норму.|Find the rule.|找到法条。
Обоснуйте ответ.|Support your answer.|说明依据。
Распознайте документ, найдите норму и подготовьте досье.|Read the act, find the rule and prepare your dossier.|识别文件、查找条款、完成卷宗。
Начать занятие|Start the workshop|开始学习
Продолжить занятие|Continue workshop|继续学习
Открыть библиотеку|Open library|打开资料库
Отправлено ответов|Answers submitted|已提交答案
Основных актов|Core legal acts|主要法律文件
Вариантов досье|Dossier variants|档案版本
Ваш маршрут|Your route|你的学习路线
Ориентир · 90 минут|Suggested duration · 90 minutes|建议用时 · 90分钟
Прочитать скан|Read a scan|阅读扫描件
Выберите реквизиты прямо на изображении.|Select the details on the image.|直接在图像上选择文件要素。
Определить вид акта|Identify the act type|识别文件类型
Соотнесите автора, заголовок и вид документа.|Match the issuer, heading and type.|将发布机关、标题与类型相联系。
Найти положение|Find a provision|查找条款
Используйте оглавление и поиск по документу.|Use the contents and document search.|使用目录和文件搜索。
6 мин|6 min|6分钟
8 мин|8 min|8分钟
38 мин|38 min|38分钟
САМОСТОЯТЕЛЬНАЯ РАБОТА|INDIVIDUAL WORK|独立作业
Одно досье. Все основные навыки.|One dossier. All the core skills.|一份卷宗，涵盖核心技能。
Другие сканы, другие ситуации, случайное назначение. Реквизиты, виды актов, поиск документа и правовое основание. До 5 баллов.|New scans and situations, assigned at random. Document details, act types, document search and legal evidence. Up to 5 points.|随机分配新的扫描件和情境，考查文件要素、文件类型、查找文件及法律依据，最高5分。
Открыть досье|Open dossier|打开卷宗
Перейти к досье|Go to dossier|进入卷宗
Дополнительные ситуации|Additional cases|补充情境
Проверить утверждение|Check a claim|核查说法
Документ на дату события|Law on the event date|事件发生时的法律
Материалы временно недоступны|Materials temporarily unavailable|材料暂不可用
Часть документов ещё не готова. Можно тренироваться; отправка досье на оценку откроется после проверки материалов.|Some documents are not ready. Practice remains available; graded submission will open after the materials are checked.|部分文件尚未就绪。仍可练习，材料核查后将开放评分提交。
Совместная работа|Work with your class|课堂协作
Связь недоступна. Локальные ответы сохранены.|Connection unavailable. Your answers are saved on this device.|连接不可用，答案已保存在本设备。
Вы подключены к занятию.|You are connected to the class.|你已加入课堂。
Отключиться|Leave room|退出课堂
Введите код, который покажет преподаватель. Ответы группы появятся после раскрытия.|Enter the code shown by your teacher. Group results appear when the teacher reveals them.|输入教师提供的课堂代码。教师公布后可查看班级汇总结果。
Группа|Group|班级
Создать занятие|Create room|创建课堂
Код занятия|Room code|课堂代码
Подключиться|Join room|加入课堂
Например, AB12CD34|For example, AB12CD34|例如 AB12CD34
Задание|Task|任务
СОВМЕСТНЫЙ МАРШРУТ|CLASSROOM ROUTE|课堂学习路线
Дополнительная ситуация|Additional case|补充情境
На скане|On the scan|扫描件
Вид акта|Act type|文件类型
В документе|In the document|文件正文
На дату события|At the event date|事件日期
Нажмите на подходящую рамку.|Select the appropriate frame.|选择适当的框。
Восстановите вид реального документа по автору и заголовку.|Identify the act type from its issuer and heading.|根据发布机关和标题识别文件类型。
Ответьте фрагментом документа. Нажмите на абзац. При необходимости отметьте несколько.|Answer with evidence from the document. Select a paragraph, or several where needed.|用文件段落作答，必要时可选择多段。
Основание найдено|Legal basis found|已找到法律依据
Основание найдено частично|Legal basis partly found|已找到部分法律依据
Сопоставьте ответ с документом|Compare your answer with the document|请将答案与文件对照
Уберите лишние фрагменты.|Remove unrelated passages.|请移除无关段落。
Выделение пока неполное.|Your selection is incomplete.|所选内容尚不完整。
← Назад|← Back|← 返回
Далее →|Next →|下一步 →
Отправить фрагмент|Submit answer|提交答案
Проверить ответ|Check answer|检查答案
Реальный документ · исторический образец|Authentic document · historical sample|真实文件 · 历史样本
Уменьшить скан|Zoom out|缩小
Увеличить скан|Zoom in|放大
Изображение не найдено|Image unavailable|图像不可用
ВИД ДОКУМЕНТА|ACT TYPE|文件类型
Вид документа|Act type|文件类型
Указ|Presidential decree|总统令
Постановление|Resolution|决议
Распоряжение|Executive order|指令
Приказ|Administrative order|命令
Решение|Decision|决定
Открыть оригинал|Open original|打开原件
Источник документа|Document source|文件来源
Источник|Source|来源
Оглавление|Contents|目录
Оглавление документа|Document contents|文件目录
Поиск по словам в документе|Search words in this document|在文件中搜索词语
Поиск в документе|Search document|搜索文件
Найти|Search|搜索
Сбросить|Clear|清除
Совпадений нет. Попробуйте другое слово.|No matches. Try another word.|没有匹配结果，请换一个词。
Текст документа|Document text|文件正文
← К документам|← Back to documents|← 返回文件列表
ПРАВОВЫЕ ИСТОЧНИКИ|LEGAL SOURCES|法律资料
Найдите документ для задачи|Find the relevant document|查找相关文件
Библиотека документов|Document library|文件资料库
Название, номер или слова из текста|Title, number or words in the text|标题、编号或正文词语
Поиск по библиотеке|Search library|搜索资料库
По содержанию|Search full text|搜索全文
Выберите акт, затем откройте его и найдите правовое основание. Варианты ответов не предлагаются.|Choose an act, open it and find the legal basis. No multiple-choice answers are provided.|选择文件，打开并查找法律依据。本任务不提供备选答案。
Оглавление и поиск доступны для каждого установленного текста.|Each document has contents and search.|每份文件均提供目录和搜索。
Полный текст|Full text|全文
Выдержки|Extracts|节选
✓ Выбран|✓ Selected|✓ 已选择
Выбрать акт|Select act|选择文件
Читать|Read|阅读
Открыть →|Open →|打开 →
Документы не найдены. Попробуйте сократить запрос.|No documents found. Try a shorter query.|未找到文件，请缩短查询词。
25 МИНУТ · ДО 5 БАЛЛОВ|25 MINUTES · UP TO 5 POINTS|25分钟 · 最高5分
Ваше самостоятельное досье|Your individual dossier|你的独立卷宗
Реквизиты|Document details|文件要素
Три области реального скана|Three areas of an authentic scan|真实扫描件的三个区域
Виды документов|Act types|文件类型
Два новых автора и заголовка|Two new issuers and headings|两组新的发布机关与标题
Поиск документа|Document search|查找文件
Нужный акт в общей библиотеке|Find the act in the library|在资料库中找到相关文件
Правовое основание|Legal evidence|法律依据
Достаточный фрагмент текста|Select sufficient evidence|选择充分的条款依据
Получить досье|Get my dossier|领取卷宗
Пройти тренировочное досье|Try a practice dossier|开始练习卷宗
Где указан орган-издатель?|Where is the issuing authority?|发布机关在哪里？
Где дата документа?|Where is the date?|日期在哪里？
Где номер документа?|Where is the document number?|文件编号在哪里？
Сначала найдите и выберите документ на предыдущем этапе.|First select a document in the previous step.|请先在上一步选择文件。
Проверьте собранное досье|Review your dossier|检查卷宗
Области скана:|Scan areas:|扫描件区域：
Виды документов:|Act types:|文件类型：
Выбрано актов:|Acts selected:|已选文件：
Выбрано фрагментов:|Passages selected:|已选段落：
До отправки можно вернуться к любому этапу. После отправки эта попытка становится доступной только для просмотра. Полнота и точность будут проверены вместе.|You can return to any step before submitting. Afterwards this attempt becomes read-only. Both completeness and precision count.|提交前可返回任何步骤。提交后本次作答变为只读，完整性与准确性共同计分。
Завершить работу?|Finish this dossier?|完成卷宗？
Будут отправлены текущие ответы, включая незаполненные позиции.|Your current answers will be submitted, including any unanswered items.|将提交当前答案，包括未作答项目。
Да, завершить|Yes, finish|确认完成
Вернуться к проверке|Return to review|返回检查
Завершить и проверить досье|Submit and check dossier|提交并检查卷宗
Виды актов|Act types|文件类型
Документ|Document|文件
Основание|Evidence|依据
Отправка|Submit|提交
Этапы досье|Dossier steps|卷宗步骤
← Предыдущий этап|← Previous step|← 上一步
Следующий этап →|Next step →|下一步 →
Досье проверено|Dossier checked|卷宗已检查
Результат тренировочный и не отправляется в журнал.|This is a practice result; no grade is submitted.|本结果为练习结果，不计入成绩册。
Результат передан в журнал. Статус синхронизации доступен в журнале курса.|The result was sent to the gradebook. Check its sync status in the course gradebook.|结果已发送至成绩册，可在课程成绩册查看同步状态。
Результат сохранён. Отправка в журнал ещё не подтверждена.|Result saved. Gradebook delivery is not yet confirmed.|结果已保存，尚未确认发送至成绩册。
Реквизиты на скане|Details on the scan|扫描件要素
Ваш ответ|Your answer|你的答案
Правильное основание|Required evidence|正确依据
Почему такой балл|Why this score|评分说明
Не выбрано|Not selected|未选择
Все позиции совпадают. Баллы начислены полностью.|All items match. Full credit awarded.|所有项目均匹配，获得满分。
Правильных позиций: {n} из {total}. Каждая позиция даёт одинаковую долю балла.|Correct items: {n} of {total}. Each item contributes equally.|正确项目：{n}/{total}。各项目占分相同。
Учитываются совпавшие документы, пропуски и лишние акты.|Credit accounts for matching documents, omissions and extra acts.|根据正确文件、遗漏及多选文件计算得分。
Совпало: {matched}; пропущено: {missing}; лишних: {extra}. Балл учитывает полноту и точность выделения.|Matched: {matched}; missing: {missing}; extra: {extra}. Credit reflects completeness and precision.|匹配：{matched}；遗漏：{missing}；多选：{extra}。依据完整性和准确性计分。
Фрагменты относятся к документу, который вы не выбрали. За основание баллы не начислены.|Evidence comes from an act you did not select. No evidence credit was awarded.|所选依据来自未选中的文件，法律依据项不得分。
Сохранить отчёт|Save report|保存报告
Повторить передачу в журнал|Retry gradebook delivery|重试发送成绩册
К маршруту|Back to route|返回学习路线
СПРАВКА|HELP|帮助
Как работать с документами|Working with documents|如何使用文件
Рамки на скане|Frames on scans|扫描件上的框
Выберите область, отвечающую на вопрос. Масштаб меняет размер страницы, но сохраняет положение рамок. Номер акта, номер государственной регистрации и подпись – разные элементы.|Select the area answering the question. Zoom keeps frames aligned. Act number, registration number and signature are different details.|选择回答问题的区域。缩放时框仍与原件对齐。文件编号、国家登记编号和签名是不同要素。
Ответ фрагментом|Answer with evidence|以条款作答
Найдите положение с помощью оглавления или поиска. Нажмите на абзац. Для составного ответа отметьте несколько. Лишние фрагменты снижают точность ответа.|Use contents or search to find a provision. Select one or more paragraphs. Extra passages reduce precision.|通过目录或搜索查找条款，可选择一段或多段。多选无关段落会降低准确性。
Ориентируйтесь на автора и содержание заголовка. Проверка относится к конкретному реальному акту. Распоряжения не ограничены вопросами о сотрудниках.|Use the issuer and heading. Each question concerns a specific real act. Executive orders are not limited to personnel matters.|根据发布机关和标题判断。每题均针对具体真实文件，指令不限于人事事务。
Код открывает комнату вашей группы. Преподаватель управляет вопросом и моментом раскрытия рамок. В самостоятельной работе ответы группы недоступны.|The code opens your group’s room. The teacher controls questions and reveal timing. Group answers are unavailable in individual work.|代码用于加入本班课堂。教师控制题目和公布时机，独立作业中不可查看班级答案。
Схемы из лекции|Lecture diagrams|讲座图示
Ниже сохранены авторские схемы. Они помогают ориентироваться в примерах; правовая форма каждого задания проверяется по его оригиналу.|These lecture diagrams help you navigate examples. Verify each act’s form against its original.|讲座图示帮助理解例子，具体文件形式应以原件核对。
Федеральный уровень|Federal level|联邦层级
Уровень субъекта|Regional level|联邦主体层级
Муниципальный уровень|Municipal level|市政层级
Источники и авторство|Sources and authorship|来源与作者
Экспортировать локальную работу|Export saved work|导出已保存作业
Орган-издатель|Issuing authority|发布机关
Дата документа|Document date|文件日期
Номер документа|Document number|文件编号
Номер приказа|Order number|命令编号
Гриф утверждения|Approval block|批准标记
Гриф согласования|Endorsement block|会签标记
Заголовок|Heading|标题
Заголовок документа|Document heading|文件标题
Заголовок положения|Regulations heading|规定标题
Подпись|Signature|签名
Подписи|Signatures|签名
Подпись лица, издавшего приказ|Issuing official’s signature|命令发布人签名
Отметка государственной регистрации|State registration mark|国家登记标记
Отметка об ознакомлении|Acknowledgement mark|签收标记
Сначала выберите область, вид документа или фрагмент.|Select an area, act type or passage first.|请先选择区域、文件类型或段落。
Достигнут предел фрагментов. Уберите лишний, прежде чем добавить новый.|Selection limit reached. Remove a passage before adding another.|已达选择上限，请先移除一段再添加。
Для досье можно выбрать до трёх документов|You can select up to three acts|最多可选择三份文件
Самостоятельная работа ещё не открыта|Individual work is not open yet|独立作业尚未开放
Не удалось выполнить действие. Ответы сохранены. Повторите попытку.|Could not complete the action. Your answers are saved. Please retry.|无法完成操作，答案已保存，请重试。
Не удалось открыть материалы. Проверьте соединение и повторите загрузку.|Could not open the materials. Check your connection and retry.|无法打开材料，请检查连接并重新加载。
Повторить загрузку|Retry loading|重新加载
Модуль не открылся|The module could not open|无法打开模块
Сохранено на устройстве. Облачная копия черновика пока недоступна.|Saved on this device. The online draft is temporarily unavailable.|已保存到本设备，在线草稿暂不可用。
Работа изменена на другом устройстве. Обновите страницу, чтобы загрузить актуальный черновик.|Work changed on another device. Reload to load the current draft.|另一设备上的作业已更改，请刷新以加载最新草稿。
Другая вкладка редактирует эту работу. Здесь доступен просмотр. Закройте другую вкладку и обновите страницу.|Another tab is editing this work. This tab is read-only. Close the other tab and reload.|另一标签页正在编辑，本页只读。请关闭另一标签页后刷新。
Сохранённая работа относится к прежнему комплекту заданий. Экспортируйте её и обратитесь к преподавателю.|Saved work belongs to an earlier task set. Export it and contact your teacher.|已保存作业属于旧版任务，请导出并联系教师。
Тренировка|Practice|练习
Связь с занятием прервалась. Ответы сохранены; попробуйте подключиться снова.|The class connection was interrupted. Answers are saved; please reconnect.|课堂连接中断，答案已保存，请重新连接。
Ответ сохранён на устройстве. Не удалось отправить его в комнату; попробуйте ещё раз.|Answer saved on this device. Room delivery failed; please retry.|答案已保存在本设备，未能发送至课堂，请重试。
Результат сохранён. Не удалось отправить его в журнал; повторите отправку.|Result saved. Gradebook delivery failed; please retry.|结果已保存，未能发送至成绩册，请重试。
Скрыть рамки группы|Hide group selections|隐藏班级选择
Показать рамки группы|Show group selections|显示班级选择
Скрыть ответ|Hide answer|隐藏答案
Открыть ответ|Reveal answer|公布答案
Возобновить приём|Reopen submissions|重新接收答案
Закрыть приём|Close submissions|关闭答案提交
`.trim().split('\n').map(line=>line.split('|'));
const patterns=[];const exact=new Map();
for(const [ru,en,zh] of rows){if(ru.includes('{')){const keys=[];const source=ru.split(/(\{\w+\})/).map(x=>/^\{/.test(x)?(keys.push(x.slice(1,-1)),'(.+?)'):x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('');patterns.push({re:new RegExp('^'+source+'$'),keys,en,zh});}else exact.set(ru,{en,zh});}
export function normalizeLocale(value){return /^zh/i.test(value)?'zh':/^en/i.test(value)?'en':'ru';}
export function translate(text,locale){
 const lang=normalizeLocale(locale);if(lang==='ru')return String(text??'');const raw=String(text??''),s=raw.trim();let result=exact.get(s)?.[lang];
 if(result===undefined&&s.endsWith(' →'))return raw.replace(s,translate(s.slice(0,-2),lang)+' →');
 if(result===undefined&&s.startsWith('✓ '))return raw.replace(s,'✓ '+translate(s.slice(2),lang));
 if(result===undefined&&s.includes(' · слайд ')){const [label,n]=s.split(' · слайд ');return raw.replace(s,translate(label,lang)+(lang==='en'?' · slide ':' · 幻灯片 ')+n);}
 if(result===undefined){for(const p of patterns){const m=s.match(p.re);if(m){result=p[lang].replace(/\{(\w+)\}/g,(_,k)=>m[p.keys.indexOf(k)+1]);break;}}}
 if(result===undefined){const dynamic=[
 [/^Ваше досье (.+)$/,'Your dossier $1','你的卷宗 $1'],[/^Совместное занятие (.+)$/,'Classroom $1','课堂 $1'],[/^Документ (\d+)$/,'Document $1','文件 $1'],[/^Область (\d+)$/,'Area $1','区域 $1'],[/^Выбрать область (\d+)$/,'Select area $1','选择区域 $1'],[/^Найдено фрагментов: (\d+)$/,'Passages found: $1','找到段落：$1'],[/^(\d+) документов$/,'$1 documents','$1份文件'],[/^(\d+) ответов$/,'$1 answers','$1份答案'],[/^(\d+) выбрали$/,'$1 selected','$1人选择'],[/^Первые найденные фрагменты: (\d+)$/,'First matching passages: $1','首批匹配段落：$1'],[/^фрагм\. выбрано · максимум (\d+)$/,'selected · maximum $1','已选段落 · 最多$1段'],[/^Комната (.+) · (\d+) ответов( · приём закрыт)?$/,'Room $1 · $2 responses$3','课堂 $1 · $2份作答$3'],[/^ДОСЬЕ (.+) · (.+)$/,'DOSSIER $1 · $2','卷宗 $1 · $2'],[/^Занятие (.+)\. Готово к совместной работе\.$/,'Room $1 is ready.','课堂 $1 已就绪。']
 ];for(const [re,en,zh] of dynamic){if(re.test(s)){result=s.replace(re,lang==='en'?en:zh);break;}}
 }
 if(result===undefined&&s.startsWith('После начала система случайно закрепит'))result=lang==='en'?'A dossier is assigned when you start and remains yours after reload. Its case and scans differ from the classroom tasks.':'开始后将随机分配卷宗，刷新后仍保留原分配。情境和扫描件与课堂任务不同。';
 if(result===undefined&&s.startsWith('Сканы в первых этапах'))result=lang==='en'?'The initial scans are separate reading exercises; they are not evidence of the case facts.':'前几步的扫描件是独立阅读练习，不是情境事实的证明。';
 if(result!==undefined)return raw.replace(s,result.replace(' · приём закрыт',lang==='en'?' · submissions closed':' · 已关闭提交').replace('ТРЕНИРОВКА',lang==='en'?'PRACTICE':'练习').replace('САМОСТОЯТЕЛЬНАЯ РАБОТА',lang==='en'?'INDIVIDUAL WORK':'独立作业').replace('РАБОТА ЗАВЕРШЕНА',lang==='en'?'COMPLETED':'已完成'));
 return raw;
}
export function translateDOM(root,locale){
 root.lang=normalizeLocale(locale);if(root.lang==='ru')return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()){if(node.parentElement?.closest('[data-original],script,style'))continue;node.textContent=translate(node.textContent,locale);}
 for(const el of root.querySelectorAll('[aria-label],[placeholder],[title],[alt]'))for(const attr of ['aria-label','placeholder','title','alt'])if(el.hasAttribute(attr)&&!el.closest('[data-original]'))el.setAttribute(attr,translate(el.getAttribute(attr),locale));
}
