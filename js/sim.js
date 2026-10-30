'use strict';
// ---------- factory simulation: power, storage links, machine logic ----------
const SMELT = [
  { id: 'iron', in: { iron_ore: 2 }, out: { iron_plate: 1 }, time: 4 },
  { id: 'copper', in: { copper_ore: 2 }, out: { copper_wire: 2 }, time: 4 },
  { id: 'silicon', in: { silicon: 2 }, out: { wafer: 1 }, time: 5 },
];
// fabricator recipes: parts give items; tools and upgrades are applied to you when finished
const FAB = [
  { id: 'gear', kind: 'part', in: { iron_plate: 2 }, out: { gear: 1 }, time: 3 },
  { id: 'circuit', kind: 'part', in: { copper_wire: 2, wafer: 1 }, out: { circuit: 1 }, time: 5 },
  { id: 'scanner2', kind: 'tool', name: 'Long-range Scanner', in: { circuit: 2, ember: 1 }, time: 8, desc: 'Scanner pulses reach twice as far.' },
  { id: 'o2tank', kind: 'upgrade', name: 'Bigger Oxygen Tank', in: { iron_plate: 6, circuit: 2 }, time: 8, desc: 'Suit oxygen 100 → 200.' },
  { id: 'coldsuit', kind: 'upgrade', name: 'Cold Suit', in: { copper_wire: 6, iron_plate: 4, circuit: 1 }, time: 8, desc: 'No damage from extreme cold.' },
  { id: 'heatsuit', kind: 'upgrade', name: 'Heat Suit', in: { iron_plate: 6, wafer: 4, circuit: 2 }, time: 10, desc: 'No damage from extreme heat.' },
  { id: 'fastdrill', kind: 'upgrade', name: 'Faster Drills', in: { gear: 4, circuit: 2 }, time: 10, desc: 'All drills mine twice as fast.' },
  { id: 'helmet', kind: 'upgrade', name: 'Better Helmet Light', in: { circuit: 2, wafer: 1 }, time: 6, desc: 'Brighter, wider helmet light that reaches further.' },
  { id: 'inventory', kind: 'upgrade', name: 'Bigger Backpack', in: { iron_plate: 6, gear: 2 }, time: 8, desc: 'Inventory +40.' },
  { id: 'inventory2', kind: 'upgrade', name: 'Cargo Exoframe', in: { iron_plate: 10, gear: 4, void_crystal: 1 }, time: 12, desc: 'Inventory +60 more.' },
];
const fabById = id => FAB.find(r => r.id === id);
const LANDER_POWER = 3, O2_PER_ICE = 60, O2_CAP = 300, O2_RATE = 15, FUEL_TIME = 10, DRILL_BUF = 30, OUT_BUF = 10;
const fabName = r => r.name || itemName(r.id);

let factoryDirty = true, simAcc = 0, labelAcc = 0, autosaveT = 10;
function factoryChanged() { factoryDirty = true; }

// the lander is a power source and a storage hub too
function landerNode(w) { return { type: 'lander', pos: w.landerPos, reach: LANDER_LINK, def: { gen: LANDER_POWER }, store: { inv: landerInv(), cap: LANDER_CAP } }; }
function storeOf(b) {
  if (b.type === 'lander') return b.store;
  return { inv: crateInv(b), cap: b.def.storage };
}

// work out power grids (sources within range of each other join up) and storage links
function rebuildLinks(w, withLander = true) {
  const L = landerNode(w);
  const nodes = [...(withLander ? [L] : []), ...w.buildings.filter(b => b.def.gen || b.def.capacity)];
  const parent = nodes.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++)
    if (nodes[i].pos.distanceTo(nodes[j].pos) <= POWER_RANGE) parent[find(i)] = find(j);
  const grids = new Map();
  nodes.forEach((n, i) => { const g = find(i); if (!grids.has(g)) grids.set(g, { nodes: [], users: [], ratio: 0, gen: 0, demand: 0 }); grids.get(g).nodes.push(n); n.grid = grids.get(g); });
  const storeNodes = [...(withLander ? [L] : []), ...w.buildings.filter(b => b.type === 'crate')];
  for (const b of w.buildings) {
    b.grid = null;
    if (b.def.power) {
      let best = null, bd = POWER_RANGE;
      for (const n of nodes) { const d = n.pos.distanceTo(b.pos) - (n.reach ? n.reach - POWER_RANGE : 0); if (d <= bd) { bd = d; best = n; } }
      if (best) { b.grid = best.grid; best.grid.users.push(b); }
    }
    b.stores = b.type === 'crate' ? [] : storeNodes.filter(s => s.pos.distanceTo(b.pos) <= (s.reach || STORAGE_RANGE))
      .sort((a, c) => a.pos.distanceTo(b.pos) - c.pos.distanceTo(b.pos)).map(storeOf);
  }
  w.grids = [...grids.values()];
  w.lander = Object.assign(w.lander || {}, { node: L });
  factoryDirty = false;
}

// item helpers over a list of stores
const storesHave = (stores, cost) => Object.entries(cost).every(([id, n]) => stores.reduce((a, s) => a + (s.inv[id] || 0), 0) >= n);
function storesTake(stores, cost) {
  if (!storesHave(stores, cost)) return false;
  for (const [id, n] of Object.entries(cost)) { let left = n; for (const s of stores) left -= invTake(s.inv, id, left); }
  return true;
}
function storesPut(stores, items) {
  const left = Object.assign({}, items);
  for (const id in left) for (const s of stores) { left[id] -= invAdd(s.inv, id, left[id], s.cap); if (!left[id]) { delete left[id]; break; } }
  return left; // whatever didn't fit
}
const bufAdd = (st, key, items) => { const b = st[key] || (st[key] = {}); for (const id in items) b[id] = (b[id] || 0) + items[id]; };
function flushBuf(b, key) {
  const buf = b.rec.s[key];
  if (!buf || !b.stores.length) return;
  b.rec.s[key] = storesPut(b.stores, buf);
}

const drillSpeed = b => 1 / ((4 + (b.spotDepth || 10) / 8) / (save.upgrades.fastdrill ? 2 : 1));

// sunlight on a solar panel, 0..1
function solarFactor(w, b, offline) {
  if (offline) return 0.32; // average over a whole day while you're away
  const s = b.dir.dot(w.sunDir);
  return smooth(-0.05, 0.4, s) * (w.body.dark ? 0.15 : 1);
}

// advance the whole base by dt seconds
function simulate(w, dt, offline = false) {
  if (!offline && (factoryDirty || !w.grids)) rebuildLinks(w);
  const debugFast = typeof debugOn === 'function' && debugOn();
  // ----- power -----
  for (const g of w.grids) {
    let gen = 0;
    for (const n of g.nodes) if (n.def.gen) gen += n.type === 'lander' ? n.def.gen : n.def.gen * solarFactor(w, n, offline);
    const demand = g.users.reduce((a, b) => a + (machineWants(b) ? b.def.power : 0), 0);
    const bats = g.nodes.filter(n => n.def.capacity);
    let ratio = 1;
    if (gen >= demand) {
      let spare = (gen - demand) * dt;
      for (const bt of bats) { const room = bt.def.capacity - (bt.rec.s.charge || 0), add = Math.min(room, spare); bt.rec.s.charge = (bt.rec.s.charge || 0) + add; spare -= add; }
    } else {
      let need = (demand - gen) * dt;
      const have = bats.reduce((a, bt) => a + (bt.rec.s.charge || 0), 0), drawn = Math.min(need, have);
      let left = drawn;
      for (const bt of bats) { const t = Math.min(bt.rec.s.charge || 0, left); bt.rec.s.charge -= t; left -= t; }
      ratio = demand > 0 ? (gen * dt + drawn) / (demand * dt) : 1;
    }
    Object.assign(g, { gen, demand, ratio });
  }
  // ----- machines -----
  for (const b of w.buildings) {
    const s = b.rec.s, pw = b.def.power ? (b.grid ? b.grid.ratio : 0) : 1, speed = debugFast ? 20 : 1;
    b.working = false;
    if (b.type === 'drill') {
      const buf = s.buf || (s.buf = {}), res = b.spotRes;
      if (!res) continue;
      if (invTotal(buf) < DRILL_BUF) {
        s.prog = (s.prog || 0) + dt * drillSpeed(b) * speed;
        const n = Math.min(Math.floor(s.prog), DRILL_BUF - invTotal(buf));
        if (n > 0) { buf[res] = (buf[res] || 0) + n; s.prog -= n; }
        b.working = true;
      } else s.prog = 0;
      flushBuf(b, 'buf');
    } else if (b.type === 'smelter') {
      // `work` = seconds of full-speed work available this step; finish as many batches as it covers
      let work = dt * pw * speed;
      while (true) {
        if (!s.cur) {
          if (invTotal(s.out || {}) >= OUT_BUF) break;
          const list = s.mode && s.mode !== 'auto' ? SMELT.filter(r => r.id === s.mode) : SMELT.slice((s.rr || 0)).concat(SMELT.slice(0, s.rr || 0));
          for (const r of list) if (storesTake(b.stores, r.in)) { s.cur = r.id; s.prog = 0; s.rr = (SMELT.indexOf(r) + 1) % SMELT.length; break; }
          if (!s.cur) break;
        }
        const r = SMELT.find(x => x.id === s.cur), need = (1 - s.prog) * r.time;
        b.working = pw > 0;
        if (work < need || work <= 0) { s.prog += work / r.time; break; }
        work -= need;
        bufAdd(s, 'out', r.out); s.cur = null; s.prog = 0; s.made = (s.made || 0) + 1;
        flushBuf(b, 'out');
      }
      flushBuf(b, 'out');
    } else if (b.type === 'fabricator') {
      const q = s.q || (s.q = []);
      let work = dt * pw * speed;
      while (q.length && work > 0) {
        const r = fabById(q[0]), need = (1 - (s.prog || 0)) * r.time;
        b.working = true;
        if (work < need) { s.prog = (s.prog || 0) + work / r.time; break; }
        work -= need; s.prog = 0; q.shift();
        if (r.out) bufAdd(s, 'out', r.out);
        else { save.upgrades[r.id] = true; if (w === world && !offline) toast(`${fabName(r)} installed! ${r.desc}`, 'new'); }
      }
      flushBuf(b, 'out');
    } else if (b.type === 'o2gen') {
      s.o2 = s.o2 || 0; s.ice = s.ice || 0;
      let canMake = O2_RATE * dt * pw * speed;
      while (s.o2 < O2_CAP && canMake > 0) {
        if (s.ice <= 1e-6 && !storesTake(b.stores, { ice: 1 })) break;
        if (s.ice <= 1e-6) s.ice += 1;
        const made = Math.min(canMake, s.ice * O2_PER_ICE, O2_CAP - s.o2);
        s.o2 += made; s.ice -= made / O2_PER_ICE; canMake -= made; b.working = made > 0;
      }
    } else if (b.type === 'refinery') {
      let work = dt * pw * speed;
      while (true) {
        if (!s.busy) {
          if (invTotal(s.out || {}) >= OUT_BUF || !storesTake(b.stores, { ice: 2 })) break;
          s.busy = true; s.prog = 0;
        }
        const need = (1 - s.prog) * FUEL_TIME;
        b.working = pw > 0;
        if (work < need || work <= 0) { s.prog += work / FUEL_TIME; break; }
        work -= need;
        s.busy = false; s.prog = 0; bufAdd(s, 'out', { fuel: 1 }); s.made = (s.made || 0) + 1;
        flushBuf(b, 'out');
      }
      flushBuf(b, 'out');
    }
  }
}
// does a powered machine have something to do (so it draws power)?
function machineWants(b) {
  const s = b.rec.s;
  if (b.type === 'smelter') return !!s.cur || SMELT.some(r => storesHave(b.stores, r.in));
  if (b.type === 'fabricator') return !!(s.q && s.q.length);
  if (b.type === 'o2gen') return (s.o2 || 0) < O2_CAP && ((s.ice || 0) > 0 || storesHave(b.stores, { ice: 1 }));
  if (b.type === 'refinery') return !!s.busy || storesHave(b.stores, { ice: 2 });
  return false;
}

// oxygen generators top up your suit when you're close
function factoryO2Near(pos) {
  if (!world || !world.buildings) return null;
  for (const b of world.buildings) {
    if (b.type !== 'o2gen' || (b.rec.s.o2 || 0) < 1 || b.pos.distanceTo(pos) > O2_RANGE) continue;
    return { b, refill: amt => { const t = Math.min(amt, b.rec.s.o2); b.rec.s.o2 -= t; return t; } };
  }
  return null;
}

// ---------- live labels + small animations ----------
function machineStatus(b) {
  const s = b.rec.s, pct = x => `${Math.round((x || 0) * 100)}%`;
  const noPow = b.def.power && (!b.grid || b.grid.ratio <= 0.01);
  switch (b.type) {
    case 'drill': return b.spotRes ? `${itemName(b.spotRes)} ${invTotal(s.buf || {})}/${DRILL_BUF}${invTotal(s.buf || {}) >= DRILL_BUF ? ' (full)' : ''}` : 'no deposit';
    case 'crate': return `${invTotal(crateInv(b))}/${b.def.storage}`;
    case 'smelter': return s.cur ? (noPow ? 'no power' : `${itemName(Object.keys(SMELT.find(r => r.id === s.cur).out)[0])} ${pct(s.prog)}`) : (b.stores.length ? 'waiting for ore' : 'no storage nearby');
    case 'fabricator': return s.q && s.q.length ? (noPow ? 'no power' : `${fabName(fabById(s.q[0]))} ${pct(s.prog)}`) : 'idle';
    case 'solar': return `${(b.def.gen * solarFactor(world, b)).toFixed(1)} power`;
    case 'battery': return `${pct((s.charge || 0) / b.def.capacity)} charged`;
    case 'o2gen': return `${Math.round(s.o2 || 0)} O₂` + (noPow && machineWants(b) ? ' · no power' : !(s.ice > 0) && !storesHave(b.stores, { ice: 1 }) && (s.o2 || 0) < O2_CAP ? ' · needs ice' : '');
    case 'refinery': return s.busy ? (noPow ? 'no power' : `fuel ${pct(s.prog)}`) : (b.stores.length ? 'needs ice' : 'no storage nearby');
  }
  return '';
}
function syncFactory(dt) {
  if (!world || !world.buildings) return;
  labelAcc -= dt;
  const relabel = labelAcc <= 0;
  if (relabel) labelAcc = 0.5;
  const maxD = Math.max(LABEL_DIST[opts.labels], 40);
  for (const b of world.buildings) {
    const dist = b.pos.distanceTo(player.pos);
    b.mesh.visible = dist < 900;
    if (b.mesh.userData.spin && b.working) b.mesh.userData.spin.rotation.y += 0.3;
    b.label.visible = opts.labels !== 'off' && dist < maxD;
    if (relabel && b.label.visible) {
      const t = `${b.def.name} · ${machineStatus(b)}`;
      if (t !== b.labelText) { b.labelText = t; setLabelText(b.label, t, b.def.power && (!b.grid || b.grid.ratio < 0.5) && machineWants(b) ? '#ff9d9d' : '#ffd98a', 0.55, false); }
    }
  }
}
// ---------- catching up while you were away ----------
// Bases on other worlds don't run while you're elsewhere; when you come back (or reload the game)
// the time you were gone is replayed in 30 s steps (up to a day), with average daylight for solar.
const CATCHUP_MAX = 24 * 3600, CATCHUP_STEP = 30;
function baseTotals(w) {
  const t = {};
  const add = inv => { for (const id in inv || {}) t[id] = (t[id] || 0) + inv[id]; };
  for (const b of w.buildings) { add(b.rec.s.items); add(b.rec.s.buf); add(b.rec.s.out); }
  return t;
}
function catchUp(w, landerWasHere) {
  const base = baseData(w.body.id), secs = Math.min(CATCHUP_MAX, (Date.now() - (base.t || Date.now())) / 1000);
  base.t = Date.now();
  if (!w.buildings.length || secs < 5) return null;
  const before = baseTotals(w), landerBefore = Object.assign({}, landerInv());
  rebuildLinks(w, landerWasHere);
  for (let t = 0; t < secs; t += CATCHUP_STEP) simulate(w, Math.min(CATCHUP_STEP, secs - t), true);
  factoryChanged();
  // what piled up (in crates, machine buffers and, if it stayed here, the lander)
  const after = baseTotals(w), gained = {};
  for (const id in after) if (after[id] > (before[id] || 0)) gained[id] = after[id] - (before[id] || 0);
  if (landerWasHere) for (const id in landerInv()) if (landerInv()[id] > (landerBefore[id] || 0)) gained[id] = (gained[id] || 0) + landerInv()[id] - (landerBefore[id] || 0);
  return { secs, gained };
}
function awayText(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60);
  return h ? `${h} h ${m} min` : m ? `${m} min` : `${Math.round(secs)} s`;
}

// run the simulation in small fixed steps
function factoryTick(dt) {
  if (!world || !world.buildings) return;
  simAcc += dt;
  while (simAcc >= 0.25) { simulate(world, 0.25); simAcc -= 0.25; }
  baseData().t = Date.now();
  // machine states change all the time: save every few seconds
  if ((autosaveT -= dt) <= 0) { autosaveT = 10; writeSave(); }
}
