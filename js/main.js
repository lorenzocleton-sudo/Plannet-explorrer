'use strict';
// ---------- main loop ----------
let last = performance.now();
let frameErrShown = false, badFrames = 0;
function frame(now) {
  requestAnimationFrame(frame); // schedule first: one bad frame must never stop the game
  try { step(now); badFrames = 0; }
  catch (err) {
    console.error(err);
    if (!frameErrShown) { frameErrShown = true; toast(`Something went wrong: ${err.message}. The game keeps running; please report this message.`, 'bad', 12000); }
    // failing every frame means the screen is stuck: say so where it stays visible
    if (++badFrames === 60 && !document.getElementById('fatal')) showFatal(err);
  }
}
function step(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps += ((1 / Math.max(dt, 0.001)) - fps) * 0.05;
  if (cutscene) {
    updateCutscene(dt);
    if (cutscene) { renderer.render(cutsceneScene(), camera); drawCutsceneOverlay(); }
  } else if (world) {
    if (!menu) update(dt);
    // machines keep running while you look at them (or the build menu)
    if (!menu || menu === 'machine' || menu === 'build') factoryTick(dt);
    panelTick(dt);
    syncScene();
    renderer.render(world.scene, camera);
  }
  if (!cutscene) drawHUD(dt);
  if (menu === 'map') drawStarMap(dt);
}
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  toast('The graphics stopped responding (out of memory?). Trying to recover…', 'bad', 8000);
});
renderer.domElement.addEventListener('webglcontextrestored', () => { applyGraphics(); toast('Graphics recovered.'); });
// a startup error must never leave a silent black screen
function showFatal(err, starting = false) {
  console.error(err);
  const d = document.createElement('div');
  d.id = 'fatal';
  d.innerHTML = `<b>${starting ? 'The game could not start.' : 'The game hit an error and is stuck.'}</b><br>${String(err && err.message || err).replace(/</g, '&lt;')}<br><br>`
    + `Your progress is saved. Tap Reload; if it keeps happening, please report this message.<br><br>`;
  const b = document.createElement('button');
  b.textContent = 'Reload';
  b.onclick = () => location.replace(location.pathname + '?r=' + Date.now());
  d.appendChild(b);
  document.body.appendChild(d);
}
resize();
requestAnimationFrame(frame); // start the loop first so menus and HUD work even if landing fails
try { land(save.current, true); arrival = null; }
catch (err) { showFatal(err, true); }
