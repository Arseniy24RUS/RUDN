// Focused synthetic regression of the actual main.js startQuiz function with
// real adaptive quiz/board/helpers/IDB. Isolated backend; no production access.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=resolve(root,'site'),args=process.argv.slice(2),arg=(k,f)=>args.includes(k)?args[args.indexOf(k)+1]:f,engine=arg('--browser','chromium'),output=resolve(arg('--output','../evidence/runs/20261018-platform-observability/adapters/lifecycle-'+engine));
const main=await readFile(resolve(site,'assets/js/main.js'),'utf8'),start=main.slice(main.indexOf('async function startQuiz('),main.indexOf('\nfunction renderSeminar3('));
assert.ok(start.includes('modeTail'));
const backend=`import {durableStore} from '/assets/js/durable-store.js';
window.qa={subscriptions:0,writes:0,pauseNext:false,pending:false};
const sub=cb=>{qa.subscriptions++;cb?.({});let active=true;return()=>{if(active){active=false;qa.subscriptions--}}};
export const groupOptions=()=>['SYNTHETIC'];
export const backend={user:{uid:'synthetic-teacher'},generation:1,authReady:true,mode:'cloud',isAdmin:()=>true,getProfile:()=>null,init:async()=>{},onStatus:()=>sub(),globalNow:()=>Date.now(),getAccessOverrides:()=>({}),automaticRoomKey:()=> 'synthetic-room',subscribeAutomaticPresence:(_room,cb)=>sub(cb),subscribeAutomaticResponses:(_room,cb)=>sub(cb),joinAutomaticQuizRoom:async()=>({leave:()=>{}}),localAttempts:()=>[],loadDraft:async scope=>{if(qa.pauseNext){qa.pauseNext=false;qa.pending=true;await new Promise(resolve=>qa.release=()=>{qa.pending=false;resolve()})}return durableStore.loadDraft(scope)},checkpoint:input=>{qa.writes++;return durableStore.checkpoint(input,{queue:false})}};`;
const html=`<!doctype html><html lang="ru"><main id="app"></main><script type="module">
import {backend} from '/assets/js/backend.js';
import {attemptOwner,prepareQuizDraft} from '/assets/js/attempt-session.js';
import {mountAdaptiveSeminar1,mountAutomaticBoard} from '/assets/js/adaptive-quiz.js';
import {bindQuizUpdate,exposeModuleUpdateAdapter} from '/assets/js/platform-learning-updates.js';
import {buildQuiz,renderQuiz} from '/assets/js/quiz.js';
const app=document.querySelector('#app'),scope={error:()=>{},record:()=>{}},routeDiagnostics=scope;
let currentCleanup=null,quizStartGeneration=0;
const quizAccessGate=()=>null,accessAllowed=()=>true,requireProfile=()=>true,ui=k=>k,esc=s=>String(s),toast=()=>{},moduleReady=()=>{},render=()=>{},getLocale=()=> 'ru';
const data={questions:[{id:'synthetic-one',category:'Семинар 1. Ветви и уровни власти',type:'matrix_single',institution:'Synthetic body',classification_correct:'federal|legislative'}]};window.RUDN_DATA=data;
${start}
window.startQuiz=startQuiz;window.leave=async()=>{location.hash='dashboard';await currentCleanup?.()};window.cleanup=()=>currentCleanup?.();window.handle=()=>currentCleanup;
await startQuiz('seminar-1-classroom');window.ready=true;
</script></html>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local');if(url.pathname==='/__lifecycle'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);return}if(url.pathname==='/assets/js/backend.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(backend);return}const path=resolve(site,'.'+url.pathname);if(!path.startsWith(site+sep)||(await stat(path)).isDirectory())throw Error('missing');res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path))}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href:'playwright');const report={engine,status:'fail',kind:'actual startQuiz function + real quiz/board/IDB; isolated synthetic backend',checks:[],errors:[]};let browser,page;
try{browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/__lifecycle#activity/seminar-1-classroom');await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>qa.subscriptions),3);
await page.evaluate(()=>qa.pauseNext=true);await page.locator('[data-admin-quiz-mode="play"]').click();await page.waitForFunction(()=>qa.pending);await page.locator('[data-admin-quiz-mode="board"]').click();await page.evaluate(()=>qa.release());await page.locator('#autoBoardParticipants').waitFor();assert.equal(await page.evaluate(()=>qa.subscriptions),3);assert.equal(await page.locator('[data-admin-quiz-mode="board"]').getAttribute('aria-pressed'),'true');report.checks.push('delayed Play -> Board leaves exactly one board and three subscriptions');
await page.evaluate(()=>startQuiz('seminar-1-classroom',{resumeMode:'play'}));await page.locator('.quiz-shell').waitFor();assert.equal(await page.evaluate(()=>qa.subscriptions),3);report.checks.push('restore inner Play drains previous board before replacing it');
await page.evaluate(()=>startQuiz('seminar-1-classroom'));await page.evaluate(()=>qa.pauseNext=true);await page.locator('[data-admin-quiz-mode="play"]').click();await page.waitForFunction(()=>qa.pending);await page.evaluate(()=>{window.leaving=leave();qa.release()});await page.evaluate(()=>leaving);assert.equal(await page.evaluate(()=>qa.subscriptions),0);report.checks.push('route exit waits for delayed mount and releases every subscription');
assert.deepEqual(report.errors,[]);report.status='pass';await mkdir(output,{recursive:true});await page.screenshot({path:resolve(output,'final.png')});
}catch(error){report.failure={message:error.message,stack:error.stack};process.exitCode=1;await mkdir(output,{recursive:true});await page?.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});}
finally{await browser?.close();await new Promise(r=>{server.close(r);server.closeAllConnections()});await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
