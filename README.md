# Planet Explorer

A 3D third-person space exploration game where you play as a planetary researcher. Land on huge round planets and moons, collect plants, rocks, minerals, dust and ice, scan the ground for buried traces of **ancient life**, and drill for resources. Everything is a simple 3D form with its name floating above it.

**Current version: v0.4**

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
| `1`–`3` / mouse wheel | Switch tool: Scanner, Collector, Drill |
| `E` / left click | Use the tool (hold to dig up fossils or pack up a drill) |
| `F` | Interact: star map at the lander, drills at mining spots, or pick up the nearest sample |
| `Q` | Quick scanner pulse |
| `C` | Research codex |
| `M` | Star map (only while standing at the lander) |
| `Esc` / `P` | Pause menu (resume, codex, star map, options, quit) |
| Any key / click | Skip a travel cutscene |

**Touch (phones and tablets):** the joystick in the bottom-left corner moves you; drag anywhere on the right side to look around. The big buttons bottom-right are **Jump**, **Use** (the current tool) and **Interact**. Tap the small hotbar at the bottom to switch tools, and the pause button under the minimap for the menu (codex, star map, options).

### Gameplay
1. Planets (5–8 km radius) and moons (1–2.3 km) are round: you can walk all the way around them. Detailed terrain streams in around you as you go.
2. Each world has its own gravity (Earth-like 9.81 m/s² on Verdara, 1.45–1.9 m/s² on the moons), which changes how high you jump and how hard you fall.
3. You only find out if the air is breathable once you land. On airless worlds watch your **oxygen**; running out drains your **health**.
4. Every world turns: the sun rises and sets, and nights are dark, so your helmet light switches on at dusk. The HUD shows the local time.
5. Falls hurt based on height × gravity, so the same drop is much safer on a moon. Landing in water is safe.
6. Collect samples and bring them to the **lander** to analyze them for **Research Points (RP)**. New species are worth 3×.
7. Use the Scanner to find buried fossils, then hold Use (Collector) or Interact on them to dig them out.
8. Place your 3 drills on labelled mining spots. They keep mining while you explore; collect the resources and unload them at the lander. Rarer resources are deeper and found on harder worlds.
9. The lander's marker only shows when you're within 50 m, so remember where you parked!
10. Use the interactive **star map** at the lander to unlock planets with RP, zoom into a planet to see its moons, and pick your next destination.

If you die, you respawn at the lander and lose the samples and resources you were carrying.

The **Options** menu has mouse/camera/label/graphics settings and an **Admin** section with a debug mode (fly with `V`, infinite oxygen, god mode, instant drilling, teleport with `T`, unlock everything). Admin buttons only appear while debug mode is on.

Progress is saved automatically in your browser.

## Versioning
- Every add-on or removal adds **+0.1** (v0.1 → v0.2 → …)
- Every release is a whole number (**v1.0**, v2.0, …)

See [CHANGELOG.md](CHANGELOG.md).
