// ============================================================
// 程序化贴图库：全部用 canvas 实时生成（无外部图片依赖）
// 所有平铺贴图都是无缝的（周期噪声），配合 kit.js 的"世界坐标 UV"
// 使贴图在任意尺寸的构件上保持统一的真实尺度。
// ============================================================
import * as THREE from "three";

// ---------- 随机数 / 周期噪声 ----------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// 周期值噪声：n(x, y, px, py)，x/y 为格点坐标，px/py 为周期（整数）
function valueNoise(seed) {
  const r = rng(seed);
  const T = new Float32Array(256 * 256);
  for (let i = 0; i < T.length; i++) T[i] = r();
  return (x, y, px, py) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
    const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
    const a = T[(y0 & 255) * 256 + (x0 & 255)], b = T[(y0 & 255) * 256 + (x1 & 255)];
    const c = T[(y1 & 255) * 256 + (x0 & 255)], d = T[(y1 & 255) * 256 + (x1 & 255)];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const N1 = valueNoise(7), N2 = valueNoise(31), N3 = valueNoise(101);
const hash2 = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// 分形噪声（u,v ∈ [0,1)，fx/fy 为基础频率，必须是整数以保证无缝）
export function fbm(n, u, v, fx, fy, oct = 4, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, ax = fx, ay = fy;
  for (let o = 0; o < oct; o++) {
    sum += amp * n(u * ax, v * ay, ax, ay);
    norm += amp; amp *= gain; ax *= 2; ay *= 2;
  }
  return sum / norm;
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- canvas 工具 ----------
function paint(w, h, fn) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const o = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      o[3] = 255;
      fn(x / w, y / h, o, x, y);
      const i = (y * w + x) * 4;
      d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
function tex(cv, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
const grey = (o, L, r = 1, g = 1, b = 1) => { o[0] = 255 * clamp(L * r); o[1] = 255 * clamp(L * g); o[2] = 255 * clamp(L * b); };

// 由高度函数生成法线贴图
function normalFromHeight(w, h, H, strength) {
  return paint(w, h, (u, v, o, x, y) => {
    const hx = H((x + 1) % w, y) - H((x - 1 + w) % w, y);
    const hy = H(x, (y + 1) % h) - H(x, (y - 1 + h) % h);
    let nx = -hx * strength, ny = hy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    o[0] = (nx / l * 0.5 + 0.5) * 255; o[1] = (ny / l * 0.5 + 0.5) * 255; o[2] = (nz / l * 0.5 + 0.5) * 255;
  });
}

// ---------- 生成全部贴图 ----------
export const TEX = {};

export function buildTextures() {
  // 通用"污垢"灰度贴图：乘到任意油漆钢结构颜色上（雨痕/锈斑/积灰）
  TEX.grime = tex(paint(512, 512, (u, v, o) => {
    const base = fbm(N1, u, v, 4, 4, 5);
    const streak = fbm(N2, u, v, 32, 2, 3);
    const spot = fbm(N3, u, v, 12, 12, 4);
    let L = 0.8 + 0.22 * (base - 0.5) * 2;
    L -= 0.22 * Math.max(0, streak - 0.55) * 2.2;
    L -= 0.35 * Math.max(0, spot - 0.66) * 3;
    grey(o, clamp(L, 0.42, 1), 1, 0.985, 0.96);
  }));

  // 锈蚀钢（高炉炉壳、旧钢结构）
  TEX.rust = tex(paint(512, 512, (u, v, o) => {
    const a = fbm(N1, u, v, 6, 6, 5), b = fbm(N2, u, v, 24, 3, 3), c = fbm(N3, u, v, 20, 20, 3);
    const r = smooth(0.45, 0.7, a + (c - 0.5) * 0.4);
    let R = mix(0.42, 0.55, r), G = mix(0.40, 0.30, r), B = mix(0.39, 0.2, r);
    const L = 0.85 + 0.25 * (b - 0.5) - 0.2 * Math.max(0, c - 0.65) * 2;
    o[0] = 255 * clamp(R * L * 1.6); o[1] = 255 * clamp(G * L * 1.6); o[2] = 255 * clamp(B * L * 1.6);
  }));

  // 混凝土（含分仓缝）
  TEX.concrete = tex(paint(512, 512, (u, v, o) => {
    let L = 0.84 + 0.14 * (fbm(N1, u, v, 6, 6, 5) - 0.5) * 2 + 0.06 * (fbm(N2, u, v, 64, 64, 2) - 0.5) * 2;
    const s = fbm(N3, u, v, 3, 3, 4);
    if (s > 0.58) L -= (s - 0.58) * 0.8;
    const ju = (u * 2) % 1, jv = (v * 2) % 1;
    if (ju < 0.006 || jv < 0.006) L *= 0.72;
    if (hash2(u * 512, v * 512) > 0.985) L *= 0.82;
    grey(o, L, 1, 0.985, 0.95);
  }));

  // 压型彩钢板（墙面/屋面）：颜色 + 法线（竖肋）
  const RIBS = 12;
  TEX.cladding = tex(paint(512, 512, (u, v, o) => {
    const p = (u * RIBS) % 1;
    const rib = smooth(0.15, 0.25, p) - smooth(0.45, 0.55, p);
    let L = 0.9 + 0.05 * rib;
    const st = fbm(N2, u, v, 48, 2, 3);
    L -= 0.16 * Math.max(0, st - 0.5) * 2;
    L -= 0.06 * (fbm(N1, u, v, 4, 4, 3) - 0.5);
    grey(o, L, 1, 0.99, 0.97);
  }));
  {
    const W = 512;
    const hgt = (x) => {
      const p = ((x / W) * RIBS) % 1;
      return smooth(0.15, 0.25, p) - smooth(0.45, 0.55, p);
    };
    TEX.claddingN = tex(normalFromHeight(W, 8, (x) => hgt(x), 2.5), { srgb: false });
  }

  // 耐火砖 / 砖砌（焦炉、烟囱）
  TEX.brick = tex(paint(512, 512, (u, v, o) => {
    const rows = 16, cols = 6;
    const ry = v * rows, row = Math.floor(ry);
    const rx = u * cols + (row % 2 ? 0.5 : 0), col = Math.floor(rx);
    const fy = ry - row, fx = rx - col;
    const mortar = fy < 0.08 || fx < 0.03;
    const h = hash2(col % cols, row);
    const soot = fbm(N1, u, v, 4, 4, 4);
    let R, G, B;
    if (mortar) { R = 0.55; G = 0.52; B = 0.48; }
    else { R = 0.62 + h * 0.15; G = 0.38 + h * 0.08; B = 0.28 + h * 0.05; }
    const L = 1 - 0.55 * smooth(0.45, 0.8, soot) - 0.1 * fbm(N2, u, v, 32, 32, 2);
    o[0] = 255 * R * L; o[1] = 255 * G * L; o[2] = 255 * B * L;
  }));

  // 沥青（道路底色）
  TEX.asphalt = tex(paint(512, 512, (u, v, o) => {
    let L = 0.5 + 0.15 * (fbm(N1, u, v, 8, 8, 5) - 0.5) * 2;
    if (hash2(u * 512, v * 512) > 0.96) L += 0.18;
    grey(o, L);
  }));

  // 道路（u 横向、v 纵向；一个周期 = 12m）
  TEX.road = tex(paint(256, 512, (u, v, o) => {
    let L = 0.32 + 0.06 * (fbm(N1, u, v, 4, 8, 5) - 0.5) * 2;
    if (hash2(u * 256, v * 512) > 0.97) L += 0.08;
    L -= 0.05 * (Math.exp(-((u - 0.27) ** 2) / 0.003) + Math.exp(-((u - 0.73) ** 2) / 0.003));
    let r = 1, g = 1, b = 1;
    if (u < 0.035 || u > 0.965) { if (u > 0.012 && u < 0.988) L = 0.85; }
    if (Math.abs(u - 0.5) < 0.012 && v % 1 < 0.5) { L = 0.85; r = 1; g = 0.85; b = 0.35; }
    grey(o, L, r, g, b);
  }));

  // 地面细节（砾石/压实土），均值 ≈0.5，在 shader 里 ×2 叠加
  TEX.groundDetail = tex(paint(512, 512, (u, v, o) => {
    let L = 0.5 + 0.18 * (fbm(N1, u, v, 16, 16, 4) - 0.5) * 2 + 0.08 * (fbm(N2, u, v, 64, 64, 2) - 0.5) * 2;
    const h = hash2(u * 512, v * 512);
    if (h > 0.93) L += 0.1; else if (h < 0.05) L -= 0.08;
    grey(o, L);
  }), { srgb: false });

  // 料堆颗粒（矿石/煤/焦/石灰石）
  TEX.pile = tex(paint(512, 512, (u, v, o) => {
    let L = 0.72 + 0.3 * (fbm(N1, u, v, 12, 12, 5) - 0.5) * 2;
    const h = hash2(u * 512, v * 512);
    L += (h - 0.5) * 0.35;
    grey(o, clamp(L, 0.3, 1.1));
  }));

  // 钢格栅平台
  TEX.grating = tex(paint(128, 128, (u, v, o) => {
    const a = (u * 6) % 1, b = (v * 24) % 1;
    const bar = a < 0.18 || b < 0.25;
    grey(o, bar ? 0.9 : 0.18);
  }));

  // 窗带（白天：深色玻璃+窗框）
  TEX.windows = tex(paint(256, 128, (u, v, o, x, y) => {
    const fx = (u * 4) % 1, fy = (v * 2) % 1;
    const frame = fx < 0.06 || fy < 0.08;
    if (frame) { grey(o, 0.8); return; }
    const refl = 0.25 + 0.25 * (1 - fy) + 0.1 * fbm(N1, u, v, 2, 2, 2);
    o[0] = 255 * refl * 0.55; o[1] = 255 * refl * 0.7; o[2] = 255 * refl * 0.85;
  }));
  // 窗带（夜间：随机亮灯）
  TEX.windowsLit = tex(paint(256, 128, (u, v, o) => {
    const cx = Math.floor(u * 4), cy = Math.floor(v * 2);
    const fx = (u * 4) % 1, fy = (v * 2) % 1;
    const frame = fx < 0.06 || fy < 0.08;
    const lit = hash2(cx + 3, cy + 7) > 0.35;
    if (frame || !lit) { grey(o, 0); return; }
    const k = 0.75 + 0.25 * fy;
    o[0] = 255 * k; o[1] = 220 * k; o[2] = 150 * k;
  }));

  // 熔体（铁水/钢水表面：亮黄 + 暗色浮渣纹）
  TEX.melt = tex(paint(256, 256, (u, v, o) => {
    const a = fbm(N1, u, v, 6, 6, 5);
    const vein = Math.abs(fbm(N2, u, v, 4, 4, 4) - 0.5);
    let t = smooth(0.3, 0.75, a);
    let R = 1, G = mix(0.55, 0.85, t), B = mix(0.15, 0.45, t);
    const crust = smooth(0.06, 0.0, vein);
    R *= 1 - crust * 0.6; G *= 1 - crust * 0.8; B *= 1 - crust * 0.9;
    o[0] = 255 * R; o[1] = 255 * G; o[2] = 255 * B;
  }));

  // 沿长度方向的温度渐变（铸坯、带钢、烧结台车）
  const grad = (stops) => tex(paint(512, 8, (u, v, o) => {
    let i = 0;
    while (i < stops.length - 2 && u > stops[i + 1][0]) i++;
    const [u0, c0] = stops[i], [u1, c1] = stops[i + 1];
    const t = clamp((u - u0) / (u1 - u0));
    o[0] = 255 * mix(c0[0], c1[0], t); o[1] = 255 * mix(c0[1], c1[1], t); o[2] = 255 * mix(c0[2], c1[2], t);
  }), { repeat: false });
  TEX.strandGrad = grad([[0, [1, 0.85, 0.5]], [0.12, [1, 0.55, 0.15]], [0.45, [0.75, 0.2, 0.04]], [0.8, [0.35, 0.06, 0.01]], [1, [0.18, 0.03, 0.01]]]);
  TEX.stripGrad = grad([[0, [1, 0.7, 0.3]], [0.35, [1, 0.45, 0.1]], [0.62, [0.7, 0.15, 0.02]], [0.85, [0.2, 0.03, 0.0]], [1, [0.05, 0.01, 0]]]);
  TEX.sinterGrad = grad([[0, [0.2, 0.05, 0.01]], [0.06, [1, 0.6, 0.2]], [0.2, [1, 0.35, 0.05]], [0.55, [0.45, 0.08, 0.01]], [1, [0.03, 0.01, 0]]]);

  // 粒子贴图：烟团（带噪声边缘）、火花、柔光
  TEX.smoke = tex(paint(128, 128, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
    const n = fbm(N1, u, v, 4, 4, 4);
    const a = clamp(1 - r * (0.8 + 0.5 * n)) ** 1.6;
    o[0] = o[1] = o[2] = 255; o[3] = 255 * a;
  }), { repeat: false });
  TEX.spark = tex(paint(64, 64, (u, v, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = clamp(1 - r) ** 3;
    o[0] = o[1] = o[2] = 255; o[3] = 255 * a;
  }), { repeat: false });
  TEX.glow = tex(paint(128, 128, (u, v, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = clamp(1 - r) ** 2;
    o[0] = o[1] = o[2] = 255; o[3] = 255 * a;
  }), { repeat: false });

  return TEX;
}
