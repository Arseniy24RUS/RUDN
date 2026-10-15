// Official localhost Auth/RTDB emulators + the actual course durable/sync/adapter modules.
import assert from 'node:assert/strict';
import {createFirebaseRestTransport} from '../site/assets/js/firebase-rest.js';
import {runLegalLabSyncRegression} from './test_legal_lab_conflict.mjs';
const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-rudn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
assert.equal(auth.status,200);const login=await auth.json(),user={uid:login.localId,getIdToken:async()=>login.idToken};
const studentKey=String(Date.now());let offline=false,loseAttemptAck=false;
const transport=createFirebaseRestTransport({databaseURL:'http://127.0.0.1:9000',namespace:'demo-rudn-default-rtdb',rootPath:'rudn-platform/v1',getUser:()=>user,fetchImpl:async(url,options)=>{
  assert.equal(new URL(url).hostname,'127.0.0.1');if(offline)throw new TypeError('Synthetic offline connection');
  const response=await fetch(url,options);
  if(loseAttemptAck&&options.method==='PUT'&&new URL(url).pathname.includes('/attempts/')){assert.equal(response.status,200);loseAttemptAck=false;throw new TypeError('Synthetic acknowledgement loss after actual commit');}
  return response;
}});
await transport.put('profiles/'+studentKey,{studentKey,ticket:studentKey,email:studentKey+'@rudn.ru',fullName:'Synthetic Legal Sync',group:'ГГУбд-01-26',ownerUid:user.uid,ownerUids:{[user.uid]:true}});
const result=await runLegalLabSyncRegression({transport,user,studentKey,setOffline:value=>offline=value,setLoseAttemptAck:value=>loseAttemptAck=value,ackLossPending:()=>loseAttemptAck,environment:'official Firebase Auth/RTDB demo-rudn emulators using repository database rules'});
console.log(JSON.stringify(result,null,2));
