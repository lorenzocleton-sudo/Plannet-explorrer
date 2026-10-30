"""Builds the ground textures in assets/textures (run from the repo root).

Photo textures: ambientCG (CC0) sets taken from the jMonkeyEngine repo's test data, resized to 512 px.
Procedural textures (sand, dust, ice): generated here from tileable noise, no third-party content.
Each layer gets <name>_col.jpg (colour) and <name>_nrm.jpg (OpenGL normal map, roughness is derived in the shader).
Usage: python3 tools/make_textures.py <path to jme3-testdata/.../Textures/Terrain/PBR>
"""
import sys, os
import numpy as np
from PIL import Image

OUT = 'assets/textures'
S = 512
PHOTO = {'grass': 'Ground037', 'dirt': 'Ground036', 'gravel': 'Gravel015', 'rock': 'Rock035', 'snow': 'Snow006', 'alien': 'Marble013'}

def save(name, col, nrm):
    Image.fromarray(col).save(f'{OUT}/{name}_col.jpg', quality=86)
    Image.fromarray(nrm).save(f'{OUT}/{name}_nrm.jpg', quality=90)

def photo(src):
    for name, base in PHOTO.items():
        col = Image.open(f'{src}/{base}_1K_Color.png').convert('RGB').resize((S, S), Image.LANCZOS)
        nrm = Image.open(f'{src}/{base}_1K_Normal.png').convert('RGB').resize((S, S), Image.LANCZOS)
        col = np.asarray(col)
        if name == 'rock':  # the source rock is blue-black: make it a neutral grey the game can tint per planet
            g = col.astype(np.float32).mean(axis=2, keepdims=True)
            g = (g - g.mean()) * 1.25 + 118
            col = np.clip(np.repeat(g, 3, axis=2) * np.array([1.0, 0.97, 0.93]), 0, 255).astype(np.uint8)
        save(name, col, np.asarray(nrm))

# ---- tileable value noise ----
rng = np.random.default_rng(7)
def noise(freq, seed):
    r = np.random.default_rng(seed).random((freq, freq))
    x = np.arange(S) * freq / S
    i0 = np.floor(x).astype(int); f = x - i0; f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % freq; i0 %= freq
    a = r[i0][:, i0] * (1 - f)[None, :] + r[i0][:, i1] * f[None, :]
    b = r[i1][:, i0] * (1 - f)[None, :] + r[i1][:, i1] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]
def fbm(base, octaves, seed, gain=0.5):
    out = np.zeros((S, S)); amp = 1; tot = 0
    for o in range(octaves):
        out += noise(base * 2 ** o, seed + o) * amp; tot += amp; amp *= gain
    return out / tot
def normal_from(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(h)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)
def colorize(t, c0, c1):
    c0, c1 = np.array(c0, float), np.array(c1, float)
    return np.clip(c0 + (c1 - c0) * t[..., None], 0, 255).astype(np.uint8)

def procedural():
    # sand: soft wind ripples plus fine grain
    y = np.arange(S)[:, None] / S; x = np.arange(S)[None, :] / S
    warp = fbm(4, 3, 11)
    ripples = 0.5 + 0.5 * np.sin((y * 14 + warp * 2.2 + x * 2) * 2 * np.pi)
    grain = rng.random((S, S))
    h = ripples * 0.55 + fbm(8, 4, 12) * 0.35 + grain * 0.1
    t = np.clip(fbm(3, 3, 13) * 0.6 + h * 0.4 + (grain - 0.5) * 0.25, 0, 1)
    save('sand', colorize(t, (176, 150, 112), (232, 210, 166)), normal_from(h, 3.0))
    # dust (regolith): very fine grain, small pebbles and tiny craters
    grain = rng.random((S, S))
    h = fbm(16, 5, 21) * 0.4 + fbm(64, 2, 24) * 0.3 + grain * 0.3
    pits = np.zeros((S, S))
    for _ in range(60):
        cx, cy, r = rng.random() * S, rng.random() * S, 3 + rng.random() * 14
        dx = (np.arange(S)[None, :] - cx + S / 2) % S - S / 2; dy = (np.arange(S)[:, None] - cy + S / 2) % S - S / 2
        d = np.sqrt(dx * dx + dy * dy) / r
        pits += np.where(d < 1, d * d - 1, np.where(d < 1.4, (1.4 - d) * 0.6, 0)) * 0.5
    h += pits * 0.4
    t = np.clip(fbm(4, 3, 22) * 0.45 + fbm(48, 3, 23) * 0.3 + grain * 0.35 + pits * 0.2 - 0.05, 0, 1)
    save('dust', colorize(t, (92, 90, 86), (176, 172, 164)), normal_from(h, 2.5))
    # ice: smooth blue-white with deep cracks and frost
    cr = np.abs(fbm(6, 4, 31) - 0.5)
    cracks = np.clip(1 - cr / 0.018, 0, 1) ** 3 * 0.45
    frost = fbm(24, 3, 32)
    h = fbm(3, 4, 33) * 0.5 - cracks * 0.5 + frost * 0.1
    t = np.clip(0.35 + fbm(3, 4, 34) * 0.45 + frost * 0.25 - cracks * 0.5, 0, 1)
    save('ice', colorize(t, (88, 132, 170), (222, 238, 248)), normal_from(h, 4.0))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    photo(sys.argv[1])
    procedural()
