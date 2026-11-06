#!/usr/bin/env python3
"""One bounded exact source parentOrganizationName join; descriptors only, never identity/pages."""
import argparse,json,sqlite3,hashlib,re,unicodedata,os
from pathlib import Path
from collections import Counter,defaultdict

def enc(v):return json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
def norm(s):return tuple(re.findall(r'[^\W_]+',unicodedata.normalize('NFKC',s).casefold().replace('ё','е')))
def sha(b):return hashlib.sha256(b).hexdigest()
def run(project,app,report):
 bank=app/'data/vacancies/bank';summary=json.loads((bank/'summary.json').read_bytes());catalog=json.loads((app/'data/authorities.json').read_bytes());heads=defaultdict(set)
 for h in catalog:
  for key in ('name','shortName'):
   if isinstance(h.get(key),str):heads[norm(h[key])].add(h['id'])
 sourcebase=project/'research/completion/bulk_20261104/gossluzhba_archive_20261106/all-portal-career-bank-20261106';desc=json.loads((sourcebase/'normalized.manifest.json').read_bytes());source=sourcebase/'normalized.sqlite';st=source.stat();assert desc['writerClosedBeforeFingerprint']is True and desc['databasePin']['sha256']==summary['sourceDatasetSHA256']and st.st_size==desc['databasePin']['bytes'];before=(st.st_size,st.st_mtime_ns)
 db=sqlite3.connect('file:'+str(source)+'?mode=ro&immutable=1',uri=True);edges={};parent_counts=Counter();cache={};stats=Counter()
 query="select v.uuid,v.employer_id,json_extract(p.public_json,'$.parentOrganizationName')from vacancies v join detail_observations o on o.observation_key=v.preferred_observation join payloads p on p.payload_sha=o.payload_sha"
 for uuid,child,parent in db.execute(query):
  stats['rows']+=1
  if not isinstance(parent,str)or not parent.strip():stats['nullOrNontextParent']+=1;continue
  parent_counts[parent]+=1
  if parent not in cache:
   matches=heads.get(norm(parent),set());cache[parent]=next(iter(matches))if len(matches)==1 else None
  head=cache[parent]
  if not head:continue
  stats['exactHeadParentRows']+=1
  if child==head:stats['selfParentRowsNotFamily']+=1;continue
  e=edges.setdefault((head,child),{'headAuthorityId':head,'employerId':child,'parentNamesAsPublished':Counter(),'sourceUUIDs':[]});e['parentNamesAsPublished'][parent]+=1;e['sourceUUIDs'].append(uuid)
 db.close();assert stats['rows']==457627;assert (source.stat().st_size,source.stat().st_mtime_ns)==before
 head_descriptors={h['id']:json.loads((bank/'employers'/(h['id']+'.json')).read_bytes())for h in catalog};new=0;supported=0;not_present=[]
 for (head,child),e in edges.items():
  path=bank/'employers'/(child+'.json')
  if not path.is_file():not_present.append(child);continue
  d=json.loads(path.read_bytes());h=head_descriptors[head];existing=next((x for x in h['familyConnections']if x['employerId']==child),None)
  support={'field':'parentOrganizationName','namespace':'publicFields','literalParentNamesAsPublished':dict(e['parentNamesAsPublished']),'sourceLinkedVacancyCount':len(e['sourceUUIDs']),'sourceDatabaseSHA256':desc['databasePin']['sha256'],'sourceScope':'per-vacancy declared parent;not-current-whole-employer-legal-hierarchy'}
  if existing:
   existing['sourceDeclaredParentSupport']=support;supported+=1
  else:
   h['familyConnections'].append({'authorityId':child,'employerId':child,'name':d['name'],'jobCount':d['jobCount'],'nonArchiveCount':d['nonArchiveCount'],'archiveCount':d['archiveCount'],'descriptorPath':'employers/'+child+'.json','relation':'exact-source-declared-parentOrganizationName;distinct-employer','sameLegalEntity':False,'sourceDeclaredParentSupport':support});new+=1
 affected={head for head,child in edges};changed=0;maxhead=0
 for head in affected:
  d=head_descriptors[head];d['familyConnections'].sort(key=lambda x:(-x['nonArchiveCount'],-x['jobCount'],x['name']));raw=enc(d);path=bank/'employers'/(head+'.json');tmp=path.with_suffix('.json.tmp');tmp.write_bytes(raw);os.replace(tmp,path);changed+=1;maxhead=max(maxhead,len(raw))
 # Legacy aliases of an affected exact head receive the same descriptor data.
 # Their original authorityId/aliasOf/mappingState remain explicit.
 for path in(bank/'employers').glob('*.json'):
  d=json.loads(path.read_bytes());target=d.get('aliasOf')
  if target in affected:
   d['familyConnections']=head_descriptors[target]['familyConnections'];tmp=path.with_suffix('.json.tmp');tmp.write_bytes(enc(d));os.replace(tmp,path)
 evidence=[]
 for e in edges.values():e=dict(e);e['parentNamesAsPublished']=dict(e['parentNamesAsPublished']);evidence.append(e)
 facts=[]
 for h in catalog:
  d=head_descriptors[h['id']];facts.append({'id':h['id'],'directJobs':d['jobCount'],'familyEmployers':len(d['familyConnections']),'familyJobs':sum(x['jobCount']for x in d['familyConnections']),'familyNonArchiveCount':sum(x['nonArchiveCount']for x in d['familyConnections'])})
 output={'actualExitCode':0,'sourceDatabasePin':desc['databasePin'],'sourceHashRecomputed':False,'rows':stats['rows'],'stats':dict(stats),'distinctPublishedParentStrings':len(parent_counts),'sourceParentSemantics':'literal provider-declared per-vacancy parent-name field;not a legal/current agency hierarchy certificate','newFamilyConnections':new,'existingConnectionsWithSourceParentSupport':supported,'headDescriptorsChanged':changed,'maxChangedHeadDescriptorBytes':maxhead,'sourcePagesChanged':False,'sourceJobOwnershipChanged':False,'sourceUUIDsDiscarded':0,'missingChildDescriptors':not_present,'headCounts':facts,'sourceBoundedEvidence':evidence,'codeSHA256':sha(Path(__file__).read_bytes()),'networkRequests':0};report.parent.mkdir(parents=True,exist_ok=True);report.write_bytes(enc(output));print(json.dumps({k:v for k,v in output.items()if k!='sourceBoundedEvidence'},ensure_ascii=False),flush=True)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project-root',type=Path,required=True);p.add_argument('--app',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args();run(a.project_root.resolve(),a.app.resolve(),a.report.resolve())
if __name__=='__main__':main()
