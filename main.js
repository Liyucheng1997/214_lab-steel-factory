// ============================================================
// 场景搭建 + 交互（点击建筑）+ 一炉钢 3D 生产模拟
// 领域数据来自 data.js（全局 PROCESSES / ZONES / SUPPORT_SYSTEMS）
// ============================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildPlant, buildToken } from "./plant.js";

const $ = (sel) => document.querySelector(sel);

// ---------- 渲染器 / 场景 / 相机 ----------
const canvas = $("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11161f);
scene.fog = new THREE.Fog(0x11161f, 120, 320);

const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 800);
camera.position.set(-10, 55, 95);

const controls = new OrbitControls(camera, canvas);
controls.target.set(4, 4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 10;
controls.maxDistance = 260;

// ---------- 灯光 ----------
scene.add(new THREE.HemisphereLight(0x8fb4d9, 0x2a2118, 0.85));
const sun = new THREE.DirectionalLight(0xffe0b0, 1.6);
sun.position.set(-60, 80, 50);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 300;
scene.add(sun);

// ---------- 厂区 + 钢包 ----------
const { facilities, waypoints } = buildPlant(scene);
const token = buildToken();
scene.add(token);

// ---------- 尺寸自适应 ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
addEventListener("resize", resize);

// ---------- 高亮激活的工序（发光脉冲） ----------
let activeId = null;
const pulsed = []; // {mat, base}
function setActive(id) {
  // 还原上一个
  for (const p of pulsed) p.mat.emissive.setHex(p.base);
  pulsed.length = 0;
  activeId = id;
  if (!id) return;
  facilities.get(id).group.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive !== undefined) {
      pulsed.push({ mat: o.material, base: o.material.emissive.getHex() });
    }
  });
}
// 注意：材质是共享的，脉冲通过整体 emissive 微调实现，见 animate()

// ---------- 点击建筑 → 详情 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6) return; // 拖拽旋转不算点击
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const hit = hits.find((h) => h.object.userData.facilityId);
  if (hit) {
    showDetail(hit.object.userData.facilityId);
    flyTo(hit.object.userData.facilityId);
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
$("#btn-close").addEventListener("click", () => { $("#detail-card").hidden = true; });

// ---------- 相机飞行 ----------
const camGoal = { pos: null, target: null };
function flyTo(id, dist = 26, height = 14) {
  const f = facilities.get(id);
  camGoal.target = f.focus.clone();
  camGoal.pos = f.focus.clone().add(new THREE.Vector3(-6, height, dist));
}
controls.addEventListener("start", () => { camGoal.pos = null; camGoal.target = null; }); // 用户接管即停

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
  const W = 1000, H = 150, padL = 55, padR = 55, padT = 20, padB = 34;
  const n = history.length;
  const x = (i) => padL + (i * (W - padL - padR)) / (n - 1);
  const yT = (v) => padT + (1 - v / 1800) * (H - padT - padB);
  const yC = (v) => padT + (1 - v / 5) * (H - padT - padB);
  const pts = (key, y) => history.map((h, i) => `${x(i)},${y(h[key])}`).join(" ");
  const labels = history.map((h, i) =>
    `<text x="${x(i)}" y="${H - 6}" fill="#8b98ab" font-size="13" text-anchor="middle">${h.name}</text>`).join("");
  $("#trend").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${padL}" y="12" fill="#ff7043" font-size="12">— 温度(°C)</text>
      <text x="${padL + 110}" y="12" fill="#4fc3f7" font-size="12">— 碳含量(%)</text>
      <polyline points="${pts("temp", yT)}" fill="none" stroke="#ff7043" stroke-width="2.5"/>
      <polyline points="${pts("C", yC)}" fill="none" stroke="#4fc3f7" stroke-width="2.5" stroke-dasharray="6 3"/>
      ${history.map((h, i) => `<circle cx="${x(i)}" cy="${yT(h.temp)}" r="3.5" fill="#ff7043"/>`).join("")}
      ${history.map((h, i) => `<circle cx="${x(i)}" cy="${yC(h.C)}" r="3.5" fill="#4fc3f7"/>`).join("")}
      ${labels}
    </svg>`;
}

// ---------- 模拟 ----------
const SIM_STEPS = PROCESSES.filter((p) => p.inSim);
const START_STATE = { temp: 25, C: 0, S: 0.05, P: 0.1, form: "铁矿石" };
let running = false;

const lerp = (a, b, t) => a + (b - a) * t;
// 按帧驱动的补间：每帧回调 t∈[0,1]
function tween(seconds, onFrame) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    function step(now) {
      const t = Math.min((now - t0) / (seconds * 1000), 1);
      onFrame(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

function setTokenForm(form) {
  const ladle = token.getObjectByName("ladle");
  const slab = token.getObjectByName("slab");
  const coil = token.getObjectByName("coil");
  ladle.visible = form === "ladle";
  slab.visible = form === "slab";
  coil.visible = form === "coil";
  token.getObjectByName("glow").intensity = form === "coil" ? 8 : 60;
}

async function moveToken(from, to, seconds) {
  await tween(seconds, (t) => {
    const e = t * t * (3 - 2 * t); // smoothstep
    token.position.lerpVectors(from, to, e);
  });
}

async function runSim() {
  if (running) return;
  running = true;
  $("#btn-start").disabled = true;

  let state = { ...START_STATE };
  history = [{ name: "入炉", temp: state.temp, C: state.C }];
  renderState(state);
  renderTrend();

  token.visible = true;
  setTokenForm("ladle");
  token.position.copy(waypoints[SIM_STEPS[0].id]);

  let prevWp = waypoints[SIM_STEPS[0].id];
  for (const step of SIM_STEPS) {
    const wp = waypoints[step.id];
    // 移动到本工序
    if (!wp.equals(prevWp)) {
      $("#sim-status").innerHTML = `🚚 转运至 <b>${step.name}</b> …`;
      await moveToken(prevWp, wp, 1.6);
      prevWp = wp;
    }
    setActive(step.id);
    showDetail(step.id);
    flyTo(step.id);
    $("#sim-status").innerHTML = `<b>${step.icon} ${step.name}</b> — ${step.sim.label}`;

    // 工序内：状态平滑过渡
    const from = { ...state };
    const to = step.sim.exit;
    await tween(step.sim.duration, (t) => {
      state = {
        temp: lerp(from.temp, to.temp, t),
        C: lerp(from.C, to.C, t),
        S: lerp(from.S, to.S, t),
        P: lerp(from.P, to.P, t),
        form: from.form,
      };
      renderState(state);
    });
    state = { ...to };
    renderState(state);
    history.push({ name: step.name.split("（")[0], temp: to.temp, C: to.C });
    renderTrend();

    // 形态切换：连铸后变板坯，热轧后变钢卷
    if (step.id === "ccm") setTokenForm("slab");
    if (step.id === "hsm") setTokenForm("coil");

    $("#sim-status").innerHTML = `<b>${step.icon} ${step.name} 完成</b> — ${to.note}`;
    await tween(0.6, () => {});
  }

  setActive(null);
  $("#sim-status").innerHTML =
    `🎉 <b>本炉生产完成！</b>看趋势图：<b>转炉</b>吹氧后碳断崖下降、温度反而升高（氧化放热）；<b>连铸</b>后温度骤降（凝固成形）。`;
  camGoal.pos = new THREE.Vector3(-10, 55, 95);
  camGoal.target = new THREE.Vector3(4, 4, 0);
  $("#btn-start").disabled = false;
  running = false;
}
$("#btn-start").addEventListener("click", runSim);

// ---------- 主循环 ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  resize();
  const t = clock.getElapsedTime();

  // 激活工序发光脉冲
  const pulse = (Math.sin(t * 5) + 1) / 2;
  for (const p of pulsed) {
    const c = new THREE.Color(p.base);
    c.lerp(new THREE.Color(0xff5500), 0.25 + pulse * 0.5);
    p.mat.emissive.copy(c);
  }

  // 钢包内钢水翻腾闪烁
  if (token.visible) {
    const melt = token.getObjectByName("melt");
    if (melt && melt.visible !== false) melt.material.emissiveIntensity = 1.3 + Math.sin(t * 9) * 0.5;
    token.getObjectByName("glow").intensity += Math.sin(t * 11) * 1.5;
  }

  // 相机飞行
  if (camGoal.pos) {
    camera.position.lerp(camGoal.pos, 0.04);
    controls.target.lerp(camGoal.target, 0.04);
    if (camera.position.distanceTo(camGoal.pos) < 0.3) { camGoal.pos = null; camGoal.target = null; }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();
