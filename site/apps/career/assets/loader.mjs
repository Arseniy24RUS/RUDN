export async function loadJSON(url,{timeout=30000,validate=()=>true}={}) {
 const controller=new AbortController();
 let timer;
 // Bound the complete read: a host fetch wrapper may finish before JSON arrives.
 const deadline=new Promise((_,reject)=>{
  timer=setTimeout(()=>{
   const error=new DOMException(`Timed out loading ${url}`,'TimeoutError');
   reject(error);
   controller.abort(error);
  },timeout);
 });
 const request=(async()=>{
  const response=await fetch(url,{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${url}`);
  const value=await response.json();
  if(!validate(value))throw new Error(`Invalid data: ${url}`);
  return value;
 })();
 try {
  return await Promise.race([request,deadline]);
 } finally {clearTimeout(timer);}
}
export const isRecord=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
