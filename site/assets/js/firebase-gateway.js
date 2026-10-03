// Route Firebase SDK fetch/XHR through the platform's own HTTPS gateway.
// Authentication, persistence, refresh and permissions remain in Firebase SDK.
const SERVICES=new Map([
  ['identitytoolkit.googleapis.com','auth'],
  ['securetoken.googleapis.com','token'],
  ['firebasestorage.googleapis.com','storage'],
  // Only this platform database; other projects and local emulators stay direct.
  ['rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app','database']
]);
const INSTALL=Symbol.for('rudn.firebase.gateway');
export function firebaseGatewayUrl(input,gateway){
  if(!gateway)return input;
  let url;try{url=new URL(String(input),globalThis.location?.href);}catch{return input;}
  const service=SERVICES.get(url.hostname);
  if(!service||url.protocol!=='https:'||url.username||url.password)return input;
  const base=new URL(gateway);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new TypeError('A plain HTTPS gateway origin is required.');
  return new URL(`firebase/${service}${url.pathname}${url.search}`,base.href.replace(/\/$/,'')+'/').href;
}
export function installFirebaseGateway(gateway,{target=globalThis}={}){
  if(!gateway||target[INSTALL])return;
  firebaseGatewayUrl('https://identitytoolkit.googleapis.com/',gateway);
  const nativeFetch=target.fetch.bind(target);
  target.fetch=function(input,init){
    const original=typeof input==='string'||input instanceof URL?String(input):input?.url;
    const rewritten=firebaseGatewayUrl(original,gateway);
    if(rewritten===original)return nativeFetch(input,init);
    // A Request clone retains body streams, headers, method and AbortSignal.
    if(typeof input==='object'&&input instanceof Request)return nativeFetch(new Request(rewritten,input),init);
    return nativeFetch(rewritten,init);
  };
  const prototype=target.XMLHttpRequest?.prototype;
  if(prototype){
    const open=prototype.open;
    prototype.open=function(method,url,...rest){return open.call(this,method,firebaseGatewayUrl(url,gateway),...rest);};
  }
  target[INSTALL]={gateway};
}
