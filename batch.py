"""Generate multiple reports from one reusable JSON template."""
import argparse
import json
from pathlib import Path
from generate import render


def generate_batch(template_path, records_path, output_dir):
    template = json.loads(Path(template_path).read_text(encoding='utf-8'))
    records = json.loads(Path(records_path).read_text(encoding='utf-8'))
    if not isinstance(records, list) or not records:
        raise ValueError('Records must be a nonempty list')
    names = []
    for record in records:
        name = record['filename']
        if not isinstance(name, str) or not name or name in ('.', '..') or any(c in name for c in '/\\:\x00'):
            raise ValueError('Invalid filename')
        if name.casefold() in names:
            raise ValueError('Duplicate filename: ' + name)
        names.append(name.casefold())
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for record in records:
        for extension in ('hwp', 'hwpx'):
            result = render(template, record['values'], output_dir/(record['filename']+'.'+extension))
            results.append(str(result))
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', required=True)
    parser.add_argument('--records', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    for result in generate_batch(args.template, args.records, args.output_dir):
        print(result)
