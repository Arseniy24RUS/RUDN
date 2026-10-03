/** Import only reviewed runtime files from the Settlements production source. */
import {readFile,writeFile,readdir,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,relative,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=join(repo,'site/apps/settlements/runtime');
const manifestPath=join(repo,'site/apps/settlements/source-manifest.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=process.argv.slice(2),check=args.includes('--check');
if(check){
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  for(const entry of manifest.files){if(hash(await readFile(join(target,entry.path)))!==entry.sha256)throw Error(`Settlements runtime mismatch: ${entry.path}`);}
  for(const entry of manifest.protectedFiles){if(hash(await readFile(join(target,entry.path)))!==entry.sha256)throw Error(`Protected data mismatch: ${entry.path}`);}
  console.log(JSON.stringify({status:'pass',files:manifest.files.length,protectedFiles:manifest.protectedFiles.length,sourceHash:manifest.sourceHash}));
}else{
  const argument=args[args.indexOf('--source')+1];
  if(!args.includes('--source')||!argument)throw Error('Usage: node scripts/sync-settlements.mjs --source <production-kit> | --check');
  const source=resolve(argument),site=join(source,'game/site');
  const roots=['assets/js/settlements/v2','assets/js/settlements/v24','assets/img/settlements','assets/geodata','data/settlements','assets/css/settlements-v24.css'];
  const files=[];
  async function visit(path){const info=await stat(path);if(info.isDirectory()){for(const name of (await readdir(path)).sort())await visit(join(path,name));return;}
    const name=relative(site,path).replaceAll('\\','/');
    if(/\.(?:woff2?|ttf|otf|pyc|map)$/.test(name)||name.endsWith('/entry.mjs'))return;
    if(!/\.(?:mjs|js|json|gz|geojson|webp|png|jpg|jpeg|svg|css|txt|md)$/.test(name)&&!name.endsWith('/LICENSE'))return;
    const bytes=await readFile(path),destination=join(target,name);await mkdir(dirname(destination),{recursive:true});await copyFile(path,destination);
    files.push({path:name,bytes:bytes.length,sha256:hash(bytes)});
  }
  for(const root of roots)await visit(join(site,root));
  const protectedSource=JSON.parse(await readFile(join(source,'baseline/data-sha256.json'),'utf8'));
  const protectedFiles=Object.entries(protectedSource.files).map(([path,sha256])=>({path:path.replace(/^site\//,''),sha256}));
  for(const entry of protectedFiles)if(hash(await readFile(join(target,entry.path)))!==entry.sha256)throw Error(`Protected source changed: ${entry.path}`);
  files.sort((a,b)=>a.path.localeCompare(b.path));
  const manifest={moduleVersion:'1.0',origin:'RUDN-Settlements-Codex-Production-Kit/game/site',sourceHash:hash(JSON.stringify(files)),files,protectedFiles};
  await mkdir(dirname(manifestPath),{recursive:true});await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({status:'pass',files:files.length,protectedFiles:protectedFiles.length,bytes:files.reduce((n,f)=>n+f.bytes,0),sourceHash:manifest.sourceHash}));
}
