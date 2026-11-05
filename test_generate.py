import json
from pathlib import Path
import tempfile
import unittest
from hwpx import HwpxDocument
from generate import render

ROOT = Path(__file__).parent

class GenerationTests(unittest.TestCase):
    def test_both_formats_keep_content_page_and_styles(self):
        template = json.loads((ROOT/'templates/report.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            for ext in ('hwp', 'hwpx'):
                with self.subTest(ext=ext):
                    path = render(template, {'사업명':'자동화 사업','기준연도':2028}, Path(directory)/('report.'+ext))
                    doc = HwpxDocument.open(path)
                    self.assertIn('자동화 사업의 추진 방향 검토 (2028년 기준)', doc.text.plain())
                    self.assertNotIn('{{', doc.text.plain())
                    self.assertEqual(len(doc.paragraphs), 11)
                    section = doc.sections[0].element
                    pages = section.xpath('.//*[local-name()="pagePr"]')
                    self.assertEqual(len(pages), 1)
                    margin = pages[0].xpath('./*[local-name()="margin"]')[0]
                    self.assertAlmostEqual(int(margin.get('left')), 20*7200/25.4, delta=1)
                    styles = doc.styles.char_properties
                    self.assertTrue(any(s.attributes.get('height')=='1600' for s in styles.values()))
                    self.assertTrue(any(s.attributes.get('height')=='1400' for s in styles.values()))
                    self.assertTrue(any(s.attributes.get('shadeColor')=='#FFF2CC' for s in styles.values()))
                    self.assertTrue(any('bold' in s.child_attributes for s in styles.values()))

    def test_missing_value_does_not_write_output(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'missing.hwp'
            with self.assertRaisesRegex(ValueError, 'Missing template value'):
                render({'items':[{'bullet':'□','body':'{{required}}'}]}, {}, path)
            self.assertFalse(path.exists())

if __name__ == '__main__':
    unittest.main()
