'use strict';
// ---------- renderer, camera, HUD canvas ----------
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 250000);
const hud = $('hud'), hx = hud.getContext('2d');
let VW = 0, VH = 0, DPR = 1;

function applyGraphics() {
  const q = { low: 0.6, medium: 1, high: 2 }[opts.quality] || 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q));
  renderer.setSize(VW, VH);
  if (renderer.shadowMap.enabled !== opts.shadows) {
    renderer.shadowMap.enabled = opts.shadows;
    if (world) world.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  camera.fov = opts.fov;
  camera.updateProjectionMatrix();
}
function resize() {
  VW = innerWidth; VH = innerHeight; DPR = Math.min(2, window.devicePixelRatio || 1);
  hud.width = VW * DPR; hud.height = VH * DPR;
  hud.style.width = VW + 'px'; hud.style.height = VH + 'px';
  camera.aspect = VW / VH;
  applyGraphics();
}
addEventListener('resize', resize);
