import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {planRosterUpdate,applyPatch,ticketHash} from './roster-migration.mjs';
import {commitStudentAttempt} from '../site/assets/js/checkpoint-sync.js';
const prefix='rudn-platform/v1';
const database='http://127.0.0.1:9010';
async function request(path,method='GET',body,token='owner'){
  const response=await fetch(database+'/'+path+'.json?ns=demo-rudn-default-rtdb'+(token==='owner'?'':'&auth='+encodeURIComponent(token)),{
    method,headers:{...(token==='owner'?{Authorization:'Bearer owner'}:{}),'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,value:await response.json()};
}
async function user(email){
  const response=await fetch('http://127.0.0.1:9109/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true,...(email?{email,password:'synthetic-roster-test-only'}:{})})});
  let result=await response.json();
  if(result.error?.message==='EMAIL_EXISTS'){
    const existing=await fetch('http://127.0.0.1:9109/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'synthetic-roster-test-only',returnSecureToken:true})});
    result=await existing.json();
  }
  assert.ok(result.idToken,JSON.stringify(result));return result;
}
const profile=(key,uid,name)=>({studentKey:key,ticket:key,email:key+'@rudn.ru',fullName:name,displayName:name,
  group:'ГГУбд-01-26',ownerUid:uid,ownerUids:{[uid]:true},createdAt:'2026-01-01T00:00:00Z'});
test('migration preserves data, is idempotent, and Firebase rules enforce identity boundaries',async()=>{
  const teacher=await user('omnistat@yandex.ru'),a=await user(),b=await user();
  const old='9900000001',canonical='9900000002',oldSingle='9900000003',newSingle='9900000004';
  const fixture={profiles:{[old]:profile(old,a.localId,'Synthetic Duplicate'),[canonical]:profile(canonical,b.localId,'Synthetic Student'),
    [oldSingle]:profile(oldSingle,a.localId,'Synthetic Other')},
    attempts:{[old]:{first:{id:'first',studentKey:old,ownerUid:a.localId,activitySlug:'seminar-1',points:5,createdAt:'2026-01-01T00:00:00Z'}}},
    grades:{[old]:{'seminar-1':{points:5,sourceAttemptId:'first',ownerUid:a.localId}}},
    roster:{[ticketHash(canonical)]:{fullName:'Synthetic Student',group:'ГГУбд-01-26'},
      [ticketHash('9900000099')]:{fullName:'Synthetic Absent',group:'ГГУбд-01-26'},
      [ticketHash('9900000088')]:{fullName:'Synthetic Prior Cohort',group:'ГГУбд-01-25'}}};
  const options={official:[{name:'Synthetic Student',ticket:canonical,group:'ГГУбд-01-26'},
    {name:'Synthetic Other',ticket:newSingle,group:'ГГУбд-01-26'}],canonicalByOfficial:{[newSingle]:oldSingle},
    merges:{[canonical]:[old]},cohortSuffix:'-26',timestamp:'2026-09-17T15:00:00Z'};
  const frozen=structuredClone(fixture),plan=planRosterUpdate(fixture,options),after=applyPatch(fixture,plan.patch);
  assert.deepEqual(fixture,frozen);
  assert.deepEqual(after.attempts[old],fixture.attempts[old]);
  assert.deepEqual(after.roster, {...fixture.roster,[ticketHash(newSingle)]:{fullName:'Synthetic Other',group:'ГГУбд-01-26'}});
  assert.equal(after.attempts[canonical]['merged-'+old+'-first'].points,5);
  assert.equal(after.grades[canonical]['seminar-1'].sourceAttemptId,'merged-'+old+'-first');
  assert.equal(after.studentAliases[newSingle],oldSingle);
  assert.equal(planRosterUpdate(after,options).counts.paths,0);
  assert.deepEqual(applyPatch(after,plan.rollback),fixture);
  const rules=JSON.parse(await fs.readFile(new URL('../firebase/database.rules.json',import.meta.url)));
  assert.equal((await request('.settings/rules','PUT',rules)).status,200,'rules compile');
  assert.equal((await request(prefix,'PUT',fixture)).status,200);
  const applied=await request(prefix,'PATCH',plan.patch,teacher.idToken);
  assert.equal(applied.status,200,JSON.stringify(applied.value));
  assert.equal((await request(prefix+'/studentAliases/'+old,'GET',undefined,a.idToken)).value,canonical);
  assert.equal((await request(prefix+'/attempts/'+canonical,'GET',undefined,a.idToken)).status,200,'merged owner sees canonical results');
  const canon=after.profiles[canonical];
  const owned={...canon,ownerUid:a.localId};
  assert.equal((await request(prefix+'/profiles/'+canonical,'PUT',owned,a.idToken)).status,200,'ordinary profile update');
  for(const field of ['officialTicket','mergedInto','mergedFrom']){
    const altered={...owned,[field]:field==='mergedFrom'?old+',9900000098':'9900000098'};
    assert.equal((await request(prefix+'/profiles/'+canonical,'PUT',altered,a.idToken)).status,401,'student cannot modify '+field);
  }
  assert.equal((await request(prefix+'/profiles/'+canonical+'/mergedFrom','DELETE',undefined,a.idToken)).status,401,'cannot remove merge metadata');
  assert.equal((await request(prefix+'/rosterAbsences','GET',undefined,a.idToken)).status,401,'absence status is teacher-only');
  assert.equal((await request(prefix+'/rosterAbsences','GET',undefined,teacher.idToken)).status,200);
  assert.equal((await request(prefix+'/studentAliases/'+canonical,'PUT',old,teacher.idToken)).status,401,'cycles rejected');
  assert.equal((await request(prefix+'/studentAliases/9900000077','PUT',old,teacher.idToken)).status,401,'chains rejected');
  assert.equal((await request(prefix+'/studentAliases/9900000077','PUT',canonical,a.idToken)).status,401,'student cannot create aliases');
  const future={...fixture.attempts[old].first,id:'later'};
  assert.equal((await request(prefix+'/attempts/'+old+'/later','PUT',future,a.idToken)).status,401,'obsolete profile cannot receive new results');
  assert.equal((await request(prefix+'/attempts/'+canonical+'/later','PUT',{...future,studentKey:canonical},a.idToken)).status,200,'canonical profile can receive new results');
  const invalid=structuredClone(fixture);invalid.profiles[newSingle]=profile(newSingle,b.localId,'Someone Else');
  assert.throws(()=>planRosterUpdate(invalid,options),/occupied/);
  const delayedId='merged-'+old+'-delayed';
  const completed={id:delayedId,studentKey:canonical,ownerUid:a.localId,activitySlug:'seminar-2',points:2,createdAt:'2026-01-01T00:00:00Z'};
  assert.equal((await request(prefix+'/attempts/'+canonical+'/'+delayedId,'PUT',completed,a.idToken)).status,200);
  const transport={transaction:async(path,update)=>{
    const prior=await request(prefix+'/'+path,'GET',undefined,a.idToken);assert.equal(prior.status,200);
    const next=update(prior.value);
    if(next===undefined)return {value:prior.value};
    const result=await request(prefix+'/'+path,'PUT',next,a.idToken);assert.equal(result.status,200,JSON.stringify(result.value));
    return {value:result.value};
  }};
  const delayed={...completed,points:5,mergedFrom:{studentKey:old,attemptId:'delayed'}};
  const recovered=await commitStudentAttempt(transport,delayed,{studentKey:canonical,uid:a.localId});
  assert.equal(recovered.id,delayedId+'-source-result');
  assert.equal((await request(prefix+'/attempts/'+canonical+'/'+delayedId,'GET',undefined,a.idToken)).value.points,2,'canonical completion preserved');
  assert.equal((await request(prefix+'/grades/'+canonical+'/seminar-2','GET',undefined,a.idToken)).value.points,5,'late result contributes its best grade');
  assert.equal((await commitStudentAttempt(transport,delayed,{studentKey:canonical,uid:a.localId})).id,recovered.id,'late replay is idempotent');
});
