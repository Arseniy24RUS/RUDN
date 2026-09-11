import {readLocal, writeLocal} from './storage.mjs';

/** Preserve invalid originals until the user explicitly chooses replacement.
 * A failed read (e.g. blocked storage) is equally protected. */
export function createProtectedStore(key, parse) {
  let raw = null, protectedRecord = false, value = null;
  try { raw = readLocal(key); if (raw) value = parse(raw); }
  catch { protectedRecord = true; }
  return {
    value,
    get protected() { return protectedRecord; },
    get original() { return raw; },
    save(next) {
      if (protectedRecord) throw Error('protected-record');
      writeLocal(key, JSON.stringify(next));
    },
    replace(next) {
      // This method is called only after a visible replacement confirmation.
      readLocal(key);
      writeLocal(key, JSON.stringify(next));
      protectedRecord = false; raw = null;
    }
  };
}

export function renderRecovery(root, store, {snapshot, download, translate, onReplace, onError}) {
  if (!store.protected) return;
  const panel=document.createElement('section'); panel.className='save-recovery'; panel.setAttribute('role','alert');
  const message=document.createElement('p');
  message.textContent=translate('Сохранённый файл повреждён или несовместим. Исходная запись защищена от перезаписи. Скачайте её перед заменой.');
  const backup=document.createElement('button'); backup.type='button';backup.className='button button-secondary';
  backup.textContent=translate('Скачать исходную запись');backup.disabled=store.original===null;
  backup.onclick=()=>download('career-recovery-original.txt',store.original,'text/plain;charset=utf-8');
  const replace=document.createElement('button');replace.type='button';replace.className='button button-primary';
  replace.textContent=translate('Сохранить текущий вариант вместо исходного');
  replace.onclick=()=>{
    if(!confirm(translate('Заменить исходную запись? Сначала сохраните её копию.')))return;
    try{store.replace(snapshot());onReplace();panel.remove();}catch{onError();}
  };
  panel.append(message,backup,replace);root.prepend(panel);
}
