import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankCorrespondence, restoreCorrespondence, reduceCorrespondence, insertLegalPassage, legalPassageMessage,
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

test('the current seminar handles a citizen reply without a document type selection',()=>{
  const draft=blankCorrespondence({kind:'referral'});
  draft.subject='Проверка вывоза мусора';
  for(const [locale,label] of [['ru','Ответ заявителю'],['en','Reply'],['zh','答复']]){
    const options={draft,locale,fixedKind:'reply',citizenReply:true,caseInfo:{citizen:{name:'Сергей Петрович'}}};
    const editor=correspondenceEditorView(options);
    assert.ok(!editor.includes('data-response-field="kind"'));
    assert.ok(editor.includes('data-response-field="subject"'));
    const letter=correspondencePreviewView(options);
    assert.ok(letter.toLowerCase().includes(label.toLowerCase()),locale);
    assert.ok(letter.includes(draft.subject)&&letter.includes('Сергей Петрович'));
  }
  const anonymous={draft,fixedKind:'internal',citizenReply:false,caseInfo:{citizen:{name:'Неизвестный'}}};
  assert.ok(!correspondenceEditorView(anonymous).includes('data-response-field="kind"'));
  const internal=correspondencePreviewView(anonymous);
  assert.ok(internal.includes('Служебный документ'));
  assert.ok(!internal.includes('Заявителю: Неизвестный'));
  assert.equal(draft.kind,'referral');
  assert.ok(correspondenceEditorView({draft}).includes('data-response-field="kind"'));
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

test('the seminar preview keeps the letter and edit action while the external preview retains exports',()=>{
  const draft=blankCorrespondence();
  draft.sections.facts='Содержание письма.';
  for(const locale of ['ru','en','zh']){
    const seminar=correspondencePreviewView({draft,locale,seminar:true});
    assert.match(seminar,/Содержание письма\./);
    assert.match(seminar,/data-response-action="edit"/);
    assert.doesNotMatch(seminar,/rxc-project-mark|data-response-action="(?:print|download)"/);
    assert.doesNotMatch(correspondencePreviewView({draft,locale,seminar:true,disabled:true}),/rxc-preview-toolbar/);
    const external=correspondencePreviewView({draft,locale});
    assert.match(external,/rxc-project-mark/);
    assert.match(external,/data-response-action="print"/);
    assert.match(external,/data-response-action="download"/);
    assert.match(correspondencePrintHTML({draft,locale}),/<div class="rxc-project-mark">/);
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


test('citations of different paragraphs of the same act retain their own locators',()=>{
  const sources=[11,10].map(article=>({id:'corruption273',kind:'legal',title:'№ 273-ФЗ',
    locator:'ч. 2 ст. '+article,unitIds:['article-'+article],quote:'Exact paragraph '+article}));
  let draft=blankCorrespondence();
  for(const source of sources)draft=reduceCorrespondence(draft,{type:'source-add',section:'legalBasis',source});
  const preview=correspondencePreviewView({draft,sources});
  assert.match(preview,/ч\. 2 ст\. 11[^]*?Exact paragraph 11/);
  assert.match(preview,/ч\. 2 ст\. 10[^]*?Exact paragraph 10/);
});

test('marked provisions append their exact passages once and retain the original source links after reload',()=>{
  const sources=[
    {id:'law-one',kind:'legal',title:'Первый закон',locator:'Статья 4, часть 1',unitIds:['a4-1'],quote:'Первый абзац.\nУточнение первого абзаца.'},
    {id:'law-two',kind:'legal',title:'Второй закон',locator:'Статья 8, часть 2',unitIds:['a8-2'],quote:'Второй абзац.'},
  ];
  const typed='  Сопоставил обстоятельства обращения с нормой.  ';
  let draft=reduceCorrespondence(blankCorrespondence(),{type:'field',field:'sections.legalBasis',value:typed});
  for(const source of sources)draft=reduceCorrespondence(draft,{type:'source-add',section:'legalBasis',source});
  const original=restoreCorrespondence(draft);
  const [one,two]=draft.citations.map(citation=>citation.id);
  const first=insertLegalPassage(draft,one);
  assert.equal(first.status,'inserted');
  assert.equal(first.draft.sections.legalBasis,typed+'\n\n'+sources[0].quote);
  const saved=restoreCorrespondence(JSON.parse(JSON.stringify(first.draft)));
  assert.deepEqual(insertLegalPassage(saved,one),{status:'already-inserted',draft:saved});
  const second=insertLegalPassage(saved,two);
  assert.equal(second.status,'inserted');
  assert.equal(second.draft.sections.legalBasis,typed+'\n\n'+sources.map(source=>source.quote).join('\n\n'));
  assert.deepEqual(second.draft.citations,original.citations);
  assert.deepEqual(draft,original);
  const letter=correspondencePreviewView({draft:second.draft,sources});
  assert.match(letter,/data-response-citation-link[^>]*>\[1\]/);
  assert.match(letter,/data-response-citation-link[^>]*>\[2\]/);
  assert.match(letter,/Статья 4, часть 1[\s\S]*Первый абзац/);
  assert.match(letter,/Статья 8, часть 2[\s\S]*Второй абзац/);
});

test('provision insertion rejects unrelated citations and never truncates the legal basis to make room',()=>{
  const legal={id:'law',kind:'legal',unitIds:['art-8'],quote:'Сохранённая норма.'};
  const add=(draft,section,source)=>reduceCorrespondence(draft,{type:'source-add',section,source});
  let draft=add(blankCorrespondence(),'legalBasis',legal);
  draft=add(draft,'facts',legal);
  draft=add(draft,'legalBasis',{id:'record',kind:'document',quote:'Служебная записка.'});
  assert.deepEqual(insertLegalPassage(draft,'citation-2'),{status:'unavailable',draft});
  assert.deepEqual(insertLegalPassage(draft,'citation-3'),{status:'unavailable',draft});
  assert.deepEqual(insertLegalPassage(draft,'missing'),{status:'unavailable',draft});
  const typed=reduceCorrespondence(draft,{type:'field',field:'sections.legalBasis',value:'я'.repeat(5999)});
  assert.deepEqual(insertLegalPassage(typed,'citation-1'),{status:'too-long',draft:typed});
  const handwritten=reduceCorrespondence(draft,{type:'field',field:'sections.legalBasis',value:'Цитата: «Сохранённая\nнорма.»'});
  assert.deepEqual(insertLegalPassage(handwritten,'citation-1'),{status:'already-inserted',draft:handwritten});
});

test('the guided editor offers marked fragments inside the legal basis in all three languages',()=>{
  const selected={id:'selected',kind:'legal',quote:'Текст <ноты> & абзаца.',locator:'§ 8',unitIds:['a8']};
  const unselected={id:'unselected',kind:'legal',title:'Unused candidate',quote:'Unavailable quote.',unitIds:['a2']};
  const caseInfo={normativeActs:[{id:selected.id,title:{ru:'Выбранный акт',en:'Selected act',zh:'已选法规'}}]};
  const draft=reduceCorrespondence(blankCorrespondence(),{type:'source-add',section:'legalBasis',source:selected});
  for(const [locale,label,title] of [['ru','Вставить отмеченный фрагмент','Выбранный акт'],['en','Insert a marked passage','Selected act'],['zh','插入已选法规片段','已选法规']]){
    const options={draft,guidedCore:true,caseInfo,sources:[selected,unselected],locale};
    const html=correspondenceEditorView(options);
    const block=html.split('data-response-section="legalBasis"')[1].split('</section>')[0];
    assert.ok(block.includes(label)&&block.includes(title));
    assert.match(block,/data-response-action="insert-provision"[^>]*data-citation-id="citation-1"/);
    assert.match(block,/Текст &lt;ноты&gt; &amp; абзаца\./);
    assert.ok(!block.includes('Unused candidate'));
    assert.match(correspondenceEditorView({...options,disabled:true}),/data-response-action="insert-provision" disabled /);
    assert.ok(legalPassageMessage('inserted',locale));
    assert.notEqual(legalPassageMessage('inserted',locale),legalPassageMessage('too-long',locale));
  }
  assert.doesNotMatch(correspondenceEditorView({draft}),/data-response-action="insert-provision"/);
  assert.doesNotMatch(correspondenceEditorView({guidedCore:true}),/data-response-action="insert-provision"/);
});

test('the current seminar hides saved assignment fields and annex while old letters retain them',()=>{
  let draft=reduceCorrespondence(blankCorrespondence(),{type:'field',field:'sections.resolution',value:'Единый текст решения.'});
  draft=reduceCorrespondence(draft,{type:'order-add'});
  draft=reduceCorrespondence(draft,{type:'order-field',field:'issue',value:'Старое поручение',id:draft.orders[0].id});
  const current={draft,seminar:true,fixedKind:'reply',guidedCore:true,showOrders:false};
  const editor=correspondenceEditorView(current);
  const letter=correspondencePreviewView(current);
  assert.doesNotMatch(editor,/rxc-orders|data-response-action="add-order"/);
  assert.doesNotMatch(letter,/rxc-letter-order|Старое поручение/);
  assert.match(letter,/Единый текст решения\./);
  assert.match(letter,/Дата: __\.__\.____/);
  assert.match(correspondencePreviewView({draft,seminar:true,disabled:true}),/Старое поручение/);
  assert.match(correspondencePrintHTML({draft}),/Старое поручение/);
  assert.doesNotMatch(correspondencePrintHTML(current),/Старое поручение/);
  assert.equal(draft.orders.length,1);
});
