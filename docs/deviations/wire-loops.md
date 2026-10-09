# Closed loops of wires

- Upstream: stops the simulation with "wire loop detected" when wires form a closed loop (two
  wires between the same two points, a second wire path between already joined points, or a ring
  of wires), because each wire's current is taken from its neighbours and no wire in the loop
  has all of them (`SimulationManager.calcWireInfo`). The circuit stays stopped until the user
  finds and deletes a wire of the loop.
- Ours: when only loop wires are left unresolved, one of them is given zero current and the rest
  of the loop is worked out from it, so the circuit runs. Node voltages are unchanged (wires are
  not in the matrix); only how the current is split between the parallel wires, which ideal wires
  leave undetermined, is a choice.
- Why: owner's bug report (2026-10-09): after editing connections the app showed "wire loop
  detected", and restoring the last circuit on launch brought the stop back every time.
- Golden test: none (upstream refuses these circuits, so there is no trace to record);
  `packages/format/src/wireLoop.test.ts`. All existing goldens are unchanged.
