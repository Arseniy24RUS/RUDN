import {seminar5ProgressFromWorkspace} from '../../apps/career/assets/seminar-progress.mjs';

/** Course-shell copy. Career indices are deliberately independent of course grades. */
export const CAREER_COPY={
  ru:{title:'Профориентация и государственная служба',lead:'Изучите свои личностные качества и подберите должности по интересующим Вас рабочим задачам.',local:'Ответы сохраняются автоматически.',knowledge:'Тест знаний о государственной службе',knowledgeLead:'40 вопросов · до 5 баллов',loading:'Загружается профориентационный модуль…',failed:'Не удалось загрузить модуль. Проверьте соединение и повторите загрузку.',retry:'Повторить загрузку',native:'Адаптивный подбор должностей',practice:'Профориентация и вакансии',locked:'Сначала разберите требования вакансии',lockedLead:'Пройдите профориентацию, выберите одну вакансию и оцените её требования. Затем откроется тест знаний.',completed:'Профориентация пройдена',startCareer:'Продолжить семинар',openKnowledge:'Открыть тест',knowledgeKind:'Тест',practiceKind:'Семинар'},
  en:{title:'Career guidance and public service',lead:'Explore your personality and find roles through the work you want to do.',local:'Answers are saved automatically.',knowledge:'Public-service knowledge test',knowledgeLead:'40 questions · up to 5 points',loading:'Loading the career-guidance module…',failed:'The module could not be loaded. Check your connection and try again.',retry:'Retry loading',native:'Adaptive role matching',practice:'Career guidance and vacancies',locked:'Review a vacancy’s requirements first',lockedLead:'Complete career guidance, choose one vacancy and assess its requirements to unlock the knowledge test.',completed:'Career guidance completed',startCareer:'Continue the seminar',openKnowledge:'Open test',knowledgeKind:'Test',practiceKind:'Seminar'},
  zh:{title:'职业倾向与公共服务',lead:'了解自己的人格特点，根据感兴趣的工作任务寻找职位。',local:'答案会自动保存。',knowledge:'公务知识测试',knowledgeLead:'40道题 · 最高5分',loading:'正在加载职业倾向模块……',failed:'模块加载失败。请检查网络连接并重试。',retry:'重新加载',native:'自适应职位匹配',practice:'职业倾向与职位',locked:'请先分析一个职位的要求',lockedLead:'完成职业倾向测试，选择一个职位并自评其要求，然后即可参加知识测试。',completed:'职业倾向测试已完成',startCareer:'继续研讨课',openKnowledge:'打开测试',knowledgeKind:'测试',practiceKind:'研讨课'}
};
export const CAREER_ROUTES=new Set(['home','personality','personality-results','preferences','test','sectors','conditions','results','review','directory','compare','seminar','methodology','structure','scenarios','opportunities','workshop','lab','public-service','vacancies']);
export const careerRoute=value=>CAREER_ROUTES.has(value)?value:'home';

const PROGRESS_COPY={
  ru:{
    label:'Этапы семинара', complete:'завершено', locked:'ещё недоступно',
    personality:'Профиль', preferences:'Условия', test:'Интересы',
    results:'Вакансии', review:'Разбор вакансии', knowledge:'Тест знаний'
  },
  en:{
    label:'Seminar steps', complete:'completed', locked:'not available yet',
    personality:'Personality', preferences:'Preferences', test:'Interests',
    results:'Vacancies', review:'Vacancy review', knowledge:'Knowledge test'
  },
  zh:{
    label:'研讨课进度', complete:'已完成', locked:'尚未开放',
    personality:'人格', preferences:'偏好', test:'兴趣',
    results:'职位', review:'职位分析', knowledge:'知识测试'
  }
};

const stageIds=['personality','preferences','test','results','review','knowledge'];
export const CIVIL_SERVICE_KNOWLEDGE_MODE='civil-service-knowledge-v1';

export function bindCareerProgress(nav,{activitySlug,getLocale}){
  let previous='';
  const updateHeight=()=>{
    if(nav.isConnected){
      nav.ownerDocument.documentElement.style.setProperty('--career-progress-height',`${Math.ceil(nav.getBoundingClientRect().height)}px`);
    }
  };
  const ResizeObserver=nav.ownerDocument.defaultView?.ResizeObserver;
  if(ResizeObserver){
    const observer=new ResizeObserver(()=>{
      if(nav.isConnected)updateHeight();
      else observer.disconnect();
    });
    observer.observe(nav);
  }
  return progress=>{
    const language=getLocale();
    const copy=PROGRESS_COPY[language]||PROGRESS_COPY.ru;
    const {stage='personality',personalityComplete,preferencesComplete,careerComplete,reviewAvailable,reviewComplete,knowledgeComplete}=progress;
    const complete=[personalityComplete,preferencesComplete,careerComplete,reviewAvailable,reviewComplete,knowledgeComplete];
    const available=[true,personalityComplete,preferencesComplete,careerComplete,careerComplete,reviewComplete];
    const key=JSON.stringify([language,stage,complete,available]);
    if(key===previous)return;
    previous=key;
    const focusStage=nav.contains(nav.ownerDocument.activeElement)?nav.ownerDocument.activeElement.dataset.careerStep:null;
    nav.setAttribute('aria-label',copy.label);
    const list=nav.ownerDocument.createElement('ol');
    for(const [index,id] of stageIds.entries()){
      const item=nav.ownerDocument.createElement('li');
      const control=nav.ownerDocument.createElement(available[index]?'a':'button');
      control.className='career-course-step';
      control.dataset.careerStep=id;
      if(complete[index])control.dataset.complete='true';
      if(available[index]){
        const destination=id==='personality'&&personalityComplete?'personality-results':id;
        control.href=`#activity/${activitySlug}/${destination}`;
      }else{
        control.type='button';
        control.disabled=true;
      }
      if(id===stage)control.setAttribute('aria-current','step');
      if(complete[index]||!available[index])control.setAttribute('aria-label',`${copy[id]}, ${complete[index]?copy.complete:copy.locked}`);
      const number=nav.ownerDocument.createElement('span');
      number.className='career-course-step-number';
      number.setAttribute('aria-hidden','true');
      number.textContent=complete[index]?'✓':String(index+1);
      const label=nav.ownerDocument.createElement('span');
      label.textContent=copy[id];
      control.append(number,label);
      item.append(control);
      list.append(item);
    }
    nav.replaceChildren(list);
    updateHeight();
    if(focusStage)nav.querySelector(`[data-career-step="${focusStage}"]`)?.focus({preventScroll:true});
  };
}

export async function readCareerSeminarProgress({backend,owner}={}){
  const durableOwner=owner==='guest'?'guest:career':owner;
  if(!/^(?:student:[^\s]+|teacher:[^\s]+|guest:career)$/.test(durableOwner||''))return seminar5ProgressFromWorkspace(null);
  const scope={owner:durableOwner,activitySlug:'career-workspace',mode:'diagnostic',attemptId:'workspace-v1'};
  const draft=await backend.loadDraft(scope);
  const matches=draft&&Object.entries(scope).every(([key,value])=>draft[key]===value);
  return seminar5ProgressFromWorkspace(matches?draft.state:null);
}

export async function readCareerKnowledgeCompletion({backend,owner,activitySlug}){
  if(backend.localGrades()[activitySlug])return true;
  const durableOwner=owner==='guest'?'guest:civil-service':owner;
  const draft=await backend.loadDraft({owner:durableOwner,activitySlug,mode:CIVIL_SERVICE_KNOWLEDGE_MODE});
  return draft?.owner===durableOwner && draft.activitySlug===activitySlug && draft.mode===CIVIL_SERVICE_KNOWLEDGE_MODE &&
    draft.state?.resultAttempt?.type==='civil-service-knowledge' && draft.state?.civilServiceAttempt?.phase==='completed';
}

const scales=['N','K','A','M','C','E','D','T','I'];
const conditions=['FIELD','SCHEDULE','FORMAL','SECURITY'];
const score=value=>Number.isFinite(value)&&value>=1&&value<=5;
/** Validate a saved diagnostic result in either supported course format. */
export function completedCareerRecord(record){
  if(record?.schemaVersion===3)return completedFunctionalCareerRecord(record);
  return Boolean(record&&record.schema==='rudn-career-result'&&record.schemaVersion===2&&
    typeof record.recordId==='string'&&/^[\w-]{8,80}$/.test(record.recordId)&&!record.recordId.startsWith('demo-')&&
    Number.isFinite(Date.parse(record.createdAt))&&
    ['modelVersion','questionnaireVersion','registryVersion'].every(key=>typeof record[key]==='string'&&record[key])&&
    scales.every(key=>score(record.roleProfile?.raw?.[key]))&&
    conditions.every(key=>Number.isInteger(record.conditions?.[key])&&score(record.conditions[key]))&&
    Array.isArray(record.prioritySectors)&&record.prioritySectors.length===4&&new Set(record.prioritySectors).size===4&&
    Array.isArray(record.lowPrioritySectors)&&record.lowPrioritySectors.length===2&&new Set(record.lowPrioritySectors).size===2&&
    !record.prioritySectors.some(id=>record.lowPrioritySectors.includes(id))&&
    Array.isArray(record.ranking)&&record.ranking.length>=5&&record.ranking.length<=10&&
    new Set(record.ranking.map(item=>item?.authorityId)).size===record.ranking.length&&
    record.ranking.every((item,index)=>item?.rank===index+1&&typeof item.authorityId==='string'&&item.authorityId&&Number.isFinite(item.score)&&item.score>=0&&item.score<=100));
}

/** Functional recommendations have their own completion record. */
export function completedFunctionalCareerRecord(record){
  if(!record||record.schema!=='rudn-career-result'||record.schemaVersion!==3||record.resultKind!=='vacancy-functional'||record.completed!==true)return false;
  if(typeof record.recordId!=='string'||!/^functional-[\w-]{8,80}$/.test(record.recordId)||!Number.isFinite(Date.parse(record.createdAt)))return false;
  if(!['functional-1.0.0','functional-2.0.0'].includes(record.modelVersion)||!['questionnaireVersion','registryVersion'].every(key=>typeof record[key]==='string'&&record[key]))return false;
  if(record.modelVersion==='functional-2.0.0'&&record.featureBasis!=='published-source-content')return false;
  const functionalV2=record.modelVersion==='functional-2.0.0',minimum=functionalV2?43:32,maximum=functionalV2?55:44,coreCount=functionalV2?31:20;
  if(!Number.isInteger(record.answerCount)||record.answerCount<minimum||record.answerCount>maximum||!Number.isInteger(record.informativeAnswers)||record.informativeAnswers<0||record.informativeAnswers>record.answerCount)return false;
  if(!Array.isArray(record.answeredQuestionIds)||record.answeredQuestionIds.length!==record.answerCount||new Set(record.answeredQuestionIds).size!==record.answerCount||record.answeredQuestionIds.some(id=>typeof id!=='string'||!/^[a-z0-9_-]{2,100}$/i.test(id)))return false;
  if(!Array.isArray(record.broadQuestionIds)||record.broadQuestionIds.length!==coreCount||new Set(record.broadQuestionIds).size!==coreCount||record.broadQuestionIds.some(id=>!record.answeredQuestionIds.includes(id)))return false;
  if(!Array.isArray(record.regionIds)||record.regionIds.length>89||new Set(record.regionIds).size!==record.regionIds.length||record.regionIds.some(id=>!/^ru-\d{2}$/.test(id)))return false;
  if(!['specialist','leadership','all'].includes(record.responsibilityPreference))return false;
  if(!['matched','no-preference','no-matches'].includes(record.resultStatus)||!Array.isArray(record.ranking)||record.ranking.length>5||new Set(record.ranking.map(row=>row?.vacancyId)).size!==record.ranking.length)return false;
  if((record.resultStatus==='matched')!==(record.ranking.length>0))return false;
  return record.ranking.every((row,index)=>row&&row.rank===index+1&&typeof row.vacancyId==='string'&&row.vacancyId&&typeof row.title==='string'&&row.title&&typeof row.employerName==='string'&&Number.isFinite(row.score)&&row.score>=0&&row.score<=100&&
    (!record.regionIds.length||record.regionIds.includes(row.regionId))&&(record.responsibilityPreference==='all'||row.responsibilityLevel===record.responsibilityPreference)&&typeof row.sourceURL==='string'&&/^https?:\/\//.test(row.sourceURL));
}

export async function readCareerCompletion({backend,owner,attempts}={}){
  const durableOwner=owner==='guest'?'guest:career':owner;
  if(!/^(?:student:|teacher:|guest:career$)/.test(durableOwner||''))return null;
  const belongs=attempt=>owner.startsWith('student:')&&attempt?.studentKey===owner.slice(8)&&
    attempt.activitySlug==='career-diagnostic'&&attempt.type==='career-diagnostic'&&attempt.recordGrade===false&&completedCareerRecord(attempt.career);
  if(Array.isArray(attempts)){
    const saved=attempts.find(belongs);
    if(saved)return saved.career;
  }
  const draft=await backend.loadDraft({owner:durableOwner,activitySlug:'career-diagnostic',mode:'diagnostic'});
  if(draft?.owner===durableOwner&&draft.activitySlug==='career-diagnostic'&&completedCareerRecord(draft.state?.record))return draft.state.record;
  if(attempts===undefined&&owner.startsWith('student:')){
    const saved=(await backend.getAttempts(owner.slice(8))).find(belongs);
    if(saved)return saved.career;
  }
  return null;
}
