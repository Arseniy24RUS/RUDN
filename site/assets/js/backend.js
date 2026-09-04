import {CONFIG} from './config.js?v=1.1.9';

const PROFILE_KEY='rudn.profile.v1';
const ATTEMPTS_KEY='rudn.attempts.v1';
const GRADES_KEY='rudn.grades.v1';
const LIVE_KEY='rudn.live.lastCode';

function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value))}
function now(){return new Date().toISOString()}
function uuid(){return globalThis.crypto?.randomUUID?.()||`rudn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}
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
  if(legacy)return valid[Number(legacy[1])-1];
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

export function automaticRoomKey(group,date=new Date()){
  return `${cleanKey(group)}-${ymd(date)}`;
}

class Backend{
  constructor(){
    this.mode='local';this.error=null;this.firebase=null;this.auth=null;this.db=null;this.storage=null;this.user=null;
    this.profile=this.migrateProfile(readLocal(PROFILE_KEY,null));this.listeners=[];
    this.accessOverrides={};this.serverTimeOffset=0;this.accessUnsubscribe=null;this.timeUnsubscribe=null;
  }
  migrateProfile(profile){
    if(!profile)return null;
    try{
      const identity=normalizeIdentifier(profile.email||profile.ticket||profile.studentKey);
      let group=String(profile.group||'').trim();
      const legacy=group.match(/^ГГУбд-(0[1-6])-\d{2}$/);
      if(legacy&&!groupOptions().includes(group))group=groupOptions()[Number(legacy[1])-1];
      const fullName=String(profile.fullName||profile.displayName||identity.ticket).trim();
      const migrated={...profile,studentKey:identity.studentKey,ticket:identity.ticket,email:identity.email,displayName:fullName,fullName,group,schemaVersion:2};
      delete migrated.recoveryPin;delete migrated.recoveryHash;
      writeLocal(PROFILE_KEY,migrated);return migrated;
    }catch{return null}
  }
  async init(){
    try{
      const [appMod,authMod,dbMod,storageMod]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js')
      ]);
      const app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(CONFIG.firebase);
      this.auth=authMod;this.db=dbMod;this.storageMod=storageMod;this.firebase=app;
      this.authClient=authMod.getAuth(app);this.database=dbMod.getDatabase(app);this.storage=storageMod.getStorage(app);
      await authMod.setPersistence(this.authClient,authMod.browserLocalPersistence);
      this.user=this.authClient.currentUser;
      if(!this.user){const credential=await authMod.signInAnonymously(this.authClient);this.user=credential.user}
      this.mode='cloud';this.error=null;
      try{await this.startAccessSync()}catch(accessError){console.warn('Access schedule sync failed',accessError)}
      await this.syncLocalToCloud();
    }catch(error){this.mode='local';this.error=error;console.warn('Firebase unavailable; local mode enabled.',error)}
    this.emitStatus();return this.status();
  }
  status(){return {mode:this.mode,error:this.error,user:this.user,profile:this.profile,admin:this.isAdmin()}}
  onStatus(listener){this.listeners.push(listener);listener(this.status());return()=>{this.listeners=this.listeners.filter(x=>x!==listener)}}
  emitStatus(){for(const fn of this.listeners)fn(this.status())}
  isAdmin(){return Boolean(this.user?.email&&CONFIG.adminEmails.map(x=>x.toLowerCase()).includes(this.user.email.toLowerCase()))}
  async startAccessSync(){
    try{this.accessUnsubscribe?.()}catch{};try{this.timeUnsubscribe?.()}catch{}
    const accessRef=this.db.ref(this.database,`${CONFIG.rootPath}/access/overrides`);
    const timeRef=this.db.ref(this.database,'.info/serverTimeOffset');
    const accessSnapshot=await this.db.get(accessRef);
    this.accessOverrides=accessSnapshot.val()||{};
    this.accessUnsubscribe=this.db.onValue(accessRef,snapshot=>{
      const next=snapshot.val()||{};const changed=JSON.stringify(next)!==JSON.stringify(this.accessOverrides);
      this.accessOverrides=next;if(changed)window.dispatchEvent(new CustomEvent('rudn:accesschange'));
    });
    this.timeUnsubscribe=this.db.onValue(timeRef,snapshot=>{
      const next=Number(snapshot.val()||0),changed=Math.abs(next-this.serverTimeOffset)>1000;
      this.serverTimeOffset=next;if(changed)window.dispatchEvent(new CustomEvent('rudn:accesschange'));
    });
  }
  globalNow(){return Date.now()+Number(this.serverTimeOffset||0)}
  getAccessOverrides(startYear){return {...(this.accessOverrides?.[String(startYear)]||{})}}
  async setAccessOverride(startYear,key,state='auto'){
    if(!this.isAdmin())throw new Error('Требуются права преподавателя');
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
    if(!this.authClient)throw new Error('Firebase недоступен');
    const credential=await this.auth.signInWithEmailAndPassword(this.authClient,email,password);this.user=credential.user;this.mode='cloud';this.emitStatus();return this.user;
  }
  async adminSignOut(){if(this.authClient)await this.auth.signOut(this.authClient);this.user=null;await this.init()}
  getProfile(){return this.profile}
  async lookupRoster(identifier){
    if(this.mode!=='cloud'||!this.db||!this.database)return null;
    const identity=normalizeIdentifier(identifier);
    const ticketHash=await sha256(identity.ticket);
    const snapshot=await this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/roster/${ticketHash}`));
    const record=snapshot.val();
    if(!record||typeof record.fullName!=='string'||typeof record.group!=='string')return null;
    return {...identity,fullName:normalizeFullName(record.fullName),group:normalizeGroup(record.group)};
  }
  async lookupStudent(identifier){
    const identity=normalizeIdentifier(identifier);
    if(this.mode==='cloud'&&this.db&&this.database){
      const profileRef=this.db.ref(this.database,`${CONFIG.rootPath}/profiles/${identity.studentKey}`);
      const snapshot=await this.db.get(profileRef);
      const record=snapshot.val();
      if(record&&typeof record.fullName==='string'&&typeof record.group==='string'){
        return {
          ...identity,
          fullName:normalizeFullName(record.fullName),
          group:normalizeGroup(record.group),
          createdAt:record.createdAt||null,
          updatedAt:record.updatedAt||null,
          source:'profile'
        };
      }
    }
    const roster=await this.lookupRoster(identity.ticket);
    return roster?{...roster,source:'roster'}:{...identity,fullName:'',group:'',source:'new'};
  }
  ownedProfile(profile,remote={}){
    const ownerUids={...(remote?.ownerUids||{})};
    if(remote?.ownerUid)ownerUids[remote.ownerUid]=true;
    ownerUids[this.user.uid]=true;
    return {...remote,...profile,ownerUid:this.user.uid,ownerUids};
  }
  async saveProfile(input){
    const identity=normalizeIdentifier(input.identifier||input.ticket||input.email);
    const fullName=normalizeFullName(input.fullName);
    const group=normalizeGroup(input.group);
    const existing=this.profile&&this.profile.studentKey===identity.studentKey?this.profile:null;
    const timestamp=now();
    let profile={
      studentKey:identity.studentKey,ticket:identity.ticket,email:identity.email,group,
      displayName:fullName,fullName,
      schemaVersion:2,updatedAt:timestamp,createdAt:existing?.createdAt||timestamp
    };
    if(this.mode==='cloud'){
      const ref=this.db.ref(this.database,`${CONFIG.rootPath}/profiles/${profile.studentKey}`);
      try{
        const snapshot=await this.db.get(ref);const remote=snapshot.val()||{};
        profile={...profile,createdAt:existing?.createdAt||remote.createdAt||timestamp};
        await this.db.set(ref,this.ownedProfile(profile,remote));
      }
      catch(error){
        const message=String(error?.message||error);
        if(/permission|denied/i.test(message))throw new Error('Не удалось сохранить профиль. Примените обновлённые правила Firebase из патча.');
        throw error;
      }
    }
    this.profile=profile;writeLocal(PROFILE_KEY,profile);this.emitStatus();return profile;
  }
  clearLocalProfile(){this.profile=null;localStorage.removeItem(PROFILE_KEY);this.emitStatus()}
  localAttempts(){return readLocal(ATTEMPTS_KEY,[])}
  localGrades(){return readLocal(GRADES_KEY,{})}
  async saveAttempt(attempt){
    if(!this.profile)throw new Error('Сначала войдите в профиль');
    const record={...attempt,id:attempt.id||uuid(),studentKey:this.profile.studentKey,ownerUid:this.user?.uid||null,createdAt:attempt.createdAt||now()};
    const attempts=this.localAttempts();attempts.push(record);writeLocal(ATTEMPTS_KEY,attempts.slice(-800));
    if(this.mode==='cloud')await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/attempts/${this.profile.studentKey}/${record.id}`),record);
    if(Number.isFinite(Number(record.points))&&record.activitySlug)await this.updateBestGrade(record.activitySlug,Number(record.points),record);
    window.dispatchEvent(new CustomEvent('rudn:gradechange',{detail:{activitySlug:record.activitySlug}}));return record;
  }
  async updateBestGrade(activitySlug,points,source={}){
    const max=CONFIG.activityMax[activitySlug]??5;const bounded=Math.max(0,Math.min(max,Number(points)||0));
    const sourceAttemptId=source.sourceAttemptId||source.id||source.attemptId||null;
    const grades=this.localGrades();const prior=grades[activitySlug];
    if(!prior||bounded>Number(prior.points||0))grades[activitySlug]={points:bounded,max,updatedAt:now(),sourceAttemptId};
    writeLocal(GRADES_KEY,grades);
    if(this.mode==='cloud'&&this.profile){
      const ref=this.db.ref(this.database,`${CONFIG.rootPath}/grades/${this.profile.studentKey}/${activitySlug}`);
      const candidate={points:bounded,max,updatedAt:now(),sourceAttemptId,ownerUid:this.user.uid};
      await this.db.runTransaction(ref,current=>!current||bounded>Number(current.points||0)?candidate:current,{applyLocally:false});
    }
    return grades[activitySlug];
  }
  async setManualGrade(studentKey,activitySlug,points,note=''){
    if(!this.isAdmin())throw new Error('Требуются права преподавателя');
    const max=CONFIG.activityMax[activitySlug]??5;const bounded=Math.max(0,Math.min(max,Number(points)||0));
    const ref=this.db.ref(this.database,`${CONFIG.rootPath}/grades/${studentKey}/${activitySlug}`);
    const candidate={points:bounded,max,note,manual:true,updatedAt:now(),teacherUid:this.user.uid};
    await this.db.runTransaction(ref,current=>!current||bounded>Number(current.points||0)?candidate:current,{applyLocally:false});
  }
  async getAttempts(studentKey=this.profile?.studentKey){
    let items=this.localAttempts().filter(x=>!studentKey||x.studentKey===studentKey);
    if(this.mode==='cloud'&&studentKey){try{const snap=await this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/attempts/${studentKey}`));const remote=Object.values(snap.val()||{});const map=new Map([...items,...remote].map(x=>[x.id,x]));items=[...map.values()]}catch(e){console.warn(e)}}
    return items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  async getGrades(studentKey=this.profile?.studentKey){
    let grades=this.localGrades();
    if(this.mode==='cloud'&&studentKey){try{const snap=await this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/grades/${studentKey}`));grades={...grades,...(snap.val()||{})}}catch(e){console.warn(e)}}
    return grades;
  }
  async uploadFile(activitySlug,file){
    if(this.mode!=='cloud'||!this.profile||!this.storage)throw new Error('Загрузка доступна только при облачной синхронизации');
    const safe=String(file.name||'file').replace(/[^a-zа-яё0-9._-]/gi,'_');
    const path=`${CONFIG.rootPath}/submissions/${this.user.uid}/${this.profile.studentKey}/${activitySlug}/${Date.now()}-${safe}`;
    const storageRef=this.storageMod.ref(this.storage,path);
    const metadata={contentType:file.type||'application/octet-stream',customMetadata:{ownerUid:this.user.uid,studentKey:this.profile.studentKey,activitySlug}};
    const snapshot=await this.storageMod.uploadBytes(storageRef,file,metadata);return this.storageMod.getDownloadURL(snapshot.ref);
  }
  async syncLocalToCloud(){
    if(this.mode!=='cloud'||!this.profile)return;
    try{
      const pref=this.db.ref(this.database,`${CONFIG.rootPath}/profiles/${this.profile.studentKey}`);
      const profileSnapshot=await this.db.get(pref);const remoteProfile=profileSnapshot.val()||null;
      if(remoteProfile&&String(remoteProfile.updatedAt||'')>String(this.profile.updatedAt||'')){
        this.profile={
          ...this.profile,
          studentKey:remoteProfile.studentKey,
          ticket:remoteProfile.ticket,
          email:remoteProfile.email,
          fullName:remoteProfile.fullName,
          displayName:remoteProfile.fullName,
          group:normalizeGroup(remoteProfile.group),
          createdAt:remoteProfile.createdAt||this.profile.createdAt,
          updatedAt:remoteProfile.updatedAt||this.profile.updatedAt,
          schemaVersion:2
        };
        writeLocal(PROFILE_KEY,this.profile);
      }
      await this.db.set(pref,this.ownedProfile(this.profile,remoteProfile||{}));
      for(const attempt of this.localAttempts().filter(x=>x.studentKey===this.profile.studentKey)){
        const record={...attempt,ownerUid:this.user.uid};const ref=this.db.ref(this.database,`${CONFIG.rootPath}/attempts/${this.profile.studentKey}/${record.id}`);const snap=await this.db.get(ref);if(!snap.exists())await this.db.set(ref,record);
      }
      for(const [slug,grade] of Object.entries(this.localGrades()))await this.updateBestGrade(slug,grade.points,grade);
    }catch(error){console.warn('Cloud synchronization failed',error)}
  }
  async adminAll(){
    if(!this.isAdmin())throw new Error('Требуются права преподавателя');
    const [p,a,g]=await Promise.all([
      this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/profiles`)),
      this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/attempts`)),
      this.db.get(this.db.ref(this.database,`${CONFIG.rootPath}/grades`))
    ]);
    return {profiles:p.val()||{},attempts:a.val()||{},grades:g.val()||{}};
  }

  async savePuzzleLeaderboardResult({difficulty,timeMs,placed,total}){
    if(!this.profile||this.mode!=='cloud'||!this.db||!this.database)return null;
    const level=['easy','medium','hard'].includes(difficulty)?difficulty:'medium';
    const record={
      fio:String(this.profile.fullName||'').slice(0,100),
      group:String(this.profile.group||'').slice(0,50),
      difficulty:level,
      time_ms:Math.max(0,Math.min(3599000,Math.round(Number(timeMs)||0))),
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
    if(this.mode!=='cloud'||!this.profile||!this.user)throw new Error('Облачная синхронизация недоступна');
    const roomKey=automaticRoomKey(group);const participantUid=this.user.uid;const connectionId=uuid();
    const presenceRef=this.db.ref(this.database,`${CONFIG.rootPath}/live/autoRooms/${roomKey}/presence/${participantUid}/${connectionId}`);
    const connectedRef=this.db.ref(this.database,'.info/connected');let disconnectHandle=null;
    const stop=this.db.onValue(connectedRef,async snap=>{
      if(snap.val()!==true)return;
      try{
        disconnectHandle=this.db.onDisconnect(presenceRef);
        await disconnectHandle.remove();
        await this.db.set(presenceRef,{participantUid,group,joinedAt:this.db.serverTimestamp(),clientJoinedAt:Date.now()});
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
  async submitAutomaticQuizResponse(roomKey,questionId,answer,questionIndex){
    if(this.mode!=='cloud'||!this.profile||!this.user)return false;
    const participantUid=this.user.uid;
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/autoRooms/${roomKey}/responses/${questionId}/${participantUid}`),{
      participantUid,questionId,questionIndex:Number(questionIndex)||0,answer,group:this.profile.group,
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
