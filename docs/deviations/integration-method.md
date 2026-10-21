# Integration method (Simulation settings > Solver)

- Upstream: capacitors, inductors and transformers integrate with the trapezoidal rule unless the
  part's own "Trapezoidal Approximation" box is cleared. Transistor junction capacitances (CJE,
  CJC, TF/TR diffusion) are always trapezoidal. MOSFET gate capacitances are always backward
  Euler.
- Ours: a per-circuit integration method, saved as the extra XML attribute `im` only when it is
  not the default (CircuitJS1 ignores it).
  - "Trapezoidal (CircuitJS1)" (`im` absent, the default) is upstream, unchanged.
  - "Damp transistor capacitances" (`im="2"`) uses backward Euler for transistor junction
    capacitances only.
  - "Backward Euler" (`im="1"`) uses it for those and for every capacitor, inductor and
    transformer (CapacitorElm and its subclasses, InductorElm, the transformers), whatever
    their own box says.
  - The varactor and the battery's internal capacitance stay trapezoidal in every mode.
  - Scope cards also show a "Solver ringing?" notice while a shown trace flips on every step,
    which opens the solver guide in Simulation settings.
- Why: owner's report (2026-10-21). A 2N3904 (CJE 4.5 pF, CJC 3.6 pF) with its emitter on an
  inverting op-amp's input made the op-amp output flip sign on every timestep. The flip grew to
  ±59 mV, the real signal is about 0.3 mV, and scopes drew it as a solid band. The reference
  build gives identical numbers. Trapezoidal integration never damps a mode far faster than the
  timestep, and no timestep from 100 ns to 20 µs stopped it. Backward Euler damps it. Gady chose
  a general solver setting with a guide over a junction-only switch.
- Golden test: none changed, since the default is upstream's method and every golden and
  example runs with it. `packages/format/src/integrationMethod.test.ts` runs the owner's circuit
  in all three modes, checks the save attribute, and checks the ringing notice. A scan of the
  259 upstream examples with scopes shows no notice.
