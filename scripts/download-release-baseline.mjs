import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function run(command,args,{capture=false}={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',()=>reject(new Error('release/process-unavailable:'+command)));child.on('close',code=>code===0?resolve(capture?stdout:null):reject(new Error('release/process-failed:'+command+':'+code)));});}
export async function unpack(archive,out){
  const list=await run('tar',['-tf',archive],{capture:true});for(const name of list.split(/\r?\n/).filter(Boolean))if(/(^\/|^[A-Za-z]:|(^|\/)\.\.($|\/)|\\)/.test(name))throw new Error('release/unsafe-archive');
  const details=await run('tar',['-tvf',archive],{capture:true});if(details.split(/\r?\n/).some(line=>/^[lh]/.test(line)))throw new Error('release/archive-links-forbidden');
  await fs.mkdir(out,{recursive:true});await run('tar',['-xf',archive,'-C',out]);
}
async function sha(file){const handle=await fs.open(file);const digest=crypto.createHash('sha256');for await(const chunk of handle.createReadStream())digest.update(chunk);return digest.digest('hex');}
export async function downloadBaseline({out,repo='Arseniy24RUS/RUDN',publishedURL='https://arseniy24rus.github.io/RUDN/'}){
  out=path.resolve(out);try{await fs.access(out);throw new Error('release/output-exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  const download=out+'-download';await fs.mkdir(download,{recursive:true});let pointer=null;
  const response=await fetch(new URL('release.json',publishedURL),{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(response.ok){pointer=await response.json();if(pointer.schema!==1||!/^[a-f0-9]{32}$/.test(pointer.current?.buildId||''))throw new Error('release/invalid-published-pointer');}
  else if(response.status!==404)throw new Error('release/published-pointer-unavailable');
  if(pointer){
    const id=pointer.current.buildId,tag='platform-release-'+id,archiveName=tag+'.tar.gz';
    // The successful live pointer chooses the baseline; an un-deployed or older
    // "latest" release cannot silently become the next migration source.
    try{await run('gh',['release','download',tag,'--repo',repo,'--pattern',archiveName,'--pattern',archiveName+'.sha256','--dir',download]);}
    catch{const listing=JSON.parse(await run('gh',['api',`repos/${repo}/actions/artifacts?name=${tag}&per_page=100`],{capture:true}));const artifact=listing.artifacts?.find(x=>x.name===tag&&!x.expired);if(!artifact)throw new Error('release/successful-baseline-unavailable');await run('gh',['run','download',String(artifact.workflow_run.id),'--repo',repo,'--name',tag,'--dir',download]);}
    const archive=path.join(download,archiveName),expected=(await fs.readFile(archive+'.sha256','utf8')).trim().split(/\s+/)[0];if(!/^[a-f0-9]{64}$/.test(expected)||await sha(archive)!==expected)throw new Error('release/baseline-checksum');
    await unpack(archive,out);const recovered=JSON.parse(await fs.readFile(path.join(out,'release.json'),'utf8'));if(recovered.current.buildId!==id)throw new Error('release/baseline-build-mismatch');
    return {status:'pass',kind:'exact-release',buildId:id,archiveSha256:expected,out};
  }
  await run('gh',['run','download','39135557270','--repo',repo,'--name','github-pages','--dir',download]);await unpack(path.join(download,'artifact.tar'),out);
  // Legacy fallback is intentionally bounded to the reviewed publication. Once
  // a versioned pointer exists, its archive is mandatory and this path is closed.
  return {status:'pass',kind:'first-migration',runId:39135557270,out};
}
export async function seedBaselineCalendar(root,destination){
  root=path.resolve(root);const logical='assets/data/calendars/current.json';let source=path.join(root,logical),expected=null;
  let pointer;try{pointer=JSON.parse(await fs.readFile(path.join(root,'release.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(pointer){const registry=JSON.parse(await fs.readFile(path.join(root,'platform-baseline.json'),'utf8')),base=registry.sitePath;
    const local=value=>{const url=new URL(value,'https://release.invalid');if(url.origin!=='https://release.invalid'||!url.pathname.startsWith(base))throw new Error('release/calendar-path');const name=decodeURIComponent(url.pathname.slice(base.length)),result=path.resolve(root,name);if(name.includes('\\')||result===root||!result.startsWith(root+path.sep))throw new Error('release/calendar-path');return result;};
    const manifest=JSON.parse(await fs.readFile(local(pointer.current.manifestURL),'utf8')),entry=manifest.resources[logical];if(!entry)throw new Error('release/calendar-missing');source=local(entry.url);expected=entry;
  }
  if(expected){const stat=await fs.stat(source);if(stat.size!==expected.bytes||await sha(source)!==expected.sha256)throw new Error('release/calendar-integrity');}
  await fs.copyFile(source,destination);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];try{if(!args.includes('--out'))throw new Error('Usage: --out NEW_DIR [--repo OWNER/REPO] [--published-url URL] [--seed-calendar FILE]');const receipt=await downloadBaseline({out:option('--out'),repo:args.includes('--repo')?option('--repo'):undefined,publishedURL:args.includes('--published-url')?option('--published-url'):undefined});if(args.includes('--seed-calendar'))await seedBaselineCalendar(receipt.out,option('--seed-calendar'));console.log(JSON.stringify(receipt,null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
