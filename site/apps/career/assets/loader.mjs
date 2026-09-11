export async function loadJSON(url,{timeout=5000,validate=()=>true}={}) {
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeout);
 try {
  const response=await fetch(url,{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${url}`);
  const value=await response.json();
  if(!validate(value))throw new Error(`Invalid data: ${url}`);
  return value;
 } finally {clearTimeout(timer);}
}
export const isRecord=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
