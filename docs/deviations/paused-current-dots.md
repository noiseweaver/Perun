# Current dots while paused

- Upstream: draws no current dots while the simulation is stopped (`CircuitElm.drawDots`).
- Ours: Options > Show current when paused (a user setting, on by default) keeps the dots on
  screen, standing still where they were; off matches upstream.
- Why: owner's request (2026-10-08), to see where current flows in a paused or rewound circuit.
- Golden test: none (display only); `packages/app/e2e/viewer.spec.ts`.
