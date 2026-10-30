'use strict';
// ---------- debug / admin mode (Options → Admin) ----------
function applyDebug() {
  if (!debugOn()) flying = false;
  document.body.classList.toggle('debug', debugOn());
  $('debugTools').style.display = debugOn() ? '' : 'none';
  $('pDebug').style.display = debugOn() ? '' : 'none';
  $('tFly').classList.toggle('on', flying);
}
function toggleFly() {
  if (!debugOn()) return;
  flying = !flying;
  if (!flying) { player.fallTop = player.pos.length(); player.vel.set(0, 0, 0); }
  toast(flying ? 'Fly mode on (Space up, X down, Shift fast)' : 'Fly mode off');
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

$('oDebug').addEventListener('input', () => { opts.debug = $('oDebug').checked; writeOpts(); applyDebug(); });
$('oFly').onclick = toggleFly;
$('oTeleport').onclick = () => { teleportToLander(); };
$('oUnlock').onclick = unlockAll;
$('pFly').onclick = () => { toggleFly(); resume(); };
$('pTeleport').onclick = () => { teleportToLander(); resume(); };
$('pUnlock').onclick = () => { unlockAll(); renderPause(); };
$('tFly').addEventListener('click', toggleFly);
$('tTp').addEventListener('click', teleportToLander);
for (const [id, set] of [['tUp', v => { touchUp = v; }], ['tDown', v => { touchDown = v; }]]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { set(true); e.preventDefault(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => set(false)));
}
addEventListener('keydown', e => {
  if (menu || cutscene || e.repeat || !debugOn()) return;
  const k = e.key.toLowerCase();
  if (k === 'f') toggleFly();
  if (k === 't') teleportToLander();
});
applyDebug();
