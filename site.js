// ============================================================
// 厂区环境与公辅设施
//  · 天空（渐变 + 太阳 + 云 + 星空）与环境反射
//  · 地面（宏观分区贴图 + 细节贴图）、道路、铁路、管廊、皮带通廊
//  · 公辅：自备电厂/冷却塔、煤气柜、制氧站、水处理、渣场、办公调度楼
//  · 绿化、路灯（夜间光斑）、往来卡车
// ============================================================
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  MAT, Kit, hcol, lattice, railing, platform, track, gallery, transferTower,
  chimney, tank, silo, building,
} from "./kit.js";
import { TEX } from "./textures.js";
import { FX } from "./effects.js";
import { torpedo, coilShape } from "./plant.js";

const PI = Math.PI;

// ---------- 天空 ----------
const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */ `
uniform vec3 uTop, uHorizon, uGround, uSunDir, uSunColor, uGlow;
uniform float uTime, uNight;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, uGround, smoothstep(0.0, -0.06, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 8.0) * 0.22 + pow(sd, 90.0) * 0.6);
  col += uSunColor * smoothstep(0.99955, 0.9998, sd) * 10.0 * (1.0 - uNight);
  // 地平线处的工业光污染/暖色雾霭
  col += uGlow * exp(-abs(h) * 14.0);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.15) * 1.3 + vec2(uTime * 0.004, uTime * 0.0016);
    float c = fbm(uv * 1.4);
    c = smoothstep(0.52, 0.86, c) * smoothstep(0.0, 0.2, h);
    vec3 cc = mix(uHorizon * 1.08, vec3(1.0) * (1.0 - uNight * 0.93), 0.55) + uSunColor * pow(sd, 5.0) * 0.25;
    col = mix(col, cc, c * 0.8);
    if (uNight > 0.5) {
      vec2 sp = floor(d.xz / (h + 0.25) * 420.0);
      col += step(0.9982, hash(sp)) * vec3(0.9) * smoothstep(0.05, 0.4, h) * (1.0 - c);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const SKY_PRESETS = {
  day: {
    top: 0x3f6fa6, horizon: 0xc6d0d6, ground: 0x6d6a64, sun: 0xfff1dc, glow: 0x000000,
    sunDir: [-0.55, 0.62, 0.56], sunI: 2.6, hemiI: 0.55, hemiSky: 0xbcd3ea, hemiGround: 0x5a5249,
    fog: 0xbfc8ce, fogD: 0.00042, exposure: 1.0, night: 0, bloom: [0.55, 0.6, 2.2],
  },
  night: {
    top: 0x03060d, horizon: 0x141a26, ground: 0x0a0b0d, sun: 0x8a9cc0, glow: 0x2a1508,
    sunDir: [0.4, 0.55, -0.6], sunI: 0.7, hemiI: 0.55, hemiSky: 0x3c4c70, hemiGround: 0x141210,
    fog: 0x1a1f2a, fogD: 0.0005, exposure: 1.35, night: 1, bloom: [0.85, 0.5, 1.3],
  },
};

export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uTime: { value: 0 }, uNight: { value: 0 },
    },
    vertexShader: SKY_VS, fragmentShader: SKY_FS,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  sky.scale.setScalar(4000);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

export function applySkyPreset(sky, p) {
  const u = sky.material.uniforms;
  u.uTop.value.setHex(p.top); u.uHorizon.value.setHex(p.horizon); u.uGround.value.setHex(p.ground);
  u.uSunColor.value.setHex(p.sun); u.uGlow.value.setHex(p.glow);
  u.uSunDir.value.set(...p.sunDir).normalize();
  u.uNight.value = p.night;
}

// ---------- 地面 ----------
const GW = 2400, GH = 1400;
function groundTexture() {
  const W = 2048, H = 1200;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  const X = (x) => ((x + GW / 2) / GW) * W, Z = (z) => ((z + GH / 2) / GH) * H;
  const rect = (x0, z0, x1, z1, col, a = 1) => { c.globalAlpha = a; c.fillStyle = col; c.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0)); };
  const blob = (x, z, r, col, a) => {
    const g = c.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), (r / GW) * W);
    g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
    c.globalAlpha = a; c.fillStyle = g; c.fillRect(X(x - r), Z(z - r), (2 * r / GW) * W, (2 * r / GH) * H);
  };
  // 草地底色 → 厂区压实地坪
  c.fillStyle = "#5d6e45"; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 400; i++) blob(Math.random() * GW - GW / 2, Math.random() * GH - GH / 2, 20 + Math.random() * 80, Math.random() < 0.5 ? "#4f6239" : "#77805a", 0.35);
  rect(-780, -300, 560, 92, "#7d776c");
  for (let i = 0; i < 500; i++) blob(Math.random() * 1340 - 780, Math.random() * 390 - 300, 8 + Math.random() * 40, ["#6d675d", "#8b8478", "#746a5c"][i % 3], 0.35);
  // 厂前区：草坪 + 小片硬化
  rect(-780, 92, 560, 300, "#557c38", 0.92);
  for (let i = 0; i < 160; i++) blob(Math.random() * 1340 - 780, 92 + Math.random() * 210, 10 + Math.random() * 50, ["#4c7232", "#68854a", "#5a7a3c"][i % 3], 0.45);
  // 各区混凝土地坪
  const pads = [
    [-245, -70, -75, 40], [-62, -48, 212, 26], [208, -34, 482, 50], [-372, -36, -334, 36],
    [-555, -160, -385, -60], [-590, 85, -380, 190], [-60, 90, 60, 130], [100, -180, 210, -95], [255, -200, 380, -100],
    [-300, -185, -150, -110],
  ];
  for (const [x0, z0, x1, z1] of pads) rect(x0, z0, x1, z1, "#9c978d", 0.9);
  // 原料场：红褐矿粉与黑色煤粉污染
  rect(-740, -80, -560, 80, "#6e4c3a", 0.85);
  blob(-650, -56, 70, "#5a3424", 0.6); blob(-650, 19, 70, "#26262a", 0.6); blob(-650, 56, 60, "#9a958a", 0.4);
  blob(-470, -110, 90, "#3a3836", 0.35); blob(-490, 140, 80, "#4a3830", 0.3);
  // 渣场
  blob(40, 40, 50, "#6c6a66", 0.6);
  // 油渍/水渍
  for (let i = 0; i < 260; i++) blob(Math.random() * 1200 - 700, Math.random() * 440 - 240, 3 + Math.random() * 12, "#3d3a35", 0.18);
  c.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildGround() {
  const mat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: TEX.groundDetail };
    sh.fragmentShader = "uniform sampler2D uDetail;\n" + sh.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       float dt = texture2D(uDetail, vMapUv * vec2(${(GW / 5).toFixed(3)}, ${(GH / 5).toFixed(3)})).r * 0.65 + texture2D(uDetail, vMapUv * vec2(${(GW / 37).toFixed(3)}, ${(GH / 37).toFixed(3)})).r * 0.35;
       diffuseColor.rgb *= dt * 2.0;`);
  };
  const g = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), mat);
  g.rotation.x = -PI / 2;
  g.receiveShadow = true;
  // 远山
  const hills = new THREE.CylinderGeometry(3400, 3400, 1, 160, 1, true);
  const p = hills.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const h = 60 + 55 * Math.sin(a * 3 + 1) + 35 * Math.sin(a * 7.3) + 18 * Math.sin(a * 17.1);
      p.setY(i, Math.max(10, h));
    } else p.setY(i, -2);
  }
  hills.computeVertexNormals();
  const hm = new THREE.Mesh(hills, new THREE.MeshStandardMaterial({ color: 0x6d7f86, roughness: 1, side: THREE.BackSide }));
  const outer = new THREE.Mesh(new THREE.RingGeometry(1150, 3500, 64, 1), new THREE.MeshStandardMaterial({ color: 0x5a6a48, roughness: 1 }));
  outer.rotation.x = -PI / 2; outer.position.y = -0.3;
  const grp = new THREE.Group();
  grp.add(g, hm, outer);
  return grp;
}

// ---------- 道路 ----------
function buildRoads(list) {
  const geos = [];
  for (const [x1, z1, x2, z2, w, y] of list) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const g = new THREE.PlaneGeometry(w, len);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 12));
    g.rotateX(-PI / 2);
    g.rotateY(Math.atan2(x2 - x1, z2 - z1));
    g.translate((x1 + x2) / 2, y ?? 0.05, (z1 + z2) / 2);
    geos.push(g);
  }
  const mat = new THREE.MeshStandardMaterial({ map: TEX.road, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  m.receiveShadow = true;
  return m;
}

// ---------- 公辅设施 ----------
function powerPlant(k, fx) {
  // 锅炉房 + 汽机房 + 烟囱 + 自然通风冷却塔（燃用高炉/焦炉/转炉煤气）
  const bx = -255, bz = -150;
  for (const sx of [-14, 0, 14]) for (const sz of [-14, 0, 14]) hcol(k, MAT.frame, bx + sx, bz + sz, 0, 50, 0.9);
  k.slab(MAT.wall, bx - 15, bx + 15, 1.2, 52, bz - 15, bz + 15);
  k.slab(MAT.wallBlue, bx - 15.1, bx + 15.1, 44, 52, bz - 15.1, bz + 15.1);
  for (let y = 10; y < 44; y += 9) k.slab(MAT.windows, bx - 15.2, bx + 15.2, y, y + 1.8, bz - 15.2, bz + 15.2);
  k.slab(MAT.roofGrey, bx - 15.6, bx + 15.6, 52, 52.6, bz - 15.6, bz + 15.6);
  building(k, { x0: bx + 15, x1: bx + 75, z0: bz - 12, z1: bz + 12, h: 22, bay: 10, ends: { x0: false, x1: 0 }, layer: "", windowsAt: [0.45, 0.75] });
  k.pipe(MAT.steel, [[bx, 50, bz - 15], [bx, 56, bz - 22], [bx - 25, 56, bz - 22], [bx - 25, 20, bz - 22]], 2.0);
  chimney(k, bx - 25, bz - 22 - 8, 150, 6, 3.8);
  fx.push(FX.stackSmoke([bx - 25, 151, bz - 30], 1.3));
  // 双曲线冷却塔
  const cx = -190, cz = -210;
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const y = (i / 16) * 78;
    const r = 24 + 10 * Math.pow((y - 58) / 58, 2) * (y < 58 ? 1 : 0.5);
    prof.push([r, y + 7]);
  }
  k.lathe(MAT.concrete, prof, cx, 0, cz, 64);
  k.lathe(MAT.concreteDk, prof.map(([r, y]) => [r - 0.4, y]).reverse(), cx, 0, cz, 64);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * PI * 2;
    k.rod(MAT.concrete, [cx + Math.cos(a) * 34, 0, cz + Math.sin(a) * 34], [cx + Math.cos(a + 0.09) * 33.6, 7.2, cz + Math.sin(a + 0.09) * 33.6], 0.5, 6);
  }
  k.cyl(MAT.water, 33, 33, 0.2, cx, 1.0, cz, 48);
  fx.push(FX.steam([cx, 86, cz], 3.2, { count: 110, life: 14, opacity: 0.55, area: [14, 0, 14] }));
  k.pipe(MAT.green, [[bx + 50, 2, bz - 12], [bx + 50, 2, cz], [cx - 34, 2, cz]], 1.2);
}

function gasHolder(k, x, z, r, h, color = MAT.silver) {
  // 干式煤气柜（多边形柜体 + 立柱 + 球面顶）
  const n = 24;
  k.cyl(color, r, r, h, x, h / 2, z, n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + PI / n;
    k.box(MAT.steelDark, 0.6, h + 1, 0.8, x + Math.cos(a) * (r * Math.cos(PI / n) + 0.3), (h + 1) / 2, z + Math.sin(a) * (r * Math.cos(PI / n) + 0.3), { ry: -a });
  }
  for (let y = 8; y < h; y += 8) k.torus(MAT.steelDark, r + 0.2, 0.15, x, y, z, { ts: n, rs: 4 });
  k.sphere(color, r, x, h, z, { theta: PI / 2, sy: 0.18, seg: n });
  k.torus(MAT.yellow, r - 1, 0.04, x, h + 1.2, z, { ts: n, rs: 3 });
  k.slab(MAT.concrete, x - r - 2, x + r + 2, 0, 0.6, z - r - 2, z + r + 2);
  // 外部楼梯塔
  lattice(k, MAT.frame, [x + r + 3, 0, z], [x + r + 3, h + 2, z], 3, Math.round(h / 4), 0.12);
  k.rod(MAT.steelDark, [x + r + 3, h + 2, z], [x + r * 0.6, h + r * 0.12, z], 0.15, 6);
}

function oxygenPlant(k) {
  const ox = 150, oz = -140;
  building(k, { x0: ox - 50, x1: ox - 5, z0: oz - 12, z1: oz + 12, h: 16, bay: 9, ends: { x0: 0, x1: 0 }, layer: "" });
  for (const [x, z] of [[ox + 6, oz - 6], [ox + 14, oz - 6]]) {
    k.slab(MAT.white, x - 3, x + 3, 0, 48, z - 3, z + 3);
    k.slab(MAT.steel, x - 3.2, x + 3.2, 48, 49, z - 3.2, z + 3.2);
  }
  for (const x of [ox + 6, ox + 14]) k.cyl(MAT.white, 2.2, 2.2, 28, x, 14, oz + 6, 20);
  for (const x of [ox + 26, ox + 40]) {
    k.sphere(MAT.white, 6, x, 9, oz - 5, { seg: 28, hseg: 18 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; k.box(MAT.frame, 0.5, 8, 0.5, x + Math.cos(a) * 5.2, 4, oz - 5 + Math.sin(a) * 5.2); }
  }
  for (let i = 0; i < 3; i++) k.cyl(MAT.white, 1.8, 1.8, 16, ox + 33, 2.6, oz + 8 + i * 4.5, 20, { rz: PI / 2 });
  for (let i = 0; i < 3; i++) {
    k.slab(MAT.concrete, ox - 48 + i * 12, ox - 38 + i * 12, 0, 8, oz + 20, oz + 30);
    k.cyl(MAT.steelDark, 3.6, 3.6, 2.4, ox - 43 + i * 12, 9.2, oz + 25, 20);
  }
}

function waterPlant(k) {
  const wx = 310, wz = -145;
  for (const [x, z] of [[wx - 40, wz], [wx, wz], [wx + 40, wz]]) {
    k.lathe(MAT.concrete, [[15, 0], [15.6, 0], [15.6, 3.2], [15, 3.2], [15, 0.6]], x, 0, z, 56);
    k.cyl(MAT.water, 15, 15, 0.1, x, 2.6, z, 56);
    k.box(MAT.frame, 30, 0.6, 1.2, x, 3.6, z);
    railing(k, [[x - 15, 3.9, z - 0.6], [x + 15, 3.9, z - 0.6]]);
    k.cyl(MAT.steel, 1.4, 1.4, 1.2, x, 4.2, z, 16);
  }
  // 机械通风冷却塔（多格）
  for (let i = 0; i < 5; i++) {
    const x = wx - 48 + i * 14, z = wz - 42;
    k.slab(MAT.concrete, x - 6.8, x + 6.8, 0, 10, z - 7, z + 7);
    k.slab(MAT.louvre, x - 6.9, x + 6.9, 1.2, 6, z - 7.1, z + 7.1);
    k.lathe(MAT.white, [[4.6, 10], [4.2, 12], [4.6, 14.2]], x, 0, z, 32);
  }
  building(k, { x0: wx - 70, x1: wx - 50, z0: wz + 25, z1: wz + 40, h: 9, bay: 10, ends: { x0: 0, x1: 0 }, monitor: false, layer: "" });
}

function office(k) {
  const x0 = -28, x1 = 28, z0 = 98, z1 = 118, H = 24;
  k.slab(MAT.concrete, x0 - 4, x1 + 4, 0, 0.4, z0 - 6, z1 + 4);
  k.slab(MAT.white, x0, x1, 0.4, H, z0, z1);
  for (let f = 0; f < 6; f++) {
    const y = 1.6 + f * 3.8;
    k.slab(MAT.windows, x0 - 0.06, x1 + 0.06, y, y + 2.2, z0 - 0.06, z1 + 0.06);
  }
  k.slab(MAT.wallBlue, x0 - 0.1, x1 + 0.1, H - 1, H + 0.6, z0 - 0.1, z1 + 0.1);
  k.slab(MAT.glass, -6, 6, 0.4, 4.2, z0 - 1.6, z0);
  k.slab(MAT.white, -7, 7, 4.2, 4.8, z0 - 4, z0);
  // 旗杆
  for (const x of [-10, 0, 10]) k.cyl(MAT.silver, 0.08, 0.1, 14, x, 7, z0 - 12, 8);
  // 停车场 + 小汽车
  k.slab(MAT.concreteDk, 36, 80, 0, 0.08, 96, 122);
  const cols = [MAT.white, MAT.steelDark, MAT.red, MAT.silver, MAT.blueGrey];
  for (let i = 0; i < 16; i++) for (const zz of [100, 114]) {
    if (Math.random() < 0.3) continue;
    const x = 38 + i * 2.6, m = cols[(i * 7 + zz) % cols.length];
    k.slab(m, x, x + 1.8, 0.3, 1.0, zz, zz + 4.4);
    k.slab(m, x + 0.1, x + 1.7, 1.0, 1.5, zz + 1.1, zz + 3.4);
    k.slab(MAT.glass, x + 0.08, x + 1.72, 1.05, 1.45, zz + 1.3, zz + 3.2);
  }
}

function slagYard(k) {
  // 转炉渣热泼区：渣罐 + 渣堆
  for (let i = 0; i < 4; i++) {
    const x = 6 + i * 9;
    k.lathe(MAT.steelDark, [[0, 0.3], [1.4, 0.3], [2.1, 2.8], [2.25, 2.9]], x, 0, 36, 20);
    k.cyl(i === 1 ? MAT.hotDim : MAT.slag, 2.05, 2.05, 0.06, x, 2.6, 36, 20);
  }
  for (const [x, z, r, h] of [[50, 40, 9, 4], [66, 38, 7, 3.2], [58, 46, 6, 2.4]]) {
    k.lathe(MAT.slag, [[0, h], [r * 0.3, h * 0.95], [r, 0.05]], x, 0, z, 18);
  }
}

// ---------- 绿化（实例化） ----------
function buildTrees(points) {
  const n = points.length;
  const crownGeo = (() => {
    const gs = [];
    for (const [x, y, z, r] of [[0, 0, 0, 2.6], [1.1, 0.9, 0.4, 1.9], [-0.9, 1.1, -0.5, 2.0], [0.2, 2.3, 0.1, 1.6]]) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + 0.18 * Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3) * Math.cos(p.getZ(i) * 2.7);
        p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z);
      }
      gs.push(g.index ? g.toNonIndexed() : g);
    }
    const m = mergeGeometries(gs);
    m.computeVertexNormals();
    return m;
  })();
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 4, 6);
  trunk.translate(0, 2, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, MAT.foliage, n);
  const trunks = new THREE.InstancedMesh(trunk, MAT.trunk, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
  points.forEach(([x, z], i) => {
    const sc = 0.8 + Math.random() * 0.6;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * PI * 2);
    s.set(sc, sc * (0.9 + Math.random() * 0.3), sc);
    m4.compose(new THREE.Vector3(x, 5.2 * sc, z), q, s);
    crowns.setMatrixAt(i, m4);
    c.setHSL(0.24 + Math.random() * 0.06, 0.35 + Math.random() * 0.15, 0.75 + Math.random() * 0.25);
    crowns.setColorAt(i, c);
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(sc, sc, sc));
    trunks.setMatrixAt(i, m4);
  });
  crowns.castShadow = trunks.castShadow = true;
  crowns.receiveShadow = true;
  const g = new THREE.Group();
  g.add(crowns, trunks);
  return g;
}

// ---------- 卡车 ----------
function truckMesh(color) {
  const k = new Kit();
  k.slab(color, 0, 2.6, 0.9, 3.6, -1.25, 1.25);
  k.slab(MAT.glass, 2.55, 2.65, 2.2, 3.3, -1.1, 1.1);
  k.slab(MAT.steelDark, -9, 2.6, 0.6, 1.0, -1.1, 1.1);
  k.slab(MAT.primer, -9, -0.4, 1.0, 3.4, -1.25, 1.25);
  for (const x of [1.6, -1.6, -6.4, -7.8]) for (const z of [-1.1, 1.1]) k.cyl(MAT.rubber, 0.5, 0.5, 0.4, x, 0.5, z, 10, { rx: PI / 2 });
  return k.build();
}

// ============================================================
export function buildSite(scene) {
  const k = new Kit();
  const fx = [];
  const updaters = [];
  scene.add(buildGround());

  // 道路
  const ROADS = [
    [-560, 60, 520, 60, 14], [-376, -80, 520, -80, 12],
    [-376, -268, -376, 60, 12, 0.07], [-69, -80, -69, 60, 10, 0.07], [500, -268, 500, 60, 12, 0.07],
    [-780, -268, 540, -268, 12], [-30, 60, -30, 96, 8, 0.07], [60, 60, 60, 96, 8, 0.07],
  ];
  scene.add(buildRoads(ROADS));

  // 铁路：鱼雷罐专线（高炉 → KR）、厂区主线、原料线
  track(k, [-246, 0, 20], [-28, 0, 20]);
  track(k, [-780, 0, 74], [540, 0, 74]);
  track(k, [-246, 0, 26], [-100, 0, 26]);
  // 主线上的平板车（运钢卷）
  for (let i = 0; i < 6; i++) {
    const x = 300 + i * 15;
    k.slab(MAT.primer, x - 6.5, x + 6.5, 1.2, 1.7, 72.6, 75.4);
    for (const s of [-1, 1]) k.slab(MAT.steelDark, x + s * 4.4 - 1.3, x + s * 4.4 + 1.3, 0.55, 1.2, 72.9, 75.1);
    for (const dx of [-3, 0, 3]) coilShape(k, x + dx, 2.7, 74, { axis: "x", w: 1.4 });
  }
  // 停放的鱼雷罐
  for (const x of [-210, -130]) torpedo(k, x, 0, 26);

  // 矿槽（高炉上料）
  k.at(-352, 0, 0, PI / 2, () => {
    building(k, { x0: -32, x1: 32, z0: -12, z1: 12, h: 26, bay: 8, ends: { x0: 0, x1: 0 }, layer: "" });
  });
  // 皮带通廊（原料场 → 烧结/焦化；烧结/焦化 → 矿槽）
  transferTower(k, -520, -60, 22);
  gallery(k, [-556, 18, -6], [-520, 18, -56]);
  gallery(k, [-516, 18, -64], [-472, 44, -114]);
  gallery(k, [-556, 18, 6], [-568, 10, 131]);
  gallery(k, [-432, 12, 112], [-352, 22, 32]);
  gallery(k, [-410, 10, -98], [-352, 22, -32]);

  // 管廊（全厂能源介质主干：煤气、氧、氮、水、蒸汽）
  {
    const z = -66, x0 = -370, x1 = 480;
    for (let x = x0; x <= x1; x += 15) {
      for (const dz of [-3, 3]) k.box(MAT.frame, 0.45, 10, 0.45, x, 5, z + dz);
      k.box(MAT.frame, 0.4, 0.5, 7, x, 10, z);
      k.box(MAT.frame, 0.4, 0.4, 7, x, 6.5, z);
      k.box(MAT.concrete, 1.0, 0.5, 7.8, x, 0.25, z);
    }
    const L = x1 - x0, xc = (x0 + x1) / 2;
    k.cyl(MAT.silver, 1.2, 1.2, L, xc, 11.5, z - 1.4, 18, { rz: PI / 2 });
    k.cyl(MAT.steel, 0.9, 0.9, L, xc, 11.1, z + 1.8, 16, { rz: PI / 2 });
    k.cyl(MAT.blueGrey, 0.35, 0.35, L, xc, 7.2, z - 2.4, 10, { rz: PI / 2 });
    k.cyl(MAT.yellow, 0.3, 0.3, L, xc, 7.2, z - 1.4, 10, { rz: PI / 2 });
    k.cyl(MAT.green, 0.45, 0.45, L, xc, 7.3, z + 0.2, 10, { rz: PI / 2 });
    k.cyl(MAT.white, 0.3, 0.3, L, xc, 7.2, z + 1.6, 10, { rz: PI / 2 });
  }

  // 公辅设施
  powerPlant(k, fx);
  gasHolder(k, -120, -150, 26, 62);
  gasHolder(k, -340, -205, 18, 46, MAT.blueGrey);
  gasHolder(k, 40, -135, 16, 40);
  oxygenPlant(k);
  waterPlant(k);
  office(k);
  slagYard(k);

  // 路灯
  const lampPos = [];
  for (let x = -540; x <= 500; x += 36) for (const z of [51.5, 68.5]) lampPos.push([x, z, z > 60 ? -1 : 1]);
  for (let x = -360; x <= 500; x += 40) lampPos.push([x, -71.5, -1]);
  for (const [x, z, s] of lampPos) {
    k.cyl(MAT.steel, 0.1, 0.14, 10, x, 5, z, 6);
    k.rod(MAT.steel, [x, 10, z], [x, 10.4, z + s * 1.8], 0.06, 4);
    k.slab(MAT.lamp, x - 0.3, x + 0.3, 10.2, 10.4, z + s * 1.8 - 0.5, z + s * 1.8 + 0.5);
  }
  // 夜间路面光斑
  const pools = [];
  for (const [x, z, s] of lampPos) {
    const g = new THREE.PlaneGeometry(22, 22);
    g.rotateX(-PI / 2);
    g.translate(x, 0.15, z + s * 4);
    pools.push(g);
  }
  const poolMat = new THREE.MeshBasicMaterial({ map: TEX.glow, color: 0xffc98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const poolMesh = new THREE.Mesh(mergeGeometries(pools), poolMat);
  poolMesh.renderOrder = 1;
  scene.add(poolMesh);

  // 绿化
  const trees = [];
  for (let x = -350; x <= 490; x += 9) { if (Math.abs(x + 69) > 10 && Math.abs(x + 30) > 8 && Math.abs(x - 60) > 8) trees.push([x + Math.random() * 3, 86 + Math.random() * 3]); }
  for (let x = -760; x <= 520; x += 11) trees.push([x + Math.random() * 4, 245 + Math.random() * 10]), trees.push([x + Math.random() * 4, -285 - Math.random() * 10]);
  for (let z = -250; z <= 240; z += 11) trees.push([-800 - Math.random() * 6, z]), trees.push([560 + Math.random() * 6, z]);
  for (let i = 0; i < 90; i++) trees.push([-40 + Math.random() * 120, 125 + Math.random() * 35]);
  for (let i = 0; i < 160; i++) trees.push([-340 + Math.random() * 280, 95 + Math.random() * 120]);
  for (let i = 0; i < 120; i++) trees.push([380 + Math.random() * 110, 100 + Math.random() * 120]);
  for (let i = 0; i < 80; i++) trees.push([-60 + Math.random() * 380, -220 + Math.random() * 40]);
  scene.add(buildTrees(trees));

  // 卡车
  const trucks = [];
  const cols = [MAT.crane, MAT.blueGrey, MAT.white, MAT.red, MAT.green];
  for (let i = 0; i < 7; i++) {
    const tm = truckMesh(cols[i % cols.length]);
    tm.userData = { speed: 9 + Math.random() * 5, phase: Math.random(), dir: i % 2 ? 1 : -1 };
    scene.add(tm);
    trucks.push(tm);
  }
  updaters.push((t) => {
    for (const tm of trucks) {
      const { speed, phase, dir } = tm.userData;
      const L = 1080, s = ((t * speed) / L + phase) % 1;
      tm.position.set(dir > 0 ? -560 + s * L : 520 - s * L, 0, 60 + (dir > 0 ? 3.2 : -3.2));
      tm.rotation.y = dir > 0 ? 0 : PI;
    }
  });

  const g = k.build();
  scene.add(g);
  for (const e of fx) scene.add(e);

  // 公辅设施标注点（对应 data.js 的 SUPPORT_SYSTEMS）
  const supportLabels = [
    { name: "自备电厂", pos: [-230, 62, -150] },
    { name: "制氧机(空分)", pos: [160, 55, -140] },
    { name: "水处理系统", pos: [310, 20, -150] },
    { name: "煤气柜", pos: [-120, 80, -150] },
    { name: "渣处理", pos: [40, 14, 40] },
    { name: "自动化系统", pos: [0, 32, 108] },
    { name: "厂内物流", pos: [-150, 10, 23] },
    { name: "除尘环保", pos: [-102, 22, -44] },
  ];
  return {
    updaters, supportLabels,
    setNight(on) {
      poolMat.opacity = on ? 0.55 : 0;
      MAT.lamp.emissiveIntensity = on ? 6 : 0;
    },
  };
}
