import unittest,json,gzip,importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('compress',Path(__file__).with_name('compress-career-vacancy-descriptors.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class DescriptorCompressionTest(unittest.TestCase):
 def test_lossless_deterministic_descriptor_with_gzip_family_route(self):
  raw=json.dumps({'schemaVersion':2,'jobCount':0,'familyConnections':[{'employerId':'child','jobCount':3,'descriptorPath':'employers/child.json','sameLegalEntity':False}]}).encode();a,z=m.encode_descriptor(raw);self.assertEqual((a,z),m.encode_descriptor(raw));self.assertEqual(gzip.decompress(z),a);d=json.loads(a);self.assertEqual(d['familyConnections'][0]['descriptorPath'],'employers/child.json.gz');self.assertEqual(d['jobCount'],0);self.assertFalse(d['familyConnections'][0]['sameLegalEntity'])
if __name__=='__main__':unittest.main()
