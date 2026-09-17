import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import vm from 'node:vm';
import {bestPuzzleResults,normalizePuzzleResult,puzzleGroups,filterPuzzleResults,puzzleResultPage,formatPuzzleTime,puzzleLeaderboardWorkbook} from '../site/assets/js/puzzle-leaderboard.js';
import {commitPuzzleLeaderboard} from '../site/assets/js/puzzle-storage.js';

const row=(id,extra={})=>({id,fio:'Student '+id,group:'ГГУбд-01-26',difficulty:'hard',time_ms:4000,placed:89,total:89,timestamp:1767225600000,...extra});
test('per-difficulty best times, stable identities, old identities and deterministic ties',()=>{
  const a='a'.repeat(64),b='b'.repeat(64);
  const rows=bestPuzzleResults([
    row('old',{participant_id:a,elapsed_ms:9000}),row('better',{participant_id:a,elapsed_ms:5000,fio:'Renamed'}),
    row('homonym',{participant_id:b,fio:'Renamed',elapsed_ms:6000}),
    row('medium',{participant_id:a,difficulty:'medium',time_ms:2000}),
    row('easy',{participant_id:a,difficulty:'easy',time_ms:1500}),
    row('legacy1',{fio:' Legacy   Student ',time_ms:8000}),row('legacy2',{fio:'legacy student',time_ms:7000}),
    row('z',{participant_id:'c'.repeat(64),time_ms:3000}),row('a',{participant_id:'c'.repeat(64),time_ms:3000}),
  ]);
  assert.deepEqual(rows.map(x=>x.id),['a','better','homonym','legacy2','medium','easy']);
  assert.equal(normalizePuzzleResult(row('nan',{time_ms:NaN})),null);
  assert.equal(normalizePuzzleResult(row('wrong',{placed:88})),null);
  assert.equal(normalizePuzzleResult(row('missing',{fio:''})),null);
  const sameLabel={fio:'Same Name',group:'Group'};
  assert.equal(bestPuzzleResults([row('legacy',sameLabel),row('new',{...sameLabel,participant_id:a})]).length,1);
  assert.equal(bestPuzzleResults([row('one',{...sameLabel,participant_id:a}),row('two',{...sameLabel,participant_id:b})]).length,2);
});
test('local outbox and confirmed immutable record produce one row; real long duration wins over legacy clamp',()=>{
  const local=row('attempt',{elapsed_ms:7200500,time_ms:3599000,pending:true});
  const remote={...local,pending:false};
  assert.equal(bestPuzzleResults([remote],[local]).length,1);
  assert.equal(bestPuzzleResults([remote],[local])[0].pending,false);
  assert.equal(formatPuzzleTime(bestPuzzleResults([remote])[0].elapsed_ms),'120:00');
  assert.equal(formatPuzzleTime(90000000),'1500:00');
});
test('historical groups, local filters and all pagination ranks are retained',()=>{
  const rows=bestPuzzleResults(Array.from({length:205},(_,i)=>row(String(i),{time_ms:2000+i,group:i===0?'ГГУбд-02-25':'ГГУбд-01-26'})));
  assert.ok(puzzleGroups(rows,['ГГУбд-03-26']).includes('ГГУбд-02-25'));
  assert.equal(filterPuzzleResults(rows,new Set(['ГГУбд-02-25'])).length,1);
  assert.equal(puzzleResultPage(rows,'hard',0).rows.length,100);
  assert.equal(puzzleResultPage(rows,'hard',1).offset,100);
  assert.equal(puzzleResultPage(rows,'hard',9).page,2);
  assert.equal(puzzleResultPage(rows,'hard',9).rows.length,5);
});
test('append-only retries preserve both legacy payloads and optional identity/full-time fields',async()=>{
  const legacy={...row('old'),user_agent:'Test'};
  const extended={...legacy,participant_id:'a'.repeat(64),elapsed_ms:7200123};
  for(const stored of [legacy,extended]){
    const denied={transaction:async()=>{throw Object.assign(new Error('lost acknowledgement'),{code:'database/permission-denied'})},get:async()=>({value:stored})};
    assert.deepEqual(await commitPuzzleLeaderboard(denied,'immutable-attempt',{...stored}),stored);
    for(const key of ['participant_id','elapsed_ms']){
      const changed={...stored,[key]:key==='participant_id'?'b'.repeat(64):7200999};
      await assert.rejects(commitPuzzleLeaderboard(denied,'immutable-attempt',changed));
    }
  }
});
test('XLSX export writes three ordered typed sheets with every row and literal formula-like text',()=>{
  const context=vm.createContext({console});
  vm.runInContext(readFileSync(new URL('../site/assets/vendor/xlsx/xlsx-0.20.3.full.min.js',import.meta.url),'utf8'),context);
  assert.equal(context.XLSX.version,'0.20.3');
  const output=resolve(process.env.QA_OUT||join(tmpdir(),'rudn-puzzle-leaderboard-qa'));
  mkdirSync(output,{recursive:true});
  const rows=bestPuzzleResults([
    ...Array.from({length:205},(_,i)=>row(`student-${i}`,{time_ms:2000+i,fio:i===0?'=1+2':`学生 ${i} Иванов`,group:i===1?'+group':'ГГУбд-01-26'})),
    row('medium',{difficulty:'medium',elapsed_ms:90000500,time_ms:3599000,fio:'@literal'}),
    row('easy',{difficulty:'easy',fio:'-literal'})
  ]);
  const copies={ru:{hard:'Высокая',medium:'Средняя',easy:'Низкая',rank:'Место',fullName:'ФИО',group:'Группа',time:'Время',dateUTC:'Дата (UTC)'},
    en:{hard:'High',medium:'Medium',easy:'Low',rank:'Rank',fullName:'Full name',group:'Group',time:'Time',dateUTC:'Date (UTC)'},
    zh:{hard:'高',medium:'中',easy:'低',rank:'排名',fullName:'姓名',group:'班级',time:'用时',dateUTC:'日期（UTC）'}};
  for(const [locale,copy] of Object.entries(copies)){
    const book=puzzleLeaderboardWorkbook(context.XLSX,rows,copy);
    assert.deepEqual(Array.from(book.SheetNames),[copy.hard,copy.medium,copy.easy]);
    assert.equal(book.Sheets[copy.hard].B2.t,'s');assert.equal(book.Sheets[copy.hard].B2.f,undefined);
    const bytes=context.XLSX.write(book,{type:'array',bookType:'xlsx',compression:true});
    writeFileSync(join(output,`leaderboard-${locale}.xlsx`),Buffer.from(bytes));
  }
  writeFileSync(join(output,'xlsx-expected.json'),JSON.stringify({rows,copies},null,2));
  console.log('XLSX fixtures for independent parser: '+output);
});
