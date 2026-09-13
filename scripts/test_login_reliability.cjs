// Isolated integration test: all authentication/database writes target demo-rudn emulators.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:8765/';
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))throw Error('Localhost only');
const out=process.env.QA_OUT||path.join(require('node:os').tmpdir(),'rudn-login-reliability');fs.mkdirSync(out,{recursive:true});
const config=fs.readFileSync('site/assets/js/config.js','utf8').replace(/export const CONFIG\s*=\s*\{/,'export const CONFIG = {emulators:{auth:"http://127.0.0.1:9099",host:"127.0.0.1",databasePort:9000},');
async function db(p,method='GET',body){const response=await fetch(`http://127.0.0.1:9000/${p}.json?ns=demo-rudn-default-rtdb`,{method,headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert(response.ok,await response.text().then(text=>{try{return JSON.parse(text)}catch{return text}}));}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const root='rudn-platform/v1',key='9909131001',alias='9909131002';
  await db('.settings/rules','PUT',JSON.parse(fs.readFileSync('firebase/database.rules.json','utf8')));
  await db(`${root}/profiles/${key}`,'PUT',{studentKey:key,ticket:key,email:key+'@rudn.ru',fullName:'Синтетический Проверочный Студент',group:'ГГУбд-01-26',createdAt:'2026-09-13T09:00:00Z',ownerUid:'qa-prior-owner',ownerUids:{'qa-prior-owner':true}});
  await db(`${root}/studentAliases/${alias}`,'PUT',key);
  const browser=await chromium.launch({headless:true});const errors=[];
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',locale:'ru-RU'});
  await context.route('**/assets/js/config.js*',route=>route.fulfill({contentType:'application/javascript',body:config}));
  await context.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app|firebaseapp\.com)\//,route=>{errors.push('Production request blocked: '+new URL(route.request().url()).hostname);return route.abort()});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(base+'#dashboard');
    await page.evaluate(async()=>{await (await import('/assets/js/backend.js?v=1.3.3')).backend.init()});
    await page.locator('#app[aria-busy="false"]').waitFor();
    await page.locator('#profileButton').click();await page.locator('#authIdentifier').waitFor();
    await page.evaluate(async()=>{
      const {backend}=await import('/assets/js/backend.js?v=1.3.3');const original=backend.lookupStudent.bind(backend);
      window.qaLookups=[];window.qaDelay=0;window.qaReject=false;
      backend.lookupStudent=async value=>{window.qaLookups.push(value);const delay=window.qaDelay,reject=window.qaReject;await new Promise(r=>setTimeout(r,delay));if(reject)throw {code:'network/offline'};return original(value)};
    });
    const input=page.locator('#authIdentifier');
    await input.pressSequentially('9909',{delay:800});await wait(800);
    assert.deepEqual(await page.evaluate(()=>window.qaLookups),[],'Incomplete number requested');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'authIdentifier');
    assert.equal(await page.locator('#authError').isVisible(),false);
    await input.fill(key);await page.locator('#authStudentDetails').waitFor();
    assert.equal(await page.locator('#authFullName').inputValue(),'Синтетический Проверочный Студент');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'authIdentifier');
    await page.screenshot({path:path.join(out,'login-known-390.png')});
    await input.fill(alias);await page.locator('#authStudentDetails').waitFor();
    assert.equal(await page.locator('#authFullName').inputValue(),'Синтетический Проверочный Студент');
    await input.fill('9909131999');await wait(1400);
    assert.equal(await page.locator('#authStudentDetails').isVisible(),false,'Unknown fields opened while typing');
    await input.press('Enter');await page.locator('#authStudentDetails').waitFor();assert.equal(await page.locator('#authFullName').inputValue(),'');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'authIdentifier');
    await page.evaluate(()=>{window.qaDelay=1800;window.qaLookups=[]});
    await input.fill(key);await wait(850);await input.press('Enter');await wait(80);
    assert.equal(await page.evaluate(()=>window.qaLookups.length),1,'Lookup not single-flight');
    await input.fill('1');await wait(1900);
    assert.equal(await page.locator('#authStudentDetails').isVisible(),false,'Old response applied');
    assert.equal(await input.inputValue(),'1');
    await page.evaluate(()=>{window.qaDelay=0;window.qaReject=true});
    await input.fill(key);await wait(1000);
    assert.equal(await page.locator('#authError').isVisible(),false,'Background failure is visible');
    assert.equal(await page.locator('.rudn-notice').count(),0,'Background failure produced notice');
    await input.press('Enter');await page.locator('#authError').waitFor();
    assert.equal(await page.locator('#authStudentDetails').isVisible(),false,'Network failure became new profile');
    await page.screenshot({path:path.join(out,'login-offline-inline-390.png')});
    await input.fill('omnistat@yandex.ru');await page.locator('#authPassword').waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'authIdentifier');
    assert.equal(await page.locator('#authError').isVisible(),false);
    for(const viewport of [{width:412,height:915},{width:1440,height:1000}]){
      await page.setViewportSize(viewport);await page.screenshot({path:path.join(out,`login-teacher-${viewport.width}.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    }
    assert.deepEqual(errors,[]);console.log('PASS: quiet typing, aliases, unknown Enter, no focus theft, single-flight, stale success/error, offline inline and responsive login.');
  }catch(e){await page.screenshot({path:path.join(out,'failure.png')});throw e}
  finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
