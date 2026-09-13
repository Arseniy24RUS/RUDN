import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CASE_TEMPLATES,CASES} from '../js/cases.js';
import {referenceNumber} from '../js/legal-reference.js';
// Frozen outputs from the pre-localisation release, not the parser under test.
const baseline=JSON.parse(await readFile(new URL('fixtures/reference-legacy.json',import.meta.url),'utf8'));
const snapshot=JSON.stringify(CASES),canonical=[...CASE_TEMPLATES,...CASES];let checked=0;
for(const c of canonical) {
 const k=c.knowledge;
 const ru=[k.number,'№ '+k.number,'No. '+k.number,...(k.codeAliases||[])];
 if(k.actType==='code'&&k.codePart)ru.push('Налоговый кодекс РФ, часть '+k.codePart);
 else if(k.codeName)ru.push(k.codeName);
 if(!k.actType||k.actType==='code')ru.push(k.number+'-ФЗ','федеральный закон № '+k.number);
 if(k.actType==='order')ru.push('Приказ № '+k.number,'Приказ Минтранса России № '+k.number);
 if(k.actType==='resolution')ru.push('Постановление Правительства РФ № '+k.number);
 if(k.actType==='rfLaw')ru.push('Закон РФ № '+k.number);
 for(const value of ru){const key=JSON.stringify([k.actType||null,k.codeName||null,k.codePart||null,k.number,value]);assert(Object.hasOwn(baseline.rows,key),'Every legacy input has a frozen oracle');assert.equal(referenceNumber(value,k),baseline.rows[key],`Legacy ${c.id}: ${value}`);checked++;}
 const local=k.actType==='rfLaw'?['Russian Federation Law No. '+k.number,'俄罗斯联邦第'+k.number+'号法律']:
  k.actType==='order'?['Russian Ministry of Transport Order No. '+k.number,'俄罗斯交通部第'+k.number+'号命令']:
  k.actType==='resolution'?['Russian Government Resolution No. '+k.number,'俄罗斯政府第'+k.number+'号决议']:
  ['Federal Law No. '+k.number+'-FZ','联邦法律第'+k.number+'号',k.number+'-FZ'];
 for(const value of local)assert.equal(referenceNumber(value,k),String(k.number),`Same instrument ${c.id}: ${value}`);
 assert.notEqual(referenceNumber('Federal Law 999999-FZ',k),String(k.number),'Wrong number not awarded');
}
const tax1={actType:'code',codeName:'Налоговый кодекс РФ',codePart:1,number:'146'},tax2={...tax1,codePart:2,number:'117'};
for(const k of [tax1,tax2])for(const value of ['Tax Code Part '+k.codePart,'Russian Tax Code, Part '+k.codePart,'Part '+k.codePart+' of the Tax Code','俄罗斯税法典第'+k.codePart+'部分','俄罗斯联邦税法典第'+(k.codePart===1?'一':'二')+'部分'])assert.equal(referenceNumber(value,k),k.number);
for(const value of ['Tax Code','Tax Code Part 2','俄罗斯税法典第2部分','Civil Procedure Code','Tax Code Part 1 Article 88','Tax Code Part 1 and Part 2'])assert.equal(referenceNumber(value,tax1),'');
const civil={actType:'code',codeName:'Гражданский процессуальный кодекс Российской Федерации',number:'138'};
for(const value of ['Civil Procedure Code','Code of Civil Procedure','Civil Procedure Code of the Russian Federation','Russian Civil Procedure Code','俄罗斯联邦民事诉讼法典','民事诉讼法典'])assert.equal(referenceNumber(value,civil),'138');
for(const value of ['Tax Code Part 1','Civil Procedure Code Article 200','Civil Procedure Code Part 2','民事诉讼法典第200条'])assert.equal(referenceNumber(value,civil),'');
const types=[{number:'59'},tax1,civil,{actType:'rfLaw',number:'2300-1'},{actType:'order',number:'160'},{actType:'resolution',number:'1479'}];
for(const k of types)for(const value of ['Arbitrary 59','59 whatever','Federal Law 59 60','Federal Law No. 59-FZ Article 11','联邦法律第59号第60号','Government Resolution 1479 and 160','Order160extra','第59号未知法律'])assert.equal(referenceNumber(value,k),'');
for(const k of [{actType:'order'},{actType:'resolution'},{actType:'rfLaw'}])for(const value of ['59-FZ','Federal Law No. 59','联邦法律第59号'])assert.equal(referenceNumber(value,k),'');
for(const k of [{},{actType:'code'},tax1,{actType:'rfLaw'}])for(const value of ['Government Resolution 1479','俄罗斯政府第1479号决议'])assert.equal(referenceNumber(value,k),'');
for(const k of [{},{actType:'code'},tax1,{actType:'resolution'}])for(const value of ['Order 160','俄罗斯交通部第160号命令'])assert.equal(referenceNumber(value,k),'');
assert.equal(referenceNumber('No. 2300-I',{actType:'rfLaw'}),'2300-1');
assert.equal(JSON.stringify(CASES),snapshot);
console.log(JSON.stringify({canonicalCases:canonical.length,legacyInputs:checked,bothLanguages:true,wrongTypesRejected:true,codePartsScoped:true,noExtraWordsOrIDs:true,canonicalUnchanged:true}));
