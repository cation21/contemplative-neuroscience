// Flowing silk background: one full-screen WebGL fragment shader (no textures, ~2 KB).
// A height field made of domain-warped sine waves is lit like satin: diffuse shading picks the
// colour, a tight specular term draws the sheen along each fold.
// Renders at half resolution and ~30 fps, only while on screen; a single still frame when the
// visitor prefers reduced motion. Without WebGL the CSS gradient behind the canvas shows instead.

import { reducedMotion, whileVisible } from "../core/dom.js";

const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FRAG = `precision mediump float;
uniform vec2 uRes; uniform float uTime;
const vec3 C0 = vec3(0.040, 0.016, 0.085);
const vec3 C1 = vec3(0.200, 0.085, 0.380);
const vec3 C2 = vec3(0.460, 0.250, 0.560);
const vec3 SHEEN = vec3(1.000, 0.850, 0.960);
float H(vec2 p, float t) {
  vec2 q = p;
  q += 0.45 * vec2(sin(q.y * 1.3 + t * 0.11), cos(q.x * 1.1 - t * 0.09));
  q += 0.25 * vec2(sin(q.y * 2.7 - t * 0.07 + 1.7), cos(q.x * 2.3 + t * 0.08 + 0.5));
  return sin(q.x * 1.6 + q.y * 0.9) * 0.6 + sin(q.x * 0.7 - q.y * 1.9 + 1.3) * 0.4;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.2;
  float e = 0.01, h = H(p, uTime);
  vec3 n = normalize(vec3(-(H(p + vec2(e, 0.), uTime) - h) / e * 0.9, -(H(p + vec2(0., e), uTime) - h) / e * 0.9, 1.0));
  vec3 L = normalize(vec3(-0.5, 0.6, 0.65));
  float diff = clamp(dot(n, L), 0., 1.);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0., 0., 1.)), 0., 1.), 14.);
  vec3 col = mix(C0, C1, smoothstep(0.2, 0.8, diff));
  col = mix(col, C2, smoothstep(0.78, 1.0, diff) * 0.75) + SHEEN * spec * 0.18;
  col *= mix(0.30, 1.0, smoothstep(1.3, 0.2, length((uv - 0.5) * vec2(1.2, 1.0))));
  gl_FragColor = vec4(col, 1.0);
}`;

export function startSilk(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return () => {};
  const prog = link(gl);
  if (!prog) return () => {};
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime");

  const resize = () => {
    const scale = 0.5 * Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * scale)), h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  };
  const frame = (t) => { resize(); gl.uniform1f(uTime, t); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  canvas.classList.add("is-live");

  if (reducedMotion()) {
    frame(18);
    const onResize = () => frame(18);
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }
  let raf = 0, last = 0;
  const t0 = performance.now() - 18000;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;      // ~30 fps is plenty for slow silk
    last = now;
    frame((now - t0) / 1000);
  };
  return whileVisible(canvas, () => { raf = requestAnimationFrame(loop); }, () => cancelAnimationFrame(raf));
}

function link(gl) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.useProgram(p);
  return p;
}
