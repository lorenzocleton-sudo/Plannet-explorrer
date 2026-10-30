# Changelog

## v0.7 (prompt 7: fixes, polish and new features)
### Part 5 (steps 9–10)
- **Beacons**: a cheap building (2 iron plates, 1 copper wire) unlocked from the start. After placing one you name it and pick a colour (INTERACT to change it later). It glows, sends a faint light beam up into the sky and shows on the compass
- **Compass**: a bar at the top of the screen with your heading, N/E/S/W (north follows the planet's axis) and markers for your beacons, the lander (only within 50 m), your rover and the points of interest you've discovered (mining deposits, uncovered fossils). The marker you're facing shows its name and distance
- **Weather** on worlds with air only: rain and thunderstorms (with lightning and thunder) on Verdara, dust storms on Ruska, snow and blizzards on Glacia, acid rain and storms on Xeno Prime. Airless Umbros and the moons have none. Fronts build up, peak and clear on their own; while they last the haze closes in (down to a few hundred metres in a dust storm), the light and clouds darken, solar panels lose up to 75% of their power, and rain or wind sounds join in. The weather shows in the HUD status line

### Part 4 (steps 7–8)
- **Sound** (all generated in the browser, no audio files): footsteps that change with the ground (grass, dirt, sand, snow, rock, water, the lander's metal pad), gusty wind that grows with height and thick air, waves near the sea, drills grinding and machines humming near you, lander thrusters during takeoff and landing, and soft UI clicks. On airless worlds there's no wind: you only hear muffled thuds through your boots and your own breathing in the suit
- **Music**: calm generative ambient music with its own mood per kind of world (warm on Verdara, sparse on Ruska, glassy on Glacia, strange on Xeno Prime, low and uneasy on Umbros, empty bells on moons)
- **Volume sliders** in Options: master, music and effects
- **Rover**: research it in the tech tree, then craft it at a Fabricator; it rolls out beside it (one per world). INTERACT opens its panel (Drive, battery, 120-slot cargo hold). It drives with the same joystick, follows each world's gravity (it leaves the ground over crests and bounces on light moons), tilts with the ground, slides on ice, and bumps into trees and rocks. The battery recharges near your power grid or the lander; when it's flat the rover burns rocket fuel from its cargo. The cab is pressurised (no oxygen loss, heat or cold), headlights come on at night, and it's saved per world
- Lifeless and alien worlds no longer use the Earth grass texture for their ground

### Part 3 (steps 5–6)
- **Helmet HUD**: no more boxed panels. Thin glowing bars with small line icons along the left edge (health, oxygen, temperature, backpack, scanner), the planet, air, gravity, time and altitude as plain readouts at the top, a ring radar with tick marks, outlined prompts and landing banners, and a faint visor edge. Everything has a soft shadow so it reads on snow and in the dark
- **Menus**: restyled to match: frosted glass panels, uppercase headings, pill buttons, line icons for the tools, and smooth fade/slide transitions
- **Admin mode**: while it's on (and only then), shortcut buttons sit on the left edge: fly (with UP/DOWN while flying), teleport, infinite O₂, god mode and time speed. The Admin tab has a time speed slider from 1× to 100× that speeds up day and night and all machines, including drills

### Part 2 (steps 3–4)
- **Real trees**: Earth-like trees are now CC0 models (Quaternius Stylized Nature MegaKit), with their bark simplified for tablets; they sway in the wind, and from about 35 m they turn into cut-outs made from the same models
- **Grass**: about 2.5× denser, lighter and softer blades, lit the same from both sides, and thinning out smoothly with distance
- **Plants follow the chemistry**: Earth plants only grow on Verdara (Earth-like air and water). Glacia (breathable but frozen) has hardy grass, a few trees and bare trees. Ruska (CO₂ air, brine) has only sparse lichen crusts and the odd alien growth. Xeno Prime's sulfur haze grows alien plants only (alien grass, glowing bulbs, tube corals, giant mushrooms). Umbros and every moon have no air, so nothing grows there; their plant samples are gone from the world and the codex

### Part 1 (steps 1–2)
- **Fix: the astronaut and ground textures never reached the live site.** The deploy workflow only copied `index.html`, `lib/` and `js/`, so `assets/` (the astronaut model and all ground textures) was missing online and the game fell back to the old capsule and plain ground. It now deploys `assets/` too, and models and textures carry a version tag so browsers fetch fresh copies
- **Fix: rocks could be walked and seen through.** Rocks, boulders and the mushroom caps were built inside-out (you saw their insides and lighting was reversed). They are solid from every side now, and every rock, boulder, slab, pillar and arch has proper collision; you can climb onto low rocks and stand on them
- **Performance**: pixel ratio capped (1.0 Low, 1.25 Medium, 1.5 High) with dynamic resolution that lowers the image resolution when the frame rate drops below the goal (30 / 45 / 60 FPS) and raises it again when there is room; terrain is built in two background Web Workers, so walking into new land no longer stutters; shadows are only drawn near you (smaller area and map on Low); far trees are flat cut-outs (impostors) instead of full models; grass is frustum-culled in quarters; the lander's parts are merged into a few meshes; no more per-frame object creation in the hot paths
- The FPS counter only shows in admin mode (with the current resolution scale)


## v0.6 (prompt 6: visual overhaul)
### Part 3 (steps 6–7)
- **Sky**: the big planet balls are gone. Other planets are bright, star-like points that move with the sky. A planet's own moons are cratered globes at a realistic size (about 1.5° across) that orbit and show phases; by day only their sunlit side shows. From a moon, the parent planet hangs in the sky with phases and a glowing rim of air
- **Air chemistry sets the sky**: Verdara is Earth-like (blue sky, orange sunsets), Ruska is dusty CO₂ like Mars (butterscotch days, blue sunsets), Xeno Prime has a thick yellow-orange sulfur haze and Glacia's methane turns its sky teal. The make-up of the air is shown when you land, on the star map and in the pause menu
- **Lighting**: soft shadows that grow long at sunrise and sunset (the shadow area follows the low sun), sky light from above and ground bounce from below, darker hollows and rock bases (ambient occlusion), haze that thickens with each atmosphere, a glow around the sun that warms and widens when it's low, and light rays fanning out from a low sun
- **Detail Low / Medium / High** (Options): sets terrain resolution, how far grass, plants and trees are drawn, texture size and relief, shadow quality, haze distance and light rays. Low is tuned for older tablets (about 185k triangles in a dense forest, versus about 320k on Medium)

### Part 2 (steps 4–5)
- **Textured ground**: the ground uses CC0 photo textures with relief (normal maps): grass, dirt, sand, rock, gravel, snow, moon dust, ice and alien ground. They blend by biome, height (sand at the shore, gravel on the sea floor, snow up high and in the cold) and slope (bare rock on steep ground). Each planet keeps its own colours, and texture detail fades out with distance so it stays smooth and cheap
- **Nature**: grass that moves in the wind, bushes, broadleaf and conifer trees, swamp palms, bare trees, cacti, dry shrubs, alien bulbs, tube corals and giant glowing mushrooms, and rocks of every size up to boulders and slabs. Ruska, Umbros and Xeno Prime also have tall rock pillars and natural arches. What grows where depends on the biome. Everything is drawn instanced, with simpler models far away, and grows in smoothly at the edge of the view instead of popping
- Trunks, boulders and pillars are solid; nothing grows on the landing pad, mining spots or your buildings
- **Astronaut**: the player is now an animated astronaut (CC0, Quaternius) that idles, walks, runs and jumps
- Samples are real shapes now: leafy plants with a flower bulb, rounded rocks, crystal clusters, coiled fossil shells, dust mounds and ice chunks. The lander has a rounded hull, an engine bell and foot pads

### Part 1 (steps 1–3)
- **Admin tab**: all admin buttons are off the screen. With debug mode on (Options), the pause menu gets an Admin tab: fly mode, teleport to lander, infinite O₂, god mode, fast machines / free travel, unlock all. On touch, while flying JUMP goes up and INTERACT goes down
- **Assets**: CC0 ground textures (ambientCG via the jMonkeyEngine repo), a CC0 animated astronaut (Quaternius) and the three.js glTF loader are now in the repo; sand, dust and ice textures are generated. Sources and licences are listed in CREDITS.md
- **Biomes**: planets now have several biomes (grassland, forest, desert, highlands, tundra, swamp, alien growth) from a simple climate (latitude, height, moisture) that blend smoothly. Biomes set the ground colour, which samples appear and which resources spots hold
- **Shores and water**: coasts slope gently into the water with only the occasional rocky cliff; swamps have shallow ponds. Water is light and see-through in the shallows and darker when deep, with moving waves, sun glints, sky reflections and foam along the shore
- **Smooth terrain**: per-pixel lighting with smooth normals everywhere; Options → Detail (Low / Medium / High) sets how fine the ground is near you and how far the detail reaches

## v0.5 (prompt 5: survival factory)
### Change: ores are deposited by hand
- Standing at the lander no longer unloads your resources automatically (it also put back ore you had just taken out). Open the lander or a crate with INTERACT and tap **Deposit all ores** (or Store / Store everything)
- Machine and lander panels only redraw when something changes, so taps on their buttons are no longer lost to a redraw

### Fix: error after placing a Smelter
- Placing a powered machine (Smelter, Oxygen Generator, Fuel Refinery, Fabricator) closer to a Solar Panel or Battery than to the lander crashed the power network setup ("Cannot read properties of null (reading 'users')"), and the saved base kept crashing after reload. Machines now join the nearest power source's network correctly

### Fix: black screen after the last update
- The browser could keep some old game files and load them next to new ones, so the game stopped while starting (black screen, empty star map). Game files now carry a version tag, so an update always loads the full new set
- If starting ever fails, a message with a Reload button now appears instead of a silent black screen

### Fix: game could freeze after building machines (reported on a tablet)
- Machine labels with live numbers ("Battery · 45%", "Smelter · Iron Plate 63%") created a new texture for every new number and never freed them (hundreds within minutes), which can exhaust a tablet's graphics memory and freeze the 3D view while menus still work. Each machine now redraws one label in place
- Quick taps on PLACE / USE / INTERACT could be missed if the finger lifted before the next frame; taps are now always registered, and a held button can no longer get "stuck" when build mode ends
- The game loop keeps running even if a frame hits an error (it shows the message instead of freezing), and a lost graphics context shows a message and tries to recover
- The build-mode ✕ button is now labelled DONE

### Stage 1: survival
- Suit oxygen tank (100, or 200 with the Bigger Oxygen Tank upgrade) drains over time unless the air is breathable; refill at the lander or (later) near an Oxygen Generator
- Every world has a climate that follows the day/night cycle: Ruska and Xeno Prime are scorching by day, Glacia and Umbros are always freezing, airless moons freeze at night
- Extreme heat (50 °C and up) or cold (−30 °C and below) drains health unless you have the Heat Suit / Cold Suit upgrade or are at the lander; the HUD shows the temperature
- Fall damage stays; no hunger

### Stage 2: resources
- Mining spots now give Iron Ore, Copper Ore, Silicon and Ice, plus rare crystals on harder worlds: Ember Crystal (Ruska onwards), Void Crystal (Umbros system) and Xeno Crystal (Xeno Prime system)
- Planets mostly give metals; moons mostly give ice and silicon; crystals sit deep and need a drill
- Every world has one iron, copper, silicon and ice spot within a short walk of the lander
- Hold Interact at a spot to dig common ores by hand
- New inventory (60 slots, more with upgrades) and lander hold (400): raw resources unload into the lander automatically; old saves' resources move into the lander under their new names

### Stage 3: build mode
- Build menu (`B`, the 🔨 hotbar slot, or tap it on touch) listing every machine with its cost and what you're missing
- Placing shows a see-through preview that snaps to the ground (green = OK, red = blocked, with the reason) and a ring showing the machine's range; drills snap onto mining spots
- Rotate before placing (`R` / mouse wheel / ROTATE); place with `E` / left click / PLACE; `Esc` / ✕ to stop
- Deconstruct mode (`X` or from the build menu): hold on a building to remove it and get all its materials and contents back
- Materials come from your inventory, nearby crates and the lander's hold (its drone delivers anywhere on the current world); new and existing saves get a starter kit of 40 Iron Plates, 16 Copper Wire and 8 Silicon Wafers in the lander
- Buildings are saved per planet/moon

### Stage 4: machines
- **Drill**: sits on a mining spot, mines on its own (deeper deposits are slower), stores 30 and pushes into a nearby crate or the lander
- **Storage Crate**: holds 200; machines within 12 m take from it and put into it
- **Smelter**: 2 Iron Ore → Iron Plate, 2 Copper Ore → 2 Copper Wire, 2 Silicon → Silicon Wafer (auto or a chosen recipe)
- **Fabricator**: crafts Gears and Circuits (needed for the advanced machines), the Long-range Scanner tool and suit upgrades
- **Solar Panel**: power only while the sun is up; **Battery**: stores the daytime surplus for the night
- **Oxygen Generator**: Ice + power → oxygen, refills your suit within 8 m
- **Fuel Refinery**: 2 Ice + power → 1 Rocket Fuel
- Simple connections, no belts: machines within 15 m of a solar panel or battery are powered (sources in range of each other form one grid); machines within 12 m of a crate use it as storage; the lander supplies a little power and acts as storage within 20 m
- Interact with any machine to open its panel (status, power, storage, recipes, take items, deconstruct); interact with the lander to move items between your inventory and its hold
- Machine labels show live status ("Smelter · Iron Plate 45%", "no power", "needs ice"); the old free drill tool is gone, drills are machines now

### Stage 5: progression
- Tech tree (pause menu or the lander panel): spend Research Points from analyzed samples. Basic Industry (drill, crate, smelter, solar) is free; Fabrication unlocks the Fabricator, Gears and Circuits, then Energy Storage, Life Support, Fuel Refining and the upgrades
- Upgrades are researched, then crafted at a Fabricator: Bigger Oxygen Tank, Cold Suit, Heat Suit, Faster Drills, Better Helmet Light, Bigger Backpack, Cargo Exoframe, and the Long-range Scanner tool
- Travelling costs Rocket Fuel from the lander's hold (or crates next to it): 4 to hop between a planet and its moons, 9–22 between planets, so you have to build a fuel setup (Refinery + Ice + power) before you can leave

### Stage 6: saving
- Each planet and moon keeps its own base: every building, its rotation, contents, progress, battery charge and stored oxygen; the game autosaves every 10 seconds
- Machines catch up while you're away: when you come back to a world (or reopen the game) the time you were gone is replayed, up to 24 hours, using average daylight for solar power; the lander only counts as power/storage for that world if it was actually there
- A message tells you what your machines made while you were gone

## v0.4 (prompt 4)
### Part 0: Terraform tool removed
- The Terraform tool, its hotbar slot, its controls (R / right click, brush keys, touch RAISE/LOWER/BRUSH) and all saved terrain edits are gone; the hotbar now has Scanner, Collector and Drill

### Part 1: much bigger worlds
- Planets are now 5.2–8 km in radius (about 30–50 km around) and moons 1.1–2.3 km
- New streaming terrain: each world is a quadtree of chunks; detailed ground (about 1.4 m between points) is only built near you and gets coarser with distance, a few chunks per frame
- Terrain behind the horizon isn't drawn, and samples beyond 120 m are hidden, to keep it smooth on tablets (about 100 draw calls on screen)
- Samples now stream in by area around you; mining spots cover the whole world (with three near the lander) and only load when you get close
- Smooth-shaded ground with bare rock on steep slopes; deeper depth buffer so far-away terrain doesn't flicker
- Because the worlds changed size, collected samples and placed drills from older saves are reset (RP, unlocks, codex and resources are kept)

### Part 2: natural landscapes
- New planet terrain: continents with shallow shelves, flat lowlands and beaches along the coast, rolling hills inland, wide valleys, and mountain ranges (only well inland) with smooth slopes and rounded ridges; just a few sharp peaks
- Mountains reach roughly 300–500 m; side ridges and gullies on their flanks
- Colours blend naturally from beach to lowland to rock to peaks, with snow caps on Verdara and Glacia and bare rock on steep slopes
- Sea coverage per planet: Verdara ~50%, Ruska ~30%, Glacia ~65%, Umbros ~45%, Xeno Prime ~55%

### Part 3: atmosphere and clouds
- Verdara, Ruska, Glacia and Xeno Prime have an atmosphere: a glowing sky shell (blue/rust/pale/yellow-green) that colours the sky from the ground, turns orange near sunrise and sunset, fades with height, and shows as a glowing rim from space and in the travel cutscene
- Those planets also get a moving cloud layer, lit by the sun and visible both from below and from orbit
- Umbros and all moons have no atmosphere: black sky with stars and no clouds
- Distance haze matches the sky colour and clears when you fly above the air

### Part 4: real-looking moons
- Grey, dusty moon surfaces with gentle highlands, darker flat "maria" plains, and rockier slopes
- Craters at four size classes, from ~200 m basins with flat floors and raised rims down to small pits a few metres across
- Icy moons (Vesk, Nyx, Mora, Ixa) have bright ice fields blended into the dust
- Still no air (black sky, stars) and only rock, dust and sometimes ice to collect

### Part 5: sun and day/night cycle
- The system's sun now crosses the sky: every world spins on a tilted axis with its own day length (planets 8–15 min, moons ~18–30 min), so you get sunrise, day, sunset and a starry night; the stars, moons and parent planet move across the sky with it
- You always land in the morning; the HUD shows the local time, and the star map shows each world's day length
- Sunlight warms to orange near sunrise/sunset on worlds with air; nights are properly dark
- Helmet light: a spotlight pointing where you look plus a soft glow around you switches on at dusk, so night stays playable

### Part 6: cleaner tablet controls
- One fixed joystick in the bottom-left corner to move; drag anywhere on the right side to look around
- Three big see-through buttons bottom-right: **Jump**, **Use Tool** (shows the current tool's icon) and **Interact**
- Compact icon-only tool hotbar at the bottom, and a small pause button under the minimap; the old SCAN / CODEX / MAP buttons are gone (codex and star map are in the pause menu, and Interact opens the star map at the lander)
- New **Interact** action (`F` on keyboard): opens the star map at the lander, places/collects/packs up a drill at a mining spot, or picks up / digs up the nearest sample with any tool selected
- Prompts name the right control for your device (USE / INTERACT on touch, E / F on keyboard); debug fly mode moved from `F` to `V`

### Part 7: admin controls hidden
- Admin/debug buttons (fly, teleport, unlock all, UP/DOWN) and the DEBUG badge only appear while debug mode is switched on in Options; they're hidden by default from the very first frame, and the debug shortcuts do nothing while it's off

### Part 8: realistic gravity
- Gravity is based on real values: Verdara 9.81 m/s² (Earth), Glacia 8.4, Umbros 9.4, Ruska 11.2 and heavy Xeno Prime 14.6
- Moons are based on Earth's Moon (1.62 m/s²), a bit lower for small moons and higher for big ones (1.45–1.88 m/s²), never low enough for silly jumps
- Jumps are now about 0.4–0.7 m on planets (lowest on Xeno Prime) and 3–4 m on moons (it used to be up to ~20 m)
- Fall damage still scales with local gravity: a 10 m drop hurts on planets (31–81 HP) but not on moons, and 30 m on a moon costs at most ~9 HP

## v0.3 (prompt 3, the big update)
### Stage 1: round planets, gravity and atmosphere
- Planets and moons are now spheres you can walk all the way around; gravity always pulls toward the centre
- Every planet and moon has its own gravity (shown in the HUD), changing jump height and fall speed
- 11 moons across the system; moons only have rock, dust and sometimes ice (no plants, no seas)
- Breathable air is only revealed once you land ("Atmosphere: breathable" / "No breathable oxygen")
- Much bigger mountains (up to ~100 m) and much bigger seas (30–65% of each planet)
- Day and night sides, a starry sky, the sun, and moons / parent planet visible in the sky
- New radar minimap that rotates with your view

### Stage 2: health and fall damage
- Health bar in the HUD; health refills at the lander
- Fall damage uses fall height × local gravity, so the same drop hurts much less on a low-gravity moon; landing in liquid is safe
- Running out of oxygen now hurts you instead of instantly knocking you out
- At 0 health you respawn at the lander and lose the unsaved samples you were carrying

### Stage 3: tool hotbar
- Hotbar with four tools: Scanner, Collector, Drill, Terraform Tool
- Switch with `1`–`4` or the mouse wheel; use the tool with `E` or left click (`Q` still fires a quick scan)
- Touch: tap the hotbar slots; the big action button changes to match the tool (SCAN / GRAB / DRILL / RAISE)
- Samples can only be picked up with the Collector (the prompt tells you to switch)

### Stage 4: mining with drills
- 14 mining spots per planet and 7 per moon, each marked with a name label ("Iron deposit · 12 m deep") and shown on the radar
- 10 resources in 5 rarity tiers, from Iron/Copper/Silicon up to Iridium and Xenocrystal; rarer ones are deeper (slower to drill) and only appear on harder worlds
- You own 3 drills: place one on a spot with the Drill tool, it mines over time (even while you're away), then collect the resources; hold to pack the drill back up
- Resources go in a cargo hold (40 units), are unloaded at the lander for Research Points, and are listed in the codex; dying loses carried cargo

### Stage 5: terraform tool
- Raise (`E` / left click / RAISE) or lower (`R` / right click / LOWER) the ground where you aim, up to 40 m away; a ring shows the brush
- Five brush sizes (1.5–9 m): `[` `]`, Shift+wheel, or the BRUSH button on touch
- Changes are saved per planet/moon and come back when you return; the ground recolours to match its new height (dig below sea level and it floods)
- Samples, mining spots and drills move with the ground; the landing pad can't be terraformed

### Stage 6: lander visibility
- The LANDER label and its radar marker only appear within 50 m of the lander; further away you have to find your own way back

### Stage 7: interactive star map
- The star map is now a live solar system: planets orbit the sun, locked ones are dimmed
- Tap/click a planet to zoom in on it and see its moons orbiting (Umbros has 4, Glacia none)
- Pick the planet or any of its moons as your destination; moons open up together with their planet
- Atmosphere stays "unknown" on the map until you've landed there

### Stage 8: cutscenes
- Travelling plays a takeoff (lander lifting off with its engine flame), a flight through space (old world falling behind, new one approaching), and a landing descent onto the new world
- Skip at any time with any key, a click/tap on the screen, or the Skip button
- The atmosphere/gravity banner appears once you've touched down

### Stage 9: debug / admin mode
- New "Debug / admin mode" toggle in Options → Admin (off by default)
- While on: infinite oxygen, god mode (no fall or any other damage), instant drilling
- Fly mode (`F`; `Space` up, `X` down, `Shift` fast), teleport to lander (`T`), and unlock all planets and moons, also available as buttons in Options and the pause menu
- Touch: TP / FLY / UP / DOWN buttons appear while debug mode is on

## v0.2 (prompt 2)
- Rebuilt as a **3D third-person** game (Three.js): hilly low-poly terrain, liquid pools, and an orbiting camera behind your researcher
- Every object is one simple form with a **name label above it**: plants = cones, rocks = rough stones, minerals = spinning glowing crystals, fossils = rings, plus the lander and your researcher
- Unknown samples are labelled "Unknown Plant/Rock/…" until analyzed, then show their real name
- **Pause menu** (`Esc`/`P`): resume, codex, star map, options, save & quit to title
- **Options menu**: mouse sensitivity, invert Y, camera distance, field of view, label mode (nearby / far / always / off), minimap, FPS counter, render quality, shadows (saved in the browser)
- Jumping (`Space`); collecting moved to `E`
- Umbros is now pitch-dark with a lamp around the player; a lander beacon label is always visible so you can find your way back
- Touch: left side moves, right side looks around, new Jump and Pause buttons
- Existing v0.1 progress carries over

## v0.1 (prompt 1)
- First playable version: top-down planet exploration with basic shapes
- Collectibles: plants, rocks, minerals, and hidden fossils (ancient life)
- Species are generated per planet with their own names and colors; unknown until analyzed
- Scanner pulse reveals buried fossils, and the "ancient life signal" meter shows when one is nearby
- Hold-to-dig excavation for fossils
- Oxygen system, liquid hazards, blackout/rescue (you lose the samples you were carrying)
- Lander base: analyze samples for Research Points (3× bonus for first discovery), refill O₂
- Research codex listing every species per planet
- Star map with 5 planets to unlock: Verdara, Ruska, Glacia (slippery ice), Umbros (darkness), Xeno Prime
- Minimap, touch controls, autosave
