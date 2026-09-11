import {backend} from '../../assets/js/backend.js?v=1.2.2';
import {attemptOwner} from '../../assets/js/attempt-session.js?v=1.2.2';
import {getLocale,setLocale} from '../../assets/js/i18n.js?v=1.2.2';
import {academicContext,topicGate,formatAccessDate} from '../../assets/js/access.js?v=1.2.2';
import {readState,pendingStorageKey} from '../../assets/js/session.js?v=1.2.2';
import {scopedStorage,createRunMetadata,makeSubmission,assessmentRules,assessCampaign} from './platform-contract.js';

const G=window.GovernorGame;
const $=selector=>document.querySelector(selector);
const courseUrl=new URL('../../#activity/seminar-7',import.meta.url).href;
const courseLocale=getLocale();
let owner=null,active=false,storage=null,run=null,runtime=null,started=false,submissionBusy=false;
let language=getLocale()==='en'?'en':'ru';
const tr=(ru,en)=>language==='en'?en:ru;
const local=value=>typeof value==='string'?value:value?.[language]||value?.ru||'';
const message=text=>{$('#platform-status').textContent=text;};
const canAccess=()=>{
  if(backend.isAdmin())return true;
  const now=backend.globalNow();
  return topicGate(7,backend.getAccessOverrides(academicContext(now).startYear),now).open;
};
const sameOwner=()=>active&&attemptOwner()===owner&&canAccess();
const terminal=s=>Boolean(s&&(s.completed||G.BudgetReview.stopped(s)));
function stored(key,fallback=null){try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}}
function persistRun(){storage.setItem('platform-run',JSON.stringify(run));}
function ensureRun(state){
  if(!run||run.campaignToken&&state?.storiesRunId&&run.campaignToken!==state.storiesRunId){run=createRunMetadata();}
  if(state?.storiesRunId)run.campaignToken=state.storiesRunId;
  persistRun();return run;
}
function runChanged(state){
  run=createRunMetadata();run.campaignToken=state?.storiesRunId||null;
  try{persistRun();message(tr('Новая партия сохраняется в вашем профиле на этом устройстве.','A new campaign is saved to your profile on this device.'));}
  catch{message(tr('Не удалось сохранить сведения о попытке. Скачайте файл партии.','Attempt metadata could not be saved. Download a campaign save.'));}
}
function syncText(){
  if(backend.isAdmin())return tr('Режим преподавателя · пробные результаты не отправляются в журнал.','Instructor preview · practice results are not sent to the gradebook.');
  if(!run)return tr('Партия сохраняется на устройстве. Отчёт передаётся после завершения.','The campaign is saved on this device. The final grade and report are submitted automatically.');
  const record=backend.localAttempts().find(a=>a.id===run.submissionId&&`student:${a.studentKey}`===owner);
  if(record)return readState(pendingStorageKey(record),null)
    ?tr(`Автоматическая оценка: ${record.points}/5. Отчёт сохранён на устройстве и ожидает отправки. Не очищайте данные браузера.`,`Automatic grade: ${record.points}/5. The report is saved on this device and is awaiting upload. Keep browser data intact.`)
    :tr(`Отчёт отправлен. Автоматическая оценка: ${record.points}/5; в журнале учитывается лучший результат.`,`Report submitted. Automatic grade: ${record.points}/5; the gradebook keeps your best result.`);
  return terminal(runtime?.state())?tr('Кампания закончена. Сохраняем автоматическую оценку и отчёт.','The campaign has ended. Saving your automatic grade and report.')
    :tr('Партия сохраняется на устройстве. Для переноса скачайте файл сохранения.','The campaign is saved on this device. Download a save to change devices.');
}
function refresh(){
  $('#platform-report').textContent=tr('Отчёт к семинару','Seminar report');
  $('#platform-back').textContent=tr('← Раздел 7','← Section 7');
  $('#platform-course-name').textContent=tr('Введение в специальность','Introduction to the Profession');
  $('#platform-section').textContent=tr('Семинар 7 · Губернатор: Новая область','Seminar 7 · Governor: Novaya Oblast');
  const profile=backend.getProfile();
  $('#platform-identity').textContent=backend.isAdmin()?tr('Преподаватель','Instructor'):(profile?.fullName||'');
  $('#platform-identity').title=backend.isAdmin()?(backend.user.displayName||backend.user.email||''):(profile?.fullName||'');
  if(active)message(syncText());
  if($('#platform-rubric'))renderRules();
  if($('#platform-submission')?.open)$('#platform-submission-status').textContent=syncText();
}
function renderRules(){
  const root=$('#platform-rubric');if(!root)return;
  const open=root.open;root.replaceChildren();const summary=document.createElement('summary');summary.textContent=tr('Как рассчитывается оценка 0–5','How the 0–5 grade is calculated');root.append(summary);
  for(const rule of assessmentRules){const p=document.createElement('p');const strong=document.createElement('strong');strong.textContent=local(rule.title)+'. ';p.append(strong,document.createTextNode(local(rule.detail)));root.append(p);}
  root.open=open;
}
function renderAssessment(assessment){
  const root=$('#platform-assessment');root.replaceChildren();if(!assessment)return;
  const title=document.createElement('h3');title.textContent=tr(`Автоматическая оценка: ${assessment.points}/5`,`Automatic grade: ${assessment.points}/5`);root.append(title);
  for(const criterion of assessment.criteria){const section=document.createElement('div');section.className='platform-criterion';const h=document.createElement('strong');h.textContent=`${local(criterion.title)} · ${criterion.points}/${criterion.maxPoints}`;const p=document.createElement('p');p.textContent=local(criterion.detail);section.append(h,p);root.append(section);}
}
function block(reason){
  active=false;
  runtime?.freeze();
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  $('#app').hidden=true;$('#app').inert=true;
  $('#platform-loading').hidden=false;$('#platform-loading-text').textContent=reason;
  $('#platform-report').disabled=true;message(reason);
}
function identityChanged(){
  if(!started){tryStart();return;}
  if(!sameOwner())block(tr('Профиль или доступ изменился. Вернитесь в раздел 7; партия прежнего пользователя сохранена отдельно.','Your profile or access changed. Return to section 7; the previous user’s campaign is stored separately.'));
  else refresh();
}
function submissionDialog(){
  const d=$('#platform-submission');const state=runtime?.state();
  if(!sameOwner()||!state||!runtime.canWrite())return;
  try{ensureRun(state);}catch{message(tr('Недостаточно места для сохранения попытки. Сначала скачайте партию.','Not enough space to save this attempt. Download the campaign first.'));return;}
  const sent=stored('submission:'+run.submissionId);
  const acknowledged=backend.localAttempts().some(a=>a.id===run.submissionId&&`student:${a.studentKey}`===owner);
  $('#platform-submission-title').textContent=tr('Отчёт к седьмому семинару','Report for seminar seven');
  $('#platform-submission-intro').textContent=backend.isAdmin()
    ?tr('Это пробное прохождение преподавателя. Его можно изучить и скачать; учебный журнал студентов не изменяется.','This is an instructor preview. Inspect or download it; the student gradebook is unchanged.')
    :tr('По завершении кампании платформа автоматически рассчитывает оценку от 0 до 5 и сохраняет её вместе с отчётом. Учитывается лучший результат. Критерии оценивают выполнение задания в учебной модели.','When the campaign ends, the platform automatically calculates a grade from 0 to 5 and saves it with the report. Your best result counts. The criteria assess performance within this teaching model.');
  $('#platform-run-progress').textContent=terminal(state)
    ?state.completed?tr('Полная кампания: 20 из 20 решений.','Full campaign: 20 of 20 decisions.')
      :tr(`Досрочная передача управления: ${state.history.length} из 20 решений. Этот статус сохранится в отчёте.`,`Early financial handover: ${state.history.length} of 20 decisions. The report preserves this status.`)
    :tr(`Принято решений: ${state.history.length}/20. Ниже — текущий расчёт; окончательная оценка сохранится при завершении.`,`Decisions made: ${state.history.length}/20. This is the current calculation; the final grade is saved when the campaign ends.`);
  renderAssessment(sent?.governor?.assessment||assessCampaign(state,G));
  $('#platform-reflection-label').textContent=tr('Учебный вывод (необязательно)','Reflection (optional)');
  $('#platform-reflection-hint').textContent=sent?tr('Вывод сохранён вместе с итоговым отчётом. Его наличие не влияет на автоматическую оценку.','The reflection was saved with the final report. It does not affect the automatic grade.'):tr('Можно заполнить до последнего решения: объясните отвергнутую альтернативу, территориальные различия и неожиданный результат. Вывод сохранится с итоговым отчётом и не влияет на оценку.','You can write this before the final decision: explain a rejected alternative, territorial differences, and an unexpected result. It is saved with the final report and does not affect your grade.');
  $('#platform-reflection').value=sent?.reflection??run.reflection??'';
  $('#platform-reflection').readOnly=Boolean(sent)||backend.isAdmin();
  $('#platform-submit').hidden=backend.isAdmin();$('#platform-submit').disabled=acknowledged||!terminal(state);
  $('#platform-submit').textContent=acknowledged?tr('Отчёт принят платформой','Report accepted by the platform'):sent?tr('Повторить отправку','Retry submission'):tr('Передать преподавателю','Submit to instructor');
  $('#platform-readable').textContent=tr('Открыть полный учебный отчёт','Open the full learning report');
  $('#platform-submission-close').textContent=tr('Закрыть','Close');
  $('#platform-submission-status').textContent=syncText();
  if(!d.open)d.showModal();
}
async function submit(){
  if(submissionBusy||!sameOwner()||backend.isAdmin()||!runtime?.canWrite())return;
  const state=runtime?.state();if(!terminal(state))return;
  if(run&&backend.localAttempts().some(a=>a.id===run.submissionId&&`student:${a.studentKey}`===owner)){refresh();return;}
  submissionBusy=true;$('#platform-submit').disabled=true;
  try{
    ensureRun(state);
    // Freeze the first record before enqueueing: retries cannot change immutable cloud content.
    let record=stored('submission:'+run.submissionId);
    if(!record){record=makeSubmission({state,G,owner,studentKey:backend.getProfile().studentKey,run,reflection:(run.reflection||'').trim().slice(0,6000),now:new Date().toISOString()});record.title=tr('Семинар 7. Симулятор деятельности губернатора','Seminar 7. Governor simulator');storage.setItem('submission:'+run.submissionId,JSON.stringify(record));}
    if(!sameOwner())throw new Error('auth/profile-changed');
    await backend.saveAttempt(record);
    run.submitted=true;persistRun();
    if(sameOwner()){refresh();if($('#platform-submission').open)submissionDialog();}
  }catch(error){
      if(sameOwner()){const text=tr('Сохранение оценки пока не подтверждено. Откройте «Отчёт к семинару» и повторите отправку.','Grade saving is not confirmed yet. Open the seminar report and retry submission.');message(text);$('#platform-submission-status').textContent=text;$('#platform-submit').disabled=false;}
  }finally{submissionBusy=false;}
}
async function tryStart(){
  if(started||!backend.authReady)return;
  const candidate=attemptOwner();
  if(candidate==='guest'){block(tr('Войдите в существующий профиль платформы, затем откройте симулятор из раздела 7.','Sign in to your existing platform profile, then open the simulator from section 7.'));return;}
  if(!canAccess()){
    const now=backend.globalNow(),gate=topicGate(7,backend.getAccessOverrides(academicContext(now).startYear),now);
    block(gate.override==='closed'?tr('Раздел 7 закрыт преподавателем.','Section 7 is closed by the instructor.'):tr(`Раздел 7 откроется ${formatAccessDate(gate.opensAt,'ru')}.`,`Section 7 opens on ${formatAccessDate(gate.opensAt,'en')}.`));return;
  }
  started=true;active=true;owner=candidate;
  const scoped=scopedStorage(localStorage,owner);
  storage={getItem:key=>scoped.getItem(key),setItem:(key,value)=>{if(!sameOwner())throw new Error('auth/profile-changed');scoped.setItem(key,value);},removeItem:key=>{if(!sameOwner())throw new Error('auth/profile-changed');scoped.removeItem(key);}};
  run=stored('platform-run');
  const profile=backend.getProfile();
  G.Platform={
    storage,lockName:scoped.lockName,storageKey:scoped.keyFor(G.Saves.Key),offlineEnabled:false,
    language,profile:{name:backend.isAdmin()?tr('Преподаватель · пробная кампания','Instructor · preview campaign'):profile.fullName,group:profile?.group||''},
    canWrite:sameOwner,onNewRun:runChanged,onError:()=>block(tr('Не удалось запустить симулятор. Обновите страницу или вернитесь в раздел 7.','The simulator could not start. Reload or return to section 7.')),
    onSaved:state=>{try{ensureRun(state);refresh();if(runtime&&terminal(state)&&!backend.isAdmin())submit();}catch{message(tr('Партия сохранена; сведения об отчёте требуют свободного места на устройстве.','Campaign saved; report metadata needs free device storage.'));}},
    onLanguage:next=>{language=next;if(courseLocale!=='zh')setLocale(next);refresh();},
    onEnd:host=>{if(host.querySelector('[data-platform-submit]'))return;const b=document.createElement('button');b.type='button';b.className='primary-button';b.dataset.platformSubmit='';b.textContent=tr('Оценка и отчёт к семинару','Seminar grade and report');b.addEventListener('click',submissionDialog);host.append(b);},
    attach:api=>{runtime=api;if(!sameOwner()){block(tr('Профиль изменился во время загрузки. Вернитесь в раздел 7.','Your profile changed while loading. Return to section 7.'));return;}$('#player-name').value=G.Platform.profile.name;$('#player-group').value=G.Platform.profile.group;$('#player-name').readOnly=true;$('#player-group').readOnly=true;$('#platform-loading').hidden=true;$('#app').hidden=false;$('#app').inert=false;$('#platform-report').disabled=!api.canWrite();refresh();if(terminal(runtime.state())&&!backend.isAdmin())submit();}
  };
  try{
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./src/app.js';script.onload=resolve;script.onerror=reject;document.body.append(script);});
  }catch{started=false;block(tr('Не удалось загрузить симулятор. Обновите страницу или вернитесь в раздел 7.','The simulator could not be loaded. Reload or return to section 7.'));}
}

$('#platform-back').href=courseUrl;
$('#platform-loading-back').href=courseUrl;
$('#platform-report').addEventListener('click',()=>{if(runtime?.state())submissionDialog();else message(tr('Сначала начните или продолжите кампанию.','Start or resume a campaign first.'));});
$('#platform-submission-close').addEventListener('click',()=>$('#platform-submission').close());
$('#platform-readable').addEventListener('click',()=>{$('#platform-submission').close();G.ReleaseUI.openReport();});
$('#platform-submit').addEventListener('click',submit);
$('#platform-reflection').addEventListener('input',()=>{if(!run||!sameOwner()||run.submitted)return;run.reflection=$('#platform-reflection').value.slice(0,6000);try{persistRun();}catch{message(tr('Не удалось сохранить текст. Скопируйте его перед закрытием страницы.','Text could not be saved. Copy it before closing this page.'));}});
window.addEventListener('rudn:identitychange',identityChanged);
window.addEventListener('rudn:accesschange',identityChanged);
window.addEventListener('visibilitychange',()=>{if(!document.hidden)identityChanged();});
backend.onStatus(()=>{if(started)identityChanged();});
refresh();
backend.init().then(tryStart).catch(()=>block(tr('Не удалось восстановить профиль. Вернитесь на платформу.','Your profile could not be restored. Return to the platform.')));

// The platform owns caching; never install a competing nested service worker.
if('serviceWorker'in navigator){navigator.serviceWorker.register(new URL('../../service-worker.js',import.meta.url)).then(()=>navigator.serviceWorker.ready).then(()=>{$('#offline-status')?.setAttribute('data-platform-offline','ready');}).catch(()=>{});}
