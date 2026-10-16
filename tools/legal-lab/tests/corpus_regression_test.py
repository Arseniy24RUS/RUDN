"""Regression checks for actual acquisition failures found in the supplied corpus."""
import sys,pathlib,tempfile,unittest,json,hashlib,datetime as dt
from unittest.mock import patch
TEST_PARENT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(TEST_PARENT/'tools' if (TEST_PARENT/'tools'/'acquire_corpus.py').exists() else TEST_PARENT))
from acquire_corpus import Fetcher,extract_html,toc_links,structure,write,anchor_catalog,anchor_path,active_sources,resolve_anchors
class CorpusAcquisitionRegressions(unittest.TestCase):
 def test_retired_public_anchors_fall_back_to_internal_evidence_without_writing_it(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);data=root/'data';data.mkdir();archive=root/'archived.json';write(archive,{'retired':{'units':[]}});before=archive.read_bytes()
   with patch('acquire_corpus.ROOT',root),patch('acquire_corpus.DATA',data),patch('acquire_corpus.ARCHIVED_ANCHORS',archive):
    self.assertEqual(anchor_catalog(),{'retired':{'units':[]}});self.assertEqual(anchor_path(),root/'.corpus-anchors.json');write(anchor_path(),{'active':{'units':[]}});self.assertEqual(anchor_catalog(),{'active':{'units':[]}})
   self.assertEqual(archive.read_bytes(),before);self.assertFalse((data/'anchors.json').exists())
 def test_default_acquisition_follows_active_catalog_and_historical_request_is_explicit(self):
  with tempfile.TemporaryDirectory() as t:
   data=pathlib.Path(t);write(data/'catalog.json',{'documents':[{'id':'active'}]});sources=[{'id':'active'},{'id':'retired'}]
   with patch('acquire_corpus.DATA',data):
    self.assertEqual(active_sources(sources),[{'id':'active'}]);self.assertEqual(active_sources(sources,['retired']),[{'id':'retired'}])
 def test_current_seed_retains_exact_identity_and_inherited_question_aliases(self):
  seed={'units':[{'id':'a','text':'1. Одинаковая норма.','locator':'Статья1'},{'id':'b','text':'1. Одинаковая норма.','locator':'Статья2'}],'aliases':{'question':['a']}}
  candidate={'units':seed['units']};result=resolve_anchors(seed,candidate)
  self.assertEqual(result,{'resolved':2,'total':2,'issues':[]});self.assertEqual(candidate['aliases'],{'a':['a'],'b':['b'],'question':['a']})
  seed['aliases']['bad']=['missing'];self.assertTrue(resolve_anchors(seed,{'units':seed['units']})['issues'])
 def test_nested_malformed_paragraph_does_not_hide_article8(self):
  h='<main><h2>Статья 8. Условия</h2><p>(в ред. Закона)<p>1. Плата за сведения.</p><p>2. Сведения предоставляются бесплатно.</p></p></main>'
  texts=[b['text'] for b in extract_html(h,{},'')]
  self.assertEqual(texts,['Статья 8. Условия','1. Плата за сведения.','2. Сведения предоставляются бесплатно.'])
 def test_every_nested_toc_leaf_is_retrieved_including_annex(self):
  h='<div class="document-page__toc"><a href="/document/LAW_1/c/">Глава1</a><ul><li><a href="/document/LAW_1/a/">Статья1</a></li><li><a href="/document/LAW_1/app/">Приложение1</a></li></ul><a href="/document/LAW_2/x/">Другойакт</a></div><a href="/document/LAW_1/news/">Новость</a>'
  self.assertEqual([x[1] for x in toc_links(h,'https://law.test/document/LAW_1/')],['https://law.test/document/LAW_1/c/','https://law.test/document/LAW_1/a/','https://law.test/document/LAW_1/app/'])
 def test_catalogue_without_body_is_not_a_document(self):
  with self.assertRaises(ValueError):extract_html('<main><div class="document-page__toc"><a>Статья1</a></div></main>',{},'')
 def cache(self,path,age,raw=b'old'):
  url='https://law.test/act';key=hashlib.sha256(url.encode()).hexdigest();p=pathlib.Path(path)/(key+'.html');p.write_bytes(raw);write(p.with_suffix('.json'),{'url':url,'retrievedAt':(dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=age)).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'encoding':'utf-8'});return url,p
 def test_expired_cache_requires_retrieval_not_silent_stale_fallback(self):
  with tempfile.TemporaryDirectory() as t:
   url,p=self.cache(t,48)
   with patch('acquire_corpus.urlopen',side_effect=OSError('network down')) as call:
    with self.assertRaisesRegex(OSError,'network down'):Fetcher(t,delay=0,max_age_hours=24).get(url)
    call.assert_called_once()
 def test_fresh_cache_checksum_is_checked(self):
  with tempfile.TemporaryDirectory() as t:
   url,p=self.cache(t,0);p.write_bytes(b'tampered')
   with self.assertRaisesRegex(ValueError,'checksum'):Fetcher(t,delay=0).get(url)
 def test_graphic_annex_reference_survives_structuring(self):
  units,_=structure([{'text':'Форма удостоверения','imageUrl':'documents/figures/actual.png'}],'law','https://law.test/act')
  self.assertEqual(units[0]['imageUrl'],'documents/figures/actual.png')
 def test_json_is_lf_on_windows_for_release_checksums(self):
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t)/'data.json';write(p,{'a':[1,2]});self.assertNotIn(b'\r',p.read_bytes())
class PublisherRemovalRegressions(unittest.TestCase):
 def test_publisher_container_removed_but_legislative_note_preserved(self):
  html='<main><h2>Статья 1. Правило</h2><div class="document__insert doc-insert"><p>КонсультантПлюс:</p><p>С 25 октября статья дополняется.</p></div><p>Примечание. Положение настоящей статьи применяется к лицам.</p></main>'
  texts=[b['text'] for b in extract_html(html,{},'')]
  self.assertEqual(texts,['Статья 1. Правило','Примечание. Положение настоящей статьи применяется к лицам.'])
 def test_nested_pdf_editorial_parentheses_preserve_following_rule(self):
  from prepare_final_cleanup import strip_pdf_notes
  text='1. Норма. (Часть в редакции, введенной Законом (изменение) - См. предыдущую редакцию) 2. Другая норма.'
  clean,removed=strip_pdf_notes(text)
  self.assertEqual(clean,'1. Норма. 2. Другая норма.');self.assertEqual(len(removed),1)
 def test_normative_parenthetical_definition_is_preserved(self):
  from prepare_final_cleanup import strip_pdf_notes
  text='Гражданин (далее - служащий) вправе обратиться.'
  self.assertEqual(strip_pdf_notes(text),(text,[]))
 def test_operative_reference_is_not_article_heading(self):
  from acquire_corpus import HEADING
  self.assertIsNone(HEADING.match('Статья 46 Устава применяется в установленном порядке.'))
  self.assertIsNotNone(HEADING.match('Статья 46. Полномочия'))
if __name__=='__main__':unittest.main()
