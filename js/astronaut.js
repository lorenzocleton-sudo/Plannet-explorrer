'use strict';
// ---------- the player's astronaut (CC0 model by Quaternius, see CREDITS.md) ----------
// Loaded once; until it arrives (or if it can't load) the simple suit shape stays visible.
// Animations: Idle, Walk, Run and the jump set, picked from how the player moves.
const ASTRO = { model: null, mixer: null, actions: {}, current: null, ready: false };

function loadAstronaut() {
  if (!THREE.GLTFLoader) return;
  new THREE.GLTFLoader().load(`assets/models/astronaut.glb?v=${ASSET_V}`, gltf => {
    const m = gltf.scene;
    // scale to 1.8 m tall, feet on the ground, facing +Z like the old shape
    const box = new THREE.Box3().setFromObject(m), h = box.max.y - box.min.y;
    const s = 1.8 / (h || 1);
    m.scale.setScalar(s);
    m.position.y = -box.min.y * s;
    const gun = m.getObjectByName('Pistol');
    if (gun) gun.visible = false; // a researcher, not a soldier
    m.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; if (o.material) { o.material.metalness = Math.min(0.15, o.material.metalness); o.material.roughness = Math.max(0.5, o.material.roughness); } }
      if (o.geometry) sharedGeos.add(o.geometry);
      if (o.material) sharedMats.add(o.material);
    });
    ASTRO.mixer = new THREE.AnimationMixer(m);
    for (const clip of gltf.animations) ASTRO.actions[clip.name.replace(/^.*\|/, '')] = ASTRO.mixer.clipAction(clip);
    // the jump start and landing play once; everything else loops
    for (const k of ['Jump', 'Jump_Land']) if (ASTRO.actions[k]) { ASTRO.actions[k].setLoop(THREE.LoopOnce); ASTRO.actions[k].clampWhenFinished = true; }
    for (const o of playerMesh.children) o.visible = false;
    playerMesh.add(m);
    ASTRO.model = m;
    ASTRO.ready = true;
    playAstro('Idle', 0);
  }, undefined, e => console.warn('astronaut model failed to load, keeping the simple shape', e));
}

function playAstro(name, fade = 0.2) {
  const a = ASTRO.actions[name];
  if (!a || ASTRO.current === a) return;
  a.reset().play();
  if (ASTRO.current) a.crossFadeFrom(ASTRO.current, fade, false);
  ASTRO.current = a;
}

// per frame: pick the animation from movement and advance it
let astroAir = 0, astroWasGround = true, astroLast = 0;
function updateAstronaut() {
  const now = performance.now(), dt = Math.min(0.1, (now - (astroLast || now)) / 1000);
  astroLast = now;
  if (!ASTRO.ready) return;
  const up = player.up, vr = player.vel.dot(up), speed = Math.sqrt(Math.max(0, player.vel.lengthSq() - vr * vr));
  if (flying) playAstro('Jump_Idle');
  else if (!player.onGround) {
    astroAir += dt;
    if (astroWasGround && vr > 0.5) playAstro('Jump', 0.08);
    else if (astroAir > 0.25 && ASTRO.current !== ASTRO.actions.Jump) playAstro('Jump_Idle', 0.25);
    else if (ASTRO.current === ASTRO.actions.Jump && !ASTRO.current.isRunning()) playAstro('Jump_Idle', 0.2);
  } else {
    if (!astroWasGround && astroAir > 0.35) playAstro('Jump_Land', 0.05);
    astroAir = 0;
    const landing = ASTRO.current === ASTRO.actions.Jump_Land && ASTRO.current.isRunning();
    if (!landing) {
      if (speed > WALK_SPEED * 0.55) playAstro('Run');
      else if (speed > 0.6) playAstro('Walk');
      else playAstro('Idle', 0.3);
    }
    // match the legs to the ground speed
    if (ASTRO.current === ASTRO.actions.Run) ASTRO.current.timeScale = clamp(speed / (WALK_SPEED * 0.75), 0.7, 1.4);
    if (ASTRO.current === ASTRO.actions.Walk) ASTRO.current.timeScale = clamp(speed / 3.5, 0.6, 1.6);
  }
  astroWasGround = player.onGround;
  ASTRO.mixer.update(dt);
}
