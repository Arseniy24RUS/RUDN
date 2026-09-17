import {CONFIG} from './config.js?v=1.3.7';
import {needsSeminar1Q48Review,reconcileSeminar1Q48} from './grading-revisions.js?v=1.3.7';
import {sessionState,readState,writeState,deleteState,listState,storeAttempt,pendingStorageKey} from './session.js?v=1.3.7';
import {durableStore} from './durable-store.js';
import {createFirebaseRestTransport} from './firebase-rest.js';
import {createCheckpointSync,commitStudentAttempt} from './checkpoint-sync.js';
import {commitPuzzleLeaderboard} from './puzzle-storage.js?v=1.3.7';

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
        // An unavailable browser auth store must not block local course work.
        // The listener below still reconciles the eventual identity; writes are
        // owner-scoped and cloud delivery waits for an authenticated session.
        await bounded(this.authClient.authStateReady(),4000).catch(()=>{});
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
    if(previous?.uid!==user?.uid){this.generation++;this.restAvailableAt=0;this.checkpointSync?.stop()}
    if(this.isAdmin()){this.profile=null;localStorage.removeItem(PROFILE_KEY)}
    if(oldRole==='teacher'&&!this.isAdmin()){for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('rudn.teacher-cache.'))localStorage.removeItem(key)}}
    this.lastRole=this.isAdmin()?'teacher':this.profile?'student':'guest';this.emitStatus();
    if(user){this.startAccessSync().catch(()=>{});if(this.profile&&!this.isAdmin())this.syncLocalToCloud().catch(()=>{})}
    else {this.accessUnsubscribe?.();this.timeUnsubscribe?.()}
    if(previous?.uid!==user?.uid||oldRole!==this.lastRole)window.dispatchEvent(new Event('rudn:identitychange'));
  }
  status(){return {mode:this.mode,error:this.error,user:this.user,profile:this.getProfile(),admin:this.isAdmin(),databaseAvailable:this.databaseAvailable(),...this.session.value}}
  databaseAvailable(){return Boolean(this.user&&navigator.onLine!==false&&(this.connected||this.restAvailableAt))}
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
    this.checkpointSync?.stop();
    this.restAvailableAt=0;
    clearTimeout(this.syncRetryTimer);
    this.generation++;this.profile=null;localStorage.removeItem(PROFILE_KEY);
    if(this.isAdmin()){for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('rudn.teacher-cache.'))localStorage.removeItem(key)}await this.auth.signOut(this.authClient);this.user=null;}
    this.emitStatus();window.dispatchEvent(new Event('rudn:identitychange'));
  }
  async updateTeacherName(fullName){if(!this.isAdmin())throw serviceError('auth/admin-required');if(!this.connected)throw serviceError('network/offline');await this.auth.updateProfile(this.authClient.currentUser,{displayName:normalizeFullName(fullName)});this.user=this.authClient.currentUser;this.emitStatus()}
  getProfile(){return !this.authReady||this.isAdmin()?null:this.profile}
  restTransport(){
    if(!this.restClient){
      this.restClient=createFirebaseRestTransport({
        databaseURL:CONFIG.emulators?`http://${CONFIG.emulators.host}:${CONFIG.emulators.databasePort}`:CONFIG.firebase.databaseURL,
        namespace:CONFIG.emulators?'demo-rudn-default-rtdb':null,
        rootPath:CONFIG.rootPath,
        getUser:()=>this.user,
        getGeneration:()=>this.generation
      });
    }
    return this.restClient;
  }
  async readCloud(path,{authoritative=false}={}){
    const uid=this.user?.uid;
    const generation=this.generation;
    if(!uid)throw serviceError('auth/profile-required');
    const active=()=>this.user?.uid===uid&&this.generation===generation;
    if(!authoritative&&this.connected&&this.db&&this.database){
      try{
        const snapshot=await bounded(this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/${path}`)),4000);
        if(!active())throw serviceError('auth/profile-changed');
        if(this.connected)return snapshot.val();
      }catch(error){if(!active()||error.code==='auth/profile-changed')throw serviceError('auth/profile-changed')}
    }
    try{
      const response=await this.restTransport().get(path);
      if(!active())throw serviceError('auth/profile-changed');
      this.restAvailableAt=Date.now();
      return response.value;
    }catch(error){
      if(active()&&String(error.code||'').startsWith('network/'))this.restAvailableAt=0;
      throw error;
    }
  }
  durableSync(){
    if(!this.checkpointSync){
      this.checkpointSync=createCheckpointSync({
        store:durableStore,transport:this.restTransport(),
        getIdentity:()=>this.profile&&!this.isAdmin()&&this.user?{
          owner:`student:${this.profile.studentKey}`,studentKey:this.profile.studentKey,
          uid:this.user.uid,generation:this.generation
        }:null,
        commitAttempt:async(attempt,{operation,attachments,signal,active})=>{
          const result=await commitStudentAttempt(this.restTransport(),attempt,{
            studentKey:operation.studentKey,uid:this.user.uid,activityMax:CONFIG.activityMax,
            active,signal,attachments
          });
          if(!active())throw serviceError('auth/profile-changed');
          // This delivery belongs to the same immutable queued attempt. Do not
          // acknowledge it before both the grade and public result are durable.
          if(attempt.type==='map-puzzle'&&attempt.leaderboard){
            await commitPuzzleLeaderboard(this.puzzleLeaderboardTransport(),attempt.id,attempt.leaderboard,{signal,active});
          }
          try{
            storeAttempt(result);
            deleteState(pendingStorageKey(result));
            if(result.recordGrade!==false&&result.activitySlug!=='seminar-1-classroom'){
              this.updateLocalBestGrade(result.studentKey,result.activitySlug,result.points,result);
            }
          }catch{/* IndexedDB already retains the complete immutable attempt. */}
          window.dispatchEvent(new Event('rudn:gradechange'));
          return result;
        },
        uploadAttachment:(record,options)=>this.uploadDurableAttachment(record,options),
        onStatus:stats=>{
          this.session.update({saving:stats.remaining||stats.deferred||stats.quarantined?'pending':'saved'});
          this.emitStatus();
        }
      });
    }
    return this.checkpointSync;
  }
  async checkpoint(input,options={}){
    const result=await durableStore.checkpoint(input,{...options,queue:input.owner.startsWith('student:')&&options.queue!==false});
    if(input.owner===`student:${this.profile?.studentKey}`)this.syncLocalToCloud().catch(()=>{});
    return result;
  }
  async loadDraft(scope){
    const local=await durableStore.loadDraft(scope);
    if(local)return local;
    if(scope.owner!==`student:${this.profile?.studentKey}`||!this.user||this.isAdmin()||navigator.onLine===false)return null;
    try{
      return await this.durableSync().restore(scope,{timeoutMs:3000});
    }catch{return null}
  }
  async ensureCloudProfile(){
    if(!this.profile||this.isAdmin()||!this.user)throw serviceError('auth/profile-required');
    const profile={...this.profile};
    const uid=this.user.uid;
    const generation=this.generation;
    const active=()=>this.profile?.studentKey===profile.studentKey&&this.user?.uid===uid&&this.generation===generation&&!this.isAdmin();
    const result=await this.restTransport().transaction(`profiles/${profile.studentKey}`,remote=>{
      if(!active())throw serviceError('auth/profile-changed');
      const latest=remote&&String(remote.updatedAt||'')>String(profile.updatedAt||'')?{...profile,...remote}:profile;
      const owned=this.ownedProfile(latest,remote||{});
      if(remote&&remote.ownerUids?.[uid]&&remote.ownerUid===uid&&JSON.stringify(remote)===JSON.stringify(owned))return undefined;
      return owned;
    });
    if(!active())throw serviceError('auth/profile-changed');
    this.profile=result.value;
    try{writeLocal(PROFILE_KEY,result.value);writeState(`profile-cache.v1:${profile.studentKey}`,result.value)}catch{}
    return result.value;
  }
  async ensureStudentCloud(){
    await this.init();if(!this.authClient)throw serviceError('network/unavailable');if(this.isAdmin())throw serviceError('auth/admin-required');
    if(!this.authClient.currentUser){if(!this.anonymousPending)this.anonymousPending=this.auth.signInAnonymously(this.authClient).finally(()=>this.anonymousPending=null);const result=await this.anonymousPending;this.handleAuthUser(result.user)}
    return this.user;
  }
  async lookupRoster(identifier){
    const identity=normalizeIdentifier(identifier);
    const ticketHash=await sha256(identity.ticket);
    const record=await this.readCloud(`roster/${ticketHash}`,{authoritative:true});
    if(!record||typeof record.fullName!=='string'||typeof record.group!=='string')return null;
    return {...identity,fullName:normalizeFullName(record.fullName),group:normalizeGroup(record.group)};
  }
  async resolveStudentIdentity(identifier){
    const input=normalizeIdentifier(identifier);
    const cacheKey=`identity-alias.v1:${input.ticket}`;
    try{
      const alias=await this.readCloud(`studentAliases/${input.ticket}`,{authoritative:true});
      if(alias!==null&&(typeof alias!=='string'||!/^\d{5,20}$/.test(alias)))throw serviceError('auth/invalid-identifier');
      const identity=alias?normalizeIdentifier(alias):input;
      // A failed/offline lookup must never turn an alias into a new student.
      try{writeState(cacheKey,identity.studentKey)}catch{}
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
    if(this.user){
      const record=await this.readCloud(`profiles/${identity.studentKey}`,{authoritative:true});
      if(record&&typeof record.fullName==='string'&&typeof record.group==='string'){
        const found={
          ...identity,
          fullName:normalizeFullName(record.fullName),
          group:normalizeGroup(record.group),
          createdAt:record.createdAt||null,
          updatedAt:record.updatedAt||null,
          source:'profile'
        };try{writeState(`profile-cache.v1:${identity.studentKey}`,found)}catch{};return found;
      }
    }
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
    if(this.user){
      try{
        const result=await this.restTransport().transaction(`profiles/${profile.studentKey}`,remote=>{
          if(generation!==this.generation||uid!==this.user?.uid||this.isAdmin())throw serviceError('auth/profile-changed');
          profile={...profile,createdAt:existing?.createdAt||remote?.createdAt||timestamp};
          return this.ownedProfile(profile,remote||{});
        });
        profile=result.value;
      }
      catch(error){
        if(!existing||!String(error.code||'').startsWith('network/'))throw error;
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
    const generation=this.generation;
    if(attempt.studentKey&&attempt.studentKey!==profile.studentKey)throw serviceError('auth/profile-changed');
    const record={...attempt,id:attempt.id||uuid(),studentKey:profile.studentKey,ownerUid:this.user?.uid||null,createdAt:attempt.createdAt||now()};
    const owner=`student:${profile.studentKey}`;
    const scope={owner,activitySlug:record.activitySlug,attemptId:record.id,mode:record.draftMode||record.mode||'default'};
    const previous=await durableStore.loadDraft(scope);
    const attachmentIds=new Set([...(previous?.attachmentIds||[]),...(record.attachmentIds||[])]);
    const collect=value=>{
      if(typeof value==='string'&&value.startsWith('pending-attachment:'))attachmentIds.add(value.slice('pending-attachment:'.length));
      else if(typeof value==='string'&&value.startsWith('rudn-attachment:'))attachmentIds.add(value.slice('rudn-attachment:'.length));
      else if(value&&typeof value==='object')Object.values(value).forEach(collect);
    };
    collect(record);
    const saved=await durableStore.complete({
      ...scope,state:{...(previous?.state||{}),phase:'completed',resultAttempt:record},attempt:record,
      contentVersion:previous?.contentVersion||CONFIG.version,attachmentIds:[...attachmentIds]
    });
    if(this.generation!==generation||this.profile?.studentKey!==profile.studentKey||this.isAdmin()){
      throw serviceError('auth/profile-changed');
    }
    // A legacy mirror is best effort only after the durable transaction commits.
    // A full localStorage must not reject a safely persisted IndexedDB attempt.
    try{
      storeAttempt(record,{pending:true});
      if(record.recordGrade!==false&&Number.isFinite(Number(record.points))&&record.activitySlug){
        this.updateLocalBestGrade(record.studentKey,record.activitySlug,record.points,record);
      }
    }catch{}
    this.session.update({saving:'pending'});this.syncLocalToCloud().catch(()=>{});
    window.dispatchEvent(new CustomEvent('rudn:gradechange',{detail:{activitySlug:record.activitySlug}}));
    return {...record,saveStatus:saved?.saveStatus};
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
    if(!this.databaseAvailable())throw serviceError('network/offline');
    if(activitySlug==='seminar-1-classroom')throw serviceError('database/read-only');
    const max=CONFIG.activityMax[activitySlug]??5;const boundedScore=Math.max(0,Math.min(max,Number(points)||0));
    const candidate={points:boundedScore,max,note,manual:true,updatedAt:now(),teacherUid:this.user.uid};
    await this.restTransport().transaction(`grades/${studentKey}/${activitySlug}`,current=>
      !current||boundedScore>Number(current.points||0)?candidate:undefined);
    this.restAvailableAt=Date.now();
  }
  async getAttempts(studentKey=this.profile?.studentKey){
    if(!studentKey)return [];
    const durable=await durableStore.listAttempts({owner:`student:${studentKey}`});
    let items=[...new Map([...this.localAttempts().filter(x=>x.studentKey===studentKey),...durable].map(item=>[item.id,item])).values()];
    if(this.user){try{
      const remote=Object.values(await this.readCloud(`attempts/${studentKey}`)||{});
      for(const item of remote){try{storeAttempt(item,{pending:Boolean(readState(pendingStorageKey(item),null))})}catch{}}
      items=[...new Map([...items,...remote].map(item=>[item.id,item])).values()];
    }catch{/* Existing device results remain usable while Firebase is unavailable. */}}
    items=await this.reconcileQuizAttempts(items);
    return items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  async getGrades(studentKey=this.profile?.studentKey){
    let grades=this.localGrades(studentKey);
    if(studentKey){
      const attempts=await durableStore.listAttempts({owner:`student:${studentKey}`});
      for(const attempt of attempts){
        if(attempt.recordGrade===false||attempt.activitySlug==='seminar-1-classroom'||!Number.isFinite(Number(attempt.points)))continue;
        const max=CONFIG.activityMax[attempt.activitySlug]??5;
        const points=Math.max(0,Math.min(max,Number(attempt.points)));
        if(!grades[attempt.activitySlug]||points>Number(grades[attempt.activitySlug].points)){
          grades[attempt.activitySlug]={points,max,sourceAttemptId:attempt.id,updatedAt:attempt.createdAt};
        }
      }
    }
    if(this.user&&studentKey){try{
      const remote=await this.readCloud(`grades/${studentKey}`)||{};
      for(const [slug,grade] of Object.entries(remote))if(!grades[slug]||Number(grade.points)>=Number(grades[slug].points))grades[slug]=grade;
      try{this.writeLocalGrades(studentKey,grades)}catch{}
    }catch{/* Do not clear grades because a request failed. */}}
    return grades;
  }
  async uploadFile(activitySlug,file,{attemptId}={}){
    if(attemptId){
      if(!this.profile||this.isAdmin())throw serviceError('auth/profile-required');
      const attachment=await durableStore.putAttachment({
        owner:`student:${this.profile.studentKey}`,attemptId,blob:file,name:file.name,type:file.type
      });
      return `pending-attachment:${attachment.id}`;
    }
    if(this.mode!=='cloud'||!this.profile)throw serviceError('network/offline');
    const profile=this.profile;const uid=this.user.uid;const generation=this.generation;
    await this.ensureStorage();
    if(generation!==this.generation)throw serviceError('auth/profile-changed');
    const safe=String(file.name||'file').replace(/[^a-zа-яё0-9._-]/gi,'_');
    const path=`${CONFIG.rootPath}/submissions/${uid}/${profile.studentKey}/${activitySlug}/${Date.now()}-${safe}`;
    const storageRef=this.storageMod.ref(this.storage,path);
    const metadata={contentType:file.type||'application/octet-stream',customMetadata:{ownerUid:this.user.uid,studentKey:this.profile.studentKey,activitySlug}};
    const snapshot=await this.storageMod.uploadBytes(storageRef,file,metadata);if(generation!==this.generation)throw serviceError('auth/profile-changed');return this.storageMod.getDownloadURL(snapshot.ref);
  }
  async queueAttachment(activitySlug,file,{attemptId}={}){
    if(!this.profile||this.isAdmin())throw serviceError('auth/profile-required');
    if(!attemptId)throw serviceError('storage/attempt-required');
    const attachment=await durableStore.putAttachment({
      owner:`student:${this.profile.studentKey}`,attemptId,blob:file,name:file.name,type:file.type
    });
    return {id:attachment.id,ref:`rudn-attachment:${attachment.id}`,name:attachment.name,size:attachment.size};
  }
  async ensureStorage(){
    if(CONFIG.emulators&&!CONFIG.emulators.storagePort)throw serviceError('storage/emulator-unavailable');
    if(!this.storage){
      this.storageMod=await bounded(import('../vendor/firebase/firebase-storage.js'));
      this.storage=this.storageMod.getStorage(this.firebase);
      if(CONFIG.emulators)this.storageMod.connectStorageEmulator(this.storage,CONFIG.emulators.host,CONFIG.emulators.storagePort);
    }
    return this.storage;
  }
  async uploadDurableAttachment(record,{operation,signal,active}){
    if(!active())throw serviceError('auth/profile-changed');
    if(record.remoteUrl)return {url:record.remoteUrl,name:record.name,type:record.type,size:record.size};
    if(record.size>=12*1024*1024)throw serviceError('storage/file-too-large');
    await this.ensureStorage();
    if(!active())throw serviceError('auth/profile-changed');
    const hash=await sha256(record.id);
    const safe=String(record.name||'file').replace(/[^a-zа-яё0-9._-]/gi,'_').slice(-120);
    const path=`${CONFIG.rootPath}/submissions/${this.user.uid}/${operation.studentKey}/${operation.activitySlug}/${hash}-${safe}`;
    const storageRef=this.storageMod.ref(this.storage,path);
    const metadata={contentType:record.type||'application/octet-stream',customMetadata:{
      ownerUid:this.user.uid,studentKey:operation.studentKey,activitySlug:operation.activitySlug
    }};
    if(signal?.aborted)throw serviceError('network/aborted');
    const uploaded=await bounded(this.storageMod.uploadBytes(storageRef,record.blob,metadata),30000);
    if(!active())throw serviceError('auth/profile-changed');
    const url=await bounded(this.storageMod.getDownloadURL(uploaded.ref));
    if(!active())throw serviceError('auth/profile-changed');
    return {url,path,name:record.name,type:record.type,size:record.size};
  }
  async syncLocalToCloud(){
    if(this.flushing)return this.flushing;
    if(!this.profile||this.isAdmin()||!this.user)return;
    const profile={...this.profile};const uid=this.user.uid;const generation=this.generation;
    const active=()=>generation===this.generation&&this.user?.uid===uid&&this.profile?.studentKey===profile.studentKey&&!this.isAdmin();
    this.flushing=(async()=>{try{
      const owner=`student:${profile.studentKey}`;
      await durableStore.importLegacy({owner});
      if(!active())return;
      await this.ensureCloudProfile();
      if(!active())return;
      const sync=this.durableSync();
      sync.start();
      await sync.flush();
      if(active())this.error=null;
    }catch(error){
      if(active()){
        this.session.update({saving:'pending'});
        clearTimeout(this.syncRetryTimer);
        this.syncRetryTimer=setTimeout(()=>this.syncLocalToCloud().catch(()=>{}),15000);
      }
    }
    })().finally(()=>{
      this.flushing=null;
      if(!active()&&this.profile&&!this.isAdmin())this.syncLocalToCloud().catch(()=>{});
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
        if(!active())throw serviceError('auth/profile-changed');

        const values=await Promise.all(['profiles','attempts','grades'].map(path=>this.readCloud(path)));
        if(!active())throw serviceError('auth/profile-changed');
        const snapshot={
          profiles:values[0]||{},
          attempts:values[1]||{},
          grades:values[2]||{},
          cachedAt:now(),
          stale:false
        };
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

  puzzleLeaderboardTransport(){
    if(!this.puzzleResultsClient)this.puzzleResultsClient=createFirebaseRestTransport({
      databaseURL:CONFIG.emulators?`http://${CONFIG.emulators.host}:${CONFIG.emulators.databasePort}`:CONFIG.firebase.databaseURL,
      namespace:CONFIG.emulators?'demo-rudn-default-rtdb':null,rootPath:'results',
      getUser:()=>this.user,getGeneration:()=>this.generation
    });
    return this.puzzleResultsClient;
  }
  async puzzleLeaderboardRecord({difficulty,timeMs,placed,total,timestamp=Date.now()},profile=this.getProfile()){
    if(!profile)return null;
    const level=['easy','medium','hard'].includes(difficulty)?difficulty:'medium';
    const elapsed=Math.round(Number(timeMs));
    if(!Number.isSafeInteger(elapsed)||elapsed<=1000)return null;
    const record={
      fio:String(profile.fullName||'').slice(0,100),
      group:String(profile.group||'').slice(0,50),
      difficulty:level,
      // Keep the original field within deployed append-only rule limits. New
      // readers use the full duration, including games longer than one hour.
      time_ms:Math.min(3599000,elapsed),
      elapsed_ms:elapsed,
      placed:Number(placed),total:Number(total),
      timestamp:Number(timestamp)||Date.now(),
      user_agent:String(navigator.userAgent||'browser').slice(0,200)
    };
    if(record.placed!==89||record.total!==89)return null;
    if(profile.studentKey)record.participant_id=await sha256(`rudn-puzzle-participant-v1:${profile.studentKey}`);
    return record;
  }
  puzzleLeaderboardCacheKey(){
    return `rudn.puzzle-leaderboard.v2:${CONFIG.emulators?'emulator':CONFIG.firebase.projectId}`;
  }
  getCachedPuzzleLeaderboard(){
    const cached=readLocal(this.puzzleLeaderboardCacheKey(),null);
    return cached&&Array.isArray(cached.rows)?cached:null;
  }
  async getPuzzleLeaderboard({signal}={}){
    const base=CONFIG.emulators?`http://${CONFIG.emulators.host}:${CONFIG.emulators.databasePort}`:CONFIG.firebase.databaseURL;
    const url=new URL(`${String(base).replace(/\/$/,'')}/results.json`);
    if(CONFIG.emulators)url.searchParams.set('ns','demo-rudn-default-rtdb');
    const controller=new AbortController(),abort=()=>controller.abort();
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,5000);
    try{
      const response=await fetch(url.href,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const value=await response.json();
      if(value!==null&&(typeof value!=='object'||Array.isArray(value)))throw new Error('Invalid leaderboard response');
      const rows=Object.entries(value||{}).map(([id,row])=>({...row,id}));
      try{writeLocal(this.puzzleLeaderboardCacheKey(),{rows,cachedAt:Date.now()})}catch{}
      return rows;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
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
    if(!this.user)return false;
    const participantGroup=normalizeGroup(group);
    const participantUid=this.user.uid;
    this.lastLiveSubmittedAt=Math.max(Date.now(),Number(this.lastLiveSubmittedAt||0)+1);
    const record={
      participantUid,questionId,questionIndex:Number(questionIndex)||0,answer,group:participantGroup,
      clientSubmittedAt:this.lastLiveSubmittedAt
    };
    if(this.isAdmin()){
      await this.restTransport().put(`live/autoRooms/${roomKey}/responses/${questionId}/${participantUid}`,{
        ...record,submittedAt:{'.sv':'timestamp'}
      });
      return true;
    }
    if(!this.profile)return false;
    await durableStore.checkpoint({
      owner:`student:${this.profile.studentKey}`,activitySlug:'seminar-1-classroom-live',mode:'live-answer',
      attemptId:`live-${roomKey}-${questionId}-${participantUid}`,contentVersion:'1',
      state:{...record,roomKey}
    });
    this.syncLocalToCloud().catch(()=>{});
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
