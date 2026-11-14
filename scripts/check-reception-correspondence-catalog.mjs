#!/usr/bin/env node
/** Read-only predeploy gate for an ALREADY PREPARED private dossier directory.
 * No exporter, seeding, Firebase, model calls, source texts or file writes.
 * A pass describes the supplied local snapshot, never the live Firebase bank. */
import {readFile,readdir} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCase} from '../firebase/functions/reception-ai/schema.mjs';
import {getCorrespondenceProfile,publicCorrespondenceProfile,correspondenceProfileMeta} from '../firebase/functions/reception-ai/correspondence-profiles.mjs';
import {buildCorrespondenceReview} from '../firebase/functions/reception-ai/correspondence.mjs';

const expectedIds=Object.values(correspondenceProfileMeta.familyCoverage).flat().sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// The existing private schema uses next_working; authored templates use
// next_working_day for the same policy. Neither spelling changes a date.
const calendarShift=value=>value==='next_working_day'?'next_working':value;
const hasToken=value=>/\{\{[a-z][a-z0-9]*\}\}/i.test(JSON.stringify(value));
const local=value=>typeof value==='string'?value:value?.ru||'';
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value)?value:null;
const isoDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};
const emptySubmission=()=>({version:1,kind:'reply',subject:'',sections:{facts:'',legalBasis:'',resolution:'',nextSteps:''},citations:[],orders:[]});

/** Pure inspection of one schema-valid frozen variant; errors contain IDs only. */
export function inspectCorrespondenceVariant(c){
  const errors=[],caseId=safeId(c?.id),datePackId=safeId(c?.datePackId);
  const add=code=>errors.push({code,caseId,datePackId});
  const authored=getCorrespondenceProfile(c.id);
  if(!authored){add('unsupported_case');return {errors,reviewContexts:0};}
  if(!c.provenance){add('missing_provenance');return {errors,reviewContexts:0};}
  if(c.provenance.sourceCaseId!==c.id)add('source_case_id_mismatch');
  if(c.provenance.sourceSHA256!==authored.provenance.sourceSHA256)add('source_sha256_mismatch');
  if(c.provenance.sourceContentVersion!==authored.authoredContentVersion)add('source_content_version_mismatch');
  if(!authored.authoredDatePackIds.includes(c.datePackId))add('unsupported_date_pack');
  for(const key of ['public','facts','documents','rubric','followup'])if(hasToken(c[key]))add('unresolved_dossier_'+key);
  if(!isoDate(c.public.date)||!isoDate(c.rubric.deadline))add('invalid_frozen_date');
  const events=c.public.assessment?.calendar?.events||[];
  for(const event of events){
    if(!isoDate(event.date))add('invalid_calendar_event_date');
    const frozen=c.provenance.dateValues?.[event.id+'ISO'];
    if(frozen!==undefined&&frozen!==event.date)add('calendar_provenance_conflict');
  }
  const rule=c.rubric.authored?.calendar;
  if(!rule||rule.anchor!==authored.calendar.anchor||rule.rule!==authored.calendar.correctRule||rule.start!==authored.calendar.startPolicy||!same(rule.acceptedShifts.map(calendarShift).sort(),authored.calendar.acceptedLastDayPolicies.map(calendarShift).sort()))add('authored_calendar_rule_mismatch');
  const profile=getCorrespondenceProfile(c);
  if(!profile){add('unsupported_frozen_profile');return {errors,reviewContexts:0};}
  if(!profile.provenance.frozenSourceMatched)add('source_not_bound');
  if(profile.dateBinding?.unresolvedTokenKeys?.length)add('unresolved_profile_dates');
  if(hasToken(profile))add('unresolved_profile_tokens');
  if(profile.dateBinding?.datePackId!==c.datePackId||!profile.dateBinding?.usesFrozenDossier)add('date_variant_not_bound');
  if(profile.calendar.frozenDeadline!==c.rubric.deadline||!same(profile.calendar.events,events))add('frozen_calendar_mismatch');
  const factIds=new Set(c.facts.map(fact=>fact.id)),docIds=new Set(c.documents.map(doc=>doc.id)),actionIds=new Set(c.public.actions.map(action=>action.id));
  for(const issue of profile.issues){
    if(issue.requiredFactIds.some(id=>!factIds.has(id)))add('profile_fact_reference_missing');
    if(issue.docIds.some(id=>!docIds.has(id))||issue.acceptedDocumentSets.flat().some(id=>!docIds.has(id)))add('profile_document_reference_missing');
    for(const claim of issue.claims){
      const fact=c.facts.find(fact=>fact.id===claim.id);
      if(!fact||claim.text!==local(fact.text)||claim.statement!==local(fact.text))add('frozen_fact_mismatch');
    }
  }
  if([...profile.expectedActions,...profile.forbiddenActions].some(action=>!actionIds.has(action.id)))add('profile_action_reference_missing');
  if(!c.followup){add('missing_control_event');return {errors,reviewContexts:0};}
  if(profile.control.prompt!==local(c.followup.intro))add('frozen_control_prompt_mismatch');
  const outcome=[local(c.followup.options.find(option=>option.id===c.followup.correct)?.label),local(c.followup.explanation)].filter(Boolean);
  if(!same(profile.control.expectedOutcomes,outcome))add('frozen_control_outcome_mismatch');
  const issueIds=profile.issues.map(issue=>issue.id).sort();
  if(!same(profile.control.expectedStatuses.map(row=>row.issueId).sort(),issueIds)||profile.control.expectedStatuses.some(row=>!row.allowedStatuses.length||row.allowedStatuses.some(status=>!['pending','resolved','referred'].includes(status))))add('invalid_control_status_contract');
  for(const locale of ['ru','en','zh'])if(!publicCorrespondenceProfile(c,locale))add('unsupported_public_profile_'+locale);
  const correspondence=emptySubmission(),decision={correspondence};
  const state={knownFactIds:[...factIds],openedDocumentIds:[...docIds],messages:[],decision,correspondenceEvidence:[]};
  const control={text:'',statuses:profile.issues.map(issue=>({issueId:issue.id,status:'pending',evidenceSourceIds:[]}))};
  let reviewContexts=0;
  for(const phase of ['initial','control']){
    try{
      const review=buildCorrespondenceReview(c,state,decision,'ru',{profile,phase,...(phase==='control'?{control}:{})});
      reviewContexts++;
      if(review.datePackId!==c.datePackId||review.frozenCase.date!==c.public.date||review.frozenCase.deadline!==c.rubric.deadline||!same(review.frozenCase.calendarEvents,events))add(phase+'_review_date_mismatch');
      if(!same(review.profile.issues,profile.issues)||!same(review.profile.criteria,profile.criteria)||!same(review.profile.acceptedKinds,profile.acceptedKinds))add(phase+'_review_profile_mismatch');
      if(!same(review.profile.constraints,profile.constraints)||!same(review.profile.routing,profile.routing)||!same(review.profile.response,profile.response))add(phase+'_review_constraints_missing');
      const criteria=phase==='initial'?['facts','legalBasis','resolution','nextSteps']:['verification','status','nextAction'];
      if(!same(review.criteria.map(row=>row.id),criteria))add(phase+'_review_criteria_mismatch');
      if(phase==='initial'){
        if(review.profile.control!==undefined||review.newInformation!==null)add('initial_review_control_leak');
        if(profile.criticalRules.some(rule=>!review.criticalRules.some(row=>row.id===rule.id)))add('initial_review_critical_rule_missing');
        if(profile.criticalRules.some(rule=>rule.knownQuestion&&!review.criticalRules.some(row=>row.id===rule.id&&row.knownQuestion===rule.knownQuestion)))add('initial_review_critical_condition_missing');
      }else{
        // A historical static episode must not receive execution-v1 materials
        // which the student has neither requested nor seen in that session.
        const staticControl=Object.fromEntries(Object.entries(profile.control).filter(([key])=>key!=='workflow'));
        if(!same(review.profile.control,staticControl)||review.newInformation!==local(c.followup.intro))add('control_review_profile_mismatch');
      }
      if(hasToken(review))add(phase+'_review_unresolved_tokens');
    }catch{add(phase+'_review_build_failed');}
  }
  return {errors,reviewContexts};
}

export async function checkCorrespondenceCatalog({casesDirectory}={}){
  const report={status:'FAIL',scope:'local-private-catalog-snapshot',readOnly:true,liveFirebaseVerified:false,
    profileVersion:correspondenceProfileMeta.profileVersion,sourceBankSHA256:correspondenceProfileMeta.sourceBankSHA256,
    expected:{cases:expectedIds.length,dateVariants:expectedIds.reduce((sum,id)=>sum+getCorrespondenceProfile(id).authoredDatePackIds.length,0),curriculumFamilies:correspondenceProfileMeta.curriculumFamilyCount,extensions:correspondenceProfileMeta.extensionCount},
    observed:{jsonFiles:0,validCases:0,uniqueCases:0,dateVariants:0,supportedVariants:0,reviewContexts:0},errors:[]};
  const add=(code,caseId=null,datePackId=null)=>report.errors.push({code,caseId:safeId(caseId),datePackId:safeId(datePackId)});
  if(typeof casesDirectory!=='string'||!isAbsolute(casesDirectory)){add('absolute_cases_directory_required');return report;}
  let entries;
  try{entries=(await readdir(casesDirectory,{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.json')).sort((a,b)=>a.name.localeCompare(b.name));}
  catch{add('catalog_directory_unreadable');return report;}
  report.observed.jsonFiles=entries.length;
  const seen=new Set();
  for(const entry of entries){
    let input,c;
    try{input=JSON.parse(await readFile(resolve(casesDirectory,entry.name),'utf8'));}
    catch{add('invalid_json');continue;}
    const caseId=safeId(input?.id);
    try{c=validateCase(input);}catch{add('invalid_private_schema',caseId);continue;}
    report.observed.validCases++;
    if(seen.has(c.id)){add('duplicate_case',c.id);continue;}
    seen.add(c.id);
    const authored=getCorrespondenceProfile(c.id);
    if(!authored){add('unexpected_case',c.id);continue;}
    const variants=[c,...(c.dateVariants||[])].map(value=>{const result=structuredClone(value);delete result.dateVariants;return result;});
    const packs=new Set(variants.map(variant=>variant.datePackId));
    for(const id of authored.authoredDatePackIds)if(!packs.has(id))add('missing_date_variant',c.id,id);
    for(const variant of variants){
      report.observed.dateVariants++;
      const result=inspectCorrespondenceVariant(variant);
      report.errors.push(...result.errors);report.observed.reviewContexts+=result.reviewContexts;
      if(!result.errors.length)report.observed.supportedVariants++;
    }
  }
  report.observed.uniqueCases=seen.size;
  for(const id of expectedIds)if(!seen.has(id))add('missing_case',id);
  if(entries.length!==expectedIds.length)add('catalog_file_count_mismatch');
  report.errors=[...new Map(report.errors.map(row=>[JSON.stringify(row),row])).values()].sort((a,b)=>(a.caseId||'').localeCompare(b.caseId||'')||(a.datePackId||'').localeCompare(b.datePackId||'')||a.code.localeCompare(b.code));
  report.status=report.errors.length?'FAIL':'PASS';
  return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const valid=args.length===2&&args[0]==='--cases';
  let report;
  try{report=await checkCorrespondenceCatalog({casesDirectory:valid?args[1]:undefined});}
  catch{report={status:'FAIL',readOnly:true,liveFirebaseVerified:false,errors:[{code:'catalog_check_failed',caseId:null,datePackId:null}]};}
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=report.status==='PASS'?0:1;
}
