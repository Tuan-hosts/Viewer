"""Index existing annotations and compute sparse, chromosome-wide display bounds.

Never edits source contacts or calls new peaks/loops. Run from the repository root.
"""
import bisect
import gzip
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np

SITE = Path(__file__).resolve().parents[1] / 'site'


def read_checked(entry):
    raw = (SITE / entry['file']).read_bytes()
    assert len(raw) == entry['bytes']
    assert hashlib.sha256(raw).hexdigest() == entry['sha256']
    return gzip.decompress(raw)


def sparse_percentile(positive, total, percentile):
    """NumPy's linear quantile with implicit supported zeros."""
    if not total:
        return 0.0
    zeros = total - len(positive)
    position = (total - 1) * percentile / 100
    left = int(np.floor(position))
    def at(index):
        return 0.0 if index < zeros else float(positive[index - zeros])
    return at(left) + (at(int(np.ceil(position))) - at(left)) * (position - left)


def contrast_bounds(raw):
    h = np.frombuffer(raw, '<u4', 8)
    _, _, n, pairs, k2, k4, q, length = map(int, h)
    assert h[0] == 0x48544731 and h[1] == 1
    support = np.frombuffer(raw, 'u1', n, 32).astype(bool)
    offset = ((32 + 2 * n + 3) // 4) * 4 + 4 * n * (k2 + k4)
    ptr = np.frombuffer(raw, '<u4', n + 1, offset)
    col = np.frombuffer(raw, '<u4', pairs, offset + 4 * (n + 1))
    counts = np.frombuffer(raw, '<u4', pairs, offset + 4 * (n + 1 + pairs))
    row = np.repeat(np.arange(n), np.diff(ptr))
    distance = col - row
    eligible = support[row] & support[col] & (distance > 1)
    positive = np.sort(counts[eligible & (distance <= 2_500_000 // (q * 1000))])
    # Count supported pair opportunities without constructing a dense chromosome.
    prefix = np.concatenate(([0], np.cumsum(support, dtype=np.int64)))
    positions = np.flatnonzero(support)
    ends = np.minimum(n, positions + 2_500_000 // (q * 1000) + 1)
    total = int(np.sum(prefix[ends] - prefix[positions + 1]))
    all_positive = np.sort(counts[eligible])
    result = {}
    for percentile in (98, 99):
        low = sparse_percentile(positive, total, 2)
        high = sparse_percentile(positive, total, percentile)
        fallback = None
        if high <= low:
            if len(all_positive):
                low, high = map(float, np.percentile(all_positive, [2, percentile]))
                fallback = 'positive-contact percentiles'
                if high <= low:
                    low, high = 0.0, float(all_positive[-1])
                    fallback = 'zero to maximum positive contact'
            else:
                low, high = 0.0, 1.0
                fallback = 'empty supported matrix'
        result[str(percentile)] = {'low': low, 'high': high, 'fallback': fallback}
    return {'supported_band_pairs': total, 'positive_band_pairs': len(positive), 'bounds': result}


def main():
    code = "const fs=require('fs'),vm=require('vm'),c={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.HITRAC_MANIFEST));"
    manifest = json.loads(subprocess.check_output(['node', '-e', code, str(SITE / 'data/manifest.js')]))
    loops_manifest = json.loads((SITE / 'loops-reprocessed/manifest.json').read_text())
    peaks_manifest = json.loads((SITE / 'tracks/peaks/manifest.json').read_text())
    assert loops_manifest['ready'] is True
    assert peaks_manifest['source_sha256'] == manifest['bw_sha256']
    annotations = {}
    for chromosome in manifest['chromosomes']:
        chrom = chromosome['chrom']
        loops = json.loads(read_checked(loops_manifest['packets'][chrom])) if chrom in loops_manifest['packets'] else []
        peaks = json.loads(read_checked(peaks_manifest['packets'][chrom])) if chrom in peaks_manifest['packets'] else []
        starts, ends = [p[0] for p in peaks], [p[1] for p in peaks]
        windows = {f"{w['start']}:{w['end']}": w for g in manifest['geometries'] for w in g['windows'] if w['chrom'] == chrom}
        annotations[chrom] = {}
        for key, window in windows.items():
            start, end = window['start'], window['end']
            loop_count = sum(b > start and a < end and d > start and c < end for a, b, c, d in loops)
            peak_count = bisect.bisect_left(starts, end) - bisect.bisect_right(ends, start)
            annotations[chrom][key] = [loop_count, peak_count]
    contrast = {}
    for key, packet in manifest['packets'].items():
        contrast[key] = contrast_bounds(read_checked(packet))
    output = {
        'version': 1, 'annotations': annotations, 'contrast': contrast,
        'loop_definition': 'At least one existing reconstructed-PET cLoops2 loop with both anchor intervals overlapping the full window; half-open coordinates.',
        'peak_definition': peaks_manifest['definition'], 'peak_threshold': peaks_manifest['threshold'],
        'stretch_definition': 'Hi-Compass-style clipping and linear rescaling to 0–100; chromosome-wide 2nd/98th or 99th percentiles in the (0, 2.5 Mb] band, including supported zeros. Main and adjacent diagonals set to zero. Degenerate bounds use positive-contact fallback.',
        'balance': 'Raw PET counts: the existing viewer packets do not contain ICE/KR balance weights.',
        'source_sha256': manifest['source_sha256'], 'bw_sha256': manifest['bw_sha256'],
        'loops_manifest_sha256': hashlib.sha256((SITE / 'loops-reprocessed/manifest.json').read_bytes()).hexdigest(),
        'peaks_manifest_sha256': hashlib.sha256((SITE / 'tracks/peaks/manifest.json').read_bytes()).hexdigest(),
        'source_code': 'https://github.com/EndeavourSyc/Hi-Compass/blob/main/hicompass/preprocess/hic_norm.py',
    }
    (SITE / 'viewer-features.json').write_text(json.dumps(output, separators=(',', ':')))
    print(json.dumps({'coordinate_windows': sum(map(len, annotations.values())), 'packets': len(contrast)}))


if __name__ == '__main__':
    main()
