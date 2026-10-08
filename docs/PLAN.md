---
title: CircuitJS Rewrite, Plan of Approach
tags: [project/perun, plan]
status: draft
created: 2026-10-02
owner: Gady
---

# CircuitJS Rewrite: Plan of Approach

Name: Perun (renamed on 2026-10-08 from the working name `circuitjs-next`; the repository and the GitHub Pages address still use `circuitsjs-next`)
Implementing agent: Claude Code. Owner and reviewer: Gady.

## 1. Goal

Rebuild Paul Falstad's CircuitJS1 as a modern TypeScript web app with a new UI and a first-class theming system, while keeping simulation behaviour and the circuit file format compatible with upstream.

### In scope
- TypeScript port of the simulation engine, behaviourally equivalent to upstream (proven by golden tests)
- New canvas renderer and UI
- Theme system: JSON themes, built-in set, editor, import/export, URL sharing
- Read and write the upstream circuit text format and URL links, so existing circuits and examples load

### Out of scope (for now)
- New simulation features (SPICE import and the like). Exceptions: AC analysis by transient sweep (Phase 10, added by the owner on 2026-10-06), parameter sweeps, Monte Carlo tolerance runs and the DC operating point table (Phases 11 to 13, the owner picked "everything" on 2026-10-06), and temperature effects and subcircuit parameters (Phases 15 and 16, the owner picked "Core leftovers" on 2026-10-07)
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
| Engine strategy | Hand port to TS, using upstream's own TypeScript port (`dev-ts` branch) as the porting source, restructured into our packages. Golden references still come from the Java `master` build. No GWT, no transpiler | Decided (changed 2026-10-02 by owner, was: hand port the Java engine) |
| Rendering | Canvas 2D behind a painter interface (WebGL possible later) | Decided |
| UI framework | React with headless components (Radix) | Decided (confirmed 2026-10-02 by owner) |
| UI state | Zustand for UI state. Circuit model owned by engine/elements packages | Decided (confirmed 2026-10-02 by owner) |
| Engine thread | Main thread first. Engine package stays DOM-free so it can move to a Web Worker | Decided (confirmed 2026-10-02 by owner: main thread; Phase 9 profiling found no need for a worker, see ENGINE-NOTES.md section 13) |
| License | GPL-2.0-or-later, keep upstream credits | Required |
| Dev environment | Linux, Node LTS, Docker for the reference build | Default |

Why hand port instead of keeping GWT: it removes the Java toolchain from the product, allows clean module boundaries and real types. The cost is manual upstream sync (section 9).

## 4. Known facts and assumptions about upstream

Legend: [V] verified in upstream docs or repo, [I] inferred, [G] guess. Phase 0 must confirm or correct every [I] and [G].

Phase 0 checked every item below against upstream at `5a707168` (2026-09-23). File references are to `src/com/lushprojects/circuitjs1/client/` unless stated. Details: `docs/ENGINE-NOTES.md`, `docs/ELEMENTS.md`, `docs/UPSTREAM.md`.

- [V] Upstream is `github.com/pfalstad/circuitjs1`, actively maintained by Paul Falstad. `sharpie7/circuitjs1` is Iain Sharp's original GWT port and is no longer the main line.
- [V] License is GPL version 2 or (at your option) any later version.
- [V, corrected in Phase 0] Java compiled to JS with GWT 2.8.2. The current build is Gradle 8.7 (`build.gradle`, `gradle compileGwt makeSite`; Gradle 9 breaks the GWT plugin) on JDK 8. There is no Maven build any more. `tools/reference-build/` builds it in a pinned Docker image.
- [V, new in Phase 0] Upstream is porting CircuitJS1 to TypeScript itself on the `dev-ts` branch: 174 commits since 2026-05-24, last 2026-09-29, no Java left, 262 `.ts` files, built with Vite and tested with Vitest. It is a 1:1 port (simulation, drawing and editing still mixed per class) and is not on `master` yet. On 2026-10-02 the owner chose to port from `dev-ts` (section 3).
- [V] JS interface: `window.CircuitJS1`, available after the `oncircuitjsloaded` callback. Methods include `setSimRunning`, `isRunning`, `getTime`, `getTimeStep`, `getMaxTimeStep`, `setMaxTimeStep`, `getNodeVoltage(label)` (labeled nodes only), `setExtVoltage`, `getElements`, `getCircuitAsSVG`. Same origin is required when driven from an iframe. Phase 0 adds: `setTimeStep`, `exportCircuit`, `importCircuit(text, subcircuitsOnly)`, and hooks `onupdate`, `onanalyze`, `ontimestep`, `onsvgrendered` (`JSInterface.java:52-96`). There is no single-step API, but calling `setSimRunning(false)` from `ontimestep` stops after the current step (`SimulationManager.java:1441`). Phase 1 found this not deterministic enough (`runCircuit` paces itself by wall-clock time), so the reference patch adds an exact `harness.step(n)` plus seeding and a full state dump (`tools/reference-patch/README.md`). Also, the `cct=` URL parameter mangles XML circuits (attribute quotes are lost), so XML must be loaded with `importCircuit`.
- [V] URL parameters include `cct=` (circuit text), `startCircuit=`, `startCircuitLink=`, `whiteBackground=`, `conventionalCurrent=`, `euroResistors=`, `usResistors=`. Full list (24): `cct`, `ctz`, `startCircuit`, `startLabel`, `startCircuitLink`, `running`, `positiveColor`, `negativeColor`, `neutralColor`, `selectColor`, `currentColor`, `mouseMode` (`CirSim.java:185-202`); `euroResistors`, `IECGates`, `usResistors`, `showOhm`, `hideSidebar`, `hideMenu`, `whiteBackground`, `conventionalCurrent`, `editable`, `mouseWheelEdit`, `hideInfoBox` (`UIManager.java:134-152`); `lang` (`circuitjs1.java:70`).
- [V, was I] `ctz=` is lz-string `compressToEncodedURIComponent` (`ExportAsUrlDialog.java:91-101`), read with `decompressFromEncodedURIComponent` (`CirSim.java:138-140`). The payload is now XML (see the format item).
- [V, was I, corrected] Engine is Modified Nodal Analysis with LU factorization and per-timestep iteration for nonlinear elements, but the engine moved out of `CirSim` into `SimulationManager.java` (`analyzeCircuit`, `preStampCircuit`, `stampCircuit`, `runCircuit`, `lu_factor`, `lu_solve`), with per-element `stamp()`, `startIteration()`, `doStep()`, `stepFinished()`, `calculateCurrent()`. Upstream's `INTERNALS.md` is out of date: `simplifyMatrix`/`RowInfo` are gone. Instead, groups of nodes connected only through ground get separate matrices (`calculateClosures`), and matrices of 150 or more rows use a sparse LU (`SPARSE_THRESHOLD`, `SimulationManager.java:46`); smaller ones use dense Crout LU.
- [V, was I] Element classes mix simulation (`stamp`, `doStep`), drawing (`draw`, `setPoints`), editing (`getEditInfo`, `setEditValue`) and serialization (`dump`, `getDumpType`, plus `dumpXml`, `undumpXml`, `getXmlDumpType`) in `CircuitElm.java`.
- [V, was I, corrected] There are two circuit formats. The legacy text format is as guessed: a `$` options line, then `type x1 y1 x2 y2 flags params` per element, scopes as `o` lines, plus `h` (hint), `!` (custom logic model), `34`/`32` (diode/transistor models), `38` (slider), `.` (subcircuit model) records; a type token starting with a digit is parsed as a number, so `82` and `R` are the same element (`CircuitLoader.java:142-200`). But upstream now **saves XML** by default: `<cir f ts ic cb pb vr mts>` with one child element per circuit element (`CirSim.dumpCircuit`, `XMLSerializer.java`). The loader treats text starting with `<` as XML (`CircuitLoader.java:74`). The `format` package must read both and write XML to round-trip with current upstream. Phase 2 writes XML only, as upstream master does (some master elements, such as `VoltageElm`, no longer have a text `dump()`).
- [V, was I, corrected] Example circuits live in `src/com/lushprojects/circuitjs1/public/circuits/` (373 files: 335 text, 38 XML), indexed by `src/com/lushprojects/circuitjs1/public/setuplist.txt`. The build serves them from `circuitjs1/circuits/`. `war/` has none.
- [V, was I, corrected] An adaptive timestep exists but is opt-in (options flag bit 64, `CircuitLoader.java:277`) and only reacts to non-convergence: halve down to `minTimeStep`, double back up to `maxTimeStep` after 3 good steps (`SimulationManager.java:1314-1320`, `1390-1407`). There is no error-based step control.
- [V, was I] UI has separate simulation speed (0 to 260) and current speed (1 to 100) sliders, plus a power brightness slider (`UIManager.java:330-338`). Steps per second are `160 * 0.1 * exp((speed - 61) / 24)` (`CirSim.java:325`, `SimulationManager.java:1291`).
- [V, was G] 154 element classes (151 concrete, 3 abstract), 124 distinct text dump types; 10 concrete classes are XML only. Dump types are registered at runtime from the menus (`CirSim.register`), and a build-time generated factory creates elements by class name.
- [V, new in Phase 0] Upstream randomness is unseeded `java.util.Random` (`CirSim.java:215`) and is used on the ideal op-amp's convergence path (`OpAmpElm.java:176-179`), in gate oscillation breaking (`GateElm.java:352`) and in the noise waveform (`VoltageElm.java:165`). The Phase 1 reference patch seeds it (`harness.setSeed`). In the golden set only the noise waveform changes with the seed; the op-amp circuits gave identical traces for seeds 1, 2 and 3, because `getrand` there only picks between paths that converge to the same values.
- [V, new in Phase 0] Upstream's own test runner (`TestManager.java`) is commented out, but `auto-tests/*.txt` holds 7 XML circuits with expected scope data and `<switchevent>` timings, useful as extra golden references.

## 5. Architecture

### Repo layout

```
perun/
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
- URL: `?theme=<base64url(deflate(json))>` (raw DEFLATE of the theme minus what its base already has; see docs/THEMES.md). The app shows a preview with Apply and Save buttons and never persists a theme automatically.
- Combined link: circuit plus theme in one URL, with an opt-in "use sender's theme" flag.
- Local theme library in IndexedDB.
- Theme editor: live preview on a fixed sample circuit, WCAG contrast warnings for text and for voltage colors against the background.

## 7. Phases

### Phase 0: Setup and reconnaissance
- [x] Init the monorepo per section 5: strict TS, ESLint (including boundary and no-color-literal rules), Prettier, Vitest, Playwright, GitHub Actions CI running typecheck, lint and tests.
- [x] Add upstream as a submodule at `reference/circuitjs1`, record the SHA in `docs/UPSTREAM.md`.
- [x] Build the reference app in a pinned Docker image (JDK and Maven versions that work) and serve it locally. Document the command. Fallback: the prebuilt `war` directory from the official offline distribution.
- [x] Study upstream. Confirm or correct every [I] and [G] in section 4.
- [x] Write `docs/ELEMENTS.md`: one row per element class with class name, dump type, linear or nonlinear, special engine hooks, tier (1, 2 or 3), port status.
- [x] Write `docs/ENGINE-NOTES.md`: walkthrough of the sim loop with file and method references (analysis, node numbering, stamping, matrix simplification, iteration and convergence, timestep control, current calculation).
- [x] Create `CLAUDE.md`.

Acceptance: CI green on empty packages. Reference app runs locally. ELEMENTS.md complete. Section 4 updated.

### Phase 1: Golden test harness
- [x] Playwright script that loads the reference build, loads a circuit (via `cct=` or the JS API), runs it, samples node voltages plus element voltages and currents at fixed sim times, and writes `fixtures/golden/<name>.json` including upstream SHA and timestep settings.
- [x] Get deterministic sampling. If the JS API cannot step deterministically, add a minimal patch exposing e.g. `stepSim(n)` and a dump of all node voltages. Keep the patch in `tools/reference-patch/` and document it.
- [x] Reference circuit set: small unit circuits for every tier-1 element (RC, RL, RLC, divider, rectifier, BJT amplifier, MOSFET switch, inverting op-amp, and so on) plus selected upstream examples.
- [x] Comparator: per-node absolute and relative tolerance, reports the first divergence time and the worst node.

Acceptance: `pnpm golden:record` is reproducible (two runs give identical fixtures). `pnpm golden:compare` runs against a stub engine and reports failures cleanly.

### Phase 2: Engine core and linear elements
- [x] Port matrix and LU solver, circuit analysis, node numbering, voltage source handling, matrix simplification.
- [x] Port linear tier-1 elements: wire, ground, resistor, capacitor, inductor, DC and AC voltage source, current source, switch, labeled node, voltmeter/probe.
- [x] `format`: parse and serialize upstream circuit text for these elements, with round-trip tests. (Reads text and XML, writes XML as upstream master does.)
- [x] Headless runner `runCircuit(text, tEnd, sampleTimes)` producing the same shape as golden fixtures. (Steps by count, as the golden harness does: `runCircuit(text, { seed, stepsPerSample, samples })`.)

Acceptance: all linear golden circuits match within tolerance. Round-trip serialization is byte-identical for supported elements, or the difference is listed in DEVIATIONS.md.

### Phase 3: Nonlinear elements and convergence
- [x] Port iteration, convergence checks and timestep control. (The run loop came with Phase 2; Phase 3 adds golden circuits that halve the timestep and that fail to converge.)
- [x] Port remaining tier-1 elements: diode, LED, zener, BJT NPN/PNP, MOSFET N/P, ideal op-amp, potentiometer, push switch. (Also the rail, which tier-1 circuits use, text labels for load and save, and the diode, transistor and MOSFET model records.)

Acceptance: all tier-1 golden circuits pass. Non-convergence ends in the same error state as upstream, never a hang.

### Phase 4: Renderer and viewer
- [x] Confirm UI framework and worker decision with the owner.
- [x] Theme package v1 with Classic and Dark built-ins (full editor comes in Phase 7).
- [x] Canvas renderer: grid, pan and zoom, HiDPI, tier-1 element views, voltage coloring, current dots, labels and values.
- [x] App shell: open circuit from file, URL or example list. Run, pause, reset. Speed and current speed sliders.

Acceptance: upstream links using tier-1 elements load and animate correctly. Switching Classic and Dark at runtime restyles everything without reload. No-color-literal lint passes.

### Phase 5: Editor
- [x] Element palette with search, placement, drag, rotate, flip, wire drawing with grid snap, selection and multi-select, move, delete, copy/paste, undo/redo (command pattern).
- [x] Property panel generated from element schemas, editable while running.
- [x] Keyboard shortcuts, keeping upstream ones where sensible.
- [x] Save and export to file, `cct=` and `ctz=` links, compatible with upstream.

Acceptance: a circuit built in the new app opens correctly in upstream, and the reverse. Playwright e2e tests cover core editing flows.

### Phase 6: Scopes and measurement
- [x] Scopes: voltage, current and power traces, multiple traces, stacking, scale controls, X-Y mode, all themed.
- [x] Hover info (voltage, current, power) and measurement tools.

Acceptance: scope `o` lines from upstream files restore equivalent scopes.

### Phase 7: Theme system complete
- [x] All built-ins, theme editor with live preview and contrast warnings, theme library, import/export, URL sharing, combined circuit plus theme links.
- [x] `docs/THEMES.md` with schema reference and the generated JSON Schema.

Acceptance: success criterion 3 holds. Fuzz test of the theme decoder with malformed input shows no crash and no injection path.

### Phase 8: Element coverage
- [ ] Tier 2 (logic gates, flip-flops, counters, 555, transformer, relay, ADC/DAC, sweep and noise sources, and similar), then tier 3, in ELEMENTS.md order. Every element ships with sim, view, schema and a golden circuit.
- [ ] Subcircuits and custom composite elements.
- [ ] Bulk run of all upstream example circuits with a pass rate report.

Acceptance: at least 95% of upstream examples pass golden compare (threshold to be tuned with the owner). Failures listed in DEVIATIONS.md.

### Phase 9: Polish and release
- [x] Profile performance (matrix size, allocations per step). Move the engine to a worker if decided. (Stays on the main thread: ENGINE-NOTES.md section 13.)
- [x] Accessibility pass, responsive layout, PWA offline support.
- [x] Teaching tools: a pencil for drawing on the circuit and a laser pointer whose trail fades out, for highlighting things while teaching. Work with mouse, pen and touch. Annotations are a temporary overlay with a clear button and are not saved in the circuit file, so the upstream format stays untouched. (Added 2026-10-04 by owner; built 2026-10-05: the pencil button in the bottom bar.)
- [x] Optional i18n hooks. (Options > Language, using upstream's locale catalogs; `pnpm i18n` reports coverage.)
- [x] README, credits, GPL notices, About dialog.

### Phase 10: AC analysis (Bode plot)
Added 2026-10-06 by owner (picked as the first core simulator feature after Phase 9).
- [x] Frequency sweep by transient simulation: for each log-spaced frequency, the chosen voltage source plays a sine on a copy of the circuit, the existing engine runs until the output settles, and a one-period DFT of input and output gives gain and phase. No new element math and no small-signal solver, so it works for every ported element and shows nonlinear behaviour too.
- [x] The sweep never touches the running circuit or the engine; it runs in slices per animation frame (main thread, section 3) and can be stopped.
- [x] Dialog from Scopes > AC Analysis and from an element's context menu: input source, output (node, label, probe or voltage across a part), range, points per decade, amplitude; gain and phase plot on a log axis in scope theme colors, -3 dB markers, a cursor with fixed-width readouts, CSV export.

Acceptance: an RC low-pass matches the analytic gain within 0.05 dB and phase within 0.5° from 10 Hz to 100 kHz, and its -3 dB point within 2%. A series RLC band-pass peaks within 3% of its resonance with the right bandwidth. An inverting op-amp reads its gain and 180°. Golden tests unchanged. The UI keeps running while a sweep runs, in Dark and Classic.

### Phase 11: Parameter sweeps
Added 2026-10-06 by owner (the core features card: "Everything").
- [x] Run a copy of the circuit once per value of one numeric property of one part (a list, or a linear or log range), and overlay the runs. The live circuit, the engine and the golden tests are untouched; runs go in slices per animation frame and can be stopped.
- [x] Two measurements: a transient (an output's voltage or current from reset to a stop time) and an AC sweep (the Phase 10 Bode measurement per run).
- [x] Dialog from the Scopes menu and from an element's context menu (Sweep this value), with one trace per run in the scope theme's trace colors, a legend, a cursor with fixed-width readouts per run, and CSV export.

Acceptance: sweeping R in an RC step response gives each run's time constant within 2% of RC; sweeping C in an RC low-pass moves the -3 dB point as 1/(2πRC) within 2%. Golden tests unchanged. The UI keeps running during a sweep, in Dark and Classic.

### Phase 12: Monte Carlo tolerance runs
Added 2026-10-06 by owner, built on Phase 11.
- [x] Resistors, capacitors and inductors get a Tolerance property (none by default). It is saved as an extra XML attribute only when set, which upstream ignores (DEVIATIONS.md).
- [x] Monte Carlo mode in the sweep dialog: a run count, a seed and a distribution (uniform, or Gaussian with the tolerance at 3σ). Every toleranced part gets a random value per run from its own seeded generator, never the engine's, so normal runs and goldens stay identical. The nominal run is drawn on top of the spread, with min, mean and max readouts at the cursor.

Acceptance: the same seed gives the same runs; every drawn value stays within its tolerance (uniform); with no toleranced part the dialog says so. Golden tests unchanged, and a file with tolerances still opens upstream.

### Phase 13: DC operating point table
Added 2026-10-06 by owner.
- [x] A command that runs the engine's existing DC solve (capacitors open) on a copy of the circuit, and a table of node voltages (labeled nodes by name, others by a generated name) and each part's current and power, sortable, with fixed-width monospace values. Selecting a row highlights the node or part on the canvas.

Acceptance: a resistor divider and a transistor bias circuit match hand calculation; capacitors carry no DC current. Golden tests unchanged.

### Phase 14: Editor and export quick wins
Added 2026-10-06 by owner. No simulation or file format change.
- [x] Wires that stay attached: moving a part moves the wire ends on its posts (routed wires reroute), with an option to turn it off and a modifier to detach while dragging.
- [x] Export the schematic as SVG or PNG in the current theme, and a parts list (BOM) as CSV.
- [x] Full-resolution scope CSV export (every timestep in a window), with columns named after the parts' labels.

Acceptance: dragging a part in an example circuit keeps every attached wire connected, and undo restores it in one step; exported SVG opens in a browser and matches the canvas; the CSV has one row per timestep.

### Phase 15: Temperature effects
Added 2026-10-07 by owner (picked "Core leftovers": temperature and subcircuit parameters, SPICE import later).
- [x] A circuit temperature in Simulation settings (27 °C, SPICE's nominal temperature, by default), saved as an extra XML attribute only when it is not 27 °C (DEVIATIONS.md). The bottom bar shows it, in a fixed width, when it is not the default.
- [x] Diodes (and every part built on the diode junction: LEDs, Zeners, SCRs, the MOSFET body diodes, JFET gates), BJTs and MOSFETs follow it with SPICE's temperature equations and default coefficients: the thermal voltage, IS with EG = 1.11 eV and XTI = 3, a BJT's ISE and ISC, and a MOSFET's KP and threshold (level 1 with GAMMA = 0, PHI = 0.6). JFETs keep their threshold and beta, as SPICE's defaults do.
- [x] Resistors get an optional temperature coefficient in ppm/°C, saved only when set.
- [x] Temperature as a sweep parameter (Phase 11): Circuit temperature (°C) in the sweep dialog's part list, seeded with -20, 27 and 85 °C.

Acceptance: at 27 °C every example and golden simulates bit for bit as before (the engine reads upstream's own constants there). A diode at 1 mA drops about 2 mV per °C. Files still open upstream, at 27 °C.

### Phase 16: Subcircuit parameters
Added 2026-10-07 by owner, with Phase 15.
- [x] File > Parameters… (and Parameters on the subcircuit bar while a model is edited): named parameters with default values for the open circuit. Any number field binds to an expression of them, typed `{R*2}` in the property panel; the field shows the expression and its value.
- [x] A subcircuit made from the circuit takes its parameters. Each placed copy lists them in its properties and can set its own values; its parts are built with them. Nested subcircuits can bind their copy values to the outer model's parameters.
- [x] Saved as extra XML attributes upstream ignores, only when used (`prm` on the circuit and the model, `px` on a bound part, `pv` on a copy). A bound part also keeps its value at the defaults, so upstream runs every copy at the defaults (DEVIATIONS.md).

Acceptance: two copies of a divider subcircuit with different values of its lower resistor give the right voltages; parameters, bindings and copy values survive save, load and undo; a circuit without parameters saves exactly as before. Golden tests unchanged.

### Phase 17: Self-heating and ambient ramp
Added 2026-10-07 by owner (picked "Self-heating" on the card asking for temperature that changes while the circuit runs; it includes the ambient ramp).
- [x] Simulation settings can ramp the ambient temperature linearly to a set temperature over a set simulated time, then hold it. The bottom bar readout follows it live.
- [x] Self-heating (off by default): diodes, BJTs, MOSFETs and resistors each get their own temperature, heated by the power they dissipate and cooled to ambient through a thermal resistance with one time constant (an RC pole, integrated exactly per step). Their models run at that temperature, so a BJT at a fixed base voltage runs away and an emitter resistor stops it. A resistor with a temperature coefficient is stamped again once it moves 0.01 °C.
- [x] Each heating part's property panel shows its temperature live (fixed width) and its thermal resistance (°C/W, lower for a heatsink) and time constant. Defaults: 300 °C/W diode, 200 BJT, 62 MOSFET, 250 resistor, 10 ms (short, so heating shows within a short run).
- [x] Saved as extra XML attributes, only when set: `tramp` and `heat` on `<cir>`, `rth` and `tth` on a part (DEVIATIONS.md).
- [x] Options > Visualizations > Heat (off by default; display only): parts warmer than ambient glow in the theme's `circuit.heat` color, labeled with their temperature in a fixed width. With self-heating off the label is where the part would settle (ambient plus its average power times its thermal resistance). Gady (2026-10-07) kept the scope here: thermal realism (packages, heatsinks, burning parts) and more temperature-dependent components are parked in the ideas backlog.

Acceptance: with neither on, every example and golden simulates bit for bit as before. A resistor reaches ambient + P·Rth with its time constant; the BJT runaway and its emitter-resistor fix behave as above; a reset starts every part from ambient again.

### Phase 18: VCO temperature compensation
Added 2026-10-07 by owner (picked "All three" on the card asking for the VCO temperature-compensation kit; the goal behind temperature is a stable VCO).
- [x] A parameter sweep over a transient measures each run's frequency from the output's rising crossings of the middle of its range (10 % hysteresis, interpolated, after the first fifth of the run) and lists it under the plot: Hz with the change from a reference run, or Pitch (the nearest note and cents off it, A4 = 440 Hz, middle C = C4, with the change in cents). A temperature sweep references the 27 °C run and adds the drift, ppm/°C or cents/°C.
- [x] Capacitors get a Temperature coefficient (ppm/°C) with a Dielectric picker over it (C0G/NP0 0, P100 +100, polyester +400, polystyrene -150, polypropylene -200, N750, N1500, Custom); the capacitance is its value at 27 °C and the part is stamped again as its temperature moves. Electrolytics have none. Saved as the extra XML attribute `tc` only when set (DEVIATIONS.md).
- [x] Three example circuits of this port under Circuits > Temperature Compensation (`packages/app/examples/`, appended to upstream's list by the examples plugin): an exponential converter driving a simple sawtooth VCO at about 1 kHz, as one transistor, as a matched pair, and as the pair with a +3300 ppm/°C tempco resistor in the control divider. Swept from -20 to 60 °C they drift about +8 %/°C, +1.4 %/°C and +0.02 %/°C.

Acceptance: the goldens and all 373 upstream examples are unchanged (a capacitor coefficient of 0 changes nothing). The three examples oscillate at about 1 kHz at 27 °C and their drifts fall in that order.

### Phase 19: Live formula cards
Added 2026-10-07 by owner (picked "Formula cards" on the next-feature card; the first teaching idea in the backlog). Display only: no simulation or file format change.
- [x] Selecting a part shows a card under the property panel's live header with the law it follows, in symbols, then the live values put in, then the result, e.g. `I = V / R`, `= 5.000 V / 1.000 kΩ`, `= 5.000 mA`. Every value has a fixed width in the monospace font, and lines wrap only between values, so nothing shifts as they change. The card collapses to its title, remembered on this device.
- [x] Laws: resistors and lamps (Ohm's law and power, a lamp's live filament resistance), capacitors (Q = C·V and I = C·dV/dt), inductors (V = L·dI/dt, with saturation), diodes, LEDs and Zeners (Shockley's equation at the junction voltage, the series resistance step when the model has one, breakdown past half the Zener voltage), BJTs (β = Ic/Ib as measured, and Ie = Ib + Ic). Other parts show no card.
- [x] Gady asked for the suggested extras too (2026-10-07): MOSFETs by region (cutoff, the square law in saturation, the linear region, with channel-length modulation when the model has it; JFETs excluded), op-amps (Vd = V+ − V−, then Vout = A·Vd, or the output at its limit), transformers (V2 ≈ V1·N2/N1 against the measured V2) and sources (power delivered, P = V·I, for voltage and current sources and batteries).

Acceptance: each law's result matches the engine's value for that part (resistor, capacitor, inductor, diode, LED with series resistance, Zener in breakdown, BJT in its active region, MOSFET in each region, op-amp follower and open loop, loaded transformer, sources); token widths stay the same while a capacitor charges. Golden tests unchanged.

### Phase 20: Rewind and scrub
Added 2026-10-07 by owner (picked "Rewind and scrub" on the next-feature card; the second teaching idea in the backlog). Display only: the engine, the simulation and the file format are unchanged.
- [x] The app keeps the last 10 seconds of the run (running time; time paused does not count), frame by frame: every number the parts and scopes hold, stored as a full copy every 60 frames and only the changes in between, up to 48 MB. Only values that move as the circuit runs are shown again: what a simulation step changed, and a part's values changed while running (a switch flipped). The selection and the scopes' places on screen are left alone. A reset, a load, or adding or moving parts starts the history again.
- [x] A Rewind button in the bottom bar (next to Reset) opens a timeline bar under the canvas: Play/Pause, a slider over the kept frames, the shown frame's time in the fixed-width time format, Back to live, and Close. Dragging the slider (or its arrow keys) pauses the run and shows that frame: canvas, values, scopes, cards and the time readout. Play (or the bottom bar's Run, labelled Replay) replays from there at the pace it was recorded, then carries on with the run. Back to live, dragging to the end and closing the bar return to the run as it was.
- [x] An edit while a recorded frame is shown (a switch, a slider, a value, a move) carries on from that frame: the run continues from the past state with the edit, and the history starts again.
- [x] Phones: the bar fits portrait, and in landscape it sits under the canvas beside the right-side rail.

Acceptance: for every bundled example, each recorded frame is shown exactly as it was recorded (part voltages and currents, scope data, time), and after rewinding and returning the run continues bit for bit like one never rewound (packages/app/src/rewind/history.test.ts). Goldens and the 373 upstream examples are unchanged.

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
