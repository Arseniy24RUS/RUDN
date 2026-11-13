/** Local/CI fixture only. It adapts a public authored story to the private schema.
 * It is not the live Firebase catalogue; its scripted review does not test AI quality.
 * Never seed this fixture into Firebase or deploy it as a production case bank. */
import {readFile} from 'node:fs/promises';
import {validateCase} from '../firebase/functions/reception-ai/schema.mjs';
import {createSyntheticReceptionCases} from './reception-ai-qa-cases.mjs';
const T=text=>({ru:text,en:text,zh:text});
export async function createCorrespondenceQACase(){
  const source=JSON.parse(await readFile(new URL('../site/apps/reception/content/cases/several-repair-and-complaint.json',import.meta.url),'utf8')).template;
  const c=createSyntheticReceptionCases()[2];c.id=source.id;c.familyId='several-issues';
  c.public.title=T(source.title);c.public.opening=T(source.opening);c.public.role={title:T(source.role.title),text:T(source.role.text)};
  c.public.citizen.name=T(source.citizen.name);
  c.public.date='2026-11-12';
  const dates={observed:'09.11.2026',sent:'10.11.2026',received:'11.11.2026',registered:'12.11.2026'};
  c.facts=source.questions.map(q=>({id:q.id,text:T(q.fact),initial:true,knowledge:'direct',
    documentIds:source.documents.filter(doc=>doc.text===q.fact).map(doc=>doc.id)}));
  c.documents=source.documents.map(doc=>({id:doc.id,title:T(doc.title),type:T(doc.type),
    text:T(doc.text.replace(/\{\{(\w+)\}\}/g,(_all,key)=>dates[key]||key)),initial:true,
    factIds:source.questions.filter(q=>q.fact===doc.text).map(q=>q.id)}));
  c.public.actions=source.actions.map(action=>({id:action.id,label:T(action.title)}));
  c.rubric.requiredActionIds=source.actions.filter(action=>action.good).map(action=>action.id);
  c.rubric.forbiddenActionIds=source.actions.filter(action=>!action.good).map(action=>action.id);
  c.rubric.criticalActionIds=['b1'];c.rubric.requiredFactIds=source.questions.filter(q=>q.essential).map(q=>q.id);
  c.rubric.evidenceGroups=[['d1','d2']];c.rubric.explanation=T(source.factTask.explain);
  c.rubric.legal={number:'59',articles:['8']};c.rubric.deadline='2026-11-19';
  const r=c.rubric.authored;
  r.evidenceSets=[['d1','d2']];r.order=source.order;r.rightsAction=source.rightsAction;
  r.criticalRules=source.criticalRules.map(({id,kind,knownQuestion})=>({id,kind,...(knownQuestion?{knownQuestion}:{})}));
  r.decisionPlans=[{id:'two-issues',routes:c.rubric.routeIds,requiredActions:c.rubric.requiredActionIds,order:source.order}];
  r.calendar={anchor:'registered',rule:'calendar7',start:'exclude_anchor',acceptedShifts:['no_shift']};
  c.public.assessment.calendar.events=[
    {id:'sent',label:T('Отправлено'),date:'2026-11-10'},
    {id:'received',label:T('Поступило'),date:'2026-11-11'},
    {id:'registered',label:T('Зарегистрировано'),date:'2026-11-12'},
  ];
  c.followup={intro:T(source.followup.intro),options:source.followup.options.map(o=>({id:o.id,label:T(o.text)})),
    correct:source.followup.correct,explanation:T(source.followup.explain),success:T(source.followup.success),failure:T(source.followup.failure)};
  return validateCase(c);
}
const profile={
  issues:[{id:'repair',title:'Восстановление дорожки'},{id:'complaint',title:'Проверка прежнего ответа'}],
  acceptedKinds:['reply','internal'],criticalRules:[{id:'b1',description:'Не передавать окончательное рассмотрение И-7.'}],
  control:{expectedStatuses:[{issueId:'repair',allowedStatuses:['resolved']},{issueId:'complaint',allowedStatuses:['pending']}],
    criticalRules:[{id:'close-complaint',description:'Ремонт не завершает проверку прежнего ответа.'}]},
};
export const correspondenceQAProfiles={private:()=>structuredClone(profile),public:c=>({version:1,caseId:c.id,kind:'reply',title:'Проект по делу',
  issues:profile.issues.map(({id,title})=>({id,title})),sections:{facts:'Обстоятельства',legalBasis:'Правовые основания',resolution:'Решение',nextSteps:'Контроль'}})};

export function explicitQAReview(context,{initialLevel=4,controlLevel=4}={}){
  return {version:1,phase:context.phase,criteria:context.criteria.map(row=>{
    const level=Math.min(context.phase==='initial'?initialLevel:controlLevel,row.maxLevel);
    const section=context.phase==='initial'?row.id:row.id==='status'?'statuses':'control';
    return {id:row.id,level,reason:'Заданный результат локальной проверки.',findings:[
      ...(level?[{type:'supported',section,quote:context.sections[section],sourceIds:[row.eligibleEvidenceIds[0]||'case-author-explanation'],explanation:'Содержательное соответствие в сценарии теста.'}]:[]),
      ...(level<4?[{type:'missing',section,quote:'',sourceIds:['case-author-explanation'],explanation:'Заданный тестом содержательный пропуск.'}]:[]),
    ]};
  }),criticalErrors:[],summary:'Локальная проверка контракта. Не оценка реальной моделью.'};
}
