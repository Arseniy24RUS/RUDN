// Reproducible additive rule update. Existing activity rules remain intact.
import fs from 'node:fs';
const path=new URL('../firebase/database.rules.json',import.meta.url);
const document=JSON.parse(fs.readFileSync(path,'utf8'));
const rules=document.rules['rudn-platform'].v1;
const admin="auth != null && auth.token.email === 'omnistat@yandex.ru'";
const profile=student=>`root.child('rudn-platform/v1/profiles').child(${student})`;
const owns=student=>`auth != null && (${profile(student)}.child('ownerUid').val() === auth.uid || ${profile(student)}.child('ownerUids').child(auth.uid).val() === true)`;
const canonical=student=>`!root.child('rudn-platform/v1/studentAliases').child(${student}).exists()`;
const attempt=student=>`root.child('rudn-platform/v1/attempts').child(${student}).child($attemptId)`;
const checkpoint="root.child('rudn-platform/v1/checkpoints').child($studentKey).child(newData.child('activitySlug').val()).child($attemptId)";
const head=`${checkpoint}.child('current/state')`;
const result="newData.child('result')";
const modes="(newData.child('mode').val() === 'assessment' || newData.child('mode').val() === 'free')";
const difficulty="(newData.child('difficulty').val() === 'easy' || newData.child('difficulty').val() === 'normal' || newData.child('difficulty').val() === 'hard')";
const score=`((${result}.child('coverageNp').val() < 90 || newData.child('mode').val() === 'free') ? newData.child('points').val() === 0 : ((newData.child('difficulty').val() === 'easy' && newData.child('points').val() === 3) || (newData.child('difficulty').val() === 'normal' && newData.child('points').val() === 4) || (newData.child('difficulty').val() === 'hard' && newData.child('points').val() === 5)))`;
const resultFields=['terminal','coverageNp','coveragePopulation','turns','spentMillionRub','reason'];
const matchingResult=resultFields.map(field=>`${result}.child('${field}').val() === ${head}.child('result/${field}').val()`).join(' && ');
const bounded=`${result}.child('terminal').val() === true && ${result}.child('coverageNp').isNumber() && ${result}.child('coverageNp').val() >= 0 && ${result}.child('coverageNp').val() <= 100 && ${result}.child('coveragePopulation').isNumber() && ${result}.child('coveragePopulation').val() >= 0 && ${result}.child('coveragePopulation').val() <= 100 && ${result}.child('turns').isNumber() && ${result}.child('turns').val() >= 0 && ${result}.child('spentMillionRub').isNumber() && ${result}.child('spentMillionRub').val() >= 0`;
let settlementAttempt=`newData.child('type').val() === 'settlements' && ${modes} && ${difficulty} && newData.child('regionId').isString() && newData.child('elapsedMs').isNumber() && newData.child('elapsedMs').val() >= 0 && ${bounded} && ${score} && newData.child('recordGrade').val() === (newData.child('mode').val() === 'assessment') && ((newData.child('mode').val() === 'assessment' && newData.child('activitySlug').val() === 'seminar-3') || (newData.child('mode').val() === 'free' && newData.child('activitySlug').val() === 'settlements-freeplay')) && !${checkpoint}.child('conflicts').exists() && ${head}.child('status').val() === 'completed' && ${head}.child('regionId').val() === newData.child('regionId').val() && ${head}.child('difficulty').val() === newData.child('difficulty').val() && ${head}.child('elapsedMs').val() === newData.child('elapsedMs').val() && ${head}.child('completedAt').val() === newData.child('completedAt').val() && ${matchingResult}`;
const board="newData.child('leaderboard')";
settlementAttempt+=` && (!${board}.exists() || (${result}.child('coverageNp').val() >= 90 && ${['mode','difficulty','regionId','elapsedMs','completedAt'].map(field=>`${board}.child('${field}').val() === newData.child('${field}').val()`).join(' && ')} && ${['coverageNp','coveragePopulation','turns','spentMillionRub'].map(field=>`${board}.child('${field}').val() === ${result}.child('${field}').val()`).join(' && ')} && ${board}.child('fio').isString() && ${board}.child('fio').val().length <= 150 && ${board}.child('group').isString() && ${board}.child('group').val().length <= 50 && ${board}.child('participantId').isString() && ${board}.child('participantId').val().matches(/^[0-9a-f]{64}$/)))`;
const attemptRules=rules.attempts.$studentKey.$attemptId;
// Idempotent generation: do not append the same extension twice.
const attemptSuffix=`) && (${admin} || ((newData.child('activitySlug').val() !== 'seminar-3'`;
if(attemptRules['.validate'].includes(attemptSuffix))attemptRules['.validate']=attemptRules['.validate'].slice(1,attemptRules['.validate'].indexOf(attemptSuffix));
if(!attemptRules['.validate'].includes("newData.child('type').val() === 'settlements'")){
  attemptRules['.validate']=`(${attemptRules['.validate']}) && (${admin} || ((newData.child('activitySlug').val() !== 'seminar-3' && newData.child('activitySlug').val() !== 'settlements-freeplay' && newData.child('type').val() !== 'settlements') || (${settlementAttempt})))`;
}
const current=rules.checkpoints.$studentKey.$activitySlug.$attemptId.current;
// Rebuild this suffix on each run, rather than nesting replacement expressions.
const suffix=` && (${admin} || (newData.child('mode').val() !== 'settlements-assessment'`;
if(current['.validate'].includes(suffix))current['.validate']=current['.validate'].slice(0,current['.validate'].indexOf(suffix));
if(!current['.validate'].includes("'settlements-assessment'")){
  const state="newData.child('state')";
  current['.validate']+=` && (${admin} || (newData.child('mode').val() !== 'settlements-assessment' && newData.child('mode').val() !== 'settlements-free') || (${state}.child('attemptId').val() === $attemptId && ${state}.child('regionId').isString() && (${state}.child('difficulty').val() === 'easy' || ${state}.child('difficulty').val() === 'normal' || ${state}.child('difficulty').val() === 'hard') && ${state}.child('engineSave').exists() && ${state}.child('elapsedMs').isNumber() && ${state}.child('elapsedMs').val() >= 0 && (${state}.child('status').val() === 'active' || ${state}.child('status').val() === 'abandoned' || ${state}.child('status').val() === 'completion-pending' || ${state}.child('status').val() === 'completed') && (!data.exists() || (${state}.child('regionId').val() === data.child('state/regionId').val() && ${state}.child('difficulty').val() === data.child('state/difficulty').val())) && (data.child('state/status').val() !== 'completed' || (${state}.child('status').val() === 'completed' && ${resultFields.map(field=>`${state}.child('result/${field}').val() === data.child('state/result/${field}').val()`).join(' && ')}))))`;
}
current['.validate']=current['.validate'].replace("newData.child('state').child('engineSave').exists()", "(newData.child('state').child('engineSave').exists() || ((newData.child('state').child('status').val() === 'active' || newData.child('state').child('status').val() === 'abandoned') && newData.child('state').child('elapsedMs').val() === 0))");
current['.validate']+=` && ($activitySlug !== 'settlements-tutorial' || data.child('state/completed').val() !== true || newData.child('state/completed').val() === true)`;
current['.validate']+=` && (${admin} || (newData.child('mode').val() !== 'settlements-assessment' && newData.child('mode').val() !== 'settlements-free') || data.child('state/status').val() !== 'abandoned' || newData.child('state/status').val() === 'abandoned')`;
const index="root.child('rudn-platform/v1/settlementsOwners').child($attemptId)";
const indexedStudent=`${index}.child('studentKey').val()`;
const privateAttempt=student=>`root.child('rudn-platform/v1/attempts').child(${student}).child(newData.child('attemptId').val())`;
const indexedAttempt=`root.child('rudn-platform/v1/attempts').child(${indexedStudent}).child(${index}.child('attemptId').val())`;
rules.settlementsOwners={'.read':admin,'$attemptId':{
  '.read':`${admin} || (auth != null && !data.exists()) || (${owns("data.child('studentKey').val()")})`,
  '.write':`${admin} || (!data.exists() && ${owns("newData.child('studentKey').val()")} && ${canonical("newData.child('studentKey').val()")})`,
  '.validate':`${admin} || (newData.hasChildren(['studentKey','attemptId','ownerUid','participantId']) && ${privateAttempt("newData.child('studentKey').val()")}.child('leaderboard/id').val() === $attemptId && ${privateAttempt("newData.child('studentKey').val()")}.child('ownerUid').val() === newData.child('ownerUid').val() && ${privateAttempt("newData.child('studentKey').val()")}.child('type').val() === 'settlements' && ${privateAttempt("newData.child('studentKey').val()")}.child('leaderboard/participantId').val() === newData.child('participantId').val())`,
  studentKey:{'.validate':'newData.isString()'},attemptId:{'.validate':'newData.isString()'},ownerUid:{'.validate':'newData.isString()'},participantId:{'.validate':'newData.isString()'},'$other':{'.validate':false}
}};
const fields=['id','participantId','fio','group','mode','difficulty','regionId','turns','elapsedMs','spentMillionRub','coverageNp','coveragePopulation','completedAt'];
rules.settlementsLeaderboard={'.read':'auth != null','$mode':{'$difficulty':{'.indexOn':['spentMillionRub'],'$attemptId':{
  '.write':`${admin} || (!data.exists() && ${owns(indexedStudent)} && ${canonical(indexedStudent)})`,
  '.validate':`${admin} || (newData.hasChildren(${JSON.stringify(fields)}) && ($mode === 'assessment' || $mode === 'free') && ($difficulty === 'easy' || $difficulty === 'normal' || $difficulty === 'hard') && newData.child('id').val() === $attemptId && newData.child('mode').val() === $mode && newData.child('difficulty').val() === $difficulty && newData.child('coverageNp').val() >= 90 && ${fields.map(field=>`newData.child('${field}').val() === ${indexedAttempt}.child('leaderboard/${field}').val()`).join(' && ')})`,
  ...Object.fromEntries(fields.map(field=>[field,{'.validate':['turns','elapsedMs','spentMillionRub','coverageNp','coveragePopulation','completedAt'].includes(field)?'newData.isNumber()':'newData.isString()'}])),
  '$other':{'.validate':false}
}}}};
fs.writeFileSync(path,JSON.stringify(document,null,2)+'\n');
console.log('Settlements rules updated; no deployment performed.');
