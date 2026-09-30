'use strict';
const assert=require('node:assert/strict');
const peaks=require('../site/peak-axes.js');
const intervals=[[100,200],[300,500],[700,900]];
assert.deepEqual(peaks.segments(intervals,150,800,650),[[0,50],[150,200],[550,100]]);
assert.deepEqual(peaks.segments(intervals,200,300,100),[]);
assert.deepEqual(peaks.segments([],0,1000,704),[]);
const rects=[], ctx={save(){},restore(){},fillRect(...r){rects.push(r)}};
const record={start:0,bin_bp:100},view={x:1,y:7,size:2},plot={x:73,y:18,size:704};
const before=JSON.stringify({intervals,record,view,plot});
peaks.draw(ctx,intervals,record,view,plot);
assert.deepEqual(rects,[[73,7,352,6],[64,18,6,704]]);
assert.equal(JSON.stringify({intervals,record,view,plot}),before);
// Every rectangle remains outside the heatmap even with fractional viewport offsets.
for(const bins of [1000,2000,5000,10000]){
  rects.length=0;
  peaks.draw(ctx,[[158005100,158005300],[158006700,158007000]],
    {start:158000000,bin_bp:bins},{x:5000/bins,y:6300/bins,size:3000/bins},plot);
  assert.ok(rects.length>0);
  for(const [x,y,w,h] of rects){
    assert.ok(w>0&&h>0);
    assert.ok(y+h<plot.y || x+w<plot.x);
  }
}
console.log('Peak-axis clipping, half-open edges, independent x/y, four resolutions and input nonmutation passed.');
