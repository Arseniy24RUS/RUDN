const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root='rudn-platform/v1',key=process.env.QA_STUDENT||'9909133001',out=process.env.QA_OUT||require('node:os').tmpdir(),withStorage=process.env.QA_STORAGE==='1';
const config=fs.readFileSync('site/assets/js/config.js','utf8').replace(/export const CONFIG\s*=\s*\{/,`export const CONFIG = {emulators:{auth:"http://127.0.0.1:9099",host:"127.0.0.1",databasePort:9000${withStorage?',storagePort:9199':''}},`);
async function db(path,method='GET',body){const r=await fetch(`http://127.0.0.1:9000/${root}/${path}.json?ns=demo-rudn-default-rtdb`,{method,headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert(r.ok);return r.json()}
(async()=>{
  await db('profiles/'+key,'PUT',{studentKey:key,ticket:key,email:key+'@rudn.ru',fullName:'Синтетический Тест Вложений',group:'ГГУбд-03-26',ownerUid:'qa-existing',ownerUids:{'qa-existing':true}});
  await db('access/overrides/2026/topic-3','PUT',{state:'open',updatedAt:Date.now(),teacherUid:'qa-emulator-only'});
  const browser=await (process.env.QA_ENGINE==='webkit'?webkit:chromium).launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/assets/js/config.js*',r=>r.fulfill({contentType:'application/javascript',body:config}));
  const errors=[];await context.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app|firebaseapp\.com)\//,r=>{errors.push('Production request blocked');return r.abort()});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const ready=async()=>{await page.evaluate(async()=>{await (await import('/assets/js/backend.js?v=1.3.4')).backend.init()});await page.locator('#app[aria-busy="false"]').waitFor()};
  try{
    await page.goto('http://127.0.0.1:8765/#dashboard');await ready();await page.locator('#profileButton').click();await page.locator('#authIdentifier').fill(key);await page.locator('#authStudentDetails').waitFor();await page.locator('#authSubmit').click();await page.locator('#authDialog').waitFor({state:'hidden'});
    await page.goto('http://127.0.0.1:8765/#activity/seminar-3');await page.locator('#settlementForm[data-attempt-id]').waitFor();
    await page.locator('[name="territory"]').fill('Проверочная территория');await page.locator('[name="indicators"]').fill('Учебные показатели');
    const text='Содержательный тестовый анализ. '.repeat(9);await page.locator('[name="dynamics"]').fill(text);await page.locator('[name="conclusion"]').fill(text);
    await page.locator('[name="conclusion"]').pressSequentially(' Последний ввод');
    await page.locator('nav a[href="#dashboard"]:visible').click();await page.waitForURL('**/#dashboard');await ready();
    await page.goto('http://127.0.0.1:8765/#activity/seminar-3');await page.locator('#settlementForm[data-attempt-id]').waitFor();assert.equal(await page.locator('[name="conclusion"]').inputValue(),text+' Последний ввод');
    await page.locator('[name="file"]').setInputFiles({name:'qa-backup.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nSynthetic QA file; no student content')});
    await page.evaluate(async()=>{const {formDraft}=await import('/assets/js/form-draft.js');await formDraft(document.querySelector('#settlementForm')).flush()});
    const id=await page.locator('#settlementForm').getAttribute('data-attempt-id');
    await page.reload();await page.locator('#settlementForm[data-attempt-id]').waitFor();assert.equal(await page.locator('#settlementForm').getAttribute('data-attempt-id'),id);
    assert((await page.locator('[data-saved-attachment]').innerText()).includes('qa-backup.pdf'));
    await page.locator('#app[aria-busy="false"]').waitFor();
    await page.locator('[data-saved-attachment]').scrollIntoViewIfNeeded();
    await page.screenshot({path:out+'/form-restored-attachment.png'});
    await page.locator('#settlementForm [type="submit"]').click();await page.locator('#settlementForm:not([data-saving])').waitFor();
    const saved=await page.evaluate(async key=>{
      const {durableStore}=await import('/assets/js/durable-store.js');await durableStore.flush();
      return {attempts:await durableStore.listAttempts({owner:'student:'+key}),pending:await durableStore.listPending({owner:'student:'+key,includeDeferred:true}),backup:await durableStore.exportBackup({owner:'student:'+key})};
    },key);
    assert.equal(saved.attempts.length,1);assert.equal(saved.attempts[0].id,id);assert(saved.attempts[0].fileUrl.startsWith('rudn-attachment:'));
    assert(saved.backup.attachments.some(a=>a.dataUrl?.startsWith('data:application/pdf;base64,')));
    if(withStorage){
      let cloud;for(let i=0;i<140;i++){cloud=await db(`attempts/${key}/${id}`);if(cloud)break;await new Promise(resolve=>setTimeout(resolve,250))}
      assert(cloud,'Uploaded attachment and attempt must reach the emulator');assert(cloud.fileUrl.startsWith('http://127.0.0.1:9199/'));
      const file=await fetch(cloud.fileUrl);assert(file.ok);assert.equal(await file.text(),'%PDF-1.4\nSynthetic QA file; no student content');
      assert.equal((await db(`grades/${key}/seminar-3`)).points,5);
      console.log('PASS: Storage emulator confirmed file bytes, stable attempt and best grade.');
    }else{
      assert(saved.pending.some(op=>op.type==='attempt'),'Missing deferred attempt');
      assert.equal(await db(`attempts/${key}/${id}`),null,'Unuploaded mandatory attachment must prevent cloud attempt ACK');
    }
    assert.deepEqual(errors,[]);console.log('PASS: last input navigation, stable form ID, reload, restored attachment, durable PDF backup.');
  }catch(error){await page.screenshot({path:out+'/form-failure.png'});throw error}
  finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
