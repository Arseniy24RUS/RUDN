import {createSourceSnapshot,validateSourceSnapshot} from './source-lifecycle.js';
import {referenceNumber,referenceUnit,formatReference} from './legal-reference.js';
import {documentEvidenceCheck,requiredActionPlan,validDocumentSelection} from './documents.js';
import {BUNDLED_CALENDARS} from '../../../assets/js/calendar-bundled.js';
import {calendarYearNow,validateCalendarSnapshot} from '../../../assets/js/calendar-model.js';
import {EVIDENCE_VERSION} from './content-library.js';
import {newEvidence,evidenceChecks,evidenceFeedback,validEvidence} from './evidence.js';
import {CASES,CASE_TEMPLATES,instantiateCase,CONTENT_VERSION,VERSION,RUBRIC,RUBRIC_VERSION,requireTemplate,hydrateTemplates} from './content-library.js';
import {calculateDeadline,parseDateOnly,CALENDAR_VERSION,formatDateOnly,durationLabel} from '../../../assets/js/legal-calendar.js';
import {modePolicy,isIndependent} from './policy.js';
import {createAssignment,validAssignment} from './assignment.js';
export const clone=value=>JSON.parse(JSON.stringify(value));
const uuid=()=>globalThis.crypto?.randomUUID?.()||`rx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const bounded=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
export function academicPeriod(now=new Date()) {const y=now.getUTCFullYear(),start=now.getUTCMonth()>=8?y:y-1;return `${start}-${start+1}`;}
export function caseIdsFor(mode){modePolicy(mode);return CASES.map(c=>c.id);}
export function caseById(id,state=null){
 const c=CASES.find(x=>x.id===id);if(!c)throw Error('Дело не найдено.');
 requireTemplate(c.templateId);
 if(!state?.calendarSnapshot)return c;
 const manifest=state.assignment.manifest.find(x=>x.id===id);if(!manifest)throw Error('Дело не назначено этой смене.');
 const instance=instantiateCase(CASE_TEMPLATES.find(t=>t.id===manifest.templateId),manifest.datePackId,{dateValues:manifest.dateValues,calendarSnapshot:state.calendarSnapshot});
 if(state.sourceSnapshot)Object.defineProperty(instance,'_sourceSnapshot',{value:state.sourceSnapshot,enumerable:false});
 return instance;
}
export function newCase(){return {asked:[],opened:[],fact:'',factEvidence:'',factEvidenceIds:[],comparison:[],procedure:'',route:'',actions:[],trap:'',knowledge:{lawNumber:'',actDate:'',article:'',application:'',url:''},evidence:newEvidence(),calendar:{anchor:'',rule:'',start:'',shift:'',answer:''},sources:[],phase:'talk',first:null,practiceRevisions:[],followup:'',followupConfirmed:false,skipped:false};}
export function newShift(owner='preview',mode='practice',{period=academicPeriod(),id=uuid(),seed=uuid(),templateId=null,level=null,recentCaseIds=[],profileId='balanced-six',calendarYear=calendarYearNow(),calendarSnapshot=BUNDLED_CALENDARS,calendarStatus=null,preparedAssignment=null}={}) {
 modePolicy(mode);validateCalendarSnapshot(calendarSnapshot);
 const assignment=preparedAssignment||createAssignment({seed,mode,templateId,level,recentCaseIds,profileId,calendarYear,calendarSnapshot}),caseIds=assignment.caseIds;
 const sourceSnapshot=createSourceSnapshot(assignment.manifest.map(m=>requireTemplate(m.templateId)));
 return {schema:16,sourceSnapshot,calendarYear,calendarSnapshot:clone(calendarSnapshot),calendarStatus:clone(calendarStatus),evidenceVersion:EVIDENCE_VERSION,version:VERSION,contentVersion:CONTENT_VERSION,rubricVersion:RUBRIC_VERSION,calendarVersion:CALENDAR_VERSION,
  id,seed,owner,mode,period,assignment,caseIds,startedAt:new Date().toISOString(),endedAt:null,screen:'home',active:0,
  cases:Object.fromEntries(caseIds.map(key=>[key,newCase()])),events:[],submitted:false,completed:false};
}
/** Choose once from light metadata; load those exact IDs before creating any work. */
export async function newShiftPrepared(owner='preview',mode='practice',options={},loadOptions={}){
 const seed=options.seed||uuid(),calendarYear=options.calendarYear||calendarYearNow(),calendarSnapshot=options.calendarSnapshot||BUNDLED_CALENDARS;
 const assignment=createAssignment({...options,seed,mode,calendarYear,calendarSnapshot});
 await hydrateTemplates(assignment.manifest.map(m=>m.templateId),loadOptions);
 return newShift(owner,mode,{...options,seed,calendarYear,calendarSnapshot,preparedAssignment:assignment});
}
export function event(state,type,caseId,data={}){state.events.push({at:new Date().toISOString(),type,caseId,...data});if(state.events.length>1000)state.events.splice(0,state.events.length-1000);}
export function safeUrl(value){try{const s=String(value||'').trim(),u=new URL(s);if(s.length>2048||!['http:','https:'].includes(u.protocol)||u.username||u.password||!u.hostname.includes('.')||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname)||u.hostname.endsWith('.local'))return '';return u.href;}catch{return '';}}
export function normalizeLawNumber(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[\s№]/g,'').replace(/^(?:no\.?|n°|номер)/,'').replace(/[-–—]?фз$/,'').replace(/^0+(?=\d)/,'');}
export function normalizeArticle(value){let s=String(value||'').normalize('NFKC').toLowerCase().trim().replace(',', '.');const explicit=s.match(/(?:статья|статьи|ст\.)\s*(\d+(?:\.\d+)?)/);if(explicit)return explicit[1];return /^\d+(?:\.\d+)?$/.test(s)?s:'';}
export function orderedOptions(options,seed,key){
 // Persistent cosmetic shuffle, never used to claim new substantive variants.
 const hash=s=>{let h=2166136261;for(const x of s)h=Math.imul(h^x.charCodeAt(0),16777619);return h>>>0;};
 return options.map(o=>({o,n:hash(seed+key+o.id)})).sort((a,b)=>a.n-b.n||a.o.id.localeCompare(b.o.id)).map(x=>x.o);
}
export function selectedSnapshot(p){return clone({asked:p.asked,opened:p.opened,fact:p.fact,factEvidence:p.factEvidence,factEvidenceIds:p.factEvidenceIds,comparison:p.comparison,procedure:p.procedure,route:p.route,actions:p.actions,trap:p.trap,knowledge:p.knowledge,calendar:p.calendar,evidence:p.evidence,sources:p.sources,skipped:p.skipped});}
export function formatErrors(p){const errors=[];
 if(p.calendar.answer&&!parseDateOnly(p.calendar.answer))errors.push('Дата в календаре не существует. Используйте ДД.ММ.ГГГГ или выберите день.');
 if(p.knowledge.actDate&&!parseDateOnly(p.knowledge.actDate))errors.push('Дата правового акта не существует. Используйте ДД.ММ.ГГГГ.');
 if(p.evidence?.url&&!safeUrl(p.evidence.url))errors.push('Укажите публичный http(s)-адрес дополнительного источника без логина и пароля.');
 if(p.knowledge.url&&!safeUrl(p.knowledge.url))errors.push('Укажите публичный http(s)-адрес источника без логина и пароля.');
 return errors;
}
export function missingFields(p){return [!p.fact&&'вывод из фактов',!p.factEvidence&&!p.factEvidenceIds?.length&&'материал-основание',!p.procedure&&'процедура',!p.route&&'маршрут',!p.actions.length&&'план действий',!p.trap&&'оценка утверждения помощника',!p.knowledge.lawNumber&&'номер правового акта',!p.knowledge.actDate&&'дата правового акта',!p.knowledge.article&&'структурная единица нормы',!p.knowledge.application&&'применение нормы',!p.calendar.anchor&&'событие для отсчёта',!p.calendar.rule&&'продолжительность',!p.calendar.start&&'начало счёта',!p.calendar.shift&&'правило окончания',!p.calendar.answer&&'крайняя дата',!p.evidence.recordId&&'источник для проверки',!p.evidence.fragmentId&&'фрагмент источника',!p.evidence.extracted&&'извлечённое сведение',!p.evidence.finding&&'вывод из источника'].filter(Boolean);}
export function commitDecision(state,caseId,{skip=false}={}){
 const p=state.cases[caseId];if(!p)throw Error('Дело не назначено.');
 if(state.completed)throw Error('Смена уже завершена.');
 if(isIndependent(state.mode)&&p.first)throw Error('Подтверждённое решение менять нельзя.');
 if(!skip&&formatErrors(p).length)throw Error(formatErrors(p).join(' '));
 if(skip){const blank=newCase();Object.assign(p,{...blank,asked:p.asked,opened:p.opened,skipped:true});}
 const snapshot=selectedSnapshot(p);
 if(!p.first)p.first=snapshot;else p.practiceRevisions.push(snapshot);
 p.phase='result';p.repairMode=false;event(state,skip?'case-skipped':'decision-confirmed',caseId,{snapshot});return snapshot;
}
export function confirmFollowup(state,caseId,choice,{skip=false}={}){
 const c=caseById(caseId,state),p=state.cases[caseId];
 if(state.completed)throw Error('Смена уже завершена.');
 if(!p?.first)throw Error('Сначала подтвердите основное решение.');
 if(isIndependent(state.mode)&&p.followupConfirmed)throw Error('Контрольное решение уже зафиксировано.');
 if(!skip&&!c.followup.options.some(o=>o.id===choice))throw Error('Выберите действие или явно пропустите эпизод.');
 p.followup=skip?'skipped':choice;p.followupConfirmed=true;event(state,'followup-confirmed',caseId,{choice:p.followup});
}
export function deadlineFor(c){const k=c.calendar;return calculateDeadline({anchorDate:k.events.find(x=>x.id===k.anchor).date,duration:k.duration,unit:k.unit,startPolicy:k.startPolicy,lastDayPolicy:k.lastDayPolicy},c.calendarSnapshot||BUNDLED_CALENDARS);}
export function criticalIssues(c,snapshot){return (c.criticalRules||[]).filter(r=>!r.knownQuestion||snapshot.asked.includes(r.knownQuestion)).filter(r=>r.kind==='selected'?snapshot.actions.includes(r.id):!snapshot.actions.includes(r.id)).map(r=>({id:r.id,message:r.message}));}
export function evaluateCase(c,p,{training=false}={}){
 const b=training?p:(p.first||p),k=b.knowledge,calendar=b.calendar;
 const factGood=c.factTask.correct.includes(b.fact),documentProof=documentEvidenceCheck(c,b),evidenceGood=documentProof.matched&&(!documentProof.paired||factGood);
 const scores={facts:(factGood?10:0)+(evidenceGood?5:0),research:0,routing:0,calendar:0,actions:0,rights:0};
 const checks={number:referenceNumber(k.lawNumber,c.knowledge)===c.knowledge.number,date:parseDateOnly(k.actDate)===c.knowledge.actDate,article:c.knowledge.articles.includes(referenceUnit(k.article,c.knowledge)),application:k.application===c.knowledge.correct};
 const proof=evidenceChecks(c,b.evidence);
 scores.research=Object.values(checks).filter(Boolean).length*2+proof.total;
 scores.routing=(c.correctProcedure.includes(b.procedure)?7:0)+(c.correctRoutes.includes(b.route)?8:0);
 const deadline=deadlineFor(c);
 scores.calendar=(calendar.anchor===c.calendar.anchor?2:0)+(calendar.rule===c.calendar.correctRule?2:0)+(calendar.start===c.calendar.startPolicy?2:0)+((c.calendar.acceptedLastDayPolicies||[c.calendar.lastDayPolicy]).includes(calendar.shift)?2:0)+(parseDateOnly(calendar.answer)===deadline.finalDate?12:0);
 const actionPlan=requiredActionPlan(c,b.route),required=c.actions.filter(a=>actionPlan.requiredActions.includes(a.id)),correctActions=required.filter(a=>b.actions.includes(a.id));
 const bad=c.actions.filter(a=>!a.good&&b.actions.includes(a.id));
 // Missing prerequisites lose the action credit, not a second arbitrary order penalty.
 const wrongOrder=actionPlan.order.some(([a,d])=>b.actions.includes(a)&&b.actions.includes(d)&&b.actions.indexOf(a)>b.actions.indexOf(d));
 scores.actions=bounded(14*correctActions.length/Math.max(1,required.length)+(b.actions.length&&required.length&&!wrongOrder?2:0)-4*bad.length,0,16)+(p.followupConfirmed&&p.followup===c.followup.correct?4:0);
 const critical=b.skipped?[]:criticalIssues(c,b);
 scores.rights=(b.trap===c.trap.correct?5:0)+(b.actions.includes(c.rightsAction)&&!critical.length?5:0);
 if(b.skipped){for(const key in scores)scores[key]=0;scores.actions=p.followupConfirmed&&p.followup===c.followup.correct?4:0;}
 const total=Object.values(scores).reduce((a,n)=>a+n,0),feedback=[];
 if(!factGood)feedback.push(c.factTask.explain);
 if(!evidenceGood)feedback.push(documentProof.paired?'Выберите достаточный набор материалов, подтверждающий именно выбранный вывод. Нужны связанные основания, а не отметка всех документов. Открытие и сравнение сами по себе не оцениваются.':`Сопоставьте вывод с материалом «${c.documents.find(d=>(c.factTask.evidence||[c.documents[0].id]).includes(d.id)).title}». Открытие всех файлов само по себе не подтверждает этот навык.`);
 if(Object.values(checks).some(v=>!v))feedback.push(`Правовое основание этого задания: ${formatReference(c.knowledge)}. ${c.knowledge.explain}`);
 feedback.push(...evidenceFeedback(c,b.evidence));
 if(!c.correctProcedure.includes(b.procedure))feedback.push('Выбранная процедура не соответствует содержанию обращения. Сопоставьте предмет просьбы с применимым законом.');
 if(!c.correctRoutes.includes(b.route))feedback.push('Маршрут не соответствует установленным обстоятельствам и вашей роли. '+c.routes.filter(x=>c.correctRoutes.includes(x.id)).map(x=>x.text).join(' / '));
 if(scores.calendar<20)feedback.push(`В этом упражнении исходное событие – ${c.calendar.events.find(e=>e.id===c.calendar.anchor).label.toLowerCase()}. ${durationLabel(c.calendar.duration,c.calendar.unit)}; крайняя дата ${formatDateOnly(deadline.finalDate)}. ${c.calendar.scope}`);
 if(wrongOrder)feedback.push('Поменяйте порядок зависимых действий: сначала необходимая предпосылка, затем опирающееся на неё действие.');
 if(bad.length)feedback.push('Необоснованные действия: '+bad.map(x=>x.title).join('; ')+'.');
 const omitted=required.filter(a=>!b.actions.includes(a.id));if(omitted.length)feedback.push('В плане отсутствует: '+omitted.map(x=>x.title).join('; ')+'.');
 if(b.trap!==c.trap.correct)feedback.push(c.trap.explain);
 return {caseId:c.id,total,scores,checks,evidence:proof,documentProof,actionPlanId:actionPlan.id,critical,feedback,deadline:{finalDate:deadline.finalDate,rawDate:deadline.rawDate},complete:Boolean(p.first&&p.followupConfirmed)};
}
export function summary(state){
 const results=state.caseIds.map(id=>evaluateCase(caseById(id,state),state.cases[id]));
 const completed=results.filter(r=>r.complete).length,raw=results.reduce((s,r)=>s+r.total,0)/results.length;
 const criticalCount=results.reduce((s,r)=>s+r.critical.length,0),total=criticalCount?Math.min(raw,60):raw;
 return {complete:completed===results.length,completed,caseCount:results.length,raw,total,points:Math.round(total/20*10)/10,maxPoints:5,criticalCount,results,rubric:RUBRIC.map(r=>({...r,value:results.reduce((s,v)=>s+v.scores[r.id],0)/results.length}))};
}
export function completeShift(state){const s=summary(state);if(!s.complete)throw Error('Остались неподтверждённые дела или контрольные эпизоды.');if(!state.completed){state.completed=true;state.endedAt=new Date().toISOString();event(state,'shift-completed',null);}state.screen='summary';return s;}
export function makeAttempt(state,studentKey){
 if(!modePolicy(state.mode).grade)throw Error('Этот режим не записывает оценку.');
 if(state.owner!==`student:${studentKey}`)throw Error('Смена принадлежит другому профилю.');
 const s=summary(state);if(!s.complete||!state.completed)throw Error('Смена ещё не подтверждена целиком.');
 return {id:state.id,createdAt:state.startedAt,studentKey,type:'citizen-reception',activitySlug:'seminar-5',title:'Приёмная. Первая смена',points:s.points,maxPoints:5,recordGrade:true,reviewStatus:'auto-scored',sourceSnapshotId:state.sourceSnapshot?.id||null,gameVersion:state.version,evidenceVersion:EVIDENCE_VERSION,contentVersion:CONTENT_VERSION,rubricVersion:RUBRIC_VERSION,calendarVersion:CALENDAR_VERSION,calendarSnapshotId:state.calendarSnapshot.id,calendarYear:state.calendarYear,academicPeriod:state.period,summary:s,shift:clone(state)};
}
export function publicExport(state){
 // A student export contains their actions but never keys, feedback, breakdown or correct dates.
 const data={format:'rudn-reception-student-export-v16',sourceSnapshotId:state.sourceSnapshot?.id||null,calendarYear:state.calendarYear,calendarSnapshotId:state.calendarSnapshot.id,evidenceVersion:state.evidenceVersion,id:state.id,mode:state.mode,period:state.period,contentVersion:state.contentVersion,rubricVersion:state.rubricVersion,startedAt:state.startedAt,endedAt:state.endedAt,submitted:state.submitted,caseIds:state.caseIds,assignment:clone(state.assignment),answers:clone(state.cases)};
 if(state.completed&&modePolicy(state.mode).score){const s=summary(state);data.result={points:s.points,maxPoints:5};}
 return data;
}
export function restoreShift(raw,owner,mode,period=academicPeriod()){
 if(raw?.revision!==undefined&&(!Number.isSafeInteger(raw.revision)||raw.revision<0))return null;
 try{validateCalendarSnapshot(raw?.calendarSnapshot);if(raw.calendarYear!==raw.assignment?.calendarYear)return null;}catch{return null;}
 if(!raw||raw.schema!==16||raw.evidenceVersion!==EVIDENCE_VERSION||raw.owner!==owner||raw.mode!==mode||raw.period!==period||raw.contentVersion!==CONTENT_VERSION||raw.rubricVersion!==RUBRIC_VERSION||raw.calendarVersion!==CALENDAR_VERSION||!Array.isArray(raw.caseIds)||!validAssignment(raw.assignment,mode,raw.calendarSnapshot)||raw.assignment.seed!==raw.seed||raw.caseIds.join('|')!==raw.assignment.caseIds.join('|')||!Array.isArray(raw.events)||typeof raw.id!=='string'||typeof raw.seed!=='string')return null;
 if(!raw.cases||Object.keys(raw.cases).sort().join('|')!==[...raw.caseIds].sort().join('|'))return null;
 try{const list=raw.assignment.manifest.map(m=>CASE_TEMPLATES.find(c=>c.id===m.templateId));if(raw.sourceSnapshot)validateSourceSnapshot(raw.sourceSnapshot,list);else{raw=clone(raw);raw.sourceSnapshot=createSourceSnapshot(list,{createdAt:raw.startedAt});}}catch{return null;}
 if(!Number.isInteger(raw.active)||raw.active<0||raw.active>=raw.caseIds.length)return null;
 const validSnapshot=(p,c)=>p&&validDocumentSelection(c,p.factEvidenceIds)&&validDocumentSelection(c,p.comparison,2)&&validEvidence(c,p.evidence)&&['asked','opened','actions','sources'].every(k=>Array.isArray(p[k]))&&p.knowledge&&p.calendar&&['fact','factEvidence','procedure','route','trap'].every(k=>typeof p[k]==='string')&&['lawNumber','actDate','article','application','url'].every(k=>typeof p.knowledge[k]==='string')&&['anchor','rule','start','shift','answer'].every(k=>typeof p.calendar[k]==='string')&&p.asked.every(id=>c.questions.some(q=>q.id===id))&&p.opened.every(id=>c.documents.some(d=>d.id===id))&&p.actions.every(id=>c.actions.some(a=>a.id===id));
 if(!['home','work','summary'].includes(raw.screen)||typeof raw.completed!=='boolean'||typeof raw.submitted!=='boolean'||(raw.submitted&&!raw.completed))return null;
 for(const id of raw.caseIds){const p=raw.cases?.[id],c=caseById(id,raw);if(!validSnapshot(p,c)||(p.first&&!validSnapshot(p.first,c))||!Array.isArray(p.practiceRevisions)||p.practiceRevisions.some(r=>!validSnapshot(r,c))||!['talk','docs','research','calendar','plan','history','result'].includes(p.phase)||typeof p.followupConfirmed!=='boolean'||!['','skipped',...c.followup.options.map(o=>o.id)].includes(p.followup))return null;}
 for(const id of raw.caseIds){
  const p=raw.cases[id];
  if(p.viewMonth!==undefined&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.viewMonth)||!raw.calendarSnapshot.years[p.viewMonth.slice(0,4)]))return null;
  if(p.followupConfirmed&&(!p.first||!p.followup))return null;
  if(p.phase==='result'&&!p.first)return null;
 }
 if(raw.screen==='summary'&&!raw.completed)return null;
 if(raw.completed&&!summary(raw).complete)return null;
 return raw;
}
export function draftReply(c,p){
 const chosen=new Set(p.actions),parts=[`Учебный проект сообщения по делу «${c.title}».`];
 if(p.procedure)parts.push('Выбран порядок: '+(c.procedures.find(x=>x.id===p.procedure)?.text||p.procedure)+'.');
 if(p.route)parts.push('Выбран маршрут: '+(c.routes.find(x=>x.id===p.route)?.text||p.route)+'.');
 if(parseDateOnly(p.calendar.answer))parts.push('Указанная вами крайняя дата: '+formatDateOnly(p.calendar.answer)+'.');
 if(chosen.size)parts.push('В проект включено: '+c.actions.filter(a=>chosen.has(a.id)).map(a=>a.title).join('; ')+'.');
 parts.push('Проект воспроизводит ваш выбор и не исправляет его автоматически. Реальная отправка не производится.');return parts.join('\n\n');
}
