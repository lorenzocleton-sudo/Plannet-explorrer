'use strict';
// ---------- main loop ----------
let last = performance.now();
function frame(now) {
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
  requestAnimationFrame(frame);
}
resize();
land(save.current, true);
arrival = null;
requestAnimationFrame(frame);
