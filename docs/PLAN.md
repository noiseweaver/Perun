---
title: CircuitJS Rewrite, Plan of Approach
tags: [project/circuitjs-next, plan]
status: draft
created: 2026-10-02
owner: Gady
---

# CircuitJS Rewrite: Plan of Approach

Working name: `circuitjs-next` (placeholder, rename freely)
Implementing agent: Claude Code. Owner and reviewer: Gady.

## 1. Goal

Rebuild Paul Falstad's CircuitJS1 as a modern TypeScript web app with a new UI and a first-class theming system, while keeping simulation behaviour and the circuit file format compatible with upstream.

### In scope
- TypeScript port of the simulation engine, behaviourally equivalent to upstream (proven by golden tests)
- New canvas renderer and UI
- Theme system: JSON themes, built-in set, editor, import/export, URL sharing
- Read and write the upstream circuit text format and URL links, so existing circuits and examples load

### Out of scope (for now)
- New simulation features (AC analysis, SPICE import)
- Mobile-first layout (keep it usable on tablets, optimise later)
- Backend, accounts, hosted theme gallery
- Desktop wrapper (Tauri, optional later)

### Success criteria
1. Upstream example circuits load and simulate within tolerance of the reference build (target pass rate in Phase 8).
2. Zero hardcoded colors in render and UI code. Every color flows from the active theme.
3. A theme can be shared as a file or a single URL and applied by another user with no code changes.
4. Example circuits simulate at least as fast as upstream, with a 60 fps UI.

## 2. Working rules for Claude Code

- Read this whole file before starting. Work phase by phase. Do not start a phase until the previous phase's acceptance criteria pass.
- `reference/circuitjs1/` is a read-only clone of upstream at a pinned commit. Never edit it. The only exception is the harness patch from Phase 1, which lives in `tools/reference-patch/` and is applied at build time.
- Port simulation logic faithfully first, refactor second. Any behaviour change needs a golden test showing why, plus an entry in `docs/DEVIATIONS.md`.
- Do not port drawing or UI code line by line. Use upstream only to learn geometry and what information is shown.
- Every ported file starts with a header naming the upstream source file(s), the upstream commit SHA, and the GPL notice.
- Update `docs/PROGRESS.md` at the end of every session: done, next, open issues.
- Commit at each milestone using conventional commit messages. Typecheck, lint and unit tests must pass before each commit.
- If a fact in section 4 marked [I] or [G] turns out wrong, correct it in this file.
- Ask the owner before changing any decision in section 3.
- In Phase 0, create a `CLAUDE.md` that condenses this section.

## 3. Decisions

| Area | Decision | Status |
|---|---|---|
| Language | TypeScript, strict mode | Decided |
| Tooling | Vite, pnpm workspaces, Vitest, Playwright, ESLint, Prettier | Decided |
| Engine strategy | Hand port the Java engine to TS. No GWT, no transpiler | Decided |
| Rendering | Canvas 2D behind a painter interface (WebGL possible later) | Decided |
| UI framework | React with headless components (e.g. Radix) | Default, confirm before Phase 4 |
| UI state | Zustand for UI state. Circuit model owned by engine/elements packages | Default |
| Engine thread | Main thread first. Engine package stays DOM-free so it can move to a Web Worker | Decide in Phase 4 |
| License | GPL-2.0-or-later, keep upstream credits | Required |
| Dev environment | Linux, Node LTS, Docker for the reference build | Default |

Why hand port instead of keeping GWT: it removes the Java toolchain from the product, allows clean module boundaries and real types. The cost is manual upstream sync (section 9).

## 4. Known facts and assumptions about upstream

Legend: [V] verified in upstream docs or repo, [I] inferred, [G] guess. Phase 0 must confirm or correct every [I] and [G].

- [V] Upstream is `github.com/pfalstad/circuitjs1`, actively maintained by Paul Falstad. `sharpie7/circuitjs1` is Iain Sharp's original GWT port and is no longer the main line.
- [V] License is GPL version 2 or (at your option) any later version.
- [V] Java compiled to JS with GWT. A Maven build exists (`mvn clean install`, `mvn gwt:devmode`). Some forks document needing GWT 2.8.1 and JDK 8.
- [V] JS interface: `window.CircuitJS1`, available after the `oncircuitjsloaded` callback. Methods include `setSimRunning`, `isRunning`, `getTime`, `getTimeStep`, `getMaxTimeStep`, `setMaxTimeStep`, `getNodeVoltage(label)` (labeled nodes only), `setExtVoltage`, `getElements`, `getCircuitAsSVG`. Same origin is required when driven from an iframe.
- [V] URL parameters include `cct=` (circuit text), `startCircuit=`, `startCircuitLink=`, `whiteBackground=`, `conventionalCurrent=`, `euroResistors=`, `usResistors=`.
- [I] A compressed link format (`ctz=`) also exists, probably lz-string. Confirm the exact encoder.
- [I] Engine is Modified Nodal Analysis: elements stamp into a matrix, LU factorization solves it, nonlinear elements iterate per timestep until convergence. Core logic sits in `CirSim.java` (methods along the lines of `analyzeCircuit`, `stampCircuit`, `runCircuit`) plus per-element `stamp()`, `startIteration()`, `doStep()`, `stepFinished()`, `calculateCurrent()`.
- [I] Element classes mix simulation, drawing (`draw`, `setPoints`), editing (`getEditInfo`, `setEditValue`) and serialization (`dump`, `getDumpType`).
- [I] Circuit text format: first line starts with `$` and holds sim options. Then one line per element: dump type, x1 y1 x2 y2, flags, element parameters. Scopes are `o` lines.
- [I] Example circuits live under `war/circuits/` with an index file (`setuplist.txt`).
- [I] Recent upstream versions use an adaptive timestep (suggested by `setMaxTimeStep`).
- [I] UI has separate simulation speed and current speed sliders.
- [G] Roughly 150 to 250 element types.

## 5. Architecture

### Repo layout

```
circuitjs-next/
  reference/circuitjs1/        read-only upstream (git submodule, pinned SHA)
  packages/
    engine/      matrix, solver, sim loop, SimElement interface. No DOM (tsconfig lib without DOM)
    elements/    per element: sim class, property schema, view. Defines the Painter interface
    format/      circuit text and URL parse/serialize, uses the element registry
    theme/       schema, validation, built-ins, encode/decode, CSS variable bridge
    render/      Canvas implementation of Painter, scene drawing, hit testing, HiDPI
    app/         UI shell, editor, panels, scopes, theme editor
  tools/
    golden/            Playwright harness against the reference build
    reference-patch/   minimal patch for deterministic stepping (only if needed)
  fixtures/golden/     recorded reference traces (JSON)
  docs/                PROGRESS.md, DEVIATIONS.md, UPSTREAM.md, ELEMENTS.md, ENGINE-NOTES.md, THEMES.md
```

Dependency direction (enforce with dependency-cruiser or eslint-plugin-boundaries):
- `engine` depends on nothing
- `elements` depends on `engine`
- `format` depends on `elements`
- `theme` depends on nothing
- `render` depends on `elements` and `theme`
- `app` depends on everything

### Element split

Each upstream element class becomes one definition with separated concerns:

```ts
export const ResistorDef: ElementDef<ResistorProps> = {
  dumpType: 'r',                  // must match upstream exactly
  name: 'Resistor',
  category: 'passive',
  props: {
    resistance: { kind: 'number', unit: 'Ω', default: 1000, min: 0 },
  },
  createSim: (props, ctx) => new ResistorSim(props, ctx), // stamp, doStep, current
  view: ResistorView,             // geometry, posts, draw(painter, state)
  // serialization derives from props order, with per-element overrides for upstream quirks
};
```

The property panel and serialization are generated from `props`, so new elements need no UI code.

### Rendering and theming contract

- Views never receive colors. They draw with semantic roles: `painter.stroke({ role: 'component' })`, `painter.wire({ voltage })`, `painter.text({ role: 'label' })`.
- The renderer maps role (and voltage) to a color using the active theme. Voltage color interpolates between the theme's negative, zero and positive stops.
- Lint rule: no color literals (hex, `rgb(`, `hsl(`, CSS named colors in strings) anywhere except `packages/theme/src/builtins/`.
- Current dot animation is computed in the renderer from element currents supplied by the engine.

### Sim loop

- Engine exposes `step(budget)` plus a read-only snapshot of node voltages and element currents.
- App calls it once per animation frame, scaled by the speed setting, matching upstream semantics.
- Engine owns no timers and no DOM, so a later move into a Web Worker only changes the app wiring.

## 6. Theme system

### Schema v1 (example)

```json
{
  "schemaVersion": 1,
  "meta": { "name": "Night Bench", "author": "gady", "description": "Low glare dark theme", "base": "dark" },
  "canvas": { "background": "#1e222a", "grid": "#2a2f3a", "gridMajor": "#343a47" },
  "circuit": {
    "voltage": { "negative": "#e06c75", "zero": "#7f848e", "positive": "#98c379" },
    "currentDot": "#e5c07b",
    "component": "#c8ccd4",
    "selection": "#61afef",
    "hover": "#56b6c2",
    "post": "#c8ccd4",
    "text": "#c8ccd4",
    "label": "#abb2bf"
  },
  "scope": {
    "background": "#16191f",
    "grid": "#2a2f3a",
    "traces": ["#98c379", "#61afef", "#e5c07b", "#c678dd", "#e06c75"]
  },
  "ui": {
    "surface": "#21252b",
    "surfaceAlt": "#282c34",
    "border": "#3b4048",
    "text": "#d7dae0",
    "textMuted": "#8b919c",
    "accent": "#61afef",
    "danger": "#e06c75"
  },
  "style": { "strokeWidth": 2, "dotRadius": 2.5, "font": "Inter, system-ui, sans-serif", "monoFont": "JetBrains Mono, monospace" }
}
```

### Rules
- Missing keys fall back to the `base` built-in (light or dark), so partial themes are valid and stay small.
- Validate with zod: colors must parse as hex, rgb(a) or hsl(a). Strings are length capped, unknown keys are dropped, total size capped (e.g. 16 KB).
- Themes are data only: no raw CSS, no URLs, no remote fonts (font is a family name with fallbacks).
- UI chrome gets tokens as CSS custom properties, set via `style.setProperty` only after validation.
- Symbol style (IEC vs ANSI resistors) and conventional current direction are user settings, not theme properties.
- Generate a JSON Schema from the zod schema for third-party theme authors.

### Built-ins
Classic (matches the upstream look), Light, Dark, High Contrast, Colorblind Safe (blue/orange voltage gradient instead of green/red).

### Sharing
- Export and import `*.theme.json` files.
- URL: `?theme=<base64url(deflate(json))>`. The app shows a preview with Apply and Save buttons and never persists a theme automatically.
- Combined link: circuit plus theme in one URL, with an opt-in "use sender's theme" flag.
- Local theme library in IndexedDB.
- Theme editor: live preview on a fixed sample circuit, WCAG contrast warnings for text and for voltage colors against the background.

## 7. Phases

### Phase 0: Setup and reconnaissance
- [ ] Init the monorepo per section 5: strict TS, ESLint (including boundary and no-color-literal rules), Prettier, Vitest, Playwright, GitHub Actions CI running typecheck, lint and tests.
- [ ] Add upstream as a submodule at `reference/circuitjs1`, record the SHA in `docs/UPSTREAM.md`.
- [ ] Build the reference app in a pinned Docker image (JDK and Maven versions that work) and serve it locally. Document the command. Fallback: the prebuilt `war` directory from the official offline distribution.
- [ ] Study upstream. Confirm or correct every [I] and [G] in section 4.
- [ ] Write `docs/ELEMENTS.md`: one row per element class with class name, dump type, linear or nonlinear, special engine hooks, tier (1, 2 or 3), port status.
- [ ] Write `docs/ENGINE-NOTES.md`: walkthrough of the sim loop with file and method references (analysis, node numbering, stamping, matrix simplification, iteration and convergence, timestep control, current calculation).
- [ ] Create `CLAUDE.md`.

Acceptance: CI green on empty packages. Reference app runs locally. ELEMENTS.md complete. Section 4 updated.

### Phase 1: Golden test harness
- [ ] Playwright script that loads the reference build, loads a circuit (via `cct=` or the JS API), runs it, samples node voltages plus element voltages and currents at fixed sim times, and writes `fixtures/golden/<name>.json` including upstream SHA and timestep settings.
- [ ] Get deterministic sampling. If the JS API cannot step deterministically, add a minimal patch exposing e.g. `stepSim(n)` and a dump of all node voltages. Keep the patch in `tools/reference-patch/` and document it.
- [ ] Reference circuit set: small unit circuits for every tier-1 element (RC, RL, RLC, divider, rectifier, BJT amplifier, MOSFET switch, inverting op-amp, and so on) plus selected upstream examples.
- [ ] Comparator: per-node absolute and relative tolerance, reports the first divergence time and the worst node.

Acceptance: `pnpm golden:record` is reproducible (two runs give identical fixtures). `pnpm golden:compare` runs against a stub engine and reports failures cleanly.

### Phase 2: Engine core and linear elements
- [ ] Port matrix and LU solver, circuit analysis, node numbering, voltage source handling, matrix simplification.
- [ ] Port linear tier-1 elements: wire, ground, resistor, capacitor, inductor, DC and AC voltage source, current source, switch, labeled node, voltmeter/probe.
- [ ] `format`: parse and serialize upstream circuit text for these elements, with round-trip tests.
- [ ] Headless runner `runCircuit(text, tEnd, sampleTimes)` producing the same shape as golden fixtures.

Acceptance: all linear golden circuits match within tolerance. Round-trip serialization is byte-identical for supported elements, or the difference is listed in DEVIATIONS.md.

### Phase 3: Nonlinear elements and convergence
- [ ] Port iteration, convergence checks and timestep control.
- [ ] Port remaining tier-1 elements: diode, LED, zener, BJT NPN/PNP, MOSFET N/P, ideal op-amp, potentiometer, push switch.

Acceptance: all tier-1 golden circuits pass. Non-convergence ends in the same error state as upstream, never a hang.

### Phase 4: Renderer and viewer
- [ ] Confirm UI framework and worker decision with the owner.
- [ ] Theme package v1 with Classic and Dark built-ins (full editor comes in Phase 7).
- [ ] Canvas renderer: grid, pan and zoom, HiDPI, tier-1 element views, voltage coloring, current dots, labels and values.
- [ ] App shell: open circuit from file, URL or example list. Run, pause, reset. Speed and current speed sliders.

Acceptance: upstream links using tier-1 elements load and animate correctly. Switching Classic and Dark at runtime restyles everything without reload. No-color-literal lint passes.

### Phase 5: Editor
- [ ] Element palette with search, placement, drag, rotate, flip, wire drawing with grid snap, selection and multi-select, move, delete, copy/paste, undo/redo (command pattern).
- [ ] Property panel generated from element schemas, editable while running.
- [ ] Keyboard shortcuts, keeping upstream ones where sensible.
- [ ] Save and export to file, `cct=` and `ctz=` links, compatible with upstream.

Acceptance: a circuit built in the new app opens correctly in upstream, and the reverse. Playwright e2e tests cover core editing flows.

### Phase 6: Scopes and measurement
- [ ] Scopes: voltage, current and power traces, multiple traces, stacking, scale controls, X-Y mode, all themed.
- [ ] Hover info (voltage, current, power) and measurement tools.

Acceptance: scope `o` lines from upstream files restore equivalent scopes.

### Phase 7: Theme system complete
- [ ] All built-ins, theme editor with live preview and contrast warnings, theme library, import/export, URL sharing, combined circuit plus theme links.
- [ ] `docs/THEMES.md` with schema reference and the generated JSON Schema.

Acceptance: success criterion 3 holds. Fuzz test of the theme decoder with malformed input shows no crash and no injection path.

### Phase 8: Element coverage
- [ ] Tier 2 (logic gates, flip-flops, counters, 555, transformer, relay, ADC/DAC, sweep and noise sources, and similar), then tier 3, in ELEMENTS.md order. Every element ships with sim, view, schema and a golden circuit.
- [ ] Subcircuits and custom composite elements.
- [ ] Bulk run of all upstream example circuits with a pass rate report.

Acceptance: at least 95% of upstream examples pass golden compare (threshold to be tuned with the owner). Failures listed in DEVIATIONS.md.

### Phase 9: Polish and release
- [ ] Profile performance (matrix size, allocations per step). Move the engine to a worker if decided.
- [ ] Accessibility pass, responsive layout, PWA offline support.
- [ ] Optional i18n hooks.
- [ ] README, credits, GPL notices, About dialog.

## 8. Java to TypeScript porting pitfalls

- **Integer math.** Java `int` division truncates and overflows at 32 bits. JS does neither. Use `Math.trunc` or `| 0` wherever upstream relies on int behaviour. Check `(int)` casts, `%` on negatives, `>>` vs `>>>`, `char` arithmetic.
- **Number formatting.** Java `Double.toString` gives `1.0E-6` where JS gives `0.000001`. The serializer must reproduce upstream output for round trips, and the parser must accept both.
- **Randomness.** Noise and random elements use `java.util.Random`. Its 48-bit LCG is documented, so implement it exactly to keep golden tests deterministic.
- **Array initialization.** Java zero-initializes arrays. Use `Float64Array` and `Int32Array` or fill explicitly.
- **Global state.** Upstream elements likely reach into a global `CirSim` instance. Replace this with an explicit context object passed to each element.
- **Ordering.** Keep element and node ordering identical to upstream (`Vector` iteration order), since node numbering affects matrix layout and results.
- **Class hierarchies.** Port deep hierarchies (e.g. chip elements) as they are first. Flatten later only with tests in place.
- **Math functions.** `Math.exp` and `Math.pow` can differ in the last bits between Java and JS engines. Set golden tolerances with this in mind.

## 9. Upstream sync

- Pinned SHA lives in `docs/UPSTREAM.md`. Every ported file names its source file and SHA.
- Periodically (e.g. monthly): `git log <pinned-sha>..HEAD -- <engine and element paths>` in the reference repo, triage relevant changes into issues, port them, re-record goldens at the new SHA.

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Reference build toolchain breaks (old GWT/JDK) | Blocks golden tests | Pinned Docker image, fallback prebuilt `war` |
| Subtle simulation divergence | Wrong results, lost trust | Golden tests per element, divergence reports |
| UI scope creep | Delays engine work | Phases gated by acceptance criteria |
| Long tail of element types | Months of work | Tiering, bulk pass-rate tracking |
| Upstream drift | Stale engine | Sync process in section 9 |
| GPL obligations | Legal exposure | GPL-2.0-or-later, keep notices, publish source |

## 11. Rough effort

[G] Part-time owner with Claude Code doing most implementation:

| Phases | Estimate |
|---|---|
| 0 to 1 | 1 to 2 weeks |
| 2 to 3 | 3 to 6 weeks |
| 4 to 5 | 4 to 8 weeks |
| 6 to 7 | 3 to 5 weeks |
| 8 | 1 to 3 months (long tail) |

MVP (through Phase 7, tier-1 elements only): roughly 3 to 5 months.
