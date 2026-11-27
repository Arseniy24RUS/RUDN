import {randomUUID} from 'node:crypto';
import {AdvisorError,hash,providerFacts,readRequest,readResult,requestSignature} from './contract.mjs';

const attemptsLimit = 50;
const userDailyLimit = 16;
const globalDailyLimit = 240;
const bounded = (given,max) => Number.isSafeInteger(given) && given>0 ? Math.min(given,max) : max;

/** Mutators run atomically. Returning undefined cancels as in RTDB ref.transaction. */
export function createAdvisorService({store,provider,now=()=>Date.now(),limits={}}) {
  const perAttempt = bounded(limits.perAttempt,attemptsLimit);
  const perUserDay = bounded(limits.perUserDay,userDailyLimit);
  const perDay = bounded(limits.perDay,globalDailyLimit);
  return async (body,identity) => {
    const request = readRequest(body);
    if (!identity?.uid || !identity.studentKey || request.studentKey!==(identity.requestedKey || identity.studentKey)) throw new AdvisorError('forbidden',403);
    const owner = hash(identity.uid+'|'+identity.studentKey);
    const attempt = 'attempts/'+hash(request.attemptId);
    const requestKey = hash(request.requestId);
    const signature = requestSignature(request);
    const claimId = randomUUID();
    const when = now();
    const record = await store.transaction(attempt,before=>{
      if (before?.owner && before.owner!==owner) return undefined;
      const existing = before?.requests?.[requestKey];
      if (existing || (before?.claimed||0)>=perAttempt) return undefined;
      return {schema:1,owner,claimed:(before?.claimed||0)+1,requests:{
        ...before?.requests,[requestKey]:{claimId,signature,phase:'pending',when}
      }};
    });
    if (record?.owner!==owner && record?.owner) throw new AdvisorError('forbidden',403);
    const claim = record?.requests?.[requestKey];
    if (!claim) throw new AdvisorError('attempt-quota',429);
    if (claim.signature!==signature) throw new AdvisorError('request-conflict',409);
    if (claim.phase==='complete') return readResult(claim.reply);
    if (claim.phase==='failed') throw new AdvisorError(claim.failure,claim.status);
    if (claim.claimId!==claimId) throw new AdvisorError('request-pending',409);

    async function finish(data) {
      const final = await store.transaction(attempt,state=>{
        const current = state?.requests?.[requestKey];
        if (state?.owner!==owner || current?.claimId!==claimId || current?.phase!=='pending') return undefined;
        return {...state,requests:{...state.requests,[requestKey]:{...current,...data,finished:now()}}};
      });
      if (final?.requests?.[requestKey]?.phase!==data.phase) throw new AdvisorError('storage-unavailable',503);
    }

    try {
      const date = new Date(when).toISOString().slice(0,10);
      const userKey = hash(identity.uid);
      let admitted = false;
      await store.transaction('days/'+date,row=>{
        admitted = false;
        const count=row?.count || 0, used=row?.users?.[userKey] || 0;
        if (count>=perDay || used>=perUserDay) return undefined;
        admitted = true;
        return {count:count+1,users:{...row?.users,[userKey]:used+1}};
      });
      if (!admitted) throw new AdvisorError('daily-quota',429);
      const context = providerFacts(request);
      const reply = readResult(context.terms.length ? await provider(context) : {intent:'unknown'});
      await finish({phase:'complete',reply});
      return reply;
    } catch (cause) {
      const error = cause instanceof AdvisorError ? cause : new AdvisorError('provider-unavailable',503);
      // Even if the provider's response was lost, the same request remains
      // terminal. Replaying its identifier cannot issue a second paid call.
      await finish({phase:'failed',failure:error.code,status:error.status});
      throw error;
    }
  };
}
