"""Build the standalone Pages editor. No Python runs on the deployed site."""
import argparse
import json
import shutil
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parent.parent

def build(output,api=''):
    output=Path(output).resolve()
    if output in (ROOT,ROOT/'web') or output in ROOT.parents:
        raise ValueError('Choose a dedicated build directory')
    output.mkdir(parents=True,exist_ok=True)
    assets=output/'assets'
    shutil.copytree(ROOT/'web',assets,dirs_exist_ok=True)
    shutil.copy2(ROOT/'web/index.html',output/'index.html')
    (assets/'index.html').unlink(missing_ok=True)
    (assets/'python').mkdir(exist_ok=True)
    for name in ['generate.py','structured.py']:
        shutil.copy2(ROOT/name,assets/'python'/name)
    api=api.rstrip('/')
    if api:
        u=urlparse(api)
        if u.scheme!='https' or not u.netloc or u.username or u.password or u.query or u.fragment:
            raise ValueError('API URL must be HTTPS without credentials')
    (assets/'config.js').write_text('window.STUDIO_API_BASE = '+json.dumps(api)+';\nwindow.STUDIO_LOCAL_EXPORT = '+('false' if api else 'true')+';\n')
    (output/'.nojekyll').touch()
    return output

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',default=str(ROOT/'site'))
    parser.add_argument('--api',default='')
    args=parser.parse_args()
    print(build(args.output,args.api))
