'use strict';
// ---------- random / noise / small helpers ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  h = Math.imul(h ^ (h >>> 15), 2246822519 | 0);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function vnoise3(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c000 = hash3(xi, yi, zi, s), c100 = hash3(xi + 1, yi, zi, s);
  const c010 = hash3(xi, yi + 1, zi, s), c110 = hash3(xi + 1, yi + 1, zi, s);
  const c001 = hash3(xi, yi, zi + 1, s), c101 = hash3(xi + 1, yi, zi + 1, s);
  const c011 = hash3(xi, yi + 1, zi + 1, s), c111 = hash3(xi + 1, yi + 1, zi + 1, s);
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

function fbm3(x, y, z, s, oct = 5) {
  let t = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    t += amp * vnoise3(x * f, y * f, z * f, s + i * 31);
    norm += amp; f *= 2.03; amp *= 0.5;
  }
  return t / norm;
}

function ridged3(x, y, z, s, oct = 4) {
  let t = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise3(x * f, y * f, z * f, s + i * 47) * 2 - 1);
    t += amp * n * n;
    norm += amp; f *= 2.1; amp *= 0.5;
  }
  return t / norm;
}

// ridged noise with rounded crests (soft ridgelines instead of knife edges)
function softRidge3(x, y, z, s, oct = 4) {
  let t = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = vnoise3(x * f, y * f, z * f, s + i * 53) * 2 - 1;
    const r = Math.max(0, 1 - Math.sqrt(n * n + 0.02));
    t += amp * r * r;
    norm += amp; f *= 2.05; amp *= 0.45;
  }
  return t / norm;
}

function hsl2rgb(h, s, l) {
  s /= 100; l = Math.max(0, Math.min(100, l)) / 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const $ = id => document.getElementById(id);

// uniform random direction on the unit sphere
function randDir(rnd, out) {
  const z = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(t), z, r * Math.sin(t));
}

// any unit vector perpendicular to n
function tangentOf(n, out) {
  out.set(0, 1, 0);
  if (Math.abs(n.y) > 0.9) out.set(1, 0, 0);
  return out.addScaledVector(n, -out.dot(n)).normalize();
}
