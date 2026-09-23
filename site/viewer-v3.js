(() => {
 'use strict';
 const $=id=>document.getElementById(id), M=window.HITRAC_MANIFEST, E=window.HITRAC_EXTENSION, C=window.CapacityMath;
 const names={raw:'No normalization',observed:'Shared observed distance',shuffled:'Shuffled endpoints',plb:'Local PLB',window:'Within-window distance'};
 let mode="compare",catalog,source,record,arm,data=null,view={x:0,y:0,size:100},version=0,worker=null,serial=0,pending=new Map(),metricTimer,metricVersion=0,renderPending=false;
 const modelCache=new Map();
 const mb=x=>(x/1e6).toLocaleString(undefined,{maximumFractionDigits:3});
 const number=(x,d=6)=>x===null||!Number.isFinite(x)?'Undefined':x.toFixed(d);
 const clip=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
 function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
 function bounds(){return [+ $('lo').value,+ $('hi').value];}
 function validBounds(){const [lo,hi]=bounds();return Number.isFinite(lo)&&Number.isFinite(hi)&&lo<hi;}
 function option(text,value){const o=document.createElement('option');o.textContent=text;o.value=value;return o;}
 function geometry(){return M.geometries.find(g=>g.id===`${$('bin').value}kb_${$('span').value}Mb`);}
 function chooseArm(){
  if(!catalog||!geometry())return null;
  if($('method').value!=='raw'&&$('formulation').value!=='ratio')return null;
  const name=$('method').value==='raw'?$('rawModel').value:$('method').value;
  return catalog.settings.find(s=>s.arm.geometry===geometry().id&&s.arm.name===name)||null;
 }
 function syncMode(){
  const compare=mode==='compare';document.body.dataset.mode=mode;
  $('exploreMode').setAttribute('aria-pressed',String(!compare));$('compareMode').setAttribute('aria-pressed',String(compare));
  $('presetLabel').hidden=!compare;$('methodLabel').hidden=compare;$('rawLabel').hidden=true;
  $('formLabel').hidden=compare||$('method').value==='raw';$('trainingBounds').hidden=!compare;$('fittingLabel').hidden=compare;
  $('modeHint').textContent=compare?'Fitted regions · matched targets and predictions':'All chromosomes · observed-map normalization';
  const previous=$('chrom').value,chromosomes=[...new Set(M.geometries[0].windows.map(w=>w.chrom))].filter(c=>!compare||c==='chr3'||c==='chr4');
  $('chrom').replaceChildren(...chromosomes.map(c=>option(c,c)));$('chrom').value=chromosomes.includes(previous)?previous:compare?'chr3':chromosomes[0];
  $('preset').value=$('method').value==='raw'?$('rawModel').value:$('method').value;
 }
 function switchMode(next){
  if(mode===next)return;mode=next;
  if(mode==='compare')$('formulation').value='ratio';
  syncMode();load(record?.start||0);
 }
 function readView(){
  try{
   if(location.hash.startsWith('#view='))return JSON.parse(decodeURIComponent(location.hash.slice(6)));
   const p=new URLSearchParams(location.hash.slice(1));return p.has('setting')?Object.fromEntries(p):null;
  }catch{return null;}
 }
 function persist(){
  if(!record)return;
  const s={mode,window:record.id,method:$('method').value,formulation:$('formulation').value,rawModel:$('rawModel').value,min:+ $('lo').value,max:+ $('hi').value,rawMax:+ $('rawMax').value,fitting:$('fitting').checked,view:{...view}};
  history.replaceState(null,'','#view='+encodeURIComponent(JSON.stringify(s)));
  try{localStorage.setItem('activehitrac.viewer.clipping.v1',JSON.stringify({min:s.min,max:s.max}));}catch{}
 }
 function clearMetrics(){++metricVersion;for(const id of ['mse','rmse','pcc','baseMse','baseRmse','basePcc'])$(id).textContent='—';$('scoreSummary').textContent='';}
 function terminate(){if(worker)worker.terminate();worker=null;for(const p of pending.values())p.reject(Error('Superseded window'));pending.clear();clearTimeout(metricTimer);}
 function newWorker(){terminate();worker=new Worker('viewer-worker.js?v=20260923');worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.result);};worker.onerror=e=>{status('Could not calculate map metrics: '+e.message,true);for(const p of pending.values())p.reject(Error(e.message));pending.clear();};}
 function call(type,payload){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({id,type,data:payload});});}
 async function checkedFetch(path,hash,bytes){
  const response=await fetch(path);if(!response.ok)throw Error(`Could not load map data (${response.status}). Please retry.`);
  const buffer=await response.arrayBuffer();if(bytes!==undefined&&buffer.byteLength!==bytes)throw Error('Incomplete map download.');
  if(hash){const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');if(actual!==hash)throw Error('Map checksum failed. Please reload.');}
  return buffer;
 }
 function unshuffle(bytes,n){const out=new Float32Array(n),u=new Uint8Array(out.buffer);for(let b=0;b<4;b++)for(let i=0;i<n;i++)u[4*i+b]=bytes[b*n+i];return out;}
 async function capacityPacket(s,w){
  const compressed=await checkedFetch(source.baseUrl+w.file,w.sha256,w.bytes);
  const buffer=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(buffer.byteLength!==w.uncompressed_bytes)throw Error('Incomplete decompressed map.');
  const h=new DataView(buffer).getUint32(0,true),meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,h))),n=meta.length,off=4+h;
  if(meta.version!==1||meta.setting!==s.arm.id||meta.window.id!==w.id||meta.checkpoint_sha256!==s.checkpoint_sha256||n!==w.grid*(w.grid+1)/2||buffer.byteLength!==off+n*8+Math.ceil(n/8))throw Error('Prediction and target do not match the selected setting.');
  const prediction=unshuffle(new Uint8Array(buffer,off,n*4),n),target=unshuffle(new Uint8Array(buffer,off+n*4,n*4),n),bits=new Uint8Array(buffer,off+n*8),valid=new Uint8Array(n);
  for(let i=0;i<n;i++)valid[i]=(bits[i>>3]>>(i&7))&1;
  let model=modelCache.get(s.arm.id);
  if(!model){model=JSON.parse(new TextDecoder().decode(await checkedFetch(source.baseUrl+s.model.file,s.model.sha256)));modelCache.set(s.arm.id,model);}
  if(model.setting!==s.arm.id||model.beta.length!==w.grid)throw Error('Baseline setting mismatch.');
  let pairs=0;for(let i=0;i<n;i++)if(valid[i]){pairs++;if(!Number.isFinite(target[i])||!Number.isFinite(prediction[i])||target[i]<s.arm.clip_min||target[i]>s.arm.clip_max)throw Error('Invalid supported target or prediction.');}
  if(pairs!==w.pairs||pairs!==meta.pairs)throw Error('Support does not match the saved result.');
  return {meta:{window:meta.window,arm:s.arm},target,prediction,valid,baseline:C.baselineValues(model,meta.features),scoreBaseline:true,capacity:true};
 }
 function upperRaw(map){const n=map.n,p=n*(n+1)/2,raw=new Float32Array(p),support=new Uint8Array(p);let k=0;for(let i=0;i<n;i++)for(let j=i;j<n;j++,k++)support[k]=map.v[i]&&map.v[j]?1:0;
  for(let p=0;p<map.index.length;p++){const i=Math.floor(map.index[p]/n),j=map.index[p]%n;raw[C.index(i,j,n)]=map.logs[p];}return {raw,rawSupport:support};
 }
 function populateWindows(start){
  arm=chooseArm();const eligible=new Set((arm||catalog.settings.find(s=>s.arm.geometry===geometry().id))?.windows.map(w=>w.id)||[]);
  const choices=geometry().windows.filter(w=>w.chrom===$('chrom').value&&(!(mode==='compare'||$('fitting').checked)||eligible.has(w.id)));
  $('window').replaceChildren(...choices.map(w=>option(`${mb(w.start)}–${mb(w.end)} Mb${mode==='explore'&&eligible.has(w.id)?' · fitted':''}`,w.id)));
  const selected=choices.find(w=>w.start<=start&&start<w.end)||choices[0];if(selected)$('window').value=selected.id;
  $('window').disabled=!selected;return selected;
 }
 async function load(start,restore){
  if(!catalog)return;
  const v=++version,previousWindow=record?.id,previousView={...view};terminate();clearMetrics();data=null;
  if(start!==undefined)populateWindows(start);else arm=chooseArm();
  record=geometry().windows.find(w=>w.id===$('window').value);
  $('rawLabel').hidden=true;$('formLabel').hidden=mode==='compare'||$('method').value==='raw';
  $('trainingBounds').disabled=!arm;
  const at=$('window').selectedIndex;$('prev').disabled=at<=0;$('next').disabled=at<0||at===$('window').options.length-1;
  $('export').disabled=true;
  if(!record){status('No fitting regions on this chromosome. Choose chr3/chr4 or turn off “Fitting regions only”.');drawAll();return;}
  view=record.id===previousWindow?previousView:{x:0,y:0,size:record.grid};if(restore?.view)view={...restore.view};constrain();
  $('region').textContent=`${record.chrom}:${mb(record.start)}–${mb(record.end)} Mb`;
  $('geometry').textContent=`${record.bin_bp/1000}-kb bins · ${(record.end-record.start)/1e6}-Mb window`;
  $('predictionCaption').textContent='Loading…';$('targetCaption').textContent=names[$('method').value];$('baseCaption').textContent='';drawAll();status('Loading observed contacts…');
  try{
   const chromosome=await HiTracGenome.loadPacket(M.packets[record.packet]);if(v!==version)return;
   const genome=HiTracGenome.windowData(chromosome,record,geometry().distance_groups),raw=upperRaw(genome.map);
   const w=mode==='compare'?arm?.windows.find(w=>w.id===record.id):null;newWorker();
   if(w){
    status('Loading prediction and matching target…');
    const loaded=await capacityPacket(arm,w);if(v!==version)return;data={...loaded,...raw};
    $('targetTitle').textContent='Observed · training target';$('targetCaption').textContent=`${names[arm.arm.method]} · trained [${arm.arm.clip_min}, ${arm.arm.clip_max}]`;
    $('baseCaption').textContent='Fitted to the same target';$('predictionCaption').textContent=`Setting ${arm.arm.id} · fitting region`;
   }else{
    const method=$('method').value,ratio=$('formulation').value==='ratio';
    const loaded=await call('explore',{...genome,model:E.models[record.geometry],method,ratio});if(v!==version)return;
    data={...loaded,...raw,prediction:null,meta:{window:record},scoreBaseline:method==='raw',exploreRatio:ratio&&method!=='raw',capacity:false};
    $('targetTitle').textContent='Observed · transformed';$('targetCaption').textContent=method==='raw'?'ln(1 + PET counts)':ratio?'ln(O/E) · zeros at lower bound':'ln(1 + O/E)';
    $('baseCaption').textContent='Original ln(1 + counts) baseline';$('predictionCaption').textContent=w?'Unavailable':'No fitted prediction for this selection';
   }
   await call('init',{meta:data.meta,target:data.target,prediction:data.prediction,baseline:data.baseline,valid:data.valid,scoreBaseline:data.scoreBaseline,exploreRatio:data.exploreRatio});if(v!==version)return;
   $('export').disabled=false;status(data.capacity?'':$('method').value==='raw'?'':'Switch to Compare predictions for a baseline and model fitted to the same normalized target.');
   render();
  }catch(e){if(v===version){data=null;drawAll();clearMetrics();status(e.message,true);$('predictionCaption').textContent='Unavailable';}}
 }
 function constrain(){if(!record)return;const n=record.grid;view.size=clip(Number(view.size)||n,Math.min(10,n),n);view.x=clip(Number(view.x)||0,0,n-view.size);view.y=clip(Number(view.y)||0,0,n-view.size);}
 const plot={x:73,y:18,size:704};
 function draw(id,values,support,low,high){
  const canvas=$(id),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,800,800);
  if(!values||!record){ctx.fillStyle='#7b8991';ctx.font='22px system-ui';ctx.textAlign='center';ctx.fillText(id==='prediction'?'No prediction for this selection':'Select a window',400,390);return;}
  const n=record.grid,pixels=ctx.createImageData(plot.size,plot.size),p=pixels.data;
  for(let row=0;row<plot.size;row++){const i=Math.min(n-1,Math.floor(view.y+(row+.5)*view.size/plot.size));for(let col=0;col<plot.size;col++){
   const j=Math.min(n-1,Math.floor(view.x+(col+.5)*view.size/plot.size)),k=C.index(i,j,n),value=values[k],f=support[k]&&Number.isFinite(value)?clip((value-low)/(high-low),0,1):0,t=(row*plot.size+col)*4;p[t]=255;p[t+1]=p[t+2]=Math.round(255*(1-f));p[t+3]=255;
  }}ctx.putImageData(pixels,plot.x,plot.y);ctx.strokeStyle='#d5dde2';ctx.strokeRect(plot.x-.5,plot.y-.5,plot.size+1,plot.size+1);ctx.fillStyle='#596b76';ctx.font='18px system-ui';
  for(const f of [0,.5,1]){ctx.textAlign='center';ctx.fillText(mb(record.start+(view.x+f*view.size)*record.bin_bp),plot.x+f*plot.size,plot.y+plot.size+30);ctx.textAlign='right';ctx.fillText(mb(record.start+(view.y+f*view.size)*record.bin_bp),plot.x-10,plot.y+f*plot.size+6);}ctx.textAlign='center';ctx.fillText('Genomic position (Mb)',plot.x+plot.size/2,790);
 }
 function drawAll(){const [lo,hi]=bounds();draw('raw',data?.raw,data?.rawSupport,0,+ $('rawMax').value);for(const [id,key] of [['target','target'],['baseline','baseline'],['prediction','prediction']])draw(id,data?.[key],data?.valid,lo,hi);}
 function render(){if(!validBounds()){clearMetrics();status('Clipping maximum must be larger than the minimum.',true);return;}if(!(+$('rawMax').value>0)||!Number.isFinite(+$('rawMax').value)){status('Raw color maximum must be positive.',true);return;}
  constrain();drawAll();document.querySelectorAll('.lower').forEach(e=>e.textContent=$('lo').value);document.querySelectorAll('.upper').forEach(e=>e.textContent=$('hi').value);$('rawLegend').textContent=$('rawMax').value;
  if(record)$('zoom').value=[1,2,4,8,16,32].reduce((a,b)=>Math.abs(b-record.grid/view.size)<Math.abs(a-record.grid/view.size)?b:a);
  persist();clearTimeout(metricTimer);clearMetrics();if(!data)return;const mv=metricVersion,v=version,[lo,hi]=bounds();
  metricTimer=setTimeout(async()=>{try{const result=await call('metrics',{view:{...view},lo,hi});if(v!==version||mv!==metricVersion)return;
   for(const [key,prefix] of [['prediction',''],['baseline','base']]){const m=result[key];if(!m)continue;$(prefix?'baseMse':'mse').textContent=number(m.rangeNormalizedMse);$(prefix?'baseRmse':'rmse').textContent=number(m.rangeNormalizedRmse);$(prefix?'basePcc':'pcc').textContent=number(m.pcc,5);}
   const a=result.prediction,b=result.baseline,n=a?.pairs??b?.pairs;
   let text=n===undefined?'Baseline remains in log-count units; no cross-transform accuracy score.':`${n.toLocaleString()} comparable pairs · clip [${lo}, ${hi}]`;
   if(a&&b){if(a.pairs!==b.pairs)throw Error('Baseline and prediction support differ.');if(b.mse>0){const gain=100*(b.mse-a.mse)/b.mse;text+=` · Overfit MSE ${Math.abs(gain).toFixed(1)}% ${gain>=0?'lower':'higher'} than baseline`;}}
   $('scoreSummary').textContent=text;window.VIEWER_METRICS={...result,window:record.id,setting:arm?.arm.id,bounds:[lo,hi],view:{...view}};
  }catch(e){if(v===version)status(e.message,true);}},80);
 }
 function schedule(){if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;render();});}
 function zoom(size,fx=.5,fy=.5){if(!record)return;const next=clip(size,Math.min(10,record.grid),record.grid);view.x+=fx*(view.size-next);view.y+=fy*(view.size-next);view.size=next;constrain();schedule();}
 for(const id of ['raw','target','baseline','prediction']){const canvas=$(id);let drag=null;const pos=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*800/r.height};};
  canvas.onpointerdown=e=>{if(!data)return;drag={...pos(e),vx:view.x,vy:view.y,size:view.size};canvas.setPointerCapture(e.pointerId);};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
  canvas.onpointermove=e=>{if(!data)return;const p=pos(e);if(drag){view.x=drag.vx-(p.x-drag.x)*drag.size/plot.size;view.y=drag.vy-(p.y-drag.y)*drag.size/plot.size;constrain();schedule();return;}const x=(p.x-plot.x)/plot.size,y=(p.y-plot.y)/plot.size;if(x<0||x>=1||y<0||y>=1)return;const i=Math.floor(view.y+y*view.size),j=Math.floor(view.x+x*view.size),k=C.index(i,j,record.grid);$('hover').textContent=`${record.chrom}: ${(record.start+i*record.bin_bp).toLocaleString()} × ${(record.start+j*record.bin_bp).toLocaleString()} bp · ${Math.abs(i-j)*record.bin_bp/1000} kb apart${data.valid[k]?'':' · Unavailable for comparison'}`;};
  canvas.addEventListener('wheel',e=>{if(!data)return;e.preventDefault();const p=pos(e);zoom(view.size*(e.deltaY>0?1.2:1/1.2),clip((p.x-plot.x)/plot.size,0,1),clip((p.y-plot.y)/plot.size,0,1));},{passive:false});
 }
 for(const id of ['bin','span','chrom','method','formulation','rawModel','fitting'])$(id).onchange=()=>load(record?.start||0);
 $('exploreMode').onclick=()=>switchMode('explore');$('compareMode').onclick=()=>switchMode('compare');
 $('preset').onchange=()=>{const name=$('preset').value;$('method').value=name.startsWith('raw')?'raw':name;if(name.startsWith('raw'))$('rawModel').value=name;$('formulation').value='ratio';load(record?.start||0);};
 $('window').onchange=()=>load();for(const [id,d] of [['prev',-1],['next',1]])$(id).onclick=()=>{const s=$('window');s.selectedIndex=clip(s.selectedIndex+d,0,s.options.length-1);load();};
 for(const id of ['lo','hi','rawMax']){$(id).oninput=()=>{if(validBounds())status('');schedule();};}
 $('trainingBounds').onclick=()=>{arm=chooseArm();if(!arm)return;$('lo').value=arm.arm.clip_min;$('hi').value=arm.arm.clip_max;render();};
 $('full').onclick=()=>{if(!record)return;view={x:0,y:0,size:record.grid};render();};$('detail').onclick=()=>{if(!record)return;const size=Math.min(record.grid,250000/record.bin_bp);view={x:(record.grid-size)/2,y:(record.grid-size)/2,size};render();};$('zoom').onchange=()=>zoom(record.grid/+ $('zoom').value);
 $('copy').onclick=async()=>{persist();try{await navigator.clipboard.writeText(location.href);$('copy').textContent='Copied';setTimeout(()=>$('copy').textContent='Copy link',1500);}catch{status('Copy the address from your browser to share this view.');}};
 $('export').onclick=()=>{if(!data)return;const c=document.createElement('canvas');const ids=mode==='compare'?['raw','target','baseline','prediction']:['raw','target','baseline'];c.width=820*ids.length;c.height=1010;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#1d303c';ctx.font='bold 26px system-ui';ctx.fillText(`${$('region').textContent} · ${$('geometry').textContent}`,35,38);ctx.font='21px system-ui';for(const [i,id] of ids.entries()){ctx.fillText($(id).parentElement.querySelector('h3').textContent,i*820+35,83);ctx.drawImage($(id),i*820,105);}ctx.font='18px system-ui';ctx.fillText(`Comparison clip [${$('lo').value}, ${$('hi').value}] · ${$('targetCaption').textContent} ${mode==='compare'?'· fitting-set predictions':''}`,35,941);ctx.fillText(`${mode==='compare'?`Overfit MSE ${$('mse').textContent} · RMSE ${$('rmse').textContent} · Pearson ${$('pcc').textContent} | `:''}Baseline MSE ${$('baseMse').textContent} · Pearson ${$('basePcc').textContent} | MSE uses the squared clipping range`,35,977);c.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Viewer_${record.id}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});};
 async function init(){
  document.querySelectorAll('button,select,input').forEach(el=>el.disabled=true);
  try{
  [catalog,source]=await Promise.all(['capacity/catalog.json','capacity/source.json'].map(async p=>{const r=await fetch(p);if(!r.ok)throw Error('Could not load prediction catalog.');return r.json();}));
  const chromosomes=[...new Set(M.geometries[0].windows.map(w=>w.chrom))];$('chrom').replaceChildren(...chromosomes.map(c=>option(c,c)));
  let saved=readView(),found;
  if(saved?.setting){const s=catalog.settings.find(s=>s.arm.id===+saved.setting);if(s)saved={...saved,method:s.arm.method,rawModel:s.arm.name.startsWith('raw')?s.arm.name:'raw1',formulation:'ratio',view:saved.size?{x:+saved.x||0,y:+saved.y||0,size:+saved.size}:undefined};}
  if(saved?.window)found=M.geometries.flatMap(g=>g.windows).find(w=>w.id===saved.window);
  $('bin').value=found?found.bin_bp/1000:10;$('span').value=found?(found.end-found.start)/1e6:1;$('chrom').value=found?found.chrom:'chr3';
  $('method').value=names[saved?.method]?saved.method:'shuffled';$('formulation').value=saved?.formulation==='log1p'?'log1p':'ratio';$('rawModel').value=saved?.rawModel==='raw2'?'raw2':'raw1';$('fitting').checked=saved?.fitting===true;
  let stored;try{stored=JSON.parse(localStorage.getItem('activehitrac.viewer.clipping.v1'));}catch{}
  const b=saved&&Number.isFinite(+saved.min)&&Number.isFinite(+saved.max)&&+saved.min<+saved.max?saved:stored;
  if(b&&Number.isFinite(+b.min)&&Number.isFinite(+b.max)&&+b.min<+b.max){$('lo').value=b.min;$('hi').value=b.max;}
  if(saved?.rawMax>0)$('rawMax').value=saved.rawMax;
  mode=['compare','explore'].includes(saved?.mode)?saved.mode:saved?.method&&saved.method!=='raw'&&saved.formulation==='log1p'?'explore':'compare';
  if(mode==='compare')$('formulation').value='ratio';syncMode();
  populateWindows(found?found.start:24000000);
  document.querySelectorAll('button,select,input').forEach(el=>el.disabled=false);
  await load(undefined,saved);
 }catch(e){status(e.message,true);}}
 window.addEventListener('hashchange',()=>location.reload());init();
})();
