// Isolated IndexedDB, multi-tab and append-only delivery checks. No production writes.
// Browser plugin is unavailable in this session; Playwright exercises browser storage APIs.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const sources=Object.fromEntries(await Promise.all(['puzzle-storage.js','durable-store.js','student-identity.js'].map(async name=>[name,await readFile(new URL(`../site/assets/js/${name}`,import.meta.url))])));
const server=createServer((request,response)=>{
  const source=sources[new URL(request.url,'http://localhost').pathname.slice(1)];
  response.setHeader('Content-Type',source?'text/javascript':'text/html');
  response.end(source||'<!doctype html><title>Puzzle isolated storage tests</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`,report=[];
try{
  for(const engine of (process.env.PUZZLE_STORAGE_BROWSERS||'chromium,firefox,webkit').split(',')){
    console.log(`Testing puzzle storage: ${engine}`);
    const browser=await playwright[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
    try{
      const context=await browser.newContext(),page=await context.newPage();
      await page.goto(url);
      const results=await page.evaluate(async()=>{
        const {createPuzzleGeometryStore,commitPuzzleLeaderboard,puzzleGeometryUrl}=await import('/puzzle-storage.js');
        const {createDurableStore}=await import('/durable-store.js');
        const ok=(value,message)=>{if(!value)throw new Error(message)},results=[];
        const media='https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/AFG/ADM1/map.geojson';
        ok(puzzleGeometryUrl('https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/AFG/ADM1/map.geojson')===media,'GitHub raw redirect normalized before native fetch');
        ok(puzzleGeometryUrl('https://raw.githubusercontent.com/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/AFG/ADM1/map.geojson')===media,'raw content Git LFS pointer normalized before native fetch');
        ok(puzzleGeometryUrl(media)===media,'media URL remains unchanged');
        results.push('both official raw URL shapes normalize directly to media');
        const wrapper={dataset:{id:'precise-geometry'},geometry:{type:'FeatureCollection',features:[{type:'Feature',id:0,properties:{name:'Территория'},geometry:{type:'Polygon',coordinates:[[[1.123456789,2],[3,4],[5,2],[1.123456789,2]]]}}]}};
        const maps=createPuzzleGeometryStore({databaseName:'puzzle-test-maps'});
        const ref=await maps.save(wrapper);ok(ref===await maps.save(wrapper),'equal geometry must share immutable reference');
        await maps.close();
        const reopened=createPuzzleGeometryStore({databaseName:'puzzle-test-maps'});
        ok(JSON.stringify(await reopened.load(ref))===JSON.stringify(wrapper),'exact map survives database reopen');
        const changed=structuredClone(wrapper);changed.geometry.features[0].properties.name='Other';
        ok(await reopened.save(changed)!==ref,'different geometry must not replace existing attempt');
        ok((await reopened.load(ref)).geometry.features[0].properties.name==='Территория','old map remains immutable');
        await reopened.close();results.push('exact geometry, immutable snapshots and database reopen');
        const cached=createPuzzleGeometryStore({indexedDB:null,databaseName:'puzzle-test-cache'});
        const cachedRef=await cached.save(wrapper);await cached.close();
        const cachedReopen=createPuzzleGeometryStore({indexedDB:null,databaseName:'puzzle-test-cache'});
        ok((await cachedReopen.load(cachedRef)).dataset.id===wrapper.dataset.id,'CacheStorage fallback survives reopen');
        let warnings=0;const unavailable=createPuzzleGeometryStore({indexedDB:null,caches:null,onWarning:()=>warnings++});
        const volatileRef=await unavailable.save(wrapper);ok(warnings===1&&(await unavailable.load(volatileRef)).dataset.id===wrapper.dataset.id,'unavailable storage retains playable memory with honest warning');
        results.push('CacheStorage fallback and complete storage refusal');
        const store=createDurableStore({databaseName:'puzzle-test-final',broadcast:false});
        const scope={owner:'student:100000',activitySlug:'seminar-2',mode:'seminar',attemptId:'test-attempt'};
        await store.checkpoint({...scope,state:{geometryRef:ref,placed:88,hints:0,elapsedMs:5000}});
        const record={id:scope.attemptId,type:'map-puzzle',points:5,leaderboard:{fio:'Isolated test',group:'Test',difficulty:'hard',time_ms:6000,placed:89,total:89,timestamp:1,user_agent:'Test'}};
        await store.complete({...scope,state:{geometryRef:ref,placed:89,finished:true,finishedResult:{points:5,durationMs:6000}},attempt:record});
        await store.complete({...scope,state:{placed:1},attempt:{...record,points:0,leaderboard:{...record.leaderboard,timestamp:999}}});
        const pending=await store.listPending({owner:scope.owner});
        ok(pending.filter(op=>op.type==='attempt').length===1,'only one final delivery operation');
        ok(pending.find(op=>op.type==='attempt').payload.leaderboard.time_ms===6000,'leaderboard queued atomically with attempt');
        ok(pending.find(op=>op.type==='attempt').payload.leaderboard.timestamp===1,'capturing a completed resume retains the original leaderboard timestamp');
        ok((await store.loadDraft(scope)).state.placed===89,'duplicate completion cannot overwrite final state');
        store.close();results.push('atomic final state/attempt/leaderboard outbox and idempotent completion');
        let stored=null,writes=0,readback=0;
        const transport={transaction:async(id,update)=>{const next=update(stored);if(next){stored=next;writes++}return{value:stored}},get:async()=>{readback++;return{value:stored}}};
        await commitPuzzleLeaderboard(transport,'test-attempt',record.leaderboard);
        await commitPuzzleLeaderboard(transport,'test-attempt',record.leaderboard);ok(writes===1,'retry cannot duplicate leaderboard row');
        const denied={...transport,transaction:async()=>{throw Object.assign(new Error('append-only rules'),{code:'database/permission-denied'})}};
        await commitPuzzleLeaderboard(denied,'test-attempt',record.leaderboard);ok(readback===1,'append-only rejection verified by matching readback');
        let mismatch=false;try{await commitPuzzleLeaderboard(transport,'test-attempt',{...record.leaderboard,time_ms:9999})}catch{mismatch=true}
        ok(mismatch,'conflicting result must never acknowledge');
        results.push('stable result IDs, append-only rules, lost acknowledgment and collision detection');
        return results;
      });
      const other=await context.newPage();await other.goto(url);
      const init=async page=>page.evaluate(async()=>{
        const {createPuzzleWriter}=await import('/puzzle-storage.js');
        window.writerChanges=[];window.writer=createPuzzleWriter({scope:'student:multi-tab',readState:async()=>JSON.parse(localStorage.getItem('test-state')||'null'),onChange:event=>writerChanges.push(event),beforeRelease:async()=>localStorage.setItem('test-state',JSON.stringify({placed:9}))});
        await writer.acquire();return writer.canWrite();
      });
      assert.equal(await init(page),true,`${engine}: first page writes`);
      assert.equal(await init(other),false,`${engine}: second page cannot overwrite`);
      await page.evaluate(()=>writer.release());
      const takeover=await other.evaluate(async()=>{await writer.acquire();return{writable:writer.canWrite(),restore:writerChanges.at(-1).restore}});
      assert.deepEqual(takeover,{writable:true,restore:{placed:9}},`${engine}: lock transfer loads latest saved state`);
      await other.evaluate(()=>writer.close());await page.evaluate(()=>writer.close());
      await page.evaluate(async()=>{
        const {createPuzzleWriter}=await import('/puzzle-storage.js');
        let finishRead;
        const pendingWriter=createPuzzleWriter({scope:'pending-close',readState:()=>new Promise(resolve=>finishRead=resolve)});
        const acquiring=pendingWriter.acquire();
        for(let tries=0;!finishRead&&tries<200;tries++)await new Promise(resolve=>setTimeout(resolve,5));
        if(!finishRead)throw new Error('pending lock did not begin its state read');
        await pendingWriter.close();finishRead({placed:1});await acquiring;
        if(pendingWriter.canWrite())throw new Error('closed page acquired a late write lock');
        const first=createPuzzleWriter({scope:'fallback-lock',locks:null,readState:async()=>({placed:1})});
        const second=createPuzzleWriter({scope:'fallback-lock',locks:null,readState:async()=>({placed:2})});
        await first.acquire();await second.acquire();
        if(!first.canWrite()||second.canWrite())throw new Error('fallback lease allowed concurrent writer');
        await first.close();await second.acquire();
        if(!second.canWrite())throw new Error('fallback lease did not transfer');
        await second.close();
      });
      report.push({browser:engine,passed:true,scenarios:[...results,'two real tabs, single writer and durable-state transfer','late acquire cancelled on close; fallback lease transfer']});
    }finally{await browser.close()}
  }
}finally{server.close()}
console.log(JSON.stringify(report,null,2));
