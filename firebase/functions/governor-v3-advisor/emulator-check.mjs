import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {MODEL,PRIVATE_ROOT,hash} from './contract.mjs';
import {mockProvider} from './provider.mjs';

// This check writes synthetic identities and ledgers only to its demo project.
const project='demo-governor-v3';
const origin=process.env.GOVERNOR_V3_EMULATOR_URL;
const auth=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const rtdb=process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert.match(origin||'',/^http:\/\/127\.0\.0\.1:\d+\/demo-governor-v3\/europe-west1\/governorV3Advisor$/);
for (const host of [auth,rtdb]) assert.match(host||'',/^127\.0\.0\.1:\d+$/);
const app=initializeApp({projectId:project,databaseURL:`https://${project}-default-rtdb.firebaseio.com`},'v3-emulator-check');
const db=getDatabase(app);
const studentKey='900000006701';
const otherKey='900000006702';
const attempts=[];
async function signup(credentials={}) {
  const res=await fetch(`http://${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true,...credentials})
  });
  assert.equal(res.status,200);
  return res.json();
}
function send(method,body,who,site='http://127.0.0.1:19000') {
  return fetch(origin,{
    method,headers:{Origin:site,'Content-Type':'application/json',...(who ? {Authorization:'Bearer '+who.idToken} : {})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
}
try {
  const missing=await send('POST',{attemptId:randomUUID(),requestId:randomUUID(),studentKey,year:2026,revision:0,
    language:'ru',question:'Как взять заём?',facts:{budget:{cash:2000}}});
  assert.equal(missing.status,401);
  const first=await signup(),second=await signup();
  const teacher=await signup({email:'omnistat@yandex.ru',password:'demo-emulator-only-password'});
  const fakeTeacher=await signup({email:'teacher-fixture@example.test',password:'demo-emulator-only-password'});
  await db.ref('rudn-platform/v1/profiles').update({
    [studentKey]:{studentKey,ownerUid:first.localId},[otherKey]:{studentKey:otherKey,ownerUid:second.localId}
  });
  const body={attemptId:randomUUID(),requestId:randomUUID(),studentKey,year:2026,revision:0,language:'ru',
    question:'Почему жители переезжают?',facts:{budget:{cash:2000}},gameContext:['Статистика показывает население по районам.'],
    history:[{question:'Что изменилось?',answer:'Проверьте сводку.'}]};
  attempts.push(body.attemptId);
  const preflight=await send('OPTIONS');
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),'http://127.0.0.1:19000');
  const blocked=await send('POST',body,first,'https://other.invalid');
  assert.equal(blocked.status,403);
  assert.equal((await blocked.json()).error.code,'origin');
  const concurrent=await Promise.all([send('POST',body,first),send('POST',body,first)]);
  const statuses=concurrent.map(res=>res.status);
  const outcomes=await Promise.all(concurrent.map(res=>res.json()));
  assert.ok(statuses.includes(200) && statuses.every(code=>[200,409].includes(code)),JSON.stringify({statuses,outcomes}));
  const replay=await send('POST',body,first);
  assert.equal(replay.status,200);
  assert.deepEqual(await replay.json(),mockProvider(body));
  const other=await send('POST',{...body,studentKey:otherKey},second);
  assert.equal(other.status,403);
  const stolen=await send('POST',body,second);
  assert.equal(stolen.status,403);
  const conflict=await send('POST',{...body,question:'Какой участок выбрать?'},first);
  assert.equal(conflict.status,409);
  assert.equal((await conflict.json()).error.code,'request-conflict');
  const preview={...body,attemptId:randomUUID(),requestId:randomUUID(),studentKey:null,language:'zh',question:'为什么年轻人开始搬走？'};
  assert.equal((await send('POST',preview,first)).status,403);
  assert.equal((await send('POST',preview,fakeTeacher)).status,403);
  const instructorReply=await send('POST',preview,teacher);
  assert.equal(instructorReply.status,200);
  assert.deepEqual(await instructorReply.json(),mockProvider(preview));
  const pubCheck=new URL(`http://${rtdb}/${PRIVATE_ROOT}.json`);
  pubCheck.searchParams.set('ns',project+'-default-rtdb');
  pubCheck.searchParams.set('auth',first.idToken);
  assert.ok([401,403].includes((await fetch(pubCheck)).status));
  const day=new Date().toISOString().slice(0,10);
  const charges=(await db.ref(PRIVATE_ROOT+'/days/'+day).get()).val();
  assert.equal(charges.users[hash(first.localId)],1);
  assert.equal(charges.users[hash(teacher.localId)],1);
  assert.equal(charges.count,2);
  const privateAttempt=(await db.ref(PRIVATE_ROOT+'/attempts/'+hash(body.attemptId)).get()).val();
  assert.equal(privateAttempt.claimed,1);
  const stored=JSON.stringify(privateAttempt);
  assert.ok(!stored.includes(studentKey) && !stored.includes(body.question) && !stored.includes(body.history[0].question));
  console.log(JSON.stringify({status:'pass',environment:'local Auth + RTDB + Functions',provider:'deterministic mock',
    concurrentHttp:statuses,oneReservedCall:charges.users[hash(first.localId)],sameIdReplay:200,changedReplySameId:409,
    crossOwner:403,missingToken:401,blockedOrigin:403,instructor:200,fakeInstructor:403,guest:403,
    directPrivateReadDenied:true,modelContract:MODEL,realApi:false}));
} finally {await deleteApp(app);}
