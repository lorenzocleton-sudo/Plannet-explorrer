'use strict';
// ---------- game data: bodies, species, save, options ----------
const VERSION = '0.3';

const CATS = {
  plant:   { label: 'Plants',       one: 'Plant',   n: 4, base: 1,  tag: '#9ef08a' },
  rock:    { label: 'Rocks',        one: 'Rock',    n: 3, base: 1,  tag: '#d6dae4' },
  mineral: { label: 'Minerals',     one: 'Mineral', n: 4, base: 3,  tag: '#d2b4ff' },
  fossil:  { label: 'Ancient Life', one: 'Fossil',  n: 3, base: 10, tag: '#ffd166' },
  dust:    { label: 'Dust',         one: 'Dust',    n: 2, base: 1,  tag: '#ecd9b6' },
  ice:     { label: 'Ice',          one: 'Ice',     n: 2, base: 2,  tag: '#bff0ff' },
};
const PLANET_CATS = ['plant', 'rock', 'mineral', 'fossil'];

// R = radius (m), g = gravity (m/s²). Biome colors are [hue, sat, light].
// "breathable" is hidden from the player until they land there.
const PLANETS = [
  { name: 'Verdara', seed: 1101, cost: 0, R: 170, g: 9.8, breathable: true, o2: 1.0, speed: 1.0, grip: 10,
    sky: '#8fc7ff', seaBias: 5, land: 26, mount: 75, desc: 'Mild, lush starter world.',
    col: { liquid: [200, 55, 34], plains: [105, 38, 36], rocky: [32, 18, 38], crystal: [265, 30, 52] },
    moons: [{ name: 'Pell', R: 60, g: 1.6, ice: false }] },
  { name: 'Ruska', seed: 2207, cost: 40, R: 150, g: 11.5, breathable: false, o2: 1.4, speed: 0.95, grip: 10,
    sky: '#e2a27c', seaBias: 2, land: 24, mount: 85, desc: 'Rust-red dunes and towering iron cliffs.',
    col: { liquid: [12, 70, 28], plains: [20, 45, 40], rocky: [10, 28, 30], crystal: [40, 65, 52] },
    moons: [{ name: 'Kor', R: 48, g: 1.2, ice: false }, { name: 'Vesk', R: 70, g: 2.1, ice: true }] },
  { name: 'Glacia', seed: 3301, cost: 100, R: 160, g: 7.5, breathable: true, o2: 1.7, speed: 1.1, grip: 2.2,
    sky: '#cfe6ff', seaBias: -7, land: 24, mount: 60, desc: 'Frozen ocean world. The ice is slippery!',
    col: { liquid: [198, 60, 38], plains: [200, 28, 80], rocky: [212, 14, 55], crystal: [180, 60, 70] },
    moons: [] },
  { name: 'Umbros', seed: 4409, cost: 200, R: 180, g: 9.0, breathable: false, o2: 2.0, speed: 1.0, grip: 10, dark: true,
    sky: '#04030a', seaBias: 6, land: 26, mount: 95, desc: 'Eternal night. Your lamp only reaches so far.',
    col: { liquid: [280, 50, 20], plains: [268, 25, 30], rocky: [250, 12, 24], crystal: [300, 70, 52] },
    moons: [{ name: 'Nyx', R: 45, g: 0.9, ice: true }, { name: 'Erebus', R: 65, g: 1.8, ice: false },
            { name: 'Mora', R: 55, g: 1.4, ice: true }, { name: 'Thane', R: 80, g: 2.6, ice: false }] },
  { name: 'Xeno Prime', seed: 5503, cost: 350, R: 190, g: 13, breathable: false, o2: 2.4, speed: 0.9, grip: 8,
    sky: '#b9c66e', seaBias: 0, land: 28, mount: 105, desc: 'Heavy, toxic jungle world. Rich in ancient life.',
    col: { liquid: [80, 80, 32], plains: [62, 40, 34], rocky: [40, 20, 30], crystal: [150, 70, 52] },
    moons: [{ name: 'Ixa', R: 70, g: 2.2, ice: true }, { name: 'Quell', R: 50, g: 1.3, ice: false }, { name: 'Zor', R: 60, g: 1.7, ice: false }] },
];

const BODIES = [];
PLANETS.forEach((P, i) => {
  Object.assign(P, { id: 'p' + i, type: 'planet', idx: i, speciesKey: String(i), hRocky: 14, hCrystal: 38 });
  BODIES.push(P);
  P.moons.forEach((M, k) => {
    const seed = P.seed * 31 + k * 977 + 3, rnd = mulberry32(seed);
    const hue = Math.floor(rnd() * 360);
    Object.assign(M, {
      id: P.id + 'm' + k, type: 'moon', parent: P, idx: i, k, seed, speciesKey: P.id + 'm' + k,
      breathable: false, o2: P.o2 * 1.1 + 0.2, speed: 1, grip: M.ice ? 5 : 10, sky: '#000000',
      land: 9, mount: 24, cost: 0,
      desc: `${M.ice ? 'Icy' : 'Dusty'} moon of ${P.name}. Low gravity.`,
      col: { dust: [hue, 8 + rnd() * 14 | 0, 50 + rnd() * 14 | 0], rock: [(hue + 25) % 360, 6 + rnd() * 10 | 0, 30 + rnd() * 10 | 0], ice: [195, 45, 84] },
    });
    BODIES.push(M);
  });
});
const bodyById = id => BODIES.find(b => b.id === id) || BODIES[0];
const bodyCats = b => b.type === 'planet' ? PLANET_CATS : (b.ice ? ['rock', 'dust', 'ice'] : ['rock', 'dust']);
const planetOf = b => b.type === 'planet' ? b : b.parent;
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
const SAVE_KEY = 'planetExplorer.save.v1', OPT_KEY = 'planetExplorer.options.v1';
function defaultSave() {
  return { ver: 3, rp: 0, unlocked: [0], current: 'p0', codex: {}, collected: {}, atmo: {}, terra: {}, drills: {}, res: {} };
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
      return Object.assign(defaultSave(), s);
    }
  } catch (e) {}
  return defaultSave();
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
let save = loadSave();

const DEFAULT_OPTS = { sens: 1, invert: false, dist: 9, fov: 70, labels: 'near', minimap: true, fps: false, quality: 'medium', shadows: true };
let opts = Object.assign({}, DEFAULT_OPTS);
try { Object.assign(opts, JSON.parse(localStorage.getItem(OPT_KEY)) || {}); } catch (e) {}
function writeOpts() { try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch (e) {} }
const LABEL_DIST = { near: 28, far: 75, always: Infinity, off: 0 };

const known = sp => !!save.codex[sp.id];
const spName = sp => known(sp) ? sp.name : 'Unknown ' + CATS[sp.cat].one;
