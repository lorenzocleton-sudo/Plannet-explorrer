'use strict';
// ---------- weather (only on worlds with an atmosphere) ----------
// Each world with air has its own kinds of weather; airless worlds have none. Weather comes and
// goes on its own: calm spells, then a front builds up, peaks and clears. While it lasts the haze
// closes in, the light dims, solar panels make less power, and rain, snow or dust blows past.
// Precipitation is one particle system around the camera, animated entirely in the shader.
const WEATHER_TYPES = {
  rain: { name: 'Rain', fall: 9, len: 0.9, size: 0, color: '#a9c4e8', count: 1, fog: [0.45, 0.62, 0.78], fogK: 0.45, dim: 0.35, solar: 0.5, wind: 0.2 },
  storm: { name: 'Thunderstorm', fall: 13, len: 1.3, size: 0, color: '#b6c8e6', count: 1.6, fog: [0.3, 0.34, 0.42], fogK: 0.28, dim: 0.6, solar: 0.75, wind: 0.8, lightning: true },
  snow: { name: 'Snow', fall: 1.6, len: 0, size: 3.2, color: '#ffffff', count: 1, fog: [0.86, 0.9, 0.95], fogK: 0.4, dim: 0.25, solar: 0.45, wind: 0.25 },
  blizzard: { name: 'Blizzard', fall: 2.4, len: 0, size: 3.6, color: '#ffffff', count: 1.8, fog: [0.92, 0.94, 0.97], fogK: 0.12, dim: 0.4, solar: 0.7, wind: 1, drift: 7 },
  dust: { name: 'Dust storm', fall: 0.4, len: 0, size: 4.5, color: '#d39a62', count: 1.4, fog: [0.74, 0.5, 0.32], fogK: 0.1, dim: 0.5, solar: 0.75, wind: 1, drift: 11 },
  acid: { name: 'Acid rain', fall: 8, len: 0.8, size: 0, color: '#d8e08a', count: 1, fog: [0.7, 0.66, 0.36], fogK: 0.35, dim: 0.4, solar: 0.55, wind: 0.3 },
};
// which weather each world gets, and how much of the time it's stormy
const WORLD_WEATHER = { Verdara: ['rain', 'rain', 'storm'], Ruska: ['dust'], Glacia: ['snow', 'snow', 'blizzard'], 'Xeno Prime': ['acid', 'storm'] };
const WX = { type: null, strength: 0, target: 0, timer: 20, mesh: null, flash: 0, nextBolt: 0, rain: null, announced: false };

function initWeather(w) {
  WX.type = null; WX.strength = 0; WX.target = 0; WX.timer = 25 + Math.random() * 40; WX.flash = 0; WX.announced = false;
  if (WX.mesh) { WX.mesh.geometry.dispose(); WX.mesh.userData.points.geometry.dispose(); WX.mesh.material.dispose(); WX.mesh = null; }
  if (!w.body.atmo || !WORLD_WEATHER[w.body.name]) return;
  WX.mesh = makePrecip();
  w.scene.add(WX.mesh);
}
const weatherStrength = () => WX.type ? WX.strength : 0;
const weatherSolar = () => WX.type ? 1 - WEATHER_TYPES[WX.type].solar * WX.strength : 1;

// particles in a 40 m box around the camera; each is a short line (rain) or a soft dot (snow, dust)
const PRECIP_N = 3000, BOX = 40;
function makePrecip() {
  const pos = new Float32Array(PRECIP_N * 2 * 3), end = new Float32Array(PRECIP_N * 2), seed = new Float32Array(PRECIP_N * 2);
  for (let i = 0; i < PRECIP_N; i++) {
    const x = Math.random() * BOX, y = Math.random() * BOX, z = Math.random() * BOX, s = Math.random();
    for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; seed[i * 2 + k] = s; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFall: { value: 9 }, uLen: { value: 1 }, uSize: { value: 0 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uDrift: { value: new THREE.Vector3() }, uCount: { value: 1 }, uCam: { value: new THREE.Vector3() } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aEnd, aSeed;
      uniform float uTime, uFall, uLen, uSize, uCount;
      uniform vec3 uDrift, uCam;
      varying float vA;
      void main() {
        // fall down (local -y) and drift sideways, wrapping around the box that follows the camera
        vec3 p = position + vec3(0.0, -uFall * uTime * (0.8 + aSeed * 0.4), 0.0) + uDrift * uTime * (0.7 + aSeed * 0.6);
        p = mod(p - uCam, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
        p.y += aEnd * uLen;                                  // rain streak: the second end sits above the first
        p += uDrift * aEnd * uLen / max(uFall, 0.1) * 0.6;
        vA = step(aSeed, uCount) * (uSize > 0.0 ? 1.0 - aEnd : 1.0) * (1.0 - smoothstep(${(BOX * 0.3).toFixed(1)}, ${(BOX * 0.5).toFixed(1)}, length(p)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (60.0 / max(1.0, -mv.z));
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor; uniform float uAlpha, uSize;
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        float a = uAlpha * vA;
        if (uSize > 0.0) { vec2 c = gl_PointCoord - 0.5; a *= smoothstep(0.5, 0.15, length(c)); }
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  // snow and dust are drawn as soft points from the same buffers
  const pg = new THREE.BufferGeometry(); // same buffers, its own draw range
  for (const a in g.attributes) pg.setAttribute(a, g.attributes[a]);
  lines.userData.points = new THREE.Points(pg, m);
  lines.userData.points.frustumCulled = false;
  lines.add(lines.userData.points);
  return lines;
}

// per frame (after the sky and lights are set): advance the weather and apply it
const _wq = new THREE.Quaternion(), _wfog = new THREE.Color(), _wv = new THREE.Vector3();
let wxLast = 0;
function updateWeather(w) {
  const now = performance.now();
  let dt = Math.min(0.1, (now - (wxLast || now)) / 1000);
  wxLast = now;
  if (!WX.mesh) return;
  const list = WORLD_WEATHER[w.body.name];
  dt *= typeof timeK === 'function' ? timeK() : 1;
  WX.timer -= dt;
  if (WX.timer <= 0) {
    if (WX.target > 0) { WX.target = 0; WX.timer = 90 + Math.random() * 150; }           // clearing: calm spell next
    else { WX.type = list[Math.floor(Math.random() * list.length)]; WX.target = 0.6 + Math.random() * 0.4; WX.timer = 60 + Math.random() * 90; WX.announced = false; }
  }
  WX.strength += clamp(WX.target - WX.strength, -dt / 25, dt / 25);                    // fronts build and clear over ~25 s
  if (WX.strength <= 0.001 && WX.target === 0) WX.type = WX.type && WX.strength > 0 ? WX.type : null;
  if (WX.type && !WX.announced && WX.strength > 0.25) { WX.announced = true; toast(`${WEATHER_TYPES[WX.type].name} rolling in: visibility and solar power drop.`); }
  const T = WX.type && WEATHER_TYPES[WX.type], s = weatherStrength();
  const u = WX.mesh.material.uniforms;
  WX.mesh.visible = s > 0.01;
  if (T && s > 0.01) {
    // the box follows the camera, oriented with the local "up"
    WX.mesh.position.copy(camera.position);
    WX.mesh.quaternion.setFromUnitVectors(Y_AXIS, _wv.copy(camera.position).normalize());
    // the camera's position in the box's own frame keeps the drops fixed in the world as you move
    u.uCam.value.copy(camera.position).applyQuaternion(_wq.copy(WX.mesh.quaternion).invert());
    u.uTime.value = performance.now() / 1000 % 1000;
    u.uFall.value = T.fall; u.uLen.value = T.len; u.uSize.value = T.size * (detail().px > 1 ? 1.3 : 1);
    u.uColor.value.set(T.color).multiplyScalar(0.35 + 0.65 * smooth(-0.15, 0.2, player.up.dot(w.sunDir)));
    u.uAlpha.value = (T.size ? 0.9 : 0.6) * s;
    u.uCount.value = clamp(s * T.count * 0.7, 0, 1) * (opts.quality === 'low' ? 0.5 : 1);
    u.uDrift.value.set(T.drift || T.wind * 2, 0, (T.drift || 0) * 0.3);
    WX.mesh.material.depthTest = true;
    // rain is drawn as streaks, snow and dust as points
    WX.mesh.geometry.setDrawRange(0, T.size ? 0 : PRECIP_N * 2);
    WX.mesh.userData.points.geometry.setDrawRange(0, T.size ? PRECIP_N * 2 : 0);
    // haze closes in and takes on the weather's colour; the light dims
    if (w.scene.fog) {
      w.scene.fog.color.lerp(_wfog.setRGB(...T.fog).multiplyScalar(0.25 + 0.75 * smooth(-0.15, 0.2, player.up.dot(w.sunDir))), s * 0.85);
      w.scene.fog.near *= 1 - s * 0.9;
      w.scene.fog.far *= 1 - s * (1 - T.fogK);
    }
    const dim = 1 - T.dim * s;
    w.sun.intensity *= dim * (1 - s * 0.3);
    w.ambient.intensity *= dim;
    if (w.clouds) w.clouds.material.uniforms.uColor.value.set(w.body.atmo.cloudColor).multiplyScalar(1 - 0.55 * s);
    // lightning: a flash of light and a roll of thunder a moment later
    if (T.lightning && s > 0.5) {
      WX.nextBolt -= dt;
      if (WX.nextBolt <= 0) { WX.nextBolt = 4 + Math.random() * 12; WX.flash = 1; thunder(0.4 + Math.random() * 2.5); }
    }
  } else if (w.clouds) w.clouds.material.uniforms.uColor.value.set(w.body.atmo.cloudColor);
  if (WX.flash > 0) {
    WX.flash = Math.max(0, WX.flash - dt * 5);
    const f = WX.flash > 0.6 || (WX.flash > 0.2 && WX.flash < 0.35) ? 1 : 0;   // a double flicker
    w.ambient.intensity += f * 1.4;
  }
  updateRainSound(T, s);
}

// rain on your helmet and thunder (sound)
function updateRainSound(T, s) {
  if (typeof SND === 'undefined' || !SND.ready) return;
  if (!SND.rain) SND.rain = noiseBed('highpass', 1800, 0.4);
  ramp(SND.rain.g.gain, T && !T.size && !menu ? s * 0.22 : 0, 0.5);
}
function thunder(delay) {
  if (typeof SND === 'undefined' || !SND.ready) return;
  noiseHit(90, 0.6, 3.5, 0.9, 'lowpass', SND.sfx, delay);
  noiseHit(300, 0.5, 1.2, 0.5, 'lowpass', SND.sfx, delay + 0.05);
}
