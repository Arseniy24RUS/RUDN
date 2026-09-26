// Focused access checks only: no gameplay, grades, Firebase, or external requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {GAMES,gameAccessGate} from '../site/assets/js/games-catalog.js';

let role='student',now=Date.parse('2026-09-19T12:00:00Z'),overrides={};
const model={isAdmin:()=>role==='teacher',getProfile:()=>role==='student'?{}:null,globalNow:()=>now,getAccessOverrides:()=>overrides};
const available=()=>GAMES.filter(game=>gameAccessGate(game.id,model)?.open!==false).map(game=>game.id);
assert.deepEqual(available(),['maps']);
overrides={'topic-2':'closed','topic-5':'open'};assert.deepEqual(available(),['reception']);
overrides={};now=Date.parse('2026-11-24T12:00:00Z');assert.equal(available().length,4);
for(role of ['guest','teacher']){overrides={'topic-2':'closed','topic-5':'closed','topic-6':'closed','topic-7':'closed'};assert.equal(available().length,4);}
console.log('PASS course schedule, instructor overrides, guest and teacher access');
if(process.argv.includes('--unit'))process.exit(0);

const root=path.resolve(fileURLToPath(new URL('../site/',import.meta.url)));
const backendSource=`import {durableStore as store} from '/assets/js/durable-store.js';
const read=(key,fallback)=>JSON.parse(localStorage.getItem('qa.'+key)||JSON.stringify(fallback));
export const groupOptions=()=>[];
export const backend={authReady:!read('restoring',false),user:{uid:'isolated-access-test',displayName:'QA teacher'},mode:'local',connected:false,
getProfile:()=>backend.authReady&&read('role','guest')==='student'?{studentKey:'isolated-access-test',fullName:'QA student',group:'QA'}:null,
isAdmin:()=>backend.authReady&&read('role','guest')==='teacher',
init:()=>backend.authReady?Promise.resolve():new Promise(resolve=>window.addEventListener('qa:auth-ready',()=>{backend.authReady=true;resolve();},{once:true})),
onStatus:()=>()=>{},status:()=>({}),globalNow:()=>Date.parse(read('now','2026-09-19T12:00:00Z')),
getAccessOverrides:()=>read('access',{}),localGrades:()=>({}),getGrades:async()=>({}),localAttempts:()=>[],getAttempts:async()=>[],
getCachedPuzzleLeaderboard:()=>[],getPuzzleLeaderboard:async()=>[],
loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,{...o,queue:false}),saveAttempt:()=>{throw Error('Access test must not submit results');}};`;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/assets/js/backend.js'){res.setHeader('Content-Type','text/javascript');res.end(backendSource);return;}
  // Explicit localhost-only fixtures for the Browser plugin's visible checks.
  if(/^\/__qa\/(student|guest|teacher)$/.test(pathname)){
    res.setHeader('Content-Type','text/html');res.end(`<script>localStorage.setItem('qa.role',${JSON.stringify(JSON.stringify(pathname.split('/').pop()))});localStorage.removeItem('qa.access');location.replace('/#games');</script>`);return;
  }
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(resolve=>server.listen(Number(process.env.PORT)||0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
if(process.argv.includes('--serve')){console.log(base);await new Promise(()=>{});}
const pw=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await pw.chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[];
await context.route('**/*',request=>{
  if(new URL(request.request().url()).origin===base)return request.continue();
  external.push(request.request().url());return request.abort();
});
page.on('pageerror',error=>errors.push(error.message));
const ready=()=>page.locator('#app[aria-busy="false"]').waitFor();
const go=async hash=>{await page.evaluate(hash=>{location.hash=hash;},hash);await ready();};
const access=async value=>{await page.evaluate(value=>{localStorage.setItem('qa.access',JSON.stringify(value));window.dispatchEvent(new Event('rudn:accesschange'));},value);await ready();};
const cards=()=>page.locator('[data-game]').evaluateAll(nodes=>nodes.map(node=>node.dataset.game));
try{
  await page.goto(base+'/__qa/student');await page.locator('[data-game=maps]').waitFor();
  assert.deepEqual(await cards(),['maps']);
  for(const locale of ['en','zh','ru']){await page.locator('[data-lang="'+locale+'"]').first().click();await ready();assert.deepEqual(await cards(),['maps']);}
  await page.locator('[data-game=maps] a').click();await page.locator('#geoPuzzleApp').waitFor();
  await access({'topic-2':'closed'});await page.locator('.access-lock-panel').waitFor();
  await page.locator('.access-lock-panel a').click();await ready();assert.deepEqual(await cards(),[]);
  await access({});assert.deepEqual(await cards(),['maps']);
  for(const module of ['career','reception']){
    await go('games/'+module);await page.locator('.access-lock-panel').waitFor();
    assert.equal(await page.locator('#careerMount,#receptionMount').count(),0);
  }
  await go('puzzle');await page.locator('#geoPuzzleApp').waitFor();
  await go('games');await page.locator('[data-game=maps]').waitFor();
  await access({'topic-5':'open'});assert.deepEqual(await cards(),['maps','reception']);
  await page.locator('[data-game=reception] a').click();await page.locator('#receptionMount').waitFor();
  await access({'topic-5':'closed'});await page.locator('.access-lock-panel').waitFor();
  await page.goto(base+'/apps/governor/index.html?context=free');
  await page.waitForFunction(()=>document.querySelector('#platform-loading-text')?.textContent.includes('Раздел 7 откроется'));
  assert.equal(await page.locator('#app').isVisible(),false);
  await page.evaluate(()=>{localStorage.setItem('qa.access',JSON.stringify({'topic-7':'open'}));window.dispatchEvent(new Event('rudn:accesschange'));});
  await page.locator('#app').waitFor({state:'visible'});
  await page.evaluate(()=>{localStorage.setItem('qa.access',JSON.stringify({'topic-7':'closed'}));window.dispatchEvent(new Event('rudn:accesschange'));});
  await page.locator('#app').waitFor({state:'hidden'});
  for(const role of ['guest','teacher']){
    await page.goto(base+'/__qa/'+role);await page.locator('[data-game=career]').waitFor();assert.equal((await cards()).length,4);
  }
  // A guest's graded route must explain the missing profile instead of
  // showing the static "Preparing the map" canvas with no actual download.
  await page.goto(base+'/__qa/guest');await page.locator('[data-game=maps]').waitFor();
  await go('activity/seminar-2');await page.locator('[data-puzzle-sign-in]').waitFor();
  for(const locale of ['en','zh','ru']){
    await page.locator('[data-lang="'+locale+'"]').first().click();await ready();
    await page.locator('[data-puzzle-sign-in]').waitFor();
    assert.equal(await page.locator('#geoPuzzleApp,#puzzleEmpty').count(),0,'No false loading state before sign-in');
    assert(await page.locator('#puzzleSignIn').isEnabled());
  }
  await page.locator('#puzzleSignIn').click();await page.locator('#authDialog[open]').waitFor();
  await page.locator('#authDialog .modal-close').click();
  await page.locator('[data-puzzle-sign-in] a').click();
  await page.locator('#geoPuzzleApp[data-play-allowed="true"]').waitFor();
  await go('activity/seminar-2');await page.locator('[data-puzzle-sign-in]').waitFor();
  await page.evaluate(()=>{localStorage.setItem('qa.role','"student"');window.dispatchEvent(new Event('rudn:identitychange'));});
  await page.locator('#geoPuzzleApp[data-play-allowed="true"]').waitFor();
  assert.equal(await page.locator('[data-puzzle-sign-in]').count(),0,'Signing in resumes the same graded route');
  await page.goto(base+'/__qa/teacher');await page.locator('[data-game=maps]').waitFor();
  await go('activity/seminar-2');await page.locator('#geoPuzzleApp[data-play-allowed="true"]').waitFor();
  console.log('PASS graded map sign-in RU/EN/ZH, sign-in action, guest free play, student continuation and teacher preview');
  // A guest route must be revoked immediately when a student profile takes over.
  await page.goto(base+'/__qa/guest');await page.locator('[data-game=career]').waitFor();
  await page.locator('[data-game=career] a').click();await page.locator('#careerMount').waitFor();
  await page.evaluate(()=>{localStorage.setItem('qa.role','"student"');window.dispatchEvent(new Event('rudn:identitychange'));});
  await page.locator('.access-lock-panel').waitFor();
  await go('games');await page.locator('[data-game=maps]').waitFor();
  await page.evaluate(()=>{localStorage.setItem('qa.now','"2026-11-24T12:00:00Z"');localStorage.removeItem('qa.access');window.dispatchEvent(new Event('rudn:accesschange'));});
  await ready();assert.equal((await cards()).length,4);
  await page.evaluate(()=>{localStorage.removeItem('qa.now');localStorage.setItem('qa.restoring','true');});
  await page.reload();await page.locator('#app [role=status]').waitFor();assert.equal(await page.locator('[data-game]').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new Event('qa:auth-ready')));await page.locator('[data-game=maps]').waitFor();assert.deepEqual(await cards(),['maps']);
  if(process.env.QA_OUT){await mkdir(process.env.QA_OUT,{recursive:true});await page.screenshot({path:path.join(process.env.QA_OUT,'student-games.png')});}
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS Chromium: student catalog RU/EN/ZH, direct routes, open/close, profile switch, future schedule, auth restoration; no grades or external requests');
}finally{await context.close();await browser.close();server.close();}
