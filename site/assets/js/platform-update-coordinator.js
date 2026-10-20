import {updateSnapshotStore} from './platform-update-state.js';
import * as releaseAPI from './release-bootstrap.js';
import {hasFailedRelease,recordFailedRelease} from './platform-update-failures.js';
import {captureCheckpointContracts,acceptsCheckpointContracts} from './platform-update-contracts.js';

export const UPDATE_PENDING_KEY='rudn.update.pending.v1';
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fail=code=>Object.assign(new Error(code),{code});
const safeStorage=name=>{try{return globalThis[name]}catch{return null}};
const COPY={ru:['Обновляем платформу…','Работа сохранена. Не удалось восстановить её автоматически.','Вернуться к сохранённой работе'],en:['Updating the platform…','Your work is saved. Automatic restoration failed.','Return to saved work'],zh:['正在更新平台…','作业已保存，自动恢复失败。','返回已保存的作业']};
function compatibleContracts(current,target,list){
  return acceptsCheckpointContracts(captureCheckpointContracts(current,list.map(adapter=>({module:adapter.module||'platform'}))),target);
}

// A coordinator is scoped to one document/tab. Accepted work stays in the normal
// draft/outbox stores; this envelope contains only local recovery references.
export function bootstrapUpdateCoordinator({getAdapters=()=>[],backend,diagnostics,module='platform',getOwner=()=>'',getRoute=()=>globalThis.location?.hash||'',restoreRoute,release=releaseAPI,store=updateSnapshotStore(),storage=safeStorage('sessionStorage'),persistentStorage=safeStorage('localStorage'),window:win=globalThis.window,document:doc=globalThis.document,now=Date.now,autoStart=true}={}){
  let disposed=false,running=null,restoring=null,rollbackTask=null,rollbackToken=null,rollbackController=null,contextEpoch=0,revision=0,blocked=null,transition=null,restoration=null,timer=null,debounce=null,overlay=null,switched=false;
  const context=()=>release.getReleaseContext?.();
  const moduleName=()=>typeof module==='function'?module():module;
  const record=(event,fields)=>{try{diagnostics?.record?.(event,fields)}catch{}};
  const pending=()=>{try{
    const current=JSON.parse(storage?.getItem(UPDATE_PENDING_KEY)||'null');if(current)return current;
    const token=win?.location?.href&&new URL(win.location.href).searchParams.get('rudnResume');
    return token&&/^[a-zA-Z0-9-]{12,80}$/.test(token)?JSON.parse(persistentStorage?.getItem(UPDATE_PENDING_KEY+':'+token)||'null'):null;
  }catch{return null}};
  const writePending=value=>{const json=JSON.stringify(value);storage.setItem(UPDATE_PENDING_KEY,json);if(storage.getItem(UPDATE_PENDING_KEY)!==json)throw fail('update/marker-not-durable');if(persistentStorage){const key=UPDATE_PENDING_KEY+':'+value.token;persistentStorage.setItem(key,json);if(persistentStorage.getItem(key)!==json)throw fail('update/marker-not-durable')}};
  const clearPending=token=>{storage?.removeItem(UPDATE_PENDING_KEY);persistentStorage?.removeItem(UPDATE_PENDING_KEY+':'+token);if(win?.location?.href){const url=new URL(win.location.href);if(url.searchParams.get('rudnResume')===token){url.searchParams.delete('rudnResume');win.history?.replaceState?.(null,'',url.href)}}};
  const adapters=()=>{const value=getAdapters();return Array.isArray(value)?value:[value]};
  const show=(recovery=false)=>{
    if(!doc?.body)return;
    const copy=COPY[doc.documentElement.lang]||COPY.ru;
    if(!overlay){overlay=doc.createElement('div');overlay.setAttribute('role','status');overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#ffffffed;display:grid;place-content:center;padding:24px;color:#17354a;font:16px system-ui;text-align:center';doc.body.append(overlay)}
    overlay.replaceChildren(doc.createTextNode(copy[recovery?1:0]));
    if(recovery){const button=doc.createElement('button');button.textContent=copy[2];button.style.cssText='margin-top:16px;padding:12px';button.onclick=()=>{
      const marker=pending();
      // Keep recovery snapshots and the failed-launch record for inspection,
      // but let the explicitly resumed document use future fixed releases.
      try{if(marker)persistentStorage?.setItem(UPDATE_PENDING_KEY+':failed:'+marker.token,JSON.stringify(marker));clearPending(marker?.token)}catch{}
      win?.dispatchEvent?.(new Event('rudn:update-recovery-dismissed'));hide();
    };overlay.append(button)}
  };
  const hide=()=>{overlay?.remove();overlay=null};
  async function cancel(list,{discard=true}={}){await Promise.allSettled(list.filter(Boolean).map(a=>a.cancelPreparation?.({discard})));if(pending()?.phase!=='blocked')hide()}
  const stable=(owner,route,list)=>!disposed&&owner===getOwner()&&route===getRoute()&&list.length===adapters().length&&list.every((a,i)=>adapters()[i]===a);
  async function runCheck(reason){
    if(disposed||switched||doc?.visibilityState==='hidden'||pending())return {status:'defer',code:'inactive-or-restoring'};
    const current=context();if(!current?.buildId)return {status:'defer',code:'unversioned'};
    const controller=new AbortController();transition=controller;
    let list=[],envelopeToken=null,preparationTimer=null,targetBuild='';
    try{
      const target=await release.checkRelease({signal:controller.signal});
      targetBuild=target.buildId;
      if(target.buildId===current.buildId)return {status:'current'};
      if(hasFailedRelease(target.buildId,{storage:persistentStorage}))return {status:'defer',code:'failed-release'};
      if(blocked?.build===target.buildId&&blocked.revision===revision)return {status:'defer',code:blocked.code};
      const owner=getOwner(),route=getRoute();
      list=adapters();
      if(!list.length||list.some(a=>!a?.prepareForUpdate||!a?.resumeAfterUpdate)){
        blocked={build:target.buildId,revision,code:'adapter-not-ready'};return {status:'defer',code:blocked.code};
      }
      record('update-state',{stage:'prepare-release',operation:moduleName(),code:reason});
      const receipt=await release.prepareRelease(target,{module:moduleName(),signal:controller.signal});
      if(!receipt?.ready||receipt.buildId!==target.buildId)throw fail('update/release-not-verified');
      if(!compatibleContracts(current.contracts,receipt.context?.contracts,list)){blocked={build:target.buildId,revision,code:'incompatible-contract'};record('update-state',{stage:'contract',code:'invalid',success:false});return {status:'defer',code:blocked.code}}
      if(!stable(owner,route,list))return {status:'defer',code:'context-changed'};
      const deadlineAt=now()+5000,results=[];
      const deadline=new Promise((_,reject)=>{
        const aborted=()=>reject(fail('update/deadline'));
        controller.signal.addEventListener('abort',aborted,{once:true});
        preparationTimer=setTimeout(()=>controller.abort(),Math.max(0,deadlineAt-now()));
      });
      // Each adapter also owns its input gate. No generic flush can certify readiness.
      for(const adapter of list){
        const result=await Promise.race([adapter.prepareForUpdate({targetRelease:target,signal:controller.signal,deadlineAt}),deadline]);
        if(result?.status!=='ready'||!result.resumeToken){blocked={build:target.buildId,revision,code:result?.code||'checkpoint-unconfirmed'};return {status:'defer',code:blocked.code}}
        results.push({module:adapter.module||moduleName(),resumeToken:result.resumeToken,checkpointRef:result.checkpointRef||null});
        if(now()>deadlineAt)throw fail('update/deadline');
      }
      if(!stable(owner,route,list))throw fail('update/owner-or-route-changed');
      show();envelopeToken=uid();
      const checkpointContracts=captureCheckpointContracts(current.contracts,results);
      if(!checkpointContracts)throw fail('update/incompatible-contract');
      const envelope={schema:1,token:envelopeToken,owner,sourceBuild:current.buildId,targetBuild:target.buildId,route,language:doc?.documentElement?.lang||'ru',adapters:results,checkpointContracts,previous:target.previous||null,createdAt:now()};
      const envelopeWrite=store.put(envelope).then(async saved=>{if(controller.signal.aborted){await store.remove(envelope.token);throw fail('update/deadline')}return saved});
      const saved=await Promise.race([envelopeWrite,deadline]);
      if(!saved?.durable||controller.signal.aborted||!stable(owner,route,list)||now()>deadlineAt)throw fail('update/envelope-not-ready');
      writePending({token:envelopeToken,owner,sourceBuild:current.buildId,targetBuild:target.buildId,phase:'switching',attempts:1,startedAt:now(),route,checkpointContracts,previous:target.previous||null});
      clearTimeout(preparationTimer);
      for(const adapter of list)adapter.commitPreparation?.();
      record('update-state',{stage:'switch',operation:moduleName(),success:true});
      release.activatePreparedRelease(target,{resumeToken:envelopeToken});switched=true;
      return {status:'switching',buildId:target.buildId};
    }catch(error){
      const code=error?.code||'update/preparation-failed';record('update-state',{stage:'prepare',code,success:false});
      blocked={build:targetBuild,revision,code};
      if(!switched){try{clearPending(envelopeToken)}catch{}if(envelopeToken)void store.remove(envelopeToken).catch(()=>{})}
      return {status:'defer',code};
    }finally{clearTimeout(preparationTimer);if(!switched)await cancel(list);if(transition===controller)transition=null}
  }
  function check(reason='scheduled'){
    if(running)return running;
    running=runCheck(reason).finally(()=>{running=null});return running;
  }
  function rollback(marker,envelope,code){
    if(rollbackTask)return marker.token===rollbackToken?rollbackTask:Promise.resolve({status:'defer',code:'context-changed'});
    rollbackToken=marker.token;
    rollbackTask=runRollback(marker,envelope,code).finally(()=>{rollbackTask=null;rollbackToken=null});return rollbackTask;
  }
  async function runRollback(marker,envelope,code){
    if(disposed||marker.owner!==getOwner())return {status:'defer',code:'context-changed'};
    const oldRoute=getRoute();
    record('update-state',{stage:'restore',code,success:false});
    const previous=envelope?.previous||marker.previous;
    if(marker.phase!=='rollback'&&previous?.buildId&&previous.buildId!==context()?.buildId){
      const controller=new AbortController();rollbackController=controller;let timeout;
      try{
        recordFailedRelease({buildId:marker.targetBuild,sourceBuild:marker.sourceBuild,code:'restore-failed'},{storage:persistentStorage});
        const deadline=new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(fail('update/rollback-timeout')),{once:true});timeout=setTimeout(()=>controller.abort(),5000)});
        const ready=await Promise.race([release.prepareRelease(previous,{module:moduleName(),signal:controller.signal}),deadline]);if(disposed||controller.signal.aborted||marker.owner!==getOwner()||oldRoute!==getRoute())return {status:'defer',code:'context-changed'};if(!ready?.ready)throw fail('update/rollback-unavailable');
        // Verify the saved checkpoint modules, not the failed screen's current
        // adapters. Missing metadata cannot certify a safe previous release.
        const checkpoints=envelope?.adapters;
        if(!Array.isArray(checkpoints)||!checkpoints.length||checkpoints.some(adapter=>typeof adapter?.module!=='string'||!adapter.module||typeof adapter.resumeToken!=='string'||!adapter.resumeToken)||!captureCheckpointContracts(envelope.checkpointContracts,checkpoints)||!acceptsCheckpointContracts(envelope.checkpointContracts,ready.context?.contracts))throw fail('update/rollback-incompatible-contract');
        writePending({...marker,phase:'rollback',targetBuild:previous.buildId,failedBuild:marker.targetBuild,rollbackAttempted:true});
        release.rollbackRelease(previous,{resumeToken:marker.token});switched=true;
        return {status:'rollback'};
      }catch(error){code=['update/rollback-timeout','update/rollback-incompatible-contract'].includes(error?.code)?error.code:'update/rollback-unavailable';record('update-state',{stage:'rollback',code,success:false})}
      finally{clearTimeout(timeout);if(rollbackController===controller)rollbackController=null}
    }
    if(disposed||marker.owner!==getOwner()||oldRoute!==getRoute())return {status:'defer',code:'context-changed'};
    writePending({...marker,phase:'blocked',code});show(true);
    return {status:'blocked',code};
  }
  async function runRestore(){
    const marker=pending();if(!marker)return {status:'none'};
    if(disposed)return {status:'defer',code:'disposed'};
    const current=context();if(!current?.buildId)return {status:'defer',code:'unversioned'};
    if(marker.owner!==getOwner())return {status:'defer',code:'owner-not-ready'};
    if(marker.phase==='blocked'){show(true);return {status:'blocked',code:marker.code}};
    // The process can close after the durable marker but before navigation.
    // Restore the source document first, then retry a fresh verified switch.
    const interruptedSwitch=!switched&&marker.phase==='switching'&&marker.sourceBuild===current.buildId&&marker.targetBuild!==current.buildId;
    if(marker.targetBuild!==current.buildId&&!interruptedSwitch)return {status:'defer',code:'different-build'};
    const initialOwner=getOwner(),initialRoute=getRoute();
    const controller=new AbortController();restoration?.abort();restoration=controller;
    const envelope=await store.get(marker.token);
    if(disposed||controller.signal.aborted||initialOwner!==getOwner()||initialRoute!==getRoute())return {status:'defer',code:'context-changed'};
    if(!envelope)return rollback(marker,null,'update/recovery-missing');
    if(envelope.owner!==getOwner())return {status:'defer',code:'owner-not-ready'};
    if(envelope.route!==getRoute()){
      await restoreRoute?.(envelope.route);return {status:'defer',code:'route-restoring'};
    }
    const list=adapters();
    if(list.length!==envelope.adapters.length||list.some((a,i)=>!a?.resumeAfterUpdate||(a.module||moduleName())!==envelope.adapters[i].module)){
      await restoreRoute?.(envelope.route,envelope);return {status:'defer',code:'module-not-ready'};
    }
    show();writePending({...marker,phase:marker.phase==='rollback'?'rollback':'restoring'});
    let timeout;
    try{
      timeout=setTimeout(()=>controller.abort(),10000);
      for(let i=0;i<list.length;i++){
        const result=await Promise.race([list[i].resumeAfterUpdate({resumeToken:envelope.adapters[i].resumeToken,signal:controller.signal}),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(fail('update/restore-timeout')),{once:true}))]);
        if(!stable(envelope.owner,envelope.route,list)||controller.signal.aborted)return {status:'defer',code:'context-changed'};
        if(result?.status!=='restored')return rollback(marker,envelope,result?.code||'update/restore-incomplete');
      }
      if(marker.phase==='rollback'&&marker.failedBuild&&!recordFailedRelease({buildId:marker.failedBuild,sourceBuild:marker.sourceBuild,code:'restore-failed'},{storage:persistentStorage})){
        writePending({...marker,phase:'blocked',code:'update/failure-fence-unavailable'});show(true);return {status:'blocked',code:'update/failure-fence-unavailable'};
      }
      // Only a mounted and restored module confirms the new launch.
      record('update-state',{stage:interruptedSwitch?'interrupted-switch-restored':'restored',success:true});
      release.markReleaseRestored?.();
      win?.dispatchEvent?.(new CustomEvent('rudn:update-restored',{detail:{buildId:current.buildId}}));
      clearPending(marker.token);blocked=null;
      for(const item of envelope.adapters)await store.remove(item.resumeToken);
      await store.remove(envelope.token);hide();if(interruptedSwitch)notifyStateChanged();return {status:'restored'};
    }catch(error){return stable(envelope.owner,envelope.route,list)?rollback(marker,envelope,error?.code||'update/restore-failed'):{status:'defer',code:'context-changed'}}
    finally{clearTimeout(timeout);if(restoration===controller)restoration=null;if(!switched)await cancel(list)}
  }
  function restorePending(){if(restoring)return restoring;restoring=runRestore().finally(()=>{restoring=null});return restoring}
  function notifyStateChanged(){
    revision++;blocked=null;if(disposed)return;
    clearTimeout(debounce);debounce=setTimeout(()=>{void (pending()?restorePending():check('state-change'))},800);
  }
  const wake=event=>{if(['hashchange','rudn:identitychange'].includes(event?.type)){contextEpoch++;restoration?.abort();rollbackController?.abort()}if(doc?.visibilityState!=='hidden')notifyStateChanged()};
  // Ordinary typing/scroll gestures are not a polling source. They only wake a
  // previously deferred update after its interaction/storage obstacle changed.
  const changed=()=>{if(blocked)notifyStateChanged()};
  const bootFailed=event=>{
    if(disposed||switched)return;
    const marker=pending();if(!marker)return;event.preventDefault();
    if(marker.owner!==getOwner())return;
    if(marker.phase==='blocked'){show(true);return}
    const epoch=contextEpoch,route=getRoute();
    void store.get(marker.token).then(envelope=>{
      const current=pending();
      if(disposed||switched||epoch!==contextEpoch||route!==getRoute()||current?.token!==marker.token||current.owner!==getOwner()||current.targetBuild!==marker.targetBuild||['blocked','rollback'].includes(current.phase))return;
      return rollback(current,envelope,'update/boot-failed');
    }).catch(()=>record('update-state',{stage:'restore',code:'update/recovery-unavailable',success:false}));
  };
  win?.addEventListener?.('rudn:release-boot-failed',bootFailed);
  const events=['online','pageshow','hashchange','rudn:identitychange','rudn:module-ready','rudn:update-state-changed'];
  for(const event of events)win?.addEventListener?.(event,wake);
  for(const event of ['pointerup','compositionend','change','input'])doc?.addEventListener?.(event,changed,true);
  doc?.addEventListener?.('visibilitychange',wake);
  backend?.addEventListener?.('change',wake);
  if(autoStart){timer=setInterval(()=>{if(doc?.visibilityState!=='hidden')void check('interval')},300000);queueMicrotask(()=>void (pending()?restorePending():check('startup')))}
  return {check,restorePending,notifyStateChanged,destroy(){disposed=true;if(!switched)transition?.abort();restoration?.abort();rollbackController?.abort();clearTimeout(debounce);clearInterval(timer);hide();win?.removeEventListener?.('rudn:release-boot-failed',bootFailed);for(const event of events)win?.removeEventListener?.(event,wake);for(const event of ['pointerup','compositionend','change','input'])doc?.removeEventListener?.(event,changed,true);doc?.removeEventListener?.('visibilitychange',wake);backend?.removeEventListener?.('change',wake);void cancel(adapters(),{discard:!switched})}};
}
