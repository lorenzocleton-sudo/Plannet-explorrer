'use strict';
// ---------- machines: definitions, models, per-world bases ----------
// Every machine is a simple form with a name label. Ranges keep the logistics simple:
// machines near a power source are powered, machines near a crate (or the lander) use it as storage.
// the lander reaches a bit further so machines just outside its landing pad still connect
const POWER_RANGE = 15, STORAGE_RANGE = 12, O2_RANGE = 8, BUILD_REACH = 25, LANDER_LINK = 20;

const MACHINES = {
  drill:      { name: 'Drill',            cost: { iron_plate: 8, copper_wire: 4 }, fp: 1.6, onSpot: true,
                desc: 'Place on a mining spot. Mines automatically and stores what it digs (pushes into a nearby crate).' },
  crate:      { name: 'Storage Crate',    cost: { iron_plate: 8 }, fp: 1.0, storage: 200,
                desc: `Holds 200 items. Machines within ${STORAGE_RANGE} m take from it and put into it.` },
  smelter:    { name: 'Smelter',          cost: { iron_plate: 12, copper_wire: 4 }, fp: 1.6, power: 2,
                desc: 'Ore into Iron Plates, Copper Wire and Silicon Wafers. Needs power.' },
  fabricator: { name: 'Fabricator',       cost: { iron_plate: 15, copper_wire: 6, wafer: 2 }, fp: 1.6, power: 3,
                desc: 'Crafts parts, tools and suit upgrades. Needs power.' },
  solar:      { name: 'Solar Panel',      cost: { iron_plate: 3, copper_wire: 4, wafer: 4 }, fp: 1.5, gen: 4,
                desc: `Makes power in daylight only. Powers machines within ${POWER_RANGE} m.` },
  battery:    { name: 'Battery',          cost: { iron_plate: 6, copper_wire: 6, circuit: 2 }, fp: 0.9, capacity: 600,
                desc: 'Stores spare power for the night and passes power on to machines nearby.' },
  o2gen:      { name: 'Oxygen Generator', cost: { iron_plate: 10, copper_wire: 4, circuit: 2 }, fp: 1.1, power: 2,
                desc: `Ice + power into oxygen. Refills your suit within ${O2_RANGE} m.` },
  beacon:     { name: 'Beacon',           cost: { iron_plate: 2, copper_wire: 1 }, fp: 0.5,
                desc: 'A marker with a name and colour of your choice. Shows on the compass and glows from far away.' },
  refinery:   { name: 'Fuel Refinery',    cost: { iron_plate: 14, gear: 4, circuit: 3 }, fp: 1.8, power: 3,
                desc: 'Ice + power into Rocket Fuel for travelling to other worlds.' },
};
const LABEL_H = { beacon: 3.4, drill: 4.2, crate: 1.9, smelter: 3.6, fabricator: 2.6, solar: 3.2, battery: 2.4, o2gen: 3.0, refinery: 4.4 };

// ---------- models ----------
const M_STD = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.6, metalness: 0.2 }, extra)); sharedMats.add(m); return m; };
const MAT = {
  steel: M_STD(0x8a93a8), dark: M_STD(0x3a3f4c), yellow: M_STD(0xffc23a), crate: M_STD(0xb07a42), stripe: M_STD(0x4a3520),
  glow: M_STD(0xff7a2a, { emissive: 0xff5a10, emissiveIntensity: 0.9 }), blue: M_STD(0x2b4bd1), panel: M_STD(0x1b2e6e, { metalness: 0.5, roughness: 0.25 }),
  screen: M_STD(0x5fd38a, { emissive: 0x2a8a50, emissiveIntensity: 0.7 }), white: M_STD(0xe8edf4), cyan: M_STD(0x7fe0ff, { emissive: 0x2a8aa0, emissiveIntensity: 0.4 }),
  green: M_STD(0x4cc46a, { emissive: 0x1d6a30, emissiveIntensity: 0.5 }), orange: M_STD(0xff9a3a),
};
const G = (geo, mat, x = 0, y = 0, z = 0) => { sharedGeos.add(geo); const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const GEOS = {};
const geo = (key, make) => GEOS[key] || (GEOS[key] = make());
function machineModel(type) {
  if (type === 'beacon') return beaconModel(BEACON_COLORS[4]);
  const g = new THREE.Group(), add = (...ms) => ms.forEach(m => g.add(m));
  if (type === 'drill') {
    add(G(DRILL_GEO.frame, MAT.yellow), G(DRILL_GEO.tower, MAT.yellow));
    const bit = G(DRILL_GEO.bit, MAT.steel); add(bit); g.userData.spin = bit;
    add(G(geo('drillBox', () => new THREE.BoxGeometry(0.9, 0.8, 0.9)), MAT.dark, 0.9, 0.6, 0));
  } else if (type === 'crate') {
    add(G(geo('crate', () => new THREE.BoxGeometry(1.6, 1.2, 1.6)), MAT.crate, 0, 0.6, 0),
        G(geo('crateBand', () => new THREE.BoxGeometry(1.66, 0.14, 1.66)), MAT.stripe, 0, 0.9, 0),
        G(geo('crateBand'), MAT.stripe, 0, 0.3, 0));
  } else if (type === 'smelter') {
    add(G(geo('smeltBase', () => new THREE.BoxGeometry(2.2, 1.6, 2)), MAT.dark, 0, 0.8, 0),
        G(geo('smeltWin', () => new THREE.BoxGeometry(0.9, 0.5, 0.1)), MAT.glow, 0, 0.8, 1.01),
        G(geo('chimney', () => new THREE.CylinderGeometry(0.3, 0.38, 1.6, 8)), MAT.steel, 0.6, 2.2, -0.5));
  } else if (type === 'fabricator') {
    add(G(geo('fabBase', () => new THREE.BoxGeometry(2.2, 1.2, 1.6)), MAT.blue, 0, 0.6, 0),
        G(geo('fabScreen', () => new THREE.BoxGeometry(0.8, 0.5, 0.08)), MAT.screen, -0.5, 0.75, 0.81),
        G(geo('fabArm', () => new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6)), MAT.steel, 0.6, 1.7, 0));
  } else if (type === 'solar') {
    add(G(geo('pole', () => new THREE.CylinderGeometry(0.1, 0.14, 1.6, 6)), MAT.steel, 0, 0.8, 0));
    const p = G(geo('solarPanel', () => new THREE.BoxGeometry(2.6, 0.08, 1.7)), MAT.panel, 0, 1.7, 0);
    p.rotation.x = -0.45; add(p);
  } else if (type === 'battery') {
    add(G(geo('batt', () => new THREE.CylinderGeometry(0.55, 0.55, 1.6, 12)), MAT.dark, 0, 0.8, 0),
        G(geo('battBand', () => new THREE.CylinderGeometry(0.57, 0.57, 0.3, 12)), MAT.green, 0, 1.1, 0));
  } else if (type === 'o2gen') {
    add(G(geo('o2tank', () => new THREE.CylinderGeometry(0.7, 0.7, 1.6, 14)), MAT.white, 0, 0.8, 0),
        G(geo('o2dome', () => new THREE.SphereGeometry(0.7, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), MAT.cyan, 0, 1.6, 0));
  } else if (type === 'refinery') {
    add(G(geo('refTank', () => new THREE.CylinderGeometry(0.6, 0.6, 2.2, 12)), MAT.orange, -0.75, 1.1, 0),
        G(geo('refTank'), MAT.orange, 0.75, 1.1, 0),
        G(geo('refTower', () => new THREE.CylinderGeometry(0.25, 0.3, 3.4, 8)), MAT.steel, 0, 1.7, -0.7));
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- bases: the buildings saved for each world ----------
// save.bases[bodyId] = { list: [{ u, t, d: [x,y,z], r, s: {...state} }], t: lastUpdate, n: nextId }
function baseData(bodyId = world.body.id) {
  return save.bases[bodyId] || (save.bases[bodyId] = { list: [], t: Date.now(), n: 1 });
}
function loadBase(w) {
  w.buildings = [];
  for (const rec of baseData(w.body.id).list) spawnBuilding(w, rec);
}
function spawnBuilding(w, rec) {
  const dir = new THREE.Vector3().fromArray(rec.d).normalize();
  const r = w.R + groundH(dir), def = MACHINES[rec.t];
  const b = { rec, type: rec.t, def, dir, pos: dir.clone().multiplyScalar(r), mesh: machineModel(rec.t), stores: [], grid: null };
  placeOnSurface(b.mesh, dir, r, rec.r);
  b.label = makeDynLabel(0.55);
  setDynLabel(b.label, def.name, '#ffd98a');
  if (rec.t === 'beacon') styleBeacon(b);
  b.label.position.copy(dir).multiplyScalar(r + LABEL_H[rec.t]);
  w.scene.add(b.mesh, b.label);
  w.buildings.push(b);
  if (rec.t === 'drill' && rec.s.spot != null && w.spots[rec.s.spot]) {
    const sp = w.spots[rec.s.spot];
    sp.machine = b; b.spotRes = sp.res.id; b.spotDepth = sp.depth;
  }
  return b;
}
function removeBuilding(w, b) {
  w.scene.remove(b.mesh, b.label);
  disposeDynLabel(b.label);
  w.buildings = w.buildings.filter(x => x !== b);
  const base = baseData(w.body.id);
  base.list = base.list.filter(r => r !== b.rec);
  if (b.type === 'drill' && b.rec.s.spot != null && w.spots[b.rec.s.spot]) w.spots[b.rec.s.spot].machine = null;
}

// ---------- paying for things ----------
// Building uses your inventory first, then crates around you, then the lander's hold
// (the lander's drone delivers anywhere on the world you're on).
function nearbyStores(pos = player.pos) {
  const stores = [{ name: 'inventory', inv: playerInv(), cap: invCap() }];
  for (const b of world.buildings || []) if (b.type === 'crate' && b.pos.distanceTo(pos) < STORAGE_RANGE) stores.push({ name: 'crate', inv: crateInv(b), cap: b.def.storage });
  stores.push({ name: 'lander', inv: landerInv(), cap: LANDER_CAP });
  return stores;
}
const crateInv = b => b.rec.s.items || (b.rec.s.items = {});
const storesCount = (stores, id) => stores.reduce((a, s) => a + (s.inv[id] || 0), 0);
const canAfford = (cost, stores = nearbyStores()) => Object.entries(cost).every(([id, n]) => storesCount(stores, id) >= n);
function payCost(cost, stores = nearbyStores()) {
  if (!canAfford(cost, stores)) return false;
  for (const [id, n] of Object.entries(cost)) { let left = n; for (const s of stores) left -= invTake(s.inv, id, left); }
  return true;
}
// give items back: inventory first, then the other stores; returns false (and changes nothing) if they don't fit
function refundItems(items, stores = nearbyStores()) {
  const room = stores.reduce((a, s) => a + Math.max(0, s.cap - invTotal(s.inv)), 0);
  if (invTotal(items) > room) return false;
  for (const [id, n] of Object.entries(items)) { let left = n; for (const s of stores) left -= invAdd(s.inv, id, left, s.cap); }
  return true;
}
