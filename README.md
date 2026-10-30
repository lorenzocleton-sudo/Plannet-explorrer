# Planet Explorer

A 3D third-person space exploration game where you play as a planetary researcher. Land on alien worlds, collect plants, rocks and minerals, and scan the ground for buried traces of **ancient life**. Everything is a simple 3D form (cones, crystals, rocks, rings) with its name floating above it.

**Current version: v0.2**

## How to play

Open `index.html` in a browser. There's no install or build step, and it works offline (Three.js is bundled in `lib/`). It also works on phones and tablets with touch controls.

| Key | Action |
| --- | --- |
| `WASD` / Arrows | Move (relative to the camera) |
| Mouse | Look around (click the game to capture the mouse) |
| `Space` | Jump |
| `E` | Collect a sample (hold to dig up fossils) |
| `Q` | Scanner pulse: reveals buried fossils nearby |
| `C` | Research codex |
| `M` | Star map (only while standing at the lander) |
| `Esc` / `P` | Pause menu (resume, codex, star map, options, quit) |

On touch screens, drag on the left half to move, drag on the right half to look around, and use the on-screen buttons.

The **Options** menu (from the title or pause screen) lets you change mouse sensitivity, invert Y, camera distance, field of view, name labels, minimap, FPS counter, render quality and shadows.

### Gameplay loop
1. Explore the planet and pick up samples (your backpack holds 10).
2. Watch your **oxygen**. Liquid pools slow you down and use oxygen faster.
3. Return to the **lander** to analyze your samples and refill oxygen. Each analyzed sample earns **Research Points (RP)**, and a new species is worth 3× the normal amount.
4. Follow the "Ancient life signal" and use the **scanner** to find buried fossils, then hold `E` to dig them out.
5. Spend RP on the **star map** to unlock new planets (5 in total, each with its own twist).

Progress is saved automatically in your browser.

## Versioning
- Every add-on or removal adds **+0.1** (v0.1 → v0.2 → …)
- Every release is a whole number (**v1.0**, v2.0, …)

See [CHANGELOG.md](CHANGELOG.md).

## Play online
The game is deployed automatically to GitHub Pages on every push to `main`:
**https://lorenzocleton-sudo.github.io/Plannet-explorrer/**
