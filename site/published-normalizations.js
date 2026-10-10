(function(root){
 'use strict';
 const methods=new Set(['compass','evo2hic','hicfoundation']);
 const imageNet={mean:[.485,.456,.406],std:[.229,.224,.225]};
 function evo2Value(x,denominator=10,maxReads=5000){
  if(!(denominator>1&&maxReads>denominator&&Number.isFinite(denominator)&&Number.isFinite(maxReads)))throw Error('Evo2HiC requires max reads > denominator > 1.');
  const scale=Math.log(maxReads/denominator),step=Math.log(denominator)/(denominator-1)/scale;
  return Math.min(1,x<denominator?(x-denominator)*step:Math.log(x/denominator+1e-5)/scale);
 }
 function foundationRGB(q,standardized=false){
  const rgb=[1,1-q,1-q];return standardized?rgb.map((x,c)=>(x-imageNet.mean[c])/imageNet.std[c]):rgb;
 }
 function makeTarget(method,map,compassSpec,options={}){
  if(method==='compass'){
   const out=root.ViewerFeatures.compassTarget(map,compassSpec),a=compassSpec.low,b=compassSpec.high;
   return {...out,low:0,high:100,title:'Hi-Compass · contrast-stretched training target',
    caption:`PET ${a}–${b} stretched to 0–100 · chromosome p2/p99${compassSpec.fallback?' (nonzero fallback)':''} · balance=False`,
    notice:`Contrast stretch: Y = 100 × (PET − ${a}) / (${b} − ${a}), with endpoints 0 and 100. ${a} PET → 0; ${(a+b)/2} PET → 50; ${b} PET → 100. No log or O/E. Main and adjacent diagonals are zero. Uses Hi-Compass’s balance=False option; these exports have no balancing weights and cover cis contacts up to 4.1 Mb.`};
  }
  if(!methods.has(method))throw Error('Unknown published normalization');
  const n=map.n,size=n*(n+1)/2,target=new Float32Array(size),valid=new Uint8Array(size);
  const index=(i,j)=>i*n-i*(i-1)/2+j-i;
  let at=0;for(let i=0;i<n;i++)for(let j=i;j<n;j++,at++)valid[at]=map.v[i]&&map.v[j]?1:0;
  if(method==='evo2hic'){
   const denominator=options.denominator??10,maxReads=options.maxReads??5000,low=evo2Value(0,denominator,maxReads);
   target.fill(low);
   for(let k=0;k<map.index.length;k++){
    const i=Math.floor(map.index[k]/n),j=map.index[k]%n;target[index(i,j)]=evo2Value(map.counts[k],denominator,maxReads);
   }
   return {target,valid,low,high:1,title:'Evo2HiC · mixed training target',
    caption:`Raw-count branch · denominator ${denominator} · max reads ${maxReads} · no diagonal removal`,
    notice:`Evo2HiC mixed transform: below ${denominator} counts, Y = (PET − ${denominator}) × step; otherwise Y = ln(PET/${denominator} + 0.00001) / ln(${maxReads}/${denominator}). step = ln(${denominator}) / ((${denominator} − 1) × ln(${maxReads}/${denominator})). The dataset caps Y at 1. Zeros map to ${low.toFixed(6)}. This reproduces the default raw-count target path; no SCALE/KR weights or library-depth rescaling are added. Parameters are checkpoint-dependent; these are the CLI defaults.`};
  }
  const task=options.foundationTask||'finetune';
  if(!['finetune','loops','enhance100','enhanceMax','singlecell'].includes(task))throw Error('Unknown HiCFoundation preprocessing task');
  const cutoff=task==='loops'?1000:['enhance100','singlecell'].includes(task)?100:null;
  const zeroDiagonal=['enhance100','enhanceMax'].includes(task);
  let maximum=cutoff??0;
  if(cutoff===null)for(let k=0;k<map.index.length;k++){
   const i=Math.floor(map.index[k]/n),j=map.index[k]%n;
   if(!zeroDiagonal||i!==j)maximum=Math.max(maximum,map.counts[k]);
  }
  const logMax=Math.fround(Math.log10(Math.fround(maximum+1)));
  for(let k=0;k<map.index.length;k++){
   const i=Math.floor(map.index[k]/n),j=map.index[k]%n;
   if(zeroDiagonal&&i===j)continue;
   const x=cutoff===null?map.counts[k]:Math.min(map.counts[k],cutoff);
   // Match upstream float32 input/logarithm and RGB conversion.
   const log=Math.fround(Math.log10(Math.fround(x+1)));
   target[index(i,j)]=logMax>0?log/logMax:0;
  }
  const label={finetune:'General encoder / fine-tuning',loops:'Loop inference',enhance100:'Low-coverage enhancement',enhanceMax:'High-coverage enhancement',singlecell:'Single-cell enhancement'}[task];
  return {target,valid,low:0,high:1,foundationMaximum:maximum,foundationTask:task,
   title:'HiCFoundation · encoder input intensity',caption:`${label} · log10(1 + PET) / log10(1 + ${maximum})`,
   notice:`HiCFoundation encoder preprocessing: ${cutoff===null?'retain counts':'cap counts at '+cutoff}; ${zeroDiagonal?'zero the main diagonal':'retain the diagonal'}; q = log10(1 + PET) / log10(1 + ${maximum}). The image is RGB = [1, 1 − q, 1 − q], followed by ImageNet channel standardization (means 0.485/0.456/0.406; SDs 0.229/0.224/0.225). The heatmap shows q, which produces this same white-to-red RGB image; hover reports the standardized tensor channels. Normalization uses the full viewer window and stays fixed while zooming. This is encoder-input preprocessing, not a universal task target; HiCFoundation loads its 2D task targets separately. Native viewer bins are retained, with no model resizing. ${maximum===0?'Empty windows display zero intensity; upstream would divide by zero.':''}`};
 }
 function writeColor(p,offset,value,supported,low,high){
  const q=supported&&Number.isFinite(value)?Math.max(0,Math.min(1,(value-low)/(high-low))):0;
  p[offset]=255;p[offset+1]=p[offset+2]=Math.round(255*(1-q));p[offset+3]=255;
 }
 const api={has:method=>methods.has(method),evo2Value,foundationRGB,makeTarget,writeColor};
 if(typeof module!=='undefined'&&module.exports){root.ViewerFeatures=require('./viewer-features.js');module.exports=api;}else root.PublishedNormalizations=api;
})(typeof window!=='undefined'?window:globalThis);
