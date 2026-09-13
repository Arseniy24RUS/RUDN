// Compatibility checks against the untouched authored bank and pre-refactor work.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as original from '../js/cases.js';
import * as evidence from '../js/evidence-catalog.js';
import {SOURCE_INDEX as originalIndex} from '../js/source-index.js';
import * as library from '../js/content-library.js';
import {createAssignment} from '../js/assignment.js';
import {newShiftPrepared,restoreShift,summary} from '../js/engine.js';
import {createSourceSnapshot} from '../js/source-lifecycle.js';
const clone=value=>structuredClone(value);
const unfinished=JSON.parse(await readFile(new URL('fixtures/in-progress.json',import.meta.url),'utf8'));
const finished=JSON.parse(await readFile(new URL('fixtures/completed.json',import.meta.url),'utf8'));
assert.equal(library.loadedContentIds().length,0,'no complete case loaded at module import');
assert.equal(library.SOURCES.length,0,'no common source pack loaded at module import');
await assert.rejects(()=>library.hydrateTemplates(['unknown-synthetic-case']),{code:'content/unknown-template'});
assert.equal(library.loadedContentIds().length,0,'unknown assignment did not substitute new cases');
await library.hydrateSavedShift(unfinished);
assert.deepEqual(library.loadedContentIds().sort(),unfinished.assignment.manifest.map(m=>m.templateId).sort(),'only assigned cases loaded');
const restored=restoreShift(clone(unfinished),unfinished.owner,unfinished.mode,unfinished.period);
assert.deepEqual(restored,unfinished,'legacy answers, dates, seed, state and snapshot preserved');
await library.hydrateSavedShift(finished.state);
assert.deepEqual(restoreShift(clone(finished.state),finished.state.owner,finished.state.mode,finished.state.period),finished.state,'completed legacy work remains completed');
assert.deepEqual(summary(finished.state),finished.summary,'completed score and explanations unchanged');
const fresh=await newShiftPrepared(unfinished.owner,unfinished.mode,{period:unfinished.period,seed:unfinished.seed,calendarYear:unfinished.calendarYear,calendarSnapshot:unfinished.calendarSnapshot});
assert.deepEqual(fresh.assignment,unfinished.assignment,'identical seed yields identical legacy assignment');
const expectedSnapshot=createSourceSnapshot(fresh.assignment.manifest.map(m=>original.CASE_TEMPLATES.find(c=>c.id===m.templateId)),{shelf:original.SOURCES,records:evidence.EVIDENCE_RECORDS,tasks:evidence.EVIDENCE_TASKS,index:originalIndex,createdAt:fresh.sourceSnapshot.createdAt});
assert.deepEqual(fresh.sourceSnapshot,expectedSnapshot,'new source snapshot uses exact original order/content/checksum');

// Run the unchanged assignment algorithm against the original full bank as an
// independent reference; the runtime version uses only lightweight metadata.
const evidenceURL=new URL('../js/evidence-catalog.js',import.meta.url).href,bankURL=new URL('../js/cases.js',import.meta.url).href,policyURL=new URL('../js/policy.js',import.meta.url).href;
const assignmentSource=(await readFile(new URL('../js/assignment.js',import.meta.url),'utf8'))
 .replace("import {EVIDENCE_VERSION,CASES,CASE_TEMPLATES,CONTENT_VERSION,datedCaseBank} from './content-library.js';",`import {EVIDENCE_VERSION} from '${evidenceURL}'; import {CASES,CASE_TEMPLATES,CONTENT_VERSION,datedCaseBank} from '${bankURL}';`)
 .replace("from './policy.js'",`from '${policyURL}'`);
const reference=await import('data:text/javascript;base64,'+Buffer.from(assignmentSource).toString('base64'));
for(let i=0;i<200;i++){
 const options={seed:`compatibility-${i}`,mode:i%2?'practice':'assessment',profileId:i%3?'balanced-six':'extended-eight',calendarYear:unfinished.calendarYear,calendarSnapshot:unfinished.calendarSnapshot,recentCaseIds:i%4?unfinished.caseIds:[]};
 assert.deepEqual(createAssignment(options),reference.createAssignment(options),`same variant/dates/coverage for seed ${i}`);
}
const beforeCatalog=library.loadedContentIds();await library.loadCaseCatalog();
assert.deepEqual(library.loadedContentIds(),beforeCatalog,'opening searchable catalog does not hydrate all cases');
await library.hydrateTemplates(original.CASE_TEMPLATES.map(c=>c.id));
assert.deepEqual(library.CASE_TEMPLATES,original.CASE_TEMPLATES,'all split templates are byte-equivalent JSON content');
assert.deepEqual(library.CASES,original.CASES,'all dated variants preserve canonical content');
await library.loadSourceIndex();assert.deepEqual(library.SOURCE_INDEX,originalIndex,'full editor index loads only explicitly, unchanged');
console.log(JSON.stringify({legacyInProgress:true,legacyCompleted:true,snapshotExact:true,seeds:200,templates:library.CASE_TEMPLATES.length,variants:library.CASES.length,catalogDoesNotHydrateBank:true}));
