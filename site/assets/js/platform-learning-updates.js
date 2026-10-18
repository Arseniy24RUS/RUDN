import {createUpdateAdapter,captureUpdateView,restoreUpdateView} from './platform-update-state.js';
import {durableStore} from './durable-store.js';
import {attemptOwner,persistQuiz} from './attempt-session.js?v=1.3.10';

export function exposeModuleUpdateAdapter(cleanup,getHandle,module){
  Object.defineProperty(cleanup,'module',{configurable:true,get:()=>getHandle()?.module||module});
  cleanup.prepareForUpdate=options=>getHandle()?.prepareForUpdate?.(options)||Promise.resolve({status:'defer',code:'module-loading'});
  cleanup.resumeAfterUpdate=options=>getHandle()?.resumeAfterUpdate?.(options)||Promise.resolve({status:'blocked',code:'module-loading'});
  cleanup.cancelPreparation=options=>getHandle()?.cancelPreparation?.(options);
  cleanup.commitPreparation=()=>getHandle()?.commitPreparation?.();
  return cleanup;
}
export function bindQuizUpdate({root,getSession,diagnostics}){
  const scope=()=>{const s=getSession();return {owner:s.owner,activitySlug:s.activitySlug,mode:s.buildOptions?.mode||'default',attemptId:s.id}};
  const session=getSession(),activity=session.activitySlug==='seminar-1'&&session.buildOptions?.mode==='assessment'?'seminar-1-assessment':session.activitySlug;
  return createUpdateAdapter({module:`quiz:${activity}`,root,diagnostics,
    getIdentity:()=>({owner:attemptOwner(),attemptId:getSession().id}),
    isBusy:()=>getSession().phase==='submitting',
    capture:()=>({view:captureUpdateView(root)}),
    checkpoint:async()=>{
      if(getSession().owner==='guest')return {durable:false};
      if(!await persistQuiz(getSession()))return {durable:false};
      await durableStore.flush();const saved=await durableStore.getSaveStatus(scope());
      return {durable:saved.durable===true&&!['empty','conflict','unsafe'].includes(saved.state),revision:saved.revision,checkpointRef:getSession().id};
    },
    restore:async({state},options)=>{await restoreUpdateView(root,state.view,options);return {status:'restored'}}
  });
}
export function bindFormUpdate({root,controller,diagnostics}){
  return createUpdateAdapter({module:`form:${controller.scope.activitySlug}`,root,diagnostics,
    getIdentity:()=>({owner:attemptOwner(),attemptId:controller.attemptId}),
    isBusy:()=>root.dataset.saving==='true',
    capture:()=>({view:captureUpdateView(root)}),
    checkpoint:async()=>{
      await controller.save();await controller.flush();
      const saved=await durableStore.getSaveStatus({...controller.scope,attemptId:controller.attemptId});
      return {durable:saved.durable===true&&!['empty','conflict','unsafe'].includes(saved.state)&&!saved.missingAttachment,revision:saved.revision,checkpointRef:controller.attemptId};
    },
    restore:async({state},options)=>{await restoreUpdateView(root,state.view,options);return {status:'restored'}}
  });
}
