'use strict';
// ---------- items, inventories ----------
const ITEMS = {
  // raw resources from mining spots
  iron_ore:     { name: 'Iron Ore',      color: '#a87a62', raw: true },
  copper_ore:   { name: 'Copper Ore',    color: '#e08a4a', raw: true },
  silicon:      { name: 'Silicon',       color: '#8fb0c8', raw: true },
  ice:          { name: 'Ice',           color: '#bff0ff', raw: true },
  ember:        { name: 'Ember Crystal', color: '#ff5a6e', raw: true, rare: true },
  void_crystal: { name: 'Void Crystal',  color: '#b48cff', raw: true, rare: true },
  xeno_crystal: { name: 'Xeno Crystal',  color: '#5dffb0', raw: true, rare: true },
  // smelted
  iron_plate:   { name: 'Iron Plate',    color: '#c9ced8' },
  copper_wire:  { name: 'Copper Wire',   color: '#ff9f5a' },
  wafer:        { name: 'Silicon Wafer', color: '#6fa8dc' },
  // fabricated parts
  gear:         { name: 'Gear',          color: '#9aa3b8' },
  circuit:      { name: 'Circuit',       color: '#5fd38a' },
  solar_cell:   { name: 'Solar Cell',    color: '#3b6fd1' },
  // refined
  fuel:         { name: 'Rocket Fuel',   color: '#ffb347' },
};
const itemName = id => (ITEMS[id] || { name: id }).name;

const INV_BASE = 60, LANDER_CAP = 400;
const invCap = () => INV_BASE + (save.upgrades.inventory ? 40 : 0) + (save.upgrades.inventory2 ? 60 : 0);
const invTotal = inv => Object.values(inv).reduce((a, b) => a + b, 0);
function invAdd(inv, id, n, cap = Infinity) {
  const add = Math.max(0, Math.min(n, cap - invTotal(inv)));
  if (add > 0) inv[id] = (inv[id] || 0) + add;
  return add;
}
function invTake(inv, id, n) {
  const t = Math.min(n, inv[id] || 0);
  if (t > 0) { inv[id] -= t; if (!inv[id]) delete inv[id]; }
  return t;
}
// the player's own pockets and the lander's hold (the lander travels with you)
const playerInv = () => save.inv;
const landerInv = () => save.lander.items;
// short "3 Iron Plate, 2 Gear" style text for a cost / item list
const costText = cost => Object.entries(cost).map(([id, n]) => `${n} ${itemName(id)}`).join(', ');
function chip(id, n, extra = '') {
  return `<span class="chip"><i style="background:${ITEMS[id] ? ITEMS[id].color : '#888'}"></i>${n} ${itemName(id)}${extra}</span>`;
}
