"""Rebuild reviewed content from a checksum-pinned source snapshot, with no network.
Produces candidates only; an independent content review is still needed to install.
"""
import argparse,hashlib,json,os,pathlib,shutil,zipfile,types

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-archive',required=True);p.add_argument('--archive-sha256',required=True);p.add_argument('--reference-data',required=True);p.add_argument('--work-dir',required=True);args=p.parse_args()
 archive=pathlib.Path(args.source_archive).resolve();reference=pathlib.Path(args.reference_data).resolve();work=pathlib.Path(args.work_dir).resolve()
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=args.archive_sha256:raise ValueError('Archive checksum mismatch')
 if work.exists() and any(work.iterdir()):raise ValueError('Use a new empty work directory')
 work.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(archive) as z:
  for member in z.infolist():
   dest=(work/member.filename).resolve()
   if not dest.is_relative_to(work):raise ValueError('Archive traversal rejected')
  z.extractall(work)
 data=work/'site/apps/legal-lab/data';data.mkdir(parents=True)
 for name in ['catalog.json','anchors.json']:shutil.copy2(reference/name,data/name)
 shutil.copytree(reference/'documents',data/'documents')
 os.environ['LEGAL_LAB_WORK_ROOT']=str(work);os.environ['LEGAL_LAB_DATA_DIR']=str(data);os.environ['LEGAL_LAB_EVIDENCE_DIR']=str(work/'evidence')
 from acquire_corpus import load,write,prepare_one,SOURCE_PATH
 # Offline mode is explicit and checks original raw bytes against the receipts.
 class SnapshotFetcher:
  def __init__(self,cache,*a,**kw):self.cache=pathlib.Path(cache);self.records=[]
  def get(self,url):
   key=hashlib.sha256(url.encode()).hexdigest();meta=load(self.cache/(key+'.json'));raw=(self.cache/(key+'.html')).read_bytes()
   if meta['url']!=url or hashlib.sha256(raw).hexdigest()!=meta['sha256']:raise ValueError('Snapshot source mismatch: '+url)
   self.records.append(meta);return raw.decode(meta.get('encoding','utf-8'))
 from prepare_supplements import main as prepare_pdf
 from apply_moscow_amendments import moscow35,moscow50,receipts
 prepare_pdf();moscow50();moscow35();write(work/'.supplement-blocks/amendment-application-receipts.json',{'reviewKind':'synthetic-editorial','amendments':receipts})
 arguments=types.SimpleNamespace(local_dir=None,workers=4,revision_label=None,as_of='2026-10-15',mappings=None,output=str(work/'.pending-corpus'))
 fetcher=SnapshotFetcher(work/'.source-cache');results=[]
 for source in load(SOURCE_PATH):
  arguments.local_dir=str(work/'.supplement-blocks') if source['id'] in ('moscow3','moscow35','moscow50') else None
  result=prepare_one(source,arguments,fetcher);results.append(result)
  if result['preflight']['completeness']['issues']:raise ValueError(result)
 from clean_corpus import clean_candidate
 for path in (work/'.pending-corpus/documents').glob('*.json'):write(work/'.clean-corpus/documents'/path.name,clean_candidate(load(path)))
 (work/'.pending-archive-fixed/documents').mkdir(parents=True);shutil.copy2(work/'.pending-corpus/documents/archive122.json',work/'.pending-archive-fixed/documents/archive122.json')
 from reconstruct_archive122 import main as historical
 historical(fetcher_factory=SnapshotFetcher)
 from finalize_candidates import main as finalize
 finalize()
 from review_corpus import structural_review
 checks=[]
 for path in (work/'.review-corpus/documents').glob('*.json'):
  rebuilt=load(path);original=load(reference/'documents'/path.name);structure=structural_review(rebuilt)
  checks.append({'id':path.stem,'unitsSha256':rebuilt['sha256'],'referenceUnitsSha256':original['sha256'],'identicalLawUnits':rebuilt['sha256']==original['sha256'],'structuralIssues':structure['issues']})
 result={'reviewKind':'synthetic-offline-reproduction','networkCalls':0,'sourceArchiveSha256':args.archive_sha256,'documents':checks,'status':'pass' if all(c['identicalLawUnits'] and not c['structuralIssues'] for c in checks) else 'fail'};write(work/'evidence/reproduction.json',result);print(json.dumps(result,ensure_ascii=False))
 return 0 if result['status']=='pass' else 1
if __name__=='__main__':raise SystemExit(main())
