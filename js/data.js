'use strict';
// ---------- game data: bodies, species, save, options ----------
const VERSION = '0.7';
// bump with every release so browsers fetch fresh models and textures
const ASSET_V = '0.7.2';

const CATS = {
  plant:   { label: 'Plants',       one: 'Plant',   n: 4, base: 1,  tag: '#9ef08a' },
  rock:    { label: 'Rocks',        one: 'Rock',    n: 3, base: 1,  tag: '#d6dae4' },
  mineral: { label: 'Minerals',     one: 'Mineral', n: 4, base: 3,  tag: '#d2b4ff' },
  fossil:  { label: 'Ancient Life', one: 'Fossil',  n: 3, base: 10, tag: '#ffd166' },
  dust:    { label: 'Dust',         one: 'Dust',    n: 2, base: 1,  tag: '#ecd9b6' },
  ice:     { label: 'Ice',          one: 'Ice',     n: 2, base: 2,  tag: '#bff0ff' },
};
const PLANET_CATS = ['plant', 'rock', 'mineral', 'fossil'];

// R = radius (m), g = surface gravity (m/s², Earth = 9.81). Moon gravity is worked out from size below. Biome colors are [hue, sat, light].
// "breathable" is hidden from the player until they land there.
const PLANETS = [
  { name: 'Verdara', seed: 1101, temp: { base: 18, swing: 10 }, cost: 0, dayLen: 600, tilt: 0.35, R: 6000, g: 9.81, breathable: true, o2: 1.0, speed: 1.0, grip: 10,
    atmo: { kind: 'Nitrogen–oxygen', comp: 'N₂ 78% · O₂ 21% · Ar 0.9% · CO₂ 0.04%', color: '#5d9cff', sunset: '#ff8a4a', glow: '#ffc58a', haze: '#d4e4ff', fog: [900, 15000], clouds: 0.45, cloudColor: '#ffffff', wind: 0.0005 }, seaBias: 0.25, land: 45, mount: 520, desc: 'Mild, lush starter world.',
    col: { liquid: [200, 55, 34], plains: [105, 38, 36], rocky: [32, 18, 38], crystal: [265, 30, 52], beach: [45, 40, 62], snow: [210, 25, 93] },
    moons: [{ name: 'Pell', R: 1700, ice: false }] },
  { name: 'Ruska', seed: 2207, temp: { base: 40, swing: 38 }, cost: 40, dayLen: 780, tilt: 0.2, R: 5200, g: 11.2, breathable: false, o2: 1.4, speed: 0.95, grip: 10,
    atmo: { kind: 'Dusty carbon dioxide (Mars-like: butterscotch days, blue sunsets)', comp: 'CO₂ 95% · N₂ 2.8% · Ar 2% · fine iron dust', color: '#c99862', sunset: '#6e4a33', glow: '#86b4ee', haze: '#e6c49a', fog: [450, 9000], clouds: 0.25, cloudColor: '#efd3b5', wind: 0.0008 }, seaBias: 0.3, land: 45, mount: 650, desc: 'Rust-red dunes and towering iron cliffs.',
    col: { liquid: [12, 70, 28], plains: [20, 45, 40], rocky: [10, 28, 30], crystal: [40, 65, 52], beach: [28, 45, 52] },
    moons: [{ name: 'Kor', R: 1200, ice: false }, { name: 'Vesk', R: 2000, ice: true }] },
  { name: 'Glacia', seed: 3301, temp: { base: -42, swing: 14 }, cost: 100, dayLen: 480, tilt: 0.45, R: 5600, g: 8.4, breathable: true, o2: 1.7, speed: 1.1, grip: 2.2,
    atmo: { kind: 'Nitrogen–methane (methane turns the sky teal)', comp: 'N₂ 72% · O₂ 20% · CH₄ 6% · Ar 2%', color: '#4fbab6', sunset: '#e0c46a', glow: '#f4f2b8', haze: '#c4eeea', fog: [700, 12000], clouds: 0.7, cloudColor: '#f2fbfa', wind: 0.0004 }, seaBias: -0.1, land: 40, mount: 420, desc: 'Frozen ocean world. The ice is slippery!',
    col: { liquid: [198, 60, 38], plains: [200, 28, 80], rocky: [212, 14, 55], crystal: [180, 60, 70], beach: [200, 20, 86], snow: [200, 30, 96] },
    moons: [] },
  { name: 'Umbros', seed: 4409, temp: { base: -75, swing: 5 }, cost: 200, dayLen: 900, tilt: 0.1, R: 7000, g: 9.4, breathable: false, o2: 2.0, speed: 1.0, grip: 10, dark: true,
    atmo: null, seaBias: 0.25, land: 45, mount: 700, desc: 'Eternal night. Your lamp only reaches so far.',
    col: { liquid: [280, 50, 20], plains: [268, 25, 30], rocky: [250, 12, 24], crystal: [300, 70, 52], beach: [270, 15, 36] },
    moons: [{ name: 'Nyx', R: 1100, ice: true }, { name: 'Erebus', R: 1600, ice: false },
            { name: 'Mora', R: 1400, ice: true }, { name: 'Thane', R: 2300, ice: false }] },
  { name: 'Xeno Prime', seed: 5503, temp: { base: 52, swing: 16 }, cost: 350, dayLen: 720, tilt: 0.3, R: 8000, g: 14.6, breathable: false, o2: 2.4, speed: 0.9, grip: 8,
    atmo: { kind: 'Sulfur haze (thick, yellow-orange)', comp: 'N₂ 60% · CO₂ 24% · SO₂ 11% · H₂S 5%', color: '#d4a752', sunset: '#ff6420', glow: '#ffd27a', haze: '#f0d79c', fog: [220, 5200], clouds: 0.5, cloudColor: '#f3e2b0', wind: 0.0006 }, seaBias: 0.05, land: 50, mount: 800, desc: 'Heavy, toxic jungle world. Rich in ancient life.',
    col: { liquid: [80, 80, 32], plains: [62, 40, 34], rocky: [40, 20, 30], crystal: [150, 70, 52], beach: [55, 35, 45] },
    moons: [{ name: 'Ixa', R: 2100, ice: true }, { name: 'Quell', R: 1300, ice: false }, { name: 'Zor', R: 1500, ice: false }] },
];

const BODIES = [];
PLANETS.forEach((P, i) => {
  Object.assign(P, { id: 'p' + i, type: 'planet', idx: i, speciesKey: String(i), hRocky: P.mount * 0.3, hCrystal: P.mount * 0.62 });
  BODIES.push(P);
  P.moons.forEach((M, k) => {
    const seed = P.seed * 31 + k * 977 + 3, rnd = mulberry32(seed);
    const hue = Math.floor(rnd() * 360);
    Object.assign(M, {
      // based on Earth's Moon (1.62 m/s² at ~1.7 km here): smaller moons a bit lower, bigger a bit higher,
      // but never so low that a normal jump goes much above 4 m
      g: Math.round(Math.max(1.45, 1.62 * Math.sqrt(M.R / 1700)) * 100) / 100,
      id: P.id + 'm' + k, type: 'moon', parent: P, idx: i, k, seed, speciesKey: P.id + 'm' + k,
      breathable: false, o2: P.o2 * 1.1 + 0.2, speed: 1, grip: M.ice ? 5 : 10, atmo: null,
      // airless moons swing hard between day and night; icy ones stay frozen
      temp: M.ice ? { base: -60, swing: 28 } : k === 0 && i === 0 ? { base: -5, swing: 40 } : { base: -25, swing: 62 },
      land: 40 + M.R / 40, mount: 0, cost: 0, dayLen: 1100 + k * 260, tilt: 0.05 + k * 0.08,
      desc: `${M.ice ? 'Icy' : 'Dusty'} moon of ${P.name}. Low gravity.`,
      col: { dust: [hue, 3 + rnd() * 6 | 0, 56 + rnd() * 10 | 0], mare: [hue, 4, 33 + rnd() * 6 | 0], rock: [hue, 3, 42 + rnd() * 6 | 0], ice: [200, 30, 88] },
    });
    BODIES.push(M);
  });
});
const bodyById = id => BODIES.find(b => b.id === id) || BODIES[0];
const bodyCats = b => b.type === 'planet' ? PLANET_CATS : (b.ice ? ['rock', 'dust', 'ice'] : ['rock', 'dust']);
const planetOf = b => b.type === 'planet' ? b : b.parent;
// what can grow on a world, from its air and water:
//   earth      Earth-like air and liquid water: Earth plants (Verdara)
//   earthCold  breathable but frozen: hardy Earth plants only (Glacia)
//   alienDry   CO2 air, briny water: lichen crusts and sparse alien growths (Ruska)
//   alienWet   thick sulfur haze: alien plants only (Xeno Prime)
//   none       no air (Umbros, every moon): nothing grows
const FLORA_PROFILE = { Verdara: 'earth', Glacia: 'earthCold', Ruska: 'alienDry', 'Xeno Prime': 'alienWet' };
const floraProfile = b => b.type === 'planet' && b.atmo ? (FLORA_PROFILE[b.name] || 'alienWet') : 'none';
const hasPlants = b => floraProfile(b) !== 'none';
function isUnlocked(b) { return save.unlocked.includes(planetOf(b).idx); }

// ---------- procedural species ----------
const SYL = ['ka', 'lo', 've', 'ri', 'zu', 'tha', 'mor', 'xi', 'el', 'qua', 'ny', 'sor', 'bel', 'dra', 'phi', 'on', 'ix', 'ur', 'sa', 'tem', 'gal', 'vor'];
const SUFFIX = {
  plant: ['ia', 'ora', 'fern', 'bloom', 'ella', 'wort', 'cap'],
  rock: ['ite', 'stone', 'olith', 'basalt', 'schist'],
  mineral: ['ite', 'ium', 'ine', 'yx', 'al'],
  fossil: ['odon', 'saurus', 'pod', 'oid', 'ites', 'aspis'],
  dust: [' dust', ' regolith', ' powder'],
  ice: [' ice', ' frost', 'ice'],
};
function makeName(rnd, cat) {
  let s = '';
  const n = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) s += pick(rnd, SYL);
  s += pick(rnd, SUFFIX[cat]);
  return s[0].toUpperCase() + s.slice(1);
}

const speciesCache = {};
// planets keep the exact same random sequence as v0.1/v0.2 so codex names and ids carry over
function genSpecies(body) {
  if (speciesCache[body.id]) return speciesCache[body.id];
  const rnd = mulberry32(body.seed * 7 + 1);
  const mult = body.type === 'planet' ? 1 + body.idx * 0.5 : 1.3 + body.idx * 0.5;
  const out = {};
  for (const cat of bodyCats(body)) {
    out[cat] = [];
    for (let i = 0; i < CATS[cat].n; i++) {
      const hue = Math.floor(rnd() * 360);
      let color;
      if (cat === 'plant') color = `hsl(${hue},${65 + rnd() * 20 | 0}%,${50 + rnd() * 15 | 0}%)`;
      else if (cat === 'rock') color = `hsl(${hue},${8 + rnd() * 18 | 0}%,${38 + rnd() * 22 | 0}%)`;
      else if (cat === 'mineral') color = `hsl(${hue},85%,${58 + rnd() * 12 | 0}%)`;
      else if (cat === 'fossil') color = `hsl(${35 + rnd() * 15 | 0},25%,${75 + rnd() * 10 | 0}%)`;
      else if (cat === 'dust') color = `hsl(${hue},${15 + rnd() * 20 | 0}%,${55 + rnd() * 15 | 0}%)`;
      else color = `hsl(${180 + hue % 40},${50 + rnd() * 30 | 0}%,${76 + rnd() * 10 | 0}%)`;
      for (let k = 0; k < 10; k++) rnd();
      out[cat].push({
        id: `${body.speciesKey}-${cat}-${i}`, cat, idx: i, name: makeName(rnd, cat), color,
        value: Math.round(CATS[cat].base * (1 + i * 0.6) * mult),
        weight: 1 / Math.pow(i + 1, 1.4),
        size: 9 + rnd() * 6,
        age: (rnd(), rnd(), rnd(), Math.floor(40 + rnd() * 900)),
      });
    }
  }
  return (speciesCache[body.id] = out);
}
function pickSpecies(r, list) {
  let tot = 0;
  for (const s of list) tot += s.weight;
  r *= tot;
  for (const s of list) { r -= s.weight; if (r <= 0) return s; }
  return list[list.length - 1];
}

// ---------- save + options ----------
// what the lander carries at the start: enough for a first drill or two, a smelter and a solar panel
const STARTER_KIT = { iron_plate: 40, copper_wire: 16, wafer: 8 };
const SAVE_KEY = 'planetExplorer.save.v1', OPT_KEY = 'planetExplorer.options.v1';
function defaultSave() {
  return { ver: 5, rp: 0, unlocked: [0], current: 'p0', codex: {}, collected: {}, atmo: {}, upgrades: {}, inv: {}, lander: { items: Object.assign({}, STARTER_KIT) }, kit: true, bases: {}, tech: ['base'] };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.unlocked) {
      if (!s.ver || s.ver < 3) { // v0.1/v0.2 save: keep RP, unlocks and codex; the round worlds are new
        s.current = 'p' + (typeof s.current === 'number' ? s.current : 0);
        s.collected = {};
        s.ver = 3;
      }
      if (s.ver < 4) { // v0.4 worlds are far bigger: sample and drill positions changed
        s.collected = {};
        s.drills = {};
        s.ver = 4;
      }
      delete s.terra; // terraforming was removed in v0.4
      if (s.ver < 5) { // v0.5: old mined resources move into the lander's hold under their new names
        const map = { iron: 'iron_ore', copper: 'copper_ore', silicon: 'silicon', water: 'ice' }, items = {};
        for (const k in s.res || {}) if (map[k]) items[map[k]] = (items[map[k]] || 0) + s.res[k];
        s.lander = { items };
        s.inv = {};
        s.drills = {};
        delete s.res;
        s.ver = 5;
      }
      if (!s.tech) s.tech = ['base'];
      if (!s.kit) { // starter kit so the first machines can be built
        s.lander = s.lander || { items: {} };
        for (const id in STARTER_KIT) s.lander.items[id] = (s.lander.items[id] || 0) + STARTER_KIT[id];
        s.kit = true;
      }
      return Object.assign(defaultSave(), s);
    }
  } catch (e) {}
  return defaultSave();
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
let save = loadSave();

const DEFAULT_OPTS = { sens: 1, invert: false, dist: 9, fov: 70, labels: 'near', minimap: true, fps: false, quality: 'medium', shadows: true, debug: false, infO2: true, god: true, fast: true, timeScale: 1 };
let opts = Object.assign({}, DEFAULT_OPTS);
try { Object.assign(opts, JSON.parse(localStorage.getItem(OPT_KEY)) || {}); } catch (e) {}
function writeOpts() { try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch (e) {} }
const LABEL_DIST = { near: 28, far: 75, always: Infinity, off: 0 };

const known = sp => !!save.codex[sp.id];
const spName = sp => known(sp) ? sp.name : 'Unknown ' + CATS[sp.cat].one;
