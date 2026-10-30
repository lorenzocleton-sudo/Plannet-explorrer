'use strict';
// ---------- player, physics on a sphere, gameplay, input ----------
const PICK_R = 2.6, SCAN_R = 34, SCAN_CD = 4, SCAN_TIME = 0.9, BAG_MAX = 10, DIG_TIME = 1.4, JUMP_V = 6.2, WALK_SPEED = 14;

const player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
  fwd: new THREE.Vector3(1, 0, 0), face: new THREE.Vector3(1, 0, 0),
  o2: 100, hp: 100, onGround: true, inLiquid: false, walk: 0, fallTop: 0,
};
const camState = { pitch: 0.35 };
const playerMesh = new THREE.Group();
{
  const suit = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, flatShading: true, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 4, 10), suit);
  body.position.y = 0.95;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x3ad0ff, emissive: 0x1a7fa0, emissiveIntensity: 0.5, roughness: 0.2 }));
  visor.position.set(0, 1.45, 0.38);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x9aa3b8, flatShading: true }));
  pack.position.set(0, 1.05, -0.45);
  playerMesh.add(body, visor, pack);
  playerMesh.traverse(o => { o.castShadow = true; if (o.geometry) sharedGeos.add(o.geometry); if (o.material) sharedMats.add(o.material); });
}
const playerLabel = makeLabel('Researcher', '#9fd8ff', 0.4, false);

let bag = [], floaters = [];
let scanT = 0, pickCd = 0, digT = 0, digTarget = null, lowWarned = false, fullWarnT = 0, time = 0;
let arrival = null; // { t, text, ok }
let hurtFlash = 0, respawned = false;
const SAFE_FALL_ENERGY = 45, FALL_DMG = 0.8, SUFFOCATE_DPS = 12;

// temp vectors
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Vector3();
const _r = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _mat = new THREE.Matrix4();

function land(bodyId) {
  if (world) { world.scene.remove(playerMesh, playerLabel); disposeWorld(world); }
  const body = bodyById(bodyId);
  genBody(body);
  world.scene.add(playerMesh, playerLabel);
  save.current = body.id;
  const firstVisit = !save.atmo[body.id];
  save.atmo[body.id] = true;
  writeSave();
  resetPlayer();
  bag = []; floaters = [];
  digT = 0; digTarget = null; lowWarned = false;
  camState.pitch = 0.35;
  applyGraphics();
  arrival = {
    t: 0, ok: body.breathable,
    title: `${body.name}${body.type === 'moon' ? ' (moon)' : ''}`,
    text: body.breathable ? 'Atmosphere: breathable' : (body.type === 'moon' ? 'No atmosphere: no oxygen' : 'Atmosphere: no breathable oxygen'),
    sub: `Gravity ${body.g.toFixed(1)} m/s²` + (firstVisit ? ' · first visit' : ''),
  };
}

function resetPlayer() {
  const L = world.L;
  tangentOf(L, _t);
  const d = _a.copy(L).multiplyScalar(world.R).addScaledVector(_t, 7).normalize();
  player.pos.copy(d).multiplyScalar(surfaceR(d) + 0.05);
  player.up.copy(d);
  player.vel.set(0, 0, 0);
  // face the lander
  player.fwd.copy(world.landerPos).sub(player.pos);
  player.fwd.addScaledVector(d, -player.fwd.dot(d)).normalize();
  player.face.copy(player.fwd);
  player.o2 = 100;
  player.hp = 100;
  player.onGround = true;
  player.fallTop = player.pos.length();
}

// ---------- toasts / floaters ----------
const toastBox = $('toasts');
function toast(text, cls = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + cls;
  d.textContent = text;
  toastBox.appendChild(d);
  while (toastBox.children.length > 5) toastBox.firstChild.remove();
  setTimeout(() => { d.style.opacity = '0'; }, 3200);
  setTimeout(() => d.remove(), 3800);
}
function floater(pos, up, text, color = '#fff') {
  floaters.push({ pos: pos.clone().addScaledVector(up, 1.5), up: up.clone(), text, color, t: 0 });
}

// ---------- gameplay ----------
const atLander = () => player.pos.distanceTo(world.landerPos) < LANDER_R;
// the lander's marker only shows up when you're close to it
const LANDER_SHOW = 50;
const landerVisible = () => player.pos.distanceTo(world.landerPos) < LANDER_SHOW;

function doScan() {
  if (menu || scanT > 0) return;
  scanT = SCAN_CD;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  placeOnSurface(ring, player.up, player.pos.length() + 0.4);
  ring.renderOrder = 8;
  world.scene.add(ring);
  world.pulses.push({ center: player.pos.clone(), t: 0, found: 0, ring });
}

function deposit() {
  let gained = 0;
  const news = [];
  const col = save.collected[world.body.id] || (save.collected[world.body.id] = []);
  for (const it of bag) {
    const sp = it.sp, first = !known(sp);
    save.codex[sp.id] = (save.codex[sp.id] || 0) + 1;
    gained += first ? sp.value * 3 : sp.value;
    if (first) news.push(sp);
    col.push(it.id);
    it.gone = true;
    world.scene.remove(it.mesh, it.label);
  }
  world.items = world.items.filter(i => !i.gone);
  for (const it of world.items) if (news.includes(it.sp)) setLabelText(it.label, it.sp.name, CATS[it.cat].tag, 0.55, false);
  save.rp += gained;
  toast(`Analyzed ${bag.length} sample${bag.length > 1 ? 's' : ''}: +${gained} RP`);
  for (const sp of news) toast(`NEW DISCOVERY: ${sp.name} (${CATS[sp.cat].one})`, 'new');
  floater(world.landerPos.clone().addScaledVector(world.L, 5), world.L, `+${gained} RP`, '#ffd166');
  bag = [];
  writeSave();
}

// health hit 0: respawn at the lander and lose everything carried but not yet deposited
function die(cause) {
  for (const it of bag) { it.taken = false; it.mesh.visible = true; }
  const lost = bag.length + cargoCount();
  bag = [];
  cargo = {};
  resetPlayer();
  respawned = true;
  lowWarned = false;
  hurtFlash = 1;
  toast(`${cause} Rescue drone brought you back to the lander.${lost ? ` ${lost} unsaved sample${lost > 1 ? 's' : ''} lost.` : ''}`, 'bad');
}
function damage(amount, cause) {
  if (amount <= 0) return;
  player.hp -= amount;
  hurtFlash = Math.min(1, hurtFlash + amount / 40);
  if (player.hp <= 0) die(cause);
}

function collect(it) {
  if (bag.length >= BAG_MAX) {
    if (fullWarnT <= 0) { toast('Backpack full! Return to the lander.', 'bad'); fullWarnT = 2; }
    return;
  }
  it.taken = true;
  it.mesh.visible = false;
  it.label.visible = false;
  bag.push(it);
  floater(it.pos, it.dir, '+' + spName(it.sp), it.cat === 'fossil' ? '#ffd166' : '#bfe8ff');
}

function nearestItem() {
  let best = null, bd = PICK_R;
  for (const it of world.items) {
    if (it.taken || !it.revealed) continue;
    const d = it.pos.distanceTo(player.pos);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
function fossilSignal() {
  let bd = Infinity;
  for (const it of world.items) {
    if (it.cat !== 'fossil' || it.revealed || it.taken) continue;
    const d = it.pos.distanceTo(player.pos);
    if (d < bd) bd = d;
  }
  return bd;
}

// ---------- input ----------
const keys = new Set();
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
const look = { id: null, x: 0, y: 0 };
let touchAct = false, touchAlt = false, mouseUse = false, mouseAlt = false, actPrev = false, jumpQueued = false;

// ---------- tool hotbar ----------
const TOOLS = [
  { id: 'scanner', name: 'Scanner', icon: '📡', hint: 'Pulse to reveal buried fossils and nearby samples' },
  { id: 'collector', name: 'Collector', icon: '🧺', hint: 'Pick up samples (hold to dig up fossils)' },
  { id: 'drill', name: 'Drill', icon: '⛏️', hint: 'Place a drill on a mining spot, collect its resources later' },
  { id: 'terraform', name: 'Terraform', icon: '⛰️', hint: 'Raise or lower the ground where you aim' },
];
let tool = 1;
function selectTool(i) {
  tool = (i + TOOLS.length) % TOOLS.length;
  digT = 0; digTarget = null;
  renderHotbar();
}
// tools defined in mining.js / terraform.js; extra bottom-bar prompts can be registered here
const promptHooks = [];

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (k === 'escape' || k === 'p') {
    if (menu === 'map' && mapZoomOut()) return;
    if (menu === null) showMenu('pause');
    else if (menu === 'pause' && performance.now() - lastAutoPause < 300) {} // pointer-lock exit already paused
    else goBack();
    return;
  }
  if (menu === 'title') { if (k === 'enter') $('startBtn').click(); return; }
  if (menu) return;
  if (!e.repeat) {
    if (k === 'q') doScan();
    if (k === 'c') showMenu('codex');
    if (k === 'm') openStarMap();
    if (k === ' ') jumpQueued = true;
    if (k >= '1' && k <= '4') selectTool(+k - 1);
  }
  keys.add(k);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); touchAct = touchAlt = mouseUse = mouseAlt = false; joy.active = false; if (menu === null) showMenu('pause'); });

function rotateCam(dx, dy) {
  const s = 0.0028 * opts.sens;
  player.fwd.applyAxisAngle(player.up, -dx * s);
  camState.pitch = clamp(camState.pitch + dy * s * (opts.invert ? -1 : 1), -0.25, 1.3);
}
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) {
    const inCutscene = typeof cutscene !== 'undefined' && (cutscene || performance.now() - csEndedAt < 600);
    if (menu === null && !suppressUnlockPause && !inCutscene) { showMenu('pause'); lastAutoPause = performance.now(); }
    suppressUnlockPause = false;
  }
});
let dragging = false;
renderer.domElement.addEventListener('mousedown', e => {
  if (menu) return;
  if (!document.pointerLockElement) { lockPointer(); dragging = true; return; }
  if (e.button === 0) mouseUse = true;
  if (e.button === 2) mouseAlt = true;
});
addEventListener('mouseup', e => { dragging = false; if (e.button === 0) mouseUse = false; if (e.button === 2) mouseAlt = false; });
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => {
  if (menu || Math.abs(e.deltaY) <= 2) return;
  if (e.shiftKey && TOOLS[tool].id === 'terraform') setBrush(brushIdx + (e.deltaY > 0 ? -1 : 1));
  else selectTool(tool + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });
addEventListener('mousemove', e => {
  if (menu) return;
  if (document.pointerLockElement || dragging) rotateCam(e.movementX, e.movementY);
});

const cvs = renderer.domElement;
cvs.addEventListener('touchstart', e => {
  for (const t of e.changedTouches) {
    if (t.clientX < VW / 2 && joy.id === null) { joy.id = t.identifier; joy.ox = joy.x = t.clientX; joy.oy = joy.y = t.clientY; joy.active = true; }
    else if (look.id === null) { look.id = t.identifier; look.x = t.clientX; look.y = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
cvs.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
    if (t.identifier === look.id && !menu) { rotateCam((t.clientX - look.x) * 1.6, (t.clientY - look.y) * 1.6); look.x = t.clientX; look.y = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
const endTouch = e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { joy.id = null; joy.active = false; }
    if (t.identifier === look.id) look.id = null;
  }
};
cvs.addEventListener('touchend', endTouch);
cvs.addEventListener('touchcancel', endTouch);

// ---------- update ----------
function update(dt) {
  time += dt;
  const B = world.body, R = world.R;
  const up = player.up.copy(player.pos).normalize();
  player.fwd.addScaledVector(up, -player.fwd.dot(up)).normalize();
  const right = _r.copy(player.fwd).cross(up);

  let f = 0, r = 0;
  if (keys.has('w') || keys.has('arrowup')) f += 1;
  if (keys.has('s') || keys.has('arrowdown')) f -= 1;
  if (keys.has('d') || keys.has('arrowright')) r += 1;
  if (keys.has('a') || keys.has('arrowleft')) r -= 1;
  if (joy.active) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy);
    if (l > 8) { r += dx / Math.max(l, 50); f -= dy / Math.max(l, 50); }
  }
  const move = _m.set(0, 0, 0).addScaledVector(player.fwd, f).addScaledVector(right, r);
  const len = move.length();
  if (len > 1) move.divideScalar(len);

  // split velocity into radial (up/down) and tangential parts
  const spd = WALK_SPEED * B.speed * (player.inLiquid ? 0.55 : 1);
  let vr = player.vel.dot(up);
  const vt = _t.copy(player.vel).addScaledVector(up, -vr);
  vt.lerp(_a.copy(move).multiplyScalar(spd), Math.min(1, B.grip * dt * (player.onGround ? 1 : 0.3)));
  if (jumpQueued && player.onGround) { vr = JUMP_V; player.onGround = false; }
  jumpQueued = false;
  vr -= B.g * dt;
  player.vel.copy(vt).addScaledVector(up, vr);
  player.pos.addScaledVector(player.vel, dt);

  // ground contact (gravity always points to the centre)
  const nu = _u.copy(player.pos).normalize();
  const gh = groundH(nu);
  const floorR = world.hasSea ? Math.max(R + gh, R - 1.0) : R + gh;
  player.inLiquid = world.hasSea && gh < -0.3;
  const r0 = player.pos.length();
  if (r0 <= floorR || (player.onGround && r0 - floorR < 0.6 && vr <= 0.5)) {
    if (!player.onGround) {
      respawned = false;
      onLanded(player.fallTop - floorR);
      if (respawned) return;
    }
    player.pos.copy(nu).multiplyScalar(floorR);
    const vrn = player.vel.dot(nu);
    if (vrn < 0) player.vel.addScaledVector(nu, -vrn);
    player.onGround = true;
    player.fallTop = floorR;
  } else {
    player.onGround = false;
    player.fallTop = Math.max(player.fallTop, r0);
  }

  if (len > 0.1) player.face.lerp(_a.copy(move).normalize(), Math.min(1, 12 * dt));
  player.face.addScaledVector(nu, -player.face.dot(nu));
  if (player.face.lengthSq() < 1e-6) player.face.copy(player.fwd);
  player.face.normalize();
  player.walk += vt.length() * dt * 0.9;

  // oxygen & lander
  if (atLander()) {
    player.o2 = Math.min(100, player.o2 + 50 * dt);
    player.hp = Math.min(100, player.hp + 20 * dt);
    if (player.o2 > 30) lowWarned = false;
    if (bag.length) deposit();
    if (cargoCount()) unloadCargo();
  } else if (B.breathable && !player.inLiquid) {
    player.o2 = Math.min(100, player.o2 + 10 * dt);
  } else {
    player.o2 -= B.o2 * (player.inLiquid && !B.breathable ? 2.5 : 1) * dt;
    if (player.o2 < 25 && !lowWarned) { lowWarned = true; toast('Oxygen low! Head back to the lander.', 'bad'); }
    if (player.o2 <= 0) { player.o2 = 0; damage(SUFFOCATE_DPS * dt, 'You suffocated!'); }
  }

  // tools
  scanT = Math.max(0, scanT - dt);
  pickCd -= dt; fullWarnT -= dt;
  const act = keys.has('e') || mouseUse || touchAct;
  const pressed = act && !actPrev;
  actPrev = act;
  const tid = TOOLS[tool].id;
  if (tid === 'scanner' && pressed) doScan();
  if (tid === 'drill') useDrill(act, pressed, dt);
  if (tid === 'terraform') useTerraform(act, keys.has('r') || mouseAlt || touchAlt, dt);
  const near = nearestItem();
  if (near && act && tid === 'collector') {
    if (near.cat === 'fossil') {
      if (digTarget !== near) { digTarget = near; digT = 0; }
      digT += dt;
      near.mesh.position.copy(near.pos).addScaledVector(near.dir, Math.sin(time * 40) * 0.05);
      if (digT >= DIG_TIME) { collect(near); digT = 0; digTarget = null; }
    } else if (pickCd <= 0) {
      collect(near);
      pickCd = 0.18;
    }
  } else { digT = 0; digTarget = null; }

  // scanner pulses reveal as the ring passes
  for (const p of world.pulses) {
    p.t += dt;
    const fr = Math.min(1, p.t / SCAN_TIME), rad = fr * SCAN_R;
    p.ring.scale.setScalar(Math.max(0.01, rad));
    p.ring.material.opacity = 0.9 * (1 - fr) + 0.1;
    for (const it of world.items) {
      if (it.taken || it.pinged === p) continue;
      if (it.pos.distanceTo(p.center) < rad) {
        it.pinged = p;
        it.ping = 4;
        if (!it.revealed) { it.revealed = true; it.mesh.visible = true; p.found++; floater(it.pos, it.dir, 'Buried signal!', '#ffd166'); }
      }
    }
    if (p.t >= SCAN_TIME && !p.done) {
      p.done = true;
      if (p.found) toast(`Scan found ${p.found} buried trace${p.found > 1 ? 's' : ''} of ancient life!`, 'new');
    }
  }
  world.pulses = world.pulses.filter(p => {
    if (p.t < SCAN_TIME + 0.3) return true;
    world.scene.remove(p.ring); p.ring.geometry.dispose(); p.ring.material.dispose();
    return false;
  });

  for (const it of world.items) if (it.ping > 0) it.ping -= dt;
  for (const fl of floaters) { fl.t += dt; fl.pos.addScaledVector(fl.up, 1.6 * dt); }
  floaters = floaters.filter(fl => fl.t < 1.4);
  if (arrival) { arrival.t += dt; if (arrival.t > 5) arrival = null; }
  hurtFlash = Math.max(0, hurtFlash - dt * 1.5);
}

// fall damage scales with fall height AND local gravity (impact energy per kg = g·h),
// so the same drop hurts far less on a low-gravity moon. Liquid breaks the fall.
function onLanded(fallHeight) {
  if (player.inLiquid || fallHeight <= 0) return;
  const energy = world.body.g * fallHeight;
  const dmg = Math.round(Math.max(0, energy - SAFE_FALL_ENERGY) * FALL_DMG);
  if (dmg > 0) {
    floater(player.pos, player.up, `-${dmg} HP (fell ${fallHeight.toFixed(0)} m)`, '#ff8d8d');
    damage(dmg, `Fatal fall (${fallHeight.toFixed(0)} m)!`);
  }
}

// ---------- sync 3D scene with game state ----------
function syncScene() {
  const up = player.up, B = world.body;
  const bob = player.onGround ? Math.abs(Math.sin(player.walk)) * 0.08 : 0;
  playerMesh.position.copy(player.pos).addScaledVector(up, bob);
  _mat.makeBasis(_a.copy(up).cross(player.face), up, player.face);
  playerMesh.quaternion.setFromRotationMatrix(_mat);
  playerLabel.position.copy(player.pos).addScaledVector(up, 2.3);
  playerLabel.visible = opts.labels !== 'off';

  // third-person camera orbiting behind the heading
  const head = _b.copy(player.pos).addScaledVector(up, 1.6);
  const d = opts.dist, p = camState.pitch;
  const cam = _c.copy(head).addScaledVector(player.fwd, -d * Math.cos(p)).addScaledVector(up, d * Math.sin(p));
  const cd = _a.copy(cam).normalize();
  const minR = surfaceR(cd) + 0.8;
  if (cam.length() < minR) cam.setLength(minR);
  camera.position.copy(cam);
  camera.up.copy(up);
  camera.lookAt(head);

  // day / night from where you stand relative to the sun
  const night = smooth(0.15, -0.25, up.dot(SUN_DIR));
  if (B.type === 'planet') {
    world.scene.background.copy(world.skyColor).lerp(_NIGHT, night);
    if (world.scene.fog) world.scene.fog.color.copy(world.scene.background);
    STARS.material.opacity = B.dark ? 1 : night;
  } else STARS.material.opacity = 1;
  STARS.position.copy(camera.position);
  world.lamp.intensity = B.dark ? 1.6 : night * 1.3;
  world.lamp.position.copy(player.pos).addScaledVector(up, 3);
  world.sun.position.copy(player.pos).addScaledVector(SUN_DIR, 90);
  world.sun.target.position.copy(player.pos);
  world.lander.beacon.material.color.setHex(Math.sin(time * 4) > 0 ? 0xff4040 : 0x501010);
  world.landerLabel.visible = opts.labels !== 'off' && landerVisible();

  const maxD = LABEL_DIST[opts.labels];
  for (const it of world.items) {
    if (it.taken) continue;
    if (it.cat === 'mineral') it.mesh.rotateY(0.01);
    if (!it.revealed || opts.labels === 'off') { it.label.visible = false; continue; }
    const dist = it.pos.distanceTo(player.pos);
    it.label.visible = dist < maxD || (it.ping > 0 && dist < SCAN_R + 5);
  }
  syncMining();
  syncTerraform();
}
const _NIGHT = new THREE.Color('#05060f');
