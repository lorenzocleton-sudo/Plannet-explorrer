# Planet Explorer

A 3D third-person space exploration game where you play as a planetary researcher. Land on round alien planets and moons, collect plants, rocks, minerals, dust and ice, scan the ground for buried traces of **ancient life**, drill for resources and reshape the terrain. Everything is a simple 3D form with its name floating above it.

**Current version: v0.3**

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
| `1`–`4` / mouse wheel | Switch tool: Scanner, Collector, Drill, Terraform |
| `E` / left click | Use the tool (hold to dig up fossils, pack up a drill, or keep raising ground) |
| `R` / right click | Lower ground (Terraform) |
| `[` `]` / Shift+wheel | Terraform brush size |
| `Q` | Quick scanner pulse |
| `C` | Research codex |
| `M` | Star map (only while standing at the lander) |
| `Esc` / `P` | Pause menu (resume, codex, star map, options, quit) |
| Any key / click | Skip a travel cutscene |

**Touch (phones and tablets):** drag on the left half to move, drag on the right half to look around, tap the hotbar to switch tools, and use the on-screen buttons (JUMP, SCAN, the tool action button, LOWER/BRUSH for terraforming, pause, codex, map).

### Gameplay
1. Planets and moons are round: walk all the way around them. Each has its own gravity, which changes how high you jump and how hard you fall.
2. You only find out if the air is breathable once you land. On airless worlds watch your **oxygen**; running out drains your **health**.
3. Falls hurt based on height × gravity, so the same drop is much safer on a low-gravity moon. Landing in liquid is safe.
4. Collect samples with the Collector and bring them to the **lander** to analyze them for **Research Points (RP)**. New species are worth 3×.
5. Use the Scanner to find buried fossils, then hold the Collector on them to dig them out.
6. Place your 3 drills on labelled mining spots. They keep mining while you explore; collect the resources and unload them at the lander. Rarer resources are deeper and found on harder worlds.
7. Reshape the ground with the Terraform tool. Changes are saved per world.
8. The lander's marker only shows when you're within 50 m, so remember where you parked!
9. Use the interactive **star map** at the lander to unlock planets with RP, zoom into a planet to see its moons, and pick your next destination.

If you die, you respawn at the lander and lose the samples and resources you were carrying.

The **Options** menu has mouse/camera/label/graphics settings and an **Admin** section with a debug mode (fly, infinite oxygen, god mode, instant drilling, teleport to lander, unlock everything).

Progress is saved automatically in your browser.

## Versioning
- Every add-on or removal adds **+0.1** (v0.1 → v0.2 → …)
- Every release is a whole number (**v1.0**, v2.0, …)

See [CHANGELOG.md](CHANGELOG.md).
