import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source=await readFile(new URL('../site/assets/js/backend.js',import.meta.url),'utf8');
function method(start,end){
  const beginning=source.indexOf('  async '+start+'(');
  const after=source.indexOf('  async '+end+'(',beginning);
  assert(beginning>=0&&after>beginning);
  return source.slice(beginning,after);
}

// Exercise the shipped grade methods without starting the platform or using Firebase.
const methods=vm.runInNewContext(`({${method('readCloud','writeDiagnosticBatch')},${method('getGrades','uploadFile')}})`,{
  CONFIG:{rootPath:'rudn-platform/v1',activityMax:{'seminar-5':5}},
  durableStore:{listAttempts:async()=>[]},
  bounded:promise=>promise,
  serviceError:code=>Object.assign(new Error(code),{code})
});
const reception='seminar-5';
const profile={studentKey:'12345678'};
const gradesPath='grades/'+profile.studentKey;
function fixture({cached, sdk, server, restUnavailable=false}){
  const calls=[];
  const backend={
    ...methods,profile,user:{uid:'test-uid'},generation:1,connected:true,database:{},
    db:{ref:(_database,path)=>path,get:async path=>{
      calls.push(['sdk',path]);
      if(sdk===undefined)throw Error('SDK offline');
      return {val:()=>sdk};
    }},
    restTransport:()=>({get:async path=>{
      calls.push(['rest',path]);
      if(restUnavailable)throw Error('REST offline');
      assert.equal(path,gradesPath+'/'+reception);
      return {value:server};
    }}),
    localGrades:()=>({...cached}),
    writeLocalGrades:(key,grades)=>calls.push(['cache',key,grades])
  };
  return {backend,calls};
}
test('fresh Reception server grade replaces a connected SDK cache on dashboard fetch',async()=>{
  const server={points:5,serverScored:true,sourceAttemptId:'reception-ai-test'};
  const {backend,calls}=fixture({cached:{[reception]:{points:0}},sdk:{[reception]:{points:0},'lecture-1':{points:3}},server});
  const grades=await backend.getGrades();
  assert.equal(grades[reception],server);
  assert.equal(grades['lecture-1'].points,3);
  assert.equal(calls.filter(([kind])=>kind==='rest').length,1);
  assert.equal(calls.find(([kind])=>kind==='cache')[2][reception],server);
});
test('the server-selected Reception best supersedes an older higher device score, including when the official result is zero',async()=>{
  const {backend}=fixture({cached:{[reception]:{points:4},'lecture-1':{points:5}},
    sdk:{[reception]:{points:2},'lecture-1':{points:2}},server:{points:0,serverScored:true}});
  const grades=await backend.getGrades();
  assert.equal(grades[reception].points,0);
  assert.equal(grades['lecture-1'].points,5);
});
test('offline grade reads preserve prior Reception results',async()=>{
  const cached={[reception]:{points:4,serverScored:true}};
  const {backend,calls}=fixture({cached,restUnavailable:true});
  assert.equal((await backend.getGrades())[reception],cached[reception]);
  assert.equal(calls.some(([kind])=>kind==='cache'),false);
});
test('missing server grade preserves an existing local fallback for an older attempt',async()=>{
  const cached={[reception]:{points:3}};
  const {backend}=fixture({cached,sdk:{'lecture-1':{points:2}},server:null});
  assert.equal((await backend.getGrades())[reception],cached[reception]);
});
