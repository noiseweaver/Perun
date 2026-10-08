# Current dots while paused

- Upstream: Draws no current dots while the simulation is stopped
- Ours: Options > Show current when paused (a user setting, on by default) keeps the dots on screen, standing still where they were; off matches upstream
- Why: Owner's request (2026-10-08): see which way current flows in a paused or rewound circuit
- Golden test: Not simulation: drawing only, `packages/app/e2e/viewer.spec.ts`
