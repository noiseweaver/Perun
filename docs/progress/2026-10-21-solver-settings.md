# 2026-10-21: Solver settings, guide and ringing notice

Branch `claude/project-thread-nuyayx`. It started as Gady's report of scope traces drawn as a
filled band. Gady then picked "Solver section + ringing hint".

## Cause of the band

A 2N3904's junction capacitances sit on an op-amp's virtual ground. With trapezoidal
integration they make the op-amp output flip sign on every step. CircuitJS1 does the same; I
checked it in the reference build. Notes and screenshots are in the project folder
`scope-band/`.

## Done

- Engine: `Simulation.integration` (`IntegrationMethod`: PER_PART = upstream, BACKWARD_EULER,
  DAMP_SEMICONDUCTORS) and `Simulation.trapezoidal(part)`. Capacitors, inductors, transformers
  and transistor junctions follow it. It is saved as `im` when not the default.
- Options > Simulation settings has a Solver section. It holds the integration method, upstream's
  matrix solver choice (Auto, Dense, Sparse, already saved as `st`), and a "Which one?" guide
  with two small pictures.
- Scope cards show a "Solver ringing?" pill while a shown trace has turned around on 64 steps in
  a row by more than 0.1 % of its peak (`ScopePlot.ringing`, held for 2000 steps). Clicking it
  opens Simulation settings on the guide. A mini card shows a dot. None of the upstream examples
  triggers it.
- Tests in `packages/format/src/integrationMethod.test.ts`; deviation in
  `docs/deviations/integration-method.md`. New strings are English only.

## Next / open

- A scope "Fit" button (auto time per division) is on hold (Gady's pick).
- The varactor and the battery's internal capacitance stay trapezoidal.
