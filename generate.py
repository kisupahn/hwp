"""Generate Korean reports from JSON using the supplied macro's formatting."""
import argparse
import json
import re
from pathlib import Path
from hwpx import HwpxDocument

STYLE = {'□': (0, 15, 23.2), '○': (1, 10, 31.2), '-': (2, 6, 34.2), '*': (3, 4, 36.5)}


def render(template, values, output):
    def fill(text):
        def replace(match):
            key = match[1]
            if key not in values:
                raise ValueError('Missing template value: ' + key)
            value = str(values[key])
            if any(c in value for c in '{}\r\n'):
                raise ValueError('Template values cannot contain braces or line breaks: ' + key)
            return value
        return re.sub(r'\{\{([^{}]+)\}\}', replace, text)

    items = template['items']
    if not items:
        raise ValueError('items must not be empty')
    output = Path(output)
    if output.suffix.lower() not in ('.hwp', '.hwpx'):
        raise ValueError('Output must end in .hwp or .hwpx')
    doc = HwpxDocument.new()
    settings = template.get("settings", {})
    doc.page.setup(paper_size='A4', margin_left_mm=settings.get("margin_x",20), margin_right_mm=settings.get("margin_x",20),
                   margin_top_mm=settings.get("margin_y",10), margin_bottom_mm=settings.get("margin_y",10),
                   header_margin_mm=10, footer_margin_mm=10, gutter_mm=0)
    initial = doc.paragraphs[0]
    for index, item in enumerate(items):
        bullet = item.get('bullet', '○')
        if bullet not in STYLE:
            raise ValueError('Unknown bullet: ' + bullet)
        spaces, gap, indent = STYLE[bullet]
        note = bullet == '*'
        font = template.get('font_note', '나눔고딕') if note else template.get('font_main', '나눔명조')
        size = settings.get("note_size",14) if note else settings.get("font_size",16)
        if index:
            p = doc.add_paragraph(include_run=False)
            p.add_run('', font=font, size=gap*settings.get('gap_scale',1))
            doc.styles.apply_paragraph_format(paragraph_index=len(doc.paragraphs)-1,
                line_spacing_percent=settings.get("line_spacing",160), first_line_indent_mm=0,
                spacing_before_pt=0, spacing_after_pt=0)
        if item.get('type', 'paragraph') in ('table', 'chart'):
            from structured import append_structure
            start = len(doc.paragraphs)
            append_structure(doc, item, font, size, 210-2*settings.get('margin_x',20))
            if item.get('page_break_before'):
                doc.styles.apply_paragraph_format(paragraph_index=start, page_break_before=True)
            continue
        p = doc.add_paragraph(include_run=False)
        doc.styles.apply_paragraph_format(paragraph_index=len(doc.paragraphs)-1,
            line_spacing_percent=settings.get("line_spacing",160), first_line_indent_mm=-indent*25.4/72,
            keep_lines=len(item.get("body",""))<300, page_break_before=item.get("page_break_before",False),
            spacing_before_pt=0, spacing_after_pt=0)
        def run(text, bold=False, small=False, highlight=None):
            if text:
                style = doc.styles.ensure_run(font=font, size=size-2 if small else size,
                    bold=bold, color='#000000', highlight=highlight or 'none',
                    letter_spacing=settings.get('letter_spacing',0))
                p.add_run(text, char_pr_id_ref=style)
        run(' '*spaces + bullet + ' ')
        summary = fill(item.get('summary', ''))
        if summary:
            run('(')
            run(summary, highlight='#FFF2CC')
            run(') ')
        body = fill(item['body'])
        bold = False
        depth = 0
        buffer = ''
        for ch in body:
            if ch in '{}()':
                run(buffer, bold, depth > 0)
                buffer = ''
                if ch == '{':
                    if bold:
                        raise ValueError('Nested bold markers are unsupported')
                    bold = True
                elif ch == '}':
                    if not bold:
                        raise ValueError('Unmatched bold marker')
                    bold = False
                elif ch == '(':
                    depth += 1
                    run(ch, bold, True)
                else:
                    run(ch, bold, depth > 0)
                    depth = max(0, depth-1)
            else:
                buffer += ch
        run(buffer, bold, depth > 0)
        if bold:
            raise ValueError('Unclosed bold marker')
    # The initial paragraph owns the section/page definition. Retain its
    # control run when removing the unused initial text paragraph.
    first = doc.paragraphs[1]
    for child in list(initial.element):
        if child.xpath('.//*[local-name()="secPr"]'):
            if first.runs:
                child.set('charPrIDRef', str(first.runs[0].char_pr_id_ref))
            first.element.insert(0, child)
    initial.remove()
    doc.save_to_path(output)
    reopened = HwpxDocument.open(output)
    if reopened.text.plain() != doc.text.plain():
        raise RuntimeError('Saved text differs from generated text')
    if output.suffix.lower() == '.hwp' and output.read_bytes()[:8] != bytes.fromhex('d0cf11e0a1b11ae1'):
        raise RuntimeError('Output is not binary HWP')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', required=True, type=Path)
    parser.add_argument('--data', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        result = render(json.loads(args.template.read_text(encoding='utf-8')),
                        json.loads(args.data.read_text(encoding='utf-8')), args.output)
    except (ValueError, KeyError) as exc:
        parser.error(str(exc))
    print(result)


if __name__ == '__main__':
    main()
