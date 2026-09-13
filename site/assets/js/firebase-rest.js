// HTTPS fallback for Firebase client operations. ID tokens retain the same
// Database Rules permissions as the SDK; no server or service-account keys.
export class FirebaseRestError extends Error{
  constructor(code,{status=0,value=null,etag=null}={}){
    super(code);
    this.name='FirebaseRestError';
    this.code=code;
    this.status=status;
    this.value=value;
    this.etag=etag;
  }
}

const failure=(code,details)=>new FirebaseRestError(code,details);

function cleanPath(path){
  const parts=String(path||'').replace(/^\/+|\/+$/g,'').split('/');
  if(parts.some(part=>!part||/[.#$\[\]\x00-\x1f\x7f]/.test(part))){
    throw failure('database/invalid-path');
  }
  return parts.map(encodeURIComponent).join('/');
}

function abortRace(promise,signal){
  if(signal.aborted)return Promise.reject(signal.reason||failure('network/aborted'));
  return new Promise((resolve,reject)=>{
    const stop=()=>reject(signal.reason||failure('network/aborted'));
    signal.addEventListener('abort',stop,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));
  });
}

export function createFirebaseRestTransport({
  databaseURL,
  rootPath,
  getUser,
  getGeneration=()=>0,
  namespace=null,
  getAppCheckToken=null,
  timeoutMs=12000,
  fetchImpl=globalThis.fetch.bind(globalThis)
}){
  const database=new URL(databaseURL);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(database.hostname);
  if(database.protocol!=='https:'&&!(loopback&&database.protocol==='http:'&&namespace)){
    throw failure('database/insecure-endpoint');
  }
  if(database.username||database.password||database.search||database.hash){
    throw failure('database/invalid-endpoint');
  }
  const root=cleanPath(rootPath);

  function capture(){
    const user=getUser();
    if(!user?.uid||typeof user.getIdToken!=='function')throw failure('auth/profile-required');
    return {user,uid:user.uid,generation:getGeneration()};
  }

  function assertCurrent(session){
    if(getUser()?.uid!==session.uid||getGeneration()!==session.generation){
      throw failure('auth/profile-changed');
    }
  }

  async function request(method,path,{value,etag=false,ifMatch,signal,timeoutMs:requestTimeout=timeoutMs,session=capture()}={}){
    const controller=new AbortController();
    const relay=()=>controller.abort(signal?.reason||failure('network/aborted'));
    if(signal?.aborted)relay();
    signal?.addEventListener('abort',relay,{once:true});
    const timer=setTimeout(()=>controller.abort(failure('network/timeout')),requestTimeout);
    try{
      assertCurrent(session);
      const suffix=cleanPath(path);
      for(let authRetry=0;authRetry<2;authRetry++){
        const token=await abortRace(session.user.getIdToken(authRetry===1),controller.signal);
        assertCurrent(session);
        const url=new URL(`${root}/${suffix}.json`,database.href.replace(/\/$/,'')+'/');
        url.searchParams.set('auth',token);
        if(namespace)url.searchParams.set('ns',namespace);
        const headers={'Accept':'application/json'};
        if(etag)headers['X-Firebase-ETag']='true';
        if(ifMatch!==undefined)headers['If-Match']=ifMatch;
        if(method!=='GET')headers['Content-Type']='application/json';
        if(getAppCheckToken){
          const appCheck=await abortRace(getAppCheckToken(),controller.signal);
          if(appCheck)headers['X-Firebase-AppCheck']=typeof appCheck==='string'?appCheck:appCheck.token;
        }
        assertCurrent(session);
        const response=await abortRace(fetchImpl(url.href,{
          method,headers,body:method==='GET'?undefined:JSON.stringify(value),
          signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'
        }),controller.signal);
        const text=await abortRace(response.text(),controller.signal);
        assertCurrent(session);
        let body=null;
        try{body=text?JSON.parse(text):null}catch{throw failure('database/invalid-response',{status:response.status})}
        const responseEtag=response.headers.get('etag');
        if(response.status===412){
          throw failure('database/conflict',{status:412,value:body,etag:responseEtag});
        }
        if(response.status===401&&!/permission denied/i.test(String(body?.error||''))&&authRetry===0){
          continue;
        }
        if(!response.ok){
          const code=response.status===401||response.status===403?'database/permission-denied':
            response.status===429?'database/rate-limited':
            response.status>=500?'network/unavailable':'database/request-rejected';
          throw failure(code,{status:response.status});
        }
        return {value:body,etag:responseEtag};
      }
      throw failure('auth/user-token-expired');
    }catch(error){
      assertCurrent(session);
      if(controller.signal.aborted)throw controller.signal.reason||failure('network/aborted');
      if(error instanceof FirebaseRestError)throw error;
      // Never forward fetch messages/URLs: the URL contains a short-lived token.
      if(String(error?.code||'').startsWith('auth/'))throw failure(error.code);
      throw failure('network/unavailable');
    }finally{
      clearTimeout(timer);
      signal?.removeEventListener('abort',relay);
    }
  }

  return {
    get:(path,options={})=>request('GET',path,options),
    put:(path,value,options={})=>request('PUT',path,{...options,value}),
    async transaction(path,update,{retries=4,signal}={}){
      const session=capture();
      let remote=await request('GET',path,{etag:true,signal,session});
      for(let attempt=0;attempt<=retries;attempt++){
        assertCurrent(session);
        const next=await update(remote.value);
        if(next===undefined)return {committed:false,value:remote.value,etag:remote.etag};
        if(!remote.etag)throw failure('database/etag-unavailable');
        try{
          const saved=await request('PUT',path,{value:next,ifMatch:remote.etag,signal,session});
          return {committed:true,...saved};
        }catch(error){
          if(error.code!=='database/conflict'||attempt===retries)throw error;
          remote=error.etag?{value:error.value,etag:error.etag}:
            await request('GET',path,{etag:true,signal,session});
        }
      }
      throw failure('database/conflict');
    }
  };
}
