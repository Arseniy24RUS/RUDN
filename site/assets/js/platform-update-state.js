// Update snapshots are local recovery state, never diagnostic payloads.
const STORE_NAME='snapshots',DB_NAME='rudn-platform-update-v1',PREFIX='rudn.update.snapshot.v1:';
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const uuid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const failure=code=>Object.assign(new Error(code),{code});
const identityOf=value=>typeof value==='string'?{owner:value}:{owner:String(value?.owner||''),attemptId:String(value?.attemptId||'')};
const sameIdentity=(a,b)=>a.owner===b.owner&&(a.attemptId||'')===(b.attemptId||'');

export function createUpdateSnapshotStore(options={}){
  const idb='indexedDB' in options?options.indexedDB:globalThis.indexedDB;
  let storage;try{storage='storage' in options?options.storage:globalThis.localStorage}catch{}
  let opened;
  function open(){
    if(!idb)return Promise.reject(failure('update/storage-unavailable'));
    if(!opened)opened=new Promise((resolve,reject)=>{
      let finished=false;
      const request=idb.open(options.databaseName||DB_NAME,1);
      const failed=()=>{if(finished)return;finished=true;clearTimeout(timer);opened=null;reject(failure('update/storage-unavailable'))};
      const timer=setTimeout(failed,options.timeoutMs||1500);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME,{keyPath:'token'})};
      request.onsuccess=()=>{const db=request.result;if(finished){db.close();return}finished=true;clearTimeout(timer);db.onversionchange=()=>{db.close();opened=null};resolve(db)};
      request.onerror=request.onblocked=failed;
    });
    return opened;
  }
  async function transact(mode,operation){const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,mode),request=operation(tx.objectStore(STORE_NAME));let result,finished=false;
    const failed=()=>{if(finished)return;finished=true;clearTimeout(timer);reject(failure('update/storage-unavailable'))};
    const timer=setTimeout(()=>{failed();try{tx.abort()}catch{}},options.timeoutMs||1500);
    request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>{if(finished)return;finished=true;clearTimeout(timer);resolve(result)};
    tx.onerror=tx.onabort=failed;
  })}
  return {
    async put(record){
      const data=copy(record),serialized=JSON.stringify(data);
      if(new TextEncoder().encode(serialized).byteLength>262144)throw failure('update/snapshot-oversize');
      try{await transact('readwrite',s=>s.put(data));const saved=await transact('readonly',s=>s.get(data.token));if(JSON.stringify(saved)!==serialized)throw failure('update/snapshot-mismatch');return {durable:true,token:data.token}}
      catch{if(!storage)throw failure('update/storage-unavailable');storage.setItem(PREFIX+data.token,serialized);if(storage.getItem(PREFIX+data.token)!==serialized)throw failure('update/snapshot-mismatch');return {durable:true,token:data.token}}
    },
    async get(token){let result;try{result=await transact('readonly',s=>s.get(token))}catch{}if(result)return copy(result);try{return JSON.parse(storage?.getItem(PREFIX+token)||'null')}catch{return null}},
    async remove(token){try{await transact('readwrite',s=>s.delete(token))}catch{}try{storage?.removeItem(PREFIX+token)}catch{}}
  };
}

let sharedStore;
export const updateSnapshotStore=()=>sharedStore||(sharedStore=createUpdateSnapshotStore());

// A bounded walk includes open shadow roots without serializing values/text.
function viewNodes(root){
  const list=[];function walk(node,path){if(!node||list.length>=3000)return;
    if(node.nodeType===1)list.push({node,path});
    if(node.shadowRoot)walk(node.shadowRoot,[...path,'shadow']);
    [...(node.children||[])].forEach((child,index)=>walk(child,[...path,index]));
  }walk(root,[]);return list;
}
function atPath(root,path){let node=root;for(const key of path||[])node=key==='shadow'?node?.shadowRoot:node?.children?.[key];return node}
function deepActive(document){let active=document?.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;return active}
export function captureUpdateView(root){
  const doc=root?.ownerDocument||globalThis.document,win=doc?.defaultView||globalThis;
  const active=deepActive(doc),nodes=viewNodes(root);const focus=nodes.find(x=>x.node===active);
  return {schema:1,window:{x:win.scrollX||0,y:win.scrollY||0},
    scroll:nodes.filter(({node})=>node.scrollTop||node.scrollLeft).slice(0,100).map(({node,path})=>({path,x:node.scrollLeft,y:node.scrollTop})),
    details:nodes.filter(({node})=>node.tagName==='DETAILS').slice(0,100).map(({node,path})=>({path,open:node.open})),
    focus:focus?{path:focus.path,tag:active.tagName,id:active.id||'',name:active.getAttribute?.('name')||'',start:typeof active.selectionStart==='number'?active.selectionStart:null,end:typeof active.selectionEnd==='number'?active.selectionEnd:null}:null};
}
export async function restoreUpdateView(root,state,{signal}={}){
  if(!state||signal?.aborted)return;
  const doc=root?.ownerDocument||globalThis.document,win=doc?.defaultView||globalThis;
  for(const saved of state.details||[]){const node=atPath(root,saved.path);if(node?.tagName==='DETAILS')node.open=!!saved.open}
  // Let synchronous view restoration/layout complete; never await rAF in a hidden tab.
  if(doc?.visibilityState!=='hidden'&&win.requestAnimationFrame)await new Promise(resolve=>{let done=false;const finish=()=>{if(!done){done=true;resolve()}};win.requestAnimationFrame(finish);setTimeout(finish,100)});
  if(signal?.aborted)return;
  for(const saved of state.scroll||[]){const node=atPath(root,saved.path);if(node){node.scrollLeft=saved.x;node.scrollTop=saved.y}}
  win.scrollTo?.({left:state.window?.x||0,top:state.window?.y||0,behavior:'instant'});
  const focus=state.focus;if(!focus)return;
  const node=atPath(root,focus.path);
  if(node?.tagName!==focus.tag||(focus.id&&node.id!==focus.id)||(focus.name&&node.getAttribute?.('name')!==focus.name)||node.type==='file')return;
  try{node.focus({preventScroll:true});if(focus.start!==null&&typeof node.setSelectionRange==='function')node.setSelectionRange(focus.start,focus.end)}catch{}
}

export function createUpdateAdapter({module,root,signal,getIdentity,getRevision,isBusy=()=>false,pause=()=>{},capture=()=>({}),checkpoint,restore=async()=>({status:'restored'}),diagnostics,store=updateSnapshotStore(),now=Date.now}={}){
  const doc=root?.ownerDocument||globalThis.document;
  let destroyed=false,epoch=0,pending=null,held=false,ready=null,readyIdentity=null,readyTarget=null,readyAbortCleanup=null,composition=false,filePicker=false,committed=false;
  const pointers=new Set();let preparationAbort=null,restorationAbort=null;
  const eventInside=event=>!root||event.composedPath?.().includes(root)||root.contains?.(event.target);
  const pointerDown=event=>{if(eventInside(event))pointers.add(event.pointerId)};
  const pointerUp=event=>pointers.delete(event.pointerId);
  const composing=event=>{if(eventInside(event))composition=event.type==='compositionstart'};
  const selectingFile=event=>{if(eventInside(event)&&event.target?.type==='file')filePicker=true};
  const fileDone=()=>{filePicker=false};
  const block=event=>{if(held&&eventInside(event)&&event.isTrusted!==false){event.preventDefault?.();event.stopImmediatePropagation?.()}};
  const listeners=[['pointerdown',pointerDown],['pointerup',pointerUp],['pointercancel',pointerUp],['compositionstart',composing],['compositionend',composing],['click',selectingFile],['change',fileDone],['cancel',fileDone]];
  for(const [name,handler]of listeners)doc?.addEventListener(name,handler,true);
  const blockedEvents=['beforeinput','input','change','click','keydown','pointerdown','submit'];
  for(const name of blockedEvents)doc?.addEventListener(name,block,true);
  const record=(event,fields)=>{try{diagnostics?.record?.('update-state',{...fields,stage:event==='update-result'?'restore':'checkpoint',operation:module})}catch{}};
  async function thaw(){if(!held)return;held=false;try{await pause(false)}catch{record('update-prepare',{code:'resume-failed',success:false})}}
  function cancelPreparation({discard=!committed}={}){const token=ready?.resumeToken;epoch++;preparationAbort?.abort();restorationAbort?.abort();preparationAbort=null;readyAbortCleanup?.();readyAbortCleanup=null;ready=null;readyIdentity=null;readyTarget=null;committed=false;return Promise.all([thaw(),discard&&token?store.remove(token):null])}
  const abortLifecycle=()=>{destroyed=true;cancelPreparation()};signal?.addEventListener('abort',abortLifecycle,{once:true});
  async function prepareForUpdate({targetRelease,signal:requestSignal,deadlineAt=now()+5000}={}){
    if(destroyed||signal?.aborted)return {status:'blocked',code:'disposed'};
    if(requestSignal?.aborted){await cancelPreparation();return {status:'defer',code:'cancelled'}}
    const targetBuild=targetRelease?.buildId||targetRelease||'';
    if(ready){if(readyTarget===targetBuild&&sameIdentity(readyIdentity,identityOf(getIdentity?.())))return ready;await cancelPreparation()}
    if(pending)return pending;
    if(pointers.size||composition||filePicker||isBusy())return {status:'defer',code:'interaction-active'};
    const owner=identityOf(getIdentity?.());if(!owner.owner)return {status:'blocked',code:'owner-missing'};
    const run=++epoch,controller=new AbortController();preparationAbort=controller;
    const externallyAborted=()=>controller.abort();requestSignal?.addEventListener('abort',externallyAborted,{once:true});
    const remaining=Math.max(0,Math.min(5000,deadlineAt-now()));let timeout;
    const cancelled=new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(failure('update/cancelled')),{once:true});timeout=setTimeout(()=>controller.abort(),remaining)});
    const assertCurrent=()=>{if(destroyed||run!==epoch||controller.signal.aborted||requestSignal?.aborted)throw failure('update/cancelled');if(!sameIdentity(owner,identityOf(getIdentity?.())))throw failure('update/owner-changed')};
    const work=async()=>{let createdToken;try{
      assertCurrent();held=true;await pause(true);assertCurrent();
      if(isBusy())throw failure('update/busy');
      const revision=getRevision?.();
      if(typeof checkpoint!=='function')throw failure('update/checkpoint-unsupported');
      const receipt=await checkpoint({signal:controller.signal});assertCurrent();
      if(receipt?.durable!==true)throw failure('update/not-durable');
      if(revision!==undefined&&getRevision?.()!==revision)throw failure('update/revision-changed');
      const state=await capture();assertCurrent();
      const token=uuid(),recordValue={schema:1,token,module,identity:owner,revision:receipt.revision??revision??null,checkpointRef:copy(receipt.checkpointRef??null),state:copy(state),targetBuild:targetRelease?.buildId||targetRelease||'',createdAt:now()};
      createdToken=token;await store.put(recordValue);assertCurrent();
      if(revision!==undefined&&getRevision?.()!==revision)throw failure('update/revision-changed');
      ready={status:'ready',code:'saved',checkpointRef:recordValue.checkpointRef,resumeToken:token};readyIdentity=owner;readyTarget=targetBuild;
      if(requestSignal){const abortReady=()=>{void cancelPreparation()};requestSignal.addEventListener('abort',abortReady,{once:true});readyAbortCleanup=()=>requestSignal.removeEventListener('abort',abortReady)}
      record('update-prepare',{success:true,code:'ok'});return ready;
    }finally{
      // A module may finish an asynchronous pause after the deadline already
      // thawed this adapter. Undo that late pause unless a newer run owns it.
      if(!held&&(destroyed||run!==epoch||controller.signal.aborted)){try{await pause(false)}catch{}}
      if(createdToken&&(!ready||run!==epoch||controller.signal.aborted))await store.remove(createdToken)
    }};
    pending=Promise.race([work(),cancelled]).catch(async error=>{
      if(run===epoch){ready=null;await thaw()}
      const code=String(error?.code||'update/checkpoint-failed').replace('update/','');
      record('update-prepare',{success:false,code});
      return {status:['cancelled','busy','revision-changed'].includes(code)?'defer':'blocked',code};
    }).finally(()=>{clearTimeout(timeout);requestSignal?.removeEventListener('abort',externallyAborted);if(preparationAbort===controller)preparationAbort=null;pending=null});
    return pending;
  }
  async function resumeAfterUpdate({resumeToken,signal:resumeSignal}={}){
    if(destroyed||signal?.aborted||resumeSignal?.aborted)return {status:'blocked',code:'disposed'};
    const identity=identityOf(getIdentity?.()),controller=new AbortController();restorationAbort?.abort();restorationAbort=controller;
    const abort=()=>controller.abort();resumeSignal?.addEventListener('abort',abort,{once:true});
    const active=()=>!destroyed&&!signal?.aborted&&!resumeSignal?.aborted&&!controller.signal.aborted&&sameIdentity(identity,identityOf(getIdentity?.()));
    try{
      const value=await store.get(resumeToken);if(!active())return {status:'defer',code:'cancelled'};
      if(!value||value.schema!==1||value.module!==module||!sameIdentity(identity,value.identity))return {status:'blocked',code:'resume-owner-mismatch'};
      const result=await restore({state:copy(value.state),checkpointRef:copy(value.checkpointRef),identity:copy(value.identity),revision:value.revision},{signal:controller.signal});
      if(!active())return {status:'defer',code:'cancelled'};
      const status=result?.status||'restored';record('update-result',{success:status==='restored',code:status==='restored'?'ok':result?.code||status});return {...result,status};
    }catch{record('update-result',{success:false,code:'restore-failed'});return {status:active()?'blocked':'defer',code:active()?'restore-failed':'cancelled'}}
    finally{resumeSignal?.removeEventListener('abort',abort);if(restorationAbort===controller)restorationAbort=null}
  }
  return {module,prepareForUpdate,resumeAfterUpdate,cancelPreparation,commitPreparation(){if(ready)committed=true},
    get updatePrepared(){return !!ready},get updateBusy(){return !!pending},
    destroy(){destroyed=true;cancelPreparation();for(const[name,handler]of listeners)doc?.removeEventListener(name,handler,true);for(const name of blockedEvents)doc?.removeEventListener(name,block,true);signal?.removeEventListener('abort',abortLifecycle)}
  };
}
