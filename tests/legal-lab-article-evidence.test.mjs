import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonicalArticleSelections} from '../site/apps/legal-lab/lib/article-evidence.mjs';
import {gradeEvidence,expandIds,contentHash} from '../site/apps/legal-lab/lib/core.mjs';
const data=new URL('../site/apps/legal-lab/data/',import.meta.url),json=async path=>JSON.parse(await readFile(new URL(path,data),'utf8'));
const [catalog,bank,cases]=await Promise.all(['catalog.json','bank.json','cases.json'].map(json));
const retired=JSON.parse(await readFile(new URL('./fixtures/legal-lab-retired-extras.json',import.meta.url),'utf8'));
assert.deepEqual(bank.extra,[]);assert.equal(retired.length,2);
const archivedCatalog=JSON.parse(await readFile(new URL('./fixtures/legal-lab-retired-corpus/catalog.json',import.meta.url),'utf8'));
const archivedDocs=await Promise.all(archivedCatalog.documents.map(meta=>readFile(new URL('./fixtures/legal-lab-retired-corpus/'+meta.id+'.json',import.meta.url),'utf8').then(JSON.parse)));
const docs=[...await Promise.all(catalog.documents.map(meta=>json(meta.file))),...archivedDocs],byDoc=new Map(docs.map(doc=>[doc.id,doc]));
// Exact reviewed section/header identities, independent of runtime's guarded body table.
const reviewed = [
  {
    "docId": "archive122",
    "sectionId": "archive122-s8",
    "heads": [
      "archive122-u911ed526f9a647f3cc-1"
    ]
  },
  {
    "docId": "civil79",
    "sectionId": "civil79-s12",
    "heads": [
      "civil79-u4d775e315795606208-1"
    ]
  },
  {
    "docId": "civil79",
    "sectionId": "civil79-s18",
    "heads": [
      "civil79-u8514ecffa396770dfa-1"
    ]
  },
  {
    "docId": "civil79",
    "sectionId": "civil79-s37",
    "heads": [
      "civil79-u0dea586a0697d1c736-1"
    ]
  },
  {
    "docId": "constitution",
    "sectionId": "constitution-s14",
    "heads": [
      "constitution-uef487aaa43bb47e948-1"
    ]
  },
  {
    "docId": "constitution",
    "sectionId": "constitution-s81",
    "heads": [
      "constitution-u4cfc020ae26075ec9c-1"
    ]
  },
  {
    "docId": "constitution",
    "sectionId": "constitution-s82",
    "heads": [
      "constitution-u879c9e1441f65ced8c-1"
    ]
  },
  {
    "docId": "constitution",
    "sectionId": "constitution-s117",
    "heads": [
      "constitution-ua258597def4c307226-1"
    ]
  },
  {
    "docId": "constitution",
    "sectionId": "constitution-s122",
    "heads": [
      "constitution-uf091120954cfa1532c-1"
    ]
  },
  {
    "docId": "constitution",
    "sectionId": "constitution-s150",
    "heads": [
      "constitution-ub5e150c7a74ad063fc-1"
    ]
  },
  {
    "docId": "corruption273",
    "sectionId": "corruption273-s10",
    "heads": [
      "corruption273-u210846cc4ac54ad79d-1"
    ]
  },
  {
    "docId": "corruption273",
    "sectionId": "corruption273-s14",
    "heads": [
      "corruption273-uec2a0901e479d20146-1"
    ]
  },
  {
    "docId": "corruption273",
    "sectionId": "corruption273-s15",
    "heads": [
      "corruption273-ue615c511b2c98d6523-1"
    ]
  },
  {
    "docId": "corruption273",
    "sectionId": "corruption273-s17",
    "heads": [
      "corruption273-u09b3b8b4f7e06a7d84-1"
    ]
  },
  {
    "docId": "ekb",
    "sectionId": "ekb-s32",
    "heads": [
      "ekb-u6f257ec9e9f42438aa-1"
    ]
  },
  {
    "docId": "koap",
    "sectionId": "koap-s9",
    "heads": [
      "koap-u8754de8330b4069847-1",
      "koap-u8d6de0e2b3e3486a48-1"
    ]
  },
  {
    "docId": "koap",
    "sectionId": "koap-s15",
    "heads": [
      "koap-u5fece65c704862a2ee-1",
      "koap-u0df14950d0a61d3625-1"
    ]
  },
  {
    "docId": "koap",
    "sectionId": "koap-s16",
    "heads": [
      "koap-uce9bb1372cd745617e-1",
      "koap-ub1f61212107ffc41fc-1"
    ]
  },
  {
    "docId": "local33",
    "sectionId": "local33-s18",
    "heads": [
      "local33-u3df4250bac692383c5-1"
    ]
  },
  {
    "docId": "local33",
    "sectionId": "local33-s26",
    "heads": [
      "local33-u0e4477c22566b3e9d5-1"
    ]
  },
  {
    "docId": "local33",
    "sectionId": "local33-s48",
    "heads": [
      "local33-u2955347842260be837-1"
    ]
  },
  {
    "docId": "moscow3",
    "sectionId": "moscow3-s3",
    "heads": [
      "moscow3-ub7fef20bd3258b2992-1"
    ]
  },
  {
    "docId": "moscow3",
    "sectionId": "moscow3-s9",
    "heads": [
      "moscow3-udb76ec44b26e65ea16-1"
    ]
  },
  {
    "docId": "moscow3",
    "sectionId": "moscow3-s11",
    "heads": [
      "moscow3-u2c3e0729ab752719ba-1"
    ]
  },
  {
    "docId": "moscow50",
    "sectionId": "moscow50-s11",
    "heads": [
      "moscow50-ufc84cf87fa3086a31a-1"
    ]
  },
  {
    "docId": "moscow50",
    "sectionId": "moscow50-s29",
    "heads": [
      "moscow50-u1f276a09471fdedf2b-1"
    ]
  },
  {
    "docId": "municipal25",
    "sectionId": "municipal25-s11",
    "heads": [
      "municipal25-u69eea89021f0c51a4e-1"
    ]
  },
  {
    "docId": "municipal25",
    "sectionId": "municipal25-s16",
    "heads": [
      "municipal25-u35ded2ad4fa63abe00-1"
    ]
  },
  {
    "docId": "municipal25",
    "sectionId": "municipal25-s17",
    "heads": [
      "municipal25-u094f2904742b3b792e-1"
    ]
  },
  {
    "docId": "municipal25",
    "sectionId": "municipal25-s18",
    "heads": [
      "municipal25-uef9bdac256954dc8a3-1"
    ]
  },
  {
    "docId": "municipal25",
    "sectionId": "municipal25-s19",
    "heads": [
      "municipal25-u156a791394bd1982df-1"
    ]
  },
  {
    "docId": "municipal25",
    "sectionId": "municipal25-s28",
    "heads": [
      "municipal25-u55fe9cb57053af814f-1"
    ]
  },
  {
    "docId": "procurement44",
    "sectionId": "procurement44-s5",
    "heads": [
      "procurement44-u84f168cb94a7172160-1"
    ]
  },
  {
    "docId": "procurement44",
    "sectionId": "procurement44-s20",
    "heads": [
      "procurement44-u4e13e1601e3e79e6e2-1"
    ]
  },
  {
    "docId": "procurement44",
    "sectionId": "procurement44-s31",
    "heads": [
      "procurement44-u55a29bd7d50ff4c8b3-1"
    ]
  },
  {
    "docId": "system58",
    "sectionId": "system58-s4",
    "heads": [
      "system58-u405f130b6b617204f0-1"
    ]
  },
  {
    "docId": "system58",
    "sectionId": "system58-s19",
    "heads": [
      "system58-u9602f640dab37e4840-1"
    ]
  }
];
const rules=reviewed.map(rule=>({...rule,body:byDoc.get(rule.docId).sections.find(section=>section.id===rule.sectionId).unitIds.filter(id=>!rule.heads.includes(id))}));
const canonical=ids=>canonicalArticleSelections(ids,docs);
const grade=(ids,sets)=>gradeEvidence(canonical(ids),sets.map(set=>canonical(expandIds(set,docs))),docs);

test('all 37 reviewed mappings match real complete sections in SHA-verified corpus',async()=>{
  assert.equal(rules.length,37);
  for(const doc of docs)assert.equal(await contentHash(doc.units),doc.sha256,doc.id);
  for(const rule of rules){
    const original=structuredClone(byDoc.get(rule.docId));assert.ok(rule.body.length);
    for(const head of rule.heads)assert.deepEqual(canonical([head]),rule.body,head);
    assert.deepEqual(canonical(rule.heads),rule.body,rule.sectionId+' duplicate headings');
    assert.deepEqual(canonical(rule.body),rule.body,rule.sectionId+' body identities');
    assert.deepEqual(byDoc.get(rule.docId),original,'No corpus mutation');
  }
});

test('actual 38 Q tasks, two extras and 24 dossiers reproduce all 180 reviewed semantic checks',()=>{
  const tasks=[...bank.classroom.filter(task=>task.kind==='text'),...retired,...cases];
  assert.equal(tasks.length,64);assert.equal(cases.length,24);
  let checks=0;const check=(condition,label)=>{assert.ok(condition,label);checks++;};
  for(const task of tasks){
    const ids=expandIds(task.answerSets[0],docs);
    check(grade(ids,task.answerSets).exact,task.id+' canonical answer preserved');
    check(!grade(docs.flatMap(doc=>doc.units.map(unit=>unit.id)),task.answerSets).exact,task.id+' select all remains nonexact');
    if(ids.length>1)check(!grade(ids.slice(0,-1),task.answerSets).exact,task.id+' missing required unit remains nonexact');
  }
  for(const task of tasks.filter(task=>/^Q/.test(task.id))){
    const ids=expandIds(task.answerSets[0],docs);
    for(const rule of rules.filter(rule=>rule.body.some(id=>ids.includes(id))))for(const head of rule.heads){
      check(grade([head],task.answerSets).exact===['Q01','Q05'].includes(task.id),task.id+' whole-article scope '+head);
    }
  }
  const q5=tasks.find(task=>task.id==='Q05'),q2=tasks.find(task=>task.id==='Q02');
  check(grade([expandIds(q5.answerSets[0],docs)[0]],q5.answerSets).fraction===0.5,'Q05 one required part remains partial');
  check(grade(rules.find(rule=>rule.sectionId==='koap-s15').heads,q5.answerSets).exact,'Q05 duplicate heading selectors count once');
  check(grade(['constitution-ub5e150c7a74ad063fc-1'],q2.answerSets).extra===2,'Q02 article132 adds two incorrect parts');
  const mixed=[['c10','s79work']],ids=expandIds(mixed[0],docs),head='constitution-uef487aaa43bb47e948-1',body='constitution-u9a351be5af65a89019-1';
  check(grade([head,...ids.filter(id=>id!==body)],mixed).exact,'A two-article answer still requires the complete second norm');
  check(!grade([head],mixed).exact,'One article alone cannot satisfy the two-article answer');
  assert.equal(checks,180);
});

test('unreviewed headings and unsafe IDs retain strict identity and cannot disappear',()=>{
  const allHeads=new Set(rules.flatMap(rule=>rule.heads));
  const doc=byDoc.get('constitution'),unreviewed=doc.sections.flatMap(section=>section.unitIds).find(id=>!allHeads.has(id)&&doc.units.find(unit=>unit.id===id)?.text.startsWith('Статья '));
  assert.ok(unreviewed);const unsafe=['not-a-real-unit','<script>','__proto__',unreviewed];
  assert.deepEqual(canonical([...unsafe,...unsafe]),unsafe);assert.deepEqual(canonicalArticleSelections(['c10'],docs),['c10'],'Alias expansion remains the caller’s explicit responsibility');
  const q1=bank.classroom.find(task=>task.id==='Q01');assert.equal(grade(['constitution-uef487aaa43bb47e948-1','not-a-real-unit'],q1.answerSets).extra,1);
  const rule=rules.find(rule=>rule.sectionId==='koap-s15');
  assert.deepEqual(canonical([rule.body[1],rule.heads[0],rule.body[0],'unknown']),[rule.body[1],rule.body[0],'unknown'],'First occurrence ordering survives expansion and deduplication');
});

test('changed version, SHA, incomplete section, reordered members and ambiguous documents fail closed',()=>{
  const rule=rules.find(rule=>rule.sectionId==='koap-s15'),source=byDoc.get(rule.docId),head=rule.heads[0];
  const mutations=[
    doc=>doc.version='different-content',doc=>doc.sha256='0'.repeat(64),doc=>delete doc.sha256,doc=>doc.coverage='partial',
    doc=>doc.sections=doc.sections.filter(section=>section.id!==rule.sectionId),
    doc=>doc.sections.find(section=>section.id===rule.sectionId).title+=' changed',
    doc=>doc.sections.find(section=>section.id===rule.sectionId).unitIds.pop(),
    doc=>doc.sections.find(section=>section.id===rule.sectionId).unitIds.reverse(),
    doc=>doc.sections.find(section=>section.id===rule.sectionId).unitIds.push('unreviewed-extra'),
    doc=>doc.units=doc.units.filter(unit=>unit.id!==rule.body[0]),
    doc=>doc.units.find(unit=>unit.id===rule.body[0]).sectionId='different-section',
    doc=>doc.units.push(structuredClone(doc.units.find(unit=>unit.id===rule.body[0]))),
    doc=>doc.sections.push(structuredClone(doc.sections.find(section=>section.id===rule.sectionId)))
  ];
  for(const mutate of mutations){const doc=structuredClone(source);mutate(doc);assert.deepEqual(canonicalArticleSelections([head],[doc]),[head]);}
  assert.deepEqual(canonicalArticleSelections([head],[]),[head]);
  assert.deepEqual(canonicalArticleSelections([head],[source,structuredClone(source)]),[head]);
});
