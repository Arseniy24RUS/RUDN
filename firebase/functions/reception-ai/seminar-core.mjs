import {parseDateOnly} from './authored.mjs';
import {resolveCorrespondenceCitations,validateCorrespondenceCitation} from './correspondence.mjs';
import {hasApplicableLegalCitation,requiredSeminarProvisions} from './normative-acts.mjs';
import {evaluateRoutingWorkflow,validateRoutingWorkflowDecision} from './routing-workflow.mjs';
import {evaluateMfcRouting,validateMfcRoutingDecision} from './mfc-routing.mjs';
import {MFC_SEMINAR_VERSION,MFC_DATES_ONLY_CALENDAR_VERSION,isMfcChainedCalendar} from './mfc-seminar.mjs';
import {ReceptionError,copy,fail,fields,hash} from './schema.mjs';
import {tutorialOperational} from './seminar-journey.mjs';
import {WORKBOOK_VERSION,publicWorkbook} from './workbook.mjs';
import {workingCalendarDay} from './workbook-calendar.mjs';

export const SEMINAR_CORE_VERSION = 'guided-core-v1';
export const CORE_STEP_FIELDS = Object.freeze({materials:'citations',calendar:'calendar',route:'routing'});
const CORE_STEPS = Object.keys(CORE_STEP_FIELDS);

export function publicCoreSteps(state,stepId=null) {
  const values=copy(state.coreStepsValues||{});
  const completed=CORE_STEPS.filter(id=>Object.hasOwn(values,CORE_STEP_FIELDS[id]));
  return {stepId:stepId || CORE_STEPS.find(id=>!completed.includes(id)) || 'draft',completed,values,
    ...(state.coreStepReceipt?{receipt:state.coreStepReceipt}:{})};
}

function validateCalendar(c,raw,coreStepsVersion,mfcCalendarVersion) {
  const {deadline,referralDeadline,registrationTimely}=fields(raw,['deadline','referralDeadline','registrationTimely']);
  const workbook=publicWorkbook(c,WORKBOOK_VERSION,{gameplay:true,coreStepsVersion,mfcCalendarVersion});
  const registrationRequired=workbook.calendarVersion!==MFC_DATES_ONLY_CALENDAR_VERSION;
  const referral=workbook.targets.some(target=>target.id==='referral');
  const dates=referral?[deadline,referralDeadline]:[deadline];
  if(dates.some(date=>!date||parseDateOnly(date)!==date)||
    !referral&&referralDeadline!==''||(registrationRequired||registrationTimely!==undefined)&&typeof registrationTimely!=='boolean')fail('core_calendar_required');
  if(!isMfcChainedCalendar(workbook.calendarVersion))for(const date of dates){
    try{workingCalendarDay(date);}catch{fail('core_calendar_required');}
  }
  return {deadline,referralDeadline,...(registrationRequired?{registrationTimely}:{})};
}

export async function inspectCoreStep(body,c,state,locale,{resolveLegalCitation,guide,coreStepsVersion,mfcCalendarVersion}) {
  const field=CORE_STEP_FIELDS[body.stepId];
  if(!field||!Object.hasOwn(body,field)||
    [...Object.values(CORE_STEP_FIELDS),'decision','control','choiceId','useExample','confirmOwn']
      .some(key=>key!==field&&Object.hasOwn(body,key)))fail('invalid_core_step');
  const raw=body[field];
  if(field==='citations'){
    const provisions=requiredSeminarProvisions(c), requiredIds=Object.keys(provisions);
    if(!requiredIds.length)fail('invalid_case',503);
    if(!Array.isArray(raw)||raw.length!==requiredIds.length)fail('core_citation_required');
    let value;
    try {
      value=raw.map(validateCorrespondenceCitation);
      if(new Set(value.map(row=>row.id)).size!==value.length||
        value.some(row=>row.kind!=='legal'||row.section!=='legalBasis')||
        !requiredIds.every(id=>value.some(row=>row.sourceId===id)))fail('invalid_citation');
      await resolveCorrespondenceCitations(c,state,{citations:value},locale,{
        resolveLegalCitation:(citation,options)=>resolveLegalCitation(citation,{...options,requireProvision:true})
      });
    }catch(error){
      if(error instanceof ReceptionError&&error.status<500)fail('invalid_citation');
      throw error;
    }
    if(guide&&!value.every(row=>hasApplicableLegalCitation(c,
      {docId:row.sourceId,unitIds:row.unitIds,text:row.quote},provisions)))return {finding:'legal'};
    return {field,value};
  }
  if(field==='calendar'){
    const value=validateCalendar(c,raw,coreStepsVersion,mfcCalendarVersion);
    if(guide){
      const decision={deadline:value.deadline,workbook:{referralDeadline:value.referralDeadline,
        registrationTimely:value.registrationTimely,routing:{recipientIds:[]}}};
      if(Object.values(tutorialOperational(c,decision,coreStepsVersion,mfcCalendarVersion).workbook.calendar.correct).some(correct=>!correct))return {finding:'calendar'};
    }
    return {field,value};
  }
  const mfc=coreStepsVersion===MFC_SEMINAR_VERSION;
  const value=(mfc?validateMfcRoutingDecision:validateRoutingWorkflowDecision)(raw);
  if(mfc?value.disposition!=='forward':!value.disposition)fail('core_route_required');
  if(guide&&!(mfc?evaluateMfcRouting(c,value):evaluateRoutingWorkflow(c.id,value))?.correct)return {finding:'route'};
  return {field,value};
}

export function saveCoreStep(state,body,{field,value}) {
  state.coreStepsValues??={};
  state.coreStepsValues[field]=value;
  state.coreStepReceipt={requestId:body.requestId,stepId:body.stepId};
}

export function assertCoreDecision(state,decision) {
  const {citations,calendar,routing}=state.coreStepsValues||{};
  if(!citations?.length||!calendar||!routing)fail('core_steps_required',409);
  if(decision.deadline!==calendar.deadline||decision.workbook?.referralDeadline!==calendar.referralDeadline||
    decision.workbook.registrationTimely!==calendar.registrationTimely)fail('core_calendar_required',409);
  const chosen=decision.workbook.routing;
  if(chosen.disposition!==routing.disposition||chosen.recipientIds.length!==routing.recipientIds.length||
    !chosen.recipientIds.every(id=>routing.recipientIds.includes(id)))fail('core_route_required',409);
  const selected=new Set(decision.correspondence.citations.map(row=>hash(row)));
  if(!citations.every(row=>selected.has(hash(row))))fail('core_citation_required',409);
}
