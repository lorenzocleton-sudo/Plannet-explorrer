'use strict';
// ---------- rover ----------
// Crafted at a Fabricator (after researching it), one per world. INTERACT next to it opens its
// panel (drive / cargo); while driving, INTERACT gets you out. It drives on the same joystick,
// follows each world's gravity (it leaves the ground over crests and bounces on light moons),
// runs on a battery that recharges near your power grid or the lander, and burns rocket fuel from
// its cargo when the battery is flat. The cab is pressurised: no oxygen loss, heat or cold inside.
const ROVER_CAP = 120, ROVER_MAX = 16, ROVER_ACC = 7, ROVER_TURN = 1.5, ROVER_WHEEL = 0.55, ROVER_FUEL_CHARGE = 60;
const rover = { mesh: null, rec: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0), tilt: new THREE.Vector3(0, 1, 0),
  driving: false, onGround: true, wheelRot: 0, saveT: 0, lowWarn: false };
const _rv = new THREE.Vector3(), _rv2 = new THREE.Vector3(), _rv3 = new THREE.Vector3(), _rv4 = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rm = new THREE.Matrix4();

function makeRoverModel() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.45, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.8 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff9a3c, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x5fb8ff, roughness: 0.1, metalness: 0.3, emissive: 0x0a3050, emissiveIntensity: 0.6 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 3.6), paint); chassis.position.y = 0.95;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.12, 3.64), orange); stripe.position.y = 0.95;
  const cab = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass); cab.scale.set(1, 0.8, 1.2); cab.position.set(0, 1.2, 0.5);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 1.2), paint); deck.position.set(0, 1.4, -1.1);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.4), new THREE.MeshStandardMaterial({ color: 0x1a2a55, roughness: 0.3, metalness: 0.5 })); panel.position.set(0, 1.72, -1.1);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), dark); mast.position.set(0.85, 2.2, -1.5);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 0.4 });
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), lamp); l1.position.set(-0.75, 1.05, 1.82);
  const l2 = l1.clone(); l2.position.x = 0.75;
  g.add(chassis, stripe, cab, deck, panel, mast, l1, l2);
  const wheels = [];
  for (const [x, z] of [[-1.25, 1.2], [1.25, 1.2], [-1.25, -1.2], [1.25, -1.2]]) {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(ROVER_WHEEL, ROVER_WHEEL, 0.45, 18).rotateZ(Math.PI / 2), dark);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.47, 8).rotateZ(Math.PI / 2), orange);
    w.add(tyre, hub); w.position.set(x, ROVER_WHEEL, z);
    g.add(w); wheels.push(w);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.wheels = wheels; g.userData.lamp = lamp;
  return g;
}

// ---- world hooks ----
function loadRover(w) {
  rover.driving = false;
  playerMesh.visible = true;
  rover.mesh = null; rover.rec = null;
  const r = baseData(w.body.id).rover;
  if (!r) return;
  rover.rec = r;
  rover.pos.fromArray(r.d);
  rover.fwd.fromArray(r.f);
  rover.vel.set(0, 0, 0);
  rover.mesh = makeRoverModel();
  w.scene.add(rover.mesh);
  rover.tilt.copy(rover.pos).normalize();
  placeRoverMesh(0);
}
// a new rover rolls out next to the Fabricator that made it
function spawnRover(w, fab) {
  const base = baseData(w.body.id);
  const t = tangentOf(fab.dir, new THREE.Vector3()), d = fab.dir.clone().multiplyScalar(w.R).addScaledVector(t, fab.def.fp + 3.5).normalize();
  base.rover = { d: d.clone().multiplyScalar(w.R + heightAt(w.body, d) + ROVER_WHEEL).toArray(), f: t.toArray(), charge: 100, cargo: {} };
  writeSave();
  if (w === world) { loadRover(w); toast('Rover ready next to the Fabricator. Walk up to it and INTERACT.', 'new', 6000); }
}
const roverHere = () => !!(rover.rec && rover.mesh);
const nearRover = () => roverHere() && !rover.driving && rover.pos.distanceTo(player.pos) < 4;
const roverInv = () => rover.rec.cargo || (rover.rec.cargo = {});

function enterRover() {
  if (!roverHere()) return;
  rover.driving = true;
  player.fwd.copy(rover.fwd); // start with the camera behind the rover
  playerMesh.visible = false; playerLabel.visible = false;
  resume();
  toast(isTouch ? 'Driving: joystick to steer, INTERACT to get out.' : 'Driving: W/S throttle, A/D steer, F to get out.');
}
function exitRover() {
  rover.driving = false;
  const up = _rv.copy(rover.pos).normalize(), side = _rv2.copy(rover.fwd).cross(up).normalize();
  player.pos.copy(rover.pos).addScaledVector(side, -2.6);
  player.pos.setLength(surfaceR(_rv3.copy(player.pos).normalize()) + 0.1);
  player.vel.set(0, 0, 0); player.onGround = true; player.fallTop = player.pos.length();
  playerMesh.visible = true;
  saveRover();
}
function saveRover() {
  if (!rover.rec) return;
  rover.rec.d = rover.pos.toArray(); rover.rec.f = rover.fwd.toArray();
  writeSave();
}

// ---- driving physics ----
function roverPowered() { // charging: near the lander or a powered grid
  if (rover.pos.distanceTo(world.landerPos) < LANDER_LINK) return true;
  for (const b of world.buildings || []) if ((b.def.gen || b.def.capacity) && b.grid && b.grid.ratio > 0.2 && b.pos.distanceTo(rover.pos) < POWER_RANGE) return true;
  return false;
}
function driveRover(dt, f, r) {
  const B = world.body, R = world.R, rec = rover.rec, up = _rv.copy(rover.pos).normalize();
  rover.fwd.addScaledVector(up, -rover.fwd.dot(up)).normalize();
  // battery, then fuel from the cargo when it runs out
  let throttle = f;
  if (rec.charge <= 0) {
    const inv = roverInv();
    if ((inv.fuel || 0) > 0) { inv.fuel--; if (!inv.fuel) delete inv.fuel; rec.charge += ROVER_FUEL_CHARGE; toast('Rover battery flat: burning 1 Rocket Fuel from the cargo.'); }
    else { throttle = 0; if (!rover.lowWarn) { rover.lowWarn = true; toast('Rover battery flat. Charge it near your power grid or the lander, or load Rocket Fuel.', 'bad', 5000); } }
  } else rover.lowWarn = false;
  rec.charge = clamp(rec.charge - Math.abs(throttle) * 0.7 * dt + (roverPowered() ? 3 * dt : 0), 0, 100);
  // steering turns the heading (more grip at speed), throttle pushes along it
  let vr = rover.vel.dot(up);
  const vt = _rv2.copy(rover.vel).addScaledVector(up, -vr), speed = vt.dot(rover.fwd);
  if (rover.onGround) {
    rover.fwd.applyAxisAngle(up, -r * ROVER_TURN * clamp(Math.abs(speed) / 5, 0.25, 1) * Math.sign(speed || 1) * dt);
    const target = throttle * (throttle < 0 ? ROVER_MAX * 0.4 : ROVER_MAX) * (player.inLiquid ? 0.4 : 1);
    const along = speed + clamp(target - speed, -ROVER_ACC * dt * 1.6, ROVER_ACC * dt) * (B.grip > 5 ? 1 : 0.35);
    const lat = _rv3.copy(vt).addScaledVector(rover.fwd, -speed).multiplyScalar(Math.max(0, 1 - (B.grip > 5 ? 6 : 1.5) * dt)); // sideways grip (ice slides)
    vt.copy(rover.fwd).multiplyScalar(along).add(lat);
  }
  vr -= B.g * dt;
  rover.vel.copy(vt).addScaledVector(up, vr);
  const oldFloor = R + groundH(up) + ROVER_WHEEL;
  rover.pos.addScaledVector(rover.vel, dt);
  // trees and rocks stop the rover
  const nu = _rv3.copy(rover.pos).normalize();
  sceneryContact(rover.pos, nu, 1.5, rover.vel);
  nu.copy(rover.pos).normalize();
  const gh = groundH(nu);
  const floor = (world.frozen ? R + Math.max(gh, 0) : world.hasSea ? Math.max(R + gh, R - 1.4) : R + gh) + ROVER_WHEEL;
  player.inLiquid = world.hasSea && !world.frozen && gh < -0.6;
  const r0 = rover.pos.length();
  if (r0 <= floor) {
    // landing: bounce back up a little; much bouncier in low gravity
    const vin = rover.vel.dot(nu);
    rover.pos.setLength(floor);
    if (!rover.onGround && vin < -2.5) rover.vel.addScaledVector(nu, -vin * (1 + clamp(0.55 - B.g / 25, 0.1, 0.5)));
    else {
      // stay on the ground: climb with it, and keep the upward speed a crest gives us
      const rise = (floor - oldFloor) / Math.max(dt, 1e-3);
      rover.vel.addScaledVector(nu, Math.max(rise, 0) - vin);
    }
    rover.onGround = true;
  } else if (r0 > floor + 0.15) rover.onGround = false;
  // the body tilts with the ground under the wheels
  if (rover.onGround) {
    const side = _rv2.copy(rover.fwd).cross(nu).normalize();
    const h = (dx, dz) => { _rv4.copy(rover.pos).addScaledVector(side, dx).addScaledVector(rover.fwd, dz).normalize(); return groundH(_rv4); };
    const n = _rv.copy(nu).addScaledVector(rover.fwd, (h(0, -1.6) - h(0, 1.6)) / 3.2).addScaledVector(side, (h(-1.3, 0) - h(1.3, 0)) / 2.6).normalize();
    rover.tilt.lerp(n, Math.min(1, 10 * dt)).normalize();
  } else rover.tilt.lerp(nu, Math.min(1, dt)).normalize();
  rover.wheelRot += speed * dt / ROVER_WHEEL;
  // the driver rides along
  player.pos.copy(rover.pos).addScaledVector(nu, 0.8);
  player.vel.copy(rover.vel);
  player.onGround = true; player.fallTop = player.pos.length();
  // the camera swings round behind the rover (turning, so it works from any angle)
  const ang = signedAngle(player.fwd, rover.fwd, nu);
  player.fwd.applyAxisAngle(nu, clamp(ang, -2 * dt, 2 * dt));
  player.face.copy(rover.fwd);
  rover.saveT -= dt;
  if (rover.saveT <= 0) { rover.saveT = 5; rec.d = rover.pos.toArray(); rec.f = rover.fwd.toArray(); }
}

function placeRoverMesh(dt) {
  if (!rover.mesh) return;
  const up = rover.tilt, f = _rv.copy(rover.fwd).addScaledVector(up, -rover.fwd.dot(up)).normalize(), side = _rv2.copy(up).cross(f);
  _rm.makeBasis(side, up, f);
  rover.mesh.quaternion.setFromRotationMatrix(_rm);
  rover.mesh.position.copy(rover.pos).addScaledVector(_rv3.copy(rover.pos).normalize(), -ROVER_WHEEL);
  for (const w of rover.mesh.userData.wheels) w.rotation.x = rover.wheelRot;
  const night = world.ambient.intensity < 0.2;
  rover.mesh.userData.lamp.emissiveIntensity = night ? 2 : 0.4;
}
