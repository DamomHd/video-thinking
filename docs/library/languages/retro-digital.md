# retro-digital — pixels, terminals, glitch, brutalism

> 来源：huashu-motion v0.1.1（花叔，2026-10）原文，2026-10-26 收入本仓库。原文写给 HTML + GSAP 引擎：`OM.*` 和 `om` 命令在本工程里的对应见 `docs/library/engine-map.md`；本工程的改写与取舍见 `docs/library/adaptation.md`。


8-bit and dithered imagery, pixel dissolves, CRT scanlines, terminal output, ASCII, brutalist web
layouts, glitch cuts. Tavus's pixel-dissolve title over a retro office; dev-culture launches; games.

**Says:** *built by people who get the culture; playful edge; nostalgia.*

**Use when:** developer tools with personality, games, crypto, music, products for internet natives,
CLI tools. **Avoid when:** trust and calm are the brand (finance, health).

## Signature

1. Bitmap fonts or monospace; hard pixel edges (`image-rendering: pixelated`), dithering.
2. Pixel dissolve / scanline wipes / glitch slices on the beat.
3. Terminal typing with real commands and real output.
4. Limited palettes (CGA, Game Boy greens, a single neon on black).

## Build

Render at a low internal resolution and scale up crisply; glitch = seeded slice offsets for 2–4
frames; terminal output from the real CLI run, not invented.

## Breaks when

Glitch everywhere (unreadable); fake terminal output; retro texture on a premium brand.
