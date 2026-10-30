'use strict';
// ---------- water ----------
// Each terrain chunk that reaches the sea gets a matching water sheet at sea level. Every vertex
// knows how deep the water is under it, so the shader can make shallows light and see-through and
// the open sea dark, add foam where waves meet the shore, and ripple the surface with moving waves.
const WATER_VERT = `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute float aDepth;
varying float vDepth;
varying vec3 vWorld;
void main() {
  vDepth = aDepth;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const WATER_FRAG = `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec3 uShallow, uDeep, uSky, uSun, uSunCol;
uniform float uTime, uLight, uWaves;
varying float vDepth;
varying vec3 vWorld;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// sum of a few travelling waves: returns the slope (gradient) of the surface
// (small waves fade out with distance before they get finer than a pixel and start to shimmer)
vec3 waveGrad(vec3 p, float t, float dist) {
  vec3 g = vec3(0.0);
  g += vec3(0.71, 0.0, 0.71) * cos(dot(p, vec3(0.71, 0.0, 0.71)) * 0.9 + t * 1.3) * 0.09 * smoothstep(700.0, 150.0, dist);
  g += vec3(-0.6, 0.3, 0.74) * cos(dot(p, vec3(-0.6, 0.3, 0.74)) * 1.7 + t * 1.9) * 0.06 * smoothstep(400.0, 90.0, dist);
  g += vec3(0.2, 0.9, -0.39) * cos(dot(p, vec3(0.2, 0.9, -0.39)) * 3.1 + t * 2.6) * 0.04 * smoothstep(220.0, 50.0, dist);
  g += vec3(-0.8, -0.5, 0.33) * cos(dot(p, vec3(-0.8, -0.5, 0.33)) * 6.3 + t * 3.7) * 0.025 * smoothstep(110.0, 25.0, dist);
  return g;
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 up = normalize(vWorld);
  float dist = length(cameraPosition - vWorld);
  float depth = max(vDepth, 0.0);
  // shallow ponds and lagoons are calm; waves build up over deeper water
  vec3 g = waveGrad(vWorld, uTime, dist) * uWaves * (0.15 + 0.85 * smoothstep(0.3, 4.0, depth));
  vec3 n = normalize(up - (g - up * dot(g, up)));
  vec3 v = normalize(cameraPosition - vWorld);
  float nearF = smoothstep(220.0, 40.0, dist); // fine detail fades out with distance (no shimmer far away)
  // colour: light and clear in the shallows, dark and opaque further out
  float deep = 1.0 - exp(-depth / 7.0);
  vec3 col = mix(uShallow, uDeep, deep);
  float alpha = mix(0.22, 0.93, smoothstep(0.0, 9.0, depth)) * smoothstep(0.0, 0.25, depth);
  // sky reflection gets stronger at grazing angles
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col = mix(col, uSky, fres * 0.75);
  alpha = max(alpha, fres * 0.85);
  // sun glints
  vec3 r = reflect(-uSun, n);
  float spec = pow(max(dot(r, v), 0.0), 140.0) * 2.2 + pow(max(dot(r, v), 0.0), 18.0) * 0.12;
  // foam: lines that roll in towards the shore, broken up by noise
  float fn = vn(vWorld * 0.45 + vec3(0.0, uTime * 0.3, 0.0)) * 0.6 + vn(vWorld * 1.6 - uTime * 0.4) * 0.4;
  float shore = smoothstep(0.45, 0.02, depth) * nearF;
  float bands = smoothstep(0.6, 0.95, sin(depth * 9.0 - uTime * 1.6 + fn * 3.0) * 0.5 + 0.5);
  float foam = clamp(shore * (0.55 * smoothstep(0.15, 0.0, depth) + bands * 0.6) * smoothstep(0.3, 0.6, fn), 0.0, 1.0);
  // crests on choppier water far out
  foam += smoothstep(0.16, 0.22, length(g)) * smoothstep(0.55, 0.8, fn) * 0.35 * deep * nearF;
  col = mix(col, vec3(0.95, 0.97, 1.0), clamp(foam, 0.0, 1.0));
  alpha = max(alpha, foam * 0.95);
  col = col * uLight + uSunCol * spec * smoothstep(-0.05, 0.1, dot(up, uSun));
  // a film of water only a few cm deep fades out instead of shimmering over the mud
  gl_FragColor = vec4(col, clamp(alpha + spec * 0.5, 0.0, 1.0) * smoothstep(0.0, 0.18, depth));
  #include <fog_fragment>
}`;

function makeWaterMaterial(body) {
  const [h, s, l] = body.col.liquid;
  const shallow = new THREE.Color().setHSL((h - 15) / 360, Math.min(1, s / 100 * 0.9), Math.min(0.75, (l + 22) / 100));
  const deep = new THREE.Color().setHSL(h / 360, s / 100, Math.max(0.05, (l - 14) / 100));
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uShallow: { value: shallow }, uDeep: { value: deep }, uSky: { value: new THREE.Color(body.atmo ? body.atmo.color : '#101018') },
      uSun: { value: SUN_DIR.clone() }, uSunCol: { value: new THREE.Color(0xfff2d8) }, uTime: { value: 0 }, uLight: { value: 1 }, uWaves: { value: 1 },
    }]),
    transparent: true, depthWrite: false, fog: true,
  });
}

// per frame: time, sun, how lit the water is, sky colour for reflections
function updateWater(w, sunAmt) {
  const m = w.terrain && w.terrain.seaMat;
  if (!m) return;
  const u = m.uniforms;
  u.uTime.value = (performance.now() / 1000) % 1000;
  u.uSun.value.copy(w.sunDir);
  u.uLight.value = 0.06 + 0.94 * smooth(-0.15, 0.2, sunAmt);
  if (w.scene.fog) u.uSky.value.copy(w.scene.fog.color).multiplyScalar(1.15);
}
