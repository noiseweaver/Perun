# 2026-10-14: quick pick for favorite and recent components

Branch `claude/project-thread-78ldaa`. Gady asked for usability ideas and a rethink of the part
picker; the proposal is in the project's `ideas/usability-and-part-picker.md`, and Gady picked
the quick pick strip (design A) to build first.

## Done

- `packages/app/src/quickPick.ts`: favorites (pinned, starting with Wire, Ground, Resistor,
  Capacitor, Inductor, Diode, NPN, Op Amp, Voltage Source) and recent components (newest first,
  five shown, favorites not repeated), both in localStorage. Subcircuits count too while the
  circuit has their model.
- The editor reports each placed component through a new optional `EditorHost.placed`, from a
  drag on the canvas and from a drag off the palette.
- Palette: a star after each row pins or unpins (with a mouse it shows on hover or when pinned,
  always on touch screens); the favorites and recents sit at the top of the open palette as small
  drawn buttons, hidden while searching.
- While the palette is slid away, a rail down the canvas's left edge holds the same buttons under
  the tab that brings the palette back (the tab replaces the old reveal tab, same test id).
- Phones upright: a strip between the canvas and the run controls, scrolling sideways, ending in
  a button that opens the palette. Phones on their side get the rail.
- Each button works like a palette row: click or tap arms the component, a drag carries it onto
  the canvas. `Preview` and `PaletteButton` moved to `components/PaletteButton.tsx`.
- Five new strings in all 16 languages (`i18nExtra.ts`).
- Unit tests (`quickPick.test.ts`) and e2e tests (`e2e/quickpick.spec.ts`).
- Follow-ups Gady asked for (2026-10-15): the rail folds away to its two buttons (the palette tab
  and an unfold button; remembered); Options > Quick pick bar turns the rail and the phone strip
  off (the palette tab stays); "Reorder" after the Favorites caption in the palette puts the
  favorites in order by dragging (mouse, pen or finger) or with the arrow keys. The palette shows
  the favorites on phones too, so they can be reordered there. Five more strings.

## Next

- Gady tries it in the preview artifact.
- Later picks from the proposal: the radial wheel (design B) can reuse these favorites.

## Open issues

- None known.
