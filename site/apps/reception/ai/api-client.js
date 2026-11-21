/** The browser sends intentions; the server owns the conversation and the grade. */
export class ReceptionAPIError extends Error {
  constructor(code, status = 0) {
    super(code); this.name = 'ReceptionAPIError'; this.code = code; this.status = status;
  }
}

export const newRequestId = () => globalThis.crypto?.randomUUID?.()
  || `rxai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function isRecoverableMaterialRequest(body) {
  if (typeof body?.sessionId !== 'string' || typeof body.requestId !== 'string' || !body.sessionId || !body.requestId) return false;
  return body.op === 'document' || (body.op === 'core-step' || body.op === 'tutorial-step') && body.stepId === 'materials';
}

export function createReceptionAPI({endpoint, getIdToken, demo = false, fetch: fetcher = globalThis.fetch,
  signal: lifetime, timeoutMs = 60000, baseURL = globalThis.location?.href, buildId = '', workbookVersion, decisionVersion, controlVersion, coreStepsVersion, seminarStoryVersion, context} = {}) {
  const resolveEndpoint = () => {
    if (!endpoint) throw new ReceptionAPIError('not-configured');
    let url;
    try { url = new URL(endpoint, baseURL); } catch { throw new ReceptionAPIError('not-configured'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
      throw new ReceptionAPIError('unsafe-endpoint');
    }
    if (demo && (!loopback || url.origin !== new URL(baseURL).origin)) throw new ReceptionAPIError('local-demo-only');
    return url.href;
  };
  const api = {
    catalog(parameters = {}, options = {}) { return api.request({...parameters, op: 'catalog'}, options); },
    recover(parameters = {}, options = {}) { return api.request({...parameters, op: 'recover'}, options); },
    history(parameters = {}, options = {}) { return api.request({...parameters, context: 'seminar', op: 'history'}, options); },
    async request(body, {signal, withProgress = false} = {}) {
      if(context && (['start','recover','resume'].includes(body.op)||context==='free'&&body.op==='catalog')) body={...body,context};
      if(buildId && ['start','recover','resume'].includes(body.op)) body={...body,buildId};
      if(context==='seminar'&&coreStepsVersion&&body.op==='recover'&&body.journeyStage)body={...body,coreStepsVersion,...(seminarStoryVersion?{seminarStoryVersion}:{})};
      if(workbookVersion&&['start','catalog','recover','resume'].includes(body.op))body={...body,workbookVersion};
      // A resumed session retains its own assessment contract.
      if(decisionVersion==='correspondence-v1'&&['start','catalog','recover'].includes(body.op))body={...body,decisionVersion};
      // An existing session always retains its frozen execution contract.
      if(controlVersion==='execution-v1'&&decisionVersion==='correspondence-v1'&&['start','catalog'].includes(body.op))body={...body,controlVersion};
      const url = resolveEndpoint();
      const retryTransport = ['catalog', 'history', 'resume'].includes(body.op) || isRecoverableMaterialRequest(body);
      const payload = JSON.stringify(body);
      let token;
      let refreshedToken = false;
      let retriedTransport = false;
      while (true) {
        if (lifetime?.aborted || signal?.aborted) throw new ReceptionAPIError('cancelled');
        const controller = new AbortController();
        const abort = () => controller.abort();
        lifetime?.addEventListener('abort', abort, {once: true});
        signal?.addEventListener('abort', abort, {once: true});
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        try {
          const headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
          if (!demo) {
            if (typeof getIdToken !== 'function') throw new ReceptionAPIError('auth-required');
            if (!token) {
              try { token = await getIdToken({forceRefresh: refreshedToken}); }
              catch { throw new ReceptionAPIError('auth-required'); }
              if (!token) throw new ReceptionAPIError('auth-required');
            }
            headers.Authorization = `Bearer ${token}`;
          }
          const response = await fetcher(url, {method: 'POST', headers, body: payload,
            credentials: 'omit', cache: 'no-store', signal: controller.signal});
          if (response.status === 401 && !refreshedToken && !demo) {
            token = undefined;
            refreshedToken = true;
            continue;
          }
          let packet;
          try { packet = await response.json(); }
          catch (error) {
            if (controller.signal.aborted || error instanceof TypeError) throw error;
            throw new ReceptionAPIError('invalid-response', response.status);
          }
          if (!response.ok || packet?.ok !== true) {
            // Raw server messages can contain diagnostics. UI only receives a bounded error code.
            const code = typeof packet?.error?.code === 'string' && /^[a-z0-9_/-]{1,80}$/i.test(packet.error.code)
              ? packet.error.code : response.status === 429 ? 'rate-limited' : response.status === 401 ? 'auth-required' : 'server-error';
            throw new ReceptionAPIError(code, response.status);
          }
          if (body.op === 'catalog') {
            if (!Array.isArray(packet.cases) || packet.cases.length > 512 || packet.cases.some(row => !row
              || typeof row.id !== 'string' || !/^[a-z0-9_-]{1,120}$/i.test(row.id)
              || typeof row.title !== 'string' || typeof row.familyId !== 'string'
              || (row.level !== null && ![1, 2, 3].includes(row.level))
              || (row.estimatedMinutes !== null && (!Number.isFinite(row.estimatedMinutes) || row.estimatedMinutes <= 0)))) {
              throw new ReceptionAPIError('invalid-response');
            }
            return packet.cases.map(({id, title, familyId, level, estimatedMinutes}) => ({id, title, familyId, level, estimatedMinutes}));
          }
          if (body.op === 'history') {
            const {attempts, nextCursor} = packet;
            if (!Array.isArray(attempts) || attempts.length > 32 || attempts.some(row => !row
              || typeof row.id !== 'string' || !/^[a-f0-9]{40}$/.test(row.id)
              || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 512
              || !['example', 'mentor', 'independent'].includes(row.journeyStage)
              || !Number.isSafeInteger(row.completedAt) || row.completedAt < 1 || row.completedAt > 8640000000000000
              || (row.points !== undefined && (!Number.isFinite(row.points) || row.points < 0 || row.points > row.maxPoints))
              || (row.points !== undefined && (!Number.isFinite(row.maxPoints) || row.maxPoints <= 0 || row.maxPoints > 5))
              || (row.score !== undefined && (!Number.isFinite(row.score) || row.score < 0 || row.score > 100)))
              || new Set(attempts.map(row => row.id)).size !== attempts.length
              || (nextCursor !== null && (typeof nextCursor !== 'string' || !nextCursor || nextCursor.length > 256))) {
              throw new ReceptionAPIError('invalid-response');
            }
            return {attempts: attempts.map(({id, title, journeyStage, completedAt, points, maxPoints, score}) =>
              ({id, title, journeyStage, completedAt, ...(points === undefined ? {} : {points, maxPoints}), ...(score === undefined ? {} : {score})})), nextCursor};
          }
          const view = packet.view;
          const withRecoveryProgress = withProgress && body.op === 'recover';
          const recovery = () => ({view, seminarProgress:packet.seminarProgress || view?.seminarProgress || null,
            ...(typeof packet.legacySessionId==='string'&&packet.legacySessionId ? {legacySessionId:packet.legacySessionId} : {}),
            ...(Array.isArray(packet.legacySessions)?{legacySessions:packet.legacySessions.filter(row=>
              /^[a-f0-9]{40}$/.test(row?.id||'')&&['example','mentor','independent'].includes(row.journeyStage))}:{})});
          if (body.op === 'recover' && view === null) return withRecoveryProgress ? recovery() : null;
          if (!view || typeof view.id !== 'string' || !Number.isInteger(view.revision)
            || !['active', 'followup', 'review', 'complete'].includes(view.status) || !Array.isArray(view.messages)) {
            throw new ReceptionAPIError('invalid-response');
          }
          return withRecoveryProgress ? recovery() : view;
        } catch (error) {
          if (error instanceof ReceptionAPIError) throw error;
          if (controller.signal.aborted) throw new ReceptionAPIError(timedOut ? 'timeout' : 'cancelled');
          if (retryTransport && !retriedTransport) {
            retriedTransport = true;
            continue;
          }
          throw new ReceptionAPIError('network');
        } finally {
          clearTimeout(timer);
          lifetime?.removeEventListener('abort', abort);
          signal?.removeEventListener('abort', abort);
        }
      }
    },
  };
  return api;
}
