import unittest,importlib.util,gzip,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('pack',Path(__file__).with_name('repack-career-vacancies.py'));pack=importlib.util.module_from_spec(spec);spec.loader.exec_module(pack)
class PackTests(unittest.TestCase):
 def test_columnar_codec_retains_closed_future_archive_and_omits_private(self):
  job={'id':'u','title':'Группа','scope':'group-or-reserve-context','archive':True,'state':'Закрыта','expiresAt':'2099-01-01','privateCandidate':'omit'};raw,z=pack.packed_page('owner',[job]);self.assertEqual(gzip.decompress(z),raw);body=json.loads(raw);decoded=dict(zip(body['columns'],body['rows'][0]));self.assertTrue(decoded['archive']);self.assertEqual(decoded['state'],'Закрыта');self.assertEqual(decoded['scope'],'group-or-reserve-context');self.assertNotIn('privateCandidate',decoded)
 def test_exact_legacy_redirect_and_source_order_do_not_merge_family(self):
  employers={'head':{},'child':{}};redirects={'old':'head'};self.assertEqual(pack.resolved('old',employers,redirects),'head');self.assertEqual(pack.resolved('child',employers,redirects),'child');self.assertIsNone(pack.resolved('unmatched',employers,redirects));rows=[{'id':'a','archive':True,'announcedAt':'2099'},{'id':'b','archive':False,'announcedAt':'2000'}];self.assertEqual(pack.ordered(rows)[0]['id'],'b')
if __name__=='__main__':unittest.main()
