'use strict';
// ---------- interactive star map: solar system -> zoom into a planet and its moons ----------
const mapCv = $('mapCanvas'), mx2 = mapCv.getContext('2d');
const ms = { t: 0, focus: null, sel: null, zoom: 0, w: 0, h: 0, pos: new Map() };
const ORBIT0 = 90, ORBIT_STEP = 70, SUN_R = 24;
const planetDrawR = P => 9 + P.R / 30;
const moonDrawR = M => 2.2 + M.R / 30;
const moonOrbit = (P, k) => planetDrawR(P) + 9 + k * 8;
const MAP_STARS = (() => { const r = mulberry32(9); return Array.from({ length: 220 }, () => [r(), r(), r() * 1.2 + 0.3]); })();

function renderMap() {
  const cur = bodyById(save.current);
  ms.focus = null; ms.zoom = 0; ms.sel = planetOf(cur);
  $('mapRP').textContent = `${save.rp} RP`;
  renderMapInfo();
}
function mapZoomOut() {
  if (!ms.focus) return false;
  ms.focus = null;
  renderMapInfo();
  return true;
}
$('mapBackBtn').onclick = mapZoomOut;
$('mapClose').onclick = () => goBack();

function bodyColorCss(b, which) { const [h, s, l] = b.col[which]; return `hsl(${h},${s}%,${l}%)`; }

// positions in "system units"; planets orbit the sun, moons orbit their planet
function layout() {
  ms.pos.clear();
  PLANETS.forEach((P, i) => {
    const a = i * 2.1 + ms.t * 0.05 / (1 + i * 0.6), r = ORBIT0 + i * ORBIT_STEP;
    const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
    ms.pos.set(P.id, p);
    P.moons.forEach((M, k) => {
      const ma = k * 2.4 + ms.t * (0.5 / (1 + k * 0.5)), mr = moonOrbit(P, k);
      ms.pos.set(M.id, { x: p.x + Math.cos(ma) * mr, y: p.y + Math.sin(ma) * mr });
    });
  });
}
function viewTransform() {
  const m = Math.min(ms.w, ms.h);
  const sSys = m * 0.47 / (ORBIT0 + 4 * ORBIT_STEP + 20);
  if (!ms.focus) return { cx: 0, cy: 0, s: sSys, z: 0 };
  const F = ms.focus, fp = ms.pos.get(F.id);
  const extent = F.moons.length ? moonOrbit(F, F.moons.length - 1) + 6 : planetDrawR(F) * 2.4;
  const sEnd = m * 0.42 / extent;
  const z = ms.zoom * ms.zoom * (3 - 2 * ms.zoom);
  return { cx: fp.x * z, cy: fp.y * z, s: sSys * Math.pow(sEnd / sSys, z), z };
}

function drawBall(x, y, r, b, alpha) {
  mx2.globalAlpha = alpha;
  const main = b.type === 'planet' ? 'plains' : 'dust', edge = b.type === 'planet' ? 'crystal' : 'rock';
  const g = mx2.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff'); g.addColorStop(0.15, bodyColorCss(b, main)); g.addColorStop(1, bodyColorCss(b, edge));
  mx2.fillStyle = g;
  mx2.beginPath(); mx2.arc(x, y, r, 0, Math.PI * 2); mx2.fill();
  if (b.type === 'planet' && b.R) { // seas hint
    mx2.fillStyle = bodyColorCss(b, 'liquid'); mx2.globalAlpha = alpha * 0.45;
    mx2.beginPath(); mx2.arc(x + r * 0.25, y + r * 0.2, r * 0.45, 0, Math.PI * 2); mx2.fill();
  }
  mx2.globalAlpha = 1;
}
function label(x, y, text, color, alpha = 1, size = 13) {
  mx2.globalAlpha = alpha;
  mx2.font = `bold ${size}px system-ui,sans-serif`; mx2.textAlign = 'center'; mx2.textBaseline = 'top';
  mx2.fillStyle = 'rgba(0,0,0,.6)'; mx2.fillText(text, x + 1, y + 1);
  mx2.fillStyle = color; mx2.fillText(text, x, y);
  mx2.globalAlpha = 1;
}

function drawStarMap(dt) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = mapCv.clientWidth, ch = mapCv.clientHeight;
  if (!cw || !ch) return;
  if (mapCv.width !== Math.round(cw * dpr) || mapCv.height !== Math.round(ch * dpr)) { mapCv.width = Math.round(cw * dpr); mapCv.height = Math.round(ch * dpr); }
  ms.w = cw; ms.h = ch; ms.t += dt;
  ms.zoom = clamp(ms.zoom + (ms.focus ? 1 : -1) * dt * 1.8, 0, 1);
  if (!ms.focus && ms.zoom === 0) ms.zoomFrom = null;
  layout();
  const V = viewTransform(), ox = cw / 2, oy = ch / 2;
  const toS = p => [ox + (p.x - V.cx) * V.s, oy + (p.y - V.cy) * V.s];
  mx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  mx2.fillStyle = '#03040a'; mx2.fillRect(0, 0, cw, ch);
  for (const [x, y, r] of MAP_STARS) { mx2.fillStyle = `rgba(255,255,255,${0.25 + r * 0.4})`; mx2.fillRect(x * cw, y * ch, r, r); }

  // sun + planet orbits fade as we zoom in
  const sysA = 1 - V.z * 0.85;
  const [sx, sy] = toS({ x: 0, y: 0 });
  const sg = mx2.createRadialGradient(sx, sy, 0, sx, sy, SUN_R * V.s * 2.2);
  sg.addColorStop(0, 'rgba(255,240,170,1)'); sg.addColorStop(0.45, 'rgba(255,200,90,.5)'); sg.addColorStop(1, 'rgba(255,160,40,0)');
  mx2.fillStyle = sg; mx2.beginPath(); mx2.arc(sx, sy, SUN_R * V.s * 2.2, 0, Math.PI * 2); mx2.fill();
  mx2.strokeStyle = `rgba(120,140,220,${0.35 * sysA})`; mx2.lineWidth = 1;
  PLANETS.forEach((P, i) => { mx2.beginPath(); mx2.arc(sx, sy, (ORBIT0 + i * ORBIT_STEP) * V.s, 0, Math.PI * 2); mx2.stroke(); });

  const here = bodyById(save.current);
  PLANETS.forEach(P => {
    const [x, y] = toS(ms.pos.get(P.id));
    const r = Math.max(5, planetDrawR(P) * V.s), unlocked = isUnlocked(P);
    const a = ms.focus && ms.focus !== P ? sysA : 1;
    drawBall(x, y, r, P, unlocked ? a : a * 0.45);
    if (planetOf(here) === P && here === P) { mx2.strokeStyle = '#7fd1ff'; mx2.lineWidth = 2; mx2.beginPath(); mx2.arc(x, y, r + 5, 0, Math.PI * 2); mx2.stroke(); }
    if (ms.sel === P) { mx2.strokeStyle = '#ffd166'; mx2.lineWidth = 2; mx2.setLineDash([4, 4]); mx2.beginPath(); mx2.arc(x, y, r + 9, 0, Math.PI * 2); mx2.stroke(); mx2.setLineDash([]); }
    label(x, y + r + 6, P.name + (unlocked ? '' : ' 🔒'), unlocked ? '#e6ecff' : '#8a93b8', a, ms.focus === P ? 16 : 13);
    if (!ms.focus) label(x, y + r + 22, P.moons.length ? `${P.moons.length} moon${P.moons.length === 1 ? '' : 's'}` : 'no moons', '#7a86b8', a, 11);
  });

  // moons of the focused planet
  if (ms.focus) {
    const F = ms.focus, fp = ms.pos.get(F.id), ma = smooth(0.35, 1, ms.zoom);
    const [fx, fy] = toS(fp);
    if (!F.moons.length) label(fx, fy - planetDrawR(F) * V.s - 30, 'No moons', '#8a93b8', ma, 14);
    F.moons.forEach((M, k) => {
      mx2.globalAlpha = ma * 0.5; mx2.strokeStyle = '#4a5aa0'; mx2.lineWidth = 1;
      mx2.beginPath(); mx2.arc(fx, fy, moonOrbit(F, k) * V.s, 0, Math.PI * 2); mx2.stroke(); mx2.globalAlpha = 1;
      const [x, y] = toS(ms.pos.get(M.id)), r = Math.max(4, moonDrawR(M) * V.s);
      drawBall(x, y, r, M, ma * (isUnlocked(M) ? 1 : 0.45));
      if (here === M) { mx2.globalAlpha = ma; mx2.strokeStyle = '#7fd1ff'; mx2.lineWidth = 2; mx2.beginPath(); mx2.arc(x, y, r + 4, 0, Math.PI * 2); mx2.stroke(); mx2.globalAlpha = 1; }
      if (ms.sel === M) { mx2.globalAlpha = ma; mx2.strokeStyle = '#ffd166'; mx2.lineWidth = 2; mx2.setLineDash([4, 4]); mx2.beginPath(); mx2.arc(x, y, r + 8, 0, Math.PI * 2); mx2.stroke(); mx2.setLineDash([]); mx2.globalAlpha = 1; }
      label(x, y + r + 5, M.name, '#cfd6f5', ma, 12);
    });
  }
  mx2.font = '12px system-ui,sans-serif'; mx2.textAlign = 'left'; mx2.textBaseline = 'bottom'; mx2.fillStyle = '#7a86b8';
  mx2.fillText(ms.focus ? 'Tap the planet or a moon to choose your destination' : 'Tap a planet to zoom in on it and its moons', 10, ch - 8);
}

// tap / click to select
mapCv.addEventListener('pointerdown', e => {
  const rect = mapCv.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
  layout();
  const V = viewTransform(), ox = ms.w / 2, oy = ms.h / 2;
  const toS = p => [ox + (p.x - V.cx) * V.s, oy + (p.y - V.cy) * V.s];
  const tol = isTouch ? 22 : 12;
  let best = null, bd = Infinity;
  const cands = ms.focus ? [ms.focus, ...ms.focus.moons] : PLANETS;
  for (const b of cands) {
    const [x, y] = toS(ms.pos.get(b.id));
    const r = b.type === 'planet' ? Math.max(5, planetDrawR(b) * V.s) : Math.max(4, moonDrawR(b) * V.s);
    const d = Math.hypot(px - x, py - y) - r;
    if (d < tol && d < bd) { bd = d; best = b; }
  }
  if (!best) return;
  if (!ms.focus) ms.focus = best;
  ms.sel = best;
  renderMapInfo();
  e.preventDefault();
});

function bodyInfo(b) {
  const S = genSpecies(b);
  let tot = 0, got = 0;
  for (const cat in S) for (const sp of S[cat]) { tot++; if (known(sp)) got++; }
  const drills = Object.keys(save.drills[b.id] || {}).length;
  return `<p>Gravity ${b.g} m/s² · ${b.type === 'moon' ? 'Radius' : 'Radius'} ${b.R} m</p>
    <p>${atmoText(b)}</p>
    <p class="muted">${b.desc}</p>
    ${isUnlocked(b) ? `<p>Catalogued ${got}/${tot} species${drills ? ` · ${drills} drill${drills > 1 ? 's' : ''} running` : ''}</p>` : ''}`;
}
function destButton(b) {
  if (b.id === save.current) return `<button disabled>You are here</button>`;
  if (isUnlocked(b)) return `<button onclick="travelTo('${b.id}')">Travel here</button>`;
  if (b.type === 'moon') return `<button disabled>Unlock ${b.parent.name} first</button>`;
  return `<button ${save.rp >= b.cost ? '' : 'disabled'} onclick="unlock(${b.idx})">Unlock · ${b.cost} RP</button>`;
}
function renderMapInfo() {
  $('mapRP').textContent = `${save.rp} RP`;
  $('mapBackBtn').style.display = ms.focus ? '' : 'none';
  $('mapTitle').textContent = ms.focus ? `${ms.focus.name} system` : 'Star Map';
  let h = '';
  if (!ms.focus) {
    h += '<p class="muted" style="margin-top:0">Select a planet to see its moons.</p>';
    for (const P of PLANETS) {
      h += `<div class="mcard ${ms.sel === P ? 'sel' : ''}" onclick="mapSelect('${P.id}')"><b>${P.name}</b> ${isUnlocked(P) ? '' : '🔒'}
        <p>${P.moons.length ? `${P.moons.length} moon${P.moons.length > 1 ? 's' : ''}` : 'No moons'} · g ${P.g} m/s²${P.id === save.current || planetOf(bodyById(save.current)) === P ? ' · <b style="font-size:13px;color:#7fd1ff">you are here</b>' : ''}</p></div>`;
    }
  } else {
    const F = ms.focus;
    for (const b of [F, ...F.moons]) {
      h += `<div class="mcard ${ms.sel === b ? 'sel' : ''}" onclick="mapSelect('${b.id}')"><b>${b.name}</b> <span class="muted">${b.type === 'moon' ? 'moon' : 'planet'}</span>
        ${ms.sel === b ? bodyInfo(b) + destButton(b) : `<p>g ${b.g} m/s² · ${atmoText(b)}</p>`}</div>`;
    }
    if (!F.moons.length) h += '<p class="muted">This planet has no moons.</p>';
  }
  $('mapInfo').innerHTML = h;
}
function mapSelect(id) {
  const b = bodyById(id);
  ms.focus = planetOf(b);
  ms.sel = b;
  renderMapInfo();
}
function travelTo(id) {
  if (!isUnlocked(bodyById(id))) return;
  travel(id);
}
