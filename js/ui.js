'use strict';
// ---------- menus, codex, star map, HUD ----------
const menus = {
  title: $('title'), pause: $('pause'), options: $('options'), codex: $('codex'), map: $('starmap'), build: $('buildMenu'), machine: $('machine'), tech: $('tech'), admin: $('admin'),
};
let menuOpenedAt = 0, menu = 'title', menuBack = null, suppressUnlockPause = false, lastAutoPause = 0;

function showMenu(name, back = null) {
  for (const k in menus) menus[k].classList.toggle('show', k === name);
  menu = name; menuBack = back; menuOpenedAt = performance.now();
  keys.clear(); touchAct = touchInteract = mouseUse = false;
  if (name === 'pause') renderPause();
  if (name === 'options') renderOptions();
  if (name === 'codex') renderCodex();
  if (name === 'map') renderMap();
  if (name === 'build') renderBuildMenu();
  if (name === 'machine') renderPanel();
  if (name === 'tech') renderTech();
  if (name === 'admin') renderAdmin();
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
$('pTech').onclick = () => openTech('pause');
$('pQuit').onclick = () => { writeSave(); showMenu('title'); };
for (const k of ['codex', 'map', 'build', 'machine', 'tech']) menus[k].addEventListener('click', e => { if (e.target === menus[k] && performance.now() - menuOpenedAt > 400) goBack(); });

function renderPause() {
  $('pauseInfo').textContent = `${world.body.name} · ${save.rp} RP · Backpack ${bag.length}/${BAG_MAX} · Inventory ${invTotal(playerInv())}/${invCap()}`;
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
  $('oDebug').checked = opts.debug;
  if (typeof applyDebug === 'function') applyDebug();
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
  const inv = playerInv(), hold = landerInv(), ids = Object.keys(ITEMS).filter(id => inv[id] || hold[id]);
  h += `<h3>Resources</h3><p class="muted" style="margin:0 0 6px">Inventory ${invTotal(inv)}/${invCap()} · Lander hold ${invTotal(hold)}/${LANDER_CAP}</p>`;
  h += ids.length ? `<div class="grid">${ids.map(id => `<div class="card"><span style="width:20px;height:20px;border-radius:4px;background:${ITEMS[id].color};flex:none"></span><div><b>${itemName(id)}</b>${inv[id] || 0} carried · ${hold[id] || 0} in lander</div></div>`).join('')}</div>`
    : '<p class="muted">Nothing yet. Dig at mining spots by hand or with a drill.</p>';
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
function unlock(i) {
  const P = PLANETS[i];
  if (save.rp < P.cost || save.unlocked.includes(i)) return;
  save.rp -= P.cost;
  save.unlocked.push(i);
  writeSave();
  toast(`${P.name} unlocked!`, 'new');
  renderMapInfo();
}
function travel(id) {
  const b = bodyById(id);
  if (!isUnlocked(b)) return;
  startTravel(id);
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
  $('tAct').textContent = 'USE ' + TOOLS[tool].icon;
}
renderHotbar();

// ---------- touch buttons ----------
const tAct = $('tAct');
tAct.addEventListener('pointerdown', e => { touchAct = tapAct = true; e.preventDefault(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => tAct.addEventListener(ev, () => { touchAct = false; }));
const tInt = $('tInteract');
tInt.addEventListener('pointerdown', e => { touchInteract = tapInteract = true; e.preventDefault(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => tInt.addEventListener(ev, () => { touchInteract = false; }));
$('tJump').addEventListener('pointerdown', e => { jumpQueued = true; e.preventDefault(); });
$('tPause').addEventListener('click', () => { if (!menu) showMenu('pause'); });
if (isTouch) document.body.classList.add('touch');

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
const RADAR_RANGE = 120, RADAR_RES = 48;
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
  if (!world || menu === 'title' || cutscene) return;
  const B = world.body;
  if (hurtFlash > 0) {
    const g = hx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,30,30,${0.55 * hurtFlash})`);
    hx.fillStyle = g; hx.fillRect(0, 0, VW, VH);
  }
  hx.textAlign = 'left';
  hx.fillStyle = 'rgba(10,13,30,.78)'; rr(10, 10, 220, 180, 10); hx.fill();
  hx.fillStyle = '#9fd8ff'; hx.font = 'bold 16px system-ui,sans-serif'; hx.textBaseline = 'top';
  hx.fillText(B.name, 20, 18);
  hx.fillStyle = '#ffd166'; hx.font = '13px system-ui,sans-serif'; hx.textAlign = 'right';
  hx.fillText(save.rp + ' RP', 220, 20); hx.textAlign = 'left';
  hx.fillStyle = B.breathable ? '#8ef0a0' : '#ff9d9d'; hx.font = '11px system-ui,sans-serif';
  const lt = localTime(world, player.up), hh = Math.floor(lt), mm = Math.floor((lt - hh) * 60);
  hx.fillText((B.breathable ? 'Breathable air' : 'No oxygen') + ` · g ${B.g.toFixed(1)} m/s² · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 20, 38);
  const hpc = player.hp < 30 ? (Math.sin(time * 10) > 0 ? '#ff5d5d' : '#a33') : '#e8566b';
  bar(20, 56, 200, 16, player.hp / 100, hpc, `Health ${Math.ceil(player.hp)}`);
  const o2c = player.o2 < 25 ? (Math.sin(time * 10) > 0 ? '#ff5d5d' : '#a33') : '#3ad0ff';
  bar(20, 78, 200, 16, player.o2 / o2Max(), o2c, `O₂ ${Math.ceil(player.o2)} / ${o2Max()}${B.breathable ? ' · breathable air' : ''}`);
  bar(20, 100, 200, 16, bag.length / BAG_MAX, bag.length >= BAG_MAX ? '#e0703a' : '#6bbf59', `Backpack ${bag.length}/${BAG_MAX}`);
  bar(20, 122, 200, 16, 1 - scanT / SCAN_CD, scanT > 0 ? '#555d88' : '#b48cff', scanT > 0 ? `Scanner ${scanT.toFixed(1)}s` : 'Scanner ready [Q]');
  // temperature line: red when it's hurting you
  const temp = player.temp ?? 0, hurtT = climateDamage(temp);
  hx.fillStyle = hurtT > 0 ? (Math.sin(time * 8) > 0 ? '#ff6b6b' : '#ffb3b3') : temp >= HOT_LIMIT || temp <= COLD_LIMIT ? '#8ef0a0' : '#7a86b8';
  hx.font = '11px system-ui,sans-serif'; hx.textBaseline = 'top';
  hx.fillText(`Temp ${Math.round(temp)}°C` + (hurtT > 0 ? (temp > 0 ? ' · TOO HOT' : ' · TOO COLD') + ` (-${hurtT.toFixed(1)} HP/s)` : temp >= HOT_LIMIT ? ' · heat suit OK' : temp <= COLD_LIMIT ? ' · cold suit OK' : ''), 20, 162);
  hx.fillStyle = '#7a86b8';
  hx.fillText(`Altitude ${(player.pos.length() - world.R).toFixed(0)} m · Inventory ${invTotal(playerInv())}/${invCap()}`, 20, 146);

  const sig = fossilSignal();
  if (sig < 50) {
    const bars = sig < 15 ? 3 : sig < 30 ? 2 : 1;
    hx.fillStyle = 'rgba(10,13,30,.78)'; rr(10, 196, 220, 26, 8); hx.fill();
    hx.fillStyle = '#ffd166'; hx.font = '12px system-ui,sans-serif'; hx.textBaseline = 'middle';
    hx.fillText('Ancient life signal', 20, 209);
    for (let i = 0; i < 3; i++) {
      hx.fillStyle = i < bars ? '#ffd166' : 'rgba(255,255,255,.15)';
      hx.fillRect(170 + i * 14, 214 - (i + 1) * 4, 10, (i + 1) * 4);
    }
  }

  if (opts.minimap) {
    radarT -= dt;
    if (radarT <= 0) { updateRadar(); radarT = 0.25; }
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
      hx.fillStyle = sp.res.color; hx.strokeStyle = sp.machine ? '#ffc23a' : '#000';
      hx.beginPath(); hx.moveTo(p[0], p[1] - 5); hx.lineTo(p[0] + 4, p[1]); hx.lineTo(p[0], p[1] + 5); hx.lineTo(p[0] - 4, p[1]); hx.closePath(); hx.fill(); hx.stroke();
    }
    const lp = landerVisible() && radarPoint(world.landerPos, cx, cy, rad);
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
  const mb = nearestBuilding();
  if (atLander()) prompt = `Lander: samples analyzed, O₂ refilling · ${KEY.interact} open the lander (storage, star map)`;
  else if (mb && !build.active) prompt = `${KEY.interact} ${mb.def.name} · ${machineStatus(mb)}`;
  else if (toolPrompt()) prompt = toolPrompt();
  else if (near) {
    const k = TOOLS[tool].id === 'collector' ? KEY.use : KEY.interact;
    prompt = near.cat === 'fossil' ? `Hold ${k} to excavate ${spName(near.sp)}` : `${k} Collect ${spName(near.sp)}`;
  }
  if (prompt) {
    hx.font = '15px system-ui,sans-serif';
    const w = hx.measureText(prompt).width + 28;
    hx.fillStyle = 'rgba(10,13,30,.82)'; rr(VW / 2 - w / 2, VH - 124, w, 34, 10); hx.fill();
    hx.fillStyle = '#fff'; hx.fillText(prompt, VW / 2, VH - 107);
  }
  // progress bars: digging by hand, deconstructing
  if (handT > 0.1 && handSpot) {
    const p = toScreen(_v.copy(handSpot.pos).addScaledVector(handSpot.dir, 2));
    if (p) {
      hx.fillStyle = 'rgba(0,0,0,.6)'; rr(p[0] - 30, p[1], 60, 9, 4); hx.fill();
      hx.fillStyle = '#ffc23a'; rr(p[0] - 30, p[1], 60 * Math.min(1, handT / HAND_MINE_TIME), 9, 4); hx.fill();
    }
  }
  if (build.active && build.mode === 'remove' && build.target && build.holdT > 0) {
    const p = toScreen(_v.copy(build.target.pos).addScaledVector(build.target.dir, 2.5));
    if (p) {
      hx.fillStyle = 'rgba(0,0,0,.6)'; rr(p[0] - 30, p[1], 60, 9, 4); hx.fill();
      hx.fillStyle = '#ff6b6b'; rr(p[0] - 30, p[1], 60 * Math.min(1, build.holdT / REMOVE_HOLD), 9, 4); hx.fill();
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

  if (debugOn()) {
    const t = ['ADMIN', adminGod() && 'god mode', adminInfO2() && '∞ O₂', adminFast() && 'fast machines', flying && 'FLYING'].filter(Boolean).join(' · ');
    hx.font = 'bold 12px system-ui,sans-serif'; hx.textBaseline = 'middle';
    const w = hx.measureText(t).width + 16;
    hx.fillStyle = 'rgba(255,194,58,.9)'; rr(10, VH - 52, w, 22, 6); hx.fill();
    hx.fillStyle = '#111'; hx.fillText(t, 18, VH - 41);
  }
  hx.fillStyle = 'rgba(255,255,255,.45)'; hx.font = '11px system-ui,sans-serif'; hx.textBaseline = 'bottom';
  hx.fillText(`Planet Explorer v${VERSION}` + (isTouch ? '' : ' · [Esc] Pause · [C] Codex') + (opts.fps ? ` · ${Math.round(fps)} FPS` : ''), 10, VH - 8);
  if (!isTouch && !document.pointerLockElement && !menu) {
    hx.textAlign = 'center'; hx.textBaseline = 'middle'; hx.font = '13px system-ui,sans-serif';
    hx.fillStyle = 'rgba(255,255,255,.6)'; hx.fillText('Click to capture the mouse for camera control', VW / 2, VH - 150);
    hx.textAlign = 'left';
  }
}
