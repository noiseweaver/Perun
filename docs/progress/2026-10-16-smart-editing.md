# 2026-10-16: smart editing

Branch `claude/project-thread-2yctz2`. Gady asked for "editing made smart" (drop onto a wire,
smart guides, align and spread, wire routing round parts, arrange circuit), then added
Replace with… and a part search on Space and the radial wheel. Arrange circuit (a full
relayout) was built and tried, then removed at Gady's request (14:19): its layouts weren't good
enough.

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
  spread across, spread down (three or more). Parts touching post to post move as one, with the
  rails, grounds and labels on their posts; wires follow; a part left behind on a post gets a
  wire. A move that would stack parts or change a connection is refused with a toast. One undo
  step.
- Wire routing (`editor/route.ts`): a new plain wire whose straight line would cross a part
  goes round it (A* on the grid, few bends, keeps off part bodies and doesn't turn on other
  wires). A slanted drag now draws an L, first leg the way the drag started. Alt while drawing,
  or Options > Route new wires round parts off, draws the old straight wire.
- Replace with… (`Editor.replaceWith`): right-click a part or the inspector's Replace button; a
  search lists only parts whose posts land on the same points; scopes follow the new part.
- Part search (`components/PartSearch.tsx`): Space opens a search box at the pointer (it used to
  switch to Select); Enter places the part there. The radial wheel has a search button under it.
- Long leads (`Editor.joinLeads`): a post placed or moved onto a long part's lead (between a
  post and its body) used to be a bad connection, as in CircuitJS1. Now the part is shortened
  about its body so its post is there, and wires fill the rest of its leads out to where its
  posts were. Same Options switch as dropping onto wires.
- Right-click on empty canvas starts with the wheel's favorites and a search button; a pick goes
  where the menu opened. Hidden when Options > Quick pick wheel is off.
- Strings in all 16 languages (by Claude, not native-checked).
- No file format change; nothing changes the simulation, so no deviation entry.
- Tests: `smart.test.ts` and e2e `smart-editing.spec.ts`. Screenshots in the project folder
  `smart-editing/`.

## Next

- Gady tries it in the preview artifact.

## Open issues

- Space no longer switches to Select (Esc still does).
- Guides show alignment but don't snap beyond the normal grid.
