# Progress

## 2026-10-02: Phase 3 (nonlinear elements and convergence)

### Done

- `packages/elements`: diode (`DiodeElm` plus the embeddable `Diode` junction used by the MOSFET
  body diodes), LED, zener, bipolar transistor (`TransistorElm`, `NTransistorElm`,
  `PTransistorElm`; Gummel-Poon with junction capacitance), MOSFET (`MosfetElm`, `NMosfetElm`,
  `PMosfetElm`; gate capacitance, body diodes, legacy flags), ideal op-amp (with the seeded
  `getrand` on its convergence path), rail (`R`), push switch, and text (`x`, load and save only;
  tier 2, but upstream examples use it). Ported from `master`, with the `dev-ts` node-voltage
  model; drawing geometry is limited to post positions.
- Device models: `DiodeModel`, `TransistorModel`, `MosfetModel` with upstream's built-ins, text
  records `34` and `32`, XML `<dm>`, `<tm>`, `<mm>`, legacy parameter models (`fwdrop=0.6`,
  `old-mosfet`), and save before the first element that uses them, as upstream does. They live in
  a `ModelLibrary` per `Simulation` (`modelsFor(sim)`), see docs/DEVIATIONS.md.
- Element types now get the simulation they join (`create(x, y, sim)`, `load(..., st, sim)`,
  `createCe(..., sim)`, `constructElement(name, x, y, sim)`), since model lookups happen while
  loading. Voltages read from a file (transistor junctions, op-amp inputs) are held on placeholder
  nodes and carried onto the real nodes by `setNode`, the dev-ts mechanism, so the first iteration
  starts where master's per-element copy would.
- Iteration, convergence checks and adaptive timestep were ported with the engine in Phase 2; no
  engine change was needed. Three new golden circuits exercise them:
  `mosfet-halving` (a 1 kV step on an off MOSFET needs about 1000 subiterations because the MOSFET
  limits each iteration to 0.5 V, so the adaptive timestep halves ten times to 4.9 ns and doubles
  back; closes the Phase 1 open issue), `convergence-fail` and `convergence-fail-adaptive`
  (a 100 kV step on a beta-2 MOSFET; both stop with `Convergence failed!` at step 1001, the
  adaptive one after halving below the minimum timestep). Recorded locally with the pinned
  Chromium 141; `pnpm golden:check` reproduces all 35 fixtures.
- Acceptance: `pnpm golden:compare --engine next tag:nonlinear` passes all 19 nonlinear circuits
  (the 16 from Phase 1 and the 3 above), most bit for bit, worst 2.7e-5 of tolerance. All 35
  golden circuits pass, their saved XML matches upstream's export (scopes and sliders aside), and
  XML load then save is byte-identical. `tools/golden/src/next.test.ts` checks all of it in
  `pnpm check`. Non-convergence ends in upstream's stop state and message at the same step.
- docs/ELEMENTS.md port status filled in for tier 1.

### Next

- Phase 4: renderer and viewer. PLAN.md section 3 says to confirm the UI framework (React with
  headless components) with the owner before starting.

### Open issues

- Loaded element voltages share nodes: if two elements on one node load different voltages (say
  two transistors with saved junction voltages on a shared node), master starts each from its own
  copy while here the last one loaded wins. No example circuit seen does this; add a golden
  circuit if one turns up.
- Not ported yet (unchanged from Phase 2): rail variants (AC, square, variable, clock), bus-width
  detection, probe statistics, custom logic and subcircuit models. Relay models (`<rlm>`) are
  skipped with a warning.
- The model edit dialogs, `getModelList` and `pickName` wait for the editor (Phase 5).

## 2026-10-02: Phase 2 (engine core and linear elements)

### Done

- Phase 1 follow-up: the reference-build job on `main` failed because CI's Chromium (153) re-recorded
  12 fixtures with last-bit differences from the local one (141). Recording is now pinned to Chromium
  141.0.7390.37 (`REFERENCE_BROWSER`, installed in CI with Playwright 1.56.1) and refuses any other
  version unless `GOLDEN_ANY_BROWSER=1`. Fixtures were re-recorded with two new fields:
  `reference.browser` and `export` (upstream's own XML save of the circuit after loading). The
  reference-build job passed with the pin on the Phase 2 pull request.
- `packages/engine`: `Simulation` (wire closure, node numbering, ground and unconnected nodes,
  closures into independent matrices, validation with repair passes, stamping, subiterations,
  adaptive timestep, wire currents), `SimElement`, `FindPathInfo`, dense LU, the EJML-derived
  sparse LU (used from 150 rows), and an exact `java.util.Random`. Ported from `dev-ts` 7ec858d
  (now pinned in docs/UPSTREAM.md) and checked against `master`; where they differ the port follows
  `master` (capacitors skip the current update on node-voltage changes, ground-node voltage reset).
- `packages/elements`: wire, ground, resistor, capacitor, inductor, voltage source (all waveforms;
  `VoltageElm`, `DCVoltageElm`, `ACVoltageElm`), current source, switch, labeled node, probe,
  output, potentiometer. Text and XML load and XML save ported from `master`. Registry mirrors
  upstream's `register`/`createCe`/`constructElement`, including `v` loading as `VoltageElm` from
  text and `DCVoltageElm` from XML.
- `packages/format`: DOM-free XML parser and upstream's `prettyPrint`; `Circuit` reads text and XML
  (`$`, `h`, elements; `o`, `38`, `<o>`, `<adj>` kept for later) and saves XML byte for byte as
  upstream; `runCircuit(text, { seed, stepsPerSample, samples })` returns the golden fixture shape.
  It steps by count, like the harness, instead of the `tEnd, sampleTimes` signature PLAN.md sketched.
- Golden engine `next` (`pnpm golden:compare --engine next`). Acceptance:
  - all 16 `linear` circuits pass (most bit for bit; worst difference 1e-9 of tolerance);
  - saving each loaded linear circuit reproduces upstream's export, scopes and sliders aside
    (docs/DEVIATIONS.md), and XML load then save is byte-identical for all 16.
    Both run in `pnpm check` (`tools/golden/src/next.test.ts`).
- `noise-rc` passes, so GWT's `java.util.Random` does match the JDK sequence (Phase 1 open issue).
- Nonlinear circuits run without hanging and fail the comparison cleanly (unknown elements are
  skipped with a warning).

### Next

- Phase 3: diode, LED, zener, BJT, MOSFET, op-amp, push switch; iteration and convergence; the
  diode and transistor model records (`34`, `32`, `<dm>`, `<tm>`, `<mm>`). Potentiometer is done.
- Add a golden circuit that exercises timestep halving (Phase 1 open issue, still open).

### Open issues

- Not ported yet: rails (`RailElm` and variants), text, bus-width detection (`detectBusWidths`, for
  digital buses), probe measurement statistics (RMS, min/max, frequency; display only), custom logic
  and subcircuit model records. The loader warns and skips them.
- Element voltages live on the nodes (dev-ts model) instead of a per-element copy as in `master`.
  `master`'s `InductorElm.reset()` also zeroes that copy, which can only matter when validation
  resets an inductor after a topology change. No golden circuit covers that yet; add one with a
  switch event when the harness supports switch events.

## 2026-10-02: Phase 1 (golden test harness)

### Done

- Reference patch `tools/reference-patch/harness.patch` (two files, about 130 lines), applied by the
  Docker build. Adds `CircuitJS1.harness`: `setSeed`, exact `step(n)` independent of wall-clock time,
  and a dump of every node voltage and every element's voltages and currents. Image tag and
  `.reference-site/reference-build.json` now carry the patch SHA. Gradle dependencies are cached in a
  BuildKit cache mount (Maven Central returned 429 on repeated builds).
- `tools/golden/`: recorder (`pnpm golden:record`, `pnpm golden:check`), comparator
  (`pnpm golden:compare`, per-value absolute and relative tolerance, first divergence, worst value,
  structural checks), stub engine, engine interface for Phase 2.
- 32 golden circuits in `tools/golden/manifest.json`: 20 written for the harness covering every
  tier-1 element (RC, RL, RLC, divider, AC and square sources, current source, switches, labeled
  nodes and probe, noise, rectifiers, LED and zener, NPN and PNP bias, N and P MOSFET switches,
  three op-amp circuits), 10 upstream examples and 2 upstream XML auto-tests. Tagged `linear`
  (Phase 2) and `nonlinear` (Phase 3). Fixtures in `fixtures/golden/` (2.3 MB).
- Acceptance: two fresh recordings matched the committed fixtures byte for byte (`pnpm golden:check`,
  run twice). `pnpm golden:compare` against the stub fails all 32 circuits with a clean report and
  exit code 1. Loading through `cct=` and through `importCircuit` gave identical traces.
- Unit tests for the comparator, fixture JSON and manifest, plus fixture consistency tests (one
  fixture per manifest entry, recorded from the current circuit text, pinned upstream SHA and current
  patch SHA; each fixture passes against itself and fails against the stub).
- The reference-build workflow now also runs on pull requests touching the patch, the harness or the
  fixtures, and runs `pnpm golden:check` after the build.

### Next

- Phase 2: port the engine core and linear elements from upstream `dev-ts`, add a headless runner
  and register it as a golden engine in `tools/golden/src/engines/index.ts`. Target: every circuit
  tagged `linear` passes `pnpm golden:compare --engine <name> tag:linear`.

### Open issues

- Fixtures come from GWT's emulation of `java.util.Random`. It is meant to reproduce the JDK
  sequence, but this was not checked. `noise-rc` will show it when the TS `java.util.Random` lands.
- `rectifier-adaptive` sets the adaptive timestep flag but converges, so no golden circuit yet
  exercises timestep halving. Add one in Phase 3 (a circuit that fails to converge at the full step).

## 2026-10-02: Phase 0 (setup and reconnaissance)

### Done

- Monorepo: pnpm workspaces with six empty packages, strict TypeScript 6.0, ESLint 10 with
  dependency-boundary and no-color-literal rules (the rule has its own tests), Prettier, Vitest,
  Playwright smoke test, GitHub Actions CI (`.github/workflows/ci.yml`).
- Upstream pinned as a submodule at `5a707168` (docs/UPSTREAM.md).
- Reference app builds in a digest-pinned Docker image (Gradle 8.7, JDK 8, GWT 2.8.2) and runs in
  Chromium: `pnpm reference:build`, `pnpm reference:serve`, `tools/reference-build/smoke.mjs`.
- docs/ELEMENTS.md: 154 element classes with dump types, XML tags, linearity, hooks, tiers.
  Generated by `tools/recon/`.
- docs/ENGINE-NOTES.md: walkthrough of analysis, stamping, LU, iteration, timestep, currents.
- PLAN.md section 4 checked item by item. CLAUDE.md created.

### Next

- Phase 1: golden test harness. Seed upstream's `java.util.Random` in the reference patch, step
  deterministically via the `ontimestep` hook, record traces.

### Open issues

- Decided 2026-10-02: the engine is ported from upstream's `dev-ts` TypeScript branch, not the Java
  code (PLAN.md section 3). Phase 2 should pin a `dev-ts` commit alongside the `master` pin.
- Upstream now saves circuits as XML. The `format` package must read both formats; whether it
  also writes the legacy text format is open.
- The reference-build workflow passed on GitHub on 2026-10-02 (manual run). It triggers on pushes that touch `reference/` or `tools/reference-build/`, or by hand.
- The offline-distribution fallback for the reference build is documented but untested.
