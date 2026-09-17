import {backend} from '../../assets/js/backend.js?v=1.3.7';
import {attemptOwner} from '../../assets/js/attempt-session.js?v=1.3.7';
import {getLocale,setLocale} from '../../assets/js/i18n.js?v=1.3.7';
import {academicContext,topicGate,formatAccessDate} from '../../assets/js/access.js?v=1.3.7';
import {readState,pendingStorageKey} from '../../assets/js/session.js?v=1.3.7';
import {durableStore} from '../../assets/js/durable-store.js';
import {scopedStorage,createRunMetadata,makeSubmission,assessmentRules,assessCampaign} from './platform-contract.js';

const G=window.GovernorGame;
const $=selector=>document.querySelector(selector);
const context=new URL(location.href).searchParams.get('context')==='free'?'free':'course';
const free=context==='free',activitySlug=free?'governor-freeplay':'seminar-7';
const courseUrl=new URL(free?'../../#games':'../../#activity/seminar-7',import.meta.url).href;
const currentOwner=()=>attemptOwner()==='guest'&&free?'guest:governor':attemptOwner();
let owner=null,active=false,storage=null,run=null,runtime=null,started=false,submissionBusy=false;
const storageValues=new Map(),pendingCheckpoints=new Set();
let latestSaveStatus=null;
let language=G.I18n.normalize(getLocale());
const tr=(ru,en,zh)=>language==='zh'&&zh?zh:G.I18n.choose(language,ru,en);
const local=value=>G.I18n.local(value,language);
$('#platform-loading-text').textContent={ru:'Восстанавливаем профиль платформы…',en:'Restoring your course profile…',zh:'正在恢复课程账号…'}[language];
const message=text=>{$('#platform-status').textContent=text;};
const canAccess=()=>{
  if(free||backend.isAdmin())return true;
  const now=backend.globalNow();
  return topicGate(7,backend.getAccessOverrides(academicContext(now).startYear),now).open;
};
const sameOwner=()=>active&&currentOwner()===owner&&canAccess();
const terminal=s=>Boolean(s&&(s.completed||G.BudgetReview.stopped(s)));
function stored(key,fallback=null){try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}}
function checkpointCampaign(state){
 if(!owner||!run||!state)return Promise.resolve();
 const snapshot={campaign:structuredClone(state),run:structuredClone(run),storage:Object.fromEntries(storageValues)};
 const promise=backend.checkpoint({owner,activitySlug,mode:'campaign',attemptId:run.submissionId,contentVersion:String(state.version||'governor-v1'),phase:terminal(state)?'completed':'answering',state:snapshot},{queue:owner.startsWith('student:')})
  .then(saved=>{latestSaveStatus=saved.saveStatus;if(sameOwner())refresh();return saved;})
  .catch(error=>{window.dispatchEvent(new CustomEvent('rudn:storage-warning',{detail:{owner,errorCode:error.code||'storage/unavailable'}}));return null;});
 pendingCheckpoints.add(promise);promise.finally(()=>pendingCheckpoints.delete(promise));return promise;
}
async function flushCampaign(){if(runtime?.state())await checkpointCampaign(runtime.state());await Promise.allSettled([...pendingCheckpoints]);await durableStore.flush();}
function persistRun(state=runtime?.state()){storage.setItem('platform-run',JSON.stringify(run));if(state)checkpointCampaign(state);}
function ensureRun(state){
  if(!run||run.campaignToken&&state?.storiesRunId&&run.campaignToken!==state.storiesRunId){run=createRunMetadata();}
  if(state?.storiesRunId)run.campaignToken=state.storiesRunId;
  persistRun(state);return run;
}
function runChanged(state){
  run=createRunMetadata();run.campaignToken=state?.storiesRunId||null;
  try{persistRun(state);message(tr('Новая партия сохраняется в вашем профиле на этом устройстве.','A new campaign is saved to your profile on this device.'));}
  catch{message(tr('Не удалось сохранить сведения о попытке. Скачайте файл партии.','Attempt metadata could not be saved. Download a campaign save.'));}
}
function syncText(){
  if(latestSaveStatus?.durable===false)return tr('Не удалось сохранить партию на устройстве. Скачайте файл сохранения перед закрытием.','Could not save the campaign on this device. Download a save before closing.');
  if(free)return tr('Свободная игра · партия сохраняется отдельно от учебных заданий.','Free play · this campaign is saved separately from course assignments.','自由游戏 · 本局进度与课程作业分别保存。');
  if(backend.isAdmin())return tr('Режим преподавателя · пробные результаты не отправляются в журнал.','Instructor preview · practice results are not sent to the gradebook.');
  if(!run)return tr('Партия сохраняется на устройстве. Отчёт передаётся после завершения.','The campaign is saved on this device. The final grade and report are submitted automatically.');
  const record=backend.localAttempts().find(a=>a.id===run.submissionId&&`student:${a.studentKey}`===owner);
  if(record)return readState(pendingStorageKey(record),null)
    ?tr(`Автоматическая оценка: ${record.points}/5. Отчёт сохранён на устройстве и ожидает отправки. Не очищайте данные браузера.`,`Automatic grade: ${record.points}/5. The report is saved on this device and is awaiting upload. Keep browser data intact.`)
    :tr(`Отчёт отправлен. Автоматическая оценка: ${record.points}/5; в журнале учитывается лучший результат.`,`Report submitted. Automatic grade: ${record.points}/5; the gradebook keeps your best result.`);
  return terminal(runtime?.state())?tr('Кампания закончена. Сохраняем автоматическую оценку и отчёт.','The campaign has ended. Saving your automatic grade and report.')
    :latestSaveStatus?.state==='saved'?tr('Партия сохранена. Можно продолжить позже.','Campaign saved. You can continue later.'):tr('Партия сохранена на устройстве. Изменения отправятся автоматически.','Campaign saved on this device. Changes will upload automatically.');
}
function refresh(){
  G.I18n.shell(document,language);
  $('#platform-report').textContent=free?tr('Отчёт о кампании','Campaign report','游戏报告'):tr('Отчёт к семинару','Seminar report');
  $('#platform-back').textContent=free?tr('← К играм','← Games','← 游戏'):tr('← Раздел 7','← Section 7');
  $('#platform-course-name').textContent=tr('Введение в специальность','Introduction to the Profession');
  $('#platform-section').textContent=free?tr('Губернатор · свободная игра','Governor · free play','州长 · 自由游戏'):tr('Семинар 7 · Губернатор: Новая область','Seminar 7 · Governor: Novaya Oblast');
  const profile=backend.getProfile();
  $('#platform-identity').textContent=backend.isAdmin()?tr('Преподаватель','Instructor'):(profile?.fullName||(free?tr('Гость','Guest','访客'):''));
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
  if(runtime?.state())checkpointCampaign(runtime.state());
  active=false;
  runtime?.freeze();
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  $('#app').hidden=true;$('#app').inert=true;
  $('#platform-loading').hidden=false;$('#platform-loading-text').textContent=reason;
  $('#platform-report').disabled=true;message(reason);
}
function identityChanged(){
  if(!started){tryStart();return;}
  if(!sameOwner())block(free?tr('Профиль изменился. Вернитесь к играм; партия прежнего пользователя сохранена отдельно.','Your profile changed. Return to Games; the previous user’s campaign is stored separately.','账号已更改。请返回游戏目录；此前玩家的进度已单独保存。'):tr('Профиль или доступ изменился. Вернитесь в раздел 7; партия прежнего пользователя сохранена отдельно.','Your profile or access changed. Return to section 7; the previous user’s campaign is stored separately.'));
  else refresh();
}
function submissionDialog(){
  if(free){if(sameOwner()&&runtime?.state())G.ReleaseUI.openReport();return;}
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
  if(submissionBusy||!sameOwner()||(!free&&backend.isAdmin())||!runtime?.canWrite()||(free&&run?.submitted))return;
  const state=runtime?.state();if(!terminal(state))return;
  if(run&&backend.localAttempts().some(a=>a.id===run.submissionId&&`student:${a.studentKey}`===owner)){refresh();return;}
  submissionBusy=true;$('#platform-submit').disabled=true;
  try{
    ensureRun(state);
    const submittingRun=run;
    // Freeze the first record before enqueueing: retries cannot change immutable cloud content.
    let record=stored('submission:'+run.submissionId);
    if(!record){record=makeSubmission({state,G,owner,studentKey:backend.getProfile()?.studentKey,context,run,reflection:(run.reflection||'').trim().slice(0,6000),now:new Date().toISOString()});record.title=free?tr('Губернатор · свободная игра','Governor · free play','州长 · 自由游戏'):tr('Семинар 7. Симулятор деятельности губернатора','Seminar 7. Governor simulator');storage.setItem('submission:'+run.submissionId,JSON.stringify(record));}
    if(!sameOwner())throw new Error('auth/profile-changed');
    if(free&&!owner.startsWith('student:'))await durableStore.complete({owner,activitySlug,mode:'campaign',attemptId:record.id,state:{campaign:structuredClone(state),run:structuredClone(run),storage:Object.fromEntries(storageValues)},attempt:{...record,draftMode:'campaign'}},{queue:false});
    else await backend.saveAttempt({...record,draftMode:'campaign'});
    submittingRun.submitted=true;
    // Replay can start while the previous result is being written. A receipt
    // belongs to the captured campaign and must never mark its successor sent.
    if(run===submittingRun)persistRun();
    if(sameOwner()){refresh();if($('#platform-submission').open)submissionDialog();}
  }catch(error){
      if(sameOwner()){if(free){message(tr('Не удалось сохранить итог. Повторим при следующем открытии.','Could not save the result. It will be retried on reopening.','暂未保存结果，下次打开时将重试。'));return;}const text=tr('Сохранение оценки пока не подтверждено. Откройте «Отчёт к семинару» и повторите отправку.','Grade saving is not confirmed yet. Open the seminar report and retry submission.');message(text);$('#platform-submission-status').textContent=text;$('#platform-submit').disabled=false;}
  }finally{submissionBusy=false;}
}
async function tryStart(){
  if(started||!backend.authReady)return;
  const candidate=currentOwner();
  if(candidate==='guest'){block(tr('Войдите в существующий профиль платформы, затем откройте симулятор из раздела 7.','Sign in to your existing platform profile, then open the simulator from section 7.'));return;}
  if(!canAccess()){
    const now=backend.globalNow(),gate=topicGate(7,backend.getAccessOverrides(academicContext(now).startYear),now);
    block(gate.override==='closed'?tr('Раздел 7 закрыт преподавателем.','Section 7 is closed by the instructor.'):tr(`Раздел 7 откроется ${formatAccessDate(gate.opensAt,'ru')}.`,`Section 7 opens on ${formatAccessDate(gate.opensAt,'en')}.`));return;
  }
  started=true;active=true;owner=candidate;
  const scoped=scopedStorage(localStorage,owner,{context});
  const observed=new Map();
  const remember=key=>{if(!storageValues.has(key)){let value=null;try{value=scoped.getItem(key);}catch{}storageValues.set(key,value);observed.set(key,value);}return storageValues.get(key);};
  storage={getItem:remember,setItem:(key,value)=>{
    if(!sameOwner())throw new Error('auth/profile-changed');remember(key);
    let actual;try{actual=scoped.getItem(key);}catch{actual=observed.get(key);}
    if(actual!==observed.get(key))throw Object.assign(new Error('other-tab'),{code:'other-tab'});
    storageValues.set(key,String(value));try{scoped.setItem(key,String(value));observed.set(key,String(value));}catch{/* The onSaved boundary commits to IndexedDB even when localStorage is full. */}
  },removeItem:key=>{if(!sameOwner())throw new Error('auth/profile-changed');storageValues.set(key,null);try{scoped.removeItem(key);observed.set(key,null);}catch{}}};
  run=stored('platform-run');
  const restored=await backend.loadDraft({owner,activitySlug,mode:'campaign'});
  if(!sameOwner())return;
  let localCampaign=stored(G.Saves.Key);
  if(restored?.state?.campaign&&restored.state.run&&G.Engine.restoreState(restored.state.campaign)&&(!localCampaign||restored.updatedAt>=(Date.parse(localCampaign.savedAt)||0))){
    for(const [key,value] of Object.entries(restored.state.storage||{})){remember(key);storageValues.set(key,value);}
    remember(G.Saves.Key);storageValues.set(G.Saves.Key,JSON.stringify({format:'rudn-autosave',revision:Math.max(1,Number(localCampaign?.revision)||1),savedAt:new Date(restored.updatedAt).toISOString(),state:restored.state.campaign}));
    run=structuredClone(restored.state.run);remember('platform-run');storageValues.set('platform-run',JSON.stringify(run));latestSaveStatus=restored.saveStatus;
  }else if(localCampaign?.state){ensureRun(localCampaign.state);}
  const profile=backend.getProfile();
  G.Platform={
    storage,lockName:scoped.lockName,storageKey:scoped.keyFor(G.Saves.Key),offlineEnabled:false,
    language,profile:{name:backend.isAdmin()?tr('Преподаватель · пробная кампания','Instructor · preview campaign'):(profile?.fullName||tr('Гость','Guest','访客')),group:profile?.group||''},
    canWrite:sameOwner,onNewRun:runChanged,onError:()=>block(tr('Не удалось запустить симулятор. Обновите страницу или вернитесь в раздел 7.','The simulator could not start. Reload or return to section 7.')),
    onSaved:state=>{try{ensureRun(state);refresh();if(runtime&&terminal(state)&&(free||!backend.isAdmin()))submit();}catch{message(tr('Партия сохранена; сведения об отчёте требуют свободного места на устройстве.','Campaign saved; report metadata needs free device storage.'));}},
    onLanguage:next=>{language=G.I18n.normalize(next);setLocale(language);refresh();},
    onEnd:host=>{if(host.querySelector('[data-platform-submit]'))return;const b=document.createElement('button');b.type='button';b.className='primary-button';b.dataset.platformSubmit='';b.textContent=free?tr('Отчёт о кампании','Campaign report','游戏报告'):tr('Оценка и отчёт к семинару','Seminar grade and report');b.addEventListener('click',submissionDialog);host.append(b);},
    attach:api=>{runtime=api;if(!sameOwner()){block(tr('Профиль изменился во время загрузки. Вернитесь в раздел 7.','Your profile changed while loading. Return to section 7.'));return;}$('#player-name').value=G.Platform.profile.name;$('#player-group').value=G.Platform.profile.group;$('#player-name').readOnly=true;$('#player-group').readOnly=true;$('#platform-loading').hidden=true;$('#app').hidden=false;$('#app').inert=false;$('#platform-report').disabled=!api.canWrite();refresh();if(terminal(runtime.state())&&(free||!backend.isAdmin()))submit();}
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
$('#platform-back').addEventListener('click',async event=>{event.preventDefault();await flushCampaign();location.href=courseUrl;});
window.addEventListener('pagehide',()=>{if(runtime?.state())checkpointCampaign(runtime.state());});
window.addEventListener('rudn:identitychange',identityChanged);
window.addEventListener('rudn:accesschange',identityChanged);
window.addEventListener('visibilitychange',()=>{if(!document.hidden)identityChanged();});
backend.onStatus(()=>{if(started)identityChanged();});
refresh();
backend.init().then(tryStart).catch(()=>block(tr('Не удалось восстановить профиль. Вернитесь на платформу.','Your profile could not be restored. Return to the platform.')));

// The platform owns caching; never install a competing nested service worker.
if('serviceWorker'in navigator){
  let preparing=false,moduleReady=false;
  const updateOfflineStatus=()=>{
    const element=$('#offline-status');if(!element)return;
    element.dataset.platformOffline=moduleReady?'ready':'pending';
    element.textContent=moduleReady
      ?tr('Готово к работе без сети','Ready for offline use')
      :tr('Автономное приложение · ресурсы загружаются','Standalone app · resources loading');
  };
  // Cached resources may be acknowledged before Auth has mounted the game UI.
  const statusMount=new MutationObserver(()=>{if($('#offline-status')){updateOfflineStatus();statusMount.disconnect();}});
  statusMount.observe(document.body,{childList:true,subtree:true});
  const prepare=()=>{
    if(preparing||moduleReady||!navigator.serviceWorker.controller)return;
    preparing=true;updateOfflineStatus();
    navigator.serviceWorker.controller.postMessage({type:'PREPARE_MODULE',module:'governor',urls:[location.href,new URL('../../assets/course/previews/seminar_07_simulator.jpg',import.meta.url).href]});
  };
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.source!==navigator.serviceWorker.controller||event.data?.type!=='MODULE_CACHE_STATUS'||event.data.module!=='governor')return;
    preparing=false;moduleReady=event.data.ready===true;updateOfflineStatus();
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{preparing=false;moduleReady=false;prepare();});
  window.addEventListener('online',prepare);
  window.addEventListener('rudn:locale',updateOfflineStatus);
  navigator.serviceWorker.register(new URL('../../service-worker.js',import.meta.url))
    .then(()=>navigator.serviceWorker.ready).then(prepare).catch(()=>{});
}
