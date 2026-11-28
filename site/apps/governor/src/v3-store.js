(function (root) {
  'use strict';
  const G = root.GovernorGame;
  const STORE = 'attempts';
  const ARCHIVE = 'attempt-archive';
  const DB_NAME = 'rudn-governor-v3';
  let opening;

  function database() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {db.close();opening=null;};
        db.onclose = () => {opening=null;};
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => {
      opening = null;
      throw error;
    });
    return opening;
  }

  function archiveKey(scope, attemptId) {
    return [ARCHIVE,scope,attemptId];
  }

  async function transaction(mode, callback) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE,mode);
      let result, failure;
      function abort(error) {
        failure = error;
        tx.abort();
      }
      function watch(request, onSuccess) {
        request.onsuccess = () => {
          try {onSuccess(request.result);}
          catch (error) {abort(error);}
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || Error('governor-v3/storage-write'));
      try {callback(tx.objectStore(STORE),watch,value=>{result=value;});}
      catch (error) {abort(error);}
    });
  }

  function assertWritable(current, expected, canWrite) {
    if (!canWrite()) throw Error('governor-v3/profile-changed');
    if ((current?.recordRevision ?? -1) !== (expected?.recordRevision ?? -1) ||
        current?.state.attemptId !== expected?.state.attemptId) {
      throw Object.assign(Error('governor-v3/concurrent-change'),{code:'concurrent-change',current});
    }
  }

  function read(scope, attemptId) {
    const key = attemptId===undefined ? scope : archiveKey(scope,attemptId);
    return transaction('readonly',(store,watch,finish)=>{
      watch(store.get(key),record=>finish(record??null));
    });
  }

  function writeActive(scope, expected, canWrite, readDraft) {
    return transaction('readwrite',(store,watch,finish)=>{
      watch(store.get(scope),stored=>{
        const current = stored??null;
        assertWritable(current,expected,canWrite);
        readDraft(store,watch,draft=>{
          const next = {...structuredClone(draft),recordRevision:(current?.recordRevision??-1)+1};
          if (current?.state.attemptId!==next.state.attemptId) {
            if (current) store.put(current,archiveKey(scope,current.state.attemptId));
            store.delete(archiveKey(scope,next.state.attemptId));
          }
          store.put(next,scope);
          finish(next);
        });
      });
    });
  }

  function put(scope, expected, draft, canWrite) {
    return writeActive(scope,expected,canWrite,(_store,_watch,finish)=>finish(draft));
  }

  function restore(scope, expected, attemptId, canWrite) {
    return writeActive(scope,expected,canWrite,(store,watch,finish)=>{
      watch(store.get(archiveKey(scope,attemptId)),record=>{
        if (!canWrite()) throw Error('governor-v3/profile-changed');
        if (!record) throw Object.assign(Error('governor-v3/archive-missing'),{code:'archive-missing'});
        finish(record);
      });
    });
  }

  function summary(record) {
    const {state,submission,createdAt,closedAt} = record;
    const assessment = submission?.governor?.assessment;
    const assessed = assessment?.points ?? submission?.points;
    const paths = assessment?.paths;
    return {attemptId:state.attemptId,createdAt,closedAt:closedAt??null,year:state.year,
      yearsClosed:state.history?.length??0,completed:state.completed===true,
      stopped:Boolean(state.handover)||submission?.governor?.campaignStatus==='stopped',
      points:Number.isFinite(assessed)?assessed:null,
      journalPoints:submission?.recordGrade&&Number.isFinite(submission.points)?submission.points:null,
      paths:paths?{kpi:paths.kpi,satisfaction:paths.satisfaction}:null};
  }

  function list(scope) {
    return transaction('readonly',(store,watch,finish)=>{
      // Compound keys are isolated from the original string keys for current saves.
      const keys = IDBKeyRange.bound([ARCHIVE,scope],archiveKey(scope,[]));
      watch(store.getAll(keys),records=>{
        const summaries = records.map(summary);
        summaries.sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??'') || a.attemptId.localeCompare(b.attemptId));
        finish(summaries);
      });
    });
  }

  G.V3Store = {read,put,list,restore};
})(globalThis);
