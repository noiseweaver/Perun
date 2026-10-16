# Behavioural op-amp models (TL072, NE5532, RC4558, LM358, LM833, OPA2134, TL082, custom)

- Upstream: the real op-amp (`OpAmpRealElm`, dump type 409) offers LM741 and LM324, both
  transistor-level, chosen by model number (`mt` 0 to 2). It has no op-amp model editor.
- Ours: named behavioural models after upstream's, built from datasheet figures in
  `packages/elements/src/models/audioParts.ts` (`OPAMP_PARTS`) and simulated by
  `packages/elements/src/elm/opAmpMacro.ts`: a single-pole Boyle-style macromodel with the
  datasheet unity-gain bandwidth, slew rate, open-loop gain, input resistance and bias current
  (negative for PNP inputs, flowing out), output headroom to each rail, output resistance and
  current limit, and quiescent supply current drawn from the rails. Not modelled: noise, offset,
  input common-mode limits (the TL072's phase reversal), a second pole, load-dependent swing, the
  LM358's crossover distortion.
- Custom models (`models/OpAmpModel.ts`): "Create New Model" copies the current model (the TL072
  from an LM741 or LM324) into the model dialog; "Edit Model" edits a custom one (datasheet
  models are read-only). A custom model can be kept in "My Models" (the browser's storage, key
  prefix `opamp-model:`), which adds it to every circuit's list.
- Saving: the op-amp is written as an LM741 (`mt="0"`) with the model's slew rate and current
  limit in `slr` and `cl`, plus the model name in `om`. A custom model is written as an `om`
  record (`nm gbw sr av rin ib iq il ro hh hl`) before the first op-amp using it. CircuitJS1's
  XML reader skips records without an `x` attribute and ignores unknown attributes (read from
  `XMLDeserializer.java` and `OpAmpRealElm.java`, not run), so it opens such a circuit with an
  LM741 at the model's slew rate and current limit. Model numbers 3 to 5, written by the first
  preview build, read as the TL072, NE5532 and RC4558. A circuit's `om` record can't change a
  datasheet model of the same name.
- Why: the owner wants accurate audio op-amps (2026-10-14) and to edit op-amp models and add
  their own (2026-10-15).
- Golden test: none changes; `packages/format/src/opAmpMacro.test.ts` checks gain, bandwidth,
  slew rate, clipping on ±15 V and 9 V, recovery from clipping, supply and bias currents and the
  current limit for each datasheet model, and the model dialog, saving, reading back and the kept
  models.
