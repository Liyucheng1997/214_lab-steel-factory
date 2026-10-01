// ============================================================
// 场景搭建 + 渲染管线 + 交互 + 一炉钢 3D 生产模拟
// 领域数据来自 data.js（全局 PROCESSES / ZONES / SUPPORT_SYSTEMS）
// ============================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { buildTextures } from "./textures.js";
import { initMaterials, MAT, setHook } from "./kit.js";
import { buildPlant, buildToken } from "./plant.js";
import { buildSite, buildSky, applySkyPreset, SKY_PRESETS } from "./site.js";
import { updateEmitters } from "./effects.js";

const $ = (sel) => document.querySelector(sel);
// 用定时器让出主线程（让加载提示刷新）；不用 rAF，避免后台标签页时加载停住
const sleepFrame = () => new Promise((r) => setTimeout(r, 20));
const clamp = THREE.MathUtils.clamp;

// ---------- 渲染器 ----------
const canvas = $("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
const PR = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(PR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 2, 1, 9000);
const HOME = { pos: new THREE.Vector3(-90, 240, 640), target: new THREE.Vector3(-150, 10, -40) };
camera.position.set(-260, 900, 1500);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.475;
controls.minDistance = 6;
controls.maxDistance = 1700;
controls.zoomToCursor = true;

// 标签层
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = "label-layer";
$("#app").appendChild(labelRenderer.domElement);

// ---------- 灯光 ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
const SHADOW_RES = innerWidth < 800 ? 2048 : 4096;
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 1800;
sun.shadow.bias = -0.0003;
scene.add(sun, sun.target);
const sunDir = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();

// ---------- 后期：描边（选中）+ 辉光 + 色调映射 ----------
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(PR);
composer.addPass(new RenderPass(scene, camera));
const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
outline.edgeStrength = 2.2; outline.edgeThickness = 1.0; outline.edgeGlow = 0;
outline.visibleEdgeColor.set(0xffa040); outline.hiddenEdgeColor.set(0x000000);
composer.addPass(outline);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.6, 2.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const vp = { w: 0, h: 0 };
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (vp.w === w && vp.h === h) return;
  vp.w = w; vp.h = h;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ---------- 构建场景 ----------
let facilities, crane, LIFT_Y, site, sky, token, pmrem, envScene;
const fac = (id) => facilities.get(id);

const T0 = performance.now();
const BUILD_LOG = (window.__buildLog = []);
const mark = (name) => BUILD_LOG.push(`${name}: ${Math.round(performance.now() - T0)} ms`); // 加载耗时（控制台查看 __buildLog）
async function build() {
  $("#loading-text").textContent = "生成程序化贴图…";
  await sleepFrame();
  buildTextures();
  initMaterials();
  mark("textures");
  $("#loading-text").textContent = "搭建厂区与设备模型…";
  await sleepFrame();
  sky = buildSky();
  scene.add(sky);
  envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  pmrem = new THREE.PMREMGenerator(renderer);
  ({ facilities, crane, LIFT_Y } = buildPlant(scene));
  mark("plant");
  site = buildSite(scene);
  mark("site");
  token = buildToken();
  scene.add(token);
  makeLabels();
  setMode("day");
  mark("env");
  resize();
  $("#loading-text").textContent = "编译着色器…";
  await sleepFrame();
  // 并行编译着色器（KHR_parallel_shader_compile），避免首帧卡顿
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  mark("compile");
  $("#loading").classList.add("done");
  camGoal.pos = HOME.pos.clone(); camGoal.target = HOME.target.clone(); camGoal.k = 0.025;
  animate();
  requestAnimationFrame(() => requestAnimationFrame(() => mark("first frames")));
}

// ---------- 昼夜 ----------
let mode = "day";
function setMode(m) {
  mode = m;
  const p = SKY_PRESETS[m];
  applySkyPreset(sky, p);
  sunDir.set(...p.sunDir).normalize();
  sun.color.setHex(p.sun); sun.intensity = p.sunI;
  hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround); hemi.intensity = p.hemiI;
  scene.fog = new THREE.FogExp2(p.fog, p.fogD);
  renderer.toneMappingExposure = p.exposure;
  [bloom.strength, bloom.radius, bloom.threshold] = p.bloom;
  if (scene.environment) scene.environment.dispose();
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  MAT.windows.emissiveIntensity = p.night ? 1.6 : 0;
  MAT.skylight.emissiveIntensity = p.night ? 0.5 : 0;
  site.setNight(!!p.night);
  $("#btn-night").textContent = p.night ? "☀ 白天" : "🌙 夜景";
}

// ---------- 影子：阴影相机跟随视点，并按纹素对齐避免闪烁 ----------
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3();
function updateShadow() {
  const tgt = controls.target;
  const dist = camera.position.distanceTo(tgt);
  const size = clamp(dist * 0.85, 45, 760);
  const cam = sun.shadow.camera;
  if (Math.abs(cam.right - size) / size > 0.06) {
    cam.left = -size; cam.right = size; cam.top = size; cam.bottom = -size;
    cam.updateProjectionMatrix();
    sun.shadow.normalBias = (size / SHADOW_RES) * 2.2;
  }
  const texel = (2 * cam.right) / SHADOW_RES;
  _r.crossVectors(THREE.Object3D.DEFAULT_UP, sunDir).normalize();
  _u.crossVectors(sunDir, _r);
  const x = Math.round(tgt.dot(_r) / texel) * texel, y = Math.round(tgt.dot(_u) / texel) * texel, z = tgt.dot(sunDir);
  _c.copy(_r).multiplyScalar(x).addScaledVector(_u, y).addScaledVector(sunDir, z);
  sun.target.position.copy(_c);
  sun.position.copy(_c).addScaledVector(sunDir, 900);
}

// ---------- 标签 ----------
const labels = [];
function makeLabels() {
  for (const [id, f] of facilities) {
    const p = PROCESSES.find((x) => x.id === id);
    const z = ZONES.find((x) => x.id === p.zone);
    const el = document.createElement("div");
    el.className = "plabel";
    el.innerHTML = `<i style="background:${z.color}"></i>${p.name}`;
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("click", () => { select(id); flyTo(id); });
    const o = new CSS2DObject(el);
    o.position.copy(f.labelPos);
    scene.add(o);
    labels.push(o);
  }
  for (const s of site.supportLabels) {
    const info = SUPPORT_SYSTEMS.find((x) => x.name === s.name);
    if (!info) continue;
    const el = document.createElement("div");
    el.className = "plabel support";
    el.innerHTML = `${info.icon} ${info.name}`;
    el.addEventListener("click", () => {
      showSupport(info);
      const t = new THREE.Vector3(...s.pos);
      camGoal.target = t.clone().setY(t.y * 0.4);
      camGoal.pos = t.clone().add(new THREE.Vector3(-60, 70, 140));
      camGoal.k = 0.04;
    });
    const o = new CSS2DObject(el);
    o.position.set(...s.pos);
    scene.add(o);
    labels.push(o);
  }
}

// ---------- 选中：描边 + 自动剖切外壳 ----------
let selected = null, cutAll = false;
const cutExtra = new Set();      // 转运途中临时剖切的工序（钢包在厂房内移动时可见）
function applyCutaway() {
  for (const [id, f] of facilities) {
    const hide = cutAll || id === selected || cutExtra.has(id);
    for (const m of f.clad) m.visible = !hide;
  }
}
function select(id) {
  selected = id;
  outline.selectedObjects = id ? [fac(id).group] : [];
  applyCutaway();
  if (id) showDetail(id);
}

// ---------- 点击建筑 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6 || !facilities) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const groups = [...facilities.values()].map((f) => f.group);
  const hits = raycaster.intersectObjects(groups, true);
  const visible = (o) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  const hit = hits.find((h) => h.object.isMesh && h.object.userData.facilityId && visible(h.object));
  if (hit) {
    const id = hit.object.userData.facilityId;
    if (!running) { select(id); flyTo(id); }
    else showDetail(id);
  }
});

// ---------- 详情卡 ----------
function showDetail(id) {
  const p = PROCESSES.find((x) => x.id === id);
  const zone = ZONES.find((z) => z.id === p.zone);
  const li = (arr) => arr.map((x) => `<li>${x}</li>`).join("");
  const rx = (arr) => arr.map((x) => `<li class="rx">${x}</li>`).join("");
  const pm = Object.entries(p.params).map(([k, v]) => `<li><b>${k}</b>：${v}</li>`).join("");
  $("#detail").innerHTML = `
    <h3>${p.icon} ${p.name} <small style="font-size:0.7em;color:${zone.color}">· ${zone.name}</small></h3>
    <div class="d-role">${p.role}</div>
    <div class="d-card"><h4>⚙️ 主要设备</h4><ul>${li(p.equipment)}</ul></div>
    <div class="d-card"><h4>📥 输入 → 📤 输出</h4><ul>${li(p.inputs.map((x) => "入：" + x))}${li(p.outputs.map((x) => "出：" + x))}</ul></div>
    <div class="d-card"><h4>🧪 关键反应 / 机理</h4><ul>${rx(p.reactions)}</ul></div>
    <div class="d-card"><h4>📊 典型工艺参数</h4><ul>${pm}</ul></div>`;
  $("#detail-card").hidden = false;
}
function showSupport(info) {
  $("#detail").innerHTML = `<h3>${info.icon} ${info.name} <small style="font-size:0.7em;color:#8b98ab">· 公辅系统</small></h3>
    <div class="d-card"><ul><li>${info.desc}</li></ul></div>`;
  $("#detail-card").hidden = false;
}
$("#btn-close").addEventListener("click", () => {
  $("#detail-card").hidden = true;
  if (!running) select(null);
});

// ---------- 相机飞行 ----------
const camGoal = { pos: null, target: null, k: 0.05 };
function viewOf(id) {
  const f = fac(id);
  const v = f.view || {};
  const dir = new THREE.Vector3(...(v.dir || [-0.5, 0.45, 1])).normalize();
  return { target: f.focus.clone(), pos: f.focus.clone().addScaledVector(dir, v.dist || 80) };
}
function flyTo(id) {
  const v = viewOf(id);
  camGoal.target = v.target; camGoal.pos = v.pos; camGoal.k = 0.045;
}
controls.addEventListener("start", () => { camGoal.pos = null; camGoal.target = null; follow = false; });

// ---------- 工具栏 ----------
$("#btn-night").addEventListener("click", () => setMode(mode === "day" ? "night" : "day"));
$("#btn-cut").addEventListener("click", (e) => {
  cutAll = !cutAll;
  e.currentTarget.classList.toggle("on", cutAll);
  applyCutaway();
});
$("#btn-label").addEventListener("click", (e) => {
  const on = e.currentTarget.classList.toggle("on");
  labelRenderer.domElement.style.display = on ? "" : "none";
});
$("#btn-home").addEventListener("click", () => {
  camGoal.pos = HOME.pos.clone(); camGoal.target = HOME.target.clone(); camGoal.k = 0.04;
  if (!running) { select(null); $("#detail-card").hidden = true; }
});

// ---------- 仪表盘 ----------
const fmt = { temp: (v) => `${Math.round(v)} °C`, pct: (v) => `${v.toFixed(3)} %` };
function renderState(s) {
  $("#g-temp").textContent = fmt.temp(s.temp);
  $("#g-c").textContent = fmt.pct(s.C);
  $("#g-s").textContent = fmt.pct(s.S);
  $("#g-p").textContent = fmt.pct(s.P);
  $("#g-form").textContent = s.form;
}

// ---------- 趋势图（温度/碳 沿工序） ----------
let history = [];
function renderTrend() {
  if (history.length < 2) { $("#trend").innerHTML = ""; return; }
  const W = 1600, H = 104, padL = 60, padR = 60, padT = 18, padB = 24;
  const n = history.length;
  const x = (i) => padL + (i * (W - padL - padR)) / (n - 1);
  const yT = (v) => padT + (1 - v / 1800) * (H - padT - padB);
  const yC = (v) => padT + (1 - v / 5) * (H - padT - padB);
  const pts = (key, y) => history.map((h, i) => `${x(i)},${y(h[key])}`).join(" ");
  const labelsSvg = history.map((h, i) =>
    `<text x="${x(i)}" y="${H - 6}" fill="#8b98ab" font-size="13" text-anchor="middle">${h.name}</text>`).join("");
  $("#trend").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${padL}" y="12" fill="#ff7043" font-size="12">— 温度(°C)</text>
      <text x="${padL + 110}" y="12" fill="#4fc3f7" font-size="12">— 碳含量(%)</text>
      <polyline points="${pts("temp", yT)}" fill="none" stroke="#ff7043" stroke-width="2.5"/>
      <polyline points="${pts("C", yC)}" fill="none" stroke="#4fc3f7" stroke-width="2.5" stroke-dasharray="6 3"/>
      ${history.map((h, i) => `<circle cx="${x(i)}" cy="${yT(h.temp)}" r="3.5" fill="#ff7043"/>`).join("")}
      ${history.map((h, i) => `<circle cx="${x(i)}" cy="${yC(h.C)}" r="3.5" fill="#4fc3f7"/>`).join("")}
      ${labelsSvg}
    </svg>`;
}

// ---------- 模拟 ----------
const SIM_STEPS = PROCESSES.filter((p) => p.inSim);
const START_STATE = { temp: 25, C: 0, S: 0.05, P: 0.1, form: "铁矿石" };
let running = false, follow = false;
const env = { active: null };
let simHook = null;            // 当前工序每帧回调 (p)
let state = { ...START_STATE };

const lerp = (a, b, t) => a + (b - a) * t;
// 补间由主循环统一推进（同一个时钟），模拟进度与画面严格同步
const tweens = new Set();
let simTime = 0;
function tween(seconds, onFrame) {
  return new Promise((resolve) => tweens.add({ t0: simTime, dur: Math.max(1e-3, seconds), onFrame, resolve }));
}
function stepTweens() {
  for (const tw of tweens) {
    const t = Math.min((simTime - tw.t0) / tw.dur, 1);
    tw.onFrame(t);
    if (t >= 1) { tweens.delete(tw); tw.resolve(); }
  }
}

function setTokenForm(form) {
  for (const n of ["torpedo", "ladle", "slab", "coil"]) token.getObjectByName(n).visible = n === form;
  token.userData.form = form;
  token.userData.stretch = [1, 1];
  token.getObjectByName("glow").intensity = form === "coil" || form === "torpedo" ? 0 : 200;
}

// 沿折线移动 token（speed m/s）
async function moveAlong(points, speed, { carried = false } = {}) {
  const P = points.map((p) => p.clone());
  const lens = [0];
  for (let i = 1; i < P.length; i++) lens.push(lens[i - 1] + P[i].distanceTo(P[i - 1]));
  const L = lens[lens.length - 1];
  if (L < 0.01) return;
  token.userData.carried = carried;
  await tween(Math.max(0.6, L / speed), (t) => {
    const e = t * t * (3 - 2 * t);
    const s = e * L;
    let i = 1;
    while (i < P.length - 1 && lens[i] < s) i++;
    const u = (s - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
    token.position.lerpVectors(P[i - 1], P[i], clamp(u, 0, 1));
  });
  token.userData.carried = false;
}

// 天车吊运钢包：A 工位 → A 起吊点 → 升起 → 平移 → 下降 → B 起吊点 → B 工位
async function craneTransfer(A, B) {
  const up = (v) => v.clone().setY(LIFT_Y);
  if (!A.slotW.equals(A.pickW)) await moveAlong([A.slotW, A.pickW], 10);
  await moveAlong([A.pickW, up(A.pickW)], 9, { carried: true });
  await moveAlong([up(A.pickW), up(B.pickW)], 30, { carried: true });
  await moveAlong([up(B.pickW), B.pickW], 9, { carried: true });
  if (!B.slotW.equals(B.pickW)) await moveAlong([B.pickW, B.slotW], 10);
}

function followToken(offset = new THREE.Vector3(-40, 34, 70)) {
  follow = offset;
}

async function runSim() {
  if (running) return;
  running = true;
  $("#btn-start").disabled = true;
  state = { ...START_STATE };
  history = [{ name: "入炉", temp: state.temp, C: state.C }];
  renderState(state);
  renderTrend();

  const hidden = [];
  const hide = (f) => { if (f.placeholder && f.placeholder.visible) { f.placeholder.visible = false; hidden.push(f.placeholder); } };
  token.visible = true;
  setTokenForm("torpedo");
  token.position.copy(fac("bf").slotW);
  hide(fac("bf"));

  let prev = null;
  for (const step of SIM_STEPS) {
    const f = fac(step.id);
    // ---- 转运 ----
    if (prev) {
      $("#sim-status").innerHTML = `🚚 转运至 <b>${step.name}</b> …`;
      followToken(prev.id === "bf" || prev.id === "ccm" ? undefined : new THREE.Vector3(-28, 46, 62));
      cutExtra.add(prev.id); cutExtra.add(f.id); applyCutaway();
      hide(f);
      if (prev.id === "bf") {
        await moveAlong([prev.slotW, f.torpedoW], 22);
        $("#sim-status").innerHTML = `🫗 鱼雷罐向铁水罐兑铁 …`;
        await tween(0.8, () => {});
        setTokenForm("ladle");
        token.position.copy(f.pickW);
        await moveAlong([f.pickW, f.slotW], 10);
      } else if (prev.id === "ccm") {
        const e = prev.exitW;
        await moveAlong([e, e.clone().setX(e.x + 22), f.slotW.clone().setX(f.slotW.x - 8).setZ(f.slotW.z), f.slotW], 16);
      } else {
        await craneTransfer(prev, f);
      }
      follow = false;
      cutExtra.clear();
    }
    // ---- 工序内 ----
    select(step.id);
    flyTo(step.id);
    env.active = step.id;
    $("#sim-status").innerHTML = `<b>${step.icon} ${step.name}</b> — ${step.sim.label}`;
    const from = { ...state };
    const to = step.sim.exit;
    const tp = step.sim.tempPath;
    const tempAt = (t) => {
      if (!tp) return lerp(from.temp, to.temp, t);
      let i = 0;
      while (i < tp.length - 2 && t > tp[i + 1][0]) i++;
      return lerp(tp[i][1], tp[i + 1][1], clamp((t - tp[i][0]) / (tp[i + 1][0] - tp[i][0]), 0, 1));
    };
    if (step.id === "hsm") followToken(new THREE.Vector3(-30, 36, 75));
    simHook = (p) => {
      f.simStep?.(p, token, env);
      if (step.id === "hsm" && p > 0.9 && token.userData.form !== "coil") {
        setTokenForm("coil");
        token.position.copy(f.coilW);
      }
    };
    await tween(step.sim.duration, (t) => {
      simHook(t);
      state = {
        temp: tempAt(t),
        C: lerp(from.C, to.C, t), S: lerp(from.S, to.S, t), P: lerp(from.P, to.P, t),
        form: from.form,
      };
      renderState(state);
    });
    simHook = null;
    follow = false;
    state = { ...to };
    renderState(state);
    history.push({ name: step.name.split("（")[0], temp: to.temp, C: to.C });
    renderTrend();
    if (step.id === "ccm") {
      setTokenForm("slab");
      token.position.copy(f.exitW);
    }
    $("#sim-status").innerHTML = `<b>${step.icon} ${step.name} 完成</b> — ${to.note}`;
    await tween(0.8, () => {});
    env.active = null;
    prev = f;
  }

  for (const h of hidden) h.visible = true;
  select(null);
  $("#sim-status").innerHTML =
    `🎉 <b>本炉生产完成！</b>看趋势图：<b>转炉</b>吹氧后碳断崖下降、温度反而升高（氧化放热）；<b>连铸</b>后温度骤降（凝固成形）。`;
  camGoal.pos = HOME.pos.clone(); camGoal.target = HOME.target.clone(); camGoal.k = 0.03;
  await tween(2.5, () => {});
  token.visible = false;
  $("#btn-start").disabled = false;
  running = false;
}
$("#btn-start").addEventListener("click", runSim);

// ---------- 主循环 ----------
const wind = new THREE.Vector3();
let lastReal = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastReal) / 1000);
  lastReal = now;
  tick(dt);
  render();
}

function tick(dt) {
  resize();
  simTime += dt;
  const t = simTime;
  stepTweens();

  for (const f of facilities.values()) f.update?.(t, dt, env);
  for (const u of site.updaters) u(t, dt);
  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = t;

  // token 外观：板坯按温度发光、拉长
  if (token.visible) {
    const form = token.userData.form;
    const slab = token.getObjectByName("slab");
    if (form === "slab") {
      const k = clamp((state.temp - 550) / 700, 0, 1);
      slab.material.emissiveIntensity = 0.15 + k * k * 4.5;
      slab.material.emissive.setRGB(1, 0.25 + 0.4 * k, 0.05 + 0.15 * k * k);
      const [sx, sy] = token.userData.stretch || [1, 1];
      slab.scale.set(sx, sy, 1);
    }
    if (form === "coil") token.getObjectByName("coil").rotation.z = 0;
    const glow = token.getObjectByName("glow");
    glow.intensity = form === "coil" || form === "torpedo" ? 0 : (form === "slab" ? 60 + 200 * clamp((state.temp - 600) / 650, 0, 1) : 200) * (0.9 + 0.1 * Math.sin(t * 11));
  }

  // 钢包天车：模拟时跟随钢包，空闲时在跨内往返
  {
    const inShop = running && token.userData.form === "ladle" && token.position.x > -62 && token.position.x < 212;
    const carry = inShop && token.userData.carried;
    // 吊运时跟随钢包；钢包在工位处理时天车让开，避免遮挡设备
    const park = token.position.x + (token.position.x < 150 ? 34 : -34);
    const tx = carry ? token.position.x : inShop ? park : 60 + Math.sin(t * 0.025) * 110;
    const tz = carry ? clamp(token.position.z, 5, 19) : 12 + Math.sin(t * 0.07) * 5;
    crane.group.position.x = THREE.MathUtils.lerp(crane.group.position.x, clamp(tx, -56, 206), Math.min(1, dt * 3));
    crane.trolley.position.z = THREE.MathUtils.lerp(crane.trolley.position.z, tz, Math.min(1, dt * 3));
    const hookY = carry ? token.position.y + 6.3 : LIFT_Y + 7;
    crane.hook.position.y = THREE.MathUtils.lerp(crane.hook.position.y, hookY, Math.min(1, dt * 6));
    setHook(crane, crane.hook.position.y);
  }

  // 相机：飞行 / 跟随
  if (follow && token.visible) {
    camGoal.target = token.position.clone().add(new THREE.Vector3(0, 4, 0));
    camGoal.pos = token.position.clone().add(follow);
    camGoal.k = 0.05;
  }
  if (camGoal.pos) {
    const k = 1 - Math.pow(1 - camGoal.k, dt * 60);
    camera.position.lerp(camGoal.pos, k);
    controls.target.lerp(camGoal.target, k);
    if (!follow && camera.position.distanceTo(camGoal.pos) < 0.5) { camGoal.pos = null; camGoal.target = null; }
  }
  controls.update();

  updateShadow();
  wind.set(0.55, 0, 0.25).multiplyScalar(0.7 + 0.3 * Math.sin(t * 0.05));
  const dayK = mode === "day" ? 1 : 0;
  updateEmitters(t, (renderer.domElement.height * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), wind, dayK);
}

function render() {
  composer.render();
  labelRenderer.render(scene, camera);
}

// 调试句柄（控制台可用）
window.__app = {
  camera, controls, camGoal, scene, renderer,
  select: (id) => select(id), flyTo: (id) => flyTo(id), setMode: (m) => setMode(m),
  look(px, py, pz, tx, ty, tz) { camGoal.pos = null; camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); },
  get facilities() { return facilities; },
  get simTime() { return simTime; },
  // 手动推进时间（后台标签页 rAF 停摆时用于测试）：advance(秒, 帧率)
  async advance(sec, fps = 30) {
    const n = Math.round(sec * fps);
    for (let i = 0; i < n; i++) {
      tick(1 / fps);
      for (let j = 0; j < 8; j++) await null; // 让 async 模拟流程的后续步骤得以执行
    }
    render();
    return $("#sim-status").textContent;
  },
};

build().catch((e) => {
  console.error(e);
  $("#loading-text").textContent = "加载失败：" + e.message;
});
