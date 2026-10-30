'use strict';
// ---------- tech tree (spend Research Points from analyzed samples) ----------
const TECH = [
  { id: 'base', tier: 1, name: 'Basic Industry', cost: 0, req: [], unlocks: ['drill', 'crate', 'smelter', 'solar', 'beacon'], desc: 'Drills, crates, smelters, solar panels and beacons.' },
  { id: 'fab', tier: 2, name: 'Fabrication', cost: 10, req: ['base'], unlocks: ['fabricator', 'gear', 'circuit'], desc: 'The Fabricator, Gears and Circuits.' },
  { id: 'battery', tier: 3, name: 'Energy Storage', cost: 15, req: ['fab'], unlocks: ['battery'], desc: 'Batteries keep machines running at night.' },
  { id: 'o2gen', tier: 3, name: 'Life Support', cost: 20, req: ['fab'], unlocks: ['o2gen'], desc: 'Oxygen Generator: refill your suit away from the lander.' },
  { id: 'refinery', tier: 3, name: 'Fuel Refining', cost: 30, req: ['fab'], unlocks: ['refinery'], desc: 'Fuel Refinery: make Rocket Fuel to travel to other worlds.' },
  { id: 'rover', tier: 3, name: 'Rover', cost: 20, req: ['fab'], unlocks: ['rover'], desc: 'A drivable rover with a cargo hold (craft at a Fabricator).' },
  { id: 'helmet', tier: 3, name: 'Better Helmet Light', cost: 10, req: ['fab'], unlocks: ['helmet'], desc: 'Upgrade (craft at a Fabricator).' },
  { id: 'inventory', tier: 3, name: 'Bigger Backpack', cost: 20, req: ['fab'], unlocks: ['inventory'], desc: 'Upgrade: inventory +40.' },
  { id: 'coldsuit', tier: 3, name: 'Cold Suit', cost: 25, req: ['fab'], unlocks: ['coldsuit'], desc: 'Upgrade: survive extreme cold.' },
  { id: 'fastdrill', tier: 3, name: 'Faster Drills', cost: 30, req: ['fab'], unlocks: ['fastdrill'], desc: 'Upgrade: all drills twice as fast.' },
  { id: 'scanner2', tier: 3, name: 'Long-range Scanner', cost: 20, req: ['fab'], unlocks: ['scanner2'], desc: 'Tool: scanner pulses reach twice as far (needs an Ember Crystal).' },
  { id: 'o2tank', tier: 4, name: 'Bigger Oxygen Tank', cost: 25, req: ['o2gen'], unlocks: ['o2tank'], desc: 'Upgrade: suit oxygen 100 → 200.' },
  { id: 'heatsuit', tier: 4, name: 'Heat Suit', cost: 35, req: ['coldsuit'], unlocks: ['heatsuit'], desc: 'Upgrade: survive extreme heat.' },
  { id: 'inventory2', tier: 4, name: 'Cargo Exoframe', cost: 60, req: ['inventory'], unlocks: ['inventory2'], desc: 'Upgrade: inventory +60 more (needs a Void Crystal).' },
];
const techById = id => TECH.find(t => t.id === id);
const researched = id => save.tech.includes(id);
// is a machine / recipe / upgrade unlocked by something you've researched?
function techHas(thing) { return save.tech.some(id => techById(id) && techById(id).unlocks.includes(thing)); }
const techAvailable = t => !researched(t.id) && t.req.every(researched);

function research(id) {
  const t = techById(id);
  if (!techAvailable(t) || save.rp < t.cost) return;
  save.rp -= t.cost;
  save.tech.push(id);
  writeSave();
  toast(`Researched ${t.name}! ${t.desc}`, 'new');
  renderTech();
}
function openTech(back = menu === 'machine' ? 'machine' : menu === 'pause' ? 'pause' : null) { showMenu('tech', back); }
function renderTech() {
  let h = `<h2>Tech Tree</h2><p class="sub">Research Points: <b>${save.rp}</b>. Analyze new samples at the lander to earn more. Upgrades still have to be crafted at a Fabricator after researching them.</p><div class="ttree">`;
  for (const tier of [1, 2, 3, 4]) {
    h += `<div class="tcol"><h4>Tier ${tier}</h4>`;
    for (const t of TECH.filter(x => x.tier === tier)) {
      const done = researched(t.id), avail = techAvailable(t), missing = t.req.filter(r => !researched(r)).map(r => techById(r).name);
      h += `<div class="tnode ${done ? 'done' : avail ? '' : 'locked'}"><b>${done ? '✓ ' : ''}${t.name}</b><p class="muted">${t.desc}</p>
        ${done ? '<span class="muted">Researched</span>' : avail ? `<button ${save.rp >= t.cost ? '' : 'disabled'} onclick="research('${t.id}')">Research · ${t.cost} RP</button>` : `<span class="muted">Needs ${missing.join(', ')}</span>`}</div>`;
    }
    h += '</div>';
  }
  h += `</div><div class="row"><button class="ghost" onclick="goBack()">Close</button></div>`;
  $('techBody').innerHTML = h;
}

// ---------- rocket fuel for travelling ----------
// short hops between a planet and its moons are cheap; trips between planets cost more
function fuelCost(from, to) {
  if (from === to) return 0;
  const pf = planetOf(from), pt = planetOf(to);
  if (pf === pt) return 4;
  return 6 + 3 * Math.abs(pf.idx - pt.idx) + (from.type === 'moon' ? 2 : 0) + (to.type === 'moon' ? 2 : 0);
}
// fuel the lander can use: its own hold plus crates right next to it
function fuelStores() {
  const stores = [{ inv: landerInv(), cap: LANDER_CAP }];
  for (const b of world.buildings || []) if (b.type === 'crate' && b.pos.distanceTo(world.landerPos) <= LANDER_LINK) stores.push({ inv: crateInv(b), cap: b.def.storage });
  return stores;
}
const fuelAvailable = () => storesCount(fuelStores(), 'fuel');
const freeTravel = () => typeof adminFast === 'function' && adminFast();
