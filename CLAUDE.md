# CLAUDE.md

Perun rebuilds Paul Falstad's CircuitJS1 as a TypeScript web app with a new UI and a JSON
theme system. Simulation behaviour and the circuit file formats stay compatible with upstream.
The full plan is [docs/PLAN.md](docs/PLAN.md); the owner is Gady.

## Working rules (condensed from PLAN.md section 2)

- Read docs/PLAN.md before starting. Work phase by phase; a phase starts only when the previous
  phase's acceptance criteria pass. Check docs/PROGRESS.md for where things stand.
- `reference/circuitjs1/` is a read-only upstream submodule at the SHA in docs/UPSTREAM.md. Never edit
  it. Harness changes go in `tools/reference-patch/` and are applied at build time.
- Port simulation logic faithfully first, refactor second. Any behaviour change needs a golden test
  showing why and an entry in docs/DEVIATIONS.md.
- Do not port drawing or UI code line by line. Use upstream only to learn geometry and what is shown.
- Every ported file starts with a header naming the upstream source file(s), the upstream commit SHA,
  and the GPL notice (template below).
- Update docs/PROGRESS.md at the end of every session: done, next, open issues.
- Commit at each milestone with conventional commit messages. `pnpm check` (typecheck, lint, format,
  unit tests) must pass before each commit.
- If a fact in PLAN.md section 4 marked [I] or [G] turns out wrong, correct it there.
- Ask the owner before changing any decision in PLAN.md section 3.

## Layout and boundaries

```
packages/engine    MNA engine. No DOM (tsconfig lib has no DOM). Depends on nothing.
packages/elements  element sim classes, property schemas, views, Painter interface. -> engine
packages/format    circuit text/XML and URL parse/serialize. -> elements
packages/theme     theme schema, validation, built-ins. Depends on nothing.
packages/render    Canvas 2D Painter, scene, hit testing. -> elements, theme
packages/app       UI shell. -> everything
tools/             reference build and patch, golden harness, recon scripts, ESLint rules
fixtures/golden/   recorded reference traces (JSON), one per tools/golden/manifest.json entry
docs/              PLAN, PROGRESS, DEVIATIONS, UPSTREAM, ELEMENTS, ENGINE-NOTES, THEMES
```

ESLint enforces the dependency direction (`no-restricted-imports`, see eslint.config.js) and bans
color literals everywhere except `packages/theme/src/builtins/` (`local/no-color-literals`). Views
draw with semantic roles; the renderer maps roles to theme colors.

## Live values on screen (owner's rule)

Every displayed value that changes while the simulation runs (scope readouts, cursor boxes, the
time readout, info boxes) gets a fixed character budget covering the sign, integer digits,
decimals, unit prefix and unit, padded with spaces and drawn in the monospace font, so the text
never shifts or flickers as digits, the minus sign or the prefix change. Reserve the minus sign's
width even for positive values. Use `getFixedUnitText` (packages/elements/src/view/units.ts) or
the same pattern; HTML readouts need `white-space: pre` so the padding survives.

## Commands

```sh
pnpm install
pnpm check              # typecheck + lint + format:check + unit tests
pnpm test:e2e           # Playwright (set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a local Chromium)
pnpm reference:build    # build upstream in Docker into .reference-site/
pnpm reference:serve    # serve it at http://localhost:8000/circuitjs.html
pnpm golden:record      # record fixtures/golden/ from the reference build (tools/golden/README.md)
pnpm golden:check       # re-record in memory, fail if any fixture differs
pnpm golden:compare     # compare an engine against the fixtures (--engine next, or stub)
pnpm theme:docs         # regenerate docs/theme.schema.json and the key table in docs/THEMES.md
pnpm golden:scopes      # record how upstream restores the scopes of every bundled example
```

## Ported file header

```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 <path/to/File.java> at <upstream SHA>.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.
```

## Porting reminders (PLAN.md section 8, docs/ENGINE-NOTES.md)

Java int math (`Math.trunc`, `| 0`), `Double.toString` formatting, exact `java.util.Random` (op-amp
and gate convergence use it), zero-initialised typed arrays, explicit context instead of global
`CirSim`, identical element and node ordering, `Math.exp`/`Math.pow` last-bit differences.
