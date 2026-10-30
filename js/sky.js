'use strict';
// ---------- atmosphere glow + clouds ----------
// The atmosphere is a shell around the planet. A shader works out how much air the view ray
// passes through, so it paints the sky from the ground and a glowing rim from space.
const ATMO_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const ATMO_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun, uColor, uSunset, uGlow, uHaze, uCenter;
uniform float uR, uRa, uDensity, uRays, uTime;
varying vec3 vPos;
void main() {
  #include <logdepthbuf_fragment>
  vec3 ro = cameraPosition - uCenter;
  vec3 dir = normalize(vPos - cameraPosition);
  float b = dot(ro, dir);
  float disc = max(b * b - (dot(ro, ro) - uRa * uRa), 0.0);
  float sq = sqrt(disc);
  float t0 = max(0.0, -b - sq), t1 = -b + sq;
  float dp = b * b - (dot(ro, ro) - uR * uR);
  if (dp > 0.0) { float tp = -b - sqrt(dp); if (tp > 0.0) t1 = min(t1, tp); }
  float len = max(0.0, t1 - t0);
  vec3 mid = ro + dir * (t0 + len * 0.5);
  // air thins out with height: weight the path by the density at its lowest point
  float tc = clamp(-b, t0, t1);
  float rmin = length(ro + dir * tc);
  len *= exp(-max(0.0, rmin - uR) / ((uRa - uR) * 0.3));
  float sunAmt = dot(normalize(mid), uSun);
  float light = smoothstep(-0.3, 0.25, sunAmt);
  float dens = 1.0 - exp(-len / (uRa - uR) * uDensity);
  float graze = exp(-pow(sunAmt * 3.5, 2.0));
  float mu = max(dot(dir, uSun), 0.0);
  // sky colour from the air's chemistry: day colour, sunset colour, a halo around the sun
  // (blue on a dusty CO2 world, warm on an Earth-like one) and paler haze towards the horizon
  vec3 col = mix(uColor, uSunset, graze * 0.85);
  vec3 upv = normalize(cameraPosition - uCenter);
  float horiz = 1.0 - abs(dot(dir, upv));
  col = mix(col, uHaze * mix(1.0, 0.75, graze), pow(horiz, 5.0) * 0.55 * (1.0 - graze * 0.5));
  col += uGlow * (pow(mu, 4.0) * (0.2 + 0.9 * graze) + pow(mu, 40.0) * (0.45 + 0.9 * graze));
  col += vec3(1.0, 0.95, 0.85) * pow(mu, 300.0) * 1.5;
  // light shafts fanning out from a low sun through gaps in the clouds
  if (uRays > 0.0) {
    vec3 a1 = normalize(cross(uSun, abs(uSun.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 a2 = cross(uSun, a1);
    float ang = atan(dot(dir, a2), dot(dir, a1));
    float sh = (sin(ang * 11.0 + uTime * 0.04) * 0.5 + 0.5) * (sin(ang * 27.0 - uTime * 0.03 + 1.7) * 0.5 + 0.5) + (sin(ang * 5.0 + 2.1) * 0.5 + 0.5) * 0.35;
    float ray = smoothstep(0.3, 0.75, sh) * pow(mu, 2.5) * smoothstep(0.995, 0.97, mu) * (0.25 + graze * 1.2);
    col += uGlow * ray * uRays * 0.55;
  }
  gl_FragColor = vec4(col * light, clamp(dens * (0.12 + 0.88 * light), 0.0, 1.0));
}`;

function makeAtmosphere(R, Ra, atmo, center = new THREE.Vector3()) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
    uniforms: {
      uSun: { value: SUN_DIR.clone() }, uColor: { value: new THREE.Color(atmo.color) }, uSunset: { value: new THREE.Color(atmo.sunset) },
      uGlow: { value: new THREE.Color(atmo.glow || atmo.sunset) }, uHaze: { value: new THREE.Color(atmo.haze || atmo.color) },
      uCenter: { value: center }, uR: { value: R }, uRa: { value: Ra }, uDensity: { value: 3.2 },
      uRays: { value: atmo.clouds || 0 }, uTime: { value: 0 },
    },
    side: THREE.BackSide, transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(Ra, 96, 64), mat);
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

const CLOUD_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uSun, uColor;
varying vec3 vPos;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  float a = texture2D(uMap, vUv).a;
  float light = smoothstep(-0.25, 0.3, dot(normalize(vPos), uSun));
  gl_FragColor = vec4(uColor * (0.08 + 0.92 * light), a * (0.35 + 0.65 * light));
}`;
const CLOUD_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = (modelMatrix * vec4(position, 0.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

// seamless cloud cover from 3D noise sampled on the sphere
function cloudTexture(body) {
  const W = 512, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H), cov = body.atmo.clouds, s = body.seed + 600;
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = (i + 0.5) / W * Math.PI * 2, px = cl * Math.cos(lon), py = sl, pz = -cl * Math.sin(lon);
      const n = fbm3(px * 3 + 9, py * 3, pz * 3, s, 5) + (vnoise3(px * 24, py * 24, pz * 24, s + 1) - 0.5) * 0.08;
      const a = smooth(0.62 - cov * 0.24, 0.72 - cov * 0.2, n);
      const o = (j * W + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = a * 235;
    }
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
function makeClouds(body, Rc) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
    uniforms: { uMap: { value: cloudTexture(body) }, uSun: { value: SUN_DIR.clone() }, uColor: { value: new THREE.Color(body.atmo.cloudColor) } },
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(Rc, 160, 80), mat);
  m.renderOrder = 0;
  m.frustumCulled = false;
  return m;
}

// ---------- sun + day/night ----------
// Each world spins once per body.dayLen seconds around a slightly tilted axis. Instead of turning
// the terrain we turn the sky the other way, which looks the same from the ground.
const _q3 = new THREE.Quaternion(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3();
function signedAngle(a, b, axis) {
  _p1.copy(a).addScaledVector(axis, -a.dot(axis)).normalize();
  _p2.copy(b).addScaledVector(axis, -b.dot(axis)).normalize();
  return Math.atan2(_p3.copy(_p1).cross(_p2).dot(axis), _p1.dot(_p2));
}
function initDayCycle(w) {
  const B = w.body;
  w.axis = new THREE.Vector3(Math.sin(B.tilt), Math.cos(B.tilt), 0).normalize();
  w.sunBase = SUN_DIR.clone().addScaledVector(w.axis, -SUN_DIR.dot(w.axis)).normalize();
  // start at mid-morning at the landing site
  w.spin0 = signedAngle(w.sunBase, w.L, w.axis) + Math.PI * 2 * 0.17;
  w.dayT = 0;
  setDayTime(w, 0);
}
function setDayTime(w, t) {
  w.dayT = t;
  w.spin = w.spin0 - Math.PI * 2 * t / w.body.dayLen;
  _q3.setFromAxisAngle(w.axis, w.spin);
  w.sky.quaternion.copy(_q3);
  STARS.quaternion.copy(_q3);
  w.sunDir.copy(w.sunBase).applyQuaternion(_q3);
}
// local solar time (0..24) at a point on the surface
function localTime(w, up) {
  const a = signedAngle(up, w.sunDir, w.axis);
  return ((12 - a / (Math.PI * 2) * 24) % 24 + 24) % 24;
}
// lights for the current sun position, as seen from `up`
const _sunCol = new THREE.Color(), _warm = new THREE.Color('#ffb070'), _glowC = new THREE.Color();
function updateLights(w, up, head, aim) {
  const B = w.body, sunAmt = up.dot(w.sunDir);
  const day = smooth(-0.1, 0.18, sunAmt), dim = B.dark ? 0.15 : 1;
  w.sun.intensity = 0.95 * dim * smooth(-0.06, 0.12, sunAmt);
  w.sun.color.copy(_sunCol.set(0xfff6e8)).lerp(_warm, B.atmo ? Math.exp(-Math.pow(sunAmt * 5, 2)) * 0.7 : 0);
  // hemisphere light: sky colour from above, darker ground bounce from below
  w.ambient.intensity = lerp(0.06, B.atmo ? 0.55 : 0.28, day * dim);
  w.ambient.position.copy(up);
  if (B.atmo) w.ambient.color.set(B.atmo.color).lerp(_sunCol.set(0xffffff), 0.45);
  else w.ambient.color.set(0xd8dce8);
  w.ambient.groundColor.copy(w.groundTint || _sunCol.set(0x50483c)).multiplyScalar(0.55);
  // sun glow: bigger and warmer when the sun is low
  if (w.sunGlow) {
    const low = Math.exp(-Math.pow(sunAmt * 4, 2));
    w.sunGlow.material.color.set(0xfff2d8).lerp(_glowC.set(B.atmo ? (B.atmo.glow || B.atmo.sunset) : 0xfff2d8), low * 0.8);
    w.sunGlow.scale.setScalar((B.atmo ? 26000 : 11000) * (1 + low * 0.7));
    w.sunGlow.material.opacity = B.dark ? 0.15 : 0.9;
  }
  if (w.atmo) {
    w.atmo.material.uniforms.uTime.value = performance.now() / 1000 % 10000;
    w.atmo.material.uniforms.uRays.value = B.atmo.clouds * detail().rays;
  }
  const night = 1 - day * dim;
  w.lamp.intensity = night * 0.5;
  const better = save.upgrades.helmet;
  w.helmet.intensity = smooth(0.35, 0.65, night) * (better ? 3.4 : 2.2);
  w.helmet.distance = better ? 110 : 70;
  w.helmet.angle = better ? 0.8 : 0.62;
  if (head) {
    w.lamp.position.copy(head);
    w.helmet.position.copy(head);
    w.helmet.target.position.copy(aim);
  }
  return night;
}

// sky colour where you stand (mirrors the shader), used for fog and the stars
const _skyA = new THREE.Color(), _skyB = new THREE.Color();
function updateSky(w, up, sunDir, camR = camera.position.length()) {
  const B = w.body, sunAmt = up.dot(sunDir);
  if (w.atmo) {
    // above the air: no haze, and the stars come out even on the day side
    const H = w.atmo.material.uniforms.uRa.value - w.R, alt = Math.max(0, camR - w.R);
    const inAir = 1 - smooth(0.3 * H, H, alt);
    w.atmo.material.uniforms.uSun.value.copy(sunDir);
    w.clouds.material.uniforms.uSun.value.copy(sunDir);
    const light = smooth(-0.3, 0.25, sunAmt), graze = Math.exp(-Math.pow(sunAmt * 3.5, 2));
    // fog = the sky near the horizon: the day colour washed towards the haze, warmer at sunset
    _skyA.set(B.atmo.color).lerp(_skyB.set(B.atmo.haze || B.atmo.color), 0.45).lerp(_skyB.set(B.atmo.sunset), graze * 0.7).multiplyScalar(light);
    w.scene.fog.color.copy(_skyA);
    const fk = detail().fogK, [fn, ff] = B.atmo.fog || [700, 11000];
    w.scene.fog.near = fn * fk + alt * 3;
    w.scene.fog.far = ff * fk + alt * 10 + (1 - inAir) * 1e6;
    STARS.material.opacity = 1 - smooth(-0.2, 0.15, sunAmt) * inAir;
  } else STARS.material.opacity = 1;
  if (typeof updateSkyBodies === 'function') updateSkyBodies(w, STARS.material.opacity);
  return sunAmt;
}

// a soft additive glow around the sun disc (wide in an atmosphere, tight in vacuum)
let sunGlowTex = null;
function makeSunGlow(air) {
  if (!sunGlowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(255,250,235,0.9)'); g.addColorStop(0.25, 'rgba(255,235,200,0.35)');
    g.addColorStop(0.55, 'rgba(255,220,170,0.08)'); g.addColorStop(1, 'rgba(255,210,160,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    sunGlowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  s.scale.setScalar(air ? 26000 : 11000);
  s.renderOrder = -1;
  return s;
}
