import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoreControlActionDraft,reduceControlActionDraft,controlActionSubmission,
  restoreControlWorkspaceUI,reduceControlWorkspaceUI,controlWorkspaceIntent,
  controlWorkspaceView,controlRecordView,
} from '../site/apps/reception/ai/control-workspace.js';
import {restoreCorrespondenceControl,reduceCorrespondenceControl,correspondenceControlSubmission} from '../site/apps/reception/ai/response-editor.js';

const tools=['request_evidence','verify','notify','close','keep_open','refer','reopen'].map(kind=>({kind}));
function fixture(){
  return {
    version:'execution-v1',revision:4,caseId:'several-repair-and-complaint',status:'active',
    issues:[
      {id:'repair',title:{ru:'Восстановление дорожки',en:'Path restoration',zh:'修复道路'},scope:{ru:'Проверяется состояние дорожки на указанном участке.',en:'Check the path at the identified site.',zh:'核查指定地点的道路情况。'},resultType:'physical-result',status:'awaiting',substantiveStatus:'pending',materialIds:['workflow:initial'],verifiedEvidenceIds:[],availableActions:tools},
      {id:'complaint',title:{ru:'Проверка прежнего ответа',en:'Review of the earlier reply',zh:'核查此前的答复'},scope:'Самостоятельная проверка достоверности прежнего ответа.',resultType:'procedural-result',status:'closed',substantiveStatus:'pending',materialIds:['workflow:review'],verifiedEvidenceIds:[],availableActions:[{kind:'reopen'}]},
    ],
    materials:[
      {id:'workflow:initial',kind:'author-event',title:{ru:'Новое сообщение заявителя',en:'New applicant message',zh:'申请人新消息'},text:'Работы обещали завершить. Подтверждающие документы ещё не представлены.',issueIds:['repair'],provenanceLabel:'Исходные материалы дела',verification:'PRIVATE_INSUFFICIENT'},
      {id:'workflow:review',kind:'execution-record',title:'Материалы проверки',text:'Вопрос о достоверности ответа рассматривается самостоятельно.',issueIds:['complaint'],provenanceLabel:'Дополнительный учебный материал'},
    ],
    journal:[
      {id:'event-1',seq:1,issueId:null,kind:'opened',label:'Дело поставлено на контроль',message:'Получено новое сообщение по делу.',materialIds:['workflow:initial'],at:'2026-11-14'},
      {id:'event-2',seq:2,issueId:'repair',kind:'close',accepted:false,outcome:'closure_evidence_required',reason:'Считаю вопрос рассмотренным.',instruction:'Зафиксировать результат.',message:'Не представлены проверенные материалы по предмету.',recipientIds:[],evidenceSourceIds:['workflow:initial'],materialIds:[]},
    ],
    plannedOrders:[
      {id:'order-1',issueId:'repair',issue:'Осмотр дорожки',kind:'review',instruction:'Проверить состояние дорожки.',recipientIds:['authority-1'],dueDate:'2026-11-19',expectedResult:'Акт осмотра.'},
      {id:'order-2',issueId:null,issue:'Дополнительное поручение',kind:'request',instruction:'Уточнить сведения.',recipientIds:[],dueDate:'',expectedResult:''},
    ],
    closureText:'PRIVATE_CORRECT_CLOSURE',futureMaterials:[{id:'future',title:'PRIVATE_FUTURE_TITLE',text:'PRIVATE_FUTURE_FACT'}],
  };
}
const recipients=[{id:'authority-1',label:{ru:'Уполномоченное подразделение',en:'Authorised office',zh:'主管部门'}}];
function startAction(kind='request_evidence',issueId='repair'){
  return reduceControlActionDraft(null,{type:'select',issueId,kind});
}

test('an action draft preserves student text, recipients, deadline and evidence without modifying the server workflow',()=>{
  const workflow=fixture(),original=structuredClone(workflow);
  let draft=startAction();
  draft=reduceControlActionDraft(draft,{type:'field',field:'reason',value:'Нужно установить фактическое состояние.\nОбещание не подтверждает результат.'},workflow);
  draft=reduceControlActionDraft(draft,{type:'field',field:'instruction',value:'Представьте датированный акт осмотра указанного участка.'},workflow);
  draft=reduceControlActionDraft(draft,{type:'field',field:'dueDate',value:'2026-11-19'},workflow);
  draft=reduceControlActionDraft(draft,{type:'recipient',recipientId:'authority-1',selected:true},workflow);
  draft=reduceControlActionDraft(draft,{type:'evidence',sourceId:'workflow:initial',selected:true},workflow);
  const stored=restoreControlActionDraft(JSON.parse(JSON.stringify(draft)),workflow);
  assert.deepEqual(stored,draft);
  assert.deepEqual(workflow,original,'client draft operations cannot release evidence or close an issue');
  assert.deepEqual(stored.evidenceSourceIds,['workflow:initial']);
  assert.match(stored.reason,/\nОбещание/);
});

test('changing the inspected issue cannot silently reassign a partly written action',()=>{
  const draft={...startAction(),instruction:'Запрос относится только к дорожке.',reason:'Нет акта осмотра.'};
  const ui=reduceControlWorkspaceUI({issueId:'repair',materialId:'workflow:initial'},{type:'issue',issueId:'complaint'});
  assert.equal(ui.issueId,'complaint');assert.equal(ui.materialId,'');
  for(const action of [
    {type:'select',issueId:'complaint',kind:'reopen'},
    {type:'issue',issueId:'complaint'},
    {type:'field',field:'issueId',value:'complaint'},
  ])assert.deepEqual(reduceControlActionDraft(draft,action),draft);
  const html=controlWorkspaceView({workflow:fixture(),ui,actionDraft:draft});
  assert.match(html,/Сохранён незавершённый проект действия по другому вопросу/);
  assert.match(html,/data-control-action="select-kind"[^>]*data-kind="reopen"[^>]*disabled/);
  assert.match(html,/data-control-action="select-issue" data-issue-id="repair"/);
  const cleared=reduceControlActionDraft(draft,{type:'reset',issueId:'complaint'});
  assert.equal(cleared.issueId,'complaint');assert.equal(cleared.instruction,'');
  assert.equal(reduceControlActionDraft(cleared,{type:'select',issueId:'complaint',kind:'reopen'}).kind,'reopen');
});

test('an empty choice can move to another issue without inventing a persistent work draft',()=>{
  const empty=startAction('verify','repair');
  const moved=reduceControlActionDraft(empty,{type:'select',issueId:'complaint',kind:'reopen'});
  assert.equal(moved.issueId,'complaint');assert.equal(moved.kind,'reopen');
  assert.equal(moved.instruction,'');
});

test('action submission has an explicit bounded whitelist and never forwards client state or outcome claims',()=>{
  const input={...startAction(),reason:'я'.repeat(2200),instruction:'z'.repeat(2400),expectedResult:'x'.repeat(1400),recipientIds:['r','r',...Array.from({length:30},(_,i)=>'r'+i)],evidenceSourceIds:['e','e'],dueDate:'2026-02-31',status:'closed',accepted:true,workflow:fixture(),fullName:'PRIVATE_PROFILE',privateRules:{closed:true}};
  const payload=controlActionSubmission(input,fixture());
  assert.deepEqual(Object.keys(payload).sort(),['issueId','kind','reason','instruction','recipientIds','dueDate','expectedResult','evidenceSourceIds'].sort());
  assert.equal(payload.reason.length,2000);assert.equal(payload.instruction.length,2000);assert.equal(payload.expectedResult.length,1000);
  assert.equal(payload.recipientIds.length,12);assert.deepEqual(payload.evidenceSourceIds,['e']);assert.equal(payload.dueDate,'');
  assert.ok(!JSON.stringify(payload).includes('PRIVATE_PROFILE'));
});

test('receiving a material does not automatically verify it, select it or close its issue',()=>{
  const workflow=fixture();workflow.materials.push({id:'workflow:proof',kind:'execution-record',title:'Полученный акт',text:'Материал для самостоятельной проверки.',issueIds:['repair'],verification:'PRIVATE_CONFIRMATION'});
  workflow.issues[0].materialIds.push('workflow:proof');
  const draft=startAction('verify'),before=structuredClone(draft);
  const html=controlWorkspaceView({workflow,actionDraft:draft,ui:{issueId:'repair'}});
  assert.ok(html.includes('Полученный акт'));
  assert.ok(!html.includes('PRIVATE_CONFIRMATION'));
  assert.ok(!/data-source-id="workflow:proof"[^>]*checked/.test(html));
  assert.deepEqual(draft,before);assert.equal(workflow.issues[0].status,'awaiting');
});

test('work stage and substantive outcome are displayed separately even when a procedural step is closed',()=>{
  const html=controlWorkspaceView({workflow:fixture(),ui:{issueId:'complaint'}});
  assert.ok(html.includes('Работа по вопросу завершена'));
  assert.ok(html.includes('Вопрос остаётся открытым'));
  assert.ok(html.includes('Самостоятельная проверка достоверности прежнего ответа.'));
  assert.ok(!html.includes('Исполнение подтверждено'));
  assert.ok(!html.includes('PRIVATE_CORRECT_CLOSURE'));
});

test('the workbench uses released workflow materials and does not expose future data or private classifications',()=>{
  const workflow=fixture();
  const html=controlWorkspaceView({workflow,actionDraft:startAction('verify'),ui:{issueId:'repair',materialId:'workflow:initial'},sources:[{id:'unreleased',title:'PRIVATE_UNRELEASED_SOURCE',text:'PRIVATE_OTHER_CASE'}]});
  for(const secret of ['PRIVATE_INSUFFICIENT','PRIVATE_CORRECT_CLOSURE','PRIVATE_FUTURE_TITLE','PRIVATE_FUTURE_FACT','PRIVATE_UNRELEASED_SOURCE','PRIVATE_OTHER_CASE'])assert.ok(!html.includes(secret),secret);
  assert.ok(html.includes('Работы обещали завершить.'));
  assert.match(html,/data-control-material="workflow:initial" tabindex="-1"/);
});

test('unsuccessful professional outcomes are visible without being presented as a technical failure or a grade',()=>{
  const workflow=fixture();workflow.journal[1].outcome='new_server_gap_code';
  const html=controlWorkspaceView({workflow,ui:{issueId:'repair'}});
  assert.match(html,/rxe-journal-entry rxe-journal-returned/);
  assert.ok(html.includes('Не представлены проверенные материалы по предмету.'));
  assert.ok(html.includes('Считаю вопрос рассмотренным.'));
  assert.ok(!html.includes('new_server_gap_code'));
  assert.ok(!/\b0\s*\/\s*100\b/.test(html));
});

test('a fresh notification has the expected-result field without imposing an invented date',()=>{
  const html=controlWorkspaceView({workflow:fixture(),actionDraft:startAction('notify'),ui:{issueId:'repair'}});
  assert.match(html,/data-control-field="expectedResult"/);
  assert.ok(!html.includes('data-control-field="dueDate"'));
  assert.ok(html.includes('Текст сообщения адресату'));
});

test('changing action kind does not hide already entered recipients, dates or expected results from the submitted record',()=>{
  const draft={...startAction('request_evidence'),recipientIds:['authority-1'],dueDate:'2026-11-19',expectedResult:'Датированный акт.'};
  const changed=reduceControlActionDraft(draft,{type:'select',issueId:'repair',kind:'verify'});
  const html=controlWorkspaceView({workflow:fixture(),actionDraft:changed,recipients,ui:{issueId:'repair'}});
  assert.ok(html.includes('Уполномоченное подразделение'));
  assert.ok(html.includes('value="2026-11-19"'));
  assert.ok(html.includes('Датированный акт.'));
});

test('the memorandum keeps the existing submission shape and evidence survives status changes',()=>{
  let draft=restoreCorrespondenceControl();
  draft=reduceCorrespondenceControl(draft,{type:'evidence',issueId:'repair',sourceId:'workflow:initial',selected:true});
  assert.equal(draft.statuses[0].status,'');
  draft=reduceCorrespondenceControl(draft,{type:'status',issueId:'repair',value:'pending'});
  draft=reduceCorrespondenceControl(draft,{type:'text',value:'Продолжить проверку: результат ещё не подтверждён.'});
  assert.deepEqual(correspondenceControlSubmission(draft),{text:'Продолжить проверку: результат ещё не подтверждён.',statuses:[{issueId:'repair',status:'pending',evidenceSourceIds:['workflow:initial']}]});
  const html=controlWorkspaceView({workflow:fixture(),draft,ui:{pane:'memorandum'}});
  assert.match(html,/data-response-status-evidence="workflow:initial" data-issue-id="repair"[^>]*checked/);
  assert.match(html,/data-response-control-field="text"/);
  assert.equal((html.match(/type="submit"/g)||[]).length,1);
  assert.ok(!/<form\b/.test(html),'the parent owns the single followup form');
  assert.ok(!/data-control-action="execute"/.test(html));
});

test('disabled work permits reading and navigation but blocks writing and commands',()=>{
  const workflow=fixture(),html=controlWorkspaceView({workflow,actionDraft:startAction(),ui:{issueId:'repair'},disabled:true});
  assert.match(html,/data-control-action="execute" disabled/);
  assert.match(html,/<textarea[^>]*data-control-field="reason"[^>]*disabled/);
  assert.ok(!/<button[^>]*data-control-action="open-material"[^>]*disabled/.test(html));
  assert.ok(!/<button[^>]*data-control-action="prepare-memorandum"[^>]*disabled/.test(html));
  const memorandum=controlWorkspaceView({workflow,ui:{pane:'memorandum'},disabled:true});
  assert.match(memorandum,/data-control-submit disabled/);
});

test('the final read-only record preserves action content, issue scope and recipient names without editable controls',()=>{
  const workflow=fixture();workflow.journal[1].recipientIds=['authority-1'];
  const control={text:'Мотивированное заключение по двум вопросам.',statuses:[{issueId:'repair',status:'pending',evidenceSourceIds:['workflow:initial']}]};
  const html=controlRecordView({workflow,control,recipients});
  assert.ok(html.includes('Мотивированное заключение по двум вопросам.'));
  assert.ok(html.includes('Уполномоченное подразделение'));
  assert.ok(html.includes('Считаю вопрос рассмотренным.'));
  assert.ok(html.includes('Дополнительное поручение'));
  assert.ok(html.includes('Предмет не определён'));
  assert.ok(!/<(?:input|select|textarea|button|form)\b/.test(html));
  assert.ok(!html.includes('PRIVATE_'));
});

test('all locales retain student-authored prose and escape untrusted titles, materials and action records',()=>{
  const workflow=fixture();
  workflow.issues[0].title='<img src=x onerror=alert(1)>';
  workflow.materials[0].text='<script>bad()</script>\nПодлинный текст материала.';
  workflow.journal[1].reason='</dd><iframe src="javascript:bad()"></iframe>';
  const action={...startAction(),instruction:'Авторский текст 中文 & English.'};
  for(const locale of ['ru','en','zh']){
    const html=controlWorkspaceView({workflow,actionDraft:action,ui:{issueId:'repair',materialId:'workflow:initial'},locale});
    assert.ok(html.includes('Авторский текст 中文 &amp; English.'));
    assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
    assert.ok(!/<(?:script|iframe|img)\b/.test(html));
    assert.ok(!html.includes('undefined'));assert.ok(!html.includes('[object Object]'));
  }
});

test('UI restoration preserves the chosen pane and material without smuggling workflow state',()=>{
  const original={issueId:'repair',materialId:'workflow:initial',pane:'memorandum',journalAll:true,status:'closed',reviewScore:100};
  const restored=restoreControlWorkspaceUI(original,fixture());
  assert.deepEqual(restored,{issueId:'repair',materialId:'workflow:initial',pane:'memorandum',journalAll:true});
  const changed=reduceControlWorkspaceUI(restored,{type:'journal'},fixture());
  assert.equal(changed.journalAll,false);assert.equal(restored.journalAll,true);
});

test('event decoding uses explicit field/action attributes and never performs an operation itself',()=>{
  const target={dataset:{controlField:'evidenceSourceIds',sourceId:'workflow:initial'},checked:true,disabled:false};
  const element={closest:selector=>selector==='[data-control-field]'?target:null};
  assert.deepEqual(controlWorkspaceIntent(element),{type:'action-draft',action:{type:'evidence',sourceId:'workflow:initial',selected:true}});
  target.disabled=true;assert.equal(controlWorkspaceIntent(element),null);
  const execute={dataset:{controlAction:'execute'},disabled:false};
  assert.deepEqual(controlWorkspaceIntent({closest:selector=>selector==='[data-control-action]'?execute:null}),{type:'execute'});
  assert.equal(controlWorkspaceIntent({closest:()=>null}),null);
});
