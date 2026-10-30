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
const PLANET_BIOMES = ['liquid', 'plains', 'rocky', 'crystal'];
const MOON_BIOMES = ['dust', 'rock', 'ice'];
const LANDER_R = 9;

let world = null;

// ---------- terrain shape ----------
function heightAt(body, d) {
  const x = d.x, y = d.y, z = d.z, s = body.seed, R = body.R;
  if (body.type === 'planet') {
    const c = (fbm3(x * 1.4, y * 1.4, z * 1.4, s, 5) - 0.5) * 4;
    let h = c * body.land + body.seaBias;
    const r = ridged3(x * 3.2 + 5, y * 3.2, z * 3.2, s + 11, 4);
    h += r * r * body.mount * smooth(0.0, 0.7, c + body.seaBias / body.land);
    h += (vnoise3(x * R / 7, y * R / 7, z * R / 7, s + 3) - 0.5) * 1.4;
    return Math.max(h, -32);
  }
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
function biomeOf(body, h, d) {
  if (body.type === 'planet') return h < 0 ? 0 : h < body.hRocky ? 1 : h < body.hCrystal ? 2 : 3;
  if (body.ice && fbm3(d.x * 2.4, d.y * 2.4, d.z * 2.4, body.seed + 7, 3) > 0.55) return 2;
  return h > 3 + (vnoise3(d.x * body.R / 25, d.y * body.R / 25, d.z * body.R / 25, body.seed + 9) - 0.5) * 8 ? 1 : 0;
}
function colorOf(body, b, h, d) {
  const names = body.type === 'planet' ? PLANET_BIOMES : MOON_BIOMES;
  const [hh, s, l] = body.col[names[b]];
  const R = body.R;
  let L = l + (vnoise3(d.x * R / 9, d.y * R / 9, d.z * R / 9, body.seed + 99) - 0.5) * 12;
  if (body.type === 'planet') {
    if (b === 0) L -= Math.min(22, -h * 0.8);
    if (b === 3) L += Math.min(15, (h - body.hCrystal) * 0.3);
  }
  return hsl2rgb(hh, s, L);
}

// pick a fairly flat dry spot for the lander
function findSite(body, rnd) {
  const d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3();
  let best = null, bestScore = Infinity;
  for (let i = 0; i < 600; i++) {
    randDir(rnd, d);
    if (i < 250 && d.dot(SUN_DIR) < 0.35) continue; // land in daylight
    const h = heightAt(body, d);
    if (body.type === 'planet' && (h < 3 || h > 16)) continue;
    tangentOf(d, t1); t2.copy(d).cross(t1);
    let slope = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      q.copy(d).addScaledVector(t1, a * 5 / body.R).addScaledVector(t2, b * 5 / body.R).normalize();
      slope = Math.max(slope, Math.abs(heightAt(body, q) - h));
    }
    const score = slope + (d.dot(SUN_DIR) < 0.35 ? 100 : 0);
    if (score < bestScore) { bestScore = score; best = d.clone(); }
    if (score < 1.2) break;
  }
  return best || new THREE.Vector3(0, 1, 0);
}

const _rc = new THREE.Vector3();
function recolorVertex(w, fc, k) {
  _rc.set(fc.dir[k * 3], fc.dir[k * 3 + 1], fc.dir[k * 3 + 2]);
  const b = fc.bio[k] = biomeOf(w.body, fc.h[k], _rc);
  const c = colorOf(w.body, b, fc.h[k], _rc);
  fc.col[k * 3] = c[0]; fc.col[k * 3 + 1] = c[1]; fc.col[k * 3 + 2] = c[2];
}

// ---------- terrain grid lookups ----------
const _gc = { f: 0, x: 0, y: 0 };
function gridCoord(d) {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  const f = ax >= ay && ax >= az ? (d.x > 0 ? 0 : 1) : ay >= az ? (d.y > 0 ? 2 : 3) : (d.z > 0 ? 4 : 5);
  const F = FACES[f], dn = d.dot(F.n), S = world.S;
  _gc.f = f;
  _gc.x = (Math.atan(d.dot(F.u) / dn) * 4 / Math.PI + 1) / 2 * S;
  _gc.y = (Math.atan(d.dot(F.v) / dn) * 4 / Math.PI + 1) / 2 * S;
  return _gc;
}
// terrain height (m above the base radius) in direction d (unit vector)
function groundH(d) {
  const g = gridCoord(d), S = world.S, S1 = S + 1;
  const i = clamp(Math.floor(g.x), 0, S - 1), j = clamp(Math.floor(g.y), 0, S - 1);
  const u = clamp(g.x - i, 0, 1), v = clamp(g.y - j, 0, 1), H = world.faces[g.f].h, k = j * S1 + i;
  return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + S1] * (1 - u) + H[k + S1 + 1] * u) * v;
}
// surface (or sea surface) radius in direction d
function surfaceR(d) {
  const h = groundH(d);
  return world.R + (world.hasSea ? Math.max(h, 0) : h);
}
function colorAtDir(d) {
  const g = gridCoord(d), S1 = world.S + 1;
  const k = (Math.round(g.y) * S1 + Math.round(g.x)) * 3, C = world.faces[g.f].col;
  return [C[k], C[k + 1], C[k + 2]];
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
  for (let i = 0; i < n; i++) { randDir(rnd, d).multiplyScalar(4000); p[i * 3] = d.x; p[i * 3 + 1] = d.y; p[i * 3 + 2] = d.z; }
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
  makeCraters(body);
  const R = body.R, S = body.type === 'planet' ? 128 : 72, S1 = S + 1, NV = S1 * S1;
  const w = { body, R, S, NV, hasSea: body.type === 'planet', faces: [], items: [], pulses: [] };
  world = w;
  const d = new THREE.Vector3();

  // pass 1: raw heights
  for (const F of FACES) {
    const fc = { h: new Float32Array(NV), dir: new Float32Array(NV * 3), col: new Float32Array(NV * 3), bio: new Uint8Array(NV) };
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      const k = j * S1 + i;
      const a = Math.tan((-1 + 2 * i / S) * Math.PI / 4), b = Math.tan((-1 + 2 * j / S) * Math.PI / 4);
      d.copy(F.n).addScaledVector(F.u, a).addScaledVector(F.v, b).normalize();
      fc.dir[k * 3] = d.x; fc.dir[k * 3 + 1] = d.y; fc.dir[k * 3 + 2] = d.z;
      fc.h[k] = heightAt(body, d);
    }
    w.faces.push(fc);
  }

  // landing site, flattened pad
  const L = findSite(body, mulberry32(body.seed * 17 + 9));
  const siteH = Math.max(body.type === 'planet' ? 2 : -99, heightAt(body, L));
  w.L = L; w.siteH = siteH;
  for (const fc of w.faces) for (let k = 0; k < NV; k++) {
    d.set(fc.dir[k * 3], fc.dir[k * 3 + 1], fc.dir[k * 3 + 2]);
    const dist = Math.acos(clamp(d.dot(L), -1, 1)) * R;
    if (dist < 30) fc.h[k] = lerp(fc.h[k], siteH, 1 - smooth(12, 28, dist));
  }

  // saved terraforming, then colour everything from the final heights
  const terra = save.terra[body.id];
  if (terra) for (const key in terra) { const f = Math.floor(key / NV); w.faces[f].h[key % NV] += terra[key]; }
  for (const fc of w.faces) for (let k = 0; k < NV; k++) recolorVertex(w, fc, k);

  // scene
  const scene = new THREE.Scene();
  w.scene = scene;
  w.skyColor = new THREE.Color(body.type === 'planet' ? body.sky : '#000000');
  scene.background = w.skyColor.clone();
  if (body.type === 'planet') scene.fog = body.dark ? new THREE.Fog(w.skyColor.clone(), 6, 60) : new THREE.Fog(w.skyColor.clone(), 160, 700);

  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  w.faces.forEach((fc, f) => {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(NV * 3);
    for (let k = 0; k < NV; k++) {
      const r = R + fc.h[k];
      pos[k * 3] = fc.dir[k * 3] * r; pos[k * 3 + 1] = fc.dir[k * 3 + 1] * r; pos[k * 3 + 2] = fc.dir[k * 3 + 2] * r;
    }
    // winding so triangles face outward
    const F = FACES[f], e1 = new THREE.Vector3().copy(F.u), e2 = new THREE.Vector3().copy(F.v);
    const flip = e1.cross(e2).dot(F.n) < 0;
    const idx = [];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = j * S1 + i, b = a + 1, c = a + S1, dd = c + 1;
      if (flip) idx.push(a, c, b, b, c, dd); else idx.push(a, b, c, b, dd, c);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(fc.col, 3));
    const mesh = new THREE.Mesh(geo, terrainMat);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    fc.mesh = mesh; fc.pos = pos;
    scene.add(mesh);
  });

  if (w.hasSea) {
    const [wh, ws, wl] = body.col.liquid;
    w.sea = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 100),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(wh / 360, ws / 100, (wl + 8) / 100), transparent: true, opacity: 0.8, roughness: 0.15, metalness: 0.1 }));
    scene.add(w.sea);
  }

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
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false }));
  sunDisc.position.copy(SUN_DIR).multiplyScalar(4200);
  scene.add(sunDisc);
  const srnd = mulberry32(body.seed + 404), sd = new THREE.Vector3();
  if (body.type === 'planet') {
    for (const M of body.moons) scene.add(skyBall(bodyColor(M, 'dust'), M.R * 3, randDir(srnd, sd), 2400 + srnd() * 600));
  } else {
    const P = body.parent;
    scene.add(skyBall(bodyColor(P, 'plains'), P.R * 3.2, sd.set(0.35, 0.8, -0.45), 2300));
    for (const M of P.moons) if (M !== body) scene.add(skyBall(bodyColor(M, 'dust'), M.R * 2, randDir(srnd, sd), 2600));
  }

  // lander + pad
  const lr = R + siteH;
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

  spawnSamples(w);
  spawnSpots(w);
  return w;
}

function spawnSamples(w) {
  const body = w.body, R = w.R, species = genSpecies(body);
  const rnd = mulberry32(body.seed * 13 + 5);
  const collected = new Set(save.collected[body.id] || []);
  const d = new THREE.Vector3();
  const tries = Math.round(4 * Math.PI * R * R / 75);
  for (let k = 0; k < tries; k++) {
    randDir(rnd, d);
    const r = rnd(), sr = rnd(), rot = rnd() * Math.PI * 2;
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
    if (!cat || collected.has(k)) continue;
    const sp = pickSpecies(sr, species[cat]);
    const s = sp.size / 12;
    const dir = d.clone();
    const gr = R + (cat === 'plant' && w.hasSea ? Math.max(h, 0) : h);
    const mesh = new THREE.Mesh(GEO[cat], speciesMat(sp));
    mesh.scale.setScalar(s);
    placeOnSurface(mesh, dir, gr, rot);
    mesh.castShadow = true;
    const label = makeLabel(spName(sp), CATS[cat].tag, 0.55, false);
    label.position.copy(dir).multiplyScalar(gr + LABEL_Y[cat] * s + 0.3);
    const it = { id: k, cat, sp, dir, pos: dir.clone().multiplyScalar(gr), gr, s, rot, mesh, label, revealed: cat !== 'fossil', ping: 0, taken: false };
    mesh.visible = it.revealed;
    label.visible = false;
    w.scene.add(mesh, label);
    w.items.push(it);
  }
}

function disposeWorld(w) {
  w.scene.traverse(o => {
    if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose();
    if (o.material && !sharedMats.has(o.material)) o.material.dispose();
  });
  if (w.sun.shadow.map) w.sun.shadow.map.dispose();
}
