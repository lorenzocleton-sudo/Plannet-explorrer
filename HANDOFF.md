# Planet Explorer: handoff notes for the next chat

Paste this into the next chat: **"Read HANDOFF.md in lorenzocleton-sudo/Plannet-explorrer and continue."**

## The project
- Browser 3D planet-exploration + survival-factory game, three.js r149 (`lib/three.min.js`, plain scripts, no build step).
- Repo: `lorenzocleton-sudo/Plannet-explorrer`. **All work goes to `main`**; GitHub Actions (`.github/workflows/deploy-pages.yml`) deploys to Pages on every push. It copies `index.html`, `lib/`, `js/` and `assets/` only.
- Live: https://lorenzocleton-sudo.github.io/Plannet-explorrer/
- The owner plays on an **Android tablet** (touch controls must always work).

## Owner's rules
- Version numbering: each prompt / add-on = +0.1 (now **v0.7**, `VERSION` in `js/data.js`); a full release = whole number.
- Usually asks: do steps in order, test, commit and push to main after certain steps; keep test checks short.
- Assets must be CC0/free, listed in `CREDITS.md`. Poly Haven, Quaternius, Kenney and jsDelivr sites are **blocked** in the cloud environment; GitHub (raw + git clone) and npm work. The owner can upload files to the repo (e.g. the Poly Haven rocks texture).
- Commit trailer used on every commit:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01N8cJvLjxoUyKsVYMoWfVhp`

## Cache busting (important, caused bugs before)
- Every `<script>` in `index.html` has `?v=0.7.x`; bump it on every release (`sed -i 's/?v=0\.7\.7"/?v=0.7.8"/' index.html`).
- Models/textures use `ASSET_V` in `js/data.js`; bump it when assets change.

## Code map (js/)
| File | What |
|---|---|
| `util.js` | noise (`vnoise3`, `fbm3`), `mulberry32`, helpers |
| `data.js` | VERSION/ASSET_V, `PLANETS` (5 planets + moons, atmo kind/comp/colours/fog), save/options, `floraProfile`, `frozenSea` |
| `items.js` | items, inventory helpers |
| `biomes.js` | 7 planet biomes from climate; `biomeWeights`, `planetGroundColor` |
| `world.js` | terrain height (`planetHeight`, `moonHeight`, `heightAt`), `genBody` (builds a world), samples, labels, lander |
| `water.js` | water shader (depth colour, waves, foam; frozen-sea ice mode `uIce`) |
| `ground.js` | PBR ground: 9-layer array textures, per-planet texture sets (`PLANET_GROUND`, `OWN_COLOR`), layer weights |
| `terrain.js` + `terrainworker.js` | cube-sphere LOD chunks, built in 2 Web Workers (`computeChunk`) |
| `nature.js` | procedural plant/rock models, wind shader, impostor atlas, loads CC0 tree glbs |
| `scenery.js` | tile-based instanced scenery, flora rules per planet (`FLORA`, `FLORA_SWAP`), colliders (`sceneryContact`) |
| `sky.js`, `skybodies.js` | atmosphere/sky shader (light rays), day cycle, lights, moons with phases, planet dots |
| `render.js` | renderer, `DETAIL` Low/Medium/High table, dynamic resolution via off-screen target (`renderScene`) |
| `game.js` | player physics, survival, input, `land()`, `syncScene()` |
| `astronaut.js` | animated CC0 astronaut (glb) |
| `mining.js`, `factory.js`, `build.js`, `sim.js`, `panels.js`, `tech.js` | mining spots, machines, build mode, factory sim, machine panels, tech tree |
| `rover.js` | drivable rover |
| `beacons.js` | beacons + compass bar |
| `weather.js` | rain/storm/snow/blizzard/dust/acid rain |
| `audio.js` | all generated Web Audio sound + music |
| `ui.js` | menus, helmet HUD, minimap |
| `debug.js` | admin mode (pause-menu Admin tab, on-screen admin bar, time speed) |
| `starmap.js`, `cutscene.js`, `main.js` | star map, travel cutscene, main loop |

## What was done in v0.7 (see CHANGELOG.md for detail)
Fixed assets missing on Pages, solid rocks with collision, performance (workers, impostors, dynamic res), real CC0 trees, denser grass, plants follow chemistry, helmet HUD + restyled menus, admin bar + time speed, generated sound/music + volume sliders, rover, beacons + compass, weather, black-flicker fix (no canvas resizing), frozen seas on Glacia/Umbros, owner's rocky ground texture on Verdara.

## Open items / ideas
- Pines and bushes are still procedural: no free pine/bush models reachable on GitHub. If the owner uploads Quaternius *Stylized Nature MegaKit* `Pine_1..5.gltf` / `Bush_Common.gltf` (with .bin + textures) to `assets/models/trees/`, add them in `TREE_FILES` (`js/nature.js`).
- Owner's raw uploads in the repo root (`rocks_ground_02_2k.blend.zip` 23 MB, 2K images, `dump/`) are unused; can be deleted if the owner agrees.
- Not verified on real hardware: FPS targets (60 High / 30 Low), sound after first tap, flicker fix.

## Testing (how the previous chat tested)
- Serve locally: `python3 -m http.server 8123` in the repo, then Playwright (pre-installed Chromium) scripts. Test helpers lived in the session scratchpad (not in the repo); recreate as needed.
- Software WebGL is slow: set `opts.quality='low'` for screenshots; set `window.NO_RENDER=true` (supported in `main.js`) for logic-only tests.
