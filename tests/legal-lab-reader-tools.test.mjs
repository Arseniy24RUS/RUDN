import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {documentTaskGroups,labelForUnit} from '../site/apps/legal-lab/lib/reader-tools.mjs';

test('document groups retain original text task identities and classroom positions',()=>{
  const bank={classroom:[{id:'S01',kind:'scan'},{id:'Q01',kind:'text',docId:'b'},{id:'T01',kind:'type'},
    {id:'Q02',kind:'text',docId:'a'},{id:'Q03',kind:'text',docId:'b'},{id:'H01',kind:'history'}]};
  const catalog={documents:[{id:'a',title:'Act A'},{id:'b',title:'Full Act B',shortTitle:'Act B'}]};
  const before=structuredClone({bank,catalog}),groups=documentTaskGroups(bank,catalog);
  assert.deepEqual(groups.map(g=>[g.docId,g.title]),[['b','Act B'],['a','Act A']]);
  assert.deepEqual(groups.map(g=>g.tasks.map(({task,index})=>[task.id,index])),[[['Q01',1],['Q03',4]],[['Q02',3]]]);
  assert.equal(groups[0].tasks[0].task,bank.classroom[1]);assert.deepEqual({bank,catalog},before);
  assert.deepEqual(documentTaskGroups({classroom:[]},catalog),[]);
});

test('actual corpus bank exposes exactly the original 38 Q tasks, once each',async()=>{
  const bank=JSON.parse(await readFile(new URL('../site/apps/legal-lab/data/bank.json',import.meta.url),'utf8'));
  const catalog=JSON.parse(await readFile(new URL('../site/apps/legal-lab/data/catalog.json',import.meta.url),'utf8'));
  const expected=bank.classroom.flatMap((task,index)=>task.kind==='text'?[{task,index}]:[]),groups=documentTaskGroups(bank,catalog);
  const actual=groups.flatMap(group=>group.tasks).sort((a,b)=>a.index-b.index);
  assert.equal(expected.length,38);assert.deepEqual(actual,expected);
  assert.deepEqual(actual.map(item=>item.task.id),Array.from({length:38},(_,i)=>'Q'+String(i+1).padStart(2,'0')));
  for(const group of groups){assert.ok(catalog.documents.some(doc=>doc.id===group.docId));assert.ok(group.tasks.every(({task})=>task.docId===group.docId));}
});

function document(id,texts,title='Статья 10'){
  const units=texts.map((text,index)=>({id:'u'+index,sectionId:'s',locator:title,text}));
  return{id,units,sections:[{id:'s',title,unitIds:units.map(unit=>unit.id)}]};
}
test('labels follow explicit legal hierarchy and preserve decimal, hyphen and letter glyphs',()=>{
  const doc=document('constitution',['Статья 10','1. Первая часть','2) Нумерованный пункт','а) Буквенный подпункт','Продолжение текста','2. Вторая часть','a) Latin source glyph']);
  assert.equal(labelForUnit(doc,'u0'),'Ст.10');assert.equal(labelForUnit(doc,'u1'),'Ч.1 Ст.10');
  assert.equal(labelForUnit(doc,'u2'),'П.2 Ч.1 Ст.10');assert.equal(labelForUnit(doc,'u3'),'Подп.«а» П.2 Ч.1 Ст.10');
  assert.equal(labelForUnit(doc,'u4'),'Подп.«а» П.2 Ч.1 Ст.10 · «Продолжение текста»');
  assert.equal(labelForUnit(doc,'u6'),'П.«a» Ч.2 Ст.10');
  const points=document('ekb',['Статья 25','2-1. Пункт','3) Подпункт','а) Unconfirmed deeper level'],'Статья 25');
  assert.equal(labelForUnit(points,'u1'),'П.2-1 Ст.25');assert.equal(labelForUnit(points,'u2'),'Подп.3 П.2-1 Ст.25');
  assert.equal(labelForUnit(points,'u3'),'Подп.3 П.2-1 Ст.25 · «а) Unconfirmed deeper level»');
  assert.equal(labelForUnit(document('civil79',['Статья 10','1.1. Дополнительная часть']),'u1'),'Ч.1.1 Ст.10');
});

test('section order is authoritative and unnumbered body is not invented as part 1',()=>{
  const doc=document('constitution',['Статья 10','Вся единственная ненумерованная норма.']);doc.units.reverse();
  assert.equal(labelForUnit(doc,'u1'),'Ст.10 · текст');assert.equal(labelForUnit(doc,'u0'),'Ст.10');
  assert.equal(labelForUnit(doc,'missing'),'');
  const continuation=document('constitution',['Статья 10','1. Нумерованная часть','Первый ненумерованный фрагмент','Другой ненумерованный фрагмент']);
  assert.equal(labelForUnit(continuation,'u2'),'Ч.1 Ст.10 · «Первый ненумерованный фрагмент»');
  assert.notEqual(labelForUnit(continuation,'u2'),labelForUnit(continuation,'u3'));
});

test('notes, table rows and new headings do not inherit the preceding legal part',()=>{
  const doc=document('koap',['КоАП РФ Статья 10','Статья 10','2. Основная часть','Примечание. Пояснение','1. Нумерованный текст примечания','<1> Сноска','Таблица','Глава 2. Новый заголовок','Продолжение другого раздела','1. Не часть прежней статьи']);
  doc.units[6].tableRow=true;
  assert.equal(labelForUnit(doc,'u0'),'Ст.10');assert.equal(labelForUnit(doc,'u1'),'Ст.10');
  for(const index of [3,4,5,6,7,8,9])assert.doesNotMatch(labelForUnit(doc,'u'+index),/Ч\.2/);
  assert.doesNotMatch(labelForUnit(doc,'u4'),/Ч\.1/);
  assert.doesNotMatch(labelForUnit(doc,'u9'),/Ч\.1|Ст\.10/);
});

test('unknown article taxonomy keeps a literal quote instead of inventing a part',()=>{
  assert.equal(labelForUnit(document('unknown-act',['Статья 10','1. Printed prefix with unknown legal meaning']),'u1'),'Ст.10 · «1. Printed prefix with unknown legal meaning»');
  const doc=document('unknown-act',['Статья 10','Очень длинный текст '.repeat(10)]);
  assert.equal(labelForUnit(doc,'u1'),'Ст.10 · текст');
});

test('multi-article or range headings never collapse to the first article',async()=>{
  for(const title of ['Статья 7, статья 8. Утратили силу','Статья 7, 8. Утратили силу','Статьи 7–8. Утратили силу','Статья 7 — 8. Утратили силу']){
    const doc=document('koap',[title,'Ненумерованный текст'],title);assert.equal(labelForUnit(doc,'u0'),title);assert.ok(labelForUnit(doc,'u1').startsWith(title+' · '));
  }
  const doc=JSON.parse(await readFile(new URL('../site/apps/legal-lab/data/documents/procurement44.json',import.meta.url),'utf8'));
  for(const id of ['procurement44-s64','procurement44-s71','procurement44-s82','procurement44-s83']){
    const section=doc.sections.find(item=>item.id===id);assert.ok(section);
    for(const unitId of section.unitIds)assert.doesNotMatch(labelForUnit(doc,unitId),/^Ст\.\d+(?: ·|$)/);
  }
});

test('reviewed actual corpus fixtures have precise article, part and point labels',async()=>{
  const fixtures={
    constitution:{'constitution-ub5e150c7a74ad063fc-1':'Ст.132','constitution-ubcb16463a8b870cf06-1':'Ч.1 Ст.132','constitution-u87c8ce50b2768566d2-1':'Ч.2 Ст.132','constitution-u3271ae4e7ce2f1d8a9-1':'Ч.3 Ст.132'},
    system58:{'system58-ua4330bc07726662220-1':'П.2 Ст.9'},archive122:{'archive122-u608aad19388746bde0-1':'П.1 Ст.6'},
    ekb:{'ekb-u01362459805687d32a-1':'П.1 Ст.25','ekb-ueb5f77912e97fb4625-1':'П.2-1 Ст.25'},
    goals309:{'goals309-ue67adb0ddea15d6f2c-1':'Подп.«к» П.2','goals309-u43f18e1b5e31234894-1':'Подп.«б» П.2'}
  };
  for(const [id,expected] of Object.entries(fixtures)){
    const doc=JSON.parse(await readFile(new URL('../site/apps/legal-lab/data/documents/'+id+'.json',import.meta.url),'utf8'));
    for(const [unitId,label] of Object.entries(expected))assert.equal(labelForUnit(doc,unitId),label,unitId);
  }
});

test('untitled sections preserve each target locator without a free-variable fallback',()=>{
 const doc={id:'unknown',units:[{id:'a',sectionId:'empty',locator:'Первый фрагмент',text:'Первый текст.'},{id:'b',sectionId:'empty',locator:'Другой фрагмент',text:'Второй текст.'}],sections:[{id:'empty',title:'',unitIds:['a','b']}]};
 assert.equal(labelForUnit(doc,'a'),'Первый фрагмент · «Первый текст.»');
 assert.equal(labelForUnit(doc,'b'),'Другой фрагмент · «Второй текст.»');
 assert.equal(labelForUnit(doc,'a'),'Первый фрагмент · «Первый текст.»');
});
