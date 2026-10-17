// Identifier-only references for historical reports. Never a reader corpus.
const REFERENCE_SHA='fbd930dcb7f2b8b4512447cd1e9b87c3daf7a257f28c8bdb63a4980464f482e5';
const VERSION='legal-lab-2026-10-15.2';
const pins={
  archive122:{sha256:'7e229fc411790a6436631f61ff5e9d2a3e7be0e78b76d6c3dfd9703040dea46d',source:'dfdce1fb30f39e554161d7ad665d67af3228ec9999c04437986e62e4d4b5f410',units:467},
  realty218:{sha256:'b31c47516c4cc42de750ff36b82dc67e090f55f61e18c29e0ca9738e6d6201b9',source:'c7e0f4dc800436e2e07ee1145891bf19b9081bba176934dd09b5fb0f668e00e8',units:1745}
};
const pending=new WeakMap();
const invalid=()=>new Error('Historical report references are unavailable or incompatible');
function abort(corpus){
  if(corpus.signal?.aborted){pending.delete(corpus);throw new DOMException('Aborted','AbortError');}
}
function freeze(value){
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
}
function validate(payload,version){
  if(payload?.schema!==1||version!==VERSION||payload.contentVersion!==version||!Array.isArray(payload.documents)||payload.documents.length!==2)throw invalid();
  const seen=new Set();
  for(const doc of payload.documents){
    const pin=Object.hasOwn(pins,doc?.id)?pins[doc.id]:null;
    if(!pin||seen.has(doc.id)||Object.keys(doc).sort().join(',')!=='aliases,coverage,id,number,referenceOnly,revisionLabel,sections,sha256,shortTitle,sourceFileSha256,title,units,version'||
      doc.referenceOnly!==true||doc.version!==version||doc.sha256!==pin.sha256||doc.sourceFileSha256!==pin.source||doc.coverage!=='full'||
      !['title','shortTitle','number','revisionLabel'].every(key=>typeof doc[key]==='string'&&doc[key].trim())||
      !Array.isArray(doc.units)||doc.units.length!==pin.units||!Array.isArray(doc.sections)||!doc.aliases||Array.isArray(doc.aliases)||Object.keys(doc.aliases).length)throw invalid();
    seen.add(doc.id);
    const units=new Map();
    for(const unit of doc.units){
      if(!unit||Object.keys(unit).sort().join(',')!=='id,sectionId'||typeof unit.id!=='string'||!unit.id.startsWith(doc.id+'-u')||
        typeof unit.sectionId!=='string'||!unit.sectionId.startsWith(doc.id+'-s')||units.has(unit.id))throw invalid();
      units.set(unit.id,unit);
    }
    if(doc.sections.length!==(doc.id==='archive122'?1:0))throw invalid();
    for(const section of doc.sections){
      const expected=doc.units.filter(unit=>unit.sectionId===section.id).map(unit=>unit.id);
      if(Object.keys(section).sort().join(',')!=='id,title,unitIds'||section.id!=='archive122-s8'||section.title!=='Статья 6. Признание ранее возникших прав'||
        !Array.isArray(section.unitIds)||section.unitIds.length!==8||expected.length!==8||section.unitIds.some((id,index)=>id!==expected[index]))throw invalid();
    }
  }
  // coverage and source SHA describe the original act. referenceOnly prevents
  // these identifiers from being presented as a complete document text.
  return freeze(payload);
}
async function references(corpus){
  abort(corpus);
  const version=corpus.catalog.contentVersion;
  let entry=pending.get(corpus);
  if(entry?.version!==version){pending.delete(corpus);entry=null;}
  if(!entry){
    const work=(async()=>{const data=await corpus.json('data/report-references.json',REFERENCE_SHA);abort(corpus);return validate(data,version);})();
    entry={version,work};pending.set(corpus,entry);
    work.catch(()=>{if(pending.get(corpus)?.work===work)pending.delete(corpus);});
  }
  const payload=await entry.work;abort(corpus);
  if(corpus.catalog.contentVersion!==version){pending.delete(corpus);throw invalid();}
  return payload;
}
/** Load active sources normally and only the two known retired sources as
 * read-only references. The normal catalog, cache and all() remain untouched.
 */
export async function loadReportDocuments(corpus,ids,loadActive=id=>corpus.load(id)){
  if(!corpus||!Array.isArray(corpus.catalog?.documents)||!Array.isArray(ids)||typeof loadActive!=='function')throw new TypeError('A corpus and document ID array are required');
  abort(corpus);
  const active=new Set(corpus.catalog.documents.map(doc=>doc.id)),requested=[...new Set(ids)];
  if(requested.some(id=>typeof id!=='string'||(!active.has(id)&&!Object.hasOwn(pins,id))))throw invalid();
  const pack=requested.some(id=>!active.has(id))?references(corpus):null;
  const documents=await Promise.all(requested.map(async id=>active.has(id)?loadActive(id):(await pack).documents.find(doc=>doc.id===id)));
  abort(corpus);return documents;
}
