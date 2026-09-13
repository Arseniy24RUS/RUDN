import {CONFIG} from './config.js?v=1.3.2';
import {needsSeminar1Q48Review,reconcileSeminar1Q48} from './grading-revisions.js?v=1.3.2';
import {sessionState,readState,writeState,deleteState,listState,storeAttempt,pendingStorageKey} from './session.js?v=1.3.2';

const PROFILE_KEY='rudn.profile.v1';
const ATTEMPTS_KEY='rudn.attempts.v1';
const LEGACY_GRADES_KEY='rudn.grades.v1';
const GRADES_KEY='rudn.grades.v2';
const LIVE_KEY='rudn.live.lastCode';

function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value))}
function now(){return new Date().toISOString()}
function uuid(){return globalThis.crypto?.randomUUID?.()||`rudn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}
function serviceError(code){return Object.assign(new Error(code),{code})}
function bounded(promise,ms=10000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(serviceError('network/timeout')),ms)})]).finally(()=>clearTimeout(timer))}
function cleanKey(value){return String(value||'').trim().toLowerCase().replace(/@(?:rudn|pfur)\.ru$/,'').replace(/[^a-zа-яё0-9_-]/gi,'-').replace(/-+/g,'-').slice(0,80)}
function twoDigitYear(date=new Date()){return String(date.getFullYear()).slice(-2)}
function ymd(date=new Date()){return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`}

export function groupOptions(date=new Date()){
  const yy=twoDigitYear(date);
  return Array.from({length:CONFIG.groupCount||6},(_,index)=>`${CONFIG.groupPrefix||'ГГУбд'}-${String(index+1).padStart(2,'0')}-${yy}`);
}

export function normalizeGroup(value,date=new Date()){
  const group=String(value||'').trim();
  const valid=groupOptions(date);
  if(valid.includes(group))return group;
  const legacy=group.match(/^ГГУбд-(0[1-6])-\d{2}$/i);
  if(legacy)return group;
  throw new Error(`Выберите учебную группу ${valid[0]}–${valid[valid.length-1]}`);
}

export function normalizeIdentifier(value){
  const raw=String(value||'').trim().toLowerCase();
  const emailMatch=raw.match(/^(\d{5,20})@(rudn|pfur)\.ru$/i);
  const ticket=emailMatch?.[1]||(/^\d{5,20}$/.test(raw)?raw:'');
  if(!ticket)throw new Error('Введите номер студенческого билета или корпоративный email РУДН');
  return {ticket,email:emailMatch?raw:`${ticket}@rudn.ru`,studentKey:cleanKey(ticket)};
}

export function normalizeFullName(value){
  const fullName=String(value||'').trim().replace(/\s+/g,' ');
  if(fullName.length<2||fullName.length>150)throw new Error('Введите ФИО студента');
  return fullName;
}

async function sha256(value){
  if(!globalThis.crypto?.subtle)throw new Error('Браузер не поддерживает безопасный поиск по списку');
  const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function automaticRoomKey(_group,date=new Date()){
  return `all-groups-${ymd(date)}`;
}

class Backend{
  constructor(){
    this.mode='local';this.error=null;this.firebase=null;this.auth=null;this.db=null;this.storage=null;this.user=null;
    this.profile=this.migrateProfile(readLocal(PROFILE_KEY,null));this.listeners=[];
    this.accessOverrides={};this.serverTimeOffset=0;this.accessUnsubscribe=null;this.timeUnsubscribe=null;
    this.connected=false;this.authReady=false;this.generation=0;this.session=sessionState;this.flushing=null;
    this.migrateGrades();
    window.addEventListener('storage',event=>{if(event.key===PROFILE_KEY&&!this.isAdmin()){this.profile=this.migrateProfile(readLocal(PROFILE_KEY,null));this.generation++;this.emitStatus();window.dispatchEvent(new Event('rudn:identitychange'));if(this.profile)this.ensureStudentCloud().then(()=>this.syncLocalToCloud()).catch(()=>{})}});
    window.addEventListener('online',()=>{if(this.profile)this.ensureStudentCloud().then(()=>this.syncLocalToCloud()).catch(()=>{});else this.init().catch(()=>{})});
    this.connectionRetry=setInterval(()=>{if(this.profile&&!this.isAdmin()&&navigator.onLine){if(!this.user)this.ensureStudentCloud().then(()=>this.syncLocalToCloud()).catch(()=>{});else if(listState('pending.v1:').some(a=>a.studentKey===this.profile.studentKey))this.syncLocalToCloud().catch(()=>{})}},30000);
  }
  migrateProfile(profile){
    if(!profile)return null;
    try{
      const identity=normalizeIdentifier(profile.email||profile.ticket||profile.studentKey);
      let group=String(profile.group||'').trim();
      const legacy=group.match(/^ГГУбд-(0[1-6])-\d{2}$/);
      const fullName=String(profile.fullName||profile.displayName||identity.ticket).trim();
      const migrated={...profile,studentKey:identity.studentKey,ticket:identity.ticket,email:identity.email,displayName:fullName,fullName,group,schemaVersion:2};
      delete migrated.recoveryPin;delete migrated.recoveryHash;
      writeLocal(PROFILE_KEY,migrated);return migrated;
    }catch{return null}
  }
  migrateGrades(){
    if(!this.profile?.studentKey)return;
    const scoped=readLocal(GRADES_KEY,{});
    if(Object.keys(scoped).length)return;
    const legacy=readLocal(LEGACY_GRADES_KEY,null);
    if(!legacy||typeof legacy!=='object'||Array.isArray(legacy)||!Object.keys(legacy).length)return;
    scoped[this.profile.studentKey]=legacy;
    writeLocal(GRADES_KEY,scoped);
  }
  async init(){
    if(this.initializing)return this.initializing;
    this.initializing=(async()=>{
      try{
        const {app:appMod,auth:authMod,database:dbMod}=await import('../vendor/firebase/firebase-core.js');
        const firebaseConfig=CONFIG.emulators?{...CONFIG.firebase,projectId:'demo-rudn',databaseURL:'https://demo-rudn-default-rtdb.firebaseio.com'}:CONFIG.firebase;
        const app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(firebaseConfig);
        this.auth=authMod;this.db=dbMod;this.firebase=app;
        // No popup/redirect resolver: this app only uses password and anonymous sign-in.
        // IndexedDB is tried first so previously persisted Firebase sessions are retained.
        this.authClient=authMod.initializeAuth(app,{persistence:[authMod.indexedDBLocalPersistence,authMod.browserLocalPersistence]});
        this.database=dbMod.getDatabase(app);
        if(CONFIG.emulators){authMod.connectAuthEmulator(this.authClient,CONFIG.emulators.auth,{disableWarnings:true});dbMod.connectDatabaseEmulator(this.database,CONFIG.emulators.host,CONFIG.emulators.databasePort)}
        await this.authClient.authStateReady();
        this.authReady=true;this.user=this.authClient.currentUser;
        this.authUnsubscribe=authMod.onAuthStateChanged(this.authClient,user=>this.handleAuthUser(user));
        this.connectionUnsubscribe=dbMod.onValue(dbMod.ref(this.database,'.info/connected'),snap=>{
          this.connected=snap.val()===true;this.emitStatus();if(this.connected&&this.profile&&!this.isAdmin())this.syncLocalToCloud().catch(()=>{});
        });
        if(this.user)this.handleAuthUser(this.user);
        else {this.emitStatus();if(this.profile)this.ensureStudentCloud().then(()=>this.syncLocalToCloud()).catch(error=>{this.error=error;this.emitStatus()})}
      }catch(error){this.error=error;this.authReady=true;this.initializing=null;this.emitStatus()}
      return this.status();
    })();
    return this.initializing;
  }
  handleAuthUser(user){
    const previous=this.user;const oldRole=this.lastRole;this.user=user;this.authReady=true;this.error=null;
    if(previous?.uid!==user?.uid)this.generation++;
    if(this.isAdmin()){this.profile=null;localStorage.removeItem(PROFILE_KEY)}
    if(oldRole==='teacher'&&!this.isAdmin()){for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('rudn.teacher-cache.'))localStorage.removeItem(key)}}
    this.lastRole=this.isAdmin()?'teacher':this.profile?'student':'guest';this.emitStatus();
    if(user){this.startAccessSync().catch(()=>{});if(this.profile&&!this.isAdmin())this.syncLocalToCloud().catch(()=>{})}
    else {this.accessUnsubscribe?.();this.timeUnsubscribe?.()}
    if(previous?.uid!==user?.uid||oldRole!==this.lastRole)window.dispatchEvent(new Event('rudn:identitychange'));
  }
  status(){return {mode:this.mode,error:this.error,user:this.user,profile:this.getProfile(),admin:this.isAdmin(),...this.session.value}}
  onStatus(listener){this.listeners.push(listener);listener(this.status());return()=>{this.listeners=this.listeners.filter(x=>x!==listener)}}
  emitStatus(){
    this.mode=this.connected&&this.user?'cloud':'local';
    this.session.update({phase:this.authReady?'ready':'restoring',role:this.isAdmin()?'teacher':this.profile?'student':'guest',connection:this.connected?'online':this.authReady?'offline':'connecting'});
    for(const fn of this.listeners)fn(this.status());
  }
  isAdmin(){return Boolean(this.user?.email&&CONFIG.adminEmails.map(x=>x.toLowerCase()).includes(this.user.email.toLowerCase()))}
  async startAccessSync(){
    try{this.accessUnsubscribe?.()}catch{};try{this.timeUnsubscribe?.()}catch{}
    const accessRef=this.db.ref(this.database,`${CONFIG.rootPath}/access/overrides`);
    const timeRef=this.db.ref(this.database,'.info/serverTimeOffset');
    this.accessOverrides=readState('access-cache.v1',{});
    this.accessUnsubscribe=this.db.onValue(accessRef,snapshot=>{
      const next=snapshot.val()||{};const changed=JSON.stringify(next)!==JSON.stringify(this.accessOverrides);
      this.accessOverrides=next;writeState('access-cache.v1',next);if(changed)window.dispatchEvent(new CustomEvent('rudn:accesschange'));
    },error=>{this.error=error;this.emitStatus()});
    this.timeUnsubscribe=this.db.onValue(timeRef,snapshot=>{
      const next=Number(snapshot.val()||0),changed=Math.abs(next-this.serverTimeOffset)>1000;
      this.serverTimeOffset=next;if(changed)window.dispatchEvent(new CustomEvent('rudn:accesschange'));
    });
  }
  globalNow(){return Date.now()+Number(this.serverTimeOffset||0)}
  getAccessOverrides(startYear){return {...(this.accessOverrides?.[String(startYear)]||{})}}
  async setAccessOverride(startYear,key,state='auto'){
    if(!this.isAdmin())throw new Error('Требуются права преподавателя');
    if(!this.connected)throw serviceError('network/offline');
    const year=String(Number(startYear));const gateKey=String(key||'');
    if(!/^20\d{2}$/.test(year)||!(/^(topic-[1-8]|lecture-[1-7]-test)$/).test(gateKey))throw new Error('Некорректный блок курса');
    const ref=this.db.ref(this.database,`${CONFIG.rootPath}/access/overrides/${year}/${gateKey}`);
    if(state==='auto')await this.db.remove(ref);
    else{
      if(state!=='open'&&state!=='closed')throw new Error('Некорректный режим доступа');
      await this.db.set(ref,{state,updatedAt:this.db.serverTimestamp(),teacherUid:this.user.uid});
    }
    const next={...this.accessOverrides};const yearOverrides={...(next[year]||{})};
    if(state==='auto')delete yearOverrides[gateKey];
    else yearOverrides[gateKey]={state,updatedAt:Date.now(),teacherUid:this.user.uid};
    if(Object.keys(yearOverrides).length)next[year]=yearOverrides;else delete next[year];
    this.accessOverrides=next;
  }
  async adminSignIn(email,password){
    await this.init();if(!this.authClient)throw serviceError('network/unavailable');
    if(this.loginPending)return this.loginPending;
    this.loginPending=(async()=>{if(this.anonymousPending)await this.anonymousPending;const credential=await this.auth.signInWithEmailAndPassword(this.authClient,email,password);this.handleAuthUser(credential.user);return credential.user})().finally(()=>this.loginPending=null);
    return this.loginPending;
  }
  async adminSignOut(){return this.signOut()}
  async signOut(){
    this.generation++;this.profile=null;localStorage.removeItem(PROFILE_KEY);
    if(this.isAdmin()){for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('rudn.teacher-cache.'))localStorage.removeItem(key)}await this.auth.signOut(this.authClient);this.user=null;}
    this.emitStatus();window.dispatchEvent(new Event('rudn:identitychange'));
  }
  async updateTeacherName(fullName){if(!this.isAdmin())throw serviceError('auth/admin-required');if(!this.connected)throw serviceError('network/offline');await this.auth.updateProfile(this.authClient.currentUser,{displayName:normalizeFullName(fullName)});this.user=this.authClient.currentUser;this.emitStatus()}
  getProfile(){return !this.authReady||this.isAdmin()?null:this.profile}
  async ensureStudentCloud(){
    await this.init();if(!this.authClient)throw serviceError('network/unavailable');if(this.isAdmin())throw serviceError('auth/admin-required');
    if(!this.authClient.currentUser){if(!this.anonymousPending)this.anonymousPending=this.auth.signInAnonymously(this.authClient).finally(()=>this.anonymousPending=null);const result=await this.anonymousPending;this.handleAuthUser(result.user)}
    return this.user;
  }
  async lookupRoster(identifier){
    if(!this.db||!this.database)throw serviceError('network/offline');
    const identity=normalizeIdentifier(identifier);
    const ticketHash=await sha256(identity.ticket);
    const snapshot=await bounded(this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/roster/${ticketHash}`)));
    const record=snapshot.val();
    if(!record||typeof record.fullName!=='string'||typeof record.group!=='string')return null;
    return {...identity,fullName:normalizeFullName(record.fullName),group:normalizeGroup(record.group)};
  }
  async resolveStudentIdentity(identifier){
    const input=normalizeIdentifier(identifier);
    const cacheKey=`identity-alias.v1:${input.ticket}`;
    try{
      if(!this.db||!this.database||!this.user)throw serviceError('network/offline');
      const snapshot=await bounded(this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/studentAliases/${input.ticket}`)));
      const alias=snapshot.val();
      if(alias!==null&&(typeof alias!=='string'||!/^\d{5,20}$/.test(alias)))throw serviceError('auth/invalid-identifier');
      const identity=alias?normalizeIdentifier(alias):input;
      // A failed/offline lookup must never turn an alias into a new student.
      if(!this.connected&&!readState(`profile-cache.v1:${identity.studentKey}`,null)&&this.profile?.studentKey!==identity.studentKey)throw serviceError('network/offline');
      writeState(cacheKey,identity.studentKey);
      return identity;
    }catch(error){
      const cachedKey=readState(cacheKey,null);
      const identity=cachedKey?normalizeIdentifier(cachedKey):input;
      if(readState(`profile-cache.v1:${identity.studentKey}`,null)||this.profile?.studentKey===identity.studentKey)return identity;
      throw error;
    }
  }
  async lookupStudent(identifier){
    let identity=normalizeIdentifier(identifier);
    try{await bounded(this.ensureStudentCloud());
    identity=await this.resolveStudentIdentity(identifier);
    if(this.db&&this.database){
      const profileRef=this.db.ref(this.database,`${CONFIG.rootPath}/profiles/${identity.studentKey}`);
      const snapshot=await bounded(this.db.get(profileRef));
      const record=snapshot.val();
      if(record&&typeof record.fullName==='string'&&typeof record.group==='string'){
        const found={
          ...identity,
          fullName:normalizeFullName(record.fullName),
          group:normalizeGroup(record.group),
          createdAt:record.createdAt||null,
          updatedAt:record.updatedAt||null,
          source:'profile'
        };writeState(`profile-cache.v1:${identity.studentKey}`,found);return found;
      }
    }
    if(!this.connected)throw serviceError('network/offline');
    const roster=await this.lookupRoster(identity.ticket);
    return roster?{...roster,source:'roster'}:{...identity,fullName:'',group:'',source:'new'};
    }catch(error){const cached=readState(`profile-cache.v1:${identity.studentKey}`,null)||(this.profile?.studentKey===identity.studentKey?this.profile:null);if(cached)return {...cached,...identity,source:'profile',offline:true};throw error}
  }
  ownedProfile(profile,remote={}){
    const ownerUids={...(remote?.ownerUids||{})};
    if(remote?.ownerUid)ownerUids[remote.ownerUid]=true;
    ownerUids[this.user.uid]=true;
    return {...remote,...profile,ownerUid:this.user.uid,ownerUids};
  }
  async saveProfile(input){
    if(this.isAdmin())throw serviceError('auth/operation-not-allowed');
    const generation=this.generation;const uid=this.user?.uid;
    const identity=await this.resolveStudentIdentity(input.identifier||input.ticket||input.email);
    if(generation!==this.generation||uid!==this.user?.uid||this.isAdmin())throw serviceError('auth/profile-changed');
    const fullName=normalizeFullName(input.fullName);
    const group=normalizeGroup(input.group);
    const existing=this.profile&&this.profile.studentKey===identity.studentKey?this.profile:readState(`profile-cache.v1:${identity.studentKey}`,null);
    const timestamp=now();
    let profile={
      studentKey:identity.studentKey,ticket:identity.ticket,email:identity.email,group,
      displayName:fullName,fullName,
      schemaVersion:2,updatedAt:timestamp,createdAt:existing?.createdAt||timestamp
    };
    if(this.mode==='cloud'){
      const ref=this.db.ref(this.database,`${CONFIG.rootPath}/profiles/${profile.studentKey}`);
      try{
        const snapshot=await bounded(this.db.get(ref));const remote=snapshot.val()||{};
        if(generation!==this.generation||uid!==this.user?.uid||this.isAdmin())throw serviceError('auth/profile-changed');
        profile={...profile,createdAt:existing?.createdAt||remote.createdAt||timestamp};
        await bounded(this.db.set(ref,this.ownedProfile(profile,remote)));
      }
      catch(error){
        const message=String(error?.message||error);
        if(/permission|denied/i.test(message))throw new Error('Не удалось сохранить профиль. Примените обновлённые правила Firebase из патча.');
        throw error;
      }
    }else if(!existing&&!readState(`profile-cache.v1:${identity.studentKey}`,null))throw serviceError('network/offline');
    if(generation!==this.generation||uid!==this.user?.uid||this.isAdmin())throw serviceError('auth/profile-changed');
    this.generation++;this.profile=profile;writeLocal(PROFILE_KEY,profile);writeState(`profile-cache.v1:${profile.studentKey}`,profile);this.emitStatus();window.dispatchEvent(new Event('rudn:identitychange'));this.syncLocalToCloud().catch(()=>{});return profile;
  }
  clearLocalProfile(){return this.signOut()}
  localAttempts(){return [...new Map([...readLocal(ATTEMPTS_KEY,[]),...listState('attempt.v2:'),...listState('pending.v1:')].map(a=>[`${a.studentKey}/${a.id}`,a])).values()]}
  async reconcileQuizAttempts(items){
    if(!items.some(needsSeminar1Q48Review))return items;
    try{
      if(!this.gradingQuestions)this.gradingQuestions=fetch(new URL('../../data/questions.json',import.meta.url)).then(response=>{
        if(!response.ok)throw new Error('Question bank unavailable');
        return response.json();
      });
      const questions=await this.gradingQuestions;
      const result=items.map(attempt=>reconcileSeminar1Q48(attempt,questions));
      const changed=new Map(result.filter((attempt,index)=>attempt!==items[index]).map(attempt=>[`${attempt.studentKey}/${attempt.id}`,attempt]));
      for(const attempt of changed.values())storeAttempt(attempt,{pending:Boolean(readState(pendingStorageKey(attempt),null))});
      return result;
    }catch(error){this.gradingQuestions=null;console.warn('Quiz score reconciliation deferred',error);return items}
  }
  localGrades(studentKey=this.profile?.studentKey){
    if(!studentKey)return {};
    const scoped=readLocal(GRADES_KEY,{});
    return scoped[studentKey]&&typeof scoped[studentKey]==='object'?scoped[studentKey]:{};
  }
  writeLocalGrades(studentKey,grades){
    if(!studentKey)return;
    const scoped=readLocal(GRADES_KEY,{});
    scoped[studentKey]=grades;
    writeLocal(GRADES_KEY,scoped);
  }
  async saveAttempt(attempt){
    if(this.isAdmin())return {...attempt,preview:true};
    const profile=this.getProfile();
    if(!profile)throw serviceError('auth/profile-required');
    if(attempt.studentKey&&attempt.studentKey!==profile.studentKey)throw serviceError('auth/profile-changed');
    const record={...attempt,id:attempt.id||uuid(),studentKey:profile.studentKey,ownerUid:this.user?.uid||null,createdAt:attempt.createdAt||now()};
    // The durable outbox is written before acknowledging completion to the UI.
    storeAttempt(record,{pending:true});
    if(record.recordGrade!==false&&Number.isFinite(Number(record.points))&&record.activitySlug)this.updateLocalBestGrade(record.studentKey,record.activitySlug,record.points,record);
    this.session.update({saving:'pending'});this.syncLocalToCloud().catch(()=>{});
    window.dispatchEvent(new CustomEvent('rudn:gradechange',{detail:{activitySlug:record.activitySlug}}));return record;
  }
  updateLocalBestGrade(studentKey,activitySlug,points,source={}){
    const max=CONFIG.activityMax[activitySlug]??5;const bounded=Math.max(0,Math.min(max,Number(points)||0));
    const sourceAttemptId=source.sourceAttemptId||source.id||source.attemptId||null;
    const grades=this.localGrades(studentKey);const prior=grades[activitySlug];
    if(!prior||bounded>Number(prior.points||0))grades[activitySlug]={points:bounded,max,updatedAt:now(),sourceAttemptId};
    this.writeLocalGrades(studentKey,grades);
    return grades[activitySlug];
  }
  async updateBestGrade(activitySlug,points,source={}){
    if(this.isAdmin()||!this.profile)return null;
    const grade=this.updateLocalBestGrade(this.profile.studentKey,activitySlug,points,source);
    this.syncLocalToCloud().catch(()=>{});return grade;
  }
  async setManualGrade(studentKey,activitySlug,points,note=''){
    if(!this.isAdmin())throw new Error('Требуются права преподавателя');
    if(!this.connected)throw serviceError('network/offline');
    if(activitySlug==='seminar-1-classroom')throw serviceError('database/read-only');
    const max=CONFIG.activityMax[activitySlug]??5;const boundedScore=Math.max(0,Math.min(max,Number(points)||0));
    const ref=this.db.ref(this.database,`${CONFIG.rootPath}/grades/${studentKey}/${activitySlug}`);
    const candidate={points:boundedScore,max,note,manual:true,updatedAt:now(),teacherUid:this.user.uid};
    await bounded(this.db.runTransaction(ref,current=>!current||boundedScore>Number(current.points||0)?candidate:undefined,{applyLocally:false}));
  }
  async getAttempts(studentKey=this.profile?.studentKey){
    if(!studentKey)return [];
    let items=this.localAttempts().filter(x=>x.studentKey===studentKey);
    if(this.mode==='cloud'){try{const snap=await bounded(this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/attempts/${studentKey}`)));const remote=Object.values(snap.val()||{});for(const item of remote)storeAttempt(item,{pending:Boolean(readState(pendingStorageKey(item),null))});const map=new Map([...items,...remote].map(x=>[x.id,x]));items=[...map.values()]}catch(e){console.warn(e.code||'attempts-unavailable')}}
    items=await this.reconcileQuizAttempts(items);
    return items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  async getGrades(studentKey=this.profile?.studentKey){
    let grades=this.localGrades(studentKey);
    if(this.mode==='cloud'&&studentKey){try{const snap=await bounded(this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/grades/${studentKey}`)));for(const [slug,grade] of Object.entries(snap.val()||{}))if(!grades[slug]||Number(grade.points)>=Number(grades[slug].points))grades[slug]=grade;this.writeLocalGrades(studentKey,grades)}catch(e){console.warn(e.code||'grades-unavailable')}}
    return grades;
  }
  async uploadFile(activitySlug,file){
    if(this.mode!=='cloud'||!this.profile)throw serviceError('network/offline');
    const profile=this.profile;const uid=this.user.uid;const generation=this.generation;
    if(!this.storage){this.storageMod=await import('../vendor/firebase/firebase-storage.js');this.storage=this.storageMod.getStorage(this.firebase)}
    if(generation!==this.generation)throw serviceError('auth/profile-changed');
    const safe=String(file.name||'file').replace(/[^a-zа-яё0-9._-]/gi,'_');
    const path=`${CONFIG.rootPath}/submissions/${uid}/${profile.studentKey}/${activitySlug}/${Date.now()}-${safe}`;
    const storageRef=this.storageMod.ref(this.storage,path);
    const metadata={contentType:file.type||'application/octet-stream',customMetadata:{ownerUid:this.user.uid,studentKey:this.profile.studentKey,activitySlug}};
    const snapshot=await this.storageMod.uploadBytes(storageRef,file,metadata);if(generation!==this.generation)throw serviceError('auth/profile-changed');return this.storageMod.getDownloadURL(snapshot.ref);
  }
  async syncLocalToCloud(){
    if(this.flushing)return this.flushing;
    if(this.mode!=='cloud'||!this.profile||this.isAdmin())return;
    const profile={...this.profile};const uid=this.user.uid;const generation=this.generation;
    const active=()=>generation===this.generation&&this.user?.uid===uid&&this.profile?.studentKey===profile.studentKey&&!this.isAdmin();
    this.flushing=(async()=>{try{
      const pref=this.db.ref(this.database,`${CONFIG.rootPath}/profiles/${profile.studentKey}`);
      const remote=(await bounded(this.db.get(pref))).val();if(!active())return;
      const latest=remote&&String(remote.updatedAt||'')>String(profile.updatedAt||'')?{...profile,...remote}:profile;
      if(!remote||!remote.ownerUids?.[uid]||String(profile.updatedAt||'')>String(remote.updatedAt||''))await bounded(this.db.set(pref,this.ownedProfile(latest,remote||{})));
      if(!active())return;
      this.profile=latest;writeLocal(PROFILE_KEY,latest);writeState(`profile-cache.v1:${profile.studentKey}`,latest);
      for(const attempt of this.localAttempts().filter(a=>a.studentKey===profile.studentKey&&(readState(pendingStorageKey(a),null)||!readState(`attempt.v2:${a.studentKey}:${a.id}`,null)))){
        if(!active()||!this.connected)return;
        const ref=this.db.ref(this.database,`${CONFIG.rootPath}/attempts/${profile.studentKey}/${attempt.id}`);
        const snap=await bounded(this.db.get(ref));if(!active())return;
        const record=snap.exists()?snap.val():{...attempt,ownerUid:uid};
        if(!snap.exists())await bounded(this.db.set(ref,record));
        if(!active())return;
        if(record.recordGrade!==false&&Number.isFinite(Number(record.points))&&record.activitySlug){
          const slug=record.activitySlug;const max=CONFIG.activityMax[slug]??5;const points=Math.max(0,Math.min(max,Number(record.points)));
          const gradeRef=this.db.ref(this.database,`${CONFIG.rootPath}/grades/${profile.studentKey}/${slug}`);
          const prior=(await bounded(this.db.get(gradeRef))).val();if(!active())return;
          if(!prior||points>Number(prior.points)){
            // Rules verify the immutable source attempt in this student's branch,
            // including after a new anonymous transport has joined the profile.
            const candidate={points,max,updatedAt:now(),sourceAttemptId:record.id,ownerUid:uid};
            await bounded(this.db.runTransaction(gradeRef,current=>!current||points>Number(current.points)?candidate:undefined,{applyLocally:false}));
          }
          this.updateLocalBestGrade(profile.studentKey,slug,points,record);
        }
        storeAttempt(record);deleteState(pendingStorageKey(attempt));
      }
      if(active()){this.error=null;this.session.update({saving:'saved'});window.dispatchEvent(new Event('rudn:gradechange'))}
    }catch(error){if(active()){this.session.update({saving:'pending'});this.error=error;this.emitStatus()}}
    })().finally(()=>{
      this.flushing=null;clearTimeout(this.syncRetryTimer);
      if(!active()&&this.profile&&!this.isAdmin())this.syncLocalToCloud().catch(()=>{});
      else if(active()&&listState('pending.v1:').some(a=>a.studentKey===profile.studentKey))this.syncRetryTimer=setTimeout(()=>this.syncLocalToCloud().catch(()=>{}),this.error?15000:50);
    });
    return this.flushing;
  }
  adminCachedSnapshot(){
    if(!this.isAdmin())return null;
    const cached=readState(`teacher-cache.v1:${this.user.uid}`,null);
    if(!cached||!cached.cachedAt||!cached.profiles||!cached.attempts||!cached.grades)return null;
    return {...cached,stale:true};
  }
  async adminAll({allowCached=true}={}){
    if(!this.isAdmin())throw serviceError('auth/admin-required');
    const uid=this.user.uid;
    const generation=this.generation;
    const active=()=>this.isAdmin()&&this.user?.uid===uid&&this.generation===generation;
    const cacheKey=`teacher-cache.v1:${uid}`;
    let pending=this.adminReadPending;

    if(!pending||pending.uid!==uid||pending.generation!==generation){
      pending={uid,generation,promise:null};
      pending.promise=(async()=>{
        // .info/connected is an observation of the persistent connection, not
        // permission to attempt a read. It may still be false during startup.
        if(!this.db||!this.database)await bounded(this.init());
        if(!active())throw serviceError('auth/profile-changed');
        if(!this.db||!this.database)throw serviceError('network/unavailable');

        const values=await bounded(Promise.all(
          ['profiles','attempts','grades'].map(path=>
            this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/${path}`))
          )
        ));
        if(!active())throw serviceError('auth/profile-changed');
        const snapshot={
          profiles:values[0].val()||{},
          attempts:values[1].val()||{},
          grades:values[2].val()||{},
          cachedAt:now(),
          stale:!this.connected
        };
        // Firebase may satisfy get() from its own cache while disconnected.
        // Never label that data as freshly synchronized or enable editing.
        if(snapshot.stale){
          const cached=this.adminCachedSnapshot();
          if(cached)snapshot.cachedAt=cached.cachedAt;
        }
        try{writeState(cacheKey,snapshot)}catch{}
        return snapshot;
      })().finally(()=>{
        if(this.adminReadPending===pending)this.adminReadPending=null;
      });
      this.adminReadPending=pending;
    }

    try{
      return await pending.promise;
    }catch(error){
      if(!active())throw serviceError('auth/profile-changed');
      const cached=allowCached?this.adminCachedSnapshot():null;
      if(cached)return cached;
      throw error;
    }
  }

  async savePuzzleLeaderboardResult({difficulty,timeMs,placed,total}){
    if(!this.profile||this.mode!=='cloud'||!this.db||!this.database)return null;
    const level=['easy','medium','hard'].includes(difficulty)?difficulty:'medium';
    const measuredTime=Math.max(0,Math.min(3599000,Math.round(Number(timeMs)||0)));
    if(measuredTime<=1000)return null;
    const record={
      fio:String(this.profile.fullName||'').slice(0,100),
      group:String(this.profile.group||'').slice(0,50),
      difficulty:level,
      time_ms:measuredTime,
      placed:Number(placed),total:Number(total),
      timestamp:this.db.serverTimestamp(),
      user_agent:String(navigator.userAgent||'browser').slice(0,200)
    };
    if(record.placed!==89||record.total!==89)return null;
    const resultRef=this.db.push(this.db.ref(this.database,'results'));
    await this.db.set(resultRef,record);
    return {...record,id:resultRef.key,timestamp:Date.now()};
  }
  async getPuzzleLeaderboard(){
    try{
      if(this.mode==='cloud'&&this.db&&this.database){
        const snapshot=await this.db.get(this.db.ref(this.database,'results'));
        return Object.entries(snapshot.val()||{}).map(([id,value])=>({id,...value}));
      }
      const url=`${String(CONFIG.firebase.databaseURL).replace(/\/$/,'')}/results.json`;
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const value=await response.json();
      return Object.entries(value||{}).map(([id,row])=>({id,...row}));
    }catch(error){console.warn('Leaderboard unavailable',error);return []}
  }

  automaticRoomKey(group,date=new Date()){return automaticRoomKey(group,date)}
  async joinAutomaticQuizRoom(group){
    if(this.mode!=='cloud'||!this.user)throw new Error('Облачная синхронизация недоступна');
    const participantGroup=normalizeGroup(group);const roomKey=automaticRoomKey(participantGroup);const participantUid=this.user.uid;const connectionId=uuid();
    const presenceRef=this.db.ref(this.database,`${CONFIG.rootPath}/live/autoRooms/${roomKey}/presence/${participantUid}/${connectionId}`);
    const connectedRef=this.db.ref(this.database,'.info/connected');let disconnectHandle=null;
    const stop=this.db.onValue(connectedRef,async snap=>{
      if(snap.val()!==true)return;
      try{
        disconnectHandle=this.db.onDisconnect(presenceRef);
        await disconnectHandle.remove();
        await this.db.set(presenceRef,{participantUid,group:participantGroup,joinedAt:this.db.serverTimestamp(),clientJoinedAt:Date.now()});
      }catch(error){console.warn('Presence connection failed',error)}
    });
    const leave=async()=>{try{stop()}catch{};try{await disconnectHandle?.cancel()}catch{};try{await this.db.remove(presenceRef)}catch{}};
    return {roomKey,participantUid,connectionId,leave};
  }
  subscribeAutomaticPresence(roomKey,callback){
    if(this.mode!=='cloud')return()=>{};
    const ref=this.db.ref(this.database,`${CONFIG.rootPath}/live/autoRooms/${roomKey}/presence`);return this.db.onValue(ref,snap=>callback(snap.val()||{}));
  }
  subscribeAutomaticResponses(roomKey,callback){
    if(this.mode!=='cloud')return()=>{};
    const ref=this.db.ref(this.database,`${CONFIG.rootPath}/live/autoRooms/${roomKey}/responses`);return this.db.onValue(ref,snap=>callback(snap.val()||{}));
  }
  async submitAutomaticQuizResponse(roomKey,questionId,answer,questionIndex,group=this.profile?.group){
    if(this.mode!=='cloud'||!this.user)return false;
    const participantGroup=normalizeGroup(group);
    const participantUid=this.user.uid;
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/autoRooms/${roomKey}/responses/${questionId}/${participantUid}`),{
      participantUid,questionId,questionIndex:Number(questionIndex)||0,answer,group:participantGroup,
      submittedAt:this.db.serverTimestamp(),clientSubmittedAt:Date.now()
    });
    return true;
  }

  // Legacy code-based sessions remain readable for already stored records but are no longer used by the interface.
  async createLiveSession(questionIds){
    if(!this.isAdmin())throw new Error('Требуются права преподавателя');
    const code=String(Math.floor(100000+Math.random()*900000));const sessionId=uuid();
    const record={sessionId,code,state:'lobby',questionIds,currentIndex:-1,createdAt:now(),teacherUid:this.user.uid};
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/sessions/${sessionId}`),record);
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/current`),record);
    localStorage.setItem(LIVE_KEY,code);return record;
  }
  async updateLiveSession(session){if(!this.isAdmin())throw new Error('Требуются права преподавателя');await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/sessions/${session.sessionId}`),session);await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/current`),session);return session}
  subscribeCurrentLive(callback){if(this.mode!=='cloud')return()=>{};const ref=this.db.ref(this.database,`${CONFIG.rootPath}/live/current`);return this.db.onValue(ref,snap=>callback(snap.val()))}
  subscribeLiveResponses(sessionId,callback){if(this.mode!=='cloud')return()=>{};const ref=this.db.ref(this.database,`${CONFIG.rootPath}/live/responses/${sessionId}`);return this.db.onValue(ref,snap=>callback(snap.val()||{}))}
  async submitLiveResponse(sessionId,questionId,answer){if(this.mode!=='cloud'||!this.profile)throw new Error('Нужны профиль и облачное подключение');const key=this.profile.studentKey;await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/responses/${sessionId}/${questionId}/${key}`),{answer,studentKey:key,group:this.profile.group,submittedAt:now(),ownerUid:this.user.uid})}
}

export const backend=new Backend();
