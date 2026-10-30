'use strict';
// ---------- travel cutscenes: takeoff -> space flight -> landing (skippable) ----------
const CS_TIME = { takeoff: 3.2, space: 3.6, landing: 4.2 };
let cutscene = null; // { phase, t, from, dest, loaded }
let csEndedAt = -1e9;

// a small space scene reused for every flight
const space = (() => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#02030a');
  scene.add(new THREE.Points(STARS.geometry, STARS.material));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xfff6e8, 1.1);
  sun.position.set(1, 0.6, 0.3);
  scene.add(sun);
  const mk = () => new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true, roughness: 1 }));
  const origin = mk(), dest = mk();
  const ship = makeLander();
  ship.group.rotation.x = Math.PI / 2; // nose (+Y) pointing along +Z, the flight direction
  ship.flame.visible = true;
  // atmosphere glows around the two worlds (only shown for worlds with air)
  const glow = () => { const g = makeAtmosphere(1, 1.12, { color: '#ffffff', sunset: '#ffffff' }); g.material.uniforms.uSun.value.copy(sun.position).normalize(); return g; };
  const originGlow = glow(), destGlow = glow();
  scene.add(origin, dest, ship.group, originGlow, destGlow);
  return { scene, origin, dest, ship, originGlow, destGlow };
})();
const surfaceColor = b => bodyColor(b, b.type === 'planet' ? 'plains' : 'dust');

function startTravel(id) {
  for (const k in menus) menus[k].classList.remove('show');
  menu = null;
  if (document.pointerLockElement) { suppressUnlockPause = true; document.exitPointerLock(); }
  keys.clear();
  cutscene = { phase: 'takeoff', t: 0, from: world.body, dest: bodyById(id), loaded: false };
  thrusterSound(CS_TIME.takeoff + 0.5);
  document.body.classList.add('cutscene');
  playerMesh.visible = false;
  playerLabel.visible = false;
  world.landerLabel.visible = false;
}

function loadDestination() {
  if (cutscene.loaded) return;
  land(cutscene.dest.id);
  cutscene.loaded = true;
  arrival = null; // shown once we're down
  playerMesh.visible = false;
  playerLabel.visible = false;
  world.landerLabel.visible = false;
}

function endCutscene() {
  if (!cutscene) return;
  loadDestination();
  const w = world;
  placeOnSurface(w.lander.group, w.L, w.landerR);
  w.lander.flame.visible = false;
  playerMesh.visible = true;
  const b = w.body;
  arrival = {
    t: 0, ok: b.breathable,
    title: `${b.name}${b.type === 'moon' ? ' (moon)' : ''}`,
    text: b.breathable ? 'Atmosphere: breathable' : (b.type === 'moon' ? 'No atmosphere: no oxygen' : 'Atmosphere: no breathable oxygen'),
    sub: `Gravity ${b.g.toFixed(1)} m/s²`,
  };
  cutscene = null;
  csEndedAt = performance.now();
  document.body.classList.remove('cutscene');
  lockPointer();
}
function skipCutscene() { if (cutscene && (cutscene.phase !== 'takeoff' || cutscene.t > 0.2)) endCutscene(); }

const _cu = new THREE.Vector3(), _ct = new THREE.Vector3(), _cp = new THREE.Vector3();
function updateCutscene(dt) {
  const c = cutscene;
  c.t += dt;
  time += dt;
  if (c.phase === 'takeoff') {
    // lift off from the current world, camera watching from the side
    const w = world, L = w.L, h = 1.6 * c.t * c.t * c.t + 2 * c.t;
    placeOnSurface(w.lander.group, L, w.landerR + h);
    w.lander.flame.visible = Math.sin(time * 50) > -0.6;
    w.lander.flame.scale.set(1, 1 + Math.random() * 0.4, 1);
    tangentOf(L, _ct);
    camera.position.copy(L).multiplyScalar(w.landerR + 6 + h * 0.35).addScaledVector(_ct, 26);
    camera.up.copy(L);
    camera.lookAt(_cp.copy(L).multiplyScalar(w.landerR + 3 + h));
    syncSky();
    if (c.t >= CS_TIME.takeoff) { c.phase = 'space'; c.t = 0; loadDestination(); }
  } else if (c.phase === 'space') {
    // cruise: the old world falls behind, the new one grows ahead
    const f = c.t / CS_TIME.space;
    space.origin.material.color.copy(surfaceColor(c.from));
    space.dest.material.color.copy(surfaceColor(c.dest));
    space.origin.scale.setScalar(60 + c.from.R / 70);
    space.origin.position.set(-160, -140, -320 - f * 900);
    space.dest.scale.setScalar(60 + c.dest.R / 70);
    space.dest.position.set(40, -60, 1300 - f * 900);
    for (const [ball, glow, b] of [[space.origin, space.originGlow, c.from], [space.dest, space.destGlow, c.dest]]) {
      glow.visible = !!b.atmo;
      if (!b.atmo) continue;
      const u = glow.material.uniforms, r = ball.scale.x;
      glow.position.copy(ball.position); glow.scale.setScalar(r);
      u.uCenter.value.copy(ball.position); u.uR.value = r; u.uRa.value = r * 1.12;
      u.uColor.value.set(b.atmo.color); u.uSunset.value.set(b.atmo.sunset);
    }
    space.ship.group.position.set(0, Math.sin(time * 2) * 0.3, 0);
    space.ship.group.rotation.z = Math.sin(time * 0.8) * 0.15;
    space.ship.flame.scale.set(1, 1 + Math.random() * 0.5, 1);
    camera.up.set(0, 1, 0);
    camera.position.set(17 - f * 3, 5, -6 + f * 4);
    camera.lookAt(0, 0, 9);
    if (c.t >= CS_TIME.space) { c.phase = 'landing'; c.t = 0; thrusterSound(CS_TIME.landing); }
  } else {
    // descent onto the new world
    const w = world, L = w.L, f = Math.min(1, c.t / CS_TIME.landing);
    const ease = 1 - Math.pow(1 - f, 3), h = 150 * (1 - ease);
    placeOnSurface(w.lander.group, L, w.landerR + h);
    w.lander.flame.visible = h > 0.3 && Math.sin(time * 50) > -0.6;
    w.lander.flame.scale.set(1, 0.6 + (1 - f) * 0.8 + Math.random() * 0.3, 1);
    tangentOf(L, _ct);
    camera.position.copy(L).multiplyScalar(w.landerR + 8 + h * 0.6).addScaledVector(_ct, 30 - f * 6);
    camera.up.copy(L);
    camera.lookAt(_cp.copy(L).multiplyScalar(w.landerR + 3 + h));
    syncSky();
    if (c.t >= CS_TIME.landing + 0.4) endCutscene();
  }
}
// sky colour / lights for the world scene while the player isn't driving the camera
function syncSky() {
  const w = world, up = _cu.copy(camera.position).normalize(), B = w.body;
  updateSky(w, up, w.sunDir);
  updateWater(w, up.dot(w.sunDir));
  if (w.clouds) w.clouds.rotation.y = time * B.atmo.wind;
  STARS.position.copy(camera.position);
  w.sun.position.copy(w.landerPos).addScaledVector(w.sunDir, 90);
  w.sun.target.position.copy(w.landerPos);
  updateLights(w, up);
  w.lamp.intensity = w.helmet.intensity = 0;
}
const cutsceneScene = () => cutscene.phase === 'space' ? space.scene : world.scene;

function drawCutsceneOverlay() {
  const c = cutscene;
  hx.setTransform(DPR, 0, 0, DPR, 0, 0);
  hx.clearRect(0, 0, VW, VH);
  const bar = Math.round(VH * 0.09);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, VW, bar); hx.fillRect(0, VH - bar, VW, bar);
  const text = c.phase === 'takeoff' ? `Lifting off from ${c.from.name}` : c.phase === 'space' ? `En route to ${c.dest.name}${c.dest.type === 'moon' ? `, moon of ${c.dest.parent.name}` : ''}` : `Landing on ${c.dest.name}`;
  hx.fillStyle = '#e6ecff'; hx.font = 'bold 18px system-ui,sans-serif'; hx.textAlign = 'center'; hx.textBaseline = 'middle';
  hx.fillText(text, VW / 2, VH - bar / 2);
  // quick fades between shots
  const dur = CS_TIME[c.phase], edge = Math.min(c.t, Math.max(0, dur - c.t));
  const fade = c.phase === 'takeoff' ? Math.max(0, 1 - (dur - c.t) / 0.4) : c.phase === 'space' ? Math.max(0, 1 - edge / 0.4) : Math.max(0, 1 - c.t / 0.4);
  if (fade > 0) { hx.fillStyle = `rgba(0,0,0,${fade})`; hx.fillRect(0, 0, VW, VH); }
}

$('skipBtn').addEventListener('click', e => { e.stopPropagation(); skipCutscene(); });
addEventListener('keydown', e => { if (cutscene && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); skipCutscene(); } }, true);
renderer.domElement.addEventListener('pointerdown', () => { if (cutscene) skipCutscene(); });
