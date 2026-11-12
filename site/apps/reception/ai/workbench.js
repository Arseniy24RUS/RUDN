import {icon} from './cabinet-icons.js';
import {BUNDLED_CALENDARS} from '../../../assets/js/calendar-bundled.js';
import {addDays,addCalendarMonths,dayInfo,formatDateOnly,monthDays,parseDateOnly} from '../../../assets/js/legal-calendar.js';
import {sourceDocumentForURL} from '../js/source-reader.js';
import {safeSourceURL} from '../js/source-reference.js';
export {createSourceReference,referenceDecisionPatch} from '../js/source-reference.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const copy={
  ru:{title:'Календарь сроков',intro:'Выберите исходное событие, отсчитайте срок и перенесите выбранную дату в решение.',anchor:'Исходная дата',event:'Дата события',chooseAnchor:'Выберите событие или задайте дату',prev:'Предыдущий месяц',next:'Следующий месяц',month:'Месяц',year:'Год',week:['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],selected:'Выбрана дата',none:'Дата ещё не выбрана',working:'Рабочий день',rest:'Нерабочий день',holiday:'Праздник',transfer:'Перенесённый выходной',workingTransfer:'Рабочая суббота / воскресенье',shortened:'Сокращённый рабочий день',anchorLegend:'Исходный день',markedLegend:'Ваша отметка',mark:'Отметить день',unmark:'Убрать отметку',stepDay:'+ 1 день',stepWorking:'+ 1 рабочий',stepMonth:'+ 1 месяц',include:'Учитывать исходный день в подсчёте',elapsed:'В выбранном интервале',before:'До исходной даты',calendarDays:'календарных дней',workingDays:'рабочих дней',marked:'Отмечено вручную',clear:'Очистить отметки',use:'Внести дату в решение',unavailable:'Эта дата вне загруженного производственного календаря.',scope:'Федеральная пятидневная рабочая неделя. Правило срока выберите по документу; календарь показывает только ваш расчёт.',sources:'Календарные данные',open:'Открыть документ',external:'Открыть источник',remove:'Убрать из черновика',reference:'Выбранное правовое основание',truncated:'Фрагмент сокращён до 12 000 знаков.',noSource:'Источник недоступен',days:'дней'},
  en:{title:'Deadline calendar',intro:'Choose the starting event, count the period and add your chosen date to the decision.',anchor:'Starting date',event:'Event date',chooseAnchor:'Choose an event or enter a date',prev:'Previous month',next:'Next month',month:'Month',year:'Year',week:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],selected:'Selected date',none:'No date selected',working:'Working day',rest:'Non-working day',holiday:'Public holiday',transfer:'Transferred day off',workingTransfer:'Working weekend',shortened:'Shortened working day',anchorLegend:'Starting day',markedLegend:'Your mark',mark:'Mark this day',unmark:'Remove mark',stepDay:'+ 1 day',stepWorking:'+ 1 workday',stepMonth:'+ 1 month',include:'Include the starting day in the count',elapsed:'In the selected interval',before:'Before the starting date',calendarDays:'calendar days',workingDays:'working days',marked:'Marked manually',clear:'Clear marks',use:'Use date in decision',unavailable:'This date is outside the available production calendar.',scope:'Russian federal five-day working week. Choose the applicable rule from the document; this calendar shows only your own count.',sources:'Calendar data',open:'Open document',external:'Open source',remove:'Remove from draft',reference:'Selected legal basis',truncated:'Passage shortened to 12,000 characters.',noSource:'Source unavailable',days:'days'},
  zh:{title:'期限日历',intro:'选择起始事件，计算期限，再将所选日期填入决定。',anchor:'起始日期',event:'事件日期',chooseAnchor:'选择事件或输入日期',prev:'上个月',next:'下个月',month:'月份',year:'年份',week:['一','二','三','四','五','六','日'],selected:'所选日期',none:'尚未选择日期',working:'工作日',rest:'非工作日',holiday:'法定节假日',transfer:'调休休息日',workingTransfer:'周末工作日',shortened:'缩短工时的工作日',anchorLegend:'起始日',markedLegend:'您的标记',mark:'标记该日',unmark:'取消标记',stepDay:'+ 1 天',stepWorking:'+ 1 工作日',stepMonth:'+ 1 个月',include:'将起始日计入天数',elapsed:'所选区间内',before:'起始日期之前',calendarDays:'个日历日',workingDays:'个工作日',marked:'手动标记',clear:'清除标记',use:'将日期填入决定',unavailable:'此日期超出了已加载的工作日历范围。',scope:'俄罗斯联邦每周五天工作制。请依据文件选择期限规则；日历仅显示您自己的计算。',sources:'日历数据',open:'打开文件',external:'打开来源',remove:'从草稿中移除',reference:'所选法律依据',truncated:'片段已缩短至 12,000 个字符。',noSource:'来源不可用',days:'天'},
};
const localeKey=value=>value==='en'||value==='zh'?value:'ru';
const languageTag=locale=>({ru:'ru-RU',en:'en-GB',zh:'zh-CN'}[localeKey(locale)]);
const localText=(value,locale)=>typeof value==='string'?value:value?.[localeKey(locale)]||value?.ru||'';
const calendarYears=snapshot=>Object.keys(snapshot.years||{}).sort();
function knownDate(value,snapshot){const date=parseDateOnly(value);return date&&snapshot.years?.[date.slice(0,4)]?date:'';}
function monthExists(value,snapshot){return /^\d{4}-\d{2}$/.test(value||'')&&Boolean(knownDate(value+'-01',snapshot));}
function nextMonth(month,delta){return addCalendarMonths(month+'-01',delta).slice(0,7);}
export function normalizeCalendarWorkbenchState(value={},options={}){
  const snapshot=options.snapshot||BUNDLED_CALENDARS;
  const fallback=knownDate(options.date,snapshot)||(options.events||[]).map(event=>knownDate(event.date,snapshot)).find(Boolean)||`${calendarYears(snapshot)[0]}-01-01`;
  const anchorDate=knownDate(value?.anchorDate,snapshot),selectedDate=knownDate(value?.selectedDate,snapshot);
  return {anchorDate,selectedDate,monthOrigin:knownDate(value?.monthOrigin,snapshot),month:monthExists(value?.month,snapshot)?value.month:(selectedDate||anchorDate||fallback).slice(0,7),marks:[...new Set((Array.isArray(value?.marks)?value.marks:[]).map(date=>knownDate(date,snapshot)).filter(Boolean))].sort().slice(0,400),includeAnchor:Boolean(value?.includeAnchor)};
}
export function calendarInterval(state,snapshot=BUNDLED_CALENDARS){
  const anchor=knownDate(state.anchorDate,snapshot),selected=knownDate(state.selectedDate,snapshot);
  if(!anchor||!selected)return null;
  const direction=selected>=anchor?1:-1;let calendar=0,working=0;
  if(state.includeAnchor){calendar++;if(dayInfo(anchor,snapshot).working)working++;}
  for(let date=addDays(anchor,direction);direction>0?date<=selected:date>=selected;date=addDays(date,direction)){
    if(!knownDate(date,snapshot))return null;
    calendar++;if(dayInfo(date,snapshot).working)working++;
  }
  return {calendar,working,direction};
}
/** Every operation follows the student's action. No case answer or duration is accepted. */
export function reduceCalendarWorkbench(state,action,snapshot=BUNDLED_CALENDARS){
  const next=normalizeCalendarWorkbenchState(state,{snapshot}),date=knownDate(action.date,snapshot);
  if(action.type==='anchor'){
    if(!date)throw Error('calendar/date-unavailable');
    return {...next,anchorDate:date,selectedDate:date,monthOrigin:'',month:date.slice(0,7),marks:[]};
  }
  if(action.type==='select'){
    if(!date)throw Error('calendar/date-unavailable');
    return {...next,selectedDate:date,monthOrigin:'',month:date.slice(0,7)};
  }
  if(action.type==='month'){
    if(!monthExists(action.month,snapshot))throw Error('calendar/date-unavailable');
    return {...next,month:action.month};
  }
  if(action.type==='include')return {...next,includeAnchor:Boolean(action.value)};
  if(action.type==='clear')return {...next,marks:[]};
  if(action.type==='mark'){
    const selected=next.selectedDate;if(!selected)return next;
    return {...next,marks:next.marks.includes(selected)?next.marks.filter(mark=>mark!==selected):[...next.marks,selected].sort()};
  }
  if(action.type==='step'){
    const from=next.selectedDate||next.anchorDate;if(!from)return next;
    const origin=next.monthOrigin||from,months=(Number(from.slice(0,4))-Number(origin.slice(0,4)))*12+Number(from.slice(5,7))-Number(origin.slice(5,7))+1;
    let target=action.unit==='month'?addCalendarMonths(origin,months):addDays(from,1);
    if(!knownDate(target,snapshot))throw Error('calendar/date-unavailable');
    if(action.unit==='working'){
      for(let guard=0;!dayInfo(target,snapshot).working&&guard<366;guard++){
        target=addDays(target,1);if(!knownDate(target,snapshot))throw Error('calendar/date-unavailable');
      }
    }
    return {...next,selectedDate:target,monthOrigin:action.unit==='month'?origin:'',month:target.slice(0,7),marks:[...new Set([...next.marks,target])].sort()};
  }
  return next;
}
function dayLabel(info,locale){const t=copy[localeKey(locale)];if(localeKey(locale)==='ru')return info.label;return info.shortened?t.shortened:({holiday:t.holiday,transfer:t.transfer,'working-transfer':t.workingTransfer}[info.type]||(info.working?t.working:t.rest));}
function formattedDate(date,locale,options={}){return new Intl.DateTimeFormat(languageTag(locale),{day:'numeric',month:'long',year:'numeric',timeZone:'UTC',...options}).format(new Date(date+'T00:00:00Z'));}
function arrow(direction){return icon(direction<0?'back':'chevron');}
const calendarCopy={
  ru:{tools:'Инструменты расчёта',toolsHint:'Исходная дата, ручные шаги и отметки',currentDay:'Дата дела',chosen:'Выбрано',timeline:'Хронология обращения',dateInDraft:'Выбранная дата',chooseDate:'Выберите дату в календаре',use:'Перенести в решение',legend:'Обозначения календаря'},
  en:{tools:'Counting tools',toolsHint:'Starting date, manual steps and marks',currentDay:'Case date',chosen:'Selected',timeline:'Case timeline',dateInDraft:'Chosen date',chooseDate:'Choose a date on the calendar',use:'Add to decision',legend:'Calendar legend'},
  zh:{tools:'计算工具',toolsHint:'起始日期、逐日计算及标记',currentDay:'案件日期',chosen:'已选择',timeline:'案件时间线',dateInDraft:'所选日期',chooseDate:'请在日历中选择日期',use:'填入决定',legend:'日历图例'},
};
function calendarContent(options){
  const {events=[],locale='ru',disabled=false,snapshot=BUNDLED_CALENDARS}=options,t={...copy[localeKey(locale)],...calendarCopy[localeKey(locale)]},s=normalizeCalendarWorkbenchState(options.state,options),month=monthDays(s.month,snapshot),interval=calendarInterval(s,snapshot),marks=new Set(s.marks),year=s.month.slice(0,4),monthNumber=s.month.slice(5),off=disabled?'disabled':'',years=calendarYears(snapshot),min=`${years[0]}-01-01`,max=`${years.at(-1)}-12-31`;
  const selected=s.selectedDate?dayInfo(s.selectedDate,snapshot):null,chosenEvent=events.find(event=>parseDateOnly(event.date)===s.anchorDate),caseDate=knownDate(options.date,snapshot);
  const within=date=>s.anchorDate&&s.selectedDate&&date>=([s.anchorDate,s.selectedDate].sort()[0])&&date<=([s.anchorDate,s.selectedDate].sort()[1]);
  const start=addDays(s.month+'-01',-month.offset),cellCount=Math.ceil((month.offset+month.days.length)/7)*7;
  const cells=Array.from({length:cellCount},(_,index)=>{
    const date=addDays(start,index);
    if(!knownDate(date,snapshot))return '<span class="rxw-calendar-empty" aria-hidden="true"></span>';
    const info=dayInfo(date,snapshot),outside=!date.startsWith(s.month),current=date===caseDate;
    return `<button type="button" class="rxw-calendar-day ${info.working?'working':'rest'} ${info.type==='working-transfer'?'working-transfer':''} ${info.shortened?'shortened':''} ${date===s.anchorDate?'anchor':''} ${within(date)?'in-range':''} ${marks.has(date)?'marked':''} ${outside?'outside-month':''} ${current?'case-date':''}" data-calendar-action="choose-date" data-date="${date}" aria-pressed="${date===s.selectedDate}" aria-label="${esc([formattedDate(date,locale),dayLabel(info,locale),date===s.anchorDate?t.anchorLegend:'',current?t.currentDay:'',marks.has(date)?t.markedLegend:''].filter(Boolean).join(', '))}" tabindex="${date===(s.selectedDate.startsWith(s.month)?s.selectedDate:month.days[0].date)?'0':'-1'}" ${off}><span>${Number(date.slice(8))}</span>${info.shortened?'<small aria-hidden="true">−1</small>':info.type==='working-transfer'?'<small aria-hidden="true">↻</small>':''}${marks.has(date)?'<i aria-hidden="true"></i>':''}</button>`;
  }).join('');
  return `<header class="rxw-calendar-heading"><div><h3>${t.title}</h3><p>${t.intro}</p></div></header>
    ${events.length?`<div class="rxw-calendar-events" aria-label="${t.timeline}">${events.map(event=>`<button type="button" data-calendar-action="anchor-event" data-event-id="${esc(event.id)}" data-date="${esc(parseDateOnly(event.date)||'')}" aria-pressed="${event===chosenEvent}" ${disabled||!knownDate(event.date,snapshot)?'disabled':''}><span>${esc(localText(event.label,locale))}</span><strong>${esc(formatDateOnly(event.date))}</strong></button>`).join('')}</div>`:''}
    <div class="rxw-calendar-sheet"><div class="rxw-calendar-month"><button type="button" data-calendar-action="month-prev" aria-label="${t.prev}" ${disabled||!monthExists(nextMonth(s.month,-1),snapshot)?'disabled':''}>${arrow(-1)}</button><div><label><span class="rxw-sr">${t.month}</span><select data-calendar-input="month" ${off}>${Array.from({length:12},(_,index)=>{const number=String(index+1).padStart(2,'0');return `<option value="${number}" ${number===monthNumber?'selected':''}>${esc(formattedDate(`${year}-${number}-01`,locale,{day:undefined,year:undefined,month:'long'}))}</option>`;}).join('')}</select></label><label><span class="rxw-sr">${t.year}</span><select data-calendar-input="year" ${off}>${years.map(value=>`<option ${value===year?'selected':''}>${value}</option>`).join('')}</select></label></div><button type="button" data-calendar-action="month-next" aria-label="${t.next}" ${disabled||!monthExists(nextMonth(s.month,1),snapshot)?'disabled':''}>${arrow(1)}</button></div>
    <div class="rxw-calendar-week" aria-hidden="true">${t.week.map(day=>`<span>${day}</span>`).join('')}</div><div class="rxw-calendar-grid" role="group" aria-label="${esc(formattedDate(s.month+'-01',locale,{day:undefined}))}">${cells}</div></div>
    <div class="rxw-calendar-legend rxw-calendar-main-legend" aria-label="${t.legend}"><span class="anchor">${t.anchorLegend}</span><span class="case-date">${t.currentDay}</span><span class="selected">${t.chosen}</span></div>
    <details class="rxw-calendar-details" data-calendar-details="tools" data-details="calendar-tools" ${options.toolsOpen?'open':''}><summary><span><strong>${t.tools}</strong><small>${t.toolsHint}</small></span>${arrow(1)}</summary><div class="rxw-calendar-details-content">
    <label class="rxw-calendar-anchor"><span>${t.anchor}</span><input type="date" data-calendar-input="anchor" value="${s.anchorDate}" min="${min}" max="${max}" ${off}><small>${s.anchorDate?esc(chosenEvent?localText(chosenEvent.label,locale):formattedDate(s.anchorDate,locale)):t.chooseAnchor}</small></label>
    <div class="rxw-calendar-tools"><button type="button" data-calendar-action="mark" aria-pressed="${marks.has(s.selectedDate)}" ${disabled||!s.selectedDate?'disabled':''}>${marks.has(s.selectedDate)?t.unmark:t.mark}</button><button type="button" data-calendar-action="step-day" ${disabled||!s.selectedDate?'disabled':''}>${t.stepDay}</button><button type="button" data-calendar-action="step-working" ${disabled||!s.selectedDate?'disabled':''}>${t.stepWorking}</button><button type="button" data-calendar-action="step-month" ${disabled||!s.selectedDate?'disabled':''}>${t.stepMonth}</button></div>
    <label class="rxw-calendar-include"><input type="checkbox" data-calendar-input="include-anchor" ${s.includeAnchor?'checked':''} ${off}>${t.include}</label>
    <div class="rxw-calendar-count" aria-live="polite">${interval?`<span>${interval.direction<0?t.before:t.elapsed}</span><strong>${interval.calendar} <small>${t.calendarDays}</small><b> · </b>${interval.working} <small>${t.workingDays}</small></strong>`:''}<span>${t.marked}: <b>${s.marks.length}</b></span></div>
    <button type="button" class="rxw-calendar-clear" data-calendar-action="clear" ${disabled||!s.marks.length?'disabled':''}>${t.clear}</button>
    <div class="rxw-calendar-legend"><span class="rest">${t.rest}</span><span class="working-transfer">${t.workingTransfer}</span><span class="shortened">${t.shortened}</span></div>
    <p class="rxw-calendar-scope">${t.scope}</p><details class="rxw-calendar-provenance"><summary>${t.sources}</summary><p>${esc(year)} · ${esc(snapshot.years[year]?.sourceDate||'')}</p>${(snapshot.years[year]?.sources||[]).map(source=>`<a href="${esc(safeSourceURL(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.provider)}</a>`).join('')}</details></div></details>
    ${options.rulesMarkup||''}
    <div class="rxw-calendar-selection" aria-live="polite"><span>${t.dateInDraft}</span><strong>${s.selectedDate?esc(formattedDate(s.selectedDate,locale)):t.chooseDate}</strong>${selected?`<small>${esc(dayLabel(selected,locale))}</small>`:''}</div>
    <div class="rxw-calendar-footer"><button type="button" class="rxw-calendar-use" data-calendar-action="use-date" ${disabled||!s.selectedDate?'disabled':''}>${t.use}${arrow(1)}</button></div>
    <p class="rxw-calendar-status" data-calendar-status role="status"></p>`;
}
export function calendarWorkbenchView(options={}){return `<section class="rxw-calendar" data-calendar-workbench>${calendarContent(options)}</section>`;}

/** Delegation survives the app's panel renders. update() paints only the calendar. */
export function createCalendarWorkbench(host,initial={}){
  let options={...initial},state=normalizeCalendarWorkbenchState(initial.state,initial),closed=false,toolsOpen=false;
  const owner=host.ownerDocument||document;
  const container=()=>host.matches?.('[data-calendar-workbench]')?host:host.querySelector('[data-calendar-workbench]');
  function paint(){const node=container();if(node&&!closed){const tools=node.querySelector('[data-calendar-details="tools"]');if(tools)toolsOpen=tools.open;node.innerHTML=calendarContent({...options,state,toolsOpen});}}
  function notify(action,focusDate){
    const snapshot=options.snapshot||BUNDLED_CALENDARS;
    try{state=reduceCalendarWorkbench(state,action,snapshot);paint();if(focusDate)container()?.querySelector(`[data-date="${focusDate}"][data-calendar-action="choose-date"]`)?.focus({preventScroll:true});options.onChange?.(structuredClone(state),{action:action.type});}
    catch{const status=container()?.querySelector('[data-calendar-status]');if(status)status.textContent=copy[localeKey(options.locale)].unavailable;}
  }
  function click(event){
    const target=event.target.closest?.('[data-calendar-action]');if(!target||!container()?.contains(target)||options.disabled||target.disabled)return;
    const action=target.dataset.calendarAction;
    if(action==='use-date'){if(state.selectedDate)options.onUseDate?.(state.selectedDate);return;}
    if(action==='anchor-event')notify({type:'anchor',date:target.dataset.date});
    else if(action==='choose-date')notify({type:'select',date:target.dataset.date},target.dataset.date);
    else if(action==='month-prev'||action==='month-next')notify({type:'month',month:nextMonth(state.month,action==='month-prev'?-1:1)});
    else if(action==='mark'||action==='clear')notify({type:action});
    else if(action.startsWith('step-'))notify({type:'step',unit:action.slice(5)});
  }
  function change(event){
    const target=event.target;if(!target.dataset.calendarInput||!container()?.contains(target)||options.disabled)return;
    const key=target.dataset.calendarInput;
    if(key==='anchor')notify({type:'anchor',date:target.value});
    else if(key==='include-anchor')notify({type:'include',value:target.checked});
    else if(key==='month'||key==='year')notify({type:'month',month:key==='month'?`${state.month.slice(0,4)}-${target.value}`:`${target.value}-${state.month.slice(5)}`});
  }
  function keydown(event){
    const target=event.target.closest?.('[data-calendar-action="choose-date"]');if(!target||!container()?.contains(target)||options.disabled)return;
    const steps={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};let date;
    if(event.key in steps)date=addDays(target.dataset.date,steps[event.key]);
    else if(event.key==='PageUp'||event.key==='PageDown')date=addCalendarMonths(target.dataset.date,event.key==='PageUp'?-1:1);
    else return;
    event.preventDefault();notify({type:'select',date},date);
  }
  host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('keydown',keydown);
  const abortSignal=initial.signal;
  function destroy(){if(closed)return;closed=true;host.removeEventListener('click',click);host.removeEventListener('change',change);host.removeEventListener('keydown',keydown);abortSignal?.removeEventListener('abort',destroy);}
  abortSignal?.addEventListener('abort',destroy,{once:true});if(abortSignal?.aborted)destroy();else paint();
  return {getState:()=>structuredClone(state),update(next={}){if(closed)return;options={...options,...next};state=normalizeCalendarWorkbenchState(Object.hasOwn(next,'state')?next.state:state,options);const focus=owner.activeElement?.dataset?.calendarAction==='choose-date'?owner.activeElement.dataset.date:null;paint();if(focus)container()?.querySelector(`[data-date="${focus}"][data-calendar-action="choose-date"]`)?.focus({preventScroll:true});},destroy};
}

/** One source action: embedded reading where available, external only otherwise. */
export function sourceLinkView({url,label,locale='ru',className='rxa-btn',disabled=false}={}){
  const href=safeSourceURL(url),t=copy[localeKey(locale)];
  if(!href)return `<span class="rxw-source-unavailable">${t.noSource}</span>`;
  const internal=Boolean(sourceDocumentForURL(href)),title=label||t[internal?'open':'external'];
  if(disabled)return `<span class="${esc(className)}" aria-disabled="true">${esc(title)}</span>`;
  return `<a class="${esc(className)}" href="${esc(href)}" ${internal?'data-source-reader':'target="_blank" rel="noopener noreferrer"'}>${esc(title)}${internal?'':icon('out')}</a>`;
}
export function referenceView(reference,{locale='ru',removable=true}={}){
  if(!reference)return '';const t=copy[localeKey(locale)];
  return `<article class="rxw-reference" data-reference-id="${esc(reference.id)}"><header><div><small>${t.reference}</small><h4>${esc(reference.title)}</h4><p>${esc([reference.documentNumber,reference.locator].filter(Boolean).join(' · '))}</p></div>${removable?`<button type="button" data-action="remove-reference" data-id="${esc(reference.id)}" aria-label="${t.remove}">${icon('close')}</button>`:''}</header><blockquote>${esc(reference.text)}</blockquote>${reference.truncated?`<p class="rxw-reference-note">${t.truncated}</p>`:''}${sourceLinkView({url:reference.url,locale})}</article>`;
}
