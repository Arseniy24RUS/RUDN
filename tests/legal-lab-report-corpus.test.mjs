import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadReportDocuments} from '../site/apps/legal-lab/lib/report-corpus.mjs';
import {scoreDossier,expandIds,EVIDENCE_MODE} from '../site/apps/legal-lab/lib/core.mjs';

const data=new URL('../site/apps/legal-lab/data/',import.meta.url);
const json=async p=>JSON.parse(await readFile(new URL(p,data),'utf8'));
const [catalog,pack,cases,scans]=await Promise.all(['catalog.json','report-references.json','cases.json','scans.json'].map(json));
const EXPECTED_SHA='fbd930dcb7f2b8b4512447cd1e9b87c3daf7a257f28c8bdb63a4980464f482e5';
const active=await Promise.all(catalog.documents.map(meta=>json(meta.file)));
const archived=await Promise.all(['archive122','realty218'].map(id=>readFile(new URL('./fixtures/legal-lab-retired-corpus/'+id+'.json',import.meta.url),'utf8').then(JSON.parse)));
function fixture(){
  const requests=[],loads=[],cache=new Map(),controller=new AbortController();
  const corpus={catalog:structuredClone(catalog),signal:controller.signal,cache,
    async json(path,sha){requests.push({path,sha});assert.equal(path,'data/report-references.json');assert.equal(sha,EXPECTED_SHA);return structuredClone(pack);},
    async load(id){loads.push(id);const doc=active.find(d=>d.id===id);if(!doc)throw new Error('Missing active source');return doc;},
    async all(){return Promise.all(this.catalog.documents.map(d=>this.load(d.id)));}
  };
  return {corpus,requests,loads,cache,controller};
}

test('pinned reference file preserves original identities and only the reviewed canonical section, without body text',async()=>{
  assert.equal(createHash('sha256').update(await readFile(new URL('report-references.json',data))).digest('hex'),EXPECTED_SHA);
  assert.equal(pack.schema,1);assert.equal(pack.contentVersion,catalog.contentVersion);
  assert.deepEqual(pack.documents.map(d=>d.id),['archive122','realty218']);
  for(const reference of pack.documents){
    const source=archived.find(d=>d.id===reference.id);
    assert.equal(reference.referenceOnly,true);assert.equal(reference.sha256,source.sha256);assert.equal(reference.version,source.version);
    assert.deepEqual(reference.units,source.units.map(({id,sectionId})=>({id,sectionId})));
    assert.deepEqual(reference.sections,source.sections.filter(s=>s.id==='archive122-s8'));
    assert.deepEqual(reference.aliases,{});
  }
});

test('active-only calls remain lazy, deduplicate in request order and use the supplied active loader',async()=>{
  const f=fixture(),seen=[];
  const docs=await loadReportDocuments(f.corpus,['koap','constitution','koap'],async id=>{seen.push(id);return active.find(d=>d.id===id);});
  assert.deepEqual(docs.map(d=>d.id),['koap','constitution']);assert.deepEqual(seen,['koap','constitution']);
  assert.deepEqual(f.requests,[]);assert.deepEqual(f.loads,[]);assert.deepEqual(await loadReportDocuments(f.corpus,[]),[]);
});

test('concurrent retired requests share one verified load without modifying catalog, cache or all()',async()=>{
  const f=fixture(),before=structuredClone(f.corpus.catalog);
  const [one,two]=await Promise.all([loadReportDocuments(f.corpus,['archive122','constitution','archive122']),loadReportDocuments(f.corpus,['realty218','archive122'])]);
  assert.deepEqual(one.map(d=>d.id),['archive122','constitution']);assert.deepEqual(two.map(d=>d.id),['realty218','archive122']);
  assert.equal(f.requests.length,1);assert.equal(one[0],two[1]);assert.ok(Object.isFrozen(one[0].units));
  assert.equal(f.cache.size,0);assert.deepEqual(f.corpus.catalog,before);assert.equal((await f.corpus.all()).length,14);
  assert.ok(f.loads.every(id=>!['archive122','realty218'].includes(id)));
});

test('only explicitly retired IDs have fallback; active failures propagate and active metadata takes priority',async()=>{
  const f=fixture();
  for(const id of ['unknown','constructor','__proto__','',null,42])await assert.rejects(loadReportDocuments(f.corpus,['constitution',id]));
  assert.deepEqual(f.requests,[]);assert.deepEqual(f.loads,[]);
  await assert.rejects(loadReportDocuments(f.corpus,['constitution'],async()=>{throw new Error('Active verification failed');}),/Active verification failed/);
  assert.equal(f.requests.length,0);
  f.corpus.catalog.documents.push({id:'archive122'});
  await assert.rejects(loadReportDocuments(f.corpus,['archive122']),/Missing active source/);assert.equal(f.requests.length,0);
});

test('network or pin verification errors are not cached and a later retry can succeed',async()=>{
  const f=fixture(),original=f.corpus.json;
  f.corpus.json=async(path,sha)=>{assert.equal(sha,EXPECTED_SHA);f.requests.push({path,sha});throw new Error('Bad response hash');};
  await assert.rejects(loadReportDocuments(f.corpus,['archive122']),/Bad response hash/);
  f.corpus.json=original;assert.equal((await loadReportDocuments(f.corpus,['archive122']))[0].id,'archive122');assert.equal(f.requests.length,2);
  const mixed=fixture();await assert.rejects(loadReportDocuments(mixed.corpus,['archive122','constitution'],async()=>{throw new Error('Active failure');}),/Active failure/);
});

test('malformed or stale reference metadata fails closed, including changed pins, counts and added body text',async()=>{
  const mutations=[
    p=>p.schema=2,p=>p.contentVersion='stale',p=>p.documents.pop(),p=>p.documents[1]=structuredClone(p.documents[0]),
    p=>p.documents[0].sha256='0'.repeat(64),p=>p.documents[0].sourceFileSha256='0'.repeat(64),p=>p.documents[0].version='stale',
    p=>p.documents[0].referenceOnly=false,p=>p.documents[0].coverage='partial',p=>p.documents[0].units.pop(),
    p=>p.documents[0].units[1]=structuredClone(p.documents[0].units[0]),p=>p.documents[0].units[0].text='Unexpected source text',
    p=>p.documents[0].text='Unexpected source text',p=>p.documents[0].sections[0].unitIds.reverse(),
    p=>p.documents[0].sections[0].unitIds.pop(),p=>p.documents[0].sections[0].unitIds[0]='unknown',
    p=>p.documents[1].sections.push(structuredClone(p.documents[0].sections[0])),p=>p.documents[0].aliases.fake=['unknown']
  ];
  for(const mutate of mutations){const f=fixture(),bad=structuredClone(pack);mutate(bad);f.corpus.json=async()=>bad;await assert.rejects(loadReportDocuments(f.corpus,['archive122']),/incompatible/);}
  const f=fixture();f.corpus.catalog.contentVersion='stale';await assert.rejects(loadReportDocuments(f.corpus,['archive122']),/incompatible/);
});

test('abort before or during fetch is never retained and a changed version invalidates cached references',async()=>{
  const before=fixture();before.controller.abort();await assert.rejects(loadReportDocuments(before.corpus,['archive122']),{name:'AbortError'});assert.equal(before.requests.length,0);
  const f=fixture();let release;f.corpus.json=()=>new Promise(r=>release=r);
  const pending=loadReportDocuments(f.corpus,['archive122']);f.controller.abort();release(structuredClone(pack));await assert.rejects(pending,{name:'AbortError'});
  const retryController=new AbortController();f.corpus.signal=retryController.signal;let calls=0;f.corpus.json=async()=>{calls++;return structuredClone(pack);};
  await loadReportDocuments(f.corpus,['archive122']);assert.equal(calls,1);f.corpus.catalog.contentVersion='stale';await assert.rejects(loadReportDocuments(f.corpus,['archive122']),/incompatible/);assert.equal(calls,2);
  const changed=fixture();let done;changed.corpus.json=()=>new Promise(r=>done=r);const work=loadReportDocuments(changed.corpus,['realty218']);changed.corpus.catalog.contentVersion='stale';done(structuredClone(pack));await assert.rejects(work,/incompatible/);
});

test('all24 legacy rubrics retain exact scores and criterion details for wrong and mixed retired selections in both evidence modes',async()=>{
  const f=fixture(),refs=await loadReportDocuments(f.corpus,['archive122','realty218']),fullCorpus=[...active,...archived],referenceCorpus=[...active,...refs];let comparisons=0;
  for(const item of cases){
    const baseline={metadata:Object.fromEntries(item.scanQuestions.map(q=>[q.field,q.field])),classifications:Object.fromEntries(item.classificationIds.map(id=>[id,scans.find(s=>s.id===id).actType])),documentIds:item.docIds,selections:expandIds(item.answerSets[0],active)};
    for(const source of archived){
      const heading=source.id==='archive122'?'archive122-u911ed526f9a647f3cc-1':source.units.find(u=>/^Статья /.test(u.text)).id;
      const body=source.id==='archive122'?'archive122-u608aad19388746bde0-1':source.units.find(u=>/^1\./.test(u.text)).id;
      for(const mode of [undefined,EVIDENCE_MODE])for(const kind of ['wrong-body','wrong-heading','mixed-body','mixed-heading','extra-document']){
        const answer=structuredClone(baseline);if(mode)answer.evidenceMode=mode;
        const selected=kind.endsWith('heading')?heading:body;
        answer.documentIds=kind.startsWith('wrong')?[source.id]:[...item.docIds,source.id];
        answer.selections=kind.startsWith('wrong')?[selected]:kind==='extra-document'?baseline.selections:[...baseline.selections,selected];
        assert.deepEqual(scoreDossier(item,answer,scans,referenceCorpus),scoreDossier(item,answer,scans,fullCorpus),item.id+'/'+source.id+'/'+(mode||'legacy')+'/'+kind);comparisons++;
      }
    }
  }
  assert.equal(comparisons,480);
});
