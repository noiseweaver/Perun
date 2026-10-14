# Named audio parts

- Upstream: transistors offer only "default" and "spice-default"; JFETs only "default-jfet"
  (gate junction from the default diode, about 0.17 µA of leakage); diodes the upstream list.
- Ours: named parts in `packages/elements/src/models/audioParts.ts`: 2N3904, 2N3906, 2N2222A,
  2N5088, BC547B and a germanium AC128; 1N914, a germanium 1N34A and red, green and blue LEDs;
  2N3819, 2N5457, J201 and 2N5460 JFETs. Each is a parameter set for the existing upstream
  models, read-only in the model editor. Picking a transistor or JFET part also sets its beta and
  polarity. Parts are saved into the circuit like a custom model (`tm`, `dm`, `mm` records), so
  CircuitJS1 opens them with the same parameters. JFET parts add a gate junction saturation
  current, saved as the extra attribute `gis` on the `mm` record; CircuitJS1 ignores it and uses
  its default gate diode instead.
- Why: the owner wants accurate audio parts (2026-10-14). Diode parts are listed after
  upstream's, so old files that store diode values on the element still find upstream's models.
- Golden test: none changes (no upstream circuit uses these names);
  `packages/format/src/audioParts.test.ts` checks every part against datasheet ranges and the
  save round trip.
