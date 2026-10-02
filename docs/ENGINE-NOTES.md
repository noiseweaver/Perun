# CircuitJS1 engine notes (for the TypeScript hand-port)

Reference: `reference/circuitjs1` at commit `5a707168778216bb6ed01bfdd62e8bbf7ae0a032`.
Unless stated otherwise, every `File.java:N` path is relative to
`reference/circuitjs1/src/com/lushprojects/circuitjs1/client/`.

Read this first: the upstream code at this commit is **not** the classic CircuitJS1 engine that most
write-ups (including the repo's own `INTERNALS.md`) describe. Three big differences:

1. The engine lives in `SimulationManager`, not `CirSim` (section 1).
2. There is no `simplifyMatrix()` and no `RowInfo` / `circuitRowInfo[]` any more. The circuit is split
   into independent per-closure matrices (`CircuitMatrix`), and a sparse LU solver is used for big
   matrices (sections 5 and 6).
3. Nodes and voltage sources are objects (`CircuitNode`, `VoltageSource`), not integer indices, and the
   stamp helpers take those objects (section 4).

`INTERNALS.md` still describes `simplifyMatrix()` and `circuitRowInfo[]` (`INTERNALS.md:163-175`,
`INTERNALS.md:317`) and says stamp helpers are on `CirSim` (`INTERNALS.md:29`, `:39`, `:51`). Those
statements are stale at this commit. A `grep` for `simplifyMatrix|RowInfo|circuitRowInfo` over `src/`
finds nothing.

---

## 1. Where things live

| Concern                                                                                 | Owner                                               | Evidence                                                                   |
| --------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| App object, URL bootstrap, element registry, `createCe`, options dump, RNG              | `CirSim`                                            | `CirSim.java:152-264`, `:576-654`, `:124-129`                              |
| UI, canvas, sliders, the per-frame `updateCircuit()`, run/stop                          | `UIManager`                                         | `UIManager.java:330-339`, `:530-545`, `:565-807`                           |
| Whole simulation engine: node list, wire closure, stamping, LU, run loop, wire currents | `SimulationManager`                                 | `SimulationManager.java:20-1867`                                           |
| One independent MNA system (matrix, RHS, saved copies, node voltages)                   | `CircuitMatrix`                                     | `CircuitMatrix.java:6-20`                                                  |
| A circuit node (links, index, owning matrix, row)                                       | `CircuitNode`                                       | `CircuitNode.java:24-31`                                                   |
| (element, post index) pair attached to a node                                           | `CircuitNodeLink`                                   | `CircuitNodeLink.java:22-25`                                               |
| A voltage-source unknown (owning element, matrix, row, terminal nodes)                  | `VoltageSource`                                     | `VoltageSource.java:3-30`                                                  |
| Text-format loading, options line, clearCircuit defaults                                | `CircuitLoader`                                     | `CircuitLoader.java:39-279`                                                |
| XML save / load                                                                         | `XMLSerializer`, `XMLDeserializer`                  | `XMLSerializer.java:106-150`, `XMLDeserializer.java:48-192`                |
| Class name to instance factory (GWT generated)                                          | `ElementFactory` + `rebind/ElementFactoryGenerator` | `ElementFactory.java:3-7`, `../rebind/ElementFactoryGenerator.java:57-151` |
| Sparse LU (EJML-derived)                                                                | `matrix/SparseLU`, `matrix/DMatrixSparseCSC`        | `matrix/SparseLU.java:25-172`, `matrix/DMatrixSparseCSC.java:378-403`      |
| Loop-finding helper used by `validate()`                                                | `FindPathInfo`                                      | `FindPathInfo.java:3-105`                                                  |
| Scopes sampling per step                                                                | `ScopeManager`, `Scope`, `ScopePlot`                | `ScopeManager.java:118-124`, `ScopePlot.java:99-121`                       |
| `window.CircuitJS1` API                                                                 | `JSInterface`                                       | `JSInterface.java:53-73`                                                   |
| Test recorder / runner                                                                  | `TestManager` (stubbed out, see section 11)         | `TestManager.java:19-33`, `:35-418`                                        |

`CirSim` keeps only thin delegates: `updateCircuit()` forwards to `ui.updateCircuit()` (`CirSim.java:292`),
`setSimRunning` to the UI (`CirSim.java:286`), `getIterCount()` reads the speed slider
(`CirSim.java:320-327`). `CirSim()` constructs the `SimulationManager` (`CirSim.java:142-145`).

### How elements reach the simulator (global state)

- `CircuitElm.app` and `CircuitElm.sim` are **static** fields (`CircuitElm.java:47-48`) set once by
  `CircuitElm.initClass(this, sim)` (`CirSim.java:164`, `CircuitElm.java:128-130`). Every element calls
  `sim.stampXxx(...)`, reads `sim.t`, `sim.timeStep`, sets `sim.converged`, reads `sim.subIterations`.
- `SimulationManager.theSim` is static (`SimulationManager.java:23`, set at `:71`) and is used by
  `ScopePlot.timeStep()` (`ScopePlot.java:115-116`) and by the static `lu_factor/lu_solve`
  (`SimulationManager.java:1703`, `:1798`).
- `CirSim.theApp` is static (`CirSim.java:282`, set at `:143`).
- `CircuitNode.ground` is static (`CircuitNode.java:25`), reassigned in `setGroundNode()`
  (`SimulationManager.java:495`).
- `GroundElm.firstGround` (`GroundElm.java:114-123`) and `LabeledNodeElm.labelList`
  (`LabeledNodeElm.java:75`, `:84-86`) are static and **stateful**: `getConnectedPost()` mutates them
  (section 3).
- Other statics touched by the sim path: `CircuitElm.voltageRange`, `currentMult`, `powerMult`
  (`CircuitElm.java:39-42`), and the model registries (`DiodeModel`, `TransistorModel`, etc.).

Porting advice: make all of these instance fields of a `Simulation` object so tests can run several
circuits in one process.

---

## 2. Main loop and frame timing

### What drives a frame

- `CirSim.timer` is a GWT `Timer` (i.e. `setInterval`, **not** `requestAnimationFrame`) whose `run()`
  calls `updateCircuit()` inside a try/catch (`CirSim.java:108-121`).
- It is scheduled every `FASTTIMER = 16` ms while running (`CirSim.java:122`, `UIManager.java:537`) and
  cancelled on stop (`UIManager.java:542`). When stopped, `repaint()` schedules a one-shot
  `updateCircuit()` after 16 ms (`UIManager.java:515-526`).
- `setSimRunning(true)` refuses to start while `stopMessage != null` (`UIManager.java:532-533`).

### `UIManager.updateCircuit()` order (`UIManager.java:565-807`)

1. `didAnalyze = app.analyzeFlag` (`:571`).
2. If `analyzeFlag || dcAnalysisFlag`: `sim.analyzeCircuit()`, then `analyzeFlag = false` (`:572-577`).
3. If `sim.needsStamp && simRunning`: `sim.preStampAndStampCircuit()`; an exception becomes
   `stop("Exception in stampCircuit()")` (`:579-588`). Note: when stopped, analysis runs but stamping
   is deferred until the sim is running.
4. `scopeManager.setupScopes()` (`:596`), clear canvas.
5. If running: `sim.runCircuit(didAnalyze)` in a try/catch (`:614-628`).
6. Current-dot animation multiplier: `currentMult = 1.7 * inc * exp(currentBar/3.5 - 14.2)` where
   `inc` is wall-clock ms since the last frame, negated unless "conventional current" is checked
   (`:630-643`). Display only.
7. Draw everything (`:653-767`).
8. If `dcAnalysisFlag` was set, clear it and set `analyzeFlag = true` so the next frame re-analyzes in
   normal (transient) mode (`:771-774`).
9. `lastFrameTime = lastTime` (`:776`), where `lastTime` is the wall-clock time taken right after
   `runCircuit` (`:630`, `:640`), or 0 when stopped (`:642`).
10. `jsInterface.callUpdateHook()` (`:804-806`).

### Steps per frame (speed slider)

- Speed slider: `speedBar = new Scrollbar(HORIZONTAL, 3, 1, 0, 260)` (`UIManager.java:330`);
  `clearCircuit()` resets it to 117 (`CircuitLoader.java:58`).
- `getIterCount()` returns 0 if the slider is 0, else `0.1 * Math.exp((speed - 61) / 24.0)`
  (`CirSim.java:320-327`).
- Saved files store `getIterCount()` (the `ic` attribute, or the 3rd field of the `$` line) and the
  loader inverts it: `speed = (int)(Math.log(10*ic)*24 + 61.5)` (`CircuitLoader.java:259-261`,
  `XMLDeserializer.java:64-67`).
- In `runCircuit` (`SimulationManager.java:1291`): `steprate = (long)(160 * getIterCount())`. This is a
  target in units of "`maxTimeStep` steps per wall-clock second". Values: speed 61 gives 16/s,
  speed 117 gives 164 (`(long)164.996`), speed 260 gives 63847.

### Wall-clock gating inside `runCircuit` (`SimulationManager.java:1282-1448`)

```
tm = now()
if lastIterTime == 0: lastIterTime = tm; return          // very first call does nothing (:1294-1297)
if 1000 >= steprate*(tm-lastIterTime) && !didAnalyze: return   // not enough time elapsed (:1301-1302)
frameTimeLimit = (int)(1000 / app.minFrameRate)           // minFrameRate = 20 -> 50 ms (:1311, CirSim.java:69)
for iter = 1..:
    ... one timestep ...
    tm = now(); lit = tm
    if (timeStepCount - timeStepCountAtFrameStart)*1000 >= steprate*(tm - lastIterTime)
       || (tm - ui.lastFrameTime > frameTimeLimit): break      (:1439-1440)
    if !app.simRunning: break                                    (:1441-1442)
lastIterTime = lit                                               (:1444)
```

Points that matter for a port:

- `lastIterTime` is only advanced at the end of a frame that ran; early returns leave it alone, so
  elapsed time accumulates across skipped frames.
- The budget counts `timeStepCount` (increments of `maxTimeStep`, see section 8), not raw iterations,
  so with a reduced adaptive timestep more iterations run per frame.
- `ui.lastFrameTime` is the end of the previous frame's `runCircuit`, so the 50 ms limit includes the
  16 ms timer gap and drawing time.
- `clearCircuit()` resets `lastIterTime = 0` (`CircuitLoader.java:63`), so the first frame after a load
  runs zero steps.
- `minFrameRate` is user-editable ("Minimum Target Frame Rate", `EditOptions.java:89`, `:204`).

The number of steps per frame is therefore wall-clock dependent. For golden tests, drive the port by
step count or by simulated time, never by frames.

---

## 3. Circuit analysis

Analysis is split in two:

- `analyzeCircuit()` (`SimulationManager.java:817-831`): clears the stop message
  (`app.setStopElm(null, null)`), returns early for an empty circuit, runs `detectBusWidths()` and
  `makePostDrawList()` (UI only), and sets `needsStamp = true`.
- `preStampAndStampCircuit()` (`:941-957`) calls `preStampCircuit(false)` up to 10 times until it returns
  true or a stop message appears, then `stampCircuit()`. Ten failures give
  `stop("failed to stamp circuit", null)` (`:951-953`). Retrying is how `validate()` repairs work (see
  "Validation" below).

### `preStampCircuit(subcircuit)` order (`SimulationManager.java:834-938`)

1. `nodeList = new Vector()`, `elmList = app.elmList` (top-level elements only) (`:836-837`).
2. `calculateWireClosure()` (`:838`).
3. `setGroundNode(subcircuit)` (`:839`).
4. `makeNodeList()` (`:842`).
5. UI-only wire node assignment when viewing composite internals (`:846-850`).
6. `calcWireInfo()`; on failure return false (`:852-853`).
7. `nodeMap = null` (`:855`).
8. Flatten composites: `elmList = copy of app.elmList`, then for each element with
   `getChildElmList() != null`, `addChildElms(children)` appends the leaf children at the **end** of
   `elmList` and links their (already assigned) nodes (`:859-864`, `:603-626`). The composite itself
   stays in the list.
9. Set `circuitNonLinear` if any element's `nonLinear()` is true; create `VoltageSource` objects in
   element order, `vs.index = running count`, and call `ce.setVoltageSource(j, vs)` (`:866-884`).
10. `showResistanceInVoltageSources` bookkeeping (`:888-898`, display only).
11. `findUnconnectedNodes()` (`:900`), `calculateClosures()` (`:901`).
12. `validateCircuit()`; return false if any element's `validate()` is false (`:903-904`, `:804-813`).
13. `vs.assignMatrix()` for each VS, then rows: `vs.row = m.nodeCount + (count of VS already in m) `,
    1-based, and `m.size = nodeCount + vsCount` (`:907-927`).
14. `timeStep = maxTimeStep` (`:933`), `needsStamp = true`, `jsInterface.callAnalyzeHook()` (`:936`).

### Wire closure (`calculateWireClosureForList`, `SimulationManager.java:245-295`)

Goal: map every point joined by wire-like elements to one shared `NodeMapEntry` (node not yet
allocated). Only elements with `isRemovableWire()` take part: `WireElm`, `GroundElm`,
`LabeledNodeElm` (`WireElm.java:151`, `GroundElm.java:113`, `LabeledNodeElm.java:146`).

For each such element, for each bit `j < getBusWidth()`:

- `p0 = getPost(j)`, `p1 = getConnectedPost(j)` (`:259-263`).
- `p1 == null` (first ground / first label with that name): create an entry for `p0` if absent (`:264-271`).
- Otherwise merge: both present, rewrite every map value equal to `cn2` to `cn` (`:273-278`); one present,
  map the other point to it; neither, new shared entry (`:279-288`).

`getConnectedPost` is stateful:

- `GroundElm`: the first ground ever asked records its `point1` in static `firstGround` and returns null;
  later grounds return `firstGround` (`GroundElm.java:114-123`). So all grounds collapse into one entry.
  `calculateWireClosure()` resets this first (`SimulationManager.java:238-239`). Beware: the default
  `getWireSegments()` (`CircuitElm.java:803-812`) also calls `getConnectedPost`, and it is called just
  before the merge (`SimulationManager.java:254`), so for the first ground the merge call sees its own
  point back. The result is still correct, but a port must preserve the call order.
- `LabeledNodeElm`: the first label with a given key (`text`, or `text:bit` for buses) records its post
  and returns null; later ones return that post (`LabeledNodeElm.java:98-114`).

Points are compared with `Point.equals/hashCode`, which include a `z` component used for bus bits
(`Point.java:61-70`).

### Ground node selection (`setGroundNode`, `SimulationManager.java:484-530`)

- Always creates node 0, `index = 0`, appends it, sets `CircuitNode.ground` (`:492-495`).
- Scans `elmList` in order. On the first `GroundElm`, binds its post's `NodeMapEntry` to ground and
  stops scanning (`:501-507`). Before that it records whether a `RailElm` was seen, and the first
  `VoltageElm` and `BatteryElm` (`:509-514`).
- If not a subcircuit, no ground found, no rail seen, and there is a `VoltageElm` (or failing that a
  `BatteryElm`), that element's post 0 becomes ground (`:520-529`).
- Otherwise node 0 exists but nothing is attached to it; rails stamp against it directly.

### Node allocation (`makeNodeList`, `SimulationManager.java:533-600`)

- First calls `preStamp()` on every element (`:539-540`); `CompositeElm.preStamp()` builds its internal
  node list here (`CompositeElm.java:238-243`).
- Then, in element order, for each post `j`: if the point has no entry or the entry has no node yet,
  allocate `new CircuitNode()` with `index = nodeList.size()`, add a link `(elm, j)`, `ce.setNode(j, cn)`,
  and record it in the map (`:557-569`). Otherwise reuse the node, add a link, `setNode`, and if it is
  ground call `ce.setNodeVoltage(j, 0)` (`:570-581`). The comment at `:553-556` says the allocation
  order is deliberately preserved for backward compatibility.
- Internal nodes: `getInternalNodeCount()` new nodes with `internal = true`, link number
  `j + posts` (`:583-593`).
- Sums `getVoltageSourceCount()` and allocates `voltageSources` (`:596-599`).

Porting hazard: this count covers only top-level elements. `CompositeElm` does not override
`getVoltageSourceCount()` (it returns 0, `CircuitElm.java:776`), but step 9 above stores the flattened
children's sources into the same array (`SimulationManager.java:870-883`). In Java that would overflow;
in GWT-compiled JS the array silently grows. Size the array from the flattened list in the port.

### Unconnected nodes (`findUnconnectedNodes`, `SimulationManager.java:632-708`)

- `closure[0] = true`; also mark the node of every post where `hasGroundConnection(j)` is true and
  collect such elements in `nodesWithGroundConnection` (`:642-657`).
- BFS from all marked nodes through `cn.links`, moving from post `cnl.num` to post `k` when
  `ce.getConnection(post1, k)` (`:668-685`). Only posts are traversed (`k < getPostCount()`).
- When the queue empties, scan upward from `scanFrom` for the next node that is not in the closure and
  not `internal`, record it in `unconnectedNodes`, mark it and continue the BFS from it (`:686-700`).
  So exactly one node per floating island is recorded, the lowest-indexed one.
- `connectUnconnectedNodes()` later stamps `stampResistor(ground, node, 1e8)` for each
  (`:796-802`, called from `stampCircuit` at `:985`).

### Closures and matrices (`calculateClosures`, `SimulationManager.java:710-791`)

- Flood fill (DFS stack) from each non-ground node, through `getMatrixConnection(post1, k)` for
  `k < getNodeCount()` (posts and internal nodes), never flooding through node 0 (`:718-754`).
  `getMatrixConnection` defaults to `getConnection` (`CircuitElm.java:1289`); elements whose matrix
  stamps couple otherwise-isolated sides return true (for example `OpAmpElm.java:202`,
  `TransformerElm.java:326`, `MosfetElm.java:716`).
- One `CircuitMatrix` per closure; at least one (`:757-761`).
- Node rows: for nodes in index order, `cn.row = ++m.nodeCount` (1-based), `cn.matrix = m`,
  `m.nodeList.add(cn)` (`:764-774`). Ground gets `row = 0`, `matrix = null` (`:777-778`).
- Voltage sources go to a matrix via `VoltageSource.assignMatrix()`: the non-ground terminal node's
  matrix from `vs.n1`/`vs.n2`, else the matrix of the element's last post (`VoltageSource.java:18-29`).
  `n1/n2` are set by elements that override `setVoltageSource` and call `v.setNodes(...)` (for example
  `VoltageElm.java:139-145`, `RailElm.java:93-99`); 31 call sites in total.

### Validation and its exact messages

`validate()` defaults to true (`CircuitElm.java:1355`). Most implementations now **repair** the circuit
and return false to force a re-run of `preStampCircuit`, instead of stopping:

| Element                                                                  | Check                              | Action                                                           | Evidence                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `VoltageElm` (2-post)                                                    | VOLTAGE path between its own nodes | set `internalResistance = .001`, return false                    | `VoltageElm.java:674-683`                                                                                                                      |
| `RailElm`                                                                | rail node VOLTAGE path to ground   | `internalResistance = .001`, return false                        | `RailElm.java:131`, `:122-130`                                                                                                                 |
| `Switch2Elm`                                                             | VOLTAGE loop through switch        | `resistance = .001`, return false                                | `Switch2Elm.java:260-270`                                                                                                                      |
| `CapacitorElm` (ideal)                                                   | SHORT path                         | `shorted()` (zero state), still true                             | `CapacitorElm.java:274-279`                                                                                                                    |
| `CapacitorElm` (ideal)                                                   | CAP_V loop of ideal caps / sources | `setSeriesResistance(.1)`, return false                          | `CapacitorElm.java:281-286`                                                                                                                    |
| `InductorElm`                                                            | no INDUCT path                     | `reset()`, return true                                           | `InductorElm.java:177-182`                                                                                                                     |
| `CurrentElm`                                                             | no INDUCT path                     | `setBroken(true)`, return true                                   | `CurrentElm.java:203-207`                                                                                                                      |
| `VCCSElm`                                                                | no INDUCT path on output           | `broken = true`                                                  | `VCCSElm.java:240-247`                                                                                                                         |
| `OpAmpElm`, `GateElm`, `InverterElm`, `LogicInputElm`, `ChipElm` outputs | `validateRailNode(n)`              | `stop("Path to ground with no resistance!", this)`, return false | `CircuitElm.java:1357-1364`, `OpAmpElm.java:200`, `GateElm.java:447`, `InverterElm.java:171`, `LogicInputElm.java:180`, `ChipElm.java:460-465` |

`FindPathInfo` path rules (`FindPathInfo.java:26-104`): INDUCT ignores `CurrentElm`, and through other
inductors only when their current matches within `1e-10`; VOLTAGE only traverses wire-equivalents,
`VoltageElm`, `LogicInputElm`, `GroundElm`; SHORT only wire-equivalents; CAP_V wire-equivalents, ideal
caps, `VoltageElm`, `LogicInputElm`. Ground is traversed via `hasGroundConnection` and
`nodesWithGroundConnection`.

All `stop(...)` messages reachable from the engine, verbatim (passed through `Locale.LS`,
`SimulationManager.java:1143`):

- `"wire loop detected"` (`SimulationManager.java:465`)
- `"failed to stamp circuit"` (`:952`)
- `"Singular matrix!"` (`:1026` after stamping a linear matrix, `:1376` inside the subiteration loop)
- `"nan/infinite matrix!"` (`:1355`)
- `"Convergence failed!"` (`:1399`)
- `"Exception in stampCircuit()"` (`UIManager.java:584`, `MouseManager.java:709`)
- `"Path to ground with no resistance!"` (`CircuitElm.java:1360`)
- `"max current exceeded"` (`DiodeElm.java:278`, `TransistorElm.java:714`, `LEDArrayElm.java:154`, `SevenSegElm.java:311`)
- `"infinite transistor current"` (`TransistorElm.java:485`)
- `"capacitor exceeded max reverse voltage"` (`PolarCapacitorElm.java:82`)
- `"Transmission line delay too large!"` (`TransLineElm.java:192`, `:204`), `"Need to ground transmission line!"` (`TransLineElm.java:211`)

`stop()` sets `stopElm/stopMessage`, sets `matrices = null`, stops the sim and clears `analyzeFlag`
(`SimulationManager.java:1142-1147`). The message is cleared on the next `analyzeCircuit()`
(`:818`).

---

## 4. Stamping

### Conventions

Each `CircuitMatrix` holds `matrix[size][size]` and `rightSide[size]`; rows `0..nodeCount-1` are node
KCL rows (row = `cn.row - 1`), the rest are voltage-source rows (row = `vs.row - 1`). Ground has
`row = 0` and is dropped from every stamp. Node rows read "sum over columns of `matrix * x` = current
injected into the node".

### Helpers (`SimulationManager.java:1149-1277`)

| Helper                                                                               | Exact effect                                                                                                                                                                                 | Lines        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `stampMatrix(CircuitNode i, CircuitNode j, x)`                                       | if `i.row>0 && j.row>0`: `m.matrix[i.row-1][j.row-1] += x`, `m = i.matrix`. Logs `"stampMatrix cross-matrix! ..."` if `i.matrix != j.matrix` but still stamps. `debugger()` on infinite `x`. | `:1225-1234` |
| `stampMatrix(VoltageSource i, CircuitNode j, x)`                                     | if `j.row>0`: `i.matrix.matrix[i.row-1][j.row-1] += x`                                                                                                                                       | `:1235-1243` |
| `stampMatrix(CircuitNode i, VoltageSource j, x)`                                     | if `i.row>0`: `j.matrix.matrix[i.row-1][j.row-1] += x`                                                                                                                                       | `:1244-1252` |
| `stampMatrix(VoltageSource i, VoltageSource j, x)`                                   | always: `i.matrix.matrix[i.row-1][j.row-1] += x`                                                                                                                                             | `:1253-1259` |
| `stampRightSide(CircuitNode n, x)`                                                   | if `n.row>0`: `rightSide[n.row-1] += x`                                                                                                                                                      | `:1263-1266` |
| `stampRightSide(VoltageSource vs, x)`                                                | `rightSide[vs.row-1] += x`                                                                                                                                                                   | `:1267-1269` |
| `stampRightSide(n)`, `stampRightSide(vs)`, `stampNonLinear(n)`, `stampNonLinear(vs)` | **no-ops** (formerly RowInfo markers)                                                                                                                                                        | `:1272-1277` |
| `stampResistor(n1, n2, r)`                                                           | `g = 1/r`; if NaN/infinite prints `"bad resistance ..."` and deliberately divides int 0 by 0 to throw; then `[n1][n1]+=g, [n2][n2]+=g, [n1][n2]-=g, [n2][n1]-=g`                             | `:1183-1194` |
| `stampConductance(n1, n2, g)`                                                        | same four entries with `g`                                                                                                                                                                   | `:1196-1201` |
| `stampCurrentSource(n1, n2, i)`                                                      | `rhs[n1] -= i; rhs[n2] += i` (current `i` flows n1 to n2 through the source)                                                                                                                 | `:1211-1214` |
| `stampVoltageSource(n1, n2, vs, v)`                                                  | `[vs][n1] -= 1; [vs][n2] += 1; rhs[vs] += v; [n1][vs] += 1; [n2][vs] -= 1`. Row says `V(n2) - V(n1) = v`; unknown is the current flowing n1 to n2 inside the source.                         | `:1157-1163` |
| `stampVoltageSource(n1, n2, vs)`                                                     | same without the RHS (value supplied each step via `updateVoltageSource`)                                                                                                                    | `:1166-1171` |
| `stampVoltageSource(vs, v)`                                                          | uses `vs.n1, vs.n2`                                                                                                                                                                          | `:1174-1176` |
| `updateVoltageSource(n1, n2, vs, v)`                                                 | only `stampRightSide(vs, v)`; n1/n2 ignored                                                                                                                                                  | `:1179-1181` |
| `stampVCVS(n1, n2, coef, vs)`                                                        | `[vs][n1] += coef; [vs][n2] -= coef` (add to a VS row already stamped by `stampVoltageSource`)                                                                                               | `:1151-1154` |
| `stampVCCurrentSource(cn1, cn2, vn1, vn2, g)`                                        | `[cn1][vn1]+=g; [cn2][vn2]+=g; [cn1][vn2]-=g; [cn2][vn1]-=g`: current `g*(V(vn1)-V(vn2))` flows cn1 to cn2. The comment says "divided by g" but the code multiplies.                         | `:1204-1209` |
| `stampCCCS(n1, n2, vs, gain)`                                                        | `[n1][vs] += gain; [n2][vs] -= gain`                                                                                                                                                         | `:1217-1220` |

### When stamping happens (`stampCircuit`, `SimulationManager.java:961-1051`)

1. For each matrix allocate fresh `matrix`, `rightSide`, `origMatrix`, `origRightSide`, `permute`,
   `nodeVoltages`; keep `lastNodeVoltages` if the size is unchanged; `nonLinear = false` (`:965-977`).
2. If `circuitNonLinear`, mark **every** matrix nonlinear (`:980-983`). (Per-matrix linearity is not
   exploited.)
3. `connectUnconnectedNodes()` (`:985`).
4. For every element in the flattened `elmList`: `setParentList(elmList)` then `stamp()` (`:988-992`).
5. If a stamp called `stop()` (`matrices == null`), return (`:995-996`).
6. Copy `rightSide` to `origRightSide` and `matrix` to `origMatrix` for every matrix (`:999-1010`).
7. Pick the solver (section 6) (`:1012-1017`).
8. For each **linear** matrix, `lu_factor` once now; failure gives `"Singular matrix!"` (`:1022-1030`).
9. Build `elmArr` (the flattened list as an array) and `app.scopeElmArr` (`:1033-1048`).
10. `needsStamp = false`.

`stampCircuit()` is also called on every adaptive timestep change (section 8), so `stamp()` must be
repeatable and must read `sim.timeStep` (for example `CapacitorElm.java:166-169`,
`Inductor.java:76-79`).

### Representative element stamps

- `ResistorElm`: `stamp()` = `stampResistor(nodes[0], nodes[1], resistance)`; `calculateCurrent()` =
  `(volts[0]-volts[1])/resistance` (`ResistorElm.java:108-114`). Dump type `'r'` (`:35`).
- `CapacitorElm` (`CapacitorElm.java:146-212`): in DC-analysis mode it stamps a `1e8` resistor and
  nothing else (`:147-153`). Otherwise `capNode2` is 1, or internal node 2 when `seriesResistance > 0`;
  `compResistance = timeStep/(2C)` (trapezoidal) or `timeStep/C` (backward Euler); stamps that resistor
  and the series resistor. `startIteration()`: `curSourceValue = -voltdiff/compResistance - current`
  (trap) or `-voltdiff/compResistance` (BE) (`:176-181`). `doStep()`:
  `stampCurrentSource(nodes[0], nodes[capNode2], curSourceValue)` (`:208-212`). `stepFinished()`:
  `voltdiff = volts[0]-volts[capNode2]; calculateCurrent()` (`:183-186`). It overrides
  `setNodeVoltage` so `calculateCurrent` is **not** called on every solve (`:188-193`).
  `reset()` puts `initialVoltage` (default `1e-3`) on the cap to kick oscillators (`:57-62`, `:38`).
- `InductorElm` delegates to `Inductor` (`InductorElm.java:95-112`). `Inductor.stamp`: if not
  saturating, `compResistance = 2L/dt` (trap) or `L/dt` (BE) and `stampResistor`; if saturating,
  nothing on the matrix (the conductance is stamped in `doStep`) (`Inductor.java:62-84`).
  `startIteration`: recompute `compResistance` from `L(I) = L0/(1+(I/Isat)^2)` when saturating, then
  `curSourceValue = voltdiff/compResistance + current` (trap) or `current` (BE) (`:87-100`).
  `doStep`: optional `stampConductance(1/compResistance)`, then `stampCurrentSource(curSourceValue)`
  (`:110-116`). `calculateCurrent`: `voltdiff/compResistance + curSourceValue` (`:102-109`).
  `nonLinear()` is true only when saturating (`:85`).
- `DiodeElm`/`Diode`: `nonLinear() = true` (`DiodeElm.java:70`); optional internal node for series
  resistance (`DiodeElm.java:82`, `:166-175`). `Diode.doStep(vd)` (`Diode.java:140-192`): sets
  `converged = false` if `|vd - lastvoltdiff| > .01`, applies SPICE-style `limitStep` (`:83-131`, which
  also clears `converged` when it limits), `gmin = leakage*0.01`, ramping
  `gmin = exp(-9 ln10 (1 - subIterations/3000))` capped at `.1` once `sim.subIterations > 100`, then
  stamps `geq` with `stampConductance` and `nc` with `stampCurrentSource`. `calculateCurrent` uses the
  exact exponential (`:194-202`). `DiodeElm.stepFinished` stops on `|I| > 1e12` (`DiodeElm.java:275-279`).
- `VoltageElm`: one VS (`VoltageElm.java:458-460`), optional internal node for `internalResistance`
  (`:49`). DC stamps the value once; other waveforms stamp the structure and call
  `updateVoltageSource(..., getVoltage())` in `doStep()` (`:149-162`). `getVoltage()` uses `sim.t`,
  which is the time at the **start** of the step being solved (`:167-245`; `t` is advanced after the
  solve, `SimulationManager.java:1414`). Noise: `stepFinished()` draws a new value from `app.random`
  (`VoltageElm.java:163-166`).
- `RailElm`: one post, VS between ground and the post (`RailElm.java:39`, `:100-110`),
  `hasGroundConnection` true (`:111`).
- `WireElm`: no stamp at all (`WireElm.java:106-108`); removed by wire closure. `getPostCount()` is
  `busWidth*2` (`:40`).
- `GroundElm`: one post (`GroundElm.java:62`); no VS unless the old-style flag is set, in which case a
  0 V source from ground to the post (`:103-109`).
- `TransistorElm`: `nonLinear() = true` (`TransistorElm.java:82`); `stamp()` only no-op markers
  (`:341-345`); `doStep()` does convergence checks with `.01` thresholds, per-transistor gmin ramping
  after 100 local non-converged subiterations, junction limiting, then a full 3x3 `stampMatrix` block
  plus RHS (`:346-504`), and trapezoidal junction-capacitance companions computed in `startIteration()`
  (`:309-339`).

---

## 5. `simplifyMatrix` and `RowInfo`: removed

Neither exists at this commit (grep finds no `simplifyMatrix`, `RowInfo` or `circuitRowInfo` in `src/`).
The equivalent size reduction now comes from:

1. **Wire closure** (section 3): wires, labels and grounds never create nodes.
2. **Closure splitting** (`calculateClosures`, `SimulationManager.java:710-791`): each set of nodes
   connected through `getMatrixConnection` (not through ground) gets its own `CircuitMatrix`. Each
   matrix is factored and solved independently in `runCircuit` (`:1332-1382`).
3. **Sparse LU** for large matrices (section 6).

The `stampRightSide(node)` / `stampNonLinear(node)` markers that used to feed RowInfo are now empty
methods (`SimulationManager.java:1271-1277`). Port them as no-ops (keeping them makes element code a
1:1 transliteration).

---

## 6. LU factor and solve

### Dispatch

`lu_factor(a, n, ipvt, cm)` and `lu_solve(a, n, ipvt, b, cm)` are static and dispatch on
`theSim.usingSparse` (`SimulationManager.java:1702-1710`, `:1797-1804`).

`usingSparse` is chosen in `stampCircuit` (`:1012-1017`): `solverType` 2 forces sparse, 1 forces dense,
0 (AUTO, default) uses sparse when the **largest** matrix has `size >= SPARSE_THRESHOLD = 150`
(`:41-47`). `solverType` comes from the XML `st` attribute (`XMLDeserializer.java:72`; written only
when nonzero, `XMLSerializer.java:129-130`) and is reset to AUTO by `clearCircuit()`
(`CircuitLoader.java:46`). Dense and sparse give slightly different rounding, so goldens for circuits
whose largest closure has 150 or more rows need the sparse path too.

### Dense: `lu_factor_dense` (`SimulationManager.java:1716-1794`)

Crout LU, in place, with partial pivoting and **no scaling**:

1. Singular pre-check: any row that is entirely `0` returns false (`:1721-1732`).
2. For each column `j`:
   - upper part: for `i < j`, `a[i][j] -= sum_{k<i} a[i][k]*a[k][j]` (`:1738-1743`);
   - lower part: for `i >= j`, `a[i][j] -= sum_{k<j} a[i][k]*a[k][j]`, tracking the largest `|a[i][j]|`
     with `>=`, so ties pick the **last** such row (`:1746-1758`);
   - if `largestRow != j`, swap the **entire** rows (all `n` columns) (`:1761-1772`); `largestRow == -1`
     (only possible with NaN) logs and returns false;
   - `ipvt[j] = largestRow` (`:1775`);
   - `a[j][j] == 0.0` exactly returns false (`:1781-1785`);
   - if `j != n-1`, scale `a[i][j]` for `i > j` by `1.0/a[j][j]` (multiply by reciprocal, not divide)
     (`:1787-1791`).

### Dense: `lu_solve_dense` (`SimulationManager.java:1809-1844`)

```
for i in 0..n-1:                 // apply permutation until first nonzero
    row = ipvt[i]; swap = b[row]; b[row] = b[i]; b[i] = swap
    if swap != 0: break
bi = i; i++
for ; i < n; i++:                // forward substitution, unit-diagonal L, starting at bi
    row = ipvt[i]; tot = b[row]; b[row] = b[i]
    for j in bi..i-1: tot -= a[i][j]*b[j]
    b[i] = tot
for i = n-1 down to 0:           // back substitution
    tot = b[i]; for j in i+1..n-1: tot -= a[i][j]*b[j]
    b[i] = tot / a[i][i]
```

Port this exactly, including the "skip leading zeros" shortcut, to keep bit-identical results.

### Sparse (`matrix/`)

- `DMatrixSparseCSC.convert(a, EPS)` builds CSC, dropping entries with `|v| <= 2^-52`
  (`matrix/DMatrixSparseCSC.java:59`, `:378-403`). Dense keeps any nonzero.
- `SparseLU.setA` = `initialize` + `performLU` (`matrix/SparseLU.java:136-145`): left-looking
  Gilbert-Peierls LU (EJML-derived), no column ordering (`q = null`, `:65`), partial pivoting choosing the
  largest `|x[i]|` with strict `>` (first wins in `xi` order) (`:86-98`). Singular if no candidate or the
  max is `<= 0` (`:100-103`). There is no all-zero-row pre-check.
- `solve(B, X)`: `permuteInv`, `solveL`, `solveU` (`:150-172`); called with `b` as both input and output
  (`SimulationManager.java:1800`). The `permute` array is unused in sparse mode.
- One `SparseLU` per `CircuitMatrix` (`CircuitMatrix.java:17`, `SimulationManager.java:1706`).

### Singular matrix detection summary

Dense: zero row, NaN column, or exact zero pivot. Sparse: no pivot or zero max. Both lead to
`stop("Singular matrix!")` (`:1026`, `:1376`). There is also a NaN/Infinity scan of the matrix, but
only for matrices with `size < 8` (`:1350-1361`), giving `"nan/infinite matrix!"`.

`invertMatrix()` (`:1679-1700`) is a dense helper used by some elements; it ignores `usingSparse`.

---

## 7. `runCircuit`: iterations and subiterations

`SimulationManager.runCircuit(boolean didAnalyze)` (`SimulationManager.java:1282-1448`). After the
wall-clock gate (section 2), `delayWireProcessing = scopeManager.canDelayWireProcessing()` (`:1304`),
`timeStepCountAtFrameStart = timeStepCount`, `goodIterations = 100`.

Per **iteration** (one timestep):

```
if goodIterations >= 3 && timeStep < maxTimeStep:          (:1314-1320)
    timeStep = min(timeStep*2, maxTimeStep); stampCircuit(); goodIterations = 0
if TestManager.theManager != null: timeStep = clampTimeStep(t, timeStep)   (:1321-1322, inert, section 11)
for e in elmArr: e.startIteration()                       (:1325-1326)
ui.steps++
subiterCount = (adjustTimeStep && timeStep/2 > minTimeStep) ? 100 : 5000      (:1328)
for subiter = 0; subiter != subiterCount; subiter++:
    converged = true; subIterations = subiter              (:1330-1331)
    for m in matrices:                                     (:1332-1341)
        m.rightSide = copy of m.origRightSide
        if m.nonLinear: m.matrix = copy of m.origMatrix
    for e in elmArr: e.doStep()                            (:1342-1343)
    if stopMessage != null: return                         (:1344-1345)
    NaN/Inf scan for matrices with size < 8                (:1348-1361)
    for m in matrices:                                     (:1348-1382)
        if m.nonLinear:
            if converged && subiter > 0: continue          // skip factor AND solve
            if !lu_factor(m): stop("Singular matrix!"); return
        lu_solve(m); applySolvedRightSide(m)
    if !circuitNonLinear: break                            (:1385-1386)
    if converged && subiter > 0: break                     (:1387-1388)
if subiter == subiterCount:   // convergence failed        (:1390-1407)
    goodIterations = 0
    if adjustTimeStep: timeStep /= 2
    if timeStep < minTimeStep || !adjustTimeStep: stop("Convergence failed!"); break
    for m in matrices: setNodeVoltages(m, m.lastNodeVoltages)
    stampCircuit(); continue       // retry the same step (startIteration runs again)
goodIterations = (subiter < 3) ? goodIterations+1 : 0      (:1410-1413)
t += timeStep; timeStepAccum += timeStep                   (:1414-1415)
if timeStepAccum >= maxTimeStep: timeStepAccum -= maxTimeStep; timeStepCount++   (:1416-1419)
for e in elmArr: e.stepFinished()                          (:1420-1421)
if !delayWireProcessing: calcWireCurrents()                (:1422-1423)
app.onTimeStep()     // scopes sample + window.CircuitJS1.ontimestep   (:1424, CirSim.java:303-306)
if TestManager.theManager != null && checkTime(): break    (:1425-1426, inert)
for m in matrices: m.lastNodeVoltages = copy of m.nodeVoltages   (:1428-1432)
wall-clock checks, !simRunning check                       (:1435-1442)
```

After the loop: `lastIterTime = lit`; if `delayWireProcessing`, `calcWireCurrents()` once (`:1444-1446`).

Key semantics to preserve:

- **Matrix restore**: the RHS is restored from `origRightSide` for every matrix on every subiteration;
  the matrix itself only for nonlinear matrices (linear ones keep their LU factors from
  `stampCircuit`).
- **Minimum work**: a nonlinear circuit always runs at least two subiterations: solve at subiter 0, then
  at subiter 1 `doStep()` runs again and, if nothing cleared `converged`, the solve is skipped and the
  loop exits. The final node voltages are therefore from the previous solve, while element state
  updated in the last `doStep()` (for example `Diode.lastvoltdiff`, `Diode.java:145`) reflects them.
  A linear circuit runs exactly one subiteration.
- **Convergence flag**: `converged` is a field (`:1279`) reset to true at each subiteration; elements
  clear it. `applySolvedRightSide` also clears it if any solution entry is NaN (`:1455-1458`).
- **`calculateCurrent` timing**: `applySolvedRightSide` (`:1451-1471`) copies node rows into
  `m.nodeVoltages` (stopping at the first NaN), calls `vs.elm.setCurrent(vs, x)` for each non-NaN VS
  row, then `setNodeVoltages(m, m.nodeVoltages)` (`:1474-1484`), which calls
  `elm.setNodeVoltage(post, v)` for every link, and the default `setNodeVoltage` calls
  `calculateCurrent()` (`CircuitElm.java:322-325`). So currents are recomputed once per link per solve.
  Elements like `CapacitorElm` override `setNodeVoltage` to avoid that.
- **Per-element order within a step**: `startIteration` (once), then per subiteration `doStep`
  followed by the solve and `setCurrent`/`setNodeVoltage`/`calculateCurrent`, then `stepFinished`
  (once). All loops run over `elmArr` in flattened list order.
- **Max subiterations**: 100 when adaptive timestep is on and `timeStep/2 > minTimeStep`, else 5000.
  Consequence: the diode gmin ramp (`subIterations > 100`, `Diode.java:150`) only ever triggers in the
  5000 case.
- **Non-convergence**: without adaptive timestep, or once `timeStep < minTimeStep`, the result is
  `stop("Convergence failed!", null)`, console `"convergence failed after N iterations"`, matrices set
  to null, sim stopped. With adaptive timestep, node voltages are restored from `lastNodeVoltages` (but
  element-private state such as `Diode.lastvoltdiff` or transistor `lastvbe` is **not** restored) and
  the step is retried at half the timestep. The retry `continue` skips the wall-clock check, so a frame
  keeps retrying until success or stop.
- After a re-analysis, `CircuitMatrix` objects are new, so `lastNodeVoltages` starts as zeros
  (`:974-975`). A failed first step restores zeros.

---

## 8. Timestep control and integration method

### Variables (`SimulationManager.java:49-63`)

- `maxTimeStep`: the user's "Time step size". Default `5e-6` after `clearCircuit()`
  (`CircuitLoader.java:49`). Saved as `ts` (XML) or 2nd field of `$` (text).
- `minTimeStep`: default `50e-12` (`CircuitLoader.java:50`). Saved as `mts` or 7th field of `$`.
- `timeStep`: the current step. Set to `maxTimeStep` at every `preStampCircuit` (`:933`) and when
  loading (`CircuitLoader.java:258`, `XMLDeserializer.java:63`).
- `adjustTimeStep`: options flag bit `64` (`CircuitLoader.java:277`, `XMLSerializer.java:119`).
  Initial value false; note `clearCircuit()` does **not** reset it, so a text file without a `$` line
  inherits the previous circuit's value.
- `timeStepAccum`, `timeStepCount`: count of whole `maxTimeStep` periods elapsed (`:1414-1419`); used
  only for the frame budget.

### Adaptive behaviour

Not error-controlled; it only reacts to Newton non-convergence (section 7): halve on failure, and at
the top of an iteration double (capped at `maxTimeStep`) after 3 consecutive good iterations, where good
means converged in fewer than 3 subiterations (`:1314-1320`, `:1408-1413`). Since `goodIterations`
starts at 100 per `runCircuit` call, a reduced timestep doubles at the start of every frame. Each change
calls `stampCircuit()` so companion models pick up the new `sim.timeStep`. Console messages:
`"timestep up = ..."`, `"timestep down to ..."`, `"converged after N iterations, timeStep = ..."`.

Other writers of `timeStep`: `AudioOutputElm` (`AudioOutputElm.java:219-234`), and the JS API
`setTimeStep` / `setMaxTimeStep` (`JSInterface.java:49-51`) which do **not** re-stamp, so companion
resistances keep the old value until the next analysis (the JS comment references issue #843,
`JSInterface.java:59`).

### Integration method

There is no global switch. Each reactive element chooses with its own flag bit `2`
(`FLAG_BACK_EULER`): trapezoidal when clear (default), backward Euler when set.

- `CapacitorElm.isTrapezoidal()` (`CapacitorElm.java:32`, `:55`), edited via the "Trapezoidal
  Approximation" checkbox (`:240`, `:255-257`).
- `Inductor.isTrapezoidal()` (`Inductor.java:23`, `:45`), used by `InductorElm` (`InductorElm.java:135`,
  `:151-153`) and `CustomTransformerElm` (`CustomTransformerElm.java:224`).
- `DCMotorElm` hard-codes backward Euler (`DCMotorElm.java:30-31`).
- Transistor junction capacitances always use trapezoidal (`TransistorElm.java:309-339`).

DC operating point: `CommandManager.doDCAnalysis` sets `dcAnalysisFlag` (`CommandManager.java:369-370`);
elements query it with `doDcAnalysis()` (`CircuitElm.java:1350`), for example capacitors become `1e8`
resistors and waveform sources output their bias (`CapacitorElm.java:147-153`, `VoltageElm.java:168-169`).
The flag is cleared after one frame and the circuit re-analyzed (`UIManager.java:771-774`). If
`autoDCOnReset` (flag bit 128) is set, reset does this automatically (`UIManager.java:1377-1378`).

Reset (`UIManager.resetAction`, `UIManager.java:1374-1386`): `analyzeFlag = true`, `sim.resetTime()`
(`t = timeStepAccum = 0`, `timeStepCount = 0`, `SimulationManager.java:85-88`), `reset()` on every
element, reset scope graphs.

---

## 9. Current calculation

### Non-wire elements

Elements compute `current` in `calculateCurrent()` (called through `setNodeVoltage`) or receive it via
`setCurrent(vs, c)` from the VS unknown (`CircuitElm.java:271`). The default
`getCurrentIntoNode(n)` returns `-current` for post 0 of a 2-post element, else `current`
(`CircuitElm.java:1397-1403`).

### Wires (`calcWireInfo` + `calcWireCurrents`)

Wire-like elements have no matrix presence, so their current is derived from neighbours.

`getWireSegments` creates one `WireSegment` per bit (`SimulationManager.java:112-124`):

- default (wires, grounds): `endpoint0 = key(getPost(b))`, `endpoint1 = key(getConnectedPost(b))` or
  null if the same point (`CircuitElm.java:803-812`);
- labels: `endpoint1 = "label:" + text` (or `"label:text:bit"`) (`LabeledNodeElm.java:136-142`).

`calcWireInfo()` (`SimulationManager.java:371-481`) orders segments so that each can be resolved from
already-resolved data:

- For each segment, collect neighbours from `cn.links` of its node: elements (other than itself and
  only those in the same element set) whose post at `cnl.num` sits exactly at `endpoint0` go to
  `neighbors0`, those at a non-label `endpoint1` go to `neighbors1` (`:405-425`). A neighbour that is
  itself a removable wire not yet resolved for that bit makes that side "not ready".
- Label segments also collect all other segments with the same `label:` key as `labelNeighbors`
  (`:428-439`).
- `GroundElm` starts with side 1 not ready (`:402`).
- If side 0 is ready, use it (`post = 0`); else if side 1 is ready use it (`post = 1`) with label
  neighbours; else move the segment to the end of the list and retry. If more than `2 * size`
  consecutive moves happen, it logs the unresolved list and calls `stop("wire loop detected", wire)`
  (`:441-468`).

`calcWireCurrents()` (`:1488-1523`) walks the ordered list: for `post == 0` sum
`ce.getCurrentIntoNode(ce.getNodeAtPoint(p))` over neighbours at `getPost(bit)`; for `post == 1`, sum
label neighbours' stored `current` or neighbour currents at `getConnectedPost(bit)`; negate when
`post != 0`; `wire.setWireCurrent(bit, cur)` and store `ws.current` for later label neighbours.
`getNodeAtPoint` falls back to 0 when no post matches (`CircuitElm.java:832-839`).

Called after every step, unless no scope is viewing a wire (`canDelayWireProcessing`,
`ScopeManager.java:194-203`), in which case it runs once per frame after the loop
(`SimulationManager.java:1304`, `:1422-1423`, `:1445-1446`). A golden harness that records wire
currents per step must force the per-step behaviour.

---

## 10. Determinism and porting hazards

### Randomness

- `CirSim.random` is an unseeded `java.util.Random` (`CirSim.java:45`, `:215`). GWT emulates the JDK
  48-bit LCG, but the default seed is not reproducible. Users:
  - `CirSim.getrand(x)`: `q = nextInt(); if (q < 0) q = -q; return q % x` (`CirSim.java:124-129`; note
    `-Integer.MIN_VALUE` stays negative in Java int math);
  - `GateElm.doStep` random tie-break after more than 50 oscillations with zero propagation delay
    (`GateElm.java:346-358`);
  - `OpAmpElm.doStep` random escape from saturation (`OpAmpElm.java:176-179`);
  - `VoltageElm.stepFinished` noise waveform `(nextDouble()*2-1)*maxVoltage + bias`
    (`VoltageElm.java:163-166`). `NoiseElm` extends `RailElm` (`NoiseElm.java:22`).
- `com.google.gwt.user.client.Random.nextDouble()` (backed by `Math.random`) is used only in
  `drawDots` (`CircuitElm.java:502`), display only.

The port should inject a seeded PRNG. Bit-exact comparison against the reference is impossible for
circuits that hit these paths, because the reference seed cannot be set from outside.

### Wall clock

- Steps per frame (section 2) depend on `System.currentTimeMillis()` (`SimulationManager.java:1292`,
  `:1435`).
- Display only: `currentMult` (`UIManager.java:630-643`), `SweepElm.draw` (`SweepElm.java:92`).
- Simulation state as a function of step count is otherwise independent of the wall clock.

### Ordering

- Element list order fixes: node numbering (`makeNodeList`), ground fallback choice (`setGroundNode`),
  voltage-source numbering, matrix row order, the order of `+=` accumulation into matrix entries during
  `stamp()`/`doStep()`, and the order of `startIteration/doStep/stepFinished`. The flattened composite
  children come after all top-level elements (`SimulationManager.java:859-864`).
- `CompositeElm.buildCompNodeList()` appends internal nodes by iterating a `HashMap<Integer,
CircuitNode>` (`CompositeElm.java:169-219`). Its order depends on GWT's `HashMap` emulation and
  determines internal node numbering inside subcircuits. Verify against the reference build; a
  `Map` with insertion order is the likely match but this is unconfirmed.
- `calculateWireClosure` iterates a `HashMap` while merging, but the result does not depend on order.
  `makePostDrawList` iteration order affects only drawing.
- Dense pivoting ties choose the last row (`>=`, `SimulationManager.java:1754`); sparse ties choose the
  first candidate (`>`, `matrix/SparseLU.java:90`).

### Numbers and text

- Coordinates and flags are Java `int` (`CircuitLoader.java:194-198`); dump type parsing takes the first
  character of the token, or `parseInt` of the whole token if it starts with a digit
  (`CircuitLoader.java:145`, `:172-173`).
- Number formatting differs by origin: GWT's `String.valueOf(double)` prints JS style, so XML written
  by the app has `ts="0.000005"` (`auto-tests/capac.txt:1`), while files from the Java era have
  `5.0E-6` (`src/com/lushprojects/circuitjs1/public/circuits/ohms.txt:1`). The parser must accept both.
- `QueryParameters.getBooleanValue` uses `val=="1"` (`QueryParameters.java:56`), which only works
  because GWT compiles `==` on strings to JS `===`.
- `getXmlDumpType()` is the dump type as a character for `64 < t < 127`, else the class name minus
  `"Elm"` (`CircuitElm.java:114-119`).

### Other hazards

- `voltageSources` array sizing (section 3).
- Exceptions inside `runCircuit` are swallowed by `updateCircuit` and only logged
  (`UIManager.java:619-626`), so the reference may silently continue with partial state.
- Cross-matrix stamps are logged but still applied to the first node's matrix
  (`SimulationManager.java:1229-1232`).

---

## 11. Existing test infrastructure

### `TestManager` is stubbed out

The active class is a stub (`TestManager.java:19-33`): every method is empty, `clampTimeStep` returns
0, and the constructor does not set `theManager`. The real implementation is in a block comment
(`TestManager.java:35-418`). `TestManager.enabled = true` (`:21`) only makes `UIManager` construct the
stub and call its empty `createUI` (`UIManager.java:354-357`). Since `theManager` stays null, the hooks
in `runCircuit` (`SimulationManager.java:1321-1322`, `:1425-1426`) and the XML tag handlers
(`XMLDeserializer.java:147-175`) are inert, and the `test`/`testlist` URL parameters are not read.

### What the commented-out implementation does (design reference for our harness)

- URL `?test=<file>` loads `http://127.0.0.1:5001/auto-tests/<file>`; `?testlist=<file>` loads a list
  of names and runs them in sequence (`TestManager.java:69-145`).
- `startTest()` calls `resetAction()` and starts running (`:164-169`).
- Recording: "Start Test" resets and snapshots the dump (`:320-327`); `SwitchElm.toggle()` calls
  `recordSwitchToggle` (`SwitchElm.java:192`, `TestManager.java:172-180`) which records `(sim.t,
element index)`. "Stop Test" downloads the circuit with these tags inserted before `</cir>`
  (`:350-371`):
  - `<test len="T"/>`: test length in sim seconds;
  - `<switchevent t="T" en="N"/>`: toggle element N (index in `elmList`) at time T;
  - `<scopedata si pi en v u sp ts>v0,v1,...</scopedata>`: the `maxValues` of scope `si`, plot `pi`,
    for the last `scopePointCount` samples whose time is `>= 0` (`:380-417`).
- Playback: `clampTimeStep` shortens the step so it lands exactly on the next switch event or on `len`
  (`:213-226`); `checkTime` toggles due switches then forces re-analysis and breaks the frame, and at
  `t >= len` stops and compares (`:230-259`).
- Comparison: per sample, pass if `|actual - expected| <= max(1e-3 * |expected|, 1e-9)`
  (`:62`, `:280-295`).

Seven recorded tests exist in `auto-tests/` (`analogmux`, `capac`, `fullrect-sc`, `lrc`, `lrcswitch`,
`ota-vca`, `td4`), all in XML with one `<test>` and 2 to 8 `<scopedata>` tags; `analogmux` has 3 and
`lrcswitch` 1 `<switchevent>`. These are directly reusable as golden data, with the caveat that scope
samples are per-pixel min/max buckets (`ScopePlot.java:99-121`) taken every
`maxTimeStep * scopePlotSpeed` of sim time.

`tests/` holds 30 more circuits in the old text format with no expected data.

### `TestCreator`

`TestCreator.enabled = false` (`TestCreator.java:10`) and the body is commented out (`:13-99`). When
enabled it would wrap a selected chip with logic inputs and outputs (menu hook `Menus.java:248`,
command `CommandManager.java:156`).

---

## 12. JS interface

`JSInterface.setupJSInterface()` assigns `window.CircuitJS1` with exactly these 13 functions
(`JSInterface.java:55-69`):

| Name                                   | Behaviour                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `setSimRunning(run)`                   | `app.setSimRunning(run)`                                                                                  |
| `getTime()`                            | `sim.t`                                                                                                   |
| `getTimeStep()`                        | `sim.timeStep`                                                                                            |
| `setTimeStep(ts)`                      | `sim.timeStep = ts` (no re-stamp; comment says "don't use this, see #843")                                |
| `getMaxTimeStep()`                     | `sim.maxTimeStep`                                                                                         |
| `setMaxTimeStep(ts)`                   | `sim.maxTimeStep = sim.timeStep = ts` (no re-stamp)                                                       |
| `isRunning()`                          | `app.simRunning`                                                                                          |
| `getNodeVoltage(name)`                 | voltage of a labeled node, 0 if unknown or ground (`SimulationManager.java:1846-1853`)                    |
| `setExtVoltage(name, v)`               | sets every `ExtVoltageElm` with that name (`JSInterface.java:14-24`, ignores NaN `ExtVoltageElm.java:50`) |
| `getElements()`                        | array of element objects with JS methods attached (`JSInterface.java:28-37`)                              |
| `getCircuitAsSVG()`                    | triggers SVG export, result arrives via `onsvgrendered`                                                   |
| `exportCircuit()`                      | `app.dumpCircuit()` (XML)                                                                                 |
| `importCircuit(text, subcircuitsOnly)` | `app.importCircuitFromText` (`CirSim.java:425-434`)                                                       |

Element methods added by `addJSMethods()` (`CircuitElm.java:1447-1456`): `getType`, `getInfo`,
`getVoltageDiff`, `getVoltage(n)`, `getCurrent`, `getLabelName`, `getPostCount`.

Hooks (`JSInterface.java:70-97`):

- `window.oncircuitjsloaded(CircuitJS1)`: once, after setup (`:70-72`).
- `CircuitJS1.onupdate`: end of every `updateCircuit()` frame (`UIManager.java:804-806`).
- `CircuitJS1.onanalyze`: end of every successful `preStampCircuit` (`SimulationManager.java:936`).
- `CircuitJS1.ontimestep`: after every completed timestep, synchronously inside `runCircuit`, after
  `stepFinished` and scope sampling (`CirSim.java:303-306`, `SimulationManager.java:1424`).
- `CircuitJS1.onsvgrendered(CircuitJS1, svg)` (`ImageExporter.java:134`).

There is no step-N or seed API. Useful tricks for driving the reference deterministically:

- Count steps in `ontimestep` and call `setSimRunning(false)` at step N: the loop checks
  `!app.simRunning` right after the hook (`SimulationManager.java:1441-1442`), so it stops exactly after
  that step (wire currents may still be pending if delayed, see section 9).
- Use `?running=false` and maximum speed with a high "Minimum Target Frame Rate" to get many steps per
  frame; the result per step is still deterministic apart from RNG.
- Sample values per step with `getElements()` / `getNodeVoltage` inside `ontimestep`.
- `importCircuit` resets `lastIterTime` (via `clearCircuit`, `CircuitLoader.java:63`), so the first frame
  after import runs no steps.

---

## Answers for PLAN section 4

**(a) Compressed link format `ctz=`: confirmed.** Encoder is lz-string `compressToEncodedURIComponent`:
`ExportAsUrlDialog.compress` returns `$wnd.LZString.compressToEncodedURIComponent(dump)` and builds
`"?ctz=" + compress(dump)` (`ExportAsUrlDialog.java:91-93`, `:101`). Decoder:
`LZString.decompressFromEncodedURIComponent` (`CirSim.java:138-140`, used at `:190-192`). Library is
`war/lz-string.min.js`, loaded by `war/circuitjs.html:158`. Note the dump being compressed is now XML
(`CommandManager.java:342-344`).

**(b) MNA with LU and per-timestep nonlinear iteration: confirmed, with corrections.** Core methods
are on `SimulationManager`, not `CirSim`: `analyzeCircuit` (`:817`), `preStampCircuit` (`:834`),
`makeNodeList` (`:533`), `calculateClosures` (`:710`), `stampCircuit` (`:961`), `runCircuit` (`:1282`),
`lu_factor`/`lu_solve` (`:1702`, `:1797`), `applySolvedRightSide` (`:1451`), `calcWireCurrents`
(`:1488`). Element side: `stamp`, `startIteration`, `doStep`, `stepFinished`, `calculateCurrent`,
`nonLinear` (`CircuitElm.java:288`, `:316`, `:309`, `:1394`, `:328`, `:797`). Corrections: there is
no `simplifyMatrix`/`RowInfo`; the system is split into one matrix per closure; LU is dense Crout with
partial pivoting or EJML sparse LU for matrices of 150+ rows.

**(c) Element classes mix simulation, drawing, editing and serialization: confirmed.** On
`CircuitElm`: simulation `stamp`, `doStep`, `startIteration`, `stepFinished`, `calculateCurrent`,
`getConnection`, `hasGroundConnection`, `getCurrentIntoNode`, `validate` (`CircuitElm.java:288`,
`:309`, `:316`, `:1394`, `:328`, `:1284`, `:1292`, `:1397`, `:1355`); drawing `draw`, `setPoints`,
`drawPosts`, `getInfo` (`:265`, `:331`, `:706`, `:1183`); editing `getEditInfo`, `setEditValue`, `drag`,
`move`, `flipX` (`:1279`, `:1280`, `:558`, `:610`, `:682`); serialization `dump`, `getDumpType`,
`getXmlDumpType`, `dumpXml`, `undumpXml`, `dumpXmlState` (`:252`, `:107`, `:114`, `:1417`, `:1423`,
`:1427`) plus the `(x1,y1,x2,y2,f,StringTokenizer)` constructor (`:229`); also routing
(`addRoutingObstacle`, `:291`) and JS (`addJSMethods`, `:1447`).

**(d) Text circuit format: confirmed as a load format; corrected as the save format.** Text: first
token of each line selects the record. `$` options = `flags maxTimeStep iterCount currentBar
voltageRange powerBar minTimeStep` (`CircuitLoader.java:249-269`); elements are `type x1 y1 x2 y2 flags
params...` (`CircuitLoader.java:194-200`, `CircuitElm.java:252-256`); `o` scopes (`:149-154`). Also `h`
hint, `!` custom logic model, `%`/`?`/`B` ignored, `34` diode model, `32` transistor model, `38`
slider, `.` subcircuit model (`:155-192`). Token delimiters include `+` (`" +\t\n\r\f"`, `:142`).
The app **writes XML by default**: `CirSim.dumpCircuit()` uses `XMLSerializer.dumpCircuit()`
(`CirSim.java:452-464`; the text `dumpOptions()` call is commented out at `:460`). XML root is
`<cir f ts ic cb pb vr mts [st]>` with one child per element, tag = `getXmlDumpType()`, attribute
`x="x1 y1 x2 y2"`, `f=flags` plus element attributes, and `o`, `adj`, `h`, model tags
(`XMLSerializer.java:106-150`, `XMLDeserializer.java:87-192`). The loader decides by
`text.startsWith("<")` (`CircuitLoader.java:74-80`); the root tag name is not checked.

**(e) Example circuits: corrected location.** They are in
`src/com/lushprojects/circuitjs1/public/circuits/` (373 files: 335 text, 38 XML) with index
`src/com/lushprojects/circuitjs1/public/setuplist.txt` (format: `#` comment, `+Name` submenu, `-` end
submenu, `file Title`, `>file Title` default; parsed in `Menus.java:548-600`). `war/` has no circuits;
GWT copies `public/` into the module output, which `makeSite` places under `site/circuitjs1/`
(`build.gradle:130-156`). Fetched at runtime from `GWT.getModuleBaseURL() + "setuplist.txt"` and
`+ "circuits/" + name` (`Menus.java:520`, `:608`).

**(f) Adaptive timestep: confirmed, opt-in and convergence-driven only.** Flag bit 64 sets
`adjustTimeStep` (`CircuitLoader.java:277`); halve on non-convergence down to `minTimeStep`, double
after 3 good steps up to `maxTimeStep` (`SimulationManager.java:1314-1320`, `:1390-1407`). No
truncation-error control.

**(g) Separate simulation speed and current speed sliders: confirmed**, plus a third "Power
Brightness" slider: `speedBar` 0..260 (`UIManager.java:326-330`), `currentBar` 1..100
(`UIManager.java:332-335`), `powerBar` 1..100 (`UIManager.java:336-339`). Current speed only affects
dot animation (`UIManager.java:630-638`).

**(h) URL parameters actually parsed.** `QueryParameters` splits `location.search` on `&` and `=` and
URL-decodes the value (`QueryParameters.java:29-40`).

- `CirSim.init` (`CirSim.java:185-202`): `cct` (text circuit, `%24` replaced by `$`), `ctz`
  (compressed, overrides `cct`), `startCircuit`, `startLabel`, `startCircuitLink` (Dropbox link),
  `running`, `positiveColor`, `negativeColor`, `neutralColor`, `selectColor`, `currentColor`,
  `mouseMode`.
- `UIManager` init (`UIManager.java:134-152`): `euroResistors`, `IECGates`, `usResistors`, `showOhm`,
  `running`, `hideSidebar`, `hideMenu`, `whiteBackground`, `conventionalCurrent`, `editable`,
  `mouseWheelEdit`, `positiveColor`, `negativeColor`, `neutralColor`, `selectColor`, `currentColor`,
  `mouseMode`, `hideInfoBox`.
- `circuitjs1.loadLocale` (`circuitjs1.java:69-70`): `lang`.
- Inactive (commented out): `test`, `testlist` (`TestManager.java:73`, `:79`).
  Distinct active names: 24.

**(i) Element class and dump type counts: corrected mechanism.** 154 classes extend `CircuitElm`
(151 concrete; `ChipElm`, `CompositeElm`, `GateElm` abstract), including two nested classes
(`CC2NegElm` in `CC2Elm.java`, `PJfetElm` in `NJfetElm.java`). Resolving inherited `getDumpType()`
over concrete classes gives 124 distinct nonzero dump types; 10 concrete classes return 0 and are
XML-only (`BatteryElm`, `BusLogicInputElm`, `BusTransceiverElm`, `CustomCompositeChipElm`,
`GraphicElm`, `GyratorElm`, `InstructionDisplayElm`, `NortonAmpElm`, `RoutedWireElm`,
`WattmeterTrueElm`). Shared types: `'R'` (5 rail classes), `'v'` (3), `'t'`, `'f'`, `'j'`, `400` (3
each), `'a'`, `'s'`, `179` (2 each). There is no `switch` in `createCe` any more: it looks the type up
in `dumpTypeMap` and calls the GWT-generated factory by class name (`CirSim.java:612-620`); legacy
`'n'` maps to `NoiseElm` (`:614`). `dumpTypeMap`/`xmlDumpTypeMap` are filled at runtime by
`CirSim.register()` (`CirSim.java:576-610`) for each menu class (`UIManager.java:1417-1422`, via
`Menus.makeClassCheckItems`, `Menus.java:492-496`, 143 distinct class names in `Menus.java`), plus
`CCVSElm`/`VCCSElm` (`Menus.java:360-361`) and `ScopeElm` 403 (`UIManager.java:169-170`). The factory
covers concrete subclasses with an `(int,int)` constructor (146 of them) or the 6-arg undump
constructor (`../rebind/ElementFactoryGenerator.java:93-127`). Counts were produced by a script over
the source with comments stripped; treat them as plus or minus one for unusual declarations.
