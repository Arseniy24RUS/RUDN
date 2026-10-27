import {backend} from './backend.js?v=1.3.10';
import {attemptOwner} from './attempt-session.js?v=1.3.10';
import {durableStore} from './durable-store.js';
import {resourceURL} from './release-resources.js';
import {finishAttempt,getAttemptQuestions,validateBank,canonicalJSONString} from './civil-service-model.mjs';
import {mountCivilServiceTest} from './civil-service-test.mjs';

const MODE='civil-service-knowledge-v1';
const contextCopy={
  ru:{guest:'Гостевой режим: результат сохраняется на устройстве без оценки в журнале. Для учебной оценки войдите в свой профиль перед началом.',teacher:'Предпросмотр преподавателя: попытки не изменяют журнал.',student:'Оценка рассчитывается автоматически: 5 × число верных ответов / 40, с округлением до двух знаков. В журнале сохраняется лучший результат.'},
  en:{guest:'Guest mode: the result stays on this device without a course grade. Sign in to your profile before starting an assessed attempt.',teacher:'Teacher preview: attempts do not change the gradebook.',student:'Automatic score: 5 × correct answers / 40, rounded to two decimal places. The gradebook retains your best score.'},
  zh:{guest:'访客模式：结果保存在本设备，不计入课程成绩。开始计分测试前，请先登录个人资料。',teacher:'教师预览：测试不会更改成绩册。',student:'自动评分：5 × 答对题数 ÷ 40，四舍五入保留两位小数。成绩册保留最高分。'}
};
const lang=value=>String(value).startsWith('zh')?'zh':String(value).startsWith('en')?'en':'ru';
const storageError=()=>Object.assign(new Error('Local checkpoint was not durable.'),{code:'storage/local-save-failed'});
const conflictError=()=>Object.assign(new Error('A different completed paper has been retained.'),{code:'storage/conflict'});
const assessmentFingerprint=attempt=>{if(!attempt)return null;const {currentIndex,submittedAt,...assessment}=attempt;return canonicalJSONString(assessment);};

/** Course adapter. The user explicitly authorized automatic 0–5 points in the
 * existing platform gradebook. Local immutable completion precedes its queue.
 */
export async function mountCivilServiceCourse(container,{owner=attemptOwner(),activitySlug,locale='ru',signal,diagnostics,bank:providedBank}={}){
  if(!activitySlug||!(container instanceof HTMLElement))throw new TypeError('Course host and activity required.');
  const durableOwner=owner==='guest'?'guest:civil-service':owner;
  const student=owner.startsWith('student:')&&!backend.isAdmin(),teacher=owner.startsWith('teacher:');
  const scope={owner:durableOwner,activitySlug,mode:MODE};
  let disposed=false,language=lang(locale),handle=null;
  const latestRevision=new Map(),controller=new AbortController();
  const checkOwner=()=>{if(attemptOwner()!==owner)throw Object.assign(new Error('Profile changed.'),{code:'auth/profile-changed'});};
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  const bankTask=providedBank?Promise.resolve(providedBank):fetch(resourceURL('../../data/civil-service/mintrud-v4-reviewed.json',import.meta.url),{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('Civil-service bank could not be loaded.');return response.json();});
  const [loadedBank,restored]=await Promise.all([bankTask,backend.loadDraft(scope)]);
  const bank=structuredClone(loadedBank);
  for(const question of bank.questions||[]){if(question.media?.src)question.media.src=resourceURL(question.media.src,new URL('../../',import.meta.url)).href;}
  validateBank(bank);checkOwner();
  if(controller.signal.aborted)throw new DOMException('Civil-service mount aborted.','AbortError');
  if(restored)latestRevision.set(restored.attemptId,restored.revision);
  const restoredAttempt=restored?.state?.civilServiceAttempt;
  const historicalBank=restored?.state?.civilServiceBank;
  const bankFor=attempt=>attempt.contentVersion===bank.contentVersion?bank:historicalBank;
  const initialAttempt=restoredAttempt?{...restoredAttempt,...(restored.state.resultAttempt?{submittedAt:Date.parse(restored.state.resultAttempt.createdAt)}:{})}:null;
  container.replaceChildren();
  const note=document.createElement('p');note.className='civil-service-context-note';
  const surface=document.createElement('div');container.append(note,surface);
  const renderNote=()=>{note.textContent=contextCopy[language][student?'student':teacher?'teacher':'guest'];};renderNote();
  const paperBank=attempt=>{const source=bankFor(attempt);return {schemaVersion:1,contentVersion:source.contentVersion,source:source.source,sections:source.sections,reviewedAt:source.reviewedAt,questions:structuredClone(getAttemptQuestions(source,attempt))};};
  const verifySave=record=>{if(record?.saveStatus?.durable!==true)throw storageError();latestRevision.set(record.attemptId,record.revision);return record;};
  const checkpoint=async attempt=>{
    checkOwner();
    const saved=await backend.checkpoint({...scope,attemptId:attempt.id,baseRevision:latestRevision.get(attempt.id)||0,contentVersion:attempt.contentVersion,state:{civilServiceAttempt:attempt,civilServiceBank:paperBank(attempt)}},{queue:student});
    return verifySave(saved);
  };
  handle=await mountCivilServiceTest(surface,{bank,historicalBank,locale:language,initialAttempt,
    onCheckpoint:checkpoint,
    onComplete:async({attempt})=>{
      checkOwner();
      const final=finishAttempt(bankFor(attempt),attempt);delete final.submittedAt;
      const result=final.result;
      const record={id:final.id,...(student?{studentKey:owner.slice(8)}:{}),activitySlug,draftMode:MODE,type:'civil-service-knowledge',recordGrade:student,title:'Public-service knowledge · Ministry of Labour v4',createdAt:new Date(final.finishedAt).toISOString(),startedAt:final.startedAt,finishedAt:final.finishedAt,points:result.points,maxPoints:5,
        civilService:{schemaVersion:1,contentVersion:final.contentVersion,source:bankFor(final).source,attempt:final,bank:paperBank(final)}};
      const saved=verifySave(await durableStore.complete({...scope,attemptId:final.id,baseRevision:latestRevision.get(final.id)||0,contentVersion:final.contentVersion,state:{civilServiceAttempt:final,civilServiceBank:paperBank(final),resultAttempt:record},attempt:record},{queue:student}));
      const retained=saved.state?.resultAttempt;
      if(!retained||assessmentFingerprint(retained.civilService?.attempt)!==assessmentFingerprint(final))throw conflictError();
      checkOwner();
      if(student){const receipt=await backend.saveAttempt(retained);if(receipt?.saveStatus?.durable===false)throw storageError();}
      diagnostics?.record?.('result-save',{operation:'civil-service-submit',success:true});
      return {saved:true,recordGrade:student};
    }
  });
  return {
    async setLocale(value){language=lang(value);renderNote();await handle?.setLocale(language);},
    async flush(){await handle?.flush();await durableStore.flush();},
    async destroy(){if(disposed)return;disposed=true;controller.abort();signal?.removeEventListener('abort',abort);try{await handle?.flush();}finally{await handle?.destroy();}}
  };
}
