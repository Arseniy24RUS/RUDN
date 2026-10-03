// Project-specific HTTPS transport. Firebase authenticates every operation and
// enforces its existing Database/Storage Rules. No Admin SDK, secrets or logging.
const API_KEY='AIzaSyBH5MD8tpcV2DSFiE7K4FLzfUIYPNfHYHQ';
const BUCKET='rudn-gmu-learning-platform.firebasestorage.app';
const DATABASE='rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app';
const ORIGIN='https://arseniy24rus.github.io';
const AUTH_POST=new Set(['signInWithPassword','signUp','lookup','sendOobCode','update']);
const REQUEST_HEADERS=['content-type','authorization','if-match','if-none-match','range','x-firebase-etag','x-firebase-appcheck','x-client-version','x-firebase-gmpid','x-firebase-locale','x-firebase-client','x-firebase-storage-version','x-goog-upload-protocol','x-goog-upload-command','x-goog-upload-offset','x-goog-upload-header-content-length','x-goog-upload-header-content-type'];
const RESPONSE_HEADERS=['content-type','content-disposition','content-range','accept-ranges','etag','x-goog-upload-status','x-goog-upload-size-received','x-goog-upload-chunk-granularity'];
function headers(origin){return new Headers({'access-control-allow-origin':origin,'vary':'Origin','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});}
function fail(status,origin,code){return new Response(JSON.stringify({error:{code:status,message:code}}),{status,headers:new Headers([...headers(origin),['content-type','application/json']])});}
export function upstreamFor(url,method){
  if(url.hash||url.username||url.password)return null;
  const prefix='/firebase/',path=url.pathname;
  if(!path.startsWith(prefix))return null;
  const [service,...parts]=path.slice(prefix.length).split('/'),suffix='/'+parts.join('/');
  let host;
  if(service==='auth'){
    const operation=suffix.match(/^\/v1\/accounts:([A-Za-z]+)$/)?.[1];
    if(!((method==='POST'&&AUTH_POST.has(operation))||(method==='GET'&&['/v1/projects','/v2/recaptchaConfig'].includes(suffix))))return null;
    if(url.searchParams.get('key')!==API_KEY)return null;
    host='identitytoolkit.googleapis.com';
  }else if(service==='token'){
    if(method!=='POST'||suffix!=='/v1/token'||url.searchParams.get('key')!==API_KEY)return null;
    host='securetoken.googleapis.com';
  }else if(service==='storage'){
    if(!['GET','HEAD','POST','PUT','DELETE'].includes(method)||!suffix.startsWith(`/v0/b/${BUCKET}/o`)||!new RegExp(`^/v0/b/${BUCKET.replaceAll('.','\\.')}/o(?:/|$)`).test(suffix))return null;
    host='firebasestorage.googleapis.com';
  }else if(service==='database'){
    if(!['GET','PUT','PATCH','DELETE'].includes(method)||!suffix.startsWith('/rudn-platform/v1/')||!suffix.endsWith('.json'))return null;
    host=DATABASE;
  }else return null;
  return new URL(suffix+url.search,'https://'+host);
}
export async function handle(request,{fetchImpl=fetch,publicBase}={}){
  const url=new URL(request.url),origin=request.headers.get('origin')||ORIGIN;
  if(url.pathname==='/health'&&request.method==='GET')return new Response(JSON.stringify({ok:true,project:'rudn-gmu-learning-platform',version:1}),{headers:new Headers([...headers(ORIGIN),['content-type','application/json']])});
  if(origin!==ORIGIN)return fail(403,ORIGIN,'ORIGIN_NOT_ALLOWED');
  if(request.method==='OPTIONS'){
    const requestedMethod=request.headers.get('access-control-request-method')||'GET';
    if(!upstreamFor(url,requestedMethod))return fail(404,origin,'ROUTE_NOT_ALLOWED');
    const result=headers(origin);result.set('access-control-allow-methods','GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');result.set('access-control-allow-headers',REQUEST_HEADERS.join(', '));result.set('access-control-max-age','600');return new Response(null,{status:204,headers:result});
  }
  const upstream=upstreamFor(url,request.method);
  if(!upstream)return fail(404,origin,'ROUTE_NOT_ALLOWED');
  const length=Number(request.headers.get('content-length')||0);
  if(length>12*1024*1024+65536)return fail(413,origin,'REQUEST_TOO_LARGE');
  const forwarding=new Headers();for(const name of REQUEST_HEADERS){const value=request.headers.get(name);if(value!==null)forwarding.set(name,value);}
  // Preserve the platform origin for project API-key restrictions, never cookies.
  forwarding.set('origin',ORIGIN);forwarding.set('referer',ORIGIN+'/RUDN/');
  try{
    const response=await fetchImpl(upstream.href,{method:request.method,headers:forwarding,...(['GET','HEAD'].includes(request.method)?{}:{body:request.body,duplex:'half'}),redirect:'manual',signal:request.signal});
    if(response.status>=300&&response.status<400)return fail(502,origin,'UPSTREAM_REDIRECT_REJECTED');
    const result=headers(origin);
    for(const name of RESPONSE_HEADERS){const value=response.headers.get(name);if(value!==null)result.set(name,value);}
    const uploadUrl=response.headers.get('x-goog-upload-url');
    if(uploadUrl){const upload=new URL(uploadUrl);if(upload.protocol!=='https:'||upload.hostname!=='firebasestorage.googleapis.com')return fail(502,origin,'UPLOAD_ROUTE_REJECTED');result.set('x-goog-upload-url',new URL('firebase/storage'+upload.pathname+upload.search,publicBase||url.origin+'/').href);}
    result.set('access-control-expose-headers',[...RESPONSE_HEADERS,'x-goog-upload-url'].join(', '));
    return new Response(response.body,{status:response.status,headers:result});
  }catch{return fail(502,origin,'UPSTREAM_UNAVAILABLE');}
}
export default {fetch:handle};
