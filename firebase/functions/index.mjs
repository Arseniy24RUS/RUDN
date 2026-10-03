import {onRequest} from 'firebase-functions/v2/https';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {handle} from './gateway.mjs';

const BASE='https://europe-west1-rudn-gmu-learning-platform.cloudfunctions.net/networkGateway/';
export const networkGateway=onRequest({region:'europe-west1',memory:'256MiB',cpu:1,concurrency:80,minInstances:0,maxInstances:2,timeoutSeconds:60,invoker:'public',cors:false},async(req,res)=>{
  const controller=new AbortController();
  res.on('close',()=>{if(!res.writableFinished)controller.abort();});
  let path=req.originalUrl||req.url||'/';
  // The Functions frontend normally removes the function name. Accept both
  // forms so local emulators and the deployed public endpoint agree.
  if(path.startsWith('/networkGateway/'))path=path.slice('/networkGateway'.length);
  const request=new Request('https://gateway.internal'+path,{
    method:req.method,headers:req.headers,signal:controller.signal,
    ...(['GET','HEAD'].includes(req.method)?{}:{body:req.rawBody,duplex:'half'})
  });
  const response=await handle(request,{publicBase:BASE});
  res.status(response.status);
  for(const [name,value] of response.headers)res.setHeader(name,value);
  if(!response.body||req.method==='HEAD'){res.end();return;}
  try{await pipeline(Readable.fromWeb(response.body),res);}catch{if(!res.destroyed)res.destroy();}
});
