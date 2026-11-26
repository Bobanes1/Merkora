/**
 * Hardware-accelerated WebGL2 PBR-style 3D Renderer for Merkora's Interactive 3D Studio.
 * Zero external dependencies: real GPU depth buffer (Z-buffer), 3-point studio lighting + Fresnel rim glow,
 * smooth subdivided icospheres, true 3D cylinders/tubes, Saturn/orbital rings, smooth triangle meshes,
 * two-pass translucent glass/X-Ray rendering, and smooth 3D layer explosion offsets.
 */
import type { Model3DScene, Vec3 } from './models3d';

type MeshGPU = { vao: WebGLVertexArrayObject; count: number; vbo: WebGLBuffer; ibo: WebGLBuffer };

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [0.5, 0.7, 0.8];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---------- High-detail unit geometry generators ----------

/** Builds a smooth unit icosphere (subdiv=2 -> 320 tris, subdiv=3 -> 1280 tris). */
function makeIcosphere(subdiv = 2): { verts: Float32Array; indices: Uint16Array } {
  const t = (1 + Math.sqrt(5)) / 2;
  const pts: [number, number, number][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  });

  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const midCache = new Map<string, number>();
  const mid = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const hit = midCache.get(key);
    if (hit !== undefined) return hit;
    const pa = pts[a], pb = pts[b];
    const x = (pa[0] + pb[0]) * 0.5;
    const y = (pa[1] + pb[1]) * 0.5;
    const z = (pa[2] + pb[2]) * 0.5;
    const l = Math.hypot(x, y, z) || 1;
    const idx = pts.length;
    pts.push([x / l, y / l, z / l]);
    midCache.set(key, idx);
    return idx;
  };

  for (let s = 0; s < subdiv; s++) {
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  // Interleaved [px, py, pz, nx, ny, nz]
  const verts = new Float32Array(pts.length * 6);
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i];
    verts[i * 6] = x;
    verts[i * 6 + 1] = y;
    verts[i * 6 + 2] = z;
    verts[i * 6 + 3] = x;
    verts[i * 6 + 4] = y;
    verts[i * 6 + 5] = z;
  }
  const indices = new Uint16Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    indices[i * 3] = faces[i][0];
    indices[i * 3 + 1] = faces[i][1];
    indices[i * 3 + 2] = faces[i][2];
  }
  return { verts, indices };
}

/** Builds a smooth unit cylinder along Y in [-0.5, +0.5], radius 1. */
function makeCylinder(segs = 18): { verts: Float32Array; indices: Uint16Array } {
  const verts: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    verts.push(x, -0.5, z, x, 0, z);
    verts.push(x, 0.5, z, x, 0, z);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  return { verts: new Float32Array(verts), indices: new Uint16Array(indices) };
}

/** Builds a smooth flat 3D planetary ring (annulus) in the XZ plane with inner radius 0.62 and outer radius 1.0. */
function makeRing(segs = 48): { verts: Float32Array; indices: Uint16Array } {
  const verts: number[] = [];
  const indices: number[] = [];
  const rIn = 0.62;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    verts.push(c * rIn, 0, s * rIn, 0, 1, 0);
    verts.push(c, 0, s, 0, 1, 0);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  return { verts: new Float32Array(verts), indices: new Uint16Array(indices) };
}

// ---------- Column-major 4x4 Matrix Math ----------

function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4], b1 = b[col * 4 + 1], b2 = b[col * 4 + 2], b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

function mat4View(rx: number, ry: number, camDist: number): Float32Array {
  // Matches models3d.ts rotate3D: yaw (Y) then pitch (X), then translate Z by -camDist
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const rotY = new Float32Array([
    cy, 0, -sy, 0,
    0, 1, 0, 0,
    sy, 0, cy, 0,
    0, 0, 0, 1,
  ]);
  const rotX = new Float32Array([
    1, 0, 0, 0,
    0, cx, sx, 0,
    0, -sx, cx, 0,
    0, 0, 0, 1,
  ]);
  const trans = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, -camDist, 1,
  ]);
  return mat4Mul(trans, mat4Mul(rotX, rotY));
}

function mat4Sphere(pos: Vec3, r: number): Float32Array {
  return new Float32Array([
    r, 0, 0, 0,
    0, r, 0, 0,
    0, 0, r, 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

function mat4Segment(a: Vec3, b: Vec3, radius: number): Float32Array | null {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-5) return null;
  const uy = dx / len, vy = dy / len, wy = dz / len; // target Y axis
  // Pick orthogonal X axis
  const up: Vec3 = Math.abs(vy) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  let ux = up[1] * wy - up[2] * vy;
  let vx = up[2] * uy - up[0] * wy;
  let wx = up[0] * vy - up[1] * uy;
  const xl = Math.hypot(ux, vx, wx) || 1;
  ux /= xl; vx /= xl; wx /= xl;
  // Z = X cross Y
  const uz = vx * wy - wx * vy;
  const vz = wx * uy - ux * wy;
  const wz = ux * vy - vx * uy;

  const mx = (a[0] + b[0]) * 0.5;
  const my = (a[1] + b[1]) * 0.5;
  const mz = (a[2] + b[2]) * 0.5;
  return new Float32Array([
    ux * radius, vx * radius, wx * radius, 0,
    uy * len, vy * len, wy * len, 0,
    uz * radius, vz * radius, wz * radius, 0,
    mx, my, mz, 1,
  ]);
}

function mat4Ring(pos: Vec3, rOuter: number, tilt: number): Float32Array {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  return new Float32Array([
    rOuter, 0, 0, 0,
    0, c * rOuter, s * rOuter, 0,
    0, -s * rOuter, c * rOuter, 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

const IDENTITY = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

// ---------- GLSL 300 es Shaders ----------

const VS_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vNormalView;
out vec3 vPosView;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 viewPos = uView * world;
  vPosView = viewPos.xyz;
  mat3 normalMat = mat3(uView * uModel);
  vNormalView = normalize(normalMat * aNorm);
  gl_Position = uProj * viewPos;
}
`;

const FS_SRC = `#version 300 es
precision highp float;
in vec3 vNormalView;
in vec3 vPosView;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGlow;
uniform float uShininess;
uniform float uXray;
out vec4 outColor;
void main() {
  vec3 N = normalize(gl_FrontFacing ? vNormalView : -vNormalView);
  vec3 V = normalize(-vPosView);

  // 3-point studio lighting: warm key, cool fill, crisp rim
  vec3 L1 = normalize(vec3(-0.48, 0.72, 0.62));
  vec3 L2 = normalize(vec3(0.68, -0.32, 0.45));
  float diff1 = max(dot(N, L1), 0.0);
  float diff2 = max(dot(N, L2), 0.0);

  vec3 H1 = normalize(L1 + V);
  float spec = pow(max(dot(N, H1), 0.0), uShininess) * 0.46;

  // Hemisphere bounce + Fresnel rim light for realistic sculptural depth
  float hemi = 0.28 + 0.16 * (N.y * 0.5 + 0.5);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.6);

  vec3 lit = uColor * (hemi + diff1 * 0.74 + diff2 * 0.24)
           + vec3(1.0, 0.98, 0.95) * spec
           + mix(uColor, vec3(0.85, 0.96, 1.0), 0.55) * fresnel * (0.28 + uXray * 0.65)
           + uColor * uGlow * 0.55;

  float alpha = uAlpha;
  if (uXray > 0.5 && uAlpha > 0.45) {
    alpha = clamp(0.18 + fresnel * 0.62, 0.18, 0.85);
  }
  outColor = vec4(lit, alpha);
}
`;

export type Render3DOptions = {
  rx: number;
  ry: number;
  zoom: number;
  isDark: boolean;
  activeSpot: string | null;
  hiddenLayers: ReadonlySet<string>;
  explode: number; // 0..1
  xray: boolean;
};

/** Helper to apply smooth 3D explosion offset for any layer/part. */
export function applyExplode(pos: Vec3, dir: Vec3 | undefined, explode: number): Vec3 {
  if (!dir || explode <= 0) return pos;
  return [pos[0] + dir[0] * explode, pos[1] + dir[1] * explode, pos[2] + dir[2] * explode];
}

export class WebGL3DRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private sphereHi: MeshGPU;
  private sphereLo: MeshGPU;
  private cylinder: MeshGPU;
  private ring: MeshGPU;
  private dynVao: WebGLVertexArrayObject;
  private dynVbo: WebGLBuffer;
  private uProj: WebGLUniformLocation | null;
  private uView: WebGLUniformLocation | null;
  private uModel: WebGLUniformLocation | null;
  private uColor: WebGLUniformLocation | null;
  private uAlpha: WebGLUniformLocation | null;
  private uGlow: WebGLUniformLocation | null;
  private uShininess: WebGLUniformLocation | null;
  private uXray: WebGLUniformLocation | null;

  static create(canvas: HTMLCanvasElement): WebGL3DRenderer | null {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return null;
    try {
      return new WebGL3DRenderer(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const vs = this.compile(gl.VERTEX_SHADER, VS_SRC);
    const fs = this.compile(gl.FRAGMENT_SHADER, FS_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'WebGL2 link failed');
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = prog;

    this.uProj = gl.getUniformLocation(prog, 'uProj');
    this.uView = gl.getUniformLocation(prog, 'uView');
    this.uModel = gl.getUniformLocation(prog, 'uModel');
    this.uColor = gl.getUniformLocation(prog, 'uColor');
    this.uAlpha = gl.getUniformLocation(prog, 'uAlpha');
    this.uGlow = gl.getUniformLocation(prog, 'uGlow');
    this.uShininess = gl.getUniformLocation(prog, 'uShininess');
    this.uXray = gl.getUniformLocation(prog, 'uXray');

    this.sphereHi = this.uploadMesh(makeIcosphere(3));
    this.sphereLo = this.uploadMesh(makeIcosphere(2));
    this.cylinder = this.uploadMesh(makeCylinder(18));
    this.ring = this.uploadMesh(makeRing(56));

    // Dynamic VBO for arbitrary Face3D polygons & custom .obj meshes
    this.dynVao = gl.createVertexArray()!;
    this.dynVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.dynVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'Shader compile failed');
    }
    return sh;
  }

  private uploadMesh(geo: { verts: Float32Array; indices: Uint16Array }): MeshGPU {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, geo.verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: geo.indices.length, vbo, ibo };
  }

  render(scene: Model3DScene, widthPx: number, heightPx: number, opts: Render3DOptions) {
    const gl = this.gl;
    gl.viewport(0, 0, widthPx, heightPx);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.prog);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const aspect = widthPx / Math.max(1, heightPx);
    // Match the 2D HUD overlay projection FOV so hotspot labels align pixel-perfectly with WebGL2 meshes!
    const fovY = 2 * Math.atan(0.5 / (0.96 * opts.zoom * Math.min(1, aspect)));
    const proj = mat4Perspective(fovY, aspect, 0.1, 80);
    const view = mat4View(opts.rx, opts.ry, 5.4);

    gl.uniformMatrix4fv(this.uProj, false, proj);
    gl.uniformMatrix4fv(this.uView, false, view);

    type DrawCmd = {
      mesh?: MeshGPU;
      dynVerts?: Float32Array;
      model: Float32Array;
      rgb: [number, number, number];
      alpha: number;
      glow: number;
      shininess: number;
      depth: number;
    };

    const opaque: DrawCmd[] = [];
    const trans: DrawCmd[] = [];
    const push = (cmd: DrawCmd) => {
      if (cmd.alpha < 0.98 || opts.xray) trans.push(cmd);
      else opaque.push(cmd);
    };

    const viewZ = (p: Vec3) => view[2] * p[0] + view[6] * p[1] + view[10] * p[2] + view[14];
    const explodeMap = scene.layerExplode ?? {};

    // Batch opaque faces by color/alpha for blazing-fast rendering of large 3D surfaces & .obj meshes
    const faceBatches = new Map<string, { rgb: [number, number, number]; alpha: number; verts: number[]; zSum: number; n: number }>();

    for (const prim of scene.primitives) {
      const layerKey = prim.layer ?? prim.partId;
      if (layerKey && opts.hiddenLayers.has(layerKey)) continue;
      const dimmed = opts.activeSpot && prim.partId && prim.partId !== opts.activeSpot;
      const alpha = (prim.alpha ?? 1) * (dimmed ? 0.22 : 1);
      const expDir = prim.explode ?? (layerKey ? explodeMap[layerKey] : undefined);

      if (prim.kind === 'sphere') {
        const pos = applyExplode(prim.pos, expDir, opts.explode);
        const rgb = parseHexRgb(prim.color);
        push({
          mesh: prim.r >= 0.28 ? this.sphereHi : this.sphereLo,
          model: mat4Sphere(pos, prim.r),
          rgb,
          alpha,
          glow: prim.glow ? 1 : 0,
          shininess: prim.glow ? 16 : 52,
          depth: viewZ(pos),
        });
        if (prim.ring) {
          push({
            mesh: this.ring,
            model: mat4Ring(pos, prim.ring.rOuter, prim.ring.tilt),
            rgb: parseHexRgb(prim.ring.color),
            alpha: alpha * 0.78,
            glow: 0.15,
            shininess: 24,
            depth: viewZ(pos) - 0.05,
          });
        }
      } else if (prim.kind === 'bond') {
        const a = applyExplode(prim.a, expDir, opts.explode);
        const b = applyExplode(prim.b, expDir, opts.explode);
        const rgb = parseHexRgb(prim.color);
        const mid: Vec3 = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
        if (prim.double) {
          const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
          let ox = -dy, oy = dx, oz = 0;
          const ol = Math.hypot(ox, oy, oz);
          if (ol < 1e-4) { ox = 0; oy = -dz; oz = dy; }
          const n = Math.hypot(ox, oy, oz) || 1;
          const off = prim.radius * 0.95;
          ox = (ox / n) * off; oy = (oy / n) * off; oz = (oz / n) * off;
          const m1 = mat4Segment([a[0] + ox, a[1] + oy, a[2] + oz], [b[0] + ox, b[1] + oy, b[2] + oz], prim.radius * 0.62);
          const m2 = mat4Segment([a[0] - ox, a[1] - oy, a[2] - oz], [b[0] - ox, b[1] - oy, b[2] - oz], prim.radius * 0.62);
          if (m1) push({ mesh: this.cylinder, model: m1, rgb, alpha, glow: 0, shininess: 40, depth: viewZ(mid) });
          if (m2) push({ mesh: this.cylinder, model: m2, rgb, alpha, glow: 0, shininess: 40, depth: viewZ(mid) });
        } else {
          const m = mat4Segment(a, b, prim.radius);
          if (m) push({ mesh: this.cylinder, model: m, rgb, alpha, glow: 0, shininess: 40, depth: viewZ(mid) });
        }
      } else if (prim.kind === 'curve' && prim.pts.length > 1) {
        const rgb = parseHexRgb(prim.color);
        const tubeR = Math.max(0.012, prim.width * 0.0085);
        const step = prim.dashed ? 2 : 1;
        for (let i = 0; i < prim.pts.length - 1; i += step) {
          const a = applyExplode(prim.pts[i], expDir, opts.explode);
          const b = applyExplode(prim.pts[i + 1], expDir, opts.explode);
          const m = mat4Segment(a, b, tubeR);
          if (m) {
            const mid: Vec3 = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
            push({ mesh: this.cylinder, model: m, rgb, alpha: alpha * 0.92, glow: 0.2, shininess: 32, depth: viewZ(mid) });
          }
        }
      } else if (prim.kind === 'face' && prim.pts.length >= 3) {
        const pts = prim.pts.map((p) => applyExplode(p, expDir, opts.explode));
        const a = pts[0], b = pts[1], c = pts[2];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;

        const key = `${prim.fill}|${alpha.toFixed(2)}`;
        let batch = faceBatches.get(key);
        if (!batch) {
          batch = { rgb: parseHexRgb(prim.fill), alpha, verts: [], zSum: 0, n: 0 };
          faceBatches.set(key, batch);
        }
        for (let k = 1; k < pts.length - 1; k++) {
          const p0 = pts[0], p1 = pts[k], p2 = pts[k + 1];
          batch.verts.push(
            p0[0], p0[1], p0[2], nx, ny, nz,
            p1[0], p1[1], p1[2], nx, ny, nz,
            p2[0], p2[1], p2[2], nx, ny, nz,
          );
          batch.zSum += viewZ([(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3]);
          batch.n++;
        }
      }
    }

    for (const b of faceBatches.values()) {
      if (!b.verts.length) continue;
      push({
        dynVerts: new Float32Array(b.verts),
        model: IDENTITY,
        rgb: b.rgb,
        alpha: b.alpha,
        glow: 0.05,
        shininess: 36,
        depth: b.zSum / Math.max(1, b.n),
      });
    }

    const drawCmd = (cmd: DrawCmd) => {
      gl.uniformMatrix4fv(this.uModel, false, cmd.model);
      gl.uniform3f(this.uColor, cmd.rgb[0], cmd.rgb[1], cmd.rgb[2]);
      gl.uniform1f(this.uAlpha, cmd.alpha);
      gl.uniform1f(this.uGlow, cmd.glow);
      gl.uniform1f(this.uShininess, cmd.shininess);
      gl.uniform1f(this.uXray, opts.xray ? 1 : 0);
      if (cmd.mesh) {
        gl.bindVertexArray(cmd.mesh.vao);
        gl.drawElements(gl.TRIANGLES, cmd.mesh.count, gl.UNSIGNED_SHORT, 0);
      } else if (cmd.dynVerts) {
        gl.bindVertexArray(this.dynVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynVbo);
        gl.bufferData(gl.ARRAY_BUFFER, cmd.dynVerts, gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, cmd.dynVerts.length / 6);
      }
    };

    // Pass 1: opaque geometry with full depth writes
    gl.depthMask(true);
    for (const cmd of opaque) drawCmd(cmd);

    // Pass 2: translucent glass / cutaway layers sorted back-to-front
    if (trans.length) {
      trans.sort((a, b) => a.depth - b.depth);
      gl.depthMask(false);
      for (const cmd of trans) drawCmd(cmd);
      gl.depthMask(true);
    }
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    for (const m of [this.sphereHi, this.sphereLo, this.cylinder, this.ring]) {
      gl.deleteVertexArray(m.vao);
      gl.deleteBuffer(m.vbo);
      gl.deleteBuffer(m.ibo);
    }
    gl.deleteVertexArray(this.dynVao);
    gl.deleteBuffer(this.dynVbo);
    gl.deleteProgram(this.prog);
  }
}

/** Projects a 3D point using the exact same perspective parameters as WebGL3DRenderer so 2D labels match 3D meshes. */
export function projectWebGL3D(
  pos: Vec3,
  rx: number,
  ry: number,
  widthCss: number,
  heightCss: number,
  zoom: number,
): { x: number; y: number; z: number; scale: number } {
  const aspect = widthCss / Math.max(1, heightCss);
  const fovY = 2 * Math.atan(0.5 / (0.96 * zoom * Math.min(1, aspect)));
  const proj = mat4Perspective(fovY, aspect, 0.1, 80);
  const view = mat4View(rx, ry, 5.4);
  const vx = view[0] * pos[0] + view[4] * pos[1] + view[8] * pos[2] + view[12];
  const vy = view[1] * pos[0] + view[5] * pos[1] + view[9] * pos[2] + view[13];
  const vz = view[2] * pos[0] + view[6] * pos[1] + view[10] * pos[2] + view[14];
  const cx = proj[0] * vx;
  const cy = proj[5] * vy;
  const cw = Math.max(0.1, -vz);
  return {
    x: (cx / cw * 0.5 + 0.5) * widthCss,
    y: (0.5 - cy / cw * 0.5) * heightCss,
    z: vz,
    scale: (proj[5] * heightCss * 0.5) / cw,
  };
}
