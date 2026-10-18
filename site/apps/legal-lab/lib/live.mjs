import {uid,ACT_TYPES} from './core.mjs';
export const PRESENCE_TTL_MS=45000;
export const PRESENCE_HEARTBEAT_MS=15000;
const safeKey=v=>typeof v==='string'&&v.length>0&&v.length<=180&&!/[.#$\[\]\/\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const safeTask=v=>{if(!/^Q(0[1-9]|[12][0-9]|3[0-8])$/.test(v||''))throw new Error('Only classroom text tasks can share selections');return v;};
const empty=()=>({hotspots:{},classifications:{},selections:{},respondents:0});
const versionKey=v=>{if(!/^[A-Za-z0-9_.-]{1,96}$/.test(v||''))throw new Error('Invalid content version');return v.replaceAll('.','_');};
export function serializePresenceAnswer(answer){if(!answer||typeof answer!=='object'||Array.isArray(answer))return null;const a={};if(safeKey(answer.docId))a.docId=answer.docId;if(Array.isArray(answer.selections)){const s=[...new Set(answer.selections.filter(safeKey))].slice(0,30);if(s.length)a.selections=s;}return a.selections?.length?a:null;}
export function aggregatePeers(records,now=Date.now(),excludeToken=null){const out=empty();for(const [token,r] of Object.entries(records||{})){if(!r||!Number.isFinite(r.expiresAt)||r.expiresAt<=now||r.expiresAt>now+PRESENCE_TTL_MS+5000||!Number.isFinite(r.updatedAt)||r.updatedAt>now+5000)continue;const a=serializePresenceAnswer(r.answer);if(!a)continue;out.respondents++;if(excludeToken instanceof Set?excludeToken.has(token):token===excludeToken)continue;for(const id of new Set((Array.isArray(a.selections)?a.selections:[]).filter(safeKey).slice(0,30)))out.selections[id]=(out.selections[id]||0)+1;}return out;}
export function aggregateAnswers(records,now){const a=aggregatePeers(records,now);return {units:a.selections,choices:a.classifications,scans:a.hotspots,total:a.respondents};}
// Heartbeats renew expiry, not visible answers. Publish only semantic changes.
function publishSnapshot(live,next){
 const key=JSON.stringify([next.taskId,next.connected,next.error||null,Boolean(next.demo),next.aggregates.respondents,Object.entries(next.aggregates.selections).sort(([a],[b])=>a.localeCompare(b))]);
 live.current=next;if(key===live.snapshotKey)return;live.snapshotKey=key;
 for(const listener of live.listeners)listener(next);
}
function scheduleExpiry(live,rows,now,enabled){
 clearTimeout(live.timer);live.timer=null;
 for(const [token,deadline]of live.retiredTokens||[])if(deadline<=now){live.retiredTokens.delete(token);live.ownedTokens.delete(token);}
 if(!enabled)return;
 let deadline=Infinity;
 for(const expiresAt of live.retiredTokens?.values()||[])deadline=Math.min(deadline,expiresAt);
 for(const row of Object.values(rows||{}))if(row&&Number.isFinite(row.expiresAt)&&row.expiresAt>now&&row.expiresAt<=now+PRESENCE_TTL_MS+5000&&Number.isFinite(row.updatedAt)&&row.updatedAt<=now+5000&&serializePresenceAnswer(row.answer))deadline=Math.min(deadline,row.expiresAt);
 if(Number.isFinite(deadline)){live.timer=setTimeout(()=>{live.timer=null;live.emit();},Math.max(1,deadline-now+1));live.timer.unref?.();}
}
/** Ephemeral same-browser demonstration with the same automatic API as Firebase. */
export class LocalLive {
 constructor({contentVersion,signal}={}){this.version=contentVersion;this.namespace='legal-lab-presence:'+versionKey(contentVersion)+':';this.signal=signal;this.listeners=[];this.taskId=null;this.ownedTokens=new Set();this.retiredTokens=new Map();this.closed=false;this.visible=globalThis.document?.visibilityState!=='hidden';this.isDemo=true;this.current={taskId:null,connected:true,aggregates:empty()};this.storageHandler=()=>this.emit();this.visibilityHandler=()=>this.setVisible(globalThis.document?.visibilityState!=='hidden');this.hideHandler=()=>this.setVisible(false);this.abortHandler=()=>this.close();globalThis.addEventListener?.('storage',this.storageHandler);globalThis.addEventListener?.('pagehide',this.hideHandler);globalThis.document?.addEventListener?.('visibilitychange',this.visibilityHandler);signal?.addEventListener('abort',this.abortHandler,{once:true});this.bc=globalThis.BroadcastChannel?new BroadcastChannel(this.namespace):null;if(this.bc)this.bc.onmessage=this.storageHandler;this.timer=null;this.heartbeat=setInterval(()=>{if(this.answer)this.write();},PRESENCE_HEARTBEAT_MS);this.heartbeat.unref?.();}
 watchTask(taskId){if(taskId!==null)safeTask(taskId);if(this.closed||this.signal?.aborted)return false;if(taskId===this.taskId)return true;this.remove();this.taskId=taskId;this.token=taskId?uid():null;if(this.token)this.ownedTokens.add(this.token);this.emit();return true;}
 async choose(answer){if(this.closed||!this.visible||!this.taskId)return false;this.answer=serializePresenceAnswer(answer);if(this.answer)this.write();else{this.remove();this.emit();}return true;}
 key(){return this.namespace+this.taskId+':'+this.token;}
 write(){if(!this.answer||!this.visible||this.closed)return;const now=Date.now();this.ownedTokens.add(this.token);localStorage.setItem(this.key(),JSON.stringify({answer:this.answer,updatedAt:now,expiresAt:now+PRESENCE_TTL_MS}));this.bc?.postMessage(null);this.emit();}
 remove(){if(this.token){localStorage.removeItem(this.key());this.ownedTokens.delete(this.token);}this.answer=null;this.bc?.postMessage(null);}
 setVisible(visible){if(this.visible===visible)return;this.visible=visible;if(!visible)this.remove();this.emit();}
 subscribe(fn){this.emit();this.listeners.push(fn);fn(this.current);return()=>{this.listeners=this.listeners.filter(x=>x!==fn);};}
 emit(){if(this.closed)return;const rows={},prefix=this.namespace+this.taskId+':';if(this.visible&&this.taskId)for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix))try{rows[key.slice(prefix.length)]=JSON.parse(localStorage.getItem(key));}catch{}}const now=Date.now();scheduleExpiry(this,rows,now,this.visible&&Boolean(this.taskId));publishSnapshot(this,{taskId:this.taskId,connected:this.visible,aggregates:aggregatePeers(rows,now,this.ownedTokens),demo:true});}
 close(){if(this.closed)return;this.remove();this.closed=true;clearTimeout(this.timer);this.timer=null;clearInterval(this.heartbeat);this.bc?.close();globalThis.removeEventListener?.('storage',this.storageHandler);globalThis.removeEventListener?.('pagehide',this.hideHandler);globalThis.document?.removeEventListener?.('visibilitychange',this.visibilityHandler);this.signal?.removeEventListener('abort',this.abortHandler);this.listeners=[];this.ownedTokens.clear();this.retiredTokens.clear();}
}
/** Existing course SDK/auth only. Public snapshots expose no profile or auth identifiers. */
export class FirebaseLive {
 constructor({backend,rootPath,contentVersion,signal}={}){if(!backend||!rootPath)throw new Error('Presence requires the existing course backend');this.b=backend;this.root=rootPath.replace(/\/$/,'')+'/live';this.version=contentVersion;this.versionKey=versionKey(contentVersion);this.signal=signal;this.uid=backend.user?.uid;this.teacher=backend.isAdmin();this.studentKey=backend.getProfile()?.studentKey;this.generation=backend.generation;this.visible=globalThis.document?.visibilityState!=='hidden';this.closed=false;this.taskId=null;this.token=null;this.ownedTokens=new Set();this.retiredTokens=new Map();this.slot=null;this.rows={};this.listeners=[];this.connected=false;this.current={taskId:null,connected:false,aggregates:empty()};this.stops=[];this.isDemo=false;this.identityHandler=()=>{if(!this.identityValid())this.close();};this.visibilityHandler=()=>this.setVisible(globalThis.document?.visibilityState!=='hidden');this.hideHandler=()=>this.setVisible(false);this.abortHandler=()=>this.close();globalThis.addEventListener?.('rudn:identitychange',this.identityHandler);globalThis.addEventListener?.('pagehide',this.hideHandler);globalThis.document?.addEventListener?.('visibilitychange',this.visibilityHandler);signal?.addEventListener('abort',this.abortHandler,{once:true});this.assert();this.stops.push(backend.db.onValue(backend.db.ref(backend.database,'.info/connected'),snap=>{if(!this.active())return;this.connected=snap.val()===true;if(!this.connected){this.retire();this.rows={};}else{this.readErrorText=null;this.errorText=this.writeErrorText||null;this.listenTask();}this.emit();},e=>this.error(e)));this.timer=null;this.heartbeat=setInterval(()=>{const slot=this.slot;if(slot?.answer&&this.connected&&this.visible)void this.publish(slot).catch(e=>{if(this.slot===slot)this.error(e,'write');});},PRESENCE_HEARTBEAT_MS);this.heartbeat.unref?.();}
 identityValid(){return this.b.generation===this.generation&&this.b.user?.uid===this.uid&&this.b.isAdmin()===this.teacher&&(this.teacher||this.b.getProfile()?.studentKey===this.studentKey);}
 assert(){if(this.closed||this.signal?.aborted||!this.identityValid())throw new Error('Профиль изменён. Откройте семинар заново.');if(!this.uid||!this.b.db||!this.b.database||(!this.teacher&&!this.studentKey))throw new Error('A course profile is required');}
 active(){if(this.closed)return false;try{this.assert();return true;}catch{this.close();return false;}}
 now(){return Date.now()+(Number(this.b.serverTimeOffset)||0);}
 ref(path=''){return this.b.db.ref(this.b.database,this.root+(path?'/'+path:''));}
 paths(slot){return {owner:'legalPresenceOwners/'+slot.token,selection:'legalPresence/'+this.versionKey+'/'+slot.taskId+'/'+slot.token};}
 watchTask(taskId){if(taskId!==null)safeTask(taskId);this.assert();if(taskId===this.taskId)return true;this.retire();this.taskId=taskId;this.rows={};this.readErrorText=null;this.writeErrorText=null;this.errorText=null;this.listenTask();this.emit();return true;}
 listenTask(){this.taskStop?.();this.taskStop=null;if(!this.taskId||!this.visible||!this.connected)return;const captured=this.taskId;this.taskStop=this.b.db.onValue(this.ref('legalPresence/'+this.versionKey+'/'+captured),snap=>{if(this.active()&&this.taskId===captured){this.rows=snap.val()||{};this.readErrorText=null;this.errorText=this.writeErrorText||null;this.emit();}},e=>this.error(e));}
 async choose(answer){this.assert();if(!this.taskId||!this.visible||!this.connected)return false;const serialized=serializePresenceAnswer(answer);if(!serialized){this.retire();this.emit();return true;}if(!this.slot){this.slot={token:uid(),taskId:this.taskId,answer:serialized,ready:false,pending:null};this.token=this.slot.token;this.ownedTokens.add(this.token);}else this.slot.answer=serialized;const slot=this.slot;try{await this.publish(slot);}catch(error){if(this.slot===slot)this.error(error,'write');throw error;}return this.active()&&this.visible&&this.connected;}
 validSlot(slot){return this.active()&&this.slot===slot&&this.taskId===slot.taskId&&this.visible&&this.connected;}
 async publish(slot){
  if(!this.validSlot(slot))return false;
  slot.dirty=true;if(slot.pending)return slot.pending;
  let resolve,reject;const job=new Promise((yes,no)=>{resolve=yes;reject=no;});slot.pending=job;
  void (async()=>{
   let written=false;
   while(slot.dirty&&this.validSlot(slot)){
    slot.dirty=false;written=await this.writeSlot(slot);
    // A heartbeat received during a write is already covered by that write.
    if(slot.lastWrittenAnswer===slot.answer)slot.dirty=false;
   }
   return written;
  })().then(resolve,reject);
  try{return await job;}finally{if(slot.pending===job)slot.pending=null;}
 }
 async writeSlot(slot){const db=this.b.db,p=this.paths(slot);if(!slot.ready){const owner={ownerUid:this.uid,contentVersion:this.version,taskId:slot.taskId,createdAt:this.now(),...(!this.teacher?{studentKey:this.studentKey}:{})};await db.set(this.ref(p.owner),owner);if(!this.validSlot(slot)){await this.cleanup(slot);return false;}await db.onDisconnect(this.ref()).update({[p.selection]:null,[p.owner]:null});if(!this.validSlot(slot)){await this.cleanup(slot);return false;}slot.ready=true;}if(!this.validSlot(slot))return false;const now=this.now(),answer=slot.answer;await db.set(this.ref(p.selection),{answer,updatedAt:now,expiresAt:now+PRESENCE_TTL_MS});slot.lastWrittenAnswer=answer;if(!this.validSlot(slot)){await this.cleanup(slot);return false;}this.writeErrorText=null;this.errorText=this.readErrorText||null;this.emit();return true;}
 async cleanup(slot){const p=this.paths(slot),db=this.b.db;try{await db.update(this.ref(),{[p.selection]:null,[p.owner]:null});await Promise.all([db.onDisconnect(this.ref(p.selection)).cancel(),db.onDisconnect(this.ref(p.owner)).cancel()]);}catch{/* TTL and the registered onDisconnect remain the fallback. */}}
 retire(){const old=this.slot;this.slot=null;this.token=null;if(old){this.retiredTokens.set(old.token,this.now()+PRESENCE_TTL_MS+5000);void this.cleanup(old);}}
 setVisible(visible){if(this.closed||this.visible===visible)return;this.visible=visible;if(!visible){this.retire();this.rows={};}this.listenTask();this.emit();}
 subscribe(fn){this.listeners.push(fn);fn(this.current);return()=>{this.listeners=this.listeners.filter(x=>x!==fn);};}
 emit(){if(!this.active())return;const now=this.now(),enabled=this.visible&&this.connected&&Boolean(this.taskId);scheduleExpiry(this,this.rows,now,enabled);publishSnapshot(this,{taskId:this.taskId,connected:this.connected&&this.visible,aggregates:enabled?aggregatePeers(this.rows,now,this.ownedTokens):empty(),...(this.errorText?{error:this.errorText}:{})});}
 error(error,kind='read'){if(!this.active())return;this[kind==='write'?'writeErrorText':'readErrorText']=String(error?.message||error);this.errorText=this.writeErrorText||this.readErrorText;this.emit();}
 close(){if(this.closed)return;this.retire();this.closed=true;this.connected=false;this.taskStop?.();for(const stop of this.stops)try{stop();}catch{}this.stops=[];clearTimeout(this.timer);this.timer=null;clearInterval(this.heartbeat);globalThis.removeEventListener?.('rudn:identitychange',this.identityHandler);globalThis.removeEventListener?.('pagehide',this.hideHandler);globalThis.document?.removeEventListener?.('visibilitychange',this.visibilityHandler);this.signal?.removeEventListener('abort',this.abortHandler);this.listeners=[];this.rows={};this.ownedTokens.clear();this.retiredTokens.clear();}
}
