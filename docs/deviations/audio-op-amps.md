# TL072, NE5532 and RC4558 op-amps

- Upstream: the real op-amp (`OpAmpRealElm`, dump type 409) offers LM741 and LM324, both
  transistor-level.
- Ours: three more models, TL072, NE5532 and RC4558 (`mt` 3, 4 and 5), built from datasheet
  figures in `packages/elements/src/elm/opAmpMacro.ts`: a single-pole Boyle-style macromodel with
  the datasheet unity-gain bandwidth, slew rate, open-loop gain, input resistance and bias
  current, output headroom, output resistance and current limit, and quiescent supply current
  drawn from the rails. Picking one sets the slew rate and current limit fields to its datasheet
  values. Not modelled: noise, offset, input common-mode limits (the TL072's phase reversal),
  a second pole, load-dependent swing.
- Why: the owner wants accurate audio op-amps (2026-10-14). CircuitJS1 can't open a circuit using
  one of these models (it knows only model numbers 0 to 2).
- Golden test: none changes; `packages/format/src/opAmpMacro.test.ts` checks gain, bandwidth,
  slew rate, clipping on ±15 V and 9 V, recovery from clipping, supply and bias currents and the
  current limit for each model.
