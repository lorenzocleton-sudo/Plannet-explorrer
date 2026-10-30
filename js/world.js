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
const MOON_BIOMES = ['dust', 'rock', 'ice'];
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
    // sea floor: shallow shelf near the coast, deeper basins offshore
    const hills = (fbm3(x * k, y * k, z * k, s + 5, 3) - 0.5) * 30;
    return -smooth(0, 0.55, -c) * 180 - 3 + hills * smooth(0, 0.4, -c) + ripple;
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
  return h + ripple;
}

function rawHeight(body, d) {
  const x = d.x, y = d.y, z = d.z, s = body.seed, R = body.R;
  if (body.type === 'planet') return planetHeight(body, x, y, z);
  const c = (fbm3(x * 1.8, y * 1.8, z * 1.8, s, 4) - 0.5) * 4;
  const r = ridged3(x * 3.5, y * 3.5, z * 3.5, s + 11, 4);
  let h = c * body.land + r * r * body.mount;
  for (const cr of body.craters) {
    const dt = x * cr.x + y * cr.y + z * cr.z;
    if (dt < cr.cosOuter) continue;
    const t = Math.acos(Math.min(1, dt)) / cr.r;
    h += t < 1 ? (t * t - 1) * cr.depth : (1 - (t - 1) / 0.4) * cr.depth * 0.35;
  }
  h += (vnoise3(x * R / 5, y * R / 5, z * R / 5, s + 3) - 0.5) * 0.8;
  return h;
}
function makeCraters(body) {
  if (body.craters) return;
  const rnd = mulberry32(body.seed * 5 + 2), d = new THREE.Vector3();
  body.craters = [];
  if (body.type !== 'moon') return;
  for (let i = 0; i < 34; i++) {
    randDir(rnd, d);
    const r = (3 + rnd() * rnd() * 22) / body.R;
    body.craters.push({ x: d.x, y: d.y, z: d.z, r, cosOuter: Math.cos(r * 1.4), depth: r * body.R * (0.18 + rnd() * 0.12) });
  }
}
// landing site (cached per body); the ground is flattened into a pad around it
function siteOf(body) {
  if (!body.site) {
    makeCraters(body);
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
function biomeOf(body, h, d) {
  if (body.type === 'planet') return h < 0 ? 0 : h < body.hRocky ? 1 : h < body.hCrystal ? 2 : 3;
  if (body.ice && fbm3(d.x * 2.4, d.y * 2.4, d.z * 2.4, body.seed + 7, 3) > 0.55) return 2;
  return h > 3 + (vnoise3(d.x * body.R / 25, d.y * body.R / 25, d.z * body.R / 25, body.seed + 9) - 0.5) * 8 ? 1 : 0;
}
// slope = how flat the ground is (1 = level, 0 = vertical cliff)
function colorOf(body, b, h, d, slope = 1) {
  const R = body.R, C = body.col;
  const tint = (vnoise3(d.x * R / 60, d.y * R / 60, d.z * R / 60, body.seed + 99) - 0.5) * 10
             + (vnoise3(d.x * R / 9, d.y * R / 9, d.z * R / 9, body.seed + 98) - 0.5) * 5;
  if (body.type !== 'planet') { const [hh, s, l] = C[MOON_BIOMES[b]]; return hsl2rgb(hh, s, l + tint); }
  let col;
  const mix = (a, c2, t) => [lerp(a[0], c2[0], t), lerp(a[1], c2[1], t), lerp(a[2], c2[2], t)];
  if (h < 0) col = [C.liquid[0], C.liquid[1], C.liquid[2] + 6 - Math.min(24, -h * 0.25)];
  else {
    // beach -> lowland -> rock -> peaks (-> snow), blended so there are no hard bands
    col = mix(C.beach || C.plains, C.plains, smooth(1.5, 5, h));
    col = mix(col, C.rocky, smooth(body.hRocky * 0.8, body.hRocky * 1.2, h));
    col = mix(col, C.crystal, smooth(body.hCrystal * 0.9, body.hCrystal * 1.1, h));
    if (C.snow) col = mix(col, C.snow, smooth(body.mount * 0.7, body.mount * 0.8, h) * smooth(0.6, 0.8, slope));
    col = mix(col, C.rocky, smooth(0.86, 0.68, slope) * smooth(1, 4, h)); // bare rock on steep slopes
  }
  return hsl2rgb(col[0], col[1], col[2] + tint);
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
const LABEL_Y = { plant: 2.1, rock: 1.3, mineral: 2.6, fossil: 0.9, dust: 0.9, ice: 1.4 };
const sharedGeos = new Set(Object.values(GEO));
const sharedMats = new Set();
const matCache = {};
function speciesMat(sp) {
  if (matCache[sp.id]) return matCache[sp.id];
  const c = new THREE.Color(sp.color), shiny = sp.cat === 'mineral' || sp.cat === 'ice';
  const m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: shiny ? 0.3 : 0.85, metalness: sp.cat === 'mineral' ? 0.2 : 0 });
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
  const metal = new THREE.MeshStandardMaterial({ color: 0xd7dce8, flatShading: true, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 3.4, 6), metal);
  body.position.y = 3.2;
  const win = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3aa0ff, emissive: 0x1a60aa, emissiveIntensity: 0.6 }));
  win.position.set(0, 3.4, 2.4);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
  beacon.position.y = 5.3;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 10).rotateX(Math.PI).translate(0, -1.2, 0),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
  flame.visible = false;
  g.add(body, win, beacon, flame);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.2), metal);
    const a = i * Math.PI / 2 + Math.PI / 4;
    leg.position.set(Math.cos(a) * 3, 1.2, Math.sin(a) * 3);
    leg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    g.add(leg);
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
  return new THREE.Points(g, m);
})();

function skyBall(color, radius, dir, dist) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  m.material.fog = false;
  m.position.copy(dir).normalize().multiplyScalar(dist);
  return m;
}
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
  w.skyColor = new THREE.Color(body.type === 'planet' ? body.sky : '#000000');
  scene.background = w.skyColor.clone();
  if (body.type === 'planet') scene.fog = body.dark ? new THREE.Fog(w.skyColor.clone(), 10, 140) : new THREE.Fog(w.skyColor.clone(), 900, 9000);

  initTerrain(w);

  // lights
  w.ambient = new THREE.AmbientLight(0xffffff, body.dark ? 0.08 : 0.35);
  w.sun = new THREE.DirectionalLight(0xfff6e8, body.dark ? 0.08 : 0.95);
  w.sun.castShadow = true;
  w.sun.shadow.mapSize.set(2048, 2048);
  Object.assign(w.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  w.sun.shadow.bias = -0.0008;
  w.lamp = new THREE.PointLight(0xfff2d0, 0, 34, 1.5);
  scene.add(w.ambient, w.sun, w.sun.target, w.lamp, STARS);

  // sky: sun disc, moons (from a planet) or the parent planet (from a moon)
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false }));
  sunDisc.position.copy(SUN_DIR).multiplyScalar(90000);
  scene.add(sunDisc);
  const srnd = mulberry32(body.seed + 404), sd = new THREE.Vector3();
  if (body.type === 'planet') {
    for (const M of body.moons) { const dist = 60000 + srnd() * 25000; scene.add(skyBall(bodyColor(M, 'dust'), dist * (0.02 + M.R / 120000), randDir(srnd, sd), dist)); }
  } else {
    const P = body.parent;
    scene.add(skyBall(bodyColor(P, 'plains'), 70000 * 0.11, sd.set(0.35, 0.8, -0.45), 70000));
    for (const M of P.moons) if (M !== body) scene.add(skyBall(bodyColor(M, 'dust'), 80000 * 0.012, randDir(srnd, sd), 80000));
  }

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
      if (b === 0) { if (r < 0.04) cat = 'plant'; }
      else if (b === 1) { if (r < 0.18) cat = 'plant'; else if (r < 0.21) cat = 'fossil'; else if (r < 0.22) cat = 'rock'; }
      else if (b === 2) { if (r < 0.13) cat = 'rock'; else if (r < 0.16) cat = 'fossil'; else if (r < 0.18) cat = 'mineral'; }
      else { if (r < 0.16) cat = 'mineral'; else if (r < 0.2) cat = 'rock'; else if (r < 0.21) cat = 'fossil'; }
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
  });
  if (w.sun.shadow.map) w.sun.shadow.map.dispose();
}
