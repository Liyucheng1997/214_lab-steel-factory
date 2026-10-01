// ============================================================
// 建模工具箱
//  · MAT：全厂共享的 PBR 材质库
//  · Kit：几何"批处理器" —— 成千上万个构件按材质合并成少量网格，
//         同时按世界坐标生成 UV（贴图尺度真实统一）
//  · 复合构件：H 型钢柱、桁架、格构柱、管道、栏杆、楼梯、平台、
//         厂房（柱网/屋架/吊车梁/彩钢板外壳，可剖切）、烟囱、储罐…
// 单位：1 = 1 米
// ============================================================
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TEX } from "./textures.js";

export const MAT = {};
const V = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
const UP = new THREE.Vector3(0, 1, 0);

// ---------- 材质 ----------
export function initMaterials() {
  const std = (o, uv) => {
    const m = new THREE.MeshStandardMaterial(o);
    if (uv) m.userData.uvScale = uv;
    return m;
  };
  const G = TEX.grime;
  Object.assign(MAT, {
    steel:      std({ color: 0x8e979f, roughness: 0.6, metalness: 0.45, map: G }, 7),
    steelDark:  std({ color: 0x4d555d, roughness: 0.62, metalness: 0.45, map: G }, 7),
    frame:      std({ color: 0x6e7880, roughness: 0.6, metalness: 0.4, map: G }, 7),
    primer:     std({ color: 0x8a3b2c, roughness: 0.7, metalness: 0.3, map: G }, 7),
    silver:     std({ color: 0xc3c8cc, roughness: 0.42, metalness: 0.65, map: G }, 9),
    blueGrey:   std({ color: 0x5f7f98, roughness: 0.55, metalness: 0.4, map: G }, 7),
    green:      std({ color: 0x4e7a5a, roughness: 0.55, metalness: 0.35, map: G }, 7),
    yellow:     std({ color: 0xe0ac1c, roughness: 0.5, metalness: 0.3, map: G }, 5),
    crane:      std({ color: 0xd99a14, roughness: 0.5, metalness: 0.35, map: G }, 6),
    orange:     std({ color: 0xd05a1a, roughness: 0.55, metalness: 0.3, map: G }, 5),
    white:      std({ color: 0xe9ebec, roughness: 0.5, metalness: 0.2, map: G }, 8),
    red:        std({ color: 0xb4322a, roughness: 0.55, metalness: 0.2, map: G }, 8),
    rust:       std({ color: 0xffffff, roughness: 0.85, metalness: 0.35, map: TEX.rust }, 6),
    bfShell:    std({ color: 0x8a8580, roughness: 0.72, metalness: 0.55, map: TEX.rust }, 7),
    concrete:   std({ color: 0xc6c1b7, roughness: 0.92, metalness: 0, map: TEX.concrete }, 6),
    concreteDk: std({ color: 0x8f8a82, roughness: 0.95, metalness: 0, map: TEX.concrete }, 6),
    brick:      std({ color: 0xffffff, roughness: 0.9, metalness: 0, map: TEX.brick }, 4),
    refractory: std({ color: 0xcbb9a0, roughness: 0.95, metalness: 0, map: TEX.concrete }, 3),
    wall:       std({ color: 0xd9dde0, roughness: 0.5, metalness: 0.35, map: TEX.cladding, normalMap: TEX.claddingN }, 3),
    wallBlue:   std({ color: 0x5b84ad, roughness: 0.5, metalness: 0.35, map: TEX.cladding, normalMap: TEX.claddingN }, 3),
    roof:       std({ color: 0x7d9bb8, roughness: 0.5, metalness: 0.4, map: TEX.cladding, normalMap: TEX.claddingN }, 3),
    roofGrey:   std({ color: 0xa9b0b5, roughness: 0.55, metalness: 0.4, map: TEX.cladding, normalMap: TEX.claddingN }, 3),
    louvre:     std({ color: 0x3a4148, roughness: 0.6, metalness: 0.4, map: TEX.cladding, normalMap: TEX.claddingN }, 1.2),
    skylight:   std({ color: 0xc8d4d8, roughness: 0.3, metalness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0 }, 3),
    windows:    std({ color: 0xffffff, roughness: 0.2, metalness: 0.5, map: TEX.windows, emissive: 0xffffff, emissiveMap: TEX.windowsLit, emissiveIntensity: 0 }, 3.5),
    glass:      std({ color: 0x31475a, roughness: 0.12, metalness: 0.8 }),
    grating:    std({ color: 0x8b9298, roughness: 0.7, metalness: 0.5, map: TEX.grating }, 1.2),
    rubber:     std({ color: 0x1d1f22, roughness: 0.9, metalness: 0 }),
    copper:     std({ color: 0xb8733a, roughness: 0.35, metalness: 0.9 }),
    graphite:   std({ color: 0x2b2c30, roughness: 0.55, metalness: 0.3 }),
    rail:       std({ color: 0x777b80, roughness: 0.4, metalness: 0.85 }),
    sleeper:    std({ color: 0x6f6b64, roughness: 0.95, metalness: 0, map: TEX.concrete }, 3),
    ballast:    std({ color: 0x8a8580, roughness: 1, metalness: 0, map: TEX.pile }, 3),
    coil:       std({ color: 0x6d757d, roughness: 0.38, metalness: 0.85, map: G }, 3),
    slabCold:   std({ color: 0x4a4440, roughness: 0.85, metalness: 0.5, map: TEX.rust }, 4),
    ore:        std({ color: 0x8a4e34, roughness: 1, metalness: 0, map: TEX.pile, bumpMap: TEX.pile, bumpScale: 0.6 }, 4),
    pellet:     std({ color: 0x5e463c, roughness: 1, metalness: 0, map: TEX.pile, bumpMap: TEX.pile, bumpScale: 0.6 }, 3),
    coal:       std({ color: 0x2c2c2e, roughness: 0.85, metalness: 0.1, map: TEX.pile, bumpMap: TEX.pile, bumpScale: 0.6 }, 4),
    coke:       std({ color: 0x4a4a4c, roughness: 0.9, metalness: 0.2, map: TEX.pile, bumpMap: TEX.pile, bumpScale: 0.6 }, 3),
    lime:       std({ color: 0xcfcac0, roughness: 1, metalness: 0, map: TEX.pile, bumpMap: TEX.pile, bumpScale: 0.6 }, 4),
    slag:       std({ color: 0x77736c, roughness: 1, metalness: 0, map: TEX.pile, bumpMap: TEX.pile, bumpScale: 0.6 }, 4),
    sinter:     std({ color: 0x3f3532, roughness: 1, metalness: 0.2, map: TEX.pile, emissive: 0xffffff, emissiveMap: TEX.sinterGrad, emissiveIntensity: 2.2 }),
    water:      std({ color: 0x2f5a63, roughness: 0.08, metalness: 0.1 }),
    grass:      std({ color: 0x55703a, roughness: 1, metalness: 0, map: TEX.pile }, 6),
    foliage:    std({ color: 0x46622f, roughness: 0.95, metalness: 0, map: TEX.pile }, 2),
    trunk:      std({ color: 0x5a4636, roughness: 1, metalness: 0 }),
    // 高温材质（自发光，配合 Bloom 产生辉光）
    hot:        std({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 5, roughness: 0.5 }),
    hotWhite:   std({ color: 0xffe0a0, emissive: 0xffc070, emissiveIntensity: 9, roughness: 0.5 }),
    hotDim:     std({ color: 0x7a2a10, emissive: 0xc03000, emissiveIntensity: 1.6, roughness: 0.6 }),
    melt:       std({ color: 0xffffff, map: TEX.melt, emissive: 0xffffff, emissiveMap: TEX.melt, emissiveIntensity: 5, roughness: 0.6 }),
    strand:     std({ color: 0x3a2a24, emissive: 0xffffff, emissiveMap: TEX.strandGrad, emissiveIntensity: 3.2, roughness: 0.7, metalness: 0.3 }),
    strip:      std({ color: 0x40342e, emissive: 0xffffff, emissiveMap: TEX.stripGrad, emissiveIntensity: 3.5, roughness: 0.5, metalness: 0.5 }),
    lamp:       std({ color: 0xfff2d0, emissive: 0xfff0c8, emissiveIntensity: 0, roughness: 0.4 }),
    beacon:     std({ color: 0xff2a20, emissive: 0xff1a10, emissiveIntensity: 3, roughness: 0.4 }),
  });
  MAT.melt.map.repeat.set(1, 1);
  return MAT;
}

// ---------- Kit：按材质合并的几何批处理器 ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);

function boxUV(geo, s) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  if (!uv || !n) return;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x / s, z / s);
    else if (ax >= az) uv.setXY(i, z / s, y / s);
    else uv.setXY(i, x / s, y / s);
  }
  uv.needsUpdate = true;
}

export class Kit {
  constructor() {
    this.buckets = new Map();
    this.stack = [new THREE.Matrix4()];
  }
  get M() { return this.stack[this.stack.length - 1]; }

  // 局部坐标系：k.at(x,y,z,ry, () => {...})
  at(x, y, z, ry = 0, fn, rx = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")),
      new THREE.Vector3(1, 1, 1));
    this.stack.push(this.M.clone().multiply(m));
    fn();
    this.stack.pop();
  }

  add(geo, mat, matrix, layer = "") {
    if (matrix) geo.applyMatrix4(matrix);
    geo.applyMatrix4(this.M);
    if (mat.userData.uvScale) boxUV(geo, mat.userData.uvScale);
    const key = mat.uuid + "|" + layer + "|" + (geo.index ? "i" : "n");
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { mat, layer, geos: [] }));
    b.geos.push(geo);
    return geo;
  }

  // 生成 THREE.Group（每个 材质×图层 一个网格）
  build({ shadow = true } = {}) {
    const g = new THREE.Group();
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      for (const x of b.geos) x.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      if (b.layer) { mesh.userData.layer = b.layer; mesh.name = b.layer; }
      g.add(mesh);
    }
    this.buckets.clear();
    return g;
  }

  // ----- 基本体 -----
  // o: { rx, ry, rz, layer }
  box(mat, w, h, d, x, y, z, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, "YXZ");
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s);
    return this.add(new THREE.BoxGeometry(w, h, d), mat, _m, o.layer);
  }
  // 从底面放置的盒子（y 为底面）
  slab(mat, x0, x1, y0, y1, z0, z1, o = {}) {
    return this.box(mat, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
  }
  cyl(mat, rt, rb, h, x, y, z, seg = 16, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, "YXZ");
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s);
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), mat, _m, o.layer);
  }
  // 两点之间的圆杆（钢管、拉杆、桁架杆件）
  rod(mat, a, b, r, seg = 8, o = {}) {
    const A = V(a), B = V(b);
    const d = B.clone().sub(A);
    const L = d.length();
    if (L < 1e-4) return;
    _q.setFromUnitVectors(UP, d.normalize());
    _m.compose(A.add(B).multiplyScalar(0.5), _q, _s);
    return this.add(new THREE.CylinderGeometry(o.rt ?? r, r, L, seg, 1, !!o.open), mat, _m, o.layer);
  }
  // 两点之间的方截面杆
  beam(mat, a, b, w, o = {}) {
    const A = V(a), B = V(b);
    const d = B.clone().sub(A);
    const L = d.length();
    if (L < 1e-4) return;
    _q.setFromUnitVectors(UP, d.normalize());
    _m.compose(A.add(B).multiplyScalar(0.5), _q, _s);
    return this.add(new THREE.BoxGeometry(w, L, o.d ?? w), mat, _m, o.layer);
  }
  sphere(mat, r, x, y, z, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, "YXZ");
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s3.set(o.sx || 1, o.sy || 1, o.sz || 1));
    return this.add(new THREE.SphereGeometry(r, o.seg || 20, o.hseg || 12, 0, Math.PI * 2, 0, o.theta ?? Math.PI), mat, _m, o.layer);
  }
  torus(mat, R, r, x, y, z, o = {}) {
    _e.set(o.rx ?? Math.PI / 2, o.ry || 0, o.rz || 0, "YXZ");
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s);
    return this.add(new THREE.TorusGeometry(R, r, o.rs || 8, o.ts || 40, o.arc ?? Math.PI * 2), mat, _m, o.layer);
  }
  // 回转体：pts = [[r, y], ...]
  lathe(mat, pts, x, y, z, seg = 32, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, "YXZ");
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s3.set(o.sx || 1, o.sy || 1, o.sz || 1));
    const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 0.0001), h)), seg, o.phi || 0, o.phiLen ?? Math.PI * 2);
    return this.add(g, mat, _m, o.layer);
  }
  // 折线管道（拐角自动倒圆）
  pipe(mat, pts, r, o = {}) {
    const P = pts.map(V);
    const bend = o.bend ?? r * 2.5;
    const path = new THREE.CurvePath();
    let cur = P[0].clone();
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if (i < P.length - 1) {
        const c = P[i + 1];
        const d1 = b.clone().sub(a), d2 = c.clone().sub(b);
        const l1 = d1.length(), l2 = d2.length();
        d1.normalize(); d2.normalize();
        const rr = Math.min(bend, l1 * 0.45, l2 * 0.45);
        const p1 = b.clone().addScaledVector(d1, -rr), p2 = b.clone().addScaledVector(d2, rr);
        if (cur.distanceTo(p1) > 1e-3) path.add(new THREE.LineCurve3(cur.clone(), p1));
        path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
        cur = p2;
      } else {
        path.add(new THREE.LineCurve3(cur.clone(), b.clone()));
      }
    }
    const segs = Math.min(600, P.length * 10 + Math.round(path.getLength() / Math.max(2, r * 4)));
    const g = new THREE.TubeGeometry(path, segs, r, o.seg || 12, false);
    this.add(g, mat, null, o.layer);
    if (o.caps !== false) {
      // 管端法兰/封头
      this.rod(mat, P[0], P[0].clone().add(P[1].clone().sub(P[0]).setLength(0.15)), r * 1.12, o.seg || 12, o);
    }
  }
  // 自定义几何
  geo(mat, g, x = 0, y = 0, z = 0, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, "YXZ");
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s3.set(o.sx || 1, o.sy || 1, o.sz || 1));
    return this.add(g, mat, _m, o.layer);
  }
}
const _v = new THREE.Vector3(), _s3 = new THREE.Vector3();

// ============================================================
// 复合构件
// ============================================================

// H 型钢柱（竖直），s = 截面高
export function hcol(k, mat, x, z, y0, y1, s = 0.6, ry = 0, layer) {
  const h = y1 - y0, yc = (y0 + y1) / 2;
  k.at(x, yc, z, ry, () => {
    k.box(mat, s, h, s * 0.1, 0, 0, -s / 2 + s * 0.05, { layer });
    k.box(mat, s, h, s * 0.1, 0, 0, s / 2 - s * 0.05, { layer });
    k.box(mat, s * 0.08, h, s * 0.9, 0, 0, 0, { layer });
  });
}

// 平面桁架：a→b 为下弦，up 方向为上弦偏移
export function truss(k, mat, a, b, up, depth, n, r = 0.08, layer) {
  const A = V(a), B = V(b), U = V(up).normalize().multiplyScalar(depth);
  const P = (i) => A.clone().lerp(B, i / n);
  const T = (i) => P(i).add(U);
  k.rod(mat, A, B, r * 1.3, 6, { layer });
  k.rod(mat, T(0), T(n), r * 1.3, 6, { layer });
  for (let i = 0; i <= n; i++) k.rod(mat, P(i), T(i), r * 0.8, 5, { layer });
  for (let i = 0; i < n; i++) {
    if (i < n / 2) k.rod(mat, P(i), T(i + 1), r * 0.8, 5, { layer });
    else k.rod(mat, T(i), P(i + 1), r * 0.8, 5, { layer });
  }
}

// 格构（空间桁架）：方截面 w，沿 a→b，n 节
export function lattice(k, mat, a, b, w, n, r = 0.1, layer) {
  const A = V(a), B = V(b);
  const d = B.clone().sub(A).normalize();
  const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
  const s = new THREE.Vector3().crossVectors(d, ref).normalize().multiplyScalar(w / 2);
  const t = new THREE.Vector3().crossVectors(d, s).normalize().multiplyScalar(w / 2);
  const C = [s.clone().add(t), s.clone().sub(t), s.clone().negate().sub(t), s.clone().negate().add(t)];
  const P = (i, c) => A.clone().lerp(B, i / n).add(C[c & 3]);
  for (let c = 0; c < 4; c++) k.rod(mat, P(0, c), P(n, c), r, 6, { layer });
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 4; c++) {
      if ((i + c) % 2) k.rod(mat, P(i, c), P(i + 1, c + 1), r * 0.6, 4, { layer });
      else k.rod(mat, P(i, c + 1), P(i + 1, c), r * 0.6, 4, { layer });
    }
    if (i % 2 === 0) for (let c = 0; c < 4; c++) k.rod(mat, P(i, c), P(i, c + 1), r * 0.6, 4, { layer });
  }
  for (let c = 0; c < 4; c++) k.rod(mat, P(n, c), P(n, c + 1), r * 0.6, 4, { layer });
}

// 栏杆：沿折线
export function railing(k, pts, h = 1.1, mat = MAT.yellow, layer) {
  const P = pts.map(V);
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i];
    const L = a.distanceTo(b);
    const n = Math.max(1, Math.round(L / 2));
    for (let j = 0; j <= n; j++) {
      if (j === n && i < P.length - 1) continue;
      const p = a.clone().lerp(b, j / n);
      k.rod(mat, p, p.clone().setY(p.y + h), 0.025, 4, { layer });
    }
    const up = (v, y) => v.clone().setY(v.y + y);
    k.rod(mat, up(a, h), up(b, h), 0.028, 4, { layer });
    k.rod(mat, up(a, h * 0.5), up(b, h * 0.5), 0.022, 4, { layer });
  }
}

// 钢格栅平台（带栏杆）
export function platform(k, x0, x1, z0, z1, y, { rail = true, open = "", mat = MAT.grating, layer } = {}) {
  k.slab(mat, x0, x1, y - 0.12, y, z0, z1, { layer });
  k.slab(MAT.frame, x0, x1, y - 0.45, y - 0.12, z0, z0 + 0.15, { layer });
  k.slab(MAT.frame, x0, x1, y - 0.45, y - 0.12, z1 - 0.15, z1, { layer });
  if (!rail) return;
  if (!open.includes("n")) railing(k, [[x0, y, z0], [x1, y, z0]], 1.1, MAT.yellow, layer);
  if (!open.includes("s")) railing(k, [[x0, y, z1], [x1, y, z1]], 1.1, MAT.yellow, layer);
  if (!open.includes("w")) railing(k, [[x0, y, z0], [x0, y, z1]], 1.1, MAT.yellow, layer);
  if (!open.includes("e")) railing(k, [[x1, y, z0], [x1, y, z1]], 1.1, MAT.yellow, layer);
}

// 楼梯（沿 +x 方向上升，可用 k.at 旋转）
export function stairs(k, x, y, z, rise, w = 1.2, layer) {
  const run = rise * 1.1, n = Math.round(rise / 0.2);
  k.at(x, y, z, 0, () => {
    const L = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    for (const s of [-w / 2, w / 2]) k.box(MAT.frame, L, 0.3, 0.08, run / 2, rise / 2, s, { rz: ang, layer });
    for (let i = 1; i < n; i++) k.box(MAT.grating, 0.28, 0.04, w, (i / n) * run, (i / n) * rise, 0, { layer });
    railing(k, [[0, 0, w / 2], [run, rise, w / 2]], 1.0, MAT.yellow, layer);
  });
}

// 钢轨（含轨枕、道床），沿 a→b（水平）
export function track(k, a, b, { gauge = 1.435, ballast = true, sleepers = true } = {}) {
  const A = V(a), B = V(b);
  const d = B.clone().sub(A); const L = d.length(); d.normalize();
  const ry = Math.atan2(-d.z, d.x);
  k.at((A.x + B.x) / 2, A.y, (A.z + B.z) / 2, ry, () => {
    if (ballast) k.box(MAT.ballast, L, 0.3, gauge + 2.2, 0, 0.1, 0);
    if (sleepers) {
      const n = Math.floor(L / 0.65);
      for (let i = 0; i < n; i++) k.box(MAT.sleeper, 0.24, 0.16, gauge + 1.0, -L / 2 + (i + 0.5) * (L / n), 0.31, 0);
    }
    for (const s of [-gauge / 2, gauge / 2]) {
      k.box(MAT.rail, L, 0.16, 0.07, 0, 0.47, s);
      k.box(MAT.rail, L, 0.03, 0.14, 0, 0.4, s);
    }
  });
}

// 封闭皮带通廊 + 支架（a、b 为通廊底面中心线端点）
export function gallery(k, a, b, { w = 4.5, h = 3.6, trestle = 28, mat = MAT.wall, roofMat = MAT.roofGrey } = {}) {
  const A = V(a), B = V(b);
  const d = B.clone().sub(A); const L = d.length();
  const hor = Math.hypot(d.x, d.z);
  const ry = Math.atan2(-d.z, d.x), slope = Math.atan2(d.y, hor);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  k.at(mid.x, mid.y, mid.z, ry, () => {
    k.at(0, 0, 0, 0, () => {
      k.box(mat, L, h, 0.12, 0, h / 2, -w / 2);
      k.box(mat, L, h, 0.12, 0, h / 2, w / 2);
      k.box(roofMat, L, 0.15, w + 0.5, 0, h + 0.05, 0);
      k.box(MAT.frame, L, 0.6, w + 0.3, 0, -0.3, 0);
      k.box(MAT.windows, L * 0.96, 0.7, w + 0.16, 0, h * 0.62, 0);
    }, 0, slope);
  });
  // 支架：门式格构
  const n = Math.max(1, Math.floor(hor / trestle));
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const p = A.clone().lerp(B, t);
    if (p.y < 3) continue;
    const s = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(w / 2 + 0.2);
    for (const sg of [-1, 1]) {
      const base = p.clone().addScaledVector(s, sg); base.y = 0;
      const top = p.clone().addScaledVector(s, sg); top.y = p.y - 0.6;
      k.box(MAT.frame, 0.5, top.y, 0.5, base.x, top.y / 2, base.z);
      k.box(MAT.concrete, 1.2, 0.6, 1.2, base.x, 0.3, base.z);
    }
    for (let yy = 4; yy < p.y - 1; yy += 6) {
      const l = p.clone().addScaledVector(s, -1); l.y = yy;
      const r = p.clone().addScaledVector(s, 1); r.y = yy;
      k.rod(MAT.frame, l, r, 0.12, 6);
      const r2 = r.clone(); r2.y = Math.min(yy + 6, p.y - 0.6);
      k.rod(MAT.frame, l, r2, 0.08, 4);
    }
  }
}

// 转运站（皮带转运塔）
export function transferTower(k, x, z, h, w = 9, d = 9) {
  k.slab(MAT.concrete, x - w / 2 - 0.3, x + w / 2 + 0.3, 0, 1, z - d / 2 - 0.3, z + d / 2 + 0.3);
  k.slab(MAT.wall, x - w / 2, x + w / 2, 1, h, z - d / 2, z + d / 2);
  k.slab(MAT.wallBlue, x - w / 2 - 0.05, x + w / 2 + 0.05, h - 2.5, h, z - d / 2 - 0.05, z + d / 2 + 0.05);
  k.slab(MAT.roofGrey, x - w / 2 - 0.4, x + w / 2 + 0.4, h, h + 0.4, z - d / 2 - 0.4, z + d / 2 + 0.4);
  for (let y = 6; y < h - 3; y += 7) k.slab(MAT.windows, x - w / 2 - 0.08, x + w / 2 + 0.08, y, y + 1.2, z - d / 2 - 0.08, z + d / 2 + 0.08);
}

// 烟囱：混凝土/钢烟囱，顶部红白航空警示色带
export function chimney(k, x, z, h, r0, r1, { mat = MAT.concrete, bands = true, base = 0 } = {}) {
  const bandStart = bands ? h * 0.72 : h;
  k.lathe(mat, [[r0, base], [r0 + (r1 - r0) * (bandStart / h), bandStart]], x, 0, z, 28);
  if (bands) {
    const nb = 6;
    for (let i = 0; i < nb; i++) {
      const y0 = bandStart + (h - bandStart) * (i / nb), y1 = bandStart + (h - bandStart) * ((i + 1) / nb);
      const ra = r0 + (r1 - r0) * (y0 / h), rb = r0 + (r1 - r0) * (y1 / h);
      k.lathe(i % 2 ? MAT.white : MAT.red, [[ra, y0], [rb, y1]], x, 0, z, 28);
    }
  }
  k.lathe(MAT.steelDark, [[r1 * 0.85, h - 0.5], [r1 * 1.04, h], [r1 * 1.04, h + 0.4], [r1 * 0.85, h + 0.4]], x, 0, z, 28);
  // 检修平台
  for (const fy of [h * 0.5, h - 4]) {
    const rr = r0 + (r1 - r0) * (fy / h);
    k.torus(MAT.grating, rr + 0.6, 0.6, x, fy, z, { rs: 2, ts: 28 });
    k.torus(MAT.yellow, rr + 1.15, 0.03, x, fy + 1.1, z, { rs: 4, ts: 28 });
  }
  k.slab(MAT.concreteDk, x - r0 - 1.5, x + r0 + 1.5, 0, 0.8, z - r0 - 1.5, z + r0 + 1.5);
}

// 立式储罐（拱顶/锥顶）
export function tank(k, x, z, r, h, { mat = MAT.silver, roof = "dome", y0 = 0, rings = true } = {}) {
  k.cyl(mat, r, r, h, x, y0 + h / 2, z, 32);
  if (roof === "dome") k.sphere(mat, r, x, y0 + h, z, { theta: Math.PI / 2, sy: 0.22, seg: 32 });
  else if (roof === "cone") k.cyl(mat, r * 0.15, r, r * 0.25, x, y0 + h + r * 0.125, z, 32);
  if (rings) for (let y = y0 + 3; y < y0 + h; y += 4) k.torus(MAT.steelDark, r + 0.04, 0.06, x, y, z, { rs: 4, ts: 40 });
  // 盘梯
  const n = Math.ceil(h / 2.5);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 0.9;
    pts.push([x + Math.cos(a) * (r + 0.6), y0 + (i / n) * h, z + Math.sin(a) * (r + 0.6)]);
  }
  railing(k, pts, 1.0);
}

// 料仓（锥底，带支腿）
export function silo(k, x, z, r, h, legH, { mat = MAT.silver } = {}) {
  const cone = r * 1.1;
  k.cyl(mat, r, r, h, x, legH + cone + h / 2, z, 24);
  k.cyl(mat, r, 0.35, cone, x, legH + cone / 2, z, 24);
  k.cyl(mat, r * 0.2, r, r * 0.25, x, legH + cone + h + r * 0.125, z, 24);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    k.box(MAT.frame, 0.4, legH + cone, 0.4, x + sx * r * 0.72, (legH + cone) / 2, z + sz * r * 0.72);
  }
}

// ============================================================
// 厂房：柱网 + 屋架 + 吊车梁 + 彩钢板外壳（可剖切）
// 图层：'clad' = 可剖切外壳（前墙/屋面/端墙），其余常显
// ============================================================
export function building(k, o) {
  const {
    x0, x1, z0, z1, h,
    bay = 12, pitch = 0.1, monitor = true, crane = 0,
    wall = MAT.wall, band = MAT.wallBlue, roof = MAT.roof,
    ends = { x0: 0, x1: 0 }, backWall = true, colSize = 0.9,
    windowsAt = [0.55], skylight = true, layer = "clad", doorZ,
  } = o;
  const cr = typeof crane === "number" ? (crane ? { y: crane, z: [z0 + 1.2, z1 - 1.2] } : null) : crane;
  const W = x1 - x0, D = z1 - z0, zc = (z0 + z1) / 2;
  const rise = (D / 2) * pitch;
  const nb = Math.max(1, Math.round(W / bay)), bx = W / nb;

  // 基础与柱
  for (let i = 0; i <= nb; i++) {
    const x = x0 + i * bx;
    for (const z of [z0, z1]) {
      hcol(k, MAT.frame, x, z, 0, h, colSize);
      k.box(MAT.concrete, colSize * 2, 0.6, colSize * 2, x, 0.3, z);
      if (cr) k.box(MAT.frame, colSize * 0.8, 0.8, 1.6, x, cr.y - 0.6, z + (z === z0 ? 0.9 : -0.9));
    }
  }
  // 端墙抗风柱
  for (const x of [x0, x1]) {
    const nz = Math.max(1, Math.round(D / 8));
    for (let j = 1; j < nz; j++) hcol(k, MAT.frame, x, z0 + (j * D) / nz, 0, h + rise * (1 - Math.abs(j / nz - 0.5) * 2), colSize * 0.6, Math.PI / 2);
  }
  // 吊车梁 + 轨道
  if (cr) {
    for (const z of cr.z) {
      if (Math.abs(z - z0) > 2.5 && Math.abs(z - z1) > 2.5) continue; // 中间柱列的吊车梁另行处理
      k.box(MAT.frame, W, 1.6, 0.7, (x0 + x1) / 2, cr.y - 0.8, z);
      k.box(MAT.rail, W, 0.18, 0.12, (x0 + x1) / 2, cr.y + 0.09, z);
    }
  }
  // 屋架（梯形钢屋架）+ 檩条
  const ang = Math.atan2(rise, D / 2);
  for (let i = 0; i <= nb; i++) {
    const x = x0 + i * bx;
    const n = Math.max(4, Math.round(D / 3));
    const top = (z) => h + 1.8 + rise * (1 - Math.abs(z - zc) / (D / 2));
    k.rod(MAT.frame, [x, h, z0], [x, h, z1], 0.12, 6);
    k.rod(MAT.frame, [x, top(z0), z0], [x, top(zc), zc], 0.12, 6);
    k.rod(MAT.frame, [x, top(zc), zc], [x, top(z1), z1], 0.12, 6);
    for (let j = 0; j <= n; j++) {
      const z = z0 + (j / n) * D;
      k.rod(MAT.frame, [x, h, z], [x, top(z), z], 0.06, 4);
      if (j < n) {
        const zn = z0 + ((j + 1) / n) * D;
        if (j < n / 2) k.rod(MAT.frame, [x, h, z], [x, top(zn), zn], 0.06, 4);
        else k.rod(MAT.frame, [x, top(z), z], [x, h, zn], 0.06, 4);
      }
    }
  }
  const slopeL = Math.hypot(D / 2, rise);
  const np = Math.max(2, Math.round(slopeL / 3));
  for (let j = 0; j <= np; j++) {
    const f = j / np;
    for (const sg of [-1, 1]) {
      const z = zc + sg * f * (D / 2);
      k.box(MAT.frame, W, 0.3, 0.15, (x0 + x1) / 2, h + 1.95 + rise * (1 - f), z);
    }
  }

  const t = 0.12, Y0 = 1.2;
  // 混凝土墙裙（常显）
  k.slab(MAT.concrete, x0 - 0.5, x1 + 0.5, 0, Y0, z0 - 0.7, z0 - 0.3);
  k.slab(MAT.concrete, x0 - 0.5, x1 + 0.5, 0, Y0, z1 + 0.3, z1 + 0.7);

  // 纵墙
  const longWall = (z, lay, sgn) => {
    k.slab(wall, x0 - 0.5, x1 + 0.5, Y0, h + 1.8, z - t / 2, z + t / 2, { layer: lay });
    k.slab(band, x0 - 0.5, x1 + 0.5, h - 1.2, h + 1.9, z - t / 2 - sgn * 0.04, z + t / 2 - sgn * 0.04, { layer: lay });
    for (const f of windowsAt) {
      const y = Y0 + (h - Y0) * f;
      k.slab(MAT.windows, x0 + 1, x1 - 1, y, y + 1.6, z - t / 2 - sgn * 0.06, z + t / 2 - sgn * 0.06, { layer: lay });
    }
  };
  if (backWall) longWall(z0 - 0.5, "", -1);
  longWall(z1 + 0.5, layer, 1);

  // 端墙（含山墙三角）
  const gable = new THREE.Shape();
  gable.moveTo(-D / 2 - 0.5, 0); gable.lineTo(D / 2 + 0.5, 0); gable.lineTo(0, rise + 0.05); gable.closePath();
  for (const [x, key, sg] of [[x0 - 0.5, "x0", -1], [x1 + 0.5, "x1", 1]]) {
    const ys = ends[key];
    if (ys === false || ys === undefined) continue;
    const ylo = Math.max(Y0, ys);
    if (h + 1.8 - ylo > 0.5) {
      k.slab(wall, x - t / 2, x + t / 2, ylo, h + 1.8, z0 - 0.5, z1 + 0.5, { layer });
      k.slab(band, x - t / 2 + sg * 0.04, x + t / 2 + sg * 0.04, h - 1.2, h + 1.9, z0 - 0.5, z1 + 0.5, { layer });
    }
    const g = new THREE.ExtrudeGeometry(gable, { depth: t, bevelEnabled: false });
    k.geo(wall, g, x - t / 2, h + 1.8, zc, { ry: Math.PI / 2, layer });
    if (ys === 0) {
      // 大门
      const dz = doorZ ?? zc;
      k.slab(MAT.steelDark, x - t / 2 - sg * 0.05, x + t / 2 + sg * 0.05, 0, Math.min(10, h * 0.5), dz - 4, dz + 4, { layer });
    }
  }

  // 屋面
  for (const sg of [-1, 1]) {
    k.box(roof, W + 1.6, 0.14, slopeL + 1.2, (x0 + x1) / 2, h + 1.95 + rise / 2 + 0.25, zc + sg * (D / 4 + 0.3), { rx: sg * ang, layer });
    if (skylight) k.box(MAT.skylight, W * 0.92, 0.16, 1.6, (x0 + x1) / 2, h + 1.95 + rise * 0.5 + 0.3, zc + sg * (D / 4), { rx: sg * ang, layer });
  }
  // 屋脊通风天窗
  if (monitor) {
    const mw = Math.min(6, D * 0.2), mh = 2.4, yb = h + 1.8 + rise;
    k.slab(MAT.louvre, x0 + bx * 0.5, x1 - bx * 0.5, yb, yb + mh, zc - mw / 2, zc + mw / 2, { layer });
    k.box(roof, W - bx + 1, 0.14, mw + 2.4, (x0 + x1) / 2, yb + mh + 0.1, zc, { layer });
  }
  return { rise, top: h + 1.8 + rise };
}

// 桥式起重机（独立网格，用于动画）：跨度沿 z
export function makeCrane(z0, z1, railY, { mat = MAT.crane } = {}) {
  const span = z1 - z0, zc = (z0 + z1) / 2;
  const bridge = new Kit();
  for (const x of [-1.4, 1.4]) bridge.box(mat, 1.1, 2.2, span - 1, x, railY + 1.4, zc);
  for (const z of [z0 + 1.2, z1 - 1.2]) bridge.box(mat, 5.2, 1.2, 1.6, 0, railY + 0.75, z);
  bridge.box(MAT.steelDark, 2.2, 2.4, 2.2, 0.0, railY - 0.9, z1 - 3);
  bridge.box(MAT.glass, 2.25, 1.2, 2.25, 0.0, railY - 0.6, z1 - 3);
  railing(bridge, [[-2.2, railY + 2.5, z0 + 2], [-2.2, railY + 2.5, z1 - 2]], 1.0);
  const trolley = new Kit();
  trolley.box(MAT.steelDark, 4.2, 1.6, 3.6, 0, railY + 3.3, 0);
  trolley.cyl(MAT.steel, 0.7, 0.7, 3, 0, railY + 3.5, 0.9, 16, { rz: Math.PI / 2 });
  trolley.box(mat, 1.2, 1, 1, 1.6, railY + 4.4, -1.2);
  const hook = new Kit();
  hook.box(MAT.yellow, 1.6, 0.9, 0.8, 0, 0, 0);
  hook.box(MAT.steelDark, 0.25, 1.6, 4.6, 0, -1.0, 0);
  const g = new THREE.Group();
  const gb = bridge.build(), gt = trolley.build(), gh = hook.build();
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), MAT.steelDark);
  rope.castShadow = true;
  gt.add(rope);
  g.add(gb, gt);
  gt.add(gh);
  return { group: g, trolley: gt, hook: gh, rope, railY, zc };
}

// 设置吊钩高度（trolley 局部 z 坐标为 0）
export function setHook(crane, y) {
  const top = crane.railY + 2.4;
  crane.hook.position.set(0, y, 0);
  crane.rope.position.set(0, (top + y) / 2, 0);
  crane.rope.scale.set(1, Math.max(0.1, top - y), 1);
}
