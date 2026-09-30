(function(root) {
  'use strict';
  let manifest;
  const cache=new Map();
  async function load(record,signal) {
    if(!manifest) {
      const response=await fetch('loops/manifest.json',{signal});
      if(!response.ok)throw Error('Published loop index unavailable');
      const m=await response.json();
      if(m.assembly!=='hg38'||m.cell!=='K562')throw Error('Published loop reference mismatch');
      manifest=m;
    }
    const entry=manifest.packets[record.chrom];
    if(!entry)return [];
    if(cache.has(record.chrom))return cache.get(record.chrom);
    const response=await fetch(entry.file,{signal});
    if(!response.ok)throw Error('Published loops unavailable');
    const bytes=await response.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    if(bytes.byteLength!==entry.bytes||hash!==entry.sha256)throw Error('Published loop checksum failed');
    const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const loops=JSON.parse(text);
    if(loops.length!==entry.loops)throw Error('Published loop count mismatch');
    let previous=-1;
    for(const v of loops) {
      if(!Array.isArray(v)||v.length!==4||!v.every(Number.isInteger)||v[0]<0||v[0]<previous||v[1]<v[0]||v[2]<v[0]||v[3]<v[2])throw Error('Invalid published loop anchors');
      previous=v[0];
    }
    cache.set(record.chrom,loops);
    while(cache.size>2)cache.delete(cache.keys().next().value);
    return loops;
  }
  function rectangles(loops,record,view,plot) {
    const span=view.size*record.bin_bp,x0=record.start+view.x*record.bin_bp,y0=record.start+view.y*record.bin_bp;
    if(!(span>0))return {boxes:[],count:0};
    const x1=x0+span,y1=y0+span,scale=plot.size/span,boxes=[];
    let count=0;
    for(const [a,b,c,d] of loops) {
      // Table endpoints remain unchanged. A zero-width anchor gets a 1-bp
      // display extent only; no loop coordinates or contact values are rebinned.
      const aa=Math.max(b,a+1),cc=Math.max(d,c+1);
      if(a>=Math.max(x1,y1))break;
      let seen=false;
      for(const [left,right,top,bottom] of [[a,aa,c,cc],[c,cc,a,aa]]) {
        if(right<=x0||left>=x1||bottom<=y0||top>=y1)continue;
        const l=Math.max(left,x0),r=Math.min(right,x1),t=Math.max(top,y0),u=Math.min(bottom,y1);
        // Minimum six canvas pixels makes sub-bin anchors visible at overview.
        const w=Math.max(6,(r-l)*scale),h=Math.max(6,(u-t)*scale);
        boxes.push([plot.x+((l+r)/2-x0)*scale-w/2,plot.y+((t+u)/2-y0)*scale-h/2,w,h]);seen=true;
      }
      if(seen)count++;
    }
    return {boxes,count};
  }
  function draw(ctx,geometry,plot) {
    if(!geometry?.boxes.length)return;
    ctx.save();ctx.beginPath();ctx.rect(plot.x,plot.y,plot.size,plot.size);ctx.clip();
    ctx.beginPath();for(const b of geometry.boxes)ctx.rect(...b);
    ctx.strokeStyle='#ffffff';ctx.lineWidth=3.5;ctx.stroke();
    ctx.strokeStyle='#7020A0';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
  }
  const api={load,rectangles,draw};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PublishedLoops=api;
})(typeof window!=='undefined'?window:globalThis);
