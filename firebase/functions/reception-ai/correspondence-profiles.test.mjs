import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  getCorrespondenceProfile,publicCorrespondenceProfile,correspondenceProfileMeta
} from './correspondence-profiles.mjs';
import {buildCorrespondenceProfiles,compileCorrespondenceProfile} from '../../../scripts/build-reception-correspondence-profiles.mjs';
import {CASE_OVERRIDES,ISSUE_OVERRIDES} from '../../../scripts/reception-correspondence-overrides.mjs';
import {instantiateCase} from '../../../site/apps/reception/js/cases.js';
import {LEARNING_REVIEW_DATA} from './learning-review-data.mjs';
import {buildCorrespondenceReview} from './correspondence.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const directory=resolve(root,'site/apps/reception/content/cases');
const catalog=JSON.parse(await readFile(resolve(directory,'../catalog.json'),'utf8'));
const cases=new Map(await Promise.all(catalog.map(async row=>{
  const bytes=await readFile(resolve(directory,row.id+'.json'),'utf8');
  return [row.id,{payload:JSON.parse(bytes),hash:createHash('sha256').update(bytes).digest('hex')}];
})));
const T=value=>({ru:value,en:value,zh:value});

// A narrow frozen-context fixture uses the existing authored date instantiator.
// It is not a replacement for production dossier seeding or a new converter.
function frozenContext(id,packId){
  const {payload,hash}=cases.get(id),t=instantiateCase(payload.template,packId);
  return {
    id,version:'profile-context-test',datePackId:packId,
    provenance:{sourceCaseId:id,sourceContentVersion:payload.template.contentVersion,sourceSHA256:hash,calendarYear:t.calendarYear,dateValues:t.dateValues},
    public:{title:T(t.title),role:{title:T(t.role.title),text:T(t.role.text)},opening:T(t.opening),date:t.dateValues.registeredISO||t.calendar.events[0].date,
      actions:t.actions.map(action=>({id:action.id,label:T(action.title)})),
      assessment:{calendar:{events:t.calendar.events}}},
    facts:t.questions.map(q=>({id:q.id,text:T(q.answer),knowledge:'direct'})),
    documents:t.documents.map(doc=>({id:doc.id,title:T(doc.title),text:T(doc.text)})),
    rubric:{deadline:'2026-12-31',forbiddenActionIds:t.actions.filter(action=>!action.good).map(action=>action.id),requiredActionIds:t.actions.filter(action=>action.good).map(action=>action.id),criticalActionIds:(t.criticalRules||[]).filter(rule=>rule.kind==='selected').map(rule=>rule.id),explanation:T(t.factTask.explain),authored:{criticalRules:t.criticalRules||[],calendar:{anchor:t.calendar.anchor,rule:t.calendar.correctRule,start:t.calendar.startPolicy,acceptedShifts:t.calendar.acceptedLastDayPolicies}}},
    followup:{intro:T(t.followup.intro),correct:t.followup.correct,options:t.followup.options.map(option=>({id:option.id,label:T(option.text)})),explanation:T(t.followup.explain)}
  };
}

test('the private bank covers every current authored case, family, extension and exact source hash',async()=>{
  const bank=await buildCorrespondenceProfiles({check:true,write:false});
  assert.equal(bank.meta.caseCount,178);
  assert.equal(bank.meta.curriculumFamilyCount,42);
  assert.equal(bank.meta.curriculumCaseCount,175);
  assert.equal(bank.meta.extensionCount,3);
  assert.equal(bank.meta.dateVariantCount,356);
  assert.deepEqual(bank.meta.extensionIds,['authority-contact','river-observation','river-old-photo']);
  assert.deepEqual(Object.keys(bank.profiles).sort(),catalog.map(row=>row.id).sort());
  assert.deepEqual(Object.keys(CASE_OVERRIDES).sort(),catalog.map(row=>row.id).sort());
  const fingerprints=new Set();
  for(const [id,{payload,hash}] of cases){
    const profile=getCorrespondenceProfile(id);
    assert.equal(profile.provenance.sourceSHA256,hash,id);
    assert.deepEqual(profile.authoredDatePackIds,payload.template.datePacks.map(pack=>pack.id),id);
    assert.equal(LEARNING_REVIEW_DATA[id].sourceSHA256,hash,id+' existing private-bank provenance');
    assert.equal(profile.control.prompt,payload.template.followup.intro,id);
    assert.ok(profile.focus.trim(),id);
    assert.ok(profile.expectedActions.length>=5,id);
    assert.ok(profile.issues.every(issue=>issue.claims.length&&issue.acceptedDocumentSets.length&&issue.requiredOutcomes.length),id);
    fingerprints.add(JSON.stringify({issues:profile.issues,focus:profile.focus,control:profile.control.expectedOutcomes}));
  }
  assert.equal(fingerprints.size,178,'Each rubric retains the authored, case-specific content');
  assert.deepEqual(correspondenceProfileMeta,bank.meta);
});

test('every evidence, fact, action and legal fragment resolves to the authored source',()=>{
  for(const [id,{payload}] of cases){
    const t=payload.template,profile=getCorrespondenceProfile(id);
    for(const issue of profile.issues){
      for(const factId of issue.requiredFactIds)assert.ok(t.questions.some(q=>q.id===factId),id+'/'+factId);
      for(const docId of issue.docIds)assert.ok(t.documents.some(doc=>doc.id===docId),id+'/'+docId);
      for(const group of issue.acceptedDocumentSets){
        assert.ok(group.length,id);
        for(const docId of group)assert.ok(issue.docIds.includes(docId),id+'/'+docId);
      }
      for(const claim of issue.claims)assert.equal(claim.statement,t.questions.find(q=>q.id===claim.id).answer,id);
    }
    assert.deepEqual(profile.expectedActions.map(action=>action.id),t.actions.filter(action=>action.good).map(action=>action.id),id);
    assert.deepEqual(profile.forbiddenActions.map(action=>action.id),t.actions.filter(action=>!action.good).map(action=>action.id),id);
    for(const source of profile.sources){
      const record=payload.records.find(record=>record.id===source.recordId);
      assert.equal(source.text,record.fragments.find(fragment=>fragment.id===source.fragmentId).text,id);
      assert.equal(source.recordKind,record.kind,id);
    }
    assert.deepEqual(profile.criticalRules.map(rule=>({id:rule.id,kind:rule.kind,knownQuestion:rule.knownQuestion})),(t.criticalRules||[]).map(rule=>({id:rule.id,kind:rule.kind,knownQuestion:rule.knownQuestion})),id);
    assert.equal(profile.provenance.generatedAnswerText,false);
  }
});

test('all 356 variants project the authored rubric and independent control status into 712 review contexts',()=>{
  let contexts=0;
  for(const [id,{payload}] of cases)for(const pack of payload.template.datePacks){
    const c=frozenContext(id,pack.id),profile=getCorrespondenceProfile(c);
    const correspondence={version:1,kind:'reply',subject:'',sections:{facts:'',legalBasis:'',resolution:'',nextSteps:''},citations:[],orders:[]};
    const decision={correspondence},state={knownFactIds:c.facts.map(fact=>fact.id),openedDocumentIds:c.documents.map(doc=>doc.id),messages:[],decision};
    const control={text:'',statuses:profile.issues.map(issue=>({issueId:issue.id,status:'pending',evidenceSourceIds:[]}))};
    for(const phase of ['initial','control']){
      const review=buildCorrespondenceReview(c,state,decision,'ru',{profile,phase,...(phase==='control'?{control}:{})});
      assert.deepEqual(review.profile.criteria,profile.criteria,id+'/'+pack.id+'/'+phase);
      assert.deepEqual(review.profile.constraints,profile.constraints,id+' private constraints');
      assert.deepEqual(review.profile.routing,profile.routing,id+' permitted routing');
      assert.deepEqual(review.profile.response,profile.response,id+' document genre and role');
      assert.deepEqual(review.profile.issues,profile.issues,id+' independent issues');
      assert.deepEqual(review.frozenCase.calendarEvents,c.public.assessment.calendar.events,id+' frozen calendar');
      assert.ok(!/\{\{[a-z][a-z0-9]*\}\}/i.test(JSON.stringify(review)),id+' unresolved token in review');
      if(phase==='initial'){
        assert.equal(review.profile.control,undefined,id+' future control leaked');
        assert.equal(review.newInformation,null,id);
        assert.deepEqual(review.criteria.map(row=>row.id),['facts','legalBasis','resolution','nextSteps']);
        for(const rule of profile.criticalRules){
          const projected=review.criticalRules.find(row=>row.id===rule.id);
          assert.ok(projected,id+' missing critical rule');
          if(rule.knownQuestion)assert.equal(projected.knownQuestion,rule.knownQuestion,id+' lost condition');
        }
      }else{
        assert.deepEqual(review.profile.control.expectedStatuses,profile.control.expectedStatuses,id+' control status');
        assert.deepEqual(review.profile.control.expectedOutcomes,profile.control.expectedOutcomes,id+' control outcome');
        assert.equal(review.newInformation,c.followup.intro.ru,id+' frozen control event');
        assert.deepEqual(review.criteria.map(row=>row.id),['verification','status','nextAction']);
      }
      contexts++;
    }
  }
  assert.equal(contexts,712);
});

test('the public projection contains no expected findings, hidden conversation, future event or answer keys',()=>{
  const forbiddenKeys=new Set(['claims','requiredFactIds','sourceQuestions','docIds','requiredOutcomes','acceptedDocumentSets','acceptedKinds','criticalRules','criteria','expectedActions','forbiddenActions','correctRoutes','correctProcedure','sources','control','primaryFinding','focus','provenance','knowledge','calendar','initialCompletion']);
  function inspect(value){
    if(!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){assert.ok(!forbiddenKeys.has(key),'Private key leaked: '+key);inspect(item);}
  }
  for(const [id,{payload}] of cases){
    const view=publicCorrespondenceProfile(id),encoded=JSON.stringify(view);
    inspect(view);
    assert.deepEqual(Object.keys(view.role),['title']);
    assert.equal(encoded.includes(payload.template.followup.intro),false,id+' future event');
    for(const q of payload.template.questions)if(q.answer.length>35)assert.equal(encoded.includes(q.answer),false,id+'/'+q.id+' hidden answer');
    for(const option of payload.template.factTask.options.filter(option=>payload.template.factTask.correct.includes(option.id)))if(option.text.length>35)assert.equal(encoded.includes(option.text),false,id+' answer key');
    assert.ok(!/\{\{/.test(encoded));
  }
  assert.equal(publicCorrespondenceProfile('sickpay-two-payers').issues.some(issue=>/СФР|страховщик/.test(issue.title)),false,'Do not reveal the still-to-be-established payer');
});

test('anonymous, information, judicial, MFC and bailiff genres retain their distinct limits',()=>{
  const anonymous=getCorrespondenceProfile('anonymous-danger');
  assert.deepEqual(anonymous.acceptedKinds,['internal']);
  assert.equal(anonymous.response.individualReplyRequired,false);
  assert.equal(publicCorrespondenceProfile('anonymous-danger').kind,'internal');
  assert.equal(getCorrespondenceProfile('budget').routing.policy,'current_holder_must_prepare_information');
  assert.equal(getCorrespondenceProfile('budget-misdirected').routing.policy,'competent_holder_with_notice');
  for(const id of ['court-cancel','court-order-objections'])assert.equal(getCorrespondenceProfile(id).routing.policy,'return_with_explanation_not_ordinary_referral');
  for(const id of ['mfc-refusal','mfc-service-refusal','bailiff-unsigned-complaint','bailiff-specific-petition'])assert.equal(getCorrespondenceProfile(id).routing.policy,'special_procedure_and_authorised_decider');
  assert.ok(getCorrespondenceProfile('bailiff-unsigned-complaint').constraints.some(text=>text.includes('не доказывает необоснованность доводов')));
  assert.ok(getCorrespondenceProfile('repeat-same-arguments').constraints.some(text=>text.includes('обусловлено решением')));
});

test('multi-subject control cannot silently close unresolved parts or fabricate missing results',()=>{
  assert.equal(Object.keys(ISSUE_OVERRIDES).length,11);
  const partial=getCorrespondenceProfile('several-partial-response');
  assert.deepEqual(partial.control.expectedStatuses.find(row=>row.issueId==='road').allowedStatuses,['resolved']);
  assert.deepEqual(partial.control.expectedStatuses.find(row=>row.issueId==='lighting').allowedStatuses,['pending']);
  const two=getCorrespondenceProfile('several-repair-and-complaint');
  assert.deepEqual(two.control.expectedStatuses.find(row=>row.issueId==='repair').allowedStatuses,['resolved']);
  assert.ok(!two.control.expectedStatuses.find(row=>row.issueId==='previous-response').allowedStatuses.includes('resolved'));
  assert.equal(two.issues.find(issue=>issue.id==='repair').initialCompletion.status,'pending','The repair occurs only in the later event');
  for(const [id] of cases){
    const profile=getCorrespondenceProfile(id);
    assert.equal(profile.control.authoredFeedbackDoesNotProveCompletion,true,id);
    assert.equal(profile.criteria.nextSteps.doNotUseFutureControlEventInInitialGrade,true,id);
    for(const row of profile.control.expectedStatuses)assert.ok(row.allowedStatuses.every(status=>['pending','resolved','referred'].includes(status)),id);
  }
});

test('all 356 authored date variants bind to their frozen facts and events without leftover placeholders',()=>{
  let checked=0;
  for(const [id,{payload}] of cases)for(const pack of payload.template.datePacks){
    const c=frozenContext(id,pack.id),profile=getCorrespondenceProfile(c);
    assert.ok(profile,id+'/'+pack.id);
    assert.equal(profile.provenance.frozenSourceMatched,true);
    assert.equal(profile.dateBinding.datePackId,pack.id);
    assert.deepEqual(profile.dateBinding.unresolvedTokenKeys,[],id+'/'+pack.id);
    assert.equal(/\{\{[A-Za-z_]\w*\}\}/.test(JSON.stringify(profile)),false,id+'/'+pack.id);
    assert.deepEqual(profile.calendar.events,c.public.assessment.calendar.events);
    for(const issue of profile.issues)for(const claim of issue.claims)assert.equal(claim.text,c.facts.find(fact=>fact.id===claim.id).text.ru);
    assert.equal(profile.control.prompt,c.followup.intro.ru);
    checked++;
  }
  assert.equal(checked,356);
});

test('changed source identities and conflicting date origins cannot receive an old grading key',()=>{
  const c=frozenContext('insurance-collective','a');
  const unversioned=structuredClone(c);delete unversioned.provenance;
  assert.equal(getCorrespondenceProfile(unversioned),null);
  assert.equal(publicCorrespondenceProfile(unversioned),null);
  const unbound=structuredClone(c);unbound.provenance.dateValues={};unbound.public.assessment.calendar.events=[];
  assert.equal(getCorrespondenceProfile(unbound),null);
  assert.equal(publicCorrespondenceProfile(unbound),null);
  const unknownPack=structuredClone(c);unknownPack.datePackId='not-authored';
  assert.equal(getCorrespondenceProfile(unknownPack),null);
  const wrongHash=structuredClone(c);wrongHash.provenance.sourceSHA256='0'.repeat(64);
  assert.equal(getCorrespondenceProfile(wrongHash),null);
  assert.equal(publicCorrespondenceProfile(wrongHash),null);
  const wrongIdentity=structuredClone(c);wrongIdentity.provenance.sourceCaseId='insurance-individual-refusal';
  assert.equal(getCorrespondenceProfile(wrongIdentity),null);
  const wrongVersion=structuredClone(c);wrongVersion.provenance.sourceContentVersion='old-edition';
  assert.equal(getCorrespondenceProfile(wrongVersion),null);
  const inconsistent=structuredClone(c),event=inconsistent.public.assessment.calendar.events[0];
  inconsistent.provenance.dateValues[event.id+'ISO']='2024-01-01';
  assert.equal(getCorrespondenceProfile(inconsistent),null);
  assert.equal(getCorrespondenceProfile('unknown-case'),null);
  assert.equal(publicCorrespondenceProfile('unknown-case'),null);
  const payload=structuredClone(cases.get('hatch').payload);payload.template.id='unknown-case';
  assert.throws(()=>compileCorrespondenceProfile(payload),/No authored correspondence profile/);
});

test('public institution labels and localisation never manufacture an official issuer',()=>{
  for(const [id] of cases){
    const view=publicCorrespondenceProfile(id);
    if(view.issuer.kind==='neutral-label')assert.equal(view.issuer.name,'Подразделение по работе с обращениями');
    else assert.match(view.issuer.name,/^Аппарат Совета депутатов муниципального округа /);
  }
  assert.equal(publicCorrespondenceProfile('budget').issuer.kind,'authored-institution');
  const c=frozenContext('hatch','a');c.public.title.en='A hatch on the way to school';c.public.role.title.en='Public reception specialist';
  const en=publicCorrespondenceProfile(c,'en-US');
  assert.equal(en.caseTitle,'A hatch on the way to school');
  assert.equal(en.sections.facts,'Established circumstances');
  assert.equal(en.role.title,'Public reception specialist');
  assert.equal(en.issuer.name,'Public enquiries department');
  assert.equal(publicCorrespondenceProfile(c,'zh').sections.facts,'已查明的情况');
  assert.equal(publicCorrespondenceProfile(c,'unsupported').locale,'ru');
});
