import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {commitPuzzleLeaderboard} from '../site/assets/js/puzzle-storage.js';
import {bestPuzzleResults} from '../site/assets/js/puzzle-leaderboard.js';
const identity = await import(process.env.PUZZLE_IDENTITY_SOURCE ? pathToFileURL(process.env.PUZZLE_IDENTITY_SOURCE) : new URL('../site/assets/js/student-identity.js',import.meta.url));
// The fallback reproduces pre-fix backend delivery for a retained baseline run.
const publicId = identity.puzzleLeaderboardAttemptId || (attempt => attempt.id);
const {rekeyStudentAttempt,rekeyStudentValue,mergedRecordId}=identity;
const localResult=identity.puzzleLeaderboardLocalResult || (attempt=>attempt?.type==='map-puzzle'&&attempt.leaderboard?{...attempt.leaderboard,id:publicId(attempt),pending:true}:null);
const fixture = () => ({id:'puzzle-original-uuid',studentKey:'111111',activitySlug:'maps-freeplay',type:'map-puzzle',recordGrade:false,
 leaderboard:{fio:'Synthetic Puzzle Student',group:'Synthetic Group',difficulty:'hard',time_ms:6000,elapsed_ms:6100,placed:89,total:89,timestamp:1700000000000,user_agent:'isolated unit test',participant_id:'a'.repeat(64)}});

test('lost public acknowledgment followed by an owner merge reuses one immutable result',async()=>{
 const original=fixture(),rows=new Map();let loseAck=true,writes=0;
 const transport={async transaction(key,update){const next=update(rows.get(key)||null);if(next!==undefined){rows.set(key,structuredClone(next));writes++;if(loseAck){loseAck=false;throw new TypeError('Acknowledgment lost after server commit')}}return {value:rows.get(key)}}};
 await assert.rejects(commitPuzzleLeaderboard(transport,publicId(original),original.leaderboard),/Acknowledgment lost/);
 const migrated=rekeyStudentAttempt(original,'111111','222222');
 assert.notEqual(migrated.id,original.id,'private attempt is still copied under its new owner');
 await commitPuzzleLeaderboard(transport,publicId(migrated),migrated.leaderboard);
 await commitPuzzleLeaderboard(transport,publicId(migrated),migrated.leaderboard);
 assert.equal(rows.size,1);assert.equal(writes,1);assert.deepEqual(rows.get(original.id),original.leaderboard);
 assert.equal(migrated.recordGrade,false,'a free game must never become a graded attempt');
});

test('multiple merges freeze the original public key and preserve every public field',()=>{
 const original=fixture(),before=structuredClone(original);
 const once=rekeyStudentAttempt(original,'111111','222222');
 const twice=rekeyStudentAttempt(once,'222222','333333');
 assert.equal(publicId(twice),original.id);assert.equal(twice.leaderboardAttemptId,original.id);
 assert.deepEqual(twice.leaderboard,original.leaderboard);assert.deepEqual(original,before);
 assert.equal(twice.mergedFrom.attemptId,once.id);
});

test('durable payload and completion receipt preserve the same public key during recursive remapping',()=>{
 const original=fixture(),privateId=mergedRecordId('111111',original.id);
 const remapped=rekeyStudentValue({payload:original,state:{completionReceipt:original},owner:'student:111111',attemptId:original.id},
  {from:'111111',to:'222222',ids:{[original.id]:privateId}});
 assert.equal(remapped.attemptId,privateId);assert.equal(remapped.owner,'student:222222');
 for(const record of [remapped.payload,remapped.state.completionReceipt]){
  assert.equal(record.id,privateId);assert.equal(publicId(record),original.id);assert.deepEqual(record.leaderboard,original.leaderboard);
 }
});

test('legacy recovery uses its exact source ID without guessing earlier merge prefixes',()=>{
 const original=fixture();const once={...original,id:mergedRecordId('111111',original.id),mergedFrom:{studentKey:'111111',attemptId:original.id}};
 const twice={...once,id:mergedRecordId('222222',once.id),mergedFrom:{studentKey:'222222',attemptId:once.id}};
 assert.equal(publicId(once),original.id);assert.equal(publicId(twice),once.id);
 assert.equal(rekeyStudentAttempt(twice,'333333','444444').leaderboardAttemptId,once.id);
});

test('150-character public IDs remain valid through private prefixes; malformed explicit IDs are rejected',()=>{
 const original={...fixture(),id:'x'.repeat(150)};const migrated=rekeyStudentAttempt(original,'111111','222222');
 assert.ok(migrated.id.length>150);assert.equal(publicId(migrated),original.id);
 for(const id of ['', 'x'.repeat(151), '../bad', 'space id'])assert.throws(()=>publicId({...original,leaderboardAttemptId:id}),error=>error.code==='database/invalid-attempt-id');
 const ordinary={...fixture(),id:'merged-111111-legitimate-unmigrated-id'};assert.equal(publicId(ordinary),ordinary.id);
});

test('local migrated receipt and cloud result coalesce by their public attempt key',()=>{
 const original=fixture(),migrated=rekeyStudentAttempt(original,'111111','222222');
 const remote={...original.leaderboard,id:original.id,pending:false};
 const local=localResult(migrated);
 assert.equal(local.id,remote.id);const rows=bestPuzzleResults([remote],[local]);
 assert.equal(rows.length,1);assert.equal(rows[0].pending,false);assert.equal(rows[0].id,original.id);
});


test('a puzzle first completed after draft migration keeps its already-prefixed public ID',()=>{
 // The unfinished draft moved before completion, so its first public result
 // legitimately uses the migrated attempt ID and has no mergedFrom metadata.
 const completed={...fixture(),id:'merged-111111-puzzle-original-uuid'};
 const legacy={...completed,id:mergedRecordId('222222',completed.id),mergedFrom:{studentKey:'222222',attemptId:completed.id}};
 assert.equal(publicId(completed),completed.id);assert.equal(publicId(legacy),completed.id);
 assert.equal(publicId(rekeyStudentAttempt(legacy,'333333','444444')),completed.id);
});

test('public JSON payload remains byte-equivalent and detached even for identity-shaped fields',()=>{
 const original=fixture();Object.assign(original.leaderboard,{fio:'111111',group:'111111',studentKey:'111111',owner:'student:111111',id:original.id,nested:{attemptId:original.id}});
 const serialized=JSON.stringify(original.leaderboard),migrated=rekeyStudentAttempt(original,'111111','222222');
 assert.equal(JSON.stringify(migrated.leaderboard),serialized);assert.notEqual(migrated.leaderboard,original.leaderboard);
 migrated.leaderboard.nested.attemptId='changed-local-copy';assert.equal(JSON.stringify(original.leaderboard),serialized);
});


test('one invalid local receipt does not hide valid pending and public leaderboard rows',()=>{
 const original=fixture(),invalid={...fixture(),id:'merged-111111-'.repeat(13)+'puzzle-original-uuid'};
 const savedInvalid=JSON.stringify(invalid);assert.ok(invalid.id.length>150);
 const local=[invalid,original,{type:'other-module',id:'unrelated'}].map(localResult).filter(Boolean);
 assert.equal(local.length,1);assert.equal(local[0].id,original.id);
 const remote={...original.leaderboard,id:'another-public-id',participant_id:'b'.repeat(64)};
 assert.equal(bestPuzzleResults([remote],local).length,2);
 assert.equal(JSON.stringify(invalid),savedInvalid,'the rejected projection must not discard or mutate durable data');

 assert.throws(()=>publicId(invalid),error=>error.code==='database/invalid-attempt-id','network delivery remains strict');
});


test('an unpublishable receipt does not block private owner migration or alter its public payload',()=>{
 const invalid={...fixture(),id:'merged-111111-'.repeat(13)+'puzzle-original-uuid'},before=structuredClone(invalid);
 const migrated=rekeyStudentAttempt(invalid,'111111','222222');
 assert.equal(migrated.studentKey,'222222');assert.equal(migrated.mergedFrom.attemptId,invalid.id);
 assert.deepEqual(migrated.leaderboard,invalid.leaderboard);assert.deepEqual(invalid,before);
 assert.equal(localResult(migrated),null);assert.throws(()=>publicId(migrated),error=>error.code==='database/invalid-attempt-id');
});
