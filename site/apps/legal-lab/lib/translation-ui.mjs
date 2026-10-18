import {displayDocument,labelForDisplayUnit} from './translations.mjs';
const views=new WeakMap(),indexes=new WeakMap();
export function documentLocale(app,docId){return app.state?.reader?.[docId]?.original?'ru':(['en','zh'].includes(app.locale)?app.locale:'ru');}
export function documentDisplay(app,doc){
 if(doc.structural){
  const requested=documentLocale(app,doc.id),descriptor=app.corpus.peekReaderDocument(doc.id,requested),locale=descriptor?.locale||'ru';
  const units=app.corpus.loadedUnits(doc.id,locale),view=descriptor?{...doc,title:descriptor.title,revisionLabel:descriptor.revisionLabel,sections:descriptor.sections,units:[...units.values()],locale,displayOnly:true}:doc;
  return {view,units,translation:locale!=='ru'&&descriptor?{locale,sections:Object.fromEntries(descriptor.sections.map(s=>[s.id,s.title])),readerDescriptor:true}:null,requested,locale,descriptor};
 }
 const requested=documentLocale(app,doc.id),translation=app.translations?.get(doc,requested)||null;
 let view=doc;
 if(translation){let cached=views.get(translation);if(!cached||cached.original!==doc){cached={original:doc,view:displayDocument(doc,translation)};views.set(translation,cached);}view=cached.view;}
 let units=indexes.get(view);if(!units){units=new Map(view.units.map(unit=>[unit.id,unit]));indexes.set(view,units);}
 return {view,units,translation,requested,locale:translation?.locale||'ru'};
}
export function displayLabel(app,doc,unitId){const info=documentDisplay(app,doc);if(doc.structural)return info.descriptor?.labels[unitId]||info.units.get(unitId)?.label||doc.sections.find(s=>s.unitIds.includes(unitId))?.title||'';return labelForDisplayUnit(doc,unitId,info.translation,info.locale);}
export function readerQuery(app,doc){const info=documentDisplay(app,doc),state=app.state.reader[doc.id]||{};return state.queries?.[info.locale]??(info.locale==='ru'?state.query||'':'');}
export function setReaderQuery(app,doc,value){const locale=documentDisplay(app,doc).locale,state=app.state.reader[doc.id]||={};state.queries||={};state.queries[locale]=value;if(locale==='ru')state.query=value;state.searchPage=0;}

/** A report owns only the passages it quotes, never entire source documents. */
export async function prepareReportPassages(app,docs,ids,scope){
 scope?.assert();
 const wanted=new Set(ids),passages=new Map();
 for(const doc of docs){
  if(doc.referenceOnly)continue;
  const local=doc.units.filter(unit=>wanted.has(unit.id)).map(unit=>unit.id);if(!local.length)continue;
  if(doc.structural){const locale=documentLocale(app,doc.id),descriptor=await app.corpus.readerDocument(doc.id,locale,{signal:scope?.signal});scope?.assert();const loaded=await app.corpus.loadUnits(doc.id,locale,local,{signal:scope?.signal});scope?.assert();for(const [id,unit]of loaded)passages.set(id,{unit,locale,label:unit.label,title:descriptor.title});}
  else {const info=documentDisplay(app,doc);for(const id of local){const unit=info.units.get(id);if(unit)passages.set(id,{unit,locale:info.locale,label:displayLabel(app,doc,id),title:info.view.title});}}
 }
 scope?.assert();return passages;
}
