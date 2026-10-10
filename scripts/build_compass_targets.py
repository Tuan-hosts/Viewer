"""Compute Hi-Compass's balance=False target intervals from integer packets.

Sparse equivalent of process_chromosome: zero three diagonals; band p2/p99
including zeros; nonzero-chromosome fallback; linear clipping to 0..100.
The exported data cover cis contacts out to 4.1 Mb and contain no balance weights.
"""
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from build_viewer_features import SITE, read_checked, sparse_percentile


def bounds(raw):
    _, _, n, pairs, k2, k4, q, length = map(int, np.frombuffer(raw, '<u4', 8))
    offset = ((32 + 2*n + 3)//4)*4 + 4*n*(k2+k4)
    ptr = np.frombuffer(raw, '<u4', n+1, offset)
    col = np.frombuffer(raw, '<u4', pairs, offset+4*(n+1))
    counts = np.frombuffer(raw, '<u4', pairs, offset+4*(n+1+pairs))
    row = np.repeat(np.arange(n), np.diff(ptr))
    d = col-row
    band = min(n-1, 2_500_000//(q*1000))
    total = band*n-band*(band+1)//2
    positive = np.sort(counts[(d>1)&(d<=band)])
    low, high = [sparse_percentile(positive, total, p) for p in (2,99)]
    fallback = None
    if not high>low:
        nz = counts[d>1]
        if len(nz):
            low, high = map(float, np.percentile(nz, [2,99]))
            fallback = 'nonzero chromosome percentiles'
            if not high>low:
                low, high = 0., float(nz.max())
                fallback = 'zero to maximum'
        else:
            low, high, fallback = 0., 1., 'empty chromosome'
    return {'low':low, 'high':high, 'fallback':fallback, 'band_pairs':int(total),
            'max_exported_distance_bp':int(d.max(initial=0)*q*1000)}


def main():
    js="const fs=require('fs'),vm=require('vm'),c={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.HITRAC_MANIFEST));"
    manifest=json.loads(subprocess.check_output(['node','-e',js,str(SITE/'data/manifest.js')]))
    path=SITE/'viewer-features.json'
    index=json.loads(path.read_text())
    index['compass']={key:bounds(read_checked(p)) for key,p in manifest['packets'].items()}
    index['compass_definition']={'balance':False,'percentile_method':'band','band_bp':2500000,
        'percentile_min':2,'percentile_max':99,'target_scale':100,'log_transform':False,
        'source':'https://github.com/EndeavourSyc/Hi-Compass/blob/main/hicompass/preprocess/hic_norm.py',
        'input_scope':'Available exported cis PET counts, up to 4.1 Mb; no balancing weights.'}
    path.write_text(json.dumps(index,separators=(',',':')))
    print(json.dumps({'packets':len(index['compass']),'chr3_1kb':index['compass']['chr3_1kb']}))


if __name__=='__main__':
    main()
