import {initializeApp, getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getDatabase} from 'firebase-admin/database';
import {defineSecret} from 'firebase-functions/params';
import {createReceptionService} from './service.mjs';
import {createFirebaseStore} from './store.mjs';
import {createOpenAIProvider} from './provider.mjs';
import {PRIVATE_ROOT, loadPrivateCatalogue, createFirebaseAssessmentGate, createFirebaseResultWriter} from './firebase.mjs';
import {ReceptionError, hash} from './schema.mjs';

export const receptionOpenAIKey = defineSecret('RUDN_RECEPTION_OPENAI_KEY');
let runtime, cachedService, cachedVersion;
function getRuntime() {
  if (runtime) return runtime;
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'rudn-gmu-learning-platform';
  const databaseURL = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? `https://${projectId}-default-rtdb.firebaseio.com` : 'https://rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app';
  const app = getApps().find(a => a.name === 'reception-ai-admin') || initializeApp({projectId, databaseURL}, 'reception-ai-admin');
  const db = getDatabase(app); return runtime = {db, auth: getAuth(app), store: createFirebaseStore(db)};
}
async function resolveIdentity(body, decoded, {db, store}) {
  const teacher = decoded.email === 'omnistat@yandex.ru';
  if (teacher) return {uid: decoded.uid, teacher: true};
  let studentKey = body.studentKey;
  if (body.sessionId && typeof body.sessionId === 'string' && /^[a-f0-9]{40}$/.test(body.sessionId)) {
    const session = await store.get(`sessions/${body.sessionId}`); if (!session) throw new ReceptionError('not_found', 404); studentKey = session.studentKey;
  }
  if (!/^\d{5,20}$/.test(studentKey || '')) throw new ReceptionError('profile_required', 403);
  // Canonical profiles are checked on every request. We do not claim that the
  // platform's deliberately passwordless profile selection verifies a person.
  const alias = (await db.ref(`rudn-platform/v1/studentAliases/${studentKey}`).get()).val();
  if (alias) studentKey = alias;
  if (!/^\d{5,20}$/.test(studentKey || '')) throw new ReceptionError('profile_required', 403);
  const profile = (await db.ref(`rudn-platform/v1/profiles/${studentKey}`).get()).val();
  if (!profile || profile.mergedInto || profile.studentKey !== studentKey || profile.ownerUid !== decoded.uid && profile.ownerUids?.[decoded.uid] !== true) throw new ReceptionError('forbidden', 403);
  return {uid: decoded.uid, studentKey, teacher: false};
}
export async function receptionHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  const origin = req.headers.origin;
  if (origin && origin !== 'https://arseniy24rus.github.io' && !(process.env.FUNCTIONS_EMULATOR && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))) { res.status(403).json({ok: false, error: {code: 'origin'}}); return; }
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type'); res.setHeader('Access-Control-Max-Age', '600'); res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ok: false, error: {code: 'method'}}); return; }
  if (!req.is('application/json') || (req.rawBody?.length || 0) > 32768) { res.status(413).json({ok: false, error: {code: 'limit'}}); return; }
  try {
    const bearer = String(req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
    if (!bearer) throw new ReceptionError('auth', 401);
    const env = getRuntime(); let decoded;
    try { decoded = await env.auth.verifyIdToken(bearer); } catch { throw new ReceptionError('auth', 401); }
    const settings = (await env.db.ref(`${PRIVATE_ROOT}/config`).get()).val();
    if (settings?.enabled !== true || !receptionOpenAIKey.value()) throw new ReceptionError('not_configured', 503);
    const identity = await resolveIdentity(req.body || {}, decoded, env);
    const version = `${settings.activeCatalogVersion}:${hash(settings.limits || {})}`;
    if (!cachedService || cachedVersion !== version) {
      cachedService = createReceptionService({store: env.store, cases: () => loadPrivateCatalogue(env.db, settings.activeCatalogVersion),
        provider: createOpenAIProvider({apiKey: () => receptionOpenAIKey.value()}), config: settings.limits || {},
        canStartAssessment: createFirebaseAssessmentGate(env.db), saveResult: createFirebaseResultWriter(env.db)});
      cachedVersion = version;
    }
    res.status(200).json(await cachedService.handle(req.body, identity));
  } catch (error) {
    // Neither student text, private dossiers, prompts, credentials nor provider
    // exception bodies are written to logs or returned to the browser.
    res.status(error instanceof ReceptionError ? error.status : 503).json({ok: false, error: {code: error instanceof ReceptionError ? error.code : 'unavailable'}});
  }
}
