(function (root) {
  "use strict";
  function decodeGenome(buffer) {
    const h = new Uint32Array(buffer, 0, 8);
    if (h[0] !== 0x48544731 || h[1] !== 1)
      throw Error("Invalid chromosome data format");
    const [n, p, k2, k4, q, length] = Array.from(h).slice(2);
    let off = 32;
    const support = new Uint8Array(buffer, off, n);
    off += n;
    const valid = new Uint8Array(buffer, off, n);
    off += n;
    off = Math.ceil(off / 4) * 4;
    function take(Type, size) {
      const a = new Type(buffer, off, size);
      off += a.byteLength;
      return a;
    }
    const z2 = take(Float32Array, n * k2),
      z4 = take(Float32Array, n * k4),
      ptr = take(Uint32Array, n + 1),
      col = take(Uint32Array, p),
      counts = take(Uint32Array, p);
    if (
      off !== buffer.byteLength ||
      ptr[0] !== 0 ||
      ptr[n] !== p ||
      Math.ceil(length / (q * 1000)) !== n
    )
      throw Error("Chromosome data length mismatch");
    for (let i = 0; i < n; i++) {
      if (support[i] > 1 || valid[i] > support[i] || ptr[i] > ptr[i + 1])
        throw Error("Invalid chromosome support/rows");
      for (let k = ptr[i]; k < ptr[i + 1]; k++)
        if (
          col[k] < i ||
          col[k] >= n ||
          counts[k] === 0 ||
          (k > ptr[i] && col[k] <= col[k - 1])
        )
          throw Error("Invalid canonical chromosome counts");
    }
    return {
      n,
      p,
      k2,
      k4,
      q,
      length,
      support,
      valid,
      z2,
      z4,
      ptr,
      col,
      counts,
    };
  }
  function windowData(c, r, groups) {
    const n = r.grid,
      s = r.start / r.bin_bp,
      end = s + n;
    if (s !== Math.floor(s) || end > c.n || r.bin_bp !== c.q * 1000)
      throw Error("Window does not match chromosome grid");
    const ids = [],
      counts = [],
      logs = [],
      positive = [];
    const v = c.support.slice(s, end),
      valid = c.valid.slice(s, end);
    let mass = 0,
      all = 0,
      diag = 0;
    for (let i = s; i < end; i++)
      for (let k = c.ptr[i]; k < c.ptr[i + 1] && c.col[k] < end; k++) {
        const j = c.col[k],
          t = c.counts[k],
          value = Math.fround(Math.log1p(t));
        ids.push((i - s) * n + j - s);
        counts.push(t);
        logs.push(value);
        all += t;
        if (v[i - s] && v[j - s]) {
          mass += t;
          positive.push(value);
          if (i === j) diag += t;
        }
      }
    const index = Uint32Array.from(ids),
      cv = Uint32Array.from(counts),
      lv = Float32Array.from(logs),
      supported = v.reduce((a, b) => a + b, 0),
      N = (supported * (supported + 1)) / 2;
    if (
      N !== r.supported_pairs ||
      mass !== r.PETs ||
      all !== r.all_PETs ||
      diag !== r.diagonal_PETs ||
      positive.length !== r.nonzero_pairs
    )
      throw Error("Window count conservation check failed");
    const map = {
      n,
      v,
      index,
      counts: cv,
      logs: lv,
      positive: Float32Array.from(positive),
      N,
      zeros: N - positive.length,
      mass,
    };
    const use4 = r.end - r.start === 4000000,
      k = use4 ? c.k4 : c.k2,
      z = (use4 ? c.z4 : c.z2).slice(s * k, end * k);
    const opportunities = new Uint32Array(n),
      byDistance = new Float64Array(n);
    for (let i = 0; i < n; i++)
      if (v[i]) for (let j = i; j < n; j++) if (v[j]) opportunities[j - i]++;
    for (let p = 0; p < index.length; p++) {
      const i = Math.floor(index[p] / n),
        j = index[p] % n;
      if (v[i] && v[j]) byDistance[j - i] += cv[p];
    }
    const windowE = new Float32Array(n);
    windowE.fill(NaN);
    for (let t = 0; t < groups.length - 1; t++) {
      const l = groups[t],
        h = groups[t + 1];
      let den = 0,
        sum = 0;
      for (let d = l; d < h; d++) {
        den += opportunities[d];
        sum += byDistance[d];
      }
      if (den) windowE.fill(sum / den, l, h);
    }
    const extra = {
      n,
      p: index.length,
      k,
      valid,
      z,
      windowE,
      opportunities,
      plb: null,
      plbRaw: null,
      noNeighbor: null,
      floor: null,
    };
    const m = n + 10,
      low = s - 5,
      hs = new Uint8Array(10),
      hi = [],
      hc = [];
    for (let t = 0; t < 5; t++) {
      if (s - 5 + t >= 0) hs[t] = c.support[s - 5 + t];
      if (end + t < c.n) hs[t + 5] = c.support[end + t];
    }
    for (let i = Math.max(0, low); i < Math.min(c.n, end + 5); i++)
      for (let p = c.ptr[i]; p < c.ptr[i + 1] && c.col[p] < end + 5; p++) {
        const j = c.col[p];
        if (i >= s && j < end) continue;
        hi.push((i - low) * m + j - low);
        hc.push(c.counts[p]);
      }
    const halo = {
      support: hs,
      index: Uint32Array.from(hi),
      counts: Uint32Array.from(hc),
    };
    return { map, extra, halo };
  }
  const cache = new Map(),
    pending = new Map();
  async function loadPacket(rec) {
    if (cache.has(rec.file)) return cache.get(rec.file);
    if (pending.has(rec.file)) return pending.get(rec.file);
    const task = (async () => {
      try {
        const response = await fetch(rec.file, { credentials: "same-origin" });
        if (!response.ok)
          throw Error(
            "Could not load chromosome data. Check your connection and try again.",
          );
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== rec.bytes)
          throw Error("Incomplete chromosome download");
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
        if (hash !== rec.sha256)
          throw Error("Chromosome checksum failed; reload to retry.");
        const buffer = await new Response(
          new Blob([bytes])
            .stream()
            .pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer();
        if (buffer.byteLength !== rec.uncompressed_bytes)
          throw Error("Chromosome decompression length mismatch");
        const result = decodeGenome(buffer);
        cache.set(rec.file, result);
        while (cache.size > 2) cache.delete(cache.keys().next().value);
        return result;
      } finally {
        pending.delete(rec.file);
      }
    })();
    pending.set(rec.file, task);
    return task;
  }
  const api = { decodeGenome, windowData, loadPacket };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HiTracGenome = api;
})(typeof window !== "undefined" ? window : globalThis);
