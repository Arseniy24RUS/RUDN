import {resourceURL} from '../../../assets/js/release-resources.js';

const phrases = {
  ru: {
    toggle:'Пошаговая подсказка', show:'Показать пошаговую подсказку', hide:'Скрыть пошаговую подсказку',
    progress:(index,total)=>`Шаг ${index} из ${total}`,
    nav:['Откройте нужную вкладку','Нажмите на выделенную кнопку. Там находится инструмент для текущего шага.'],
    reception:['Прочитайте обращение','Уточните, о чём просит посетитель. Затем откройте первый шаг разбора.'],
    conversation:['Уточните обстоятельства','Спросите о фактах, которых не хватает для решения.'],
    materials:['Откройте материал дела','Отметьте, какие сведения документ подтверждает и что ещё надо проверить.'],
    materialRead:['Прочитайте документ','Сопоставьте его с обращением и вернитесь к перечню материалов.'],
    sources:['Перейдите к правовым источникам','Используйте отмеченные нормы для обоснования ответа.'],
    law:['Откройте правовой источник','Найдите норму, которая объясняет ваш вывод или действие.'],
    lawSearch:['Найдите статью','Введите номер статьи или слова из нормы. Откройте нужный результат.'],
    lawUnit:['Выберите фрагмент','Нажмите на нужный абзац, чтобы выделить его для проекта ответа.'],
    lawUse:['Прикрепите фрагмент','Добавьте выбранную цитату в проект. Норма должна относиться к обстоятельствам дела.'],
    calendarKind:['Выберите назначение срока','Выберите, какую дату рассчитываете. У разных сроков могут быть разные отправные точки.'],
    calendarDay:['Выберите дату','Сверьте событие, правило и календарь. Выберите рассчитанный день.'],
    calendarApply:['Зафиксируйте дату','Сохраните выбранный день для указанного срока.'],
    calendarRegistration:['Сверьте регистрацию','Сопоставьте дату получения и дату регистрации, затем отметьте результат проверки.'],
    routing:['Определите порядок рассмотрения','Проверьте, вправе ли ваш орган рассмотреть обращение и кому его можно поручить.'],
    recipient:['Укажите адресата','В каталоге проверьте территорию и полномочия органа по конкретному вопросу.'],
    draft:['Составьте связный ответ','Изложите установленные факты, примените норму, поясните решение и назовите дальнейшие действия.'],
    draftSubmit:['Проверьте проект','Перечитайте ответ с позиции заявителя. Проверьте, понятны ли решение, сроки и следующий шаг.'],
    control:['Перейдите к исполнению','Прочитайте новое сообщение и определите, какие вопросы ещё требуют действий.'],
    request:['Определите, что запросить','Выберите вопрос и исполнителя. Укажите, какой документ подтвердит результат.'],
    evidence:['Проверьте поступивший материал','Сопоставьте документ с конкретным вопросом и вернитесь к его статусу.'],
    status:['Обновите статус вопроса','Проверьте, достаточно ли подтверждения. Отметьте незавершённые действия.'],
    record:['Зафиксируйте итог по вопросам','Для каждого вопроса укажите статус, подтверждающий материал и следующий шаг.'],
    review:['Сверьте итог дела','Проверьте, какие выводы обоснованы и что требуется сделать дальше.'],
    advance:['Завершите шаг','Сверьте свой результат и нажмите выделенную кнопку.'],
  },
  en: {
    toggle:'Step-by-step guide', show:'Show step-by-step guide', hide:'Hide step-by-step guide',
    progress:(index,total)=>`Step ${index} of ${total}`,
    nav:['Open this tab','Select the highlighted tab to reach the tool for this step.'],
    reception:['Read the request','Identify what the visitor is asking for, then open the first step.'],
    conversation:['Clarify the facts','Ask about the information you still need before deciding.'],
    materials:['Open a case record','Identify what the document establishes and what still needs checking.'],
    materialRead:['Read the record','Compare it with the request, then return to the list of case records.'],
    sources:['Open the legal sources','Use the assigned provisions to support your response.'],
    law:['Open the legal source','Look up the provision that supports your finding or action.'],
    lawSearch:['Find the provision','Search for an article number or wording from the provision. Open a relevant result.'],
    lawUnit:['Select a passage','Tap or click the relevant paragraph to select it for the draft.'],
    lawUse:['Attach the passage','Add the selected quotation to your draft. Use a provision that applies to the case.'],
    calendarKind:['Choose the type of deadline','Select the deadline to calculate. Different deadlines may start on different dates.'],
    calendarDay:['Select the calculated date','Check the event, the rule and the calendar, then select the day.'],
    calendarApply:['Save the date','Apply the selected day to this deadline.'],
    calendarRegistration:['Check registration','Compare the receipt and registration dates, then record your finding.'],
    routing:['Choose how to handle the request','Check whether your authority can handle the matter and who may review it.'],
    recipient:['Choose the recipient','Check the authority’s territory and powers for this particular issue.'],
    draft:['Write a coherent response','State the established facts, apply the rule, explain your decision and describe what happens next.'],
    draftSubmit:['Check your draft','Read it as the applicant would. Check that the decision, the dates and the next action are clear.'],
    control:['Open follow-through','Read the new message to see which issues still require action.'],
    request:['Decide what to request','Select an issue and the person responsible. Specify the record that would prove the outcome.'],
    evidence:['Check the new record','Compare the evidence with the specific issue before you update its status.'],
    status:['Update the issue status','Check whether the evidence is sufficient. Record any actions still outstanding.'],
    record:['Record the findings','For each issue, record the status, supporting evidence and next action.'],
    review:['Review the outcome','Check which findings have support and which actions are still outstanding.'],
    advance:['Complete this step','Check your work, then select the highlighted button.'],
  },
  zh: {
    toggle:'分步提示', show:'显示分步提示', hide:'隐藏分步提示',
    progress:(index,total)=>`第 ${index} 步，共 ${total} 步`,
    nav:['打开此选项卡','点击高亮的选项卡，进入本步骤使用的工具。'],
    reception:['阅读来信','确认来访人提出了什么请求，再打开第一步。'],
    conversation:['核实情况','询问作出决定前还需了解的事实。'],
    materials:['打开案件材料','判断材料能证明哪些事实，以及哪些情况还需核实。'],
    materialRead:['阅读材料','将材料与来信内容对照，再返回案件材料列表。'],
    sources:['前往法律依据','使用标出的条款说明作出答复的依据。'],
    law:['打开法律依据','查找能够支持结论或办理措施的条款。'],
    lawSearch:['查找条款','输入条文编号或关键词，再打开相关结果。'],
    lawUnit:['选取段落','点击相关段落，将其选为答复草稿中的引文。'],
    lawUse:['添加引文','把选中的段落添加到草稿中。确认条款适用于本案。'],
    calendarKind:['选择期限类型','先选择要计算的期限。不同期限的起算日可能不同。'],
    calendarDay:['选择计算出的日期','核对事件、规则和日历后，选择相应日期。'],
    calendarApply:['保存日期','将选中的日期用于此项期限。'],
    calendarRegistration:['核对登记时间','比较收件日期和登记日期，再记录是否及时。'],
    routing:['确定办理方式','核实本机关是否有权办理，以及可以由谁审查。'],
    recipient:['选择接收方','在目录中核对该机关对具体事项的管辖范围和职权。'],
    draft:['撰写连贯的答复','说明已确认的事实、适用的条款、处理决定以及下一步。'],
    draftSubmit:['核对草稿','从申请人的角度重读，确认决定、日期和下一步行动都清楚。'],
    control:['进入办理监督','阅读新消息，判断哪些事项仍需处理。'],
    request:['确定需要调取的材料','选择事项和经办方，并说明什么材料可以证明办理结果。'],
    evidence:['核查收到的材料','将证据与具体事项对应，再更新该事项的状态。'],
    status:['更新事项状态','核实证据是否充分，并记录待办措施。'],
    record:['逐项记录结论','针对每个事项说明状态、证明材料和下一步行动。'],
    review:['复核办理结果','确认哪些结论有依据，以及还有哪些工作要做。'],
    advance:['完成本步骤','核对填写内容，再点击高亮按钮。'],
  },
};

const marked = name => `[data-tour-target="${name}"]`;
const advance = marked('advance');
const guide = '[data-tutorial-step]';
const coreStage={reception:1,materials:2,calendar:3,route:4,draft:5};
const interactive = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"]';
const noCover = interactive+', .rxt-opening blockquote, .rxa-document-body';
const inlineGroup = [
  '.rx-source-reference-actions','.rxw-calendar-targets','.rxw-calendar-sheet',
  '.rxc-subject','.rxc-writing-section','.rxa-fieldset','.rxe-field','.rxe-action-tools',
  '.rxe-material-list','.rxt-choices','.rxt-core-footer','.rxa-decision-footer',
  '.rxe-action-footer','.rxe-memorandum-footer','.rxa-actions-footer',
].join(',');
const editable = 'input:not([type="radio"],[type="checkbox"],[type="button"],[type="submit"]),textarea,[contenteditable=true]';
const clips = /^(auto|scroll|hidden|clip)$/;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const midpoint = (a,b) => (a+b)/2;

function available(element, disabled=false) {
  return element && element.getClientRects().length > 0 &&
    (disabled || !element.matches(':disabled,[aria-disabled=true]')) &&
    !element.closest('[hidden],[inert]') && element.ownerDocument.defaultView.getComputedStyle(element).visibility !== 'hidden';
}

function deadlineTarget(find, memory) {
  const kind = find(marked('calendar-kind'), '.rxw-calendar-targets');
  const selectedKind = find('[data-calendar-action="target"][aria-pressed="true"]');
  const missing = [...(kind?.querySelectorAll('[data-calendar-action="target"]')||[])]
    .filter(button => !button.parentElement.querySelector('[data-calendar-action="clear"]'));
  const registration = find('[data-core-registration]', '.rxw-calendar-registration:not(:has(:checked))');
  const use = find(marked('calendar-apply'), '[data-calendar-action="use-date"]');
  const day = find(marked('calendar-day'), '.rxw-calendar-grid');
  if (memory.calendarPick && use) return ['calendarApply', use];
  if (memory.calendarKind && (!selectedKind || missing.includes(selectedKind))) return ['calendarDay', day];
  if (missing.length) return ['calendarKind', missing[0]];
  if (registration && !registration.closest('fieldset')?.querySelector(':checked') &&
      !registration.parentElement.querySelector(':checked')) return ['calendarRegistration', registration.closest('fieldset')||registration.closest('label')||registration];
  return ['advance', find('[data-step="calendar"]'+advance, advance) || day];
}

function legalTarget(root, find, memory) {
  const reader = find('.rx-source-embedded');
  if (reader) {
    const use = find('[data-source-reference-use]');
    if (use) return ['lawUse', use];
    const result = find('.rx-source-embedded [data-action="jump-unit"]');
    const unit = find('.rx-source-embedded .ll-search-target[data-unit]', '.rx-source-embedded .ll-paper [data-unit][data-action]');
    const search = find('.rx-source-embedded [data-input="reader-query"]');
    if (memory.readerResult && unit && !result) return ['lawUnit', unit];
    return ['lawSearch', result?.closest('.ll-search-results') && available(result) ? result : search || unit];
  }
  const back = find('[data-core-records-jump]');
  if (back) return ['materials', back];
  const submit = find('[data-step="materials"]'+advance);
  if (submit && (memory.attached || find('[data-core-citation]'))) return ['advance', submit];
  const material = find(marked('materials'), guide+' [data-action="document"]:not([data-opened=true])');
  if (material) return ['materials', material];
  const act = [...root.querySelectorAll('[data-core-law] [data-normative-doc]')].find(button=>
    available(button) && ![...root.querySelectorAll('[data-core-citation]')].some(card=>
      (card.dataset.coreCitation||card.dataset.sourceId)===button.dataset.normativeDoc));
  const law = act || find(marked('law')+' [data-normative-doc]', marked('law')+' a[data-source-reader]',
    marked('law')+':is(button,a)', '.rxa-document-group [data-normative-doc]', '.rxa-document-group a[data-source-reader]');
  return ['law', law || find('[data-action="documents-list"]', marked('law'))];
}

function nextTarget(root, state, memory) {
  const find = (...selectors) => {
    for (const selector of selectors) {
      const element = [...root.querySelectorAll(selector)].find(item=>available(item));
      if (element) return element;
    }
    return null;
  };
  const step = state.step;
  const stepPage = step.page || step.panel;
  if (step.id === 'materials' && state.page === 'reception') {
    const document = find(marked('materials'));
    if (document) return ['materials', document];
    const close = find('[data-core-records] [data-action="documents-list"]');
    const sources = find('[data-action="core-sources"]');
    if (close) return ['materialRead', close];
    if (sources) return ['sources', sources];
  }
  if (stepPage && state.page !== stepPage) {
    const button = [...root.querySelectorAll('.rxa-mobile-nav [data-page]')].find(item=>item.dataset.page===stepPage);
    return ['nav', available(button) ? button : find(guide+' [data-action="page"]')];
  }
  const stepId = step.id;
  if (stepId === 'reception') {
    const enter = find('.rxt-opening [data-action="core-opening"]', '.rxt-opening [data-action="guide-jump"]', marked('reception'));
    if (!memory.receptionRead && enter) return ['reception', enter];
    return ['advance', find(advance, guide+' [data-action="tutorial-choice"]') || enter];
  }
  if (stepId === 'conversation') {
    return ['conversation', find(marked('chat'), '[data-message-draft]', guide+' [data-action="tutorial-choice"]')];
  }
  if (stepId === 'materials') return legalTarget(root, find, memory);
  if (stepId === 'calendar') return deadlineTarget(find, memory);
  if (stepId === 'route') {
    const checked = find('[data-core-disposition]:checked');
    if (checked?.value==='forward' && !find('[data-routing-recipient]:checked')) {
      return ['recipient', find('[data-routing-search]')];
    }
    const selector = find(marked('routing'), '[data-core-disposition]');
    return checked ? ['advance', find('[data-step="route"]'+advance, advance)]
      : ['routing',selector?.closest('fieldset') || selector];
  }
  if (stepId === 'draft') {
    if (find('[data-correspondence-preview]')) return ['draftSubmit',find(marked('draft-submit'), '[data-response-action="edit"]')];
    const fields = [...root.querySelectorAll('[data-correspondence-editor] [data-response-field]')].filter(field=>available(field) && field.matches('textarea,input[type="text"],input:not([type])'));
    const focused = fields.find(field=>field === root.ownerDocument.activeElement);
    const field = focused || fields.find(item=>!item.value.trim());
    return field || !fields.length ? ['draft', field || find(marked('draft'), guide+' [data-action="mentor-open-work"]')]
      : ['draftSubmit',find(marked('draft-submit'), '[data-decision-form] button[type="submit"]')];
  }
  if (stepId === 'control-request' || stepId === 'control-evidence' || stepId === 'control-status') {
    const tips = {'control-request':'request','control-evidence':'evidence','control-status':'status'};
    const work = find(guide+' [data-action="mentor-open-work"]');
    const composer = find('[data-control-composer]');
    const checkAction = find(guide+' [data-action="mentor-check-action"]', guide+' [data-action="tutorial-choice"]');
    if (memory.actionDone && memory.actionKind!=='notify' && !composer && checkAction) return ['advance', checkAction];
    if (stepId === 'control-evidence' && !memory.materialRead) {
      const material = find(guide+' [data-control-action="open-material"]', '[data-control-workspace] .rxe-material-list [data-control-action="open-material"]');
      if (material) return ['evidence', material];
    }
    if (composer) {
      const field = [...composer.querySelectorAll('textarea, input:not([type="checkbox"])')]
        .find(item=>available(item) && !item.value.trim());
      return [tips[stepId], field || find('[data-control-action="execute"]')];
    }
    return [tips[stepId], find(marked(stepId), '[data-control-action="select-kind"]') || work || checkAction];
  }
  if (stepId === 'control-memo') {
    const memo = find('[data-control-memorandum]');
    const statuses = [...(memo?.querySelectorAll('[data-response-status-field]')||[])];
    return ['record', statuses.find(item=>available(item)&&!item.value) ||
      find('[data-response-control-field="text"]', '[data-control-submit]', marked('control-memo'),
        guide+' [data-action="mentor-open-work"]', '[data-control-action="prepare-memorandum"]', guide+' [data-action="tutorial-sample"]')];
  }
  return [stepId === 'review'?'review':'control',
    find(marked(stepId), advance, guide+' [data-action="tutorial-choice"]', '[data-action="next"]')];
}

function intersection(first, second) {
  const left=Math.max(first.left,second.left),top=Math.max(first.top,second.top);
  const right=Math.min(first.right,second.right),bottom=Math.min(first.bottom,second.bottom);
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}

function visibleViewport(win) {
  const visual = win.visualViewport;
  const left = visual?.offsetLeft || 0, top = visual?.offsetTop || 0;
  return {left,top,right:left+(visual?.width||win.innerWidth),bottom:top+(visual?.height||win.innerHeight)};
}

function visibleTarget(element, viewport, win, cache=new Map()) {
  let rect = intersection(element.getBoundingClientRect(),viewport);
  for (let parent=element.parentElement;parent && parent!==element.ownerDocument.body;parent=parent.parentElement) {
    if (!cache.has(parent)) {
      const css=win.getComputedStyle(parent);
      const x=clips.test(css.overflowX), y=clips.test(css.overflowY);
      const bounds=x||y ? parent.getBoundingClientRect() : viewport;
      cache.set(parent,{
        left:x?bounds.left:viewport.left,top:y?bounds.top:viewport.top,
        right:x?bounds.right:viewport.right,bottom:y?bounds.bottom:viewport.bottom,
      });
    }
    rect=intersection(rect,cache.get(parent));
    if (rect.width<=0 || rect.height<=0) break;
  }
  return rect;
}

function revealWithinApp(element, root, win, block) {
  const before=(top,bottom,min,max)=>{
    if (bottom-top>max-min) return top-min;
    return block==='center'?midpoint(top,bottom)-midpoint(min,max)
      : top<min?top-min:bottom>max?bottom-max:0;
  };
  for (let container=element.parentElement;container && container!==root;container=container.parentElement) {
    if (!/^(auto|scroll)$/.test(win.getComputedStyle(container).overflowY) ||
        container.scrollHeight<=container.clientHeight) continue;
    const rect=element.getBoundingClientRect(), bounds=container.getBoundingClientRect();
    if (rect.top>=bounds.top+8 && rect.bottom<=bounds.bottom-8) continue;
    container.scrollTop+=before(rect.top,rect.bottom,bounds.top+8,bounds.bottom-8);
  }
  if (win.getComputedStyle(root).position==='fixed') return;
  const rect=element.getBoundingClientRect(),viewport=visibleViewport(win);
  if (rect.top<viewport.top+8 || rect.bottom>viewport.bottom-8) {
    win.scrollBy({top:before(rect.top,rect.bottom,viewport.top+8,viewport.bottom-8),behavior:'instant'});
  }
}

function fitCard(size, target, bounds, obstacles) {
  const {width,height} = size;
  if (bounds.right-bounds.left < width || bounds.bottom-bounds.top < height) return null;
  const left = Math.round(clamp(midpoint(target.left,target.right)-width/2,bounds.left,bounds.right-width));
  const top = Math.round(clamp(midpoint(target.top,target.bottom)-height/2,bounds.top,bounds.bottom-height));
  const gap=16;
  const horizontally=[left,bounds.left,bounds.right-width];
  const vertically=[top,Math.max(bounds.top,target.top),Math.min(bounds.bottom-height,target.bottom-height)];
  const candidates=[
    ...vertically.flatMap(y=>[{side:'right',left:target.right+gap,top:y},{side:'left',left:target.left-gap-width,top:y}]),
    ...horizontally.flatMap(x=>[{side:'above',left:x,top:target.top-gap-height},{side:'below',left:x,top:target.bottom+gap}]),
  ];
  return candidates.find(candidate=>{
    const rect={...candidate,right:candidate.left+width,bottom:candidate.top+height};
    return rect.left>=bounds.left && rect.top>=bounds.top && rect.right<=bounds.right &&
      rect.bottom<=bounds.bottom && !obstacles.some(obstacle=>{
        const overlap=intersection(obstacle,rect);
        return overlap.width>0 && overlap.height>0;
      });
  });
}

function drawArrow(arrow, position, size, target) {
  const {side,left,top} = position;
  const vertical=side==='above'||side==='below';
  const x=vertical?clamp(midpoint(target.left,target.right),left+9,left+size.width-9):
    midpoint(side==='left'?left+size.width:left,side==='left'?target.left:target.right);
  const y=vertical?midpoint(side==='above'?top+size.height:top,side==='above'?target.top:target.bottom):
    clamp(midpoint(target.top,target.bottom),top+9,top+size.height-9);
  const angles={above:0,below:180,left:-90,right:90};
  Object.assign(arrow.style,{left:x+'px',top:y+'px'});
  arrow.style.setProperty('--rxa-tour-angle',angles[side]+'deg');
}

function addDescription(element, descriptionId, add) {
  if (!element) return;
  const ids=(element.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==descriptionId);
  if (add) ids.push(descriptionId);
  if (ids.length) element.setAttribute('aria-describedby',ids.join(' '));
  else element.removeAttribute('aria-describedby');
}

let count=0;

export function createReceptionTour(root) {
  const doc=root.ownerDocument,win=doc?.defaultView;
  if (!win?.requestAnimationFrame || !win.MutationObserver) return {update(){},destroy(){}};
  let enabled=false, state={}, memory={}, sessionKey='', stepKey='', current=null, lastDescription='', frame=0, reveal=false;
  const descriptionId='rxaTourHint'+ ++count;
  const abort=new AbortController();
  const styleURL=resourceURL('./coach-tour.css',import.meta.url);
  if (!doc.querySelector('link[href="'+styleURL+'"]')) {
    const style=doc.createElement('link');
    style.rel='stylesheet';style.href=styleURL;doc.head.append(style);
  }
  const toggle=doc.createElement('button');
  toggle.type='button';toggle.className='rxa-tour-toggle';
  toggle.innerHTML='<span aria-hidden="true">?</span>';
  const layer=doc.createElement('div');
  layer.className='rxa-tour-layer';
  layer.innerHTML='<span class="rxa-tour-highlight" aria-hidden="true" hidden></span>'+
    '<span class="rxa-tour-arrow" aria-hidden="true" hidden></span>'+
    '<div class="rxa-tour-card" aria-hidden="true" hidden><span class="rxa-tour-progress"></span><strong></strong><p></p></div>'+
    '<span id="'+descriptionId+'" class="rxa-tour-sr" role="status" aria-live="polite"></span>';
  const [highlight,arrow,card,description]=layer.children;
  const [progress,title,body]=card.children;
  let inlineAnchor=null;

  function resetCard() {
    if (inlineAnchor) {
      inlineAnchor=null;
      card.classList.remove('rxa-tour-inline');
      layer.insertBefore(card,description);
    }
    card.hidden=true;
  }

  function showInline(target) {
    const anchor=target.closest(inlineGroup) || target;
    if (!anchor.parentElement || anchor.closest('.rxa-top, .rxa-mobile-nav') ||
        !root.contains(anchor) || anchor.matches('input, select, textarea') ||
        anchor.closest('.rx-source-embedded') && !anchor.matches('.rx-source-reference-actions')) return false;
    if (inlineAnchor!==anchor || card.nextElementSibling!==anchor) {
      inlineAnchor=anchor;
      card.classList.add('rxa-tour-inline');
      anchor.before(card);
      if (target.getBoundingClientRect().height>200) revealWithinApp(card,root,win,'nearest');
      else revealWithinApp(target,root,win,'nearest');
    }
    card.hidden=false;
    return true;
  }

  function describe(element, text) {
    if (current!==element) {
      addDescription(current,descriptionId,false);
      current=element;
      addDescription(current,descriptionId,true);
    }
    if (text!==lastDescription) {
      description.textContent=text;
      lastDescription=text;
    }
  }

  function paint() {
    frame=0;
    const words=phrases[state.locale]||phrases.ru;
    const eligible=Boolean(state.step && ['example','mentor'].includes(state.stage));
    if (eligible) {
      const actions=root.querySelector('.rxa-top-actions');
      if (actions && !actions.contains(toggle)) actions.insertBefore(toggle,actions.lastElementChild?.matches('.rxa-back')?actions.lastElementChild:null);
      if (!layer.isConnected) doc.body.append(layer);
      layer.lang=state.locale||'ru';
      description.lang=layer.lang;
      toggle.setAttribute('aria-pressed',String(enabled));
      toggle.setAttribute('aria-label',words.toggle);
      toggle.title=enabled?words.hide:words.show;
    } else {
      toggle.remove();
      layer.remove();
    }
    highlight.hidden=arrow.hidden=true;
    if (!eligible || !enabled || state.paused) {resetCard();describe(null,'');return;}
    const [key,target]=nextTarget(root,state,memory);
    if (!target) {resetCard();describe(null,'');return;}
    if (inlineAnchor && (current!==target || !root.contains(card))) resetCard();
    if (!inlineAnchor) card.hidden=true;
    const note=words[key];
    const stageNumber=root.querySelector('.rxt-case-steps') ? coreStage[state.step.id]||6 : null;
    const progressText=stageNumber ? words.progress(stageNumber,6)
      : Number.isInteger(state.stepIndex) && state.stepTotal>0 ? words.progress(state.stepIndex+1,state.stepTotal) : '';
    describe(target,[progressText,...note].filter(Boolean).join('. '));
    const viewport=visibleViewport(win);
    const editing=Boolean(doc.activeElement?.matches(editable) && root.contains(doc.activeElement));
    const viewportHeight=viewport.bottom-viewport.top;
    const keyboard=Boolean(root.dataset.keyboardOpen==='true' ||
      (editing && ((win.visualViewport?.scale??1)===1&&win.innerHeight-viewportHeight>130 || viewportHeight<460)));
    if (keyboard && inlineAnchor) {
      resetCard();
      if (editing) revealWithinApp(doc.activeElement,root,win,'nearest');
    }
    const original=target.getBoundingClientRect();
    let targetRect=visibleTarget(target,viewport,win);
    if (reveal && !keyboard) {
      reveal=false;
      if (targetRect.width<20 || targetRect.height<Math.min(34,original.height)) {
        revealWithinApp(target,root,win,'center');
        targetRect=visibleTarget(target,viewport,win);
      }
    }
    if (targetRect.width<13 || targetRect.height<11) return;
    function drawHighlight(rect) {
      const left=Math.max(viewport.left+2,rect.left-3),top=Math.max(viewport.top+2,rect.top-3);
      Object.assign(highlight.style,{left:left+'px',top:top+'px',
        width:Math.max(1,Math.min(viewport.right-2,rect.right+3)-left)+'px',
        height:Math.max(1,Math.min(viewport.bottom-2,rect.bottom+3)-top)+'px'});
      highlight.hidden=false;
      highlight.dataset.target=key;
    }
    drawHighlight(targetRect);
    if (keyboard) return;

    progress.textContent=progressText;
    progress.hidden=!progressText;
    title.textContent=note[0];
    body.textContent=note[1];
    body.hidden=false;
    function drawInline() {
      const shape=card.getBoundingClientRect();
      const connector=shape.bottom<=targetRect.top+1 && shape.top>=viewport.top;
      if (connector) drawArrow(arrow,{side:'above',left:shape.left,top:Math.max(shape.top,targetRect.top-20-shape.height)},shape,targetRect);
      arrow.hidden=!connector;
    }
    if (inlineAnchor) {drawInline();return;}
    const margin=10;
    const bounds={left:viewport.left+margin,top:viewport.top+margin,right:viewport.right-margin,bottom:viewport.bottom-margin};
    card.style.width=Math.floor(Math.min(310,bounds.right-bounds.left))+'px';
    card.hidden=false;
    const clipCache=new Map();
    const obstacles=[...root.querySelectorAll(noCover)].filter(node=>node!==target && !target.contains(node) &&
      !node.closest('[aria-hidden=true]') && node.getClientRects().length).map(node=>visibleTarget(node,viewport,win,clipCache))
      .filter(rect=>rect.width>0 && rect.height>0);
    let size={width:card.offsetWidth,height:card.offsetHeight};
    let placement=fitCard(size,targetRect,bounds,obstacles);
    if (!placement) {
      card.style.width=Math.floor(Math.min(228,bounds.right-bounds.left))+'px';
      size={width:card.offsetWidth,height:card.offsetHeight};
      placement=fitCard(size,targetRect,bounds,obstacles);
    }
    if (!placement) {
      body.hidden=true;
      size={width:card.offsetWidth,height:card.offsetHeight};
      placement=fitCard(size,targetRect,bounds,obstacles);
    }
    if (!placement) {
      body.hidden=false;
      if (!showInline(target)) {card.hidden=true;return;}
      targetRect=visibleTarget(target,viewport,win);
      if (targetRect.width>=13 && targetRect.height>=11) {
        drawHighlight(targetRect);
        drawInline();
      } else highlight.hidden=true;
      return;
    }
    Object.assign(card.style,{left:placement.left+'px',top:placement.top+'px'});
    drawArrow(arrow,placement,size,targetRect);
    arrow.hidden=false;
  }

  function schedule() {
    if (!frame) frame=win.requestAnimationFrame(paint);
  }

  function onClick(event) {
    if (!enabled || state.paused || !state.step) return;
    const control=event.target.closest?.('button,[data-unit],a');
    if (!control) return;
    if (control.matches('[data-action="guide-jump"]')) memory.receptionRead=true;
    if (control.matches('[data-action="document"],[data-action="documents-list"],[data-source-reference-use]')) reveal=true;
    if (control.matches('[data-calendar-action="target"]')) {
      memory.calendarKind=true;
      memory.calendarPick=false;
      reveal=true;
    }
    if (control.matches('[data-calendar-action="choose-date"]')) {
      memory.calendarKind=false;
      memory.calendarPick=true;
      reveal=true;
    }
    if (control.matches('[data-calendar-action="use-date"]')) {
      memory.calendarKind=false;
      memory.calendarPick=false;
      reveal=true;
    }
    if (control.matches('.rx-source-embedded [data-action="jump-unit"]')) memory.readerResult=true;
    if (control.matches('[data-source-reader-close]')) memory.readerResult=false;
    if (control.matches('[data-source-reference-use]')) memory.attached=true;
    if (control.matches('[data-control-action="open-material"]')) memory.materialRead=true;
    if (control.matches('[data-control-action="select-kind"]')) {
      memory.actionDone=false;
      memory.actionKind=control.dataset.kind;
    }
    if (control.matches('[data-control-action="execute"]')) memory.actionDone=true;
    schedule();
  }
  const observer=new win.MutationObserver(records=>{
    if (records.some(record=>!toggle.contains(record.target) && !card.contains(record.target) &&
        (record.type==='attributes' || [...record.addedNodes,...record.removedNodes].some(node=>node!==toggle&&node!==card)))) schedule();
  });
  const listen=(target,event,fn,options={})=>target?.addEventListener(event,fn,{...options,signal:abort.signal});
  listen(toggle,'click',()=>{
    enabled=!enabled;
    reveal=enabled;
    schedule();
  });
  listen(root,'click',onClick,{capture:true});
  listen(root,'change',schedule);
  listen(root,'input',schedule);
  listen(root,'focusin',schedule);
  listen(root,'focusout',schedule);
  listen(root,'toggle',schedule,{capture:true});
  listen(win,'scroll',schedule,{capture:true,passive:true});
  listen(win,'resize',schedule,{passive:true});
  listen(win.visualViewport,'scroll',schedule,{passive:true});
  listen(win.visualViewport,'resize',schedule,{passive:true});
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-keyboard-open','disabled','hidden']});
  // A native text selection can enable the attach button without redrawing its parent.
  listen(doc,'selectionchange',schedule);

  return {
    update(next) {
      const nextSession=next.stage+':'+next.sessionId;
      if (nextSession!==sessionKey) {
        sessionKey=nextSession;
        enabled=next.stage==='example';
      }
      const nextStep=nextSession+':'+next.step?.id+':'+next.page;
      if (nextStep!==stepKey) {
        if (next.step?.id!==state.step?.id || next.sessionId!==state.sessionId) memory={};
        stepKey=nextStep;
        reveal=enabled;
      }
      state=next;
      schedule();
    },
    destroy() {
      abort.abort();
      observer.disconnect();
      if (frame) win.cancelAnimationFrame(frame);
      describe(null,'');
      toggle.remove();
      card.remove();
      layer.remove();
    },
  };
}
