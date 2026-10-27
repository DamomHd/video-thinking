# generative-field — particles, fields, light (the model's mind)

> 来源：huashu-motion v0.1.1（花叔，2026-10）原文，2026-10-26 收入本仓库。原文写给 HTML + GSAP 引擎：`OM.*` 和 `om` 命令在本工程里的对应见 `docs/library/engine-map.md`；本工程的改写与取舍见 `docs/library/adaptation.md`。


Particles, flow fields, point clouds (the torus of dots), fluid, noise, shaders, glowing gradients:
abstract images of intelligence, scale and energy.

**Says:** *intelligence, emergence, scale, mood.* Feeling over facts.

**Use when:** AI model launches, music, brand mood pieces, backgrounds and loops, logo formations
from particles. **Avoid when:** it would replace showing the product; it is the AI-launch cliché if
used without a specific idea (blue particles forming a brain).

## Signature

1. One rule that generates the image (a field, a formation, an attractor) and evolves with time.
2. Particles that form meaningful shapes (the logo, a number, a word) and dissolve.
3. Restrained palette: one hue family + white; additive blending only where light is the point.
4. Determinism: seeded, a pure function of time.

## Camera · rhythm · easing

Slow drifts and dollies through the field; formations on the beat with `expo.inOut`.

## Sound

Ambient/electronic; granular textures; a swell when the formation resolves.

## Build

Canvas 2D for ≤ 20k particles, WebGL/Three.js points beyond; positions = f(seed, t), never accumulated
state. `OM.clock` to drive the draw.

## Breaks when

Random noise with no form; the cliché brain/galaxy; frame-rate dependent simulation (renders differ from preview).
