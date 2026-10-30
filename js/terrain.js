'use strict';
// ---------- streaming terrain: cube-sphere quadtree with level of detail ----------
// Each cube face is a quadtree. Chunks close to the camera split into smaller, more detailed
// chunks; far ones stay coarse. Chunks are built a few per frame within a time budget.
// how fine the most detailed chunks are, how eagerly chunks split, and the build budget
// all come from the Detail option (see DETAIL in render.js)
const CH_N = 16;              // quads per chunk side

const _td = new THREE.Vector3();
function dirFromParam(F, s, t, out) {
  return out.copy(F.n).addScaledVector(F.u, Math.tan(s * Math.PI / 4)).addScaledVector(F.v, Math.tan(t * Math.PI / 4)).normalize();
}
// which way the triangles have to be wound on each face so they face outward
const FACE_FLIP = FACES.map(F => new THREE.Vector3().copy(F.u).cross(F.v).dot(F.n) < 0);

function initTerrain(w) {
  const R = w.R;
  const D = detail();
  const maxLevel = Math.max(3, Math.ceil(Math.log2(R * Math.PI / 2 / (CH_N * D.leaf))));
  // lit per pixel with smooth normals, so the ground never looks faceted
  const mat = makeGroundMaterial();
  const seaMat = w.hasSea ? makeWaterMaterial(w.body) : null;
  const group = new THREE.Group();
  w.scene.add(group);
  w.terrain = { maxLevel, mat, seaMat, group, queue: new Set(), built: new Set(), frame: 0, chunks: 0, detailKey: opts.quality };
  w.terrain.roots = FACES.map((F, f) => makeNode(w, f, 0, 0, 0));
  for (const r of w.terrain.roots) buildChunk(w, r);
  terrainWorkersFor(w);
}

function makeNode(w, f, level, x, y) {
  const size = 2 / (1 << level), a0 = -1 + x * size, b0 = -1 + y * size;
  const dir = dirFromParam(FACES[f], a0 + size / 2, b0 + size / 2, new THREE.Vector3());
  const arc = w.R * size * Math.PI / 4;
  const h = groundH(dir);
  return { f, level, x, y, a0, b0, size, dir, arc, center: dir.clone().multiplyScalar(w.R + h), bound: arc * 0.75, children: null, mesh: null, sea: null, prio: 0 };
}

// Everything a chunk needs, as plain typed arrays: positions, smooth normals, colours, texture
// layer weights and (on planets) the water sheet. Pure function of the body, so it can run in a
// Web Worker (terrainworker.js) as well as on the main thread.
function computeChunk(body, R, hasSea, f, a0, b0, size, arc, cx, cy, cz) {
  const N = CH_N, B = N + 3, F = FACES[f];
  const H = new Float32Array(B * B), D = new Float32Array(B * B * 3), d = new THREE.Vector3();
  for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
    dirFromParam(F, a0 + size * (i - 1) / N, b0 + size * (j - 1) / N, d);
    const k = j * B + i;
    H[k] = heightAt(body, d);
    D[k * 3] = d.x; D[k * 3 + 1] = d.y; D[k * 3 + 2] = d.z;
  }
  const P = (k, o) => { const r = R + H[k]; o.set(D[k * 3] * r, D[k * 3 + 1] * r, D[k * 3 + 2] * r); return o; };
  const NV = (N + 1) * (N + 1), NS = 4 * N;
  const pos = new Float32Array((NV + NS) * 3), nor = new Float32Array((NV + NS) * 3), col = new Float32Array((NV + NS) * 3);
  const W = [0, 1, 2].map(() => new Float32Array((NV + NS) * 3));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), n = new THREE.Vector3(), dv = new THREE.Vector3();
  let minH = Infinity, maxH = -Infinity;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = (j + 1) * B + (i + 1), v = j * (N + 1) + i;
    P(k, a);
    pos[v * 3] = a.x; pos[v * 3 + 1] = a.y; pos[v * 3 + 2] = a.z;
    // smooth normal from neighbouring heights (border row keeps seams between chunks consistent)
    P(k + 1, b).sub(P(k - 1, c));
    P(k + B, e).sub(P(k - B, c));
    n.copy(b).cross(e).normalize();
    dv.set(D[k * 3], D[k * 3 + 1], D[k * 3 + 2]);
    if (n.dot(dv) < 0) n.negate();
    nor[v * 3] = n.x; nor[v * 3 + 1] = n.y; nor[v * 3 + 2] = n.z;
    const h = H[k];
    minH = Math.min(minH, h); maxH = Math.max(maxH, h);
    const sl = n.dot(dv);
    let cl, lw;
    if (body.type === 'planet') { cl = planetGroundColor(body, dv, h, sl); lw = planetLayers(body, h, sl, _gf); }
    else { const bi = biomeOf(body, h, dv); cl = colorOf(body, bi, h, dv, sl); lw = moonLayers(body, dv, bi, h, sl); }
    for (let q = 0; q < 9; q++) W[q / 3 | 0][v * 3 + q % 3] = lw[q];
    // ambient occlusion: hollows and valley floors (lower than their surroundings) get less sky light
    const curv = ((H[k + 1] + H[k - 1] + H[k + B] + H[k - B]) / 4 - h) / (arc / N);
    const ao = 1 - clamp(curv * 1.6, 0, 0.32);
    col[v * 3] = cl[0] * ao; col[v * 3 + 1] = cl[1] * ao; col[v * 3 + 2] = cl[2] * ao;
  }
  // skirts hide cracks where a detailed chunk meets a coarser neighbour
  const skirt = Math.max(1.5, arc / N * 0.6);
  const edge = [];
  for (let i = 0; i < N; i++) edge.push(i);                             // bottom row, left to right
  for (let j = 0; j < N; j++) edge.push(j * (N + 1) + N);               // right column, bottom to top
  for (let i = N; i > 0; i--) edge.push(N * (N + 1) + i);               // top row, right to left
  for (let j = N; j > 0; j--) edge.push(j * (N + 1));                   // left column, top to bottom
  edge.forEach((v, s) => {
    const o = NV + s;
    a.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    const l = a.length();
    a.multiplyScalar((l - skirt) / l);
    pos[o * 3] = a.x; pos[o * 3 + 1] = a.y; pos[o * 3 + 2] = a.z;
    for (let q = 0; q < 3; q++) { nor[o * 3 + q] = nor[v * 3 + q]; col[o * 3 + q] = col[v * 3 + q]; for (const A of W) A[o * 3 + q] = A[v * 3 + q]; }
  });
  const idx = new Uint16Array(N * N * 6 + NS * 6), flip = FACE_FLIP[f];
  let ii = 0;
  const push = (...q) => { for (const x of q) idx[ii++] = x; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const q0 = j * (N + 1) + i, q1 = q0 + 1, q2 = q0 + N + 1, q3 = q2 + 1;
    if (flip) push(q0, q2, q1, q1, q2, q3); else push(q0, q1, q2, q1, q3, q2);
  }
  for (let s = 0; s < NS; s++) {
    const v0 = edge[s], v1 = edge[(s + 1) % NS], s0 = NV + s, s1 = NV + (s + 1) % NS;
    // wind each skirt quad so it faces away from the chunk centre
    a.set(pos[v1 * 3] - pos[v0 * 3], pos[v1 * 3 + 1] - pos[v0 * 3 + 1], pos[v1 * 3 + 2] - pos[v0 * 3 + 2]);
    b.set(pos[s0 * 3] - pos[v0 * 3], pos[s0 * 3 + 1] - pos[v0 * 3 + 1], pos[s0 * 3 + 2] - pos[v0 * 3 + 2]);
    c.set(pos[v0 * 3] - cx, pos[v0 * 3 + 1] - cy, pos[v0 * 3 + 2] - cz);
    if (a.cross(b).dot(c) > 0) push(v0, v1, s0, v1, s1, s0); else push(v0, s0, v1, v1, s0, s1);
  }
  const out = { pos, nor, col, w0: W[0], w1: W[1], w2: W[2], idx, minH, maxH, sea: null };
  // water sheet at sea level on the same grid, with the water depth at each vertex
  if (hasSea && minH < 0.5) {
    const sp = new Float32Array(NV * 3), dep = new Float32Array(NV), sidx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const v = j * (N + 1) + i, k = (j + 1) * B + (i + 1);
      sp[v * 3] = D[k * 3] * R; sp[v * 3 + 1] = D[k * 3 + 1] * R; sp[v * 3 + 2] = D[k * 3 + 2] * R;
      dep[v] = -H[k];
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q0 = j * (N + 1) + i, q1 = q0 + 1, q2 = q0 + N + 1, q3 = q2 + 1;
      if (Math.max(dep[q0], dep[q1], dep[q2], dep[q3]) < -0.6) continue; // dry land: no water here
      if (flip) sidx.push(q0, q2, q1, q1, q2, q3); else sidx.push(q0, q1, q2, q1, q3, q2);
    }
    if (sidx.length) out.sea = { pos: sp, dep, idx: Uint16Array.from(sidx) };
  }
  return out;
}
const chunkBuffers = d => [d.pos, d.nor, d.col, d.w0, d.w1, d.w2, d.idx].concat(d.sea ? [d.sea.pos, d.sea.dep, d.sea.idx] : []).map(a => a.buffer);

// turn computed chunk data into meshes
function chunkFromData(w, node, d) {
  const geo = new THREE.BufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(d.idx, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
  geo.setAttribute('aW0', new THREE.BufferAttribute(d.w0, 3));
  geo.setAttribute('aW1', new THREE.BufferAttribute(d.w1, 3));
  geo.setAttribute('aW2', new THREE.BufferAttribute(d.w2, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, w.terrain.mat);
  mesh.receiveShadow = true;
  mesh.visible = false;
  node.mesh = mesh;
  node.minH = d.minH; node.maxH = d.maxH;
  node.center.copy(node.dir).multiplyScalar(w.R + (d.minH + d.maxH) / 2);
  node.bound = node.arc * 0.75 + (d.maxH - d.minH) / 2;
  w.terrain.group.add(mesh);
  if (d.sea) {
    const g = new THREE.BufferGeometry();
    g.setIndex(new THREE.BufferAttribute(d.sea.idx, 1));
    g.setAttribute('position', new THREE.BufferAttribute(d.sea.pos, 3));
    g.setAttribute('aDepth', new THREE.BufferAttribute(d.sea.dep, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, w.terrain.seaMat);
    m.visible = false;
    m.renderOrder = 1;
    w.terrain.group.add(m);
    node.sea = m;
  }
  w.terrain.built.add(node);
  w.terrain.chunks++;
}
const chunkArgs = (w, n) => [w.R, w.hasSea, n.f, n.a0, n.b0, n.size, n.arc, n.center.x, n.center.y, n.center.z];
function buildChunk(w, node) { chunkFromData(w, node, computeChunk(w.body, ...chunkArgs(w, node))); }

// ---- background builders ----
// Two workers compute chunks off the main thread, so walking into new terrain doesn't stutter.
// (If workers aren't available, e.g. opened from a file, chunks are built in-frame as before.)
const TW = { pool: [], ok: false, gen: 0, waiting: new Map(), nextId: 1 };
function initTerrainWorkers() {
  if (typeof Worker === 'undefined' || location.protocol === 'file:') return;
  try {
    for (let i = 0; i < 2; i++) {
      const wk = new Worker(`js/terrainworker.js?v=${ASSET_V}`);
      wk.busy = 0;
      wk.onmessage = ev => {
        const m = ev.data;
        wk.busy--;
        const node = TW.waiting.get(m.id);
        TW.waiting.delete(m.id);
        if (!node || m.gen !== TW.gen || node.dead || node.mesh || !world || !world.terrain) return;
        node.pending = false;
        chunkFromData(world, node, m.data);
      };
      wk.onerror = () => { TW.ok = false; };
      TW.pool.push(wk);
    }
    TW.ok = true;
  } catch (e) { TW.ok = false; }
}
function terrainWorkersFor(w) {
  if (!TW.ok) return;
  TW.gen++;
  TW.waiting.clear();
  for (const wk of TW.pool) { wk.busy = 0; wk.postMessage({ type: 'body', id: w.body.id, gen: TW.gen }); }
}
function sendToWorker(w, node) {
  let best = null;
  for (const wk of TW.pool) if (wk.busy < 3 && (!best || wk.busy < best.busy)) best = wk;
  if (!best) return false;
  node.pending = true;
  node.wid = TW.nextId++;
  TW.waiting.set(node.wid, node);
  best.busy++;
  best.postMessage({ type: 'chunk', id: node.wid, gen: TW.gen, args: chunkArgs(w, node) });
  return true;
}

function freeNode(w, node) {
  if (node.children) { for (const c of node.children) freeNode(w, c); node.children = null; }
  w.terrain.queue.delete(node);
  if (node.mesh) { w.terrain.group.remove(node.mesh); node.mesh.geometry.dispose(); node.mesh = null; w.terrain.chunks--; }
  if (node.sea) { w.terrain.group.remove(node.sea); node.sea.geometry.dispose(); node.sea = null; }
  w.terrain.built.delete(node);
  node.dead = true;
}

// pick which chunks to draw this frame and queue missing ones
function selectNode(w, node, cam) {
  const T = w.terrain;
  const d = Math.max(0, node.center.distanceTo(cam) - node.bound);
  const canSplit = node.level < T.maxLevel, SPLIT = detail().split;
  const want = canSplit && (d < SPLIT * node.arc || (node.children && d < SPLIT * node.arc * 1.25));
  if (want) {
    if (!node.children) node.children = [0, 1, 2, 3].map(q => makeNode(w, node.f, node.level + 1, node.x * 2 + (q & 1), node.y * 2 + (q >> 1)));
    if (node.children.every(c => c.mesh)) { for (const c of node.children) selectNode(w, c, cam); return; }
    for (const c of node.children) if (!c.mesh) { c.prio = d / node.arc; T.queue.add(c); }
  } else if (node.children && node.mesh) { for (const c of node.children) freeNode(w, c); node.children = null; }
  if (node.mesh) show(T, node);
  else {
    node.prio = d / node.arc; T.queue.add(node);
    if (node.children && node.children.every(c => c.mesh)) for (const c of node.children) selectNode(w, c, cam);
  }
}
// chunks hidden behind the planet's horizon are skipped (mountain tops can still poke over it)
function show(T, node) {
  node.shown = T.frame;
  const ang = Math.acos(clamp(node.dir.dot(T.camDir), -1, 1)) - node.bound / T.R;
  const vis = ang < T.camHorizon + Math.acos(clamp(T.R / (T.R + Math.max(0, node.maxH)), -1, 1));
  node.mesh.visible = vis;
  if (node.sea) node.sea.visible = vis;
}

function updateTerrain(w, cam, budgetMs = detail().budget, sync = false) {
  const T = w.terrain;
  T.frame++;
  T.R = w.R;
  T.camDir = (T.camDir || new THREE.Vector3()).copy(cam).normalize();
  T.camHorizon = Math.acos(clamp(w.R / Math.max(w.R + 1, cam.length()), -1, 1));
  for (const r of T.roots) selectNode(w, r, cam);
  for (const n of T.built) if (n.shown !== T.frame) { n.mesh.visible = false; if (n.sea) n.sea.visible = false; }
  // build the most urgent chunks first: on the workers if we have them, else within the time budget
  if (!T.queue.size) return 0;
  const list = [...T.queue].filter(n => !n.dead && (sync || !n.pending)).sort((x, y) => x.prio - y.prio);
  const t0 = performance.now();
  let built = 0;
  for (const n of list) {
    if (n.mesh || n.dead) { T.queue.delete(n); continue; }
    if (TW.ok && !sync) { if (!sendToWorker(w, n)) break; T.queue.delete(n); continue; }
    if (performance.now() - t0 > budgetMs) break;
    T.queue.delete(n);
    buildChunk(w, n); built++;
  }
  return built;
}

// block until the area around `cam` is fully detailed (used right after landing)
function warmTerrain(w, cam, maxMs = 2500) {
  const t0 = performance.now();
  for (let i = 0; i < 60 && performance.now() - t0 < maxMs; i++) {
    if (!updateTerrain(w, cam, maxMs, true)) break;
  }
}

// the Detail option changed: throw the chunks away and rebuild at the new resolution
function resetTerrain(w) {
  const T = w.terrain;
  for (const r of T.roots) freeNode(w, r);
  w.scene.remove(T.group);
  T.mat.dispose();
  if (T.seaMat) T.seaMat.dispose();
  initTerrain(w);
}
