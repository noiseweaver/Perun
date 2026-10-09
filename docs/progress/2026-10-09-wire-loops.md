# Wire loops no longer stop the simulation (2026-10-09)

## Done

- `Simulation.calcWireInfo` no longer stops with "wire loop detected": when only wires in a closed
  loop are left, one gets zero current and the loop resolves from it
  (docs/deviations/wire-loops.md). Tests in `packages/format/src/wireLoop.test.ts`; all 44
  goldens still pass.

## Next

- Nothing planned.

## Open issues

- None.
