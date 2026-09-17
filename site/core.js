(function (root) {
  "use strict";
  function decode(buffer) {
    const h = new Uint32Array(buffer, 0, 4);
    if (h[0] !== 0x48544331 || h[1] !== 1) throw Error("Invalid map format");
    const n = h[2],
      p = h[3],
      off = 16 + Math.ceil(n / 4) * 4;
    if (buffer.byteLength !== off + 12 * p) throw Error("Map length mismatch");
    const v = new Uint8Array(buffer, 16, n),
      index = new Uint32Array(buffer, off, p),
      counts = new Uint32Array(buffer, off + 4 * p, p),
      logs = new Float32Array(buffer, off + 8 * p, p);
    const good = [];
    let mass = 0;
    for (let k = 0; k < p; k++) {
      const i = Math.floor(index[k] / n),
        j = index[k] % n;
      if (i > j || j >= n || !counts[k]) throw Error("Invalid canonical pair");
      if (k && index[k] <= index[k - 1]) throw Error("Non-unique pairs");
      if (v[i] && v[j]) {
        good.push(logs[k]);
        mass += counts[k];
      }
    }
    const supported = v.reduce((a, b) => a + b, 0),
      N = (supported * (supported + 1)) / 2;
    return {
      n,
      v,
      index,
      counts,
      logs,
      positive: Float32Array.from(good),
      N,
      zeros: N - good.length,
      mass,
    };
  }
  function impact(map, lo, hi) {
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi)
      throw Error("Minimum must be smaller than maximum.");
    let below = 0,
      above = 0,
      sse = 0,
      positiveChanged = 0;
    for (const t of map.positive) {
      const c = Math.min(hi, Math.max(lo, t));
      if (t < lo) below++;
      if (t > hi) above++;
      if (t !== c) positiveChanged++;
      sse += (c - t) ** 2;
    }
    if (0 < lo) below += map.zeros;
    if (0 > hi) above += map.zeros;
    sse += map.zeros * Math.min(hi, Math.max(lo, 0)) ** 2;
    return {
      below,
      above,
      changed: below + above,
      positiveChanged,
      mse: map.N ? sse / map.N : null,
    };
  }
  function lookup(map, i, j) {
    if (i > j) [i, j] = [j, i];
    if (i < 0 || j >= map.n) return null;
    const key = i * map.n + j;
    let l = 0,
      r = map.index.length;
    while (l < r) {
      const m = (l + r) >>> 1;
      if (map.index[m] < key) l = m + 1;
      else r = m;
    }
    const k = l < map.index.length && map.index[l] === key ? l : -1;
    return {
      supported: !!(map.v[i] && map.v[j]),
      count: k < 0 ? 0 : map.counts[k],
      value: k < 0 ? 0 : map.logs[k],
    };
  }
  const api = { decode, impact, lookup };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HiTracCore = api;
})(typeof window !== "undefined" ? window : globalThis);
