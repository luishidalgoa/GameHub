/**
 * A full-screen animated background in plain WebGL (no three.js): a domain-warped
 * noise field, tinted by a three-color palette that eases toward whatever palette
 * it is given. Plain module, no React, so it can also be bundled alone to test
 * the render in a browser.
 */
export type RGB = [number, number, number]

export interface ShaderBackground {
  /** Ease toward these colors (0-1 per channel). */
  setPalette(colors: RGB[]): void
  dispose(): void
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + 17.1; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  p += (uMouse - 0.5) * 0.12;
  float t = uTime * 0.045;

  // Two layers of domain warping: the field folds over itself like slow liquid.
  vec2 q = vec2(fbm(p * 1.5 + t), fbm(p * 1.5 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 1.5 + 3.0 * q + vec2(1.7, 9.2) + t * 1.3),
                fbm(p * 1.5 + 3.0 * q + vec2(8.3, 2.8) - t * 1.1));
  float f = fbm(p * 1.3 + 3.2 * r);

  vec3 base = vec3(0.012, 0.012, 0.022);
  vec3 col = base;
  col = mix(col, uA, smoothstep(0.25, 0.85, f) * 0.80);
  col = mix(col, uB, smoothstep(0.35, 1.05, length(q)) * 0.55);
  col = mix(col, uC, smoothstep(0.45, 0.95, r.x) * 0.45);

  // Bright ridges where the field folds: a thin, soft highlight.
  float ridge = smoothstep(0.0, 0.05, 0.5 - abs(f - 0.52)) * 0.10;
  col += ridge * (uA + uC);

  // Darker toward the edges and the bottom, so content stays readable.
  float vig = smoothstep(1.25, 0.25, length(uv - vec2(0.5, 0.42)) * 1.35);
  col *= mix(0.45, 1.0, vig);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.7, uv.y));

  // Film grain, so the gradients do not band.
  col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * 0.028;
  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`shader: ${log}`)
  }
  return sh
}

/** Resolution scale of the canvas: the field is soft, so a quarter of the pixels is plenty. */
const SCALE = 0.5
const FRAME_MS = 1000 / 30

export function mountShaderBackground(canvas: HTMLCanvasElement, initial: RGB[]): ShaderBackground {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
  if (!gl) throw new Error('no webgl')

  const prog = gl.createProgram()!
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('shader link failed')
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const u = {
    res: gl.getUniformLocation(prog, 'uRes'),
    time: gl.getUniformLocation(prog, 'uTime'),
    mouse: gl.getUniformLocation(prog, 'uMouse'),
    a: gl.getUniformLocation(prog, 'uA'),
    b: gl.getUniformLocation(prog, 'uB'),
    c: gl.getUniformLocation(prog, 'uC'),
  }

  const pad = (cols: RGB[]): RGB[] => [cols[0], cols[1] ?? cols[0], cols[2] ?? cols[1] ?? cols[0]]
  let current = pad(initial).map(c => [...c] as RGB)
  let target = pad(initial)
  let mouse: [number, number] = [0.5, 0.5]
  let mouseTarget: [number, number] = [0.5, 0.5]

  const resize = () => {
    const w = Math.max(2, Math.floor(canvas.clientWidth * SCALE))
    const h = Math.max(2, Math.floor(canvas.clientHeight * SCALE))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  const onMove = (e: PointerEvent) => {
    mouseTarget = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight]
  }
  window.addEventListener('pointermove', onMove, { passive: true })

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  let raf = 0
  let hidden = typeof document !== 'undefined' && document.hidden
  let last = performance.now()
  let lastDraw = 0
  let clock = 0

  const draw = (dt: number) => {
    // Colors ease toward the target (about 0.6 s to settle), as does the mouse.
    const k = 1 - Math.exp(-dt * 4)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) current[i][j] += (target[i][j] - current[i][j]) * k
    mouse = [mouse[0] + (mouseTarget[0] - mouse[0]) * k * 0.5, mouse[1] + (mouseTarget[1] - mouse[1]) * k * 0.5]
    gl.uniform2f(u.res, canvas.width, canvas.height)
    gl.uniform1f(u.time, clock)
    gl.uniform2f(u.mouse, mouse[0], mouse[1])
    gl.uniform3fv(u.a, current[0])
    gl.uniform3fv(u.b, current[1])
    gl.uniform3fv(u.c, current[2])
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (now - lastDraw < FRAME_MS) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    lastDraw = now
    clock += dt
    draw(dt)
  }
  const sync = () => {
    cancelAnimationFrame(raf)
    if (reduced) { clock = 12; for (let k = 0; k < 40; k++) draw(0.1); return }
    if (!hidden) { last = performance.now(); raf = requestAnimationFrame(loop) }
  }
  const onVisibility = () => { hidden = document.hidden; sync() }
  document.addEventListener('visibilitychange', onVisibility)
  sync()

  return {
    setPalette(colors) {
      if (colors.length === 0) return
      target = pad(colors)
      if (reduced) { current = target.map(c => [...c] as RGB); draw(0) }
    },
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVisibility)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      // The context is not forced to be lost: React may mount again on this same
      // canvas, and getContext would hand back the dead one. It is released with
      // the canvas when the page leaves.
    },
  }
}
