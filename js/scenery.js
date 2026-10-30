'use strict';
// ---------- scenery: grass, plants, trees, rocks and rock formations ----------
// The surface is cut into small tiles (cube-face grid, ~20 m). Each tile's contents are worked
// out once, deterministically, from the biome table below, and cached. Every few metres the
// tiles around the player are gathered into instanced meshes: one per model and detail level,
// so the whole landscape is a few dozen draw calls. Far things use cheaper models, and
// everything shrinks in smoothly at the edge of its draw distance (no popping).

// what grows per biome: kind, density (per m²), size range, group ('grass' or 'big')
const FLORA = {
  [B_GRASS]: [['grass', 0.5], ['bush', 0.004], ['broadleaf', 0.0018], ['rock', 0.004]],
  [B_FOREST]: [['grass', 0.18], ['broadleaf', 0.012], ['conifer', 0.008], ['bush', 0.008], ['rock', 0.003]],
  [B_DESERT]: [['cactus', 0.0015], ['drybush', 0.004], ['rock', 0.008], ['boulder', 0.0008], ['grass', 0.02]],
  [B_HIGH]: [['rock', 0.012], ['boulder', 0.002], ['slab', 0.0006], ['conifer', 0.0018], ['grass', 0.08]],
  [B_TUNDRA]: [['grass', 0.06], ['deadtree', 0.0012], ['conifer', 0.0025], ['rock', 0.006], ['boulder', 0.0005]],
  [B_SWAMP]: [['grass', 0.38], ['swamptree', 0.0028], ['bush', 0.006], ['deadtree', 0.0008]],
  [B_ALIEN]: [['aliengrass', 0.3], ['bulbs', 0.004], ['tubes', 0.005], ['shroom', 0.002], ['rock', 0.003]],
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
  rock: { s: [0.15, 0.7], far: 0.45, tumble: 1 }, boulder: { s: [1.4, 4], coll: 0.75, tumble: 1, model: 'rock' },
  slab: { s: [3, 7], coll: 0.8, tumble: 0.4 }, pillar: { s: [10, 26], coll: 0.12, up: 1 }, arch: { s: [12, 24], up: 1, arch: 1 },
};
const ROCKY = new Set(['rock', 'boulder', 'slab', 'pillar', 'arch']);

const SCN = { tiles: new Map(), level: 0, queue: [], last: new THREE.Vector3(1e9, 0, 0), meshes: new Map(), colliders: [], dirty: true };

function initScenery(w) {
  buildModels();
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
  const kinds = new Map();
  if (flora) for (const [k, d] of flora) kinds.set(k, d);
  else for (const b in FLORA) for (const [k, d] of FLORA[b]) kinds.set(k, Math.max(kinds.get(k) || 0, d));
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
        for (const b in FLORA) for (const [k, d] of FLORA[b]) if (k === kind) dens += d * bw[b];
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
      if (K.coll) it.coll = K.coll * s;
      if (K.arch) it.legs = [-0.5, 0.5].map(t => pos.clone().addScaledVector(_st.set(t * s, 0, 0).applyQuaternion(_sq), 1)), it.coll = 0.13 * s;
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
function bucket(kind, vi, lo) {
  const key = kind + vi + (lo ? 'L' : 'H');
  let B = SCN.meshes.get(key);
  if (!B) {
    const K = KINDS[kind], src = MODELS[K.model || kind][vi][lo ? 'lo' : 'hi'];
    const near = (K.far || 1) < 1;
    const mat = ROCKY.has(kind) ? (near ? ROCK_NEAR_MAT : ROCK_MAT) : (kind === 'grass' || kind === 'aliengrass') ? GRASS_MAT : (near ? FOLIAGE_NEAR_MAT : FOLIAGE_MAT);
    B = { key, src, mat, list: [], mesh: null, cap: 0, shadow: !lo && kind !== 'grass' && kind !== 'aliengrass' && kind !== 'rock' };
    SCN.meshes.set(key, B);
  }
  return B;
}
function rebuildInstances(w) {
  const D = detail(), P = player.pos;
  for (const B of SCN.meshes.values()) B.list.length = 0;
  SCN.colliders.length = 0;
  const builds = w.buildings || [];
  for (const items of SCN.tiles.values()) for (const it of items) {
    const d = it.pos.distanceTo(P);
    if (it.big ? d > D.treeR * it.far : d > D.grassR) continue;
    // keep clear of anything you have built
    let blocked = false;
    for (const b of builds) if (b.pos.distanceTo(it.pos) < b.def.fp + (it.big ? 1.5 : 0.4)) { blocked = true; break; }
    if (blocked) continue;
    const lo = it.big ? d > D.loD : d > D.grassR * 0.55;
    bucket(it.kind, it.vi, lo).list.push(it);
    if (it.coll && d < 40) {
      if (it.legs) for (const l of it.legs) SCN.colliders.push({ pos: l, r: it.coll });
      else SCN.colliders.push({ pos: it.pos, r: it.coll });
    }
  }
  for (const B of SCN.meshes.values()) {
    const n = B.list.length;
    if (n > B.cap) { // grow the instanced mesh
      if (B.mesh) { SCN.group.remove(B.mesh); B.mesh.dispose(); }
      B.cap = Math.max(16, Math.ceil(n * 1.5));
      B.mesh = new THREE.InstancedMesh(B.src, B.mat, B.cap);
      B.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(B.cap * 3), 3);
      B.mesh.frustumCulled = false;
      B.mesh.castShadow = B.shadow && D.treeShadows;
      B.mesh.receiveShadow = true;
      SCN.group.add(B.mesh);
    }
    if (!B.mesh) continue;
    const im = B.mesh.instanceMatrix.array, ic = B.mesh.instanceColor.array;
    for (let i = 0; i < n; i++) { im.set(B.list[i].mat, i * 16); ic.set(B.list[i].tint, i * 3); }
    B.mesh.count = n;
    B.mesh.instanceMatrix.needsUpdate = true;
    B.mesh.instanceColor.needsUpdate = true;
  }
  sceneryFade();
}
// fade distances per material (grass close, small things mid-way, trees and big rocks far)
function sceneryFade() {
  const D = detail();
  GRASS_MAT.userData.U.uFadeFar.value = D.grassR;
  FOLIAGE_MAT.userData.U.uFadeFar.value = ROCK_MAT.userData.U.uFadeFar.value = D.treeR;
  FOLIAGE_NEAR_MAT.userData.U.uFadeFar.value = D.treeR * 0.6;
  ROCK_NEAR_MAT.userData.U.uFadeFar.value = D.treeR * 0.45;
}

// ---- collisions: trunks, boulders and pillars push the player out ----
function collideScenery(pos, up) {
  for (const c of SCN.colliders) {
    _st.subVectors(pos, c.pos);
    _st.addScaledVector(up, -_st.dot(up)); // horizontal distance only
    const d = _st.length(), r = c.r + 0.35;
    if (d < r && d > 1e-4) {
      pos.addScaledVector(_st, (r - d) / d);
      const vn = player.vel.dot(_st) / d;
      if (vn < 0) player.vel.addScaledVector(_st, -vn / d);
    }
  }
}

function disposeScenery() {
  for (const B of SCN.meshes.values()) if (B.mesh) B.mesh.dispose();
  SCN.meshes.clear(); SCN.tiles.clear(); SCN.group = null;
}
