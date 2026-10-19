/** Real authored transport records, with a synthetic localhost HTTP boundary. */
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,dirname,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {parseTransportRecord} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-fetch.mjs';
import {transportContentHash,transportWorldDefinition} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v1.mjs';
import {loadDistanceTransportPolicy} from '../site/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {World} from '../site/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
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
assert.equal(vectors[0].sha256,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
assert.equal(vectors[1].sha256,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(vectors.at(-1).sha256,'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
for(const vector of vectors)assert.equal(transportContentHash(vector.text),vector.sha256);
for(const text of valid)assert.ok(Array.isArray(parseTransportRecord(text)));
for(const text of invalid)assert.throws(()=>parseTransportRecord(text));
const worldCases=[];
for(const id of ['chelyabinskaya_oblast','tverskaya_oblast']){
 const data=resolve(site,'apps/settlements/runtime/data/settlements/v1'),read=async kind=>JSON.parse(gunzipSync(await readFile(resolve(data,kind,id+'.json.gz'))));
 const [pack,network]=await Promise.all([read('regions'),read('transport')]),world=new World(pack,network);
 const record=(await import(pathToFileURL(resolve(folder,id+'.mjs')).href)).DISTANCE_TRANSPORT_RECORD,definition=transportWorldDefinition(world);
 const expected={id,worldHash:record[1],keysHash:record[2],count:record[3],fingerprint:record[0]};
 assert.equal(definition.worldHash,expected.worldHash);assert.equal(definition.keysHash,expected.keysHash);assert.equal(definition.keys.length,expected.count);
 assert.equal((await loadDistanceTransportPolicy(world)).fingerprint,expected.fingerprint);
 const changed=new World(pack,network);changed.rows[0].lon+=.001;
 await assert.rejects(loadDistanceTransportPolicy(changed),/Исходный граф не соответствует/);
 worldCases.push(expected);
}
const report={engine,status:'fail',records:files.length,largest:files[0],stage:'start',phases:[],errors:[]};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Transport parser regression</title><main>Actual authored records</main>');return;}const path=resolve(site,'.'+url.pathname);if(!path.startsWith(site+sep)||(await stat(path)).isDirectory())throw Error('missing');res.writeHead(200,{'Content-Type':extname(path)==='.mjs'||extname(path)==='.js'?'text/javascript':'application/octet-stream'});res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser;
try{
 const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href:'playwright');
 browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});report.version=browser.version();
 const page=await browser.newPage();page.on('crash',()=>{report.crashed=true;});page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.text().startsWith('PARSER_PHASE:')){report.phases.push(message.text());console.log(message.text());}});
 await page.goto('http://127.0.0.1:'+server.address().port);report.stage='real-records';
 const results=await page.evaluate(async({files,prefix,valid,invalid,vectors,worldCases})=>{
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
  const {loadRegion}=await import(prefix+'../v2/data.mjs'),{World}=await import(prefix+'../v2/engine.mjs'),{transportWorldDefinition}=await import(prefix+'transport-policy-v1.mjs'),{loadDistanceTransportPolicy}=await import(prefix+'transport-policy-v2.mjs');
  for(const expected of worldCases){
   const {pack,network}=await loadRegion(expected.id,{includeMissions:false}),world=new World(pack,network),definition=transportWorldDefinition(world);
   if(definition.worldHash!==expected.worldHash||definition.keysHash!==expected.keysHash||definition.keys.length!==expected.count)throw Error('Canonical world definition changed');
   if((await loadDistanceTransportPolicy(world)).fingerprint!==expected.fingerprint)throw Error('Canonical transport fingerprint changed');
   const changed=new World(pack,network);changed.rows[0].lon+=.001;let rejected=false;
   try{await loadDistanceTransportPolicy(changed);}catch(error){rejected=error.message.includes('Исходный граф не соответствует');}
   if(!rejected)throw Error('Changed source graph accepted');
   if(expected.id==='chelyabinskaya_oblast')window.qaTransport={pack,network};
  }
  return results;
 },{files,prefix,valid,invalid,vectors,worldCases});
 assert.deepEqual(results,files.map(({name,sha256})=>({name,sha256})));
 const tampered=(await readFile(resolve(folder,'chelyabinskaya_oblast.mjs'),'utf8')).replace(/sha256:[a-f0-9]{64}/,'sha256:'+'0'.repeat(64));
 await page.route('**/transport-policy-v2-regions/chelyabinskaya_oblast.mjs*',route=>route.fulfill({status:200,contentType:'text/javascript',body:tampered}));
 assert.equal(await page.evaluate(async prefix=>{const {World}=await import(prefix+'../v2/engine.mjs'),{loadDistanceTransportPolicy}=await import(prefix+'transport-policy-v2.mjs');try{await loadDistanceTransportPolicy(new World(qaTransport.pack,qaTransport.network));return false;}catch(error){return error.message.includes('Контрольная сумма региональных расстояний');}},prefix),true,'Tampered record remains rejected');
 assert.deepEqual(report.errors,[]);report.status='pass';report.stage='complete';report.wrapperCases={valid:valid.length,invalid:invalid.length};report.hashVectors=vectors.length;report.worldCases=worldCases.map(value=>value.id);report.tamperedChecksumRejected=true;
}catch(error){report.failure={message:error.message,stage:report.stage};process.exitCode=1;}
finally{await browser?.close();await new Promise(done=>server.close(done));await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
