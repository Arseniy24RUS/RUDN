import assert from'node:assert/strict';
import{createServer}from'node:http';
import{readFile,writeFile,mkdir}from'node:fs/promises';
import path from'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);let browserName='chromium',out=path.join(tmpdir(),'career-vacancies-ui-'+Date.now());
for(let i=0;i<args.length;i++){
 if(args[i]==='--browser'&&args[i+1])browserName=args[++i];
 else if(args[i]==='--output'&&args[i+1])out=path.resolve(args[++i]);
 else throw Error('Usage: node scripts/test_career_vacancy_bank_ui.mjs [--browser chromium|firefox|webkit] [--output DIRECTORY]');
}
assert(['chromium','firefox','webkit'].includes(browserName),'Unsupported browser: '+browserName);
const modulePath=process.env.PLAYWRIGHT_MODULE_PATH||'playwright';
const playwright=await import(path.isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const browserType=playwright[browserName];
assert(browserType,'Playwright browser export unavailable: '+browserName);
const site=path.join(ROOT,'site');
const seed=JSON.parse(await readFile(path.join(ROOT,'source-audit/career-vacancies/seed.json'),'utf8'));
const tree=seed.treeSha256;assert.match(tree,/^[a-f0-9]{64}$/);
await mkdir(out,{recursive:true});
let hosting=null;
try{hosting=JSON.parse(await readFile(path.join(ROOT,'source-audit/career-vacancies/hosting.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(hosting){
 assert.equal(hosting.treeSHA,tree);assert.equal(hosting.encoding,'base64-gzip');
 assert.match(hosting.collectionRoot,/^https:\/\/raw\.githubusercontent\.com\/Arseniy24RUS\/RUDN\/[a-f0-9]{40}\/career-vacancy-bank\/$/);
}
const collection=hosting?.collectionRoot||'/RUDN/_collections/career-vacancies/'+tree+'/';
const collectionEncoding=hosting?.encoding||null;
let detailsHosting=null;
try{detailsHosting=JSON.parse(await readFile(path.join(ROOT,'source-audit/career-vacancies/details-hosting.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(detailsHosting){assert.equal(detailsHosting.baseTreeSHA,tree);assert.equal(detailsHosting.encoding,'base64-gzip');assert.match(detailsHosting.collectionRoot,/^https:\/\/raw\.githubusercontent\.com\/Arseniy24RUS\/RUDN\/[a-f0-9]{40}\/career-vacancy-details\/$/);}
const detailsResource=detailsHosting?{detailsCollectionRoot:detailsHosting.collectionRoot,detailsCollectionEncoding:detailsHosting.encoding,detailsBaseTreeSHA:detailsHosting.baseTreeSHA,detailsTreeSHA:detailsHosting.treeSHA}:{};

const backend=`import {durableStore as store} from '/assets/js/durable-store.js';export const groupOptions=()=>[];export const backend={authReady:true,user:null,mode:'local',connected:false,serverTimeOffset:0,getProfile:()=>null,isAdmin:()=>false,init:async()=>{},onStatus:()=>()=>{},status:()=>({}),globalNow:()=>Date.now(),getAccessOverrides:()=>({}),localGrades:()=>({}),localAttempts:()=>[],loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,{...o,queue:false}),saveAttempt:async()=>{throw Error('QA forbids submissions')}};`;
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seminar 5 vacancies · production-like entry QA</title><style>body{margin:0;background:#f4f7fb}#module{container:career/inline-size;max-width:1200px;margin:auto;padding:0 12px;box-sizing:border-box}#booterror{white-space:pre-wrap;color:red}</style></head><body><pre id="booterror" hidden></pre><div id="module"></div><script type="module">
import{mountCareer}from'/apps/career/entry.mjs';import{setReleaseContext}from'/assets/js/release-resources.js';import{MODEL_VERSION,QUESTIONNAIRE_VERSION,REGISTRY_VERSION}from'/apps/career/assets/versions.mjs';import{PERSONALITY_ITEMS,PERSONALITY_METHOD}from'/apps/career/assets/personality-model.mjs';
try{
const language=new URLSearchParams(location.search).get('lang')||'ru',load=async n=>(await fetch('/apps/career/data/'+n+'.json')).json();const[questions,conditions]=await Promise.all([load('questions'),load('conditions')]);setReleaseContext({buildId:'a'.repeat(64),siteRoot:location.origin+'/RUDN/',runtimeRoot:'/RUDN/_releases/'+('a'.repeat(64))+'/',resources:{'apps/career/data/vacancies/bank/summary.json':{url:'${collection}summary.json',collectionRoot:'${collection}',collectionEncoding:${JSON.stringify(collectionEncoding)},...${JSON.stringify(detailsResource)},collection:{treeSHA:'${tree}'}}}});
const prefix='rudn-career:embedded:%2Fapps%2Fcareer%2F:guest%3Acareer:',recordId='qa-vacancies-native-20261107';if(!localStorage.getItem(prefix+'qa-bank-seeded-v2')){localStorage.setItem(prefix+'answers-v8.1',JSON.stringify({schema:4,modelVersion:MODEL_VERSION,questionnaireVersion:QUESTIONNAIRE_VERSION,registryVersion:REGISTRY_VERSION,answers:Object.fromEntries(questions.map(q=>[q.id,3])),prioritySectors:['FIN','ECO','DIG','IND'],lowPrioritySectors:['SEC','EMR'],conditions:Object.fromEntries(conditions.map(c=>[c.id,3])),focusAreas:{},compareIds:[],questionIndex:26,lastRoute:'results',completedAt:'2026-11-06T20:00:00Z',resultRecordId:recordId}));localStorage.setItem(prefix+'career-journey-v1',JSON.stringify({schemaVersion:1,regionIds:['ru-77','ru-54'],desiredIds:['minfin','mvd','novosibirsk-mayor-office'],confirmed:true,assessments:{},customVacancies:[],selectedVacancyId:null,view:'recommendations',resultRecordId:recordId}));const personal=JSON.stringify({schema:1,method:PERSONALITY_METHOD.id,version:PERSONALITY_METHOD.version,answers:Object.fromEntries(PERSONALITY_ITEMS.map(x=>[x.id,3])),page:11,completedAt:'2026-11-06T20:00:00Z'});localStorage.setItem('rudn-personality:'+encodeURIComponent(location.origin+'/RUDN/')+':course:guest%3Acareer:v1',personal);localStorage.setItem(prefix+'qa-bank-seeded-v2','true');}
window.handle=await mountCareer(document.querySelector('#module'),{owner:'guest:career',context:'course',lang:language,initialRoute:'results'});document.documentElement.dataset.ready='true';
}catch(error){document.querySelector('#booterror').hidden=false;document.querySelector('#booterror').textContent=error.stack;console.error(error);}
</script></body></html>`;
const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.gz':'application/gzip','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');if(url.pathname==='/qa-bank.html'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}if(url.pathname==='/assets/js/backend.js'){res.setHeader('Content-Type','text/javascript');res.end(backend);return;}const mapped=url.pathname.startsWith(collection)?'/apps/career/data/vacancies/bank/'+url.pathname.slice(collection.length):url.pathname;const file=path.resolve(site,'.'+decodeURIComponent(mapped));if(!file.startsWith(site+path.sep))throw Error('path');res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end('not found');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const report={flow:'Sem5 results → recommended/preferred employer → gzip vacancies → more/page/source; municipal archive and empty-head related employer',evidenceKind:'synthetic stored-answer fixture with actual mountCareer and source data; CI Playwright',browserName,collectionTreeSHA256:tree,collectionRoot:collection,collectionEncoding,origin,checks:[],screenshots:[],errors:[],externalRequestsBlocked:[]};let browser,activePage;
try{
 browser=await browserType.launch({headless:true});report.browser=browser.version();
 for(const[language,viewport]of[['ru',{width:1440,height:900}],['ru',{width:390,height:844}],['en',{width:390,height:844}],['zh-Hans',{width:390,height:844}]]){
  const context=await browser.newContext({viewport});await context.route('**/*',route=>{const request=route.request(),url=request.url();const allowedData=request.method()==='GET'&&((hosting&&url.startsWith(collection))||(detailsHosting&&url.startsWith(detailsHosting.collectionRoot)));if(new URL(url).origin!==origin&&!allowedData){report.externalRequestsBlocked.push(url);return route.abort();}return route.continue();});const page=await context.newPage(),errors=[],bankRequests=[],richRequests=[];page.on('request',r=>{if(detailsHosting&&r.url().startsWith(detailsHosting.collectionRoot))richRequests.push(r.url());});activePage=page;page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});page.on('request',r=>{if(r.url().includes('/vacancies/bank/')||r.url().includes('/_collections/career-vacancies/')||(hosting&&r.url().startsWith(collection)))bankRequests.push(r.url());});await page.goto(origin+'/qa-bank.html?lang='+language);await page.waitForSelector('[data-recommendation-group="preferred"]',{timeout:30000});assert.equal(await page.locator('#booterror').isVisible(),false);assert.equal(bankRequests.length,0,'closed employer panels must not fetch any bank resource');assert.equal(richRequests.length,0,'no initial rich requests');assert.match(await page.title(),/Seminar|Профориентац|Career|职业|公共|civil|gov|госслужащих/i);assert(page.url().includes('/qa-bank.html'));assert((await page.locator('h1').allTextContents()).some(t=>t.length>4));assert.equal(await page.locator('vite-error-overlay,nextjs-portal').count(),0);
  const panel=page.locator('[data-recommendation-group="preferred"] [data-authority-roles="minfin"]');await panel.locator(':scope > summary').click();await panel.locator('[data-bank-job]').first().waitFor({timeout:30000});assert.equal(await panel.locator('[data-bank-job]').count(),10);assert.equal(bankRequests.filter(u=>u.includes('/employers/')).length,1);assert(bankRequests.every(u=>u.startsWith(new URL(collection,origin).href)),'actual entry must route bank resources to immutable collection only');if(hosting)assert(bankRequests.every(u=>u.endsWith('.b64')),'remote bank requests must use base64 transport');assert.equal(bankRequests.filter(u=>u.includes('/pages/')).length,1);const firstSource=panel.locator('[data-bank-job] .seminar-vacancy-link').first();assert.match(await firstSource.getAttribute('href'),/^https:\/\/gossluzhba\.gov\.ru\/vacancy\//);assert.equal(await firstSource.getAttribute('rel'),'noopener noreferrer');
  await panel.locator('[data-bank-more]').click();assert.equal(await panel.locator('[data-bank-job]').count(),20);assert(await panel.locator('.journey-bank-badge.archived,.journey-bank-badge.expired').count()>0);assert.equal(bankRequests.filter(u=>u.includes('/pages/')).length,1);await panel.locator('[data-bank-job]').first().locator('.journey-bank-requirements > summary').click();assert(await panel.locator('[data-bank-job]').first().locator('.journey-bank-requirements').evaluate(x=>x.open));
  await panel.locator('[data-employer-bank]').scrollIntoViewIfNeeded();const file=out+'/'+language+'-'+viewport.width+'-production-entry-vacancies.png';await page.screenshot({path:file});report.screenshots.push(file);
  if(language==='ru'&&viewport.width===1440){await panel.locator('[data-bank-next]').click();await page.waitForFunction(()=>document.querySelector('#module').shadowRoot.querySelector('[data-recommendation-group="preferred"] [data-authority-roles="minfin"] .journey-bank-pages > span')?.textContent.trim()==='2 / 5');await panel.locator('[data-bank-job]').first().waitFor();assert.equal(bankRequests.filter(u=>u.includes('/pages/')).length,2);await panel.locator('[data-bank-prev]').click();await page.waitForFunction(()=>document.querySelector('#module').shadowRoot.querySelector('[data-recommendation-group="preferred"] [data-authority-roles="minfin"] .journey-bank-pages > span')?.textContent.trim()==='1 / 5');assert.equal(bankRequests.filter(u=>u.includes('/pages/')).length,2);
   const municipal=page.locator('[data-recommendation-group="preferred"] [data-authority-roles="novosibirsk-mayor-office"]');await municipal.locator(':scope > summary').click();await municipal.locator('[data-bank-job]').first().waitFor();assert.equal(await municipal.locator('.journey-bank-badge.source-active').count(),0);assert.equal(await municipal.locator('.journey-bank-current-employer').innerText(),'Мэрия города Новосибирска');
   const mvd=page.locator('[data-recommendation-group="preferred"] [data-authority-roles="mvd"]');await mvd.locator(':scope > summary').click();await mvd.locator('[data-bank-job]').first().waitFor({timeout:30000});assert.notEqual(await mvd.locator('[data-bank-family]').inputValue(),'mvd');assert.match(await mvd.locator('.journey-bank-current-employer').innerText(),/Астрахан/);assert(await mvd.locator('[data-bank-family] option').count()>=79);await mvd.locator('[data-employer-bank]').scrollIntoViewIfNeeded();const mf=out+'/ru-1440-production-entry-related-employer.png';await page.screenshot({path:mf});report.screenshots.push(mf);
  }
  if(detailsHosting){
   // Expand one actual source record; the reader may fetch its index and one selected shard.
   const job=panel.locator('[data-bank-job]').first(),uuid=await job.getAttribute('data-bank-job');
   assert.equal(richRequests.length,0,'basic browsing must not fetch rich text');
   await job.locator('[data-bank-full] > summary').click();
   await job.locator('[data-bank-full-content] section').first().waitFor({timeout:60000});
   assert(richRequests.length>=1&&richRequests.length<=2,'only selected base-page index and optional selected shard');
   assert(richRequests.every(u=>u.startsWith(detailsHosting.collectionRoot)&&u.endsWith('.b64')));
   const requestsAfterExpand=richRequests.length;
   await job.locator('[data-bank-choose]').click();
   await page.locator('#journey-open-plan').waitFor({timeout:30000});
   assert.equal(richRequests.length,requestsAfterExpand,'choosing reuses verified rich payload');
   const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('rudn-career:embedded:%2Fapps%2Fcareer%2F:guest%3Acareer:career-journey-v1')));
   const chosen=await saved();assert.equal(chosen.selectedVacancyId,'bank-'+uuid);assert.equal(chosen.selectedSnapshot.sourceVacancyId,uuid);
   const proof=chosen.selectedSnapshot.source.provenance;assert.equal(proof.recordJSONPointer,'/records/'+uuid);const allowedRichPaths=new Set([proof.basePage,proof.detailPage].map(p=>detailsHosting.collectionRoot+p.replace(/\.json\.gz$/,'.b64')));assert(richRequests.every(url=>allowedRichPaths.has(url)),'rich fetches must belong only to selected UUID base page and shard');
   assert.equal(chosen.selectedSnapshot.bankVacancy,true);assert(chosen.selectedSnapshot.requirements.every(r=>r.sourceLocator&&r.evidenceSourceUrl));
   assert(!chosen.selectedSnapshot.requirements.some(r=>r.category==='duties'||r.sourceHeading==='jobResponsibilities'));
   const criteria=page.locator('[data-requirement-row]');assert(await criteria.count()>=2);
   // A fieldset can fit the page while its native legend still straddles the
   // painted border. Check the title's padding inset, not just page overflow.
   const verifyRequirementCards=async()=>{
    const escaped=await criteria.evaluateAll(cards=>cards.flatMap(card=>{
     const title=card.querySelector('legend'),box=card.getBoundingClientRect(),text=title.getBoundingClientRect(),style=getComputedStyle(card);
     return text.top<box.top+parseFloat(style.paddingTop)-1||text.left<box.left+parseFloat(style.paddingLeft)-1||text.right>box.right-parseFloat(style.paddingRight)+1||text.bottom>box.bottom-parseFloat(style.paddingBottom)+1||card.scrollWidth>card.clientWidth+1?[{id:card.dataset.requirementRow,card:{top:box.top,right:box.right,bottom:box.bottom,left:box.left},title:{top:text.top,right:text.right,bottom:text.bottom,left:text.left}}]:[];
    }));
    assert.deepEqual(escaped,[],'Requirement text must stay inside its card with padding');
   };
   await verifyRequirementCards();
   // Choose a source knowledge/skills criterion as the development gap when available.
   const snapshot=chosen.selectedSnapshot;
   const knowledge=snapshot.requirements.find(r=>r.category==='knowledge'||r.category==='skills');assert(knowledge,'actual first Minfin record includes knowledge/skills');
   const gap=criteria.filter({hasText:knowledge.sourceText}).first();
   const captureRich=async(label,target)=>{if(language!=='ru')return;await target.scrollIntoViewIfNeeded();const file=path.join(out,language+'-'+viewport.width+'-'+label+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
   await captureRich('source-assessment-before',gap);
   await gap.locator('input[value="gap"]').check();
   if(language==='ru'&&viewport.width===390){
    for(const width of[320,430]){
     await page.setViewportSize({width,height:844});await verifyRequirementCards();await gap.scrollIntoViewIfNeeded();
     const file=path.join(out,'ru-'+width+'-requirement-card.png');await page.screenshot({path:file});report.screenshots.push(file);
    }
    await page.setViewportSize(viewport);await verifyRequirementCards();
   }
   const gapKey=await gap.getAttribute('data-requirement-row');
   for(let i=0;i<await criteria.count();i++){const row=criteria.nth(i);if(await row.getAttribute('data-requirement-row')!==gapKey){await row.locator('input[value="met"]').check();break;}}
   await captureRich('source-assessment-marked',gap);
   await page.locator('#journey-open-plan').click();await page.locator('.journey-goal-card').waitFor();
   assert((await page.locator('.journey-goal-card').innerText()).includes(snapshot.employerName));
   assert.equal(await page.locator('.journey-goal-card .seminar-vacancy-link').getAttribute('href'),snapshot.url);
   assert((await page.locator('.journey-gap-list').allTextContents()).join(' ').includes(knowledge.sourceText));
   await captureRich('source-development-plan',page.locator('.journey-gap-list').filter({hasText:knowledge.sourceText}).first().locator('..'));
   const before=await saved();await page.reload();await page.locator('.journey-goal-card').waitFor({timeout:30000});
   const after=await saved();assert.equal(after.selectedVacancyId,before.selectedVacancyId);assert.deepEqual(after.assessments[before.selectedVacancyId],before.assessments[before.selectedVacancyId]);
   assert((await page.locator('.journey-goal-card').innerText()).includes(snapshot.employerName));
   await page.locator('#journey-back-requirements').click();await page.locator('#journey-back-vacancies').click();
   if(language==='ru'&&viewport.width===1440){
    const mvd=page.locator('[data-recommendation-group="preferred"] [data-authority-roles="mvd"]');if(!await mvd.evaluate(e=>e.open))await mvd.locator(':scope > summary').click();
    const branch=mvd.locator('[data-bank-job]').first();await branch.waitFor();await branch.locator('[data-bank-choose]').click();await page.locator('#journey-open-plan').waitFor({timeout:60000});
    const selected=await saved();assert.match(selected.selectedSnapshot.employerName,/Астрахан/);assert.notEqual(selected.selectedSnapshot.employerId,'mvd');
    await page.locator('#journey-open-plan').click();await page.reload();await page.locator('.journey-goal-card').waitFor({timeout:30000});assert((await page.locator('.journey-goal-card').innerText()).includes(selected.selectedSnapshot.employerName));assert.equal((await saved()).selectedVacancyId,selected.selectedVacancyId);
   }
   report.checks.push({language,viewport,richFlow:'pass',selectedUUID:uuid,selectedRichRequests:requestsAfterExpand,reloadRestored:true});
  }
  const overflow=await page.locator('.career-surface').evaluate(e=>{const edge=e.getBoundingClientRect().right;return{width:e.clientWidth,scroll:e.scrollWidth,elements:[...e.querySelectorAll('*')].map(x=>{const r=x.getBoundingClientRect();return{tag:x.tagName,id:x.id,class:x.className?.baseVal??x.className,left:r.left,right:r.right,width:r.width,client:x.clientWidth,scroll:x.scrollWidth};}).filter(x=>x.width>0&&(x.right>edge+2||x.scroll>x.client+2)).sort((a,b)=>b.right-a.right).slice(0,20)};});assert(overflow.scroll<=overflow.width+2,JSON.stringify(overflow));assert.equal(errors.length,0,errors.join('\n'));report.checks.push({language,viewport,status:'pass',bankRequests:bankRequests.length,globalIndexRequests:bankRequests.filter(u=>u.endsWith('/summary.json')||u.includes('index.json')).length,consoleErrors:errors.length});await context.close();
 }
 assert.equal(report.externalRequestsBlocked.length,0,'No external network requests expected');report.productionLikeActualEntryRouting=true;report.status='pass';
}catch(error){report.status='fail';report.errors.push(error.stack||String(error));process.exitCode=1;if(activePage&&!activePage.isClosed()){const file=path.join(out,'failure.png');try{await activePage.screenshot({path:file});report.screenshots.push(file);}catch(screenshotError){report.errors.push('Failure screenshot: '+screenshotError.message);}}}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
