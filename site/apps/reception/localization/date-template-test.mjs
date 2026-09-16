// Real compiled locale packs: overlapping dated paragraphs must be independent
// of which other cases were assigned, and of their pack loading order.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CASE_TEMPLATES, CONTENT_VERSION, hydrateTemplates, requireTemplate, instantiateCase} from '../js/content-library.js';
import {createReceptionCatalogLoader, createReceptionTranslator} from './runtime.js';

const ids=CASE_TEMPLATES.map(template=>template.id);
await hydrateTemplates(ids);
const loader=createReceptionCatalogLoader({cacheStorage:null,fetch:async url=>new Response(await readFile(url))});
const failingAssignment=['driver-waiting-work','sign-light-restored','guard-current-register','heritage-identified-status','bailiff-specific-petition','budget-partial','landfill-registry-scope','mfc-interagency-silence'];
const scenarios=[['release-seed-f7678c4f',failingAssignment],['all-forward',ids],['all-reverse',[...ids].reverse()]];
const normalize=value=>String(value).replace(/\u00a0/g,' ').trim();
const dateValue=(values,key)=>{
  const raw=values[key]??values[key+'ISO'];
  assert.notEqual(raw,undefined,'Every authored date placeholder is supplied');
  return key.endsWith('ISO')?raw:/^\d{4}-\d{2}-\d{2}$/.test(String(raw))?raw.split('-').reverse().join('.'):String(raw);
};
const interpolate=(text,values)=>text.replace(/\{\{(\w+)\}\}/g,(_,key)=>dateValue(values,key));
function datedStrings(authored,realized,path='') {
  if(typeof authored==='string')return /\{\{\w+\}\}/.test(authored)&&/[А-Яа-яЁё]/.test(authored)?[{path,authored,realized}]:[];
  if(!authored||typeof authored!=='object')return [];
  return Object.entries(authored).filter(([key])=>key!=='datePacks').flatMap(([key,value])=>datedStrings(value,realized?.[key],path+'.'+key));
}
const failures=[],results=[];
for(const locale of ['en','zh']) {
  const singlePacks=new Map();
  for(const id of ids) {
    const loaded=await loader.load(locale,{templateIds:[id],contentVersion:CONTENT_VERSION});
    singlePacks.set(id,{...loaded,translator:createReceptionTranslator({locale,...loaded})});
  }
  for(const [scenario,assignment] of scenarios) {
    const loaded=await loader.load(locale,{templateIds:assignment,contentVersion:CONTENT_VERSION});
    const translator=createReceptionTranslator({locale,...loaded});
    const counts={locale,scenario,templates:assignment.length,variants:0,datedVariants:0,datedStrings:0};
    for(const id of assignment) {
      const template=requireTemplate(id),before=JSON.stringify(template),own=singlePacks.get(id);
      for(const pack of template.datePacks) {
        const realized=instantiateCase(template,pack.id,{year:2026});
        const rows=datedStrings(template,realized);
        if(rows.length)counts.datedVariants++;
        for(const {path,authored,realized:text} of rows) {
          const target=own.catalog[normalize(authored)];
          assert.equal(typeof target,'string',id+path+' has an authored compiled translation');
          const expected=interpolate(target,realized.dateValues);
          const actual=translator.translate(text),isolated=own.translator.translate(text);
          if(normalize(actual)!==normalize(expected)||normalize(isolated)!==normalize(expected))failures.push({locale,scenario,id,pack:pack.id,path,source:text,expected,actual,isolated});
          assert.deepEqual((actual.match(/\d{2}\.\d{2}\.\d{4}/g)||[]).sort(),(text.match(/\d{2}\.\d{2}\.\d{4}/g)||[]).sort(),id+path+' preserves every numeric date');
          counts.datedStrings++;
        }
        counts.variants++;
      }
      assert.equal(JSON.stringify(template),before,'Canonical cases and date packs stay unchanged');
    }
    results.push(counts);
  }
}
console.log(JSON.stringify({dateTemplateResults:results,failures:failures.length,firstFailures:failures.slice(0,8)},null,2));
assert.equal(failures.length,0,'Dated sentences must use their exact authored translation in every assignment order');
