import {parseDateOnly} from './authored.mjs';
import {fail,fields,copy} from './schema.mjs';
import {publicRoutingWorkflow,validateRoutingWorkflowDecision,evaluateRoutingWorkflow} from './routing-workflow.mjs';

export const WORKBOOK_VERSION=1;
const T=(ru,en,zh)=>({ru,en,zh});
const labels={sent:T('Отправлено','Sent','寄出'),received:T('Поступило','Received','收到'),registered:T('Зарегистрировано','Registered','登记')};
const targets=[{id:'referral',label:T('Передача по компетенции','Referral to the competent authority','转送主管机关')},{id:'deadline',label:T('Ответ на обращение','Response to the appeal','答复来信')}];
// Exact obsolete exercise instructions from the authored bank. Only the v1
// feedback copy is changed; merits, legal sources and legacy snapshots remain
// intact. Do not replace this allowlist with a general legal-text filter.
const legacyCalendarInstructions={
 ru:[
  'Для этого упражнения закреплён профиль исчисления: со следующего дня после исходного события, перенос окончания вперёд, федеральная пятидневная неделя. Не переносите его автоматически на иные процедуры.',
  'Федеральная пятидневная неделя, счёт со следующего дня и перенос окончания вперёд явно заданы условием этого упражнения. Это не универсальный профиль всех процедур; он не заменяет срочную помощь или специальное оперативное действие.',
  'Правило исчисления в этом учебном деле: исходный день не включается. Считаются все календарные дни, нерабочее окончание переносится на следующий рабочий день. Этот профиль задан условием, а не распространяется автоматически на любую процедуру.',
  'Учебный профиль: со следующего дня после указанного события; нерабочее окончание переносится на ближайший рабочий день. Это не универсальное правило всех процедур. Календарный срок не заменяет оперативное реагирование.',
  'Профиль исчисления этого упражнения: исходный день исключается, окончание переносится вперёд; федеральная пятидневная рабочая неделя. Это не правило всех процедур.',
  'Правило исчисления в этом учебном деле: исходный день не включается. Считаются рабочие дни пятидневной недели РФ; региональных дополнений нет. Конец такого срока уже приходится на рабочий день.',
  'Учебный профиль: получение оператором – исходное событие, счёт со следующего дня, нерабочие дни пропускаются; итог приходится на рабочий день.',
  'Профиль счёта этого упражнения: со следующего дня после события; нерабочее окончание переносится вперёд; федеральная пятидневная неделя.',
 ],
 en:[
  'This exercise uses a fixed calculation profile: start on the day after the initial event, roll the deadline forward, and use the federal five-day week. Do not automatically apply it to other procedures.',
  'The exercise explicitly specifies a federal five-day working week, counting from the next day, and moving the end date forward. This is not a universal model for every procedure and does not replace urgent assistance or a specific immediate action.',
  'Calculation rule for this training case: exclude the triggering day. Count all calendar days; if the end falls on a non-working day, move it to the next working day. This profile is specified by the scenario and does not automatically apply to every procedure.',
  'Training convention: start on the day after the specified event; a deadline on a non-working day moves to the next working day. This is not a universal rule for all procedures. A calendar deadline does not replace prompt action.',
  "This exercise's calculation profile excludes the starting day and rolls the deadline forward, using the federal five-day working week. It is not a rule for every procedure.",
  "Calculation rule for this training case: the initial day is excluded. Count working days in Russia's five-day working week; no regional additions apply. The end of such a period already falls on a working day.",
  'Training calculation: the controller’s receipt is the triggering event; count from the next day, excluding non-working days, so the deadline falls on a working day.',
  'This exercise counts from the day after the event, moves a non-working final day forward, and uses the federal five-day working week.',
  "This exercise's calculation profile: from the day after the event; a non-working end date moves forward; the federal five-day working week.",
  'Counting rules for this exercise: from the day after the event; a non-working final day is moved forward; the federal five-day working week applies.',
 ],
 zh:[
  '本练习采用固定计算规则：从起始事件次日起算，必要时向后顺延截止日，并使用联邦五天工作周。不要自动套用于其他程序。',
  '本练习明确规定采用联邦每周五天工作制、从次日起算并向后顺延截止日。这并非适用于所有程序的通用配置，也不能代替紧急帮助或特定的即时行动。',
  '本教学案件的计算规则：不计起算当日，计算全部自然日；末日为非工作日时顺延至下一个工作日。本规则由题设指定，并不自动适用于所有程序。',
  '教学计算方式：从指定事件次日起计；若最后一天为非工作日，则顺延至最近的工作日。这不是所有程序的通用规则。日历期限不能替代及时应对。',
  '本练习的计算规则不计起始日，必要时向后顺延截止日，并采用联邦五天工作周。这并非所有程序通用的规则。',
  '本教学案例的计算规则：起始日不计入。按俄罗斯每周五天工作制计算工作日，无地区补充规定。该期限的最后一天本身即为工作日。',
  '教学计算规则：以数据处理者收件为起算事件，从次日起计算，跳过非工作日，最终期限落在工作日。',
  '本练习从事件次日开始计算，截止日为非工作日时向后顺延，采用联邦每周五天工作制。',
  '本题计算规则：从事件次日起算；非工作日截止向后顺延；采用联邦每周五天工作制。',
  '本练习的计时规则：从事件发生次日起算；截止日为非工作日时顺延；采用联邦五天工作周。',
 ],
};
function workbookExplanation(explanation){
 if(!explanation||typeof explanation!=='object')return explanation;
 return Object.fromEntries(Object.entries(explanation).map(([locale,value])=>[locale,typeof value!=='string'?value:value.split('\n\n')
  .map(paragraph=>(legacyCalendarInstructions[locale]||[]).reduce((text,obsolete)=>text.replaceAll(obsolete,''),paragraph).trim()).filter(Boolean).join('\n\n')]));
}
export function addCalendarDays(date,days){
 const normalized=parseDateOnly(date);
 if(!normalized||!Number.isSafeInteger(days))throw new TypeError('Invalid date');
 const result=new Date(normalized+'T12:00:00.000Z');result.setUTCDate(result.getUTCDate()+days);return result.toISOString().slice(0,10);
}
export function workbookEvents(c){
 const events=c.public.assessment?.calendar?.events||[];
 return ['sent','received','registered'].map(id=>{const event=events.find(row=>row.id===id);return event&&parseDateOnly(event.date)?{id,date:parseDateOnly(event.date),label:labels[id],kind:id}:null;}).filter(Boolean);
}
export function supportsBasicWorkbook(c){
 return (!c.rubric?.authored||c.rubric.authored.calendar.anchor==='registered'&&['calendar3','calendar7','calendar30'].includes(c.rubric.authored.calendar.rule))&&workbookEvents(c).length===3&&Boolean(publicRoutingWorkflow(c.id))&&(!c.dateVariants||c.dateVariants.every(variant=>workbookEvents(variant).length===3));
}
export function publicWorkbook(c){
 if(!supportsBasicWorkbook(c))return null;
 return {version:WORKBOOK_VERSION,events:workbookEvents(c),targets,registrationCheck:true,...publicRoutingWorkflow(c.id)};
}
export function validateWorkbookDecision(value){
 const d=fields(value,['referralDeadline','registrationTimely','routing']);
 if(typeof d.referralDeadline!=='string'||d.referralDeadline!==''&&!parseDateOnly(d.referralDeadline)||typeof d.registrationTimely!=='boolean')fail('invalid_decision');
 return {referralDeadline:parseDateOnly(d.referralDeadline)||'',registrationTimely:d.registrationTimely,routing:validateRoutingWorkflowDecision(d.routing)};
}
export function evaluateWorkbook(c,decision,feedback){
 const events=Object.fromEntries(workbookEvents(c).map(row=>[row.id,row.date]));
 if(!events.registered)fail('invalid_case',503);
 const expected={referral:addCalendarDays(events.registered,7),deadline:addCalendarDays(events.registered,30),registrationTimely:events.registered>=events.received&&events.registered<=addCalendarDays(events.received,3)};
 const selected={referral:decision.workbook.referralDeadline,deadline:parseDateOnly(decision.deadline)||'',registrationTimely:decision.workbook.registrationTimely};
 const correct={referral:selected.referral===expected.referral,deadline:selected.deadline===expected.deadline,registrationTimely:selected.registrationTimely===expected.registrationTimely};
 const routing=evaluateRoutingWorkflow(c.id,decision.workbook.routing);
 const result=copy(feedback);
 result.explanation=workbookExplanation(result.explanation);
 for(const criterion of result.criteria){
  if(['calendar','deadline'].includes(criterion.id))criterion.earned=criterion.max*((correct.referral?8:0)+(correct.deadline?8:0)+(correct.registrationTimely?4:0))/20;
  if(criterion.id==='routing')criterion.earned=(c.rubric.procedureIds.includes(decision.procedureId)?7:0)+(routing?.correct?8:0);
  if(criterion.id==='route')criterion.earned=routing?.correct?criterion.max:0;
 }
 result.score=result.criteria.reduce((sum,row)=>sum+row.earned,0);
 if(Number.isFinite(result.cap))result.score=Math.min(result.score,result.cap);
 result.workbook={calendar:{expected,selected,correct,wrongDates:!correct.referral||!correct.deadline},routing};
 return result;
}
