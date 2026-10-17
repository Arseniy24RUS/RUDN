/** Independent corpus/score regression. Never edits source data or fixtures. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {contentHash,verifyBank,expandIds,gradeTask,scoreDossier,assessmentReady,selectionLimit,scanQuestionsFor,SCAN_METADATA_MODE} from '../site/apps/legal-lab/lib/core.mjs';
import {localizeContent,taskCopy} from '../site/apps/legal-lab/locales/content.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const value=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const output=resolve(value('--output',resolve(root,'../evidence/runs/20261015-legal-lab/independent-qa/corpus')));
const preliminary=args.includes('--allow-incomplete'),checks=[];
const read=async f=>JSON.parse(await readFile(resolve(root,'site/apps/legal-lab/data',f),'utf8'));
const [catalog,bank,cases,scans]=await Promise.all(['catalog.json','bank.json','cases.json','scans.json'].map(read));
const docs=await Promise.all(catalog.documents.map(d=>read(d.file)));
const retired=JSON.parse(await readFile(resolve(root,'tests/fixtures/legal-lab-retired-extras.json'),'utf8')),five=await read('assessment-variants.json');
const archiveRoot=resolve(root,'tests/fixtures/legal-lab-retired-corpus'),archivedRead=async f=>JSON.parse(await readFile(resolve(archiveRoot,f),'utf8'));
const [archivedCatalog,archivedCopy,retirement]=await Promise.all(['catalog.json','task-copy.json','retirement-proof.json'].map(archivedRead));
const archivedDocs=await Promise.all(archivedCatalog.documents.map(meta=>archivedRead(meta.id+'.json'))),historicalDocs=[...docs,...archivedDocs];
function check(name,fn){try{fn();checks.push({name,status:'pass'});}catch(e){checks.push({name,status:'fail',error:e.message});}}
check('14 active documents, 52 classroom, no published bonus content, 24 historical dossiers',()=>{assert.equal(docs.length,14);assert.ok(catalog.documents.every(d=>d.main));assert.equal(bank.classroom.length,52);assert.deepEqual(bank.extra,[]);assert.equal(retired.length,2);assert.equal(cases.length,24);for(const t of retired)assert.ok(!Object.hasOwn(taskCopy,t.id));});
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
for(const d of archivedDocs){
 const meta=archivedCatalog.documents.find(m=>m.id===d.id),bytes=await readFile(resolve(archiveRoot,d.id+'.json'));
 check(`${d.id}: frozen historical bytes and canonical hash preserved`,()=>{assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.fileSha256);assert.equal(meta.fileSha256,retirement.fixtureHashes[d.id+'.json']);assert.equal(d.sha256,meta.sha256);assert.equal(d.units.length,meta.unitCount);});
 const hash=await contentHash(d.units);
 check(`${d.id}: historical TOC, aliases and version remain available to regression`,()=>{assert.equal(hash,d.sha256);assert.equal(d.version,catalog.contentVersion);const units=new Map(d.units.map(u=>[u.id,u])),sections=new Map(d.sections.map(s=>[s.id,s]));for(const u of d.units)assert.ok(sections.get(u.sectionId)?.unitIds.includes(u.id));for(const s of d.sections)for(const id of s.unitIds)assert.equal(units.get(id)?.sectionId,s.id);});
}
check('Removed materials are absent from the public corpus and active tasks reference only active acts',()=>{
 const activeIds=new Set(docs.map(d=>d.id));assert.deepEqual(archivedDocs.map(d=>d.id),['archive122','realty218']);
 for(const t of [...bank.classroom,...cases,...five.questionSets])for(const id of [t.docId,...(t.docIds||[])].filter(Boolean))assert.ok(activeIds.has(id),`${t.id||t.docId}: ${id}`);
});
for(const p of ['anchors.json','documents/archive122.json','documents/realty218.json']){let missing=false;try{await readFile(resolve(root,'site/apps/legal-lab/data',p));}catch(e){if(e.code!=='ENOENT')throw e;missing=true;}check(`${p}: not distributed to students`,()=>assert.equal(missing,true));}
for(const t of [...bank.classroom,...retired])check(`${t.id}: exact, empty and irrelevant answers`,()=>{
 const selections=expandIds(t.answerSets?.[0]||[],historicalDocs),answer=t.kind==='scan'?{hotspot:t.answer}:t.kind==='type'?{type:t.answer}:{docId:t.docId,selections};
 assert.equal(gradeTask(t,answer,historicalDocs).fraction,1);assert.equal(gradeTask(t,{},historicalDocs).fraction,0);
 if(t.answerSets){assert.ok(selections.length>0);assert.ok(selections.length<=selectionLimit(t,historicalDocs));assert.ok(gradeTask(t,{...answer,selections:[...selections,'not-a-real-norm']},historicalDocs).fraction<1);}
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
 // Removed situation translations are frozen fixtures, not shipped application copy.
 translated.bank.extra=retired.map(t=>({...t,...archivedCopy[t.id]?.ru,...archivedCopy[t.id]?.[locale]}));
 for(const [original,list] of [[bank.classroom,translated.bank.classroom],[retired,translated.bank.extra],[cases,translated.cases]])for(let i=0;i<original.length;i++){
  const a=original[i],b=list[i];assert.equal(a.id,b.id);assert.deepEqual(a.answerSets,b.answerSets);assert.equal(a.answer,b.answer);assert.ok(b.prompt?.trim(),`${b.id} prompt is empty`);assert.ok(b.explanation?.trim(),`${b.id} explanation is empty`);
  // Canonical act designations (4146-р, 122-ФЗ) remain Russian source identifiers.
  if(locale!=='ru'){const prose=s=>s.replace(/\d+-[А-Яа-яЁё]{1,4}/g,'');assert.doesNotMatch(prose(b.prompt),/[А-Яа-яЁё]/,`${b.id} prompt`);assert.doesNotMatch(prose(b.explanation),/[А-Яа-яЁё]/,`${b.id} explanation`);}
 }
});

check('Five-task bank is separate from the quiz and preserves full familiar tasks',()=>{
 assert.equal(five.schema,1);assert.equal(five.format,'five-task-v1');assert.equal(five.contentVersion,catalog.contentVersion);
 assert.equal(five.questionSets.length,8);assert.equal(new Set(five.variants.map(v=>v.id)).size,five.variants.length);
 const pool=scans.filter(s=>s.split==='assessment'),classroomScans=new Set(bank.classroom.map(t=>t.scanId).filter(Boolean));
 assert.equal(pool.length,14);assert.equal(five.variants.length,pool.length*(pool.length-1)*five.questionSets.length);
 for(const s of pool)assert.ok(!classroomScans.has(s.id),'Assessment scans never repeat a quiz scan');
 const shared=new Set(bank.classroom.flatMap(t=>(t.answerSets||[]).flat()));
 for(const q of five.questionSets){assert.equal(q.tasks.length,3);assert.ok(docs.some(d=>d.id===q.docId));for(const t of q.tasks){assert.equal(t.docId,q.docId);assert.equal(t.kind,'text');for(const set of t.answerSets)for(const id of set){assert.ok(!shared.has(id),'New question does not repeat a quiz target');assert.ok(docs.find(d=>d.id===q.docId).units.some(u=>u.id===id));}for(const locale of ['en','zh']){assert.ok(t.i18n[locale].prompt.trim());assert.doesNotMatch(t.i18n[locale].prompt.replace(/\d+-[А-Яа-яЁё]{1,4}/g,''),/[А-Яа-яЁё]/);}}}
});
check('Every new variant: all five points, empty answer, one wrong detail and extra evidence',()=>{
 const sets=new Map(five.questionSets.map(q=>[q.docId,q.tasks]));
 for(const variant of five.variants){
  const scan=scans.find(s=>s.id===variant.scanId),type=scans.find(s=>s.id===variant.typeScanId),source=docs.find(d=>d.id===variant.questionSet);
  assert.equal(scan.split,'assessment');assert.equal(type.split,'assessment');assert.notEqual(scan.id,type.id);
  const item={id:variant.id,format:five.format,tasks:[{id:'scan',kind:'scan',scanId:scan.id},{id:'type',kind:'type',scanId:type.id,answer:type.actType},...sets.get(variant.questionSet)]};
  const answer={assessmentMode:five.format,tasks:{scan:{metadataMode:SCAN_METADATA_MODE,metadata:Object.fromEntries(scanQuestionsFor(scan).map(q=>[q.field,q.field]))},type:{type:type.actType}}};
  for(const t of sets.get(variant.questionSet))answer.tasks[t.id]={docId:t.docId,selections:expandIds(t.answerSets[0],[source])};
  const full=scoreDossier(item,answer,scans,[source]);assert.equal(full.points,5,variant.id);assert.equal(full.criteria.length,5);assert.ok(full.criteria.every(c=>c.max===1&&c.points===1));
  assert.equal(scoreDossier(item,{assessmentMode:five.format,tasks:{}},scans,[source]).points,0);
  const partial=structuredClone(answer),fields=scanQuestionsFor(scan);partial.tasks.scan.metadata[fields[0].field]=fields[1].field;assert.ok(scoreDossier(item,partial,scans,[source]).points<5);
  const extra=structuredClone(answer);extra.tasks[sets.get(variant.questionSet)[0].id].selections.push('not-a-real-norm');assert.ok(scoreDossier(item,extra,scans,[source]).points<5);
 }
});

const sourceFiles=['assessment-variants.json','catalog.json','bank.json','cases.json','scans.json','report-references.json',...catalog.documents.map(d=>d.file)];
const hashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,createHash('sha256').update(await readFile(resolve(root,'site/apps/legal-lab/data',p))).digest('hex')])));
const historicalHashes=Object.fromEntries(await Promise.all(Object.keys(retirement.fixtureHashes).map(async p=>[p,createHash('sha256').update(await readFile(resolve(archiveRoot,p))).digest('hex')])));
check('All historical evidence files retain their recorded byte hashes',()=>assert.deepEqual(historicalHashes,retirement.fixtureHashes));
const report={status:checks.some(c=>c.status==='fail')?'fail':'pass',exitCode:checks.some(c=>c.status==='fail')?1:0,preliminary,contentVersion:catalog.contentVersion,environment:{node:process.version,nodeExecutable:process.execPath,platform:process.platform,arch:process.arch},command:process.argv,checks,hashes,historicalHashes,limitations:['Structural/hash/scoring checks do not independently certify legal currency or completeness of the sources.','Retired source files are historical regression evidence only; their original metadata is not a current completeness approval.']};
await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:checks.length,failed:checks.filter(c=>c.status==='fail'),preliminary,output},null,2));process.exitCode=report.status==='pass'?0:1;
