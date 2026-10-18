// Derived, hash-pinned reader assets. Original source and translation files are immutable.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {canonicalStringify,normalize} from '../site/apps/legal-lab/lib/core.mjs';
import {labelForUnit} from '../site/apps/legal-lab/lib/reader-tools.mjs';
import {displayDocument,labelForDisplayUnit} from '../site/apps/legal-lab/lib/translations.mjs';
import {packStructure,unpackStructure,packDescriptor,unpackDescriptor} from '../site/apps/legal-lab/lib/reader-codec.mjs';

const root=fileURLToPath(new URL('../site/apps/legal-lab/',import.meta.url)),check=process.argv.includes('--check');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),json=value=>JSON.stringify(value)+'\n';
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const catalog=await read('data/catalog.json'),translations=await read('data/translations/catalog.json');
const registry={schema:1,contentVersion:catalog.contentVersion,maxUnits:64,maxBlockBytes:131072,documents:[]};
let files=0,blocks=0,units=0,maxBytes=0;
async function save(path,value){const bytes=Buffer.from(typeof value==='string'?value:json(value));if(check)assert.ok((await readFile(resolve(root,path))).equals(bytes),`Stale reader asset: ${path}`);else{let previous=null;try{previous=await readFile(resolve(root,path));}catch(error){if(error.code!=='ENOENT')throw error;}if(!previous?.equals(bytes)){await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),bytes);}}files++;return {file:path,sha256:hash(bytes),bytes:bytes.length};}
for(const meta of catalog.documents){
  const sourceBytes=await readFile(resolve(root,'data',meta.file)),doc=JSON.parse(sourceBytes);
  assert.equal(hash(sourceBytes),meta.fileSha256,`Source file pin ${meta.id}`);
  assert.equal(hash(canonicalStringify(doc.units)),meta.sha256,`Source content pin ${meta.id}`);
  assert.equal(doc.version,catalog.contentVersion);assert.equal(new Set(doc.units.map(u=>u.id)).size,doc.units.length);
  const unitIds=new Set(doc.units.map(u=>u.id));for(const section of doc.sections)for(const id of section.unitIds)assert.ok(unitIds.has(id),`TOC membership ${id}`);
  const structural={...doc,structural:true,units:doc.units.map(({id,sectionId})=>({id,sectionId}))};
  const packedStructure=packStructure(structural),restoredStructure=unpackStructure(packedStructure);assert.deepEqual(restoredStructure.units,structural.units);assert.deepEqual(restoredStructure.sections,structural.sections);assert.deepEqual(restoredStructure.aliases,structural.aliases);
  const structure=await save(`data/reader/${doc.id}/structure.json`,packedStructure),locales={};
  for(const locale of ['ru','en','zh']){
    let translation=null,view=doc,translationSha256=null;
    if(locale!=='ru'){
      const entry=translations.documents.find(e=>e.docId===doc.id&&e.locale===locale);assert.ok(entry&&entry.status==='complete'&&entry.review.status==='approved',`Reviewed translation ${doc.id}/${locale}`);
      assert.equal(entry.source.sha256,meta.sha256);assert.equal(entry.source.fileSha256,meta.fileSha256);
      const bytes=await readFile(resolve(root,'data/translations',entry.file));assert.equal(hash(bytes),entry.sha256);
      translation=JSON.parse(bytes);const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};freeze(translation);
      view=displayDocument(doc,translation);translationSha256=entry.sha256;
    }
    const manifest={schema:1,id:doc.id,docId:doc.id,locale,contentVersion:catalog.contentVersion,sourceSha256:meta.sha256,sourceFileSha256:meta.fileSha256,translationSha256,title:view.title,revisionLabel:view.revisionLabel,sections:view.sections,units:[],unitToBlock:{},labels:{},blocks:[]};
    const search={schema:1,encoding:'indexed-v1',docId:doc.id,locale,contentVersion:catalog.contentVersion,sourceSha256:meta.sha256,rows:[]};
    let chunk=[],start=0;
    const payload=list=>({schema:1,docId:doc.id,locale,contentVersion:catalog.contentVersion,id:manifest.blocks.length,start,units:list});
    async function flush(){if(!chunk.length)return;const value=payload(chunk),ref=await save(`data/reader/${doc.id}/${locale}/blocks/${String(value.id).padStart(4,'0')}.json`,value);assert.ok(ref.bytes<=131072);maxBytes=Math.max(maxBytes,ref.bytes);manifest.blocks.push({...ref,id:value.id,start,count:chunk.length});blocks++;start+=chunk.length;chunk=[];}
    const sectionMap=new Map(doc.sections.map(s=>[s.id,s]));
    for(let index=0;index<view.units.length;index++){
      const source=doc.units[index],unit=view.units[index];assert.equal(source.id,unit.id);
      const label=translation?labelForDisplayUnit(doc,source.id,translation,locale):labelForUnit(doc,source.id),section=sectionMap.get(source.sectionId),heading=Boolean(section&&section.unitIds[0]===source.id&&source.text.trim()===section.title.trim());
      const rendered={...unit,label,heading};
      if(chunk.length&&(chunk.length===64||Buffer.byteLength(json(payload([...chunk,rendered])))>131072))await flush();
      assert.ok(Buffer.byteLength(json(payload([rendered])))<=131072,`Single unit exceeds block limit: ${unit.id}`);
      const block=manifest.blocks.length;
      manifest.units.push({id:unit.id,sectionId:unit.sectionId,locator:unit.locator,label,heading,index,block});manifest.unitToBlock[unit.id]=block;manifest.labels[unit.id]=label;
      chunk.push(rendered);
      search.rows.push([unit.id,unit.sectionId,normalize(unit.text+' '+unit.locator),unit.text.slice(0,500)]);
    }
    await flush();assert.equal(start,doc.units.length);
    manifest.search=await save(`data/reader/${doc.id}/${locale}/search.json`,search);
    const packedManifest=packDescriptor(manifest);assert.deepEqual(unpackDescriptor(packedManifest),manifest);
    locales[locale]=await save(`data/reader/${doc.id}/${locale}/manifest.json`,packedManifest);
  }
  registry.documents.push({id:doc.id,sourceSha256:meta.sha256,sourceFileSha256:meta.fileSha256,unitCount:doc.units.length,structure,locales});units+=doc.units.length;
}
const result=await save('data/reader/catalog.json',registry);
await save('lib/reader-registry.mjs',`// Generated by scripts/build_legal_lab_reader.mjs.\nexport const READER_CATALOG_SHA='${result.sha256}';\nexport const READER_CONTENT_VERSION='${catalog.contentVersion}';\n`);
console.log(JSON.stringify({mode:check?'check':'build',documents:registry.documents.length,locales:3,units,blocks,files,maxBlockBytes:maxBytes,catalogSha256:result.sha256}));
