(function(root) {
  'use strict';
  function interval(a, b, total, minimum = 10) {
    if (![a,b,total,minimum].every(Number.isFinite) || total <= 0) return null;
    let start = Math.max(0, Math.min(total, Math.floor(Math.min(a,b))));
    let end = Math.max(0, Math.min(total, Math.ceil(Math.max(a,b))));
    if (end <= start) return null;
    const size = Math.min(total, Math.max(end-start, minimum));
    start = Math.max(0, Math.min(total-size, (start+end-size)/2));
    return {start, size};
  }
  function attach(canvas, {plot, getRange, onSelect}) {
    let drag = null;
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';
    canvas.title = 'Drag across DNase to zoom both map axes to that interval. Esc cancels.';
    const point = event => {
      const box = canvas.getBoundingClientRect();
      return {x:(event.clientX-box.left)*canvas.width/box.width,
        y:(event.clientY-box.top)*canvas.height/box.height};
    };
    const clamp = x => Math.max(plot.left, Math.min(plot.right, x));
    const unchanged = () => {
      const now = getRange();
      return drag && now && now.id === drag.range.id && now.start === drag.range.start &&
        now.size === drag.range.size && now.total === drag.range.total;
    };
    function clear() {
      if (!drag) return;
      const previous = drag;
      if (unchanged()) canvas.getContext('2d').putImageData(previous.image,0,0);
      drag = null;
      if (canvas.hasPointerCapture(previous.pointerId)) canvas.releasePointerCapture(previous.pointerId);
    }
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      const range = getRange(), p = point(event);
      if (!range || p.x < plot.left || p.x > plot.right || p.y < plot.top || p.y > plot.bottom) return;
      event.preventDefault();
      drag = {range:{...range}, x:p.x, clientX:event.clientX, pointerId:event.pointerId,
        image:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height)};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!unchanged()) { clear(); return; }
      event.preventDefault();
      const x = clamp(point(event).x), left = Math.min(x,drag.x), width = Math.abs(x-drag.x);
      const ctx = canvas.getContext('2d');ctx.putImageData(drag.image,0,0);ctx.save();
      ctx.fillStyle = 'rgba(24,127,136,0.18)';ctx.fillRect(left,plot.top,width,plot.bottom-plot.top);
      ctx.strokeStyle = '#187f88';ctx.lineWidth = 1.5;
      ctx.strokeRect(left,plot.top,width,plot.bottom-plot.top);ctx.restore();
    });
    canvas.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!unchanged()) { clear(); return; }
      const from = drag.x, to = clamp(point(event).x), range = drag.range;
      const moved = Math.abs(event.clientX-drag.clientX) >= 3;
      clear();
      if (!moved) return;
      const at = x => range.start+(x-plot.left)/(plot.right-plot.left)*range.size;
      const selected = interval(at(from),at(to),range.total,range.minimum);
      if (selected) onSelect(selected.start,selected.size);
    });
    canvas.addEventListener('pointercancel', clear);
    canvas.addEventListener('lostpointercapture', clear);
    document.addEventListener('keydown', event => {if (event.key === 'Escape') clear();});
  }
  const api = {interval,attach};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DnaseSelection = api;
})(typeof window !== 'undefined' ? window : globalThis);
