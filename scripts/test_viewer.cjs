'use strict';
const assert = require('node:assert/strict');
const math = require('../site/capacity-math.js');
globalThis.CapacityMath = math;
const packet = require('../site/capacity-packet.js');
let checks = 0;
function equal(actual, expected) { assert.deepStrictEqual(actual, expected); checks++; }
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`); checks++; }
// Deliberately enumerate the visible square, deduplicating unordered pairs independently.
function reference(data, view, lo, hi, field) {
  const n=data.meta.window.grid, seen=new Set(), a=[], b=[];
  for(let i=Math.max(0,Math.floor(view.y));i<Math.min(n,Math.ceil(view.y+view.size));i++)
    for(let j=Math.max(0,Math.floor(view.x));j<Math.min(n,Math.ceil(view.x+view.size));j++) {
      const key=[Math.min(i,j),Math.max(i,j)].join(',');if(seen.has(key))continue;seen.add(key);
      const k=math.index(i,j,n);if(!data.valid[k])continue;
      let x=data.target[k],y=data[field][k];if(data.exploreRatio&&x===-Infinity)x=lo;
      if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      a.push(Math.max(lo,Math.min(hi,x)));b.push(Math.max(lo,Math.min(hi,y)));
    }
  const avg=x=>x.reduce((s,v)=>s+v,0)/x.length, am=avg(a), bm=avg(b);
  const mse=avg(a.map((v,i)=>(v-b[i])**2));
  const aa=a.reduce((s,v)=>s+(v-am)**2,0),bb=b.reduce((s,v)=>s+(v-bm)**2,0);
  return {pairs:a.length,mse,rangeNormalizedMse:mse/(hi-lo)**2,pcc:aa>0&&bb>0?a.reduce((s,v,i)=>s+(v-am)*(b[i]-bm),0)/Math.sqrt(aa*bb):null};
}
const n=6,count=n*(n+1)/2;
const data={meta:{window:{grid:n},arm:{clip_min:-5,clip_max:5}},target:Float32Array.from({length:count},(_,i)=>(i%9)-6),prediction:Float32Array.from({length:count},(_,i)=>(i*3%11)-5),baseline:Float32Array.from({length:count},(_,i)=>(i*7%13)-4),valid:Uint8Array.from({length:count},(_,i)=>i%7!==0),scoreBaseline:true};
for(const view of [{x:0,y:0,size:6},{x:1.2,y:2.8,size:2.1},{x:0,y:3,size:3},{x:3,y:0,size:3}]) {
  for(const [lo,hi] of [[-5,5],[0,1],[-10,10]]) {
    const result=math.compareMaps(data,view,lo,hi);
    for(const field of ['prediction','baseline']) {
      const expected=reference(data,view,lo,hi,field),actual=result[field];equal(actual.pairs,expected.pairs);
      for(const key of ['mse','rangeNormalizedMse','pcc']) expected[key]===null?equal(actual[key],null):near(actual[key],expected[key]);
    }
  }
}
const view={x:0,y:0,size:6};
data.target.fill(-Infinity);data.valid.fill(1);data.exploreRatio=true;
let result=math.compareMaps(data,view,-5,5);equal(result.prediction.pairs,count);equal(result.prediction.pcc,null);
data.target[0]=NaN;data.target[1]=Infinity;result=math.compareMaps(data,view,-5,5);equal(result.prediction.pairs,count-2);
data.valid.fill(0);result=math.compareMaps(data,view,-5,5);equal(result.prediction.pairs,0);equal(result.prediction.mse,null);equal(result.prediction.pcc,null);
// Construct a small lossless packet without sharing the decoder's byte-unshuffling code.
function makePacket(values, flags, edits={}) {
  const metadata={version:1,setting:40,window:{id:'example',grid:2},checkpoint_sha256:'test-checkpoint',length:3,pairs:2,features:[[1],[2]],...edits};
  const header=Buffer.from(JSON.stringify(metadata)),payload=Buffer.alloc(4+header.length+25);payload.writeUInt32LE(header.length);header.copy(payload,4);
  const offset=4+header.length;
  for(let field=0;field<2;field++)for(let i=0;i<3;i++) {
    const bytes=Buffer.alloc(4);bytes.writeFloatLE(values[field][i]);
    for(let byte=0;byte<4;byte++)payload[offset+field*12+byte*3+i]=bytes[byte];
  }
  payload[payload.length-1]=flags;
  return payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength);
}
const setting={arm:{id:40,clip_min:-10,clip_max:10},checkpoint_sha256:'test-checkpoint'};
const model={setting:40,beta:[0,1],gamma:[[2],[3]]};
const buffer=makePacket([[12,-11,NaN],[-10,5,NaN]],3);
const windowRecord={id:'example',grid:2,pairs:2,uncompressed_bytes:buffer.byteLength};
const decoded=packet.decode(buffer,setting,windowRecord,model);
equal(Array.from(decoded.prediction),[12,-11,NaN]);equal(Array.from(decoded.target),[-10,5,NaN]);equal(Array.from(decoded.valid),[1,1,0]);equal(Array.from(decoded.baseline),[4,10,8]);
for(const bad of [makePacket([[12,-11,NaN],[-10,11,NaN]],3),makePacket([[12,-11,NaN],[-10,5,NaN]],7),makePacket([[12,-11,NaN],[-10,5,NaN]],3,{setting:41})]) {
  assert.throws(()=>packet.decode(bad,setting,{...windowRecord,uncompressed_bytes:bad.byteLength},model));checks++;
}
assert.throws(()=>packet.decode(buffer.slice(0,-1),setting,windowRecord,model));checks++;
assert.throws(()=>packet.decode(buffer,setting,windowRecord,{...model,setting:41}));checks++;
console.log(`Passed ${checks} native metric and lossless packet checks.`);
