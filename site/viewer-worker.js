importScripts('capacity-math.js', 'comparison.js');
let current;
onmessage = event => {
  const {id, type, data} = event.data;
  try {
    if (type === 'explore') {
      const engine = new HiTracComparison.Engine();
      engine.init(data.map, data.extra, data.model, data.halo);
      engine.prepare(data.method, data.ratio, true);
      const target = engine.a, baseline = engine.b, valid = new Uint8Array(target.length);
      for (let i = 0; i < target.length; i++)
        valid[i] = engine.common[i] && (Number.isFinite(target[i]) || target[i] === -Infinity) && Number.isFinite(baseline[i]) ? 1 : 0;
      postMessage({id, result:{target, baseline, valid}}, [target.buffer, baseline.buffer, valid.buffer]);
    } else if (type === 'init') {
      current = data; postMessage({id, result:true});
    } else if (type === 'metrics') {
      const {view, lo, hi} = data;
      let target = current.target;
      if (current.exploreRatio) {
        target = target.slice();
        for (let i=0;i<target.length;i++) if(target[i] === -Infinity) target[i]=lo;
      }
      const input = {...current, target};
      const prediction = current.prediction ? CapacityMath.metrics(input,view,lo,hi).comparison : null;
      const baseline = current.scoreBaseline ? CapacityMath.metrics({...input,prediction:current.baseline},view,lo,hi).comparison : null;
      postMessage({id, result:{prediction, baseline}});
    }
  } catch (e) { postMessage({id,error:e.message}); }
};
