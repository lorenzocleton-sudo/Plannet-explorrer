# Planet Explorer

A 3D third-person survival factory game on huge round planets and moons. Survive the oxygen, heat and cold, mine ores and ice, build drills, smelters, solar power and fabricators, research upgrades, and refine rocket fuel to fly to the next world. Along the way you collect plants, rocks, minerals and buried traces of **ancient life** to earn research. Everything is a simple 3D form with its name floating above it.

**Current version: v0.5**

## Play online
The game is deployed automatically to GitHub Pages on every push to `main`:
**https://lorenzocleton-sudo.github.io/Plannet-explorrer/**

Or open `index.html` in a browser. There's no install or build step, and it works offline (Three.js is bundled in `lib/`).

## Controls

| Key | Action |
| --- | --- |
| `WASD` / Arrows | Move (relative to the camera) |
| Mouse | Look around (click the game to capture the mouse) |
| `Space` | Jump |
| `1`–`3` / mouse wheel | Switch tool: Scanner, Collector, Build |
| `E` / left click | Use the tool (scan, pick up / dig up samples, open the build menu) |
| `F` | Interact: lander panel, machine panels, dig a deposit by hand, pick up a sample |
| `B` | Build menu |
| `R` / mouse wheel | Rotate while placing |
| `X` | Switch to deconstruct mode while building |
| `Q` | Quick scanner pulse |
| `C` | Research codex |
| `Esc` / `P` | Pause menu (resume, codex, tech tree, star map, options) or stop building |
| Any key / click | Skip a travel cutscene |

**Touch (phones and tablets):** the joystick bottom-left moves you; drag the right side to look. Big buttons bottom-right: **Jump**, **Use** (current tool) and **Interact**. Tap the hotbar at the bottom to switch tools (🔨 opens the build menu). While building, the buttons become **Rotate**, **Place** (hold to remove in deconstruct mode) and **✕**.

### How to play
1. **Survive.** Your suit's oxygen drains unless the air is breathable; refill at the lander or near an Oxygen Generator. Some worlds are scorching by day or freezing at night: extreme heat and cold hurt unless you have the Heat or Cold Suit. Falls hurt based on height × gravity.
2. **Mine.** Mining spots give Iron Ore, Copper Ore, Silicon and Ice (planets lean metal, moons lean ice and silicon), with rare crystals on harder worlds. Dig common ores by hand (hold Interact) or build a Drill on the spot.
3. **Build.** Open the build menu, place machines with the see-through preview, rotate them, and deconstruct to get everything back. You start with a kit of plates, wire and wafers in the lander.
4. **Automate.** Machines within 15 m of a Solar Panel or Battery are powered (solar only works by day; batteries cover the night). Machines within 12 m of a Storage Crate take their inputs from it and put their outputs into it. The lander gives a little power and acts as storage within 20 m.
   - Drill → crate → **Smelter** (Iron Plates, Copper Wire, Silicon Wafers) → **Fabricator** (Gears, Circuits, tools, upgrades)
   - **Oxygen Generator**: Ice + power → oxygen · **Fuel Refinery**: Ice + power → Rocket Fuel
5. **Research.** Collect samples and analyze them at the lander for Research Points, then unlock machines and upgrades in the **tech tree** (bigger oxygen tank, heat/cold suits, faster drills, better helmet light, bigger backpack, long-range scanner). Upgrades are crafted at a Fabricator.
6. **Travel.** Flying to another planet or moon burns Rocket Fuel from the lander's hold, so set up a refinery before you leave. Each world keeps its own base, and machines catch up on the time you were away.

The **Options** menu has mouse/camera/label/graphics settings and an **Admin** section with a debug mode (fly with `V`, infinite oxygen, god mode, fast machines, free travel, teleport with `T`, unlock all planets). Admin buttons only appear while debug mode is on.

Progress is saved automatically in your browser.

## Versioning
- Every add-on or removal adds **+0.1** (v0.1 → v0.2 → …)
- Every release is a whole number (**v1.0**, v2.0, …)

See [CHANGELOG.md](CHANGELOG.md).
