/** The browser sends intentions; the server owns the conversation and the grade. */
export class ReceptionAPIError extends Error {
  constructor(code, status = 0) {
    super(code); this.name = 'ReceptionAPIError'; this.code = code; this.status = status;
  }
}

export const newRequestId = () => globalThis.crypto?.randomUUID?.()
  || `rxai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function createReceptionAPI({endpoint, getIdToken, demo = false, fetch: fetcher = globalThis.fetch,
  signal: lifetime, timeoutMs = 60000, baseURL = globalThis.location?.href, buildId = '', workbookVersion, decisionVersion, controlVersion, context} = {}) {
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
    async request(body, {signal} = {}) {
      if(context && (['start','recover','resume'].includes(body.op)||context==='free'&&body.op==='catalog')) body={...body,context};
      if(buildId && ['start','recover','resume'].includes(body.op)) body={...body,buildId};
      if(workbookVersion&&['start','catalog','recover','resume'].includes(body.op))body={...body,workbookVersion};
      // A resumed session retains its own assessment contract.
      if(decisionVersion==='correspondence-v1'&&['start','catalog','recover'].includes(body.op))body={...body,decisionVersion};
      // An existing session always retains its frozen execution contract.
      if(controlVersion==='execution-v1'&&decisionVersion==='correspondence-v1'&&['start','catalog'].includes(body.op))body={...body,controlVersion};
      const url = resolveEndpoint();
      if (lifetime?.aborted || signal?.aborted) throw new ReceptionAPIError('cancelled');
      for (let attempt = 0; attempt < 2; attempt++) {
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
            let token;
            try { token = await getIdToken({forceRefresh: attempt === 1}); }
            catch { throw new ReceptionAPIError('auth-required'); }
            if (!token) throw new ReceptionAPIError('auth-required');
            headers.Authorization = `Bearer ${token}`;
          }
          const response = await fetcher(url, {method: 'POST', headers, body: JSON.stringify(body),
            credentials: 'omit', cache: 'no-store', signal: controller.signal});
          if (response.status === 401 && attempt === 0 && !demo) continue;
          let packet;
          try { packet = await response.json(); } catch { throw new ReceptionAPIError('invalid-response', response.status); }
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
          const view = packet.view;
          if (body.op === 'recover' && view === null) return null;
          if (!view || typeof view.id !== 'string' || !Number.isInteger(view.revision)
            || !['active', 'followup', 'review', 'complete'].includes(view.status) || !Array.isArray(view.messages)) {
            throw new ReceptionAPIError('invalid-response');
          }
          return view;
        } catch (error) {
          if (error instanceof ReceptionAPIError) throw error;
          if (controller.signal.aborted) throw new ReceptionAPIError(timedOut ? 'timeout' : 'cancelled');
          throw new ReceptionAPIError('network');
        } finally {
          clearTimeout(timer);
          lifetime?.removeEventListener('abort', abort);
          signal?.removeEventListener('abort', abort);
        }
      }
      throw new ReceptionAPIError('auth-required', 401);
    },
  };
  return api;
}
