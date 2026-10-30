'use strict';
// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps += ((1 / Math.max(dt, 0.001)) - fps) * 0.05;
  if (world) {
    if (!menu) update(dt);
    syncScene();
    renderer.render(world.scene, camera);
  }
  drawHUD(dt);
  requestAnimationFrame(frame);
}
resize();
land(save.current);
arrival = null;
requestAnimationFrame(frame);
