// Focused real-browser execution of the published Puzzle inline loader.
// Tiny synthetic engine/module responses isolate retry lifecycle, not gameplay.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),arg=(k,f)=>args.includes(k)?args[args.indexOf(k)+1]:f;
const engine=arg('--browser','chromium'),out=resolve(arg('--output','../evidence/runs/20261018-platform-observability/adapters/loader-retry-'+engine));
const source=await readFile(resolve(root,'site/apps/puzzle.html'),'utf8');
const inline=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('BIND_RELEASE'));
assert.ok(inline);let failure='bootstrap',failureEnabled=true,counts={},requests=[];
const server=createServer((req,res)=>{const url=new URL(req.url,'http://local');requests.push(url.pathname);counts[url.pathname]=(counts[url.pathname]||0)+1;
 if(url.pathname==='/apps/loader.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><body><main><input id="answer"></main><script>'+inline+'</script></body></html>');return;}
 if(url.pathname==='/__network-restored'){failureEnabled=false;res.end('ok');return;}
 const name=url.pathname.split('/').pop();
 if(['puzzle-bootstrap.js','puzzle-render-geometry.js','puzzle-engine.js'].includes(name)){
  if((failure==='bootstrap'&&name==='puzzle-bootstrap.js'||failure==='engine'&&name==='puzzle-engine.js')&&failureEnabled){res.writeHead(503);res.end('synthetic network outage');return;}
  res.setHeader('Content-Type','text/javascript');res.end('window.qaEvaluations??={};window.qaEvaluations['+JSON.stringify(name)+']=(window.qaEvaluations['+JSON.stringify(name)+']||0)+1;');return;
 }
 res.writeHead(404);res.end();
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href:'playwright');let browser,page;
const report={engine,status:'fail',kind:'actual inline loader with synthetic failed network/bootstrap/engine; no gameplay or production',checks:[],errors:[]};
try{
 browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 for(const firstFailure of ['bootstrap','engine']){
  failure=firstFailure;failureEnabled=true;counts={};requests=[];const context=await browser.newContext();page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/apps/loader.html');await page.getByRole('status').filter({hasText:'Карта откроется'}).waitFor();
  await page.locator('#answer').fill('synthetic unfinished input');
  const failedPath='/assets/js/'+(firstFailure==='bootstrap'?'puzzle-bootstrap.js':'puzzle-engine.js'),failedRequests=counts[failedPath];assert.ok(failedRequests>=1);
  await fetch('http://127.0.0.1:'+server.address().port+'/__network-restored');
  await page.evaluate(()=>{for(let i=0;i<3;i++)window.dispatchEvent(new Event('online'))});
  await page.waitForFunction(()=>window.qaEvaluations?.['puzzle-engine.js']===1&&!document.querySelector('[role=status]'));
  await page.evaluate(()=>{window.dispatchEvent(new Event('offline'));for(let i=0;i<3;i++)window.dispatchEvent(new Event('online'))});
  await page.waitForTimeout(200);
  assert.equal(counts['/apps/loader.html'],1,'No hidden reload after successful retry');
  assert.equal(await page.locator('#answer').inputValue(),'synthetic unfinished input');
  assert.deepEqual(await page.evaluate(()=>window.qaEvaluations),{'puzzle-bootstrap.js':1,'puzzle-render-geometry.js':1,'puzzle-engine.js':1});
  assert.equal(counts[failedPath],failedRequests+1);
  report.checks.push({firstFailure,status:'pass',oneDocument:true,oneSuccessfulBootstrap:true,oneEngine:true,retainedInput:true,requests:[...requests]});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='pass';
}catch(error){report.failure={message:error.message,stack:error.stack};process.exitCode=1;}
finally{await browser?.close();await new Promise(r=>{server.close(r);server.closeAllConnections()});await mkdir(out,{recursive:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
