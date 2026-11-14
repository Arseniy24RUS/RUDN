/** Local contract fixtures, not model assessments or a legal answer key.
 * Never seed these submissions into the cloud case catalogue. No network calls.
 */
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {publicWorkbook} from '../firebase/functions/reception-ai/workbook.mjs';
import {calculateWorkbookDeadline} from '../firebase/functions/reception-ai/workbook-calendar.mjs';

const local=(value,locale)=>typeof value==='string'?value:value?.[locale]||value?.ru||'';
const copy={
 ru:{subject:'Локальный проект по материалам дела',legal:'Норма приведена для проверки ссылки на источник.',resolution:'Предлагается проверить материалы в пределах компетенции.',next:'Запросить подтверждение результата и сохранить вопрос на контроле.',issue:'Материалы обращения',instruction:'Запросить и проверить материалы по обращению.',result:'Документально подтверждённые сведения.',control:'Новое сообщение приобщено к делу. До проверки подтверждающих материалов вопрос остаётся на контроле.'},
 en:{subject:'Local draft based on the case file',legal:'This provision exercises the source citation contract.',resolution:'Review the materials within the assigned authority.',next:'Request evidence of the outcome and retain follow-up.',issue:'Appeal materials',instruction:'Request and verify materials concerning the appeal.',result:'Documented information.',control:'The new information is added to the file. Keep the matter under review pending verification of supporting materials.'},
 zh:{subject:'基于案件材料的本地草稿',legal:'此条文用于验证来源引用契约。',resolution:'在职权范围内核查材料。',next:'请求结果证明并继续监督。',issue:'来信材料',instruction:'请求并核查有关来信的材料。',result:'有文件证明的信息。',control:'新信息已归档。在核查证明材料之前，继续监督此事项。'},
};
let pinned;
function legalSource(){
 if(pinned)return pinned;
 const root=new URL('../firebase/functions/reception-ai/correspondence-corpus/',import.meta.url);
 const index=JSON.parse(readFileSync(new URL('index.json',root),'utf8'));
 const meta=index.documents.find(row=>row.id==='reception-law59999')||index.documents[0];
 if(!meta)throw new Error('Pinned legal corpus is empty');
 const doc=JSON.parse(gunzipSync(readFileSync(new URL(meta.file,root))));
 const unit=doc.units.find(row=>row.text.includes('Запрещается направлять жалобу'))||doc.units.find(row=>row.text?.trim());
 if(!unit)throw new Error('Pinned legal source has no text');
 pinned={id:'qa-law',section:'legalBasis',kind:'legal',sourceId:doc.id,unitIds:[unit.id],quote:unit.text.slice(0,4000).trim()};
 return pinned;
}
function calendarValues(caseData,view){
 const workbook=view.case?.workbook||publicWorkbook(caseData,2,{gameplay:Boolean(view.context)});
 if(!workbook)throw new Error('Workbook v2 public task required');
 const values=Object.fromEntries(workbook.events.map(row=>[row.id,row.date]));
 for(const target of workbook.targets){
  if(!values[target.anchorId])throw new Error('Missing calendar anchor: '+target.anchorId);
  values[target.id]=calculateWorkbookDeadline({anchorDate:values[target.anchorId],ruleId:target.ruleId,...workbook.counting});
 }
 let registrationTimely=true;
 if(workbook.registrationCheck){
  const last=calculateWorkbookDeadline({anchorDate:values.received,ruleId:'calendar3',...workbook.counting});
  registrationTimely=values.registered>=values.received&&values.registered<=last;
 }
 return {deadline:values.deadline,referralDeadline:values.referral||'',registrationTimely};
}

/** Return the decision field, without op/session/request metadata.
 * First open at least one released document through the service, then pass the
 * refreshed view. recipientIds are copied exactly into routing AND the order.
 * The generic draft intentionally makes no claim to high-quality legal advice.
 */
export function buildBankDecision(caseData,view,locale='ru',{recipientIds=['reception-unit'],openedDocumentIds=view.openedDocumentIds||[]}={}){
 const text=copy[locale]||copy.ru,opened=new Set(openedDocumentIds);
 const source=(view.correspondenceSources||[]).find(row=>row.kind==='document'&&opened.has(row.id)&&row.text?.trim())
  ||(view.documents||[]).filter(row=>opened.has(row.id)).map(row=>({...row,text:local(row.text,locale)})).find(row=>row.text?.trim());
 if(!source)throw new Error('Open an actual released document before building the bank submission');
 const evidence={id:'qa-document',section:'facts',kind:'document',sourceId:source.id,quote:source.text.slice(0,4000).trim()};
 const law=structuredClone(legalSource()),dates=calendarValues(caseData,view);
 return {deadline:dates.deadline,workbook:{referralDeadline:dates.referralDeadline,registrationTimely:dates.registrationTimely,routing:{recipientIds:[...recipientIds]}},
  correspondence:{version:1,kind:view.case?.correspondence?.kind||'reply',subject:text.subject,
   sections:{facts:evidence.quote,legalBasis:text.legal,resolution:text.resolution,nextSteps:text.next},citations:[evidence,law],
   orders:[{id:'qa-order',issue:text.issue,kind:'request',recipientIds:[...recipientIds],instruction:text.instruction,dueDate:dates.referralDeadline||dates.deadline,expectedResult:text.result,citationIds:[evidence.id,law.id]}]}};
}

/** Return the followup control field. Only public issue/source IDs are used. */
export function buildBankControl(caseData,view,locale='ru'){
 const issues=view.followup?.issues||view.case?.correspondence?.issues;
 if(!Array.isArray(issues))throw new Error('Public follow-up issues are required');
 if(!(view.correspondenceSources||[]).some(row=>row.id==='followup'))throw new Error('Follow-up source is not released');
 return {text:(copy[locale]||copy.ru).control,statuses:issues.map(issue=>({issueId:issue.id,status:'pending',evidenceSourceIds:['followup']}))};
}
