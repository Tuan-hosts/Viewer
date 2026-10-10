"""Package the existing viewer into one HTML that can be opened directly.

Code and indices are embedded; checked public data packets load on demand.
No server or installation is required. All matrices retain their source hashes.
"""
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / 'site'

def script(text):
    return '<script>' + text.replace('</script', '<\\/script') + '</script>'

def main():
    output = Path(sys.argv[1])
    text = (SITE / 'index.html').read_text()
    text = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m:'<style>'+(SITE/m[1].split('?')[0]).read_text()+'</style>', text)
    indices = {p: json.loads((SITE / p).read_text()) for p in ['capacity/catalog.json', 'capacity/source.json', 'viewer-features.json']}
    worker = '\n'.join((SITE / p).read_text() for p in ['capacity-math.js','capacity-packet.js','comparison.js','map-profiles.js'])
    worker += '\n' + re.sub(r'^importScripts\([^\n]+\);\s*', '', (SITE / 'viewer-worker.js').read_text(), flags=re.M)
    state = {'targetRevision':1,'mode':'explore','trainingBounds':False,'showLoops':True,'window':'1kb_1Mb_chr3_13000000','method':'compass','formulation':'ratio','rawModel':'raw2','min':0,'max':100,'rawMax':11,'fitting':False,'loopsOnly':True,'peaksOnly':True,'contrastStretch':False,'stretchPercentile':99,'stretchTargets':False,'view':{'x':0,'y':0,'size':1000}}
    bootstrap = rf"""
    (()=>{{
      const indices={json.dumps(indices,separators=(',',':'))};
      const originalFetch=window.fetch.bind(window);
      window.fetch=(input,options)=>{{
        const path=String(input).replace(/^\.\//,'').split('?')[0];
        if(Object.hasOwn(indices,path))return Promise.resolve(new Response(JSON.stringify(indices[path]),{{headers:{{'Content-Type':'application/json'}}}}));
        const url=/^https?:/.test(String(input))?input:new URL(String(input),'https://tuan-hosts.github.io/Viewer/').href;
        return originalFetch(url,options);
      }};
      window.HITRAC_VIEWER_DEFAULT_STATE={json.dumps(state,separators=(',',':'))};
      window.HITRAC_VIEWER_WORKER_URL=URL.createObjectURL(new Blob([{json.dumps(worker)}],{{type:'application/javascript'}}));
    }})();
    """
    text = text.replace('<script src="data/manifest.js">',script(bootstrap)+'<script src="data/manifest.js">',1)
    text = re.sub(r'<script src="([^"]+)"></script>', lambda m:script((SITE / m[1].split('?')[0]).read_text()), text)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(text)
    print(json.dumps({'file':str(output),'bytes':output.stat().st_size}))

if __name__=='__main__':main()
