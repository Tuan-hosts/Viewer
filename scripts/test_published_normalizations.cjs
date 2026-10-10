'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const N=require('../site/published-normalizations.js');
const reference=JSON.parse(fs.readFileSync(path.join(__dirname,'normalization-reference-fixtures.json')));
let checked=0;
for(const fixture of reference.fixtures){
 const before=JSON.stringify(fixture.map),out=N.makeTarget(fixture.method,fixture.map,null,fixture.options);
 assert.equal(JSON.stringify(fixture.map),before,'Source counts must stay unchanged');
 out.target.forEach((value,k)=>{assert.ok(Math.abs(value-fixture.expected[k])<2e-6,`${fixture.method} pixel ${k}: ${value} vs ${fixture.expected[k]}`);checked++;});
 if(fixture.standardizedRGB)out.target.forEach((value,k)=>N.foundationRGB(value,true).forEach((channel,c)=>assert.ok(Math.abs(channel-fixture.standardizedRGB[k][c])<2e-6,'HiCFoundation standardized tensor channel')));
}
assert.throws(()=>N.evo2Value(1,10,5),/max reads/);
const empty=N.makeTarget('hicfoundation',{n:3,v:[1,1,1],index:[],counts:[]},null);
assert.ok(empty.target.every(x=>x===0));assert.ok(empty.notice.includes('divide by zero'));
assert.ok(N.evo2Value(0)<0);assert.equal(N.evo2Value(1000000),1);
for(const value of [-1,0,1]){const pixels=new Uint8ClampedArray(4);N.writeColor(pixels,0,value,0,-1,1);assert.deepEqual([...pixels],[255,255,255,255]);}
const map={n:4,v:[1,1,0,1],index:[3,6],counts:[6,9]},result=N.makeTarget('evo2hic',map,null);
assert.equal(result.valid[2],0);assert.equal(result.valid[3],1);
console.log(`Published preprocessing: ${checked} pixels match upstream Evo2HiC/HiCFoundation, RGB tensors match, source counts unchanged, missing support and empty-window guard verified.`);
