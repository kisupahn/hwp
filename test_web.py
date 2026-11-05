import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from hwpx import HwpxDocument
from app import app, allowed_origins


EXAMPLE={'title':'구조화 보고서','settings':{'letter_spacing':-2,'line_spacing':150},'blocks':[
    {'type':'paragraph','bullet':'□','summary':'사업 개요','body':'{자동화} 검증 (예시)'},
    {'type':'table','headers':['항목','값'],'rows':[['목표','20건'],['예산','확인 필요']]},
    {'type':'chart','title':'처리 건수','unit':'단위: 건','points':[{'label':'준비', 'value':10},{'label':'운영', 'value':20}]},
    {'type':'paragraph','bullet':'○','body':'페이지 구분 이후 문단','page_break_before':True}]}


class WebTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)

    def test_editor_and_status(self):
        self.assertEqual(self.client.get('/').status_code,200)
        self.assertIn('문서공방',self.client.get('/').text)
        self.assertEqual(self.client.get('/assets/app.js').status_code,200)
        with patch.dict(os.environ,{'LLM_API_KEY':''}):
            self.assertFalse(self.client.get('/api/config').json()['llm_configured'])
            self.assertEqual(self.client.post('/api/draft',json={'instruction':'보고서를 작성해 줘'}).status_code,503)

    def test_structured_exports(self):
        for extension in ('hwp','hwpx'):
            with self.subTest(extension=extension), tempfile.TemporaryDirectory() as directory:
                response=self.client.post('/api/export/'+extension,json=EXAMPLE)
                self.assertEqual(response.status_code,200,response.text[:200] if response.status_code!=200 else '')
                path=Path(directory)/('report.'+extension)
                path.write_bytes(response.content)
                if extension=='hwp':
                    self.assertEqual(response.content[:8],bytes.fromhex('d0cf11e0a1b11ae1'))
                doc=HwpxDocument.open(path)
                self.assertIn('페이지 구분 이후 문단',doc.text.plain())
                self.assertEqual(len(doc.tables),1)
                self.assertEqual(doc.tables[0].cell(1,1).text,'20건')
                xml=doc.sections[0].element
                self.assertEqual(len(xml.xpath('.//*[local-name()="pic"]')),1)
                self.assertTrue(any(doc.styles.paragraph_properties[str(p.para_pr_id_ref)].break_setting.page_break_before for p in doc.paragraphs))
                self.assertTrue(any(s.child_attributes.get('spacing',{}).get('hangul')=='-2' for s in doc.styles.char_properties.values()))

    def test_boundaries(self):
        bad={'blocks':[{'type':'table','headers':['a','b'],'rows':[['c']]}]}
        self.assertEqual(self.client.post('/api/export/hwp',json=bad).status_code,422)
        self.assertEqual(self.client.post('/api/export/hwp',json={'blocks':[{'body':'{{未入力}}'}]}).status_code,422)
        self.assertEqual(self.client.post('/api/export/hwp',json=EXAMPLE,headers={'Origin':'https://other.example'}).status_code,403)
        self.assertEqual(self.client.post('/api/export/hwp',content=b'x'*250001).status_code,413)
        with patch.dict(os.environ,{'APP_ACCESS_TOKEN':'test-only-access-token'}):
            self.assertEqual(self.client.get('/api/config').status_code,401)
            self.assertEqual(self.client.get('/api/config',headers={'Authorization':'Bearer test-only-access-token'}).status_code,200)

    def test_pages_cors_with_access_key(self):
        origin='https://kisupahn.github.io'
        allowed_origins.append(origin)
        try:
            with patch.dict(os.environ,{'APP_ACCESS_TOKEN':'test-only-key'}):
                preflight=self.client.options('/api/export/hwp',headers={
                    'Origin':origin,'Access-Control-Request-Method':'POST',
                    'Access-Control-Request-Headers':'authorization,content-type'})
                self.assertEqual(preflight.status_code,200)
                self.assertEqual(preflight.headers['access-control-allow-origin'],origin)
                response=self.client.post('/api/export/hwp',json={'blocks':[{'body':'Pages 연결 검증'}]},
                    headers={'Origin':origin,'Authorization':'Bearer test-only-key'})
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.headers['access-control-allow-origin'],origin)
        finally:
            allowed_origins.remove(origin)

    def test_llm_contract_with_mock_provider(self):
        import io,json
        provider={'choices':[{'message':{'content':json.dumps({'blocks':[{'type':'paragraph','bullet':'□','summary':'목적','body':'초안 [확인 필요]'}]})}}]}
        with patch.dict(os.environ,{'LLM_API_KEY':'test-only-key'}),patch('app.urlopen',return_value=io.BytesIO(json.dumps(provider).encode())):
            response=self.client.post('/api/draft',json={'instruction':'실제 사실을 추가하지 말고 초안 작성'})
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json()['blocks'][0]['summary'],'목적')

if __name__=='__main__':
    unittest.main()
