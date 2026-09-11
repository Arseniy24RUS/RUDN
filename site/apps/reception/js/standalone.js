import {confirmAction} from './confirm.js';
import {mountReception} from './app.js';
import {prepareCalendars} from '../../../assets/js/calendar-repository.js';
import {restoreShift} from './engine.js';
import {exportJSON} from './storage.js';
import {esc} from './icons.js';

const LOCAL_BACKUP_FORMAT='rudn-reception-local-backup-1';
const localKey=key=>/^rudn\.reception\.(?:v16:preview:\d{4}-\d{4}:(?:practice|demo)|archive\.v16:preview:[\w-]+|lastmode\.v16:preview:\d{4}-\d{4})$/.test(key);
export function makeLocalBackup(storage=localStorage){
 const entries=[];
 for(let i=0;i<storage.length;i++){const key=storage.key(i);if(localKey(key))entries.push({key,value:storage.getItem(key)});}
 return {format:LOCAL_BACKUP_FORMAT,createdAt:new Date().toISOString(),entries};
}
export function parseLocalBackup(text){
 if(typeof text!=='string'||text.length>15000000)throw Error('Размер копии превышает 15 МБ.');
 const data=JSON.parse(text);
 if(data?.format!==LOCAL_BACKUP_FORMAT||!Array.isArray(data.entries)||data.entries.length>1000)throw Error('Это не резервная копия автономной версии.');
 const seen=new Set();
 for(const e of data.entries){
  if(!e||!localKey(e.key)||typeof e.value!=='string'||seen.has(e.key))throw Error('Некорректный состав резервной копии.');
  seen.add(e.key);
  if(e.key.includes('.lastmode.')){if(!['practice','demo'].includes(e.value))throw Error('Неизвестный режим.');continue;}
  const s=JSON.parse(e.value);
  if(s?.owner!=='preview'||(!e.key.includes('.archive.')&&(!['practice','demo'].includes(s.mode)||!restoreShift(s,'preview',s.mode,s.period))))throw Error('Копия содержит повреждённую или несовместимую смену.');
  const expected=e.key.includes('.archive.')?`rudn.reception.archive.v16:preview:${s.id}`:`rudn.reception.v16:preview:${s.period}:${s.mode}`;
  if(e.key!==expected)throw Error('Смена не соответствует записи в копии.');
 }
 return data;
}
export function restoreLocalBackup(data,storage=localStorage){
 // Validate again at the write boundary. Back up replaced drafts, never touch platform profiles.
 data=parseLocalBackup(JSON.stringify(data));
 const before=new Map(),written=[];
 const put=(key,value)=>{if(!before.has(key))before.set(key,storage.getItem(key));storage.setItem(key,value);written.push(key);};
 try{
  for(const e of data.entries){
   const current=storage.getItem(e.key);
   let value=e.value;
   if(current&&current!==e.value&&!e.key.includes('.lastmode.')){
    let old;try{old=JSON.parse(current);}catch{}
    if(!old||typeof old!=='object'||old.owner!=='preview')old={owner:'preview',preservedCorruptDraft:current};
    // Unique archive IDs preserve both versions of the same attempt.
    const id=`backup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    put(`rudn.reception.archive.v16:preview:${id}`,JSON.stringify({...old,id}));
    if(!e.key.includes('.archive.')){
     // Two devices can reach the same revision with different answers. Advance it
     // so every already-open tab detects the imported branch before saving again.
     const restored=JSON.parse(e.value),previousRevision=Number.isSafeInteger(old.revision)&&old.revision>=0?old.revision:0;
     const revision=Math.max(restored.revision||0,previousRevision)+1;
     if(!Number.isSafeInteger(revision))throw Error('Недопустимый номер версии черновика.');
     value=JSON.stringify({...restored,revision});
    }
   }
   put(e.key,value);
  }
 }catch(error){for(const key of [...new Set(written)].reverse()){try{const old=before.get(key);old===null?storage.removeItem(key):storage.setItem(key,old);}catch{}}throw Error('Не удалось восстановить копию. Проверьте свободное место в хранилище. '+error.message);}
 return data.entries.length;
}

/** Offline first: use the supplied published calendar; fetch only when the current year is absent. */
export async function standaloneCalendar(options={}){
 try{return await prepareCalendars({...options,offline:true});}
 catch(error){if(error.code!=='calendar/current-unavailable')throw error;return prepareCalendars({...options,offline:false});}
}

export async function mountStandalone(root){
 const dialog=document.createElement('dialog');dialog.className='rx-help-dialog';dialog.setAttribute('aria-labelledby','rxHelpTitle');
 dialog.innerHTML=`<form method="dialog"><header><h2 id="rxHelpTitle">Работа с тренажёром</h2><button class="rx-help-close" aria-label="Закрыть справку">×</button></header></form>
 <p>Вы — сотрудник приёмной. Уточните обстоятельства, сопоставьте документы, найдите норму, рассчитайте срок и составьте план. После подтверждения решения прочитайте продолжение дела.</p>
 <p><strong>Обучение</strong> позволяет разбирать любую историю, получать объяснения и исправлять решения. <strong>Самостоятельная смена</strong> состоит из восьми дел без подсказок; итог — от 0 до 5 баллов. В автономной версии он остаётся на этом устройстве.</p>
 <p>В верхней части рабочего экрана находятся инструменты: приём, документы, источники, календарь, решение и история. Все действия доступны кнопками и с клавиатуры. Перетаскивать элементы не требуется.</p>
 <h3>Сохранение и перенос</h3><p>Ответы сохраняются автоматически в этом браузере. Для продолжения на другом устройстве сохраните резервную копию и загрузите её там. Очистка данных сайта удаляет локальные работы. Для каждого студента используйте отдельный профиль браузера.</p>
 <div class="rx-help-actions"><button type="button" data-local-backup>Сохранить резервную копию</button><label class="rx-help-file">Восстановить из копии<input type="file" accept=".json,application/json" data-local-restore></label></div>
 <h3>Календарь и источники</h3><p>Календарь закрепляется при создании смены. Работа с уже загруженными материалами не требует сети. Внешние сайты открываются отдельно. Учебные обращения никуда не отправляются. Версия 1.0.1 доступна на русском языке.</p>
 <button type="button" data-local-calendar>Проверить обновление календарей</button><p>Обновление применяется только к новым сменам. Для обновления нужно подключение к интернету.</p>
 <p class="rx-help-status" role="status" aria-live="polite"></p>`;
 document.body.append(dialog);
 const status=message=>dialog.querySelector('.rx-help-status').textContent=message;
 dialog.querySelector('[data-local-backup]').addEventListener('click',()=>{try{const data=makeLocalBackup();exportJSON(data,`reception-backup-${new Date().toISOString().slice(0,10)}.json`);status('Резервная копия подготовлена для скачивания.');}catch{status('Не удалось прочитать локальное хранилище.');}});
 dialog.querySelector('[data-local-restore]').addEventListener('change',async e=>{
  try{const file=e.target.files?.[0];if(!file)return;if(file.size>15000000)throw Error('Размер копии превышает 15 МБ.');const data=parseLocalBackup(await file.text());
   if(!data.entries.length)throw Error('Копия не содержит работ.');
   if(!await confirmAction(`Восстановить записи из резервной копии (${data.entries.length})? Текущие смены будут сохранены в локальном архиве.`))return;
   restoreLocalBackup(data);location.reload();
  }catch(error){status('Копия не загружена: '+error.message);}finally{e.target.value='';}
 });
 dialog.querySelector('[data-local-calendar]').addEventListener('click',async e=>{e.target.disabled=true;status('Проверяем опубликованные календари…');try{const r=await prepareCalendars();status(`Календарь ${r.year}: ${r.stale?'используется сохранённая копия':'доступен'}. Новые данные применятся при запуске следующей смены.`);}catch(error){status(error.message);}finally{e.target.disabled=false;}});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 try{
  const cleanup=await mountReception(root,{standalone:true,editorTools:false,profileLabel:'Автономная работа',assessmentAllowed:false,calendarLoader:standaloneCalendar,onHelp:()=>dialog.showModal()});
  return ()=>{cleanup?.();dialog.remove();};
 }catch(error){root.innerHTML=`<section class="boot" role="alert"><h1>Не удалось открыть тренажёр</h1><p>${esc(error.message)}</p><p>Распакуйте весь архив и откройте START_HERE.html. Сохранённые работы не удалены.</p><button type="button" id="rxBootReload">Повторить</button></section>`;root.querySelector('#rxBootReload').onclick=()=>location.reload();}
}
