(function(root) {
  'use strict';
  function annotation(index, record) {
    return index.annotations[record.chrom]?.[`${record.start}:${record.end}`] || null;
  }
  function allows(index, record, loopsOnly, peaksOnly) {
    const counts = annotation(index, record);
    if (!counts) throw Error('Window annotations are unavailable. Turn off filters or reload.');
    return (!loopsOnly || counts[0] > 0) && (!peaksOnly || counts[1] > 0);
  }
  function percentile(sorted, p) {
    if (!sorted.length) return NaN;
    const at = (sorted.length - 1) * p / 100, low = Math.floor(at), high = Math.ceil(at);
    return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
  }
  function targetBounds(values, support, n, upper) {
    const selected = new Float32Array(values.length);
    let count = 0, k = 0;
    for (let i=0;i<n;i++) for (let j=i;j<n;j++,k++) {
      if (j-i > 1 && support[k] && Number.isFinite(values[k])) selected[count++] = values[k];
    }
    const sorted = selected.subarray(0, count).sort();
    let low = percentile(sorted, 2), high = percentile(sorted, upper), fallback = null;
    if (!(high > low)) {
      low = sorted[0]; high = sorted[count-1]; fallback = 'target range';
    }
    if (!(high > low)) { low = Number.isFinite(low) ? low : 0; high = low + 1; fallback = 'constant or empty target'; }
    return {low, high, kind:'target', fallback};
  }
  function stretch(value, spec, excluded=false) {
    if (excluded) return 0;
    if (spec.kind === 'counts' && Number.isFinite(value)) value = Math.max(0, Math.expm1(value));
    if (Number.isNaN(value)) return NaN;
    return 100 * Math.max(0, Math.min(1, (value - spec.low) / (spec.high - spec.low)));
  }
  function compassTarget(map, spec) {
    if (!(Number.isFinite(spec.low) && Number.isFinite(spec.high) && spec.high > spec.low)) throw Error('Invalid Hi-Compass normalization interval');
    const n=map.n, size=n*(n+1)/2, target=new Float32Array(size), valid=new Uint8Array(size);
    const index=(i,j)=>i*n-i*(i-1)/2+j-i;
    // Work directly from canonical integer PET counts. No log or O/E step.
    for(let i=0;i<n;i++) for(let j=i+2;j<n;j++) valid[index(i,j)]=map.v[i]&&map.v[j]?1:0;
    for(let k=0;k<map.index.length;k++) {
      const i=Math.floor(map.index[k]/n),j=map.index[k]%n,t=index(i,j);
      if(j-i>1) target[t]=100*Math.max(0,Math.min(1,(map.counts[k]-spec.low)/(spec.high-spec.low)));
    }
    return {target,valid};
  }
  function publishedProfiles(data, n, rawMax) {
    const rs=new Float64Array(n),ts=new Float64Array(n),rc=new Uint32Array(n),tc=new Uint32Array(n);
    let k=0;
    for(let i=0;i<n;i++)for(let j=i;j<n;j++,k++){
      if(data.rawSupport[k]){
        const value=Math.min(rawMax,data.rawCounts[k]);rs[i]+=value;rc[i]++;
        if(i!==j){rs[j]+=value;rc[j]++;}
      }
      if(data.valid[k]){ts[i]+=data.target[k];tc[i]++;if(i!==j){ts[j]+=data.target[k];tc[j]++;}}
    }
    const finish=(s,c)=>({values:Float64Array.from(s,(v,i)=>c[i]?v/c[i]:NaN),counts:c});
    return {raw:finish(rs,rc),target:finish(ts,tc),clip:[data.low,data.high],rawMax,overlay:false};
  }
  const api = {annotation, allows, percentile, targetBounds, stretch, compassTarget, publishedProfiles};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ViewerFeatures = api;
})(typeof window !== 'undefined' ? window : globalThis);
