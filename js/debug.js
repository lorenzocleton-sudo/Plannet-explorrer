'use strict';
// ---------- debug / admin mode (Options → debug mode, then Pause → Admin) ----------
function applyDebug() {
  if (!debugOn()) flying = false;
  document.body.classList.toggle('debug', debugOn());
  document.body.classList.toggle('flying', flying);
  syncAdminBar();
  // while flying on touch, JUMP lifts you and INTERACT lowers you
  $('tJump').textContent = flying ? 'UP' : 'JUMP';
  $('tInteract').textContent = flying ? 'DOWN' : 'INTERACT';
  if (!flying) touchUp = touchDown = false;
}
function toggleFly() {
  if (!debugOn()) return;
  flying = !flying;
  if (!flying) { player.fallTop = player.pos.length(); player.vel.set(0, 0, 0); }
  toast(flying ? (PAD.active ? 'Fly mode on (A up, B down, L3 fast)' : isTouch ? 'Fly mode on (JUMP up, INTERACT down)' : 'Fly mode on (Space up, X down, Shift fast, V to stop)') : 'Fly mode off');
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

// on-screen admin shortcuts (only shown while admin mode is on)
const TIME_STEPS = [1, 5, 20, 50, 100];
function syncAdminBar() {
  $('abFly').classList.toggle('on', flying);
  $('abO2').classList.toggle('on', !!opts.infO2);
  $('abGod').classList.toggle('on', !!opts.god);
  const ts = clamp(opts.timeScale || 1, 1, 100);
  $('abTime').textContent = ts + '×';
  $('abTime').classList.toggle('on', ts > 1);
  $('aTime').value = ts; $('vTime').textContent = ts + '×';
}
$('abFly').onclick = () => toggleFly();
$('abTp').onclick = () => teleportToLander();
$('abO2').onclick = () => { opts.infO2 = !opts.infO2; writeOpts(); syncAdminBar(); };
$('abGod').onclick = () => { opts.god = !opts.god; writeOpts(); syncAdminBar(); };
$('abTime').onclick = () => { const ts = opts.timeScale || 1; opts.timeScale = TIME_STEPS.find(s => s > ts) || 1; writeOpts(); syncAdminBar(); toast(`Time speed ${opts.timeScale}×`); };
$('aTime').addEventListener('input', () => { opts.timeScale = +$('aTime').value; writeOpts(); syncAdminBar(); });
for (const [id, set] of [['abUp', v => { touchUp = v; }], ['abDown', v => { touchDown = v; }]]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { set(true); e.preventDefault(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => set(false)));
}
function renderAdmin() {
  $('aFly').checked = flying;
  $('aO2').checked = !!opts.infO2;
  $('aGod').checked = !!opts.god;
  $('aFast').checked = !!opts.fast;
  syncAdminBar();
}
$('pAdmin').onclick = () => { if (debugOn()) showMenu('admin', 'pause'); };
$('aFly').addEventListener('input', () => { if (flying !== $('aFly').checked) toggleFly(); });
for (const [id, key] of [['aO2', 'infO2'], ['aGod', 'god'], ['aFast', 'fast']])
  $(id).addEventListener('input', () => { opts[key] = $(id).checked; writeOpts(); syncAdminBar(); });
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
