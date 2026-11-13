import {readFileSync} from 'node:fs';

// The expected findings stay in Functions. The browser receives only the
// explicit safe projection below, never a rubric or the control-event answer.
const bank=JSON.parse(readFileSync(new URL('./correspondence-profiles.json',import.meta.url),'utf8'));
const clone=value=>value==null?value:structuredClone(value);
const caseIdOf=value=>typeof value==='string'?value:String(value?.template?.id||value?.caseId||value?.id||'');
const localized=(value,locale='ru')=>typeof value==='string'?value:value?.[locale]||value?.ru||'';
export const correspondenceProfileMeta=Object.freeze(clone(bank.meta));

function isoDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:'';
}

/** Resolve only dates belonging to this frozen dossier, never today's date. */
function bindFrozenDossier(profile,c,locale){
  const provenance=c.provenance;
  if(!provenance||provenance.sourceCaseId!==profile.caseId||provenance.sourceSHA256!==profile.provenance.sourceSHA256||provenance.sourceContentVersion!==profile.authoredContentVersion)return null;
  if(!profile.authoredDatePackIds.includes(c.datePackId))return null;
  const unresolved=new Set(),conflicts=new Set();
  const dateValues=provenance?.dateValues||{};
  const events=c.public?.assessment?.calendar?.events||[];
  function token(key){
    const name=key.replace(/ISO$/,''),packDate=isoDate(dateValues[name+'ISO']);
    const eventDate=isoDate(events.find(event=>event.id===name)?.date);
    if(packDate&&eventDate&&packDate!==eventDate){conflicts.add(key);return '';}
    const date=eventDate||packDate;
    if(date)return /ISO$/.test(key)?date:date.split('-').reverse().join('.');
    // Non-date authored substitutions are only taken from the frozen provenance.
    if(Object.hasOwn(dateValues,key)&&!/ISO$/.test(key))return String(dateValues[key]);
    unresolved.add(key);
    return `дата события «${name}» из зафиксированных материалов дела`;
  }
  function resolveTree(value){
    if(typeof value==='string')return value.replace(/\{\{([a-z][a-z0-9]*)\}\}/gi,(_match,key)=>token(key));
    if(Array.isArray(value))return value.map(resolveTree);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,resolveTree(item)]));
    return value;
  }
  const result=resolveTree(profile);
  if(conflicts.size||unresolved.size)return null;
  result.role={title:localized(c.public?.role?.title,locale)||result.role.title,text:localized(c.public?.role?.text,locale)||result.role.text};
  for(const issue of result.issues)for(const claim of issue.claims){
    const fact=c.facts?.find(fact=>fact.id===claim.id);
    if(!fact)continue;
    const text=localized(fact.text,locale);
    if(text){claim.text=text;claim.statement=text;claim.frozen=true;claim.knowledge=fact.knowledge;}
  }
  const actionText=id=>localized(c.public?.actions?.find(action=>action.id===id)?.label,locale);
  for(const action of [...result.expectedActions,...result.forbiddenActions])action.text=actionText(action.id)||action.text;
  const frozenCalendar={
    ...result.calendar,events:clone(events),
    frozenDeadline:c.rubric?.deadline||null,
    authoredRule:clone(c.rubric?.authored?.calendar||null),
    datePackId:c.datePackId||null
  };
  result.calendar=frozenCalendar;
  result.criteria.nextSteps.calendar=clone(frozenCalendar);
  if(c.followup){
    result.control.prompt=localized(c.followup.intro,locale);
    const choice=c.followup.options?.find(option=>option.id===c.followup.correct);
    result.control.expectedOutcomes=[localized(choice?.label,locale),localized(c.followup.explanation,locale)].filter(Boolean);
    result.control.forbiddenOutcomes=(c.followup.options||[]).filter(option=>option.id!==c.followup.correct).map(option=>({id:option.id,text:localized(option.label,locale)}));
  }
  result.provenance.frozenSourceMatched=!!provenance;
  result.dateBinding={datePackId:c.datePackId||null,usesFrozenDossier:true,unresolvedTokenKeys:[...unresolved],concreteDatesMustComeFromFrozenDossier:true};
  return result;
}

export function getCorrespondenceProfile(caseIdOrTemplate,locale='ru'){
  const profile=clone(bank.profiles[caseIdOf(caseIdOrTemplate)]||null);
  if(!profile)return null;
  if(caseIdOrTemplate&&typeof caseIdOrTemplate==='object'&&caseIdOrTemplate.public)return bindFrozenDossier(profile,caseIdOrTemplate,locale);
  return profile;
}
export const privateCorrespondenceProfile=getCorrespondenceProfile;

const COPY={
  ru:{
    title:'Проект документа по обращению',internalTitle:'Служебный материал',issuer:'Подразделение по работе с обращениями',
    task:'Подготовьте связный проект по материалам этого дела. Обоснуйте существенные выводы ссылками на изученные документы и сведения разговора.',
    internalTask:'Подготовьте служебный материал по поступившим сведениям. Обоснуйте предлагаемые действия материалами дела и определите порядок контроля.',
    facts:'Установленные обстоятельства',legalBasis:'Правовые основания',resolution:'Решение и действия',nextSteps:'Дальнейшие действия и контроль',
    internalFacts:'Основания служебного действия',internalResolution:'Предлагаемые служебные действия',internalNextSteps:'Передача и контроль',
    factsPrompt:'Укажите, что установлено и на какие материалы опирается вывод. Отделите непроверенные сведения.',
    legalBasisPrompt:'Приведите применимую норму и объясните её связь с обстоятельствами и действием.',
    resolutionPrompt:'Сформулируйте результат по поставленным вопросам в пределах своей роли.',
    nextStepsPrompt:'Опишите необходимые дальнейшие действия, адресата, срок и способ проверки результата там, где они требуются.',
    controlPrompt:'После фиксации проекта появится новое событие дела. Сопоставьте его с предметами обращения и определите, что можно завершить и что требует дальнейшей работы.'
  },
  en:{
    title:'Draft case document',internalTitle:'Internal case record',issuer:'Public enquiries department',
    task:'Prepare a coherent draft using this case file. Support material conclusions with the documents and interview information you have examined.',
    internalTask:'Prepare an internal record of the information received. Support proposed actions with case materials and specify follow-up.',
    facts:'Established circumstances',legalBasis:'Legal grounds',resolution:'Decision and actions',nextSteps:'Next steps and follow-up',
    internalFacts:'Grounds for internal action',internalResolution:'Proposed internal actions',internalNextSteps:'Transfer and follow-up',
    factsPrompt:'State what is established and which materials support it. Distinguish information that remains unverified.',
    legalBasisPrompt:'Identify the applicable provision and explain how it relates to the circumstances and proposed action.',
    resolutionPrompt:'State the outcome for the matters raised within your assigned authority.',
    nextStepsPrompt:'Where required, identify further actions, the recipient, the deadline and how the result will be checked.',
    controlPrompt:'A new case event will appear after you submit the draft. Compare it with each subject and decide what can be completed and what still requires work.'
  },
  zh:{
    title:'来访事项文书草稿',internalTitle:'内部事项记录',issuer:'来访事项受理部门',
    task:'根据本事项材料拟定完整文书。使用已查阅的文件和交谈信息支持重要结论。',
    internalTask:'根据收到的信息拟定内部记录。依据事项材料说明拟采取的措施及后续监督。',
    facts:'已查明的情况',legalBasis:'法律依据',resolution:'决定与措施',nextSteps:'后续措施与监督',
    internalFacts:'内部措施的依据',internalResolution:'拟采取的内部措施',internalNextSteps:'转交与监督',
    factsPrompt:'说明已查明的事实及其材料依据，并区分尚未核实的信息。',
    legalBasisPrompt:'列明适用规定，并解释其与事实及拟采取措施的关系。',
    resolutionPrompt:'在本岗位职权范围内说明各项诉求的处理结果。',
    nextStepsPrompt:'需要时，说明后续措施、接收方、期限及核验结果的方法。',
    controlPrompt:'提交草稿后将出现新的事项信息。请分别检查各项诉求，判断哪些可以完成，哪些仍需继续处理。'
  }
};

/** Public context only. Correct kinds, findings, deadlines and future events are private. */
export function publicCorrespondenceProfile(caseIdOrTemplate,locale='ru'){
  const profile=bank.profiles[caseIdOf(caseIdOrTemplate)];
  if(!profile)return null;
  const suppliedProvenance=typeof caseIdOrTemplate==='object'?caseIdOrTemplate?.provenance:null;
  if(typeof caseIdOrTemplate==='object'&&caseIdOrTemplate?.public&&!getCorrespondenceProfile(caseIdOrTemplate,locale))return null;
  if(suppliedProvenance&&(suppliedProvenance.sourceCaseId!==profile.caseId||suppliedProvenance.sourceSHA256!==profile.provenance.sourceSHA256||suppliedProvenance.sourceContentVersion!==profile.authoredContentVersion))return null;
  const language=String(locale).toLowerCase().split(/[-_]/)[0];
  const copy=COPY[language]||COPY.ru;
  // The authored anonymous task explicitly has no individual addressee.
  // Other document types remain the student's choice, not a leaked answer.
  const internal=profile.caseId==='anonymous-danger';
  const title=internal?copy.internalTitle:copy.title;
  const frozen=caseIdOrTemplate&&typeof caseIdOrTemplate==='object'?caseIdOrTemplate:null;
  const roleTitle=localized(frozen?.public?.role?.title,language)||profile.role.title;
  const caseTitle=localized(frozen?.public?.title,language)||profile.title;
  // Most role titles name a job or a generic reception office, not an issuer.
  // Preserve an explicitly named institution only when the authored title is one.
  const explicitIssuer=/^Аппарат Совета депутатов муниципального округа\s+\S/.test(profile.role.title);
  const issuer={name:explicitIssuer?roleTitle:copy.issuer,kind:explicitIssuer?'authored-institution':'neutral-label',source:explicitIssuer?'template.role.title':null};
  const sections={
    facts:internal?copy.internalFacts:copy.facts,legalBasis:copy.legalBasis,
    resolution:internal?copy.internalResolution:copy.resolution,
    nextSteps:internal?copy.internalNextSteps:copy.nextSteps
  };
  return {
    version:1,profileVersion:bank.meta.profileVersion,caseId:profile.caseId,
    kind:internal?'internal':'reply',kindLabel:title,documentKind:internal?'internal':'correspondence',
    title,task:internal?copy.internalTask:copy.task,
    caseTitle,
    issues:profile.issues.map(issue=>({id:issue.id,title:issue.id==='main'?caseTitle:issue.title})),
    sections,sectionPrompts:{facts:copy.factsPrompt,legalBasis:copy.legalBasisPrompt,resolution:copy.resolutionPrompt,nextSteps:copy.nextStepsPrompt},
    role:{title:roleTitle},
    issuer,origin:clone(issuer),
    individualReplyRequired:profile.response.individualReplyRequired,
    controlPrompt:copy.controlPrompt,
    locale:COPY[language]?language:'ru'
  };
}
