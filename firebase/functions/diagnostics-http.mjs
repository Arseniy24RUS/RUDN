import {initializeApp,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getDatabase} from 'firebase-admin/database';
import {createDiagnosticsService,ROOT} from './diagnostics-service.mjs';
import {DiagnosticError} from './diagnostics-schema.mjs';

let service,auth;
export function diagnosticsRuntime(){
 if(service)return {service,auth};
 const projectId=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||'rudn-gmu-learning-platform';
 const databaseURL=process.env.FIREBASE_DATABASE_EMULATOR_HOST?`https://${projectId}-default-rtdb.firebaseio.com`:'https://rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app';
 const app=getApps().find(a=>a.name==='diagnostics-admin')||initializeApp({projectId,databaseURL},'diagnostics-admin');
 const writer=getApps().find(a=>a.name==='diagnostics-writer')||initializeApp({projectId,databaseURL,databaseAuthVariableOverride:{uid:'diagnostics-service',token:{diagnosticsService:true}}},'diagnostics-writer');
 service=createDiagnosticsService({db:getDatabase(app),ingestDb:getDatabase(writer)});auth=getAuth(app);return {service,auth};
}
const allowedOrigin=value=>value==='https://arseniy24rus.github.io'||Boolean(process.env.FUNCTIONS_EMULATOR)&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value||'');
export async function diagnosticsHandler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const origin=req.headers.origin;if(origin){if(!allowedOrigin(origin)){res.status(403).json({ok:false,error:{code:'origin'}});return;}res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Max-Age','600');res.status(204).end();return;}
 if(req.method==='GET'&&typeof req.query.download==='string'){
  try{const {service}=diagnosticsRuntime(),grant=await service.consumeExport(req.query.download);res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="diagnostics-'+grant.sessionId.slice(-12)+'.ndjson"');res.setHeader('Referrer-Policy','no-referrer');
   for await(const row of service.exportLines(grant)){if(res.destroyed)return;if(!res.write(JSON.stringify(row)+'\n'))await new Promise((resolve,reject)=>{const done=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(new DiagnosticError('cancelled',409));},cleanup=()=>{res.off('drain',done);res.off('close',closed);res.off('error',closed);};res.once('drain',done);res.once('close',closed);res.once('error',closed);});}res.end();
  }catch(error){if(res.headersSent){if(!res.destroyed)res.end(JSON.stringify({kind:'complete',complete:false,code:error instanceof DiagnosticError?error.code:'unavailable'})+'\n');}else res.status(error instanceof DiagnosticError?error.status:503).json({ok:false,error:{code:error instanceof DiagnosticError?error.code:'unavailable'}});}return;
 }
 if(req.method!=='POST'){res.status(405).json({ok:false,error:{code:'method'}});return;}
 if(!req.is('application/json')||(req.rawBody?.length||0)>32768){res.status(413).json({ok:false,error:{code:'limit'}});return;}
 try{
  const bearer=String(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];if(!bearer)throw new DiagnosticError('auth',401);
  const {service,auth}=diagnosticsRuntime();let identity;try{identity=await auth.verifyIdToken(bearer);}catch{throw new DiagnosticError('auth',401);}
  const value=await service.handle(req.body,identity);if(value.downloadToken){const base=process.env.FUNCTIONS_EMULATOR?'http://127.0.0.1:5001/demo-rudn/europe-west1/diagnosticsDownload':'https://europe-west1-rudn-gmu-learning-platform.cloudfunctions.net/diagnosticsDownload';value.downloadURL=base+'?download='+value.downloadToken;delete value.downloadToken;}res.status(200).json(value);
 }catch(error){
  // Never log request bodies, auth, exception messages, profile names or stacks.
  const internalPermission=error?.code==='PERMISSION_DENIED'||error?.code==='database/permission-denied';
  const status=error instanceof DiagnosticError?error.status:internalPermission?409:503;
  res.status(status).json({ok:false,error:{code:error instanceof DiagnosticError?error.code:internalPermission?'deleted':'unavailable',...(error instanceof DiagnosticError?error.fields:{})}});
 }
}
