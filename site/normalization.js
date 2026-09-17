(function (root) {
  "use strict";
  const methods = {
    raw: "No normalization",
    observed: "Shared observed distance",
    shuffled: "Shuffled endpoints",
    plb: "Local PLB adaptation",
    window: "Within-window distance",
  };
  function decodeExtra(buffer) {
    const h = new Uint32Array(buffer, 0, 6);
    if (h[0] !== 0x48544532 || h[1] !== 2)
      throw Error("Invalid extension format");
    const n = h[2],
      p = h[3],
      k = h[4],
      nb = h[5];
    let off = 24 + Math.ceil(n / 4) * 4;
    const valid = new Uint8Array(buffer, 24, n);
    function take(Type, length) {
      const x = new Type(buffer, off, length);
      off += Type.BYTES_PER_ELEMENT * length;
      return x;
    }
    const z = take(Float32Array, n * k),
      plb = take(Float32Array, p),
      plbRaw = take(Float32Array, p),
      windowE = take(Float32Array, n),
      opportunities = take(Uint32Array, n),
      noNeighbor = take(Uint8Array, nb),
      floor = take(Uint8Array, nb);
    if (off !== buffer.byteLength) throw Error("Extension length mismatch");
    return {
      n,
      p,
      k,
      valid,
      z,
      plb,
      plbRaw,
      windowE,
      opportunities,
      noNeighbor,
      floor,
    };
  }
  function bit(a, k) {
    return (a[k >>> 3] >> (7 - (k & 7))) & 1;
  }
  function expectation(map, ex, model, method, stable, i, j, index) {
    if (i > j) [i, j] = [j, i];
    const d = j - i;
    if (method === "raw") return null;
    if (method === "observed")
      return model.observed_expected[d] === null
        ? NaN
        : model.observed_expected[d];
    if (method === "shuffled")
      return model.shuffled_expected[d] === null
        ? NaN
        : model.shuffled_expected[d];
    if (method === "window") return ex.windowE[d];
    if (index >= 0) return (stable ? ex.plb : ex.plbRaw)[index];
    return bit(ex.noNeighbor, i * map.n + j)
      ? NaN
      : !stable && bit(ex.floor, i * map.n + j)
        ? 0
        : 1;
  }
  function transform(count, e, ratio, raw = false) {
    if (raw) return Math.log1p(count);
    if (!Number.isFinite(e) || e < 0) return NaN;
    if (e === 0) return count === 0 ? NaN : Infinity;
    return ratio ? Math.log(count / e) : Math.log1p(count / e);
  }
  function normalize(
    map,
    ex,
    model,
    method,
    ratio = false,
    stable = true,
    record = {},
  ) {
    const raw = method === "raw",
      values = new Float32Array(map.index.length),
      positive = [],
      n = map.n;
    let undef = 0,
      posInf = 0,
      negInf = 0,
      zeroInvalid = 0;
    if (!raw) {
      if (method === "plb") {
        zeroInvalid =
          record.plb_undefined_pairs + (stable ? 0 : record.plb_floor_pairs);
      } else {
        const curve =
          method === "observed"
            ? model.observed_expected
            : method === "shuffled"
              ? model.shuffled_expected
              : ex.windowE;
        for (let d = 0; d < n; d++)
          if (curve[d] === null || !Number.isFinite(curve[d]) || curve[d] <= 0)
            zeroInvalid += ex.opportunities[d];
      }
    }
    let invalidPositive = 0;
    for (let k = 0; k < values.length; k++) {
      const i = Math.floor(map.index[k] / n),
        j = map.index[k] % n;
      if (!map.v[i] || !map.v[j]) {
        values[k] = NaN;
        continue;
      }
      const e = expectation(map, ex, model, method, stable, i, j, k),
        v = transform(map.counts[k], e, ratio, raw);
      values[k] = v;
      if (Number.isFinite(v)) positive.push(values[k]);
      else {
        invalidPositive++;
        if (v === Infinity) posInf++;
        else if (v === -Infinity) negInf++;
        else undef++;
      }
    }
    const invalidZeros = zeroInvalid - invalidPositive;
    if (invalidZeros < 0) throw Error("Expectation accounting mismatch");
    undef += invalidZeros;
    const finiteZeros = raw || !ratio ? map.zeros - invalidZeros : 0;
    if (!raw && ratio) negInf += map.zeros - invalidZeros;
    const finite = Float32Array.from(positive),
      N = finite.length + finiteZeros;
    let min = finiteZeros ? 0 : Infinity,
      max = finiteZeros ? 0 : -Infinity;
    for (const x of finite) {
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    if (N + undef + posInf + negInf !== map.N)
      throw Error("Nonfinite category accounting failed");
    return {
      method,
      ratio: raw ? false : ratio,
      stable,
      values,
      positive: finite,
      zeros: finiteZeros,
      N,
      allN: map.N,
      undefined: undef,
      posInf,
      negInf,
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
    };
  }
  function denseObserved(map) {
    const out = new Float32Array(map.n * map.n);
    for (let k = 0; k < map.index.length; k++) {
      const i = Math.floor(map.index[k] / map.n),
        j = map.index[k] % map.n;
      out[i * map.n + j] = out[j * map.n + i] = map.logs[k];
    }
    return out;
  }
  function denseNormalized(map, ex, model, norm) {
    const n = map.n,
      out = new Float32Array(n * n);
    if (norm.ratio) out.fill(-Infinity);
    if (norm.method !== "raw") {
      if (norm.method === "plb") {
        for (let k = 0; k < out.length; k++)
          if (bit(ex.noNeighbor, k) || (!norm.stable && bit(ex.floor, k)))
            out[k] = NaN;
      } else {
        const curve =
          norm.method === "observed"
            ? model.observed_expected
            : norm.method === "shuffled"
              ? model.shuffled_expected
              : ex.windowE;
        for (let d = 0; d < n; d++)
          if (curve[d] === null || !Number.isFinite(curve[d]) || curve[d] <= 0)
            for (let i = 0; i < n - d; i++)
              out[i * n + i + d] = out[(i + d) * n + i] = NaN;
      }
    }
    for (let k = 0; k < map.index.length; k++) {
      const i = Math.floor(map.index[k] / n),
        j = map.index[k] % n;
      out[i * n + j] = out[j * n + i] = norm.values[k];
    }
    return out;
  }
  function baselineValue(ex, model, i, j) {
    if (!ex.valid[i] || !ex.valid[j]) return NaN;
    const d = Math.abs(j - i);
    let value = model.beta[d];
    for (let k = 0; k < ex.k; k++)
      value += model.gamma[d][k] * (ex.z[i * ex.k + k] + ex.z[j * ex.k + k]);
    return value;
  }
  function denseBaseline(ex, model) {
    const n = ex.n,
      out = new Float32Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = i; j < n; j++) {
        const x = baselineValue(ex, model, i, j);
        out[i * n + j] = out[j * n + i] = x;
      }
    return out;
  }
  function valueAt(map, norm, i, j) {
    if (i > j) [i, j] = [j, i];
    const key = i * map.n + j;
    let a = 0,
      b = map.index.length;
    while (a < b) {
      const m = (a + b) >>> 1;
      if (map.index[m] < key) a = m + 1;
      else b = m;
    }
    return a < map.index.length && map.index[a] === key ? norm.values[a] : null;
  }
  const api = {
    methods,
    decodeExtra,
    bit,
    expectation,
    transform,
    normalize,
    denseObserved,
    denseNormalized,
    baselineValue,
    denseBaseline,
    valueAt,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HiTracNorm = api;
})(typeof window !== "undefined" ? window : globalThis);
