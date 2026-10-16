# 2026-10-16: smart editing

Branch `claude/project-thread-2yctz2`. Gady asked for "editing made smart" (drop onto a wire,
smart guides, align and spread, wire routing round parts, arrange circuit), then added
Replace with… and a part search on Space and the radial wheel.

## Done

- Drop onto a wire (`Editor.spliceIntoWire`): a two-post part dropped from the palette, drawn,
  or dragged alone so both posts land on one straight run of plain wires takes the wire's place
  between its posts. A junction between the posts leaves the wire alone (cut at the posts, as
  before). Options > Drop parts onto wires.
- Alignment guides (`editor/guides.ts`): while a part, a selection or a post is dragged, dashed
  lines run from each moving post to the nearest post in the same column and row, with a ring on
  it. Drawn in the theme's selection colour. Options > Alignment guides.
- Align and spread (`editor/align.ts`): Edit > Align submenu and a row of eight buttons in the
  inspector when two or more parts are selected: left, centres, right, top, middles, bottom,
  spread across, spread down (three or more). Wires follow the parts; a move that would change a
  connection is refused with a toast. One undo step.
- Wire routing (`editor/route.ts`): a new plain wire whose straight line would cross a part
  goes round it (A* on the grid, few bends, keeps off part bodies and doesn't turn on other
  wires). A slanted drag now draws an L, first leg the way the drag started. Alt while drawing,
  or Options > Route new wires round parts off, draws the old straight wire.
- Arrange circuit (`editor/arrange.ts`): Edit menu and empty-canvas right-click. Lays the whole
  circuit out again: signal left to right in columns from the sources, supply-hung parts on top,
  grounded parts on the bottom, sources upright with + on top, then rewires every net by A*.
  Connectivity is compared before and after; if it can't be kept the circuit is put back with a
  toast. Text follows its nearest part, boxes refit round what they held, wires a scope plots are
  swapped for a wire on the same net, stray wires that touch no part move under the circuit. Up
  to 120 parts. One undo step.
- Replace with… (`Editor.replaceWith`): right-click a part or the inspector's Replace button; a
  search lists only parts whose posts land on the same points; scopes follow the new part.
- Part search (`components/PartSearch.tsx`): Space opens a search box at the pointer (it used to
  switch to Select); Enter places the part there. The radial wheel has a search button under it.
- Strings in all 16 languages (by Claude, not native-checked).
- No file format change; nothing changes the simulation, so no deviation entry.
- Tests: `smart.test.ts`, `arrange.test.ts` (RC low-pass layout, stray wire, and a sweep over
  every bundled example: 365 arrange with connections unchanged, 8 can't be wired, 2 too big,
  1 empty; slowest about 135 ms), e2e `smart-editing.spec.ts`. Screenshots in the project folder
  `smart-editing/`.

## Next

- Gady tries it in the preview artifact.

## Open issues

- Arrange looks good on small analog circuits (filters, transistor and op-amp stages); dense
  chip circuits and LC loops (555, Colpitts) come out tidy but not always easier to read.
- Space no longer switches to Select (Esc still does).
- Guides show alignment but don't snap beyond the normal grid.
