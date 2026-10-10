'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const features=require('../site/viewer-features.js');
const index=JSON.parse(fs.readFileSync(path.join(__dirname,'../site/viewer-features.json')));
let checked=0;
// Independently enumerate half-open intervals, including boundaries and empty windows.
for(const chrom of ['chr3','chr4','chrY']) {
 const dir=path.join(__dirname,'../site');
 const loopPath=path.join(dir,`loops-reprocessed/${chrom}.json.gz`);
 const loops=fs.existsSync(loopPath)?JSON.parse(zlib.gunzipSync(fs.readFileSync(loopPath))):[];
 const peaks=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir,`tracks/peaks/${chrom}.json.gz`))));
 for(const [key,value] of Object.entries(index.annotations[chrom])) {
  const [start,end]=key.split(':').map(Number),record={chrom,start,end};
  const expected=[loops.filter(([a,b,c,d])=>b>start&&a<end&&d>start&&c<end).length,peaks.filter(([a,b])=>b>start&&a<end).length];
  assert.deepEqual(value,expected);
  for(const loopFilter of [false,true])for(const peakFilter of [false,true])assert.equal(features.allows(index,record,loopFilter,peakFilter),(!loopFilter||expected[0]>0)&&(!peakFilter||expected[1]>0));
  checked++;
 }
}
const spec={kind:'counts',low:1,high:11};
assert.equal(features.stretch(Math.log1p(6),spec),50);
assert.equal(features.stretch(Math.log1p(100),spec),100);
assert.equal(features.stretch(Math.log1p(6),spec,true),0);
assert.ok(Number.isNaN(features.stretch(NaN,spec)));
const n=4,len=n*(n+1)/2,values=Float32Array.from({length:len},(_,i)=>i-5),support=new Uint8Array(len).fill(1);
const before=Buffer.from(values.buffer).toString('hex');
const bounds=features.targetBounds(values,support,n,99);
assert.ok(bounds.high>bounds.low);
assert.equal(Buffer.from(values.buffer).toString('hex'),before);
support.fill(0);assert.ok(features.targetBounds(values,support,n,99).high>0);
assert.throws(()=>features.allows(index,{chrom:'unknown',start:0,end:1},true,false),/unavailable/);
console.log(`Verified ${checked} annotation windows, independent filters, shared display bounds, empty support and source nonmutation.`);
