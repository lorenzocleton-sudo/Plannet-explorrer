'use strict';
// ---------- beacons and the compass ----------
// Beacons are cheap buildings with a name and a colour you choose: a mast, a glowing orb and a
// faint light beam you can spot from far away. The compass bar at the top of the screen shows
// your heading and markers for beacons, the lander (only within 50 m), your rover and the
// points of interest you have discovered (mining deposits, uncovered fossils).
const BEACON_COLORS = ['#ff5d6d', '#ffb347', '#ffe066', '#7cf29a', '#5fd3ff', '#7d8cff', '#d58bff', '#ffffff'];
const beaconGeo = {};
function beaconModel(color) {
  const g = new THREE.Group(), c = new THREE.Color(color);
  beaconGeo.mast ??= new THREE.CylinderGeometry(0.06, 0.09, 2.6, 8).translate(0, 1.3, 0);
  beaconGeo.foot ??= new THREE.CylinderGeometry(0.35, 0.45, 0.2, 12).translate(0, 0.1, 0);
  beaconGeo.orb ??= new THREE.SphereGeometry(0.22, 16, 12).translate(0, 2.75, 0);
  beaconGeo.beam ??= new THREE.CylinderGeometry(0.12, 0.35, 80, 10, 1, true).translate(0, 42, 0);
  Object.values(beaconGeo).forEach(x => sharedGeos.add(x));
  const mast = new THREE.Mesh(beaconGeo.mast, MAT.steel), foot = new THREE.Mesh(beaconGeo.foot, MAT.dark);
  const orb = new THREE.Mesh(beaconGeo.orb, new THREE.MeshBasicMaterial({ color: c }));
  const beam = new THREE.Mesh(beaconGeo.beam, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  mast.castShadow = foot.castShadow = true;
  g.add(mast, foot, orb, beam);
  g.userData.tint = [orb.material, beam.material];
  return g;
}
function styleBeacon(b) {
  const s = b.rec.s;
  s.name = s.name || 'Beacon';
  s.color = s.color || BEACON_COLORS[4];
  for (const m of b.mesh.userData.tint || []) m.color.set(s.color);
  setDynLabel(b.label, s.name, s.color);
  b.labelText = s.name;
}
// panel: rename and recolour
function beaconPanel(b) {
  const s = b.rec.s;
  return `<div class="opt"><label for="bName">Name</label><input id="bName" maxlength="24" value="${s.name.replace(/"/g, '&quot;')}" onchange="pxBeaconName(this.value)" style="font-size:16px;padding:8px 10px;border-radius:10px;border:1px solid var(--edge);background:rgba(255,255,255,.06);color:var(--text)"></div>
    <h4>Colour</h4><div class="row" style="margin-top:4px">${BEACON_COLORS.map(c => `<button aria-label="colour ${c}" onclick="pxBeaconColor('${c}')" style="width:38px;height:38px;padding:0;border-radius:50%;background:${c};border:${c === s.color ? '3px solid #fff' : '1px solid rgba(255,255,255,.3)'}"></button>`).join('')}</div>`;
}
function pxBeaconName(v) {
  const b = panelTarget; if (!b || b.type !== 'beacon') return;
  b.rec.s.name = String(v).trim().slice(0, 24) || 'Beacon';
  styleBeacon(b); writeSave(); renderPanel();
}
function pxBeaconColor(c) {
  const b = panelTarget; if (!b || b.type !== 'beacon') return;
  b.rec.s.color = c;
  styleBeacon(b); writeSave(); renderPanel();
}

// ---------- compass ----------
const _cpn = new THREE.Vector3(), _cpt = new THREE.Vector3(), _cpf = new THREE.Vector3();
// clockwise angle (radians) from north to a direction, as seen from above at the player
function bearingTo(dir, up, north) {
  _cpt.copy(dir).addScaledVector(up, -dir.dot(up));
  if (_cpt.lengthSq() < 1e-8) return 0;
  return -signedAngle(north, _cpt, up);
}
function compassMarkers() {
  const out = [], P = player.pos;
  for (const b of world.buildings) if (b.type === 'beacon') out.push({ pos: b.pos, color: b.rec.s.color, name: b.rec.s.name, shape: 'beacon' });
  if (landerVisible()) out.push({ pos: world.landerPos, color: '#ff8d8d', name: 'Lander', shape: 'lander' });
  if (typeof roverHere === 'function' && roverHere() && !rover.driving) out.push({ pos: rover.pos, color: '#ffb347', name: 'Rover', shape: 'rover' });
  for (const sp of world.spots) if (sp.seen && !sp.machine) out.push({ pos: sp.pos, color: sp.res.color, name: sp.res.name + ' deposit', shape: 'poi' });
  for (const it of world.items) if (it.cat === 'fossil' && it.revealed && !it.taken && it.pos.distanceTo(P) < 200) out.push({ pos: it.pos, color: '#ffd166', name: 'Fossil', shape: 'poi' });
  return out;
}
function drawCompass() {
  const up = player.up, north = _cpn.copy(world.axis).addScaledVector(up, -world.axis.dot(up));
  if (north.lengthSq() < 1e-6) tangentOf(up, north); else north.normalize();
  const head = bearingTo(_cpf.copy(player.fwd), up, north);
  const W = clamp(VW * 0.38, 220, 520), cx = VW / 2, y = VW < 900 ? 104 : 46, span = Math.PI * 0.42; // ±75°
  const xOf = a => { let d = a - head; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) <= span ? cx + d / span * W / 2 : null; };
  // the bar: a hairline that fades at the ends, ticks every 15°, letters every 45°
  const g = hx.createLinearGradient(cx - W / 2, 0, cx + W / 2, 0);
  g.addColorStop(0, 'rgba(170,220,255,0)'); g.addColorStop(0.15, 'rgba(170,220,255,.5)'); g.addColorStop(0.85, 'rgba(170,220,255,.5)'); g.addColorStop(1, 'rgba(170,220,255,0)');
  hx.fillStyle = g; hx.fillRect(cx - W / 2, y, W, 1);
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  for (let deg = 0; deg < 360; deg += 15) {
    const x = xOf(deg * Math.PI / 180);
    if (x === null) continue;
    const fade = 1 - Math.abs(x - cx) / (W / 2);
    hx.globalAlpha = 0.25 + 0.75 * fade;
    if (deg % 45 === 0) {
      const n = names[deg / 45];
      hudText(n, x, y - 10, n.length === 1 ? 13 : 10, n === 'N' ? '#ff8d8d' : '#e6f0ff', 'bold', 1, 'center');
      hx.fillStyle = '#e6f0ff'; hx.fillRect(x - 0.5, y - 2, 1, 7);
    } else { hx.fillStyle = 'rgba(230,240,255,.7)'; hx.fillRect(x - 0.5, y, 1, 4); }
  }
  hx.globalAlpha = 1;
  // where you're facing
  hx.fillStyle = HUD_C.accent; hx.beginPath(); hx.moveTo(cx, y + 3); hx.lineTo(cx - 5, y + 10); hx.lineTo(cx + 5, y + 10); hx.closePath(); hx.fill();
  hudText(`${Math.round(((head * 180 / Math.PI) % 360 + 360) % 360)}°`, cx, y + 20, 10, HUD_C.accent, '600', 1, 'center');
  // markers (off the bar's ends they sit at the edge as arrows)
  let label = null, best = 0.12;
  for (const m of compassMarkers()) {
    _cpt.copy(m.pos).sub(player.pos);
    const a = bearingTo(_cpt, up, north);
    let d = a - head; d = Math.atan2(Math.sin(d), Math.cos(d));
    const inside = Math.abs(d) <= span, x = cx + clamp(d / span, -1, 1) * W / 2, my = y - 24;
    hx.fillStyle = m.color; hx.shadowColor = 'rgba(0,0,0,.7)'; hx.shadowBlur = 3;
    hx.beginPath();
    if (!inside) { const s = Math.sign(d); hx.moveTo(x + s * 6, my); hx.lineTo(x - s * 2, my - 5); hx.lineTo(x - s * 2, my + 5); }
    else if (m.shape === 'beacon') { hx.moveTo(x, my - 7); hx.lineTo(x + 5, my); hx.lineTo(x, my + 7); hx.lineTo(x - 5, my); }
    else if (m.shape === 'lander') hx.rect(x - 4.5, my - 4.5, 9, 9);
    else hx.arc(x, my, m.shape === 'rover' ? 4.5 : 3, 0, Math.PI * 2);
    hx.closePath(); hx.fill(); hx.shadowBlur = 0;
    if (inside && Math.abs(d) < best) { best = Math.abs(d); label = { m, x, my, dist: _cpt.length() }; }
  }
  // name and distance of the marker you're looking at
  if (label) hudText(`${label.m.name} · ${label.dist < 1000 ? Math.round(label.dist) + ' m' : (label.dist / 1000).toFixed(1) + ' km'}`, label.x, label.my - 15, 11, label.m.color, '600', 0.5, 'center');
}
