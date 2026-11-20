import test from 'node:test';
import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {authorityPickerView, filterAuthorities, routingOriginView} from '../site/apps/reception/ai/authority-picker.js';
import {RECEPTION_AUTHORITIES, RECEPTION_MFC_AUTHORITY_IDS, RECEPTION_TERRITORIES} from '../site/apps/reception/ai/authority-directory.js';
import {publicRoutingWorkflow} from '../firebase/functions/reception-ai/routing-workflow.mjs';

test('authority search recognises abbreviations and distinguishes Moscow from Moscow Oblast', () => {
  const moscow=filterAuthorities({search:'ГИТ',territoryId:'ru-77'}).map(row=>row.id);
  const oblast=filterAuthorities({search:'ГИТ',territoryId:'ru-50'}).map(row=>row.id);
  assert.equal(moscow[0],'git-moscow');
  assert.equal(oblast[0],'git-mo');
  assert.ok(!moscow.includes('git-mo'));
  assert.ok(!oblast.includes('git-moscow'));
  const selected=filterAuthorities({search:'несовпадающий текст',territoryId:'ru-69',recipientIds:['git-moscow']});
  assert.equal(selected[0].id,'git-moscow');
});

test('picker references existing local emblem bytes and escapes search and address text', async () => {
  for (const authority of RECEPTION_AUTHORITIES.filter(row=>row.emblem)) {
    await access(new URL('../site/' + authority.emblem,import.meta.url));
  }
  const workflow=publicRoutingWorkflow('noise-other-region');
  const origin=routingOriginView(workflow);
  assert.doesNotMatch(origin,/Адрес для ответа|ул\./);
  assert.match(origin,/Московская область/);
  assert.doesNotMatch(origin,/Учебн/);
  assert.match(routingOriginView({site:{detail:'<img onerror=x>'}}),/&lt;img onerror=x&gt;/);
  assert.match(authorityPickerView({}, {workflow,search:'"><img'}), /&quot;&gt;&lt;img/);
  const html=authorityPickerView({recipientIds:['git-moscow']},{workflow,search:'ГИТ',territoryId:'ru-77'});
  assert.match(html,/data-routing-recipient[^>]+value="git-moscow" checked/);
  assert.match(html,/authority-symbols\/rostrud\.webp/);
  assert.doesNotMatch(html,/value="git-mo"/);
});


test('directory covers all Career authorities and territories without duplicating existing Reception records', async () => {
  const load = async name => JSON.parse(await readFile(new URL('../site/apps/career/data/' + name,import.meta.url),'utf8'));
  const [federal,regional,territories] = await Promise.all(['authorities.json','territorial-authorities.json','territories.json'].map(load));
  const byCareerId = new Map(RECEPTION_AUTHORITIES.map(row=>[row.careerId || row.id,row]));
  assert.equal(byCareerId.size,RECEPTION_AUTHORITIES.length);
  assert.deepEqual(Object.keys(RECEPTION_TERRITORIES).sort(),territories.map(row=>row.id).sort());
  for (const authority of [...federal,...regional.authorities]) {
    const shown = byCareerId.get(authority.id);
    assert.equal(shown?.name,authority.name,authority.id);
    assert.deepEqual(shown.territoryIds,authority.regionId?[authority.regionId]:[],authority.id);
    if (authority.shortName) assert.equal(shown.shortName,authority.shortName,authority.id);
  }
  const html=authorityPickerView({}, {workflow:publicRoutingWorkflow('noise-other-region')});
  assert.equal([...html.matchAll(/data-routing-recipient/g)].length,80);
  assert.match(html,/Уточните поиск/);
  assert.match(html,/<option value="ru-77" selected>/);
  const remote = regional.authorities.find(row=>row.regionId==='ru-14');
  assert.ok(filterAuthorities({territoryId:'ru-14',search:remote.name}).some(row=>row.id===remote.id));
});


test('localized authority names retain the same scored IDs and can be found in either language',()=>{
  for(const [locale,queries] of [['en',['authorized unit','Профильное подразделение']],['zh',['主管部门','Профильное подразделение']]]){
    for(const search of queries)assert.ok(filterAuthorities({search,locale}).some(row=>row.id==='reception-unit'));
    const chooser=authorityPickerView({recipientIds:['reception-unit']},{locale,workflow:{recipientLimit:1}});
    assert.match(chooser,locale==='en'?/Authorized unit of the authority/:/收到来信机关的主管部门/);
    assert.match(chooser,/value="reception-unit" checked/);
  }
});


test('every MFC destination has an emblem and only eligible recipients appear in the route picker', async () => {
  const {MFC_ROUTING_AUTHORITY_IDS,ROUTING_AUTHORITY_ALIASES} = await import('../firebase/functions/reception-ai/routing-directory.mjs');
  const ids = [...MFC_ROUTING_AUTHORITY_IDS].map(id=>ROUTING_AUTHORITY_ALIASES[id] || id);
  assert.deepEqual(new Set(ids), RECEPTION_MFC_AUTHORITY_IDS);
  const all = filterAuthorities({mfcOnly:true});
  assert.deepEqual(new Set(all.map(row=>row.id)), RECEPTION_MFC_AUTHORITY_IDS);
  assert.ok(all.every(row=>row.emblem));
  assert.ok(!all.some(row=>row.id==='reception-unit'));
  const manifest = JSON.parse(await readFile(new URL('../site/apps/reception/assets/territory-emblems/sources.json',import.meta.url)));
  assert.deepEqual(new Set(Object.keys(manifest)),new Set(Object.keys(RECEPTION_TERRITORIES)));
  assert.equal(new Set(Object.values(manifest).map(row=>row.asset)).size,Object.keys(manifest).length);
  for (const [region,{asset,source}] of Object.entries(manifest)) {
    assert.ok(source.startsWith('https://'));
    assert.ok(all.some(row=>row.territoryIds.includes(region) && row.emblem===asset),region);
    const bytes = await readFile(new URL('../site/'+asset,import.meta.url));
    assert.equal(bytes.toString('ascii',8,12),'WEBP',region);
  }
  for (const [locale,search] of [['en','bank of russia'],['zh','俄罗斯中央银行']]) {
    assert.deepEqual(filterAuthorities({mfcOnly:true,search,locale}).map(row=>row.id),['bank-of-russia']);
  }
  const route = authorityPickerView({}, {workflow:{routingPolicy:{allowInternal:false}},search:'Профильное подразделение'});
  assert.doesNotMatch(route,/value="reception-unit"/);
});
