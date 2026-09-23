(function(root) {
  'use strict';
  // DNase comes from K562.bw; panel-specific profiles come from the actual displayed maps.
  function endpoints(map) {
    const out = new Float64Array(map.n);
    let pets = 0;
    for (let k=0;k<map.index.length;k++) {
      const i=Math.floor(map.index[k]/map.n), j=map.index[k]%map.n;
      if (!map.v[i] || !map.v[j]) continue;
      const count=map.counts[k];
      out[i]+=count; out[j]+=count; pets+=count;
    }
    let total=0;
    for(let i=0;i<out.length;i++) { total+=out[i]; if(!map.v[i]) out[i]=NaN; }
    if(total!==2*pets) throw Error('HiTrAC endpoint conservation failed');
    return out;
  }
  function binDnase(native,record) {
    const q=record.bin_bp/1000, first=record.start/1000;
    if(!Number.isInteger(q)||!Number.isInteger(first)||first+record.grid*q>native.length)
      throw Error('DNase grid does not match the contact map');
    const out=new Float64Array(record.grid);
    for(let i=0;i<out.length;i++) {
      let sum=0;
      for(let j=0;j<q;j++) sum+=native[first+i*q+j];
      out[i]=sum/q; // NaN propagates when any constituent bin lacks complete coverage.
    }
    return out;
  }
  const cache=new Map(); let manifest;
  async function loadDnase(record,signal) {
    if(!manifest) {
      const r=await fetch('tracks/manifest.json',{signal});
      if(!r.ok)throw Error('DNase track index unavailable');
      const m=await r.json();
      if(m.source_sha256!==root.HITRAC_EXTENSION.bw_sha256)throw Error('DNase source mismatch');
      manifest=m;
    }
    const entry=manifest.packets[record.chrom];
    if(!entry)return new Float64Array(record.grid).fill(NaN);
    let native=cache.get(record.chrom);
    if(!native) {
      const r=await fetch(entry.file,{signal});
      if(!r.ok)throw Error('DNase chromosome track unavailable');
      const bytes=await r.arrayBuffer();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
      if(bytes.byteLength!==entry.bytes||hash!==entry.sha256)throw Error('DNase track checksum failed');
      const buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if(buffer.byteLength!==entry.bins*4)throw Error('DNase track length mismatch');
      native=new Float32Array(buffer);cache.set(record.chrom,native);
      while(cache.size>2)cache.delete(cache.keys().next().value);
    }
    return binDnase(native,record);
  }
  function displayValue(value,scale) { return scale==='log'?Math.log1p(value):value; }
  function maxValue(values,scale) {
    let max=0;for(const v of values)if(Number.isFinite(v))max=Math.max(max,displayValue(v,scale));return max;
  }
  function envelope(values,start,size,width,scale) {
    const out=new Float64Array(width);out.fill(NaN);
    for(let x=0;x<width;x++) {
      const first=Math.max(0,Math.floor(start+x*size/width));
      const end=Math.min(values.length,Math.ceil(start+(x+1)*size/width));
      let high=-Infinity;
      for(let i=first;i<end;i++)if(Number.isFinite(values[i]))high=Math.max(high,displayValue(values[i],scale));
      if(high!==-Infinity)out[x]=high;
    }
    return out;
  }
  function attach() {
    const $=id=>document.getElementById(id), panels=['raw','target','baseline','prediction'];
    const labels={raw:'Raw map profile',target:'Observed profile',baseline:'Baseline profile',prediction:'Predicted profile'};
    const colors={raw:'#7656a0',target:'#bd3349',baseline:'#c88825',prediction:'#357db6'};
    for(const id of panels) {
      const box=document.createElement('div');box.className='signal-tracks';
      for(const [name,label] of [['dnase','DNase · K562.bw'],['coverage','HiTrAC · observed PET ends / kb'],['hitrac',labels[id]]]) {
        const row=document.createElement('div');row.className='signal-track '+name;
        row.innerHTML=`<div class="signal-label"><b>${label}</b><span id="${id}-${name}-range"></span></div><canvas id="${id}-${name}" width="800" height="130" aria-label="${label} along the selected genomic axis"></canvas>`;
        if(name==='hitrac')row.innerHTML+=`<div class="profile-key" id="${id}-profile-key"></div>`;
        box.append(row);
      }
      $(id).parentElement.append(box);
    }
    let state=null, show=true, profiles=null, profileWindow=null, lastKey='', cached=null;
    const format=x=>Number.isFinite(x)?x.toLocaleString(undefined,{maximumSignificantDigits:4}):'Unavailable';
    function paintDNase(values,start,size,scale) {
      const canvas=$('raw-dnase'),ctx=canvas.getContext('2d'),max=values?maxValue(values,scale):0;
      ctx.fillStyle='#fff';ctx.fillRect(0,0,800,130);
      if(values) {
        const bars=envelope(values,start,size,704,scale);let valid=0;
        for(let x=0;x<bars.length;x++) {
          const v=bars[x];
          if(!Number.isFinite(v)){ctx.fillStyle='#dbe1e6';ctx.fillRect(73+x,6,1,104);continue;}
          valid++;const h=max?104*v/max:0;ctx.fillStyle='#187f88';ctx.fillRect(73+x,110-h,1,Math.max(h,v>0?1:0));
        }
        if(!valid){ctx.fillStyle='#61717a';ctx.font='22px system-ui';ctx.textAlign='center';ctx.fillText('Signal unavailable',425,65);}
      }
      ctx.strokeStyle='#dce3e7';ctx.beginPath();ctx.moveTo(73,110.5);ctx.lineTo(777,110.5);ctx.stroke();
      for(const [i,id] of panels.entries()) {
        if(i)$(id+'-dnase').getContext('2d').drawImage(canvas,0,0);
        $(id+'-dnase-range').textContent=values?`0–${format(max)}${scale==='log'?' · ln(1 + signal)':''}`:'Loading…';
      }
    }
    function rangeFor(arrays) {
      let low=Infinity,high=-Infinity;
      for(const a of arrays)if(a)for(const v of a)if(Number.isFinite(v)){low=Math.min(low,v);high=Math.max(high,v);}
      if(!Number.isFinite(low))return [0,1];
      const padding=(high-low)*.06||Math.max(.001,Math.abs(high)*.02);
      return [low-padding,high+padding];
    }
    function paintCoverage(start,size) {
      const values=state?.signals.endpoints,binKb=(state?.record.bin_bp||1000)/1000;
      const canvas=$('raw-coverage'),ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,800,130);
      const high=values?maxValue(values,'linear')/binKb:0;
      if(values){
        const first=Math.max(0,Math.floor(start)),end=Math.min(values.length,Math.ceil(start+size));
        ctx.save();ctx.beginPath();ctx.rect(73,6,704,104);ctx.clip();
        for(let i=first;i<end;i++){
          const left=73+(i-start)*704/size,width=704/size;
          if(!Number.isFinite(values[i])){ctx.fillStyle='#dbe1e6';ctx.fillRect(left,6,width,104);continue;}
          const h=high?104*(values[i]/binKb)/high:0;
          ctx.fillStyle='#8750a1';ctx.fillRect(left,110-h,width,h);
        }
        ctx.restore();
      }
      ctx.strokeStyle='#dce3e7';ctx.beginPath();ctx.moveTo(73,110.5);ctx.lineTo(777,110.5);ctx.stroke();
      for(const [i,id]of panels.entries()){
        if(i)$(id+'-coverage').getContext('2d').drawImage(canvas,0,0);
        $(id+'-coverage-range').textContent=values?`0–${format(high)} · binned`:'Loading…';
        $(id+'-coverage').setAttribute('aria-label','Observed raw PET ends per kb; binned coverage, not exact cLoops2 RPM');
      }
    }
    function profileLine(ctx,values,start,size,range,color,dashed=false) {
      if(!values)return;
      const [lo,hi]=range,y=v=>110-(v-lo)/(hi-lo)*104;
      const first=Math.max(0,Math.floor(start)),end=Math.min(values.length,Math.ceil(start+size));
      ctx.save();ctx.beginPath();ctx.rect(73,6,704,104);ctx.clip();
      ctx.strokeStyle=color;ctx.lineWidth=dashed?2:2.5;ctx.setLineDash(dashed?[7,5]:[]);
      // Draw native-bin steps. No moving average, interpolation or independent rescaling.
      let active=false;ctx.beginPath();
      for(let i=first;i<end;i++) {
        const v=values[i],left=73+(i-start)*704/size,right=73+(i+1-start)*704/size;
        if(!Number.isFinite(v)){active=false;continue;}
        if(active)ctx.lineTo(left,y(v));else ctx.moveTo(left,y(v));
        ctx.lineTo(right,y(v));active=true;
      }
      ctx.stroke();ctx.restore();
    }
    function profileDraw(id,start,size,axis) {
      const canvas=$(id+'-hitrac'),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,800,130);
      const p=profiles?.[id],reference=(id==='baseline'||id==='prediction')&&profiles?.overlay?profiles.target:null;
      const common=id!=='raw'&&profiles?.overlay;
      const range=rangeFor(common?[profiles?.target?.values,profiles?.baseline?.values,...(profiles?.prediction?[profiles.prediction.values]:[])]:[p?.values]);
      if(p) {
        ctx.strokeStyle='#e1e7eb';ctx.strokeRect(72.5,5.5,705,105);
        profileLine(ctx,p.values,start,size,range,colors[id]);
        if(reference)profileLine(ctx,reference.values,start,size,range,'#64717c',true);
        const first=Math.floor(start),end=Math.ceil(start+size);let any=false;
        for(let i=first;i<end;i++)if(Number.isFinite(p.values[i])){any=true;break;}
        if(!any){ctx.fillStyle='#61717a';ctx.font='22px system-ui';ctx.textAlign='center';ctx.fillText('Profile unavailable',425,65);}
        $(id+'-hitrac-range').textContent=`${format(range[0])} to ${format(range[1])}`;
        const r=reference?MapProfiles.correlation(p.values,reference.values,start,start+size):null;
        $(id+'-profile-key').innerHTML=`<span style="--color:${colors[id]}">${id==='baseline'?'Baseline':id==='prediction'?'Predicted':'Observed'}</span>`+
          (reference?`<span class="reference">Observed</span><em>1D PCC ${r===null?'—':r.toFixed(3)}</em>`:'<em>Mean map value</em>');
      } else {
        $(id+'-hitrac-range').textContent=state?'Calculating…':'Loading…';$(id+'-profile-key').textContent='';
      }
      canvas.setAttribute('aria-label',`${labels[id]}, mean clipped map value along the ${axis==='x'?'horizontal':'vertical'} map axis${reference?', observed target overlaid':''}`);
    }
    function draw() {
      document.querySelectorAll('.signal-tracks').forEach(el=>el.hidden=!show);
      $('trackControls').hidden=!show;$('trackReadout').hidden=!show;
      $('toggleTracks').textContent=show?'Hide signals':'Show signals';$('toggleTracks').setAttribute('aria-pressed',String(show));
      if(!show)return;
      const scale='log',axis='x';
      const start=state?.view[axis]||0, size=state?.view.size||0;
      const key=[state?.record.id,start,size,scale,axis,state?.bounds.lo,state?.bounds.hi,state?.bounds.rawMax].join(':');
      if(key===lastKey&&cached===state?.signals)return;
      lastKey=key;cached=state?.signals;
      paintDNase(state?.signals.dnase,start,size,scale);
      paintCoverage(start,size);
      for(const id of panels)profileDraw(id,start,size,axis);
      if(state) {
        const s=state.record.start+start*state.record.bin_bp,e=s+size*state.record.bin_bp;
        $('trackReadout').textContent=`${state.record.chrom}:${(s/1e6).toFixed(3)}–${(e/1e6).toFixed(3)} Mb · gray dashed line = observed target`;
      } else $('trackReadout').textContent='Loading observed signals…';
    }
    for(const id of panels)for(const name of ['dnase','coverage','hitrac']) {
      const c=$(id+'-'+name);
      c.onpointermove=e=> {
        if(!state)return;const rect=c.getBoundingClientRect(),f=((e.clientX-rect.left)*800/rect.width-73)/704;
        if(f<0||f>=1)return;
        const i=Math.floor(state.view.x+f*state.view.size);
        const first=state.record.start+i*state.record.bin_bp;
        const values=profiles?.[id]?.values,reference=(id==='baseline'||id==='prediction')&&profiles?.overlay?profiles.target.values:null;
        $('trackReadout').textContent=`${state.record.chrom}:${first.toLocaleString()}–${(first+state.record.bin_bp).toLocaleString()} bp · DNase ${format(state.signals.dnase[i])} · observed PET ends/kb ${format(state.signals.endpoints[i]*1000/state.record.bin_bp)} · ${labels[id]} ${format(values?.[i])}${reference?' · observed '+format(reference[i]):''}`;
      };
    }
    $('toggleTracks').onclick=()=>{show=!show;lastKey='';draw();};
    return {update(signals,record,view,bounds){
      state=signals?{signals,record,view:{...view},bounds}:null;
      if(!state||profileWindow!==record.id||profiles?.clip[0]!==bounds.lo||profiles?.clip[1]!==bounds.hi||profiles?.rawMax!==bounds.rawMax)profiles=null;
      draw();
    },setProfiles(value,windowId){if(state&&state.record.id===windowId){profiles=value;profileWindow=windowId;lastKey='';draw();}},
      visible:()=>show, export(ctx,id,x,y){if(!show)return;for(const [i,name]of ['dnase','coverage','hitrac'].entries()){
        ctx.fillStyle=name==='dnase'?'#187f88':colors[id];ctx.font='18px system-ui';
        ctx.fillText(`${name==='dnase'?'DNase · K562.bw':name==='coverage'?'HiTrAC · observed PET ends / kb':labels[id]} · ${$(id+'-'+name+'-range').textContent}`,x+73,y+i*158+20);
        ctx.drawImage($(id+'-'+name),x,y+i*158+27);
        if(name==='hitrac'){ctx.fillStyle='#61717a';ctx.font='16px system-ui';ctx.fillText($(id+'-profile-key').textContent,x+73,y+498);}
      }}};
  }
  const api={endpoints,binDnase,loadDnase,maxValue,envelope,attach};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SignalTracks=api;
})(typeof window!=='undefined'?window:globalThis);
