/** Informed synthetic host regression. Real pointer input, public mount contract;
 * no production login, Firebase, private state injection, or modified learning bank. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=resolve(arg('--root',resolve(dirname(fileURLToPath(import.meta.url)),'..'))),site=resolve(root,'site');
const output=resolve(arg('--output',resolve(root,'../evidence/runs/20261017-legal-desktop-selection/qa/current')));
const baseline=arg('--baseline',''),browserName=arg('--browser','chromium');
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href:'playwright');
const {expandIds}=await import(pathToFileURL(resolve(site,'apps/legal-lab/lib/core.mjs')).href);
const {scoreFiveAssessment}=await import(pathToFileURL(resolve(site,'apps/legal-lab/lib/assessment-five.mjs')).href);
const json=async name=>JSON.parse(await readFile(resolve(site,'apps/legal-lab/data',name),'utf8'));
const [catalog,bank,scans,pack]=await Promise.all(['catalog.json','bank.json','scans.json','assessment-variants.json'].map(json));
const task=bank.classroom.find(t=>t.kind==='text'),index=bank.classroom.indexOf(task),meta=catalog.documents.find(d=>d.id===task.docId),doc=await json(meta.file);
const variant=pack.variants.find(v=>v.questionSet===task.docId),set=pack.questionSets.find(s=>s.docId===variant.questionSet);
const item={id:variant.id,format:'five-task-v1',tasks:[{id:variant.id+'-S',kind:'scan',scanId:variant.scanId},{id:variant.id+'-T',kind:'type',scanId:variant.typeScanId,answer:scans.find(s=>s.id===variant.typeScanId).actType},...set.tasks.map((t,i)=>({...t,id:variant.id+'-Q'+(i+1)}))]};
const fixtures=Object.fromEntries(['none','scan','type','text','result'].map(mode=>{const answer={assessmentMode:'five-task-v1',tasks:{}};const assessment=mode==='none'?null:{format:'five-task-v1',caseId:item.id,attemptId:'isolated-'+mode,startedAt:1,contentVersion:catalog.contentVersion,preview:true,stage:{scan:0,type:1,text:2,result:4}[mode],phase:mode==='result'?'completed':'active',answer,result:mode==='result'?scoreFiveAssessment(item,answer,scans,[doc]):null,delivery:'not-submitted'};return [mode,{schema:1,contentVersion:catalog.contentVersion,id:'isolated-'+mode,startedAt:1,answers:{},index,reader:{},assessment,elapsedMs:0,view:assessment?'assessment':'home',quizCompletion:{contentVersion:catalog.contentVersion}}];}));
const entry=baseline?execFileSync('git',['-c','safe.directory='+root,'show',baseline+':site/apps/legal-lab/entry.mjs'],{cwd:root,maxBuffer:2e6}):await readFile(resolve(site,'apps/legal-lab/entry.mjs'));
const harness=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Legal Lab isolated desktop selection regression</title><style>body{margin:0;font-family:system-ui}#mount{max-width:1400px;margin:auto}#fixture{font-size:12px;background:#eee}#checkpoint{display:none}</style><div id="fixture">Synthetic host fixture; no Firebase</div><output id="checkpoint"></output><main id="mount"></main><script type="module">import{mountLegalLab}from'/apps/legal-lab/entry.mjs';const mode=new URLSearchParams(location.search).get('mode')||'none',state=${JSON.stringify(fixtures)}[mode],output=document.querySelector('#checkpoint');output.textContent=JSON.stringify(state);await mountLegalLab(document.querySelector('#mount'),{owner:'isolated-'+mode,period:'qa',initialState:state,locale:'ru',attemptId:'isolated-'+mode,backend:{isAdmin:()=>false,getProfile:()=>({studentKey:'isolated',group:'QA'}),saveAttempt:async()=>{}},getOwner:()=> 'isolated-'+mode,assessmentAllowed:()=>true,checkpoint:async value=>{output.textContent=JSON.stringify(value.state)}});</script></html>`;
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}if(path==='/__qa/host.html'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(harness);return;}if(path==='/apps/legal-lab/entry.mjs'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(entry);return;}const file=resolve(site,'.'+decodeURIComponent(path));if(!file.startsWith(site+sep)||!(await stat(file)).isFile())throw Error('not found');res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={kind:'synthetic public-host pointer regression',baseline:baseline||null,entrySha256:createHash('sha256').update(entry).digest('hex'),browserName,browserFallback:'Browser connector attempted but Chrome distribution was not found; task explicitly authorized existing bundled Playwright.',startedAt:new Date().toISOString(),records:[]};
let browser;
const selector=id=>'[data-action="select-unit"][data-context="learning"][data-unit="'+id+'"]';
const snapshot=async page=>JSON.parse(await page.locator('#checkpoint').textContent());
try{browser=await pw[browserName].launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});report.browserVersion=browser.version();
 for(const [mode,touch]of [['none',false],['scan',false],['type',false],['text',false],['result',false],['scan',true],['text',true],['result',true]]){
  const record={mode,input:touch?'trusted touchscreen tap':'trusted mouse click',status:'fail',consoleErrors:[],pageErrors:[]};report.records.push(record);
  const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:900},hasTouch:touch,...(browserName!=='firefox'?{isMobile:touch}:{})}),page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>record.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')record.consoleErrors.push(m.text())});
  const activate=async locator=>{await locator.scrollIntoViewIfNeeded();if(touch)await locator.tap();else await locator.click();};
  try{
   await page.goto('http://127.0.0.1:'+server.address().port+'/__qa/host.html?mode='+mode);await page.locator('.ll-header').waitFor();record.title=await page.title();record.url=page.url();
   assert.match(record.title,/Legal Lab isolated desktop selection regression/);assert.ok((await page.locator('.ll-main').innerText()).trim());
   await activate(page.locator('.ll-nav [data-view="learn"]'));await page.locator('[data-reader-doc="'+task.docId+'"] .ll-paper').waitFor();
   const before=await snapshot(page);record.assessmentBefore=JSON.stringify(before.assessment);record.trustedEvents=[];
   await page.evaluate(()=>{window.__qaPointerProof=[];document.addEventListener('click',event=>{const unit=event.target.closest('[data-action="select-unit"],[data-action="remove-unit"],[data-action="submit-task"]');if(unit)window.__qaPointerProof.push({action:unit.dataset.action,context:unit.dataset.context,unit:unit.dataset.unit||unit.dataset.id,isTrusted:event.isTrusted,pointerType:event.pointerType,button:event.button});});});
   const ids=expandIds(task.answerSets[0],[doc]);record.expectedIds=ids;
   async function choose(id){const unit=doc.units.find(u=>u.id===id),toc=page.locator('[data-action="toggle-toc"]');if(await toc.getAttribute('aria-expanded')!=='true')await activate(toc);await activate(page.locator('[data-action="section"][data-id="'+unit.sectionId+'"]'));await activate(page.locator(selector(id)));}
   await choose(ids[0]);record.pressedAfterFirstClick=await page.locator(selector(ids[0])).getAttribute('aria-pressed');record.assessmentAfterFirstClick=JSON.stringify((await snapshot(page)).assessment);
   assert.equal(record.pressedAfterFirstClick,'true','Quiz paragraph must select after a saved assessment');assert.equal(record.assessmentAfterFirstClick,record.assessmentBefore,'Quiz click must not mutate assessment');
   await activate(page.locator('[data-action="remove-unit"][data-context="learning"][data-id="'+ids[0]+'"]'));assert.equal(await page.locator(selector(ids[0])).getAttribute('aria-pressed'),'false','Quiz chip removes quiz selection');
   for(const id of ids)await choose(id);
   await activate(page.locator('.ll-reader-dock [data-action="submit-task"]'));await page.locator('.ll-feedback.success').waitFor();
   record.feedback=(await page.locator('.ll-feedback.success').innerText()).slice(0,500);const after=await snapshot(page);record.answer=after.answers[task.id];assert.equal(after.answers[task.id].submitted,true);assert.equal(JSON.stringify(after.assessment),record.assessmentBefore,'Quiz check must not mutate assessment');
   assert.equal(await page.locator('.ll-reader-dock [data-action="next-task"]').count(),1,'Successful quiz answer offers next');assert.deepEqual(record.pageErrors,[]);assert.deepEqual(record.consoleErrors,[]);record.status='pass';
  }catch(error){record.error=error.stack||String(error);}
  finally{record.trustedEvents=await page.evaluate(()=>window.__qaPointerProof||[]).catch(()=>[]);record.screenshot=resolve(output,mode+'-'+(touch?'touch':'desktop')+'.png');await page.screenshot({path:record.screenshot,fullPage:false});await context.close();console.log(record.status.toUpperCase(),mode,record.input,record.error?.split('\n')[0]||'');await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));}
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));report.finishedAt=new Date().toISOString();report.passed=report.records.filter(r=>r.status==='pass').length;report.failed=report.records.filter(r=>r.status==='fail').length;await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));}
if(report.failed)process.exitCode=1;
