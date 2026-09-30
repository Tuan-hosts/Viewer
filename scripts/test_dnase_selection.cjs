'use strict';
const assert=require('node:assert/strict');
const {interval}=require('../site/dnase-selection.js');
assert.deepEqual(interval(100.2,200.8,500),{start:100,size:101});
assert.deepEqual(interval(200.8,100.2,500),{start:100,size:101});
assert.deepEqual(interval(-30,25,500),{start:0,size:25});
assert.deepEqual(interval(490,600,500),{start:490,size:10});
assert.deepEqual(interval(0,1,500),{start:0,size:10});
assert.deepEqual(interval(499,500,500),{start:490,size:10});
assert.deepEqual(interval(120,120,500),null);
assert.deepEqual(interval(NaN,200,500),null);
// Selection boundaries are expressed in map bins, not DNase signal amplitudes.
for(const binBp of [1000,2000,5000,10000]){
  const total=2000000/binBp;
  const selected=interval(250000/binBp,500000/binBp,total);
  assert.equal(selected.start*binBp,250000);
  assert.equal(selected.size*binBp,250000);
}
console.log('DNase selection: both drag directions, edges, minimum span, invalid input and all resolutions passed.');
