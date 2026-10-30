'use strict';
// ---------- terrain worker ----------
// Builds terrain chunk data (computeChunk in terrain.js) off the main thread. It loads the same
// shape code as the game, so chunks come out exactly as if built in-frame.
const V = self.location.search;
importScripts('../lib/three.min.js' + V, 'util.js' + V, 'data.js' + V, 'biomes.js' + V, 'world.js' + V, 'ground.js' + V, 'terrain.js' + V);
let body = null;
self.onmessage = ev => {
  const m = ev.data;
  if (m.type === 'body') { body = bodyById(m.id); world = { body, R: body.R }; return; }
  if (m.type === 'chunk' && body) {
    const data = computeChunk(body, ...m.args);
    self.postMessage({ id: m.id, gen: m.gen, data }, chunkBuffers(data));
  }
};
