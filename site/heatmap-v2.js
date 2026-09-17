class Heatmap {
  constructor(canvas, role) {
    this.canvas = canvas;
    this.role = role;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl)
      throw Error(
        "WebGL2 is unavailable. Open in Chrome or Edge with graphics acceleration enabled.",
      );
    this.gl = gl;
    const vertex =
      "#version 300 es\nprecision highp float;out vec2 uv;void main(){vec2 p=vec2((gl_VertexID==1)?3.0:-1.0,(gl_VertexID==2)?3.0:-1.0);uv=(p+1.0)/2.0;gl_Position=vec4(p,0,1);}";
    const fragment =
      "#version 300 es\nprecision highp float;precision highp sampler2D;in vec2 uv;out vec4 color;uniform sampler2D dataMap;uniform sampler2D support;uniform vec3 view;uniform vec2 scale;uniform vec2 bounds;uniform int grid;uniform bool clipValues;void main(){ivec2 p=ivec2(floor(view.xy+vec2(uv.x,1.0-uv.y)*view.z));if(p.x<0||p.y<0||p.x>=grid||p.y>=grid){color=vec4(1);return;}if(texelFetch(support,ivec2(p.x,0),0).r<0.5||texelFetch(support,ivec2(p.y,0),0).r<0.5){color=vec4(1);return;}float t=texelFetch(dataMap,p,0).r;if(isnan(t)||isinf(t)){color=vec4(1);return;}if(clipValues)t=clamp(t,bounds.x,bounds.y);float s=clamp((t-scale.x)/(scale.y-scale.x),0.0,1.0);color=vec4(1.0,1.0-s,1.0-s,1.0);}";
    function shader(type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(s));
      return s;
    }
    const vs = shader(gl.VERTEX_SHADER, vertex),
      fs = shader(gl.FRAGMENT_SHADER, fragment);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(this.program));
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.uniforms = {};
    for (const k of [
      "dataMap",
      "support",
      "view",
      "scale",
      "bounds",
      "grid",
      "clipValues",
    ])
      this.uniforms[k] = gl.getUniformLocation(this.program, k);
    gl.bindVertexArray(gl.createVertexArray());
    new ResizeObserver(() => schedule()).observe(canvas);
  }
  texture(unit, old, internal, w, h, format, type, values) {
    const g = this.gl;
    if (old) g.deleteTexture(old);
    const t = g.createTexture();
    g.activeTexture(g.TEXTURE0 + unit);
    g.bindTexture(g.TEXTURE_2D, t);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, internal, w, h, 0, format, type, values);
    return t;
  }
  setData(data, dense) {
    const g = this.gl;
    if (data.n > g.getParameter(g.MAX_TEXTURE_SIZE))
      throw Error("This browser cannot display a " + data.n + "-bin map.");
    this.dataTex = this.texture(
      0,
      this.dataTex,
      g.R32F,
      data.n,
      data.n,
      g.RED,
      g.FLOAT,
      dense,
    );
    this.supportTex = this.texture(
      1,
      this.supportTex,
      g.R8,
      data.n,
      1,
      g.RED,
      g.UNSIGNED_BYTE,
      Uint8Array.from(data.v, (v) => (v ? 255 : 0)),
    );
    this.n = data.n;
    if (g.getError() !== g.NO_ERROR)
      throw Error("Could not allocate map texture.");
  }
  draw() {
    if (!map || !this.n) return;
    const g = this.gl,
      r = this.canvas.getBoundingClientRect(),
      size = Math.max(
        1,
        Math.min(
          1800,
          Math.round(r.width * Math.min(devicePixelRatio || 1, 2)),
        ),
      );
    if (this.canvas.width !== size) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
    g.viewport(0, 0, size, size);
    g.useProgram(this.program);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, this.dataTex);
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, this.supportTex);
    const u = this.uniforms;
    g.uniform1i(u.dataMap, 0);
    g.uniform1i(u.support, 1);
    g.uniform3f(u.view, view.x, view.y, view.size);
    const processed = this.role === "processed",
      stretch = processed && $("scale").value === "stretch",
      range = normalRange();
    g.uniform2f(
      u.scale,
      processed ? (stretch ? lo : range[0]) : 0,
      processed ? (stretch ? hi : range[1]) : rawMax,
    );
    g.uniform2f(u.bounds, lo, hi);
    g.uniform1i(u.grid, map.n);
    g.uniform1i(u.clipValues, this.role === "processed" ? 1 : 0);
    g.drawArrays(g.TRIANGLES, 0, 3);
  }
}
