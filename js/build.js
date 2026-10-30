'use strict';
// ---------- build mode: preview, rotate, place, deconstruct ----------
const build = { active: false, mode: 'place', type: null, rot: 0, ghost: null, ring: null, check: null, target: null, holdT: 0 };
const REMOVE_HOLD = 0.6, AIM_AHEAD = 7;
const GHOST_OK = new THREE.MeshBasicMaterial({ color: 0x6dff9a, transparent: true, opacity: 0.45, depthWrite: false });
const GHOST_BAD = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.45, depthWrite: false });
const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const RING_GEO = new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2);
[GHOST_OK, GHOST_BAD, RING_MAT].forEach(m => sharedMats.add(m));
sharedGeos.add(RING_GEO);
// machines are unlocked through the tech tree (stage 5 fills this in)
function machineUnlocked(type) { return typeof techHas === 'function' ? techHas(type) : true; }

// ---------- aiming: ray from the camera through a point just ahead of you ----------
const _bo = new THREE.Vector3(), _bd = new THREE.Vector3(), _bq = new THREE.Vector3(), _bn = new THREE.Vector3();
function aimDir() {
  camera.getWorldPosition(_bo);
  _bd.copy(player.pos).addScaledVector(player.up, 1.6).addScaledVector(player.fwd, AIM_AHEAD).sub(_bo).normalize();
  const below = t => { _bq.copy(_bo).addScaledVector(_bd, t); _bn.copy(_bq).normalize(); return _bq.length() <= surfaceR(_bn); };
  let prev = 0;
  for (let t = 0.5; t <= opts.dist + BUILD_REACH + 30; t += 0.5) {
    if (below(t)) {
      let a = prev, b = t;
      for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (below(m)) b = m; else a = m; }
      const hit = _bq.copy(_bo).addScaledVector(_bd, b);
      if (hit.distanceTo(player.pos) <= BUILD_REACH) return hit.normalize().clone();
      break;
    }
    prev = t;
  }
  // looking at the sky or far away: use the ground just in front of you
  return player.pos.clone().addScaledVector(player.fwd, AIM_AHEAD).normalize();
}

// can `type` go at `dir`? returns { ok, reason, dir, spot, pos }
function checkPlacement(type, dir) {
  const def = MACHINES[type], R = world.R;
  if (!dir) return { ok: false, reason: 'Aim at the ground' };
  let spot = null;
  if (def.onSpot) {
    const p = dir.clone().multiplyScalar(R + groundH(dir));
    let bd = 6;
    for (const sp of world.spots) { const d = sp.pos.distanceTo(p); if (d < bd) { bd = d; spot = sp; } }
    if (!spot) return { ok: false, reason: 'Drills go on a mining spot (labelled "deposit")', dir };
    if (spot.machine) return { ok: false, reason: 'This spot already has a drill', dir: spot.dir };
    dir = spot.dir;
  }
  const h = groundH(dir), pos = dir.clone().multiplyScalar(R + h), res = { ok: false, dir, spot, pos };
  if (world.hasSea && h < 0.3) return Object.assign(res, { reason: "Can't build in water" });
  if (pos.distanceTo(player.pos) > BUILD_REACH) return Object.assign(res, { reason: 'Too far away' });
  if (pos.distanceTo(world.landerPos) < LANDER_R + def.fp + 1) return Object.assign(res, { reason: 'Too close to the lander pad' });
  tangentOf(dir, _bn);
  const t2 = dir.clone().cross(_bn);
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const q = dir.clone().multiplyScalar(R).addScaledVector(_bn, a * def.fp).addScaledVector(t2, b * def.fp).normalize();
    if (Math.abs(groundH(q) - h) > def.fp * 0.8 + 0.3) return Object.assign(res, { reason: 'Ground too steep' });
  }
  for (const b of world.buildings) if (b.pos.distanceTo(pos) < def.fp + b.def.fp + 0.2) return Object.assign(res, { reason: `Too close to the ${b.def.name}` });
  if (!canAfford(def.cost)) return Object.assign(res, { reason: `Needs ${costText(def.cost)}` });
  return Object.assign(res, { ok: true });
}

// ---------- entering / leaving build mode ----------
function ghostOf(type) {
  const g = machineModel(type);
  g.traverse(o => { if (o.isMesh) { o.material = GHOST_OK; o.castShadow = false; } });
  return g;
}
function rangeOf(type) {
  const d = MACHINES[type];
  return d.gen || d.capacity ? POWER_RANGE : d.storage ? STORAGE_RANGE : type === 'o2gen' ? O2_RANGE : 0;
}
function startPlacing(type) {
  stopBuild();
  for (const k in menus) menus[k].classList.remove('show');
  menu = null;
  Object.assign(build, { active: true, mode: 'place', type, ghost: ghostOf(type), holdT: 0 });
  build.ring = new THREE.Mesh(RING_GEO, RING_MAT);
  build.ring.renderOrder = 9;
  world.scene.add(build.ghost, build.ring);
  document.body.classList.add('building');
  syncBuildBar();
  lockPointer();
}
function startRemoving() {
  stopBuild();
  for (const k in menus) menus[k].classList.remove('show');
  menu = null;
  Object.assign(build, { active: true, mode: 'remove', type: null, holdT: 0 });
  build.ring = new THREE.Mesh(RING_GEO, GHOST_BAD);
  build.ring.renderOrder = 9;
  world.scene.add(build.ring);
  document.body.classList.add('building');
  syncBuildBar();
  lockPointer();
}
function stopBuild() {
  if (build.ghost) world.scene.remove(build.ghost);
  if (build.ring) world.scene.remove(build.ring);
  Object.assign(build, { active: false, ghost: null, ring: null, target: null, check: null });
  document.body.classList.remove('building');
  touchAct = tapAct = false;
}
const rotateBuild = () => { build.rot = (build.rot + Math.PI / 4) % (Math.PI * 2); };

// ---------- per frame while building ----------
function updateBuild(dt, act, pressed) {
  if (build.mode === 'place') {
    const c = build.check = checkPlacement(build.type, aimDir());
    build.ghost.visible = !!c.dir;
    if (c.dir) {
      const r = world.R + groundH(c.dir);
      placeOnSurface(build.ghost, c.dir, r, build.rot);
      build.ghost.traverse(o => { if (o.isMesh) o.material = c.ok ? GHOST_OK : GHOST_BAD; });
      const range = rangeOf(build.type);
      build.ring.visible = range > 0;
      if (range) { placeOnSurface(build.ring, c.dir, r + 0.3); build.ring.scale.setScalar(range); }
    } else build.ring.visible = false;
    if (pressed) {
      if (c.ok) placeMachine(build.type, c);
      else toast(c.reason || "Can't build here", 'bad');
    }
  } else {
    // deconstruct: target the building nearest to where you aim (or to you)
    const d = aimDir(), p = d ? d.clone().multiplyScalar(world.R + groundH(d)) : player.pos;
    let best = null, bd = 4;
    for (const b of world.buildings) { const dd = Math.min(b.pos.distanceTo(p), b.pos.distanceTo(player.pos) + 1); if (dd < bd) { bd = dd; best = b; } }
    if (best !== build.target) build.holdT = 0;
    build.target = best;
    build.ring.visible = !!best;
    if (best) { placeOnSurface(build.ring, best.dir, best.pos.length() + 0.3); build.ring.scale.setScalar(best.def.fp + 0.6); }
    if (best && act) {
      build.holdT += dt;
      if (build.holdT >= REMOVE_HOLD) { deconstruct(best); build.holdT = 0; }
    } else build.holdT = 0;
  }
}

function placeMachine(type, c) {
  const def = MACHINES[type];
  if (!payCost(def.cost)) { toast(`Needs ${costText(def.cost)}`, 'bad'); return; }
  const base = baseData();
  const rec = { u: base.n++, t: type, d: c.dir.toArray().map(v => +v.toFixed(6)), r: +build.rot.toFixed(3), s: {} };
  if (def.onSpot) rec.s.spot = c.spot.idx;
  base.list.push(rec);
  spawnBuilding(world, rec);
  if (typeof factoryChanged === 'function') factoryChanged();
  writeSave();
  floater(c.pos, c.dir, `${def.name} built`, '#8ef0a0');
  if (!canAfford(def.cost)) { toast(`Built a ${def.name}. Out of materials for another one.`); stopBuild(); }
}

// everything a building holds (stage 4 machines add their buffers)
function buildingContents(b) {
  const out = {};
  const addAll = inv => { for (const id in inv || {}) out[id] = (out[id] || 0) + inv[id]; };
  addAll(b.rec.s.items); addAll(b.rec.s.buf); addAll(b.rec.s.out);
  return out;
}
function deconstruct(b) {
  const items = Object.assign({}, b.def.cost);
  for (const [id, n] of Object.entries(buildingContents(b))) items[id] = (items[id] || 0) + n;
  // don't count the building's own storage as somewhere to put things
  const stores = nearbyStores().filter(s => s.inv !== b.rec.s.items);
  if (!refundItems(items, stores)) { toast('Not enough room in your inventory (or nearby storage) for the materials.', 'bad'); return; }
  removeBuilding(world, b);
  if (typeof factoryChanged === 'function') factoryChanged();
  writeSave();
  floater(b.pos, b.dir, `${b.def.name} removed: materials returned`, '#ffd166');
}

// ---------- build menu ----------
function openBuildMenu() {
  if (menu || cutscene) return;
  stopBuild();
  showMenu('build');
}
function renderBuildMenu() {
  const stores = nearbyStores();
  let h = `<h2>Build</h2><p class="sub">Materials come from your inventory, crates nearby and the lander's hold (its drone delivers anywhere on this world). Deconstructing gives everything back.</p><div class="bgrid">`;
  for (const type in MACHINES) {
    const def = MACHINES[type], unlocked = machineUnlocked(type), ok = unlocked && canAfford(def.cost, stores);
    const cost = Object.entries(def.cost).map(([id, n]) => chip(id, n, storesCount(stores, id) < n ? ` <em>(have ${storesCount(stores, id)})</em>` : '')).join(' ');
    h += `<div class="bcard ${unlocked ? '' : 'locked'}"><b>${def.name}</b><p class="muted">${def.desc}</p><div class="chips">${cost}</div>
      ${unlocked ? `<button ${ok ? '' : 'disabled'} onclick="startPlacing('${type}')">${ok ? 'Place' : 'Not enough materials'}</button>` : '<button disabled>Locked: research it in the tech tree</button>'}</div>`;
  }
  h += `</div><div class="row"><button class="ghost" onclick="startRemoving()">Deconstruct mode</button><button class="ghost" onclick="goBack()">Close</button></div>`;
  $('buildBody').innerHTML = h;
}

// ---------- controls ----------
function syncBuildBar() {
  $('bPlace').textContent = build.mode === 'place' ? 'PLACE' : 'HOLD TO REMOVE';
  $('bRotate').style.display = build.mode === 'place' ? '' : 'none';
}
$('bRotate').addEventListener('pointerdown', e => { e.preventDefault(); rotateBuild(); });
$('bCancel').addEventListener('click', () => stopBuild());
const bPlace = $('bPlace');
bPlace.addEventListener('pointerdown', e => { touchAct = tapAct = true; e.preventDefault(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => bPlace.addEventListener(ev, () => { touchAct = false; }));
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (build.active && k === 'escape') { e.stopImmediatePropagation(); stopBuild(); return; }
  if (menu || cutscene || e.repeat) return;
  if (k === 'b') openBuildMenu();
  if (build.active && k === 'r') rotateBuild();
  if (build.active && k === 'x' && !flying) { build.mode === 'remove' ? startPlacing(build.type || 'crate') : startRemoving(); }
}, true);

promptHooks.unshift(() => {
  if (!build.active) return '';
  if (build.mode === 'remove') {
    if (!build.target) return 'Deconstruct: aim at a building · ' + (isTouch ? 'CANCEL to stop' : '[Esc] to stop');
    return `Hold ${isTouch ? 'REMOVE' : '[E]'} to deconstruct the ${build.target.def.name} (materials come back)` + (build.holdT > 0 ? ` ${Math.round(build.holdT / REMOVE_HOLD * 100)}%` : '');
  }
  const def = MACHINES[build.type], c = build.check;
  const how = isTouch ? 'PLACE · ROTATE · CANCEL' : '[E] place · [R] rotate · [X] deconstruct · [Esc] cancel';
  return `${def.name}: ${c && c.ok ? how : (c && c.reason) || 'Aim at the ground'}`;
});
