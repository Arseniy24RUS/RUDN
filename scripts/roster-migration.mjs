import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {rekeyStudentAttempt, rekeyStudentValue, mergedRecordId} from '../site/assets/js/student-identity.js';

export const ticketHash = ticket => createHash('sha256').update(String(ticket)).digest('hex');
export const getPath = (root, path) => path.split('/').reduce((v, key) => v?.[key], root) ?? null;
export function applyPatch(root, patch) {
  const next = structuredClone(root);
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split('/'); const leaf = parts.pop();
    let at = next; const parents=[];
    for (const key of parts) { parents.push([at,key]); at = at[key] ||= {}; }
    if (value === null) {
      delete at[leaf];
      for (const [parent,key] of parents.reverse()) {
        if (Object.keys(parent[key]).length) break;
        delete parent[key];
      }
    } else at[leaf] = structuredClone(value);
  }
  return next;
}

export function planRosterUpdate(root, options) {
  const {official, canonicalByOfficial = {}, merges = {}, cohortSuffix, timestamp} = options;
  if (!official?.length || !cohortSuffix || !timestamp) throw Error('Missing migration inputs');
  if (new Set(official.map(s => s.ticket)).size !== official.length) throw Error('Duplicate official tickets');
  const changes = {};
  const set = (path, value) => {
    if (!isDeepStrictEqual(getPath(root, path), value)) changes[path] = value;
  };
  const profiles = root.profiles || {};
  const roster = root.roster || {};
  const officialHashes = new Set(official.map(s => ticketHash(s.ticket)));
  const officialNames = new Set(official.map(s => s.name.trim().toLocaleLowerCase('ru')));
  const profileChanged = new Set();
  const profileField = (key, field, value) => {
    if (!isDeepStrictEqual(profiles[key]?.[field] ?? null, value)) {
      set('profiles/'+key+'/'+field, value);
      profileChanged.add(key);
    }
  };
  for (const student of official) {
    if (!/^\d{5,20}$/.test(student.ticket) || !student.group.endsWith(cohortSuffix)) throw Error('Invalid official row');
    const hash = ticketHash(student.ticket);
    if (!roster[hash]) set('roster/'+hash, {fullName:student.name, group:student.group});
    else {
      set('roster/'+hash+'/fullName', student.name);
      set('roster/'+hash+'/group', student.group);
    }
    if (root.rosterAbsences?.[hash]?.absent) set('rosterAbsences/'+hash+'/absent', false);
    const canonical = canonicalByOfficial[student.ticket] || root.studentAliases?.[student.ticket] || student.ticket;
    if (!profiles[canonical]) continue; // Keep registration lazy.
    if (profiles[canonical].mergedInto) throw Error('Canonical profile is itself merged: '+canonical);
    if (canonical !== student.ticket) {
      const occupied = profiles[student.ticket];
      if (occupied && !merges[canonical]?.includes(student.ticket)) throw Error('Official ticket is occupied: '+student.ticket);
      const alias = root.studentAliases?.[student.ticket];
      if (alias && alias !== canonical) throw Error('Conflicting alias: '+student.ticket);
      set('studentAliases/'+student.ticket, canonical);
      profileField(canonical, 'officialTicket', student.ticket);
    }
    profileField(canonical, 'fullName', student.name);
    profileField(canonical, 'displayName', student.name);
    profileField(canonical, 'group', student.group);
  }
  for (const [hash, record] of Object.entries(roster)) {
    if (!record.group?.endsWith(cohortSuffix) || officialHashes.has(hash) ||
        officialNames.has(record.fullName?.trim().toLocaleLowerCase('ru'))) continue;
    if (!isDeepStrictEqual(root.rosterAbsences?.[hash], {fullName:record.fullName,group:record.group,absent:true})) {
      set('rosterAbsences/'+hash, {fullName:record.fullName,group:record.group,absent:true});
    }
  }
  for (const [canonical, sources] of Object.entries(merges)) {
    if (!profiles[canonical] || root.studentAliases?.[canonical]) throw Error('Invalid merge target');
    for (const source of sources) {
      const profile = profiles[source];
      if (!profile || source === canonical) throw Error('Missing merge source');
      if (profile.mergedInto && profile.mergedInto !== canonical) throw Error('Conflicting merge source');
      const existingAlias = root.studentAliases?.[source];
      if (existingAlias && existingAlias !== canonical) throw Error('Conflicting source alias');
      profileField(source, 'mergedInto', canonical);
      set('profiles/'+canonical+'/mergedFrom', [...new Set([...String(profiles[canonical].mergedFrom||'').split(',').filter(Boolean),...sources])].sort().join(','));
      set('studentAliases/'+source, canonical);
      for (const uid of new Set([profile.ownerUid, ...Object.keys(profile.ownerUids || {})].filter(Boolean))) {
        set('profiles/'+canonical+'/ownerUids/'+uid, true);
      }
      for (const [id, attempt] of Object.entries(root.attempts?.[source] || {})) {
        if (attempt.id !== id || attempt.studentKey !== source) throw Error('Invalid source attempt identity');
        const next = rekeyStudentAttempt(attempt, source, canonical);
        const path = 'attempts/'+canonical+'/'+next.id;
        const old = getPath(root, path);
        if (old) {
          const withoutOwner = value => { const v=structuredClone(value); delete v.ownerUid; return v; };
          if (!isDeepStrictEqual(withoutOwner(old), withoutOwner(next))) throw Error('Attempt copy collision: '+path);
        } else set(path, next);
      }
      for (const [activity, records] of Object.entries(root.checkpoints?.[source] || {})) {
        for (const [id, checkpoint] of Object.entries(records)) {
          const nextId = mergedRecordId(source, id);
          const next = rekeyStudentValue(checkpoint, {from:source,to:canonical,ids:{[id]:nextId}});
          next.studentKey=canonical;next.attemptId=nextId;
          next.mergedFrom={studentKey:source,attemptId:id};
          const draftId = [String('student:'+canonical),activity,checkpoint.mode,nextId].map(encodeURIComponent).join(':');
          for (const draft of [next.current,...Object.values(next.conflicts || {})].filter(Boolean)) {
            draft.id=draftId;draft.scope=[String('student:'+canonical),activity,draft.mode].map(encodeURIComponent).join(':');
          }
          const path='checkpoints/'+canonical+'/'+activity+'/'+nextId;
          const current=getPath(root,path);
          if (!current) set(path,next);
          else if (current.mergedFrom?.studentKey !== source || current.mergedFrom?.attemptId !== id) throw Error('Checkpoint copy collision');
          // Never overwrite a newer canonical draft on a repeated migration.
        }
      }
      for (const [activity, grade] of Object.entries(root.grades?.[source] || {})) {
        const path='grades/'+canonical+'/'+activity;
        const current=changes[path] || getPath(root,path);
        if (!current || Number(grade.points)>Number(current.points)) {
          const next=structuredClone(grade);
          if(next.sourceAttemptId)next.sourceAttemptId=mergedRecordId(source,next.sourceAttemptId);
          next.mergedFrom={studentKey:source,activitySlug:activity};
          set(path,next);
        }
      }
    }
  }
  for (const key of profileChanged) set('profiles/'+key+'/updatedAt',timestamp);
  const rollback=Object.fromEntries(Object.keys(changes).map(path=>[path,getPath(root,path)]));
  return {patch:changes,rollback,counts:{
    paths:Object.keys(changes).length,
    aliases:Object.keys(changes).filter(p=>p.startsWith('studentAliases/')).length,
    newRosterRecords:Object.keys(changes).filter(p=>/^roster\/[^/]+$/.test(p)).length,
    copiedAttempts:Object.keys(changes).filter(p=>p.startsWith('attempts/')).length,
    copiedCheckpoints:Object.keys(changes).filter(p=>p.startsWith('checkpoints/')).length,
    absenceRecords:Object.keys(changes).filter(p=>p.startsWith('rosterAbsences/')).length,
    changedProfiles:new Set(Object.keys(changes).filter(p=>p.startsWith('profiles/')).map(p=>p.split('/')[1])).size
  }};
}
