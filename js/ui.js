'use strict';
// ---------- menus, codex, star map, HUD ----------
const menus = {
  title: $('title'), pause: $('pause'), options: $('options'), codex: $('codex'), map: $('starmap'),
};
let menu = 'title', menuBack = null, suppressUnlockPause = false, lastAutoPause = 0;

function showMenu(name, back = null) {
  for (const k in menus) menus[k].classList.toggle('show', k === name);
  menu = name; menuBack = back;
  keys.clear(); touchAct = touchAlt = mouseUse = mouseAlt = false;
  if (name === 'pause') renderPause();
  if (name === 'options') renderOptions();
  if (name === 'codex') renderCodex();
  if (name === 'map') renderMap();
  if (document.pointerLockElement) { suppressUnlockPause = true; document.exitPointerLock(); }
}
function resume() {
  for (const k in menus) menus[k].classList.remove('show');
  menu = null; menuBack = null;
  lockPointer();
}
function goBack() {
  if (menu === 'title') return;
  if (menuBack) showMenu(menuBack); else resume();
}
function lockPointer() {
  if (isTouch || menu) return;
  try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function openStarMap(back = null) {
  if (!atLander()) { toast('Return to the lander to use the star map.'); return; }
  showMenu('map', back);
}

$('verTag').textContent = 'v' + VERSION;
$('startBtn').onclick = () => {
  if (!world || world.body.id !== save.current) land(save.current);
  resume();
};
$('titleOptBtn').onclick = () => showMenu('options', 'title');
$('pResume').onclick = resume;
$('pCodex').onclick = () => showMenu('codex', 'pause');
$('pMap').onclick = () => openStarMap('pause');
$('pOpt').onclick = () => showMenu('options', 'pause');
$('pQuit').onclick = () => { writeSave(); showMenu('title'); };
for (const k of ['codex', 'map']) menus[k].addEventListener('click', e => { if (e.target === menus[k]) goBack(); });

function renderPause() {
  $('pauseInfo').textContent = `${world.body.name} · ${save.rp} RP · Backpack ${bag.length}/${BAG_MAX} · Cargo ${cargoCount()}/${CARGO_MAX}`;
  const pm = $('pMap');
  pm.disabled = !atLander();
  pm.textContent = atLander() ? 'Star Map' : 'Star Map (go to lander)';
}

// ---------- options ----------
const OPT_IDS = ['oSens', 'oInvert', 'oDist', 'oFov', 'oLabels', 'oMinimap', 'oFps', 'oQuality', 'oShadows'];
function renderOptions() {
  $('oSens').value = opts.sens; $('vSens').textContent = opts.sens.toFixed(1);
  $('oInvert').checked = opts.invert;
  $('oDist').value = opts.dist; $('vDist').textContent = opts.dist + 'm';
  $('oFov').value = opts.fov; $('vFov').textContent = opts.fov + '°';
  $('oLabels').value = opts.labels;
  $('oMinimap').checked = opts.minimap;
  $('oFps').checked = opts.fps;
  $('oQuality').value = opts.quality;
  $('oShadows').checked = opts.shadows;
}
function optChanged() {
  opts.sens = +$('oSens').value;
  opts.invert = $('oInvert').checked;
  opts.dist = +$('oDist').value;
  opts.fov = +$('oFov').value;
  opts.labels = $('oLabels').value;
  opts.minimap = $('oMinimap').checked;
  opts.fps = $('oFps').checked;
  opts.quality = $('oQuality').value;
  opts.shadows = $('oShadows').checked;
  writeOpts(); applyGraphics(); renderOptions();
}
for (const id of OPT_IDS) $(id).addEventListener('input', optChanged);
$('oBack').onclick = goBack;
$('oDefaults').onclick = () => { opts = Object.assign({}, DEFAULT_OPTS); writeOpts(); applyGraphics(); renderOptions(); };
$('oReset').onclick = () => {
  if (!confirm('Erase all research progress?')) return;
  save = defaultSave(); writeSave();
  land('p0');
  toast('Progress reset.');
  showMenu('title');
};

// ---------- codex ----------
const iconCache = {};
function iconFor(sp) {
  if (iconCache[sp.id]) return iconCache[sp.id];
  const c = document.createElement('canvas');
  c.width = c.height = 88;
  const x = c.getContext('2d');
  x.translate(44, 46);
  x.fillStyle = sp.color; x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 3;
  x.beginPath();
  if (sp.cat === 'plant') { x.moveTo(0, -30); x.lineTo(20, 26); x.lineTo(-20, 26); x.closePath(); x.fill(); x.stroke(); }
  else if (sp.cat === 'rock') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; x.lineTo(Math.cos(a) * 26, Math.sin(a) * 19); } x.closePath(); x.fill(); x.stroke(); }
  else if (sp.cat === 'mineral') { x.moveTo(0, -32); x.lineTo(18, 0); x.lineTo(0, 32); x.lineTo(-18, 0); x.closePath(); x.fill(); x.stroke(); }
  else if (sp.cat === 'dust') { x.ellipse(0, 10, 28, 14, 0, Math.PI, 0); x.closePath(); x.fill(); x.stroke(); }
  else if (sp.cat === 'ice') { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; x.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); } x.closePath(); x.fill(); x.stroke(); }
  else { x.strokeStyle = sp.color; x.lineWidth = 10; x.arc(0, 0, 20, 0, Math.PI * 2); x.stroke(); }
  return (iconCache[sp.id] = c.toDataURL());
}
function codexSection(body) {
  const S = genSpecies(body);
  let tot = 0, got = 0, h = '';
  for (const cat in S) for (const sp of S[cat]) { tot++; if (known(sp)) got++; }
  h += `<h3>${body.name}${body.type === 'moon' ? ` <span class="muted">(moon of ${body.parent.name})</span>` : ''} <span class="muted" style="font-size:14px">— ${got}/${tot} species catalogued</span></h3>`;
  for (const cat in S) {
    h += `<h4>${CATS[cat].label}</h4><div class="grid">`;
    for (const sp of S[cat]) {
      if (known(sp)) {
        const extra = cat === 'fossil' ? `~${sp.age} million yrs old` : `${sp.value} RP each`;
        h += `<div class="card"><img src="${iconFor(sp)}" alt=""><div><b>${sp.name}</b>×${save.codex[sp.id]} · <span class="muted">${extra}</span></div></div>`;
      } else {
        h += `<div class="card unk"><img alt=""><div><b>???</b><span class="muted">Not yet analyzed</span></div></div>`;
      }
    }
    h += '</div>';
  }
  return h;
}
function renderCodex() {
  let h = `<h2>Research Codex</h2><p class="sub">Research Points: <b>${save.rp}</b> &nbsp;·&nbsp; Backpack: ${bag.length}/${BAG_MAX} (deposit at lander to analyze)</p>`;
  const owned = RESOURCES.filter(r => save.res[r.id] || cargo[r.id]);
  h += `<h3>Mined resources</h3>`;
  h += owned.length ? `<div class="grid">${owned.map(r => `<div class="card"><span style="width:20px;height:20px;border-radius:4px;background:${r.color};flex:none"></span><div><b>${r.name}</b>${save.res[r.id] || 0} stored${cargo[r.id] ? ` · ${cargo[r.id]} carried` : ''} · <span class="muted">${TIER_NAMES[r.tier]}</span></div></div>`).join('')}</div>`
    : '<p class="muted">Nothing mined yet. Place drills on mining spots with the Drill tool.</p>';
  const cur = bodyById(save.current);
  h += codexSection(cur);
  for (const b of BODIES) if (b !== cur && save.atmo[b.id]) h += codexSection(b);
  h += `<div class="row"><button onclick="goBack()">Close</button></div>`;
  $('codexBody').innerHTML = h;
}

// ---------- star map ----------
function atmoText(b) {
  if (!save.atmo[b.id]) return 'Atmosphere: unknown';
  return b.breathable ? 'Atmosphere: breathable' : 'No breathable oxygen';
}
function renderMap() {
  let h = `<h2>Star Map</h2><p class="sub">Research Points: <b>${save.rp}</b> — spend them to unlock new worlds. Moons open up with their planet.</p><div class="planets">`;
  PLANETS.forEach(P => {
    const [hh, s, l] = P.col.plains, [ch, cs, cl] = P.col.crystal;
    const orb = `background:radial-gradient(circle at 35% 35%, hsl(${hh},${s}%,${l + 18}%), hsl(${hh},${s}%,${l}%) 55%, hsl(${ch},${cs}%,${cl - 20}%))`;
    const unlocked = isUnlocked(P);
    let btn;
    if (P.id === save.current) btn = `<button disabled>You are here</button>`;
    else if (unlocked) btn = `<button onclick="travel('${P.id}')">Land</button>`;
    else btn = `<button ${save.rp >= P.cost ? '' : 'disabled'} onclick="unlock(${P.idx})">Unlock · ${P.cost} RP</button>`;
    let moons = P.moons.length ? '' : '<p class="muted">No moons</p>';
    for (const M of P.moons) {
      moons += `<p>${M.name} · g ${M.g} · ${M.id === save.current ? '<b>here</b>' : unlocked ? `<button class="ghost" style="padding:4px 10px" onclick="travel('${M.id}')">Land</button>` : 'locked'}</p>`;
    }
    h += `<div class="pcard ${P.id === save.current ? 'cur' : ''}"><div class="orb" style="${orb}"></div>
      <b>${P.name}</b>
      <p class="muted">${P.desc}</p>
      <p>Gravity ${P.g} m/s² · ${atmoText(P)}</p>${btn}${moons}</div>`;
  });
  h += `</div><div class="row"><button class="ghost" onclick="goBack()">Close</button></div>`;
  $('mapBody').innerHTML = h;
}
function unlock(i) {
  const P = PLANETS[i];
  if (save.rp < P.cost || save.unlocked.includes(i)) return;
  save.rp -= P.cost;
  save.unlocked.push(i);
  writeSave();
  toast(`${P.name} unlocked!`, 'new');
  renderMap();
}
function travel(id) {
  const b = bodyById(id);
  if (!isUnlocked(b)) return;
  land(id);
  resume();
}

// ---------- hotbar ----------
const hotbar = $('hotbar');
TOOLS.forEach((T, i) => {
  const b = document.createElement('button');
  b.className = 'slot';
  b.innerHTML = `<span class="num">${i + 1}</span><span class="ico">${T.icon}</span><span class="nm">${T.name}</span>`;
  b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (!menu) selectTool(i); });
  hotbar.appendChild(b);
});
function renderHotbar() {
  [...hotbar.children].forEach((b, i) => b.classList.toggle('sel', i === tool));
  $('tAct').textContent = { scanner: 'SCAN', collector: 'GRAB', drill: 'DRILL', terraform: 'RAISE' }[TOOLS[tool].id];
  $('tAlt').style.display = TOOLS[tool].id === 'terraform' ? '' : 'none';
  $('tBrush').style.display = TOOLS[tool].id === 'terraform' ? '' : 'none';
}
renderHotbar();

// ---------- touch buttons ----------
const tAct = $('tAct');
tAct.addEventListener('pointerdown', e => { touchAct = true; e.preventDefault(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => tAct.addEventListener(ev, () => { touchAct = false; }));
const tAlt = $('tAlt');
tAlt.addEventListener('pointerdown', e => { touchAlt = true; e.preventDefault(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => tAlt.addEventListener(ev, () => { touchAlt = false; }));
$('tScan').addEventListener('pointerdown', e => { doScan(); e.preventDefault(); });
$('tJump').addEventListener('pointerdown', e => { jumpQueued = true; e.preventDefault(); });
$('tCodex').addEventListener('click', () => { if (!menu) showMenu('codex'); });
$('tMap').addEventListener('click', () => { if (!menu) openStarMap(); });
$('tPause').addEventListener('click', () => { if (!menu) showMenu('pause'); });
if (isTouch) { $('touch').classList.add('show'); document.body.classList.add('touch'); }

// ---------- HUD ----------
function rr(x, y, w, h, r) {
  hx.beginPath();
  hx.moveTo(x + r, y); hx.arcTo(x + w, y, x + w, y + h, r); hx.arcTo(x + w, y + h, x, y + h, r);
  hx.arcTo(x, y + h, x, y, r); hx.arcTo(x, y, x + w, y, r); hx.closePath();
}
function bar(x, y, w, h, frac, color, label) {
  hx.fillStyle = 'rgba(255,255,255,.1)'; rr(x, y, w, h, 4); hx.fill();
  hx.fillStyle = color; rr(x, y, Math.max(0, w * clamp(frac, 0, 1)), h, 4); hx.fill();
  hx.fillStyle = '#fff'; hx.font = '11px system-ui,sans-serif'; hx.textBaseline = 'middle'; hx.textAlign = 'left';
  hx.fillText(label, x + 6, y + h / 2 + 0.5);
}
const _v = new THREE.Vector3();
function toScreen(p) {
  _v.copy(p).project(camera);
  if (_v.z > 1) return null;
  return [(_v.x + 1) / 2 * VW, (1 - _v.y) / 2 * VH];
}

// radar minimap: top-down view of the ground around you, rotated so "up" is where the camera looks
const RADAR_RANGE = 90, RADAR_RES = 72;
const radar = document.createElement('canvas');
radar.width = radar.height = RADAR_RES;
const rctx = radar.getContext('2d'), radarImg = rctx.createImageData(RADAR_RES, RADAR_RES);
let radarT = 0;
const _rp = new THREE.Vector3(), _rr = new THREE.Vector3();
function updateRadar() {
  const right = _rr.copy(player.fwd).cross(player.up), R = world.R;
  const [sh, ss, sl] = world.hasSea ? world.body.col.liquid : [0, 0, 0];
  const sea = hsl2rgb(sh, ss, sl + 10);
  for (let py = 0; py < RADAR_RES; py++) for (let px = 0; px < RADAR_RES; px++) {
    const o = (py * RADAR_RES + px) * 4;
    const nx = px / (RADAR_RES - 1) * 2 - 1, ny = py / (RADAR_RES - 1) * 2 - 1;
    if (nx * nx + ny * ny > 1) { radarImg.data[o + 3] = 0; continue; }
    _rp.copy(player.up).multiplyScalar(R).addScaledVector(right, nx * RADAR_RANGE).addScaledVector(player.fwd, -ny * RADAR_RANGE).normalize();
    const c = world.hasSea && groundH(_rp) < 0 ? sea : colorAtDir(_rp);
    radarImg.data[o] = c[0] * 255; radarImg.data[o + 1] = c[1] * 255; radarImg.data[o + 2] = c[2] * 255; radarImg.data[o + 3] = 255;
  }
  rctx.putImageData(radarImg, 0, 0);
}
function radarPoint(p, cx, cy, rad) {
  _rp.copy(p).sub(player.pos);
  const x = _rp.dot(_rr.copy(player.fwd).cross(player.up)), y = -_rp.dot(player.fwd);
  const d = Math.hypot(x, y);
  if (d > RADAR_RANGE) return null;
  return [cx + x / RADAR_RANGE * rad, cy + y / RADAR_RANGE * rad];
}

// stage hooks: tools can override the bottom prompt
function toolPrompt() {
  for (const h of promptHooks) { const t = h(); if (t) return t; }
  return '';
}

let fps = 60;
function drawHUD(dt) {
  hx.setTransform(DPR, 0, 0, DPR, 0, 0);
  hx.clearRect(0, 0, VW, VH);
  if (!world || menu === 'title') return;
  const B = world.body;
  if (hurtFlash > 0) {
    const g = hx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,30,30,${0.55 * hurtFlash})`);
    hx.fillStyle = g; hx.fillRect(0, 0, VW, VH);
  }
  hx.textAlign = 'left';
  hx.fillStyle = 'rgba(10,13,30,.78)'; rr(10, 10, 220, 162, 10); hx.fill();
  hx.fillStyle = '#9fd8ff'; hx.font = 'bold 16px system-ui,sans-serif'; hx.textBaseline = 'top';
  hx.fillText(B.name, 20, 18);
  hx.fillStyle = '#ffd166'; hx.font = '13px system-ui,sans-serif'; hx.textAlign = 'right';
  hx.fillText(save.rp + ' RP', 220, 20); hx.textAlign = 'left';
  hx.fillStyle = B.breathable ? '#8ef0a0' : '#ff9d9d'; hx.font = '11px system-ui,sans-serif';
  hx.fillText((B.breathable ? 'Breathable air' : 'No oxygen') + ` · g ${B.g.toFixed(1)} m/s²`, 20, 38);
  const hpc = player.hp < 30 ? (Math.sin(time * 10) > 0 ? '#ff5d5d' : '#a33') : '#e8566b';
  bar(20, 56, 200, 16, player.hp / 100, hpc, `Health ${Math.ceil(player.hp)}`);
  const o2c = player.o2 < 25 ? (Math.sin(time * 10) > 0 ? '#ff5d5d' : '#a33') : '#3ad0ff';
  bar(20, 78, 200, 16, player.o2 / 100, o2c, `O₂ ${Math.ceil(player.o2)}%`);
  bar(20, 100, 200, 16, bag.length / BAG_MAX, bag.length >= BAG_MAX ? '#e0703a' : '#6bbf59', `Backpack ${bag.length}/${BAG_MAX}`);
  bar(20, 122, 200, 16, 1 - scanT / SCAN_CD, scanT > 0 ? '#555d88' : '#b48cff', scanT > 0 ? `Scanner ${scanT.toFixed(1)}s` : 'Scanner ready [Q]');
  hx.fillStyle = '#7a86b8'; hx.font = '11px system-ui,sans-serif'; hx.textBaseline = 'top';
  hx.fillText(`Altitude ${(player.pos.length() - world.R).toFixed(0)} m · Cargo ${cargoCount()}/${CARGO_MAX} · Drills ${DRILLS_MAX - drillsPlaced()}/${DRILLS_MAX}`, 20, 146);

  const sig = fossilSignal();
  if (sig < 50) {
    const bars = sig < 15 ? 3 : sig < 30 ? 2 : 1;
    hx.fillStyle = 'rgba(10,13,30,.78)'; rr(10, 178, 220, 26, 8); hx.fill();
    hx.fillStyle = '#ffd166'; hx.font = '12px system-ui,sans-serif'; hx.textBaseline = 'middle';
    hx.fillText('Ancient life signal', 20, 191);
    for (let i = 0; i < 3; i++) {
      hx.fillStyle = i < bars ? '#ffd166' : 'rgba(255,255,255,.15)';
      hx.fillRect(170 + i * 14, 196 - (i + 1) * 4, 10, (i + 1) * 4);
    }
  }

  if (opts.minimap) {
    radarT -= dt;
    if (radarT <= 0) { updateRadar(); radarT = 0.12; }
    const ms = Math.min(150, VW * 0.28), rad = ms / 2, cx = VW - rad - 12, cy = rad + 12;
    hx.fillStyle = 'rgba(10,13,30,.78)'; hx.beginPath(); hx.arc(cx, cy, rad + 4, 0, Math.PI * 2); hx.fill();
    hx.imageSmoothingEnabled = true;
    hx.drawImage(radar, cx - rad, cy - rad, ms, ms);
    for (const it of world.items) {
      if (it.taken || !((it.cat === 'fossil' && it.revealed) || it.ping > 0)) continue;
      const p = radarPoint(it.pos, cx, cy, rad);
      if (p) { hx.fillStyle = it.cat === 'fossil' ? '#ffd166' : 'rgba(255,255,255,.85)'; hx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3); }
    }
    for (const sp of world.spots) {
      const p = radarPoint(sp.pos, cx, cy, rad);
      if (!p) continue;
      hx.fillStyle = sp.res.color; hx.strokeStyle = sp.drill ? '#ffc23a' : '#000';
      hx.beginPath(); hx.moveTo(p[0], p[1] - 5); hx.lineTo(p[0] + 4, p[1]); hx.lineTo(p[0], p[1] + 5); hx.lineTo(p[0] - 4, p[1]); hx.closePath(); hx.fill(); hx.stroke();
    }
    const lp = radarPoint(world.landerPos, cx, cy, rad);
    if (lp) { hx.fillStyle = '#ff5d5d'; hx.fillRect(lp[0] - 3.5, lp[1] - 3.5, 7, 7); }
    // player arrow (camera always looks "up" on the radar)
    const fa = Math.atan2(player.face.dot(_rr.copy(player.fwd).cross(player.up)), player.face.dot(player.fwd));
    hx.save(); hx.translate(cx, cy); hx.rotate(fa);
    hx.fillStyle = '#fff'; hx.beginPath(); hx.moveTo(0, -6); hx.lineTo(4.5, 5); hx.lineTo(-4.5, 5); hx.closePath(); hx.fill();
    hx.restore();
  }

  // floaters
  hx.font = 'bold 14px system-ui,sans-serif'; hx.textAlign = 'center'; hx.textBaseline = 'middle';
  for (const fl of floaters) {
    const p = toScreen(fl.pos);
    if (!p) continue;
    hx.globalAlpha = 1 - fl.t / 1.4;
    hx.fillStyle = 'rgba(0,0,0,.6)'; hx.fillText(fl.text, p[0] + 1, p[1] + 1);
    hx.fillStyle = fl.color; hx.fillText(fl.text, p[0], p[1]);
  }
  hx.globalAlpha = 1;

  // prompt
  const near = nearestItem();
  let prompt = '';
  if (atLander()) prompt = 'Lander: samples analyzed, O₂ refilling · [M] Star map';
  else if (toolPrompt()) prompt = toolPrompt();
  else if (near && TOOLS[tool].id === 'collector') prompt = near.cat === 'fossil' ? `Hold [E] to excavate ${spName(near.sp)}` : `[E] Collect ${spName(near.sp)}`;
  else if (near) prompt = `Switch to Collector [2] to pick up ${spName(near.sp)}`;
  if (prompt) {
    hx.font = '15px system-ui,sans-serif';
    const w = hx.measureText(prompt).width + 28;
    hx.fillStyle = 'rgba(10,13,30,.82)'; rr(VW / 2 - w / 2, VH - 124, w, 34, 10); hx.fill();
    hx.fillStyle = '#fff'; hx.fillText(prompt, VW / 2, VH - 107);
  }
  if (drillHold > 0.15 && drillHoldSpot) {
    const p = toScreen(_v.copy(drillHoldSpot.pos).addScaledVector(drillHoldSpot.dir, 2));
    if (p) {
      hx.fillStyle = 'rgba(0,0,0,.6)'; rr(p[0] - 30, p[1], 60, 9, 4); hx.fill();
      hx.fillStyle = '#ffc23a'; rr(p[0] - 30, p[1], 60 * Math.min(1, drillHold / PICKUP_TIME), 9, 4); hx.fill();
    }
  }
  if (digTarget) {
    const p = toScreen(_v.copy(digTarget.pos).addScaledVector(digTarget.dir, 1.2));
    if (p) {
      hx.fillStyle = 'rgba(0,0,0,.6)'; rr(p[0] - 30, p[1], 60, 9, 4); hx.fill();
      hx.fillStyle = '#ffd166'; rr(p[0] - 30, p[1], 60 * Math.min(1, digT / DIG_TIME), 9, 4); hx.fill();
    }
  }

  // arrival banner: you only learn about the air once you've landed
  if (arrival) {
    const a = Math.min(1, arrival.t * 3, (5 - arrival.t) * 1.5);
    hx.globalAlpha = Math.max(0, a);
    hx.textAlign = 'center'; hx.textBaseline = 'middle';
    hx.fillStyle = 'rgba(10,13,30,.82)'; rr(VW / 2 - 200, VH * 0.24 - 46, 400, 100, 14); hx.fill();
    hx.fillStyle = '#9fd8ff'; hx.font = 'bold 22px system-ui,sans-serif'; hx.fillText(arrival.title, VW / 2, VH * 0.24 - 20);
    hx.fillStyle = arrival.ok ? '#8ef0a0' : '#ff8d8d'; hx.font = 'bold 17px system-ui,sans-serif'; hx.fillText(arrival.text, VW / 2, VH * 0.24 + 8);
    hx.fillStyle = '#c3cbef'; hx.font = '13px system-ui,sans-serif'; hx.fillText(arrival.sub, VW / 2, VH * 0.24 + 32);
    hx.globalAlpha = 1;
  }
  hx.textAlign = 'left';

  hx.fillStyle = 'rgba(255,255,255,.45)'; hx.font = '11px system-ui,sans-serif'; hx.textBaseline = 'bottom';
  hx.fillText(`Planet Explorer v${VERSION} · [Esc] Pause · [C] Codex` + (opts.fps ? ` · ${Math.round(fps)} FPS` : ''), 10, VH - 8);
  if (!isTouch && !document.pointerLockElement && !menu) {
    hx.textAlign = 'center'; hx.textBaseline = 'middle'; hx.font = '13px system-ui,sans-serif';
    hx.fillStyle = 'rgba(255,255,255,.6)'; hx.fillText('Click to capture the mouse for camera control', VW / 2, VH - 150);
    hx.textAlign = 'left';
  }

  if (joy.active) {
    hx.strokeStyle = 'rgba(255,255,255,.3)'; hx.lineWidth = 2;
    hx.beginPath(); hx.arc(joy.ox, joy.oy, 50, 0, Math.PI * 2); hx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.min(50, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
    hx.fillStyle = 'rgba(255,255,255,.35)';
    hx.beginPath(); hx.arc(joy.ox + Math.cos(a) * l, joy.oy + Math.sin(a) * l, 20, 0, Math.PI * 2); hx.fill();
  }
}
