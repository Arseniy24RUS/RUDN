// Actual immutable release/main/SW smoke with a synthetic auth/cloud boundary.
// No staged bytes or hashes are changed. addInitScript installs the local test
// identity on the exact backend singleton before main imports it.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const base=resolve(repo,'../evidence/runs/20261018-platform-observability/release');
const stageA=resolve(arg('--a',resolve(base,'preliminary-staging-v6'))),stageB=resolve(arg('--b',resolve(base,'second-release-staging'))),engine=arg('--browser','chromium'),out=resolve(arg('--output',resolve(base,'main-staging-'+engine)));
const pointerA=JSON.parse(await readFile(resolve(stageA,'release.json'),'utf8')),pointerB=JSON.parse(await readFile(resolve(stageB,'release.json'),'utf8'));let current='A';const requests=[];await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.geojson':'application/json','.topojson':'application/json','.pdf':'application/pdf','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://local');try{if(url.pathname==='/__switch'){current='B';res.end('B');return}if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return}if(!url.pathname.startsWith('/RUDN/'))throw Error('outside');let logical=decodeURIComponent(url.pathname.slice('/RUDN/'.length))||'index.html';const root=['index.html','release.json'].includes(logical)?current==='A'?stageA:stageB:stageB;const file=resolve(root,logical);if(!file.startsWith(root+sep)||(await stat(file)).isDirectory())throw Error('missing');const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);requests.push({path:url.pathname,status:200,bytes:data.byteLength})}catch{requests.push({path:url.pathname,status:404});res.writeHead(404);res.end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');let browser,page;
const report={kind:'actual immutable main+bootstrap+SW; synthetic in-memory auth/cloud boundary',engine,status:'fail',buildA:pointerA.current,buildB:pointerB.current,checks:[],errors:[],blockedExternal:[],notCovered:['production authentication/Firebase writes','physical phones'],stageDirectories:{a:stageA,b:stageB},serviceWorkers:arg('--service-workers','allow')};
async function context(){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:arg('--service-workers','allow')});
 await context.addInitScript(({buildA})=>{
  if(location.origin==='null'||!location.pathname.startsWith('/RUDN/'))return;
  const build=location.pathname.match(/\/_releases\/([a-f0-9]{32})\//)?.[1]||buildA;
  window.__qaBoundary=(async()=>{
   const runtime='/RUDN/_releases/'+build+'/';
   const {backend}=await import(runtime+'assets/js/backend.js?v=1.3.10');
   const {durableStore}=await import(runtime+'assets/js/durable-store.js');
   const profile={studentKey:'123456789',fullName:'Synthetic staging QA',ticket:'123456789',group:'ГГУбд-01-26',ownerUid:'synthetic-local-only'};
   backend.profile=profile;backend.user={uid:'synthetic-local-only',isAnonymous:true};backend.authReady=true;backend.connected=false;
   backend.init=async()=>{backend.emitStatus();return backend.status()};
   backend.ensureStudentCloud=async()=>{};backend.syncLocalToCloud=async()=>{};backend.ensureDiagnosticIdentity=async()=>backend.user;
   // Cloud transport is synthetic; local IndexedDB flush/checkpoint stays real.
   backend.durableSync=()=>({restore:async()=>null,flush:async()=>({status:'synthetic-offline'})});backend.getPuzzleLeaderboard=async()=>[];
   backend.getAccessOverrides=()=>Object.fromEntries(Array.from({length:8},(_,i)=>[['topic-'+(i+1),'open'],['lecture-'+(i+1)+'-test','open']]).flat());
   backend.diagnosticsRequest=async(action,payload)=>{window.__qaDiagnostics??=[];window.__qaDiagnostics.push({action,payload});return action==='openSession'?{ok:true,sessionId:payload.clientSessionId,subjectKey:'synthetic',generation:1,reportCode:'SYNTHETIC-STAGING'}:{ok:true}};
   window.__qaBackend=backend;window.__qaStore=durableStore;window.__qaBoundaryReady=true;
  })().catch(error=>{window.__qaBoundaryError=error.message;throw error});
 },{buildA:pointerA.current.buildId});
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin){report.blockedExternal.push({host:url.host,path:url.pathname,type:route.request().resourceType()});await route.abort();return}if(/\/assets\/js\/main\.js$/.test(url.pathname)&&route.request().resourceType()==='script'){await route.request().frame().evaluate(()=>window.__qaBoundary)}await route.continue()});
 return context;
}
async function ready(){await page.waitForFunction(()=>window.__qaBoundaryReady&&!document.querySelector('#app[aria-busy="true"]')&&window.__RUDN_RELEASE__?.buildId);assert.equal(await page.evaluate(()=>window.__qaBoundaryError||null),null)}
async function route(hash,selector){await page.evaluate(value=>location.hash=value,hash);await page.locator(selector).waitFor();await ready()}
try{
 browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});report.version=browser.version();
 for(const kind of (arg('--kind','')?[arg('--kind','')]:['quiz','form','modules'])){
  current='A';const ctx=await context();page=await ctx.newPage();page.setDefaultTimeout(60000);page.on('pageerror',error=>report.errors.push({kind,message:error.message}));
  await page.goto(origin+'/RUDN/#dashboard');await ready();await page.waitForFunction(()=>document.querySelector('#app')?.innerText.length>300);
  if(kind==='modules'){
   const routes=[['activity/seminar-1-classroom','#quizMount .quiz-shell'],['activity/seminar-4','#legalLabMount[aria-busy="false"]'],['games/career','#careerMount[aria-busy="false"]'],['games/reception','#receptionMount[aria-busy="false"]'],['games/settlements','#settlementsMount[aria-busy="false"]'],['puzzle','#geoPuzzleApp[data-play-allowed="true"]'],['activity/seminar-7','a[href*="governor"]'],['games','.games-grid'],['profile','#app'],['materials','.material-grid >> nth=0']];
   for(const [hash,selector]of routes){await route(hash,selector);if(hash==='games'){const href=await page.locator('[data-game="governor"] a').getAttribute('href');const build=await page.evaluate(()=>__RUDN_RELEASE__.buildId);assert.equal(href,origin+'/RUDN/_releases/'+build+'/apps/governor/index.html?context=free');report.checks.push({kind:'governor-runtime-link',route:hash,status:'pass',href})}await page.screenshot({path:resolve(out,hash.replaceAll('/','-')+'.png')});report.checks.push({kind:'module-route',route:hash,status:'pass'})}
   await page.locator('[data-lang="en"]').click();await page.waitForFunction(()=>document.documentElement.lang==='en');await route('dashboard','#app');await page.locator('[data-lang="zh"]').click();await page.waitForFunction(()=>document.documentElement.lang==='zh-Hans');report.checks.push({kind:'profile-materials-language',status:'pass'});await ctx.close();continue;
  }
  let scope;
  if(kind==='quiz'){
   await route('activity/lecture-1','#launchLectureTest');await page.locator('#launchLectureTest').click();await page.locator('#quizMount .quiz-shell').waitFor();await page.locator('.answer-option').first().click();await page.locator('#quizNext').click();scope={owner:'student:123456789',activitySlug:'lecture-1',mode:'default'};
  }else{
   await route('activity/lecture-8','#reflectionForm[data-attempt-id]');await page.locator('#reflectionForm [name=result]').fill('Synthetic staging result');await page.locator('#reflectionForm [name=reflection]').fill('Synthetic reflection '.repeat(9));await page.locator('#reflectionForm [name=reflection]').pressSequentially('Z');scope={owner:'student:123456789',activitySlug:'lecture-8',mode:'form'};
  }
  const before=await page.evaluate(async scope=>{await __qaStore.flush();return {draft:await __qaStore.loadDraft(scope),hash:location.hash,focus:document.activeElement?.name}},scope);assert.ok(before.draft?.attemptId);
  await fetch(origin+'/__switch');await page.evaluate(()=>window.dispatchEvent(new Event('rudn:update-state-changed')));
  await page.waitForFunction(build=>window.__RUDN_RELEASE__?.buildId===build&&window.__qaBoundaryReady&&!sessionStorage.getItem('rudn.update.pending.v1'),pointerB.current.buildId,{timeout:120000});await ready();
  const after=await page.evaluate(async scope=>({draft:await __qaStore.loadDraft(scope),hash:location.hash,pending:await __qaStore.listPending({owner:scope.owner,limit:50,includeDeferred:true})}),scope);
  assert.equal(after.hash,before.hash);assert.equal(after.draft.attemptId,before.draft.attemptId);assert.equal(after.pending.filter(x=>x.type==='attempt').length,0);
  if(kind==='quiz'){await page.locator('#quizMount .quiz-shell').waitFor();assert.equal(after.draft.state.index,before.draft.state.index);assert.deepEqual(after.draft.state.answers,before.draft.state.answers)}
  else{assert.equal(await page.locator('#reflectionForm [name=reflection]').inputValue(),'Synthetic reflection '.repeat(9)+'Z');assert.equal(await page.locator('#reflectionForm [name=reflection]').evaluate(el=>el===document.activeElement),true)}
  await page.screenshot({path:resolve(out,kind+'-B.png')});report.checks.push({kind,status:'pass',sameRoute:true,sameAttempt:true,noAutomaticSubmission:true,realMain:true,realImmutableBootstrap:true});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);assert.equal(report.blockedExternal.some(x=>/firebase|googleapis|cloudfunctions/.test(x.host)),false);assert.equal(requests.filter(x=>x.status===404).length,0);report.status='pass';
}catch(error){report.failure={message:error.message,stack:error.stack};process.exitCode=1;if(page&&!page.isClosed()){report.page=await page.evaluate(()=>({url:location.href,boundary:window.__qaBoundaryReady,boundaryError:window.__qaBoundaryError,build:window.__RUDN_RELEASE__?.buildId,marker:sessionStorage.getItem('rudn.update.pending.v1'),text:document.querySelector('#app')?.innerText?.slice(0,500)}));await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{})}}
finally{await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});await mkdir(out,{recursive:true});report.requests404=requests.filter(x=>x.status===404);report.requests=requests.length;await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
