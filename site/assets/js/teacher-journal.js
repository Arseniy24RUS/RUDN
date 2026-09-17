import {backend,groupOptions} from './backend.js?v=1.3.8';
import {getLocale} from './i18n.js?v=1.3.8';
import {officialTicket,absentFromRoster} from './student-identity.js';

const COPY={
  ru:{title:'Электронный журнал',groups:'Учебные группы',search:'Поиск по ФИО или билету',name:'ФИО / билет',topic:'Тема',lecture:'Лекция',seminar:'Семинар',quiz:'Квиз',work:'Самостоятельная',exam:'Экзамен',total:'Итог',registered:'Зарегистрировано',results:'С результатами',average:'Средний итог',activityAverage:'Среднее',submitted:'С результатом',export:'Скачать CSV',refresh:'Обновить',edit:'Оценки',empty:'Нет студентов для выбранных условий',cached:'Сохранённая копия',updated:'Обновлено',settings:'Настройки курса'},
  en:{title:'Gradebook',groups:'Study groups',search:'Search by name or student ID',name:'Name / student ID',topic:'Topic',lecture:'Lecture',seminar:'Seminar',quiz:'Quiz',work:'Independent work',exam:'Exam',total:'Total',registered:'Registered',results:'With results',average:'Average total',activityAverage:'Average',submitted:'With a result',export:'Download CSV',refresh:'Refresh',edit:'Grades',empty:'No students match these filters',cached:'Cached copy',updated:'Updated',settings:'Course settings'},
  zh:{title:'成绩册',groups:'班级',search:'按姓名或学号搜索',name:'姓名 / 学号',topic:'主题',lecture:'讲座',seminar:'研讨课',quiz:'测验',work:'自主作业',exam:'考试',total:'总分',registered:'已注册',results:'有成绩',average:'平均总分',activityAverage:'平均分',submitted:'有结果',export:'下载 CSV',refresh:'刷新',edit:'成绩',empty:'没有符合筛选条件的学生',cached:'缓存副本',updated:'更新时间',settings:'课程设置'}
};
Object.assign(COPY.ru,{reportPresent:'Есть отчёт',viewReports:'Открыть отчёты симулятора'});
Object.assign(COPY.en,{reportPresent:'Report available',viewReports:'Read simulator reports'});
Object.assign(COPY.zh,{reportPresent:'有报告',viewReports:'查看模拟器报告'});
Object.assign(COPY.ru,{
  loading:'Загружаем журнал…',updating:'Обновляем журнал…',
  waiting:'Журнал обновится автоматически после восстановления соединения.',
  unavailable:'Журнал пока не загрузился. Повторим автоматически; можно также нажать «Обновить».',
  readonly:'Редактирование будет доступно после обновления данных.',
  retry:'Повторить загрузку'
});
Object.assign(COPY.en,{
  loading:'Loading the gradebook…',updating:'Refreshing the gradebook…',
  waiting:'The gradebook will refresh automatically when the connection returns.',
  unavailable:'The gradebook has not loaded yet. We will retry automatically, or you can select Refresh.',
  readonly:'Editing will be available after the data has refreshed.',
  retry:'Retry loading'
});
Object.assign(COPY.zh,{
  loading:'正在加载成绩册…',updating:'正在更新成绩册…',
  waiting:'连接恢复后，成绩册将自动更新。',
  unavailable:'成绩册尚未加载。系统会自动重试，也可点击“刷新”。',
  readonly:'数据更新后即可编辑。',
  retry:'重新加载'
});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=value=>Math.round(Number(value||0)*100)/100;
let disposeCurrentJournal=null;
export function journalModel(snapshot,topics){
  const columns=topics.flatMap(topic=>[
    {slug:topic.lecture.slug,kind:'lecture',max:5,topic:topic.number},
    ...(topic.number===1?[{slug:'seminar-1-classroom',kind:'quiz',max:50,topic:1,ungraded:true}]:[]),
    {slug:topic.seminar.slug,kind:topic.number===1?'work':'seminar',max:5,topic:topic.number}
  ]).concat({slug:'exam',kind:'exam',max:20});
  const visibleProfiles=Object.values(snapshot.profiles||{}).filter(profile=>!profile.mergedInto);
  for(const [hash,record] of Object.entries(snapshot.rosterAbsences||{})){
    if(record.absent===false||visibleProfiles.some(profile=>absentFromRoster(profile,{[hash]:record})))continue;
    visibleProfiles.push({studentKey:`roster:${hash}`,fullName:record.fullName,group:record.group,ticket:'',rosterOnly:true});
  }
  const rows=visibleProfiles.map(profile=>{
    const grades=snapshot.grades?.[profile.studentKey]||{};const values={};
    for(const column of columns){const grade=grades[column.slug];values[column.slug]=grade&&Number.isFinite(Number(grade.points))?numeric(grade.points):null}
    const attempts=Object.values(snapshot.attempts?.[profile.studentKey]||{}).filter(a=>a.activitySlug==='seminar-1-classroom'&&Number.isFinite(Number(a.points)));
    values['seminar-1-classroom']=attempts.length?Math.max(...attempts.map(a=>numeric(a.points))):null;
    const total=numeric(columns.filter(c=>!c.ungraded).reduce((sum,c)=>sum+(values[c.slug]??0),0));
    const hasGovernorReports=Object.values(snapshot.attempts?.[profile.studentKey]||{}).some(a=>a?.studentKey===profile.studentKey&&a.activitySlug==='seminar-7'&&a.type==='governor-simulator'&&a.source==='native-v1'&&a.governor&&typeof a.governor==='object');
    return {profile,values,total,hasResults:columns.some(c=>values[c.slug]!==null),hasGovernorReports,absentFromOfficialRoster:absentFromRoster(profile,snapshot.rosterAbsences)};
  }).sort((a,b)=>String(a.profile.group).localeCompare(String(b.profile.group))||String(a.profile.fullName).localeCompare(String(b.profile.fullName),'ru'));
  return {columns,rows};
}
export function mountTeacherJournal(app,{topics,onEdit,downloadCsv}){
  disposeCurrentJournal?.();
  if(!backend.isAdmin())return ()=>{};

  const route=location.hash;
  const uid=backend.user.uid;
  const generation=backend.generation;
  const c=COPY[getLocale()]||COPY.ru;
  let disposed=false;
  let unsubscribe=()=>{};
  let retryTimer=null;
  let failures=0;
  let requestVersion=0;
  let pending=null;
  let loading=false;
  let loadFailed=false;
  let snapshot=backend.adminCachedSnapshot();
  let columns=[];
  let rows=[];
  let groups=[];
  let selected=new Set(groupOptions());
  let allGroupsSelected=true;
  let query='';
  const databaseAvailable=()=>typeof backend.databaseAvailable==='function'?backend.databaseAvailable():Boolean(backend.connected);
  let connected=databaseAvailable();

  app.innerHTML=`<section class="page teacher-journal">
    <header class="page-head"><div><h1>${c.title}</h1>
      <p id="journalStatus" role="status" aria-live="polite"></p>
    </div><a class="btn btn-neutral" href="#admin">${c.settings}</a></header>
    <section class="panel journal-filters">
      <fieldset><legend>${c.groups}</legend><div class="journal-groups"></div></fieldset>
      <label><span>${c.search}</span><input id="journalSearch" type="search" placeholder="${c.search}"></label>
      <div class="page-actions"><button class="btn btn-primary" id="journalExport">${c.export}</button>
        <button class="btn btn-neutral" id="journalRefresh">${c.refresh}</button></div>
    </section><div id="journalGroups"></div>
  </section>`;
  const root=app.querySelector('.teacher-journal');
  const groupControls=root.querySelector('.journal-groups');
  const rowsHost=root.querySelector('#journalGroups');
  const statusHost=root.querySelector('#journalStatus');
  const refreshButton=root.querySelector('#journalRefresh');
  const exportButton=root.querySelector('#journalExport');
  const current=()=>!disposed&&root.isConnected&&location.hash===route&&
    backend.isAdmin()&&backend.user?.uid===uid&&backend.generation===generation;
  const canEdit=()=>current()&&databaseAvailable()&&Boolean(snapshot)&&!snapshot.stale;
  const filtered=()=>rows.filter(row=>selected.has(row.profile.group)&&
    `${row.profile.fullName} ${officialTicket(row.profile)} ${row.profile.ticket}`.toLocaleLowerCase().includes(query));
  const label=column=>`${c[column.kind]} /${column.max}`;

  function renderStatus(){
    if(!current())return;
    const text=[];
    if(snapshot){
      const date=new Date(snapshot.cachedAt).toLocaleString(getLocale()==='zh'?'zh-CN':getLocale());
      text.push(`${c[snapshot.stale?'cached':'updated']}: ${date}`);
    }
    if(loading)text.push(snapshot?c.updating:c.loading);
    else if(!snapshot)text.push(c.unavailable);
    else if(snapshot.stale)text.push(connected&&loadFailed?c.unavailable:c.waiting);
    if(snapshot&&!canEdit())text.push(c.readonly);
    statusHost.textContent=text.join(' ');
    statusHost.dataset.state=loading?'loading':snapshot?.stale?'cached':snapshot?'ready':'unavailable';
    refreshButton.disabled=loading;
    refreshButton.setAttribute('aria-busy',String(loading));
    refreshButton.textContent=loading?c.updating:c.refresh;
    exportButton.disabled=!snapshot;
    root.querySelectorAll('[data-grade-edit]').forEach(button=>{
      button.disabled=!canEdit();
    });
  }

  function renderRows(){
    if(!current())return;
    if(!snapshot){
      rowsHost.innerHTML=`<div class="panel empty-state">${loading?c.loading:c.unavailable}</div>`;
      return;
    }
    const scrollPositions=new Map([...rowsHost.querySelectorAll('[data-journal-table]')].map(table=>
      [table.dataset.journalTable,{left:table.scrollLeft,top:table.scrollTop}]
    ));
    const visible=filtered();
    const groupNames=groups.filter(group=>selected.has(group)&&visible.some(row=>row.profile.group===group));
    rowsHost.innerHTML=groupNames.map(group=>{
      const groupRows=visible.filter(row=>row.profile.group===group);
      const withResults=groupRows.filter(row=>row.hasResults);
      const average=withResults.length?numeric(withResults.reduce((sum,row)=>sum+row.total,0)/withResults.length):'—';
      const statistics=columns.map(column=>{
        const values=groupRows.map(row=>row.values[column.slug]).filter(value=>value!==null);
        return {count:values.length,mean:values.length?numeric(values.reduce((sum,value)=>sum+value,0)/values.length):'—'};
      });
      return `<section class="panel journal-group"><h2>${esc(group)}</h2>
        <div class="journal-summary"><span>${c.registered}: <b>${groupRows.filter(row=>!row.profile.rosterOnly).length}</b></span>
          <span>${c.results}: <b>${withResults.length}</b></span><span>${c.average}: <b>${average}</b></span></div>
        <div class="teacher-table-scroll" data-journal-table="${esc(group)}" tabindex="0" role="region" aria-label="${esc(group)}">
          <table class="teacher-gradebook"><thead><tr><th rowspan="2" class="student-sticky">${c.name}</th>
            ${topics.map(topic=>`<th colspan="${topic.number===1?3:2}">${c.topic} ${topic.number}</th>`).join('')}
            <th rowspan="2">${c.exam} /20</th><th rowspan="2">${c.total} /100</th><th rowspan="2">${c.edit}</th></tr>
            <tr>${columns.filter(column=>column.topic).map(column=>`<th class="${column.ungraded?'ungraded':''}">${label(column)}</th>`).join('')}</tr></thead>
          <tbody>${groupRows.map(row=>`<tr data-student-key="${esc(row.profile.studentKey)}">
            <th scope="row" class="student-sticky"><span${row.absentFromOfficialRoster?' class="student-name-absent"':''}>${esc(row.profile.fullName||officialTicket(row.profile))}</span><small>${esc(officialTicket(row.profile))}</small></th>
            ${columns.map(column=>`<td data-activity="${column.slug}" class="${column.ungraded?'ungraded':''}">${row.values[column.slug]??'—'}${column.slug==='seminar-7'&&row.hasGovernorReports?`<br><button class="badge" type="button" data-governor-review="${esc(row.profile.studentKey)}" aria-label="${esc(c.viewReports)}">${esc(c.reportPresent)}</button>`:''}</td>`).join('')}
            <td class="journal-total">${row.profile.rosterOnly?'—':row.total}</td><td>${row.profile.rosterOnly?'':`<button class="btn btn-neutral btn-small" data-grade-edit="${esc(row.profile.studentKey)}" ${canEdit()?'':'disabled'}>${c.edit}</button>`}</td></tr>`).join('')}
            <tr class="journal-statistics"><th class="student-sticky">${c.submitted}</th>${statistics.map(stat=>`<td>${stat.count}</td>`).join('')}<td>${withResults.length}</td><td></td></tr>
            <tr class="journal-statistics"><th class="student-sticky">${c.activityAverage}</th>${statistics.map(stat=>`<td>${stat.mean}</td>`).join('')}<td>${average}</td><td></td></tr>
          </tbody></table></div></section>`;
    }).join('')||`<div class="panel empty-state">${c.empty}</div>`;
    rowsHost.querySelectorAll('[data-journal-table]').forEach(table=>{
      const position=scrollPositions.get(table.dataset.journalTable);
      if(position){table.scrollLeft=position.left;table.scrollTop=position.top}
    });
    rowsHost.querySelectorAll('[data-grade-edit]').forEach(button=>{
      button.onclick=()=>{if(canEdit())onEdit(button.dataset.gradeEdit,snapshot)};
    });
    rowsHost.querySelectorAll('[data-governor-review]').forEach(button=>{
      button.onclick=()=>{if(current())onEdit(button.dataset.governorReview,snapshot)};
    });
  }

  function renderData(){
    if(!current())return;
    ({columns,rows}=journalModel(snapshot||{},topics));
    groups=[...new Set([...groupOptions(),...rows.map(row=>row.profile.group)])].filter(Boolean).sort();
    if(allGroupsSelected)selected=new Set(groups);
    groupControls.innerHTML=groups.map(group=>{
      const checked=selected.has(group);
      return `<button class="btn btn-neutral ${checked?'selected':''}" type="button" data-journal-group="${esc(group)}" aria-pressed="${checked}">${esc(group)}</button>`;
    }).join('');
    groupControls.querySelectorAll('[data-journal-group]').forEach(button=>{
      button.onclick=()=>{
        const group=button.dataset.journalGroup;
        selected.has(group)?selected.delete(group):selected.add(group);
        allGroupsSelected=groups.every(item=>selected.has(item));
        button.classList.toggle('selected',selected.has(group));
        button.setAttribute('aria-pressed',String(selected.has(group)));
        renderRows();
      };
    });
    renderRows();
    renderStatus();
  }

  function scheduleRetry(){
    clearTimeout(retryTimer);
    if(!current())return;
    const delay=Math.min(60000,5000*2**Math.min(failures,4));
    retryTimer=setTimeout(()=>{
      if(navigator.onLine===false)scheduleRetry();
      else refresh();
    },delay);
  }

  function refresh(){
    if(!current())return Promise.resolve();
    if(pending)return pending;
    clearTimeout(retryTimer);
    const request=++requestVersion;
    loading=true;
    renderStatus();
    if(!snapshot)renderRows();
    pending=backend.adminAll({allowCached:false}).then(next=>{
      if(!current()||request!==requestVersion)return;
      snapshot=next;
      loadFailed=false;
      failures=next.stale?failures+1:0;
      renderData();
    }).catch(()=>{
      if(!current()||request!==requestVersion)return;
      loadFailed=true;
      failures++;
      if(snapshot)snapshot={...snapshot,stale:true};
    }).finally(()=>{
      if(!current()||request!==requestVersion)return;
      pending=null;
      loading=false;
      renderStatus();
      if(!snapshot)renderRows();
      if(loadFailed||snapshot?.stale)scheduleRetry();
    });
    return pending;
  }

  function reconnect(){
    if(current()&&(!snapshot||snapshot.stale||loadFailed))refresh();
  }
  function visibilityChanged(){
    if(document.visibilityState==='visible')reconnect();
  }
  function cleanup(){
    if(disposed)return;
    disposed=true;
    requestVersion++;
    clearTimeout(retryTimer);
    unsubscribe();
    window.removeEventListener('online',reconnect);
    document.removeEventListener('visibilitychange',visibilityChanged);
    if(disposeCurrentJournal===cleanup)disposeCurrentJournal=null;
  }

  root.querySelector('#journalSearch').oninput=event=>{
    query=event.target.value.trim().toLocaleLowerCase();
    renderRows();
  };
  refreshButton.onclick=refresh;
  exportButton.onclick=()=>{
    if(!current()||!snapshot)return;
    downloadCsv('rudn-gradebook.csv',[
      ['student_id','full_name','group',...columns.map(column=>column.slug),'total'],
      ...filtered().map(row=>[officialTicket(row.profile),row.profile.fullName,row.profile.group,
        ...columns.map(column=>row.values[column.slug]??''),row.profile.rosterOnly?'':row.total])
    ]);
  };
  renderData();
  disposeCurrentJournal=cleanup;
  unsubscribe=backend.onStatus(()=>{
    if(!current()){
      cleanup();
      if(root.isConnected&&(!backend.isAdmin()||backend.user?.uid!==uid||backend.generation!==generation))root.remove();
      return;
    }
    const wasConnected=connected;
    connected=databaseAvailable();
    if(!connected&&snapshot)snapshot={...snapshot,stale:true};
    renderStatus();
    if(connected&&!wasConnected)refresh();
  });
  window.addEventListener('online',reconnect);
  document.addEventListener('visibilitychange',visibilityChanged);
  refresh();
  return cleanup;
}
