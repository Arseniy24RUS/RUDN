import {localizedAuthorityName} from './authority-picker.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display=(value,locale)=>typeof value==='string'?value:value?.[locale]||value?.ru||'';
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.split('-').reverse().join('.'):'—';
const copy={
 ru:{dates:'Даты обращения',sent:'Отправлено',received:'Поступило',registered:'Зарегистрировано',referral:'Предельный срок передачи',deadline:'Предельный срок рассмотрения',calendar:'Сроки обращения',open:'Выбрать даты в календаре',registration:'Регистрация в течение 3 дней',yes:'Да',no:'Нет',review:'Проверка сроков',correct:'Верно',wrong:'Нужно исправить',your:'Ваш ответ',expected:'Правильный ответ',recipient:'Кто рассматривает обращение',fine:'Почему важно соблюдать сроки',fineLead:'Нарушение порядка рассмотрения обращений может повлечь ответственность для должностного лица.',fineAmount:'Штраф: 5 000–10 000 ₽',source:'Статья 5.59 КоАП РФ',calculation:'Срок передачи — 7 дней от регистрации, срок рассмотрения — 30 дней. Эти сроки не складываются. В этом задании отсчёт начинается на следующий день; выходные входят в срок.'},
 en:{dates:'Appeal dates',sent:'Sent',received:'Received',registered:'Registered',referral:'Refer to the competent authority by',deadline:'Review the appeal by',calendar:'Appeal deadlines',open:'Choose dates in the calendar',registration:'Registered within 3 days',yes:'Yes',no:'No',review:'Deadline review',correct:'Correct',wrong:'Needs correction',your:'Your answer',expected:'Correct answer',recipient:'Authority responsible for the appeal',fine:'Why deadlines matter',fineLead:'Breaching the procedure for reviewing appeals may result in liability for the official.',fineAmount:'Fine: RUB 5,000–10,000',source:'Article 5.59 of the Administrative Offences Code',calculation:'Referral: 7 days from registration. Review: 30 days from registration. Do not add these periods together. In this exercise, count from the next day and include weekends.'},
 zh:{dates:'来信日期',sent:'寄出',received:'收到',registered:'登记',referral:'移送主管机关的截止日',deadline:'审理来信的截止日',calendar:'办理期限',open:'在日历中选择日期',registration:'在3天内登记',yes:'是',no:'否',review:'期限核对',correct:'正确',wrong:'需要修改',your:'您的答案',expected:'正确答案',recipient:'处理来信的机关',fine:'遵守期限的重要性',fineLead:'违反来信办理程序可能导致公职人员承担责任。',fineAmount:'罚款：5,000—10,000卢布',source:'《行政违法法典》第5.59条',calculation:'移送期限为登记后7天，审理期限为登记后30天。两个期限不能相加。本练习从次日起按日历日计算，包含周末。'}
};
const fineQuote='Нарушение установленного законодательством Российской Федерации порядка рассмотрения обращений граждан, объединений граждан, в том числе юридических лиц, должностными лицами государственных органов, органов местного самоуправления, государственных и муниципальных учреждений и иных организаций, на которые возложено осуществление публично значимых функций, за исключением случаев, предусмотренных статьями 5.39, 5.63 настоящего Кодекса, — влечет наложение административного штрафа в размере от пяти тысяч до десяти тысяч рублей.';
const standardEvents=['sent','received','registered'];
const targetIds=['referral','deadline'];

function calendarRows(calendar,t,locale){
 const targets=calendar?.targets??targetIds.map(id=>({id}));
 const rows=targets.filter(target=>targetIds.includes(target.id)).map(target=>({id:target.id,label:display(target.label,locale)||t[target.id]}));
 if(calendar?.registrationCheck!==false)rows.push({id:'registrationTimely',label:t.registration});
 return rows;
}

function rowValue(id,value,t){
 return id==='registrationTimely'?(value?t.yes:t.no):date(value);
}

export function caseTimelineView(workbook,{locale='ru'}={}){
 const events=workbook?.events??[];
 if(!events.length)return '';
 const t=copy[locale]||copy.ru;
 const kind=event=>standardEvents.includes(event.kind)?event.kind:standardEvents.includes(event.id)?event.id:'other';
 const ordered=[...standardEvents,'other'].flatMap(category=>events.filter(event=>kind(event)===category));
 return `<dl class="rxa-case-timeline" aria-label="${esc(t.dates)}">${ordered.map(event=>{
   const category=kind(event),label=category==='other'?display(event.label,locale):t[category];
   return `<div class="event-${category}"><dt>${esc(label)}</dt><dd><time datetime="${esc(event.date)}">${date(event.date)}</time></dd></div>`;
 }).join('')}</dl>`;
}
export function workbookSummaryView(decision,{locale='ru',workbook}={}){
 const t=copy[locale]||copy.ru;
 const selected={referral:decision.workbook?.referralDeadline,deadline:decision.deadline,registrationTimely:decision.workbook?.registrationTimely};
 const rows=calendarRows(workbook,t,locale).map(({id,label})=>`<div><dt>${esc(label)}</dt><dd>${esc(rowValue(id,selected[id],t))}</dd></div>`).join('');
 return `<section class="rxa-workbook-summary" data-deadline-summary><h3>${esc(t.calendar)}</h3><dl>${rows}</dl><button type="button" class="rxa-btn quiet" data-action="page" data-page="calendar">${esc(t.open)}</button></section>`;
}
export function workbookFeedbackView(feedback,{locale='ru',training=false,internalSources=false}={}){
 const w=feedback?.workbook;if(!w?.calendar)return '';const t=copy[locale]||copy.ru,c=w.calendar;
 const rows=calendarRows(c,t,locale).map(({id,label})=>{
   const correct=c.correct[id],selected=rowValue(id,c.selected[id],t),expected=rowValue(id,c.expected[id],t);
   return `<div class="rxa-workbook-check ${correct?'correct':'incorrect'}"><strong>${esc(label)} · ${esc(correct?t.correct:t.wrong)}</strong><p>${esc(t.your)}: ${esc(selected)}${correct?'':`<br>${esc(t.expected)}: <strong>${esc(expected)}</strong>`}</p></div>`;
 }).join('');
 const calculation=display(c.instructions,locale)||(c.targets||c.special?'':t.calculation);
 const authority=w.routing?`<div class="rxa-workbook-check ${w.routing.correct?'correct':'incorrect'}"><strong>${esc(t.recipient)} · ${esc(w.routing.correct?t.correct:t.wrong)}</strong><p>${w.routing.correct?'':esc(t.expected)+': '}${w.routing.expectedRecipients.map(row=>esc(localizedAuthorityName(row,locale))).join('; ')}</p></div>`:'';
 const fine=training&&c.wrongDates&&(c.liabilityApplicable??c.version!==2)?`<aside class="rxa-deadline-liability" data-deadline-liability><h3>${esc(t.fine)}</h3><p>${esc(t.fineLead)}</p><strong>${esc(t.fineAmount)}</strong><details><summary>${esc(t.source)}</summary><blockquote lang="ru">${esc(fineQuote)}</blockquote>${internalSources?`<button type="button" class="rxa-btn quiet" data-normative-doc="koap">${esc(t.source)}</button>`:`<a href="https://www.consultant.ru/document/cons_doc_LAW_34661/d77345129355a19915d59a897cdff745a2a55258/" target="_blank" rel="noopener noreferrer">${esc(t.source)}</a>`}</details></aside>`:'';
 return `<section class="rxa-workbook-feedback" data-workbook-feedback><h3>${esc(t.review)}</h3>${rows}${calculation?`<p class="rxa-workbook-counting">${esc(calculation)}</p>`:''}${authority}${fine}</section>`;
}
