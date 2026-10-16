import {escapeHTML as e,scanQuestionsFor,SCAN_METADATA_MODE,gradeTask,expandIds,selectionLimit} from './core.mjs';
import {documentDisplay,displayLabel} from './translation-ui.mjs';

export const fiveEvidenceSet=task=>(task.answerSets||[]).reduce((full,set)=>set.length>full.length?set:full,[]);
export const isFiveWork=a=>a?.answer?.assessmentMode==='five-task-v1';
export function fiveVariant(app){return app.fiveVariants.find(v=>v.id===app.state.assessment?.caseId);}
export function fiveTask(app){return fiveVariant(app)?.tasks[Math.max(0,Math.min(4,app.state.assessment?.stage||0))];}
export function fiveAnswer(app,t=fiveTask(app)){
  const saved=app.state.assessment?.answer.tasks?.[t?.id]||{};
  return t?.kind==='scan'?{metadataMode:SCAN_METADATA_MODE,metadata:{},...saved}:t?.kind==='text'?{docId:t.docId,selections:[],...saved}:saved;
}
const taskName=(t,i)=>t.kind==='scan'?'Реквизиты':t.kind==='type'?'Вид документа':'Поиск нормы '+(i-1);
export function fiveIntro(app){
  return `<section class="ll-assessment-intro"><h1>На оценку</h1><p>Пять заданий, по одному баллу за каждое: реквизиты документа, вид другого документа и три вопроса по тексту закона.</p><button class="ll-primary" data-action="start-assessment" ${app.isLocked()?'disabled':''}>Начать →</button></section>`;
}
export async function fiveAssessment(app){
  const a=app.state.assessment,item=fiveVariant(app);if(!item)throw Error('Assessment variant unavailable');
  if(a.result){await Promise.all([...new Set(item.tasks.filter(t=>t.kind==='text').map(t=>t.docId))].map(id=>app.loadDocument(id)));return fiveReport(app,item,a);}
  const stage=Math.max(0,Math.min(4,a.stage||0)),t=item.tasks[stage],answer=fiveAnswer(app,t);
  let body='';
  if(t.kind==='scan')body=app.scanAssignment(app.scans.find(s=>s.id===t.scanId),answer.metadata,{questions:scanQuestionsFor(app.scans.find(s=>s.id===t.scanId)),index:a.scanFieldIndex||0,context:'assessment'});
  else if(t.kind==='type')body=app.typeView(t,answer.type,{action:'assessment-type'});
  else {const d=await app.loadDocument(t.docId);app.assessmentDoc=d.id;body=app.reader(d,answer.selections,{context:'assessment-five',limit:selectionLimit(t,[d])});}
  const all=item.tasks.every(t=>a.answer.tasks?.[t.id]?.submitted),teacher=app.teacherAccess()?await app.teacherAnswer(t):'';
  return `<section class="ll-five-work" data-five-variant="${e(item.id)}"><header class="ll-assessment-heading"><div class="ll-eyebrow"><span>На оценку</span> · ${stage+1} / 5</div>${t.kind==='text'?'':`<h1>${e(t.prompt)}</h1>`}</header><nav class="ll-five-nav" aria-label="Задания работы">${item.tasks.map((q,i)=>`<button class="${i===stage?'active':''}" data-action="five-task" data-index="${i}" aria-pressed="${i===stage}" aria-label="${e(taskName(q,i))}">${i+1}${a.answer.tasks?.[q.id]?.submitted?' ✔':''}</button>`).join('')}</nav>${teacher}${body}${t.kind==='text'?'':`<div class="ll-actions ll-five-actions"><button class="ll-primary" data-action="five-submit">✔ <span>Сохранить ответ</span></button>${answer.submitted&&stage<4?'<button class="ll-primary" data-action="five-next">Далее →</button>':''}${answer.submitted?'<span role="status">Ответ сохранён</span>':''}</div>`}${all?`<div class="ll-five-finish">${app.confirming?'<p>Отправить все пять ответов на оценку?</p><div class="ll-actions"><button class="ll-primary" data-action="finish-assessment">Отправить</button><button class="ll-secondary" data-action="cancel-finish">Вернуться</button></div>':'<button class="ll-primary" data-action="confirm-finish">Завершить и проверить</button>'}</div>`:''}</section>`;
}
export function fiveReport(app,item,a){
  const docs=[...app.corpus.cache.values()];
  const passages=(task,ids)=>ids.length?ids.map(id=>{const d=docs.find(d=>d.units.some(u=>u.id===id));if(!d)return '';const info=documentDisplay(app,d),u=info.units.get(id);return `<blockquote data-document-text lang="${info.locale}"><strong>${e(displayLabel(app,d,id))}</strong><p>${e(u.text)}</p></blockquote>`;}).join(''):'<p>Не выбрано</p>';
  const details=item.tasks.map((t,i)=>{
    const answer=a.answer.tasks?.[t.id]||{},criterion=a.result.criteria.find(c=>c.id===t.id),grade=gradeTask(t,answer,docs,app.scans);let review='';
    if(t.kind==='scan'){const scan=app.scans.find(s=>s.id===t.scanId);review=app.scanReview(scan,answer.metadata||{},scanQuestionsFor(scan));}
    else if(t.kind==='type')review=`<dl class="ll-review-facts"><div><dt>Ваш ответ</dt><dd>${e(answer.type||'Не выбрано')}</dd></div><div><dt>Правильный вид</dt><dd>${e(t.answer)}</dd></div></dl>`;
    else review=`<h3>Ваш ответ</h3>${passages(t,answer.selections||[])}<h3>Правильное основание</h3>${passages(t,expandIds(fiveEvidenceSet(t),docs))}`;
    let reason=grade.exact?'Все позиции совпадают. Баллы начислены полностью.':'';
    if(!grade.exact&&t.kind==='scan'){const fields=scanQuestionsFor(app.scans.find(s=>s.id===t.scanId)),matched=fields.filter(q=>answer.metadata?.[q.field]===q.field).length;reason=`Правильных позиций: ${matched} из ${fields.length}. Каждая позиция даёт одинаковую долю балла.`;}
    else if(!grade.exact&&t.kind==='type')reason=answer.type?'Выбран другой вид документа.':'Вид документа не выбран.';
    else if(!grade.exact&&t.kind==='text')reason=`Совпало: ${grade.matched||0}; пропущено: ${grade.missing||0}; лишних: ${grade.extra||0}. Балл учитывает полноту и точность выделения.`;
    const loss=Math.round((1-(criterion?.points||0))*100)/100;
    return `<details class="ll-criterion-review" data-five-criterion="${e(t.id)}"><summary>${i+1}. <span>${e(taskName(t,i))}</span><strong>${criterion?.points||0} / 1</strong></summary><h3>${e(t.prompt)}</h3><p>${grade.exact?'Ответ верный.':grade.fraction>0?'Ответ частично верный.':'Ответ не совпал с основанием.'}</p><p class="ll-score-reason">${e(reason)}</p>${loss?`<p>Потеря за задание: ${loss} балла.</p>`:''}${review}${t.explanation?`<p>${e(t.explanation)}</p>`:''}</details>`;
  }).join('');
  return `<section class="ll-result ll-five-result"><div class="ll-eyebrow">На оценку</div><h1>Работа завершена</h1><div class="ll-result-score">${a.result.points} <small>/ 5</small></div><p>${a.preview?'Тренировка':a.delivery==='host-accepted'?'Результат отправлен в журнал':'Результат сохранён на устройстве'}</p>${details}<div class="ll-actions">${a.delivery==='pending'?'<button class="ll-primary" data-action="retry-delivery">Повторить отправку</button>':''}${!app.reportOnly?`<button class="ll-primary" data-action="restart-assessment" ${!a.preview&&a.delivery!=='host-accepted'?'disabled':''}>Начать заново</button><button class="ll-secondary" data-action="home">Главная</button>`:''}</div></section>`;
}
