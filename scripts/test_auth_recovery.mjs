// Authentication UI contracts with isolated fixtures. Never contacts Firebase or sends email.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {CONFIG} from '../site/assets/js/config.js';

// Execute the actual shipped method with a fake Firebase boundary, without
// constructing Backend (which starts persistence and connection listeners).
const source=await readFile(new URL('../site/assets/js/backend.js',import.meta.url),'utf8');
const start=source.indexOf('  async adminResetPassword('),end=source.indexOf('  async adminSignOut(',start);
assert(start>=0&&end>start,'The reset method must remain covered by the contract');
const reset=vm.runInNewContext('({'+source.slice(start,end)+'}).adminResetPassword',{
  CONFIG,serviceError:code=>Object.assign(new Error(code),{code}),
});
const resetCalls=[];
let initializations=0;
const fake={init:async()=>{initializations++;},authClient:{},auth:{sendPasswordResetEmail:async(...args)=>{resetCalls.push(args);}}};
for(const [locale,expected] of [['ru','ru'],['en','en'],['zh','zh-CN'],['unsupported','ru']]){
  await reset.call(fake,'  '+CONFIG.adminEmails[0].toUpperCase()+'  ',{locale});
  const args=resetCalls.at(-1);
  assert.equal(args.length,2,'Password recovery sends only the auth client and email, never a password');
  assert.equal(args[0],fake.authClient);assert.equal(args[1],CONFIG.adminEmails[0].toLowerCase());
  assert.equal(fake.authClient.languageCode,expected);
}
const beforeInvalid=initializations;
for(const identifier of ['','1234567890','qa-student@rudn.ru','unknown@example.invalid']){
  await assert.rejects(reset.call(fake,identifier),{code:'auth/admin-required'});
}
assert.equal(initializations,beforeInvalid,'Unrecognized accounts must not initialize Firebase or request email');
assert.equal(resetCalls.length,4);
await assert.rejects(reset.call({...fake,authClient:null},CONFIG.adminEmails[0]),{code:'network/unavailable'});
const networkError=Object.assign(new Error('offline fixture'),{code:'auth/network-request-failed'});
await assert.rejects(reset.call({...fake,auth:{sendPasswordResetEmail:async()=>{throw networkError;}}},CONFIG.adminEmails[0]),error=>error===networkError);
console.log('PASS reset backend: normalized allowlisted email, explicit SDK call without password, localized email, unavailable/network errors');
if(process.argv.includes('--unit'))process.exit(0);

const root=path.resolve(fileURLToPath(new URL('../site/',import.meta.url)));
const cases=['slow-invalid','network','reset-success','reset-retry','reset-stale','login-stale'];
const backendSource=`
const scenario=localStorage.getItem('qa.authScenario')||'slow-invalid';
const records=[];window.__authRequests=records;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fail=code=>Object.assign(new Error(code),{code});
let signIns=0,resets=0;
export const groupOptions=()=>['ГГУбд-01-26'];
export const backend={authReady:true,user:null,mode:'local',connected:false,
getProfile:()=>null,isAdmin:()=>false,init:async()=>{},onStatus:()=>()=>{},status:()=>({}),
globalNow:()=>Date.parse('2026-09-26T12:00:00Z'),getAccessOverrides:()=>({}),
localGrades:()=>({}),getGrades:async()=>({}),localAttempts:()=>[],getAttempts:async()=>[],
lookupStudent:async()=>({source:'missing',fullName:'',group:''}),
adminSignIn:async(email,password)=>{
  const number=++signIns;records.push({method:'signIn',email,hasPassword:!!password});
  await pause(scenario==='slow-invalid'&&number===1?4700:scenario==='login-stale'?1400:450);
  throw fail(scenario==='network'?'auth/network-request-failed':'auth/invalid-credential');
},
adminResetPassword:async(...args)=>{
  const number=++resets;records.push({method:'reset',args});
  await pause(scenario==='reset-stale'?1400:450);
  if(scenario==='reset-retry'&&number===1)throw fail('auth/network-request-failed');
},
saveProfile:()=>{throw Error('Auth recovery test must not create a profile');},
saveAttempt:()=>{throw Error('Auth recovery test must not submit results');}};`;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
  res.setHeader('Cache-Control','no-store');
  if(pathname==='/assets/js/backend.js'){res.setHeader('Content-Type','text/javascript');res.end(backendSource);return;}
  if(pathname==='/__qa'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<h1>Isolated authentication fixtures</h1><p>No external authentication or email requests. Open a scenario, click Sign in, enter the configured teacher email and any fake password.</p>'+cases.map(value=>'<p>'+['ru','en','zh'].map(locale=>'<a href="/__qa/auth/'+value+'?prefill=1&locale='+locale+'">'+value+' ('+locale+')</a>').join(' · ')+'</p>').join(''));return;
  }
  const scenario=pathname.match(/^\/__qa\/auth\/([a-z-]+)$/)?.[1];
  if(scenario&&cases.includes(scenario)){
    const locale=['ru','en','zh'].includes(url.searchParams.get('locale'))?url.searchParams.get('locale'):'ru';
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<script>localStorage.clear();localStorage.setItem("qa.authScenario",'+JSON.stringify(scenario)+');localStorage.setItem("rudn.locale",'+JSON.stringify(locale)+');localStorage.setItem("qa.authPrefill",'+JSON.stringify(url.searchParams.get("prefill")==="1")+');location.replace("/#activity/seminar-2");</script>');return;
  }
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  let body=await readFile(file);
  if(pathname==='/')body=body.toString().replace('</body>',`<script>
    if(localStorage.getItem('qa.authPrefill')==='true'){
      const prepare=setInterval(()=>{
        const trigger=document.getElementById('puzzleSignIn');if(!trigger)return;
        clearInterval(prepare);trigger.click();
        const identifier=document.getElementById('authIdentifier');
        identifier.value=${JSON.stringify(CONFIG.adminEmails[0])};identifier.dispatchEvent(new Event('input',{bubbles:true}));
        const passwordReady=setInterval(()=>{if(document.getElementById('authForm').dataset.stage!=='admin')return;clearInterval(passwordReady);document.getElementById('authPassword').value='fixture-only-never-real-password';},50);
      },50);
    }
    </script></body>`);
  res.end(body);
}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(resolve=>server.listen(Number(process.env.PORT)||0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
if(process.argv.includes('--serve')){console.log(base+'/__qa');await new Promise(()=>{});}
const pw=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await pw.chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[];
await context.route('**/*',request=>{
  if(new URL(request.request().url()).origin===base)return request.continue();
  external.push(request.request().url());return request.abort();
});
page.on('pageerror',error=>errors.push(error.message));
const strings={
  ru:{reset:'Отправить письмо для смены пароля',sent:'Запрос принят.',slow:'Подключение занимает больше времени.',hint:'Введите пароль преподавателя.'},
  en:{reset:'Send password reset email',sent:'Request accepted.',slow:'Still connecting.',hint:'Enter your teacher account password.'},
  zh:{reset:'发送密码重置邮件',sent:'请求已受理。',slow:'正在连接',hint:'请输入教师账号密码。'},
};
const status=page.locator('#rosterStatus'),error=page.locator('#authError'),submit=page.locator('#authSubmit'),resetButton=page.locator('#authResetPassword');
const requests=()=>page.evaluate(()=>window.__authRequests);
const waitEnabled=()=>page.waitForFunction(()=>!document.getElementById('authSubmit').disabled&&!document.getElementById('authResetPassword').disabled);
async function enterTeacher(){
  await page.locator('#authIdentifier').fill('  '+CONFIG.adminEmails[0].toUpperCase()+'  ');
  await page.locator('#authForm[data-stage="admin"]').waitFor();
}
async function open(scenario,locale='ru'){
  await page.goto(base+'/__qa/auth/'+scenario+'?locale='+locale);
  await page.locator('#puzzleSignIn').click();await page.locator('#authDialog[open]').waitFor();
  assert.equal(await resetButton.isVisible(),false,'Student identifier stage offers no teacher password recovery');
  await enterTeacher();await page.locator('#authPassword').fill('fixture-only-never-real-password');
  assert.equal(await resetButton.textContent(),strings[locale].reset);
  assert.equal((await requests()).length,0,'Opening a dialog or entering an identifier must not send email');
}
try{
  await open('slow-invalid');await submit.click();
  await page.waitForFunction(()=>document.getElementById('rosterStatus').textContent.includes('Подключение занимает больше времени.'),{},{timeout:6000});
  await error.waitFor({state:'visible'});await waitEnabled();
  const invalidText=await error.textContent();assert(invalidText.length>10);
  assert.equal(await status.textContent(),strings.ru.hint,'Settled sign-in cannot retain a slow-connection message');
  await submit.click();assert.equal(await error.isVisible(),false,'Retry immediately clears an old credential error');
  assert.equal(await submit.isDisabled(),true);
  await error.waitFor({state:'visible'});await waitEnabled();
  assert.equal(await status.textContent(),strings.ru.hint);
  assert.equal((await requests()).filter(item=>item.method==='reset').length,0,'Failed login must not automatically send a reset email');

  await open('network');await submit.click();await error.waitFor({state:'visible'});await waitEnabled();
  assert.notEqual(await error.textContent(),invalidText,'Network failure must be distinguishable from a credential failure');
  assert.equal(await status.textContent(),strings.ru.hint);

  for(const locale of ['ru','en','zh']){
    await page.setViewportSize(locale==='zh'?{width:390,height:844}:{width:1280,height:900});
    await open('reset-success',locale);await resetButton.click();
    assert.equal(await resetButton.isDisabled(),true,'Prevent duplicate recovery requests');
    await page.waitForFunction(prefix=>document.getElementById('rosterStatus').textContent.startsWith(prefix),strings[locale].sent);
    await waitEnabled();assert.equal(await error.isVisible(),false);
    const resetRequests=(await requests()).filter(item=>item.method==='reset');
    assert.equal(resetRequests.length,1);
    assert.equal(resetRequests[0].args.length,2);
    assert.equal(resetRequests[0].args[0].trim().toLowerCase(),CONFIG.adminEmails[0]);
    assert.deepEqual(resetRequests[0].args[1],{locale});
    assert(!JSON.stringify(resetRequests).includes('fixture-only-never-real-password'));
    assert(await resetButton.isVisible());
    assert(await page.locator('#authPassword').isVisible());
    const bounds=await resetButton.boundingBox();
    assert(bounds.x>=0&&bounds.x+bounds.width<=page.viewportSize().width+1,'Recovery control fits mobile viewport');
    if(process.env.QA_OUT){await mkdir(process.env.QA_OUT,{recursive:true});await page.screenshot({path:path.join(process.env.QA_OUT,'auth-reset-'+locale+'.png')});}
    // Successful email request is not authentication; the login remains usable.
    await submit.click();await error.waitFor({state:'visible'});await waitEnabled();
    assert.equal((await requests()).filter(item=>item.method==='signIn').length,1);
  }

  await open('reset-retry');await resetButton.click();await error.waitFor({state:'visible'});await waitEnabled();
  await resetButton.click();assert.equal(await error.isVisible(),false);
  await page.waitForFunction(()=>document.getElementById('rosterStatus').textContent.startsWith('Запрос принят.'));await waitEnabled();
  assert.equal((await requests()).filter(item=>item.method==='reset').length,2,'Recovery failure can be retried explicitly');

  // Responses from an old identifier or a closed dialog must not modify a new session.
  for(const action of ['change-identifier','close-reopen']){
    for(const scenario of ['reset-stale','login-stale']){
      await open(scenario);
      await (scenario==='reset-stale'?resetButton:submit).click();
      if(action==='change-identifier'){
        await page.locator('#authIdentifier').fill('not-a-complete-student-id');
      }else{
        await page.locator('#authDialog .modal-close').click();await page.locator('#puzzleSignIn').click();
      }
      const currentText=await status.textContent();
      await page.waitForFunction(()=>!document.getElementById('authSubmit').disabled);
      // Cross the pending request's settlement, then verify it did not mutate this session.
      await page.waitForTimeout(1600);
      assert.equal(await status.textContent(),currentText,scenario+' stale response overwrote '+action);
      assert.equal(await error.isVisible(),false);
      assert.equal(await page.locator('#authForm').getAttribute('data-stage'),'identifier');
      assert.equal(await resetButton.isVisible(),false);
      assert.equal(await page.locator('#authDialog').getAttribute('open'),'');
      assert(await submit.isEnabled());
    }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS Chromium auth: delayed invalid credentials, retry/error cleanup, network error, explicit reset, retry, stale response guards, RU/EN/ZH and mobile; no external requests');
}finally{await context.close();await browser.close();server.close();}
