// ============================================================
// 厂区主工序 3D 建模（真实比例，1 单位 = 1 米）
// 每个工序一个 buildXxx()，返回：
//   { group, slot, pick, placeholder, view, update(t,dt,env), simStep(p,token,env), simEnd() }
//   slot  —— 模拟时钢包/铁水罐停放的工位（局部坐标）
//   pick  —— 天车吊运时的起吊点（默认 = slot）
//   placeholder —— 工位上原有的罐子，模拟物到达时隐藏
// buildPlant(scene) 装配整个厂区
// ============================================================
import * as THREE from "three";
import {
  MAT, Kit, hcol, truss, lattice, railing, platform, stairs, track, gallery,
  transferTower, chimney, tank, silo, building, makeCrane, setHook,
} from "./kit.js";
import { FX } from "./effects.js";

const PI = Math.PI;
const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (cur, target, k) => cur + (target - cur) * Math.min(1, k);
const seg = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const sstep = (p, a, b) => { const t = seg(p, a, b); return t * t * (3 - 2 * t); };

// 点光源（热源照明）
function hotLight(color, intensity, dist, x, y, z) {
  const l = new THREE.PointLight(color, intensity, dist, 2);
  l.position.set(x, y, z);
  l.userData.base = intensity;
  return l;
}

// 沿 XY 平面折线扫掠矩形截面（铸坯/带钢），uv.x 沿长度 0→1
function sweepRect(pts, w, t) {
  const n = pts.length, lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = lens[n - 1];
  const pos = [], nor = [], uv = [], idx = [];
  const Z = vec(0, 0, 1);
  const corners = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const T = b.clone().sub(a).normalize();
    const N = vec(-T.y, T.x, 0);
    const p = pts[i];
    const c = (sn, sz) => p.clone().addScaledVector(N, sn * t / 2).addScaledVector(Z, sz * w / 2);
    corners.push({ c: [c(1, 1), c(1, -1), c(-1, -1), c(-1, 1)], N, u: lens[i] / L });
  }
  const faces = [[0, 1, 1], [1, 2, -3], [2, 3, -1], [3, 0, 3]]; // [ci, cj, normal: 1=N,-1=-N,3=Z,-3=-Z]
  let base = 0;
  for (const [ci, cj, nk] of faces) {
    for (let i = 0; i < n; i++) {
      const C = corners[i];
      const nn = nk === 1 ? C.N : nk === -1 ? C.N.clone().negate() : nk === 3 ? Z : Z.clone().negate();
      for (const [cc, v] of [[ci, 0], [cj, 1]]) {
        pos.push(C.c[cc].x, C.c[cc].y, C.c[cc].z);
        nor.push(nn.x, nn.y, nn.z);
        uv.push(C.u, v);
      }
      if (i < n - 1) {
        const k0 = base + i * 2;
        idx.push(k0, k0 + 2, k0 + 1, k0 + 1, k0 + 2, k0 + 3);
      }
    }
    base += n * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // 保证三角形朝外：若第一个三角形法线与给定法线相反则翻转
  const p0 = vec(pos[0], pos[1], pos[2]), p1 = vec(pos[3], pos[4], pos[5]), p2 = vec(pos[6], pos[7], pos[8]);
  const fn = p2.clone().sub(p0).cross(p1.clone().sub(p0));
  if (fn.dot(vec(nor[0], nor[1], nor[2])) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; }
    g.setIndex(idx);
  }
  return g;
}

// ============================================================
// 通用罐体：钢包 / 鱼雷罐车 / 钢卷（模拟 token 也复用）
// ============================================================
export function ladle(k, x = 0, y = 0, z = 0, { hot = true } = {}) {
  k.at(x, y, z, 0, () => {
    k.lathe(MAT.steelDark, [[0, 0], [1.7, 0], [1.85, 0.18], [2.02, 3.9], [2.2, 3.95], [2.2, 4.35], [1.95, 4.35], [1.9, 4.1]], 0, 0, 0, 28);
    for (const yy of [1.1, 2.4, 3.5]) k.torus(MAT.steelDark, 1.9 + yy * 0.04 + 0.03, 0.1, 0, yy, 0, { ts: 28, rs: 6 });
    for (const s of [-1, 1]) {
      k.box(MAT.steelDark, 0.5, 1.8, 1.4, s * 2.12, 3.0, 0);
      k.cyl(MAT.steel, 0.36, 0.36, 0.9, s * 2.6, 3.1, 0, 12, { rz: PI / 2 });
    }
    k.box(MAT.steelDark, 1.0, 0.45, 1.0, 0.7, -0.1, 0);
    if (hot) k.cyl(MAT.melt, 1.9, 1.9, 0.1, 0, 4.05, 0, 28);
    else k.cyl(MAT.refractory, 1.88, 1.88, 0.1, 0, 3.4, 0, 28);
  });
}

export function torpedo(k, x = 0, y = 0, z = 0) {
  k.at(x, y, z, 0, () => {
    k.lathe(MAT.steelDark, [[0, -9.5], [0.8, -9.4], [1.25, -8.4], [1.95, -4.2], [1.95, 4.2], [1.25, 8.4], [0.8, 9.4], [0, 9.5]], 0, 3.25, 0, 24, { rz: PI / 2 });
    for (const xx of [-3.5, 0, 3.5]) k.torus(MAT.steel, 1.98, 0.09, xx, 3.25, 0, { rx: 0, ry: PI / 2, ts: 24, rs: 5 });
    k.box(MAT.steelDark, 2.0, 0.7, 1.7, 0, 5.3, 0);
    k.box(MAT.hot, 1.3, 0.05, 1.0, 0, 5.66, 0);
    for (const s of [-1, 1]) {
      k.box(MAT.frame, 5.6, 0.9, 2.5, s * 7, 1.25, 0);
      k.box(MAT.frame, 1.4, 1.6, 1.7, s * 8.6, 2.3, 0);
      for (const w of [-1.7, 1.7]) k.cyl(MAT.steelDark, 0.45, 0.45, 1.9, s * 7 + w, 1.0, 0, 12, { rx: PI / 2 });
    }
  });
}

export function coilShape(k, x, y, z, { r = 1.0, ri = 0.38, w = 1.5, axis = "z" } = {}) {
  const o = axis === "z" ? { rx: PI / 2 } : { rz: PI / 2 };
  k.lathe(MAT.coil, [[ri, -w / 2], [r, -w / 2], [r, w / 2], [ri, w / 2], [ri, -w / 2]], x, y, z, 32, o);
}

// ============================================================
// 原料场：条形料堆 + 斗轮堆取料机 + 翻车机 + 皮带
// ============================================================
function stockpile(k, mat, x, z, L, W, H, seed = 1) {
  const sx = Math.round((L + W) / 2.2), sz = 18;
  const g = new THREE.PlaneGeometry(L + W, W, sx, sz);
  g.rotateX(-PI / 2);
  const p = g.attributes.position;
  const tanA = Math.tan(37 * PI / 180);
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), pz = p.getZ(i);
    const dx = Math.max(0, Math.abs(px) - L / 2);
    const d = Math.hypot(dx, pz);
    let h = Math.min(H, (W / 2 - d) * tanA);
    const n = Math.sin(px * 0.21 + seed) * Math.cos(pz * 0.37 + seed * 2) * 0.5 + Math.sin(px * 0.07 + seed * 3) * 0.6;
    h = Math.max(0.05, h + (h > 0.4 ? n * Math.min(1, h / 3) : 0));
    // 取料机已取走一端：料堆端部呈斜坡
    const ex = (seed % 2 ? px : -px) - L * 0.25;
    if (ex > 0) h = Math.min(h, Math.max(0.05, H - ex * 0.35));
    p.setY(i, h);
  }
  g.computeVertexNormals();
  k.geo(mat, g, x, 0, z);
}

function bucketWheelMachine(side = 1) {
  // 局部：轨道沿 x，轨距 7m（z=±3.5）；上部可回转，臂架指向局部 +x
  const base = new Kit();
  for (const sx of [-4, 4]) for (const sz of [-3.5, 3.5]) {
    base.box(MAT.crane, 0.9, 5, 0.9, sx, 3.0, sz);
    base.box(MAT.steelDark, 3.2, 1.1, 1.3, sx, 0.9, sz);
  }
  base.box(MAT.crane, 10, 1.2, 9, 0, 5.9, 0);
  base.cyl(MAT.steelDark, 3.2, 3.2, 1.2, 0, 7.1, 0, 28);
  const upper = new Kit();
  // 门架/塔架
  upper.box(MAT.crane, 6, 1.2, 5, 0, 8.3, 0);
  lattice(upper, MAT.crane, [-1, 8.8, -1.5], [0, 20, 0], 1.4, 6, 0.12);
  lattice(upper, MAT.crane, [-1, 8.8, 1.5], [0, 20, 0], 1.4, 6, 0.12);
  // 臂架（格构）
  lattice(upper, MAT.crane, [2.5, 9.5, 0], [40, 6.8, 0], 2.4, 16, 0.14);
  upper.box(MAT.rubber, 37, 0.15, 1.2, 21, 10.1, 0, { rz: -0.072 });
  // 配重臂 + 配重
  lattice(upper, MAT.crane, [-2.5, 9.5, 0], [-18, 11, 0], 2.0, 6, 0.13);
  upper.box(MAT.concreteDk, 4.5, 4, 5, -19, 9.5, 0);
  // 拉杆
  for (const zz of [-0.6, 0.6]) {
    upper.rod(MAT.steelDark, [0, 20, zz], [38, 7.8, zz], 0.08, 5);
    upper.rod(MAT.steelDark, [0, 20, zz], [-17, 12, zz], 0.08, 5);
  }
  // 司机室
  upper.box(MAT.white, 2.4, 2.2, 2.2, 6, 11.6, 2.6);
  upper.box(MAT.glass, 2.45, 1.0, 2.25, 6, 11.9, 2.6);
  // 斗轮
  const wheel = new Kit();
  wheel.torus(MAT.crane, 3.6, 0.22, 0, 0, 0, { rx: 0, ts: 40, rs: 6 });
  wheel.torus(MAT.crane, 2.6, 0.12, 0, 0, 0, { rx: 0, ts: 32, rs: 5 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    wheel.rod(MAT.crane, [0, 0, 0], [Math.cos(a) * 3.5, Math.sin(a) * 3.5, 0], 0.1, 5);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2;
    wheel.box(MAT.steelDark, 1.1, 0.9, 1.4, Math.cos(a) * 3.9, Math.sin(a) * 3.9, 0, { rz: a });
  }
  wheel.cyl(MAT.steelDark, 0.5, 0.5, 2.2, 0, 0, 0, 12, { rx: PI / 2 });

  const g = new THREE.Group();
  g.add(base.build());
  const up = upper.build();
  const wg = wheel.build();
  wg.position.set(41.5, 6.6, 0);
  up.add(wg);
  g.add(up);
  return { group: g, upper: up, wheel: wg };
}

function buildRawyard() {
  const k = new Kit();
  const g = new THREE.Group();
  // 料堆：两条轨道各服务两侧料条
  const piles = [
    [MAT.ore, -56, 1], [MAT.pellet, -19, 2], [MAT.coal, 19, 3], [MAT.lime, 56, 4],
  ];
  for (const [m, z, s] of piles) stockpile(k, m, -6, z, 128, 28, 14, s);
  // 料条之间的混凝土挡墙
  for (const z of [-71, 71]) k.slab(MAT.concrete, -80, 68, 0, 3, z - 0.4, z + 0.4);
  const machines = [];
  for (const [rz, side] of [[-37.5, -1], [37.5, 1]]) {
    track(k, [-82, 0, rz - 3.5], [82, 0, rz - 3.5], { ballast: false });
    track(k, [-82, 0, rz + 3.5], [82, 0, rz + 3.5], { ballast: false });
    k.slab(MAT.concreteDk, -84, 84, 0, 0.3, rz - 6, rz + 6);
    // 地面皮带机（料场带式输送机）
    const bz = rz + (side > 0 ? -8.5 : 8.5);
    k.slab(MAT.frame, -82, 86, 0.6, 1.3, bz - 0.9, bz + 0.9);
    k.slab(MAT.rubber, -82, 86, 1.3, 1.45, bz - 0.7, bz + 0.7);
    k.slab(MAT.roofGrey, -82, 86, 2.3, 2.45, bz - 1.1, bz + 1.1);
    for (let x = -80; x <= 86; x += 4) { k.box(MAT.frame, 0.2, 2.3, 0.2, x, 1.15, bz - 1.0); k.box(MAT.frame, 0.2, 2.3, 0.2, x, 1.15, bz + 1.0); }
    for (const [x0, dir] of [[-30, 1], [30, -1]]) {
      const m = bucketWheelMachine();
      m.group.position.set(x0, 0, rz);
      m.baseAngle = dir > 0 ? side * 0.6 : PI + side * 0.6;
      m.upper.rotation.y = m.baseAngle;
      m.x0 = x0; m.phase = Math.random() * 10;
      g.add(m.group);
      machines.push(m);
    }
  }
  // 翻车机房 + 运矿列车
  k.slab(MAT.concrete, 46, 76, 0, 1, 80, 98);
  building(k, { x0: 50, x1: 72, z0: 82, z1: 96, h: 16, bay: 11, ends: { x0: 0, x1: 0 }, layer: "" });
  track(k, [-90, 0, 89], [110, 0, 89]);
  for (let i = 0; i < 9; i++) {
    const x = -78 + i * 14.2;
    k.slab(MAT.primer, x - 6.5, x + 6.5, 1.3, 4.3, 87.4, 90.6);
    for (const s of [-1, 1]) k.slab(MAT.steelDark, x + s * 4.6 - 1.4, x + s * 4.6 + 1.4, 0.55, 1.4, 87.6, 90.4);
    k.lathe(MAT.ore, [[0, 4.3], [1.5, 4.3], [0.2, 5.2], [0, 5.2]], x, 0, 89, 12, { sx: 3.8, sz: 1 });
  }
  // 转运站
  transferTower(k, 92, 0, 22);
  gallery(k, [86, 2.5, -48], [92, 18, -4], { w: 4 });
  gallery(k, [86, 2.5, 48], [92, 18, 4], { w: 4 });

  g.add(k.build());
  const update = (t) => {
    for (const m of machines) {
      m.wheel.rotation.z = -t * 1.2;
      m.upper.rotation.y = m.baseAngle + Math.sin(t * 0.06 + m.phase) * 0.18;
      m.group.position.x = m.x0 + Math.sin(t * 0.012 + m.phase) * 22;
    }
  };
  return { group: g, update, view: { target: [0, 6, 0], dist: 210 } };
}

// ============================================================
// 焦化厂：两座焦炉 + 煤塔 + 推焦机/拦焦车/熄焦车 + 熄焦塔 + 干熄焦 + 烟囱
// ============================================================
function cokeBattery(k, xa, xb) {
  const W = 15, n = Math.round((xb - xa) / 1.5);
  k.slab(MAT.concreteDk, xa - 2, xb + 2, 0, 4.2, -W / 2 - 1.5, W / 2 + 1.5);
  k.slab(MAT.brick, xa, xb, 4.2, 12.4, -W / 2, W / 2);
  k.slab(MAT.refractory, xa - 0.6, xb + 0.6, 12.4, 13.0, -W / 2 - 0.4, W / 2 + 0.4);
  for (let i = 0; i < n; i++) {
    const x = xa + (i + 0.5) * 1.5;
    for (const s of [-1, 1]) {
      k.box(MAT.steelDark, 0.95, 6.8, 0.35, x, 8.2, s * (W / 2 + 0.17));
      k.box(MAT.rust, 0.5, 1.0, 0.2, x, 8.2, s * (W / 2 + 0.42));
    }
    // 上升管 + 桥管
    k.rod(MAT.steel, [x, 13, -5], [x, 16.2, -5], 0.24, 8);
    k.rod(MAT.steel, [x, 16.2, -5], [x, 16.6, -6.3], 0.2, 6);
    k.cyl(MAT.steelDark, 0.22, 0.22, 0.12, x, 13.06, 0.5, 8);
    k.cyl(MAT.steelDark, 0.22, 0.22, 0.12, x, 13.06, 2.5, 8);
  }
  for (let i = 0; i <= n; i++) {
    const x = xa + i * 1.5;
    for (const s of [-1, 1]) k.box(MAT.frame, 0.32, 9.6, 0.55, x, 8.6, s * (W / 2 + 0.35));
  }
  // 集气管
  k.cyl(MAT.steel, 0.85, 0.85, xb - xa + 2, (xa + xb) / 2, 16.6, -6.6, 16, { rz: PI / 2 });
  // 装煤车轨道
  for (const z of [-1.8, 3.8]) k.slab(MAT.rail, xa - 1, xb + 1, 13.0, 13.2, z - 0.06, z + 0.06);
  // 推焦侧 / 焦侧操作平台
  k.slab(MAT.concrete, xa - 2, xb + 2, 4.2, 4.8, -W / 2 - 6, -W / 2 - 0.5);
  k.slab(MAT.concrete, xa - 2, xb + 2, 4.2, 4.8, W / 2 + 0.5, W / 2 + 4);
  for (const z of [-W / 2 - 2, -W / 2 - 5.2]) k.slab(MAT.rail, xa - 6, xb + 6, 4.8, 5.0, z - 0.06, z + 0.06);
  for (const z of [W / 2 + 1.4, W / 2 + 3.2]) k.slab(MAT.rail, xa - 6, xb + 6, 4.8, 5.0, z - 0.06, z + 0.06);
}

function buildCoking() {
  const k = new Kit();
  const g = new THREE.Group();
  cokeBattery(k, -52, -7);
  cokeBattery(k, 7, 52);
  // 煤塔
  k.slab(MAT.concrete, -6, 6, 0, 42, -8, 8);
  k.slab(MAT.wall, -6.5, 6.5, 42, 48, -8.5, 8.5);
  k.slab(MAT.roofGrey, -7, 7, 48, 48.5, -9, 9);
  for (let y = 18; y < 42; y += 8) k.slab(MAT.windows, -6.1, 6.1, y, y + 1.4, -8.1, 8.1);
  // 烟囱
  chimney(k, -60, -22, 100, 4.2, 2.8, { mat: MAT.brick, bands: false });
  chimney(k, 60, -22, 100, 4.2, 2.8, { mat: MAT.brick, bands: false });
  // 熄焦塔（湿熄焦，备用）
  k.slab(MAT.concrete, 62, 74, 0, 34, 12, 22);
  k.slab(MAT.concreteDk, 63, 73, 34, 36, 13, 21);
  k.slab(MAT.steelDark, 62.5, 73.5, 0, 6, 11.6, 22.4);
  // 干熄焦（CDQ）塔
  {
    const cx = -70, cz = 20;
    k.slab(MAT.concrete, cx - 8, cx + 8, 0, 1, cz - 8, cz + 8);
    for (const sx of [-6, 6]) for (const sz of [-6, 6]) hcol(k, MAT.frame, cx + sx, cz + sz, 0, 46, 0.8);
    for (let y = 10; y <= 46; y += 9) platform(k, cx - 6.5, cx + 6.5, cz - 6.5, cz + 6.5, y);
    k.cyl(MAT.refractory, 4.2, 4.2, 26, cx, 13, cz, 28);
    k.cyl(MAT.steel, 4.4, 4.4, 2, cx, 26.5, cz, 28);
    k.slab(MAT.wall, cx + 8, cx + 22, 0, 28, cz - 7, cz + 7);
    k.slab(MAT.roofGrey, cx + 7.5, cx + 22.5, 28, 28.5, cz - 7.5, cz + 7.5);
    k.cyl(MAT.steel, 2.2, 2.2, 22, cx + 15, 28 + 11, cz + 3, 20);
    // 提升机
    lattice(k, MAT.crane, [cx - 4, 46, cz], [cx + 4, 46, cz], 2.2, 4, 0.15);
  }
  // 化产回收区（初冷器、电捕、脱硫塔）
  for (let i = 0; i < 3; i++) tank(k, -38 + i * 10, -40, 3.4, 22, { mat: MAT.silver });
  for (let i = 0; i < 2; i++) tank(k, -6 + i * 8, -40, 2.4, 14, { mat: MAT.steel, roof: "cone" });
  tank(k, 16, -42, 5, 30, { mat: MAT.silver });
  k.pipe(MAT.steel, [[-52, 16.6, -6.6], [-58, 16.6, -6.6], [-58, 16.6, -30], [-38, 16.6, -30], [-38, 22, -36]], 0.85);
  for (let i = 0; i < 4; i++) k.rod(MAT.steel, [-30 + i * 10, 18, -34], [-10 + i * 10, 18, -34], 0.6, 12);

  // 推焦机 / 拦焦车 / 熄焦车 / 装煤车（动画）
  const mk = (fn) => { const kk = new Kit(); fn(kk); const m = kk.build(); g.add(m); return m; };
  const pusher = mk((q) => {
    q.slab(MAT.crane, -4, 4, 5.0, 16, -17.5, -11.8);
    q.slab(MAT.steelDark, -4.2, 4.2, 5.0, 6.4, -18, -11.6);
    q.slab(MAT.white, -3.5, -0.5, 12.5, 15, -18, -17);
    q.slab(MAT.glass, -3.4, -0.6, 13.2, 14.6, -18.05, -17.5);
    q.slab(MAT.steelDark, -1.1, 1.1, 7.5, 9, -11.8, -9.5);
  });
  const guide = mk((q) => {
    q.slab(MAT.crane, -2.8, 2.8, 5.0, 14, 8.6, 11.8);
    q.slab(MAT.steelDark, -1.4, 1.4, 5.8, 11.4, 7.4, 8.6);
  });
  const charger = mk((q) => {
    q.slab(MAT.crane, -4, 4, 13.6, 17, -2.6, 4.6);
    for (const x of [-2.5, 0, 2.5]) q.cyl(MAT.steel, 1.0, 0.6, 2.4, x, 18.2, 1, 12);
  });
  track(k, [-60, 0, 17], [76, 0, 17], { ballast: true });
  const quench = mk((q) => {
    q.slab(MAT.steelDark, -6, 6, 0.6, 4.6, 15.2, 18.8);
    q.slab(MAT.hotDim, -5.6, 5.6, 3.6, 4.4, 15.5, 18.5);
  });
  const quenchHot = quench; // 包含红焦
  const steamQ = FX.steam([68, 34, 17], 1.6, { count: 90, life: 8, opacity: 0.0 });
  g.add(steamQ);
  const stackL = FX.stackSmoke([-60, 101, -22], 1), stackR = FX.stackSmoke([60, 101, -22], 1);
  g.add(stackL, stackR);
  g.add(k.build());

  const update = (t) => {
    pusher.position.x = Math.sin(t * 0.03) * 40;
    guide.position.x = Math.sin(t * 0.03) * 40;
    charger.position.x = Math.sin(t * 0.025 + 1.4) * 42;
    // 熄焦车往返熄焦塔，并周期性冒出大团白汽
    const cyc = (t % 60) / 60;
    quenchHot.position.x = cyc < 0.5 ? Math.sin(t * 0.03) * 40 : ease(quenchHot.position.x, 68, 0.02);
    steamQ.material.uniforms.uOpacity.value = cyc > 0.62 && cyc < 0.82 ? 0.6 : 0.0;
  };
  return { group: g, update, view: { target: [0, 10, 0], dist: 170 } };
}

// ============================================================
// 烧结厂：烧结机主厂房 + 环冷机 + 主抽风机/电除尘 + 大烟囱 + 脱硫塔
// ============================================================
function buildSinter() {
  const k = new Kit();
  const g = new THREE.Group();
  building(k, { x0: -54, x1: 54, z0: -12, z1: 12, h: 24, bay: 9, crane: { y: 20, z: [-10.8, 10.8] }, ends: { x0: 0, x1: 0 } });
  // 烧结机：台车面（点火端高温 → 尾部冷却）
  for (const x of [-48, -40, -30, -20, -10, 0, 10, 20, 30, 40, 48]) k.slab(MAT.concrete, x - 1, x + 1, 0, 11.5, -5, -3), k.slab(MAT.concrete, x - 1, x + 1, 0, 11.5, 3, 5);
  k.slab(MAT.steelDark, -49, 49, 11.5, 12.6, -5.2, 5.2);
  k.box(MAT.sinter, 94, 0.7, 4.4, 0, 13.05, 0);
  for (const s of [-1, 1]) k.slab(MAT.steelDark, -47, 47, 12.6, 13.9, s * 2.2 + (s > 0 ? 0 : -0.3), s * 2.2 + (s > 0 ? 0.3 : 0));
  k.slab(MAT.steelDark, -47, 47, 9.6, 10.4, -2.4, 2.4);
  for (const x of [-48.5, 48.5]) k.cyl(MAT.steelDark, 2.0, 2.0, 5.2, x, 11.6, 0, 20, { rx: PI / 2 });
  // 点火炉
  k.slab(MAT.refractory, -44, -36, 13.4, 16.2, -3, 3);
  k.slab(MAT.hot, -43.6, -36.4, 13.36, 13.44, -2.1, 2.1);
  // 风箱 + 大烟道
  for (let x = -44; x <= 44; x += 4) k.cyl(MAT.steelDark, 1.2, 0.3, 3.5, x, 7.2, 0, 4, { ry: PI / 4 });
  for (const z of [-4.2, 4.2]) k.cyl(MAT.steel, 1.5, 1.5, 100, 0, 4.0, z, 20, { rz: PI / 2 });
  // 混料圆筒
  k.cyl(MAT.steelDark, 2.1, 2.1, 18, -76, 8.5, 0, 24, { rz: PI / 2 - 0.05 });
  for (const x of [-82, -70]) k.torus(MAT.steel, 2.3, 0.25, x, 8.5, 0, { rx: 0, ry: PI / 2, ts: 28 });
  for (const x of [-83, -69]) k.slab(MAT.concrete, x - 1.5, x + 1.5, 0, 6.4, -2.5, 2.5);
  gallery(k, [-66, 9, 0], [-54, 18, 0], { w: 3.5 });
  // 环冷机
  {
    const cx = 82, R = 18;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * PI * 2;
      k.box(MAT.frame, 0.8, 7, 0.8, cx + Math.cos(a) * R, 3.5, Math.sin(a) * R);
    }
    k.lathe(MAT.steelDark, [[R - 4.5, 7], [R + 4.5, 7], [R + 4.5, 9.5], [R + 4.3, 9.5], [R + 4.3, 7.4], [R - 4.3, 7.4], [R - 4.3, 9.5], [R - 4.5, 9.5], [R - 4.5, 7]], cx, 0, 0, 64);
    const hotRing = new THREE.RingGeometry(R - 4.2, R + 4.2, 64, 1, 0, PI * 0.8);
    hotRing.rotateX(-PI / 2);
    const ringMat = MAT.hotDim.clone(); ringMat.emissiveIntensity = 0.7;
    k.geo(ringMat, hotRing, cx, 8.9, 0);
    const coolRing = new THREE.RingGeometry(R - 4.2, R + 4.2, 64, 1, PI * 0.8, PI * 1.2);
    coolRing.rotateX(-PI / 2);
    k.geo(MAT.sinter, coolRing, cx, 8.85, 0);
    k.lathe(MAT.roofGrey, [[R - 4.6, 9.5], [R - 3, 12], [R + 3, 12], [R + 4.6, 9.5]], cx, 0, 0, 64, { phi: PI * 0.85, phiLen: PI * 1.1 });
    for (const a of [1.2, 1.9, 2.6]) k.cyl(MAT.steel, 1.1, 1.1, 10, cx + Math.cos(a + PI / 2) * R, 16, Math.sin(a + PI / 2) * R * -1, 16);
    // 冷却后的成品烧结矿经整粒筛分楼送往高炉矿槽
    transferTower(k, cx + 34, 22, 26, 14, 12);
    gallery(k, [cx + 18, 9, 18], [cx + 28, 16, 22], { w: 3 });
  }
  // 主抽风机 + 电除尘器
  {
    const ex = 22, ez = -36;
    k.slab(MAT.blueGrey, ex - 22, ex + 22, 10, 26, ez - 8, ez + 8);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) k.cyl(MAT.blueGrey, 4.6, 0.6, 7, ex - 18 + i * 7.2, 6.5, ez + s * 4, 4, { ry: PI / 4 });
    for (let i = 0; i < 6; i++) k.slab(MAT.steelDark, ex - 20 + i * 7.2, ex - 16 + i * 7.2, 26, 28, ez - 6, ez + 6);
    for (let i = 0; i < 12; i++) k.box(MAT.frame, 0.6, 10, 0.6, ex - 21 + (i % 6) * 8.4, 5, ez + (i < 6 ? -7.5 : 7.5));
    k.pipe(MAT.steel, [[50, 4, -4.2], [56, 4, -4.2], [56, 18, -20], [ex + 22, 18, -28]], 1.5);
    k.pipe(MAT.steel, [[50, 4, 4.2], [60, 4, 4.2], [60, 18, -24], [ex + 22, 18, -32]], 1.5);
    for (const s of [-1, 1]) {
      k.cyl(MAT.blueGrey, 3.2, 3.2, 3, ex + 34, 5, ez + s * 5, 24, { rx: PI / 2 });
      k.slab(MAT.steelDark, ex + 37, ex + 44, 0, 4, ez + s * 5 - 1.8, ez + s * 5 + 1.8);
    }
    k.pipe(MAT.steel, [[ex + 22, 18, ez], [ex + 34, 18, ez], [ex + 34, 8, ez]], 1.4);
    // 脱硫塔
    tank(k, ex + 52, ez - 18, 6.5, 34, { mat: MAT.silver, roof: "cone" });
    k.pipe(MAT.steel, [[ex + 34, 5, ez - 5], [ex + 34, 5, ez - 18], [ex + 45.5, 5, ez - 18]], 1.5);
    k.pipe(MAT.steel, [[ex + 52, 34, ez - 18], [ex + 52, 38, ez - 18], [ex + 64, 38, ez - 12], [ex + 64, 30, ez - 6]], 1.4);
    chimney(k, ex + 64, ez - 2, 110, 5, 3.4);
    g.add(FX.stackSmoke([ex + 64, 111, ez - 2], 1.2));
  }
  g.add(FX.steam([82 + 0, 21, -18], 0.6, { count: 40, life: 6, opacity: 0.25 }));
  g.add(k.build());
  return { group: g, view: { target: [10, 10, 0], dist: 175 } };
}

// ============================================================
// 高炉：炉体 + 风口/环管 + 出铁场 + 炉顶 + 上升/下降管 + 重力除尘 + 热风炉 + 主皮带
// ============================================================
function buildBF() {
  const k = new Kit();
  const g = new THREE.Group();
  const prof = [[0, 4.5], [7.4, 4.5], [7.8, 5.2], [7.8, 15.0], [8.1, 15.4], [8.1, 16.2], [9.0, 20.5], [9.0, 23.5], [6.6, 40.5], [6.6, 42.5], [5.6, 44.0], [3.0, 45.6], [2.6, 46.4], [0, 46.4]];
  const rAt = (y) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      if (y >= y0 && y <= y1 && y1 > y0) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
    }
    return 6;
  };
  k.slab(MAT.concrete, -30, 30, 0, 0.5, -24, 36);
  k.lathe(MAT.bfShell, prof, 0, 0, 0, 56);
  for (const y of [17, 19, 25, 28, 31, 34, 37, 40]) k.torus(MAT.steelDark, rAt(y) + 0.1, 0.16, 0, y, 0, { ts: 56, rs: 6 });
  // 冷却水管（沿炉身竖向排布）
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * PI * 2;
    const P = (y) => [Math.cos(a) * (rAt(y) + 0.42), y, Math.sin(a) * (rAt(y) + 0.42)];
    k.rod(MAT.steel, P(16.4), P(20.5), 0.09, 5);
    k.rod(MAT.steel, P(20.5), P(23.5), 0.09, 5);
    k.rod(MAT.steel, P(23.5), P(40.2), 0.09, 5);
  }
  // 热风环管 + 32 个风口（直吹管）
  k.torus(MAT.silver, 12.2, 1.15, 0, 21.8, 0, { ts: 72, rs: 14 });
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * PI * 2, c = Math.cos(a), s = Math.sin(a);
    k.pipe(MAT.silver, [[12.2 * c, 20.8, 12.2 * s], [11.9 * c, 17.8, 11.9 * s], [10.6 * c, 16.2, 10.6 * s], [8.35 * c, 15.7, 8.35 * s]], 0.3, { seg: 8, bend: 0.8, caps: false });
    k.sphere(MAT.hotWhite, 0.2, 8.22 * c, 15.7, 8.22 * s, { seg: 8, hseg: 6 });
  }
  // 出铁场平台（中间留出炉体孔）
  {
    const sh = new THREE.Shape();
    sh.moveTo(-26, -32); sh.lineTo(26, -32); sh.lineTo(26, 16); sh.lineTo(-26, 16); sh.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 0, 8.3, 0, PI * 2, true);
    sh.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: false, curveSegments: 40 });
    k.geo(MAT.concrete, fg, 0, 11.2, 0, { rx: -PI / 2 });
    for (const x of [-24, -12, 12, 24]) for (const z of [-14, 0, 13, 30]) k.box(MAT.concrete, 1.2, 11.2, 1.2, x, 5.6, z);
    for (const z of [-14, 30]) for (const x of [-4, 4]) k.box(MAT.concrete, 1.2, 11.2, 1.2, x, 5.6, z);
    railing(k, [[-26, 12, -16], [26, 12, -16]]);
  }
  // 主铁沟 → 撇渣器 → 摆动流嘴 → 鱼雷罐
  k.slab(MAT.refractory, -1.0, 1.0, 12, 12.8, 8.0, 17);
  const runner = new Kit();
  runner.slab(MAT.melt, -0.55, 0.55, 12.62, 12.7, 8.0, 17);
  runner.cyl(MAT.melt, 0.24, 0.3, 6.6, 0, 9.1, 18.6, 10);
  k.slab(MAT.refractory, -1.4, 1.4, 12.6, 14, 12.2, 13.0);
  k.slab(MAT.refractory, -0.9, 0.9, 11.6, 12.2, 16.8, 19.0, { rx: 0.2 });
  // 渣沟
  k.slab(MAT.refractory, -24, -1, 12, 12.6, 11.4, 12.6);
  runner.slab(MAT.hotDim, -24, -1, 12.55, 12.62, 11.6, 12.4);
  // 泥炮 / 开口机（出铁口两侧）
  k.slab(MAT.steelDark, 2.5, 5.5, 12, 13.6, 6.5, 9.5, { ry: -0.5 });
  k.slab(MAT.crane, -5.8, -2.2, 12, 13.2, 6.4, 9.4, { ry: 0.5 });

  // 出铁场厂房
  building(k, { x0: -28, x1: 28, z0: 4, z1: 34, h: 30, bay: 14, crane: { y: 24, z: [5.2, 32.8] }, ends: { x0: 0, x1: 0 }, backWall: false, windowsAt: [0.45, 0.75] });
  // 炉顶框架
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lattice(k, MAT.frame, [sx * 12.5, 12, sz * 12.5], [sx * 9.5, 47, sz * 9.5], 1.6, 14, 0.15);
  for (const y of [40.6, 46.6]) {
    platform(k, -12, 12, -12, -8.2, y, { open: "s" });
    platform(k, -12, 12, 8.2, 12, y, { open: "n" });
    platform(k, -12, -8.2, -8.2, 8.2, y, { rail: false });
    platform(k, 8.2, 12, -8.2, 8.2, y, { rail: false });
  }
  k.slab(MAT.grating, -8.2, 8.2, 46.48, 46.6, -8.2, 8.2);
  // 无料钟炉顶：两个料罐 + 齿轮箱 + 受料斗
  k.cyl(MAT.steelDark, 2.4, 2.4, 2.4, 0, 47.8, 0, 24);
  for (const x of [-3.7, 3.7]) {
    k.cyl(MAT.steel, 2.6, 0.6, 2.4, x, 50.2, 0, 24);
    k.cyl(MAT.steel, 2.6, 2.6, 5.8, x, 54.3, 0, 24);
    k.cyl(MAT.steel, 0.9, 2.6, 1.2, x, 57.8, 0, 24);
  }
  for (const sx of [-7, 7]) for (const sz of [-5, 5]) k.box(MAT.frame, 0.6, 15, 0.6, sx, 54, sz);
  k.slab(MAT.wall, -14, 2, 56, 62.5, -3.5, 3.5);
  k.slab(MAT.roofGrey, -14.4, 2.4, 62.5, 62.9, -3.9, 3.9);
  k.slab(MAT.frame, -8, 8, 61, 61.6, -6, 6);
  // 上升管（4 根）+ 放散阀 + 下降管
  const ups = [PI / 4, (3 * PI) / 4, (5 * PI) / 4, (7 * PI) / 4];
  const U = (a, y, r = 6.6) => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (const a of ups) {
    k.pipe(MAT.steel, [U(a, 45.6, 4.0), U(a, 49.5), U(a, 64)], 1.25, { seg: 16 });
    k.rod(MAT.steel, U(a, 64), U(a, 70), 0.65, 12);
    k.cyl(MAT.steelDark, 0.95, 0.95, 0.7, ...U(a, 70.3), 14);
  }
  k.rod(MAT.steel, U(ups[0], 63), U(ups[3], 63), 1.05, 14);
  k.rod(MAT.steel, U(ups[1], 63), U(ups[2], 63), 1.05, 14);
  k.pipe(MAT.steel, [[-4.67, 63, 0], [-4.67, 67, 0], [4.67, 67, 0], [4.67, 63, 0]], 1.0, { caps: false });
  k.pipe(MAT.steel, [[4.67, 66, 0], [10, 66, -5], [38, 36, -32], [38, 31, -32]], 1.35, { seg: 16 });
  // 重力除尘器
  k.lathe(MAT.steel, [[0, 5], [0.6, 5], [6.5, 12.5], [6.5, 27], [4, 30], [1.4, 31], [1.4, 32], [0, 32]], 38, 0, -32, 32);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(MAT.frame, 0.8, 13, 0.8, 38 + sx * 4.8, 6.5, -32 + sz * 4.8);
  k.torus(MAT.grating, 7.2, 0.7, 38, 26, -32, { rs: 2, ts: 32 });
  // 布袋除尘 + TRT
  k.pipe(MAT.steel, [[44.5, 20, -32], [56, 20, -32], [56, 20, -44], [80, 20, -44]], 1.1);
  for (let i = 0; i < 5; i++) for (const zz of [-50, -38]) silo(k, 58 + i * 5, zz, 1.9, 8, 6);
  k.slab(MAT.wall, 76, 92, 0, 12, -40, -28);
  k.slab(MAT.roof, 75.6, 92.4, 12, 12.4, -40.4, -27.6);

  // 热风炉（4 座顶燃式）
  const stoveX = [-27, -9, 9, 27], SZ = -46;
  for (const x of stoveX) {
    k.lathe(MAT.silver, [[0, 0], [6.6, 0], [6.6, 38], [6.3, 41], [5.4, 44.5], [3.8, 47], [1.8, 48.4], [0, 48.8]], x, 0, SZ, 48);
    for (const y of [6, 14, 22, 30, 37]) k.torus(MAT.steel, 6.65, 0.1, x, y, SZ, { ts: 48, rs: 5 });
    k.slab(MAT.concrete, x - 7.5, x + 7.5, 0, 0.8, SZ - 7.5, SZ + 7.5);
    k.rod(MAT.silver, [x, 30, SZ + 6.4], [x, 30, -37.6], 0.95, 16);
    k.box(MAT.steelDark, 2.4, 2.4, 1.4, x, 30, -40);
    k.rod(MAT.steel, [x, 6, SZ + 6.4], [x, 6, -37.6], 0.7, 12);
    k.rod(MAT.steel, [x, 10, SZ - 6.4], [x, 10, -54], 0.6, 12);
    platform(k, x - 4, x + 4, SZ + 5.2, SZ + 8.6, 38.2, { open: "ew" });
  }
  k.cyl(MAT.silver, 1.3, 1.3, 70, 0, 30, -36.5, 24, { rz: PI / 2 });
  k.cyl(MAT.steel, 1.0, 1.0, 70, 0, 6, -36.5, 20, { rz: PI / 2 });
  k.cyl(MAT.steel, 0.9, 0.9, 70, 0, 10, -54, 20, { rz: PI / 2 });
  k.pipe(MAT.silver, [[0, 30, -36.5], [0, 30, -24], [0, 22.6, -13.6]], 1.15, { caps: false });
  k.slab(MAT.concreteDk, -36, 36, 0, 3.5, -58, -54.5);
  chimney(k, -50, -58, 80, 3.4, 2.4, { mat: MAT.steel, bands: true });
  platform(k, -36, 36, -40.5, -37.8, 38.2, { open: "" });

  // 上料主皮带通廊（从矿槽到炉顶）
  gallery(k, [-188, 4, 0], [-11, 56.4, 0], { w: 5, h: 4 });

  g.add(k.build());
  const rg = runner.build();
  g.add(rg);
  // 静置鱼雷罐（模拟时隐藏，由 token 替代）
  const tk = new Kit(); torpedo(tk, 0, 0, 20);
  const ph = tk.build();
  g.add(ph);
  const tk2 = new Kit(); torpedo(tk2, 0, 0, -0.1);
  const second = tk2.build(); second.position.set(-50, 0, 20.1);
  g.add(second);
  // 特效
  g.add(FX.sparks([0, 12.8, 9.2], { count: 120, vel: [0, 4, 3], spread: [3, 3, 3] }));
  g.add(FX.fume([0, 13.5, 14], 0.8));
  g.add(FX.fume([0, 6, 19.8], 0.6));
  g.add(FX.stackSmoke([-50, 81, -58], 0.8));
  const L1 = hotLight(0xff7a2a, 380, 70, 0, 15, 14);
  g.add(L1);
  const update = (t) => {
    MAT.melt.map.offset.y = -t * 0.35;
    L1.intensity = L1.userData.base * (0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3));
  };
  return {
    group: g, update, placeholder: ph,
    slot: vec(0, 0, 20), pick: vec(0, 0, 20),
    view: { target: [0, 24, 6], dist: 150, dir: [-0.5, 0.55, 1] },
  };
}

// ============================================================
// 炼钢主厂房的公共参数（KR / 转炉 / LF / RH / 连铸 连成一体）
// z: -26 ~ 22；前侧通道 z≈12 为钢包吊运区，天车轨道 z=3 / 20.8
// ============================================================
const SHOP = { z0: -26, z1: 22, crane: { y: 24, z: [3, 20.8] }, mid: 2 };
const LIFT_Y = 18;

function midColumns(k, x0, x1, bay, skip = () => false) {
  const n = Math.round((x1 - x0) / bay);
  for (let i = 0; i <= n; i++) {
    const x = x0 + (i * (x1 - x0)) / n;
    if (skip(x)) continue;
    hcol(k, MAT.frame, x, SHOP.mid, 0, SHOP.crane.y - 1.6, 0.8);
    k.box(MAT.concrete, 1.6, 0.6, 1.6, x, 0.3, SHOP.mid);
  }
  k.box(MAT.frame, x1 - x0, 1.6, 0.7, (x0 + x1) / 2, SHOP.crane.y - 0.8, SHOP.crane.z[0]);
  k.box(MAT.rail, x1 - x0, 0.18, 0.12, (x0 + x1) / 2, SHOP.crane.y + 0.09, SHOP.crane.z[0]);
  k.box(MAT.frame, x1 - x0, 0.5, 1.6, (x0 + x1) / 2, SHOP.crane.y - 1.8, (SHOP.mid + SHOP.crane.z[0]) / 2);
}

// 钢包车轨道（嵌入地坪）
function ladleTrack(k, z0, z1, x = 0) {
  k.slab(MAT.concreteDk, x - 2.4, x + 2.4, 0, 0.12, z0, z1);
  for (const s of [-1.6, 1.6]) k.slab(MAT.rail, x + s - 0.07, x + s + 0.07, 0.12, 0.3, z0, z1);
}
function ladleCar(k, x, z) {
  k.slab(MAT.steelDark, x - 2.5, x + 2.5, 0.3, 1.2, z - 2.6, z + 2.6);
  k.slab(MAT.crane, x - 2.6, x + 2.6, 0.9, 1.2, z - 2.7, z - 2.4);
}

// ============================================================
// 铁水预处理：KR 机械搅拌脱硫站
// ============================================================
function buildKR() {
  const k = new Kit();
  const g = new THREE.Group();
  building(k, { x0: -20, x1: 20, z0: SHOP.z0, z1: SHOP.z1, h: 30, bay: 10, crane: SHOP.crane, ends: { x0: 0, x1: false }, doorZ: 18 });
  midColumns(k, -20, 20, 10, (x) => Math.abs(x) < 1);
  ladleTrack(k, -12, 16);
  ladleCar(k, 0, -6);
  // KR 站钢结构框架
  for (const x of [-7, 7]) for (const z of [-17, 0]) hcol(k, MAT.frame, x, z, 0, 33, 0.7);
  for (const y of [9, 17, 25]) {
    platform(k, -7.5, 7.5, -17.5, -10.5, y, { open: "s" });
    platform(k, -7.5, -2.5, -10.5, 0.5, y, { open: "n" });
    platform(k, 2.5, 7.5, -10.5, 0.5, y, { open: "n" });
  }
  k.slab(MAT.frame, -7.5, 7.5, 32.4, 33, -17.5, 0.5);
  stairs(k, -12, 0, -14, 9, 1.2);
  // 导轨
  for (const x of [-1.5, 1.5]) k.slab(MAT.steelDark, x - 0.25, x + 0.25, 8, 32.4, -6.3, -5.7);
  // 除尘罩 + 管道 → 布袋除尘器
  k.slab(MAT.steel, -3.2, 3.2, 5.8, 7.6, -9.2, -2.8);
  k.pipe(MAT.steel, [[0, 7.6, -8.4], [0, 12, -12], [0, 12, -34]], 0.95);
  k.slab(MAT.blueGrey, -6, 6, 6, 14, -40, -32);
  for (const x of [-3, 3]) k.cyl(MAT.blueGrey, 2.6, 0.4, 4.5, x, 3.75, -36, 4, { ry: PI / 4 });
  for (const sx of [-5.5, 5.5]) for (const sz of [-39.5, -32.5]) k.box(MAT.frame, 0.5, 6, 0.5, sx, 3, sz);
  k.pipe(MAT.steel, [[6, 10, -36], [12, 10, -36], [12, 3, -36]], 0.8);
  k.cyl(MAT.blueGrey, 1.8, 1.8, 2.4, 14, 3, -36, 20, { rx: PI / 2 });
  chimney(k, 18, -36, 28, 1.2, 1.0, { mat: MAT.steel, bands: false });
  // 脱硫剂料仓
  k.at(0, 17, 0, 0, () => { for (const x of [-4.5, 4.5]) silo(k, x, -14, 1.4, 4.5, 1.5); });
  // 扒渣机
  k.slab(MAT.crane, 6, 9, 0, 3.2, -8, -4);
  k.rod(MAT.steelDark, [7, 3.2, -6], [2.2, 5.4, -6], 0.22, 8);
  k.slab(MAT.steelDark, 1.4, 2.4, 4.6, 5.6, -7, -5);

  // 搅拌头升降机构（动画）
  const kr = new Kit();
  kr.box(MAT.crane, 3.4, 3.2, 2.4, 0, 1.6, 0);
  kr.cyl(MAT.blueGrey, 0.8, 0.8, 2.2, 0, 4.3, 0, 16);
  const impK = new Kit();
  impK.cyl(MAT.steel, 0.28, 0.28, 10, 0, -5, 0, 12);
  impK.cyl(MAT.refractory, 0.45, 0.45, 2.2, 0, -9.6, 0, 12);
  for (let i = 0; i < 4; i++) impK.box(MAT.refractory, 2.6, 1.2, 0.3, 0, -10.2, 0, { ry: (i * PI) / 4 });
  const carriage = kr.build();
  const impeller = impK.build();
  carriage.add(impeller);
  carriage.position.set(0, 24, -6);
  g.add(carriage);

  g.add(k.build());
  const pk = new Kit(); ladle(pk, 0, 1.2, -6);
  const ph = pk.build();
  g.add(ph);
  const fume = FX.fume([0, 7.6, -6], 0.4);
  g.add(fume);
  let carTarget = 24, spin = 0;
  const update = (t, dt, env) => {
    if (env.active !== "desulf") carTarget = 24, spin = 0.2;
    carriage.position.y = ease(carriage.position.y, carTarget, dt * 1.5);
    impeller.rotation.y += dt * spin * 6;
    fume.material.uniforms.uOpacity.value = carriage.position.y < 16 ? 0.4 : 0.05;
  };
  const simStep = (p) => {
    carTarget = p < 0.12 || p > 0.88 ? 24 : 12.4;
    spin = p > 0.12 && p < 0.88 ? 2.2 : 0.2;
  };
  return {
    group: g, update, simStep, placeholder: ph,
    slot: vec(0, 1.2, -6), pick: vec(0, 1.2, 12), torpedoSpot: vec(-6, 0, 20),
    view: { target: [0, 8, -4], dist: 72, dir: [-0.35, 0.8, 1] },
  };
}

// ============================================================
// 转炉：炉体倾动 + 氧枪升降 + 汽化冷却烟道 + OG 煤气回收 + 放散火炬
// ============================================================
function buildBOF() {
  const k = new Kit();
  const g = new THREE.Group();
  const CZ = -8, CY = 15;
  building(k, { x0: -30, x1: 30, z0: SHOP.z0, z1: SHOP.z1, h: 56, bay: 10, crane: SHOP.crane, ends: { x0: 33, x1: 33 }, windowsAt: [0.3, 0.62, 0.85] });
  midColumns(k, -30, 30, 10, (x) => Math.abs(x) < 1);
  ladleTrack(k, -6, 14);
  ladleCar(k, 0, -1.5);
  // 托圈支座 + 倾动装置
  for (const s of [-1, 1]) {
    k.slab(MAT.concrete, s * 9.5 - 1.6, s * 9.5 + 1.6, 0, 13.6, CZ - 2.8, CZ + 2.8);
    k.slab(MAT.steelDark, s * 9.5 - 1.3, s * 9.5 + 1.3, 13.6, 16.6, CZ - 1.6, CZ + 1.6);
  }
  k.slab(MAT.blueGrey, 11.2, 14.6, 11.6, 17.8, CZ - 2.8, CZ + 2.8);
  for (const dz of [-2, 2]) for (const dy of [12.6, 16.6]) k.cyl(MAT.blueGrey, 0.6, 0.6, 2.2, 15.7, dy, CZ + dz, 14, { rz: PI / 2 });
  // 炉前操作平台（中间留出钢包车通道/出钢口视线）
  k.slab(MAT.concrete, -28, -6, 10.6, 11.2, -2, 6);
  k.slab(MAT.concrete, 6, 28, 10.6, 11.2, -2, 6);
  for (const x of [-24, -14, 14, 24]) k.box(MAT.concrete, 1, 10.6, 1, x, 5.3, 4.5);
  railing(k, [[-28, 11.2, 6], [-6, 11.2, 6], [-6, 11.2, -2]]); railing(k, [[6, 11.2, -2], [6, 11.2, 6], [28, 11.2, 6]]);
  k.slab(MAT.steelDark, 15, 20, 11.2, 13.5, 0, 4.5, { rx: -0.3 });
  // 烟罩 + 汽化冷却烟道 → OG 洗涤塔 → 风机 → 火炬
  k.lathe(MAT.steel, [[3.6, 21.6], [3.6, 22.6], [2.3, 25.6], [2.1, 25.6]], 0, 0, CZ, 32);
  k.pipe(MAT.steel, [[0, 25.2, CZ], [0, 31, -12.5], [0, 46, -20], [0, 50, -30], [0, 50, -38], [0, 44, -42]], 1.9, { seg: 18 });
  k.cyl(MAT.silver, 2.6, 2.6, 40, 0, 20, -44, 28);
  k.cyl(MAT.silver, 1.0, 2.6, 2, 0, 41, -44, 28);
  k.pipe(MAT.steel, [[2.6, 6, -44], [18, 6, -44], [18, 6, -50]], 0.9);
  k.slab(MAT.wall, 22, 34, 0, 9, -50, -40); k.slab(MAT.roof, 21.6, 34.4, 9, 9.4, -50.4, -39.6);
  k.cyl(MAT.steel, 1.1, 1.3, 58, 18, 29, -52, 16);
  for (const y of [20, 40, 56]) k.torus(MAT.grating, 1.8, 0.5, 18, y, -52, { rs: 2, ts: 18 });
  for (const a of [0, 2.1, 4.2]) k.rod(MAT.steelDark, [18 + Math.cos(a) * 14, 0, -52 + Math.sin(a) * 14], [18, 40, -52], 0.04, 4);
  // 氧枪导轨
  for (const x of [-1.6, 1.6]) k.slab(MAT.frame, x - 0.25, x + 0.25, 27, 60, CZ - 0.25, CZ + 0.25);
  k.slab(MAT.frame, -4, 4, 59.4, 60, CZ - 2, CZ + 2);
  // 高位料仓（散状料/合金）
  k.slab(MAT.grating, -16, -3, 31.9, 32.1, -18, -6); k.slab(MAT.grating, 3, 16, 31.9, 32.1, -18, -6);
  k.at(0, 32, 0, 0, () => {
    for (const x of [-12, -7, 7, 12]) silo(k, x, -12, 1.8, 6, 1.0);
  });
  for (const x of [-7, 7]) k.rod(MAT.steel, [x, 33, -12], [Math.sign(x) * 2.4, 26, -10], 0.25, 8);
  // 渣罐车
  ladleTrack(k, -18, 0, 7);
  k.lathe(MAT.steelDark, [[0, 1.3], [1.4, 1.3], [2.1, 3.8], [2.25, 3.9]], 7, 0, -14, 24);
  k.cyl(MAT.hotDim, 2.0, 2.0, 0.08, 7, 3.6, -14, 24);
  k.slab(MAT.steelDark, 5, 9, 0.3, 1.3, -16, -12);

  // ---- 动画部件：炉体（绕 x 轴倾动）----
  const vk = new Kit();
  vk.lathe(MAT.rust, [[0, -6.2], [2.5, -6.0], [3.9, -5.3], [4.6, -4.2], [4.8, -3], [4.8, 2.0], [4.2, 3.6], [2.6, 5.8], [2.4, 6.3], [2.45, 6.6], [2.0, 6.6], [1.9, 6.2]], 0, 0, 0, 40);
  vk.lathe(MAT.steelDark, [[5.0, -1.3], [6.0, -1.3], [6.0, 1.3], [5.0, 1.3], [5.0, -1.3]], 0, 0, 0, 40);
  for (let i = 0; i < 8; i++) vk.box(MAT.steelDark, 0.4, 2.6, 1.2, Math.cos((i * PI) / 4) * 5.0, 0, Math.sin((i * PI) / 4) * 5.0, { ry: (-i * PI) / 4 });
  for (const s of [-1, 1]) vk.cyl(MAT.steel, 0.9, 0.9, 4.2, s * 7.6, 0, 0, 16, { rz: PI / 2 });
  vk.cyl(MAT.melt, 1.9, 1.9, 0.1, 0, 5.9, 0, 24);
  vk.torus(MAT.steelDark, 2.5, 0.3, 0, 6.5, 0, { ts: 32 });
  const vessel = vk.build();
  vessel.position.set(0, CY, CZ);
  g.add(vessel);
  // 氧枪（上下移动）
  const lk = new Kit();
  lk.box(MAT.crane, 3.6, 3.0, 1.6, 0, 31.5, 0);
  lk.cyl(MAT.silver, 0.18, 0.18, 30, 0, 15, 0, 10);
  lk.cyl(MAT.rubber, 0.12, 0.12, 6, 0.9, 33, 0.4, 6);
  const lance = lk.build();
  lance.position.set(0, 26, CZ);
  g.add(lance);
  // 出钢钢流
  const sk = new Kit(); sk.cyl(MAT.melt, 0.32, 0.22, 10, 0, -5, 0, 10);
  const stream = sk.build();
  stream.position.set(0, 14.6, -1.3);
  stream.visible = false;
  g.add(stream);

  g.add(k.build());
  const pk = new Kit(); ladle(pk, 0, 1.2, -1.5, { hot: false });
  const ph = pk.build();
  g.add(ph);
  // 特效：炉口火焰/烟尘/火花 + 火炬
  const flame = FX.flame([0, 22.4, CZ], 1.6, { count: 70 });
  const sparks = FX.sparks([0, 22, CZ], { count: 160, vel: [0, 8, 0], spread: [8, 5, 8] });
  const fume = FX.fume([0, 24, CZ], 0.9);
  g.add(flame, sparks, fume);
  g.add(FX.flame([18, 58.5, -52], 2.2, { count: 60, life: 1.4 }));
  const L = hotLight(0xff8a30, 0, 90, 0, 24, -2);
  g.add(L);
  g.add(hotLight(0xff8a30, 120, 40, 18, 60, -52));

  const st = { lanceY: 26, tilt: 0, blow: 0, tap: false };
  let simCtl = false;
  const update = (t, dt, env) => {
    if (env.active !== "bof") {
      simCtl = false;
      const c = t % 46;
      st.blow = c < 26 ? 1 : 0;
      st.lanceY = st.blow ? 15 : 26;
      st.tilt = 0; st.tap = false;
    }
    lance.position.y = ease(lance.position.y, st.lanceY, dt * 2.0);
    vessel.rotation.x = ease(vessel.rotation.x, st.tilt, dt * 2.4);
    const blowing = st.blow && lance.position.y < 18 && Math.abs(vessel.rotation.x) < 0.05;
    const f = blowing ? 1 : 0;
    flame.material.uniforms.uOpacity.value = ease(flame.material.uniforms.uOpacity.value, 0.9 * f, dt * 3);
    sparks.material.uniforms.uOpacity.value = f;
    fume.material.uniforms.uOpacity.value = 0.12 + 0.35 * f;
    L.intensity = (blowing ? 600 : 0) * (0.8 + 0.2 * Math.sin(t * 17));
    stream.visible = st.tap && vessel.rotation.x > 1.4;
    if (stream.visible) L.intensity = 350;
  };
  const simStep = (p) => {
    simCtl = true;
    st.blow = p > 0.06 && p < 0.62 ? 1 : 0;
    st.lanceY = p > 0.04 && p < 0.62 ? 15 : 26;
    st.tilt = p > 0.66 ? 1.66 : 0;
    st.tap = p > 0.72 && p < 0.98;
  };
  return {
    group: g, update, simStep, placeholder: ph,
    slot: vec(0, 1.2, -1.5), pick: vec(0, 1.2, 12),
    view: { target: [0, 12, -4], dist: 88, dir: [-0.3, 0.55, 1] },
  };
}

// ============================================================
// LF 钢包精炼炉
// ============================================================
function buildLF() {
  const k = new Kit();
  const g = new THREE.Group();
  const Z = -6;
  building(k, { x0: -20, x1: 20, z0: SHOP.z0, z1: SHOP.z1, h: 30, bay: 10, crane: SHOP.crane, ends: { x0: false, x1: false } });
  midColumns(k, -20, 20, 10, (x) => Math.abs(x) < 1);
  ladleTrack(k, -12, 16);
  ladleCar(k, 0, Z);
  // 电极立柱导向结构
  k.slab(MAT.frame, 5.4, 7.8, 0, 19, Z - 3.4, Z + 3.4);
  k.slab(MAT.steelDark, 5.2, 8.0, 0, 1.2, Z - 4, Z + 4);
  // 炉盖提升架
  for (const sx of [-4, 4]) k.slab(MAT.frame, sx - 0.3, sx + 0.3, 0, 13, Z + 3.6, Z + 4.2);
  k.slab(MAT.frame, -4.3, 4.3, 12.6, 13.2, Z + 3.6, Z + 4.2);
  // 变压器室
  k.slab(MAT.concrete, 10, 19, 0, 15, Z - 7, Z + 5);
  k.slab(MAT.concreteDk, 9.6, 19.4, 15, 15.6, Z - 7.4, Z + 5.4);
  k.slab(MAT.steelDark, 9.9, 10.1, 9, 13, Z - 4, Z + 2);
  // 操作平台
  k.slab(MAT.grating, -11, -3.4, 7.6, 7.8, Z - 7, Z + 5);
  for (const x of [-10.5, -4]) for (const z of [Z - 6.5, Z + 4.5]) k.box(MAT.frame, 0.4, 7.6, 0.4, x, 3.8, z);
  railing(k, [[-11, 7.8, Z - 7], [-11, 7.8, Z + 5], [-3.4, 7.8, Z + 5]]);
  stairs(k, -18, 0, Z + 3, 7.6, 1.1);
  k.slab(MAT.white, -10.5, -6.5, 7.8, 10.6, Z - 6.5, Z - 3.5);
  k.slab(MAT.glass, -6.55, -6.45, 8.6, 10.2, Z - 6.2, Z - 3.8);
  // 合金料仓
  k.at(0, 14, 0, 0, () => { for (const z of [Z - 4, Z + 0.5]) silo(k, -6, z, 1.3, 4, 1.4); });
  k.slab(MAT.grating, -9, -3, 13.9, 14.0, Z - 6, Z + 2.5);
  k.rod(MAT.steel, [-6, 15.6, Z - 1.5], [-1.6, 8.4, Z], 0.2, 8);
  // 炉盖 + 除尘弯管
  k.lathe(MAT.steel, [[3.0, 0], [2.95, 0.6], [2.2, 1.5], [1.3, 2.0], [1.0, 2.05]], 0, 5.65, Z, 32);
  k.pipe(MAT.steel, [[-2.0, 6.9, Z - 1.2], [-3.2, 9, Z - 4], [-3.2, 16, Z - 8], [-3.2, 16, -30]], 0.85);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod(MAT.steelDark, [sx * 2.4, 6.6, Z + sz * 2.0], [sx * 3.8, 12.6, Z + 3.9], 0.07, 4);

  // 电极 + 横臂（动画：升降）
  const ek = new Kit();
  const angs = [PI / 2, PI / 2 + (2 * PI) / 3, PI / 2 + (4 * PI) / 3];
  angs.forEach((a, i) => {
    const ex = Math.cos(a) * 0.95, ez = Z + Math.sin(a) * 0.95;
    ek.cyl(MAT.graphite, 0.3, 0.3, 9.6, ex, 10.4, ez, 14);
    for (const yy of [8.2, 11.8]) ek.cyl(MAT.graphite, 0.33, 0.33, 0.2, ex, yy, ez, 14);
    const ay = 13.3 + i * 0.75, mz = Z - 1.4 + i * 1.4;
    ek.box(MAT.copper, 0.55, 0.65, 0.55, ex, ay, ez);
    ek.beam(MAT.copper, [ex, ay, ez], [6.6, ay, mz], 0.6);
    ek.box(MAT.steelDark, 1.2, 4, 1.0, 6.6, ay - 1.4, mz);
    ek.pipe(MAT.rubber, [[7.1, ay, mz], [8.6, ay - 2.5, mz], [9.9, ay - 1.6, mz]], 0.16, { caps: false });
  });
  const electrodes = ek.build();
  g.add(electrodes);
  // 电弧光
  const arcMat = MAT.hotWhite.clone();
  const ak = new Kit();
  ak.cyl(arcMat, 1.4, 1.6, 0.25, 0, 5.45, Z, 20);
  const arc = ak.build();
  g.add(arc);

  g.add(k.build());
  const pk = new Kit(); ladle(pk, 0, 1.2, Z);
  const ph = pk.build();
  g.add(ph);
  const sparks = FX.sparks([0, 6, Z], { count: 60, vel: [0, 2, 0], spread: [3, 2, 3], size: 0.6 });
  g.add(sparks);
  g.add(FX.fume([-3.2, 16.5, Z - 8], 0.3));
  const L = hotLight(0xffc890, 260, 45, 0, 5.8, Z + 3.5);
  g.add(L);
  let eTarget = 0;
  const update = (t, dt, env) => {
    if (env.active !== "lf") eTarget = 0;
    electrodes.position.y = ease(electrodes.position.y, eTarget, dt * 1.5);
    const on = electrodes.position.y < 0.5;
    const fl = 0.6 + 0.4 * Math.abs(Math.sin(t * 23) * Math.sin(t * 9.7));
    L.intensity = on ? L.userData.base * fl : 0;
    arc.visible = on;
    arcMat.emissiveIntensity = 7 + 3 * fl;
    sparks.material.uniforms.uOpacity.value = on ? 1 : 0;
  };
  const simStep = (p) => { eTarget = p < 0.1 || p > 0.92 ? 3.5 : 0; };
  return {
    group: g, update, simStep, placeholder: ph,
    slot: vec(0, 1.2, Z), pick: vec(0, 1.2, 12),
    view: { target: [0, 6, Z + 2], dist: 62, dir: [-0.35, 0.8, 1] },
  };
}

// ============================================================
// RH 真空循环脱气
// ============================================================
function buildRH() {
  const k = new Kit();
  const g = new THREE.Group();
  const Z = -6;
  building(k, { x0: -20, x1: 20, z0: SHOP.z0, z1: SHOP.z1, h: 40, bay: 10, crane: SHOP.crane, ends: { x0: 33, x1: 35 } });
  midColumns(k, -20, 20, 10, (x) => Math.abs(x) < 1);
  ladleTrack(k, -12, 16);
  k.slab(MAT.steelDark, -2.6, 2.6, 0.3, 1.2, Z - 2.6, Z + 2.6);
  for (const s of [-1.6, 1.6]) k.cyl(MAT.silver, 0.25, 0.25, 1.2, s, 0.9, Z, 10);
  // 真空槽支撑钢结构
  for (const x of [-5, 5]) for (const z of [Z - 5, Z + 4]) hcol(k, MAT.frame, x, z, 0, 30, 0.7);
  for (const y of [12, 21, 29.6]) {
    platform(k, -5.5, 5.5, Z - 5.5, Z - 2.6, y, { open: "s" });
    platform(k, -5.5, -2.6, Z - 2.6, Z + 4.5, y, { open: "ne" });
    platform(k, 2.6, 5.5, Z - 2.6, Z + 4.5, y, { open: "nw" });
  }
  stairs(k, -14, 0, Z - 4, 12, 1.1);
  // 真空槽：浸渍管 + 下部槽 + 上部槽 + 热弯管
  for (const s of [-0.95, 0.95]) {
    k.cyl(MAT.refractory, 0.52, 0.52, 3.1, s, 6.55, Z, 16);
    k.cyl(MAT.steel, 0.6, 0.6, 0.4, s, 7.9, Z, 16);
  }
  k.cyl(MAT.steel, 1.9, 1.9, 4, 0, 10.1, Z, 28);
  k.cyl(MAT.steel, 2.3, 2.3, 9, 0, 16.6, Z, 28);
  k.cyl(MAT.steel, 1.2, 2.3, 2, 0, 22.1, Z, 28);
  for (const y of [9, 12.6, 15, 18, 21]) k.torus(MAT.steelDark, y > 12 ? 2.34 : 1.94, 0.1, 0, y, Z, { ts: 28, rs: 5 });
  k.pipe(MAT.steel, [[0, 23, Z], [0, 25, Z], [6, 25, Z], [11, 25, Z]], 1.0);
  // 合金料仓
  k.at(0, 29.6, 0, 0, () => { for (const x of [-3, 3]) silo(k, x, Z - 3.5, 1.1, 3, 1.0); });
  // 多级蒸汽喷射真空泵系统
  for (const x of [9, 19]) for (const z of [Z - 8, Z + 4]) k.box(MAT.frame, 0.5, 20, 0.5, x, 10, z);
  k.slab(MAT.grating, 8.6, 19.4, 19.8, 20, Z - 8.4, Z + 4.4);
  railing(k, [[8.6, 20, Z - 8.4], [19.4, 20, Z - 8.4], [19.4, 20, Z + 4.4], [8.6, 20, Z + 4.4]]);
  for (const x of [11.5, 16.5]) k.cyl(MAT.silver, 1.5, 1.5, 7, x, 23.5, Z - 5.5, 20);
  k.cyl(MAT.steel, 1.0, 1.0, 9, 15.5, 25, Z, 18, { rz: PI / 2 });
  for (const [z, r] of [[Z + 2.4, 0.6], [Z - 2.6, 0.45]]) {
    k.cyl(MAT.steel, r, r, 8, 15, 25.6, z, 14, { rz: PI / 2 });
    k.cyl(MAT.steel, r * 1.6, r, 1.6, 10.2, 25.6, z, 14, { rz: PI / 2 });
  }
  for (const x of [11.5, 16.5]) k.rod(MAT.steel, [x, 20, Z - 5.5], [x, 1.5, Z - 5.5], 0.25, 8);
  k.slab(MAT.concrete, 9, 19, 0, 1.8, Z - 8, Z - 3.5);
  k.pipe(MAT.steel, [[18.6, 25.6, Z + 2.4], [18.6, 25.6, Z + 6], [18.6, 44, Z + 6]], 0.5);

  g.add(k.build());
  const pk = new Kit(); ladle(pk, 0, 0, 0);
  const ph = pk.build();
  ph.position.set(0, 2.8, Z);
  g.add(ph);
  const steam = FX.steam([18.6, 44.5, Z + 6], 0.5, { count: 50, life: 6, opacity: 0.4 });
  g.add(steam);
  const sparks = FX.sparks([0, 7, Z], { count: 30, vel: [0, 2, 0], spread: [2, 1, 2], size: 0.5 });
  g.add(sparks);
  const update = (t, dt, env) => {
    steam.material.uniforms.uOpacity.value = env.active === "rh" ? 0.6 : 0.3;
  };
  const simStep = (p, token) => {
    token.position.y = ease(token.position.y, p > 0.08 && p < 0.92 ? g.position.y + 2.8 : 1.2, 0.08);
  };
  return {
    group: g, update, simStep, placeholder: ph,
    slot: vec(0, 1.2, Z), pick: vec(0, 1.2, 12),
    view: { target: [3, 11, Z + 2], dist: 72, dir: [-0.35, 0.7, 1] },
  };
}

// ============================================================
// 板坯连铸机（双流弧形）：回转台 + 中间包 + 结晶器 + 扇形段 + 火焰切割
// ============================================================
function buildCCM() {
  const k = new Kit();
  const g = new THREE.Group();
  const TX = -26, TZ = 2, R = 9.8, MY = 11.0, PASS = 1.2;
  const strands = [-7.5, -1.5];
  building(k, { x0: -45, x1: 45, z0: SHOP.z0, z1: SHOP.z1, h: 32, bay: 15, crane: SHOP.crane, ends: { x0: false, x1: 0 }, doorZ: -4.5 });
  midColumns(k, -45, 45, 15, (x) => x > -34 && x < -18);
  // 回转台底座
  k.slab(MAT.concrete, TX - 2.6, TX + 2.6, 0, 8, TZ - 2.5, TZ + 2.5);
  k.cyl(MAT.blueGrey, 1.7, 2.0, 6, TX, 11, TZ, 24);
  // 浇注平台（围绕结晶器开口）
  k.slab(MAT.concrete, -42, TX - 1.6, 12.0, 12.4, -14, 10);
  k.slab(MAT.concrete, TX + 1.6, -6, 12.0, 12.4, -14, 10);
  k.slab(MAT.concrete, TX - 1.6, TX + 1.6, 12.0, 12.4, -14, -9);
  k.slab(MAT.concrete, TX - 1.6, TX + 1.6, 12.0, 12.4, 0.2, 10);
  for (const x of [-40, -32, -18, -10]) for (const z of [-12, 8]) k.box(MAT.concrete, 1, 12, 1, x, 6, z);
  railing(k, [[-6, 12.4, -14], [-6, 12.4, 10]]);
  // 中间包车 + 中间包
  for (const s of [-2.3, 2.3]) k.slab(MAT.rail, TX + s - 0.08, TX + s + 0.08, 12.4, 12.6, -14, 10);
  k.slab(MAT.crane, TX - 2.8, TX + 2.8, 12.6, 13.0, -11, 2);
  k.slab(MAT.steelDark, TX - 1.7, TX + 1.7, 13.0, 14.4, -10.2, 1.2);
  k.slab(MAT.steel, TX - 1.85, TX + 1.85, 14.4, 14.6, -10.4, 1.4);
  k.rod(MAT.refractory, [TX, 14.8, -4.5], [TX, 14.4, -4.5], 0.18, 10);
  // 二冷室外壳（剖切图层）
  k.slab(MAT.wall, TX - 1.8, TX + 12, 0, 10.8, 1.4, 1.6, { layer: "clad" });
  k.slab(MAT.wall, TX - 1.8, TX + 12, 0, 10.8, -10.6, -10.4, { layer: "clad" });
  k.slab(MAT.wall, TX - 1.8, TX + 12, 10.6, 10.8, -10.4, 1.4, { layer: "clad" });
  k.pipe(MAT.steel, [[TX + 6, 10.8, -4.5], [TX + 6, 40, -4.5]], 1.1);
  for (const zs of strands) {
    // 结晶器 + 振动台
    k.slab(MAT.copper, TX - 0.7, TX + 0.7, MY, 12.4, zs - 1.1, zs + 1.1);
    k.slab(MAT.steelDark, TX - 1.2, TX + 1.2, MY - 1.2, MY, zs - 1.4, zs + 1.4);
    k.rod(MAT.refractory, [TX, 13.0, zs], [TX, 12.0, zs], 0.12, 8);
    // 铸流路径：竖直段 → 弧形段 → 水平段
    const pts = [vec(TX, 12.4, zs), vec(TX, MY, zs)];
    for (let i = 1; i <= 40; i++) {
      const a = PI + (i / 40) * (PI / 2);
      pts.push(vec(TX + R + Math.cos(a) * R, MY + Math.sin(a) * R, zs));
    }
    pts.push(vec(12, PASS, zs));
    k.geo(MAT.strand, sweepRect(pts, 1.6, 0.25));
    // 夹辊 + 扇形段框架
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const at = (s) => {
      let i = 1; while (i < pts.length - 1 && lens[i] < s) i++;
      const t = (s - lens[i - 1]) / (lens[i] - lens[i - 1]);
      const p = pts[i - 1].clone().lerp(pts[i], t);
      const T = pts[i].clone().sub(pts[i - 1]).normalize();
      return { p, T, N: vec(-T.y, T.x, 0) };
    };
    const total = lens[lens.length - 1];
    for (let s = 1.6; s < total; s += 0.42) {
      const { p, N } = at(s);
      for (const sg2 of [-1, 1]) {
        const c = p.clone().addScaledVector(N, sg2 * 0.28);
        k.cyl(MAT.steel, 0.14, 0.14, 2.1, c.x, c.y, zs, 8, { rx: PI / 2 });
      }
    }
    for (let s = 2.2; s < total - 1; s += 2.2) {
      const { p, T, N } = at(s);
      const ang = Math.atan2(T.y, T.x);
      for (const sz of [-1.25, 1.25]) k.box(MAT.steelDark, 2.0, 1.5, 0.22, p.x, p.y, zs + sz, { rz: ang });
      for (const sn of [-0.75, 0.75]) {
        const c = p.clone().addScaledVector(N, sn);
        k.box(MAT.frame, 0.5, 0.3, 2.9, c.x, c.y, zs, { rz: ang });
      }
      if (p.y < 3) k.cyl(MAT.blueGrey, 0.35, 0.35, 1.0, p.x, p.y + 1.2, zs + 1.9, 10, { rx: PI / 2 });
    }
    // 输出辊道
    for (let x = 13; x <= 44; x += 1.25) k.cyl(MAT.steel, 0.14, 0.14, 2.1, x, PASS - 0.27, zs, 8, { rx: PI / 2 });
    k.slab(MAT.frame, 12, 45, 0.2, PASS - 0.4, zs - 1.15, zs - 0.95);
    k.slab(MAT.frame, 12, 45, 0.2, PASS - 0.4, zs + 0.95, zs + 1.15);
  }
  // 火焰切割机
  k.slab(MAT.crane, 10.4, 13.6, 3.2, 3.8, -10.2, 1.2);
  for (const z of [-10, 1]) k.slab(MAT.crane, 10.6, 13.4, 0, 3.2, z - 0.3, z + 0.3);
  for (const zs of strands) for (const dz of [-0.6, 0.6]) k.rod(MAT.steelDark, [12, 3.2, zs + dz], [12, 1.6, zs + dz], 0.06, 6);
  // 已切定尺板坯
  k.slab(MAT.hotDim, 18, 28, PASS - 0.125, PASS + 0.125, strands[0] - 0.8, strands[0] + 0.8);
  k.slab(MAT.hotDim, 30, 40, PASS - 0.125, PASS + 0.125, strands[1] - 0.8, strands[1] + 0.8);
  // 板坯库
  for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) k.slab(MAT.slabCold, 18 + i * 6.2 - 0.1, 18 + i * 6.2 + 5.8 - 0.1, j * 0.26, j * 0.26 + 0.24, 8 + (i % 2) * 0.2, 9.8 + (i % 2) * 0.2);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) k.slab(MAT.slabCold, 18 + i * 9, 27 + i * 9, j * 0.26, j * 0.26 + 0.24, 12.4, 14.2);
  // 回转台（动画）
  const tk = new Kit();
  tk.cyl(MAT.blueGrey, 2.2, 2.2, 1.6, 0, 0, 0, 28);
  tk.box(MAT.blueGrey, 1.8, 1.2, 15.2, 0, 0.3, 0);
  for (const s of [-1, 1]) {
    tk.box(MAT.blueGrey, 5.4, 0.7, 2.6, 0, 0.6, s * 6.5);
    for (const sx of [-2.4, 2.4]) tk.box(MAT.steelDark, 0.5, 1.6, 1.2, sx, 1.4, s * 6.5);
  }
  ladle(tk, 0, 0.8, -6.5);
  const turret = tk.build();
  turret.position.set(TX, 14.0, TZ);
  g.add(turret);

  g.add(k.build());
  // 特效：二冷蒸汽、切割火花
  g.add(FX.steam([TX + 6, 41, -4.5], 0.7, { count: 60, life: 8, opacity: 0.45 }));
  g.add(FX.steam([TX + 7, 3, -4.5], 0.3, { count: 40, life: 3, opacity: 0.25, area: [3, 0.5, 4] }));
  for (const zs of strands) g.add(FX.sparks([12, 1.3, zs], { count: 50, vel: [0, -1, 0], spread: [2.5, 2, 1.2], size: 0.55, life: 0.9 }));
  g.add(hotLight(0xff7a30, 160, 40, TX + 6, 3, -4.5));
  let turretTarget = 0;
  const update = (t, dt, env) => {
    if (env.active !== "ccm") turretTarget = 0;
    turret.rotation.y = env.active === "ccm" ? ease(turret.rotation.y, turretTarget, dt * 1.6) : turretTarget;
  };
  const simStep = (p, token) => {
    turretTarget = p > 0.04 ? PI : 0;
    const a = turret.rotation.y;
    token.position.set(g.position.x + TX + Math.sin(a) * 6.5, 14.8, g.position.z + TZ + Math.cos(a) * 6.5);
  };
  return {
    group: g, update, simStep,
    slot: vec(TX, 14.8, TZ + 6.5), pick: vec(TX, 14.8, TZ + 6.5),
    exit: vec(14, PASS, strands[1]),
    view: { target: [-12, 6, -4], dist: 70, dir: [-0.2, 0.42, 1] },
  };
}

// ============================================================
// 热轧厂：加热炉 + 除鳞 + 粗轧 R1/R2 + 飞剪 + 精轧 F1~F7 + 层流冷却 + 卷取 + 钢卷库
// ============================================================
function millStand(k, x, H, wr, bur, zs = 3.4, drive = true) {
  const PASS = 1.2;
  for (const s of [-1, 1]) {
    const z = s * zs;
    for (const dx of [-1.35, 1.35]) k.slab(MAT.blueGrey, x + dx - 0.45, x + dx + 0.45, 0, H, z - 0.7, z + 0.7);
    k.slab(MAT.blueGrey, x - 1.8, x + 1.8, H, H + 1.3, z - 0.75, z + 0.75);
    k.slab(MAT.steelDark, x - 0.9, x + 0.9, PASS + 0.1, PASS + 2 * wr + 2 * bur + 0.5, z - 0.6, z + 0.6);
    k.slab(MAT.steelDark, x - 1.1, x + 1.1, H + 1.3, H + 2.3, z - 1.0, z + 1.0);
    k.cyl(MAT.blueGrey, 0.6, 0.6, 1.2, x, H + 2.9, z, 12);
  }
  k.slab(MAT.blueGrey, x - 1.8, x + 1.8, H + 0.4, H + 1.0, -zs, zs);
  const yW = PASS + 0.06 + wr, yB = yW + wr + bur;
  k.cyl(MAT.steel, wr, wr, 2 * zs, x, yW, 0, 18, { rx: PI / 2 });
  k.cyl(MAT.steel, bur, bur, 2 * zs - 0.6, x, yB, 0, 22, { rx: PI / 2 });
  k.cyl(MAT.steel, wr, wr, 2 * zs, x, PASS - 0.06 - wr, 0, 18, { rx: PI / 2 });
  if (drive) {
    for (const y of [yW, PASS - 0.06 - wr]) k.rod(MAT.steel, [x, y, -zs], [x, y, -13.5], 0.22, 10);
    k.slab(MAT.blueGrey, x - 1.4, x + 1.4, 0, 4.2, -15.5, -13.5);
    k.cyl(MAT.blueGrey, 1.7, 1.7, 4.4, x, 2.3, -18.2, 24, { rx: PI / 2 });
    k.slab(MAT.concrete, x - 2, x + 2, 0, 0.6, -21, -15.5);
  }
}

function furnace(k, xa, xb, zc, W = 13) {
  k.slab(MAT.concrete, xa - 1, xb + 1, 0, 1, zc - W / 2 - 1, zc + W / 2 + 1);
  k.slab(MAT.steelDark, xa, xb, 1, 8.2, zc - W / 2, zc + W / 2);
  k.slab(MAT.refractory, xa - 0.2, xb + 0.2, 8.2, 8.8, zc - W / 2 - 0.2, zc + W / 2 + 0.2);
  for (let x = xa; x <= xb; x += 2) for (const s of [-1, 1]) k.slab(MAT.frame, x - 0.15, x + 0.15, 1, 9.2, zc + s * (W / 2) - 0.2, zc + s * (W / 2) + 0.2);
  for (let x = xa + 3; x < xb - 2; x += 4) for (const s of [-1, 1]) for (const y of [3, 6]) {
    k.cyl(MAT.steel, 0.32, 0.32, 1.2, x, y, zc + s * (W / 2 + 0.6), 10, { rx: PI / 2 });
    k.rod(MAT.steel, [x, y + 0.3, zc + s * (W / 2 + 1.0)], [x, 7.4, zc + s * (W / 2 + 1.0)], 0.12, 6);
  }
  for (const s of [-1, 1]) k.cyl(MAT.silver, 0.35, 0.35, xb - xa, (xa + xb) / 2, 7.4, zc + s * (W / 2 + 1.0), 12, { rz: PI / 2 });
  for (const dz of [-2.5, 2.5]) k.cyl(MAT.silver, 0.7, 0.7, xb - xa - 4, (xa + xb) / 2 + 2, 9.6, zc + dz, 16, { rz: PI / 2 });
  k.slab(MAT.steel, xa - 0.5, xa + 7, 8.8, 14, zc - W / 2 + 1, zc + W / 2 - 1);
  k.slab(MAT.steelDark, xa - 0.4, xa, 1, 3.4, zc - 2.2, zc + 2.2);
  k.slab(MAT.steelDark, xb, xb + 0.4, 2.2, 4.4, zc - 2.2, zc + 2.2);
  k.slab(MAT.hot, xb + 0.38, xb + 0.42, 1.2, 2.2, zc - 1.8, zc + 1.8);
}

function buildHSM() {
  const k = new Kit();
  const g = new THREE.Group();
  const PASS = 1.2;
  // 厂房：加热炉跨 / 主轧跨 / 主电室 / 钢卷库
  building(k, { x0: -134, x1: -76, z0: -30, z1: 14, h: 22, bay: 11.6, crane: { y: 17, z: [-28.8, 12.8] }, ends: { x0: 0, x1: false }, doorZ: 0 });
  building(k, { x0: -76, x1: 128, z0: -12, z1: 14, h: 24, bay: 12, crane: { y: 19, z: [-10.8, 12.8] }, ends: { x0: false, x1: 0 }, backWall: false, windowsAt: [0.5] });
  building(k, { x0: -76, x1: 60, z0: -28, z1: -13, h: 14, bay: 12, monitor: false, ends: { x0: 0, x1: 0 }, windowsAt: [0.6] });
  k.slab(MAT.wall, 60, 128, 1.2, 25.8, -12.56, -12.44);
  building(k, { x0: 98, x1: 134, z0: 15, z1: 46, h: 18, bay: 12, crane: { y: 14, z: [16.2, 44.8] }, ends: { x0: 0, x1: 0 } });
  // 加热炉 ×2
  furnace(k, -122, -80, 0);
  furnace(k, -122, -80, -17);
  chimney(k, -128, -20, 58, 2.6, 1.9);
  k.pipe(MAT.steel, [[-121, 14, -1], [-126, 14, -6], [-128, 14, -16]], 1.2);
  // 装钢辊道
  for (let x = -133; x <= -123; x += 1.2) k.cyl(MAT.steel, 0.22, 0.22, 2.6, x, PASS - 0.37, 0, 10, { rx: PI / 2 });
  // 出钢辊道 + 除鳞箱
  const table = (xa, xb, step) => {
    for (let x = xa; x <= xb; x += step) k.cyl(MAT.steel, 0.24, 0.24, 2.6, x, PASS - 0.38, 0, 10, { rx: PI / 2 });
    for (const s of [-1, 1]) k.slab(MAT.frame, xa, xb, 0, PASS - 0.5, s * 1.5 - 0.15, s * 1.5 + 0.15);
  };
  table(-79, -64, 1.3);
  k.slab(MAT.steelDark, -75, -71.5, 0.4, 4.2, -2.2, 2.2);
  k.cyl(MAT.green, 0.3, 0.3, 6, -73.2, 4.6, 0, 10, { rx: PI / 2 });
  // 立辊轧机 E1 + 粗轧机 R1、R2
  k.slab(MAT.blueGrey, -63.5, -61, 0, 6.5, -3.4, -2.2); k.slab(MAT.blueGrey, -63.5, -61, 0, 6.5, 2.2, 3.4);
  for (const s of [-1, 1]) k.cyl(MAT.steel, 0.5, 0.5, 2.4, -62.2, 1.6, s * 1.4, 14);
  millStand(k, -56, 12, 0.6, 0.9);
  table(-53, -45, 1.3);
  millStand(k, -42, 12, 0.6, 0.9);
  table(-39, 4, 1.5);
  // 飞剪
  k.slab(MAT.blueGrey, 4.5, 8.5, 0, 6, -3, 3);
  table(9, 13, 1.2);
  // 精轧机组 F1~F7 + 活套
  for (let i = 0; i < 7; i++) {
    const x = 16 + i * 6;
    millStand(k, x, 9, 0.36, 0.72, 2.9);
    if (i < 6) k.slab(MAT.steelDark, x + 2.4, x + 3.6, 0.5, PASS - 0.05, -1, 1);
  }
  // 输出辊道 + 层流冷却
  table(56, 114, 0.9);
  for (let x = 60; x <= 100; x += 1.6) {
    k.rod(MAT.green, [x, 2.6, -1.4], [x, 2.6, 1.4], 0.08, 6);
    for (const s of [-1, 1]) k.rod(MAT.green, [x, 2.6, s * 1.4], [x, 4.8, s * 1.6], 0.07, 5);
  }
  for (const s of [-1, 1]) k.cyl(MAT.green, 0.55, 0.55, 42, 80, 5.0, s * 1.7, 16, { rz: PI / 2 });
  for (let x = 62; x <= 98; x += 12) for (const s of [-1, 1]) k.box(MAT.frame, 0.4, 5.4, 0.4, x, 2.7, s * 2.4);
  // 卷取机
  k.slab(MAT.blueGrey, 113, 116, 0, 4, -2.5, 2.5);
  k.slab(MAT.blueGrey, 116.5, 121.5, 0, 4.4, -5.6, -1.6);
  k.slab(MAT.concreteDk, 115, 123, 0, 0.1, -1.6, 3);
  // 钢卷运输链 + 钢卷库
  for (let z = 3; z <= 40; z += 4.5) coilShape(k, 118.5, 1.0, z, { axis: "z" });
  k.slab(MAT.frame, 117, 120, 0, 0.2, 2, 42);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) {
    coilShape(k, 104 + i * 2.6 + (j % 2) * 0.0, 1.0, 18 + j * 3.6, { axis: "x", w: 1.5 });
    if (i < 3 && j % 2 === 0) coilShape(k, 105.3 + i * 2.6, 2.65, 18 + j * 3.6, { axis: "x", w: 1.5 });
  }
  for (let j = 0; j < 7; j++) coilShape(k, 126 + (j % 2) * 3, 1.0, 18 + j * 3.6, { axis: "x", w: 1.5 });

  // 红热中间坯 / 带钢（常态生产画面）
  const bar = new Kit();
  bar.slab(MAT.hot, -36, 2, PASS - 0.03, PASS + 0.05, -0.8, 0.8);
  bar.box(MAT.strip, 104, 0.05, 1.5, 66, PASS, 0);
  const barG = bar.build();
  g.add(barG);
  // 卷取中的钢卷（旋转）
  const ck = new Kit();
  coilShape(ck, 0, 0, 0, { axis: "z", r: 0.9 });
  const coil = ck.build();
  coil.position.set(119, 1.5, -0.2);
  g.add(coil);

  g.add(k.build());
  g.add(FX.steam([80, 3, 0], 1.0, { count: 120, life: 4, opacity: 0.3, area: [20, 0.2, 1] }));
  g.add(FX.water([80, 2.5, 0], [20, 0, 1.2]));
  g.add(FX.steam([-73.2, 4, 0], 0.4, { count: 40, life: 2.5, opacity: 0.35 }));
  g.add(FX.stackSmoke([-128, 59, -20], 0.8));
  g.add(hotLight(0xff6a20, 180, 45, -70, 4, 3));
  g.add(hotLight(0xff6a20, 140, 40, -20, 4, 3));
  g.add(hotLight(0xff6a20, 120, 40, 30, 4, 3));

  const update = (t, dt) => { coil.rotation.z = -t * 3; };
  const simStep = (p, token) => {
    // 板坯：进炉加热 → 出炉粗轧（变长变薄）→ 精轧 → 层流冷却 → 卷取
    const X0 = g.position.x;
    let x, sx = 1, sy = 1;
    if (p < 0.3) x = -128 + (-82 + 128) * sstep(p, 0, 0.3);
    else if (p < 0.5) { const u = sstep(p, 0.3, 0.5); x = -78 + (-20 + 78) * u; sx = 1 + u * 2.5; sy = 1 - u * 0.6; }
    else if (p < 0.7) { const u = sstep(p, 0.5, 0.7); x = -20 + (60 + 20) * u; sx = 3.5 + u * 3; sy = 0.4 - u * 0.3; }
    else if (p < 0.9) { const u = sstep(p, 0.7, 0.9); x = 60 + (112 - 60) * u; sx = 6.5; sy = 0.1; }
    else { x = 118.5; sx = 6.5; sy = 0.1; }
    token.position.set(X0 + x, PASS, g.position.z);
    token.userData.stretch = [sx, sy];
  };
  return {
    group: g, update, simStep,
    slot: vec(-128, PASS, 0), pick: vec(-128, PASS, 0), coilAt: vec(118.5, 1.0, 6),
    view: { target: [-15, 3, 0], dist: 165, dir: [-0.25, 0.7, 1] },
  };
}

// ============================================================
// 装配
// ============================================================
export const LAYOUT = [
  { id: "rawyard", build: buildRawyard, x: -650, z: 0, labelY: 30 },
  { id: "coking",  build: buildCoking,  x: -470, z: -110, labelY: 54 },
  { id: "sinter",  build: buildSinter,  x: -490, z: 140, labelY: 40 },
  { id: "bf",      build: buildBF,      x: -170, z: 0, labelY: 78 },
  { id: "desulf",  build: buildKR,      x: -40, z: 0, labelY: 40 },
  { id: "bof",     build: buildBOF,     x: 10, z: 0, labelY: 66 },
  { id: "lf",      build: buildLF,      x: 60, z: 0, labelY: 40 },
  { id: "rh",      build: buildRH,      x: 100, z: 0, labelY: 50 },
  { id: "ccm",     build: buildCCM,     x: 165, z: 0, labelY: 42 },
  { id: "hsm",     build: buildHSM,     x: 345, z: 0, labelY: 34 },
];

export function buildPlant(scene) {
  const facilities = new Map();
  for (const item of LAYOUT) {
    const f = item.build();
    const { group } = f;
    group.position.set(item.x, 0, item.z);
    group.traverse((o) => { o.userData.facilityId = item.id; });
    // 剖切外壳网格
    f.clad = [];
    group.traverse((o) => { if (o.isMesh && o.userData.layer === "clad") f.clad.push(o); });
    const P = (v) => v && v.clone().add(group.position);
    f.slotW = P(f.slot); f.pickW = P(f.pick);
    f.torpedoW = P(f.torpedoSpot); f.exitW = P(f.exit); f.coilW = P(f.coilAt);
    const vt = f.view?.target || [0, 5, 0];
    f.focus = new THREE.Vector3(item.x + vt[0], vt[1], item.z + vt[2]);
    f.labelPos = new THREE.Vector3(item.x, item.labelY, item.z);
    f.id = item.id;
    scene.add(group);
    facilities.set(item.id, f);
  }
  // 炼钢主厂房钢包天车（模拟时吊运钢包）
  const crane = makeCrane(SHOP.crane.z[0], SHOP.crane.z[1], SHOP.crane.y);
  crane.group.position.x = 30;
  crane.trolley.position.z = 12;
  setHook(crane, LIFT_Y + 6.4);
  scene.add(crane.group);
  return { facilities, crane, LIFT_Y };
}

// 模拟移动物：鱼雷罐 / 钢包 / 板坯 / 钢卷
export function buildToken() {
  const g = new THREE.Group();
  const mk = (fn, name) => { const k = new Kit(); fn(k); const m = k.build(); m.name = name; m.visible = false; g.add(m); return m; };
  mk((k) => torpedo(k), "torpedo");
  mk((k) => ladle(k), "ladle");
  const slabMat = MAT.strand.clone();
  slabMat.emissiveMap = null;
  slabMat.emissive = new THREE.Color(0xff5a10);
  const sk = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 1.6), slabMat);
  sk.castShadow = true;
  sk.name = "slab"; sk.visible = false;
  g.add(sk);
  mk((k) => coilShape(k, 0, 1.0, 0, { axis: "z" }), "coil");
  const light = new THREE.PointLight(0xff6a1a, 200, 40, 2);
  light.position.y = 6;
  light.name = "glow";
  g.add(light);
  g.visible = false;
  return g;
}
