// Only format versions and module keys; no owner, UI values or checkpoint data.
const FORMATS=['updateEnvelope','adapterSnapshot','durableStore'];
const version=value=>Number.isSafeInteger(value)&&value>0&&value<=65535;
function valid(value){
 if(!value||value.schema!==1||Object.keys(value).sort().join(',')!=='adapterSnapshot,durableStore,modules,schema,updateEnvelope'||!FORMATS.every(key=>version(value[key]))||!value.modules||Array.isArray(value.modules))return false;
 const entries=Object.entries(value.modules);
 return entries.length>0&&entries.length<=32&&entries.every(([key,n])=>/^[a-z][a-z0-9-]{0,31}$/.test(key)&&version(n));
}
function keyFor(module){
 if(typeof module!=='string'||!/^[a-z][a-z0-9-]*(?::[a-zA-Z0-9_-]+)*$/.test(module))return null;
 const key=module.split(':')[0];return key==='classroom'||key==='quiz-board'?'quiz':key==='puzzle'?'maps':key;
}
export function captureCheckpointContracts(manifest,adapters){
 if(!valid(manifest)||!Array.isArray(adapters)||!adapters.length)return null;
 const modules={};
 for(const adapter of adapters){const key=keyFor(adapter?.module);if(!key||!Object.hasOwn(manifest.modules,key)||!version(manifest.modules[key]))return null;modules[key]=manifest.modules[key]}
 const value={schema:1,...Object.fromEntries(FORMATS.map(key=>[key,manifest[key]])),modules:Object.fromEntries(Object.entries(modules).sort(([a],[b])=>a.localeCompare(b)))};
 return valid(value)?value:null;
}
export function acceptsCheckpointContracts(required,target){
 return valid(required)&&valid(target)&&FORMATS.every(key=>required[key]===target[key])&&Object.entries(required.modules).every(([key,n])=>Object.hasOwn(target.modules,key)&&target.modules[key]===n);
}
