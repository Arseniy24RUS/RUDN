import {backend,groupOptions} from './backend.js?v=1.2.2';
import {getLocale} from './i18n.js?v=1.2.2';

const COPY={
  ru:{title:'Электронный журнал',groups:'Учебные группы',search:'Поиск по ФИО или билету',name:'ФИО / билет',topic:'Тема',lecture:'Лекция',seminar:'Семинар',quiz:'Квиз',work:'Самостоятельная',exam:'Экзамен',total:'Итог',registered:'Зарегистрировано',results:'С результатами',average:'Средний итог',activityAverage:'Среднее',submitted:'С результатом',export:'Скачать CSV',refresh:'Обновить',edit:'Оценки',empty:'Нет студентов для выбранных условий',cached:'Сохранённая копия',updated:'Обновлено',settings:'Настройки курса'},
  en:{title:'Gradebook',groups:'Study groups',search:'Search by name or student ID',name:'Name / student ID',topic:'Topic',lecture:'Lecture',seminar:'Seminar',quiz:'Quiz',work:'Independent work',exam:'Exam',total:'Total',registered:'Registered',results:'With results',average:'Average total',activityAverage:'Average',submitted:'With a result',export:'Download CSV',refresh:'Refresh',edit:'Grades',empty:'No students match these filters',cached:'Cached copy',updated:'Updated',settings:'Course settings'},
  zh:{title:'成绩册',groups:'班级',search:'按姓名或学号搜索',name:'姓名 / 学号',topic:'主题',lecture:'讲座',seminar:'研讨课',quiz:'测验',work:'自主作业',exam:'考试',total:'总分',registered:'已注册',results:'有成绩',average:'平均总分',activityAverage:'平均分',submitted:'有结果',export:'下载 CSV',refresh:'刷新',edit:'成绩',empty:'没有符合筛选条件的学生',cached:'缓存副本',updated:'更新时间',settings:'课程设置'}
};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=value=>Math.round(Number(value||0)*100)/100;
let requestVersion=0;
export function journalModel(snapshot,topics){
  const columns=topics.flatMap(topic=>[
    {slug:topic.lecture.slug,kind:'lecture',max:5,topic:topic.number},
    ...(topic.number===1?[{slug:'seminar-1-classroom',kind:'quiz',max:50,topic:1,ungraded:true}]:[]),
    {slug:topic.seminar.slug,kind:topic.number===1?'work':'seminar',max:5,topic:topic.number}
  ]).concat({slug:'exam',kind:'exam',max:20});
  const rows=Object.values(snapshot.profiles||{}).map(profile=>{
    const grades=snapshot.grades?.[profile.studentKey]||{};const values={};
    for(const column of columns){const grade=grades[column.slug];values[column.slug]=grade&&Number.isFinite(Number(grade.points))?numeric(grade.points):null}
    const attempts=Object.values(snapshot.attempts?.[profile.studentKey]||{}).filter(a=>a.activitySlug==='seminar-1-classroom'&&Number.isFinite(Number(a.points)));
    values['seminar-1-classroom']=attempts.length?Math.max(...attempts.map(a=>numeric(a.points))):null;
    const total=numeric(columns.filter(c=>!c.ungraded).reduce((sum,c)=>sum+(values[c.slug]??0),0));
    return {profile,values,total,hasResults:columns.some(c=>values[c.slug]!==null)};
  }).sort((a,b)=>String(a.profile.group).localeCompare(String(b.profile.group))||String(a.profile.fullName).localeCompare(String(b.profile.fullName),'ru'));
  return {columns,rows};
}
export async function mountTeacherJournal(app,{topics,onEdit,downloadCsv}){
  const request=++requestVersion,route=location.hash,uid=backend.user.uid;const snapshot=await backend.adminAll();
  if(request!==requestVersion||route!==location.hash||!backend.isAdmin()||backend.user.uid!==uid)return;
  const {columns,rows}=journalModel(snapshot,topics);const c=COPY[getLocale()]||COPY.ru;
  const groups=[...new Set([...groupOptions(),...rows.map(row=>row.profile.group)])].filter(Boolean).sort();
  let selected=new Set(groups);let query='';
  const label=column=>`${c[column.kind]} /${column.max}`;
  app.innerHTML=`<section class="page teacher-journal"><header class="page-head"><div><h1>${c.title}</h1><p>${c[snapshot.stale?'cached':'updated']}: ${esc(new Date(snapshot.cachedAt).toLocaleString(getLocale()==='zh'?'zh-CN':getLocale()))}</p></div><a class="btn btn-neutral" href="#admin">${c.settings}</a></header><section class="panel journal-filters"><fieldset><legend>${c.groups}</legend><div class="journal-groups">${groups.map(group=>`<button class="btn btn-neutral selected" type="button" data-journal-group="${esc(group)}" aria-pressed="true">${esc(group)}</button>`).join('')}</div></fieldset><label><span>${c.search}</span><input id="journalSearch" type="search" placeholder="${c.search}"></label><div class="page-actions"><button class="btn btn-primary" id="journalExport">${c.export}</button><button class="btn btn-neutral" id="journalRefresh">${c.refresh}</button></div></section><div id="journalGroups"></div></section>`;
  const filtered=()=>rows.filter(row=>selected.has(row.profile.group)&&`${row.profile.fullName} ${row.profile.ticket}`.toLocaleLowerCase().includes(query));
  const renderRows=()=>{
    const visible=filtered();const groupNames=groups.filter(group=>selected.has(group)&&visible.some(row=>row.profile.group===group));
    app.querySelector('#journalGroups').innerHTML=groupNames.map(group=>{
      const groupRows=visible.filter(row=>row.profile.group===group);const withResults=groupRows.filter(row=>row.hasResults);
      const average=withResults.length?numeric(withResults.reduce((sum,row)=>sum+row.total,0)/withResults.length):'—';
      const statistics=columns.map(column=>{const values=groupRows.map(row=>row.values[column.slug]).filter(value=>value!==null);return {count:values.length,mean:values.length?numeric(values.reduce((sum,value)=>sum+value,0)/values.length):'—'}});
      return `<section class="panel journal-group"><h2>${esc(group)}</h2><div class="journal-summary"><span>${c.registered}: <b>${groupRows.length}</b></span><span>${c.results}: <b>${withResults.length}</b></span><span>${c.average}: <b>${average}</b></span></div><div class="teacher-table-scroll" tabindex="0" role="region" aria-label="${esc(group)}"><table class="teacher-gradebook"><thead><tr><th rowspan="2" class="student-sticky">${c.name}</th>${topics.map(topic=>`<th colspan="${topic.number===1?3:2}">${c.topic} ${topic.number}</th>`).join('')}<th rowspan="2">${c.exam} /20</th><th rowspan="2">${c.total} /100</th><th rowspan="2">${c.edit}</th></tr><tr>${columns.filter(column=>column.topic).map(column=>`<th class="${column.ungraded?'ungraded':''}">${label(column)}</th>`).join('')}</tr></thead><tbody>${groupRows.map(row=>`<tr data-student-key="${esc(row.profile.studentKey)}"><th scope="row" class="student-sticky">${esc(row.profile.fullName||row.profile.ticket)}<small>${esc(row.profile.ticket)}</small></th>${columns.map(column=>`<td data-activity="${column.slug}" class="${column.ungraded?'ungraded':''}">${row.values[column.slug]??'—'}</td>`).join('')}<td class="journal-total">${row.total}</td><td><button class="btn btn-neutral btn-small" data-grade-edit="${esc(row.profile.studentKey)}" ${snapshot.stale?'disabled':''}>${c.edit}</button></td></tr>`).join('')}<tr class="journal-statistics"><th class="student-sticky">${c.submitted}</th>${statistics.map(stat=>`<td>${stat.count}</td>`).join('')}<td>${withResults.length}</td><td></td></tr><tr class="journal-statistics"><th class="student-sticky">${c.activityAverage}</th>${statistics.map(stat=>`<td>${stat.mean}</td>`).join('')}<td>${average}</td><td></td></tr></tbody></table></div></section>`;
    }).join('')||`<div class="panel empty-state">${c.empty}</div>`;
    app.querySelectorAll('[data-grade-edit]').forEach(button=>button.onclick=()=>onEdit(button.dataset.gradeEdit,snapshot));
  };
  app.querySelectorAll('[data-journal-group]').forEach(button=>button.onclick=()=>{const group=button.dataset.journalGroup;selected.has(group)?selected.delete(group):selected.add(group);button.classList.toggle('selected',selected.has(group));button.setAttribute('aria-pressed',String(selected.has(group)));renderRows()});
  app.querySelector('#journalSearch').oninput=event=>{query=event.target.value.trim().toLocaleLowerCase();renderRows()};
  app.querySelector('#journalRefresh').onclick=()=>mountTeacherJournal(app,{topics,onEdit,downloadCsv});
  app.querySelector('#journalExport').onclick=()=>downloadCsv('rudn-gradebook.csv',[
    ['student_id','full_name','group',...columns.map(column=>column.slug),'total'],
    ...filtered().map(row=>[row.profile.ticket,row.profile.fullName,row.profile.group,...columns.map(column=>row.values[column.slug]??''),row.total])
  ]);
  renderRows();
}
