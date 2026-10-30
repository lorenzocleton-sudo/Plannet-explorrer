'use strict';
// ---------- debug / admin mode (Options → debug mode, then Pause → Admin) ----------
function applyDebug() {
  if (!debugOn()) flying = false;
  document.body.classList.toggle('debug', debugOn());
  // while flying on touch, JUMP lifts you and INTERACT lowers you
  $('tJump').textContent = flying ? 'UP' : 'JUMP';
  $('tInteract').textContent = flying ? 'DOWN' : 'INTERACT';
  if (!flying) touchUp = touchDown = false;
}
function toggleFly() {
  if (!debugOn()) return;
  flying = !flying;
  if (!flying) { player.fallTop = player.pos.length(); player.vel.set(0, 0, 0); }
  toast(flying ? (isTouch ? 'Fly mode on (JUMP up, INTERACT down)' : 'Fly mode on (Space up, X down, Shift fast, V to stop)') : 'Fly mode off');
  applyDebug();
}
function teleportToLander() {
  if (!debugOn() || !world) return;
  resetPlayer();
  toast('Teleported to the lander.');
}
function unlockAll() {
  if (!debugOn()) return;
  save.unlocked = PLANETS.map(P => P.idx);
  writeSave();
  toast('All planets and moons unlocked.', 'new');
}

function renderAdmin() {
  $('aFly').checked = flying;
  $('aO2').checked = !!opts.infO2;
  $('aGod').checked = !!opts.god;
  $('aFast').checked = !!opts.fast;
}
$('pAdmin').onclick = () => { if (debugOn()) showMenu('admin', 'pause'); };
$('aFly').addEventListener('input', () => { if (flying !== $('aFly').checked) toggleFly(); });
for (const [id, key] of [['aO2', 'infO2'], ['aGod', 'god'], ['aFast', 'fast']])
  $(id).addEventListener('input', () => { opts[key] = $(id).checked; writeOpts(); });
$('aTeleport').onclick = () => { teleportToLander(); resume(); };
$('aUnlock').onclick = unlockAll;
$('aBack').onclick = () => showMenu('pause');
$('oDebug').addEventListener('input', () => { opts.debug = $('oDebug').checked; writeOpts(); applyDebug(); });
for (const [id, set] of [['tJump', v => { touchUp = v && flying; }], ['tInteract', v => { touchDown = v && flying; }]]) {
  const b = $(id);
  b.addEventListener('pointerdown', () => set(true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => set(false)));
}
addEventListener('keydown', e => {
  if (menu || cutscene || e.repeat || !debugOn()) return;
  const k = e.key.toLowerCase();
  if (k === 'v') toggleFly();
  if (k === 't') teleportToLander();
});
applyDebug();
