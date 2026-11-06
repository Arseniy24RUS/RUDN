#!/usr/bin/env python3
"""Repack retained public v1 only: gzip columnar pages and direct institution descriptors."""
import argparse,json,hashlib,gzip,datetime,os
from pathlib import Path
from collections import Counter,defaultdict
COLUMNS=['id','title','scope','region','locality','salaryFrom','salaryTo','announcedAt','expiresAt','state','archive','sourceURL','education','professionalExperience','governmentExperience']
def enc(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
def sha(b):return hashlib.sha256(b).hexdigest()
def resolved(iid,employers,redirects):
 seen=set();value=iid
 while value in redirects:
  if value in seen:raise ValueError('redirect cycle')
  seen.add(value);value=redirects[value]
 return value if value in employers else None

def packed_page(iid,jobs):
 body={'schemaVersion':2,'employerId':iid,'columns':COLUMNS,'rows':[[j.get(k)for k in COLUMNS]for j in jobs]};raw=enc(body);return raw,gzip.compress(raw,compresslevel=9,mtime=0)
def ordered(jobs):return sorted(jobs,key=lambda j:(j.get('archive')is False,j.get('announcedAt')or'',j['id']),reverse=True)
def descriptor_name(iid):
 if '/'in iid or '\\'in iid or len((iid+'.json').encode())>255:raise ValueError('unsafe direct descriptor id')
 return 'employers/'+iid+'.json'

def pack(input_dir,app,project,out,report_path):
 if out.exists()and any(out.iterdir()):raise ValueError('new empty target required')
 out.mkdir(parents=True,exist_ok=True);manifest_bytes=(input_dir/'manifest.json').read_bytes();m=json.loads(manifest_bytes);employers=m['employers'];redirects=m['legacyRedirects'];assert m['jobCount']==457627
 now=datetime.datetime.now(datetime.timezone.utc).isoformat();base={};counts=Counter();seen=set();scopes=Counter();archives=Counter();compressed_bytes=0;maxpage=0;maxplain=0
 for iid,e in sorted(employers.items()):
  jobs=[]
  for p in e['parts']:
   raw=(input_dir/p['path']).read_bytes();assert len(raw)==p['bytes']and sha(raw)==p['sha256'];body=json.loads(raw);assert body['employerId']==iid;assert len(body['jobs'])==p['count'];jobs.extend(body['jobs'])
  assert len(jobs)==e['jobCount'];jobs=ordered(jobs);pages=[];scope_counts=Counter(j['scope']for j in jobs);archive_counts=Counter(str(j.get('archive'))for j in jobs)
  for j in jobs:
   assert j['id']not in seen;seen.add(j['id']);assert j['sourceURL']=='https://gossluzhba.gov.ru/vacancy/'+j['id'];scopes[j['scope']]+=1;archives[str(j['archive'])]+=1
  for start in range(0,len(jobs),250):
   batch=jobs[start:start+250];raw,zipped=packed_page(iid,batch);zd=sha(zipped);owner=sha(iid.encode())[:24];relative=Path('pages')/owner[:2]/owner/('p'+str(start//250).zfill(4)+'-'+zd[:16]+'.json.gz');target=out/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(zipped);pages.append({'path':relative.as_posix(),'count':len(batch),'bytes':len(zipped),'sha256':zd,'uncompressedBytes':len(raw),'uncompressedSHA256':sha(raw),'nonArchiveCount':sum(j['archive']is False for j in batch),'archiveCount':sum(j['archive']is True for j in batch)});counts['gzipPages']+=1;compressed_bytes+=len(zipped);maxpage=max(maxpage,len(zipped));maxplain=max(maxplain,len(raw))
  base[iid]={'schemaVersion':2,'authorityId':iid,'employerId':iid,'name':e['name'],'identityStatus':e['identityStatus'],'rankable':e['rankable'],'jobCount':len(jobs),'nonArchiveCount':archive_counts['False'],'archiveCount':archive_counts['True'],'unknownArchiveCount':archive_counts['None'],'scopeCounts':dict(scope_counts),'pages':pages,'familyConnections':[],'snapshotAt':now,'observedAt':None,'timestampMeaning':'export-created-at;not-source-currentness-verification','currentness':'unknown;flags/dates/state-as-published','mappingState':'exact-source-profile-id','coverage':'all-saved-observed-API-cards;not-live','sourceLabel':'Госслужба','sourceURLTemplate':'https://gossluzhba.gov.ru/vacancy/{id}'};counts['jobs']+=len(jobs)
 assert len(seen)==counts['jobs']==457627
 # All actual platform catalogue IDs, plus future source profiles. IDs only, no fuzzy client matching.
 catalogs={};catalog_pins=[]
 for filename,key in [('authorities.json',None),('public-service.json','records'),('territorial-authorities.json','authorities'),('territorial-supplement.json','institutions')]:
  path=app/'data'/filename;raw=path.read_bytes();x=json.loads(raw);rows=x[key]if key else x;catalogs[filename]=rows;catalog_pins.append({'file':filename,'sha256':sha(raw),'records':len(rows)})
 platform={r['id']:r for rows in catalogs.values()for r in rows};canonical_raw=(project/'data/completion/assembled/institutions.json').read_bytes();canonical=json.loads(canonical_raw)['institutions'];family=defaultdict(dict)
 for record in canonical:
  parent=record.get('parentInstitutionId');child=resolved(record['id'],employers,redirects);head=resolved(parent,employers,redirects)if parent else None
  if not child or not head or child==head:continue
  d=base[child];family[head][child]={'authorityId':record['id'],'employerId':child,'name':d['name'],'jobCount':d['jobCount'],'nonArchiveCount':d['nonArchiveCount'],'archiveCount':d['archiveCount'],'descriptorPath':descriptor_name(record['id']),'relation':'explicit-canonical-parentInstitutionId;distinct-employer','sameLegalEntity':False}
 for head,children in family.items():base[head]['familyConnections']=sorted(children.values(),key=lambda x:(-x['nonArchiveCount'],-x['jobCount'],x['name']))
 descriptors={};allids=set(base)|set(platform)|set(redirects)
 for iid in sorted(allids):
  target=resolved(iid,employers,redirects)
  if target:
   d=dict(base[target]);d['authorityId']=iid;d['mappingState']='verified-d652-legacy-redirect'if iid!=target else'exact-platform-id-to-source-profile'if iid in platform else'exact-source-profile-id'
   if iid!=target:d['aliasOf']=target
  else:
   r=platform.get(iid,{});name=r.get('name',iid);name=name.get('ru',iid)if isinstance(name,dict)else name;d={'schemaVersion':2,'authorityId':iid,'employerId':None,'name':name,'jobCount':0,'nonArchiveCount':0,'archiveCount':0,'unknownArchiveCount':0,'scopeCounts':{},'pages':[],'familyConnections':[],'mappingState':'no-source-profile-binding-for-exact-platform-id','coverage':'no-matching-saved-bank-profile;not-proof-of-no-vacancies','snapshotAt':now,'observedAt':None,'currentness':'unknown'}
  descriptors[iid]=d;path=out/descriptor_name(iid);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(enc(d))
 # Canonical children may be legacy aliases not already in dictionaries.
 for children in family.values():
  for connection in children.values():assert (out/connection['descriptorPath']).is_file()
 catalog_coverage={}
 for name,rows in catalogs.items():
  ds=[descriptors[r['id']]for r in rows];catalog_coverage[name]={'records':len(rows),'exactMapped':sum(d['employerId']is not None for d in ds),'withDirectJobs':sum(d['jobCount']>0 for d in ds),'withDirectOrExplicitFamilyJobs':sum(d['jobCount']>0 or any(x['jobCount']>0 for x in d['familyConnections'])for d in ds),'emptyDescriptors':sum(d['jobCount']==0 for d in ds),'unmappedIDs':[d['authorityId']for d in ds if d['employerId']is None]}
 descriptor_bytes=sum((out/descriptor_name(i)).stat().st_size for i in descriptors);maxdescriptor=max((out/descriptor_name(i)).stat().st_size for i in descriptors);head_sizes={r['id']:(out/descriptor_name(r['id'])).stat().st_size for r in catalogs['authorities.json']}
 summary={'schemaVersion':2,'kind':'lazy-public-vacancy-bank','jobCount':counts['jobs'],'uniqueUUIDCount':len(seen),'sourceEmployerProfiles':len(employers),'employersWithJobs':sum(e['jobCount']>0 for e in employers.values()),'descriptorCount':len(descriptors),'gzipPageCount':counts['gzipPages'],'maxJobsPerPage':250,'columns':COLUMNS,'archiveCount':archives['True'],'nonArchiveCount':archives['False'],'unknownArchiveCount':archives['None'],'scopeCounts':dict(scopes),'snapshotAt':now,'currentness':'unknown;as-published flags/dates/state','fetchPolicy':'load only employers/<selected-authority-id>.json and requested gzip pages;never enumerate all profiles','sourceDatasetSHA256':m['sourceDatasetSHA256'],'employerMapSHA256':m['employerMapSHA256']};summary_raw=enc(summary);(out/'summary.json').write_bytes(summary_raw)
 report={'actualExitCode':0,'processPID':os.getpid(),'jobs':counts['jobs'],'uniqueUUIDs':len(seen),'singleSourceEmployerPerUUID':True,'aliasesDoNotDuplicatePageStorage':True,'gzipPageBytes':compressed_bytes,'descriptorBytes':descriptor_bytes,'summaryBytes':len(summary_raw),'totalAssetBytes':compressed_bytes+descriptor_bytes+len(summary_raw),'maxGzipPageBytes':maxpage,'maxDecompressedPageBytes':maxplain,'maxDescriptorBytes':maxdescriptor,'maxFederalHeadDescriptorBytes':max(head_sizes.values()),'federalHeadDescriptorBytes':head_sizes,'catalogCoverage':catalog_coverage,'catalogPins':catalog_pins,'sourceCanonicalParentEvidenceSHA256':sha(canonical_raw),'summarySHA256':sha(summary_raw),'v1ManifestSHA256':sha(manifest_bytes),'codeSHA256':sha(Path(__file__).read_bytes()),'sourceSQLiteRead':False,'wholeBankClientFetchRequired':False,'networkRequests':0,'output':str(out),'sourceProfiles':len(base),'platformIDs':len(platform),'descriptors':len(descriptors),'gzipPages':counts['gzipPages'],'federalHeadsDirectAndFamily':[{ 'id':r['id'],'directJobs':descriptors[r['id']]['jobCount'],'directNonArchive':descriptors[r['id']]['nonArchiveCount'],'explicitFamilyEmployers':len(descriptors[r['id']]['familyConnections']),'explicitFamilyJobs':sum(x['jobCount']for x in descriptors[r['id']]['familyConnections'])}for r in catalogs['authorities.json']]};report_path.parent.mkdir(parents=True,exist_ok=True);report_path.write_bytes(enc(report));print(json.dumps(report,ensure_ascii=False),flush=True)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',type=Path,required=True);p.add_argument('--app',type=Path,required=True);p.add_argument('--project-root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args();pack(a.input.resolve(),a.app.resolve(),a.project_root.resolve(),a.out.resolve(),a.report.resolve())
if __name__=='__main__':main()
