import {bankVacancySnapshot, createVacancyDetailsStore} from './career-vacancy-details.mjs';
import {buildVacancyRequirements, summarizeVacancyAssessment} from './career-journey-model.mjs';
import {createEmployerVacancyBank, platformEmployerId, vacancyBankStatus} from './employer-vacancies-bank.mjs';
import {date, E, groupLabel, icon, L, safeURL} from './journey-visuals.mjs';
import {readLocal, storageKey, writeLocal} from './storage.mjs';
import {seminar5ReviewTarget,VACANCY_REVIEW_KEY} from './seminar-progress.mjs';
import {vacancySalaryText,vacancyStatusText} from './adaptive-vacancy-pay.mjs';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const BASE_PAGE = /^pages\/[a-f0-9]{2}\/[a-f0-9]{24}\/p\d{4}-[a-f0-9]{16}\.json\.gz$/;
const DETAIL_PAGE = /^career-vacancy-details\/(pages\/[a-f0-9]{2}\/[a-f0-9]{24}\/p(\d{4})-[a-f0-9]{16})(?:\.part\d{4})?\.json\.gz$/;
const SHA = /^[a-f0-9]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function candidatePage(row) {
  if (row?.sourceType !== 'bank' || !UUID.test(row.id || '')) return null;
  const match = DETAIL_PAGE.exec(row.sourcePath || '');
  if (!match) return null;
  try {
    return {employerId:platformEmployerId(row.employerId), path:match[1] + '.json.gz', index:Number(match[2])};
  } catch {return null;}
}

function bindPage(row, descriptor, page, rows) {
  if (row?.scope !== 'individual-role' || !UUID.test(row.id || '') || !descriptor?.employerId ||
      !BASE_PAGE.test(page?.path || '') || !SHA.test(page?.sha256 || '') ||
      !descriptor.pages?.some(ref => ref.path === page.path && ref.sha256 === page.sha256) ||
      !Array.isArray(rows) || rows.length !== page.count || !rows.some(item => item.id === row.id)) {
    throw new Error('Unverified vacancy page');
  }
  return {basePage:page.path, basePageSHA256:page.sha256, employerId:descriptor.employerId, uuids:rows.map(item => item.id)};
}

function loadMarks(vacancy) {
  const key = storageKey(VACANCY_REVIEW_KEY + vacancy.sourceVacancyId);
  try {
    const raw = readLocal(key);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (saved?.schemaVersion !== 1 || saved.vacancyId !== vacancy.sourceVacancyId || !object(saved.marks)) throw new Error('Invalid saved review');
      return {key, marks:saved.marks, invalid:false};
    }
  } catch {return {key, marks:{}, invalid:true};}
  // The previous checklist used the same bank UUID and exact statement signatures.
  try {
    const old = JSON.parse(readLocal(storageKey('career-journey-v1')) || 'null');
    const marks = old?.assessments?.[vacancy.id];
    if (object(marks)) return {key, marks, invalid:false};
  } catch {/* Other saved work cannot prevent opening an independent checklist. */}
  return {key, marks:{}, invalid:false};
}

function choiceLabel(row, value) {
  if (row.assessmentKind === 'competency') {
    return value === 'met' ? L('Уже знаю или умею','I already know or can do this','我已掌握') : L('Предстоит освоить','Still to learn','还需学习');
  }
  return value === 'met' ? L('Уже соответствую','I already meet this','我已符合') : L('Пока не соответствую','I do not yet meet this','我尚未符合');
}

function contextLabel(row) {
  return row.requirementState === 'explicitly_not_required'
    ? L('Источник указывает, что это условие не требуется','The source states this condition is not required','原文注明无此要求')
    : L('Сведения из объявления','Information from the announcement','公告中的说明');
}

function requirementCard(row, disabled) {
  if (!row.assessable) return `<div class="journey-source-context"><span>${contextLabel(row)}</span>${row.text ? `<p lang="ru">${E(row.text)}</p>` : ''}</div>`;
  return `<fieldset class="journey-requirement" data-requirement-row="${E(row.key)}" data-review-kind="${E(row.assessmentKind)}" data-status="${E(row.status)}">
    <legend lang="ru">${E(row.text)}</legend>
    <div class="journey-assessment-options">${['met','gap'].map(value => `<label class="journey-answer ${value}">
      <input type="radio" name="review-${E(row.key)}" data-review-answer="${E(row.key)}" value="${value}" ${row.status === value ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <strong>${choiceLabel(row,value)}</strong></label>`).join('')}</div></fieldset>`;
}

function progressText(summary) {
  return L(`Отмечено ${summary.assessed} из ${summary.total}`,`Assessed ${summary.assessed} of ${summary.total}`,`已自评 ${summary.assessed}／${summary.total} 项`);
}

function checklist(vacancy, summary, storageInvalid) {
  return `<p>${L('Отметьте, что Вы уже знаете или умеете и какие условия выполняете. План разделит знания и умения, формальные условия и другие требования.','Mark what you already know or can do and which conditions you meet. The plan groups knowledge and skills, formal conditions and other requirements.','请标记已掌握的知识和技能以及已符合的条件。计划会分别列出知识技能、正式条件和其他要求。')}</p>
    ${vacancy.duties.some(item => item.text.trim()) ? `<details class="adaptive-review-duties"><summary>${L('Обязанности по объявлению','Duties from the announcement','公告所列职责')}</summary>${vacancy.duties.filter(item => item.text.trim()).map(item => `<p lang="ru">${E(item.text)}</p>`).join('')}</details>` : ''}
    ${summary.missingCategories.length ? `<p class="adaptive-review-note">${L('В сохранённом источнике отсутствуют сведения по разделам','The saved source has no information for these sections','已保存的原文缺少以下信息')} · ${summary.missingCategories.map(groupLabel).join(', ')}</p>` : ''}
    ${summary.total ? `<p data-review-progress role="status">${E(progressText(summary))}</p><progress data-review-progress-bar value="${summary.assessed}" max="${summary.total}" aria-label="${E(L('Отмеченные требования','Requirements assessed','已自评的要求'))}"></progress>` : `<p class="adaptive-review-note">${L('В сохранённом объявлении нет пунктов для самооценки. Откройте источник, чтобы проверить требования.','The saved announcement contains no self-assessment items. Open the source to check the requirements.','已保存的公告没有可供自评的条目。请打开原文核对要求。')}</p>`}
    <p class="adaptive-review-error" data-review-save-error role="alert" ${storageInvalid ? '' : 'hidden'}>${L('Не удалось сохранить или прочитать отметки. Откройте вакансию снова, чтобы повторить попытку.','Assessment marks could not be saved or read. Reopen the vacancy to try again.','无法保存或读取自评标记。请重新打开该职位后再试。')}</p>
    ${summary.groups.filter(group => group.rows.length).map(group => `<section class="adaptive-review-section"><h2>${groupLabel(group.id)}</h2>${group.rows.map(row => requirementCard(row,storageInvalid)).join('')}</section>`).join('')}
    ${summary.total ? `<button type="button" class="button button-primary" data-review-plan>${L('Посмотреть план развития','View development plan','查看发展计划')}</button>` : ''}`;
}

function planGroup(rows, heading, guidance) {
  if (!rows.length) return '';
  return `<section class="adaptive-review-section"><h2>${heading}</h2><p>${guidance}</p><ul class="adaptive-review-plan-list">${rows.map(row => `<li lang="ru">${E(row.text)}</li>`).join('')}</ul></section>`;
}

function developmentPlan(summary) {
  return `<p>${E(progressText(summary))}</p>
    ${planGroup(summary.developmentItems,L('Знания и умения для развития','Knowledge and skills to develop','需要提升的知识与技能'),L('Изучите названные материалы и потренируйтесь применять их в рабочей задаче.','Study the named material and practise applying it to a work task.','学习所列材料，并练习在工作任务中应用。'))}
    ${planGroup(summary.formalGaps,L('Образование, опыт и условия допуска','Education, experience and eligibility','学历、经历与资格条件'),L('Сверьте эти условия с источником и уточните у работодателя, какие документы или опыт нужны.','Check these conditions in the source and ask the employer which documents or experience are required.','请在原文中核对这些条件，并向雇主确认所需文件或经历。'))}
    ${planGroup(summary.otherGaps,L('Другие требования','Other requirements','其他要求'),L('Уточните эти условия по оригиналу объявления.','Review these conditions in the original announcement.','请在原始公告中核对这些条件。'))}
    ${summary.gap ? '' : `<p class="adaptive-review-note">${L('В плане пока нет отмеченных пробелов. Отметки можно изменить в требованиях.','No gaps have been marked in the plan. You can revise your assessment in the requirements.','计划中暂时没有标记的差距。可返回要求页面修改自评。')}</p>`}
    ${summary.unassessed ? `<p class="adaptive-review-note">${L(`Без отметки осталось ${summary.unassessed} пунктов.`,`Unassessed items remaining: ${summary.unassessed}.`,`尚有 ${summary.unassessed} 项未自评。`)}</p>` : ''}
    <button type="button" class="button button-secondary" data-review-edit>${L('Изменить отметки','Edit my assessment','修改自评')}</button>`;
}

/** An independent checklist for one source-verified announcement. */
export function createAdaptiveVacancyReview({onClose = () => {}, onSelect = () => {}, onComplete = () => false,
  isCompleted = () => false, onOpenKnowledge = () => Promise.resolve()} = {}) {
  const bank = createEmployerVacancyBank({maxEmployers:3,maxPages:4});
  const details = createVacancyDetailsStore({getMetadata:() => __careerHost.vacancyDetailsMetadata?.()});
  let container = null;
  let active = null;
  let disposed = false;

  const completionChoice = summary => summary?.rows.find(row=>row.assessable &&
    (!summary.competencySummary.total || row.assessmentKind === 'competency') && ['met','gap'].includes(row.status));
  const persistMarks = (state,marks) => writeLocal(state.storageKey,JSON.stringify({
    schemaVersion:1,vacancyId:state.row.id,marks,updatedAt:new Date().toISOString()}));

  function completionControls(state,summary) {
    if(!summary)return '';
    if(isCompleted(state.reference))return `<footer class="adaptive-review-completion">
      <p role="status">${L('Разбор завершён. Тест знаний открыт.','Vacancy review completed. The knowledge test is available.','职位要求自评已完成，知识测试已开放。')}</p>
      <button type="button" class="button button-primary" data-review-knowledge>${L('К тесту знаний','Continue to the knowledge test','进入知识测试')}</button>
      <p class="adaptive-review-error" data-review-complete-error role="alert" hidden>${L('Не удалось открыть тест. Повторите попытку.','The knowledge test could not be opened. Try again.','无法打开知识测试，请重试。')}</p></footer>`;
    const help = !summary.total
      ? L('Выберите другую вакансию, где в источнике указаны требования.','Choose another vacancy with published requirements.','请选择另一条列有要求的招聘公告。')
      : summary.competencySummary.total
        ? L('Чтобы завершить разбор, отметьте хотя бы одно знание или умение.','Assess at least one knowledge or skill item to finish the review.','至少自评一项知识或技能后，即可完成。')
        : L('Знания и умения в объявлении не выделены. Отметьте хотя бы одно опубликованное требование.','The announcement does not list knowledge or skills separately. Assess at least one published requirement.','公告未单列知识或技能，请至少自评一项已公布的要求。');
    return `<footer class="adaptive-review-completion"><p id="adaptive-review-completion-help">${help}</p>
      ${summary.total?`<button type="button" class="button button-primary" data-review-complete aria-describedby="adaptive-review-completion-help" ${state.storageInvalid||!completionChoice(summary)?'disabled':''}>${L('Завершить разбор','Finish vacancy review','完成职位要求自评')}</button>`:''}
      <p class="adaptive-review-error" data-review-complete-error role="alert" hidden>${L('Не удалось сохранить разбор. Повторите попытку.','The review could not be saved. Try again.','无法保存自评，请重试。')}</p></footer>`;
  }

  function render(focus = false) {
    if (!container) return;
    container.hidden = !active;
    if (!active) {container.replaceChildren();return;}
    const state = active;
    const source = safeURL(state.row.sourceURL);
    const heading = state.plan ? L('Ваш план развития','Your development plan','你的发展计划') : L('Требования вакансии','Vacancy requirements','职位要求');
    const summary = state.requirements && summarizeVacancyAssessment(state.requirements,state.marks);
    const published = date(state.row.announcedAt), deadline = date(state.row.expiresAt);
    const status=state.vacancy?vacancyBankStatus(state.row):null;
    container.innerHTML = `<section class="adaptive-review" aria-labelledby="adaptive-review-title">
      <button type="button" class="adaptive-back" data-review-close>${icon('arrow-left')}${L('К списку вакансий','Back to vacancies','返回职位列表')}</button>
      <header class="adaptive-review-heading"><h1 id="adaptive-review-title" tabindex="-1">${heading}</h1>
        <h2 lang="ru">${E(state.row.title)}</h2><p lang="ru">${E(state.employerName)}</p>
        ${state.vacancy?.department ? `<p lang="ru">${E(state.vacancy.department)}</p>` : ''}
        ${status ? `<p data-review-vacancy-status="${status}">${vacancyStatusText(status)}${published ? ' · ' + L('Опубликовано','Published','发布于') + ' ' + E(published) : ''}${deadline ? ' · ' + L('Приём до','Apply by','截止于') + ' ' + E(deadline) : ''}</p>` : ''}
        ${status==='source-active'?`<p data-review-salary><strong>${L('Зарплата','Salary','薪资')}:</strong> ${E(vacancySalaryText(state.row))}</p>`:''}
        ${source ? `<a class="adaptive-source" href="${source}" target="_blank" rel="noopener noreferrer">${L('Исходное объявление','Original announcement','原始公告')}${icon('external')}</a>` : ''}
      </header>
      ${state.loading ? `<p role="status">${L('Загружаем требования из источника…','Loading source requirements…','正在加载原始要求……')}</p>` : state.error ? `<p class="adaptive-review-error" role="alert">${L('Не удалось загрузить требования этой вакансии.','The requirements for this vacancy could not be loaded.','无法加载此职位的要求。')}</p><button type="button" class="button button-secondary" data-review-retry>${L('Повторить','Retry','重试')}</button>` : state.plan ? developmentPlan(summary) : checklist(state.vacancy,summary,state.storageInvalid)}
      ${!state.loading&&!state.error ? completionControls(state,summary) : ''}
    </section>`;
    container.querySelector('[data-review-close]').onclick = () => close();
    container.querySelector('[data-review-retry]')?.addEventListener('click',() => void load(state.request));
    container.querySelector('[data-review-plan]')?.addEventListener('click',() => {state.plan = true;render(true);});
    container.querySelector('[data-review-edit]')?.addEventListener('click',() => {state.plan = false;render(true);});
    container.querySelector('[data-review-complete]')?.addEventListener('click',() => {
      if(active!==state||state.storageInvalid||!state.reference)return;
      const choice=completionChoice(summarizeVacancyAssessment(state.requirements,state.marks));
      if(!choice)return;
      try {
        persistMarks(state,state.marks);
        if(!onComplete({target:state.reference,markKey:choice.key,signature:choice.signature,status:choice.status}))throw new Error('Review not saved');
        state.plan=true;render(true);
      } catch {container.querySelector('[data-review-complete-error]').hidden=false;}
    });
    container.querySelector('[data-review-knowledge]')?.addEventListener('click',async event => {
      const button=event.currentTarget;button.disabled=true;
      try {await onOpenKnowledge();}
      catch {if(button.isConnected)container.querySelector('[data-review-complete-error]').hidden=false;}
      finally {if(button.isConnected)button.disabled=false;}
    });
    container.querySelectorAll('[data-review-answer]').forEach(input => input.addEventListener('change',() => saveAnswer(state,input)));
    if (focus || state.focusPending) {
      state.focusPending = false;
      container.querySelector('#adaptive-review-title').focus();
    }
  }

  function saveAnswer(state,input) {
    if (active !== state || state.storageInvalid) return;
    const row = state.requirements.rows.find(item => item.key === input.dataset.reviewAnswer);
    if (!row?.assessable || !['met','gap'].includes(input.value)) return;
    const card = input.closest('[data-requirement-row]');
    const next = {...state.marks, [row.key]:{status:input.value,signature:row.signature}};
    const error = container.querySelector('[data-review-save-error]');
    try {
      persistMarks(state,next);
      state.marks = next;
      const summary = summarizeVacancyAssessment(state.requirements,next);
      card.dataset.status = input.value;
      container.querySelector('[data-review-progress]').textContent = progressText(summary);
      container.querySelector('[data-review-progress-bar]').value = summary.assessed;
      const finish=container.querySelector('[data-review-complete]');if(finish)finish.disabled=!completionChoice(summary);
      error.hidden = true;
    } catch {
      card.querySelectorAll('input').forEach(option => {option.checked = option.value === card.dataset.status;});
      error.hidden = false;
    }
  }

  async function load(request) {
    if (disposed) return false;
    active?.cancel?.();
    const state = {request,row:request.row,employerName:request.employerName,loading:true,focusPending:true,cancel:request.cancel};
    active = state;
    render();
    try {
      const source = await request.resolve();
      if (active !== state || disposed) return false;
      const {row,descriptor,page,rows} = source;
      const binding = bindPage(row,descriptor,page,rows);
      const reference=seminar5ReviewTarget({vacancyId:row.id,authorityId:descriptor.authorityId,pagePath:page.path,pageSHA256:page.sha256,sourceURL:row.sourceURL});
      if(!reference)throw new Error('Invalid vacancy review reference');
      state.cancel = () => details.cancel(binding,row.id);
      const loaded = await details.load(binding,row.id);
      if (active !== state || disposed) return false;
      if (loaded?.status !== 'ready') throw new Error('Source requirements unavailable');
      const vacancy = bankVacancySnapshot(row,loaded.record,{institutionId:descriptor.authorityId,employerId:descriptor.employerId,employerName:descriptor.name,provenance:loaded.provenance});
      const requirements = buildVacancyRequirements(vacancy);
      const saved = loadMarks(vacancy);
      const restored = summarizeVacancyAssessment(requirements,saved.marks);
      state.row = row;
      state.employerName = descriptor.name;
      state.vacancy = vacancy;
      state.requirements = requirements;
      state.storageKey = saved.key;
      state.storageInvalid = saved.invalid;
      state.marks = Object.fromEntries(restored.rows.filter(item => ['met','gap'].includes(item.status)).map(item => [item.key,{status:item.status,signature:item.signature}]));
      state.reference=reference;
      onSelect(reference);
      return true;
    } catch {
      if (active === state) state.error = true;
      return false;
    } finally {
      if (active === state) {state.loading = false;state.cancel = null;render(true);}
    }
  }

  function close({notify = true} = {}) {
    const previous = active;
    active = null;
    previous?.cancel?.();
    render();
    if (notify && previous) onClose(previous.row.id);
  }

  return {
    mount(target) {container = target;render();},
    isOpen:() => Boolean(active),
    canOpenCandidate:row => Boolean(candidatePage(row)),
    open(row,descriptor,page,rows) {
      if (row?.scope !== 'individual-role' || !UUID.test(row.id || '')) return Promise.resolve(false);
      return load({row,employerName:descriptor?.name,resolve:() => ({row,descriptor,page,rows})});
    },
    openCandidate(candidate) {
      const location = candidatePage(candidate);
      if (!location) return Promise.resolve(false);
      return load({row:candidate,employerName:candidate.employerName,cancel:() => bank.cancel(location.employerId),resolve:async () => {
        // The bank packer numbers pages from zero in descriptor order. A single
        // load therefore obtains the employer head and the targeted base page.
        const view = await bank.loadPage(location.employerId,location.index);
        const descriptor = view?.descriptor;
        const page = descriptor?.pages[location.index];
        const row = view?.rows.find(item => item.id === candidate.id);
        if (view?.status !== 'ready' || view.pageIndex !== location.index || descriptor?.employerId !== candidate.employerId ||
            page?.path !== location.path || !row || row.sourceURL !== candidate.sourceURL) throw new Error('Vacancy source differs from index');
        return {row,descriptor,page,rows:view.rows};
      }});
    },
    openReference(value) {
      const reference=seminar5ReviewTarget(value);
      if(!reference)return Promise.resolve(false);
      const index=Number(/\/p(\d{4})-/.exec(reference.pagePath)[1]);
      return load({row:{id:reference.vacancyId,sourceURL:reference.sourceURL},cancel:() => bank.cancel(reference.authorityId),resolve:async () => {
        const view=await bank.loadPage(reference.authorityId,index),descriptor=view?.descriptor,page=descriptor?.pages[index];
        const row=view?.rows.find(item=>item.id===reference.vacancyId);
        if(view?.status!=='ready'||view.pageIndex!==index||page?.path!==reference.pagePath||page.sha256!==reference.pageSHA256||
          row?.sourceURL!==reference.sourceURL)throw new Error('Saved vacancy source differs');
        return {row,descriptor,page,rows:view.rows};
      }});
    },
    close,
    dispose() {disposed = true;close({notify:false});bank.dispose();details.dispose();container = null;}
  };
}
