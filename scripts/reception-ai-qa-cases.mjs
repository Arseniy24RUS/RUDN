#!/usr/bin/env node
/** Synthetic UI fixtures only. No production dossiers, users, provider or database.
 * Public catalog IDs are reused solely to exercise the real difficulty filter.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {validateCase} from '../firebase/functions/reception-ai/schema.mjs';
import {CATALOG_METADATA} from '../firebase/functions/reception-ai/catalog-metadata.mjs';

export const SYNTHETIC_VERSION = 'synthetic-reception-ui-qa-v1';
export const SYNTHETIC_IDS = Object.freeze(['river-observation','budget','complaint-routing']);
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../site');
const T = (ru,en,zh) => ({ru,en:en||`Synthetic QA: ${ru}`,zh:zh||`合成测试：${ru}`});
const O = (id,label) => ({id,label:T(label)});

export function createSyntheticReceptionCases() {
  return SYNTHETIC_IDS.map((id,index) => validateCase({
    id, familyId:CATALOG_METADATA[id].familyId, datePackId:'synthetic', version:SYNTHETIC_VERSION,
    public:{
      title:T(`Синтетическая проверка интерфейса №${index+1}`,`Synthetic UI case ${index+1}`,`合成界面测试${index+1}`),
      role:{title:T('Тестовая приёмная','Test reception','测试接待室'),text:T('Полностью вымышленный сценарий для проверки интерфейса. Он не воспроизводит учебные ответы производственного банка.')},
      citizen:{name:T(`Тестовый посетитель ${index+1}`,`Test visitor ${index+1}`,`测试访客${index+1}`),description:T('Вымышленный персонаж автоматической проверки.'),portrait:'assets/gfx1/avatars/C03.webp'},
      opening:T('Здравствуйте. Я принёс вымышленное заявление для проверки работы учебной приёмной. Можно уточнить, какие материалы нужны?',
        'Hello. I brought a fictional application to test the reception workspace. Which documents do you need?',
        '您好。我带来一份虚构申请，用于测试接待界面。您需要哪些材料？'),
      date:'2026-11-11',
      procedures:[O('qa-procedure','Проверить синтетический учебный образец'),O('qa-other-procedure','Другой тестовый порядок')],
      routes:[O('qa-office','Вымышленный учебный отдел'),O('qa-other-office','Другой тестовый отдел')],
      actions:[O('qa-register','Записать тестовое обращение'),O('qa-verify','Сопоставить два тестовых документа'),O('qa-notify','Сообщить тестовый результат'),O('qa-discard','Удалить учебные материалы')],
      // This real public URL exercises the existing internal reader. It is not
      // the answer to the synthetic QA-only scoring contract below.
      sources:[{id:'qa-reader-source',title:T('Публичный текст 59-ФЗ: проверка встроенного чтения','Public 59-FZ text: internal reader test','59号联邦法律公开文本：内置阅读器测试'),url:'https://www.consultant.ru/document/cons_doc_LAW_59999/'}],
      deadlinePrompt:T('Выберите дату в учебном календаре.'),
      assessment:{
        fact:{prompt:T('Какой факт указан в синтетическом образце?'),options:[O('qa-fact','Учебный образец зарегистрирован'),O('qa-other-fact','Учебный образец отсутствует')]},
        knowledge:{prompt:T('Выберите применение вымышленного правила QA.'),options:[O('qa-apply','Применить условное правило QA'),O('qa-other-apply','Применить другой тестовый образец')],numberLabel:T('Номер вымышленного образца'),dateLabel:T('Дата вымышленного образца'),unitLabel:T('Тестовый пункт')},
        trap:{prompt:T('Как завершить тестовое взаимодействие?'),options:[O('qa-respect','Вежливо уточнить недостающие сведения'),O('qa-ignore','Прервать тестовое взаимодействие')]},
        calendar:{events:[{id:'qa-registered',label:T('Регистрация тестового образца'),date:'2026-11-11'},{id:'qa-received',label:T('Получение тестового образца'),date:'2026-11-10'}],rules:[O('qa-30','30 календарных дней'),O('qa-7','7 календарных дней')],starts:[O('exclude_anchor','Со следующего дня'),O('include_anchor','Со дня события')],lastDays:[O('no_shift','Без переноса'),O('next_working','Следующий рабочий день')]},
        research:{prompt:T('Сопоставьте вымышленную запись и тестовый фрагмент.'),extractedLabel:T('Фрагмент синтетического образца'),findingOptions:[O('qa-found','Тестовая запись найдена'),O('qa-not-found','Тестовой записи нет')],records:[{id:'qa-record',title:T('Синтетическая карточка QA-9999'),url:'',fragments:[{id:'qa-fragment',label:T('Тестовый фрагмент'),text:T('Учебный отдел QA')},{id:'qa-other-fragment',label:T('Посторонний тестовый фрагмент'),text:T('Другой учебный отдел')}]}]}
      }
    },
    actor:{persona:T('Спокойный вымышленный посетитель QA.'),goal:T('Показать тестовые документы.'),knowledgeLimits:T('Знает только перечисленные вымышленные факты. Не знает ответов проверки.'),style:T('Короткие вежливые ответы.'),background:T('Этот сценарий создан для автоматической проверки интерфейса и не содержит реальных обращений.')},
    facts:[
      {id:'qa-registration',text:T('На вымышленной квитанции указана дата регистрации: 11 ноября 2026 года.'),prompt:T('Какая дата указана на тестовой квитанции?'),initial:false,knowledge:'document',documentIds:['qa-receipt']},
      {id:'qa-attachment',text:T('К учебному обращению приложена отдельная вымышленная служебная заметка.'),prompt:T('Есть ли второй тестовый документ?'),initial:false,knowledge:'direct',documentIds:['qa-note']}
    ],
    documents:[
      {id:'qa-receipt',title:T('Синтетическая квитанция QA-001'),type:T('Тестовый документ'),text:T('Полностью вымышленный образец. Учебное обращение QA-001 зарегистрировано 11 ноября 2026 года. Реального заявителя нет.'),initial:false,factIds:['qa-registration']},
      {id:'qa-note',title:T('Синтетическая служебная заметка QA-002'),type:T('Тестовый документ'),text:T('Полностью вымышленная запись для проверки открытия документов и сохранения выбора. Материал не относится к реальному обращению.'),initial:false,factIds:['qa-attachment']}
    ],
    rubric:{
      procedureIds:['qa-procedure'],routeIds:['qa-office'],requiredActionIds:['qa-register','qa-verify','qa-notify'],forbiddenActionIds:['qa-discard'],criticalActionIds:['qa-discard'],requiredFactIds:['qa-registration'],evidenceGroups:[['qa-receipt']],
      legal:{number:'9999',articles:['1']},deadline:'2026-12-11',explanation:T('Технический разбор вымышленного сценария QA. Это не юридическое заключение и не ответ производственного банка.'),
      authored:{factIds:['qa-fact'],evidenceSets:[['qa-receipt']],evidencePaired:true,order:[['qa-register','qa-verify'],['qa-verify','qa-notify']],rightsAction:'qa-notify',criticalRules:[{id:'qa-discard',kind:'selected'}],
        decisionPlans:[{id:'qa-plan',routes:['qa-office'],requiredActions:['qa-register','qa-verify','qa-notify'],order:[['qa-register','qa-verify'],['qa-verify','qa-notify']]}],
        knowledge:{number:'9999',actDate:'2026-01-01',articles:['1'],correct:'qa-apply'},calendar:{anchor:'qa-registered',rule:'qa-30',start:'exclude_anchor',acceptedShifts:['no_shift']},
        research:{bindings:[{recordId:'qa-record',fragmentId:'qa-fragment'}],accepted:['Учебный отдел QA'],aliases:['QA training office','QA培训部门'],normalize:'text',finding:'qa-found'},trap:'qa-respect'}
    },
    followup:{intro:T('Новое вымышленное обстоятельство: учебный отдел подтвердил получение тестовых документов.'),options:[O('qa-confirm','Зафиксировать тестовое подтверждение'),O('qa-close','Удалить тестовое подтверждение')],correct:'qa-confirm',explanation:T('В этом синтетическом контракте подтверждение фиксируется.'),success:T('Синтетический сценарий завершён.'),failure:T('Проверка интерфейса зафиксировала альтернативный выбор.')}
  }));
}

export async function writeSyntheticReceptionCases(directory) {
  if (!directory) throw new Error('Provide --out /absolute/path/to/a/temporary/cases-directory');
  const target=path.resolve(directory);
  if (target===site||target.startsWith(site+path.sep)) throw new Error('Synthetic dossiers must remain outside the publicly served site directory');
  const cases=createSyntheticReceptionCases();
  await mkdir(target,{recursive:true,mode:0o700});
  const resolved=await realpath(target),resolvedSite=await realpath(site);
  if (resolved===resolvedSite||resolved.startsWith(resolvedSite+path.sep)) throw new Error('Synthetic dossiers must remain outside the publicly served site directory');
  const files=cases.map(c=>[`${c.id}.json`,JSON.stringify(c,null,2)+'\n']);
  const caseFiles=new Set(files.map(([name])=>name));
  if((await readdir(resolved)).some(name=>name.endsWith('.json')&&!caseFiles.has(name)))throw new Error('Use a temporary directory containing only this synthetic fixture');
  files.push(['README-SYNTHETIC-QA.md','# Synthetic reception UI fixtures\n\nThese three cases are fabricated exclusively for local/CI interface checks. They contain no real students, production dossiers, or production answer keys. Public catalog IDs provide the real difficulty metadata; all stories and scoring contracts are synthetic. The 59-FZ public source is used only to exercise the existing reader.\n\nThis fixture is not evidence of full-bank coverage or model/legal answer quality. Keep the separate 178-case full-bank validation. Do not seed this directory into production.\n']);
  // Reruns are safe, but a real dossier at the target is never overwritten.
  for (const [name,contents] of files) {
    try { if (await readFile(path.join(resolved,name),'utf8')!==contents) throw new Error(`Refusing to overwrite different data: ${name}`); }
    catch(error) { if(error.code!=='ENOENT')throw error; }
  }
  for (const [name,contents] of files) {
    try { await writeFile(path.join(resolved,name),contents,{flag:'wx',mode:0o600}); }
    catch(error) { if(error.code!=='EEXIST')throw error; }
  }
  return {fixture:'synthetic-reception-ui',caseCount:cases.length,levels:cases.map(c=>CATALOG_METADATA[c.id].level),directory:resolved};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--help'))console.log('node scripts/reception-ai-qa-cases.mjs --out /tmp/reception-synthetic-cases\nCreates three validated synthetic private-schema cases for local or CI UI tests only. No Firebase or paid provider calls.');
  else {const index=process.argv.indexOf('--out');console.log(JSON.stringify(await writeSyntheticReceptionCases(index<0?null:process.argv[index+1])));}
}
