import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
export const LEGACY_BASELINE={runId:39135557270,artifactId:12140617647,artifactName:'platform-legacy-baseline-ae6f32e1324437ed30ee15bb930518aa1b267755',zipSha256:'fef98cc280cf3b0b3f5534bedc5959db383176102c947e24a822009a65360e99'};
export function run(command,args,{capture=false}={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',()=>reject(new Error('release/process-unavailable:'+command)));child.on('close',code=>code===0?resolve(capture?stdout:null):reject(new Error('release/process-failed:'+command+':'+code)));});}
async function downloadFile(command,args,file){
  const child=spawn(command,args,{stdio:['ignore','pipe','ignore'],windowsHide:true});
  const closed=new Promise((resolve,reject)=>{child.once('error',()=>reject(new Error('release/process-unavailable:'+command)));child.once('close',code=>code===0?resolve():reject(new Error('release/process-failed:'+command+':'+code)));});
  const streamed=pipeline(child.stdout,createWriteStream(file,{flags:'wx'}));
  try{await Promise.all([streamed,closed]);}
  catch(error){child.kill();await Promise.allSettled([streamed,closed]);await fs.rm(file,{force:true});throw error;}
}
export async function unpack(archive,out){
  const list=await run('tar',['-tf',archive],{capture:true});for(const name of list.split(/\r?\n/).filter(Boolean))if(/(^\/|^[A-Za-z]:|(^|\/)\.\.($|\/)|\\)/.test(name))throw new Error('release/unsafe-archive');
  const details=await run('tar',['-tvf',archive],{capture:true});if(details.split(/\r?\n/).some(line=>/^[lh]/.test(line)))throw new Error('release/archive-links-forbidden');
  await fs.mkdir(out,{recursive:true});await run('tar',['-xf',archive,'-C',out]);
}
async function sha(file){const handle=await fs.open(file);const digest=crypto.createHash('sha256');for await(const chunk of handle.createReadStream())digest.update(chunk);return digest.digest('hex');}
export async function verifyLegacyArchive(zip){
  if(await sha(zip)!==LEGACY_BASELINE.zipSha256)throw new Error('release/legacy-baseline-checksum');
  return LEGACY_BASELINE.zipSha256;
}
export async function unpackLegacyBaseline(zip,out){
  await verifyLegacyArchive(zip);
  const archive=path.join(path.dirname(zip),'artifact.tar');
  // Extract only the reviewed member; never accept ZIP paths or another site.
  await run('python',['-c','import pathlib,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.namelist()==["artifact.tar"], "unexpected baseline ZIP members"\n with z.open("artifact.tar") as source, open(sys.argv[2],"xb") as target:\n  import shutil; shutil.copyfileobj(source,target)\n',zip,archive]);
  await unpack(archive,out);
  return {status:'pass',kind:'first-migration',runId:LEGACY_BASELINE.runId,archiveSha256:LEGACY_BASELINE.zipSha256,out};
}
export async function downloadLegacyArchive({repo,download,runCommand=run,downloadBinary=downloadFile}){
  const zip=path.join(download,'baseline.zip');
  try{await downloadBinary('gh',['api',`repos/${repo}/actions/artifacts/${LEGACY_BASELINE.artifactId}/zip`],zip);}
  catch{
    const listing=JSON.parse(await runCommand('gh',['api',`repos/${repo}/actions/artifacts?name=${LEGACY_BASELINE.artifactName}&per_page=100`],{capture:true}));
    const artifact=listing.artifacts?.find(item=>item.name===LEGACY_BASELINE.artifactName&&!item.expired);
    if(!artifact)throw new Error('release/reviewed-legacy-baseline-unavailable');
    await runCommand('gh',['run','download',String(artifact.workflow_run.id),'--repo',repo,'--name',LEGACY_BASELINE.artifactName,'--dir',download]);
  }
  return zip;
}
export async function readPublishedPointer(publishedURL='https://arseniy24rus.github.io/RUDN/',fetchImpl=fetch){
  const response=await fetchImpl(new URL('release.json',publishedURL),{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(response.ok){const pointer=await response.json();if(pointer.schema!==1||!/^[a-f0-9]{32}$/.test(pointer.current?.buildId||''))throw new Error('release/invalid-published-pointer');return pointer;}
  else if(response.status!==404)throw new Error('release/published-pointer-unavailable');
  return null;
}
export async function downloadBaseline({out,repo='Arseniy24RUS/RUDN',publishedURL='https://arseniy24rus.github.io/RUDN/'}){
  out=path.resolve(out);try{await fs.access(out);throw new Error('release/output-exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  const download=out+'-download';await fs.mkdir(download,{recursive:true});const pointer=await readPublishedPointer(publishedURL);
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
  const legacyZip=await downloadLegacyArchive({repo,download});
  // Legacy fallback is intentionally bounded to the reviewed publication. Once
  // a versioned pointer exists, its archive is mandatory and this path is closed.
  return unpackLegacyBaseline(legacyZip,out);
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
