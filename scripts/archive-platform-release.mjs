import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {run} from './download-release-baseline.mjs';
import {verifyRelease} from './build-platform-release.mjs';
export async function archiveRelease({site,out}){
  const receipt=await verifyRelease(site);await fs.mkdir(out,{recursive:true});const name=`platform-release-${receipt.buildId}.tar.gz`,archive=path.resolve(out,name);
  await run('tar',['-czf',archive,'-C',path.resolve(site),'.']);const handle=await fs.open(archive),hash=crypto.createHash('sha256');for await(const chunk of handle.createReadStream())hash.update(chunk);const sha256=hash.digest('hex');
  await fs.writeFile(archive+'.sha256',`${sha256}  ${name}\n`);await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify({...receipt,archive:name,archiveSha256:sha256},null,2)+'\n');return {...receipt,archive,archiveSha256:sha256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];try{if(!args.includes('--site')||!args.includes('--out'))throw new Error('Usage: --site VERIFIED_STAGING --out ARCHIVE_DIR');const receipt=await archiveRelease({site:option('--site'),out:option('--out')});if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`build_id=${receipt.buildId}\narchive=${receipt.archive}\n`);console.log(JSON.stringify(receipt,null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
