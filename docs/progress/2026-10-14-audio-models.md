# 2026-10-14: accurate audio part models

Branch `claude/project-thread-6syl7l`. Gady asked for more accurate audio models (thread "Really
thinking about how to make our circuit sim core more robust") and picked "Both" on a card: audio
models here, and an ngspice-in-the-browser spike reported separately in
`/mnt/project-files/analyze-spike/`.

## Done

- Named parts (`models/audioParts.ts`, docs/deviations/audio-part-library.md): six transistors,
  five diodes and LEDs, four JFETs. Values from the manufacturers' SPICE models where marked
  `spice`, fitted to datasheet typicals where marked `fit`. Saved into circuits so CircuitJS1
  opens them.
- JFET gate leakage from the model (`gis`), so 1 MΩ gate resistors no longer shift the bias by
  about 0.17 V as with upstream's default gate diode.
- TL072, NE5532 and RC4558 in the real op-amp (`elm/opAmpMacro.ts`,
  docs/deviations/audio-op-amps.md): an analytic core element plus linear parts, converging in a
  few iterations at the default 5 µs step even while clipping hard.
- Tests: `format/src/audioParts.test.ts`, `format/src/opAmpMacro.test.ts`.

## Next

- Gady tries them in the preview artifact.
- Possible: germanium temperature behaviour (EG 0.67), the TL072's phase reversal near V-, more
  parts on request.

## Open issues

- JFETs below VTO still conduct through upstream's 100 MΩ drain-source leak.
- The fitted parts (AC128, 1N34A, LEDs, J201, 2N5460) are typical values; real parts vary widely.
