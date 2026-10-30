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
}

function makeNode(w, f, level, x, y) {
  const size = 2 / (1 << level), a0 = -1 + x * size, b0 = -1 + y * size;
  const dir = dirFromParam(FACES[f], a0 + size / 2, b0 + size / 2, new THREE.Vector3());
  const arc = w.R * size * Math.PI / 4;
  const h = groundH(dir);
  return { f, level, x, y, a0, b0, size, dir, arc, center: dir.clone().multiplyScalar(w.R + h), bound: arc * 0.75, children: null, mesh: null, sea: null, prio: 0 };
}

function buildChunk(w, node) {
  const N = CH_N, B = N + 3, body = w.body, R = w.R, F = FACES[node.f];
  const H = new Float32Array(B * B), D = new Float32Array(B * B * 3);
  for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
    dirFromParam(F, node.a0 + node.size * (i - 1) / N, node.b0 + node.size * (j - 1) / N, _td);
    const k = j * B + i;
    H[k] = groundH(_td);
    D[k * 3] = _td.x; D[k * 3 + 1] = _td.y; D[k * 3 + 2] = _td.z;
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
    else { const b = biomeOf(body, h, dv); cl = colorOf(body, b, h, dv, sl); lw = moonLayers(body, dv, b, h, sl); }
    for (let q = 0; q < 9; q++) W[q / 3 | 0][v * 3 + q % 3] = lw[q];
    col[v * 3] = cl[0]; col[v * 3 + 1] = cl[1]; col[v * 3 + 2] = cl[2];
  }
  // skirts hide cracks where a detailed chunk meets a coarser neighbour
  const skirt = Math.max(1.5, node.arc / N * 0.6);
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
  const idx = [], flip = FACE_FLIP[node.f];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const q0 = j * (N + 1) + i, q1 = q0 + 1, q2 = q0 + N + 1, q3 = q2 + 1;
    if (flip) idx.push(q0, q2, q1, q1, q2, q3); else idx.push(q0, q1, q2, q1, q3, q2);
  }
  const cen = node.center;
  for (let s = 0; s < NS; s++) {
    const v0 = edge[s], v1 = edge[(s + 1) % NS], s0 = NV + s, s1 = NV + (s + 1) % NS;
    // wind each skirt quad so it faces away from the chunk centre
    a.set(pos[v1 * 3] - pos[v0 * 3], pos[v1 * 3 + 1] - pos[v0 * 3 + 1], pos[v1 * 3 + 2] - pos[v0 * 3 + 2]);
    b.set(pos[s0 * 3] - pos[v0 * 3], pos[s0 * 3 + 1] - pos[v0 * 3 + 1], pos[s0 * 3 + 2] - pos[v0 * 3 + 2]);
    c.set(pos[v0 * 3] - cen.x, pos[v0 * 3 + 1] - cen.y, pos[v0 * 3 + 2] - cen.z);
    if (a.cross(b).dot(c) > 0) idx.push(v0, v1, s0, v1, s1, s0); else idx.push(v0, s0, v1, v1, s0, s1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  W.forEach((A, q) => geo.setAttribute('aW' + q, new THREE.BufferAttribute(A, 3)));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, w.terrain.mat);
  mesh.receiveShadow = true;
  mesh.visible = false;
  node.mesh = mesh;
  node.minH = minH; node.maxH = maxH;
  node.center.copy(node.dir).multiplyScalar(R + (minH + maxH) / 2);
  node.bound = node.arc * 0.75 + (maxH - minH) / 2;
  w.terrain.group.add(mesh);

  if (w.hasSea && minH < 0.5) node.sea = buildSea(w, node, H, B);
  w.terrain.built.add(node);
  w.terrain.chunks++;
}

// water sheet at sea level on the same grid as the chunk, with the water depth at each vertex
function buildSea(w, node, H, B) {
  const N = CH_N, F = FACES[node.f], R = w.R;
  const pos = new Float32Array((N + 1) * (N + 1) * 3), dep = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    dirFromParam(F, node.a0 + node.size * i / N, node.b0 + node.size * j / N, _td);
    const v = j * (N + 1) + i;
    pos[v * 3] = _td.x * R; pos[v * 3 + 1] = _td.y * R; pos[v * 3 + 2] = _td.z * R;
    dep[v] = -H[(j + 1) * B + (i + 1)];
  }
  const idx = [], flip = FACE_FLIP[node.f];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const q0 = j * (N + 1) + i, q1 = q0 + 1, q2 = q0 + N + 1, q3 = q2 + 1;
    if (Math.max(dep[q0], dep[q1], dep[q2], dep[q3]) < -0.6) continue; // dry land: no water here
    if (flip) idx.push(q0, q2, q1, q1, q2, q3); else idx.push(q0, q1, q2, q1, q3, q2);
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, w.terrain.seaMat);
  m.visible = false;
  m.renderOrder = 1;
  w.terrain.group.add(m);
  return m;
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

function updateTerrain(w, cam, budgetMs = detail().budget) {
  const T = w.terrain;
  T.frame++;
  T.R = w.R;
  T.camDir = (T.camDir || new THREE.Vector3()).copy(cam).normalize();
  T.camHorizon = Math.acos(clamp(w.R / Math.max(w.R + 1, cam.length()), -1, 1));
  for (const r of T.roots) selectNode(w, r, cam);
  for (const n of T.built) if (n.shown !== T.frame) { n.mesh.visible = false; if (n.sea) n.sea.visible = false; }
  // build the most urgent chunks first, within the time budget
  if (!T.queue.size) return 0;
  const list = [...T.queue].filter(n => !n.dead).sort((x, y) => x.prio - y.prio);
  const t0 = performance.now();
  let built = 0;
  for (const n of list) {
    if (performance.now() - t0 > budgetMs) break;
    T.queue.delete(n);
    if (!n.mesh && !n.dead) { buildChunk(w, n); built++; }
  }
  return built;
}

// block until the area around `cam` is fully detailed (used right after landing)
function warmTerrain(w, cam, maxMs = 2500) {
  const t0 = performance.now();
  for (let i = 0; i < 60 && performance.now() - t0 < maxMs; i++) {
    if (!updateTerrain(w, cam, maxMs)) break;
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
