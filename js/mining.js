'use strict';
// ---------- mining spots + drills ----------
// Planets mostly give metals, moons mostly ice and silicon. Rare crystals only appear on harder
// worlds and sit deep (slow to drill, too deep to dig by hand).
const SPOT_RES = {
  iron_ore: { tier: 0 }, copper_ore: { tier: 0 }, silicon: { tier: 0 }, ice: { tier: 0 },
  ember: { tier: 2, minDiff: 1 }, void_crystal: { tier: 3, minDiff: 3 }, xeno_crystal: { tier: 4, minDiff: 4 },
};
const TIER_NAMES = ['Common', 'Uncommon', 'Rare', 'Very rare', 'Exotic'];
const DRILLS_MAX = 3, DRILL_CAP = 8, DRILL_REACH = 4, PICKUP_TIME = 1.2, HAND_MINE_TIME = 2;
const spotRes = id => ({ id, name: itemName(id), color: ITEMS[id].color, tier: SPOT_RES[id].tier });

// how "hard" a world is: later planets (and their moons) roll rarer, deeper deposits
const difficulty = b => b.type === 'planet' ? b.idx : b.idx + 0.5;
function spotWeights(body) {
  const diff = difficulty(body), w = body.type === 'planet'
    ? { iron_ore: 0.36, copper_ore: 0.28, silicon: 0.14, ice: body.name === 'Glacia' ? 0.35 : 0.12 }
    : { iron_ore: 0.08, copper_ore: 0.05, silicon: 0.4, ice: body.ice ? 0.55 : 0.32 };
  for (const id of ['ember', 'void_crystal', 'xeno_crystal']) if (diff >= SPOT_RES[id].minDiff && (id !== 'void_crystal' || body.idx === 3)) w[id] = 0.06;
  return w;
}
function rollResource(rnd, body) {
  const w = spotWeights(body);
  let tot = 0;
  for (const id in w) tot += w[id];
  let x = rnd() * tot;
  for (const id in w) { x -= w[id]; if (x <= 0) return spotRes(id); }
  return spotRes('iron_ore');
}
// depth in metres: common ores are shallow, crystals deep
const spotDepth = (res, rnd) => res.tier === 0 ? Math.round(4 + rnd() * 10) : Math.round(25 + res.tier * 12 + rnd() * 15);

const SPOT_GEO = new THREE.CylinderGeometry(1.7, 1.9, 0.18, 16).translate(0, 0.09, 0);
const ORE_GEO = new THREE.OctahedronGeometry(0.35).translate(0, 0.35, 0);
const DRILL_GEO = {
  tower: new THREE.CylinderGeometry(0.35, 0.5, 3.2, 8).translate(0, 1.6, 0),
  frame: new THREE.BoxGeometry(1.8, 0.25, 1.8).translate(0, 0.2, 0),
  bit: new THREE.ConeGeometry(0.45, 1.1, 8).rotateX(Math.PI).translate(0, 0.25, 0),
};
const DRILL_MAT = new THREE.MeshStandardMaterial({ color: 0xffc23a, flatShading: true, roughness: 0.6, metalness: 0.3 });
const BIT_MAT = new THREE.MeshStandardMaterial({ color: 0x8a93a8, flatShading: true, metalness: 0.6, roughness: 0.4 });
[SPOT_GEO, ORE_GEO, ...Object.values(DRILL_GEO)].forEach(g => sharedGeos.add(g));
sharedMats.add(DRILL_MAT); sharedMats.add(BIT_MAT);
const resMatCache = {};
function resMat(r) {
  if (resMatCache[r.id]) return resMatCache[r.id];
  const c = new THREE.Color(r.color);
  const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 + r.tier * 0.12, flatShading: true, roughness: 0.4 });
  sharedMats.add(m);
  return (resMatCache[r.id] = m);
}

function spotLabelText(sp) { return `${sp.res.name} deposit · ${sp.depth} m deep`; }

// Spots are spread over the whole world (plus a few near the lander); their meshes only exist near the player.
const SPOT_SHOW = 500, SPOT_HIDE = 650;
function spawnSpots(w) {
  const body = w.body, R = w.R, rnd = mulberry32(body.seed * 19 + 77), d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const count = Math.max(12, Math.round(4 * Math.PI * R * R / 2.5e6));
  // one of each basic resource within a short walk of the lander, so a base is always possible
  const starters = ['iron_ore', 'copper_ore', 'silicon', 'ice'], nearby = starters.length;
  w.spots = [];
  tangentOf(w.L, t1); t2.copy(w.L).cross(t1);
  for (let tries = 0; w.spots.length < count && tries < count * 20; tries++) {
    if (w.spots.length < nearby) { // a few within a short walk of the lander
      const a = rnd() * Math.PI * 2, dist = 35 + rnd() * 110;
      d.copy(w.L).multiplyScalar(R).addScaledVector(t1, Math.cos(a) * dist).addScaledVector(t2, Math.sin(a) * dist).normalize();
    } else randDir(rnd, d);
    const h = groundH(d);
    if (w.hasSea && h < 0.5) continue;
    if (Math.acos(clamp(d.dot(w.L), -1, 1)) * R < 22) continue;
    if (w.spots.some(s => s.dir.distanceTo(d) * R < 30)) continue;
    const res = w.spots.length < nearby ? spotRes(starters[w.spots.length]) : rollResource(rnd, body);
    const depth = spotDepth(res, rnd);
    const sp = { idx: w.spots.length, res, depth, dir: d.clone(), seed: Math.floor(rnd() * 1e9), group: null, label: null, drill: null };
    sp.pos = sp.dir.clone().multiplyScalar(R + h);
    w.spots.push(sp);
  }
}
function showSpot(sp) {
  const rnd = mulberry32(sp.seed);
  sp.group = new THREE.Group();
  sp.group.add(new THREE.Mesh(SPOT_GEO, resMat(sp.res)));
  for (let i = 0; i < 4; i++) {
    const o = new THREE.Mesh(ORE_GEO, resMat(sp.res));
    const a = i / 4 * Math.PI * 2 + rnd();
    o.position.set(Math.cos(a) * 1.1, 0.05, Math.sin(a) * 1.1);
    o.rotation.y = rnd() * 3;
    o.scale.setScalar(0.7 + rnd() * 0.6);
    sp.group.add(o);
  }
  sp.group.traverse(o => { o.castShadow = true; });
  sp.label = makeLabel(spotLabelText(sp), sp.res.color, 0.6, false);
  world.scene.add(sp.group, sp.label);
  if ((save.drills[world.body.id] || {})[sp.idx]) buildDrill(sp);
  placeSpot(sp);
}
function hideSpot(sp) {
  world.scene.remove(sp.group, sp.label);
  if (sp.drill) world.scene.remove(sp.drill.group);
  sp.group = sp.label = sp.drill = null;
}
function placeSpot(sp) {
  const r = world.R + groundH(sp.dir);
  sp.r = r;
  sp.pos = sp.dir.clone().multiplyScalar(r);
  if (!sp.group) return;
  placeOnSurface(sp.group, sp.dir, r);
  sp.label.position.copy(sp.dir).multiplyScalar(r + (sp.drill ? 4.6 : 2.2));
  if (sp.drill) placeOnSurface(sp.drill.group, sp.dir, r + 0.1);
}

function buildDrill(sp) {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(DRILL_GEO.tower, DRILL_MAT), frame = new THREE.Mesh(DRILL_GEO.frame, DRILL_MAT);
  const bit = new THREE.Mesh(DRILL_GEO.bit, BIT_MAT);
  g.add(tower, frame, bit);
  g.traverse(o => { o.castShadow = true; });
  sp.drill = { group: g, bit, shown: -1 };
  world.scene.add(g);
  placeSpot(sp);
}

function drillState(sp) {
  const rec = (save.drills[world.body.id] || {})[sp.idx];
  if (!rec) return null;
  const secsPerUnit = instantDrill() ? 0 : (4 + sp.depth / 8) / (save.upgrades.fastdrill ? 2 : 1);
  const elapsed = (Date.now() - rec.start) / 1000;
  const units = secsPerUnit === 0 ? DRILL_CAP : Math.min(DRILL_CAP, Math.floor(elapsed / secsPerUnit));
  const next = units >= DRILL_CAP ? 0 : secsPerUnit - (elapsed % secsPerUnit);
  return { rec, units, next, secsPerUnit };
}
function instantDrill() { return typeof debugOn === 'function' && debugOn(); }
function drillsPlaced() { let n = 0; for (const b in save.drills) n += Object.keys(save.drills[b]).length; return n; }

function nearestSpot(maxD = DRILL_REACH) {
  let best = null, bd = maxD;
  for (const sp of world.spots) { const d = sp.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = sp; } }
  return best;
}

let drillHold = 0, drillHoldSpot = null;
function useDrill(act, pressed, dt) {
  const sp = nearestSpot();
  if (!sp || !act) { drillHold = 0; drillHoldSpot = null; return; }
  const st = drillState(sp);
  if (!st) {
    if (!pressed) return;
    if (drillsPlaced() >= DRILLS_MAX) { toast(`All ${DRILLS_MAX} drills are in use. Pick one up first.`, 'bad'); return; }
    (save.drills[world.body.id] || (save.drills[world.body.id] = {}))[sp.idx] = { start: Date.now() };
    writeSave();
    buildDrill(sp);
    toast(`Drill placed on ${sp.res.name} deposit (${sp.depth} m deep).`);
    return;
  }
  if (pressed && st.units > 0) { collectDrill(sp, st); drillHoldSpot = sp; drillHold = 0; return; }
  // keep holding to pack the drill back up
  if (drillHoldSpot !== sp) { drillHoldSpot = sp; drillHold = 0; }
  drillHold += dt;
  if (drillHold >= PICKUP_TIME) {
    const st2 = drillState(sp);
    if (st2 && st2.units > 0) collectDrill(sp, st2);
    delete save.drills[world.body.id][sp.idx];
    writeSave();
    world.scene.remove(sp.drill.group);
    sp.drill = null;
    placeSpot(sp);
    drillHold = 0; drillHoldSpot = null;
    toast('Drill packed up.');
  }
}
function collectDrill(sp, st) {
  const n = invAdd(playerInv(), sp.res.id, st.units, invCap());
  if (n <= 0) { toast('Inventory full! Unload at the lander.', 'bad'); return; }
  // keep any partial progress towards the next unit
  st.rec.start = Date.now() - (st.secsPerUnit ? ((Date.now() - st.rec.start) / 1000 % st.secsPerUnit) * 1000 : 0) - (st.units - n) * st.secsPerUnit * 1000;
  writeSave();
  floater(sp.pos, sp.dir, `+${n} ${sp.res.name}`, sp.res.color);
}
// at the lander, raw resources in your pockets go into the lander's hold automatically
function unloadCargo() {
  const inv = playerInv(), parts = [];
  for (const id of Object.keys(inv)) {
    if (!ITEMS[id] || !ITEMS[id].raw) continue;
    const n = invAdd(landerInv(), id, inv[id], LANDER_CAP);
    if (n > 0) { invTake(inv, id, n); parts.push(`${n} ${itemName(id)}`); }
  }
  if (!parts.length) return;
  writeSave();
  toast(`Unloaded into the lander: ${parts.join(', ')}`);
}
const rawCarried = () => Object.keys(playerInv()).some(id => ITEMS[id] && ITEMS[id].raw && invTotal(landerInv()) < LANDER_CAP);

// dig a few units out of a deposit by hand (common ores only)
let handT = 0, handSpot = null;
function handMine(sp, held, dt) {
  if (!held) { handT = 0; handSpot = null; return; }
  if (sp.res.tier > 0) { if (handSpot !== sp) toast(`${sp.res.name} is ${sp.depth} m deep: it needs a drill.`, 'bad'); handSpot = sp; return; }
  if (handSpot !== sp) { handSpot = sp; handT = 0; }
  handT += dt;
  if (handT >= HAND_MINE_TIME) {
    handT = 0;
    if (invAdd(playerInv(), sp.res.id, 1, invCap())) floater(sp.pos, sp.dir, `+1 ${sp.res.name}`, sp.res.color);
    else toast('Inventory full!', 'bad');
  }
}

// per-frame visuals: spinning bits, live labels
function syncMining() {
  const maxD = Math.max(LABEL_DIST[opts.labels], 60);
  for (const sp of world.spots) {
    const dist = sp.pos.distanceTo(player.pos);
    if (!sp.group && dist < SPOT_SHOW) showSpot(sp);
    else if (sp.group && dist > SPOT_HIDE) hideSpot(sp);
    if (!sp.group) continue;
    const st = sp.drill ? drillState(sp) : null;
    if (sp.drill) {
      const working = st.units < DRILL_CAP;
      if (working) sp.drill.bit.rotation.y += 0.3;
      if (st.units !== sp.drill.shown) {
        sp.drill.shown = st.units;
        setLabelText(sp.label, `Drill · ${sp.res.name} ${st.units}/${DRILL_CAP}${st.units >= DRILL_CAP ? ' (full)' : ''}`, sp.res.color, 0.6, false);
      }
    } else if (sp.label.material !== labelMat(spotLabelText(sp), sp.res.color, false).mat) {
      setLabelText(sp.label, spotLabelText(sp), sp.res.color, 0.6, false);
    }
    sp.label.visible = opts.labels !== 'off' && dist < maxD;
  }
}

promptHooks.push(() => {
  const sp = nearestSpot();
  const isDrill = TOOLS[tool].id === 'drill';
  if (!sp) return isDrill ? `Find a mining spot (labelled "deposit") · ${DRILLS_MAX - drillsPlaced()}/${DRILLS_MAX} drills free` : '';
  const k = isDrill ? KEY.use : KEY.interact;
  const st = drillState(sp);
  if (!st) return isDrill ? `${KEY.use} Place drill on ${sp.res.name} (${TIER_NAMES[sp.res.tier]}, ${sp.depth} m deep) · ${DRILLS_MAX - drillsPlaced()} free`
    : sp.res.tier > 0 ? `${sp.res.name} (${TIER_NAMES[sp.res.tier]}) is ${sp.depth} m deep: needs a drill [3]` : `Hold ${KEY.interact} to dig ${sp.res.name} by hand · or place a drill [3]`;
  const left = st.units >= DRILL_CAP ? 'full' : `next in ${Math.ceil(st.next)}s`;
  return st.units > 0 ? `${k} Collect ${st.units} ${sp.res.name} (${left}) · hold to pack up drill` : `Drilling ${sp.res.name}… ${left} · hold ${k} to pack up drill`;
});
