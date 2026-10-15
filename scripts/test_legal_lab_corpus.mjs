/** Independent corpus/score regression. Never edits source data or fixtures. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {contentHash,verifyBank,expandIds,gradeTask,scoreDossier,assessmentReady,selectionLimit} from '../site/apps/legal-lab/lib/core.mjs';
import {localizeContent} from '../site/apps/legal-lab/locales/content.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const value=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const output=resolve(value('--output',resolve(root,'../evidence/runs/20261015-legal-lab/independent-qa/corpus')));
const preliminary=args.includes('--allow-incomplete'),checks=[];
const read=async f=>JSON.parse(await readFile(resolve(root,'site/apps/legal-lab/data',f),'utf8'));
const [catalog,bank,cases,scans]=await Promise.all(['catalog.json','bank.json','cases.json','scans.json'].map(read));
const docs=await Promise.all(catalog.documents.map(d=>read(d.file)));
function check(name,fn){try{fn();checks.push({name,status:'pass'});}catch(e){checks.push({name,status:'fail',error:e.message});}}
check('16 documents, 14 primary, 52 classroom, 2 extra, 24 dossiers',()=>{assert.equal(docs.length,16);assert.equal(catalog.documents.filter(d=>d.main).length,14);assert.equal(bank.classroom.length,52);assert.equal(bank.extra.length,2);assert.equal(cases.length,24);});
check('Unique references, TOC, scan rectangles and assessment separation',()=>assert.deepEqual(verifyBank(catalog,bank,cases,scans,docs),[]));
check('Single content version',()=>{assert.equal(bank.contentVersion,catalog.contentVersion);for(const d of docs)assert.equal(d.version,catalog.contentVersion,d.id);});
for(const d of docs){
 const meta=catalog.documents.find(x=>x.id===d.id),hash=await contentHash(d.units);
 const fileHash=createHash('sha256').update(await readFile(resolve(root,'site/apps/legal-lab/data',meta.file))).digest('hex');
 check(`${d.id}: verified text hash, TOC and aliases`,()=>{
  assert.equal(hash,d.sha256);assert.equal(hash,meta.sha256);assert.equal(meta.unitCount,d.units.length);
  const sections=new Map(d.sections.map(s=>[s.id,s]));const units=new Map(d.units.map(u=>[u.id,u]));
  assert.equal(sections.size,d.sections.length);
  for(const u of d.units){assert.ok(u.text?.trim()||u.imageUrl,`${u.id} is empty`);assert.ok(sections.get(u.sectionId)?.unitIds.includes(u.id),`unreachable unit ${u.id}`);}
  for(const s of d.sections)for(const id of s.unitIds)assert.equal(units.get(id)?.sectionId,s.id,`ambiguous TOC ${id}`);
 });
 check(`${d.id}: complete reviewed document and raw file hash`,()=>{if(preliminary)return;assert.equal(d.coverage,'full');assert.equal(meta.coverage,'full');assert.equal(meta.reviewStatus,'reviewed');assert.equal(meta.fileSha256,fileHash);assert.ok(d.sections.length>0);assert.ok(d.units.some(u=>/стать[яи]|приложени|пункт|раздел/i.test(u.locator||u.text)));assert.doesNotMatch(d.revisionLabel,/выдержки|не установлена/i);});
}
check('Scoring release gate',()=>{if(!preliminary)assert.equal(assessmentReady(catalog,docs).ready,true);});
for(const t of [...bank.classroom,...bank.extra])check(`${t.id}: exact, empty and irrelevant answers`,()=>{
 const selections=expandIds(t.answerSets?.[0]||[],docs),answer=t.kind==='scan'?{hotspot:t.answer}:t.kind==='type'?{type:t.answer}:{docId:t.docId,selections};
 assert.equal(gradeTask(t,answer,docs).fraction,1);assert.equal(gradeTask(t,{},docs).fraction,0);
 if(t.answerSets){assert.ok(selections.length>0);assert.ok(selections.length<=selectionLimit(t,docs));assert.ok(gradeTask(t,{...answer,selections:[...selections,'not-a-real-norm']},docs).fraction<1);}
});
for(const item of cases)check(`${item.id}: all rubric components, empty/extra/unselected-source cases`,()=>{
 const answer={metadata:Object.fromEntries(item.scanQuestions.map(q=>[q.field,q.field])),classifications:Object.fromEntries(item.classificationIds.map(id=>[id,scans.find(s=>s.id===id).actType])),documentIds:item.docIds,selections:expandIds(item.answerSets[0],docs)};
 const full=scoreDossier(item,answer,scans,docs);assert.equal(full.points,5);assert.equal(full.maxPoints,5);assert.equal(full.criteria.length,4);assert.equal(scoreDossier(item,{},scans,docs).points,0);
 assert.ok(scoreDossier(item,{...answer,selections:[...answer.selections,'not-a-real-norm']},scans,docs).points<5);
 assert.equal(scoreDossier(item,{...answer,documentIds:[]},scans,docs).criteria.find(c=>c.id==='evidence').points,0);
 assert.ok(answer.selections.length<=selectionLimit(item,docs));
});
for(const locale of ['ru','en','zh'])check(`${locale}: localized prompts/explanations preserve answers`,()=>{
 const translated=localizeContent(bank,cases,locale);
 for(const [original,list] of [[bank.classroom,translated.bank.classroom],[bank.extra,translated.bank.extra],[cases,translated.cases]])for(let i=0;i<original.length;i++){
  const a=original[i],b=list[i];assert.equal(a.id,b.id);assert.deepEqual(a.answerSets,b.answerSets);assert.equal(a.answer,b.answer);assert.ok(b.prompt?.trim(),`${b.id} prompt is empty`);assert.ok(b.explanation?.trim(),`${b.id} explanation is empty`);
  // Canonical act designations (4146-р, 122-ФЗ) remain Russian source identifiers.
  if(locale!=='ru'){const prose=s=>s.replace(/\d+-[А-Яа-яЁё]{1,4}/g,'');assert.doesNotMatch(prose(b.prompt),/[А-Яа-яЁё]/,`${b.id} prompt`);assert.doesNotMatch(prose(b.explanation),/[А-Яа-яЁё]/,`${b.id} explanation`);}
 }
});
const sourceFiles=['catalog.json','bank.json','cases.json','scans.json','anchors.json',...catalog.documents.map(d=>d.file)];
const hashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,createHash('sha256').update(await readFile(resolve(root,'site/apps/legal-lab/data',p))).digest('hex')])));
const report={status:checks.some(c=>c.status==='fail')?'fail':'pass',exitCode:checks.some(c=>c.status==='fail')?1:0,preliminary,contentVersion:catalog.contentVersion,environment:{node:process.version,nodeExecutable:process.execPath,platform:process.platform,arch:process.arch},command:process.argv,checks,hashes,limitations:['Structural/hash/scoring checks do not independently certify legal currency or completeness of the sources.']};
await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:checks.length,failed:checks.filter(c=>c.status==='fail'),preliminary,output},null,2));process.exitCode=report.status==='pass'?0:1;
