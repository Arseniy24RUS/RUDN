/**
 * Student-authored correspondence and presentation of assessment feedback.
 *
 * The host owns persistence, navigation and submission. Inputs expose:
 *   data-response-field="subject|kind|sections.<name>"
 *   data-response-order-field="<name>" + data-order-id
 *   data-response-order-recipient="<recipientId>" + data-order-id
 *   data-response-order-citation="<citationId>" + data-order-id
 *   data-response-control-field="text"
 *   data-response-status-field="status" + data-issue-id
 *   data-response-status-evidence="<sourceId>" + data-issue-id
 *
 * Buttons use data-response-action:
 *   preview, edit, print, download, add-order, remove-order (data-order-id),
 *   attach-source (data-section; read select[data-response-source="<section>"]
 *     and textarea[data-response-source-quote="<section>"]),
 *   remove-source (data-citation-id), choose-recipient (data-order-id),
 *   calendar (data-order-id), sources, conversation.
 *
 * Sources are public records {id,kind,title,text?,quote?,unitIds?,url?}.
 * A source picker value is kind + ":" + id. No URLs or source titles are
 * accepted as submitted citations; the server resolves source IDs.
 */
import {RECEPTION_AUTHORITIES} from './authority-directory.js';
import {localizedAuthorityName} from './authority-picker.js';

const SECTION_IDS = ['facts', 'legalBasis', 'resolution', 'nextSteps'];
const DOCUMENT_KINDS = ['reply', 'notification', 'referral', 'request', 'return', 'internal', 'special'];
const ORDER_KINDS = ['request', 'referral', 'execution', 'review', 'notification', 'control'];
const SOURCE_KINDS = ['document', 'dialogue', 'legal'];
const CONTROL_STATUSES = ['pending', 'resolved', 'referred'];
const TEXT_LIMIT = 6000;
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
const language = value => value === 'en' || value === 'zh' ? value : 'ru';
const local = (value, locale) => typeof value === 'string' ? value : value && typeof value === 'object' ? String(value[language(locale)] ?? value.ru ?? value.en ?? '') : '';
const string = (value, max = TEXT_LIMIT) => typeof value === 'string' ? value.slice(0, max) : '';
const ids = (value, max = 20) => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string' && item.length && item.length <= 240))].slice(0, max) : [];
const copy = {
  ru: {
    title:'Проект ответа', writing:'Редактор', preview:'Предпросмотр', edit:'Вернуться к тексту', print:'Печать / PDF', download:'Скачать HTML',
    project:'Учебный проект', document:'Документ', subject:'Тема', subjectHint:'Кратко обозначьте предмет обращения',
    documentDate:'Дата', documentNumber:'№', signer:'Уполномоченное должностное лицо', signature:'Подпись', signerName:'И.О. Фамилия', specialist:'Исполнитель (специалист)',
    kind:'Вид документа', issuer:'Подразделение по работе с обращениями', recipient:'Заявителю', matter:'По обращению',
    draftEmpty:'Текст проекта ещё не подготовлен.', source:'Источник', sources:'Источники', evidence:'Основания раздела',
    attach:'Прикрепить', addSource:'Прикрепить источник', sourceChoose:'Выберите материал', noSources:'Откройте материалы дела или сохраните фрагмент нормативного акта.',
    openSources:'К материалам', chat:'К разговору', removeSource:'Убрать источник', quote:'Цитата', unavailable:'Источник из записи работы',
    annex:'Источники, использованные в проекте', provenance:'Приложение к учебному проекту',
    orders:'Поручения и контроль', addOrder:'Добавить поручение', order:'Поручение', removeOrder:'Удалить поручение',
    issue:'Вопрос обращения', issueHint:'Какой вопрос решает поручение', operation:'Действие', recipients:'Исполнитель / адресат',
    chooseRecipient:'Выбрать адресата', noRecipient:'Адресат не выбран', instruction:'Что требуется сделать',
    expected:'Чем подтверждается результат', expectedHint:'Документ, проверяемый факт или иной результат',
    due:'Срок исполнения', calendar:'Открыть календарь', orderEvidence:'Основания поручения', none:'Не выбрано',
    notSet:'Не указано', control:'Контроль исполнения', controlText:'Решение по результатам контроля',
    controlHint:'Сопоставьте новые сведения с вашим решением. Укажите, что исполнено и какие действия остаются.',
    issueStatus:'Состояние вопроса', statusChoose:'Укажите состояние', controlEvidence:'Подтверждающие материалы', sourceQuote:'Фрагмент источника',
    emptyControl:'Сформулируйте вывод по новым сведениям.', selected:'Выбрано', clearRecipient:'Убрать адресата', noOrders:'Добавляйте поручения, когда решение требует исполнения или дополнительной проверки.', quoteHint:'Точная цитата, на которую опирается ваш вывод',
    section:{facts:'Обстоятельства', legalBasis:'Правовое основание', resolution:'Решение и действия', nextSteps:'Дальнейший порядок'},
    hint:{facts:'Изложите установленные обстоятельства и существенные расхождения.', legalBasis:'Обоснуйте применение конкретных норм к обстоятельствам обращения.', resolution:'Сформулируйте решение по каждому существенному вопросу.', nextSteps:'Укажите дальнейшие действия, информирование заявителя и контроль результата.'},
    kinds:{reply:'Ответ заявителю', notification:'Уведомление', referral:'Направление по компетенции', request:'Запрос материалов', return:'Возврат с разъяснением', internal:'Служебный документ', special:'Проект решения / постановления'},
    orderKinds:{request:'Запросить материалы',referral:'Направить по компетенции',execution:'Организовать исполнение',review:'Провести проверку',notification:'Уведомить',control:'Проверить результат'},
    sourceKinds:{document:'Материалы дела',dialogue:'Разговор',legal:'Нормативные источники'},
    event:'Новое сообщение по делу', controlFields:{status:'состояние вопроса',evidence:'подтверждающие материалы',source:'материал дела',rule:'правило проверки',reason:'критерий оценки',answer:'проект ответа',section:'раздел проекта',order:'поручение',next:'дальнейшие действия'},
    statuses:{pending:'Оставить на контроле',resolved:'Исполнение подтверждено',referred:'Передано по компетенции'},
  },
  en: {
    title:'Draft response', writing:'Editor', preview:'Preview', edit:'Back to editing', print:'Print / PDF', download:'Download HTML',
    project:'Training draft', document:'Document', subject:'Subject', subjectHint:'State the subject of the appeal briefly',
    documentDate:'Date', documentNumber:'No.', signer:'Authorised official', signature:'Signature', signerName:'Name', specialist:'Preparing specialist',
    kind:'Document type', issuer:'Public appeals unit', recipient:'Applicant', matter:'Appeal',
    draftEmpty:'The draft has not been written yet.', source:'Source', sources:'Sources', evidence:'Section sources',
    attach:'Attach', addSource:'Attach a source', sourceChoose:'Choose a source', noSources:'Open case materials or save a passage from a legal source.',
    openSources:'Case materials', chat:'Conversation', removeSource:'Remove source', quote:'Quotation', unavailable:'Source in the work record',
    annex:'Sources used in this draft', provenance:'Appendix to the training draft',
    orders:'Assignments and follow-through', addOrder:'Add an assignment', order:'Assignment', removeOrder:'Delete assignment',
    issue:'Appeal issue', issueHint:'Which issue this assignment addresses', operation:'Action', recipients:'Responsible body / recipient',
    chooseRecipient:'Choose a recipient', noRecipient:'No recipient selected', instruction:'Required action',
    expected:'Evidence of completion', expectedHint:'A document, verifiable fact or other result',
    due:'Completion deadline', calendar:'Open calendar', orderEvidence:'Assignment sources', none:'Not selected',
    notSet:'Not entered', control:'Follow-through', controlText:'Decision after reviewing implementation',
    controlHint:'Compare the new information with your decision. Explain what is complete and what still needs action.',
    issueStatus:'Issue status', statusChoose:'Choose a status', controlEvidence:'Supporting evidence', sourceQuote:'Source passage',
    emptyControl:'Write your conclusion from the new information.', selected:'Selected', clearRecipient:'Remove recipient', noOrders:'Add assignments when the decision calls for implementation or further review.', quoteHint:'The exact passage supporting your conclusion',
    section:{facts:'Findings',legalBasis:'Legal basis',resolution:'Decision and actions',nextSteps:'Next steps'},
    hint:{facts:'State the established circumstances and material inconsistencies.',legalBasis:'Explain how specific provisions apply to this appeal.',resolution:'State your decision on each material issue.',nextSteps:'Explain further action, communication with the applicant and how the result will be checked.'},
    kinds:{reply:'Reply to the applicant',notification:'Notice',referral:'Referral to a competent body',request:'Request for materials',return:'Return with explanation',internal:'Internal document',special:'Draft decision / order'},
    orderKinds:{request:'Request materials',referral:'Refer to the competent body',execution:'Arrange implementation',review:'Conduct a review',notification:'Notify',control:'Check the result'},
    sourceKinds:{document:'Case materials',dialogue:'Conversation',legal:'Legal sources'},
    event:'New case information', controlFields:{status:'issue status',evidence:'supporting evidence',source:'case material',rule:'review requirement',reason:'assessment criterion',answer:'draft response',section:'draft section',order:'assignment',next:'next steps'},
    statuses:{pending:'Keep under review',resolved:'Completion confirmed',referred:'Referred to a competent body'},
  },
  zh: {
    title:'答复草稿',writing:'编辑',preview:'预览',edit:'返回编辑',print:'打印 / PDF',download:'下载 HTML',
    project:'教学草稿',document:'文书',subject:'主题',subjectHint:'简要说明来信的主题',
    documentDate:'日期',documentNumber:'编号',signer:'有权签署的工作人员',signature:'签名',signerName:'姓名',specialist:'经办人员',
    kind:'文书类型',issuer:'来信办理部门',recipient:'申请人',matter:'来信事项',
    draftEmpty:'尚未撰写草稿。',source:'来源',sources:'来源',evidence:'本节依据',
    attach:'附加',addSource:'附加来源',sourceChoose:'选择材料',noSources:'请打开案件材料或保存法规原文片段。',
    openSources:'案件材料',chat:'对话',removeSource:'移除来源',quote:'引用',unavailable:'工作记录中的来源',
    annex:'草稿所使用的来源',provenance:'教学草稿附件',
    orders:'任务与执行监督',addOrder:'添加任务',order:'任务',removeOrder:'删除任务',
    issue:'来信问题',issueHint:'该任务处理的问题',operation:'行动',recipients:'执行机关 / 接收方',
    chooseRecipient:'选择接收方',noRecipient:'尚未选择接收方',instruction:'需要采取的行动',
    expected:'完成结果的证明',expectedHint:'文件、可核实的事实或其他结果',
    due:'执行期限',calendar:'打开日历',orderEvidence:'任务依据',none:'未选择',
    notSet:'未填写',control:'执行监督',controlText:'核查执行情况后的决定',
    controlHint:'将新信息与您的决定进行比较，说明已经完成的事项和仍需采取的行动。',
    issueStatus:'问题状态',statusChoose:'选择状态',controlEvidence:'证明材料',sourceQuote:'来源片段',
    emptyControl:'请根据新信息作出结论。',selected:'已选择',clearRecipient:'移除接收方',noOrders:'需要执行或进一步核查时，可添加任务。',quoteHint:'支持您结论的原文引文',
    section:{facts:'事实情况',legalBasis:'法律依据',resolution:'决定与行动',nextSteps:'后续程序'},
    hint:{facts:'说明已查明的情况和重要矛盾。',legalBasis:'说明具体法律规定如何适用于本来信。',resolution:'就每个重要问题作出决定。',nextSteps:'说明后续行动、申请人通知方式及结果核查办法。'},
    kinds:{reply:'答复申请人',notification:'通知',referral:'按职权转送',request:'材料请求',return:'退回并说明',internal:'内部文书',special:'决定 / 命令草案'},
    orderKinds:{request:'请求材料',referral:'按职权转送',execution:'组织执行',review:'开展核查',notification:'通知',control:'核查结果'},
    sourceKinds:{document:'案件材料',dialogue:'对话',legal:'法规来源'},
    event:'案件新信息', controlFields:{status:'问题状态',evidence:'证明材料',source:'案件材料',rule:'评审要求',reason:'评分标准',answer:'答复草稿',section:'草稿章节',order:'任务',next:'后续行动'},
    statuses:{pending:'继续监督',resolved:'已确认执行',referred:'已按职权转送'},
  },
};

function glyph(name) {
  const paths = {
    paper:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
    link:'<path d="m10 13 4-4m-7 6-1 1a4 4 0 0 0 6 6l4-4a4 4 0 0 0 0-6M8 12a4 4 0 0 1 0-6l4-4a4 4 0 0 1 6 6l-1 1" transform="translate(1 -1) scale(.9)"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    print:'<path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/><path d="M18 12h.01"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>',
    chevron:'<path d="m8 10 4 4 4-4"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  return '<svg class="rxc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.paper) + '</svg>';
}
const button = (label, action, {icon='',disabled=false,extra='',className=''}={}) => '<button type="button" class="rxa-btn rxc-button ' + esc(className) + '" data-response-action="' + esc(action) + '" ' + (disabled?'disabled ':'') + extra + '>' + (icon?glyph(icon):'') + '<span>' + esc(label) + '</span></button>';
const safeURL = value => {
  try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};
const paragraphHTML = value => String(value || '').trim().split(/\n\s*\n/).filter(Boolean).map(paragraph => '<p>' + esc(paragraph).replace(/\n/g,'<br>') + '</p>').join('');
const nextId = (rows, prefix) => { let n=1; const existing=new Set(rows.map(row=>row.id)); while(existing.has(prefix+n)) n++; return prefix+n; };

export function blankCorrespondence(profile) {
  return {version:1,kind:DOCUMENT_KINDS.includes(profile?.kind)?profile.kind:'reply',subject:'',sections:{facts:'',legalBasis:'',resolution:'',nextSteps:''},citations:[],orders:[]};
}

/** Preserve only the bounded public submission shape, including old saved drafts. */
export function restoreCorrespondence(value) {
  const draft=blankCorrespondence(),source=value && typeof value==='object'?value:{};
  if(DOCUMENT_KINDS.includes(source.kind))draft.kind=source.kind;
  draft.subject=string(source.subject,240);
  for(const section of SECTION_IDS)draft.sections[section]=string(source.sections?.[section]);
  const citationIds=new Set();
  for(const entry of Array.isArray(source.citations)?source.citations.slice(0,20):[]) {
    if(!entry || !SECTION_IDS.includes(entry.section) || !SOURCE_KINDS.includes(entry.kind) || !string(entry.sourceId,240) || !string(entry.quote,4000).trim())continue;
    const id=string(entry.id,100)||nextId(draft.citations,'citation-');if(citationIds.has(id))continue;citationIds.add(id);
    draft.citations.push({id,section:entry.section,kind:entry.kind,sourceId:string(entry.sourceId,240),...(Array.isArray(entry.unitIds)?{unitIds:ids(entry.unitIds,40)}:{}),quote:string(entry.quote,4000)});
  }
  const orderIds=new Set();
  for(const entry of Array.isArray(source.orders)?source.orders.slice(0,12):[]) {
    if(!entry || typeof entry!=='object')continue;
    const id=string(entry.id,100)||nextId(draft.orders,'order-');if(orderIds.has(id))continue;orderIds.add(id);
    draft.orders.push({id,issue:string(entry.issue,500),kind:ORDER_KINDS.includes(entry.kind)?entry.kind:'request',recipientIds:ids(entry.recipientIds,12),instruction:string(entry.instruction,2000),dueDate:/^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate||'')?entry.dueDate:'',expectedResult:string(entry.expectedResult,1000),citationIds:ids(entry.citationIds).filter(id=>citationIds.has(id))});
  }
  return draft;
}

/** Pure updates; the host persists and renders after structural changes. */
export function reduceCorrespondence(value, action={}) {
  const draft=restoreCorrespondence(value),field=action.field;
  if(action.type==='field') {
    if(field==='kind' && DOCUMENT_KINDS.includes(action.value))draft.kind=action.value;
    else if(field==='subject')draft.subject=string(action.value,240);
    else if(field?.startsWith('sections.') && SECTION_IDS.includes(field.slice(9)))draft.sections[field.slice(9)]=string(action.value);
  } else if(action.type==='source-add' && SECTION_IDS.includes(action.section) && draft.citations.length<20) {
    const source=action.source;
    if(source && SOURCE_KINDS.includes(source.kind) && string(source.id,240)) {
      const candidate=source.quote ?? source.text;
      // A whole short source is a valid quotation. A long source must be
      // narrowed by the student; silently taking its first 4,000 characters
      // could attach a passage unrelated to the student's finding.
      if(typeof candidate!=='string'||!candidate.trim()||candidate.length>4000)return draft;
      const quote=candidate.trim();
      const duplicate=draft.citations.some(item=>item.section===action.section&&item.kind===source.kind&&item.sourceId===source.id&&item.quote===quote);
      if(!duplicate)draft.citations.push({id:nextId(draft.citations,'citation-'),section:action.section,kind:source.kind,sourceId:string(source.id,240),...(Array.isArray(source.unitIds)?{unitIds:ids(source.unitIds,40)}:{}),quote});
    }
  } else if(action.type==='source-remove') {
    draft.citations=draft.citations.filter(item=>item.id!==action.id);
    for(const order of draft.orders)order.citationIds=order.citationIds.filter(id=>id!==action.id);
  } else if(action.type==='order-add' && draft.orders.length<12) {
    draft.orders.push({id:nextId(draft.orders,'order-'),issue:'',kind:'request',recipientIds:[],instruction:'',dueDate:'',expectedResult:'',citationIds:[]});
  } else if(action.type==='order-remove') {
    draft.orders=draft.orders.filter(order=>order.id!==action.id);
  } else if(action.type?.startsWith('order-')) {
    const order=draft.orders.find(item=>item.id===action.id);if(!order)return draft;
    if(action.type==='order-field') {
      if(field==='kind' && ORDER_KINDS.includes(action.value))order.kind=action.value;
      else if(['issue','instruction','expectedResult'].includes(field))order[field]=string(action.value,{issue:500,instruction:2000,expectedResult:1000}[field]);
      else if(field==='dueDate')order.dueDate=/^\d{4}-\d{2}-\d{2}$/.test(action.value||'')?action.value:'';
    } else if(action.type==='order-recipient' && string(action.recipientId,240)) {
      order.recipientIds=action.selected?ids([...order.recipientIds,action.recipientId],12):order.recipientIds.filter(id=>id!==action.recipientId);
    } else if(action.type==='order-citation' && draft.citations.some(item=>item.id===action.citationId)) {
      order.citationIds=action.selected?ids([...order.citationIds,action.citationId]):order.citationIds.filter(id=>id!==action.citationId);
    }
  }
  return draft;
}

export function correspondenceSourceKey(source){
  const key=source.kind+':'+source.id;
  return source.kind==='legal'?key+':'+(source.unitIds||[]).join(','):key;
}
function publicSources(sources=[],locale='ru') {
  const result=[],seen=new Set();
  for(const source of Array.isArray(sources)?sources:[]) {
    if(!source || !SOURCE_KINDS.includes(source.kind) || typeof source.id!=='string' || !source.id)continue;
    const key=correspondenceSourceKey(source);if(seen.has(key))continue;seen.add(key);
    result.push({...source,key,title:local(source.title,locale)||copy[language(locale)].sourceKinds[source.kind],text:local(source.text,locale),quote:local(source.quote,locale)});
  }
  return result;
}
function citationSource(citation,sources){
  return sources.find(source=>source.id===citation.sourceId&&source.kind===citation.kind&&
    (citation.kind!=='legal'||(source.unitIds||[]).join(',')===(citation.unitIds||[]).join(',')));
}
function sourceTitle(citation,sources,t){return citationSource(citation,sources)?.title||t.sourceKinds[citation.kind]||t.source;}
function recipientLabel(id,recipients,locale) { const row=(recipients||[]).find(recipient=>recipient.id===id);return local(row?.label??row?.name,locale)||copy[language(locale)].noRecipient; }
function sourcePicker(section,draft,sources,locale,disabled) {
  const t=copy[language(locale)],attached=draft.citations.filter(item=>item.section===section);
  const rows=attached.map(citation=>{
    const index=draft.citations.findIndex(item=>item.id===citation.id)+1;
    return '<article class="rxc-citation"><div><span class="rxc-citation-number">' + index + '</span><span>' + esc(sourceTitle(citation,sources,t)) + '</span></div>' + button(t.removeSource,'remove-source',{icon:'close',disabled,extra:'data-citation-id="'+esc(citation.id)+'"',className:'rxc-icon-button'}) + (citation.quote?'<blockquote>'+esc(citation.quote)+'</blockquote>':'') + '</article>';
  }).join('');
  const groups=SOURCE_KINDS.map(kind=>{
    const members=sources.filter(source=>source.kind===kind);
    return members.length?'<optgroup label="'+esc(t.sourceKinds[kind])+'">'+members.map(source=>'<option value="'+esc(source.key)+'">'+esc(source.title+(source.locator?' · '+local(source.locator,locale):''))+'</option>').join('')+'</optgroup>':'';
  }).join('');
  return '<details class="rxc-source-drawer" data-details="response-sources-'+section+'"><summary>'+glyph('link')+'<span>'+esc(t.evidence)+'</span><small>'+attached.length+'</small>'+glyph('chevron')+'</summary><div class="rxc-source-drawer-body">'+rows+(sources.length?'<div class="rxc-source-picker"><label class="rxa-field"><span class="rxa-sr">'+esc(t.addSource)+' · '+esc(t.section[section])+'</span><select data-response-source="'+section+'" data-focus="response-source-'+section+'" '+(disabled?'disabled':'')+'><option value="">'+esc(t.sourceChoose)+'</option>'+groups+'</select></label></div><label class="rxa-field rxc-source-quotation"><span>'+esc(t.sourceQuote)+'</span><textarea data-response-source-quote="'+section+'" data-focus="response-source-quote-'+section+'" maxlength="4000" rows="3" placeholder="'+esc(t.quoteHint)+'" '+(disabled?'disabled':'')+'></textarea></label><div class="rxc-source-attach">'+button(t.attach,'attach-source',{icon:'plus',disabled:disabled||draft.citations.length>=20,extra:'data-section="'+section+'"'})+'</div>':'<p class="rxc-muted">'+esc(t.noSources)+'</p>')+'<div class="rxc-source-links">'+button(t.openSources,'sources',{className:'quiet',disabled})+button(t.chat,'conversation',{className:'quiet',disabled})+'</div></div></details>';
}
function orderView(order,index,{draft,recipients=[],sources,locale,disabled}) {
  const t=copy[language(locale)],off=disabled?' disabled':'',id=esc(order.id);
  const field=(name,label,value,{type='text',max=500,placeholder=''}={})=>'<label class="rxa-field"><span>'+esc(label)+'</span><input type="'+type+'" data-response-order-field="'+name+'" data-order-id="'+id+'" data-focus="response-order-'+id+'-'+name+'" value="'+esc(value)+'" maxlength="'+max+'" placeholder="'+esc(placeholder)+'"'+off+'></label>';
  const recipientIds=ids([...order.recipientIds,...recipients.map(recipient=>recipient.id)],24);
  const recipientChoices=recipientIds.map(recipientId=>'<label class="rxc-recipient-choice"><input type="checkbox" data-response-order-recipient="'+esc(recipientId)+'" data-order-id="'+id+'" '+(order.recipientIds.includes(recipientId)?'checked ':'')+off+'><span>'+esc(recipientLabel(recipientId,recipients,locale))+'</span></label>').join('');
  const citations=draft.citations.length?'<details class="rxc-order-citations"><summary>'+esc(t.orderEvidence)+'</summary>'+draft.citations.map((citation,n)=>'<label class="rxc-recipient-choice"><input type="checkbox" data-response-order-citation="'+esc(citation.id)+'" data-order-id="'+id+'" '+(order.citationIds.includes(citation.id)?'checked ':'')+off+'><span>'+String(n+1)+'. '+esc(sourceTitle(citation,sources,t))+'</span></label>').join('')+'</details>':'';
  return '<details class="rxc-order" data-details="response-order-'+id+'" '+(!order.issue&&!order.instruction?'open':'')+'><summary><span class="rxc-order-number">'+(index+1)+'</span><span><strong>'+esc(order.issue||t.order+' '+(index+1))+'</strong><small>'+esc(t.orderKinds[order.kind]+(order.dueDate?' · '+dateLabel(order.dueDate,locale):''))+'</small></span>'+glyph('chevron')+'</summary><div class="rxc-order-body">'+
    '<div class="rxc-order-top">'+field('issue',t.issue,order.issue,{placeholder:t.issueHint})+'<label class="rxa-field"><span>'+esc(t.operation)+'</span><select data-response-order-field="kind" data-order-id="'+id+'" data-focus="response-order-'+id+'-kind"'+off+'>'+ORDER_KINDS.map(kind=>'<option value="'+kind+'" '+(order.kind===kind?'selected':'')+'>'+esc(t.orderKinds[kind])+'</option>').join('')+'</select></label></div>'+
    '<label class="rxa-field"><span>'+esc(t.instruction)+'</span><textarea data-response-order-field="instruction" data-order-id="'+id+'" data-focus="response-order-'+id+'-instruction" maxlength="2000" rows="3"'+off+'>'+esc(order.instruction)+'</textarea></label>'+
    '<fieldset class="rxc-recipients"><legend>'+esc(t.recipients)+'</legend>'+recipientChoices+button(t.chooseRecipient,'choose-recipient',{disabled,extra:'data-order-id="'+id+'"',className:'quiet'})+'</fieldset>'+
    '<div class="rxc-order-bottom"><div>'+field('dueDate',t.due,order.dueDate,{type:'date'})+button(t.calendar,'calendar',{icon:'clock',disabled,extra:'data-order-id="'+id+'"',className:'quiet'})+'</div>'+field('expectedResult',t.expected,order.expectedResult,{max:1000,placeholder:t.expectedHint})+'</div>'+citations+
    '<div class="rxc-order-remove">'+button(t.removeOrder,'remove-order',{icon:'close',disabled,extra:'data-order-id="'+id+'"',className:'quiet'})+'</div></div></details>';
}

export function correspondenceEditorView({draft,caseInfo={},profile={},sources=[],recipients=[],locale='ru',disabled=false}={}) {
  const d=restoreCorrespondence(draft),t=copy[language(locale)],available=publicSources(sources,locale),off=disabled?' disabled':'';
  const blocks=SECTION_IDS.map((section,index)=>{
    const label=local(profile.sections?.[section]?.label??profile.sections?.[section],locale)||t.section[section];
    return '<section class="rxc-writing-section" data-response-section="'+section+'"><div class="rxc-writing-heading"><span>'+String(index+1).padStart(2,'0')+'</span><label for="rxc-section-'+section+'">'+esc(label)+'</label></div><textarea id="rxc-section-'+section+'" data-response-field="sections.'+section+'" data-focus="response-'+section+'" aria-describedby="rxc-hint-'+section+'" maxlength="'+TEXT_LIMIT+'" rows="'+(section==='resolution'?5:4)+'"'+off+'>'+esc(d.sections[section])+'</textarea><p class="rxc-writing-hint" id="rxc-hint-'+section+'">'+esc(local(profile.sectionPrompts?.[section],locale)||t.hint[section])+'</p>'+sourcePicker(section,d,available,locale,disabled)+'</section>';
  }).join('');
  return '<section class="rxc-editor" data-correspondence-editor><div class="rxc-editor-toolbar"><div>'+glyph('paper')+'<strong>'+esc(t.title)+'</strong></div>'+button(t.preview,'preview',{icon:'eye'})+'</div><div class="rxc-document-meta"><label class="rxa-field rxc-kind"><span>'+esc(t.kind)+'</span><select data-response-field="kind" data-focus="response-kind"'+off+'>'+DOCUMENT_KINDS.map(kind=>'<option value="'+kind+'" '+(d.kind===kind?'selected':'')+'>'+esc(t.kinds[kind])+'</option>').join('')+'</select></label><label class="rxa-field rxc-subject"><span>'+esc(t.subject)+'</span><input type="text" data-response-field="subject" data-focus="response-subject" value="'+esc(d.subject)+'" maxlength="240" placeholder="'+esc(t.subjectHint)+'"'+off+'></label></div><div class="rxc-writing-sheet">'+blocks+'</div><section class="rxc-orders"><div class="rxc-orders-heading"><div>'+glyph('clock')+'<h3>'+esc(t.orders)+'</h3></div>'+button(t.addOrder,'add-order',{icon:'plus',disabled:disabled||d.orders.length>=12})+'</div>'+(d.orders.length?d.orders.map((order,index)=>orderView(order,index,{draft:d,recipients,sources:available,locale,disabled})).join(''):'<p class="rxc-muted rxc-no-orders">'+esc(t.noOrders)+'</p>')+'</section></section>';
}

function dateLabel(value,locale) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
  const date=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return value;
  return new Intl.DateTimeFormat({ru:'ru-RU',en:'en-GB',zh:'zh-CN'}[language(locale)],{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
}
function letterContent({draft,caseInfo={},profile={},sources=[],recipients=[],specialistName='',locale='ru',citationPrefix='rxc-source'}={}) {
  const d=restoreCorrespondence(draft),t=copy[language(locale)],available=publicSources(sources,locale);
  const issuer=local(profile.issuer?.name,locale)||local(profile.origin?.name,locale)||local(caseInfo.workbook?.origin?.name,locale)||t.issuer;
  const citizen=local(caseInfo.citizen?.name,locale);
  const orderRecipientIds=ids(d.orders.filter(order=>order.kind===d.kind).flatMap(order=>order.recipientIds),12);
  const officialRecipients=['referral','request'].includes(d.kind)
    ? (recipients||[]).filter(recipient=>!orderRecipientIds.length||orderRecipientIds.includes(recipient.id)).map(recipient=>local(recipient.label??recipient.name,locale)).filter(Boolean)
    : [];
  const address=officialRecipients.length?esc(t.recipients)+': '+esc(officialRecipients.join('; '))
    : citizen&&['reply','notification','return','special'].includes(d.kind)?esc(t.recipient)+': '+esc(citizen):'';
  const citationMarker=index=>'<a href="#'+esc(citationPrefix)+'-'+(index+1)+'" data-response-citation-link aria-label="'+esc(t.source+' '+(index+1))+'">['+(index+1)+']</a>';
  const body=SECTION_IDS.map(section=>{
    if(!d.sections[section].trim())return '';
    const markers=d.citations.map((citation,index)=>citation.section===section?citationMarker(index):'').filter(Boolean).join(' ');
    return '<div class="rxc-letter-block">'+paragraphHTML(d.sections[section])+(markers?'<div class="rxc-letter-citations">'+markers+'</div>':'')+'</div>';
  }).join('');
  const citations=d.citations.length?'<section class="rxc-letter-annex"><h2>'+esc(t.annex)+'</h2><ol>'+d.citations.map((citation,index)=>{
    const source=citationSource(citation,available),url=safeURL(source?.url);
    return '<li id="'+esc(citationPrefix)+'-'+(index+1)+'" tabindex="-1"><strong>'+esc(sourceTitle(citation,available,t))+'</strong><span class="rxc-letter-source-section">'+esc(t.section[citation.section])+'</span>'+(source?.locator?'<span class="rxc-letter-unit">'+esc(local(source.locator,locale))+'</span>':'')+(citation.quote?'<blockquote>'+esc(citation.quote)+'</blockquote>':'')+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(url)+'</a>':'')+'</li>';
  }).join('')+'</ol></section>':'';
  const orders=d.orders.length?'<section class="rxc-letter-annex"><h2>'+esc(t.orders)+'</h2>'+d.orders.map((order,index)=>{
    const markers=d.citations.map((citation,n)=>order.citationIds.includes(citation.id)?citationMarker(n):'').filter(Boolean).join(' ');
    return '<article class="rxc-letter-order"><h3>'+String(index+1)+'. '+esc(order.issue||t.order)+'</h3><dl><div><dt>'+esc(t.operation)+'</dt><dd>'+esc(t.orderKinds[order.kind])+'</dd></div>'+(order.recipientIds.length?'<div><dt>'+esc(t.recipients)+'</dt><dd>'+esc(order.recipientIds.map(id=>recipientLabel(id,recipients,locale)).join('; '))+'</dd></div>':'')+(order.dueDate?'<div><dt>'+esc(t.due)+'</dt><dd>'+esc(dateLabel(order.dueDate,locale))+'</dd></div>':'')+(markers?'<div><dt>'+esc(t.orderEvidence)+'</dt><dd>'+markers+'</dd></div>':'')+'</dl>'+paragraphHTML(order.instruction)+(order.expectedResult?'<p><strong>'+esc(t.expected)+': </strong>'+esc(order.expectedResult)+'</p>':'')+'</article>';
  }).join('')+'</section>':'';
  const requisites='<div class="rxc-letter-requisites"><span>'+esc(t.documentDate)+': __.__.____</span><span>'+esc(t.documentNumber)+' ____________</span></div>';
  const signature='<footer class="rxc-letter-signature"><span>'+esc(t.signer)+'</span><span>________________<small>'+esc(t.signature)+'</small></span><span>'+esc(t.signerName)+'</span></footer>';
  const specialist=string(specialistName,200).trim();
  const preparedBy=specialist?'<p class="rxc-letter-specialist"><strong>'+esc(t.specialist)+'</strong>: '+esc(specialist)+'</p>':'';
  return '<div class="rxc-project-mark">'+esc(t.project)+'</div><article class="rxc-letter" lang="'+language(locale)+'"><header class="rxc-letter-head"><div class="rxc-letter-issuer">'+esc(issuer)+'</div><div class="rxc-letter-rule"></div><div class="rxc-letter-meta"><span>'+esc(t.kinds[d.kind])+'</span>'+(address?'<span>'+address+'</span>':'')+'</div>'+requisites+'</header>'+(d.subject?'<h1 class="rxc-letter-subject">'+esc(d.subject)+'</h1>':'')+'<div class="rxc-letter-body">'+(body||'<p class="rxc-letter-empty">'+esc(t.draftEmpty)+'</p>')+'</div>'+signature+preparedBy+orders+citations+'</article>';
}

export function correspondencePreviewView(options={}) {
  const t=copy[language(options.locale)];
  const edit=options.disabled?'':'<div>'+button(t.edit,'edit',{icon:'arrow'})+'</div>';
  return '<section class="rxc-preview" data-correspondence-preview><div class="rxc-preview-toolbar">'+edit+'<div>'+button(t.print,'print',{icon:'print'})+button(t.download,'download',{icon:'download'})+'</div></div><div class="rxc-preview-stage">'+letterContent(options)+'</div></section>';
}

export function restoreCorrespondenceControl(value) {
  const source=value&&typeof value==='object'?value:{},seen=new Set(),statuses=[];
  for(const row of Array.isArray(source.statuses)?source.statuses:[]) {
    const issueId=string(row?.issueId,100);
    if(!issueId||seen.has(issueId))continue;
    const status=CONTROL_STATUSES.includes(row.status)?row.status:'';
    const evidenceSourceIds=ids(row.evidenceSourceIds);
    if(!status&&!evidenceSourceIds.length)continue;
    seen.add(issueId);
    statuses.push({issueId,status,evidenceSourceIds});
    if(statuses.length===20)break;
  }
  return {text:string(source.text),statuses};
}

export function reduceCorrespondenceControl(value,action={}) {
  const draft=restoreCorrespondenceControl(value);
  if(action.type==='text')return {...draft,text:string(action.value)};
  const issueId=string(action.issueId,100);
  if(!issueId)return draft;
  const row=draft.statuses.find(item=>item.issueId===issueId)||{issueId,status:'',evidenceSourceIds:[]};
  if(action.type==='status')row.status=CONTROL_STATUSES.includes(action.value)?action.value:'';
  if(action.type==='evidence'&&string(action.sourceId,240)) {
    const remaining=row.evidenceSourceIds.filter(id=>id!==action.sourceId&&!SOURCE_KINDS.some(kind=>id===kind+':'+action.sourceId));
    row.evidenceSourceIds=action.selected?ids([...remaining,action.sourceId]):remaining;
  }
  if(!draft.statuses.includes(row))draft.statuses.push(row);
  return restoreCorrespondenceControl(draft);
}

export function correspondenceControlSubmission(value) {
  const draft=restoreCorrespondenceControl(value);
  return {...draft,statuses:draft.statuses.filter(row=>row.status)};
}

export function correspondenceControlOmissions(draft,issues,sources) {
  const rows=restoreCorrespondenceControl(draft).statuses;
  const available=publicSources(sources);
  return (Array.isArray(issues)?issues:[]).filter(issue=>issue?.id).flatMap(issue=>{
    const row=rows.find(item=>item.issueId===issue.id);
    const omission=(kind)=>({kind,issueId:issue.id,title:issue.title,focusId:'response-'+kind+'-'+issue.id});
    return [
      ...(!row?.status?[omission('status')]:[]),
      ...(available.length&&!available.some(source=>row?.evidenceSourceIds.some(id=>id===source.id||id===source.key))?[omission('evidence')]:[]),
    ];
  });
}

/** New facts are supplied by the server only after the first decision is fixed. */
export function correspondenceControlView({draft,correspondence,issues,intro='',sources=[],locale='ru',disabled=false}={}) {
  const d=restoreCorrespondenceControl(draft),t=copy[language(locale)],available=publicSources(sources,locale),off=disabled?' disabled':'';
  const rows=Array.isArray(issues)?issues:(Array.isArray(correspondence?.orders)?correspondence.orders.map(order=>({id:order.id,title:order.issue||order.instruction})):[]);
  const issueRows=rows.filter(row=>row&&typeof row.id==='string').slice(0,20).map(issue=>{
    const status=d.statuses.find(row=>row.issueId===issue.id),id=esc(issue.id);
    const options=CONTROL_STATUSES.map(value=>'<option value="'+value+'"'+(status?.status===value?' selected':'')+'>'+esc(t.statuses[value])+'</option>').join('');
    const statusField='<label class="rxa-field"><span>'+esc(t.issueStatus)+'</span><select data-response-status-field="status" data-issue-id="'+id+'" data-focus="response-status-'+id+'"'+off+'><option value="">'+esc(t.statusChoose)+'</option>'+options+'</select></label>';
    const sourceOptions=available.map(source=>{
      const checked=status?.evidenceSourceIds.some(value=>value===source.id||value===source.key);
      return '<label class="rxc-recipient-choice"><input type="checkbox" data-response-status-evidence="'+esc(source.id)+'" data-issue-id="'+id+'" data-focus="response-evidence-'+id+'-'+esc(source.key)+'"'+(checked?' checked':'')+off+'><span>'+esc(source.title)+'</span></label>';
    }).join('');
    const evidenceField=sourceOptions?'<fieldset class="rxc-control-sources" tabindex="-1" data-focus="response-evidence-'+id+'"><legend>'+esc(t.controlEvidence)+'</legend><div>'+sourceOptions+'</div></fieldset>':'';
    return '<section class="rxc-control-issue"><h3>'+esc(local(issue.title,locale)||t.issue)+'</h3><div class="rxc-control-fields">'+statusField+evidenceField+'</div></section>';
  }).join('');
  const event=local(intro,locale);
  return '<section class="rxc-control" data-correspondence-control>'+(event?'<div class="rxc-control-event">'+glyph('paper')+'<div><h3>'+esc(t.event)+'</h3>'+paragraphHTML(event)+'</div></div>':'')+(issueRows?'<div class="rxc-control-issues">'+issueRows+'</div>':'')+'<label class="rxa-field rxc-control-text"><span>'+esc(t.controlText)+'</span><textarea data-response-control-field="text" data-focus="response-control-text" maxlength="'+TEXT_LIMIT+'" rows="7" aria-describedby="rxc-control-hint"'+off+'>'+esc(d.text)+'</textarea><small id="rxc-control-hint">'+esc(t.controlHint)+'</small></label></section>';
}

/** Translate only presentation fields. Original student and evidence passages stay verbatim. */
export function presentCorrespondenceFeedback(feedback,{locale='ru',issues=[],sources=[],actions=[],recipients=[]}={}) {
  if(!feedback?.correspondence)return feedback;
  const t=copy[language(locale)],terms=t.controlFields,protocol=feedback.correspondence;
  const citations=[...(protocol.citations||[]),...(protocol.initial?.citations||[]),...(protocol.control?.citations||[])];
  const issueLabels=new Map((issues||[]).map(issue=>[issue.id,local(issue.title,locale)||t.issue]));
  const sourceLabels=new Map(publicSources(sources,locale).flatMap(source=>[[source.key,source.title],[source.id,source.title]]));
  for(const citation of citations)if(citation.title)sourceLabels.set('citation:'+citation.id,local(citation.title,locale));
  const actionLabels=new Map((actions||[]).filter(action=>action.label).map(action=>[action.id,local(action.label,locale)]));
  for(const authority of [...RECEPTION_AUTHORITIES,...(recipients||[])])actionLabels.set(authority.id,local(authority.label??authority.name,locale));
  const statusPair=/['"]?\b([a-z][a-z0-9_-]*)['"]?\s*[:：=]\s*['"]?(pending|resolved|referred)\b['"]?/gi;
  const pair=(_,id,state)=>(issueLabels.get(id)||t.issue)+': '+t.statuses[state.toLowerCase()];
  const fields={
    evidenceSourceIds:terms.evidence,eligibleEvidenceIds:terms.evidence,sourceIds:terms.source,documentIds:terms.source,
    citationIds:t.sources,citationId:t.source,ruleId:terms.rule,issueId:t.issue,recipientIds:t.recipients,dueDate:t.due,
    factIds:t.section.facts,knownFactIds:t.section.facts,revealedFactIds:t.section.facts,openedDocumentIds:t.sources,
    releasedDocumentIds:t.sources,sourceId:t.source,maxPoints:terms.reason,rubricVersion:terms.reason,
    expectedResult:t.expected,knownQuestion:terms.rule,maxLevel:terms.reason,requiresObservedEvidence:terms.evidence,
    caseId:t.matter,caseVersion:t.matter,datePackId:t.matter,criticalRules:terms.rule,acceptablePlans:t.operation,
    initialSubmission:terms.answer,frozenCase:t.matter,operational:terms.reason,sections:terms.section,orders:t.orders,
    statuses:t.issueStatus,nextAction:terms.next,legalBasis:t.section.legalBasis,nextSteps:t.section.nextSteps,
  };
  const fieldPattern=new RegExp('\\b(?:'+Object.keys(fields).join('|')+')\\b','g');
  const prefixedId=/\b(?:certificate|citation|critical-rule|document|dialogue|fact|legal):[a-z0-9][a-z0-9_.:/-]*/gi;
  function prose(value) {
    if(typeof value!=='string')return value;
    return value.replace(statusPair,pair)
      .replace(prefixedId,id=>sourceLabels.get(id)||(id.startsWith('critical-rule:')?terms.rule:terms.source))
      .replace(/\`([a-z0-9_.:/-]+)\`/gi,(_,id)=>t.statuses[id]||sourceLabels.get(id)||actionLabels.get(id)||issueLabels.get(id)||fields[id]||terms.reason)
      .replace(fieldPattern,id=>fields[id])
      .replace(/\b[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+\b/gi,id=>sourceLabels.get(id)||actionLabels.get(id)||issueLabels.get(id)||(id.endsWith('-author-explanation')?terms.rule:id))
      .replace(/\b(?:d\d+|q\d+|(?:msg|order|citation)[_-]?\d+)\b/gi,id=>sourceLabels.get(id)||terms.source);
  }
  function orderQuote(value) {
    const keys={issue:t.issue,kind:t.operation,recipients:t.recipients,instruction:t.instruction,dueDate:t.due,expectedResult:t.expected};
    return value.split('\n').flatMap(line=>{
      if(/^\s*(?:id|citationIds):\s*/.test(line))return [];
      const match=line.match(/^(issue|kind|recipients|instruction|dueDate|expectedResult): *(.*)$/);
      if(!match)return /^order[\w-]*$/i.test(line.trim())?[]:[line];
      const [, key, raw]=match;
      if(!raw)return [];
      const label=key==='kind'?t.orderKinds[raw]||'':key==='recipients'
        ?raw.split('; ').map(item=>actionLabels.get(item.split(' (')[0])||item.match(/^[a-z0-9_.:/-]+ \((.+)\)$/i)?.[1]||'').filter(Boolean).join(', ')
        :raw;
      return label?[keys[key]+': '+label]:[];
    }).join('\n').trim();
  }
  function finding(value,legacy) {
    if(!value)return value;
    let quote=value.quote;
    // Older reviews can quote the server's serialized statuses or assignments.
    if(legacy&&quote&&value.section==='statuses')quote=quote.replace(statusPair,pair).replace(/^\s*(pending|resolved|referred)\s*$/i,(_,id)=>t.statuses[id.toLowerCase()]);
    if(legacy&&quote&&value.section==='orders')quote=actionLabels.get(quote)||t.orderKinds[quote]||orderQuote(quote);
    if(legacy&&quote&&value.section==='kind')quote=t.kinds[quote]||quote;
    return {...value,quote,explanation:prose(value.explanation)};
  }
  function phase(value) {
    if(!value)return value;
    const legacy=value.displayFormat!==1;
    return {...value,summary:prose(value.summary),
      criteria:(value.criteria||[]).map(row=>({...row,reason:prose(row.reason),findings:(row.findings||[]).map(item=>finding(item,legacy))})),
      criticalErrors:(value.criticalErrors||[]).map(row=>({...row,finding:finding(row.finding,legacy)}))};
  }
  return {...feedback,explanation:prose(feedback.explanation),
    correspondence:protocol.phase==='complete'?{...protocol,initial:phase(protocol.initial),control:phase(protocol.control)}:phase(protocol)};
}

export const correspondencePrintCSS = [
  '@page{size:A4;margin:18mm 18mm 20mm 24mm}',
  '*{box-sizing:border-box}body{margin:0;background:#fff;color:#182d41;font:11.5pt/1.6 Georgia,"Times New Roman",serif}',
  '.rxc-project-mark{font:9pt/1.4 Arial,sans-serif;color:#617286;letter-spacing:.09em;text-transform:uppercase;margin:0 0 12mm}',
  '.rxc-letter{max-width:180mm;margin:auto;overflow-wrap:anywhere}.rxc-letter-issuer{max-width:130mm;font:600 14pt/1.4 Arial,sans-serif;color:#183b58}',
  '.rxc-letter-rule{height:2px;background:#34668e;margin:7mm 0 4mm}.rxc-letter-meta{display:flex;justify-content:space-between;gap:8mm;font:9pt/1.5 Arial,sans-serif;color:#5a6a7b}',
  '.rxc-letter-subject{font:600 13pt/1.5 Arial,sans-serif;margin:10mm 0 7mm}.rxc-letter-body{margin-top:8mm}.rxc-letter-block{margin:0 0 5mm}.rxc-letter-block p{margin:0 0 4mm;white-space:normal}',
  '.rxc-letter-citations{font:9pt Arial,sans-serif;text-align:right}.rxc-letter a{color:#235a81;text-decoration:none}.rxc-letter-empty{color:#6b7782;font-style:italic}',
  '.rxc-letter-annex{margin-top:12mm;padding-top:6mm;border-top:1px solid #b6c8d6;font:10pt/1.55 Arial,sans-serif;break-before:auto}.rxc-letter-annex h2{font-size:12pt;margin:0 0 5mm}.rxc-letter-annex ol{padding-left:6mm}.rxc-letter-annex li{margin:0 0 5mm;break-inside:avoid}.rxc-letter-source-section,.rxc-letter-unit{display:block;color:#627485;font-size:9pt}.rxc-letter-annex blockquote{margin:2mm 0;padding-left:4mm;border-left:2px solid #bacddd;white-space:pre-wrap}.rxc-letter-annex a{display:block;font-size:8pt;overflow-wrap:anywhere}',
  '.rxc-letter-requisites{display:flex;gap:12mm;flex-wrap:wrap;margin-top:5mm;font:10pt/1.5 Arial,sans-serif;color:#46596b}.rxc-letter-signature{display:flex;justify-content:space-between;gap:8mm;align-items:flex-end;margin:14mm 0 4mm;font:10pt/1.5 Arial,sans-serif;break-inside:avoid}.rxc-letter-signature small{display:block;text-align:center;font-size:8pt;color:#627485}',
  '.rxc-letter-specialist{margin:0 0 4mm;font:10pt/1.5 Arial,sans-serif;overflow-wrap:anywhere;break-inside:avoid}',
  '.rxc-letter-order{margin-bottom:6mm;break-inside:avoid}.rxc-letter-order h3{font-size:10.5pt;margin:0 0 3mm}.rxc-letter-order dl{margin:0 0 3mm}.rxc-letter-order dl div{display:grid;grid-template-columns:42mm 1fr;gap:4mm}.rxc-letter-order dt{color:#526575}.rxc-letter-order dd{margin:0}.rxc-letter-order p{margin:2mm 0}',
  '@media screen{body{padding:32px;background:#edf2f6}.rxc-project-mark{max-width:180mm;margin:0 auto 18px}.rxc-letter{background:white;padding:20mm;box-shadow:0 4px 30px #17324b12;max-width:210mm}body:lang(zh){font-family:"Noto Serif CJK SC","Songti SC",serif}}',
  '@media print{.rxc-letter-block p{orphans:3;widows:3}.rxc-letter-head,.rxc-letter-subject{break-after:avoid}.rxc-project-mark{color:#667585;-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
].join('\n');

/** A self-contained, editable HTML document. It never includes private case data. */
export function correspondencePrintHTML(options={}) {
  const locale=language(options.locale),t=copy[locale],draft=restoreCorrespondence(options.draft);
  return '<!doctype html><html lang="'+locale+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(draft.subject||t.title)+'</title><style>'+correspondencePrintCSS+'</style></head><body lang="'+locale+'">'+letterContent(options)+'</body></html>';
}
export function downloadCorrespondenceHTML(options={}) {
  const owner=options.document||globalThis.document;
  if(!owner?.createElement||typeof Blob==='undefined'||!globalThis.URL?.createObjectURL)return false;
  const blob=new Blob([correspondencePrintHTML(options)],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=owner.createElement('a');
  anchor.href=url;anchor.download='reception-response.html';owner.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
}
export function printCorrespondence(options={}) {
  const owner=options.document||globalThis.document;if(!owner?.createElement)return false;
  const frame=owner.createElement('iframe');frame.title=copy[language(options.locale)].print;frame.className='rxc-print-frame';
  frame.style.cssText='position:fixed;width:1px;height:1px;left:-9999px;top:0;border:0';
  let finished=false,timer;
  const clean=()=>{if(finished)return;finished=true;clearTimeout(timer);frame.remove();};
  frame.addEventListener('load',()=>{
    const target=frame.contentWindow;if(!target){clean();return;}
    target.addEventListener('afterprint',clean,{once:true});
    timer=setTimeout(clean,120000);
    try {target.focus();target.print();}catch{clean();}
  },{once:true});
  frame.srcdoc=correspondencePrintHTML(options);owner.body.append(frame);return true;
}
