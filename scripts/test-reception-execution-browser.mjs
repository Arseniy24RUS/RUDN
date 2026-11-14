#!/usr/bin/env node
/** Browser acceptance for the actual execution workspace and local service.
 * The initial letter is seeded through the real service. Every control action,
 * recipient selection and final submission goes through the real browser UI.
 * The reviewer is explicitly scripted: no live model, Firebase or real gradebook.
 * Run in browser-capable CI; do not infer a pass from a syntax-only check. */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
import {createExecutionQA,executionQAProfiles} from './reception-execution-qa.mjs';
import {RECEPTION_AUTHORITIES} from '../site/apps/reception/ai/authority-directory.js';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const out=path.resolve(arg('--out',path.join(os.tmpdir(),'reception-execution-browser')));
const modulePath=arg('--playwright-module',process.env.RECEPTION_PLAYWRIGHT_MODULE);
const browserName=arg('--browser','chromium');
if(!['chromium','webkit'].includes(browserName))throw Error('Use --browser chromium or webkit.');
const allScenarios=['ru','en','zh'].flatMap(locale=>[{width:1440,height:1000,locale},{width:390,height:844,locale}]);
const selected=arg('--scenario'),scenarios=allScenarios.filter(row=>!selected||`${row.width}-${row.locale}`===selected);
if(!scenarios.length)throw Error('Unknown --scenario; use 1440-ru, 390-ru, 1440-en, 390-en, 1440-zh or 390-zh.');
const report={suite:'execution-browser-acceptance',status:'running',browser:browserName,context:'seminar',
  provider:'explicit-scripted-mock',initialStage:'Seeded through the real service; the control workflow uses browser interactions.',
  limitations:['One authored acceptance case; not all-case validation.',
    'Local HTTP fixture with an actual browser and service; no production Firebase or live model assessment.'],cases:[],errors:[]};
await mkdir(out,{recursive:true});
let browser;

async function runScenario({width,height,locale}){
  const qa=await createExecutionQA(),caseData=qa.c,issueId='repair',otherId='previous-response';
  const casesDirectory=path.join(out,'private-qa-cases');await mkdir(casesDirectory,{recursive:true});
  await writeFile(path.join(casesDirectory,caseData.id+'.json'),JSON.stringify(caseData));
  const fixture=await createReceptionFixture({casesDirectory,provider:qa.provider,
    decisionVersion:'correspondence-v1',controlVersion:'execution-v1',
    serviceOptions:{correspondenceProfiles:executionQAProfiles,requireGameplay:true}});
  const key=`${width}x${height}-${locale}`,row={key,status:'running',checks:[],screenshots:[],geometry:[]};report.cases.push(row);
  let context,page,view;
  const errors=[];
  try{
    // Isolate the new control gate from the separately tested initial editor.
    view=(await fixture.service.handle({op:'start',mode:'training',locale,context:'seminar',requestId:'browser-start',
      workbookVersion:2,decisionVersion:'correspondence-v1',controlVersion:'execution-v1'},fixture.identity)).view;
    for(const doc of caseData.documents)view=(await fixture.service.handle({op:'document',sessionId:view.id,documentId:doc.id,
      requestId:'open-'+doc.id},fixture.identity)).view;
    view=(await fixture.service.handle({op:'decide',sessionId:view.id,expectedRevision:view.revision,requestId:'initial-review',
      decision:qa.decision},fixture.identity)).view;
    assert.equal(view.status,'followup');assert.equal(view.controlWorkflow.version,'execution-v1');
    const initialScore=(await fixture.store.get('sessions/'+view.id)).caseStates[0].correspondenceInitialFeedback.score;
    const initialLetter=structuredClone(view.decision.correspondence);
    const eventId=view.controlWorkflow.materials.find(material=>material.issueIds.includes(otherId)).id;
    const recipientId=qa.profile.control.workflow.issues.find(issue=>issue.id===issueId).acceptedRecipientSets[0][0];
    const authority=RECEPTION_AUTHORITIES.find(item=>item.id===recipientId);assert.ok(authority);
    await new Promise((resolve,reject)=>{fixture.server.once('error',reject);fixture.server.listen(0,'127.0.0.1',resolve);});
    const origin=`http://127.0.0.1:${fixture.server.address().port}`;
    context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
    await context.addInitScript(({origin,snapshot,storageKey})=>{
      if(location.origin===origin&&!localStorage.getItem(storageKey))localStorage.setItem(storageKey,JSON.stringify(snapshot));
    },{origin,storageKey:`rudn.reception.workspace.v2:${encodeURIComponent(fixture.identity.studentKey)}:${encodeURIComponent('/api/reception')}:current`,
      snapshot:{version:'reception-ai-ui-v1',owner:fixture.identity.studentKey,sessionId:view.id,status:view.status,caseId:caseData.id,
        page:'decision',tab:'decision',locale,decisionDraft:view.decision,controlWorkspaceUI:{issueId}}});
    page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(String(error)));
    const idle=()=>page.waitForFunction(()=>document.querySelector('#receptionAI')?.getAttribute('aria-busy')==='false');
    const check=name=>row.checks.push(name);
    const shot=async name=>{const file=`${key}-${name}.png`;await page.screenshot({path:path.join(out,file),animations:'disabled'});row.screenshots.push(file);};
    const issue=id=>view.controlWorkflow.issues.find(item=>item.id===id);
    const latest=()=>view.controlWorkflow.journal.at(-1);
    async function overflow(stage){
      await page.waitForFunction(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].every(link=>link.sheet));
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
      const geometry=await page.evaluate(()=>{
        const content=document.querySelector('.rxa-page-content');
        const visible=selector=>[...document.querySelectorAll(selector)].filter(element=>{const box=element.getBoundingClientRect();return box.width&&box.height;});
        const workspaces=visible('[data-control-workspace],[data-control-record]').map(element=>({width:element.clientWidth,scroll:element.scrollWidth}));
        const clipped=visible('[data-control-workspace] input,[data-control-workspace] textarea,[data-control-workspace] select,[data-control-workspace] button').flatMap(element=>{
          const box=element.getBoundingClientRect();return box.left< -1||box.right>innerWidth+1?[{tag:element.tagName,left:box.left,right:box.right}]:[];
        });
        return {viewport:innerWidth,document:document.documentElement.scrollWidth,content:content?{width:content.clientWidth,scroll:content.scrollWidth}:null,workspaces,clipped};
      });
      row.geometry.push({stage,...geometry});assert.ok(geometry.content,'The actual workspace scroll container exists');
      assert.ok(geometry.document<=geometry.viewport+1,JSON.stringify(geometry));
      assert.ok(geometry.content.scroll<=geometry.content.width+1,JSON.stringify(geometry));
      assert.ok(geometry.workspaces.every(item=>item.scroll<=item.width+1),JSON.stringify(geometry));
      assert.deepEqual(geometry.clipped,[],JSON.stringify(geometry));
    }
    async function uiClick(selector){await page.locator(selector).first().click();await idle();}
    async function chooseAction(kind,id=issueId){
      await uiClick(`[data-control-action="select-issue"][data-issue-id="${id}"]`);
      await uiClick(`[data-control-action="select-kind"][data-kind="${kind}"][data-issue-id="${id}"]`);
    }
    async function fillAction(fields,evidenceIds){
      for(const [field,value]of Object.entries(fields))await page.locator(`[data-control-field="${field}"]`).fill(value);
      for(const id of evidenceIds)await page.locator(`[data-control-field="evidenceSourceIds"][data-source-id="${id}"]`).check();
    }
    async function submitOperation(op,selector){
      const responsePromise=page.waitForResponse(response=>{
        const request=response.request();return request.url()===origin+'/api/reception'&&request.method()==='POST'&&request.postDataJSON()?.op===op;
      });
      await page.locator(selector).click();const response=await responsePromise,body=await response.json();
      assert.equal(response.ok(),true,JSON.stringify(body));assert.equal(body.ok,true,JSON.stringify(body));view=body.view;
      await idle();
      if(op==='control-action')await page.locator(`[data-control-workspace][data-control-revision="${view.controlWorkflow.revision}"]`).waitFor();
      return view;
    }
    const execute=()=>submitOperation('control-action','[data-control-action="execute"]');

    await page.goto(`${origin}/__qa/reception.html?lang=${locale}&context=seminar`,{waitUntil:'domcontentloaded'});
    await page.locator('#receptionAI[data-session-status="followup"]').waitFor();await idle();
    assert.equal(await page.locator('#receptionAI').getAttribute('lang'),locale);
    assert.equal(await page.locator('form form,[data-followup-choice]').count(),0);
    await overflow('overview');check('The actual seminar control workspace mounts without quiz controls or horizontal overflow');

    await chooseAction('request_evidence');
    await fillAction({reason:'Сообщение о ремонте необходимо сопоставить с документом о выполненных работах по этому объекту.',
      instruction:'Представить относимый документ о восстановлении дорожки с указанием объекта и выполненных работ. Жалобу на прежний ответ рассматривать самостоятельно.',
      dueDate:'2026-11-19',expectedResult:'Документ о выполнении работ, позволяющий проверить восстановление дорожки.'},[eventId]);
    await uiClick('[data-control-action="choose-recipient"]');await page.locator('[data-routing-territory]').selectOption('');
    await page.locator('[data-routing-search]').fill(authority.name);
    await page.locator(`[data-routing-recipient][value="${recipientId}"]`).check();
    await uiClick('[data-action="control-recipient-done"]');
    assert.ok((await page.locator('.rxe-recipient-chips').innerText()).trim());
    await overflow('request');await page.locator('[data-control-composer]').scrollIntoViewIfNeeded();await shot('request');
    await execute();assert.equal(latest().outcome,'request_received');assert.equal(latest().accepted,true);
    assert.equal(issue(issueId).status,'awaiting');assert.deepEqual(issue(issueId).verifiedEvidenceIds,[]);
    const incoming=view.controlWorkflow.materials.find(material=>material.kind==='execution-record'&&material.issueIds.includes(issueId));assert.ok(incoming);
    await uiClick(`.rxe-materials [data-control-action="open-material"][data-material-id="${incoming.id}"]`);
    const material=page.locator(`[data-control-material="${incoming.id}"]`);
    assert.equal((await material.locator('.rxe-material-text').innerText()).replace(/\s+/g,' ').trim(),incoming.text.replace(/\s+/g,' ').trim());
    assert.equal(await material.locator('h3:focus').count(),1);
    await overflow('incoming-material');await shot('material');check('A directory-addressed request releases a readable full document without treating receipt as verification');

    await chooseAction('verify');await fillAction({reason:'Проверяется выполнение ремонта в пределах самостоятельного вопроса обращения.',
      instruction:'Полученный документ относится к указанной дорожке и подтверждает выполненные работы. Он не устанавливает результат независимого рассмотрения жалобы на прежний ответ.'},[incoming.id]);
    await execute();assert.equal(latest().outcome,'evidence_verified');assert.equal(issue(issueId).status,'ready');
    assert.deepEqual(issue(issueId).verifiedEvidenceIds,[incoming.id]);
    await chooseAction('notify');assert.equal(await page.locator('[data-control-field="expectedResult"]').count(),1);
    assert.equal(await page.locator('[data-control-field="dueDate"]').count(),0);
    await fillAction({reason:'Заявительнице необходимо сообщить подтверждённый результат по вопросу ремонта.',
      instruction:'Восстановление дорожки подтверждено проверенным документом. Рассмотрение жалобы на прежний ответ продолжается отдельно.',
      expectedResult:'Зафиксированное учебное уведомление о результате ремонта и самостоятельном рассмотрении жалобы.'},[incoming.id]);
    await overflow('notification');await execute();assert.equal(latest().outcome,'notice_recorded');assert.equal(issue(issueId).notified,true);
    await chooseAction('close');await fillAction({reason:'Относимое подтверждение ремонта проверено, учебное уведомление зафиксировано. Завершается только вопрос восстановления дорожки.'},[incoming.id]);
    await execute();assert.equal(latest().outcome,'closed');assert.equal(issue(issueId).status,'closed');
    assert.equal(issue(issueId).substantiveStatus,'resolved');assert.equal(issue(otherId).status,'open');assert.equal(issue(otherId).substantiveStatus,'pending');
    check('Verification, an explicit notice and closure complete only the repair issue');

    await chooseAction('keep_open',otherId);await fillAction({reason:'Подтверждение ремонта не разрешает самостоятельную жалобу на прежний ответ.',
      instruction:'Запросить независимый мотивированный результат по каждому доводу жалобы и проверить подтверждающие материалы.',
      dueDate:'2026-11-20',expectedResult:'Самостоятельное заключение по доводам жалобы.'},[eventId]);
    await execute();assert.equal(latest().outcome,'kept_open');assert.equal(qa.reviewer.reviewCalls,1);
    await uiClick('[data-control-action="prepare-memorandum"]');
    const memorandum='Документ о восстановлении дорожки получен и проверен; учебное уведомление о результате зафиксировано. В пределах этого предмета работа завершена. Жалоба на прежний ответ требует самостоятельного рассмотрения: её нельзя считать разрешённой вследствие ремонта. По этому вопросу сохраняется контроль и зафиксировано дальнейшее действие.';
    for(const [id,status,source]of [[issueId,'resolved',incoming.id],[otherId,'pending',eventId]]){
      const statusField=page.locator(`[data-response-status-field="status"][data-issue-id="${id}"]`);
      await statusField.selectOption(status);
      const issueCard=page.locator('.rxe-final-issue').filter({has:statusField});
      await issueCard.locator('.rxe-final-sources summary').click();
      await page.locator(`[data-response-status-evidence="${source}"][data-issue-id="${id}"]`).check();
    }
    await page.locator('[data-response-control-field="text"]').fill(memorandum);
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-control-memorandum]').waitFor();await idle();
    assert.equal(await page.locator('[data-response-control-field="text"]').inputValue(),memorandum);
    assert.equal(await page.locator(`[data-response-status-field="status"][data-issue-id="${issueId}"]`).inputValue(),'resolved');
    assert.equal(await page.locator(`[data-response-status-field="status"][data-issue-id="${otherId}"]`).inputValue(),'pending');
    await overflow('memorandum');await page.locator('[data-control-memorandum]').scrollIntoViewIfNeeded();await shot('memorandum');
    check('A mixed closed/continuing memorandum retains prose, independent statuses and evidence after reload');

    await submitOperation('followup','[data-control-submit]');assert.equal(view.status,'review');assert.equal(qa.reviewer.reviewCalls,2);
    assert.equal(view.feedback.correspondence.initialScore,initialScore);assert.deepEqual(view.decision.correspondence,initialLetter);
    const savedControl=structuredClone(view.control),journalCount=view.controlWorkflow.journal.length;
    await submitOperation('next','[data-action="next"]');assert.equal(view.status,'complete');
    assert.deepEqual(view.result.cases[0].control,savedControl);assert.equal(view.result.cases[0].controlWorkflow.journal.length,journalCount);
    await page.locator('[data-details="result-0"] > summary').click();
    const record=page.locator('[data-control-record]');await record.waitFor({state:'visible'});
    assert.equal(await record.locator('input,select,textarea,button,form').count(),0);
    assert.ok((await record.innerText()).includes(memorandum));assert.equal(await record.locator('[data-control-event]').count(),journalCount);
    await record.scrollIntoViewIfNeeded();await overflow('readonly-result');await shot('result');
    check('The readonly final record preserves the full journal, scoped conclusions and original assessment');
    assert.deepEqual(errors,[]);row.status='passed';row.reviewCalls=qa.reviewer.reviewCalls;
    row.actionOutcomes=view.result.cases[0].controlWorkflow.journal.map(({kind,accepted,outcome})=>({kind,accepted,outcome}));
  }catch(error){
    row.status='failed';row.error=String(error);row.stack=error.stack;row.browserErrors=errors;
    if(page){const file=`${key}-failure.png`;await page.screenshot({path:path.join(out,file),animations:'disabled'}).then(()=>row.screenshots.push(file)).catch(()=>{});
      await page.content().then(html=>writeFile(path.join(out,`${key}-failure.html`),html)).catch(()=>{});}
    throw error;
  }finally{await context?.close();if(fixture.server.listening)await new Promise(resolve=>fixture.server.close(resolve));}
}

try{
  const playwright=await import(modulePath?pathToFileURL(path.resolve(modulePath)).href:'playwright');
  browser=await playwright[browserName].launch({headless:true,...(arg('--executable')?{executablePath:arg('--executable')}:{})});
  report.browserVersion=browser.version();
  for(const scenario of scenarios)await runScenario(scenario);
  report.status='passed';
}catch(error){report.status='failed';report.errors.push(String(error));process.exitCode=1;}
finally{await browser?.close();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
