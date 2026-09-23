(function(root) {
  'use strict';
  const clip=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  function finish(sums,counts) {
    const values=new Float64Array(sums.length);
    for(let i=0;i<values.length;i++)values[i]=counts[i]?sums[i]/counts[i]:NaN;
    return {values,counts};
  }
  function rawProfile(map,rawMax) {
    const sums=new Float64Array(map.n),counts=new Uint32Array(map.n);
    const partners=map.v.reduce((a,b)=>a+b,0);
    for(let i=0;i<map.n;i++)counts[i]=map.v[i]?partners:0;
    for(let k=0;k<map.index.length;k++) {
      const i=Math.floor(map.index[k]/map.n),j=map.index[k]%map.n;
      if(!map.v[i]||!map.v[j])continue;
      const value=clip(map.logs[k],0,rawMax);
      sums[i]+=value;if(i!==j)sums[j]+=value;
    }
    return finish(sums,counts);
  }
  function compute(data,raw,lo,hi,rawMax) {
    if(!(Number.isFinite(lo)&&Number.isFinite(hi)&&lo<hi&&rawMax>0))throw Error('Invalid profile clipping bounds');
    const n=data.meta.window.grid,keys=['target','baseline',...(data.prediction?['prediction']:[])];
    const sums=Object.fromEntries(keys.map(k=>[k,new Float64Array(n)])),counts=new Uint32Array(n);
    let at=0;
    for(let i=0;i<n;i++)for(let j=i;j<n;j++,at++) {
      if(!data.valid[at])continue;
      let y=data.target[at];if(data.exploreRatio&&y===-Infinity)y=lo;
      if(!Number.isFinite(y)||!Number.isFinite(data.baseline[at])||(data.prediction&&!Number.isFinite(data.prediction[at])))continue;
      counts[i]++;if(i!==j)counts[j]++;
      for(const key of keys) {
        const v=clip(key==='target'?y:data[key][at],lo,hi);
        sums[key][i]+=v;if(i!==j)sums[key][j]+=v;
      }
    }
    const out={raw:rawProfile(raw,rawMax),overlay:!!data.scoreBaseline,clip:[lo,hi],rawMax};
    for(const key of keys)out[key]=finish(sums[key],counts);
    return out;
  }
  function correlation(a,b,start=0,end=a.length) {
    let n=0,ma=0,mb=0,aa=0,bb=0,ab=0;
    for(let i=Math.max(0,Math.floor(start));i<Math.min(a.length,Math.ceil(end));i++){
      if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))continue;
      n++;const da=a[i]-ma,db=b[i]-mb;ma+=da/n;mb+=db/n;
      aa+=da*(a[i]-ma);bb+=db*(b[i]-mb);ab+=da*(b[i]-mb);
    }
    return n>1&&aa>1e-20&&bb>1e-20?Math.max(-1,Math.min(1,ab/Math.sqrt(aa*bb))):null;
  }
  const api={compute,rawProfile,correlation};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MapProfiles=api;
})(typeof self!=='undefined'?self:globalThis);
