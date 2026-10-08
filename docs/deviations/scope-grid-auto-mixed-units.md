# Scope grid in auto scale with mixed units

- Upstream: A scope in auto scale showing plots in different units (voltage and current) draws only the zero line, with no scale
- Ours: The card look draws the grid and its values for one plot's units: the selected plot, else the first voltage, so volts per division read as in manual scale. Upstream's look is unchanged
- Why: Owner's request (2026-10-08)
- Golden test: Not simulation: drawing only, `packages/app/e2e/scopes.spec.ts`
