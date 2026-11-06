#!/usr/bin/env python3
"""Final deterministic gzip-only descriptor pass after repack + parent overlay. No source reads."""
import argparse,json,gzip,hashlib,os
from pathlib import Path

def sha(b):return hashlib.sha256(b).hexdigest()
def encode_descriptor(raw):
 obj=json.loads(raw)
 for child in obj.get('familyConnections',[]):
  path=child.get('descriptorPath')
  if isinstance(path,str)and path.endswith('.json'):child['descriptorPath']=path+'.gz'
 changed=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode();compressed=gzip.compress(changed,compresslevel=9,mtime=0);assert gzip.decompress(compressed)==changed
 return changed,compressed

def run(bank,report):
 pages={p.relative_to(bank).as_posix():(p.stat().st_size,p.stat().st_mtime_ns)for p in(bank/'pages').rglob('*.json.gz')};assert len(pages)==10343
 plain=sorted((bank/'employers').glob('*.json'));assert plain,'expected uncompressed generated descriptors'
 count=0;rawbytes=0;compressedbytes=0;maxraw=0;maxcompressed=0
 for p in plain:
  raw,zipped=encode_descriptor(p.read_bytes());out=Path(str(p)+'.gz');assert not out.exists();tmp=Path(str(out)+'.tmp');tmp.write_bytes(zipped);os.replace(tmp,out);assert gzip.decompress(out.read_bytes())==raw;p.unlink();count+=1;rawbytes+=len(raw);compressedbytes+=len(zipped);maxraw=max(maxraw,len(raw));maxcompressed=max(maxcompressed,len(zipped))
 assert not list((bank/'employers').glob('*.json'));assert pages=={p.relative_to(bank).as_posix():(p.stat().st_size,p.stat().st_mtime_ns)for p in(bank/'pages').rglob('*.json.gz')}
 h=hashlib.sha256();files=0;total=0
 for p in sorted(x for x in bank.rglob('*')if x.is_file()):
  raw=p.read_bytes();h.update((p.relative_to(bank).as_posix()+'\0'+sha(raw)+'\0'+str(len(raw))+'\n').encode());files+=1;total+=len(raw)
 result={'actualExitCode':0,'status':'frozen-gzip-only-descriptors-and-pages','descriptorCount':count,'descriptorUncompressedBytes':rawbytes,'descriptorGzipBytes':compressedbytes,'maxDescriptorUncompressedBytes':maxraw,'maxDescriptorGzipBytes':maxcompressed,'jobPages':len(pages),'jobPagesStatUnchanged':True,'sourceRead':False,'sourceJobs':457627,'schemaVersion':2,'fileCount':files,'bytes':total,'treeSHA256':h.hexdigest(),'treeHashFormat':'SHA256 of UTF8 lines sorted relative path: path+NUL+fileSHA256+NUL+decimalBytes+LF','codeSHA256':sha(Path(__file__).read_bytes())};report.parent.mkdir(parents=True,exist_ok=True);report.write_text(json.dumps(result,sort_keys=True)+'\n');print(json.dumps(result),flush=True)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bank',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args();run(a.bank.resolve(),a.report.resolve())
if __name__=='__main__':main()
