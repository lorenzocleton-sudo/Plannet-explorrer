'use strict';
// ---------- biomes ----------
// Planets get several biomes from a simple climate: temperature falls towards the poles and with
// height, moisture comes from large-scale noise. Each biome has a climate "home"; the weights of
// nearby homes blend smoothly, so biomes fade into each other instead of meeting at a hard line.
// Highlands follow height and slope, alien patches follow their own noise.
const BIOMES = [
  { id: 'grassland', name: 'Grassland', T: 0.6, M: 0.45 },
  { id: 'forest', name: 'Forest', T: 0.5, M: 0.72 },
  { id: 'desert', name: 'Desert', T: 0.9, M: 0.12 },
  { id: 'highlands', name: 'Highlands' },
  { id: 'tundra', name: 'Tundra', T: 0.12, M: 0.45 },
  { id: 'swamp', name: 'Swamp', T: 0.68, M: 0.92 },
  { id: 'alien', name: 'Alien growth' },
];
const B_GRASS = 0, B_FOREST = 1, B_DESERT = 2, B_HIGH = 3, B_TUNDRA = 4, B_SWAMP = 5, B_ALIEN = 6, NB = BIOMES.length;
// moons: dusty plains, dark maria, rocky highlands, ice
const MOON_BIOMES = ['Dust plains', 'Maria', 'Rocky highlands', 'Ice field'];

// per planet: which biomes exist, a climate bias, and the ground colour of each biome [h, s, l]
const PLANET_BIOMES = {
  Verdara: { tBias: 0.12, mBias: 0, list: {
    grassland: [98, 42, 38], forest: [120, 38, 25], desert: [40, 45, 60], highlands: [30, 12, 40], tundra: [195, 10, 82], swamp: [82, 30, 26] } },
  Ruska: { tBias: 0.25, mBias: -0.2, list: {
    desert: [18, 55, 44], highlands: [10, 32, 30], grassland: [30, 40, 36], alien: [42, 70, 48] } },
  Glacia: { tBias: -0.45, mBias: 0, list: {
    tundra: [200, 22, 85], highlands: [212, 12, 52], forest: [175, 18, 32], swamp: [190, 30, 58] } },
  Umbros: { tBias: -0.3, mBias: 0.1, list: {
    highlands: [250, 10, 24], tundra: [240, 12, 40], alien: [295, 55, 30], swamp: [270, 25, 18] } },
  'Xeno Prime': { tBias: 0.15, mBias: 0.25, list: {
    swamp: [72, 42, 26], forest: [58, 48, 26], alien: [150, 55, 34], grassland: [66, 40, 38], highlands: [38, 18, 32] } },
};
function biomeSet(body) {
  if (body._bset) return body._bset;
  const P = PLANET_BIOMES[body.name] || PLANET_BIOMES.Verdara;
  const has = new Uint8Array(NB), col = [];
  BIOMES.forEach((B, i) => { const c = P.list[B.id]; has[i] = c ? 1 : 0; col[i] = c || [0, 0, 50]; });
  const axis = new THREE.Vector3(Math.sin(body.tilt), Math.cos(body.tilt), 0).normalize();
  return (body._bset = { has, col, tBias: P.tBias, mBias: P.mBias, axis });
}
const moistAt = (body, x, y, z) => fbm3(x * 2.3 + 5, y * 2.3, z * 2.3, body.seed + 70, 3) + biomeSet(body).mBias;
const alienAt = (body, x, y, z) => fbm3(x * 3.1, y * 3.1 + 2, z * 3.1, body.seed + 80, 3);

// biome weights at direction d, height h (m), flatness slope (1 = level); fills out[NB] and returns the main biome
const _bw = new Float32Array(NB), _clim = { t: 0, m: 0 };
function biomeWeights(body, d, h, slope = 1, out = _bw) {
  const S = biomeSet(body);
  const lat = Math.abs(d.dot(S.axis));
  const mount = body.mount || 500;
  // temperature 0 (frozen) .. 1 (hot)
  const t = 0.95 - lat * 0.95 + (fbm3(d.x * 1.7, d.y * 1.7 + 7, d.z * 1.7, body.seed + 60, 3) - 0.5) * 0.45
          - Math.max(0, h) / mount * 0.75 + S.tBias;
  const m = moistAt(body, d.x, d.y, d.z) + (h < 6 ? 0.08 : 0);
  _clim.t = t; _clim.m = m;
  let tot = 0;
  for (let i = 0; i < NB; i++) {
    out[i] = 0;
    if (!S.has[i] || BIOMES[i].T === undefined) continue;
    const B = BIOMES[i], dt = t - B.T, dm = m - B.M;
    out[i] = Math.exp(-(dt * dt + dm * dm) / 0.018);
    tot += out[i];
  }
  if (tot < 1e-6) { // no climate biome fits: use the closest one
    let best = -1, bd = Infinity;
    for (let i = 0; i < NB; i++) if (S.has[i] && BIOMES[i].T !== undefined) {
      const dd = (t - BIOMES[i].T) ** 2 + (m - BIOMES[i].M) ** 2;
      if (dd < bd) { bd = dd; best = i; }
    }
    if (best >= 0) { out[best] = 1; tot = 1; }
  }
  for (let i = 0; i < NB; i++) out[i] /= tot || 1;
  // highlands take over high ground and steep slopes; alien growth spreads in patches
  const hi = S.has[B_HIGH] ? Math.max(smooth(body.hRocky * 0.55, body.hRocky * 1.05, h), smooth(0.8, 0.62, slope) * 0.8) : 0;
  const al = S.has[B_ALIEN] ? smooth(0.6, 0.68, alienAt(body, d.x, d.y, d.z)) * (1 - hi) : 0;
  const keep = (1 - hi) * (1 - al);
  for (let i = 0; i < NB; i++) out[i] *= keep;
  out[B_HIGH] += hi; out[B_ALIEN] += al;
  let main = 0;
  for (let i = 1; i < NB; i++) if (out[i] > out[main]) main = i;
  return main;
}

// swamps sit in flat, wet lowlands with shallow ponds (used by the terrain height function)
function swampiness(body, x, y, z, c) {
  const S = biomeSet(body);
  if (!S.has[B_SWAMP]) return 0;
  return smooth(0.74, 0.86, moistAt(body, x, y, z)) * (1 - smooth(0.12, 0.35, c));
}

// ground colour of a planet at direction d (step 4 adds textures on top of this tint)
const _gc = [0, 0, 0];
function planetGroundColor(body, d, h, slope) {
  const S = biomeSet(body), R = body.R;
  biomeWeights(body, d, h, slope);
  let hh = 0, ss = 0, ll = 0, hx = 0, hy = 0;
  for (let i = 0; i < NB; i++) {
    const w = _bw[i];
    if (w < 1e-4) continue;
    const c = S.col[i];
    // average hue on the circle so blends between e.g. red and purple stay sensible
    hx += Math.cos(c[0] * Math.PI / 180) * w * (c[1] + 1); hy += Math.sin(c[0] * Math.PI / 180) * w * (c[1] + 1);
    ss += c[1] * w; ll += c[2] * w;
  }
  hh = Math.atan2(hy, hx) * 180 / Math.PI;
  const tint = (vnoise3(d.x * R / 60, d.y * R / 60, d.z * R / 60, body.seed + 99) - 0.5) * 8
             + (vnoise3(d.x * R / 9, d.y * R / 9, d.z * R / 9, body.seed + 98) - 0.5) * 4;
  let col = [hh, ss, ll + tint];
  const C = body.col, mix = (a, b, t) => { a[0] = lerpHue(a[0], b[0], t); a[1] = lerp(a[1], b[1], t); a[2] = lerp(a[2], b[2], t); };
  // wet sand along the shore, darker sea floor further out
  const beach = C.beach || [40, 30, 55];
  mix(col, beach, smooth(1.1, 0.25, h) * (1 - _bw[B_SWAMP]));
  if (h < 0) mix(col, [beach[0], beach[1] * 0.8, beach[2] * 0.62], smooth(0, -18, h));
  // bare rock on steep slopes, snow where it is cold and flat enough to settle
  mix(col, S.has[B_HIGH] ? S.col[B_HIGH] : C.rocky, smooth(0.86, 0.66, slope) * smooth(0.5, 3, h));
  const snow = C.snow || [205, 18, 92];
  mix(col, snow, smooth(0.08, -0.06, _clim.t) * smooth(0.55, 0.8, slope) * smooth(1, 6, h));
  return hsl2rgbTo(col[0], col[1], col[2], _gc);
}
function lerpHue(a, b, t) { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * t; }
function hsl2rgbTo(h, s, l, out) { const c = hsl2rgb(((h % 360) + 360) % 360, clamp(s, 0, 100), clamp(l, 0, 100)); out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
