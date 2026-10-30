'use strict';
// ---------- what you see in the sky ----------
// From a planet: its own moons as real cratered globes at a realistic size (about 1° across, like
// our Moon), orbiting slowly and lit by the sun, so they show phases. Other planets are only bright
// points of light, like planets seen from Earth.
// From a moon: the parent planet as a globe with phases, the other moons and planets as points.
const SKY_D = 150000;            // distance the sky bodies are drawn at (inside the camera's range)

const CELESTIAL_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const CELESTIAL_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uSun, uRim;
uniform float uRimK, uFade, uDay, uGain;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vView;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vN);
  float l = dot(n, uSun);
  // soft terminator; the night side stays almost black (a hint of light so the disc can be made out)
  float lit = smoothstep(-0.08, 0.25, l);
  vec3 col = texture2D(uMap, vUv).rgb * uGain * (0.015 + 0.985 * lit * (0.6 + 0.4 * max(l, 0.0)));
  // atmosphere rim on planets that have air
  float rim = pow(1.0 - max(dot(n, vView), 0.0), 3.0) * uRimK;
  col += uRim * rim * smoothstep(-0.25, 0.3, l);
  // by day only the sunlit part shows (the dark side is lost in the blue sky); at night it blocks the stars
  gl_FragColor = vec4(col, uFade * mix(1.0, clamp(lit * 1.4, 0.0, 1.0) * 0.85, uDay));
}`;
function celestialMat(tex, rim = null) {
  return new THREE.ShaderMaterial({
    vertexShader: CELESTIAL_VERT, fragmentShader: CELESTIAL_FRAG,
    uniforms: { uMap: { value: tex }, uSun: { value: SUN_DIR.clone() }, uRim: { value: new THREE.Color(rim || '#000000') }, uRimK: { value: rim ? 1.4 : 0 }, uFade: { value: 1 }, uDay: { value: 0 }, uGain: { value: rim === null ? 1.6 : 1.15 } },
    depthWrite: false, transparent: true, fog: false,
  });
}

// surface textures, painted once per body from the real terrain functions (cached)
const skyTexCache = {};
function moonSkyTexture(M) {
  if (skyTexCache[M.id]) return skyTexCache[M.id];
  const W = 192, H = 96, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H), d = new THREE.Vector3(), d2 = new THREE.Vector3();
  const hs = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    sphereDir(i, j, W, H, d);
    hs[j * W + i] = moonHeight(M, d.x, d.y, d.z);
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    sphereDir(i, j, W, H, d);
    const k = j * W + i, h = hs[k];
    const slope = (hs[j * W + (i + 1) % W] - h) / (M.R * Math.PI * 2 / W) * 6; // simple relief shading
    const col = colorOf(M, h > M.land * 0.35 ? 1 : 0, h, d, 1);
    const sh = clamp(1 - slope * 2.5, 0.55, 1.35);
    img.data[k * 4] = col[0] * 255 * sh; img.data[k * 4 + 1] = col[1] * 255 * sh; img.data[k * 4 + 2] = col[2] * 255 * sh; img.data[k * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return (skyTexCache[M.id] = new THREE.CanvasTexture(c));
}
function planetSkyTexture(P) {
  if (skyTexCache[P.id]) return skyTexCache[P.id];
  const W = 160, H = 80, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H), d = new THREE.Vector3();
  const [lh, ls, ll] = P.col.liquid, sea = hsl2rgb(lh, ls, ll);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    sphereDir(i, j, W, H, d);
    const h = heightAt(P, d), k = (j * W + i) * 4;
    let col = h < 0 ? sea : planetGroundColor(P, d, h, 1);
    // clouds from the same noise the cloud layer uses
    if (P.atmo) {
      const n = fbm3(d.x * 3 + 9, d.y * 3, d.z * 3, P.seed + 600, 4), cov = P.atmo.clouds;
      const a = smooth(0.62 - cov * 0.24, 0.72 - cov * 0.2, n) * 0.9;
      const cc = new THREE.Color(P.atmo.cloudColor);
      col = [lerp(col[0], cc.r, a), lerp(col[1], cc.g, a), lerp(col[2], cc.b, a)];
    }
    img.data[k] = col[0] * 255; img.data[k + 1] = col[1] * 255; img.data[k + 2] = col[2] * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return (skyTexCache[P.id] = new THREE.CanvasTexture(c));
}
// equirectangular pixel -> direction (matches SphereGeometry's UVs)
function sphereDir(i, j, W, H, out) {
  const lon = (i + 0.5) / W * Math.PI * 2, lat = (0.5 - (j + 0.5) / H) * Math.PI;
  return out.set(-Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat));
}

// bright points for planets (and sibling moons seen from a moon)
function skyDots(list) {
  const p = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
  list.forEach((o, i) => { p.set(o.dir.clone().multiplyScalar(SKY_D * 0.95).toArray(), i * 3); col.set(o.color.toArray(), i * 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 3.6, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = -2;
  return pts;
}

function makeSkyBodies(w) {
  const body = w.body, rnd = mulberry32(body.seed + 404), d = new THREE.Vector3();
  w.skyMoons = [];
  const own = planetOf(body), dots = [];
  // other planets: points of light spread along the plane of the solar system
  PLANETS.forEach((P, i) => {
    if (P === own) return;
    const a = (P.idx - own.idx) * 1.9 + 0.7, e = Math.sin(P.idx * 2.3) * 0.08;
    const c = new THREE.Color(P.atmo ? P.atmo.color : '#c8c0d8').lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(1.15);
    dots.push({ dir: new THREE.Vector3(Math.cos(a), e, Math.sin(a)).normalize(), color: c });
  });
  if (body.type === 'planet') {
    // the planet's own moons: realistic size, slowly orbiting, phases from the sun
    body.moons.forEach((M, k) => {
      const ang = 0.013 * Math.sqrt(M.R / 1700);                  // angular radius (about 1.5° across)
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_D * ang, 40, 24), celestialMat(moonSkyTexture(M)));
      mesh.renderOrder = -0.5; // after the sky glow, so a daytime moon still shows through the blue
      const incl = new THREE.Vector3(Math.sin(k * 1.7 + 0.3) * 0.25, 1, Math.cos(k * 2.1) * 0.25).normalize(); // orbit tilt
      w.skyMoons.push({ mesh, axis: incl, start: randDir(rnd, new THREE.Vector3()).addScaledVector(incl, 0).projectOnPlane(incl).normalize(),
        period: body.dayLen * (5 + k * 3.7 + rnd() * 2), spin: rnd() * Math.PI * 2 });
      w.sky.add(mesh);
    });
  } else {
    // from a moon: the parent planet hangs in the sky with phases; sibling moons are points
    const P = body.parent, ang = 0.05;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_D * ang, 48, 32), celestialMat(planetSkyTexture(P), P.atmo ? P.atmo.color : null));
    mesh.position.copy(d.set(0.35, 0.8, -0.45).normalize()).multiplyScalar(SKY_D);
    mesh.renderOrder = -1.5;
    w.sky.add(mesh);
    w.skyParent = mesh;
    for (const M of P.moons) if (M !== body) dots.push({ dir: randDir(rnd, new THREE.Vector3()), color: new THREE.Color('#e8e4dc') });
  }
  w.skyDots = skyDots(dots);
  w.sky.add(w.skyDots);
}

// per frame: moons move along their orbits, every globe is lit from the sun's direction,
// and the points fade out in a bright daytime sky
const _so = new THREE.Vector3(), _sqo = new THREE.Quaternion();
function updateSkyBodies(w, starAlpha) {
  const day = 1 - starAlpha;
  const t = w.dayT || 0;
  for (const m of w.skyMoons || []) {
    _sqo.setFromAxisAngle(m.axis, m.spin + Math.PI * 2 * t / m.period);
    m.mesh.position.copy(_so.copy(m.start).applyQuaternion(_sqo)).multiplyScalar(SKY_D);
    m.mesh.material.uniforms.uSun.value.copy(w.sunDir);
    m.mesh.material.uniforms.uDay.value = day;
  }
  if (w.skyParent) w.skyParent.material.uniforms.uSun.value.copy(w.sunDir);
  if (w.skyDots) w.skyDots.material.opacity = 0.25 + 0.75 * starAlpha;
}
