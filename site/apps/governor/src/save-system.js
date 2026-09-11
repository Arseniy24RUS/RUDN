/* Portable local saves. SHA-256 detects accidental corruption, not cheating.
 * Rules/identifiers are checked by Engine before anything replaces a live game.
 */
(function(root){
 'use strict';
 const FORMAT='rudn-governor-save',SCHEMA=1,MAX_BYTES=20*1024*1024;
 const Key='rudn-governor-stage9-state',Backup=Key+'-backup';
 const E=()=>root.GovernorGame?.Engine||(typeof require==='function'?require('./engine.js'):null);
 const I=()=>root.GovernorGame?.Integrity||(typeof require==='function'?require('./state-integrity.js'):null);
 function error(code){const e=new Error(code);e.code=code;return e;}
 // Pure SHA-256 fallback for file/embedded contexts without WebCrypto.
 // It has exactly the same digest as WebCrypto; it is not an authentication key.
 function sha256(bytes){
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const n=bytes.length,padded=new Uint8Array(Math.ceil((n+9)/64)*64);padded.set(bytes);padded[n]=128;
  const v=new DataView(padded.buffer);v.setUint32(padded.length-8,Math.floor(n/0x20000000));v.setUint32(padded.length-4,(n*8)>>>0);
  const w=new Uint32Array(64),rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let off=0;off<padded.length;off+=64){
   for(let i=0;i<16;i++)w[i]=v.getUint32(off+i*4);
   for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rotr(x,7)^rotr(x,18)^(x>>>3))+w[i-7]+(rotr(y,17)^rotr(y,19)^(y>>>10)))>>>0;}
   let[a,b,c,d,e,f,g,j]=h;
   for(let i=0;i<64;i++){const t1=(j+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
   [a,b,c,d,e,f,g,j].forEach((x,i)=>h[i]=(h[i]+x)>>>0);
  }
  return Array.from(h,x=>x.toString(16).padStart(8,'0')).join('');
 }
 async function hash(text){
  const crypto=root.crypto||(typeof require==='function'?require('node:crypto').webcrypto:null),bytes=new TextEncoder().encode(text);
  if(!crypto?.subtle)return sha256(bytes);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 }
 async function pack(state){
  if(!E().validateState(state))throw error('invalid-state');
  const payload=JSON.stringify(state);
  const result={format:FORMAT,schema:SCHEMA,model:state.version,createdAt:new Date().toISOString(),checksum:await hash(payload),payload};
  return JSON.stringify(result,null,2);
 }
 async function unpack(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_BYTES)throw error('file-too-large');
  let box;try{box=JSON.parse(text);}catch(_){throw error('not-save-file');}
  if(!box||box.format!==FORMAT||box.schema!==SCHEMA||typeof box.payload!=='string')throw error('not-save-file');
  if(![E().VERSION,E().RECOVERY_VERSION,E().REVIEW_VERSION,'0.8.0-consolidation'].includes(box.model))throw error('incompatible-model');
  if(box.checksum!==await hash(box.payload))throw error('checksum-mismatch');
  let parsed;try{parsed=JSON.parse(box.payload);I().safeTree(parsed);}catch(_){throw error('invalid-state');}
  if(parsed.version!==box.model)throw error('incompatible-model');
  const state=E().restoreState(parsed);if(!state)throw error('invalid-state');
  return state;
 }
 class Store{
  constructor(storage){this.storage=storage;this.token=undefined;this.error=null;}
  inspect(key=Key){
   let raw;try{raw=this.storage.getItem(key);if(key===Key)this.token=raw;}catch(_){return{status:'unavailable',state:null};}
   if(!raw)return{status:'empty',state:null};
   try{const b=JSON.parse(raw);if(b.format!=='rudn-autosave'||!Number.isSafeInteger(b.revision)||b.revision<1)throw error('invalid');
    const state=E().restoreState(b.state);return state?{status:'ok',state,revision:b.revision}:{status:'corrupt',state:null};
   }catch(_){return{status:'corrupt',state:null};}
  }
  backup(){return this.inspect(Backup);}
  legacy(){return this.inspect('rudn-governor-stage8-state');}
  write(state){
   if(!E().validateState(state))throw error('invalid-state');
   const raw=this.storage.getItem(Key);
   if(this.token!==undefined&&raw!==this.token)throw error('other-tab');
   let previous=null;try{previous=raw?JSON.parse(raw):null;}catch(_){}
   const stateText=JSON.stringify(state);
   if(previous&&JSON.stringify(previous.state)===stateText){this.token=raw;return true;}
   const revision=Number.isSafeInteger(previous?.revision)?previous.revision+1:1;
   if(raw&&previous?.state&&E().validateState(previous.state))this.storage.setItem(Backup,raw);
   const next=JSON.stringify({format:'rudn-autosave',revision,savedAt:new Date().toISOString(),state});
   this.storage.setItem(Key,next);this.token=next;return true;
  }
  clear(){
   const raw=this.storage.getItem(Key);if(this.token!==undefined&&raw!==this.token)throw error('other-tab');
   if(raw){try{const b=JSON.parse(raw);if(E().validateState(b.state))this.storage.setItem(Backup,raw);}catch(_){}}
   this.storage.removeItem(Key);this.token=null;
  }
 }
 const api={FORMAT,SCHEMA,MAX_BYTES,Key,Backup,Store,pack,unpack,hash,sha256};
 root.GovernorGame=root.GovernorGame||{};root.GovernorGame.Saves=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
