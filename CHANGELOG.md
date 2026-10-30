# Changelog

## v0.5 (prompt 5: survival factory)
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
