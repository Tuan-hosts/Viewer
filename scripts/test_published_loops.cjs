const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const colors=require('../site/map-colors.js'),loops=require('../site/published-loops.js');
let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
function rgb(v,s=true,lo=-5,hi=5){const p=new Uint8ClampedArray(4);colors.write(p,0,v,s,lo,hi);return [...p];}
eq(rgb(-5),[0,0,255,255]);eq(rgb(0),[255,255,255,255]);eq(rgb(5),[255,0,0,255]);
eq(rgb(-2.5),[128,128,255,255]);eq(rgb(2.5),[255,128,128,255]);
eq(rgb(-100),rgb(-5));eq(rgb(100),rgb(5));eq(rgb(-Infinity),rgb(-5));eq(rgb(Infinity),rgb(5));
eq(rgb(-5,false),rgb(NaN));eq(rgb(NaN),rgb(0));
eq(rgb(0,true,0,5),[255,255,255,255]);eq(rgb(0,true,1,5),[255,255,255,255]);
eq(rgb(2.5,true,0,5),[255,128,128,255]);
eq(rgb(-1,true,-2,8),[128,128,255,255]);eq(rgb(4,true,-2,8),[255,128,128,255]);
assert(colors.gradient(-2,8).includes('#ffffff 20%'));checks++;
assert(!colors.gradient(0,5).includes('0,0,255'));checks++;
const plot={x:73,y:18,size:704},record={start:1000000,bin_bp:1000},view={x:0,y:0,size:1000};
const anchors=[[1100000,1110000,1200000,1220000]];
const original=JSON.stringify(anchors),g=loops.rectangles(anchors,record,view,plot);
eq(g.count,1);eq(g.boxes.length,2);eq(JSON.stringify(anchors),original);
function close(a,b){assert(a.every((v,i)=>Math.abs(v-b[i])<1e-10));checks++;}
close(g.boxes[0],[143.4,158.8,7.04,14.08]);
close(g.boxes[1],[213.8,88.4,14.08,7.04]);
const coarse=loops.rectangles(anchors,{...record,bin_bp:5000},{x:0,y:0,size:200},plot);
eq(coarse,g);
const offdiag=loops.rectangles(anchors,record,{x:90,y:190,size:50},plot);
eq(offdiag.count,1);eq(offdiag.boxes.length,1);
eq(loops.rectangles(anchors,record,{x:300,y:300,size:100},plot).count,0);
eq(loops.rectangles([[900000,1000000,1100000,1110000]],record,view,plot).count,0);
eq(loops.rectangles([],record,view,plot),{boxes:[],count:0});
eq(loops.rectangles([[1000000,1000001,1005000,1005001]],record,view,plot).boxes.map(v=>v.slice(2)),[[6,6],[6,6]]);
const site=path.join(__dirname,'../site'),manifest=JSON.parse(fs.readFileSync(path.join(site,'loops/manifest.json')));
let total=0;
for(const [chrom,p] of Object.entries(manifest.packets)){
 const raw=fs.readFileSync(path.join(site,p.file));eq(raw.length,p.bytes);eq(crypto.createHash('sha256').update(raw).digest('hex'),p.sha256);
 const a=JSON.parse(zlib.gunzipSync(raw));eq(a.length,p.loops);total+=a.length;
 assert(a.every((v,i)=>v.length===4&&v.every(Number.isInteger)&&v[0]>=0&&v[0]<v[1]&&v[0]<=v[2]&&v[2]<v[3]&&(!i||a[i-1][0]<=v[0])));checks++;
 if(chrom==='chr3'){
  const region={start:172000000,bin_bp:1000};
  const results=loops.rectangles(a,region,view,plot);
  const direct=a.filter(([a,b,c,d])=>b>172000000&&a<173000000&&d>172000000&&c<173000000);
  eq(results.count,direct.length);eq(results.boxes.length,2*direct.length);eq(results.count,51);
 }
}
eq(total,98850);eq(total,manifest.total_loops);
console.log(`Passed ${checks} loop, coordinate, color and packaged-data checks.`);
