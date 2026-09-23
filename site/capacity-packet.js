/* Lossless prediction loading runs in the map worker, never during UI painting. */
(function (scope) {
  "use strict";
  async function checkedFetch(path, hash, expectedBytes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) throw Error(`Map download failed (${response.status}). Use Retry.`);
      const bytes = await response.arrayBuffer();
      if (expectedBytes !== undefined && bytes.byteLength !== expectedBytes)
        throw Error("Incomplete map download. Use Retry.");
      const actual = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        value => value.toString(16).padStart(2, "0")).join("");
      if (actual !== hash) throw Error("Map checksum failed. Use Retry.");
      return bytes;
    } catch (error) {
      if (error.name === "AbortError") throw Error("Map download timed out. Use Retry.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  function unshuffle(bytes, count) {
    const values = new Float32Array(count), output = new Uint8Array(values.buffer);
    for (let byte = 0; byte < 4; byte++)
      for (let i = 0; i < count; i++) output[4 * i + byte] = bytes[byte * count + i];
    return values;
  }
  function decode(buffer, setting, windowRecord, model) {
    if (buffer.byteLength !== windowRecord.uncompressed_bytes || buffer.byteLength < 8)
      throw Error("Incomplete decompressed map.");
    const headerLength = new DataView(buffer).getUint32(0, true);
    if (headerLength > buffer.byteLength - 4) throw Error("Invalid prediction header.");
    const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength)));
    const count = metadata.length, offset = 4 + headerLength;
    if (metadata.version !== 1 || metadata.setting !== setting.arm.id ||
        metadata.window.id !== windowRecord.id || metadata.checkpoint_sha256 !== setting.checkpoint_sha256 ||
        count !== windowRecord.grid * (windowRecord.grid + 1) / 2 ||
        buffer.byteLength !== offset + count * 8 + Math.ceil(count / 8))
      throw Error("Prediction and target do not match the selected setting.");
    const prediction = unshuffle(new Uint8Array(buffer, offset, count * 4), count);
    const target = unshuffle(new Uint8Array(buffer, offset + count * 4, count * 4), count);
    const bits = new Uint8Array(buffer, offset + count * 8), valid = new Uint8Array(count);
    let pairs = 0;
    for (let i = 0; i < count; i++) {
      valid[i] = (bits[i >> 3] >> (i & 7)) & 1;
      if (!valid[i]) continue;
      pairs++;
      if (!Number.isFinite(target[i]) || !Number.isFinite(prediction[i]) ||
          target[i] < setting.arm.clip_min || target[i] > setting.arm.clip_max)
        throw Error("Invalid supported target or prediction.");
    }
    if (pairs !== windowRecord.pairs || pairs !== metadata.pairs)
      throw Error("Support does not match the saved result.");
    if (model.setting !== setting.arm.id || model.beta.length !== windowRecord.grid)
      throw Error("Baseline setting mismatch.");
    return { meta: { window: metadata.window, arm: setting.arm }, target, prediction, valid,
      baseline: scope.CapacityMath.baselineValues(model, metadata.features),
      scoreBaseline: true, capacity: true };
  }
  async function load(baseUrl, setting, windowRecord) {
    const [compressed, modelBytes] = await Promise.all([
      checkedFetch(baseUrl + windowRecord.file, windowRecord.sha256, windowRecord.bytes),
      checkedFetch(baseUrl + setting.model.file, setting.model.sha256)
    ]);
    const buffer = await new Response(new Blob([compressed]).stream()
      .pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return decode(buffer, setting, windowRecord, JSON.parse(new TextDecoder().decode(modelBytes)));
  }
  const api = { load, decode };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.CapacityPacket = api;
})(typeof self !== "undefined" ? self : globalThis);
