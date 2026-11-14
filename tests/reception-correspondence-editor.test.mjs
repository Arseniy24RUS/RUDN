import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankCorrespondence, restoreCorrespondence, reduceCorrespondence,
  correspondenceEditorView, correspondencePreviewView, correspondencePrintHTML,
  restoreCorrespondenceControl, reduceCorrespondenceControl, correspondenceControlView,
  correspondenceControlOmissions, correspondenceControlSubmission, presentCorrespondenceFeedback,
} from '../site/apps/reception/ai/response-editor.js';

test('a saved letter preserves the student’s prose, section sources and ordered work',()=>{
  let draft=blankCorrespondence({kind:'internal'});
  draft=reduceCorrespondence(draft,{type:'field',field:'subject',value:'Два вопроса одного обращения'});
  draft=reduceCorrespondence(draft,{type:'field',field:'sections.facts',value:'На фотографии виден дефект.\nДата съёмки ещё не подтверждена.'});
  draft=reduceCorrespondence(draft,{type:'field',field:'sections.resolution',value:'Проверить время съёмки и содержание прежнего ответа.'});
  const source={id:'d2',kind:'document',quote:'Работы завершены 3 октября.'};
  draft=reduceCorrespondence(draft,{type:'source-add',section:'facts',source});
  draft=reduceCorrespondence(draft,{type:'source-add',section:'resolution',source});
  draft=reduceCorrespondence(draft,{type:'order-add'});
  const orderId=draft.orders[0].id,citationId=draft.citations[0].id;
  draft=reduceCorrespondence(draft,{type:'order-field',id:orderId,field:'issue',value:'Проверка прежнего ответа'});
  draft=reduceCorrespondence(draft,{type:'order-field',id:orderId,field:'instruction',value:'Сопоставить акт с датированным материалом.'});
  draft=reduceCorrespondence(draft,{type:'order-recipient',id:orderId,recipientId:'authority-1',selected:true});
  draft=reduceCorrespondence(draft,{type:'order-citation',id:orderId,citationId,selected:true});
  assert.deepEqual(restoreCorrespondence(JSON.parse(JSON.stringify(draft))),draft);
  assert.equal(draft.citations.length,2,'the same source can support different sections');
  const html=correspondencePrintHTML({draft,sources:[source]});
  assert.match(html,/<dt>Основания поручения<\/dt><dd><a href="#rxc-source-1"/);
  const removed=reduceCorrespondence(draft,{type:'source-remove',id:citationId});
  assert.equal(removed.citations.length,1);
  assert.deepEqual(removed.orders[0].citationIds,[],'a removed citation cannot leave a dangling assignment link');
  assert.equal(draft.citations.length,2,'updates do not mutate the prior saved snapshot');
});

test('student input and untrusted source metadata stay text in editor and exports',()=>{
  const draft=blankCorrespondence();
  draft.subject='"><img src=x onerror=alert(1)>';
  draft.sections.facts='<script>throw new Error("injected")</script>\nActual fact.';
  draft.citations=[{id:'c1',section:'facts',kind:'legal',sourceId:'s1',quote:'</blockquote><iframe src=javascript:alert(1)></iframe>'}];
  const sources=[{id:'s1',kind:'legal',title:'<svg onload=alert(1)>',url:'javascript:alert(1)'}];
  for(const html of [
    correspondenceEditorView({draft,sources}),
    correspondencePreviewView({draft,sources}),
    correspondencePrintHTML({draft,sources}),
  ]) {
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<iframe src='));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('href="javascript:'));
    assert.ok(html.includes('&lt;script&gt;'));
  }
});

test('preview is composed from the student’s text without leaking assessment prompts',()=>{
  const draft=blankCorrespondence();
  draft.sections.facts='Установленное обстоятельство.';
  draft.sections.legalBasis='Применимая норма.';
  draft.sections.resolution='Принятое решение.';
  draft.sections.nextSteps='Дальнейшее действие.';
  const caseInfo={citizen:{name:'Мария'},assessment:{fact:{prompt:'PRIVATE_EXPECTED_FACT'}},actions:[{label:'PRIVATE_EXPECTED_ACTION'}]};
  const html=correspondencePrintHTML({draft,caseInfo,profile:{issuer:{name:'Известный орган'}}});
  for(const text of Object.values(draft.sections))assert.ok(html.includes(text));
  assert.ok(html.includes('Известный орган'));
  assert.ok(!html.includes('PRIVATE_EXPECTED'));
  assert.ok(!html.includes('<h2>Обстоятельства</h2>'),'the output is a letter, not a completed questionnaire');
  assert.ok(html.includes('Дата: __.__.____'),'the signing date remains an unfilled requisite');
  assert.ok(html.includes('№ ____________'),'no fictitious official registration number');
  assert.ok(html.includes('________________<small>Подпись</small>'),'a blank signing line is not a fabricated signature');
  assert.ok(html.includes('И.О. Фамилия'),'the authorised signer is not invented');
});

test('internal documents do not fabricate an external addressee',()=>{
  const draft=blankCorrespondence({kind:'internal'});
  draft.sections.resolution='Направить сведения по компетенции.';
  const html=correspondencePrintHTML({draft,caseInfo:{citizen:{name:'Неустановленный заявитель'}}});
  assert.ok(html.includes('Служебный документ'));
  assert.ok(!html.includes('Заявителю:'));
});

test('the profile name identifies the preparing specialist and leaves signature requisites blank',()=>{
  const specialistName='Иванов Иван Петрович <тест>';
  for(const render of [correspondencePreviewView,correspondencePrintHTML]){
    const html=render({draft:blankCorrespondence(),specialistName});
    assert.match(html,/<strong>Исполнитель \(специалист\)<\/strong>: Иванов Иван Петрович &lt;тест&gt;/);
    assert.match(html,/________________<small>Подпись<\/small>/);
    assert.match(html,/Дата: __\.__\.____/);
    assert.doesNotMatch(render({draft:blankCorrespondence()}),/class="rxc-letter-specialist"/);
  }
});

test('referrals and requests address the known receiving body while a return addresses the applicant',()=>{
  const caseInfo={citizen:{name:'Мария Викторовна'}},recipients=[{id:'regional-transport',label:'Известный региональный орган'}];
  for(const kind of ['referral','request']) {
    const draft=blankCorrespondence({kind});
    draft.sections.resolution='Текст, подготовленный студентом.';
    const html=correspondencePrintHTML({draft,caseInfo,recipients});
    assert.ok(html.includes('Исполнитель / адресат: Известный региональный орган'));
    assert.ok(!html.includes('Заявителю: Мария Викторовна'));
  }
  const returned=blankCorrespondence({kind:'return'});
  returned.sections.resolution='Разъяснение установленного порядка обжалования.';
  const html=correspondencePrintHTML({draft:returned,caseInfo,recipients});
  assert.ok(html.includes('Возврат с разъяснением'));
  assert.ok(html.includes('Заявителю: Мария Викторовна'));
  assert.ok(!html.includes('Исполнитель / адресат:'));
});

test('locked submitted work keeps preview and export available while text controls are disabled',()=>{
  const draft=blankCorrespondence();
  draft.sections.facts='Сохранённый факт.';
  const editor=correspondenceEditorView({draft,disabled:true});
  const previewButton=editor.match(/<button[^>]*data-response-action="preview"[^>]*>/)?.[0];
  assert.ok(previewButton);
  assert.ok(!previewButton.includes('disabled'));
  assert.match(editor,/<textarea[^>]*data-response-field="sections.facts"[^>]*disabled/);
  const preview=correspondencePreviewView({draft,disabled:true});
  assert.doesNotMatch(preview,/data-response-action="edit"/);
  for(const action of ['print','download']) {
    const button=preview.match(new RegExp('<button[^>]*data-response-action="'+action+'"[^>]*>'))?.[0];
    assert.ok(button&&!button.includes('disabled'));
  }
});

test('a source citation needs a real passage and long texts are never silently cut',()=>{
  const draft=blankCorrespondence();
  assert.deepEqual(reduceCorrespondence(draft,{type:'source-add',section:'facts',source:{id:'d1',kind:'document'}}),draft);
  assert.deepEqual(reduceCorrespondence(draft,{type:'source-add',section:'facts',source:{id:'d1',kind:'document',text:'x'.repeat(4001)}}),draft);
  const attached=reduceCorrespondence(draft,{type:'source-add',section:'facts',source:{id:'d1',kind:'document',text:'Short complete source.'}});
  assert.equal(attached.citations[0].quote,'Short complete source.');
});

test('control evidence can be selected before a status and is retained while the draft changes',()=>{
  let draft=restoreCorrespondenceControl({});
  draft=reduceCorrespondenceControl(draft,{type:'text',value:'Фотография относится к другой дате; исполнение пока не подтверждено.'});
  draft=reduceCorrespondenceControl(draft,{type:'evidence',issueId:'repair',sourceId:'photo',selected:true});
  assert.deepEqual(draft.statuses,[{issueId:'repair',status:'',evidenceSourceIds:['photo']}]);
  assert.deepEqual(correspondenceControlSubmission(draft).statuses,[]);
  const issues=[{id:'repair',title:'Восстановление дорожки'}];
  const sources=[{id:'photo',kind:'document',title:'Датированная фотография'}];
  assert.deepEqual(correspondenceControlOmissions(draft,issues,sources).map(row=>row.focusId),['response-status-repair']);
  const markup=correspondenceControlView({draft,issues,sources,intro:'Поступил снимок.'});
  assert.ok(markup.indexOf('Поступил снимок.')<markup.indexOf('data-response-status-field'));
  assert.match(markup,/data-response-status-evidence="photo" data-issue-id="repair"[^>]+ checked>/);
  draft=reduceCorrespondenceControl(draft,{type:'status',issueId:'repair',value:'pending'});
  draft=reduceCorrespondenceControl(draft,{type:'evidence',issueId:'repair',sourceId:'photo',selected:true});
  assert.deepEqual(restoreCorrespondenceControl(JSON.parse(JSON.stringify(draft))),draft);
  assert.equal(draft.statuses[0].status,'pending');
  assert.deepEqual(draft.statuses[0].evidenceSourceIds,['photo']);
  assert.deepEqual(correspondenceControlOmissions(draft,issues,sources),[]);
  const cleared=reduceCorrespondenceControl(draft,{type:'status',issueId:'repair',value:''});
  assert.deepEqual(cleared.statuses[0].evidenceSourceIds,['photo']);
  const legacy={...cleared,statuses:[{...cleared.statuses[0],evidenceSourceIds:['document:photo']}]};
  assert.deepEqual(reduceCorrespondenceControl(legacy,{type:'evidence',issueId:'repair',sourceId:'photo',selected:false}).statuses,[]);
  const html=correspondenceControlView({draft,issues:[{id:'repair',title:'Восстановление дорожки'}],sources:[{id:'photo',kind:'document',title:'Датированная фотография'}]});
  assert.ok(html.includes('data-response-control-field="text"'));
  assert.ok(html.includes('data-issue-id="repair"'));
  assert.ok(!html.includes('type="radio"'));
});

test('saved review translates structured quotes and feedback without editing original prose',()=>{
  const authored='I wrote “main: pending” and cited Article 12.';
  const law={quote:'Authoritative statutory text'};
  const stored={score:65,explanation:'See document:repair-photo and evidenceSourceIds.',correspondence:{phase:'complete',
    initial:{citations:[law],criteria:[{reason:'Use citation:legal-001.',findings:[
      {section:'resolution',quote:authored,explanation:'Compare critical-rule:unauthorised-action.'},
      {section:'orders',quote:'id: order-1\nkind: request\nrecipients: mvd (Ministry of Internal Affairs)\ninstruction: Verify facts.',explanation:'Describe this assignment.'},
    ]}]},control:{criteria:[{reason:'The review marked "main": "pending".',findings:[
      {section:'statuses',quote:'main: pending',explanation:'See document:repair-photo and evidenceSourceIds.'},
    ]}]}}};
  const result=presentCorrespondenceFeedback(stored,{locale:'en',issues:[{id:'main',title:'Pothole on the road'}],
    sources:[{id:'repair-photo',kind:'document',title:'Repair photograph'}]});
  assert.equal(result.explanation,'See Repair photograph and supporting evidence.');
  assert.equal(result.correspondence.control.criteria[0].findings[0].quote,'Pothole on the road: Keep under review');
  assert.equal(result.correspondence.control.criteria[0].reason,'The review marked Pothole on the road: Keep under review.');
  assert.equal(result.correspondence.initial.criteria[0].findings[0].quote,authored);
  assert.equal(result.correspondence.initial.citations[0].quote,law.quote);
  assert.match(result.correspondence.initial.criteria[0].findings[1].quote,/Action: Request materials/);
  assert.doesNotMatch(result.correspondence.initial.criteria[0].findings[1].quote,/order-1|\bmvd\b/);
  assert.equal(stored.correspondence.control.criteria[0].findings[0].quote,'main: pending');
});

test('all three locales provide the same writing, preview and control affordances',()=>{
  for(const locale of ['ru','en','zh']) {
    const draft=blankCorrespondence();
    const editor=correspondenceEditorView({draft,locale});
    for(const section of ['facts','legalBasis','resolution','nextSteps'])assert.ok(editor.includes('data-response-field="sections.'+section+'"'));
    assert.ok(editor.includes('data-response-action="preview"'));
    assert.ok(editor.includes('data-response-action="add-order"'));
    assert.ok(!editor.includes('undefined'));
    const output=correspondencePrintHTML({draft,locale});
    assert.ok(output.includes('<html lang="'+locale+'">'));
    assert.ok(output.includes('@page{size:A4;'));
    assert.ok(!output.includes('undefined'));
  }
});
