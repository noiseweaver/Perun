# 2026-10-21: Option to hide the visualization legend

Branch `claude/project-thread-p2yfjg`. Gady asked for "an option to hide the legend completely".

## Done

- Options > Visualizations > Show legend (on by default, remembered with the other settings as
  `fieldLegend`). Off, the legend at the canvas's top right (the key to the field, energy, heat
  and semiconductor overlays) never shows; the overlays themselves stay as they are. The legend's
  own header still only folds it. Nothing is saved with the circuit.
- It is the only legend drawn over the canvas; the V/I chips on scope cards are controls, not
  covered by this.
- String in all 16 languages (by Claude, not native-checked).
- e2e: `params.spec.ts` turns the heat overlay on, hides the legend, reloads, and checks it stays
  hidden with the overlay still on.

## Next

- Maybe a small × on the legend header that turns the option off.

## Open issues

- None.

Obsidian: works. Circuit files open the whole app in a frame, where the switch is the same; circuits in notes have no legend card, so the setting is marked `editor` in `SETTING_USE`.
