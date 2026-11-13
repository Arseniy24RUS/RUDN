import {parseDateOnly} from './authored.mjs';
import {fail,fields,copy} from './schema.mjs';
import {publicRoutingWorkflow,validateRoutingWorkflowDecision,evaluateRoutingWorkflow} from './routing-workflow.mjs';
import {CALENDAR_RULES,WORKBOOK_CALENDAR,calculateWorkbookDeadline} from './workbook-calendar.mjs';
import {calendarNormId,calendarNorms} from './workbook-norms.mjs';

export const LEGACY_WORKBOOK_VERSION=1;
export const WORKBOOK_VERSION=2;
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
export function supportsWorkbook(c,version=LEGACY_WORKBOOK_VERSION){
 if(version===LEGACY_WORKBOOK_VERSION)return supportsBasicWorkbook(c);
 if(version!==WORKBOOK_VERSION||!publicRoutingWorkflow(c.id))return false;
 return [c,...(c.dateVariants||[])].every(row=>{
  const calendar=row.rubric?.authored?.calendar;
  return Boolean(calendar&&CALENDAR_RULES[calendar.rule]&&parseDateOnly(row.rubric.deadline)&&row.public.assessment?.calendar?.events.some(event=>event.id===calendar.anchor&&parseDateOnly(event.date)));
 });
}
export function publicWorkbook(c,version=LEGACY_WORKBOOK_VERSION){
 if(version===WORKBOOK_VERSION)return supportsWorkbook(c,version)?publicCaseWorkbook(c):null;
 if(!supportsBasicWorkbook(c))return null;
 return {version,events:workbookEvents(c),targets,registrationCheck:true,...publicRoutingWorkflow(c.id)};
}
export function validateWorkbookDecision(value,version=LEGACY_WORKBOOK_VERSION){
 if(![LEGACY_WORKBOOK_VERSION,WORKBOOK_VERSION].includes(version))fail('invalid_workbook');
 const d=fields(value,['referralDeadline','registrationTimely','routing']);
 if(typeof d.referralDeadline!=='string'||d.referralDeadline!==''&&!parseDateOnly(d.referralDeadline)||typeof d.registrationTimely!=='boolean')fail('invalid_decision');
 return {referralDeadline:parseDateOnly(d.referralDeadline)||'',registrationTimely:d.registrationTimely,routing:validateRoutingWorkflowDecision(d.routing)};
}
export function evaluateWorkbook(c,decision,feedback,version=LEGACY_WORKBOOK_VERSION){
 if(version===WORKBOOK_VERSION)return evaluateCaseWorkbook(c,decision,feedback);
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

function caseCalendar(c){
 const authored=c.rubric.authored.calendar,rule=CALENDAR_RULES[authored.rule],normId=calendarNormId(c);
 const events=c.public.assessment.calendar.events.map(event=>({id:event.id,date:parseDateOnly(event.date),label:copy(event.label),kind:['sent','received','registered'].includes(event.id)?event.id:'event'}));
 const dual=normId==='review59'&&authored.anchor==='registered'&&authored.rule==='calendar30';
 const registrationCheck=(normId.endsWith('59')||normId.startsWith('information'))&&events.some(event=>event.id==='registered')&&events.some(event=>event.id==='received');
 const shift=authored.acceptedShifts.includes('next_working_day')?'next_working_day':authored.acceptedShifts[0];
 const label=Object.fromEntries(['ru','en','zh'].map(locale=>[locale,c.public.deadlinePrompt[locale].split('\n')[0].trim()]));
 const target={id:'deadline',label,anchorId:authored.anchor,ruleId:authored.rule,...rule};
 return {events,targets:dual?[{id:'referral',label:targets[0].label,anchorId:'registered',ruleId:'calendar7',...CALENDAR_RULES.calendar7},target]:[target],
  registrationCheck,dual,special:!['registration59','review59','referral59'].includes(normId),liabilityApplicable:normId.endsWith('59'),
  counting:{start:authored.start,shift,calendar:'ru-federal-five-day'},calendarSnapshotId:WORKBOOK_CALENDAR.id};
}
function calendarInstructions(c,task){
 const anchor=task.events.find(event=>event.id===c.rubric.authored.calendar.anchor).label,rule=CALENDAR_RULES[c.rubric.authored.calendar.rule];
 const units={'calendar-days':T('календарных дней','calendar days','个日历日'),'working-days':T('рабочих дней','working days','个工作日'),months:T('календарных месяца','calendar months','个日历月')};
 const start=task.counting.start==='exclude_anchor'?T('Исходный день не включайте: отсчёт начинается на следующий день.','Exclude the starting date; count from the following day.','不计起始日，从次日起算。'):T('Включайте исходный день в срок.','Include the starting date.','将起始日计入期限。');
 const unit=rule.unit==='months'?T('Отсчитайте соответствующее число месяцев; если такого числа в последнем месяце нет, возьмите его последний день. Это не фиксированное число дней.','Count whole months to the corresponding date; if it does not exist, use that month’s last day. Do not replace months with a fixed number of days.','按月计算至相应日期；末月无该日期时取该月最后一天。不要将月份替换为固定天数。'):
  rule.unit==='working-days'?T('Пропускайте выходные и нерабочие праздники по федеральной пятидневной неделе; учитывайте перенесённые рабочие дни.','Skip weekends and public holidays under the federal five-day calendar; include transferred working days.','按联邦每周五天工作制跳过周末和非工作节假日，并计入调休后的工作日。'):T('Включайте выходные и праздники в число календарных дней.','Include weekends and holidays when counting calendar days.','计算日历日时包括周末和节假日。');
 const shift=task.counting.shift==='next_working_day'?T('Если последний день нерабочий, перенесите окончание на ближайший следующий рабочий день.','If the last day is non-working, move the deadline to the next working day.','末日为非工作日时，顺延至下一工作日。'):T('Последний день оставьте без переноса.','Do not shift the final date.','末日不顺延。');
 const check=T('Отдельно оцените, выполнена ли регистрация в течение 3 календарных дней после поступления; в этом задании к последнему дню применяется то же правило переноса.','Separately judge whether registration was completed within 3 calendar days of receipt; this exercise uses the same final-day adjustment.','另行判断是否在收到后三个日历日内完成登记；本练习对登记期限末日采用相同的顺延规则。');
 return Object.fromEntries(['ru','en','zh'].map(locale=>{
  const intro=task.dual?T('Рассчитайте два альтернативных срока от регистрации: 7 дней на направление по компетенции и 30 дней на рассмотрение. Не складывайте 7 и 30; у нового адресата срок начинается от его регистрации.','Calculate two alternative periods from registration: 7 days for referral and 30 days for review. Do not add 7 and 30; a new recipient counts from its own registration.','从登记日起计算两个备选期限：七日转送和三十日审理。不要把7与30相加；新收件机关从自己的登记日起算。')[locale]:
   ({ru:`Исходное событие: «${anchor.ru}». Срок: ${rule.amount} ${units[rule.unit].ru}.`,en:`Starting event: “${anchor.en}”. Period: ${rule.amount} ${units[rule.unit].en}.`,zh:`起算事件：“${anchor.zh}”。期限：${rule.amount}${units[rule.unit].zh}。`})[locale];
  return [locale,[intro,start[locale],unit[locale],shift[locale],task.registrationCheck?check[locale]:''].filter(Boolean).join(' ')];
 }));
}
function publicCaseWorkbook(c){
 const task=caseCalendar(c);
 return {version:WORKBOOK_VERSION,events:task.events,targets:task.targets,registrationCheck:task.registrationCheck,special:task.special,
  instructions:calendarInstructions(c,task),counting:task.counting,calendarSnapshotId:task.calendarSnapshotId,
  norms:calendarNorms(c,task),...publicRoutingWorkflow(c.id)};
}
function evaluateCaseWorkbook(c,decision,feedback){
 if(!supportsWorkbook(c,WORKBOOK_VERSION))fail('invalid_case',503);
 const task=caseCalendar(c),events=Object.fromEntries(task.events.map(event=>[event.id,event.date])),expected={},selected={},correct={};
 for(const target of task.targets){
  expected[target.id]=target.id==='deadline'?parseDateOnly(c.rubric.deadline):calculateWorkbookDeadline({anchorDate:events[target.anchorId],ruleId:target.ruleId,...task.counting});
  selected[target.id]=parseDateOnly(target.id==='deadline'?decision.deadline:decision.workbook.referralDeadline)||'';
  correct[target.id]=selected[target.id]===expected[target.id];
 }
 if(task.registrationCheck){
  const last=calculateWorkbookDeadline({anchorDate:events.received,ruleId:'calendar3',...task.counting});
  expected.registrationTimely=events.registered>=events.received&&events.registered<=last;
  selected.registrationTimely=decision.workbook.registrationTimely;
  correct.registrationTimely=selected.registrationTimely===expected.registrationTimely;
 }
 const checkPoints=task.registrationCheck?4:0,datePoints=(20-checkPoints)/task.targets.length;
 const earned=task.targets.reduce((sum,target)=>sum+(correct[target.id]?datePoints:0),0)+(correct.registrationTimely?checkPoints:0);
 const routing=evaluateRoutingWorkflow(c.id,decision.workbook.routing),result=copy(feedback);
 for(const criterion of result.criteria){
  if(['calendar','deadline'].includes(criterion.id))criterion.earned=criterion.max*earned/20;
  if(criterion.id==='routing')criterion.earned=(c.rubric.procedureIds.includes(decision.procedureId)?7:0)+(routing?.correct?8:0);
  if(criterion.id==='route')criterion.earned=routing?.correct?criterion.max:0;
 }
 result.score=result.criteria.reduce((sum,row)=>sum+row.earned,0);
 if(Number.isFinite(result.cap))result.score=Math.min(result.score,result.cap);
 result.workbook={calendar:{version:WORKBOOK_VERSION,targets:task.targets,registrationCheck:task.registrationCheck,special:task.special,
  liabilityApplicable:task.liabilityApplicable,instructions:calendarInstructions(c,task),expected,selected,correct,wrongDates:task.targets.some(target=>!correct[target.id])},routing};
 return result;
}
