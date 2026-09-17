/* Exact native-pair comparisons. This function is also the isolated worker source. */
(function (root) {
  "use strict";
  function createEngine() {
    const OFF = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
    const clip = (x, l, h) => Math.min(h, Math.max(l, x));
    function stats(
      a,
      b,
      l = -Infinity,
      h = Infinity,
      region = null,
      grid = 0,
      boundsB = null,
    ) {
      let n = 0,
        ma = 0,
        mb = 0,
        aa = 0,
        bb = 0,
        ab = 0,
        sse = 0,
        unique = 0;
      // Center online to avoid subtracting two large, nearly identical moments
      // when clipping makes almost all values equal.
      const add = (k) => {
        unique++;
        if (!Number.isFinite(a[k]) || !Number.isFinite(b[k])) return;
        const x = clip(a[k], l, h),
          y = clip(b[k], boundsB ? boundsB[0] : l, boundsB ? boundsB[1] : h);
        n++;
        const da = x - ma,
          db = y - mb;
        ma += da / n;
        mb += db / n;
        aa += da * (x - ma);
        bb += db * (y - mb);
        ab += da * (y - mb);
        sse += (x - y) ** 2;
      };
      if (region) visitVisible(grid, region, add);
      else for (let k = 0; k < a.length; k++) add(k);
      return {
        n,
        unique_pairs: unique,
        pcc:
          n > 1 && aa > 0 && bb > 0
            ? Math.max(-1, Math.min(1, ab / Math.sqrt(aa * bb)))
            : null,
        mse: n ? sse / n : null,
      };
    }
    function direct(mat, v, m, i, j) {
      const seen = new Set();
      let B = 0,
        n = 0;
      for (const a of OFF)
        for (const b of OFF) {
          let x = i + a,
            y = j + b;
          if (x > y) [x, y] = [y, x];
          if (x < 0 || y >= m || !v[x] || !v[y] || (x === i && y === j))
            continue;
          const key = x * m + y;
          if (seen.has(key)) continue;
          seen.add(key);
          B += mat[key];
          n++;
        }
      return [B, n];
    }
    function visibleRegion(n, view) {
      if (!view) return { x0: 0, x1: n, y0: 0, y1: n };
      if (
        !["x", "y", "size"].every((k) => Number.isFinite(view[k])) ||
        view.size <= 0
      )
        throw Error("Invalid visible region");
      // Include every native bin intersecting the viewport, including partial edge bins.
      return {
        x0: clip(Math.floor(view.x), 0, n),
        x1: clip(Math.ceil(view.x + view.size), 0, n),
        y0: clip(Math.floor(view.y), 0, n),
        y1: clip(Math.ceil(view.y + view.size), 0, n),
      };
    }
    function visitVisible(n, r, add) {
      for (let y = r.y0; y < r.y1; y++)
        for (let x = r.x0; x < r.x1; x++) {
          // A symmetric pair visible in both triangles contributes only once.
          if (y > x && x >= r.y0 && x < r.y1 && y >= r.x0 && y < r.x1) continue;
          const i = Math.min(x, y),
            j = Math.max(x, y);
          add(i * n - (i * (i - 1)) / 2 + j - i);
        }
    }
    function visibleIndices(n, r) {
      const out = [];
      visitVisible(n, r, (k) => out.push(k));
      return out;
    }
    class Engine {
      init(map, ex, model, halo) {
        this.n = map.n;
        this.map = map;
        this.ex = ex;
        this.model = model;
        this.halo = halo;
        const n = map.n,
          m = n + 10,
          P = (n * (n + 1)) / 2;
        this.counts = new Uint32Array(m * m);
        this.support = new Uint8Array(m);
        this.support.set(map.v, 5);
        if (!halo) throw Error("Chromosome halo data are missing.");
        this.support.set(halo.support.slice(0, 5), 0);
        this.support.set(halo.support.slice(5), n + 5);
        for (let k = 0; k < map.index.length; k++) {
          const i = Math.floor(map.index[k] / n) + 5,
            j = (map.index[k] % n) + 5;
          this.counts[i * m + j] = this.counts[j * m + i] = map.counts[k];
        }
        for (let k = 0; k < halo.index.length; k++) {
          const i = Math.floor(halo.index[k] / m),
            j = halo.index[k] % m;
          this.counts[i * m + j] = this.counts[j * m + i] = halo.counts[k];
        }
        this.rawObserved = new Float32Array(P);
        this.rawBaseline = new Float32Array(P);
        this.common = new Uint8Array(P);
        let k = 0;
        for (let i = 0; i < n; i++)
          for (let j = i; j < n; j++, k++) {
            const good = map.v[i] && map.v[j] && ex.valid[i] && ex.valid[j];
            this.common[k] = good ? 1 : 0;
            this.rawObserved[k] = good
              ? Math.log1p(this.counts[(i + 5) * m + j + 5])
              : NaN;
            let b = model.beta[j - i];
            for (let z = 0; z < ex.k; z++)
              b +=
                model.gamma[j - i][z] *
                (ex.z[i * ex.k + z] + ex.z[j * ex.k + z]);
            this.rawBaseline[k] = good ? b : NaN;
          }
        this.raw = stats(this.rawObserved, this.rawBaseline);
        this.plbRaw = null;
        this.plbStable = null;
        this.a = null;
        this.b = null;
        return this.raw;
      }
      computePLB() {
        if (this.plbRaw) return;
        const n = this.n,
          m = n + 10,
          P = (n * (n + 1)) / 2,
          v = this.support,
          mat = this.counts;
        const row = new Float64Array(m * m),
          neigh = new Uint8Array(m);
        for (let i = 0; i < m; i++) {
          for (const d of OFF)
            if (i + d >= 0 && i + d < m && v[i + d]) neigh[i]++;
          if (!v[i]) continue;
          let s = 0;
          for (let t = 0; t <= Math.min(5, m - 1); t++)
            if (v[t]) s += mat[i * m + t];
          for (let j = 0; j < m; j++) {
            row[i * m + j] = s - (v[j] ? mat[i * m + j] : 0);
            if (j - 5 >= 0 && v[j - 5]) s -= mat[i * m + j - 5];
            if (j + 6 < m && v[j + 6]) s += mat[i * m + j + 6];
          }
        }
        this.plbRaw = new Float32Array(P);
        this.plbStable = new Float32Array(P);
        // Vertical rolling sums; store one canonical pair, including diagonal.
        for (let j = 0; j < n; j++) {
          const y = j + 5;
          let s = 0;
          for (let t = 0; t <= 10; t++) s += row[t * m + y];
          for (let i = 0; i <= j; i++) {
            const x = i + 5,
              k = i * n - (i * (i - 1)) / 2 + j - i;
            let B = s - row[x * m + y],
              den = neigh[x] * neigh[y];
            if (j - i <= 10) [B, den] = direct(mat, v, m, x, y);
            this.plbRaw[k] = den ? B / den : NaN;
            this.plbStable[k] = den ? Math.max(B, 1) / den : NaN;
            if (x - 5 >= 0) s -= row[(x - 5) * m + y];
            if (x + 6 < m) s += row[(x + 6) * m + y];
          }
        }
      }
      plbExtras() {
        this.computePLB();
        const n = this.n,
          nb = Math.ceil((n * n) / 8),
          noNeighbor = new Uint8Array(nb),
          floor = new Uint8Array(nb);
        const set = (a, i, j) => {
          let b = i * n + j;
          a[b >>> 3] |= 1 << (7 - (b & 7));
          b = j * n + i;
          a[b >>> 3] |= 1 << (7 - (b & 7));
        };
        let k = 0,
          plb_floor_pairs = 0,
          plb_undefined_pairs = 0;
        for (let i = 0; i < n; i++)
          for (let j = i; j < n; j++, k++) {
            const v = this.plbRaw[k],
              good = this.map.v[i] && this.map.v[j];
            if (!Number.isFinite(v)) {
              set(noNeighbor, i, j);
              if (good) plb_undefined_pairs++;
            } else if (v === 0) {
              set(floor, i, j);
              if (good) plb_floor_pairs++;
            }
          }
        const plb = new Float32Array(this.map.index.length),
          plbRaw = new Float32Array(plb.length);
        for (let p = 0; p < plb.length; p++) {
          const i = Math.floor(this.map.index[p] / n),
            j = this.map.index[p] % n,
            k = i * n - (i * (i - 1)) / 2 + j - i;
          const good = this.map.v[i] && this.map.v[j];
          plb[p] = good ? this.plbStable[k] : NaN;
          plbRaw[p] = good ? this.plbRaw[k] : NaN;
        }
        return {
          plb,
          plbRaw,
          noNeighbor,
          floor,
          plb_floor_pairs,
          plb_undefined_pairs,
        };
      }
      prepare(method, ratio, stable) {
        const n = this.n,
          m = n + 10,
          P = (n * (n + 1)) / 2;
        if (method === "plb") this.computePLB();
        const a = new Float32Array(P),
          b = this.rawBaseline,
          dense = new Float32Array(n * n);
        let k = 0,
          retainedZeros = 0,
          observedOnly = 0,
          baselineOnly = 0,
          min = Infinity,
          max = -Infinity;
        for (let i = 0; i < n; i++)
          for (let j = i; j < n; j++, k++) {
            let x = this.rawObserved[k],
              y = this.rawBaseline[k];
            if (this.common[k] && method !== "raw") {
              const e =
                method === "plb"
                  ? stable
                    ? this.plbStable[k]
                    : this.plbRaw[k]
                  : method === "window"
                    ? this.ex.windowE[j - i]
                    : this.model[method + "_expected"][j - i];
              // B already predicts ln(1 + PET counts). Only the observation is normalized.
              const O = this.counts[(i + 5) * m + j + 5];
              if (e === null || !Number.isFinite(e) || e < 0) {
                x = NaN;
              } else if (e === 0) {
                x = O === 0 ? NaN : Infinity;
              } else if (ratio) {
                x = Math.log(O / e);
              } else {
                x = Math.log1p(O / e);
              }
            }
            a[k] = x;
            dense[i * n + j] = dense[j * n + i] = y;
            if (Number.isFinite(a[k])) {
              min = Math.min(min, a[k]);
              max = Math.max(max, a[k]);
            }
            if (Number.isFinite(b[k])) {
              min = Math.min(min, b[k]);
              max = Math.max(max, b[k]);
            }
            if (
              Number.isFinite(x) &&
              Number.isFinite(y) &&
              this.counts[(i + 5) * m + j + 5] === 0
            )
              retainedZeros++;
            if (this.common[k] && Number.isFinite(x) && !Number.isFinite(y))
              observedOnly++;
            if (this.common[k] && !Number.isFinite(x) && Number.isFinite(y))
              baselineOnly++;
          }
        this.a = a;
        this.b = b;
        this.method = method;
        this.ratio = ratio;
        this.stable = stable;
        const uncut = stats(a, b);
        this.uncut = uncut;
        return {
          dense,
          raw: this.raw,
          uncut,
          retainedZeros,
          excluded: this.raw.n - uncut.n,
          observedOnly,
          baselineOnly,
          range: [
            Number.isFinite(min) ? min : 0,
            Number.isFinite(max) ? max : 1,
          ],
        };
      }
      clipped(lo, hi, view = null, display = null) {
        if (!this.a) throw Error("Comparison not ready");
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi)
          throw Error("Invalid clipping bounds");
        const region = visibleRegion(this.n, view),
          full =
            region.x0 === 0 &&
            region.y0 === 0 &&
            region.x1 === this.n &&
            region.y1 === this.n;
        const r = full ? null : region;
        const raw = full
          ? this.raw
          : stats(
              this.rawObserved,
              this.rawBaseline,
              -Infinity,
              Infinity,
              r,
              this.n,
            );
        const uncut = full
          ? this.uncut
          : stats(this.a, this.b, -Infinity, Infinity, r, this.n);
        const result = stats(this.a, this.b, lo, hi, r, this.n);
        let displayed = null;
        if (display) {
          const rm = display.raw_max,
            s = display.comparison_range;
          if (
            !Number.isFinite(rm) ||
            rm <= 0 ||
            !s ||
            s.length !== 2 ||
            !s.every(Number.isFinite) ||
            s[0] >= s[1]
          )
            throw Error("Invalid display bounds");
          // Match the renderer's finite-value clipping, then color saturation.
          // Positive affine color scaling leaves Pearson unchanged. Work on native
          // bins, avoiding screen sampling and color quantization altogether.
          const l = clip(lo, s[0], s[1]),
            h = clip(hi, s[0], s[1]);
          displayed = {
            raw_reference: stats(
              this.rawObserved,
              this.rawBaseline,
              0,
              rm,
              r,
              this.n,
              [l, h],
            ),
            processed:
              l === lo && h === hi
                ? result
                : stats(this.a, this.b, l, h, r, this.n),
            raw_bounds: [0, rm],
            comparison_bounds: [l, h],
            color_range: s,
            policy: "native_values_with_display_saturation_v1",
          };
        }
        return {
          ...result,
          min: lo,
          max: hi,
          region,
          full_window: full,
          visible_unique_pairs: result.unique_pairs,
          raw,
          uncut,
          displayed,
        };
      }
    }
    return { Engine, stats, direct, visibleRegion, visibleIndices };
  }
  const api = createEngine();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }
  root.HiTracComparison = {
    ...api,
    worker() {
      const source =
        "const API=(" +
        createEngine.toString() +
        ')();let engine;onmessage=e=>{const {id,type,args}=e.data;try{let result;if(type==="init"){engine=new API.Engine();result=engine.init(...args);}else result=engine[type](...args);postMessage({id,result},result&&result.dense?[result.dense.buffer]:[]);}catch(err){postMessage({id,error:err.message});}};';
      const url = URL.createObjectURL(
        new Blob([source], { type: "text/javascript" }),
      );
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      return worker;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
