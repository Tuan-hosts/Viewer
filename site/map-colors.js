(function(root) {
  'use strict';
  // A display-only white-to-red scale across the selected limits.
  // Preserve supported log-zero (-Infinity) at the selected lower limit.
  function write(pixels, offset, value, supported, low, high) {
    let r=255,g=255,b=255;
    if(supported && !Number.isNaN(value)) {
      if(value===-Infinity)value=low;
      else if(value===Infinity)value=high;
      const t=Math.max(0,Math.min(1,(value-low)/(high-low)));
      g=b=Math.round(255*(1-t));
    }
    pixels[offset]=r;pixels[offset+1]=g;pixels[offset+2]=b;pixels[offset+3]=255;
  }
  function color(value,low,high) {const p=new Uint8ClampedArray(4);write(p,0,value,true,low,high);return `rgb(${p[0]},${p[1]},${p[2]})`;}
  function gradient(low,high) {
    return 'linear-gradient(90deg,#ffffff 0%,#ff0000 100%)';
  }
  const api={write,color,gradient};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MapColors=api;
})(typeof window!=='undefined'?window:globalThis);
