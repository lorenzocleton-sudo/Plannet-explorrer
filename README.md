# Planet Explorer

A space exploration game where you play as a planetary researcher. Land on alien worlds, collect plants, rocks and minerals, and scan the ground for buried traces of **ancient life**. Everything is drawn with simple shapes for now.

**Current version: v0.1**

## How to play

Open `index.html` in a browser. There's no install or build step. It also works on phones and tablets with touch controls.

| Key | Action |
| --- | --- |
| `WASD` / Arrows | Move |
| `E` / `Space` | Collect a sample (hold to dig up fossils) |
| `Q` | Scanner pulse: reveals buried fossils nearby |
| `C` | Research codex |
| `M` | Star map (only while standing at the lander) |
| `Esc` | Close menus |

On touch screens, drag anywhere to move and use the on-screen buttons.

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
