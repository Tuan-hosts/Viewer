(function(root) {
  'use strict';
  // A display-only, zero-centered blue / white / red scale.
  // Preserve supported log-zero (-Infinity) at the selected lower limit.
  function write(pixels, offset, value, supported, low, high) {
    let r=255,g=255,b=255;
    if(supported && !Number.isNaN(value)) {
      if(value===-Infinity)value=low;
      else if(value===Infinity)value=high;
      if(value<0) {
        const t=low<0?Math.min(1,value/low):0;
        r=g=Math.round(255*(1-t));
      } else if(value>0) {
        const t=high>0?Math.min(1,value/high):0;
        g=b=Math.round(255*(1-t));
      }
    }
    pixels[offset]=r;pixels[offset+1]=g;pixels[offset+2]=b;pixels[offset+3]=255;
  }
  function color(value,low,high) {const p=new Uint8ClampedArray(4);write(p,0,value,true,low,high);return `rgb(${p[0]},${p[1]},${p[2]})`;}
  function gradient(low,high) {
    const stops=[`${color(low,low,high)} 0%`];
    if(low<0&&high>0)stops.push(`#ffffff ${100*(-low)/(high-low)}%`);
    stops.push(`${color(high,low,high)} 100%`);
    return `linear-gradient(90deg,${stops.join(',')})`;
  }
  const api={write,color,gradient};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MapColors=api;
})(typeof window!=='undefined'?window:globalThis);
