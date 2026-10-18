const failure=code=>Object.assign(new Error(code),{code});
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).filter(([key])=>key!=='writtenAt').sort(([a],[b])=>a.localeCompare(b))):item);
// The v2 service owns identity binding, append-only storage and deletion generations.
// Error messages and response bodies are deliberately not exposed as telemetry.
export async function requestDiagnostics({endpoint,token,action,payload={},signal,fetchImpl=globalThis.fetch,timeoutMs=12000}){
  const controller=new AbortController();const aborted=()=>controller.abort();
  if(signal?.aborted)throw failure('diagnostics/cancelled');
  signal?.addEventListener('abort',aborted,{once:true});
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    if(!token||typeof token!=='string')throw failure('diagnostics/auth');
    const url=new URL(endpoint);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw failure('diagnostics/endpoint');
    const response=await fetchImpl(url.href,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...payload,action}),signal:controller.signal,cache:'no-store',credentials:'omit'});
    let data;try{data=await response.json()}catch{throw failure('diagnostics/invalid-response')}
    if(!response.ok||data?.ok!==true){const code=typeof data?.error?.code==='string'&&/^[a-z0-9/_-]{1,80}$/i.test(data.error.code)?data.error.code:'diagnostics/request-failed';throw Object.assign(failure(code),{status:response.status,retryAfterMs:Math.max(0,Math.min(300000,Number(data?.error?.retryAfterMs)||0))})}
    return data;
  }catch(error){if(controller.signal.aborted)throw failure(signal?.aborted?'diagnostics/cancelled':'diagnostics/timeout');if(error?.code)throw error;throw failure('diagnostics/network')}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',aborted)}
}
export async function confirmDiagnosticBatch({transport,uid,slot,batch,value,signal}){
  const current=(await transport.get(`diagnostics/${uid}/${slot}/${batch}`,{signal,timeoutMs:6000})).value;
  return current?.batchId===value.batchId&&stable(current)===stable(value);
}
export async function writeDiagnosticBatch({transport,uid,slot,batch,value,signal}){
  if(!/^s[0-3]$/.test(slot)||!/^b[0-7]$/.test(batch))throw failure('diagnostics/invalid-slot');
  const result=await transport.transaction(`diagnostics/${uid}/${slot}/${batch}`,current=>{
    if(current?.batchId===value.batchId){if(stable(current)!==stable(value))throw failure('diagnostics/batch-conflict');return undefined;}
    return {...value,writtenAt:{'.sv':'timestamp'}};
  },{signal,retries:1});
  if(result.value?.batchId!==value.batchId)throw failure('diagnostics/batch-conflict');return true;
}
export async function claimDiagnosticSession({transport,uid,sessionId,preferredSlot,now,signal}){
  if(!/^[a-z0-9]{12,40}$/.test(sessionId))throw failure('diagnostics/invalid-session');
  for(let offset=0;offset<4;offset++){
    const slot=(preferredSlot+offset)%4;
    const result=await transport.transaction(`diagnosticSessions/${uid}/s${slot}`,current=>{
      const stamp=now();if(current&&current.sessionId!==sessionId&&current.expiresAt>stamp)return undefined;
      return {sessionId,updatedAt:stamp,expiresAt:stamp+600000};
    },{signal,retries:2});
    if(result.committed)return slot;
  }
  return null;
}
export async function readDiagnosticPage({transport,after=null,now=Date.now,isCurrent=()=>true,signal}){
  const assertCurrent=()=>{if(signal?.aborted||!isCurrent())throw failure('auth/profile-changed')};
  assertCurrent();const query={orderBy:'$key',limitToFirst:21,...(after?{startAt:after}:{})};
  const raw=(await transport.get('diagnostics',{timeoutMs:12000,query,signal})).value||{};assertCurrent();
  const owners=Object.entries(raw).sort(([a],[b])=>a<b?-1:a>b?1:0).filter(([key])=>!after||key>after).slice(0,20),rows=[],expiredPaths=[],stamp=now();
  for(const [owner,slots] of owners)for(const [slot,batches] of Object.entries(slots||{}))for(const [batch,value] of Object.entries(batches||{})){
    if(!/^s[0-3]$/.test(slot)||!/^b[0-7]$/.test(batch)||/[.#$\[\]\/]/.test(owner))continue;
    if(value?.expiresAt<=stamp)expiredPaths.push(`diagnostics/${owner}/${slot}/${batch}`);
    else if(value?.schema===1&&value?.expiresAt>stamp)rows.push(value);
  }
  assertCurrent();return {rows:rows.sort((a,b)=>b.createdAt-a.createdAt),expiredPaths,nextAfter:Object.keys(raw).length===21&&owners.length?owners.at(-1)[0]:null};
}
