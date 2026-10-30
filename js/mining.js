'use strict';
// ---------- mining spots + drills ----------
// Rarer resources sit deeper (slower to drill) and only show up on harder worlds.
const RESOURCES = [
  { id: 'iron', name: 'Iron', tier: 0, color: '#b9c0cc', value: 2 },
  { id: 'copper', name: 'Copper', tier: 0, color: '#e08a4a', value: 2 },
  { id: 'silicon', name: 'Silicon', tier: 0, color: '#8fb0c8', value: 2 },
  { id: 'water', name: 'Water Ice', tier: 0, color: '#bff0ff', value: 3, iceOnly: true },
  { id: 'titanium', name: 'Titanium', tier: 1, color: '#dfe6f2', value: 5 },
  { id: 'cobalt', name: 'Cobalt', tier: 1, color: '#5b7cff', value: 5 },
  { id: 'gold', name: 'Gold', tier: 2, color: '#ffd34d', value: 10 },
  { id: 'platinum', name: 'Platinum', tier: 2, color: '#eef0ff', value: 12 },
  { id: 'iridium', name: 'Iridium', tier: 3, color: '#c49bff', value: 25 },
  { id: 'xenocrystal', name: 'Xenocrystal', tier: 4, color: '#5dffb0', value: 50 },
];
const TIER_NAMES = ['Common', 'Uncommon', 'Rare', 'Very rare', 'Exotic'];
const DRILLS_MAX = 3, DRILL_CAP = 8, CARGO_MAX = 40, DRILL_REACH = 4, PICKUP_TIME = 1.2;
const resById = id => RESOURCES.find(r => r.id === id);

let cargo = {};
const cargoCount = () => Object.values(cargo).reduce((a, b) => a + b, 0);

// how "hard" a world is: later planets (and their moons) roll rarer, deeper deposits
const difficulty = b => b.type === 'planet' ? b.idx : b.idx + 0.5;
function rollResource(rnd, body) {
  const diff = difficulty(body), maxTier = Math.min(4, 1 + Math.floor(diff));
  const pool = RESOURCES.filter(r => r.tier <= maxTier && (!r.iceOnly || body.ice || body.name === 'Glacia'));
  let tot = 0;
  const ws = pool.map(r => { const w = Math.pow(0.42, r.tier) * (1 + diff * 0.35 * r.tier); tot += w; return w; });
  let x = rnd() * tot;
  for (let i = 0; i < pool.length; i++) { x -= ws[i]; if (x <= 0) return pool[i]; }
  return pool[0];
}

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
  const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 + r.tier * 0.1, flatShading: true, roughness: 0.4 });
  sharedMats.add(m);
  return (resMatCache[r.id] = m);
}

function spotLabelText(sp) { return `${sp.res.name} deposit · ${sp.depth} m deep`; }

function spawnSpots(w) {
  const body = w.body, R = w.R, rnd = mulberry32(body.seed * 19 + 77), d = new THREE.Vector3();
  const count = body.type === 'planet' ? 14 : 7;
  w.spots = [];
  for (let tries = 0; w.spots.length < count && tries < 2000; tries++) {
    randDir(rnd, d);
    const h = groundH(d);
    if (w.hasSea && h < 0.5) continue;
    if (Math.acos(clamp(d.dot(w.L), -1, 1)) * R < 22) continue;
    if (w.spots.some(s => s.dir.distanceTo(d) * R < 30)) continue;
    const res = rollResource(rnd, body);
    const depth = Math.round(5 + res.tier * 16 + rnd() * 10);
    const sp = { idx: w.spots.length, res, depth, dir: d.clone(), group: new THREE.Group() };
    const disk = new THREE.Mesh(SPOT_GEO, resMat(res));
    sp.group.add(disk);
    for (let i = 0; i < 4; i++) {
      const o = new THREE.Mesh(ORE_GEO, resMat(res));
      const a = i / 4 * Math.PI * 2 + rnd();
      o.position.set(Math.cos(a) * 1.1, 0.05, Math.sin(a) * 1.1);
      o.rotation.y = rnd() * 3;
      o.scale.setScalar(0.7 + rnd() * 0.6);
      sp.group.add(o);
    }
    sp.group.traverse(o => { o.castShadow = true; });
    sp.label = makeLabel(spotLabelText(sp), sp.res.color, 0.6, false);
    w.scene.add(sp.group, sp.label);
    placeSpot(sp);
    w.spots.push(sp);
  }
  // drills left running here (they keep mining while you're away)
  const placed = save.drills[body.id] || {};
  for (const k in placed) if (w.spots[k]) buildDrill(w.spots[k]);
}
function placeSpot(sp) {
  const r = world.R + groundH(sp.dir);
  sp.r = r;
  sp.pos = sp.dir.clone().multiplyScalar(r);
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
  const secsPerUnit = instantDrill() ? 0 : 3 + sp.depth / 6;
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
  const room = CARGO_MAX - cargoCount();
  if (room <= 0) { toast('Cargo hold full! Unload at the lander.', 'bad'); return; }
  const n = Math.min(room, st.units);
  cargo[sp.res.id] = (cargo[sp.res.id] || 0) + n;
  // keep any partial progress towards the next unit
  st.rec.start = Date.now() - (st.secsPerUnit ? ((Date.now() - st.rec.start) / 1000 % st.secsPerUnit) * 1000 : 0) - (st.units - n) * st.secsPerUnit * 1000;
  writeSave();
  floater(sp.pos, sp.dir, `+${n} ${sp.res.name}`, sp.res.color);
}
function unloadCargo() {
  let gained = 0;
  const parts = [];
  for (const id in cargo) {
    const r = resById(id), n = cargo[id];
    save.res[id] = (save.res[id] || 0) + n;
    gained += r.value * n;
    parts.push(`${n} ${r.name}`);
  }
  cargo = {};
  save.rp += gained;
  writeSave();
  toast(`Unloaded ${parts.join(', ')}: +${gained} RP`);
}

// per-frame visuals: spinning bits, live labels
function syncMining() {
  const maxD = Math.max(LABEL_DIST[opts.labels], 60);
  for (const sp of world.spots) {
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
    sp.label.visible = opts.labels !== 'off' && sp.pos.distanceTo(player.pos) < maxD;
  }
}

promptHooks.push(() => {
  const sp = nearestSpot();
  const isDrill = TOOLS[tool].id === 'drill';
  if (!sp) return isDrill ? `Find a mining spot (labelled "deposit") · ${DRILLS_MAX - drillsPlaced()}/${DRILLS_MAX} drills free` : '';
  if (!isDrill) return `Switch to Drill [3] to mine ${sp.res.name}`;
  const st = drillState(sp);
  if (!st) return `[E] Place drill on ${sp.res.name} (${TIER_NAMES[sp.res.tier]}, ${sp.depth} m deep) · ${DRILLS_MAX - drillsPlaced()} free`;
  const left = st.units >= DRILL_CAP ? 'full' : `next in ${Math.ceil(st.next)}s`;
  return st.units > 0 ? `[E] Collect ${st.units} ${sp.res.name} (${left}) · hold to pack up drill` : `Drilling ${sp.res.name}… ${left} · hold [E] to pack up drill`;
});
