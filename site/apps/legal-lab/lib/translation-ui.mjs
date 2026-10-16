import {displayDocument,labelForDisplayUnit} from './translations.mjs';
const views=new WeakMap(),indexes=new WeakMap();
export function documentLocale(app,docId){return app.state?.reader?.[docId]?.original?'ru':(['en','zh'].includes(app.locale)?app.locale:'ru');}
export function documentDisplay(app,doc){
 const requested=documentLocale(app,doc.id),translation=app.translations?.get(doc,requested)||null;
 let view=doc;
 if(translation){let cached=views.get(translation);if(!cached||cached.original!==doc){cached={original:doc,view:displayDocument(doc,translation)};views.set(translation,cached);}view=cached.view;}
 let units=indexes.get(view);if(!units){units=new Map(view.units.map(unit=>[unit.id,unit]));indexes.set(view,units);}
 return {view,units,translation,requested,locale:translation?.locale||'ru'};
}
export function displayLabel(app,doc,unitId){const info=documentDisplay(app,doc);return labelForDisplayUnit(doc,unitId,info.translation,info.locale);}
export function readerQuery(app,doc){const info=documentDisplay(app,doc),state=app.state.reader[doc.id]||{};return state.queries?.[info.locale]??(info.locale==='ru'?state.query||'':'');}
export function setReaderQuery(app,doc,value){const locale=documentDisplay(app,doc).locale,state=app.state.reader[doc.id]||={};state.queries||={};state.queries[locale]=value;if(locale==='ru')state.query=value;state.searchPage=0;}
