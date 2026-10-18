import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';

const TOKEN='__RUDN_RELEASE_ID__', SCHEMA=1;
const controls=new Set(['index.html','service-worker.js','release.json','platform-baseline.json','platform-build-report.json']);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value)+'\n';
const fail=code=>{throw new Error(code);};
export function validateContracts(value){
  const version=n=>Number.isSafeInteger(n)&&n>0&&n<=65535;
  if(!value||value.schema!==1||Object.keys(value).sort().join(',')!=='adapterSnapshot,durableStore,modules,schema,updateEnvelope'||!['updateEnvelope','adapterSnapshot','durableStore'].every(key=>version(value[key]))||!value.modules||Array.isArray(value.modules))fail('release/invalid-contracts');
  const entries=Object.entries(value.modules);if(entries.length>32||!['platform','quiz','form','maps','legal-lab','career','reception','settlements','governor'].every(key=>version(value.modules[key]))||!entries.every(([key,v])=>/^[a-z][a-z0-9-]{0,31}$/.test(key)&&version(v)))fail('release/invalid-contracts');
  return value;
}
const directories=new Map();
async function ensureDirectory(dir){dir=path.resolve(dir);if(!directories.has(dir)){const task=(async()=>{try{if((await fs.stat(dir)).isDirectory())return;throw new Error('release/directory-is-file');}catch(error){if(error.code!=='ENOENT')throw error;}const parent=path.dirname(dir);if(parent!==dir)await ensureDirectory(parent);try{await fs.mkdir(dir);}catch(error){if(error.code!=='EEXIST')throw error;}})();directories.set(dir,task);}return directories.get(dir);}
async function parallel(items,fn,limit=8){let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const index=next++;await fn(items[index],index);}}));}
export function isRuntime(name){return /\.(?:html|css|m?js)$/.test(name)&&name!=='service-worker.js'&&!/\/social-plans-regions\/[^/]+-(?:easy|normal|hard)\.mjs$/.test(name);}
async function inventory(root){
  const result={},names=[];
  async function walk(dir,prefix=''){
    for(const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      const name=prefix+item.name;if(item.isSymbolicLink())fail('release/symlink:'+name);
      if(item.isDirectory()){if(!['_releases','_objects','.git'].includes(item.name))await walk(path.join(dir,item.name),name+'/');continue;}
      if(item.isFile())names.push(name);
    }
  }
  await walk(root);names.sort();const entries=[];await parallel(names,async(name,index)=>{const bytes=await fs.readFile(path.join(root,name));entries[index]=[name,{sha256:digest(bytes),bytes:bytes.length}];});return Object.fromEntries(entries);
}
async function put(root,name,bytes){const target=path.join(root,name);await ensureDirectory(path.dirname(target));await fs.writeFile(target,bytes);}
async function copy(source,out,name){await ensureDirectory(path.dirname(path.join(out,name)));await fs.copyFile(path.join(source,name),path.join(out,name));}
function safeName(name){return typeof name==='string'&&!name.startsWith('/')&&!name.split('/').some(x=>x==='..'||x==='')&&!name.includes('\\');}
function sitePath(url,base){const parsed=new URL(url,'https://release.invalid'+base);if(parsed.origin!=='https://release.invalid'||!parsed.pathname.startsWith(base))fail('release/resource-outside-site');return decodeURIComponent(parsed.pathname.slice(base.length));}
function resolveStatic(value,logical,resources,base){
  if(!value||/^(?:#|data:|blob:|mailto:|tel:|javascript:|https?:|\/\/)/i.test(value))return value;
  const resolved=new URL(value,'https://release.invalid'+base+logical);
  if(!resolved.pathname.startsWith(base))return value;
  let name=decodeURIComponent(resolved.pathname.slice(base.length));if(name.endsWith('/'))name+='index.html';
  const target=resources[name];return target?target.url+resolved.search+resolved.hash:value;
}
function rewriteCSS(source,logical,resources,base){return source.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g,(_,quote,url)=>`url(${quote}${resolveStatic(url,logical,resources,base)}${quote})`);}
function rewriteHTML(source,logical,resources,base,inlineModules){
  if(!/<html\b/i.test(source))return rewriteCSS(source.replace(/\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi,(full,key,quote,value)=>`${key}=${quote}${resolveStatic(value,logical,resources,base)}${quote}`),logical,resources,base);
  const plan=[];
  let html=source.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(full,attrs,text)=>{
    const type=/\btype\s*=\s*['"]([^'"]+)['"]/i.exec(attrs)?.[1]||'';
    if(type&&!['module','text/javascript','application/javascript'].includes(type))return full;
    const src=/\bsrc\s*=\s*['"]([^'"]+)['"]/i.exec(attrs)?.[1];
    if(/data-platform-(?:bootstrap|diagnostics)/.test(attrs))return '';
    const entry={type};if(src)entry.src=resolveStatic(src,logical,resources,base);else if(type==='module'){const name=`${logical}.inline-${plan.length}.mjs`;resources[name]={kind:'runtime',sha256:digest(text),bytes:Buffer.byteLength(text),url:`${base}_releases/${TOKEN}/${name}`};inlineModules.set(name,text);entry.src=resources[name].url;}else entry.text=text;plan.push(entry);return '';
  });
  if(logical==='index.html'&&!plan.length)plan.push({type:'module',src:resources['assets/js/main.js'].url});
  html=html.replace(/\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi,(full,key,quote,value)=>`${key}=${quote}${resolveStatic(value,logical,resources,base)}${quote}`);
  html=rewriteCSS(html,logical,resources,base).replace(/<html\b([^>]*)>/i,(_,attrs)=>`<html${attrs.replace(/\sdata-release-build=["'][^"']*["']/g,'')} data-release-build="${TOKEN}">`);
  const bootstrap=`<script id="platform-entry-scripts" type="application/json">${JSON.stringify(plan).replace(/</g,'\\u003c')}</script>\n<script src="${resources['assets/js/diagnostics-bootstrap.js'].url}" data-platform-diagnostics></script>\n<script type="module" src="${resources['assets/js/release-bootstrap.js'].url}" data-platform-bootstrap></script>`;
  return /<\/body\s*>/i.test(html)?html.replace(/<\/body\s*>/i,bootstrap+'\n</body>'):html+'\n'+bootstrap;
}
function packsFor(resources){
  const packs={shell:[]};for(const mod of ['legal-lab','settlements','governor','career','reception','puzzle'])packs[mod]=[];
  for(const [name,item] of Object.entries(resources)){
    if(name==='index.html'||name==='manifest.webmanifest'||/^assets\/img\/(?:rudn-logo(?:-en)?|icon-192|icon-512)\.png$/.test(name)||(item.kind==='runtime'&&!name.startsWith('apps/'))||/^data\/(?:platform-contracts|course|questions|exam_questions|question_media|symbol_manifest|legacy-en|legacy-zh)\.json$/.test(name)||name==='apps/legal-lab/data/catalog.json')packs.shell.push(name);
    for(const mod of Object.keys(packs).filter(x=>x!=='shell')){
      const prefix=mod==='puzzle'?'assets/puzzle/':`apps/${mod}/`;
      if((name.startsWith(prefix)&&item.kind==='runtime')||(mod==='puzzle'&&name==='apps/puzzle.html'))packs[mod].push(name);
      if(name.startsWith(prefix)&&/\.json$/.test(name)&&item.bytes<=512*1024&&!/(?:\/reader\/|\/translations\/|\/documents\/|\/chunks\/|\/data\/regions\/)/.test(name))packs[mod].push(name);
    }
  }
  for(const pack of Object.values(packs)){pack.sort();}return packs;
}
export async function verifyRelease(out,{budget=1_000_000_000}={}){
  const pointer=JSON.parse(await fs.readFile(path.join(out,'release.json'),'utf8')), baseline=JSON.parse(await fs.readFile(path.join(out,'platform-baseline.json'),'utf8'));
  if(pointer.schema!==SCHEMA)fail('release/pointer-schema');const base=baseline.sitePath,verified=new Map(),unreachableImports=[];
  if(baseline.baselineId!==digest(json(baseline.files)))fail('release/baseline-identity');
  async function verify(name,expected){if(!safeName(name))fail('release/unsafe-path');const bytes=await fs.readFile(path.join(out,name));if(bytes.length!==expected.bytes||digest(bytes)!==expected.sha256)fail('release/integrity:'+name);verified.set(name,{bytes:bytes.length,sha256:expected.sha256});return bytes;}
  await parallel(Object.entries(baseline.files),async([name,entry])=>verify(name,entry));
  for(const target of [pointer.current,pointer.previous].filter(Boolean)){
    const manifestPath=sitePath(target.manifestURL,base),bytes=await fs.readFile(path.join(out,manifestPath));if(digest(bytes)!==target.manifestSha256)fail('release/manifest-integrity');
    const manifest=JSON.parse(bytes);if(manifest.buildId!==target.buildId)fail('release/build-mismatch');if(manifest.baselineId!==baseline.baselineId)fail('release/baseline-mismatch');
    validateContracts(manifest.contracts);
    const contractResource=manifest.resources?.['data/platform-contracts.json'];if(!contractResource)fail('release/contracts-missing');
    const sourceContracts=validateContracts(JSON.parse(await verify(sitePath(contractResource.url,base),contractResource)));if(JSON.stringify(sourceContracts)!==JSON.stringify(manifest.contracts))fail('release/contracts-content');
    const identity=crypto.createHash('sha256').update(`schema:${SCHEMA}\nbase:${base}\nbaseline:${manifest.baselineId}\n`),runtimeTexts=new Map(),canonicalHashes=new Map();
    await parallel(Object.entries(manifest.resources),async([name,entry])=>{
      if(!safeName(name))fail('release/unsafe-logical-path');const physical=sitePath(entry.url,base),prior=verified.get(physical);if(prior&&(prior.bytes!==entry.bytes||prior.sha256!==entry.sha256))fail('release/conflicting-reference:'+name);if(!prior)await verify(physical,entry);
      if(entry.kind==='runtime'&&!physical.startsWith(`_releases/${target.buildId}/`))fail('release/mutable-runtime');
      if(entry.kind==='runtime')runtimeTexts.set(name,await fs.readFile(path.join(out,physical),'utf8'));
      canonicalHashes.set(name,entry.kind==='runtime'?digest(runtimeTexts.get(name).replaceAll(target.buildId,TOKEN)):entry.sha256);
    });
    for(const name of Object.keys(manifest.resources))identity.update(name+'\0'+canonicalHashes.get(name)+'\n');
    if(!/^[a-f0-9]{64}$/.test(manifest.workerTemplateSha256||'')||identity.update(manifest.workerTemplateSha256).digest('hex').slice(0,32)!==target.buildId)fail('release/build-identity');
    if(target===pointer.current){const worker=await fs.readFile(path.join(out,'service-worker.js'),'utf8'),template=worker.replace(/^const PLATFORM_RELEASE=.*;$/m,'const PLATFORM_RELEASE=null;');if(digest(template)!==manifest.workerTemplateSha256)fail('release/worker-integrity');}
    for(const names of Object.values(manifest.packs))for(const name of names)if(!manifest.resources[name])fail('release/unknown-pack-resource');
    const graph=new Map(),roots=new Set(Object.keys(manifest.resources).filter(name=>name==='assets/js/main.js'||/(?:^|\/)entry\.mjs$/.test(name)));
    for(const [name,item] of Object.entries(manifest.resources).filter(([n,e])=>e.kind==='runtime'&&/\.html$/.test(n))){
      const html=runtimeTexts.get(name),plan=/<script id="platform-entry-scripts" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      for(const entry of plan?JSON.parse(plan[1]):[])if(entry.src){const physical=sitePath(entry.src.split(/[?#]/)[0],base);const found=Object.entries(manifest.resources).find(([,value])=>sitePath(value.url,base)===physical);if(found)roots.add(found[0]);else fail('release/unpinned-html-entry:'+name);}
    }
    // Parse rather than scan minified strings. Besides static ES declarations,
    // include literal import() and new URL('worker.mjs', import.meta.url) edges.
    for(const [name,item] of Object.entries(manifest.resources).filter(([n,e])=>e.kind==='runtime'&&/\.m?js$/.test(n))){
      const text=runtimeTexts.get(name);
      let ast;try{ast=parse(text,{ecmaVersion:'latest',sourceType:'module'});}catch{ast=parse(text,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true});}
      const dependencies=[],stack=[ast];while(stack.length){const node=stack.pop();let value=null;
        if(/^(?:ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration|ImportExpression)$/.test(node.type))value=node.source?.value;
        const urlBase=node.type==='NewExpression'&&node.arguments?.[1];
        if(node.type==='NewExpression'&&node.callee?.name==='URL'&&urlBase?.type==='MemberExpression'&&urlBase.object?.type==='MetaProperty'&&urlBase.object.meta?.name==='import'&&urlBase.property?.name==='url'&&/\.m?js(?:[?#]|$)/.test(node.arguments[0]?.value||'')&&!/(?:^|\/)service-worker\.js(?:[?#]|$)/.test(node.arguments[0]?.value||''))value=node.arguments[0]?.value;
        if(typeof value==='string'&&value.startsWith('.'))dependencies.push(path.posix.normalize(path.posix.join(path.posix.dirname(name),value.split(/[?#]/)[0])));
        for(const child of Object.values(node)){if(Array.isArray(child)){for(const element of child)if(element&&typeof element.type==='string')stack.push(element);}else if(child&&typeof child==='object'&&typeof child.type==='string')stack.push(child);}
      }
      graph.set(name,[...new Set(dependencies)]);
    }
    const reachable=new Set(),pending=[...roots];while(pending.length){const name=pending.pop();if(reachable.has(name))continue;reachable.add(name);for(const dependency of graph.get(name)||[]){if(!manifest.resources[dependency]||manifest.resources[dependency].kind!=='runtime')fail('release/unpinned-static-import:'+name+':'+dependency);pending.push(dependency);}}
    for(const [name,dependencies] of graph)if(!reachable.has(name))for(const dependency of dependencies)if(!manifest.resources[dependency])unreachableImports.push({buildId:target.buildId,source:name,target:dependency});
  }
  let totalBytes=0;const dirs=[out],files=[],sizes=[];while(dirs.length){const batch=dirs.splice(0,8);await parallel(batch,async dir=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())dirs.push(p);else files.push(p);}});}await parallel(files,async(file,index)=>{sizes[index]=(await fs.stat(file)).size;});totalBytes=sizes.reduce((sum,value)=>sum+value,0);const fileCount=files.length;
  if(totalBytes>budget)fail(`release/budget:${totalBytes}>${budget}`);
  return {status:'pass',schema:SCHEMA,buildId:pointer.current.buildId,previous:pointer.previous?.buildId||null,totalBytes,fileCount,budget,unreachableImports};
}
export async function buildRelease({site,baseline:baselineDir,out,sitePath:base='/RUDN/',budget=1_000_000_000,verify=true,onProgress=()=>{}}){
  site=path.resolve(site);baselineDir=path.resolve(baselineDir);out=path.resolve(out);
  if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))fail('release/invalid-site-path');
  for(const source of [site,baselineDir])if(out===source||out.startsWith(source+path.sep)||source.startsWith(out+path.sep))fail('release/output-overlaps-source');
  try{await fs.access(out);fail('release/output-exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  onProgress('inventory-source');const source=await inventory(site);onProgress('inventory-baseline');const baselineSource=await inventory(baselineDir);
  for(const required of ['index.html','service-worker.js','assets/js/main.js','assets/js/release-bootstrap.js','assets/js/release-resources.js','assets/js/diagnostics-bootstrap.js','data/platform-contracts.json'])if(!source[required])fail('release/missing-source:'+required);
  const contracts=validateContracts(JSON.parse(await fs.readFile(path.join(site,'data/platform-contracts.json'),'utf8')));
  let oldRegistry=null,oldPointer=null;try{oldRegistry=JSON.parse(await fs.readFile(path.join(baselineDir,'platform-baseline.json'),'utf8'));oldPointer=JSON.parse(await fs.readFile(path.join(baselineDir,'release.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(oldRegistry&&oldRegistry.sitePath!==base)fail('release/baseline-scope');
  const frozen=oldRegistry?.files||Object.fromEntries(Object.entries(baselineSource).filter(([name])=>!controls.has(name)));
  if(Object.keys(frozen).some(name=>!safeName(name)))fail('release/unsafe-baseline-path');
  const baselineId=oldRegistry?.baselineId||digest(json(frozen));
  const resources={};for(const [name,item] of Object.entries(source)){
    if(controls.has(name)&&name!=='index.html')continue;
    const runtime=isRuntime(name),same=!runtime&&frozen[name]?.sha256===item.sha256;
    const ext=name.endsWith('.json.gz')?'.json.gz':path.posix.extname(name);
    resources[name]={...item,kind:runtime?'runtime':'resource',url:runtime?`${base}_releases/${TOKEN}/${name}`:same?base+name:`${base}_objects/${item.sha256}${ext}`};
  }
  onProgress('transform-runtime');const runtime=new Map();for(const [name,item] of Object.entries(resources))if(item.kind==='runtime'){
    let text=await fs.readFile(path.join(site,name),'utf8');if(/\.html$/.test(name))text=rewriteHTML(text,name,resources,base,runtime);else if(/\.css$/.test(name))text=rewriteCSS(text,name,resources,base);runtime.set(name,text);
  }
  const inputHash=crypto.createHash('sha256').update(`schema:${SCHEMA}\nbase:${base}\nbaseline:${baselineId}\n`);
  for(const [name,item] of Object.entries(resources))inputHash.update(name+'\0'+(runtime.has(name)?digest(runtime.get(name)):item.sha256)+'\n');
  inputHash.update(source['service-worker.js'].sha256);const buildId=inputHash.digest('hex').slice(0,32);
  onProgress('write-frozen-baseline');await ensureDirectory(out);
  await parallel(Object.entries(frozen),async([name,item])=>{if(baselineSource[name]?.sha256!==item.sha256)fail('release/frozen-baseline-mismatch:'+name);await copy(baselineDir,out,name);});
  let previous=oldPointer?.current?.buildId===buildId?oldPointer.previous||null:oldPointer?.current||null;
  if(previous){
    const previousManifest=JSON.parse(await fs.readFile(path.join(baselineDir,sitePath(previous.manifestURL,base)),'utf8'));
    for(const physical of new Set([...Object.values(previousManifest.resources).map(x=>sitePath(x.url,base)),sitePath(previous.manifestURL,base),`_releases/${previous.buildId}/release.json`])){
      if(frozen[physical])continue;await copy(baselineDir,out,physical);
    }
  }
  onProgress('write-runtime-and-objects');for(const [name,item] of Object.entries(resources)){
    item.url=item.url.replaceAll(TOKEN,buildId);const physical=sitePath(item.url,base);
    if(item.kind==='runtime'){const bytes=Buffer.from(runtime.get(name).replaceAll(TOKEN,buildId));item.bytes=bytes.length;item.sha256=digest(bytes);await put(out,physical,bytes);}
    else if(!frozen[physical])await copyResource(site,name,out,physical);
  }
  const manifest={schema:SCHEMA,buildId,baselineId,workerTemplateSha256:source['service-worker.js'].sha256,runtimeRoot:`${base}_releases/${buildId}/`,entryURL:`${base}_releases/${buildId}/index.html`,contracts,resources,packs:packsFor(resources)};
  const manifestBytes=json(manifest),target={buildId,manifestURL:`${base}_releases/${buildId}/manifest.json`,manifestSha256:digest(manifestBytes),entryURL:manifest.entryURL};
  await put(out,`_releases/${buildId}/manifest.json`,manifestBytes);await put(out,`_releases/${buildId}/release.json`,json(target));
  await put(out,'release.json',json({schema:SCHEMA,current:target,previous}));await put(out,'platform-baseline.json',json({schema:SCHEMA,baselineId,sitePath:base,files:frozen}));
  await put(out,'index.html',await fs.readFile(path.join(out,`_releases/${buildId}/index.html`)));
  let worker=await fs.readFile(path.join(site,'service-worker.js'),'utf8');if(!worker.includes('const PLATFORM_RELEASE=null;'))fail('release/worker-placeholder-missing');
  worker=worker.replace('const PLATFORM_RELEASE=null;',`const PLATFORM_RELEASE=${JSON.stringify({schema:SCHEMA,current:target,previous})};`);await put(out,'service-worker.js',worker);
  onProgress('verify-staging');let report=verify?await verifyRelease(out,{budget:budget-4096}):{status:'not-run',buildId};if(verify){const payloadBytes=report.totalBytes;report={...report,budget,fileCount:report.fileCount+1};for(let n=0;n<4;n++)report.totalBytes=payloadBytes+Buffer.byteLength(json(report));if(report.totalBytes>budget)fail('release/budget');}await put(out,'platform-build-report.json',json(report));return {...report,target,out};
}
async function copyResource(site,name,out,physical){await ensureDirectory(path.dirname(path.join(out,physical)));await fs.copyFile(path.join(site,name),path.join(out,physical));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
  try{if(!args.includes('--site')||!args.includes('--baseline')||!args.includes('--out'))fail('Usage: --site DIR --baseline PUBLISHED_DIR --out NEW_DIR [--site-path /RUDN/] [--verify]');console.log(JSON.stringify(await buildRelease({site:option('--site'),baseline:option('--baseline'),out:option('--out'),sitePath:args.includes('--site-path')?option('--site-path'):'/RUDN/',verify:true,onProgress:stage=>console.error('release/'+stage)}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
