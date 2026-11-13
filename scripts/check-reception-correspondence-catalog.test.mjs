import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createCorrespondenceQACase} from './reception-correspondence-qa-cases.mjs';
import {checkCorrespondenceCatalog,inspectCorrespondenceVariant} from './check-reception-correspondence-catalog.mjs';
import {instantiateCase} from '../site/apps/reception/js/cases.js';
import {validateCase} from '../firebase/functions/reception-ai/schema.mjs';
const T=value=>({ru:value,en:value,zh:value});
const sourceBytes=await readFile(new URL('../site/apps/reception/content/cases/several-repair-and-complaint.json',import.meta.url),'utf8');
const source=JSON.parse(sourceBytes).template;
const sourceHash=createHash('sha256').update(sourceBytes).digest('hex');

// One local QA dossier exercises the checker. This is not a production exporter.
async function fixture(packId='a'){
  const c=await createCorrespondenceQACase(),t=instantiateCase(source,packId);
  c.datePackId=packId;
  c.provenance={sourceCaseId:c.id,sourceContentVersion:source.contentVersion,sourceSHA256:sourceHash,calendarYear:t.calendarYear,dateValues:t.dateValues};
  c.public.opening=T(t.opening);c.public.role={title:T(t.role.title),text:T(t.role.text)};
  c.public.date=t.dateValues.registeredISO;
  c.public.assessment.calendar.events=t.calendar.events.map(event=>({id:event.id,label:T(event.text||event.label||event.id),date:event.date}));
  for(const doc of c.documents)doc.text=T(t.documents.find(row=>row.id===doc.id).text);
  for(const fact of c.facts)fact.text=T(t.questions.find(row=>row.id===fact.id).answer);
  c.rubric.authored.calendar={anchor:t.calendar.anchor,rule:t.calendar.correctRule,start:t.calendar.startPolicy,acceptedShifts:t.calendar.acceptedLastDayPolicies.map(value=>value==='next_working_day'?'next_working':value)};
  c.followup={intro:T(t.followup.intro),options:t.followup.options.map(option=>({id:option.id,label:T(option.text)})),correct:t.followup.correct,explanation:T(t.followup.explain),success:T(t.followup.success),failure:T(t.followup.failure)};
  return validateCase(c);
}

test('the inspector binds both frozen variants and builds initial/control contexts without a model',async()=>{
  for(const id of ['a','b']){
    const result=inspectCorrespondenceVariant(await fixture(id));
    assert.deepEqual(result.errors,[]);
    assert.equal(result.reviewContexts,2);
  }
});

test('the inspector fails closed for missing provenance, wrong SHA and inconsistent frozen dates',async()=>{
  const missing=await fixture();delete missing.provenance;
  assert.ok(inspectCorrespondenceVariant(missing).errors.some(row=>row.code==='missing_provenance'));
  const stale=await fixture();stale.provenance.sourceSHA256='0'.repeat(64);
  assert.ok(inspectCorrespondenceVariant(stale).errors.some(row=>row.code==='source_sha256_mismatch'));
  const conflict=await fixture();conflict.provenance.dateValues.registeredISO='2024-01-01';
  assert.ok(inspectCorrespondenceVariant(conflict).errors.some(row=>row.code==='calendar_provenance_conflict'));
  const unresolved=await fixture();unresolved.documents[0].text=T('{{registered}}');
  assert.ok(inspectCorrespondenceVariant(unresolved).errors.some(row=>row.code==='unresolved_dossier_documents'));
});

test('the complete-bank gate requires 178 IDs and both variants and leaves supplied files unchanged',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'correspondence-catalog-'));
  try{
    const c=await fixture();c.dateVariants=[await fixture('b')];
    const file=join(directory,c.id+'.json'),bytes=JSON.stringify(c);
    await writeFile(file,bytes);
    const report=await checkCorrespondenceCatalog({casesDirectory:directory});
    assert.equal(report.status,'FAIL');
    assert.equal(report.expected.cases,178);assert.equal(report.expected.dateVariants,356);
    assert.equal(report.observed.supportedVariants,2);assert.equal(report.observed.reviewContexts,4);
    assert.equal(report.errors.filter(row=>row.code==='missing_case').length,177);
    assert.equal(report.liveFirebaseVerified,false);
    assert.equal(await readFile(file,'utf8'),bytes);assert.deepEqual(await readdir(directory),[c.id+'.json']);
    delete c.dateVariants;await writeFile(file,JSON.stringify(c));
    const incomplete=await checkCorrespondenceCatalog({casesDirectory:directory});
    assert.ok(incomplete.errors.some(row=>row.code==='missing_date_variant'&&row.caseId===c.id&&row.datePackId==='b'));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('CLI fails with sanitized JSON for bad inputs and never prints private text or a path',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'correspondence-catalog-'));
  try{
    const secret='PRIVATE_TEXT_SHOULD_NEVER_APPEAR';
    await writeFile(join(directory,'broken.json'),JSON.stringify({id:'several-repair-and-complaint',privateText:secret}));
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./check-reception-correspondence-catalog.mjs',import.meta.url)),'--cases',directory],{encoding:'utf8'});
    assert.equal(result.status,1);assert.equal(result.stderr,'');
    const report=JSON.parse(result.stdout);
    assert.ok(report.errors.some(row=>row.code==='invalid_private_schema'));
    assert.ok(!result.stdout.includes(secret));assert.ok(!result.stdout.includes(directory));
    assert.deepEqual(Object.keys(report.errors[0]).sort(),['caseId','code','datePackId']);
    const bad=await checkCorrespondenceCatalog({casesDirectory:'relative/path'});
    assert.deepEqual(bad.errors,[{code:'absolute_cases_directory_required',caseId:null,datePackId:null}]);
  }finally{await rm(directory,{recursive:true,force:true});}
});
