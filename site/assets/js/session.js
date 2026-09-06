// Authentication, active identity and connectivity are deliberately independent.
export class SessionState{
  constructor(){this.value={phase:'restoring',role:'guest',connection:'connecting',saving:'idle'};this.listeners=new Set()}
  update(change){this.value={...this.value,...change};for(const listener of this.listeners)listener(this.value)}
  subscribe(listener){this.listeners.add(listener);listener(this.value);return()=>this.listeners.delete(listener)}
}
export const sessionState=new SessionState();

const PREFIX='rudn.';
export function readState(key,fallback){try{return JSON.parse(localStorage.getItem(PREFIX+key))??fallback}catch{return fallback}}
export function writeState(key,value){localStorage.setItem(PREFIX+key,JSON.stringify(value))}
export function deleteState(key){localStorage.removeItem(PREFIX+key)}
export function listState(prefix){
  const items=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(PREFIX+prefix)){const value=readState(key.slice(PREFIX.length),null);if(value)items.push(value)}}return items;
}
export const attemptStorageKey=a=>`attempt.v2:${a.studentKey}:${a.id}`;
export const pendingStorageKey=a=>`pending.v1:${a.studentKey}:${a.id}`;
export function storeAttempt(attempt,{pending=false}={}){
  // The queue is written first; a full storage device cannot silently lose an acknowledged attempt.
  if(pending)writeState(pendingStorageKey(attempt),attempt);
  writeState(attemptStorageKey(attempt),attempt);
}
