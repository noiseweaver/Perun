# 2026-10-22: Speed compared with real time

Branch `claude/project-thread-ilhw7g`. Gady asked for a "% of real time or x times slower than
real time" next to the simulation speed, and picked showing both.

## Done

- Bottom bar: a readout beside `t = …`, e.g. `1.21k× slower`, `3.20× faster` or `≈ real time`.
  The factor is three significant digits with a k/M/G/T prefix in five characters
  (`speed.ts` `paceOf`, `factorText`), and the text pads to the longest of its forms in the
  interface language, so it keeps its width (owner's rule).
- Speed popover: a "Compared with real time" line under the speed slider with the factor on the
  left and the percentage on the right (`percentText`, seven characters: `0.0825`, `<0.001`).
- Measured, not only computed: `SimController.measurePace` takes simulated time per real second
  over the last second of running live (status updates every 100 ms). Within 3 % of what the
  slider and time step ask for, the readouts show the asked figure (the measurement wobbles by a
  step a second). Otherwise they show the measurement, so an adaptive time step backing off or a
  slow computer shows. When a frame ran out of its 50 ms budget and dropped steps, the popover
  says "Your computer can't keep up: the slider asks for 400× slower." and the bar readout takes
  the accent colour with the same text as its tooltip. Paused or replaying a recorded frame, the
  readouts show what the slider asks for.
- Options > "Show speed compared with real time" (setting `realTimeReadout`, on by default,
  remembered) hides both.
- Strings in all 16 languages (by Claude, not native-checked).
- Tests: `speed.test.ts` (factor, prefix carry at 999.5, widths, percentages), e2e in
  `scopes.spec.ts`. Screenshots in the project folder `real-time-readout/`.
- Nothing changes in the simulation or the file format; no deviation entry.

## Next

- Obsidian: the note blocks' Controls panel has its own speed slider (`packages/obsidian`); the
  same line could go under it once the Obsidian parity work (PR #67) is merged, through the
  shared player.

## Open

- Upstream's own info box (beside docked scopes) already adds `(0.30x)` to its `t =` line when
  the circuit runs at 10 % of real time or faster. It is the asked rate, not measured, and in
  Perun's info box the text gets clipped. Left as upstream has it.
