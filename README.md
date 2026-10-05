# circuitjs-next

An electronic circuit simulator that runs in the browser: a TypeScript rebuild of
[CircuitJS1](https://github.com/pfalstad/circuitjs1), Paul Falstad's simulator, with a new interface
and a JSON theme system. Simulation results and circuit files stay compatible with CircuitJS1: it
opens upstream's links and files, and what it saves opens in upstream.

## What it does

- Every element in upstream master (154 classes), including subcircuits, custom logic, routed wires
  and the model editors for diodes, transistors, MOSFETs, relays and subcircuit pin layouts.
- All 373 bundled upstream example circuits run and match upstream's results (`pnpm
golden:examples`, report in [docs/EXAMPLES.md](docs/EXAMPLES.md)).
- Scopes (docked, undocked, X-Y, FFT, triggers), live sliders, hover info with fixed-width values.
- Teaching tools: draw on the circuit with a pencil, point with a fading laser, erase; drawings are
  an overlay and never saved in the circuit file.
- Themes: Dark (default), Light, Classic, Classic Dots, High Contrast, Colorblind Safe and community
  themes, a live theme editor, and themes shared by link or file ([docs/THEMES.md](docs/THEMES.md)).
- Installable and offline (a PWA, including on iPad and iPhone), keyboard accessible, and translated
  with upstream's string catalogs (Options > Language).

## Using it

Open the built app in a browser. File > Open file reads CircuitJS1 text and XML circuits; Open link
reads `circuitjs.html?ctz=…` and `?cct=…` links. File > Export link writes one back, with an option
to include your theme. The palette on the left places components (click, then drag on the canvas);
selecting one shows its properties on the right.

## Development

Requires Node 22.13 or later and pnpm 10. Docker is needed only for the upstream reference build.

```sh
git clone --recurse-submodules https://github.com/noiseweaver/circuitsjs-next
cd circuitsjs-next
pnpm install
pnpm --filter @circuitjs-next/app dev     # http://localhost:5173
pnpm --filter @circuitjs-next/app build   # static site in packages/app/dist
pnpm check                                # typecheck, lint, format check, unit tests
pnpm test:e2e                             # Playwright browser tests
```

The built site is static: serve `packages/app/dist` from any web server. The example circuits and
translations are copied in from the `reference/circuitjs1` submodule at build time.

### Layout

```
packages/engine    MNA engine (no DOM)
packages/elements  element simulation, property schemas and views
packages/format    circuit text/XML and link parsing and saving
packages/theme     theme schema, validation and built-ins
packages/render    Canvas 2D drawing, scene and hit testing
packages/app       the interface (React, Radix, Zustand)
tools/             reference build, golden harness, benchmarks, theme docs, i18n coverage
fixtures/          recorded reference traces
```

### Compatibility testing

Upstream is pinned as a read-only submodule ([docs/UPSTREAM.md](docs/UPSTREAM.md)). `pnpm
reference:build` builds it in Docker, `pnpm golden:record` records reference traces from it, and
`pnpm golden:compare --engine next` checks this engine against them. Any intended difference from
upstream is listed in [docs/DEVIATIONS.md](docs/DEVIATIONS.md).

### Docs

[PLAN](docs/PLAN.md), [PROGRESS](docs/PROGRESS.md), [DEVIATIONS](docs/DEVIATIONS.md),
[ELEMENTS](docs/ELEMENTS.md), [ENGINE-NOTES](docs/ENGINE-NOTES.md), [THEMES](docs/THEMES.md),
[EXAMPLES](docs/EXAMPLES.md), [UPSTREAM](docs/UPSTREAM.md).

## License and credits

GPL-2.0-or-later, see [LICENSE](LICENSE). This program is free software: you can redistribute it
and/or modify it under the terms of the GNU General Public License as published by the Free
Software Foundation, either version 2 of the License, or (at your option) any later version. It is
distributed in the hope that it will be useful, but without any warranty.

CircuitJS1 is Copyright (C) Paul Falstad and Iain Sharp ([falstad.com](https://www.falstad.com/),
[lushprojects.com](http://lushprojects.com/)), with the contributors its README and About box
list; the app's About dialog repeats them. Files ported from CircuitJS1 name their upstream source
file and commit in their header. The example circuits and translation catalogs are upstream's.
LZString is (c) 2013 pieroxy. The bundled Roboto and JetBrains Mono fonts are under the SIL Open
Font License. The built app carries its own GPL text at `LICENSE.txt` and every bundled
third-party license at `third-party-licenses.txt`, both linked from File > About.
