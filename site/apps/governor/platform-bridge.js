import {createUpdateAdapter,captureUpdateView,restoreUpdateView} from '../../assets/js/platform-update-state.js';
import {bootstrapUpdateCoordinator,UPDATE_PENDING_KEY} from '../../assets/js/platform-update-coordinator.js';
import {getSharedPlatformDiagnostics} from '../../assets/js/diagnostics.js';
import {resourceURL,getReleaseContext} from '../../assets/js/release-resources.js';
import {CONFIG} from '../../assets/js/config.js?v=1.3.10';
import {backend} from '../../assets/js/backend.js?v=1.3.10';
import {attemptOwner} from '../../assets/js/attempt-session.js?v=1.3.10';
import {getLocale,setLocale} from '../../assets/js/i18n.js?v=1.3.10';
import {academicContext,topicGate,formatAccessDate} from '../../assets/js/access.js?v=1.3.10';
import {gameAccessGate} from '../../assets/js/games-catalog.js?v=1.3.10';
import {readState,pendingStorageKey} from '../../assets/js/session.js?v=1.3.10';
import {durableStore} from '../../assets/js/durable-store.js';
import {canResumeGameDraft,markGameDraft} from '../../assets/js/game-release-policy.js';
import {governorReflectionText,isGovernorReflection,latestGovernorReflection,makeGovernorReflection} from '../../assets/js/governor-reflections.js';
import {openLocalCampaignSlots} from './src/local-campaign-slots.js';
import {finalFive,practiceAdapter,addReplayChoice,replayURL} from './src/final-five.js';
import {scopedStorage,createRunMetadata,makeSubmission,assessmentRules,assessCampaign,northernCareComparison} from './platform-contract.js';

const G=window.GovernorGame;
G.northernCareComparison=state=>northernCareComparison(state,G);
const gameRoute=new URL(location.href).searchParams;
const isPractice=gameRoute.get('practice')==='last-five';
G.I18n.setCatalogLoader(()=>import('./locales/zh-Hans.js'));
if(G.I18n.normalize(getLocale())==='zh')await G.I18n.ensureCatalog();
G.Saves.setReleasePolicy({canResume:canResumeGameDraft,mark:markGameDraft});
const courseResponse=await fetch(resourceURL('../../data/course.json',import.meta.url));
if(!courseResponse.ok)throw new Error('Course catalogue unavailable');
const course=await courseResponse.json();
const $=selector=>document.querySelector(selector);
const context=new URL(location.href).searchParams.get('context')==='free'?'free':'course';
const free=context==='free',activitySlug=free?'governor-freeplay':'seminar-7';
const courseUrl=new URL(free?'../../#games':'../../#activity/seminar-7',import.meta.url).href;
const currentOwner=()=>attemptOwner()==='guest'&&free?'guest:governor':attemptOwner();
let owner=null,active=false,storage=null,run=null,runtime=null,started=false,submissionBusy=false,reflectionBusy=false;
let v3Runtime;
let reflectionFailure='';
const storageValues=new Map(),pendingCheckpoints=new Set();
let latestSaveStatus=null,updateAdapter=null,updateCoordinator=null,updatePaused=false;
const diagnosticService=getSharedPlatformDiagnostics({backend,getLocale:()=>getLocale(),getModule:()=> 'governor'});let diagnostics=diagnosticService.forModule('governor');
let language=G.I18n.normalize(getLocale());
const tr=(ru,en,zh)=>language==='zh'&&zh?zh:G.I18n.choose(language,ru,en);
const local=value=>G.I18n.local(value,language);
$('#platform-loading-text').textContent={ru:'Восстанавливаем профиль платформы…',en:'Restoring your course profile…',zh:'正在恢复课程账号…'}[language];
function message(text,routine=false){
  const status=$('#platform-status');
  status.textContent=text;
  status.classList.toggle('routine-status',routine);
}
const canAccess=()=>{
  if(free)return gameAccessGate('governor',backend,course)?.open!==false;
  if(backend.isAdmin())return true;
  const now=backend.globalNow();
  return topicGate(7,backend.getAccessOverrides(academicContext(now).startYear),now).open;
};
const sameOwner=()=>active&&currentOwner()===owner&&canAccess();
const terminal=s=>Boolean(s&&(s.completed||G.BudgetReview.stopped(s)));
function stored(key,fallback=null){try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}}
function checkpointCampaign(state){
 if(!owner||!run||!state)return Promise.resolve();
 const snapshot={governorSaveSchema:G.Saves.SCHEMA,campaign:structuredClone(state),run:structuredClone(run),storage:Object.fromEntries(storageValues)},started=performance.now(),scope=diagnostics;
 const promise=backend.checkpoint({owner,activitySlug,mode:'campaign',attemptId:run.submissionId,contentVersion:String(state.version||'governor-v1'),phase:terminal(state)?'completed':'answering',state:snapshot},{queue:owner.startsWith('student:')})
  .then(saved=>{scope.record('checkpoint',{operation:'draft-save',success:!!saved.saveStatus?.durable,code:saved.saveStatus?.durable?'ok':'storage',durationMs:performance.now()-started});latestSaveStatus=saved.saveStatus;if(sameOwner())refresh();return saved;})
  .catch(error=>{scope.error(error,{event:'checkpoint',code:'storage',operation:'save',durationMs:performance.now()-started});window.dispatchEvent(new CustomEvent('rudn:storage-warning',{detail:{owner,errorCode:error.code||'storage/unavailable'}}));return null;});
 pendingCheckpoints.add(promise);promise.finally(()=>pendingCheckpoints.delete(promise));return promise;
}
async function flushCampaign(){if(runtime?.state())await checkpointCampaign(runtime.state());await Promise.allSettled([...pendingCheckpoints]);await durableStore.flush();}
function persistRun(state=runtime?.state()){run.updatedAt=Math.max(Date.now(),(Number(run.updatedAt)||0)+1);storage.setItem('platform-run',JSON.stringify(run));if(state)checkpointCampaign(state);}
function ensureRun(state){
  if(!run||run.campaignToken&&state?.storiesRunId&&run.campaignToken!==state.storiesRunId){run=createRunMetadata();}
  if(state?.storiesRunId)run.campaignToken=state.storiesRunId;
  persistRun(state);return run;
}
function runChanged(state,restoredRun){
  run=restoredRun?.submissionId&&restoredRun.campaignToken===state?.storiesRunId?structuredClone(restoredRun):createRunMetadata();run.campaignToken=state?.storiesRunId||null;reflectionFailure='';
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
  if(isPractice && G.Platform?.practice){
    $('#platform-back').textContent=tr('← К исходным итогам','← Original results','← 原始结果');
    $('#platform-back').href=replayURL(false,location.href);
    $('#platform-report').hidden=true;
    message(tr('Пробная пятилетка · прогресс на этом устройстве · без оценки','Five-year replay · saved on this device · ungraded','五年练习 · 进度保存在本设备 · 不计分'));
    return;
  }
  $('#platform-report').textContent=free?tr('Отчёт о кампании','Campaign report','游戏报告'):tr('Отчёт к семинару','Seminar report');
  $('#platform-back').textContent=free?tr('← К играм','← Games','← 游戏'):tr('← Раздел 7','← Section 7');
  $('#platform-course-name').textContent=tr('Введение в специальность','Introduction to the Profession');
  $('#platform-section').textContent=free?tr('Губернатор · свободная игра','Governor · free play','州长 · 自由游戏'):tr('Семинар 7 · Губернатор: Новая область','Seminar 7 · Governor: Novaya Oblast');
  const profile=backend.getProfile();
  $('#platform-identity').textContent=backend.isAdmin()?tr('Преподаватель','Instructor'):(profile?.fullName||(free?tr('Гость','Guest','访客'):''));
  $('#platform-identity').title=backend.isAdmin()?(backend.user.displayName||backend.user.email||''):(profile?.fullName||'');
  if(active)message(syncText(),free&&latestSaveStatus?.durable!==false);
  if($('#platform-rubric'))renderRules();
  if($('#platform-submission')?.open){$('#platform-submission-status').textContent=syncText();renderReflectionStatus();}
}
function renderRules(){
  const root=$('#platform-rubric');if(!root)return;
  root.hidden=free;if(free)return;
  const open=root.open;root.replaceChildren();const summary=document.createElement('summary');summary.textContent=tr('Как рассчитывается оценка 0–5','How the 0–5 grade is calculated');root.append(summary);
  for(const rule of assessmentRules){const p=document.createElement('p');const strong=document.createElement('strong');strong.textContent=local(rule.title)+'. ';p.append(strong,document.createTextNode(local(rule.detail)));root.append(p);}
  root.open=open;
}
function renderAssessment(assessment){
  const root=$('#platform-assessment');root.replaceChildren();if(!assessment)return;
  const title=document.createElement('h3');title.textContent=tr(`Автоматическая оценка: ${assessment.points}/5`,`Automatic grade: ${assessment.points}/5`);root.append(title);
  if(assessment.version){const version=document.createElement('p');version.className='platform-hint';version.textContent=tr(`Рубрика этой кампании: ${assessment.version}.`,`This campaign’s rubric: ${assessment.version}.`,`本局评分标准：${assessment.version}。`);root.append(version);}
  if(assessment.version==='governor-assignment-v1'){const note=document.createElement('p');note.className='platform-hint';note.textContent=tr('Сохранённая кампания использует рубрику первого выпуска. Новые кампании оцениваются по многолетним результатам; их правила приведены на стартовом экране.','This saved campaign uses the first-release rubric. New campaigns are assessed on results over multiple years; their rules appear on the start screen.','此保存的游戏使用首版评分标准。新游戏按多年结果评分，其规则显示在开始界面。');root.append(note);}
  for(const criterion of assessment.criteria){const section=document.createElement('div');section.className='platform-criterion';const h=document.createElement('strong');h.textContent=`${local(criterion.title)} · ${criterion.points}/${criterion.maxPoints}`;const p=document.createElement('p');p.textContent=local(criterion.detail);section.append(h,p);root.append(section);}
}
function block(reason){
  if(runtime?.state())checkpointCampaign(runtime.state());
  active=false;
  v3Runtime?.freeze();
  const v3=$('#governor-v3');
  if(v3)v3.hidden=true;
  document.body.classList.remove('governor-v3-active');
  runtime?.freeze();
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  const historic=$('#app');if(historic){historic.hidden=true;historic.inert=true;}
  $('#platform-loading').hidden=false;$('#platform-loading-text').textContent=reason;
  $('#platform-report').disabled=true;message(reason);
}
function identityChanged(){
  if(!started){tryStart();return;}
  if(!active)return;
  if(!sameOwner())block(free?tr('Профиль изменился. Вернитесь к играм; партия прежнего пользователя сохранена отдельно.','Your profile changed. Return to Games; the previous user’s campaign is stored separately.','账号已更改。请返回游戏目录；此前玩家的进度已单独保存。'):tr('Профиль или доступ изменился. Вернитесь в раздел 7; партия прежнего пользователя сохранена отдельно.','Your profile or access changed. Return to section 7; the previous user’s campaign is stored separately.'));
  else if(v3Runtime)v3Runtime.refresh();
  else refresh();
}
function reflectionParent(){return run?stored('submission:'+run.submissionId)||backend.localAttempts().find(a=>a.id===run.submissionId&&`student:${a.studentKey}`===owner):null;}
function reflectionReceipt(parent=reflectionParent()){
  if(!parent)return null;
  return latestGovernorReflection([...backend.localAttempts(),...(isGovernorReflection(run?.reflectionReceipt,parent)?[run.reflectionReceipt]:[])],parent);
}
function reflectionChanged(parent=reflectionParent()){
  return Boolean(parent)&&governorReflectionText(run?.reflection??parent.reflection)!==governorReflectionText(reflectionReceipt(parent)?.reflection??parent.reflection);
}
function renderReflectionStatus(){
  const field=$('#platform-reflection'),hint=$('#platform-reflection-hint'),button=$('#platform-reflection-save');
  if(!field||!hint||!button||!run)return;
  const parent=reflectionParent(),receipt=reflectionReceipt(parent),changed=reflectionChanged(parent),ended=terminal(runtime?.state());
  field.readOnly=backend.isAdmin();
  button.hidden=backend.isAdmin()||!ended;
  button.disabled=reflectionBusy||submissionBusy||(!changed&&!run.pendingReflection);
  button.textContent=reflectionBusy?tr('Сохраняем вывод…','Saving reflection…','正在保存反思……'):run.pendingReflection?tr('Повторить сохранение вывода','Retry reflection save','重试保存反思'):tr('Сохранить вывод','Save reflection','保存反思');
  hint.textContent=reflectionFailure||(!ended
    ?tr('Объясните отвергнутую альтернативу, территориальные различия и неожиданный результат. Вывод можно дополнить после итогов; он не меняет автоматическую оценку.','Explain a rejected alternative, territorial differences, and an unexpected result. You can add to this after the final results; it does not change the automatic grade.','请解释被否决的备选方案、地区差异及意外结果。游戏结束后仍可补充反思；反思不改变自动评分。')
    :reflectionBusy?tr('Сохраняем дополнение к отчёту. Текст можно продолжать редактировать.','Saving an addendum to the report. You can keep editing.','正在保存报告补充内容。您可以继续编辑。')
    :changed||run.pendingReflection?tr('Текст сохранён как черновик на этом устройстве. Нажмите «Сохранить вывод», чтобы добавить его к отчёту преподавателя. Оценка не изменится.','The text is saved as a draft on this device. Choose “Save reflection” to add it to the instructor’s report. The grade will not change.','文本已作为草稿保存在此设备上。点击“保存反思”将其添加到教师报告中，评分不会改变。')
    :receipt&&readState(pendingStorageKey(receipt),null)?tr('Вывод сохранён на устройстве и ожидает отправки. Он отправится автоматически при подключении к сети; текст можно дополнить.','The reflection is saved on this device and is awaiting upload. It will upload automatically when online; you can continue editing.','反思已保存在此设备上，等待上传。联网后会自动上传；您仍可继续编辑。')
    :receipt?tr('Дополнение сохранено для отчёта. Его можно редактировать и сохранить снова; оценка останется прежней.','The addendum is saved for the report. You can edit and save it again; the grade stays the same.','报告补充内容已保存。您可以再次编辑并保存，评分保持不变。')
    :tr('После знакомства с итогами можно написать или дополнить вывод и сохранить его отдельным дополнением к отчёту. Автоматическая оценка уже зафиксирована.','After reviewing the results, write or edit your reflection and save it as a report addendum. The automatic grade is already fixed.','查看结果后，您可以撰写或修改反思，并将其作为报告补充内容保存。自动评分已确定。'));
}
async function saveReflection(){
  if(reflectionBusy||updatePaused||!sameOwner()||free||backend.isAdmin()||!runtime?.canWrite()||!terminal(runtime.state())||!run)return;
  reflectionBusy=true;reflectionFailure='';const editingRun=run,scope=diagnostics,started=performance.now();let saved=false;
  try{
    if(!reflectionParent())await submit();
    if(!sameOwner()||run!==editingRun)return;
    const parent=reflectionParent();if(!parent)throw new Error('governor/missing-report');
    let record=editingRun.pendingReflection;
    if(record&&!isGovernorReflection(record,parent))throw new Error('governor/invalid-reflection');
    if(!record&&!reflectionChanged(parent))return;
    if(!record){
      const receipt=reflectionReceipt(parent),revision=Math.max(receipt?.reflectionRevision||0,editingRun.reflectionRevision||0)+1;
      record=makeGovernorReflection({id:createRunMetadata().submissionId,parent,reflection:editingRun.reflection,revision});
      record.title=tr('Семинар 7. Дополнение к выводу','Seminar 7. Reflection addendum','研讨课7：反思补充');
      editingRun.pendingReflection=record;
      // Freeze the addendum id/content before a request. A retry must use the
      // same immutable record even when the textarea has changed meanwhile.
      persistRun();
    }
    renderReflectionStatus();
    if(!editingRun.submitted&&!backend.localAttempts().some(a=>a.id===parent.id&&a.studentKey===parent.studentKey))await submit();
    if(!sameOwner()||run!==editingRun)return;
    if(!editingRun.submitted&&!backend.localAttempts().some(a=>a.id===parent.id&&a.studentKey===parent.studentKey))throw new Error('governor/report-not-saved');
    await backend.saveAttempt({...record,draftMode:'reflection'});
    editingRun.reflectionReceipt=record;editingRun.reflectionRevision=record.reflectionRevision;delete editingRun.pendingReflection;saved=true;
    if(sameOwner()&&run===editingRun)persistRun();
    scope.record('result-save',{operation:'reflection',success:true,durationMs:performance.now()-started});
  }catch(error){
    scope.error(error,{event:'result-save',operation:'reflection',durationMs:performance.now()-started});
    if(sameOwner()&&run===editingRun)reflectionFailure=tr('Отправка вывода пока не подтверждена. Текст можно редактировать; нажмите «Повторить сохранение вывода» или откройте эту кампанию после восстановления связи.','Reflection saving is not confirmed yet. You can keep editing; retry saving or reopen this campaign when the connection is restored.','反思保存尚未确认。您可以继续编辑；请重试保存，或在网络恢复后重新打开本局。');
  }finally{
    reflectionBusy=false;if(sameOwner())renderReflectionStatus();
    // Edits made during the request become a new record, never a mutation of
    // the one the backend may already have accepted.
    if(saved&&sameOwner()&&run===editingRun&&reflectionChanged())void saveReflection();
  }
}
function submissionDialog(){
  if(free){if(sameOwner()&&runtime?.state())G.ReleaseUI.openReport();return;}
  const d=$('#platform-submission');const state=runtime?.state();
  if(!sameOwner()||!state||!runtime.canWrite())return;
  try{ensureRun(state);}catch{message(tr('Недостаточно места для сохранения попытки. Сначала скачайте партию.','Not enough space to save this attempt. Download the campaign first.'));return;}
  const sent=reflectionParent();
  const acknowledged=backend.localAttempts().some(a=>a.id===run.submissionId&&`student:${a.studentKey}`===owner);
  $('#platform-submission-title').textContent=tr('Отчёт к седьмому семинару','Report for seminar seven');
  $('#platform-submission-intro').textContent=backend.isAdmin()
    ?tr('Пробное прохождение преподавателя. Итоги доступны для учебного разбора.','Instructor preview. Your results are available for discussion.')
    :tr('По завершении кампании платформа автоматически рассчитывает оценку от 0 до 5 и сохраняет её вместе с отчётом. Учитывается лучший результат. Критерии оценивают выполнение задания в учебной модели.','When the campaign ends, the platform automatically calculates a grade from 0 to 5 and saves it with the report. Your best result counts. The criteria assess performance within this teaching model.');
  $('#platform-run-progress').textContent=terminal(state)
    ?state.completed?tr('Полная кампания: 20 из 20 решений.','Full campaign: 20 of 20 decisions.')
      :tr(`Досрочная передача управления: ${state.history.length} из 20 решений. Этот статус сохранится в отчёте.`,`Early financial handover: ${state.history.length} of 20 decisions. The report preserves this status.`)
    :tr(`Принято решений: ${state.history.length}/20. Ниже — текущий расчёт; окончательная оценка сохранится при завершении.`,`Decisions made: ${state.history.length}/20. This is the current calculation; the final grade is saved when the campaign ends.`);
  renderAssessment(sent?.governor?.assessment||assessCampaign(state,G));
  $('#platform-reflection-label').textContent=tr('Учебный вывод (необязательно)','Reflection (optional)');
  if(run.reflection===undefined)run.reflection=reflectionReceipt(sent)?.reflection??sent?.reflection??'';
  $('#platform-reflection').value=run.reflection;
  renderReflectionStatus();
  $('#platform-submit').hidden=backend.isAdmin();$('#platform-submit').disabled=acknowledged||!terminal(state);
  $('#platform-submit').textContent=acknowledged?tr('Отчёт принят платформой','Report accepted by the platform'):sent?tr('Повторить отправку','Retry submission'):tr('Передать преподавателю','Submit to instructor');
  $('#platform-readable').textContent=tr('Открыть полный учебный отчёт','Open the full learning report');
  $('#platform-submission-close').textContent=tr('Закрыть','Close');
  $('#platform-submission-status').textContent=syncText();
  if(!d.open)d.showModal();
}
async function submit(){
  if(updatePaused||submissionBusy||!sameOwner()||(!free&&backend.isAdmin())||!runtime?.canWrite()||(free&&run?.submitted))return;
  const state=runtime?.state();if(!terminal(state))return;
  if(run&&backend.localAttempts().some(a=>a.id===run.submissionId&&`student:${a.studentKey}`===owner)){run.submitted=true;refresh();if(run.pendingReflection)void saveReflection();return;}
  submissionBusy=true;$('#platform-submit').disabled=true;const started=performance.now(),scope=diagnostics;
  try{
    ensureRun(state);
    const submittingRun=run;
    // Freeze the first record before enqueueing: retries cannot change immutable cloud content.
    let record=stored('submission:'+run.submissionId);
    if(!record){record=makeSubmission({state,G,owner,studentKey:backend.getProfile()?.studentKey,context,run,reflection:(run.reflection||'').trim().slice(0,6000),now:new Date().toISOString()});record.title=free?tr('Губернатор · свободная игра','Governor · free play','州长 · 自由游戏'):tr('Семинар 7. Симулятор деятельности губернатора','Seminar 7. Governor simulator');storage.setItem('submission:'+run.submissionId,JSON.stringify(record));}
    if(!sameOwner())throw new Error('auth/profile-changed');
    if(free&&!owner.startsWith('student:'))await durableStore.complete({owner,activitySlug,mode:'campaign',attemptId:record.id,state:{campaign:structuredClone(state),run:structuredClone(run),storage:Object.fromEntries(storageValues)},attempt:{...record,draftMode:'campaign'}},{queue:false});
    else await backend.saveAttempt({...record,draftMode:'campaign'});
    scope.record('result-save',{operation:'submit',success:true,durationMs:performance.now()-started});submittingRun.submitted=true;
    // Replay can start while the previous result is being written. A receipt
    // belongs to the captured campaign and must never mark its successor sent.
    if(run===submittingRun)persistRun();
    if(sameOwner()){refresh();if($('#platform-submission').open)submissionDialog();}
  }catch(error){
      scope.error(error,{event:'result-save',operation:'submit',durationMs:performance.now()-started});if(sameOwner()){if(free){message(tr('Не удалось сохранить итог. Повторим при следующем открытии.','Could not save the result. It will be retried on reopening.','暂未保存结果，下次打开时将重试。'));return;}const text=tr('Сохранение оценки пока не подтверждено. Откройте «Отчёт к семинару» и повторите отправку.','Grade saving is not confirmed yet. Open the seminar report and retry submission.');message(text);$('#platform-submission-status').textContent=text;$('#platform-submit').disabled=false;}
  }finally{submissionBusy=false;if(sameOwner()){renderReflectionStatus();if(!free&&run?.submitted&&run.pendingReflection)void saveReflection();}}
}
async function tryStart(){
  if(started||!backend.authReady)return;
  const candidate=currentOwner();
  if(candidate==='guest'){block(tr('Войдите в существующий профиль платформы, затем откройте симулятор из раздела 7.','Sign in to your existing platform profile, then open the simulator from section 7.'));return;}
  if(!canAccess()){
    const now=backend.globalNow(),gate=topicGate(7,backend.getAccessOverrides(academicContext(now).startYear),now);
    block(gate.override==='closed'?tr('Раздел 7 закрыт преподавателем.','Section 7 is closed by the instructor.'):tr(`Раздел 7 откроется ${formatAccessDate(gate.opensAt,'ru')}.`,`Section 7 opens on ${formatAccessDate(gate.opensAt,'en')}.`));return;
  }
  started=true;active=true;owner=candidate;diagnostics.destroy();diagnostics=diagnosticService.forModule('governor');const loadEnd=diagnostics.span('module-load');
  const scoped=scopedStorage(localStorage,owner,{context});
  const localSlots=await openLocalCampaignSlots(scoped);
  if(!sameOwner())return;
  const practiceSession=finalFive(scoped,G,sameOwner,localSlots);
  if(isPractice){
    G.Platform=practiceAdapter(practiceSession,{
      language,tr,canWrite:sameOwner,onLanguage:next=>{language=G.I18n.normalize(next);refresh();},
      onError:()=>block(tr('Не удалось открыть пробную пятилетку.','Could not open the five-year replay.','无法打开五年练习。')),
      reveal:()=>{$('#platform-loading').hidden=true;$('#app').hidden=false;$('#app').inert=false;refresh();window.dispatchEvent(new Event('governor:playable'));}
    });
    if(!G.Platform){
      block(tr('Для этого профиля и завершённой партии нет доступной пробной копии.','No local replay is available for this profile and completed campaign.','当前账号和已完成的游戏没有可用的本地练习进度。'));
      $('#platform-back').href=replayURL(false,location.href);
      return;
    }
    await G.I18n.ensureCatalog();
    if(sameOwner())await loadApplication(loadEnd);
    return;
  }
  const observed=new Map();
  const remember=key=>{if(!storageValues.has(key)){let value=null;try{value=scoped.getItem(key);}catch{}storageValues.set(key,value);observed.set(key,value);}return storageValues.get(key);};
  storage={confirmPrevious:async raw=>{
    if(!sameOwner())throw new Error('auth/profile-changed');
    try{await localSlots.confirm(G.Saves.Previous,raw);}catch{throw Object.assign(new Error('recovery-unavailable'),{code:'recovery-unavailable'});}
    if(!sameOwner())throw new Error('auth/profile-changed');
  },getItem:key=>key===G.Saves.Previous?localSlots.getItem(key):remember(key),setItem:(key,value)=>{
    if(!sameOwner())throw new Error('auth/profile-changed');
    if(key===G.Saves.Previous){localSlots.setItem(key,value);return;}
    remember(key);
    let actual;try{actual=scoped.getItem(key);}catch{actual=observed.get(key);}
    if(actual!==observed.get(key))throw Object.assign(new Error('other-tab'),{code:'other-tab'});
    try{scoped.setItem(key,String(value));observed.set(key,String(value));}catch(error){
      // Recovery is the only copy of otherwise unreadable data. Do not allow
      // replacement of that data until its archive has really been written.
      if(key===G.Saves.Recovery)throw error;
      /* The onSaved boundary commits regular state to IndexedDB when localStorage is full. */
    }
    storageValues.set(key,String(value));
  },removeItem:key=>{if(!sameOwner())throw new Error('auth/profile-changed');if(key===G.Saves.Previous){localSlots.removeItem(key);return;}try{scoped.removeItem(key);observed.set(key,null);}catch(error){if(key===G.Saves.Key)throw error;}storageValues.set(key,null);}};
  run=stored('platform-run');
  const restored=await backend.loadDraft({owner,activitySlug,mode:'campaign'});
  if(!sameOwner())return;
  const localStore=new G.Saves.Store(storage),localResult=localStore.inspect(),localRaw=localStore.raw();
  const hasHistoric=Boolean(localRaw||restored?.state?.campaign||run);
  const useHistoric=hasHistoric&&(!free||gameRoute.get('edition')==='legacy');
  if(!useHistoric){
    await startV3(loadEnd,hasHistoric);
    return;
  }
  // Authored fields in existing reports can have been saved in any language.
  if(localRaw||restored?.state?.campaign||run)await G.I18n.ensureCatalog();
  if(!sameOwner())return;
  const schema=restored?.state?.governorSaveSchema??G.Saves.SCHEMA;
  const restoredState=schema===G.Saves.SCHEMA&&restored?.state?.campaign?G.Engine.restoreState(restored.state.campaign):null;
  if(restored?.state?.campaign&&!restoredState){
    localStore.preserve(JSON.stringify(restored),'platform-campaign',schema!==G.Saves.SCHEMA?'incompatible-schema':'invalid-state');
    // Expose an unsupported cloud-only campaign to the save manager instead of
    // silently presenting an empty account. The exact snapshot is archived above.
    if(!localRaw)storageValues.set(G.Saves.Key,JSON.stringify({format:'rudn-autosave',schema,revision:1,state:restored.state.campaign}));
  }
  if(restoredState&&restored.state.run&&(localResult.status!=='ok'||restored.updatedAt>=(Date.parse(localResult.savedAt)||0))){
    const recoveryRaw=restored.state.storage?.[G.Saves.Recovery];
    if(recoveryRaw){
      let entries;try{const archive=JSON.parse(recoveryRaw);if(archive.format==='rudn-governor-recovery'&&archive.schema===G.Saves.SCHEMA&&Array.isArray(archive.entries))entries=archive.entries;}catch{}
      if(entries?.every(entry=>typeof entry?.raw==='string'&&typeof entry?.key==='string'))for(const entry of entries)localStore.preserve(entry.raw,entry.key,entry.reason);
      else localStore.preserve(recoveryRaw,G.Saves.Recovery,'unreadable-recovery');
    }
    if(localRaw&&JSON.stringify(localResult.state)!==JSON.stringify(restoredState)){
      if(localResult.status==='ok'&&run?.submissionId&&run.submissionId!==restored.state.run.submissionId)localStore.pinCampaign(localRaw,run);
      else localStore.preservePrevious(localRaw);
    }
    const localBackup=storageValues.get(G.Saves.Backup);
    for(const [key,value] of Object.entries(restored.state.storage||{})){
      if([G.Saves.Key,G.Saves.Recovery,G.Saves.Previous,'platform-run'].includes(key)||(key===G.Saves.Backup&&localBackup))continue;
      remember(key);storageValues.set(key,value);
    }
    remember(G.Saves.Key);storageValues.set(G.Saves.Key,JSON.stringify(markGameDraft({format:'rudn-autosave',schema:G.Saves.SCHEMA,model:restoredState.version,revision:Math.max(1,localResult.revision||1),savedAt:new Date(restored.updatedAt).toISOString(),state:restoredState})));
    // Text can change after the last game decision. Keep a newer local sidecar
    // from this exact attempt if closing/offline interrupted its checkpoint.
    const restoredRun=restored.state.run;
    if(run?.submissionId!==restoredRun.submissionId||(Number(run?.updatedAt)||0)<=(Number(restoredRun.updatedAt)||0))run=structuredClone(restoredRun);
    remember('platform-run');storageValues.set('platform-run',JSON.stringify(run));latestSaveStatus=restored.saveStatus;
  }else if(localResult.status==='ok'){ensureRun(localResult.state);}
  const profile=backend.getProfile();
  G.Platform={
    captureFinalFive:practiceSession.capture,currentRun:()=>run,resumeOnEntry:gameRoute.get('returnTo')==='term'&&localStore.inspect().state?.completed===true,
    storage,lockName:scoped.lockName,storageKey:scoped.keyFor(G.Saves.Key),offlineEnabled:false,
    language,freePlay:free,profile:{name:backend.isAdmin()?tr('Преподаватель · пробная кампания','Instructor · preview campaign'):(profile?.fullName||tr('Гость','Guest','访客')),group:profile?.group||''},
    canWrite:()=>!updatePaused&&sameOwner(),onResume:()=>{identityChanged();updateCoordinator?.notifyStateChanged();},onNewRun:runChanged,onError:()=>{loadEnd({success:false,code:'load-failed'});diagnostics.record('module-error',{operation:'load',success:false,code:'load-failed'});block(tr('Не удалось запустить симулятор. Обновите страницу или вернитесь в раздел 7.','The simulator could not start. Reload or return to section 7.'));},
    onSaved:state=>{try{ensureRun(state);refresh();if(runtime&&terminal(state)&&(free||!backend.isAdmin()))submit();}catch{message(tr('Партия сохранена; сведения об отчёте требуют свободного места на устройстве.','Campaign saved; report metadata needs free device storage.'));}},
    onLanguage:next=>{language=G.I18n.normalize(next);setLocale(language);refresh();},
    onEnd:host=>{const finished=runtime?.state();if(finished?.completed)addReplayChoice(host,practiceSession,finished,tr,location.href);if(host.querySelector('[data-platform-submit]'))return;const b=document.createElement('button');b.type='button';b.className='primary-button';b.dataset.platformSubmit='';b.textContent=free?tr('Отчёт о кампании','Campaign report','游戏报告'):tr('Оценка и отчёт к семинару','Seminar grade and report');b.addEventListener('click',submissionDialog);host.append(b);},
    attach:api=>{runtime=api;if(!sameOwner()){block(tr('Профиль изменился во время загрузки. Вернитесь в раздел 7.','Your profile changed while loading. Return to section 7.'));return;}$('#player-name').value=G.Platform.profile.name;$('#player-group').value=G.Platform.profile.group;$('#player-name').readOnly=true;$('#player-group').readOnly=true;$('#platform-loading').hidden=true;$('#app').hidden=false;$('#app').inert=false;$('#platform-report').disabled=!api.canWrite();refresh();installUpdateAdapter();loadEnd({success:true});diagnostics.record('module-ready',{success:true});window.dispatchEvent(new Event('governor:playable'));if(!sessionStorage.getItem(UPDATE_PENDING_KEY)&&terminal(runtime.state())&&(free||!backend.isAdmin()))submit();}
  };
  await loadApplication(loadEnd);
}

let v3Dependencies;
function loadV3(){
  if(!v3Dependencies){
    const list=['v3-event-bank','v3-event-copy','v3-event-art','v3-events','v3-rules','v3-store','v3-advisor','v3-motion','v3-runtime','v3-ui'];
    v3Dependencies=Promise.all(list.map(name=>new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.async=false;
      script.src=resourceURL('./src/'+name+'.js',import.meta.url).href;
      script.onload=resolve;
      script.onerror=()=>reject(Error('governor-v3/load:'+name));
      document.head.append(script);
    })));
  }
  return v3Dependencies;
}

async function startV3(loadEnd,hasHistoric){
  try{
    await loadV3();
    if(!sameOwner())return;
    const current=await backend.loadDraft({owner,activitySlug,mode:G.V3Runtime.draftMode});
    if(!sameOwner())return;
    let legacyURL;
    if(free&&hasHistoric){
      const archive=new URL(location.href);archive.searchParams.set('edition','legacy');legacyURL=archive.href;
    }
    v3Runtime=await G.V3Runtime.mount($('#governor-v3'),{
      owner,context,language,backend,preview:backend.isAdmin()&&!free,
      canWrite:sameOwner,setLanguage:next=>{language=next;setLocale(next);G.I18n.shell(document,next);},
      credential:()=>backend.user?.getIdToken(),advisorEnabled:CONFIG.governorAdvisorUrl,
      legacyURL,exit:()=>location.assign(courseUrl)
    }, current?.state?.governorV3);
    if(!sameOwner()){v3Runtime.freeze();return;}
    document.body.classList.add('governor-v3-active');
    $('#app')?.remove();
    $('#platform-loading').hidden=true;
    $('#governor-v3').hidden=false;
    document.querySelector('.skip-link').href='#v3-heading';
    document.documentElement.dataset.appReady='true';
    loadEnd({success:true});diagnostics.record('module-ready',{success:true});
    window.dispatchEvent(new Event('governor:playable'));
  }catch(error){
    loadEnd({success:false,code:'load-failed'});
    diagnostics.error(error,{event:'module-error',operation:'load'});
    block(tr('Не удалось открыть сохранённую попытку. Обновите страницу или вернитесь в раздел 7.','Could not open the saved attempt. Reload or return to section 7.','无法打开已保存的尝试。请重新加载页面或返回第7节。'));
  }
}

async function loadApplication(loadEnd){
  try{
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=resourceURL('./src/app.js',import.meta.url).href;script.onload=resolve;script.onerror=reject;document.body.append(script);});
  }catch(error){loadEnd({success:false,code:'load-failed'});diagnostics.error(error,{event:'module-error',operation:'load'});started=false;block(tr('Не удалось загрузить симулятор. Обновите страницу или вернитесь в раздел 7.','The simulator could not be loaded. Reload or return to section 7.'));}
}

function installUpdateAdapter(){
 updateAdapter?.destroy();
 updateAdapter=createUpdateAdapter({module:'governor',root:document.body,diagnostics,getIdentity:()=>({owner:currentOwner()}),
  isBusy:()=>!sameOwner()||submissionBusy||reflectionBusy||!!runtime?.updateBusy?.(),
  pause:async value=>{updatePaused=value;runtime.pauseForUpdate(value);if(value)await Promise.allSettled([...pendingCheckpoints]);},
  capture:()=>({schema:1,runtime:runtime.captureForUpdate(),view:captureUpdateView(document.body)}),
  checkpoint:async()=>{if(!sameOwner())throw Error('update/identity');const state=runtime.checkpointForUpdate();if(!state)return {durable:true,revision:0,checkpointRef:{kind:'start'}};if(!run)throw Error('update/missing-attempt');const saved=await checkpointCampaign(state);if(saved?.saveStatus?.durable!==true)throw Error('update/not-durable');return {durable:true,revision:saved.revision,checkpointRef:{attemptId:run.submissionId,revision:saved.revision}};},
  restore:async({state,checkpointRef},{signal}={})=>{if(state.schema!==1||checkpointRef.attemptId&&checkpointRef.attemptId!==run?.submissionId)return {status:'blocked',code:'incompatible'};if(!runtime.restoreForUpdate(state.runtime))return {status:'partial',code:'incompatible'};await restoreUpdateView(document.body,state.view,{signal});return {status:'restored',code:'ok'};}
 });
 if(!updateCoordinator)updateCoordinator=bootstrapUpdateCoordinator({getAdapters:()=>updateAdapter?[updateAdapter]:[],backend,diagnostics,module:'governor',getOwner:currentOwner,getRoute:()=>context+location.hash});
 void updateCoordinator.restorePending();
}
$('#platform-back').href=courseUrl;
$('#platform-loading-back').href=courseUrl;
$('#platform-report').addEventListener('click',()=>{if(runtime?.state())submissionDialog();else message(tr('Сначала начните или продолжите кампанию.','Start or resume a campaign first.'));});
$('#platform-submission-close').addEventListener('click',()=>$('#platform-submission').close());
$('#platform-readable').addEventListener('click',()=>{$('#platform-submission').close();G.ReleaseUI.openReport();});
$('#platform-submit').addEventListener('click',submit);
const reflectionSaveButton=document.createElement('button');reflectionSaveButton.type='button';reflectionSaveButton.className='secondary-button';reflectionSaveButton.id='platform-reflection-save';reflectionSaveButton.hidden=true;reflectionSaveButton.addEventListener('click',saveReflection);$('#platform-submit').before(reflectionSaveButton);
$('#platform-reflection').addEventListener('input',()=>{if(!run||!sameOwner()||backend.isAdmin())return;run.reflection=$('#platform-reflection').value.slice(0,6000);reflectionFailure='';try{persistRun();}catch{reflectionFailure=tr('Не удалось сохранить текст. Скопируйте его перед закрытием страницы.','Text could not be saved. Copy it before closing this page.');message(reflectionFailure);}renderReflectionStatus();});
$('#platform-back').addEventListener('click',async event=>{event.preventDefault();if(isPractice){location.assign(replayURL(false,location.href));return;}await flushCampaign();location.href=courseUrl;});
window.addEventListener('pagehide',()=>{if(!updatePaused&&runtime?.state())checkpointCampaign(runtime.state());});
window.addEventListener('rudn:identitychange',identityChanged);
window.addEventListener('rudn:accesschange',identityChanged);
window.addEventListener('visibilitychange',()=>{if(!document.hidden)identityChanged();});
window.addEventListener('online',()=>{if(sameOwner()&&terminal(runtime?.state())){void submit();if(run?.pendingReflection)void saveReflection();}});
backend.onStatus(()=>{if(started)identityChanged();});
refresh();
backend.init().then(tryStart).catch(()=>block(tr('Не удалось восстановить профиль. Вернитесь на платформу.','Your profile could not be restored. Return to the platform.')));

// The platform owns caching; never install a competing nested service worker.
if('serviceWorker'in navigator){
  let preparing=false,moduleReady=false,canPrepare=false;
  const updateOfflineStatus=()=>{
    const element=$('#offline-status');if(!element)return;
    const desired=moduleReady?'ready':'pending';if(element.dataset.platformOffline===desired)return;
    element.dataset.platformOffline=desired;
    element.textContent=moduleReady
      ?tr('Готово к работе без сети','Ready for offline use')
      :tr('Автономное приложение · ресурсы загружаются','Standalone app · resources loading');
  };
  // Cached resources may be acknowledged before Auth has mounted the game UI.
  const statusMount=new MutationObserver(()=>{if($('#offline-status'))updateOfflineStatus();});
  statusMount.observe(document.body,{childList:true,subtree:true});
  const prepare=()=>{
    if(!canPrepare||preparing||moduleReady||!navigator.serviceWorker.controller)return;
    preparing=true;updateOfflineStatus();
    navigator.serviceWorker.controller.postMessage({type:'PREPARE_MODULE',module:'governor',urls:[location.href,resourceURL('../../assets/course/previews/seminar_07_simulator.jpg',import.meta.url).href]});
  };
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.source!==navigator.serviceWorker.controller||event.data?.type!=='MODULE_CACHE_STATUS'||event.data.module!=='governor')return;
    preparing=false;moduleReady=event.data.ready===true;updateOfflineStatus();
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{preparing=false;moduleReady=false;prepare();});
  window.addEventListener('online',prepare);
  window.addEventListener('rudn:locale',updateOfflineStatus);
  window.addEventListener('governor:playable',()=>{
    const register=()=>{
      canPrepare=true;
      navigator.serviceWorker.register(new URL('service-worker.js',getReleaseContext()?.siteRoot||new URL('../../',import.meta.url)),{updateViaCache:'none'})
        .then(()=>navigator.serviceWorker.ready).then(prepare).catch(()=>{});
    };
    // Give the first tap a quiet interval. A visitor who stays on the landing
    // still gets the complete verified pack without having to opt in.
    setTimeout(()=>{
      if('requestIdleCallback' in window)window.requestIdleCallback(register,{timeout:1500});
      else register();
    },1200);
  },{once:true});
}
