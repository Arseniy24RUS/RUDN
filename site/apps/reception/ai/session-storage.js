/** Drafts belong to a student and service, not to the route used to enter the game. */
export function createReceptionStorage({store, owner, endpoint = '', legacyKey, version}) {
  const prefix = `rudn.reception.workspace.v2:${encodeURIComponent(owner)}:${encodeURIComponent(endpoint)}`;
  const valid = value => value?.version === version && value.owner === owner;
  const read = key => { try { const value = JSON.parse(store?.getItem(key) || 'null'); return valid(value) ? value : null; } catch { return null; } };
  const recent = () => { try { const value = JSON.parse(store?.getItem(`${prefix}:recent`) || '[]'); return Array.isArray(value) ? value.filter(item => typeof item?.id === 'string').slice(0,12) : []; } catch { return []; } };
  return {
    readInitial() {
      const current=read(`${prefix}:current`)||read(legacyKey);
      if(current)return current;
      // v3 keys contained course/free and academic period. Migrate an existing
      // owner-bound draft even when the student now enters by a different route.
      const legacyPrefix=`rudn.reception.ai.v1:${encodeURIComponent(owner)}:`;
      const suffix=`:${encodeURIComponent(endpoint)}`;
      const candidates=[];
      try{
        for(let index=0;index<Math.min(Number(store?.length)||0,10000);index++){
          const key=store.key(index);
          if(key?.startsWith(legacyPrefix)&&key.endsWith(suffix)){
            const value=read(key);if(value?.sessionId)candidates.push(value);
          }
        }
      }catch{}
      return candidates.sort((a,b)=>(Number(b.savedAt)||0)-(Number(a.savedAt)||0))[0]||null;
    },
    readSession(id) { return typeof id === 'string' ? read(`${prefix}:session:${encodeURIComponent(id)}`) : null; },
    recent,
    save(value) {
      if (!store || !valid(value)) return false;
      try {
        const saved = {...value, savedAt:Date.now()};
        store.setItem(`${prefix}:current`, JSON.stringify(saved));
        store.setItem(legacyKey, JSON.stringify(saved));
        if (saved.sessionId) {
          // A pending start belongs to the future session. Keep it in current
          // for retry, but never attach it to the old session's resumable draft.
          const sessionDraft=saved.pending?.op==='start'?{...saved,pending:null,pendingAt:null}:saved;
          store.setItem(`${prefix}:session:${encodeURIComponent(saved.sessionId)}`, JSON.stringify(sessionDraft));
          const row = {id:saved.sessionId, title:saved.caseTitle || '', mode:saved.mode, status:saved.status, savedAt:saved.savedAt};
          store.setItem(`${prefix}:recent`, JSON.stringify([row,...recent().filter(item => item.id !== row.id)].slice(0,12)));
        }
        return true;
      } catch { return false; }
    },
    clearCurrent() {
      try { store?.removeItem(`${prefix}:current`); store?.removeItem(legacyKey); return Boolean(store); }
      catch { return false; }
    },
  };
}
