importScripts('capacity-math.js?v=20260923b', 'capacity-packet.js?v=20260923b', 'comparison.js');
importScripts('map-profiles.js');
let current,profileRaw,profileCache;
onmessage = async event => {
  const {id, type, data} = event.data;
  const started = performance.now();
  try {
    if (type === 'capacity') {
      current = await CapacityPacket.load(data.baseUrl, data.setting, data.window);
      // Keep one worker copy for metrics; the UI receives one copy for drawing.
      postMessage({id, result:current, durationMs:performance.now()-started});
    } else if (type === 'explore') {
      const engine = new HiTracComparison.Engine();
      engine.init(data.map, data.extra, data.model, data.halo);
      engine.prepare(data.method, data.ratio, true);
      const target = engine.a, baseline = engine.b, valid = new Uint8Array(target.length);
      for (let i = 0; i < target.length; i++)
        valid[i] = engine.common[i] && (Number.isFinite(target[i]) || target[i] === -Infinity) && Number.isFinite(baseline[i]) ? 1 : 0;
      postMessage({id, result:{target, baseline, valid}}, [target.buffer, baseline.buffer, valid.buffer]);
    } else if (type === 'init') {
      current = data;
      postMessage({id, result:true});
    } else if (type === 'profileInit') {
      profileRaw=data;profileCache=null;postMessage({id,result:true});
    } else if (type === 'metrics') {
      if (!current) throw Error('Select a loaded map before calculating metrics.');
      const result = CapacityMath.compareMaps(current, data.view, data.lo, data.hi);
      const key=[data.lo,data.hi,data.rawMax].join(':');
      if(!profileCache||profileCache.key!==key)profileCache={key,value:MapProfiles.compute(current,profileRaw,data.lo,data.hi,data.rawMax)};
      result.profiles=profileCache.value;
      postMessage({id, result, durationMs:performance.now()-started});
    }
  } catch (error) {
    postMessage({id, error:error.message});
  }
};
