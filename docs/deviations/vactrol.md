# Vactrol part

- Upstream: no vactrol. A light-dependent resistor (LDRElm) is set only by its slider, and the
  optocoupler has a phototransistor output, which conducts one way only.
- Ours: Active Building Blocks > Vactrol (LED + LDR), `VactrolElm`: a light source (LED or a
  small lamp) and a light-dependent resistor in one box. Model presets from datasheets
  (VTL5C1, VTL5C2, VTL5C3, VTL5C4, NSL-32SR3, and a generic lamp with LDR) or custom values:
  lit resistance at a reference current, dark resistance, slope (resistance follows
  (current / reference)^-slope), attack time (to 63 % of the final conductance) and release time
  (back up to 100 kΩ). Inside it is an upstream subcircuit: the source with a 10 Ω sense
  resistor, a VCCS charging a 1 µF "light" capacitor towards the light level (fast up, slow
  down), and a second VCCS wired across its own output as the resistor. The part draws a box with
  the glowing source, two arrows and the resistor in a circle shaded by the light level, the model
  name above and, with values shown, the resistance below in a fixed-width monospace readout.
  Properties > View Components shows the subcircuit running.
- Saved as upstream's subcircuit: a `ccm` model record named `Vactrol <preset>` (or
  `Vactrol <tag>` for custom values, a short hash of them) and a `cc` record, plus the extra XML
  attributes `vac` (preset or `Custom`), `vs`, `von`, `vi`, `vdk`, `vsl`, `vat` and `vre` on the
  `cc` record. A `cc` record with `vac` loads as a vactrol; its model is rebuilt from those
  values and kept out of the Subcircuits list.
- Why: requested by the owner (2026-10-22) for audio work (compressors, tremolo, phasers).
  Upstream ignores the extra attributes and builds the subcircuit from the model record, so the
  file opens and runs the same there, as a chip named after the model.
- Golden test: none (a new part; no upstream circuit changes).
  `packages/format/src/vactrol.test.ts` checks the VTL5C3 against its datasheet (about 1 kΩ at
  10 mA, 63 % in about 2.5 ms, 100 kΩ again about 35 ms after the light goes off), that the file
  read as a plain subcircuit gives the identical trace, the model saved once and hidden from the
  list, presets and custom values round-tripping, and the lamp source.
