'use strict';
// ---------- PBR ground textures ----------
// All ground layers live in two array textures (colour, normal map). Every terrain vertex carries
// a weight per layer (aW0..aW2), worked out from biome, height and slope. The fragment shader
// projects the textures from world position along the main axes (so round planets have no
// stretching or seams), blends the layers by weight and texture "height" for natural edges, and
// fades the texture detail out with distance. The vertex colour stays the planet's tint; the
// textures add detail, relief and roughness on top of it.
const GROUND_LAYERS = ['grass', 'dirt', 'sand', 'rock', 'gravel', 'snow', 'dust', 'ice', 'alien'];
const L_GRASS = 0, L_DIRT = 1, L_SAND = 2, L_ROCK = 3, L_GRAVEL = 4, L_SNOW = 5, L_DUST = 6, L_ICE = 7, L_ALIEN = 8, NL = 9;
const LAYER_ROUGH = [0.95, 0.97, 0.9, 0.82, 0.92, 0.6, 0.98, 0.25, 0.7];
// texture layers each biome is made of
const BIOME_LAYERS = [
  [[L_GRASS, 0.75], [L_DIRT, 0.25]],                    // grassland
  [[L_GRASS, 0.45], [L_DIRT, 0.55]],                    // forest floor
  [[L_SAND, 0.8], [L_GRAVEL, 0.2]],                     // desert
  [[L_ROCK, 0.55], [L_GRAVEL, 0.45]],                   // highlands
  [[L_SNOW, 0.5], [L_ICE, 0.15], [L_GRAVEL, 0.35]],     // tundra
  [[L_DIRT, 0.65], [L_GRASS, 0.35]],                    // swamp
  [[L_ALIEN, 0.75], [L_DIRT, 0.25]],                    // alien growth
];

const GROUND = {
  ready: false, size: 0,
  uniforms: {
    uCol: { value: null }, uNrm: { value: null }, uAvg: { value: [] }, uRough: { value: LAYER_ROUGH },
    uTexOn: { value: 0 }, uScale: { value: 1 / 3.2 }, uFar: { value: 200 }, uNrmOn: { value: 1 }, uNrmK: { value: 1 },
  },
};
for (let i = 0; i < NL; i++) GROUND.uniforms.uAvg.value.push(new THREE.Vector3(0.5, 0.5, 0.5));

// load the images into array textures (size px per layer; smaller on Low detail)
function loadGroundTextures(size) {
  if (!renderer.capabilities.isWebGL2) return Promise.resolve(false); // old devices keep plain colours
  if (GROUND.size === size && GROUND.ready) return Promise.resolve(true);
  const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d', { willReadFrequently: true });
  const col = new Uint8Array(size * size * 4 * NL), nrm = new Uint8Array(size * size * 4 * NL);
  return Promise.all(GROUND_LAYERS.map((n, i) => Promise.all([load(`assets/textures/${n}_col.jpg?v=${ASSET_V}`), load(`assets/textures/${n}_nrm.jpg?v=${ASSET_V}`)]).then(([a, b]) => {
    x.drawImage(a, 0, 0, size, size);
    const d = x.getImageData(0, 0, size, size).data;
    col.set(d, i * size * size * 4);
    // the average colour lets the shader keep only the texture's detail, not its own hue
    let r = 0, g = 0, bl = 0;
    for (let k = 0; k < d.length; k += 16) { r += d[k]; g += d[k + 1]; bl += d[k + 2]; }
    const n4 = d.length / 16;
    GROUND.uniforms.uAvg.value[i].set(r / n4 / 255, g / n4 / 255, bl / n4 / 255);
    x.drawImage(b, 0, 0, size, size);
    nrm.set(x.getImageData(0, 0, size, size).data, i * size * size * 4);
  }))).then(() => {
    const mk = data => {
      const t = new THREE.DataArrayTexture(data, size, size, NL);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      t.needsUpdate = true;
      return t;
    };
    if (GROUND.uniforms.uCol.value) { GROUND.uniforms.uCol.value.dispose(); GROUND.uniforms.uNrm.value.dispose(); }
    GROUND.uniforms.uCol.value = mk(col);
    GROUND.uniforms.uNrm.value = mk(nrm);
    GROUND.size = size; GROUND.ready = true;
    applyGroundDetail();
    return true;
  }).catch(e => { console.warn('ground textures failed to load', e); return false; });
}
function applyGroundDetail() {
  const D = detail(), U = GROUND.uniforms;
  U.uTexOn.value = GROUND.ready ? 1 : 0;
  U.uFar.value = D.texFar;
  U.uNrmOn.value = D.normalMaps ? 1 : 0;
  if (GROUND.ready && GROUND.size !== D.texSize) loadGroundTextures(D.texSize);
}

const GROUND_VERT_PARS = `
attribute vec3 aW0, aW1, aW2;
varying vec3 vW0, vW1, vW2, vGW, vGN;
`;
const GROUND_VERT = `
vW0 = aW0; vW1 = aW1; vW2 = aW2;
vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vGN = normalize(mat3(modelMatrix) * objectNormal);
`;
const GROUND_FRAG_PARS = `
precision highp sampler2DArray;
uniform sampler2DArray uCol, uNrm;
uniform vec3 uAvg[9];
uniform float uRough[9];
uniform float uTexOn, uScale, uFar, uNrmOn, uNrmK;
varying vec3 vW0, vW1, vW2, vGW, vGN;
// whiteout-blended normal for one projection axis
vec3 gTexN(vec2 uv, float layer, vec2 wn, float wz) {
  vec3 t = texture(uNrm, vec3(uv, layer)).xyz * 2.0 - 1.0;
  t.xy *= uNrmK;
  return vec3(t.xy + wn, abs(t.z) * wz);
}
`;
// replaces <map_fragment>: works out texture detail, roughness and the bumped world normal
const GROUND_FRAG_MAP = `
vec3 gN = normalize(vGN);
float gTd = 0.0, gRough = roughness;
vec3 gNrm = gN;
float gDist = length(cameraPosition - vGW);
gTd = uTexOn * smoothstep(uFar, uFar * 0.35, gDist);
if (gTd > 0.0) {
  float gw[9];
  gw[0] = vW0.x; gw[1] = vW0.y; gw[2] = vW0.z; gw[3] = vW1.x; gw[4] = vW1.y; gw[5] = vW1.z; gw[6] = vW2.x; gw[7] = vW2.y; gw[8] = vW2.z;
  vec3 bw = pow(abs(gN), vec3(8.0));
  bw /= (bw.x + bw.y + bw.z);
  vec3 p = vGW * uScale;
  vec3 acc = vec3(0.0), nacc = vec3(0.0);
  float wsum = 0.0, racc = 0.0;
  for (int i = 0; i < 9; i++) {
    float w = gw[i];
    if (w < 0.03) continue;
    float L = float(i);
    vec3 c = vec3(0.0), n = vec3(0.0);
    if (bw.x > 0.02) {
      c += texture(uCol, vec3(p.zy, L)).rgb * bw.x;
      if (uNrmOn > 0.5) n += gTexN(p.zy, L, gN.zy, gN.x).zyx * bw.x;
    }
    if (bw.y > 0.02) {
      c += texture(uCol, vec3(p.xz, L)).rgb * bw.y;
      if (uNrmOn > 0.5) n += gTexN(p.xz, L, gN.xz, gN.y).xzy * bw.y;
    }
    if (bw.z > 0.02) {
      c += texture(uCol, vec3(p.xy, L)).rgb * bw.z;
      if (uNrmOn > 0.5) n += gTexN(p.xy, L, gN.xy, gN.z) * bw.z;
    }
    // height blend: brighter (higher) bits of a layer poke through its neighbour
    float hgt = dot(c, vec3(0.333));
    float bwgt = w * (0.35 + hgt) * (0.35 + hgt);
    acc += c / max(uAvg[i], vec3(0.05)) * bwgt;
    nacc += n * bwgt;
    racc += uRough[i] * bwgt;
    wsum += bwgt;
  }
  if (wsum > 0.0) {
    vec3 det = acc / wsum;
    // keep the texture's light and shade fully, but only half of its own colour
    det = mix(vec3(dot(det, vec3(0.333))), det, 0.5);
    diffuseColor.rgb *= mix(vec3(1.0), clamp(det, 0.0, 2.2), gTd);
    gRough = mix(roughness, racc / wsum, gTd);
    if (uNrmOn > 0.5) gNrm = normalize(mix(gN, normalize(nacc), gTd));
  }
}
`;
// replaces <roughnessmap_fragment>
const GROUND_FRAG_ROUGH = `
float roughnessFactor = gRough;
`;
// after <normal_fragment_maps>: use the bumped normal (world -> view space)
const GROUND_FRAG_NORMAL = `
#include <normal_fragment_maps>
if (gTd > 0.0 && uNrmOn > 0.5) normal = normalize((viewMatrix * vec4(gNrm, 0.0)).xyz);
`;

function makeGroundMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, GROUND.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GROUND_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GROUND_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_FRAG_PARS)
      .replace('#include <map_fragment>', GROUND_FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', GROUND_FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', GROUND_FRAG_NORMAL);
  };
  m.customProgramCacheKey = () => 'ground1';
  return m;
}

// ---------- layer weights per vertex ----------
const _gl = new Float32Array(NL);
function addLayers(list, k) { for (const [l, w] of list) _gl[l] += w * k; }
// planets: uses the biome weights and climate left by planetGroundColor() for the same point
function planetLayers(body, h, slope, f) {
  _gl.fill(0);
  for (let i = 0; i < NB; i++) if (_bw[i] > 1e-3) addLayers(BIOME_LAYERS[i], _bw[i]);
  const blendTo = (l, t) => { if (t <= 0) return; for (let i = 0; i < NL; i++) _gl[i] *= 1 - t; _gl[l] += t; };
  // the grass texture only belongs where Earth plants grow; elsewhere it's bare soil or alien growth
  const prof = floraProfile(body);
  if (prof !== 'earth' && prof !== 'earthCold' && _gl[L_GRASS] > 0) {
    const g = _gl[L_GRASS];
    _gl[L_GRASS] = 0;
    if (prof === 'alienWet') _gl[L_ALIEN] += g;
    else { _gl[L_DIRT] += g * 0.5; _gl[L_SAND] += g * 0.3; _gl[L_GRAVEL] += g * 0.2; }
  }
  blendTo(L_SAND, f.beach);
  if (h < 0) blendTo(L_GRAVEL, smooth(-2, -25, h) * 0.6);
  blendTo(L_ROCK, f.rock);
  blendTo(L_SNOW, Math.max(f.snow, f.frost));
  return _gl;
}
// moons: dust plains, rock on highlands and slopes, gravel on crater rims, ice
function moonLayers(body, d, b, h, slope) {
  _gl.fill(0);
  _gl[L_DUST] = 1;
  const rock = Math.max(b === 1 ? 0.45 : 0, smooth(0.9, 0.7, slope));
  for (let i = 0; i < NL; i++) _gl[i] *= 1 - rock;
  _gl[L_ROCK] += rock * 0.65; _gl[L_GRAVEL] += rock * 0.35;
  const ice = moonIce(body, d);
  if (ice > 0) { for (let i = 0; i < NL; i++) _gl[i] *= 1 - ice; _gl[L_ICE] += ice * 0.7; _gl[L_SNOW] += ice * 0.3; }
  return _gl;
}
