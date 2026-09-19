// The actual lecture-1 quiz UI, isolated from authentication and grade delivery.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../site/',import.meta.url)));
const backendSource=`import {durableStore as store} from '/assets/js/durable-store.js';
export const groupOptions=()=>[];
export const backend={authReady:true,user:{uid:'quiz-layout-fixture'},mode:'local',connected:false,
getProfile:()=>({studentKey:'quiz-layout-fixture',fullName:'QA student',group:'QA'}),isAdmin:()=>false,
init:async()=>{},onStatus:()=>()=>{},status:()=>({}),globalNow:()=>Date.parse('2026-09-19T12:00:00Z'),getAccessOverrides:()=>({}),
localGrades:()=>({}),getGrades:async()=>({}),localAttempts:()=>[],getAttempts:async()=>[],
loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,{...o,queue:false}),
saveAttempt:()=>{throw Error('Layout check must not submit grades');}};`;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  res.setHeader('Cache-Control','no-store');
  if(pathname==='/assets/js/backend.js'){res.setHeader('Content-Type','text/javascript');res.end(backendSource);return;}
  // No caching in the local visual fixture, so CSS edits appear on reload.
  if(pathname==='/service-worker.js'){res.setHeader('Content-Type','text/javascript');res.end("self.addEventListener('install',()=>self.skipWaiting());");return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(resolve=>server.listen(Number(process.env.PORT)||0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
if(process.argv.includes('--serve')){console.log(base+'/#activity/lecture-1/test');await new Promise(()=>{});}
const pw=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await pw.chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
try{
  const seen=new Set();
  for(const width of [1366,390,320]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[];
    await context.route('**/*',request=>{
      if(new URL(request.request().url()).origin===base)return request.continue();
      external.push(request.request().url());return request.abort();
    });
    page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.goto(base+'/#activity/lecture-1/test');await page.locator('.answer-option').first().waitFor();
      for(let question=0;question<5;question++){
        const rows=await page.locator('.answer-option').evaluateAll(nodes=>nodes.map(node=>{
          const input=node.querySelector('input'),text=node.querySelector('span');
          const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};};
          return {type:input.type,row:rect(node),input:rect(input),text:rect(text),align:getComputedStyle(text).textAlign};
        }));
        assert.ok(rows.length>1);
        for(const row of rows){
          seen.add(row.type);
          assert.ok(row.input.width>=16&&row.input.width<=22,`${width}px question ${question+1}: oversized ${row.type} (${row.input.width}px)`);
          assert.ok(row.input.left-row.row.left<20,'Control must start at the left padding');
          assert.ok(row.text.left-row.input.right>=8&&row.text.left-row.input.right<=14,'Answer text must sit beside the control');
          assert.ok(row.text.right<=row.row.right-10&&row.row.right<=width,'No horizontal overflow');
          assert.ok(row.row.height>=44);assert.equal(row.align,'left');
        }
        await page.locator('.answer-option span').first().click();
        assert.equal(await page.locator('.answer-option input:checked').count(),1,'Clicking the text selects the answer');
        if(question===0&&process.env.QA_OUT){await mkdir(process.env.QA_OUT,{recursive:true});await page.screenshot({path:path.join(process.env.QA_OUT,`quiz-${width}.png`)});}
        if(question<4){await page.locator('#quizNext').click();await page.waitForFunction(expected=>document.querySelector('.quiz-progress>span')?.textContent.includes(expected),`${question+2}/5`);}
      }
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      console.log(`PASS lecture 1: all 5 questions at ${width}px, adjacent controls/text, wrapping, label clicks; no grades or external requests`);
    }finally{await context.close();}
  }
  assert.deepEqual([...seen].sort(),['checkbox','radio']);
}finally{await browser.close();server.close();}
