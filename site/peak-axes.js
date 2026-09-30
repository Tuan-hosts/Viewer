(function(root) {
  'use strict';
  // Display-only intervals from the same K562.bw. Never enter map values or metrics.
  let manifest;
  const cache = new Map();
  async function load(record, signal) {
    if (!manifest) {
      const response = await fetch('tracks/peaks/manifest.json', {signal});
      if (!response.ok) throw Error('DNase peak index unavailable');
      const value = await response.json();
      if (value.source_sha256 !== root.HITRAC_EXTENSION.bw_sha256)
        throw Error('DNase peak source mismatch');
      manifest = value;
    }
    const entry = manifest.packets[record.chrom];
    if (!entry) return [];
    if (cache.has(record.chrom)) return cache.get(record.chrom);
    const response = await fetch(entry.file, {signal});
    if (!response.ok) throw Error('DNase peak intervals unavailable');
    const bytes = await response.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      v => v.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== entry.bytes || hash !== entry.sha256)
      throw Error('DNase peak interval checksum failed');
    const text = await new Response(new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('gzip'))).text();
    const intervals = JSON.parse(text);
    if (intervals.length !== entry.intervals) throw Error('DNase peak interval count mismatch');
    let end = -1;
    for (const pair of intervals) {
      if (!Array.isArray(pair) || pair.length !== 2 ||
          !Number.isInteger(pair[0]) || !Number.isInteger(pair[1]) ||
          pair[0] < 0 || pair[0] < end || pair[1] <= pair[0] || pair[1] > entry.length)
        throw Error('Invalid DNase peak coordinates');
      end = pair[1];
    }
    cache.set(record.chrom, intervals);
    while (cache.size > 2) cache.delete(cache.keys().next().value);
    return intervals;
  }
  function segments(intervals, start, end, pixels) {
    if (!(end > start) || !(pixels > 0)) return [];
    // Find the first interval whose end extends beyond the visible left edge.
    let lo = 0, hi = intervals.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (intervals[mid][1] <= start) lo = mid + 1; else hi = mid;
    }
    const out = [], scale = pixels / (end - start);
    for (let i = lo; i < intervals.length && intervals[i][0] < end; i++) {
      const a = Math.max(start, intervals[i][0]), b = Math.min(end, intervals[i][1]);
      if (b > a) out.push([(a - start) * scale, (b - a) * scale]);
    }
    return out;
  }
  function draw(ctx, intervals, record, view, plot) {
    if (!intervals?.length) return;
    const span = view.size * record.bin_bp;
    const x = record.start + view.x * record.bin_bp;
    const y = record.start + view.y * record.bin_bp;
    // A narrow peak must remain visible in a whole-window overview. Rasterize
    // outward to display pixels; genomic interval boundaries remain unchanged.
    const pixel = ctx.canvas?.clientWidth ? ctx.canvas.width / ctx.canvas.clientWidth : 1;
    const raster = (offset, width) => {
      const a = Math.max(0, Math.floor(offset / pixel) * pixel);
      return [a, Math.min(plot.size, Math.ceil((offset + width) / pixel) * pixel) - a];
    };
    ctx.save();
    ctx.fillStyle = '#187f88';
    for (const segment of segments(intervals, x, x + span, plot.size)) {
      const [offset, width] = raster(...segment);
      ctx.fillRect(plot.x + offset, plot.y - 11, width, 6);
    }
    for (const segment of segments(intervals, y, y + span, plot.size)) {
      const [offset, height] = raster(...segment);
      ctx.fillRect(plot.x - 9, plot.y + offset, 6, height);
    }
    ctx.restore();
  }
  const api = {load, segments, draw};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeakAxes = api;
})(typeof window !== 'undefined' ? window : globalThis);
