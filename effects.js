// ============================================================
// GPU 粒子：烟、蒸汽、火焰、火花、水幕
// 每个发射器是一个 THREE.Points，粒子运动完全在顶点着色器里按时间计算
// （无需每帧 CPU 更新），所以可以放几十个发射器而几乎不耗性能。
// ============================================================
import * as THREE from "three";
import { TEX } from "./textures.js";

const VS = /* glsl */ `
uniform float uTime, uLife, uSize0, uSize1, uScale, uOpacity;
uniform vec3 uOrigin, uVel, uSpread, uAccel, uArea, uWind;
attribute vec4 aSeed;
attribute float aOffset;
varying float vAlpha, vT, vRot;
#include <fog_pars_vertex>
float h1(float n){ return fract(sin(n) * 43758.5453123); }
void main(){
  float cyc = uTime / uLife + aOffset;
  float t = fract(cyc);
  float k = floor(cyc);
  vec4 s = vec4(h1(aSeed.x + k * 1.17), h1(aSeed.y + k * 2.31), h1(aSeed.z + k * 3.07), h1(aSeed.w + k * 4.53));
  float age = t * uLife;
  vec3 vel = uVel + (s.xyz * 2.0 - 1.0) * uSpread;
  vec3 p = uOrigin + (vec3(s.w, s.x, s.y) * 2.0 - 1.0) * uArea + vel * age + 0.5 * (uAccel + uWind) * age * age;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float size = mix(uSize0, uSize1, sqrt(t)) * (0.7 + 0.6 * s.z);
  gl_PointSize = size * uScale / max(1.0, -mvPosition.z);
  vAlpha = uOpacity * smoothstep(0.0, 0.08, t) * (1.0 - t) * (1.0 - t);
  vT = t;
  vRot = s.w * 6.2831 + t * (s.x - 0.5) * 3.0;
  #include <fog_vertex>
}`;

const FS = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor0, uColor1;
uniform float uBright;
varying float vAlpha, vT, vRot;
#include <fog_pars_fragment>
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot), sn = sin(vRot);
  vec2 uv = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) + 0.5;
  vec4 tx = texture2D(uMap, uv);
  float a = tx.a * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uColor0, uColor1, vT) * uBright, a);
  #include <fog_fragment>
}`;

export const EMITTERS = [];

/**
 * o: { origin:[x,y,z], count, life, vel:[..], spread:[..], accel:[..], area:[..],
 *      size0, size1, color0, color1, opacity, additive, map:'smoke'|'spark', bright, kind }
 * kind: 'smoke'（受昼夜亮度影响） | 'glow'（自发光，不受影响）
 */
export function emitter(o) {
  const n = o.count || 60;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  const off = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 4; j++) seed[i * 4 + j] = Math.random() * 100;
    off[i] = i / n + Math.random() * 0.5 / n;
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  g.setAttribute("aOffset", new THREE.BufferAttribute(off, 1));
  const v3 = (a, d = [0, 0, 0]) => new THREE.Vector3(...(a || d));
  const additive = !!o.additive;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uLife: { value: o.life || 6 },
      uSize0: { value: o.size0 ?? 4 }, uSize1: { value: o.size1 ?? 20 },
      uScale: { value: 400 }, uOpacity: { value: o.opacity ?? 0.5 },
      uOrigin: { value: v3(o.origin) }, uVel: { value: v3(o.vel, [0, 4, 0]) },
      uSpread: { value: v3(o.spread, [0.5, 0.5, 0.5]) }, uAccel: { value: v3(o.accel) },
      uArea: { value: v3(o.area) }, uWind: { value: new THREE.Vector3() },
      uMap: { value: o.map === "spark" ? TEX.spark : TEX.smoke },
      uColor0: { value: new THREE.Color(o.color0 ?? 0xffffff) },
      uColor1: { value: new THREE.Color(o.color1 ?? o.color0 ?? 0xffffff) },
      uBright: { value: o.bright ?? 1 },
    }]),
    vertexShader: VS, fragmentShader: FS,
    transparent: true, depthWrite: false, fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = additive ? 3 : 2;
  pts.userData.emitter = { kind: o.kind || (additive ? "glow" : "smoke"), baseOpacity: o.opacity ?? 0.5, windK: o.windK ?? 1, baseBright: o.bright ?? 1 };
  EMITTERS.push(pts);
  return pts;
}

// 预设
export const FX = {
  // 烟囱烟气（淡灰）
  stackSmoke: (origin, s = 1) => emitter({ origin, count: 70, life: 14, vel: [0, 5 * s, 0], spread: [1.2, 1, 1.2], size0: 5 * s, size1: 34 * s, color0: 0xd8d8d8, color1: 0xbfc2c4, opacity: 0.32, windK: 1 }),
  // 白色水蒸气（冷却塔、熄焦塔、连铸二冷）
  steam: (origin, s = 1, o = {}) => emitter({ origin, count: o.count || 80, life: o.life || 9, vel: [0, 7 * s, 0], spread: [1.5 * s, 1.5, 1.5 * s], area: o.area, size0: 8 * s, size1: 45 * s, color0: 0xffffff, color1: 0xf2f4f6, opacity: o.opacity ?? 0.45, windK: 0.8 }),
  // 褐色烟尘（转炉/出铁）
  fume: (origin, s = 1) => emitter({ origin, count: 60, life: 6, vel: [0, 6 * s, 0], spread: [1.2, 1.2, 1.2], size0: 4 * s, size1: 26 * s, color0: 0xb07a50, color1: 0x8c8378, opacity: 0.4 }),
  // 火焰（火炬、转炉炉口）
  flame: (origin, s = 1, o = {}) => emitter({ origin, count: o.count || 50, life: o.life || 1.1, vel: [0, 7 * s, 0], spread: [0.8 * s, 1.5 * s, 0.8 * s], area: o.area || [0.4 * s, 0, 0.4 * s], size0: 6 * s, size1: 2 * s, color0: 0xffd27a, color1: 0xff4a0a, opacity: 0.9, additive: true, bright: 3.5 }),
  // 火花（出铁口、切割、吹氧）
  sparks: (origin, o = {}) => emitter({ origin, count: o.count || 90, life: o.life || 1.3, vel: o.vel || [0, 5, 0], spread: o.spread || [5, 4, 5], accel: [0, -9.8, 0], size0: o.size || 0.9, size1: 0.3, color0: 0xfff1b0, color1: 0xff6a10, opacity: 1, additive: true, map: "spark", bright: 6, windK: 0 }),
  // 下落水幕（层流冷却）
  water: (origin, area) => emitter({ origin, count: 160, life: 0.6, vel: [0, -4, 0], spread: [0.05, 0.6, 0.05], area, accel: [0, -9.8, 0], size0: 0.6, size1: 0.9, color0: 0xdbeefa, color1: 0xffffff, opacity: 0.5, map: "spark", windK: 0 }),
};

// 每帧：时间、视口缩放、风、昼夜亮度
export function updateEmitters(t, scale, wind, dayK) {
  for (const p of EMITTERS) {
    const u = p.material.uniforms, d = p.userData.emitter;
    u.uTime.value = t;
    u.uScale.value = scale;
    u.uWind.value.copy(wind).multiplyScalar(d.windK);
    if (d.kind === "smoke") u.uBright.value = d.baseBright * (0.09 + 0.91 * dayK);
  }
}
