import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {normativeActsForCase,validateLegalCitation,hasApplicableLegalCitation} from './normative-acts.mjs';

const index=JSON.parse(readFileSync(new URL('./normative-provisions.json',import.meta.url),'utf8'));
const caseFor=(id,number,actDate,articles,rule='calendar30')=>({
  id,public:{sources:[{url:'https://example.com'},{url:'https://archives.gov.ru/documents/rules/office-work-rules-gos.shtml'}]},
  rubric:{authored:{knowledge:{number,actDate,articles},calendar:{rule}}},
});
function citation(docId,provision,unitId) {
  const [id,text]=index[docId][provision].find(([id])=>id===unitId);
  return {docId,unitIds:[id],text};
}

test('full acts follow the case and calendar without generic supplements or external links',()=>{
  const caseRow=caseFor('bailiff-copy-decision','229','2007-10-02',['64.1'],'working1');
  assert.deepEqual(normativeActsForCase(caseRow).map(x=>x.id),['reception-law71450']);
  for(const act of normativeActsForCase(caseRow))assert.deepEqual(Object.keys(act),['id','title','number']);
  assert.equal(normativeActsForCase(caseFor('conflict-creditor','273','2008-12-25',['11']))[0].id,'corruption273');
  assert.equal(normativeActsForCase(caseFor('education-provider-identity','273','2012-12-29',['91']))[0].id,'reception-law140174');
  assert.deepEqual(normativeActsForCase(caseFor('guard-contractor','59','2006-05-02',['8'])).map(x=>x.id),['reception-law59999']);
});

test('citations must quote the pinned text and contain a relevant paragraph',()=>{
  const docId='reception-law59999',row=caseFor('complaint-routing','59','2006-05-02',['8']);
  const relevant=citation(docId,'8','law59999-u52');
  assert.equal(hasApplicableLegalCitation(row,validateLegalCitation(relevant)),true);
  assert.equal(hasApplicableLegalCitation(row,{...relevant,text:relevant.text.slice(8,95)}),true);
  assert.equal(hasApplicableLegalCitation(row,{...relevant,text:'Несуществующий фрагмент нормативного акта'}),false);
  assert.equal(hasApplicableLegalCitation(row,{...relevant,text:relevant.text.slice(0,3)}),false);
  assert.equal(hasApplicableLegalCitation(row,citation(docId,'8','law59999-u47')),false);
  assert.equal(hasApplicableLegalCitation(row,citation(docId,'11','law59999-u69')),false);
  const next=citation(docId,'8','law59999-u53');
  assert.equal(hasApplicableLegalCitation(row,{...relevant,unitIds:[...relevant.unitIds,...next.unitIds],text:relevant.text+'\n\n'+next.text}),true);
  assert.equal(hasApplicableLegalCitation(row,{...relevant,unitIds:[...relevant.unitIds,...next.unitIds]}),false);
  assert.equal(hasApplicableLegalCitation(row,{...relevant,unitIds:[...next.unitIds,...relevant.unitIds],text:relevant.text+' '+next.text}),false);
});

test('citations may come from a case-specific companion act',()=>{
  const row=caseFor('fire-key','59','2006-05-02',['8'],'calendar7');
  const proof=citation('reception-law363263','26','law363263-u86');
  assert.ok(normativeActsForCase(row).some(act=>act.id===proof.docId));
  assert.equal(hasApplicableLegalCitation(row,proof),true);
  assert.equal(hasApplicableLegalCitation(caseFor('noise-other-region','59','2006-05-02',['8'],'calendar7'),proof),false);
});

test('citation payload rejects spoofed metadata and malformed IDs',()=>{
  const good=citation('reception-law59999','8','law59999-u52');
  assert.equal(validateLegalCitation(undefined),null);
  for(const bad of [{...good,article:'8'},{...good,docId:'__proto__'},{...good,text:''},{...good,unitIds:[]},{...good,unitIds:['a','a']}]){
    assert.throws(()=>validateLegalCitation(bad),{code:'invalid_decision'});
  }
});
