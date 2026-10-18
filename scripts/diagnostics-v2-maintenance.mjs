// Operator-only maintenance; never takes ID tokens or reads grades. Production
// uses the standard Admin SDK ADC mechanism, not exported browser credentials.
import {createRequire} from 'node:module';
import {createDiagnosticsService} from '../firebase/functions/diagnostics-service.mjs';
const require=createRequire(new URL('../firebase/functions/package.json',import.meta.url));
const {initializeApp,applicationDefault}=require('firebase-admin/app'),{getDatabase}=require('firebase-admin/database');
const args=process.argv.slice(2),get=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];},emulator=args.includes('--emulator'),kind=get('--kind')||'profiles',execute=args.includes('--execute'),project=emulator?'demo-rudn':get('--project'),maxPages=Math.min(1000,Math.max(1,Number(get('--pages'))||100));
if(!['profiles','archive'].includes(kind)||project!==(emulator?'demo-rudn':'rudn-gmu-learning-platform')||execute&&!emulator&&get('--confirm-project')!==project){console.error(JSON.stringify({error:'explicit-project-and-confirmation-required'}));process.exit(2);}
if(emulator){process.env.FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9000';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';}
if(!emulator&&process.env.FIREBASE_DATABASE_EMULATOR_HOST){console.error(JSON.stringify({error:'mixed-environments'}));process.exit(2);}
const databaseURL=emulator?'https://demo-rudn-default-rtdb.firebaseio.com':'https://rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app';
const app=initializeApp({projectId:project,databaseURL,...(emulator?{}:{credential:applicationDefault()})},'diagnostics-maintenance');
try{
 const service=createDiagnosticsService({db:getDatabase(app)});let cursor=null,pages=0,scanned=0,eligible=0;
 do{const result=await service.handle({action:'migrateLegacy',kind,dryRun:!execute,limit:kind==='archive'?4:20,cursor},{uid:'authorized-maintenance',email:'omnistat@yandex.ru'});cursor=result.nextCursor;scanned+=result.scanned;eligible+=result.copied;pages++;}while(cursor&&pages<maxPages);
 console.log(JSON.stringify({project,kind,dryRun:!execute,pages,scanned,eligible,hasMore:Boolean(cursor),status:cursor?'partial':'complete'}));
 if(cursor)process.exitCode=3;
}catch(error){console.error(JSON.stringify({status:'failed',code:typeof error.code==='string'&&/^[a-zA-Z0-9_/-]{1,60}$/.test(error.code)?error.code:'unavailable'}));process.exitCode=1;}
finally{await app.delete();}
