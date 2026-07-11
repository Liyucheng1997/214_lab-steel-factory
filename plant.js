// ============================================================
// 厂区 3D 建模：每个工序一个 buildXxx() 函数，返回 THREE.Group
// buildPlant(scene) 装配整个厂区，返回 { facilities, waypoints }
//   facilities: Map<id, { group, focus(Vector3), labelY }>
// ============================================================
import * as THREE from "three";

// ---------- 材质库 ----------
const M = {
  steel:  new THREE.MeshStandardMaterial({ color: 0x8d99a6, roughness: 0.55, metalness: 0.6 }),
  steelD: new THREE.MeshStandardMaterial({ color: 0x5c6773, roughness: 0.6, metalness: 0.55 }),
  rust:   new THREE.MeshStandardMaterial({ color: 0x9a5b3c, roughness: 0.85, metalness: 0.25 }),
  brick:  new THREE.MeshStandardMaterial({ color: 0x7a4a3a, roughness: 0.95 }),
  shed:   new THREE.MeshStandardMaterial({ color: 0x4f6d8c, roughness: 0.7, metalness: 0.3 }),
  shedRoof: new THREE.MeshStandardMaterial({ color: 0x3b5268, roughness: 0.7, metalness: 0.3 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 0.95 }),
  ore:    new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 1.0 }),
  coal:   new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 1.0 }),
  lime:   new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 1.0 }),
  hot:    new THREE.MeshStandardMaterial({ color: 0xff6d00, emissive: 0xff4400, emissiveIntensity: 1.6, roughness: 0.4 }),
  hotDim: new THREE.MeshStandardMaterial({ color: 0xb33c00, emissive: 0x992200, emissiveIntensity: 0.7, roughness: 0.5 }),
  slabHot:new THREE.MeshStandardMaterial({ color: 0xcc3300, emissive: 0xbb2200, emissiveIntensity: 1.1, roughness: 0.6 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.4, metalness: 0.8 }),
  graphite: new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.5, metalness: 0.3 }),
};

// ---------- 小工具 ----------
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const cyl = (rt, rb, h, mat, x, y, z, seg = 24) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
const cone = (r, h, mat, x, y, z) => mesh(new THREE.ConeGeometry(r, h, 24), mat, x, y, z);

// 中文标牌（canvas 贴图 sprite）
export function makeLabel(text, color = "#ffffff") {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 112;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#10141bcc";
  ctx.beginPath(); ctx.roundRect(4, 4, 504, 104, 22); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "bold 52px 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 60);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(11, 2.4, 1);
  return sp;
}

// 龙门架（原料场/脱硫站通用）
function gantry(w, h, mat = M.steelD) {
  const g = new THREE.Group();
  g.add(box(0.5, h, 0.5, mat, -w / 2, h / 2, 0));
  g.add(box(0.5, h, 0.5, mat, w / 2, h / 2, 0));
  g.add(box(w + 1, 0.6, 0.8, mat, 0, h, 0));
  return g;
}

// 厂房（带人字顶）
function shed(w, h, d, x = 0, z = 0) {
  const g = new THREE.Group();
  g.add(box(w, h, d, M.shed, x, h / 2, z));
  const roof = mesh(new THREE.CylinderGeometry(d * 0.58, d * 0.58, w, 3), M.shedRoof, x, h, z);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.scale.y = 0.5;
  g.add(roof);
  return g;
}

// ---------- 各工序建模 ----------

function buildRawyard() {
  const g = new THREE.Group();
  g.add(cone(4.5, 4, M.ore, -6, 2, 0));
  g.add(cone(3.8, 3.4, M.coal, 2, 1.7, -3));
  g.add(cone(3, 2.6, M.lime, 7.5, 1.3, 2));
  const gt = gantry(20, 7);
  gt.position.set(0, 0, 0);
  g.add(gt);
  // 皮带走廊通向下游
  const belt = box(14, 0.5, 1.4, M.steelD, 14, 3.2, 0);
  belt.rotation.z = -0.12;
  g.add(belt);
  return g;
}

function buildCoking() {
  const g = new THREE.Group();
  g.add(box(13, 5, 6, M.brick, 0, 2.5, 0));
  for (let i = 0; i < 4; i++) g.add(cyl(0.55, 0.7, 9, M.brick, -4.5 + i * 3, 7.2, -1.5));
  g.add(box(3, 8, 3, M.steelD, 8.5, 4, 0)); // 干熄焦塔
  g.add(box(2.2, 2.2, 5, M.steel, 8.5, 9, 0));
  return g;
}

function buildSinter() {
  const g = new THREE.Group();
  g.add(shed(16, 5, 7));
  const conv = box(12, 0.5, 1.6, M.steelD, -8, 3.6, 0);
  conv.rotation.z = 0.32;
  g.add(conv);
  g.add(cyl(2.2, 2.2, 7, M.steel, 9, 3.5, -3)); // 环冷机塔
  return g;
}

function buildBF() {
  const g = new THREE.Group();
  // 炉体：炉缸-炉腹-炉身-炉喉
  g.add(cyl(3.2, 3.6, 5, M.rust, 0, 2.5, 0));
  g.add(cyl(4.2, 3.2, 4, M.rust, 0, 7, 0));
  g.add(cyl(2.6, 4.2, 7, M.rust, 0, 12.5, 0));
  g.add(cyl(1.6, 2.6, 2.5, M.steelD, 0, 17.2, 0));
  g.add(cyl(1.7, 1.7, 0.8, M.steel, 0, 18.8, 0)); // 炉顶装料
  // 风口带发光环
  g.add(mesh(new THREE.TorusGeometry(3.5, 0.28, 10, 32), M.hot, 0, 4.8, 0)).children;
  g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  // 出铁口火光
  g.add(box(4, 2.2, 5, M.concrete, 4.5, 1.1, 0)); // 出铁场
  g.add(box(2.6, 0.4, 1.2, M.hot, 5.2, 2.35, 0)); // 铁水沟
  // 三座热风炉
  for (let i = 0; i < 3; i++) {
    const s = cyl(1.7, 1.7, 9, M.steel, -6.5, 4.5, -5 + i * 5);
    g.add(s);
    g.add(mesh(new THREE.SphereGeometry(1.7, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.steel, -6.5, 9, -5 + i * 5));
  }
  // 热风总管
  const duct = cyl(0.7, 0.7, 7, M.steelD, -3.2, 6, 0);
  duct.rotation.z = Math.PI / 2 - 0.35;
  g.add(duct);
  // 上料斜桥
  const bridge = box(16, 0.7, 2, M.steelD, -8, 9, 5.5);
  bridge.rotation.z = 0.62;
  bridge.position.set(-6, 9.5, 5.5);
  g.add(bridge);
  return g;
}

function buildDesulf() {
  const g = new THREE.Group();
  g.add(gantry(8, 8));
  g.add(cyl(0.35, 0.35, 5, M.steel, 0, 5.5, 0));       // 搅拌杆
  g.add(cyl(1.9, 1.5, 2.8, M.steelD, 0, 1.4, 0));      // 铁水罐
  g.add(cyl(1.6, 1.6, 0.3, M.hotDim, 0, 2.85, 0));     // 罐内铁水
  return g;
}

function buildBOF() {
  const g = new THREE.Group();
  // 炉架
  g.add(box(1.4, 6, 1.4, M.steelD, -3.4, 3, 0));
  g.add(box(1.4, 6, 1.4, M.steelD, 3.4, 3, 0));
  g.add(box(8.5, 0.8, 1.6, M.steelD, 0, 6.2, 0));
  // 梨形转炉：球体 + 锥形炉口
  const body = mesh(new THREE.SphereGeometry(2.6, 24, 18), M.rust, 0, 4.6, 0);
  body.scale.y = 1.15;
  g.add(body);
  g.add(cyl(1.1, 2, 2.2, M.rust, 0, 7.6, 0));
  g.add(cyl(1.05, 1.05, 0.25, M.hot, 0, 8.7, 0)); // 炉口火光
  // 氧枪
  g.add(cyl(0.22, 0.22, 7, M.steel, 0, 12.2, 0));
  g.add(box(3, 1.2, 2, M.steelD, 0, 16, 0)); // 氧枪卷扬
  // 烟罩
  g.add(cyl(1.6, 2.4, 3, M.steelD, 0, 10.2, 0));
  return g;
}

function buildLF() {
  const g = new THREE.Group();
  g.add(cyl(2.1, 1.7, 3.2, M.steelD, 0, 1.6, 0));   // 钢包
  g.add(cyl(2.3, 2.3, 0.5, M.steel, 0, 3.55, 0));   // 包盖
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(cyl(0.24, 0.24, 5, M.graphite, Math.cos(a) * 0.9, 6, Math.sin(a) * 0.9));
  }
  g.add(box(2.5, 1.6, 2.5, M.steelD, 0, 9, 0));     // 电极横臂机构
  g.add(box(1, 8, 1, M.steelD, 3, 4, 0));           // 立柱
  return g;
}

function buildRH() {
  const g = new THREE.Group();
  g.add(cyl(2.1, 1.7, 3.2, M.steelD, 0, 1.6, 0));   // 钢包
  g.add(cyl(1.9, 1.9, 4.5, M.steel, 0, 7.5, 0));    // 真空槽
  g.add(cyl(0.55, 0.55, 2.6, M.copper, -0.9, 4.3, 0)); // 浸渍管×2
  g.add(cyl(0.55, 0.55, 2.6, M.copper, 0.9, 4.3, 0));
  const duct = cyl(0.5, 0.5, 6, M.steelD, 3.5, 9, 0); // 抽气管
  duct.rotation.z = Math.PI / 2 - 0.5;
  g.add(duct);
  g.add(box(2.4, 2.4, 2.4, M.steel, 6.5, 10.5, 0));  // 真空泵组
  return g;
}

function buildCCM() {
  const g = new THREE.Group();
  g.add(cyl(0.8, 0.8, 7, M.steelD, -3, 3.5, 0));     // 回转台立柱
  g.add(box(7, 0.7, 1.6, M.steelD, -3, 7, 0));       // 回转臂
  g.add(cyl(1.8, 1.5, 2.6, M.steelD, -3, 8.6, 2.8)); // 钢包
  g.add(box(4, 1.4, 2.2, M.steel, -1, 5.6, 0));      // 中间包
  g.add(box(1.2, 1.6, 1.2, M.copper, 0, 4, 0));      // 结晶器
  // 弧形扇形段：小辊沿四分之一圆弧排布
  const R = 4;
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    const seg = box(1.5, 0.5, 1.8, M.steelD, Math.sin(a) * R, 4 - Math.cos(a) * R + 0.5, 0);
    seg.rotation.z = -a;
    g.add(seg);
  }
  // 弧内的红热铸坯
  for (let i = 1; i <= 5; i++) {
    const a = (i / 6) * (Math.PI / 2);
    const s = box(1.3, 0.34, 1.5, M.slabHot, Math.sin(a) * (R - 0.55), 4 - Math.cos(a) * (R - 0.55) + 0.5, 0);
    s.rotation.z = -a;
    g.add(s);
  }
  // 水平辊道 + 定尺板坯
  for (let i = 0; i < 6; i++) {
    const r = cyl(0.28, 0.28, 2.2, M.steelD, 5 + i * 1.6, 0.4, 0);
    r.rotation.x = Math.PI / 2;
    g.add(r);
  }
  g.add(box(4, 0.4, 1.6, M.slabHot, 7, 0.85, 0));
  g.add(box(4, 0.4, 1.6, M.hotDim, 12, 0.85, 0));
  return g;
}

function buildHSM() {
  const g = new THREE.Group();
  g.add(box(7, 4, 5, M.brick, -9, 2, 0));            // 加热炉
  g.add(cyl(0.5, 0.6, 6, M.brick, -11, 6.5, -1.5));  // 烟囱
  // 粗轧 2 架 + 精轧 7 架（门式机架）
  const stand = (x, s = 1) => {
    const st = new THREE.Group();
    st.add(box(0.8 * s, 4 * s, 1 * s, M.steelD, -1.1 * s, 2 * s, 0));
    st.add(box(0.8 * s, 4 * s, 1 * s, M.steelD, 1.1 * s, 2 * s, 0));
    st.add(box(3 * s, 0.8 * s, 1.2 * s, M.steelD, 0, 4.2 * s, 0));
    const roll = cyl(0.35 * s, 0.35 * s, 2 * s, M.steel, 0, 1.4 * s, 0);
    roll.rotation.x = Math.PI / 2;
    st.add(roll);
    st.position.x = x;
    return st;
  };
  g.add(stand(-3, 1.15));
  g.add(stand(0, 1.15));
  for (let i = 0; i < 7; i++) g.add(stand(4 + i * 2.2, 0.85));
  // 贯穿的红热带钢
  g.add(box(26, 0.16, 1.5, M.slabHot, 2, 1.2, 0));
  // 层流冷却 + 卷取机
  g.add(box(6, 0.3, 2, M.steelD, 22, 1, 0));
  const coil = mesh(new THREE.TorusGeometry(1.5, 0.75, 14, 28), M.steelD, 27, 1.6, 0);
  g.add(coil);
  g.add(box(3, 2.4, 2.6, M.steel, 27, 1.2, 2.6));
  return g;
}

// ---------- 装配厂区 ----------
// 布局：x 轴为物料流方向
const LAYOUT = [
  { id: "rawyard", build: buildRawyard, x: -74, z: 6,   labelY: 11 },
  { id: "coking",  build: buildCoking,  x: -50, z: -16, labelY: 15 },
  { id: "sinter",  build: buildSinter,  x: -50, z: 12,  labelY: 11 },
  { id: "bf",      build: buildBF,      x: -22, z: 0,   labelY: 23 },
  { id: "desulf",  build: buildDesulf,  x: -2,  z: 0,   labelY: 12 },
  { id: "bof",     build: buildBOF,     x: 14,  z: 0,   labelY: 20 },
  { id: "lf",      build: buildLF,      x: 30,  z: 0,   labelY: 14 },
  { id: "rh",      build: buildRH,      x: 44,  z: 0,   labelY: 16 },
  { id: "ccm",     build: buildCCM,     x: 60,  z: 0,   labelY: 13 },
  { id: "hsm",     build: buildHSM,     x: 88,  z: 0,   labelY: 12 },
];

export function buildPlant(scene) {
  const facilities = new Map();

  // 地面
  const ground = mesh(new THREE.PlaneGeometry(320, 160), new THREE.MeshStandardMaterial({ color: 0x1b222c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.castShadow = false;
  scene.add(ground);

  // 主干道路（物料流方向）
  const road = mesh(new THREE.PlaneGeometry(200, 6), new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 1 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(4, 0.02, 0);
  road.castShadow = false;
  scene.add(road);

  const zoneColor = (pid) => {
    const p = PROCESSES.find((x) => x.id === pid);
    return ZONES.find((z) => z.id === p.zone).color;
  };

  for (const item of LAYOUT) {
    const p = PROCESSES.find((x) => x.id === item.id);
    const group = item.build();
    group.position.set(item.x, 0, item.z);
    group.traverse((o) => {
      o.userData.facilityId = item.id;
      // 材质克隆：让每个设施可独立做高亮脉冲，互不影响
      if (o.isMesh && o.material) o.material = o.material.clone();
    });

    const label = makeLabel(`${p.icon} ${p.name}`, zoneColor(item.id));
    label.position.set(0, item.labelY, 0);
    group.add(label);

    scene.add(group);
    facilities.set(item.id, {
      group,
      focus: new THREE.Vector3(item.x, 4, item.z),
      labelY: item.labelY,
    });
  }

  // 模拟路径（发光钢包途经点，全部在主线 z=0 附近）
  const wp = (id, dy = 0) => {
    const f = facilities.get(id);
    return new THREE.Vector3(f.group.position.x, 0, f.group.position.z + 6 + dy);
  };
  const waypoints = {
    bf: wp("bf"), desulf: wp("desulf"), bof: wp("bof"), lf: wp("lf"),
    rh: wp("rh"), ccm: wp("ccm"), hsm: wp("hsm"),
  };

  return { facilities, waypoints };
}

// 发光钢包 / 板坯 / 钢卷（模拟用的移动物）
export function buildToken() {
  const g = new THREE.Group();

  const ladle = new THREE.Group();
  ladle.add(cyl(1.5, 1.15, 2.2, M.steelD, 0, 1.3, 0));
  const melt = cyl(1.3, 1.3, 0.3, M.hot, 0, 2.5, 0);
  melt.name = "melt";
  ladle.add(melt);
  ladle.add(box(3.6, 0.35, 0.5, M.steel, 0, 2.1, 0)); // 耳轴梁
  ladle.name = "ladle";

  const slab = box(3.4, 0.5, 1.6, M.slabHot, 0, 0.6, 0);
  slab.name = "slab";
  slab.visible = false;

  const coil = mesh(new THREE.TorusGeometry(1.1, 0.55, 14, 28), M.steelD, 0, 1.2, 0);
  coil.name = "coil";
  coil.visible = false;

  const light = new THREE.PointLight(0xff5500, 60, 18, 1.8);
  light.position.y = 3;
  light.name = "glow";

  g.add(ladle, slab, coil, light);
  g.visible = false;
  return g;
}
