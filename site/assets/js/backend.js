import {CONFIG} from './config.js?v=1.0.7';

const PROFILE_KEY='rudn.profile.v1';
const ATTEMPTS_KEY='rudn.attempts.v1';
const GRADES_KEY='rudn.grades.v1';
const LIVE_KEY='rudn.live.lastCode';

function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value))}
function now(){return new Date().toISOString()}
function cleanKey(value){return String(value||'').trim().toLowerCase().replace(/@(?:rudn|pfur)\.ru$/,'').replace(/[^a-zа-яё0-9_-]/gi,'-').replace(/-+/g,'-').slice(0,80)}
function normalizeIdentifier(value){
  const raw=String(value||'').trim().toLowerCase();
  const ticket=raw.includes('@')?raw.split('@')[0]:raw;
  return {ticket,email:raw.includes('@')?raw:`${ticket}@rudn.ru`,studentKey:cleanKey(ticket)};
}
async function sha256(value){const data=new TextEncoder().encode(String(value));const hash=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('')}
function randomPin(){return String(Math.floor(100000+Math.random()*900000))}

class Backend{
  constructor(){this.mode='local';this.error=null;this.firebase=null;this.auth=null;this.db=null;this.storage=null;this.user=null;this.profile=readLocal(PROFILE_KEY,null);this.listeners=[]}
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
      await this.syncLocalToCloud();
    }catch(error){this.mode='local';this.error=error;console.warn('Firebase unavailable; local mode enabled.',error)}
    this.emitStatus();return this.status();
  }
  status(){return {mode:this.mode,error:this.error,user:this.user,profile:this.profile,admin:this.isAdmin()}}
  onStatus(listener){this.listeners.push(listener);listener(this.status());return()=>{this.listeners=this.listeners.filter(x=>x!==listener)}}
  emitStatus(){for(const fn of this.listeners)fn(this.status())}
  isAdmin(){return Boolean(this.user?.email&&CONFIG.adminEmails.map(x=>x.toLowerCase()).includes(this.user.email.toLowerCase()))}
  async adminSignIn(email,password){
    if(!this.authClient)throw new Error('Firebase недоступен');
    const credential=await this.auth.signInWithEmailAndPassword(this.authClient,email,password);this.user=credential.user;this.mode='cloud';this.emitStatus();return this.user;
  }
  async adminSignOut(){if(this.authClient)await this.auth.signOut(this.authClient);this.user=null;await this.init();}
  getProfile(){return this.profile}
  async saveProfile(input){
    const identity=normalizeIdentifier(input.identifier||input.ticket||input.email);
    if(!identity.studentKey)throw new Error('Не указан номер студенческого билета');
    if(!String(input.fullName||'').trim())throw new Error('Не указано ФИО');
    if(!String(input.group||'').trim())throw new Error('Не указана группа');
    const existing=this.profile&&this.profile.studentKey===identity.studentKey?this.profile:null;
    const suppliedPin=String(input.recoveryPin||'').trim();
    const pin=suppliedPin||existing?.recoveryPin||randomPin();
    const profile={
      studentKey:identity.studentKey,ticket:identity.ticket,email:identity.email,
      fullName:String(input.fullName).trim(),group:String(input.group).trim(),
      recoveryPin:pin,updatedAt:now(),createdAt:existing?.createdAt||now()
    };
    if(this.mode==='cloud'){
      const pinHash=await sha256(pin);
      const ref=this.db.ref(this.database,`${CONFIG.rootPath}/profiles/${profile.studentKey}`);
      try{
        await this.db.set(ref,{...profile,recoveryPin:null,recoveryHash:pinHash,ownerUid:this.user.uid});
      }catch(error){
        const message=String(error?.message||error);
        if(/permission|denied/i.test(message))throw new Error('Профиль с этим номером уже существует либо указан неверный код восстановления.');
        throw error;
      }
    }
    this.profile=profile;writeLocal(PROFILE_KEY,profile);
    this.emitStatus();return profile;
  }
  clearLocalProfile(){this.profile=null;localStorage.removeItem(PROFILE_KEY);this.emitStatus()}
  localAttempts(){return readLocal(ATTEMPTS_KEY,[])}
  localGrades(){return readLocal(GRADES_KEY,{})}
  async saveAttempt(attempt){
    if(!this.profile)throw new Error('Сначала войдите в профиль');
    const record={...attempt,id:attempt.id||crypto.randomUUID(),studentKey:this.profile.studentKey,ownerUid:this.user?.uid||null,createdAt:attempt.createdAt||now()};
    const attempts=this.localAttempts();attempts.push(record);writeLocal(ATTEMPTS_KEY,attempts.slice(-800));
    if(this.mode==='cloud'){
      await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/attempts/${this.profile.studentKey}/${record.id}`),record);
    }
    if(Number.isFinite(Number(record.points))&&record.activitySlug){await this.updateBestGrade(record.activitySlug,Number(record.points),record)}
    window.dispatchEvent(new CustomEvent('rudn:gradechange',{detail:{activitySlug:record.activitySlug}}));
    return record;
  }
  async updateBestGrade(activitySlug,points,source={}){
    const max=CONFIG.activityMax[activitySlug]??5;const bounded=Math.max(0,Math.min(max,Number(points)||0));
    const sourceAttemptId=source.sourceAttemptId||source.id||source.attemptId||null;
    const grades=this.localGrades();const prior=grades[activitySlug];
    if(!prior||bounded>Number(prior.points||0))grades[activitySlug]={points:bounded,max,updatedAt:now(),sourceAttemptId};
    writeLocal(GRADES_KEY,grades);
    if(this.mode==='cloud'&&this.profile){
      const ref=this.db.ref(this.database,`${CONFIG.rootPath}/grades/${this.profile.studentKey}/${activitySlug}`);
      const snap=await this.db.get(ref);const current=snap.val();
      if(!current||bounded>Number(current.points||0))await this.db.set(ref,{points:bounded,max,updatedAt:now(),sourceAttemptId,ownerUid:this.user.uid});
    }
    return grades[activitySlug];
  }
  async setManualGrade(studentKey,activitySlug,points,note=''){
    if(!this.isAdmin())throw new Error('Требуются права преподавателя');
    const max=CONFIG.activityMax[activitySlug]??5;const bounded=Math.max(0,Math.min(max,Number(points)||0));
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/grades/${studentKey}/${activitySlug}`),{points:bounded,max,note,manual:true,updatedAt:now(),teacherUid:this.user.uid});
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
      const p={...this.profile};delete p.recoveryPin;
      const pinHash=await sha256(this.profile.recoveryPin||'');
      const pref=this.db.ref(this.database,`${CONFIG.rootPath}/profiles/${this.profile.studentKey}`);
      await this.db.set(pref,{...p,recoveryHash:pinHash,ownerUid:this.user.uid});
      for(const attempt of this.localAttempts().filter(x=>x.studentKey===this.profile.studentKey)){
        const record={...attempt,ownerUid:this.user.uid};
        const ref=this.db.ref(this.database,`${CONFIG.rootPath}/attempts/${this.profile.studentKey}/${record.id}`);
        const snap=await this.db.get(ref);if(!snap.exists())await this.db.set(ref,record);
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
  async createLiveSession(questionIds){
    if(!this.isAdmin())throw new Error('Требуются права преподавателя');
    const code=String(Math.floor(100000+Math.random()*900000));const sessionId=crypto.randomUUID();
    const record={sessionId,code,state:'lobby',questionIds,currentIndex:-1,createdAt:now(),teacherUid:this.user.uid};
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/sessions/${sessionId}`),record);
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/current`),record);
    localStorage.setItem(LIVE_KEY,code);return record;
  }
  async updateLiveSession(session){
    if(!this.isAdmin())throw new Error('Требуются права преподавателя');
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/sessions/${session.sessionId}`),session);
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/current`),session);return session;
  }
  subscribeCurrentLive(callback){
    if(this.mode!=='cloud')return()=>{};
    const ref=this.db.ref(this.database,`${CONFIG.rootPath}/live/current`);return this.db.onValue(ref,snap=>callback(snap.val()));
  }
  subscribeLiveResponses(sessionId,callback){
    if(this.mode!=='cloud')return()=>{};
    const ref=this.db.ref(this.database,`${CONFIG.rootPath}/live/responses/${sessionId}`);return this.db.onValue(ref,snap=>callback(snap.val()||{}));
  }
  async submitLiveResponse(sessionId,questionId,answer){
    if(this.mode!=='cloud'||!this.profile)throw new Error('Нужны профиль и облачное подключение');
    const key=this.profile.studentKey;
    await this.db.set(this.db.ref(this.database,`${CONFIG.rootPath}/live/responses/${sessionId}/${questionId}/${key}`),{answer,studentKey:key,fullName:this.profile.fullName,group:this.profile.group,submittedAt:now(),ownerUid:this.user.uid});
  }
}

export const backend=new Backend();
export {normalizeIdentifier,sha256};
