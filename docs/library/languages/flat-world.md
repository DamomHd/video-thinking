# flat-world — illustrated systems at scale (Kurzgesagt register)

> 来源：huashu-motion v0.1.1（花叔，2026-10）原文，2026-10-26 收入本仓库。原文写给 HTML + GSAP 引擎：`OM.*` 和 `om` 命令在本工程里的对应见 `docs/library/engine-map.md`；本工程的改写与取舍见 `docs/library/adaptation.md`。


A flat, saturated illustrated world with soft gradients, rim light and small characters, where the
camera travels across scales: inside a cell, across a city, out to the planet.

**Says:** *wonder; here is what's inside; how big/small this is.*

**Use when:** science, health, education, "what is inside X", calm narrated explainers, consumer
explainers with warmth. **Avoid when:** real products need to be seen as they are; real people/events.

## Signature

1. Flat shapes with one soft gradient and a rim light; thick rounded forms; a limited saturated palette.
2. Scale travel: push through one object into the next level.
3. Small characters as scale references and emotion.
4. Constant gentle secondary motion (floating, breathing) with clear primary actions.

## Camera · rhythm · easing

Slow parallax pans, deep push-throughs; `sine.inOut` drifts, `OM.spring(0.15)` for character actions.

## Sound

Ambient synth score, narration-led, soft foley.

## Build

`kurzgesagt` template, or SVG/Canvas scenes in a world container with `OM.camera` across scales.

## Breaks when

Generic stock-illustration look; too many outlines; characters without purpose.
