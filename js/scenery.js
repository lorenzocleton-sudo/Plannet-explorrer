'use strict';
// ---------- scenery: grass, plants, trees, rocks and rock formations ----------
// The surface is cut into small tiles (cube-face grid, ~20 m). Each tile's contents are worked
// out once, deterministically, from the biome table below, and cached. Every few metres the
// tiles around the player are gathered into instanced meshes: one per model and detail level,
// so the whole landscape is a few dozen draw calls. Far things use cheaper models, and
// everything shrinks in smoothly at the edge of its draw distance (no popping).

// what grows per biome: kind, density (per m²), size range, group ('grass' or 'big')
const FLORA = {
  [B_GRASS]: [['grass', 1.2], ['bush', 0.004], ['broadleaf', 0.0018], ['rock', 0.004]],
  [B_FOREST]: [['grass', 0.45], ['broadleaf', 0.012], ['conifer', 0.008], ['bush', 0.008], ['rock', 0.003]],
  [B_DESERT]: [['cactus', 0.0015], ['drybush', 0.004], ['rock', 0.008], ['boulder', 0.0008], ['grass', 0.02]],
  [B_HIGH]: [['rock', 0.012], ['boulder', 0.002], ['slab', 0.0006], ['conifer', 0.0018], ['grass', 0.2]],
  [B_TUNDRA]: [['grass', 0.15], ['deadtree', 0.0012], ['conifer', 0.0025], ['rock', 0.006], ['boulder', 0.0005]],
  [B_SWAMP]: [['grass', 0.9], ['swamptree', 0.0028], ['bush', 0.006], ['deadtree', 0.0008]],
  [B_ALIEN]: [['aliengrass', 0.7], ['bulbs', 0.004], ['tubes', 0.005], ['shroom', 0.002], ['rock', 0.003]],
};
const MOON_FLORA = [['rock', 0.01], ['boulder', 0.0012], ['slab', 0.0003]];
// planets with eroded pillars and arches in their dry, rocky or alien land
const FORMATIONS = { Ruska: 1, Umbros: 0.7, 'Xeno Prime': 0.6 };
// size range, collision radius (× scale), how far it is drawn (× tree distance), upright or tumbled
const KINDS = {
  grass: { s: [0.8, 1.3], model: 'grass' }, aliengrass: { s: [0.8, 1.3], model: 'aliengrass' },
  bush: { s: [0.7, 1.4], far: 0.6 }, drybush: { s: [0.6, 1.1], far: 0.6, model: 'drybush' },
  broadleaf: { s: [0.8, 1.5], coll: 0.35, up: 1 }, conifer: { s: [0.9, 1.8], coll: 0.3, up: 1 },
  swamptree: { s: [0.8, 1.3], coll: 0.3, up: 1 }, deadtree: { s: [0.8, 1.4], coll: 0.25, up: 1 },
  cactus: { s: [0.8, 1.4], coll: 0.35, up: 1, far: 0.6 },
  bulbs: { s: [0.8, 1.6], far: 0.6 }, tubes: { s: [0.8, 1.5], far: 0.6 }, shroom: { s: [0.8, 1.6], coll: 0.3, up: 1 },
  lichen: { s: [0.4, 1.1], far: 0.45 },
  rock: { s: [0.15, 0.7], far: 0.45, tumble: 1 }, boulder: { s: [1.4, 4], coll: 0.75, tumble: 1, model: 'rock' },
  slab: { s: [3, 7], coll: 0.8, tumble: 0.4 }, pillar: { s: [10, 26], coll: 0.12, up: 1 }, arch: { s: [12, 24], up: 1, arch: 1 },
};
const ROCKY = new Set(['rock', 'boulder', 'slab', 'pillar', 'arch']);
// each world's chemistry decides which of the biome plants can really grow there (null = none)
const FLORA_SWAP = {
  earth: { conifer: 'broadleaf', swamptree: 'broadleaf', bulbs: null, tubes: null, shroom: null, aliengrass: null },
  earthCold: { swamptree: 'deadtree', cactus: null, drybush: 'bush', bulbs: null, tubes: null, shroom: null, aliengrass: null },
  alienDry: { grass: 'lichen', bush: 'lichen', drybush: 'lichen', broadleaf: 'tubes', conifer: 'tubes', swamptree: 'bulbs', deadtree: null, cactus: 'tubes', aliengrass: 'lichen', shroom: null },
  alienWet: { grass: 'aliengrass', bush: 'bulbs', drybush: 'bulbs', broadleaf: 'shroom', conifer: 'shroom', swamptree: 'shroom', deadtree: 'tubes', cactus: 'tubes' },
  none: { grass: null, aliengrass: null, bush: null, drybush: null, broadleaf: null, conifer: null, swamptree: null, deadtree: null, cactus: null, bulbs: null, tubes: null, shroom: null },
};
// Ruska's lichen and growths are sparse: only a fraction of what an Earth-like biome would hold
const FLORA_SCALE = { alienDry: 0.08 };
const swapKind = (prof, k) => k in FLORA_SWAP[prof] ? FLORA_SWAP[prof][k] : k;

const SCN = { tiles: new Map(), level: 0, queue: [], last: new THREE.Vector3(1e9, 0, 0), meshes: new Map(), colliders: [], dirty: true };

function resetSceneryModels() {
  for (const B of SCN.meshes.values()) if (B.mesh) { SCN.group && SCN.group.remove(B.mesh); B.mesh.dispose(); }
  SCN.meshes.clear(); SCN.tiles.clear(); SCN.dirty = true;
}
function initScenery(w) {
  buildModels();
  buildImpostors();
  SCN.tiles.clear(); SCN.queue = []; SCN.meshes.clear(); SCN.colliders = []; SCN.last.set(1e9, 0, 0); SCN.dirty = true;
  SCN.level = Math.round(Math.log2(w.R * Math.PI / 2 / 20));
  SCN.group = new THREE.Group();
  w.scene.add(SCN.group);
  NATURE_U.uWind.value = w.body.atmo ? 1 : 0;
}

// ---- tile contents ----
const _sd = new THREE.Vector3(), _sq = new THREE.Quaternion(), _sm = new THREE.Matrix4(), _ss = new THREE.Vector3(), _st = new THREE.Vector3(), _sy = new THREE.Quaternion();
const _tmpW = new Float32Array(NB);
function genTile(w, f, x, y) {
  const body = w.body, R = w.R, n = 1 << SCN.level, size = 2 / n, a0 = -1 + x * size, b0 = -1 + y * size;
  const rnd = mulberry32((body.seed * 2654435761) ^ (f * 97531) ^ (x * 7919) ^ (y * 104729));
  const F = FACES[f], G = 6;
  // a small grid of heights, biomes and slopes over the tile; plants read from it
  const gh = new Float32Array((G + 1) * (G + 1)), gw = [];
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
    dirFromParam(F, a0 + size * i / G, b0 + size * j / G, _sd);
    const h = groundH(_sd);
    gh[j * (G + 1) + i] = h;
    if (body.type === 'planet') { biomeWeights(body, _sd, h); gw.push(Float32Array.from(_bw)); }
  }
  const tileArc = R * size * Math.PI / 4, cell = tileArc / G;
  const out = [];
  const flora = body.type === 'planet' ? null : MOON_FLORA;
  // candidates per kind, then accept by the local biome weight
  const kinds = new Map(), prof = floraProfile(body), fk = FLORA_SCALE[prof] || 1;
  if (flora) for (const [k, d] of flora) kinds.set(k, d);
  else for (const b in FLORA) for (const [k0, d] of FLORA[b]) {
    const k = swapKind(prof, k0);
    if (k) kinds.set(k, Math.max(kinds.get(k) || 0, ROCKY.has(k) ? d : d * fk));
  }
  const formK = FORMATIONS[body.name];
  if (formK) { kinds.set('pillar', 0.00012 * formK); kinds.set('arch', 0.00003 * formK); }
  const area = tileArc * tileArc, grassK = detail().grass;
  for (const [kind, maxD] of kinds) {
    const isGrass = kind === 'grass' || kind === 'aliengrass';
    let count = maxD * area * (isGrass ? grassK : 1);
    count = Math.floor(count) + (rnd() < count % 1 ? 1 : 0);
    for (let c = 0; c < count; c++) {
      const u = rnd(), v = rnd(), gi = Math.min(G - 1, u * G | 0), gj = Math.min(G - 1, v * G | 0), fu = u * G - gi, fv = v * G - gj;
      const k00 = gj * (G + 1) + gi, k10 = k00 + 1, k01 = k00 + G + 1, k11 = k01 + 1;
      const h = lerp(lerp(gh[k00], gh[k10], fu), lerp(gh[k01], gh[k11], fu), fv);
      const slope = 1 - Math.min(1, Math.hypot(gh[k10] - gh[k00], gh[k01] - gh[k00]) / cell);
      // how much this kind belongs here
      let dens = 0;
      if (flora) dens = maxD;
      else {
        const bw = gw[fu < 0.5 ? (fv < 0.5 ? k00 : k01) : (fv < 0.5 ? k10 : k11)];
        for (const b in FLORA) for (const [k, d] of FLORA[b]) if (swapKind(prof, k) === kind) dens += d * bw[b] * (ROCKY.has(kind) ? 1 : fk);
        if (kind === 'pillar' || kind === 'arch') dens = maxD * (bw[B_DESERT] + bw[B_HIGH] + bw[B_ALIEN]);
      }
      if (rnd() * maxD > dens) continue;
      const K = KINDS[kind];
      if (h < (ROCKY.has(kind) ? -0.8 : 0.25) && w.hasSea) continue;
      if (!ROCKY.has(kind) && slope < (K.up ? 0.88 : 0.72)) continue;
      dirFromParam(F, a0 + size * u, b0 + size * v, _sd);
      const pos = _sd.clone().multiplyScalar(R + (isGrass ? h : groundH(_sd)) - (ROCKY.has(kind) ? 0.1 : 0.05));
      if (pos.distanceTo(w.landerPos) < LANDER_R + 5) continue;
      if (w.spots.some(sp => sp.pos.distanceTo(pos) < 4)) continue;
      const s = K.s[0] + rnd() * (K.s[1] - K.s[0]), variants = MODELS[K.model || kind];
      const vi = Math.floor(rnd() * variants.length);
      // orientation: stand up along the local "up", spin, and tilt rocks
      _sq.setFromUnitVectors(Y_AXIS, _sd);
      _sy.setFromAxisAngle(Y_AXIS, rnd() * Math.PI * 2);
      _sq.multiply(_sy);
      if (K.tumble) _sq.multiply(_sy.setFromAxisAngle(_st.set(rnd() - 0.5, 0, rnd() - 0.5).normalize(), (rnd() - 0.5) * 0.6 * K.tumble));
      else if (!K.up) _sq.multiply(_sy.setFromAxisAngle(_st.set(rnd() - 0.5, 0, rnd() - 0.5).normalize(), (rnd() - 0.5) * 0.25));
      _ss.set(s, kind === 'pillar' ? s * (0.8 + rnd() * 0.5) : s, s);
      const mat = new Float32Array(16);
      _sm.compose(pos, _sq, _ss).toArray(mat);
      // tint: plants take the biome colour, rocks the planet's rock colour
      const tint = isGrass || !ROCKY.has(kind) ? floraTint(body, gw.length ? gw[k00] : null, rnd, kind) : rockTint(body, rnd);
      const it = { kind, vi, mat, tint, pos, big: !isGrass, far: K.far || 1 };
      it.colls = sceneryColliders(kind, K, variants[vi], pos, _sq, s, _ss.y);
      out.push(it);
    }
  }
  return out;
}
function floraTint(body, bw, rnd, kind) {
  const v = 0.85 + rnd() * 0.3;
  if (!bw) return [v, v, v];
  // shift towards the planet's biome colour so plants match the land they grow on
  let r = 0, g = 0, b = 0;
  const S = biomeSet(body);
  for (let i = 0; i < NB; i++) if (bw[i] > 0.01) { const c = hsl2rgb(S.col[i][0], Math.min(100, S.col[i][1] + 15), 55); r += c[0] * bw[i]; g += c[1] * bw[i]; b += c[2] * bw[i]; }
  const k = kind === 'bulbs' || kind === 'tubes' || kind === 'shroom' ? 0.25 : 0.6;
  const m = Math.max(r, g, b, 0.01);
  return [lerp(1, r / m * 1.1, k) * v, lerp(1, g / m * 1.1, k) * v, lerp(1, b / m * 1.1, k) * v];
}
function rockTint(body, rnd) {
  const c = body.type === 'planet' ? (biomeSet(body).has[B_HIGH] ? biomeSet(body).col[B_HIGH] : body.col.rocky) : body.col.rock;
  // the rock texture is mid grey, so the tint is the rock colour scaled up (capped so rocks never glare)
  const rgb = hsl2rgb(c[0], c[1], clamp(c[2] + 10, 25, 62)), v = 0.85 + rnd() * 0.3, k = 1.35 * v;
  return [Math.min(1.3, rgb[0] * k), Math.min(1.3, rgb[1] * k), Math.min(1.3, rgb[2] * k)];
}

// ---- streaming ----
function tileKey(f, x, y) { return f * 1e8 + x * 1e4 + y; }
function wantedTiles(w, radius) {
  const n = 1 << SCN.level, step = w.R * (2 / n) * Math.PI / 4 * 0.7, up = player.up, t1 = tangentOf(up, new THREE.Vector3()), t2 = up.clone().cross(t1);
  const keys = new Map(), m = Math.ceil(radius / step);
  for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) {
    if ((a * a + b * b) * step * step > radius * radius) continue;
    _sd.copy(up).multiplyScalar(w.R).addScaledVector(t1, a * step).addScaledVector(t2, b * step).normalize();
    const p = faceParam(_sd), x = clamp(Math.floor((p.s + 1) / 2 * n), 0, n - 1), y = clamp(Math.floor((p.t + 1) / 2 * n), 0, n - 1);
    const k = tileKey(p.f, x, y);
    if (!keys.has(k)) keys.set(k, [p.f, x, y, Math.hypot(a, b)]);
  }
  return keys;
}
function updateScenery(w, budgetMs = 3) {
  if (!SCN.group) return;
  NATURE_U.uTime.value = performance.now() / 1000 % 10000;
  if (IMP.mat) IMP.mat.userData.U.uLight.value = clamp(w.ambient.intensity * 1.1 + w.sun.intensity * 0.75, 0.05, 1.2);
  const D = detail();
  const moved = SCN.last.distanceTo(player.pos);
  if (moved > 5 || SCN.dirty) {
    const want = wantedTiles(w, D.treeR);
    SCN.want = want;
    SCN.queue = [...want].filter(([k]) => !SCN.tiles.has(k)).sort((a, b) => a[1][3] - b[1][3]);
    for (const k of SCN.tiles.keys()) if (!want.has(k)) SCN.tiles.delete(k);
    SCN.last.copy(player.pos);
    SCN.dirty = true;
  }
  const t0 = performance.now();
  while (SCN.queue.length && performance.now() - t0 < budgetMs) {
    const [k, [f, x, y]] = SCN.queue.shift();
    SCN.tiles.set(k, genTile(w, f, x, y));
    SCN.dirty = true;
  }
  if (SCN.dirty) { rebuildInstances(w); SCN.dirty = false; }
}
// one instanced mesh per model, detail level and quarter around the player (quarters behind the
// camera are frustum-culled as a whole: each mesh gets a bounding sphere around its instances)
function bucket(kind, vi, lo, quad, part = -1) {
  const key = kind + vi + (lo ? 'L' : 'H') + quad + 'p' + part;
  let B = SCN.meshes.get(key);
  if (!B) {
    const K = KINDS[kind], V = MODELS[K.model || kind][vi];
    const near = (K.far || 1) < 1;
    // real (glTF) models come in parts with their own textured materials
    const src = part >= 0 ? V.hi[part].geo : V[lo ? 'lo' : 'hi'];
    const mat = part >= 0 ? V.hi[part].mat : ROCKY.has(kind) ? (near ? ROCK_NEAR_MAT : ROCK_MAT) : (kind === 'grass' || kind === 'aliengrass') ? GRASS_MAT : (near ? FOLIAGE_NEAR_MAT : FOLIAGE_MAT);
    // a geometry of our own (sharing the model's buffers) so this mesh can have its own bounds
    const geo = new THREE.BufferGeometry();
    geo.index = src.index;
    for (const a in src.attributes) geo.setAttribute(a, src.attributes[a]);
    B = { key, src, geo, mat, list: [], mesh: null, cap: 0, rad: src.boundingSphere.radius, shadow: !lo && kind !== 'grass' && kind !== 'aliengrass' && kind !== 'rock' };
    SCN.meshes.set(key, B);
  }
  return B;
}
const _bs = new THREE.Box3();
function rebuildInstances(w) {
  const D = detail(), P = player.pos, up = player.up, t1 = tangentOf(up, _sd), impD = D.loD * 1.7;
  const t2x = up.y * t1.z - up.z * t1.y, t2y = up.z * t1.x - up.x * t1.z, t2z = up.x * t1.y - up.y * t1.x;
  for (const B of SCN.meshes.values()) B.list.length = 0;
  const impList = [];
  SCN.colliders.length = 0;
  const builds = w.buildings || [];
  for (const items of SCN.tiles.values()) for (const it of items) {
    const d = it.pos.distanceTo(P);
    if (it.big ? d > D.treeR * it.far : d > D.grassR) continue;
    // keep clear of anything you have built
    let blocked = false;
    for (const b of builds) if (b.pos.distanceTo(it.pos) < b.def.fp + (it.big ? 1.5 : 0.4)) { blocked = true; break; }
    if (blocked) continue;
    if (it.colls && d < 45) for (const c of it.colls) SCN.colliders.push(c);
    const V = MODELS[KINDS[it.kind].model || it.kind][it.vi];
    if (!V) continue;
    // real models are detailed, so they switch to cut-outs sooner
    if (it.big && d > (V.glb ? D.loD * 0.5 : impD) && IMP.tex && IMP.cells[it.kind + it.vi]) { impList.push(it); continue; }
    const lo = it.big ? d > D.loD : d > D.grassR * 0.55;
    if (V.glb) { for (let p = 0; p < V.hi.length; p++) bucket(it.kind, it.vi, false, 0, p).list.push(it); continue; }
    const dx = it.pos.x - P.x, dy = it.pos.y - P.y, dz = it.pos.z - P.z;
    // only grass (thousands of copies) is split into quarters; for the rest the extra draw calls cost more than they save
    const quad = it.big ? 0 : (dx * t1.x + dy * t1.y + dz * t1.z > 0 ? 1 : 0) + (dx * t2x + dy * t2y + dz * t2z > 0 ? 2 : 0);
    bucket(it.kind, it.vi, lo, quad).list.push(it);
  }
  for (const B of SCN.meshes.values()) {
    const n = B.list.length;
    if (n > B.cap) { // grow the instanced mesh
      if (B.mesh) { SCN.group.remove(B.mesh); B.mesh.dispose(); }
      B.cap = Math.max(16, Math.ceil(n * 1.5));
      B.mesh = new THREE.InstancedMesh(B.geo, B.mat, B.cap);
      B.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(B.cap * 3), 3);
      B.mesh.castShadow = B.shadow && D.treeShadows;
      B.mesh.receiveShadow = true;
      SCN.group.add(B.mesh);
    }
    if (!B.mesh) continue;
    const im = B.mesh.instanceMatrix.array, ic = B.mesh.instanceColor.array;
    _bs.makeEmpty();
    let maxS = 1;
    for (let i = 0; i < n; i++) {
      const it = B.list[i];
      im.set(it.mat, i * 16); ic.set(it.tint, i * 3);
      _bs.expandByPoint(it.pos);
      maxS = Math.max(maxS, Math.abs(it.mat[5]) + Math.abs(it.mat[4]) + Math.abs(it.mat[6]));
    }
    B.mesh.count = n;
    B.mesh.visible = n > 0;
    if (n) { B.geo.boundingSphere = B.geo.boundingSphere || new THREE.Sphere(); _bs.getBoundingSphere(B.geo.boundingSphere); B.geo.boundingSphere.radius += B.rad * maxS; }
    B.mesh.instanceMatrix.needsUpdate = true;
    B.mesh.instanceColor.needsUpdate = true;
  }
  rebuildImpostors(impList, D);
  sceneryFade();
}
// far trees: one instanced mesh of camera-facing cut-outs for all kinds
function rebuildImpostors(list, D) {
  const n = list.length;
  if (!IMP.tex) return;
  let M = SCN.imp;
  if (!M || n > M.cap) {
    if (M && M.mesh) { SCN.group.remove(M.mesh); M.mesh.dispose(); }
    const cap = Math.max(64, Math.ceil(n * 1.5)), geo = new THREE.BufferGeometry();
    geo.index = IMP.geo.index;
    for (const a in IMP.geo.attributes) geo.setAttribute(a, IMP.geo.attributes[a]);
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    const mesh = new THREE.InstancedMesh(geo, IMP.mat, cap);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.frustumCulled = false;
    SCN.group.add(mesh);
    M = SCN.imp = { mesh, cap, geo };
  }
  const im = M.mesh.instanceMatrix.array, ic = M.mesh.instanceColor.array, ac = M.geo.attributes.aCell.array;
  for (let i = 0; i < n; i++) {
    const it = list[i], cell = IMP.cells[it.kind + it.vi];
    im.set(it.mat, i * 16); ic.set(it.tint, i * 3);
    ac[i * 4] = cell.u; ac[i * 4 + 1] = cell.v; ac[i * 4 + 2] = cell.w; ac[i * 4 + 3] = cell.y0;
  }
  M.mesh.count = n;
  M.mesh.instanceMatrix.needsUpdate = M.mesh.instanceColor.needsUpdate = M.geo.attributes.aCell.needsUpdate = true;
  IMP.mat.userData.U.uFadeFar.value = D.treeR;
}
// fade distances per material (grass close, small things mid-way, trees and big rocks far)
function sceneryFade() {
  const D = detail();
  GRASS_MAT.userData.U.uFadeFar.value = D.grassR;
  FOLIAGE_MAT.userData.U.uFadeFar.value = ROCK_MAT.userData.U.uFadeFar.value = D.treeR;
  FOLIAGE_NEAR_MAT.userData.U.uFadeFar.value = D.treeR * 0.6;
  ROCK_NEAR_MAT.userData.U.uFadeFar.value = D.treeR * 0.45;
}

// ---- collisions ----
// Every tree trunk, rock, boulder, slab, pillar and arch leg is a short upright cylinder: from the
// side it pushes you out, and low rocks (top within a step or a jump) can be climbed and stood on.
const NO_TOP = 1e6;
function sceneryColliders(kind, K, model, pos, q, s, sy) {
  const out = [], base = pos.length(), add = (p, r, top) => out.push({ pos: p, r, top, base });
  if (K.coll && !ROCKY.has(kind)) add(pos, K.coll * s, NO_TOP);                 // trunks, cacti, mushroom stems
  else if (kind === 'pillar') add(pos, 0.13 * s, NO_TOP);
  else if (kind === 'arch') for (const t of [-0.5, 0.5]) add(pos.clone().add(_st.set(t * s, 0, 0).applyQuaternion(q)), 0.14 * s, NO_TOP);
  else if (ROCKY.has(kind)) {
    const e = model.ext, top = e.top * sy;
    if (top < 0.3) return null;                                                 // pebbles: just step over them
    if (kind === 'slab') // long rocks: three overlapping circles along their length
      for (const t of [-0.6, 0, 0.6]) add(pos.clone().add(_st.set(0, 0, t * e.rz * s).applyQuaternion(q)), e.rx * s * 0.9, top);
    else add(pos, Math.max(e.rx, e.rz) * s * 0.85, top);
  }
  return out.length ? out : null;
}
// call with the player's position before ground contact: pushes out of anything you walk into and
// returns the radius of the top of a rock you are standing on (0 if none)
function sceneryContact(pos, up, rad = 0.3, vel = player.vel) {
  let floor = 0;
  for (const c of SCN.colliders) {
    _st.subVectors(pos, c.pos);
    const h = _st.dot(up);
    _st.addScaledVector(up, -h); // horizontal offset
    const d = _st.length(), r = c.r + rad;
    if (d >= r) continue;
    if (h >= c.top - 0.45) { floor = Math.max(floor, c.base + c.top); continue; } // on top (or stepping up)
    if (h < -1) continue;                                                          // well below it (caves, overhangs)
    if (d < 1e-4) tangentOf(up, _st).multiplyScalar(1e-4); // dead centre: push out any way
    const dd = Math.max(d, 1e-4);
    pos.addScaledVector(_st, (r - dd) / dd);
    const vn = vel.dot(_st) / dd;
    if (vn < 0) vel.addScaledVector(_st, -vn / dd);
  }
  return floor;
}

function disposeScenery() {
  for (const B of SCN.meshes.values()) if (B.mesh) B.mesh.dispose();
  SCN.meshes.clear(); SCN.tiles.clear(); SCN.group = null;
  if (SCN.imp) { SCN.imp.mesh.dispose(); SCN.imp = null; }
}
