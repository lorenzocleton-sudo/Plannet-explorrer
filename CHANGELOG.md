# Changelog

## v0.3 (prompt 3, the big update)
### Stage 1: round planets, gravity and atmosphere
- Planets and moons are now spheres you can walk all the way around; gravity always pulls toward the centre
- Every planet and moon has its own gravity (shown in the HUD), changing jump height and fall speed
- 11 moons across the system; moons only have rock, dust and sometimes ice (no plants, no seas)
- Breathable air is only revealed once you land ("Atmosphere: breathable" / "No breathable oxygen")
- Much bigger mountains (up to ~100 m) and much bigger seas (30–65% of each planet)
- Day and night sides, a starry sky, the sun, and moons / parent planet visible in the sky
- New radar minimap that rotates with your view

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
