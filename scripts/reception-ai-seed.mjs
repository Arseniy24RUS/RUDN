#!/usr/bin/env node
/** Upload private fictional dossiers using local application-default credentials. */
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {validateCase,MAX_CATALOG_CASES} from '../firebase/functions/reception-ai/schema.mjs';

const argv=process.argv.slice(2),option=(name,fallback)=>{const i=argv.indexOf(name);return i<0?fallback:argv[i+1];};
if(argv.includes('--help')){
  console.log('node scripts/reception-ai-seed.mjs --cases /path/private-data/cases --catalog bank-2026-11-11-v3 [--apply --project PROJECT --database-url URL] [--activate]');
  console.log('Without --apply: validates local content only. Catalog versions are immutable. --activate changes the version used by NEW sessions.');process.exit(0);
}
const directory=option('--cases',process.env.RECEPTION_AI_CASES_DIR),version=option('--catalog','bank-2026-11-11-v3');
if(!directory||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(version))throw new Error('Specify --cases and a safe --catalog identifier.');
if(argv.includes('--activate')&&!argv.includes('--apply'))throw new Error('--activate requires --apply.');
const filenames=(await readdir(path.resolve(directory))).filter(f=>f.endsWith('.json')).sort(),items={},families=new Set();let dateVariants=0;
if(filenames.length>MAX_CATALOG_CASES)throw new Error('The private catalog exceeds its case limit.');
for(const name of filenames){
  let item;try{item=validateCase(JSON.parse(await readFile(path.join(directory,name),'utf8')));}catch(error){throw new Error('Invalid private dossier: '+name,{cause:error});}
  if(Object.hasOwn(items,item.id))throw new Error('Duplicate case ID: '+item.id);
  const payload=JSON.stringify(item),sha256=createHash('sha256').update(payload).digest('hex');items[item.id]={payload,sha256};
  families.add(item.familyId||item.id);dateVariants+=1+(item.dateVariants?.length||0);
}
if(families.size<8)throw new Error('An independent shift requires at least eight validated case families.');
console.log(`Validated ${Object.keys(items).length} private dossiers, ${families.size} families, ${dateVariants} date variants; catalog ${version}.`);
if(!argv.includes('--apply')){console.log('Local check complete. Nothing was uploaded.');process.exit(0);}
const projectId=option('--project'),databaseURL=option('--database-url');
if(!projectId||!databaseURL)throw new Error('--apply requires explicit --project and --database-url.');
const parsed=new URL(databaseURL);
if(parsed.protocol!=='https:'&&!process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw new Error('Production database URL must use HTTPS.');
const require=createRequire(new URL('../firebase/functions/package.json',import.meta.url));
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
const app=initializeApp({projectId,databaseURL,...(process.env.FIREBASE_DATABASE_EMULATOR_HOST?{}:{credential:applicationDefault()})},'reception-private-seed');
try{
  const root=getDatabase(app).ref('rudn-platform/v1/receptionAI'),ref=root.child('catalogs/'+version);
  const same=(left,right)=>left&&Object.keys(left).length===Object.keys(right).length&&Object.entries(right).every(([id,value])=>left[id]?.sha256===value.sha256&&left[id]?.payload===value.payload);
  const saved=await ref.transaction(current=>current===null?items:same(current,items)?current:undefined,undefined,false);
  if(!saved.committed)throw new Error('Catalog version already exists with different content. Choose a new --catalog version; existing sessions are preserved.');
  console.log('Private catalog stored; item hashes verified before upload.');
  if(argv.includes('--activate')){
    const active=root.child('config/activeCatalogVersion'),previous=(await active.get()).val();
    await active.set(version);console.log(`Active catalog changed: ${previous||'(none)'} -> ${version}.`);
  }else console.log('Activation unchanged. Use --activate with --apply when ready.');
}finally{await deleteApp(app);}
