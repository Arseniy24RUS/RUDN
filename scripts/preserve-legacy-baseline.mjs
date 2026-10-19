import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LEGACY_BASELINE,downloadLegacyArchive,readPublishedPointer,run,verifyLegacyArchive} from './download-release-baseline.mjs';

async function existingRunBackup(repo,runId,runCommand){
  for(let page=1;;page++){
    const listing=JSON.parse(await runCommand('gh',['api',`repos/${repo}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`],{capture:true}));
    if(!Array.isArray(listing.artifacts))throw new Error('release/invalid-artifact-list');
    const found=listing.artifacts.find(item=>item.name===LEGACY_BASELINE.artifactName&&!item.expired);
    if(found)return found;
    if(listing.artifacts.length<100)return null;
  }
}

// Only this previously published ZIP can be retained. The early CI job never
// builds, extracts or publishes a candidate site and never replaces an artifact.
export async function preserveLegacyBaseline({out,runId,repo='Arseniy24RUS/RUDN',publishedURL='https://arseniy24rus.github.io/RUDN/',fetchImpl=fetch,runCommand=run,downloadBinary,verifyArchive=verifyLegacyArchive}){
  if(!/^\d+$/.test(String(runId||'')))throw new Error('release/run-id-required');
  const pointer=await readPublishedPointer(publishedURL,fetchImpl);
  if(pointer)return {status:'pass',kind:'versioned-baseline',buildId:pointer.current.buildId,uploadRequired:false};
  out=path.resolve(out);await fs.mkdir(out);
  const existing=await existingRunBackup(repo,runId,runCommand);
  const archivePath=path.join(out,'baseline.zip');
  if(existing){
    await runCommand('gh',['run','download',String(runId),'--repo',repo,'--name',LEGACY_BASELINE.artifactName,'--dir',out]);
  }else{
    await downloadLegacyArchive({repo,download:out,runCommand,downloadBinary});
  }
  const archiveSha256=await verifyArchive(archivePath);
  if(archiveSha256!==LEGACY_BASELINE.zipSha256)throw new Error('release/legacy-baseline-checksum');
  return {status:'pass',kind:existing?'already-retained':'prepared-reviewed-backup',uploadRequired:!existing,artifactName:LEGACY_BASELINE.artifactName,archiveSha256,archivePath,runId:String(runId),...(existing?{artifactId:existing.id}:{})};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
  try{
    if(!args.includes('--out')||!args.includes('--run-id'))throw new Error('Usage: --out NEW_DIR --run-id ID [--repo OWNER/REPO] [--published-url URL]');
    const receipt=await preserveLegacyBaseline({out:option('--out'),runId:option('--run-id'),repo:args.includes('--repo')?option('--repo'):undefined,publishedURL:args.includes('--published-url')?option('--published-url'):undefined});
    if(process.env.GITHUB_OUTPUT){
      const fields={upload_required:String(receipt.uploadRequired),artifact_name:receipt.artifactName||'',archive_path:receipt.archivePath||''};
      if(Object.values(fields).some(value=>/[\r\n]/.test(value)))throw new Error('release/invalid-action-output');
      await fs.appendFile(process.env.GITHUB_OUTPUT,Object.entries(fields).map(([key,value])=>`${key}=${value}\n`).join(''));
    }
    console.log(JSON.stringify(receipt,null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
