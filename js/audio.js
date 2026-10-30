'use strict';
// ---------- sound and music ----------
// Everything is generated with the Web Audio API (no audio files): footsteps that depend on the
// ground, wind (none on airless worlds, where you hear muffled steps and your suit instead), waves
// near the sea, drills and machines, lander thrusters, UI clicks and calm ambient music per world.
const SND = { ctx: null, master: null, music: null, sfx: null, noise: null, wind: null, sea: null, suit: null, hum: null, verb: null, musicT: 0, lastStep: 0, mood: null, ready: false };

function initAudio() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const c = SND.ctx = new AC();
  SND.master = c.createGain(); SND.master.connect(c.destination);
  SND.music = c.createGain(); SND.sfx = c.createGain();
  SND.music.connect(SND.master); SND.sfx.connect(SND.master);
  // two seconds of white noise, reused by every noisy sound
  const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  SND.noise = nb;
  // a soft generated reverb for the music
  const len = c.sampleRate * 3.5, ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  SND.verb = c.createConvolver(); SND.verb.buffer = ir;
  const wet = c.createGain(); wet.gain.value = 0.6; SND.verb.connect(wet); wet.connect(SND.music);
  // looping beds: wind, sea, suit breathing, machine hum (their volume follows the world each frame)
  SND.wind = noiseBed('bandpass', 500, 0.6);
  SND.sea = noiseBed('lowpass', 420, 0.7);
  SND.suit = noiseBed('bandpass', 900, 3);
  SND.hum = (() => { const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = 55; f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(SND.sfx); o.start(); return { o, f, g }; })();
  SND.drill = (() => { const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'square'; o.frequency.value = 38; f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.5; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(SND.sfx); o.start(); return { o, f, g }; })();
  applyVolumes();
  SND.ready = true;
}
function noiseBed(type, freq, q) {
  const c = SND.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = SND.noise; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(SND.sfx); s.start();
  return { s, f, g };
}
function applyVolumes() {
  if (!SND.ctx) return;
  const t = SND.ctx.currentTime;
  SND.master.gain.setTargetAtTime((opts.volMaster ?? 80) / 100, t, 0.05);
  SND.music.gain.setTargetAtTime(((opts.volMusic ?? 50) / 100) * 0.5, t, 0.05);
  SND.sfx.gain.setTargetAtTime((opts.volSfx ?? 80) / 100, t, 0.05);
}
const ramp = (p, v, tc = 0.3) => p.setTargetAtTime(v, SND.ctx.currentTime, tc);

// a short burst of filtered noise (footsteps, clicks, splashes)
function noiseHit(freq, q, dur, vol, type = 'bandpass', dest = SND.sfx, delay = 0) {
  const c = SND.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = SND.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function tone(freq, dur, vol, type = 'sine', dest = SND.sfx, delay = 0, attack = 0.005) {
  const c = SND.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  return o;
}

// ---- footsteps ----
// what you're walking on, from the same layer weights the ground textures use
function groundKind() {
  if (player.inLiquid) return 'water';
  if (world.landerPos.distanceTo(player.pos) < LANDER_R) return 'metal';
  const B = world.body, d = player.up, h = groundH(d);
  if (world.hasSea && h < 0.3) return 'water';
  let w;
  if (B.type === 'planet') { planetGroundColor(B, d, h, 1); w = planetLayers(B, h, 1, _gf); }
  else w = moonLayers(B, d, biomeOf(B, h, d), h, 1);
  let best = 0;
  for (let i = 1; i < NL; i++) if (w[i] > w[best]) best = i;
  return ['grass', 'dirt', 'sand', 'rock', 'rock', 'snow', 'sand', 'snow', 'grass'][best];
}
function footstep() {
  const airless = !world.body.atmo, k = groundKind(), v = 0.32;
  if (airless) { // no air to carry the sound: only a dull thud through your boots
    noiseHit(140, 0.8, 0.12, v * 0.9, 'lowpass');
    tone(70 + Math.random() * 15, 0.1, v * 0.35, 'sine');
    return;
  }
  if (k === 'grass') { noiseHit(2600, 0.7, 0.14, v * 0.45); noiseHit(900, 0.8, 0.08, v * 0.3); }
  else if (k === 'dirt') { noiseHit(500, 0.9, 0.1, v * 0.7, 'lowpass'); }
  else if (k === 'sand') { noiseHit(3200, 0.5, 0.18, v * 0.35); noiseHit(700, 0.6, 0.1, v * 0.3, 'lowpass'); }
  else if (k === 'snow') { for (let i = 0; i < 4; i++) noiseHit(1800 + Math.random() * 1600, 2, 0.05, v * 0.35, 'bandpass', SND.sfx, i * 0.018); }
  else if (k === 'rock') { noiseHit(1800, 3, 0.05, v * 0.6); tone(220 + Math.random() * 80, 0.04, v * 0.15, 'triangle'); }
  else if (k === 'water') { noiseHit(1200, 0.6, 0.25, v * 0.6); noiseHit(400, 1, 0.2, v * 0.4, 'lowpass', SND.sfx, 0.04); }
  else if (k === 'metal') { tone(420, 0.12, v * 0.25, 'triangle'); tone(1260, 0.08, v * 0.1, 'sine'); noiseHit(2500, 4, 0.04, v * 0.3); }
}
function uiClick() {
  if (!SND.ready) return;
  tone(1200, 0.05, 0.12, 'sine'); tone(1800, 0.04, 0.06, 'sine', SND.sfx, 0.015);
}
// lander thrusters: a roar that builds and fades (takeoff / landing)
function thrusterSound(dur = 3) {
  if (!SND.ready) return;
  const c = SND.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = SND.noise; s.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.linearRampToValueAtTime(900, t + dur * 0.4); f.frequency.linearRampToValueAtTime(300, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + dur * 0.25); g.gain.linearRampToValueAtTime(0.5, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
  s.connect(f); f.connect(g); g.connect(SND.sfx); s.start(t); s.stop(t + dur + 0.1);
  tone(42, dur, 0.25, 'sawtooth');
}

// ---- music: slow generative chords, a mood per kind of world ----
const MOODS = {
  earth: { root: 57, scale: [0, 2, 4, 7, 9, 12, 14, 16], wave: 'sine', bells: 0.5, gap: 7 },        // warm major pentatonic
  dusty: { root: 50, scale: [0, 3, 5, 7, 10, 12, 15], wave: 'triangle', bells: 0.25, gap: 9 },     // sparse minor
  ice: { root: 64, scale: [0, 2, 7, 9, 11, 14, 19], wave: 'sine', bells: 0.8, gap: 8 },            // high and glassy
  toxic: { root: 53, scale: [0, 2, 4, 6, 7, 9, 11, 13], wave: 'triangle', bells: 0.4, gap: 7 },    // lydian, a little strange
  dark: { root: 45, scale: [0, 1, 5, 7, 8, 12], wave: 'sine', bells: 0.2, gap: 11 },               // low and uneasy
  moon: { root: 60, scale: [0, 5, 7, 12, 17, 19], wave: 'sine', bells: 0.7, gap: 10 },             // empty, sparse bells
};
function moodFor(b) {
  if (b.type === 'moon') return MOODS.moon;
  return MOODS[{ earth: 'earth', earthCold: 'ice', alienDry: 'dusty', alienWet: 'toxic', none: 'dark' }[floraProfile(b)]];
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function musicTick(dt) {
  SND.musicT -= dt;
  if (SND.musicT > 0) return;
  const M = SND.mood || MOODS.earth;
  SND.musicT = M.gap + Math.random() * 4;
  const c = SND.ctx, t = c.currentTime, out = c.createGain();
  out.gain.value = 0.11; out.connect(SND.verb); out.connect(SND.music);
  // a pad chord: three notes from the scale, long swell in and out
  const pick = () => M.scale[Math.floor(Math.random() * M.scale.length)];
  const notes = [M.root - 12 + pick() % 12, M.root + pick(), M.root + pick()];
  for (const n of notes) {
    for (const det of [-4, 4]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = M.wave; o.frequency.value = mtof(n); o.detune.value = det;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + M.gap * 0.45); g.gain.linearRampToValueAtTime(0, t + M.gap * 1.3);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + M.gap * 1.35);
    }
  }
  // a few soft bell notes on top
  if (Math.random() < M.bells) for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++)
    tone(mtof(M.root + 12 + pick()), 3, 0.05, 'sine', out, 1 + i * (0.6 + Math.random()), 0.01);
}

// ---- per frame: beds follow the world and what's around you ----
let seaT = 0, seaNear = 0, stepAcc = 0;
function updateAudio(dt) {
  if (!SND.ready || !world) return;
  const B = world.body, airless = !B.atmo, inMenu = !!menu;
  SND.mood = moodFor(B);
  musicTick(dt);
  // wind: gusty, stronger up high and in thick air; none in vacuum
  const alt = Math.max(0, player.pos.length() - world.R - groundH(player.up));
  const gust = 0.5 + 0.5 * Math.sin(time * 0.37) * Math.sin(time * 0.13 + 1);
  const storm = typeof weatherStrength === 'function' ? weatherStrength() : 0;
  ramp(SND.wind.g.gain, inMenu || airless ? 0 : (0.05 + 0.1 * gust + Math.min(0.15, alt / 400) + storm * 0.35) * 0.7, 0.8);
  ramp(SND.wind.f.frequency, 300 + gust * 500 + storm * 400, 1);
  // waves when the sea is close (checked twice a second)
  seaT -= dt;
  if (seaT <= 0) {
    seaT = 0.5; seaNear = 0;
    if (world.hasSea && !airless) {
      const t1 = tangentOf(player.up, _au), t2 = _au2.copy(player.up).cross(t1);
      for (let i = 0; i < 8 && !seaNear; i++) for (const r of [12, 30, 55]) {
        const a = i / 8 * Math.PI * 2;
        _au3.copy(player.pos).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).normalize();
        if (groundH(_au3) < -0.2) { seaNear = Math.max(seaNear, 1 - r / 70); break; }
      }
    }
  }
  const swell = 0.6 + 0.4 * Math.sin(time * 0.6);
  ramp(SND.sea.g.gain, inMenu ? 0 : seaNear * 0.35 * swell, 0.6);
  // suit: slow breathing you hear on airless worlds (and faintly when your air is low)
  const breath = Math.max(0, Math.sin(time * 1.4)) ** 2;
  ramp(SND.suit.g.gain, inMenu ? 0 : (airless ? 0.05 : player.o2 < 30 ? 0.04 : 0) * breath, 0.15);
  // machines and drills near you
  let hum = 0, drill = 0;
  for (const b of world.buildings || []) {
    const d = b.pos.distanceTo(player.pos);
    if (d > 30) continue;
    const k = (1 - d / 30) ** 2, on = machineWants(b) && (!b.def.power || (b.grid && b.grid.ratio > 0.2));
    if (!on) continue;
    if (b.type === 'drill') drill = Math.max(drill, k); else hum = Math.max(hum, k * 0.6);
  }
  const muffle = airless ? 0.35 : 1; // in vacuum you only feel them through the ground
  ramp(SND.hum.g.gain, inMenu ? 0 : hum * 0.06 * muffle, 0.3);
  ramp(SND.drill.g.gain, inMenu ? 0 : drill * 0.07 * muffle, 0.2);
  SND.drill.o.frequency.setTargetAtTime(36 + Math.sin(time * 9) * 4, SND.ctx.currentTime, 0.05);
  // footsteps from distance walked
  if (!inMenu && player.onGround && !flying && !(typeof rover !== 'undefined' && rover.driving)) {
    const vr = player.vel.dot(player.up), sp = Math.sqrt(Math.max(0, player.vel.lengthSq() - vr * vr));
    stepAcc += sp * dt;
    const stride = sp > WALK_SPEED * 0.55 ? 2.6 : 1.6;
    if (stepAcc > stride && sp > 0.6) { stepAcc = 0; footstep(); }
  }
}
const _au = new THREE.Vector3(), _au2 = new THREE.Vector3(), _au3 = new THREE.Vector3();

// start on the first tap or key (browsers only allow sound after a user gesture)
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, initAudio, { passive: true }));
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) uiClick(); }, true);
