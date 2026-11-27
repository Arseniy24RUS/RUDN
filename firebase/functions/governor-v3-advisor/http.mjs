import {getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getDatabase} from 'firebase-admin/database';
import {AdvisorError,PRIVATE_ROOT,readRequest} from './contract.mjs';
import {createProvider,mockProvider} from './provider.mjs';
import {createAdvisorService} from './service.mjs';
import {resolveReceptionIdentity} from '../reception-ai/firebase.mjs';
import {RECEPTION_OPENAI_SECRET} from '../reception-ai/http.mjs';
import {createFirebaseStore} from '../reception-ai/store.mjs';

const PLATFORM = 'rudn-platform/v1';
const PAGES_ORIGIN = 'https://arseniy24rus.github.io';
const PRODUCTION_PROJECT = 'rudn-gmu-learning-platform';
const PRODUCTION_DATABASE = 'https://rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app';
const LOOPBACK = /^(127\.0\.0\.1|localhost)(:[1-9]\d{0,4})?$/;
const studentKeyIsValid = key => typeof key==='string' && /^\d{5,20}$/.test(key);

export async function resolveIdentity(db,decoded,requestedKey) {
  if (!decoded?.uid) throw new AdvisorError('forbidden',403);
  if (requestedKey===null) {
    if (decoded.firebase?.sign_in_provider==='anonymous') throw new AdvisorError('forbidden',403);
    // Use the same instructor recognition as Reception with an already verified ID token.
    const identity = await resolveReceptionIdentity({},decoded,{db}).catch(()=>null);
    if (!identity?.teacher) throw new AdvisorError('forbidden',403);
    return {...identity,studentKey:null};
  }
  if (!studentKeyIsValid(requestedKey)) throw new AdvisorError('forbidden',403);
  const requested = await db.ref(`${PLATFORM}/studentAliases/${requestedKey}`).get();
  const canonical = requested.val() ?? requestedKey;
  if (!studentKeyIsValid(canonical)) throw new AdvisorError('forbidden',403);
  const snap = await db.ref(`${PLATFORM}/profiles/${canonical}`).get();
  const profile = snap.val();
  if (!profile || profile.mergedInto || profile.studentKey!==canonical ||
      (profile.ownerUid!==decoded.uid && profile.ownerUids?.[decoded.uid]!==true)) throw new AdvisorError('forbidden',403);
  return {uid:decoded.uid,studentKey:canonical,requestedKey};
}

function isDemo(env) {
  const projectId = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || '';
  return typeof env.FUNCTIONS_EMULATOR==='string' && env.FUNCTIONS_EMULATOR==='true' &&
    /^demo-[a-z0-9-]+$/.test(projectId) && LOOPBACK.test(env.FIREBASE_AUTH_EMULATOR_HOST || '') &&
    LOOPBACK.test(env.FIREBASE_DATABASE_EMULATOR_HOST || '');
}

let cached;
function runtime() {
  if (cached) return cached;
  const env = process.env;
  const demo = isDemo(env);
  if (env.FUNCTIONS_EMULATOR && !demo) throw new AdvisorError('provider-disabled',503);
  const projectId = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || PRODUCTION_PROJECT;
  if (!demo && projectId!==PRODUCTION_PROJECT) throw new AdvisorError('provider-disabled',503);
  const databaseURL = demo ? `https://${projectId}-default-rtdb.firebaseio.com` : PRODUCTION_DATABASE;
  const name = 'governor-v3-advisor-admin';
  const app = getApps().find(row=>row.name===name) || initializeApp({projectId,databaseURL},name);
  const db = getDatabase(app);
  const auth = getAuth(app);
  const provider = demo
    ? (env.GOVERNOR_V3_ADVISOR_MOCK==='true' ? mockProvider : null)
    : (env.GOVERNOR_V3_ADVISOR_ENABLED==='true'
      ? createProvider({key:env[RECEPTION_OPENAI_SECRET]?.trim()})
      : null);
  const privateStore = createFirebaseStore(db,PRIVATE_ROOT);
  const store = {async transaction(path,mutator) {return (await privateStore.transaction(path,mutator)).value;}};

  return cached = {db,auth,service:provider ? createAdvisorService({store,provider}) : null};
}

export function createHandler({getRuntime=runtime,env=process.env}={}) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const origin=req.headers.origin;
    if (origin && origin!==PAGES_ORIGIN && !(isDemo(env) && origin.startsWith('http://') && LOOPBACK.test(origin.slice(7)))) {
      res.status(403).json({error:{code:'origin'}});
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin',origin);
      res.setHeader('Vary','Origin');
    }
    if (req.method==='OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods','POST');
      res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');
      res.setHeader('Access-Control-Max-Age','600');
      res.status(204).end();
      return;
    }
    try {
      if (req.method!=='POST') throw new AdvisorError('method',405);
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new AdvisorError('content-type',415);
      if ((req.rawBody?.length || 0)>32_768) throw new AdvisorError('body-too-large',413);
      const body=readRequest(req.body);
      const token=String(req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
      if (!token) throw new AdvisorError('auth',401);
      const {service,db,auth}=getRuntime();
      let decoded;
      try {decoded=await auth.verifyIdToken(token,true);}
      catch {throw new AdvisorError('auth',401);}
      const identity=await resolveIdentity(db,decoded,body.studentKey);
      if (!service) throw new AdvisorError('provider-disabled',503);
      res.status(200).json(await service(body,identity));
    } catch (error) {
      const code=error instanceof AdvisorError?error.code:'unavailable';
      const status=error instanceof AdvisorError?error.status:503;
      // Protocol emits stable error codes and never includes raw request data.
      res.status(status).json({error:{code}});
    }
  };
}

export const governorV3AdvisorHandler=createHandler();
