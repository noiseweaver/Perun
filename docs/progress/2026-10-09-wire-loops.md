# Wire loops no longer stop the simulation (2026-10-09)

## Done

- `Simulation.calcWireInfo` no longer stops with "wire loop detected": when only wires in a closed
  loop are left, one gets zero current and the loop resolves from it
  (docs/deviations/wire-loops.md). Tests in `packages/format/src/wireLoop.test.ts`; all 44
  goldens still pass.
- Phones (width under 720 px): the "Drag to place" chip sits under the Sliders pill instead of
  sliding beneath it, and a long part name is cut with an ellipsis (Gady's report, same thread).

## Next

- Nothing planned.

## Open issues

- None.
