'use strict';
// ---------- round worlds: cube-sphere terrain, sky, lander, samples ----------

const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
].map(([n, u, v]) => ({ n: new THREE.Vector3(...n), u: new THREE.Vector3(...u), v: new THREE.Vector3(...v) }));
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.56).normalize();
const LANDER_R = 9;

let world = null;

// ---------- terrain shape ----------
// Planets: continents with shallow shelves, flat coastal lowlands, rolling hills inland,
// mountain ranges with rounded ridges further inland, a few sharp peaks and wide valleys.
function planetHeight(body, x, y, z) {
  const s = body.seed, R = body.R;
  // gentle domain warp so coastlines and ranges don't look like plain noise
  const wx = x + (vnoise3(x * 2.1, y * 2.1, z * 2.1, s + 1) - 0.5) * 0.35;
  const wy = y + (vnoise3(x * 2.1, y * 2.1, z * 2.1, s + 2) - 0.5) * 0.35;
  const wz = z + (vnoise3(x * 2.1, y * 2.1, z * 2.1, s + 3) - 0.5) * 0.35;
  const c = (fbm3(wx * 1.1, wy * 1.1, wz * 1.1, s, 5) - 0.5) * 4 + body.seaBias;
  const k = R / 700;
  const ripple = (vnoise3(x * R / 25, y * R / 25, z * R / 25, s + 7) - 0.5) * 1.6;
  if (c < 0) {
    // sea floor: carries on the slope of the beach, so shores run gently into the water,
    // then drops over a shelf into deeper basins offshore
    const hills = (fbm3(x * k, y * k, z * k, s + 5, 3) - 0.5) * 30;
    return 1 + c * body.land * 1.6 - smooth(0.03, 0.55, -c) * 160 + hills * smooth(0.1, 0.4, -c) + ripple * smooth(0, 0.05, -c);
  }
  const inland = smooth(0.02, 0.6, c);
  // lowlands rise slowly from the coast; rolling hills grow further in
  let h = 1 + c * body.land;
  h += (fbm3(x * k, y * k, z * k, s + 5, 4) - 0.5) * 2 * 32 * smooth(0.04, 0.35, c);
  // wide valleys
  const vk = R / 3200, vn = Math.abs(fbm3(x * vk, y * vk, z * vk, s + 9, 2) - 0.5) * 2;
  h -= (1 - smooth(0, 0.18, vn)) * 45 * inland;
  // mountain ranges only well inland
  const mk = 3.2, rangeMask = smooth(0.5, 0.72, fbm3(wx * mk, wy * mk, wz * mk, s + 21, 2)) * smooth(0.2, 0.6, c);
  if (rangeMask > 0) {
    const rk = R / 2200;
    const ridge = softRidge3(wx * rk, wy * rk, wz * rk, s + 31, 4);
    let m = ridge * ridge * body.mount;
    // smaller side ridges and gullies on the mountain flanks
    const sk = R / 520;
    m += (softRidge3(x * sk, y * sk, z * sk, s + 41, 2) - 0.35) * body.mount * 0.14 * smooth(0.15, 0.5, ridge);
    // only a few sharp peaks
    const peak = smooth(0.8, 0.9, vnoise3(x * 9, y * 9, z * 9, s + 33));
    if (peak > 0) m += peak * Math.pow(ridge, 5) * body.mount * 0.6;
    h += rangeMask * m;
  }
  // a few rocky cliffs along the coast (most shores stay gentle)
  const cliff = smooth(0.72, 0.8, vnoise3(x * 14, y * 14, z * 14, s + 51));
  if (cliff > 0) h += cliff * smooth(0.002, 0.03, c) * 14;
  h += ripple * smooth(0, 0.05, c);
  // swamps: flat wet lowland with shallow ponds
  const sw = swampiness(body, x, y, z, c);
  if (sw > 0) h = lerp(h, 0.7 + (fbm3(x * R / 40, y * R / 40, z * R / 40, s + 77, 2) - 0.5) * 3.6, sw * 0.9);
  return h;
}

function rawHeight(body, d) {
  const x = d.x, y = d.y, z = d.z, s = body.seed, R = body.R;
  if (body.type === 'planet') return planetHeight(body, x, y, z);
  return moonHeight(body, x, y, z);
}

// Moons: gentle highlands, dark flat "maria" plains, and craters of many sizes.
// Craters come from a 3D cell grid per size class: each cell may hold one crater, and only the
// 8 cells nearest the point need checking, so this stays cheap however many craters there are.
const CRATER_SCALES = [{ k: 0.45, p: 0.7 }, { cell: 200, p: 0.8 }, { cell: 64, p: 0.85 }, { cell: 20, p: 0.9 }];
function craterField(body, px, py, pz) {
  let h = 0;
  CRATER_SCALES.forEach((S, si) => {
    const cs = S.cell || body.R * S.k, seed = body.seed + 1000 + si * 77;
    const gx = Math.floor(px / cs - 0.5), gy = Math.floor(py / cs - 0.5), gz = Math.floor(pz / cs - 0.5);
    for (let i = gx; i <= gx + 1; i++) for (let j = gy; j <= gy + 1; j++) for (let k = gz; k <= gz + 1; k++) {
      if (hash3(i, j, k, seed) > S.p) continue;
      let cx = (i + 0.2 + 0.6 * hash3(i, j, k, seed + 1)) * cs, cy = (j + 0.2 + 0.6 * hash3(i, j, k, seed + 2)) * cs, cz = (k + 0.2 + 0.6 * hash3(i, j, k, seed + 3)) * cs;
      // only cells the surface passes through hold craters (keeps every crater within the 8 checked cells)
      const cl = Math.hypot(cx, cy, cz);
      if (Math.abs(cl - body.R) > cs * 0.25) continue;
      const f = body.R / cl;
      cx *= f; cy *= f; cz *= f;
      const r = cs * (0.12 + 0.18 * hash3(i, j, k, seed + 4));
      const t = Math.hypot(px - cx, py - cy, pz - cz) / r;
      if (t >= 1.5) continue;
      const depth = r * 0.24, rim = r * 0.05;
      h += t < 1 ? Math.max(depth * (t * t - 1), -depth * 0.82) + rim * t * t * t * t : rim * (1 - smooth(1, 1.5, t));
    }
  });
  return h;
}
const mareMask = (body, x, y, z) => smooth(0.53, 0.6, fbm3(x * 1.3 + 3, y * 1.3, z * 1.3, body.seed + 50, 3));
function moonHeight(body, x, y, z) {
  const s = body.seed, R = body.R, k = R / 600;
  let h = (fbm3(x * 1.6, y * 1.6, z * 1.6, s, 4) - 0.5) * 2 * body.land;
  h += (fbm3(x * k, y * k, z * k, s + 4, 3) - 0.5) * 2 * 14;
  const mare = mareMask(body, x, y, z);
  h = lerp(h, -body.land * 0.3, mare);
  h += craterField(body, x * R, y * R, z * R) * (1 - mare * 0.5);
  return h + (vnoise3(x * R / 6, y * R / 6, z * R / 6, s + 3) - 0.5) * 0.5;
}

// landing site (cached per body); the ground is flattened into a pad around it
function siteOf(body) {
  if (!body.site) {
    const L = findSite(body, mulberry32(body.seed * 17 + 9));
    body.site = { L, h: Math.max(body.type === 'planet' ? 2 : -1e9, rawHeight(body, L)), cosOuter: Math.cos(30 / body.R) };
  }
  return body.site;
}
// terrain height (m above the base radius) in direction d (unit vector)
function heightAt(body, d) {
  let h = rawHeight(body, d);
  const S = siteOf(body), dt = d.dot(S.L);
  if (dt > S.cosOuter) h = lerp(h, S.h, 1 - smooth(12, 28, Math.acos(Math.min(1, dt)) * body.R));
  return h;
}
// planets: the main biome index (BIOMES), or -1 under the sea; moons: 0 dust, 1 rocky highland, 2 ice
function biomeOf(body, h, d, slope = 1) {
  if (body.type === 'planet') return h < 0 ? -1 : biomeWeights(body, d, h, slope);
  if (moonIce(body, d) > 0.5) return 2;
  return h > body.land * 0.35 + (vnoise3(d.x * body.R / 40, d.y * body.R / 40, d.z * body.R / 40, body.seed + 9) - 0.5) * 20 ? 1 : 0;
}
// icy moons keep their ice towards the poles and in a few patches
function moonIce(body, d) {
  if (!body.ice) return 0;
  const lat = Math.abs(d.y);
  return smooth(0.53, 0.59, fbm3(d.x * 2.4, d.y * 2.4, d.z * 2.4, body.seed + 7, 3) + smooth(0.45, 0.85, lat) * 0.12 - 0.04);
}
// slope = how flat the ground is (1 = level, 0 = vertical cliff)
function colorOf(body, b, h, d, slope = 1) {
  if (body.type === 'planet') return planetGroundColor(body, d, h, slope);
  const R = body.R, C = body.col;
  const tint = (vnoise3(d.x * R / 60, d.y * R / 60, d.z * R / 60, body.seed + 99) - 0.5) * 9
             + (vnoise3(d.x * R / 9, d.y * R / 9, d.z * R / 9, body.seed + 98) - 0.5) * 4;
  // grey dust, darker maria, rockier highlands and slopes, bright ice
  const mix = (a, c2, t) => [lerp(a[0], c2[0], t), lerp(a[1], c2[1], t), lerp(a[2], c2[2], t)];
  let col = mix(C.dust, C.mare, mareMask(body, d.x, d.y, d.z));
  col = mix(col, C.rock, Math.max(b === 1 ? 0.55 : 0, smooth(0.9, 0.7, slope)));
  col = mix(col, C.ice, moonIce(body, d));
  return hsl2rgb(col[0], col[1], col[2] + tint * 0.8);
}

// pick a fairly flat dry spot for the lander
function findSite(body, rnd) {
  const d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3();
  let best = null, bestScore = Infinity;
  for (let i = 0; i < 600; i++) {
    randDir(rnd, d);
    if (i < 250 && d.dot(SUN_DIR) < 0.35) continue; // land in daylight
    const h = rawHeight(body, d);
    if (body.type === 'planet' && (h < 3 || h > 40)) continue;
    tangentOf(d, t1); t2.copy(d).cross(t1);
    let slope = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      q.copy(d).addScaledVector(t1, a * 5 / body.R).addScaledVector(t2, b * 5 / body.R).normalize();
      slope = Math.max(slope, Math.abs(rawHeight(body, q) - h));
    }
    const score = slope + (d.dot(SUN_DIR) < 0.35 ? 100 : 0);
    if (score < bestScore) { bestScore = score; best = d.clone(); }
    if (score < 1.2) break;
  }
  return best || new THREE.Vector3(0, 1, 0);
}

const groundH = d => heightAt(world.body, d);
// surface (or sea surface) radius in direction d
function surfaceR(d) {
  const h = groundH(d);
  return world.R + (world.hasSea ? Math.max(h, 0) : h);
}
function colorAtDir(d) {
  const h = groundH(d);
  return colorOf(world.body, biomeOf(world.body, h, d), h, d);
}
// cube face + face coordinates (-1..1) of a direction
const _fp = { f: 0, s: 0, t: 0 };
function faceParam(d) {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  const f = ax >= ay && ax >= az ? (d.x > 0 ? 0 : 1) : ay >= az ? (d.y > 0 ? 2 : 3) : (d.z > 0 ? 4 : 5);
  const F = FACES[f], dn = d.dot(F.n);
  _fp.f = f;
  _fp.s = Math.atan(d.dot(F.u) / dn) * 4 / Math.PI;
  _fp.t = Math.atan(d.dot(F.v) / dn) * 4 / Math.PI;
  return _fp;
}

// ---------- shared forms + labels ----------
const GEO = {
  plant: new THREE.ConeGeometry(0.45, 1.6, 7).translate(0, 0.8, 0),
  rock: new THREE.DodecahedronGeometry(0.6).scale(1, 0.7, 1).translate(0, 0.3, 0),
  mineral: new THREE.OctahedronGeometry(0.5).scale(1, 1.8, 1).translate(0, 1.1, 0),
  fossil: new THREE.TorusGeometry(0.55, 0.17, 8, 18).rotateX(Math.PI / 2).translate(0, 0.08, 0),
  dust: new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1),
  ice: new THREE.IcosahedronGeometry(0.55, 0).translate(0, 0.45, 0),
};
const LABEL_Y = { plant: 2.2, rock: 1.3, mineral: 2.6, fossil: 0.9, dust: 0.9, ice: 1.6 };
const sharedGeos = new Set(Object.values(GEO));
const sharedMats = new Set();
const matCache = {};
function speciesMat(sp) {
  if (matCache[sp.id]) return matCache[sp.id];
  const c = new THREE.Color(sp.color), shiny = sp.cat === 'mineral' || sp.cat === 'ice';
  const m = new THREE.MeshStandardMaterial({ color: c, vertexColors: true, flatShading: sp.cat === 'mineral', roughness: shiny ? 0.3 : 0.85, metalness: sp.cat === 'mineral' ? 0.2 : 0, side: sp.cat === 'plant' ? THREE.DoubleSide : THREE.FrontSide });
  if (sp.cat === 'mineral') { m.emissive = c.clone(); m.emissiveIntensity = 0.45; }
  if (sp.cat === 'ice') { m.transparent = true; m.opacity = 0.85; }
  sharedMats.add(m);
  return (matCache[sp.id] = m);
}

const labelCache = {};
function labelMat(text, color, big) {
  const key = text + '|' + color + '|' + (big ? 1 : 0);
  if (labelCache[key]) return labelCache[key];
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const fs = 36;
  x.font = `bold ${fs}px system-ui,sans-serif`;
  const w = Math.ceil(x.measureText(text).width) + 28, h = fs + 18;
  c.width = w; c.height = h;
  x.font = `bold ${fs}px system-ui,sans-serif`;
  x.fillStyle = 'rgba(8,10,24,.68)';
  x.beginPath(); x.moveTo(12, 0); x.arcTo(w, 0, w, h, 12); x.arcTo(w, h, 0, h, 12); x.arcTo(0, h, 0, 0, 12); x.arcTo(0, 0, w, 0, 12); x.fill();
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false });
  if (big) { mat.depthTest = false; mat.sizeAttenuation = false; }
  sharedMats.add(mat);
  return (labelCache[key] = { mat, aspect: w / h });
}
function makeLabel(text, color, height, big) {
  const s = new THREE.Sprite();
  setLabelText(s, text, color, height, big);
  s.renderOrder = big ? 10 : 5;
  return s;
}
function setLabelText(s, text, color, height, big) {
  const L = labelMat(text, color, big);
  s.material = L.mat;
  s.scale.set(height * L.aspect, height, 1);
}

// A label whose text changes a lot (machine status) gets its own canvas that is redrawn in place,
// so it doesn't create a new texture for every new number.
const DYN_W = 768, DYN_H = 56;
function makeDynLabel(height) {
  const c = document.createElement('canvas');
  c.width = DYN_W; c.height = DYN_H;
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  s.scale.set(height * DYN_W / DYN_H, height, 1);
  s.renderOrder = 5;
  s.userData.dyn = { c, tex };
  return s;
}
function setDynLabel(s, text, color) {
  const { c, tex } = s.userData.dyn, x = c.getContext('2d');
  let fs = 36;
  x.font = `bold ${fs}px system-ui,sans-serif`;
  let w = x.measureText(text).width + 28;
  if (w > DYN_W) { fs = Math.floor(fs * DYN_W / w); x.font = `bold ${fs}px system-ui,sans-serif`; w = DYN_W; }
  x.clearRect(0, 0, DYN_W, DYN_H);
  const l = (DYN_W - w) / 2, h = DYN_H;
  x.fillStyle = 'rgba(8,10,24,.68)';
  x.beginPath(); x.moveTo(l + 12, 0); x.arcTo(l + w, 0, l + w, h, 12); x.arcTo(l + w, h, l, h, 12); x.arcTo(l, h, l, 0, 12); x.arcTo(l, 0, l + w, 0, 12); x.fill();
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, DYN_W / 2, h / 2 + 2);
  tex.needsUpdate = true;
}
function disposeDynLabel(s) { if (s.userData.dyn) { s.userData.dyn.tex.dispose(); s.material.dispose(); } }

// orient an object so its local +Y points along `up`
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function placeOnSurface(obj, up, r, spin = 0) {
  obj.position.copy(up).multiplyScalar(r);
  obj.quaternion.setFromUnitVectors(Y_AXIS, up);
  if (spin) obj.quaternion.multiply(_q2.setFromAxisAngle(Y_AXIS, spin));
}

// ---------- lander ----------
function makeLander() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xd7dce8, roughness: 0.42, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.5, metalness: 0.5 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.6 });
  // rounded hull: a lathe profile instead of a six-sided box
  const prof = [[0, 1.4], [2.6, 1.5], [3.05, 2.0], [2.9, 3.6], [2.3, 4.6], [1.2, 5.2], [0, 5.35]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), metal);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(3.08, 3.08, 0.35, 32, 1, true), gold);
  band.position.y = 2.6;
  const win = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 14), new THREE.MeshStandardMaterial({ color: 0x3aa0ff, emissive: 0x1a60aa, emissiveIntensity: 0.6, roughness: 0.15 }));
  win.position.set(0, 3.7, 2.35);
  win.scale.z = 0.5;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.3, 1.2, 24, 1, true), dark);
  nozzle.position.y = 0.9;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
  beacon.position.y = 5.55;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.3, 5, 16).rotateX(Math.PI).translate(0, -2.1, 0),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
  flame.visible = false;
  g.add(body, band, win, nozzle, beacon, flame);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, cx = Math.cos(a), cz = Math.sin(a);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 3.3, 10), metal);
    leg.position.set(cx * 3.15, 1.25, cz * 3.15);
    leg.rotation.set(-Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42); // feet splay outwards
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.14, 16), dark);
    pad.position.set(cx * 3.85, 0.07, cz * 3.85);
    g.add(leg, pad);
  }
  g.traverse(o => { o.castShadow = true; });
  return { group: g, beacon, flame };
}

// ---------- shared sky stars ----------
const STARS = (() => {
  const rnd = mulberry32(77), n = 1600, p = new Float32Array(n * 3), d = new THREE.Vector3();
  for (let i = 0; i < n; i++) { randDir(rnd, d).multiplyScalar(150000); p[i * 3] = d.x; p[i * 3 + 1] = d.y; p[i * 3 + 2] = d.z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false });
  sharedGeos.add(g); sharedMats.add(m);
  const pts = new THREE.Points(g, m);
  pts.renderOrder = -2;
  return pts;
})();

const bodyColor = (b, biome) => { const [h, s, l] = b.col[biome]; return new THREE.Color().setHSL(h / 360, s / 100, l / 100); };

// ---------- build a world ----------
function genBody(body) {
  const R = body.R;
  const w = { body, R, hasSea: body.type === 'planet', items: [], cells: new Map(), pulses: [], collected: new Set(save.collected[body.id] || []) };
  world = w;
  const site = siteOf(body);
  w.L = site.L; w.siteH = site.h;

  const scene = new THREE.Scene();
  w.scene = scene;
  scene.background = new THREE.Color('#000000');
  w.sunDir = SUN_DIR.clone();
  // air: glowing sky shell + moving clouds; airless worlds keep a black, starry sky
  if (body.atmo) {
    scene.fog = new THREE.Fog(new THREE.Color(body.atmo.color), 700, 11000);
    w.atmo = makeAtmosphere(R, R + Math.max(900, R * 0.12), body.atmo);
    w.clouds = makeClouds(body, R + body.mount * 1.25 + 300);
    scene.add(w.atmo, w.clouds);
  } else if (body.dark) scene.fog = new THREE.Fog(new THREE.Color('#000000'), 10, 140);

  initTerrain(w);

  // lights
  // sky light from above, light bounced off the ground from below (updated with the time of day)
  w.ambient = new THREE.HemisphereLight(0xffffff, 0x404040, body.dark ? 0.08 : 0.35);
  w.sun = new THREE.DirectionalLight(0xfff6e8, body.dark ? 0.08 : 0.95);
  w.sun.castShadow = true;
  w.sun.shadow.mapSize.set(detail().shadow, detail().shadow);
  Object.assign(w.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 420 });
  w.sun.shadow.bias = -0.0006;
  w.sun.shadow.normalBias = 0.04;
  // small fill light around you plus a helmet spotlight, both for the night
  w.lamp = new THREE.PointLight(0xfff2d0, 0, 12, 1.5);
  w.helmet = new THREE.SpotLight(0xfff4dd, 0, 70, 0.62, 0.45, 1.2);
  scene.add(w.ambient, w.sun, w.sun.target, w.lamp, w.helmet, w.helmet.target, STARS);

  // the sky turns around the planet's axis: sun, stars, moons / parent planet all move together
  w.sky = new THREE.Group();
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(1600, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
  sunDisc.position.copy(SUN_DIR).multiplyScalar(90000);
  w.sunGlow = makeSunGlow(!!body.atmo);
  w.sunGlow.position.copy(sunDisc.position);
  w.sky.add(sunDisc, w.sunGlow);
  makeSkyBodies(w);
  scene.add(w.sky);
  initDayCycle(w);

  // lander + pad
  const L = w.L, lr = R + w.siteH;
  const lander = makeLander();
  placeOnSurface(lander.group, L, lr);
  const pad = new THREE.Mesh(new THREE.RingGeometry(LANDER_R - 0.25, LANDER_R, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xa0dcff, transparent: true, opacity: 0.5 }));
  placeOnSurface(pad, L, lr + 0.08);
  w.landerLabel = makeLabel('LANDER', '#ff9d9d', 0.045, true);
  w.landerLabel.position.copy(L).multiplyScalar(lr + 7);
  w.landerLight = new THREE.PointLight(0xff5050, body.dark ? 1.2 : 0.4, 24);
  w.landerLight.position.copy(L).multiplyScalar(lr + 6);
  w.lander = lander; w.landerPos = L.clone().multiplyScalar(lr); w.landerR = lr;
  scene.add(lander.group, pad, w.landerLabel, w.landerLight);

  spawnSpots(w);
  loadBase(w);
  initScenery(w);
  w.groundTint = new THREE.Color().fromArray(colorAtDir(w.L));
  return w;
}

// ---------- samples stream in by area ("cells") around the player ----------
const CELL_TARGET = 150, CELL_LOAD = 200, CELL_KEEP = 290, SAMPLE_AREA = 330, ITEM_SHOW = 120;
const _cd = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
function updateSampleCells(w, maxSpawn = 2) {
  const n = 1 << (w.cellLevel ??= Math.max(0, Math.round(Math.log2(w.R * Math.PI / 2 / CELL_TARGET))));
  const up = player.up;
  tangentOf(up, _c1); _c2.copy(up).cross(_c1);
  const want = new Map();
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    _cd.copy(up).multiplyScalar(w.R).addScaledVector(_c1, a * 110).addScaledVector(_c2, b * 110).normalize();
    const p = faceParam(_cd);
    const x = clamp(Math.floor((p.s + 1) / 2 * n), 0, n - 1), y = clamp(Math.floor((p.t + 1) / 2 * n), 0, n - 1);
    const key = `${p.f}.${x}.${y}`;
    if (!want.has(key)) want.set(key, [p.f, x, y]);
  }
  for (const [key, c] of w.cells) if (c.center.distanceTo(player.pos) > CELL_KEEP) unloadCell(w, key, c);
  let spawned = 0;
  for (const [key, [f, x, y]] of want) {
    if (w.cells.has(key)) continue;
    const size = 2 / n;
    dirFromParam(FACES[f], -1 + (x + 0.5) * size, -1 + (y + 0.5) * size, _cd);
    if (_cd.multiplyScalar(w.R).distanceTo(player.pos) > CELL_LOAD + w.R * size * Math.PI / 8) continue;
    spawnCell(w, key, f, x, y, n);
    if (++spawned >= maxSpawn) break;
  }
}

// chance of each sample type per try, by planet biome
const BIOME_SAMPLES = {
  sea: { plant: 0.04 },
  [-1]: { plant: 0.04 },
  [B_GRASS]: { plant: 0.16, fossil: 0.02, rock: 0.02 },
  [B_FOREST]: { plant: 0.2, fossil: 0.03, rock: 0.01 },
  [B_DESERT]: { rock: 0.1, fossil: 0.05, mineral: 0.03, plant: 0.02 },
  [B_HIGH]: { rock: 0.13, mineral: 0.05, fossil: 0.02 },
  [B_TUNDRA]: { rock: 0.08, mineral: 0.03, plant: 0.03, fossil: 0.02 },
  [B_SWAMP]: { plant: 0.18, fossil: 0.05 },
  [B_ALIEN]: { mineral: 0.14, plant: 0.08, fossil: 0.03 },
};
function spawnCell(w, key, f, x, y, n) {
  const body = w.body, R = w.R, species = genSpecies(body), size = 2 / n;
  const a0 = -1 + x * size, b0 = -1 + y * size, arc = R * size * Math.PI / 4;
  const rnd = mulberry32((body.seed * 73856093) ^ (f * 19349663) ^ (x * 83492791) ^ (y * 2654435761));
  const cell = { items: [], center: dirFromParam(FACES[f], a0 + size / 2, b0 + size / 2, new THREE.Vector3()).multiplyScalar(R) };
  const bagIds = new Set(bag.map(i => i.id));
  const tries = Math.round(arc * arc / SAMPLE_AREA), d = new THREE.Vector3();
  for (let k = 0; k < tries; k++) {
    dirFromParam(FACES[f], a0 + rnd() * size, b0 + rnd() * size, d);
    const r = rnd(), sr = rnd(), rot = rnd() * Math.PI * 2;
    const id = `${key}.${k}`;
    if (w.collected.has(id) || bagIds.has(id)) continue;
    if (Math.acos(clamp(d.dot(w.L), -1, 1)) * R < 16) continue;
    const h = groundH(d), b = biomeOf(body, h, d);
    let cat = null;
    if (body.type === 'planet') {
      // what grows or lies around depends on the biome
      const P = BIOME_SAMPLES[b] || BIOME_SAMPLES.sea;
      let acc = 0;
      for (const k in P) { acc += P[k]; if (r < acc) { cat = k; break; } }
    } else {
      if (b === 0) { if (r < 0.08) cat = 'dust'; else if (r < 0.1) cat = 'rock'; }
      else if (b === 1) { if (r < 0.12) cat = 'rock'; }
      else { if (r < 0.14) cat = 'ice'; }
    }
    if (!cat) continue;
    const sp = pickSpecies(sr, species[cat]);
    const s = sp.size / 12, dir = d.clone();
    const gr = R + (cat === 'plant' && w.hasSea ? Math.max(h, 0) : h);
    const mesh = new THREE.Mesh(GEO[cat], speciesMat(sp));
    mesh.scale.setScalar(s);
    placeOnSurface(mesh, dir, gr, rot);
    mesh.castShadow = true;
    const label = makeLabel(spName(sp), CATS[cat].tag, 0.55, false);
    label.position.copy(dir).multiplyScalar(gr + LABEL_Y[cat] * s + 0.3);
    const it = { id, cell, cat, sp, dir, pos: dir.clone().multiplyScalar(gr), gr, s, rot, mesh, label, revealed: cat !== 'fossil', ping: 0, taken: false };
    mesh.visible = it.revealed;
    label.visible = false;
    w.scene.add(mesh, label);
    w.items.push(it);
    cell.items.push(it);
  }
  w.cells.set(key, cell);
}
function unloadCell(w, key, cell) {
  for (const it of cell.items) { w.scene.remove(it.mesh, it.label); it.unloaded = true; }
  w.items = w.items.filter(i => i.cell !== cell);
  w.cells.delete(key);
}

function disposeWorld(w) {
  w.scene.traverse(o => {
    if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose();
    if (o.material && !sharedMats.has(o.material)) o.material.dispose();
    if (o.userData && o.userData.dyn) o.userData.dyn.tex.dispose();
  });
  if (w.sun.shadow.map) w.sun.shadow.map.dispose();
  disposeScenery();
}
