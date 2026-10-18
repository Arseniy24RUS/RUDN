/** Real authored transport records, with a synthetic localhost HTTP boundary. */
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,dirname,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseTransportRecord} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-fetch.mjs';
import {transportContentHash} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v1.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=resolve(root,'site');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const engine=arg('--browser','webkit'),output=resolve(arg('--output',resolve(root,'../evidence/runs/20261018-platform-observability/adapters/transport-'+engine)));
const prefix='/apps/settlements/runtime/assets/js/settlements/v24/',folder=resolve(site,'.'+prefix+'transport-policy-v2-regions');
const files=await Promise.all((await readdir(folder)).filter(name=>name.endsWith('.mjs')).map(async name=>{
 const path=resolve(folder,name),text=await readFile(path,'utf8'),record=(await import(pathToFileURL(path).href)).DISTANCE_TRANSPORT_RECORD;
 assert.deepEqual(parseTransportRecord(text),record,name+' retains the canonical record');
 const sha256=createHash('sha256').update(JSON.stringify(record)).digest('hex');
 assert.equal(transportContentHash(JSON.stringify(record)),sha256,name+' synchronous hash matches node:crypto');
 return {name,bytes:Buffer.byteLength(text),sha256};
}));
files.sort((a,b)=>b.bytes-a.bytes);
const valid=['export const DISTANCE_TRANSPORT_RECORD=Object.freeze([]);','\ufeff \t// source\r\n /* first */ /* second\nline */ export \n const\tDISTANCE_TRANSPORT_RECORD = Object.freeze( [1,{"text":") ; // /*"}] ) ;\n'];
const invalid=['exportconst DISTANCE_TRANSPORT_RECORD=Object.freeze([]);','export constDISTANCE_TRANSPORT_RECORD=Object.freeze([]);','export const OTHER=Object.freeze([]);','export const DISTANCE_TRANSPORT_RECORD=Object.freeze({});','export const DISTANCE_TRANSPORT_RECORD=Object.freeze([]); run();','export const DISTANCE_TRANSPORT_RECORD=Object.freeze([]);;','export const DISTANCE_TRANSPORT_RECORD=Object.freeze(([]));','export const DISTANCE_TRANSPORT_RECORD=Object.freeze([]) // trailing','/* unclosed export const DISTANCE_TRANSPORT_RECORD=Object.freeze([]);','export const DISTANCE_TRANSPORT_RECORD=Object.freeze([1,]);'];
const vectors=['','abc','Русский текст · 中文 · 😀',...Array.from({length:12},(_,i)=>'a'.repeat(54+i)),'a'.repeat(1_000_000)].map(text=>({text,sha256:createHash('sha256').update(text).digest('hex')}));
for(const vector of vectors)assert.equal(transportContentHash(vector.text),vector.sha256);
for(const text of valid)assert.ok(Array.isArray(parseTransportRecord(text)));
for(const text of invalid)assert.throws(()=>parseTransportRecord(text));
const report={engine,status:'fail',records:files.length,largest:files[0],stage:'start',phases:[],errors:[]};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Transport parser regression</title><main>Actual authored records</main>');return;}const path=resolve(site,'.'+url.pathname);if(!path.startsWith(site+sep)||(await stat(path)).isDirectory())throw Error('missing');res.writeHead(200,{'Content-Type':extname(path)==='.mjs'||extname(path)==='.js'?'text/javascript':'application/octet-stream'});res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser;
try{
 const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href:'playwright');
 browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});report.version=browser.version();
 const page=await browser.newPage();page.on('crash',()=>{report.crashed=true;});page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.text().startsWith('PARSER_PHASE:')){report.phases.push(message.text());console.log(message.text());}});
 await page.goto('http://127.0.0.1:'+server.address().port);report.stage='real-records';
 const results=await page.evaluate(async({files,prefix,valid,invalid,vectors})=>{
  const {parseTransportRecord}=await import(prefix+'transport-policy-fetch.mjs'),{transportContentHash}=await import(prefix+'transport-policy-v1.mjs');const results=[];
  for(const file of files){
   const text=await fetch(prefix+'transport-policy-v2-regions/'+file.name).then(response=>response.text());console.debug('PARSER_PHASE:before:'+file.name);
   const record=parseTransportRecord(text);console.debug('PARSER_PHASE:after:'+file.name);
   console.debug('PARSER_PHASE:hash-before:'+file.name);
   const sha256=transportContentHash(JSON.stringify(record));console.debug('PARSER_PHASE:hash-after:'+file.name);
   results.push({name:file.name,sha256});
  }
  for(const text of valid)if(!Array.isArray(parseTransportRecord(text)))throw Error('Valid wrapper rejected');
  for(const text of invalid){let rejected=false;try{parseTransportRecord(text);}catch{rejected=true;}if(!rejected)throw Error('Malformed wrapper accepted');}
  for(const vector of vectors)if(transportContentHash(vector.text)!==vector.sha256)throw Error('SHA-256 vector mismatch');
  return results;
 },{files,prefix,valid,invalid,vectors});
 assert.deepEqual(results,files.map(({name,sha256})=>({name,sha256})));assert.deepEqual(report.errors,[]);report.status='pass';report.stage='complete';report.wrapperCases={valid:valid.length,invalid:invalid.length};report.hashVectors=vectors.length;
}catch(error){report.failure={message:error.message,stage:report.stage};process.exitCode=1;}
finally{await browser?.close();await new Promise(done=>server.close(done));await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
