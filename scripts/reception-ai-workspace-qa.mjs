#!/usr/bin/env node
/** Local reception QA fixture. No Firebase, paid provider, real student or gradebook.
 * The actual application and assets are served unchanged from the supplied checkout.
 * The surrounding shell is a fixture: real platform route integration needs its own check.
 */
import http from 'node:http';
import path from 'node:path';
import {readFile,readdir,realpath,stat} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const defaultRepo=path.resolve(here,'..');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};

export async function createReceptionFixture({repo=defaultRepo,casesDirectory=process.env.RECEPTION_AI_CASES_DIR,provider:providedProvider}={}){
  if(!casesDirectory)throw Error('Provide --cases /absolute/path/private-data/cases or RECEPTION_AI_CASES_DIR.');
  repo=await realpath(repo);
  const site=await realpath(path.join(repo,'site'));
  const [{createReceptionService},{createMemoryStore}]=await Promise.all([
    import(pathToFileURL(path.join(repo,'firebase/functions/reception-ai/service.mjs'))),
    import(pathToFileURL(path.join(repo,'firebase/functions/reception-ai/store.mjs'))),
  ]);
  const cases=await Promise.all((await readdir(casesDirectory)).filter(name=>name.endsWith('.json')).sort().map(name=>readFile(path.join(casesDirectory,name),'utf8').then(JSON.parse)));
  const dataKind=cases.every(item=>item.version==='synthetic-reception-ui-qa-v1')?'synthetic':'supplied-bank';
  const identity={uid:'reception-repair-qa',studentKey:'reception-repair-qa',teacher:false};
  const store=createMemoryStore();
  const localized=(value,locale)=>typeof value==='string'?value:value?.[locale]||value?.ru||'';
  const provider=providedProvider||{name:'mock',async generate({actorCase,locale}){
    await new Promise(resolve=>setTimeout(resolve,300));
    const facts=actorCase.facts.slice(0,2);
    return {reply:facts.map(f=>localized(f.text,locale)).join(' ')||'Уточните, пожалуйста, какие обстоятельства вас интересуют.',
      revealedFactIds:facts.map(f=>f.id),releasedDocumentIds:actorCase.documents.map(d=>d.id),usage:{inputTokens:0,outputTokens:0}};
  }};
  if(provider.name!=='mock')throw Error('The QA fixture accepts only a local mock provider.');
  const service=createReceptionService({store,cases,provider});
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2','.gz':'application/gzip'};
  const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Приёмная · проверка мобильной игры</title><link rel="stylesheet" href="/assets/css/site.css"><link rel="stylesheet" href="/apps/reception/platform.css"><style>body{margin:0}.main{max-width:1320px;margin:0 auto!important;padding:14px 12px 90px}.qa-return{margin:80px auto;max-width:480px;padding:24px;background:white;border-radius:20px}.qa-return button{min-height:48px;padding:12px 20px}.qa-shell-label{font-size:12px;color:#60758c;margin:0 0 10px}@media(max-width:820px){.main{padding:0 0 86px}}body.reception-immersive .main{padding-bottom:0}</style></head><body><main class="main" id="fixtureMain"></main><nav class="mobile-nav" aria-label="Мобильная навигация платформы"><a href="#course"><span aria-hidden="true">◫</span><small>Курс</small></a><a href="#journal"><span aria-hidden="true">▣</span><small>Журнал</small></a></nav><script type="module" src="/__qa/fixture.js"></script></body></html>`;
  const entry=`import {mountReceptionAI} from '/apps/reception/ai/app.js';
const main=document.getElementById('fixtureMain');
let handle=null;
async function enter(){
  document.body.classList.add('reception-immersive');
  main.innerHTML='<section class="page reception-page"><div id="receptionAI"></div></section>';
  handle=await mountReceptionAI(document.getElementById('receptionAI'),{locale:new URLSearchParams(location.search).get('lang')||'ru',studentKey:'reception-repair-qa',context:'course',period:'2026-2027',assessmentAllowed:true,showLanguageSelector:true,onExit:leave},{endpoint:'/api/reception',demo:true,workbookVersion:2});
  window.__qaReception={provider:'mock',handle};
}
async function leave(){
  await handle?.flush?.();await handle?.();handle=null;
  document.body.classList.remove('reception-immersive');
  main.innerHTML='<section class="qa-return"><h1>Учебная платформа</h1><p>Смена сохранена. Можно снова открыть приёмную.</p><button id="qaReenter" type="button">Вернуться в приёмную</button></section>';
  document.getElementById('qaReenter').addEventListener('click',enter);
}
await enter();`;
  const server=http.createServer(async(req,res)=>{
    const send=(status,type,body)=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);};
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname==='/__qa/health')return send(200,mime['.json'],JSON.stringify({provider:'mock',caseCount:cases.length,dataKind,fixture:true}));
      if(url.pathname==='/api/reception'){
        if(req.method!=='POST')return send(405,mime['.json'],'{}');
        let bytes=0;const chunks=[];
        for await(const chunk of req){bytes+=chunk.length;if(bytes>32768)throw Error('Body limit');chunks.push(chunk);}
        const input=JSON.parse(Buffer.concat(chunks).toString());
        if(input.op==='start'||input.op==='catalog'||input.op==='recover')input.studentKey=identity.studentKey;
        try{return send(200,mime['.json'],JSON.stringify(await service.handle(input,identity)));}
        catch(error){return send(error.status||500,mime['.json'],JSON.stringify({ok:false,error:{code:error.code||'qa-error'}}));}
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return send(405,'text/plain','Method');
      if(url.pathname==='/'||url.pathname==='/__qa/reception.html')return send(200,mime['.html'],html);
      if(url.pathname==='/__qa/fixture.js')return send(200,mime['.js'],entry);
      const filename=await realpath(path.resolve(site,'.'+decodeURIComponent(url.pathname)));
      if(!filename.startsWith(site+path.sep)||(await stat(filename)).isDirectory())return send(404,'text/plain','Not found');
      return send(200,mime[path.extname(filename)]||'application/octet-stream',req.method==='HEAD'?'':await readFile(filename));
    }catch(error){send(error.code==='ENOENT'?404:400,'text/plain','Fixture request unavailable');}
  });
  // These server-side objects are useful for DOM tests. None are HTTP endpoints.
  return {server,service,identity,caseCount:cases.length,dataKind,cases,store};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--help')){
    console.log('node scripts/reception-ai-workspace-qa.mjs --cases /absolute/path/private-data/cases [--port 8793] [--repo /checkout]\nLoopback-only mock workspace. No Firebase, paid model or gradebook.');process.exit(0);
  }
  const port=Number(arg('--port','8793'));
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use a port between 1024 and 65535');
  const fixture=await createReceptionFixture({repo:arg('--repo',defaultRepo),casesDirectory:arg('--cases',process.env.RECEPTION_AI_CASES_DIR)});
  fixture.server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${port}/__qa/reception.html`,provider:'mock',caseCount:fixture.caseCount})));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>fixture.server.close(()=>process.exit(0)));
}
