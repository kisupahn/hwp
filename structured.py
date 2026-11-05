"""Structured table and chart export helpers."""
from io import BytesIO
from pathlib import Path


def chart_png(item):
    # In the browser, Canvas supplies a PNG using the user's local fonts.
    if '_chart_png' in item:
        import base64
        return base64.b64decode(item['_chart_png'], validate=True)
    from PIL import Image, ImageDraw, ImageFont
    image = Image.new('RGB', (1200, 660), 'white')
    draw = ImageDraw.Draw(image)
    candidates = [Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'),
                  Path('/usr/share/fonts/truetype/nanum/NanumGothic.ttf')]
    font_path = next((p for p in candidates if p.exists()), None)
    if font_path is None:
        raise ValueError('차트용 한글 글꼴이 없습니다. fonts-noto-cjk를 설치하세요.')
    font = ImageFont.truetype(str(font_path), 24)
    title_font = ImageFont.truetype(str(font_path), 32)
    draw.text((45, 20), item.get('title', ''), font=title_font, fill='#172B4D')
    points = item['points']
    ceiling = max((p['value'] for p in points), default=1) or 1
    bar_width = min(100, 950/len(points)*0.65)
    for tick in range(5):
        y = 520-tick*100
        draw.line((110, y, 1160, y), fill='#E2E8F0', width=2)
        draw.text((10, y-15), f'{ceiling*tick/4:g}', font=font, fill='#64748B')
    for i, point in enumerate(points):
        x = 135+i*1000/len(points)
        height = point['value']/ceiling*400
        if height:
            draw.rounded_rectangle((x, 520-height, x+bar_width, 520), radius=5, fill='#237B71')
        draw.text((x, 530), point['label'], font=font, fill='#334155')
        draw.text((x, max(75, 480-height)), f"{point['value']:g}", font=font, fill='#172B4D')
    draw.text((45, 610), item.get('unit', ''), font=font, fill='#64748B')
    data = BytesIO()
    image.save(data, format='PNG')
    return data.getvalue()


def append_structure(doc, item, font, size, width_mm):
    kind = item['type']
    if kind == 'chart':
        doc.add_picture(chart_png(item), 'png', width_mm=width_mm, height_mm=width_mm*0.55)
        return
    rows = [item['headers']] + item['rows']
    table = doc.add_table(len(rows), len(rows[0]), width=round(width_mm*7200/25.4),
                          height=round(len(rows)*10*7200/25.4))
    table.set_treat_as_char(True)
    for row, values in enumerate(rows):
        for col, value in enumerate(values):
            table.set_cell_text(row, col, str(value))
            table.set_cell_borders(row, col, color='#C8D5D2')
            if row == 0:
                table.set_cell_shading(row, col, '#E6F2EE')
            for paragraph in table.cell(row,col).paragraphs:
                for run in paragraph.runs:
                    run.char_pr_id_ref = doc.styles.ensure_run(font=font, size=min(size,12), bold=row==0)
