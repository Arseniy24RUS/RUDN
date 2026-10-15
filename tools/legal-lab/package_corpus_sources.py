"""Package exact source bytes and their receipts; fail if any provenance hash is missing."""
from acquire_corpus import *
import zipfile

def main():
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--evidence',required=True);args=p.parse_args();e=pathlib.Path(args.evidence);e.mkdir(parents=True,exist_ok=True)
 index={};records=[];missing=[];files={}
 for directory in ['.source-cache','.source-probe','.supplement-blocks']:
  for path in (ROOT/directory).glob('*'):
   if path.is_file():index.setdefault(hashlib.sha256(path.read_bytes()).hexdigest(),[]).append(path)
 for path in (ROOT/'.review-corpus/documents').glob('*.json'):
  d=load(path)
  for r in d['provenance']:
   sha=r.get('sha256');found=index.get(sha,[])
   if not found:missing.append({'documentId':d['id'],'receipt':r});continue
   chosen=found[0];relative=chosen.relative_to(ROOT).as_posix();files[relative]=chosen
   records.append({'documentId':d['id'],'sourceUrl':r.get('url',r.get('sourceUrl')),'sha256':sha,'file':relative,'bytes':chosen.stat().st_size,'retrievedAt':r.get('retrievedAt'),'receipt':r})
 hashes={r['sha256'] for r in records}
 for directory in ['.source-cache','.source-probe']:
  for path in (ROOT/directory).glob('*.json'):
   try:r=load(path)
   except (ValueError,UnicodeError):continue
   if isinstance(r,dict) and r.get('sha256') in hashes:files[path.relative_to(ROOT).as_posix()]=path
 manifest={'reviewKind':'source-byte-provenance','createdAt':dt.datetime.now(dt.timezone.utc).isoformat(),'records':records,'missing':missing};write(e/'source-provenance-manifest.json',manifest)
 if missing:raise ValueError('Missing source bytes: '+json.dumps(missing,ensure_ascii=False))
 for path in (ROOT/'.supplement-blocks').glob('*.json'):files[path.relative_to(ROOT).as_posix()]=path
 for name in ['archive-spinform.html','archive133-garant.json']:
  path=ROOT/'.source-probe'/name;files[path.relative_to(ROOT).as_posix()]=path
 archive=e/'source-snapshots.zip'
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name,path in sorted(files.items()):z.write(path,name)
  z.write(e/'source-provenance-manifest.json','source-provenance-manifest.json')
 result={'sourceRecords':len(records),'archivedFiles':len(files),'missing':0,'file':archive.name,'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()};write(e/'source-snapshots-manifest.json',result);print(json.dumps(result))
if __name__=='__main__':main()
