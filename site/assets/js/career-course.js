/** Course-shell copy. Career indices are deliberately independent of course grades. */
export const CAREER_COPY={
  ru:{title:'Профориентация и государственная служба',lead:'Ответьте на вопросы о своих интересах, затем изучите подходящие органы власти и вакансии.',local:'Ответы сохраняются автоматически.',knowledge:'Тест знаний о государственной службе',knowledgeLead:'40 вопросов · до 5 баллов',loading:'Загружается профориентационный модуль…',failed:'Не удалось загрузить модуль. Проверьте соединение и повторите загрузку.',retry:'Повторить загрузку',native:'27 вопросов о профессиональных интересах',practice:'Профориентация и вакансии',locked:'Сначала пройдите профориентацию',lockedLead:'После получения результата профориентации здесь откроется тест знаний о государственной службе.',completed:'Профориентация пройдена',startCareer:'Пройти профориентацию',openKnowledge:'Открыть тест',knowledgeKind:'Тест',practiceKind:'Семинар'},
  en:{title:'Career guidance and public service',lead:'Answer questions about your interests, then explore matching public authorities and vacancies.',local:'Answers are saved automatically.',knowledge:'Public-service knowledge test',knowledgeLead:'40 questions · up to 5 points',loading:'Loading the career-guidance module…',failed:'The module could not be loaded. Check your connection and try again.',retry:'Retry loading',native:'27 questions about professional interests',practice:'Career guidance and vacancies',locked:'Complete career guidance first',lockedLead:'The public-service knowledge test unlocks after you receive your career-guidance result.',completed:'Career guidance completed',startCareer:'Complete career guidance',openKnowledge:'Open test',knowledgeKind:'Test',practiceKind:'Seminar'},
  zh:{title:'职业倾向与公共服务',lead:'回答关于职业兴趣的问题，然后了解与你匹配的政府机关及其职位。',local:'答案会自动保存。',knowledge:'公务知识测试',knowledgeLead:'40道题 · 最高5分',loading:'正在加载职业倾向模块……',failed:'模块加载失败。请检查网络连接并重试。',retry:'重新加载',native:'27道职业兴趣问题',practice:'职业倾向与职位',locked:'请先完成职业倾向测试',lockedLead:'获得职业倾向结果后，即可参加公务知识测试。',completed:'职业倾向测试已完成',startCareer:'完成职业倾向测试',openKnowledge:'打开测试',knowledgeKind:'测试',practiceKind:'研讨课'}
};
export const CAREER_ROUTES=new Set(['home','test','sectors','conditions','results','directory','compare','seminar','methodology','structure','scenarios','opportunities','workshop','lab','public-service','vacancies']);
export const careerRoute=value=>CAREER_ROUTES.has(value)?value:'home';

const scales=['N','K','A','M','C','E','D','T','I'];
const conditions=['FIELD','SCHEDULE','FORMAL','SECURITY'];
const score=value=>Number.isFinite(value)&&value>=1&&value<=5;
/** Completion is a course prerequisite, never an aptitude score or a grade.
 * Only a saved course result for the current owner can open the assessment.
 */
export function completedCareerRecord(record){
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
