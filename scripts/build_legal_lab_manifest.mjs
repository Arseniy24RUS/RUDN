// Deterministic release metadata. Run after a reviewed corpus/UI change.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,extname} from 'node:path';
import assert from 'node:assert/strict';
const moduleRoot=fileURLToPath(new URL('../site/apps/legal-lab/',import.meta.url));
const check=process.argv.includes('--check');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const catalogPath=resolve(moduleRoot,'data/catalog.json');
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
for(const meta of catalog.documents){
  const path=resolve(moduleRoot,'data',meta.file);
  assert.ok(path.startsWith(resolve(moduleRoot,'data')+'/')||path.startsWith(resolve(moduleRoot,'data')+'\\'),'Document stays in module data');
  meta.fileSha256=sha(await readFile(path));
}
async function save(path,text){if(check)assert.equal(await readFile(path,'utf8'),text,`Stale release metadata: ${relative(moduleRoot,path)}`);else await writeFile(path,text);}
await save(catalogPath,json(catalog));
const files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())await walk(path);else if(entry.isFile()&&entry.name!=='precache-manifest.json'){
  const rel=relative(moduleRoot,path).replaceAll('\\','/');
  if(!/^(assets\/|data\/|lib\/|locales\/)|^(entry\.mjs|platform\.mjs|style\.css|demo\.html)$/.test(rel))continue;
  const bytes=await readFile(path);
  if(['.json','.mjs','.html','.css'].includes(extname(path)))assert.equal(bytes.includes(13),false,`Release text must use LF: ${rel}`);
  files.push({url:'apps/legal-lab/'+rel,bytes:bytes.length,sha256:sha(bytes)});
}}}
await walk(moduleRoot);files.sort((a,b)=>a.url.localeCompare(b.url,'en'));
await save(resolve(moduleRoot,'precache-manifest.json'),json({module:'legal-lab',contentVersion:catalog.contentVersion,base:'site-root-relative',files,totalBytes:files.reduce((n,f)=>n+f.bytes,0),policy:'On-demand module cache through the course service worker; never cache auth/API responses here.'}));
console.log(JSON.stringify({mode:check?'verify':'build',contentVersion:catalog.contentVersion,files:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0)}));
