# Golden test harness

Records reference traces from the upstream Java build and compares engines against them
(PLAN.md Phase 1).

```sh
pnpm reference:build                    # Docker build of upstream + tools/reference-patch
pnpm golden:record [name | tag:x ...]   # record fixtures/golden/<name>.json
pnpm golden:check                       # record again in memory, fail if any fixture differs
pnpm golden:compare [--engine stub] [--json report.json] [name | tag:x ...]
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use a local Chromium. The recorder serves `.reference-site/`
itself (override with `REFERENCE_SITE`), so `pnpm reference:serve` is not needed.

## How recording works

For each circuit, in a fresh browser context: open the reference with an empty circuit
(`?running=false&cct=...`, which also stops the app fetching its default circuit), load the circuit
with `CircuitJS1.importCircuit`, seed `java.util.Random`, then call `harness.step(stepsPerSample)`
`samples` times and read the full state after each call. See
[../reference-patch/README.md](../reference-patch/README.md) for the API. Everything runs in one
synchronous `page.evaluate`, so the app's own timer never interleaves. Nothing in a fixture depends
on wall-clock time, so two recordings are byte-identical (`pnpm golden:check`).

## Circuit set

[manifest.json](manifest.json) lists every circuit with its seed, `stepsPerSample` and `samples`
(defaults: seed 1, 40 steps, 100 samples). Sample times follow from the timestep in the circuit's
options line. Tags:

- `linear`: Phase 2 elements only (wire, ground, resistor, capacitor, inductor, voltage and current
  sources, switch, labeled node, probe, potentiometer, plus output and text, which do not simulate).
- `nonlinear`: needs Phase 3 elements (diode, LED, zener, BJT, MOSFET, op-amp).
- `upstream-example`: a bundled upstream example, read from the submodule.
- `upstream-test`, `xml`: upstream's own `auto-tests/` circuits, in the XML format with saved
  element state.

Circuits under [circuits/](circuits/) are written for this harness, one or two elements each. To add
one: put it in `circuits/` (or reference an upstream file as `upstream:<path>`), add a manifest
entry, run `pnpm golden:record <name>`, and commit the fixture. Run `pnpm test`: the fixture tests
check that every manifest entry has a fixture recorded from the current circuit text, the pinned
upstream SHA and the current reference patch.

## Fixture format

`fixtures/golden/<name>.json` ([src/types.ts](src/types.ts), `GoldenFixture`):

- `reference`: upstream SHA, SHA-256 of the reference patch, and `build: "java-master"`.
- `settings`: seed, `stepsPerSample`, `samples`, and the timestep values the circuit set.
- `circuit`: the circuit text exactly as loaded.
- `topology`: node count, and per element its upstream class, dump type, post count and node indices.
- `stop`: `null`, or the stop message and step if the simulation stopped early.
- `samples`: one line each: `step`, `t`, `timeStep`, `nodes` (voltage by node index), and per
  element `volts` (every node, posts first), `currents` (into each post) and `current`.

Elements and nodes use upstream order, which the port must keep (PLAN.md section 8). Non-finite
numbers are stored as the strings `"NaN"`, `"Infinity"` and `"-Infinity"`.

## Comparing

`compareTrace` ([src/compare.ts](src/compare.ts)) checks every value with
`|expected - actual| <= abs + rel * max(|expected|, |actual|)`. Defaults: voltages 1e-6 V + 1e-6
relative, currents 1e-9 A + 1e-6 relative, sample times 1e-12 s + 1e-9 relative. A circuit also fails
on a structural problem: different sample count, step numbers, node count, element node indices, or
stop state. The report gives, per circuit, the first divergence (time, step and quantity) and the
worst value with its multiple of the tolerance. The exit code is 1 if any circuit fails.

Engines live in [src/engines/](src/engines/) and implement `GoldenEngine`: given the circuit text,
seed and sample settings, return an `EngineTrace` in the fixture's sample shape. The `stub` engine
returns zeros in the reference shape and fails every circuit; Phase 2 adds the real engine. Only
stubs may read `referenceTopology`.
