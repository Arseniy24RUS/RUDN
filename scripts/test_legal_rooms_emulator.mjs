// Run with Firebase Auth + Realtime Database emulators (never a production project).
// firebase emulators:exec --project demo-rudn --config firebase.puzzle.json --only auth,database "node --test scripts/test_legal_rooms_emulator.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import * as db from 'firebase/database';
const runtime=process.env.LEGAL_LAB_RUNTIME||fileURLToPath(new URL('../site/apps/legal-lab/lib/live.mjs',import.meta.url));
const {FirebaseLive,aggregatePeers}=await import(pathToFileURL(runtime).href);
const root='rudn-platform/v1',group='ГГУбд-01-26',version='test-legal-20261015',namespace='demo-rudn-default-rtdb';
const apps=[],lives=[];let sequence=0;
const until=async(predicate,label,ms=12000)=>{const start=Date.now();while(!predicate()){if(Date.now()-start>ms)throw new Error(`Timed out: ${label}`);await new Promise(r=>setTimeout(r,20));}};
async function client({teacher=false,profileGroup=group}={}){
  const app=initializeApp({apiKey:'demo-rudn',projectId:'demo-rudn',databaseURL:`https://demo-rudn-default-rtdb.firebaseio.com`},`legal-${Date.now()}-${++sequence}`);apps.push(app);
  const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  if(teacher){try{await createUserWithEmailAndPassword(auth,'omnistat@yandex.ru','emulator-only-legal-lab')}catch(e){if(e.code!=='auth/email-already-in-use')throw e;await signInWithEmailAndPassword(auth,'omnistat@yandex.ru','emulator-only-legal-lab');}}
  else await signInAnonymously(auth);
  const database=db.getDatabase(app);db.connectDatabaseEmulator(database,'127.0.0.1',9000);
  const studentKey=`${Date.now()}${sequence}`,profile=teacher?null:{studentKey,ticket:studentKey,email:`${studentKey}@rudn.ru`,fullName:'Synthetic Legal Student',group:profileGroup,ownerUid:auth.currentUser.uid,ownerUids:{[auth.currentUser.uid]:true}};
  if(profile)await db.set(db.ref(database,`${root}/profiles/${studentKey}`),profile);
  return {mode:'cloud',generation:0,user:auth.currentUser,database,db,isAdmin:()=>teacher,getProfile:()=>profile,profile};
}
const live=backend=>{const v=new FirebaseLive({backend,rootPath:root,contentVersion:version,group:'ГГУбд-06-26'});lives.push(v);return v;};
const denied=promise=>assert.rejects(promise,error=>/permission.denied/i.test(error.code||error.message));
const roomRef=(backend,code,path='')=>db.ref(backend.database,`${root}/live/legalRooms/${code}${path?'/'+path:''}`);
async function rest(token,path,value,method='PUT'){
  const response=await fetch(`http://127.0.0.1:9000/${path}.json?ns=${namespace}&auth=${token}`,{method,headers:{'content-type':'application/json'},...(method!=='GET'?{body:JSON.stringify(value)}:{})});assert.equal(response.status,200,`${method} ${path}: ${await response.clone().text()}`);return response.json();
}
async function syntheticParticipant(code,index,roundId){
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-rudn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});assert.equal(response.status,200);const {localId:uid,idToken:token}=await response.json(),studentKey=`${Date.now()}${100+index}`;
  const profile={studentKey,ticket:studentKey,email:`${studentKey}@rudn.ru`,fullName:`Synthetic participant ${index}`,group,ownerUid:uid,ownerUids:{[uid]:true}};
  await rest(token,`${root}/profiles/${studentKey}`,profile);
  await rest(token,`${root}/live/legalRooms/${code}/members/${uid}`,{studentKey,group,contentVersion:version,joinedAt:Date.now()});
  await rest(token,`${root}/live/legalRooms/${code}/answers/${roundId}/${uid}`,{studentKey,contentVersion:version,roundId,taskId:'Q01',answer:JSON.stringify({selections:['d1-p1','d1-p1'],type:'Указ',hotspot:'issuer'}),submittedAt:Date.now()});
  return {uid,token,studentKey};
}

test('authenticated Legal Lab: 30 participants, private answers, reveal, stale rounds, rejoin, ownership and expiry', {timeout:150000},async()=>{
  const teacher=await client({teacher:true}),student=await client(),foreign=await client({profileGroup:'ГГУбд-02-26'}),teacherLive=live(teacher),studentLive=live(student),foreignLive=live(foreign);
  teacherLive.group=group;
  try{
    const code=await teacherLive.create('Q01');assert.match(code,/^[0-9A-F]{12}$/);
    await studentLive.join(code);await until(()=>studentLive.current.state?.taskId==='Q01','student joined first round');
    assert.equal(studentLive.group,group,'constructor ignores forged student group option');
    await assert.rejects(foreignLive.join(code),/другой учебной группы/);
    await denied(db.get(roomRef(foreign,code,'state')));
    await denied(db.set(roomRef(foreign,code,`members/${foreign.user.uid}`),{studentKey:foreign.profile.studentKey,group,contentVersion:version,joinedAt:Date.now()}));
    await denied(db.set(roomRef(student,code,`members/${student.user.uid}`),{studentKey:student.profile.studentKey,group,contentVersion:'old-version',joinedAt:Date.now()}));
    await denied(db.set(roomRef(student,code,'state'),studentLive.current.state));
    await deniedRest(teacher,code,'meta',{group:'ГГУбд-02-26'},'PATCH');
    await deniedRest(teacher,code,'',{meta:teacherLive.meta,state:studentLive.current.state});
    const roundId=studentLive.current.state.roundId;
    await studentLive.submit({selections:['d1-p1','d1-p1'],type:'Указ',hotspot:'issuer',private:'must not serialize'});
    const start=performance.now();const peers=await Promise.all(Array.from({length:29},(_,i)=>syntheticParticipant(code,i,roundId)));
    await until(()=>teacherLive.current.aggregates.respondents===30,'30 acknowledgements');
    assert.equal(teacherLive.current.aggregates.selections['d1-p1'],30);assert.equal(teacherLive.current.aggregates.hotspots.issuer,30);
    assert.deepEqual(studentLive.current.answers,{});assert.equal(studentLive.current.aggregates.respondents,0);
    const own=(await db.get(roomRef(student,code,`answers/${roundId}/${student.user.uid}`))).val();assert.equal(JSON.parse(own.answer).private,undefined);
    await denied(db.get(roomRef(student,code,`answers/${roundId}`)));await denied(db.get(roomRef(student,code,`answers/${roundId}/${peers[0].uid}`)));await denied(db.get(roomRef(student,code,`aggregates/${roundId}`)));
    await denied(db.set(roomRef(student,code,`answers/${roundId}/${peers[0].uid}`),own));
    await denied(db.set(roomRef(student,code,`answers/${roundId}/${student.user.uid}`),{...own,contentVersion:'stale'}));
    await denied(db.set(roomRef(student,code,`answers/${roundId}/${student.user.uid}`),{...own,taskId:'Q02'}));
    await teacherLive.control({showSelections:true});await until(()=>studentLive.current.aggregates.respondents===30,'students see only aggregates');
    assert.equal(studentLive.current.state.phase,'closed');assert.deepEqual(studentLive.current.answers,{});assert.equal(studentLive.current.aggregates.classifications['Указ'],30);
    const counts=(await db.get(roomRef(student,code,`aggregates/${roundId}`))).val();for(const forbidden of ['answers','studentKey','ownerUid','uid','members'])assert.equal(forbidden in counts,false);
    await denied(db.get(roomRef(student,code,`answers/${roundId}`)));await denied(db.get(roomRef(student,code,`answers/${roundId}/${peers[0].uid}`)));
    await assert.rejects(studentLive.submit({type:'Приказ'}),/закрыт/);await denied(db.set(roomRef(student,code,`answers/${roundId}/${student.user.uid}`),own));
    await denied(db.set(roomRef(student,code,`aggregates/${roundId}`),counts));
    await denied(db.update(roomRef(teacher,code,`aggregates/${roundId}`),{ownerUid:student.user.uid}));
    await teacherLive.control({phase:'collect'});await until(()=>studentLive.current.state.phase==='collect','resume');assert.equal(studentLive.current.state.showSelections,false);assert.equal(studentLive.current.aggregates.respondents,0);
    await teacherLive.round('T02');await until(()=>studentLive.current.state.taskId==='T02','advance');const nextRound=studentLive.current.state.roundId;
    await denied(db.set(roomRef(student,code,`answers/${roundId}/${student.user.uid}`),own));await denied(db.get(roomRef(student,code,`aggregates/${roundId}`)));
    await studentLive.submit({type:'Приказ'});await until(()=>teacherLive.current.aggregates.respondents===1,'new answer');
    db.goOffline(student.database);await until(()=>!studentLive.current.connected,'disconnect');db.goOnline(student.database);await until(()=>studentLive.current.connected,'reconnect');
    studentLive.close();const restored=live(student);await restored.join(code);await until(()=>restored.current.state?.roundId===nextRound,'rejoin correct round');
    const stale=new FirebaseLive({backend:student,rootPath:root,contentVersion:'old-content'});lives.push(stale);await assert.rejects(stale.join(code),/Версия контента/);
    const alternateKey=student.profile.studentKey+'7';const alternate={...student.profile,studentKey:alternateKey,ticket:alternateKey,email:alternateKey+'@rudn.ru'};
    await db.set(db.ref(student.database,`${root}/profiles/${alternateKey}`),alternate);
    await db.set(roomRef(student,code,`members/${student.user.uid}`),{studentKey:alternateKey,group,contentVersion:version,joinedAt:Date.now()});
    await denied(db.get(roomRef(student,code,`answers/${nextRound}/${student.user.uid}`)));
    await denied(restored.submit({type:'Приказ'}));
    await db.set(roomRef(student,code,`members/${student.user.uid}`),{studentKey:student.profile.studentKey,group,contentVersion:version,joinedAt:Date.now()});
    assert.equal((await db.get(roomRef(student,code,`answers/${nextRound}/${student.user.uid}`))).val().studentKey,student.profile.studentKey);
    await db.update(db.ref(student.database,`${root}/profiles/${student.profile.studentKey}`),{group:'ГГУбд-02-26'});
    await denied(db.set(roomRef(student,code,`answers/${nextRound}/${student.user.uid}`),{...own,taskId:'T02',roundId:nextRound}));await denied(db.get(roomRef(student,code,'state')));
    student.profile.group='ГГУбд-02-26';student.generation++;await assert.rejects(restored.submit({type:'Приказ'}),/Профиль изменён/);
    // An unprivileged student cannot mutate ownership or room state at any path.
    await denied(db.update(roomRef(foreign,code,'meta'),{teacherUid:foreign.user.uid}));
    const expiredCode='EEEE'+code.slice(4),expired={meta:{...teacherLive.meta,group:foreign.profile.group,createdAt:Date.now()-10000,expiresAt:Date.now()-1000},state:teacherLive.current.state};
    await denied(db.set(roomRef(teacher,expiredCode),expired));
    const seeded=await fetch(`http://127.0.0.1:9000/${root}/live/legalRooms/${expiredCode}.json?ns=${namespace}`,{method:'PUT',headers:{'content-type':'application/json','Authorization':'Bearer owner'},body:JSON.stringify({...expired,members:{[foreign.user.uid]:{studentKey:foreign.profile.studentKey,group:foreign.profile.group,contentVersion:version,joinedAt:Date.now()}}})});assert.equal(seeded.status,200,'expired fixture seeded only with emulator admin token');
    const expiredClient=live(foreign);await assert.rejects(expiredClient.join(expiredCode),/истекло/);await denied(db.get(roomRef(foreign,expiredCode,'state')));
    await denied(db.set(roomRef(teacher,expiredCode,'state'),{...expired.state,phase:'collect'}));
    console.log(JSON.stringify({status:'pass',transport:'Firebase Auth + Database emulators',participants:30,loadMs:Math.round(performance.now()-start),code,rounds:2,privacy:'no student answer-list reads, before or after reveal'}));
  }catch(error){console.error(error.stack);console.error('live-diagnostic',JSON.stringify({teacher:teacherLive.current,student:studentLive.current}));throw error;}finally{for(const l of lives)l.close();await Promise.all(apps.map(app=>signOut(getAuth(app))));for(const app of apps)db.goOffline(db.getDatabase(app));await Promise.all(apps.map(app=>deleteApp(app)));}
});

async function deniedRest(backend,code,path,value,method='PUT'){
  const token=await backend.user.getIdToken();const response=await fetch(`http://127.0.0.1:9000/${root}/live/legalRooms/${code}${path?'/'+path:''}.json?ns=${namespace}&auth=${token}`,{method,headers:{'content-type':'application/json'},body:JSON.stringify(value)});assert.equal(response.status,401,await response.text());
}
