# Reference patch

`harness.patch` is the only change made to upstream for golden tests (PLAN.md section 2). The
reference Docker build applies it to its copy of `reference/circuitjs1` before compiling
(`tools/reference-build/Dockerfile`). The submodule itself is never modified.

It changes two files and adds no behaviour unless the new API is called.

## What it adds

`window.CircuitJS1.harness`, next to the existing JS API:

| Method             | What it does                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`          | `1`                                                                                                                                                      |
| `setSeed(seed)`    | Replaces `CirSim.random` with `new java.util.Random(seed)` (upstream seeds it from the clock). Op-amp, gate and noise code draw from it.                 |
| `step(n)`          | Runs exactly `n` timesteps and returns how many completed (fewer if the simulation stopped). Works while the app is stopped and ignores wall-clock time. |
| `stopMessage()`    | The app's stop message (`Singular matrix!`, `Convergence failed!`, ...) or `null`.                                                                       |
| `minTimeStep()`    | `SimulationManager.minTimeStep`.                                                                                                                         |
| `adjustTimeStep()` | Whether the circuit enabled the adaptive timestep (options flag 64).                                                                                     |
| `nodeVoltages()`   | Voltage of every node in `SimulationManager.nodeList` order (index 0 is ground).                                                                         |
| `elements()`       | For each top-level element in `elmList` order: class name, dump type, post count, node indices, `volts[]`, current into each post, `getCurrent()`.       |

## How `step(n)` works

`step(n)` mirrors the simulation half of one `UIManager.updateCircuit()` call: analyze the circuit if
flagged, stamp it if needed, set up scopes, then call `SimulationManager.runCircuit()`. A new
`harnessSteps` counter in `SimulationManager` makes `runCircuit()` skip its three wall-clock checks
(first-frame return, slow-speed skip, frame time budget) and the `simRunning` check, and break after
exactly `n` timesteps instead. Convergence handling, adaptive timestep and stop conditions are
untouched. A pending DC analysis turns into a re-analysis for the next call, as it does between
frames.

## Regenerating the patch

Make the change in a scratch copy of the submodule's `src/` and diff against a clean copy, keeping
`a/src/...` and `b/src/...` paths:

```sh
git diff --no-index --no-prefix a/src b/src | sed -E 's#^(---|\+\+\+) (a|b)/src#\1 \2/src#' \
  > tools/reference-patch/harness.patch
```

Any change to the patch changes the reference image tag and `harnessPatchSha256`, so re-record the
golden fixtures (`pnpm golden:record`) after rebuilding. The fixture tests fail until you do.
