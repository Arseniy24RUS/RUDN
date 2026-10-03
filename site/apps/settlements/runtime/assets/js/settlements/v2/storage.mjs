import {hash,VERSION} from './engine.mjs';
export function createStorage(owner='guest:settlements-v2'){
  const key=`rudn:settlements:v2:${hash(owner)}`;
  return {
    key,
    load(){try{const raw=localStorage.getItem(key);if(!raw)return null;const data=JSON.parse(raw);if(data.owner!==owner||data.version!==VERSION)throw new Error('Несовместимое сохранение');return data;}catch(e){throw new Error('Не удалось прочитать сохранение: '+e.message);}},
    save(state){try{if(state.owner!==owner)throw new Error('Профиль изменился');localStorage.setItem(key,JSON.stringify({...state,savedAt:new Date().toISOString()}));return true;}catch(e){throw new Error('Прогресс не сохранён в браузере. Экспортируйте файл через меню.');}},
    clear(){localStorage.removeItem(key);},
  };
}
export function download(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
