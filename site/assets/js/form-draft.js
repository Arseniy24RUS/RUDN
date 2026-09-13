import {backend} from './backend.js?v=1.3.5';
import {durableStore} from './durable-store.js';
import {attemptOwner} from './attempt-session.js?v=1.3.5';
import {getLocale} from './i18n.js?v=1.3.5';
import {toast,registerRecoveryProvider} from './notifications.js?v=1.3.5';

const controllers=new WeakMap();
const copy={ru:['Сохранено на устройстве','Ожидает отправки','Сохранено','Вложение: '],en:['Saved on this device','Waiting to send','Saved','Attachment: '],zh:['已保存在此设备上','等待上传','已保存','附件：']};

export async function mountFormDraft(form,activitySlug){
  if(controllers.has(form))return controllers.get(form);
  const owner=attemptOwner();if(owner==='guest')return null;
  let disposed=false,tail=Promise.resolve(),state={fields:{},files:{}},draft=null;
  const scope={owner,activitySlug,mode:'form'};
  draft=await (backend.loadDraft?backend.loadDraft(scope):durableStore.loadDraft(scope));
  if(!form.isConnected||owner!==attemptOwner())return null;
  const resumed=draft&&draft.phase!=='completed';
  const attemptId=resumed?draft.attemptId:crypto.randomUUID();
  if(resumed)state=structuredClone(draft.state);
  state.fields||={};state.files||={};
  const status=document.createElement('p');status.className='muted form-save-status full';status.setAttribute('role','status');
  const actions=form.querySelector('[type="submit"]')?.closest('div');
  if(actions&&form.contains(actions))actions.before(status);else form.append(status);
  const controls=[...form.querySelectorAll('input[name],textarea[name],select[name]')];
  for(const input of controls){
    if(input.type==='file'){
      const file=state.files[input.name];if(file){
        input.required=false;
        const label=document.createElement('small');label.className='muted';label.dataset.savedAttachment=input.name;
        label.textContent=copy[getLocale()][3]+file.name;input.after(label);
      }
    }else if(Object.hasOwn(state.fields,input.name)){
      if(['radio','checkbox'].includes(input.type))input.checked=Boolean(state.fields[input.name]?.includes?.(input.value));
      else input.value=state.fields[input.name];
    }
  }
  const fileObjects=new WeakMap();
  const updateStatus=async()=>{
    const saved=await durableStore.getSaveStatus({...scope,attemptId});
    if(disposed)return;
    const words=copy[getLocale()]||copy.ru;
    status.textContent=words[saved.state==='saved'?2:saved.pending?1:0];
    if(saved.durable===false&&Object.keys(state.fields).length)toast({code:'storage/local-save-failed'},'error',0);
  };
  const save=()=>{
    // Capture the DOM synchronously: navigation never reads a later/different form.
    const snapshot={fields:{},files:{...state.files}};
    const files=[];
    for(const input of controls){
      if(input.type==='file'){if(input.files[0])files.push([input.name,input.files[0]]);continue}
      if(['checkbox','radio'].includes(input.type)){snapshot.fields[input.name]||=[];if(input.checked)snapshot.fields[input.name].push(input.value)}
      else snapshot.fields[input.name]=input.value;
    }
    state={...snapshot};
    tail=tail.catch(()=>{}).then(async()=>{
      for(const [name,file]of files){
        let attachment=fileObjects.get(file);
        if(!attachment){
          if(owner.startsWith('teacher:')){const saved=await durableStore.putAttachment({owner,attemptId,blob:file,name:file.name,type:file.type});attachment={id:saved.id,ref:'rudn-attachment:'+saved.id}}
          else attachment=await backend.queueAttachment(activitySlug,file,{attemptId});
          fileObjects.set(file,attachment);
        }
        snapshot.files[name]={...attachment,name:file.name,type:file.type,size:file.size};
      }
      state=snapshot;
      const input={...scope,attemptId,state:snapshot,contentVersion:'form-v1',attachmentIds:Object.values(snapshot.files).map(file=>file.id)};
      const saved=await (backend.checkpoint?backend.checkpoint(input):durableStore.checkpoint(input,{queue:owner.startsWith('student:')}));
      if(saved.saveStatus?.durable===false)throw Object.assign(new Error('Cannot save locally'),{code:'storage/local-save-failed'});
      await updateStatus();
    }).catch(error=>{toast(error,'error',0,{critical:true});throw error});
    tail.catch(()=>{});return tail;
  };
  const onInput=()=>{void save().catch(()=>{})};
  form.addEventListener('input',onInput);form.addEventListener('change',onInput);
  const unregister=registerRecoveryProvider(()=>owner===attemptOwner()?{owner,activitySlug,attemptId,state}:null);
  const unsubscribe=durableStore.subscribe(()=>{void updateStatus().catch(()=>{})});
  const controller={attemptId,scope,flush:()=>tail,save,attachment:async name=>{await save();return state.files[name]||null},
    destroy:async()=>{await tail;disposed=true;form.removeEventListener('input',onInput);form.removeEventListener('change',onInput);unsubscribe();unregister();controllers.delete(form)}};
  controllers.set(form,controller);form.dataset.attemptId=attemptId;
  if(resumed)await updateStatus();
  return controller;
}
export const formDraft=form=>controllers.get(form);
