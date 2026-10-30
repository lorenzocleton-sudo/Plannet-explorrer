'use strict';
// ---------- procedural nature models ----------
// Everything here is built from smooth, indexed meshes (shared vertices, so normals are smooth)
// with noise displacement and vertex colours. Each geometry carries:
//   color  - base colour (multiplied by a per-instance tint)
//   aSway  - how much wind moves this vertex (0 at the roots, 1 at the tips)
//   aGlow  - self-illumination for alien plants
// Instanced copies are drawn by scenery.js; samples (collectibles) use single meshes.

// ---- small geometry toolkit ----
class GB { // geometry builder
  constructor() { this.p = []; this.c = []; this.s = []; this.g = []; this.i = []; this.n = null; }
  v(x, y, z, col, sway = 0, glow = 0) { this.p.push(x, y, z); this.c.push(col[0], col[1], col[2]); this.s.push(sway); this.g.push(glow); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  add(o) { // append another builder
    const off = this.p.length / 3;
    this.p.push(...o.p); this.c.push(...o.c); this.s.push(...o.s); this.g.push(...o.g);
    for (const k of o.i) this.i.push(k + off);
  }
  geo(normalsUp = false) {
    const g = new THREE.BufferGeometry();
    g.setIndex(this.i);
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.g, 1));
    if (normalsUp) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.p.map((_, k) => k % 3 === 1 ? 1 : 0), 3));
    else g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
const C3 = (h, s, l) => hsl2rgb(h, s, l);
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// a tube along a path of points with radii (smooth, shared vertices around each ring)
function tube(b, pts, radii, seg, col, sway, colTop = col, glow = 0, cap = true) {
  const rings = [];
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[Math.min(k + 1, pts.length - 1)], o = pts[Math.max(k - 1, 0)];
    const dir = new THREE.Vector3().subVectors(q, o).normalize();
    const side = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(dir, side).normalize(), v = new THREE.Vector3().crossVectors(dir, u);
    const t = k / (pts.length - 1), c = [lerp(col[0], colTop[0], t), lerp(col[1], colTop[1], t), lerp(col[2], colTop[2], t)];
    const ring = [];
    for (let s = 0; s < seg; s++) {
      const a = s / seg * Math.PI * 2, r = radii[k];
      ring.push(b.v(p.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r, p.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r, p.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r, c, sway(t), glow * t));
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < seg; s++) {
    const a = rings[k][s], bb = rings[k][(s + 1) % seg], c = rings[k + 1][(s + 1) % seg], d = rings[k + 1][s];
    b.quad(a, bb, c, d);
  }
  if (cap) { const last = rings[rings.length - 1], tp = pts[pts.length - 1], ci = b.v(tp.x, tp.y, tp.z, colTop, sway(1), glow); for (let s = 0; s < seg; s++) b.tri(last[s], last[(s + 1) % seg], ci); }
}
// a lumpy blob (UV sphere with noise), smooth
function blob(b, cx, cy, cz, rx, ry, rz, seed, rough, col, colTop, sway, glow = 0, seg = 9) {
  const rows = Math.max(4, seg - 3), idx = [];
  for (let j = 0; j <= rows; j++) {
    const th = j / rows * Math.PI, y = Math.cos(th), r = Math.sin(th), row = [];
    for (let i = 0; i < seg; i++) {
      const ph = i / seg * Math.PI * 2, x = Math.cos(ph) * r, z = Math.sin(ph) * r;
      const n = 1 + (fbm3(x * 1.7 + seed, y * 1.7, z * 1.7, seed | 0, 3) - 0.5) * 2 * rough;
      const t = (1 - y) / 2, c = [lerp(colTop[0], col[0], t), lerp(colTop[1], col[1], t), lerp(colTop[2], col[2], t)];
      const py = cy + y * ry * n;
      row.push(b.v(cx + x * rx * n, py, cz + z * rz * n, c, sway(py), glow));
    }
    idx.push(row);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) b.quad(idx[j][i], idx[j][(i + 1) % seg], idx[j + 1][(i + 1) % seg], idx[j + 1][i]); // wound so faces point outwards
}
// a flat leaf/blade strip from root along a bent path (double sided via the material)
function strip(b, root, dir, len, w0, w1, bend, segs, col0, col1, swayK = 1, glow = 0) {
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  let prev = null;
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    const p = root.clone().addScaledVector(dir, len * t);
    p.y += len * (Math.sin(t * Math.PI * 0.5) * 0.9 - bend * t * t);
    const w = lerp(w0, w1, t) / 2, c = [lerp(col0[0], col1[0], t), lerp(col0[1], col1[1], t), lerp(col0[2], col1[2], t)];
    const a = b.v(p.x - side.x * w, p.y, p.z - side.z * w, c, t * t * swayK, glow * t), bb = b.v(p.x + side.x * w, p.y, p.z + side.z * w, c, t * t * swayK, glow * t);
    if (prev) b.quad(prev[0], prev[1], bb, a);
    prev = [a, bb];
  }
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- trees ----
function makeConifer(seed, lo) {
  const r = mulberry32(seed), b = new GB(), H = 7 + r() * 4;
  const bark = C3(25, 30, 22), dark = C3(140, 35, 16), light = C3(120, 32, 30);
  tube(b, [V3(0, -0.4, 0), V3(0, H * 0.5, 0), V3(0, H, 0)], [0.32, 0.2, 0.05], lo ? 3 : 6, bark, t => t * 0.3, bark, 0, !lo);
  const tiers = lo ? 2 : 5, seg = lo ? 6 : 12;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers, y0 = H * (0.18 + t * 0.66), rad = (1 - t) * 2.6 + 0.6, h = H * 0.3;
    // a drooping, jagged skirt of needles
    const top = b.v(0, y0 + h, 0, light, (y0 + h) / H, 0), ring = [], inner = [];
    for (let s = 0; s < seg; s++) {
      const a = s / seg * Math.PI * 2 + r() * 0.2, rr = rad * (0.8 + r() * 0.35);
      ring.push(b.v(Math.cos(a) * rr, y0 - 0.25 - r() * 0.3, Math.sin(a) * rr, dark, y0 / H, 0));
      inner.push(b.v(Math.cos(a) * rr * 0.55, y0 + 0.15, Math.sin(a) * rr * 0.55, shade(dark, 0.8), y0 / H, 0));
    }
    for (let s = 0; s < seg; s++) { b.tri(top, ring[(s + 1) % seg], ring[s]); b.quad(ring[s], ring[(s + 1) % seg], inner[(s + 1) % seg], inner[s]); }
  }
  return b.geo();
}
function makeBroadleaf(seed, lo) {
  const r = mulberry32(seed), b = new GB(), H = 4 + r() * 3;
  const bark = C3(28, 28, 26), leaf = C3(95 + r() * 30, 40, 26), leafTop = C3(85 + r() * 25, 45, 40);
  const lean = V3((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8);
  tube(b, [V3(0, -0.4, 0), V3(lean.x * 0.3, H * 0.45, lean.z * 0.3), V3(lean.x, H, lean.z)], [0.38, 0.26, 0.16], lo ? 3 : 7, bark, t => t * t * 0.4, bark, 0, !lo);
  if (lo) { // far away: one canopy on a simple trunk
    blob(b, lean.x, H + 1.1, lean.z, 2.4, 1.9, 2.4, seed, 0.25, leaf, leafTop, y => clamp(y / (H + 2), 0, 1), 0, 6);
    return b.geo();
  }
  const blobs = 5;
  if (!lo) for (let k = 0; k < 3; k++) { // a few branches
    const a = r() * Math.PI * 2, y = H * (0.55 + r() * 0.3), L = 1.2 + r() * 1.2;
    tube(b, [V3(lean.x * 0.6, y, lean.z * 0.6), V3(Math.cos(a) * L * 0.6, y + 0.7, Math.sin(a) * L * 0.6), V3(Math.cos(a) * L, y + 1.3, Math.sin(a) * L)], [0.12, 0.08, 0.04], 5, bark, t => 0.4 + t * 0.4, bark, 0, false);
  }
  for (let k = 0; k < blobs; k++) {
    const a = k / blobs * Math.PI * 2 + r(), d = k === 0 ? 0 : 1.1 + r() * 0.9, s = 1.4 + r() * 0.9;
    blob(b, lean.x + Math.cos(a) * d, H + 0.6 + r() * 1.2 - d * 0.3, lean.z + Math.sin(a) * d, s, s * 0.8, s, seed + k * 13, 0.32, leaf, leafTop, y => clamp(y / (H + 2), 0, 1), 0, 9);
  }
  return b.geo();
}
function makeSwampTree(seed, lo) { // drooping palm-like tree with a bent trunk
  const r = mulberry32(seed), b = new GB(), H = 5 + r() * 3, bark = C3(35, 25, 30), leaf = C3(100, 35, 24), tip = C3(80, 45, 38);
  const bx = (r() - 0.5) * 2.5, bz = (r() - 0.5) * 2.5, pts = [], rad = [];
  for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(V3(bx * t * t, -0.4 + H * t, bz * t * t)); rad.push(0.3 - t * 0.17); }
  tube(b, pts, rad, lo ? 3 : 6, bark, t => t * t * 0.6, bark, 0, !lo);
  const top = pts[pts.length - 1], n = lo ? 5 : 8;
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + r() * 0.4; strip(b, top, V3(Math.cos(a), 0, Math.sin(a)), 2.2 + r() * 1, 0.9, 0.12, 1.3, lo ? 2 : 4, leaf, tip, 1); }
  return b.geo();
}
function makeDeadTree(seed, lo) { // bare twisted tree (cold or dry places)
  const r = mulberry32(seed), b = new GB(), H = 3 + r() * 3, bark = C3(30, 12, 36), barkTop = C3(30, 8, 48);
  const pts = [], rad = [];
  for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(V3(Math.sin(t * 3 + seed) * 0.3 * t, -0.4 + H * t, Math.cos(t * 2 + seed) * 0.3 * t)); rad.push(0.28 * (1 - t * 0.85)); }
  tube(b, pts, rad, lo ? 4 : 6, bark, t => t * 0.2, barkTop);
  if (!lo) for (let k = 0; k < 4; k++) {
    const p = pts[2 + (k % 3)], a = r() * Math.PI * 2, L = 0.8 + r() * 1.4;
    tube(b, [p.clone(), V3(p.x + Math.cos(a) * L * 0.5, p.y + L * 0.4, p.z + Math.sin(a) * L * 0.5), V3(p.x + Math.cos(a) * L, p.y + L * 0.9, p.z + Math.sin(a) * L)], [0.09, 0.05, 0.02], 4, bark, t => 0.3 + t * 0.3, barkTop, 0, false);
  }
  return b.geo();
}
function makeDryShrub(seed, lo) { // twiggy desert shrub with a few dusty leaves
  const r = mulberry32(seed), b = new GB(), wood = C3(30, 25, 30), woodTip = C3(35, 20, 45), leaf = C3(70, 25, 38);
  const n = lo ? 4 : 9;
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + r() * 0.5, L = 0.5 + r() * 0.6, out = 0.35 + r() * 0.35;
    if (lo) { strip(b, V3(0, -0.05, 0), V3(Math.cos(a) * out, 0, Math.sin(a) * out), L, 0.18, 0.04, 0.2, 1, wood, leaf, 0.6); continue; }
    tube(b, [V3(0, -0.05, 0), V3(Math.cos(a) * out * 0.4, L * 0.5, Math.sin(a) * out * 0.4), V3(Math.cos(a) * out, L, Math.sin(a) * out)], [0.035, 0.025, 0.01], 3, wood, t => t * 0.5, woodTip, 0, false);
    blob(b, Math.cos(a) * out, L, Math.sin(a) * out, 0.12, 0.08, 0.12, seed + k, 0.3, leaf, leaf, () => 0.6, 0, 5);
  }
  return b.geo();
}
function makeCactus(seed, lo) {
  const r = mulberry32(seed), b = new GB(), H = 2 + r() * 2.5, g0 = C3(110, 30, 26), g1 = C3(95, 32, 38), seg = lo ? 6 : 10;
  const col = (x, z, y0, h, rr) => tube(b, [V3(x, y0, z), V3(x, y0 + h * 0.5, z), V3(x, y0 + h, z)], [rr, rr * 0.98, rr * 0.7], seg, g0, t => t * 0.05, g1);
  col(0, 0, -0.3, H, 0.32);
  for (let k = 0; k < (lo ? 1 : 2); k++) {
    const a = r() * Math.PI * 2, y = H * (0.35 + r() * 0.25), L = 0.55;
    tube(b, [V3(0, y, 0), V3(Math.cos(a) * L, y + 0.05, Math.sin(a) * L), V3(Math.cos(a) * L, y + 0.7 + r() * 0.6, Math.sin(a) * L)], [0.2, 0.2, 0.15], seg, g0, () => 0.05, g1);
  }
  return b.geo();
}
function makeBush(seed, lo, dry) {
  const r = mulberry32(seed), b = new GB();
  const c0 = dry ? C3(40, 25, 28) : C3(110, 35, 20), c1 = dry ? C3(45, 30, 42) : C3(95, 40, 36);
  const n = lo ? 1 : 3;
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = k ? 0.4 + r() * 0.4 : 0, s = lo ? 0.95 : 0.55 + r() * 0.4;
    blob(b, Math.cos(a) * d, s * 0.55, Math.sin(a) * d, s * (lo ? 1.2 : 1), s * 0.75, s * (lo ? 1.2 : 1), seed + k * 7, 0.35, c0, c1, y => clamp(y / 1.4, 0, 1) * 0.6, 0, lo ? 6 : 8);
  }
  return b.geo();
}

// ---- alien plants ----
function makeAlienBulbs(seed, lo) { // curved stalks with glowing bulbs
  const r = mulberry32(seed), b = new GB(), n = lo ? 2 : 3, stalk = C3(280, 35, 28), bulb = C3(300 + r() * 40, 80, 62);
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, H = 1.5 + r() * 2.5, bx = Math.cos(a) * (0.4 + r() * 0.6), bz = Math.sin(a) * (0.4 + r() * 0.6), pts = [], rad = [];
    for (let s = 0; s <= 4; s++) { const t = s / 4; pts.push(V3(bx * t * t, -0.2 + H * t, bz * t * t)); rad.push(0.09 - t * 0.04); }
    tube(b, lo ? [pts[0], pts[2], pts[4]] : pts, lo ? [rad[0], rad[2], rad[4]] : rad, lo ? 3 : 5, stalk, t => t, stalk, 0, false);
    const tp = pts[4], s = 0.25 + r() * 0.2;
    blob(b, tp.x, tp.y + s * 0.6, tp.z, s, s * 1.2, s, seed + k, 0.15, bulb, C3(320, 90, 80), () => 1, 1, lo ? 5 : 7);
  }
  return b.geo();
}
function makeAlienTubes(seed, lo) { // tube-coral cluster with glowing rims
  const r = mulberry32(seed), b = new GB(), n = lo ? 3 : 6, c0 = C3(170 + r() * 40, 45, 30), c1 = C3(160 + r() * 40, 75, 60);
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = k ? 0.3 + r() * 0.5 : 0, H = 0.8 + r() * 1.8, x = Math.cos(a) * d, z = Math.sin(a) * d;
    tube(b, [V3(x, -0.2, z), V3(x * 1.1, H * 0.6, z * 1.1), V3(x * 1.2, H, z * 1.2)], [0.18, 0.15, 0.24], lo ? 5 : 8, c0, t => t * 0.3, c1, 0.8, false);
  }
  return b.geo();
}
function makeAlienShroom(seed, lo) { // giant umbrella mushroom
  const r = mulberry32(seed), b = new GB(), H = 2.5 + r() * 3.5, stem = C3(40, 20, 70), cap = C3(260 + r() * 60, 55, 40), under = C3(190, 80, 65);
  tube(b, [V3(0, -0.3, 0), V3(0.2, H * 0.5, 0), V3(0, H, 0.1)], [0.35, 0.22, 0.25], lo ? 5 : 8, stem, t => t * 0.2, stem, 0, false);
  const R = 1.4 + r() * 1.2, seg = lo ? 8 : 16, rows = lo ? 3 : 5, rings = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, rr = R * Math.sin(t * Math.PI / 2) * 1.02, y = H + 0.5 + Math.cos(t * Math.PI / 2) * R * 0.45 - t * t * 0.4, ring = [];
    for (let s = 0; s < seg; s++) { const a = s / seg * Math.PI * 2, wob = 1 + Math.sin(a * 5 + seed) * 0.05; ring.push(b.v(Math.cos(a) * rr * wob, y, Math.sin(a) * rr * wob, cap, 0.25, 0)); }
    rings.push(ring);
  }
  for (let j = 0; j < rows; j++) for (let s = 0; s < seg; s++) b.quad(rings[j][s], rings[j][(s + 1) % seg], rings[j + 1][(s + 1) % seg], rings[j + 1][s]);
  // glowing gills underneath the cap rim
  const last = rings[rows], gills = last.map(k => b.v(b.p[k * 3], b.p[k * 3 + 1] - 0.03, b.p[k * 3 + 2], under, 0.25, 0.8));
  const gc = b.v(0, H + 0.15, 0.1, under, 0.25, 1);
  for (let s = 0; s < seg; s++) b.tri(gc, gills[s], gills[(s + 1) % seg]);
  return b.geo();
}

// ---- lichen / microbial mats: flat crusts on the ground (dry CO2 worlds) ----
function makeLichen(seed, lo) {
  const r = mulberry32(seed), b = new GB(), n = lo ? 2 : 5;
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = k ? 0.3 + r() * 0.5 : 0, s = 0.35 + r() * 0.4;
    const c0 = C3(25 + r() * 70, 12 + r() * 14, 20 + r() * 8), c1 = C3(40 + r() * 60, 18, 30 + r() * 8);
    blob(b, Math.cos(a) * d, -0.02, Math.sin(a) * d, s, 0.04 + r() * 0.03, s * (0.7 + r() * 0.5), seed + k, 0.45, c0, c1, () => 0, 0, lo ? 6 : 9);
  }
  return b.geo();
}

// ---- grass ----
function makeGrass(seed, n, h, alien) {
  const r = mulberry32(seed), b = new GB();
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = r() * 0.55, root = V3(Math.cos(a) * d, -0.05, Math.sin(a) * d);
    const dir = V3(Math.cos(a + (r() - 0.5)), 0, Math.sin(a + (r() - 0.5)));
    const len = h * (0.5 + r() * 0.6), base = alien ? C3(280, 30, 30) : C3(92, 38, 30), tip = alien ? C3(300, 60, 58) : C3(78, 48, 52);
    strip(b, root, dir.multiplyScalar(0.25), len, alien ? 0.11 : 0.1, 0.01, 0.6 + r(), 2, base, tip, 1, alien ? 0.5 : 0);
  }
  return b.geo(true); // normals point up: blades light like the ground they grow from
}

// ---- rocks and formations (drawn with the rock ground texture) ----
function makeRock(seed, detail, elong = 1, flat = 0.75) {
  const r = mulberry32(seed), b = new GB(), seg = detail, rows = Math.max(4, Math.round(seg * 0.6)), idx = [];
  const sx = 0.8 + r() * 0.5, sz = (0.8 + r() * 0.5) * elong, w = C3(0, 0, 100);
  for (let j = 0; j <= rows; j++) {
    const th = j / rows * Math.PI, y = Math.cos(th), rr = Math.sin(th), row = [];
    for (let i = 0; i < seg; i++) {
      const ph = i / seg * Math.PI * 2, x = Math.cos(ph) * rr, z = Math.sin(ph) * rr;
      // big chunky facets softened by noise, flat-ish bottom buried in the ground
      const n = 1 + (fbm3(x * 1.3 + seed % 97, y * 1.3, z * 1.3, seed, 4) - 0.5) * 0.9 + (vnoise3(x * 5, y * 5, z * 5, seed + 3) - 0.5) * 0.12;
      let py = y * n * flat;
      if (py < -0.15) py = -0.15 + (py + 0.15) * 0.3;
      const ao = 0.5 + 0.5 * smooth(-0.15, 0.55, py); // darker where the rock meets the ground
      row.push(b.v(x * n * sx, py, z * n * sz, [ao, ao, ao]));
    }
    idx.push(row);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) b.quad(idx[j][i], idx[j][(i + 1) % seg], idx[j + 1][(i + 1) % seg], idx[j + 1][i]); // wound so faces point outwards
  return b.geo();
}
function makePillar(seed, lo) { // tall eroded rock pillar
  const r = mulberry32(seed), b = new GB(), H = 1, seg = lo ? 7 : 14, rows = lo ? 8 : 20, w = C3(0, 0, 100), rings = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, y = t * H - 0.05, ring = [];
    const rad = 0.13 * (1 - t * 0.35) * (1 + Math.sin(t * 9 + seed) * 0.12) * (t > 0.85 ? 1.25 : 1); // wider cap rock on top
    for (let s = 0; s < seg; s++) { const a = s / seg * Math.PI * 2, n = 1 + (vnoise3(Math.cos(a) * 2, t * 6, Math.sin(a) * 2, seed) - 0.5) * 0.5; ring.push(b.v(Math.cos(a) * rad * n, y, Math.sin(a) * rad * n, w)); }
    rings.push(ring);
  }
  for (let j = 0; j < rows; j++) for (let s = 0; s < seg; s++) b.quad(rings[j][s], rings[j + 1][s], rings[j + 1][(s + 1) % seg], rings[j][(s + 1) % seg]);
  const top = b.v(0, H - 0.03, 0, w); for (let s = 0; s < seg; s++) b.tri(rings[rows][s], rings[rows][(s + 1) % seg], top);
  return b.geo();
}
function makeArch(seed, lo) { // natural stone arch (unit span)
  const r = mulberry32(seed), b = new GB(), w = C3(0, 0, 100), seg = lo ? 7 : 12, n = lo ? 10 : 26, rings = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, a = Math.PI * (1 - t), cx = Math.cos(a) * 0.5, cy = Math.sin(a) * 0.55 - 0.06;
    const rad = 0.09 + 0.06 * Math.pow(Math.abs(t - 0.5) * 2, 2), ring = [];
    const nx = Math.cos(a), ny = Math.sin(a);
    for (let s = 0; s < seg; s++) {
      const q = s / seg * Math.PI * 2, noise = 1 + (vnoise3(t * 7, Math.cos(q) * 2, Math.sin(q) * 2, seed) - 0.5) * 0.6;
      const ox = nx * Math.cos(q) * rad * noise, oy = ny * Math.cos(q) * rad * noise, oz = Math.sin(q) * rad * 1.4 * noise;
      ring.push(b.v(cx + ox, cy + oy, oz, w));
    }
    rings.push(ring);
  }
  for (let k = 0; k < n; k++) for (let s = 0; s < seg; s++) b.quad(rings[k][s], rings[k][(s + 1) % seg], rings[k + 1][(s + 1) % seg], rings[k + 1][s]);
  return b.geo();
}

// ---- materials ----
// shared time and wind; each material has its own fade distance (grass close, trees far)
const NATURE_U = { uTime: { value: 0 }, uWind: { value: 1 } };
const fadeU = v => ({ uTime: NATURE_U.uTime, uWind: NATURE_U.uWind, uFadeFar: { value: v } });
// wind sway + shrink-in at the edge of the draw distance (no popping) + alien glow
function natureShader(m, swayAmp, U, thin = false, noFlip = thin) {
  m.userData.U = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uWind, uFadeFar;
attribute float aSway, aGlow;
varying float vGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vGlow = aGlow;
#ifdef USE_INSTANCING
  vec3 iPos = instanceMatrix[3].xyz;
  float iDist = length((modelMatrix * vec4(iPos, 1.0)).xyz - cameraPosition);
  transformed *= smoothstep(uFadeFar, uFadeFar * 0.8, iDist);
  ${thin ? `// fewer clumps further out: each clump has a random threshold and drops out past it
  float keep = 1.0 - smoothstep(uFadeFar * 0.25, uFadeFar * 0.95, iDist) * 0.85;
  transformed *= step(fract(sin(dot(iPos, vec3(12.9898, 78.233, 37.719))) * 43758.5453), keep);` : ''}
  float ph = dot(iPos, vec3(0.13, 0.17, 0.11));
  float gust = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 2.3) * 0.25 + sin(uTime * 0.4 + ph * 0.3) * 0.5;
  transformed.x += gust * aSway * ${swayAmp.toFixed(3)} * uWind;
  transformed.z += sin(uTime * 1.7 + ph * 1.7) * aSway * ${(swayAmp * 0.6).toFixed(3)} * uWind;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 0.9;');
    // grass and leaf cards: both sides lit the same (no dark backs)
    if (noFlip) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', ''));
  };
  m.customProgramCacheKey = () => 'nature' + swayAmp + thin + noFlip;
  return m;
}
const foliageMat = () => natureShader(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }), 0.22, fadeU(200));
const FOLIAGE_MAT = foliageMat(), FOLIAGE_NEAR_MAT = foliageMat();
const GRASS_MAT = natureShader(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 0.35, fadeU(40), true);

// rocks use the ground's rock texture (projected in world space, like the terrain)
const ROCK_VERT = `
vec4 gp = vec4(transformed, 1.0);
vec3 gn = objectNormal;
#ifdef USE_INSTANCING
  gp = instanceMatrix * gp;
  gn = mat3(instanceMatrix) * gn;
  vec3 iPos = instanceMatrix[3].xyz;
  transformed *= smoothstep(uFadeFar, uFadeFar * 0.8, length((modelMatrix * vec4(iPos, 1.0)).xyz - cameraPosition));
#endif
vW0 = vec3(0.0); vW1 = vec3(0.8, 0.2, 0.0); vW2 = vec3(0.0);
vGW = (modelMatrix * gp).xyz;
vGN = normalize(mat3(modelMatrix) * gn);
`;
function makeRockMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  m.userData.U = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, GROUND.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFadeFar;\nvarying vec3 vW0, vW1, vW2, vGW, vGN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + ROCK_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_FRAG_PARS)
      .replace('#include <map_fragment>', GROUND_FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', GROUND_FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', GROUND_FRAG_NORMAL);
  };
  m.customProgramCacheKey = () => 'rock1';
  return m;
}
const ROCK_MAT = makeRockMaterial(fadeU(200)), ROCK_NEAR_MAT = makeRockMaterial(fadeU(90));
const NATURE_MATS = [FOLIAGE_MAT, FOLIAGE_NEAR_MAT, GRASS_MAT, ROCK_MAT, ROCK_NEAR_MAT];
NATURE_MATS.forEach(m => sharedMats.add(m));

// ---- model library (built once, shared by all worlds) ----
// each kind has a full model and a cheap far-away version
const MODELS = {};
function buildModels() {
  if (MODELS.ready) return;
  const two = (fn, seeds, ...a) => seeds.map(s => ({ hi: fn(s, false, ...a), lo: fn(s, true, ...a) }));
  Object.assign(MODELS, {
    conifer: two(makeConifer, [11, 12, 13]), broadleaf: two(makeBroadleaf, [21, 22, 23]), swamptree: two(makeSwampTree, [31, 32]),
    lichen: two(makeLichen, [121, 122, 123]), deadtree: two(makeDeadTree, [41, 42]), cactus: two(makeCactus, [51, 52]), bush: two(makeBush, [61, 62, 63]), drybush: two(makeDryShrub, [64, 65]),
    bulbs: two(makeAlienBulbs, [71, 72]), tubes: two(makeAlienTubes, [81, 82]), shroom: two(makeAlienShroom, [91, 92]),
    grass: [{ hi: makeGrass(101, 10, 0.5, false), lo: makeGrass(101, 4, 0.5, false) }, { hi: makeGrass(102, 8, 0.75, false), lo: makeGrass(102, 3, 0.75, false) }],
    aliengrass: [{ hi: makeGrass(111, 6, 1.0, true), lo: makeGrass(111, 3, 1.0, true) }],
    rock: [1, 2, 3, 4, 5].map(s => ({ hi: makeRock(200 + s, 14), lo: makeRock(200 + s, 7) })),
    slab: [1, 2].map(s => ({ hi: makeRock(300 + s, 16, 2.4, 0.6), lo: makeRock(300 + s, 8, 2.4, 0.6) })),
    pillar: two(makePillar, [401, 402]), arch: two(makeArch, [501, 502]),
  });
  for (const k in MODELS) for (const v of MODELS[k]) {
    sharedGeos.add(v.hi); sharedGeos.add(v.lo);
    // size of the model, used for collisions: half-widths and height
    v.hi.computeBoundingBox();
    const bb = v.hi.boundingBox;
    v.ext = { rx: Math.max(-bb.min.x, bb.max.x), rz: Math.max(-bb.min.z, bb.max.z), top: bb.max.y };
  }
  MODELS.ready = true;
}

// ---- samples you can collect: replace the old simple shapes ----
// vertex colours are light greys, so each species' own colour (the material colour) shows through
function makeSamplePlant() {
  const b = new GB(), leaf = [0.62, 0.62, 0.62], leafTip = [0.85, 0.85, 0.85], stem = [0.55, 0.55, 0.55], bloom = [1, 1, 1];
  for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; strip(b, V3(0, 0, 0), V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.55), 0.85, 0.32, 0.04, 1.1, 4, leaf, leafTip); }
  tube(b, [V3(0, 0, 0), V3(0.05, 0.7, 0), V3(0, 1.3, 0.05)], [0.05, 0.04, 0.03], 5, stem, () => 0, stem, 0, false);
  blob(b, 0, 1.45, 0.05, 0.22, 0.26, 0.22, 7, 0.2, bloom, bloom, () => 0, 0, 8);
  return b.geo();
}
function makeCrystals() {
  const g = [], r = mulberry32(5);
  for (let k = 0; k < 5; k++) {
    const h = k === 0 ? 1.7 : 0.6 + r() * 0.8, rad = k === 0 ? 0.26 : 0.12 + r() * 0.08;
    const c = new THREE.CylinderGeometry(rad * 0.7, rad, h, 6, 1).translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(rad * 0.7, rad * 1.6, 6).translate(0, h + rad * 0.8, 0);
    const a = r() * Math.PI * 2, tilt = k === 0 ? 0 : 0.35 + r() * 0.3, m = new THREE.Matrix4().makeRotationAxis(V3(Math.cos(a), 0, Math.sin(a)), tilt);
    if (k) m.setPosition(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
    g.push(c.applyMatrix4(m), tip.applyMatrix4(m));
  }
  // merge (crystals stay faceted on purpose: they're gems)
  const pos = [];
  for (const x of g) { const n = x.toNonIndexed(); pos.push(...n.attributes.position.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(pos.map(() => 1), 3));
  out.computeVertexNormals();
  return out;
}
function makeAmmonite() { // a coiled shell lying half-buried
  const b = new GB(), pts = [], rad = [], col = [0.85, 0.85, 0.85];
  for (let k = 0; k <= 40; k++) { const t = k / 40, a = t * Math.PI * 4.2, R = 0.08 + t * 0.45; pts.push(V3(Math.cos(a) * R, 0.12 + t * 0.05, Math.sin(a) * R)); rad.push(0.03 + t * 0.17); }
  tube(b, pts, rad, 8, [0.6, 0.6, 0.6], () => 0, col, 0, true);
  return b.geo();
}
function makeMound() {
  const b = new GB();
  blob(b, 0, 0, 0, 0.7, 0.32, 0.7, 3, 0.25, [0.8, 0.8, 0.8], [1, 1, 1], () => 0, 0, 12);
  return b.geo();
}
function makeIceChunk() {
  const g = makeRock(77, 10, 1, 0.9);
  return g.scale(0.55, 0.75, 0.55).translate(0, 0.35, 0);
}
Object.assign(GEO, {
  plant: makeSamplePlant(), rock: makeRock(66, 12).scale(0.65, 0.65, 0.65).translate(0, 0.25, 0), mineral: makeCrystals(),
  fossil: makeAmmonite(), dust: makeMound(), ice: makeIceChunk(),
});
Object.values(GEO).forEach(g => sharedGeos.add(g));

// ---- impostors: far-away trees as flat cut-outs ----
// Each tree model is photographed once from the side into an atlas. Far trees are then drawn as
// camera-facing quads (2 triangles instead of hundreds), turning around their own "up".
const IMP_KINDS = ['conifer', 'broadleaf', 'swamptree', 'deadtree', 'cactus', 'shroom'], IMP_GRID = 5;
const IMP = { tex: null, cells: {}, mat: null, geo: null };
function buildImpostors(force = false) {
  if ((IMP.tex && !force) || !MODELS.ready) return;
  if (IMP.tex) { IMP.tex.dispose(); IMP.tex = null; IMP.cells = {}; }
  const S = 1024, cell = S / IMP_GRID;
  const rt = new THREE.WebGLRenderTarget(S, S, { depthBuffer: true });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 0.75);
  key.position.set(0.4, 1, 0.9);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55), key);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(undefined, mat), partMeshes = [];
  scene.add(mesh);
  const prev = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), auto: renderer.autoClear };
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.autoClear = false;
  let n = 0;
  for (const k of IMP_KINDS.concat(['bush'])) MODELS[k].forEach((v, vi) => {
    const bb = v.box || v.hi.boundingBox || (v.hi.computeBoundingBox(), v.hi.boundingBox);
    const w = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * 1.05, h = bb.max.y * 1.02, y0 = Math.min(0, bb.min.y);
    for (const pm of partMeshes) scene.remove(pm);
    partMeshes.length = 0;
    if (v.glb) { // textured model: one temporary mesh per part
      mesh.visible = false;
      for (const p of v.hi) {
        const pm = new THREE.Mesh(p.geo, new THREE.MeshLambertMaterial({ map: p.mat.map, color: p.mat.color, vertexColors: !!p.geo.attributes.color, alphaTest: 0.5, side: THREE.DoubleSide }));
        partMeshes.push(pm); scene.add(pm);
      }
    } else { mesh.visible = true; mesh.geometry = v.hi; }
    const half = Math.max(w, (h - y0) / 2);
    Object.assign(cam, { left: -half, right: half, bottom: y0, top: y0 + half * 2 });
    cam.position.set(0, 0, 50); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    const cx = n % IMP_GRID, cy = Math.floor(n / IMP_GRID);
    rt.viewport.set(cx * cell, cy * cell, cell, cell);
    rt.scissor.set(cx * cell, cy * cell, cell, cell);
    rt.scissorTest = true;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    IMP.cells[k + vi] = { u: cx / IMP_GRID, v: cy / IMP_GRID, w: half, h: half * 2, y0 };
    n++;
  });
  for (const pm of partMeshes) { scene.remove(pm); pm.material.dispose(); }
  renderer.autoClear = prev.auto;
  renderer.setRenderTarget(prev.target);
  renderer.setClearColor(prev.color, prev.alpha);
  IMP.tex = rt.texture;
  if (IMP.mat) { IMP.mat.map = IMP.tex; IMP.mat.needsUpdate = true; return; } // rebuilt atlas: the material already exists, just point it at the new texture
  IMP.geo = new THREE.PlaneGeometry(2, 2).translate(0, 1, 0); // x -1..1, y 0..2; scaled per instance in the shader
  IMP.mat = new THREE.MeshBasicMaterial({ map: IMP.tex, alphaTest: 0.5, side: THREE.DoubleSide, transparent: false });
  IMP.mat.userData.U = Object.assign(fadeU(300), { uLight: { value: 1 } });
  IMP.mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, IMP.mat.userData.U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aCell; // atlas u, v, half-width, height offset
uniform float uFadeFar;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vUv = aCell.xy + uv * ${(1 / IMP_GRID).toFixed(4)};`)
      .replace('#include <project_vertex>', `
vec3 iPos = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
vec3 iUp = normalize(instanceMatrix[1].xyz);
float iS = length(instanceMatrix[1].xyz) * aCell.z * smoothstep(uFadeFar, uFadeFar * 0.85, length(iPos - cameraPosition));
vec3 toCam = normalize(cameraPosition - iPos);
vec3 right = normalize(cross(iUp, toCam));
vec3 wp = iPos + right * position.x * iS + iUp * (position.y * iS + aCell.w * length(instanceMatrix[1].xyz));
vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLight;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= uLight;');
  };
  IMP.mat.customProgramCacheKey = () => 'impostor1';
  sharedMats.add(IMP.mat); sharedGeos.add(IMP.geo);
}

// ---- real tree models (CC0, Quaternius Stylized Nature MegaKit; see CREDITS.md) ----
// Loaded in the background; until they arrive the procedural trees stand in. Each model part
// (bark, leaves) keeps its textures and gets the same wind sway and distance fade as other plants.
const TREE_FILES = { broadleaf: ['tree1', 'tree2', 'tree3'] };
function loadTreeModels(onDone) {
  if (!THREE.GLTFLoader) return;
  const loader = new THREE.GLTFLoader(), jobs = [];
  for (const kind in TREE_FILES) TREE_FILES[kind].forEach((f, vi) => jobs.push(new Promise(res => loader.load(`assets/models/trees/${f}.glb?v=${ASSET_V}`, g => res({ kind, vi, g }), undefined, () => res(null)))));
  Promise.all(jobs).then(list => {
    if (list.some(x => !x)) { console.warn('tree models failed to load, keeping the procedural trees'); return; }
    const out = {};
    for (const { kind, vi, g } of list) {
      g.scene.updateMatrixWorld(true);
      const parts = [], box = new THREE.Box3();
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
        geo.computeBoundingBox(); box.union(geo.boundingBox);
        parts.push({ geo, src: o.material });
      });
      // stand on the ground at a natural size (trees ~7 m, bushes ~1.2 m)
      const target = kind === 'bush' ? 1.2 : 7, s = target / (box.max.y - box.min.y);
      const m4 = new THREE.Matrix4().makeScale(s, s, s).premultiply(new THREE.Matrix4().makeTranslation(0, -box.min.y * s - 0.05, 0));
      box.applyMatrix4(m4);
      for (const p of parts) {
        p.geo.applyMatrix4(m4);
        const pos = p.geo.attributes.position, n = pos.count, sway = new Float32Array(n);
        for (let i = 0; i < n; i++) { const t = clamp(pos.getY(i) / box.max.y, 0, 1); sway[i] = t * t; }
        p.geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
        p.geo.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n), 1));
        p.geo.computeBoundingSphere();
        const leaf = /leave/i.test(p.src.name || '');
        const mat = new THREE.MeshStandardMaterial({ map: p.src.map, color: 0xffffff, vertexColors: !!p.geo.attributes.color, roughness: 0.85, metalness: 0,
          alphaTest: 0.5, side: leaf ? THREE.DoubleSide : THREE.FrontSide });
        p.mat = natureShader(mat, leaf ? (kind === 'bush' ? 0.15 : 0.3) : 0.05, kind === 'bush' ? FOLIAGE_NEAR_MAT.userData.U : FOLIAGE_MAT.userData.U, false, leaf);
        sharedGeos.add(p.geo); sharedMats.add(p.mat);
        delete p.src;
      }
      (out[kind] = out[kind] || [])[vi] = { hi: parts, glb: true, box, ext: { rx: Math.max(-box.min.x, box.max.x), rz: Math.max(-box.min.z, box.max.z), top: box.max.y } };
    }
    buildModels(); // procedural set first, then the real models replace their kinds
    Object.assign(MODELS, out);
    buildImpostors(true);
    if (onDone) onDone();
  });
}
