import assert from 'node:assert/strict';
import {EVIDENCE_TASKS} from '../js/evidence-catalog.js';
import {evidenceChecks,normalizeEvidence} from '../js/evidence.js';
import {registerEvidenceLocaleAliases,evidenceLocaleAliases} from '../js/evidence-locale-aliases.js';
import {referenceUnit} from '../js/legal-reference.js';

const snapshot=JSON.stringify(EVIDENCE_TASKS);
const caseFor=task=>({evidenceTaskId:task.id,_sourceSnapshot:{tasks:{[task.id]:task}}});
const answerFor=(task,extracted)=>({...task.bindings[0],extracted,finding:task.correctFinding});
const historic=[];
for(const task of Object.values(EVIDENCE_TASKS))for(const accepted of task.extracted.accepted)historic.push([task,accepted,evidenceChecks(caseFor(task),answerFor(task,accepted))]);
const table=new Map([
 ['Москва',{en:'Moscow',zh:'莫斯科'}],
 ['г Москва',{en:'Moscow city',zh:'莫斯科市'}],
 ['город Москва',{en:'City of Moscow',zh:'莫斯科市'}],
 ['учредитель МФЦ',{en:'Founding authority of the service centre',zh:'公共服务中心举办机关'}],
 ['учредителю МФЦ',{en:'To the founding authority of the service centre',zh:'向公共服务中心举办机关'}],
 ['учредитель многофункционального центра',{en:'Founding authority of the multifunctional service centre',zh:'多功能公共服务中心举办机关'}],
 ['учредителю многофункционального центра',{en:'To the founding authority of the multifunctional service centre',zh:'向多功能公共服务中心举办机关'}],
]);
const tasks=Object.values(EVIDENCE_TASKS).filter(task=>['text','role'].includes(task.extracted.normalize)&&task.extracted.accepted.every(value=>table.has(value)));
assert(tasks.some(task=>task.extracted.normalize==='role'));assert(tasks.some(task=>task.extracted.accepted.includes('Москва')));
for(const task of tasks) {
 const row={taskId:task.id,normalize:task.extracted.normalize,accepted:[...task.extracted.accepted],values:task.extracted.accepted.map(source=>({source,...table.get(source)}))};
 const c=caseFor(task);
 registerEvidenceLocaleAliases([row]);registerEvidenceLocaleAliases([structuredClone(row)]);
 for(const source of task.extracted.accepted)for(const locale of ['en','zh','en','zh']){
  const raw=table.get(source)[locale],answer=answerFor(task,raw),before=JSON.stringify(answer);
  assert.equal(evidenceChecks(c,answer).total,12,'Same canonical fact in either language receives the original full mark');
  assert.equal(JSON.stringify(answer),before,'The saved free-text answer is never rewritten');
  assert.equal(evidenceChecks(c,{...answer,recordId:'unbound'}).total,0,'Translated correct fact cannot bypass source binding');
 }
 assert.equal(evidenceChecks(c,answerFor(task,'Unrelated incorrect answer')).extracted,false);
 assert.equal(evidenceChecks(c,answerFor(task,'')).extracted,false);
 assert.equal(evidenceLocaleAliases({...task,id:task.id+'-different'}).length,0,'Aliases do not apply to another task ID');
 assert.equal(evidenceLocaleAliases({...task,extracted:{...task.extracted,accepted:[...task.extracted.accepted,'different historical criterion']}}).length,0,'Different historical source snapshot never receives a current key overlay');
 const corrupt={...row,values:row.values.map(value=>({...value,en:'arbitrary changed answer'}))};assert.throws(()=>registerEvidenceLocaleAliases([corrupt]),/Conflicting/);
 assert.throws(()=>registerEvidenceLocaleAliases([{...row,values:row.values.map(value=>({...value,source:'student input'}))}]),/Invalid/);
}
for(const [task,accepted,before]of historic)assert.deepEqual(evidenceChecks(caseFor(task),answerFor(task,accepted)),before,'All historical Russian/numeric grading is unchanged');
assert.equal(JSON.stringify(EVIDENCE_TASKS),snapshot,'Canonical keys never mutated');
for(const value of ['11','статья 11','Article 11','art. 11','第11条'])assert.equal(referenceUnit(value), '11');
for(const value of ['11','часть 11','Part 11','pt. 11','第11款'])assert.equal(normalizeEvidence(value,'part'),'11');
for(const value of ['11','статья 11','Article 11','art. 11','第11条'])assert.equal(normalizeEvidence(value,'article'),'11');
for(const value of ['99.2','пункт 99.2','Clause 99.2','paragraph 99.2','第99.2项'])assert.equal(referenceUnit(value,{unitKind:'clause'}),'99.2');
for(const value of ['Part 11','第11款','Clause 11','第11项','Article 11 and 12','Article 11 extra','Law 59 Article 11'])assert.equal(referenceUnit(value),'','Wrong units/extra numeric identifiers rejected');
for(const value of ['Article 11','第11条','Part 11 and 12','第11款第12款'])assert.equal(normalizeEvidence(value,'part'),'');
for(const value of ['Article 99.2','第99.2条','Part 99.2','第99.2款'])assert.equal(referenceUnit(value,{unitKind:'clause'}),'');
console.log(JSON.stringify({exactTasks:tasks.length,historicAnswers:historic.length,bothLanguages:true,unchangedCanonical:true,wrongAnswersRejected:true,typedValuesPreserved:true,unitSpecificParsing:true}));
