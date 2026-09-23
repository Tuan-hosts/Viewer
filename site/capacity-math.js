(function(scope){
  function index(i,j,n){const a=Math.min(i,j),b=Math.max(i,j);return a*n-a*(a-1)/2+b-a;}
  function pcc(s){const [n,sy,sp,sy2,sp2,syp]=s, a=n*sy2-sy*sy,b=n*sp2-sp*sp;
    if(n<2||a<=Math.max(1e-12,Math.abs(n*sy2)*1e-12)||b<=Math.max(1e-12,Math.abs(n*sp2)*1e-12))return null;
    return Math.max(-1,Math.min(1,(n*syp-sy*sp)/Math.sqrt(a*b)));}
  function summarize(s,lo,hi){
    const count=s[0],mse=count?s[6]/count:null;
    const variance=count?Math.max(0,s[3]/count-(s[1]/count)**2):null;
    const rangeMse=mse!==null&&Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo?mse/(hi-lo)**2:null;
    return {pairs:count,pcc:pcc(s),mse,rmse:mse===null?null:Math.sqrt(mse),variance,
      normalizedMse:variance>1e-12?mse/variance:null,
      rangeNormalizedMse:rangeMse,rangeNormalizedRmse:rangeMse===null?null:Math.sqrt(rangeMse),
      bias:count?(s[2]-s[1])/count:null};
  }
  function add(s,a,b){s[0]++;s[1]+=a;s[2]+=b;s[3]+=a*a;s[4]+=b*b;s[5]+=a*b;s[6]+=(a-b)**2;}
  function metrics(data,view,lo,hi){
    const n=data.meta.window.grid,x0=Math.max(0,Math.floor(view.x)),y0=Math.max(0,Math.floor(view.y)),x1=Math.min(n,Math.ceil(view.x+view.size)),y1=Math.min(n,Math.ceil(view.y+view.size));
    const s=[0,0,0,0,0,0,0],d=[0,0,0,0,0,0,0],t=[0,0,0,0,0,0,0];let excluded=0;
    const lower=data.meta.arm?.clip_min,upper=data.meta.arm?.clip_max,hasTrainingBounds=Number.isFinite(lower)&&Number.isFinite(upper)&&upper>lower;
    const hasDisplayBounds=Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo;
    for(let i=y0;i<y1;i++)for(let j=x0;j<x1;j++){
      if(i>j&&j>=y0&&j<y1&&i>=x0&&i<x1)continue;
      const k=index(i,j,n);if(!data.valid[k]){excluded++;continue;}
      const a=data.target[k],b=data.prediction[k];if(!Number.isFinite(a)||!Number.isFinite(b)){excluded++;continue;}
      add(s,a,b);
      if(hasDisplayBounds)add(d,Math.max(lo,Math.min(hi,a)),Math.max(lo,Math.min(hi,b)));
      if(hasTrainingBounds)add(t,Math.max(lower,Math.min(upper,a)),Math.max(lower,Math.min(upper,b)));
    }
    const native=summarize(s),comparison=summarize(d,lo,hi),trainingClipped=summarize(t,lower,upper);
    return {...native,comparison,trainingClipped,clippedMse:trainingClipped.mse,
      rangeNormalizedMse:trainingClipped.rangeNormalizedMse,displayMse:comparison.mse,displayPcc:comparison.pcc,
      excluded,bins:{x0,x1,y0,y1}};
  }
  function baselineValues(model,features){
    const n=model.beta.length,k=model.gamma[0].length;
    if(features.length!==n||model.gamma.length!==n||features.some(x=>x.length!==k)||model.gamma.some(x=>x.length!==k))throw Error('Baseline geometry mismatch');
    const output=new Float32Array(n*(n+1)/2);let at=0;
    for(let i=0;i<n;i++)for(let j=i;j<n;j++){
      const d=j-i;let p=model.beta[d];for(let a=0;a<k;a++)p+=model.gamma[d][a]*(features[i][a]+features[j][a]);
      if(!Number.isFinite(p))throw Error('Nonfinite baseline prediction');output[at++]=p;
    }return output;
  }
  const api={index,pcc,metrics,baselineValues};if(typeof module!=='undefined')module.exports=api;else scope.CapacityMath=api;
})(typeof window!=='undefined'?window:this);
