import {icon} from './cabinet-icons.js';
import {BUNDLED_CALENDARS} from '../../../assets/js/calendar-bundled.js';
import {addDays,addCalendarMonths,dayInfo,formatDateOnly,monthDays,parseDateOnly} from '../../../assets/js/legal-calendar.js';
import {sourceDocumentForURL} from '../js/source-reader.js';
import {safeSourceURL} from '../js/source-reference.js';
import {documentTitles} from '../js/source-reader-translations.js';
export {createSourceReference,referenceDecisionPatch} from '../js/source-reference.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const copy={
  ru:{title:'Календарь сроков',prev:'Предыдущий месяц',next:'Следующий месяц',month:'Месяц',year:'Год',week:['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],working:'Рабочий день',rest:'Нерабочий день',holiday:'Праздник',transfer:'Перенесённый выходной',workingTransfer:'Рабочая суббота / воскресенье',shortened:'Сокращённый рабочий день',unavailable:'Эта дата вне загруженного производственного календаря.',sources:'Календарные данные',open:'Открыть документ',external:'Открыть источник',remove:'Убрать из черновика',reference:'Выбранное правовое основание',truncated:'Фрагмент сокращён до 12 000 знаков.',noSource:'Источник недоступен',},
  en:{title:'Deadline calendar',prev:'Previous month',next:'Next month',month:'Month',year:'Year',week:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],working:'Working day',rest:'Non-working day',holiday:'Public holiday',transfer:'Transferred day off',workingTransfer:'Working weekend',shortened:'Shortened working day',unavailable:'This date is outside the available production calendar.',sources:'Calendar data',open:'Open document',external:'Open source',remove:'Remove from draft',reference:'Selected legal basis',truncated:'Passage shortened to 12,000 characters.',noSource:'Source unavailable',},
  zh:{title:'期限日历',prev:'上个月',next:'下个月',month:'月份',year:'年份',week:['一','二','三','四','五','六','日'],working:'工作日',rest:'非工作日',holiday:'法定节假日',transfer:'调休休息日',workingTransfer:'周末工作日',shortened:'缩短工时的工作日',unavailable:'此日期超出了已加载的工作日历范围。',sources:'日历数据',open:'打开文件',external:'打开来源',remove:'从草稿中移除',reference:'所选法律依据',truncated:'片段已缩短至 12,000 个字符。',noSource:'来源不可用',},
};
const localeKey=value=>value==='en'||value==='zh'?value:'ru';
const languageTag=locale=>({ru:'ru-RU',en:'en-GB',zh:'zh-CN'}[localeKey(locale)]);
const localText=(value,locale)=>typeof value==='string'?value:value?.[localeKey(locale)]||value?.ru||'';
const calendarYears=snapshot=>Object.keys(snapshot.years||{}).sort();
function knownDate(value,snapshot){const date=parseDateOnly(value);return date&&snapshot.years?.[date.slice(0,4)]?date:'';}
function monthExists(value,snapshot){return /^\d{4}-\d{2}$/.test(value||'')&&Boolean(knownDate(value+'-01',snapshot));}
function nextMonth(month,delta){return addCalendarMonths(month+'-01',delta).slice(0,7);}
const calendarCopy={
  ru:{title:'Календарь сроков',intro:'Выберите даты в календаре',counting:'Считайте со следующего дня. Учитывайте выходные, последнюю дату не переносите. Каждый срок считайте отдельно.',referral:'Передать по компетенции до',deadline:'Рассмотреть обращение до',targets:'Сроки обращения',timely:'Обращение зарегистрировано своевременно',norms:'Сроки рассмотрения обращений',specialRules:'Особый порядок расчёта срока',sent:'Отправлено',received:'Поступило',registered:'Зарегистрировано',other:'Другие события',clearDate:'Очистить дату',empty:'Дата не выбрана',use:'Сохранить выбранную дату',
    rules:['Статья 8, часть 2. Письменное обращение подлежит обязательной регистрации в течение трех дней с момента поступления в государственный орган, орган местного самоуправления или должностному лицу.','Статья 8, часть 3. Письменное обращение, содержащее вопросы, решение которых не входит в компетенцию данных государственного органа, органа местного самоуправления или должностного лица, направляется в течение семи дней со дня регистрации в соответствующий орган или соответствующему должностному лицу, в компетенцию которых входит решение поставленных в обращении вопросов, с уведомлением гражданина, направившего обращение, о переадресации обращения.','Статья 12, часть 1. Письменное обращение, поступившее в государственный орган, орган местного самоуправления или должностному лицу в соответствии с их компетенцией, рассматривается в течение 30 дней со дня регистрации письменного обращения.']},
  en:{title:'Deadline calendar',intro:'Choose dates in the calendar',counting:'Start counting on the following day. Include weekends and keep the last date as it falls. Count each deadline separately.',referral:'Refer to the competent body by',deadline:'Consider the appeal by',targets:'Appeal deadlines',timely:'The appeal was registered on time',norms:'Appeal deadlines',specialRules:'Special deadline calculation',sent:'Sent',received:'Received',registered:'Registered',other:'Other events',clearDate:'Clear date',empty:'No date selected',use:'Save selected date',
    rules:['Register an appeal within 3 days of receipt (Article 8, part 2).','Refer matters outside the body’s competence within 7 days of registration and notify the applicant (Article 8, part 3).','The competent body’s general consideration period is 30 days from registration (Article 12, part 1).']},
  zh:{title:'期限日历',intro:'在日历中选择日期',counting:'从次日起计数，计入周末，最后一天不顺延。分别计算各个期限。',referral:'转送有权机关的截止日',deadline:'审查诉求的截止日',targets:'来信办理期限',timely:'诉求已及时登记',norms:'来信办理期限',specialRules:'特殊期限计算规则',sent:'已发送',received:'已收到',registered:'已登记',other:'其他事件',clearDate:'清除日期',empty:'尚未选择日期',use:'保存所选日期',
    rules:['收到诉求后3天内登记（第8条第2款）。','不属于本机关职权范围的事项，应在登记之日起7天内转送并通知申请人（第8条第3款）。','有权机关的一般审查期限为登记之日起30天（第12条第1款）。']},
};
const targetIds=new Set(['referral','deadline']);
function taskTargets(options){const t=calendarCopy[localeKey(options.locale)];const rows=options.task?.targets||[{id:'referral',label:t.referral},{id:'deadline',label:t.deadline}];const unique=new Map();for(const row of rows){if(targetIds.has(row.id))unique.set(row.id,{id:row.id,label:localText(row.label,options.locale)||t[row.id]});}return unique.size?[...unique.values()]:[{id:'deadline',label:t.deadline}];}
function taskEvents(options){return options.task?.events||options.events||[];}
export function normalizeCalendarWorkbenchState(value={},options={}){
  const snapshot=options.snapshot||BUNDLED_CALENDARS,targets=taskTargets(options);
  const fallback=taskEvents(options).map(event=>knownDate(event.date,snapshot)).find(Boolean)||knownDate(options.date,snapshot)||`${calendarYears(snapshot)[0]}-01-01`;
  const selectedDates={referral:knownDate(value?.selectedDates?.referral,snapshot),deadline:knownDate(value?.selectedDates?.deadline??value?.selectedDate,snapshot)};
  const activeTarget=targets.some(target=>target.id===value?.activeTarget)?value.activeTarget:targets[0].id;
  return {month:monthExists(value?.month,snapshot)?value.month:(selectedDates[activeTarget]||fallback).slice(0,7),activeTarget,selectedDates,selectedDate:selectedDates.deadline,registrationTimely:typeof value?.registrationTimely==='boolean'?value.registrationTimely:null};
}
/** Dates are picked by the student. No durations, correct answers or calculator steps are accepted. */
export function reduceCalendarWorkbench(state,action,snapshot=BUNDLED_CALENDARS,options={}){
  const next=normalizeCalendarWorkbenchState(state,{...options,snapshot});
  if(action.type==='target'&&taskTargets(options).some(target=>target.id===action.target))return {...next,activeTarget:action.target};
  if(action.type==='select'){
    const date=knownDate(action.date,snapshot);if(!date)throw Error('calendar/date-unavailable');
    const selectedDates={...next.selectedDates,[next.activeTarget]:date};return {...next,selectedDates,selectedDate:selectedDates.deadline,month:date.slice(0,7)};
  }
  if(action.type==='clear'){
    const target=action.target??next.activeTarget;
    if(!taskTargets(options).some(item=>item.id===target))return next;
    const selectedDates={...next.selectedDates,[target]:''};
    return {...next,selectedDates,selectedDate:selectedDates.deadline};
  }
  if(action.type==='month'){if(!monthExists(action.month,snapshot))throw Error('calendar/date-unavailable');return {...next,month:action.month};}
  if(action.type==='registration')return {...next,registrationTimely:Boolean(action.value)};
  return next;
}
function dayLabel(info,locale){const t=copy[localeKey(locale)];if(localeKey(locale)==='ru')return info.label;return info.shortened?t.shortened:({holiday:t.holiday,transfer:t.transfer,'working-transfer':t.workingTransfer}[info.type]||(info.working?t.working:t.rest));}
function formattedDate(date,locale,options={}){return new Intl.DateTimeFormat(languageTag(locale),{day:'numeric',month:'long',year:'numeric',timeZone:'UTC',...options}).format(new Date(date+'T00:00:00Z'));}
function arrow(direction){return icon(direction<0?'back':'chevron');}
const durationAmounts={
  ru:/(?<![\p{L}\d])(?:\d+|тр[её]х|семи|пяти|десяти|пятнадцати|двадцати|тридцати|двух|одного|одной)(?=\s+(?:(?:календарн|рабоч)\p{L}*\s+)?(?:д(?:ень|ня|ней)|месяц(?:а|ев)?|недел(?:и|ь|ю)|час(?:а|ов)?|сут(?:ки|ок))(?!\p{L}))/giu,
  en:/\b(?:\d+|one|two|three|five|seven|ten|fifteen|twenty|thirty)(?=\s+(?:(?:calendar|working|business)\s+)?(?:days?|months?|weeks?|hours?)\b)/gi,
  zh:/(?:\d+|[一二两三四五六七八九十百]+)(?=\s*(?:(?:个)?(?:工作|自然|日历))?(?:天|日|个月|周|小时))/g,
};
const highlightDurations=(text,locale)=>esc(text).replace(durationAmounts[localeKey(locale)],'<strong>$&</strong>');
function calendarContent(options){
  const {locale='ru',disabled=false,snapshot=BUNDLED_CALENDARS}=options,t={...copy[localeKey(locale)],...calendarCopy[localeKey(locale)]},s=normalizeCalendarWorkbenchState(options.state,options),events=taskEvents(options),targets=taskTargets(options),month=monthDays(s.month,snapshot),year=s.month.slice(0,4),monthNumber=s.month.slice(5),off=disabled?'disabled':'',years=calendarYears(snapshot),selected=s.selectedDates[s.activeTarget];
  const types=['sent','received','registered'],eventKind=event=>types.includes(event.kind)?event.kind:types.includes(event.id)?event.id:'other';
  const eventKinds=new Set(events.map(eventKind));
  const legend=types.filter(kind=>eventKinds.has(kind)).map(kind=>[kind,t[kind]]);
  const otherLabels=new Set(events.filter(event=>eventKind(event)==='other').map(event=>localText(event.label,locale)||t.other));
  for(const label of otherLabels)legend.push(['other',label]);
  const start=addDays(s.month+'-01',-month.offset),cellCount=Math.ceil((month.offset+month.days.length)/7)*7;
  const cells=Array.from({length:cellCount},(_,index)=>{
    const date=addDays(start,index);if(!knownDate(date,snapshot))return '<span class="rxw-calendar-empty" aria-hidden="true"></span>';
    const info=dayInfo(date,snapshot),outside=!date.startsWith(s.month),daily=events.filter(event=>event.date===date),chosen=targets.filter(target=>s.selectedDates[target.id]===date);
    return `<button type="button" class="rxw-calendar-day ${info.working?'working':'rest'} ${info.type==='working-transfer'?'working-transfer':''} ${info.shortened?'shortened':''} ${outside?'outside-month':''} ${chosen.map(target=>'chosen-'+target.id).join(' ')}" data-calendar-action="choose-date" data-date="${date}" aria-pressed="${date===selected}" aria-label="${esc([formattedDate(date,locale),dayLabel(info,locale),...daily.map(event=>localText(event.label,locale)||t[eventKind(event)]),...chosen.map(target=>target.label)].filter(Boolean).join(', '))}" tabindex="${date===(selected?.startsWith(s.month)?selected:month.days[0].date)?'0':'-1'}" ${off}><span>${Number(date.slice(8))}</span>${info.shortened?'<small aria-hidden="true">−1</small>':info.type==='working-transfer'?'<small aria-hidden="true">↻</small>':''}<b class="rxw-event-dots" aria-hidden="true">${[...new Set(daily.map(eventKind))].map(kind=>`<i class="event-${kind}"></i>`).join('')}</b></button>`;
  }).join('');
  const instructions=localText(options.task?.instructions,locale)||t.intro;
  const norms=options.task?.norms||[{label:locale==='ru'?'Федеральный закон от 02.05.2006 № 59-ФЗ «О порядке рассмотрения обращений граждан Российской Федерации»':'59-ФЗ · '+t.norms,text:t.rules.join('\n'),url:'https://mintrud.gov.ru/docs/laws/108'}];
  return `<header class="rxw-calendar-heading"><div><h3>${t.title}</h3></div></header><p class="rxw-calendar-instruction">${esc(instructions)}</p>
    ${options.task?.hideEventList?'':`<div class="rxw-calendar-events">${events.map(event=>`<button type="button" class="event-${eventKind(event)}" data-calendar-action="event-month" data-date="${esc(knownDate(event.date,snapshot))}" ${disabled||!knownDate(event.date,snapshot)?'disabled':''}><span>${esc(localText(event.label,locale)||t[eventKind(event)]||'')}</span><strong>${esc(formatDateOnly(event.date))}</strong></button>`).join('')}</div>`}
    <div class="rxw-calendar-targets" role="group" aria-label="${t.targets}">${targets.map(target=>{
      const date=s.selectedDates[target.id],displayDate=date&&formatDateOnly(date);
      const clearLabel=esc(`${t.clearDate} — ${target.label} — ${displayDate}`);
      return `<div class="rxw-calendar-target"><button type="button" data-calendar-action="target" data-target="${target.id}" aria-pressed="${s.activeTarget===target.id}" ${off}><span>${esc(target.label)}</span><strong>${displayDate?esc(displayDate):t.empty}</strong></button>${date?`<button type="button" class="rxw-calendar-clear" data-calendar-action="clear" data-target="${target.id}" aria-label="${clearLabel}" title="${clearLabel}" ${off}>${icon('close')}</button>`:''}</div>`;
    }).join('')}</div>
    <div class="rxw-calendar-sheet"><div class="rxw-calendar-month"><button type="button" data-calendar-action="month-prev" aria-label="${t.prev}" ${disabled||!monthExists(nextMonth(s.month,-1),snapshot)?'disabled':''}>${arrow(-1)}</button><div><label><span class="rxw-sr">${t.month}</span><select data-calendar-input="month" ${off}>${Array.from({length:12},(_,index)=>{const number=String(index+1).padStart(2,'0');return `<option value="${number}" ${number===monthNumber?'selected':''}>${esc(formattedDate(`${year}-${number}-01`,locale,{day:undefined,year:undefined,month:'long'}))}</option>`;}).join('')}</select></label><label><span class="rxw-sr">${t.year}</span><select data-calendar-input="year" ${off}>${years.map(value=>`<option ${value===year?'selected':''}>${value}</option>`).join('')}</select></label></div><button type="button" data-calendar-action="month-next" aria-label="${t.next}" ${disabled||!monthExists(nextMonth(s.month,1),snapshot)?'disabled':''}>${arrow(1)}</button></div>
    <div class="rxw-calendar-week" aria-hidden="true">${t.week.map(day=>`<span>${day}</span>`).join('')}</div><div class="rxw-calendar-grid" role="group" aria-label="${esc(formattedDate(s.month+'-01',locale,{day:undefined}))}">${cells}</div></div>
    ${legend.length?`<div class="rxw-calendar-legend rxw-calendar-main-legend">${legend.map(([kind,label])=>`<span class="event-${kind}">${esc(label)}</span>`).join('')}</div>`:''}
    ${options.task?.autoCommit?'':`<div class="rxw-calendar-footer"><button type="button" class="rxw-calendar-use" data-calendar-action="use-date" ${disabled||!selected?'disabled':''}>${t.use}${arrow(1)}</button></div>`}
    ${options.task?.registrationCheck===false?'':`<label class="rxw-calendar-registration"><input type="checkbox" data-calendar-input="registration-timely" ${s.registrationTimely===true?'checked':''} ${off}><span>${t.timely}</span></label>`}
    <details class="rxw-calendar-details" data-calendar-details="norms" data-details="calendar-norms" ${options.normsOpen?'open':''}>
      <summary><span><strong>${t.norms}</strong>${options.task?.special?`<span class="rxa-unread rxw-calendar-norms-badge" aria-hidden="true">!</span><span class="rxw-sr">${t.specialRules}</span>`:''}</span>${arrow(1)}</summary>
      <div class="rxw-calendar-details-content">
        ${norms.map(norm=>`<section class="rxw-calendar-norm"><h4>${esc(localText(norm.label,locale))}</h4>${localText(norm.text,locale).split('\n').filter(Boolean).map(text=>`<p>${highlightDurations(text,locale)}</p>`).join('')}${norm.url?(options.task?.internalSources?normativeDocumentButton(sourceDocumentForURL(norm.url),t.open,'rxa-btn quiet rxw-calendar-law-link'):sourceLinkView({url:norm.url,label:t.external,locale,className:'rxw-calendar-law-link',external:true})):''}</section>`).join('')}
      </div>
    </details><p class="rxw-calendar-status" data-calendar-status role="status"></p>`;
}
export function calendarWorkbenchView(options={}){return `<section class="rxw-calendar" data-calendar-workbench>${calendarContent(options)}</section>`;}
/** Delegation survives panel replacement. onUseDate includes the chosen target. */
export function createCalendarWorkbench(host,initial={}){
  let options={...initial},state=normalizeCalendarWorkbenchState(initial.state,initial),closed=false,normsOpen=false;
  const owner=host.ownerDocument||document,container=()=>host.matches?.('[data-calendar-workbench]')?host:host.querySelector('[data-calendar-workbench]');
  function paint(){const node=container();if(node&&!closed){const norms=node.querySelector('[data-calendar-details="norms"]');if(norms)normsOpen=norms.open;node.innerHTML=calendarContent({...options,state,normsOpen});}}
  function notify(action,focusDate){try{state=reduceCalendarWorkbench(state,action,options.snapshot||BUNDLED_CALENDARS,options);paint();if(focusDate)container()?.querySelector(`[data-date="${focusDate}"][data-calendar-action="choose-date"]`)?.focus({preventScroll:true});options.onChange?.(structuredClone(state),{action:action.type});}catch{const status=container()?.querySelector('[data-calendar-status]');if(status)status.textContent=copy[localeKey(options.locale)].unavailable;}}
  function click(event){const target=event.target.closest?.('[data-calendar-action]');if(!target||!container()?.contains(target)||options.disabled||target.disabled)return;const action=target.dataset.calendarAction;
    if(action==='use-date'){const date=state.selectedDates[state.activeTarget];if(date)options.onUseDate?.(date,{target:state.activeTarget});return;}
    if(action==='target')notify({type:'target',target:target.dataset.target});
    else if(action==='choose-date')notify({type:'select',date:target.dataset.date},target.dataset.date);
    else if(action==='event-month')notify({type:'month',month:target.dataset.date.slice(0,7)});
    else if(action==='month-prev'||action==='month-next')notify({type:'month',month:nextMonth(state.month,action==='month-prev'?-1:1)});
    else if(action==='clear'){
      const id=target.dataset.target;
      notify({type:'clear',target:id});
      container()?.querySelector(`[data-calendar-action="target"][data-target="${id}"]`)?.focus({preventScroll:true});
    }
  }
  function change(event){const target=event.target;if(!target.dataset.calendarInput||!container()?.contains(target)||options.disabled)return;const key=target.dataset.calendarInput;if(key==='registration-timely')notify({type:'registration',value:target.checked});else if(key==='month'||key==='year')notify({type:'month',month:key==='month'?`${state.month.slice(0,4)}-${target.value}`:`${target.value}-${state.month.slice(5)}`});}
  function keydown(event){const target=event.target.closest?.('[data-calendar-action="choose-date"]');if(!target||!container()?.contains(target)||options.disabled)return;const steps={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};let date;if(event.key in steps)date=addDays(target.dataset.date,steps[event.key]);else if(event.key==='PageUp'||event.key==='PageDown')date=addCalendarMonths(target.dataset.date,event.key==='PageUp'?-1:1);else return;event.preventDefault();notify({type:'select',date},date);}
  host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('keydown',keydown);const abortSignal=initial.signal;
  function destroy(){if(closed)return;closed=true;host.removeEventListener('click',click);host.removeEventListener('change',change);host.removeEventListener('keydown',keydown);abortSignal?.removeEventListener('abort',destroy);}
  abortSignal?.addEventListener('abort',destroy,{once:true});if(abortSignal?.aborted)destroy();else paint();
  return {getState:()=>structuredClone(state),update(next={}){if(closed)return;options={...options,...next};state=normalizeCalendarWorkbenchState(Object.hasOwn(next,'state')?next.state:state,options);const focus=owner.activeElement?.dataset?.calendarAction==='choose-date'?owner.activeElement.dataset.date:null;paint();if(focus)container()?.querySelector(`[data-date="${focus}"][data-calendar-action="choose-date"]`)?.focus({preventScroll:true});},destroy};
}

function normativeDocumentButton(docId,label,className='rxa-btn') {
  return docId ? `<button type="button" class="${esc(className)}" data-normative-doc="${esc(docId)}">${esc(label)}</button>` : '';
}

export function normativeActsView(acts,{locale='ru'}={}) {
  const lang=localeKey(locale),t=copy[lang];
  return (acts||[]).map(act=>{
    const title=lang!=='ru'&&documentTitles[act.id]?.[lang];
    return `<article class="rxa-source"><h3 lang="${title?lang:'ru'}">${esc(title||act.title)}</h3><p lang="ru">${esc(act.number)}</p><div class="rxa-source-links">${normativeDocumentButton(act.id,t.open)}</div></article>`;
  }).join('');
}

/** One source action: embedded reading where available, external only otherwise. */
export function sourceLinkView({url,label,locale='ru',className='rxa-btn',disabled=false,external=false}={}){
  const href=safeSourceURL(url),t=copy[localeKey(locale)];
  if(!href)return `<span class="rxw-source-unavailable">${t.noSource}</span>`;
  const internal=!external&&Boolean(sourceDocumentForURL(href)),title=label||t[internal?'open':'external'];
  if(disabled)return `<span class="${esc(className)}" aria-disabled="true">${esc(title)}</span>`;
  return `<a class="${esc(className)}" href="${esc(href)}" ${internal?'data-source-reader':'target="_blank" rel="noopener noreferrer"'}>${esc(title)}${internal?'':icon('out')}</a>`;
}
export function referenceView(reference,{locale='ru',removable=true,internalOnly=false}={}){
  if(!reference)return '';const t=copy[localeKey(locale)];
  return `<article class="rxw-reference" data-reference-id="${esc(reference.id)}"><header><div><small>${t.reference}</small><h4>${esc(reference.title)}</h4><p>${esc([reference.documentNumber,reference.locator].filter(Boolean).join(' · '))}</p></div>${removable?`<button type="button" data-action="remove-reference" data-id="${esc(reference.id)}" aria-label="${t.remove}">${icon('close')}</button>`:''}</header><blockquote>${esc(reference.text)}</blockquote>${reference.truncated?`<p class="rxw-reference-note">${t.truncated}</p>`:''}${internalOnly?normativeDocumentButton(reference.docId,t.open):sourceLinkView({url:reference.url,locale})}</article>`;
}
