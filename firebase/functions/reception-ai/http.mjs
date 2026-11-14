import {initializeApp, getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getDatabase} from 'firebase-admin/database';
import {createReceptionService} from './service.mjs';
import {createFirebaseStore} from './store.mjs';
import {createOpenAIProvider} from './provider.mjs';
import {PRIVATE_ROOT, loadPrivateCatalogue, createFirebaseAssessmentGate, createFirebaseResultWriter, resolveReceptionIdentity} from './firebase.mjs';
import {ReceptionError, hash} from './schema.mjs';

export const RECEPTION_OPENAI_SECRET = 'RUDN_RECEPTION_OPENAI_KEY';
const getOpenAIKey = () => process.env[RECEPTION_OPENAI_SECRET]?.trim();
let runtime, cachedService, cachedVersion;
function getRuntime() {
  if (runtime) return runtime;
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'rudn-gmu-learning-platform';
  const databaseURL = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? `https://${projectId}-default-rtdb.firebaseio.com` : 'https://rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app';
  const app = getApps().find(a => a.name === 'reception-ai-admin') || initializeApp({projectId, databaseURL}, 'reception-ai-admin');
  const db = getDatabase(app); return runtime = {db, auth: getAuth(app), store: createFirebaseStore(db)};
}
export async function receptionHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  const origin = req.headers.origin;
  if (origin && origin !== 'https://arseniy24rus.github.io' && !(process.env.FUNCTIONS_EMULATOR && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))) { res.status(403).json({ok: false, error: {code: 'origin'}}); return; }
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type'); res.setHeader('Access-Control-Max-Age', '600'); res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ok: false, error: {code: 'method'}}); return; }
  if (!req.is('application/json') || (req.rawBody?.length || 0) > 262144) { res.status(413).json({ok: false, error: {code: 'limit'}}); return; }
  try {
    const bearer = String(req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
    if (!bearer) throw new ReceptionError('auth', 401);
    const env = getRuntime(); let decoded;
    try { decoded = await env.auth.verifyIdToken(bearer); } catch { throw new ReceptionError('auth', 401); }
    const settings = (await env.db.ref(`${PRIVATE_ROOT}/config`).get()).val();
    if (settings?.enabled !== true || !getOpenAIKey()) throw new ReceptionError('not_configured', 503);
    const identity = await resolveReceptionIdentity(req.body || {}, decoded, env);
    const guestEnabled = settings.guestEnabled !== false;
    const version = `${settings.activeCatalogVersion}:${hash(settings.limits || {})}:${guestEnabled}`;
    if (!cachedService || cachedVersion !== version) {
      cachedService = createReceptionService({store: env.store, cases: () => loadPrivateCatalogue(env.db, settings.activeCatalogVersion),
        provider: createOpenAIProvider({apiKey: getOpenAIKey, onDiagnostic: diagnostic => console.warn(JSON.stringify(diagnostic))}), config: settings.limits || {}, guestEnabled,
        canStartAssessment: createFirebaseAssessmentGate(env.db), saveResult: createFirebaseResultWriter(env.db), requireGameplay: true});
      cachedVersion = version;
    }
    res.status(200).json(await cachedService.handle(req.body, identity));
  } catch (error) {
    // Only bounded operational codes are logged; never student text, credentials or exception bodies.
    const status = error instanceof ReceptionError ? error.status : 503;
    if (status >= 500 || status === 429) {
      const op = ['catalog','start','recover','resume','locale','message','document','draft','decide','followup','next'].includes(req.body?.op) ? req.body.op : 'unknown';
      console.warn(JSON.stringify({event:'reception_request_failed',op,status,code:error instanceof ReceptionError ? error.code : 'unavailable'}));
    }
    res.status(error instanceof ReceptionError ? error.status : 503).json({ok: false, error: {code: error instanceof ReceptionError ? error.code : 'unavailable'}});
  }
}
