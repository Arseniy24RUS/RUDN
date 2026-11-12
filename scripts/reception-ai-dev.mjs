#!/usr/bin/env node
/** Local-only workbench. A mock transport is explicit; live mode requires a server-side key. */
import http from 'node:http';
import {readFile,writeFile,mkdir,rename,realpath,stat} from 'node:fs/promises';
import {readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createOpenAIProvider} from '../firebase/functions/reception-ai/provider.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
if(args.includes('--help')){
  console.log('node scripts/reception-ai-dev.mjs --cases /absolute/path/private-data/cases [--provider mock|openai] [--port 8787] [--state /path/state.json]');
  process.exit(0);
}
const casesPath=arg('--cases',process.env.RECEPTION_AI_CASES_DIR),mode=arg('--provider','mock');
const port=Number(arg('--port','8787'));
if(!casesPath||!['mock','openai'].includes(mode)||!Number.isInteger(port)||port<1024||port>65535){console.error('Provide --cases and a valid --provider / --port; use --help.');process.exit(1);}
if(mode==='openai'&&!process.env.OPENAI_API_KEY){console.error('Live mode requires OPENAI_API_KEY in the server environment. Never put it in browser configuration.');process.exit(1);}
const site=await realpath(path.join(repo,'site')),privateDir=await realpath(path.resolve(casesPath));
if(privateDir===site||privateDir.startsWith(site+path.sep))throw new Error('Private cases cannot be served from site/. Move the dossier directory outside site/.');
const cases=await Promise.all(readdirSync(privateDir).filter(f=>f.endsWith('.json')).sort().map(f=>readFile(path.join(privateDir,f),'utf8').then(JSON.parse)));
if(!cases.length)throw new Error('No private case JSON files found.');

// All transactions share one serialized queue. Atomic rename keeps completed local
// turns durable across server restarts without writing anything into the public site.
export async function createLocalFileStore(filename){
  let state={};try{state=JSON.parse(await readFile(filename,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  let queue=Promise.resolve();
  const parts=p=>String(p||'').split('/').filter(Boolean);
  const read=(p,source=state)=>{let value=source;for(const key of parts(p)){value=value?.[key];}return value===undefined?null:structuredClone(value);};
  return {
    async get(p){await queue;return read(p);},
    transaction(p,fn){
      const task=queue.then(async()=>{
        const next=fn(read(p));if(next===undefined)return {committed:false,value:read(p)};
        const copy=structuredClone(state),keys=parts(p);
        let changed=copy;
        if(!keys.length)changed=next??{};
        else {let parent=copy;for(const key of keys.slice(0,-1)){parent[key]??={};parent=parent[key];}if(next===null)delete parent[keys.at(-1)];else parent[keys.at(-1)]=structuredClone(next);}
        await mkdir(path.dirname(filename),{recursive:true,mode:0o700});
        const temp=filename+'.tmp';await writeFile(temp,JSON.stringify(changed),{mode:0o600});await rename(temp,filename);state=changed;
        return {committed:true,value:read(p)};
      });queue=task.catch(()=>{});return task;
    }
  };
}
const local=t=>typeof t==='string'?t:(t?.ru||Object.values(t||{})[0]||'');
const inLocale=(t,locale)=>typeof t==='string'?t:(t?.[locale]||t?.ru||'');
export function createMockProvider(){return {name:'mock',async generate({actorCase,messages,text,locale}){
  const facts=actorCase.facts||[],query=String(text).toLowerCase();
  const words=query.match(/[\p{L}\p{N}]{3,}/gu)||[];
  const dateQuery=/когда|дат[ауы]|when|date|日期|什么时候/u.test(query);
  const scores=facts.map((fact,index)=>({fact,index,score:words.reduce((n,w)=>n+(inLocale(fact.text,locale).toLowerCase().includes(w)?1:0),0)+(dateQuery&&/\d{4}|\d{2}\.\d{2}|ноябр|november|11月/iu.test(local(fact.text))?2:0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
  const count=(messages||[]).filter(m=>m.role==='user').length;
  const chosen=scores[0]?.score?scores[0].fact:facts[count%Math.max(1,facts.length)];
  const wantsDocument=/покаж|документ|расписк|бумаг|справк|show|document|receipt|paper|材料|文件|证明|回执/u.test(query);
  const docs=actorCase.documents||[];
  const doc=wantsDocument?(docs.find(d=>(d.factIds||[]).includes(chosen?.id))||docs[0]):null;
  return {reply:chosen?inLocale(chosen.text,locale):({ru:'Уточните, пожалуйста, что вам нужно узнать.',en:'Could you clarify what you need to know?',zh:'请说明您需要了解什么。'}[locale]||'Уточните, пожалуйста.'),revealedFactIds:chosen?[chosen.id]:[],releasedDocumentIds:doc?[doc.id]:[],usage:{inputTokens:0,outputTokens:0}};
}};}
const stateFile=path.resolve(arg('--state',path.join(repo,'.reception-ai-local',mode+'-state.json')));
if(stateFile===site||stateFile.startsWith(site+path.sep))throw new Error('Local session state must be outside the public site/.');
const store=await createLocalFileStore(stateFile);
const provider=mode==='mock'?createMockProvider():createOpenAIProvider({apiKey:process.env.OPENAI_API_KEY});
const service=createReceptionService({store,cases,provider});
const identity={uid:'reception-local-learner',studentKey:'reception-local-learner',teacher:false};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2','.gz':'application/gzip'};
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}
async function body(req){let count=0,parts=[];for await(const data of req){count+=data.length;if(count>32768)throw Object.assign(new Error('Body too large'),{status:413,code:'limit'});parts.push(data);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const host=req.headers.host||'';
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)){json(res,403,{ok:false,error:{code:'host'}});return;}
    const origin=req.headers.origin;
    if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin)){json(res,403,{ok:false,error:{code:'origin'}});return;}
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(url.pathname==='/api/reception'){
      if(req.method!=='POST'){json(res,405,{ok:false,error:{code:'method'}});return;}
      if(!String(req.headers['content-type']||'').startsWith('application/json')){json(res,415,{ok:false,error:{code:'content-type'}});return;}
      const input=await body(req);if(input.op==='start')input.studentKey=identity.studentKey;
      const result=await service.handle(input,identity);json(res,200,result);return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/'){res.writeHead(302,{Location:'/apps/reception/ai-demo.html'});res.end();return;}
    let name;try{name=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end();return;}
    if(name.includes('\0')){res.writeHead(400);res.end();return;}
    const filename=await realpath(path.resolve(site,'.'+name));
    if(!filename.startsWith(site+path.sep)||(await stat(filename)).isDirectory()){res.writeHead(404);res.end();return;}
    const bytes=await readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){
    if(res.headersSent){res.end();return;}
    if(['ENOENT','ENOTDIR'].includes(error.code)){res.writeHead(404);res.end();return;}
    const status=Number(error.status)||400;
    json(res,status,{ok:false,error:{code:error.code||'invalid-request'}});
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`Reception local workbench: http://127.0.0.1:${port}/apps/reception/ai-demo.html\nProvider: ${mode}; ${cases.length} cases; loopback only. Mock replies are transport fixtures, not a quality evaluation of GPT-6 Luna.`));
for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>server.close(()=>process.exit(0)));
