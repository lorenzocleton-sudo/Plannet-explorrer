'use strict';
// ---------- terraform tool: raise / lower the ground where you aim ----------
const BRUSH_SIZES = [1.5, 2.5, 4, 6, 9];
const TERRA_RATE = 5, TERRA_RANGE = 40, TERRA_MIN = -60, TERRA_MAX = 150;
let brushIdx = 1, terraDirty = false, terraSaveT = 0;
const brushR = () => BRUSH_SIZES[brushIdx];

function setBrush(i) {
  brushIdx = clamp(i, 0, BRUSH_SIZES.length - 1);
  $('tBrush').textContent = `BRUSH ${brushR()}m`;
}

const aimMarker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x8ef0a0, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
aimMarker.renderOrder = 9;
sharedGeos.add(aimMarker.geometry); sharedMats.add(aimMarker.material);

// march a ray from the camera, aimed at a point in front of the player, until it hits the ground
const _ro = new THREE.Vector3(), _rd = new THREE.Vector3(), _rp2 = new THREE.Vector3(), _rn = new THREE.Vector3();
const AIM_AHEAD = 7;
function aimPoint() {
  camera.getWorldPosition(_ro);
  _rd.copy(player.pos).addScaledVector(player.up, 1.6).addScaledVector(player.fwd, AIM_AHEAD).sub(_ro).normalize();
  const below = t => { _rp2.copy(_ro).addScaledVector(_rd, t); _rn.copy(_rp2).normalize(); return _rp2.length() <= world.R + groundH(_rn); };
  const maxT = opts.dist + TERRA_RANGE;
  let prev = 0;
  for (let t = 0.5; t <= maxT; t += 0.5) {
    if (below(t)) {
      let a = prev, b = t;
      for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (below(m)) b = m; else a = m; }
      _rp2.copy(_ro).addScaledVector(_rd, b);
      if (_rp2.distanceTo(player.pos) > TERRA_RANGE) return null;
      return _rp2.clone().normalize();
    }
    prev = t;
  }
  return null;
}

// change the height of every grid vertex inside the brush (across cube faces)
const _fd = new THREE.Vector3();
function applyBrush(center, amount) {
  const w = world, S = w.S, S1 = S + 1, R = w.R, r = brushR();
  const cellAng = (Math.PI / 2) / S, win = Math.ceil(r / R / cellAng * 1.6) + 2;
  const terra = save.terra[w.body.id] || (save.terra[w.body.id] = {});
  const touched = new Set();
  FACES.forEach((F, f) => {
    const dn = center.dot(F.n);
    if (dn < 0.3) return;
    const gx = (Math.atan(center.dot(F.u) / dn) * 4 / Math.PI + 1) / 2 * S;
    const gy = (Math.atan(center.dot(F.v) / dn) * 4 / Math.PI + 1) / 2 * S;
    const i0 = Math.max(0, Math.floor(gx) - win), i1 = Math.min(S, Math.ceil(gx) + win);
    const j0 = Math.max(0, Math.floor(gy) - win), j1 = Math.min(S, Math.ceil(gy) + win);
    if (i0 > i1 || j0 > j1) return;
    const fc = w.faces[f];
    let changed = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * S1 + i;
      _fd.set(fc.dir[k * 3], fc.dir[k * 3 + 1], fc.dir[k * 3 + 2]);
      const dist = Math.acos(clamp(_fd.dot(center), -1, 1)) * R;
      if (dist >= r) continue;
      if (Math.acos(clamp(_fd.dot(w.L), -1, 1)) * R < LANDER_R + 2) continue; // keep the landing pad intact
      const fall = 1 - (dist / r) * (dist / r);
      const old = fc.h[k], nh = clamp(old + amount * fall * fall, TERRA_MIN, TERRA_MAX);
      if (nh === old) continue;
      fc.h[k] = nh;
      const key = f * w.NV + k;
      terra[key] = Math.round(((terra[key] || 0) + nh - old) * 100) / 100;
      const rad = R + nh;
      fc.pos[k * 3] = fc.dir[k * 3] * rad; fc.pos[k * 3 + 1] = fc.dir[k * 3 + 1] * rad; fc.pos[k * 3 + 2] = fc.dir[k * 3 + 2] * rad;
      recolorVertex(w, fc, k);
      changed = true;
    }
    if (changed) {
      fc.mesh.geometry.attributes.position.needsUpdate = true;
      fc.mesh.geometry.attributes.color.needsUpdate = true;
      touched.add(f);
    }
  });
  if (!touched.size) return;
  terraDirty = true;
  // keep samples, mining spots and drills sitting on the new ground
  for (const it of w.items) {
    if (it.dir.distanceTo(center) * R > r + 1) continue;
    const h = groundH(it.dir);
    it.gr = R + (it.cat === 'plant' && w.hasSea ? Math.max(h, 0) : h);
    it.pos.copy(it.dir).multiplyScalar(it.gr);
    placeOnSurface(it.mesh, it.dir, it.gr, it.rot);
    it.label.position.copy(it.dir).multiplyScalar(it.gr + LABEL_Y[it.cat] * it.s + 0.3);
  }
  for (const sp of w.spots) if (sp.dir.distanceTo(center) * R < r + 2) placeSpot(sp);
}

let terraAim = null;
function useTerraform(raise, lower, dt) {
  terraAim = aimPoint();
  if (terraAim && (raise || lower)) applyBrush(terraAim, (raise ? 1 : -1) * TERRA_RATE * dt);
  terraSaveT -= dt;
  if (terraDirty && (terraSaveT <= 0 || !(raise || lower))) { writeSave(); terraDirty = false; terraSaveT = 2; }
}

function syncTerraform() {
  const on = TOOLS[tool].id === 'terraform' && !menu;
  if (aimMarker.parent !== world.scene) world.scene.add(aimMarker);
  if (on && menu === null) terraAim = aimPoint();
  aimMarker.visible = on && !!terraAim;
  if (!aimMarker.visible) return;
  placeOnSurface(aimMarker, terraAim, world.R + groundH(terraAim) + 0.15);
  aimMarker.scale.setScalar(brushR());
  const lowering = keys.has('r') || mouseAlt || touchAlt;
  aimMarker.material.color.setHex(lowering ? 0xffa060 : 0x8ef0a0);
}

addEventListener('keydown', e => {
  if (menu) return;
  if (e.key === '[' || e.key === '-') setBrush(brushIdx - 1);
  if (e.key === ']' || e.key === '=' || e.key === '+') setBrush(brushIdx + 1);
});
$('tBrush').addEventListener('click', () => setBrush((brushIdx + 1) % BRUSH_SIZES.length));
setBrush(brushIdx);

promptHooks.unshift(() => {
  if (TOOLS[tool].id !== 'terraform') return '';
  if (!terraAim) return 'Aim at the ground (within 40 m) to terraform';
  return isTouch ? `RAISE / LOWER the ground · brush ${brushR()} m` : `[E]/Left click raise · [R]/Right click lower · [ ] brush ${brushR()} m`;
});
