'use strict';
// ---------- renderer, camera, HUD canvas ----------
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 250000);
const hud = $('hud'), hx = hud.getContext('2d');
let VW = 0, VH = 0, DPR = 1;

// Detail levels (Options → Graphics → Detail). Low is meant for older tablets.
// px: max pixel ratio · leaf: metres between terrain vertices up close · split: how far out detail
// reaches · budget: ms per frame for building terrain · shadow: shadow map size · texSize / texFar:
// ground texture size and reach · normalMaps: ground relief · grass: grass density · grassR / treeR:
// how far grass / plants, trees and rocks are drawn · loD: switch to simple models · treeShadows ·
// fogK: how far you see through the haze · rays: light shafts from a low sun
const DETAIL = {
  low:    { px: 0.75, leaf: 2.6, split: 0.85, budget: 4, shadow: 1024, texSize: 256, texFar: 100, normalMaps: false, grass: 0.4, grassR: 18, treeR: 125, loD: 40, treeShadows: false, fogK: 0.65, rays: 0 },
  medium: { px: 1,    leaf: 1.4, split: 1.15, budget: 6, shadow: 2048, texSize: 512, texFar: 200, normalMaps: true, grass: 0.75, grassR: 34, treeR: 220, loD: 70, treeShadows: true, fogK: 0.9, rays: 1 },
  high:   { px: 1.5,  leaf: 0.9, split: 1.6, budget: 8, shadow: 2048, texSize: 512, texFar: 320, normalMaps: true, grass: 1, grassR: 48, treeR: 320, loD: 110, treeShadows: true, fogK: 1, rays: 1 },
};
const detail = () => DETAIL[opts.quality] || DETAIL.medium;
function applyGraphics() {
  const D = detail();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, D.px));
  if (world && world.terrain && world.terrain.detailKey !== opts.quality) { resetTerrain(world); SCN.tiles.clear(); SCN.dirty = true; }
  if (typeof sceneryFade === 'function') sceneryFade();
  if (typeof applyGroundDetail === 'function') applyGroundDetail();
  if (world && world.sun && world.sun.shadow.mapSize.x !== D.shadow) {
    world.sun.shadow.mapSize.set(D.shadow, D.shadow);
    if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  }
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
