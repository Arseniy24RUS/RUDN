/** Public rows contain no Firebase UID, ticket, email or private profile key. */
const key=value=>{if(!/^[A-Za-z0-9_-]{1,150}$/.test(String(value)))throw new TypeError('Invalid settlements identifier');return String(value)};
const fail=code=>Object.assign(new Error(code),{code});
export const settlementsPoints=(difficulty,coverageNp,terminal=true,mode='assessment')=>
  terminal && mode==='assessment' && Number(coverageNp)>=90 ? ({easy:3,normal:4,hard:5}[difficulty]||0) : 0;

export function validateSettlementsResult(result){
  if(!result || result.terminal!==true || !['complete','budget_exhausted','budget-exhausted','target','budget'].includes(result.reason))throw fail('settlements/invalid-result');
  for(const name of ['coverageNp','coveragePopulation'])if(!Number.isFinite(result[name])||result[name]<0||result[name]>100)throw fail('settlements/invalid-result');
  if(!Number.isInteger(result.turns)||result.turns<0||!Number.isFinite(result.spentMillionRub)||result.spentMillionRub<0)throw fail('settlements/invalid-result');
  return result;
}

export const compareSettlementsResults=(a,b)=>a.spentMillionRub-b.spentMillionRub || b.coverageNp-a.coverageNp ||
  b.coveragePopulation-a.coveragePopulation || a.turns-b.turns || a.elapsedMs-b.elapsedMs || a.completedAt-b.completedAt || String(a.id).localeCompare(String(b.id));

export function selectSettlementsLeaders(rows,{mode='assessment',difficulty='normal'}={}){
  const best=new Map();
  for(const row of rows){
    if(!row || row.mode!==mode || row.difficulty!==difficulty || row.coverageNp<90 || !row.participantId)continue;
    if(!['coverageNp','coveragePopulation','spentMillionRub','turns','elapsedMs','completedAt'].every(name=>Number.isFinite(row[name])))continue;
    const prior=best.get(row.participantId);
    if(!prior || compareSettlementsResults(row,prior)<0)best.set(row.participantId,row);
  }
  return [...best.values()].sort(compareSettlementsResults);
}

export async function settlementsParticipantId(studentKey){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`rudn-settlements-v1:${studentKey}`));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function makeSettlementsLeaderboard(session,result,profile,mode){
  validateSettlementsResult(result);
  if(result.coverageNp<90 || !profile?.studentKey)return null;
  // Merged private IDs include the previous ticket. Never expose that key.
  const publicId=session.publicAttemptId || (session.attemptId.startsWith('merged-')?await settlementsParticipantId(`attempt:${session.attemptId}`):session.attemptId);
  return {id:key(publicId),participantId:await settlementsParticipantId(profile.studentKey),
    fio:String(profile.fullName||profile.displayName||'').slice(0,150),group:String(profile.group||'').slice(0,50),
    mode,difficulty:session.difficulty,regionId:session.regionId,turns:result.turns,
    elapsedMs:Math.max(0,Math.round(session.elapsedMs||0)),spentMillionRub:result.spentMillionRub,
    coverageNp:result.coverageNp,coveragePopulation:result.coveragePopulation,completedAt:session.completedAt};
}

/** Called only inside the durable outbox delivery, after immutable attempt and grade. */
export async function commitSettlementsLeaderboard(transport,attempt,{signal,active=()=>true}={}){
  const record=attempt.leaderboard;
  if(!record)return null;
  const ensure=()=>{if(!active())throw fail('auth/profile-changed')};
  const id=key(attempt.leaderboardAttemptId || record.id),mode=key(record.mode),difficulty=key(record.difficulty);
  ensure();
  const owner={studentKey:attempt.studentKey,attemptId:key(attempt.id),ownerUid:attempt.ownerUid,participantId:record.participantId};
  const writeOnce=async(path,value)=>{
    const result=await transport.transaction(path,current=>{
      ensure();
      if(current){
        if(Object.keys(value).some(name=>current[name]!==value[name]))throw fail('database/leaderboard-conflict');
        return undefined;
      }
      return value;
    },{signal});
    ensure();return result.value;
  };
  await writeOnce(`settlementsOwners/${id}`,owner);
  return writeOnce(`settlementsLeaderboard/${mode}/${difficulty}/${id}`,record);
}
