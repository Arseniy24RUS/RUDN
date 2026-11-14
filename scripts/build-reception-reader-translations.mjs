/** Build lazy bilingual reader assets from pinned Russian originals and a translation cache.
 * --extract FILE collects exact source strings for translate-reception-reader.py.
 * CACHE [REPAIRS] builds and checks localized assets. --check verifies committed assets.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {normalize,canonicalStringify} from '../site/apps/legal-lab/lib/core.mjs';
import {packDescriptor,unpackDescriptor} from '../site/apps/legal-lab/lib/reader-codec.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
const root=resolve(repo,'site/apps/reception');
const shared=resolve(repo,'site/apps/legal-lab');
const corpus=resolve(repo,'firebase/functions/reception-ai/correspondence-corpus');
const output='content/legal-translations';
const options=process.argv.slice(2),check=options.includes('--check'),extract=options.includes('--extract');
const [input,repairInput]=options.filter(arg=>!arg.startsWith('--'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value)+'\n');
const readJSON=async file=>JSON.parse(await readFile(file));
const model='facebook/m2m100_418M@55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636';
const languages=['en','zh'];
const cyrillic=/[а-яё]/iu;
const formula=/^\p{L}+(?:[ _]\p{L}+)*\s*=/u;
const catalog=await readJSON(resolve(root,'content/legal-documents/catalog.json'));
const registryBytes=await readFile(resolve(root,catalog.readerCatalog.path));
assert.equal(sha(registryBytes),catalog.readerCatalog.sha256,'Russian registry integrity');
const registry=JSON.parse(registryBytes);
const corpusIndex=await readJSON(resolve(corpus,'index.json'));
const documentTranslations={},documentTitles={},allTexts=new Set();
const rawTranslations=!check&&!extract&&input?await readJSON(input):null;
if(!check&&!extract){assert.ok(rawTranslations,'Pass the completed translation cache JSON.');assert.equal(rawTranslations.model,model);}
const repairs=!check&&!extract&&repairInput?await readJSON(repairInput):null;
if(repairs)assert.equal(repairs.model,model);
const reviewed=extract?{}:Object.fromEntries(await Promise.all(languages.map(async locale=>[locale,await readJSON(resolve(repo,`scripts/reception-reader-reviewed-${locale}.json`))])));
const reviewedTitles=extract?{}:await readJSON(resolve(repo,'scripts/reception-reader-reviewed-titles.json'));
const reviewCoverage={en:new Set(),zh:new Set()};
const report={documents:0,units:0,reviewed:{en:0,zh:0},suspicious:{en:0,zh:0},outputBytes:0};
const packedBytes=async file=>gunzipSync(await readFile(resolve(root,file)));
const repeat=/(.{12,65})\1\1/u;
const nativeWords=/[а-яё]{4}/iu;
const han=/\p{Script=Han}/u;
const mapTable=(value,convert)=>value.split('|').map(cell=>cell.replace(/\S(?:.*\S)?/su,convert)).join('|');
function suspicious(source,value,locale){
  if(formula.test(source)||!source.trim())return false;
  return value.length>70&&/[\p{L}\p{N}]/u.test(value)&&repeat.test(value)||nativeWords.test(source)&&
    (value===source||locale==='zh'&&source.length>30&&!han.test(value));
}

async function originalDescriptor(meta,entry){
  let manifest;
  if(meta.bundle){
    const url=meta.bundle.url.match(/^https:\/\/raw\.githubusercontent\.com\/Arseniy24RUS\/RUDN\/([a-f0-9]{40})\/(source-data\/reception\/[A-Za-z0-9-]+\.json\.gz)$/);
    assert.ok(url,`Immutable packet URL for ${meta.id}`);
    let compressed;
    try{compressed=execFileSync('git',['show',url[1]+':'+url[2]],{cwd:repo,maxBuffer:32*1024**2,stdio:['ignore','pipe','ignore']});}
    catch{
      const response=await fetch(meta.bundle.url,{signal:AbortSignal.timeout(30000)});
      assert.ok(response.ok,`Pinned packet unavailable for ${meta.id}`);
      compressed=Buffer.from(await response.arrayBuffer());
    }
    assert.equal(compressed.length,meta.bundle.bytes);
    const bytes=gunzipSync(compressed);
    assert.equal(sha(bytes),meta.bundle.sha256);
    const packet=JSON.parse(bytes);
    assert.equal(packet.docId,meta.id);
    const pin=packet.files[entry.locales.ru.file];
    assert.equal(pin.sha256,entry.locales.ru.sha256);
    manifest=json(pin.value);
  }else manifest=await packedBytes(entry.locales.ru.file);
  assert.equal(sha(manifest),entry.locales.ru.sha256);
  return unpackDescriptor(JSON.parse(manifest));
}
async function originalUnits(meta,entry,descriptor){
  assert.equal(entry.sourceSha256,meta.sha256);
  assert.equal(entry.sourceFileSha256,meta.fileSha256);
  assert.equal(descriptor.sourceSha256,meta.sha256);
  assert.equal(descriptor.sourceFileSha256,meta.fileSha256);
  const pin=corpusIndex.documents.find(item=>item.id===meta.id);
  const bytes=gunzipSync(await readFile(resolve(corpus,pin.file)));
  assert.equal(bytes.length,pin.bytes);
  assert.equal(sha(bytes),pin.sha256);
  const doc=JSON.parse(bytes);
  assert.equal(doc.sourceSha256,meta.sha256);
  assert.equal(doc.sourceFileSha256,meta.fileSha256);
  assert.equal(doc.units.length,entry.unitCount);
  assert.equal(descriptor.units.length,entry.unitCount);
  const units=descriptor.units.map((unit,index)=>{
    assert.equal(doc.units[index].id,unit.id);
    return {id:unit.id,sectionId:unit.sectionId,text:doc.units[index].text};
  });
  assert.equal(sha(canonicalStringify(units)),meta.sha256);
  return units;
}

async function save(file,value){
  const bytes=json(value);
  const zipped=gzipSync(bytes,{level:9});
  await mkdir(dirname(resolve(root,file)),{recursive:true});
  await writeFile(resolve(root,file),zipped);
  report.outputBytes+=zipped.length;
  return {file,sha256:sha(bytes),bytes:bytes.length};
}
async function loadAsset(pin){
  const bytes=await packedBytes(pin.file);
  assert.equal(bytes.length,pin.bytes,pin.file);
  assert.equal(sha(bytes),pin.sha256,pin.file);
  return JSON.parse(bytes);
}
function translation(source,locale){
  if(Object.hasOwn(reviewed[locale],source)){
    reviewCoverage[locale].add(source);
    return reviewed[locale][source];
  }
  if(!cyrillic.test(source))return source;
  if(formula.test(source))return source;
  if(source.includes('|'))return mapTable(source,value=>translation(value,locale));
  if(/^Блок\s+\d+\s+\d+\.\s+\d{2}\s/u.test(source))return source.replace(/^Блок/u,locale==='en'?'Block':'区块');
  const key=sha(source),value=rawTranslations.translations[key]?.[locale];
  assert.ok(value?.trim(),`Missing ${locale} passage (source hash ${sha(source)})`);
  const repaired=suspicious(source,value,locale)?repairs?.translations[key]?.[locale]:null;
  if(repaired&&!suspicious(source,repaired,locale))return repaired;
  return value;
}
function revisedLabel(source,locale){
  const match=source.match(/^Редакция от (.+)$/u);
  return match?(locale==='en'?`Version dated ${match[1]}`:`${match[1]} 修订版`):translation(source,locale);
}
function translatedTitle(id,locale){const value=reviewedTitles[id]?.[locale];assert.ok(value,`No checked title for ${id}/${locale}`);return value;}
function displayLocator(text,locale){
  if(text==='Начало документа')return locale==='en'?'Beginning of document':'文件开头';
  const title=translation(text,locale),reference=text.match(/^(Статья|Глава|Раздел) ([IVXLCDM]+|\d+(?:\.\d+)*)(?=\.|\s|$)/iu);
  if(!reference||Object.hasOwn(reviewed[locale],text))return title;
  const type=reference[1].toLowerCase();
  const name={en:{статья:'Article',глава:'Chapter',раздел:'Section'},zh:{статья:'条',глава:'章',раздел:'编'}}[locale][type];
  const rest=title.replace(/^\s*(?:(?:(?:article|chapter|section)\s+)?(?:[IVXLCDM]+|\d+(?:\.\d+)*)(?=[.．。:\s]|$)|第\s*[\d.一二三四五六七八九十百]+\s*[条章节编])[.．。:\s]*/iu,'');
  return locale==='en'?`${name} ${reference[2]}${rest?'. '+rest:''}`:`第${reference[2]}${name}${rest?' '+rest:''}`;
}
function retainLeadingNumber(source,value){
  const prefix=source.match(/^(\d+(?:\.\d+)*(?:[.)])|[а-яё]\)) (?=\S)/iu)?.[1];
  if(!prefix||value.startsWith(prefix+' '))return value;
  const clean=value.replace(/^(?:\d+(?:\.\d+)*[.)、]|[（(][零一二三四五六七八九十百\d]+[)）]|[零一二三四五六七八九十百]+、)\s*(?=\D)/u,'');
  return `${prefix} ${clean}`;
}
async function buildLocale(meta,source,content,locale){
  const prefix=`${output}/${meta.id}/${locale}`,sections=source.sections.map(section=>({...section,title:displayLocator(section.title,locale)}));
  const sourceHeadings=new Set(source.sections.map(section=>section.unitIds[0]));
  const manifest={...source,locale,title:translatedTitle(meta.id,locale),revisionLabel:revisedLabel(source.revisionLabel,locale),sections,units:[],labels:{},unitToBlock:{},blocks:[]};
  const rows=[];
  let chunk=[],start=0;
  const payload=units=>({schema:1,docId:meta.id,locale,contentVersion:catalog.contentVersion,id:manifest.blocks.length,start,units});
  async function flush(){
    if(!chunk.length)return;
    const block=payload(chunk),ref=await save(prefix+'/blocks/'+String(block.id).padStart(4,'0')+'.json.gz',block);
    assert.ok(ref.bytes<=131072);
    manifest.blocks.push({...ref,id:block.id,start,count:chunk.length});
    start+=chunk.length;chunk=[];
  }
  for(let index=0;index<content.length;index++){
    const original=content[index],raw=original.text,metaUnit=source.units[index];
    const unit={...original,text:metaUnit.heading?displayLocator(raw,locale):retainLeadingNumber(raw,translation(raw,locale))};
    const label=displayLocator(metaUnit.label,locale),locator=displayLocator(metaUnit.locator,locale);
    if(chunk.length&&(chunk.length===64||json(payload([...chunk,unit])).length>131072))await flush();
    manifest.units.push({...metaUnit,locator,label,block:manifest.blocks.length});
    manifest.labels[unit.id]=label;
    manifest.unitToBlock[unit.id]=manifest.blocks.length;
    rows.push([unit.id,unit.sectionId,normalize([unit.text,label,sourceHeadings.has(unit.id)?metaUnit.label:'',index===0?meta.title+' '+meta.number:''].join(' ')),unit.text.slice(0,500)]);
    chunk.push(unit);
  }
  await flush();
  assert.equal(start,content.length);
  manifest.search=await save(prefix+'/search.json.gz',{schema:1,encoding:'indexed-v1',docId:meta.id,locale,contentVersion:catalog.contentVersion,sourceSha256:meta.sha256,rows});
  return {manifest,rows,pin:await save(prefix+'/manifest.json.gz',packDescriptor(manifest))};
}
async function verifyLocale(meta,source,contents,locale,pin){
  const manifest=unpackDescriptor(await loadAsset(pin));
  assert.equal(manifest.docId,meta.id);assert.equal(manifest.locale,locale);
  assert.equal(manifest.title,translatedTitle(meta.id,locale));
  assert.equal(manifest.sourceSha256,source.sourceSha256);
  assert.equal(manifest.sourceFileSha256,source.sourceFileSha256);
  assert.equal(manifest.contentVersion,catalog.contentVersion);
  assert.equal(manifest.blocks.reduce((sum,block)=>sum+block.count,0),contents.length);
  assert.deepEqual(manifest.sections.map(s=>[s.id,s.unitIds]),source.sections.map(s=>[s.id,s.unitIds]));
  const search=await loadAsset(manifest.search);
  assert.equal(search.locale,locale);assert.equal(search.docId,meta.id);
  assert.equal(search.sourceSha256,meta.sha256);
  assert.equal(search.encoding,'indexed-v1');assert.equal(search.rows.length,contents.length);
  let index=0;
  for(const block of manifest.blocks){
    assert.equal(block.start,index);assert.ok(block.count<=64&&block.bytes<=131072);
    const data=await loadAsset(block);
    assert.equal(data.id,block.id);assert.equal(data.start,index);assert.equal(data.locale,locale);
    assert.equal(data.docId,meta.id);assert.equal(data.units.length,block.count);
    for(const unit of data.units){
      const original=contents[index],metaUnit=manifest.units[index],row=search.rows[index++];
      assert.deepEqual([unit.id,unit.sectionId],[original.id,original.sectionId]);
      assert.deepEqual([metaUnit.id,metaUnit.sectionId,metaUnit.block],[unit.id,unit.sectionId,block.id]);
      assert.equal(metaUnit.heading,source.units[index-1].heading);
      assert.ok(typeof unit.text==='string'&&(!original.text.trim()||unit.text.trim()),`Missing content: ${unit.id}/${locale}`);
      if(suspicious(original.text,unit.text,locale)){
        report.suspicious[locale]++;
        console.error(`Inspect translation: ${meta.id}/${locale}/${unit.id}`);
      }
      assert.deepEqual([row[0],row[1],row[3]],[unit.id,unit.sectionId,unit.text.slice(0,500)]);
      const checked=reviewed[locale][original.text];
      if(checked){
        assert.equal(unit.text,retainLeadingNumber(original.text,checked));
        reviewCoverage[locale].add(original.text);
        report.reviewed[locale]++;
      }else if(original.text.includes('|')){
        const translatedCells=unit.text.split('|');
        let checkedCell=false;
        original.text.split('|').forEach((cell,i)=>{
          const sourceCell=cell.trim(),expected=reviewed[locale][sourceCell];
          if(!expected)return;
          assert.equal(translatedCells[i]?.trim(),expected);
          reviewCoverage[locale].add(sourceCell);checkedCell=true;
        });
        if(checkedCell)report.reviewed[locale]++;
      }
    }
  }
  assert.equal(index,contents.length);
}

const generated=resolve(root,'js/source-reader-translations.js');
const existing=check?await import(new URL('../site/apps/reception/js/source-reader-translations.js',import.meta.url)):null;
for(const meta of catalog.documents){
  const entry=registry.documents.find(item=>item.id===meta.id);
  assert.ok(entry,`Missing entry for ${meta.id}`);
  const source=await originalDescriptor(meta,entry),contents=await originalUnits(meta,entry,source);
  if(extract){
    [meta.title,meta.revisionLabel,...source.sections.map(s=>s.title),...source.units.flatMap(u=>[u.label,u.locator]),...contents.map(u=>u.text)]
      .forEach(text=>text.includes('|')?text.split('|').forEach(cell=>allTexts.add(cell.trim())):allTexts.add(text));
    continue;
  }
  const locales={};
  documentTitles[meta.id]={ru:meta.title};
  for(const locale of languages){
    documentTitles[meta.id][locale]=translatedTitle(meta.id,locale);
    const pin=check?existing.documentTranslations[meta.id].locales[locale]:(await buildLocale(meta,source,contents,locale)).pin;
    await verifyLocale(meta,source,contents,locale,pin);
    locales[locale]=pin;
  }
  documentTranslations[meta.id]={sourceSha256:entry.sourceSha256,sourceFileSha256:entry.sourceFileSha256,locales};
  report.documents++;report.units+=contents.length;
}
if(extract){
  assert.ok(input,'Pass output filename after --extract.');
  await writeFile(input,json({model,texts:[...allTexts].sort()}));console.log(`Collected ${allTexts.size} pinned document strings.`);
}else{
  for(const locale of languages)assert.equal(reviewCoverage[locale].size,Object.keys(reviewed[locale]).length,`Unmatched reviewed ${locale} sources`);
  const existingShared=await readJSON(resolve(shared,'data/translations/catalog.json'));
  const sharedCatalog=await readJSON(resolve(shared,'data/catalog.json'));
  for(const id of ['civil79','corruption273','koap']){
    const meta=sharedCatalog.documents.find(doc=>doc.id===id);
    documentTitles[id]={ru:meta.title};
    for(const locale of languages){
      const entry=existingShared.documents.find(item=>item.docId===id&&item.locale===locale);
      assert.equal(entry.review.status,'approved');
      const bytes=await readFile(resolve(shared,'data/translations',entry.file));
      assert.equal(sha(bytes),entry.sha256);
      const translation=JSON.parse(bytes);
      documentTitles[id][locale]=translation.document?.title||translation.title;
      assert.ok(documentTitles[id][locale],`Missing shared title for ${id}/${locale}`);
    }
  }
  const contents=`// Generated by scripts/build-reception-reader-translations.mjs.\nexport const documentTranslations=${JSON.stringify(documentTranslations)};\nexport const documentTitles=${JSON.stringify(documentTitles)};\n`;
  if(check)assert.equal(await readFile(generated,'utf8'),contents);
  else await writeFile(generated,contents);
  console.log(JSON.stringify(report));
  assert.deepEqual(report.suspicious,{en:0,zh:0},'Inspect repeated or untranslated passages before publishing');
}
