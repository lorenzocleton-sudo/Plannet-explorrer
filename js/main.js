'use strict';
// ---------- main loop ----------
let last = performance.now();
let frameErrShown = false;
function frame(now) {
  requestAnimationFrame(frame); // schedule first: one bad frame must never stop the game
  try { step(now); }
  catch (err) {
    console.error(err);
    if (!frameErrShown) { frameErrShown = true; toast(`Something went wrong: ${err.message}. The game keeps running; please report this message.`, 'bad', 12000); }
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
resize();
land(save.current, true);
arrival = null;
requestAnimationFrame(frame);
