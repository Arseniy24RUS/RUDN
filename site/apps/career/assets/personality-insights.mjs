/** Educational reading of IPIP facet scores, separate from the published scoring key.
 * No population norms, occupational eligibility, or predicted performance are inferred.
 */
export const WORK_TRAITS = [
  {facet:'E3',label:['Лидерская инициатива','Leadership initiative','领导主动性'],
    low:['Вам чаще удобнее включаться в работу, когда направление уже задано. Инициативу можно пробовать на небольшой общей задаче.','You tend to join in once a direction is clear. Try taking initiative on a small shared task.','你通常更愿意在方向明确后参与工作。可以从一项小型共同任务开始尝试主动组织。'],
    mid:['Готовность задавать направление зависит от задачи и состава команды. Знакомая тема может помогать Вам проявлять инициативу.','Your willingness to set a direction depends on the task and the team. A familiar topic may help you take initiative.','你是否主动提出方向取决于任务和团队。在熟悉的领域，你可能更容易发挥主动性。'],
    high:['Вам свойственно брать инициативу, предлагать направление и стремиться руководить общей работой. Давайте участникам время высказать свои предложения.','You tend to take initiative, propose a direction and seek to lead shared work. Give others time to contribute their ideas.','你倾向于主动提出方向并组织共同工作。也要给其他成员表达建议的时间。']},
  {facet:'C3',label:['Ответственность','Responsibility','责任感'],
    low:['Соблюдение договорённостей может требовать дополнительных усилий. Полезно заранее согласовать объём обязательств и срок.','Keeping commitments may take extra effort. Agree on the scope and deadline before accepting a task.','履行约定可能需要额外努力。接受任务前，可以先明确责任范围和期限。'],
    mid:['Вы стремитесь соблюдать договорённости, хотя обстоятельства могут влиять на их выполнение. Помогает явная фиксация обещаний.','You seek to honour commitments, although circumstances may affect follow-through. Make your commitments explicit.','你努力遵守约定，但具体情况可能影响执行。明确记录承诺会有所帮助。'],
    high:['В ответах выражено стремление держать слово и соблюдать обязательства. Берите на себя объём работы, который сможете выполнить.','Your answers show a strong emphasis on keeping promises and fulfilling obligations. Accept an amount of work you can deliver.','你的回答显示出重视守信和履行责任的倾向。承担任务时也要考虑自己的实际精力。']},
  {facet:'C4',label:['Стремление к достижениям','Achievement striving','成就追求'],
    low:['Вам может быть удобнее работать в пределах конкретного задания. Ясный критерий готовности помогает видеть результат своих усилий.','You may prefer working within a clearly defined task. A clear completion criterion can make your progress easier to see.','你可能更喜欢完成范围明确的任务。清楚的完成标准有助于看到努力的成果。'],
    mid:['Вы готовы прилагать усилия, когда цель понятна и значима. Свяжите большую задачу с несколькими достижимыми этапами.','You are willing to make an effort when a goal is clear and meaningful. Break a larger task into achievable stages.','目标清晰且有意义时，你愿意投入努力。可以把较大的任务分成几个可完成的阶段。'],
    high:['Вам свойственны высокие требования к результату и готовность много работать. Заранее определяйте, когда задача выполнена достаточно хорошо.','You tend to set high standards and work hard. Decide in advance what counts as a sufficiently good result.','你倾向于追求较高标准并努力工作。可以预先明确达到什么程度就算完成。']},
  {facet:'C5',label:['Самодисциплина','Self-discipline','自律'],
    low:['Начало работы и удержание темпа могут даваться с усилием. Небольшой первый шаг и короткий срок помогают приступить к задаче.','Getting started and sustaining effort may take work. A small first step and a short deadline can help.','开始行动和保持节奏可能需要努力。先做一个小步骤、设定较短期限，可能更容易启动。'],
    mid:['Последовательность в работе зависит от ситуации. Промежуточные сроки и понятный следующий шаг помогут поддерживать темп.','Consistency varies with the situation. Intermediate deadlines and a clear next step can help you maintain momentum.','你的持续执行程度会随情境变化。阶段性截止时间和明确的下一步有助于保持节奏。'],
    high:['Вы склонны воплощать планы и последовательно выполнять задачи. Учитывайте время на отдых и непредвиденные изменения.','You tend to carry out plans and follow tasks through. Allow time for rest and unexpected changes.','你倾向于落实计划并持续推进任务。也要为休息和意外变化留出时间。']},
  {facet:'C6',label:['Обдуманность решений','Deliberation','审慎决策'],
    low:['Вы можете быстро переходить к действию. Перед важным решением полезно проверить его последствия и условия отмены.','You may move quickly into action. Before an important decision, check its consequences and whether it can be reversed.','你可能很快就采取行动。重要决策前，可以先考虑后果，以及决定是否可以撤回或纠正。'],
    mid:['Вы сочетаете предварительное обдумывание с готовностью действовать. Глубину проверки можно соотносить с последствиями решения.','You combine reflection with a willingness to act. Match the depth of your review to the consequences of the decision.','你兼顾思考与行动。可以根据决策后果的大小决定需要多深入的检查。'],
    high:['Вам свойственно обдумывать действия и избегать поспешных решений. Срок на анализ поможет вовремя переходить к исполнению.','You tend to think actions through and avoid hasty decisions. A time limit on analysis can help you move to implementation.','你倾向于仔细考虑、避免草率决定。为分析设定时间范围，有助于及时行动。']},
  {facet:'A4',label:['Сотрудничество','Cooperation','合作'],
    low:['В спорных ситуациях Вы можете резко отстаивать свою позицию. Отделяйте несогласие с предложением от отношения к человеку.','You may defend your position forcefully in disagreements. Separate disagreement with an idea from your attitude towards its author.','发生分歧时，你可能会强烈坚持立场。可以把对建议的不同看法与对人的态度分开。'],
    mid:['Вы можете как искать согласие, так и настаивать на своём. В обсуждении полезно заранее определить общий критерий решения.','You may seek agreement or stand your ground, depending on the situation. Agree on a shared decision criterion.','你会根据情况寻求共识或坚持立场。讨论前明确共同的判断标准会有所帮助。'],
    high:['В ответах выражено стремление избегать враждебности и поддерживать согласованную работу. Высказывайте существенные возражения спокойно и прямо.','Your answers show a preference for avoiding hostility and working cooperatively. State important objections calmly and directly.','你的回答显示出避免敌意、保持合作的倾向。对于重要的不同意见，也可以平静而明确地表达。']},
];

export const TEAM_ROLES = [
  {id:'coordinator',facets:['E3','C1','C3'],
    label:['Координатор','Coordinator','协调组织者'],
    description:['Инициатива, уверенность в выполнении задач и внимание к обязательствам могут поддерживать организацию общей работы.','Initiative, confidence in completing tasks and attention to commitments may support organising shared work.','主动性、完成任务的信心和履行承诺的倾向，可以支持你组织共同工作。'],
    action:['Предложите группе цель, распределите задачи по договорённости и назначьте короткую сверку результатов.','Suggest a shared goal, agree on responsibilities and arrange a short progress review.','向小组提出目标，协商分工，并安排简短的进度交流。']},
  {id:'organizer',facets:['C2','C3','C5'],
    label:['Организатор процесса','Process organiser','流程组织者'],
    description:['Предпочтение порядка и последовательности может быть полезно при планировании сроков и согласовании обязательств.','A preference for order and follow-through may help with scheduling and coordinating commitments.','重视条理和持续执行的倾向，有助于安排时间和协调任务。'],
    action:['Составьте простой план: задача, ответственный, срок и ожидаемый результат.','Create a simple plan with each task, owner, deadline and expected result.','制定简单计划，明确任务、负责人、期限和预期成果。']},
  {id:'analyst',facets:['O5','C6','C1'],
    label:['Аналитик','Analyst','分析者'],
    description:['Интерес к сложным идеям и привычка обдумывать действия могут пригодиться для разбора вариантов решения.','Interest in complex ideas and a habit of reflection may help when examining alternative solutions.','对复杂问题的兴趣以及认真思考的习惯，可以用于比较不同方案。'],
    action:['Сравните два варианта по общим критериям и объясните группе основания своего вывода.','Compare two options using shared criteria and explain the basis of your conclusion.','按照共同标准比较两个方案，并向小组说明结论的依据。']},
  {id:'supporter',facets:['A3','A4','A6'],
    label:['Связующее звено команды','Team supporter','团队支持者'],
    description:['Готовность помогать, сочувствие и стремление к сотрудничеству могут поддерживать участие других членов команды.','A willingness to help, sympathy and cooperation may support other team members’ participation.','助人意愿、同情心和合作倾向，有助于支持其他成员参与团队工作。'],
    action:['Уточните, где участникам нужна помощь, и соберите их предложения перед общим решением.','Ask where others need help and gather their suggestions before a shared decision.','了解成员需要哪些帮助，并在共同决策前汇总大家的建议。']},
  {id:'ideas',facets:['O1','O4','O5'],
    label:['Инициатор идей','Idea contributor','创意提出者'],
    description:['Воображение, интерес к новому и интеллектуальная любознательность могут пригодиться при поиске разных подходов.','Imagination, openness to new experiences and intellectual curiosity may help generate alternative approaches.','想象力、尝试新事物的意愿和求知兴趣，可以用于提出不同思路。'],
    action:['Предложите несколько способов решить задачу и выберите один для небольшой практической проверки.','Suggest several ways to solve a task and choose one for a small practical trial.','提出几种解决办法，再选择一种进行小规模实践验证。']},
  {id:'implementer',facets:['C4','C5','C1'],
    label:['Реализатор','Implementer','落实执行者'],
    description:['Стремление к результату, самодисциплина и уверенность в своих действиях могут помогать доводить планы до выполнения.','Achievement striving, self-discipline and confidence in your actions may help turn plans into completed work.','成就追求、自律和行动信心，有助于把计划转化为完成的工作。'],
    action:['Возьмите конкретную часть проекта и представьте готовый результат к согласованному сроку.','Take responsibility for a specific part of a project and deliver it by an agreed deadline.','承担项目中明确的一部分，并在约定时间提交完成成果。']},
];

/** Descriptive bands refer to response anchors, never a population distribution. */
export const expressionBand = mean => mean < 2.5 ? 'low' : mean > 3.5 ? 'high' : 'mid';

/** A transparent, deliberately modest classroom heuristic. All three supporting
 * facets must be at least neutral; the role mean must reach 3.5. There is no
 * suitability percentage. Equal third-place scores are retained, never broken
 * arbitrarily. Political beliefs, affect and demographic attributes are unused.
 */
export function suggestTeamRoles(profile) {
  const candidates=TEAM_ROLES.map(role=>{
    const values=role.facets.map(id=>profile.facets[id]?.mean);
    if(values.some(value=>!Number.isFinite(value)||value<1||value>5))throw new TypeError('Invalid facet profile.');
    return {...role,mean:values.reduce((sum,value)=>sum+value,0)/values.length,eligible:values.every(value=>value>=3)};
  }).sort((a,b)=>b.mean-a.mean);
  const eligible=candidates.filter(role=>role.eligible&&role.mean>=3.5);
  if(!eligible.length)return {kind:'exploratory',roles:[]};
  if(candidates[0].mean-candidates.at(-1).mean<0.25)return eligible.length>1?{kind:'balanced',roles:eligible}:{kind:'exploratory',roles:[]};
  const cutoff=eligible[Math.min(2,eligible.length-1)].mean;
  return {kind:'differentiated',roles:eligible.filter(role=>role.mean>=cutoff-1e-10)};
}
