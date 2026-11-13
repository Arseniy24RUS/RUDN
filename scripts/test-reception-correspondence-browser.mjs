#!/usr/bin/env node
/** Browser acceptance against the actual app and service; explicit scripted review only.
 * Browser plugin is unavailable in this workspace; ordinary Playwright is used.
 * No Firebase, paid API call or production grade. */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
import {createCorrespondenceQACase,correspondenceQAProfiles,explicitQAReview} from './reception-correspondence-qa-cases.mjs';
import {createScriptedCorrespondenceReviewer} from './reception-correspondence-test-reviewer.mjs';
import {ReceptionError} from '../firebase/functions/reception-ai/schema.mjs';
import {ROUTING_RECIPIENTS} from '../firebase/functions/reception-ai/routing-cases.mjs';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const out=path.resolve(arg('--out',path.join(os.tmpdir(),'reception-correspondence-browser')));
const modulePath=arg('--playwright-module',process.env.RECEPTION_PLAYWRIGHT_MODULE);
const browserName=arg('--browser','chromium');
if(!['chromium','webkit'].includes(browserName))throw Error('Use --browser chromium or webkit');
const playwright=await import(modulePath?pathToFileURL(path.resolve(modulePath)).href:'playwright');
const caseData=await createCorrespondenceQACase();
const casesDirectory=path.join(out,'private-qa-cases');await mkdir(casesDirectory,{recursive:true});
await writeFile(path.join(casesDirectory,caseData.id+'.json'),JSON.stringify(caseData));
const report={suite:'correspondence-workflow',actualBrowser:true,browser:browserName,provider:'explicit-scripted-mock',cases:[],errors:[]};
const browser=await playwright[browserName].launch({headless:true,...(arg('--executable')?{executablePath:arg('--executable')}:{})});
const studentName='Иванов Иван Петрович';
const text={
  facts:'В обращении поставлены два самостоятельных вопроса: восстановление дорожки и достоверность ранее направленного ответа И-7. Представленные материалы подтверждают, что ремонт на указанную дату не завершён. Причины расхождения и ответственность должностных лиц требуют проверки.',
  legalBasis:'Согласно части 6 статьи 8 Федерального закона № 59-ФЗ запрещено направлять жалобу на рассмотрение органу или должностному лицу, действия которых обжалуются. Получение пояснений И-7 не означает передачи ему окончательного рассмотрения жалобы.',
  resolution:'Просьба о восстановлении дорожки и жалоба на прежний ответ подлежат раздельному рассмотрению. Необходимо запросить документы о фактическом состоянии дорожки и пояснения И-7. Вывод по жалобе должен быть подготовлен независимо от исполнителя обжалуемого ответа.',
  nextSteps:'По каждому вопросу сохраняется самостоятельный контроль. Заявительнице необходимо сообщить результаты рассмотрения. Завершение ремонта проверяется по подтверждающим материалам; оно не заменяет разрешения жалобы на прежний ответ.',
};
async function runScenario({width,height,locale='ru',retry=false}) {
  const script=createScriptedCorrespondenceReviewer({reviews:[
    ...(retry?[()=>{throw new ReceptionError('review_unavailable',503);}]:[]),
    context=>explicitQAReview(context,{initialLevel:3}),context=>explicitQAReview(context,{controlLevel:3}),
  ]});
  const fixture=await createReceptionFixture({casesDirectory,decisionVersion:'correspondence-v1',studentName,
    serviceOptions:{correspondenceProfiles:correspondenceQAProfiles},provider:{...script,name:'mock',generate:async({actorCase})=>({reply:actorCase.facts[0].text.ru,revealedFactIds:[actorCase.facts[0].id],releasedDocumentIds:[],usage:{inputTokens:0,outputTokens:0}})}});
  await new Promise(resolve=>fixture.server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${fixture.server.address().port}`;
  const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block',acceptDownloads:true});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  const reviews=[];page.on('request',request=>{
    if(request.url()!==origin+'/api/reception'||request.method()!=='POST')return;
    const body=request.postDataJSON();if(['decide','followup'].includes(body.op))reviews.push(JSON.stringify(body));
  });
  const key=`${width}x${height}-${locale}`;
  const row={key,checks:[],screenshots:[],status:'running'};report.cases.push(row);
  const idle=()=>page.waitForFunction(()=>document.querySelector('#receptionAI')?.getAttribute('aria-busy')==='false');
  const check=name=>row.checks.push(name);
  const navigate=async name=>{await page.locator(`#rxaPage-${name}`).click();await idle();};
  const shot=async name=>{const file=`${key}-${name}.png`;await page.screenshot({path:path.join(out,file),animations:'disabled'});row.screenshots.push(file);};
  const overflow=async()=>{const geometry=await page.evaluate(()=>{const c=document.querySelector('.rxa-page-content');return {w:innerWidth,d:document.documentElement.scrollWidth,cw:c.clientWidth,cs:c.scrollWidth};});assert.ok(geometry.d<=geometry.w+1&&geometry.cs<=geometry.cw+1,JSON.stringify(geometry));};
  try {
    await page.goto(`${origin}/__qa/reception.html?lang=${locale}&context=free`,{waitUntil:'domcontentloaded'});
    await page.locator(`[name="trainingCaseId"] option[value="${caseData.id}"]`).waitFor({state:'attached'});
    await page.locator('[name="trainingCaseId"]').selectOption(caseData.id);
    await page.locator('[data-action="start"]').click();
    await page.locator('#receptionAI[data-session-status="active"]').waitFor();await idle();
    for(const id of ['d1','d2']){
      await navigate('documents');
      if(await page.locator('[data-action="documents-list"]').count())await page.locator('[data-action="documents-list"]').click();
      await page.locator(`[data-action="document"][data-id="${id}"]`).click();await idle();
      await page.locator(`[data-response-action="use-source"][data-source-key="document:${id}"]`).click();
      await page.locator('[data-correspondence-editor]').waitFor();
    }
    assert.equal(await page.locator('[data-decision="procedureId"],[data-decision="actionIds"]').count(),0);
    assert.equal(await page.locator('[data-response-section="facts"] .rxc-citation').count(),2);check('Opened case materials become section citations; old quiz controls absent');
    await navigate('documents');
    if(await page.locator('[data-action="documents-list"]').count())await page.locator('[data-action="documents-list"]').click();
    await page.locator('[data-normative-doc="reception-law59999"]').first().click();
    const reader=page.locator('.rx-source-embedded');await reader.locator('.ll-paper [data-unit]').first().waitFor();
    const search=reader.locator('[data-input="reader-query"]');await search.fill('Запрещается направлять жалобу');await search.press('Enter');
    await reader.locator('.ll-search-results [data-action="jump-unit"]').first().click();
    const paragraph=reader.locator('.ll-paper [data-unit]').filter({hasText:'Запрещается направлять жалобу'}).first();await paragraph.click();
    await reader.locator('[data-source-reference-use]').click();
    await page.locator('[data-correspondence-editor]').waitFor();
    assert.equal(await page.locator('[data-response-section="legalBasis"] .rxc-citation').count(),1);check('Real legal reader transfers a pinned paragraph into the letter');
    await page.locator('[data-response-field="subject"]').fill('О восстановлении дорожки и проверке прежнего ответа');
    for(const [section,value]of Object.entries(text))await page.locator(`[data-response-field="sections.${section}"]`).fill(value);
    await page.locator('[data-response-action="add-order"]').click();
    await page.locator('[data-response-order-field="issue"]').fill('Проверка прежнего ответа');
    await page.locator('[data-response-order-field="kind"]').selectOption('review');
    await page.locator('[data-response-order-field="instruction"]').fill('Запросить материалы и провести независимую проверку изложенных в жалобе обстоятельств.');
    await page.locator('[data-response-order-field="dueDate"]').fill('2026-11-19');
    await page.locator('[data-response-order-field="expectedResult"]').fill('Мотивированное заключение по доводам жалобы с подтверждающими материалами.');
    await page.locator('[data-response-action="choose-recipient"]').click();
    const recipient=ROUTING_RECIPIENTS[caseData.id][0][0];
    await page.locator('[data-routing-territory]').selectOption('');
    // Search by the same public directory name a student can see.
    const authority=(await import('../site/apps/reception/ai/authority-directory.js')).RECEPTION_AUTHORITIES.find(row=>row.id===recipient);
    await page.locator('[data-routing-search]').fill(authority.name);
    await page.locator(`[data-routing-recipient][value="${recipient}"]`).check();
    await page.locator('[data-response-action="recipient-done"]').click();
    await page.locator('.rxc-order-citations summary').click();
    await page.locator('[data-response-order-citation]').first().check();
    await page.locator('[data-response-action="preview"]').click();
    await page.locator('[data-correspondence-preview]').waitFor();
    assert.ok((await page.locator('.rxc-letter-body').innerText()).includes(text.resolution));
    assert.equal(await page.locator('.rxc-letter-body h2').count(),0);
    assert.match(await page.locator('.rxc-letter-specialist').innerText(),new RegExp(studentName));
    await overflow();await shot('letter');check('Student prose is composed into a document with an assignment and no quiz headings');
    const assignmentCitation=page.locator('.rxc-letter-order [data-response-citation-link]').first();
    const hash=await page.evaluate(()=>location.hash),citationTarget=await assignmentCitation.getAttribute('href');
    await assignmentCitation.click();
    assert.equal(await page.evaluate(()=>location.hash),hash,'Citation links must not change the platform route');
    assert.equal(await page.locator(`${citationTarget}:focus`).count(),1);
    check('Assignment citations navigate within the preview without changing the platform route');
    const downloadEvent=page.waitForEvent('download');await page.locator('[data-response-action="download"]').click();
    const download=await downloadEvent;const downloaded=path.join(out,`${key}-letter.html`);await download.saveAs(downloaded);
    const html=await readFile(downloaded,'utf8');assert.ok(html.includes(text.facts));assert.ok(html.includes(studentName));assert.ok(!html.includes('data-response-field'));check('Self-contained HTML export includes the work and the authenticated specialist name');
    if(browserName==='chromium'&&width>1000){
      const printPage=await context.newPage();
      try{
        await printPage.setContent(html);
        await printPage.pdf({path:path.join(out,`${key}-letter.pdf`),preferCSSPageSize:true,printBackground:true});
      }finally{await printPage.close();}
      check('Chromium renders the downloadable letter to an A4 PDF');
    }
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#receptionAI[data-session-status="active"]').waitFor();await idle();
    await navigate('decision');await page.locator('[data-correspondence-preview]').waitFor();
    assert.ok((await page.locator('.rxc-letter-body').innerText()).includes(text.facts));check('Reload restores prose, citations, assignment and preview');
    await page.locator('[data-response-action="edit"]').click();await page.locator('[data-correspondence-editor]').waitFor();
    await overflow();await shot('editor');
    await page.locator('[data-decision-form] button[type="submit"]').click();await page.locator('[data-action="confirm-decision"]').click();
    await idle();
    if(retry){
      assert.equal(await page.locator('#receptionAI').getAttribute('data-session-status'),'active');
      assert.equal(await page.locator('[data-action="retry"]').count(),1);
      const snapshot=await fixture.store.get('sessions/'+await page.locator('#receptionAI').getAttribute('data-session-id'));
      assert.equal(snapshot.caseStates[0].correspondenceInitialFeedback,undefined,'Failed review must not assign a zero');
      await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-action="retry"]').waitFor();await idle();
      await page.locator('[data-action="retry"]').click();await idle();check('A failed review preserves the submission across reload and safely retries');
    }
    await page.locator('#receptionAI[data-session-status="followup"]').waitFor();
    assert.equal(await page.locator('[data-followup-choice]').count(),0);
    await page.locator('[data-response-control-field="text"]').fill('Дорожка восстановлена, этот результат фиксируется отдельно. Проверка прежнего ответа не завершена; жалобу необходимо оставить на контроле и запросить самостоятельное заключение.');
    await page.locator('[data-response-status-field][data-issue-id="repair"]').selectOption('resolved');
    await page.locator('[data-response-status-field][data-issue-id="complaint"]').selectOption('pending');
    for(const issue of ['repair','complaint']){
      await page.locator(`[data-details="response-control-sources-${issue}"] summary`).click();
      await page.locator(`[data-response-status-evidence="followup"][data-issue-id="${issue}"]`).check();
    }
    await overflow();await shot('control');check('Follow-through uses a free conclusion and separate issue states with evidence');
    await page.locator('[data-followup-form] button[type="submit"]').click();await page.locator('#receptionAI[data-session-status="review"]').waitFor();await idle();
    await page.locator('[data-action="next"]').click();await page.locator('#receptionAI[data-session-status="complete"]').waitFor();await idle();
    await page.locator('[data-details="result-0"] summary').first().click();
    assert.equal(await page.locator('[data-response-result="0"] [data-response-action="edit"]').count(),0);
    await page.locator('[data-details="response-protocol"] summary').first().click();
    assert.equal(await page.locator('.rxc-protocol-stage').count(),2);await overflow();await shot('assessment');
    assert.ok(reviews.length>=2&&reviews.every(body=>!body.includes(studentName)),'Profile data must stay out of review payloads');
    assert.equal(errors.length,0,errors.join('\n'));check('Final feedback distinguishes initial and control scores; no browser exceptions');
    row.status='passed';
  } catch(error) {row.status='failed';row.error=String(error);row.browserErrors=errors;await shot('failure').catch(()=>{});throw error;}
  finally {await context.close();await new Promise(resolve=>fixture.server.close(resolve));}
}
try {
  const full=[{width:1440,height:1000,retry:true},{width:390,height:844},{width:320,height:740},{width:390,height:844,locale:'en'},{width:390,height:844,locale:'zh'}];
  const selected=arg('--scenario');
  for(const scenario of full.filter(row=>!selected||`${row.width}-${row.locale||'ru'}`===selected))await runScenario(scenario);
  report.status='passed';
} catch(error){report.status='failed';report.errors.push(String(error));process.exitCode=1;}
finally {await browser.close();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
