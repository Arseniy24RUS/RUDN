// Background diagnostics must not create production accounts from local demos
// or arbitrary preview origins. Manual course sign-in has its own auth policy.
export function diagnosticEndpoint(config){
  try{
    // An auth/database-only emulator is valid: keep its diagnostics local until
    // a Functions emulator is configured, never fall through to production.
    if(config?.emulators){
      if(!config.emulators.diagnosticsUrl)return null;
      const endpoint=new URL(config.emulators.diagnosticsUrl);
      if(endpoint.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)||endpoint.username||endpoint.password)return null;
      return endpoint.href;
    }
    const endpoint=new URL('../diagnosticsApi',config?.firebaseGateway);
    return endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password?endpoint.href:null;
  }catch{return null;}
}

export function diagnosticIdentityAllowed(config,href){
  try{
    const page=new URL(href);
    if(page.username||page.password)return false;
    if(config?.emulators){
      const emulator=config.emulators,auth=new URL(emulator.auth);
      const loopback=host=>host==='localhost'||host==='127.0.0.1'||host==='[::1]';
      return page.protocol==='http:'&&loopback(page.hostname)&&auth.protocol==='http:'&&loopback(auth.hostname)&&!auth.username&&!auth.password&&loopback(emulator.host)&&Number.isInteger(emulator.databasePort)&&emulator.databasePort>0&&emulator.databasePort<=65535;
    }
    const published=new URL(config?.pagesUrl);
    return page.protocol==='https:'&&published.protocol==='https:'&&page.origin===published.origin;
  }catch{return false;}
}
