import {restoreShift,academicPeriod} from './engine.js';
import {hydrateSavedShift} from './content-library.js';
import {durableStore} from '../../../assets/js/durable-store.js';

/** Async adapter for the platform; the pure legacy helpers below remain compatible. */
export function createReceptionStorage({owner,period=academicPeriod(),backend}){
 const durableOwner=/^(student|teacher):/.test(owner)?owner:'guest:reception';
 const revisions=new Map(),observed=new Map();
 const scope=mode=>({owner:durableOwner,activitySlug:'seminar-5',mode:`${period}:${mode}`});
 const raw=mode=>{try{return localStorage.getItem(storeKey(owner,mode,period));}catch{return null;}};
 return {
  async read(mode){
   const existing=raw(mode);let parsed=null;try{parsed=JSON.parse(existing);}catch{/* Legacy reader preserves corrupt text. */}
   await hydrateSavedShift(parsed);
   const legacy=readDraftResult(owner,mode,period);observed.set(mode,existing);
   const draft=await (backend?.loadDraft?.(scope(mode))||durableStore.loadDraft(scope(mode)));
   await hydrateSavedShift(draft?.state);
   const restored=draft?.state&&restoreShift(draft.state,owner,mode,period);
   if(draft)revisions.set(draft.attemptId,draft.revision);
   if(restored&&(!legacy.state||restored.id===legacy.state.id&&Number(restored.revision)>=Number(legacy.state.revision)))return {state:restored,status:'ready',saveStatus:draft.saveStatus};
   if(legacy.state){
    const saved=await (backend?.checkpoint?.({...scope(mode),attemptId:legacy.state.id,state:legacy.state,contentVersion:'reception-v16',phase:legacy.state.completed?'completed':'answering'},{queue:owner.startsWith('student:')})||durableStore.checkpoint({...scope(mode),attemptId:legacy.state.id,state:legacy.state,contentVersion:'reception-v16'},{queue:false}));
    revisions.set(legacy.state.id,saved.revision);
   }
   return legacy;
  },
  async write(state,{replace=false}={}){
   const currentRaw=raw(state.mode);
   if(!replace&&observed.has(state.mode)&&currentRaw!==observed.get(state.mode))return {ok:false,conflict:true};
   const next={...state,revision:Number(state.revision||0)+1,savedAt:new Date().toISOString()};
   const input={...scope(state.mode),attemptId:state.id,state:next,contentVersion:'reception-v16',baseRevision:revisions.get(state.id),phase:state.completed?'completed':'answering'};
   try{
    const saved=await (backend?.checkpoint?.(input,{queue:owner.startsWith('student:')})||durableStore.checkpoint(input,{queue:false}));
    revisions.set(state.id,saved.revision);
    let legacySaved=false;
    try{
     if(raw(state.mode)!==currentRaw)return {ok:false,conflict:true};
     localStorage.setItem(storeKey(owner,state.mode,period),JSON.stringify(next));observed.set(state.mode,JSON.stringify(next));legacySaved=true;
    }catch{}
    Object.assign(state,next);
    return {ok:saved.saveStatus.durable||legacySaved,conflict:false,saveStatus:saved.saveStatus};
   }catch(error){return {ok:false,conflict:error?.code==='storage/conflict',error:String(error)};}
  },
  flush:()=>durableStore.flush(),
 };
}
export function storeKey(owner,mode,period=academicPeriod()){return `rudn.reception.v16:${encodeURIComponent(owner)}:${period}:${mode}`;}
export function readDraftResult(owner,mode,period=academicPeriod(),storage){
 let text=null;
 try{const store=storage||globalThis.localStorage;text=store.getItem(storeKey(owner,mode,period));if(!text)return {state:null,status:'empty'};const raw=JSON.parse(text),state=restoreShift(raw,owner,mode,period);return {state,status:state?'ready':'incompatible',raw:state?null:raw};}catch(error){return {state:null,status:'unavailable',rawText:text,error:String(error)};}
}
export function readDraft(owner,mode,period=academicPeriod(),storage){return readDraftResult(owner,mode,period,storage).state;}
export function writeDraft(state,storage,{replace=false}={}){
 try{const store=storage||globalThis.localStorage,key=storeKey(state.owner,state.mode,state.period),current=replace?null:JSON.parse(store.getItem(key)||'null');
  if(current&&!replace&&(current.id!==state.id||Number(current.revision||0)!==Number(state.revision||0)))return {ok:false,conflict:true};
  const revision=Number(state.revision||0)+1,savedAt=new Date().toISOString();
  store.setItem(key,JSON.stringify({...state,revision,savedAt}));state.revision=revision;state.savedAt=savedAt;return {ok:true};
 }catch(error){return {ok:false,conflict:false,error:String(error)};}
}
export function archiveDraft(state,storage){try{const store=storage||globalThis.localStorage;store.setItem(`rudn.reception.archive.v16:${encodeURIComponent(state.owner)}:${state.id}`,JSON.stringify(state));return true;}catch{return false;}}
export function legacyDrafts(owner,storage,period=academicPeriod()){
 try{const store=storage||globalThis.localStorage;return ['practice','assessment','demo'].flatMap(mode=>[
  `rudn.reception.v1:${encodeURIComponent(owner)}:${mode}`,
  `rudn.reception.v2:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v3:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v4:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v5:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v6:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v7:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v8:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v9:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v10:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v11:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v12:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v13:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v14:${encodeURIComponent(owner)}:${period}:${mode}`,
  `rudn.reception.v15:${encodeURIComponent(owner)}:${period}:${mode}`
 ]).map(key=>{try{return {key,raw:JSON.parse(store.getItem(key)||'null')}}catch{return {key,raw:store.getItem(key)}}}).filter(x=>x.raw);}catch{return [];}
}
/** Only local assignments this owner actually started are used; never another student's history. */
export function recentCaseIds(owner,period=academicPeriod(),storage){
 try{const store=storage||globalThis.localStorage,rows=[];
  for(let i=0;i<store.length;i++){
   const key=store.key(i);if(!key||!/^rudn\.reception\.(?:archive\.)?v(?:[3-9]|10|11|12|13|14|15|16):/.test(key))continue;
   try{const row=JSON.parse(store.getItem(key));if(row?.owner===owner&&row.period===period&&Array.isArray(row.caseIds)&&row.events?.length)rows.push(row);}catch{}
  }
  const seen=new Set(),unique=rows.sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;}).slice(0,6);
  return [...new Set(unique.flatMap(r=>r.caseIds.filter(id=>r.cases?.[id]?.first||r.events?.some(e=>e.caseId===id))))];
 }catch{return [];}
}
export function exportJSON(value,name='reception.json'){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
