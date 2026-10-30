# Changelog

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
