/** Separate namespace: never overwrite the 2.0 replay or the 2.3 preferences. */
const PREFIX='rudn:settlements:v24:';
export function createStorage(){
  const key=id=>PREFIX+id;
  return {
    load(id){const raw=localStorage.getItem(key(id));return raw?JSON.parse(raw):null;},
    save(id,value){localStorage.setItem(key(id),JSON.stringify(value));localStorage.setItem(PREFIX+'resume',JSON.stringify({id,regionId:value.regionId,scenarioId:value.scenarioId,mode:value.ui?.mode,rulesVersion:value.rulesVersion,scenarioVersion:value.scenarioVersion}));},
    resume(){try{return JSON.parse(localStorage.getItem(PREFIX+'resume')||'null');}catch{return null;}},
    preferences(){try{return JSON.parse(localStorage.getItem(PREFIX+'preferences')||'{}');}catch{return {};}},
    setPreferences(value){localStorage.setItem(PREFIX+'preferences',JSON.stringify(value));},
    introDone(){return localStorage.getItem(PREFIX+'intro-completed')==='1';},
    finishIntro(){localStorage.setItem(PREFIX+'intro-completed','1');},
  };
}
export function downloadSave(value){
  const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`settlements-2.4-${value.regionId||'game'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
