// Run only after the publication-gated real translation build, never fixtures.
import assert from 'node:assert/strict';
import {unapprovedCyrillic} from './validation.js';
assert.equal(unapprovedCyrillic('依据第210-ФЗ号法律','依据第210-ФЗ号法律'),false,'Rechecking translated Chinese preserves the exact source-present legal code');
assert.equal(unapprovedCyrillic('第210-ФЗ号法律','第999-ФЗ号法律'),true,'An invented legal code is not exempt');
assert.equal(unapprovedCyrillic('第210-ФЗ号法律','第210-ФЗ号法律 законодательная'),true,'Legal identifiers never permit Russian prose');
import {aliases} from './compiled/evidence-aliases.js';
import {EVIDENCE_TASKS} from '../js/evidence-catalog.js';
import {evidenceChecks} from '../js/evidence.js';
import {registerEvidenceLocaleAliases} from '../js/evidence-locale-aliases.js';
const sourceBefore=JSON.stringify(EVIDENCE_TASKS);
const caseFor=task=>({evidenceTaskId:task.id,_sourceSnapshot:{tasks:{[task.id]:task}}});
const answer=(task,value)=>({...task.bindings[0],extracted:value,finding:task.correctFinding});
const historic=Object.values(EVIDENCE_TASKS).flatMap(task=>task.extracted.accepted.map(value=>({task,value,result:evidenceChecks(caseFor(task),answer(task,value))})));
registerEvidenceLocaleAliases(aliases);
let translatedAnswers=0;
for(const row of aliases){
 const task=Object.values(EVIDENCE_TASKS).find(task=>task.id===row.taskId&&JSON.stringify(task.extracted.accepted)===JSON.stringify(row.accepted));
 assert(task,'Compiled answer aliases must match the exact canonical task and accepted values');
 for(const value of row.values)for(const language of ['en','zh']){
  const a=answer(task,value[language]),before=JSON.stringify(a);
  assert.equal(evidenceChecks(caseFor(task),a).total,12,row.taskId+'/'+language);
  assert.equal(JSON.stringify(a),before,'User input is not rewritten');translatedAnswers++;
 }
 assert.equal(evidenceChecks(caseFor(task),answer(task,'This answer is deliberately unrelated')).extracted,false);
 assert.equal(evidenceChecks(caseFor(task),answer(task,'')).extracted,false);
}
for(const {task,value,result}of historic)assert.deepEqual(evidenceChecks(caseFor(task),answer(task,value)),result,'Historical answer unchanged');
assert.equal(JSON.stringify(EVIDENCE_TASKS),sourceBefore);
console.log(JSON.stringify({actualCompiledTasks:aliases.length,translatedAnswers,historicAnswers:historic.length,canonicalKeysUnchanged:true}));
