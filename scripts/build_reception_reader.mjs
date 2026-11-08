/** Build compressed reception sources with the same reader format as seminar 4. */
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {canonicalStringify} from '../site/apps/legal-lab/lib/core.mjs';
import {packStructure,packDescriptor} from '../site/apps/legal-lab/lib/reader-codec.mjs';

const input=process.argv[process.argv.indexOf('--input')+1];
if(!process.argv.includes('--input')||!input)throw new Error('Pass --input with the acquired full-document directory.');
const root=fileURLToPath(new URL('../site/apps/reception/',import.meta.url));
const version='reception-sources-2026-11-09.1';
const packs=process.argv.includes('--packs')?process.argv[process.argv.indexOf('--packs')+1]:null;
const packBase=process.argv.includes('--pack-base')?process.argv[process.argv.indexOf('--pack-base')+1]:null;
if(packs&&!packBase)throw new Error('--packs requires an immutable --pack-base URL.');
const bundled=new Set(['reception-law59999','reception-law61801','reception-law103023','reception-info8','reception-archive71']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value)+'\n');
let storedBytes=0,unitCount=0;
async function save(file,value){
  const raw=json(value),bytes=file.endsWith('.gz')?gzipSync(raw,{level:9}):raw;
  await mkdir(dirname(resolve(root,file)),{recursive:true});await writeFile(resolve(root,file),bytes);storedBytes+=bytes.length;
  return {file,sha256:hash(raw),bytes:raw.length};
}
const registry={schema:1,contentVersion:version,maxUnits:64,maxBlockBytes:131072,documents:[]};
const catalog={schema:1,contentVersion:version,documents:[]};
for(const file of (await readdir(input)).filter(name=>name.endsWith('.json')).sort()){
  const sourceBytes=await readFile(resolve(input,file)),source=JSON.parse(sourceBytes);
  assert.equal(source.coverage,'full');assert.ok(source.units.length&&source.sections.length);
  const id=source.id,shortId=id.replace('reception-',''),unitIds=new Map(source.units.map((u,i)=>[u.id,shortId+'-u'+i]));
  const sectionIds=new Map(source.sections.map((s,i)=>[s.id,shortId+'-s'+i]));
  const sections=source.sections.map(s=>({id:sectionIds.get(s.id),title:s.title,unitIds:s.unitIds.map(uid=>unitIds.get(uid))}));
  const units=source.units.map(u=>({id:unitIds.get(u.id),sectionId:sectionIds.get(u.sectionId),text:u.text}));
  assert.equal(new Set(units.map(u=>u.id)).size,units.length);
  assert.deepEqual(units.map(u=>u.text),source.units.map(u=>u.text));
  const sourceSha=hash(canonicalStringify(units)),fileSha=hash(sourceBytes);
  const metadata={id,title:source.title.replace(/\s*\(последняя редакция\)\s*$/,''),number:source.number,sourceUrl:source.sourceUrl,revisionLabel:source.revisionLabel,sourceAccessed:source.sourceAccessed||'2026-11-09',version,coverage:'full',sha256:sourceSha,aliases:{},structural:true};
  const path='content/legal-documents/'+id;
  const structure=await save(path+'/structure.json.gz',{...packStructure({...metadata,sections,units:units.map(({id,sectionId})=>({id,sectionId}))})});
  const descriptor={schema:1,id,docId:id,locale:'ru',contentVersion:version,sourceSha256:sourceSha,sourceFileSha256:fileSha,translationSha256:null,title:metadata.title,revisionLabel:metadata.revisionLabel,sections,units:[],unitToBlock:{},labels:{},blocks:[],search:{encoding:'blocks-v1'}};
  const bySection=new Map(sections.map(s=>[s.id,s]));
  let chunk=[],start=0;
  const payload=list=>({schema:1,docId:id,locale:'ru',contentVersion:version,id:descriptor.blocks.length,start,units:list});
  async function flush(){
    if(!chunk.length)return;
    const value=payload(chunk),pin=await save(path+'/blocks/'+String(value.id).padStart(4,'0')+'.json.gz',value);
    assert.ok(pin.bytes<=131072);descriptor.blocks.push({...pin,id:value.id,start,count:chunk.length});start+=chunk.length;chunk=[];
  }
  for(let i=0;i<units.length;i++){
    const unit=units[i],section=bySection.get(unit.sectionId),label=section.title,heading=section.unitIds[0]===unit.id&&unit.text.trim()===label.trim();
    if(chunk.length&&(chunk.length===64||json(payload([...chunk,unit])).length>131072))await flush();
    descriptor.units.push({id:unit.id,sectionId:unit.sectionId,locator:label,label,heading,index:i,block:descriptor.blocks.length});
    descriptor.unitToBlock[unit.id]=descriptor.blocks.length;descriptor.labels[unit.id]=label;chunk.push(unit);
  }
  await flush();assert.equal(start,units.length);
  const manifest=await save(path+'/manifest.json.gz',packDescriptor(descriptor));
  registry.documents.push({id,sourceSha256:sourceSha,sourceFileSha256:fileSha,unitCount:units.length,structure,locales:{ru:manifest}});
  catalog.documents.push({...metadata,fileSha256:fileSha,unitCount:units.length});unitCount+=units.length;
}
if(packs){
  await mkdir(packs,{recursive:true});
  for(const meta of catalog.documents){
    if(bundled.has(meta.id))continue;
    const entry=registry.documents.find(item=>item.id===meta.id),files={};
    const descriptor=JSON.parse(gunzipSync(await readFile(resolve(root,entry.locales.ru.file))));
    for(const pin of [entry.structure,entry.locales.ru,...descriptor.blocks]){
      const raw=gunzipSync(await readFile(resolve(root,pin.file)));
      assert.equal(hash(raw),pin.sha256);files[pin.file]={sha256:pin.sha256,value:JSON.parse(raw)};
    }
    const raw=json({schema:1,docId:meta.id,files}),bytes=gzipSync(raw,{level:9});
    const name=meta.id+'.json.gz';await writeFile(resolve(packs,name),bytes);
    meta.bundle={url:new URL(name,packBase.endsWith('/')?packBase:packBase+'/').href,sha256:hash(raw),bytes:bytes.length};
    await rm(resolve(root,'content/legal-documents',meta.id),{recursive:true});
  }
  storedBytes=0;
  async function sum(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=resolve(directory,entry.name);if(entry.isDirectory())await sum(path);else storedBytes+=(await readFile(path)).length;}}
  await sum(resolve(root,'content/legal-documents'));
}
const pin=await save('content/legal-documents/registry.json',registry);
catalog.readerCatalog={path:pin.file,sha256:pin.sha256};
await save('content/legal-documents/catalog.json',catalog);
console.log(JSON.stringify({documents:catalog.documents.length,units:unitCount,storedBytes}));
